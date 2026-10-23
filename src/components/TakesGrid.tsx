import React, { useState, useRef } from 'react';
import { ShotRevisionV2, DirectorialSteeringPatch } from '../pipeline/revisionTypes';
import { useHistoryStore } from '../stores/useHistoryStore';
import { useShotStore } from '../stores/useShotStore';
import { useQueueStore } from '../stores/useQueueStore';
import { useComfyStore } from '../stores/useComfyStore';
import { QualityProfile, GenerationMode } from '../pipeline/templateTypes';
import { TakeComparisonModal } from './TakeComparisonModal';
import { DirectorialSteeringModal } from './DirectorialSteeringModal';
import { generateDirectorialSteeringPatch } from '../engine/directorialSteeringEngine';
import {
  Film,
  Star,
  CheckCircle2,
  Download,
  Trash2,
  GitCompare,
  Plus,
  Loader2,
  XCircle,
  Compass,
  Wand2,
} from 'lucide-react';
import { MotionFidelityOverlay } from './MotionFidelityOverlay';
import { analyzeVideoMotionFidelity } from '../engine/motionFidelityAnalyzer';

interface TakesGridProps {
  currentProfile?: QualityProfile;
  currentMode?: GenerationMode;
  icLoraModel?: string;
  icLoraStrength?: number;
  onNotice?: (notice: { type: 'warn' | 'error'; message: string }) => void;
}

export const TakesGrid: React.FC<TakesGridProps> = ({
  currentProfile = 'final',
  currentMode = 't2v',
  icLoraModel,
  icLoraStrength,
  onNotice,
}) => {
  const { shot, compiledPrompt, previsVideoBlob, previsVideoUrl, setTakeAsActivePlate } = useShotStore();
  const { revisions, toggleCircledTake, deleteRevision, setTakeMotionFidelity } = useHistoryStore();
  const { connectionStatus } = useComfyStore();
  const { items: queueItems, enqueueBatch, cancelItem, clearQueue } = useQueueStore();

  const [batchCount, setBatchCount] = useState<number>(3);
  const [seedStrategy, setSeedStrategy] = useState<'random' | 'sequential'>('random');
  const [filterMode, setFilterMode] = useState<'current-shot' | 'all'>('current-shot');

  // Video element references for client-side optical flow analysis
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const [analyzingTakeId, setAnalyzingTakeId] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [steeringModalTarget, setSteeringModalTarget] = useState<{
    take: ShotRevisionV2;
    patch: DirectorialSteeringPatch;
  } | null>(null);

  // A/B comparison selection state
  const [selectedForCompareId, setSelectedForCompareId] = useState<string | null>(null);
  const [compareModalPair, setCompareModalPair] = useState<{
    takeA: ShotRevisionV2;
    takeB: ShotRevisionV2;
  } | null>(null);

  // Filter takes
  const shotTakes = revisions.filter((r) =>
    filterMode === 'current-shot' ? r.shotId === shot.id : true
  );

  const activeQueuedItems = queueItems.filter(
    (item) => item.status === 'queued' || item.status === 'running'
  );

  // Trigger batch generation
  const handleEnqueueTakes = () => {
    if (connectionStatus !== 'connected') {
      const msg =
        'Local ComfyUI server is offline or unreachable on http://127.0.0.1:8188. Connect ComfyUI before queuing takes.';
      onNotice?.({ type: 'warn', message: msg });
      return;
    }

    const engine = shot.targetModel === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5';
    const mode = currentMode;

    let controlBlob: Blob | undefined = undefined;
    let controlFilename: string | undefined = undefined;

    if (mode === 'control') {
      if (previsVideoBlob) {
        controlBlob = previsVideoBlob;
      }
      if (!controlBlob && !previsVideoUrl) {
        const msg =
          'Geometric Control mode requires a rendered 3D Previs video. Render 3D Previs first.';
        onNotice?.({ type: 'warn', message: msg });
        return;
      }
      controlFilename = `${shot.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_previs.mp4`;
    }

    enqueueBatch({
      shot,
      engine,
      mode,
      profile: currentProfile,
      prompt: compiledPrompt.positivePrompt,
      negative: shot.negativePrompt,
      baseSeed: shot.seed,
      count: batchCount,
      seedStrategy,
      firstFrameFilename: mode === 'i2v' ? shot.referenceImage?.filename : undefined,
      controlVideoBlob: controlBlob,
      controlVideoFilename: controlFilename,
      icLora: mode === 'control' ? icLoraModel : undefined,
      icLoraStrength: mode === 'control' ? icLoraStrength : undefined,
    });
  };

  // Compare selection handler
  const handleCompareClick = (take: ShotRevisionV2) => {
    if (!selectedForCompareId) {
      setSelectedForCompareId(take.id);
    } else if (selectedForCompareId === take.id) {
      setSelectedForCompareId(null);
    } else {
      const takeA = revisions.find((r) => r.id === selectedForCompareId);
      if (takeA) {
        setCompareModalPair({ takeA, takeB: take });
        setSelectedForCompareId(null);
      } else {
        setSelectedForCompareId(take.id);
      }
    }
  };

  const handleDownload = (take: ShotRevisionV2) => {
    if (!take.outputVideoUrl) return;
    const a = document.createElement('a');
    a.href = take.outputVideoUrl;
    a.download = take.outputFilename || `Take_${take.takeNumber ?? take.version}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSetPlate = (take: ShotRevisionV2) => {
    if (!take.outputVideoUrl) return;
    setTakeAsActivePlate(
      take.outputVideoUrl,
      take.outputFilename || `Take_${take.takeNumber ?? take.version}.mp4`
    );
  };

  const handleAnalyzeMotion = async (take: ShotRevisionV2) => {
    const videoEl = videoRefs.current[take.id];
    if (!videoEl || !take.outputVideoUrl) {
      onNotice?.({
        type: 'warn',
        message: 'Video element not ready for optical flow motion analysis. Ensure video is loaded.',
      });
      return;
    }

    try {
      setAnalyzingTakeId(take.id);
      setAnalysisProgress(10);
      const analysis = await analyzeVideoMotionFidelity(
        videoEl,
        take.shotSpec || shot,
        (progress) => setAnalysisProgress(progress)
      );
      setTakeMotionFidelity(take.id, analysis);
    } catch (err: any) {
      onNotice?.({
        type: 'error',
        message: `Motion analysis failed: ${err?.message || 'Optical flow error'}`,
      });
    } finally {
      setAnalyzingTakeId(null);
      setAnalysisProgress(0);
    }
  };

  const handleAutoSteer = (take: ShotRevisionV2) => {
    const { patch } = generateDirectorialSteeringPatch(take, {
      currentIcLoraStrength: icLoraStrength,
    });
    setSteeringModalTarget({ take, patch });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-director-border bg-black/40 p-4">
      {/* Header & Controls Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-director-gold/20 text-director-gold">
            <Film className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                Takes Contact Sheet & Multi-Seed Queue
              </h3>
              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[9px] text-slate-300">
                {shotTakes.length} {shotTakes.length === 1 ? 'Take' : 'Takes'}
              </span>
            </div>
            <p className="font-mono text-[10px] text-slate-400">
              DIRECTOR REVIEW, CIRCLING HERO TAKES & A/B COMPARISON
            </p>
          </div>
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-black/60 p-0.5 border border-white/10 font-mono text-[9px]">
            <button
              onClick={() => setFilterMode('current-shot')}
              className={`px-2 py-1 rounded transition-all ${
                filterMode === 'current-shot'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Current Shot
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2 py-1 rounded transition-all ${
                filterMode === 'all'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Shots
            </button>
          </div>
        </div>
      </div>

      {/* MULTI-SEED ENQUEUE CONTROLS */}
      <div className="rounded-lg border border-white/5 bg-white/5 p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-300">
            <span>Takes to Queue:</span>
            <div className="flex rounded bg-black/60 p-0.5 border border-white/10">
              {[1, 3, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setBatchCount(n)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-all cursor-pointer ${
                    batchCount === n
                      ? 'bg-director-gold/20 text-director-gold border border-director-gold/40 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-300">
            <span>Seed Mode:</span>
            <div className="flex rounded bg-black/60 p-0.5 border border-white/10">
              <button
                onClick={() => setSeedStrategy('random')}
                className={`px-2 py-0.5 rounded text-[10px] transition-all cursor-pointer ${
                  seedStrategy === 'random'
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Generate distinct random RNG seeds for each take"
              >
                Random
              </button>
              <button
                onClick={() => setSeedStrategy('sequential')}
                className={`px-2 py-0.5 rounded text-[10px] transition-all cursor-pointer ${
                  seedStrategy === 'sequential'
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Sequential RNG seeds: baseSeed, baseSeed+1, baseSeed+2..."
              >
                Sequential (+1)
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleEnqueueTakes}
          className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-mono text-xs font-bold px-4 py-2 transition-all shadow-md active:scale-95 cursor-pointer"
          title={`Queue ${batchCount} take(s) in ComfyUI`}
        >
          <Plus className="h-4 w-4" />
          <span>Queue {batchCount} Take{batchCount > 1 ? 's' : ''}</span>
        </button>
      </div>

      {/* ACTIVE QUEUE STATUS (IF ANY RUNNING OR QUEUED) */}
      {activeQueuedItems.length > 0 && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-1.5 font-mono text-[10px]">
            <div className="flex items-center gap-2 text-blue-300 font-bold">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
              <span>Generation Queue Active ({activeQueuedItems.length} in queue)</span>
            </div>
            <button
              onClick={() => clearQueue()}
              className="text-rose-400 hover:text-rose-300 text-[10px] underline"
              title="Cancel all queued jobs"
            >
              Clear Remaining Queue
            </button>
          </div>

          <div className="flex flex-col gap-2 max-h-36 overflow-y-auto">
            {activeQueuedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded bg-black/50 p-2 font-mono text-[10px] border border-white/5"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-bold text-white">Take {item.takeNumber}</span>
                  <span className="text-slate-400">({item.engine}, Seed {item.seed})</span>
                  {item.status === 'running' ? (
                    <span className="text-blue-400 truncate max-w-xs">
                      • {item.currentNodeTitle || 'Executing'} ({item.progress}%)
                    </span>
                  ) : (
                    <span className="text-slate-500">• Queued</span>
                  )}
                </div>

                <button
                  onClick={() => cancelItem(item.id)}
                  className="text-rose-400 hover:text-rose-300 p-1"
                  title="Cancel this take"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* A/B SELECTION PROMPT BANNER */}
      {selectedForCompareId && (
        <div className="rounded-lg border border-director-gold/40 bg-director-gold/10 p-2.5 flex items-center justify-between font-mono text-xs text-director-gold">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            <span>
              <strong>Take selected for A/B comparison!</strong> Click &quot;Compare (A/B)&quot; on any other take to launch side-by-side review.
            </span>
          </div>
          <button
            onClick={() => setSelectedForCompareId(null)}
            className="text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      )}

      {/* TAKES GRID / CONTACT SHEET */}
      {shotTakes.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 rounded-lg border border-dashed border-director-border bg-black/20">
          <Film className="h-8 w-8 stroke-1 mb-2 text-slate-600" />
          <p className="font-display font-semibold text-slate-300 text-xs">
            No Generated Takes Yet for this Shot
          </p>
          <p className="text-[11px] max-w-sm mt-1">
            Click <strong>&quot;DIFFUSE SHOT IN COMFYUI&quot;</strong> or <strong>&quot;Queue Takes&quot;</strong> above to generate takes with varying seeds and settings.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {shotTakes.map((take) => {
            const isComparingThis = selectedForCompareId === take.id;
            return (
              <div
                key={take.id}
                className={`flex flex-col rounded-xl border bg-black/40 overflow-hidden transition-all duration-200 ${
                  take.isCircled
                    ? 'border-director-gold/60 ring-1 ring-director-gold/30 shadow-lg shadow-director-gold/5'
                    : isComparingThis
                    ? 'border-blue-500 ring-2 ring-blue-500/50'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* Take Card Header */}
                <div className="flex items-center justify-between px-3 py-2 bg-black/60 border-b border-white/5 font-mono text-[10px]">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-display font-bold text-xs text-white">
                      Take {take.takeNumber ?? take.version}
                    </span>
                    {take.isCircled && (
                      <span className="flex items-center gap-1 rounded bg-director-gold/20 px-1.5 py-0.5 font-mono text-[8px] font-bold text-director-gold border border-director-gold/40">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        CIRCLED HERO
                      </span>
                    )}
                    {take.steeredFromTakeId && (() => {
                      const src = revisions.find((r) => r.id === take.steeredFromTakeId);
                      const delta = (take.motionFidelity?.overallScore ?? 0) - (src?.motionFidelity?.overallScore ?? 0);
                      return (
                        <span
                          className="flex items-center gap-1 rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[8px] font-bold text-indigo-300 border border-indigo-500/30"
                          title={`Steered from Take ${src?.takeNumber ?? src?.version ?? '?'}`}
                        >
                          <Wand2 className="h-2.5 w-2.5" />
                          <span>STEERED {take.motionFidelity && src?.motionFidelity && delta > 0 ? `(+${delta}%)` : ''}</span>
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleCircledTake(take.id)}
                      className={`p-1 rounded transition-colors ${
                        take.isCircled
                          ? 'text-director-gold bg-director-gold/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                      title={take.isCircled ? 'Uncircle take' : 'Mark as Circled Hero Take (⭐)'}
                    >
                      <Star className={`h-3.5 w-3.5 ${take.isCircled ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      onClick={() => deleteRevision(take.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-white/10 transition-colors"
                      title="Delete take"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Video Preview */}
                <div className="relative aspect-video w-full bg-black flex items-center justify-center group overflow-hidden">
                  {take.outputVideoUrl ? (
                    <>
                      <video
                        ref={(el) => {
                          videoRefs.current[take.id] = el;
                        }}
                        src={take.outputVideoUrl}
                        controls
                        playsInline
                        crossOrigin="anonymous"
                        preload="auto"
                        className="h-full w-full object-contain"
                      />
                      {take.motionFidelity && (
                        <MotionFidelityOverlay
                          analysis={take.motionFidelity}
                          onAutoSteer={() => handleAutoSteer(take)}
                        />
                      )}
                    </>
                  ) : (
                    <div className="text-slate-500 font-mono text-[10px]">No video output</div>
                  )}
                </div>

                {/* Badges & Parameters */}
                <div className="p-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-slate-400">
                    <span className="rounded bg-black/60 px-1.5 py-0.5 border border-white/5">
                      Seed: <strong className="text-director-cyan">{take.seed}</strong>
                    </span>
                    <span className="rounded bg-black/60 px-1.5 py-0.5 border border-white/5 uppercase">
                      {take.engine}
                    </span>
                    <span className="rounded bg-black/60 px-1.5 py-0.5 border border-white/5 uppercase">
                      {take.mode}
                    </span>
                    <span className="rounded bg-black/60 px-1.5 py-0.5 border border-white/5 capitalize">
                      {take.profile}
                    </span>
                  </div>

                  {/* Motion Fidelity Status & Auto-Steering Trigger */}
                  <div className="flex items-center justify-between font-mono text-[9px] pt-1 border-t border-white/5 flex-wrap gap-1">
                    <span className="text-slate-400">Motion Fidelity:</span>
                    {take.motionFidelity ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            take.motionFidelity.overallScore >= 85
                              ? 'text-emerald-400 bg-emerald-500/20'
                              : take.motionFidelity.overallScore >= 70
                              ? 'text-blue-400 bg-blue-500/20'
                              : take.motionFidelity.overallScore >= 50
                              ? 'text-amber-400 bg-amber-500/20'
                              : 'text-rose-400 bg-rose-500/20'
                          }`}
                        >
                          {take.motionFidelity.overallScore}% ({take.motionFidelity.classification.toUpperCase()})
                        </span>
                        <button
                          onClick={() => handleAnalyzeMotion(take)}
                          disabled={analyzingTakeId === take.id}
                          className="text-[9px] text-slate-400 hover:text-white underline cursor-pointer disabled:opacity-50"
                          title="Re-run optical flow analysis"
                        >
                          {analyzingTakeId === take.id ? `${analysisProgress}%` : 'Re-score'}
                        </button>
                        <button
                          onClick={() => handleAutoSteer(take)}
                          className="flex items-center gap-1 rounded bg-director-gold/20 hover:bg-director-gold/30 text-director-gold border border-director-gold/40 px-2 py-0.5 text-[9px] font-bold transition-all cursor-pointer shadow-sm active:scale-95 ml-1"
                          title="Open Closed-Loop Auto-Steering to correct drift"
                        >
                          <Wand2 className="h-3 w-3" />
                          <span>Auto-Steer</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleAnalyzeMotion(take)}
                          disabled={analyzingTakeId === take.id || !take.outputVideoUrl}
                          className="flex items-center gap-1 rounded bg-director-gold/15 hover:bg-director-gold/25 text-director-gold border border-director-gold/30 px-2 py-0.5 font-bold transition-all cursor-pointer disabled:opacity-50"
                          title="Run optical flow analysis against directed 3D camera trajectory"
                        >
                          {analyzingTakeId === take.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>Scoring ({analysisProgress}%)...</span>
                            </>
                          ) : (
                            <>
                              <Compass className="h-3 w-3" />
                              <span>Score Motion</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleAutoSteer(take)}
                          className="flex items-center gap-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 px-2 py-0.5 text-[9px] font-semibold transition-all cursor-pointer"
                          title="Open Closed-Loop Steering"
                        >
                          <Wand2 className="h-3 w-3" />
                          <span>Steer</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/5">
                    <button
                      onClick={() => handleSetPlate(take)}
                      className="flex items-center gap-1 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 px-2 py-1 font-mono text-[9px] font-bold transition-all cursor-pointer"
                      title="Inject this take into the 3D Soundstage & Video Deck as active background plate"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Set as Plate</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCompareClick(take)}
                        className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[9px] font-semibold border transition-all cursor-pointer ${
                          isComparingThis
                            ? 'bg-director-gold text-black border-director-gold font-bold'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/10'
                        }`}
                        title="Compare this take with another take in A/B split player"
                      >
                        <GitCompare className="h-3 w-3" />
                        <span>{isComparingThis ? 'Selected A' : 'Compare'}</span>
                      </button>

                      <button
                        onClick={() => handleDownload(take)}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Download MP4 video"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SYNCHRONIZED A/B TAKE COMPARISON MODAL */}
      {compareModalPair && (
        <TakeComparisonModal
          takeA={compareModalPair.takeA}
          takeB={compareModalPair.takeB}
          onClose={() => setCompareModalPair(null)}
        />
      )}

      {/* CLOSED-LOOP DIRECTORIAL AUTO-STEERING MODAL */}
      {steeringModalTarget && (
        <DirectorialSteeringModal
          sourceTake={steeringModalTarget.take}
          patch={steeringModalTarget.patch}
          currentProfile={currentProfile}
          currentMode={currentMode}
          onClose={() => setSteeringModalTarget(null)}
          onNotice={onNotice}
        />
      )}
    </div>
  );
};
