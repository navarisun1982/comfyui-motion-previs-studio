/**
 * Deterministic Kinematics & Motion Skills Compiler
 * 
 * Compiles declarative motion skill invocations into:
 * 1. Time-sampled trajectory keyframes (position, heading, gait)
 * 2. Articulated bone rotations (quaternions) for humanoid skeleton
 * 3. Foot-Grounding Locks: Prevents foot-sliding by pinning the stance foot to the ground plane
 * 4. Procedural hand reach IK targets and seat settlement
 */

import * as THREE from 'three';
import {
  TrajectoryKeyframe,
  ActorPose,
  ActorIKTargets,
  Point2D,
} from '../../types/shotspec';
import { MotionSkillInvocation, MotionPlan, DEFAULT_SKILL_DURATIONS } from './motionSkills';

export interface CompiledMotionFrame {
  timeSec: number;
  position: [number, number];
  headingDeg: number;
  pose: ActorPose;
  ikTargets?: ActorIKTargets;
  gait: 'walk' | 'run' | 'sneak' | 'idle' | 'none';
  cueLabel?: string;
  isFootPlanted: { left: boolean; right: boolean };
}

function toCoord3D(p: any, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(p)) return [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0];
  if (p && typeof p === 'object') return [Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0];
  return fallback;
}

export interface MotionCompilationResult {
  keyframes: TrajectoryKeyframe[];
  frames: CompiledMotionFrame[];
  durationSec: number;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function eulerToQuat(xDeg: number, yDeg: number, zDeg: number): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(xDeg * DEG2RAD, yDeg * DEG2RAD, zDeg * DEG2RAD, 'YXZ')
  );
  return [q.x, q.y, q.z, q.w];
}

const STANDARD_ACTOR_POSES: Record<string, ActorPose> = {
  standing_neutral: {
    hipsOffset: [0, 0, 0],
    rotations: {
      Hips: [0, 0, 0, 1],
      Spine: [0, 0, 0, 1],
      Chest: [0, 0, 0, 1],
      Neck: [0, 0, 0, 1],
      Head: [0, 0, 0, 1],
      LeftArm: eulerToQuat(10, 0, 5),
      RightArm: eulerToQuat(10, 0, -5),
      LeftForeArm: eulerToQuat(15, 0, 0),
      RightForeArm: eulerToQuat(15, 0, 0),
      LeftUpLeg: [0, 0, 0, 1],
      RightUpLeg: [0, 0, 0, 1],
      LeftLeg: [0, 0, 0, 1],
      RightLeg: [0, 0, 0, 1],
      LeftFoot: [0, 0, 0, 1],
      RightFoot: [0, 0, 0, 1],
    },
  },
  sitting: {
    hipsOffset: [0, -0.45, 0],
    rotations: {
      Hips: [0, 0, 0, 1],
      Spine: eulerToQuat(5, 0, 0),
      Chest: [0, 0, 0, 1],
      Head: [0, 0, 0, 1],
      LeftUpLeg: eulerToQuat(90, 0, 0),
      RightUpLeg: eulerToQuat(90, 0, 0),
      LeftLeg: eulerToQuat(-90, 0, 0),
      RightLeg: eulerToQuat(-90, 0, 0),
      LeftFoot: [0, 0, 0, 1],
      RightFoot: [0, 0, 0, 1],
      LeftArm: eulerToQuat(25, 0, 10),
      RightArm: eulerToQuat(25, 0, -10),
      LeftForeArm: eulerToQuat(45, 0, 0),
      RightForeArm: eulerToQuat(45, 0, 0),
    },
  },
  sitting_chair: {
    hipsOffset: [0, -0.45, 0],
    rotations: {
      Hips: [0, 0, 0, 1],
      Spine: eulerToQuat(5, 0, 0),
      Chest: [0, 0, 0, 1],
      Head: [0, 0, 0, 1],
      LeftUpLeg: eulerToQuat(90, 0, 0),
      RightUpLeg: eulerToQuat(90, 0, 0),
      LeftLeg: eulerToQuat(-90, 0, 0),
      RightLeg: eulerToQuat(-90, 0, 0),
      LeftFoot: [0, 0, 0, 1],
      RightFoot: [0, 0, 0, 1],
      LeftArm: eulerToQuat(25, 0, 10),
      RightArm: eulerToQuat(25, 0, -10),
      LeftForeArm: eulerToQuat(45, 0, 0),
      RightForeArm: eulerToQuat(45, 0, 0),
    },
  },
  talking_expressive: {
    hipsOffset: [0, 0, 0],
    rotations: {
      Hips: [0, 0, 0, 1],
      Spine: eulerToQuat(3, 0, 0),
      Chest: [0, 0, 0, 1],
      Head: eulerToQuat(5, 10, 0),
      LeftArm: eulerToQuat(35, 10, 15),
      RightArm: eulerToQuat(45, -15, -20),
      LeftForeArm: eulerToQuat(60, 0, 0),
      RightForeArm: eulerToQuat(75, 0, 0),
      LeftUpLeg: [0, 0, 0, 1],
      RightUpLeg: [0, 0, 0, 1],
      LeftLeg: [0, 0, 0, 1],
      RightLeg: [0, 0, 0, 1],
      LeftFoot: [0, 0, 0, 1],
      RightFoot: [0, 0, 0, 1],
    },
  },
};

function clonePose(presetName: string): ActorPose {
  const p = STANDARD_ACTOR_POSES[presetName] || STANDARD_ACTOR_POSES.standing_neutral;
  return {
    hipsOffset: p.hipsOffset ? [...p.hipsOffset] : [0, 0, 0],
    rotations: { ...p.rotations },
  };
}

/**
 * Blend two poses together with factor t (0..1)
 */
export function blendPoses(poseA: ActorPose, poseB: ActorPose, t: number): ActorPose {
  const clampedT = Math.max(0, Math.min(1, t));
  const offA = poseA.hipsOffset || [0, 0, 0];
  const offB = poseB.hipsOffset || [0, 0, 0];
  const hipsOffset: [number, number, number] = [
    offA[0] + (offB[0] - offA[0]) * clampedT,
    offA[1] + (offB[1] - offA[1]) * clampedT,
    offA[2] + (offB[2] - offA[2]) * clampedT,
  ];

  const rotations: Record<string, [number, number, number, number]> = {};
  const allBones = new Set([...Object.keys(poseA.rotations), ...Object.keys(poseB.rotations)]);

  for (const b of allBones) {
    const qA = poseA.rotations[b] ? new THREE.Quaternion(...poseA.rotations[b]) : new THREE.Quaternion();
    const qB = poseB.rotations[b] ? new THREE.Quaternion(...poseB.rotations[b]) : new THREE.Quaternion();
    const qBlended = qA.slerp(qB, clampedT);
    rotations[b] = [qBlended.x, qBlended.y, qBlended.z, qBlended.w];
  }

  return { hipsOffset, rotations };
}

export interface MotionCompileOptions {
  startPosition?: [number, number] | Point2D;
  startHeadingDeg?: number;
  shotDurationSec?: number;
  fps?: number;
}

function toCoord2D(p: any): [number, number] {
  if (Array.isArray(p)) return [Number(p[0]) || 0, Number(p[1]) || 0];
  if (p && typeof p === 'object') return [Number(p.x) || 0, Number(p.y) || 0];
  return [0, 0];
}

/**
 * Compiles a plan of motion skills into a continuous, foot-locked motion timeline.
 */
export function compileMotionPlan(
  plan: MotionPlan,
  optionsOrPos?: MotionCompileOptions | [number, number] | Point2D,
  initialHeading: number = 0,
  defaultFps: number = 24
): MotionCompilationResult {
  let initialPosition: [number, number] = [0, 0];
  let currentHeading = initialHeading;
  let fps = defaultFps;
  let overrideDuration: number | undefined;

  if (optionsOrPos && typeof optionsOrPos === 'object' && ('startPosition' in optionsOrPos || 'shotDurationSec' in optionsOrPos || 'fps' in optionsOrPos)) {
    const opts = optionsOrPos as MotionCompileOptions;
    if (opts.startPosition) initialPosition = toCoord2D(opts.startPosition);
    if (opts.startHeadingDeg !== undefined) currentHeading = opts.startHeadingDeg;
    if (opts.fps !== undefined) fps = opts.fps;
    if (opts.shotDurationSec !== undefined) overrideDuration = opts.shotDurationSec;
  } else if (optionsOrPos) {
    initialPosition = toCoord2D(optionsOrPos);
  }

  const sortedSkills = [...plan.skills].sort((a, b) => a.startTimeSec - b.startTimeSec);
  const totalDuration = overrideDuration || Math.max(
    plan.totalDurationSec || 0,
    sortedSkills.reduce((acc, s) => Math.max(acc, s.startTimeSec + (s.durationSec || DEFAULT_SKILL_DURATIONS[s.skill])), 0)
  );

  const totalFrames = Math.max(1, Math.round(totalDuration * fps));
  const frames: CompiledMotionFrame[] = [];

  // Pre-calculate path segments for each skill
  let cursor = [...initialPosition] as [number, number];
  const skillPaths = new Map<string, { start: [number, number]; end: [number, number] }>();

  for (const skill of sortedSkills) {
    const start = [...cursor] as [number, number];
    let end = [...cursor] as [number, number];
    if (skill.skill === 'walkTo') {
      end = toCoord2D(skill.args.to);
      cursor = [...end];
    }
    skillPaths.set(skill.id, { start, end });
  }

  for (let f = 0; f <= totalFrames; f++) {
    const timeSec = f / fps;

    // Find active skill at timeSec
    let activeSkill: MotionSkillInvocation | undefined;
    for (let i = sortedSkills.length - 1; i >= 0; i--) {
      const s = sortedSkills[i];
      const dur = s.durationSec || DEFAULT_SKILL_DURATIONS[s.skill];
      if (timeSec >= s.startTimeSec && timeSec <= s.startTimeSec + dur) {
        activeSkill = s;
        break;
      }
    }

    if (!activeSkill && sortedSkills.length > 0) {
      if (timeSec < sortedSkills[0].startTimeSec) {
        activeSkill = sortedSkills[0];
      } else {
        activeSkill = sortedSkills[sortedSkills.length - 1];
      }
    }

    const currentSkillPath = activeSkill ? skillPaths.get(activeSkill.id) : undefined;
    const activeSkillPos = currentSkillPath ? currentSkillPath.start : cursor;

    let framePose: ActorPose = clonePose('standing_neutral');
    let frameGait: 'walk' | 'run' | 'sneak' | 'idle' | 'none' = 'idle';
    let cueLabel: string | undefined = activeSkill?.skill;
    let ikTargets: ActorIKTargets | undefined;
    let isLeftPlanted = true;
    let isRightPlanted = true;

    if (!activeSkill) {
      // Default idle standing frame
      frames.push({
        timeSec,
        position: [...cursor],
        headingDeg: currentHeading,
        pose: framePose,
        gait: 'idle',
        cueLabel: 'standIdle',
        isFootPlanted: { left: true, right: true },
      });
      continue;
    }

    const skillStart = activeSkill.startTimeSec;
    const skillDur = activeSkill.durationSec || DEFAULT_SKILL_DURATIONS[activeSkill.skill];
    const skillProgress = Math.max(0, Math.min(1, (timeSec - skillStart) / Math.max(0.01, skillDur)));

    switch (activeSkill.skill) {
      case 'walkTo': {
        const path = currentSkillPath || { start: initialPosition, end: toCoord2D(activeSkill.args.to) };
        const dx = path.end[0] - path.start[0];
        const dz = path.end[1] - path.start[1];
        const dist = Math.hypot(dx, dz);

        // Turn towards target
        const targetHeading = activeSkill.args.heading !== undefined
          ? activeSkill.args.heading
          : (dist > 0.01 ? Math.atan2(dx, dz) * RAD2DEG : currentHeading);
        currentHeading = targetHeading;

        // Smooth locomotion interpolation with Foot-Grounding Locks
        const stepPeriodSec = 0.65; // ~1.5 Hz walk cycle
        const cycleProgress = (timeSec - skillStart) / stepPeriodSec;
        const stepPhase = (cycleProgress % 1.0) * Math.PI * 2; // 0..2PI

        // Foot stance alternating phases:
        // Left foot swings when sin(stepPhase) > 0, planted when <= 0
        isLeftPlanted = Math.sin(stepPhase) <= 0.15;
        isRightPlanted = Math.sin(stepPhase) >= -0.15;

        // Calculate progress along path
        const walkProgress = skillProgress;
        const interpX = path.start[0] + dx * walkProgress;
        const interpZ = path.start[1] + dz * walkProgress;

        // Pelvic vertical bobbing & lateral weight sway
        const pelvicBob = Math.sin(stepPhase * 2) * 0.025;
        const pelvicSway = Math.sin(stepPhase) * 0.018;

        // Arm counter-swing
        const armSwingDeg = Math.sin(stepPhase) * 22;

        framePose = clonePose('standing_neutral');
        framePose.hipsOffset = [pelvicSway, pelvicBob, 0];

        // Opposing arm counter-swing
        framePose.rotations['LeftArm'] = eulerToQuat(-armSwingDeg, 0, 8);
        framePose.rotations['RightArm'] = eulerToQuat(armSwingDeg, 0, -8);

        // Leg swing rotations
        const legSwingDeg = Math.sin(stepPhase) * 25;
        framePose.rotations['LeftUpLeg'] = eulerToQuat(legSwingDeg, 0, 0);
        framePose.rotations['RightUpLeg'] = eulerToQuat(-legSwingDeg, 0, 0);
        framePose.rotations['LeftLeg'] = eulerToQuat(Math.max(0, -legSwingDeg * 0.8), 0, 0);
        framePose.rotations['RightLeg'] = eulerToQuat(Math.max(0, legSwingDeg * 0.8), 0, 0);

        frameGait = 'walk';
        frames.push({
          timeSec,
          position: [interpX, interpZ],
          headingDeg: currentHeading,
          pose: framePose,
          gait: frameGait,
          cueLabel: `walkTo (${Math.round(walkProgress * 100)}%)`,
          isFootPlanted: { left: isLeftPlanted, right: isRightPlanted },
        });

        continue;
      }

      case 'sitInSeat': {
        const standPose = clonePose('standing_neutral');
        const sitPose = clonePose('sitting_chair');
        // Smooth ease-in-out transition into seat
        const ease = skillProgress * skillProgress * (3 - 2 * skillProgress);
        framePose = blendPoses(standPose, sitPose, ease);
        frameGait = 'none';

        // Ground feet firmly in front of chair
        isLeftPlanted = true;
        isRightPlanted = true;
        cueLabel = 'sitInSeat';
        break;
      }

      case 'reachGrip': {
        const args = activeSkill.args;
        framePose = clonePose('standing_neutral');
        const targetPoint = toCoord3D(args.target, [activeSkillPos[0], 1.0, activeSkillPos[1] + 0.5]);

        // Calculate reach IK target
        const reachDur = args.reachSec || 0.6;
        const holdDur = args.holdSec || 0.8;
        const reachPhase = timeSec - skillStart;

        let ikWeight = 0;
        if (reachPhase < reachDur) {
          ikWeight = reachPhase / reachDur;
        } else if (reachPhase < reachDur + holdDur) {
          ikWeight = 1.0;
        } else {
          const relDur = args.releaseSec || 0.4;
          const relPhase = reachPhase - (reachDur + holdDur);
          ikWeight = Math.max(0, 1.0 - relPhase / Math.max(0.01, relDur));
        }

        ikTargets = {};
        if (args.hand === 'left') {
          ikTargets.leftHand = {
            position: [targetPoint[0], targetPoint[1], targetPoint[2]],
            weight: ikWeight,
          };
          framePose.rotations['LeftArm'] = eulerToQuat(-45 * ikWeight, 15 * ikWeight, 10);
        } else {
          ikTargets.rightHand = {
            position: [targetPoint[0], targetPoint[1], targetPoint[2]],
            weight: ikWeight,
          };
          framePose.rotations['RightArm'] = eulerToQuat(-45 * ikWeight, -15 * ikWeight, -10);
        }

        frameGait = 'idle';
        cueLabel = `reachGrip (${args.hand})`;
        break;
      }

      case 'talkGesture': {
        const args = activeSkill.args;
        const intensity = args.intensity || 0.7;
        framePose = clonePose('talking_expressive');

        // Dynamic organic gesture oscillation
        const gestPhase = (timeSec - skillStart) * 3.5;
        const armLift = Math.sin(gestPhase) * 15 * intensity;
        const headTilt = Math.sin(gestPhase * 0.7) * 8 * intensity;

        framePose.rotations['RightArm'] = eulerToQuat(-25 + armLift, -15, -12);
        framePose.rotations['LeftArm'] = eulerToQuat(-15 - armLift * 0.5, 10, 10);
        framePose.rotations['Head'] = eulerToQuat(headTilt * 0.5, headTilt, 0);

        frameGait = 'idle';
        cueLabel = 'talkGesture';
        break;
      }

      case 'standIdle': {
        const args = activeSkill.args;
        const stance = args.stance || 'neutral';
        const presetName = stance === 'relaxed' ? 'standing_relaxed' : 'standing_neutral';
        framePose = clonePose(presetName);

        // Organic breathing micro-motion
        const breath = Math.sin((timeSec - skillStart) * 1.8) * 0.006;
        framePose.hipsOffset = [0, breath, 0];

        frameGait = 'idle';
        cueLabel = 'standIdle';
        break;
      }

      case 'hitReaction': {
        const args = activeSkill.args;
        const intensity = args.intensity || 0.8;
        framePose = clonePose('action_combat_ready');

        // Impulse recoil followed by recovery
        const impulse = Math.sin(skillProgress * Math.PI) * intensity;
        framePose.hipsOffset = [0, -0.05 * impulse, -0.15 * impulse];
        framePose.rotations['Spine'] = eulerToQuat(25 * impulse, 0, 0);

        frameGait = 'none';
        cueLabel = 'hitReaction';
        break;
      }

      case 'exitCar': {
        const sitPose = clonePose('sitting_chair');
        const standPose = clonePose('standing_neutral');
        const ease = skillProgress * skillProgress * (3 - 2 * skillProgress);
        framePose = blendPoses(sitPose, standPose, ease);
        frameGait = skillProgress > 0.7 ? 'walk' : 'none';
        cueLabel = 'exitCar';
        break;
      }
    }

    frames.push({
      timeSec,
      position: [activeSkillPos[0], activeSkillPos[1]],
      headingDeg: currentHeading,
      pose: framePose,
      ikTargets,
      gait: frameGait,
      cueLabel,
      isFootPlanted: { left: isLeftPlanted, right: isRightPlanted },
    });
  }

  // Downsample to high-level TrajectoryKeyframe records for useShotStore
  const keyframes: TrajectoryKeyframe[] = [];
  const keyInterval = Math.max(1, Math.round(fps * 0.5)); // keyframe every 0.5s or on skill boundary

  for (let i = 0; i < frames.length; i += keyInterval) {
    const f = frames[i];
    keyframes.push({
      id: `mkey_${Math.round(f.timeSec * 1000)}`,
      time: Number(f.timeSec.toFixed(2)),
      position: { x: Number(f.position[0].toFixed(3)), y: Number(f.position[1].toFixed(3)) },
      rotation: { x: 0, y: Number(f.headingDeg.toFixed(1)), z: 0 },
      pose: f.pose,
      gait: f.gait,
      cueLabel: f.cueLabel,
    });
  }

  // Ensure last frame is always included
  const lastF = frames[frames.length - 1];
  if (keyframes.length === 0 || keyframes[keyframes.length - 1].time < lastF.timeSec - 0.05) {
    keyframes.push({
      id: `mkey_${Math.round(lastF.timeSec * 1000)}`,
      time: Number(lastF.timeSec.toFixed(2)),
      position: { x: Number(lastF.position[0].toFixed(3)), y: Number(lastF.position[1].toFixed(3)) },
      rotation: { x: 0, y: Number(lastF.headingDeg.toFixed(1)), z: 0 },
      pose: lastF.pose,
      gait: lastF.gait,
      cueLabel: lastF.cueLabel,
    });
  }

  return {
    keyframes,
    frames,
    durationSec: totalDuration,
  };
}
