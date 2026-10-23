import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useShotStore } from '../src/stores/useShotStore';
import { installMemoryStorage } from './helpers/memoryStorage';

describe('Proposal 3: Multi-Actor Scene Cast Pool', () => {
  beforeEach(() => {
    installMemoryStorage();
    useShotStore.getState().resetToDefault();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(saved).not.toBeNull();
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
