import { describe, it, expect } from 'vitest';
import { createDefaultShotSpec } from '../src/types/shotspec';
import {
  generateBlenderCameraScript,
  generateRunwayCameraJson,
  generateKlingCameraJson,
  generateComfyWorkflowJson,
  generateSeedanceProductionPack,
} from '../src/engine/pipelineExporters';

describe('Pipeline Exporters (Multi-Platform Production Presets)', () => {
  const dummyShot = createDefaultShotSpec({
    id: 'shot-export-test',
    name: 'Cyberpunk Chase Scene',
    durationSeconds: 5,
    camera: {
      lens: { focalLength: '35mm', aperture: 'f/2.8', sensorSize: 'full-frame' },
      shotType: 'medium',
      angle: 'eye-level',
      movement: {
        type: 'dolly-in',
        speed: 'slow-cinematic',
        startPosition: { x: 50, y: 80, z: 20 },
        endPosition: { x: 50, y: 40, z: 20 },
        targetLookAt: { x: 50, y: 50 },
      },
    },
    actors: [
      {
        id: 'actor-runner',
        name: 'Runner',
        kind: 'human',
        actionDescription: 'sprints past neon storefronts',
        token: 'a cyber runner in neon jacket',
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: 50, y: 50 },
          endPosition: { x: 50, y: 30 },
        },
      },
    ],
  });

  const activeLayers = {
    depth: true,
    masks: true,
    pose: true,
    opticalFlow: false,
    edges: true,
  };

  it('generates runnable Blender camera Python script with keyframes and constraints', () => {
    const py = generateBlenderCameraScript(dummyShot);
    expect(py).toContain('import bpy');
    expect(py).toContain('scene.render.fps = 24');
    expect(py).toContain('cam_data.lens = 35');
    expect(py).toContain('cam_obj.keyframe_insert(data_path="location", frame=1)');
    expect(py).toContain('track_constraint = cam_obj.constraints.new(type=\'TRACK_TO\')');
    expect(py).toContain('"name": "Runner"');
    expect(py).toContain('f"Actor_{act[\'name\']}"');
  });

  it('generates Runway Gen-3 Alpha JSON with camera motion parameters and control layers', () => {
    const runway = generateRunwayCameraJson(dummyShot, activeLayers);
    expect(runway.version).toBe('gen3a_turbo');
    expect(runway.duration).toBe(5);
    expect(runway.cameraMotion.type).toBe('dolly-in');
    expect(runway.controlLayers.depthPass).toBe(true);
    expect(runway.controlLayers.opticalFlow).toBe(false);
  });

  it('generates Kling AI 6-axis motion control JSON', () => {
    const kling = generateKlingCameraJson(dummyShot, activeLayers);
    expect(kling.kling_motion_control.movement_type).toBe('dolly-in');
    expect(typeof kling.kling_motion_control.vertical).toBe('number');
    expect(kling.shot_spec.focal_length).toBe('35mm');
    expect(kling.active_passes.depth).toBe(true);
  });

  it('generates ComfyUI LTX-2.5 diffusion workflow graph with compiled positive prompt', () => {
    const comfy = generateComfyWorkflowJson(dummyShot, activeLayers);
    expect(comfy['1'].class_type).toBe('UNETLoader');
    expect(comfy['4'].class_type).toBe('CLIPTextEncode');
    expect(comfy['4'].inputs.text).toContain('dolly-in');
    expect(comfy['4'].inputs.text).toContain('35mm');
    expect(comfy._pipeline_metadata.shotName).toBe('Cyberpunk Chase Scene');
  });

  it('generates Seedance production pack with 4x4 matrix extrinsics', () => {
    const seedance = generateSeedanceProductionPack(dummyShot, activeLayers, { smoothing: 65 });
    expect(seedance.version).toBe('2.0-seedance');
    expect(seedance.cameraBundle.w2cExtrinsics.length).toBeGreaterThan(0);
    expect(seedance.cameraBundle.c2wPoses.length).toBeGreaterThan(0);
    expect(seedance.activeControlLayers.depth).toBe(true);
  });
});
