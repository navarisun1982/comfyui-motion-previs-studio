import { useState, useEffect, useRef } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { useComfyStore } from '../stores/useComfyStore';
import { getAdapter } from '../adapters';
import { defaultComfyClient } from '../services/comfyClient';
import { defaultJobRunner, ActiveJobHandle } from '../pipeline/jobRunner';
import { exportOfflinePackageForShot } from '../pipeline/packageExporter';
import { QualityProfile } from '../pipeline/templateTypes';
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
  Film,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  XCircle,
} from 'lucide-react';

interface ComfyExecutionPanelProps {
  onBackToPrevis?: () => void;
}

export const ComfyExecutionPanel: React.FC<ComfyExecutionPanelProps> = ({ onBackToPrevis }) => {
  const {
    shot,
    compiledPrompt,
    setReferenceImage,
    previsVideoUrl,
    isRenderingPrevis,
    previsProgress,
    renderPrevisVideo,
  } = useShotStore();
  const {
    serverUrl,
    connectionStatus,
    systemStats,
    activeJob,
    setConnectionStatus,
    setSystemStats,
    updateJobProgress,
    setJobCompleted,
    setJobFailed,
  } = useComfyStore();

  const [profile, setProfile] = useState<QualityProfile>('final');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [videoLoadError, setVideoLoadError] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeJobHandleRef = useRef<ActiveJobHandle | null>(null);

  const adapter = getAdapter(shot.targetModel);

  // Download In-App Previs Video directly to Disk
  const handleDownloadPrevisVideo = () => {
    if (!previsVideoUrl) return;
    const filename = `${shot.name.replace(/\s+/g, '_')}_3D_Previs.mp4`;
    const link = document.createElement('a');
    link.href = previsVideoUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download AI Generated Video directly to Disk
  const handleDownloadVideo = async () => {
    if (!activeJob?.outputVideoUrl) return;
    const url = activeJob.outputVideoUrl;
    const filename = activeJob.outputFilename || `${shot.name.replace(/\s+/g, '_')}_AI_Final.mp4`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename.endsWith('.mp4') ? filename : `${filename}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

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

  // Execute Generation via verified JobRunner pipeline
  const handleExecuteGeneration = async () => {
    if (shot.targetModel === 'seedance') {
      handleExportPackage();
      return;
    }

    if (connectionStatus !== 'connected') {
      alert(
        'Local ComfyUI server is offline or unreachable on http://127.0.0.1:8188.\n\n' +
        'Please check that your ComfyUI server is running, or use "Export Offline Package" below to export a self-contained execution package.'
      );
      return;
    }

    try {
      setVideoLoadError(false);
      const engine = shot.targetModel === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5';
      const mode = shot.referenceImage?.filename ? 'i2v' : 't2v';

      const handle = await defaultJobRunner.run({
        engine,
        mode,
        profile,
        shot,
        prompt: compiledPrompt.positivePrompt,
        negative: shot.negativePrompt,
        seed: shot.seed ?? Math.floor(Math.random() * 1000000),
        firstFrameFilename: shot.referenceImage?.filename,
        promptSource: 'compiled',
        onProgress: (pct, nodeTitle) => {
          updateJobProgress(pct, nodeTitle);
        },
        onSuccess: (_revisionId, videoUrl, filename) => {
          setJobCompleted(videoUrl, filename);
          activeJobHandleRef.current = null;
        },
        onError: (err) => {
          setJobFailed(err.message);
          activeJobHandleRef.current = null;
        },
      });
      activeJobHandleRef.current = handle;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setJobFailed(msg);
      activeJobHandleRef.current = null;
    }
  };

  const handleCancelGeneration = async () => {
    if (activeJobHandleRef.current) {
      await activeJobHandleRef.current.cancel();
      activeJobHandleRef.current = null;
    }
  };

  const handleExportPackage = () => {
    try {
      exportOfflinePackageForShot({ shot, profile });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Export failed: ${msg}`);
    }
  };

  // Export Legacy Workflow JSON (fallback)
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
      {onBackToPrevis && (
        <button
          onClick={onBackToPrevis}
          className="flex items-center gap-1.5 text-blue-400 hover:text-white font-mono text-[11px] font-semibold transition-colors py-1 px-2.5 rounded bg-white/5 hover:bg-white/10 border border-white/5 w-fit"
          title="Return to 3D Previs Soundstage"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>← Back to Directing Stage</span>
        </button>
      )}
      {/* Step Pipeline Navigation Breadcrumb */}
      <div className="flex items-center justify-between rounded-lg bg-black/40 border border-director-border p-2 font-mono text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${previsVideoUrl ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
          <span className="font-bold text-white">1. 3D Previs (In-App)</span>
        </div>
        <ArrowRight className="h-3 w-3 text-slate-500" />
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${activeJob?.status === 'completed' ? 'bg-emerald-400' : connectionStatus === 'connected' ? 'bg-blue-400' : 'bg-slate-600'}`} />
          <span className="text-slate-300">2. ComfyUI Diffusion</span>
        </div>
      </div>

      {/* SECTION 1: IN-APP 3D PREVIS VIDEO */}
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-director-gold" />
            <span className="font-mono text-xs font-bold text-white">1. In-App 3D Previs Video</span>
          </div>
          {previsVideoUrl ? (
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-400 border border-emerald-500/40">
              READY
            </span>
          ) : isRenderingPrevis ? (
            <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-300 border border-amber-500/40 animate-pulse">
              RENDERING {previsProgress}%
            </span>
          ) : (
            <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[9px] text-slate-400">
              NOT RENDERED
            </span>
          )}
        </div>

        <p className="font-sans text-[11px] text-slate-300 leading-snug">
          Directly captures your 3D soundstage camera move, focal length, and actor blocking into a 24 FPS video file inside this app.
        </p>

        {previsVideoUrl ? (
          <div className="flex flex-col gap-2 pt-1">
            <video
              src={previsVideoUrl}
              controls
              autoPlay
              loop
              playsInline
              className="w-full aspect-video rounded-lg bg-black object-contain border border-amber-500/30 shadow-md"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPrevisVideo}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300 font-mono text-[10px] font-bold py-2 transition-all cursor-pointer"
                title="Download 3D Previs MP4 directly to your PC"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Previs MP4</span>
              </button>
              <button
                type="button"
                onClick={() => renderPrevisVideo()}
                disabled={isRenderingPrevis}
                className="flex items-center gap-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-mono text-[10px] px-3 py-2 transition-all cursor-pointer disabled:opacity-50"
                title="Re-render 3D scene from viewfinder"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Re-render</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={() => renderPrevisVideo()}
              disabled={isRenderingPrevis}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-display text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {isRenderingPrevis ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  RENDERING 3D PREVIS ({previsProgress}%)...
                </>
              ) : (
                <>
                  <Film className="h-4 w-4" />
                  RENDER 3D PREVIS (IN-APP 24 FPS)
                </>
              )}
            </button>

            {isRenderingPrevis && (
              <div className="flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-black/40 p-2">
                <div className="flex items-center justify-between font-mono text-[9px] text-amber-300">
                  <span>Capturing WebGL 3D Camera Move</span>
                  <span className="font-bold">{previsProgress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-amber-400 transition-all duration-150"
                    style={{ width: `${previsProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2: COMFYUI AI DIFFUSION PASS */}
      <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-3.5 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-blue-500/20 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-400" />
            <span className="font-mono text-xs font-bold text-white">2. AI Diffusion (Send to ComfyUI)</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            <span className="font-mono text-[10px] text-slate-300 uppercase">{connectionStatus}</span>
            <button onClick={pingServer} className="text-slate-400 hover:text-white ml-0.5" title="Refresh ping">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </div>

        <p className="font-sans text-[11px] text-slate-300 leading-snug">
          Feeds your in-app 3D Previs video plate to ComfyUI for photorealistic AI diffusion synthesis.
        </p>

        {systemStats ? (
          <div className="flex flex-col gap-1.5 font-mono text-[10px] text-slate-300 bg-black/40 p-2 rounded-lg border border-white/5">
            <div className="flex items-center justify-between text-slate-400 border-b border-white/5 pb-1">
              <div className="flex items-center gap-1.5 truncate">
                <Server className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="truncate">{serverUrl}</span>
              </div>
              <span className="text-emerald-400 font-bold uppercase">{connectionStatus}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="flex items-center gap-1.5 truncate">
                <Cpu className="h-3.5 w-3.5 text-director-cyan shrink-0" />
                <span className="truncate">{systemStats.gpuName}</span>
              </div>
              <div className="text-right text-slate-400">
                VRAM: <span className="text-emerald-400 font-bold">{systemStats.vramFreeGb}GB</span> / {systemStats.vramTotalGb}GB
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 bg-black/40 p-2 rounded-lg border border-white/5">
            <Server className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span>Backend: <code className="text-director-gold">{serverUrl}</code></span>
          </div>
        )}

        {/* Target Engine & Provenance */}
        <div className="flex flex-col gap-2 rounded-lg bg-black/40 p-3 border border-white/5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
              Target Engine (Directed in Previs)
            </span>
            {adapter.capabilities.isOpenWeights ? (
              <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="h-3 w-3" />
                OPEN WEIGHTS
              </span>
            ) : shot.targetModel === 'seedance' ? (
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-300 border border-amber-500/30">
                PROMPT EXPORT ONLY
              </span>
            ) : (
              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold text-blue-400 border border-blue-500/30">
                LOCAL RTX 3090
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="font-display font-bold text-sm text-white block">{adapter.name}</span>
              <span className="font-mono text-[9px] text-slate-400">{adapter.description}</span>
            </div>
            {onBackToPrevis && (
              <button
                type="button"
                onClick={onBackToPrevis}
                className="text-director-cyan hover:underline font-mono text-[10px] shrink-0 ml-2"
                title="Change engine in 3D Previs Soundstage"
              >
                Change Engine →
              </button>
            )}
          </div>
          {shot.targetModel === 'seedance' && (
            <div className="text-[10px] text-amber-300/80 font-mono bg-amber-500/10 p-2 rounded border border-amber-500/20">
              ByteDance Seedance has no local open weights. Generating will export the camera trajectory matrix and prompt package for Seaweed/Seedance.
            </div>
          )}
        </div>

        {/* Quality Profile Selector */}
        {shot.targetModel !== 'seedance' && (
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] text-slate-400 flex items-center justify-between">
              <span>Quality Profile</span>
              <span className="text-[9px] text-slate-500 font-mono">
                {profile === 'draft' ? 'Fast native render' : 'Full upscale & refine'}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProfile('draft')}
                className={`flex flex-col rounded-lg p-2 text-left transition-all cursor-pointer ${
                  profile === 'draft'
                    ? 'border-blue-500 bg-blue-500/20 text-white ring-1 ring-blue-500'
                    : 'glass-control text-slate-400 hover:text-white'
                }`}
              >
                <span className="font-display font-bold text-xs">Draft</span>
                <span className="font-mono text-[9px] text-slate-400">Native res, no refine</span>
              </button>
              <button
                type="button"
                onClick={() => setProfile('final')}
                className={`flex flex-col rounded-lg p-2 text-left transition-all cursor-pointer ${
                  profile === 'final'
                    ? 'border-blue-500 bg-blue-500/20 text-white ring-1 ring-blue-500'
                    : 'glass-control text-slate-400 hover:text-white'
                }`}
              >
                <span className="font-display font-bold text-xs">Final</span>
                <span className="font-mono text-[9px] text-slate-400">Production quality</span>
              </button>
            </div>
          </div>
        )}

        {/* Reference Image / Start Frame Upload */}
        <div className="flex flex-col gap-1.5">
          <label className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
            <Upload className="h-3 w-3 text-director-cyan" />
            Optional Start Frame (Image-to-Video Anchor)
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="glass-card hover:border-director-cyan/60 transition-all cursor-pointer rounded-lg p-2.5 border border-dashed border-director-border text-center flex flex-col items-center justify-center gap-1.5"
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
                  className="h-10 w-14 rounded object-cover border border-director-border"
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
                  <div className="flex items-center gap-2 font-mono text-[10px] text-director-cyan">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading start frame...
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Upload className="h-4 w-4" />
                    <span className="font-mono text-[10px] text-slate-300">
                      Drop optional start frame image
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          {uploadError && <span className="font-mono text-[10px] text-rose-400">{uploadError}</span>}
        </div>

        {/* Primary Action Button */}
        <div className="flex flex-col gap-2 pt-1">
          {shot.targetModel === 'seedance' ? (
            <button
              onClick={handleExportPackage}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 font-display text-xs font-bold uppercase tracking-wider text-black shadow-lg shadow-amber-500/20 transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer"
            >
              <Download className="h-4 w-4" />
              EXPORT SEEDANCE DIRECTORIAL PACKAGE
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleExecuteGeneration}
                disabled={activeJob?.status === 'executing' || activeJob?.status === 'queued'}
                className="flex-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 font-display text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-blue-600/30 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {activeJob?.status === 'executing' || activeJob?.status === 'queued' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    COMFYUI DIFFUSING ({activeJob.progress}%)...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    DIFFUSE SHOT IN COMFYUI
                  </>
                )}
              </button>
              {(activeJob?.status === 'executing' || activeJob?.status === 'queued') && (
                <button
                  type="button"
                  onClick={handleCancelGeneration}
                  className="px-4 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  title="Cancel active ComfyUI generation job"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel
                </button>
              )}
            </div>
          )}

          {/* Progress Bar when Active */}
          {activeJob && (activeJob.status === 'executing' || activeJob.status === 'queued') && (
            <div className="flex flex-col gap-1 rounded-lg border border-director-border bg-director-dark p-2.5">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-director-cyan truncate max-w-xs">{activeJob.currentNodeTitle}</span>
                <span className="text-blue-400 font-bold">{activeJob.progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-director-panel">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 transition-all duration-300"
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

          {/* Success notification & Final Video Player */}
          {activeJob?.status === 'completed' && activeJob.outputVideoUrl && (
            <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  GENERATION COMPLETED
                </span>
                <button
                  type="button"
                  onClick={handleDownloadVideo}
                  className="flex items-center gap-1.5 text-[10px] text-director-gold hover:text-amber-300 font-mono font-bold bg-director-gold/10 hover:bg-director-gold/20 px-2.5 py-1 rounded border border-director-gold/30 transition-all cursor-pointer"
                  title="Download MP4 video directly to your computer"
                >
                  <Download className="h-3 w-3" />
                  Download AI Video
                </button>
              </div>

              <video
                src={activeJob.outputVideoUrl}
                controls
                autoPlay
                loop
                playsInline
                onError={() => setVideoLoadError(true)}
                onLoadedData={() => setVideoLoadError(false)}
                className="w-full aspect-video rounded-lg bg-black object-contain border border-director-border shadow-lg"
              />

              {videoLoadError && (
                <div className="p-2 text-center text-rose-300 text-[10px] font-mono bg-rose-950/60 rounded border border-rose-800/50">
                  Unable to stream video inline. Click <strong>Download AI Video</strong> above to save and view the file locally.
                </div>
              )}
            </div>
          )}

          {/* Secondary Workflow Export Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-director-border/50">
            <button
              onClick={handleExportPackage}
              className="flex items-center gap-1.5 text-slate-300 hover:text-director-cyan font-mono text-[10px] transition-colors"
              title="Download API workflow and manifest for offline or remote execution"
            >
              <Download className="h-3 w-3" />
              Export Generation Package (Offline Mode)
            </button>
            <button
              onClick={handleExportWorkflow}
              className="flex items-center gap-1 text-slate-400 hover:text-white font-mono text-[10px]"
            >
              <FileCode className="h-3 w-3" />
              Workflow JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
