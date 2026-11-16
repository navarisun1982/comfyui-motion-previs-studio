import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useShotStore, healLoadedShotSpec } from '../src/stores/useShotStore';
import { createDefaultShotSpec } from '../src/types/shotspec';
import { isReferenceImageRecordId, offloadLargeImageToIndexedDB } from '../src/services/modelStorage';
import { safeSetItem } from '../src/services/storage';
import { installMemoryStorage } from './helpers/memoryStorage';

describe('Unit 1 — State, Prompt, Path & Storage Integrity', () => {
  beforeEach(() => {
    installMemoryStorage();
    useShotStore.getState().resetToDefault();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves coherent customPositivePrompts across 3D stage edits and undo/redo, and archives superseded prompts', () => {
    const store = useShotStore.getState();
    const customLtx =
      'Cinematic anamorphic shot of Lead Subject in a weathered jacket standing in rain, dramatic rim light, 35mm film grain.';
    const customMinimax = 'High-contrast atmospheric tracking shot of Lead Subject turning slowly.';

    store.setCustomPositivePrompt('ltx-2.5', customLtx, true);
    store.setCustomPositivePrompt('minimax-h3', customMinimax, true);

    // Perform 3D stage edits (lens change, shot rename, duration tweak)
    useShotStore.getState().setFocalLength('50mm');
    useShotStore.getState().updateShotName('Hero Rain Close-Up');
    useShotStore.getState().updateDuration(5);

    const afterEdits = useShotStore.getState().shot;
    expect(afterEdits.customPositivePrompts?.['ltx-2.5']).toBe(customLtx);
    expect(afterEdits.customPositivePrompts?.['minimax-h3']).toBe(customMinimax);

    // Undo and Redo must also preserve customPositivePrompts intact
    useShotStore.getState().undo();
    expect(useShotStore.getState().shot.durationSeconds).toBe(4);
    expect(useShotStore.getState().shot.customPositivePrompts?.['ltx-2.5']).toBe(customLtx);

    useShotStore.getState().redo();
    expect(useShotStore.getState().shot.durationSeconds).toBe(5);
    expect(useShotStore.getState().shot.customPositivePrompts?.['ltx-2.5']).toBe(customLtx);

    // Structured engine prompt that omits a newly added visible actor is archived into promptHistory, never lost
    const structuredLtx = 'In the camera frame, Lead Subject walks forward steadily.';
    useShotStore.getState().setCustomPositivePrompt('ltx-2.5', structuredLtx, true);
    useShotStore.getState().addActor('Second Detective', 'human', 'detective in trench coat', {
      startPosition: { x: 52, y: 50, z: 0 },
    });

    const afterNewActor = useShotStore.getState().shot;
    expect(afterNewActor.customPositivePrompts?.['ltx-2.5']).toBeUndefined();
    expect(afterNewActor.promptHistory?.['ltx-2.5']).toContain(structuredLtx);
  });

  it('healLoadedShotSpec preserves curved/NavMesh locomotion paths while linearizing 1D collinear S-curves', () => {
    const curvedShot = createDefaultShotSpec({ id: 'shot-curved' });
    curvedShot.actors = [
      {
        id: 'walker-curved',
        name: 'Scout',
        kind: 'human',
        token: 'scout',
        actionDescription: 'walks around obstacle',
        gait: 'walk',
        motionClip: 'human-walk-forward',
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: 20, y: 50, z: 0 },
          endPosition: { x: 80, y: 50, z: 0 },
          keyframes: [
            { id: 'k0', time: 0, position: { x: 20, y: 50, z: 0 } },
            { id: 'k1', time: 2, position: { x: 50, y: 28, z: 0 } }, // Curved bypass around center obstacle!
            { id: 'k2', time: 4, position: { x: 80, y: 50, z: 0 } },
          ],
        },
      },
      {
        id: 'walker-collinear',
        name: 'Guard',
        kind: 'human',
        token: 'guard',
        actionDescription: 'walks forward steadily',
        gait: 'walk',
        motionClip: 'human-walk-forward',
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: 20, y: 60, z: 0 },
          endPosition: { x: 80, y: 60, z: 0 },
          keyframes: [
            { id: 'c0', time: 0, position: { x: 20, y: 60, z: 0 } },
            { id: 'c1', time: 2, position: { x: 32, y: 60, z: 0 } }, // Collinear slow-start S-curve lag
            { id: 'c2', time: 4, position: { x: 80, y: 60, z: 0 } },
          ],
        },
      },
    ];

    const healed = healLoadedShotSpec(curvedShot);
    // Curved path waypoint y=28 MUST remain untouched!
    expect(healed.actors[0].trajectory.keyframes?.[1].position).toEqual({ x: 50, y: 28, z: 0 });
    // Collinear S-curve waypoint at midpoint t=2/4 is linearized to x=50 along y=60
    expect(healed.actors[1].trajectory.keyframes?.[1].position.x).toBe(50);
    expect(healed.actors[1].trajectory.keyframes?.[1].position.y).toBe(60);
  });

  it('healLoadedShotSpec preserves multi-person Mocap spacing and pan-left camera trajectory', () => {
    const mocapShot = createDefaultShotSpec({ id: 'shot-mocap-duel' });
    mocapShot.camera.movement = {
      ...mocapShot.camera.movement,
      type: 'pan-left',
      startPosition: { x: 42, y: 84, z: 30 },
      endPosition: { x: 36, y: 84, z: 30 },
      targetLookAt: { x: 48, y: 52 },
    };
    mocapShot.actors = [
      {
        id: 'mocap-person-1',
        name: 'Fighter A',
        kind: 'human',
        token: 'martial artist in white gi',
        actionDescription: 'advances in fighting stance',
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: 30, y: 50, z: 0 },
          endPosition: { x: 34, y: 50, z: 0 },
        },
      },
      {
        id: 'mocap-person-2',
        name: 'Fighter B',
        kind: 'human',
        token: 'martial artist in black gi',
        actionDescription: 'steps into guard',
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: 70, y: 50, z: 0 },
          endPosition: { x: 66, y: 50, z: 0 },
        },
      },
    ];

    const healed = healLoadedShotSpec(mocapShot);
    expect(healed.actors[0].trajectory.startPosition.x).toBe(30);
    expect(healed.actors[1].trajectory.startPosition.x).toBe(70);
    expect(healed.camera.movement.type).toBe('pan-left');
    expect(healed.camera.movement.startPosition).toEqual({ x: 42, y: 84, z: 30 });
  });

  it('clears all 5 multi-pass previs URLs/Blobs on loadShot and resetToDefault', () => {
    const fakeBlob = new Blob(['test'], { type: 'video/mp4' });
    useShotStore.getState().setPrevisClay('blob:clay-1', fakeBlob);
    useShotStore.getState().setPrevisOpenPose('blob:pose-1', fakeBlob);
    useShotStore.getState().setPrevisDepth('blob:depth-1', fakeBlob);
    useShotStore.getState().setPrevisIdMask('blob:mask-1', fakeBlob);

    expect(useShotStore.getState().previsClayUrl).toBe('blob:clay-1');

    const otherShot = createDefaultShotSpec({ id: 'shot-other', name: 'Other Shot' });
    useShotStore.getState().loadShot(otherShot);

    const stateAfterLoad = useShotStore.getState();
    expect(stateAfterLoad.previsClayUrl).toBeUndefined();
    expect(stateAfterLoad.previsOpenPoseUrl).toBeUndefined();
    expect(stateAfterLoad.previsDepthUrl).toBeUndefined();
    expect(stateAfterLoad.previsIdMaskUrl).toBeUndefined();
  });

  it('recognizes hyphenated refimg-* IDs and retains newest 15 revisions under storage quota pressure', () => {
    const largeDataUrl = `data:image/png;base64,${'A'.repeat(90_000)}`;
    const refUri = offloadLargeImageToIndexedDB(largeDataUrl);
    expect(refUri?.startsWith('refimg://refimg-')).toBe(true);
    const extractedId = refUri!.replace('refimg://', '');
    expect(isReferenceImageRecordId(extractedId)).toBe(true);
    expect(isReferenceImageRecordId('refimg_legacy_123')).toBe(true);
    expect(isReferenceImageRecordId('model-soldier-1')).toBe(false);

    // Simulate quota pressure on localStorage.setItem: fail first call, succeed after pruning revisions
    const newestFirstRevs = Array.from({ length: 22 }, (_, i) => ({
      id: `rev-newest-${i}`,
      pad: 'X'.repeat(15_000),
      shotSpec: createDefaultShotSpec({ id: `s-${i}` }),
    }));
    globalThis.localStorage.setItem('comfy_previs_shot_revisions_v2', JSON.stringify(newestFirstRevs));

    const origSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
    let failedOnce = false;
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === 'quota_trigger_key' && !failedOnce) {
        failedOnce = true;
        throw new Error('QuotaExceededError');
      }
      return origSetItem(k, v);
    });

    const ok = safeSetItem('quota_trigger_key', { ok: true });
    expect(ok).toBe(true);
    const pruned = JSON.parse(globalThis.localStorage.getItem('comfy_previs_shot_revisions_v2') || '[]');
    expect(pruned).toHaveLength(15);
    expect(pruned[0].id).toBe('rev-newest-0');
    expect(pruned[14].id).toBe('rev-newest-14');
  });

  it('purges deleted shots from shotsById, renames inactive shots cleanly, and re-evaluates prompts on disk restore', () => {
    const shotA = createDefaultShotSpec({ id: 'shot-alpha', name: 'Shot Alpha' });
    const shotB = createDefaultShotSpec({ id: 'shot-beta', name: 'Shot Beta' });
    useShotStore.getState().loadShot(shotA);
    useShotStore.getState().loadShot(shotB);

    // Rename inactive shot-alpha while shot-beta is active
    useShotStore.getState().updateShotName('Shot Alpha Renamed', 'shot-alpha');
    expect(useShotStore.getState().shotsById['shot-alpha']?.name).toBe('Shot Alpha Renamed');
    expect(useShotStore.getState().shot.id).toBe('shot-beta');

    // Delete inactive shot-alpha and ensure it is purged from shotsById
    useShotStore.getState().deleteShots(['shot-alpha']);
    expect(useShotStore.getState().shotsById['shot-alpha']).toBeUndefined();
    expect(useShotStore.getState().shotsById['shot-beta']).toBeDefined();

    // Restore project from disk state and verify compiledPrompt reflects restored shot
    const diskShot = createDefaultShotSpec({ id: 'shot-disk-1', name: 'Disk Shot 01' });
    diskShot.sceneDescription = 'cyberpunk rooftop observatory at midnight';
    useShotStore.getState().restoreProjectFromDiskState({
      shotsById: { 'shot-disk-1': diskShot },
      activeShotId: 'shot-disk-1',
    });

    const restoredState = useShotStore.getState();
    expect(restoredState.shot.id).toBe('shot-disk-1');
    expect(restoredState.compiledPrompt.positivePrompt.toLowerCase()).toContain('cyberpunk rooftop observatory');
  });
});
