import { describe, it, expect } from 'vitest';
import { LTXVideoAdapter } from '../src/adapters/ltxAdapter';
import { createDefaultShotSpec } from '../src/types/shotspec';
import { formatReadableEnginePrompt } from '../src/engine/promptCompiler';

describe('LTXVideoAdapter', () => {
  const adapter = new LTXVideoAdapter();

  it('should declare open-weights compliance', () => {
    expect(adapter.capabilities.isOpenWeights).toBe(true);
    expect(adapter.capabilities.targetModelId).toBe('ltx-2.5');
  });

  it('should compile LTX-2.5 prompt into organized, human-readable paragraphs separated by blank lines', () => {
    const shot = createDefaultShotSpec({
      durationSeconds: 5.0,
      frameRate: 24,
      aspectRatio: '16:9',
    });
    const bundle = adapter.compilePrompt(shot);
    const paragraphs = bundle.positivePrompt.split(/\n\n+/).filter(Boolean);
    expect(paragraphs.length).toBeGreaterThanOrEqual(4);
    expect(paragraphs[0]).toContain('Cinematic 16:9');
    expect(paragraphs[1]).toContain('Throughout the continuous');
    expect(paragraphs[2]).toContain('During the mid-shot progression');
    expect(paragraphs[3]).toContain('In the closing beat');

    // Also verifies single-block legacy LTX prompts are split into clean paragraphs
    const flatPrompt =
      'Cinematic 16:9 medium shot, eye-level framing. Throughout the continuous 4.0-second take, the camera moves forward. During the mid-shot progression (1.3s - 2.7s), the subject turns. In the closing beat (2.7s - 4.0s), the camera holds steady.';
    const formatted = formatReadableEnginePrompt(flatPrompt, 'ltx-2.5');
    expect(formatted.split(/\n\n+/).length).toBeGreaterThanOrEqual(3);
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
    expect(graph['11'].class_type).toBe('VHS_VideoCombine');
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
