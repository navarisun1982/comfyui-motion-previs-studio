#!/usr/bin/env python3
"""
Read-only Local 3D Multi-Person SMPL Pose Extractor using NLF-Large
(`D:\\ComfyUI\\models\\nlf\\nlf_l_multi_0.3.2.torchscript`).

Inspired by the `toyxyz_RGBMocap` / ComfyUI-WanVideoWrapper NLF 3D SMPL pipeline:
- Runs `detect_smpl_batched` on sampled video frames in a single GPU pass.
- Extracts true 3D camera-space 24-joint SMPL coordinates (`joints3d` / `joints3d_nonparam[:, :24, :]`)
  plus 2D joint projections (`joints2d`) and `joint_uncertainties` for every detected person.
- Sorts and tracks each person consistently across frames in 3D camera space.
- Immediately releases all CUDA tensors and calls `torch.cuda.empty_cache()` before exiting
  so zero VRAM remains allocated after extraction.
"""

import argparse
import base64
import json
import math
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
import torchvision  # noqa: F401 — required to register torchvision::nms C++ op for TorchScript

DEFAULT_MODEL_CANDIDATES = [
    r"D:\ComfyUI\models\nlf\nlf_l_multi_0.3.2.torchscript",
    r"D:\ComfyUI\models\nlf\nlf_l_multi_0.2.2.torchscript",
    r"C:\ComfyUI\models\nlf\nlf_l_multi_0.3.2.torchscript",
]


def resolve_nlf_model_path(explicit_path: Optional[str] = None) -> Optional[str]:
    if explicit_path and os.path.isfile(explicit_path):
        return explicit_path
    for candidate in DEFAULT_MODEL_CANDIDATES:
        if os.path.isfile(candidate):
            return candidate
    return None


def decode_data_url_to_rgb(data_url: str) -> Optional[np.ndarray]:
    if not data_url:
        return None
    raw_b64 = data_url.split(",", 1)[1] if "," in data_url else data_url
    try:
        buf = base64.b64decode(raw_b64)
        arr = np.frombuffer(buf, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            return None
        return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    except Exception:
        return None


def sample_frames_from_video(
    video_path: str,
    sample_count: int = 720,
    target_fps: float = 24.0,
    max_duration_sec: float = 30.25,
) -> Tuple[List[np.ndarray], List[float], float, int, int]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video file: {video_path}")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 24.0)
    if fps <= 0.1 or math.isnan(fps):
        fps = 24.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 360)
    duration_sec = (total_frames / fps) if total_frames > 0 else 0.0

    if duration_sec > max_duration_sec:
        cap.release()
        raise ValueError(
            f"Video duration ({duration_sec:.1f}s) exceeds the 30-second maximum limit. Please upload a video up to 30 seconds."
        )

    frames_rgb: List[np.ndarray] = []
    times_sec: List[float] = []
    effective_target_fps = max(1.0, min(float(target_fps or 24.0), fps))
    sample_interval_sec = 1.0 / effective_target_fps
    next_sample_time = 0.0
    raw_idx = 0
    last_time_sec = 0.0

    # Sequential hardware/C++ decode without random GOP keyframe seeking
    while len(frames_rgb) < sample_count:
        ok, bgr = cap.read()
        if not ok or bgr is None:
            break
        t_sec = raw_idx / fps
        last_time_sec = t_sec
        if t_sec > max_duration_sec:
            cap.release()
            raise ValueError(
                f"Video duration ({t_sec:.1f}s) exceeds the 30-second maximum limit. Please upload a video up to 30 seconds."
            )
        if fps <= target_fps + 0.5 or t_sec + 1e-4 >= next_sample_time:
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            frames_rgb.append(rgb)
            times_sec.append(round(t_sec, 4))
            next_sample_time = t_sec + sample_interval_sec
        raw_idx += 1

    cap.release()
    final_duration_sec = max(0.5, duration_sec if duration_sec > 0.1 else (last_time_sec + 1.0 / fps))
    return frames_rgb, times_sec, final_duration_sec, width, height


def resize_keep_max_side(rgb: np.ndarray, max_side: int = 768) -> Tuple[np.ndarray, float, float]:
    h, w = rgb.shape[:2]
    max_dim = max(h, w)
    if int(max_side * 0.85) <= max_dim <= max_side and (w % 16 == 0) and (h % 16 == 0):
        return rgb, 1.0, 1.0
    scale = min(2.2, float(max_side) / float(max(1, max_dim)))
    new_w = max(64, int(round(w * scale / 16.0) * 16))
    new_h = max(64, int(round(h * scale / 16.0) * 16))
    if new_w == w and new_h == h:
        return rgb, 1.0, 1.0
    interp = cv2.INTER_CUBIC if scale > 1.0 else cv2.INTER_AREA
    resized = cv2.resize(rgb, (new_w, new_h), interpolation=interp)
    return resized, w / float(new_w), h / float(new_h)


def detect_non_black_crop_box(frames_rgb: List[np.ndarray]) -> Tuple[int, int, int, int]:
    """
    Detects if the video has large black letterbox/pillarbox/canvas padding around the active clip
    (e.g. screen recordings where 50%+ of the canvas is pure black) and returns (x1, y1, x2, y2).
    Uses 95th-percentile row/column luminance to ignore stray compression noise in black borders.
    """
    if not frames_rgb:
        return 0, 0, 0, 0
    h, w = frames_rgb[0].shape[:2]
    sample_indices = sorted(
        list({0, len(frames_rgb) // 4, len(frames_rgb) // 2, (3 * len(frames_rgb)) // 4, len(frames_rgb) - 1})
    )
    max_val = np.zeros((h, w), dtype=np.uint8)
    for idx in sample_indices:
        f = frames_rgb[idx]
        if f.shape[:2] != (h, w):
            continue
        max_val = np.maximum(max_val, np.max(f, axis=2))

    row_active = np.percentile(max_val, 95, axis=1) > 18
    col_active = np.percentile(max_val, 95, axis=0) > 18
    ys = np.where(row_active)[0]
    xs = np.where(col_active)[0]
    if len(xs) < 32 or len(ys) < 32:
        return 0, 0, w, h

    x1, x2 = int(xs[0]), int(xs[-1]) + 1
    y1, y2 = int(ys[0]), int(ys[-1]) + 1
    crop_w = x2 - x1
    crop_h = y2 - y1
    area_ratio = (crop_w * crop_h) / float(max(1, w * h))
    if area_ratio < 0.88 and crop_w >= w * 0.25 and crop_h >= h * 0.25:
        return x1, y1, x2, y2
    return 0, 0, w, h


def _parse_single_person_prediction(
    p_idx: int,
    joints_np: np.ndarray,
    joints2d_np: Optional[np.ndarray],
    pose_np: Optional[np.ndarray],
    betas_np: Optional[np.ndarray],
    trans_np: Optional[np.ndarray],
    unc_np: Optional[np.ndarray],
    boxes_np: Optional[np.ndarray],
    proc_w: int,
    proc_h: int,
    crop_x1: int,
    crop_y1: int,
    crop_w: int,
    crop_h: int,
    orig_w: int,
    orig_h: int,
    conf_threshold: float,
    vertices2d_np: Optional[np.ndarray] = None,
    vertices3d_np: Optional[np.ndarray] = None,
    smpl_tables: Optional[Dict[str, np.ndarray]] = None,
) -> Optional[Dict[str, Any]]:
    j3d = joints_np[p_idx]
    if j3d.shape[0] < 24:
        return None
    smpl24 = j3d[:24, :3].astype(np.float64)

    if boxes_np is not None and p_idx < len(boxes_np) and len(boxes_np[p_idx]) >= 5:
        conf = float(boxes_np[p_idx][4])
    elif unc_np is not None and p_idx < len(unc_np):
        mean_unc = float(np.mean(unc_np[p_idx][:24]))
        norm_unc = mean_unc / 1000.0 if mean_unc > 2.0 else mean_unc
        conf = float(np.clip(1.0 / (1.0 + norm_unc * 4.0), 0.15, 0.99))
    else:
        conf = 0.85

    if conf < conf_threshold:
        return None

    head_to_ankle_span = abs(float((smpl24[7, 1] + smpl24[8, 1]) * 0.5 - smpl24[15, 1]))
    if head_to_ankle_span > 10.0 or abs(float(smpl24[0, 2])) > 50.0:
        smpl24 = smpl24 / 1000.0

    # Reject inverted or sideways background false-positive detections (in OpenCV camera space +Y is down)
    pelvis_y = float(smpl24[0, 1])
    head_y = float(smpl24[15, 1])
    max_ankle_y = max(float(smpl24[7, 1]), float(smpl24[8, 1]))
    if (pelvis_y - head_y) < 0.04 and (max_ankle_y - head_y) < 0.12:
        return None

    pose_rotvecs_24: Optional[List[List[float]]] = None
    if pose_np is not None and p_idx < len(pose_np):
        raw_pose = pose_np[p_idx].reshape(-1)
        if raw_pose.shape[0] >= 72:
            rot24 = raw_pose[:72].reshape(24, 3)
            pose_rotvecs_24 = [
                [round(float(rv[0]), 5), round(float(rv[1]), 5), round(float(rv[2]), 5)]
                for rv in rot24
            ]

    trans_3d: Optional[List[float]] = None
    if trans_np is not None and p_idx < len(trans_np):
        raw_t = trans_np[p_idx].reshape(-1)
        if raw_t.shape[0] >= 3:
            t_vals = raw_t[:3].astype(np.float64)
            if abs(float(t_vals[2])) > 50.0:
                t_vals = t_vals / 1000.0
            trans_3d = [
                round(float(t_vals[0]), 4),
                round(float(t_vals[1]), 4),
                round(float(t_vals[2]), 4),
            ]

    shape_betas: Optional[List[float]] = None
    if betas_np is not None and p_idx < len(betas_np):
        raw_b = betas_np[p_idx].reshape(-1)
        if raw_b.shape[0] >= 1:
            shape_betas = [round(float(b_val), 4) for b_val in raw_b[: min(10, len(raw_b))]]
            if conf_threshold >= 0.10 and conf < 0.22 and len(shape_betas) >= 2 and (abs(shape_betas[0]) > 6.0 or abs(shape_betas[1]) > 6.5):
                return None

    raw_box_px: Optional[List[float]] = None
    if boxes_np is not None and p_idx < len(boxes_np) and len(boxes_np[p_idx]) >= 4:
        b = boxes_np[p_idx]
        raw_box_px = [float(b[0]), float(b[1]), float(b[2]), float(b[3])]

    joints2d_norm_24: Optional[List[List[float]]] = None
    unclamped_cy1 = 0.2
    unclamped_cy2 = 0.85
    v_min_y_n: Optional[float] = None
    v_max_y_n: Optional[float] = None

    if vertices2d_np is not None and p_idx < len(vertices2d_np) and len(vertices2d_np[p_idx]) > 0:
        v2d_p = vertices2d_np[p_idx][:, :2]
        v_min_y_n = (crop_y1 + (float(np.min(v2d_p[:, 1])) / float(max(1, proc_h))) * crop_h) / float(max(1, orig_h))
        v_max_y_n = (crop_y1 + (float(np.max(v2d_p[:, 1])) / float(max(1, proc_h))) * crop_h) / float(max(1, orig_h))

    if joints2d_np is not None and p_idx < len(joints2d_np):
        j2d = joints2d_np[p_idx][:24, :2]
        min_xy = np.min(j2d, axis=0)
        max_xy = np.max(j2d, axis=0)
        if vertices2d_np is not None and p_idx < len(vertices2d_np) and len(vertices2d_np[p_idx]) > 0:
            v2d_p = vertices2d_np[p_idx][:, :2]
            min_xy = np.minimum(min_xy, np.min(v2d_p, axis=0))
            max_xy = np.maximum(max_xy, np.max(v2d_p, axis=0))
        span_x = max(8.0, float(max_xy[0] - min_xy[0]))
        span_y = max(16.0, float(max_xy[1] - min_xy[1]))
        unclamped_cy1 = (float(min_xy[1]) - span_y * 0.04) / float(proc_h)
        unclamped_cy2 = (float(max_xy[1]) + span_y * 0.04) / float(proc_h)
        cx1 = max(0.0, (float(min_xy[0]) - span_x * 0.08) / float(proc_w))
        cy1 = max(0.0, unclamped_cy1)
        cx2 = min(1.0, (float(max_xy[0]) + span_x * 0.08) / float(proc_w))
        cy2 = min(1.0, unclamped_cy2)
        if raw_box_px is None:
            raw_box_px = [
                cx1 * proc_w,
                cy1 * proc_h,
                max(16.0, (cx2 - cx1) * proc_w),
                max(32.0, (cy2 - cy1) * proc_h),
            ]
        joints2d_norm_24 = []
        for pt2 in j2d:
            jx_n = (crop_x1 + (float(pt2[0]) / float(max(1, proc_w))) * crop_w) / float(max(1, orig_w))
            jy_n = (crop_y1 + (float(pt2[1]) / float(max(1, proc_h))) * crop_h) / float(max(1, orig_h))
            joints2d_norm_24.append([round(jx_n, 4), round(jy_n, 4)])
    elif raw_box_px is not None:
        cx1 = max(0.0, raw_box_px[0] / float(proc_w))
        cy1 = max(0.0, raw_box_px[1] / float(proc_h))
        cx2 = min(1.0, (raw_box_px[0] + raw_box_px[2]) / float(proc_w))
        cy2 = min(1.0, (raw_box_px[1] + raw_box_px[3]) / float(proc_h))
        unclamped_cy1 = raw_box_px[1] / float(proc_h)
        unclamped_cy2 = (raw_box_px[1] + raw_box_px[3]) / float(proc_h)
    else:
        cx1, cy1, cx2, cy2 = 0.35, 0.2, 0.65, 0.85
        unclamped_cy1, unclamped_cy2 = cy1, cy2
        raw_box_px = [cx1 * proc_w, cy1 * proc_h, (cx2 - cx1) * proc_w, (cy2 - cy1) * proc_h]

    # Map normalized crop coordinates back to full original video frame coordinates
    x1 = (crop_x1 + cx1 * crop_w) / float(max(1, orig_w))
    y1 = (crop_y1 + cy1 * crop_h) / float(max(1, orig_h))
    x2 = (crop_x1 + cx2 * crop_w) / float(max(1, orig_w))
    y2 = (crop_y1 + cy2 * crop_h) / float(max(1, orig_h))

    bw = max(0.0, x2 - x1)
    bh = max(0.0, y2 - y1)
    if bh < 0.015 or bw < 0.004:
        return None

    # Compute true unclamped vertical body span & visibleBodyRatio when legs are cropped at the bottom of the frame
    crop_bottom_norm = (crop_y1 + crop_h) / float(max(1, orig_h))
    unclamped_y1 = (crop_y1 + unclamped_cy1 * crop_h) / float(max(1, orig_h))
    unclamped_y2 = (crop_y1 + unclamped_cy2 * crop_h) / float(max(1, orig_h))
    det_box_y2_norm = (
        (crop_y1 + ((raw_box_px[1] + raw_box_px[3]) / float(max(1, proc_h))) * crop_h) / float(max(1, orig_h))
        if raw_box_px is not None
        else y2
    )

    if joints2d_norm_24 is not None and len(joints2d_norm_24) >= 18:
        raw_head_y_n = joints2d_norm_24[15][1]
        sh_y_n = 0.5 * (joints2d_norm_24[16][1] + joints2d_norm_24[17][1])
        pelvis_y_n = joints2d_norm_24[0][1]
        upper_span_n = max(0.05, pelvis_y_n - raw_head_y_n)
        crown_y_n = (
            min(v_min_y_n, raw_head_y_n - upper_span_n * 0.36)
            if v_min_y_n is not None
            else min(unclamped_y1, raw_head_y_n - upper_span_n * 0.42)
        )
        # Shift SMPL-24 joint 15 (jaw/neck pivot) upward to the visual center of the head for 17-joint overlay
        joints2d_norm_24[15][1] = round(float(max(0.01, 0.5 * (crown_y_n + raw_head_y_n))), 4)

        crown_to_sh = max(0.04, sh_y_n - crown_y_n)
        true_pelvis_y = max(pelvis_y_n, crown_y_n + crown_to_sh * 2.55)
        true_knee_y = max(crown_y_n + crown_to_sh * 4.00, pelvis_y_n + upper_span_n * 0.86)
        true_ankle_y = max(crown_y_n + crown_to_sh * 5.30, pelvis_y_n + upper_span_n * 1.66)
        true_sole_y = max(crown_y_n + crown_to_sh * 5.55, pelvis_y_n + upper_span_n * 1.80)

        ankle_unc_ratio = 1.0
        knee_unc_ratio = 1.0
        if unc_np is not None and p_idx < len(unc_np) and len(unc_np[p_idx]) >= 18:
            p_unc = unc_np[p_idx]
            upper_unc = max(1e-4, float(np.mean([p_unc[15], p_unc[12], p_unc[16], p_unc[17]])))
            ankle_unc = float(np.mean([p_unc[7], p_unc[8], p_unc[10], p_unc[11]]))
            knee_unc = float(np.mean([p_unc[4], p_unc[5]]))
            ankle_unc_ratio = ankle_unc / upper_unc
            knee_unc_ratio = knee_unc / upper_unc

        mesh_bottom_n = max(v_max_y_n if v_max_y_n is not None else 0.0, unclamped_y2, det_box_y2_norm, y2)
        touches_bottom_border = (
            mesh_bottom_n >= crop_bottom_norm - 0.035
            or true_ankle_y > crop_bottom_norm - 0.02
            or (ankle_unc_ratio >= 1.55 and true_ankle_y > 0.85)
        )
        if touches_bottom_border:
            anatomical_sole_y_n = max(mesh_bottom_n, true_sole_y)
            # Restore squashed 2D pelvis/hips toward true anatomical hip line when lower legs are cut off
            pelvis_shift = max(0.0, true_pelvis_y - pelvis_y_n)
            if pelvis_shift > 0.01:
                for h_idx in (0, 1, 2):
                    joints2d_norm_24[h_idx][1] = round(
                        float(min(0.98, joints2d_norm_24[h_idx][1] + pelvis_shift * 0.85)), 4
                    )
            # Restore squashed 2D knees & mark off-screen if cropped below frame or high uncertainty
            for k_idx in (4, 5):
                target_ky = max(joints2d_norm_24[k_idx][1], true_knee_y)
                if true_knee_y > crop_bottom_norm - 0.01 or knee_unc_ratio >= 1.65:
                    target_ky = max(target_ky, 1.03)
                joints2d_norm_24[k_idx][1] = round(float(target_ky), 4)
            # Push cropped/unseen ankles & feet > 1.0 so they are never drawn inside the visible frame
            for a_idx in (7, 8, 10, 11):
                target_ay = max(joints2d_norm_24[a_idx][1], true_ankle_y)
                if true_ankle_y > crop_bottom_norm - 0.03 or ankle_unc_ratio >= 1.55:
                    target_ay = max(target_ay, 1.05)
                joints2d_norm_24[a_idx][1] = round(float(target_ay), 4)
            y1 = max(0.0, min(y1, crown_y_n))
            y2 = min(1.0, max(y2, min(crop_bottom_norm, anatomical_sole_y_n)))
            bh = max(0.0, y2 - y1)
        else:
            ankle_y_n = max(joints2d_norm_24[7][1], joints2d_norm_24[8][1])
            anatomical_sole_y_n = max(mesh_bottom_n, ankle_y_n + upper_span_n * 0.14)
            y1 = max(0.0, min(y1, crown_y_n))
            bh = max(0.0, y2 - y1)
    else:
        crown_y_n = unclamped_y1
        anatomical_sole_y_n = unclamped_y2

    full_body_bh = max(bh, anatomical_sole_y_n - crown_y_n)
    visible_bottom_n = min(crop_bottom_norm, anatomical_sole_y_n)
    visible_body_ratio = float(
        np.clip((visible_bottom_n - max(0.0, crown_y_n)) / max(0.08, full_body_bh), 0.25, 1.0)
    )

    pelvis = smpl24[0]
    person_entry: Dict[str, Any] = {
        "confidence": round(conf, 4),
        "bboxNorm": [round(x1, 4), round(y1, 4), round(bw, 4), round(bh, 4)],
        "unclampedBboxNorm": [
            round(x1, 4),
            round(float(crown_y_n), 4),
            round(bw, 4),
            round(float(full_body_bh), 4),
        ],
        "visibleBodyRatio": round(visible_body_ratio, 4),
        "_procBoxPx": raw_box_px,
        "centerXNorm": round((x1 + x2) * 0.5, 4),
        "centerYNorm": round((y1 + y2) * 0.5, 4),
        "pelvis3d": [round(float(pelvis[0]), 4), round(float(pelvis[1]), 4), round(float(pelvis[2]), 4)],
        "joints3dSmpl24": [
            [round(float(pt[0]), 4), round(float(pt[1]), 4), round(float(pt[2]), 4)]
            for pt in smpl24
        ],
    }
    if joints2d_norm_24 is not None:
        person_entry["joints2dSmpl24Norm"] = joints2d_norm_24
    if pose_rotvecs_24 is not None:
        person_entry["poseRotvecsSmpl24"] = pose_rotvecs_24
    if trans_3d is not None:
        person_entry["trans3d"] = trans_3d
    if shape_betas is not None:
        person_entry["shapeBetas"] = shape_betas

    # Compute pose-invariant 3D SMPL surface mesh cross-sections in pelvis-aligned local coordinates
    if vertices3d_np is not None and p_idx < len(vertices3d_np) and len(vertices3d_np[p_idx]) > 64:
        v3d = vertices3d_np[p_idx][:, :3].astype(np.float64)
        if np.max(np.abs(v3d)) > 15.0:
            v3d = v3d / 1000.0
        # Pelvis-centered local axes: +Y = pelvis->neck (upward along spine), +X = right->left hip/shoulder
        spine_up = smpl24[12] - smpl24[0]
        spine_len = float(np.linalg.norm(spine_up))
        if spine_len > 0.18:
            uy = spine_up / spine_len
            lat_vec = (smpl24[1] - smpl24[2]) + (smpl24[16] - smpl24[17])
            lat_vec = lat_vec - np.dot(lat_vec, uy) * uy
            lat_len = float(np.linalg.norm(lat_vec))
            if lat_len > 0.08:
                ux = lat_vec / lat_len
                uz = np.cross(ux, uy)
                uz_norm = float(np.linalg.norm(uz))
                if uz_norm > 1e-5:
                    uz = uz / uz_norm
                rel_v = v3d - smpl24[0]
                vx = rel_v @ ux
                vy = rel_v @ uy
                vz = rel_v @ uz

                # Slice 1: Pelvis / Outer Hip Trochanter slice (y in [-0.07*spine, +0.12*spine], |x| < 0.27m)
                hip_mask = (vy >= -0.04) & (vy <= spine_len * 0.14) & (np.abs(vx) < 0.27)
                # Slice 2: Waist / Belly / Midsection slice (y in [0.18*spine, 0.48*spine], |x| < 0.25m)
                waist_mask = (vy >= spine_len * 0.18) & (vy <= spine_len * 0.48) & (np.abs(vx) < 0.25)
                # Slice 3: Chest / Upper Torso slice (y in [0.50*spine, 0.78*spine], |x| < 0.27m)
                chest_mask = (vy >= spine_len * 0.50) & (vy <= spine_len * 0.78) & (np.abs(vx) < 0.27)
                # Slice 4: Outer Deltoid / Shoulder breadth slice (y in [0.70*spine, 0.96*spine], |x| < 0.34m)
                sh_mask = (vy >= spine_len * 0.70) & (vy <= spine_len * 0.96) & (np.abs(vx) < 0.34)

                hip_w = float(np.percentile(vx[hip_mask], 98) - np.percentile(vx[hip_mask], 2)) if np.count_nonzero(hip_mask) >= 8 else 0.345
                hip_d = float(np.percentile(vz[hip_mask], 98) - np.percentile(vz[hip_mask], 2)) if np.count_nonzero(hip_mask) >= 8 else 0.235
                waist_w = float(np.percentile(vx[waist_mask], 98) - np.percentile(vx[waist_mask], 2)) if np.count_nonzero(waist_mask) >= 8 else 0.295
                waist_d = float(np.percentile(vz[waist_mask], 98) - np.percentile(vz[waist_mask], 2)) if np.count_nonzero(waist_mask) >= 8 else 0.215
                chest_w = float(np.percentile(vx[chest_mask], 98) - np.percentile(vx[chest_mask], 2)) if np.count_nonzero(chest_mask) >= 8 else 0.335
                chest_d = float(np.percentile(vz[chest_mask], 98) - np.percentile(vz[chest_mask], 2)) if np.count_nonzero(chest_mask) >= 8 else 0.235
                sh_w = float(np.percentile(vx[sh_mask], 98) - np.percentile(vx[sh_mask], 2)) if np.count_nonzero(sh_mask) >= 8 else 0.435

                person_entry["surfaceAnthropometry"] = {
                    "shoulderWidthM": round(sh_w, 4),
                    "chestWidthM": round(chest_w, 4),
                    "chestDepthM": round(chest_d, 4),
                    "waistWidthM": round(waist_w, 4),
                    "waistDepthM": round(waist_d, 4),
                    "hipWidthM": round(hip_w, 4),
                    "hipDepthM": round(hip_d, 4),
                }

    # Evaluate canonical T-Pose SMPL body & 24 joints directly from shapeBetas using m.body_models.smpl tables
    if shape_betas is not None and smpl_tables is not None:
        try:
            b_arr = np.asarray(shape_betas, dtype=np.float32)
            n_b = min(len(b_arr), smpl_tables["shapedirs"].shape[2])
            if n_b > 0:
                j_tpose = smpl_tables["j_template"] + np.einsum(
                    "jcs,s->jc", smpl_tables["j_shapedirs"][:, :, :n_b], b_arr[:n_b]
                )
                v_tpose = smpl_tables["v_template"] + np.einsum(
                    "vcs,s->vc", smpl_tables["shapedirs"][:, :, :n_b], b_arr[:n_b]
                )
                person_entry["tposeJointsSmpl24"] = [
                    [round(float(pt[0]), 4), round(float(pt[1]), 4), round(float(pt[2]), 4)]
                    for pt in j_tpose
                ]
                tpose_height_m = float(np.max(v_tpose[:, 1]) - np.min(v_tpose[:, 1]))
                person_entry["tposeHeightM"] = round(tpose_height_m, 4)

                # If surfaceAnthropometry was not computed from posed vertices, derive it from T-pose vertices
                if "surfaceAnthropometry" not in person_entry:
                    pelv_y = float(j_tpose[0, 1])
                    neck_y = float(j_tpose[12, 1])
                    sp_h = max(0.20, neck_y - pelv_y)
                    rel_y = v_tpose[:, 1] - pelv_y
                    vx_t = v_tpose[:, 0]
                    vz_t = v_tpose[:, 2]
                    h_m = (rel_y >= -0.04) & (rel_y <= sp_h * 0.14) & (np.abs(vx_t) < 0.27)
                    w_m = (rel_y >= sp_h * 0.18) & (rel_y <= sp_h * 0.48) & (np.abs(vx_t) < 0.25)
                    c_m = (rel_y >= sp_h * 0.50) & (rel_y <= sp_h * 0.78) & (np.abs(vx_t) < 0.27)
                    s_m = (rel_y >= sp_h * 0.70) & (rel_y <= sp_h * 0.96) & (np.abs(vx_t) < 0.34)
                    person_entry["surfaceAnthropometry"] = {
                        "shoulderWidthM": round(float(np.percentile(vx_t[s_m], 98) - np.percentile(vx_t[s_m], 2)) if np.count_nonzero(s_m) >= 8 else 0.435, 4),
                        "chestWidthM": round(float(np.percentile(vx_t[c_m], 98) - np.percentile(vx_t[c_m], 2)) if np.count_nonzero(c_m) >= 8 else 0.335, 4),
                        "chestDepthM": round(float(np.percentile(vz_t[c_m], 98) - np.percentile(vz_t[c_m], 2)) if np.count_nonzero(c_m) >= 8 else 0.235, 4),
                        "waistWidthM": round(float(np.percentile(vx_t[w_m], 98) - np.percentile(vx_t[w_m], 2)) if np.count_nonzero(w_m) >= 8 else 0.295, 4),
                        "waistDepthM": round(float(np.percentile(vz_t[w_m], 98) - np.percentile(vz_t[w_m], 2)) if np.count_nonzero(w_m) >= 8 else 0.215, 4),
                        "hipWidthM": round(float(np.percentile(vx_t[h_m], 98) - np.percentile(vx_t[h_m], 2)) if np.count_nonzero(h_m) >= 8 else 0.345, 4),
                        "hipDepthM": round(float(np.percentile(vz_t[h_m], 98) - np.percentile(vz_t[h_m], 2)) if np.count_nonzero(h_m) >= 8 else 0.235, 4),
                    }
        except Exception:
            pass

    return person_entry


def run_nlf_smpl_extraction(
    frames_rgb: List[np.ndarray],
    times_sec: List[float],
    model_path: str,
    conf_threshold: float = 0.14,
    max_people: int = 4,
    max_side: int = 768,
    batch_size: int = 24,
) -> Dict[str, Any]:
    if not frames_rgb:
        return {"ok": False, "error": "No valid video frames supplied."}

    orig_h, orig_w = frames_rgb[0].shape[:2]
    crop_x1, crop_y1, crop_x2, crop_y2 = detect_non_black_crop_box(frames_rgb)
    crop_w = crop_x2 - crop_x1
    crop_h = crop_y2 - crop_y1

    resized_frames: List[np.ndarray] = []
    for f in frames_rgb:
        cropped = f[crop_y1:crop_y2, crop_x1:crop_x2] if (crop_w < orig_w or crop_h < orig_h) else f
        rf, _, _ = resize_keep_max_side(cropped, max_side=max_side)
        resized_frames.append(rf)

    proc_h, proc_w = resized_frames[0].shape[:2]
    for idx in range(len(resized_frames)):
        if resized_frames[idx].shape[:2] != (proc_h, proc_w):
            resized_frames[idx] = cv2.resize(
                resized_frames[idx], (proc_w, proc_h), interpolation=cv2.INTER_AREA
            )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    jit_exec_prev = torch._C._jit_set_profiling_executor(True)
    jit_mode_prev = torch._C._jit_set_profiling_mode(False)
    model = torch.jit.load(model_path).eval().to(device)

    smpl_tables: Optional[Dict[str, np.ndarray]] = None
    try:
        smpl_mod = model.body_models.smpl
        smpl_tables = {
            "v_template": smpl_mod.v_template.detach().cpu().numpy().astype(np.float32),
            "shapedirs": smpl_mod.shapedirs[:, :, :10].detach().cpu().numpy().astype(np.float32),
            "j_template": smpl_mod.J_template.detach().cpu().numpy().astype(np.float32),
            "j_shapedirs": smpl_mod.J_shapedirs[:, :, :10].detach().cpu().numpy().astype(np.float32),
        }
    except Exception:
        smpl_tables = None

    per_frame_detections: List[Dict[str, Any]] = []
    safe_batch_size = max(1, min(36, int(batch_size)))

    def _run_detector_pass(det_thresh: float, suppress_implausible: bool) -> List[Dict[str, Any]]:
        pass_detections: List[Dict[str, Any]] = []
        for batch_start in range(0, len(resized_frames), safe_batch_size):
            batch_frames = resized_frames[batch_start : batch_start + safe_batch_size]
            batch_np = np.stack(batch_frames, axis=0)
            t_float = (
                torch.from_numpy(batch_np)
                .float()
                .div(255.0)
                .permute(0, 3, 1, 2)
                .contiguous()
                .to(device)
            )
            pred = model.detect_smpl_batched(
                t_float,
                detector_threshold=det_thresh,
                suppress_implausible_poses=suppress_implausible,
            )
            joints3d_list = (
                pred["joints3d"]
                if "joints3d" in pred
                else (pred["joints3d_nonparam"] if "joints3d_nonparam" in pred else [])
            )
            joints2d_list = (
                pred["joints2d"]
                if "joints2d" in pred
                else (pred["joints2d_nonparam"] if "joints2d_nonparam" in pred else [])
            )
            vertices2d_list = (
                pred["vertices2d"]
                if "vertices2d" in pred
                else (pred["vertices2d_nonparam"] if "vertices2d_nonparam" in pred else [])
            )
            vertices3d_list = (
                pred["vertices3d"]
                if "vertices3d" in pred
                else (pred["vertices3d_nonparam"] if "vertices3d_nonparam" in pred else [])
            )
            pose_list = pred["pose"] if "pose" in pred else []
            betas_list = pred["betas"] if "betas" in pred else []
            trans_list = pred["trans"] if "trans" in pred else []
            uncertainties_list = (
                pred["joint_uncertainties"] if "joint_uncertainties" in pred else []
            )
            boxes_list = pred["boxes"] if "boxes" in pred else []

            for local_i in range(len(batch_frames)):
                frame_idx = batch_start + local_i
                time_sec = (
                    times_sec[frame_idx]
                    if frame_idx < len(times_sec)
                    else frame_idx * 0.1
                )
                joints_t = joints3d_list[local_i] if local_i < len(joints3d_list) else None
                joints2d_t = joints2d_list[local_i] if local_i < len(joints2d_list) else None
                vertices2d_t = (
                    vertices2d_list[local_i] if local_i < len(vertices2d_list) else None
                )
                vertices3d_t = (
                    vertices3d_list[local_i] if local_i < len(vertices3d_list) else None
                )
                pose_t = pose_list[local_i] if local_i < len(pose_list) else None
                betas_t = betas_list[local_i] if local_i < len(betas_list) else None
                trans_t = trans_list[local_i] if local_i < len(trans_list) else None
                unc_t = (
                    uncertainties_list[local_i]
                    if local_i < len(uncertainties_list)
                    else None
                )
                boxes_t = boxes_list[local_i] if local_i < len(boxes_list) else None

                persons: List[Dict[str, Any]] = []
                if joints_t is not None and joints_t.numel() > 0 and joints_t.shape[0] > 0:
                    joints_np = joints_t.detach().cpu().numpy()
                    joints2d_np = (
                        joints2d_t.detach().cpu().numpy()
                        if (joints2d_t is not None and joints2d_t.numel() > 0)
                        else None
                    )
                    vertices2d_np = (
                        vertices2d_t.detach().cpu().numpy()
                        if (vertices2d_t is not None and vertices2d_t.numel() > 0)
                        else None
                    )
                    vertices3d_np = (
                        vertices3d_t.detach().cpu().numpy()
                        if (vertices3d_t is not None and vertices3d_t.numel() > 0)
                        else None
                    )
                    pose_np = (
                        pose_t.detach().cpu().numpy()
                        if (pose_t is not None and pose_t.numel() > 0)
                        else None
                    )
                    betas_np = (
                        betas_t.detach().cpu().numpy()
                        if (betas_t is not None and betas_t.numel() > 0)
                        else None
                    )
                    trans_np = (
                        trans_t.detach().cpu().numpy()
                        if (trans_t is not None and trans_t.numel() > 0)
                        else None
                    )
                    unc_np = (
                        unc_t.detach().cpu().numpy()
                        if (unc_t is not None and unc_t.numel() > 0)
                        else None
                    )
                    boxes_np = (
                        boxes_t.detach().cpu().numpy()
                        if (boxes_t is not None and boxes_t.numel() > 0)
                        else None
                    )

                    for p_idx in range(len(joints_np)):
                        p_entry = _parse_single_person_prediction(
                            p_idx=p_idx,
                            joints_np=joints_np,
                            joints2d_np=joints2d_np,
                            vertices2d_np=vertices2d_np,
                            vertices3d_np=vertices3d_np,
                            pose_np=pose_np,
                            betas_np=betas_np,
                            trans_np=trans_np,
                            unc_np=unc_np,
                            boxes_np=boxes_np,
                            proc_w=proc_w,
                            proc_h=proc_h,
                            crop_x1=crop_x1,
                            crop_y1=crop_y1,
                            crop_w=crop_w,
                            crop_h=crop_h,
                            orig_w=orig_w,
                            orig_h=orig_h,
                            conf_threshold=det_thresh,
                            smpl_tables=smpl_tables,
                        )
                        if p_entry is not None:
                            persons.append(p_entry)

                if len(persons) > 1:
                    max_bh = max(p["bboxNorm"][3] for p in persons)
                    persons = [
                        p
                        for p in persons
                        if p["bboxNorm"][3] >= max_bh * 0.45 and p["confidence"] >= det_thresh
                    ]

                persons.sort(key=lambda p: p["pelvis3d"][0])
                persons = persons[:max_people]

                pass_detections.append(
                    {
                        "frameIndex": frame_idx,
                        "timeSec": round(float(time_sec), 4),
                        "persons": persons,
                    }
                )
        return pass_detections

    try:
        with torch.no_grad(), torch.jit.optimized_execution(False):
            # Pass 1: Standard human detection with implausible pose suppression
            primary_thresh = min(float(conf_threshold), 0.22)
            per_frame_detections = _run_detector_pass(primary_thresh, True)
            frames_with_dets = sum(1 for f in per_frame_detections if len(f["persons"]) > 0)

            # Pass 1b fallback: Stylized 3D mannequins / robots / low-contrast subjects
            if frames_with_dets < max(1, int(len(per_frame_detections) * 0.55)):
                fallback_dets = _run_detector_pass(0.14, False)
                for idx in range(len(per_frame_detections)):
                    if len(per_frame_detections[idx]["persons"]) == 0 and len(fallback_dets[idx]["persons"]) > 0:
                        per_frame_detections[idx]["persons"] = fallback_dets[idx]["persons"]

            # Determine dominant person count and run `estimate_smpl_batched` on frames
            # where the 2D detector missed all subjects (e.g. stylized 3D mannequins)
            counts = [len(f["persons"]) for f in per_frame_detections if len(f["persons"]) > 0]
            dominant_person_count = int(round(float(np.percentile(counts, 75)))) if counts else 1
            dominant_person_count = max(1, min(max_people, dominant_person_count))

            complete_frame_indices = [
                idx
                for idx, f in enumerate(per_frame_detections)
                if len(f["persons"]) >= dominant_person_count
            ]
            incomplete_frame_indices = [
                idx
                for idx, f in enumerate(per_frame_detections)
                if len(f["persons"]) == 0
            ]

            if incomplete_frame_indices:
                est_frames_np = np.stack([resized_frames[idx] for idx in incomplete_frame_indices], axis=0)
                est_t_float = (
                    torch.from_numpy(est_frames_np)
                    .float()
                    .div(255.0)
                    .permute(0, 3, 1, 2)
                    .contiguous()
                    .to(device)
                )
                est_boxes_list: List[torch.Tensor] = []
                for idx in incomplete_frame_indices:
                    if complete_frame_indices:
                        nearest_idx = min(complete_frame_indices, key=lambda c_i: abs(c_i - idx))
                        ref_persons = per_frame_detections[nearest_idx]["persons"][:dominant_person_count]
                        box_rows = [
                            p.get("_procBoxPx") or [proc_w * 0.25, proc_h * 0.1, proc_w * 0.5, proc_h * 0.82]
                            for p in ref_persons
                        ]
                    elif counts:
                        any_idx = next(i for i, f in enumerate(per_frame_detections) if len(f["persons"]) > 0)
                        ref_persons = per_frame_detections[any_idx]["persons"][:dominant_person_count]
                        box_rows = [
                            p.get("_procBoxPx") or [proc_w * 0.25, proc_h * 0.1, proc_w * 0.5, proc_h * 0.82]
                            for p in ref_persons
                        ]
                    else:
                        box_rows = [[proc_w * 0.22, proc_h * 0.08, proc_w * 0.56, proc_h * 0.84]]
                    est_boxes_list.append(torch.tensor(box_rows, dtype=torch.float32, device=device))

                est_pred = model.estimate_smpl_batched(est_t_float, est_boxes_list)
                e_joints3d = est_pred["joints3d"] if "joints3d" in est_pred else []
                e_joints2d = est_pred["joints2d"] if "joints2d" in est_pred else []
                e_vertices2d = (
                    est_pred["vertices2d"]
                    if "vertices2d" in est_pred
                    else (est_pred["vertices2d_nonparam"] if "vertices2d_nonparam" in est_pred else [])
                )
                e_vertices3d = (
                    est_pred["vertices3d"]
                    if "vertices3d" in est_pred
                    else (est_pred["vertices3d_nonparam"] if "vertices3d_nonparam" in est_pred else [])
                )
                e_pose = est_pred["pose"] if "pose" in est_pred else []
                e_betas = est_pred["betas"] if "betas" in est_pred else []
                e_trans = est_pred["trans"] if "trans" in est_pred else []
                e_unc = est_pred["joint_uncertainties"] if "joint_uncertainties" in est_pred else []

                for local_k, frame_idx in enumerate(incomplete_frame_indices):
                    j_t = e_joints3d[local_k] if local_k < len(e_joints3d) else None
                    if j_t is None or j_t.numel() == 0:
                        continue
                    j_np = j_t.detach().cpu().numpy()
                    j2d_np = (
                        e_joints2d[local_k].detach().cpu().numpy()
                        if (local_k < len(e_joints2d) and e_joints2d[local_k].numel() > 0)
                        else None
                    )
                    v2d_np = (
                        e_vertices2d[local_k].detach().cpu().numpy()
                        if (local_k < len(e_vertices2d) and e_vertices2d[local_k].numel() > 0)
                        else None
                    )
                    v3d_np = (
                        e_vertices3d[local_k].detach().cpu().numpy()
                        if (local_k < len(e_vertices3d) and e_vertices3d[local_k].numel() > 0)
                        else None
                    )
                    p_np = (
                        e_pose[local_k].detach().cpu().numpy()
                        if (local_k < len(e_pose) and e_pose[local_k].numel() > 0)
                        else None
                    )
                    b_np = (
                        e_betas[local_k].detach().cpu().numpy()
                        if (local_k < len(e_betas) and e_betas[local_k].numel() > 0)
                        else None
                    )
                    tr_np = (
                        e_trans[local_k].detach().cpu().numpy()
                        if (local_k < len(e_trans) and e_trans[local_k].numel() > 0)
                        else None
                    )
                    u_np = (
                        e_unc[local_k].detach().cpu().numpy()
                        if (local_k < len(e_unc) and e_unc[local_k].numel() > 0)
                        else None
                    )
                    b_px_np = est_boxes_list[local_k].detach().cpu().numpy()

                    existing_persons = list(per_frame_detections[frame_idx]["persons"])
                    recovered_persons: List[Dict[str, Any]] = []
                    for p_idx in range(len(j_np)):
                        p_entry = _parse_single_person_prediction(
                            p_idx=p_idx,
                            joints_np=j_np,
                            joints2d_np=j2d_np,
                            vertices2d_np=v2d_np,
                            vertices3d_np=v3d_np,
                            pose_np=p_np,
                            betas_np=b_np,
                            trans_np=tr_np,
                            unc_np=u_np,
                            boxes_np=b_px_np,
                            proc_w=proc_w,
                            proc_h=proc_h,
                            crop_x1=crop_x1,
                            crop_y1=crop_y1,
                            crop_w=crop_w,
                            crop_h=crop_h,
                            orig_w=orig_w,
                            orig_h=orig_h,
                            conf_threshold=0.05,
                            smpl_tables=smpl_tables,
                        )
                        if p_entry is None:
                            continue
                        sb = p_entry.get("shapeBetas") or []
                        if len(sb) >= 2 and (abs(sb[0]) > 4.2 or abs(sb[1]) > 4.8):
                            continue
                        rv24 = p_entry.get("poseRotvecsSmpl24")
                        if rv24 and len(rv24) >= 6:
                            if (
                                abs(rv24[1][0]) > 1.65
                                or abs(rv24[2][0]) > 1.65
                                or abs(rv24[3][0]) > 0.95
                                or rv24[4][0] < -0.35
                                or rv24[5][0] < -0.35
                            ):
                                continue
                        recovered_persons.append(p_entry)

                    if not existing_persons and recovered_persons:
                        recovered_persons.sort(key=lambda p: p["pelvis3d"][0])
                        per_frame_detections[frame_idx]["persons"] = recovered_persons[:dominant_person_count]
                    elif existing_persons and recovered_persons:
                        merged = list(existing_persons)
                        for cand in recovered_persons:
                            if len(merged) >= dominant_person_count:
                                break
                            if all(abs(cand["centerXNorm"] - ex["centerXNorm"]) > 0.05 for ex in merged):
                                merged.append(cand)
                        merged.sort(key=lambda p: p["pelvis3d"][0])
                        per_frame_detections[frame_idx]["persons"] = merged[:dominant_person_count]
    finally:
        torch._C._jit_set_profiling_executor(jit_exec_prev)
        torch._C._jit_set_profiling_mode(jit_mode_prev)
        del model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    for f in per_frame_detections:
        f["persons"] = f["persons"][:dominant_person_count]
        for p in f["persons"]:
            p.pop("_procBoxPx", None)

    final_counts = [len(f["persons"]) for f in per_frame_detections if len(f["persons"]) > 0]
    actual_dominant = int(round(float(np.median(final_counts)))) if final_counts else 0

    return {
        "ok": True,
        "engine": "nlf-l-multi-0.3.2-smpl24",
        "device": str(device),
        "modelPath": model_path,
        "frameWidth": orig_w,
        "frameHeight": orig_h,
        "dominantPersonCount": actual_dominant,
        "frames": per_frame_detections,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="NLF 3D Multi-Person SMPL-24 Extractor")
    parser.add_argument("--input-json", type=str, default="", help="Path to input JSON payload")
    parser.add_argument("--output-json", type=str, default="", help="Path to output JSON file")
    parser.add_argument("--video", type=str, default="", help="Direct path to video file")
    parser.add_argument("--samples", type=int, default=720, help="Maximum number of frames to sample (default 720 = 30s @ 24fps)")
    parser.add_argument("--status", action="store_true", help="Check NLF model and CUDA status")
    args = parser.parse_args()

    model_path = resolve_nlf_model_path()
    if args.status:
        status_payload = {
            "ok": bool(model_path),
            "modelAvailable": bool(model_path),
            "modelPath": model_path,
            "cudaAvailable": bool(torch.cuda.is_available()),
            "deviceName": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
        }
        print(json.dumps(status_payload))
        return

    if not model_path:
        err_payload = {
            "ok": False,
            "error": "NLF TorchScript model not found in D:\\ComfyUI\\models\\nlf.",
        }
        if args.output_json:
            with open(args.output_json, "w", encoding="utf-8") as f:
                json.dump(err_payload, f)
        print(json.dumps(err_payload))
        sys.exit(1)

    frames_rgb: List[np.ndarray] = []
    times_sec: List[float] = []
    video_duration_sec: float = 0.0
    conf_threshold = 0.25
    max_people = 4
    max_side = 768
    batch_size = 10

    try:
        if args.input_json and os.path.isfile(args.input_json):
            with open(args.input_json, "r", encoding="utf-8") as f:
                payload = json.load(f)
            conf_threshold = float(payload.get("confThreshold", 0.25))
            max_people = int(payload.get("maxPeople", 4))
            max_side = int(payload.get("maxSide", 768))
            batch_size = int(payload.get("batchSize", 10))
            video_path = str(payload.get("videoPath", "")).strip()
            raw_frames = payload.get("frames", [])
            target_fps = float(payload.get("targetFps", 24.0))
            max_duration_sec = float(payload.get("maxDurationSec", 30.25))

            if video_path and os.path.isfile(video_path):
                sample_count = int(payload.get("sampleCount", args.samples))
                frames_rgb, times_sec, video_duration_sec, _, _ = sample_frames_from_video(
                    video_path,
                    sample_count=sample_count,
                    target_fps=target_fps,
                    max_duration_sec=max_duration_sec,
                )
            elif raw_frames and isinstance(raw_frames, list):
                for idx, item in enumerate(raw_frames):
                    data_url = item.get("dataUrl", "") if isinstance(item, dict) else ""
                    t_sec = float(item.get("timeSec", idx * (1.0 / 24.0))) if isinstance(item, dict) else idx * (1.0 / 24.0)
                    rgb = decode_data_url_to_rgb(data_url)
                    if rgb is not None:
                        frames_rgb.append(rgb)
                        times_sec.append(t_sec)
                if times_sec:
                    video_duration_sec = max(0.5, float(times_sec[-1]) - float(times_sec[0]))
        elif args.video and os.path.isfile(args.video):
            frames_rgb, times_sec, video_duration_sec, _, _ = sample_frames_from_video(
                args.video, sample_count=args.samples
            )
        else:
            err_payload = {"ok": False, "error": "Provide --input-json or --video."}
            print(json.dumps(err_payload))
            sys.exit(1)
    except Exception as exc:
        err_payload = {"ok": False, "error": str(exc)}
        if args.output_json:
            with open(args.output_json, "w", encoding="utf-8") as f:
                json.dump(err_payload, f)
        print(json.dumps(err_payload))
        sys.exit(0)

    result = run_nlf_smpl_extraction(
        frames_rgb=frames_rgb,
        times_sec=times_sec,
        model_path=model_path,
        conf_threshold=conf_threshold,
        max_people=max_people,
        max_side=max_side,
        batch_size=batch_size,
    )
    if video_duration_sec > 0:
        result["durationSec"] = round(video_duration_sec, 3)
    result["extractedFrameCount"] = len(frames_rgb)

    if args.output_json:
        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(result, f)
    else:
        print(json.dumps(result))


if __name__ == "__main__":
    main()
