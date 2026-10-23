import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDirectorialSteeringPatch,
  applySteeringPatchToShot,
  calculateFidelityImprovement,
} from '../src/engine/directorialSteeringEngine';
import { defaultGenerationQueue } from '../src/pipeline/generationQueue';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { ShotRevisionV2 } from '../src/pipeline/revisionTypes';
import { installMemoryStorage } from './helpers/memoryStorage';

describe('Closed-Loop Directorial Auto-Steering Engine', () => {
  beforeEach(() => {
    installMemoryStorage();
    useHistoryStore.setState({
      revisions: [],
      activeRevisionId: null,
      comparisonRevisionId: null,
    });
    defaultGenerationQueue.clearCompleted();
  });

  const createMockTake = (
    id: string,
    directedMove: any,
    detectedMove: any,
    overallScore: number,
    directionalScore: number,
    speedScore = 80
  ): ShotRevisionV2 => {
    return {
      id,
      shotId: 'shot-alpha',
      version: 1,
      takeNumber: 1,
      createdAt: Date.now(),
      status: 'completed' as const,
      note: 'Initial Take',
      engine: 'ltx-2.5',
      templateId: 'ltx_t2v',
      templateHash: 'abc',
      bindingSchema: 1,
      mode: 'control',
      profile: 'final',
      seed: 42,
      prompt: 'cinematic cyberpunk alleyway at dusk, neon rain reflections',
      negative: 'low quality, blurry, deformed',
      promptSource: 'compiled',
      submittedWorkflow: {},
      shotSpec: {
        id: 'shot-alpha',
        name: 'Cyberpunk Alley',
        durationSeconds: 5,
        sceneDescription: 'cinematic cyberpunk alleyway at dusk, neon rain reflections',
        negativePrompt: 'low quality, blurry, deformed',
        seed: 42,
        camera: {
          movement: {
            type: directedMove,
            speed: 'moderate',
            startPosition: { x: 50, y: 50 },
            endPosition: { x: 50, y: 50 },
          },
        },
      } as any,
      motionFidelity: {
        overallScore,
        directionalScore,
        speedScore,
        stabilityScore: 85,
        directedMovement: directedMove,
        detectedMovement: detectedMove,
        achievedVector: { avgDx: 1, avgDy: 0, divergence: 0, magnitude: 1 },
        expectedVector: { expectedDx: 1, expectedDy: 0, expectedDivergence: 0 },
        classification: overallScore >= 70 ? 'good' : 'drift',
        summary: 'Motion test evaluation',
        recommendations: ['Apply steering'],
        analyzedAt: Date.now(),
      },
    };
  };

  describe('Steering Strategy Generation', () => {
    it('generates counter-steering patch for directional drift (pan-left drifted to pan-right)', () => {
      const take = createMockTake('take-1', 'pan-left', 'pan-right', 42, 28);
      const { patch, steeredShotSpec, suggestedSeed } = generateDirectorialSteeringPatch(take, {
        currentIcLoraStrength: 1.0,
      });

      expect(patch.sourceTakeId).toBe('take-1');
      expect(patch.steeredPositivePrompt).toContain('deliberate camera pan-left');
      expect(patch.steeredPositivePrompt).toContain('steady pan-left tracking shot');
      expect(patch.steeredNegativePrompt).toContain('camera pan right');
      expect(patch.steeredIcLoraStrength).toBeGreaterThanOrEqual(1.25);
      expect(patch.appliedDirectives.length).toBeGreaterThan(1);
      expect(suggestedSeed).not.toBe(42);
      expect(steeredShotSpec.seed).toBe(suggestedSeed);
    });

    it('generates static camera locking patch when camera drifts on static shot', () => {
      const take = createMockTake('take-2', 'static', 'pan-left', 48, 30);
      const { patch } = generateDirectorialSteeringPatch(take, {
        currentIcLoraStrength: 0.9,
      });

      expect(patch.steeredPositivePrompt).toContain('static locked camera');
      expect(patch.steeredPositivePrompt).toContain('locked tripod shot');
      expect(patch.steeredNegativePrompt).toContain('camera movement');
      expect(patch.steeredIcLoraStrength).toBe(1.1); // 0.9 + 0.2
      expect(patch.appliedDirectives).toContain('Lock camera to stationary tripod anchor');
    });

    it('generates forward push-in compensation when dolly-in produces retreat or flat motion', () => {
      const take = createMockTake('take-3', 'dolly-in', 'dolly-out', 52, 40);
      const { patch } = generateDirectorialSteeringPatch(take);

      expect(patch.steeredPositivePrompt).toContain('push in dolly camera move');
      expect(patch.steeredNegativePrompt).toContain('pull back, dolly out');
      expect(patch.appliedDirectives).toContain('Enforce forward camera push-in trajectory');
    });

    it('generates velocity momentum amplification for low speed matching', () => {
      // Correct direction (pan-right), but sluggish speed
      const take = createMockTake('take-4', 'pan-right', 'pan-right', 62, 85, 40);
      const { patch } = generateDirectorialSteeringPatch(take);

      expect(patch.steeredPositivePrompt).toContain('dynamic fast camera pan-right');
      expect(patch.steeredNegativePrompt).toContain('stationary camera, motionless');
      expect(patch.appliedDirectives).toContain('Amplify kinetic momentum for pan-right');
    });

    it('preserves prompt and iterates seed when take already achieved high fidelity', () => {
      const take = createMockTake('take-5', 'pan-left', 'pan-left', 92, 95, 90);
      const { patch, suggestedSeed } = generateDirectorialSteeringPatch(take);

      expect(patch.steeredPositivePrompt).toBe(take.prompt);
      expect(suggestedSeed).toBe(take.seed + 1);
      expect(patch.appliedDirectives).toContain('Preserve proven prompt structure and iterate RNG seed');
    });
  });

  describe('applySteeringPatchToShot', () => {
    it('applies negative prompt and seed offsets onto active ShotSpec', () => {
      const take = createMockTake('take-1', 'pan-left', 'pan-right', 40, 25);
      const { patch } = generateDirectorialSteeringPatch(take);

      const updatedShot = applySteeringPatchToShot(take.shotSpec, patch);
      expect(updatedShot.negativePrompt).toBe(patch.steeredNegativePrompt);
      expect(updatedShot.seed).not.toBe(take.shotSpec.seed);
      expect(updatedShot.id).toBe(take.shotSpec.id);
    });
  });

  describe('calculateFidelityImprovement', () => {
    it('correctly calculates positive fidelity delta and returns informative summary', () => {
      const takeA = createMockTake('take-1', 'pan-left', 'pan-right', 42, 28);
      const takeB = createMockTake('take-2', 'pan-left', 'pan-left', 88, 92);

      const result = calculateFidelityImprovement(takeA, takeB);
      expect(result.improved).toBe(true);
      expect(result.scoreDelta).toBe(46);
      expect(result.summary).toContain('+46%');
      expect(result.summary).toContain('Closed-loop steering successfully counteracted camera drift');
    });
  });

  describe('Closed-Loop Queue Lineage Integration', () => {
    it('records steeredFromTakeId and steeringPatch on enqueued items', () => {
      const take = createMockTake('take-src', 'pan-left', 'pan-right', 45, 30);
      const { patch } = generateDirectorialSteeringPatch(take);

      const items = defaultGenerationQueue.enqueueBatch({
        shot: take.shotSpec,
        engine: 'ltx-2.5',
        mode: 'control',
        profile: 'final',
        prompt: patch.steeredPositivePrompt,
        negative: patch.steeredNegativePrompt,
        count: 1,
        seedStrategy: 'sequential',
        steeredFromTakeId: take.id,
        steeringPatch: patch,
      });

      expect(items.length).toBe(1);
      expect(items[0].steeredFromTakeId).toBe('take-src');
      expect(items[0].steeringPatch).toBeDefined();
      expect(items[0].steeringPatch?.sourceTakeId).toBe('take-src');
      expect(items[0].prompt).toContain('deliberate camera pan-left');
    });
  });
});
