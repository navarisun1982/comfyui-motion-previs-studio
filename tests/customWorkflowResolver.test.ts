import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  normalizeWorkflowUrl,
  autoDetectWorkflowBindings,
  syncActiveMinimaxTemplateToRegistry,
} from '../src/pipeline/customWorkflowResolver';
import { bindTemplate } from '../src/pipeline/templateBinder';

describe('customWorkflowResolver', () => {
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
});

