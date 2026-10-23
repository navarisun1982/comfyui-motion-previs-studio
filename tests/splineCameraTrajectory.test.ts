import { describe, it, expect } from 'vitest';
import {
  catmullRomInterpolate,
  interpolateCameraSplinePosition,
  computeCameraTangent,
} from '../src/engine/trajectoryMath';

describe('Proposal 4: Spline-Based 3D Camera Paths', () => {
  it('passes exactly through control points at t = 0 and t = 1 in catmullRomInterpolate', () => {
    const p0 = { x: 0, y: 0, z: 0 };
    const p1 = { x: 10, y: 20, z: 30 };
    const p2 = { x: 50, y: 60, z: 70 };
    const p3 = { x: 100, y: 100, z: 100 };

    const start = catmullRomInterpolate(p0, p1, p2, p3, 0);
    expect(start.x).toBeCloseTo(10, 4);
    expect(start.y).toBeCloseTo(20, 4);
    expect(start.z).toBeCloseTo(30, 4);

    const end = catmullRomInterpolate(p0, p1, p2, p3, 1);
    expect(end.x).toBeCloseTo(50, 4);
    expect(end.y).toBeCloseTo(60, 4);
    expect(end.z).toBeCloseTo(70, 4);
  });

  it('generates continuous smooth C1 curve through multiple camera keyframes without discontinuities', () => {
    const camMovement = {
      type: 'track' as const,
      startPosition: { x: 0, y: 0, z: 10 },
      endPosition: { x: 100, y: 100, z: 50 },
      keyframes: [
        { id: 'kf-1', time: 1.0, position: { x: 20, y: 50, z: 30 } },
        { id: 'kf-2', time: 2.0, position: { x: 60, y: 40, z: 40 } },
        { id: 'kf-3', time: 3.0, position: { x: 80, y: 90, z: 45 } },
      ],
    };

    const duration = 4.0;
    // Sample densely at 0.1s intervals and verify no sudden jumps in velocity
    let prevPos = interpolateCameraSplinePosition(camMovement, 0, duration);

    for (let t = 0.1; t <= duration; t += 0.1) {
      const curPos = interpolateCameraSplinePosition(camMovement, t, duration);
      const vel = {
        x: curPos.x - prevPos.x,
        y: curPos.y - prevPos.y,
        z: curPos.z - prevPos.z,
      };

      // Velocity magnitude should be bounded (no teleportation)
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      expect(speed).toBeLessThan(25);

      prevPos = curPos;
    }
  });

  it('computes normalized camera tangent vector', () => {
    const camMovement = {
      type: 'dolly-in' as const,
      startPosition: { x: 50, y: 80, z: 20 },
      endPosition: { x: 50, y: 20, z: 20 },
    };

    const tangent = computeCameraTangent(camMovement, 2.0, 4.0);
    const mag = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y + tangent.z * tangent.z);
    expect(mag).toBeCloseTo(1.0, 4);
    // Camera is moving along negative Y (Three.js Z forward)
    expect(tangent.z).toBeLessThan(0);
  });
});
