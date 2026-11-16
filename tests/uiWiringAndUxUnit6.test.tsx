// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { installMemoryStorage } from './helpers/memoryStorage';
import { useShotStore } from '../src/stores/useShotStore';
import { CinematicPresetsModal } from '../src/components/CinematicPresetsModal';
import { CharacterControlCard } from '../src/components/CharacterControlCard';
import {
  MocapStudioModal,
  applyMocapStudioPayloadToShotStore,
} from '../src/components/MocapStudioModal';
import { DirectorialSteeringModal } from '../src/components/DirectorialSteeringModal';
import { PrevisExportDeck } from '../src/components/PrevisExportDeck';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import type { Actor } from '../src/types/shotspec';
import type { ShotRevisionV2, DirectorialSteeringPatch } from '../src/pipeline/revisionTypes';

installMemoryStorage();

describe('Unit 6 — UI/UX Collisions, Undo Gesture Batching, .GLB/.FBX Controls & Server Guards', () => {
  beforeEach(() => {
    cleanup();
    const store = useShotStore.getState();
    store.resetToDefault();
    store.clearHistory();
  });

  it('batches continuous slider drags into 1 single Undo step via beginGesture / endGesture', () => {
    const store = useShotStore.getState();
    const initialDuration = store.shot.durationSeconds;

    store.beginGesture();
    for (let step = 1; step <= 25; step++) {
      useShotStore.getState().updateDuration(4 + step * 0.2);
    }
    store.endGesture();

    expect(useShotStore.getState().shot.durationSeconds).toBeCloseTo(9.0, 2);
    expect(useShotStore.getState().canUndo).toBe(true);

    // One single Undo must restore the pre-drag duration (not 8.8s!)
    useShotStore.getState().undo();
    expect(useShotStore.getState().shot.durationSeconds).toBe(initialDuration);
    expect(useShotStore.getState().canUndo).toBe(false);
  });

  it('batches all 6 mutations of CinematicPresetsModal into 1 atomic Undo step', () => {
    const store = useShotStore.getState();
    const beforeLens = store.shot.camera.lens.focalLength;
    const beforeAspect = store.shot.aspectRatio;
    const onClose = vi.fn();

    const { getAllByText } = render(<CinematicPresetsModal isOpen={true} onClose={onClose} />);
    fireEvent.click(getAllByText('Apply This Feeling to Shot')[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useShotStore.getState().shot.aspectRatio).toBe('2.39:1');

    // Single Undo restores all 6 camera/lighting/aspect fields back to pre-preset state
    useShotStore.getState().undo();
    expect(useShotStore.getState().shot.camera.lens.focalLength).toBe(beforeLens);
    expect(useShotStore.getState().shot.aspectRatio).toBe(beforeAspect);
    expect(useShotStore.getState().canUndo).toBe(false);
  });

  it('batches applyMocapStudioPayloadToShotStore multi-store updates into 1 atomic Undo step', () => {
    const store = useShotStore.getState();
    const actor = store.shot.actors[0];
    const beforeMovement = store.shot.camera.movement.type;

    applyMocapStudioPayloadToShotStore(
      {
        actorId: actor.id,
        actionDescription: 'walking forward',
        durationSeconds: 5.5,
        poseKeyframes: [
          { time: 0, bones: {} },
          { time: 5.5, bones: {} },
        ],
        trajectoryKeyframes: [
          { id: 'kf0', time: 0, position: { x: 50, y: 48, z: 0 } },
          { id: 'kf1', time: 5.5, position: { x: 50, y: 40, z: 0 } },
        ],
        cameraMotion: {
          focalLength: '50mm',
          shotType: 'medium-wide',
          angle: 'eye-level',
          movementType: 'dolly-in',
          speed: 'moderate',
          startPosition: { x: 50, y: 70, z: 0 },
          endPosition: { x: 50, y: 62, z: 0 },
          targetLookAt: { x: 50, y: 46 },
          keyframes: [],
          panDeltaNorm: 0,
          tiltDeltaNorm: 0,
          zoomDeltaRatio: 1,
          summaryText: 'Dolly-in 50mm',
        },
      },
      actor
    );

    expect(useShotStore.getState().shot.durationSeconds).toBe(5.5);
    useShotStore.getState().undo();
    expect(useShotStore.getState().shot.camera.movement.type).toBe(beforeMovement);
    expect(useShotStore.getState().canUndo).toBe(false);
  });

  it('keeps actor.token editable for .GLB actors, caps dense mocap cue DOM nodes, and dispatches synchronous actorId pose events', () => {
    const denseKfs = Array.from({ length: 180 }, (_, idx) => ({
      id: `dense-kf-${idx}`,
      time: Number(((idx / 179) * 6).toFixed(3)),
      position: { x: 50, y: 50, z: 0 },
    }));

    const glbActor: Actor = {
      id: 'hero-glb-1',
      name: 'Vanguard Operative',
      kind: 'human',
      rigType: 'humanoid',
      color: '#22d3ee',
      token: 'armored vanguard operative in matte carbon coat',
      actionDescription: 'advances forward',
      modelUrl: '/models/Soldier.glb',
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 50, y: 50, z: 0 },
        endPosition: { x: 50, y: 44, z: 0 },
        keyframes: denseKfs,
      },
    };

    const onUpdateActor = vi.fn();
    const receivedActorIds: string[] = [];
    const onGroundFeet = (e: Event) => {
      receivedActorIds.push((e as CustomEvent).detail?.actorId);
    };
    window.addEventListener('cmpvs:ground-actor-feet', onGroundFeet);

    const { container, getByDisplayValue, getByText } = render(
      <CharacterControlCard
        actor={glbActor}
        allActors={[glbActor]}
        humanoidActors={[glbActor]}
        shotDurationSeconds={6}
        sceneDescription="misty cyberpunk street"
        currentTime={0}
        isSelected={true}
        isCollapsed={false}
        isFineTuneOpen={true}
        isMotionSectionOpen={false}
        isTimingSectionOpen={true}
        motionWindow={{ start: 0, end: 6 }}
        activeHumanGroup="move"
        travelMode="auto"
        refiningActorId={null}
        generatingActingId={null}
        socketTargetActorId=""
        socketTargetBone="RightHand"
        onSelectActor={vi.fn()}
        onToggleCollapse={vi.fn()}
        onToggleFineTune={vi.fn()}
        onToggleMotionSection={vi.fn()}
        onToggleTimingSection={vi.fn()}
        onUpdateMotionWindow={vi.fn()}
        onUpdateHumanGroup={vi.fn()}
        onUpdateTravelMode={vi.fn()}
        onUpdateActor={onUpdateActor}
        onRemoveActor={vi.fn()}
        onAddToCastPool={vi.fn()}
        onUpdateActorPositionAtTime={vi.fn()}
        onApplyReadyMadeMotion={vi.fn()}
        onDirectCustomAction={vi.fn().mockResolvedValue(undefined)}
        onResetActorMotion={vi.fn()}
        onRemoveActorCue={vi.fn()}
        onExtendShotDuration={vi.fn()}
        onMoveActorCueTime={vi.fn()}
        onScaleActorCuesInRange={vi.fn()}
        onRefineObjectByPrompt={vi.fn().mockResolvedValue(undefined)}
        onAttachGlbFile={vi.fn().mockResolvedValue(undefined)}
        onSocketActorToBone={vi.fn()}
        onUnsocketActor={vi.fn()}
        onChangeSocketTargetActor={vi.fn()}
        onChangeSocketTargetBone={vi.fn()}
      />
    );

    // 1. actor.token input is unlocked and editable even when actor.modelUrl is present
    const tokenInput = getByDisplayValue('armored vanguard operative in matte carbon coat');
    fireEvent.change(tokenInput, { target: { value: 'desert nomad in linen cloak' } });
    expect(onUpdateActor).toHaveBeenCalledWith('hero-glb-1', { token: 'desert nomad in linen cloak' });

    // 2. Dense 180-frame Mocap cue ribbon renders <= 40 nodes instead of 180 DOM nodes
    const cueNodes = container.querySelectorAll('[data-testid^="draggable-cue-node-"]');
    expect(cueNodes.length).toBeLessThanOrEqual(40);
    expect(cueNodes.length).toBeGreaterThanOrEqual(30);

    // 3. Ground Feet dispatches synchronously with explicit actorId payload (no 10ms race)
    fireEvent.click(getByText('Ground Feet'));
    expect(receivedActorIds).toEqual(['hero-glb-1']);

    window.removeEventListener('cmpvs:ground-actor-feet', onGroundFeet);
  });

  it('exposes the .FBX / .GLB mocap import tab button and closes MocapStudioModal on Escape', () => {
    const actor = useShotStore.getState().shot.actors[0];
    const onClose = vi.fn();
    const { getByTestId } = render(
      <MocapStudioModal
        isOpen={true}
        actor={actor}
        shotDurationSeconds={4}
        onClose={onClose}
        onApplyMocap={vi.fn()}
      />
    );

    expect(getByTestId('mocap-tab-video')).toBeTruthy();
    expect(getByTestId('mocap-tab-fbx')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('blocks SSRF URLs in fetchRemoteWorkflowJson and keeps NLF target downloads outside D:\\ComfyUI\\models', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const syncSvc = require('../src/server/comfyWorkflowSyncService.cjs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nlfSvc = require('../src/server/mocapNlfService.cjs');

    await expect(
      syncSvc.fetchRemoteWorkflowJson('http://127.0.0.1:8188/system_stats')
    ).rejects.toThrow(/HTTPS/i);
    await expect(
      syncSvc.fetchRemoteWorkflowJson('https://localhost/internal.json')
    ).rejects.toThrow(/Private, loopback/i);

    const status = nlfSvc.getMocapNlfStatus();
    expect(String(status.targetInstallPath)).not.toMatch(/ComfyUI[\\/]models/i);
    expect(String(status.targetInstallPath)).toMatch(/models[\\/]nlf/i);
  });

  it('applies DirectorialSteeringModal patch in 1 Undo step without wiping 3D Previs video passes', () => {
    const store = useShotStore.getState();
    store.setPrevisVideo('blob:previs-rgb.mp4', new Blob(['rgb'], { type: 'video/mp4' }));
    store.setPrevisClay('blob:previs-clay.mp4', new Blob(['clay'], { type: 'video/mp4' }));
    store.clearHistory();

    const beforeSeed = useShotStore.getState().shot.seed;
    const beforeNeg = useShotStore.getState().shot.negativePrompt;

    const sourceTake: ShotRevisionV2 = {
      id: 'rev-steer-1',
      shotId: useShotStore.getState().shot.id,
      version: 1,
      takeNumber: 1,
      createdAt: Date.now(),
      note: 'Take 1',
      engine: 'ltx-2.5',
      templateId: 'ltx25_stubelius',
      templateHash: 'hash',
      bindingSchema: 1,
      mode: 'control',
      profile: 'final',
      seed: 1000,
      prompt: 'Original camera tracking shot',
      negative: 'blurry',
      promptSource: 'compiled',
      submittedWorkflow: {},
      status: 'completed',
      outputVideoUrl: 'blob:take1.mp4',
      outputFilename: 'Take_01.mp4',
      shotSpec: JSON.parse(JSON.stringify(useShotStore.getState().shot)),
    };

    const patch: DirectorialSteeringPatch = {
      sourceTakeId: 'rev-steer-1',
      sourceTakeNumber: 1,
      reason: 'Camera pan lagged behind directed 3D trajectory',
      originalPositivePrompt: 'Original camera tracking shot',
      steeredPositivePrompt: 'Decisive smooth horizontal leftward camera pan across the set',
      originalNegativePrompt: 'blurry',
      steeredNegativePrompt: 'blurry, static locked tripod camera',
      originalIcLoraStrength: 0.7,
      steeredIcLoraStrength: 0.9,
      suggestedSeedOffset: 107,
      appliedDirectives: ['Decisive smooth horizontal leftward camera pan'],
    };

    const onClose = vi.fn();
    const onApplySeedToDeck = vi.fn();
    const { getByText } = render(
      <DirectorialSteeringModal
        sourceTake={sourceTake}
        patch={patch}
        onClose={onClose}
        onApplySeedToDeck={onApplySeedToDeck}
      />
    );

    fireEvent.click(getByText('Apply to Active Shot'));

    const afterState = useShotStore.getState();
    // Previs passes MUST survive intact (loadShot would have wiped them!)
    expect(afterState.previsVideoUrl).toBe('blob:previs-rgb.mp4');
    expect(afterState.previsClayUrl).toBe('blob:previs-clay.mp4');
    expect(afterState.shot.customPositivePrompts?.['ltx-2.5']).toContain('Decisive smooth horizontal leftward camera pan');
    expect(afterState.shot.negativePrompt).toBe('blurry, static locked tripod camera');
    expect(afterState.shot.seed).toBe(1107);
    expect(onApplySeedToDeck).toHaveBeenCalledWith(1107);
    expect(onClose).toHaveBeenCalledTimes(1);

    // One single Undo restores prompt, negativePrompt, and seed together
    afterState.undo();
    const undone = useShotStore.getState();
    expect(undone.shot.seed).toBe(beforeSeed);
    expect(undone.shot.negativePrompt).toBe(beforeNeg);
    expect(undone.canUndo).toBe(false);
  });

  it('mounts TakesGrid Contact Sheet inside PrevisExportDeck for LTX-2.5 & MiniMax H3 and hides it on Seedance', () => {
    useHistoryStore.getState().clearHistory();
    useShotStore.getState().updateTargetModel('ltx-2.5');

    const { queryByText } = render(<PrevisExportDeck />);
    expect(queryByText('Takes Contact Sheet & Multi-Seed Queue')).not.toBeNull();

    // Switch active shot model to MiniMax H3 -> TakesGrid remains mounted
    useShotStore.getState().updateTargetModel('minimax-h3');
    cleanup();
    const renderedH3 = render(<PrevisExportDeck />);
    expect(renderedH3.queryByText('Takes Contact Sheet & Multi-Seed Queue')).not.toBeNull();

    // Switch active shot model to Seedance (prompt-export only) -> TakesGrid is hidden
    useShotStore.getState().updateTargetModel('seedance');
    cleanup();
    const renderedSeedance = render(<PrevisExportDeck />);
    expect(renderedSeedance.queryByText('Takes Contact Sheet & Multi-Seed Queue')).toBeNull();
  });
});
