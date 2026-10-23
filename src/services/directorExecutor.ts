import { ShotSpec } from '../types/shotspec';
import { getAdapter } from '../adapters';
import { defaultComfyClient } from './comfyClient';
import { useComfyStore } from '../stores/useComfyStore';
import { useHistoryStore } from '../stores/useHistoryStore';

/**
 * Universal Director Execution Engine
 * Submits the compiled ShotSpec graph to the local ComfyUI server,
 * streams real-time WebSocket progress, captures output video, and records history diff.
 */
export async function executeDirectorialShot(
  shot: ShotSpec,
  compiledPromptText: string,
  callbacks?: {
    onProgress?: (pct: number, nodeTitle: string) => void;
    onCompleted?: (videoUrl: string, filename: string) => void;
    onError?: (error: string) => void;
  }
): Promise<string> {
  const comfyStore = useComfyStore.getState();
  const historyStore = useHistoryStore.getState();

  if (comfyStore.connectionStatus !== 'connected') {
    // Quick ping to check if server is reachable
    const health = await defaultComfyClient.checkHealth();
    if (!health.ok) {
      const err = 'Local ComfyUI server is offline or unreachable on http://127.0.0.1:8188.';
      callbacks?.onError?.(err);
      throw new Error(err);
    }
  }

  const adapter = getAdapter(shot.targetModel);
  const uploadedFilename = shot.referenceImage?.filename;
  const graph = adapter.buildWorkflow(shot, uploadedFilename);

  // Real ComfyUI execution
  const submitRes = await defaultComfyClient.submitPrompt(graph);
  const promptId = submitRes.promptId;
  comfyStore.startJob(promptId, shot.id, shot.name);

  // Connect WebSocket watcher
  const cleanupWs = defaultComfyClient.connectWebSocket({
    onProgress: (_nodeId, current, max) => {
      const pct = Math.round((current / max) * 100);
      const title = `Sampling video frames (${current}/${max})`;
      comfyStore.updateJobProgress(pct, title);
      callbacks?.onProgress?.(pct, title);
    },
    onExecuting: (nodeId) => {
      if (nodeId) {
        const nodeMeta = graph[nodeId]?._meta?.title || `Node #${nodeId}`;
        const title = `Executing: ${nodeMeta}`;
        comfyStore.updateJobProgress(comfyStore.activeJob?.progress || 10, title);
        callbacks?.onProgress?.(comfyStore.activeJob?.progress || 10, title);
      }
    },
    onExecuted: async (_nodeId, output) => {
      const v = defaultComfyClient.extractVideoOutput(output);
      if (v) {
        const videoUrl = defaultComfyClient.getViewUrl(v.filename, v.subfolder, v.type);
        comfyStore.setJobCompleted(videoUrl, v.filename);
        historyStore.saveRevision(shot, compiledPromptText, videoUrl, `LTX Run: ${shot.camera.movement.type}`);
        callbacks?.onCompleted?.(videoUrl, v.filename);
        cleanupWs();
      }
    },
    onError: (err) => {
      comfyStore.setJobFailed(err);
      callbacks?.onError?.(err);
      cleanupWs();
    },
  });

  // Safety net polling
  const pollHistory = setInterval(async () => {
    try {
      const hist = await defaultComfyClient.getPromptHistory(promptId);
      if (hist && hist.outputs) {
        const outputs = hist.outputs as Record<string, Record<string, unknown>>;
        for (const nId of Object.keys(outputs)) {
          const v = defaultComfyClient.extractVideoOutput(outputs[nId]);
          if (v) {
            clearInterval(pollHistory);
            const videoUrl = defaultComfyClient.getViewUrl(v.filename, v.subfolder, v.type);
            comfyStore.setJobCompleted(videoUrl, v.filename);
            historyStore.saveRevision(shot, compiledPromptText, videoUrl, `LTX Run: ${shot.camera.movement.type}`);
            callbacks?.onCompleted?.(videoUrl, v.filename);
            cleanupWs();
            break;
          }
        }
      }
    } catch {
      // ignore polling errors
    }
  }, 1000);

  return promptId;
}
