import { describe, it, expect, beforeEach } from 'vitest';
import { useShotStore } from '../src/stores/useShotStore';

describe('Proposal 3: Multi-Actor Scene Cast Pool', () => {
  beforeEach(() => {
    // Set up mock localStorage in node test environment
    const storage: Record<string, string> = {};
    globalThis.localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
      clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
      key: (i: number) => Object.keys(storage)[i] ?? null,
      length: Object.keys(storage).length,
    } as Storage;

    useShotStore.getState().resetToDefault();
  });

  it('initializes with default cast pool members', () => {
    const pool = useShotStore.getState().sceneCastPool;
    expect(pool.length).toBeGreaterThanOrEqual(2);
    expect(pool.some((a) => a.name === 'Detective Miller')).toBe(true);
  });

  it('adds and persists new character to scene cast pool', () => {
    const customActor = {
      id: 'cast-cyber-ninja',
      name: 'Cyber Ninja',
      kind: 'human' as const,
      token: 'a shadow assassin in nanotech armor',
      actionDescription: 'drops silently from the rafters',
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 50, y: 50 },
        endPosition: { x: 50, y: 50 },
      },
    };

    useShotStore.getState().addToCastPool(customActor);
    const pool = useShotStore.getState().sceneCastPool;
    expect(pool.some((a) => a.name === 'Cyber Ninja')).toBe(true);

    // Verify localStorage persistence
    const saved = localStorage.getItem('comfy_ai_director_cast_pool_v1');
    expect(saved).toBeDefined();
    expect(saved).toContain('Cyber Ninja');
  });

  it('imports character from cast pool into current active shot actors', () => {
    const initialActorsCount = useShotStore.getState().shot.actors.length;
    useShotStore.getState().importFromCastPool('cast-detective-miller');

    const updatedActors = useShotStore.getState().shot.actors;
    expect(updatedActors.length).toBe(initialActorsCount + 1);
    const imported = updatedActors.find((a) => a.name === 'Detective Miller');
    expect(imported).toBeDefined();
    expect(imported?.token).toContain('charcoal trench coat');
  });

  it('removes character from cast pool', () => {
    useShotStore.getState().removeFromCastPool('cast-recon-hound');
    const pool = useShotStore.getState().sceneCastPool;
    expect(pool.some((a) => a.id === 'cast-recon-hound')).toBe(false);
  });
});
