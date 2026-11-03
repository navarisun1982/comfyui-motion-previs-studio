import { describe, it, expect, beforeEach } from 'vitest';
import { useShotStore, FRAMING_DISTANCES, ANGLE_ELEVATIONS } from '../src/stores/useShotStore';
import { installMemoryStorage } from './helpers/memoryStorage';

describe('Camera Deck Optics & Framing Mechanics', () => {
  beforeEach(() => {
    installMemoryStorage();
    useShotStore.getState().resetToDefault();
  });

  it('updates Aspect Ratio cleanly across all cinematic standards', () => {
    const store = useShotStore.getState();
    expect(store.shot.aspectRatio).toBe('16:9');

    store.updateAspectRatio('2.39:1');
    expect(useShotStore.getState().shot.aspectRatio).toBe('2.39:1');

    store.updateAspectRatio('9:16');
    expect(useShotStore.getState().shot.aspectRatio).toBe('9:16');

    store.updateAspectRatio('4:3');
    expect(useShotStore.getState().shot.aspectRatio).toBe('4:3');

    store.updateAspectRatio('1:1');
    expect(useShotStore.getState().shot.aspectRatio).toBe('1:1');
  });

  it('dynamically recalculates camera framing distance when shotType changes', () => {
    const store = useShotStore.getState();
    const lookAt = store.shot.camera.movement.targetLookAt ?? { x: 50, y: 50 };

    // Select Close-Up (target distance 18)
    store.setShotType('close-up');
    let shot = useShotStore.getState().shot;
    expect(shot.camera.shotType).toBe('close-up');
    let distStart = Math.hypot(
      shot.camera.movement.startPosition.x - lookAt.x,
      shot.camera.movement.startPosition.y - lookAt.y
    );
    expect(Math.round(distStart)).toBe(FRAMING_DISTANCES['close-up']);

    // Select Wide (target distance 75)
    store.setShotType('wide');
    shot = useShotStore.getState().shot;
    expect(shot.camera.shotType).toBe('wide');
    distStart = Math.hypot(
      shot.camera.movement.startPosition.x - lookAt.x,
      shot.camera.movement.startPosition.y - lookAt.y
    );
    expect(Math.round(distStart)).toBe(FRAMING_DISTANCES['wide']);

    // Select Extreme Close-Up (target distance 10)
    store.setShotType('extreme-close-up');
    shot = useShotStore.getState().shot;
    expect(shot.camera.shotType).toBe('extreme-close-up');
    distStart = Math.hypot(
      shot.camera.movement.startPosition.x - lookAt.x,
      shot.camera.movement.startPosition.y - lookAt.y
    );
    expect(Math.round(distStart)).toBe(FRAMING_DISTANCES['extreme-close-up']);
  });

  it('dynamically adjusts camera elevation Z for all 6 cinematic angles', () => {
    const store = useShotStore.getState();

    // Low Angle -> low elevation Z (18%)
    store.setCameraAngle('low-angle');
    let shot = useShotStore.getState().shot;
    expect(shot.camera.angle).toBe('low-angle');
    expect(shot.camera.movement.startPosition.z).toBe(ANGLE_ELEVATIONS['low-angle']);

    // High Angle -> high elevation Z (75%)
    store.setCameraAngle('high-angle');
    shot = useShotStore.getState().shot;
    expect(shot.camera.angle).toBe('high-angle');
    expect(shot.camera.movement.startPosition.z).toBe(ANGLE_ELEVATIONS['high-angle']);

    // Overhead God's Eye -> top elevation Z (98%)
    store.setCameraAngle('overhead-gods-eye');
    shot = useShotStore.getState().shot;
    expect(shot.camera.angle).toBe('overhead-gods-eye');
    expect(shot.camera.movement.startPosition.z).toBe(ANGLE_ELEVATIONS['overhead-gods-eye']);

    // Ground Level -> ground elevation Z (5%)
    store.setCameraAngle('ground-level');
    shot = useShotStore.getState().shot;
    expect(shot.camera.angle).toBe('ground-level');
    expect(shot.camera.movement.startPosition.z).toBe(ANGLE_ELEVATIONS['ground-level']);

    // Eye Level -> neutral eye elevation Z (45%)
    store.setCameraAngle('eye-level');
    shot = useShotStore.getState().shot;
    expect(shot.camera.angle).toBe('eye-level');
    expect(shot.camera.movement.startPosition.z).toBe(ANGLE_ELEVATIONS['eye-level']);
  });

  it('updates Movement Speed and normalizes dynamic speed', () => {
    const store = useShotStore.getState();

    store.setCameraMovement('truck-left', 'slow-cinematic');
    expect(useShotStore.getState().shot.camera.movement.type).toBe('truck-left');
    expect(useShotStore.getState().shot.camera.movement.speed).toBe('slow-cinematic');

    store.setCameraMovement('dolly-in', 'rapid-dynamic');
    expect(useShotStore.getState().shot.camera.movement.type).toBe('dolly-in');
    expect(useShotStore.getState().shot.camera.movement.speed).toBe('rapid-dynamic');

    store.setCameraMovement('pan-right', 'moderate');
    expect(useShotStore.getState().shot.camera.movement.type).toBe('pan-right');
    expect(useShotStore.getState().shot.camera.movement.speed).toBe('moderate');
  });

  it('automatically updates start/end positions when switching camera movement presets and evaluates live Top-View stage state', async () => {
    const { evaluateLiveCameraStageState } = await import('../src/engine/trajectoryMath');
    const store = useShotStore.getState();

    // 1. Switch to static -> start and end should match
    store.setCameraMovement('static');
    let shot = useShotStore.getState().shot;
    expect(shot.camera.movement.endPosition.x).toBe(shot.camera.movement.startPosition.x);
    expect(shot.camera.movement.endPosition.y).toBe(shot.camera.movement.startPosition.y);

    // 2. Switch from static to truck-right -> endPosition.x should shift right (> startPosition.x)
    store.setCameraMovement('truck-right', 'moderate');
    shot = useShotStore.getState().shot;
    expect(shot.camera.movement.endPosition.x).toBeGreaterThan(shot.camera.movement.startPosition.x);

    const midTruck = evaluateLiveCameraStageState(shot.camera, shot.actors, 2.0, 4.0);
    expect(midTruck.position.x).toBeGreaterThan(shot.camera.movement.startPosition.x);

    // 3. Switch to dolly-out -> endPosition.y should move further back (> startPosition.y)
    store.setCameraMovement('dolly-out', 'moderate');
    shot = useShotStore.getState().shot;
    expect(shot.camera.movement.endPosition.y).toBeGreaterThan(shot.camera.movement.startPosition.y);

    // 4. Switch to orbit-clockwise -> live Top-View state should trace a curved orbital path around targetLookAt
    store.setCameraMovement('orbit-clockwise', 'moderate');
    shot = useShotStore.getState().shot;
    const orbitStart = evaluateLiveCameraStageState(shot.camera, shot.actors, 0, 4.0);
    const orbitMid = evaluateLiveCameraStageState(shot.camera, shot.actors, 2.0, 4.0);
    expect(Math.hypot(orbitMid.position.x - orbitStart.position.x, orbitMid.position.y - orbitStart.position.y)).toBeGreaterThan(10);
    expect(orbitMid.pathPoints.length).toBeGreaterThan(10);

    // 5. Switch to pan-right -> live Top-View lookAt target shifts horizontally over time
    store.setCameraMovement('pan-right', 'moderate');
    shot = useShotStore.getState().shot;
    const panStart = evaluateLiveCameraStageState(shot.camera, shot.actors, 0, 4.0);
    const panEnd = evaluateLiveCameraStageState(shot.camera, shot.actors, 4.0, 4.0);
    expect(panEnd.lookAt.x).toBeGreaterThan(panStart.lookAt.x);
  });
});
