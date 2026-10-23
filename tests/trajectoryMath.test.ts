import { describe, it, expect } from 'vitest';
import {
  interpolateTrajectoryPosition,
  interpolateCameraPosition,
  recordTrajectoryPositionAtTime,
} from '../src/engine/trajectoryMath';

describe('Trajectory Math & Keyframe Engine', () => {
  it('interpolates start to end linearly when no keyframes exist', () => {
    const trajectory = {
      startPosition: { x: 0, y: 0, z: 0 },
      endPosition: { x: 100, y: 100, z: 50 },
    };

    const mid = interpolateTrajectoryPosition(trajectory, 2.0, 4.0);
    expect(mid.x).toBe(50);
    expect(mid.y).toBe(50);
    expect(mid.z).toBe(25);
  });

  it('interpolates accurately through intermediate keyframes', () => {
    const trajectory = {
      startPosition: { x: 0, y: 0 },
      endPosition: { x: 100, y: 100 },
      keyframes: [
        { id: 'kf-1', time: 1.0, position: { x: 50, y: 0 } },
        { id: 'kf-2', time: 3.0, position: { x: 50, y: 100 } },
      ],
    };

    // At t = 0.5s: halfway from (0,0) to (50,0)
    const t05 = interpolateTrajectoryPosition(trajectory, 0.5, 4.0);
    expect(t05.x).toBe(25);
    expect(t05.y).toBe(0);

    // At t = 1.0s: exact keyframe 1
    const t1 = interpolateTrajectoryPosition(trajectory, 1.0, 4.0);
    expect(t1.x).toBe(50);
    expect(t1.y).toBe(0);

    // At t = 2.0s: halfway between keyframe 1 (50,0) and keyframe 2 (50, 100)
    const t2 = interpolateTrajectoryPosition(trajectory, 2.0, 4.0);
    expect(t2.x).toBe(50);
    expect(t2.y).toBe(50);

    // At t = 3.5s: halfway between keyframe 2 (50, 100) and end (100, 100)
    const t35 = interpolateTrajectoryPosition(trajectory, 3.5, 4.0);
    expect(t35.x).toBe(75);
    expect(t35.y).toBe(100);
  });

  it('records startPosition when moving near start time (t <= 0.15s)', () => {
    const trajectory = {
      startPosition: { x: 10, y: 10 },
      endPosition: { x: 80, y: 80 },
    };

    const updated = recordTrajectoryPositionAtTime(trajectory, 0.05, 4.0, { x: 25, y: 30 });
    expect(updated.startPosition).toEqual({ x: 25, y: 30 });
    expect(updated.endPosition).toEqual({ x: 80, y: 80 });
  });

  it('keeps static objects static when moved at start', () => {
    const trajectory = {
      startPosition: { x: 50, y: 50, z: 0 },
      endPosition: { x: 50, y: 50, z: 0 },
    };

    const updated = recordTrajectoryPositionAtTime(trajectory, 0.0, 4.0, { x: 30, y: 40, z: 0 });
    expect(updated.startPosition).toEqual({ x: 30, y: 40, z: 0 });
    expect(updated.endPosition).toEqual({ x: 30, y: 40, z: 0 });
  });

  it('records endPosition when moving near end time (t >= duration - 0.15s)', () => {
    const trajectory = {
      startPosition: { x: 10, y: 10 },
      endPosition: { x: 80, y: 80 },
    };

    const updated = recordTrajectoryPositionAtTime(trajectory, 3.95, 4.0, { x: 90, y: 95 });
    expect(updated.startPosition).toEqual({ x: 10, y: 10 });
    expect(updated.endPosition).toEqual({ x: 90, y: 95 });
  });

  it('creates an intermediate keyframe when moving in the middle of timeline', () => {
    const trajectory = {
      startPosition: { x: 10, y: 10 },
      endPosition: { x: 80, y: 80 },
    };

    const updated = recordTrajectoryPositionAtTime(trajectory, 2.0, 4.0, { x: 45, y: 55 });
    expect(updated.keyframes).toBeDefined();
    expect(updated.keyframes?.length).toBe(1);
    expect(updated.keyframes?.[0].time).toBe(2.0);
    expect(updated.keyframes?.[0].position).toEqual({ x: 45, y: 55 });
  });

  it('updates existing keyframe when moving within 0.25s of it', () => {
    const trajectory = {
      startPosition: { x: 10, y: 10 },
      endPosition: { x: 80, y: 80 },
      keyframes: [
        { id: 'kf-1', time: 2.0, position: { x: 40, y: 40 } },
      ],
    };

    const updated = recordTrajectoryPositionAtTime(trajectory, 2.1, 4.0, { x: 48, y: 52 });
    expect(updated.keyframes?.length).toBe(1);
    expect(updated.keyframes?.[0].position).toEqual({ x: 48, y: 52 });
  });

  it('interpolates camera movement accurately with keyframes', () => {
    const camMovement = {
      type: 'track' as const,
      startPosition: { x: 10, y: 20, z: 5 },
      endPosition: { x: 30, y: 60, z: 15 },
      keyframes: [
        { id: 'cam-kf1', time: 2.0, position: { x: 20, y: 40, z: 10 } },
      ],
    };

    const mid = interpolateCameraPosition(camMovement, 2.0, 4.0);
    // (x: 20 -> Three.js x: -30; y: 40 -> Three.js z: -10; z: 10 -> Three.js y: 3)
    expect(mid.x).toBe(-30);
    expect(mid.y).toBe(3);
    expect(mid.z).toBe(-10);
  });
});
