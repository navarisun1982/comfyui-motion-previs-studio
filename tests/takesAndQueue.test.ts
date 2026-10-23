import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenerationQueueManager } from '../src/pipeline/generationQueue';
import { useHistoryStore, computeShotDiff } from '../src/stores/useHistoryStore';
import { useShotStore } from '../src/stores/useShotStore';
import { createDefaultShotSpec } from '../src/types/shotspec';

describe('Stage 7: Takes Grid & Generation Queue', () => {
  beforeEach(() => {
    useHistoryStore.getState().clearHistory();
    useShotStore.getState().resetToDefault();
  });

  const createMockRunner = () => ({
    run: vi.fn().mockImplementation(async (_opts) => {
      return {
        promptId: 'mock-prompt-id',
        cancel: vi.fn(),
        getBoundWorkflow: () => ({}),
      };
    }),
  });

  describe('GenerationQueueManager', () => {
    it('should enqueue batch takes with sequential seeds', () => {
      const mockRunner = createMockRunner();
      const queue = new GenerationQueueManager({ runner: mockRunner });
      const shot = createDefaultShotSpec({ id: 'shot-01', name: 'Tracking In Shot' });

      const items = queue.enqueueBatch({
        shot,
        engine: 'ltx-2.5',
        mode: 't2v',
        profile: 'draft',
        prompt: 'Cinematic tracking shot of a mysterious figure',
        negative: 'blurry',
        baseSeed: 1000,
        count: 3,
        seedStrategy: 'sequential',
      });

      expect(items.length).toBe(3);
      expect(items[0].seed).toBe(1000);
      expect(items[1].seed).toBe(1001);
      expect(items[2].seed).toBe(1002);
      expect(items[0].takeNumber).toBe(1);
      expect(items[1].takeNumber).toBe(2);
      expect(items[2].takeNumber).toBe(3);
      expect(items[0].status).toBe('running'); // Auto-starts first item
      expect(items[1].status).toBe('queued');
      expect(items[2].status).toBe('queued');
      expect(mockRunner.run).toHaveBeenCalledTimes(1);
    });

    it('should enqueue batch takes with random seeds', () => {
      const mockRunner = createMockRunner();
      const queue = new GenerationQueueManager({ runner: mockRunner });
      const shot = createDefaultShotSpec({ id: 'shot-02', name: 'Close Up' });

      const items = queue.enqueueBatch({
        shot,
        engine: 'minimax-h3',
        mode: 'i2v',
        profile: 'final',
        prompt: 'Intense gaze',
        negative: 'distortion',
        count: 4,
        seedStrategy: 'random',
      });

      expect(items.length).toBe(4);
      const seeds = items.map((i) => i.seed);
      expect(new Set(seeds).size).toBeGreaterThanOrEqual(2); // Seeds are randomized
      expect(items[0].takeNumber).toBe(1);
      expect(items[3].takeNumber).toBe(4);
    });

    it('should cancel queued items cleanly', async () => {
      const mockRunner = createMockRunner();
      const queue = new GenerationQueueManager({ runner: mockRunner });
      const shot = createDefaultShotSpec({ id: 'shot-03', name: 'Panning Shot' });

      const items = queue.enqueueBatch({
        shot,
        engine: 'ltx-2.5',
        mode: 't2v',
        profile: 'final',
        prompt: 'Pan across landscape',
        negative: 'low quality',
        baseSeed: 500,
        count: 3,
        seedStrategy: 'sequential',
      });

      const secondItem = items[1];
      expect(secondItem.status).toBe('queued');

      await queue.cancelItem(secondItem.id);

      const updated = queue.getItems().find((i) => i.id === secondItem.id);
      expect(updated?.status).toBe('cancelled');
    });

    it('should clear entire remaining queue on clearQueue()', async () => {
      const mockRunner = createMockRunner();
      const queue = new GenerationQueueManager({ runner: mockRunner });
      const shot = createDefaultShotSpec({ id: 'shot-04', name: 'Crane Shot' });

      queue.enqueueBatch({
        shot,
        engine: 'ltx-2.5',
        mode: 'control',
        profile: 'final',
        prompt: 'High crane move down',
        negative: 'flicker',
        baseSeed: 200,
        count: 4,
        seedStrategy: 'sequential',
      });

      await queue.clearQueue();

      const items = queue.getItems();
      expect(items.every((i) => i.status === 'cancelled')).toBe(true);
    });

    it('should retry a cancelled or failed item', async () => {
      const mockRunner = createMockRunner();
      const queue = new GenerationQueueManager({ runner: mockRunner });
      const shot = createDefaultShotSpec({ id: 'shot-05', name: 'Dolly Zoom' });

      const items = queue.enqueueBatch({
        shot,
        engine: 'ltx-2.5',
        mode: 't2v',
        profile: 'draft',
        prompt: 'Vertigo effect',
        negative: 'artifacts',
        baseSeed: 700,
        count: 2,
        seedStrategy: 'sequential',
      });

      const item = items[1];
      await queue.cancelItem(item.id);
      expect(queue.getItems().find((i) => i.id === item.id)?.status).toBe('cancelled');

      queue.retryItem(item.id);
      const retried = queue.getItems().find((i) => i.id === item.id);
      expect(retried?.status).toBe('queued');
      expect(retried?.error).toBeUndefined();
    });
  });

  describe('Takes Persistence & Circling Hero Takes', () => {
    it('should save revisions with takeNumber and allow toggling circled status', () => {
      const historyStore = useHistoryStore.getState();
      const shot = createDefaultShotSpec({ id: 'shot-hero-01', name: 'Hero Scene' });

      const revId = historyStore.saveRevisionV2({
        shot,
        engine: 'ltx-2.5',
        templateId: 'ltx25_stubelius',
        templateHash: 'abc123hash',
        bindingSchema: 1,
        mode: 'control',
        profile: 'final',
        seed: 849201,
        prompt: 'Dramatic cinematic lighting on hero',
        negative: 'noisy',
        promptSource: 'compiled',
        submittedWorkflow: {},
        outputVideoUrl: 'blob:mock-hero-take.mp4',
        outputFilename: 'Take_01_Hero.mp4',
        note: 'First take',
      });

      const saved = historyStore.getRevision(revId);
      expect(saved).toBeDefined();
      expect(saved?.takeNumber).toBe(1);
      expect(saved?.isCircled).toBe(false);

      // Circle the take as the hero take
      historyStore.toggleCircledTake(revId);
      expect(historyStore.getRevision(revId)?.isCircled).toBe(true);

      // Uncircle the take
      historyStore.toggleCircledTake(revId);
      expect(historyStore.getRevision(revId)?.isCircled).toBe(false);
    });

    it('should set take rating within 0 to 5 bounds', () => {
      const historyStore = useHistoryStore.getState();
      const shot = createDefaultShotSpec({ id: 'shot-rate-01', name: 'Rating Scene' });

      const revId = historyStore.saveRevisionV2({
        shot,
        engine: 'minimax-h3',
        templateId: 'h3_stubelius',
        templateHash: 'def456hash',
        bindingSchema: 1,
        mode: 't2v',
        profile: 'draft',
        seed: 42,
        prompt: 'Dialogue shot',
        negative: 'glitch',
        promptSource: 'compiled',
        submittedWorkflow: {},
        outputVideoUrl: 'blob:dialogue-take.mp4',
      });

      historyStore.setTakeRating(revId, 4);
      expect(historyStore.getRevision(revId)?.rating).toBe(4);

      // Clamping check
      historyStore.setTakeRating(revId, 10);
      expect(historyStore.getRevision(revId)?.rating).toBe(5);

      historyStore.setTakeRating(revId, -3);
      expect(historyStore.getRevision(revId)?.rating).toBe(0);
    });

    it('should filter takes by shotId via getTakesForShot', () => {
      const historyStore = useHistoryStore.getState();
      const shotA = createDefaultShotSpec({ id: 'shot-filter-A', name: 'Shot A' });
      const shotB = createDefaultShotSpec({ id: 'shot-filter-B', name: 'Shot B' });

      historyStore.saveRevisionV2({
        shot: shotA,
        engine: 'ltx-2.5',
        templateId: 'ltx25_stubelius',
        templateHash: 'hashA',
        bindingSchema: 1,
        mode: 't2v',
        profile: 'final',
        seed: 101,
        prompt: 'Shot A take 1',
        negative: '',
        promptSource: 'compiled',
        submittedWorkflow: {},
      });

      historyStore.saveRevisionV2({
        shot: shotA,
        engine: 'ltx-2.5',
        templateId: 'ltx25_stubelius',
        templateHash: 'hashA',
        bindingSchema: 1,
        mode: 't2v',
        profile: 'final',
        seed: 102,
        prompt: 'Shot A take 2',
        negative: '',
        promptSource: 'compiled',
        submittedWorkflow: {},
      });

      historyStore.saveRevisionV2({
        shot: shotB,
        engine: 'minimax-h3',
        templateId: 'h3_stubelius',
        templateHash: 'hashB',
        bindingSchema: 1,
        mode: 't2v',
        profile: 'draft',
        seed: 201,
        prompt: 'Shot B take 1',
        negative: '',
        promptSource: 'compiled',
        submittedWorkflow: {},
      });

      const takesA = historyStore.getTakesForShot('shot-filter-A');
      const takesB = historyStore.getTakesForShot('shot-filter-B');

      expect(takesA.length).toBe(2);
      expect(takesB.length).toBe(1);
      expect(takesA[0].seed).toBe(102); // newest first
      expect(takesA[1].seed).toBe(101);
    });
  });

  describe('Active Plate Assignment', () => {
    it('should inject take video into active shot vfxReference plate', () => {
      const shotStore = useShotStore.getState();
      const videoUrl = 'http://127.0.0.1:8188/view?filename=Take_03_LTX.mp4';
      const fileName = 'Take_03_LTX.mp4';

      shotStore.setTakeAsActivePlate(videoUrl, fileName);

      const activeShot = useShotStore.getState().shot;
      expect(activeShot.vfxReference).toBeDefined();
      expect(activeShot.vfxReference?.videoUrl).toBe(videoUrl);
      expect(activeShot.vfxReference?.fileName).toBe(fileName);
      expect(activeShot.vfxReference?.enabled).toBe(true);
      expect(activeShot.vfxReference?.referenceMode).toBe('full-scene');
    });
  });

  describe('Take Comparison & Metadata Diff', () => {
    it('should compute parameter deviations between two takes', () => {
      const shotA = createDefaultShotSpec({
        durationSeconds: 4.0,
        camera: {
          lens: { focalLength: '35mm', sensorSize: 'full-frame', aperture: 'f/2.8' },
          shotType: 'medium',
          angle: 'eye-level',
          movement: {
            type: 'dolly-in',
            speed: 'moderate',
            startPosition: { x: 50, y: 80, z: 20 },
            endPosition: { x: 50, y: 60, z: 20 },
            targetLookAt: { x: 50, y: 50 },
          },
        },
      });

      const shotB = createDefaultShotSpec({
        durationSeconds: 6.0,
        camera: {
          lens: { focalLength: '50mm', sensorSize: 'full-frame', aperture: 'f/2.8' },
          shotType: 'close-up',
          angle: 'low-angle',
          movement: {
            type: 'pan-left',
            speed: 'slow-cinematic',
            startPosition: { x: 50, y: 80, z: 20 },
            endPosition: { x: 30, y: 80, z: 20 },
            targetLookAt: { x: 50, y: 50 },
          },
        },
      });

      const diff = computeShotDiff(shotA, shotB);
      const changed = diff.filter((d) => d.changed);

      expect(changed.length).toBeGreaterThan(0);
      expect(diff.find((d) => d.label === 'Focal Length')?.changed).toBe(true);
      expect(diff.find((d) => d.label === 'Duration')?.changed).toBe(true);
      expect(diff.find((d) => d.label === 'Camera Angle')?.changed).toBe(true);
    });
  });
});
