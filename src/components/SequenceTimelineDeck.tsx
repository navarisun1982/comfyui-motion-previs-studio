import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useSequenceStore } from '../stores/useSequenceStore';
import { useShotStore } from '../stores/useShotStore';
import { useHistoryStore } from '../stores/useHistoryStore';
import {
  secondsToTimecode,
  calculateShotTimeRanges,
  findShotAtTime,
  getEffectiveShotDuration,
} from '../engine/timecodeMath';
import { SequenceContinuityModal } from './SequenceContinuityModal';
import { SequenceExportModal } from './SequenceExportModal';
import { TransitionType } from '../types/sequenceTypes';
import {
  Play,
  Pause,
  SkipBack,
  Repeat,
  Compass,
  Download,
  Film,
  ArrowLeft,
  ArrowRight,
  Camera,
  Layers,
  Volume2,
  VolumeX,
} from 'lucide-react';

export const SequenceTimelineDeck: React.FC = () => {
  const {
    sequence,
    currentTime,
    isPlaying,
    playbackSpeed,
    isLooping,
    selectedShotId,
    continuityReport,
    isContinuityModalOpen,
    isExportModalOpen,
    setCurrentTime,
    setIsPlaying,
    setPlaybackSpeed,
    toggleLooping,
    jumpToShot,
    setSelectedShotId,
    reorderShots,
    setHeroTakeForShot,
    setTransition,
    runContinuityCheck,
    setContinuityModalOpen,
    setExportModalOpen,
  } = useSequenceStore();

  const { shotsById } = useShotStore();
  const { revisions } = useHistoryStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [isMuted, setIsMuted] = useState(true);

  // Run initial continuity analysis if missing
  useEffect(() => {
    if (!continuityReport) {
      runContinuityCheck(shotsById);
    }
  }, [continuityReport, runContinuityCheck, shotsById]);

  // Compute active shot and local time based on global currentTime
  const currentPlaybackState = useMemo(() => {
    return findShotAtTime(sequence.shots, currentTime, sequence.fps);
  }, [sequence.shots, currentTime, sequence.fps]);

  const activeShot = currentPlaybackState.shot;
  const activeShotIndex = currentPlaybackState.shotIndex;
  const localTime = currentPlaybackState.localTimeSeconds;

  // Timeline playback animation frame loop
  useEffect(() => {
    if (!isPlaying) return;

    let lastTimestamp = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const deltaSec = (now - lastTimestamp) / 1000.0;
      lastTimestamp = now;

      const nextTime = currentTime + deltaSec * playbackSpeed;
      setCurrentTime(nextTime);

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, currentTime, playbackSpeed, setCurrentTime]);

  // Synchronize active video element with localTime
  useEffect(() => {
    if (videoRef.current && !isNaN(localTime)) {
      if (Math.abs(videoRef.current.currentTime - localTime) > 0.25) {
        videoRef.current.currentTime = localTime;
      }
      if (isPlaying && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      } else if (!isPlaying && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  }, [localTime, isPlaying, activeShot?.shotId]);

  // Keyboard shortcut: Spacebar toggles playback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, setIsPlaying]);

  // Shot time ranges for timeline layout
  const timelineRanges = useMemo(() => {
    return calculateShotTimeRanges(sequence.shots, sequence.fps);
  }, [sequence.shots, sequence.fps]);

  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSeconds = ratio * sequence.totalDurationSeconds;
    setCurrentTime(targetSeconds);
  };

  const handleCycleTransition = (cutIndex: number) => {
    const shot = sequence.shots[cutIndex];
    const currentType = shot.transitionAfter?.type || 'cut';
    let nextType: TransitionType = 'cut';
    let duration = 0;

    if (currentType === 'cut') {
      nextType = 'dissolve';
      duration = 0.5;
    } else if (currentType === 'dissolve') {
      nextType = 'fade-black';
      duration = 1.0;
    } else {
      nextType = 'cut';
      duration = 0;
    }

    setTransition(cutIndex, { type: nextType, durationSeconds: duration });
    runContinuityCheck(shotsById);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#090b10] text-slate-200 select-none">
      {/* Top Header / Breadcrumb & Actions Bar */}
      <div className="flex items-center justify-between border-b border-director-border px-4 py-2.5 bg-black/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-director-gold/20 text-director-gold">
            <Film className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                {sequence.sceneName} — Sequence Assembly
              </h1>
              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[9px] text-slate-300">
                {sequence.shots.length} SHOTS
              </span>
            </div>
            <p className="font-mono text-[10px] text-slate-400">
              MULTI-SHOT NLE ASSEMBLY • CONTINUITY CHECKING • OTIO / EDL EXPORT
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Continuity Report Trigger */}
          <button
            onClick={() => {
              runContinuityCheck(shotsById);
              setContinuityModalOpen(true);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold border transition-all cursor-pointer ${
              (continuityReport?.overallScore ?? 100) >= 85
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                : (continuityReport?.overallScore ?? 100) >= 70
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
            }`}
            title="Inspect Continuity, 180° Rule & Pacing Report"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>
              {continuityReport ? `${continuityReport.overallScore}% Continuity` : 'Check Continuity'}
            </span>
          </button>

          {/* Export Sequence Button */}
          <button
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-director-gold to-amber-500 hover:brightness-110 text-black px-3.5 py-1.5 font-mono text-xs font-bold transition-all shadow-md cursor-pointer"
            title="Export to OpenTimelineIO, CMX 3600 EDL, or Final Cut Pro XML"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Timeline</span>
          </button>
        </div>
      </div>

      {/* Main Viewport: Sequence Playback Canvas / Video Player */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center bg-black/90 p-4 overflow-hidden">
        {activeShot ? (
          <div className="relative flex h-full max-h-[520px] w-full max-w-4xl flex-col items-center justify-center rounded-2xl border border-white/10 bg-black overflow-hidden shadow-2xl">
            {/* Live Video / Previs Plate */}
            {activeShot.heroTakeVideoUrl ? (
              <video
                ref={videoRef}
                src={activeShot.heroTakeVideoUrl}
                muted={isMuted}
                playsInline
                className="h-full w-full object-contain"
              />
            ) : activeShot.previsVideoUrl ? (
              <video
                ref={videoRef}
                src={activeShot.previsVideoUrl}
                muted={isMuted}
                playsInline
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="relative flex h-full w-full items-center justify-center">
                {activeShot.thumbnailUrl && (
                  <img
                    src={activeShot.thumbnailUrl}
                    alt={activeShot.title}
                    className="absolute inset-0 h-full w-full object-cover opacity-40 blur-[2px]"
                  />
                )}
                <div className="relative z-10 flex flex-col items-center gap-2 text-center p-6 bg-black/60 rounded-xl border border-white/10 backdrop-blur-md">
                  <Film className="h-10 w-10 text-director-gold/80" />
                  <span className="font-display text-sm font-bold text-white uppercase tracking-wider">
                    {activeShot.shotCode} — {activeShot.title}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    3D Previs Pass • {activeShot.durationSeconds.toFixed(1)}s
                  </span>
                  <span className="rounded bg-director-gold/15 px-2.5 py-0.5 font-mono text-[10px] text-director-gold border border-director-gold/30">
                    Select a Hero Take in the timeline below to view generated render
                  </span>
                </div>
              </div>
            )}

            {/* Viewport HUD Overlays */}
            {/* Top HUD: Slate & Movement */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20">
              <div className="flex items-center gap-2 rounded-lg bg-black/70 backdrop-blur-md px-3 py-1.5 border border-white/10">
                <span className="font-mono text-xs font-bold text-director-gold">
                  {activeShot.shotCode}
                </span>
                <span className="text-slate-500 font-mono text-xs">•</span>
                <span className="font-display text-xs font-semibold text-white tracking-wide">
                  {activeShot.title}
                </span>
                {activeShot.shotSpecSnapshot?.camera.movement.type && (
                  <>
                    <span className="text-slate-500 font-mono text-xs">•</span>
                    <span className="flex items-center gap-1 font-mono text-[10px] text-director-cyan">
                      <Camera className="h-3 w-3" />
                      {activeShot.shotSpecSnapshot.camera.movement.type}
                    </span>
                  </>
                )}
              </div>

              {/* Hero Take / Previs Badge */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="pointer-events-auto rounded-lg bg-black/70 backdrop-blur-md p-1.5 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                >
                  {isMuted ? <VolumeX className="h-4 w-4 text-slate-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
                </button>

                <div className="rounded-lg bg-black/70 backdrop-blur-md px-3 py-1.5 border border-white/10 font-mono text-[11px]">
                  {activeShot.heroTakeNumber ? (
                    <span className="text-director-gold font-bold">
                      Hero Take {activeShot.heroTakeNumber}
                      {activeShot.heroFidelityScore ? ` (${activeShot.heroFidelityScore}%)` : ''}
                    </span>
                  ) : (
                    <span className="text-slate-400">3D Previs Plate</span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom HUD: Timecode & Cut Position */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20">
              <div className="flex items-center gap-2 rounded-lg bg-black/80 backdrop-blur-md px-3 py-1.5 border border-white/10 font-mono text-xs">
                <span className="text-director-gold font-bold">
                  {secondsToTimecode(currentTime, sequence.fps)}
                </span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400">
                  {secondsToTimecode(sequence.totalDurationSeconds, sequence.fps)}
                </span>
              </div>

              <div className="rounded-lg bg-black/80 backdrop-blur-md px-3 py-1.5 border border-white/10 font-mono text-[10px] text-slate-300">
                Shot {activeShotIndex + 1} of {sequence.shots.length} ({localTime.toFixed(1)}s / {getEffectiveShotDuration(activeShot).toFixed(1)}s)
              </div>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 font-mono text-xs">No active shot in sequence</div>
        )}
      </div>

      {/* Master Transport Toolbar */}
      <div className="flex items-center justify-between border-t border-director-border bg-black/70 px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          {/* Jump Start */}
          <button
            onClick={() => setCurrentTime(0)}
            className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Jump to Start"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          {/* Jump Previous Shot */}
          <button
            onClick={() => jumpToShot(Math.max(0, activeShotIndex - 1))}
            className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Previous Shot"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Master Play / Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-director-gold hover:brightness-110 text-black shadow-lg transition-transform active:scale-95 cursor-pointer"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
          </button>

          {/* Jump Next Shot */}
          <button
            onClick={() => jumpToShot(Math.min(sequence.shots.length - 1, activeShotIndex + 1))}
            className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Next Shot"
          >
            <ArrowRight className="h-4 w-4" />
          </button>

          {/* Loop Sequence Toggle */}
          <button
            onClick={toggleLooping}
            className={`rounded-lg p-2 transition-colors cursor-pointer ${
              isLooping ? 'text-director-gold bg-director-gold/15' : 'text-slate-500 hover:text-white'
            }`}
            title={isLooping ? 'Loop Sequence: ON' : 'Loop Sequence: OFF'}
          >
            <Repeat className="h-4 w-4" />
          </button>
        </div>

        {/* Global Scrub Slider */}
        <div className="flex-1 max-w-xl mx-4 flex items-center gap-3">
          <span className="font-mono text-xs text-director-gold font-bold min-w-[70px] text-right">
            {secondsToTimecode(currentTime, sequence.fps)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0.1, sequence.totalDurationSeconds)}
            step={0.04}
            value={currentTime}
            onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-director-surface accent-director-gold"
          />
          <span className="font-mono text-xs text-slate-400 min-w-[70px]">
            {secondsToTimecode(sequence.totalDurationSeconds, sequence.fps)}
          </span>
        </div>

        {/* Playback Speed Switcher */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPlaybackSpeed(playbackSpeed === 1.0 ? 0.5 : 1.0)}
            className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-bold border transition-colors cursor-pointer ${
              playbackSpeed === 0.5
                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                : 'border-white/10 text-slate-400 hover:text-white'
            }`}
            title="Toggle Slow Motion (0.5x)"
          >
            {playbackSpeed}x Speed
          </button>
        </div>
      </div>

      {/* NLE Multi-Track Timeline Deck */}
      <div className="h-56 border-t border-director-border bg-black/80 flex flex-col shrink-0 overflow-hidden">
        {/* Track Header / Controls */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-1.5 bg-black/40 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-4">
            <span className="text-white font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-director-gold" />
              Timeline Tracks
            </span>
            <span className="text-[10px] text-slate-500">
              Drag or use &larr; / &rarr; to reorder clips • Click cut pill to change transition
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-mono">
              Total: {sequence.totalDurationSeconds.toFixed(1)}s ({Math.round(sequence.totalDurationSeconds * sequence.fps)} frames)
            </span>
          </div>
        </div>

        {/* Timeline Tracks Area */}
        <div
          ref={timelineRef}
          onClick={handleTimelineScrub}
          className="flex-1 relative flex flex-col p-3 overflow-x-auto overflow-y-hidden cursor-crosshair select-none"
        >
          {/* Timecode Ruler Bar */}
          <div className="h-5 w-full flex border-b border-white/10 text-[9px] font-mono text-slate-500 relative mb-2">
            {timelineRanges.map((range, idx) => {
              const widthPct = (range.duration / sequence.totalDurationSeconds) * 100;
              return (
                <div
                  key={idx}
                  style={{ width: `${widthPct}%` }}
                  className="border-r border-white/20 pl-1 flex items-center truncate"
                >
                  {secondsToTimecode(range.startTime, sequence.fps)}
                </div>
              );
            })}
          </div>

          {/* Red Playhead Vertical Marker */}
          <div
            style={{
              left: `${(currentTime / Math.max(0.1, sequence.totalDurationSeconds)) * 100}%`,
            }}
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] z-30 pointer-events-none flex flex-col items-center"
          >
            <div className="h-2 w-2 -mt-1 bg-rose-500 rotate-45" />
          </div>

          {/* V1 Video Track Row */}
          <div className="h-24 w-full flex items-center gap-1 relative z-10">
            {sequence.shots.map((shot, idx) => {
              const effDuration = getEffectiveShotDuration(shot);
              const widthPct = (effDuration / sequence.totalDurationSeconds) * 100;
              const isSelected = shot.shotId === selectedShotId;
              const isActivePlaying = idx === activeShotIndex;

              // Find available takes for this shot in revisions
              const shotTakes = revisions.filter((r) => r.shotId === shot.shotId);

              return (
                <React.Fragment key={shot.shotId}>
                  {/* Shot Clip Block */}
                  <div
                    style={{ width: `${widthPct}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedShotId(shot.shotId);
                      jumpToShot(idx);
                    }}
                    className={`h-full rounded-xl border relative flex flex-col justify-between p-2 overflow-hidden transition-all group cursor-pointer ${
                      isActivePlaying
                        ? 'border-director-gold bg-director-gold/15 shadow-lg shadow-director-gold/10 ring-1 ring-director-gold'
                        : isSelected
                        ? 'border-director-cyan bg-director-cyan/15 ring-1 ring-director-cyan'
                        : 'border-white/15 bg-black/60 hover:border-white/30'
                    }`}
                  >
                    {/* Background thumbnail if available */}
                    {shot.thumbnailUrl && (
                      <img
                        src={shot.thumbnailUrl}
                        alt={shot.title}
                        className="absolute inset-0 h-full w-full object-cover opacity-20 pointer-events-none"
                      />
                    )}

                    {/* Clip Top Bar */}
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="flex items-center gap-1 truncate">
                        <span className="font-mono text-[10px] font-bold text-white truncate">
                          {shot.shotCode}
                        </span>
                      </div>

                      {/* Reorder Buttons */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderShots(idx, idx - 1);
                          }}
                          className="rounded p-0.5 text-slate-400 hover:text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                          title="Move Left in Sequence"
                        >
                          <ArrowLeft className="h-3 w-3" />
                        </button>
                        <button
                          disabled={idx === sequence.shots.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderShots(idx, idx + 1);
                          }}
                          className="rounded p-0.5 text-slate-400 hover:text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                          title="Move Right in Sequence"
                        >
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Clip Middle Info */}
                    <div className="relative z-10 flex flex-col gap-0.5 truncate">
                      <span className="font-display text-[11px] font-semibold text-slate-200 truncate">
                        {shot.title}
                      </span>
                      {shot.shotSpecSnapshot?.camera.movement.type && (
                        <span className="font-mono text-[9px] text-director-cyan truncate">
                          {shot.shotSpecSnapshot.camera.movement.type}
                        </span>
                      )}
                    </div>

                    {/* Clip Bottom Bar: Duration & Hero Take Selector */}
                    <div className="relative z-10 flex items-center justify-between font-mono text-[9px]">
                      <span className="rounded bg-black/60 px-1.5 py-0.5 text-slate-300 border border-white/5">
                        {effDuration.toFixed(1)}s
                      </span>

                      {/* Hero Take Selector Dropdown */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <select
                          value={shot.heroTakeId || ''}
                          onChange={(e) => {
                            const chosenId = e.target.value;
                            const chosenTake = shotTakes.find((t) => t.id === chosenId) || null;
                            setHeroTakeForShot(shot.shotId, chosenTake);
                          }}
                          className="rounded bg-black/80 px-1 py-0.5 text-[9px] font-mono text-director-gold border border-director-gold/30 cursor-pointer"
                        >
                          <option value="">3D Previs Pass</option>
                          {shotTakes.map((take) => (
                            <option key={take.id} value={take.id}>
                              Take {take.takeNumber ?? take.version}
                              {take.motionFidelity ? ` (${take.motionFidelity.overallScore}%)` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Cut Boundary Transition Pill */}
                  {idx < sequence.shots.length - 1 && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCycleTransition(idx);
                      }}
                      className="shrink-0 flex items-center justify-center -mx-1 z-20 cursor-pointer group/trans"
                      title="Click to cycle cut transition (Cut / Dissolve / Fade)"
                    >
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[8px] font-bold border shadow-sm transition-all group-hover/trans:scale-110 ${
                          shot.transitionAfter?.type === 'dissolve'
                            ? 'bg-indigo-600 text-white border-indigo-400'
                            : shot.transitionAfter?.type === 'fade-black'
                            ? 'bg-slate-900 text-amber-300 border-amber-500/50'
                            : 'bg-black/90 text-slate-400 border-white/20 hover:text-white'
                        }`}
                      >
                        {shot.transitionAfter?.type === 'dissolve'
                          ? 'DISSOLVE'
                          : shot.transitionAfter?.type === 'fade-black'
                          ? 'FADE'
                          : 'CUT'}
                      </span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Continuity Diagnostic Modal */}
      {isContinuityModalOpen && continuityReport && (
        <SequenceContinuityModal
          report={continuityReport}
          onClose={() => setContinuityModalOpen(false)}
          onJumpToCut={(cutIndex) => jumpToShot(cutIndex)}
        />
      )}

      {/* NLE Timeline Export Modal */}
      {isExportModalOpen && (
        <SequenceExportModal
          sequence={sequence}
          onClose={() => setExportModalOpen(false)}
        />
      )}
    </div>
  );
};
