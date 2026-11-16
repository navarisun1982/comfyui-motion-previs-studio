import { describe, it, expect } from 'vitest';
import { compilePromptForShot } from '../src/engine/promptCompiler';
import { createDefaultShotSpec } from '../src/types/shotspec';
import { bindTemplate, normalizeMiniMaxPromptForConnectedRefs } from '../src/pipeline/templateBinder';
import { getPatcher } from '../src/pipeline/timelinePatchers';
import {
  autoDetectWorkflowBindings,
  convertUiWorkflowToApi,
  WORKFLOW_ARCHITECTURE_PROFILES,
} from '../src/pipeline/customWorkflowResolver';
import { buildComfy3DWorkflow, buildComfyTextTo3DWorkflow } from '../src/services/comfy3dGenerator';
import minimaxRef2vaApi from '../workflows/templates/minimax_h3_ref2va.api.json';
import { ApiWorkflow, TemplateBinding } from '../src/pipeline/templateTypes';

describe('Unit 2 (P0-A): Pipeline, Reference Slots, Negative Prompt & 3D Mask Integrity', () => {
  it('1. 0-actor environment-only MiniMax prompt cites <Picture 4> instead of <Picture 1>, and zero-ref normalization leaves zero <Picture N> tags', () => {
    const baseShot = createDefaultShotSpec();
    const envOnlyShot = {
      ...baseShot,
      actors: [],
      environment: {
        ...baseShot.environment,
        id: 'env-desert',
        name: 'Ancient Desert Canyon',
        category: 'nature' as const,
        promptDescription: 'sunlit red sandstone canyon with wind-carved arches',
      },
    };

    const compiled = compilePromptForShot(envOnlyShot, 'minimax-h3');
    expect(compiled.positivePrompt).toContain('<Picture 4>');
    expect(compiled.positivePrompt).not.toContain('<Picture 1>');

    const zeroRefNormalized = normalizeMiniMaxPromptForConnectedRefs(compiled.positivePrompt, {
      mode: 'control',
      profile: 'final',
      prompt: compiled.positivePrompt,
      negative: '',
      seed: 42,
      durationSeconds: 5,
      frameRate: 24,
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
      filenamePrefix: 'test',
    });
    expect(zeroRefNormalized).not.toMatch(/<Picture \d+>/);
  });

  it('2. normalizeMiniMaxPromptForConnectedRefs cleanly remaps sparse slots (Slot 2 + Slot 4 only) without leaking <Picture 3> or <Picture 4>', () => {
    const shot = createDefaultShotSpec();
    const compiled = compilePromptForShot(shot, 'minimax-h3');
    const normalized = normalizeMiniMaxPromptForConnectedRefs(compiled.positivePrompt, {
      mode: 'control',
      profile: 'final',
      prompt: compiled.positivePrompt,
      negative: '',
      seed: 42,
      durationSeconds: 5,
      frameRate: 24,
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
      filenamePrefix: 'test',
      refImage1File: '',
      refImage2File: 'char2.png',
      refImage3File: '',
      refImage4File: 'env4.png',
    });

    // Only 2 connected refs -> dense tags must only be <Picture 1> and <Picture 2>
    expect(normalized).toContain('<Picture 1>');
    expect(normalized).toContain('<Picture 2>');
    expect(normalized).not.toContain('<Picture 3>');
    expect(normalized).not.toContain('<Picture 4>');
  });

  it('3. bindTemplate prunes unused LoadImage + exclusive ImageScale pass-throughs while preserving shared LoadImage nodes', () => {
    const api: ApiWorkflow = {
      '10': { class_type: 'LoadImage', inputs: { image: 'shared.png' } },
      '11': { class_type: 'LoadImage', inputs: { image: 'slot2.png' } },
      '12': { class_type: 'ImageScaleToMaxDimension', inputs: { images: ['11', 0], largest_size: 1024 } },
      '20': { class_type: 'VAEEncode', inputs: { pixels: ['10', 0] } },
      '30': {
        class_type: 'MiniMaxH3ReferenceToVideo',
        inputs: {
          prompt: 'hello',
          seed: 1,
          length: 120,
          'ref_images.ref_image_0': ['10', 0],
          'ref_images.ref_image_1': ['12', 0],
        },
      },
      '40': { class_type: 'SaveVideo', inputs: { filename_prefix: 'out' } },
    };

    const binding: TemplateBinding = {
      schema: 1,
      templateId: 'test_prune',
      engine: 'minimax-h3',
      label: 'Test Prune',
      api: 'test.json',
      modes: ['control'],
      nodes: {
        '10': 'LoadImage',
        '11': 'LoadImage',
        '30': 'MiniMaxH3ReferenceToVideo',
        '40': 'SaveVideo',
      },
      fields: {
        prompt: { node: '30', input: 'prompt' },
        seed: { node: '30', input: 'seed' },
        durationSeconds: { node: '30', input: 'length' },
        refImage1: { node: '10', input: 'image', allowAbsent: true },
        refImage2: { node: '11', input: 'image', allowAbsent: true },
        filenamePrefix: { node: '40', input: 'filename_prefix' },
      } as TemplateBinding['fields'],
      profiles: { draft: [], final: [] },
      output: { node: '40' },
      frameRule: 'any',
    };

    const bound = bindTemplate(api, binding, {
      mode: 'control',
      profile: 'final',
      prompt: 'test prompt',
      negative: '',
      seed: 1,
      durationSeconds: 5,
      frameRate: 24,
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
      filenamePrefix: 'shot1',
      controlVideoFile: 'previs.mp4',
      refImage1File: '', // unused for ref, but still needed by VAEEncode (node 20)!
      refImage2File: '', // unused and fed through ImageScaleToMaxDimension (node 12)!
    });

    // Node 10 must stay alive for VAEEncode (node 20), but detached from ref_images!
    expect(bound.workflow['10']).toBeDefined();
    expect(bound.workflow['20']).toBeDefined();
    // Node 11 AND its exclusive pass-through Node 12 must both be pruned!
    expect(bound.workflow['11']).toBeUndefined();
    expect(bound.workflow['12']).toBeUndefined();
    expect(bound.workflow['30'].inputs['ref_images.ref_image_0']).toBeUndefined();
    expect(bound.workflow['30'].inputs['ref_images.ref_image_1']).toBeUndefined();
  });

  it('4. ltx.firstFrameSegment@1 respects referenceMode OFF vs ON vs non-control Ghost Mask (End)', () => {
    const patcher = getPatcher('ltx.firstFrameSegment@1')!;
    const baseTimeline = {
      normalDurationFrames: 49,
      segments: [],
      characters: [{ images: [{ b64: '', name: 'old.png' }], description: 'old' }],
    };

    const offRes = patcher.apply(baseTimeline, {
      mode: 'control',
      durationSeconds: 5,
      frameRate: 24,
      controlVideoFile: 'previs.mp4',
      refImage1File: 'hero.png',
      referenceMode: 'OFF',
    }) as Record<string, any>;

    expect(offRes.reference_mode).toBe('OFF');
    expect(offRes.characters[0].images).toEqual([]);
    expect(offRes.segments).toEqual([]);

    const onControlRes = patcher.apply(baseTimeline, {
      mode: 'control',
      durationSeconds: 5,
      frameRate: 24,
      controlVideoFile: 'previs.mp4',
      refImage1File: 'hero.png',
      referenceMode: 'ON',
    }) as Record<string, any>;

    expect(onControlRes.reference_mode).toBe('OFF');
    expect(onControlRes.characters[0].images).toEqual([{ b64: '', name: 'hero.png' }]);
    expect(onControlRes.segments[0]).toMatchObject({ type: 'image', imageFile: 'hero.png', start: 0 });

    const t2vRefRes = patcher.apply(baseTimeline, {
      mode: 't2v',
      durationSeconds: 5,
      frameRate: 24,
      refImage1File: 'hero.png',
    }) as Record<string, any>;

    expect(t2vRefRes.reference_mode).toBe('Ghost Mask (End)');
    expect(t2vRefRes.characters[0].images).toEqual([{ b64: '', name: 'hero.png' }]);
  });

  it('5. autoDetectWorkflowBindings traces dotted ref_images/ref_videos, detects CFG>1 negative prompt, and merges subgraph links', () => {
    const detectedBuiltin = autoDetectWorkflowBindings(JSON.stringify(minimaxRef2vaApi));
    expect(detectedBuiltin.detectedSlots.controlVideo).toEqual({ node: '638', input: 'video' });
    expect(detectedBuiltin.detectedSlots.refImage1).toEqual({ node: '137', input: 'image' });
    expect(detectedBuiltin.detectedSlots.refImage2).toEqual({ node: '139', input: 'image' });
    expect(detectedBuiltin.detectedSlots.refImage3).toEqual({ node: '144', input: 'image' });
    expect(detectedBuiltin.detectedSlots.refImage4).toEqual({ node: '151', input: 'image' });
    // Distilled BasicGuider workflow has no active negative node
    expect(detectedBuiltin.detectedSlots.negative).toBeUndefined();

    // Custom CFG > 1 workflow with positive + negative CLIPTextEncode + subgraph link
    const uiWorkflow = {
      nodes: [
        { id: 1, type: 'CLIPTextEncode', title: 'Positive Prompt', widgets_values: ['pos'] },
        { id: 2, type: 'CLIPTextEncode', title: 'Negative Prompt', widgets_values: ['neg'] },
        {
          id: 3,
          type: 'KSampler',
          inputs: [
            { name: 'positive', type: 'CONDITIONING', link: 101 },
            { name: 'negative', type: 'CONDITIONING', link: 102 },
          ],
          widgets_values: [42, 'fixed', 20, 4.5, 'euler', 'normal', 1],
        },
        { id: 4, type: 'VHS_LoadVideo', widgets_values: ['in.mp4', 0, 0, 0, 0, 0, 1, 'AnimateDiff'] },
        { id: 5, type: 'SaveVideo', widgets_values: ['video/out', 'mp4', 'h264'] },
      ],
      links: [[101, 1, 0, 3, 0, 'CONDITIONING']],
      definitions: {
        subgraphs: [
          {
            id: 'sg1',
            nodes: [],
            links: [[102, 2, 0, 3, 1, 'CONDITIONING']],
          },
        ],
      },
    };

    const converted = convertUiWorkflowToApi(uiWorkflow as any);
    expect(converted['3'].inputs.negative).toEqual(['2', 0]);

    const detectedCustom = autoDetectWorkflowBindings(JSON.stringify(uiWorkflow));
    expect(detectedCustom.detectedSlots.prompt).toEqual({ node: '1', input: 'text' });
    expect(detectedCustom.detectedSlots.negative).toEqual({ node: '2', input: 'text' });

    const boundCustom = bindTemplate(detectedCustom.api, detectedCustom.binding, {
      mode: 'control',
      profile: 'final',
      prompt: 'cinematic desert',
      negative: 'blurry, extra limbs',
      seed: 777,
      durationSeconds: 5,
      frameRate: 24,
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
      filenamePrefix: 'out_test',
      controlVideoFile: 'previs.mp4',
    });
    expect(boundCustom.workflow['1'].inputs.text).toBe('cinematic desert');
    expect(boundCustom.workflow['2'].inputs.text).toBe('blurry, extra limbs');
    expect(WORKFLOW_ARCHITECTURE_PROFILES.minimax_h3_seed_hunter.fallbackSaveNodeIds).toEqual([]);
  });

  it('6. comfy3dGenerator avoids inverted LoadImage mask when removeBackground is false and skips negative CLIPTextEncode on custom Text-to-3D', () => {
    const img3d = buildComfy3DWorkflow('opaque_photo.jpg', {
      actorName: 'Hero',
      removeBackground: false,
      engineMode: 'pixal3d',
      qualityMode: 'fast_vertex',
      textureResolution: 1024,
      seed: 99,
    });

    expect(img3d.api['302'].inputs.images).toEqual(['122', 0]);
    expect(img3d.api['56'].inputs.apply_mask).toBe(false);
    expect(img3d.api['303']).toBeUndefined();
    expect(img3d.api['312']).toBeUndefined();

    const customTxt3d = buildComfyTextTo3DWorkflow({
      actorName: 'Knight',
      textPrompt: 'armored medieval knight',
      removeBackground: true,
      engineMode: 'pixal3d',
      qualityMode: 'fast_vertex',
      textureResolution: 1024,
      seed: 123,
      customWorkflowJson: JSON.stringify({
        '1': { class_type: 'CLIPTextEncode', _meta: { title: 'Positive' }, inputs: { text: 'old pos' } },
        '2': { class_type: 'CLIPTextEncode', _meta: { title: 'Negative Prompt' }, inputs: { text: 'low quality, blurry' } },
        '3': { class_type: 'KSampler', inputs: { seed: 1, positive: ['1', 0], negative: ['2', 0] } },
        '4': { class_type: 'SaveGLB', inputs: { filename_prefix: '3d/old' } },
      }),
    });

    expect(customTxt3d.api['1'].inputs.text).toContain('armored medieval knight');
    expect(customTxt3d.api['2'].inputs.text).toBe('low quality, blurry');
  });
});
