import React, { useState } from 'react';
import { Download, X, FileCode, Box, Film, Check, Sparkles } from 'lucide-react';
import {
  BUNDLED_WORKFLOWS_CATALOG,
  BundledWorkflowEntry,
  downloadBundledWorkflow,
  downloadAllBundledWorkflowsPack,
} from '../services/bundledWorkflowsCatalog';

export interface BundledWorkflowsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BundledWorkflowsModal: React.FC<BundledWorkflowsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [filterCat, setFilterCat] = useState<'all' | '3d-generation' | 'video-render'>('all');
  const [downloadedId, setDownloadedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filtered = BUNDLED_WORKFLOWS_CATALOG.filter(
    (w) => filterCat === 'all' || w.category === filterCat
  );

  const handleDownloadOne = (entry: BundledWorkflowEntry, format: 'ui' | 'api') => {
    downloadBundledWorkflow(entry, format);
    const key = `${entry.id}-${format}`;
    setDownloadedId(key);
    setTimeout(() => setDownloadedId(null), 1800);
  };

  const handleDownloadAllSequential = () => {
    // Download each individual ComfyUI UI workflow (or API workflow if no UI workflow) plus the complete pack
    BUNDLED_WORKFLOWS_CATALOG.forEach((entry, idx) => {
      setTimeout(() => {
        downloadBundledWorkflow(entry, entry.uiPayload ? 'ui' : 'api');
      }, idx * 220);
    });
    setTimeout(() => {
      downloadAllBundledWorkflowsPack();
    }, BUNDLED_WORKFLOWS_CATALOG.length * 220 + 150);
    setDownloadedId('all-pack');
    setTimeout(() => setDownloadedId(null), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] rounded-2xl border border-cyan-500/35 bg-[#0b0e17] text-slate-100 shadow-2xl flex flex-col overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-white/10 bg-[#111624]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  ComfyUI Workflows Pack (3D &amp; Video)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-[10px] font-mono font-bold text-cyan-200">
                  {BUNDLED_WORKFLOWS_CATALOG.length} Bundled Workflows
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Save &amp; import all official ComfyUI workflows used in this app (Image-to-3D, Text-to-3D, MiniMax H3 &amp; LTX-2.5) into your own ComfyUI installation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadAllSequential}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
              title="Download all ComfyUI workflow .JSON files to your PC"
            >
              {downloadedId === 'all-pack' ? (
                <>
                  <Check className="h-4 w-4 text-emerald-300" />
                  <span>Downloaded All Workflows!</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Download All Workflows ({BUNDLED_WORKFLOWS_CATALOG.length})</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-rose-500/25 hover:border-rose-400/40 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 border-b border-white/10 bg-[#0d111b] text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterCat('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                filterCat === 'all'
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                  : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              All Workflows ({BUNDLED_WORKFLOWS_CATALOG.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterCat('3d-generation')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                filterCat === '3d-generation'
                  ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/50'
                  : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              <Box className="h-3.5 w-3.5 text-cyan-400" />
              <span>3D .GLB Workflows (2)</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterCat('video-render')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                filterCat === 'video-render'
                  ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                  : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              <Film className="h-3.5 w-3.5 text-amber-400" />
              <span>Video Render Workflows (3)</span>
            </button>
          </div>

          <span className="text-[11px] text-slate-400">
            Drag &amp; drop any downloaded <code className="text-cyan-300">.json</code> directly into your ComfyUI browser tab
          </span>
        </div>

        {/* Workflow Cards List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {filtered.map((wf) => {
            const isUiDownloaded = downloadedId === `${wf.id}-ui`;
            const isApiDownloaded = downloadedId === `${wf.id}-api`;

            return (
              <div
                key={wf.id}
                className="rounded-xl border border-white/10 bg-[#111623] hover:border-cyan-500/35 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                        wf.category === '3d-generation'
                          ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                      }`}
                    >
                      {wf.badge}
                    </span>
                    <h3 className="text-sm font-bold text-white">{wf.title}</h3>
                    <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/50 text-slate-400 border border-white/10">
                      {wf.workflowHash}
                    </code>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{wf.description}</p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {wf.modelsUsed.map((m) => (
                      <span
                        key={m}
                        className="px-2 py-0.5 rounded-md bg-black/40 border border-white/10 text-[10px] font-mono text-slate-300"
                      >
                        <Sparkles className="inline h-2.5 w-2.5 text-cyan-400 mr-1" />
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex sm:flex-col items-stretch sm:items-end gap-2 shrink-0">
                  {wf.uiPayload && wf.uiFilename && (
                    <button
                      type="button"
                      onClick={() => handleDownloadOne(wf, 'ui')}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-100 text-xs font-mono font-bold transition-all cursor-pointer"
                      title={`Download ${wf.uiFilename} (Drag & drop directly into ComfyUI UI)`}
                    >
                      {isUiDownloaded ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-300" />
                          <span>Saved ComfyUI .JSON!</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5 text-cyan-300" />
                          <span>Download ComfyUI .JSON</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDownloadOne(wf, 'api')}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 hover:text-white text-[11px] font-mono font-semibold transition-all cursor-pointer"
                    title={`Download ${wf.apiFilename} (ComfyUI API execution format)`}
                  >
                    {isApiDownloaded ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-300" />
                        <span>Saved API .JSON!</span>
                      </>
                    ) : (
                      <>
                        <FileCode className="h-3 w-3 text-indigo-300" />
                        <span>Download .API.JSON</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#0d111b] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
          <span>
            Also stored inside repository folder: <code className="text-cyan-300">workflows/templates/</code>
          </span>
          <button
            type="button"
            onClick={() => downloadAllBundledWorkflowsPack()}
            className="text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
          >
            Download Combined Master Pack (.json)
          </button>
        </div>
      </div>
    </div>
  );
};

