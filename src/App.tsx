import { useState, useEffect } from 'react';
import { useShotStore } from './stores/useShotStore';
import { useComfyStore } from './stores/useComfyStore';
import { useHistoryStore } from './stores/useHistoryStore';
import { StagePrevis } from './components/StagePrevis';
import { CameraDeck } from './components/CameraDeck';
import { ActorBlocking } from './components/ActorBlocking';
import { DirectorTimeline } from './components/DirectorTimeline';
import { DirectorDiffInspector } from './components/DirectorDiffInspector';
import { ComfyExecutionPanel } from './components/ComfyExecutionPanel';
import { InAppDebugger, DebuggerTogglePill } from './components/InAppDebugger';
import { ComfyConnectionModal } from './components/ComfyConnectionModal';
import { CinematicPresetsModal } from './components/CinematicPresetsModal';
import { useLogStore } from './stores/useLogStore';
import {
  Clapperboard,
  Camera,
  Users,
  Sun,
  GitCompare,
  Code2,
  RotateCcw,
  Sparkles,
  Settings,
} from 'lucide-react';

type StudioTab = 'directing' | 'diff';
type LeftPanelTab = 'camera' | 'actors' | 'environment';

export default function App() {
  const { shot, validation, compiledPrompt, resetToDefault } = useShotStore();
  const { connectionStatus, systemStats, openSettings, isMockMode } = useComfyStore();
  const { revisions } = useHistoryStore();

  const [activeStudioTab, setActiveStudioTab] = useState<StudioTab>('directing');
  const [leftTab, setLeftTab] = useState<LeftPanelTab>('camera');
  const [showPromptModal, setShowPromptModal] = useState<boolean>(false);
  const [showPresetsModal, setShowPresetsModal] = useState<boolean>(false);
  const { toggleOpen: toggleDebugger } = useLogStore();

  // Keyboard shortcut: Press `~` or `F12` to toggle in-app debugger
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        toggleDebugger();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDebugger]);

  return (
    <div className="flex h-screen w-screen flex-col bg-director-darkest text-slate-100 font-sans overflow-hidden">
      {/* Top Main Navigation Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-director-border px-5 glass-panel z-20">
        {/* Brand & Mission */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-director-gold to-director-amber text-director-darkest font-black shadow-glow-gold">
            <Clapperboard className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-extrabold text-sm tracking-wider text-white">
                AI DIRECTOR STUDIO
              </h1>
              <span className="rounded bg-director-gold/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-director-gold border border-director-gold/30">
                OCT 2026 EDITION
              </span>
            </div>
            <p className="font-mono text-[10px] text-slate-400">DIRECT THE SHOT, NOT THE PROMPT</p>
          </div>
        </div>

        {/* Studio Workspace Mode Tabs */}
        <div className="flex items-center rounded-lg bg-director-surface p-1 border border-director-border">
          <button
            onClick={() => setActiveStudioTab('directing')}
            className={`flex items-center gap-2 rounded-md px-3 py-1 font-display text-xs font-semibold tracking-wide transition-all ${
              activeStudioTab === 'directing'
                ? 'bg-director-gold text-director-darkest shadow-glow-gold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            Stage & Directing
          </button>

          <button
            onClick={() => setActiveStudioTab('diff')}
            className={`flex items-center gap-2 rounded-md px-3 py-1 font-display text-xs font-semibold tracking-wide transition-all ${
              activeStudioTab === 'diff'
                ? 'bg-director-cyan text-director-darkest shadow-glow-cyan'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" />
            Director Diff
            {revisions.length > 0 && (
              <span className="rounded-full bg-director-panel px-1.5 py-0.2 font-mono text-[9px] text-white">
                {revisions.length}
              </span>
            )}
          </button>
        </div>

        {/* Backend & Hardware Status */}
        <div className="flex items-center gap-2.5 font-mono text-xs">
          {/* Directing Mood Presets Button */}
          <button
            onClick={() => setShowPresetsModal(true)}
            className="flex items-center gap-1.5 rounded-lg glass-control px-2.5 py-1 text-[11px] text-director-gold hover:text-white border-director-gold/40 hover:border-director-gold transition-all"
            title="Choose a cinematic mood preset (direct by feeling)"
          >
            <Sparkles className="h-3.5 w-3.5 text-director-gold" />
            <span>Directing Presets</span>
          </button>

          {/* Settings & ComfyUI Connection Button */}
          <button
            onClick={openSettings}
            className="flex items-center gap-1.5 rounded-lg glass-control px-2.5 py-1 text-[11px] text-slate-200 hover:text-white border-slate-700 hover:border-director-cyan transition-all"
            title="ComfyUI Connection & Directing Engine Settings"
          >
            <Settings className="h-3.5 w-3.5 text-director-cyan" />
            <span>Settings</span>
          </button>

          {/* In-App Debugger Console Pill */}
          <DebuggerTogglePill />

          {/* Quick Prompt Inspector Button */}
          <button
            onClick={() => setShowPromptModal(!showPromptModal)}
            className="flex items-center gap-1.5 rounded-lg glass-control px-2.5 py-1 text-[11px] text-slate-300 hover:text-white"
            title="Inspect compiled prompt"
          >
            <Code2 className="h-3.5 w-3.5 text-director-gold" />
            <span>Prompt</span>
          </button>

          <button
            onClick={resetToDefault}
            className="flex items-center gap-1 rounded-lg glass-control px-2 py-1 text-[11px] text-slate-400 hover:text-white"
            title="Reset Shot to Default"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>

          {/* Comfy Status Pill (Clickable to open settings) */}
          <button
            onClick={openSettings}
            className="flex items-center gap-2 rounded-lg border border-director-border bg-director-surface px-2.5 py-1 hover:border-director-gold/60 transition-all text-left"
            title="Click to configure ComfyUI connection"
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                isMockMode
                  ? 'bg-director-cyan'
                  : connectionStatus === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-rose-400'
              }`}
            />
            <div className="flex flex-col text-[10px] leading-tight">
              <span className="text-white font-semibold">
                {isMockMode ? 'Mock Engine Active' : connectionStatus === 'connected' ? 'ComfyUI Online' : 'ComfyUI Offline'}
              </span>
              <span className="text-slate-400 truncate max-w-[130px]">
                {isMockMode ? 'Offline Previs' : systemStats ? `${systemStats.gpuName.split(' ')[0]} ${systemStats.gpuName.split(' ')[1]} (${systemStats.vramFreeGb}GB free)` : ':8188'}
              </span>
            </div>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      {activeStudioTab === 'directing' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Column: Directing Controls (Camera / Actors / Environment) */}
          <aside className="flex w-84 flex-col border-r border-director-border bg-director-darkest/95 shrink-0">
            {/* Sub-Tabs */}
            <div className="flex border-b border-director-border bg-director-panel font-mono text-[11px]">
              <button
                onClick={() => setLeftTab('camera')}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 transition-all ${
                  leftTab === 'camera'
                    ? 'border-b-2 border-director-gold font-bold text-director-gold bg-director-darkest/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Camera className="h-3.5 w-3.5" />
                Camera
              </button>

              <button
                onClick={() => setLeftTab('actors')}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 transition-all ${
                  leftTab === 'actors'
                    ? 'border-b-2 border-emerald-400 font-bold text-emerald-400 bg-director-darkest/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Actors ({shot.actors.length})
              </button>

              <button
                onClick={() => setLeftTab('environment')}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 transition-all ${
                  leftTab === 'environment'
                    ? 'border-b-2 border-director-cyan font-bold text-director-cyan bg-director-darkest/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                Scene
              </button>
            </div>

            {/* Active Control Content */}
            <div className="flex-1 overflow-y-auto">
              {leftTab === 'camera' && <CameraDeck />}
              {leftTab === 'actors' && <ActorBlocking />}
              {leftTab === 'environment' && <DirectorTimeline />}
            </div>
          </aside>

          {/* Center Column: 2D Stage Previsualization */}
          <main className="flex flex-1 flex-col overflow-hidden">
            <StagePrevis />
          </main>

          {/* Right Column: Execution, Reference Image & Output Video */}
          <aside className="flex w-96 flex-col border-l border-director-border bg-director-darkest/95 shrink-0 overflow-y-auto">
            <ComfyExecutionPanel />

            {/* Capability Breakdown & Warnings */}
            <div className="flex flex-col gap-2 p-4 pt-0">
              <span className="font-mono text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Directorial Capability Mapping
              </span>
              <div className="flex flex-col gap-1.5 rounded-lg border border-director-border bg-director-panel p-2.5 font-mono text-[10px]">
                {validation.capabilityNotes.map((note, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-slate-300">
                    <span
                      className={`rounded px-1 text-[8px] font-bold uppercase shrink-0 mt-0.5 ${
                        note.tier === 'native'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : note.tier === 'approximated'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {note.tier}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-bold text-white">{note.feature}</span>
                      <span className="text-[9px] text-slate-400 font-sans">{note.explanation}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        /* Director Diff Mode */
        <div className="flex flex-1 overflow-hidden">
          <DirectorDiffInspector />
        </div>
      )}

      {/* Floating Prompt Inspector Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="glass-panel w-full max-w-2xl rounded-2xl border border-director-border p-5 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-director-border pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-director-gold" />
                <h3 className="font-display font-bold text-sm text-white">Compiled Model Prompt Bundle</h3>
              </div>
              <button
                onClick={() => setShowPromptModal(false)}
                className="font-mono text-xs text-slate-400 hover:text-white"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-mono text-[11px] text-director-gold font-bold">Positive Directorial Prompt:</label>
              <div className="rounded-lg border border-director-border bg-director-darkest p-3 font-mono text-xs text-slate-200 leading-relaxed max-h-48 overflow-y-auto">
                {compiledPrompt.positivePrompt}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-mono text-[11px] text-slate-400 font-bold">Negative Prompt:</label>
              <div className="rounded-lg border border-director-border bg-director-darkest p-3 font-mono text-xs text-slate-400 leading-relaxed">
                {compiledPrompt.negativePrompt}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-400 bg-director-panel p-2.5 rounded-lg border border-director-border">
              <div>Target: <span className="text-white font-bold">{shot.targetModel}</span></div>
              <div>Duration: <span className="text-white font-bold">{shot.durationSeconds}s</span></div>
              <div>Focal Length: <span className="text-white font-bold">{shot.camera.lens.focalLength}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Docked In-App Debugger & Action Console */}
      <InAppDebugger />

      {/* ComfyUI Connection & Settings Modal */}
      <ComfyConnectionModal />

      {/* Cinematic Mood & Intent Presets Modal */}
      <CinematicPresetsModal
        isOpen={showPresetsModal}
        onClose={() => setShowPresetsModal(false)}
      />
    </div>
  );
}
