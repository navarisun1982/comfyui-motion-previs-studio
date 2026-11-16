import * as THREE from 'three';
import { ShotSpec, FocalLength } from '../types/shotspec';
import {
  interpolateCameraPosition,
  interpolateTrajectoryPosition,
} from './trajectoryMath';
import { computeCameraFovDeg } from './povVisibilityEngine';

export interface CameraIntrinsics {
  focalLengthMm: number;
  fovDegrees: number;
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  intrinsicMatrix: [
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ];
}

export type Matrix4x4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export interface CameraPoseBundle {
  shotId: string;
  shotName: string;
  fps: number;
  frameCount: number;
  durationSeconds: number;
  aspectRatio: string;
  intrinsics: CameraIntrinsics;
  // World-to-Camera (Extrinsics) matrices per frame (row-major 4x4)
  w2cExtrinsics: Matrix4x4[];
  // Camera-to-World (Pose) matrices per frame (row-major 4x4)
  c2wPoses: Matrix4x4[];
  // Frame timestamps in seconds
  timestamps: number[];
}

const FOCAL_MM_MAP: Record<FocalLength, number> = {
  '12mm': 12,
  '14mm': 14,
  '40mm': 40,
  '70mm': 70,
  '100mm': 100,
  '200mm': 200,
  '18mm': 18,
  '24mm': 24,
  '35mm': 35,
  '50mm': 50,
  '85mm': 85,
  '135mm': 135,
};

/**
 * Calculates camera intrinsic matrix K based on cinema vertical sensor gate height (`vFOV`)
 * with square pixels (`fx = fy = targetHeight / (2 * tan(vFOV / 2))`), matching Three.js `PerspectiveCamera`.
 */
export function computeCameraIntrinsics(
  focalLength: FocalLength,
  aspectRatio: ShotSpec['aspectRatio'],
  targetWidth: number = 1280,
  customFocalLengthMm?: number,
  sensorSize?: string
): CameraIntrinsics {
  let targetHeight = 720;
  if (aspectRatio === '9:16') {
    targetWidth = 720;
    targetHeight = 1280;
  } else if (aspectRatio === '2.39:1') {
    targetHeight = Math.round(targetWidth / 2.39);
  } else if (aspectRatio === '4:3') {
    targetHeight = Math.round((targetWidth * 3) / 4);
  } else if (aspectRatio === '1:1') {
    targetHeight = targetWidth;
  }

  const baseMm = FOCAL_MM_MAP[focalLength] || 35;
  const focalMm =
    typeof customFocalLengthMm === 'number' && Number.isFinite(customFocalLengthMm)
      ? customFocalLengthMm
      : baseMm;
  const vFovDeg = computeCameraFovDeg({
    focalLength,
    customFocalLengthMm,
    sensorSize: sensorSize || 'full-frame',
  });
  const vFovRad = (vFovDeg * Math.PI) / 180;

  // Square-pixel focal length derived directly from vertical FOV and vertical pixel height
  const rawFy = targetHeight / (2 * Math.tan(vFovRad / 2));
  const fy = Math.round(rawFy * 100) / 100;
  const fx = fy;
  const cx = targetWidth / 2;
  const cy = targetHeight / 2;

  return {
    focalLengthMm: focalMm,
    fovDegrees: vFovDeg,
    fx,
    fy,
    cx,
    cy,
    width: targetWidth,
    height: targetHeight,
    intrinsicMatrix: [
      [fx, 0, cx],
      [0, fy, cy],
      [0, 0, 1],
    ],
  };
}

/**
 * Builds a Camera-to-World (c2w) 4x4 matrix from eye position and look-at target.
 * Standard computer vision convention: X right, Y up, Z backward (camera looks down -Z).
 */
export function lookAtToMatrix4(
  eye: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  up: { x: number; y: number; z: number } = { x: 0, y: 1, z: 0 }
): { c2w: Matrix4x4; w2c: Matrix4x4 } {
  // Forward = target - eye
  let fx = target.x - eye.x;
  let fy = target.y - eye.y;
  let fz = target.z - eye.z;
  const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1.0;
  fx /= fLen;
  fy /= fLen;
  fz /= fLen;

  // Camera looks down -Z, so Z_cam = -Forward
  const zx = -fx;
  const zy = -fy;
  const zz = -fz;

  // X_cam = Up x Z_cam (fallback to safeUp [0, 0, -1] on overhead gimbal lock)
  let effUp = up;
  let xx = effUp.y * zz - effUp.z * zy;
  let xy = effUp.z * zx - effUp.x * zz;
  let xz = effUp.x * zy - effUp.y * zx;
  let xLen = Math.sqrt(xx * xx + xy * xy + xz * xz);
  if (xLen < 1e-6) {
    effUp = { x: 0, y: 0, z: -1 };
    xx = effUp.y * zz - effUp.z * zy;
    xy = effUp.z * zx - effUp.x * zz;
    xz = effUp.x * zy - effUp.y * zx;
    xLen = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1.0;
  }
  xx /= xLen;
  xy /= xLen;
  xz /= xLen;

  // Y_cam = Z_cam x X_cam
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  // c2w: Columns are [X_cam, Y_cam, Z_cam, Eye]
  const c2w: Matrix4x4 = [
    xx, yx, zx, eye.x,
    xy, yy, zy, eye.y,
    xz, yz, zz, eye.z,
    0,  0,  0,  1,
  ];

  // w2c: R^T on top 3x3, and -R^T * Eye on translation column
  const tx = -(xx * eye.x + xy * eye.y + xz * eye.z);
  const ty = -(yx * eye.x + yy * eye.y + yz * eye.z);
  const tz = -(zx * eye.x + zy * eye.y + zz * eye.z);

  const w2c: Matrix4x4 = [
    xx, xy, xz, tx,
    yx, yy, yz, ty,
    zx, zy, zz, tz,
    0,  0,  0,  1,
  ];

  return { c2w, w2c };
}

/**
 * Generates continuous frame-by-frame camera transformation matrices
 * across the entire shot duration for LTX, Hunyuan, and CameraCtrl conditioning nodes.
 */
export function exportCameraPoseBundle(shot: ShotSpec): CameraPoseBundle {
  const fps = shot.frameRate || 24;
  const duration = shot.durationSeconds || 4.0;
  const frameCount = Math.max(1, Math.round(duration * fps));
  const intrinsics = computeCameraIntrinsics(
    shot.camera.lens.focalLength,
    shot.aspectRatio,
    1280,
    shot.camera.lens.customFocalLengthMm,
    shot.camera.lens.sensorSize
  );

  const w2cExtrinsics: Matrix4x4[] = [];
  const c2wPoses: Matrix4x4[] = [];
  const timestamps: number[] = [];

  const angle = shot.camera.angle;
  const moveType = shot.camera.movement.type;
  const baseLookAt = shot.camera.movement.targetLookAt ?? { x: 50, y: 50 };
  const camLookKfs = (shot.camera.movement.keyframes || [])
    .filter((k) => k.lookAt !== undefined && k.time >= 0 && k.time <= duration)
    .sort((a, b) => a.time - b.time);

  const baseLookHeight =
    shot.camera.shotType === 'extreme-close-up'
      ? 4.48
      : shot.camera.shotType === 'close-up'
      ? 4.32
      : shot.camera.shotType === 'medium-close-up'
      ? 3.95
      : shot.camera.shotType === 'medium'
      ? 3.45
      : 2.85;

  const rollRad =
    (((shot.camera.dutchRollDeg ?? 0) + (angle === 'dutch-angle' ? -15 : 0)) * Math.PI) / 180;
  const pitchOffsetRad = ((shot.camera.pitchOffsetDeg ?? 0) * Math.PI) / 180;
  const yawOffsetRad = ((shot.camera.yawOffsetDeg ?? 0) * Math.PI) / 180;

  const virtualCam = new THREE.PerspectiveCamera();

  for (let f = 0; f < frameCount; f++) {
    const t = (f / Math.max(1, frameCount - 1)) * duration;
    const ratio = duration > 0 ? Math.max(0, Math.min(1, t / duration)) : 0;
    timestamps.push(Math.round(t * 1000) / 1000);

    const rawEye = interpolateCameraPosition(shot.camera.movement, t, duration);
    let effectiveCamX = rawEye.x;
    let effectiveCamY =
      angle === 'ground-level'
        ? Math.min(rawEye.y, 0.4)
        : angle === 'overhead-gods-eye'
        ? Math.max(rawEye.y, 28)
        : rawEye.y;
    let effectiveCamZ = rawEye.z;

    let lookAtCoord: { x: number; y: number; z?: number } = baseLookAt;
    if (camLookKfs.length > 0) {
      const lookWaypoints: Array<{ time: number; lookAt: { x: number; y: number; z?: number } }> = [];
      if (camLookKfs[0].time > 0.01) {
        lookWaypoints.push({ time: 0, lookAt: camLookKfs[0].lookAt! });
      }
      for (const kf of camLookKfs) {
        lookWaypoints.push({ time: kf.time, lookAt: kf.lookAt! });
      }
      if (lookWaypoints[lookWaypoints.length - 1].time < duration - 0.01) {
        lookWaypoints.push({ time: duration, lookAt: baseLookAt });
      }
      const clampedT = Math.max(0, Math.min(duration, t));
      if (clampedT <= lookWaypoints[0].time) {
        lookAtCoord = lookWaypoints[0].lookAt;
      } else if (clampedT >= lookWaypoints[lookWaypoints.length - 1].time) {
        lookAtCoord = lookWaypoints[lookWaypoints.length - 1].lookAt;
      } else {
        for (let i = 0; i < lookWaypoints.length - 1; i++) {
          const wA = lookWaypoints[i];
          const wB = lookWaypoints[i + 1];
          if (clampedT >= wA.time && clampedT <= wB.time) {
            const seg = wB.time - wA.time;
            const u = seg > 0 ? (clampedT - wA.time) / seg : 0;
            const smoothU = u * u * (3 - 2 * u);
            const zA = wA.lookAt.z ?? 50;
            const zB = wB.lookAt.z ?? 50;
            lookAtCoord = {
              x: wA.lookAt.x + (wB.lookAt.x - wA.lookAt.x) * smoothU,
              y: wA.lookAt.y + (wB.lookAt.y - wA.lookAt.y) * smoothU,
              z: zA + (zB - zA) * smoothU,
            };
            break;
          }
        }
      }
    }

    let targetX = (lookAtCoord.x - 50) * 1.0;
    let targetZ = (lookAtCoord.y - 50) * 1.0;
    let targetY =
      lookAtCoord.z !== undefined
        ? baseLookHeight + (lookAtCoord.z - 50) * 0.075
        : baseLookHeight;

    if (moveType === 'pan-left') {
      targetX += (0.5 - ratio) * 15;
    } else if (moveType === 'pan-right') {
      targetX += (ratio - 0.5) * 15;
    } else if (moveType === 'tilt-up') {
      targetY += (ratio - 0.5) * 8;
    } else if (moveType === 'tilt-down') {
      targetY += (0.5 - ratio) * 8;
    } else if (moveType === 'whip-pan') {
      targetX += Math.sin(ratio * Math.PI) * 20;
    }

    if (shot.camera.trackTargetActorId) {
      const trackedActor = shot.actors.find((a) => a.id === shot.camera.trackTargetActorId);
      if (trackedActor) {
        const trackedStartTime = trackedActor.trajectory?.startTimeSeconds ?? 0;
        const trackedEffectiveTime = Math.max(0, t - trackedStartTime);
        const tPos = interpolateTrajectoryPosition(
          trackedActor.trajectory,
          trackedEffectiveTime,
          duration
        );
        const tScale = trackedActor.scale ?? 1.0;
        const bone = shot.camera.trackTargetBone || 'head';
        const boneOffset =
          bone === 'head'
            ? 4.35 * tScale
            : bone === 'chest'
            ? 3.45 * tScale
            : bone === 'pelvis'
            ? 2.55 * tScale
            : 0.45 * tScale;
        targetX = (tPos.x - 50) * 1.0;
        targetZ = (tPos.y - 50) * 1.0;
        targetY = (tPos.z ?? 0) * 0.4 + boneOffset;

        if (shot.camera.followActorMovement || moveType === 'steadicam-follow') {
          const initPos = trackedActor.trajectory?.startPosition || { x: 50, y: 50, z: 0 };
          effectiveCamX += (tPos.x - initPos.x) * 1.0;
          effectiveCamZ += (tPos.y - initPos.y) * 1.0;
          effectiveCamY += ((tPos.z ?? 0) - (initPos.z ?? 0)) * 0.4;
        }
      }
    }

    let effectiveTargetY = targetY + (shot.camera.lookAtHeightOffset ?? 0);
    if (angle === 'low-angle') {
      effectiveTargetY += 1.1;
    } else if (angle === 'ground-level') {
      effectiveTargetY += 1.4;
    } else if (angle === 'high-angle') {
      effectiveTargetY = Math.max(1.2, effectiveTargetY - 1.2);
    } else if (angle === 'overhead-gods-eye') {
      effectiveTargetY = 0.5;
    }

    const eyePos = {
      x: effectiveCamX,
      y: effectiveCamY + 1.5,
      z: effectiveCamZ,
    };

    const isOverhead =
      angle === 'overhead-gods-eye' ||
      (Math.abs(eyePos.x - targetX) < 0.1 && Math.abs(eyePos.z - targetZ) < 0.1);

    virtualCam.position.set(eyePos.x, eyePos.y, eyePos.z);
    if (isOverhead) {
      virtualCam.up.set(0, 0, -1);
    } else {
      virtualCam.up.set(0, 1, 0);
    }
    virtualCam.lookAt(targetX, effectiveTargetY, targetZ);
    if (Math.abs(yawOffsetRad) > 1e-5) virtualCam.rotateY(yawOffsetRad);
    if (Math.abs(pitchOffsetRad) > 1e-5) virtualCam.rotateX(pitchOffsetRad);
    if (Math.abs(rollRad) > 1e-5) virtualCam.rotateZ(rollRad);
    virtualCam.updateMatrixWorld(true);

    // Extract local camera forward and rolled up vectors without gimbal lock along +/-X
    const localForward = new THREE.Vector3(0, 0, -1).applyQuaternion(virtualCam.quaternion);
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(virtualCam.quaternion);
    const lookDist = Math.max(1.0, Math.hypot(targetX - eyePos.x, effectiveTargetY - eyePos.y, targetZ - eyePos.z));
    const orientedTarget = {
      x: eyePos.x + localForward.x * lookDist,
      y: eyePos.y + localForward.y * lookDist,
      z: eyePos.z + localForward.z * lookDist,
    };
    const orientedUp = { x: localUp.x, y: localUp.y, z: localUp.z };

    const { c2w, w2c } = lookAtToMatrix4(eyePos, orientedTarget, orientedUp);

    w2cExtrinsics.push(w2c);
    c2wPoses.push(c2w);
  }

  return {
    shotId: shot.id,
    shotName: shot.name,
    fps,
    frameCount,
    durationSeconds: duration,
    aspectRatio: shot.aspectRatio,
    intrinsics,
    w2cExtrinsics,
    c2wPoses,
    timestamps,
  };
}

/**
 * Exports Camera Extrinsics formatted as JSON for ComfyUI custom nodes
 * (e.g. LTXVConditioning, CameraPoseMatrix, HunyuanVideoCameraExtrinsics).
 */
export function exportCameraExtrinsicsJson(shot: ShotSpec): string {
  const bundle = exportCameraPoseBundle(shot);
  return JSON.stringify(bundle, null, 2);
}
