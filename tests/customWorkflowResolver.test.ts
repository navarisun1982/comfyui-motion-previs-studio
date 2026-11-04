import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  normalizeWorkflowUrl,
  autoDetectWorkflowBindings,
  syncActiveMinimaxTemplateToRegistry,
  getWorkflowChoicesForEngine,
  selectActiveWorkflowForEngine,
  addUploadedWorkflowToLibrary,
  removeWorkflowFromLibrary,
  syncActiveEngineWorkflowToRegistry,
} from '../src/pipeline/customWorkflowResolver';
import { bindTemplate } from '../src/pipeline/templateBinder';
import { installMemoryStorage } from './helpers/memoryStorage';

describe('customWorkflowResolver', () => {
  it('normalizes local ComfyUI workflow URLs, local file paths, and relative workflow names', () => {
    expect(
      normalizeWorkflowUrl('http://127.0.0.1:8188/userdata/workflows/my_minimax.json')
    ).toBe('http://127.0.0.1:8188/api/userdata/workflows%2Fmy_minimax.json');

    expect(normalizeWorkflowUrl('workflows/my_minimax.json')).toBe(
      '/api/comfy/api/userdata/workflows%2Fmy_minimax.json'
    );

    expect(
      normalizeWorkflowUrl('"D:\\ComfyUI\\user\\default\\workflows\\my_minimax.json"')
    ).toBe(
      `/api/local-workflow?path=${encodeURIComponent('D:\\ComfyUI\\user\\default\\workflows\\my_minimax.json')}`
    );
  });

  it('normalizes GitHub and HuggingFace blob URLs into raw URLs', () => {
    expect(
      normalizeWorkflowUrl(
        'https://github.com/stuubszzz/Stubelius-Ultimate-H3/blob/main/Stubelius_Ultimate_H3.json'
      )
    ).toBe(
      'https://raw.githubusercontent.com/stuubszzz/Stubelius-Ultimate-H3/main/Stubelius_Ultimate_H3.json'
    );

    expect(
      normalizeWorkflowUrl(
        'https://huggingface.co/Comfy-Org/MiniMax-H3/blob/main/workflows/minimax_ref2va.json'
      )
    ).toBe(
      'https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/workflows/minimax_ref2va.json'
    );
  });

  it('auto-detects bindings from an API-format MiniMax H3 workflow JSON', () => {
    const apiPath = path.resolve(__dirname, '../workflows/templates/minimax_h3_ref2va.api.json');
    const rawApi = fs.readFileSync(apiPath, 'utf-8');

    const res = autoDetectWorkflowBindings(rawApi);
    expect(res.formatConvertedFrom).toBe('api');
    expect(res.detectedSlots.controlVideo).toEqual({ node: '638', input: 'video' });
    expect(res.detectedSlots.prompt).toEqual({ node: '138', input: 'value' });
    expect(res.detectedSlots.refImage1?.node).toBe('137');
    expect(res.detectedSlots.refImage2?.node).toBe('139');
    expect(res.detectedSlots.refImage3?.node).toBe('144');
    expect(res.detectedSlots.refImage4?.node).toBe('151');
    expect(res.detectedSlots.seed).toEqual({ node: '142', input: 'seed' });
    expect(res.detectedSlots.outputNode).toBe('145');

    // Verify bindTemplate succeeds with the auto-detected binding
    const bound = bindTemplate(res.api, res.binding, {
      mode: 'control',
      profile: 'final',
      prompt: 'Custom workflow test prompt',
      negative: '',
      seed: 42,
      durationSeconds: 5,
      frameRate: 24,
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
      controlVideoFile: 'previs.mp4',
      refImage1File: 'a.png',
      refImage2File: 'b.png',
      refImage3File: 'c.png',
      refImage4File: 'd.png',
      filenamePrefix: 'test_out',
    });
    expect(bound.workflow['638'].inputs['video']).toBe('previs.mp4');
    expect(bound.workflow['138'].inputs['value']).toBe('Custom workflow test prompt');
    expect(bound.workflow['137'].inputs['image']).toBe('a.png');
    expect(bound.workflow['142'].inputs['seed']).toBe(42);
  });

  it('auto-converts a standard ComfyUI UI workflow (nodes + links) and detects bindings', () => {
    const uiPath = path.resolve(__dirname, '../workflows/templates/Stubelius_Ultimate_H3.json');
    const rawUi = fs.readFileSync(uiPath, 'utf-8');

    const res = autoDetectWorkflowBindings(rawUi);
    expect(res.formatConvertedFrom).toBe('ui');
    expect(res.candidates.length).toBeGreaterThan(10);
    expect(res.detectedSlots.controlVideo?.node).toBeDefined();
    expect(res.detectedSlots.outputNode).toBeDefined();
  });

  it('registers custom workflow into templateRegistry and respects user slot overrides', () => {
    const apiPath = path.resolve(__dirname, '../workflows/templates/minimax_h3_ref2va.api.json');
    const rawApi = fs.readFileSync(apiPath, 'utf-8');

    const reg = syncActiveMinimaxTemplateToRegistry({
      activeSource: 'custom',
      url: 'https://example.com/custom.json',
      label: 'custom.json',
      rawJson: rawApi,
      overrides: {
        prompt: { node: '138', input: 'value' },
      },
    });
    expect(reg).not.toBeNull();
    expect(reg?.verification.ok).toBe(true);
    expect(reg?.binding.label).toContain('Custom User MiniMax Workflow');
  });

  it('provides curated built-in workflows and user-added URL workflows for both MiniMax H3 and LTX-2.5', () => {
    installMemoryStorage();

    // 1. Check built-in choices for MiniMax H3 and LTX-2.5
    const minimaxChoices = getWorkflowChoicesForEngine('minimax-h3');
    expect(minimaxChoices.map((c) => c.id)).toEqual([
      'minimax_h3_ref2va',
      'h3_stubelius',
      'minimax_h3_fast_draft',
    ]);

    const ltxChoices = getWorkflowChoicesForEngine('ltx-2.5');
    expect(ltxChoices.map((c) => c.id)).toEqual([
      'ltx25_stubelius',
      'ltx25_fast_native',
      'ltx25_ic_lora_motion',
    ]);

    // 2. Switch MiniMax H3 active workflow to h3_stubelius and verify registry sync
    const selectedStub = selectActiveWorkflowForEngine('minimax-h3', 'h3_stubelius');
    expect(selectedStub.id).toBe('h3_stubelius');
    const syncedStub = syncActiveEngineWorkflowToRegistry('minimax-h3');
    expect(syncedStub.templateId).toBe('h3_stubelius');
    expect(syncedStub.registered?.binding.modes).toContain('control');

    // 3. Add a custom LTX-2.5 workflow and verify it appears in the LTX-2.5 dropdown & binds
    const ltxApiPath = path.resolve(__dirname, '../workflows/templates/ltx25_stubelius.api.json');
    const rawLtxApi = fs.readFileSync(ltxApiPath, 'utf-8');
    const { entry, activeChoice } = addUploadedWorkflowToLibrary(
      'custom_ltx_url_workflow.json',
      rawLtxApi,
      'ltx-2.5'
    );
    expect(activeChoice.id).toBe(entry.id);
    expect(activeChoice.kind).toBe('custom');

    const updatedLtxChoices = getWorkflowChoicesForEngine('ltx-2.5');
    expect(updatedLtxChoices.some((c) => c.id === entry.id)).toBe(true);

    const syncedCustomLtx = syncActiveEngineWorkflowToRegistry('ltx-2.5');
    expect(syncedCustomLtx.templateId).toBe(entry.id);
    expect(syncedCustomLtx.registered?.verification.ok).toBe(true);

    // 4. Remove custom LTX workflow and verify fallback to built-in ltx25_stubelius
    const afterRemove = removeWorkflowFromLibrary(entry.id, 'ltx-2.5');
    expect(afterRemove.id).toBe('ltx25_stubelius');
  });
});

