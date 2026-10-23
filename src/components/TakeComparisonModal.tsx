import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ShotRevisionV2 } from '../pipeline/revisionTypes';
import { useHistoryStore, computeShotDiff } from '../stores/useHistoryStore';
import { useShotStore } from '../stores/useShotStore';
import {
  Play,
  Pause,
  RotateCcw,
  Star,
  CheckCircle2,
  Download,
  X,
  Columns,
  SplitSquareVertical,
  Volume2,
  VolumeX,
  Sparkles,
  GitCompare,
} from 'lucide-react';

interface TakeComparisonModalProps {
  takeA: ShotRevisionV2;
  takeB: ShotRevisionV2;
  onClose: () => void;
}

export const TakeComparisonModal: React.FC<TakeComparisonModalProps> = ({
  takeA,
  takeB,
  onClose,
}) => {
  const { toggleCircledTake, revisions } = useHistoryStore();
  const setTakeAsActivePlate = useShotStore((s) => s.setTakeAsActivePlate);

  // Sync latest revisions state for circled status
  const currentTakeA = revisions.find((r) => r.id === takeA.id) || takeA;
  const currentTakeB = revisions.find((r) => r.id === takeB.id) || takeB;

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(5);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'split'>('side-by-side');
  const [splitPos, setSplitPos] = useState<number>(50); // 0 to 100%
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const [activePlateNotice, setActivePlateNotice] = useState<string | null>(null);

  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync durations
  const handleLoadedMetadata = () => {
    const durA = videoARef.current?.duration || 0;
    const durB = videoBRef.current?.duration || 0;
    const maxDur = Math.max(durA, durB);
    if (maxDur > 0 && Number.isFinite(maxDur)) {
      setDuration(maxDur);
    }
  };

  // Synced play/pause
  const togglePlay = useCallback(() => {
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);

    if (nextPlaying) {
      void videoARef.current?.play().catch(() => {});
      void videoBRef.current?.play().catch(() => {});
    } else {
      videoARef.current?.pause();
      videoBRef.current?.pause();
    }
  }, [isPlaying]);

  // Synced scrub
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoARef.current) videoARef.current.currentTime = time;
    if (videoBRef.current) videoBRef.current.currentTime = time;
  };

  // Time update from master video A
  const handleTimeUpdate = () => {
    if (videoARef.current) {
      const time = videoARef.current.currentTime;
      setCurrentTime(time);
      // Keep Video B tightly synced within 0.1s drift
      if (videoBRef.current && Math.abs(videoBRef.current.currentTime - time) > 0.1) {
        videoBRef.current.currentTime = time;
      }
    }
  };

  // Synced rate
  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoARef.current) videoARef.current.playbackRate = rate;
    if (videoBRef.current) videoBRef.current.playbackRate = rate;
  };

  // Restart both
  const handleRestart = () => {
    setCurrentTime(0);
    if (videoARef.current) videoARef.current.currentTime = 0;
    if (videoBRef.current) videoBRef.current.currentTime = 0;
    if (!isPlaying) {
      togglePlay();
    }
  };

  // Keyboard shortcut: Space to toggle play
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, onClose]);

  // Split view dragging
  const handleSplitMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingSplit || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const pct = (x / rect.width) * 100;
      setSplitPos(Math.round(pct));
    },
    [isDraggingSplit]
  );

  const handleSplitMouseUp = useCallback(() => {
    setIsDraggingSplit(false);
  }, []);

  useEffect(() => {
    if (isDraggingSplit) {
      window.addEventListener('mousemove', handleSplitMouseMove);
      window.addEventListener('mouseup', handleSplitMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleSplitMouseMove);
        window.removeEventListener('mouseup', handleSplitMouseUp);
      };
    }
  }, [isDraggingSplit, handleSplitMouseMove, handleSplitMouseUp]);

  // Download helper
  const handleDownload = (take: ShotRevisionV2) => {
    if (!take.outputVideoUrl) return;
    const a = document.createElement('a');
    a.href = take.outputVideoUrl;
    a.download = take.outputFilename || `Take_${take.takeNumber ?? take.version}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Set as Active Plate helper
  const handleSetPlate = (take: ShotRevisionV2, label: string) => {
    if (!take.outputVideoUrl) return;
    setTakeAsActivePlate(take.outputVideoUrl, take.outputFilename || `Take_${take.takeNumber ?? take.version}.mp4`);
    setActivePlateNotice(`Set ${label} as active shot plate for preview and VFX!`);
    setTimeout(() => setActivePlateNotice(null), 4000);
  };

  // Format time (00:00.00)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const diffItems = computeShotDiff(currentTakeA.shotSpec, currentTakeB.shotSpec);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="flex h-full max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border border-white/10 bg-director-darkest shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-director-border px-5 py-3.5 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-director-cyan/20 text-director-cyan">
              <GitCompare className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                  A/B Take Comparison
                </h2>
                <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[9px] text-slate-300">
                  {currentTakeA.shotSpec.name}
                </span>
              </div>
              <p className="font-mono text-[10px] text-slate-400">
                SYNCHRONIZED DUAL-VIEWPORT PLAYBACK & METADATA DIFF
              </p>
            </div>
          </div>

          {/* View Mode Toggle & Close */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-black/50 p-0.5 border border-white/10">
              <button
                onClick={() => setViewMode('side-by-side')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold transition-all ${
                  viewMode === 'side-by-side'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Side-by-side dual viewport view"
              >
                <Columns className="h-3 w-3" />
                <span>Side-by-Side</span>
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold transition-all ${
                  viewMode === 'split'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Split slider wipe comparison"
              >
                <SplitSquareVertical className="h-3 w-3" />
                <span>Split Wipe</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors ml-2"
              title="Close Comparison (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Notice Banner */}
        {activePlateNotice && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-300 px-4 py-2 font-mono text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{activePlateNotice}</span>
            </div>
            <button
              onClick={() => setActivePlateNotice(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Video Viewport Area */}
        <div className="flex-1 min-h-0 p-4 overflow-y-auto flex flex-col gap-4">
          {viewMode === 'side-by-side' ? (
            /* SIDE-BY-SIDE MODE */
            <div className="grid grid-cols-2 gap-4">
              {/* TAKE A CARD */}
              <div className="flex flex-col gap-2 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xs font-bold text-blue-400">
                      Take {currentTakeA.takeNumber ?? currentTakeA.version} (A)
                    </span>
                    {currentTakeA.isCircled && (
                      <span className="flex items-center gap-1 rounded bg-director-gold/20 px-1.5 py-0.5 font-mono text-[8px] font-bold text-director-gold border border-director-gold/40">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        CIRCLED HERO
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleCircledTake(currentTakeA.id)}
                      className={`p-1 rounded text-xs transition-colors ${
                        currentTakeA.isCircled
                          ? 'text-director-gold bg-director-gold/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                      title={currentTakeA.isCircled ? 'Uncircle Take A' : 'Circle Take A as Hero Take'}
                    >
                      <Star className={`h-3.5 w-3.5 ${currentTakeA.isCircled ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleDownload(currentTakeA)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 text-xs transition-colors"
                      title="Download Take A MP4"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Video A */}
                <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-white/10">
                  {currentTakeA.outputVideoUrl ? (
                    <video
                      ref={videoARef}
                      src={currentTakeA.outputVideoUrl}
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onEnded={() => setIsPlaying(false)}
                      muted={isMuted}
                      loop
                      playsInline
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-500 font-mono text-xs">
                      No video output for Take A
                    </div>
                  )}
                </div>

                {/* Metadata & Plate button */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 font-mono text-[9px] text-slate-400">
                    <span className="rounded bg-black/40 px-1.5 py-0.5 border border-white/5">
                      Seed: <strong className="text-director-cyan">{currentTakeA.seed}</strong>
                    </span>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 border border-white/5">
                      {currentTakeA.engine.toUpperCase()}
                    </span>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 border border-white/5 uppercase">
                      {currentTakeA.mode}
                    </span>
                  </div>

                  <button
                    onClick={() => handleSetPlate(currentTakeA, `Take ${currentTakeA.takeNumber ?? currentTakeA.version}`)}
                    className="flex items-center gap-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 px-2 py-1 font-mono text-[9px] font-bold transition-all cursor-pointer"
                    title="Set Take A as active background plate in Soundstage & Video Deck"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Set as Active Plate</span>
                  </button>
                </div>
              </div>

              {/* TAKE B CARD */}
              <div className="flex flex-col gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xs font-bold text-indigo-400">
                      Take {currentTakeB.takeNumber ?? currentTakeB.version} (B)
                    </span>
                    {currentTakeB.isCircled && (
                      <span className="flex items-center gap-1 rounded bg-director-gold/20 px-1.5 py-0.5 font-mono text-[8px] font-bold text-director-gold border border-director-gold/40">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        CIRCLED HERO
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleCircledTake(currentTakeB.id)}
                      className={`p-1 rounded text-xs transition-colors ${
                        currentTakeB.isCircled
                          ? 'text-director-gold bg-director-gold/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                      title={currentTakeB.isCircled ? 'Uncircle Take B' : 'Circle Take B as Hero Take'}
                    >
                      <Star className={`h-3.5 w-3.5 ${currentTakeB.isCircled ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleDownload(currentTakeB)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 text-xs transition-colors"
                      title="Download Take B MP4"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Video B */}
                <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-white/10">
                  {currentTakeB.outputVideoUrl ? (
                    <video
                      ref={videoBRef}
                      src={currentTakeB.outputVideoUrl}
                      onLoadedMetadata={handleLoadedMetadata}
                      muted={isMuted}
                      loop
                      playsInline
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-500 font-mono text-xs">
                      No video output for Take B
                    </div>
                  )}
                </div>

                {/* Metadata & Plate button */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 font-mono text-[9px] text-slate-400">
                    <span className="rounded bg-black/40 px-1.5 py-0.5 border border-white/5">
                      Seed: <strong className="text-director-cyan">{currentTakeB.seed}</strong>
                    </span>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 border border-white/5">
                      {currentTakeB.engine.toUpperCase()}
                    </span>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 border border-white/5 uppercase">
                      {currentTakeB.mode}
                    </span>
                  </div>

                  <button
                    onClick={() => handleSetPlate(currentTakeB, `Take ${currentTakeB.takeNumber ?? currentTakeB.version}`)}
                    className="flex items-center gap-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 px-2 py-1 font-mono text-[9px] font-bold transition-all cursor-pointer"
                    title="Set Take B as active background plate in Soundstage & Video Deck"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Set as Active Plate</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* SPLIT WIPE MODE */
            <div className="flex flex-col gap-2">
              <div
                ref={splitContainerRef}
                className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-white/10 select-none cursor-ew-resize"
                onMouseDown={() => setIsDraggingSplit(true)}
              >
                {/* Background Layer: Take A */}
                <video
                  ref={videoARef}
                  src={currentTakeA.outputVideoUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  muted={isMuted}
                  loop
                  playsInline
                  className="absolute inset-0 h-full w-full object-contain"
                />

                {/* Foreground Layer: Take B clipped */}
                <div
                  className="absolute inset-0 h-full w-full overflow-hidden pointer-events-none"
                  style={{ clipPath: `inset(0 0 0 ${splitPos}%)` }}
                >
                  <video
                    ref={videoBRef}
                    src={currentTakeB.outputVideoUrl}
                    onLoadedMetadata={handleLoadedMetadata}
                    muted={isMuted}
                    loop
                    playsInline
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                </div>

                {/* Vertical Divider Line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-director-gold shadow-[0_0_10px_rgba(255,200,0,0.8)] z-10 flex items-center justify-center pointer-events-none"
                  style={{ left: `${splitPos}%` }}
                >
                  <div className="h-8 w-5 rounded-full bg-director-gold text-black flex items-center justify-center font-mono text-[9px] font-bold shadow-lg">
                    ⇄
                  </div>
                </div>

                {/* Overlaid Badges */}
                <div className="absolute top-3 left-3 z-20 pointer-events-none rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-blue-300 border border-blue-500/30">
                  Take {currentTakeA.takeNumber ?? currentTakeA.version} (Seed: {currentTakeA.seed})
                </div>
                <div className="absolute top-3 right-3 z-20 pointer-events-none rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-indigo-300 border border-indigo-500/30">
                  Take {currentTakeB.takeNumber ?? currentTakeB.version} (Seed: {currentTakeB.seed})
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-2">
                <span>Drag slider across canvas to wipe between Take A and Take B</span>
                <span>Split: {splitPos}%</span>
              </div>
            </div>
          )}

          {/* PARAMETER DIFF INSPECTOR DRAWER */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-director-gold" />
                <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                  Take Parameter Traceability
                </span>
              </div>
              <span className="font-mono text-[9px] text-slate-400">
                Differences highlighted in gold
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="glass-card p-2 rounded border border-white/5 flex flex-col gap-1">
                <span className="font-mono text-[9px] text-slate-400 uppercase">Engine & Mode</span>
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-blue-300">{currentTakeA.engine} / {currentTakeA.mode}</span>
                  <span className="text-slate-500">vs</span>
                  <span className="text-indigo-300">{currentTakeB.engine} / {currentTakeB.mode}</span>
                </div>
              </div>

              <div className={`glass-card p-2 rounded border flex flex-col gap-1 ${
                currentTakeA.seed !== currentTakeB.seed ? 'border-director-gold/40 bg-director-gold/5' : 'border-white/5'
              }`}>
                <span className="font-mono text-[9px] text-slate-400 uppercase">RNG Seed</span>
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-blue-300 font-bold">{currentTakeA.seed}</span>
                  <span className="text-slate-500">vs</span>
                  <span className="text-indigo-300 font-bold">{currentTakeB.seed}</span>
                </div>
              </div>

              <div className={`glass-card p-2 rounded border flex flex-col gap-1 ${
                currentTakeA.profile !== currentTakeB.profile ? 'border-director-gold/40 bg-director-gold/5' : 'border-white/5'
              }`}>
                <span className="font-mono text-[9px] text-slate-400 uppercase">Quality Profile</span>
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-blue-300">{currentTakeA.profile}</span>
                  <span className="text-slate-500">vs</span>
                  <span className="text-indigo-300">{currentTakeB.profile}</span>
                </div>
              </div>

              <div className="glass-card p-2 rounded border border-white/5 flex flex-col gap-1">
                <span className="font-mono text-[9px] text-slate-400 uppercase">Created Time</span>
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-blue-300">{new Date(currentTakeA.createdAt).toLocaleTimeString()}</span>
                  <span className="text-slate-500">vs</span>
                  <span className="text-indigo-300">{new Date(currentTakeB.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            {/* Any Changed ShotSpec Diff Parameters */}
            {diffItems.filter((d) => d.changed).length > 0 && (
              <div className="flex flex-col gap-1 mt-1 border-t border-white/5 pt-2">
                <span className="font-mono text-[9px] text-director-gold font-bold">
                  Staging / Camera Deviations:
                </span>
                <div className="flex flex-wrap gap-2">
                  {diffItems
                    .filter((d) => d.changed)
                    .map((item, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-director-gold/10 px-2 py-0.5 font-mono text-[9px] text-director-gold border border-director-gold/20"
                      >
                        {item.label}: {item.valueA} → {item.valueB}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Master Synced Transport Controls (Bottom Bar) */}
        <div className="border-t border-director-border bg-black/60 px-5 py-3 flex flex-col gap-2">
          {/* Timeline Scrubber */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-director-cyan w-14 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || 5}
              step="0.01"
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="font-mono text-[10px] text-slate-400 w-14">
              {formatTime(duration)}
            </span>
          </div>

          {/* Transport buttons & Playback speed */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shadow"
                title={isPlaying ? 'Pause (Space)' : 'Play Both (Space)'}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
              </button>

              <button
                onClick={handleRestart}
                className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all border border-white/5"
                title="Restart from beginning"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              <button
                onClick={() => {
                  const nextMuted = !isMuted;
                  setIsMuted(nextMuted);
                  if (videoARef.current) videoARef.current.muted = nextMuted;
                  if (videoBRef.current) videoBRef.current.muted = nextMuted;
                }}
                className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all border border-white/5"
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Playback speed presets */}
            <div className="flex items-center gap-1.5 font-mono text-[10px]">
              <span className="text-slate-400 mr-1">Speed:</span>
              {[0.25, 0.5, 1.0].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleRateChange(rate)}
                  className={`px-2 py-0.5 rounded transition-all ${
                    playbackRate === rate
                      ? 'bg-director-gold/20 text-director-gold border border-director-gold/40 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {rate}x {rate < 1 ? '(Slow)' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
