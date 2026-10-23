import { describe, it, expect, beforeEach } from 'vitest';
import {
  getExpectedMotionVector,
  classifyDetectedMotion,
  computeFrameFlow,
  calculateMotionFidelity,
  FrameFlowMetric,
} from '../src/engine/motionFidelityAnalyzer';
import { useHistoryStore } from '../src/stores/useHistoryStore';
import { installMemoryStorage } from './helpers/memoryStorage';

describe('Motion Fidelity Scoring Engine', () => {
  beforeEach(() => {
    installMemoryStorage();
    useHistoryStore.setState({
      revisions: [],
      activeRevisionId: null,
      comparisonRevisionId: null,
    });
  });

  describe('Expected Vector Mapping', () => {
    it('maps camera moves to inverse optical flow vectors correctly', () => {
      // Pan Left -> background shifts right (+dx)
      const panLeft = getExpectedMotionVector('pan-left', 'moderate');
      expect(panLeft.expectedDx).toBeGreaterThan(0);
      expect(panLeft.expectedDy).toBe(0);
      expect(panLeft.expectedDivergence).toBe(0);

      // Pan Right -> background shifts left (-dx)
      const panRight = getExpectedMotionVector('pan-right', 'moderate');
      expect(panRight.expectedDx).toBeLessThan(0);

      // Tilt Up -> background shifts down (+dy)
      const tiltUp = getExpectedMotionVector('tilt-up', 'moderate');
      expect(tiltUp.expectedDy).toBeGreaterThan(0);

      // Tilt Down -> background shifts up (-dy)
      const tiltDown = getExpectedMotionVector('tilt-down', 'moderate');
      expect(tiltDown.expectedDy).toBeLessThan(0);

      // Dolly In -> positive divergence (expansion)
      const dollyIn = getExpectedMotionVector('dolly-in', 'moderate');
      expect(dollyIn.expectedDivergence).toBe(1.0);

      // Dolly Out -> negative divergence (contraction)
      const dollyOut = getExpectedMotionVector('dolly-out', 'moderate');
      expect(dollyOut.expectedDivergence).toBe(-1.0);

      // Static -> zero vectors
      const stat = getExpectedMotionVector('static', 'slow-cinematic');
      expect(stat.expectedDx).toBe(0);
      expect(stat.expectedDy).toBe(0);
      expect(stat.expectedDivergence).toBe(0);
    });

    it('scales target speed magnitude across speed profiles', () => {
      const slow = getExpectedMotionVector('pan-left', 'slow-cinematic');
      const moderate = getExpectedMotionVector('pan-left', 'moderate');
      const rapid = getExpectedMotionVector('pan-left', 'rapid-dynamic');

      expect(slow.targetSpeedMagnitude).toBeLessThan(moderate.targetSpeedMagnitude);
      expect(moderate.targetSpeedMagnitude).toBeLessThan(rapid.targetSpeedMagnitude);
    });
  });

  describe('Motion Classification', () => {
    it('classifies divergence as dolly in/out', () => {
      expect(classifyDetectedMotion(0.1, 0.1, 0.8)).toBe('dolly-in');
      expect(classifyDetectedMotion(0.1, 0.1, -0.8)).toBe('dolly-out');
    });

    it('classifies low motion as static', () => {
      expect(classifyDetectedMotion(0.05, 0.05, 0.05)).toBe('static');
    });

    it('classifies dominant horizontal motion as pan-left/pan-right', () => {
      expect(classifyDetectedMotion(1.5, 0.2, 0.1)).toBe('pan-left');
      expect(classifyDetectedMotion(-1.5, 0.2, 0.1)).toBe('pan-right');
    });

    it('classifies dominant vertical motion as tilt-up/tilt-down', () => {
      expect(classifyDetectedMotion(0.1, 1.6, 0.1)).toBe('tilt-up');
      expect(classifyDetectedMotion(0.1, -1.6, 0.1)).toBe('tilt-down');
    });
  });

  describe('Block-matching Optical Flow (computeFrameFlow)', () => {
    it('measures horizontal pixel translation between two synthetic frames', () => {
      const width = 64;
      const height = 64;
      const frame1 = new Float32Array(width * height);
      const frame2 = new Float32Array(width * height);

      // Draw high-contrast vertical grating in frame1 with period 12
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          frame1[y * width + x] = (x % 12) < 6 ? 240 : 20;
        }
      }

      // Shift pattern 2 pixels right in frame2 (frame2 matches frame1 shifted by +2)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const shiftedX = (x - 2 + width) % width;
          frame2[y * width + x] = (shiftedX % 12) < 6 ? 240 : 20;
        }
      }

      const flow = computeFrameFlow(frame1, frame2, width, height, 5);

      // Should detect rightward translation (+dx > 0)
      expect(flow.dx).toBeGreaterThanOrEqual(1.0);
      expect(flow.gridPoints).toBeDefined();
      expect(flow.gridPoints?.length).toBe(25); // 5x5
    });
  });

  describe('calculateMotionFidelity Scoring', () => {
    it('awards high fidelity score (>=85%) and EXCELLENT classification when achieved matches directed move', () => {
      const frameFlows: FrameFlowMetric[] = [
        { dx: 1.2, dy: 0.1, divergence: 0.05, magnitude: 1.2 },
        { dx: 1.1, dy: 0.0, divergence: 0.04, magnitude: 1.1 },
        { dx: 1.3, dy: -0.1, divergence: 0.06, magnitude: 1.3 },
      ];

      const result = calculateMotionFidelity(frameFlows, 'pan-left', 'moderate');

      expect(result.overallScore).toBeGreaterThanOrEqual(85);
      expect(result.classification).toBe('excellent');
      expect(result.detectedMovement).toBe('pan-left');
      expect(result.directedMovement).toBe('pan-left');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('detects camera drift and flags low directional score when move reverses directed direction', () => {
      // Directed: pan-left (+dx expected), but achieved: pan-right (dx < 0)
      const frameFlows: FrameFlowMetric[] = [
        { dx: -1.5, dy: 0.1, divergence: 0.05, magnitude: 1.5 },
        { dx: -1.4, dy: 0.0, divergence: 0.05, magnitude: 1.4 },
      ];

      const result = calculateMotionFidelity(frameFlows, 'pan-left', 'moderate');

      expect(result.directionalScore).toBeLessThan(35);
      expect(result.classification).toBe('drift');
      expect(result.detectedMovement).toBe('pan-right');
      expect(result.summary).toContain('drift');
    });

    it('scores dolly-in with positive divergence accurately', () => {
      const frameFlows: FrameFlowMetric[] = [
        { dx: 0.05, dy: 0.05, divergence: 0.75, magnitude: 0.2 },
        { dx: 0.02, dy: 0.03, divergence: 0.80, magnitude: 0.2 },
      ];

      const result = calculateMotionFidelity(frameFlows, 'dolly-in', 'moderate');

      expect(result.overallScore).toBeGreaterThanOrEqual(80);
      expect(result.detectedMovement).toBe('dolly-in');
    });

    it('evaluates static shots and penalizes accidental movement', () => {
      // Truly static shot
      const staticFlows: FrameFlowMetric[] = [
        { dx: 0.02, dy: 0.01, divergence: 0.01, magnitude: 0.02 },
        { dx: 0.01, dy: 0.02, divergence: 0.01, magnitude: 0.02 },
      ];
      const staticResult = calculateMotionFidelity(staticFlows, 'static');
      expect(staticResult.overallScore).toBeGreaterThanOrEqual(90);
      expect(staticResult.classification).toBe('excellent');

      // Unintended shaky / panning movement on static shot
      const shakyFlows: FrameFlowMetric[] = [
        { dx: 1.5, dy: 0.8, divergence: 0.5, magnitude: 1.7 },
      ];
      const shakyResult = calculateMotionFidelity(shakyFlows, 'static');
      expect(shakyResult.overallScore).toBeLessThan(60);
    });

    it('handles empty frame flows gracefully', () => {
      const result = calculateMotionFidelity([], 'dolly-in');
      expect(result.overallScore).toBe(50);
      expect(result.classification).toBe('fair');
    });
  });

  describe('History Store Motion Fidelity Integration', () => {
    it('persists and updates take motion fidelity analysis', () => {
      const store = useHistoryStore.getState();

      const revId = store.saveRevisionV2({
        shot: {
          id: 'shot-alpha',
          name: 'Alpha Shot',
          camera: { movement: { type: 'pan-left' } },
        } as any,
        templateId: 'ltx_t2v',
        templateHash: 'abc',
        bindingSchema: 1,
        engine: 'ltx-2.5',
        mode: 't2v',
        profile: 'final',
        seed: 42,
        prompt: 'a cinematic scene',
        negative: '',
        promptSource: 'compiled',
        submittedWorkflow: {},
        outputVideoUrl: 'blob:take-1.mp4',
      });

      const sampleAnalysis = {
        overallScore: 92,
        directionalScore: 95,
        speedScore: 90,
        stabilityScore: 90,
        detectedMovement: 'pan-left' as const,
        directedMovement: 'pan-left' as const,
        achievedVector: { avgDx: 1.2, avgDy: 0, divergence: 0, magnitude: 1.2 },
        expectedVector: { expectedDx: 1, expectedDy: 0, expectedDivergence: 0 },
        classification: 'excellent' as const,
        summary: 'Excellent motion match',
        recommendations: ['Locked to previs.'],
        analyzedAt: Date.now(),
      };

      store.setTakeMotionFidelity(revId, sampleAnalysis);

      const updatedTake = useHistoryStore.getState().getRevision(revId);
      expect(updatedTake?.motionFidelity).toBeDefined();
      expect(updatedTake?.motionFidelity?.overallScore).toBe(92);
      expect(updatedTake?.motionFidelity?.classification).toBe('excellent');
    });
  });
});
