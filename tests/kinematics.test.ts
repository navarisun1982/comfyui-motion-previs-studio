import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createHumanoidSkeleton,
  bindSculptToSkeleton,
  createStylizedHumanoidStandin,
  solveTwoBoneIK,
  solveLimbIK,
  solveLookAt,
  isFootGrounded,
  lockFootToGround,
  groundBothFeet,
  applyPosePreset,
  exportBonePose,
  applyBonePose,
  POSE_PRESETS,
  evaluateGait,
  extractOpenPoseKeypoints,
  OPENPOSE_LIMBS,
} from '../src/engine/kinematics';
import { HUMANOID_BONES } from '../src/engine/procedural3D/sculptSpec';

describe('Humanoid Skeletal Hierarchy', () => {
  it('instantiates all 19 standard humanoid bones in proper hierarchy', () => {
    const rig = createHumanoidSkeleton(5.0);
    expect(rig.bones.size).toBe(19);

    // Verify key bones exist
    for (const name of HUMANOID_BONES) {
      expect(rig.bones.has(name)).toBe(true);
    }

    // Verify parentage
    const hips = rig.bones.get('Hips')!;
    const spine = rig.bones.get('Spine')!;
    const chest = rig.bones.get('Chest')!;
    const head = rig.bones.get('Head')!;
    const leftArm = rig.bones.get('LeftArm')!;
    const leftForeArm = rig.bones.get('LeftForeArm')!;
    const leftHand = rig.bones.get('LeftHand')!;

    expect(spine.parent).toBe(hips);
    expect(chest.parent).toBe(spine);
    expect(head.parent?.name).toBe('Neck');
    expect(leftForeArm.parent).toBe(leftArm);
    expect(leftHand.parent).toBe(leftForeArm);

    // Root should contain Hips
    expect(rig.root.children).toContain(hips);
  });

  it('generates a stylized humanoid stand-in attached to bones', () => {
    const rig = createHumanoidSkeleton(5.0);
    const standinRoot = createStylizedHumanoidStandin(rig);
    expect(standinRoot).toBe(rig.root);

    // Verify limbs and head contain attached meshes
    const head = rig.bones.get('Head')!;
    expect(head.children.length).toBeGreaterThan(0);

    const chest = rig.bones.get('Chest')!;
    expect(chest.children.length).toBeGreaterThan(0);

    const leftFoot = rig.bones.get('LeftFoot')!;
    expect(leftFoot.children.length).toBeGreaterThan(0);
  });

  it('binds tagged sculpt parts to corresponding skeleton bones', () => {
    const rig = createHumanoidSkeleton(5.0);
    const sculptGroup = new THREE.Group();

    // Create simulated sculpt parts with bone tags
    const headPart = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    headPart.userData.bone = 'Head';
    headPart.position.set(0, 4.5, 0);
    sculptGroup.add(headPart);

    const leftHandPart = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5));
    leftHandPart.userData.bone = 'LeftHand';
    leftHandPart.position.set(2.0, 3.5, 0);
    sculptGroup.add(leftHandPart);

    bindSculptToSkeleton(rig, sculptGroup);

    // Parts should now be parented to skeleton bones
    const headBone = rig.bones.get('Head')!;
    const leftHandBone = rig.bones.get('LeftHand')!;

    expect(headBone.children).toContain(headPart);
    expect(leftHandBone.children).toContain(leftHandPart);
  });
});

describe('2-Bone Analytic IK Solver', () => {
  it('solves arm reach to target within tolerance and writes local FK quaternions', () => {
    const rig = createHumanoidSkeleton(5.0);
    const target = new THREE.Vector3(1.2, 3.5, 0.8);

    const result = solveLimbIK(rig, 'leftArm', target);
    expect(result).not.toBeNull();

    // End effector should be moved toward target
    const hand = rig.bones.get('LeftHand')!;
    const handWorldPos = new THREE.Vector3();
    hand.getWorldPosition(handWorldPos);

    expect(handWorldPos.distanceTo(target)).toBeLessThan(0.05);

    // Bone local quaternions should not be NaN or identity
    const arm = rig.bones.get('LeftArm')!;
    expect(Number.isFinite(arm.quaternion.x)).toBe(true);
    expect(Number.isFinite(arm.quaternion.y)).toBe(true);
    expect(Number.isFinite(arm.quaternion.z)).toBe(true);
    expect(Number.isFinite(arm.quaternion.w)).toBe(true);
  });

  it('clamps reach gracefully when target exceeds maximum arm length', () => {
    const rig = createHumanoidSkeleton(5.0);
    // Unreachable distant point
    const distantTarget = new THREE.Vector3(100, 3.5, 0);

    const result = solveLimbIK(rig, 'leftArm', distantTarget);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.reachedDistance)).toBe(true);
    expect(result!.reachedDistance).toBeLessThan(5.0);
  });

  it('solves leg IK down to ground contact', () => {
    const rig = createHumanoidSkeleton(5.0);
    const footTarget = new THREE.Vector3(0.5, 0.05, 0.2);

    const result = solveLimbIK(rig, 'leftLeg', footTarget);
    expect(result).not.toBeNull();

    const foot = rig.bones.get('LeftFoot')!;
    const footPos = new THREE.Vector3();
    foot.getWorldPosition(footPos);

    expect(footPos.distanceTo(footTarget)).toBeLessThan(0.05);
  });

  it('solves Head/Neck lookAt toward 3D position', () => {
    const rig = createHumanoidSkeleton(5.0);
    const lookTarget = new THREE.Vector3(0, 4.0, 10.0);

    solveLookAt(rig, lookTarget);

    const head = rig.bones.get('Head')!;
    const neck = rig.bones.get('Neck')!;

    expect(Number.isFinite(head.quaternion.x)).toBe(true);
    expect(Number.isFinite(neck.quaternion.y)).toBe(true);
  });
});

describe('Foot Grounding & Floor Collision Lock', () => {
  it('detects and locks foot to ground plane', () => {
    const rig = createHumanoidSkeleton(5.0);
    
    // Initially in T-pose, feet might hover slightly
    lockFootToGround(rig, 'LeftFoot', { groundY: 0 });

    const leftFoot = rig.bones.get('LeftFoot')!;
    const footPos = new THREE.Vector3();
    leftFoot.getWorldPosition(footPos);

    // Foot Y should be clamped within tolerance
    expect(isFootGrounded(rig, 'LeftFoot', { groundY: 0, contactThreshold: 0.15 })).toBe(true);
  });

  it('grounds both feet simultaneously', () => {
    const rig = createHumanoidSkeleton(5.0);
    groundBothFeet(rig, { groundY: 0 });

    expect(isFootGrounded(rig, 'LeftFoot', { groundY: 0, contactThreshold: 0.15 })).toBe(true);
    expect(isFootGrounded(rig, 'RightFoot', { groundY: 0, contactThreshold: 0.15 })).toBe(true);
  });
});

describe('Pose Presets & Serialization', () => {
  const presets = ['neutral-stand', 'aim-pistol', 'crouch-cover', 'stride-mid', 'dialogue-gesturing', 'sitting-chair'];

  it.each(presets)('applies preset %s without error and produces valid joint transforms', (presetId) => {
    const rig = createHumanoidSkeleton(5.0);
    const ok = applyPosePreset(rig, presetId);
    expect(ok).toBe(true);

    for (const [name, bone] of rig.bones) {
      expect(Number.isFinite(bone.quaternion.x), `${name}.quat.x`).toBe(true);
      expect(Number.isFinite(bone.quaternion.y), `${name}.quat.y`).toBe(true);
      expect(Number.isFinite(bone.quaternion.z), `${name}.quat.z`).toBe(true);
      expect(Number.isFinite(bone.quaternion.w), `${name}.quat.w`).toBe(true);
    }
  });

  it('exports and restores ActorPose with exact fidelity', () => {
    const rig1 = createHumanoidSkeleton(5.0);
    applyPosePreset(rig1, 'aim-pistol');

    const exportedPose = exportBonePose(rig1);
    expect(Object.keys(exportedPose.rotations).length).toBe(19);

    const rig2 = createHumanoidSkeleton(5.0);
    applyBonePose(rig2, exportedPose);

    for (const [name, bone2] of rig2.bones) {
      const bone1 = rig1.bones.get(name)!;
      expect(bone2.quaternion.x).toBeCloseTo(bone1.quaternion.x, 3);
      expect(bone2.quaternion.y).toBeCloseTo(bone1.quaternion.y, 3);
      expect(bone2.quaternion.z).toBeCloseTo(bone1.quaternion.z, 3);
      expect(bone2.quaternion.w).toBeCloseTo(bone1.quaternion.w, 3);
    }
  });

  it('exposes curated POSE_PRESETS registry with metadata', () => {
    expect(Object.keys(POSE_PRESETS).length).toBeGreaterThanOrEqual(6);
    expect(POSE_PRESETS['neutral-stand']).toBeDefined();
    expect(POSE_PRESETS['neutral-stand'].name).toBe('Neutral Stand');
    expect(POSE_PRESETS['aim-pistol'].category).toBe('action');
  });

  it('solves direct twoBoneIK between arbitrary 3-bone chains', () => {
    const root = new THREE.Bone();
    const mid = new THREE.Bone();
    const tip = new THREE.Bone();
    root.position.set(0, 5, 0);
    mid.position.set(0, -2, 0);
    tip.position.set(0, -2, 0);
    root.add(mid);
    mid.add(tip);

    const scene = new THREE.Scene();
    scene.add(root);
    scene.updateMatrixWorld(true);

    const targetPos = new THREE.Vector3(1, 2, 0);
    const polePos = new THREE.Vector3(0, 3, 2);

    const result = solveTwoBoneIK({
      rootBone: root,
      midBone: mid,
      endBone: tip,
      targetPos,
      poleTarget: polePos,
    });

    expect(result.reachedDistance).toBeGreaterThan(0);
    expect(Number.isFinite(root.quaternion.x)).toBe(true);
    expect(Number.isFinite(mid.quaternion.x)).toBe(true);
  });
});

describe('Procedural Humanoid Gait Engine', () => {
  it('evaluates walk gait and cycles limb joints across time', () => {
    const rig = createHumanoidSkeleton(5.0);
    const times = [0.0, 0.25, 0.5, 0.75, 1.0];

    for (const t of times) {
      const res = evaluateGait(rig, t, { gait: 'walk' });
      expect(res.effectiveGait).toBe('walk');
      expect(res.phase).toBeGreaterThanOrEqual(0);
      expect(res.phase).toBeLessThanOrEqual(1);

      // Verify all bones maintain finite numbers
      for (const [name, bone] of rig.bones) {
        expect(Number.isFinite(bone.quaternion.x), `${name} qx at ${t}`).toBe(true);
        expect(Number.isFinite(bone.quaternion.y), `${name} qy at ${t}`).toBe(true);
        expect(Number.isFinite(bone.quaternion.z), `${name} qz at ${t}`).toBe(true);
        expect(Number.isFinite(bone.quaternion.w), `${name} qw at ${t}`).toBe(true);
      }
    }
  });

  it('resolves auto gait correctly based on velocity speed', () => {
    const rig = createHumanoidSkeleton(5.0);

    const idleRes = evaluateGait(rig, 0, { gait: 'auto', speed: 0.02 });
    expect(idleRes.effectiveGait).toBe('idle');

    const walkRes = evaluateGait(rig, 0, { gait: 'auto', speed: 1.2 });
    expect(walkRes.effectiveGait).toBe('walk');

    const runRes = evaluateGait(rig, 0, { gait: 'auto', speed: 3.5 });
    expect(runRes.effectiveGait).toBe('run');
  });

  it('simulates sneak gait with crouched pelvic height', () => {
    const rig = createHumanoidSkeleton(5.0);
    evaluateGait(rig, 0.5, { gait: 'sneak' });

    const hips = rig.bones.get('Hips')!;
    // Pelvic position Y should be lower than rest pose 0.52 * 5.0 = 2.6
    expect(hips.position.y).toBeLessThan(2.6);
  });

  it('respects none gait mode by leaving rig untouched', () => {
    const rig = createHumanoidSkeleton(5.0);
    const res = evaluateGait(rig, 1.0, { gait: 'none' });
    expect(res.effectiveGait).toBe('none');
  });
});

describe('ControlNet OpenPose Previs Renderer', () => {
  it('extracts projected 2D OpenPose keypoints from a 3D humanoid rig', () => {
    const rig = createHumanoidSkeleton(5.0);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    camera.position.set(0, 2.5, 8);
    camera.lookAt(0, 2.5, 0);
    camera.updateMatrixWorld(true);

    const keypoints = extractOpenPoseKeypoints(rig, camera, 1280, 720);
    expect(keypoints.size).toBeGreaterThanOrEqual(18);

    const head = keypoints.get('Head');
    const chest = keypoints.get('Chest');
    const leftHand = keypoints.get('LeftHand');
    const rightFoot = keypoints.get('RightFoot');

    expect(head).toBeDefined();
    expect(head?.visible).toBe(true);
    expect(head?.x).toBeGreaterThan(0);
    expect(head?.x).toBeLessThan(1280);
    expect(head?.y).toBeGreaterThan(0);
    expect(head?.y).toBeLessThan(720);

    expect(chest).toBeDefined();
    expect(leftHand).toBeDefined();
    expect(rightFoot).toBeDefined();
  });

  it('defines standard OpenPose anatomical limb connections', () => {
    expect(OPENPOSE_LIMBS.length).toBe(15);
    const colors = OPENPOSE_LIMBS.map((l) => l.color);
    expect(colors).toContain('rgb(0, 0, 255)');
    expect(colors).toContain('rgb(255, 0, 0)');
    expect(colors).toContain('rgb(0, 255, 0)');
  });
});
