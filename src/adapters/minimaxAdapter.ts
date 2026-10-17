import { ShotSpec } from '../types/shotspec';
import { ModelCapabilityAdapter, ModelCapabilities, CompiledPromptBundle, ComfyWorkflowGraph, ValidationReport } from './types';
import { compilePromptForShot } from '../engine/promptCompiler';

export class MiniMaxAdapter implements ModelCapabilityAdapter {
  readonly id = 'minimax-h3';
  readonly name = 'MiniMax H3 / Hailuo (Photorealism & Character Motion)';
  readonly description = 'Specialized in lifelike human character physics, micro-expressions, fluid choreography, and natural atmospheric depth.';

  readonly capabilities: ModelCapabilities = {
    targetModelId: 'minimax-h3',
    name: 'MiniMax H3 / Hailuo Video',
    isOpenWeights: false,
    maxDurationSeconds: 10.0,
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
      errors.push('MiniMax requires at least 1.0s shot duration.');
    }
    if (shot.durationSeconds > 10.0) {
      errors.push('MiniMax max shot duration is 10.0s.');
    }

    capabilityNotes.push({
      feature: `Lens: ${shot.camera.lens.focalLength}`,
      tier: 'native',
      explanation: 'MiniMax natively understands optical depth of field, background compression, and bokeh for this focal length.',
    });

    capabilityNotes.push({
      feature: `Actor Choreography (${shot.actors.length} actors)`,
      tier: 'native',
      explanation: 'MiniMax excels at organic character motion, natural eye-lines, and realistic cloth/body dynamics.',
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

    // MiniMax prompt optimization: enrich with narrative continuity and sensory texture
    const cameraMotion = shot.camera.movement.type.replace(/-/g, ' ');
    const lensInfo = `${shot.camera.lens.focalLength} lens, shallow focus`;
    const lightingMood = `${shot.lighting.style.replace(/-/g, ' ')}, ${shot.lighting.direction.replace(/-/g, ' ')} illumination`;

    const positivePrompt = `${base.positivePrompt}. Captured with a smooth continuous ${cameraMotion} motion, filmed on high-end cinema glass (${lensInfo}), beautiful volumetric ${lightingMood}, cinematic photorealism, lifelike human motion.`;

    return {
      ...base,
      positivePrompt,
      technicalMetadata: {
        targetModel: 'MiniMax H3 / Hailuo',
        duration: shot.durationSeconds,
        fps: shot.frameRate,
        focalLength: shot.camera.lens.focalLength,
        aspectRatio: shot.aspectRatio,
      },
    };
  }

  buildWorkflow(shot: ShotSpec, uploadedImageFilename?: string): ComfyWorkflowGraph {
    const bundle = this.compilePrompt(shot);

    // Compute dimensions
    let width = 1280;
    let height = 720;
    if (shot.aspectRatio === '9:16') {
      width = 720;
      height = 1280;
    } else if (shot.aspectRatio === '4:3') {
      width = 1024;
      height = 768;
    } else if (shot.aspectRatio === '1:1') {
      width = 1024;
      height = 1024;
    } else if (shot.aspectRatio === '2.39:1') {
      width = 1344;
      height = 576;
    }

    const frameCount = Math.round(shot.durationSeconds * 24);

    const graph: ComfyWorkflowGraph = {
      '1': {
        class_type: 'MiniMaxModelLoader',
        inputs: {
          model_name: 'minimax_h3_video.safetensors',
          precision: 'fp8_e4m3fn',
        },
        _meta: { title: 'MiniMax Model Loader' },
      },
      '2': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: bundle.positivePrompt,
          clip: ['1', 1],
        },
        _meta: { title: 'Director Positive Directives (MiniMax)' },
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: bundle.negativePrompt,
          clip: ['1', 1],
        },
        _meta: { title: 'Director Negative Directives' },
      },
      '4': {
        class_type: 'MiniMaxVideoSampler',
        inputs: {
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['3', 0],
          width,
          height,
          frames: frameCount,
          fps: shot.frameRate,
          motion_bucket_id: 127,
          cfg_scale: 6.0,
          steps: 25,
          seed: shot.timestamp % 1000000,
        },
        _meta: { title: 'MiniMax Video Sampler' },
      },
      '5': {
        class_type: 'SaveAnimatedWEBP',
        inputs: {
          images: ['4', 0],
          filename_prefix: `MiniMax_${shot.name.replace(/\s+/g, '_')}`,
          fps: shot.frameRate,
          lossless: false,
          quality: 90,
          method: 'default',
        },
        _meta: { title: 'Directorial Output Video' },
      },
    };

    if (uploadedImageFilename) {
      graph['6'] = {
        class_type: 'LoadImage',
        inputs: {
          image: uploadedImageFilename,
        },
        _meta: { title: 'Reference Keyframe' },
      };
      // Inject image into sampler
      graph['4'].inputs['init_image'] = ['6', 0];
    }

    return graph;
  }
}
