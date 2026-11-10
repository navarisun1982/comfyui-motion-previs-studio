import type { ShotSpec } from '../types/shotspec';
import { toPersistentModelUri, offloadLargeImageToIndexedDB } from './modelStorage';

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
  WELCOME_DISMISSED: 'comfy_ai_director_welcome_dismissed_v1',
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
 * before serializing to storage, while converting any actor's `blob:` 3D modelUrl
 * to its persistent `model://<modelId>` IndexedDB URI so 3D GLB actors survive reloads.
 */
export function sanitizeShotForStorage(shot: ShotSpec): ShotSpec {
  let modified = false;
  let vfxReference = shot.vfxReference;
  let referenceImage = shot.referenceImage;
  let actors = shot.actors;
  let environment = shot.environment;

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

  if (environment?.conceptImageUrl && environment.conceptImageUrl.startsWith('data:') && environment.conceptImageUrl.length > 80_000) {
    const offloaded = offloadLargeImageToIndexedDB(environment.conceptImageUrl);
    if (offloaded && offloaded !== environment.conceptImageUrl) {
      environment = {
        ...environment,
        conceptImageUrl: offloaded,
      };
      modified = true;
    }
  }

  if (
    Array.isArray(shot.actors) &&
    shot.actors.some(
      (a) =>
        a.modelUrl?.startsWith('blob:') ||
        (a.conceptImageUrl?.startsWith('data:') && a.conceptImageUrl.length > 80_000)
    )
  ) {
    actors = shot.actors.map((a) => {
      let nextActor = a;
      if (a.modelUrl?.startsWith('blob:')) {
        const persistentUri = toPersistentModelUri(a.modelUrl);
        if (persistentUri && persistentUri !== a.modelUrl) {
          modified = true;
          nextActor = { ...nextActor, modelUrl: persistentUri };
        }
      }
      if (a.conceptImageUrl?.startsWith('data:') && a.conceptImageUrl.length > 80_000) {
        const offloaded = offloadLargeImageToIndexedDB(a.conceptImageUrl);
        if (offloaded && offloaded !== a.conceptImageUrl) {
          modified = true;
          nextActor = { ...nextActor, conceptImageUrl: offloaded };
        }
      }
      return nextActor;
    });
  }

  if (!modified) return shot;

  return {
    ...shot,
    actors,
    environment,
    vfxReference,
    referenceImage,
  };
}

/**
 * Compacts a ShotSpec specifically for browser localStorage (which has a strict 5MB quota)
 * when the full shots cache exceeds localStorage capacity. Disk persistence via
 * `studio_storage/scenes/shots_cache.json` always stores the full uncompacted data.
 */
export function compactShotForLocalStorage(shot: ShotSpec): ShotSpec {
  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  const roundQuatMap = (
    map?: Record<string, [number, number, number, number]>
  ): Record<string, [number, number, number, number]> | undefined => {
    if (!map) return undefined;
    const out: Record<string, [number, number, number, number]> = {};
    for (const [k, q] of Object.entries(map)) {
      if (Array.isArray(q) && q.length === 4) {
        out[k] = [round4(q[0]), round4(q[1]), round4(q[2]), round4(q[3])];
      }
    }
    return out;
  };

  return {
    ...shot,
    actors: (shot.actors || []).map((a) => ({
      ...a,
      conceptImageUrl:
        a.conceptImageUrl && a.conceptImageUrl.length > 80_000 ? undefined : a.conceptImageUrl,
      trajectory: a.trajectory
        ? {
            ...a.trajectory,
            keyframes: a.trajectory.keyframes?.map((kf) => {
              if (!kf.pose) return kf;
              const nextPose: NonNullable<typeof kf.pose> & { worldLandmarks33?: unknown } = {
                ...kf.pose,
                rotations: roundQuatMap(kf.pose.rotations) || {},
                charSpaceRotations: roundQuatMap(kf.pose.charSpaceRotations),
              };
              delete nextPose.worldLandmarks33;
              return {
                ...kf,
                pose: nextPose,
              };
            }),
          }
        : a.trajectory,
    })),
    environment:
      shot.environment?.conceptImageUrl && shot.environment.conceptImageUrl.length > 80_000
        ? { ...shot.environment, conceptImageUrl: undefined }
        : shot.environment,
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
  const serialized = JSON.stringify(value);
  try {
    storage.setItem(key, serialized);
    return true;
  } catch (err) {
    // If localStorage hits the 5MB quota, prune heavy Mocap keyframe arrays from stored revision history and retry
    try {
      for (const revKey of [
        'comfy_previs_shot_revisions_v2',
        STORAGE_KEYS.REVISIONS_V2,
        STORAGE_KEYS.REVISIONS_V1,
        'ai_director_shot_revisions_v1',
      ]) {
        if (revKey === key) continue;
        const rawRevs = storage.getItem(revKey);
        if (rawRevs && rawRevs.length > 250_000) {
          const parsedRevs = JSON.parse(rawRevs);
          if (Array.isArray(parsedRevs)) {
            const slimRevs = parsedRevs.slice(-15).map((r: any) =>
              r?.shotSpec
                ? {
                    ...r,
                    shotSpec: compactShotForLocalStorage(r.shotSpec),
                  }
                : r
            );
            storage.setItem(revKey, JSON.stringify(slimRevs));
          }
        }
      }
      storage.setItem(key, serialized);
      return true;
    } catch {
      console.warn(`[storage] Failed to write key "${key}" to storage:`, err);
      return false;
    }
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
