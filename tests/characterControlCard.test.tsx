// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CharacterControlCard } from '../src/components/CharacterControlCard';
import { Actor } from '../src/types/shotspec';

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
    expect(getByText('ComfyUI Reference Image')).toBeTruthy();
    expect(getByText('Edit 3D Look by Prompt')).toBeTruthy();
    expect(getByText('Target Color (Scene ID)')).toBeTruthy();

    // Switch to Rig/XYZ tab
    fireEvent.click(getByRole('tab', { name: /Rig\/XYZ/i }));
    expect(getByRole('tab', { name: /Rig\/XYZ/i }).getAttribute('aria-selected')).toBe('true');
    expect(getByText('3D Object Scale')).toBeTruthy();
    expect(getByText('Socket to Character Bone')).toBeTruthy();

    // Switch to All tab
    fireEvent.click(getByRole('tab', { name: /All/i }));
    expect(getByRole('tab', { name: /All/i }).getAttribute('aria-selected')).toBe('true');
  });
});

