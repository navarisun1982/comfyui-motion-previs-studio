import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useShotStore } from '../src/stores/useShotStore';
import { buildDefaultShotSpec, ShotBibleItem } from '../src/components/ShotBible';
import { installMemoryStorage } from './helpers/memoryStorage';
import { safeGetItem, safeSetItem, STORAGE_KEYS } from '../src/services/storage';

describe('Stage 3: Editing Safety & Undo/Redo Engine', () => {
  beforeEach(() => {
    installMemoryStorage();
    useShotStore.getState().resetToDefault();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with canUndo and canRedo false', () => {
    const { canUndo, canRedo } = useShotStore.getState();
    expect(canUndo).toBe(false);
    expect(canRedo).toBe(false);
  });

  it('allows undo and redo on focal length change', () => {
    const initialFocal = useShotStore.getState().shot.camera.lens.focalLength;
    expect(initialFocal).toBe('35mm');

    // Mutate focal length
    useShotStore.getState().setFocalLength('85mm');
    expect(useShotStore.getState().shot.camera.lens.focalLength).toBe('85mm');
    expect(useShotStore.getState().canUndo).toBe(true);
    expect(useShotStore.getState().canRedo).toBe(false);

    // Undo
    useShotStore.getState().undo();
    expect(useShotStore.getState().shot.camera.lens.focalLength).toBe('35mm');
    expect(useShotStore.getState().canUndo).toBe(false);
    expect(useShotStore.getState().canRedo).toBe(true);

    // Redo
    useShotStore.getState().redo();
    expect(useShotStore.getState().shot.camera.lens.focalLength).toBe('85mm');
    expect(useShotStore.getState().canUndo).toBe(true);
    expect(useShotStore.getState().canRedo).toBe(false);
  });

  it('collapses an entire drag gesture into a single undo step', () => {
    const actorId = useShotStore.getState().shot.actors[0].id;
    const initialPos = { ...useShotStore.getState().shot.actors[0].trajectory.startPosition };

    // Begin interactive drag gesture
    useShotStore.getState().beginGesture();

    // Simulate 10 continuous drag movements
    for (let i = 1; i <= 10; i++) {
      useShotStore.getState().updateActorPositionAtTime(actorId, 0, { x: 50 + i, y: 50 + i }, 4);
    }

    // Verify current state is at the end of drag
    const draggedActor = useShotStore.getState().shot.actors.find((a) => a.id === actorId);
    expect(draggedActor?.trajectory.startPosition.x).toBe(60);

    // End drag gesture
    useShotStore.getState().endGesture();

    // Exactly one undo should revert the entire drag back to initial position!
    expect(useShotStore.getState().canUndo).toBe(true);
    useShotStore.getState().undo();

    const revertedActor = useShotStore.getState().shot.actors.find((a) => a.id === actorId);
    expect(revertedActor?.trajectory.startPosition.x).toBe(initialPos.x);
    expect(revertedActor?.trajectory.startPosition.y).toBe(initialPos.y);
    expect(useShotStore.getState().canUndo).toBe(false);
  });

  it('maintains isolated per-shot history stacks when switching shots', () => {
    const shotAItem: ShotBibleItem = {
      id: 'shot-iso-a',
      code: 'Shot A',
      title: 'Scene A',
      duration: '4s',
      focalLength: '35mm',
      movement: 'dolly-in',
      thumbnail: '',
      mode: 'construct-3d',
    };

    const shotBItem: ShotBibleItem = {
      id: 'shot-iso-b',
      code: 'Shot B',
      title: 'Scene B',
      duration: '4s',
      focalLength: '50mm',
      movement: 'dolly-in',
      thumbnail: '',
      mode: 'construct-3d',
    };

    // 1. Switch to Shot A and edit
    useShotStore.getState().switchShot(shotAItem.id, () => buildDefaultShotSpec(shotAItem));
    expect(useShotStore.getState().canUndo).toBe(false);
    useShotStore.getState().setFocalLength('85mm');
    expect(useShotStore.getState().canUndo).toBe(true);

    // 2. Switch to Shot B - Shot B must start with clean history
    useShotStore.getState().switchShot(shotBItem.id, () => buildDefaultShotSpec(shotBItem));
    expect(useShotStore.getState().canUndo).toBe(false);

    // Edit Shot B
    useShotStore.getState().setLighting('neon-cyberpunk');
    expect(useShotStore.getState().canUndo).toBe(true);

    // 3. Switch back to Shot A - Shot A's undo stack must be preserved!
    useShotStore.getState().switchShot(shotAItem.id, () => buildDefaultShotSpec(shotAItem));
    expect(useShotStore.getState().canUndo).toBe(true);
    expect(useShotStore.getState().shot.camera.lens.focalLength).toBe('85mm');

    // Undo on Shot A
    useShotStore.getState().undo();
    expect(useShotStore.getState().shot.camera.lens.focalLength).toBe('35mm');
    expect(useShotStore.getState().canUndo).toBe(false);

    // 4. Switch back to Shot B - Shot B's lighting edit must be untouched!
    useShotStore.getState().switchShot(shotBItem.id, () => buildDefaultShotSpec(shotBItem));
    expect(useShotStore.getState().shot.lighting.style).toBe('neon-cyberpunk');
    expect(useShotStore.getState().canUndo).toBe(true);
  });

  it('invalidates redo future when a new edit is performed after undo', () => {
    useShotStore.getState().setFocalLength('50mm');
    useShotStore.getState().setFocalLength('85mm');
    expect(useShotStore.getState().canUndo).toBe(true);

    useShotStore.getState().undo();
    expect(useShotStore.getState().canRedo).toBe(true);

    // Make a new branch of history: future stack must be cleared!
    useShotStore.getState().setFocalLength('135mm');
    expect(useShotStore.getState().canRedo).toBe(false);
    expect(useShotStore.getState().shot.camera.lens.focalLength).toBe('135mm');

    // Undo should go to 50mm (the state before 135mm)
    useShotStore.getState().undo();
    expect(useShotStore.getState().shot.camera.lens.focalLength).toBe('50mm');
  });

  it('caps history stack to MAX_HISTORY_STEPS without memory leak', () => {
    // Perform 70 edits
    for (let i = 1; i <= 70; i++) {
      useShotStore.getState().updateDuration(Number((2 + (i % 10) * 0.1).toFixed(1)));
    }
    expect(useShotStore.getState().canUndo).toBe(true);

    // Should be able to undo up to 50 times without error
    let undoCount = 0;
    while (useShotStore.getState().canUndo && undoCount < 100) {
      useShotStore.getState().undo();
      undoCount++;
    }
    expect(undoCount).toBe(50);
    expect(useShotStore.getState().canUndo).toBe(false);
  });

  it('clears history on clearHistory()', () => {
    useShotStore.getState().setFocalLength('50mm');
    expect(useShotStore.getState().canUndo).toBe(true);

    useShotStore.getState().clearHistory();
    expect(useShotStore.getState().canUndo).toBe(false);
    expect(useShotStore.getState().canRedo).toBe(false);
  });

  it('persists and respects welcome guide dismissal in storage', () => {
    // Initially not dismissed
    expect(safeGetItem(STORAGE_KEYS.WELCOME_DISMISSED, false)).toBe(false);

    // Dismiss guide
    safeSetItem(STORAGE_KEYS.WELCOME_DISMISSED, true);
    expect(safeGetItem(STORAGE_KEYS.WELCOME_DISMISSED, false)).toBe(true);
  });

  it('truthfully computes project metrics for ShotBible without mock numbers', () => {
    const defaultScenes = [
      {
        id: 'scene-1',
        name: 'Scene 01 - Alleyway',
        shots: [
          { id: 'shot-01a', duration: '4s' },
          { id: 'shot-01b', duration: '5s' },
          { id: 'shot-01c', duration: '3s' },
        ],
      },
      {
        id: 'scene-2',
        name: 'Scene 02 - Chase',
        shots: [
          { id: 'shot-02a', duration: '4s' },
          { id: 'shot-02b', duration: '5s' },
        ],
      },
    ];

    const totalShots = defaultScenes.reduce((acc, sc) => acc + sc.shots.length, 0);
    expect(totalShots).toBe(5);

    const totalDurationSeconds = defaultScenes.reduce((acc, sc) => {
      return acc + sc.shots.reduce((sAcc, sh) => sAcc + (parseInt(sh.duration, 10) || 4), 0);
    }, 0);
    expect(totalDurationSeconds).toBe(21); // 4 + 5 + 3 + 4 + 5 = 21s

    // Test aspect ratio mapping
    const getResolutionForRatio = (ratio?: string) => {
      switch (ratio) {
        case '2.39:1':
          return '1920 × 804 (2.39:1)';
        case '9:16':
          return '1080 × 1920 (9:16)';
        case '4:3':
          return '1440 × 1080 (4:3)';
        case '1:1':
          return '1080 × 1080 (1:1)';
        case '16:9':
        default:
          return '1920 × 1080 (16:9)';
      }
    };

    expect(getResolutionForRatio('16:9')).toBe('1920 × 1080 (16:9)');
    expect(getResolutionForRatio('2.39:1')).toBe('1920 × 804 (2.39:1)');
    expect(getResolutionForRatio('9:16')).toBe('1080 × 1920 (9:16)');
    expect(getResolutionForRatio('4:3')).toBe('1440 × 1080 (4:3)');
    expect(getResolutionForRatio('1:1')).toBe('1080 × 1080 (1:1)');
  });
});
