import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { useAssetLibraryStore } from '../stores/useAssetLibraryStore';
import { StagePrevis3D } from './StagePrevis3D';
import { interpolateTrajectoryPosition } from '../engine/trajectoryMath';
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
  Scissors,
  Bookmark,
  Box,
  Repeat,
  Plus,
  Globe,
  Trash2,
  RotateCcw,
  Clock,
} from 'lucide-react';

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
  actorId?: string;
}

interface MotionPrevisStageProps {
  shotTitle?: string;
  activeStep?: 'shot' | 'analyze' | 'plan' | 'export';
}

export const MotionPrevisStage: React.FC<MotionPrevisStageProps> = ({
  shotTitle = 'Shot 01A Tracking In',
  activeStep: _activeStep = 'analyze',
}) => {
  const {
    shot,
    updateDuration,
    removeActor,
    updateActorPositionAtTime,
    updateCameraPositionAtTime,
    selectedActorId,
    setSelectedActorId,
    setActiveDeckTab,
    setReferenceImage,
  } = useShotStore();
  const openAssetLibrary = useAssetLibraryStore((s) => s.openLibrary);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0.0);
  const [activeTool, setActiveTool] = useState<'trim' | 'markers' | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [fps] = useState(24);
  const [isLooping, setIsLooping] = useState(true);

  // Fullscreen support for the entire stage
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const storeSetCurrentTime = useShotStore((s) => s.setCurrentTime);
  const storeSetIsPlaying = useShotStore((s) => s.setIsPlaying);

  useEffect(() => {
    storeSetCurrentTime(currentTime);
  }, [currentTime, storeSetCurrentTime]);

  useEffect(() => {
    storeSetIsPlaying(isPlaying);
  }, [isPlaying, storeSetIsPlaying]);

  useEffect(() => {
    const onTransportPlay = (e: Event) => {
      const detail = (e as CustomEvent<{ time?: number; play?: boolean }>).detail;
      if (detail?.time !== undefined) {
        setCurrentTime(detail.time);
        storeSetCurrentTime(detail.time);
      }
      const nextPlay = detail?.play ?? true;
      setIsPlaying(nextPlay);
      storeSetIsPlaying(nextPlay);
    };
    window.addEventListener('cmpvs:transport-play', onTransportPlay);
    return () => window.removeEventListener('cmpvs:transport-play', onTransportPlay);
  }, [storeSetCurrentTime, storeSetIsPlaying]);

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
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);

  // Trim range state (percentage 0..100)
  const [trimStartPct, setTrimStartPct] = useState(0);
  const [trimEndPct, setTrimEndPct] = useState(100);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingTrimLeft, setIsDraggingTrimLeft] = useState(false);
  const [isDraggingTrimRight, setIsDraggingTrimRight] = useState(false);

  const duration = shot.durationSeconds || 4;
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // Active 24fps Continuous Playback Animation Loop
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
            return inTime;
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

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedActorId && selectedActorId !== '__camera__') {
        removeActor(selectedActorId);
        setSelectedActorId(undefined);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedActorId, removeActor, setSelectedActorId]);

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

  // Dispatch recenter whenever active shot changes to ensure 3D soundstage is immediately centered
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('cmpvs:recenter-stage'));
  }, [shot.id]);

  // Immediate Timeline Pointer Scrubbing
  const scrubToClientX = useCallback(
    (clientX: number) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = Math.min(duration, Math.max(0, pct * duration));
      setCurrentTime(newTime);
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
        return Math.max(0, Math.min(duration, prev + deltaFrames / fps));
      });
    },
    [duration, fps]
  );

  // Add keyframe cue
  const handleAddMarker = () => {
    const id = `m_${Date.now()}`;
    const targetActor =
      selectedActorId && selectedActorId !== '__camera__'
        ? shot.actors.find((a) => a.id === selectedActorId)
        : undefined;
    const markerColor =
      selectedActorId === '__camera__'
        ? shot.camera.color || '#f59e0b'
        : targetActor?.color || '#f59e0b';
    const newMarker: TimelineMarker = {
      id,
      time: Number(currentTime.toFixed(2)),
      label: targetActor
        ? `${targetActor.name} Cue @ ${currentTime.toFixed(1)}s`
        : `Cue @ ${currentTime.toFixed(1)}s`,
      color: markerColor,
      actorId: selectedActorId,
    };
    setMarkers((prev) => [...prev, newMarker]);

    if (selectedActorId === '__camera__') {
      const camPos = shot.camera.movement.startPosition;
      updateCameraPositionAtTime(currentTime, camPos, duration);
    } else if (selectedActorId && targetActor) {
      const pos = interpolateTrajectoryPosition(targetActor.trajectory, currentTime, duration);
      updateActorPositionAtTime(selectedActorId, currentTime, pos, duration);
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

  // Capture Snapshot — grabs the viewfinder canvas
  const handleTakeSnapshot = () => {
    const container = stageContainerRef.current;
    if (!container) return;

    const vf = container.querySelector<HTMLCanvasElement>('canvas[data-role="viewfinder"]');
    if (!vf || vf.width === 0 || vf.height === 0) {
      logger.warn('Snapshot unavailable: switch to Split or Viewfinder mode first.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = vf.width;
    canvas.height = vf.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      ctx.drawImage(vf, 0, 0, vf.width, vf.height);
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
      logger.error('Snapshot failed: the source cannot be read.', err);
    }
  };

  return (
    <div ref={stageContainerRef} className="flex h-full w-full flex-col bg-[#090D16] text-[#F0F3FA] select-none overflow-hidden">
      {/* 1. Unified 3D Previs Stage (Single Three.js Scene -> Dual Viewfinder & Soundstage Viewports + Exposed Toolbar) */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col relative">
        <StagePrevis3D
          externalTime={currentTime}
          isExternalPlaying={isPlaying}
          onTimeChange={(t) => setCurrentTime(t)}
          initialViewMode="split"
          showToolbar={true}
          showBottomTransport={false}
        />
      </div>

      {/* 2. Compact Stage Cast & Environment Selector Strip (Single-Line, Zero Duplicates) */}
      <div className="h-11 shrink-0 border-t border-b border-[#273247] bg-[#0D1320] px-3.5 flex items-center justify-between gap-2.5 overflow-x-auto no-scrollbar z-20">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Direct Environment Location Quick-Access Pill */}
          <button
            onClick={() => setActiveDeckTab('environment')}
            className="flex items-center gap-1.5 rounded-lg bg-[#0F2924] border border-[#20C997]/45 hover:border-[#20C997] px-2.5 py-1 text-[#5CE8BE] hover:text-white transition-all font-mono text-[10.5px] shrink-0"
            title="Click to customize Scene Environment, Weather & Time of Day in Right Inspector"
          >
            <Globe className="h-3 w-3 text-[#20C997]" />
            <span className="font-bold">{shot.environment?.name || 'Soundstage Studio'}</span>
            <span className="text-[#20C997]/60">•</span>
            <span className="text-[#5CE8BE]/90 capitalize">{shot.environment?.timeOfDay || 'noon'}</span>
          </button>

          {/* Active Reference Image Badge */}
          {shot.referenceImage?.previewUrl && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#6658F5]/20 border border-[#6658F5]/45 text-[#C4BEFF] font-mono text-[10.5px] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8E84FF] animate-pulse" />
              <span>Ref Plate</span>
              <button
                onClick={() => setReferenceImage(undefined)}
                className="text-[#98A5BC] hover:text-[#EF5261] ml-0.5 font-bold cursor-pointer"
                title="Detach reference plate from shot"
              >
                ✕
              </button>
            </div>
          )}

          <span className="text-[#273247]">|</span>

          {/* Camera Rig Selection Pill */}
          <button
            onClick={() => {
              setSelectedActorId('__camera__');
              setActiveDeckTab('camera');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[10.5px] transition-all cursor-pointer shrink-0 ${
              selectedActorId === '__camera__'
                ? 'bg-[#F0AE42]/20 border border-[#F0AE42] text-white ring-1 ring-[#F0AE42]'
                : 'bg-[#231B12] border border-[#F0AE42]/35 text-[#F0AE42] hover:bg-[#2F2417]'
            }`}
            title="Select Camera Rig & open Camera & Lens Inspector"
          >
            <Camera className="h-3 w-3 text-[#F0AE42]" />
            <span className="font-semibold text-white">Camera</span>
            <span className="text-[#F0AE42]/90">{shot.camera.lens.focalLength}</span>
          </button>

          {/* Active Stage Cast Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {shot.actors.map((act) => {
              const isSelected = act.id === selectedActorId;
              const icon =
                act.kind === 'cutout' || act.kind === 'standee' || act.kind === 'backdrop'
                  ? '🖼️'
                  : act.kind === 'cube' || act.kind === 'box'
                  ? '⬛'
                  : act.kind === 'cylinder'
                  ? '🏛️'
                  : act.kind === 'plane'
                  ? '📐'
                  : act.kind === 'car'
                  ? '🚗'
                  : act.kind === 'table'
                  ? '🪑'
                  : act.kind === 'tree'
                  ? '🌲'
                  : act.kind === 'chair'
                  ? '💺'
                  : act.kind === 'prop'
                  ? '📦'
                  : '👤';
              return (
                <div
                  key={act.id}
                  onClick={() => {
                    setSelectedActorId(act.id);
                    setActiveDeckTab('staging');
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[10.5px] transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-[#6658F5]/25 border border-[#6658F5] text-white ring-1 ring-[#6658F5]/70 shadow-[0_2px_8px_rgba(102,88,245,0.3)]'
                      : 'bg-[#131C2E] border border-[#273247] text-[#D0D9E8] hover:bg-[#1A2436] hover:text-white'
                  }`}
                  title="Select subject & edit in Cast & Stage Inspector"
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0 border border-white/30"
                    style={{ backgroundColor: act.color || '#eab308' }}
                  />
                  <span>{icon}</span>
                  <span className="font-semibold text-white max-w-[100px] truncate">{act.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeActor(act.id);
                    }}
                    className="ml-0.5 text-[#64748B] hover:text-[#EF5261] transition-colors"
                    title="Remove from Soundstage"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Clean Stage, Add in Inspector & 3D Asset Library */}
        <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10.5px]">
          {shot.actors.length > 1 && (
            <button
              onClick={() => useShotStore.getState().resetActorsToDefaultLead()}
              className="flex items-center gap-1 rounded-lg bg-[#131C2E] hover:bg-[#1A2436] text-[#D0D9E8] hover:text-white border border-[#273247] px-2.5 py-1 transition-all"
              title="Reset soundstage to a single centered Lead Subject"
            >
              <RotateCcw className="h-2.5 w-2.5 text-[#F0AE42]" />
              <span>Clean Stage</span>
            </button>
          )}

          <button
            onClick={() => setActiveDeckTab('staging')}
            className="flex items-center gap-1 rounded-lg bg-[#6658F5]/20 hover:bg-[#6658F5]/35 text-[#C4BEFF] border border-[#6658F5]/45 px-2.5 py-1 font-bold transition-all"
            title="Open Cast & Stage Inspector to add characters, props, or cast pool actors"
          >
            <Plus className="h-3 w-3 text-[#8E84FF]" />
            <span>Add / Cast ({shot.actors.length})</span>
          </button>

          <button
            onClick={() => openAssetLibrary()}
            className="flex items-center gap-1 rounded-lg bg-[#231B12] hover:bg-[#2F2417] text-[#F0AE42] border border-[#F0AE42]/45 px-2.5 py-1 font-bold transition-all"
            title="Browse 3D Asset Library & AI Concept-to-3D Studio"
          >
            <Box className="h-3 w-3 text-[#F0AE42]" />
            <span>3D Library</span>
          </button>
        </div>
      </div>

      {/* 3. Transport, Shot Duration & Timeline Tools Bar */}
      <div className="flex h-10 items-center justify-between border-b border-[#273247] px-3.5 bg-[#121A2A] shrink-0 overflow-x-auto no-scrollbar gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          {/* First frame */}
          <button
            onClick={() => setCurrentTime(0)}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[#1A2436] text-[#98A5BC] hover:text-white transition-colors"
            title="First frame (Home)"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>

          {/* Back 1s */}
          <button
            onClick={() => stepFrames(-fps)}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[#1A2436] text-[#98A5BC] hover:text-white transition-colors"
            title="Back 1 second"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Back 1 Frame */}
          <button
            onClick={() => stepFrames(-1)}
            className="px-1.5 h-6 rounded-md bg-[#090D16] hover:bg-[#1A2436] text-[10px] font-mono text-[#D0D9E8] hover:text-white transition-colors border border-[#273247]"
            title="Step Back 1 Frame"
          >
            -1F
          </button>

          {/* Play/Pause Main Button */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-all shadow-md active:scale-95 ${
              isPlaying
                ? 'bg-[#F0AE42] hover:bg-[#F8BE58] text-[#090D16] ring-2 ring-[#F0AE42]/50'
                : 'bg-gradient-to-b from-[#6658F5] to-[#5243E2] hover:from-[#7467FF] hover:to-[#5E4FF0] text-white shadow-[0_2px_8px_rgba(102,88,245,0.45)]'
            }`}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
          </button>

          {/* Forward 1 Frame */}
          <button
            onClick={() => stepFrames(1)}
            className="px-1.5 h-6 rounded-md bg-[#090D16] hover:bg-[#1A2436] text-[10px] font-mono text-[#D0D9E8] hover:text-white transition-colors border border-[#273247]"
            title="Step Forward 1 Frame"
          >
            +1F
          </button>

          {/* Forward 1s */}
          <button
            onClick={() => stepFrames(fps)}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[#1A2436] text-[#98A5BC] hover:text-white transition-colors"
            title="Forward 1 second"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Last frame */}
          <button
            onClick={() => setCurrentTime(duration)}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[#1A2436] text-[#98A5BC] hover:text-white transition-colors"
            title="Last frame (End)"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>

          {/* Loop toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              isLooping ? 'bg-[#6658F5]/25 text-[#C4BEFF] border border-[#6658F5]/45' : 'text-[#64748B] hover:text-[#D0D9E8]'
            }`}
            title={isLooping ? 'Loop Playback: ON' : 'Loop Playback: OFF'}
          >
            <Repeat className="h-3.5 w-3.5" />
          </button>

          {/* Playback speed selector */}
          <div className="flex items-center gap-0.5 rounded-lg bg-[#090D16] border border-[#273247] p-0.5 font-mono text-[10.5px]">
            {[0.5, 1.0, 2.0].map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className={`px-1.5 py-0.5 rounded-md transition-colors ${
                  playbackSpeed === s ? 'bg-[#6658F5] text-white font-bold' : 'text-[#98A5BC] hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Single Unified Digital Timecode Display */}
          <div className="flex items-center gap-1.5 bg-[#090D16] border border-[#273247] rounded-lg px-2.5 py-0.5 font-mono text-[10.5px] ml-1 shadow-inner">
            <span className="text-[#F0AE42] font-bold tracking-wider">
              {formatTimecode(currentTime)}
            </span>
            <span className="text-[#384764]">/</span>
            <span className="text-[#98A5BC]">
              {formatTimecode(duration)}
            </span>
          </div>

          <span className="font-mono text-[10.5px] text-[#98A5BC]">
            F <strong className="text-white">{Math.round(currentTime * fps)}</strong>/{Math.round(duration * fps)}
          </span>
        </div>

        {/* Center/Right: Shot Duration Control & Timeline Tools */}
        <div className="flex items-center gap-2 text-[#98A5BC] shrink-0 font-mono text-[10px]">
          {/* Shot Duration Control (Restored!) */}
          <div className="flex items-center gap-1 rounded-lg bg-[#090D16] border border-[#273247] px-2 py-0.5 shadow-inner" title="Shot Duration (1s – 10s)">
            <Clock className="h-3 w-3 text-[#F0AE42]" />
            <span className="text-[#98A5BC] text-[9.5px]">Dur:</span>
            <button
              onClick={() => {
                const next = Math.max(1, Math.round((duration - 1) * 2) / 2);
                updateDuration(next);
                if (currentTime > next) setCurrentTime(next);
              }}
              className="px-1 rounded hover:bg-[#1A2436] text-[#D0D9E8] hover:text-white font-bold"
              title="Decrease shot duration by 1s"
            >
              -
            </button>
            <span className="text-white font-bold min-w-[28px] text-center">{duration.toFixed(1)}s</span>
            <button
              onClick={() => {
                const next = Math.min(10, Math.round((duration + 1) * 2) / 2);
                updateDuration(next);
              }}
              className="px-1 rounded hover:bg-[#1A2436] text-[#D0D9E8] hover:text-white font-bold"
              title="Increase shot duration by 1s"
            >
              +
            </button>
          </div>

          {/* Trim Range Drawer Toggle */}
          <button
            onClick={() => setActiveTool(activeTool === 'trim' ? null : 'trim')}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-all text-[10.5px] ${
              activeTool === 'trim'
                ? 'bg-[#6658F5] text-white border border-[#8E84FF]/60 shadow-sm'
                : 'bg-[#131C2E] hover:bg-[#1A2436] text-[#D0D9E8] border border-[#273247]'
            }`}
            title="Toggle Trim In/Out Range Controls"
          >
            <Scissors className="h-3 w-3" />
            <span>Trim</span>
          </button>

          {/* Keyframe Cues Drawer Toggle */}
          <button
            onClick={() => setActiveTool(activeTool === 'markers' ? null : 'markers')}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition-all text-[10.5px] ${
              activeTool === 'markers'
                ? 'bg-[#6658F5] text-white border border-[#8E84FF]/60 shadow-sm'
                : 'bg-[#131C2E] hover:bg-[#1A2436] text-[#D0D9E8] border border-[#273247]'
            }`}
            title="Toggle Timeline Cue Markers"
          >
            <Bookmark className="h-3 w-3" />
            <span>Cues ({markers.length})</span>
          </button>

          {/* Snapshot PNG */}
          <button
            onClick={handleTakeSnapshot}
            className="flex items-center gap-1 rounded-lg bg-[#131C2E] hover:bg-[#1A2436] border border-[#273247] px-2.5 py-1 text-[#D0D9E8] hover:text-white transition-colors text-[10.5px]"
            title="Capture Viewfinder Snapshot PNG"
          >
            <Camera className="h-3 w-3 text-[#18B8D8]" />
            <span>Snap</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="text-[#98A5BC] hover:text-white transition-colors p-1 rounded-lg hover:bg-[#1A2436] cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Toggle Stage Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5 text-[#F0AE42]" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* 4. Cinema Filmstrip Timeline with Interactive Scrubbing & Trim Handles */}
      <div className="flex flex-col bg-[#090D16] px-2.5 py-2 shrink-0 space-y-1.5">
        {/* Dynamic Time Ruler based on duration */}
        <div className="relative h-3.5 w-full select-none">
          <div className="absolute inset-0 flex justify-between font-mono text-[8.5px] text-[#98A5BC] px-1 pointer-events-none">
            {rulerTicks.map((tick, i) => (
              <div key={i} className="flex flex-col items-center">
                <span>{tick.label}</span>
                <div className="h-1 w-[1px] bg-[#384764] mt-0.5" />
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
          className="relative h-12 w-full rounded-lg bg-[#0D1320] border border-[#273247] overflow-hidden cursor-crosshair select-none touch-none shadow-inner"
        >
          {/* Filmstrip Frame Thumbnails */}
          <div className="absolute inset-0 flex opacity-65 pointer-events-none select-none">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 border-r border-[#090D16] bg-gradient-to-b from-[#151F32] via-[#0F1726] to-[#151F32] relative flex flex-col justify-between p-1 overflow-hidden"
              >
                <div className="flex justify-between items-center">
                  <div className="w-1.5 h-1 rounded-[1px] bg-[#090D16] border border-[#273247]" />
                  <span className="font-mono text-[7px] text-[#64748B] font-bold select-none">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="w-1.5 h-1 rounded-[1px] bg-[#090D16] border border-[#273247]" />
                </div>
                <div className="h-3.5 rounded border border-[#273247]/50 bg-gradient-to-r from-[#6658F5]/15 via-[#18B8D8]/10 to-[#6658F5]/15 flex items-center justify-center">
                  <div className="w-6 h-0.5 rounded bg-white/10" />
                </div>
                <div className="flex justify-between items-center">
                  <div className="w-1.5 h-1 rounded-[1px] bg-[#090D16] border border-[#273247]" />
                  <div className="h-0.5 w-2 bg-white/5" />
                  <div className="w-1.5 h-1 rounded-[1px] bg-[#090D16] border border-[#273247]" />
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Selected Clip Range with Working Trim Handles */}
          <div
            className="absolute top-0 bottom-0 rounded-md border-2 border-[#6658F5] bg-[#6658F5]/20 flex items-center justify-between px-1 pointer-events-none"
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
              className="h-9 w-2.5 rounded-l bg-[#8E84FF] hover:bg-white cursor-ew-resize flex items-center justify-center shadow-md active:scale-95 pointer-events-auto"
              title={`Trim In Point (${((trimStartPct / 100) * duration).toFixed(1)}s)`}
            >
              <div className="h-3.5 w-0.5 bg-black/60 rounded" />
            </div>

            <div className="flex items-center gap-2 px-2 pointer-events-none drop-shadow">
              <span className="font-mono text-[10px] font-bold text-white truncate">
                {shot.name || shotTitle} • {duration}s
              </span>
              {(trimStartPct > 0 || trimEndPct < 100) && (
                <span className="rounded bg-[#090D16]/85 px-1.5 py-0.2 font-mono text-[8px] text-[#F0AE42] border border-[#F0AE42]/35">
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
              className="h-9 w-2.5 rounded-r bg-[#8E84FF] hover:bg-white cursor-ew-resize flex items-center justify-center shadow-md active:scale-95 pointer-events-auto"
              title={`Trim Out Point (${((trimEndPct / 100) * duration).toFixed(1)}s)`}
            >
              <div className="h-3.5 w-0.5 bg-black/60 rounded" />
            </div>
          </div>

          {/* Timeline User Cue Markers */}
          {markers.map((m) => {
            const mPct = (m.time / duration) * 100;
            const liveActorColor =
              m.actorId === '__camera__'
                ? shot.camera.color
                : m.actorId
                ? shot.actors.find((a) => a.id === m.actorId)?.color
                : undefined;
            const effectiveMarkerColor = liveActorColor || m.color || '#f59e0b';
            return (
              <div
                key={m.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (m.actorId) setSelectedActorId(m.actorId);
                  setCurrentTime(m.time);
                }}
                className="absolute top-1 z-30 flex flex-col items-center cursor-pointer group pointer-events-auto"
                style={{ left: `${mPct}%`, transform: 'translateX(-50%)' }}
                title={`${m.label} (${m.time.toFixed(1)}s)`}
              >
                <div
                  className="h-3 w-3 rotate-45 border border-white shadow-sm transition-transform group-hover:scale-125"
                  style={{ backgroundColor: effectiveMarkerColor }}
                />
                <span
                  className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-[#090D16]/95 px-1 font-mono text-[8px] text-white mt-1 whitespace-nowrap pointer-events-none border border-[#273247] shadow-lg"
                  style={{ borderColor: effectiveMarkerColor, color: effectiveMarkerColor }}
                >
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
                actorColor: a.color,
              }))
            )
            .map((kf) => {
              const kfPct = (kf.time / duration) * 100;
              const isSelected = kf.actorId === selectedActorId;
              const cueColor = kf.actorColor || (isSelected ? '#F0AE42' : '#18B8D8');
              return (
                <div
                  key={kf.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedActorId(kf.actorId);
                    setCurrentTime(kf.time);
                  }}
                  className="absolute bottom-1 z-30 flex flex-col items-center cursor-pointer group pointer-events-auto"
                  style={{ left: `${kfPct}%`, transform: 'translateX(-50%)' }}
                  title={`${kf.actorName} Keyframe @ ${kf.time.toFixed(1)}s (X:${kf.position.x}, Y:${kf.position.y})`}
                >
                  <div
                    className={`h-2.5 w-2.5 rotate-45 border shadow-sm transition-transform group-hover:scale-150 ${
                      isSelected ? 'border-white scale-125' : 'border-white/70'
                    }`}
                    style={{ backgroundColor: cueColor }}
                  />
                  <span
                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-[#090D16]/95 px-1 font-mono text-[8px] -mt-6 whitespace-nowrap pointer-events-none border shadow-lg"
                    style={{ color: cueColor, borderColor: cueColor }}
                  >
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
            <div className="flex flex-col items-center">
              <div className="rounded bg-[#F0AE42] px-1 py-0.2 font-mono text-[8.5px] font-bold text-[#090D16] shadow-lg flex items-center gap-0.5 border border-[#F8CA78]">
                <span>{currentTime.toFixed(2)}s</span>
              </div>
              <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-[#F0AE42] -mt-0.5" />
            </div>
            <div className="w-0.5 h-full bg-[#F0AE42] shadow-[0_0_8px_rgba(240,174,66,0.85)] mx-auto -mt-1" />
          </div>
        </div>

        {/* Collapsible Secondary Tool Drawers (Trim Range / Keyframe Cues) */}
        {activeTool === 'markers' && (
          <div className="flex items-center justify-between bg-[#121A2A] border border-[#6658F5]/40 rounded-lg px-3 py-1.5 font-mono text-[10px]">
            <div className="flex items-center gap-2">
              <span className="text-[#C4BEFF] font-bold">Keyframe Cues:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {markers.length === 0 && (
                  <span className="text-[#98A5BC] text-[9.5px]">No cues placed yet</span>
                )}
                {markers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setCurrentTime(m.time)}
                    className="flex items-center gap-1 rounded-md bg-[#1A2436] hover:bg-[#223047] px-2 py-0.5 text-[#F0F3FA] border border-[#273247]"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: (m.actorId === '__camera__' ? shot.camera.color : m.actorId ? shot.actors.find((a) => a.id === m.actorId)?.color : undefined) || m.color }} />
                    <span>{m.label}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setMarkers(markers.filter((x) => x.id !== m.id));
                      }}
                      className="ml-1 text-[#98A5BC] hover:text-[#EF5261]"
                    >
                      ×
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleAddMarker}
              className="rounded-lg bg-[#6658F5] hover:bg-[#7669FF] px-2.5 py-0.5 text-white font-bold transition-colors text-[10.5px]"
            >
              + Add Cue @ {currentTime.toFixed(1)}s
            </button>
          </div>
        )}

        {activeTool === 'trim' && (
          <div className="flex items-center justify-between bg-[#121A2A] border border-[#6658F5]/40 rounded-lg px-3 py-1.5 font-mono text-[10px]">
            <div className="flex items-center gap-3">
              <span className="text-[#C4BEFF] font-bold">Trim Range:</span>
              <span>
                In: <strong className="text-white">{((trimStartPct / 100) * duration).toFixed(2)}s</strong>
              </span>
              <span>
                Out: <strong className="text-white">{((trimEndPct / 100) * duration).toFixed(2)}s</strong>
              </span>
              <span>
                Active Span: <strong className="text-[#20C997]">{(((trimEndPct - trimStartPct) / 100) * duration).toFixed(2)}s</strong>
              </span>
            </div>
            <button
              onClick={() => {
                setTrimStartPct(0);
                setTrimEndPct(100);
              }}
              className="rounded-md bg-[#1A2436] hover:bg-[#223047] border border-[#273247] px-2 py-0.5 text-[#D0D9E8] hover:text-white text-[9.5px]"
            >
              Reset Full ({duration.toFixed(1)}s)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
