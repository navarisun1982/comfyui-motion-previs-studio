import * as THREE from 'three';
import { FocalLength, ShotSpec } from '../types/shotspec';
import {
  interpolateCameraPosition,
  interpolateObjectRotationAtTime,
  interpolateTrajectoryPosition,
} from './trajectoryMath';

export type ActorSpec = ShotSpec['actors'][number];

const FOV_MAP: Record<FocalLength, number> = {
  '12mm': 122,
  '14mm': 114,
  '40mm': 56,
  '70mm': 34,
  '100mm': 24,
  '200mm': 12,
  '18mm': 100,
  '24mm': 84,
  '35mm': 63,
  '50mm': 47,
  '85mm': 28,
  '135mm': 18,
};

export function computeCameraFovDeg(lens: {
  focalLength: FocalLength;
  customFocalLengthMm?: number;
  sensorSize?: string;
}): number {
  const mm = lens.customFocalLengthMm ?? (parseInt(lens.focalLength, 10) || 35);
  const sensorWidthMm =
    lens.sensorSize === 'imax-65mm'
      ? 52.5
      : lens.sensorSize === 'anamorphic' || lens.sensorSize === 'anamorphic-2x'
      ? 44.0
      : lens.sensorSize === 'super35' || lens.sensorSize === 'super-35'
      ? 24.89
      : lens.sensorSize === 'micro-four-thirds'
      ? 17.3
      : 36.0;
  if (!lens.customFocalLengthMm && (!lens.sensorSize || lens.sensorSize === 'full-frame')) {
    return FOV_MAP[lens.focalLength] || 63;
  }
  const fovRad = 2 * Math.atan(sensorWidthMm / (2 * Math.max(8, mm)));
  return Math.max(8, Math.min(135, Math.round((fovRad * 180) / Math.PI)));
}

export type BeatPhase = 'open' | 'mid' | 'close';
export type HorizontalScreenZone = 'screen-left' | 'center-frame' | 'screen-right';
export type DepthScreenZone = 'close foreground' | 'midground' | 'distant background';
export type SubjectFrameCoverage = 'full-body' | 'waist-up medium' | 'close-up head-and-shoulders';
export type SubjectViewOrientation =
  | 'front-facing view (facing toward the camera)'
  | 'front-right three-quarter view'
  | 'right-facing side profile (pointing screen-right)'
  | 'rear-right three-quarter view'
  | 'rear view (seen from behind, facing away from the camera)'
  | 'rear-left three-quarter view'
  | 'left-facing side profile (pointing screen-left)'
  | 'front-left three-quarter view';

export type SubjectElevationState = 'grounded' | 'low-air' | 'high-air';

export interface ActorBeatPovState {
  visible: boolean;
  horizontalZone: HorizontalScreenZone;
  depthZone: DepthScreenZone;
  /** Combined camera-relative screen zone, e.g. "screen-left midground" */
  screenZone: string;
  coverage: SubjectFrameCoverage;
  distanceMeters: number;
  avgNdcX: number;
  avgNdcY: number;
  /** Maximum NDC screen span (width or height in [0..2] normalized device coordinates) */
  ndcSpan: number;
  /** Camera-relative subject orientation in 3D view space */
  viewOrientation: SubjectViewOrientation;
  /** Concise camera-relative orientation phrase */
  viewOrientationShort: string;
  /** Ground clearance / altitude in meters at the start of the beat */
  startAltitudeMeters: number;
  /** Ground clearance / altitude in meters at the end of the beat */
  endAltitudeMeters: number;
  /** Average ground clearance / altitude in meters across the beat */
  altitudeMeters: number;
  /** Elevation classification ('grounded' | 'low-air' | 'high-air') */
  elevationState: SubjectElevationState;
  /** Descriptive phrase for initial elevation / ground contact */
  elevationPhrase: string;
  /** Descriptive phrase for vertical trajectory across the beat (liftoff, climb, descent, landing, or level) */
  verticalMotionPhrase: string;
  /** Descriptive phrase for camera-relative horizontal/depth travel across the beat */
  cameraRelativeMotionPhrase: string;
}

export interface ActorPovAnalysis {
  actor: ActorSpec;
  actorId: string;
  everVisible: boolean;
  visibleInAllBeats: boolean;
  visibleInBeats: Record<BeatPhase, boolean>;
  beats: Record<BeatPhase, ActorBeatPovState>;
  firstVisibleBeat: BeatPhase | null;
  lastVisibleBeat: BeatPhase | null;
  /** Primary camera-relative horizontal zone when first visible */
  primaryHorizontalZone: HorizontalScreenZone;
  /** Primary camera-relative screen zone when first visible */
  primaryScreenZone: string;
  /** True if the actor moves significantly in 3D space (X, Y, or Z) or rotates across any beat */
  has3DDisplacement: boolean;
  /** Total 3D path length in meters across the shot timeline */
  totalPathLengthMeters: number;
  /** Overall orientation transition summary if the viewing angle changes across the shot */
  orientationTransitionSummary: string;
}

export interface CameraKinematicsSummary {
  /** True when the user manually moved or keyframed the camera in 3D space, overriding the preset name */
  isCustomCameraTrajectory: boolean;
  /** Overall natural-language description of the camera's true 3D movement across the shot */
  overallDescription: string;
  /** Per-beat natural-language camera action descriptions */
  beatDescriptions: Record<BeatPhase, string>;
  /** Total 3D camera travel distance in meters */
  totalDistanceMeters: number;
  /** Total orbital azimuth sweep around the focal target in degrees (positive = counter-clockwise, negative = clockwise) */
  orbitSweepDeg: number;
  /** Net radial distance change toward/away from the focal target in meters (negative = push in, positive = pull out) */
  radialDeltaMeters: number;
  /** Net vertical elevation change in meters */
  verticalDeltaMeters: number;
}

export interface ShotPovVisibilityReport {
  /** Actors that appear in the camera POV at any point during the shot */
  visibleActors: ActorSpec[];
  /** Actors that never enter the camera POV during the entire shot */
  offScreenActors: ActorSpec[];
  /** Detailed per-actor POV analysis keyed by actor.id */
  byActorId: Record<string, ActorPovAnalysis>;
  /** Ordered list of analyses for visible actors only */
  visibleAnalyses: ActorPovAnalysis[];
  /** True when 0 actors are visible across the entire shot duration */
  isPureEnvironmentalShot: boolean;
  /** True 3D camera kinematics and perspective transitions measured directly from the camera transform */
  cameraKinematics: CameraKinematicsSummary;
  /** Dynamic keyframe-aligned temporal beat boundaries (`[0, t1, t2, duration]`) */
  beatBreakpoints: {
    t1: number;
    t2: number;
    duration: number;
  };
}

function getAspectRatioValue(aspectRatio?: string): number {
  switch (aspectRatio) {
    case '9:16':
      return 9 / 16;
    case '21:9':
    case '2.39:1':
      return 21 / 9;
    case '4:3':
      return 4 / 3;
    case '1:1':
      return 1.0;
    case '16:9':
    default:
      return 16 / 9;
  }
}

/**
 * Configures a THREE.PerspectiveCamera at timestamp `t` (in seconds) using the exact
 * mathematical transform as `StagePrevis3D.tsx` (`vfCameraRef`).
 */
export function configurePovCameraAtTime(
  camera: THREE.PerspectiveCamera,
  shot: ShotSpec,
  t: number
): void {
  const duration = Math.max(0.5, shot.durationSeconds || 5);
  const ratio = Math.max(0, Math.min(1, t / duration));
  const aspect = getAspectRatioValue(shot.aspectRatio);

  // 1. Dynamic FOV (matches StagePrevis3D lines 1995-2019)
  const baseFov = computeCameraFovDeg(shot.camera.lens);
  let dynamicFov = baseFov;
  const moveType = shot.camera.movement.type;
  if (moveType === 'zoom-in') {
    dynamicFov = THREE.MathUtils.lerp(baseFov, Math.max(12, baseFov * 0.55), ratio);
  } else if (moveType === 'zoom-out') {
    dynamicFov = THREE.MathUtils.lerp(baseFov, Math.min(90, baseFov * 1.45), ratio);
  } else if (moveType === 'crash-zoom') {
    const fastRatio = Math.pow(ratio, 2.2);
    dynamicFov = THREE.MathUtils.lerp(baseFov, Math.max(10, baseFov * 0.38), fastRatio);
  } else if (moveType === 'dolly-zoom-vertigo') {
    dynamicFov = THREE.MathUtils.lerp(
      Math.max(18, baseFov * 0.65),
      Math.min(85, baseFov * 1.45),
      ratio
    );
  }

  camera.fov = dynamicFov;
  camera.aspect = aspect;
  camera.near = 0.1;
  camera.far = 400;
  camera.updateProjectionMatrix();

  // 2. Camera position (matches StagePrevis3D lines 1809-1818)
  const camPos = interpolateCameraPosition(shot.camera.movement, t, duration);
  let effectiveCamX = camPos.x;
  let effectiveCamY = camPos.y;
  let effectiveCamZ = camPos.z;
  if (shot.camera.angle === 'ground-level') {
    effectiveCamY = Math.min(camPos.y, 0.4);
  } else if (shot.camera.angle === 'overhead-gods-eye') {
    effectiveCamY = Math.max(camPos.y, 28);
  }

  // 3. Camera targetLookAt (matches StagePrevis3D lines 1799-1840)
  const baseLookAt = shot.camera.movement.targetLookAt ?? { x: 50, y: 50 };
  const camLookKfs = (shot.camera.movement.keyframes || [])
    .filter((k) => k.lookAt !== undefined && k.time >= 0 && k.time <= duration)
    .sort((a, b) => a.time - b.time);

  let lookAtCoord: { x: number; y: number; z?: number } = baseLookAt;
  if (camLookKfs.length > 0) {
    const lookWaypoints: Array<{ time: number; lookAt: { x: number; y: number; z?: number } }> = [];
    if (camLookKfs[0].time > 0.01) {
      lookWaypoints.push({ time: 0, lookAt: camLookKfs[0].lookAt! });
    }
    for (const kf of camLookKfs) {
      lookWaypoints.push({ time: kf.time, lookAt: kf.lookAt! });
    }
    if (lookWaypoints[lookWaypoints.length - 1].time < duration - 0.01) {
      lookWaypoints.push({ time: duration, lookAt: baseLookAt });
    }
    const clampedT = Math.max(0, Math.min(duration, t));
    if (clampedT <= lookWaypoints[0].time) {
      lookAtCoord = lookWaypoints[0].lookAt;
    } else if (clampedT >= lookWaypoints[lookWaypoints.length - 1].time) {
      lookAtCoord = lookWaypoints[lookWaypoints.length - 1].lookAt;
    } else {
      for (let i = 0; i < lookWaypoints.length - 1; i++) {
        const wA = lookWaypoints[i];
        const wB = lookWaypoints[i + 1];
        if (clampedT >= wA.time && clampedT <= wB.time) {
          const seg = wB.time - wA.time;
          const u = seg > 0 ? (clampedT - wA.time) / seg : 0;
          const smoothU = u * u * (3 - 2 * u);
          const zA = wA.lookAt.z ?? 50;
          const zB = wB.lookAt.z ?? 50;
          lookAtCoord = {
            x: wA.lookAt.x + (wB.lookAt.x - wA.lookAt.x) * smoothU,
            y: wA.lookAt.y + (wB.lookAt.y - wA.lookAt.y) * smoothU,
            z: zA + (zB - zA) * smoothU,
          };
          break;
        }
      }
    }
  }

  let targetX = (lookAtCoord.x - 50) * 1.0;
  let targetZ = (lookAtCoord.y - 50) * 1.0;
  const baseLookHeight =
    shot.camera.shotType === 'extreme-close-up'
      ? 4.48
      : shot.camera.shotType === 'close-up'
      ? 4.32
      : shot.camera.shotType === 'medium-close-up'
      ? 3.95
      : shot.camera.shotType === 'medium'
      ? 3.45
      : 2.85;
  let targetY =
    lookAtCoord.z !== undefined
      ? baseLookHeight + (lookAtCoord.z - 50) * 0.075
      : baseLookHeight;

  if (moveType === 'pan-left') {
    targetX += (0.5 - ratio) * 15;
  } else if (moveType === 'pan-right') {
    targetX += (ratio - 0.5) * 15;
  } else if (moveType === 'tilt-up') {
    targetY += (ratio - 0.5) * 8;
  } else if (moveType === 'tilt-down') {
    targetY += (0.5 - ratio) * 8;
  } else if (moveType === 'whip-pan') {
    targetX += Math.sin(ratio * Math.PI) * 20;
  }

  // 4. Track target actor override (matches StagePrevis3D lines 1871-1896)
  if (shot.camera.trackTargetActorId) {
    const trackedActor = shot.actors.find((a) => a.id === shot.camera.trackTargetActorId);
    if (trackedActor) {
      const trackedStartTime = trackedActor.trajectory?.startTimeSeconds ?? 0;
      const trackedEffectiveTime = Math.max(0, t - trackedStartTime);
      const tPos2d = interpolateTrajectoryPosition(
        trackedActor.trajectory,
        trackedEffectiveTime,
        duration
      );
      const tScale = trackedActor.scale ?? 1.0;
      const tX = (tPos2d.x - 50) * 1.0;
      const tZ = (tPos2d.y - 50) * 1.0;
      const tGroundY = (tPos2d.z ?? 0) * 0.3;
      const bone = shot.camera.trackTargetBone || 'head';
      const boneOffset =
        bone === 'head'
          ? 4.35 * tScale
          : bone === 'chest'
          ? 3.45 * tScale
          : bone === 'pelvis'
          ? 2.55 * tScale
          : 0.45 * tScale;
      targetX = tX;
      targetY = tGroundY + boneOffset;
      targetZ = tZ;

      if (shot.camera.followActorMovement || moveType === 'steadicam-follow') {
        const initPos = trackedActor.trajectory?.startPosition || { x: 50, y: 50, z: 0 };
        const deltaX = (tPos2d.x - initPos.x) * 1.0;
        const deltaZ = (tPos2d.y - initPos.y) * 1.0;
        const deltaY = ((tPos2d.z ?? 0) - (initPos.z ?? 0)) * 0.3;
        effectiveCamX += deltaX;
        effectiveCamZ += deltaZ;
        effectiveCamY += deltaY;
      }
    }
  }

  // 5. Angle elevation adjustments on lookAt target (matches StagePrevis3D lines 1899-1913)
  let effectiveTargetY = targetY + (shot.camera.lookAtHeightOffset ?? 0);
  if (shot.camera.angle === 'low-angle') {
    effectiveTargetY += 1.1;
  } else if (shot.camera.angle === 'ground-level') {
    effectiveTargetY += 1.4;
  } else if (shot.camera.angle === 'high-angle') {
    effectiveTargetY = Math.max(1.2, effectiveTargetY - 1.2);
  } else if (shot.camera.angle === 'overhead-gods-eye') {
    effectiveTargetY = 0.5;
  }

  // 6. Position + Orientation + Dutch Roll / Pitch / Yaw offsets (matches StagePrevis3D lines 1924-1940)
  const isDirectlyOverhead =
    shot.camera.angle === 'overhead-gods-eye' ||
    (Math.abs(effectiveCamX - targetX) < 0.1 && Math.abs(effectiveCamZ - targetZ) < 0.1);
  camera.position.set(effectiveCamX, effectiveCamY + 1.5, effectiveCamZ);
  if (isDirectlyOverhead) {
    camera.up.set(0, 0, -1);
  } else {
    camera.up.set(0, 1, 0);
  }
  camera.lookAt(targetX, effectiveTargetY, targetZ);

  const rollDeg =
    (shot.camera.dutchRollDeg ?? 0) +
    (shot.camera.angle === 'dutch-angle' ? -15 : 0) +
    (moveType === 'fpv-dive' ? Math.sin(ratio * Math.PI) * 18 : 0);
  const pitchDeg = shot.camera.pitchOffsetDeg || 0;
  const yawDeg = shot.camera.yawOffsetDeg || 0;

  if (yawDeg) camera.rotateY(THREE.MathUtils.degToRad(yawDeg));
  if (pitchDeg) camera.rotateX(THREE.MathUtils.degToRad(pitchDeg));
  if (rollDeg) camera.rotateZ(THREE.MathUtils.degToRad(rollDeg));

  camera.updateMatrixWorld(true);
}

interface ActorSamplePoint {
  tag: 'lower' | 'mid' | 'upper';
  worldPos: THREE.Vector3;
}

/**
 * Computes the 3D world-space position and altitude (ground clearance in meters) of an actor at time `t`.
 */
function getActorWorldPositionAtTime(
  actor: ActorSpec,
  shot: ShotSpec,
  t: number
): { x: number; y: number; z: number; altitudeMeters: number } {
  const duration = Math.max(0.5, shot.durationSeconds || 5);
  let baseActor = actor;
  let socketYOffset = 0;

  if (actor.socketToBone?.targetActorId) {
    const parent = shot.actors.find((a) => a.id === actor.socketToBone?.targetActorId);
    if (parent && parent.id !== actor.id) {
      baseActor = parent;
      const pScale = parent.scale ?? 1.0;
      const boneName = actor.socketToBone.boneName || 'hand_r';
      socketYOffset =
        boneName === 'head'
          ? 4.35 * pScale
          : boneName === 'chest' || boneName === 'spine'
          ? 3.45 * pScale
          : 2.65 * pScale;
    }
  }

  const startTime = baseActor.trajectory?.startTimeSeconds ?? 0;
  const effectiveTime = Math.max(0, t - startTime);
  const pos2d = interpolateTrajectoryPosition(baseActor.trajectory, effectiveTime, duration);

  const ax = (pos2d.x - 50) * 1.0;
  const az = (pos2d.y - 50) * 1.0;
  const ay = Math.max(0, (pos2d.z ?? 0) * 0.3 + socketYOffset);
  return { x: ax, y: ay, z: az, altitudeMeters: ay };
}

/**
 * Computes the actor's true 3D world-space forward unit vector at time `t`, matching StagePrevis3D.tsx
 * rotation and heading rules for all actor kinds (human, vehicle, animal, prop, architecture).
 */
function getActorWorldForwardAtTime(
  actor: ActorSpec,
  shot: ShotSpec,
  t: number
): THREE.Vector3 {
  const duration = Math.max(0.5, shot.durationSeconds || 5);
  const hasExplicitRot =
    actor.rotation !== undefined ||
    Boolean(actor.trajectory?.keyframes && actor.trajectory.keyframes.some((k) => k.rotation !== undefined));

  if (hasExplicitRot && actor.trajectory) {
    const objRot = interpolateObjectRotationAtTime(actor.trajectory, actor.rotation, t, duration);
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(objRot.x || 0),
      THREE.MathUtils.degToRad(objRot.y || 0),
      THREE.MathUtils.degToRad(objRot.z || 0),
      'XYZ'
    );
    return new THREE.Vector3(0, 0, 1).applyEuler(euler).normalize();
  }

  // Check instantaneous trajectory velocity tangent at time t
  if (actor.trajectory) {
    const dt = 0.12;
    const t0 = Math.max(0, t - dt);
    const t1 = Math.min(duration, t + dt);
    const p0 = interpolateTrajectoryPosition(actor.trajectory, t0, duration);
    const p1 = interpolateTrajectoryPosition(actor.trajectory, t1, duration);
    const vx = p1.x - p0.x;
    const vz = p1.y - p0.y;
    if (Math.hypot(vx, vz) > 0.25) {
      return new THREE.Vector3(vx, 0, vz).normalize();
    }

    const start = actor.trajectory.startPosition;
    const end = actor.trajectory.endPosition;
    const totalDx = end.x - start.x;
    const totalDz = end.y - start.y;
    if (Math.hypot(totalDx, totalDz) > 1.0) {
      return new THREE.Vector3(totalDx, 0, totalDz).normalize();
    }
  }

  // Default forward in Three.js stage space is +Z (facing downstage toward default camera)
  return new THREE.Vector3(0, 0, 1);
}

/**
 * Classifies an actor's 3D forward vector after projecting it into the camera's view space
 * (`camera.matrixWorldInverse` rotation).
 * In Three.js camera view space:
 * - `+X` is screen-right, `-X` is screen-left
 * - `+Y` is screen-up, `-Y` is screen-down
 * - `+Z` points toward the camera lens (front-facing), `-Z` points away from the camera into depth (rear view)
 */
function classifySubjectViewOrientation(viewForward: THREE.Vector3): {
  full: SubjectViewOrientation;
  short: string;
} {
  const horizLen = Math.hypot(viewForward.x, viewForward.z);
  if (horizLen < 0.001) {
    return {
      full: 'front-facing view (facing toward the camera)',
      short: 'front-facing view',
    };
  }
  // Angle in degrees where 0° = facing directly toward camera (+Z), +90° = facing screen-right (+X),
  // ±180° = facing directly away from camera (-Z), -90° = facing screen-left (-X)
  const deg = THREE.MathUtils.radToDeg(Math.atan2(viewForward.x, viewForward.z));

  if (deg >= -25 && deg <= 25) {
    return {
      full: 'front-facing view (facing toward the camera)',
      short: 'front-facing view',
    };
  }
  if (deg > 25 && deg <= 65) {
    return {
      full: 'front-right three-quarter view',
      short: 'front-right three-quarter view',
    };
  }
  if (deg > 65 && deg <= 115) {
    return {
      full: 'right-facing side profile (pointing screen-right)',
      short: 'right-facing side profile',
    };
  }
  if (deg > 115 && deg <= 155) {
    return {
      full: 'rear-right three-quarter view',
      short: 'rear-right three-quarter view',
    };
  }
  if (deg < -25 && deg >= -65) {
    return {
      full: 'front-left three-quarter view',
      short: 'front-left three-quarter view',
    };
  }
  if (deg < -65 && deg >= -115) {
    return {
      full: 'left-facing side profile (pointing screen-left)',
      short: 'left-facing side profile',
    };
  }
  if (deg < -115 && deg >= -155) {
    return {
      full: 'rear-left three-quarter view',
      short: 'rear-left three-quarter view',
    };
  }
  return {
    full: 'rear view (seen from behind, facing away from the camera)',
    short: 'rear view (seen from behind)',
  };
}

/**
 * Computes the 3D world-space sample points for an actor at time `t` (feet, knees, pelvis,
 * torso, chest, head, plus horizontal width offsets scaled by `actor.scale`).
 */
function getActorBoundingSamplePointsAtTime(
  actor: ActorSpec,
  shot: ShotSpec,
  t: number
): ActorSamplePoint[] {
  const pos = getActorWorldPositionAtTime(actor, shot, t);
  const ax = pos.x;
  const ay = pos.y;
  const az = pos.z;
  const scale = Math.max(0.15, actor.scale ?? 1.0);

  const kind = actor.kind || 'human';
  if (kind === 'vehicle') {
    const h = 2.4 * scale;
    const r = 2.2 * scale;
    return [
      { tag: 'lower', worldPos: new THREE.Vector3(ax, ay + 0.3 * scale, az) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax, ay + h * 0.5, az) },
      { tag: 'upper', worldPos: new THREE.Vector3(ax, ay + h, az) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax - r, ay + h * 0.5, az) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax + r, ay + h * 0.5, az) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax, ay + h * 0.5, az - r) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax, ay + h * 0.5, az + r) },
    ];
  }

  if (kind === 'architecture') {
    const h = 8.0 * scale;
    const r = 3.2 * scale;
    return [
      { tag: 'lower', worldPos: new THREE.Vector3(ax, ay + 0.5 * scale, az) },
      { tag: 'lower', worldPos: new THREE.Vector3(ax, ay + 2.5 * scale, az) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax, ay + h * 0.5, az) },
      { tag: 'upper', worldPos: new THREE.Vector3(ax, ay + h * 0.85, az) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax - r, ay + 3.0 * scale, az) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax + r, ay + 3.0 * scale, az) },
    ];
  }

  if (kind === 'prop' || kind === 'animal') {
    const h = (kind === 'animal' ? 2.2 : 1.8) * scale;
    const r = (kind === 'animal' ? 1.1 : 0.75) * scale;
    return [
      { tag: 'lower', worldPos: new THREE.Vector3(ax, ay + 0.2 * scale, az) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax, ay + h * 0.5, az) },
      { tag: 'upper', worldPos: new THREE.Vector3(ax, ay + h, az) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax - r, ay + h * 0.5, az) },
      { tag: 'mid', worldPos: new THREE.Vector3(ax + r, ay + h * 0.5, az) },
    ];
  }

  // Standard humanoid / character mannequin (stands from y = ay to y = ay + 4.8 * scale)
  const shoulderRadius = 0.85 * scale;
  return [
    // Lower body (feet, shins, knees)
    { tag: 'lower', worldPos: new THREE.Vector3(ax, ay + 0.2 * scale, az) },
    { tag: 'lower', worldPos: new THREE.Vector3(ax, ay + 0.85 * scale, az) },
    { tag: 'lower', worldPos: new THREE.Vector3(ax, ay + 1.5 * scale, az) },
    // Mid body (pelvis, waist, abdomen + hip width)
    { tag: 'mid', worldPos: new THREE.Vector3(ax, ay + 2.2 * scale, az) },
    { tag: 'mid', worldPos: new THREE.Vector3(ax, ay + 2.75 * scale, az) },
    { tag: 'mid', worldPos: new THREE.Vector3(ax - shoulderRadius * 0.8, ay + 2.55 * scale, az) },
    { tag: 'mid', worldPos: new THREE.Vector3(ax + shoulderRadius * 0.8, ay + 2.55 * scale, az) },
    // Upper body (chest, shoulders, neck, face, crown)
    { tag: 'upper', worldPos: new THREE.Vector3(ax, ay + 3.35 * scale, az) },
    { tag: 'upper', worldPos: new THREE.Vector3(ax, ay + 3.85 * scale, az) },
    { tag: 'upper', worldPos: new THREE.Vector3(ax, ay + 4.35 * scale, az) },
    { tag: 'upper', worldPos: new THREE.Vector3(ax, ay + 4.75 * scale, az) },
    { tag: 'upper', worldPos: new THREE.Vector3(ax - shoulderRadius, ay + 3.45 * scale, az) },
    { tag: 'upper', worldPos: new THREE.Vector3(ax + shoulderRadius, ay + 3.45 * scale, az) },
    { tag: 'upper', worldPos: new THREE.Vector3(ax, ay + 3.45 * scale, az - shoulderRadius) },
    { tag: 'upper', worldPos: new THREE.Vector3(ax, ay + 3.45 * scale, az + shoulderRadius) },
  ];
}

function classifyHorizontalZone(ndcX: number): HorizontalScreenZone {
  if (ndcX < -0.22) return 'screen-left';
  if (ndcX > 0.22) return 'screen-right';
  return 'center-frame';
}

/**
 * Classifies perceived depth zone using both optical screen coverage (`ndcSpan` in [0..2],
 * which automatically accounts for telephoto lens focal length like 70mm/85mm and `actor.scale`)
 * and physical distance (`distanceMeters`).
 */
function classifyDepthZone(distanceMeters: number, ndcSpan: number): DepthScreenZone {
  if (ndcSpan >= 0.62 || distanceMeters < 11.5) return 'close foreground';
  if (ndcSpan >= 0.22 || distanceMeters <= 24.0) return 'midground';
  return 'distant background';
}

function classifyElevationState(altitudeMeters: number): {
  state: SubjectElevationState;
  phrase: string;
} {
  if (altitudeMeters <= 0.35) {
    return { state: 'grounded', phrase: 'grounded on the surface' };
  }
  if (altitudeMeters <= 3.5) {
    return {
      state: 'low-air',
      phrase: `hovering low above the ground (~${altitudeMeters.toFixed(1)}m altitude)`,
    };
  }
  return {
    state: 'high-air',
    phrase: `airborne in mid-air (~${altitudeMeters.toFixed(1)}m altitude)`,
  };
}

/**
 * Evaluates a single actor's visibility, camera-relative screen framing, 3D orientation,
 * and altitude trajectory across a list of sample timestamps within a temporal beat (`open`, `mid`, or `close`).
 */
function evaluateActorBeatPov(
  actor: ActorSpec,
  shot: ShotSpec,
  camera: THREE.PerspectiveCamera,
  sampleTimes: number[]
): ActorBeatPovState {
  let visibleCount = 0;
  let sumNdcX = 0;
  let sumNdcY = 0;
  let sumDistance = 0;
  let sumNdcSpan = 0;
  let sumAltitude = 0;
  let sawLower = false;
  let sawMid = false;
  let sawUpper = false;

  const camLocalVec = new THREE.Vector3();
  const ndcVec = new THREE.Vector3();
  const viewForwardSum = new THREE.Vector3();
  const camRotInverse = new THREE.Matrix4();

  let firstVisibleNdcX: number | null = null;
  let lastVisibleNdcX: number | null = null;
  let firstVisibleDist: number | null = null;
  let lastVisibleDist: number | null = null;

  const tStart = sampleTimes[0] ?? 0;
  const tEnd = sampleTimes[sampleTimes.length - 1] ?? tStart;
  const startWorld = getActorWorldPositionAtTime(actor, shot, tStart);
  const endWorld = getActorWorldPositionAtTime(actor, shot, tEnd);

  for (const t of sampleTimes) {
    configurePovCameraAtTime(camera, shot, t);
    const samplePoints = getActorBoundingSamplePointsAtTime(actor, shot, t);
    const actorWorld = getActorWorldPositionAtTime(actor, shot, t);

    let frameVisiblePts = 0;
    let frameNdcX = 0;
    let frameNdcY = 0;
    let frameDist = 0;
    let minNdcX = Infinity;
    let maxNdcX = -Infinity;
    let minNdcY = Infinity;
    let maxNdcY = -Infinity;

    for (const pt of samplePoints) {
      camLocalVec.copy(pt.worldPos).applyMatrix4(camera.matrixWorldInverse);
      const distInFront = -camLocalVec.z;
      if (distInFront <= camera.near || distInFront >= camera.far) {
        continue;
      }

      ndcVec.copy(pt.worldPos).project(camera);
      // Slight 4% guard band at viewport border so characters brushing the frame edge aren't abruptly dropped
      if (Math.abs(ndcVec.x) <= 1.04 && Math.abs(ndcVec.y) <= 1.04) {
        frameVisiblePts++;
        frameNdcX += ndcVec.x;
        frameNdcY += ndcVec.y;
        frameDist += distInFront;
        if (ndcVec.x < minNdcX) minNdcX = ndcVec.x;
        if (ndcVec.x > maxNdcX) maxNdcX = ndcVec.x;
        if (ndcVec.y < minNdcY) minNdcY = ndcVec.y;
        if (ndcVec.y > maxNdcY) maxNdcY = ndcVec.y;
        if (pt.tag === 'lower') sawLower = true;
        if (pt.tag === 'mid') sawMid = true;
        if (pt.tag === 'upper') sawUpper = true;
      }
    }

    if (frameVisiblePts > 0) {
      visibleCount++;
      const meanX = frameNdcX / frameVisiblePts;
      const meanY = frameNdcY / frameVisiblePts;
      const meanDist = frameDist / frameVisiblePts;
      const spanX = Number.isFinite(maxNdcX - minNdcX) ? Math.max(0, maxNdcX - minNdcX) : 0;
      const spanY = Number.isFinite(maxNdcY - minNdcY) ? Math.max(0, maxNdcY - minNdcY) : 0;
      const frameSpan = Math.max(spanX, spanY);

      sumNdcX += meanX;
      sumNdcY += meanY;
      sumDistance += meanDist;
      sumNdcSpan += frameSpan;
      sumAltitude += actorWorld.altitudeMeters;

      if (firstVisibleNdcX === null) {
        firstVisibleNdcX = meanX;
        firstVisibleDist = meanDist;
      }
      lastVisibleNdcX = meanX;
      lastVisibleDist = meanDist;

      // Project actor's world forward vector into camera view space
      const worldForward = getActorWorldForwardAtTime(actor, shot, t);
      camRotInverse.extractRotation(camera.matrixWorldInverse);
      const viewForward = worldForward.clone().applyMatrix4(camRotInverse).normalize();
      viewForwardSum.add(viewForward);
    }
  }

  const startAlt = Number(startWorld.altitudeMeters.toFixed(2));
  const endAlt = Number(endWorld.altitudeMeters.toFixed(2));
  const deltaAlt = endAlt - startAlt;
  const startElev = classifyElevationState(startAlt);
  const endElev = classifyElevationState(endAlt);

  let verticalMotionPhrase = '';
  if (startElev.state === 'grounded' && endAlt >= 0.8) {
    verticalMotionPhrase = `lifts off from the ground and ascends upward into the air (reaching ~${endAlt.toFixed(1)}m altitude)`;
  } else if (startAlt >= 0.8 && endElev.state === 'grounded') {
    verticalMotionPhrase = `descends from mid-air and lands on the ground`;
  } else if (deltaAlt >= 0.8) {
    verticalMotionPhrase = `climbs higher in altitude (from ~${startAlt.toFixed(1)}m to ~${endAlt.toFixed(1)}m)`;
  } else if (deltaAlt <= -0.8) {
    verticalMotionPhrase = `descends downward in altitude (from ~${startAlt.toFixed(1)}m to ~${endAlt.toFixed(1)}m)`;
  }

  if (visibleCount === 0) {
    return {
      visible: false,
      horizontalZone: 'center-frame',
      depthZone: 'midground',
      screenZone: 'off-screen',
      coverage: 'full-body',
      distanceMeters: 0,
      avgNdcX: 0,
      avgNdcY: 0,
      ndcSpan: 0,
      viewOrientation: 'front-facing view (facing toward the camera)',
      viewOrientationShort: 'front-facing view',
      startAltitudeMeters: startAlt,
      endAltitudeMeters: endAlt,
      altitudeMeters: Number(((startAlt + endAlt) * 0.5).toFixed(2)),
      elevationState: startElev.state,
      elevationPhrase: startElev.phrase,
      verticalMotionPhrase,
      cameraRelativeMotionPhrase: '',
    };
  }

  const avgNdcX = sumNdcX / visibleCount;
  const avgNdcY = sumNdcY / visibleCount;
  const distanceMeters = sumDistance / visibleCount;
  const ndcSpan = sumNdcSpan / visibleCount;
  const altitudeMeters = sumAltitude / visibleCount;
  const horizontalZone = classifyHorizontalZone(avgNdcX);
  const depthZone = classifyDepthZone(distanceMeters, ndcSpan);

  const orient = classifySubjectViewOrientation(viewForwardSum.normalize());
  const avgElev = classifyElevationState(altitudeMeters);

  let cameraRelativeMotionPhrase = '';
  const ndcDeltaX =
    firstVisibleNdcX !== null && lastVisibleNdcX !== null ? lastVisibleNdcX - firstVisibleNdcX : 0;
  const distDelta =
    firstVisibleDist !== null && lastVisibleDist !== null ? lastVisibleDist - firstVisibleDist : 0;
  const relParts: string[] = [];
  if (ndcDeltaX >= 0.18) {
    relParts.push('moving toward screen-right');
  } else if (ndcDeltaX <= -0.18) {
    relParts.push('moving toward screen-left');
  }
  if (distDelta <= -2.2) {
    relParts.push('approaching closer to the camera');
  } else if (distDelta >= 2.2) {
    relParts.push('advancing deeper into the frame');
  }
  cameraRelativeMotionPhrase = relParts.join(' and ');

  let coverage: SubjectFrameCoverage = 'full-body';
  if (sawUpper && !sawLower) {
    coverage = sawMid ? 'waist-up medium' : 'close-up head-and-shoulders';
  } else if (distanceMeters < 6.0 || ndcSpan >= 1.15) {
    coverage = 'close-up head-and-shoulders';
  } else if ((distanceMeters < 10.5 || ndcSpan >= 0.78) && !sawLower) {
    coverage = 'waist-up medium';
  }

  return {
    visible: true,
    horizontalZone,
    depthZone,
    screenZone: `${horizontalZone} ${depthZone}`,
    coverage,
    distanceMeters: Number(distanceMeters.toFixed(2)),
    avgNdcX: Number(avgNdcX.toFixed(3)),
    avgNdcY: Number(avgNdcY.toFixed(3)),
    ndcSpan: Number(ndcSpan.toFixed(3)),
    viewOrientation: orient.full,
    viewOrientationShort: orient.short,
    startAltitudeMeters: startAlt,
    endAltitudeMeters: endAlt,
    altitudeMeters: Number(altitudeMeters.toFixed(2)),
    elevationState: avgElev.state,
    elevationPhrase: startElev.phrase,
    verticalMotionPhrase,
    cameraRelativeMotionPhrase,
  };
}

/**
 * Determines whether the camera trajectory was manually customized by the user in 2D/3D space
 * (via `customTrajectory`, intermediate keyframes, or geometric deviation from the selected preset).
 * Works retroactively even on legacy/saved shots where `customTrajectory` was not yet persisted.
 */
export function isCameraTrajectoryCustom(shot: ShotSpec): boolean {
  const mov = shot.camera.movement;
  if (mov.customTrajectory) return true;
  if (mov.keyframes && mov.keyframes.length > 0) return true;

  const start = {
    x: mov.startPosition.x,
    y: mov.startPosition.y,
    z: mov.startPosition.z ?? 20,
  };
  const end = {
    x: mov.endPosition.x,
    y: mov.endPosition.y,
    z: mov.endPosition.z ?? start.z,
  };
  const lookAt = mov.targetLookAt ?? { x: 50, y: 50 };

  let fX = lookAt.x - start.x;
  let fY = lookAt.y - start.y;
  const fLen = Math.hypot(fX, fY);
  if (fLen > 0.5) {
    fX /= fLen;
    fY /= fLen;
  } else {
    fX = 0;
    fY = -1;
  }
  const rX = -fY;
  const rY = fX;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const dist2D = Math.hypot(dx, dy);
  const forwardProj = dx * fX + dy * fY;
  const rightProj = dx * rX + dy * rY;

  const type = mov.type;
  if (
    type === 'static' ||
    type === 'pan-left' ||
    type === 'pan-right' ||
    type === 'tilt-up' ||
    type === 'tilt-down' ||
    type === 'whip-pan' ||
    type === 'rack-focus' ||
    type === 'handheld-subtle' ||
    type === 'zoom-in' ||
    type === 'zoom-out' ||
    type === 'crash-zoom'
  ) {
    return dist2D >= 1.5 || Math.abs(dz) >= 1.5;
  }
  if (type === 'dolly-in' || type === 'dolly-zoom-vertigo' || type === 'steadicam-follow') {
    return forwardProj <= 2.0 || Math.abs(rightProj) >= 2.0 || Math.abs(dz) >= 2.0;
  }
  if (type === 'dolly-out') {
    return forwardProj >= -2.0 || Math.abs(rightProj) >= 2.0 || Math.abs(dz) >= 2.0;
  }
  if (type === 'truck-left') {
    return rightProj >= -2.0 || Math.abs(forwardProj) >= 2.0 || Math.abs(dz) >= 2.0;
  }
  if (type === 'truck-right') {
    return rightProj <= 2.0 || Math.abs(forwardProj) >= 2.0 || Math.abs(dz) >= 2.0;
  }
  if (type === 'pedestal-up') {
    return dz <= 2.0 || dist2D >= 2.0;
  }
  if (type === 'pedestal-down') {
    return dz >= -2.0 || dist2D >= 2.0;
  }
  return false;
}

/**
 * Computes dynamic temporal beat boundaries (`[0, t1, t2, duration]`) driven by actual
 * camera and actor keyframe inflection timestamps so that user cues (e.g. a keyframe at `3.0s`
 * on a `5.0s` shot) form exact beat boundaries instead of splitting mid-beat.
 */
export function computeDynamicBeatBreakpoints(shot: ShotSpec): {
  t1: number;
  t2: number;
  duration: number;
} {
  const duration = Math.max(1.0, shot.durationSeconds || 5);
  const minBound = Number((duration * 0.16).toFixed(2));
  const maxBound = Number((duration * 0.84).toFixed(2));
  const minGap = Math.max(0.45, Number((duration * 0.16).toFixed(2)));

  const camTimes: number[] = [];
  for (const kf of shot.camera.movement.keyframes ?? []) {
    if (kf.time >= minBound && kf.time <= maxBound) {
      camTimes.push(Number(kf.time.toFixed(2)));
    }
  }
  camTimes.sort((a, b) => a - b);

  const actorTimes: number[] = [];
  for (const actor of shot.actors ?? []) {
    for (const kf of actor.trajectory.keyframes ?? []) {
      if (kf.time >= minBound && kf.time <= maxBound) {
        actorTimes.push(Number(kf.time.toFixed(2)));
      }
    }
  }
  actorTimes.sort((a, b) => a - b);

  // Merge with camera keyframes taking priority, deduplicating within 0.25s
  const cues: number[] = [];
  for (const t of [...camTimes, ...actorTimes]) {
    if (!cues.some((existing) => Math.abs(existing - t) < 0.25)) {
      cues.push(t);
    }
  }
  cues.sort((a, b) => a - b);

  let t1 = Number((duration * 0.35).toFixed(2));
  let t2 = Number((duration * 0.75).toFixed(2));

  if (cues.length === 1) {
    const c = cues[0];
    if (c <= duration * 0.5) {
      t1 = c;
      t2 = Number(Math.max(c + minGap, duration * 0.75).toFixed(2));
    } else {
      t2 = c;
      t1 = Number(Math.min(c - minGap, duration * 0.35).toFixed(2));
    }
  } else if (cues.length >= 2) {
    // Pick the pair (c1, c2) with c2 - c1 >= minGap closest to ideal (0.35, 0.72) split
    let bestPair: [number, number] | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < cues.length; i++) {
      for (let j = i + 1; j < cues.length; j++) {
        const c1 = cues[i];
        const c2 = cues[j];
        if (c2 - c1 < minGap) continue;
        const score =
          Math.abs(c1 - duration * 0.35) +
          Math.abs(c2 - duration * 0.72) -
          (camTimes.includes(c1) ? 0.35 : 0) -
          (camTimes.includes(c2) ? 0.35 : 0);
        if (score < bestScore) {
          bestScore = score;
          bestPair = [c1, c2];
        }
      }
    }
    if (bestPair) {
      [t1, t2] = bestPair;
    } else {
      const c = cues[cues.length - 1];
      if (c > duration * 0.5) {
        t2 = c;
        t1 = Number(Math.min(c - minGap, duration * 0.35).toFixed(2));
      } else {
        t1 = c;
        t2 = Number(Math.max(c + minGap, duration * 0.75).toFixed(2));
      }
    }
  }

  return { t1, t2, duration };
}

/**
 * Computes universal 3D camera kinematics across the shot and per temporal beat (`open`, `mid`, `close`)
 * directly from the evaluated Three.js camera matrices (`camera.position`, `camera.quaternion`, and focal target).
 * Works for all camera movements, manual 3D drags (`customTrajectory`), and multi-keyframe camera paths.
 */
function analyzeCamera3DKinematics(
  shot: ShotSpec,
  camera: THREE.PerspectiveCamera,
  visibleAnalyses: ActorPovAnalysis[],
  t1: number,
  t2: number,
  duration: number
): CameraKinematicsSummary {
  const isCustomCameraTrajectory = isCameraTrajectoryCustom(shot);

  // Focal reference target at time t (tracked actor -> primary visible actor -> stage lookAt target)
  const getFocalTargetAtTime = (t: number): THREE.Vector3 => {
    if (shot.camera.trackTargetActorId) {
      const tracked = shot.actors.find((a) => a.id === shot.camera.trackTargetActorId);
      if (tracked) {
        const w = getActorWorldPositionAtTime(tracked, shot, t);
        return new THREE.Vector3(w.x, w.y + 1.5, w.z);
      }
    }
    if (visibleAnalyses.length > 0) {
      const primary = visibleAnalyses[0].actor;
      const w = getActorWorldPositionAtTime(primary, shot, t);
      return new THREE.Vector3(w.x, w.y + 1.5, w.z);
    }
    const look = shot.camera.movement.targetLookAt || { x: 50, y: 50 };
    return new THREE.Vector3((look.x - 50) * 1.0, 2.5, (look.y - 50) * 1.0);
  };

  // Sample 13 timestamps across [0..duration] to measure true path length & orbital sweep
  const totalSamples = 12;
  let totalDistanceMeters = 0;
  let cumulativeOrbitRad = 0;
  let prevCamPos: THREE.Vector3 | null = null;
  let prevAzimuthRad: number | null = null;

  for (let i = 0; i <= totalSamples; i++) {
    const t = (i / totalSamples) * duration;
    configurePovCameraAtTime(camera, shot, t);
    const curPos = camera.position.clone();
    const target = getFocalTargetAtTime(t);
    const relX = curPos.x - target.x;
    const relZ = curPos.z - target.z;
    const azimuth = Math.atan2(relX, relZ);

    if (prevCamPos) {
      totalDistanceMeters += curPos.distanceTo(prevCamPos);
    }
    if (prevAzimuthRad !== null) {
      let dAngle = azimuth - prevAzimuthRad;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      cumulativeOrbitRad += dAngle;
    }
    prevCamPos = curPos;
    prevAzimuthRad = azimuth;
  }

  configurePovCameraAtTime(camera, shot, 0);
  const camStartPos = camera.position.clone();
  const targetStart = getFocalTargetAtTime(0);
  const startRadius = Math.hypot(camStartPos.x - targetStart.x, camStartPos.z - targetStart.z);

  configurePovCameraAtTime(camera, shot, duration);
  const camEndPos = camera.position.clone();
  const targetEnd = getFocalTargetAtTime(duration);
  const endRadius = Math.hypot(camEndPos.x - targetEnd.x, camEndPos.z - targetEnd.z);

  const radialDeltaMeters = endRadius - startRadius;
  const verticalDeltaMeters = camEndPos.y - camStartPos.y;
  const orbitSweepDeg = THREE.MathUtils.radToDeg(cumulativeOrbitRad);

  const describeInterval = (startT: number, endT: number, phase: BeatPhase): string => {
    configurePovCameraAtTime(camera, shot, startT);
    const p0 = camera.position.clone();
    const q0 = camera.quaternion.clone();
    const m0Inv = camera.matrixWorldInverse.clone();
    const targ0 = getFocalTargetAtTime(startT);
    const r0 = Math.hypot(p0.x - targ0.x, p0.z - targ0.z);

    configurePovCameraAtTime(camera, shot, endT);
    const p1 = camera.position.clone();
    const q1 = camera.quaternion.clone();
    const targ1 = getFocalTargetAtTime(endT);
    const r1 = Math.hypot(p1.x - targ1.x, p1.z - targ1.z);

    // Sub-sample 5 steps within [startT..endT] to capture curved/keyframed paths accurately
    let segDist = 0;
    let cumAzRad = 0;
    let prevP: THREE.Vector3 | null = null;
    let prevAz: number | null = null;
    for (let s = 0; s <= 4; s++) {
      const ts = startT + ((endT - startT) * s) / 4;
      configurePovCameraAtTime(camera, shot, ts);
      const ps = camera.position.clone();
      const targs = getFocalTargetAtTime(ts);
      const azs = Math.atan2(ps.x - targs.x, ps.z - targs.z);
      if (prevP) segDist += ps.distanceTo(prevP);
      if (prevAz !== null) {
        let da = azs - prevAz;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        cumAzRad += da;
      }
      prevP = ps;
      prevAz = azs;
    }

    // Displacement in the initial camera's local coordinate system (+X right, +Y up, -Z forward push)
    const localDelta = p1.clone().applyMatrix4(m0Inv);
    const forwardPush = -localDelta.z; // + = moved forward along sightline, - = pulled backward
    const lateralTruck = localDelta.x; // + = trucked right, - = trucked left
    const verticalLift = p1.y - p0.y; // + = ascended/pedestal up, - = descended

    const dAzDeg = THREE.MathUtils.radToDeg(cumAzRad);
    const dRadius = r1 - r0;

    // Camera rotational pan/tilt delta
    const forward0 = new THREE.Vector3(0, 0, -1).applyQuaternion(q0);
    const forward1 = new THREE.Vector3(0, 0, -1).applyQuaternion(q1);
    const yaw0 = Math.atan2(forward0.x, -forward0.z);
    const yaw1 = Math.atan2(forward1.x, -forward1.z);
    let dYaw = yaw1 - yaw0;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const dYawDeg = THREE.MathUtils.radToDeg(dYaw);
    const dPitchDeg = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(forward1.y, -1, 1)) -
        Math.asin(THREE.MathUtils.clamp(forward0.y, -1, 1))
    );

    // Perspective shift relative to primary visible subject
    let perspectiveShift = '';
    if (visibleAnalyses.length > 0) {
      const prim = visibleAnalyses[0];
      const beatState = prim.beats[phase];
      const prevPhase: BeatPhase | null = phase === 'mid' ? 'open' : phase === 'close' ? 'mid' : null;
      const prevState = prevPhase ? prim.beats[prevPhase] : null;
      if (
        beatState.visible &&
        prevState?.visible &&
        prevState.viewOrientationShort !== beatState.viewOrientationShort
      ) {
        perspectiveShift = `, shifting perspective on ${prim.actor.name} from a ${prevState.viewOrientationShort} to a ${beatState.viewOrientationShort}`;
      } else if (beatState.visible && phase === 'open') {
        perspectiveShift = `, framing ${prim.actor.name} in a ${beatState.viewOrientationShort}`;
      }
    }

    if (segDist < 0.5 && Math.abs(dYawDeg) < 2.5 && Math.abs(dPitchDeg) < 2.5) {
      return `Camera holds a steady locked-off position${perspectiveShift}`;
    }

    const motions: string[] = [];
    if (Math.abs(dAzDeg) >= 12 && segDist >= 1.0) {
      const arcDir = dAzDeg > 0 ? 'counter-clockwise' : 'clockwise';
      const latDir = lateralTruck > 0.6 ? 'rightward' : lateralTruck < -0.6 ? 'leftward' : '';
      motions.push(
        `sweeps in a ${latDir ? `${latDir} ` : ''}${arcDir} orbital tracking arc (${Math.abs(Math.round(dAzDeg))}° angular sweep)`
      );
      if (dRadius <= -1.2) {
        motions.push('pushing closer toward the subject');
      } else if (dRadius >= 1.2) {
        motions.push('widening distance from the subject');
      }
    } else {
      if (forwardPush >= 0.8) {
        motions.push('tracks forward toward the action');
      } else if (forwardPush <= -0.8) {
        motions.push('pulls backward away from the action');
      }
      if (lateralTruck >= 0.8) {
        motions.push('trucks laterally to the right');
      } else if (lateralTruck <= -0.8) {
        motions.push('trucks laterally to the left');
      }
    }

    if (verticalLift >= 0.7) {
      motions.push(`elevates upward (+${verticalLift.toFixed(1)}m)`);
    } else if (verticalLift <= -0.7) {
      motions.push(`descends lower (${verticalLift.toFixed(1)}m)`);
    }

    if (motions.length === 0) {
      if (Math.abs(dYawDeg) >= 2.5) {
        motions.push(`pans smoothly to the ${dYawDeg > 0 ? 'right' : 'left'}`);
      }
      if (Math.abs(dPitchDeg) >= 2.5) {
        motions.push(`tilts ${dPitchDeg > 0 ? 'upward' : 'downward'}`);
      }
    } else if (Math.abs(dYawDeg) >= 8 && Math.abs(dAzDeg) < 12) {
      motions.push(`while panning ${dYawDeg > 0 ? 'right' : 'left'} to keep the subject framed`);
    }

    if (motions.length === 0 && segDist >= 0.5) {
      if (Math.abs(forwardPush) >= Math.abs(lateralTruck)) {
        motions.push(
          forwardPush >= 0 ? 'tracks forward toward the subject' : 'pulls backward away from the subject'
        );
      } else {
        motions.push(
          lateralTruck >= 0 ? 'trucks laterally to the right' : 'trucks laterally to the left'
        );
      }
    }

    const core = motions.length > 0 ? motions.join(' and ') : 'tracks smoothly along its 3D path';
    return `Camera ${core}${perspectiveShift}`;
  };

  const openDesc = describeInterval(0, t1, 'open');
  const midDesc = describeInterval(t1, t2, 'mid');
  const closeDesc = describeInterval(t2, duration, 'close');

  // Build overall summary across [0..duration]
  const speed = shot.camera.movement.speed;
  const speedPhrase =
    speed === 'slow-cinematic'
      ? 'slow, controlled'
      : speed === 'rapid-dynamic'
      ? 'fast, dynamic'
      : 'steady, continuous';

  let overallDescription = '';
  if (totalDistanceMeters < 0.8) {
    overallDescription = `locked-off stationary camera frame`;
  } else {
    const overallParts: string[] = [];
    if (Math.abs(orbitSweepDeg) >= 20) {
      const arcDir = orbitSweepDeg > 0 ? 'counter-clockwise' : 'clockwise';
      overallParts.push(
        `${speedPhrase} 3D orbital tracking arc (${Math.abs(Math.round(orbitSweepDeg))}° ${arcDir} sweep around the subject)`
      );
    } else if (radialDeltaMeters <= -2.0) {
      overallParts.push(`${speedPhrase} 3D tracking push toward the subject`);
    } else if (radialDeltaMeters >= 2.0) {
      overallParts.push(`${speedPhrase} 3D pullback tracking movement`);
    } else {
      overallParts.push(`${speedPhrase} 3D tracking camera movement`);
    }

    if (Math.abs(orbitSweepDeg) >= 20 && radialDeltaMeters <= -2.0) {
      overallParts.push('progressively closing distance');
    } else if (Math.abs(orbitSweepDeg) >= 20 && radialDeltaMeters >= 2.0) {
      overallParts.push('gradually expanding distance');
    }

    if (verticalDeltaMeters >= 1.5) {
      overallParts.push(`rising vertically (+${verticalDeltaMeters.toFixed(1)}m crane elevation)`);
    } else if (verticalDeltaMeters <= -1.5) {
      overallParts.push(`descending vertically (${verticalDeltaMeters.toFixed(1)}m elevation drop)`);
    }

    if (visibleAnalyses.length > 0) {
      const prim = visibleAnalyses[0];
      const firstBeat = prim.firstVisibleBeat ? prim.beats[prim.firstVisibleBeat] : prim.beats.open;
      const lastBeat = prim.lastVisibleBeat ? prim.beats[prim.lastVisibleBeat] : prim.beats.close;
      if (
        firstBeat.visible &&
        lastBeat.visible &&
        firstBeat.viewOrientationShort !== lastBeat.viewOrientationShort
      ) {
        overallParts.push(
          `transitioning camera perspective on ${prim.actor.name} from a ${firstBeat.viewOrientationShort} to a ${lastBeat.viewOrientationShort}`
        );
      }
    }

    overallDescription = overallParts.join(', ');
  }

  return {
    isCustomCameraTrajectory,
    overallDescription,
    beatDescriptions: {
      open: openDesc,
      mid: midDesc,
      close: closeDesc,
    },
    totalDistanceMeters: Number(totalDistanceMeters.toFixed(2)),
    orbitSweepDeg: Number(orbitSweepDeg.toFixed(1)),
    radialDeltaMeters: Number(radialDeltaMeters.toFixed(2)),
    verticalDeltaMeters: Number(verticalDeltaMeters.toFixed(2)),
  };
}

/**
 * Analyzes the entire shot timeline (`0s` to `durationSeconds`) through the exact 3D Camera POV
 * frustum (`vfCameraRef` parity), determining which actors/objects actually appear inside the
 * camera frame during each temporal beat (`open`, `mid`, `close`) and computing their true
 * camera-relative screen positions, 3D viewing orientation, altitude transitions, and 3D camera kinematics.
 */
export function analyzeShotPovVisibility(shot: ShotSpec): ShotPovVisibilityReport {
  const actors = shot.actors || [];
  const { t1, t2, duration } = computeDynamicBeatBreakpoints(shot);
  const camera = new THREE.PerspectiveCamera(45, getAspectRatioValue(shot.aspectRatio), 0.1, 400);

  if (actors.length === 0) {
    const emptyCamKinematics = analyzeCamera3DKinematics(shot, camera, [], t1, t2, duration);
    return {
      visibleActors: [],
      offScreenActors: [],
      byActorId: {},
      visibleAnalyses: [],
      isPureEnvironmentalShot: true,
      cameraKinematics: emptyCamKinematics,
      beatBreakpoints: { t1, t2, duration },
    };
  }

  // Sample 5 timestamps per beat (15 samples total across the shot timeline)
  const buildBeatTimes = (start: number, end: number, steps = 5): number[] => {
    const out: number[] = [];
    for (let i = 0; i < steps; i++) {
      const u = steps === 1 ? 0.5 : i / (steps - 1);
      out.push(start + (end - start) * u);
    }
    return out;
  };

  const openTimes = buildBeatTimes(0, t1, 5);
  const midTimes = buildBeatTimes(t1, t2, 5);
  const closeTimes = buildBeatTimes(t2, duration, 5);

  const visibleActors: ActorSpec[] = [];
  const offScreenActors: ActorSpec[] = [];
  const byActorId: Record<string, ActorPovAnalysis> = {};
  const visibleAnalyses: ActorPovAnalysis[] = [];

  for (const actor of actors) {
    const openBeat = evaluateActorBeatPov(actor, shot, camera, openTimes);
    const midBeat = evaluateActorBeatPov(actor, shot, camera, midTimes);
    const closeBeat = evaluateActorBeatPov(actor, shot, camera, closeTimes);

    const visibleInBeats: Record<BeatPhase, boolean> = {
      open: openBeat.visible,
      mid: midBeat.visible,
      close: closeBeat.visible,
    };
    const everVisible = openBeat.visible || midBeat.visible || closeBeat.visible;
    const visibleInAllBeats = openBeat.visible && midBeat.visible && closeBeat.visible;

    const firstVisibleBeat: BeatPhase | null = openBeat.visible
      ? 'open'
      : midBeat.visible
      ? 'mid'
      : closeBeat.visible
      ? 'close'
      : null;

    const lastVisibleBeat: BeatPhase | null = closeBeat.visible
      ? 'close'
      : midBeat.visible
      ? 'mid'
      : openBeat.visible
      ? 'open'
      : null;

    const primaryBeatState =
      (firstVisibleBeat ? { open: openBeat, mid: midBeat, close: closeBeat }[firstVisibleBeat] : null) ||
      openBeat;

    // Measure true 3D path length across 12 timeline samples (captures intermediate keyframes, Z liftoff, and curved arcs)
    let totalPathLengthMeters = 0;
    let prevW: { x: number; y: number; z: number } | null = null;
    for (let s = 0; s <= 12; s++) {
      const ts = (s / 12) * duration;
      const w = getActorWorldPositionAtTime(actor, shot, ts);
      if (prevW) {
        totalPathLengthMeters += Math.hypot(w.x - prevW.x, w.y - prevW.y, w.z - prevW.z);
      }
      prevW = w;
    }

    const has3DDisplacement =
      totalPathLengthMeters > 1.2 ||
      Math.abs(closeBeat.endAltitudeMeters - openBeat.startAltitudeMeters) > 0.6;

    const firstBeatState = firstVisibleBeat
      ? { open: openBeat, mid: midBeat, close: closeBeat }[firstVisibleBeat]
      : openBeat;
    const lastBeatState = lastVisibleBeat
      ? { open: openBeat, mid: midBeat, close: closeBeat }[lastVisibleBeat]
      : closeBeat;

    const orientationTransitionSummary =
      firstBeatState.visible &&
      lastBeatState.visible &&
      firstBeatState.viewOrientationShort !== lastBeatState.viewOrientationShort
        ? `transitions from ${firstBeatState.viewOrientationShort} to ${lastBeatState.viewOrientationShort}`
        : firstBeatState.viewOrientationShort;

    const analysis: ActorPovAnalysis = {
      actor,
      actorId: actor.id,
      everVisible,
      visibleInAllBeats,
      visibleInBeats,
      beats: {
        open: openBeat,
        mid: midBeat,
        close: closeBeat,
      },
      firstVisibleBeat,
      lastVisibleBeat,
      primaryHorizontalZone: primaryBeatState.horizontalZone,
      primaryScreenZone: primaryBeatState.screenZone,
      has3DDisplacement,
      totalPathLengthMeters: Number(totalPathLengthMeters.toFixed(2)),
      orientationTransitionSummary,
    };

    byActorId[actor.id] = analysis;
    if (everVisible) {
      visibleActors.push(actor);
      visibleAnalyses.push(analysis);
    } else {
      offScreenActors.push(actor);
    }
  }

  const cameraKinematics = analyzeCamera3DKinematics(
    shot,
    camera,
    visibleAnalyses,
    t1,
    t2,
    duration
  );

  return {
    visibleActors,
    offScreenActors,
    byActorId,
    visibleAnalyses,
    isPureEnvironmentalShot: visibleActors.length === 0,
    cameraKinematics,
    beatBreakpoints: { t1, t2, duration },
  };
}
