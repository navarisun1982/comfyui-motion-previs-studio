import { describe, it, expect, beforeEach } from 'vitest';
import { useShotStore } from '../src/stores/useShotStore';
import { buildDefaultShotSpec, ShotBibleItem } from '../src/components/ShotBible';

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

if (!globalThis.localStorage || typeof globalThis.localStorage.clear !== 'function') {
  globalThis.localStorage = createLocalStorageMock() as any;
}

describe('Multi-Shot State Persistence & Shot Bible Switching', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    useShotStore.getState().resetToDefault();
  });

  it('preserves custom actor changes and camera position when switching between shots', () => {
    const store = useShotStore.getState();

    const shotAItem: ShotBibleItem = {
      id: 'shot-01a',
      code: 'Shot 01A',
      title: 'Tracking In',
      duration: '4s',
      focalLength: '35mm',
      movement: 'Tracking In',
      thumbnail: '',
      mode: 'construct-3d',
    };

    const shotBItem: ShotBibleItem = {
      id: 'shot-01b',
      code: 'Shot 01B',
      title: 'Pan Right',
      duration: '5s',
      focalLength: '24mm',
      movement: 'Pan Right',
      thumbnail: '',
      mode: 'construct-3d',
    };

    // 1. Switch to Shot A and customize it
    store.switchShot(shotAItem.id, () => buildDefaultShotSpec(shotAItem));
    expect(useShotStore.getState().shot.id).toBe('shot-01a');

    // Add a unique prop to Shot A
    useShotStore.getState().addActor('Mysterious Briefcase', 'prop', 'a glowing metallic briefcase');
    const shotAActorsCount = useShotStore.getState().shot.actors.length;
    expect(shotAActorsCount).toBeGreaterThanOrEqual(2);

    // Update duration and lighting on Shot A
    useShotStore.getState().updateDuration(3.5);
    useShotStore.getState().setLighting('neon-cyberpunk', 'overhead-top', 'high-contrast');

    // 2. Switch to Shot B
    useShotStore.getState().switchShot(shotBItem.id, () => buildDefaultShotSpec(shotBItem));
    const activeShotB = useShotStore.getState().shot;
    expect(activeShotB.id).toBe('shot-01b');
    expect(activeShotB.name).toContain('Shot 01B');
    expect(activeShotB.durationSeconds).toBe(5);

    // Modify Shot B camera
    useShotStore.getState().setFocalLength('85mm');
    expect(useShotStore.getState().shot.camera.lens.focalLength).toBe('85mm');

    // 3. Switch back to Shot A!
    useShotStore.getState().switchShot(shotAItem.id, () => buildDefaultShotSpec(shotAItem));
    const restoredShotA = useShotStore.getState().shot;

    // Verify Shot A was completely preserved and not reset to defaults
    expect(restoredShotA.id).toBe('shot-01a');
    expect(restoredShotA.actors.length).toBe(shotAActorsCount);
    expect(restoredShotA.actors.some((a) => a.name === 'Mysterious Briefcase')).toBe(true);
    expect(restoredShotA.durationSeconds).toBe(3.5);
    expect(restoredShotA.lighting.style).toBe('neon-cyberpunk');
    expect(restoredShotA.lighting.contrast).toBe('high-contrast');

    // 4. Switch back to Shot B and verify 85mm focal length remained intact
    useShotStore.getState().switchShot(shotBItem.id, () => buildDefaultShotSpec(shotBItem));
    const restoredShotB = useShotStore.getState().shot;
    expect(restoredShotB.id).toBe('shot-01b');
    expect(restoredShotB.camera.lens.focalLength).toBe('85mm');
  });

  it('persists shots in localStorage cache', () => {
    const store = useShotStore.getState();
    const testShotItem: ShotBibleItem = {
      id: 'shot-custom-test',
      code: 'Shot 99Z',
      title: 'Testing Cache',
      duration: '4s',
      focalLength: '50mm',
      movement: 'dolly-in',
      thumbnail: '',
      mode: 'construct-3d',
    };

    store.switchShot(testShotItem.id, () => buildDefaultShotSpec(testShotItem));
    useShotStore.getState().setSceneDescription('Verified cache test scenario');

    const raw = globalThis.localStorage.getItem('comfy_ai_director_shots_cache_v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed['shot-custom-test']).toBeDefined();
    expect(parsed['shot-custom-test'].sceneDescription).toBe('Verified cache test scenario');
  });
});
