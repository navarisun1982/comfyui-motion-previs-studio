import { describe, it, expect } from 'vitest';
import { decomposeActingPromptRules, generateActingCuesFromPrompt } from '../src/services/aiActingDirector';
import { compileLtxPrompt, compileMiniMaxPrompt, compileSeedancePrompt } from '../src/engine/promptCompiler';
import { createDefaultShotSpec, ShotSpec } from '../src/types/shotspec';

describe('AI Directorial Acting Beats & Multi-Cue Animation', () => {
  it('rule-based parser decomposes timed acting prompts into chronological beats', () => {
    const prompt = '0s neutral stand, 1.5s draw bow aiming at target, 3.2s dramatic lunge forward and kneel';
    const beats = decomposeActingPromptRules(prompt, 5.0);

    expect(beats.length).toBeGreaterThanOrEqual(3);
    expect(beats[0].time).toBe(0);
    expect(beats[0].posePreset).toBe('neutral-stand');
    expect(beats[1].time).toBe(1.5);
    expect(beats[1].posePreset).toBe('aim-bow');
    expect(beats[2].time).toBe(3.2);
    expect(beats[2].posePreset).toBe('dramatic-lunge');
  });

  it('rule-based parser handles untimed action narratives and spaces them evenly', () => {
    const prompt = 'first stands alert, then draws bow to aim, then lunges forward';
    const beats = decomposeActingPromptRules(prompt, 6.0);

    expect(beats.length).toBe(3);
    expect(beats[0].time).toBe(0);
    expect(beats[1].time).toBe(2);
    expect(beats[2].time).toBe(4);
  });

  it('generateActingCuesFromPrompt returns valid cues with fallback when no LLM key is configured', async () => {
    const cues = await generateActingCuesFromPrompt('0s combat ready, 2s defensive block', 4.0, 'Warrior', 'Castle courtyard');
    expect(cues.length).toBe(2);
    expect(cues[0].posePreset).toBe('combat-ready');
    expect(cues[1].posePreset).toBe('defensive-block');
  });
});

describe('Prompt Compiler Multi-Cue & Claymation Synthesis', () => {
  const baseShot: ShotSpec = {
    ...createDefaultShotSpec(),
    id: 'shot-claymation-test',
    name: 'Claymation Previs Shot',
    durationSeconds: 4.0,
    aspectRatio: '16:9',
    frameRate: 24,
    camera: {
      movement: {
        type: 'dolly-in',
        speed: 'slow-cinematic',
        startPosition: { x: 50, y: 80, z: 25 },
        endPosition: { x: 50, y: 60, z: 25 },
        targetLookAt: { x: 50, y: 50 },
      },
      lens: { focalLength: '35mm', aperture: 'f/2.8', sensorSize: 'full-frame' },
      angle: 'eye-level',
      shotType: 'medium',
    },
    lighting: {
      style: 'cinematic-natural',
      direction: 'side-key',
      contrast: 'balanced',
    },
    sceneDescription: 'A clay miniature hero readies their wooden longbow in the rustic hearth chamber',
    actors: [
      {
        id: 'hero',
        name: 'Hero Archer',
        kind: 'human',
        token: 'a claymation archer in woolen tunic',
        actionDescription: 'draws bow and aims at fireplace',
        scale: 1.0,
        trajectory: {
          startPosition: { x: 45, y: 50 },
          endPosition: { x: 55, y: 50 },
          startTimeSeconds: 0,
          keyframes: [
            { id: 'kf1', position: { x: 45, y: 50 }, time: 0, posePreset: 'neutral-stand', cueLabel: 'stands alert' },
            { id: 'kf2', position: { x: 50, y: 50 }, time: 1.5, posePreset: 'aim-bow', cueLabel: 'draws wooden longbow' },
            { id: 'kf3', position: { x: 55, y: 50 }, time: 3.5, posePreset: 'hero-kneel', cueLabel: 'kneels behind barrel' },
          ],
        },
      },
      {
        id: 'bow',
        name: 'Wooden Bow',
        token: 'a miniature wooden recurve bow',
        actionDescription: 'held tightly in hero right hand',
        kind: 'prop',
        socketToBone: {
          targetActorId: 'hero',
          boneName: 'RightHand',
        },
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: 45, y: 50 },
          endPosition: { x: 55, y: 50 },
        },
      },
    ],
    claymationMode: true,
    claymationFps: 12,
  };

  it('compiles LTX-2.5 prompt with claymation on-twos cadence and bone socketed props', () => {
    const bundle = compileLtxPrompt(baseShot);
    expect(bundle.positivePrompt).toContain('Authentic stop-motion claymation aesthetic');
    expect(bundle.positivePrompt).toContain('12fps motion cadence');
    expect(bundle.positivePrompt).toContain('stands alert');
    expect(bundle.positivePrompt).toContain('draws wooden longbow');
    expect(bundle.styleDirectives).toContain('Stop-motion claymation aesthetic');
    expect(bundle.actorDirectives).toContain('attached to bone RightHand');
    expect(bundle.technicalMetadata.fps).toBe(12);
  });

  it('compiles MiniMax prompt with chronological micro-acting cue timeline', () => {
    const bundle = compileMiniMaxPrompt(baseShot);
    expect(bundle.positivePrompt).toContain('Authentic stop-motion claymation aesthetic');
    expect(bundle.positivePrompt).toContain('12fps motion cadence');
    expect(bundle.positivePrompt).toContain('stands alert');
    expect(bundle.technicalMetadata.fps).toBe(12);
  });

  it('compiles Seedance prompt with socketed item metadata and claymation cadence', () => {
    const bundle = compileSeedancePrompt(baseShot);
    expect(bundle.positivePrompt).toContain('Stop-motion claymation aesthetic');
    expect(bundle.positivePrompt).toContain('12fps on-twos motion cadence');
    expect(bundle.positivePrompt).toContain('[Socketed: Bone RightHand]');
    expect(bundle.technicalMetadata.fps).toBe(12);
  });
});
