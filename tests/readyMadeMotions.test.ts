import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  READY_MADE_MOTIONS,
  getReadyMadeMotionsForActor,
  getReadyMadeMotionsForCategory,
  findReadyMadeMotionById,
  compileReadyMadeMotionKeyframes,
  evaluateReadyMadeHumanoidClip,
  evaluateReadyMadeObjectClip,
  createHumanoidSkeleton,
} from '../src/engine/kinematics';
import { useShotStore } from '../src/stores/useShotStore';
import { installMemoryStorage } from './helpers/memoryStorage';

describe('Ready-Made Motion Library & Procedural Action Clip Engine', () => {
  beforeEach(() => {
    installMemoryStorage();
    useShotStore.getState().resetToDefault();
  });

  it('exposes complete motion catalogs for humanoid and non-human categories', () => {
    expect(READY_MADE_MOTIONS.length).toBeGreaterThanOrEqual(30);

    const humanClips = getReadyMadeMotionsForCategory('humanoid');
    expect(humanClips.length).toBe(15);
    expect(humanClips.filter((c) => c.humanGroup === 'move').length).toBe(5);
    expect(humanClips.filter((c) => c.humanGroup === 'combat').length).toBe(5);
    expect(humanClips.filter((c) => c.humanGroup === 'acting').length).toBe(5);

    expect(getReadyMadeMotionsForCategory('quadruped').length).toBeGreaterThanOrEqual(5);
    expect(getReadyMadeMotionsForCategory('vehicle').length).toBeGreaterThanOrEqual(5);
    expect(getReadyMadeMotionsForCategory('aerial').length).toBeGreaterThanOrEqual(4);
    expect(getReadyMadeMotionsForCategory('weapon_prop').length).toBeGreaterThanOrEqual(4);
    expect(getReadyMadeMotionsForCategory('furniture_set').length).toBeGreaterThanOrEqual(4);
  });

  it('resolves category-aware motions for characters (even when holding weapons) and non-human objects', () => {
    const humanWithPistol = getReadyMadeMotionsForActor({
      name: 'Character 2 (Stage Right)',
      kind: 'human',
      token: 'character 2 on stage right holding a pistol pointing forward',
    });
    expect(humanWithPistol.category).toBe('humanoid');
    expect(humanWithPistol.clips.some((c) => c.id === 'human-aim-fire')).toBe(true);

    const wolf = getReadyMadeMotionsForActor({
      name: 'Timber Wolf',
      kind: 'animal',
      token: 'a fierce wolf',
    });
    expect(wolf.category).toBe('quadruped');
    expect(wolf.clips.some((c) => c.id === 'quad-pounce-leap')).toBe(true);

    const car = getReadyMadeMotionsForActor({
      name: 'Police Cruiser',
      kind: 'vehicle',
      token: 'a fast police car',
    });
    expect(car.category).toBe('vehicle');
    expect(car.clips.some((c) => c.id === 'veh-hard-brake')).toBe(true);
  });

  it('compiles parabolic elevation and travel vs in-place keyframes for Jump / Leap', () => {
    const actor = { name: 'Hero', kind: 'human' };
    const travelCompiled = compileReadyMadeMotionKeyframes(actor, 'human-jump-leap', {
      startTimeSec: 0,
      endTimeSec: 2.0,
      startPosition: { x: 50, y: 40, z: 0 },
      travelMode: 'travel',
    });

    expect(travelCompiled.keyframes.length).toBe(13);
    // Mid-jump keyframe should have elevated Z > 8
    const maxZ = Math.max(...travelCompiled.keyframes.map((k) => k.position.z ?? 0));
    expect(maxZ).toBeGreaterThan(10);
    // End position should have traveled forward on Y
    expect(travelCompiled.endPosition.y).toBeGreaterThan(40);
    // Ends back on the floor (z = 0)
    expect(travelCompiled.endPosition.z).toBe(0);

    // In-place mode keeps X/Y stationary while still jumping vertically
    const spotCompiled = compileReadyMadeMotionKeyframes(actor, 'human-jump-leap', {
      startTimeSec: 0,
      endTimeSec: 2.0,
      startPosition: { x: 50, y: 40, z: 0 },
      travelMode: 'in-place',
    });
    expect(spotCompiled.endPosition.x).toBe(50);
    expect(spotCompiled.endPosition.y).toBe(40);
    const spotMaxZ = Math.max(...spotCompiled.keyframes.map((k) => k.position.z ?? 0));
    expect(spotMaxZ).toBeGreaterThan(10);
  });

  it('evaluates all 15 humanoid ready-made motion clips cleanly on the 19-bone rig', () => {
    const rig = createHumanoidSkeleton(5.0);
    const humanClips = getReadyMadeMotionsForCategory('humanoid');

    for (const clip of humanClips) {
      for (const progress of [0, 0.25, 0.5, 0.75, 1.0]) {
        const handled = evaluateReadyMadeHumanoidClip(rig, clip.id, progress * 2.0, progress);
        expect(handled).toBe(true);
        rig.root.updateMatrixWorld(true);

        for (const [, bone] of rig.bones) {
          expect(Number.isFinite(bone.position.x)).toBe(true);
          expect(Number.isFinite(bone.position.y)).toBe(true);
          expect(Number.isFinite(bone.position.z)).toBe(true);
          expect(Number.isFinite(bone.quaternion.x)).toBe(true);
          expect(Number.isFinite(bone.quaternion.w)).toBe(true);
        }
      }
    }
  });

  it('evaluates non-human sub-part articulation for quadrupeds, vehicles, and aerial craft', () => {
    const group = new THREE.Group();
    const legFL = new THREE.Mesh();
    legFL.name = 'front_left_leg';
    const wheel = new THREE.Mesh();
    wheel.name = 'front_wheel';
    const rotor = new THREE.Mesh();
    rotor.name = 'main_rotor';
    group.add(legFL, wheel, rotor);

    evaluateReadyMadeObjectClip(group, 'quad-gallop-charge', 0.35);
    expect(legFL.rotation.x).not.toBe(0);

    evaluateReadyMadeObjectClip(group, 'veh-drive-cruise', 0.5);
    expect(wheel.rotation.x).toBeGreaterThan(0);

    evaluateReadyMadeObjectClip(group, 'air-hover-bob', 0.5);
    expect(rotor.rotation.y).toBeGreaterThan(0);
  });

  it('applies a Ready-Made Motion via useShotStore.applyReadyMadeMotion and updates actor timeline & prompt', () => {
    const store = useShotStore.getState();
    const actorId = store.shot.actors[0].id;

    store.applyReadyMadeMotion(actorId, 'human-combo-punch', {
      startTimeSec: 0.5,
      endTimeSec: 2.5,
      travelMode: 'in-place',
    });

    const updatedActor = useShotStore.getState().shot.actors.find((a) => a.id === actorId)!;
    expect(updatedActor.motionClip).toBe('human-combo-punch');
    expect(updatedActor.actionDescription).toContain('martial arts jab and cross punch');
    expect((updatedActor.trajectory.keyframes || []).length).toBeGreaterThan(5);
    expect(findReadyMadeMotionById(updatedActor.motionClip)?.name).toBe('Punch / Fight Combo');
  });
});
