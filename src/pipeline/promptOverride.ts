import { create } from 'zustand';
import { hashString } from './hash';

export interface PromptOverride {
  shotId: string;
  engine: string;
  positivePrompt: string;
  negativePrompt: string;
  source: 'ai' | 'manual';
  basedOnHash: string;
  createdAt: number;
}

interface PromptOverrideState {
  overrides: Record<string, PromptOverride>; // key: `${shotId}::${engine}`
  setOverride: (
    shotId: string,
    engine: string,
    positive: string,
    negative: string,
    source: 'ai' | 'manual',
    basedOnHash: string
  ) => void;
  revertOverride: (shotId: string, engine: string) => void;
  keepOverride: (shotId: string, engine: string, newBasedOnHash: string) => void;
  getOverride: (shotId: string, engine: string) => PromptOverride | undefined;
  getEffectivePrompt: (
    shotId: string,
    engine: string,
    compiled: { positivePrompt: string; negativePrompt: string }
  ) => {
    positive: string;
    negative: string;
    isOverride: boolean;
    isStale: boolean;
    source?: 'ai' | 'manual';
    basedOnHash?: string;
  };
}

export function computePromptHash(positive: string, negative: string): string {
  return hashString(`${positive.trim()}|||${negative.trim()}`);
}

const STORAGE_KEY = 'comfy_previs_prompt_overrides_v1';

function loadStoredOverrides(): Record<string, PromptOverride> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistOverrides(overrides: Record<string, PromptOverride>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore
  }
}

export const usePromptOverrideStore = create<PromptOverrideState>((set, get) => ({
  overrides: loadStoredOverrides(),

  setOverride: (shotId, engine, positive, negative, source, basedOnHash) => {
    const key = `${shotId}::${engine}`;
    const override: PromptOverride = {
      shotId,
      engine,
      positivePrompt: positive,
      negativePrompt: negative,
      source,
      basedOnHash,
      createdAt: Date.now(),
    };
    const next = { ...get().overrides, [key]: override };
    set({ overrides: next });
    persistOverrides(next);
  },

  revertOverride: (shotId, engine) => {
    const key = `${shotId}::${engine}`;
    const next = { ...get().overrides };
    delete next[key];
    set({ overrides: next });
    persistOverrides(next);
  },

  keepOverride: (shotId, engine, newBasedOnHash) => {
    const key = `${shotId}::${engine}`;
    const current = get().overrides[key];
    if (!current) return;
    const updated: PromptOverride = {
      ...current,
      basedOnHash: newBasedOnHash,
    };
    const next = { ...get().overrides, [key]: updated };
    set({ overrides: next });
    persistOverrides(next);
  },

  getOverride: (shotId, engine) => {
    return get().overrides[`${shotId}::${engine}`];
  },

  getEffectivePrompt: (shotId, engine, compiled) => {
    const override = get().overrides[`${shotId}::${engine}`];
    if (!override) {
      return {
        positive: compiled.positivePrompt,
        negative: compiled.negativePrompt,
        isOverride: false,
        isStale: false,
      };
    }
    const currentHash = computePromptHash(compiled.positivePrompt, compiled.negativePrompt);
    const isStale = currentHash !== override.basedOnHash;
    return {
      positive: override.positivePrompt,
      negative: override.negativePrompt,
      isOverride: true,
      isStale,
      source: override.source,
      basedOnHash: override.basedOnHash,
    };
  },
}));
