import React, { useState, useRef } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { VfxReferenceMode } from '../types/shotspec';
import {
  analyzeVideoPlate,
  VfxAnalysisResult,
  renderPassVideo,
  downloadBlob,
  exportTrackingData,
} from '../engine/vfxAnalyzer';
import { logger } from '../stores/useLogStore';
import {
  Video,
  Layers,
  Sparkles,
  Sliders,
  RotateCcw,
  UploadCloud,
  Compass,
  CheckCircle2,
  Users,
  Download,
  FileText,
  LayoutGrid,
} from 'lucide-react';

type PreviewTab = 'plate' | 'depth' | 'edge' | 'camera' | 'quad';

const REFERENCE_MODES: {
  id: VfxReferenceMode;
  name: string;
  badge: string;
  description: string;
}[] = [
  {
    id: 'actor-motion',
    name: 'Actor Performance',
    badge: 'Choreography',
    description: 'Preserves the actor’s physical choreography and stunts; re-skins the character into the new scene.',
  },
  {
    id: 'camera-only',
    name: 'Camera Only',
    badge: 'Camera Solve',
    description: 'Preserves the exact camera flight path, pan, tilt, and zoom; generates entirely new subjects and environment.',
  },
  {
    id: 'full-scene',
    name: 'Full Scene VFX',
    badge: 'Re-Lighting',
    description: 'Preserves the entire spatial depth rhythm and actor blocking; transforms lighting, textures, and style.',
  },
  {
    id: 'object-motion',
    name: 'Object Motion',
    badge: 'Tracking',
    description: 'Tracks vehicles or moving props; preserves their velocity vector while modifying appearance.',
  },
];

export const VFXVideoDeck: React.FC = () => {
  const { shot, updateVfxReference, setCameraMovement, setCameraPositions, setActors, previsVideoUrl } = useShotStore();
  const vfx = shot.vfxReference;

  const [activeTab, setActiveTab] = useState<PreviewTab>('plate');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ percent: number; status: string }>({
    percent: 0,
    status: '',
  });
  const [analysisResult, setAnalysisResult] = useState<VfxAnalysisResult | null>(null);

  // Export states
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Release a plate URL only if this deck owns it. The rendered previs blob
   * belongs to the shot store (and is shared with the Stage), so revoking it
   * here would break the previs video everywhere else in the app.
   */
  const releaseOwnedPlateUrl = (url: string | undefined) => {
    if (url && url.startsWith('blob:') && url !== previsVideoUrl) {
      URL.revokeObjectURL(url);
    }
  };

  const handleLoadPrevisVideo = () => {
    if (!previsVideoUrl) return;
    releaseOwnedPlateUrl(vfx?.videoUrl);
    updateVfxReference({
      videoUrl: previsVideoUrl,
      fileName: `${shot.name.replace(/\s+/g, '_')}_3D_Previs`,
      enabled: true,
      referenceMode: 'full-scene',
      depthGuidanceWeight: 0.8,
      edgeFidelity: 0.6,
      motionRetention: 0.8,
    });
    setAnalysisResult(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;

    releaseOwnedPlateUrl(vfx?.videoUrl);
    const url = URL.createObjectURL(file);
    updateVfxReference({
      videoUrl: url,
      fileName: file.name,
      enabled: true,
      referenceMode: vfx?.referenceMode || 'actor-motion',
      depthGuidanceWeight: vfx?.depthGuidanceWeight ?? 0.7,
      edgeFidelity: vfx?.edgeFidelity ?? 0.5,
      motionRetention: vfx?.motionRetention ?? 0.65,
    });
    setAnalysisResult(null);
  };

  const runAnalysis = async () => {
    if (!vfx?.videoUrl) return;
    setIsAnalyzing(true);
    setAnalysisProgress({ percent: 5, status: 'Loading video element...' });

    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.src = vfx.videoUrl;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video plate for analysis.'));
      });

      const result = await analyzeVideoPlate(video, (percent, status) => {
        setAnalysisProgress({ percent, status });
      });

      setAnalysisResult(result);
      updateVfxReference({
        depthPreviewUrl: result.depthThumbnailUrl,
        edgePreviewUrl: result.edgeThumbnailUrl,
        solvedCameraMove: result.detectedCameraMovement,
      });

      // Automatically apply detected camera movement & positions to 3D Soundstage!
      setCameraMovement(result.detectedCameraMovement, result.detectedSpeed);
      setCameraPositions(result.suggestedStartPos, result.suggestedEndPos);

      // Automatically populate exact detected characters onto the 3D Stage!
      if (result.detectedActors && result.detectedActors.length > 0) {
        setActors(result.detectedActors);
      }

      // Default to 4-Way Quad View for instant complete oversight
      setActiveTab('quad');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      logger.error(`VFX Video Analysis Error: ${msg}`);
      setErrorMessage(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportPass = async (passType: 'depth' | 'edge') => {
    if (!vfx?.videoUrl) return;
    setIsExporting(true);
    setExportProgress(`Initializing ${passType === 'depth' ? 'Depth' : 'Canny'} video renderer...`);

    try {
      const tempVideo = document.createElement('video');
      tempVideo.crossOrigin = 'anonymous';
      tempVideo.src = vfx.videoUrl;

      await new Promise<void>((resolve, reject) => {
        tempVideo.onloadedmetadata = () => resolve();
        tempVideo.onerror = () => reject(new Error('Failed to load video plate for pass export'));
      });

      const blob = await renderPassVideo(tempVideo, passType, (percent) => {
        setExportProgress(`Rendering ${passType === 'depth' ? 'Depth' : 'Canny Edge'} video: ${percent}%`);
      });

      const baseName = vfx.fileName?.replace(/\.[^/.]+$/, '') || 'vfx_plate';
      downloadBlob(blob, `${baseName}_${passType}_pass.webm`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      logger.error(`Export Pass Error: ${msg}`);
      setErrorMessage(msg);
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  const handleExportJson = () => {
    if (!analysisResult) return;
    const baseName = vfx?.fileName?.replace(/\.[^/.]+$/, '') || 'vfx_plate';
    exportTrackingData(analysisResult, `${baseName}_camera_and_tracking.json`);
  };

  const clearPlate = () => {
    releaseOwnedPlateUrl(vfx?.videoUrl);
    updateVfxReference({
      videoUrl: undefined,
      fileName: undefined,
      enabled: false,
      depthPreviewUrl: undefined,
      edgePreviewUrl: undefined,
      solvedCameraMove: undefined,
    });
    setAnalysisResult(null);
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-slate-200">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Header */}
      {errorMessage && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-mono">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-rose-500/20"
            title="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-director-border pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-director-cyan/20 border border-director-cyan/40 text-director-cyan">
            <Video className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
              VFX Video-to-Video Plate
            </h3>
            <p className="font-mono text-[10px] text-slate-400">
              Depth Guidance &amp; Automated Motion Ingestion
            </p>
          </div>
        </div>

        {vfx?.enabled && (
          <button
            onClick={clearPlate}
            className="flex items-center gap-1 rounded px-2 py-0.5 glass-control text-[10px] text-slate-400 hover:text-rose-400 transition-all"
            title="Remove reference video and return to standard text-to-video"
          >
            <RotateCcw className="h-3 w-3" />
            Clear Plate
          </button>
        )}
      </div>

      {/* Upload Zone / Active Video Plate */}
      {!vfx?.videoUrl ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-director-border hover:border-director-cyan/60 bg-director-panel/40 p-6 text-center cursor-pointer transition-all group"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-director-cyan/10 border border-director-cyan/20 text-director-cyan mb-2 group-hover:scale-105 transition-transform">
            <UploadCloud className="h-5 w-5" />
          </div>
          <span className="font-display text-xs font-bold text-white mb-0.5">
            Drop Reference Video Clip or Actor Plate
          </span>
          <span className="font-mono text-[10px] text-slate-400 max-w-xs mb-3">
            MP4, MOV, or WebM (2-8 seconds recommended for VFX Video-to-Video diffusion)
          </span>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleLoadPrevisVideo}
              disabled={!previsVideoUrl}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white font-mono text-[10px] font-bold shadow-md transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-blue-600/80 disabled:cursor-not-allowed"
              title={
                previsVideoUrl
                  ? 'Use the 3D previs you rendered in this session as the plate'
                  : 'Render the 3D previs first (Stage timeline → "Render 3D Previs")'
              }
            >
              <Sparkles className="h-3 w-3 text-cyan-300" />
              <span>Use Rendered 3D Previs</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 font-mono text-[10px] font-semibold transition-all border border-white/10"
            >
              <UploadCloud className="h-3 w-3" />
              <span>Browse PC...</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-director-border bg-director-surface p-3">
          {/* Preview Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-director-border pb-2 font-mono text-[10px]">
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setActiveTab('plate')}
                className={`rounded px-2 py-0.5 transition-all ${
                  activeTab === 'plate'
                    ? 'bg-director-cyan text-director-darkest font-bold shadow-glow-cyan'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Source Plate
              </button>
              <button
                onClick={() => setActiveTab('depth')}
                className={`rounded px-2 py-0.5 transition-all ${
                  activeTab === 'depth'
                    ? 'bg-director-gold text-director-darkest font-bold shadow-glow-gold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Depth Map
              </button>
              <button
                onClick={() => setActiveTab('edge')}
                className={`rounded px-2 py-0.5 transition-all ${
                  activeTab === 'edge'
                    ? 'bg-emerald-400 text-director-darkest font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Canny Edges
              </button>
              {analysisResult && (
                <>
                  <button
                    onClick={() => setActiveTab('camera')}
                    className={`rounded px-2 py-0.5 transition-all ${
                      activeTab === 'camera'
                        ? 'bg-purple-400 text-director-darkest font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Camera Solve
                  </button>
                  <button
                    onClick={() => setActiveTab('quad')}
                    className={`flex items-center gap-1 rounded px-2 py-0.5 transition-all ${
                      activeTab === 'quad'
                        ? 'bg-indigo-400 text-director-darkest font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="h-3 w-3" />
                    4-Way Quad
                  </button>
                </>
              )}
            </div>

            <span className="truncate max-w-[120px] text-slate-400 text-[9px]">
              {vfx.fileName || 'plate.mp4'}
            </span>
          </div>

          {/* Active Viewport Screen */}
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black flex items-center justify-center border border-white/10">
            {activeTab === 'plate' && (
              <video
                src={vfx.videoUrl}
                controls
                loop
                playsInline
                className="h-full w-full object-contain"
              />
            )}

            {activeTab === 'depth' && (
              vfx.depthPreviewUrl ? (
                <img
                  src={vfx.depthPreviewUrl}
                  alt="Depth Map Preview"
                  className="h-full w-full object-contain filter contrast-125"
                />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-center p-4">
                  <Layers className="h-6 w-6 text-director-gold/60" />
                  <span className="font-mono text-[10px] text-slate-400">
                    Click &ldquo;Analyze Video &amp; Solve 3D Stage&rdquo; below to extract depth proxy map.
                  </span>
                </div>
              )
            )}

            {activeTab === 'edge' && (
              vfx.edgePreviewUrl ? (
                <img
                  src={vfx.edgePreviewUrl}
                  alt="Canny Edges Preview"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-center p-4">
                  <Sliders className="h-6 w-6 text-emerald-400/60" />
                  <span className="font-mono text-[10px] text-slate-400">
                    Click &ldquo;Analyze Video &amp; Solve 3D Stage&rdquo; to extract structural edge contours.
                  </span>
                </div>
              )
            )}

            {activeTab === 'camera' && analysisResult && (
              <div className="flex flex-col items-center justify-center p-4 text-center font-mono text-[11px] gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40">
                  <Compass className="h-5 w-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-white text-xs">
                    Solved: {analysisResult.detectedCameraMovement.toUpperCase()}
                  </span>
                  <span className="text-purple-300 text-[10px]">
                    Speed: {analysisResult.detectedSpeed} • Confidence: {(analysisResult.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="text-slate-400 text-[9px] mt-1">
                    Applied automatically to 3D Virtual Soundstage!
                  </span>
                </div>
              </div>
            )}

            {activeTab === 'quad' && analysisResult && (
              <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-1 p-1 bg-director-darkest">
                {/* Quad 1: Source */}
                <div className="relative rounded overflow-hidden border border-white/10 bg-black flex items-center justify-center">
                  <video src={vfx.videoUrl} autoPlay loop muted playsInline className="h-full w-full object-cover" />
                  <span className="absolute top-1 left-1.5 rounded bg-black/70 px-1 font-mono text-[8px] text-white">
                    1. PLATE
                  </span>
                </div>

                {/* Quad 2: Depth */}
                <div className="relative rounded overflow-hidden border border-white/10 bg-black flex items-center justify-center">
                  {vfx.depthPreviewUrl && (
                    <img src={vfx.depthPreviewUrl} alt="Depth" className="h-full w-full object-cover filter contrast-125" />
                  )}
                  <span className="absolute top-1 left-1.5 rounded bg-black/70 px-1 font-mono text-[8px] text-director-gold">
                    2. DEPTH
                  </span>
                </div>

                {/* Quad 3: Canny */}
                <div className="relative rounded overflow-hidden border border-white/10 bg-black flex items-center justify-center">
                  {vfx.edgePreviewUrl && (
                    <img src={vfx.edgePreviewUrl} alt="Canny" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute top-1 left-1.5 rounded bg-black/70 px-1 font-mono text-[8px] text-emerald-400">
                    3. CANNY
                  </span>
                </div>

                {/* Quad 4: Solved 3D Vectors */}
                <div className="relative rounded overflow-hidden border border-white/10 bg-purple-950/30 p-2 flex flex-col justify-between font-mono text-[9px]">
                  <span className="rounded bg-black/70 px-1 text-purple-300 w-fit">
                    4. 3D SOLVE
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-white uppercase truncate">
                      {analysisResult.detectedCameraMovement}
                    </span>
                    <span className="text-director-cyan">
                      {analysisResult.detectedActors.length} character(s) tracked
                    </span>
                  </div>
                  <span className="text-[8px] text-slate-400">
                    Synced with 3D Soundstage
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Analysis Action Button */}
          <div className="flex flex-col gap-2">
            <button
              onClick={runAnalysis}
              disabled={isAnalyzing}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 font-display text-xs font-bold transition-all ${
                isAnalyzing
                  ? 'bg-director-surface text-slate-400 border border-slate-700 cursor-wait'
                  : 'bg-gradient-to-r from-director-cyan to-blue-500 text-director-darkest shadow-glow-cyan hover:brightness-110 active:scale-98'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                  <span>{analysisProgress.status} ({analysisProgress.percent}%)</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>{analysisResult ? 'Re-Analyze Video Plate' : 'Analyze Video & Solve 3D Stage'}</span>
                </>
              )}
            </button>
          </div>

          {/* Directorial Sync & Results Breakdown */}
          {analysisResult && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>SOLVED FROM VIDEO PLATE</span>
                </div>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 border border-emerald-500/30">
                  AUTO-SYNCED TO 3D
                </span>
              </div>

              {/* Solved Metrics */}
              <div className="flex flex-col gap-1 text-[11px] text-slate-300 border-t border-white/5 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Camera Trajectory:</span>
                  <span className="font-bold text-director-gold uppercase">
                    {analysisResult.detectedCameraMovement} ({analysisResult.detectedSpeed})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Camera Confidence:</span>
                  <span className="font-bold text-director-cyan">
                    {(analysisResult.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Detected Characters:</span>
                  <span className="font-bold text-emerald-400">
                    {analysisResult.detectedActors.length} character(s) on stage
                  </span>
                </div>
              </div>

              {/* Detected Characters Live Stage Coordinates */}
              <div className="flex flex-col gap-1.5 rounded-lg bg-director-darkest/70 border border-white/5 p-2 font-mono text-[10px]">
                <span className="text-slate-400 text-[9px] uppercase tracking-wider font-bold flex items-center gap-1">
                  <Users className="h-3 w-3 text-emerald-400" />
                  Tracked Characters ({shot.actors.length}):
                </span>
                <div className="flex flex-col gap-1">
                  {shot.actors.map((actor, idx) => (
                    <div
                      key={actor.id}
                      className="flex items-center justify-between bg-black/40 px-2 py-1 rounded border border-white/5"
                    >
                      <span className="text-white font-bold">
                        {idx + 1}. {actor.name}
                      </span>
                      <span className="text-emerald-400">
                        ({actor.trajectory.startPosition.x}, {actor.trajectory.startPosition.y}) → ({actor.trajectory.endPosition.x}, {actor.trajectory.endPosition.y})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Production Passes Toolbar */}
              <div className="flex flex-col gap-2 rounded-lg border border-director-cyan/30 bg-director-cyan/10 p-2.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-director-cyan font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Export Video Passes
                  </span>
                  <span className="text-[9px] text-slate-400">Production Pack</span>
                </div>

                {isExporting && (
                  <div className="flex items-center gap-2 py-1 px-2 rounded bg-black/50 text-[10px] text-cyan-300">
                    <div className="h-3 w-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0" />
                    <span className="truncate">{exportProgress}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  <button
                    onClick={() => handleExportPass('depth')}
                    disabled={isExporting}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-director-darkest/80 hover:bg-director-gold/20 border border-director-gold/40 text-director-gold text-[10px] font-bold transition-all disabled:opacity-50"
                    title="Export full rendered Depth Video (.webm)"
                  >
                    <Download className="h-3 w-3" />
                    Depth MP4
                  </button>

                  <button
                    onClick={() => handleExportPass('edge')}
                    disabled={isExporting}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-director-darkest/80 hover:bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold transition-all disabled:opacity-50"
                    title="Export full rendered Canny Edge Video (.webm)"
                  >
                    <Download className="h-3 w-3" />
                    Canny MP4
                  </button>

                  <button
                    onClick={handleExportJson}
                    disabled={isExporting}
                    className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-director-darkest/80 hover:bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-bold transition-all disabled:opacity-50"
                    title="Export Camera trajectory and character tracking JSON"
                  >
                    <FileText className="h-3 w-3" />
                    Track JSON
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* The 4 Reference Modes (Filmmaker Intent) */}
      <div className="flex flex-col gap-2 min-w-0">
        <label className="font-mono text-[10px] text-slate-400 uppercase tracking-wider font-bold">
          Filmmaker Reference Mode
        </label>
        <div className="grid grid-cols-2 gap-2 min-w-0">
          {REFERENCE_MODES.map((mode) => {
            const isSelected = (vfx?.referenceMode || 'actor-motion') === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => updateVfxReference({ referenceMode: mode.id })}
                className={`flex flex-col items-start gap-1 rounded-xl p-2.5 text-left border transition-all min-w-0 ${
                  isSelected
                    ? 'border-director-cyan bg-director-cyan/10 shadow-glow-cyan/50'
                    : 'border-director-border bg-director-panel/40 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between w-full min-w-0 gap-1">
                  <span className={`font-display text-xs font-bold truncate ${isSelected ? 'text-director-cyan' : 'text-white'}`}>
                    {mode.name}
                  </span>
                  <span className="rounded bg-black/40 px-1.5 py-0.2 font-mono text-[8px] text-slate-400 shrink-0">
                    {mode.badge}
                  </span>
                </div>
                <p className="font-sans text-[10px] text-slate-400 leading-tight">
                  {mode.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Directorial VFX Sliders */}
      <div className="flex flex-col gap-3 rounded-xl border border-director-border bg-director-panel/40 p-3 font-mono text-xs">
        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
          VFX Control Parameters
        </span>

        {/* Depth Guidance Weight */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-300">Depth Guidance Strength</span>
            <span className="font-bold text-director-gold">
              {((vfx?.depthGuidanceWeight ?? 0.7) * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={vfx?.depthGuidanceWeight ?? 0.7}
            onChange={(e) => updateVfxReference({ depthGuidanceWeight: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-director-surface rounded-lg appearance-none cursor-pointer accent-director-gold"
          />
          <span className="text-[9px] text-slate-400">
            Controls structural volumetric adherence to the reference plate.
          </span>
        </div>

        {/* Edge / Contour Fidelity */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-300">Edge &amp; Contour Fidelity</span>
            <span className="font-bold text-emerald-400">
              {((vfx?.edgeFidelity ?? 0.5) * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={vfx?.edgeFidelity ?? 0.5}
            onChange={(e) => updateVfxReference({ edgeFidelity: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-director-surface rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
          <span className="text-[9px] text-slate-400">
            Retains actor silhouette and sharp architectural boundaries.
          </span>
        </div>

        {/* Motion Retention / Denoise Strength */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-300">Motion Retention (Denoise)</span>
            <span className="font-bold text-director-cyan">
              {((vfx?.motionRetention ?? 0.65) * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={0.95}
            step={0.05}
            value={vfx?.motionRetention ?? 0.65}
            onChange={(e) => updateVfxReference({ motionRetention: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-director-surface rounded-lg appearance-none cursor-pointer accent-director-cyan"
          />
          <span className="text-[9px] text-slate-400">
            Higher values preserve raw physical motion; lower values allow creative re-imagination.
          </span>
        </div>
      </div>
    </div>
  );
};
