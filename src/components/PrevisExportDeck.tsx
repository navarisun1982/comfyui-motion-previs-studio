import React, { useState, useEffect } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { getAdapter } from '../adapters';
import { getReasonerConfig } from '../services/objectReasoner';
import { directPromptWithAI } from '../services/aiPromptDirector';
import { exportCameraPoseBundle, exportCameraExtrinsicsJson } from '../engine/cameraMatrixExport';
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
  } = useShotStore();

  const [activeEngineTab, setActiveEngineTab] = useState<'ltx-2.5' | 'minimax-h3' | 'seedance'>(
    shot.targetModel === 'minimax-h3' ? 'minimax-h3' : shot.targetModel === 'seedance' ? 'seedance' : 'ltx-2.5'
  );
  const [activePassTab, setActivePassTab] = useState<'rgb' | 'openpose' | 'depth'>('rgb');
  const [renderPassMode, setRenderPassMode] = useState<'all' | 'rgb' | 'openpose' | 'depth'>('all');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedNegative, setCopiedNegative] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedMatrix, setCopiedMatrix] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<'720p' | '1080p'>('720p');
  const [isDirectingPrompt, setIsDirectingPrompt] = useState(false);
  const [aiDirectorFeedback, setAiDirectorFeedback] = useState<string | null>(null);
  const [showTimelineDetails, setShowTimelineDetails] = useState(true);

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
  const displayPositivePrompt = compiledPrompt?.positivePrompt || deterministicPrompt.positivePrompt;
  const displayNegativePrompt = shot.negativePrompt ?? compiledPrompt?.negativePrompt ?? deterministicPrompt.negativePrompt ?? '';
  const temporalBeats = compiledPrompt?.temporalBeats || deterministicPrompt.temporalBeats || [];
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
      : previsDepthUrl;

  const currentPassLabel =
    activePassTab === 'rgb'
      ? 'RGB Viewfinder'
      : activePassTab === 'openpose'
      ? 'OpenPose Rig'
      : 'Volumetric Depth';

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
              <div className="flex items-center bg-black/60 rounded-xl p-1 border border-white/10 gap-1 text-[11px] font-mono">
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
              </div>
            </div>

            {/* Video Viewport / Player */}
            <div className="relative rounded-xl overflow-hidden bg-black/80 border border-white/10 aspect-video flex items-center justify-center group">
              {currentPassUrl ? (
                <video
                  key={currentPassUrl}
                  src={currentPassUrl}
                  controls
                  loop
                  autoPlay
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
                    <span>Download {activePassTab === 'rgb' ? 'RGB' : activePassTab === 'openpose' ? 'Pose' : 'Depth'} MP4</span>
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
