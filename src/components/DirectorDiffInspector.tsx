import React from 'react';
import { useHistoryStore, computeShotDiff } from '../stores/useHistoryStore';
import { useShotStore } from '../stores/useShotStore';
import { History, GitCompare, RotateCcw, CheckCircle2, ChevronRight, Video } from 'lucide-react';

export const DirectorDiffInspector: React.FC = () => {
  const { revisions, activeRevisionId, comparisonRevisionId, setActiveRevision, setComparisonRevision, getRevision } =
    useHistoryStore();
  const { loadShot } = useShotStore();

  const revA = getRevision(activeRevisionId || '') || revisions[0];
  const revB = getRevision(comparisonRevisionId || '') || (revisions.length > 1 ? revisions[1] : undefined);

  const diffItems = revA && revB ? computeShotDiff(revA.shotSpec, revB.shotSpec) : [];

  return (
    <div className="flex h-full w-full flex-col bg-director-darkest p-6 text-xs text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-director-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-director-cyan/20 text-director-cyan">
            <GitCompare className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold uppercase tracking-wider text-white">
              Director Diff Inspector
            </h2>
            <p className="font-mono text-[10px] text-slate-400">
              SIDE-BY-SIDE REVISION COMPARISON & PARAMETER TRACEABILITY
            </p>
          </div>
        </div>

        {revA && (
          <button
            onClick={() => loadShot(revA.shotSpec)}
            className="flex items-center gap-1.5 rounded-lg bg-director-gold/20 px-3 py-1.5 font-mono text-xs font-semibold text-director-gold border border-director-gold/40 transition-all hover:bg-director-gold hover:text-director-darkest active:scale-95"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restore Revision {revA.version} to Studio
          </button>
        )}
      </div>

      {revisions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-12 text-center text-slate-500">
          <History className="h-10 w-10 stroke-1 mb-3 text-slate-600" />
          <p className="font-display font-semibold text-slate-300">No Shot Revisions Recorded Yet</p>
          <p className="text-xs max-w-sm mt-1">
            Whenever you direct a shot or execute a generation, AI Director Studio records an immutable revision slate.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 pt-4">
          {/* Revision Selectors Bar */}
          <div className="grid grid-cols-2 gap-4">
            {/* Revision A (Baseline) */}
            <div className="glass-card rounded-lg p-3 flex flex-col gap-2">
              <label className="font-mono text-[10px] text-director-gold font-bold uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Baseline Revision (A)
              </label>
              <select
                value={revA?.id || ''}
                onChange={(e) => setActiveRevision(e.target.value)}
                className="glass-control rounded p-2 text-xs text-white"
              >
                {revisions.map((r) => (
                  <option key={r.id} value={r.id} className="bg-director-panel text-white">
                    v{r.version} — {r.note} ({new Date(r.timestamp).toLocaleTimeString()})
                  </option>
                ))}
              </select>
            </div>

            {/* Revision B (Comparison Target) */}
            <div className="glass-card rounded-lg p-3 flex flex-col gap-2">
              <label className="font-mono text-[10px] text-director-cyan font-bold uppercase tracking-wider flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                Comparison Revision (B)
              </label>
              <select
                value={revB?.id || ''}
                onChange={(e) => setComparisonRevision(e.target.value)}
                className="glass-control rounded p-2 text-xs text-white"
              >
                {revisions.map((r) => (
                  <option key={r.id} value={r.id} className="bg-director-panel text-white">
                    v{r.version} — {r.note} ({new Date(r.timestamp).toLocaleTimeString()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Video Output Comparison Side-by-Side */}
          {revA && revB && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2 rounded-xl border border-director-border bg-director-dark p-3">
                <span className="font-mono text-[10px] text-director-gold font-bold">
                  REVISION {revA.version} VIDEO OUTPUT
                </span>
                {revA.outputVideoUrl ? (
                  <video
                    src={revA.outputVideoUrl}
                    controls
                    loop
                    className="w-full aspect-video rounded-lg bg-black object-contain border border-director-border"
                  />
                ) : (
                  <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-director-border/60 bg-director-darkest text-slate-500 font-mono text-[11px]">
                    <Video className="h-6 w-6 stroke-1 mb-1 text-slate-600" />
                    No video render artifact saved for Revision {revA.version}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-director-border bg-director-dark p-3">
                <span className="font-mono text-[10px] text-director-cyan font-bold">
                  REVISION {revB.version} VIDEO OUTPUT
                </span>
                {revB.outputVideoUrl ? (
                  <video
                    src={revB.outputVideoUrl}
                    controls
                    loop
                    className="w-full aspect-video rounded-lg bg-black object-contain border border-director-border"
                  />
                ) : (
                  <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-director-border/60 bg-director-darkest text-slate-500 font-mono text-[11px]">
                    <Video className="h-6 w-6 stroke-1 mb-1 text-slate-600" />
                    No video render artifact saved for Revision {revB.version}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Parameter Diff Table */}
          {diffItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
                Directorial Parameter Changes
              </h3>
              <div className="overflow-hidden rounded-xl border border-director-border bg-director-dark/80">
                <table className="w-full text-left font-sans text-xs">
                  <thead className="border-b border-director-border bg-director-panel font-mono text-[10px] text-slate-400">
                    <tr>
                      <th className="py-2.5 px-4">Parameter</th>
                      <th className="py-2.5 px-4 text-director-gold">Revision {revA?.version} (A)</th>
                      <th className="py-2.5 px-4 text-director-cyan">Revision {revB?.version} (B)</th>
                      <th className="py-2.5 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-director-border/40 font-mono text-[11px]">
                    {diffItems.map((item, idx) => (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          item.changed ? 'bg-director-gold/5 font-semibold text-white' : 'text-slate-400'
                        }`}
                      >
                        <td className="py-2 px-4 font-sans text-xs flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-mono">[{item.category}]</span>
                          {item.label}
                        </td>
                        <td className="py-2 px-4 text-slate-300 truncate max-w-xs">{item.valueA}</td>
                        <td className="py-2 px-4 text-slate-300 truncate max-w-xs">{item.valueB}</td>
                        <td className="py-2 px-4 text-right">
                          {item.changed ? (
                            <span className="rounded bg-director-amber/20 px-1.5 py-0.5 text-[9px] text-director-amber font-bold">
                              MODIFIED
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-500">IDENTICAL</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compiled Prompt Diff */}
          {revA && revB && (
            <div className="flex flex-col gap-2">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
                Compiled Model Prompt Diff
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-director-border bg-director-panel p-3 font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                  <span className="block font-bold text-director-gold mb-1">PROMPT (v{revA.version}):</span>
                  {revA.compiledPrompt}
                </div>
                <div className="rounded-lg border border-director-border bg-director-panel p-3 font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                  <span className="block font-bold text-director-cyan mb-1">PROMPT (v{revB.version}):</span>
                  {revB.compiledPrompt}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
