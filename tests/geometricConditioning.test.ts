import { describe, it, expect } from 'vitest';
import { snapFrames, bindTemplate, BindValues } from '../src/pipeline/templateBinder';
import { getPatcher } from '../src/pipeline/timelinePatchers';
import { ApiWorkflow, TemplateBinding } from '../src/pipeline/templateTypes';
import { buildPackageManifest } from '../src/pipeline/packageExporter';

describe('snapFrames (8n+1 rule)', () => {
  it('correctly calculates 8n+1 frame counts for LTX', () => {
    // 5s @ 24fps: 120 raw -> 121 (15 * 8 + 1)
    expect(snapFrames(5, 24, '8n+1')).toBe(121);
    expect(121 % 8).toBe(1);

    // 4s @ 24fps: 96 raw -> 97 (12 * 8 + 1)
    expect(snapFrames(4, 24, '8n+1')).toBe(97);
    expect(97 % 8).toBe(1);

    // 1s @ 24fps: 24 raw -> 25 (3 * 8 + 1)
    expect(snapFrames(1, 24, '8n+1')).toBe(25);
    expect(25 % 8).toBe(1);

    // 3s @ 25fps: 75 raw -> 73 (9 * 8 + 1 = 73 is closer than 10 * 8 + 1 = 81)
    expect(snapFrames(3, 25, '8n+1')).toBe(73);
    expect(73 % 8).toBe(1);

    // Very short duration: clamp to minimum valid frame count >= 9
    expect(snapFrames(0.1, 24, '8n+1')).toBe(9);
    expect(snapFrames(0.01, 24, '8n+1')).toBe(9);
  });

  it('preserves raw frame count when rule is not 8n+1', () => {
    expect(snapFrames(5, 24, 'any')).toBe(120);
    expect(snapFrames(4, 24, 'any')).toBe(96);
  });
});

describe('ltx.geometricControl@1 patcher', () => {
  it('validates timeline data structure', () => {
    const patcher = getPatcher('ltx.geometricControl@1');
    expect(patcher).toBeDefined();

    expect(patcher!.validate({})).toHaveLength(0);
    expect(patcher!.validate(null)).toContain('timeline_data must be a JSON object');
    expect(patcher!.validate('invalid')).toContain('timeline_data must be a JSON object');
  });

  it('injects retakeVideo and reference_mode in control mode', () => {
    const patcher = getPatcher('ltx.geometricControl@1');
    expect(patcher).toBeDefined();

    const original = { segments: [], existingKey: 'val' };
    const patched = patcher!.apply(original, {
      mode: 'control',
      controlVideoFile: 'camera_previs_v1.mp4',
      durationSeconds: 5,
      frameRate: 24,
    }) as Record<string, unknown>;

    expect(patched.existingKey).toBe('val');
    expect(patched.reference_mode).toBe('VIDEO');
    expect(patched.retakeVideo).toBe('camera_previs_v1.mp4');
    expect(patched.retakeMode).toBe(true);
    expect(patched.retakeStrength).toBe(0.8);
    expect(patched.disable_prompt_relay).toBe(true);
  });

  it('disables retake video in non-control modes', () => {
    const patcher = getPatcher('ltx.geometricControl@1');
    expect(patcher).toBeDefined();

    const original = { reference_mode: 'VIDEO', retakeVideo: 'old.mp4' };
    const patched = patcher!.apply(original, {
      mode: 't2v',
      durationSeconds: 5,
      frameRate: 24,
    }) as Record<string, unknown>;

    expect(patched.reference_mode).toBe('OFF');
    expect(patched.retakeVideo).toBeNull();
    expect(patched.retakeMode).toBe(false);
  });
});

describe('ltx.firstFrameSegment@1 patcher control mode support', () => {
  it('injects geometric control video when mode is control', () => {
    const patcher = getPatcher('ltx.firstFrameSegment@1');
    expect(patcher).toBeDefined();

    const original = { segments: [{ type: 'text', prompt: 'test' }] };
    const patched = patcher!.apply(original, {
      mode: 'control',
      controlVideoFile: 'viewport_previs.mp4',
      durationSeconds: 5,
      frameRate: 24,
    }) as Record<string, unknown>;

    expect(patched.reference_mode).toBe('VIDEO');
    expect(patched.retakeVideo).toBe('viewport_previs.mp4');
    expect(patched.retakeMode).toBe(true);
    expect(patched.disable_prompt_relay).toBe(true);
  });
});

describe('templateBinder with control mode and IC-LoRA', () => {
  const WORKFLOW: ApiWorkflow = {
    '3': {
      class_type: 'StubeliusLTXSetup',
      inputs: {
        seed: 0,
      },
    },
    '5': {
      class_type: 'StubeliusLTXModels',
      inputs: {
        ic_lora: 'none',
        ic_lora_strength: 0.0,
      },
    },
    '7': {
      class_type: 'LTXDirectorCS25',
      inputs: {
        timeline_data: JSON.stringify({ segments: [] }),
        local_prompts: '',
        duration_seconds: 5,
      },
    },
    '15': {
      class_type: 'VHS_VideoCombine',
      inputs: {
        filename_prefix: '',
      },
    },
  };

  const BINDING: TemplateBinding = {
    schema: 1,
    templateId: 'test_ltx_control',
    engine: 'ltx-2.5',
    label: 'Test LTX Control',
    api: 'test_ltx_control.api.json',
    modes: ['t2v', 'i2v', 'control'],
    nodes: {
      '3': 'StubeliusLTXSetup',
      '5': 'StubeliusLTXModels',
      '7': 'LTXDirectorCS25',
      '15': 'VHS_VideoCombine',
    },
    fields: {
      prompt: { node: '7', input: 'local_prompts' },
      seed: { node: '3', input: 'seed' },
      durationSeconds: { node: '7', input: 'duration_seconds' },
      timeline: { node: '7', input: 'timeline_data', patch: 'ltx.geometricControl@1' },
      icLora: { node: '5', input: 'ic_lora' },
      icLoraStrength: { node: '5', input: 'ic_lora_strength' },
      filenamePrefix: { node: '15', input: 'filename_prefix' },
    },
    profiles: {
      draft: [],
      final: [],
    },
    output: { node: '15' },
    frameRule: '8n+1',
  };

  it('binds control mode with IC-LoRA and controlVideoFile', () => {
    const values: BindValues = {
      mode: 'control',
      profile: 'final',
      prompt: 'a futuristic rover traverses red martian dunes',
      negative: 'blurry',
      seed: 42,
      durationSeconds: 5,
      frameRate: 24,
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
      controlVideoFile: 'previs_rover_move.mp4',
      icLora: 'ltx-video-camera-lora.safetensors',
      icLoraStrength: 1.25,
      filenamePrefix: 'test_shot_output',
    };

    const bound = bindTemplate(WORKFLOW, BINDING, values);

    // Verify node 5 IC-LoRA inputs
    expect(bound.workflow['5'].inputs.ic_lora).toBe('ltx-video-camera-lora.safetensors');
    expect(bound.workflow['5'].inputs.ic_lora_strength).toBe(1.25);

    // Verify node 7 timeline_data contains retakeVideo
    const timeline = JSON.parse(bound.workflow['7'].inputs.timeline_data as string);
    expect(timeline.reference_mode).toBe('VIDEO');
    expect(timeline.retakeVideo).toBe('previs_rover_move.mp4');
    expect(timeline.retakeMode).toBe(true);

    // Verify applied fields tracking
    const fieldsApplied = bound.applied.map((a) => a.field);
    expect(fieldsApplied).toContain('icLora');
    expect(fieldsApplied).toContain('icLoraStrength');
    expect(fieldsApplied).toContain('timeline');
  });
});

describe('packageExporter with geometric control', () => {
  it('includes controlVideo in requiredUploads when controlVideoFilename is set', () => {
    const manifest = buildPackageManifest({
      shotId: 'shot-control-1',
      shotName: 'Dolly Push',
      engine: 'ltx-2.5',
      templateId: 'ltx25_stubelius',
      templateHash: 'hash-abc',
      mode: 'control',
      profile: 'final',
      seed: 999,
      prompt: 'dramatic dolly in on character',
      negative: 'lowres',
      promptSource: 'compiled',
      controlVideoFilename: 'dolly_push_previs.mp4',
    });

    expect(manifest.mode).toBe('control');
    expect(manifest.requiredUploads).toHaveLength(1);
    expect(manifest.requiredUploads[0]).toEqual({
      filename: 'dolly_push_previs.mp4',
      type: 'controlVideo',
    });
  });

  it('includes both firstFrame and controlVideo if both are supplied', () => {
    const manifest = buildPackageManifest({
      shotId: 'shot-combo-1',
      shotName: 'Anchor and Move',
      engine: 'ltx-2.5',
      templateId: 'ltx25_stubelius',
      templateHash: 'hash-abc',
      mode: 'control',
      profile: 'final',
      seed: 123,
      prompt: 'character runs forward',
      negative: '',
      promptSource: 'compiled',
      firstFrameFilename: 'start_frame.png',
      controlVideoFilename: 'run_motion.mp4',
    });

    expect(manifest.requiredUploads).toEqual([
      { filename: 'start_frame.png', type: 'firstFrame' },
      { filename: 'run_motion.mp4', type: 'controlVideo' },
    ]);
  });
});
