import * as THREE from 'three';
import { Actor } from '../../types/shotspec';
import { interpolateTrajectoryPosition, TrajectoryData } from '../trajectoryMath';
import {
  evaluateTerrainHeight,
  ResolvedTerrainConfig,
} from '../staging/terrainGenerator';

export interface VehicleDriveState {
  worldX: number;
  worldZ: number;
  groundY: number;
  speedMetersPerSec: number;
  distanceTraveledMeters: number;
  headingRad: number;
  wheelSpinRad: number;
  steerAngleRad: number;
  suspensionPitchRad: number;
  suspensionRollRad: number;
  terrainPitchRad: number;
  terrainRollRad: number;
  isBraking: boolean;
  isReversing: boolean;
}

/**
 * Determines whether an actor is a wheeled/tracked ground vehicle that should receive
 * 67.js-inspired physical drive kinematics (wheel spin, Ackermann steering, chassis roll/pitch,
 * and 4-wheel terrain slope alignment).
 */
export function isGroundVehicleActor(actor: Pick<Actor, 'name' | 'token' | 'kind'>): boolean {
  const kind = (actor.kind || '').toLowerCase();
  const sig = `${actor.name || ''} ${actor.token || ''} ${kind}`.toLowerCase();

  // Exclude flying/airborne craft
  if (
    kind === 'aircraft' ||
    kind === 'spaceship' ||
    /\b(helicopter|chopper|airplane|plane|jet|fighter|drone|quadcopter|spaceship|starship|saucer|ufo|rocket|missile|boat|ship|yacht|submarine)\b/i.test(
      sig
    )
  ) {
    return false;
  }

  if (kind === 'vehicle' || kind === 'car') {
    return true;
  }

  return (
    /\b(car|automobile|vehicle|sedan|coupe|suv|van|truck|pickup|lorry|bus|taxi|cab|cruiser|police\s*car|ambulance|firetruck|jeep|buggy|rover|motorcycle|motorbike|bike|bicycle|scooter|tank|APC|tractor|forklift|bulldozer|excavator|cart|carriage|chariot|wagon)\b/i.test(
      sig
    ) || /(سيارة|مركبة|شاحنة|حافلة|أتوبيس|دراجة|دبابة|جرار|عربة)/.test(sig)
  );
}

function stagePosToMeters(p: { x: number; y: number; z?: number }): { x: number; z: number; elev: number } {
  return {
    x: (p.x - 50) * 1.0,
    z: (p.y - 50) * 1.0,
    elev: (p.z ?? 0) * 0.3,
  };
}

function normalizeAngleDelta(a: number): number {
  let d = a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Evaluates physical vehicle drive kinematics at time `t` along an arbitrary ShotSpec trajectory
 * (inspired by `67js/addons/vehicle` `driveAlongPath`):
 * - Integrates cumulative arc length to compute exact wheel rotation (`wheelSpinRad`).
 * - Computes path curvature and yaw rate to derive front-wheel Ackermann steering (`steerAngleRad`).
 * - Computes longitudinal acceleration/braking pitch and lateral cornering roll.
 * - Samples 4-wheel contact points on the 3D terrain heightfield to align pitch/roll with hills & dunes.
 */
export function evaluateVehicleDriveState(
  trajectory: TrajectoryData,
  timeSec: number,
  durationSec: number,
  terrainConfig?: ResolvedTerrainConfig
): VehicleDriveState {
  const safeDur = Math.max(0.5, durationSec || 4.0);
  const clampedT = Math.max(0, Math.min(safeDur, timeSec));

  // Integrate arc length from t=0 to clampedT in fixed substeps
  const steps = 24;
  const dtStep = clampedT / steps;
  let totalDist = 0;
  let prevPt = stagePosToMeters(interpolateTrajectoryPosition(trajectory, 0, safeDur));

  if (clampedT > 0.001) {
    for (let i = 1; i <= steps; i++) {
      const tau = i * dtStep;
      const curPt = stagePosToMeters(interpolateTrajectoryPosition(trajectory, tau, safeDur));
      totalDist += Math.hypot(curPt.x - prevPt.x, curPt.z - prevPt.z);
      prevPt = curPt;
    }
  }

  // Finite-difference velocity, heading, yaw rate, and acceleration around clampedT
  const eps = 0.05;
  const t0 = Math.max(0, clampedT - eps);
  const t1 = Math.min(safeDur, clampedT + eps);
  const span = Math.max(1e-3, t1 - t0);

  const pNow = stagePosToMeters(interpolateTrajectoryPosition(trajectory, clampedT, safeDur));
  const pPrev = stagePosToMeters(interpolateTrajectoryPosition(trajectory, t0, safeDur));
  const pNext = stagePosToMeters(interpolateTrajectoryPosition(trajectory, t1, safeDur));

  const vx = (pNext.x - pPrev.x) / span;
  const vz = (pNext.z - pPrev.z) / span;
  const speed = Math.hypot(vx, vz);

  // Fallback overall trajectory vector for heading when stationary at t=0 or t=duration
  const pStart = stagePosToMeters(trajectory.startPosition);
  const pEnd = stagePosToMeters(trajectory.endPosition);
  const overallDx = pEnd.x - pStart.x;
  const overallDz = pEnd.z - pStart.z;
  const defaultHeading =
    Math.hypot(overallDx, overallDz) > 0.2 ? Math.atan2(overallDx, overallDz) : 0;

  const headingRad = speed > 0.08 ? Math.atan2(vx, vz) : defaultHeading;

  // Sample slightly earlier and later headings for curvature / steering rate
  const tPrev2 = Math.max(0, clampedT - eps * 2);
  const tNext2 = Math.min(safeDur, clampedT + eps * 2);
  const pPrev2 = stagePosToMeters(interpolateTrajectoryPosition(trajectory, tPrev2, safeDur));
  const pNext2 = stagePosToMeters(interpolateTrajectoryPosition(trajectory, tNext2, safeDur));

  const vxBefore = (pNow.x - pPrev2.x) / Math.max(1e-3, clampedT - tPrev2);
  const vzBefore = (pNow.z - pPrev2.z) / Math.max(1e-3, clampedT - tPrev2);
  const speedBefore = Math.hypot(vxBefore, vzBefore);
  const headingBefore = speedBefore > 0.08 ? Math.atan2(vxBefore, vzBefore) : headingRad;

  const vxAfter = (pNext2.x - pNow.x) / Math.max(1e-3, tNext2 - clampedT);
  const vzAfter = (pNext2.z - pNow.z) / Math.max(1e-3, tNext2 - clampedT);
  const speedAfter = Math.hypot(vxAfter, vzAfter);
  const headingAfter = speedAfter > 0.08 ? Math.atan2(vxAfter, vzAfter) : headingRad;

  const yawRate = normalizeAngleDelta(headingAfter - headingBefore) / Math.max(1e-3, tNext2 - tPrev2);
  const accelLongitudinal = (speedAfter - speedBefore) / Math.max(1e-3, tNext2 - tPrev2);
  const accelLateral = speed * yawRate;

  // Wheel radius ~ 0.55 stage units, wheelbase ~ 3.2 stage units
  const wheelRadius = 0.55;
  const wheelbase = 3.2;
  const wheelSpinRad = totalDist / wheelRadius;

  const rawSteer = speed > 0.15 ? Math.atan((wheelbase * yawRate) / Math.max(speed, 1.5)) : 0;
  const steerAngleRad = THREE.MathUtils.clamp(rawSteer, -0.58, 0.58);

  // Chassis dynamic suspension pitch (nose dips under braking, squats under acceleration) & roll
  const suspensionPitchRad = THREE.MathUtils.clamp(-accelLongitudinal * 0.016, -0.085, 0.085);
  const suspensionRollRad = THREE.MathUtils.clamp(accelLateral * 0.022, -0.12, 0.12);

  // 4-wheel terrain contact sampling for slope pitch & roll
  let groundY = pNow.elev;
  let terrainPitchRad = 0;
  let terrainRollRad = 0;

  if (terrainConfig && terrainConfig.profile !== 'flat' && terrainConfig.heightScale > 0.001) {
    const halfWheelbase = 1.65;
    const halfTrack = 1.05;
    const fwdX = Math.sin(headingRad);
    const fwdZ = Math.cos(headingRad);
    const rightX = Math.cos(headingRad);
    const rightZ = -Math.sin(headingRad);

    const hFront = evaluateTerrainHeight(
      pNow.x + fwdX * halfWheelbase,
      pNow.z + fwdZ * halfWheelbase,
      terrainConfig
    );
    const hRear = evaluateTerrainHeight(
      pNow.x - fwdX * halfWheelbase,
      pNow.z - fwdZ * halfWheelbase,
      terrainConfig
    );
    const hRight = evaluateTerrainHeight(
      pNow.x + rightX * halfTrack,
      pNow.z + rightZ * halfTrack,
      terrainConfig
    );
    const hLeft = evaluateTerrainHeight(
      pNow.x - rightX * halfTrack,
      pNow.z - rightZ * halfTrack,
      terrainConfig
    );

    const avgTerrainH = 0.25 * (hFront + hRear + hRight + hLeft);
    groundY = Math.max(avgTerrainH, pNow.elev);
    terrainPitchRad = THREE.MathUtils.clamp(
      -Math.atan2(hFront - hRear, halfWheelbase * 2),
      -0.45,
      0.45
    );
    terrainRollRad = THREE.MathUtils.clamp(
      Math.atan2(hLeft - hRight, halfTrack * 2),
      -0.42,
      0.42
    );
  }

  return {
    worldX: pNow.x,
    worldZ: pNow.z,
    groundY,
    speedMetersPerSec: speed,
    distanceTraveledMeters: totalDist,
    headingRad,
    wheelSpinRad,
    steerAngleRad,
    suspensionPitchRad,
    suspensionRollRad,
    terrainPitchRad,
    terrainRollRad,
    isBraking: accelLongitudinal < -0.6 && speed > 0.2,
    isReversing: false,
  };
}

interface CachedWheelPart {
  node: THREE.Object3D;
  baseRot: THREE.Euler;
  isFront: boolean;
}

function discoverVehicleWheels(mesh: THREE.Object3D): CachedWheelPart[] {
  if (mesh.userData._cachedVehicleWheels) {
    return mesh.userData._cachedVehicleWheels as CachedWheelPart[];
  }

  const wheels: CachedWheelPart[] = [];
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());

  mesh.traverse((child) => {
    if (child === mesh) return;
    if (
      child.name === '__base_ring_group__' ||
      child.name === '__actor_hit_proxy__' ||
      child.name === '__contact_shadow__'
    ) {
      return;
    }
    const nm = (child.name || '').toLowerCase();
    if (/\b(wheel|tire|tyre|rim|axle)\b/i.test(nm) || /(wheel|tire|tyre)_/i.test(nm)) {
      const worldPos = new THREE.Vector3();
      child.getWorldPosition(worldPos);
      const localPos = mesh.worldToLocal(worldPos.clone());
      const isFront =
        /front|fl|fr|fw/i.test(nm) || (!/rear|back|rl|rr|rw/i.test(nm) && localPos.z > center.z);
      wheels.push({
        node: child,
        baseRot: child.rotation.clone(),
        isFront,
      });
    }
  });

  mesh.userData._cachedVehicleWheels = wheels;
  return wheels;
}

/**
 * Applies `VehicleDriveState` (wheel spin, front steering, chassis suspension pitch/roll,
 * and terrain slope alignment) to a 3D vehicle actor mesh on the stage.
 */
export function applyVehicleDriveKinematicsToMesh(
  mesh: THREE.Object3D,
  driveState: VehicleDriveState,
  hasExplicitRotation: boolean = false
): void {
  // 1. Ground vehicle at terrain elevation
  mesh.position.set(driveState.worldX, driveState.groundY, driveState.worldZ);

  // 2. Apply heading + terrain slope + dynamic suspension pitch/roll
  const totalPitch = driveState.terrainPitchRad + driveState.suspensionPitchRad;
  const totalRoll = driveState.terrainRollRad + driveState.suspensionRollRad;

  if (!hasExplicitRotation) {
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = driveState.headingRad;
    mesh.rotation.x = totalPitch;
    mesh.rotation.z = totalRoll;
  } else {
    mesh.rotation.x += totalPitch;
    mesh.rotation.z += totalRoll;
  }

  // 3. Spin all wheels & steer front wheels
  const wheels = discoverVehicleWheels(mesh);
  for (const w of wheels) {
    w.node.rotation.order = 'YXZ';
    w.node.rotation.x = w.baseRot.x + driveState.wheelSpinRad;
    w.node.rotation.y = w.baseRot.y + (w.isFront ? driveState.steerAngleRad : 0);
    w.node.rotation.z = w.baseRot.z;
  }
}

