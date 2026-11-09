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
  templateId?: string;
  prompt: string;
  negative: string;
  seed: number;
  promptSource: 'compiled' | 'ai' | 'manual';
  firstFrameBlob?: Blob;
  firstFrameFilename?: string;
  controlVideoBlob?: Blob;
  controlVideoFilename?: string;
  refImageBlobs?: Array<Blob | File | null>;
  refImageFilenames?: [string, string, string, string];
  refImageDescriptions?: [string, string, string, string];
  icLora?: string;
  icLoraStrength?: number;
  steps?: number;
  firstPassScale?: number;
  referenceMode?: 'OFF' | 'ON';
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

  async cancelActiveJob(): Promise<void> {
    const handle = this.activeHandle;
    this.activeHandle = null;
    if (handle) {
      await handle.cancel();
    } else {
      await defaultComfyClient.interrupt();
      useComfyStore.getState().setJobFailed('Render stopped by user.');
    }
  }

  async run(options: ExecuteJobOptions): Promise<ActiveJobHandle> {
    const client = options.client || defaultComfyClient;
    const comfyStore = useComfyStore.getState();
    const historyStore = useHistoryStore.getState();

    // 1. Template discovery (prefer explicit templateId from Workflow Selector if provided)
    const reg =
      (options.templateId ? templateRegistry.get(options.templateId) : undefined) ||
      templateRegistry.find(options.engine, options.mode);
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

    // 3. Optional First-Frame Upload for I2V & Control Video Upload for Control Mode
    let uploadedFilename: string | undefined = options.firstFrameFilename || options.shot.referenceImage?.filename;
    if (options.mode === 'i2v' && options.firstFrameBlob) {
      logger.action('Uploading content-addressed first frame to ComfyUI...');
      const uploadRes = await client.uploadContentAddressed(
        options.firstFrameBlob,
        `${options.shot.name.replace(/\s+/g, '_')}_first_frame.png`
      );
      uploadedFilename = uploadRes.name;
    }

    let controlVideoFilename: string | undefined = options.controlVideoFilename;
    if (options.mode === 'control' && options.controlVideoBlob) {
      logger.action('Uploading content-addressed 3D previs control video to ComfyUI...');
      const uploadRes = await client.uploadContentAddressed(
        options.controlVideoBlob,
        `${options.shot.name.replace(/\s+/g, '_')}_previs_control.mp4`
      );
      controlVideoFilename = uploadRes.name;
    }

    const resolvedRefImages: [string | undefined, string | undefined, string | undefined, string | undefined] = [
      options.refImageFilenames?.[0]?.trim() || undefined,
      options.refImageFilenames?.[1]?.trim() || undefined,
      options.refImageFilenames?.[2]?.trim() || undefined,
      options.refImageFilenames?.[3]?.trim() || undefined,
    ];
    if (options.refImageBlobs && options.refImageBlobs.length > 0) {
      for (let i = 0; i < 4; i++) {
        const blob = options.refImageBlobs[i];
        if (blob) {
          logger.action(`Uploading Reference Image <picture ${i + 1}> to ComfyUI...`);
          const up = await client.uploadContentAddressed(blob, `char${i + 1}.png`);
          resolvedRefImages[i] = up.name;
        }
      }
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
      controlVideoFile: controlVideoFilename,
      refImage1File: resolvedRefImages[0],
      refImage2File: resolvedRefImages[1],
      refImage3File: resolvedRefImages[2],
      refImage4File: resolvedRefImages[3],
      refImageDescriptions: options.refImageDescriptions,
      icLora: options.icLora,
      icLoraStrength: options.icLoraStrength,
      steps: options.steps,
      firstPassScale: options.firstPassScale,
      referenceMode: options.referenceMode,
      filenamePrefix: `cmpvs_${options.shot.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${options.shot.version}`,
    };

    const bound = bindTemplate(reg.api, reg.binding, bindValues);
    const boundWorkflow = bound.workflow;
    const outputNodeId = reg.binding.output.node;
    const fallbackOutputNodeIds = reg.binding.output.fallbackNodes || [];

    // 5. Submit Prompt
    const submitRes = await client.submitPrompt(boundWorkflow);
    const promptId = submitRes.promptId;
    comfyStore.startJob(promptId, options.shot.id, options.shot.name);

    let capturedVideoUrl: string | null = null;
    let capturedFilename: string | null = null;
    let fallbackVideoUrl: string | null = null;
    let fallbackFilename: string | null = null;
    let isCompleted = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let unregister: (() => void) | null = null;
    let consecutiveOfflinePolls = 0;
    let missingFromQueuePolls = 0;

    const extractVideoFromHistoryOutputs = (
      outputs?: Record<string, Record<string, unknown>>
    ): { filename: string; subfolder?: string; type?: string } | null => {
      if (!outputs) return null;
      const orderedNodeIds = [
        outputNodeId,
        ...fallbackOutputNodeIds,
        ...Object.keys(outputs).filter((k) => k !== outputNodeId && !fallbackOutputNodeIds.includes(k)),
      ];
      for (const candidateNodeId of orderedNodeIds) {
        const outData = outputs[candidateNodeId];
        if (!outData) continue;
        const v = client.extractVideoOutput(outData);
        if (v) return v;
      }
      return null;
    };

    const cleanupJobListeners = () => {
      if (pollInterval !== null) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (unregister) {
        unregister();
        unregister = null;
      }
    };

    const finalizeSuccess = async () => {
      if (isCompleted) return;
      isCompleted = true;
      cleanupJobListeners();
      if (this.activeHandle?.promptId === promptId) {
        this.activeHandle = null;
      }

      // If primary video wasn't captured directly via WS packet, check /history (primary + fallback save nodes)
      if (!capturedVideoUrl) {
        const hist = await client.getPromptHistory(promptId);
        if (hist && hist.outputs) {
          const outputs = hist.outputs as Record<string, Record<string, unknown>>;
          const v = extractVideoFromHistoryOutputs(outputs);
          if (v) {
            capturedVideoUrl = await client.fetchVideoBlobUrl(v.filename, v.subfolder, v.type);
            capturedFilename = v.filename;
          }
        }
      }

      // If still not found in /history, use fallback video captured via WS (e.g. Node #10 Seed 1)
      if (!capturedVideoUrl && fallbackVideoUrl) {
        capturedVideoUrl = fallbackVideoUrl;
        capturedFilename = fallbackFilename;
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

    const failJob = async (errMsg: string, isInterrupted = false) => {
      if (isCompleted) return;
      // If a secondary post-processing/refine stage failed AFTER an intermediate seed save node
      // (such as Node #10 in Stubelius LTX) already produced a valid full video, recover that video!
      if (!isInterrupted) {
        if (capturedVideoUrl || fallbackVideoUrl) {
          await finalizeSuccess();
          return;
        }
        try {
          const hist = await client.getPromptHistory(promptId);
          if (hist && hist.outputs) {
            const v = extractVideoFromHistoryOutputs(hist.outputs as Record<string, Record<string, unknown>>);
            if (v) {
              fallbackVideoUrl = await client.fetchVideoBlobUrl(v.filename, v.subfolder, v.type);
              fallbackFilename = v.filename;
              await finalizeSuccess();
              return;
            }
          }
        } catch {
          // proceed with normal error reporting
        }
      }
      isCompleted = true;
      cleanupJobListeners();
      if (this.activeHandle?.promptId === promptId) {
        this.activeHandle = null;
      }
      useComfyStore.getState().setJobFailed(errMsg);
      if (isInterrupted) {
        options.onInterrupted?.();
      } else {
        options.onError?.(new Error(errMsg));
      }
    };

    // 6. Register WebSocket Listener for this specific prompt_id
    unregister = client.registerJobListener({
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
      onExecuted: async (nodeId, output) => {
        // 1. Check if output is from the primary designated output node
        const vPrimary = client.extractVideoOutput(output, outputNodeId, nodeId);
        if (vPrimary) {
          capturedVideoUrl = await client.fetchVideoBlobUrl(vPrimary.filename, vPrimary.subfolder, vPrimary.type);
          capturedFilename = vPrimary.filename;
          return;
        }
        // 2. Check if output is from a known fallback save node (e.g. Node #10 Seed 1 in Stubelius LTX)
        if (fallbackOutputNodeIds.includes(nodeId)) {
          const vFallback = client.extractVideoOutput(output);
          if (vFallback) {
            fallbackVideoUrl = await client.fetchVideoBlobUrl(vFallback.filename, vFallback.subfolder, vFallback.type);
            fallbackFilename = vFallback.filename;
          }
        }
      },
      onSuccess: () => {
        void finalizeSuccess();
      },
      onInterrupted: () => {
        void failJob('Execution interrupted by user.', true);
      },
      onError: (msg) => {
        void failJob(msg, false);
      },
    });

    pollInterval = setInterval(async () => {
      if (isCompleted) {
        cleanupJobListeners();
        return;
      }
      const hist = await client.getPromptHistory(promptId);
      if (hist) {
        consecutiveOfflinePolls = 0;
        const status = hist.status as
          | {
              status_str?: string;
              completed?: boolean;
              messages?: Array<[string, Record<string, unknown>]>;
            }
          | undefined;

        if (status?.status_str === 'error') {
          let errMsg = 'ComfyUI execution failed.';
          if (Array.isArray(status.messages)) {
            const errEntry = status.messages.find((m) => Array.isArray(m) && m[0] === 'execution_error');
            if (errEntry && errEntry[1]) {
              const exMsg = errEntry[1].exception_message || errEntry[1].exception_type;
              const nodeType = errEntry[1].node_type || errEntry[1].node_id;
              if (exMsg) {
                errMsg = nodeType ? `ComfyUI Error (${nodeType}): ${String(exMsg)}` : String(exMsg);
              }
            }
          }
          await failJob(errMsg, false);
          return;
        }

        if (
          Array.isArray(status?.messages) &&
          status.messages.some((m) => Array.isArray(m) && m[0] === 'execution_interrupted')
        ) {
          await failJob('Execution interrupted by user.', true);
          return;
        }

        if (hist.outputs) {
          const outputs = hist.outputs as Record<string, Record<string, unknown>>;
          const primaryData = outputs[outputNodeId];
          if (primaryData && client.extractVideoOutput(primaryData)) {
            await finalizeSuccess();
            return;
          }
          if (status?.completed === true) {
            await finalizeSuccess();
            return;
          }
        }
        return;
      }

      // Prompt not in /history yet: verify ComfyUI is still alive and the prompt is still in /queue
      const queueStatus = await client.getQueueStatus();
      if (!queueStatus.ok) {
        consecutiveOfflinePolls += 1;
        if (consecutiveOfflinePolls >= 2) {
          useComfyStore.getState().setConnectionStatus('error');
          failJob(
            'ComfyUI server disconnected or stopped during execution. Once ComfyUI is running again, click Render in ComfyUI to retry.',
            false
          );
        }
        return;
      }

      consecutiveOfflinePolls = 0;
      const inQueue =
        queueStatus.runningPromptIds.includes(promptId) ||
        queueStatus.pendingPromptIds.includes(promptId);
      if (!inQueue) {
        // Double-check /history immediately in case it just finished between the two requests
        const recheckHist = await client.getPromptHistory(promptId);
        if (recheckHist) {
          missingFromQueuePolls = 0;
          return;
        }
        missingFromQueuePolls += 1;
        if (missingFromQueuePolls >= 2) {
          failJob(
            'Render job is no longer active in ComfyUI queue (ComfyUI may have restarted or encountered an error). Ready to render again.',
            false
          );
        }
      } else {
        missingFromQueuePolls = 0;
      }
    }, 3000);

    const handle: ActiveJobHandle = {
      promptId,
      cancel: async () => {
        await client.interrupt();
        await client.deleteQueueItem(promptId);
        failJob('Render stopped by user.', true);
      },
      getBoundWorkflow: () => boundWorkflow,
    };

    this.activeHandle = handle;
    return handle;
  }
}

export const defaultJobRunner = new JobRunner();
