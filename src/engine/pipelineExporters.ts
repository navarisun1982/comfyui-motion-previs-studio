import { ShotSpec } from '../types/shotspec';
import { exportCameraPoseBundle } from './cameraMatrixExport';
import { compilePromptForShot } from './promptCompiler';

export interface ActiveControlLayers {
  depth: boolean;
  masks: boolean;
  pose: boolean;
  opticalFlow: boolean;
  edges: boolean;
}

/**
 * Generates an authentic, runnable Blender 3.x / 4.x Python script (`.py`).
 * Configures camera focal length, sensor specs, 24 FPS animation timeline,
 * camera location and look-at tracking keyframes, and actor locator empties.
 */
export function generateBlenderCameraScript(shot: ShotSpec): string {
  const fps = shot.frameRate || 24;
  const duration = shot.durationSeconds || 4;
  const endFrame = Math.round(duration * fps);
  const focalLengthNum = parseInt(shot.camera.lens?.focalLength || '35', 10) || 35;

  const startX = ((shot.camera.movement.startPosition.x - 50.0) * 0.1).toFixed(3);
  const startY = ((shot.camera.movement.startPosition.y - 50.0) * 0.1).toFixed(3);
  const startZ = (((shot.camera.movement.startPosition.z ?? 50.0) - 50.0) * 0.1 + 1.6).toFixed(3);

  const endX = ((shot.camera.movement.endPosition.x - 50.0) * 0.1).toFixed(3);
  const endY = ((shot.camera.movement.endPosition.y - 50.0) * 0.1).toFixed(3);
  const endZ = (((shot.camera.movement.endPosition.z ?? 50.0) - 50.0) * 0.1 + 1.6).toFixed(3);

  const actorsJson = JSON.stringify(
    shot.actors.map((a) => ({
      name: a.name.replace(/[^a-zA-Z0-9_]/g, '_'),
      kind: a.kind,
      startX: Number(((a.trajectory.startPosition.x - 50.0) * 0.1).toFixed(3)),
      startY: Number(((a.trajectory.startPosition.y - 50.0) * 0.1).toFixed(3)),
      endX: Number(((a.trajectory.endPosition.x - 50.0) * 0.1).toFixed(3)),
      endY: Number(((a.trajectory.endPosition.y - 50.0) * 0.1).toFixed(3)),
    })),
    null,
    2
  );

  return `"""
ComfyUI Motion Previs Studio - Blender Camera & Staging Setup
Shot: ${shot.name}
Duration: ${duration}s | Focal Length: ${focalLengthNum}mm | FPS: ${fps}
Generated automatically by ComfyUI Motion Previs Studio.
Run this script inside Blender Scripting Workspace or via:
blender --python script.py
"""

import bpy
import math

scene = bpy.context.scene
scene.render.fps = ${fps}
scene.frame_start = 1
scene.frame_end = ${endFrame}

# 1. Create or Update Cinematic Director Camera
cam_name = "${shot.name.replace(/[^a-zA-Z0-9_]/g, '_')}_DirectorCam"
cam_data = bpy.data.cameras.new(name=cam_name)
cam_data.lens = ${focalLengthNum}
cam_data.sensor_width = 36.0  # 35mm Full-Frame Standard
cam_data.sensor_height = 24.0
cam_data.clip_start = 0.1
cam_data.clip_end = 250.0

cam_obj = bpy.data.objects.new(cam_name, cam_data)
bpy.context.collection.objects.link(cam_obj)
scene.camera = cam_obj

# Frame 1 Keyframe (Start Location)
cam_obj.location = (${startX}, ${startY}, ${startZ})
cam_obj.keyframe_insert(data_path="location", frame=1)

# Frame End Keyframe (End Location)
cam_obj.location = (${endX}, ${endY}, ${endZ})
cam_obj.keyframe_insert(data_path="location", frame=scene.frame_end)

# Linear / Bezier Keyframe Interpolation
if cam_obj.animation_data and cam_obj.animation_data.action:
    for fcurve in cam_obj.animation_data.action.fcurves:
        for kp in fcurve.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.easing = 'EASE_IN_OUT'

# 2. Add LookAt Target Empty
target_name = "${shot.name.replace(/[^a-zA-Z0-9_]/g, '_')}_LookAtTarget"
target_empty = bpy.data.objects.new(target_name, None)
target_empty.empty_display_type = 'SPHERE'
target_empty.empty_display_size = 0.4
target_empty.location = (0.0, 0.0, 1.2)
bpy.context.collection.objects.link(target_empty)

track_constraint = cam_obj.constraints.new(type='TRACK_TO')
track_constraint.target = target_empty
track_constraint.track_axis = 'TRACK_NEGATIVE_Z'
track_constraint.up_axis = 'UP_Y'

# 3. Spawn Actor Staging Empties with Trajectories
actors = ${actorsJson}

for act in actors:
    actor_obj = bpy.data.objects.new(f"Actor_{act['name']}", None)
    actor_obj.empty_display_type = 'CUBE'
    actor_obj.empty_display_size = 0.5
    bpy.context.collection.objects.link(actor_obj)

    # Start position at Frame 1
    actor_obj.location = (act['startX'], act['startY'], 0.0)
    actor_obj.keyframe_insert(data_path="location", frame=1)

    # End position at End Frame
    actor_obj.location = (act['endX'], act['endY'], 0.0)
    actor_obj.keyframe_insert(data_path="location", frame=scene.frame_end)

    if actor_obj.animation_data and actor_obj.animation_data.action:
        for fcurve in actor_obj.animation_data.action.fcurves:
            for kp in fcurve.keyframe_points:
                kp.interpolation = 'BEZIER'

print(f"[ComfyUI Motion Previs Studio] Successfully imported camera and {len(actors)} staging actors for shot '${shot.name}'.")
`;
}

/**
 * Generates Runway Gen-3 Alpha Camera Motion specification JSON.
 */
export function generateRunwayCameraJson(
  shot: ShotSpec,
  layers: ActiveControlLayers
): Record<string, any> {
  const dx = (shot.camera.movement.endPosition.x - shot.camera.movement.startPosition.x) / 50.0;
  const dy = (shot.camera.movement.endPosition.y - shot.camera.movement.startPosition.y) / 50.0;
  const dz = (((shot.camera.movement.endPosition.z ?? 50) - (shot.camera.movement.startPosition.z ?? 50))) / 50.0;

  const speedScale =
    shot.camera.movement.speed === 'slow-cinematic' ? 0.5 : shot.camera.movement.speed === 'rapid-dynamic' ? 1.5 : 1.0;

  return {
    version: 'gen3a_turbo',
    promptText: shot.sceneDescription,
    duration: shot.durationSeconds,
    aspectRatio: shot.aspectRatio === '9:16' ? 'portrait' : 'landscape',
    cameraMotion: {
      type: shot.camera.movement.type,
      speed: Number((speedScale).toFixed(2)),
      pan: Number((dx * speedScale).toFixed(2)),
      tilt: Number((-dy * speedScale).toFixed(2)),
      zoom: Number((dz * speedScale).toFixed(2)),
      roll: 0.0,
      horizontal: Number((dx * speedScale).toFixed(2)),
      vertical: Number((dy * speedScale).toFixed(2)),
    },
    controlLayers: {
      depthPass: layers.depth,
      actorMasks: layers.masks,
      posePass: layers.pose,
      opticalFlow: layers.opticalFlow,
      edgePass: layers.edges,
    },
    metadata: {
      shotName: shot.name,
      focalLength: shot.camera.lens.focalLength,
      frameRate: shot.frameRate,
      actorsCount: shot.actors.length,
      generator: 'ComfyUI Motion Previs Studio - Runway Gen-3 Exporter',
    },
  };
}

/**
 * Generates Kling AI 6-Axis Camera Movement Control specification JSON.
 */
export function generateKlingCameraJson(
  shot: ShotSpec,
  layers: ActiveControlLayers
): Record<string, any> {
  const dx = (shot.camera.movement.endPosition.x - shot.camera.movement.startPosition.x) / 10.0;
  const dy = (shot.camera.movement.endPosition.y - shot.camera.movement.startPosition.y) / 10.0;
  const dz = (((shot.camera.movement.endPosition.z ?? 50) - (shot.camera.movement.startPosition.z ?? 50))) / 10.0;

  return {
    kling_motion_control: {
      movement_type: shot.camera.movement.type,
      horizontal: Number(dx.toFixed(2)),
      vertical: Number(dy.toFixed(2)),
      zoom: Number(dz.toFixed(2)),
      pan: Number((dx * 0.7).toFixed(2)),
      tilt: Number((-dy * 0.7).toFixed(2)),
      roll: 0.0,
    },
    shot_spec: {
      duration_seconds: shot.durationSeconds,
      aspect_ratio: shot.aspectRatio,
      camera_angle: shot.camera.angle,
      shot_type: shot.camera.shotType,
      focal_length: shot.camera.lens.focalLength,
      lighting: shot.lighting.style,
    },
    active_passes: layers,
    source: 'ComfyUI Motion Previs Studio (Kling AI Bridge)',
  };
}

/**
 * Generates full ComfyUI API Execution Graph JSON with compiled LTX-2.5 nodes and camera parameters.
 */
export function generateComfyWorkflowJson(
  shot: ShotSpec,
  layers: ActiveControlLayers
): Record<string, any> {
  const bundle = compilePromptForShot(shot, 'ltx-2.5');

  return {
    "1": {
      "class_type": "UNETLoader",
      "inputs": {
        "unet_name": "LTX2.5\\\\ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors",
        "weight_dtype": "default"
      },
      "_meta": { "title": "Load LTX-2.5 Transformer (INT8)" }
    },
    "2": {
      "class_type": "DualCLIPLoader",
      "inputs": {
        "clip_name1": "LTX2.5\\\\gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors",
        "clip_name2": "LTX2.5\\\\gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors",
        "type": "ltxv"
      },
      "_meta": { "title": "Load Gemma 12B Dual CLIP" }
    },
    "3": {
      "class_type": "VAELoader",
      "inputs": { "vae_name": "LTX-VAE.ckpt" },
      "_meta": { "title": "Load LTX VAE" }
    },
    "4": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": ["2", 0],
        "text": bundle.positivePrompt
      },
      "_meta": { "title": "Compiled Director Positive Prompt" }
    },
    "5": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": ["2", 0],
        "text": bundle.negativePrompt
      },
      "_meta": { "title": "Negative Conditioning" }
    },
    "8": {
      "class_type": "EmptyLTXVLatentVideo",
      "inputs": {
        "width": shot.aspectRatio === '9:16' ? 432 : 768,
        "height": shot.aspectRatio === '9:16' ? 768 : 432,
        "length": Math.min(121, Math.round(shot.durationSeconds * 24) + 1),
        "batch_size": 1
      },
      "_meta": { "title": "Empty LTXV Latent Video" }
    },
    "9": {
      "class_type": "KSampler",
      "inputs": {
        "model": ["1", 0],
        "positive": ["4", 0],
        "negative": ["5", 0],
        "latent_image": ["8", 0],
        "seed": Math.floor(Math.random() * 1000000000),
        "steps": 25,
        "cfg": 3.5,
        "sampler_name": "euler",
        "scheduler": "normal",
        "denoise": 1.0
      },
      "_meta": { "title": "Directorial Diffusion Sampler" }
    },
    "10": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["9", 0],
        "vae": ["3", 0]
      },
      "_meta": { "title": "Decode Video Frames" }
    },
    "11": {
      "class_type": "SaveAnimatedWEBP",
      "inputs": {
        "filename_prefix": `AI_Director_${shot.name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
        "fps": 24,
        "lossless": false,
        "quality": 90,
        "method": "default",
        "images": ["10", 0]
      },
      "_meta": { "title": "Save Rendered Video Plate" }
    },
    "_pipeline_metadata": {
      "shotId": shot.id,
      "shotName": shot.name,
      "cameraExtrinsics": exportCameraPoseBundle(shot),
      "activeLayers": layers,
      "directorPrompt": bundle,
    }
  };
}

/**
 * Generates Seedance Production Pack JSON with complete 4x4 matrix poses per frame.
 */
export function generateSeedanceProductionPack(
  shot: ShotSpec,
  layers: ActiveControlLayers,
  vfxSettings: Record<string, any>
): Record<string, any> {
  return {
    version: '2.0-seedance',
    generator: 'ComfyUI Motion Previs Studio - Production Matrix Pipeline',
    timestamp: new Date().toISOString(),
    shotSpec: shot,
    cameraBundle: exportCameraPoseBundle(shot),
    activeControlLayers: layers,
    vfxSettings,
    actorsStageData: shot.actors.map((actor) => ({
      id: actor.id,
      name: actor.name,
      kind: actor.kind,
      token: actor.token,
      scale: actor.scale ?? 1.0,
      startPosition: actor.trajectory.startPosition,
      endPosition: actor.trajectory.endPosition,
    })),
  };
}
