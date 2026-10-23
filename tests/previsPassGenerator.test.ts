import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { projectActorJointsTo2D } from '../src/engine/previsPassGenerator';
import { Actor } from '../src/types/shotspec';

describe('Proposal 2: Real Depth & OpenPose Canvas Extraction', () => {
  it('projects 3D human actor joints onto 2D camera viewport coordinates', () => {
    const actor: Actor = {
      id: 'actor-center',
      name: 'Center Subject',
      kind: 'human',
      token: 'a lead character',
      actionDescription: 'standing tall and alert',
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 50, y: 50 },
        endPosition: { x: 50, y: 50 },
      },
    };

    // Camera positioned at (0, 5, 25) looking toward stage center (0, 0, 0)
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
    camera.position.set(0, 5, 25);
    camera.lookAt(0, 1.5, 0);
    camera.updateMatrixWorld();

    const pose = projectActorJointsTo2D(actor, camera, 0, 4.0, 1280, 720);
    expect(pose.actorId).toBe('actor-center');
    expect(pose.keypoints.length).toBe(19);

    const nose = pose.keypoints.find((k) => k.name === 'nose');
    const pelvis = pose.keypoints.find((k) => k.name === 'pelvis');
    const rAnkle = pose.keypoints.find((k) => k.name === 'rAnkle');

    expect(nose).toBeDefined();
    expect(pelvis).toBeDefined();
    expect(rAnkle).toBeDefined();

    // Actor is centered laterally, so X coordinate should be near 640 (1280 / 2)
    expect(nose!.x).toBeGreaterThan(600);
    expect(nose!.x).toBeLessThan(680);

    // In 2D screen space (Y=0 is top): Head nose should be above pelvis, pelvis above ankle
    expect(nose!.y).toBeLessThan(pelvis!.y);
    expect(pelvis!.y).toBeLessThan(rAnkle!.y);
    expect(nose!.visible).toBe(true);
  });
});
