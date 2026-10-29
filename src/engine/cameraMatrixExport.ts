import { ShotSpec, FocalLength } from '../types/shotspec';
import { interpolateCameraPosition } from './trajectoryMath';

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
  '18mm': 18,
  '24mm': 24,
  '35mm': 35,
  '50mm': 50,
  '85mm': 85,
  '135mm': 135,
};

const FOV_MAP: Record<FocalLength, number> = {
  '18mm': 100,
  '24mm': 84,
  '35mm': 63,
  '50mm': 47,
  '85mm': 28,
  '135mm': 18,
};

/**
 * Calculates camera intrinsic matrix K based on standard 35mm film sensor format (36mm x 24mm).
 */
export function computeCameraIntrinsics(
  focalLength: FocalLength,
  aspectRatio: ShotSpec['aspectRatio'],
  targetWidth: number = 1280
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

  const focalMm = FOCAL_MM_MAP[focalLength] || 35;
  const fovDeg = FOV_MAP[focalLength] || 63;
  const fovRad = (fovDeg * Math.PI) / 180;

  // Focal length in pixel coordinates
  const rawFx = targetWidth / (2 * Math.tan(fovRad / 2));
  const fx = Math.round(rawFx * 100) / 100;
  const fy = fx; // Square pixels
  const cx = targetWidth / 2;
  const cy = targetHeight / 2;

  return {
    focalLengthMm: focalMm,
    fovDegrees: fovDeg,
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

  // X_cam = Up x Z_cam
  let xx = up.y * zz - up.z * zy;
  let xy = up.z * zx - up.x * zz;
  let xz = up.x * zy - up.y * zx;
  const xLen = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1.0;
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
  const intrinsics = computeCameraIntrinsics(shot.camera.lens.focalLength, shot.aspectRatio);

  const w2cExtrinsics: Matrix4x4[] = [];
  const c2wPoses: Matrix4x4[] = [];
  const timestamps: number[] = [];

  const lookAtTarget = {
    x: (shot.camera.movement.targetLookAt.x - 50) * 1.0,
    y: 5.0, // Eye level height on stage
    z: (shot.camera.movement.targetLookAt.y - 50) * 1.0,
  };

  for (let f = 0; f < frameCount; f++) {
    const t = (f / Math.max(1, frameCount - 1)) * duration;
    timestamps.push(Math.round(t * 1000) / 1000);

    const eyePos = interpolateCameraPosition(shot.camera.movement, t, duration);
    const { c2w, w2c } = lookAtToMatrix4(eyePos, lookAtTarget);

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
