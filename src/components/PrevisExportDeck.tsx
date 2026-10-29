import React, { useState, useEffect, useRef } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { useComfyStore } from '../stores/useComfyStore';
import { getAdapter } from '../adapters';
import { getReasonerConfig } from '../services/objectReasoner';
import { directPromptWithAI } from '../services/aiPromptDirector';
import { exportCameraPoseBundle, exportCameraExtrinsicsJson } from '../engine/cameraMatrixExport';
import { defaultComfyClient } from '../services/comfyClient';
import { defaultJobRunner } from '../pipeline/jobRunner';
import { loadBundledTemplates } from '../pipeline/templateLoader';
import { templateRegistry } from '../pipeline/templateRegistry';
import {
  Film,
  Download,
  Copy,
  Check,
  Play,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Video,
  FileCode,
  Compass,
  Layers,
  Target,
  Brain,
  Wand2,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Code2,
  Zap,
  Columns,
  Upload,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface PrevisExportDeckProps {
  onBackToPrevis?: () => void;
}

export const PrevisExportDeck: React.FC<PrevisExportDeckProps> = ({ onBackToPrevis }) => {
  const {
    shot,
    compiledPrompt,
    setCompiledPrompt,
    setNegativePrompt,
    previsVideoUrl,
    previsOpenPoseUrl,
    previsDepthUrl,
    isRenderingPrevis,
    previsProgress,
    renderPrevisVideo,
    updateTargetModel,
    updateActor,
    setEnvironment,
  } = useShotStore();

  const [activeEngineTab, setActiveEngineTab] = useState<'ltx-2.5' | 'minimax-h3' | 'seedance'>(
    shot.targetModel === 'minimax-h3' ? 'minimax-h3' : shot.targetModel === 'seedance' ? 'seedance' : 'ltx-2.5'
  );
  const [activePassTab, setActivePassTab] = useState<'rgb' | 'openpose' | 'depth' | 'comfy-final' | 'side-by-side'>('rgb');
  const [renderPassMode, setRenderPassMode] = useState<'all' | 'rgb' | 'openpose' | 'depth'>('all');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedNegative, setCopiedNegative] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedMatrix, setCopiedMatrix] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<'720p' | '1080p'>('720p');
  const [isDirectingPrompt, setIsDirectingPrompt] = useState(false);
  const [aiDirectorFeedback, setAiDirectorFeedback] = useState<string | null>(null);
  const [showTimelineDetails, setShowTimelineDetails] = useState(true);

  // ComfyUI Live Bridge State (MiniMax H3 Ref2VA & LTX-2.5)
  const {
    activeJob,
    serverUrl: storeServerUrl,
    connectionStatus: storeConnectionStatus,
    systemStats: storeSystemStats,
    setConnectionStatus: setStoreConnectionStatus,
    setSystemStats: setStoreSystemStats,
  } = useComfyStore();
  const [comfyOnline, setComfyOnline] = useState<boolean>(storeConnectionStatus === 'connected');
  const [comfyGpuLabel, setComfyGpuLabel] = useState<string>(
    storeSystemStats ? `${storeSystemStats.gpuName} (${storeSystemStats.vramTotalGb}GB VRAM)` : 'Checking 127.0.0.1:8188...'
  );
  const [refImageNames, setRefImageNames] = useState<[string, string, string, string]>([
    shot.actors[0]?.conceptImageName || 'char1.png',
    shot.actors[1]?.conceptImageName || 'char2.png',
    shot.actors[2]?.conceptImageName || 'char3.png',
    shot.environment?.conceptImageName || 'char4.png',
  ]);
  const [refSlotTargets, setRefSlotTargets] = useState<[string, string, string, string]>(() => [
    shot.actors[0]?.id || 'custom',
    shot.actors[1]?.id || 'custom',
    shot.actors[2]?.id || 'custom',
    'environment',
  ]);
  const [refImageThumbs, setRefImageThumbs] = useState<[string | null, string | null, string | null, string | null]>([
    shot.actors[0]?.conceptImageUrl || null,
    shot.actors[1]?.conceptImageUrl || null,
    shot.actors[2]?.conceptImageUrl || null,
    shot.environment?.conceptImageUrl || null,
  ]);
  const [refImageFiles, setRefImageFiles] = useState<[File | null, File | null, File | null, File | null]>([
    null,
    null,
    null,
    null,
  ]);
  const [comfySeed, setComfySeed] = useState<number>(532752046112665);
  const [isSubmittingComfy, setIsSubmittingComfy] = useState<boolean>(false);
  const [comfyStatusText, setComfyStatusText] = useState<string | null>(null);
  const [comfyErrorText, setComfyErrorText] = useState<string | null>(null);
  const [finalComfyVideoUrl, setFinalComfyVideoUrl] = useState<string | null>(null);
  const [finalComfyFilename, setFinalComfyFilename] = useState<string | null>(null);
  const [finalComfyMeta, setFinalComfyMeta] = useState<string | null>(null);

  const syncLeftVideoRef = useRef<HTMLVideoElement | null>(null);
  const syncRightVideoRef = useRef<HTMLVideoElement | null>(null);

  const probeComfyHealth = async () => {
    setComfyErrorText(null);
    setComfyGpuLabel('Connecting to 127.0.0.1:8188...');
    const health = await defaultComfyClient.checkHealth();
    if (health.ok && health.stats) {
      setComfyOnline(true);
      setStoreConnectionStatus('connected');
      setStoreSystemStats(health.stats);
      setComfyGpuLabel(`${health.stats.gpuName} (${health.stats.vramTotalGb}GB VRAM)`);
      const latest = await defaultComfyClient.fetchLatestCompletedOutput(10);
      if (latest) {
        setFinalComfyVideoUrl(latest.videoUrl);
        setFinalComfyFilename(latest.filename);
        const metaParts = [
          latest.width && latest.height ? `${latest.width}×${latest.height}` : null,
          latest.fps ? `${latest.fps}fps` : null,
          latest.duration ? `${latest.duration.toFixed(1)}s` : null,
        ].filter(Boolean);
        setFinalComfyMeta(metaParts.join(' • ') || 'ComfyUI Output');
      }
      return true;
    } else {
      setComfyOnline(false);
      setStoreConnectionStatus('error');
      setComfyGpuLabel('Offline (127.0.0.1:8188) • Click to Reconnect');
      return false;
    }
  };

  // Sync when Settings modal updates useComfyStore
  useEffect(() => {
    if (storeConnectionStatus === 'connected' && storeSystemStats) {
      setComfyOnline(true);
      setComfyGpuLabel(`${storeSystemStats.gpuName} (${storeSystemStats.vramTotalGb}GB VRAM)`);
      setComfyErrorText(null);
    }
  }, [storeConnectionStatus, storeSystemStats, storeServerUrl]);

  // Ensure bundled workflow templates are registered and probe ComfyUI on mount
  useEffect(() => {
    if (templateRegistry.list().length === 0) {
      loadBundledTemplates();
    }
    probeComfyHealth();
  }, []);

  const handleLoadLatestComfyRender = async () => {
    setComfyErrorText(null);
    setComfyStatusText('Checking ComfyUI /history for latest completed render...');
    const health = await defaultComfyClient.checkHealth();
    if (health.ok && health.stats) {
      setComfyOnline(true);
      setComfyGpuLabel(`${health.stats.gpuName} (${health.stats.vramTotalGb}GB VRAM)`);
    }
    const latest = await defaultComfyClient.fetchLatestCompletedOutput(15);
    if (latest) {
      setFinalComfyVideoUrl(latest.videoUrl);
      setFinalComfyFilename(latest.filename);
      const metaParts = [
        latest.width && latest.height ? `${latest.width}×${latest.height}` : null,
        latest.fps ? `${latest.fps}fps` : null,
        latest.duration ? `${latest.duration.toFixed(1)}s` : null,
      ].filter(Boolean);
      setFinalComfyMeta(metaParts.join(' • ') || 'ComfyUI Output');
      setComfyStatusText(`Loaded latest ComfyUI render: ${latest.filename}`);
      setActivePassTab(previsVideoUrl ? 'side-by-side' : 'comfy-final');
    } else {
      setComfyErrorText('No completed video output found in ComfyUI history.');
      setComfyStatusText(null);
    }
  };

  // Automatically sync reference image slots with Directing Stage object/set reference images
  useEffect(() => {
    setRefSlotTargets((prevTargets) => {
      const nextTargets = [...prevTargets] as [string, string, string, string];
      for (let i = 0; i < 3; i++) {
        const cur = nextTargets[i];
        const exists = shot.actors.some((a) => a.id === cur);
        if (!exists && shot.actors[i]) {
          nextTargets[i] = shot.actors[i].id;
        }
      }
      return nextTargets;
    });
  }, [shot.actors]);

  useEffect(() => {
    const nextThumbs: [string | null, string | null, string | null, string | null] = [...refImageThumbs] as any;
    const nextNames: [string, string, string, string] = [...refImageNames] as any;
    let changed = false;

    for (let idx = 0; idx < 4; idx++) {
      const targetId = refSlotTargets[idx];
      if (targetId === 'environment') {
        if (shot.environment?.conceptImageUrl && nextThumbs[idx] !== shot.environment.conceptImageUrl) {
          nextThumbs[idx] = shot.environment.conceptImageUrl;
          changed = true;
        }
        if (shot.environment?.conceptImageName && nextNames[idx] !== shot.environment.conceptImageName) {
          nextNames[idx] = shot.environment.conceptImageName;
          changed = true;
        }
      } else if (targetId && targetId !== 'custom') {
        const actor = shot.actors.find((a) => a.id === targetId);
        if (actor?.conceptImageUrl && nextThumbs[idx] !== actor.conceptImageUrl) {
          nextThumbs[idx] = actor.conceptImageUrl;
          changed = true;
        }
        if (actor?.conceptImageName && nextNames[idx] !== actor.conceptImageName) {
          nextNames[idx] = actor.conceptImageName;
          changed = true;
        }
      }
    }

    if (changed) {
      setRefImageThumbs(nextThumbs);
      setRefImageNames(nextNames);
    }
  }, [refSlotTargets, shot.actors, shot.environment]);

  const handleRenderInComfyUI = async () => {
    setComfyErrorText(null);
    // Validate that all 4 Reference Image slots are filled for MiniMax H3 Ref2VA
    const trimmedRefs = refImageNames.map((n) => n.trim()) as [string, string, string, string];
    if (trimmedRefs.some((n) => n.length === 0)) {
      setComfyErrorText('All 4 Reference Image slots (<picture 1> to <picture 4>) must be filled before submitting to MiniMax H3 Ref2VA.');
      return;
    }

    setIsSubmittingComfy(true);
    try {
      // 1. Ensure 3D RGB Previs MP4 exists (auto-render if needed)
      let rgbUrl = useShotStore.getState().previsVideoUrl;
      if (!rgbUrl) {
        setComfyStatusText('Step 1/3: Rendering 24fps 3D RGB Previs MP4 for <Video 1> reference...');
        await renderPrevisVideo('rgb');
        rgbUrl = useShotStore.getState().previsVideoUrl;
      }
      if (!rgbUrl) {
        throw new Error('Failed to generate 3D RGB Previs video for ComfyUI upload.');
      }

      // Fetch blob from object URL + resolve any DataURL thumbnails uploaded in Directing Stage into Blobs!
      setComfyStatusText('Step 2/3: Uploading 3D Previs MP4 & Reference Images to ComfyUI (127.0.0.1:8188)...');
      const previsBlob = await (await fetch(rgbUrl)).blob();

      const resolvedRefBlobs: [Blob | null, Blob | null, Blob | null, Blob | null] = [null, null, null, null];
      for (let i = 0; i < 4; i++) {
        if (refImageFiles[i]) {
          resolvedRefBlobs[i] = refImageFiles[i];
        } else if (refImageThumbs[i]) {
          try {
            const res = await fetch(refImageThumbs[i]!);
            resolvedRefBlobs[i] = await res.blob();
          } catch {
            resolvedRefBlobs[i] = null;
          }
        }
      }

      if (templateRegistry.list().length === 0) {
        loadBundledTemplates();
      }

      // 2. Queue job via JobRunner using minimax_h3_ref2va (mode: 'control')
      // Always ensure a valid MiniMax H3 Ref2VA multi-subject prompt is bound to Node 138
      const minimaxCompiled = getAdapter('minimax-h3').compilePrompt(shot);
      const effectiveMinimaxPrompt =
        activeEngineTab === 'minimax-h3' &&
        displayPositivePrompt.includes('subject_definitions:') &&
        !displayPositivePrompt.includes('from mark (')
          ? displayPositivePrompt
          : minimaxCompiled.positivePrompt;

      setComfyStatusText('Step 3/3: Binding minimax_h3_ref2va (SolAttn + 8-Step Turbo LoRA) & queuing in ComfyUI...');
      await defaultJobRunner.run({
        shot,
        engine: 'minimax-h3',
        mode: 'control',
        profile: selectedResolution === '1080p' ? 'final' : 'draft',
        prompt: effectiveMinimaxPrompt,
        negative: displayNegativePrompt,
        seed: Math.max(0, Math.floor(comfySeed)),
        promptSource: 'compiled',
        controlVideoBlob: previsBlob,
        refImageBlobs: resolvedRefBlobs,
        refImageFilenames: trimmedRefs,
        onProgress: (pct, title) => {
          setComfyStatusText(`ComfyUI Executing (${pct}%): ${title}`);
        },
        onSuccess: (_revId, videoUrl, filename) => {
          setFinalComfyVideoUrl(videoUrl);
          setFinalComfyFilename(filename);
          setFinalComfyMeta('1504×832 • 60fps RIFE + Audio');
          setComfyStatusText(`Completed! Final video ready: ${filename}`);
          setIsSubmittingComfy(false);
          setActivePassTab('side-by-side');
        },
        onError: (err) => {
          setComfyErrorText(err.message);
          setComfyStatusText(null);
          setIsSubmittingComfy(false);
        },
        onInterrupted: () => {
          setComfyErrorText('ComfyUI execution interrupted.');
          setComfyStatusText(null);
          setIsSubmittingComfy(false);
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setComfyErrorText(msg);
      setComfyStatusText(null);
      setIsSubmittingComfy(false);
    }
  };

  const handleSyncRestartBoth = () => {
    if (syncLeftVideoRef.current) {
      syncLeftVideoRef.current.currentTime = 0;
      syncLeftVideoRef.current.play().catch(() => {});
    }
    if (syncRightVideoRef.current) {
      syncRightVideoRef.current.currentTime = 0;
      syncRightVideoRef.current.play().catch(() => {});
    }
  };

  // Keep local tab synced if shot.targetModel changes externally (e.g. from Right Inspector)
  useEffect(() => {
    const normalized =
      shot.targetModel === 'minimax-h3'
        ? 'minimax-h3'
        : shot.targetModel === 'seedance'
        ? 'seedance'
        : 'ltx-2.5';
    setActiveEngineTab(normalized);
  }, [shot.targetModel]);

  // Compile deterministic fallback for active tab
  const activeAdapter = getAdapter(activeEngineTab);
  const deterministicPrompt = activeAdapter.compilePrompt(shot);
  const isCompiledMatchingEngine =
    compiledPrompt?.positivePrompt &&
    !compiledPrompt.positivePrompt.includes('from mark (') &&
    (activeEngineTab !== 'minimax-h3' || compiledPrompt.positivePrompt.includes('subject_definitions:'));
  const displayPositivePrompt = isCompiledMatchingEngine
    ? compiledPrompt.positivePrompt
    : deterministicPrompt.positivePrompt;
  const displayNegativePrompt = shot.negativePrompt ?? compiledPrompt?.negativePrompt ?? deterministicPrompt.negativePrompt ?? '';
  const temporalBeats = deterministicPrompt.temporalBeats || compiledPrompt?.temporalBeats || [];
  const poseBundle = exportCameraPoseBundle(shot);

  const handleSelectEngine = (engineId: 'ltx-2.5' | 'minimax-h3' | 'seedance') => {
    setActiveEngineTab(engineId);
    updateTargetModel(engineId);
    const adapter = getAdapter(engineId);
    setCompiledPrompt(adapter.compilePrompt({ ...shot, targetModel: engineId }));
    setAiDirectorFeedback(null);
  };

  const handleDirectWithAi = async () => {
    setIsDirectingPrompt(true);
    setAiDirectorFeedback(null);
    try {
      const res = await directPromptWithAI(shot, activeEngineTab);
      setCompiledPrompt({
        ...compiledPrompt,
        positivePrompt: res.positivePrompt,
        negativePrompt: res.negativePrompt,
      });
      if (res.negativePrompt) {
        setNegativePrompt(res.negativePrompt);
      }
      setAiDirectorFeedback(res.directorNotes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiDirectorFeedback(`AI Direction failed: ${msg}`);
    } finally {
      setIsDirectingPrompt(false);
    }
  };

  const handleResetToDeterministicPrompt = () => {
    const adapter = getAdapter(activeEngineTab);
    const standard = adapter.compilePrompt(shot);
    setCompiledPrompt(standard);
    setAiDirectorFeedback('Reset to deterministic model-compiled prompt.');
    setTimeout(() => setAiDirectorFeedback(null), 3000);
  };

  const handleCopyPrompt = (text: string, isNeg = false) => {
    navigator.clipboard.writeText(text);
    if (isNeg) {
      setCopiedNegative(true);
      setTimeout(() => setCopiedNegative(false), 2000);
    } else {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const currentPassUrl =
    activePassTab === 'rgb'
      ? previsVideoUrl
      : activePassTab === 'openpose'
      ? previsOpenPoseUrl
      : activePassTab === 'depth'
      ? previsDepthUrl
      : activePassTab === 'comfy-final'
      ? finalComfyVideoUrl
      : finalComfyVideoUrl || previsVideoUrl;

  const currentPassLabel =
    activePassTab === 'rgb'
      ? 'RGB Viewfinder'
      : activePassTab === 'openpose'
      ? 'OpenPose Rig'
      : activePassTab === 'depth'
      ? 'Volumetric Depth'
      : activePassTab === 'comfy-final'
      ? 'Final ComfyUI Render (MP4 + Audio)'
      : 'Side-by-Side Sync (Previs vs Final)';

  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadTextFile = (content: string, filename: string, mimeType = 'application/json') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    downloadFile(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadActivePass = () => {
    if (!currentPassUrl) return;
    if ((activePassTab === 'comfy-final' || activePassTab === 'side-by-side') && finalComfyVideoUrl) {
      downloadFile(finalComfyVideoUrl, finalComfyFilename || `${shot.name.replace(/[^a-z0-9_-]/gi, '_')}_Final_Render.mp4`);
      return;
    }
    const sanitized = shot.name.replace(/[^a-z0-9_-]/gi, '_') || 'previs_shot';
    const tag = activePassTab === 'rgb' ? 'RGB' : activePassTab === 'openpose' ? 'OpenPose' : 'Depth';
    downloadFile(currentPassUrl, `${sanitized}_${tag}_${selectedResolution}.mp4`);
  };

  const handleDownloadAllPasses = () => {
    const sanitized = shot.name.replace(/[^a-z0-9_-]/gi, '_') || 'previs_shot';
    if (previsVideoUrl) {
      downloadFile(previsVideoUrl, `${sanitized}_RGB_${selectedResolution}.mp4`);
    }
    if (previsOpenPoseUrl) {
      setTimeout(() => {
        downloadFile(previsOpenPoseUrl, `${sanitized}_OpenPose_${selectedResolution}.mp4`);
      }, 300);
    }
    if (previsDepthUrl) {
      setTimeout(() => {
        downloadFile(previsDepthUrl, `${sanitized}_Depth_${selectedResolution}.mp4`);
      }, 600);
    }
  };

  const handleDownloadCameraExtrinsics = () => {
    const sanitized = shot.name.replace(/[^a-z0-9_-]/gi, '_') || 'previs_shot';
    const json = exportCameraExtrinsicsJson(shot);
    downloadTextFile(json, `${sanitized}_camera_extrinsics_c2w_w2c.json`);
  };

  const handleDownloadFullBundle = () => {
    const sanitized = shot.name.replace(/[^a-z0-9_-]/gi, '_') || 'previs_shot';
    const fullBundle = {
      exportedAt: new Date().toISOString(),
      targetEngine: activeEngineTab,
      shotSpec: shot,
      compiledPrompt: {
        ...compiledPrompt,
        positivePrompt: displayPositivePrompt,
        negativePrompt: displayNegativePrompt,
      },
      cameraExtrinsics: poseBundle,
    };
    downloadTextFile(JSON.stringify(fullBundle, null, 2), `${sanitized}_${activeEngineTab}_production_pack.json`);
  };

  const availablePassCount = [previsVideoUrl, previsOpenPoseUrl, previsDepthUrl].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-[#0a0c12] text-slate-200 overflow-y-auto custom-scrollbar font-sans">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-white/10 bg-[#0f121b] shrink-0">
        <div className="flex items-center gap-3">
          {onBackToPrevis && (
            <button
              onClick={onBackToPrevis}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors text-xs font-mono"
              title="Return to 3D Directing Stage"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Stage</span>
            </button>
          )}
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-black font-bold shadow-md shadow-amber-500/20">
            <Film className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white tracking-wide">
                Render, Prompt &amp; Export Studio
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                {shot.name} • {shot.durationSeconds}s
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Render 24fps multi-pass reference videos (RGB, OpenPose, Depth), refine prompts with AI, and export camera matrices
            </p>
          </div>
        </div>

        {/* Engine Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono">Target Engine:</span>
          <div className="flex items-center bg-black/60 rounded-lg p-0.5 border border-white/15 text-xs font-mono">
            <button
              onClick={() => handleSelectEngine('ltx-2.5')}
              className={`px-3 py-1 rounded-md transition-all font-semibold ${
                activeEngineTab === 'ltx-2.5'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="LTX-2.5 DiT Narrative Flow (8n+1 frame cadence)"
            >
              LTX-2.5
            </button>
            <button
              onClick={() => handleSelectEngine('minimax-h3')}
              className={`px-3 py-1 rounded-md transition-all font-semibold ${
                activeEngineTab === 'minimax-h3'
                  ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="MiniMax H3 / Hailuo Structured Micro-Acting Formula"
            >
              MiniMax H3
            </button>
            <button
              onClick={() => handleSelectEngine('seedance')}
              className={`px-3 py-1 rounded-md transition-all font-semibold ${
                activeEngineTab === 'seedance'
                  ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Seedance 2.0 6-Axis Coordinate Trajectory & Sensor Profile"
            >
              Seedance 2.0
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* Column 1: Reference Video Output + Temporal Beats + Camera Matrix (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#0f121b] p-5 shadow-xl flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Reference Previs Video (MP4)
                </h2>
              </div>

              {/* Multi-Pass Selector Tabs */}
              <div className="flex flex-wrap items-center bg-black/60 rounded-xl p-1 border border-white/10 gap-1 text-[11px] font-mono">
                <button
                  onClick={() => setActivePassTab('rgb')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                    activePassTab === 'rgb'
                      ? 'bg-amber-500 text-black font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Video className="h-3 w-3" />
                  <span>RGB Plate</span>
                  {previsVideoUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActivePassTab('openpose')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                    activePassTab === 'openpose'
                      ? 'bg-emerald-500 text-black font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Target className="h-3 w-3" />
                  <span>OpenPose</span>
                  {previsOpenPoseUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActivePassTab('depth')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                    activePassTab === 'depth'
                      ? 'bg-cyan-500 text-black font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="h-3 w-3" />
                  <span>Depth</span>
                  {previsDepthUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActivePassTab('comfy-final')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                    activePassTab === 'comfy-final'
                      ? 'bg-indigo-500 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Zap className="h-3 w-3" />
                  <span>Final Render</span>
                  {finalComfyVideoUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActivePassTab('side-by-side')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                    activePassTab === 'side-by-side'
                      ? 'bg-gradient-to-r from-amber-500 to-indigo-500 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Columns className="h-3 w-3" />
                  <span>Side-by-Side Sync</span>
                  {previsVideoUrl && finalComfyVideoUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
              </div>
            </div>

            {/* Video Viewport / Player */}
            <div className="relative rounded-xl overflow-hidden bg-black/80 border border-white/10 aspect-video flex items-center justify-center group">
              {activePassTab === 'side-by-side' ? (
                <div className="w-full h-full grid grid-cols-2 gap-1 bg-black p-1">
                  {/* Left: 3D RGB Previs */}
                  <div className="relative rounded-lg overflow-hidden bg-[#080a0f] border border-amber-500/30 flex items-center justify-center">
                    {previsVideoUrl ? (
                      <video
                        ref={syncLeftVideoRef}
                        key={previsVideoUrl}
                        src={previsVideoUrl}
                        controls
                        loop
                        autoPlay
                        muted
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-4 text-[11px] font-mono text-slate-400">
                        Click <strong>&quot;Render Previs Video&quot;</strong> below to populate left 3D Previs plate.
                      </div>
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-amber-500/40 text-[9px] font-mono text-amber-300 font-bold">
                      1. 3D RGB PREVIS (&lt;Video 1&gt;)
                    </div>
                  </div>
                  {/* Right: Final ComfyUI Render */}
                  <div className="relative rounded-lg overflow-hidden bg-[#080a0f] border border-indigo-500/40 flex items-center justify-center">
                    {finalComfyVideoUrl ? (
                      <video
                        ref={syncRightVideoRef}
                        key={finalComfyVideoUrl}
                        src={finalComfyVideoUrl}
                        controls
                        loop
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-4 text-[11px] font-mono text-slate-400">
                        Click <strong>&quot;Render in ComfyUI&quot;</strong> or <strong>&quot;Load Latest ComfyUI Render&quot;</strong> below.
                      </div>
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-indigo-500/40 text-[9px] font-mono text-indigo-300 font-bold">
                      2. MINIMAX H3 FINAL RENDER ({finalComfyFilename || 'ComfyUI'})
                    </div>
                  </div>
                  {previsVideoUrl && finalComfyVideoUrl && (
                    <button
                      onClick={handleSyncRestartBoth}
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold shadow-lg border border-white/20 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Sync Restart Both Videos (0.0s)</span>
                    </button>
                  )}
                </div>
              ) : currentPassUrl ? (
                <video
                  key={currentPassUrl}
                  src={currentPassUrl}
                  controls
                  loop
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : isRenderingPrevis ? (
                <div className="flex flex-col items-center gap-3 p-6 text-center">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-amber-300">
                      {Math.round(previsProgress)}%
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white tracking-wide">
                      Rendering 3D Previs ({renderPassMode.toUpperCase()})...
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Encoding frame canvases at 24fps via WebCodecs MP4 muxer
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 p-6 text-center text-slate-400">
                  <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400">
                    <Film className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">
                      {currentPassLabel} Not Rendered Yet
                    </h3>
                    <p className="text-[10px] text-slate-400 max-w-sm mt-0.5">
                      Select your desired render pass mode below and click <strong>&quot;Render Previs Video&quot;</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Resolution & Active Pass Badge */}
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur-md border border-white/15 text-[9px] font-mono text-slate-300 flex items-center gap-1.5">
                <span className="font-bold text-amber-400">{currentPassLabel.toUpperCase()}</span>
                <span>•</span>
                <span>{selectedResolution}</span>
                <span>•</span>
                <span>{shot.aspectRatio}</span>
              </div>
            </div>

            {/* Render & Download Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              {/* Pass Mode & Resolution Controls */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-slate-400">Pass:</span>
                  <select
                    value={renderPassMode}
                    onChange={(e) => setRenderPassMode(e.target.value as any)}
                    className="bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-amber-400"
                  >
                    <option value="all">All Passes (RGB + Pose + Depth)</option>
                    <option value="rgb">RGB Viewfinder Only</option>
                    <option value="openpose">OpenPose Rig Only</option>
                    <option value="depth">Volumetric Depth Only</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedResolution('720p')}
                    className={`px-2 py-1 rounded text-[11px] font-mono font-semibold transition-all ${
                      selectedResolution === '720p'
                        ? 'bg-white/15 text-white border border-white/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    720p
                  </button>
                  <button
                    onClick={() => setSelectedResolution('1080p')}
                    className={`px-2 py-1 rounded text-[11px] font-mono font-semibold transition-all ${
                      selectedResolution === '1080p'
                        ? 'bg-white/15 text-white border border-white/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    1080p
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => renderPrevisVideo(renderPassMode)}
                  disabled={isRenderingPrevis}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isRenderingPrevis ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                      <span>Rendering ({Math.round(previsProgress)}%)...</span>
                    </>
                  ) : currentPassUrl ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Re-Render</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Render Previs Video</span>
                    </>
                  )}
                </button>

                {currentPassUrl && (
                  <button
                    onClick={handleDownloadActivePass}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                    title={`Download ${currentPassLabel} MP4`}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>
                      Download{' '}
                      {activePassTab === 'rgb'
                        ? 'RGB'
                        : activePassTab === 'openpose'
                        ? 'Pose'
                        : activePassTab === 'depth'
                        ? 'Depth'
                        : 'Final Render'}{' '}
                      MP4
                    </span>
                  </button>
                )}

                {availablePassCount > 1 && (
                  <button
                    onClick={handleDownloadAllPasses}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 border border-white/15 font-mono text-xs font-semibold transition-all cursor-pointer"
                    title="Download all generated MP4 passes sequentially"
                  >
                    <Download className="h-3.5 w-3.5 text-amber-400" />
                    <span>All ({availablePassCount})</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Live ComfyUI MiniMax H3 Reference-to-Video Bridge Card */}
          <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-[#101424] via-[#0f121b] to-[#141126] p-5 shadow-xl flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-white tracking-wide uppercase">
                      Live ComfyUI MiniMax H3 Bridge (Ref2VA Workflow)
                    </h3>
                    <button
                      type="button"
                      onClick={() => probeComfyHealth()}
                      title="Click to test & reconnect to ComfyUI at 127.0.0.1:8188"
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border transition-all cursor-pointer ${
                        comfyOnline
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                      }`}
                    >
                      {comfyOnline ? `ONLINE • ${comfyGpuLabel}` : comfyGpuLabel}
                    </button>
                  </div>
                  <p className="text-[10px] font-mono text-slate-400">
                    Template: <span className="text-indigo-300 font-semibold">minimax_h3_ref2va</span> (SolAttn + 8-Step Turbo LoRA @ 0.7 • Node 638 Previs Video + 4 Ref Images → Node 145 60fps MP4+Audio)
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="./workflows/Stubelius_Ultimate_H3.json"
                  download="Stubelius_Ultimate_H3.json"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-amber-200 border border-amber-400/30 font-mono text-[11px] font-semibold transition-all cursor-pointer"
                  title="Download the Stubelius Ultimate H3 (stuubszzz) ComfyUI workflow (.json) to drag-and-drop into ComfyUI"
                >
                  <Download className="h-3.5 w-3.5 text-amber-400" />
                  <span>Download Stubelius H3 Workflow (.json)</span>
                </a>
                <button
                  type="button"
                  onClick={handleLoadLatestComfyRender}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-indigo-200 border border-indigo-400/30 font-mono text-[11px] font-semibold transition-all cursor-pointer"
                  title="Load the most recent completed render from ComfyUI /history into the player"
                >
                  <Columns className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Load Latest Render</span>
                </button>
                <button
                  type="button"
                  onClick={handleRenderInComfyUI}
                  disabled={isSubmittingComfy || activeJob?.status === 'executing'}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 disabled:opacity-50 transition-all cursor-pointer"
                  title="Auto-upload 3D RGB Previs MP4 + 4 Reference Images and execute MiniMax H3 Ref2VA in ComfyUI"
                >
                  {isSubmittingComfy || activeJob?.status === 'executing' ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Executing in ComfyUI...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5 fill-current" />
                      <span>Render in ComfyUI (MiniMax H3)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Workflow Setup & Required Models Guide */}
            <details className="rounded-xl bg-black/40 border border-white/10 px-3.5 py-2 text-[10px] font-mono text-slate-300">
              <summary className="cursor-pointer font-semibold text-indigo-300 hover:text-indigo-200 select-none">
                📦 First time rendering? Click here for Stubelius Ultimate H3 (stuubszzz) Workflow &amp; Model Setup
              </summary>
              <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5 text-slate-300 leading-relaxed">
                <div>
                  <span className="text-amber-300 font-bold">1. Install Stubelius Ultimate H3 Custom Node &amp; Workflow:</span> Install{' '}
                  <a
                    href="https://github.com/stuubszzz/Stubelius-Ultimate-H3"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-300 underline hover:text-indigo-200 font-semibold"
                  >
                    stuubszzz/Stubelius-Ultimate-H3
                  </a>{' '}
                  via ComfyUI Manager (or clone into <code className="text-slate-200">ComfyUI/custom_nodes/</code>), then click{' '}
                  <span className="text-amber-200 font-semibold">Download Stubelius H3 Workflow (.json)</span> above and drag &amp; drop it into ComfyUI (<code className="text-indigo-300">http://127.0.0.1:8188</code>).
                </div>
                <div>
                  <span className="text-emerald-300 font-bold">2. Download Required MiniMax H3 Model Weights</span> from{' '}
                  <a
                    href="https://huggingface.co/Comfy-Org/MiniMax-H3"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-300 underline hover:text-indigo-200"
                  >
                    huggingface.co/Comfy-Org/MiniMax-H3
                  </a>{' '}
                  into your <code className="text-white">ComfyUI/models/</code> directory:
                  <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-400">
                    <li>
                      <code className="text-slate-200">models/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors</code> (Ref2VA Model)
                    </li>
                    <li>
                      <code className="text-slate-200">models/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors</code> (FL2VA Model)
                    </li>
                    <li>
                      <code className="text-slate-200">models/text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors</code> (Text Encoder)
                    </li>
                    <li>
                      <code className="text-slate-200">models/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors</code> (8-Step Speedup LoRA)
                    </li>
                    <li>
                      <code className="text-slate-200">models/vae/minimax_h3_video_vae_fp16.safetensors</code> &amp;{' '}
                      <code className="text-slate-200">minimax_h3_audio_vae_fp32.safetensors</code>
                    </li>
                  </ul>
                </div>
              </div>
            </details>

            {/* 4 Required Reference Image Slots (<picture 1> to <picture 4> -> Nodes 137, 139, 144, 151) + Seed */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-1">
              {[0, 1, 2, 3].map((idx) => {
                const nodeIds = ['137', '139', '144', '151'];
                const targetVal = refSlotTargets[idx];
                const mappedActor =
                  targetVal && targetVal !== 'environment' && targetVal !== 'custom'
                    ? shot.actors.find((a) => a.id === targetVal)
                    : undefined;
                const displayObjectTitle =
                  targetVal === 'environment'
                    ? `🌍 Set: ${shot.environment?.name || 'Alley / Studio Set'}`
                    : mappedActor
                    ? `${mappedActor.kind === 'human' || mappedActor.kind === 'character' ? '👤 Character' : `📦 ${mappedActor.kind || 'Object'}`}: ${mappedActor.name}`
                    : `🖼️ Custom Reference ${idx + 1}`;
                const thumbUrl =
                  refImageThumbs[idx] ||
                  (comfyOnline && refImageNames[idx]?.trim()
                    ? defaultComfyClient.getViewUrl(refImageNames[idx].trim(), '', 'input')
                    : null);

                return (
                  <div
                    key={idx}
                    className="rounded-xl bg-black/60 border border-white/15 p-2.5 flex flex-col gap-1.5"
                  >
                    {/* Prominent Object / Character Title + Slot Badge */}
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="text-[10.5px] font-bold text-white truncate"
                        title={displayObjectTitle}
                      >
                        {displayObjectTitle}
                      </span>
                      <span className="text-[8.5px] font-mono text-indigo-300 bg-indigo-500/15 border border-indigo-400/30 px-1.5 py-0.2 rounded shrink-0">
                        &lt;pic {idx + 1}&gt; #{nodeIds[idx]}
                      </span>
                    </div>

                    {/* Dropdown to pick which Stage Object / Character / Set maps to this <picture 1..4> slot */}
                    <select
                      value={targetVal}
                      onChange={(e) => {
                        const newTarget = e.target.value;
                        const nextTargets = [...refSlotTargets] as [string, string, string, string];
                        nextTargets[idx] = newTarget;
                        setRefSlotTargets(nextTargets);

                        if (newTarget === 'environment') {
                          if (shot.environment?.conceptImageUrl) {
                            const nextThumbs = [...refImageThumbs] as [string | null, string | null, string | null, string | null];
                            nextThumbs[idx] = shot.environment.conceptImageUrl;
                            setRefImageThumbs(nextThumbs);
                          }
                          if (shot.environment?.conceptImageName) {
                            const nextNames = [...refImageNames] as [string, string, string, string];
                            nextNames[idx] = shot.environment.conceptImageName;
                            setRefImageNames(nextNames);
                          }
                        } else if (newTarget !== 'custom') {
                          const found = shot.actors.find((a) => a.id === newTarget);
                          if (found?.conceptImageUrl) {
                            const nextThumbs = [...refImageThumbs] as [string | null, string | null, string | null, string | null];
                            nextThumbs[idx] = found.conceptImageUrl;
                            setRefImageThumbs(nextThumbs);
                          }
                          if (found?.conceptImageName) {
                            const nextNames = [...refImageNames] as [string, string, string, string];
                            nextNames[idx] = found.conceptImageName;
                            setRefImageNames(nextNames);
                          }
                        }
                      }}
                      className="w-full bg-[#0d1220] border border-white/15 rounded px-1.5 py-1 text-[9.5px] font-mono text-indigo-200 focus:outline-none focus:border-indigo-400"
                      title={`Select which Stage Object or Set maps to <picture ${idx + 1}>`}
                    >
                      {shot.actors.map((act) => (
                        <option key={act.id} value={act.id}>
                          {act.kind === 'human' || act.kind === 'character' ? '👤 ' : '📦 '}
                          {act.name} ({act.kind || 'human'})
                          {act.conceptImageUrl ? ' ✓ Ref' : ''}
                        </option>
                      ))}
                      <option value="environment">
                        🌍 Set: {shot.environment?.name || 'Active Environment'}
                        {shot.environment?.conceptImageUrl ? ' ✓ Ref' : ''}
                      </option>
                      <option value="custom">🖼️ Custom / ComfyUI Input File</option>
                    </select>

                    {/* Thumbnail Preview + Filename + Upload Button */}
                    <div className="flex items-center gap-2 pt-0.5">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={displayObjectTitle}
                          className="h-10 w-10 rounded-lg object-cover border border-emerald-400/50 shrink-0 bg-black"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-white/5 border border-dashed border-white/15 flex items-center justify-center text-[8.5px] font-mono text-slate-400 shrink-0">
                          NO THUMB
                        </div>
                      )}

                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={refImageNames[idx]}
                            onChange={(e) => {
                              const next = [...refImageNames] as [string, string, string, string];
                              next[idx] = e.target.value;
                              setRefImageNames(next);
                            }}
                            placeholder={`char${idx + 1}.png`}
                            className="w-full bg-black/70 border border-white/15 rounded px-1.5 py-1 text-[10px] font-mono text-slate-200 focus:outline-none focus:border-indigo-400"
                          />
                          <label
                            className="px-2 py-1 rounded bg-indigo-500/25 hover:bg-indigo-500/40 border border-indigo-400/40 text-indigo-200 cursor-pointer shrink-0 flex items-center gap-1 text-[9.5px] font-mono"
                            title={`Upload reference image for ${displayObjectTitle} (syncs back to Directing Stage)`}
                          >
                            <Upload className="h-3 w-3" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                if (!f) return;
                                const nextFiles = [...refImageFiles] as [File | null, File | null, File | null, File | null];
                                nextFiles[idx] = f;
                                setRefImageFiles(nextFiles);

                                const nextNames = [...refImageNames] as [string, string, string, string];
                                nextNames[idx] = f.name;
                                setRefImageNames(nextNames);

                                const reader = new FileReader();
                                reader.onload = () => {
                                  if (typeof reader.result === 'string') {
                                    const dataUrl = reader.result;
                                    const nextThumbs = [...refImageThumbs] as [string | null, string | null, string | null, string | null];
                                    nextThumbs[idx] = dataUrl;
                                    setRefImageThumbs(nextThumbs);

                                    // Sync back to the mapped Stage Object or Environment so Directing Stage also has it!
                                    if (targetVal === 'environment' && shot.environment) {
                                      setEnvironment({
                                        ...shot.environment,
                                        conceptImageUrl: dataUrl,
                                        conceptImageName: f.name,
                                      });
                                    } else if (targetVal && targetVal !== 'custom') {
                                      updateActor(targetVal, {
                                        conceptImageUrl: dataUrl,
                                        conceptImageName: f.name,
                                      });
                                    }
                                  }
                                };
                                reader.readAsDataURL(f);
                              }}
                            />
                          </label>
                        </div>
                        <span className="text-[8.5px] font-mono text-slate-400 truncate">
                          {thumbUrl ? '✓ Synced from Directing Stage' : `ComfyUI input/${refImageNames[idx]}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Seed Control (Node 142) */}
              <div className="rounded-xl bg-black/50 border border-white/10 p-2 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[9px] font-mono">
                  <span className="text-amber-300 font-bold">SEED (Node 142)</span>
                  <button
                    type="button"
                    onClick={() => setComfySeed(Math.floor(Math.random() * 900000000000000) + 100000000000000)}
                    className="text-indigo-300 hover:text-white underline"
                  >
                    Random
                  </button>
                </div>
                <input
                  type="number"
                  value={comfySeed}
                  onChange={(e) => setComfySeed(Number(e.target.value) || 0)}
                  className="w-full bg-black/70 border border-white/15 rounded px-1.5 py-1 text-[10px] font-mono text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Live Progress / Status / Output Banner */}
            {(comfyStatusText || comfyErrorText || finalComfyFilename) && (
              <div
                className={`rounded-xl border px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono ${
                  comfyErrorText
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {comfyErrorText ? (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span>
                    {comfyErrorText ||
                      comfyStatusText ||
                      `Latest ComfyUI Render Ready: ${finalComfyFilename} (${finalComfyMeta})`}
                  </span>
                </div>
                {finalComfyVideoUrl && (
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-black/50 text-slate-300 text-[9.5px] font-mono border border-white/10">
                      📁 D:\ComfyUI\output\{finalComfyFilename}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActivePassTab('side-by-side')}
                      className="px-2 py-0.5 rounded bg-indigo-500/30 hover:bg-indigo-500/50 text-white text-[10px] font-bold border border-indigo-400/40 cursor-pointer"
                    >
                      View Side-by-Side
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadFile(finalComfyVideoUrl, finalComfyFilename || 'minimax_h3_output.mp4')}
                      className="px-2 py-0.5 rounded bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 text-[10px] font-bold border border-emerald-400/40 cursor-pointer"
                    >
                      Download Final MP4
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stage Temporal Beats & Timeline Choreography */}
          {temporalBeats.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#0f121b] p-4 flex flex-col gap-2">
              <button
                onClick={() => setShowTimelineDetails(!showTimelineDetails)}
                className="flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-400" />
                  <span className="font-display font-bold text-xs text-slate-200 group-hover:text-white transition-colors uppercase tracking-wider">
                    Stage Timeline &amp; Choreography Beats ({shot.durationSeconds}s Duration)
                  </span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 font-mono text-[10px]">
                  <span>{showTimelineDetails ? 'Hide Beats' : 'Show Beats'}</span>
                  {showTimelineDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
              </button>

              {showTimelineDetails && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-1 pt-2.5 border-t border-white/10">
                  {temporalBeats.map((beat, idx) => (
                    <div key={idx} className="rounded-xl bg-black/40 border border-white/5 p-3 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {beat.timeRange}
                        </span>
                        <span className="font-mono text-[9px] text-slate-500">
                          Beat {idx === 0 ? 'I (Open)' : idx === 1 ? 'II (Progression)' : 'III (Resolve)'}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-300 leading-snug">
                        <span className="text-blue-400 font-semibold">Camera: </span>
                        {beat.cameraAction}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 leading-snug">
                        <span className="text-emerald-400 font-semibold">Stage &amp; Actors: </span>
                        {beat.actorAction}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Camera Trajectory, Intrinsics & Extrinsics Card */}
          <div className="rounded-2xl border border-white/10 bg-[#0f121b] p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-white tracking-wide uppercase">
                  Camera Trajectory &amp; 4×4 Extrinsics ({poseBundle.frameCount} Frames @ {poseBundle.fps}fps)
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(exportCameraExtrinsicsJson(shot));
                    setCopiedMatrix(true);
                    setTimeout(() => setCopiedMatrix(false), 2000);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 font-mono text-[10px] transition-all"
                  title="Copy 4x4 Camera-to-World (c2w) and World-to-Camera (w2c) matrices as JSON"
                >
                  {copiedMatrix ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-cyan-400" />}
                  <span>{copiedMatrix ? 'Copied Matrices!' : 'Copy c2w/w2c JSON'}</span>
                </button>
                <button
                  onClick={handleDownloadCameraExtrinsics}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] font-semibold transition-all"
                  title="Download 4x4 Camera Pose Matrices for ComfyUI CameraCtrl / LTXVConditioning"
                >
                  <Download className="h-3 w-3" />
                  <span>Camera Matrix (.json)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono">
              <div className="rounded-lg bg-black/40 border border-white/5 p-2">
                <span className="text-slate-500 text-[9px] block">LENS / FOV</span>
                <span className="font-bold text-slate-200">
                  {shot.camera.lens.focalLength} ({poseBundle.intrinsics.fovDegrees}°)
                </span>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/5 p-2">
                <span className="text-slate-500 text-[9px] block">MOVE TYPE</span>
                <span className="font-bold text-slate-200 truncate block">{shot.camera.movement.type.toUpperCase()}</span>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/5 p-2">
                <span className="text-slate-500 text-[9px] block">ASPECT / RES</span>
                <span className="font-bold text-slate-200">
                  {shot.aspectRatio} ({poseBundle.intrinsics.width}×{poseBundle.intrinsics.height})
                </span>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/5 p-2">
                <span className="text-slate-500 text-[9px] block">KEYFRAMES</span>
                <span className="font-bold text-slate-200">
                  {shot.camera.movement.keyframes?.length || 2} pts
                </span>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/5 p-2">
                <span className="text-slate-500 text-[9px] block">CADENCE</span>
                <span className="font-bold text-emerald-300">
                  {poseBundle.frameCount}f ({shot.durationSeconds}s)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: AI Prompt Director, Engine-Optimized Prompts & Production Pack (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#0f121b] p-5 shadow-xl flex flex-col gap-4 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-indigo-400" />
                <div>
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    {activeEngineTab === 'ltx-2.5'
                      ? 'LTX-2.5 Directorial Prompt'
                      : activeEngineTab === 'minimax-h3'
                      ? 'MiniMax H3 Motion Prompt'
                      : 'Seedance 2.0 Cinematic Prompt'}
                  </h2>
                  <span className="text-[10px] font-mono text-slate-400">
                    {activeEngineTab === 'seedance'
                      ? '6-Axis Coordinate Trajectory, Aerodynamic Physics & Sensor Profile'
                      : activeEngineTab === 'minimax-h3'
                      ? 'Structured Micro-Acting & Optical Photorealism Formula'
                      : 'Present-Tense Continuous Action & DiT Temporal Pacing'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleCopyPrompt(displayPositivePrompt)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 font-mono text-xs font-semibold border border-blue-500/40 transition-all cursor-pointer shrink-0"
                title="Copy positive prompt to clipboard"
              >
                {copiedPrompt ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedPrompt ? 'Copied!' : 'Copy Prompt'}</span>
              </button>
            </div>

            {/* AI Directing & Polish Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-gradient-to-r from-blue-950/40 via-indigo-950/20 to-purple-950/40 border border-blue-500/20">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-400" />
                <span className="font-display font-semibold text-xs text-slate-200">AI Prompt Reasoner:</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {getReasonerConfig().provider.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleResetToDeterministicPrompt}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-[10px] transition-colors border border-white/10"
                  title="Reset to deterministic compiler output without AI rewrites"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Standard</span>
                </button>
                <button
                  onClick={handleDirectWithAi}
                  disabled={isDirectingPrompt}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-display font-semibold text-[11px] transition-all shadow-md disabled:opacity-50"
                >
                  {isDirectingPrompt ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wand2 className="h-3 w-3" />
                  )}
                  <span>{isDirectingPrompt ? 'Directing...' : 'Direct & Polish with AI'}</span>
                </button>
              </div>
            </div>

            {/* AI Director Feedback notification */}
            {aiDirectorFeedback && (
              <div
                className={`p-2.5 rounded-lg border font-mono text-[11px] leading-relaxed flex items-start gap-2 ${
                  aiDirectorFeedback.toLowerCase().includes('fail') || aiDirectorFeedback.toLowerCase().includes('error')
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div className="flex-1">{aiDirectorFeedback}</div>
              </div>
            )}

            {/* Scene Object Color Target Map (For Color-Guided Targeting & Masking) */}
            {shot.actors.length > 0 && (
              <div className="rounded-xl bg-black/50 border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider">
                    🎨 Scene Object Target Colors ({shot.actors.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const colorLines = shot.actors
                        .map((a, i) => {
                          const hex = (a.color || ['#ef4444', '#3b82f6', '#10b981', '#eab308', '#a855f7', '#06b6d4'][i % 6]).toUpperCase();
                          return `[${hex} = ${a.name} (${a.token || a.kind || 'subject'})]`;
                        })
                        .join(', ');
                      const appended = `${displayPositivePrompt}\n\nColor Target Map: ${colorLines}.`;
                      setCompiledPrompt({
                        ...(compiledPrompt || deterministicPrompt),
                        positivePrompt: appended,
                      });
                    }}
                    className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/40 text-amber-200 font-mono text-[9px] font-semibold transition-colors"
                    title="Append Object Color Target Map to Positive Prompt"
                  >
                    + Inject Color Map into Prompt
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {shot.actors.map((act, idx) => {
                    const hex = act.color || ['#ef4444', '#3b82f6', '#10b981', '#eab308', '#a855f7', '#06b6d4'][idx % 6];
                    return (
                      <div
                        key={act.id}
                        className="flex items-center gap-1.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 font-mono text-[9px] text-slate-200"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-white/40 shrink-0"
                          style={{ backgroundColor: hex }}
                        />
                        <span className="font-bold text-white">{act.name}</span>
                        <span className="text-slate-400 uppercase">{hex}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Positive Prompt Card */}
            <div className="space-y-1.5 flex-1 flex flex-col">
              <label className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Positive Prompt (Camera + Motion + Lighting)
              </label>
              <div className="flex-1 min-h-[140px] rounded-xl bg-black/60 border border-white/15 p-3 text-xs font-mono text-slate-200 leading-relaxed overflow-y-auto custom-scrollbar select-all">
                {displayPositivePrompt}
              </div>
            </div>

            {/* Editable Negative Prompt Card */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-rose-300/90 uppercase tracking-wider font-semibold">
                  Negative Prompt (Editable Exclusions)
                </label>
                <button
                  onClick={() => handleCopyPrompt(displayNegativePrompt, true)}
                  className="text-[10px] font-mono text-slate-400 hover:text-white flex items-center gap-1"
                >
                  {copiedNegative ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedNegative ? 'Copied' : 'Copy Negative'}</span>
                </button>
              </div>
              <textarea
                rows={2}
                value={displayNegativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="blurry, distorted anatomy, extra limbs, camera jitter, morphing, watermark..."
                className="w-full rounded-xl bg-black/60 border border-white/10 p-2.5 text-[11px] font-mono text-slate-300 leading-normal focus:outline-none focus:border-rose-500/50 resize-none"
              />
            </div>

            {/* Full Production Pack & JSON Bundle Footer */}
            <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() => {
                  const fullBundle = {
                    targetEngine: activeEngineTab,
                    shotSpec: shot,
                    compiledPrompt: {
                      ...compiledPrompt,
                      positivePrompt: displayPositivePrompt,
                      negativePrompt: displayNegativePrompt,
                    },
                    cameraExtrinsics: poseBundle,
                  };
                  navigator.clipboard.writeText(JSON.stringify(fullBundle, null, 2));
                  setCopiedJson(true);
                  setTimeout(() => setCopiedJson(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-mono text-xs border border-white/10 transition-all"
              >
                {copiedJson ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Code2 className="h-3.5 w-3.5 text-indigo-400" />}
                <span>{copiedJson ? 'Copied JSON Bundle!' : 'Copy Full JSON Bundle'}</span>
              </button>

              <button
                onClick={handleDownloadFullBundle}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 font-mono text-xs font-semibold transition-all"
                title="Download complete ShotSpec + Compiled Prompt + Camera Extrinsics JSON package"
              >
                <Download className="h-3.5 w-3.5 text-indigo-300" />
                <span>Download Shot Pack (.json)</span>
              </button>
            </div>

            {/* Export Instructions / Workflow Guide */}
            <div className="rounded-xl bg-indigo-950/30 border border-indigo-500/20 p-3 space-y-1 text-[11px] font-mono text-indigo-200">
              <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                <span>How to Use with Video Diffusion Models</span>
              </div>
              <p className="text-[10px] text-slate-300 leading-relaxed">
                1. Click <strong>&quot;Render Previs Video&quot;</strong> &amp; download the MP4 passes (RGB, OpenPose, Depth).
                <br />
                2. Click <strong>&quot;Direct &amp; Polish with AI&quot;</strong> or <strong>&quot;Copy Prompt&quot;</strong> for your target model.
                <br />
                3. Feed the MP4 + Camera Matrix JSON into your ComfyUI LTX-2.5, ControlNet, or Video-to-Video workflow.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
