import { describe, it, expect } from 'vitest';
import { LTXVideoAdapter } from '../src/adapters/ltxAdapter';
import { createDefaultShotSpec } from '../src/types/shotspec';

describe('LTXVideoAdapter', () => {
  const adapter = new LTXVideoAdapter();

  it('should declare open-weights compliance', () => {
    expect(adapter.capabilities.isOpenWeights).toBe(true);
    expect(adapter.capabilities.targetModelId).toBe('ltx-2.5');
  });

  it('should build real ComfyUI workflow for text-to-video with LTX-2.5', () => {
    const shot = createDefaultShotSpec({
      durationSeconds: 4.0,
      frameRate: 24,
      aspectRatio: '16:9',
    });

    const graph = adapter.buildWorkflow(shot);
    expect(graph['1'].class_type).toBe('UNETLoader');
    expect(graph['1'].inputs.unet_name).toContain('ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors');
    expect(graph['2'].class_type).toBe('DualCLIPLoader');
    expect(graph['2'].inputs.clip_name1).toContain('gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors');
    expect(graph['3'].class_type).toBe('VAELoader');
    expect(graph['9'].class_type).toBe('KSampler');
    expect(graph['10'].class_type).toBe('VAEDecode');
    expect(graph['11'].class_type).toBe('SaveVideo');
  });

  it('should build image-to-video workflow with LoadImage when reference is present', () => {
    const shot = createDefaultShotSpec();
    const graph = adapter.buildWorkflow(shot, 'hero_start_frame.png');
    
    expect(graph['6']).toBeDefined();
    expect(graph['6'].class_type).toBe('LoadImage');
    expect(graph['6'].inputs.image).toBe('hero_start_frame.png');
    expect(graph['7'].class_type).toBe('LTXVConditioning');
  });
});
