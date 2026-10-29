import React, { useState } from 'react';
import {
  Clapperboard,
  Box,
  Download,
  X,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { safeGetItem, safeSetItem, STORAGE_KEYS } from '../services/storage';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWorkspace?: (mode: 'previs' | 'export') => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  onOpenWorkspace,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(() =>
    safeGetItem<boolean>(STORAGE_KEYS.WELCOME_DISMISSED, true)
  );

  if (!isOpen) return null;

  const handleDismiss = () => {
    safeSetItem(STORAGE_KEYS.WELCOME_DISMISSED, dontShowAgain);
    onClose();
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setDontShowAgain(checked);
    safeSetItem(STORAGE_KEYS.WELCOME_DISMISSED, checked);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/15 bg-gradient-to-b from-[#131722] via-[#0d0f17] to-[#08090d] shadow-2xl overflow-hidden text-slate-200">
        {/* Top Accent Gradient Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-500" />

        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          title="Close guide"
          aria-label="Close guide"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 md:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20">
              <Clapperboard className="h-6 w-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-mono text-amber-400 mb-1.5 font-bold">
                <Sparkles className="h-3 w-3" />
                Open-Source Replacement for Higgsfield 3D-Jutsu
              </div>
              <h2 id="welcome-modal-title" className="font-display text-xl font-bold tracking-tight text-white md:text-2xl">
                ComfyUI Motion Previs Studio
              </h2>
              <p className="font-sans text-xs text-slate-400 mt-1">
                <span className="text-white font-medium">"Direct the Shot, Not the Prompt"</span> — Bridge cinematography, 3D blocking, and local open-weights video diffusion.
              </p>
            </div>
          </div>

          {/* Core Workflows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Directing Stage */}
            <div
              onClick={() => {
                onOpenWorkspace?.('previs');
                handleDismiss();
              }}
              className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 group-hover:scale-105 transition-transform">
                  <Box className="h-4 w-4" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <h3 className="font-display text-sm font-bold text-white group-hover:text-blue-300">
                1. 3D Directing Stage
              </h3>
              <p className="font-sans text-xs text-slate-400 mt-1.5 leading-relaxed">
                Direct actors on the 3D stage, manipulate camera trajectories, set focal lengths, preview volumetric lighting, and render previs MP4s directly.
              </p>
            </div>

            {/* Previs Export Deck */}
            <div
              onClick={() => {
                onOpenWorkspace?.('export');
                handleDismiss();
              }}
              className="group cursor-pointer rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 group-hover:scale-105 transition-transform">
                  <Download className="h-4 w-4" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
              </div>
              <h3 className="font-display text-sm font-bold text-white group-hover:text-emerald-300">
                2. Previs Export Deck
              </h3>
              <p className="font-sans text-xs text-slate-400 mt-1.5 leading-relaxed">
                Export multi-pass reference videos (RGB, OpenPose, Depth) and compile camera trajectory packages for LTX-2.5, MiniMax H3, and Seedance.
              </p>
            </div>
          </div>

          {/* Directing Safety & Essential Shortcuts */}
          <div className="rounded-xl border border-white/10 bg-[#0a0c13] p-3.5 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
              Directing Safety & Shortcuts
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-slate-300">
              <div className="flex items-center gap-2">
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-amber-300 border border-white/10">
                  Ctrl + Z
                </span>
                <span>Undo edits</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-amber-300 border border-white/10">
                  Ctrl + Shift + Z
                </span>
                <span>Redo</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-cyan-300 border border-white/10">
                  ` or F12
                </span>
                <span>In-app log debugger</span>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-white/10">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-200 select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={handleCheckboxChange}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-blue-500"
              />
              <span>Don't show this guide on startup</span>
            </label>

            <button
              onClick={handleDismiss}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-6 py-2.5 font-display text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all"
            >
              <span>Start Directing</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
