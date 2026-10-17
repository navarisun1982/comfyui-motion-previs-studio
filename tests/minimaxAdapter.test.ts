import { describe, it, expect } from 'vitest';
import { MiniMaxAdapter } from '../src/adapters/minimaxAdapter';
import { createDefaultShotSpec } from '../src/types/shotspec';

describe('MiniMaxAdapter', () => {
  const adapter = new MiniMaxAdapter();

  it('should declare capabilities correctly', () => {
    expect(adapter.capabilities.targetModelId).toBe('minimax-h3');
    expect(adapter.capabilities.maxDurationSeconds).toBe(10.0);
    expect(adapter.capabilities.cameraMovements['dolly-in']).toBe('native');
  });

  it('should compile cinematic prompt bundle with motion and optical depth', () => {
    const baseShot = createDefaultShotSpec();
    const shot = {
      ...baseShot,
      durationSeconds: 5.0,
      camera: {
        ...baseShot.camera,
        lens: { ...baseShot.camera.lens, focalLength: '50mm' as const },
        shotType: 'medium' as const,
        angle: 'low-angle' as const,
        movement: {
          ...baseShot.camera.movement,
          type: 'dolly-in' as const,
          speed: 'slow-cinematic' as const,
        },
      },
    };

    const bundle = adapter.compilePrompt(shot);
    expect(bundle.positivePrompt).toContain('dolly in');
    expect(bundle.positivePrompt).toContain('50mm lens');
    expect(bundle.technicalMetadata.targetModel).toBe('MiniMax H3 / Hailuo');
  });

  it('should build valid ComfyUI workflow for text-to-video', () => {
    const shot = createDefaultShotSpec({
      aspectRatio: '16:9',
      durationSeconds: 4.0,
    });

    const graph = adapter.buildWorkflow(shot);
    expect(graph['1'].class_type).toBe('MiniMaxModelLoader');
    expect(graph['2'].class_type).toBe('CLIPTextEncode');
    expect(graph['4'].class_type).toBe('MiniMaxVideoSampler');
    expect(graph['4'].inputs.width).toBe(1280);
    expect(graph['4'].inputs.height).toBe(720);
    expect(graph['5'].class_type).toBe('SaveAnimatedWEBP');
  });

  it('should inject LoadImage node when reference image is supplied', () => {
    const shot = createDefaultShotSpec();
    const graph = adapter.buildWorkflow(shot, 'character_portrait.png');

    expect(graph['6']).toBeDefined();
    expect(graph['6'].class_type).toBe('LoadImage');
    expect(graph['6'].inputs.image).toBe('character_portrait.png');
    expect(graph['4'].inputs.init_image).toEqual(['6', 0]);
  });
});
