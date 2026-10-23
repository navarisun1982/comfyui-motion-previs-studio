import { ShotSpec } from '../types/shotspec';
import { ModelCapabilityAdapter, ModelCapabilities, CompiledPromptBundle, ComfyWorkflowGraph, ValidationReport } from './types';
import { compilePromptForShot } from '../engine/promptCompiler';

export class LTXVideoAdapter implements ModelCapabilityAdapter {
  readonly id = 'ltx-2.5';
  readonly name = 'LTX-2.5 Video Model (Open Weights / VFX)';
  readonly description = 'Flagship 22B Distilled INT8 Transformer running on local RTX 3090. Qualifies for Open Weights & LTX VFX Bonus.';

  readonly capabilities: ModelCapabilities = {
    targetModelId: 'ltx-2.5',
    name: 'LTX-2.5 Video',
    isOpenWeights: true,
    maxDurationSeconds: 8.0,
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
      'whip-pan': 'approximated',
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
      errors.push('LTX-2.5 requires minimum 1.0s shot duration.');
    }
    if (shot.durationSeconds > 8.0) {
      warnings.push('Durations above 8.0s may require high VRAM during decoding. 3-5 seconds recommended.');
    }

    const movementTier = this.capabilities.cameraMovements[shot.camera.movement.type] || 'approximated';
    capabilityNotes.push({
      feature: `Camera Movement: ${shot.camera.movement.type}`,
      tier: movementTier,
      explanation: movementTier === 'native' 
        ? 'LTX-2.5 supports direct spatial camera trajectories via prompt conditioning and latent guidance.'
        : 'Approximated through stylistic prompt tokens.',
    });

    capabilityNotes.push({
      feature: `Lens: ${shot.camera.lens.focalLength}`,
      tier: 'native',
      explanation: 'Gemma 12B CLIP projection encoder natively decodes optical focal length descriptors.',
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
    if (shot.vfxReference?.enabled) {
      const mode = shot.vfxReference.referenceMode;
      let vfxDirectives = '';
      if (mode === 'actor-motion') {
        vfxDirectives = 'Preserving exact human choreography and physical motion dynamics from reference plate, photorealistic cinematic character re-skinning.';
      } else if (mode === 'camera-only') {
        vfxDirectives = 'Matching continuous optical flow camera trajectory from reference plate, generating brand-new scene and subjects.';
      } else if (mode === 'full-scene') {
        vfxDirectives = 'Preserving volumetric spatial depth rhythm and actor blocking, cinematic re-lighting and textural transformation.';
      } else if (mode === 'object-motion') {
        vfxDirectives = 'Preserving trajectory vector and physical velocity of moving elements, redesigned appearance.';
      }

      return {
        ...base,
        positivePrompt: `${base.positivePrompt}. ${vfxDirectives}`,
        technicalMetadata: {
          ...base.technicalMetadata,
          vfxReferenceMode: mode,
          depthGuidance: shot.vfxReference.depthGuidanceWeight,
        },
      };
    }
    return base;
  }

  buildWorkflow(shot: ShotSpec, uploadedImageFilename?: string): ComfyWorkflowGraph {
    const bundle = this.compilePrompt(shot);

    // Calculate dimensions based on aspect ratio snapping to 32px multiples for LTX
    let width = 768;
    let height = 432; // 16:9 default (divisible by 16/32)
    if (shot.aspectRatio === '9:16') {
      width = 432;
      height = 768;
    } else if (shot.aspectRatio === '2.39:1') {
      width = 832;
      height = 352;
    } else if (shot.aspectRatio === '1:1') {
      width = 512;
      height = 512;
    }

    // Number of frames = duration * fps (e.g. 4s * 24fps = 97 frames in LTX frame format: 8k + 1)
    const rawFrames = Math.round(shot.durationSeconds * shot.frameRate);
    const frameCount = Math.floor(rawFrames / 8) * 8 + 1; // LTX requires 8n + 1 frames
    const seed = shot.seed ?? Math.floor(Math.random() * 1000000000);

    const workflow: ComfyWorkflowGraph = {
      // 1. Model Loader
      '1': {
        class_type: 'UNETLoader',
        inputs: {
          unet_name: 'LTX2.5/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
          weight_dtype: 'default',
        },
        _meta: { title: 'Load LTX-2.5 Transformer (INT8)' },
      },
      // 2. Dual CLIP Loader
      '2': {
        class_type: 'DualCLIPLoader',
        inputs: {
          clip_name1: 'LTX2.5/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
          clip_name2: 'LTX2.5/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
          type: 'ltxv',
        },
        _meta: { title: 'Load Gemma 12B CLIP' },
      },
      // 3. VAE Loader
      '3': {
        class_type: 'VAELoader',
        inputs: {
          vae_name: 'LTX-VAE.ckpt',
        },
        _meta: { title: 'Load LTX VAE' },
      },
      // 4. Positive Conditioning (Compiled Shot Prompt)
      '4': {
        class_type: 'CLIPTextEncode',
        inputs: {
          clip: ['2', 0],
          text: bundle.positivePrompt,
        },
        _meta: { title: 'Compiled Director Prompt' },
      },
      // 5. Negative Conditioning
      '5': {
        class_type: 'CLIPTextEncode',
        inputs: {
          clip: ['2', 0],
          text: bundle.negativePrompt,
        },
        _meta: { title: 'Negative Conditioning' },
      },
    };

    // If reference image or VFX plate provided, use Video/Image Conditioning pipeline
    const hasVisualReference = !!uploadedImageFilename || !!shot.vfxReference?.enabled;
    const refFilename = uploadedImageFilename || shot.vfxReference?.fileName || 'vfx_plate_reference.png';

    if (hasVisualReference) {
      workflow['6'] = {
        class_type: 'LoadImage',
        inputs: {
          image: refFilename,
        },
        _meta: { title: shot.vfxReference?.enabled ? 'VFX Video Plate / Depth Map' : 'Reference Start Frame' },
      };

      workflow['7'] = {
        class_type: 'LTXVConditioning',
        inputs: {
          positive: ['4', 0],
          negative: ['5', 0],
          vae: ['3', 0],
          image: ['6', 0],
          frame_rate: shot.frameRate,
          crf: 18,
        },
        _meta: { title: 'LTX-2.5 Conditioning' },
      };

      workflow['8'] = {
        class_type: 'EmptyLTXVLatentVideo',
        inputs: {
          width: width,
          height: height,
          length: frameCount,
          batch_size: 1,
        },
        _meta: { title: 'Empty LTX Video Latent' },
      };

      const denoiseVal = shot.vfxReference?.enabled ? shot.vfxReference.motionRetention : 1.0;

      workflow['9'] = {
        class_type: 'KSampler',
        inputs: {
          model: ['1', 0],
          seed: seed,
          steps: 25,
          cfg: 3.0,
          sampler_name: 'euler',
          scheduler: 'normal',
          positive: ['7', 0],
          negative: ['7', 1],
          latent_image: ['8', 0],
          denoise: denoiseVal,
        },
        _meta: { title: shot.vfxReference?.enabled ? 'LTX Sampler (VFX Video-to-Video)' : 'LTX Sampler (25 steps)' },
      };
    } else {
      // Text-To-Video pipeline
      workflow['8'] = {
        class_type: 'EmptyLTXVLatentVideo',
        inputs: {
          width: width,
          height: height,
          length: frameCount,
          batch_size: 1,
        },
        _meta: { title: 'Empty LTX Video Latent' },
      };

      workflow['9'] = {
        class_type: 'KSampler',
        inputs: {
          model: ['1', 0],
          seed: seed,
          steps: 25,
          cfg: 3.0,
          sampler_name: 'euler',
          scheduler: 'normal',
          positive: ['4', 0],
          negative: ['5', 0],
          latent_image: ['8', 0],
          denoise: 1.0,
        },
        _meta: { title: 'LTX Sampler (25 steps)' },
      };
    }

    // 10. Decode VAE
    workflow['10'] = {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['9', 0],
        vae: ['3', 0],
      },
      _meta: { title: 'Decode Video Latents' },
    };

    // 11. Save Video via Video Helper Suite (VHS_VideoCombine)
    const sanitizedName = shot.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    workflow['11'] = {
      class_type: 'VHS_VideoCombine',
      inputs: {
        images: ['10', 0],
        frame_rate: shot.frameRate,
        loop_count: 0,
        filename_prefix: `AIDirector_${sanitizedName}_v${shot.version}`,
        format: 'video/h264-mp4',
        pingpong: false,
        save_output: true,
      },
      _meta: { title: 'Save Generated Video (MP4 via VHS)' },
    };

    return workflow;
  }
}
