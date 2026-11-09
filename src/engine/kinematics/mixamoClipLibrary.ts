/**
 * Mixamo Studio Motion Capture Clip Library (`mixamoClipLibrary.ts`)
 *
 * Evaluates authentic optical motion-capture animations extracted from the
 * official Three.js / Adobe Mixamo studio rig (`Xbot.glb` — MIT licensed)
 * across all 52 articulating Mixamo joints:
 *   - Spine chain (`Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`)
 *   - Clavicles & arms (`LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`,
 *     `RightShoulder`, `RightArm`, `RightForeArm`, `RightHand`)
 *   - 30 Phalangeal finger joints (`Thumb1..3`, `Index1..3`, `Middle1..3`, `Ring1..3`, `Pinky1..3` L/R)
 *   - Legs, ankles & toe-base (`LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftToeBase`,
 *     `RightUpLeg`, `RightLeg`, `RightFoot`, `RightToeBase`)
 *
 * Uses exact change-of-basis retargeting:
 *   q_fbx(B) = R_local_rest(B) * (W_char_rest(B)^-1 * q_glb(B) * W_char_rest(B))
 * plus Stance-Foot Sole Floor Pinning so the supporting foot never floats or slides vertically.
 */

import * as THREE from 'three';
import { HumanoidRig } from './skeletonHierarchy';
import { HumanoidBone } from '../procedural3D/sculptSpec';
import { resetToRestPose } from './posePresets';
import rawMixamoClipData from './mixamoClipData.json';

export type MixamoStudioClipName =
  | 'walk'
  | 'run'
  | 'idle'
  | 'agree'
  | 'headShake'
  | 'sneak_pose'
  | 'sad_pose'
  | 'samba_dance'
  | 'dialogue_gesture'
  | 'action_look_around';

export interface MixamoClipTrackData {
  name: string;
  duration: number;
  frameCount: number;
  hipsOffsetMeters: [number, number, number][];
  tracks: Record<string, [number, number, number, number][]>;
}

const CLIP_DATABASE = rawMixamoClipData as unknown as Record<
  MixamoStudioClipName,
  MixamoClipTrackData
>;

/**
 * Physical stage stride velocities (in Three.js stage units per second at 1.0x playback speed
 * for a standard 5.06-unit / 1.75m humanoid rig), measured directly from the Mixamo foot trajectories.
 */
export const MIXAMO_NATURAL_STAGE_SPEEDS: Record<'walk' | 'run' | 'sneak', number> = {
  walk: 4.16,
  run: 6.85,
  sneak: 2.65,
};

export interface EvaluateMixamoClipOptions {
  /** Playback speed multiplier (default 1.0) */
  speedScale?: number;
  /** Blend weight 0..1 between natural Idle stand (0) and full clip motion (1) */
  blendWeight?: number;
}

const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _qInterp = new THREE.Quaternion();
const _qIdleRef = new THREE.Quaternion();
const _wRestInv = new THREE.Quaternion();
const _deltaLocal = new THREE.Quaternion();
const _invRootMat = new THREE.Matrix4();
const _tmpVec = new THREE.Vector3();

const CANONICAL_19_TO_MIXAMO_TRACK: Record<HumanoidBone, string[]> = {
  Hips: ['Hips'],
  Spine: ['Spine'],
  Chest: ['Spine1', 'Spine2'],
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

function sampleTrackQuaternion(
  frames: [number, number, number, number][],
  f0: number,
  f1: number,
  alpha: number,
  target: THREE.Quaternion
): THREE.Quaternion {
  if (!frames || frames.length === 0) {
    return target.set(0, 0, 0, 1);
  }
  if (frames.length === 1 || f0 === f1 || alpha <= 1e-5) {
    const k = frames[Math.min(f0, frames.length - 1)];
    return target.set(k[0], k[1], k[2], k[3]).normalize();
  }
  const k0 = frames[Math.min(f0, frames.length - 1)];
  const k1 = frames[Math.min(f1, frames.length - 1)];
  _q0.set(k0[0], k0[1], k0[2], k0[3]);
  _q1.set(k1[0], k1[1], k1[2], k1[3]);
  if (_q0.dot(_q1) < 0) {
    _q1.set(-_q1.x, -_q1.y, -_q1.z, -_q1.w);
  }
  return target.slerpQuaternions(_q0, _q1, alpha).normalize();
}

function computeLowestFootLocalY(rig: HumanoidRig): number | null {
  rig.root.updateMatrixWorld(true);
  _invRootMat.copy(rig.root.matrixWorld).invert();
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
    _tmpVec.setFromMatrixPosition(b.matrixWorld).applyMatrix4(_invRootMat);
    if (_tmpVec.y < minY) {
      minY = _tmpVec.y;
    }
  }
  return Number.isFinite(minY) ? minY : null;
}

/**
 * Evaluates a real Mixamo studio motion-capture clip at `timeSeconds` and applies
 * all bone rotations and pelvic root translation directly onto `rig`.
 */
export function evaluateMixamoClipOnRig(
  rig: HumanoidRig,
  clipName: MixamoStudioClipName,
  timeSeconds: number,
  options: EvaluateMixamoClipOptions = {}
): { phase: number; applied: boolean } {
  const clip = CLIP_DATABASE[clipName];
  if (!clip) {
    return { phase: 0, applied: false };
  }

  const idleClip = CLIP_DATABASE.idle;
  const speedScale = options.speedScale ?? 1.0;
  const blendWeight =
    options.blendWeight !== undefined ? THREE.MathUtils.clamp(options.blendWeight, 0, 1) : 1.0;

  resetToRestPose(rig);
  const restLowestFootY = computeLowestFootLocalY(rig);

  const duration = Math.max(0.0333, clip.duration || 1.0);
  const phase =
    clip.frameCount <= 1
      ? 0
      : (((timeSeconds * speedScale) / duration) % 1.0 + 1.0) % 1.0;

  const maxFrameIdx = Math.max(0, clip.frameCount - 1);
  const exactFrame = phase * maxFrameIdx;
  const f0 = Math.floor(exactFrame);
  const f1 = Math.min(maxFrameIdx, f0 + 1);
  const alpha = exactFrame - f0;

  const rootScale = rig.root.scale.y || 1.0;
  const invRootScale = 1.0 / rootScale;
  const metersToRigLocal = (rig.height / 1.75) * invRootScale;

  // 1. Apply authentic Mixamo pelvic vertical bob & lateral weight shift
  const hipsBone = rig.bones.get('Hips');
  const restHipsPos = rig.restPositions.get('Hips');
  if (hipsBone && restHipsPos && clip.hipsOffsetMeters && clip.hipsOffsetMeters.length > 0) {
    const h0 = clip.hipsOffsetMeters[Math.min(f0, clip.hipsOffsetMeters.length - 1)];
    const h1 = clip.hipsOffsetMeters[Math.min(f1, clip.hipsOffsetMeters.length - 1)];
    const ox = THREE.MathUtils.lerp(h0[0], h1[0], alpha) * metersToRigLocal * blendWeight;
    const oy = THREE.MathUtils.lerp(h0[1], h1[1], alpha) * metersToRigLocal * blendWeight;
    const oz = THREE.MathUtils.lerp(h0[2], h1[2], alpha) * metersToRigLocal * blendWeight;
    hipsBone.position.set(restHipsPos.x + ox, restHipsPos.y + oy, restHipsPos.z + oz);
  }

  // 2. Full 67-bone Mixamo FBX rig path (`y-bot-tpose.fbx` and `x-bot-tpose.fbx`)
  if (
    rig.mixamoBones &&
    rig.mixamoBones.size > 0 &&
    rig.mixamoRestRotations &&
    rig.mixamoCharSpaceRestRotations
  ) {
    for (const [trackBoneName, frames] of Object.entries(clip.tracks)) {
      const bone = rig.mixamoBones.get(trackBoneName);
      const rLocal = rig.mixamoRestRotations.get(trackBoneName);
      const wRest = rig.mixamoCharSpaceRestRotations.get(trackBoneName);
      if (!bone || !rLocal || !wRest) continue;

      sampleTrackQuaternion(frames, f0, f1, alpha, _qInterp);
      if (blendWeight < 0.999 && idleClip?.tracks?.[trackBoneName]) {
        // Blend smoothly between natural Idle pose and the target clip (never toward T-pose!)
        sampleTrackQuaternion(idleClip.tracks[trackBoneName], 0, 0, 0, _qIdleRef);
        if (_qIdleRef.dot(_qInterp) < 0) {
          _qInterp.set(-_qInterp.x, -_qInterp.y, -_qInterp.z, -_qInterp.w);
        }
        _qInterp.slerpQuaternions(_qIdleRef, _qInterp, blendWeight).normalize();
      }

      // Change of basis: q_fbx(B) = rLocal(B) * (wRest(B)^-1 * qGlb(B) * wRest(B))
      _wRestInv.copy(wRest).invert();
      _deltaLocal.copy(_wRestInv).multiply(_qInterp).multiply(wRest);
      bone.quaternion.copy(rLocal).multiply(_deltaLocal);
    }

    // 3. Stance-Foot Sole Floor Pinning:
    // Ensure the supporting foot sole is pinned flush to the floor (restLowestFootY) so the character
    // never floats or skates above the ground shadow disc.
    if (hipsBone && restLowestFootY !== null) {
      const posedLowestFootY = computeLowestFootLocalY(rig);
      if (posedLowestFootY !== null) {
        const footDeltaY = posedLowestFootY - restLowestFootY;
        if (clipName !== 'run') {
          // For walk, idle, agree, headShake, sneak_pose, sad_pose: one foot is always planted on the floor
          hipsBone.position.y -= footDeltaY;
        } else if (footDeltaY < 0) {
          // For run: prevent any floor penetration while preserving airborne flight apex
          hipsBone.position.y -= footDeltaY;
        } else {
          // Gently ground the stance phase of run
          hipsBone.position.y -= footDeltaY * 0.65;
        }
      }
    }

    rig.root.updateMatrixWorld(true);
    return { phase, applied: true };
  }

  // 4. Fallback 19-bone procedural skeleton path (`createHumanoidSkeleton`)
  const qAccum = new THREE.Quaternion();
  const qPart = new THREE.Quaternion();
  for (const [boneName, trackNames] of Object.entries(CANONICAL_19_TO_MIXAMO_TRACK) as [
    HumanoidBone,
    string[],
  ][]) {
    const bone = rig.bones.get(boneName);
    const restRot = rig.restRotations.get(boneName);
    if (!bone) continue;

    qAccum.set(0, 0, 0, 1);
    let found = false;
    for (const tName of trackNames) {
      const frames = clip.tracks[tName];
      if (!frames) continue;
      sampleTrackQuaternion(frames, f0, f1, alpha, qPart);
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

  rig.root.updateMatrixWorld(true);
  return { phase, applied: true };
}
