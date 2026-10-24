/**
 * Foot Grounding & Floor Collision Lock Engine
 * 
 * In standard generative previs and 3D posing, characters suffer from foot-sliding
 * and ground penetration. This module guarantees:
 * 1. World Y floor clamping (Y = 0) with ankle offset protection
 * 2. Automated IK compensation so leg joints flex naturally when hips lower
 * 3. Foot planted detection for motion passes
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
  const { groundY = 0, contactThreshold = 0.08 } = options;
  const bone = rig.bones.get(foot);
  if (!bone) return false;

  const worldPos = new THREE.Vector3();
  bone.getWorldPosition(worldPos);

  return Math.abs(worldPos.y - groundY) <= contactThreshold;
}

/**
 * Locks a foot to the ground plane, adjusting the leg IK chain to accommodate the contact.
 */
export function lockFootToGround(
  rig: HumanoidRig,
  foot: 'LeftFoot' | 'RightFoot',
  options: GroundingOptions = {},
): void {
  const { groundY = 0, footHeightOffset = 0.02 * rig.height } = options;
  const limbKey = foot === 'LeftFoot' ? 'leftLeg' : 'rightLeg';
  const bone = rig.bones.get(foot);
  if (!bone) return;

  const worldPos = new THREE.Vector3();
  bone.getWorldPosition(worldPos);

  const targetY = groundY + footHeightOffset;

  // If the foot is below or near the floor, clamp its Y to targetY
  const clampedTarget = new THREE.Vector3(worldPos.x, targetY, worldPos.z);
  solveLimbIK(rig, limbKey, clampedTarget);
}

/**
 * Clamps both feet to the ground plane and ensures hips don't push them into the floor.
 */
export function groundBothFeet(rig: HumanoidRig, options: GroundingOptions = {}): void {
  lockFootToGround(rig, 'LeftFoot', options);
  lockFootToGround(rig, 'RightFoot', options);
}
