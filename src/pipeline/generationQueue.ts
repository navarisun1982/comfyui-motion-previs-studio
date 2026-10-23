import { ShotSpec, createDefaultShotSpec } from '../types/shotspec';
import { EngineId, GenerationMode, QualityProfile } from './templateTypes';
import { defaultJobRunner, ActiveJobHandle, ExecuteJobOptions } from './jobRunner';
import { useHistoryStore } from '../stores/useHistoryStore';
import { useComfyStore } from '../stores/useComfyStore';
import { logger } from '../stores/useLogStore';

export interface QueueItem {
  id: string;
  shotId: string;
  shotName: string;
  shotSpec?: ShotSpec;
  takeNumber: number;
  engine: EngineId;
  mode: GenerationMode;
  profile: QualityProfile;
  seed: number;
  prompt: string;
  negative: string;
  firstFrameFilename?: string;
  firstFrameBlob?: Blob;
  controlVideoBlob?: Blob;
  controlVideoFilename?: string;
  icLora?: string;
  icLoraStrength?: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentNodeTitle?: string;
  error?: string;
  outputVideoUrl?: string;
  outputFilename?: string;
  revisionId?: string;
  createdAt: number;
  completedAt?: number;
}

export interface EnqueueBatchParams {
  shot: ShotSpec;
  engine: EngineId;
  mode: GenerationMode;
  profile: QualityProfile;
  prompt: string;
  negative: string;
  baseSeed?: number;
  count: number;
  seedStrategy: 'random' | 'sequential';
  firstFrameFilename?: string;
  firstFrameBlob?: Blob;
  controlVideoBlob?: Blob;
  controlVideoFilename?: string;
  icLora?: string;
  icLoraStrength?: number;
}

export type QueueListener = (items: QueueItem[], activeItem: QueueItem | null) => void;

export class GenerationQueueManager {
  private items: QueueItem[] = [];
  private activeHandle: ActiveJobHandle | null = null;
  private isProcessing = false;
  private listeners: Set<QueueListener> = new Set();
  private runner: { run: (options: ExecuteJobOptions) => Promise<ActiveJobHandle> };

  constructor(options?: { runner?: { run: (options: ExecuteJobOptions) => Promise<ActiveJobHandle> } }) {
    this.runner = options?.runner || defaultJobRunner;
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener([...this.items], this.getActiveItem());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const active = this.getActiveItem();
    const snapshot = [...this.items];
    for (const listener of this.listeners) {
      try {
        listener(snapshot, active);
      } catch (e) {
        console.error('Error in QueueListener', e);
      }
    }
  }

  getItems(): QueueItem[] {
    return [...this.items];
  }

  getActiveItem(): QueueItem | null {
    return this.items.find((i) => i.status === 'running') || null;
  }

  getItemsForShot(shotId: string): QueueItem[] {
    return this.items.filter((i) => i.shotId === shotId);
  }

  enqueueBatch(params: EnqueueBatchParams): QueueItem[] {
    const count = Math.max(1, Math.min(20, Math.floor(params.count)));
    const history = useHistoryStore.getState().getTakesForShot(params.shot.id);
    const existingQueued = this.items.filter((i) => i.shotId === params.shot.id);
    let nextTakeNumber = history.length + existingQueued.length + 1;

    const initialSeed =
      typeof params.baseSeed === 'number' && Number.isFinite(params.baseSeed)
        ? params.baseSeed
        : Math.floor(Math.random() * 1000000000);

    const newItems: QueueItem[] = [];

    for (let i = 0; i < count; i++) {
      let seed: number;
      if (params.seedStrategy === 'sequential') {
        seed = initialSeed + i;
      } else {
        seed = i === 0 && params.baseSeed ? initialSeed : Math.floor(Math.random() * 1000000000);
      }

      const item: QueueItem = {
        id: `q-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        shotId: params.shot.id,
        shotName: params.shot.name,
        shotSpec: params.shot,
        takeNumber: nextTakeNumber++,
        engine: params.engine,
        mode: params.mode,
        profile: params.profile,
        seed,
        prompt: params.prompt,
        negative: params.negative,
        firstFrameFilename: params.firstFrameFilename,
        firstFrameBlob: params.firstFrameBlob,
        controlVideoBlob: params.controlVideoBlob,
        controlVideoFilename: params.controlVideoFilename,
        icLora: params.icLora,
        icLoraStrength: params.icLoraStrength,
        status: 'queued',
        progress: 0,
        createdAt: Date.now() + i,
      };

      newItems.push(item);
    }

    this.items = [...this.items, ...newItems];
    logger.action(`Enqueued ${newItems.length} take(s) for "${params.shot.name}" (${params.seedStrategy} seeds)`);
    this.notify();

    // Trigger queue processor if not already running
    if (!this.isProcessing) {
      void this.processNext();
    }

    return newItems;
  }

  async cancelItem(id: string): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;

    if (item.status === 'running') {
      logger.action(`Cancelling active generation Take ${item.takeNumber}`);
      if (this.activeHandle) {
        try {
          await this.activeHandle.cancel();
        } catch (e) {
          console.warn('Error during activeHandle.cancel()', e);
        }
        this.activeHandle = null;
      }
      item.status = 'cancelled';
      item.error = 'Cancelled by user';
      item.completedAt = Date.now();
      this.notify();
      void this.processNext();
    } else if (item.status === 'queued') {
      logger.action(`Removed Take ${item.takeNumber} from queue`);
      item.status = 'cancelled';
      item.completedAt = Date.now();
      this.notify();
    }
  }

  async clearQueue(): Promise<void> {
    logger.action('Clearing generation queue');
    if (this.activeHandle) {
      try {
        await this.activeHandle.cancel();
      } catch (e) {
        console.warn('Error during activeHandle.cancel()', e);
      }
      this.activeHandle = null;
    }

    this.items = this.items.map((item) => {
      if (item.status === 'queued' || item.status === 'running') {
        return { ...item, status: 'cancelled', completedAt: Date.now() };
      }
      return item;
    });

    this.isProcessing = false;
    this.notify();
  }

  clearAll(): void {
    if (this.activeHandle) {
      void this.activeHandle.cancel().catch(() => {});
      this.activeHandle = null;
    }
    this.items = [];
    this.isProcessing = false;
    this.notify();
  }

  clearCompleted(): void {
    this.items = this.items.filter((i) => i.status === 'queued' || i.status === 'running');
    this.notify();
  }

  retryItem(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.status === 'running') return;

    item.status = 'queued';
    item.progress = 0;
    item.error = undefined;
    item.completedAt = undefined;
    logger.action(`Retrying Take ${item.takeNumber} (Seed ${item.seed})`);
    this.notify();

    if (!this.isProcessing) {
      void this.processNext();
    }
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;

    const nextItem = this.items.find((i) => i.status === 'queued');
    if (!nextItem) {
      this.isProcessing = false;
      this.activeHandle = null;
      this.notify();
      return;
    }

    this.isProcessing = true;
    nextItem.status = 'running';
    nextItem.progress = 0;
    nextItem.currentNodeTitle = 'Initiating ComfyUI pipeline...';
    this.notify();

    const comfyStore = useComfyStore.getState();

    try {
      const resolvedShot: ShotSpec = nextItem.shotSpec
        ? { ...nextItem.shotSpec, seed: nextItem.seed, version: nextItem.takeNumber }
        : createDefaultShotSpec({
            id: nextItem.shotId,
            name: nextItem.shotName,
            seed: nextItem.seed,
            version: nextItem.takeNumber,
          });

      const handle = await this.runner.run({
        engine: nextItem.engine,
        mode: nextItem.mode,
        profile: nextItem.profile,
        shot: resolvedShot,
        prompt: nextItem.prompt,
        negative: nextItem.negative,
        seed: nextItem.seed,
        promptSource: 'compiled',
        firstFrameFilename: nextItem.firstFrameFilename,
        firstFrameBlob: nextItem.firstFrameBlob,
        controlVideoBlob: nextItem.controlVideoBlob,
        controlVideoFilename: nextItem.controlVideoFilename,
        icLora: nextItem.icLora,
        icLoraStrength: nextItem.icLoraStrength,
        onProgress: (pct, nodeTitle) => {
          nextItem.progress = pct;
          nextItem.currentNodeTitle = nodeTitle;
          comfyStore.updateJobProgress(pct, nodeTitle);
          this.notify();
        },
        onSuccess: (revisionId, videoUrl, filename) => {
          nextItem.status = 'completed';
          nextItem.progress = 100;
          nextItem.revisionId = revisionId;
          nextItem.outputVideoUrl = videoUrl;
          nextItem.outputFilename = filename;
          nextItem.completedAt = Date.now();
          comfyStore.setJobCompleted(videoUrl, filename);
          this.activeHandle = null;
          this.isProcessing = false;
          this.notify();
          // Process next queued job
          setTimeout(() => void this.processNext(), 50);
        },
        onError: (err) => {
          nextItem.status = 'failed';
          nextItem.error = err.message;
          nextItem.completedAt = Date.now();
          comfyStore.setJobFailed(err.message);
          this.activeHandle = null;
          this.isProcessing = false;
          this.notify();
          // Process next queued job despite failure
          setTimeout(() => void this.processNext(), 50);
        },
        onInterrupted: () => {
          nextItem.status = 'cancelled';
          nextItem.error = 'Cancelled by user';
          nextItem.completedAt = Date.now();
          this.activeHandle = null;
          this.isProcessing = false;
          this.notify();
          setTimeout(() => void this.processNext(), 50);
        },
      });

      this.activeHandle = handle;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      nextItem.status = 'failed';
      nextItem.error = msg;
      nextItem.completedAt = Date.now();
      comfyStore.setJobFailed(msg);
      this.activeHandle = null;
      this.isProcessing = false;
      this.notify();
      setTimeout(() => void this.processNext(), 50);
    }
  }
}

export const defaultGenerationQueue = new GenerationQueueManager();
