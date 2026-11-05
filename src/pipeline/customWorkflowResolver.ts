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
 * Normalize local ComfyUI workflow URLs, local file paths (`D:\...\workflow.json` / `file:///...`),
 * relative ComfyUI userdata workflow names (`workflows/my_workflow.json`), or direct `.json` URLs.
 */
export function normalizeWorkflowUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/^["']+|["']+$/g, '');
  if (!trimmed) return '';

  // Local Windows drive path (e.g. D:\ComfyUI\user\default\workflows\my_workflow.json) or file:// URL
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || /^file:\/\//i.test(trimmed)) {
    return `/api/local-workflow?path=${encodeURIComponent(trimmed)}`;
  }

  // Local ComfyUI userdata friendly URL: http://127.0.0.1:8188/userdata/workflows/foo.json
  const localUserdataMatch = trimmed.match(
    /^(https?:\/\/(?:127\.0\.0\.1|localhost):\d+)\/userdata\/workflows\/(.+)$/i
  );
  if (localUserdataMatch) {
    const encodedPath = encodeURIComponent(`workflows/${decodeURIComponent(localUserdataMatch[2])}`);
    return `${localUserdataMatch[1]}/api/userdata/${encodedPath}`;
  }

  // Relative ComfyUI workflow filename (e.g. "workflows/my_minimax.json" or "my_minimax.json")
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/') && trimmed.toLowerCase().endsWith('.json')) {
    const cleanRel = trimmed.replace(/^workflows[\\/]/i, '');
    const encodedPath = encodeURIComponent(`workflows/${cleanRel}`);
    return `/api/comfy/api/userdata/${encodedPath}`;
  }

  // Civitai model / modelVersion URL -> resolve via backend remote workflow fetcher
  if (/^https?:\/\/(?:www\.)?civitai\.com\//i.test(trimmed)) {
    return `/api/fetch-remote-workflow?url=${encodeURIComponent(trimmed)}`;
  }

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
  'LoadImageCrop (obvpm)': ['image', 'crop_data', 'aspect_ratio', 'crop_mode', 'upload'],
  MiniMaxH3MediaLoader: ['media', 'image', 'video', 'upload'],
  H3PromptIDE: ['prompt'],
  TKMultiImagePrompt: ['prompt'],
  PixaromaText: ['text'],
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
  '[Comfy3D] Load SF3D Model': ['model_name'],
  '[Comfy3D] StableFast3D': ['texture_resolution', 'remesh_option'],
  '[Comfy3D] Resize Image Foreground': ['Foreground_Ratio'],
  '[Comfy3D] Switch Mesh Axis': ['axis_x_to', 'axis_y_to', 'axis_z_to', 'flip_normal', 'scale'],
  '[Comfy3D] Save 3D Mesh': ['save_path'],
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
  definitions?: {
    subgraphs?: Array<{
      id?: string;
      name?: string;
      nodes?: UiWorkflowNode[];
    }>;
  };
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
  const allNodes: UiWorkflowNode[] = [...ui.nodes];
  if (Array.isArray(ui.definitions?.subgraphs)) {
    for (const sg of ui.definitions!.subgraphs!) {
      if (Array.isArray(sg.nodes)) {
        for (const sgNode of sg.nodes) {
          if (!allNodes.some((existing) => String(existing.id) === String(sgNode.id))) {
            allNodes.push(sgNode);
          }
        }
      }
    }
  }

  const nodeMap = new Map<string, UiWorkflowNode>();
  for (const n of allNodes) {
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

  for (const node of allNodes) {
    const id = String(node.id);
    if (!/^[0-9]+(:[0-9]+)*$/.test(id)) continue;
    // Skip muted (2) or bypassed (4) or visual-only nodes, except essential video/image loader or output nodes
    // that workflow authors save bypassed by default in multi-mode templates
    const isEssentialMediaNode =
      /VHS_LoadVideo|LoadVideo|MiniMaxH3MediaLoader|LoadImage|VHS_VideoCombine|SaveVideo/i.test(
        node.type
      );
    if ((node.mode === 2 || node.mode === 4) && !isEssentialMediaNode) continue;
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
      const loadVid = nodeEntries.find(([_, n]) =>
        /VHS_LoadVideo|LoadVideo|MiniMaxH3MediaLoader/i.test(n.class_type)
      );
      if (loadVid) {
        const inName =
          'video' in loadVid[1].inputs
            ? 'video'
            : 'file' in loadVid[1].inputs
            ? 'file'
            : 'media' in loadVid[1].inputs
            ? 'media'
            : 'video';
        controlVideo = { node: loadVid[0], input: inName };
      } else {
        const directorNode = nodeEntries.find(
          ([_, n]) =>
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
      const pVal =
        minimaxEntry[1].inputs['prompt'] ??
        minimaxEntry[1].inputs['positive_prompt'] ??
        minimaxEntry[1].inputs['text'];
      if (isLink(pVal)) {
        const tracedPromptId = traceUpstreamNode(api, pVal, (_id, n) =>
          /PrimitiveString|String|Text|CLIPTextEncode|H3PromptIDE|PixaromaText/i.test(n.class_type)
        );
        if (tracedPromptId) {
          const pNode = api[tracedPromptId];
          const inName =
            'value' in pNode.inputs
              ? 'value'
              : 'text' in pNode.inputs
              ? 'text'
              : 'prompt' in pNode.inputs
              ? 'prompt'
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
          /PrimitiveStringMultiline|PrimitiveString|CLIPTextEncode|H3PromptIDE|TKMultiImagePrompt|PixaromaText/i.test(
            n.class_type
          ) && !String(n._meta?.title || '').toLowerCase().includes('negative')
      );
      if (strNode) {
        const inName =
          'value' in strNode[1].inputs
            ? 'value'
            : 'text' in strNode[1].inputs
            ? 'text'
            : 'prompt' in strNode[1].inputs
            ? 'prompt'
            : 'value';
        prompt = { node: strNode[0], input: inName };
      }
    }
  }
  if (!prompt) {
    const ltxDirector = nodeEntries.find(
      ([_, n]) => /LTXDirectorCS25|LTXDirector/i.test(n.class_type) && 'local_prompts' in n.inputs
    );
    if (ltxDirector) {
      prompt = { node: ltxDirector[0], input: 'local_prompts' };
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
        const tracedImgId = traceUpstreamNode(api, linkVal, (_id, n) =>
          /LoadImage|LoadImageCrop/i.test(n.class_type)
        );
        if (tracedImgId && !usedImageNodes.has(tracedImgId)) {
          detectedRefImages[i] = { node: tracedImgId, input: 'image' };
          usedImageNodes.add(tracedImgId);
          break;
        }
      }
    }
  }

  // Fill any remaining slots with LoadImage / LoadImageCrop nodes in numeric order
  const allLoadImageNodes = nodeEntries.filter(([_, n]) =>
    /^(LoadImage|LoadImageCrop \(obvpm\))$/i.test(n.class_type)
  );
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
        /easy seed|RandomNoise|KSampler|StubeliusH3Director|StubeliusLTXSetup/i.test(n.class_type) &&
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
        (n.class_type === 'PrimitiveFloat' &&
          /duration|seconds|length/i.test(String(n._meta?.title || ''))) ||
        (/StubeliusH3Director|LTXDirector/i.test(n.class_type) && 'duration_seconds' in n.inputs)
    );
    if (durNode) {
      const inName = 'duration_seconds' in durNode[1].inputs ? 'duration_seconds' : 'value';
      durationSeconds = { node: durNode[0], input: inName };
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

  const hasMinimaxCore = nodeEntries.some(([_, n]) =>
    /MiniMax|StubeliusH3|H3Prompt/i.test(n.class_type)
  );
  const isLtxWorkflow =
    !hasMinimaxCore &&
    nodeEntries.some(([_, n]) =>
      /LTXDirector|StubeliusLTX|EmptyLTXVLatentVideo|LTXVConditioning|LTXVScheduler|LTXV|LTX2/i.test(
        n.class_type
      )
    );
  const detectedEngine: 'ltx-2.5' | 'minimax-h3' = isLtxWorkflow ? 'ltx-2.5' : 'minimax-h3';

  const binding: TemplateBinding = {
    schema: 1,
    templateId: detectedEngine === 'ltx-2.5' ? 'ltx25_custom_user' : 'minimax_h3_custom_user',
    engine: detectedEngine,
    label:
      detectedEngine === 'ltx-2.5'
        ? 'Custom User LTX 2.5 Workflow (Auto-Detected Bindings)'
        : 'Custom User MiniMax Workflow (Auto-Detected Bindings)',
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
    frameRule: detectedEngine === 'ltx-2.5' ? '8n+1' : 'any',
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

export interface WorkflowValidationReport {
  valid: boolean;
  errors: string[];
}

/**
 * Detect which studio engine ('ltx-2.5' | 'minimax-h3' | '3d' | null) a workflow belongs to
 * by inspecting its JSON node classes and/or its filename/URL.
 */
export function detectWorkflowEngine(
  rawJson?: string,
  nameOrUrl?: string
): 'ltx-2.5' | 'minimax-h3' | '3d' | null {
  if (rawJson && typeof rawJson === 'string') {
    if (/"(?:class_type|type)"\s*:\s*"[^"]*(?:Hy3D|Hunyuan3D|TripoSR|TreLLIS|VoxelToMesh)/i.test(rawJson)) {
      return '3d';
    }
    const hasMinimax =
      /"(?:class_type|type)"\s*:\s*"[^"]*(?:MiniMax|StubeliusH3|H3Prompt)/i.test(rawJson) ||
      /minimax_h3_(?:ref2va|fl2va|video_vae|audio_vae)|qwen3vl_32b_minimax_h3/i.test(rawJson);
    const hasLtx =
      /"(?:class_type|type)"\s*:\s*"[^"]*(?:LTXDirector|StubeliusLTX|EmptyLTXVLatentVideo|LTXVConditioning|LTXVScheduler|LTXV|LTX2)/i.test(
        rawJson
      ) || /ltx-2\.5-22b|gemma4-12b-with-proj-ltx/i.test(rawJson);
    if (hasMinimax && !hasLtx) return 'minimax-h3';
    if (hasLtx && !hasMinimax) return 'ltx-2.5';
  }

  if (nameOrUrl && typeof nameOrUrl === 'string') {
    const s = nameOrUrl.trim();
    if (/(?:^|[\\/_\-\s])3d(?:[\\/_\-\s.]|$)|image_to_3d|text_to_3d|glb_workflow/i.test(s)) {
      return '3d';
    }
    if (
      /^(?:workflows[\\/])?minimax[\\/]|minimax|stubelius_ultimate_h3|stubeliush3|\bh3_stubelius\b|2834514|2881362|3233131|3383710/i.test(
        s
      )
    ) {
      return 'minimax-h3';
    }
    if (
      /^(?:workflows[\\/])?ltx[\\/]|\bltx\b|ltx2|ltx-2|ltx_2|stubelius_ultimate_ltx|2422765|2318870|3368860|3231942/i.test(
        s
      )
    ) {
      return 'ltx-2.5';
    }
  }

  return null;
}

/**
 * Strictly validate a user-submitted workflow to ensure it can render a 3D Previs shot
 * without conflicts (must have Reference/Control Video node, Prompt node, Video Output node,
 * and match the selected engine).
 */
export function validateWorkflowForStudioRender(
  detected: AutoDetectedWorkflowResult,
  targetEngine?: RenderEngineId
): WorkflowValidationReport {
  const errors: string[] = [];
  const nodeEntries = Object.entries(detected.api || {});

  // 0. Reject 3D mesh generation workflows if submitted to the video Previs render deck
  const has3DCore = nodeEntries.some(([_, n]) =>
    /Hy3D|Hunyuan3D|TripoSR|TreLLIS|VoxelToMesh/i.test(n.class_type)
  );
  if (has3DCore) {
    errors.push(
      'تعارض في نوع الوركفلو (3D Workflow Mismatch): هذا الوركفلو مخصص لتوليد المجسمات ثلاثية الأبعاد (3D Mesh) وليس لريندر الفيديو.'
    );
  }

  // 1. Must have a Reference / Control Video Input node
  if (!detected.detectedSlots.controlVideo) {
    errors.push(
      'مفقود نود الفيديو المرجعي (Missing Reference/Control Video Node): الوركفلو لا يحتوي على نود لتحميل فيديو الـ 3D Previs (مثل VHS_LoadVideo أو LoadVideo أو Director Node).'
    );
  }

  // 2. Must have a Prompt Input node
  if (!detected.detectedSlots.prompt) {
    errors.push(
      'مفقود نود الوصف النصي (Missing Prompt Input Node): الوركفلو لا يحتوي على نود لإدخال النص الوصفي (مثل PrimitiveString أو CLIPTextEncode).'
    );
  }

  // 3. Must have a real Video Save / Output node
  const hasExplicitVideoOutput = nodeEntries.some(([_, n]) =>
    /VHS_VideoCombine|SaveVideo|SaveWEBM|PreviewVideo/i.test(n.class_type)
  );
  if (!hasExplicitVideoOutput) {
    errors.push(
      'مفقود نود حفظ الفيديو (Missing Video Output Node): الوركفلو لا يحتوي على نود لتصدير وحفظ الفيديو النهائي (مثل VHS_VideoCombine أو SaveVideo).'
    );
  }

  // 4. Engine Compatibility Check (LTX-2.5 vs MiniMax H3)
  if (targetEngine) {
    const hasMinimaxCore = nodeEntries.some(([_, n]) =>
      /MiniMax|StubeliusH3|H3Prompt/i.test(n.class_type)
    );
    const hasLtxCore = nodeEntries.some(([_, n]) =>
      /LTXDirector|StubeliusLTX|EmptyLTXVLatentVideo|LTXVConditioning|LTXVScheduler|LTXV|LTX2/i.test(
        n.class_type
      )
    );

    if (targetEngine === 'minimax-h3' && hasLtxCore && !hasMinimaxCore) {
      errors.push(
        'تعارض في المحرك (Engine Mismatch): هذا الوركفلو مخصص لمحرك LTX-2.5 ولا يمكن تشغيله تحت قسم MiniMax H3.'
      );
    } else if (targetEngine === 'ltx-2.5' && hasMinimaxCore && !hasLtxCore) {
      errors.push(
        'تعارض في المحرك (Engine Mismatch): هذا الوركفلو مخصص لمحرك MiniMax H3 ولا يمكن تشغيله تحت قسم LTX-2.5.'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * List saved workflow `.json` files stored inside the user's local ComfyUI server
 * (`ComfyUI/user/default/workflows/` via `/api/userdata?dir=workflows` or IPC sync status).
 * When `engine` is provided, strictly filters out workflows belonging to other engines or 3D.
 */
export async function listLocalComfyWorkflows(engine?: RenderEngineId): Promise<string[]> {
  const filterByEngine = (list: string[]): string[] => {
    if (!engine) return list;
    return list.filter((name) => {
      const detected = detectWorkflowEngine(undefined, name);
      if (detected === '3d') return false;
      if (detected && detected !== engine) return false;
      return true;
    });
  };

  if (typeof window !== 'undefined' && window.electronComfyBridge?.getSyncStatus) {
    try {
      const status = await window.electronComfyBridge.getSyncStatus();
      if (status?.ok && Array.isArray(status.existingWorkflows) && status.existingWorkflows.length > 0) {
        return filterByEngine(status.existingWorkflows);
      }
    } catch {
      // fall through
    }
  }
  const endpoints = [
    'http://127.0.0.1:51731/api/comfy/api/userdata?dir=workflows',
    '/api/comfy/api/userdata?dir=workflows',
    'http://127.0.0.1:8188/api/userdata?dir=workflows',
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          const names = list
            .map((item) => (typeof item === 'string' ? item : item?.path || item?.name || ''))
            .filter((name: string) => name.toLowerCase().endsWith('.json'));
          return filterByEngine(names);
        }
      }
    } catch {
      // try next endpoint
    }
  }
  return [];
}

/**
 * Fetch a workflow JSON from a local ComfyUI URL, local file path, or saved ComfyUI workflow
 * and run `autoDetectWorkflowBindings`.
 */
export async function fetchAndDetectWorkflowFromUrl(
  rawUrl: string,
  overrides?: CustomWorkflowSlotOverrides,
  objectInfo?: Record<string, unknown> | null
): Promise<{ normalizedUrl: string; rawJson: string; result: AutoDetectedWorkflowResult }> {
  const normalizedUrl = normalizeWorkflowUrl(rawUrl);
  if (!normalizedUrl) {
    throw new Error('Please enter a valid local ComfyUI workflow URL or file path.');
  }

  // Check if user pasted the root ComfyUI server URL (e.g., http://127.0.0.1:8188 or http://127.0.0.1:8188/#...)
  const rootComfyMatch = normalizedUrl.match(
    /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/?(?:#.*)?)?$/i
  );
  if (rootComfyMatch) {
    // 1. Try grabbing the most recent active workflow from local ComfyUI /history
    try {
      const histRes = await fetch('/api/comfy/history?max_items=1');
      if (histRes.ok) {
        const histData = (await histRes.json()) as Record<string, any>;
        const promptIds = Object.keys(histData || {});
        if (promptIds.length > 0) {
          const latestEntry = histData[promptIds[promptIds.length - 1]];
          const apiPrompt = latestEntry?.prompt?.[2];
          if (apiPrompt && typeof apiPrompt === 'object') {
            const rawJson = JSON.stringify(apiPrompt, null, 2);
            const result = autoDetectWorkflowBindings(rawJson, overrides, objectInfo);
            return {
              normalizedUrl: 'comfyui_active_history_workflow.json',
              rawJson,
              result,
            };
          }
        }
      }
    } catch {
      // fallback to userdata workflows
    }

    // 2. Try loading the first saved workflow from ComfyUI /api/userdata?dir=workflows
    const savedList = await listLocalComfyWorkflows();
    if (savedList.length > 0) {
      const firstSaved = savedList[0];
      const userdataUrl = `/api/comfy/api/userdata/${encodeURIComponent(`workflows/${firstSaved.replace(/^workflows[\\/]/i, '')}`)}`;
      const savedRes = await fetch(userdataUrl);
      if (savedRes.ok) {
        const rawJson = await savedRes.text();
        const result = autoDetectWorkflowBindings(rawJson, overrides, objectInfo);
        return {
          normalizedUrl: firstSaved,
          rawJson,
          result,
        };
      }
    }

    throw new Error(
      'You entered the root ComfyUI server URL (http://127.0.0.1:8188), which returns the HTML web page rather than a specific .json workflow. Either click "Scan Local ComfyUI Workflows" below to pick a saved workflow, paste a direct local workflow URL/path (e.g. D:\\ComfyUI\\user\\default\\workflows\\my_workflow.json), or click "Upload .JSON".'
    );
  }

  // Check if normalizedUrl routes through our backend /api/fetch-remote-workflow resolver (e.g. Civitai or remote ZIP/JSON)
  if (normalizedUrl.startsWith('/api/fetch-remote-workflow')) {
    if (typeof window !== 'undefined' && window.electronComfyBridge?.fetchRemoteWorkflow) {
      try {
        const parsed = new URL(normalizedUrl, 'http://127.0.0.1:51731');
        const target = (parsed.searchParams.get('url') || rawUrl).trim();
        const ipcData = await window.electronComfyBridge.fetchRemoteWorkflow(target);
        if (ipcData?.ok && ipcData.rawJson) {
          const result = autoDetectWorkflowBindings(ipcData.rawJson, overrides, objectInfo);
          return {
            normalizedUrl: ipcData.filename || rawUrl,
            rawJson: ipcData.rawJson,
            result,
          };
        }
      } catch {
        // fall through to HTTP endpoints
      }
    }

    const endpoints = [
      `http://127.0.0.1:51731${normalizedUrl}`,
      normalizedUrl,
    ];
    let payload: { ok?: boolean; filename?: string; rawJson?: string; error?: string } | null = null;
    let lastErr: unknown = null;
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep);
        const data = (await res.json()) as {
          ok?: boolean;
          filename?: string;
          rawJson?: string;
          error?: string;
        };
        payload = data;
        if (res.ok && data.ok && data.rawJson) {
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }
    if (!payload || !payload.ok || !payload.rawJson) {
      throw new Error(
        payload?.error ||
          (lastErr instanceof Error ? lastErr.message : 'Failed to fetch remote workflow from URL.')
      );
    }
    const result = autoDetectWorkflowBindings(payload.rawJson, overrides, objectInfo);
    return {
      normalizedUrl: payload.filename || rawUrl,
      rawJson: payload.rawJson,
      result,
    };
  }

  let res: Response;
  try {
    res = await fetch(normalizedUrl);
  } catch (err) {
    // If direct fetch to http://127.0.0.1:8188/... failed due to browser CORS, route via /api/comfy proxy
    const localProxyMatch = normalizedUrl.match(/^https?:\/\/(?:127\.0\.0\.1|localhost):(?:8188|8000)(\/.*)$/i);
    if (localProxyMatch) {
      res = await fetch(`/api/comfy${localProxyMatch[1]}`);
    } else {
      throw err;
    }
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch workflow from URL (HTTP ${res.status} ${res.statusText}).`);
  }

  const rawJson = await res.text();
  if (rawJson.trim().startsWith('<!DOCTYPE') || rawJson.trim().startsWith('<html')) {
    throw new Error(
      'The URL returned an HTML page instead of a ComfyUI .json workflow. Please paste a direct .json link, Civitai model link, GitHub link, or click "Upload .JSON".'
    );
  }

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

// ============================================================================
// Multi-Workflow Library & Curated Presets (MiniMax H3 + LTX-2.5)
// ============================================================================

export type RenderEngineId = 'ltx-2.5' | 'minimax-h3';

export interface CuratedBuiltinWorkflow {
  id: string;
  engine: RenderEngineId;
  label: string;
  shortLabel: string;
  description: string;
  baseTemplateId: string;
  uiFilename?: string;
  sourceUrl?: string;
  forcedProfile?: 'draft' | 'final';
  requiresFourRefs?: boolean;
}

export const CURATED_BUILTIN_WORKFLOWS: CuratedBuiltinWorkflow[] = [
  // MiniMax H3 Built-in & Default Workflows
  {
    id: 'minimax_h3_ref2va',
    engine: 'minimax-h3',
    label: 'MiniMax H3 Ref2VA Native (SolAttn + 8-Step Turbo LoRA • 4 Refs + 60fps Audio)',
    shortLabel: 'MiniMax H3 Ref2VA (SolAttn + 8-Step Turbo)',
    description: 'Node 638 Previs Video + 4 Ref Images (<pic 1..4>) → Node 145 60fps RIFE + Audio MP4',
    baseTemplateId: 'minimax_h3_ref2va',
    uiFilename: 'MiniMax_H3_Ref2VA_ComfyUI_Workflow.json',
    requiresFourRefs: false,
  },
  {
    id: 'minimax_h3_t2v_i2v_ref2v_advanced',
    engine: 'minimax-h3',
    label: 'MiniMax H3 T2V / I2V / REF2V Advanced Filmmaking Workflow v2.0 (All Speedups & QoL)',
    shortLabel: 'MiniMax H3 Advanced Filmmaking v2.0 (Ref2V + Speedups)',
    description: 'Civitai Default (#2834514 v3233131) • Ref2V Previs + 4 Refs + SolAttn + 8-Step Turbo + 60fps RIFE',
    baseTemplateId: 'minimax_h3_ref2va',
    uiFilename: 'minimaxH3T2VI2VREF2VAdvanced_v20.json',
    sourceUrl: 'https://civitai.com/models/2834514/minimax-h3-t2v-i2v-ref2v-advanced-filmmaking-workflow-or-all-speedups-qol-features?modelVersionId=3233131',
    requiresFourRefs: false,
  },
  {
    id: 'minimax_h3_seed_hunter',
    engine: 'minimax-h3',
    label: 'MiniMax H3 Seed Hunter v2.51 (Latent Upscaler + Seamless Video Continuation + Ref Mods)',
    shortLabel: 'MiniMax H3 Seed Hunter v2.51 (Latent Upscaler)',
    description: 'Civitai Default (#2881362 v3383710) • Seed Hunter + Latent Upscaler + Seamless Video Continuation',
    baseTemplateId: 'minimax_h3_ref2va',
    uiFilename: 'minimaxH3SEEDHUNTERLatent_v251.json',
    sourceUrl: 'https://civitai.com/models/2881362/minimax-h3-seed-hunter-latent-upscaler-seamless-video-continuation-speedups-ref-mods?modelVersionId=3383710',
    requiresFourRefs: false,
  },
  {
    id: 'h3_stubelius',
    engine: 'minimax-h3',
    label: 'Stubelius Ultimate MiniMax H3 (15-Node Hybrid Director V2)',
    shortLabel: 'Stubelius Ultimate H3 (Hybrid Director V2)',
    description: 'GitHub Default • Node 4 StubeliusH3DirectorV2 Multi-Character Timeline + Previs → Node 12 1080p RTX VSR MP4',
    baseTemplateId: 'h3_stubelius',
    uiFilename: 'Stubelius_Ultimate_H3.json',
    sourceUrl: 'https://github.com/stuubszzz/Stubelius-Ultimate-H3/blob/main/example_workflows/Stubelius_Ultimate_H3.json',
    requiresFourRefs: false,
  },
  {
    id: 'minimax_h3_fast_draft',
    engine: 'minimax-h3',
    label: 'MiniMax H3 Fast Draft (1.0MP Native • Rapid Previs Iteration)',
    shortLabel: 'MiniMax H3 Fast Draft (1.0MP Native)',
    description: 'Fast 1.0MP native pass with 8-Step Turbo LoRA for quick camera & blocking verification',
    baseTemplateId: 'minimax_h3_ref2va',
    uiFilename: 'MiniMax_H3_Ref2VA_ComfyUI_Workflow.json',
    forcedProfile: 'draft',
    requiresFourRefs: false,
  },
  // LTX-2.5 Built-in & Default Workflows
  {
    id: 'ltx25_stubelius',
    engine: 'ltx-2.5',
    label: 'Stubelius Ultimate LTX 2.5 (Distilled 22B INT8 • 1080p Polish + 4 Refs)',
    shortLabel: 'Stubelius Ultimate LTX 2.5 (1080p Polish)',
    description: 'GitHub Default • Node 7 LTXDirectorCS25 Previs Video + 4 Ref Images (@ref1..4) → Node 15 1080p Upscaled MP4',
    baseTemplateId: 'ltx25_stubelius',
    uiFilename: 'Stubelius_Ultimate_LTX.json',
    sourceUrl: 'https://github.com/stuubszzz/Stubelius-Ultimate-LTX2.5/blob/main/example_workflows/Stubelius_Ultimate_LTX.json',
    requiresFourRefs: false,
  },
  {
    id: 'ltx25_devdist_ollama_vsr',
    engine: 'ltx-2.5',
    label: 'LTX 2.5 Dev/Dist I2V & T2V with Ollama + RTX VSR (IC-LoRA Control)',
    shortLabel: 'LTX 2.5 Dev/Dist I2V & T2V (Ollama + RTX VSR)',
    description: 'Civitai Default (#2318870 v3231942) • LTX-2.5 Dev/Distilled + Reference Video IC-LoRA + RTX Video Super Resolution',
    baseTemplateId: 'ltx25_stubelius',
    uiFilename: 'LTX_25_DevDist_I2V_T2V_Ollama_RTX_VSR.json',
    sourceUrl: 'https://civitai.com/models/2318870/ltx-25-devdist-image-to-video-and-text-to-video-with-ollamartx-vsr?modelVersionId=3231942',
    requiresFourRefs: false,
  },
  {
    id: 'ltx25_unlimited_sing_talk',
    engine: 'ltx-2.5',
    label: 'LTX 2.5 Unlimited Video Length • Sing or Talk (Alternating Shots)',
    shortLabel: 'LTX 2.5 Unlimited Length (Sing/Talk Alternating Shots)',
    description: 'Civitai Default (#2422765 v3368860) • Multi-Shot Alternating Camera + Lip-Sync Audio + Reference Video',
    baseTemplateId: 'ltx25_stubelius',
    uiFilename: 'LTX_25_Unlimited_Video_Length_Sing_Talk.json',
    sourceUrl: 'https://civitai.com/models/2422765/ltx-25-unlimited-video-length-sing-or-talk-alternating-shots?modelVersionId=3368860',
    requiresFourRefs: false,
  },
  {
    id: 'ltx25_fast_native',
    engine: 'ltx-2.5',
    label: 'LTX 2.5 Fast Native Direct (Single-Pass Distilled 22B INT8 • No Upscale)',
    shortLabel: 'LTX 2.5 Fast Native Direct (Single-Pass)',
    description: 'Single-pass native resolution directly from Node 7 LTXDirectorCS25 for fast turnaround',
    baseTemplateId: 'ltx25_stubelius',
    uiFilename: 'Stubelius_Ultimate_LTX.json',
    forcedProfile: 'draft',
    requiresFourRefs: false,
  },
  {
    id: 'ltx25_ic_lora_motion',
    engine: 'ltx-2.5',
    label: 'LTX 2.5 High-Adherence IC-LoRA Motion (Strict Camera & Pose Lock)',
    shortLabel: 'LTX 2.5 High-Adherence IC-LoRA Control',
    description: 'Boosted IC-LoRA motion strength (1.0) on Distilled 22B INT8 for strict 3D Previs locking',
    baseTemplateId: 'ltx25_stubelius',
    uiFilename: 'Stubelius_Ultimate_LTX.json',
    requiresFourRefs: false,
  },
];

export interface SavedWorkflowEntry {
  id: string;
  engine: RenderEngineId;
  label: string;
  url: string;
  rawJson: string;
  overrides?: CustomWorkflowSlotOverrides;
  nodeCount: number;
  addedAt: string;
}

export interface WorkflowLibraryState {
  activeWorkflowByEngine: Record<RenderEngineId, string>;
  savedWorkflows: SavedWorkflowEntry[];
}

export interface WorkflowChoiceItem {
  id: string;
  engine: RenderEngineId;
  label: string;
  shortLabel: string;
  description: string;
  kind: 'builtin' | 'custom';
  url?: string;
  uiFilename?: string;
  nodeCount?: number;
  requiresFourRefs?: boolean;
  forcedProfile?: 'draft' | 'final';
  savedEntry?: SavedWorkflowEntry;
}

const WORKFLOW_LIBRARY_KEY = 'cmpvs_workflow_library_v2';

export function loadWorkflowLibrary(): WorkflowLibraryState {
  const defaultState: WorkflowLibraryState = {
    activeWorkflowByEngine: {
      'minimax-h3': 'minimax_h3_ref2va',
      'ltx-2.5': 'ltx25_stubelius',
    },
    savedWorkflows: [],
  };

  try {
    const raw = localStorage.getItem(WORKFLOW_LIBRARY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WorkflowLibraryState>;
      const rawSaved = Array.isArray(parsed.savedWorkflows) ? parsed.savedWorkflows : [];
      let mutated = false;

      // Built-in default source URLs (so legacy pasted duplicates of built-in defaults are deduplicated)
      const builtinUrls = new Set(
        CURATED_BUILTIN_WORKFLOWS.map((b) => b.sourceUrl?.trim().toLowerCase()).filter(Boolean)
      );

      const savedWorkflows: SavedWorkflowEntry[] = [];
      for (const w of rawSaved) {
        if (!w || typeof w !== 'object') {
          mutated = true;
          continue;
        }
        // Remove legacy custom duplicates of the 6 built-in default URLs
        if (w.url && builtinUrls.has(w.url.trim().toLowerCase())) {
          mutated = true;
          continue;
        }
        const detected = detectWorkflowEngine(w.rawJson, `${w.label || ''} ${w.url || ''}`);
        if (detected === '3d') {
          mutated = true;
          continue;
        }
        const trueEngine: RenderEngineId =
          detected === 'ltx-2.5' || detected === 'minimax-h3' ? detected : w.engine;
        if (trueEngine !== w.engine) {
          mutated = true;
        }
        savedWorkflows.push({
          ...w,
          engine: trueEngine,
        });
      }

      const validMinimaxIds = new Set([
        ...CURATED_BUILTIN_WORKFLOWS.filter((b) => b.engine === 'minimax-h3').map((b) => b.id),
        ...savedWorkflows.filter((w) => w.engine === 'minimax-h3').map((w) => w.id),
      ]);
      const validLtxIds = new Set([
        ...CURATED_BUILTIN_WORKFLOWS.filter((b) => b.engine === 'ltx-2.5').map((b) => b.id),
        ...savedWorkflows.filter((w) => w.engine === 'ltx-2.5').map((w) => w.id),
      ]);

      const rawMinimaxActive = parsed.activeWorkflowByEngine?.['minimax-h3'];
      const rawLtxActive = parsed.activeWorkflowByEngine?.['ltx-2.5'];

      const activeMinimax =
        rawMinimaxActive && validMinimaxIds.has(rawMinimaxActive)
          ? rawMinimaxActive
          : defaultState.activeWorkflowByEngine['minimax-h3'];
      const activeLtx =
        rawLtxActive && validLtxIds.has(rawLtxActive)
          ? rawLtxActive
          : defaultState.activeWorkflowByEngine['ltx-2.5'];

      if (activeMinimax !== rawMinimaxActive || activeLtx !== rawLtxActive) {
        mutated = true;
      }

      const nextState: WorkflowLibraryState = {
        activeWorkflowByEngine: {
          'minimax-h3': activeMinimax,
          'ltx-2.5': activeLtx,
        },
        savedWorkflows,
      };

      if (mutated) {
        saveWorkflowLibrary(nextState);
      }

      return nextState;
    }

    // Migrate legacy single custom workflow if present
    const legacy = loadStoredCustomWorkflowConfig();
    if (legacy.rawJson && legacy.url) {
      const detected = autoDetectWorkflowBindings(legacy.rawJson, legacy.overrides);
      const detectedEng = detectWorkflowEngine(legacy.rawJson, `${legacy.label || ''} ${legacy.url || ''}`);
      if (detectedEng === '3d') {
        return defaultState;
      }
      const entryEngine: RenderEngineId = detectedEng || 'minimax-h3';
      const entryId = `custom_wf_${Date.now()}`;
      const migratedEntry: SavedWorkflowEntry = {
        id: entryId,
        engine: entryEngine,
        label: legacy.label || 'Custom Workflow',
        url: legacy.url,
        rawJson: legacy.rawJson,
        overrides: legacy.overrides || {},
        nodeCount: detected.candidates.length,
        addedAt: legacy.updatedAt || new Date().toISOString(),
      };
      return {
        activeWorkflowByEngine: {
          'minimax-h3':
            entryEngine === 'minimax-h3' && legacy.activeSource === 'custom'
              ? entryId
              : 'minimax_h3_ref2va',
          'ltx-2.5':
            entryEngine === 'ltx-2.5' && legacy.activeSource === 'custom'
              ? entryId
              : 'ltx25_stubelius',
        },
        savedWorkflows: [migratedEntry],
      };
    }
  } catch {
    // ignore storage errors
  }

  return defaultState;
}

export function saveWorkflowLibrary(lib: WorkflowLibraryState): void {
  try {
    localStorage.setItem(WORKFLOW_LIBRARY_KEY, JSON.stringify(lib));
  } catch {
    // ignore storage quota errors
  }
}

export function getWorkflowChoicesForEngine(engine: RenderEngineId): WorkflowChoiceItem[] {
  const lib = loadWorkflowLibrary();
  const builtins: WorkflowChoiceItem[] = CURATED_BUILTIN_WORKFLOWS.filter(
    (w) => w.engine === engine
  ).map((w) => ({
    id: w.id,
    engine: w.engine,
    label: w.label,
    shortLabel: w.shortLabel,
    description: w.description,
    kind: 'builtin',
    url: w.sourceUrl,
    uiFilename: w.uiFilename,
    requiresFourRefs: w.requiresFourRefs,
    forcedProfile: w.forcedProfile,
  }));

  const customs: WorkflowChoiceItem[] = lib.savedWorkflows
    .filter((w) => w.engine === engine)
    .map((w) => ({
      id: w.id,
      engine: w.engine,
      label: `${w.label} (${w.nodeCount} nodes)`,
      shortLabel: w.label,
      description: `Added via URL: ${w.url} • ${w.nodeCount} ComfyUI nodes (Auto-Bound)`,
      kind: 'custom',
      url: w.url,
      uiFilename: w.label.endsWith('.json') ? w.label : `${w.label}.json`,
      nodeCount: w.nodeCount,
      requiresFourRefs: false,
      savedEntry: w,
    }));

  return [...builtins, ...customs];
}

export function getActiveWorkflowForEngine(engine: RenderEngineId): WorkflowChoiceItem {
  const lib = loadWorkflowLibrary();
  const choices = getWorkflowChoicesForEngine(engine);
  const activeId = lib.activeWorkflowByEngine[engine];
  return choices.find((c) => c.id === activeId) || choices[0];
}

export function selectActiveWorkflowForEngine(
  engine: RenderEngineId,
  workflowId: string
): WorkflowChoiceItem {
  const lib = loadWorkflowLibrary();
  const choices = getWorkflowChoicesForEngine(engine);
  const found = choices.find((c) => c.id === workflowId) || choices[0];
  lib.activeWorkflowByEngine[engine] = found.id;
  saveWorkflowLibrary(lib);

  // Keep legacy minimax config synced for backward compatibility
  if (engine === 'minimax-h3') {
    if (found.kind === 'custom' && found.savedEntry) {
      saveStoredCustomWorkflowConfig({
        activeSource: 'custom',
        url: found.savedEntry.url,
        label: found.savedEntry.label,
        rawJson: found.savedEntry.rawJson,
        overrides: found.savedEntry.overrides || {},
        updatedAt: found.savedEntry.addedAt,
      });
    } else {
      const prev = loadStoredCustomWorkflowConfig();
      saveStoredCustomWorkflowConfig({
        ...prev,
        activeSource: 'builtin',
      });
    }
  }

  return found;
}

/**
 * Add one or multiple workflow URLs (separated by newlines or commas) into the
 * workflow library for `engine`, strictly validate them for studio rendering,
 * auto-detect their bindings, and select + sync the newly added workflow.
 */
export async function addWorkflowUrlsToLibrary(
  rawUrlInput: string,
  engine: RenderEngineId,
  objectInfo?: Record<string, unknown> | null
): Promise<{ added: SavedWorkflowEntry[]; activeChoice: WorkflowChoiceItem }> {
  const urls = rawUrlInput
    .split(/[\r\n,]+/)
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    throw new Error('Please paste at least one workflow URL or local .json path.');
  }

  const lib = loadWorkflowLibrary();
  const added: SavedWorkflowEntry[] = [];

  for (const rawUrl of urls) {
    const { normalizedUrl, rawJson, result } = await fetchAndDetectWorkflowFromUrl(
      rawUrl,
      {},
      objectInfo
    );
    const rawName = decodeURIComponent(
      normalizedUrl.split(/[\\/]/).pop() || 'custom_workflow.json'
    ).replace(/^.*\?path=/, '');
    const cleanLabel = rawName.split(/[\\/]/).pop() || 'custom_workflow.json';

    // Strictly validate workflow before accepting it into the library
    const validation = validateWorkflowForStudioRender(result, engine);
    if (!validation.valid) {
      throw new Error(
        `تم رفض الوركفلو "${cleanLabel}" لعدم توافقه مع متطلبات الريندر (Workflow Rejected):\n• ${validation.errors.join('\n• ')}`
      );
    }

    // Check if an entry with the same URL & engine already exists; update it if so
    const existingIdx = lib.savedWorkflows.findIndex(
      (w) => w.engine === engine && (w.url === rawUrl || w.url === normalizedUrl)
    );
    const entry: SavedWorkflowEntry = {
      id: existingIdx >= 0 ? lib.savedWorkflows[existingIdx].id : `wf_${engine}_${Date.now()}_${added.length}`,
      engine,
      label: cleanLabel,
      url: rawUrl,
      rawJson,
      overrides: {},
      nodeCount: result.candidates.length,
      addedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      lib.savedWorkflows[existingIdx] = entry;
    } else {
      lib.savedWorkflows.push(entry);
    }
    added.push(entry);
  }

  const lastAdded = added[added.length - 1];
  lib.activeWorkflowByEngine[engine] = lastAdded.id;
  saveWorkflowLibrary(lib);

  const activeChoice = selectActiveWorkflowForEngine(engine, lastAdded.id);
  // Best-effort sync of newly added workflow to ComfyUI
  void ensureWorkflowSyncedToComfyUI(activeChoice);
  return { added, activeChoice };
}

export function addUploadedWorkflowToLibrary(
  filename: string,
  rawJson: string,
  engine: RenderEngineId,
  objectInfo?: Record<string, unknown> | null
): { entry: SavedWorkflowEntry; detected: AutoDetectedWorkflowResult; activeChoice: WorkflowChoiceItem } {
  const detected = autoDetectWorkflowBindings(rawJson, {}, objectInfo);

  // Strictly validate workflow before accepting it into the library
  const validation = validateWorkflowForStudioRender(detected, engine);
  if (!validation.valid) {
    throw new Error(
      `تم رفض الوركفلو "${filename}" لعدم توافقه مع متطلبات الريندر (Workflow Rejected):\n• ${validation.errors.join('\n• ')}`
    );
  }

  const lib = loadWorkflowLibrary();
  const existingIdx = lib.savedWorkflows.findIndex(
    (w) => w.engine === engine && w.label === filename
  );
  const entry: SavedWorkflowEntry = {
    id: existingIdx >= 0 ? lib.savedWorkflows[existingIdx].id : `wf_${engine}_${Date.now()}`,
    engine,
    label: filename,
    url: filename,
    rawJson,
    overrides: {},
    nodeCount: detected.candidates.length,
    addedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    lib.savedWorkflows[existingIdx] = entry;
  } else {
    lib.savedWorkflows.push(entry);
  }
  lib.activeWorkflowByEngine[engine] = entry.id;
  saveWorkflowLibrary(lib);

  const activeChoice = selectActiveWorkflowForEngine(engine, entry.id);
  void ensureWorkflowSyncedToComfyUI(activeChoice);
  return { entry, detected, activeChoice };
}

export interface ComfyWorkflowSyncSummary {
  ok: boolean;
  comfyWorkflowsDir?: string | null;
  syncedCount: number;
  totalCount: number;
  allPresent?: boolean;
  missingCount?: number;
  results?: Array<{
    id: string;
    filename: string;
    diskSynced?: boolean;
    httpSynced?: boolean;
    existsOnDisk?: boolean;
    existsOnHttp?: boolean;
  }>;
  error?: string;
}

/**
 * Check workflow sync status on ComfyUI (disk + HTTP API).
 */
export async function getWorkflowSyncStatusFromServer(): Promise<ComfyWorkflowSyncSummary> {
  if (typeof window !== 'undefined' && window.electronComfyBridge?.getSyncStatus) {
    try {
      const data = await window.electronComfyBridge.getSyncStatus();
      if (data?.ok) {
        const total = data.totalCount ?? 9;
        const missing = data.missingCount ?? (Array.isArray(data.missingDefaultFiles) ? data.missingDefaultFiles.length : 0);
        return {
          ok: true,
          comfyWorkflowsDir: data.comfyWorkflowsDir || data.comfyDir,
          syncedCount: data.syncedCount ?? total - missing,
          totalCount: total,
          allPresent: Boolean(data.allPresent ?? data.allDefaultPresent),
          missingCount: missing,
          results: data.items || [],
        };
      }
    } catch {
      // fall through
    }
  }

  const endpoints = [
    'http://127.0.0.1:51731/api/comfy-sync-workflows',
    '/api/comfy-sync-workflows',
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep);
      if (res.ok) {
        const data = await res.json();
        const total = data.totalCount ?? 9;
        const missing = data.missingCount ?? (Array.isArray(data.missingDefaultFiles) ? data.missingDefaultFiles.length : 0);
        return {
          ok: Boolean(data.ok),
          comfyWorkflowsDir: data.comfyWorkflowsDir || data.comfyDir,
          syncedCount: data.syncedCount ?? total - missing,
          totalCount: total,
          allPresent: Boolean(data.allPresent ?? data.allDefaultPresent),
          missingCount: missing,
          results: data.items || [],
        };
      }
    } catch {
      // try next
    }
  }
  return { ok: false, syncedCount: 0, totalCount: 9, allPresent: false };
}

/**
 * Sync all bundled default workflows (plus any custom workflows in localStorage)
 * to ComfyUI's `user/default/workflows/` folder via backend disk write + ComfyUI HTTP userdata API.
 */
export async function syncAllWorkflowsToComfyUI(
  overwrite = true
): Promise<ComfyWorkflowSyncSummary> {
  const lib = loadWorkflowLibrary();
  const customWorkflows = lib.savedWorkflows.map((w) => ({
    id: w.id,
    filename: w.label.endsWith('.json') ? w.label : `${w.label}.json`,
    subfolder: w.engine === 'ltx-2.5' ? 'LTX' : 'Minimax',
    rawJson: w.rawJson,
  }));

  if (typeof window !== 'undefined' && window.electronComfyBridge?.syncWorkflows) {
    try {
      const data = await window.electronComfyBridge.syncWorkflows({ overwrite, customWorkflows });
      if (data?.ok) {
        return {
          ok: true,
          comfyWorkflowsDir: data.comfyWorkflowsDir || data.comfyDir,
          syncedCount: data.syncedCount ?? data.totalCount ?? 9,
          totalCount: data.totalCount ?? 9,
          allPresent: true,
          missingCount: 0,
          results: data.results || [],
        };
      }
    } catch {
      // fall through
    }
  }

  const endpoints = [
    'http://127.0.0.1:51731/api/comfy-sync-workflows',
    '/api/comfy-sync-workflows',
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overwrite, customWorkflows }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          ok: Boolean(data.ok),
          comfyWorkflowsDir: data.comfyWorkflowsDir || data.comfyDir,
          syncedCount: data.syncedCount ?? data.totalCount ?? 9,
          totalCount: data.totalCount ?? 9,
          allPresent: true,
          missingCount: 0,
          results: data.results || [],
        };
      }
    } catch {
      // try next endpoint
    }
  }
  return {
    ok: false,
    syncedCount: 0,
    totalCount: 9,
    error: 'Could not reach local workflow sync service.',
  };
}

/**
 * Ensure a specific workflow choice (built-in or custom) is synced to ComfyUI
 * when selected from the dropdown or right before rendering.
 */
export async function ensureWorkflowSyncedToComfyUI(
  choice: WorkflowChoiceItem
): Promise<boolean> {
  try {
    const payload =
      choice.kind === 'custom' && choice.savedEntry
        ? {
            overwrite: true,
            customWorkflows: [
              {
                id: choice.savedEntry.id,
                filename: choice.savedEntry.label.endsWith('.json')
                  ? choice.savedEntry.label
                  : `${choice.savedEntry.label}.json`,
                subfolder: choice.engine === 'ltx-2.5' ? 'LTX' : 'Minimax',
                rawJson: choice.savedEntry.rawJson,
              },
            ],
          }
        : {
            overwrite: false,
            onlyFilename: choice.uiFilename,
          };

    if (typeof window !== 'undefined' && window.electronComfyBridge?.syncWorkflows) {
      try {
        const ipcRes = await window.electronComfyBridge.syncWorkflows(payload);
        if (ipcRes?.ok) return true;
      } catch {
        // fall through
      }
    }

    const endpoints = [
      'http://127.0.0.1:51731/api/comfy-sync-workflows',
      '/api/comfy-sync-workflows',
    ];
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) return true;
      } catch {
        // try next
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Automatically sync both 3D workflows (Image-to-3D `ComfyUI_Image_to_3D_GLB_Workflow.json`
 * and Text-to-3D `ComfyUI_Text_to_3D_GLB_Workflow.json`, plus any custom 3D workflow)
 * to ComfyUI's `user/default/workflows/` and `user/default/workflows/3d/` without requiring
 * the user to pick from a dropdown.
 */
export async function ensure3DWorkflowsSyncedToComfyUI(
  custom3DWorkflow?: { filename: string; rawJson: string }
): Promise<boolean> {
  try {
    const payload: Record<string, unknown> = {
      overwrite: Boolean(custom3DWorkflow),
      onlyEngine: '3d',
    };
    if (custom3DWorkflow?.rawJson) {
      payload.customWorkflows = [
        {
          id: 'custom-3d-studio',
          engine: '3d',
          subfolder: '3d',
          filename: custom3DWorkflow.filename || 'Custom_3D_Studio_Workflow.json',
          rawJson: custom3DWorkflow.rawJson,
        },
      ];
    }

    if (typeof window !== 'undefined' && window.electronComfyBridge?.syncWorkflows) {
      try {
        const ipcRes = await window.electronComfyBridge.syncWorkflows(payload);
        if (ipcRes?.ok) return true;
      } catch {
        // fall through
      }
    }

    const endpoints = [
      'http://127.0.0.1:51731/api/comfy-sync-workflows',
      '/api/comfy-sync-workflows',
    ];
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) return true;
      } catch {
        // try next
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function updateSavedWorkflowOverrides(
  workflowId: string,
  overrides: CustomWorkflowSlotOverrides,
  objectInfo?: Record<string, unknown> | null
): AutoDetectedWorkflowResult | null {
  const lib = loadWorkflowLibrary();
  const idx = lib.savedWorkflows.findIndex((w) => w.id === workflowId);
  if (idx < 0) return null;

  const entry = lib.savedWorkflows[idx];
  const detected = autoDetectWorkflowBindings(entry.rawJson, overrides, objectInfo);
  lib.savedWorkflows[idx] = {
    ...entry,
    overrides,
    nodeCount: detected.candidates.length,
  };
  saveWorkflowLibrary(lib);
  return detected;
}

export function removeWorkflowFromLibrary(
  workflowId: string,
  engine: RenderEngineId
): WorkflowChoiceItem {
  const lib = loadWorkflowLibrary();
  lib.savedWorkflows = lib.savedWorkflows.filter((w) => w.id !== workflowId);
  if (lib.activeWorkflowByEngine[engine] === workflowId) {
    const defaultBuiltin = CURATED_BUILTIN_WORKFLOWS.find((w) => w.engine === engine);
    lib.activeWorkflowByEngine[engine] = defaultBuiltin ? defaultBuiltin.id : 'minimax_h3_ref2va';
  }
  saveWorkflowLibrary(lib);
  return getActiveWorkflowForEngine(engine);
}

/**
 * Sync the currently selected workflow (built-in preset or user-added URL workflow)
 * for `engine` into `templateRegistry` and return its `templateId` and metadata.
 */
export function syncActiveEngineWorkflowToRegistry(
  engine: RenderEngineId,
  objectInfo?: Record<string, unknown> | null
): {
  choice: WorkflowChoiceItem;
  templateId: string;
  registered: RegisteredTemplate | null;
} {
  templateRegistry.clear();
  loadBundledTemplates();

  const choice = getActiveWorkflowForEngine(engine);

  if (choice.kind === 'custom' && choice.savedEntry) {
    try {
      const detected = autoDetectWorkflowBindings(
        choice.savedEntry.rawJson,
        choice.savedEntry.overrides,
        objectInfo
      );
      const customTemplateId = choice.savedEntry.id;
      const customBinding: TemplateBinding = {
        ...detected.binding,
        templateId: customTemplateId,
        engine,
        label: choice.savedEntry.label,
        modes: ['control'],
      };
      const reg = templateRegistry.register(customBinding, detected.api);
      return { choice, templateId: customTemplateId, registered: reg };
    } catch (err) {
      console.warn('[customWorkflowResolver] Failed to register custom URL workflow, falling back to built-in:', err);
    }
  }

  // Built-in Curated Workflow preset
  const builtinMeta =
    CURATED_BUILTIN_WORKFLOWS.find((w) => w.id === choice.id) ||
    CURATED_BUILTIN_WORKFLOWS.find((w) => w.engine === engine)!;

  const baseReg = templateRegistry.get(builtinMeta.baseTemplateId);
  if (baseReg) {
    // Ensure 'control' mode is enabled on the selected built-in workflow (e.g. h3_stubelius)
    const modes = baseReg.binding.modes.includes('control')
      ? baseReg.binding.modes
      : [...baseReg.binding.modes, 'control' as const];

    const presetBinding: TemplateBinding = {
      ...structuredClone(baseReg.binding),
      templateId: builtinMeta.id,
      label: builtinMeta.label,
      modes,
    };
    const presetApi = structuredClone(baseReg.api);

    // Apply preset-specific tuning (e.g. High-Adherence IC-LoRA Motion strength 1.0)
    if (builtinMeta.id === 'ltx25_ic_lora_motion' && presetApi['5']?.inputs) {
      presetApi['5'].inputs['ic_lora_strength'] = 1.0;
    }

    const reg = templateRegistry.register(presetBinding, presetApi);
    return { choice, templateId: builtinMeta.id, registered: reg };
  }

  const fallback = templateRegistry.find(engine, 'control') || null;
  return {
    choice,
    templateId: fallback?.binding.templateId || builtinMeta.id,
    registered: fallback,
  };
}
