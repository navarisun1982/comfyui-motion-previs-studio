import {
  ApiWorkflow,
  BINDABLE_FIELDS,
  BindableField,
  FieldTarget,
  GenerationMode,
  QualityProfile,
  TemplateBinding,
  targetsOf,
} from './templateTypes';
import { getPatcher, TimelinePatchContext } from './timelinePatchers';
import { verifyBinding } from './templateVerifier';

export interface BindValues {
  mode: GenerationMode;
  profile: QualityProfile;
  prompt: string;
  negative: string;
  seed: number;
  durationSeconds: number;
  frameRate: number;
  aspectRatio: string;
  width: number;
  height: number;
  /** ComfyUI input-folder filename of the uploaded first frame; required for i2v. */
  firstFrameFile?: string;
  filenamePrefix: string;
  seedCount?: number;
  winner?: number;
}

export interface AppliedBinding {
  field: BindableField | `profile:${QualityProfile}`;
  node: string;
  input: string;
  value: unknown;
}

export interface BindResult {
  workflow: ApiWorkflow;
  applied: AppliedBinding[];
}

export class BindError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(details.length ? `${message}\n- ${details.join('\n- ')}` : message);
    this.name = 'BindError';
  }
}

/**
 * Produce a ready-to-queue API workflow by writing ShotSpec-derived values into a
 * user-supplied template. The template object is never mutated.
 */
export function bindTemplate(api: ApiWorkflow, binding: TemplateBinding, values: BindValues): BindResult {
  const verification = verifyBinding(api, binding);
  if (!verification.ok) throw new BindError(`Template ${binding.templateId} failed verification`, verification.errors);
  if (!binding.modes.includes(values.mode)) {
    throw new BindError(`Template ${binding.templateId} does not support mode "${values.mode}" (supports ${binding.modes.join(', ')}).`);
  }
  if (values.mode === 'i2v' && !values.firstFrameFile) {
    throw new BindError('Image-to-video needs an uploaded first frame.');
  }
  if (!Number.isInteger(values.seed) || values.seed < 0) {
    throw new BindError(`Seed must be a non-negative integer (got ${values.seed}).`);
  }

  const workflow = structuredClone(api) as ApiWorkflow;
  const applied: AppliedBinding[] = [];
  const patchCtx: TimelinePatchContext = {
    mode: values.mode,
    firstFrameFile: values.firstFrameFile,
    durationSeconds: values.durationSeconds,
    frameRate: values.frameRate,
  };

  for (const field of BINDABLE_FIELDS) {
    for (const target of targetsOf(binding.fields[field])) {
      const value = resolveTargetValue(binding, field, target, values, workflow, patchCtx);
      workflow[target.node].inputs[target.input] = value;
      applied.push({ field, node: target.node, input: target.input, value });
    }
  }

  for (const o of binding.profiles[values.profile]) {
    workflow[o.node].inputs[o.input] = o.value;
    applied.push({ field: `profile:${values.profile}`, node: o.node, input: o.input, value: o.value });
  }

  return { workflow, applied };
}

function resolveTargetValue(
  binding: TemplateBinding,
  field: BindableField,
  target: FieldTarget,
  values: BindValues,
  workflow: ApiWorkflow,
  patchCtx: TimelinePatchContext,
): unknown {
  if (target.fixed !== undefined) return target.fixed;

  if (target.patch) {
    const patcher = getPatcher(target.patch);
    if (!patcher) throw new BindError(`Unknown patcher "${target.patch}".`);
    const raw = workflow[target.node].inputs[target.input];
    const parsed = typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : {};
    return JSON.stringify(patcher.apply(parsed, patchCtx));
  }

  const runtime = fieldValue(field, values);
  if (target.map) {
    const key = String(runtime);
    if (!Object.prototype.hasOwnProperty.call(target.map, key)) {
      throw new BindError(
        `Template ${binding.templateId} has no mapping for ${field} = "${key}" (node ${target.node}.${target.input}). Known: ${Object.keys(target.map).join(', ')}.`,
      );
    }
    return target.map[key];
  }
  return runtime;
}

function fieldValue(field: BindableField, v: BindValues): unknown {
  switch (field) {
    case 'prompt':
      return v.prompt;
    case 'negative':
      return v.negative;
    case 'seed':
      return v.seed;
    case 'seedCount':
      return v.seedCount ?? 1;
    case 'winner':
      return v.winner ?? 1;
    case 'durationSeconds':
      return v.durationSeconds;
    case 'frameRate':
      return v.frameRate;
    case 'aspectRatio':
      return v.aspectRatio;
    case 'width':
      return v.width;
    case 'height':
      return v.height;
    case 'filenamePrefix':
      return v.filenamePrefix;
    case 'timeline':
      throw new BindError('The "timeline" field must use a patcher.');
  }
}

/** LTX needs (8n + 1) pixel frames. Returns the nearest valid frame count (>= 9). */
export function snapFrames(durationSeconds: number, frameRate: number, rule: TemplateBinding['frameRule']): number {
  const raw = Math.max(1, Math.round(durationSeconds * frameRate));
  if (rule !== '8n+1') return raw;
  const n = Math.max(1, Math.round((raw - 1) / 8));
  return n * 8 + 1;
}
