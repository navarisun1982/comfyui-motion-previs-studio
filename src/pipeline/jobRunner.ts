import { ShotSpec } from '../types/shotspec';
import { ApiWorkflow, EngineId, GenerationMode, QualityProfile } from './templateTypes';
import { templateRegistry } from './templateRegistry';
import { bindTemplate, BindValues } from './templateBinder';
import { defaultComfyClient, ComfyClient } from '../services/comfyClient';
import { useComfyStore } from '../stores/useComfyStore';
import { useHistoryStore } from '../stores/useHistoryStore';
import { logger } from '../stores/useLogStore';

export interface ExecuteJobOptions {
  shot: ShotSpec;
  engine: EngineId;
  mode: GenerationMode;
  profile: QualityProfile;
  prompt: string;
  negative: string;
  seed: number;
  promptSource: 'compiled' | 'ai' | 'manual';
  firstFrameBlob?: Blob;
  firstFrameFilename?: string;
  client?: ComfyClient;
  onProgress?: (progress: number, currentNodeTitle: string) => void;
  onSuccess?: (revisionId: string, videoUrl: string, filename: string) => void;
  onError?: (error: Error) => void;
  onInterrupted?: () => void;
}

export interface ActiveJobHandle {
  promptId: string;
  cancel: () => Promise<void>;
  getBoundWorkflow: () => ApiWorkflow;
}

export class JobRunner {
  private activeHandle: ActiveJobHandle | null = null;

  getActiveHandle(): ActiveJobHandle | null {
    return this.activeHandle;
  }

  async run(options: ExecuteJobOptions): Promise<ActiveJobHandle> {
    const client = options.client || defaultComfyClient;
    const comfyStore = useComfyStore.getState();
    const historyStore = useHistoryStore.getState();

    // 1. Template discovery
    const reg = templateRegistry.find(options.engine, options.mode);
    if (!reg) {
      const err = new Error(
        `No registered template found for engine "${options.engine}" and mode "${options.mode}". Please supply workflow templates in workflows/templates.`
      );
      options.onError?.(err);
      throw err;
    }

    // 2. Preflight Health Check
    const health = await client.checkHealth();
    if (!health.ok) {
      const err = new Error(`ComfyUI server unreachable at ${client.getServerUrl()}: ${health.error}`);
      options.onError?.(err);
      throw err;
    }

    // 3. Optional First-Frame Upload for I2V
    let uploadedFilename: string | undefined = options.firstFrameFilename || options.shot.referenceImage?.filename;
    if (options.mode === 'i2v' && options.firstFrameBlob) {
      logger.action('Uploading content-addressed first frame to ComfyUI...');
      const uploadRes = await client.uploadContentAddressed(
        options.firstFrameBlob,
        `${options.shot.name.replace(/\s+/g, '_')}_first_frame.png`
      );
      uploadedFilename = uploadRes.name;
    }

    // 4. Bind Template
    let width = 1280;
    let height = 720;
    if (options.shot.aspectRatio === '9:16') {
      width = 720;
      height = 1280;
    } else if (options.shot.aspectRatio === '4:3') {
      width = 1024;
      height = 768;
    } else if (options.shot.aspectRatio === '1:1') {
      width = 768;
      height = 768;
    } else if (options.shot.aspectRatio === '2.39:1') {
      width = 1344;
      height = 576;
    }

    const bindValues: BindValues = {
      mode: options.mode,
      profile: options.profile,
      prompt: options.prompt,
      negative: options.negative,
      seed: options.seed,
      durationSeconds: options.shot.durationSeconds,
      frameRate: options.shot.frameRate,
      aspectRatio: options.shot.aspectRatio,
      width,
      height,
      firstFrameFile: uploadedFilename,
      filenamePrefix: `cmpvs_${options.shot.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${options.shot.version}`,
    };

    const bound = bindTemplate(reg.api, reg.binding, bindValues);
    const boundWorkflow = bound.workflow;
    const outputNodeId = reg.binding.output.node;

    // 5. Submit Prompt
    const submitRes = await client.submitPrompt(boundWorkflow);
    const promptId = submitRes.promptId;
    comfyStore.startJob(promptId, options.shot.id, options.shot.name);

    let capturedVideoUrl: string | null = null;
    let capturedFilename: string | null = null;
    let isCompleted = false;

    const finalizeSuccess = async () => {
      if (isCompleted) return;
      isCompleted = true;

      // If video wasn't captured directly via WS packet, check /history
      if (!capturedVideoUrl) {
        const hist = await client.getPromptHistory(promptId);
        if (hist && hist.outputs) {
          const outputs = hist.outputs as Record<string, Record<string, unknown>>;
          // Look specifically at the designated output node
          const outputData = outputs[outputNodeId] || outputs[Object.keys(outputs)[0]];
          if (outputData) {
            const v = client.extractVideoOutput(outputData);
            if (v) {
              capturedVideoUrl = client.getViewUrl(v.filename, v.subfolder, v.type);
              capturedFilename = v.filename;
            }
          }
        }
      }

      if (capturedVideoUrl) {
        comfyStore.setJobCompleted(capturedVideoUrl, capturedFilename || 'video.mp4');
        const revId = historyStore.saveRevisionV2({
          shot: options.shot,
          engine: options.engine,
          templateId: reg.binding.templateId,
          templateHash: reg.templateHash,
          bindingSchema: reg.binding.schema,
          mode: options.mode,
          profile: options.profile,
          seed: options.seed,
          prompt: options.prompt,
          negative: options.negative,
          promptSource: options.promptSource,
          submittedWorkflow: boundWorkflow,
          promptId,
          status: 'completed',
          outputVideoUrl: capturedVideoUrl,
          outputFilename: capturedFilename || undefined,
          note: `${options.engine.toUpperCase()} ${options.mode.toUpperCase()}: ${options.shot.camera.movement.type} (${options.profile})`,
        });
        options.onSuccess?.(revId, capturedVideoUrl, capturedFilename || 'video.mp4');
      } else {
        const err = new Error('Execution completed but no video output file was found on the designated output node.');
        comfyStore.setJobFailed(err.message);
        options.onError?.(err);
      }
    };

    // 6. Register WebSocket Listener for this specific prompt_id
    const unregister = client.registerJobListener({
      promptId,
      onExecuting: (nodeId) => {
        if (!nodeId) return;
        const nodeTitle = boundWorkflow[nodeId]?._meta?.title || `Node #${nodeId}`;
        comfyStore.updateJobProgress(comfyStore.activeJob?.progress || 10, `Executing: ${nodeTitle}`);
        options.onProgress?.(comfyStore.activeJob?.progress || 10, nodeTitle);
      },
      onProgress: (nodeId, current, max) => {
        const pct = Math.round((current / max) * 100);
        const nodeTitle = boundWorkflow[nodeId]?._meta?.title || `Node #${nodeId}`;
        comfyStore.updateJobProgress(pct, `Sampling (${current}/${max})`);
        options.onProgress?.(pct, `Sampling (${current}/${max}) - ${nodeTitle}`);
      },
      onExecuted: (nodeId, output) => {
        // Check if output is from the designated target output node
        const v = client.extractVideoOutput(output, outputNodeId, nodeId);
        if (v) {
          capturedVideoUrl = client.getViewUrl(v.filename, v.subfolder, v.type);
          capturedFilename = v.filename;
        }
      },
      onSuccess: () => {
        finalizeSuccess();
      },
      onInterrupted: () => {
        comfyStore.setJobFailed('Execution interrupted by user.');
        options.onInterrupted?.();
      },
      onError: (msg) => {
        comfyStore.setJobFailed(msg);
        options.onError?.(new Error(msg));
      },
    });

    const handle: ActiveJobHandle = {
      promptId,
      cancel: async () => {
        await client.interrupt();
        await client.deleteQueueItem(promptId);
        unregister();
        comfyStore.setJobFailed('Cancelled by user');
      },
      getBoundWorkflow: () => boundWorkflow,
    };

    this.activeHandle = handle;
    return handle;
  }
}

export const defaultJobRunner = new JobRunner();
