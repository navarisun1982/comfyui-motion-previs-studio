import { ShotSpec } from '../types/shotspec';
import { ModelCapabilityAdapter, ModelCapabilities, CompiledPromptBundle, ComfyWorkflowGraph, ValidationReport } from './types';
import { compilePromptForShot } from '../engine/promptCompiler';

export class MockModelAdapter implements ModelCapabilityAdapter {
  readonly id = 'mock-engine';
  readonly name = 'Mock Directing Engine (Test / Offline)';
  readonly description = 'Instant simulated executor for local development, fast UI testing, and offline previsualization.';

  readonly capabilities: ModelCapabilities = {
    targetModelId: 'mock-engine',
    name: 'Mock Directing Engine',
    isOpenWeights: true,
    maxDurationSeconds: 15.0,
    supportedAspectRatios: ['16:9', '9:16', '2.39:1', '4:3', '1:1'],
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

    if (!shot.name || shot.name.trim().length === 0) {
      errors.push('Shot name is required.');
    }
    if (shot.durationSeconds <= 0) {
      errors.push('Shot duration must be greater than 0 seconds.');
    }
    if (shot.durationSeconds > this.capabilities.maxDurationSeconds) {
      warnings.push(`Duration exceeds recommended ${this.capabilities.maxDurationSeconds}s for mock preview.`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      capabilityNotes: [
        {
          feature: 'Full Camera Physics',
          tier: 'native',
          explanation: 'Mock engine simulates complete camera motion vectors deterministically.',
        },
      ],
    };
  }

  compilePrompt(shot: ShotSpec): CompiledPromptBundle {
    return compilePromptForShot(shot, this.id);
  }

  buildWorkflow(shot: ShotSpec, uploadedImageFilename?: string): ComfyWorkflowGraph {
    const bundle = this.compilePrompt(shot);

    return {
      '1': {
        class_type: 'MockVideoGenerator',
        inputs: {
          prompt: bundle.positivePrompt,
          negative: bundle.negativePrompt,
          camera_type: shot.camera.movement.type,
          camera_speed: shot.camera.movement.speed,
          focal_length: shot.camera.lens.focalLength,
          duration: shot.durationSeconds,
          fps: shot.frameRate,
          reference_image: uploadedImageFilename || 'none',
          seed: shot.seed || 42,
        },
        _meta: {
          title: 'Mock Video Generation Node',
        },
      },
      '2': {
        class_type: 'SaveVideo',
        inputs: {
          video: ['1', 0],
          filename_prefix: `Director_${shot.name.replace(/\s+/g, '_')}`,
        },
        _meta: {
          title: 'Save Video Output',
        },
      },
    };
  }
}
