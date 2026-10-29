import { describe, it, expect } from 'vitest';
import {
  computeCameraIntrinsics,
  lookAtToMatrix4,
  exportCameraPoseBundle,
  exportCameraExtrinsicsJson,
} from '../src/engine/cameraMatrixExport';
import { createDefaultShotSpec } from '../src/types/shotspec';

describe('Proposal 5: Camera Matrix Extrinsics Export', () => {
  it('computes correct intrinsics for 35mm lens and 16:9 aspect ratio', () => {
    const intrinsics = computeCameraIntrinsics('35mm', '16:9', 1920);
    expect(intrinsics.focalLengthMm).toBe(35);
    expect(intrinsics.width).toBe(1920);
    expect(intrinsics.height).toBe(720); // 16:9 calculation
    expect(intrinsics.cx).toBe(960);
    expect(intrinsics.cy).toBe(360);
    expect(intrinsics.fx).toBeGreaterThan(1000);
    expect(intrinsics.intrinsicMatrix[0][0]).toBe(intrinsics.fx);
    expect(intrinsics.intrinsicMatrix[2][2]).toBe(1);
  });

  it('constructs orthonormal 4x4 matrix from lookAt coordinates', () => {
    const eye = { x: 0, y: 10, z: 30 };
    const target = { x: 0, y: 0, z: 0 };
    const { c2w, w2c } = lookAtToMatrix4(eye, target);

    // Matrix translation column should contain eye coordinates
    expect(c2w[3]).toBe(0);
    expect(c2w[7]).toBe(10);
    expect(c2w[11]).toBe(30);
    expect(c2w[15]).toBe(1);

    // Bottom row must be [0, 0, 0, 1]
    expect(c2w[12]).toBe(0);
    expect(c2w[13]).toBe(0);
    expect(c2w[14]).toBe(0);

    // Orthogonality: length of rotation row 0 should be 1
    const r0Len = Math.sqrt(c2w[0] * c2w[0] + c2w[1] * c2w[1] + c2w[2] * c2w[2]);
    expect(r0Len).toBeCloseTo(1.0, 4);

    // w2c bottom row must be [0, 0, 0, 1]
    expect(w2c[12]).toBe(0);
    expect(w2c[15]).toBe(1);
  });

  it('generates complete multi-frame pose bundle for ShotSpec', () => {
    const shot = createDefaultShotSpec({
      id: 'shot-test-matrix',
      name: 'Matrix Test Dolly',
      durationSeconds: 3.0,
      frameRate: 24,
    });

    const bundle = exportCameraPoseBundle(shot);
    expect(bundle.frameCount).toBe(72); // 3s * 24fps
    expect(bundle.w2cExtrinsics.length).toBe(72);
    expect(bundle.c2wPoses.length).toBe(72);
    expect(bundle.timestamps.length).toBe(72);
    expect(bundle.timestamps[0]).toBe(0);
    expect(bundle.timestamps[71]).toBe(3.0);

    const json = exportCameraExtrinsicsJson(shot);
    const parsed = JSON.parse(json);
    expect(parsed.shotId).toBe('shot-test-matrix');
    expect(parsed.frameCount).toBe(72);

  });
});
