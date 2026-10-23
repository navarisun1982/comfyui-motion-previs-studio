import { vi } from 'vitest';

/**
 * Spec-shaped in-memory Web Storage for tests running in the `node` environment.
 *
 * Use `installMemoryStorage()` (vi.stubGlobal under the hood) instead of
 * assigning `globalThis.localStorage = ...`: newer Node versions expose an
 * experimental, accessor-based `localStorage` global, so plain assignment can
 * silently fail and leave tests reading a different store than the app writes.
 * Pair with `vi.unstubAllGlobals()` in `afterEach`.
 */
export function createMemoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

export function installMemoryStorage(): Storage {
  const storage = createMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  return storage;
}
