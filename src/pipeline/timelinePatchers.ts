import type { GenerationMode } from './templateTypes';

/**
 * Timeline patchers edit the JSON stored inside a template's string input
 * (e.g. LTX Director / H3 Director `timeline_data`).
 *
 * Contract:
 * - `validate` inspects the template's *own* saved timeline and returns errors if
 *   its shape is not the one this patcher version understands. A non-empty result
 *   makes the whole template refuse to load: we never guess at an unknown shape.
 * - `apply` returns a new object that differs from the input only in the keys
 *   the patcher owns. It never builds a timeline from scratch.
 */
export interface TimelinePatchContext {
  mode: GenerationMode;
  /** ComfyUI input-folder filename of the uploaded first frame (I2V). */
  firstFrameFile?: string;
  /** ComfyUI input-folder filename of the uploaded geometric control/previs video (Control). */
  controlVideoFile?: string;
  durationSeconds: number;
  frameRate: number;
}

export interface TimelinePatcher {
  readonly id: string;
  readonly description: string;
  validate(timeline: unknown): string[];
  apply(timeline: unknown, ctx: TimelinePatchContext): unknown;
}

const registry = new Map<string, TimelinePatcher>();

export function registerPatcher(patcher: TimelinePatcher): void {
  if (registry.has(patcher.id)) {
    throw new Error(`Timeline patcher "${patcher.id}" is already registered`);
  }
  registry.set(patcher.id, patcher);
}

export function getPatcher(id: string): TimelinePatcher | undefined {
  return registry.get(id);
}

export function listPatcherIds(): string[] {
  return [...registry.keys()];
}

/** Shared helpers for patchers. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Built-in Patcher 1: LTX First-Frame & Relay Patcher
const ltxFirstFramePatcher: TimelinePatcher = {
  id: 'ltx.firstFrameSegment@1',
  description: 'Patches LTXDirectorCS25 timeline_data to inject or remove the first-frame image segment and disable prompt relay for global prompt execution.',
  validate(timeline: unknown): string[] {
    if (!isPlainObject(timeline)) return ['timeline_data must be a JSON object'];
    if ('segments' in timeline && !Array.isArray(timeline.segments)) {
      return ['timeline_data.segments must be an array'];
    }
    return [];
  },
  apply(timeline: unknown, ctx: TimelinePatchContext): unknown {
    const data = isPlainObject(timeline) ? structuredClone(timeline) : {};
    const segments = Array.isArray(data.segments) ? [...data.segments] : [];

    // Filter out previous first-frame image segments
    const filteredSegments = segments.filter((s) => {
      if (!isPlainObject(s)) return true;
      if (s.type === 'image' && (s.start === 0 || s.start === '0')) return false;
      return true;
    });

    if (ctx.mode === 'i2v' && ctx.firstFrameFile) {
      filteredSegments.unshift({
        type: 'image',
        imageFile: ctx.firstFrameFile,
        start: 0,
        length: 1,
      });
    }

    const result: Record<string, unknown> = {
      ...data,
      segments: filteredSegments,
      disable_prompt_relay: true, // Use global prompt exclusively (Q5)
    };

    if (ctx.mode === 'control' && ctx.controlVideoFile) {
      result.reference_mode = 'VIDEO';
      result.retakeVideo = ctx.controlVideoFile;
      result.retakeMode = true;
      result.retakeStrength = 0.8;
    }

    return result;
  },
};

// Built-in Patcher 2: MiniMax H3 First-Frame Character & Override Patcher
const h3FirstFramePatcher: TimelinePatcher = {
  id: 'h3.firstFrameCharacter@1',
  description: 'Patches StubeliusH3DirectorV2 timeline_data to inject or remove characters[0] first-frame image file and disable chunk auto prompt generation.',
  validate(timeline: unknown): string[] {
    if (!isPlainObject(timeline)) return ['timeline_data must be a JSON object'];
    if ('characters' in timeline && !Array.isArray(timeline.characters)) {
      return ['timeline_data.characters must be an array'];
    }
    return [];
  },
  apply(timeline: unknown, ctx: TimelinePatchContext): unknown {
    const data = isPlainObject(timeline) ? structuredClone(timeline) : {};
    const characters = Array.isArray(data.characters) ? [...data.characters] : [];

    if (ctx.mode === 'i2v' && ctx.firstFrameFile) {
      characters[0] = {
        file: ctx.firstFrameFile,
        name: 'First Frame',
      };
    } else if (ctx.mode === 't2v') {
      characters[0] = null;
    }

    // Ensure chunks don't override the director's prompt override
    if (Array.isArray(data.chunks)) {
      data.chunks = data.chunks.map((chunk) => {
        if (!isPlainObject(chunk)) return chunk;
        return {
          ...chunk,
          prompt_gen_enabled: false,
        };
      });
    }

    return {
      ...data,
      characters,
    };
  },
};

// Built-in Patcher 3: LTX Geometric Control & Previs Video Patcher
const ltxGeometricControlPatcher: TimelinePatcher = {
  id: 'ltx.geometricControl@1',
  description: 'Patches LTXDirectorCS25 timeline_data to inject retakeVideo and reference_mode for geometric camera control.',
  validate(timeline: unknown): string[] {
    if (!isPlainObject(timeline)) return ['timeline_data must be a JSON object'];
    return [];
  },
  apply(timeline: unknown, ctx: TimelinePatchContext): unknown {
    const data = isPlainObject(timeline) ? structuredClone(timeline) : {};

    if (ctx.mode === 'control' && ctx.controlVideoFile) {
      return {
        ...data,
        reference_mode: 'VIDEO',
        retakeVideo: ctx.controlVideoFile,
        retakeMode: true,
        retakeStrength: 0.8,
        disable_prompt_relay: true,
      };
    }

    return {
      ...data,
      reference_mode: 'OFF',
      retakeVideo: null,
      retakeMode: false,
      disable_prompt_relay: true,
    };
  },
};

// Register built-in patchers automatically
registerPatcher(ltxFirstFramePatcher);
registerPatcher(h3FirstFramePatcher);
registerPatcher(ltxGeometricControlPatcher);

