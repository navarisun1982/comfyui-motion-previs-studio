import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installMemoryStorage } from './helpers/memoryStorage';
import { useShotStore, flushShotsPersistence } from '../src/stores/useShotStore';
import { STORAGE_KEYS, safeGetItem } from '../src/services/storage';
import { ShotSpec } from '../src/types/shotspec';

describe('Stage 5 Performance & 60 FPS Previs Engine', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = installMemoryStorage();
    useShotStore.getState().resetToDefault();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('eliminates synchronous storage writes on the hot path during active gestures', () => {
    const setItemSpy = vi.spyOn(storage, 'setItem');
    const store = useShotStore.getState();
    const actorId = store.shot.actors[0].id;

    // Simulate pointer down starting a continuous 3D soundstage / slider gesture
    store.beginGesture();
    setItemSpy.mockClear();

    // Simulate 60 FPS rapid continuous pointer movement (60 updates)
    for (let frame = 1; frame <= 60; frame++) {
      store.updateActorPositionAtTime(actorId, 1.0, { x: 20 + frame * 0.5, y: 30 + frame * 0.5 }, 5);
    }

    // Storage I/O must NOT run synchronously on every tick of the 60 FPS hot path
    const hotPathCalls = setItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEYS.SHOTS_CACHE);
    expect(hotPathCalls.length).toBe(0);

    // Simulate pointer release ending gesture
    store.endGesture();

    // Immediately flushes exactly once upon gesture release
    const postGestureCalls = setItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEYS.SHOTS_CACHE);
    expect(postGestureCalls.length).toBe(1);

    // Persisted state must match the final 60th position
    const cached = safeGetItem<Record<string, ShotSpec>>(STORAGE_KEYS.SHOTS_CACHE, {});
    const cachedShot = cached[store.shot.id];
    expect(cachedShot).toBeDefined();
    const cachedActor = cachedShot.actors.find((a) => a.id === actorId);
    expect(cachedActor).toBeDefined();
    const latestKeyframe = cachedActor?.trajectory.keyframes?.find((k) => k.time === 1.0);
    expect(latestKeyframe?.position.x).toBe(50); // 20 + 60*0.5 = 50
    expect(latestKeyframe?.position.y).toBe(60); // 30 + 60*0.5 = 60
  });

  it('flushes immediately on switchShot, loadShot, and resetToDefault', () => {
    const setItemSpy = vi.spyOn(storage, 'setItem');
    const store = useShotStore.getState();

    // 1. switchShot immediately flushes
    setItemSpy.mockClear();
    store.switchShot('shot-01b');
    const switchCalls = setItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEYS.SHOTS_CACHE);
    expect(switchCalls.length).toBeGreaterThanOrEqual(1);

    // 2. loadShot immediately flushes
    setItemSpy.mockClear();
    const customShot: ShotSpec = {
      ...store.shot,
      id: 'shot-custom-perf',
      name: 'Performance Validation Shot',
    };
    store.loadShot(customShot);
    const loadCalls = setItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEYS.SHOTS_CACHE);
    expect(loadCalls.length).toBeGreaterThanOrEqual(1);

    const cached = safeGetItem<Record<string, ShotSpec>>(STORAGE_KEYS.SHOTS_CACHE, {});
    expect(cached['shot-custom-perf']).toBeDefined();
    expect(cached['shot-custom-perf'].name).toBe('Performance Validation Shot');

    // 3. resetToDefault immediately flushes
    setItemSpy.mockClear();
    store.resetToDefault();
    const resetCalls = setItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEYS.SHOTS_CACHE);
    expect(resetCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('provides manual flushShotsPersistence() method', () => {
    const setItemSpy = vi.spyOn(storage, 'setItem');
    const store = useShotStore.getState();

    store.beginGesture();
    store.updateActorPositionAtTime(store.shot.actors[0].id, 2.0, { x: 42, y: 42 }, 5);
    setItemSpy.mockClear();

    // Call manual flush
    flushShotsPersistence();
    const calls = setItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEYS.SHOTS_CACHE);
    expect(calls.length).toBe(1);

    store.endGesture();
  });
});
