/**
 * Cinematic Directorial Pose Presets & Pose Serialization Engine
 * 
 * Provides:
 * 1. Curated cinematic poses for actors (aim-pistol, crouch-cover, stride, sit, dialogue)
 * 2. Instant solver & FK rotation mapping
 * 3. Serialization to and from ActorPose (for undo/redo and shot persistence)
 */

import * as THREE from 'three';
import { HumanoidRig } from './skeletonHierarchy';
import { solveLimbIK, solveLookAt } from './twoBoneIKSolver';
import { groundBothFeet } from './footGroundingLock';
import { HumanoidBone } from '../procedural3D/sculptSpec';
import { ActorPose } from '../../types/shotspec';

export interface PosePreset {
  id: string;
  name: string;
  category: 'standing' | 'action' | 'movement' | 'social';
  description: string;
  apply: (rig: HumanoidRig) => void;
}

export const POSE_PRESETS: Record<string, PosePreset> = {
  'neutral-stand': {
    id: 'neutral-stand',
    name: 'Neutral Stand',
    category: 'standing',
    description: 'Relaxed natural stance with arms resting gently at sides.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const h = rig.height;
      const hipsPos = new THREE.Vector3();
      rig.bones.get('Hips')?.getWorldPosition(hipsPos);

      // Relax arms downward
      solveLimbIK(
        rig,
        'leftArm',
        new THREE.Vector3(hipsPos.x + 0.16 * h, hipsPos.y + 0.05 * h, hipsPos.z),
        new THREE.Vector3(hipsPos.x + 0.25 * h, hipsPos.y + 0.2 * h, hipsPos.z - 0.2 * h),
      );
      solveLimbIK(
        rig,
        'rightArm',
        new THREE.Vector3(hipsPos.x - 0.16 * h, hipsPos.y + 0.05 * h, hipsPos.z),
        new THREE.Vector3(hipsPos.x - 0.25 * h, hipsPos.y + 0.2 * h, hipsPos.z - 0.2 * h),
      );
      groundBothFeet(rig);
    },
  },

  'aim-pistol': {
    id: 'aim-pistol',
    name: 'Aim Pistol',
    category: 'action',
    description: 'Two-handed tactical firearm aim, right arm extended, torso bladed.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const h = rig.height;
      const chestPos = new THREE.Vector3();
      rig.bones.get('Chest')?.getWorldPosition(chestPos);

      // Rotate spine slightly for bladed stance
      const spine = rig.bones.get('Spine');
      if (spine) spine.rotation.y = -0.15;

      // Extend both hands forward toward aim point
      const aimTarget = new THREE.Vector3(chestPos.x - 0.02 * h, chestPos.y + 0.04 * h, chestPos.z + 0.38 * h);
      solveLimbIK(rig, 'rightArm', aimTarget);
      solveLimbIK(rig, 'leftArm', aimTarget.clone().add(new THREE.Vector3(0.04 * h, -0.02 * h, -0.02 * h)));

      // Legs in braced tactical stance
      const leftFoot = rig.bones.get('LeftFoot');
      const rightFoot = rig.bones.get('RightFoot');
      if (leftFoot && rightFoot) {
        const lp = new THREE.Vector3();
        leftFoot.getWorldPosition(lp);
        solveLimbIK(rig, 'leftLeg', lp.clone().add(new THREE.Vector3(0, 0, 0.1 * h)));
        const rp = new THREE.Vector3();
        rightFoot.getWorldPosition(rp);
        solveLimbIK(rig, 'rightLeg', rp.clone().add(new THREE.Vector3(0, 0, -0.1 * h)));
      }

      solveLookAt(rig, aimTarget.clone().add(new THREE.Vector3(0, 0, 5.0)));
      groundBothFeet(rig);
    },
  },

  'crouch-cover': {
    id: 'crouch-cover',
    name: 'Crouch & Cover',
    category: 'action',
    description: 'Defensive crouch behind low obstacle with knees bent forward.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const h = rig.height;
      const hips = rig.bones.get('Hips');
      if (hips) {
        // Lower hips by 38%
        hips.position.y -= 0.18 * h;
      }
      const spine = rig.bones.get('Spine');
      if (spine) {
        spine.rotation.x = 0.25; // Lean forward
      }

      const hipsPos = new THREE.Vector3();
      hips?.getWorldPosition(hipsPos);

      // Guarding arms
      solveLimbIK(
        rig,
        'leftArm',
        new THREE.Vector3(hipsPos.x + 0.1 * h, hipsPos.y + 0.15 * h, hipsPos.z + 0.2 * h),
      );
      solveLimbIK(
        rig,
        'rightArm',
        new THREE.Vector3(hipsPos.x - 0.1 * h, hipsPos.y + 0.15 * h, hipsPos.z + 0.2 * h),
      );

      groundBothFeet(rig);
    },
  },

  'stride-mid': {
    id: 'stride-mid',
    name: 'Mid-Stride Walk',
    category: 'movement',
    description: 'Dynamic walking stride freeze with counter-balanced limbs.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const h = rig.height;
      const hipsPos = new THREE.Vector3();
      rig.bones.get('Hips')?.getWorldPosition(hipsPos);

      // Left leg extended forward, Right leg trailing backward
      solveLimbIK(
        rig,
        'leftLeg',
        new THREE.Vector3(hipsPos.x + 0.08 * h, 0, hipsPos.z + 0.18 * h),
      );
      solveLimbIK(
        rig,
        'rightLeg',
        new THREE.Vector3(hipsPos.x - 0.08 * h, 0.04 * h, hipsPos.z - 0.2 * h),
      );

      // Opposing arm swing: right arm forward, left arm back
      solveLimbIK(
        rig,
        'rightArm',
        new THREE.Vector3(hipsPos.x - 0.15 * h, hipsPos.y + 0.1 * h, hipsPos.z + 0.15 * h),
      );
      solveLimbIK(
        rig,
        'leftArm',
        new THREE.Vector3(hipsPos.x + 0.15 * h, hipsPos.y + 0.08 * h, hipsPos.z - 0.15 * h),
      );

      solveLookAt(rig, hipsPos.clone().add(new THREE.Vector3(0, 0.2 * h, 5.0)));
    },
  },

  'dialogue-gesturing': {
    id: 'dialogue-gesturing',
    name: 'Dialogue & Gesticulation',
    category: 'social',
    description: 'Conversational stance with one hand elevated expressively.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const h = rig.height;
      const chestPos = new THREE.Vector3();
      rig.bones.get('Chest')?.getWorldPosition(chestPos);

      // Right hand raised in dialogue gesture
      solveLimbIK(
        rig,
        'rightArm',
        new THREE.Vector3(chestPos.x - 0.12 * h, chestPos.y + 0.02 * h, chestPos.z + 0.22 * h),
      );

      // Left arm resting casually at hip
      solveLimbIK(
        rig,
        'leftArm',
        new THREE.Vector3(chestPos.x + 0.15 * h, chestPos.y - 0.18 * h, chestPos.z + 0.02 * h),
      );

      // Head tilted slightly
      const head = rig.bones.get('Head');
      if (head) {
        head.rotation.z = -0.08;
      }
      groundBothFeet(rig);
    },
  },

  'sitting-chair': {
    id: 'sitting-chair',
    name: 'Sitting Chair',
    category: 'standing',
    description: 'Seated posture with 90° thigh flexion and vertical calves.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const h = rig.height;
      const hips = rig.bones.get('Hips');
      if (hips) {
        // Lower hips to standard seat height (~0.45m scaled to rig)
        hips.position.y = 0.26 * h;
      }

      const hipsPos = new THREE.Vector3();
      hips?.getWorldPosition(hipsPos);

      // Feet placed on floor forward of seat
      solveLimbIK(
        rig,
        'leftLeg',
        new THREE.Vector3(hipsPos.x + 0.09 * h, 0, hipsPos.z + 0.22 * h),
      );
      solveLimbIK(
        rig,
        'rightLeg',
        new THREE.Vector3(hipsPos.x - 0.09 * h, 0, hipsPos.z + 0.22 * h),
      );

      // Hands resting on thighs
      solveLimbIK(
        rig,
        'leftArm',
        new THREE.Vector3(hipsPos.x + 0.1 * h, hipsPos.y + 0.08 * h, hipsPos.z + 0.16 * h),
      );
      solveLimbIK(
        rig,
        'rightArm',
        new THREE.Vector3(hipsPos.x - 0.1 * h, hipsPos.y + 0.08 * h, hipsPos.z + 0.16 * h),
      );
      groundBothFeet(rig);
    },
  },

  't-pose': {
    id: 't-pose',
    name: 'Rest T-Pose',
    category: 'standing',
    description: 'Calibration reference T-pose with arms extended horizontally.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      groundBothFeet(rig);
    },
  },
};

/**
 * Resets all bones on the rig back to their rest positions and rotations.
 */
export function resetToRestPose(rig: HumanoidRig): void {
  for (const [boneName, bone] of rig.bones) {
    const restPos = rig.restPositions.get(boneName);
    const restRot = rig.restRotations.get(boneName);
    if (restPos) bone.position.copy(restPos);
    if (restRot) bone.quaternion.copy(restRot);
  }
  rig.root.updateMatrixWorld(true);
}

/**
 * Applies a named pose preset to the rig.
 */
export function applyPosePreset(rig: HumanoidRig, presetId: string): boolean {
  const preset = POSE_PRESETS[presetId];
  if (!preset) return false;
  preset.apply(rig);
  rig.root.updateMatrixWorld(true);
  return true;
}

/**
 * Serializes the current bone rotations and hips position of a rig into an ActorPose.
 */
export function exportBonePose(rig: HumanoidRig): ActorPose {
  const rotations: Record<string, [number, number, number, number]> = {};
  for (const [boneName, bone] of rig.bones) {
    rotations[boneName] = [
      bone.quaternion.x,
      bone.quaternion.y,
      bone.quaternion.z,
      bone.quaternion.w,
    ];
  }

  const hipsBone = rig.bones.get('Hips');
  let hipsOffset: [number, number, number] | undefined;
  if (hipsBone) {
    const restPos = rig.restPositions.get('Hips');
    if (restPos) {
      const diff = hipsBone.position.clone().sub(restPos);
      if (diff.lengthSq() > 1e-4) {
        hipsOffset = [diff.x, diff.y, diff.z];
      }
    }
  }

  return {
    hipsOffset,
    rotations,
  };
}

/**
 * Restores a serialized ActorPose onto a rig.
 */
export function applyBonePose(rig: HumanoidRig, pose: ActorPose): void {
  if (pose.hipsOffset) {
    const hipsBone = rig.bones.get('Hips');
    const restPos = rig.restPositions.get('Hips');
    if (hipsBone && restPos) {
      hipsBone.position.set(
        restPos.x + pose.hipsOffset[0],
        restPos.y + pose.hipsOffset[1],
        restPos.z + pose.hipsOffset[2],
      );
    }
  }

  for (const [boneName, quatTuple] of Object.entries(pose.rotations)) {
    const bone = rig.bones.get(boneName as HumanoidBone);
    if (bone && quatTuple && quatTuple.length === 4) {
      bone.quaternion.set(quatTuple[0], quatTuple[1], quatTuple[2], quatTuple[3]);
    }
  }

  rig.root.updateMatrixWorld(true);
}
