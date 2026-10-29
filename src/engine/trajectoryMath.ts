import * as THREE from 'three';
import { Point2D, Point3D, TrajectoryKeyframe, CameraKeyframe, ActorPose } from '../types/shotspec';

export interface TrajectoryData {
  startTimeSeconds?: number;
  startPosition: Point2D;
  endPosition: Point2D;
  keyframes?: TrajectoryKeyframe[];
}

export interface CameraTrajectoryData {
  startPosition: Point3D;
  endPosition: Point3D;
  keyframes?: CameraKeyframe[];
  type?: string;
}

/**
 * Calculates smoothly interpolated 2D/3D position along a trajectory with keyframes.
 */
export function interpolateTrajectoryPosition(
  trajectory: TrajectoryData,
  time: number,
  duration: number
): Point2D {
  const safeDuration = duration > 0 ? duration : 4.0;
  const clampedTime = Math.max(0, Math.min(safeDuration, time));
  const rawKeyframes = (trajectory.keyframes || []).filter(
    (k) => k.time > 0 && k.time < safeDuration
  );

  // If no intermediate keyframes, direct linear interpolation between start and end
  if (rawKeyframes.length === 0) {
    const ratio = clampedTime / safeDuration;
    return {
      x: trajectory.startPosition.x + (trajectory.endPosition.x - trajectory.startPosition.x) * ratio,
      y: trajectory.startPosition.y + (trajectory.endPosition.y - trajectory.startPosition.y) * ratio,
      z:
        (trajectory.startPosition.z ?? 0) +
        ((trajectory.endPosition.z ?? 0) - (trajectory.startPosition.z ?? 0)) * ratio,
    };
  }

  // Build sorted timeline waypoints: [Start at 0, ...keyframes, End at duration]
  const waypoints = [
    { time: 0, position: trajectory.startPosition },
    ...rawKeyframes.sort((a, b) => a.time - b.time),
    { time: safeDuration, position: trajectory.endPosition },
  ];

  // Find surrounding segment
  for (let i = 0; i < waypoints.length - 1; i++) {
    const wA = waypoints[i];
    const wB = waypoints[i + 1];
    if (clampedTime >= wA.time && clampedTime <= wB.time) {
      const segDuration = wB.time - wA.time;
      const ratio = segDuration > 0 ? (clampedTime - wA.time) / segDuration : 0;
      return {
        x: wA.position.x + (wB.position.x - wA.position.x) * ratio,
        y: wA.position.y + (wB.position.y - wA.position.y) * ratio,
        z:
          (wA.position.z ?? 0) +
          ((wB.position.z ?? 0) - (wA.position.z ?? 0)) * ratio,
      };
    }
  }

  return trajectory.endPosition;
}

/**
 * Evaluates a 3D Catmull-Rom spline segment across four control points at parameter t in [0, 1].
 * Uses standard Centripetal Catmull-Rom cubic basis equations to eliminate cusps and self-intersections.
 */
export function catmullRomInterpolate(
  p0: { x: number; y: number; z?: number },
  p1: { x: number; y: number; z?: number },
  p2: { x: number; y: number; z?: number },
  p3: { x: number; y: number; z?: number },
  t: number
): { x: number; y: number; z: number } {
  const z0 = p0.z ?? 50;
  const z1 = p1.z ?? 50;
  const z2 = p2.z ?? 50;
  const z3 = p3.z ?? 50;

  const t2 = t * t;
  const t3 = t2 * t;

  // Catmull-Rom cubic basis weights
  const b0 = -0.5 * t3 + t2 - 0.5 * t;
  const b1 = 1.5 * t3 - 2.5 * t2 + 1.0;
  const b2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
  const b3 = 0.5 * t3 - 0.5 * t2;

  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
    z: b0 * z0 + b1 * z1 + b2 * z2 + b3 * z3,
  };
}

/**
 * Calculates camera 3D position along its trajectory with keyframes, spline smoothing, and orbital adjustments.
 */
export function interpolateCameraPosition(
  cameraMovement: CameraTrajectoryData,
  time: number,
  duration: number,
  useSpline?: boolean
): { x: number; y: number; z: number } {
  const safeDuration = duration > 0 ? duration : 4.0;
  const clampedTime = Math.max(0, Math.min(safeDuration, time));
  const rawKeyframes = (cameraMovement.keyframes || []).filter(
    (k) => k.time > 0 && k.time < safeDuration
  );

  let stagePos: { x: number; y: number; z: number };

  if (rawKeyframes.length === 0) {
    const ratio = clampedTime / safeDuration;
    const start = cameraMovement.startPosition;
    const end = cameraMovement.endPosition;
    stagePos = {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
      z: (start.z ?? 50) + ((end.z ?? 50) - (start.z ?? 50)) * ratio,
    };
  } else if (useSpline && rawKeyframes.length >= 2) {
    stagePos = interpolateCameraSplinePosition(cameraMovement, clampedTime, safeDuration);
  } else {
    const waypoints = [
      { time: 0, position: cameraMovement.startPosition },
      ...rawKeyframes.sort((a, b) => a.time - b.time),
      { time: safeDuration, position: cameraMovement.endPosition },
    ];
    let found = false;
    stagePos = { x: 50, y: 85, z: 20 };
    for (let i = 0; i < waypoints.length - 1; i++) {
      const wA = waypoints[i];
      const wB = waypoints[i + 1];
      if (clampedTime >= wA.time && clampedTime <= wB.time) {
        const segDuration = wB.time - wA.time;
        const ratio = segDuration > 0 ? (clampedTime - wA.time) / segDuration : 0;
        stagePos = {
          x: wA.position.x + (wB.position.x - wA.position.x) * ratio,
          y: wA.position.y + (wB.position.y - wA.position.y) * ratio,
          z: (wA.position.z ?? 50) + ((wB.position.z ?? 50) - (wA.position.z ?? 50)) * ratio,
        };
        found = true;
        break;
      }
    }
    if (!found) {
      stagePos = {
        x: cameraMovement.endPosition.x,
        y: cameraMovement.endPosition.y,
        z: cameraMovement.endPosition.z ?? 50,
      };
    }
  }

  // Convert 0..100 stage coordinate space to -50..50 Three.js space
  let threeX = (stagePos.x - 50) * 1.0;
  let threeZ = (stagePos.y - 50) * 1.0;
  let threeY = (stagePos.z ?? 50) * 0.3;

  // Orbit adjustments if orbital trajectory
  if (cameraMovement.type === 'orbit-clockwise' || cameraMovement.type === 'orbit-counter-clockwise') {
    const ratio = clampedTime / safeDuration;
    const startX = (cameraMovement.startPosition.x - 50) * 1.0;
    const startZ = (cameraMovement.startPosition.y - 50) * 1.0;
    const angleOffset = (cameraMovement.type === 'orbit-clockwise' ? 1 : -1) * ratio * Math.PI * 1.2;
    const radius = Math.sqrt(startX * startX + startZ * startZ) || 30;
    const baseAngle = Math.atan2(startZ, startX);
    threeX = Math.cos(baseAngle + angleOffset) * radius;
    threeZ = Math.sin(baseAngle + angleOffset) * radius;
  }

  return { x: threeX, y: threeY, z: threeZ };
}

/**
 * High-precision Catmull-Rom spline evaluator across all camera waypoints.
 * Guarantees C1 continuity and smooth tangent acceleration without corner hitches.
 */
export function interpolateCameraSplinePosition(
  cameraMovement: CameraTrajectoryData,
  time: number,
  duration: number
): { x: number; y: number; z: number } {
  const safeDuration = duration > 0 ? duration : 4.0;
  const clampedTime = Math.max(0, Math.min(safeDuration, time));
  const rawKeyframes = (cameraMovement.keyframes || []).filter(
    (k) => k.time > 0 && k.time < safeDuration
  );

  const waypoints = [
    { time: 0, position: cameraMovement.startPosition },
    ...rawKeyframes.sort((a, b) => a.time - b.time),
    { time: safeDuration, position: cameraMovement.endPosition },
  ];

  const n = waypoints.length;
  if (n <= 1) {
    return {
      x: cameraMovement.startPosition.x,
      y: cameraMovement.startPosition.y,
      z: cameraMovement.startPosition.z ?? 50,
    };
  }
  if (n === 2) {
    const ratio = clampedTime / safeDuration;
    const pA = waypoints[0].position;
    const pB = waypoints[1].position;
    return {
      x: pA.x + (pB.x - pA.x) * ratio,
      y: pA.y + (pB.y - pA.y) * ratio,
      z: (pA.z ?? 50) + ((pB.z ?? 50) - (pA.z ?? 50)) * ratio,
    };
  }

  // Find segment [i, i+1]
  let segIdx = 0;
  for (let i = 0; i < n - 1; i++) {
    if (clampedTime >= waypoints[i].time && clampedTime <= waypoints[i + 1].time) {
      segIdx = i;
      break;
    }
  }

  const wA = waypoints[segIdx];
  const wB = waypoints[segIdx + 1];
  const segDuration = wB.time - wA.time;
  const t = segDuration > 0 ? (clampedTime - wA.time) / segDuration : 0;

  // Virtual control points for endpoints
  const p1 = wA.position;
  const p2 = wB.position;
  const p0 = segIdx > 0 ? waypoints[segIdx - 1].position : {
    x: p1.x - (p2.x - p1.x),
    y: p1.y - (p2.y - p1.y),
    z: (p1.z ?? 50) - ((p2.z ?? 50) - (p1.z ?? 50)),
  };
  const p3 = segIdx + 2 < n ? waypoints[segIdx + 2].position : {
    x: p2.x + (p2.x - p1.x),
    y: p2.y + (p2.y - p1.y),
    z: (p2.z ?? 50) + ((p2.z ?? 50) - (p1.z ?? 50)),
  };

  return catmullRomInterpolate(p0, p1, p2, p3, t);
}

/**
 * Computes the normalized camera forward tangent vector along the trajectory.
 */
export function computeCameraTangent(
  cameraMovement: CameraTrajectoryData,
  time: number,
  duration: number
): { x: number; y: number; z: number } {
  const dt = 0.05;
  const t0 = Math.max(0, time - dt);
  const t1 = Math.min(duration, time + dt);
  const p0 = interpolateCameraPosition(cameraMovement, t0, duration);
  const p1 = interpolateCameraPosition(cameraMovement, t1, duration);

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1.0;

  return { x: dx / len, y: dy / len, z: dz / len };
}

/**
 * Automatically records or updates a position at currentTime along a trajectory.
 * - Near start (t <= 0.15s): updates startPosition (and endPosition if object was static)
 * - Near end (t >= duration - 0.15s): updates endPosition
 * - Intermediate time: updates keyframe within 0.25s or creates a new keyframe
 */
export function recordTrajectoryPositionAtTime(
  trajectory: TrajectoryData,
  time: number,
  duration: number,
  newPosition: Point2D
): TrajectoryData & { startTimeSeconds: number } {
  const safeDuration = duration > 0 ? duration : 4.0;
  const clampedTime = Math.max(0, Math.min(safeDuration, time));
  const isAtStart = clampedTime <= 0.15;
  const isAtEnd = clampedTime >= safeDuration - 0.15;
  const startTimeSeconds = trajectory.startTimeSeconds ?? 0;

  // Check if static object (start === end and no keyframes)
  const isStatic =
    (!trajectory.keyframes || trajectory.keyframes.length === 0) &&
    trajectory.startPosition.x === trajectory.endPosition.x &&
    trajectory.startPosition.y === trajectory.endPosition.y &&
    (trajectory.startPosition.z ?? 0) === (trajectory.endPosition.z ?? 0);

  if (isAtStart) {
    if (isStatic) {
      // If object was static, moving it at start moves both start and end so it remains stationary
      return {
        ...trajectory,
        startTimeSeconds,
        startPosition: newPosition,
        endPosition: newPosition,
      };
    }
    return {
      ...trajectory,
      startTimeSeconds,
      startPosition: newPosition,
    };
  }

  if (isAtEnd) {
    return {
      ...trajectory,
      startTimeSeconds,
      endPosition: newPosition,
    };
  }

  // Middle of timeline: update existing keyframe if near, or insert new keyframe
  const currentKeyframes = [...(trajectory.keyframes || [])];
  const existingIdx = currentKeyframes.findIndex((k) => Math.abs(k.time - clampedTime) <= 0.25);

  if (existingIdx >= 0) {
    currentKeyframes[existingIdx] = {
      ...currentKeyframes[existingIdx],
      time: clampedTime,
      position: newPosition,
    };
  } else {
    currentKeyframes.push({
      id: `kf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      time: Number(clampedTime.toFixed(2)),
      position: newPosition,
    });
  }

  currentKeyframes.sort((a, b) => a.time - b.time);

  return {
    ...trajectory,
    startTimeSeconds,
    keyframes: currentKeyframes,
  };
}

/**
 * Spherical linear interpolation between two 19-bone humanoid actor poses.
 */
export function slerpActorPoses(poseA: ActorPose, poseB: ActorPose, t: number): ActorPose {
  const resultRotations: Record<string, [number, number, number, number]> = {};
  const allBones = new Set([...Object.keys(poseA.rotations || {}), ...Object.keys(poseB.rotations || {})]);

  const qA = new THREE.Quaternion();
  const qB = new THREE.Quaternion();

  for (const bName of allBones) {
    const rotA = poseA.rotations?.[bName] || [0, 0, 0, 1];
    const rotB = poseB.rotations?.[bName] || [0, 0, 0, 1];
    qA.set(rotA[0], rotA[1], rotA[2], rotA[3]);
    qB.set(rotB[0], rotB[1], rotB[2], rotB[3]);
    qA.slerp(qB, t);
    resultRotations[bName] = [qA.x, qA.y, qA.z, qA.w];
  }

  let hipsOffset: [number, number, number] | undefined;
  if (poseA.hipsOffset || poseB.hipsOffset) {
    const offA = poseA.hipsOffset || [0, 0, 0];
    const offB = poseB.hipsOffset || [0, 0, 0];
    hipsOffset = [
      offA[0] + (offB[0] - offA[0]) * t,
      offA[1] + (offB[1] - offA[1]) * t,
      offA[2] + (offB[2] - offA[2]) * t,
    ];
  }

  return {
    rotations: resultRotations,
    hipsOffset,
  };
}

export interface InterpolatedPoseResult {
  pose?: ActorPose;
  posePreset?: string;
  gait?: 'auto' | 'walk' | 'run' | 'sneak' | 'idle' | 'none';
  motionClip?: string;
  clipProgress?: number;
}

/**
 * Calculates smoothly interpolated bone pose for an actor along the timeline.
 * If claymationFps is provided (e.g. 12), time is quantized to stepped stop-motion intervals.
 */
export function interpolateActorPoseAtTime(
  trajectory: TrajectoryData,
  basePose: ActorPose | undefined,
  time: number,
  duration: number,
  options?: { claymationFps?: number }
): InterpolatedPoseResult {
  const safeDuration = duration > 0 ? duration : 4.0;
  let evalTime = Math.max(0, Math.min(safeDuration, time));

  // If stop-motion claymation cadence is active, quantize time to discrete steps
  if (options?.claymationFps && options.claymationFps > 0) {
    const step = 1 / options.claymationFps;
    evalTime = Math.floor(evalTime / step) * step;
  }

  // Evaluate active motionClip and its normalized [0..1] progress across contiguous keyframes
  const clipKfs = (trajectory.keyframes || [])
    .filter((k) => k.motionClip !== undefined)
    .sort((a, b) => a.time - b.time);
  let activeMotionClip: string | undefined;
  let activeClipProgress: number | undefined;

  if (clipKfs.length > 0) {
    // Find the clip segment spanning evalTime
    for (let i = 0; i < clipKfs.length; i++) {
      const kf = clipKfs[i];
      if (evalTime >= kf.time - 0.05) {
        activeMotionClip = kf.motionClip;
      }
    }
    if (!activeMotionClip && evalTime < clipKfs[0].time) {
      activeMotionClip = clipKfs[0].motionClip;
    }
    if (activeMotionClip) {
      const matching = clipKfs.filter((k) => k.motionClip === activeMotionClip);
      if (matching.length >= 2) {
        const segStart = matching[0].time;
        const segEnd = matching[matching.length - 1].time;
        const span = Math.max(0.1, segEnd - segStart);
        activeClipProgress = Math.max(0, Math.min(1, (evalTime - segStart) / span));
      } else {
        activeClipProgress = safeDuration > 0 ? Math.max(0, Math.min(1, evalTime / safeDuration)) : 0;
      }
    }
  }

  const kfs = (trajectory.keyframes || [])
    .filter((k) => k.pose !== undefined || k.posePreset !== undefined || k.gait !== undefined)
    .sort((a, b) => a.time - b.time);

  if (kfs.length === 0) {
    return { pose: basePose, motionClip: activeMotionClip, clipProgress: activeClipProgress };
  }

  if (kfs.length === 1) {
    return {
      pose: kfs[0].pose || basePose,
      posePreset: kfs[0].posePreset,
      gait: kfs[0].gait,
      motionClip: activeMotionClip,
      clipProgress: activeClipProgress,
    };
  }

  // Before first pose keyframe: blend from basePose if at time > 0, or hold first
  if (evalTime <= kfs[0].time) {
    if (basePose && kfs[0].pose && kfs[0].time > 0) {
      const ratio = evalTime / kfs[0].time;
      return {
        pose: slerpActorPoses(basePose, kfs[0].pose, ratio),
        posePreset: ratio >= 0.5 ? kfs[0].posePreset : undefined,
        gait: kfs[0].gait,
        motionClip: activeMotionClip,
        clipProgress: activeClipProgress,
      };
    }
    return {
      pose: kfs[0].pose || basePose,
      posePreset: kfs[0].posePreset,
      gait: kfs[0].gait,
      motionClip: activeMotionClip,
      clipProgress: activeClipProgress,
    };
  }

  // After last pose keyframe: hold last pose
  if (evalTime >= kfs[kfs.length - 1].time) {
    const last = kfs[kfs.length - 1];
    return {
      pose: last.pose || basePose,
      posePreset: last.posePreset,
      gait: last.gait,
      motionClip: activeMotionClip,
      clipProgress: activeClipProgress,
    };
  }

  // Between two pose keyframes: SLERP bone quaternions
  for (let i = 0; i < kfs.length - 1; i++) {
    const kA = kfs[i];
    const kB = kfs[i + 1];
    if (evalTime >= kA.time && evalTime <= kB.time) {
      const segSpan = kB.time - kA.time;
      const t = segSpan > 0 ? (evalTime - kA.time) / segSpan : 0;
      const poseA = kA.pose || basePose;
      const poseB = kB.pose || basePose;
      if (!poseA)
        return {
          pose: poseB,
          posePreset: kB.posePreset,
          gait: kB.gait,
          motionClip: activeMotionClip,
          clipProgress: activeClipProgress,
        };
      if (!poseB)
        return {
          pose: poseA,
          posePreset: kA.posePreset,
          gait: kA.gait,
          motionClip: activeMotionClip,
          clipProgress: activeClipProgress,
        };

      return {
        pose: slerpActorPoses(poseA, poseB, t),
        posePreset: t > 0.5 ? kB.posePreset : kA.posePreset,
        gait: t > 0.5 ? kB.gait : kA.gait,
        motionClip: activeMotionClip,
        clipProgress: activeClipProgress,
      };
    }
  }

  return { pose: basePose, motionClip: activeMotionClip, clipProgress: activeClipProgress };
}

/**
 * Calculates interpolated 3D orientation (Yaw, Pitch, Roll) for props, vehicles, or non-human objects.
 */
export function interpolateObjectRotationAtTime(
  trajectory: TrajectoryData,
  baseRotation: Point3D | undefined,
  time: number,
  duration: number
): Point3D {
  const safeDuration = duration > 0 ? duration : 4.0;
  const clampedTime = Math.max(0, Math.min(safeDuration, time));
  const kfs = (trajectory.keyframes || [])
    .filter((k) => k.rotation !== undefined)
    .sort((a, b) => a.time - b.time);

  const defaultRot: Point3D = baseRotation || { x: 0, y: 0, z: 0 };
  if (kfs.length === 0) return defaultRot;
  if (kfs.length === 1) return kfs[0].rotation || defaultRot;
  if (clampedTime <= kfs[0].time) return kfs[0].rotation || defaultRot;
  if (clampedTime >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].rotation || defaultRot;

  for (let i = 0; i < kfs.length - 1; i++) {
    const kA = kfs[i];
    const kB = kfs[i + 1];
    if (clampedTime >= kA.time && clampedTime <= kB.time) {
      const segSpan = kB.time - kA.time;
      const t = segSpan > 0 ? (clampedTime - kA.time) / segSpan : 0;
      const rotA = kA.rotation || defaultRot;
      const rotB = kB.rotation || defaultRot;
      return {
        x: rotA.x + (rotB.x - rotA.x) * t,
        y: rotA.y + (rotB.y - rotA.y) * t,
        z: (rotA.z ?? 0) + ((rotB.z ?? 0) - (rotA.z ?? 0)) * t,
      };
    }
  }

  return defaultRot;
}

/**
 * Records an actor pose into the trajectory at time t. If an existing keyframe is near t, updates it.
 */
export function recordTrajectoryPoseAtTime(
  trajectory: TrajectoryData,
  time: number,
  duration: number,
  pose?: ActorPose,
  posePreset?: string,
  gait?: 'auto' | 'walk' | 'run' | 'sneak' | 'idle' | 'none'
): TrajectoryData {
  const safeDuration = duration > 0 ? duration : 4.0;
  const clampedTime = Math.max(0, Math.min(safeDuration, time));
  const currentKeyframes = [...(trajectory.keyframes || [])];
  const existingIdx = currentKeyframes.findIndex((k) => Math.abs(k.time - clampedTime) <= 0.25);

  const currentPos = interpolateTrajectoryPosition(trajectory, clampedTime, safeDuration);

  if (existingIdx >= 0) {
    currentKeyframes[existingIdx] = {
      ...currentKeyframes[existingIdx],
      time: clampedTime,
      pose: pose ?? currentKeyframes[existingIdx].pose,
      posePreset: posePreset ?? currentKeyframes[existingIdx].posePreset,
      gait: gait ?? currentKeyframes[existingIdx].gait,
    };
  } else {
    currentKeyframes.push({
      id: `kf_pose_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      time: Number(clampedTime.toFixed(2)),
      position: currentPos,
      pose,
      posePreset,
      gait,
    });
  }

  currentKeyframes.sort((a, b) => a.time - b.time);
  return {
    ...trajectory,
    startTimeSeconds: trajectory.startTimeSeconds ?? 0,
    keyframes: currentKeyframes,
  };
}

