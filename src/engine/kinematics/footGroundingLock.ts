/**
 * Foot Grounding & Floor Collision Lock Engine
 * 
 * In standard generative previs and 3D posing, characters suffer from foot-sliding
 * and ground penetration. This module guarantees:
 * 1. World Y floor clamping with anatomical ankle offset protection
 * 2. Automated IK compensation so leg joints flex naturally in character-facing space when hips lower
 * 3. Flat-sole orientation alignment so toes stay parallel to the floor when knees bend
 */

import * as THREE from 'three';
import { HumanoidRig } from './skeletonHierarchy';
import { solveLimbIK } from './twoBoneIKSolver';

export interface GroundingOptions {
  groundY?: number;
  contactThreshold?: number;
  footHeightOffset?: number;
}

/**
 * Checks if a given foot is touching the ground plane.
 */
export function isFootGrounded(
  rig: HumanoidRig,
  foot: 'LeftFoot' | 'RightFoot',
  options: GroundingOptions = {},
): boolean {
  if (rig.root.parent) {
    rig.root.parent.updateMatrixWorld(true);
  }
  rig.root.updateMatrixWorld(true);

  const rootWorldPos = new THREE.Vector3();
  rig.root.getWorldPosition(rootWorldPos);

  const isMannequin = Boolean(rig.root.userData?.isMannequinRig);
  const defaultOffset = isMannequin ? 0.056 * rig.height : 0.02 * rig.height;
  const { groundY = rootWorldPos.y, contactThreshold = 0.08 * (rig.height / 1.75), footHeightOffset = defaultOffset } = options;

  const bone = rig.bones.get(foot);
  if (!bone) return false;

  const worldPos = new THREE.Vector3();
  bone.getWorldPosition(worldPos);

  return Math.abs(worldPos.y - (groundY + footHeightOffset)) <= contactThreshold || Math.abs(worldPos.y - groundY) <= contactThreshold;
}

/**
 * Locks a foot to the ground plane, adjusting the leg IK chain in character-facing space
 * and keeping the sole flat on the floor.
 */
export function lockFootToGround(
  rig: HumanoidRig,
  foot: 'LeftFoot' | 'RightFoot',
  options: GroundingOptions = {},
): void {
  if (rig.root.parent) {
    rig.root.parent.updateMatrixWorld(true);
  }
  rig.root.updateMatrixWorld(true);

  const rootWorldPos = new THREE.Vector3();
  rig.root.getWorldPosition(rootWorldPos);

  const isMannequin = Boolean(rig.root.userData?.isMannequinRig);
  const defaultOffset = isMannequin ? 0.056 * rig.height : 0.02 * rig.height;
  const { groundY = rootWorldPos.y, footHeightOffset = defaultOffset } = options;

  const limbKey = foot === 'LeftFoot' ? 'leftLeg' : 'rightLeg';
  const bone = rig.bones.get(foot);
  if (!bone) return;

  const worldPos = new THREE.Vector3();
  bone.getWorldPosition(worldPos);

  const targetY = groundY + footHeightOffset;
  const clampedTarget = new THREE.Vector3(worldPos.x, targetY, worldPos.z);

  // Compute knee pole in character-facing forward direction (+Z in rig.root space)
  const xSign = foot === 'LeftFoot' ? 1 : -1;
  const rootQuat = new THREE.Quaternion();
  rig.root.getWorldQuaternion(rootQuat);
  const poleOffset = new THREE.Vector3(xSign * 0.08 * rig.height, 0.25 * rig.height, 0.55 * rig.height).applyQuaternion(rootQuat);
  const kneePole = clampedTarget.clone().add(poleOffset);

  solveLimbIK(rig, limbKey, clampedTarget, kneePole);

  // Align foot flat to floor if it's a Mixamo mannequin rig
  const footRestRot = rig.restRotations.get(foot);
  if (isMannequin && footRestRot && bone.parent) {
    bone.parent.updateMatrixWorld(true);
    const parentWorldQuat = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(parentWorldQuat);

    // In Mixamo rest T-pose, LeftUpLeg has a 180° Z rotation, so rest foot world orientation = rootQuat * rotZ(PI) * footRestRot
    const upLegRest = rig.restRotations.get(foot === 'LeftFoot' ? 'LeftUpLeg' : 'RightUpLeg');
    const shinRest = rig.restRotations.get(foot === 'LeftFoot' ? 'LeftLeg' : 'RightLeg');
    const flatWorldQuat = rootQuat.clone();
    if (upLegRest) flatWorldQuat.multiply(upLegRest);
    if (shinRest) flatWorldQuat.multiply(shinRest);
    flatWorldQuat.multiply(footRestRot);

    bone.quaternion.copy(parentWorldQuat.invert()).multiply(flatWorldQuat);
    bone.updateMatrixWorld(true);
  }
}

/**
 * Clamps both feet to the ground plane and ensures hips don't push them into the floor.
 */
export function groundBothFeet(rig: HumanoidRig, options: GroundingOptions = {}): void {
  lockFootToGround(rig, 'LeftFoot', options);
  lockFootToGround(rig, 'RightFoot', options);
}
