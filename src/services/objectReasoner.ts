/**
 * Object Reasoner — 3Dviz Pro Max step 2 ("reason about the important objects") performed by a
 * language model. Default: a local open-weights model served by Ollama. Also supported:
 * llama.cpp's llama-server, any OpenAI-compatible endpoint (LM Studio, OpenRouter, Groq...) and
 * Google Gemini via an AI Studio API key (free tier).
 *
 * The model receives the user's words (any language, any object) and returns a PartGraph:
 * silhouette, real proportions, identity-defining parts, how they connect, materials and motion.
 * There is no keyword catalog in this path; the model's reasoning decides what gets built.
 */
import {
  HUMANOID_BONES,
  RIG_TYPES,
  SCULPT_ROUTES,
  SCULPT_SHAPES,
  SculptSpec,
  sanitizeSculptSpec,
  applySculptPatch,
} from '../engine/procedural3D/sculptSpec';
import { SilhouetteMetrics } from '../engine/procedural3D/silhouette';
import { EnvironmentSpec, CINEMATIC_ENVIRONMENT_PRESETS } from '../types/environment';
import { getRawStorage } from './storage';

// Legacy compatibility aliases
export type PartGraph = SculptSpec;
export const sanitizePartGraph = sanitizeSculptSpec;

/* ------------------------------------------------------------------------------------------ */
/* Provider settings                                                                           */
/* ------------------------------------------------------------------------------------------ */

export type ReasonerProvider = 'ollama' | 'llamacpp' | 'openai' | 'gemini';

export interface ProviderSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ReasonerSettings {
  provider: ReasonerProvider;
  providers: Record<ReasonerProvider, ProviderSettings>;
}

export interface ProviderInfo {
  id: ReasonerProvider;
  label: string;
  /** Wire protocol used to talk to the provider. */
  protocol: 'ollama' | 'openai' | 'gemini';
  local: boolean;
  needsKey: boolean;
  hint: string;
}

export const PROVIDERS: Record<ReasonerProvider, ProviderInfo> = {
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    protocol: 'ollama',
    local: true,
    needsKey: false,
    hint: 'Local open-weights models. Start with: ollama serve',
  },
  llamacpp: {
    id: 'llamacpp',
    label: 'llama.cpp',
    protocol: 'openai',
    local: true,
    needsKey: false,
    hint: 'Start: llama-server -m model.gguf --port 8080 -c 16384 (grammar-constrained JSON).',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI-compatible',
    protocol: 'openai',
    local: false,
    needsKey: false,
    hint: 'LM Studio, OpenRouter, Groq or any /v1/chat/completions server. Key optional for local servers.',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    protocol: 'gemini',
    local: false,
    needsKey: true,
    hint: 'Free-tier API key from aistudio.google.com/apikey (rate-limited; prompts leave this machine).',
  },
};

/** Base-URL presets for the OpenAI-compatible provider. */
export const OPENAI_COMPATIBLE_PRESETS: { label: string; baseUrl: string }[] = [
  { label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { label: 'vLLM', baseUrl: 'http://127.0.0.1:8000/v1' },
];

export const REASONER_SETTINGS_KEY = 'aids.objectReasoner.settings.v2';
/** Legacy (Ollama-only) keys, migrated on first read. */
export const OLLAMA_URL_KEY = 'aids.objectReasoner.url';
export const OLLAMA_MODEL_KEY = 'aids.objectReasoner.model';
export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
/** ~6.6 GB at Q4: leaves room for LTX in ComfyUI on a 24 GB card. Override in settings. */
export const DEFAULT_REASONER_MODEL = 'qwen3.5:9b-q4_K_M';
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export function defaultReasonerSettings(): ReasonerSettings {
  return {
    provider: 'ollama',
    providers: {
      ollama: { baseUrl: DEFAULT_OLLAMA_URL, model: DEFAULT_REASONER_MODEL, apiKey: '' },
      // llama-server serves whatever GGUF it was started with; the model field is informational.
      llamacpp: { baseUrl: 'http://127.0.0.1:8080/v1', model: 'local', apiKey: '' },
      openai: { baseUrl: OPENAI_COMPATIBLE_PRESETS[0].baseUrl, model: '', apiKey: '' },
      gemini: { baseUrl: GEMINI_BASE_URL, model: DEFAULT_GEMINI_MODEL, apiKey: '' },
    },
  };
}

const storage = (): Storage | null => getRawStorage();

export function getReasonerSettings(): ReasonerSettings {
  const defaults = defaultReasonerSettings();
  const ls = storage();
  if (!ls) return defaults;
  try {
    const raw = ls.getItem(REASONER_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReasonerSettings>;
      const provider = parsed.provider && parsed.provider in PROVIDERS ? parsed.provider : defaults.provider;
      const providers = { ...defaults.providers };
      for (const id of Object.keys(PROVIDERS) as ReasonerProvider[]) {
        providers[id] = { ...defaults.providers[id], ...(parsed.providers?.[id] ?? {}) };
      }
      return { provider, providers };
    }
  } catch {
    /* corrupt settings: fall back to defaults */
  }
  // Migrate the Phase-36 Ollama-only keys.
  const legacyUrl = ls.getItem(OLLAMA_URL_KEY);
  const legacyModel = ls.getItem(OLLAMA_MODEL_KEY);
  if (legacyUrl) defaults.providers.ollama.baseUrl = legacyUrl;
  if (legacyModel) defaults.providers.ollama.model = legacyModel;
  return defaults;
}

export function saveReasonerSettings(settings: ReasonerSettings) {
  storage()?.setItem(REASONER_SETTINGS_KEY, JSON.stringify(settings));
}

/** Active provider + its settings, flattened (what the generator uses). */
export function getReasonerConfig() {
  const s = getReasonerSettings();
  const p = s.providers[s.provider];
  return {
    provider: s.provider,
    info: PROVIDERS[s.provider],
    url: p.baseUrl.trim().replace(/\/+$/, ''),
    model: p.model.trim(),
    apiKey: p.apiKey.trim(),
  };
}

export type ReasonerConfig = ReturnType<typeof getReasonerConfig>;

/** Patch the active (or given) provider's settings. */
export function setReasonerConfig(cfg: { provider?: ReasonerProvider; url?: string; model?: string; apiKey?: string }) {
  const s = getReasonerSettings();
  if (cfg.provider) s.provider = cfg.provider;
  const p = s.providers[s.provider];
  if (cfg.url !== undefined) p.baseUrl = cfg.url;
  if (cfg.model !== undefined) p.model = cfg.model;
  if (cfg.apiKey !== undefined) p.apiKey = cfg.apiKey;
  saveReasonerSettings(s);
}

export function describeReasoner(cfg: ReasonerConfig = getReasonerConfig()) {
  const model = cfg.provider === 'llamacpp' && (!cfg.model || cfg.model === 'local') ? 'loaded GGUF' : cfg.model || '(no model)';
  return `${model} · ${cfg.info.label}${cfg.info.local ? ' (local)' : ''}`;
}

export class ObjectReasonerError extends Error {
  constructor(
    message: string,
    public readonly kind: 'offline' | 'model' | 'invalid' | 'timeout' | 'auth' | 'config'
  ) {
    super(message);
    this.name = 'ObjectReasonerError';
  }
}

const vec3 = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const vec2 = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 };

/** JSON schema handed to reasoners for structured output. */
export const SCULPT_SPEC_JSON_SCHEMA = {
  type: 'object',
  required: ['name', 'identity', 'route', 'rig', 'heightMeters', 'walker', 'materials', 'parts'],
  properties: {
    name: { type: 'string' },
    identity: { type: 'string' },
    route: { type: 'string', enum: [...SCULPT_ROUTES] },
    rig: { type: 'string', enum: [...RIG_TYPES] },
    heightMeters: { type: 'number' },
    walker: {
      type: 'object',
      properties: {
        coat: { type: 'string' },
        belly: { type: 'string' },
        hoof: { type: 'string' },
        horn: { type: 'string' },
        nose: { type: 'string' },
        patches: { type: 'string' },
        female: { type: 'boolean' },
        morphology: {
          type: 'object',
          properties: {
            build: { type: 'string', enum: ['stocky', 'slender', 'humped', 'standard'] },
            neckLength: { type: 'number' },
            neckLean: { type: 'number' },
            horns: { type: 'string', enum: ['none', 'curved', 'spikes', 'antlers'] },
            ears: { type: 'string', enum: ['drooping', 'erect', 'short', 'standard'] },
            tail: { type: 'string', enum: ['tassel', 'short', 'curled', 'standard'] },
            hasDewlap: { type: 'boolean' },
            hasUdder: { type: 'boolean' },
            hasMane: { type: 'boolean' },
            snoutLength: { type: 'number' },
            snoutWidth: { type: 'number' },
          },
        },
      },
    },
    materials: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        required: ['id', 'color', 'roughness', 'metalness'],
        properties: {
          id: { type: 'string', minLength: 1 },
          color: { type: 'string' },
          roughness: { type: 'number' },
          metalness: { type: 'number' },
          emissive: { type: 'boolean' },
          opacity: { type: 'number' },
        },
      },
    },
    parts: {
      type: 'array',
      maxItems: 60,
      items: {
        type: 'object',
        required: ['id', 'shape', 'size', 'position', 'rotation', 'material'],
        properties: {
          id: { type: 'string', minLength: 1 },
          parent: { type: 'string' },
          shape: { type: 'string', enum: [...SCULPT_SHAPES] },
          size: vec3,
          position: vec3,
          rotation: vec3,
          material: { type: 'string', minLength: 1 },
          roundness: { type: 'number' },
          taper: { type: 'number' },
          points: { type: 'array', items: vec3 },
          profile: { type: 'array', items: vec2 },
          outline: { type: 'array', items: vec2 },
          bevel: { type: 'number' },
          mirrorX: { type: 'boolean' },
          bone: { type: 'string', enum: [...HUMANOID_BONES] },
          motion: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['spin', 'swing', 'bob'] },
              axis: { type: 'string', enum: ['x', 'y', 'z'] },
              speed: { type: 'number' },
              amplitude: { type: 'number' },
            },
          },
        },
      },
    },
  },
};

/** Backward-compatibility alias */
export const PART_GRAPH_JSON_SCHEMA = SCULPT_SPEC_JSON_SCHEMA;

/** Revision patch schema */
export const SCULPT_PATCH_JSON_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    heightMeters: { type: 'number' },
    set: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          shape: { type: 'string', enum: [...SCULPT_SHAPES] },
          size: vec3,
          position: vec3,
          rotation: vec3,
          material: { type: 'string' },
          roundness: { type: 'number' },
          taper: { type: 'number' },
          profile: { type: 'array', items: vec2 },
          outline: { type: 'array', items: vec2 },
          bevel: { type: 'number' },
          mirrorX: { type: 'boolean' },
          bone: { type: 'string', enum: [...HUMANOID_BONES] },
        },
      },
    },
    add: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'shape', 'size', 'position', 'rotation', 'material'],
        properties: {
          id: { type: 'string' },
          parent: { type: 'string' },
          shape: { type: 'string', enum: [...SCULPT_SHAPES] },
          size: vec3,
          position: vec3,
          rotation: vec3,
          material: { type: 'string' },
          roundness: { type: 'number' },
          taper: { type: 'number' },
          profile: { type: 'array', items: vec2 },
          outline: { type: 'array', items: vec2 },
          bevel: { type: 'number' },
          mirrorX: { type: 'boolean' },
          bone: { type: 'string', enum: [...HUMANOID_BONES] },
        },
      },
    },
    remove: { type: 'array', items: { type: 'string' } },
  },
};

export const OBJECT_REASONER_SYSTEM_PROMPT = `You are the 3D procedural reasoning stage of an AI film previs workstation. The user gives you a description, a reference image, or silhouette measurements. You decide how to construct the 3D figure using parametric shapes so it is instantly recognisable on set.

Reason before building:
1. Identity: what silhouette, proportions and parts make this object recognisable? Write them in "identity" (one or two sentences).
2. Structure: identity-bearing masses first, then secondary parts. Every part must touch or overlap the part it attaches to - no floating gaps. Supports reach the ground.
3. Shapes to use:
   - "blob": box to ellipsoid via roundness (0 = sharp box, 0.3 = smooth box, 1 = ellipsoid/sphere). Use for organic torsos, heads, limbs, cushions, rocks.
   - "lathe": revolved 2D profile curves for bottles, hats, vases, wheels, glasses, helmets. Profile is an array of [radius, height] pairs from 0 to 1.
   - "extrude": 2D polygon outline (points between -0.5 and 0.5) extruded along depth with bevel. For shields, signage, armor plates, badges.
   - "cylinder": with optional taper (1 = straight, 0.5 = narrower top).
   - "cone", "torus", "tube", "capsule".
4. Rigging: For humanoids or characters, tag parts with "bone" (Head, Chest, Spine, Hips, LeftArm, RightArm, LeftForeArm, RightForeArm, LeftHand, RightHand, LeftUpLeg, RightUpLeg, LeftLeg, RightLeg, LeftFoot, RightFoot) and set rig: "humanoid".
5. Surface: realistic colours (#hex), roughness and metalness per material. Glass/screens may use opacity; lights may be emissive.
6. Behaviour: add motion only where the real object moves (wheels spin, pendulums swing, flags bob).

Routing:
- route "quadruped-walker": ANY real four-legged animal (cow, camel, dog, horse, goat, lion, elephant...). Fill "walker" and leave "parts" empty.
- route "biped-walker": a generic human person. Set walker.female when appropriate. "parts" empty.
- route "author": everything else (characters, creatures, robots, vehicles, buildings, props). Describe 10-60 parts. Still output "walker" with neutral values.

Coordinates for "author" parts: metres, Y up, ground at y=0, front faces +Z, centred on x=0.
- position = centre in object space. rotation = degrees [x,y,z].
- mirrorX = true duplicates a part (and its children) at -x. Give only the +x side for limbs, wings, ears, eyes.
- parent = id of part it attaches to.
- heightMeters = real total height of the object.`;

export const ENVIRONMENT_JSON_SCHEMA = {
  type: 'object',
  required: [
    'name',
    'nameAr',
    'category',
    'promptDescription',
    'weather',
    'timeOfDay',
    'groundSurface',
    'fogDensity',
    'fogColor',
    'skyColor',
    'groundColor',
    'ambientColor',
  ],
  properties: {
    name: { type: 'string' },
    nameAr: { type: 'string' },
    category: {
      type: 'string',
      enum: ['urban', 'nature', 'interior', 'scifi', 'historical', 'studio', 'custom'],
    },
    promptDescription: { type: 'string' },
    weather: {
      type: 'string',
      enum: ['clear', 'fog', 'rain', 'sandstorm', 'snow', 'overcast'],
    },
    timeOfDay: {
      type: 'string',
      enum: ['dawn', 'day', 'golden-hour', 'twilight', 'night', 'neon-night'],
    },
    groundSurface: {
      type: 'string',
      enum: [
        'asphalt-wet',
        'stone-cobblestone',
        'sand-dunes',
        'metal-grate',
        'wood-parquet',
        'grass-terrain',
        'studio-floor',
        'concrete-floor',
      ],
    },
    fogDensity: { type: 'number' },
    fogColor: { type: 'string' },
    skyColor: { type: 'string' },
    groundColor: { type: 'string' },
    ambientColor: { type: 'string' },
  },
};

export const ENVIRONMENT_REASONER_SYSTEM_PROMPT = `You are the environment-reasoning stage of an AI Film Director previs tool.
The director names ANY filming location, environment, or scene setting in any language (English, Arabic, etc.).
You reason about where the scene is shot:
1. Identify the architectural and spatial setting (urban, nature, interior, scifi, historical, studio).
2. Write a rich, vivid 2-3 sentence prompt description for the video generation model (textures, volumetric light, spatial depth).
3. Determine physical parameters: weather, timeOfDay, groundSurface, atmospheric fogDensity (0.005-0.04), fogColor (#hex), skyColor (#hex), groundColor (#hex), ambientColor (#hex).
4. Provide both English name and accurate Arabic name (nameAr).

Return ONLY valid JSON matching the environment schema.`;

export interface ReasonOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onStage?: (stage: string) => void;
  /** Override the stored settings (used by the settings panel's "Test" button). */
  config?: ReasonerConfig;
  /** Optional reference image Base64 or Data URI */
  imageBase64?: string;
  imageMimeType?: string;
  /** Geometric silhouette metrics computed from reference image */
  silhouetteMeasurements?: SilhouetteMetrics;
  /** Existing SculptSpec to revise */
  reviseSpec?: SculptSpec;
  /** Director revision instructions / feedback */
  revisionFeedback?: string;
}

/** Parses data URL or raw base64 into clean base64 string and mimeType */
export function parseBase64Image(dataOrBase64: string, defaultMime = 'image/png'): { base64: string; mimeType: string } {
  if (dataOrBase64.startsWith('data:')) {
    const match = dataOrBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], base64: match[2] };
    }
  }
  return { base64: dataOrBase64.replace(/^data:[^;]+;base64,/, ''), mimeType: defaultMime };
}

/* ------------------------------------------------------------------------------------------ */
/* Request builders (pure — unit tested)                                                       */
/* ------------------------------------------------------------------------------------------ */

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export function buildOllamaRequest(
  cfg: ReasonerConfig,
  prompt: string,
  systemPrompt: string = OBJECT_REASONER_SYSTEM_PROMPT,
  schema: any = PART_GRAPH_JSON_SCHEMA,
  userPrefix: string = 'Object to build: ',
  imageBase64?: string
): ProviderRequest {
  const userMsg: Record<string, unknown> = {
    role: 'user',
    content: `${userPrefix}${prompt}`,
  };
  if (imageBase64) {
    const { base64 } = parseBase64Image(imageBase64);
    userMsg.images = [base64];
  }
  return {
    url: `${cfg.url}/api/chat`,
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: cfg.model,
      stream: false,
      // Planning before emitting JSON is what keeps small local models from looping.
      think: true,
      format: schema,
      // Zero VRAM clash: immediately unload vision model from GPU (keep_alive: 0) so ComfyUI keeps 24GB VRAM!
      keep_alive: imageBase64 ? 0 : '10m',
      options: { temperature: 0.3, num_ctx: 16384, num_predict: 12000 },
      messages: [
        { role: 'system', content: systemPrompt },
        userMsg,
      ],
    },
  };
}

/** Structured-output strictness, relaxed step by step if a server rejects it. */
export type JsonMode = 'schema' | 'object' | 'none';

export function buildOpenAiRequest(
  cfg: ReasonerConfig,
  prompt: string,
  mode: JsonMode = 'schema',
  systemPrompt: string = OBJECT_REASONER_SYSTEM_PROMPT,
  schema: any = PART_GRAPH_JSON_SCHEMA,
  userPrefix: string = 'Object to build: ',
  imageBase64?: string
): ProviderRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  let userContent: unknown = `${userPrefix}${prompt}`;
  if (imageBase64) {
    const { base64, mimeType } = parseBase64Image(imageBase64);
    userContent = [
      { type: 'text', text: `${userPrefix}${prompt}` },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
    ];
  }

  const body: Record<string, unknown> = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 12000,
    stream: false,
  };
  if (cfg.model && !(cfg.provider === 'llamacpp' && cfg.model === 'local')) body.model = cfg.model;
  if (mode === 'schema') {
    // llama-server turns this into a GBNF grammar; OpenAI/OpenRouter/LM Studio honour it natively.
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'reasoner_output', strict: false, schema: schema },
    };
  } else if (mode === 'object') {
    body.response_format = { type: 'json_object' };
  }
  return { url: `${cfg.url}/chat/completions`, headers, body };
}

export function buildGeminiRequest(
  cfg: ReasonerConfig,
  prompt: string,
  mode: JsonMode = 'schema',
  systemPrompt: string = OBJECT_REASONER_SYSTEM_PROMPT,
  schema: any = PART_GRAPH_JSON_SCHEMA,
  userPrefix: string = 'Object to build: ',
  imageBase64?: string
): ProviderRequest {
  const model = cfg.model.replace(/^models\//, '');
  const generationConfig: Record<string, unknown> = {
    temperature: 0.3,
    // Thinking tokens count against this on Gemini 2.5+, so leave generous headroom.
    maxOutputTokens: 32768,
  };
  if (mode !== 'none') generationConfig.responseMimeType = 'application/json';
  if (mode === 'schema') generationConfig.responseJsonSchema = schema;

  const userParts: any[] = [{ text: `${userPrefix}${prompt}` }];
  if (imageBase64) {
    const { base64, mimeType } = parseBase64Image(imageBase64);
    userParts.push({
      inlineData: {
        mimeType,
        data: base64,
      },
    });
  }

  return {
    url: `${cfg.url || GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig,
    },
  };
}

/** Pull the JSON text out of a provider response, throwing on truncation/blocks. */
export function extractResponseText(protocol: ProviderInfo['protocol'], body: any): string {
  if (protocol === 'ollama') {
    if (body?.done_reason === 'length') throw new ObjectReasonerError('The model ran out of tokens before finishing the part graph.', 'invalid');
    return body?.message?.content ?? '';
  }
  if (protocol === 'openai') {
    const choice = body?.choices?.[0];
    if (choice?.finish_reason === 'length') throw new ObjectReasonerError('The model ran out of tokens before finishing the part graph.', 'invalid');
    return choice?.message?.content ?? '';
  }
  const blocked = body?.promptFeedback?.blockReason;
  if (blocked) throw new ObjectReasonerError(`Gemini blocked the prompt (${blocked}).`, 'model');
  const cand = body?.candidates?.[0];
  if (cand?.finishReason === 'MAX_TOKENS') throw new ObjectReasonerError('Gemini ran out of output tokens before finishing the part graph.', 'invalid');
  const parts: any[] = cand?.content?.parts ?? [];
  return parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
}

/** Parse model JSON, tolerating <think> blocks and ``` fences from non-grammar-constrained servers. */
export function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* fall through to lenient parsing */
  }
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new ObjectReasonerError('The model returned malformed JSON for the part graph.', 'invalid');
}

const errorText = (body: any, status: number) => {
  const e = body?.error;
  if (typeof e === 'string') return e;
  if (typeof e?.message === 'string') return e.message;
  return `HTTP ${status}`;
};

function providerError(cfg: ReasonerConfig, status: number, body: any): ObjectReasonerError {
  const msg = errorText(body, status);
  const name = cfg.info.label;
  if (status === 401 || status === 403) {
    return new ObjectReasonerError(`${name} rejected the API key (${msg}). Check it in reasoner settings.`, 'auth');
  }
  if (status === 429) {
    return new ObjectReasonerError(
      `${name} rate limit / quota reached (${msg}). Free tiers allow only a few requests per minute — wait and retry, or switch to a local provider.`,
      'model'
    );
  }
  return new ObjectReasonerError(`${name} model "${cfg.model || 'default'}" failed: ${msg}`, 'model');
}

/* ------------------------------------------------------------------------------------------ */
/* Reasoning                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function validateConfig(cfg: ReasonerConfig) {
  if (!cfg.url) throw new ObjectReasonerError(`${cfg.info.label}: base URL is empty. Open reasoner settings.`, 'config');
  if (cfg.info.needsKey && !cfg.apiKey) {
    throw new ObjectReasonerError(`${cfg.info.label} needs an API key. Open reasoner settings to add one.`, 'config');
  }
  if ((cfg.provider === 'ollama' || cfg.provider === 'gemini') && !cfg.model) {
    throw new ObjectReasonerError(`${cfg.info.label}: choose a model in reasoner settings.`, 'config');
  }
}

const isSchemaRejection = (status: number, body: any) =>
  status === 400 && /schema|response_format|json|unknown name|invalid argument/i.test(errorText(body, status));

/** Ask the configured model to reason a prompt into a SculptSpec / PartGraph. Throws ObjectReasonerError on failure. */
export async function reasonObject(prompt: string, opts: ReasonOptions = {}): Promise<SculptSpec> {
  const cfg = opts.config ?? getReasonerConfig();
  validateConfig(cfg);
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);
  const t0 = Date.now();
  const protocol = cfg.info.protocol;

  // Augment prompt with silhouette measurements and revision instructions if provided
  let augmentedPrompt = prompt;
  if (opts.silhouetteMeasurements) {
    augmentedPrompt += `\n\nReference Image Geometric Silhouette Measurements:\n${opts.silhouetteMeasurements.promptDescription}`;
  }
  if (opts.reviseSpec) {
    augmentedPrompt = `Existing Sculpt Spec to refine:\n${JSON.stringify(opts.reviseSpec, null, 2)}\n\nDirector Revision Instructions: ${opts.revisionFeedback || prompt || 'Refine proportions, parts, and silhouette alignment.'}\n\nReturn the revised SculptSpec or a SculptPatch with modifications.`;
  }

  opts.onStage?.(`Reasoning parts, proportions & materials with ${describeReasoner(cfg)}...`);

  const activeSchema = opts.reviseSpec ? SCULPT_SPEC_JSON_SCHEMA : SCULPT_SPEC_JSON_SCHEMA;

  // Servers differ in structured-output support: try the strict schema first, then relax.
  const modes: JsonMode[] = protocol === 'ollama' ? ['schema'] : ['schema', 'object', 'none'];
  let text = '';
  try {
    for (let i = 0; i < modes.length; i++) {
      const req =
        protocol === 'ollama'
          ? buildOllamaRequest(
              cfg,
              augmentedPrompt,
              OBJECT_REASONER_SYSTEM_PROMPT,
              activeSchema,
              'Object to build: ',
              opts.imageBase64
            )
          : protocol === 'openai'
            ? buildOpenAiRequest(
                cfg,
                augmentedPrompt,
                modes[i],
                OBJECT_REASONER_SYSTEM_PROMPT,
                activeSchema,
                'Object to build: ',
                opts.imageBase64
              )
            : buildGeminiRequest(
                cfg,
                augmentedPrompt,
                modes[i],
                OBJECT_REASONER_SYSTEM_PROMPT,
                activeSchema,
                'Object to build: ',
                opts.imageBase64
              );
      let response: Response;
      try {
        response = await fetch(req.url, {
          method: 'POST',
          signal: ctrl.signal,
          headers: req.headers,
          body: JSON.stringify(req.body),
        });
      } catch {
        if (ctrl.signal.aborted) {
          throw new ObjectReasonerError(`${cfg.info.label} did not answer within ${Math.round(timeoutMs / 1000)} s.`, 'timeout');
        }
        throw new ObjectReasonerError(
          `Cannot reach ${cfg.info.label} at ${cfg.url}. ${cfg.info.hint}` +
            (cfg.info.local ? '' : ' (If the server is reachable, it may be blocking browser CORS requests.)'),
          'offline'
        );
      }
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        text = extractResponseText(protocol, body);
        break;
      }
      if (i < modes.length - 1 && isSchemaRejection(response.status, body)) {
        opts.onStage?.(`${cfg.info.label} rejected strict JSON schema; retrying with relaxed JSON mode...`);
        continue;
      }
      throw providerError(cfg, response.status, body);
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }

  const raw = parseModelJson(text);
  let graph: SculptSpec;
  if (opts.reviseSpec && raw && typeof raw === 'object' && ('set' in raw || 'add' in raw || 'remove' in raw)) {
    graph = applySculptPatch(opts.reviseSpec, raw);
  } else {
    graph = sanitizeSculptSpec(raw, prompt);
  }

  if (graph.route === 'author' && graph.parts.length < 3) {
    throw new ObjectReasonerError('The model described too few parts to build a recognisable object.', 'invalid');
  }
  graph.source = {
    model: `${cfg.model && cfg.model !== 'local' ? cfg.model : 'llama.cpp GGUF'} (${cfg.info.label})`,
    generatedAt: new Date().toISOString(),
    ms: Date.now() - t0,
  };
  return graph;
}

/** Primary alias for reasonObject */
export const reasonSculpt = reasonObject;

/** Ask the configured model to reason a filming location prompt into an EnvironmentSpec. */
export async function reasonEnvironment(
  prompt: string,
  opts: ReasonOptions = {}
): Promise<EnvironmentSpec> {
  const cfg = opts.config ?? getReasonerConfig();
  validateConfig(cfg);
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);
  const protocol = cfg.info.protocol;

  opts.onStage?.(`Reasoning filming environment with ${describeReasoner(cfg)}...`);

  const modes: JsonMode[] = protocol === 'ollama' ? ['schema'] : ['schema', 'object', 'none'];
  let text = '';
  try {
    for (let i = 0; i < modes.length; i++) {
      const req =
        protocol === 'ollama'
          ? buildOllamaRequest(
              cfg,
              prompt,
              ENVIRONMENT_REASONER_SYSTEM_PROMPT,
              ENVIRONMENT_JSON_SCHEMA,
              'Filming location / environment to reason: '
            )
          : protocol === 'openai'
            ? buildOpenAiRequest(
                cfg,
                prompt,
                modes[i],
                ENVIRONMENT_REASONER_SYSTEM_PROMPT,
                ENVIRONMENT_JSON_SCHEMA,
                'Filming location / environment to reason: '
              )
            : buildGeminiRequest(
                cfg,
                prompt,
                modes[i],
                ENVIRONMENT_REASONER_SYSTEM_PROMPT,
                ENVIRONMENT_JSON_SCHEMA,
                'Filming location / environment to reason: '
              );
      let response: Response;
      try {
        response = await fetch(req.url, {
          method: 'POST',
          signal: ctrl.signal,
          headers: req.headers,
          body: JSON.stringify(req.body),
        });
      } catch {
        if (ctrl.signal.aborted) {
          throw new ObjectReasonerError(
            `${cfg.info.label} did not answer within ${Math.round(timeoutMs / 1000)} s.`,
            'timeout'
          );
        }
        throw new ObjectReasonerError(
          `Cannot reach ${cfg.info.label} at ${cfg.url}. ${cfg.info.hint}` +
            (cfg.info.local ? '' : ' (If the server is reachable, it may be blocking browser CORS requests.)'),
          'offline'
        );
      }
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        text = extractResponseText(protocol, body);
        break;
      }
      if (i < modes.length - 1 && isSchemaRejection(response.status, body)) {
        opts.onStage?.(`${cfg.info.label} rejected strict schema; retrying with relaxed mode...`);
        continue;
      }
      throw providerError(cfg, response.status, body);
    }
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }

  const raw = parseModelJson(text) as any;
  const fallback = CINEMATIC_ENVIRONMENT_PRESETS[0].spec;

  const validCategories = ['urban', 'nature', 'interior', 'scifi', 'historical', 'studio', 'custom'];
  const validWeathers = ['clear', 'fog', 'rain', 'sandstorm', 'snow', 'overcast'];
  const validTimes = ['dawn', 'day', 'golden-hour', 'twilight', 'night', 'neon-night'];
  const validSurfaces = [
    'asphalt-wet',
    'stone-cobblestone',
    'sand-dunes',
    'metal-grate',
    'wood-parquet',
    'grass-terrain',
    'studio-floor',
    'concrete-floor',
  ];

  const env: EnvironmentSpec = {
    id: `env-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : prompt,
    nameAr: typeof raw?.nameAr === 'string' && raw.nameAr.trim() ? raw.nameAr.trim() : prompt,
    category: validCategories.includes(raw?.category) ? raw.category : 'custom',
    promptDescription:
      typeof raw?.promptDescription === 'string' && raw.promptDescription.length > 10
        ? raw.promptDescription.trim()
        : `${prompt}, vivid atmospheric surroundings, material textures, surface reflections, and physical depth.`,
    weather: validWeathers.includes(raw?.weather) ? raw.weather : fallback.weather,
    timeOfDay: validTimes.includes(raw?.timeOfDay) ? raw.timeOfDay : fallback.timeOfDay,
    groundSurface: validSurfaces.includes(raw?.groundSurface) ? raw.groundSurface : fallback.groundSurface,
    fogDensity:
      typeof raw?.fogDensity === 'number' && Number.isFinite(raw.fogDensity)
        ? Math.max(0.002, Math.min(0.08, raw.fogDensity))
        : fallback.fogDensity,
    fogColor: typeof raw?.fogColor === 'string' && raw.fogColor ? raw.fogColor : fallback.fogColor,
    skyColor: typeof raw?.skyColor === 'string' && raw.skyColor ? raw.skyColor : fallback.skyColor,
    groundColor: typeof raw?.groundColor === 'string' && raw.groundColor ? raw.groundColor : fallback.groundColor,
    ambientColor: typeof raw?.ambientColor === 'string' && raw.ambientColor ? raw.ambientColor : fallback.ambientColor,
    visibleInPrevis: true,
  };

  return env;
}

/* ------------------------------------------------------------------------------------------ */
/* Model listing / connection test                                                             */
/* ------------------------------------------------------------------------------------------ */

const GEMINI_EXCLUDE = /embedding|aqa|tts|image|imagen|veo|live|audio|native|robotics|computer-use|learnlm/i;

/** List models available from the configured provider (for the settings picker). */
export async function listReasonerModels(config: ReasonerConfig = getReasonerConfig()): Promise<string[]> {
  const cfg = config;
  const protocol = cfg.info.protocol;
  let r: Response;
  try {
    if (protocol === 'ollama') {
      r = await fetch(`${cfg.url}/api/tags`);
    } else if (protocol === 'openai') {
      r = await fetch(`${cfg.url}/models`, {
        headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
      });
    } else {
      if (!cfg.apiKey) throw new ObjectReasonerError('Gemini needs an API key to list models.', 'config');
      r = await fetch(`${cfg.url || GEMINI_BASE_URL}/models?pageSize=1000`, {
        headers: { 'x-goog-api-key': cfg.apiKey },
      });
    }
  } catch (err) {
    if (err instanceof ObjectReasonerError) throw err;
    throw new ObjectReasonerError(`Cannot reach ${cfg.info.label} at ${cfg.url}. ${cfg.info.hint}`, 'offline');
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw providerError(cfg, r.status, body);

  if (protocol === 'ollama') return (body.models ?? []).map((m: any) => m.name as string);
  if (protocol === 'openai') return (body.data ?? []).map((m: any) => m.id as string).filter(Boolean);
  return (body.models ?? [])
    .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m: any) => String(m.name).replace(/^models\//, ''))
    .filter((n: string) => n.startsWith('gemini') && !GEMINI_EXCLUDE.test(n));
}
