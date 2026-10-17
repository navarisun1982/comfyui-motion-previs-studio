import { useState, useEffect, useRef } from 'react';
import { ShotSpec } from '../types/shotspec';
import { useShotStore } from '../stores/useShotStore';
import { useComfyStore } from '../stores/useComfyStore';
import { useHistoryStore } from '../stores/useHistoryStore';
import { getAdapter, getAllAdapters } from '../adapters';
import { defaultComfyClient } from '../services/comfyClient';
import {
  Play,
  Upload,
  Server,
  Cpu,
  AlertCircle,
  CheckCircle2,
  Download,
  FileCode,
  ShieldCheck,
  RefreshCw,
  Loader2,
} from 'lucide-react';

export const ComfyExecutionPanel: React.FC = () => {
  const { shot, updateTargetModel, setReferenceImage, compiledPrompt } = useShotStore();
  const {
    serverUrl,
    connectionStatus,
    systemStats,
    activeJob,
    setConnectionStatus,
    setSystemStats,
    startJob,
    updateJobProgress,
    setJobCompleted,
    setJobFailed,
  } = useComfyStore();
  const { saveRevision } = useHistoryStore();

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const adapter = getAdapter(shot.targetModel);
  const allAdapters = getAllAdapters();

  // Check ComfyUI server health periodically
  const pingServer = async () => {
    setConnectionStatus('connecting');
    const res = await defaultComfyClient.checkHealth();
    if (res.ok && res.stats) {
      setConnectionStatus('connected');
      setSystemStats(res.stats);
    } else {
      setConnectionStatus('disconnected');
    }
  };

  useEffect(() => {
    pingServer();
    const interval = setInterval(pingServer, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handle image upload
  const handleFileUpload = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadError(null);

      // Local preview
      const previewUrl = URL.createObjectURL(file);

      // Upload to ComfyUI if connected
      let uploadedFilename = file.name;
      if (connectionStatus === 'connected') {
        const uploaded = await defaultComfyClient.uploadImage(file);
        uploadedFilename = uploaded.name;
      }

      setReferenceImage({
        filename: uploadedFilename,
        previewUrl,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // Execute Generation
  const handleExecuteGeneration = async () => {
    const isMock = shot.targetModel === 'mock-engine';

    if (!isMock && connectionStatus !== 'connected') {
      alert('Local ComfyUI server is offline or unreachable on http://127.0.0.1:8188. Switch to Mock Engine or check ComfyUI terminal.');
      return;
    }

    try {
      // 1. Build workflow from adapter
      const uploadedFilename = shot.referenceImage?.filename;
      const graph = adapter.buildWorkflow(shot, uploadedFilename);

      if (isMock) {
        // Mock execution with simulated progress
        const mockPromptId = `mock-${Date.now()}`;
        startJob(mockPromptId, shot.id, shot.name);

        let progress = 0;
        const interval = setInterval(() => {
          progress += 20;
          updateJobProgress(progress, `Simulating diffusion step (${progress}%)...`);
          if (progress >= 100) {
            clearInterval(interval);
            const mockVideoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
            setJobCompleted(mockVideoUrl, `mock_output_${shot.name}.mp4`);
            saveRevision(shot, compiledPrompt.positivePrompt, mockVideoUrl, `Mock Run: ${shot.camera.movement.type}`);
          }
        }, 300);
        return;
      }

      // 2. Real ComfyUI execution
      const submitRes = await defaultComfyClient.submitPrompt(graph);
      const promptId = submitRes.promptId;
      startJob(promptId, shot.id, shot.name);

      // 3. Connect WebSocket watcher
      const cleanupWs = defaultComfyClient.connectWebSocket({
        onProgress: (_nodeId, current, max) => {
          const pct = Math.round((current / max) * 100);
          updateJobProgress(pct, `Sampling video frames (${current}/${max})`);
        },
        onExecuting: (nodeId) => {
          if (nodeId) {
            const nodeMeta = graph[nodeId]?._meta?.title || `Node #${nodeId}`;
            updateJobProgress(activeJob?.progress || 10, `Executing: ${nodeMeta}`);
          }
        },
        onExecuted: async (_nodeId, output) => {
          // If video output generated
          if (output.videos && Array.isArray(output.videos) && output.videos.length > 0) {
            const v = output.videos[0] as { filename: string; subfolder?: string; type?: string };
            const videoUrl = defaultComfyClient.getViewUrl(v.filename, v.subfolder, v.type);
            setJobCompleted(videoUrl, v.filename);
            saveRevision(shot, compiledPrompt.positivePrompt, videoUrl, `LTX Run: ${shot.camera.movement.type}`);
            cleanupWs();
          }
        },
        onError: (err) => {
          setJobFailed(err);
          cleanupWs();
        },
      });

      // Poll history as safety net in case WS closes before executed packet
      const pollHistory = setInterval(async () => {
        const hist = await defaultComfyClient.getPromptHistory(promptId);
        if (hist) {
          const outputs = hist.outputs as Record<string, Record<string, unknown[]>>;
          if (outputs) {
            for (const nId of Object.keys(outputs)) {
              const nodeOut = outputs[nId];
              const videos = (nodeOut.videos || nodeOut.gifs || []) as Array<{ filename: string; subfolder?: string; type?: string }>;
              if (videos.length > 0) {
                clearInterval(pollHistory);
                const v = videos[0];
                const videoUrl = defaultComfyClient.getViewUrl(v.filename, v.subfolder, v.type);
                setJobCompleted(videoUrl, v.filename);
                saveRevision(shot, compiledPrompt.positivePrompt, videoUrl, `LTX Run: ${shot.camera.movement.type}`);
                cleanupWs();
                break;
              }
            }
          }
        }
      }, 2500);

      // Timeout safety net
      setTimeout(() => clearInterval(pollHistory), 180000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setJobFailed(msg);
    }
  };

  // Export Workflow JSON
  const handleExportWorkflow = () => {
    const graph = adapter.buildWorkflow(shot, shot.referenceImage?.filename);
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comfy_workflow_${shot.targetModel}_${shot.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      {/* ComfyUI Server Status Banner */}
      <div className="glass-card rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between border-b border-director-border/50 pb-2">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-director-gold" />
            <span className="font-mono text-xs font-bold text-white">ComfyUI Backend</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            <span className="font-mono text-[10px] text-slate-300 uppercase">{connectionStatus}</span>
            <button onClick={pingServer} className="text-slate-400 hover:text-white ml-1" title="Refresh ping">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </div>

        {systemStats ? (
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-slate-300 pt-1">
            <div className="flex items-center gap-1.5 truncate">
              <Cpu className="h-3.5 w-3.5 text-director-cyan shrink-0" />
              <span className="truncate">{systemStats.gpuName}</span>
            </div>
            <div className="text-right text-slate-400">
              VRAM: <span className="text-emerald-400 font-bold">{systemStats.vramFreeGb}GB</span> / {systemStats.vramTotalGb}GB
            </div>
          </div>
        ) : (
          <p className="font-mono text-[10px] text-slate-400">
            Connecting to local backend at <code className="text-director-gold">{serverUrl}</code>...
          </p>
        )}
      </div>

      {/* Target Model Selection */}
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] text-slate-400 flex items-center justify-between">
          <span>Target Generation Engine</span>
          {adapter.capabilities.isOpenWeights && (
            <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold">
              <ShieldCheck className="h-3 w-3" />
              OPEN WEIGHTS COMPLIANT
            </span>
          )}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {allAdapters.map((a) => {
            const isSelected = shot.targetModel === a.id;
            return (
              <button
                key={a.id}
                onClick={() => updateTargetModel(a.id as ShotSpec['targetModel'])}
                className={`flex flex-col rounded-lg p-2.5 text-left transition-all ${
                  isSelected
                    ? 'border-director-gold bg-director-gold/15 text-white ring-1 ring-director-gold'
                    : 'glass-control text-slate-400 hover:text-white'
                }`}
              >
                <span className="font-display font-bold text-xs text-white">{a.name}</span>
                <span className="font-mono text-[9px] text-slate-400 mt-1 line-clamp-1">{a.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reference Image / Start Frame Upload */}
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
          <Upload className="h-3 w-3 text-director-cyan" />
          Reference Start Frame (Image-to-Video)
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="glass-card hover:border-director-cyan/60 transition-all cursor-pointer rounded-lg p-3 border border-dashed border-director-border text-center flex flex-col items-center justify-center gap-2"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
            accept="image/*"
            className="hidden"
          />

          {shot.referenceImage ? (
            <div className="flex items-center gap-3 w-full">
              <img
                src={shot.referenceImage.previewUrl}
                alt="Reference preview"
                className="h-12 w-16 rounded object-cover border border-director-border"
              />
              <div className="flex flex-col text-left truncate flex-1">
                <span className="font-mono text-xs text-white truncate">{shot.referenceImage.filename}</span>
                <span className="font-mono text-[9px] text-emerald-400">Ready for Image-to-Video</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setReferenceImage(undefined);
                }}
                className="text-[10px] text-rose-400 hover:underline font-mono"
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              {isUploading ? (
                <div className="flex items-center gap-2 font-mono text-[11px] text-director-cyan">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading start frame to ComfyUI...
                </div>
              ) : (
                <>
                  <Upload className="h-5 w-5 text-slate-400 stroke-1" />
                  <span className="font-mono text-[11px] text-slate-300">
                    Drop reference image or click to browse
                  </span>
                  <span className="text-[9px] text-slate-500 font-sans">
                    Optional: Starts camera move from this exact frame
                  </span>
                </>
              )}
            </>
          )}
        </div>
        {uploadError && <span className="font-mono text-[10px] text-rose-400">{uploadError}</span>}
      </div>

      {/* Primary Action Button: DIRECT SHOT / GENERATE */}
      <div className="flex flex-col gap-2 pt-2">
        <button
          onClick={handleExecuteGeneration}
          disabled={activeJob?.status === 'executing' || activeJob?.status === 'queued'}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-director-gold to-director-amber font-display text-sm font-bold uppercase tracking-wider text-director-darkest shadow-glow-gold transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {activeJob?.status === 'executing' || activeJob?.status === 'queued' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              DIRECTING SHOT ({activeJob.progress}%)...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              DIRECT SHOT (EXECUTE WORKFLOW)
            </>
          )}
        </button>

        {/* Progress Bar when Active */}
        {activeJob && (activeJob.status === 'executing' || activeJob.status === 'queued') && (
          <div className="flex flex-col gap-1 rounded-lg border border-director-border bg-director-dark p-2.5">
            <div className="flex items-center justify-between font-mono text-[10px]">
              <span className="text-director-cyan truncate max-w-xs">{activeJob.currentNodeTitle}</span>
              <span className="text-director-gold font-bold">{activeJob.progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-director-panel">
              <div
                className="h-full bg-gradient-to-r from-director-cyan to-director-gold transition-all duration-300"
                style={{ width: `${activeJob.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error notification */}
        {activeJob?.status === 'failed' && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 font-mono text-[10px] text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <div className="flex flex-col">
              <span className="font-bold">Generation Failed:</span>
              <span>{activeJob.error}</span>
            </div>
          </div>
        )}

        {/* Success notification & Video Player */}
        {activeJob?.status === 'completed' && activeJob.outputVideoUrl && (
          <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                VIDEO RENDER COMPLETED
              </span>
              <a
                href={activeJob.outputVideoUrl}
                download={activeJob.outputFilename || 'director_shot.mp4'}
                className="flex items-center gap-1 text-[10px] text-director-gold hover:underline font-mono"
              >
                <Download className="h-3 w-3" />
                Download MP4
              </a>
            </div>

            <video
              src={activeJob.outputVideoUrl}
              controls
              autoPlay
              loop
              className="w-full aspect-video rounded-lg bg-black object-contain border border-director-border shadow-lg"
            />
          </div>
        )}

        {/* Secondary Workflow Export Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-director-border/50">
          <button
            onClick={handleExportWorkflow}
            className="flex items-center gap-1 text-slate-400 hover:text-white font-mono text-[10px]"
          >
            <FileCode className="h-3 w-3" />
            Export ComfyUI Workflow JSON
          </button>
        </div>
      </div>
    </div>
  );
};
