/**
 * Unified Mixamo-SMPL Humanoid Motion Solver (`unifiedRigSolver.ts`)
 *
 * Single canonical runtime authority for evaluating and applying ANY humanoid motion
 * onto a 19-bone Mixamo / HumanoidRig (`public/models/y-bot-tpose.fbx` or auto-rigged GLB).
 *
 * Design Invariants:
 * 1. Exclusive Single-Solver Execution:
 *    Exactly ONE motion source is evaluated per frame according to a deterministic hierarchy:
 *      (a) Manual FK/IK Gizmo Drag (`manual-gizmo`)
 *      (b) Baked Mocap / Pose Keyframe Track (`mocap-pose-track` — NLF 3D SMPL, MediaPipe, FBX, or keyframed pose)
 *      (c) Ready-Made Motion Clip / Universal IK Program (`motion-clip`)
 *      (d) Static Acting Pose Preset (`pose-preset`)
 *      (e) Procedural Biomechanical Gait (`procedural-gait`)
 *    Two solvers NEVER run on the same rig in the same frame.
 *
 * 2. Canonical Mixamo Character-Local Coordinate Contract:
 *    - `+X`: Character Left (`LeftUpLeg`, `LeftAnkle`, `LeftHand` > 0)
 *    - `-X`: Character Right (`RightUpLeg`, `RightAnkle`, `RightHand` < 0)
 *    - `+Y`: Character Up (`0.0` = Floor sole, `0.056` = Mixamo Y-Bot ankle joint, `0.53` = Hips, `1.0` = Top of Head)
 *    - `+Z`: Character Forward (facing direction)
 *
 * 3. Anatomical Post-Condition Guard:
 *    After any solver runs, `LeftFoot` and `RightFoot` character-local Y coordinates are verified to be
 *    strictly below `Hips` character-local Y, and `LeftFoot.x >= RightFoot.x` (no 180-deg Mixamo bind-pose inversion
 *    or crossed legs).
 */

import * as THREE from 'three';
import { Actor, ActorPose } from '../../types/shotspec';
import { HumanoidRig } from './skeletonHierarchy';
import { HumanoidBone } from '../procedural3D/sculptSpec';
import { applyBonePose, applyPosePreset, isSyntheticCompilerPose, POSE_PRESETS, resetToRestPose } from './posePresets';
import { evaluateGait, GaitType } from './gaitEngine';
import { evaluateReadyMadeHumanoidClip } from './readyMadeMotions';
import { interpolateActorPoseAtTime, interpolateTrajectoryPosition } from '../trajectoryMath';

export type ActiveMotionSourceKind =
  | 'manual-gizmo'
  | 'mocap-pose-track'
  | 'motion-clip'
  | 'pose-preset'
  | 'procedural-gait'
  | 'rest-pose';

export interface UnifiedHumanoidFrameDiagnosis {
  sourceUsed: ActiveMotionSourceKind;
  hipsLocalY: number;
  leftFootLocalY: number;
  rightFootLocalY: number;
  leftFootLocalX: number;
  rightFootLocalX: number;
  wasInversionHealed: boolean;
}

export interface EvaluateUnifiedHumanoidOptions {
  rig: HumanoidRig;
  actor: Actor;
  timeSeconds: number;
  shotDurationSeconds: number;
  isActivelyPosing?: boolean;
  isAutoRiggedGlb?: boolean;
  hasNativeGlbAnimation?: boolean;
  claymationFps?: number;
}

/**
 * Inspects a posed `HumanoidRig` in character-local space (`rig.root` inverse world matrix)
 * and verifies that:
 * 1. Both feet are strictly below the pelvis (`footLocalY < hipsLocalY`).
 * 2. Left/Right ankles are not inverted across the midline (`leftFootLocalX > rightFootLocalX - 0.05`).
 */
export function verifyMixamoAnatomicalInvariants(rig: HumanoidRig): {
  hipsLocalY: number;
  leftFootLocalY: number;
  rightFootLocalY: number;
  leftFootLocalX: number;
  rightFootLocalX: number;
  isValid: boolean;
} {
  rig.root.updateMatrixWorld(true);
  const invRoot = rig.root.matrixWorld.clone().invert();
  const toLocal = (boneName: HumanoidBone): THREE.Vector3 | null => {
    const b = rig.bones.get(boneName);
    if (!b) return null;
    b.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(invRoot);
  };

  const hips = toLocal('Hips');
  const lFoot = toLocal('LeftFoot');
  const rFoot = toLocal('RightFoot');

  const hipsLocalY = hips ? hips.y : 0.53 * rig.height;
  const leftFootLocalY = lFoot ? lFoot.y : 0.056 * rig.height;
  const rightFootLocalY = rFoot ? rFoot.y : 0.056 * rig.height;
  const leftFootLocalX = lFoot ? lFoot.x : 0.08 * rig.height;
  const rightFootLocalX = rFoot ? rFoot.x : -0.08 * rig.height;

  const feetBelowHips = leftFootLocalY < hipsLocalY - 0.05 * rig.height && rightFootLocalY < hipsLocalY - 0.05 * rig.height;
  const notInverted = feetBelowHips && !Number.isNaN(leftFootLocalY) && !Number.isNaN(rightFootLocalY);

  return {
    hipsLocalY,
    leftFootLocalY,
    rightFootLocalY,
    leftFootLocalX,
    rightFootLocalX,
    isValid: notInverted,
  };
}

/**
 * Evaluates and applies the single authoritative motion source for a humanoid actor at `timeSeconds`.
 * Guarantees zero solver conflicts and enforces Mixamo anatomical invariants.
 */
export function evaluateUnifiedHumanoidFrame(
  options: EvaluateUnifiedHumanoidOptions
): UnifiedHumanoidFrameDiagnosis {
  const {
    rig,
    actor,
    timeSeconds: t,
    shotDurationSeconds: liveDur,
    isActivelyPosing = false,
    isAutoRiggedGlb = false,
    hasNativeGlbAnimation = false,
    claymationFps,
  } = options;

  if (isActivelyPosing) {
    const check = verifyMixamoAnatomicalInvariants(rig);
    return {
      sourceUsed: 'manual-gizmo',
      hipsLocalY: check.hipsLocalY,
      leftFootLocalY: check.leftFootLocalY,
      rightFootLocalY: check.rightFootLocalY,
      leftFootLocalX: check.leftFootLocalX,
      rightFootLocalX: check.rightFootLocalX,
      wasInversionHealed: false,
    };
  }

  const clayOpt = claymationFps ? { claymationFps } : undefined;
  const currentPoseResult = interpolateActorPoseAtTime(actor.trajectory, actor.pose, t, liveDur, clayOpt);
  const activeMotionClip = currentPoseResult?.motionClip || actor.motionClip;

  // Compute instantaneous floor speed for travel-aware clips and auto-gait
  const dtSample = 0.08;
  const pBefore = interpolateTrajectoryPosition(actor.trajectory, Math.max(0, t - dtSample), liveDur);
  const pAfter = interpolateTrajectoryPosition(actor.trajectory, Math.min(liveDur, t + dtSample), liveDur);
  const segSpan = Math.max(0.04, Math.min(liveDur, t + dtSample) - Math.max(0, t - dtSample));
  const instDist = Math.hypot(pAfter.x - pBefore.x, pAfter.y - pBefore.y);
  const instUnitsPerSec = instDist / segSpan;

  const start = actor.trajectory.startPosition;
  const end = actor.trajectory.endPosition;
  const totalDist = Math.hypot(end.x - start.x, end.y - start.y);
  const kfs = actor.trajectory.keyframes || [];
  const activeSpanDur =
    kfs.length >= 2
      ? Math.max(0.4, kfs[kfs.length - 1].time - kfs[0].time)
      : Math.max(0.4, liveDur);
  const steadyPathSpeed = totalDist > 1.0 ? totalDist / activeSpanDur : instUnitsPerSec;
  const isMovingNow =
    instUnitsPerSec > 0.35 ||
    (totalDist > 1.0 && kfs.length === 0);
  const effectiveFloorSpeed = isMovingNow ? (steadyPathSpeed > 0.5 ? steadyPathSpeed : instUnitsPerSec) : 0;

  let sourceUsed: ActiveMotionSourceKind = 'rest-pose';

  // Priority 1: Ready-Made Motion Clip / Universal IK Program (when explicitly assigned)
  let handledByClip = false;
  if (activeMotionClip) {
    handledByClip = evaluateReadyMadeHumanoidClip(
      rig,
      activeMotionClip,
      t,
      currentPoseResult?.clipProgress ?? (liveDur > 0 ? Math.max(0, Math.min(1, t / liveDur)) : 0),
      isMovingNow,
      currentPoseResult?.motionCycles ?? actor.motionCycles ?? 1,
      effectiveFloorSpeed
    );
    if (handledByClip) {
      sourceUsed = 'motion-clip';
    }
  }

  // Priority 2: Baked Mocap / Pose Keyframe Track (`currentPoseResult.pose`)
  // When a character has a Mocap track or custom keyframed pose, it is EXCLUSIVE (never overwritten by evaluateGait!)
  if (!handledByClip && currentPoseResult?.pose) {
    applyBonePose(rig, currentPoseResult.pose);
    sourceUsed = 'mocap-pose-track';
  }

  // Priority 3: Static Acting Pose Preset or Procedural Gait (ONLY when neither Clip nor Mocap Pose Track is active)
  if (sourceUsed === 'rest-pose') {
    const activeCueGait = currentPoseResult?.gait;
    const reqGait: GaitType | undefined =
      activeCueGait && activeCueGait !== 'auto' ? activeCueGait : actor.gait;
    const activePreset = currentPoseResult?.posePreset || actor.posePreset;

    const hasCustomPose =
      (!!actor.pose && !isSyntheticCompilerPose(actor.pose)) ||
      (!!activePreset &&
        activePreset !== 't-pose' &&
        activePreset !== 'neutral-stand' &&
        activePreset !== 'stride-mid');

    const shouldEvaluateGait =
      reqGait !== 'none' &&
      (reqGait === 'walk' || reqGait === 'run' || reqGait === 'sneak'
        ? true
        : reqGait === 'idle'
          ? !hasCustomPose
          : !reqGait || reqGait === 'auto'
            ? isMovingNow && !hasCustomPose
            : false);

    if (shouldEvaluateGait) {
      const rawStageSpeed = isMovingNow
        ? steadyPathSpeed > 0.5
          ? steadyPathSpeed
          : instUnitsPerSec > 0.35
            ? instUnitsPerSec
            : totalDist / Math.max(1, liveDur)
        : 0;
      // If character has a travel path (totalDist > 1.0) and has finished moving at the end of the path (instUnitsPerSec < 0.25),
      // settle smoothly into 'idle' breathing instead of moonwalking in place at the destination.
      const effectiveGaitMode: GaitType =
        totalDist > 1.0 && !isMovingNow && (reqGait === 'walk' || reqGait === 'run' || reqGait === 'sneak')
          ? 'idle'
          : reqGait || 'auto';

      evaluateGait(rig, t, {
        gait: effectiveGaitMode,
        speed:
          effectiveGaitMode === 'idle'
            ? 0
            : rawStageSpeed > 2.0
            ? rawStageSpeed
            : effectiveGaitMode === 'run'
            ? 6.85
            : effectiveGaitMode === 'walk'
            ? 4.16
            : Math.max(rawStageSpeed * 0.15, 1.2),
      });
      sourceUsed = 'procedural-gait';
    } else if (
      activePreset &&
      POSE_PRESETS[activePreset] &&
      (!isAutoRiggedGlb || activePreset !== 'neutral-stand')
    ) {
      applyPosePreset(rig, activePreset);
      sourceUsed = 'pose-preset';
    } else if (activePreset && !POSE_PRESETS[activePreset] && !isAutoRiggedGlb) {
      applyPosePreset(rig, 'neutral-stand');
      sourceUsed = 'pose-preset';
    } else if (isAutoRiggedGlb && !hasNativeGlbAnimation) {
      resetToRestPose(rig);
      sourceUsed = 'rest-pose';
    } else {
      evaluateGait(rig, t, { gait: 'idle', speed: 0 });
      sourceUsed = 'procedural-gait';
    }
  }

  // Enforce anatomical post-condition invariant
  let check = verifyMixamoAnatomicalInvariants(rig);
  let wasInversionHealed = false;
  if (!check.isValid) {
    applyPosePreset(rig, 'neutral-stand');
    check = verifyMixamoAnatomicalInvariants(rig);
    wasInversionHealed = true;
  }

  rig.root.updateMatrixWorld(true);
  return {
    sourceUsed,
    hipsLocalY: check.hipsLocalY,
    leftFootLocalY: check.leftFootLocalY,
    rightFootLocalY: check.rightFootLocalY,
    leftFootLocalX: check.leftFootLocalX,
    rightFootLocalX: check.rightFootLocalX,
    wasInversionHealed,
  };
}

const SMPL24_TO_MIXAMO_BONE_MAP: ReadonlyArray<[number, string]> = [
  [1, 'LeftUpLeg'],
  [2, 'RightUpLeg'],
  [3, 'Spine'],
  [4, 'LeftLeg'],
  [5, 'RightLeg'],
  [6, 'Spine1'],
  [7, 'LeftFoot'],
  [8, 'RightFoot'],
  [9, 'Spine2'],
  [10, 'LeftToeBase'],
  [11, 'RightToeBase'],
  [12, 'Neck'],
  [13, 'LeftShoulder'],
  [14, 'RightShoulder'],
  [15, 'Head'],
  [16, 'LeftArm'],
  [17, 'RightArm'],
  [18, 'LeftForeArm'],
  [19, 'RightForeArm'],
  [20, 'LeftHand'],
  [21, 'RightHand'],
];

function axisAngleToQuaternion(rv?: number[]): THREE.Quaternion {
  if (!rv || rv.length < 3) return new THREE.Quaternion(0, 0, 0, 1);
  const rx = Number(rv[0]) || 0;
  const ry = Number(rv[1]) || 0;
  const rz = Number(rv[2]) || 0;
  const angle = Math.hypot(rx, ry, rz);
  if (angle < 1e-7) return new THREE.Quaternion(0, 0, 0, 1);
  return new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(rx / angle, ry / angle, rz / angle),
    angle
  );
}

function quatToTuple(q: THREE.Quaternion): [number, number, number, number] {
  return [
    Number(q.x.toFixed(5)),
    Number(q.y.toFixed(5)),
    Number(q.z.toFixed(5)),
    Number(q.w.toFixed(5)),
  ];
}

/**
 * Converts 24-joint 3D SMPL metric coordinates (`joints3d` of shape `[24][3]` in camera space:
 * +X right on image, +Y down on image, +Z depth from camera) and optional 24-joint SMPL Axis-Angle
 * pose vectors (`poseRotvecs24` of shape `[24][3]` in radians from `nlf_l_multi_0.3.2.torchscript`)
 * directly into a canonical Mixamo `ActorPose` with full 22-bone `charSpaceRotations` and true
 * 3D Stage facing orientation (`facingYawDeg`).
 *
 * SMPL 24 Joint Indices:
 *  0: Pelvis, 1: L_Hip, 2: R_Hip, 3: Spine1, 4: L_Knee, 5: R_Knee, 6: Spine2,
 *  7: L_Ankle, 8: R_Ankle, 9: Spine3, 10: L_Foot, 11: R_Foot, 12: Neck,
 *  13: L_Collar, 14: R_Collar, 15: Head, 16: L_Shoulder, 17: R_Shoulder,
 *  18: L_Elbow, 19: R_Elbow, 20: L_Wrist, 21: R_Wrist, 22: L_Hand, 23: R_Hand
 */
export interface Smpl24RetargetOptions {
  headingYawRad?: number;
  cameraPitchOffsetRad?: number;
  cameraRollOffsetRad?: number;
}

export function convertSmpl24JointsToMixamoPose(
  joints3d: number[][],
  _stanceFloorAnkleY: number,
  lockFootContacts = true,
  poseRotvecs24?: number[][],
  trans3d?: [number, number, number],
  retargetOptions?: Smpl24RetargetOptions
): {
  pose: ActorPose;
  pelvisCameraXyz: [number, number, number];
  estimatedHeightMeters: number;
  facingYawDeg: number;
  rawYawRad: number;
  rawPitchRad: number;
  rawRollRad: number;
} {
  const getJ = (idx: number): [number, number, number] => {
    const j = joints3d[idx];
    if (!j || j.length < 3) return [0, 0, 2.5];
    return [Number(j[0]) || 0, Number(j[1]) || 0, Number(j[2]) || 2.5];
  };

  const rawPelvis = getJ(0);
  const pelvis: [number, number, number] =
    trans3d && trans3d.length === 3 && Number.isFinite(trans3d[2]) && Math.abs(trans3d[2]) > 0.05
      ? [Number(trans3d[0]) || rawPelvis[0], Number(trans3d[1]) || rawPelvis[1], Number(trans3d[2]) || rawPelvis[2]]
      : rawPelvis;
  const lHip = getJ(1);
  const rHip = getJ(2);
  const lKnee = getJ(4);
  const rKnee = getJ(5);
  const lAnkle = getJ(7);
  const rAnkle = getJ(8);
  const neck = getJ(12);
  const head = getJ(15);
  const lShoulder = getJ(16);
  const rShoulder = getJ(17);
  const lElbow = getJ(18);
  const rElbow = getJ(19);
  const lWrist = getJ(20);
  const rWrist = getJ(21);

  // Compute true metric body height from summed skeletal segment lengths (orientation-invariant)
  const dist3 = (a: [number, number, number], b: [number, number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const legLenMeters =
    0.5 * (dist3(lHip, lKnee) + dist3(lKnee, lAnkle) + dist3(rHip, rKnee) + dist3(rKnee, rAnkle));
  const torsoHeadMeters = dist3(rawPelvis, neck) + dist3(neck, head) * 1.35;
  const midAnkleY = (lAnkle[1] + rAnkle[1]) * 0.5;
  const verticalSpanMeters = Math.abs(midAnkleY - head[1]) * 1.18;
  const rawBodySpanMeters = Math.max(0.45, Math.max(legLenMeters + torsoHeadMeters, verticalSpanMeters));
  const invScale = 1.0 / rawBodySpanMeters;

  const hasValidRotvecs =
    Array.isArray(poseRotvecs24) &&
    poseRotvecs24.length >= 22 &&
    Array.isArray(poseRotvecs24[0]) &&
    poseRotvecs24[0].length >= 3;

  // Construct 3D Torso Orthonormal Basis (torsoX = Character Left, torsoY = Spine Up, torsoZ = Chest Forward)
  // in OpenCV Camera Space so limb vectors are 100% invariant to camera tilt, roll, and subject yaw.
  const spineUpRaw = new THREE.Vector3(
    neck[0] - rawPelvis[0],
    neck[1] - rawPelvis[1],
    neck[2] - rawPelvis[2]
  );
  if (
    retargetOptions?.cameraPitchOffsetRad !== undefined &&
    Number.isFinite(retargetOptions.cameraPitchOffsetRad)
  ) {
    const pOff = retargetOptions.cameraPitchOffsetRad;
    const refUp = new THREE.Vector3(0, -Math.cos(pOff), -Math.sin(pOff)).multiplyScalar(
      spineUpRaw.length() || 0.45
    );
    spineUpRaw.lerp(refUp, 0.45);
  }
  const torsoY =
    spineUpRaw.lengthSq() > 1e-6 ? spineUpRaw.normalize() : new THREE.Vector3(0, -1, 0);

  const lateralLeftRaw = new THREE.Vector3(
    lShoulder[0] - rShoulder[0] + (lHip[0] - rHip[0]),
    lShoulder[1] - rShoulder[1] + (lHip[1] - rHip[1]),
    lShoulder[2] - rShoulder[2] + (lHip[2] - rHip[2])
  );
  if (
    retargetOptions?.headingYawRad !== undefined &&
    Number.isFinite(retargetOptions.headingYawRad)
  ) {
    const hYaw = retargetOptions.headingYawRad;
    const refLat = new THREE.Vector3(Math.cos(hYaw), 0, Math.sin(hYaw)).multiplyScalar(
      lateralLeftRaw.length() || 0.55
    );
    lateralLeftRaw.lerp(refLat, 0.65);
  }
  lateralLeftRaw.addScaledVector(torsoY, -lateralLeftRaw.dot(torsoY));
  const torsoX =
    lateralLeftRaw.lengthSq() > 1e-6 ? lateralLeftRaw.normalize() : new THREE.Vector3(1, 0, 0);
  const torsoZ = new THREE.Vector3().crossVectors(torsoX, torsoY).normalize();

  const projectToTorsoVec = (
    fromPt: [number, number, number],
    toPt: [number, number, number]
  ): THREE.Vector3 => {
    const dx = toPt[0] - fromPt[0];
    const dy = toPt[1] - fromPt[1];
    const dz = toPt[2] - fromPt[2];
    return new THREE.Vector3(
      dx * torsoX.x + dy * torsoX.y + dz * torsoX.z,
      dx * torsoY.x + dy * torsoY.y + dz * torsoY.z,
      dx * torsoZ.x + dy * torsoZ.y + dz * torsoZ.z
    );
  };

  let yawRad = 0;
  let rawYawRad = 0;
  let rawPitchRad = 0;
  let rawRollRad = 0;
  const charSpaceRotations: Record<string, [number, number, number, number]> = {};

  if (hasValidRotvecs && poseRotvecs24) {
    // Convert global_orient (joint 0) from OpenCV Camera Space (+X right, +Y down, +Z depth)
    // into Three.js Stage World Space (+X right, +Y up, +Z toward camera) via Q_x(pi) = (1, 0, 0, 0)
    const qOpenCvRoot = axisAngleToQuaternion(poseRotvecs24[0]);
    const qFlipX180 = new THREE.Quaternion(1, 0, 0, 0);
    const qPelvisWorld = qFlipX180.multiply(qOpenCvRoot).normalize();

    // Extract global stage facing yaw around World +Y so mesh.rotation.y turns the actor naturally
    const eulerYXZ = new THREE.Euler().setFromQuaternion(qPelvisWorld, 'YXZ');
    rawYawRad = eulerYXZ.y;
    rawPitchRad = eulerYXZ.x;
    rawRollRad = eulerYXZ.z;
  } else {
    // Estimate facing yaw from 3D hip & shoulder lateral vectors when only 3D joint positions are provided
    const latX = lHip[0] - rHip[0] + (lShoulder[0] - rShoulder[0]);
    const latZ = lHip[2] - rHip[2] + (lShoulder[2] - rShoulder[2]);
    if (Math.hypot(latX, latZ) > 1e-3) {
      rawYawRad = Math.atan2(latZ, latX);
    }
  }

  yawRad =
    retargetOptions?.headingYawRad !== undefined && Number.isFinite(retargetOptions.headingYawRad)
      ? retargetOptions.headingYawRad
      : rawYawRad;

  const yawDelta = Math.atan2(Math.sin(rawYawRad - yawRad), Math.cos(rawYawRad - yawRad));
  const hipsYaw =
    retargetOptions?.headingYawRad !== undefined
      ? THREE.MathUtils.clamp(yawDelta * 0.35, -0.12, 0.12)
      : 0;
  const pitchRef =
    retargetOptions?.cameraPitchOffsetRad !== undefined
      ? retargetOptions.cameraPitchOffsetRad
      : rawPitchRad;
  const rollRef =
    retargetOptions?.cameraRollOffsetRad !== undefined
      ? retargetOptions.cameraRollOffsetRad
      : rawRollRad;
  const hipsPitch = THREE.MathUtils.clamp((rawPitchRad - pitchRef) * 0.28, -0.1, 0.1);
  const hipsRoll = THREE.MathUtils.clamp((rawRollRad - rollRef) * 0.28, -0.08, 0.08);

  const qHipsLocal = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(hipsPitch, hipsYaw, hipsRoll, 'YXZ'))
    .normalize();
  charSpaceRotations.Hips = quatToTuple(qHipsLocal);

  // Precompute 3D torso-frame thigh & shin vectors for hybrid Swing-Twist leg retargeting
  const thighVecL = projectToTorsoVec(lHip, lKnee);
  const shinVecL = projectToTorsoVec(lKnee, lAnkle);
  const thighVecR = projectToTorsoVec(rHip, rKnee);
  const shinVecR = projectToTorsoVec(rKnee, rAnkle);
  const hasValidLThigh = thighVecL.lengthSq() > 1e-5 && shinVecL.lengthSq() > 1e-5;
  const hasValidRThigh = thighVecR.lengthSq() > 1e-5 && shinVecR.lengthSq() > 1e-5;
  if (hasValidLThigh) {
    thighVecL.normalize();
    shinVecL.normalize();
  }
  if (hasValidRThigh) {
    thighVecR.normalize();
    shinVecR.normalize();
  }
  const vecHipRxL = hasValidLThigh ? Math.atan2(-thighVecL.z, Math.max(0.2, -thighVecL.y)) : 0;
  const vecHipRxR = hasValidRThigh ? Math.atan2(-thighVecR.z, Math.max(0.2, -thighVecR.y)) : 0;
  const vecKneeRxL = hasValidLThigh
    ? Math.acos(THREE.MathUtils.clamp(thighVecL.dot(shinVecL), -1, 1))
    : 0;
  const vecKneeRxR = hasValidRThigh
    ? Math.acos(THREE.MathUtils.clamp(thighVecR.dot(shinVecR), -1, 1))
    : 0;

  // Convert all 21 articulated SMPL body joints to anatomically-constrained character-space quaternions
  for (const [smplIdx, mixamoBoneName] of SMPL24_TO_MIXAMO_BONE_MAP) {
    const rv = hasValidRotvecs && poseRotvecs24 ? (poseRotvecs24[smplIdx] ?? [0, 0, 0]) : [0, 0, 0];
    let rx = Number(rv[0]) || 0;
    let ry = Number(rv[1]) || 0;
    let rz = Number(rv[2]) || 0;

    if (smplIdx === 1 || smplIdx === 2) {
      // LeftUpLeg / RightUpLeg: blend SMPL rotvec with 3D torso-frame thigh vector, soft-compress monocular foreshortening,
      // and damp axial thigh spin (`ry`) so knees and feet track cleanly without inward/outward twist wobble.
      const vecRx = smplIdx === 1 ? vecHipRxL : vecHipRxR;
      rx = hasValidRotvecs ? rx * 0.78 + vecRx * 0.22 : vecRx;
      rx = rx < -0.52 ? -0.52 + (rx + 0.52) * 0.6 : rx;
      rx = THREE.MathUtils.clamp(rx, -0.95, 0.62);
      ry = THREE.MathUtils.clamp(ry * 0.42, -0.18, 0.18);
      rz = THREE.MathUtils.clamp(rz * 0.52, -0.16, 0.16);
    } else if (smplIdx === 4 || smplIdx === 5) {
      // LeftLeg / RightLeg (Knees): blend with 3D thigh-to-shin flexion angle & enforce 1-DOF hinge stability
      const vecKnee = smplIdx === 4 ? vecKneeRxL : vecKneeRxR;
      rx = hasValidRotvecs ? rx * 0.78 + vecKnee * 0.22 : vecKnee;
      rx = THREE.MathUtils.clamp(rx, 0.02, 1.38);
      ry = THREE.MathUtils.clamp(ry * 0.18, -0.06, 0.06);
      rz = THREE.MathUtils.clamp(rz * 0.18, -0.05, 0.05);
    } else if (smplIdx === 7 || smplIdx === 8 || smplIdx === 10 || smplIdx === 11) {
      // Ankles & Toes
      rx = THREE.MathUtils.clamp(rx * 0.75, -0.38, 0.38);
      ry = THREE.MathUtils.clamp(ry * 0.42, -0.16, 0.16);
      rz = THREE.MathUtils.clamp(rz * 0.42, -0.14, 0.14);
    } else if (smplIdx === 3 || smplIdx === 6 || smplIdx === 9) {
      // Spine / Spine1 / Spine2: attenuate mild monocular hunch (<0.26 rad) and loose-clothing lateral roll wobble (`rz`)
      const pitchScale = rx > 0 && rx < 0.26 ? 0.42 : 0.68;
      const rollScale = Math.abs(rz) < 0.12 ? 0.42 : 0.62;
      rx = THREE.MathUtils.clamp(rx * pitchScale, -0.22, 0.26);
      ry = THREE.MathUtils.clamp(ry * 0.76, -0.28, 0.28);
      rz = THREE.MathUtils.clamp(rz * rollScale, -0.16, 0.16);
    } else if (smplIdx === 12 || smplIdx === 15) {
      // Neck / Head: allow full natural head turns, nods, and tilts
      rx = THREE.MathUtils.clamp(rx * 0.72, -0.38, 0.38);
      ry = THREE.MathUtils.clamp(ry * 0.9, -0.68, 0.68);
      rz = THREE.MathUtils.clamp(rz * 0.62, -0.25, 0.25);
    } else if (smplIdx === 13 || smplIdx === 14) {
      // LeftShoulder / RightShoulder (Clavicles): damp loose-shirt shoulder shrug jitter
      rx = THREE.MathUtils.clamp(rx * 0.34, -0.12, 0.12);
      ry = THREE.MathUtils.clamp(ry * 0.34, -0.14, 0.14);
      rz = THREE.MathUtils.clamp(rz * 0.34, -0.14, 0.14);
    } else if (smplIdx === 20 || smplIdx === 21) {
      // LeftHand / RightHand (Wrists): damp axial forearm-wrist twist noise
      rx = THREE.MathUtils.clamp(rx * 0.45, -0.28, 0.28);
      ry = THREE.MathUtils.clamp(ry * 0.5, -0.32, 0.32);
      rz = THREE.MathUtils.clamp(rz * 0.5, -0.32, 0.32);
    }

    const qJoint = axisAngleToQuaternion([rx, ry, rz]).normalize();
    charSpaceRotations[mixamoBoneName] = quatToTuple(qJoint);
  }

  // Solve LeftArm (16), LeftForeArm (18), RightArm (17), RightForeArm (19) directly from the 3D
  // torso-frame joint vectors so damping Spine/Clavicle tilt never leaves uncancelled shoulder pitch/flare.
  const tupleToQuat = (t: [number, number, number, number] | undefined): THREE.Quaternion =>
    t ? new THREE.Quaternion(t[0], t[1], t[2], t[3]).normalize() : new THREE.Quaternion();
  const qTorsoTop = qHipsLocal
    .clone()
    .multiply(tupleToQuat(charSpaceRotations.Spine))
    .multiply(tupleToQuat(charSpaceRotations.Spine1))
    .multiply(tupleToQuat(charSpaceRotations.Spine2));
  const qLParent = qTorsoTop.clone().multiply(tupleToQuat(charSpaceRotations.LeftShoulder));
  const qRParent = qTorsoTop.clone().multiply(tupleToQuat(charSpaceRotations.RightShoulder));
  const ePosX = new THREE.Vector3(1, 0, 0);
  const eNegX = new THREE.Vector3(-1, 0, 0);
  const wLTally = projectToTorsoVec(rawPelvis, lWrist);
  const wRTally = projectToTorsoVec(rawPelvis, rWrist);
  // Smooth C1 weight in [0..1]: 1 when wrist is low beside/below hips, 0 when raised above waist
  const lLowArmW = THREE.MathUtils.smoothstep(
    0.08 * rawBodySpanMeters - wLTally.y,
    -0.08 * rawBodySpanMeters,
    0.14 * rawBodySpanMeters
  );
  const rLowArmW = THREE.MathUtils.smoothstep(
    0.08 * rawBodySpanMeters - wRTally.y,
    -0.08 * rawBodySpanMeters,
    0.14 * rawBodySpanMeters
  );

  const uL = projectToTorsoVec(lShoulder, lElbow);
  if (uL.lengthSq() > 1e-6) {
    uL.normalize();
    if (uL.y < -0.25 && uL.x > 0.1) {
      const flareScale = 0.75 - 0.4 * lLowArmW;
      uL.x = 0.1 + (uL.x - 0.1) * flareScale;
    }
    if (lLowArmW > 0.01 && uL.y < -0.35) {
      const clampedZ = THREE.MathUtils.clamp(uL.z * 0.55, -0.28, 0.32);
      uL.z = uL.z * (1 - lLowArmW) + clampedZ * lLowArmW;
    }
    uL.normalize();
    const uLLocal = uL.clone().applyQuaternion(qLParent.clone().invert()).normalize();
    const qLArm = new THREE.Quaternion().setFromUnitVectors(ePosX, uLLocal).normalize();
    charSpaceRotations.LeftArm = quatToTuple(qLArm);

    const qLArmChain = qLParent.clone().multiply(qLArm);
    const fL = projectToTorsoVec(lElbow, lWrist);
    if (fL.lengthSq() > 1e-6) {
      fL.normalize();
      if (lLowArmW > 0.01) {
        if (fL.y < -0.15 && fL.x > 0.06) {
          const targetX = 0.06 + (fL.x - 0.06) * 0.3;
          fL.x = fL.x * (1 - lLowArmW) + targetX * lLowArmW;
        }
        if (uL.y < -0.45 && fL.y < 0.15) {
          const targetZ = THREE.MathUtils.clamp(fL.z * 0.55, -0.22, 0.42);
          const targetY = Math.min(fL.y, -0.55);
          fL.z = fL.z * (1 - lLowArmW) + targetZ * lLowArmW;
          fL.y = fL.y * (1 - lLowArmW) + targetY * lLowArmW;
        }
      }
      fL.normalize();
      const fLLocal = fL.clone().applyQuaternion(qLArmChain.clone().invert()).normalize();
      const qLForeArm = new THREE.Quaternion().setFromUnitVectors(ePosX, fLLocal).normalize();
      charSpaceRotations.LeftForeArm = quatToTuple(qLForeArm);
    }
  }

  const uR = projectToTorsoVec(rShoulder, rElbow);
  if (uR.lengthSq() > 1e-6) {
    uR.normalize();
    if (uR.y < -0.25 && uR.x < -0.1) {
      const flareScale = 0.75 - 0.4 * rLowArmW;
      uR.x = -0.1 + (uR.x + 0.1) * flareScale;
    }
    if (rLowArmW > 0.01 && uR.y < -0.35) {
      const clampedZ = THREE.MathUtils.clamp(uR.z * 0.55, -0.28, 0.32);
      uR.z = uR.z * (1 - rLowArmW) + clampedZ * rLowArmW;
    }
    uR.normalize();
    const uRLocal = uR.clone().applyQuaternion(qRParent.clone().invert()).normalize();
    const qRArm = new THREE.Quaternion().setFromUnitVectors(eNegX, uRLocal).normalize();
    charSpaceRotations.RightArm = quatToTuple(qRArm);

    const qRArmChain = qRParent.clone().multiply(qRArm);
    const fR = projectToTorsoVec(rElbow, rWrist);
    if (fR.lengthSq() > 1e-6) {
      fR.normalize();
      if (rLowArmW > 0.01) {
        if (fR.y < -0.15 && fR.x < -0.06) {
          const targetX = -0.06 + (fR.x + 0.06) * 0.3;
          fR.x = fR.x * (1 - rLowArmW) + targetX * rLowArmW;
        }
        if (uR.y < -0.45 && fR.y < 0.15) {
          const targetZ = THREE.MathUtils.clamp(fR.z * 0.55, -0.22, 0.42);
          const targetY = Math.min(fR.y, -0.55);
          fR.z = fR.z * (1 - rLowArmW) + targetZ * rLowArmW;
          fR.y = fR.y * (1 - rLowArmW) + targetY * rLowArmW;
        }
      }
      fR.normalize();
      const fRLocal = fR.clone().applyQuaternion(qRArmChain.clone().invert()).normalize();
      const qRForeArm = new THREE.Quaternion().setFromUnitVectors(eNegX, fRLocal).normalize();
      charSpaceRotations.RightForeArm = quatToTuple(qRForeArm);
    }
  }

  const facingYawDeg = Number(THREE.MathUtils.radToDeg(yawRad).toFixed(2));

  // Map camera-space 3D into Mixamo Character-Local normalized coordinates (+X = Left, +Y = Up, +Z = Forward)
  // via the 3D torso orthonormal basis so IK targets remain valid at any yaw or camera tilt:
  const toCharLocal = (pt: [number, number, number]): [number, number, number] => {
    const v = projectToTorsoVec(rawPelvis, pt);
    const nx = THREE.MathUtils.clamp(v.x * invScale, -0.45, 0.45);
    const ny = THREE.MathUtils.clamp(0.53 + v.y * invScale, 0.0, 1.05);
    const nz = THREE.MathUtils.clamp(v.z * invScale, -0.42, 0.45);
    return [Number(nx.toFixed(4)), Number(ny.toFixed(4)), Number(nz.toFixed(4))];
  };

  const lAnkLocal = toCharLocal(lAnkle);
  const rAnkLocal = toCharLocal(rAnkle);
  const lKneeLocal = toCharLocal(lKnee);
  const rKneeLocal = toCharLocal(rKnee);
  const lWristLocal = toCharLocal(lWrist);
  const rWristLocal = toCharLocal(rWrist);
  const lElbowLocal = toCharLocal(lElbow);
  const rElbowLocal = toCharLocal(rElbow);

  // Enforce Character Left = +X, Character Right = -X for stance ankles
  lAnkLocal[0] = Number(Math.max(0.055, Math.min(0.22, Math.abs(lAnkLocal[0]) || 0.09)).toFixed(4));
  rAnkLocal[0] = Number((-Math.max(0.055, Math.min(0.22, Math.abs(rAnkLocal[0]) || 0.09))).toFixed(4));

  // Measure foot lift relative to the current frame's supporting stance ankle so min(lLift, rLift) === 0
  const lAnkTorsoY = projectToTorsoVec(rawPelvis, lAnkle).y * invScale;
  const rAnkTorsoY = projectToTorsoVec(rawPelvis, rAnkle).y * invScale;
  const frameStanceAnkleY = Math.min(lAnkTorsoY, rAnkTorsoY);
  const lLift = Math.max(0, lAnkTorsoY - frameStanceAnkleY);
  const rLift = Math.max(0, rAnkTorsoY - frameStanceAnkleY);
  lAnkLocal[1] = Number((lockFootContacts && lLift < 0.025 ? 0 : Math.min(0.26, lLift)).toFixed(4));
  rAnkLocal[1] = Number((lockFootContacts && rLift < 0.025 ? 0 : Math.min(0.26, rLift)).toFixed(4));

  lKneeLocal[0] = lAnkLocal[0];
  rKneeLocal[0] = rAnkLocal[0];
  lKneeLocal[2] = Number(Math.max(0.25, lKneeLocal[2] + 0.22).toFixed(4));
  rKneeLocal[2] = Number(Math.max(0.25, rKneeLocal[2] + 0.22).toFixed(4));

  // Allow hands to move freely in 3D character space (including touching/clapping/crossing midline)
  lWristLocal[0] = Number(THREE.MathUtils.clamp(lWristLocal[0], -0.32, 0.45).toFixed(4));
  rWristLocal[0] = Number(THREE.MathUtils.clamp(rWristLocal[0], -0.45, 0.32).toFixed(4));
  lElbowLocal[0] = Number(Math.max(0.14, Math.abs(lElbowLocal[0]) || 0.26).toFixed(4));
  rElbowLocal[0] = Number((-Math.max(0.14, Math.abs(rElbowLocal[0]) || 0.26)).toFixed(4));
  lElbowLocal[2] = Number(Math.min(-0.18, lElbowLocal[2] - 0.18).toFixed(4));
  rElbowLocal[2] = Number(Math.min(-0.18, rElbowLocal[2] - 0.18).toFixed(4));

  const shoulderYaw = THREE.MathUtils.clamp((lShoulder[2] - rShoulder[2]) * invScale * 1.4, -0.45, 0.45);
  const hipYaw = THREE.MathUtils.clamp((lHip[2] - rHip[2]) * invScale * 1.2, -0.35, 0.35);
  const torsoPitch = THREE.MathUtils.clamp((rawPelvis[2] - neck[2]) * invScale * 0.9, -0.25, 0.38);

  const makeQ = (rx: number, ry: number, rz: number): [number, number, number, number] => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    return [Number(q.x.toFixed(5)), Number(q.y.toFixed(5)), Number(q.z.toFixed(5)), Number(q.w.toFixed(5))];
  };

  const rotations: Record<string, [number, number, number, number]> = charSpaceRotations
    ? {
        Hips: charSpaceRotations.Hips ?? makeQ(0, 0, 0),
        Spine: charSpaceRotations.Spine ?? makeQ(0, 0, 0),
        Chest: charSpaceRotations.Spine1 ?? makeQ(0, 0, 0),
        Neck: charSpaceRotations.Neck ?? makeQ(0, 0, 0),
        Head: charSpaceRotations.Head ?? makeQ(0, 0, 0),
        LeftShoulder: charSpaceRotations.LeftShoulder ?? makeQ(0, 0, 0),
        LeftArm: charSpaceRotations.LeftArm ?? makeQ(0, 0, 0),
        LeftForeArm: charSpaceRotations.LeftForeArm ?? makeQ(0, 0, 0),
        LeftHand: charSpaceRotations.LeftHand ?? makeQ(0, 0, 0),
        RightShoulder: charSpaceRotations.RightShoulder ?? makeQ(0, 0, 0),
        RightArm: charSpaceRotations.RightArm ?? makeQ(0, 0, 0),
        RightForeArm: charSpaceRotations.RightForeArm ?? makeQ(0, 0, 0),
        RightHand: charSpaceRotations.RightHand ?? makeQ(0, 0, 0),
        LeftUpLeg: charSpaceRotations.LeftUpLeg ?? makeQ(0, 0, 0),
        LeftLeg: charSpaceRotations.LeftLeg ?? makeQ(0, 0, 0),
        LeftFoot: charSpaceRotations.LeftFoot ?? makeQ(0, 0, 0),
        RightUpLeg: charSpaceRotations.RightUpLeg ?? makeQ(0, 0, 0),
        RightLeg: charSpaceRotations.RightLeg ?? makeQ(0, 0, 0),
        RightFoot: charSpaceRotations.RightFoot ?? makeQ(0, 0, 0),
      }
    : {
        Hips: makeQ(torsoPitch * 0.25, hipYaw, 0),
        Spine: makeQ(torsoPitch * 0.45, (shoulderYaw - hipYaw) * 0.5, 0),
        Chest: makeQ(torsoPitch * 0.3, (shoulderYaw - hipYaw) * 0.5, 0),
        Neck: makeQ(0, 0, 0),
        Head: makeQ(0, 0, 0),
      };

  return {
    pelvisCameraXyz: pelvis,
    estimatedHeightMeters: Number(THREE.MathUtils.clamp(rawBodySpanMeters, 1.45, 2.05).toFixed(2)),
    facingYawDeg,
    rawYawRad,
    rawPitchRad,
    rawRollRad,
    pose: {
      hipsOffset: [0, 0, 0],
      rotations,
      ...(charSpaceRotations ? { charSpaceRotations } : {}),
      anatomicalIk: {
        leftAnkle: lAnkLocal,
        rightAnkle: rAnkLocal,
        leftKneePole: lKneeLocal,
        rightKneePole: rKneeLocal,
        leftFootPitch: Number(THREE.MathUtils.clamp(-lAnkLocal[2] * 0.45, -0.25, 0.25).toFixed(4)),
        rightFootPitch: Number(THREE.MathUtils.clamp(-rAnkLocal[2] * 0.45, -0.25, 0.25).toFixed(4)),
        leftHand: lWristLocal,
        rightHand: rWristLocal,
        leftElbowPole: lElbowLocal,
        rightElbowPole: rElbowLocal,
        headLookAt: [0, 0.92, 0.85],
      },
    },
  };
}
