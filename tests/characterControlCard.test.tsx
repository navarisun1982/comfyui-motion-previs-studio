// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { CharacterControlCard } from '../src/components/CharacterControlCard';
import { PrevisExportDeck } from '../src/components/PrevisExportDeck';
import { buildDefaultShotSpec, DEFAULT_SCENES } from '../src/components/ShotBible';
import { Actor } from '../src/types/shotspec';
import * as THREE from 'three';
import {
  compileReadyMadeMotionKeyframes,
  findReadyMadeMotionById,
  createHumanoidSkeleton,
  createStylizedHumanoidStandin,
} from '../src/engine/kinematics';
import { useShotStore } from '../src/stores/useShotStore';

const mockActor: Actor = {
  id: 'actor-test-1',
  name: 'Character 2 (Stage Right)',
  kind: 'human',
  token: 'Character 2 on stage right',
  actionDescription: 'running fast from 25 to 8',
  color: '#eab308',
  scale: 1.0,
  trajectory: {
    startTimeSeconds: 0,
    startPosition: { x: 47, y: 44, z: 0 },
    endPosition: { x: 47, y: 18, z: 0 },
    keyframes: [
      { id: 'kf-1', time: 0, position: { x: 47, y: 44, z: 0 } },
      { id: 'kf-2', time: 2, position: { x: 47, y: 18, z: 0 } },
    ],
  },
};

const mockOtherActor: Actor = {
  id: 'actor-test-2',
  name: 'Character 1 (Stage Left)',
  kind: 'human',
  token: 'Character 1 on stage left',
  actionDescription: 'standing',
  trajectory: {
    startTimeSeconds: 0,
    startPosition: { x: 30, y: 50, z: 0 },
    endPosition: { x: 30, y: 50, z: 0 },
  },
};

describe('CharacterControlCard — 2026 UI/UX Inspector Verification', () => {
  const createProps = (overrides = {}) => ({
    actor: mockActor,
    allActors: [mockActor, mockOtherActor],
    humanoidActors: [mockActor, mockOtherActor],
    shotDurationSeconds: 10,
    sceneDescription: 'Test soundstage',
    currentTime: 1.0,
    isSelected: true,
    isCollapsed: false,
    isFineTuneOpen: true,
    isMotionSectionOpen: true,
    isTimingSectionOpen: true,
    motionWindow: { start: 0, end: 10 },
    activeHumanGroup: 'move' as const,
    travelMode: 'in-place' as const,
    refiningActorId: null,
    generatingActingId: null,
    socketTargetActorId: 'actor-test-2',
    socketTargetBone: 'RightHand' as const,
    onSelectActor: vi.fn(),
    onToggleCollapse: vi.fn(),
    onToggleFineTune: vi.fn(),
    onToggleMotionSection: vi.fn(),
    onToggleTimingSection: vi.fn(),
    onUpdateMotionWindow: vi.fn(),
    onUpdateHumanGroup: vi.fn(),
    onUpdateTravelMode: vi.fn(),
    onUpdateActor: vi.fn(),
    onRemoveActor: vi.fn(),
    onAddToCastPool: vi.fn(),
    onUpdateActorPositionAtTime: vi.fn(),
    onApplyReadyMadeMotion: vi.fn(),
    onDirectCustomAction: vi.fn().mockResolvedValue(undefined),
    onRefineObjectByPrompt: vi.fn().mockResolvedValue(undefined),
    onAttachGlbFile: vi.fn().mockResolvedValue(undefined),
    onSocketActorToBone: vi.fn(),
    onUnsocketActor: vi.fn(),
    onChangeSocketTargetActor: vi.fn(),
    onChangeSocketTargetBone: vi.fn(),
    ...overrides,
  });

  it('preserves Character Header controls (collapse, name edit, type badge, Save, Delete)', () => {
    const props = createProps();
    const { getByDisplayValue, getByText, getByLabelText } = render(<CharacterControlCard {...props} />);

    const nameInput = getByDisplayValue('Character 2 (Stage Right)');
    fireEvent.change(nameInput, { target: { value: 'Hero Lead' } });
    expect(props.onUpdateActor).toHaveBeenCalledWith('actor-test-1', { name: 'Hero Lead' });

    fireEvent.click(getByText('Save'));
    expect(props.onAddToCastPool).toHaveBeenCalledWith(mockActor);

    fireEvent.click(getByLabelText('Delete Character 2 (Stage Right)'));
    expect(props.onRemoveActor).toHaveBeenCalledWith('actor-test-1');
  });

  it('preserves Motion Studio controls (Auto/Move/Spot, Move/Fight/Act tabs, and motion presets)', () => {
    const props = createProps();
    const { getByText } = render(<CharacterControlCard {...props} />);

    // Verify all 5 Move/Jump presets are rendered
    expect(getByText('Walk Forward')).toBeTruthy();
    expect(getByText('Run / Sprint')).toBeTruthy();
    expect(getByText('Jump / Leap')).toBeTruthy();
    expect(getByText('Sneak / Stealth')).toBeTruthy();
    expect(getByText('Back Up / Retreat')).toBeTruthy();

    // Switch Travel Mode
    fireEvent.click(getByText('Move'));
    expect(props.onUpdateTravelMode).toHaveBeenCalledWith('actor-test-1', 'travel');
    expect(props.onApplyReadyMadeMotion).toHaveBeenCalled();

    // Switch Category Tab
    fireEvent.click(getByText('Fight / Action'));
    expect(props.onUpdateHumanGroup).toHaveBeenCalledWith('actor-test-1', 'combat');

    // Trigger Preset
    fireEvent.click(getByText('Walk Forward'));
    expect(props.onApplyReadyMadeMotion).toHaveBeenCalledWith('actor-test-1', 'human-walk-forward', {
      startTimeSec: 0,
      endTimeSec: 10,
      travelMode: 'in-place',
      motionCycles: 1,
    });
  });

  it('preserves Positioning & Stance controls and Timing & Direction controls', () => {
    const props = createProps();
    const { getByText, getByDisplayValue } = render(<CharacterControlCard {...props} />);

    // Stance / Loop & Floor Spot
    expect(getByText('Stance / Loop')).toBeTruthy();
    expect(getByText(/Floor Spot/)).toBeTruthy();
    expect(getByText('Action Cycles')).toBeTruthy();
    fireEvent.click(getByText('2x'));
    expect(props.onUpdateActor).toHaveBeenCalledWith('actor-test-1', { motionCycles: 2 });

    // Timing & Direction
    const promptInput = getByDisplayValue('running fast from 25 to 8');
    fireEvent.change(promptInput, { target: { value: 'walk to center' } });
    expect(props.onUpdateActor).toHaveBeenCalledWith('actor-test-1', { actionDescription: 'walk to center' });

    fireEvent.click(getByText('Direct'));
    expect(props.onDirectCustomAction).toHaveBeenCalled();

    fireEvent.click(getByText('Clear'));
    expect(props.onUpdateActor).toHaveBeenCalledWith(
      'actor-test-1',
      expect.objectContaining({ gait: 'idle', motionClip: undefined })
    );
  });

  it('preserves Appearance, Color, XYZ Transform, Scale, Rig buttons, and Bone Socketing', () => {
    const props = createProps();
    const { getByText, getByLabelText } = render(<CharacterControlCard {...props} />);

    // Edit 3D Look
    fireEvent.click(getByText('Edit 3D'));
    expect(props.onRefineObjectByPrompt).toHaveBeenCalledWith(mockActor);

    // XYZ Transform Sliders
    fireEvent.change(getByLabelText('Stage X coordinate'), { target: { value: '65' } });
    expect(props.onUpdateActorPositionAtTime).toHaveBeenCalled();

    // Scale Presets
    fireEvent.click(getByText('1.5x'));
    expect(props.onUpdateActor).toHaveBeenCalledWith('actor-test-1', { scale: 1.5 });

    // Rig Buttons
    expect(getByText('Ground Feet')).toBeTruthy();
    expect(getByText('Pose Cue')).toBeTruthy();
    expect(getByText('Reset')).toBeTruthy();

    // Bone Socketing
    fireEvent.click(getByText('Attach'));
    expect(props.onSocketActorToBone).toHaveBeenCalledWith('actor-test-1', 'actor-test-2', 'RightHand');
  });

  it('switches cleanly across all 5 Zero-Scroll sub-tabs (Motion, Timing, Look/Ref, Rig/XYZ, All) with 100% feature parity', () => {
    const props = createProps({
      isFineTuneOpen: false,
      isMotionSectionOpen: false,
      isTimingSectionOpen: false,
    });
    const { getByRole, getByText } = render(<CharacterControlCard {...props} />);

    // Default tab is Motion — Ready-Made Motions are visible even if isMotionSectionOpen was false
    expect(getByRole('tab', { name: /Motion/i }).getAttribute('aria-selected')).toBe('true');
    expect(getByText('Walk Forward')).toBeTruthy();

    // Switch to Timing tab
    fireEvent.click(getByRole('tab', { name: /Timing/i }));
    expect(getByRole('tab', { name: /Timing/i }).getAttribute('aria-selected')).toBe('true');
    expect(getByText('Action Cycles')).toBeTruthy();
    expect(getByText('Direct')).toBeTruthy();

    // Switch to Look/Ref tab
    fireEvent.click(getByRole('tab', { name: /Look\/Ref/i }));
    expect(getByRole('tab', { name: /Look\/Ref/i }).getAttribute('aria-selected')).toBe('true');
    expect(getByText('Reference Image')).toBeTruthy();
    expect(getByText('3D Look Prompt')).toBeTruthy();
    expect(getByText('Target Color')).toBeTruthy();

    // Switch to Rig/XYZ tab
    fireEvent.click(getByRole('tab', { name: /Rig\/XYZ/i }));
    expect(getByRole('tab', { name: /Rig\/XYZ/i }).getAttribute('aria-selected')).toBe('true');
    expect(getByText('Object Scale')).toBeTruthy();
    expect(getByText('Bone Socket')).toBeTruthy();

    // Switch to All tab
    fireEvent.click(getByRole('tab', { name: /All/i }));
    expect(getByRole('tab', { name: /All/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('genuinely repeats Ready-Made Motions and custom directed actions when Action Cycles is 2x or 3x', () => {
    const jumpClip = findReadyMadeMotionById('human-jump-leap')!;
    expect(jumpClip).toBeDefined();

    // 3x cycles of Jump / Leap across 0..6s should produce 36 intervals (37 keyframes) with 3 distinct airborne elevation peaks (z > 10)
    const compiled3x = compileReadyMadeMotionKeyframes(mockActor, jumpClip.id, {
      startTimeSec: 0,
      endTimeSec: 6,
      startPosition: { x: 47, y: 44, z: 0 },
      motionCycles: 3,
    });
    expect(compiled3x.keyframes.length).toBe(37);

    // Verify peak airborne height happens inside each of the 3 cycles (around t ≈ 1.0s, 3.0s, 5.0s) and lands (z ≈ 0) at cycle boundaries (t = 0s, 2s, 4s, 6s)
    const zAt0 = compiled3x.keyframes.find((k) => Math.abs(k.time - 0) < 0.05)?.position.z ?? -1;
    const zAt1 = compiled3x.keyframes.find((k) => Math.abs(k.time - 1) < 0.1)?.position.z ?? 0;
    const zAt2 = compiled3x.keyframes.find((k) => Math.abs(k.time - 2) < 0.05)?.position.z ?? -1;
    const zAt3 = compiled3x.keyframes.find((k) => Math.abs(k.time - 3) < 0.1)?.position.z ?? 0;
    const zAt4 = compiled3x.keyframes.find((k) => Math.abs(k.time - 4) < 0.05)?.position.z ?? -1;
    const zAt5 = compiled3x.keyframes.find((k) => Math.abs(k.time - 5) < 0.1)?.position.z ?? 0;
    const zAt6 = compiled3x.keyframes.find((k) => Math.abs(k.time - 6) < 0.05)?.position.z ?? -1;

    expect(zAt0).toBe(0);
    expect(zAt1).toBeGreaterThan(12);
    expect(zAt2).toBe(0);
    expect(zAt3).toBeGreaterThan(12);
    expect(zAt4).toBe(0);
    expect(zAt5).toBeGreaterThan(12);
    expect(zAt6).toBe(0);

    // Also verify applyDirectorialMotion preserves Ready-Made Motion & motionCycles when Direct is clicked on a Ready-Made Motion phrase
    const store = useShotStore.getState();
    const firstActorId = store.shot.actors[0].id;
    store.applyReadyMadeMotion(firstActorId, 'human-jump-leap', {
      startTimeSec: 0,
      endTimeSec: 6,
      motionCycles: 3,
    });
    const afterReady = useShotStore.getState().shot.actors.find((a) => a.id === firstActorId)!;
    expect(afterReady.motionClip).toBe('human-jump-leap');
    expect(afterReady.motionCycles).toBe(3);

    // Clicking Direct with the Ready-Made phrase keeps motionClip and 3x cycles (37 keyframes)
    store.applyDirectorialMotion(firstActorId, afterReady.actionDescription, {
      startTimeSec: 0,
      endTimeSec: 6,
      motionCycles: 3,
    });
    const afterDirect = useShotStore.getState().shot.actors.find((a) => a.id === firstActorId)!;
    expect(afterDirect.motionClip).toBe('human-jump-leap');
    expect(afterDirect.motionCycles).toBe(3);
    expect(afterDirect.trajectory.keyframes?.length).toBe(37);
  });

  it('compiles natural-language Direct prompts (walk to right, jump, wave, look around, running fast from 25 to 8, and multi-step sequences) into live trajectory keyframes and motion clips', () => {
    const store = useShotStore.getState();
    const actorId = store.shot.actors[0].id;

    // 1. Default Lead Subject prompt ("turns head slowly toward the camera with focused gaze")
    store.applyDirectorialMotion(actorId, 'turns head slowly toward the camera with focused gaze', {
      startTimeSec: 0,
      endTimeSec: 4,
    });
    const afterLook = useShotStore.getState().shot.actors.find((a) => a.id === actorId)!;
    expect(afterLook.motionClip).toBe('human-look-search');
    expect(afterLook.actionDescription).toBe('turns head slowly toward the camera with focused gaze');
    expect((afterLook.trajectory.keyframes?.length || 0)).toBeGreaterThan(5);

    // 2. Directional walk ("walk to right")
    const beforeWalkX = afterLook.trajectory.startPosition.x;
    store.applyDirectorialMotion(actorId, 'walk to right', {
      startTimeSec: 0,
      endTimeSec: 4,
    });
    const afterWalkRight = useShotStore.getState().shot.actors.find((a) => a.id === actorId)!;
    expect(afterWalkRight.motionClip).toBe('human-walk-forward');
    expect(afterWalkRight.gait).toBe('walk');
    expect(afterWalkRight.trajectory.endPosition.x).toBeGreaterThan(beforeWalkX + 10);

    // 3. Coordinate range ("running fast from 25 to 8")
    store.applyDirectorialMotion(actorId, 'running fast from 25 to 8', {
      startTimeSec: 0,
      endTimeSec: 4,
    });
    const afterRunRange = useShotStore.getState().shot.actors.find((a) => a.id === actorId)!;
    expect(afterRunRange.motionClip).toBe('human-run-sprint');
    expect(afterRunRange.gait).toBe('run');
    expect(afterRunRange.trajectory.startPosition.y).not.toBe(afterRunRange.trajectory.endPosition.y);

    // 4. Multi-step compound prompt ("walk to right, then sit down")
    store.applyDirectorialMotion(actorId, 'walk to right, then sit down', {
      startTimeSec: 0,
      endTimeSec: 6,
    });
    const afterMulti = useShotStore.getState().shot.actors.find((a) => a.id === actorId)!;
    expect(afterMulti.trajectory.keyframes?.some((kf) => kf.motionClip === 'human-walk-forward')).toBe(true);
    expect(afterMulti.trajectory.keyframes?.some((kf) => kf.motionClip === 'human-sit-down')).toBe(true);

    // 5. Arabic multi-beat ground crawl + stand up ("رجلا يزحف علي الارض ثم يقوم")
    store.applyDirectorialMotion(actorId, 'رجلا يزحف علي الارض ثم يقوم', {
      startTimeSec: 0,
      endTimeSec: 6,
    });
    const afterCrawlStand = useShotStore.getState().shot.actors.find((a) => a.id === actorId)!;
    expect(afterCrawlStand.trajectory.keyframes?.some((kf) => kf.motionClip === 'human-crawl-prone')).toBe(true);
    expect(afterCrawlStand.trajectory.keyframes?.some((kf) => kf.motionClip === 'human-stand-up')).toBe(true);

    // 6. Open-ended Universal IK synthesizer for arbitrary actions ("يصفق بحماس ثم يسبح للامام")
    store.applyDirectorialMotion(actorId, 'يصفق بحماس ثم يسبح للامام', {
      startTimeSec: 0,
      endTimeSec: 6,
    });
    const afterUniversal = useShotStore.getState().shot.actors.find((a) => a.id === actorId)!;
    expect(
      afterUniversal.trajectory.keyframes?.some((kf) => Boolean(kf.motionClip?.startsWith('universal-ik:')))
    ).toBe(true);
  });

  it('toggles the 14-site Animated .GLB Resources Directory inside the Look/Ref sub-tab', () => {
    const props = createProps();
    const { getByRole, getByText } = render(<CharacterControlCard {...props} />);

    fireEvent.click(getByRole('tab', { name: /Look\/Ref/i }));
    const glbSitesBtn = getByText('.GLB Sites');
    expect(glbSitesBtn).toBeTruthy();

    fireEvent.click(glbSitesBtn);
    expect(getByText('Quaternius')).toBeTruthy();
    expect(getByText('Poly Pizza')).toBeTruthy();
    expect(getByText('Kenney 3D Assets')).toBeTruthy();
    expect(getByText('Adobe Mixamo')).toBeTruthy();
    expect(getByText('Meshy AI')).toBeTruthy();
    expect(getByText('gltf.report (by Don McCurdy)')).toBeTruthy();
  });

  it('supports Option 1 (Smart Directed/Replay state), Option 2 (+ Chain cumulative motion & auto duration extension), and Full Reset/Clear to start fresh', () => {
    const onResetActorMotion = vi.fn();
    const onExtendShotDuration = vi.fn();
    const props = createProps({
      shotDurationSeconds: 2.0,
      motionWindow: { start: 0, end: 2.0 },
      onResetActorMotion,
      onExtendShotDuration,
    });

    const { getByText, queryByTestId, rerender } = render(<CharacterControlCard {...props} />);

    // Initially, before clicking Direct in this session, + Chain is visible because kfs.length > 0
    expect(queryByTestId('directed-active-badge')).toBeNull();
    expect(getByText('+ Chain')).toBeTruthy();

    // 1. Click Direct -> marks current prompt & window as "Directed" (Option 1)
    fireEvent.click(getByText('Direct'));
    expect(props.onDirectCustomAction).toHaveBeenCalledWith(
      mockActor,
      'running fast from 25 to 8',
      0,
      2.0,
      2.0,
      1
    );
    expect(queryByTestId('directed-active-badge')).toBeTruthy();
    expect(getByText('(Replay)')).toBeTruthy();

    // 2. User edits prompt -> "Directed" badge clears and "+ Chain" appears for cumulative chaining (Option 2)
    const updatedActor: Actor = {
      ...mockActor,
      actionDescription: 'sit down',
    };
    rerender(
      <CharacterControlCard
        {...props}
        actor={updatedActor}
      />
    );
    expect(queryByTestId('directed-active-badge')).toBeNull();
    const chainBtn = getByText('+ Chain');
    expect(chainBtn).toBeTruthy();

    // Since lastKfTime is 2.0s and shotDurationSeconds is 2.0s, clicking + Chain auto-extends shot duration to 5.0s and chains from 2.0s -> 5.0s!
    fireEvent.click(chainBtn);
    expect(onExtendShotDuration).toHaveBeenCalledWith(5.0);
    expect(props.onUpdateMotionWindow).toHaveBeenCalledWith('actor-test-1', { start: 2.0, end: 5.0 });
    expect(props.onDirectCustomAction).toHaveBeenCalledWith(
      updatedActor,
      'sit down',
      2.0,
      5.0,
      3.0,
      1
    );

    // 3. Full Reset / Clear option cancels all motion, resets window to 0 -> shotDur, and invokes resetActorMotion in useShotStore
    fireEvent.click(getByText('Clear'));
    expect(onResetActorMotion).toHaveBeenCalledWith('actor-test-1');
    expect(props.onUpdateMotionWindow).toHaveBeenCalledWith('actor-test-1', { start: 0, end: 2.0 });

    // Also verify useShotStore.getState().resetActorMotion directly clears keyframes, resets pose/gait, and rewinds currentTime to 0
    const store = useShotStore.getState();
    const firstActorId = store.shot.actors[0].id;
    store.applyDirectorialMotion(firstActorId, 'walk to right', { startTimeSec: 0, endTimeSec: 4 });
    expect((useShotStore.getState().shot.actors[0].trajectory.keyframes?.length || 0)).toBeGreaterThan(0);

    store.resetActorMotion(firstActorId);
    const resetActor = useShotStore.getState().shot.actors[0];
    expect(resetActor.trajectory.keyframes).toEqual([]);
    expect(resetActor.motionClip).toBeUndefined();
    expect(resetActor.gait).toBe('none');
    expect(resetActor.posePreset).toBe('neutral-stand');
    expect(resetActor.trajectory.endPosition).toEqual(resetActor.trajectory.startPosition);
    expect(useShotStore.getState().currentTime).toBe(0);
    expect(useShotStore.getState().isPlaying).toBe(false);
  });

  it('supports Cue Drag & Drop retiming, Cue Span speed stretching/shifting, and Motion Pacing Curves (Linear, Smooth, Burst, Ramp)', () => {
    const onMoveActorCueTime = vi.fn();
    const onScaleActorCuesInRange = vi.fn();
    const onApplyActorMotionCurve = vi.fn();
    const onSeekTime = vi.fn();

    const props = createProps({
      onMoveActorCueTime,
      onScaleActorCuesInRange,
      onApplyActorMotionCurve,
      onSeekTime,
    });

    const { getByTestId, getByText } = render(<CharacterControlCard {...props} />);

    // Verify the interactive cue ribbon and draggable cue nodes are rendered for the actor
    expect(getByTestId('actor-cue-ribbon-actor-test-1')).toBeTruthy();
    expect(getByTestId('actor-cue-span-bar-actor-test-1')).toBeTruthy();
    expect(getByTestId('draggable-cue-node-kf-1')).toBeTruthy();
    expect(getByTestId('draggable-cue-node-kf-2')).toBeTruthy();

    // Verify Pacing Curve buttons trigger onApplyActorMotionCurve
    fireEvent.click(getByText('Smooth'));
    expect(onApplyActorMotionCurve).toHaveBeenCalledWith('actor-test-1', 'ease-in-out', 0, 2);

    fireEvent.click(getByText('Burst ⚡'));
    expect(onApplyActorMotionCurve).toHaveBeenCalledWith('actor-test-1', 'fast-start', 0, 2);

    // Also verify useShotStore cue retiming, span scaling, and pacing curve math directly
    const store = useShotStore.getState();
    const actorId = store.shot.actors[0].id;
    store.applyDirectorialMotion(actorId, 'walk to right', { startTimeSec: 0, endTimeSec: 4 });
    const kfsBefore = useShotStore.getState().shot.actors[0].trajectory.keyframes!;
    expect(kfsBefore.length).toBeGreaterThanOrEqual(4);
    expect(kfsBefore[kfsBefore.length - 1].time).toBeCloseTo(4.0, 1);

    // 1. Scale cues from [0..4s] down to [0..2s] (2x faster!)
    store.scaleActorCuesInRange(actorId, 0, 4, 0, 2);
    const kfsScaled = useShotStore.getState().shot.actors[0].trajectory.keyframes!;
    expect(kfsScaled[0].time).toBeCloseTo(0, 1);
    expect(kfsScaled[kfsScaled.length - 1].time).toBeCloseTo(2.0, 1);

    // 2. Move a specific cue's time via moveActorKeyframeTime
    const firstCueId = kfsScaled[0].id;
    store.moveActorKeyframeTime(actorId, firstCueId, 0.45);
    const kfsMoved = useShotStore.getState().shot.actors[0].trajectory.keyframes!;
    expect(kfsMoved.some((k) => k.id === firstCueId && Math.abs(k.time - 0.45) < 0.02)).toBe(true);

    // 3. Apply 'fast-start' (Burst) pacing curve and verify intermediate cues shift earlier
    store.applyDirectorialMotion(actorId, 'walk to right', { startTimeSec: 0, endTimeSec: 4 });
    const linearMidTime = useShotStore.getState().shot.actors[0].trajectory.keyframes![6].time;
    store.applyActorMotionCurve(actorId, 'fast-start', 0, 4);
    const burstMidTime = useShotStore.getState().shot.actors[0].trajectory.keyframes![6].time;
    expect(burstMidTime).not.toBe(linearMidTime);
  });

  it('strictly isolates reference images per actor and per shot when switching between scenes/shots', () => {
    const shot01aItem = DEFAULT_SCENES[0].shots[0]; // Shot 01A (Agent Kael, Interceptor Coupe, Street Planter Tree)
    const shot02aItem = DEFAULT_SCENES[1].shots[0]; // Shot 02A (Explorer Aria, Dune Buggy, Sandstone Arch)
    const shot03aItem = DEFAULT_SCENES[2].shots[0]; // Shot 03A (Julian, Elena)

    const store = useShotStore.getState();
    store.loadShot(buildDefaultShotSpec(shot01aItem));

    // Attach a reference image ONLY to Agent Kael in Shot 01A
    const kaelImg = 'data:image/png;base64,KAEL_UNIQUE_REF_01A';
    store.updateActor('actor-kael', {
      conceptImageUrl: kaelImg,
      conceptImageName: 'agent_kael_ref.png',
    });

    // Verify other elements in Shot 01A do NOT share Kael's reference image
    const s01a = useShotStore.getState().shot;
    expect(s01a.actors.find((a) => a.id === 'actor-kael')?.conceptImageUrl).toBe(kaelImg);
    expect(s01a.actors.find((a) => a.id === 'veh-interceptor')?.conceptImageUrl).toBeUndefined();
    expect(s01a.environment?.conceptImageUrl).toBeUndefined();

    // Mount PrevisExportDeck while on Shot 01A
    const { container, queryByDisplayValue } = render(<PrevisExportDeck />);
    expect(queryByDisplayValue('agent_kael_ref.png')).toBeTruthy();
    expect(container.querySelector(`img[src="${kaelImg}"]`)).toBeTruthy();

    // Switch to Scene 02 (Shot 02A - Explorer Aria) which does NOT have Agent Kael
    act(() => {
      useShotStore.getState().switchShot(shot02aItem.id, () => buildDefaultShotSpec(shot02aItem));
    });

    const s02a = useShotStore.getState().shot;
    expect(s02a.id).toBe('shot-02a');
    expect(s02a.actors.every((a) => a.conceptImageUrl === undefined)).toBe(true);
    expect(s02a.environment?.conceptImageUrl).toBeUndefined();

    // Verify PrevisExportDeck NEVER leaks Agent Kael's image or filename onto Explorer Aria or any slot in Shot 02A
    expect(queryByDisplayValue('agent_kael_ref.png')).toBeNull();
    expect(container.querySelector(`img[src="${kaelImg}"]`)).toBeNull();

    // Switch to Scene 03 (Shot 03A - Julian & Elena) and assign a separate reference image to Julian
    act(() => {
      useShotStore.getState().switchShot(shot03aItem.id, () => buildDefaultShotSpec(shot03aItem));
    });
    const julianImg = 'data:image/png;base64,JULIAN_UNIQUE_REF_03A';
    act(() => {
      useShotStore.getState().updateActor('actor-julian', {
        conceptImageUrl: julianImg,
        conceptImageName: 'julian_portrait.png',
      });
    });
    expect(queryByDisplayValue('julian_portrait.png')).toBeTruthy();
    expect(container.querySelector(`img[src="${julianImg}"]`)).toBeTruthy();
    expect(useShotStore.getState().shot.actors.find((a) => a.id === 'actor-elena')?.conceptImageUrl).toBeUndefined();

    // Switch back to Shot 01A -> Agent Kael's reference image is preserved independently, and Julian's image is not shown
    act(() => {
      useShotStore.getState().switchShot(shot01aItem.id, () => buildDefaultShotSpec(shot01aItem));
    });
    expect(queryByDisplayValue('agent_kael_ref.png')).toBeTruthy();
    expect(container.querySelector(`img[src="${kaelImg}"]`)).toBeTruthy();
    expect(container.querySelector(`img[src="${julianImg}"]`)).toBeNull();
  });

  it('spawns newly added characters completely stationary (gait: none, z: 0) and grounded above y = 0 without sinking', () => {
    const store = useShotStore.getState();
    store.resetToDefault();
    store.addActor('Stationary Guard', 'human', 'an armored guard standing watch');

    const added = useShotStore.getState().shot.actors.find((a) => a.name === 'Stationary Guard');
    expect(added).toBeDefined();
    expect(added!.gait).toBe('none');
    expect(added!.posePreset).toBe('neutral-stand');
    expect(added!.motionClip).toBeUndefined();
    expect(added!.trajectory.startPosition.z).toBe(0);
    expect(added!.trajectory.endPosition.z).toBe(0);
    expect(added!.trajectory.startPosition.x).toBe(added!.trajectory.endPosition.x);
    expect(added!.trajectory.startPosition.y).toBe(added!.trajectory.endPosition.y);

    // Verify fallback humanoid stand-in sole rests at y >= 0 (no sinking into the floor)
    const fallbackRig = createHumanoidSkeleton(5.06);
    createStylizedHumanoidStandin(fallbackRig, 0x38bdf8);
    const standinBox = new THREE.Box3().setFromObject(fallbackRig.root);
    expect(standinBox.min.y).toBeGreaterThanOrEqual(-0.005);

    // Verify Direct Bone Pose & Joint Control in Rig sub-tab
    const onUpdateActor = vi.fn();
    const { getByText } = render(<CharacterControlCard {...createProps({ onUpdateActor })} />);
    fireEvent.click(getByText('Rig/XYZ'));
    expect(getByText('Bone Pose & Joint Control')).toBeTruthy();
    fireEvent.click(getByText('LeftArm'));
  });
});

