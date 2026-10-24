import { describe, it, expect } from 'vitest';
import {
  extractMaskFromRgba,
  measureSilhouette,
  computeSilhouetteIoU,
  renderSculptSilhouette,
} from '../src/engine/procedural3D/silhouette';
import { sanitizeSculptSpec } from '../src/engine/procedural3D/sculptSpec';

describe('Silhouette mask extraction & measurement', () => {
  it('extracts foreground from RGBA with transparent alpha channel', () => {
    // 4x4 image with a 2x2 white square in the center and transparent borders
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    for (let y = 1; y <= 2; y++) {
      for (let x = 1; x <= 2; x++) {
        const idx = (y * 4 + x) * 4;
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = 255;
      }
    }

    const mask = extractMaskFromRgba(rgba, 4, 4);
    expect(mask.data[0]).toBe(0); // corner
    expect(mask.data[1 * 4 + 1]).toBe(1); // center
    expect(mask.data[2 * 4 + 2]).toBe(1); // center

    const metrics = measureSilhouette(mask);
    expect(metrics.aspectRatio).toBeCloseTo(1.0, 1);
    expect(metrics.bounds).toEqual({ minX: 1, minY: 1, maxX: 2, maxY: 2 });
    expect(metrics.centerOfMass[0]).toBeCloseTo(0.5, 1);
    expect(metrics.centerOfMass[1]).toBeCloseTo(0.5, 1);
  });

  it('computes exact 1.0 IoU on identical masks and 0.0 on non-overlapping masks', () => {
    const maskA = {
      width: 8,
      height: 8,
      data: new Uint8Array(64),
    };
    // 4x4 square in upper-left
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        maskA.data[y * 8 + x] = 1;
      }
    }

    const maskB = {
      width: 8,
      height: 8,
      data: new Uint8Array(maskA.data),
    };

    const iouIdentical = computeSilhouetteIoU(maskA, maskB);
    expect(iouIdentical).toBe(1.0);

    const maskC = {
      width: 8,
      height: 8,
      data: new Uint8Array(64),
    };
    // Non-overlapping or empty
    const iouEmpty = computeSilhouetteIoU(maskA, maskC);
    expect(iouEmpty).toBe(0.0);
  });

  it('renders orthographic front silhouette of a SculptSpec with valid dimensions', () => {
    const spec = sanitizeSculptSpec({
      name: 'Vase',
      route: 'author',
      heightMeters: 0.5,
      parts: [
        {
          id: 'body',
          shape: 'lathe',
          size: [0.3, 0.5, 0.3],
          position: [0, 0.25, 0],
          profile: [
            [0.2, 0],
            [0.5, 0.3],
            [0.15, 0.8],
            [0.25, 1.0],
          ],
        },
      ],
    });

    const rendered = renderSculptSilhouette(spec, 64);
    expect(rendered.width).toBe(64);
    expect(rendered.height).toBe(64);
    // Has foreground pixels
    const foregroundCount = rendered.data.reduce((sum, v) => sum + v, 0);
    expect(foregroundCount).toBeGreaterThan(50);
  });
});
