import { describe, it, expect, beforeAll } from 'vitest';
import { ApiWorkflow, TemplateBinding } from '../src/pipeline/templateTypes';
import { parseBinding, verifyBinding } from '../src/pipeline/templateVerifier';
import { bindTemplate, BindError, BindValues, snapFrames } from '../src/pipeline/templateBinder';
import { registerPatcher, getPatcher, isPlainObject } from '../src/pipeline/timelinePatchers';
import { hashValue, stableStringify } from '../src/pipeline/hash';

// Synthetic test fixture (shape of an API export). Production graphs always come
// from user-exported templates; this exists only to exercise the binder.
const API: ApiWorkflow = {
  '3': { class_type: 'SetupNode', inputs: { seeds: 4, seed: 42, steps: 8 } },
  '5': { class_type: 'PromptSource', inputs: { value: 'template prompt' } },
  '7': {
    class_type: 'DirectorNode',
    inputs: {
      model: ['9', 0],
      prompt_in: ['5', 0],
      timeline_data: JSON.stringify({ segments: [{ type: 'image', imageFile: 'old.png' }], keep: 'me' }),
      aspect: '16:9 (Widescreen)',
    },
    _meta: { title: 'DIRECTOR' },
  },
  '9': { class_type: 'Loader', inputs: { ckpt: 'model.safetensors' } },
  '14': { class_type: 'FinishNode', inputs: { winner: 0 } },
  '15': { class_type: 'VHS_VideoCombine', inputs: { images: ['14', 0], filename_prefix: 'x' } },
  '6': { class_type: 'OutputNode', inputs: { final_resolution: '1080p' } },
};

const BINDING_RAW = {
  schema: 1,
  templateId: 'fixture_t',
  engine: 'ltx-2.5',
  label: 'Fixture',
  api: 'fixture_t.api.json',
  modes: ['t2v', 'i2v'],
  nodes: { '3': 'SetupNode', '5': 'PromptSource', '6': 'OutputNode', '7': 'DirectorNode', '14': 'FinishNode', '15': 'VHS_VideoCombine' },
  fields: {
    prompt: { node: '5', input: 'value' },
    seed: { node: '3', input: 'seed' },
    seedCount: { node: '3', input: 'seeds', fixed: 1 },
    winner: { node: '14', input: 'winner', fixed: 1 },
    durationSeconds: { node: '7', input: 'duration', allowAbsent: true },
    aspectRatio: { node: '7', input: 'aspect', map: { '16:9': '16:9 (Widescreen)', '9:16': '9:16 (Portrait Widescreen)' } },
    timeline: { node: '7', input: 'timeline_data', patch: 'test.firstFrame@1' },
  },
  profiles: { draft: [{ node: '6', input: 'final_resolution', value: 'native (no upscale)' }], final: [] },
  output: { node: '15' },
};

const VALUES: BindValues = {
  mode: 't2v',
  profile: 'final',
  prompt: 'a lone traveler turns toward the camera',
  negative: '',
  seed: 1234,
  durationSeconds: 4,
  frameRate: 24,
  aspectRatio: '16:9',
  width: 1280,
  height: 720,
  filenamePrefix: 'cmpvs/shot',
};

beforeAll(() => {
  if (getPatcher('test.firstFrame@1')) return;
  registerPatcher({
    id: 'test.firstFrame@1',
    description: 'test patcher',
    validate: (t) => (isPlainObject(t) && Array.isArray(t.segments) ? [] : ['expected { segments: [] }']),
    apply: (t, ctx) => ({
      ...(t as Record<string, unknown>),
      segments: ctx.mode === 'i2v' ? [{ type: 'image', imageFile: ctx.firstFrameFile, start: 0, length: 1 }] : [],
    }),
  });
});

function binding(overrides: Record<string, unknown> = {}): TemplateBinding {
  const { binding: b, errors } = parseBinding({ ...BINDING_RAW, ...overrides }, 'fixture');
  if (!b) throw new Error(errors.join('\n'));
  return b;
}

describe('binding schema', () => {
  it('rejects unknown keys and bad patch ids', () => {
    const { errors } = parseBinding({ ...BINDING_RAW, extra: true }, 'f');
    expect(errors.join()).toMatch(/Unrecognized key/);
    const bad = parseBinding(
      { ...BINDING_RAW, fields: { ...BINDING_RAW.fields, timeline: { node: '7', input: 'timeline_data', patch: 'nope' } } },
      'f',
    );
    expect(bad.binding).toBeUndefined();
  });

  it('rejects a target that combines fixed and map', () => {
    const { binding: b } = parseBinding(
      { ...BINDING_RAW, fields: { ...BINDING_RAW.fields, seed: { node: '3', input: 'seed', fixed: 1, map: { a: 1 } } } },
      'f',
    );
    expect(b).toBeUndefined();
  });
});

describe('verifyBinding', () => {
  it('accepts a matching template', () => {
    expect(verifyBinding(API, binding())).toEqual({ ok: true, errors: [] });
  });

  it('refuses when a fingerprinted node changed class', () => {
    const api = structuredClone(API);
    api['5'].class_type = 'KSampler';
    const res = verifyBinding(api, binding());
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toBe('Template fixture_t changed: node 5 is now KSampler, expected PromptSource.');
  });

  it('refuses when a node disappeared', () => {
    const api = structuredClone(API);
    delete api['14'];
    expect(verifyBinding(api, binding()).errors.join()).toMatch(/node 14 no longer exists/);
  });

  it('refuses binding to a wired input', () => {
    const b = binding({ fields: { ...BINDING_RAW.fields, prompt: { node: '7', input: 'prompt_in' } } });
    expect(verifyBinding(API, b).errors.join()).toMatch(/wired to node 5\. Bind the source node instead/);
  });

  it('refuses a missing input unless allowAbsent', () => {
    const b = binding({ fields: { ...BINDING_RAW.fields, durationSeconds: { node: '7', input: 'duration' } } });
    expect(verifyBinding(API, b).errors.join()).toMatch(/has no input "duration"/);
  });

  it('refuses targets on nodes that are not fingerprinted', () => {
    const b = binding({ fields: { ...BINDING_RAW.fields, negative: { node: '9', input: 'ckpt' } } });
    expect(verifyBinding(API, b).errors.join()).toMatch(/not listed in "nodes"/);
  });

  it('refuses when the patcher does not recognise the saved timeline shape', () => {
    const api = structuredClone(API);
    api['7'].inputs.timeline_data = JSON.stringify({ tracks: [] });
    expect(verifyBinding(api, binding()).errors.join()).toMatch(/test\.firstFrame@1 cannot patch node 7\.timeline_data: expected/);
  });

  it('requires a timeline field for i2v templates', () => {
    const fields: Record<string, unknown> = { ...BINDING_RAW.fields };
    delete fields.timeline;
    expect(verifyBinding(API, binding({ fields })).errors.join()).toMatch(/declares mode "i2v"/);
  });
});

describe('bindTemplate', () => {
  it('writes values without mutating the template', () => {
    const before = stableStringify(API);
    const { workflow, applied } = bindTemplate(API, binding(), VALUES);
    expect(stableStringify(API)).toBe(before);
    expect(workflow['5'].inputs.value).toBe(VALUES.prompt);
    expect(workflow['3'].inputs.seed).toBe(1234);
    expect(workflow['3'].inputs.seeds).toBe(1);
    expect(workflow['14'].inputs.winner).toBe(1);
    expect(workflow['7'].inputs.duration).toBe(4);
    expect(workflow['7'].inputs.aspect).toBe('16:9 (Widescreen)');
    expect(workflow['7'].inputs.model).toEqual(['9', 0]);
    expect(JSON.parse(workflow['7'].inputs.timeline_data as string)).toEqual({ segments: [], keep: 'me' });
    expect(applied.find((a) => a.field === 'prompt')).toMatchObject({ node: '5', input: 'value' });
  });

  it('places the first frame for i2v and applies the draft profile', () => {
    const { workflow } = bindTemplate(API, binding(), { ...VALUES, mode: 'i2v', profile: 'draft', firstFrameFile: 'cmpvs_abc.png' });
    expect(JSON.parse(workflow['7'].inputs.timeline_data as string).segments).toEqual([
      { type: 'image', imageFile: 'cmpvs_abc.png', start: 0, length: 1 },
    ]);
    expect(workflow['6'].inputs.final_resolution).toBe('native (no upscale)');
  });

  it('is deterministic: same inputs give the same workflow hash', () => {
    const a = bindTemplate(API, binding(), VALUES).workflow;
    const b = bindTemplate(API, binding(), VALUES).workflow;
    expect(hashValue(a)).toBe(hashValue(b));
    expect(hashValue(bindTemplate(API, binding(), { ...VALUES, seed: 1235 }).workflow)).not.toBe(hashValue(a));
  });

  it('refuses unmapped enum values, i2v without a frame, and unsupported modes', () => {
    expect(() => bindTemplate(API, binding(), { ...VALUES, aspectRatio: '2.39:1' })).toThrow(/no mapping for aspectRatio = "2\.39:1"/);
    expect(() => bindTemplate(API, binding(), { ...VALUES, mode: 'i2v' })).toThrow(BindError);
    expect(() => bindTemplate(API, binding({ modes: ['t2v'], fields: { ...BINDING_RAW.fields } }), { ...VALUES, mode: 'i2v', firstFrameFile: 'a.png' })).toThrow(/does not support mode "i2v"/);
  });

  it('refuses to bind a template that fails verification', () => {
    const api = structuredClone(API);
    api['3'].class_type = 'Other';
    expect(() => bindTemplate(api, binding(), VALUES)).toThrow(/failed verification/);
  });
});

describe('snapFrames', () => {
  it('snaps LTX durations to 8n+1 frames', () => {
    expect(snapFrames(4, 24, '8n+1')).toBe(97);
    expect(snapFrames(5, 24, '8n+1')).toBe(121);
    expect(snapFrames(0.1, 24, '8n+1')).toBe(9);
    expect(snapFrames(4, 24, 'any')).toBe(96);
  });
});

describe('templateRegistry', () => {
  it('registers, retrieves, and discovers templates by engine and mode', async () => {
    const { templateRegistry } = await import('../src/pipeline/templateRegistry');
    templateRegistry.clear();

    const reg = templateRegistry.register(binding(), API);
    expect(reg.verification.ok).toBe(true);
    expect(templateRegistry.get('fixture_t')).toBeDefined();

    const found = templateRegistry.find('ltx-2.5', 't2v');
    expect(found?.binding.templateId).toBe('fixture_t');

    const notFound = templateRegistry.find('minimax-h3', 't2v');
    expect(notFound).toBeUndefined();

    expect(templateRegistry.list()).toHaveLength(1);
    templateRegistry.clear();
    expect(templateRegistry.list()).toHaveLength(0);
  });
});

describe('packageExporter', () => {
  it('builds a truthful package manifest', async () => {
    const { buildPackageManifest } = await import('../src/pipeline/packageExporter');
    const manifest = buildPackageManifest({
      shotId: 'shot-1',
      shotName: 'Hero Intro',
      engine: 'ltx-2.5',
      templateId: 'fixture_t',
      templateHash: 'sha256-hash',
      mode: 'i2v',
      profile: 'draft',
      seed: 42,
      prompt: 'a traveler looks back',
      negative: 'blurry',
      promptSource: 'compiled',
      firstFrameFilename: 'first.png',
    });

    expect(manifest.studio).toBe('ComfyUI Motion Previs Studio');
    expect(manifest.engine).toBe('ltx-2.5');
    expect(manifest.mode).toBe('i2v');
    expect(manifest.requiredUploads).toEqual([{ filename: 'first.png', type: 'firstFrame' }]);
  });
});

describe('promptOverrideStore', () => {
  it('manages prompt overrides per shot and engine with staleness detection', async () => {
    const { usePromptOverrideStore, computePromptHash } = await import('../src/pipeline/promptOverride');
    const store = usePromptOverrideStore.getState();

    const baseHash = computePromptHash('compiled positive', 'compiled negative');
    store.setOverride('shot-1', 'ltx-2.5', 'manual custom positive', 'manual negative', 'manual', baseHash);

    const override = store.getOverride('shot-1', 'ltx-2.5');
    expect(override?.positivePrompt).toBe('manual custom positive');
    expect(override?.source).toBe('manual');

    // Effective prompt returns override text
    const active = store.getEffectivePrompt('shot-1', 'ltx-2.5', {
      positivePrompt: 'compiled positive',
      negativePrompt: 'compiled negative',
    });
    expect(active.positive).toBe('manual custom positive');
    expect(active.isOverride).toBe(true);
    expect(active.isStale).toBe(false);

    // If compiled base changed, staleness is flagged
    const staleCheck = store.getEffectivePrompt('shot-1', 'ltx-2.5', {
      positivePrompt: 'new different positive',
      negativePrompt: 'compiled negative',
    });
    expect(staleCheck.isStale).toBe(true);

    // Revert
    store.revertOverride('shot-1', 'ltx-2.5');
    expect(store.getOverride('shot-1', 'ltx-2.5')).toBeUndefined();
  });
});

describe('bundled production templates', () => {
  it('loads, verifies, and binds ltx25_stubelius without errors', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const apiRaw = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../workflows/templates/ltx25_stubelius.api.json'), 'utf8'));
    const bindingRaw = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../workflows/templates/ltx25_stubelius.binding.json'), 'utf8'));

    const parsed = parseBinding(bindingRaw, 'ltx25_stubelius.binding.json');
    expect(parsed.errors).toEqual([]);
    expect(parsed.binding).toBeDefined();

    const verification = verifyBinding(apiRaw, parsed.binding!);
    expect(verification.errors).toEqual([]);
    expect(verification.ok).toBe(true);

    // Bind T2V draft
    const draftRes = bindTemplate(apiRaw, parsed.binding!, {
      mode: 't2v',
      profile: 'draft',
      prompt: 'A glassblower crafting glowing glass art',
      negative: '',
      seed: 9999,
      durationSeconds: 4,
      frameRate: 25,
      aspectRatio: '16:9',
      width: 1280,
      height: 704,
      filenamePrefix: 'test_shot',
    });

    expect(draftRes.workflow['3'].inputs.seed).toBe(9999);
    expect(draftRes.workflow['3'].inputs.seeds).toBe(1);
    expect(draftRes.workflow['14'].inputs.winner).toBe(1);
    expect(draftRes.workflow['7'].inputs.local_prompts).toBe('A glassblower crafting glowing glass art');
    expect(draftRes.workflow['6'].inputs.final_resolution).toBe('native (no upscale)');

    // Bind I2V final
    const finalRes = bindTemplate(apiRaw, parsed.binding!, {
      mode: 'i2v',
      profile: 'final',
      prompt: 'A glassblower crafting glowing glass art',
      negative: '',
      seed: 8888,
      durationSeconds: 5,
      frameRate: 25,
      aspectRatio: '16:9',
      width: 1280,
      height: 704,
      filenamePrefix: 'test_shot',
      firstFrameFile: 'first_frame_upload.png',
    });

    expect(finalRes.workflow['3'].inputs.seed).toBe(8888);
    expect(finalRes.workflow['6'].inputs.final_resolution).toBe('1080p');
    // Verify timeline patcher applied first frame segment
    const timelineData = JSON.parse(finalRes.workflow['7'].inputs.timeline_data as string);
    expect(timelineData.disable_prompt_relay).toBe(true);
    expect(timelineData.segments[0].type).toBe('image');
    expect(timelineData.segments[0].imageFile).toBe('first_frame_upload.png');
  });

  it('loads, verifies, and binds h3_stubelius without errors', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const apiRaw = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../workflows/templates/h3_stubelius.api.json'), 'utf8'));
    const bindingRaw = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../workflows/templates/h3_stubelius.binding.json'), 'utf8'));

    const parsed = parseBinding(bindingRaw, 'h3_stubelius.binding.json');
    expect(parsed.errors).toEqual([]);
    expect(parsed.binding).toBeDefined();

    const verification = verifyBinding(apiRaw, parsed.binding!);
    expect(verification.errors).toEqual([]);
    expect(verification.ok).toBe(true);

    // Bind T2V draft
    const draftRes = bindTemplate(apiRaw, parsed.binding!, {
      mode: 't2v',
      profile: 'draft',
      prompt: 'Cyberpunk rainy street with neon signs',
      negative: '',
      seed: 54321,
      durationSeconds: 4,
      frameRate: 24,
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
      filenamePrefix: 'test_shot',
    });

    expect(draftRes.workflow['4'].inputs.seed).toBe(54321);
    expect(draftRes.workflow['1'].inputs.seeds).toBe(1);
    expect(draftRes.workflow['11'].inputs.winner).toBe(1);
    expect(draftRes.workflow['3'].inputs.value).toBe('Cyberpunk rainy street with neon signs');
    expect(draftRes.workflow['17'].inputs.final_resolution).toBe('native (no upscale)');

    // Bind I2V final
    const finalRes = bindTemplate(apiRaw, parsed.binding!, {
      mode: 'i2v',
      profile: 'final',
      prompt: 'Cyberpunk rainy street with neon signs',
      negative: '',
      seed: 7777,
      durationSeconds: 6,
      frameRate: 24,
      aspectRatio: '16:9',
      width: 1280,
      height: 720,
      filenamePrefix: 'test_shot',
      firstFrameFile: 'cyberpunk_first.png',
    });

    expect(finalRes.workflow['4'].inputs.seed).toBe(7777);
    expect(finalRes.workflow['17'].inputs.final_resolution).toBe('1080p');
    const timelineData = JSON.parse(finalRes.workflow['4'].inputs.timeline_data as string);
    expect(timelineData.characters[0].file).toBe('cyberpunk_first.png');
  });
});

