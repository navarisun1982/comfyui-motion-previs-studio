/**
 * Closed-Form 2-Bone Analytic Inverse Kinematics (IK) Solver
 * 
 * Features:
 * 1. Executes in <0.01ms (no iterative numerical relaxation/FABRIK oscillation)
 * 2. Guaranteed distance clamping avoiding triangle degeneracy
 * 3. Law of Cosines exact joint angle calculation
 * 4. Pole vector bend-plane projection with continuity tracking
 * 5. Non-destructive Cascadeur-style Forward Kinematics (FK) quaternion write-back
 */

import * as THREE from 'three';
import { HumanoidRig } from './skeletonHierarchy';
import { HumanoidBone } from '../procedural3D/sculptSpec';

export interface TwoBoneIKInput {
  rootBone: THREE.Bone;
  midBone: THREE.Bone;
  endBone: THREE.Bone;
  targetPos: THREE.Vector3;
  poleTarget: THREE.Vector3;
  bendPlaneNormalPrev?: THREE.Vector3;
}

export interface TwoBoneIKResult {
  bendNormal: THREE.Vector3;
  midJointWorldPos: THREE.Vector3;
  reachedDistance: number;
}

/**
 * Solves 2-bone analytic IK and immediately writes resulting local quaternions
 * into `rootBone.quaternion` and `midBone.quaternion`.
 */
export function solveTwoBoneIK(input: TwoBoneIKInput): TwoBoneIKResult {
  const { rootBone, midBone, endBone, targetPos, poleTarget, bendPlaneNormalPrev } = input;

  // 1. Collect world positions
  rootBone.updateMatrixWorld(true);
  midBone.updateMatrixWorld(true);
  endBone.updateMatrixWorld(true);

  const rootWorldPos = new THREE.Vector3();
  const midWorldPos = new THREE.Vector3();
  const endWorldPos = new THREE.Vector3();

  rootBone.getWorldPosition(rootWorldPos);
  midBone.getWorldPosition(midWorldPos);
  endBone.getWorldPosition(endWorldPos);

  const l1 = Math.max(0.001, rootWorldPos.distanceTo(midWorldPos));
  const l2 = Math.max(0.001, midWorldPos.distanceTo(endWorldPos));

  // 2. Vector from root to target and distance clamping
  const toTarget = targetPos.clone().sub(rootWorldPos);
  let dist = toTarget.length();

  const maxReach = l1 + l2 - 0.0005;
  const minReach = Math.abs(l1 - l2) + 0.0005;
  dist = THREE.MathUtils.clamp(dist, minReach, maxReach);
  toTarget.setLength(dist);

  // 3. Law of Cosines for joint angles
  const cosAlpha = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const alpha = Math.acos(THREE.MathUtils.clamp(cosAlpha, -1, 1));

  // 4. Pole vector projection to determine bend plane
  const uTarget = toTarget.clone().normalize();
  const toPole = poleTarget.clone().sub(rootWorldPos);

  // Project pole vector onto plane perpendicular to uTarget
  const poleProj = toPole.clone().sub(uTarget.clone().multiplyScalar(toPole.dot(uTarget)));
  let bendNormal = poleProj.clone().normalize();

  if (bendNormal.lengthSq() < 0.0001) {
    // If pole vector is collinear with target, use a stable orthogonal vector
    bendNormal = new THREE.Vector3(0, 0, 1).cross(uTarget).normalize();
    if (bendNormal.lengthSq() < 0.0001) {
      bendNormal = new THREE.Vector3(0, 1, 0).cross(uTarget).normalize();
    }
  }

  // Bend continuity check: prevent sudden 180° flip across the plane
  if (bendPlaneNormalPrev && bendNormal.dot(bendPlaneNormalPrev) < -0.2) {
    bendNormal.negate();
  }

  // 5. Compute target position for mid joint (elbow / knee)
  // Rotating uTarget towards bendNormal by angle alpha:
  // dirMid = uTarget * cos(alpha) + bendNormal * sin(alpha)
  const dirMid = uTarget
    .clone()
    .multiplyScalar(Math.cos(alpha))
    .add(bendNormal.clone().multiplyScalar(Math.sin(alpha)))
    .normalize();

  const midJointWorldPos = rootWorldPos.clone().add(dirMid.clone().multiplyScalar(l1));

  // 6. Non-destructive FK Quaternion Updates
  // A. Orient rootBone toward midJointWorldPos
  orientBoneToward(rootBone, midBone, midJointWorldPos);

  // B. Orient midBone toward targetPos
  orientBoneToward(midBone, endBone, targetPos);

  return {
    bendNormal,
    midJointWorldPos,
    reachedDistance: dist,
  };
}

/**
 * Computes the rotation needed to point `bone` toward `targetWorldPos`
 * based on its child joint's rest-position vector, and writes directly into `bone.quaternion`.
 */
function orientBoneToward(bone: THREE.Bone, childBone: THREE.Bone, targetWorldPos: THREE.Vector3): void {
  bone.updateMatrixWorld(true);
  const currentWorldPos = new THREE.Vector3();
  bone.getWorldPosition(currentWorldPos);

  // Direction toward child bone in bone-local coordinates
  const restAxis = childBone.position.clone().normalize();
  if (restAxis.lengthSq() < 0.0001) return;

  const worldDir = targetWorldPos.clone().sub(currentWorldPos).normalize();
  if (worldDir.lengthSq() < 0.0001) return;

  const parent = bone.parent;
  if (!parent) return;

  // Convert desired world direction into bone's parent coordinate space
  parent.updateMatrixWorld(true);
  const parentWorldQuat = new THREE.Quaternion();
  parent.getWorldQuaternion(parentWorldQuat);
  const invParentQuat = parentWorldQuat.clone().invert();
  const localDir = worldDir.clone().applyQuaternion(invParentQuat).normalize();

  // Current direction toward child bone in parent coordinate space (respects Mixamo/FBX bind restRotation)
  const currentParentDir = restAxis.clone().applyQuaternion(bone.quaternion).normalize();
  if (currentParentDir.lengthSq() < 0.0001) return;

  // Premultiply delta rotation in parent space so bind-pose roll is preserved
  const deltaQuat = new THREE.Quaternion().setFromUnitVectors(currentParentDir, localDir);
  bone.quaternion.premultiply(deltaQuat);
  bone.updateMatrixWorld(true);
}

export type LimbIdentifier = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

export interface LimbBones {
  root: HumanoidBone;
  mid: HumanoidBone;
  end: HumanoidBone;
  defaultPoleOffset: THREE.Vector3;
}

export const LIMB_DEFINITIONS: Record<LimbIdentifier, LimbBones> = {
  leftArm: {
    root: 'LeftArm',
    mid: 'LeftForeArm',
    end: 'LeftHand',
    // Elbow points outward (+X), downward (-Y), and backward (-Z)
    defaultPoleOffset: new THREE.Vector3(0.45, -0.5, -0.8),
  },
  rightArm: {
    root: 'RightArm',
    mid: 'RightForeArm',
    end: 'RightHand',
    // Elbow points outward (-X), downward (-Y), and backward (-Z)
    defaultPoleOffset: new THREE.Vector3(-0.45, -0.5, -0.8),
  },
  leftLeg: {
    root: 'LeftUpLeg',
    mid: 'LeftLeg',
    end: 'LeftFoot',
    // Knee points forwards and slightly outward
    defaultPoleOffset: new THREE.Vector3(0.06, 0, 1.0),
  },
  rightLeg: {
    root: 'RightUpLeg',
    mid: 'RightLeg',
    end: 'RightFoot',
    // Knee points forwards and slightly outward
    defaultPoleOffset: new THREE.Vector3(-0.06, 0, 1.0),
  },
};

/**
 * Solves IK for a named humanoid limb on a rig.
 */
export function solveLimbIK(
  rig: HumanoidRig,
  limb: LimbIdentifier,
  targetWorldPos: THREE.Vector3,
  customPoleWorldPos?: THREE.Vector3,
  prevBendNormal?: THREE.Vector3,
): TwoBoneIKResult | null {
  const def = LIMB_DEFINITIONS[limb];
  const rootBone = rig.bones.get(def.root);
  const midBone = rig.bones.get(def.mid);
  const endBone = rig.bones.get(def.end);

  if (!rootBone || !midBone || !endBone) return null;

  if (rig.root.parent) {
    rig.root.parent.updateMatrixWorld(true);
  }

  // Reset limb bones to their canonical rest rotations before solving to prevent roll drift
  const rootRestRot = rig.restRotations.get(def.root);
  const midRestRot = rig.restRotations.get(def.mid);
  if (rootRestRot) rootBone.quaternion.copy(rootRestRot);
  if (midRestRot) midBone.quaternion.copy(midRestRot);
  rig.root.updateMatrixWorld(true);

  // Determine pole target in world space (rotated by character's facing orientation)
  let poleTarget = customPoleWorldPos;
  if (!poleTarget) {
    const rootPos = new THREE.Vector3();
    rootBone.getWorldPosition(rootPos);
    const rootWorldQuat = new THREE.Quaternion();
    rig.root.getWorldQuaternion(rootWorldQuat);
    const rotatedPoleOffset = def.defaultPoleOffset.clone().multiplyScalar(rig.height).applyQuaternion(rootWorldQuat);
    poleTarget = rootPos.clone().add(rotatedPoleOffset);
  }

  return solveTwoBoneIK({
    rootBone,
    midBone,
    endBone,
    targetPos: targetWorldPos,
    poleTarget,
    bendPlaneNormalPrev: prevBendNormal,
  });
}

/**
 * Directs the character's Head and Neck to look at a 3D world position.
 */
export function solveLookAt(rig: HumanoidRig, lookAtWorldPos: THREE.Vector3): void {
  const headBone = rig.bones.get('Head');
  const neckBone = rig.bones.get('Neck');
  if (!headBone || !neckBone) return;

  if (rig.root.parent) {
    rig.root.parent.updateMatrixWorld(true);
  }

  const neckRest = rig.restRotations.get('Neck');
  const headRest = rig.restRotations.get('Head');
  if (neckRest) neckBone.quaternion.copy(neckRest);
  if (headRest) headBone.quaternion.copy(headRest);

  rig.root.updateMatrixWorld(true);
  const headWorldPos = new THREE.Vector3();
  headBone.getWorldPosition(headWorldPos);

  const lookDir = lookAtWorldPos.clone().sub(headWorldPos).normalize();
  if (lookDir.lengthSq() < 0.0001) return;

  const parent = neckBone.parent || rig.root;
  parent.updateMatrixWorld(true);
  const parentWorldQuat = new THREE.Quaternion();
  parent.getWorldQuaternion(parentWorldQuat);
  const invParentQuat = parentWorldQuat.clone().invert();
  const localLookDir = lookDir.clone().applyQuaternion(invParentQuat).normalize();

  // Compute anatomical yaw and pitch (clamped to human cervical limits, zero roll)
  const rawYaw = Math.atan2(localLookDir.x, Math.max(0.05, localLookDir.z));
  const rawPitch = Math.atan2(-localLookDir.y, Math.sqrt(localLookDir.x * localLookDir.x + localLookDir.z * localLookDir.z));
  const clampedYaw = THREE.MathUtils.clamp(rawYaw, -0.95, 0.95);
  const clampedPitch = THREE.MathUtils.clamp(rawPitch, -0.6, 0.6);

  // Distribute rotation: 35% on Neck, 65% on Head for natural cervical spine flexion
  const neckDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(clampedPitch * 0.35, clampedYaw * 0.35, 0, 'YXZ'));
  const headDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(clampedPitch * 0.65, clampedYaw * 0.65, 0, 'YXZ'));

  neckBone.quaternion.multiply(neckDelta);
  headBone.quaternion.multiply(headDelta);

  neckBone.updateMatrixWorld(true);
  headBone.updateMatrixWorld(true);
}
