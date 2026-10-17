import { describe, it, expect } from 'vitest';
import { computeShotDiff } from '../src/stores/useHistoryStore';
import { createDefaultShotSpec } from '../src/types/shotspec';

describe('Director Diff - computeShotDiff', () => {
  it('should detect differences between two revisions', () => {
    const revA = createDefaultShotSpec({
      durationSeconds: 3.0,
      camera: {
        lens: { focalLength: '35mm', sensorSize: 'full-frame', aperture: 'f/2.8' },
        shotType: 'medium',
        angle: 'eye-level',
        movement: {
          type: 'dolly-in',
          speed: 'slow-cinematic',
          startPosition: { x: 50, y: 80, z: 20 },
          endPosition: { x: 50, y: 60, z: 20 },
          targetLookAt: { x: 50, y: 50 },
        },
      },
    });

    const revB = createDefaultShotSpec({
      durationSeconds: 5.0, // changed
      camera: {
        lens: { focalLength: '85mm', sensorSize: 'full-frame', aperture: 'f/2.8' }, // changed
        shotType: 'close-up', // changed
        angle: 'low-angle', // changed
        movement: {
          type: 'pedestal-up', // changed
          speed: 'rapid-dynamic', // changed
          startPosition: { x: 50, y: 80, z: 10 },
          endPosition: { x: 50, y: 80, z: 50 },
          targetLookAt: { x: 50, y: 50 },
        },
      },
    });

    const diff = computeShotDiff(revA, revB);
    const changed = diff.filter((d) => d.changed);

    expect(changed.length).toBeGreaterThan(0);
    expect(diff.find((d) => d.label === 'Focal Length')?.changed).toBe(true);
    expect(diff.find((d) => d.label === 'Movement Type')?.changed).toBe(true);
    expect(diff.find((d) => d.label === 'Duration')?.changed).toBe(true);
    expect(diff.find((d) => d.label === 'Aspect Ratio')?.changed).toBe(false);
  });
});
