import { describe, it, expect } from 'vitest';
import { createDefaultShotSpec, ShotSpecSchema } from '../src/types/shotspec';

describe('ShotSpec Canonical Schema', () => {
  it('should generate a valid default ShotSpec', () => {
    const shot = createDefaultShotSpec();
    const result = ShotSpecSchema.safeParse(shot);
    expect(result.success).toBe(true);
    expect(shot.durationSeconds).toBe(4.0);
    expect(shot.camera.lens.focalLength).toBe('35mm');
    expect(shot.camera.movement.type).toBe('dolly-in');
  });

  it('should reject invalid duration', () => {
    const invalidShot = {
      ...createDefaultShotSpec(),
      durationSeconds: -5,
    };
    const result = ShotSpecSchema.safeParse(invalidShot);
    expect(result.success).toBe(false);
  });

  it('should reject invalid coordinates outside 0..100 canvas', () => {
    const invalidShot = {
      ...createDefaultShotSpec(),
      camera: {
        ...createDefaultShotSpec().camera,
        movement: {
          ...createDefaultShotSpec().camera.movement,
          startPosition: { x: 150, y: 50, z: 20 },
        },
      },
    };
    const result = ShotSpecSchema.safeParse(invalidShot);
    expect(result.success).toBe(false);
  });

  it('should validate multi-actor blocking setup', () => {
    const shot = createDefaultShotSpec({
      actors: [
        {
          id: 'a1',
          name: 'Hero',
          kind: 'human',
          token: 'detective in trenchcoat',
          actionDescription: 'steps into the alley light',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 40, y: 80 },
            endPosition: { x: 50, y: 50 },
          },
        },
        {
          id: 'a2',
          name: 'Nemesis',
          kind: 'human',
          token: 'shadowy figure',
          actionDescription: 'watches from doorway',
          trajectory: {
            startTimeSeconds: 1.5,
            startPosition: { x: 80, y: 30 },
            endPosition: { x: 80, y: 30 },
          },
        },
      ],
    });

    const result = ShotSpecSchema.safeParse(shot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actors.length).toBe(2);
      expect(result.data.actors[0].name).toBe('Hero');
    }
  });
});
