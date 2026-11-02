import * as THREE from 'three';
import { FocalLength, ShotSpec } from '../types/shotspec';
import {
  interpolateCameraPosition,
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
}

function getAspectRatioValue(aspectRatio?: string): number {
  switch (aspectRatio) {
    case '9:16':
      return 9 / 16;
    case '21:9':
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

  // 3. Camera targetLookAt (matches StagePrevis3D lines 1821-1869)
  let lookAtCoord: { x: number; y: number; z?: number } =
    shot.camera.movement.targetLookAt || { x: 50, y: 40 };
  const camKfs = (shot.camera.movement.keyframes || []).filter((k) => k.lookAt);
  if (camKfs.length > 0) {
    const sorted = [...camKfs].sort((a, b) => a.time - b.time);
    const baseLook = shot.camera.movement.targetLookAt || { x: 50, y: 40, z: 50 };
    const pts = [
      { time: 0, look: baseLook },
      ...sorted.map((k) => ({ time: k.time, look: k.lookAt! })),
    ];
    if (pts[pts.length - 1].time < duration - 0.05) {
      pts.push({ time: duration, look: pts[pts.length - 1].look });
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (t >= pts[i].time && t <= pts[i + 1].time) {
        const span = Math.max(0.0001, pts[i + 1].time - pts[i].time);
        const localU = (t - pts[i].time) / span;
        lookAtCoord = {
          x: pts[i].look.x + (pts[i + 1].look.x - pts[i].look.x) * localU,
          y: pts[i].look.y + (pts[i + 1].look.y - pts[i].look.y) * localU,
          z: (pts[i].look.z ?? 50) + ((pts[i + 1].look.z ?? 50) - (pts[i].look.z ?? 50)) * localU,
        };
        break;
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
      const bone = shot.camera.trackTargetBone || 'chest';
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
        effectiveCamX += deltaX;
        effectiveCamZ += deltaZ;
      }
    }
  }

  // 5. Angle elevation adjustments on lookAt target (matches StagePrevis3D lines 1899-1908)
  let effectiveTargetY = targetY;
  if (shot.camera.angle === 'low-angle') {
    effectiveTargetY = targetY + 1.1;
  } else if (shot.camera.angle === 'ground-level') {
    effectiveTargetY = targetY + 1.4;
  } else if (shot.camera.angle === 'high-angle') {
    effectiveTargetY = Math.max(1.2, targetY - 1.2);
  } else if (shot.camera.angle === 'overhead-gods-eye') {
    effectiveTargetY = 0.5;
  }

  // 6. Position + Orientation + Dutch Roll / Pitch / Yaw offsets (matches StagePrevis3D lines 1919-1940)
  camera.position.set(effectiveCamX, effectiveCamY + 1.5, effectiveCamZ);
  camera.up.set(0, 1, 0);
  camera.lookAt(targetX, effectiveTargetY, targetZ);

  const rollDeg =
    shot.camera.dutchRollDeg !== undefined
      ? shot.camera.dutchRollDeg
      : shot.camera.angle === 'dutch-angle'
      ? 14
      : 0;
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
 * Computes the 3D world-space sample points for an actor at time `t` (feet, knees, pelvis,
 * torso, chest, head, plus horizontal width offsets scaled by `actor.scale`).
 */
function getActorBoundingSamplePointsAtTime(
  actor: ActorSpec,
  shot: ShotSpec,
  t: number
): ActorSamplePoint[] {
  const duration = Math.max(0.5, shot.durationSeconds || 5);
  let baseActor = actor;
  let socketYOffset = 0;

  // Handle bone-socketed props attached to another actor
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
  const ay = (pos2d.z ?? 0) * 0.3 + socketYOffset;
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

function classifyDepthZone(distanceMeters: number): DepthScreenZone {
  if (distanceMeters < 11.5) return 'close foreground';
  if (distanceMeters > 24.0) return 'distant background';
  return 'midground';
}

/**
 * Evaluates a single actor's visibility and camera-relative screen framing across a list
 * of sample timestamps within a temporal beat (`open`, `mid`, or `close`).
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
  let sawLower = false;
  let sawMid = false;
  let sawUpper = false;

  const camLocalVec = new THREE.Vector3();
  const ndcVec = new THREE.Vector3();

  for (const t of sampleTimes) {
    configurePovCameraAtTime(camera, shot, t);
    const samplePoints = getActorBoundingSamplePointsAtTime(actor, shot, t);

    let frameVisiblePts = 0;
    let frameNdcX = 0;
    let frameNdcY = 0;
    let frameDist = 0;

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
        if (pt.tag === 'lower') sawLower = true;
        if (pt.tag === 'mid') sawMid = true;
        if (pt.tag === 'upper') sawUpper = true;
      }
    }

    if (frameVisiblePts > 0) {
      visibleCount++;
      sumNdcX += frameNdcX / frameVisiblePts;
      sumNdcY += frameNdcY / frameVisiblePts;
      sumDistance += frameDist / frameVisiblePts;
    }
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
    };
  }

  const avgNdcX = sumNdcX / visibleCount;
  const avgNdcY = sumNdcY / visibleCount;
  const distanceMeters = sumDistance / visibleCount;
  const horizontalZone = classifyHorizontalZone(avgNdcX);
  const depthZone = classifyDepthZone(distanceMeters);

  let coverage: SubjectFrameCoverage = 'full-body';
  if (sawUpper && !sawLower) {
    coverage = sawMid ? 'waist-up medium' : 'close-up head-and-shoulders';
  } else if (distanceMeters < 6.0) {
    coverage = 'close-up head-and-shoulders';
  } else if (distanceMeters < 10.5 && !sawLower) {
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
  };
}

/**
 * Analyzes the entire shot timeline (`0s` to `durationSeconds`) through the exact 3D Camera POV
 * frustum (`vfCameraRef` parity), determining which actors/objects actually appear inside the
 * camera frame during each temporal beat (`open`, `mid`, `close`) and computing their true
 * camera-relative screen positions (`screen-left / center-frame / screen-right` and
 * `close foreground / midground / distant background`).
 */
export function analyzeShotPovVisibility(shot: ShotSpec): ShotPovVisibilityReport {
  const actors = shot.actors || [];
  if (actors.length === 0) {
    return {
      visibleActors: [],
      offScreenActors: [],
      byActorId: {},
      visibleAnalyses: [],
      isPureEnvironmentalShot: true,
    };
  }

  const duration = Math.max(1.0, shot.durationSeconds || 5);
  const t1 = Number((duration * 0.35).toFixed(2));
  const t2 = Number((duration * 0.75).toFixed(2));

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

  const camera = new THREE.PerspectiveCamera(45, getAspectRatioValue(shot.aspectRatio), 0.1, 400);

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
    };

    byActorId[actor.id] = analysis;
    if (everVisible) {
      visibleActors.push(actor);
      visibleAnalyses.push(analysis);
    } else {
      offScreenActors.push(actor);
    }
  }

  return {
    visibleActors,
    offScreenActors,
    byActorId,
    visibleAnalyses,
    isPureEnvironmentalShot: visibleActors.length === 0,
  };
}
