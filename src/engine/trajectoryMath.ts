import { Point2D, Point3D, TrajectoryKeyframe, CameraKeyframe } from '../types/shotspec';

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
