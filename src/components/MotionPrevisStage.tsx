import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { useAssetLibraryStore } from '../stores/useAssetLibraryStore';
import { StagePrevis3D } from './StagePrevis3D';
import { interpolateTrajectoryPosition } from '../engine/trajectoryMath';
import {
  generateDepthProxyCanvas,
  generateEdgeProxyCanvas,
  generateMaskProxyCanvas,
  generatePoseOverlayCanvas,
  generatePoseAllCanvas,
  analyzeVideoPlate,
} from '../engine/vfxAnalyzer';
import { logger } from '../stores/useLogStore';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Camera,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Scissors,
  Bookmark,
  Upload,
  Film,
  Box,
  Repeat,
  Plus,
  Globe,
  Trash2,
  Download,
  Loader2,
} from 'lucide-react';

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

interface MotionPrevisStageProps {
  shotTitle?: string;
  activeStep?: 'shot' | 'analyze' | 'plan' | 'export';
  workspaceMode?: 'previs' | 'vfx' | 'diffusion';
  onDirectWithComfy?: () => void;
}

const PASS_TILE_W = 320;
const PASS_TILE_H = 180;

export const MotionPrevisStage: React.FC<MotionPrevisStageProps> = ({
  shotTitle = 'Shot 01A Tracking In',
  activeStep: _activeStep = 'analyze',
  workspaceMode: _workspaceMode = 'previs',
  onDirectWithComfy: _onDirectWithComfy,
}) => {
  const {
    shot,
    updateVfxReference,
    setCameraMovement,
    updateDuration,
    setCreationMode,
    addActor,
    removeActor,
    updateActor,
    updateActorPositionAtTime,
    updateCameraPositionAtTime,
    selectedActorId,
    setSelectedActorId,
    setActiveDeckTab,
    setReferenceImage,
    previsVideoUrl,
    isRenderingPrevis,
    previsProgress,
    renderPrevisVideo,
  } = useShotStore();
  const openAssetLibrary = useAssetLibraryStore((s) => s.openLibrary);
  const isConstruct3D = shot.creationMode === 'construct-3d';
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0.0);
  const [viewMode, setViewMode] = useState<'reference' | 'viewfinder'>('reference');
  const [activeTool, setActiveTool] = useState<'trim' | 'markers' | null>('trim');
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [fps] = useState(24);
  const [isLooping, setIsLooping] = useState(true);
  const [customBottomObjName, setCustomBottomObjName] = useState('');
  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);

  // Fullscreen support for the entire stage
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!stageContainerRef.current) return;
    if (!document.fullscreenElement) {
      stageContainerRef.current.requestFullscreen?.().catch((err) => {
        console.error('Fullscreen request error:', err);
      });
    } else {
      document.exitFullscreen?.().catch((err) => {
        console.error('Fullscreen exit error:', err);
      });
    }
  };

  // Interactive timeline markers (start empty — no fabricated cues)
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);

  // Trim range state (percentage 0..100)
  const [trimStartPct, setTrimStartPct] = useState(0);
  const [trimEndPct, setTrimEndPct] = useState(100);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingTrimLeft, setIsDraggingTrimLeft] = useState(false);
  const [isDraggingTrimRight, setIsDraggingTrimRight] = useState(false);

  const duration = shot.durationSeconds || 10;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const leftViewportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Canvases for the 5 lower pass tiles
  const poseActorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const edgesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const masksCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseAllCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Real-time CV pass previews (Pose, Depth, Edges, Masks, Pose All).
  // These are derived ONLY from a real, loaded video plate. With no plate the
  // tiles are cleared and an explicit empty state is rendered on top.
  const lastPassRenderRef = useRef<number>(0);
  const taintWarnedUrlRef = useRef<string | null>(null);
  const hasVideoPlate = !!shot.vfxReference?.videoUrl;
  const clearPassCanvases = useCallback(() => {
    [poseActorCanvasRef, depthCanvasRef, edgesCanvasRef, masksCanvasRef, poseAllCanvasRef].forEach((ref) => {
      const c = ref.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    });
  }, []);

  const updateAllPassCanvases = useCallback(
    (force: boolean = false) => {
      // In 3D Construct mode, CV passes are not mounted; skip heavy Sobel filter
      if (isConstruct3D) return;

      const now = performance.now();
      if (!force && now - lastPassRenderRef.current < 120) {
        return; // throttle CV computation to maintain 60fps UI
      }
      lastPassRenderRef.current = now;

      const video = videoRef.current;
      // readyState >= 2 (HAVE_CURRENT_DATA) means a decoded frame is available,
      // whether the plate is playing or paused/scrubbed.
      if (!hasVideoPlate || !video || video.readyState < 2) {
        clearPassCanvases();
        return;
      }

      const w = PASS_TILE_W;
      const h = PASS_TILE_H;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = w;
      offCanvas.height = h;
      const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
      if (!offCtx) return;

      let frameData: ImageData;
      try {
        offCtx.drawImage(video, 0, 0, w, h);
        frameData = offCtx.getImageData(0, 0, w, h);
      } catch (err) {
        // Cross-origin plates taint the canvas; pixel analysis is impossible.
        clearPassCanvases();
        if (taintWarnedUrlRef.current !== video.currentSrc) {
          taintWarnedUrlRef.current = video.currentSrc;
          logger.warn('CV pass preview unavailable: the plate cannot be read (cross-origin source).', err);
        }
        return;
      }

      if (poseActorCanvasRef.current) {
        const pCanvas = generatePoseOverlayCanvas(video, w, h);
        const ctx = poseActorCanvasRef.current.getContext('2d');
        if (ctx) ctx.drawImage(pCanvas, 0, 0, w, h);
      }

      if (depthCanvasRef.current) {
        const dCanvas = generateDepthProxyCanvas(frameData);
        const ctx = depthCanvasRef.current.getContext('2d');
        if (ctx) ctx.drawImage(dCanvas, 0, 0, w, h);
      }

      if (edgesCanvasRef.current) {
        const eCanvas = generateEdgeProxyCanvas(frameData);
        const ctx = edgesCanvasRef.current.getContext('2d');
        if (ctx) ctx.drawImage(eCanvas, 0, 0, w, h);
      }

      if (masksCanvasRef.current) {
        const mCanvas = generateMaskProxyCanvas(frameData);
        const ctx = masksCanvasRef.current.getContext('2d');
        if (ctx) ctx.drawImage(mCanvas, 0, 0, w, h);
      }

      if (poseAllCanvasRef.current) {
        const paCanvas = generatePoseAllCanvas(w, h, frameData);
        const ctx = poseAllCanvasRef.current.getContext('2d');
        if (ctx) ctx.drawImage(paCanvas, 0, 0, w, h);
      }
    },
    [isConstruct3D, hasVideoPlate, clearPassCanvases]
  );

  // 3. Active 24fps Continuous Playback Animation Loop
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const isLoopingRef = useRef(isLooping);
  isLoopingRef.current = isLooping;
  const trimStartPctRef = useRef(trimStartPct);
  trimStartPctRef.current = trimStartPct;
  const trimEndPctRef = useRef(trimEndPct);
  trimEndPctRef.current = trimEndPct;

  useEffect(() => {
    if (!isPlaying) return;

    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const delta = ((now - lastTime) / 1000) * playbackSpeedRef.current;
      lastTime = now;

      setCurrentTime((prev) => {
        const dur = durationRef.current;
        const inTime = (trimStartPctRef.current / 100) * dur;
        const outTime = Math.max(inTime + 0.05, (trimEndPctRef.current / 100) * dur);

        let next = prev + delta;
        if (next >= outTime) {
          if (isLoopingRef.current) {
            return inTime; // seamless loop within trim region
          } else {
            setIsPlaying(false);
            return outTime;
          }
        }
        if (next < inTime) {
          return inTime;
        }
        return next;
      });

      if (!isConstruct3D) {
        updateAllPassCanvases(false);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isConstruct3D, updateAllPassCanvases]);

  // Sync canvases when scrubbing while paused
  useEffect(() => {
    if (!isPlaying && !isConstruct3D) {
      updateAllPassCanvases(true);
    }
  }, [currentTime, isPlaying, isConstruct3D, updateAllPassCanvases]);

  // Sync Video Element Play/Pause, Rate, Volume and Mute
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = volume / 100;
    video.muted = isMuted || volume === 0;

    if (isPlaying) {
      video.playbackRate = playbackSpeed;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, playbackSpeed, volume, isMuted]);

  // Keyboard Shortcut for Object Deletion (Delete / Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.isContentEditable
      ) {
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedActorId) {
        removeActor(selectedActorId);
        setSelectedActorId(undefined);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedActorId, removeActor, setSelectedActorId]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && Math.abs(video.currentTime - currentTime) > 0.05) {
      video.currentTime = Math.min(video.duration || duration, currentTime);
    }
  }, [currentTime, duration]);

  // Spacebar Play/Pause Keyboard Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'Home') {
        e.preventDefault();
        setCurrentTime(0);
      } else if (e.code === 'End') {
        e.preventDefault();
        setCurrentTime(duration);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration]);

  // ── Plate loading ────────────────────────────────────────────────────────
  // A freshly uploaded plate gets one automatic camera solve. Remounts, view
  // switches, and reloads must NOT re-solve (that would overwrite the user's
  // camera edits), so the pending URL is tracked explicitly.
  const pendingAutoSolveUrlRef = useRef<string | null>(null);

  /** Revoke a plate blob URL only if it isn't the store-owned previs render. */
  const releaseOwnedPlateUrl = (url: string | undefined) => {
    if (url && url.startsWith('blob:') && url !== previsVideoUrl) {
      URL.revokeObjectURL(url);
    }
  };

  const loadPlate = (url: string, fileName: string, autoSolve: boolean) => {
    releaseOwnedPlateUrl(shot.vfxReference?.videoUrl);
    pendingAutoSolveUrlRef.current = autoSolve ? url : null;
    updateVfxReference({ enabled: true, videoUrl: url, fileName });
    setViewMode('reference');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-selecting the same file still fires onChange.
    e.target.value = '';
    if (!file) return;
    loadPlate(URL.createObjectURL(file), file.name, true);
  };

  const handleUsePrevisAsPlate = () => {
    if (!previsVideoUrl) return;
    // No auto-solve: the previs camera already IS the shot camera.
    loadPlate(previsVideoUrl, `${shot.name.replace(/\s+/g, '_')}_3D_Previs`, false);
  };

  const clearVideoPlate = () => {
    releaseOwnedPlateUrl(shot.vfxReference?.videoUrl);
    pendingAutoSolveUrlRef.current = null;
    updateVfxReference({
      videoUrl: undefined,
      fileName: undefined,
      enabled: false,
      depthPreviewUrl: undefined,
      edgePreviewUrl: undefined,
      solvedCameraMove: undefined,
    });
  };

  const handlePlateLoadedData = async () => {
    updateAllPassCanvases(true);
    const url = shot.vfxReference?.videoUrl;
    if (!url || pendingAutoSolveUrlRef.current !== url) return;
    pendingAutoSolveUrlRef.current = null;

    try {
      // Analyse on a detached element so the visible plate isn't seeked around.
      const probe = document.createElement('video');
      probe.muted = true;
      probe.crossOrigin = 'anonymous';
      probe.src = url;
      await new Promise<void>((resolve, reject) => {
        probe.onloadedmetadata = () => resolve();
        probe.onerror = () => reject(new Error('Failed to load plate for camera solve.'));
      });
      const result = await analyzeVideoPlate(probe);
      setCameraMovement(result.detectedCameraMovement, result.detectedSpeed);
      logger.success(
        `Camera solve from "${shot.vfxReference?.fileName ?? 'plate'}": ${result.detectedCameraMovement} (${result.detectedSpeed}).`
      );
    } catch (err) {
      logger.error('Automatic camera solve failed.', err);
    }
  };

  // Immediate Timeline Pointer Scrubbing (rock-solid Pointer Events API)
  const scrubToClientX = useCallback(
    (clientX: number) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = Math.min(duration, Math.max(0, pct * duration));
      setCurrentTime(newTime);

      if (videoRef.current && Math.abs(videoRef.current.currentTime - newTime) > 0.05) {
        videoRef.current.currentTime = newTime;
      }
    },
    [duration]
  );

  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-trim-handle]')) return;
    e.preventDefault();
    timelineRef.current?.setPointerCapture(e.pointerId);
    setIsDraggingPlayhead(true);
    scrubToClientX(e.clientX);
  };

  const handleTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingPlayhead) {
      e.preventDefault();
      scrubToClientX(e.clientX);
    }
  };

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingPlayhead) {
      setIsDraggingPlayhead(false);
      try {
        timelineRef.current?.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Trim Handles Pointer Events
  const handleTrimPointerDown = (e: React.PointerEvent<HTMLDivElement>, side: 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (side === 'left') setIsDraggingTrimLeft(true);
    else setIsDraggingTrimRight(true);
  };

  const handleTrimPointerMove = (e: React.PointerEvent<HTMLDivElement>, side: 'left' | 'right') => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

    if (side === 'left' && isDraggingTrimLeft) {
      setTrimStartPct(Math.min(trimEndPct - 2, Math.max(0, pct)));
    } else if (side === 'right' && isDraggingTrimRight) {
      setTrimEndPct(Math.max(trimStartPct + 2, Math.min(100, pct)));
    }
  };

  const handleTrimPointerUp = (e: React.PointerEvent<HTMLDivElement>, side: 'left' | 'right') => {
    if (side === 'left') setIsDraggingTrimLeft(false);
    else setIsDraggingTrimRight(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Stepping Frames
  const stepFrames = useCallback(
    (deltaFrames: number) => {
      setCurrentTime((prev) => {
        const next = Math.max(0, Math.min(duration, prev + deltaFrames / fps));
        if (videoRef.current) {
          videoRef.current.currentTime = next;
        }
        return next;
      });
    },
    [duration, fps]
  );

  // Add keyframe cue
  const handleAddMarker = () => {
    const id = `m_${Date.now()}`;
    const newMarker: TimelineMarker = {
      id,
      time: Number(currentTime.toFixed(2)),
      label: `Cue @ ${currentTime.toFixed(1)}s`,
      color: '#f59e0b',
    };
    setMarkers((prev) => [...prev, newMarker]);

    // Automatically record keyframe into the active actor or camera!
    if (selectedActorId === '__camera__') {
      const camPos = shot.camera.movement.startPosition;
      updateCameraPositionAtTime(currentTime, camPos, duration);
    } else if (selectedActorId) {
      const targetActor = shot.actors.find((a) => a.id === selectedActorId);
      if (targetActor) {
        const pos = interpolateTrajectoryPosition(targetActor.trajectory, currentTime, duration);
        updateActorPositionAtTime(selectedActorId, currentTime, pos, duration);
      }
    }
  };

  // Format Timecode: 00:MM:SS:FF
  const formatTimecode = useCallback(
    (sec: number) => {
      const safeSec = Math.max(0, sec || 0);
      const m = Math.floor(safeSec / 60);
      const s = Math.floor(safeSec % 60);
      const frames = Math.floor((safeSec % 1) * fps);
      return `00:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${frames
        .toString()
        .padStart(2, '0')}`;
    },
    [fps]
  );

  // Dynamic Ruler Ticks
  const rulerTicks = useMemo(() => {
    const count = 6;
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = (i / count) * duration;
      const pct = (i / count) * 100;
      return {
        pct,
        time: t,
        label: formatTimecode(t),
      };
    });
  }, [duration, formatTimecode]);

  // Capture Snapshot — grabs exactly what the left viewport is showing.
  const handleTakeSnapshot = () => {
    const container = leftViewportRef.current;
    if (!container) return;

    let source: CanvasImageSource | null = null;
    let w = 0;
    let h = 0;
    const showingPlate = !isConstruct3D && viewMode === 'reference';

    if (showingPlate) {
      const video = videoRef.current;
      const img = container.querySelector('img');
      if (shot.vfxReference?.videoUrl && video && video.readyState >= 2) {
        source = video;
        w = video.videoWidth;
        h = video.videoHeight;
      } else if (img && img.complete && img.naturalWidth > 0) {
        source = img;
        w = img.naturalWidth;
        h = img.naturalHeight;
      }
    } else {
      // The viewfinder renderer uses preserveDrawingBuffer, so its canvas is readable.
      const vf = container.querySelector<HTMLCanvasElement>('canvas[data-role="viewfinder"]');
      if (vf && vf.width > 0 && vf.height > 0) {
        source = vf;
        w = vf.width;
        h = vf.height;
      }
    }

    if (!source || !w || !h) {
      logger.warn('Snapshot unavailable: nothing is rendered in the viewport yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      ctx.drawImage(source, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) {
          logger.error('Snapshot failed: the frame could not be encoded.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `snapshot_${shotTitle.replace(/\s+/g, '_')}_${currentTime.toFixed(2)}s.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
    } catch (err) {
      // toBlob throws SecurityError on a tainted (cross-origin) canvas.
      logger.error('Snapshot failed: the source cannot be read (cross-origin).', err);
    }
  };

  return (
    <div ref={stageContainerRef} className="flex h-full w-full flex-col bg-[#08090d] text-slate-200 select-none overflow-hidden">
      {/* 1. Header Bar */}
      <div className="flex h-10 items-center justify-between border-b border-white/5 px-4 bg-[#0d0f17] shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-display text-xs font-bold text-white tracking-wide">
            {shotTitle}
          </span>
          <span className="rounded bg-blue-500/20 px-2 py-0.5 font-mono text-[9px] text-blue-400 font-bold border border-blue-500/30">
            {shot.camera.movement.type.toUpperCase()} • {shot.camera.lens.focalLength}
          </span>

          {/* Workflow Mode Pill Switcher */}
          <div className="flex items-center rounded-md bg-black/60 p-0.5 border border-white/10">
            <button
              onClick={() => setCreationMode('construct-3d')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                isConstruct3D
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Construct 3D Shot from Scratch"
            >
              <Box className="h-3 w-3" />
              <span>3D Previs</span>
            </button>
            <button
              onClick={() => setCreationMode('video-plate')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                !isConstruct3D
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="VFX Video Plate Motion Solve"
            >
              <Film className="h-3 w-3" />
              <span>Video Plate</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px] text-slate-400">
          <span className="text-white font-bold">
            {formatTimecode(currentTime)} / {formatTimecode(duration)}
          </span>
          {!isConstruct3D && (
            <div className="flex items-center rounded bg-white/5 p-0.5 border border-white/5">
              <button
                onClick={() => setViewMode('reference')}
                className={`px-2 py-0.5 rounded text-[9px] transition-colors ${
                  viewMode === 'reference' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400'
                }`}
              >
                Reference Plate
              </button>
              <button
                onClick={() => setViewMode('viewfinder')}
                className={`px-2 py-0.5 rounded text-[9px] transition-colors ${
                  viewMode === 'viewfinder' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400'
                }`}
              >
                3D Viewfinder
              </button>
            </div>
          )}
          {/* Active Reference Plate Badge */}
          {shot.referenceImage?.previewUrl && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-mono text-[9px] shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Reference Plate Attached</span>
              <button
                onClick={() => setReferenceImage(undefined)}
                className="text-slate-400 hover:text-rose-400 ml-0.5 font-bold"
                title="Detach reference plate from shot"
              >
                ✕
              </button>
            </div>
          )}
          {!isConstruct3D && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                title="Upload custom video plate"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
              />
            </>
          )}
          <button
            onClick={toggleFullscreen}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Toggle Stage Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5 text-amber-400" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. Upper Dual Viewport (Side-by-Side: Viewfinder/Reference | 3D Soundstage) */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-[#090b10] flex-1 min-h-0">
        {/* Left Viewport: Through-the-Lens Viewfinder (Construct mode) OR Reference Video (Video Plate mode) */}
        <div
          ref={leftViewportRef}
          className="relative flex flex-col h-full w-full rounded-lg bg-[#000000] border border-white/10 overflow-hidden min-h-0 min-w-0 group"
        >
          <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-2">
            <span className="rounded bg-black/70 backdrop-blur-md px-2 py-0.5 font-mono text-[9px] font-semibold text-slate-200 border border-white/10">
              {isConstruct3D ? 'Viewfinder (POV Camera)' : viewMode === 'reference' ? 'Reference Plate' : 'Viewfinder (POV)'}
            </span>
            {isConstruct3D ? (
              <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-[8px] text-blue-300">
                {shot.camera.lens.focalLength} • {shot.aspectRatio}
              </span>
            ) : shot.vfxReference?.fileName ? (
              <span className="rounded bg-teal-500/20 px-1.5 py-0.5 font-mono text-[8px] text-teal-300 truncate max-w-[140px]">
                {shot.vfxReference.fileName}
              </span>
            ) : shot.referenceImage?.previewUrl ? (
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[8px] text-emerald-300 flex items-center gap-1">
                Reference Image Attached
              </span>
            ) : null}
          </div>

          {/* Video Plate controls if in video-plate mode */}
          {!isConstruct3D && hasVideoPlate && (
            <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
              {previsVideoUrl && shot.vfxReference?.videoUrl !== previsVideoUrl && (
                <button
                  onClick={handleUsePrevisAsPlate}
                  className="flex items-center gap-1 rounded bg-black/70 border border-white/15 px-2 py-0.5 font-mono text-[9px] text-slate-300 hover:text-white"
                  title="Replace the plate with the 3D previs rendered in this session"
                >
                  <Film className="h-3 w-3" />
                  Use Rendered Previs
                </button>
              )}
              <button
                onClick={clearVideoPlate}
                className="flex items-center gap-1 rounded bg-black/70 border border-white/15 px-2 py-0.5 font-mono text-[9px] text-slate-300 hover:text-rose-300"
                title="Remove the video plate from this shot"
              >
                <Trash2 className="h-3 w-3" />
                Clear Plate
              </button>
            </div>
          )}

          {/* Left Viewport Content */}
          {isConstruct3D ? (
            /* Construct Mode: Always Through-the-Lens Viewfinder */
            <div className="flex-1 h-full w-full relative flex flex-col min-h-0 min-w-0">
              <StagePrevis3D
                externalTime={currentTime}
                isExternalPlaying={isPlaying}
                onTimeChange={(t) => setCurrentTime(t)}
                initialViewMode="viewfinder"
                showToolbar={false}
              />
            </div>
          ) : viewMode === 'reference' ? (
            /* Video Plate Mode: Reference Video or Saved Canvas 2D Plate */
            shot.vfxReference?.videoUrl ? (
              <video
                ref={videoRef}
                src={shot.vfxReference.videoUrl}
                crossOrigin="anonymous"
                loop
                muted={isMuted || volume === 0}
                playsInline
                onLoadedData={handlePlateLoadedData}
                onSeeked={() => updateAllPassCanvases(true)}
                onError={() =>
                  logger.error(
                    `Video plate "${shot.vfxReference?.fileName ?? ''}" could not be loaded. If the app was reloaded, re-upload the file (plates are not yet stored with the project).`
                  )
                }
                className="h-full w-full object-contain"
              />
            ) : shot.referenceImage?.previewUrl ? (
              <div className="relative h-full w-full flex items-center justify-center bg-black">
                <img
                  src={shot.referenceImage.previewUrl}
                  alt="Canvas 2D Reference Plate"
                  className="h-full w-full object-contain"
                />
                <div className="absolute top-10 left-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/80 backdrop-blur px-2 py-1 font-mono text-[9px] border border-white/10 text-emerald-300 shadow-md">
                  <span>REFERENCE IMAGE PLATE</span>
                </div>
                <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2">
                  <button
                    onClick={() => setReferenceImage(undefined)}
                    className="flex items-center gap-1 rounded bg-white/10 hover:bg-rose-900/60 px-2.5 py-1 font-mono text-[9px] text-slate-300 hover:text-white transition-all border border-white/5"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear Plate
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative h-full w-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-300">
                  <Film className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-xs font-bold text-white">No video plate loaded</p>
                  <p className="mt-1 max-w-xs font-mono text-[10px] text-slate-400">
                    Upload a reference clip to solve its camera move and preview CV passes, or use the 3D previs you rendered.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 rounded bg-teal-600/90 hover:bg-teal-600 px-2.5 py-1 font-mono text-[10px] font-bold text-white shadow-md transition-all"
                  >
                    <Upload className="h-3 w-3" />
                    Upload Video
                  </button>
                  <button
                    onClick={handleUsePrevisAsPlate}
                    disabled={!previsVideoUrl}
                    className="flex items-center gap-1 rounded bg-white/10 hover:bg-white/20 px-2.5 py-1 font-mono text-[10px] text-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10"
                    title={
                      previsVideoUrl
                        ? 'Use the 3D previs rendered in this session as the plate'
                        : 'Render the 3D previs first (timeline → "Render 3D Previs")'
                    }
                  >
                    <Film className="h-3 w-3" />
                    Use Rendered Previs
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="flex-1 h-full w-full relative flex flex-col min-h-0 min-w-0">
              <StagePrevis3D
                externalTime={currentTime}
                isExternalPlaying={isPlaying}
                onTimeChange={(t) => setCurrentTime(t)}
                initialViewMode="viewfinder"
                showToolbar={false}
              />
            </div>
          )}
        </div>

        {/* Right Viewport: Camera Path 3D Virtual Soundstage + Asset Shelf */}
        <div className="relative flex flex-col h-full w-full rounded-lg bg-[#000000] border border-white/10 overflow-hidden min-h-0 min-w-0">
          {/* Badge: 3D Soundstage with Procedural 3D Previs */}
          <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 rounded bg-black/85 backdrop-blur-md px-2.5 py-1 border border-white/10 font-mono text-[9px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white font-semibold tracking-wider">3D SOUNDSTAGE</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">PROCEDURAL 3D PREVIS</span>
          </div>

          <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 font-mono text-[9px] text-slate-400">
            <span className="rounded bg-black/70 backdrop-blur-md px-2 py-0.5 border border-white/10">
              Orbit: Left-Drag • Pan: Right-Drag
            </span>
          </div>

          {/* Embedded Stage: 3D Soundstage */}
          <div className="flex-1 h-full w-full relative flex flex-col min-h-0 min-w-0">
            <StagePrevis3D
              externalTime={currentTime}
              isExternalPlaying={isPlaying}
              onTimeChange={(t) => setCurrentTime(t)}
              initialViewMode="stage"
              showToolbar={false}
            />
          </div>
        </div>
      </div>

      {/* 3. Lower Section: 5 CV Video Passes (in video-plate mode) OR Staged Objects Status Deck (in construct-3d mode) */}
      {!isConstruct3D ? (
        <div className="relative h-28 shrink-0 border-t border-b border-white/10 bg-[#06070a] p-1">
          {!hasVideoPlate && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#06070a]/80 font-mono text-[10px] text-slate-400 pointer-events-none">
              CV pass previews appear here once a video plate is loaded.
            </div>
          )}
          <div className="grid grid-cols-5 gap-1 h-full">
            {/* Tile 1: Pose (Actor) */}
            <div className="relative flex flex-col rounded bg-black border border-white/10 overflow-hidden group">
              <span className="absolute top-1 left-1.5 z-10 rounded bg-black/70 px-1.5 py-0.2 font-mono text-[8px] text-slate-300">
                Pose (Actor)
              </span>
              <canvas ref={poseActorCanvasRef} className="h-full w-full object-cover" width={320} height={180} />
            </div>

            {/* Tile 2: Depth */}
            <div className="relative flex flex-col rounded bg-black border border-white/10 overflow-hidden group">
              <span className="absolute top-1 left-1.5 z-10 rounded bg-black/70 px-1.5 py-0.2 font-mono text-[8px] text-slate-300">
                Depth
              </span>
              <canvas ref={depthCanvasRef} className="h-full w-full object-cover" width={320} height={180} />
            </div>

            {/* Tile 3: Edges */}
            <div className="relative flex flex-col rounded bg-black border border-white/10 overflow-hidden group">
              <span className="absolute top-1 left-1.5 z-10 rounded bg-black/70 px-1.5 py-0.2 font-mono text-[8px] text-slate-300">
                Edges
              </span>
              <canvas ref={edgesCanvasRef} className="h-full w-full object-cover" width={320} height={180} />
            </div>

            {/* Tile 4: Masks */}
            <div className="relative flex flex-col rounded bg-black border border-white/10 overflow-hidden group">
              <span className="absolute top-1 left-1.5 z-10 rounded bg-black/70 px-1.5 py-0.2 font-mono text-[8px] text-slate-300">
                Masks
              </span>
              <canvas ref={masksCanvasRef} className="h-full w-full object-cover" width={320} height={180} />
            </div>

            {/* Tile 5: Pose (All) */}
            <div className="relative flex flex-col rounded bg-black border border-white/10 overflow-hidden group">
              <span className="absolute top-1 left-1.5 z-10 rounded bg-black/70 px-1.5 py-0.2 font-mono text-[8px] text-slate-300">
                Pose (All)
              </span>
              <canvas ref={poseAllCanvasRef} className="h-full w-full object-cover" width={320} height={180} />
            </div>
          </div>
        </div>
      ) : (
        <div className="h-14 shrink-0 border-t border-b border-white/10 bg-[#07090e] px-3 py-1.5 flex items-center justify-between gap-2 overflow-visible relative z-30">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-mono text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                Soundstage Placement ({shot.actors.length}):
              </span>
            </div>

            {/* Direct Environment Location Quick-Access Pill */}
            <button
              onClick={() => setActiveDeckTab('environment')}
              className="flex items-center gap-1.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 hover:border-emerald-400 px-2.5 py-1 text-emerald-300 hover:text-white transition-all font-mono text-[9px] shrink-0 shadow-sm"
              title="Click to change or customize Scene Environment & Filming Location"
            >
              <Globe className="h-3 w-3 text-emerald-400" />
              <span className="font-bold">{shot.environment?.name || 'Soundstage Studio'}</span>
              <span className="text-emerald-500/60">•</span>
              <span className="text-emerald-400/80 capitalize">{shot.environment?.weather || 'clear'}</span>
              <span className="text-emerald-500/60">•</span>
              <span className="text-emerald-400/80 capitalize">{shot.environment?.timeOfDay || 'noon'}</span>
            </button>

            {shot.actors.length === 0 ? (
              <div className="flex items-center gap-2 text-slate-400 font-mono text-[10px]">
                <span>Stage empty. Click to add:</span>
                <button
                  onClick={() => addActor(undefined, 'human')}
                  className="rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 px-2 py-0.5 transition-all"
                >
                  +👤 Person
                </button>
                <button
                  onClick={() => addActor(undefined, 'car')}
                  className="rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 px-2 py-0.5 transition-all"
                >
                  +🚗 Car
                </button>
                <button
                  onClick={() => addActor(undefined, 'tree')}
                  className="rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 px-2 py-0.5 transition-all"
                >
                  +🌲 Tree
                </button>
                <button
                  onClick={() => addActor(undefined, 'table')}
                  className="rounded bg-orange-600/30 hover:bg-orange-600/50 text-orange-200 border border-orange-500/40 px-2 py-0.5 transition-all"
                >
                  +🪑 Table
                </button>
                <button
                  onClick={() => addActor(undefined, 'prop')}
                  className="rounded bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 px-2 py-0.5 transition-all"
                >
                  +📦 Prop
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-3xl no-scrollbar">
                {shot.actors.map((act) => {
                  const isSelected = act.id === selectedActorId;
                  const icon =
                    act.kind === 'car' ? '🚗' : act.kind === 'tree' ? '🌲' : act.kind === 'table' ? '🪑' : act.kind === 'chair' ? '💺' : act.kind === 'prop' ? '📦' : '👤';
                  return (
                    <div
                      key={act.id}
                      onClick={() => {
                        setSelectedActorId(act.id);
                        setActiveDeckTab('staging');
                      }}
                      className={`flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[9px] transition-all cursor-pointer shrink-0 ${
                        isSelected
                          ? 'bg-blue-600/30 border border-blue-400 text-white shadow-glow-cyan/20 ring-1 ring-blue-500'
                          : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'
                      }`}
                      title="Click to select & edit in Right Inspector"
                    >
                      <span className="text-sm">{icon}</span>
                      <span className="font-semibold text-white max-w-[90px] truncate">{act.name}</span>
                      <span className="text-blue-400">X:{Math.round(act.trajectory.startPosition.x)}</span>
                      <span className="text-emerald-400">Z:{Math.round(act.trajectory.startPosition.y)}</span>
                      {(act.scale ?? 1.0) !== 1.0 && (
                        <span className="text-cyan-400 font-bold">{(act.scale ?? 1.0).toFixed(1)}×</span>
                      )}

                      {/* Quick Position Presets */}
                      <div className="flex items-center gap-0.5 ml-1 border-l border-white/10 pl-1 text-[8px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateActor(act.id, {
                              trajectory: {
                                ...act.trajectory,
                                startPosition: { x: 30, y: 50 },
                                endPosition: { x: 30, y: 50 },
                              },
                            });
                          }}
                          className="px-1 py-0.2 rounded hover:bg-white/20 text-slate-300 hover:text-white"
                          title="Quick Place: Left Stage (X: 30)"
                        >
                          L
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateActor(act.id, {
                              trajectory: {
                                ...act.trajectory,
                                startPosition: { x: 50, y: 50 },
                                endPosition: { x: 50, y: 50 },
                              },
                            });
                          }}
                          className="px-1 py-0.2 rounded hover:bg-white/20 text-amber-300 hover:text-white"
                          title="Quick Place: Center Stage (X: 50)"
                        >
                          C
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateActor(act.id, {
                              trajectory: {
                                ...act.trajectory,
                                startPosition: { x: 70, y: 50 },
                                endPosition: { x: 70, y: 50 },
                              },
                            });
                          }}
                          className="px-1 py-0.2 rounded hover:bg-white/20 text-slate-300 hover:text-white"
                          title="Quick Place: Right Stage (X: 70)"
                        >
                          R
                        </button>
                      </div>

                      {/* Delete Actor */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeActor(act.id);
                        }}
                        className="ml-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 p-1 rounded transition-colors"
                        title="Remove from Soundstage"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Add Subject Popover with fixed elevation above viewport */}
          <div className="relative flex items-center gap-1 shrink-0 font-mono text-[9px] z-40">
            <button
              onClick={() => setIsAddSubjectOpen(!isAddSubjectOpen)}
              className="flex items-center gap-1.5 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 px-2.5 py-1 font-bold transition-all shadow-sm"
              title="Add New Subject or Prop to Soundstage"
            >
              <Plus className="h-3 w-3 text-amber-400" />
              <span>Add Subject</span>
            </button>

            {isAddSubjectOpen && (
              <>
                {/* Backdrop to auto-close when clicking outside */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsAddSubjectOpen(false)}
                />

                <div className="absolute right-0 bottom-full mb-2 w-72 rounded-xl bg-[#0d1019]/95 border border-white/20 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.9)] z-50 space-y-2.5 backdrop-blur-xl ring-1 ring-white/10">
                  <div className="flex items-center justify-between font-bold text-[10px] text-slate-300 uppercase tracking-wider px-1 border-b border-white/10 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Plus className="h-3 w-3 text-amber-400" />
                      Add To Soundstage
                    </span>
                    <button
                      onClick={() => setIsAddSubjectOpen(false)}
                      className="text-slate-400 hover:text-white text-xs px-1 hover:bg-white/10 rounded transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 1-Click Open Full 3D Asset Library */}
                  <button
                    onClick={() => {
                      setIsAddSubjectOpen(false);
                      openAssetLibrary();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-2 rounded-lg bg-gradient-to-r from-amber-600/80 to-indigo-600/80 hover:from-amber-500 hover:to-indigo-500 text-white font-bold text-[10px] shadow border border-amber-400/30 transition-all"
                    title="Open 3D Asset Library to browse AI-Reasoned multi-part models"
                  >
                    <Box className="h-3.5 w-3.5 text-amber-300" />
                    <span>Browse 3D Asset Library (AI-Reasoned)</span>
                  </button>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <button
                    onClick={() => {
                      addActor(undefined, 'human');
                      setIsAddSubjectOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5 hover:bg-blue-600/30 text-slate-200 hover:text-blue-300 transition-colors text-left"
                  >
                    <span>👤</span>
                    <span>Person</span>
                  </button>
                  <button
                    onClick={() => {
                      addActor(undefined, 'car');
                      setIsAddSubjectOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5 hover:bg-amber-600/30 text-slate-200 hover:text-amber-300 transition-colors text-left"
                  >
                    <span>🚗</span>
                    <span>Car</span>
                  </button>
                  <button
                    onClick={() => {
                      addActor('Spaceship', 'spaceship', 'a sleek futuristic sci-fi starship with glowing ion thrusters');
                      setIsAddSubjectOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5 hover:bg-indigo-600/30 text-slate-200 hover:text-indigo-300 transition-colors text-left"
                  >
                    <span>🚀</span>
                    <span>Spaceship</span>
                  </button>
                  <button
                    onClick={() => {
                      addActor(undefined, 'tree');
                      setIsAddSubjectOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5 hover:bg-emerald-600/30 text-slate-200 hover:text-emerald-300 transition-colors text-left"
                  >
                    <span>🌲</span>
                    <span>Tree</span>
                  </button>
                  <button
                    onClick={() => {
                      addActor(undefined, 'table');
                      setIsAddSubjectOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5 hover:bg-orange-600/30 text-slate-200 hover:text-orange-300 transition-colors text-left"
                  >
                    <span>🪑</span>
                    <span>Table</span>
                  </button>
                  <button
                    onClick={() => {
                      addActor('Zodiac Boat', 'boat', 'a black military tactical Zodiac inflatable RIB boat on water');
                      setIsAddSubjectOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5 hover:bg-cyan-600/30 text-slate-200 hover:text-cyan-300 transition-colors text-left"
                  >
                    <span>🚤</span>
                    <span>Zodiac Boat</span>
                  </button>
                  <button
                    onClick={() => {
                      addActor('Helicopter', 'helicopter', 'a cinematic utility helicopter with spinning rotors');
                      setIsAddSubjectOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5 hover:bg-sky-600/30 text-slate-200 hover:text-sky-300 transition-colors text-left"
                  >
                    <span>🚁</span>
                    <span>Helicopter</span>
                  </button>
                  <button
                    onClick={() => {
                      addActor(undefined, 'chair');
                      setIsAddSubjectOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5 hover:bg-purple-600/30 text-slate-200 hover:text-purple-300 transition-colors text-left"
                  >
                    <span>💺</span>
                    <span>Chair</span>
                  </button>
                  <button
                    onClick={() => {
                      addActor(undefined, 'prop');
                      setIsAddSubjectOpen(false);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5 hover:bg-cyan-600/30 text-slate-200 hover:text-cyan-300 transition-colors text-left"
                  >
                    <span>📦</span>
                    <span>Crate Prop</span>
                  </button>
                </div>
                {/* Custom object input */}
                <div className="flex items-center gap-1 pt-1.5 border-t border-white/10">
                  <input
                    type="text"
                    placeholder="Custom: Zodiac, Sports Car, Drone, Crate..."
                    value={customBottomObjName}
                    onChange={(e) => setCustomBottomObjName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customBottomObjName.trim()) {
                        addActor(customBottomObjName.trim(), customBottomObjName.trim().toLowerCase());
                        setCustomBottomObjName('');
                        setIsAddSubjectOpen(false);
                      }
                    }}
                    className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-[9px] text-white placeholder-slate-500 focus:outline-none focus:border-director-gold font-mono"
                  />
                  <button
                    onClick={() => {
                      if (customBottomObjName.trim()) {
                        addActor(customBottomObjName.trim(), customBottomObjName.trim().toLowerCase());
                        setCustomBottomObjName('');
                        setIsAddSubjectOpen(false);
                      }
                    }}
                    disabled={!customBottomObjName.trim()}
                    className="rounded bg-director-gold text-director-darkest font-bold px-2 py-1 text-[9px] disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      )}

      {/* 4. Transport & Media Controls Bar */}
      <div className="flex h-11 items-center justify-between border-b border-white/5 px-4 bg-[#0d0f17] shrink-0">
        <div className="flex items-center gap-2">
          {/* First frame */}
          <button
            onClick={() => {
              setCurrentTime(0);
              if (videoRef.current) videoRef.current.currentTime = 0;
            }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="First frame (Home)"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>

          {/* Back 1s */}
          <button
            onClick={() => stepFrames(-fps)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Back 1 second"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Back 1 Frame */}
          <button
            onClick={() => stepFrames(-1)}
            className="px-1.5 h-6 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-slate-300 hover:text-white transition-colors border border-white/5"
            title="Step Back 1 Frame"
          >
            -1F
          </button>

          {/* Play/Pause Main Button */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-all shadow-md active:scale-95 ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-400 text-black ring-2 ring-amber-400/50'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>

          {/* Forward 1 Frame */}
          <button
            onClick={() => stepFrames(1)}
            className="px-1.5 h-6 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-slate-300 hover:text-white transition-colors border border-white/5"
            title="Step Forward 1 Frame"
          >
            +1F
          </button>

          {/* Forward 1s */}
          <button
            onClick={() => stepFrames(fps)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Forward 1 second"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Last frame */}
          <button
            onClick={() => {
              setCurrentTime(duration);
              if (videoRef.current) videoRef.current.currentTime = duration;
            }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Last frame (End)"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>

          {/* Loop toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
              isLooping ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300'
            }`}
            title={isLooping ? 'Loop Playback: ON' : 'Loop Playback: OFF'}
          >
            <Repeat className="h-3.5 w-3.5" />
          </button>

          {/* Playback speed selector */}
          <div className="flex items-center gap-1 rounded bg-black/40 border border-white/10 p-0.5 font-mono text-[9px]">
            {[0.5, 1.0, 2.0].map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  playbackSpeed === s ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Digital Timecode Display */}
          <div className="flex items-center gap-2 bg-[#090b10] border border-white/10 rounded px-2.5 py-1 font-mono text-[11px] ml-2">
            <span className="text-amber-400 font-bold tracking-wider">
              {formatTimecode(currentTime)}
            </span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">
              {formatTimecode(duration)}
            </span>
          </div>

          <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-slate-300">
            {fps} fps
          </span>
          <span className="font-mono text-[10px] text-slate-400">
            FRAME <strong className="text-white">{Math.round(currentTime * fps)}</strong> / {Math.round(duration * fps)}
          </span>
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          {/* Add Marker Cue */}
          <button
            onClick={handleAddMarker}
            className="flex items-center gap-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 text-slate-300 hover:text-white transition-colors text-[10px] font-mono"
            title="Add Keyframe Cue Marker at Current Time"
          >
            <Plus className="h-3 w-3 text-amber-400" />
            <span>Cue</span>
          </button>

          {/* Snapshot */}
          <button
            onClick={handleTakeSnapshot}
            className="flex items-center gap-1 hover:text-white transition-colors text-xs"
            title="Capture Snapshot Image"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>

          {/* In-App 3D Previs Render & Export */}
          {isRenderingPrevis ? (
            <div className="flex items-center gap-1.5 rounded bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 text-amber-300 font-mono text-[10px]">
              <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
              <span>RENDERING {previsProgress}%</span>
            </div>
          ) : (
            <button
              onClick={() => renderPrevisVideo()}
              className="flex items-center gap-1.5 rounded bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold px-2.5 py-1 text-[10px] font-mono shadow-sm transition-all active:scale-95 cursor-pointer"
              title="Render 3D Previs animatic video directly in-app at 24 FPS"
            >
              <Film className="h-3 w-3" />
              <span>Render 3D Previs</span>
            </button>
          )}

          {previsVideoUrl && !isRenderingPrevis && (
            <a
              href={previsVideoUrl}
              download={`${shot.name.replace(/\s+/g, '_')}_3D_Previs.mp4`}
              className="flex items-center gap-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-200 px-2.5 py-1 text-[10px] font-mono transition-all font-semibold"
              title="Download rendered 3D Previs MP4 to your computer"
            >
              <Download className="h-3 w-3" />
              <span>Previs MP4</span>
            </a>
          )}

          {/* Volume */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (!nextMuted && volume === 0) setVolume(50);
              }}
              className="text-slate-400 hover:text-white transition-colors"
              title={isMuted || volume === 0 ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-3.5 w-3.5 text-rose-400" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-slate-300" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                if (v > 0 && isMuted) setIsMuted(false);
                if (videoRef.current) {
                  videoRef.current.volume = v / 100;
                  videoRef.current.muted = v === 0;
                }
              }}
              className="w-16 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-500"
              title={`Volume: ${isMuted ? 0 : volume}%`}
            />
          </div>
        </div>
      </div>

      {/* 5. Cinema Filmstrip Timeline with Interactive Scrubbing & Trim Handles */}
      <div className="flex flex-col bg-[#0a0c12] p-2.5 shrink-0 space-y-1.5 border-t border-white/5">
        {/* Dynamic Time Ruler based on duration */}
        <div className="relative h-4 w-full select-none">
          <div className="absolute inset-0 flex justify-between font-mono text-[9px] text-slate-500 px-1 pointer-events-none">
            {rulerTicks.map((tick, i) => (
              <div key={i} className="flex flex-col items-center">
                <span>{tick.label}</span>
                <div className="h-1 w-[1px] bg-slate-700 mt-0.5" />
              </div>
            ))}
          </div>
        </div>

        {/* Filmstrip Clip Box with Interactive Scrubbing Track */}
        <div
          ref={timelineRef}
          onPointerDown={handleTimelinePointerDown}
          onPointerMove={handleTimelinePointerMove}
          onPointerUp={handleTimelinePointerUp}
          onPointerCancel={handleTimelinePointerUp}
          className="relative h-14 w-full rounded-md bg-[#131620] border border-white/10 overflow-hidden cursor-crosshair select-none touch-none"
        >
          {/* Filmstrip Frame Thumbnails - 100% Offline Procedural Cinema Strip */}
          <div className="absolute inset-0 flex opacity-60 pointer-events-none select-none">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 border-r border-black/70 bg-gradient-to-b from-[#181c28] via-[#10131d] to-[#181c28] relative flex flex-col justify-between p-1 overflow-hidden"
              >
                {/* Top sprocket hole */}
                <div className="flex justify-between items-center">
                  <div className="w-1.5 h-1 rounded-[1px] bg-black/80 border border-white/10" />
                  <span className="font-mono text-[7px] text-slate-600 font-bold select-none">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="w-1.5 h-1 rounded-[1px] bg-black/80 border border-white/10" />
                </div>
                {/* Center frame visual placeholder */}
                <div className="h-4 rounded border border-white/5 bg-gradient-to-r from-blue-950/20 via-indigo-900/20 to-blue-950/20 flex items-center justify-center">
                  <div className="w-6 h-0.5 rounded bg-white/10" />
                </div>
                {/* Bottom sprocket hole */}
                <div className="flex justify-between items-center">
                  <div className="w-1.5 h-1 rounded-[1px] bg-black/80 border border-white/10" />
                  <div className="h-0.5 w-2 bg-white/5" />
                  <div className="w-1.5 h-1 rounded-[1px] bg-black/80 border border-white/10" />
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Selected Clip Range with Working Trim Handles */}
          <div
            className="absolute top-0 bottom-0 rounded border-2 border-blue-500 bg-blue-500/20 flex items-center justify-between px-1 pointer-events-none"
            style={{
              left: `${trimStartPct}%`,
              width: `${trimEndPct - trimStartPct}%`,
            }}
          >
            {/* Left Trim Handle */}
            <div
              data-trim-handle="true"
              onPointerDown={(e) => handleTrimPointerDown(e, 'left')}
              onPointerMove={(e) => handleTrimPointerMove(e, 'left')}
              onPointerUp={(e) => handleTrimPointerUp(e, 'left')}
              onPointerCancel={(e) => handleTrimPointerUp(e, 'left')}
              className="h-10 w-3 rounded-l bg-blue-400 hover:bg-white cursor-ew-resize flex items-center justify-center shadow-md active:scale-95 pointer-events-auto"
              title={`Trim In Point (${((trimStartPct / 100) * duration).toFixed(1)}s)`}
            >
              <div className="h-4 w-0.5 bg-black/60 rounded" />
            </div>

            <div className="flex items-center gap-2 px-2 pointer-events-none drop-shadow">
              <span className="font-mono text-[10px] font-bold text-white truncate">
                {shotTitle} • {duration}s
              </span>
              {(trimStartPct > 0 || trimEndPct < 100) && (
                <span className="rounded bg-black/70 px-1 py-0.2 font-mono text-[8px] text-amber-300 border border-amber-400/30">
                  IN: {((trimStartPct / 100) * duration).toFixed(1)}s • OUT: {((trimEndPct / 100) * duration).toFixed(1)}s
                </span>
              )}
            </div>

            {/* Right Trim Handle */}
            <div
              data-trim-handle="true"
              onPointerDown={(e) => handleTrimPointerDown(e, 'right')}
              onPointerMove={(e) => handleTrimPointerMove(e, 'right')}
              onPointerUp={(e) => handleTrimPointerUp(e, 'right')}
              onPointerCancel={(e) => handleTrimPointerUp(e, 'right')}
              className="h-10 w-3 rounded-r bg-blue-400 hover:bg-white cursor-ew-resize flex items-center justify-center shadow-md active:scale-95 pointer-events-auto"
              title={`Trim Out Point (${((trimEndPct / 100) * duration).toFixed(1)}s)`}
            >
              <div className="h-4 w-0.5 bg-black/60 rounded" />
            </div>
          </div>

          {/* Timeline User Cue Markers */}
          {markers.map((m) => {
            const mPct = (m.time / duration) * 100;
            return (
              <div
                key={m.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setCurrentTime(m.time);
                  if (videoRef.current) videoRef.current.currentTime = m.time;
                }}
                className="absolute top-1 z-30 flex flex-col items-center cursor-pointer group pointer-events-auto"
                style={{ left: `${mPct}%`, transform: 'translateX(-50%)' }}
                title={`${m.label} (${m.time.toFixed(1)}s)`}
              >
                <div
                  className="h-3 w-3 rotate-45 border border-white shadow-sm transition-transform group-hover:scale-125"
                  style={{ backgroundColor: m.color }}
                />
                <span className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-black/95 px-1 font-mono text-[8px] text-white mt-1 whitespace-nowrap pointer-events-none border border-white/20 shadow-lg">
                  {m.label}
                </span>
              </div>
            );
          })}

          {/* Trajectory Keyframes on Timeline Track */}
          {shot.actors
            .flatMap((a) =>
              (a.trajectory.keyframes || []).map((kf) => ({
                ...kf,
                actorName: a.name,
                actorId: a.id,
              }))
            )
            .map((kf) => {
              const kfPct = (kf.time / duration) * 100;
              const isSelected = kf.actorId === selectedActorId;
              return (
                <div
                  key={kf.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedActorId(kf.actorId);
                    setCurrentTime(kf.time);
                    if (videoRef.current) videoRef.current.currentTime = kf.time;
                  }}
                  className="absolute bottom-1 z-30 flex flex-col items-center cursor-pointer group pointer-events-auto"
                  style={{ left: `${kfPct}%`, transform: 'translateX(-50%)' }}
                  title={`${kf.actorName} Keyframe @ ${kf.time.toFixed(1)}s (X:${kf.position.x}, Y:${kf.position.y})`}
                >
                  <div
                    className={`h-2.5 w-2.5 rotate-45 border shadow-sm transition-transform group-hover:scale-150 ${
                      isSelected
                        ? 'bg-amber-400 border-white scale-125'
                        : 'bg-cyan-400 border-white/70'
                    }`}
                  />
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-black/95 px-1 font-mono text-[8px] text-amber-300 -mt-6 whitespace-nowrap pointer-events-none border border-white/20 shadow-lg">
                    {kf.actorName} @ {kf.time.toFixed(1)}s
                  </span>
                </div>
              );
            })}

          {/* Active Cinema Scrubber Playhead */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-30 transition-transform duration-75"
            style={{
              left: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%`,
              transform: 'translateX(-50%)',
            }}
          >
            {/* Top Scrubber Flag Badge */}
            <div className="flex flex-col items-center">
              <div className="rounded bg-amber-400 px-1 py-0.2 font-mono text-[8px] font-bold text-black shadow-lg flex items-center gap-0.5 border border-amber-300">
                <span>{formatTimecode(currentTime)}</span>
              </div>
              <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-amber-400 -mt-0.5" />
            </div>

            {/* Glowing Vertical Needle Line */}
            <div className="w-0.5 h-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] mx-auto -mt-1" />
          </div>
        </div>

        {/* Hairline Stage Divider */}
        <div className="h-[1px] w-full bg-white/5" />

        {/* Secondary Tool Panel corresponding to activeTool */}
        {activeTool === 'markers' && (
          <div className="flex items-center justify-between bg-[#111420] border border-blue-500/30 rounded-md px-3 py-1.5 font-mono text-[10px]">
            <div className="flex items-center gap-2">
              <span className="text-blue-400 font-bold">Keyframe Markers:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {markers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setCurrentTime(m.time)}
                    className="flex items-center gap-1 rounded bg-white/5 hover:bg-white/10 px-2 py-0.5 text-slate-200 border border-white/10"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                    <span>{m.label}</span>
                    <span className="text-slate-400 text-[9px]">{m.time.toFixed(1)}s</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setMarkers(markers.filter((x) => x.id !== m.id));
                      }}
                      className="ml-1 text-slate-500 hover:text-rose-400"
                    >
                      ×
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                const newMarker: TimelineMarker = {
                  id: `m-${Date.now()}`,
                  time: currentTime,
                  label: `Cue @ ${currentTime.toFixed(1)}s`,
                  color: '#f59e0b',
                };
                setMarkers([...markers, newMarker]);
              }}
              className="rounded bg-blue-600 hover:bg-blue-500 px-2.5 py-1 text-white font-bold transition-colors"
            >
              + Add Marker at {formatTimecode(currentTime)}
            </button>
          </div>
        )}

        {activeTool === 'trim' && (
          <div className="flex items-center justify-between bg-[#111420] border border-blue-500/30 rounded-md px-3 py-1.5 font-mono text-[10px]">
            <div className="flex items-center gap-3">
              <span className="text-blue-400 font-bold">Trim In/Out:</span>
              <span>
                In: <strong className="text-white">{((trimStartPct / 100) * duration).toFixed(2)}s</strong>
              </span>
              <span>
                Out: <strong className="text-white">{((trimEndPct / 100) * duration).toFixed(2)}s</strong>
              </span>
              <span>
                Duration: <strong className="text-emerald-400">{(((trimEndPct - trimStartPct) / 100) * duration).toFixed(2)}s</strong>
              </span>
            </div>
            <button
              onClick={() => {
                setTrimStartPct(0);
                setTrimEndPct(100);
                updateDuration(10);
              }}
              className="rounded bg-white/5 hover:bg-white/10 px-2 py-0.5 text-slate-400 hover:text-white"
            >
              Reset Full
            </button>
          </div>
        )}

        {/* Tool Action Buttons (Trim, Markers) */}
        <div className="flex items-center justify-center gap-2 pt-0.5 font-mono text-[10px]">
          <button
            onClick={() => setActiveTool(activeTool === 'trim' ? null : 'trim')}
            className={`flex items-center gap-1.5 rounded px-3 py-1 font-semibold transition-all ${
              activeTool === 'trim' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white/5 hover:bg-white/10 text-slate-300'
            }`}
            title="Toggle Trim Handles & Duration In/Out"
          >
            <Scissors className="h-3 w-3" />
            <span>Trim Range</span>
          </button>
          <button
            onClick={() => setActiveTool(activeTool === 'markers' ? null : 'markers')}
            className={`flex items-center gap-1.5 rounded px-3 py-1 font-semibold transition-all ${
              activeTool === 'markers' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white/5 hover:bg-white/10 text-slate-300'
            }`}
            title="Toggle Keyframe Cue Markers"
          >
            <Bookmark className="h-3 w-3" />
            <span>Keyframe Cues ({markers.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
