/**
 * Cinematic Directorial Pose Presets & Pose Serialization Engine
 * 
 * Provides:
 * 1. Curated cinematic poses for humanoid actors in character-local coordinates
 *    (so poses are 100% invariant to where the actor stands or which direction they face on stage)
 * 2. Anatomically grounded pole vectors, clavicle relaxation, and flat-sole foot alignment
 * 3. Serialization to and from ActorPose (for undo/redo and shot persistence)
 */

import * as THREE from 'three';
import { HumanoidRig } from './skeletonHierarchy';
import { solveLimbIK, solveLookAt } from './twoBoneIKSolver';
import { HumanoidBone } from '../procedural3D/sculptSpec';
import { ActorPose } from '../../types/shotspec';

export interface PosePreset {
  id: string;
  name: string;
  category: 'standing' | 'action' | 'movement' | 'social';
  description: string;
  apply: (rig: HumanoidRig) => void;
}

/**
 * Converts normalized character-local coordinates (nx, ny, nz) in multiples of `rig.height`
 * (where nx > 0 is Character Left, nx < 0 is Character Right, ny = 0 is floor, nz > 0 is Character Forward)
 * into a 3D world-space point.
 */
function rigPoint(rig: HumanoidRig, nx: number, ny: number, nz: number): THREE.Vector3 {
  if (rig.root.parent) {
    rig.root.parent.updateMatrixWorld(true);
  }
  rig.root.updateMatrixWorld(true);
  const invScale = 1.0 / (rig.root.scale.y || 1.0);
  const localPt = new THREE.Vector3(
    nx * rig.height * invScale,
    ny * rig.height * invScale,
    nz * rig.height * invScale,
  );
  return localPt.applyMatrix4(rig.root.matrixWorld);
}

/**
 * Applies an additive local Euler rotation (in radians) on top of a bone's canonical bind restRotation.
 */
function rotateBoneLocal(
  rig: HumanoidRig,
  boneName: HumanoidBone,
  pitchX: number,
  yawY: number,
  rollZ: number,
): void {
  const bone = rig.bones.get(boneName);
  if (!bone) return;
  const restRot = rig.restRotations.get(boneName);
  const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchX, yawY, rollZ, 'XYZ'));
  if (restRot) {
    bone.quaternion.copy(restRot).multiply(delta);
  } else {
    bone.quaternion.copy(delta);
  }
  bone.updateMatrixWorld(true);
}

/**
 * Shifts the Hips bone from its canonical rest position by normalized fractions of `rig.height`.
 */
function setHipsOffset(rig: HumanoidRig, dxNorm: number, dyNorm: number, dzNorm: number): void {
  const hips = rig.bones.get('Hips');
  const restPos = rig.restPositions.get('Hips');
  if (!hips || !restPos) return;
  const invScale = 1.0 / (rig.root.scale.y || 1.0);
  hips.position.set(
    restPos.x + dxNorm * rig.height * invScale,
    restPos.y + dyNorm * rig.height * invScale,
    restPos.z + dzNorm * rig.height * invScale,
  );
  rig.root.updateMatrixWorld(true);
}

/**
 * Captures the rest flat-on-floor world orientations of LeftFoot and RightFoot right after resetToRestPose,
 * and returns a callback to restore flat sole contact after solving leg IK.
 */
function createFlatFootRestorer(rig: HumanoidRig): (leftPitchRad?: number, rightPitchRad?: number) => void {
  const leftFoot = rig.bones.get('LeftFoot');
  const rightFoot = rig.bones.get('RightFoot');
  const leftFlatWorld = new THREE.Quaternion();
  const rightFlatWorld = new THREE.Quaternion();
  if (leftFoot) leftFoot.getWorldQuaternion(leftFlatWorld);
  if (rightFoot) rightFoot.getWorldQuaternion(rightFlatWorld);

  return (leftPitchRad = 0, rightPitchRad = 0) => {
    if (leftFoot && leftFoot.parent) {
      leftFoot.parent.updateMatrixWorld(true);
      const parentQuat = new THREE.Quaternion();
      leftFoot.parent.getWorldQuaternion(parentQuat);
      const targetWorld = leftFlatWorld.clone();
      if (Math.abs(leftPitchRad) > 1e-4) {
        targetWorld.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(leftPitchRad, 0, 0)));
      }
      leftFoot.quaternion.copy(parentQuat.invert()).multiply(targetWorld);
      leftFoot.updateMatrixWorld(true);
    }
    if (rightFoot && rightFoot.parent) {
      rightFoot.parent.updateMatrixWorld(true);
      const parentQuat = new THREE.Quaternion();
      rightFoot.parent.getWorldQuaternion(parentQuat);
      const targetWorld = rightFlatWorld.clone();
      if (Math.abs(rightPitchRad) > 1e-4) {
        targetWorld.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rightPitchRad, 0, 0)));
      }
      rightFoot.quaternion.copy(parentQuat.invert()).multiply(targetWorld);
      rightFoot.updateMatrixWorld(true);
    }
  };
}

/**
 * Solves both legs to character-local normalized ankle coordinates with forward-pointing knees
 * and flat-sole floor alignment.
 */
function poseLegsLocal(
  rig: HumanoidRig,
  leftAnkle: [number, number, number],
  rightAnkle: [number, number, number],
  restoreFlatFeet: (lp?: number, rp?: number) => void,
  options?: {
    leftKneePole?: [number, number, number];
    rightKneePole?: [number, number, number];
    leftFootPitch?: number;
    rightFootPitch?: number;
  },
): void {
  const lPole = options?.leftKneePole || [leftAnkle[0] + 0.03, 0.30, leftAnkle[2] + 0.55];
  const rPole = options?.rightKneePole || [rightAnkle[0] - 0.03, 0.30, rightAnkle[2] + 0.55];

  solveLimbIK(
    rig,
    'leftLeg',
    rigPoint(rig, leftAnkle[0], leftAnkle[1], leftAnkle[2]),
    rigPoint(rig, lPole[0], lPole[1], lPole[2]),
  );
  solveLimbIK(
    rig,
    'rightLeg',
    rigPoint(rig, rightAnkle[0], rightAnkle[1], rightAnkle[2]),
    rigPoint(rig, rPole[0], rPole[1], rPole[2]),
  );
  restoreFlatFeet(options?.leftFootPitch ?? 0, options?.rightFootPitch ?? 0);
}

export const POSE_PRESETS: Record<string, PosePreset> = {
  'neutral-stand': {
    id: 'neutral-stand',
    name: 'Neutral Stand',
    category: 'standing',
    description: 'Relaxed natural stance with arms resting gently along sides.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      // Natural relaxed arms hanging beside upper thighs with soft outward/back elbow bend
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.145, 0.515, 0.02),
        rigPoint(rig, 0.28, 0.63, -0.22),
      );
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.145, 0.515, 0.02),
        rigPoint(rig, -0.28, 0.63, -0.22),
      );

      poseLegsLocal(rig, [0.055, ankY, -0.01], [-0.055, ankY, -0.01], restoreFlatFeet);
    },
  },

  'aim-pistol': {
    id: 'aim-pistol',
    name: 'Aim Pistol',
    category: 'action',
    description: 'Two-handed tactical firearm aim, arms extended forward, torso bladed.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      // Slight athletic drop & bladed spine
      setHipsOffset(rig, 0, -0.02, 0);
      rotateBoneLocal(rig, 'Spine', 0.04, -0.14, 0);
      rotateBoneLocal(rig, 'Chest', 0.03, -0.08, 0);

      // Braced tactical foot stance
      poseLegsLocal(rig, [0.068, ankY, 0.07], [-0.068, ankY, -0.07], restoreFlatFeet);

      // Both hands meeting in front of chest/chin along line of sight
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.015, 0.77, 0.24),
        rigPoint(rig, -0.22, 0.66, -0.05),
      );
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.015, 0.76, 0.22),
        rigPoint(rig, 0.22, 0.65, -0.05),
      );

      solveLookAt(rig, rigPoint(rig, 0, 0.86, 2.5));
    },
  },

  'crouch-cover': {
    id: 'crouch-cover',
    name: 'Crouch & Cover',
    category: 'action',
    description: 'Defensive crouch behind low obstacle with knees bent forward.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      // Lower pelvis by 18% of height and lean torso forward
      setHipsOffset(rig, 0, -0.18, -0.02);
      rotateBoneLocal(rig, 'Spine', 0.22, 0, 0);
      rotateBoneLocal(rig, 'Chest', 0.12, 0, 0);

      // Staggered wide crouch footing
      poseLegsLocal(rig, [0.075, ankY, 0.06], [-0.075, ankY, -0.05], restoreFlatFeet, {
        leftKneePole: [0.10, 0.30, 0.55],
        rightKneePole: [-0.10, 0.28, 0.45],
      });

      // Guarding forearms held in front of torso
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.10, 0.55, 0.16),
        rigPoint(rig, 0.25, 0.48, -0.12),
      );
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.10, 0.55, 0.16),
        rigPoint(rig, -0.25, 0.48, -0.12),
      );

      solveLookAt(rig, rigPoint(rig, 0, 0.72, 2.5));
    },
  },

  'stride-mid': {
    id: 'stride-mid',
    name: 'Mid-Stride Walk',
    category: 'movement',
    description: 'Dynamic walking stride freeze with counter-balanced limbs.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      setHipsOffset(rig, 0, -0.015, 0);
      rotateBoneLocal(rig, 'Spine', 0.04, -0.08, 0);

      // Left leg forward heel-strike, Right leg trailing toe-off
      poseLegsLocal(rig, [0.055, ankY, 0.15], [-0.055, ankY + 0.015, -0.15], restoreFlatFeet, {
        leftFootPitch: -0.12,
        rightFootPitch: 0.22,
      });

      // Opposing arm swing: right arm forward, left arm back
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.14, 0.56, 0.13),
        rigPoint(rig, -0.26, 0.64, -0.18),
      );
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.15, 0.54, -0.11),
        rigPoint(rig, 0.26, 0.64, -0.28),
      );

      solveLookAt(rig, rigPoint(rig, 0, 0.88, 2.5));
    },
  },

  'dialogue-gesturing': {
    id: 'dialogue-gesturing',
    name: 'Dialogue & Gesticulation',
    category: 'social',
    description: 'Conversational stance with one hand elevated expressively.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      rotateBoneLocal(rig, 'Spine', 0, 0.05, 0);

      // Right hand raised in expressive conversational gesture
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.12, 0.68, 0.16),
        rigPoint(rig, -0.25, 0.58, -0.12),
      );

      // Left hand relaxed near hip/side
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.145, 0.52, 0.04),
        rigPoint(rig, 0.27, 0.63, -0.18),
      );

      // Subtle natural head tilt
      rotateBoneLocal(rig, 'Head', -0.03, 0.06, -0.06);

      poseLegsLocal(rig, [0.058, ankY, 0.02], [-0.058, ankY, -0.02], restoreFlatFeet);
    },
  },

  'sitting-chair': {
    id: 'sitting-chair',
    name: 'Sitting Chair',
    category: 'standing',
    description: 'Seated posture with 90° thigh flexion and vertical calves.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      // Lower hips by 26% of height to standard chair seat height
      setHipsOffset(rig, 0, -0.26, -0.03);
      rotateBoneLocal(rig, 'Spine', 0.05, 0, 0);

      // Feet planted forward on floor under knees
      poseLegsLocal(rig, [0.068, ankY, 0.18], [-0.068, ankY, 0.18], restoreFlatFeet, {
        leftKneePole: [0.08, 0.36, 0.55],
        rightKneePole: [-0.08, 0.36, 0.55],
      });

      // Hands resting naturally on lap / thighs
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.095, 0.36, 0.11),
        rigPoint(rig, 0.25, 0.46, -0.14),
      );
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.095, 0.36, 0.11),
        rigPoint(rig, -0.25, 0.46, -0.14),
      );
    },
  },

  'aim-bow': {
    id: 'aim-bow',
    name: 'Aim Bow & Arrow',
    category: 'action',
    description: 'Archer drawing recurve bow: left arm extended forward holding bow, right hand pulled to cheek.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      setHipsOffset(rig, 0, -0.02, 0);
      rotateBoneLocal(rig, 'Spine', 0.02, -0.28, 0);
      rotateBoneLocal(rig, 'Chest', 0.02, -0.12, 0);

      // Braced archer foot placement
      poseLegsLocal(rig, [0.075, ankY, 0.08], [-0.075, ankY, -0.06], restoreFlatFeet);

      // Left arm extended forward gripping bow riser
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.03, 0.78, 0.25),
        rigPoint(rig, 0.22, 0.72, -0.02),
      );

      // Right hand anchored near jawline drawing bowstring with high back elbow
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.08, 0.79, 0.03),
        rigPoint(rig, -0.28, 0.80, -0.24),
      );

      solveLookAt(rig, rigPoint(rig, 0.02, 0.85, 2.5));
    },
  },

  'combat-ready': {
    id: 'combat-ready',
    name: 'Combat Guard',
    category: 'action',
    description: 'Martial arts combat guard with elbows tucked and fists raised protectively.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      setHipsOffset(rig, 0, -0.045, 0);
      rotateBoneLocal(rig, 'Spine', 0.07, -0.18, 0);

      // Staggered fighting stance
      poseLegsLocal(rig, [0.07, ankY, 0.09], [-0.07, ankY, -0.09], restoreFlatFeet);

      // Left lead hand forward, Right rear hand guarding chin
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.06, 0.75, 0.19),
        rigPoint(rig, 0.22, 0.58, -0.06),
      );
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.07, 0.77, 0.11),
        rigPoint(rig, -0.22, 0.58, -0.10),
      );

      solveLookAt(rig, rigPoint(rig, 0, 0.84, 2.5));
    },
  },

  'dramatic-lunge': {
    id: 'dramatic-lunge',
    name: 'Dramatic Lunge',
    category: 'action',
    description: 'Deep dynamic forward lunge with lead knee bent and trailing leg extended.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      setHipsOffset(rig, 0, -0.15, 0.02);
      rotateBoneLocal(rig, 'Spine', 0.20, -0.10, 0);

      // Left leg lunging deep forward, Right leg stretched back
      poseLegsLocal(rig, [0.068, ankY, 0.20], [-0.068, ankY + 0.01, -0.20], restoreFlatFeet, {
        leftKneePole: [0.09, 0.34, 0.60],
        rightKneePole: [-0.08, 0.26, 0.30],
        rightFootPitch: 0.25,
      });

      // Right arm thrusting forward, Left arm sweeping back for counterbalance
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.07, 0.72, 0.24),
        rigPoint(rig, -0.24, 0.62, -0.05),
      );
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.16, 0.58, -0.16),
        rigPoint(rig, 0.28, 0.66, -0.32),
      );

      solveLookAt(rig, rigPoint(rig, 0, 0.78, 2.5));
    },
  },

  'hero-kneel': {
    id: 'hero-kneel',
    name: 'Hero Kneel',
    category: 'action',
    description: 'Ground-touching heroic superhero landing or reverence kneel.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      setHipsOffset(rig, 0, -0.22, 0);
      rotateBoneLocal(rig, 'Spine', 0.28, 0.06, 0);
      rotateBoneLocal(rig, 'Chest', 0.12, 0, 0);

      // Left foot planted forward, Right knee lowered toward floor
      poseLegsLocal(rig, [0.075, ankY, 0.16], [-0.065, ankY + 0.02, -0.14], restoreFlatFeet, {
        leftKneePole: [0.10, 0.35, 0.55],
        rightKneePole: [-0.08, 0.08, 0.25],
        rightFootPitch: 0.45,
      });

      // Right hand reaching down toward floor, Left arm braced back at side
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.06, 0.36, 0.15),
        rigPoint(rig, -0.22, 0.50, -0.05),
      );
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.16, 0.48, -0.06),
        rigPoint(rig, 0.28, 0.58, -0.22),
      );

      solveLookAt(rig, rigPoint(rig, 0, 0.68, 2.5));
    },
  },

  'defensive-block': {
    id: 'defensive-block',
    name: 'Defensive Shield Block',
    category: 'action',
    description: 'Forearms raised together in high guard shielding face and chest.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

      setHipsOffset(rig, 0, -0.03, -0.01);
      rotateBoneLocal(rig, 'Spine', 0.06, 0, 0);

      poseLegsLocal(rig, [0.068, ankY, 0.05], [-0.068, ankY, -0.05], restoreFlatFeet);

      // Both forearms raised in protective high guard in front of upper chest/face
      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(rig, 0.04, 0.80, 0.16),
        rigPoint(rig, 0.22, 0.62, 0.04),
      );
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(rig, -0.04, 0.77, 0.18),
        rigPoint(rig, -0.22, 0.60, 0.04),
      );

      solveLookAt(rig, rigPoint(rig, 0, 0.84, 2.5));
    },
  },

  't-pose': {
    id: 't-pose',
    name: 'Rest T-Pose',
    category: 'standing',
    description: 'Calibration reference T-pose with arms extended horizontally.',
    apply: (rig: HumanoidRig) => {
      resetToRestPose(rig);
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
  if (rig.root.parent) {
    rig.root.parent.updateMatrixWorld(true);
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
 * Detects whether an ActorPose was generated by motionCompiler's synthetic identity quaternions
 * (where Hips & LeftFoot are [0,0,0,1]) rather than exported from an FBX Mixamo rig.
 */
export function isSyntheticCompilerPose(pose?: ActorPose | null): boolean {
  if (!pose || !pose.rotations) return false;
  const lf = pose.rotations.LeftFoot;
  const rf = pose.rotations.RightFoot;
  const isIdentity = (q?: [number, number, number, number]) =>
    !!q && Math.abs(q[0]) < 1e-4 && Math.abs(q[1]) < 1e-4 && Math.abs(q[2]) < 1e-4 && Math.abs(q[3] - 1) < 1e-4;
  return isIdentity(lf) && isIdentity(rf);
}

/**
 * Restores a serialized ActorPose onto a rig.
 */
export function applyBonePose(rig: HumanoidRig, pose: ActorPose): void {
  // Guard Mixamo FBX rigs against synthetic [0,0,0,1] compiler poses (which would invert 180-deg Mixamo thigh bind rotations)
  if (rig.root.userData?.isMannequinRig && isSyntheticCompilerPose(pose)) {
    if (pose.hipsOffset && pose.hipsOffset[1] < -0.2) {
      applyPosePreset(rig, 'sitting-chair');
    } else {
      applyPosePreset(rig, 'neutral-stand');
    }
    return;
  }

  // Always reset Hips position to restPos first so switching from a crouched/seated pose back to standing restores full height
  const hipsBone = rig.bones.get('Hips');
  const restPos = rig.restPositions.get('Hips');
  if (hipsBone && restPos) {
    if (pose.hipsOffset) {
      hipsBone.position.set(
        restPos.x + pose.hipsOffset[0],
        restPos.y + pose.hipsOffset[1],
        restPos.z + pose.hipsOffset[2],
      );
    } else {
      hipsBone.position.copy(restPos);
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
