import React from 'react';
import { SequenceContinuityReport } from '../types/sequenceTypes';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  X,
  Compass,
  Film,
  Zap,
} from 'lucide-react';

interface SequenceContinuityModalProps {
  report: SequenceContinuityReport;
  onClose: () => void;
  onJumpToCut?: (cutIndex: number) => void;
}

export const SequenceContinuityModal: React.FC<SequenceContinuityModalProps> = ({
  report,
  onClose,
  onJumpToCut,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="flex h-full max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-director-gold/30 bg-director-darkest shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-director-border px-5 py-3.5 bg-black/50">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-director-gold/20 text-director-gold">
              <Compass className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                  Directorial Continuity &amp; Pacing Report
                </h2>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[9px] font-bold border ${
                    report.overallScore >= 85
                      ? 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40'
                      : report.overallScore >= 70
                      ? 'text-blue-400 bg-blue-500/20 border-blue-500/40'
                      : report.overallScore >= 50
                      ? 'text-amber-400 bg-amber-500/20 border-amber-500/40'
                      : 'text-rose-400 bg-rose-500/20 border-rose-500/40'
                  }`}
                >
                  {report.overallScore}% • {report.rating.toUpperCase()}
                </span>
              </div>
              <p className="font-mono text-[10px] text-slate-400">
                180° RULE • JUMP CUT DETECTION • MOTION FLOW • CADENCE
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 p-5 overflow-y-auto flex flex-col gap-4 text-xs">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/40 p-3 flex flex-col gap-1">
              <span className="font-mono text-[10px] text-slate-400 uppercase font-bold">Continuity Score</span>
              <span className="font-display text-xl font-bold text-director-gold">{report.overallScore}%</span>
              <span className="font-mono text-[9px] text-slate-500">
                {report.rating === 'exemplary'
                  ? 'Professional cinematic flow'
                  : report.rating === 'sound'
                  ? 'Minor pacing polish suggested'
                  : 'Noticeable spatial or rhythm breaks'}
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-3 flex flex-col gap-1">
              <span className="font-mono text-[10px] text-slate-400 uppercase font-bold">Cut Analysis</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-xl font-bold text-white">{report.cleanCutsCount}</span>
                <span className="font-mono text-xs text-slate-400">/ {report.totalCuts} Clean Cuts</span>
              </div>
              <span className="font-mono text-[9px] text-emerald-400">
                {report.totalCuts > 0 ? Math.round((report.cleanCutsCount / report.totalCuts) * 100) : 100}% verified seamless
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-3 flex flex-col gap-1">
              <span className="font-mono text-[10px] text-slate-400 uppercase font-bold">Directorial Issues</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-xl font-bold text-amber-400">{report.issues.length}</span>
                <span className="font-mono text-xs text-slate-400">Flagged</span>
              </div>
              <span className="font-mono text-[9px] text-slate-500">
                {report.issues.filter((i) => i.severity === 'error').length} Errors •{' '}
                {report.issues.filter((i) => i.severity === 'warning').length} Warnings
              </span>
            </div>
          </div>

          {/* Pacing Rhythm Box */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 flex flex-col gap-1.5">
            <span className="font-mono text-[10px] font-bold text-director-cyan uppercase flex items-center gap-1.5">
              <Film className="h-3.5 w-3.5" />
              Pacing &amp; Rhythm Assessment
            </span>
            <p className="font-sans text-[11px] text-slate-300 leading-relaxed">
              {report.pacingRhythmSummary}
            </p>
          </div>

          {/* Issue Cards */}
          <div className="flex flex-col gap-2.5">
            <span className="font-mono text-[10px] font-bold text-white uppercase">
              Cut-by-Cut Diagnostics &amp; Directorial Guidance
            </span>

            {report.issues.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-center gap-2">
                <ShieldCheck className="h-8 w-8 text-emerald-400" />
                <span className="font-mono text-xs font-bold text-white">No Continuity Issues Detected</span>
                <p className="font-sans text-[11px] text-slate-400 max-w-md">
                  All cuts adhere strictly to the 180-degree rule, match-action flow, focal length progression, and lighting mood.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {report.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3.5 flex flex-col gap-2 ${
                      issue.severity === 'error'
                        ? 'border-rose-500/30 bg-rose-500/5'
                        : issue.severity === 'warning'
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-blue-500/30 bg-blue-500/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {issue.severity === 'error' ? (
                          <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
                        ) : issue.severity === 'warning' ? (
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                        ) : (
                          <Info className="h-4 w-4 text-blue-400 shrink-0" />
                        )}
                        <span className="font-mono text-xs font-bold text-white">
                          {issue.title}
                        </span>
                      </div>

                      {onJumpToCut && (
                        <button
                          onClick={() => {
                            onJumpToCut(issue.cutIndex);
                            onClose();
                          }}
                          className="font-mono text-[9px] text-director-cyan hover:underline cursor-pointer"
                        >
                          Jump to Cut {issue.cutIndex + 1} &rarr;
                        </button>
                      )}
                    </div>

                    <p className="font-sans text-[11px] text-slate-300">
                      {issue.description}
                    </p>

                    <div className="flex items-start gap-1.5 rounded bg-black/40 p-2 border border-white/5 font-mono text-[10px] text-slate-300">
                      <Zap className="h-3 w-3 text-director-gold shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-director-gold">Directorial Fix: </strong>
                        {issue.directorRecommendation}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-director-border bg-black/60 px-5 py-3 flex items-center justify-between">
          <span className="font-mono text-[10px] text-slate-500">
            Automated Continuity Analysis Engine • ComfyUI Motion Previs Studio
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 font-mono text-xs font-bold transition-all cursor-pointer"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
