import { describe, it, expect } from 'vitest';
import { MockModelAdapter } from '../src/adapters/mockAdapter';
import { createDefaultShotSpec } from '../src/types/shotspec';

describe('MockModelAdapter', () => {
  const adapter = new MockModelAdapter();

  it('should validate standard shot spec', () => {
    const shot = createDefaultShotSpec();
    const report = adapter.validate(shot);
    expect(report.valid).toBe(true);
    expect(report.errors.length).toBe(0);
  });

  it('should compile structured prompt bundle', () => {
    const shot = createDefaultShotSpec({
      sceneDescription: 'neon alley in rain',
      camera: {
        lens: { focalLength: '85mm', sensorSize: 'full-frame', aperture: 'f/1.4' },
        shotType: 'close-up',
        angle: 'low-angle',
        movement: {
          type: 'pan-left',
          speed: 'slow-cinematic',
          startPosition: { x: 50, y: 50, z: 20 },
          endPosition: { x: 40, y: 50, z: 20 },
          targetLookAt: { x: 50, y: 50 },
        },
      },
    });

    const bundle = adapter.compilePrompt(shot);
    expect(bundle.positivePrompt).toContain('neon alley in rain');
    expect(bundle.positivePrompt).toContain('panning camera rotation to the left');
    expect(bundle.positivePrompt).toContain('85mm telephoto portrait lens');
    expect(bundle.technicalMetadata.focalLength).toBe('85mm');
  });

  it('should build a valid mock workflow graph', () => {
    const shot = createDefaultShotSpec();
    const graph = adapter.buildWorkflow(shot);
    expect(graph['1']).toBeDefined();
    expect(graph['1'].class_type).toBe('MockVideoGenerator');
    expect(graph['2'].class_type).toBe('SaveVideo');
  });
});
