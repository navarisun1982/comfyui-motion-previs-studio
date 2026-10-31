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
  lookupSculptSpec,
} from '../engine/procedural3D/sculptSpec';
import {
  compileCharacterToClaySculpt,
  extractCharacterFeaturesFromModelOutput,
  CharacterVisualFeatures,
} from '../engine/procedural3D/characterClayCompiler';
import { isHumanoidPrompt, synthesizeRecipeFromImage } from '../engine/procedural3D/imageToRecipe';
import { SilhouetteMetrics, ExtractedPalette } from '../engine/procedural3D/silhouette';
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
    hint: 'Local open-weights models. Note: use a model with vision (e.g. Gemma 4 or Qwen 3.5). Start with: ollama serve',
  },
  llamacpp: {
    id: 'llamacpp',
    label: 'llama.cpp',
    protocol: 'openai',
    local: true,
    needsKey: false,
    hint: 'Start: llama-server -m model.gguf --mmproj mmproj.gguf --port 8080 -c 16384. Note: use a model with vision (e.g. Gemma 4 or Qwen 3.5).',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI-compatible',
    protocol: 'openai',
    local: false,
    needsKey: false,
    hint: 'Sign in directly with your ChatGPT account in the browser, or connect any OpenAI-compatible API endpoint.',
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
  { label: 'OpenAI (Browser Sign-In)', baseUrl: '/api/openai' },
  { label: 'OpenAI (Official API)', baseUrl: 'https://api.openai.com/v1' },
  { label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { label: 'vLLM', baseUrl: 'http://127.0.0.1:8000/v1' },
];

export const OPENAI_MODEL_PRESETS: { id: string; label: string }[] = [
  { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol (Flagship Reasoning)' },
  { id: 'gpt-6.1-sol', label: 'gpt-6.1-sol (Frontier)' },
  { id: 'gpt-6-luna', label: 'gpt-6-luna (Fast Reasoning)' },
  { id: 'gpt-4o', label: 'gpt-4o (Vision)' },
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini (Fast Vision)' },
  { id: 'o3-mini', label: 'o3-mini' },
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

export const GEMINI_MODEL_PRESETS: { id: string; label: string; desc: string }[] = [
  { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', desc: 'Fast Multimodal (Recommended · Free tier)' },
  { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite', desc: 'Ultra-fast lightweight (Free tier)' },
  { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro', desc: 'Deep Reasoning (Free tier)' },
  { id: 'gemini-flash-latest', label: 'gemini-flash-latest', desc: 'Always latest flash model' },
  { id: 'gemini-pro-latest', label: 'gemini-pro-latest', desc: 'Always latest pro model' },
];

export function defaultReasonerSettings(): ReasonerSettings {
  return {
    provider: 'ollama',
    providers: {
      ollama: { baseUrl: DEFAULT_OLLAMA_URL, model: DEFAULT_REASONER_MODEL, apiKey: '' },
      // llama-server serves whatever GGUF it was started with; the model field is informational.
      llamacpp: { baseUrl: 'http://127.0.0.1:8080/v1', model: 'local', apiKey: '' },
      openai: { baseUrl: OPENAI_COMPATIBLE_PRESETS[0].baseUrl, model: 'gpt-5.6-sol', apiKey: '' },
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
      // Migrate deprecated models (Gemini 1.5/2.0 series retired by Google) to gemini-2.5-flash
      const deprecatedGeminiModels = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      if (!providers.gemini.model || deprecatedGeminiModels.includes(providers.gemini.model)) {
        providers.gemini.model = DEFAULT_GEMINI_MODEL;
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
  const provider = s.provider && s.provider in PROVIDERS ? s.provider : 'ollama';
  const p = s.providers?.[provider] || { baseUrl: '', model: '', apiKey: '' };
  return {
    provider,
    info: PROVIDERS[provider] || PROVIDERS.ollama,
    url: (p.baseUrl || '').trim().replace(/\/+$/, ''),
    model: (p.model || '').trim(),
    apiKey: (p.apiKey || '').trim(),
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

/** JSON schema handed to reasoners for structured output. Declarative 3D recipe standard. */
export const SCULPT_SPEC_JSON_SCHEMA = {
  type: 'object',
  required: ['name', 'route', 'heightMeters', 'parts'],
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
      maxItems: 32,
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
        required: ['id', 'shape', 'size', 'position', 'rotation'],
        properties: {
          id: { type: 'string', minLength: 1 },
          parent: { type: 'string' },
          shape: { type: 'string', enum: [...SCULPT_SHAPES, 'box'] },
          size: vec3,
          position: vec3,
          rotation: vec3,
          material: { type: 'string' },
          color: { type: 'string' },
          roundness: { type: 'number' },
          taper: { type: 'number' },
          points: { type: 'array', items: vec3 },
          profile: { type: 'array', items: vec2 },
          outline: { type: 'array', items: vec2 },
          bevel: { type: 'number' },
          mirror: { type: 'boolean' },
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
          shape: { type: 'string', enum: [...SCULPT_SHAPES, 'box'] },
          size: vec3,
          position: vec3,
          rotation: vec3,
          material: { type: 'string' },
          color: { type: 'string' },
          roundness: { type: 'number' },
          taper: { type: 'number' },
          profile: { type: 'array', items: vec2 },
          outline: { type: 'array', items: vec2 },
          bevel: { type: 'number' },
          mirror: { type: 'boolean' },
          mirrorX: { type: 'boolean' },
          bone: { type: 'string', enum: [...HUMANOID_BONES] },
        },
      },
    },
    add: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'shape', 'size', 'position', 'rotation'],
        properties: {
          id: { type: 'string' },
          parent: { type: 'string' },
          shape: { type: 'string', enum: [...SCULPT_SHAPES, 'box'] },
          size: vec3,
          position: vec3,
          rotation: vec3,
          material: { type: 'string' },
          color: { type: 'string' },
          roundness: { type: 'number' },
          taper: { type: 'number' },
          profile: { type: 'array', items: vec2 },
          outline: { type: 'array', items: vec2 },
          bevel: { type: 'number' },
          mirror: { type: 'boolean' },
          mirrorX: { type: 'boolean' },
          bone: { type: 'string', enum: [...HUMANOID_BONES] },
        },
      },
    },
    remove: { type: 'array', items: { type: 'string' } },
  },
};

export const OBJECT_REASONER_SYSTEM_PROMPT = `You are the Lead 3D Procedural Reasoning Stage of an AI Film Previs Workstation.
Your mission is to sculpt ANY concept, prop, jewelry, vehicle, furniture, vessel, weapon, tech device, creature, or character as an authentic declarative recipe (SculptSpec) of soft, parametric 3D geometric parts.
NEVER resort to primitive stacked cylinders, stepped cakes, or blocky pedestals. Every subject must exhibit believable physical anatomy, foundational support, and realistic PBR materials.

═══════════════════════════════════════════════════════════════════════════════
CRITICAL CATEGORY-SPECIFIC GEOMETRIC RULES & SPATIAL ANCHORS
═══════════════════════════════════════════════════════════════════════════════

1. HOLLOW & CIRCULAR OBJECTS (Rings, Tires, Bracelets, Torcs, Crowns, Tubes, Collars):
   - STRICT ENFORCEMENT: NEVER use a solid cylinder or solid disc for a ring, band, or hollow loop!
   - Must use "torus" or 3D swept "tube" with a central circular void.
   - The primary finger/wrist hole MUST be hollow (inner hole preserved by torus geometry).
   - For helical/coiled shapes (e.g. coiled snake ring): layer overlapping/angled torus coils or 3D points, adding sculptural head/tail accents.
   - Example Ring Band Anchor:
     * id: "ring_band_torus", shape: "torus", size: [0.022, 0.003, 0], position: [0, 0.015, 0], rotation: [90, 0, 0], material: "polished_gold"

2. VEHICLES, AUTOMOBILES & TRANSPORTS:
   - HIERARCHY RULE: ALWAYS define the foundational underbody chassis/belly first at lowest Y.
   - NEVER float parts disconnected in space.
   - Structure: Chassis base -> sculpted aerodynamic hood/body -> greenhouse cockpit canopy -> front splitter & rear spoiler -> 4 alloy wheels with rubber tires.
   - Symmetrical parts (wheels, rims, headlights, side mirrors): specify only left side with mirrorX: true.
   - Ground contact: wheel bottoms sit firmly on the ground (Y = radius).

3. FURNITURE, CHAIRS & APPLIANCES:
   - GROUNDED BASE FIRST: For office/swivel chairs, define the 5-star caster base on the floor (Y ~0.06), vertical gas-lift cylinder (Y ~0.25), under-seat mechanism box, then waterfall seat cushion, mesh backrest, headrest, and bilateral armrests.
   - For tables/sofas: 4 sturdy legs or base plinth first, followed by structural frame, tabletop or seat cushions.

4. WEAPONS, SWORDS & TOOLS:
   - ANATOMICAL ACCURACY:
     * Blade: tapered double-edged blade using "box" with taper >0.3 or "extrude", with central fuller groove and piercing tip ("cone").
     * Crossguard: central block with bilateral flared quillons (mirrorX: true) and quillon finials.
     * Hilt: cylindrical or contoured grip with ribbed wrap texture.
     * Pommel: heavy counterbalance wheel pommel at the base (Y ~0.04) with inlaid jewel/gem.

5. VESSELS, BOTTLES, FLASKS & CONTAINERS:
   - VOLUMETRIC TRANSITIONS:
     * Indented punt base ("cylinder" with negative taper).
     * Main cylindrical vessel body.
     * Tapered graceful shoulder curve ("cylinder" with positive taper ~0.6 or "blob").
     * Slender cylindrical neck.
     * Toroidal lip collar ("torus" rotated [90, 0, 0]).
     * Seal: foil capsule, natural cork stopper, or threaded cap.
     * Brand: front paper label plate.

6. MATERIAL & PBR CALIBRATION:
   - Mirror metals (Gold, Chrome, High-Carbon Steel, Titanium): roughness 0.08 - 0.22, metalness 0.85 - 1.0.
   - Translucent Glass & Gemstones (Wine bottles, emeralds, rubies): roughness 0.05 - 0.12, metalness 0.05 - 0.2, opacity 0.5 - 0.85.
   - Matte organics (Leather, Wood, Fabric, Rubber, Mesh, Paper): roughness 0.65 - 0.9, metalness 0.0 - 0.05.
   - Emissive accents (LED headlights, glowing indicators, plasma cores): set emissive: true.

7. CONSUMER GOODS, PACKAGING, POUCHES, BOXES & EVERYDAY OBJECTS:
   - SOLID CONTINUITY & ZERO FLOATING PIECES:
     * For chip bags, snack packets, and coffee pouches: Model the core body as a puffed pillow hull ("blob" or rounded box). Top and bottom crimped seals ("box") MUST overlap the body's top and bottom surfaces directly. NEVER place seals or labels floating in the air with empty space!
     * For simple geometric objects (books, boxes, phones, bricks, soap): Keep the model simple, solid, and tightly bounded (1 to 4 unified parts). Do NOT invent unnecessary disconnected parts!

═══════════════════════════════════════════════════════════════════════════════
PART GRAPH CONSTRAINTS
═══════════════════════════════════════════════════════════════════════════════
- PART COUNT PROPORTIONALITY:
  * Simple everyday items, packaged food/goods (pack of chips, snack bag, cereal box, soap bar, can, book, smartphone, simple prop): MUST use between 1 and 4 tightly unified, intersecting parts. NEVER split a simple everyday package or box into disjointed floating pieces!
  * Medium objects (chair, table, bottle, sword): 4 to 12 functional parts.
  * Complex mechanical assemblies (vehicles, aircraft, robotic creatures): 10 to 35 parts.
- PHYSICAL SOLIDITY & ZERO-GAP ENFORCEMENT:
  * Every single part MUST physically touch and overlap its adjacent support structure or parent part.
  * Units are METRES. Real-world scale is mandatory (e.g. chip bag ~0.25, ring ~0.035, car ~1.25, chair ~1.15, sword ~1.18, bottle ~0.32).
  * Coordinates: +Y is UP, +Z is FORWARD, +X is LEFT. Floor is at Y = 0.
- Output pure JSON strictly adhering to SCULPT_SPEC_JSON_SCHEMA.`;

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
  /** Extracted color palette from reference image */
  extractedPalette?: ExtractedPalette | Partial<CharacterVisualFeatures['palette']>;
}

/** Parses data URL or raw base64 into clean base64 string and mimeType */
export function parseBase64Image(dataOrBase64: string, defaultMime = 'image/png'): { base64: string; mimeType: string } {
  if (dataOrBase64.startsWith('data:')) {
    const commaIdx = dataOrBase64.indexOf(',');
    if (commaIdx !== -1) {
      const header = dataOrBase64.slice(5, commaIdx);
      const mime = header.split(';')[0] || defaultMime;
      const base64 = dataOrBase64.slice(commaIdx + 1);
      return { mimeType: mime, base64 };
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
  modeOrSystemPrompt: JsonMode | string = 'schema',
  systemPromptOrSchema: any = OBJECT_REASONER_SYSTEM_PROMPT,
  schemaOrPrefix: any = PART_GRAPH_JSON_SCHEMA,
  userPrefixOrImage?: string,
  imageBase64?: string
): ProviderRequest {
  let mode: JsonMode = 'schema';
  let systemPrompt = OBJECT_REASONER_SYSTEM_PROMPT;
  let schema = PART_GRAPH_JSON_SCHEMA;
  let userPrefix = 'Object to build: ';
  let imgBase64 = imageBase64;

  if (modeOrSystemPrompt === 'schema' || modeOrSystemPrompt === 'object' || modeOrSystemPrompt === 'none') {
    mode = modeOrSystemPrompt;
    if (typeof systemPromptOrSchema === 'string') systemPrompt = systemPromptOrSchema;
    if (schemaOrPrefix && typeof schemaOrPrefix === 'object') schema = schemaOrPrefix;
    if (typeof userPrefixOrImage === 'string') {
      if (userPrefixOrImage.startsWith('data:') || userPrefixOrImage.length > 50) {
        imgBase64 = userPrefixOrImage;
      } else {
        userPrefix = userPrefixOrImage;
      }
    }
  } else {
    // Legacy signature: (cfg, prompt, systemPrompt, schema, userPrefix, imageBase64)
    systemPrompt = modeOrSystemPrompt;
    if (systemPromptOrSchema) schema = systemPromptOrSchema;
    if (typeof schemaOrPrefix === 'string') userPrefix = schemaOrPrefix;
    if (typeof userPrefixOrImage === 'string' && (userPrefixOrImage.startsWith('data:') || userPrefixOrImage.length > 50)) {
      imgBase64 = userPrefixOrImage;
    }
  }

  const userMsg: Record<string, unknown> = {
    role: 'user',
    content: `${userPrefix}${prompt}`,
  };
  if (imgBase64) {
    const { base64 } = parseBase64Image(imgBase64);
    userMsg.images = [base64];
  }
  return {
    url: `${cfg.url}/api/chat`,
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: cfg.model,
      stream: false,
      // When in relaxed 'object' mode or when vision is active, disable thinking to prevent token exhaustion
      think: mode === 'object' || Boolean(imgBase64) ? false : true,
      format: mode === 'object' ? 'json' : schema,
      // Zero VRAM clash: immediately unload vision model from GPU (keep_alive: 0) so ComfyUI keeps 24GB VRAM!
      keep_alive: imgBase64 ? 0 : '10m',
      options: { temperature: 0.25, num_ctx: 8192, num_predict: 4096 },
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
    max_tokens: 4096,
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

/** Strips schema keywords unsupported by Google Gemini API (minItems, maxItems, minLength, maxLength) */
export function cleanSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(cleanSchemaForGemini);
  const copy: Record<string, any> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'minItems' || k === 'maxItems' || k === 'minLength' || k === 'maxLength' || k === '$schema') {
      continue;
    }
    copy[k] = cleanSchemaForGemini(v);
  }
  return copy;
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
  if (mode === 'schema') generationConfig.responseJsonSchema = cleanSchemaForGemini(schema);

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
    const content = body?.message?.content ?? '';
    if (body?.done_reason === 'length') {
      const parsed = parseModelJson(content) as any;
      if (parsed && typeof parsed === 'object' && (Array.isArray(parsed.parts) || Array.isArray(parsed?.recipe?.parts))) {
        return content;
      }
      throw new ObjectReasonerError('The model ran out of tokens before finishing the part graph.', 'invalid');
    }
    return content;
  }
  if (protocol === 'openai') {
    const choice = body?.choices?.[0];
    const content = typeof choice?.message?.content === 'string' ? choice.message.content : '';
    const reasoning = typeof choice?.message?.reasoning_content === 'string' ? choice.message.reasoning_content : '';
    const resText = content.trim() ? content : reasoning;
    if (choice?.finish_reason === 'length' && (!resText.includes('{') || !resText.includes('}'))) {
      throw new ObjectReasonerError('The model ran out of tokens before finishing the part graph.', 'invalid');
    }
    return resText;
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
    const candidate = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Lenient repair: remove trailing commas before } or ]
      try {
        const trailingCommasRemoved = candidate.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(trailingCommasRemoved);
      } catch {
        /* fall through */
      }
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
/* Wire URL Resolution (Vite Dev Proxy)                                                        */
/* ------------------------------------------------------------------------------------------ */

/**
 * In browser environment under the Vite dev server (port 5173), calls to local services like Ollama (port 11434)
 * or llama.cpp (port 8080) are rewritten to relative dev-server proxy paths to prevent CORS preflight blocks.
 * In Electron desktop apps (file:// protocol or Electron user-agent) or production builds, connects directly to the server.
 */
export function resolveWireUrl(url: string, provider: ReasonerProvider): string {
  if (typeof window === 'undefined') return url;

  const loc = window.location;
  if (!loc) return url;

  const isFileProtocol = loc.protocol && loc.protocol.startsWith('file:');
  const isElectron = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');
  const isDevServer =
    (loc.port === '5173' || Boolean((import.meta as any).env?.DEV)) &&
    !isFileProtocol &&
    !isElectron;

  if (isFileProtocol && url.startsWith('/api/')) {
    return `http://127.0.0.1:5173${url}`;
  }

  if (!isDevServer) return url;

  if (provider === 'ollama') {
    return url.replace(/^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):11434/i, '/api/ollama');
  }
  if (provider === 'llamacpp') {
    return url.replace(/^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):8080/i, '/api/llamacpp');
  }
  return url;
}

/* ------------------------------------------------------------------------------------------ */
/* Reasoning                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function validateConfig(cfg: ReasonerConfig) {
  if (!cfg.url) throw new ObjectReasonerError(`${cfg.info.label}: base URL is empty. Open reasoner settings.`, 'config');
  const isOpenAiBrowser = cfg.provider === 'openai' && (cfg.url.startsWith('/api/openai') || cfg.url.includes('/api/openai'));
  if (cfg.info.needsKey && !cfg.apiKey && !isOpenAiBrowser) {
    throw new ObjectReasonerError(`${cfg.info.label} needs an API key. Open reasoner settings to add one.`, 'config');
  }
  if ((cfg.provider === 'ollama' || cfg.provider === 'gemini') && !cfg.model) {
    throw new ObjectReasonerError(`${cfg.info.label}: choose a model in reasoner settings.`, 'config');
  }
}

const isSchemaRejection = (status: number, body: any) =>
  status === 400 &&
  /schema|response_format|json|unknown name|invalid argument|grammar|gbnf|sampler|failed to parse/i.test(
    errorText(body, status)
  );

function normalizeExtractedPalette(p?: ExtractedPalette | Partial<CharacterVisualFeatures['palette']>): {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  dominantColors: string[];
} | null {
  if (!p) return null;
  const raw = p as any;
  const primaryColor = raw.primaryColor || raw.primaryClothing || raw.leather || '#24150e';
  const secondaryColor = raw.secondaryColor || raw.secondaryClothing || raw.metal || '#4a2c1b';
  const accentColor = raw.accentColor || raw.weaponAccent || '#c69a38';
  const dominantColors =
    Array.isArray(raw.dominantColors) && raw.dominantColors.length > 0
      ? raw.dominantColors
      : [primaryColor, secondaryColor, accentColor];
  return { primaryColor, secondaryColor, accentColor, dominantColors };
}

/** Ask the configured model to reason a prompt into a SculptSpec / PartGraph. Throws ObjectReasonerError on failure. */
export async function reasonObject(prompt: string, opts: ReasonOptions = {}): Promise<SculptSpec> {
  const cfg = opts.config ?? getReasonerConfig();
  validateConfig(cfg);
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);
  const t0 = Date.now();
  const protocol = cfg.info.protocol;
  const normPal = normalizeExtractedPalette(opts.extractedPalette);

  // Augment prompt with CozyClay 12-row outline span measurements and revision instructions if provided
  let augmentedPrompt = prompt;
  if (opts.imageBase64) {
    const isHuman = isHumanoidPrompt(prompt);
    const cozyRules = `COZYCLAY RECIPE RULES:
- First use the measured 12-row reference outline below (where each slice y=0..1 from head top down gives horizontal filled spans [startX, endX] as fractions of height from horizontal centre).
- Place every part's world position [x, y, z] and size [w, h, d] directly on those measured landmarks in metres (floor y=0, front +z, subject's left +x, mirrorX: true reflects across x=0).
- Note: part positions in SculptSpec are object-space world coordinates (not relative offsets).
- For organic clay forms (body, head, limbs, clothing, creatures), use shape: "blob" with high roundness (0.75 to 1.0 = smooth ellipsoid) and taper (-1 to 1).`;

    augmentedPrompt = isHuman
      ? `Attached concept reference image of a character. Sculpt the character anatomy, costuming, hair, accessories, and gear into 15 to 45 soft clay parts with authentic sampled hex colors (#rrggbb). Set rig: "humanoid".\n${cozyRules}\n\n${augmentedPrompt}`
      : `Attached reference image of a subject/object/prop. Sculpt its true physical parts, body, limbs/panels, and details into 8 to 35 soft volumetric parts with authentic sampled hex colors (#rrggbb).\n${cozyRules}\n\n${augmentedPrompt}`;
  }
  if (opts.silhouetteMeasurements) {
    const ar = opts.silhouetteMeasurements.aspectRatio;
    let shapeHint = '';
    if (ar < 0.85) {
      shapeHint = `\nPhysical Shape Analysis: Wide and shallow/flat object (aspect ratio ${ar}:1), such as a baking pan, roasting tray, dish, chassis, or flat container. Model its flat bottom base plate, perimeter raised walls/rim, and hollow interior cavity. Do NOT stack horizontal slices or cylinders.`;
    } else if (ar > 1.8) {
      shapeHint = `\nPhysical Shape Analysis: Tall, slender upright object (aspect ratio ${ar}:1), such as a bottle, column, staff, or tall vessel.`;
    }
    augmentedPrompt += `\n\nReference Image Geometric Silhouette Measurements:\n${opts.silhouetteMeasurements.promptDescription}${shapeHint}`;
  }
  if (normPal) {
    augmentedPrompt += `\n\nReference Image Extracted Hex Colors (You MUST use these exact sampled hex values in materials and parts):\n- Primary Color: ${normPal.primaryColor}\n- Secondary Color: ${normPal.secondaryColor}\n- Accent Color: ${normPal.accentColor}\n- Dominant Palette Swatches: ${normPal.dominantColors.join(', ')}`;
  }
  if (opts.reviseSpec) {
    augmentedPrompt = `Existing Sculpt Spec to refine:\n${JSON.stringify(opts.reviseSpec, null, 2)}\n\nDirector Revision Instructions: ${opts.revisionFeedback || prompt || 'Refine proportions, parts, and silhouette alignment.'}\n\nReturn the revised SculptSpec or a SculptPatch with modifications.`;
  }

  opts.onStage?.(`Reasoning parts, proportions & materials with ${describeReasoner(cfg)}...`);

  const activeSchema = opts.reviseSpec ? SCULPT_SPEC_JSON_SCHEMA : SCULPT_SPEC_JSON_SCHEMA;

  // Servers differ in structured-output support: try the strict schema first, then relax.
  const modes: JsonMode[] = protocol === 'ollama' ? ['schema', 'object'] : ['schema', 'object', 'none'];
  let text = '';
  try {
    for (let i = 0; i < modes.length; i++) {
      const req =
        protocol === 'ollama'
          ? buildOllamaRequest(
              cfg,
              augmentedPrompt,
              modes[i],
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
        const wireUrl = resolveWireUrl(req.url, cfg.provider);
        response = await fetch(wireUrl, {
          method: 'POST',
          signal: ctrl.signal,
          headers: req.headers,
          body: JSON.stringify(req.body),
        });
      } catch (err: any) {
        if (ctrl.signal.aborted) {
          throw new ObjectReasonerError(`${cfg.info.label} did not answer within ${Math.round(timeoutMs / 1000)} s.`, 'timeout');
        }
        const detail = err?.message ? ` (${err.message})` : '';
        throw new ObjectReasonerError(
          `Cannot reach ${cfg.info.label} at ${cfg.url}${detail}. ${cfg.info.hint}` +
            (cfg.info.local ? '' : ' (If the server is reachable, it may be blocking browser CORS requests.)'),
          'offline'
        );
      }
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        try {
          text = extractResponseText(protocol, body);
          break;
        } catch (extractErr) {
          if (i < modes.length - 1) {
            opts.onStage?.(`${cfg.info.label} output truncated or schema rejected; retrying with relaxed JSON mode...`);
            continue;
          }
          throw extractErr;
        }
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
    const rawParts = (raw as any)?.parts ?? (raw as any)?.recipe?.parts;
    const hasValidParts = Array.isArray(rawParts) && rawParts.length >= 3;
    const isHuman = isHumanoidPrompt(prompt);
    const isCharacterSemantic =
      isHuman &&
      raw &&
      typeof raw === 'object' &&
      ((raw as any).sculpt_layers ||
        (raw as any).character_profile ||
        (raw as any).palette ||
        (raw as any).costume ||
        (raw as any).equipment);

    if (!hasValidParts && isCharacterSemantic) {
      const features = extractCharacterFeaturesFromModelOutput(raw, prompt, opts.extractedPalette);
      graph = compileCharacterToClaySculpt(features);
    } else {
      graph = sanitizeSculptSpec(raw, prompt);
    }
  }

  if (graph.parts.length === 0) {
    if (isHumanoidPrompt(prompt)) {
      const features = extractCharacterFeaturesFromModelOutput(raw, prompt, opts.extractedPalette);
      graph = compileCharacterToClaySculpt(features);
    } else if (opts.imageBase64 || opts.silhouetteMeasurements) {
      graph = synthesizeRecipeFromImage({
        name: prompt,
        prompt,
        metrics: opts.silhouetteMeasurements,
        palette: opts.extractedPalette,
      });
    } else {
      const curated = lookupSculptSpec(prompt);
      if (curated && curated.parts && curated.parts.length > 0) {
        graph = { ...curated, name: graph.name || curated.name };
      } else {
        graph = synthesizeRecipeFromImage({ name: prompt, prompt });
      }
    }
  } else if (graph.route === 'author' && graph.parts.length < 3) {
    if (isHumanoidPrompt(prompt)) {
      const features = extractCharacterFeaturesFromModelOutput(raw, prompt, opts.extractedPalette);
      graph = compileCharacterToClaySculpt(features);
    } else if (opts.imageBase64 || opts.silhouetteMeasurements) {
      graph = synthesizeRecipeFromImage({
        name: prompt,
        prompt,
        metrics: opts.silhouetteMeasurements,
        palette: opts.extractedPalette,
      });
    }
  }

  // If extracted palette is available and parts are uncolored or default clay, assign sampled palette colors
  if (normPal && graph.parts && graph.parts.length > 0) {
    const hasSpecificColors = graph.parts.some(
      (p) => p.color && p.color.toLowerCase() !== '#e2ded5' && p.color.toLowerCase() !== '#9aa3ad'
    );
    if (!hasSpecificColors) {
      const swatches = normPal.dominantColors;
      graph.parts.forEach((p, idx) => {
        p.color = idx === 0 ? normPal.primaryColor : swatches[idx % swatches.length];
      });
      if (graph.materials && graph.materials.length > 0) {
        graph.materials[0].color = normPal.primaryColor;
        if (graph.materials[1]) graph.materials[1].color = normPal.secondaryColor;
        if (graph.materials[2]) graph.materials[2].color = normPal.accentColor;
      }
    }
  }

  // Geometric sanity check: if the reference silhouette was measured, prevent blind text-only model hallucinations
  // from completely inverting vertical/horizontal proportions (e.g. turning a tall coffee pouch into a squat desk)
  if (opts.silhouetteMeasurements && opts.silhouetteMeasurements.aspectRatio > 0 && !isHumanoidPrompt(prompt)) {
    const refAR = opts.silhouetteMeasurements.aspectRatio;
    const rootPart = graph.parts.find((p) => !p.parent) || graph.parts[0];
    if (rootPart && rootPart.size && rootPart.size[0] > 0 && rootPart.size[1] > 0) {
      const modelAR = rootPart.size[1] / rootPart.size[0];
      const isSevereMismatch = (refAR >= 1.25 && modelAR <= 0.7) || (refAR <= 0.7 && modelAR >= 1.25);
      if (isSevereMismatch) {
        graph = synthesizeRecipeFromImage({
          name: graph.name || prompt,
          prompt,
          metrics: opts.silhouetteMeasurements,
          palette: opts.extractedPalette,
        });
      }
    }
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
        const wireUrl = resolveWireUrl(req.url, cfg.provider);
        response = await fetch(wireUrl, {
          method: 'POST',
          signal: ctrl.signal,
          headers: req.headers,
          body: JSON.stringify(req.body),
        });
      } catch (err: any) {
        if (ctrl.signal.aborted) {
          throw new ObjectReasonerError(
            `${cfg.info.label} did not answer within ${Math.round(timeoutMs / 1000)} s.`,
            'timeout'
          );
        }
        const detail = err?.message ? ` (${err.message})` : '';
        throw new ObjectReasonerError(
          `Cannot reach ${cfg.info.label} at ${cfg.url}${detail}. ${cfg.info.hint}` +
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
      r = await fetch(resolveWireUrl(`${cfg.url}/api/tags`, cfg.provider));
    } else if (protocol === 'openai') {
      r = await fetch(resolveWireUrl(`${cfg.url}/models`, cfg.provider), {
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
  if (protocol === 'openai') {
    const fromData = (body.data ?? []).map((m: any) => m.id as string).filter(Boolean);
    if (fromData.length > 0) return fromData;
    return (body.models ?? []).map((m: any) => (m.id || m.name || m.model) as string).filter(Boolean);
  }
  return (body.models ?? [])
    .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m: any) => String(m.name).replace(/^models\//, ''))
    .filter((n: string) => n.startsWith('gemini') && !GEMINI_EXCLUDE.test(n));
}
