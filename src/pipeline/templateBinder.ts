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
  /** ComfyUI input-folder filename of the uploaded geometric control/previs video; required for control mode. */
  controlVideoFile?: string;
  refImage1File?: string;
  refImage2File?: string;
  refImage3File?: string;
  refImage4File?: string;
  refImageDescriptions?: [string, string, string, string];
  icLora?: string;
  icLoraStrength?: number;
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
  if (values.mode === 'control' && !values.controlVideoFile) {
    throw new BindError('Control mode needs an uploaded previs/control video.');
  }
  if (!Number.isInteger(values.seed) || values.seed < 0) {
    throw new BindError(`Seed must be a non-negative integer (got ${values.seed}).`);
  }

  const workflow = structuredClone(api) as ApiWorkflow;
  const applied: AppliedBinding[] = [];
  const patchCtx: TimelinePatchContext = {
    mode: values.mode,
    firstFrameFile: values.firstFrameFile,
    controlVideoFile: values.controlVideoFile,
    refImage1File: values.refImage1File,
    refImage2File: values.refImage2File,
    refImage3File: values.refImage3File,
    refImage4File: values.refImage4File,
    refImageDescriptions: values.refImageDescriptions,
    durationSeconds: values.durationSeconds,
    frameRate: values.frameRate,
  };

  for (const field of BINDABLE_FIELDS) {
    for (const target of targetsOf(binding.fields[field])) {
      const value = resolveTargetValue(binding, field, target, values, workflow, patchCtx);
      workflow[target.node].inputs[target.input] = value;
      applied.push({ field, node: target.node, input: target.input, value });

      // Enable LTXDirectorCS25 motion guidance when a control video is bound to timeline_data
      if (
        field === 'timeline' &&
        workflow[target.node]?.class_type === 'LTXDirectorCS25' &&
        values.mode === 'control' &&
        values.controlVideoFile
      ) {
        const nodeInputs = workflow[target.node].inputs;
        if ('use_custom_motion' in nodeInputs) {
          nodeInputs.use_custom_motion = true;
        }
      }

      // Switch StubeliusH3DirectorV2 to Reference (Omni) mode when running in control mode
      if (
        field === 'timeline' &&
        workflow[target.node]?.class_type === 'StubeliusH3DirectorV2' &&
        values.mode === 'control'
      ) {
        const nodeInputs = workflow[target.node].inputs;
        if ('mode' in nodeInputs) {
          nodeInputs.mode = 'Reference (Omni) — up to 9 images, 3 videos, 3 audio';
        }
      }

      // Prune unused LoadImage reference slots when no reference image was supplied for that slot
      if (
        (field === 'refImage1' || field === 'refImage2' || field === 'refImage3' || field === 'refImage4') &&
        workflow[target.node]?.class_type === 'LoadImage'
      ) {
        const rawSlotVal =
          field === 'refImage1'
            ? values.refImage1File
            : field === 'refImage2'
            ? values.refImage2File
            : field === 'refImage3'
            ? values.refImage3File
            : values.refImage4File;
        if (!rawSlotVal || !rawSlotVal.trim()) {
          delete workflow[target.node];
          pruneBrokenRefImageLinks(workflow, target.node);
        }
      }

      // Keep LTXDirectorCS25 companion frame/second inputs synchronized with durationSeconds
      if (
        field === 'durationSeconds' &&
        workflow[target.node]?.class_type === 'LTXDirectorCS25' &&
        target.input === 'duration_seconds'
      ) {
        const nodeInputs = workflow[target.node].inputs;
        const frames = snapFrames(values.durationSeconds, values.frameRate, binding.frameRule);
        if ('end_second' in nodeInputs) nodeInputs.end_second = values.durationSeconds;
        if ('end_frame' in nodeInputs) nodeInputs.end_frame = frames;
        if ('duration_frames' in nodeInputs) nodeInputs.duration_frames = frames;
        if ('segment_lengths' in nodeInputs) nodeInputs.segment_lengths = String(frames);
      }
    }
  }

  for (const o of binding.profiles[values.profile]) {
    workflow[o.node].inputs[o.input] = o.value;
    applied.push({ field: `profile:${values.profile}`, node: o.node, input: o.input, value: o.value });
  }

  // Normalize any legacy ResolutionSelector / StubeliusH3DirectorV2 aspect_ratio strings
  // to ComfyUI's exact nodes_resolution.py AspectRatio enum values.
  const ASPECT_RATIO_NORMALIZATION: Record<string, string> = {
    '9:16 (Vertical)': '9:16 (Portrait Widescreen)',
    '4:3 (Classic TV)': '4:3 (Standard)',
    '16:9': '16:9 (Widescreen)',
    '9:16': '9:16 (Portrait Widescreen)',
    '1:1': '1:1 (Square)',
    '4:3': '4:3 (Standard)',
    '2.39:1': '21:9 (Ultrawide)',
    '21:9': '21:9 (Ultrawide)',
  };
  for (const node of Object.values(workflow)) {
    if (!node?.inputs) continue;
    if (
      (node.class_type === 'ResolutionSelector' ||
        node.class_type === 'StubeliusH3DirectorV2' ||
        node.class_type === 'MuseMinimaxDirector') &&
      typeof node.inputs.aspect_ratio === 'string' &&
      ASPECT_RATIO_NORMALIZATION[node.inputs.aspect_ratio]
    ) {
      node.inputs.aspect_ratio = ASPECT_RATIO_NORMALIZATION[node.inputs.aspect_ratio];
    }
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

  const runtime = fieldValue(field, values, binding.engine);
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

function fieldValue(field: BindableField, v: BindValues, engine?: string): unknown {
  switch (field) {
    case 'prompt':
      return engine === 'minimax-h3' ? normalizeMiniMaxPromptForConnectedRefs(v.prompt, v) : v.prompt;
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
    case 'controlVideo':
      return v.controlVideoFile;
    case 'refImage1':
      return v.refImage1File ?? 'char1.png';
    case 'refImage2':
      return v.refImage2File ?? 'char2.png';
    case 'refImage3':
      return v.refImage3File ?? 'char3.png';
    case 'refImage4':
      return v.refImage4File ?? 'char4.png';
    case 'icLora':
      return v.icLora ?? (v.mode === 'control' ? 'LTX2.5\\ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors' : 'none');
    case 'icLoraStrength':
      return v.icLoraStrength ?? (v.mode === 'control' ? 0.85 : 0.6);
  }
}

/**
 * Removes references to a pruned LoadImage node from MiniMaxH3ReferenceToVideo.inputs.ref_images
 * and re-packs remaining ref_image_0..N keys sequentially.
 */
function pruneBrokenRefImageLinks(workflow: ApiWorkflow, deletedNodeId: string): void {
  for (const node of Object.values(workflow)) {
    if (!node?.inputs) continue;

    // 1. Handle flat dotted keys on node.inputs: "ref_images.ref_image_0", "ref_images.ref_image_1", etc.
    const flatRefKeys = Object.keys(node.inputs)
      .filter((k) => /^ref_images\.ref_image_\d+$/.test(k))
      .sort();
    if (flatRefKeys.length > 0) {
      const keptFlatLinks: unknown[] = [];
      for (const k of flatRefKeys) {
        const v = node.inputs[k];
        delete node.inputs[k];
        if (!Array.isArray(v) || String(v[0]) !== String(deletedNodeId)) {
          keptFlatLinks.push(v);
        }
      }
      keptFlatLinks.forEach((link, idx) => {
        node.inputs[`ref_images.ref_image_${idx}`] = link;
      });
    }

    // 2. Handle nested object: node.inputs.ref_images = { ref_image_0: [...] }
    const refImages = node.inputs.ref_images;
    if (refImages && typeof refImages === 'object' && !Array.isArray(refImages)) {
      const record = refImages as Record<string, unknown>;
      const keptLinks: unknown[] = [];
      for (const [k, v] of Object.entries(record)) {
        if (!k.startsWith('ref_image_')) continue;
        if (Array.isArray(v) && String(v[0]) === String(deletedNodeId)) {
          delete record[k];
        } else {
          keptLinks.push(v);
          delete record[k];
        }
      }
      keptLinks.forEach((link, idx) => {
        record[`ref_image_${idx}`] = link;
      });
    }
  }
}

/** LTX needs (8n + 1) pixel frames. Returns the nearest valid frame count (>= 9). */
export function snapFrames(durationSeconds: number, frameRate: number, rule: TemplateBinding['frameRule']): number {
  const raw = Math.max(1, Math.round(durationSeconds * frameRate));
  if (rule !== '8n+1') return raw;
  const n = Math.max(1, Math.round((raw - 1) / 8));
  return n * 8 + 1;
}

/**
 * Normalizes MiniMax H3 prompt tags to match ComfyUI's exact Qwen3-VL tokenizer (`minimax.py`
 * injects `<Picture %d>: ` and `<Video %d>: ` with capital P/V in dense fill order 1..K).
 * - Converts any lowercase `<picture N>` / `<video N>` to `<Picture N>` / `<Video N>`.
 * - When a subset of `refImage1..4` slots are populated, strips `<Picture k>` citations for
 *   empty slots and remaps remaining `<Picture k>` tags to their dense `1..K` index.
 */
export function normalizeMiniMaxPromptForConnectedRefs(prompt: string, v: BindValues): string {
  if (!prompt) return prompt;
  let out = prompt
    .replace(/<picture\s+(\d+)>/gi, '<Picture $1>')
    .replace(/<video\s+(\d+)>/gi, '<Video $1>');

  if (!out.includes('<Picture ')) return out;

  const slotFiles = [
    (v.refImage1File || '').trim(),
    (v.refImage2File || '').trim(),
    (v.refImage3File || '').trim(),
    (v.refImage4File || '').trim(),
  ];

  const denseMap: Array<number | null> = [null, null, null, null];
  let denseCounter = 0;
  for (let i = 0; i < 4; i++) {
    if (slotFiles[i].length > 0) {
      denseCounter += 1;
      denseMap[i] = denseCounter;
    }
  }

  // If all 4 slots are populated, 1..4 already match dense 1..4
  if (denseCounter === 4) return out;

  // Replace summary range phrase `<Picture 1>–<Picture N> and <Picture 4>` or `<Picture 4>`
  const activeDenseTags = Array.from({ length: denseCounter }, (_, idx) => `<Picture ${idx + 1}>`);
  const replacementRange =
    activeDenseTags.length === 0
      ? 'authentic real-world descriptions'
      : activeDenseTags.length === 1
      ? activeDenseTags[0]
      : `${activeDenseTags.slice(0, -1).join(', ')} and ${activeDenseTags[activeDenseTags.length - 1]}`;

  out = out.replace(
    /<Picture \d+>[–-]<Picture \d+>\s+and\s+<Picture 4>/g,
    replacementRange
  );

  // Strip or remap each slot 1..4
  for (let i = 0; i < 4; i++) {
    const origNum = i + 1;
    const denseNum = denseMap[i];
    if (denseNum === null) {
      out = out
        .replace(new RegExp(`\\s*\\(from <Picture ${origNum}>\\)`, 'g'), '')
        .replace(new RegExp(`\\s+from <Picture ${origNum}>`, 'g'), '')
        .replace(new RegExp(`matches <Picture ${origNum}>;\\s*`, 'g'), '')
        .replace(new RegExp(`matches <Picture ${origNum}>\\.`, 'g'), 'preserves its authentic real-world identity.')
        .replace(new RegExp(`\\s+and <Picture ${origNum}>`, 'g'), '')
        .replace(new RegExp(`<Picture ${origNum}>\\s+for\\s+`, 'g'), 'for ');
    } else if (denseNum !== origNum) {
      out = out.replace(new RegExp(`<Picture ${origNum}>`, 'g'), `__DENSE_PIC_${denseNum}__`);
    }
  }

  out = out.replace(/__DENSE_PIC_(\d+)__/g, '<Picture $1>');
  return out;
}
