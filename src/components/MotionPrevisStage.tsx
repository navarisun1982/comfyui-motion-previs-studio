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
    moveActorKeyframeTime,
    moveCameraKeyframeTime,
    removeActorKeyframe,
    removeCameraKeyframe,
    scaleActorCuesInRange,
    applyActorMotionCurve,
    updateVfxReference,
    selectedActorId,
    setSelectedActorId,
    setActiveDeckTab,
    setReferenceImage,
    stagingMoveMode,
    setStagingMoveMode,
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
  const [draggingTimelineCue, setDraggingTimelineCue] = useState<
    | { kind: 'actor-cue'; actorId: string; cueId: string; origTime: number; grabOffsetSec?: number }
    | { kind: 'camera-cue'; cueId: string; origTime: number; grabOffsetSec?: number }
    | { kind: 'marker'; markerId: string; origTime: number; grabOffsetSec?: number }
    | {
        kind: 'actor-span';
        actorId: string;
        side: 'start' | 'end' | 'move';
        initialStart: number;
        initialEnd: number;
        startClientX: number;
        initialTimesById: Record<string, number>;
      }
    | null
  >(null);

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

  // Dispatch recenter and reset shot-local timeline state whenever active shot changes
  useEffect(() => {
    setMarkers([]);
    setTrimStartPct(0);
    setTrimEndPct(100);
    setCurrentTime(0);
    setIsPlaying(false);
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
    if ((e.target as HTMLElement).closest('[data-trim-handle]') || (e.target as HTMLElement).closest('[data-cue-handle]')) return;
    e.preventDefault();
    timelineRef.current?.setPointerCapture(e.pointerId);
    setIsDraggingPlayhead(true);
    scrubToClientX(e.clientX);
  };

  const handleTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingTimelineCue && timelineRef.current) {
      e.preventDefault();
      const rect = timelineRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const rawPointerTime = pct * duration;

      if (draggingTimelineCue.kind === 'actor-cue') {
        const newTime = Number(
          Math.min(duration, Math.max(0, rawPointerTime + (draggingTimelineCue.grabOffsetSec || 0))).toFixed(2)
        );
        moveActorKeyframeTime(draggingTimelineCue.actorId, draggingTimelineCue.cueId, newTime);
        setCurrentTime(newTime);
      } else if (draggingTimelineCue.kind === 'camera-cue') {
        const newTime = Number(
          Math.min(duration, Math.max(0, rawPointerTime + (draggingTimelineCue.grabOffsetSec || 0))).toFixed(2)
        );
        moveCameraKeyframeTime(draggingTimelineCue.cueId, newTime);
        setCurrentTime(newTime);
      } else if (draggingTimelineCue.kind === 'marker') {
        const newTime = Number(
          Math.min(duration, Math.max(0, rawPointerTime + (draggingTimelineCue.grabOffsetSec || 0))).toFixed(2)
        );
        setMarkers((prev) =>
          prev.map((m) =>
            m.id === draggingTimelineCue.markerId
              ? {
                  ...m,
                  time: newTime,
                  label: m.label.replace(/@\s*[\d.]+s/, `@ ${newTime.toFixed(1)}s`),
                }
              : m
          )
        );
        setCurrentTime(newTime);
      } else if (draggingTimelineCue.kind === 'actor-span') {
        const targetAct = shot.actors.find((a) => a.id === draggingTimelineCue.actorId);
        const kfs = targetAct?.trajectory.keyframes || [];
        if (kfs.length >= 2) {
          const initStart = draggingTimelineCue.initialStart;
          const initEnd = draggingTimelineCue.initialEnd;
          const deltaSec = ((e.clientX - draggingTimelineCue.startClientX) / rect.width) * duration;
          if (draggingTimelineCue.side === 'start') {
            const nextStart = Math.max(0, Math.min(initEnd - 0.3, initStart + deltaSec));
            scaleActorCuesInRange(
              draggingTimelineCue.actorId,
              initStart,
              initEnd,
              Number(nextStart.toFixed(2)),
              initEnd,
              draggingTimelineCue.initialTimesById
            );
            setCurrentTime(Number(nextStart.toFixed(2)));
          } else if (draggingTimelineCue.side === 'end') {
            const nextEnd = Math.max(initStart + 0.3, Math.min(duration, initEnd + deltaSec));
            scaleActorCuesInRange(
              draggingTimelineCue.actorId,
              initStart,
              initEnd,
              initStart,
              Number(nextEnd.toFixed(2)),
              draggingTimelineCue.initialTimesById
            );
            setCurrentTime(Number(nextEnd.toFixed(2)));
          } else if (draggingTimelineCue.side === 'move') {
            const spanLen = initEnd - initStart;
            const nextStart = Math.max(0, Math.min(duration - spanLen, initStart + deltaSec));
            const nextEnd = Math.min(duration, nextStart + spanLen);
            scaleActorCuesInRange(
              draggingTimelineCue.actorId,
              initStart,
              initEnd,
              Number(nextStart.toFixed(2)),
              Number(nextEnd.toFixed(2)),
              draggingTimelineCue.initialTimesById
            );
          }
        }
      }
      return;
    }
    if (isDraggingPlayhead) {
      e.preventDefault();
      scrubToClientX(e.clientX);
    }
  };

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingTimelineCue) {
      setDraggingTimelineCue(null);
      try {
        timelineRef.current?.releasePointerCapture(e.pointerId);
      } catch {}
    }
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
      const nextStart = Math.min(trimEndPct - 2, Math.max(0, pct));
      setTrimStartPct(nextStart);
    } else if (side === 'right' && isDraggingTrimRight) {
      const nextEnd = Math.max(trimStartPct + 2, Math.min(100, pct));
      setTrimEndPct(nextEnd);
    }
  };

  const handleTrimPointerUp = (e: React.PointerEvent<HTMLDivElement>, side: 'left' | 'right') => {
    if (side === 'left') setIsDraggingTrimLeft(false);
    else setIsDraggingTrimRight(false);
    updateVfxReference({
      trimStartSeconds: Number(((trimStartPctRef.current / 100) * duration).toFixed(2)),
      trimEndSeconds: Number(((trimEndPctRef.current / 100) * duration).toFixed(2)),
    });
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
    const targetActor =
      selectedActorId && selectedActorId !== '__camera__'
        ? shot.actors.find((a) => a.id === selectedActorId)
        : undefined;

    if (selectedActorId === '__camera__') {
      const camPos = interpolateTrajectoryPosition(shot.camera.movement, currentTime, duration);
      updateCameraPositionAtTime(
        currentTime,
        {
          x: camPos.x,
          y: camPos.y,
          z: camPos.z ?? shot.camera.movement.startPosition.z ?? 45,
        },
        duration,
        'keyframe'
      );
      return;
    } else if (selectedActorId && targetActor) {
      const pos = interpolateTrajectoryPosition(targetActor.trajectory, currentTime, duration);
      updateActorPositionAtTime(selectedActorId, currentTime, pos, duration, 'keyframe');
      return;
    }

    // Fallback if no actor or camera is selected: place a first-actor cue if available, or a timeline note marker
    const fallbackActor = shot.actors[0];
    if (fallbackActor) {
      setSelectedActorId(fallbackActor.id);
      const pos = interpolateTrajectoryPosition(fallbackActor.trajectory, currentTime, duration);
      updateActorPositionAtTime(fallbackActor.id, currentTime, pos, duration, 'keyframe');
      return;
    }

    const id = `m_${Date.now()}`;
    const newMarker: TimelineMarker = {
      id,
      time: Number(currentTime.toFixed(2)),
      label: `Cue @ ${currentTime.toFixed(1)}s`,
      color: '#f59e0b',
      actorId: selectedActorId,
    };
    setMarkers((prev) => [...prev, newMarker]);
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
            <span>
              Cues (
              {shot.actors.reduce((acc, a) => acc + (a.trajectory.keyframes?.length || 0), 0) +
                (shot.camera.movement.keyframes?.length || 0) +
                markers.length}
              )
            </span>
          </button>

          {/* Auto-Cue Toggle Button (Right next to Cues!) */}
          <button
            type="button"
            onClick={() => setStagingMoveMode(stagingMoveMode === 'keyframe' ? 'base' : 'keyframe')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition-all text-[10.5px] cursor-pointer ${
              stagingMoveMode === 'keyframe'
                ? 'bg-rose-500/20 text-rose-200 border border-rose-500/50 shadow-sm'
                : 'bg-[#131C2E] hover:bg-[#1A2436] text-[#98A5BC] border border-[#273247]'
            }`}
            title={
              stagingMoveMode === 'keyframe'
                ? 'Auto-Cue ON: Moving, rotating, or posing a selected element automatically creates or updates a Cue at the current playhead time'
                : 'Auto-Cue OFF: Moving an element shifts its base position across the whole shot without creating a new Cue'
            }
          >
            <span
              className={`h-2 w-2 rounded-full ${
                stagingMoveMode === 'keyframe' ? 'bg-rose-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span>Auto-Cue {stagingMoveMode === 'keyframe' ? 'ON' : 'OFF'}</span>
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

      {/* 4. Cinema Multi-Track Timeline with Spacious Element Swimlanes, Interactive Scrubbing & Trim Handles */}
      <div className="flex flex-col bg-[#090D16] px-3 py-2.5 shrink-0 space-y-1.5 border-t border-[#1D2638]">
        {/* Dynamic Time Ruler based on duration */}
        <div className="relative h-5 w-full select-none">
          <div className="absolute inset-0 flex justify-between font-mono text-[10px] font-semibold text-[#B0BDD4] px-1 pointer-events-none">
            {rulerTicks.map((tick, i) => (
              <div key={i} className="flex flex-col items-center">
                <span>{tick.label}</span>
                <div className="h-1.5 w-[1px] bg-[#4A5B7C] mt-0.5" />
              </div>
            ))}
          </div>
        </div>

        {/* Multi-Track Timeline Box with Dedicated Rows for Trim/Filmstrip, Camera, and Each Scene Element */}
        {(() => {
          const activeActorCount = Math.max(1, shot.actors.length);
          const headerRowHeight = 28;
          const cameraRowHeight = 26;
          const actorRowHeight = 28;
          const totalTimelineHeight = Math.max(
            116,
            headerRowHeight + cameraRowHeight + activeActorCount * actorRowHeight + 6
          );

          return (
            <div
              ref={timelineRef}
              onPointerDown={handleTimelinePointerDown}
              onPointerMove={handleTimelinePointerMove}
              onPointerUp={handleTimelinePointerUp}
              onPointerCancel={handleTimelinePointerUp}
              style={{ height: `${totalTimelineHeight}px` }}
              className="relative w-full rounded-xl bg-[#0D1320] border border-[#273247] overflow-hidden cursor-crosshair select-none touch-none shadow-inner"
            >
              {/* Vertical Time Grid Lines across all tracks */}
              <div className="absolute inset-0 flex justify-between pointer-events-none select-none px-1">
                {rulerTicks.map((_, i) => (
                  <div key={i} className="h-full w-[1px] bg-white/[0.04]" />
                ))}
              </div>

              {/* ROW 1 (Top 28px): Filmstrip Header & Interactive Selected Clip Trim Range */}
              <div
                className="absolute left-0 right-0 top-0 border-b border-[#1E293B] overflow-hidden"
                style={{ height: `${headerRowHeight}px` }}
              >
                {/* Filmstrip Frame Thumbnails */}
                <div className="absolute inset-0 flex opacity-55 pointer-events-none select-none">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 border-r border-[#090D16] bg-gradient-to-b from-[#151F32] via-[#0F1726] to-[#151F32] relative flex items-center justify-between px-1.5 overflow-hidden"
                    >
                      <span className="font-mono text-[8px] text-[#64748B] font-bold select-none">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="h-2.5 flex-1 mx-1 rounded border border-[#273247]/40 bg-gradient-to-r from-[#6658F5]/15 via-[#18B8D8]/10 to-[#6658F5]/15" />
                    </div>
                  ))}
                </div>

                {/* Interactive Selected Clip Range with Working Trim Handles */}
                <div
                  className="absolute top-0 bottom-0 rounded-t-md border-2 border-[#6658F5] bg-[#6658F5]/20 flex items-center justify-between px-0.5 pointer-events-none"
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
                    className="h-6 w-3 rounded-l bg-[#8E84FF] hover:bg-white cursor-ew-resize flex items-center justify-center shadow-md active:scale-95 pointer-events-auto"
                    title={`Trim In Point (${((trimStartPct / 100) * duration).toFixed(1)}s)`}
                  >
                    <div className="h-3.5 w-0.5 bg-black/70 rounded" />
                  </div>

                  <div className="flex items-center gap-2 px-2 pointer-events-none drop-shadow">
                    <span className="font-mono text-[10.5px] font-bold text-white truncate">
                      {shot.name || shotTitle} • {duration}s
                    </span>
                    {(trimStartPct > 0 || trimEndPct < 100) && (
                      <span className="rounded bg-[#090D16]/90 px-1.5 py-0.5 font-mono text-[9px] text-[#F0AE42] border border-[#F0AE42]/40">
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
                    className="h-6 w-3 rounded-r bg-[#8E84FF] hover:bg-white cursor-ew-resize flex items-center justify-center shadow-md active:scale-95 pointer-events-auto"
                    title={`Trim Out Point (${((trimEndPct / 100) * duration).toFixed(1)}s)`}
                  >
                    <div className="h-3.5 w-0.5 bg-black/70 rounded" />
                  </div>
                </div>
              </div>

              {/* Timeline User Cue Markers (Draggable on Header Row) */}
              {markers.map((m) => {
                const mPct = Math.max(0, Math.min(100, (m.time / duration) * 100));
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
                    data-cue-handle="true"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      timelineRef.current?.setPointerCapture(e.pointerId);
                      if (m.actorId) setSelectedActorId(m.actorId);
                      setCurrentTime(m.time);
                      const rect = timelineRef.current?.getBoundingClientRect();
                      const clickedTime =
                        rect && rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * duration : m.time;
                      const rawOffset = m.time - clickedTime;
                      setDraggingTimelineCue({
                        kind: 'marker',
                        markerId: m.id,
                        origTime: m.time,
                        grabOffsetSec: Math.abs(rawOffset) <= 0.12 ? rawOffset : 0,
                      });
                    }}
                    className="absolute top-1 z-30 h-5 w-5 flex items-center justify-center cursor-ew-resize group pointer-events-auto"
                    style={{ left: `${mPct}%`, transform: 'translateX(-50%)' }}
                    title={`${m.label} (${m.time.toFixed(1)}s) — Drag left/right to retime`}
                  >
                    <div
                      className="h-3.5 w-3.5 rotate-45 border-2 border-white shadow-md transition-transform group-hover:scale-125"
                      style={{ backgroundColor: effectiveMarkerColor }}
                    />
                    <span
                      className="absolute left-full ml-1 top-1/2 -translate-y-1/2 rounded bg-[#090D16]/95 px-1.5 py-0.5 font-mono text-[9px] font-bold whitespace-nowrap pointer-events-none border shadow-md"
                      style={{ borderColor: effectiveMarkerColor, color: effectiveMarkerColor }}
                    >
                      {m.label}
                    </span>
                  </div>
                );
              })}

              {/* ROW 2: Dedicated Camera Keyframe Lane */}
              {(() => {
                const isCamSelected = selectedActorId === '__camera__';
                const camColor = shot.camera.color || '#F0AE42';
                const camKfs = shot.camera.movement.keyframes || [];
                return (
                  <div
                    className={`absolute left-0 right-0 border-b border-[#1E293B]/80 flex items-center transition-colors ${
                      isCamSelected ? 'bg-[#F0AE42]/10' : 'bg-[#0B101B]/70'
                    }`}
                    style={{ top: `${headerRowHeight}px`, height: `${cameraRowHeight}px` }}
                  >
                    {/* Track Center Guide Line */}
                    <div
                      className="absolute left-0 right-0 h-[1px] pointer-events-none"
                      style={{ backgroundColor: `${camColor}30` }}
                    />

                    {/* Left Track Label Pill */}
                    <button
                      type="button"
                      data-cue-handle="true"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedActorId('__camera__');
                      }}
                      className={`relative z-20 ml-1.5 flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[9.5px] font-bold border pointer-events-auto transition-all cursor-pointer ${
                        isCamSelected
                          ? 'bg-[#090D16] text-white shadow-md ring-1 ring-white/50'
                          : 'bg-[#090D16]/90 text-slate-200 hover:text-white'
                      }`}
                      style={{ borderColor: camColor, color: camColor }}
                      title="Select Camera Track"
                    >
                      <span className="h-2 w-2 rotate-45 shrink-0" style={{ backgroundColor: camColor }} />
                      <span>CAM • {shot.camera.movement.type}</span>
                    </button>

                    {/* Draggable Camera Keyframe Diamonds (Strictly Centered at Exact Time%) */}
                    {camKfs.map((ckf) => {
                      const kfPct = Math.max(0, Math.min(100, (ckf.time / duration) * 100));
                      return (
                        <div
                          key={ckf.id}
                          data-cue-handle="true"
                          data-testid={`timeline-camera-cue-${ckf.id}`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            timelineRef.current?.setPointerCapture(e.pointerId);
                            setSelectedActorId('__camera__');
                            setCurrentTime(ckf.time);
                            const rect = timelineRef.current?.getBoundingClientRect();
                            const clickedTime =
                              rect && rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * duration : ckf.time;
                            const rawOffset = ckf.time - clickedTime;
                            setDraggingTimelineCue({
                              kind: 'camera-cue',
                              cueId: ckf.id,
                              origTime: ckf.time,
                              grabOffsetSec: Math.abs(rawOffset) <= 0.12 ? rawOffset : 0,
                            });
                          }}
                          className="absolute top-1/2 z-30 h-6 w-6 flex items-center justify-center cursor-ew-resize group pointer-events-auto"
                          style={{ left: `${kfPct}%`, transform: 'translate(-50%, -50%)' }}
                          title={`[CAM] Camera Cue @ ${ckf.time.toFixed(2)}s — Drag left/right to retime`}
                        >
                          <div
                            className={`h-3.5 w-3.5 rotate-45 border-2 shadow-md transition-transform group-hover:scale-125 ${
                              isCamSelected ? 'border-white scale-110' : 'border-white/85'
                            }`}
                            style={{ backgroundColor: camColor }}
                          />
                          <span
                            className="hidden sm:inline-block absolute left-full ml-0.5 top-1/2 -translate-y-1/2 opacity-85 group-hover:opacity-100 rounded bg-[#090D16]/95 px-1 py-0.2 font-mono text-[8.5px] font-bold whitespace-nowrap pointer-events-none border shadow"
                            style={{ color: camColor, borderColor: `${camColor}66` }}
                          >
                            {ckf.time.toFixed(1)}s
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ROWS 3+: Dedicated Full-Height Swimlane Per Scene Element / Actor */}
              {(() => {
                const fallbackPalette = ['#eab308', '#06b6d4', '#ec4899', '#10b981', '#a855f7', '#f97316', '#3b82f6'];

                return shot.actors.map((act, laneIdx) => {
                  const kfs = act.trajectory.keyframes || [];
                  const isSelected = act.id === selectedActorId;
                  const laneColor = act.color || fallbackPalette[laneIdx % fallbackPalette.length];
                  const rowTopPx = headerRowHeight + cameraRowHeight + laneIdx * actorRowHeight;

                  const spanStart = kfs.length > 0 ? kfs[0].time : 0;
                  const spanEnd = kfs.length > 0 ? kfs[kfs.length - 1].time : duration;
                  const startPct = Math.max(0, Math.min(100, (spanStart / duration) * 100));
                  const endPct = Math.max(startPct + 2, Math.min(100, (spanEnd / duration) * 100));
                  const shortTag =
                    act.name
                      .replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '')
                      .slice(0, 2)
                      .toUpperCase() || `C${laneIdx + 1}`;

                  const captureInitialTimes = () => {
                    const map: Record<string, number> = {};
                    kfs.forEach((k) => {
                      map[k.id] = k.time;
                    });
                    return map;
                  };

                  return (
                    <div
                      key={`swimlane-${act.id}`}
                      className={`absolute left-0 right-0 border-b border-[#1E293B]/60 flex items-center transition-colors ${
                        isSelected
                          ? 'bg-white/[0.07]'
                          : laneIdx % 2 === 0
                          ? 'bg-[#0E1625]/60'
                          : 'bg-[#0A101C]/60'
                      }`}
                      style={{ top: `${rowTopPx}px`, height: `${actorRowHeight}px` }}
                    >
                      {/* Subtle Horizontal Lane Guide Line */}
                      <div
                        className="absolute left-0 right-0 h-[1px] pointer-events-none"
                        style={{ backgroundColor: `${laneColor}28` }}
                      />

                      {/* Left-Pinned Element Identity Badge (Always visible & clickable to select element) */}
                      <button
                        type="button"
                        data-cue-handle="true"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedActorId(act.id);
                        }}
                        className={`relative z-25 ml-1.5 flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold border pointer-events-auto transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#090D16] text-white shadow-md ring-1 ring-white/70'
                            : 'bg-[#090D16]/90 text-slate-200 hover:text-white'
                        }`}
                        style={{ borderColor: laneColor }}
                        title={`Select "${act.name}" (${kfs.length} cues)`}
                      >
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: laneColor }} />
                        <span className="truncate max-w-[115px]" style={{ color: isSelected ? '#ffffff' : laneColor }}>
                          {act.name}
                        </span>
                      </button>

                      {/* Subject Cue Span Bar (Drag body to shift cue timing, drag left/right edges to speed up or slow down!) */}
                      {kfs.length >= 2 && (
                        <div
                          data-cue-handle="true"
                          data-testid={`timeline-cue-span-${act.id}`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            timelineRef.current?.setPointerCapture(e.pointerId);
                            setSelectedActorId(act.id);
                            setDraggingTimelineCue({
                              kind: 'actor-span',
                              actorId: act.id,
                              side: 'move',
                              initialStart: spanStart,
                              initialEnd: spanEnd,
                              startClientX: e.clientX,
                              initialTimesById: captureInitialTimes(),
                            });
                          }}
                          className={`absolute z-20 h-5 rounded-md flex items-center justify-between cursor-grab active:cursor-grabbing pointer-events-auto transition-opacity ${
                            isSelected ? 'opacity-100 ring-1 ring-white/80 shadow-md' : 'opacity-80 hover:opacity-100'
                          }`}
                          style={{
                            top: '4px',
                            left: `${startPct}%`,
                            width: `${Math.max(3, endPct - startPct)}%`,
                            backgroundColor: `${laneColor}35`,
                            border: `1.5px solid ${laneColor}`,
                          }}
                          title={`${act.name} Cues (${spanStart.toFixed(1)}s → ${spanEnd.toFixed(1)}s) — Drag bar to shift all cues, or drag edges to change speed`}
                        >
                          {/* Left Speed Handle */}
                          <div
                            data-cue-handle="true"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              timelineRef.current?.setPointerCapture(e.pointerId);
                              setSelectedActorId(act.id);
                              setDraggingTimelineCue({
                                kind: 'actor-span',
                                actorId: act.id,
                                side: 'start',
                                initialStart: spanStart,
                                initialEnd: spanEnd,
                                startClientX: e.clientX,
                                initialTimesById: captureInitialTimes(),
                              });
                            }}
                            className="h-full w-2.5 cursor-ew-resize bg-white/40 hover:bg-white rounded-l-[4px] shrink-0 flex items-center justify-center"
                            title={`Drag to change ${act.name} start time & speed`}
                          >
                            <div className="h-2.5 w-[1px] bg-black/60" />
                          </div>

                          {/* Span Timing & Action Summary */}
                          <span className="px-2 text-[9.5px] font-mono font-bold text-white truncate pointer-events-none drop-shadow">
                            {shortTag} • {spanStart.toFixed(1)}s → {spanEnd.toFixed(1)}s ({kfs.length} cues)
                          </span>

                          {/* Right Speed Handle */}
                          <div
                            data-cue-handle="true"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              timelineRef.current?.setPointerCapture(e.pointerId);
                              setSelectedActorId(act.id);
                              setDraggingTimelineCue({
                                kind: 'actor-span',
                                actorId: act.id,
                                side: 'end',
                                initialStart: spanStart,
                                initialEnd: spanEnd,
                                startClientX: e.clientX,
                                initialTimesById: captureInitialTimes(),
                              });
                            }}
                            className="h-full w-2.5 cursor-ew-resize bg-white/40 hover:bg-white rounded-r-[4px] shrink-0 flex items-center justify-center"
                            title={`Drag left/right to speed up or slow down ${act.name} cues`}
                          >
                            <div className="h-2.5 w-[1px] bg-black/60" />
                          </div>
                        </div>
                      )}

                      {/* Individual Draggable Shape-Coded Cue Nodes (Strictly Centered at Exact Time% with 24x24 Hit-Box) */}
                      {kfs.map((kf) => {
                        const kfPct = Math.max(0, Math.min(100, (kf.time / duration) * 100));
                        const isAirborne = (kf.position.z ?? 0) > 2;
                        const isLocomotion = kf.gait === 'walk' || kf.gait === 'run' || kf.gait === 'sneak';
                        const shapeClass = isAirborne
                          ? 'rounded-[3px] rotate-12' // Jump / Airborne
                          : isLocomotion
                          ? 'rotate-45' // Locomotion Diamond ◆
                          : 'rounded-full'; // Acting / Pose Circle ●
                        const cueTag =
                          kf.posePreset && kf.posePreset !== 'neutral-stand'
                            ? kf.posePreset.replace(/^universal-ik:llm_/, 'AI-IK ').slice(0, 12)
                            : kf.gait && kf.gait !== 'none'
                            ? kf.gait
                            : `${kf.time.toFixed(1)}s`;

                        return (
                          <div
                            key={kf.id}
                            data-cue-handle="true"
                            data-testid={`timeline-actor-cue-${act.id}-${kf.id}`}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              timelineRef.current?.setPointerCapture(e.pointerId);
                              setSelectedActorId(act.id);
                              setCurrentTime(kf.time);
                              const rect = timelineRef.current?.getBoundingClientRect();
                              const clickedTime =
                                rect && rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * duration : kf.time;
                              const rawOffset = kf.time - clickedTime;
                              setDraggingTimelineCue({
                                kind: 'actor-cue',
                                actorId: act.id,
                                cueId: kf.id,
                                origTime: kf.time,
                                grabOffsetSec: Math.abs(rawOffset) <= 0.12 ? rawOffset : 0,
                              });
                            }}
                            className={`absolute top-1/2 z-30 h-6 w-6 flex items-center justify-center cursor-ew-resize group pointer-events-auto transition-opacity ${
                              isSelected ? 'opacity-100' : 'opacity-85 hover:opacity-100'
                            }`}
                            style={{
                              left: `${kfPct}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                            title={`[${shortTag}] ${act.name} Cue @ ${kf.time.toFixed(2)}s (${cueTag} | X:${Math.round(kf.position.x)}, Y:${Math.round(kf.position.y)}) — Drag left/right to retime`}
                          >
                            <div
                              className={`h-3.5 w-3.5 border-2 shadow-md transition-transform group-hover:scale-125 ${shapeClass} ${
                                isSelected ? 'border-white scale-110 ring-1 ring-black/70' : 'border-white/85'
                              }`}
                              style={{ backgroundColor: laneColor }}
                            />
                            <span
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity rounded bg-[#090D16]/95 px-1.5 py-0.5 font-mono text-[9px] font-bold whitespace-nowrap pointer-events-none border shadow-lg z-40"
                              style={{ color: laneColor, borderColor: laneColor }}
                            >
                              [{shortTag}] {act.name} • {cueTag} @ {kf.time.toFixed(2)}s (⇄ Drag)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                });
              })()}

              {/* Active Cinema Scrubber Playhead */}
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-40 transition-transform duration-75"
                style={{
                  left: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%`,
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="flex flex-col items-center">
                  <div className="rounded bg-[#F0AE42] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-[#090D16] shadow-lg flex items-center gap-0.5 border border-[#F8CA78]">
                    <span>{currentTime.toFixed(2)}s</span>
                  </div>
                  <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-[#F0AE42] -mt-0.5" />
                </div>
                <div className="w-0.5 h-full bg-[#F0AE42] shadow-[0_0_8px_rgba(240,174,66,0.9)] mx-auto -mt-1" />
              </div>
            </div>
          );
        })()}

        {/* Collapsible Secondary Tool Drawers (Trim Range / Keyframe Cues) */}
        {activeTool === 'markers' && (
          <div className="flex items-center justify-between bg-[#121A2A] border border-[#6658F5]/40 rounded-lg px-3 py-1.5 font-mono text-[10px] gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[#C4BEFF] font-bold">Keyframe Cues:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(() => {
                  const liveCues: Array<{
                    id: string;
                    time: number;
                    label: string;
                    color: string;
                    onSelect: () => void;
                    onRemove: () => void;
                  }> = [];

                  (shot.camera.movement.keyframes || []).forEach((kf) => {
                    liveCues.push({
                      id: `cam_${kf.id}`,
                      time: kf.time,
                      label: `Camera @ ${kf.time.toFixed(1)}s`,
                      color: shot.camera.color || '#f59e0b',
                      onSelect: () => {
                        setSelectedActorId('__camera__');
                        setCurrentTime(kf.time);
                      },
                      onRemove: () => removeCameraKeyframe(kf.id),
                    });
                  });

                  shot.actors.forEach((act) => {
                    (act.trajectory.keyframes || []).forEach((kf) => {
                      liveCues.push({
                        id: `act_${act.id}_${kf.id}`,
                        time: kf.time,
                        label: `${act.name} @ ${kf.time.toFixed(1)}s`,
                        color: act.color || '#22d3ee',
                        onSelect: () => {
                          setSelectedActorId(act.id);
                          setCurrentTime(kf.time);
                        },
                        onRemove: () => removeActorKeyframe(act.id, kf.id),
                      });
                    });
                  });

                  markers.forEach((m) => {
                    liveCues.push({
                      id: m.id,
                      time: m.time,
                      label: m.label,
                      color: m.color,
                      onSelect: () => setCurrentTime(m.time),
                      onRemove: () => setMarkers(markers.filter((x) => x.id !== m.id)),
                    });
                  });

                  liveCues.sort((a, b) => a.time - b.time);

                  if (liveCues.length === 0) {
                    return <span className="text-[#98A5BC] text-[9.5px]">No cues placed yet (move any selected object to auto-create a cue)</span>;
                  }

                  return liveCues.map((c) => (
                    <button
                      key={c.id}
                      onClick={c.onSelect}
                      className="flex items-center gap-1 rounded-md bg-[#1A2436] hover:bg-[#223047] px-2 py-0.5 text-[#F0F3FA] border border-[#273247]"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                      <span>{c.label}</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          c.onRemove();
                        }}
                        className="ml-1 text-[#98A5BC] hover:text-[#EF5261]"
                        title="Delete this Cue"
                      >
                        ×
                      </span>
                    </button>
                  ));
                })()}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {selectedActorId && selectedActorId !== '__camera__' && (
                <div className="flex items-center gap-1 mr-1">
                  <span className="text-[#98A5BC] text-[9px]">Pacing:</span>
                  {(
                    [
                      { id: 'linear' as const, label: 'Linear' },
                      { id: 'ease-in-out' as const, label: 'Smooth' },
                      { id: 'fast-start' as const, label: 'Burst ⚡' },
                      { id: 'slow-start' as const, label: 'Ramp ↗' },
                    ]
                  ).map((curve) => (
                    <button
                      key={curve.id}
                      type="button"
                      onClick={() => applyActorMotionCurve(selectedActorId, curve.id)}
                      className="rounded bg-[#1A2436] hover:bg-[#223047] border border-[#273247] px-1.5 py-0.5 text-[9px] text-[#D0D9E8] hover:text-white"
                      title={`Apply ${curve.label} speed curve to selected subject cues`}
                    >
                      {curve.label}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={handleAddMarker}
                className="rounded-lg bg-[#6658F5] hover:bg-[#7669FF] px-2.5 py-0.5 text-white font-bold transition-colors text-[10.5px]"
              >
                + Add Cue @ {currentTime.toFixed(1)}s
              </button>
            </div>
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
