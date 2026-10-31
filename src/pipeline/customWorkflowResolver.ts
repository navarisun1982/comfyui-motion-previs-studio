import {
  ApiNode,
  ApiWorkflow,
  BindableField,
  FieldTarget,
  TemplateBinding,
  isLink,
} from './templateTypes';
import { templateRegistry, RegisteredTemplate } from './templateRegistry';
import { loadBundledTemplates } from './templateLoader';

export interface WorkflowNodeCandidate {
  id: string;
  classType: string;
  title: string;
  inputs: string[];
}

export interface DetectedSlotBinding {
  node: string;
  input: string;
}

export interface CustomWorkflowSlotOverrides {
  prompt?: DetectedSlotBinding | null;
  controlVideo?: DetectedSlotBinding | null;
  refImage1?: DetectedSlotBinding | null;
  refImage2?: DetectedSlotBinding | null;
  refImage3?: DetectedSlotBinding | null;
  refImage4?: DetectedSlotBinding | null;
  seed?: DetectedSlotBinding | null;
  durationSeconds?: DetectedSlotBinding | null;
  outputNode?: string;
}

export interface AutoDetectedWorkflowResult {
  api: ApiWorkflow;
  binding: TemplateBinding;
  detectedSlots: {
    prompt?: DetectedSlotBinding;
    controlVideo?: DetectedSlotBinding;
    refImage1?: DetectedSlotBinding;
    refImage2?: DetectedSlotBinding;
    refImage3?: DetectedSlotBinding;
    refImage4?: DetectedSlotBinding;
    seed?: DetectedSlotBinding;
    durationSeconds?: DetectedSlotBinding;
    outputNode: string;
  };
  candidates: WorkflowNodeCandidate[];
  formatConvertedFrom: 'api' | 'ui';
  warnings: string[];
}

export interface StoredCustomWorkflowConfig {
  activeSource: 'builtin' | 'custom';
  url: string;
  label: string;
  rawJson?: string;
  overrides?: CustomWorkflowSlotOverrides;
  updatedAt?: string;
}

const STORAGE_KEY = 'cmpvs_custom_minimax_workflow_v1';

/**
 * Normalize GitHub blob, HuggingFace blob, or Gist URLs into direct raw JSON URLs.
 */
export function normalizeWorkflowUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // GitHub blob -> raw.githubusercontent.com
  const ghMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
  if (ghMatch) {
    return `https://raw.githubusercontent.com/${ghMatch[1]}/${ghMatch[2]}/${ghMatch[3]}`;
  }

  // HuggingFace blob -> resolve
  const hfMatch = trimmed.match(/^https?:\/\/huggingface\.co\/(.+)\/blob\/(.+)$/i);
  if (hfMatch) {
    return `https://huggingface.co/${hfMatch[1]}/resolve/${hfMatch[2]}`;
  }

  return trimmed;
}

/**
 * Known widget input order for common ComfyUI / MiniMax H3 / VHS nodes when converting
 * a standard UI workflow (`nodes` + `links`) without requiring a live `/object_info` call.
 */
const KNOWN_WIDGET_ORDERS: Record<string, string[]> = {
  LoadImage: ['image', 'upload'],
  VHS_LoadVideo: [
    'video',
    'force_rate',
    'custom_width',
    'custom_height',
    'frame_load_cap',
    'skip_first_frames',
    'select_every_nth',
    'format',
  ],
  VHS_LoadVideoPath: [
    'video',
    'force_rate',
    'custom_width',
    'custom_height',
    'frame_load_cap',
    'skip_first_frames',
    'select_every_nth',
  ],
  LoadVideo: ['file'],
  PrimitiveStringMultiline: ['value'],
  PrimitiveString: ['value'],
  PrimitiveFloat: ['value'],
  PrimitiveInt: ['value', 'control_after_generate'],
  CLIPTextEncode: ['text'],
  'easy seed': ['seed', 'control_after_generate'],
  RandomNoise: ['noise_seed', 'control_after_generate'],
  KSampler: ['seed', 'control_after_generate', 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'],
  BasicScheduler: ['scheduler', 'steps', 'denoise'],
  KSamplerSelect: ['sampler_name'],
  ResolutionSelector: ['aspect_ratio', 'megapixels', 'multiple'],
  UNETLoader: ['unet_name', 'weight_dtype'],
  CLIPLoader: ['clip_name', 'type', 'device'],
  VAELoader: ['vae_name'],
  VHS_VideoCombine: [
    'frame_rate',
    'loop_count',
    'filename_prefix',
    'format',
    'pix_fmt',
    'crf',
    'save_metadata',
    'trim_to_audio',
    'pingpong',
    'save_output',
  ],
  SaveVideo: ['filename_prefix', 'format', 'codec'],
  MiniMaxH3ReferenceToVideo: ['prompt', 'negative_prompt', 'width', 'height', 'length', 'seed'],
  MiniMaxH3FirstLastFrameToVideo: ['prompt', 'negative_prompt', 'width', 'height', 'length', 'seed'],
  ComfyMathExpression: ['expression'],
  ImageScaleToMaxDimension: ['largest_size', 'upscale_method'],
  RIFEInterpolation: ['ckpt_name', 'clear_cache_after_n_frames', 'multiplier', 'fast_mode', 'ensemble', 'scale_factor'],
  PathchSageAttentionKJ: ['sage_attention'],
  SolAttnPatch: ['enabled'],
};

interface UiWorkflowNode {
  id: number | string;
  type: string;
  title?: string;
  mode?: number;
  inputs?: Array<{ name: string; type: string; link: number | null; widget?: { name: string } }>;
  outputs?: Array<{ name: string; type: string; links?: number[] | null }>;
  widgets_values?: unknown[] | Record<string, unknown>;
  widgets_values_named?: Record<string, unknown>;
}

interface UiWorkflowJson {
  nodes: UiWorkflowNode[];
  links?: Array<[number, number | string, number, number | string, number, string]>;
}

function isUiWorkflowFormat(parsed: unknown): parsed is UiWorkflowJson {
  return (
    Boolean(parsed) &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as UiWorkflowJson).nodes)
  );
}

function isApiWorkflowFormat(parsed: unknown): parsed is ApiWorkflow {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return false;
  return entries.some(
    ([, v]) =>
      Boolean(v) &&
      typeof v === 'object' &&
      typeof (v as ApiNode).class_type === 'string' &&
      typeof (v as ApiNode).inputs === 'object'
  );
}

/**
 * Convert a standard ComfyUI UI workflow (`{ nodes, links }`) into an `ApiWorkflow`.
 */
export function convertUiWorkflowToApi(
  ui: UiWorkflowJson,
  objectInfo?: Record<string, unknown> | null
): ApiWorkflow {
  const nodeMap = new Map<string, UiWorkflowNode>();
  for (const n of ui.nodes) {
    nodeMap.set(String(n.id), n);
  }

  // linkId -> { originId, originSlot }
  const linkMap = new Map<number, { originId: string; originSlot: number }>();
  if (Array.isArray(ui.links)) {
    for (const l of ui.links) {
      if (Array.isArray(l) && l.length >= 5) {
        linkMap.set(Number(l[0]), {
          originId: String(l[1]),
          originSlot: Number(l[2]),
        });
      }
    }
  }

  // Follow Reroute chains to the real upstream source node
  const resolveOrigin = (linkId: number, visited = new Set<number>()): { originId: string; originSlot: number } | null => {
    if (visited.has(linkId)) return null;
    visited.add(linkId);
    const link = linkMap.get(linkId);
    if (!link) return null;
    const originNode = nodeMap.get(link.originId);
    if (!originNode) return link;
    if (originNode.type === 'Reroute' && Array.isArray(originNode.inputs) && originNode.inputs[0]?.link != null) {
      return resolveOrigin(Number(originNode.inputs[0].link), visited);
    }
    return link;
  };

  const api: ApiWorkflow = {};
  const skippedTypes = new Set(['Reroute', 'Note', 'MarkdownNote', 'PrimitiveNode']);

  for (const node of ui.nodes) {
    const id = String(node.id);
    if (!/^[0-9]+(:[0-9]+)*$/.test(id)) continue;
    // Skip muted (2) or bypassed (4) or visual-only nodes
    if (node.mode === 2 || node.mode === 4) continue;
    if (skippedTypes.has(node.type)) continue;

    const inputs: Record<string, unknown> = {};
    const linkedInputNames = new Set<string>();

    // 1. Wire linked inputs
    if (Array.isArray(node.inputs)) {
      for (const inp of node.inputs) {
        if (inp.link != null) {
          const resolved = resolveOrigin(Number(inp.link));
          if (resolved) {
            const originNode = nodeMap.get(resolved.originId);
            if (originNode?.type === 'PrimitiveNode' && Array.isArray(originNode.widgets_values)) {
              inputs[inp.name] = originNode.widgets_values[0];
            } else {
              inputs[inp.name] = [resolved.originId, resolved.originSlot];
            }
            linkedInputNames.add(inp.name);
          }
        }
      }
    }

    // 2. Wire widget values
    if (node.widgets_values_named && typeof node.widgets_values_named === 'object') {
      for (const [k, v] of Object.entries(node.widgets_values_named)) {
        if (k === 'videopreview') continue;
        if (!linkedInputNames.has(k)) {
          inputs[k] = v;
        }
      }
    } else if (node.widgets_values && !Array.isArray(node.widgets_values) && typeof node.widgets_values === 'object') {
      // VHS nodes sometimes store widgets_values as a key-value object directly!
      for (const [k, v] of Object.entries(node.widgets_values)) {
        if (k === 'videopreview' || k === 'audio') continue;
        if (!linkedInputNames.has(k)) {
          inputs[k] = v;
        }
      }
    } else if (Array.isArray(node.widgets_values)) {
      // Determine widget names in order
      const widgetNames: string[] = [];

      // First check if the UI node's inputs array explicitly lists widget inputs
      const widgetInputsFromNode = (node.inputs || [])
        .filter((inp) => inp.widget?.name)
        .map((inp) => inp.widget!.name);

      // Or check objectInfo if available
      const objInfoEntry = objectInfo?.[node.type] as
        | { input?: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> } }
        | undefined;

      if (objInfoEntry?.input) {
        const req = objInfoEntry.input.required || {};
        const opt = objInfoEntry.input.optional || {};
        for (const [k, spec] of [...Object.entries(req), ...Object.entries(opt)]) {
          const typeOrChoices = Array.isArray(spec) ? spec[0] : undefined;
          const isWidget =
            Array.isArray(typeOrChoices) ||
            typeOrChoices === 'INT' ||
            typeOrChoices === 'FLOAT' ||
            typeOrChoices === 'STRING' ||
            typeOrChoices === 'BOOLEAN';
          if (isWidget) {
            widgetNames.push(k);
          }
        }
      } else if (KNOWN_WIDGET_ORDERS[node.type]) {
        widgetNames.push(...KNOWN_WIDGET_ORDERS[node.type]);
      } else if (widgetInputsFromNode.length > 0) {
        widgetNames.push(...widgetInputsFromNode);
      }

      let wIdx = 0;
      for (const wName of widgetNames) {
        if (wIdx >= node.widgets_values.length) break;
        const val = node.widgets_values[wIdx++];
        if (!linkedInputNames.has(wName)) {
          inputs[wName] = val;
        }
        // In ComfyUI UI format, seed / noise_seed widgets are often followed by an inline 'control_after_generate' string ('fixed'/'randomize')
        if (
          (wName === 'seed' || wName === 'noise_seed') &&
          wIdx < node.widgets_values.length &&
          typeof node.widgets_values[wIdx] === 'string' &&
          ['fixed', 'increment', 'decrement', 'randomize'].includes(String(node.widgets_values[wIdx])) &&
          !widgetNames.includes('control_after_generate')
        ) {
          wIdx++;
        }
      }

      // Fallback if single-value primitive node had no matched widget name
      if (Object.keys(inputs).length === 0 && node.widgets_values.length > 0) {
        inputs['value'] = node.widgets_values[0];
      }
    }

    api[id] = {
      class_type: node.type,
      inputs,
      _meta: { title: node.title || node.type },
    };
  }

  return api;
}

/**
 * Trace an input link `[nodeId, slot]` back through utility pass-through nodes
 * (like `ImageScaleToMaxDimension`) to find a node matching a predicate.
 */
function traceUpstreamNode(
  api: ApiWorkflow,
  startLink: unknown,
  predicate: (id: string, node: ApiNode) => boolean,
  depth = 0
): string | null {
  if (depth > 6 || !isLink(startLink)) return null;
  const targetId = startLink[0];
  const node = api[targetId];
  if (!node) return null;
  if (predicate(targetId, node)) return targetId;

  for (const val of Object.values(node.inputs)) {
    if (isLink(val)) {
      const found = traceUpstreamNode(api, val, predicate, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Auto-detect node bindings for a MiniMax H3 / Video-to-Video ComfyUI workflow
 * and build a verified `TemplateBinding`.
 */
export function autoDetectWorkflowBindings(
  rawJsonOrObject: string | Record<string, unknown>,
  overrides?: CustomWorkflowSlotOverrides,
  objectInfo?: Record<string, unknown> | null
): AutoDetectedWorkflowResult {
  const parsed: unknown =
    typeof rawJsonOrObject === 'string' ? JSON.parse(rawJsonOrObject) : rawJsonOrObject;

  let api: ApiWorkflow;
  let formatConvertedFrom: 'api' | 'ui' = 'api';
  const warnings: string[] = [];

  if (isApiWorkflowFormat(parsed)) {
    // Filter only valid numeric/subgraph node IDs
    api = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (/^[0-9]+(:[0-9]+)*$/.test(k) && v && typeof v === 'object' && typeof v.class_type === 'string') {
        api[k] = structuredClone(v);
      }
    }
  } else if (isUiWorkflowFormat(parsed)) {
    formatConvertedFrom = 'ui';
    api = convertUiWorkflowToApi(parsed, objectInfo);
  } else {
    throw new Error(
      'Invalid ComfyUI workflow JSON: expected either API format ({ "nodeId": { "class_type", "inputs" } }) or UI format ({ "nodes": [...], "links": [...] }).'
    );
  }

  const nodeEntries = Object.entries(api).sort((a, b) => Number(a[0].split(':')[0]) - Number(b[0].split(':')[0]));
  if (nodeEntries.length === 0) {
    throw new Error('The workflow JSON contains no executable ComfyUI nodes.');
  }

  const candidates: WorkflowNodeCandidate[] = nodeEntries.map(([id, n]) => ({
    id,
    classType: n.class_type,
    title: n._meta?.title || n.class_type,
    inputs: Object.keys(n.inputs || {}),
  }));

  // Find core MiniMax conditioning node if present
  const minimaxEntry = nodeEntries.find(([_, n]) =>
    /MiniMaxH3ReferenceToVideo|MiniMaxH3FirstLastFrameToVideo|MiniMax/i.test(n.class_type)
  );

  // 1. Detect Previs / Control Video Input (<Video 1>)
  let controlVideo: DetectedSlotBinding | undefined;
  if (overrides?.controlVideo) {
    controlVideo = overrides.controlVideo;
  } else {
    if (minimaxEntry) {
      const refVideoLink = minimaxEntry[1].inputs['ref_video'] ?? minimaxEntry[1].inputs['video'];
      const tracedVideoId = traceUpstreamNode(api, refVideoLink, (_id, n) =>
        /VHS_LoadVideo|LoadVideo/i.test(n.class_type)
      );
      if (tracedVideoId) {
        const vNode = api[tracedVideoId];
        const inName = 'video' in vNode.inputs ? 'video' : 'file' in vNode.inputs ? 'file' : 'video';
        controlVideo = { node: tracedVideoId, input: inName };
      }
    }
    if (!controlVideo) {
      const loadVid = nodeEntries.find(([_, n]) => /VHS_LoadVideo|LoadVideo/i.test(n.class_type));
      if (loadVid) {
        const inName = 'video' in loadVid[1].inputs ? 'video' : 'file' in loadVid[1].inputs ? 'file' : 'video';
        controlVideo = { node: loadVid[0], input: inName };
      } else {
        const directorNode = nodeEntries.find(([_, n]) =>
          /StubeliusH3Director|LTXDirector/i.test(n.class_type) && 'timeline_data' in n.inputs
        );
        if (directorNode) {
          controlVideo = { node: directorNode[0], input: 'timeline_data' };
        }
      }
    }
  }
  if (!controlVideo) {
    warnings.push('No VHS_LoadVideo / LoadVideo node detected for the 3D Previs MP4 input.');
  }

  // 2. Detect Prompt Input
  let prompt: DetectedSlotBinding | undefined;
  if (overrides?.prompt) {
    prompt = overrides.prompt;
  } else {
    if (minimaxEntry) {
      const pVal = minimaxEntry[1].inputs['prompt'] ?? minimaxEntry[1].inputs['positive_prompt'] ?? minimaxEntry[1].inputs['text'];
      if (isLink(pVal)) {
        const tracedPromptId = traceUpstreamNode(api, pVal, (_id, n) =>
          /PrimitiveString|String|Text|CLIPTextEncode/i.test(n.class_type)
        );
        if (tracedPromptId) {
          const pNode = api[tracedPromptId];
          const inName =
            'value' in pNode.inputs
              ? 'value'
              : 'text' in pNode.inputs
              ? 'text'
              : 'string' in pNode.inputs
              ? 'string'
              : Object.keys(pNode.inputs)[0] || 'value';
          prompt = { node: tracedPromptId, input: inName };
        }
      } else if (typeof pVal === 'string') {
        prompt = { node: minimaxEntry[0], input: 'prompt' };
      }
    }
    if (!prompt) {
      const strNode = nodeEntries.find(
        ([_, n]) =>
          /PrimitiveStringMultiline|PrimitiveString|CLIPTextEncode/i.test(n.class_type) &&
          !String(n._meta?.title || '').toLowerCase().includes('negative')
      );
      if (strNode) {
        const inName = 'value' in strNode[1].inputs ? 'value' : 'text' in strNode[1].inputs ? 'text' : 'value';
        prompt = { node: strNode[0], input: inName };
      }
    }
  }
  if (!prompt) {
    warnings.push('No Prompt input node detected.');
  }

  // 3. Detect 4 Reference Image Slots (<picture 1> .. <picture 4>)
  const detectedRefImages: Array<DetectedSlotBinding | undefined> = [undefined, undefined, undefined, undefined];
  const usedImageNodes = new Set<string>();

  if (minimaxEntry) {
    const imgKeys = [
      ['image_1', 'ref_image_1', 'image1', 'start_image'],
      ['image_2', 'ref_image_2', 'image2', 'end_image'],
      ['image_3', 'ref_image_3', 'image3'],
      ['image_4', 'ref_image_4', 'image4'],
    ];
    for (let i = 0; i < 4; i++) {
      for (const k of imgKeys[i]) {
        const linkVal = minimaxEntry[1].inputs[k];
        const tracedImgId = traceUpstreamNode(api, linkVal, (_id, n) => /LoadImage/i.test(n.class_type));
        if (tracedImgId && !usedImageNodes.has(tracedImgId)) {
          detectedRefImages[i] = { node: tracedImgId, input: 'image' };
          usedImageNodes.add(tracedImgId);
          break;
        }
      }
    }
  }

  // Fill any remaining slots with LoadImage nodes in numeric order
  const allLoadImageNodes = nodeEntries.filter(([_, n]) => /^LoadImage$/i.test(n.class_type));
  for (let i = 0; i < 4; i++) {
    const overrideKey = (`refImage${i + 1}` as 'refImage1' | 'refImage2' | 'refImage3' | 'refImage4');
    if (overrides?.[overrideKey]) {
      detectedRefImages[i] = overrides[overrideKey] || undefined;
      continue;
    }
    if (!detectedRefImages[i]) {
      const nextImg = allLoadImageNodes.find(([id]) => !usedImageNodes.has(id));
      if (nextImg) {
        detectedRefImages[i] = { node: nextImg[0], input: 'image' };
        usedImageNodes.add(nextImg[0]);
      }
    }
  }

  // 4. Detect Seed Node (prefer unlinked literal seed inputs, or trace linked noise_seed back to its seed node)
  let seed: DetectedSlotBinding | undefined;
  if (overrides?.seed) {
    seed = overrides.seed;
  } else {
    const unlinkedSeedNode = nodeEntries.find(
      ([_, n]) =>
        /easy seed|RandomNoise|KSampler|StubeliusH3Director/i.test(n.class_type) &&
        (('seed' in n.inputs && !isLink(n.inputs['seed'])) ||
          ('noise_seed' in n.inputs && !isLink(n.inputs['noise_seed'])))
    );
    if (unlinkedSeedNode) {
      const inName =
        'seed' in unlinkedSeedNode[1].inputs && !isLink(unlinkedSeedNode[1].inputs['seed'])
          ? 'seed'
          : 'noise_seed';
      seed = { node: unlinkedSeedNode[0], input: inName };
    } else if (minimaxEntry && 'seed' in minimaxEntry[1].inputs && !isLink(minimaxEntry[1].inputs['seed'])) {
      seed = { node: minimaxEntry[0], input: 'seed' };
    }
  }

  // 5. Detect Duration Seconds Node
  let durationSeconds: DetectedSlotBinding | undefined;
  if (overrides?.durationSeconds) {
    durationSeconds = overrides.durationSeconds;
  } else {
    const durNode = nodeEntries.find(
      ([_, n]) =>
        n.class_type === 'PrimitiveFloat' &&
        /duration|seconds|length/i.test(String(n._meta?.title || ''))
    );
    if (durNode) {
      durationSeconds = { node: durNode[0], input: 'value' };
    }
  }

  // 6. Detect Output Video Node
  let outputNode = overrides?.outputNode || '';
  if (!outputNode || !api[outputNode]) {
    const outCandidates = nodeEntries.filter(([_, n]) =>
      /VHS_VideoCombine|SaveVideo|SaveWEBM|PreviewVideo/i.test(n.class_type)
    );
    if (outCandidates.length > 0) {
      // Prefer VHS_VideoCombine that has audio or is last in chain
      const withAudio = outCandidates.find(([_, n]) => 'audio' in n.inputs);
      outputNode = (withAudio || outCandidates[outCandidates.length - 1])[0];
    } else {
      outputNode = nodeEntries[nodeEntries.length - 1][0];
      warnings.push(`No VHS_VideoCombine / SaveVideo node found; defaulted output to Node #${outputNode}.`);
    }
  }

  // Build verified TemplateBinding
  const fields: Partial<Record<BindableField, FieldTarget>> = {};
  const nodesFingerprint: Record<string, string> = {};

  const addBindingField = (field: BindableField, slot: DetectedSlotBinding | undefined) => {
    if (!slot || !api[slot.node]) return;
    // Ensure input exists on api node and is not a link tuple so verifyBinding succeeds
    if (!(slot.input in api[slot.node].inputs) || isLink(api[slot.node].inputs[slot.input])) {
      api[slot.node].inputs[slot.input] = '';
    }
    fields[field] = {
      node: slot.node,
      input: slot.input,
      allowAbsent: true,
    };
    nodesFingerprint[slot.node] = api[slot.node].class_type;
  };

  addBindingField('prompt', prompt);
  addBindingField('controlVideo', controlVideo);
  addBindingField('refImage1', detectedRefImages[0]);
  addBindingField('refImage2', detectedRefImages[1]);
  addBindingField('refImage3', detectedRefImages[2]);
  addBindingField('refImage4', detectedRefImages[3]);
  addBindingField('seed', seed);
  addBindingField('durationSeconds', durationSeconds);

  if (api[outputNode] && 'filename_prefix' in api[outputNode].inputs) {
    fields['filenamePrefix'] = {
      node: outputNode,
      input: 'filename_prefix',
      allowAbsent: true,
    };
  }
  nodesFingerprint[outputNode] = api[outputNode].class_type;

  const binding: TemplateBinding = {
    schema: 1,
    templateId: 'minimax_h3_custom_user',
    engine: 'minimax-h3',
    label: 'Custom User MiniMax Workflow (Auto-Detected Bindings)',
    api: 'custom_user_workflow.api.json',
    modes: ['control'],
    nodes: nodesFingerprint,
    fields: fields as Record<BindableField, FieldTarget>,
    profiles: {
      draft: [],
      final: [],
    },
    output: {
      node: outputNode,
    },
    frameRule: 'any',
  };

  return {
    api,
    binding,
    detectedSlots: {
      prompt,
      controlVideo,
      refImage1: detectedRefImages[0],
      refImage2: detectedRefImages[1],
      refImage3: detectedRefImages[2],
      refImage4: detectedRefImages[3],
      seed,
      durationSeconds,
      outputNode,
    },
    candidates,
    formatConvertedFrom,
    warnings,
  };
}

/**
 * Fetch a workflow JSON from a URL and run `autoDetectWorkflowBindings`.
 */
export async function fetchAndDetectWorkflowFromUrl(
  rawUrl: string,
  overrides?: CustomWorkflowSlotOverrides,
  objectInfo?: Record<string, unknown> | null
): Promise<{ normalizedUrl: string; rawJson: string; result: AutoDetectedWorkflowResult }> {
  const normalizedUrl = normalizeWorkflowUrl(rawUrl);
  if (!normalizedUrl) {
    throw new Error('Please enter a valid workflow URL.');
  }

  const res = await fetch(normalizedUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch workflow from URL (HTTP ${res.status} ${res.statusText}).`);
  }

  const rawJson = await res.text();
  const result = autoDetectWorkflowBindings(rawJson, overrides, objectInfo);
  return { normalizedUrl, rawJson, result };
}

/**
 * Load saved custom workflow config from localStorage.
 */
export function loadStoredCustomWorkflowConfig(): StoredCustomWorkflowConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredCustomWorkflowConfig;
      return {
        activeSource: parsed.activeSource === 'custom' ? 'custom' : 'builtin',
        url: parsed.url || '',
        label: parsed.label || '',
        rawJson: parsed.rawJson,
        overrides: parsed.overrides || {},
        updatedAt: parsed.updatedAt,
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    activeSource: 'builtin',
    url: '',
    label: '',
    overrides: {},
  };
}

/**
 * Save custom workflow config to localStorage and sync `templateRegistry`.
 */
export function saveStoredCustomWorkflowConfig(config: StoredCustomWorkflowConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore quota errors
  }
}

/**
 * Activate either the built-in `minimax_h3_ref2va` template or the user's custom workflow
 * inside `templateRegistry` so `defaultJobRunner.run({ engine: 'minimax-h3', mode: 'control' })`
 * uses the active workflow seamlessly.
 */
export function syncActiveMinimaxTemplateToRegistry(
  config?: StoredCustomWorkflowConfig,
  objectInfo?: Record<string, unknown> | null
): RegisteredTemplate | null {
  const effective = config || loadStoredCustomWorkflowConfig();

  // Always reload bundled templates first so LTX-2.5 and built-in MiniMax H3 are clean
  templateRegistry.clear();
  loadBundledTemplates();

  if (effective.activeSource === 'custom' && effective.rawJson) {
    try {
      const detected = autoDetectWorkflowBindings(effective.rawJson, effective.overrides, objectInfo);
      // Override 'minimax_h3_ref2va' in registry so templateRegistry.find('minimax-h3', 'control') picks the user's custom workflow!
      const customBinding: TemplateBinding = {
        ...detected.binding,
        templateId: 'minimax_h3_ref2va',
      };
      return templateRegistry.register(customBinding, detected.api);
    } catch (err) {
      console.warn('[customWorkflowResolver] Failed to register custom workflow, falling back to built-in:', err);
    }
  }

  return templateRegistry.find('minimax-h3', 'control') || null;
}
