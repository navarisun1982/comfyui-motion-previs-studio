import type { ShotSpec } from '../types/shotspec';

export const STORAGE_KEYS = {
  SHOTS_CACHE: 'comfy_ai_director_shots_cache_v1',
  CAST_POOL: 'comfy_ai_director_cast_pool_v1',
  COMFY_SERVER: 'comfy_ai_director_server_url',
  ASSETS: 'comfy_director_3d_assets_v2',
  REVISIONS_V2: 'comfy_ai_director_shot_revisions_v2',
  REVISIONS_V1: 'comfy_ai_director_shot_revisions_v1',
  PROMPT_OVERRIDES: 'comfy_ai_director_prompt_overrides_v1',
  PART_GRAPHS: 'comfy_director_part_graphs_v1',
  SCENES: 'comfy_ai_director_scenes',
  REASONER_SETTINGS: 'comfy_director_reasoner_settings_v1',
} as const;

/**
 * Safely resolves the active Storage instance without triggering Node.js 22's
 * uninitialized experimental localStorage accessor warning.
 *
 * In browser/Electron: returns `window.localStorage`.
 * In test runners (Vitest/Node): checks if localStorage has been stubbed (e.g. by
 * `installMemoryStorage()`), ignoring Node's default accessor descriptor.
 */
export function getRawStorage(): Storage | null {
  if (typeof window !== 'undefined') {
    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }
  try {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    // If it's Node 22's experimental accessor getter, evaluating it triggers ExperimentalWarning.
    if (desc && (desc.get || desc.set)) {
      return null;
    }
    if (typeof (globalThis as any).localStorage !== 'undefined' && (globalThis as any).localStorage !== null) {
      return (globalThis as any).localStorage as Storage;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Checks if storage is available and functional (e.g. not quota-exceeded or sandboxed).
 */
export function isLocalStorageAvailable(): boolean {
  const storage = getRawStorage();
  if (!storage) return false;
  try {
    const testKey = '__storage_test__';
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Strips ephemeral runtime URLs (such as blob: URLs) from a ShotSpec
 * before serializing to storage. Blob URLs die on document unload/reload;
 * persisting them creates dangling 404 links and broken preview states.
 */
export function sanitizeShotForStorage(shot: ShotSpec): ShotSpec {
  let modified = false;
  let vfxReference = shot.vfxReference;
  let referenceImage = shot.referenceImage;

  if (vfxReference && vfxReference.videoUrl && vfxReference.videoUrl.startsWith('blob:')) {
    vfxReference = {
      ...vfxReference,
      videoUrl: undefined,
    };
    modified = true;
  }

  if (referenceImage && referenceImage.previewUrl && referenceImage.previewUrl.startsWith('blob:')) {
    referenceImage = {
      ...referenceImage,
      previewUrl: '',
    };
    modified = true;
  }

  if (!modified) return shot;

  return {
    ...shot,
    vfxReference,
    referenceImage,
  };
}

/**
 * Safe wrapper for localStorage.getItem with JSON parsing.
 */
export function safeGetItem<T>(key: string, fallback: T): T {
  const storage = getRawStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safe wrapper for localStorage.setItem with JSON serialization.
 */
export function safeSetItem<T>(key: string, value: T): boolean {
  const storage = getRawStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[storage] Failed to write key "${key}" to storage:`, err);
    return false;
  }
}

/**
 * Safe wrapper for raw string getItem without JSON parse.
 */
export function safeGetString(key: string, fallback = ''): string {
  const storage = getRawStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw !== null && raw !== undefined ? raw : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Safe wrapper for raw string setItem.
 */
export function safeSetString(key: string, value: string): boolean {
  const storage = getRawStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe wrapper for storage.removeItem.
 */
export function safeRemoveItem(key: string): boolean {
  const storage = getRawStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
