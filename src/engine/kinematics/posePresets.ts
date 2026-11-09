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
      if (rig.root.userData?.isAutoRiggedGlb) {
        const landmarks = rig.root.userData?.rigLandmarks;
        if (landmarks?.detectedStance === 't-pose') {
          const wX = Math.max(0.16, (rig.root.userData?.naturalWristX ?? 0.22) * 0.65);
          solveLimbIK(
            rig,
            'leftArm',
            rigPoint(rig, wX, 0.53, 0.02),
            rigPoint(rig, wX + 0.12, 0.63, -0.22),
          );
          solveLimbIK(
            rig,
            'rightArm',
            rigPoint(rig, -wX, 0.53, 0.02),
            rigPoint(rig, -(wX + 0.12), 0.63, -0.22),
          );
        }
        return;
      }
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
  if (rig.mixamoBones && rig.mixamoRestRotations) {
    for (const [shortName, bone] of rig.mixamoBones) {
      const restRot = rig.mixamoRestRotations.get(shortName);
      if (restRot) bone.quaternion.copy(restRot);
    }
  }
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
 * Detects whether an ActorPose was generated as relative delta rotations (from motionCompiler,
 * videoToMocapExtractor, or fbxMocapImporter) rather than raw Mixamo bind-space quaternions
 * exported from a Mixamo FBX rig (where LeftUpLeg bind rotation has a 180-deg flip with |w| < 0.35).
 */
export function isSyntheticCompilerPose(pose?: ActorPose | null): boolean {
  if (!pose || !pose.rotations) return false;
  if (pose.anatomicalIk) return false;
  const lf = pose.rotations.LeftFoot;
  const rf = pose.rotations.RightFoot;
  const isIdentity = (q?: [number, number, number, number]) =>
    !!q && Math.abs(q[0]) < 1e-4 && Math.abs(q[1]) < 1e-4 && Math.abs(q[2]) < 1e-4 && Math.abs(q[3] - 1) < 1e-4;
  if (isIdentity(lf) && isIdentity(rf)) return true;

  // Also detect relative delta poses where LeftUpLeg / RightUpLeg quaternion has w > 0.6
  // (on Mixamo Y-Bot bind pose, LeftUpLeg/RightUpLeg have a 180-deg roll so |w| < 0.25)
  const lul = pose.rotations.LeftUpLeg;
  const rul = pose.rotations.RightUpLeg;
  if (lul && rul && Math.abs(lul[3]) > 0.6 && Math.abs(rul[3]) > 0.6) {
    return true;
  }
  return false;
}

/**
 * Restores a serialized ActorPose onto a rig.
 * Supports:
 * 1. `pose.anatomicalIk` (`toyxyz_RGBMocap` `mixamo_rig.py` `constrain_hinges` + `anatomical_ik.py` `solve_legs` + `footmr.py` contact lock)
 * 2. Relative delta poses (`isSyntheticCompilerPose`) on Mixamo FBX rigs without flipping bind-pose limbs 180 deg
 * 3. Direct quaternion restoration from `exportBonePose`
 */
const _poseInvRootMat = new THREE.Matrix4();
const _poseTmpVec = new THREE.Vector3();
const _poseWRestInv = new THREE.Quaternion();
const _poseDeltaLocal = new THREE.Quaternion();
const _poseQChar = new THREE.Quaternion();

function computeLowestFootLocalYForPose(rig: HumanoidRig): number | null {
  rig.root.updateMatrixWorld(true);
  _poseInvRootMat.copy(rig.root.matrixWorld).invert();
  let minY = Infinity;
  const candidateBones: (THREE.Bone | undefined)[] = [
    rig.bones.get('LeftFoot'),
    rig.bones.get('RightFoot'),
    rig.mixamoBones?.get('LeftToeBase'),
    rig.mixamoBones?.get('RightToeBase'),
  ];
  for (const b of candidateBones) {
    if (!b) continue;
    b.updateMatrixWorld(true);
    _poseTmpVec.setFromMatrixPosition(b.matrixWorld).applyMatrix4(_poseInvRootMat);
    if (_poseTmpVec.y < minY) {
      minY = _poseTmpVec.y;
    }
  }
  return Number.isFinite(minY) ? minY : null;
}

/**
 * Restores a serialized ActorPose onto a rig.
 * Supports:
 * 0. `pose.charSpaceRotations` (SMPL-24 Axis-Angle -> Mixamo 22-bone Bind-Pose Conjugate Retargeting:
 *    `q_mixamo(B) = R_bind(B) * (W_bind(B)^-1 * q_char(B) * W_bind(B))` + Stance-Foot Sole Floor Pinning)
 * 1. `pose.anatomicalIk` (`toyxyz_RGBMocap` `mixamo_rig.py` `constrain_hinges` + `anatomical_ik.py` `solve_legs` + `footmr.py` contact lock)
 * 2. Relative delta poses (`isSyntheticCompilerPose`) on Mixamo FBX rigs without flipping bind-pose limbs 180 deg
 * 3. Direct quaternion restoration from `exportBonePose`
 */
export function applyBonePose(rig: HumanoidRig, pose: ActorPose): void {
  // 0. Full SMPL-24 -> Mixamo 22-Bone Bind-Pose Conjugate Retargeting (`pose.charSpaceRotations`)
  if (pose.charSpaceRotations && Object.keys(pose.charSpaceRotations).length > 0) {
    resetToRestPose(rig);
    const restLowestFootY = computeLowestFootLocalYForPose(rig);

    if (pose.hipsOffset) {
      setHipsOffset(rig, pose.hipsOffset[0], pose.hipsOffset[1], pose.hipsOffset[2]);
    }

    if (
      rig.mixamoBones &&
      rig.mixamoBones.size > 0 &&
      rig.mixamoRestRotations &&
      rig.mixamoCharSpaceRestRotations
    ) {
      for (const [boneName, quatTuple] of Object.entries(pose.charSpaceRotations)) {
        const bone = rig.mixamoBones.get(boneName);
        const rLocal = rig.mixamoRestRotations.get(boneName);
        const wRest = rig.mixamoCharSpaceRestRotations.get(boneName);
        if (!bone || !rLocal || !wRest || !quatTuple || quatTuple.length !== 4) continue;

        _poseQChar.set(quatTuple[0], quatTuple[1], quatTuple[2], quatTuple[3]).normalize();
        _poseWRestInv.copy(wRest).invert();
        _poseDeltaLocal.copy(_poseWRestInv).multiply(_poseQChar).multiply(wRest);
        bone.quaternion.copy(rLocal).multiply(_poseDeltaLocal);
      }
    } else {
      // 19-bone procedural humanoid rig path (where rest character-space basis W_bind = Identity)
      const canonicalMap: Record<HumanoidBone, string[]> = {
        Hips: ['Hips'],
        Spine: ['Spine'],
        Chest: ['Chest', 'Spine1', 'Spine2'],
        Neck: ['Neck'],
        Head: ['Head'],
        LeftShoulder: ['LeftShoulder'],
        LeftArm: ['LeftArm'],
        LeftForeArm: ['LeftForeArm'],
        LeftHand: ['LeftHand'],
        RightShoulder: ['RightShoulder'],
        RightArm: ['RightArm'],
        RightForeArm: ['RightForeArm'],
        RightHand: ['RightHand'],
        LeftUpLeg: ['LeftUpLeg'],
        LeftLeg: ['LeftLeg'],
        LeftFoot: ['LeftFoot'],
        RightUpLeg: ['RightUpLeg'],
        RightLeg: ['RightLeg'],
        RightFoot: ['RightFoot'],
      };
      const qAccum = new THREE.Quaternion();
      const qPart = new THREE.Quaternion();
      for (const [boneName, sourceKeys] of Object.entries(canonicalMap) as [HumanoidBone, string[]][]) {
        const bone = rig.bones.get(boneName);
        const restRot = rig.restRotations.get(boneName);
        if (!bone) continue;
        qAccum.set(0, 0, 0, 1);
        let found = false;
        for (const k of sourceKeys) {
          const qt = pose.charSpaceRotations[k];
          if (!qt || qt.length !== 4) continue;
          qPart.set(qt[0], qt[1], qt[2], qt[3]).normalize();
          qAccum.multiply(qPart);
          found = true;
        }
        if (!found) continue;
        if (restRot) {
          bone.quaternion.copy(restRot).multiply(qAccum);
        } else {
          bone.quaternion.copy(qAccum);
        }
      }
    }

    // Stance-Foot Sole Floor Pinning: keep the lowest supporting foot flush with the stage floor
    // with temporal low-pass damping so micro-rotations in ankles/knees never cause vertical pelvis jitter.
    const hipsBone = rig.bones.get('Hips');
    if (hipsBone && restLowestFootY !== null) {
      const posedLowestFootY = computeLowestFootLocalYForPose(rig);
      if (posedLowestFootY !== null) {
        const rawFootDeltaY = posedLowestFootY - restLowestFootY;
        const prevSmooth = rig.root.userData?.__smoothedFootPinDeltaY;
        const dampedFootDeltaY =
          typeof prevSmooth === 'number' && Number.isFinite(prevSmooth) && Math.abs(rawFootDeltaY - prevSmooth) < rig.height * 0.18
            ? prevSmooth * 0.78 + rawFootDeltaY * 0.22
            : rawFootDeltaY;
        if (rig.root.userData) {
          rig.root.userData.__smoothedFootPinDeltaY = dampedFootDeltaY;
        }
        hipsBone.position.y -= dampedFootDeltaY;
      }
    }

    rig.root.updateMatrixWorld(true);
    return;
  }

  // 1. `toyxyz_RGBMocap` Anatomical 2-Bone Hinge IK + FootMR Contact Lock (`pose.anatomicalIk`)
  if (pose.anatomicalIk) {
    const ik = pose.anatomicalIk;
    for (const [bName, bone] of rig.bones) {
      const rPos = rig.restPositions.get(bName);
      const rRot = rig.restRotations.get(bName);
      if (rPos) bone.position.copy(rPos);
      if (rRot) bone.quaternion.copy(rRot);
    }
    rig.root.updateMatrixWorld(true);

    const restoreFlatFeet = createFlatFootRestorer(rig);

    if (pose.hipsOffset) {
      setHipsOffset(rig, pose.hipsOffset[0], pose.hipsOffset[1], pose.hipsOffset[2]);
    }

    const axialBones: HumanoidBone[] = [
      'Hips',
      'Spine',
      'Chest',
      'Neck',
      'Head',
      'LeftShoulder',
      'RightShoulder',
    ];
    for (const boneName of axialBones) {
      const quatTuple = pose.rotations[boneName];
      const bone = rig.bones.get(boneName);
      const restRot = rig.restRotations.get(boneName);
      if (bone && quatTuple && quatTuple.length === 4) {
        const deltaQ = new THREE.Quaternion(quatTuple[0], quatTuple[1], quatTuple[2], quatTuple[3]);
        if (restRot) {
          bone.quaternion.copy(restRot).multiply(deltaQ);
        } else {
          bone.quaternion.copy(deltaQ);
        }
        bone.updateMatrixWorld(true);
      }
    }

    const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;
    const lAnk: [number, number, number] = [
      Math.max(0.04, Math.min(0.24, Math.abs(ik.leftAnkle[0]) || 0.058)),
      ankY + Math.max(0, ik.leftAnkle[1]),
      ik.leftAnkle[2],
    ];
    const rAnk: [number, number, number] = [
      -Math.max(0.04, Math.min(0.24, Math.abs(ik.rightAnkle[0]) || 0.058)),
      ankY + Math.max(0, ik.rightAnkle[1]),
      ik.rightAnkle[2],
    ];
    const lKneePole: [number, number, number] = [
      Math.max(0.04, Math.abs(ik.leftKneePole[0]) || 0.08),
      ik.leftKneePole[1],
      Math.max(0.22, ik.leftKneePole[2]),
    ];
    const rKneePole: [number, number, number] = [
      -Math.max(0.04, Math.abs(ik.rightKneePole[0]) || 0.08),
      ik.rightKneePole[1],
      Math.max(0.22, ik.rightKneePole[2]),
    ];

    // Solve 2-bone Law-of-Cosines hinge IK for both legs + FootMR flat-sole contact pitch
    poseLegsLocal(rig, lAnk, rAnk, restoreFlatFeet, {
      leftKneePole: lKneePole,
      rightKneePole: rKneePole,
      leftFootPitch: ik.leftFootPitch,
      rightFootPitch: ik.rightFootPitch,
    });

    const lHandX = THREE.MathUtils.clamp(Math.abs(ik.leftHand[0]) > 1e-4 ? ik.leftHand[0] : 0.145, -0.32, 0.45);
    const rHandX = THREE.MathUtils.clamp(Math.abs(ik.rightHand[0]) > 1e-4 ? ik.rightHand[0] : -0.145, -0.45, 0.32);
    const lElbowX = Math.max(0.14, Math.abs(ik.leftElbowPole[0]) || 0.28);
    const rElbowX = -Math.max(0.14, Math.abs(ik.rightElbowPole[0]) || 0.28);

    // Solve 2-bone Law-of-Cosines hinge IK for both arms
    solveLimbIK(
      rig,
      'leftArm',
      rigPoint(rig, lHandX, ik.leftHand[1], ik.leftHand[2]),
      rigPoint(rig, lElbowX, ik.leftElbowPole[1], ik.leftElbowPole[2])
    );
    solveLimbIK(
      rig,
      'rightArm',
      rigPoint(rig, rHandX, ik.rightHand[1], ik.rightHand[2]),
      rigPoint(rig, rElbowX, ik.rightElbowPole[1], ik.rightElbowPole[2])
    );

    if (ik.headLookAt) {
      solveLookAt(rig, rigPoint(rig, ik.headLookAt[0], ik.headLookAt[1], ik.headLookAt[2]));
    }

    rig.root.updateMatrixWorld(true);
    return;
  }

  // 2. Guard Mixamo FBX rigs against relative delta poses (which would invert 180-deg Mixamo thigh/arm bind rotations)
  if (rig.root.userData?.isMannequinRig && isSyntheticCompilerPose(pose)) {
    for (const [bName, bone] of rig.bones) {
      const rPos = rig.restPositions.get(bName);
      const rRot = rig.restRotations.get(bName);
      if (rPos) bone.position.copy(rPos);
      if (rRot) bone.quaternion.copy(rRot);
    }
    rig.root.updateMatrixWorld(true);

    const restoreFlatFeet = createFlatFootRestorer(rig);
    const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;

    if (pose.hipsOffset) {
      setHipsOffset(rig, pose.hipsOffset[0], pose.hipsOffset[1], pose.hipsOffset[2]);
    }

    const axialBones: HumanoidBone[] = ['Hips', 'Spine', 'Chest', 'Neck', 'Head'];
    for (const boneName of axialBones) {
      const quatTuple = pose.rotations[boneName];
      const bone = rig.bones.get(boneName);
      const restRot = rig.restRotations.get(boneName);
      if (bone && quatTuple && quatTuple.length === 4) {
        const deltaQ = new THREE.Quaternion(quatTuple[0], quatTuple[1], quatTuple[2], quatTuple[3]);
        if (restRot) {
          bone.quaternion.copy(restRot).multiply(deltaQ);
        } else {
          bone.quaternion.copy(deltaQ);
        }
        bone.updateMatrixWorld(true);
      }
    }

    const getEulerX = (bName: HumanoidBone): number => {
      const qt = pose.rotations[bName];
      if (!qt || qt.length !== 4) return 0;
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(qt[0], qt[1], qt[2], qt[3]), 'XYZ');
      return e.x;
    };

    const lThighPitch = getEulerX('LeftUpLeg');
    const rThighPitch = getEulerX('RightUpLeg');
    const lKneeFlex = Math.max(0, Math.abs(getEulerX('LeftLeg')));
    const rKneeFlex = Math.max(0, Math.abs(getEulerX('RightLeg')));
    const lFootPitch = getEulerX('LeftFoot');
    const rFootPitch = getEulerX('RightFoot');

    const lAnkZ = THREE.MathUtils.clamp(-lThighPitch * 0.42, -0.26, 0.28);
    const rAnkZ = THREE.MathUtils.clamp(-rThighPitch * 0.42, -0.26, 0.28);
    const lAnkY = ankY + THREE.MathUtils.clamp(lKneeFlex * 0.12, 0, 0.18);
    const rAnkY = ankY + THREE.MathUtils.clamp(rKneeFlex * 0.12, 0, 0.18);

    poseLegsLocal(rig, [0.058, lAnkY, lAnkZ], [-0.058, rAnkY, rAnkZ], restoreFlatFeet, {
      leftFootPitch: lFootPitch,
      rightFootPitch: rFootPitch,
    });

    const lArmPitch = getEulerX('LeftArm');
    const rArmPitch = getEulerX('RightArm');
    const lForePitch = Math.abs(getEulerX('LeftForeArm'));
    const rForePitch = Math.abs(getEulerX('RightForeArm'));

    solveLimbIK(
      rig,
      'leftArm',
      rigPoint(
        rig,
        0.145,
        THREE.MathUtils.clamp(0.515 + lForePitch * 0.12 - lArmPitch * 0.15, 0.38, 0.88),
        THREE.MathUtils.clamp(0.02 - lArmPitch * 0.28, -0.18, 0.28)
      ),
      rigPoint(rig, 0.28, 0.63, -0.22)
    );
    solveLimbIK(
      rig,
      'rightArm',
      rigPoint(
        rig,
        -0.145,
        THREE.MathUtils.clamp(0.515 + rForePitch * 0.12 - rArmPitch * 0.15, 0.38, 0.88),
        THREE.MathUtils.clamp(0.02 - rArmPitch * 0.28, -0.18, 0.28)
      ),
      rigPoint(rig, -0.28, 0.63, -0.22)
    );

    rig.root.updateMatrixWorld(true);
    return;
  }

  // 3. Direct full-quaternion restoration (from exportBonePose on the same rig topology)
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

  // Anatomical post-condition invariant for Mixamo / Humanoid rigs:
  // Feet must ALWAYS remain below Hips in character-local up (+Y) space.
  // If raw quaternion replacement inverted Mixamo's 180-deg bind-pose thighs,
  // re-solve using relative delta rotations + grounded 2-bone IK.
  const hipsCheck = rig.bones.get('Hips');
  const lFootCheck = rig.bones.get('LeftFoot');
  const rFootCheck = rig.bones.get('RightFoot');
  if (hipsCheck && (lFootCheck || rFootCheck)) {
    const invRoot = rig.root.matrixWorld.clone().invert();
    const hipsLocalY = new THREE.Vector3().setFromMatrixPosition(hipsCheck.matrixWorld).applyMatrix4(invRoot).y;
    const lFootLocalY = lFootCheck
      ? new THREE.Vector3().setFromMatrixPosition(lFootCheck.matrixWorld).applyMatrix4(invRoot).y
      : 0;
    const rFootLocalY = rFootCheck
      ? new THREE.Vector3().setFromMatrixPosition(rFootCheck.matrixWorld).applyMatrix4(invRoot).y
      : 0;
    if (lFootLocalY >= hipsLocalY || rFootLocalY >= hipsLocalY) {
      for (const [bName, bone] of rig.bones) {
        const rPos = rig.restPositions.get(bName);
        const rRot = rig.restRotations.get(bName);
        if (rPos) bone.position.copy(rPos);
        if (rRot) bone.quaternion.copy(rRot);
      }
      rig.root.updateMatrixWorld(true);
      const restoreFlatFeet = createFlatFootRestorer(rig);
      const ankY = rig.root.userData?.isMannequinRig ? 0.056 : 0.02;
      poseLegsLocal(rig, [0.058, ankY, 0], [-0.058, ankY, 0], restoreFlatFeet);
      solveLimbIK(rig, 'leftArm', rigPoint(rig, 0.145, 0.515, 0.02), rigPoint(rig, 0.28, 0.63, -0.22));
      solveLimbIK(rig, 'rightArm', rigPoint(rig, -0.145, 0.515, 0.02), rigPoint(rig, -0.28, 0.63, -0.22));
      rig.root.updateMatrixWorld(true);
    }
  }
}
