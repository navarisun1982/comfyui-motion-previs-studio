import React, { useState, useMemo } from 'react';
import { CinematicSequence, SequenceExportFormat } from '../types/sequenceTypes';
import {
  exportToOpenTimelineIO,
  exportToCMX3600EDL,
  exportToFinalCutProXml,
} from '../engine/sequenceExporters';
import {
  FileCode,
  Copy,
  Check,
  Download,
  X,
  Film,
  Sparkles,
} from 'lucide-react';

interface SequenceExportModalProps {
  sequence: CinematicSequence;
  onClose: () => void;
}

export const SequenceExportModal: React.FC<SequenceExportModalProps> = ({
  sequence,
  onClose,
}) => {
  const [activeFormat, setActiveFormat] = useState<SequenceExportFormat>('otio');
  const [copied, setCopied] = useState(false);

  const exportedText = useMemo(() => {
    switch (activeFormat) {
      case 'otio':
        return exportToOpenTimelineIO(sequence);
      case 'edl':
        return exportToCMX3600EDL(sequence);
      case 'fcpxml':
        return exportToFinalCutProXml(sequence);
    }
  }, [sequence, activeFormat]);

  const handleCopy = () => {
    navigator.clipboard.writeText(exportedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extensions: Record<SequenceExportFormat, string> = {
      otio: 'otio',
      edl: 'edl',
      fcpxml: 'xml',
    };
    const mimeTypes: Record<SequenceExportFormat, string> = {
      otio: 'application/json',
      edl: 'text/plain',
      fcpxml: 'application/xml',
    };

    const ext = extensions[activeFormat];
    const mime = mimeTypes[activeFormat];
    const fileName = `${sequence.sceneName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Assembly.${ext}`;

    const blob = new Blob([exportedText], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="flex h-full max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-director-gold/30 bg-director-darkest shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-director-border px-5 py-3.5 bg-black/50">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-director-cyan/20 text-director-cyan">
              <Film className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                Export Timeline &amp; NLE Sequence
              </h2>
              <p className="font-mono text-[10px] text-slate-400">
                INDUSTRY STANDARD EDITORIAL INTERCHANGE (DAVINCI RESOLVE / PREMIERE / AVID / FCP)
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

        {/* Format Selector Tabs */}
        <div className="flex items-center justify-between border-b border-director-border bg-black/40 px-5 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveFormat('otio')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-all cursor-pointer ${
                activeFormat === 'otio'
                  ? 'bg-director-gold text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>OpenTimelineIO (.otio)</span>
            </button>

            <button
              onClick={() => setActiveFormat('edl')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-all cursor-pointer ${
                activeFormat === 'edl'
                  ? 'bg-director-gold text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>CMX 3600 EDL (.edl)</span>
            </button>

            <button
              onClick={() => setActiveFormat('fcpxml')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-all cursor-pointer ${
                activeFormat === 'fcpxml'
                  ? 'bg-director-gold text-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>Final Cut Pro XML (.xml)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 font-mono text-xs text-slate-200 transition-all cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
              <span>{copied ? 'Copied!' : 'Copy Code'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg bg-director-cyan hover:brightness-110 text-black px-3.5 py-1.5 font-mono text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download .{activeFormat === 'fcpxml' ? 'xml' : activeFormat}</span>
            </button>
          </div>
        </div>

        {/* Content Body: Formatted Code Preview */}
        <div className="flex-1 min-h-0 p-5 overflow-hidden flex flex-col gap-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>
              {activeFormat === 'otio' && 'Conformant OpenTimelineIO Schema 1.0 JSON format for VFX and modern NLE conform.'}
              {activeFormat === 'edl' && 'Standard CMX 3600 SMPTE Non-Drop Frame edit decision list with clip names and take notes.'}
              {activeFormat === 'fcpxml' && 'Apple Final Cut Pro 7 / DaVinci Resolve compliant XML timeline format.'}
            </span>
            <span>{sequence.shots.length} clips • {sequence.totalDurationSeconds.toFixed(1)}s total</span>
          </div>

          <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-black/80 p-4 font-mono text-xs text-slate-300 overflow-auto select-text leading-relaxed">
            <pre className="whitespace-pre">{exportedText}</pre>
          </div>

          {/* DaVinci Resolve Workflow Note */}
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-xs font-bold text-white">DaVinci Resolve Conforming Note</span>
                <span className="font-sans text-[11px] text-slate-300">
                  Import this file via <strong className="text-white">File &gt; Import &gt; Timeline (EDL/XML/OTIO)</strong> in DaVinci Resolve to recreate your complete multi-shot edit.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-director-border bg-black/60 px-5 py-3 flex items-center justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 font-mono text-xs font-bold transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
