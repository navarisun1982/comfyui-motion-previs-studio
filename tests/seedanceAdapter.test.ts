import { describe, it, expect } from 'vitest';
import { SeedanceAdapter } from '../src/adapters/seedanceAdapter';
import { createDefaultShotSpec } from '../src/types/shotspec';

describe('SeedanceAdapter', () => {
  const adapter = new SeedanceAdapter();

  it('should declare capabilities correctly', () => {
    expect(adapter.capabilities.targetModelId).toBe('seedance');
    expect(adapter.capabilities.maxDurationSeconds).toBe(12.0);
    expect(adapter.capabilities.cameraMovements['dolly-in']).toBe('native');
  });

  it('should compile motion-matrix prompt bundle with 6-axis and trajectory physics', () => {
    const baseShot = createDefaultShotSpec();
    const shot = {
      ...baseShot,
      targetModel: 'seedance' as const,
      durationSeconds: 5.0,
      camera: {
        ...baseShot.camera,
        lens: { ...baseShot.camera.lens, focalLength: '35mm' as const },
        shotType: 'medium' as const,
        angle: 'low-angle' as const,
        movement: {
          ...baseShot.camera.movement,
          type: 'dolly-in' as const,
          speed: 'slow-cinematic' as const,
          startPosition: { x: 50, y: 80, z: 20 },
          endPosition: { x: 50, y: 40, z: 20 },
        },
      },
      actors: [
        {
          id: 'a1',
          name: 'Runner',
          kind: 'human',
          token: 'a cyber runner in reflective armor',
          actionDescription: 'sprints toward the camera',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 50, y: 20 },
            endPosition: { x: 50, y: 80 },
          },
        },
      ],
    };

    const bundle = adapter.compilePrompt(shot);
    expect(bundle.positivePrompt).toContain('[Camera 6-Axis Motion & Matrix Trajectory]');
    expect(bundle.positivePrompt).toContain('[Subject Dynamics & Aerodynamic Physics]');
    expect(bundle.positivePrompt).toContain('[Temporal Cue Timetable]');
    expect(bundle.modelPromptParadigm).toBe('seedance-motion-matrix');
    expect(bundle.technicalMetadata.targetModel).toBe('Seedance 2.0');
    expect(bundle.temporalBeats).toHaveLength(3);
  });

  it('should validate duration constraints', () => {
    const validShot = createDefaultShotSpec({ durationSeconds: 6.0 });
    expect(adapter.validate(validShot).valid).toBe(true);

    const tooLongShot = createDefaultShotSpec({ durationSeconds: 15.0 });
    const report = adapter.validate(tooLongShot);
    expect(report.valid).toBe(false);
    expect(report.errors[0]).toContain('Seedance maximum shot duration is 12.0s');
  });
});
