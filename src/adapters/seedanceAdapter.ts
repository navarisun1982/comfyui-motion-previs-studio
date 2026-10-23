import { ShotSpec } from '../types/shotspec';
import { ModelCapabilityAdapter, ModelCapabilities, CompiledPromptBundle, ComfyWorkflowGraph, ValidationReport } from './types';
import { compilePromptForShot } from '../engine/promptCompiler';

export class SeedanceAdapter implements ModelCapabilityAdapter {
  readonly id = 'seedance';
  readonly name = 'Seedance 2.0 (Camera Matrix & Multi-Subject Dynamics)';
  readonly description = 'ByteDance Seedance architecture featuring 6-axis camera motion control, dynamic physical trajectory alignment, and spatial depth.';

  readonly capabilities: ModelCapabilities = {
    targetModelId: 'seedance',
    name: 'Seedance 2.0 (ByteDance Seaweed)',
    isOpenWeights: false,
    maxDurationSeconds: 12.0,
    supportedAspectRatios: ['16:9', '9:16', '4:3', '1:1', '2.39:1'],
    cameraMovements: {
      'static': 'native',
      'dolly-in': 'native',
      'dolly-out': 'native',
      'truck-left': 'native',
      'truck-right': 'native',
      'pedestal-up': 'native',
      'pedestal-down': 'native',
      'pan-left': 'native',
      'pan-right': 'native',
      'tilt-up': 'native',
      'tilt-down': 'native',
      'orbit-clockwise': 'native',
      'orbit-counter-clockwise': 'native',
      'zoom-in': 'native',
      'zoom-out': 'native',
      'handheld-subtle': 'native',
      'whip-pan': 'native',
    },
    focalLengthControl: 'native',
    actorTrajectoryControl: 'native',
    referenceImageControl: 'native',
    lightingControl: 'native',
  };

  validate(shot: ShotSpec): ValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const capabilityNotes: ValidationReport['capabilityNotes'] = [];

    if (!shot.name || shot.name.trim().length === 0) {
      errors.push('Shot name is required.');
    }
    if (shot.durationSeconds < 1.0) {
      errors.push('Seedance requires at least 1.0s shot duration.');
    }
    if (shot.durationSeconds > 12.0) {
      errors.push('Seedance maximum shot duration is 12.0s.');
    }

    capabilityNotes.push({
      feature: `6-Axis Matrix Motion (${shot.camera.movement.type})`,
      tier: 'native',
      explanation: 'Seedance natively executes 6-axis coordinate-based camera motion with continuous trajectory tracking.',
    });

    capabilityNotes.push({
      feature: `Subject Physical Vectors (${shot.actors.length} actors)`,
      tier: 'native',
      explanation: 'Seedance aligns multi-actor locomotion and cloth aerodynamics with 3D stage coordinate marks.',
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      capabilityNotes,
    };
  }

  compilePrompt(shot: ShotSpec): CompiledPromptBundle {
    const base = compilePromptForShot(shot, this.id);

    let vfxNote = '';
    if (shot.vfxReference?.enabled) {
      const mode = shot.vfxReference.referenceMode;
      if (mode === 'actor-motion') {
        vfxNote = ' [Choreography Reference: retaining exact human actor physical choreography, expressive facial nuances, photorealistic cinematic re-skinning]';
      } else if (mode === 'camera-only') {
        vfxNote = ' [Camera Trajectory Reference: replicating continuous optical flow camera movement from plate, completely original scene]';
      } else if (mode === 'full-scene') {
        vfxNote = ' [Full Scene VFX Reference: preserving spatial depth rhythm, volumetric lighting transformation]';
      } else if (mode === 'object-motion') {
        vfxNote = ' [Object Motion Reference: preserving motion vector dynamics, stylized redesign]';
      }
    }

    const positivePrompt = vfxNote ? `${base.positivePrompt} ${vfxNote}` : base.positivePrompt;

    return {
      ...base,
      positivePrompt,
      technicalMetadata: {
        ...base.technicalMetadata,
        targetModel: 'Seedance 2.0',
        vfxReferenceMode: shot.vfxReference?.enabled ? shot.vfxReference.referenceMode : undefined,
      },
    };
  }

  buildWorkflow(shot: ShotSpec, uploadedImageFilename?: string): ComfyWorkflowGraph {
    const bundle = this.compilePrompt(shot);

    const graph: ComfyWorkflowGraph = {
      '1': {
        class_type: 'SeedanceModelLoader',
        inputs: {
          model_name: 'seedance_2.0_motion_matrix.safetensors',
          precision: 'fp8_e4m3fn',
        },
        _meta: { title: 'Seedance 2.0 Model Loader' },
      },
      '2': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: bundle.positivePrompt,
          clip: ['1', 1],
        },
        _meta: { title: 'Director Positive Directives (Seedance)' },
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: bundle.negativePrompt,
          clip: ['1', 1],
        },
        _meta: { title: 'Director Negative Directives (Seedance)' },
      },
      '4': {
        class_type: 'SeedanceVideoSampler',
        inputs: {
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['3', 0],
          duration: shot.durationSeconds,
          fps: shot.frameRate,
          steps: 25,
          cfg: 4.0,
        },
        _meta: { title: 'Seedance Matrix Sampler' },
      },
      '5': {
        class_type: 'SaveAnimatedWEBP',
        inputs: {
          filename_prefix: `Seedance_${shot.name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
          fps: shot.frameRate,
          images: ['4', 0],
        },
        _meta: { title: 'Save Rendered Seedance Video' },
      },
    };

    if (uploadedImageFilename) {
      graph['6'] = {
        class_type: 'LoadImage',
        inputs: {
          image: uploadedImageFilename,
        },
        _meta: { title: 'Load Seedance Visual Reference' },
      };
      graph['4'].inputs.init_image = ['6', 0];
    }

    return graph;
  }
}
