import { describe, it, expect, beforeEach } from 'vitest';
import {
  secondsToTimecode,
  timecodeToSeconds,
  secondsToFrames,
  framesToTimecode,
  calculateShotTimeRanges,
  calculateSequenceDuration,
  findShotAtTime,
  getEffectiveShotDuration,
} from '../src/engine/timecodeMath';
import { analyzeSequenceContinuity } from '../src/engine/sequenceContinuityEngine';
import {
  exportToOpenTimelineIO,
  exportToCMX3600EDL,
  exportToFinalCutProXml,
} from '../src/engine/sequenceExporters';
import { useSequenceStore } from '../src/stores/useSequenceStore';
import { CinematicSequence, SequenceShotItem } from '../src/types/sequenceTypes';
import { ShotSpec, createDefaultShotSpec } from '../src/types/shotspec';
import { ShotRevisionV2 } from '../src/pipeline/revisionTypes';
import { installMemoryStorage } from './helpers/memoryStorage';

describe('Stage 10: Multi-Shot Timeline & Sequence Assembly', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  describe('1. SMPTE Timecode & Time Calculations', () => {
    it('converts fractional seconds to SMPTE timecode (24 FPS)', () => {
      expect(secondsToTimecode(0, 24)).toBe('00:00:00:00');
      expect(secondsToTimecode(1.0, 24)).toBe('00:00:01:00');
      expect(secondsToTimecode(1.5, 24)).toBe('00:00:01:12');
      expect(secondsToTimecode(65.25, 24)).toBe('00:01:05:06');
      expect(secondsToTimecode(3661.0, 24)).toBe('01:01:01:00');
    });

    it('parses SMPTE timecode back to seconds accurately', () => {
      expect(timecodeToSeconds('00:00:01:12', 24)).toBe(1.5);
      expect(timecodeToSeconds('00:01:05:06', 24)).toBe(65.25);
      expect(timecodeToSeconds('01:01:01:00', 24)).toBe(3661.0);
    });

    it('converts frame counts to timecode strings', () => {
      expect(framesToTimecode(0, 24)).toBe('00:00:00:00');
      expect(framesToTimecode(24, 24)).toBe('00:00:01:00');
      expect(framesToTimecode(36, 24)).toBe('00:00:01:12');
      expect(secondsToFrames(1.5, 24)).toBe(36);
    });

    it('computes effective shot durations accounting for trim points', () => {
      const shot: SequenceShotItem = {
        shotId: 'shot-1',
        shotCode: 'Shot 01A',
        title: 'Hero Walk',
        durationSeconds: 5.0,
        trimInSeconds: 1.0,
        trimOutSeconds: 4.5,
      };
      expect(getEffectiveShotDuration(shot)).toBe(3.5);
    });

    it('maps shot timeline ranges and locates active shot at scrub time', () => {
      const shots: SequenceShotItem[] = [
        {
          shotId: 's1',
          shotCode: '01A',
          title: 'Opening',
          durationSeconds: 4.0,
          trimInSeconds: 0,
          trimOutSeconds: 4.0,
        },
        {
          shotId: 's2',
          shotCode: '01B',
          title: 'Reveal',
          durationSeconds: 6.0,
          trimInSeconds: 0,
          trimOutSeconds: 6.0,
        },
      ];

      const ranges = calculateShotTimeRanges(shots, 24);
      expect(ranges).toHaveLength(2);
      expect(ranges[0].startTime).toBe(0);
      expect(ranges[0].endTime).toBe(4.0);
      expect(ranges[1].startTime).toBe(4.0);
      expect(ranges[1].endTime).toBe(10.0);
      expect(calculateSequenceDuration(shots)).toBe(10.0);

      // Locate at 2.5s (in Shot 1)
      const at2_5 = findShotAtTime(shots, 2.5, 24);
      expect(at2_5.shotIndex).toBe(0);
      expect(at2_5.shot?.shotId).toBe('s1');
      expect(at2_5.localTimeSeconds).toBe(2.5);

      // Locate at 7.0s (in Shot 2, local time = 3.0s)
      const at7 = findShotAtTime(shots, 7.0, 24);
      expect(at7.shotIndex).toBe(1);
      expect(at7.shot?.shotId).toBe('s2');
      expect(at7.localTimeSeconds).toBe(3.0);
    });
  });

  describe('2. Cinematic Continuity & Pacing Engine', () => {
    const createMockShotSpec = (
      id: string,
      name: string,
      type: any,
      movement: any,
      focalLength: any,
      angle: any,
      actorStartPos: { x: number; y: number },
      actorEndPos: { x: number; y: number },
      lightingStyle = 'cinematic-natural'
    ): ShotSpec => {
      const spec = createDefaultShotSpec({ id, name, durationSeconds: 4 });
      spec.camera.shotType = type;
      spec.camera.movement.type = movement;
      spec.camera.lens.focalLength = focalLength;
      spec.camera.angle = angle;
      spec.lighting.style = lightingStyle as any;
      spec.actors = [
        {
          id: 'actor-1',
          name: 'Hero',
          kind: 'human',
          token: 'detective',
          actionDescription: 'walking forward',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: actorStartPos,
            endPosition: actorEndPos,
          },
        },
      ];
      return spec;
    };

    it('detects 180-degree rule axis breaks between adjacent shots', () => {
      // Shot 1: Actor on left side (x=30)
      const spec1 = createMockShotSpec('s1', 'Shot 1', 'medium', 'pan-left', '35mm', 'eye-level', { x: 30, y: 50 }, { x: 30, y: 50 });
      // Shot 2: Actor abruptly flips to right side (x=70)
      const spec2 = createMockShotSpec('s2', 'Shot 2', 'close-up', 'static', '85mm', 'eye-level', { x: 70, y: 50 }, { x: 70, y: 50 });

      const sequence: CinematicSequence = {
        id: 'seq-1',
        sceneId: 'scene-1',
        sceneName: 'Arrival',
        fps: 24,
        shots: [
          { shotId: 's1', shotCode: '01A', title: 'A', durationSeconds: 4, trimInSeconds: 0, trimOutSeconds: 4 },
          { shotId: 's2', shotCode: '01B', title: 'B', durationSeconds: 4, trimInSeconds: 0, trimOutSeconds: 4 },
        ],
        totalDurationSeconds: 8,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const shotsById = { s1: spec1, s2: spec2 };
      const report = analyzeSequenceContinuity(sequence, shotsById);

      expect(report.issues.some((i) => i.rule === '180_degree_rule')).toBe(true);
      expect(report.overallScore).toBeLessThan(100);
      expect(report.rating).not.toBe('exemplary');
    });

    it('detects discontinuous jump cuts (same focal, framing, and angle)', () => {
      // Shot 1: Medium shot, 35mm, eye-level
      const spec1 = createMockShotSpec('s1', 'Shot 1', 'medium', 'static', '35mm', 'eye-level', { x: 50, y: 50 }, { x: 50, y: 50 });
      // Shot 2: Identical medium shot, 35mm, eye-level (Jump Cut!)
      const spec2 = createMockShotSpec('s2', 'Shot 2', 'medium', 'static', '35mm', 'eye-level', { x: 50, y: 50 }, { x: 50, y: 50 });

      const sequence: CinematicSequence = {
        id: 'seq-2',
        sceneId: 'scene-1',
        sceneName: 'Dialogue',
        fps: 24,
        shots: [
          { shotId: 's1', shotCode: '01A', title: 'A', durationSeconds: 4, trimInSeconds: 0, trimOutSeconds: 4 },
          { shotId: 's2', shotCode: '01B', title: 'B', durationSeconds: 4, trimInSeconds: 0, trimOutSeconds: 4 },
        ],
        totalDurationSeconds: 8,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const report = analyzeSequenceContinuity(sequence, { s1: spec1, s2: spec2 });
      expect(report.issues.some((i) => i.rule === 'jump_cut')).toBe(true);
    });

    it('detects kinetic motion clash between conflicting camera vector moves', () => {
      // Shot 1: Pan Left
      const spec1 = createMockShotSpec('s1', 'Shot 1', 'wide', 'pan-left', '24mm', 'eye-level', { x: 50, y: 50 }, { x: 50, y: 50 });
      // Shot 2: Pan Right (Violent opposing direction)
      const spec2 = createMockShotSpec('s2', 'Shot 2', 'close-up', 'pan-right', '85mm', 'low-angle', { x: 50, y: 50 }, { x: 50, y: 50 });

      const sequence: CinematicSequence = {
        id: 'seq-3',
        sceneId: 'scene-1',
        sceneName: 'Chase',
        fps: 24,
        shots: [
          { shotId: 's1', shotCode: '01A', title: 'A', durationSeconds: 4, trimInSeconds: 0, trimOutSeconds: 4 },
          { shotId: 's2', shotCode: '01B', title: 'B', durationSeconds: 4, trimInSeconds: 0, trimOutSeconds: 4 },
        ],
        totalDurationSeconds: 8,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const report = analyzeSequenceContinuity(sequence, { s1: spec1, s2: spec2 });
      expect(report.issues.some((i) => i.rule === 'motion_clash')).toBe(true);
    });

    it('rates a cleanly composed sequence as exemplary with 100% score', () => {
      // Shot 1: Wide establishing shot, slow dolly in
      const spec1 = createMockShotSpec('s1', 'Shot 1', 'wide', 'dolly-in', '24mm', 'eye-level', { x: 50, y: 50 }, { x: 50, y: 50 });
      // Shot 2: Close-up reveal, static lock
      const spec2 = createMockShotSpec('s2', 'Shot 2', 'close-up', 'static', '85mm', 'low-angle', { x: 50, y: 50 }, { x: 50, y: 50 });

      const sequence: CinematicSequence = {
        id: 'seq-4',
        sceneId: 'scene-1',
        sceneName: 'Arrival Clean',
        fps: 24,
        shots: [
          { shotId: 's1', shotCode: '01A', title: 'Wide', durationSeconds: 5, trimInSeconds: 0, trimOutSeconds: 5 },
          { shotId: 's2', shotCode: '01B', title: 'CU', durationSeconds: 3, trimInSeconds: 0, trimOutSeconds: 3 },
        ],
        totalDurationSeconds: 8,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const report = analyzeSequenceContinuity(sequence, { s1: spec1, s2: spec2 });
      expect(report.overallScore).toBe(100);
      expect(report.rating).toBe('exemplary');
      expect(report.issues).toHaveLength(0);
    });
  });

  describe('3. Professional NLE Exporters', () => {
    const testSequence: CinematicSequence = {
      id: 'seq-export-test',
      sceneId: 'scene-01',
      sceneName: 'Alley Investigation',
      fps: 24,
      shots: [
        {
          shotId: 'shot-01a',
          shotCode: 'Shot 01A',
          title: 'Tracking In',
          durationSeconds: 4.0,
          trimInSeconds: 0,
          trimOutSeconds: 4.0,
          heroTakeNumber: 2,
          heroFidelityScore: 92,
          heroTakeVideoUrl: 'blob:take-2.mp4',
        },
        {
          shotId: 'shot-01b',
          shotCode: 'Shot 01B',
          title: 'Pan Right',
          durationSeconds: 5.0,
          trimInSeconds: 0.5,
          trimOutSeconds: 5.0,
          transitionAfter: { type: 'dissolve', durationSeconds: 0.5 },
        },
      ],
      totalDurationSeconds: 8.5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it('exports valid, parseable OpenTimelineIO (.otio) JSON', () => {
      const otioJson = exportToOpenTimelineIO(testSequence, { projectName: 'Noir_Test' });
      expect(typeof otioJson).toBe('string');

      const parsed = JSON.parse(otioJson);
      expect(parsed.OTIO_SCHEMA).toBe('Timeline.1');
      expect(parsed.tracks.children).toHaveLength(1);
      expect(parsed.tracks.children[0].children).toHaveLength(2);

      const firstClip = parsed.tracks.children[0].children[0];
      expect(firstClip.OTIO_SCHEMA).toBe('Clip.1');
      expect(firstClip.name).toContain('Shot 01A');
      expect(firstClip.metadata.comfyui_previs.heroTakeNumber).toBe(2);
      expect(firstClip.metadata.comfyui_previs.fidelityScore).toBe(92);
    });

    it('exports standard SMPTE CMX 3600 EDL document', () => {
      const edlText = exportToCMX3600EDL(testSequence);
      expect(edlText).toContain('TITLE:   ALLEY_INVESTIGATION');
      expect(edlText).toContain('FCM:     NON-DROP FRAME');
      expect(edlText).toContain('001  AX       V     C');
      expect(edlText).toContain('002  AX       V     D');
      expect(edlText).toContain('* FROM CLIP NAME: Shot_01A_Tracking_In.mp4');
      expect(edlText).toContain('* COMFYUI_HERO_TAKE: Take 2 (92% Fidelity)');
    });

    it('exports conformant Final Cut Pro XML (.fcpxml / .xml) timeline', () => {
      const xmlText = exportToFinalCutProXml(testSequence);
      expect(xmlText).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xmlText).toContain('<sequence id="sequence-1">');
      expect(xmlText).toContain('<clipitem id="clipitem-1">');
      expect(xmlText).toContain('<clipitem id="clipitem-2">');
      expect(xmlText).toContain('<timebase>24</timebase>');
      expect(xmlText).toContain('Shot 01A - Tracking In');
    });
  });

  describe('4. Sequence Store State & Hero Take Assignment', () => {
    it('reorders shots and recalculates sequence structure', () => {
      const store = useSequenceStore.getState();
      const initialFirst = store.sequence.shots[0].shotId;
      const initialSecond = store.sequence.shots[1].shotId;

      store.reorderShots(0, 1);
      const after = useSequenceStore.getState().sequence.shots;
      expect(after[0].shotId).toBe(initialSecond);
      expect(after[1].shotId).toBe(initialFirst);
    });

    it('assigns hero take to a shot in the sequence', () => {
      const store = useSequenceStore.getState();
      const targetShotId = store.sequence.shots[0].shotId;

      const mockTake: ShotRevisionV2 = {
        id: 'take-hero-99',
        shotId: targetShotId,
        version: 3,
        takeNumber: 3,
        createdAt: Date.now(),
        note: 'Hero Take',
        engine: 'ltx-2.5',
        templateId: 'ltx_t2v',
        templateHash: 'abc',
        bindingSchema: 1,
        mode: 't2v',
        profile: 'final',
        seed: 42,
        prompt: 'heroic lighting',
        negative: '',
        promptSource: 'compiled',
        submittedWorkflow: {},
        status: 'completed',
        shotSpec: {} as any,
        outputVideoUrl: 'https://example.com/take-3.mp4',
        motionFidelity: {
          overallScore: 94,
          directionalScore: 95,
          speedScore: 90,
          stabilityScore: 92,
          directedMovement: 'dolly-in',
          detectedMovement: 'dolly-in',
          achievedVector: { avgDx: 0, avgDy: 0, divergence: 2, magnitude: 2 },
          expectedVector: { expectedDx: 0, expectedDy: 0, expectedDivergence: 2 },
          classification: 'good',
          summary: 'Exemplary',
          recommendations: [],
          analyzedAt: Date.now(),
        },
      };

      store.setHeroTakeForShot(targetShotId, mockTake);
      const updatedShot = useSequenceStore.getState().sequence.shots.find((s) => s.shotId === targetShotId);
      expect(updatedShot?.heroTakeId).toBe('take-hero-99');
      expect(updatedShot?.heroTakeNumber).toBe(3);
      expect(updatedShot?.heroFidelityScore).toBe(94);
      expect(updatedShot?.heroTakeVideoUrl).toBe('https://example.com/take-3.mp4');
    });

    it('sets transitions and trims clip in/out', () => {
      const store = useSequenceStore.getState();
      const firstShotId = store.sequence.shots[0].shotId;

      store.setTransition(0, { type: 'dissolve', durationSeconds: 0.75 });
      expect(useSequenceStore.getState().sequence.shots[0].transitionAfter?.type).toBe('dissolve');

      store.updateShotTrim(firstShotId, 0.5, 3.0);
      const trimmedShot = useSequenceStore.getState().sequence.shots[0];
      expect(trimmedShot.trimInSeconds).toBe(0.5);
      expect(trimmedShot.trimOutSeconds).toBe(3.0);
    });
  });
});
