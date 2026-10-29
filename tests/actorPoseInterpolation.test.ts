import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  slerpActorPoses,
  interpolateActorPoseAtTime,
  interpolateObjectRotationAtTime,
  recordTrajectoryPoseAtTime,
} from '../src/engine/trajectoryMath';
import { ActorPose } from '../src/types/shotspec';

describe('Actor Multi-Cue Pose Interpolation & Claymation Timing', () => {
  const poseA: ActorPose = {
    hipsOffset: [0, 0, 0],
    rotations: {
      Head: [0, 0, 0, 1], // Identity quaternion
      RightArm: [0, 0, 0, 1],
    },
  };

  // 90 degrees around Y axis for Head: [0, sin(45 deg), 0, cos(45 deg)] = [0, 0.7071, 0, 0.7071]
  const qY90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const poseB: ActorPose = {
    hipsOffset: [0, -0.4, 0],
    rotations: {
      Head: [qY90.x, qY90.y, qY90.z, qY90.w],
      RightArm: [0, 0, 0, 1],
    },
  };

  it('accurately SLERPs quaternions and linearly interpolates hipsOffset between two poses', () => {
    const mid = slerpActorPoses(poseA, poseB, 0.5);
    expect(mid.hipsOffset).toBeDefined();
    expect(mid.hipsOffset![1]).toBeCloseTo(-0.2, 3);

    // At 50% between 0 and 90 deg around Y, angle should be 45 deg
    const midHeadQ = new THREE.Quaternion(...mid.rotations['Head']);
    const identityQ = new THREE.Quaternion(0, 0, 0, 1);
    const angle = identityQ.angleTo(midHeadQ);
    expect(angle).toBeCloseTo(Math.PI / 4, 3);
  });

  it('interpolates pose across timeline keyframes', () => {
    const trajectory = {
      startPosition: { x: 20, y: 50 },
      endPosition: { x: 80, y: 50 },
      keyframes: [
        { id: 'kf1', time: 1.0, position: { x: 40, y: 50 }, pose: poseA, posePreset: 'neutral-stand' },
        { id: 'kf2', time: 3.0, position: { x: 70, y: 50 }, pose: poseB, posePreset: 'combat-ready' },
      ],
    };

    // Before first pose keyframe: holds poseA
    const at05 = interpolateActorPoseAtTime(trajectory, poseA, 0.5, 4.0);
    expect(at05.pose).toBeDefined();
    expect(at05.posePreset).toBe('neutral-stand');

    // Exactly at midway (2.0s): 50% blend
    const at20 = interpolateActorPoseAtTime(trajectory, poseA, 2.0, 4.0);
    expect(at20.pose?.hipsOffset?.[1]).toBeCloseTo(-0.2, 3);

    // After last keyframe: holds poseB
    const at35 = interpolateActorPoseAtTime(trajectory, poseA, 3.5, 4.0);
    expect(at35.posePreset).toBe('combat-ready');
    expect(at35.pose?.hipsOffset?.[1]).toBeCloseTo(-0.4, 3);
  });

  it('quantizes animation time when claymationFps is active (stepped stop-motion)', () => {
    const trajectory = {
      startPosition: { x: 0, y: 0 },
      endPosition: { x: 100, y: 100 },
      keyframes: [
        { id: 'kf1', time: 0.0, position: { x: 0, y: 0 }, pose: poseA },
        { id: 'kf2', time: 2.0, position: { x: 100, y: 100 }, pose: poseB },
      ],
    };

    // At 12 fps, each step is ~0.0833s. Times 0.10s and 0.15s should evaluate to the same 12fps discrete frame step (0.0833s)
    const atTimeA = interpolateActorPoseAtTime(trajectory, poseA, 0.10, 4.0, { claymationFps: 12 });
    const atTimeB = interpolateActorPoseAtTime(trajectory, poseA, 0.15, 4.0, { claymationFps: 12 });

    expect(atTimeA.pose?.hipsOffset?.[1]).toBeCloseTo(atTimeB.pose?.hipsOffset?.[1]!, 5);
  });

  it('interpolates 3D orientation for props and vehicles', () => {
    const trajectory = {
      startPosition: { x: 0, y: 0 },
      endPosition: { x: 100, y: 100 },
      keyframes: [
        { id: 'k1', time: 0.0, position: { x: 0, y: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        { id: 'k2', time: 4.0, position: { x: 100, y: 100 }, rotation: { x: 0, y: 180, z: 0 } },
      ],
    };

    const midRot = interpolateObjectRotationAtTime(trajectory, undefined, 2.0, 4.0);
    expect(midRot.y).toBeCloseTo(90, 1);
  });

  it('records pose into new or existing keyframe via recordTrajectoryPoseAtTime', () => {
    const initTrajectory = {
      startPosition: { x: 10, y: 10 },
      endPosition: { x: 90, y: 90 },
      keyframes: [],
    };

    const updated = recordTrajectoryPoseAtTime(initTrajectory, 2.0, 4.0, poseB, 'aim-bow', 'none');
    expect(updated.keyframes?.length).toBe(1);
    expect(updated.keyframes?.[0].time).toBe(2.0);
    expect(updated.keyframes?.[0].posePreset).toBe('aim-bow');

    // Updating near existing timestamp updates in-place
    const updatedAgain = recordTrajectoryPoseAtTime(updated, 2.1, 4.0, poseA, 'neutral-stand', 'walk');
    expect(updatedAgain.keyframes?.length).toBe(1);
    expect(updatedAgain.keyframes?.[0].posePreset).toBe('neutral-stand');
  });
});
