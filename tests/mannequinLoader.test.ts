import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  loadMannequinModel,
  getCachedMannequinRig,
  preloadMannequinModel,
  isMannequinReady,
  normalizeBoneName,
} from '../src/engine/kinematics/mannequinLoader';
import { HUMANOID_BONES } from '../src/engine/procedural3D/sculptSpec';
import { applyBoneRotationDelta, applyBoneTranslationDelta, resetBoneToRest } from '../src/engine/kinematics/boneTransformGizmo';
import { POSE_PRESETS, applyPosePreset, applyBonePose } from '../src/engine/kinematics/posePresets';
import {
  detectObjectPoseCategory,
  getObjectPosePresetsForCategory,
  getObjectAwareStagePlacements,
} from '../src/engine/kinematics/objectPosePresets';
import { evaluateGait } from '../src/engine/kinematics/gaitEngine';
import { compileMotionPlan } from '../src/engine/kinematics/motionCompiler';
import { walkTo } from '../src/engine/kinematics/motionSkills';

describe('Skinned Mannequin Loader & Rigging Engine', () => {
  beforeAll(async () => {
    // Preload the local Y-Bot FBX model
    await preloadMannequinModel('/models/y-bot-tpose.fbx');
  });

  it('normalizes bone names correctly for resilient Mixamo matching', () => {
    expect(normalizeBoneName('mixamorig:LeftArm')).toBe('mixamorigleftarm');
    expect(normalizeBoneName('mixamorigLeftArm')).toBe('mixamorigleftarm');
    expect(normalizeBoneName('Left_Arm')).toBe('leftarm');
  });

  it('marks mannequin as ready after preloading', () => {
    expect(isMannequinReady()).toBe(true);
  });

  it('loads and rigs the continuous, single-mesh Y-Bot mannequin', async () => {
    const rig = await loadMannequinModel({ height: 5.06, tint: '#f2eee6' });

    expect(rig).toBeDefined();
    expect(rig.root).toBeInstanceOf(THREE.Group);
    expect(rig.root.name).toBe('ProceduralMannequinRoot');
    expect(rig.root.userData.isMannequinRig).toBe(true);
    expect(rig.height).toBe(5.06);

    // Verify all 19 standard humanoid bones are mapped to real bones in the Mixamo rig
    for (const boneName of HUMANOID_BONES) {
      const bone = rig.bones.get(boneName);
      expect(bone, `Bone "${boneName}" should be mapped`).toBeDefined();
      expect(bone?.isBone).toBe(true);
      expect(rig.restPositions.has(boneName)).toBe(true);
      expect(rig.restRotations.has(boneName)).toBe(true);
    }

    // Verify skinned mesh materials
    let skinnedMeshFound = false;
    let jointMeshFound = false;
    rig.root.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        skinnedMeshFound = true;
        const mesh = child as THREE.SkinnedMesh;
        expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        expect(mat.roughness).toBe(0.66);
        expect(mat.metalness).toBe(0.0);
        if (/_Joints$/i.test(mesh.name)) {
          jointMeshFound = true;
        }
      }
    });

    expect(skinnedMeshFound).toBe(true);
    expect(jointMeshFound).toBe(true);
  });

  it('returns cloned independent rigs synchronously from getCachedMannequinRig', () => {
    const rig1 = getCachedMannequinRig({ height: 5.06 });
    const rig2 = getCachedMannequinRig({ height: 5.06 });

    expect(rig1).toBeDefined();
    expect(rig2).toBeDefined();
    expect(rig1?.root).not.toBe(rig2?.root);

    // Mutating a bone on rig1 should not affect rig2
    const rig1Arm = rig1?.bones.get('LeftArm');
    const rig2Arm = rig2?.bones.get('LeftArm');
    expect(rig1Arm).toBeDefined();
    expect(rig2Arm).toBeDefined();

    if (rig1 && rig1Arm && rig2Arm) {
      const initialRig2Quat = rig2Arm.quaternion.clone();
      applyBoneRotationDelta(rig1, 'LeftArm', 'z', Math.PI / 4);
      expect(rig2Arm.quaternion.equals(initialRig2Quat)).toBe(true);

      // Reset works
      resetBoneToRest(rig1, 'LeftArm');
      expect(rig1Arm.quaternion.equals(rig1.restRotations.get('LeftArm')!)).toBe(true);
    }
  });

  it('maintains standing stature and anatomical leg/foot heights during pose presets and locomotion gait on scaled FBX rigs', async () => {
    const rig = await loadMannequinModel({ height: 5.06 });
    const getWorldY = (boneName: (typeof HUMANOID_BONES)[number]) => {
      const v = new THREE.Vector3();
      rig.bones.get(boneName)!.getWorldPosition(v);
      return v.y;
    };

    // 1. Neutral stand must keep Hips ~2.6, Head ~4.4, Knees ~1.25, Feet near floor (< 0.35)
    applyPosePreset(rig, 'neutral-stand');
    expect(getWorldY('Hips')).toBeGreaterThan(2.3);
    expect(getWorldY('Head')).toBeGreaterThan(4.1);
    expect(getWorldY('LeftLeg')).toBeGreaterThan(1.0);
    expect(getWorldY('LeftLeg')).toBeLessThan(1.6);
    expect(getWorldY('LeftFoot')).toBeLessThan(0.35);
    expect(getWorldY('RightFoot')).toBeLessThan(0.35);

    // 2. Walk gait evaluation across cycle phases must never collapse Hips to centimeter scale
    for (const t of [0.0, 0.2, 0.4, 0.6, 0.8]) {
      evaluateGait(rig, t, { gait: 'walk', speed: 1.5 });
      expect(getWorldY('Hips'), `Hips world Y at t=${t}`).toBeGreaterThan(2.2);
      expect(getWorldY('Head'), `Head world Y at t=${t}`).toBeGreaterThan(4.0);
      expect(getWorldY('LeftLeg'), `LeftLeg world Y at t=${t}`).toBeGreaterThan(0.9);
      expect(getWorldY('LeftLeg'), `LeftLeg world Y at t=${t}`).toBeLessThan(1.8);
      expect(getWorldY('LeftFoot'), `LeftFoot world Y at t=${t}`).toBeLessThan(0.9);
    }

    // 3. Crouch & Sitting presets lower pelvis proportionally without collapsing to 0
    applyPosePreset(rig, 'crouch-cover');
    expect(getWorldY('Hips')).toBeGreaterThan(1.4);
    expect(getWorldY('Hips')).toBeLessThan(2.1);

    applyPosePreset(rig, 'sitting-chair');
    expect(getWorldY('Hips')).toBeGreaterThan(1.1);
    expect(getWorldY('Hips')).toBeLessThan(1.7);

    // 4. Bone translation delta on Hips scales properly to world units
    applyPosePreset(rig, 'neutral-stand');
    const hipsBefore = getWorldY('Hips');
    applyBoneTranslationDelta(rig, 'Hips', 'y', -0.5);
    const hipsAfter = getWorldY('Hips');
    expect(hipsBefore - hipsAfter).toBeCloseTo(0.5, 1);

    // 5. Synthetic compiler pose (from compileMotionPlan) must NEVER invert FBX legs (LeftUpLeg/RightUpLeg 180 deg bind rotation)
    const compiled = compileMotionPlan({
      actorId: 'actor-1',
      skills: [walkTo({ to: [60, 50] }, 0, 4)],
      totalDurationSec: 4,
    }, [30, 50], 0);
    applyBonePose(rig, compiled.frames[0].pose);
    expect(getWorldY('Hips')).toBeGreaterThan(2.2);
    expect(getWorldY('LeftFoot')).toBeLessThan(0.35);
    expect(getWorldY('RightFoot')).toBeLessThan(0.35);

    // 6. All pose presets must work in character-local space even when the actor group is rotated 90 deg on stage
    const actorGroup = new THREE.Group();
    actorGroup.position.set(-20, 0, 0);
    actorGroup.lookAt(20, 0, 0); // Facing +X (Stage Right)
    actorGroup.add(rig.root);
    actorGroup.updateMatrixWorld(true);

    for (const presetId of Object.keys(POSE_PRESETS)) {
      applyPosePreset(rig, presetId);
      actorGroup.updateMatrixWorld(true);

      const lfWorld = new THREE.Vector3();
      const rfWorld = new THREE.Vector3();
      rig.bones.get('LeftFoot')!.getWorldPosition(lfWorld);
      rig.bones.get('RightFoot')!.getWorldPosition(rfWorld);
      const lfLocal = actorGroup.worldToLocal(lfWorld);
      const rfLocal = actorGroup.worldToLocal(rfWorld);

      // Left foot must stay on character's left (+X), Right foot on character's right (-X) — never crossed sideways
      expect(lfLocal.x, `Preset "${presetId}" LeftFoot local X`).toBeGreaterThan(0.1);
      expect(rfLocal.x, `Preset "${presetId}" RightFoot local X`).toBeLessThan(-0.1);
      expect(lfLocal.y, `Preset "${presetId}" LeftFoot local Y`).toBeLessThan(0.45);
      expect(rfLocal.y, `Preset "${presetId}" RightFoot local Y`).toBeLessThan(0.45);
    }
  });

  it('classifies non-human objects and provides object-aware stances and relational stage positions', () => {
    expect(detectObjectPoseCategory({ name: 'Character 1 (Stage Left)', kind: 'human' })).toBe('humanoid');
    expect(detectObjectPoseCategory({ name: 'Cyber Hound', kind: 'character', tokenPrompt: 'cybernetic hound dog' })).toBe('quadruped');
    expect(detectObjectPoseCategory({ name: 'Sports Car', kind: 'vehicle', tokenPrompt: 'red sports car' })).toBe('vehicle');
    expect(detectObjectPoseCategory({ name: 'Recon Drone', kind: 'prop', tokenPrompt: 'quadcopter drone' })).toBe('aerial');
    expect(detectObjectPoseCategory({ name: 'Excalibur Sword', kind: 'prop', tokenPrompt: 'medieval broadsword' })).toBe('weapon_prop');
    expect(detectObjectPoseCategory({ name: 'Wooden Chair', kind: 'prop', tokenPrompt: 'wooden dining chair' })).toBe('furniture_set');

    const vehPresets = getObjectPosePresetsForCategory('vehicle');
    expect(vehPresets.some((p) => p.id === 'veh-wheelie-launch')).toBe(true);
    expect(vehPresets.some((p) => p.id === 'veh-hero-left')).toBe(true);

    const char1: any = {
      id: 'char-1',
      name: 'Character 1',
      kind: 'human',
      trajectory: { startPosition: { x: 30, y: 50, z: 0 }, endPosition: { x: 30, y: 50, z: 0 }, movementType: 'linear', speed: 'medium' },
    };
    const sword: any = {
      id: 'prop-1',
      name: 'Ancient Sword',
      kind: 'prop',
      tokenPrompt: 'sword blade',
      trajectory: { startPosition: { x: 50, y: 50, z: 0 }, endPosition: { x: 50, y: 50, z: 0 }, movementType: 'linear', speed: 'medium' },
    };

    const placements = getObjectAwareStagePlacements(sword, [char1, sword], (a) => a.trajectory.startPosition);
    expect(placements.some((p) => p.id === 'rel:char-1:in-front')).toBe(true);
    expect(placements.some((p) => p.id === 'rel:char-1:on-top')).toBe(true);
    expect(placements.some((p) => p.id === 'obj:prop-tabletop')).toBe(true);
  });
});
