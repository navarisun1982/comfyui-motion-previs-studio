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
  Scissors,
  Bookmark,
  Filter,
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

export type CinematicFilter = 'standard' | 'teal-orange' | 'noir' | 'cyberpunk' | 'bleach';

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

const SAMPLE_PLATES = [
  {
    name: 'Arrival: City Night (35mm)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
  {
    name: 'Sci-Fi Corridor Dolly (24mm)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
  {
    name: 'Atmospheric Tracking (50mm)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
  },
];

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
  const [activeTool, setActiveTool] = useState<'trim' | 'markers' | 'filters' | null>('trim');
  const [volume, setVolume] = useState(80);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [fps] = useState(24);
  const [isLooping, setIsLooping] = useState(true);
  const [colorFilter, setColorFilter] = useState<CinematicFilter>('standard');
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

  // Interactive timeline markers
  const [markers, setMarkers] = useState<TimelineMarker[]>([
    { id: 'm1', time: 1.5, label: 'Camera Dolly In', color: '#3b82f6' },
    { id: 'm2', time: 4.8, label: 'Subject Action Cue', color: '#10b981' },
  ]);

  // Trim range state (percentage 0..100)
  const [trimStartPct, setTrimStartPct] = useState(0);
  const [trimEndPct, setTrimEndPct] = useState(100);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingTrimLeft, setIsDraggingTrimLeft] = useState(false);
  const [isDraggingTrimRight, setIsDraggingTrimRight] = useState(false);

  const duration = shot.durationSeconds || 10;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const proceduralCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Canvases for the 5 lower pass tiles
  const poseActorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const edgesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const masksCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseAllCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1. Procedural animated cinematic frame fallback generator
  const drawProceduralCinematicFrame = useCallback(
    (t: number, targetCtx: CanvasRenderingContext2D, w: number, h: number) => {
      targetCtx.save();

      // Atmospheric dark street background
      const grad = targetCtx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#090b14');
      grad.addColorStop(0.4, '#171d2b');
      grad.addColorStop(0.65, '#0b0d12');
      grad.addColorStop(1, '#050608');
      targetCtx.fillStyle = grad;
      targetCtx.fillRect(0, 0, w, h);

      // Distant wet street reflections
      const roadY = h * 0.62;
      targetCtx.fillStyle = '#0f121a';
      targetCtx.fillRect(0, roadY, w, h - roadY);

      // Rain streaks
      targetCtx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      targetCtx.lineWidth = 1;
      const seed = Math.floor(t * 24);
      for (let i = 0; i < 40; i++) {
        const rx = ((i * 37 + seed * 23) % w);
        const ry = ((i * 19 + seed * 47) % (h * 0.8));
        targetCtx.beginPath();
        targetCtx.moveTo(rx, ry);
        targetCtx.lineTo(rx - 2, ry + 12);
        targetCtx.stroke();
      }

      // Streetlights and warm bokeh
      const lightX = [w * 0.25, w * 0.75, w * 0.5];
      const lightY = [h * 0.45, h * 0.45, h * 0.35];
      lightX.forEach((lx, idx) => {
        const radGrad = targetCtx.createRadialGradient(lx, lightY[idx], 2, lx, lightY[idx], 40);
        radGrad.addColorStop(0, 'rgba(245, 158, 11, 0.7)');
        radGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.15)');
        radGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
        targetCtx.fillStyle = radGrad;
        targetCtx.beginPath();
        targetCtx.arc(lx, lightY[idx], 40, 0, Math.PI * 2);
        targetCtx.fill();
      });

      // Animated character walking / moving along depth
      const charProgress = duration > 0 ? (t / duration) : 0;
      const charScale = 0.5 + charProgress * 0.5; // perspective dolly-in
      const cx = w * 0.5 + Math.sin(t * 2) * 8;
      const cy = roadY + (charProgress * (h * 0.15));
      const charH = 70 * charScale;
      const charW = 24 * charScale;

      // Silhouette Trenchcoat & Hat
      targetCtx.fillStyle = '#06080d';
      targetCtx.beginPath();
      // Head
      targetCtx.arc(cx, cy - charH + charH * 0.15, charW * 0.35, 0, Math.PI * 2);
      targetCtx.fill();
      // Shoulders / Torso
      targetCtx.fillRect(cx - charW * 0.6, cy - charH * 0.75, charW * 1.2, charH * 0.75);
      // Legs
      const stride = Math.sin(t * 8) * (10 * charScale);
      targetCtx.fillRect(cx - charW * 0.4, cy, charW * 0.3, charH * 0.3 + stride);
      targetCtx.fillRect(cx + charW * 0.1, cy, charW * 0.3, charH * 0.3 - stride);

      // Apply selected cinematic LUT tint
      if (colorFilter === 'teal-orange') {
        targetCtx.fillStyle = 'rgba(14, 165, 233, 0.12)';
        targetCtx.fillRect(0, 0, w, h);
      } else if (colorFilter === 'noir') {
        targetCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        targetCtx.fillRect(0, 0, w, h);
      } else if (colorFilter === 'cyberpunk') {
        targetCtx.fillStyle = 'rgba(217, 70, 239, 0.12)';
        targetCtx.fillRect(0, 0, w, h);
      } else if (colorFilter === 'bleach') {
        targetCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        targetCtx.fillRect(0, 0, w, h);
      }

      targetCtx.restore();
    },
    [duration, colorFilter]
  );

  // 2. Real-time Multi-pass Render Loop (Pose, Depth, Edges, Masks, Pose All)
  const lastPassRenderRef = useRef<number>(0);
  const updateAllPassCanvases = useCallback(
    (force: boolean = false) => {
      // In 3D Construct mode, CV passes are not mounted; skip heavy Sobel filter
      if (isConstruct3D) return;

      const now = performance.now();
      if (!force && now - lastPassRenderRef.current < 120) {
        return; // throttle CV computation to maintain 60fps UI
      }
      lastPassRenderRef.current = now;

      const w = 320;
      const h = 180;

      let sourceElement: HTMLVideoElement | HTMLCanvasElement;
      if (videoRef.current && !videoRef.current.paused && videoRef.current.readyState >= 2) {
        sourceElement = videoRef.current;
      } else {
        if (!proceduralCanvasRef.current) {
          proceduralCanvasRef.current = document.createElement('canvas');
          proceduralCanvasRef.current.width = w;
          proceduralCanvasRef.current.height = h;
        }
        const pCtx = proceduralCanvasRef.current.getContext('2d');
        if (pCtx) {
          drawProceduralCinematicFrame(currentTime, pCtx, w, h);
        }
        sourceElement = proceduralCanvasRef.current;

        if (onscreenCanvasRef.current) {
          const onCtx = onscreenCanvasRef.current.getContext('2d');
          if (onCtx) {
            drawProceduralCinematicFrame(currentTime, onCtx, onscreenCanvasRef.current.width, onscreenCanvasRef.current.height);
          }
        }
      }

      const offCanvas = document.createElement('canvas');
      offCanvas.width = w;
      offCanvas.height = h;
      const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
      if (!offCtx) return;

      offCtx.drawImage(sourceElement, 0, 0, w, h);
      const frameData = offCtx.getImageData(0, 0, w, h);

      if (poseActorCanvasRef.current) {
        const pCanvas = generatePoseOverlayCanvas(sourceElement, w, h);
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
    [isConstruct3D, currentTime, drawProceduralCinematicFrame]
  );

  // 3. Active 24fps Continuous Playback Animation Loop
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const isLoopingRef = useRef(isLooping);
  isLoopingRef.current = isLooping;

  useEffect(() => {
    if (!isPlaying) return;

    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const delta = ((now - lastTime) / 1000) * playbackSpeedRef.current;
      lastTime = now;

      setCurrentTime((prev) => {
        const next = prev + delta;
        if (next >= durationRef.current) {
          if (isLoopingRef.current) {
            return 0; // seamless loop
          } else {
            setIsPlaying(false);
            return durationRef.current;
          }
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

  // Sync Video Element Play/Pause and Time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.playbackRate = playbackSpeed;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, playbackSpeed]);

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

  // Handle Video File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    updateVfxReference({
      enabled: true,
      videoUrl: url,
      fileName: file.name,
    });

    if (videoRef.current) {
      videoRef.current.src = url;
      videoRef.current.load();
      videoRef.current.onloadeddata = async () => {
        updateAllPassCanvases(true);
        try {
          const result = await analyzeVideoPlate(videoRef.current!);
          setCameraMovement(result.detectedCameraMovement, result.detectedSpeed);
        } catch (err) {
          console.error('Auto analysis error:', err);
        }
      };
    }
  };

  // Switch to Sample Plate
  const handleSelectSample = (sample: (typeof SAMPLE_PLATES)[0]) => {
    updateVfxReference({
      enabled: true,
      videoUrl: sample.url,
      fileName: sample.name,
    });
    if (videoRef.current) {
      videoRef.current.src = sample.url;
      videoRef.current.load();
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

  // Capture Snapshot
  const handleTakeSnapshot = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawProceduralCinematicFrame(currentTime, ctx, 1920, 1080);
      canvas.toBlob((blob) => {
        if (blob) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `directors_snapshot_${shotTitle.replace(/\s+/g, '_')}_${currentTime.toFixed(2)}s.jpg`;
          a.click();
        }
      }, 'image/jpeg', 0.95);
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
        <div className="relative flex flex-col h-full w-full rounded-lg bg-[#000000] border border-white/10 overflow-hidden min-h-0 min-w-0 group">
          {/* Badge */}
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
          {!isConstruct3D && (
            <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
              <select
                onChange={(e) => {
                  const sample = SAMPLE_PLATES.find((s) => s.name === e.target.value);
                  if (sample) handleSelectSample(sample);
                }}
                defaultValue=""
                className="rounded bg-black/70 border border-white/15 px-2 py-0.5 font-mono text-[9px] text-slate-300 cursor-pointer"
              >
                <option value="" disabled>Load Demo Plate...</option>
                {SAMPLE_PLATES.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
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
                muted
                playsInline
                className="h-full w-full object-cover"
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
              <div className="relative h-full w-full flex items-center justify-center">
                <canvas
                  ref={onscreenCanvasRef}
                  width={640}
                  height={360}
                  className="h-full w-full object-cover"
                />
                <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2">
                  <button
                    onClick={() => handleSelectSample(SAMPLE_PLATES[0])}
                    className="flex items-center gap-1 rounded bg-teal-600/90 hover:bg-teal-600 px-2.5 py-1 font-mono text-[9px] font-bold text-white shadow-md transition-all"
                  >
                    <Film className="h-3 w-3" />
                    Load Demo Film Plate
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 rounded bg-white/10 hover:bg-white/20 px-2.5 py-1 font-mono text-[9px] text-slate-300 transition-all"
                  >
                    <Upload className="h-3 w-3" />
                    Upload MP4
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
        <div className="h-28 shrink-0 border-t border-b border-white/10 bg-[#06070a] p-1">
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
                    placeholder="Custom: Zodiac, Car, زودياك, سيارة..."
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
            <Volume2 className="h-3.5 w-3.5" />
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                if (videoRef.current) videoRef.current.volume = v / 100;
              }}
              className="w-16 h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-500"
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
          {/* Filmstrip Frame Thumbnails */}
          <div className="absolute inset-0 flex opacity-40 pointer-events-none">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 border-r border-black/50 bg-cover bg-center"
                style={{
                  backgroundImage: `url(https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=120&q=60)`,
                }}
              />
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

        {activeTool === 'filters' && (
          <div className="flex items-center justify-between bg-[#111420] border border-blue-500/30 rounded-md px-3 py-1.5 font-mono text-[10px]">
            <span className="text-blue-400 font-bold">Cinematic Color Grade LUT:</span>
            <div className="flex items-center gap-1.5">
              {[
                { id: 'standard', name: 'Rec.709 Standard' },
                { id: 'teal-orange', name: 'Teal & Orange' },
                { id: 'noir', name: 'Film Noir 1940s' },
                { id: 'cyberpunk', name: 'Cyberpunk Neon' },
                { id: 'bleach', name: 'Bleach Bypass' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setColorFilter(f.id as CinematicFilter)}
                  className={`rounded px-2.5 py-1 transition-all ${
                    colorFilter === f.id
                      ? 'bg-blue-600 text-white font-bold shadow-sm'
                      : 'bg-white/5 text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
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

        {/* Tool Action Buttons (Trim, Markers, Filters) */}
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
          <button
            onClick={() => setActiveTool(activeTool === 'filters' ? null : 'filters')}
            className={`flex items-center gap-1.5 rounded px-3 py-1 font-semibold transition-all ${
              activeTool === 'filters' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white/5 hover:bg-white/10 text-slate-300'
            }`}
            title="Toggle Cinematic Color Grade LUT"
          >
            <Filter className="h-3 w-3" />
            <span>Color LUT</span>
          </button>
        </div>
      </div>
    </div>
  );
};
