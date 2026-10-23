import { describe, it, expect } from 'vitest';
import { createDefaultShotSpec, ShotSpecSchema } from '../src/types/shotspec';
import { getAdapter } from '../src/adapters';

describe('Tier 3: VFX Video-to-Video & Depth Pipeline', () => {
  it('validates a ShotSpec containing VFX reference plate configuration', () => {
    const shot = createDefaultShotSpec({
      vfxReference: {
        videoUrl: 'blob:http://localhost/test-video',
        fileName: 'stunt_kick.mp4',
        referenceMode: 'actor-motion',
        depthGuidanceWeight: 0.85,
        edgeFidelity: 0.6,
        motionRetention: 0.75,
        trimStartSeconds: 0,
        trimEndSeconds: 4,
        enabled: true,
      },
    });

    const parsed = ShotSpecSchema.safeParse(shot);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.vfxReference?.referenceMode).toBe('actor-motion');
      expect(parsed.data.vfxReference?.depthGuidanceWeight).toBe(0.85);
      expect(parsed.data.vfxReference?.motionRetention).toBe(0.75);
    }
  });

  it('compiles LTX-2.5 prompt with actor motion choreography directives', () => {
    const ltx = getAdapter('ltx-2.5');
    const shot = createDefaultShotSpec({
      targetModel: 'ltx-2.5',
      vfxReference: {
        referenceMode: 'actor-motion',
        depthGuidanceWeight: 0.8,
        edgeFidelity: 0.5,
        motionRetention: 0.65,
        trimStartSeconds: 0,
        trimEndSeconds: 4,
        enabled: true,
      },
    });

    const bundle = ltx.compilePrompt(shot);
    expect(bundle.positivePrompt).toContain('Preserving exact human choreography');
    expect(bundle.technicalMetadata?.vfxReferenceMode).toBe('actor-motion');
  });

  it('configures LTX-2.5 workflow KSampler denoise based on motion retention', () => {
    const ltx = getAdapter('ltx-2.5');
    const shot = createDefaultShotSpec({
      targetModel: 'ltx-2.5',
      vfxReference: {
        referenceMode: 'full-scene',
        depthGuidanceWeight: 0.7,
        edgeFidelity: 0.5,
        motionRetention: 0.55,
        trimStartSeconds: 0,
        trimEndSeconds: 4,
        enabled: true,
      },
    });

    const graph = ltx.buildWorkflow(shot);
    const ksampler = graph['9'];
    expect(ksampler).toBeDefined();
    expect(ksampler.inputs.denoise).toBe(0.55);
    expect(ksampler._meta?.title).toContain('VFX Video-to-Video');
  });

  it('compiles MiniMax H3 prompt and dynamic motion bucket for camera-only solve', () => {
    const minimax = getAdapter('minimax-h3');
    const shot = createDefaultShotSpec({
      targetModel: 'minimax-h3',
      vfxReference: {
        referenceMode: 'camera-only',
        depthGuidanceWeight: 0.7,
        edgeFidelity: 0.5,
        motionRetention: 0.8,
        trimStartSeconds: 0,
        trimEndSeconds: 4,
        enabled: true,
      },
    });

    const bundle = minimax.compilePrompt(shot);
    expect(bundle.positivePrompt).toContain('[Camera Trajectory Reference: replicating continuous optical flow');

    const graph = minimax.buildWorkflow(shot);
    const sampler = graph['4'];
    expect(sampler).toBeDefined();
    // 80 + 0.8 * 140 = 192
    expect(sampler.inputs.motion_bucket_id).toBe(192);
    expect(sampler._meta?.title).toContain('VFX Reference Guided');
  });
});
