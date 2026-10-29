import React from 'react';
import { ShotRevisionV2, DirectorialSteeringPatch } from '../pipeline/revisionTypes';
import { useShotStore } from '../stores/useShotStore';
import { useQueueStore } from '../stores/useQueueStore';
import { QualityProfile, GenerationMode } from '../pipeline/templateTypes';
import {
  Wand2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  X,
  Compass,
  Zap,
} from 'lucide-react';

interface DirectorialSteeringModalProps {
  sourceTake: ShotRevisionV2;
  patch: DirectorialSteeringPatch;
  currentProfile?: QualityProfile;
  currentMode?: GenerationMode;
  onClose: () => void;
  onNotice?: (notice: { type: 'warn' | 'error'; message: string }) => void;
}

export const DirectorialSteeringModal: React.FC<DirectorialSteeringModalProps> = ({
  sourceTake,
  patch,
  currentProfile = 'final',
  currentMode = 't2v',
  onClose,
  onNotice: _onNotice,
}) => {
  const { shot, loadShot, previsVideoBlob } = useShotStore();
  const { enqueueBatch } = useQueueStore();

  const handleApplyToActiveShot = () => {
    const currentSeed = shot.seed ?? 42;
    loadShot({
      ...shot,
      negativePrompt: patch.steeredNegativePrompt,
      seed: patch.suggestedSeedOffset ? (currentSeed + patch.suggestedSeedOffset) % 2147483647 : currentSeed,
    });
    onClose();
  };

  const handleApplyAndQueue = () => {
    // Apply to shot
    const currentSeed = shot.seed ?? 42;
    const newSeed = patch.suggestedSeedOffset
      ? (currentSeed + patch.suggestedSeedOffset) % 2147483647
      : currentSeed;

    loadShot({
      ...shot,
      negativePrompt: patch.steeredNegativePrompt,
      seed: newSeed,
    });

    const engine = shot.targetModel === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5';
    const mode = currentMode;

    let controlBlob: Blob | undefined = undefined;
    let controlFilename: string | undefined = undefined;

    if (mode === 'control') {
      if (previsVideoBlob) {
        controlBlob = previsVideoBlob;
      }
      controlFilename = `${shot.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_previs.mp4`;
    }

    // Queue 1 steered take with steering metadata
    enqueueBatch({
      shot: {
        ...shot,
        seed: newSeed,
        negativePrompt: patch.steeredNegativePrompt,
      },
      engine,
      mode,
      profile: currentProfile,
      prompt: patch.steeredPositivePrompt,
      negative: patch.steeredNegativePrompt,
      baseSeed: newSeed,
      count: 1,
      seedStrategy: 'sequential',
      controlVideoBlob: controlBlob,
      controlVideoFilename: controlFilename,
      icLoraStrength: patch.steeredIcLoraStrength,
      steeredFromTakeId: sourceTake.id,
      steeringPatch: patch,
    });

    onClose();
  };

  const fidelity = sourceTake.motionFidelity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-director-gold/30 bg-director-darkest shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-director-border px-5 py-3.5 bg-black/50">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-director-gold/20 text-director-gold">
              <Wand2 className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                  Directorial Closed-Loop Auto-Steering
                </h2>
                <span className="rounded bg-director-gold/20 px-2 py-0.5 font-mono text-[9px] font-bold text-director-gold border border-director-gold/30">
                  Take {sourceTake.takeNumber ?? sourceTake.version}
                </span>
              </div>
              <p className="font-mono text-[10px] text-slate-400">
                CLOSED-LOOP TRAJECTORY COMPENSATION GENERATED FROM OPTICAL FLOW
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 p-5 overflow-y-auto flex flex-col gap-4 text-xs">
          {/* Diagnostic Context Card */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-director-cyan" />
                <span className="font-mono text-xs font-bold text-white uppercase">
                  Motion Drift Diagnostic
                </span>
              </div>

              {fidelity && (
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${
                    fidelity.overallScore >= 85
                      ? 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40'
                      : fidelity.overallScore >= 70
                      ? 'text-blue-400 bg-blue-500/20 border-blue-500/40'
                      : fidelity.overallScore >= 50
                      ? 'text-amber-400 bg-amber-500/20 border-amber-500/40'
                      : 'text-rose-400 bg-rose-500/20 border-rose-500/40'
                  }`}
                >
                  {fidelity.overallScore}% FIDELITY • {fidelity.classification.toUpperCase()}
                </span>
              )}
            </div>

            <p className="font-sans text-[11px] text-slate-300 leading-relaxed">
              {patch.reason}
            </p>

            {/* Directorial Directives List */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
              <span className="font-mono text-[10px] font-bold text-director-gold uppercase">
                Applied Directorial Compensations:
              </span>
              <div className="flex flex-col gap-1">
                {patch.appliedDirectives.map((directive, idx) => (
                  <div key={idx} className="flex items-center gap-2 font-mono text-[10px] text-slate-300">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                    <span>{directive}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Steered Parameters Diff */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Positive Prompt Steering */}
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/40 p-3.5">
              <span className="font-mono text-[10px] font-bold text-director-cyan uppercase">
                Steered Positive Prompt (Reinforced Verbs)
              </span>
              <div className="rounded bg-black/60 p-2.5 font-mono text-[10px] text-slate-300 leading-relaxed border border-white/5 max-h-36 overflow-y-auto">
                {patch.steeredPositivePrompt}
              </div>
              <span className="font-mono text-[9px] text-slate-500">
                Adds weighted camera action clauses: (deliberate camera..., tracking shot:1.35)
              </span>
            </div>

            {/* Negative Prompt Counter-Steering */}
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/40 p-3.5">
              <span className="font-mono text-[10px] font-bold text-rose-400 uppercase">
                Steered Negative Prompt (Counter-Movement Suppression)
              </span>
              <div className="rounded bg-black/60 p-2.5 font-mono text-[10px] text-slate-300 leading-relaxed border border-white/5 max-h-36 overflow-y-auto">
                {patch.steeredNegativePrompt || '(None)'}
              </div>
              <span className="font-mono text-[9px] text-slate-500">
                Suppresses opposite drift vectors and unwanted camera motions
              </span>
            </div>
          </div>

          {/* Conditioning Modulation & Seed Offset */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-3.5 font-mono">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 uppercase font-bold">
                  IC-LoRA Geometry Weight
                </span>
                <span className="text-[9px] text-slate-500">
                  Controls 3D previs pass adherence
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">{patch.originalIcLoraStrength ?? 1.0}x</span>
                <ArrowRight className="h-3 w-3 text-slate-600" />
                <span className="font-bold text-director-gold">
                  {patch.steeredIcLoraStrength ?? 1.25}x
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 p-3.5 font-mono">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 uppercase font-bold">
                  Target RNG Seed
                </span>
                <span className="text-[9px] text-slate-500">
                  Escapes drift attractor basin
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">{sourceTake.seed}</span>
                <ArrowRight className="h-3 w-3 text-slate-600" />
                <span className="font-bold text-director-cyan">
                  {(sourceTake.seed + (patch.suggestedSeedOffset ?? 107)) % 2147483647}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-director-border bg-black/60 px-5 py-3.5 flex items-center justify-between">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 font-mono text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleApplyToActiveShot}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 font-mono text-xs font-semibold text-slate-200 transition-all cursor-pointer"
              title="Apply steered prompts and parameters to active shot without queuing"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Apply to Active Shot</span>
            </button>

            <button
              onClick={handleApplyAndQueue}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-director-gold to-amber-500 hover:brightness-110 text-black px-4 py-2 font-mono text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer"
              title="Apply steering and immediately enqueue re-take in ComfyUI"
            >
              <Zap className="h-4 w-4 fill-current" />
              <span>Apply &amp; Queue Steered Re-Take</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
