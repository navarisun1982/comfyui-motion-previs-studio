import { useState, useEffect, Suspense, lazy } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useShotStore } from './stores/useShotStore';
import { useComfyStore } from './stores/useComfyStore';
import { useHistoryStore } from './stores/useHistoryStore';
import { MotionPrevisStage } from './components/MotionPrevisStage';
import { PrevisParametersDeck } from './components/PrevisParametersDeck';
import { useAssetLibraryStore } from './stores/useAssetLibraryStore';
import { useLogStore } from './stores/useLogStore';
import { getReasonerConfig, PROVIDERS } from './services/objectReasoner';
import { directPromptWithAI } from './services/aiPromptDirector';
import { getAdapter } from './adapters';
import { safeGetItem, STORAGE_KEYS } from './services/storage';
import {
  Clapperboard,
  GitCompare,
  Code2,
  Sparkles,
  Settings,
  Box,
  Layers,
  Zap,
  Copy,
  Check,
  Brain,
  Clock,
  RefreshCw,
  Wand2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Redo2,
  HelpCircle,
} from 'lucide-react';
import { DebuggerTogglePill } from './components/DebuggerTogglePill';

const ShotBible = lazy(() =>
  import('./components/ShotBible').then((m) => ({ default: m.ShotBible }))
);
const DirectorDiffInspector = lazy(() =>
  import('./components/DirectorDiffInspector').then((m) => ({ default: m.DirectorDiffInspector }))
);
const ComfyExecutionPanel = lazy(() =>
  import('./components/ComfyExecutionPanel').then((m) => ({ default: m.ComfyExecutionPanel }))
);
const VFXVideoDeck = lazy(() =>
  import('./components/VFXVideoDeck').then((m) => ({ default: m.VFXVideoDeck }))
);
const InAppDebugger = lazy(() =>
  import('./components/InAppDebugger').then((m) => ({ default: m.InAppDebugger }))
);
const ComfyConnectionModal = lazy(() =>
  import('./components/ComfyConnectionModal').then((m) => ({ default: m.ComfyConnectionModal }))
);
const CinematicPresetsModal = lazy(() =>
  import('./components/CinematicPresetsModal').then((m) => ({ default: m.CinematicPresetsModal }))
);
const AssetLibraryModal = lazy(() =>
  import('./components/AssetLibraryModal').then((m) => ({ default: m.AssetLibraryModal }))
);
const WelcomeModal = lazy(() =>
  import('./components/WelcomeModal').then((m) => ({ default: m.WelcomeModal }))
);

export type WorkspaceMode = 'previs' | 'vfx' | 'diffusion';
export type StepTab = WorkspaceMode | 'shot' | 'analyze' | 'plan' | 'export';

export default function App() {
  const {
    shot,
    validation,
    compiledPrompt,
    setActiveDeckTab,
    setCompiledPrompt,
    updateTargetModel,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useShotStore(
    useShallow((s) => ({
      shot: s.shot,
      validation: s.validation,
      compiledPrompt: s.compiledPrompt,
      setActiveDeckTab: s.setActiveDeckTab,
      setCompiledPrompt: s.setCompiledPrompt,
      updateTargetModel: s.updateTargetModel,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      undo: s.undo,
      redo: s.redo,
    }))
  );
  const connectionStatus = useComfyStore((s) => s.connectionStatus);
  const openSettings = useComfyStore((s) => s.openSettings);
  const revisions = useHistoryStore((s) => s.revisions);

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('previs');
  const [activeShotId, setActiveShotId] = useState('shot-01a');
  const [activeShotTitle, setActiveShotTitle] = useState('Shot 01A Tracking In');
  const [activeSceneName, setActiveSceneName] = useState<string>('Scene 01 - Arrival');
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(true);
  const [showPromptModal, setShowPromptModal] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [showPresetsModal, setShowPresetsModal] = useState<boolean>(false);
  const [showDiffInspector, setShowDiffInspector] = useState<boolean>(false);
  const [isDirectingPrompt, setIsDirectingPrompt] = useState<boolean>(false);
  const [aiDirectorFeedback, setAiDirectorFeedback] = useState<string | null>(null);
  const [showTimelineDetails, setShowTimelineDetails] = useState<boolean>(true);
  const [showWelcomeModal, setShowWelcomeModal] = useState<boolean>(
    () => !safeGetItem<boolean>(STORAGE_KEYS.WELCOME_DISMISSED, false)
  );
  const { toggleOpen: toggleDebugger } = useLogStore();
  const openAssetLibrary = useAssetLibraryStore((s) => s.openLibrary);

  const handleDirectWithAi = async () => {
    setIsDirectingPrompt(true);
    setAiDirectorFeedback(null);
    try {
      const res = await directPromptWithAI(shot, shot.targetModel);
      setCompiledPrompt({
        ...compiledPrompt,
        positivePrompt: res.positivePrompt,
        negativePrompt: res.negativePrompt,
      });
      setAiDirectorFeedback(res.directorNotes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiDirectorFeedback(`AI Direction failed: ${msg}`);
    } finally {
      setIsDirectingPrompt(false);
    }
  };

  const handleResetToDeterministicPrompt = () => {
    const adapter = getAdapter(shot.targetModel);
    const standard = adapter.compilePrompt(shot);
    setCompiledPrompt(standard);
    setAiDirectorFeedback('Reset to standard model-compiled prompt.');
    setTimeout(() => setAiDirectorFeedback(null), 3000);
  };

  // Global Keyboard Shortcuts (Undo/Redo, Debugger) with Editable Element Guard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isEditingText =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (isEditingText) return;

      // Debugger toggle
      if (e.key === '`' || e.key === '~' || e.key === 'F12') {
        e.preventDefault();
        toggleDebugger();
        return;
      }

      // Undo: Ctrl+Z (without shift)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        redo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDebugger, undo, redo]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#08090d] text-slate-100 font-sans overflow-hidden">
      {/* Top Main Navigation Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4 bg-[#0d0f17] z-20">
        {/* Left: Project & Scene Branding */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-mono border transition-all ${
              isLeftSidebarOpen
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 hover:bg-blue-600/30'
                : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
            }`}
            title={isLeftSidebarOpen ? 'Hide Shot Bible (Collapse Left Sidebar)' : 'Show Shot Bible (Expand Left Sidebar)'}
          >
            {isLeftSidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="hidden md:inline font-semibold">Bible</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black shadow-md">
              <Clapperboard className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-xs tracking-wider text-white">
                  <span className="text-blue-400">ComfyUI</span> Motion Previs Studio
                </span>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 rounded bg-black/40 border border-white/10 px-2.5 py-0.5 font-mono text-[10px] text-slate-400">
            <span className="text-slate-300 font-bold uppercase tracking-wider">{activeSceneName}</span>
            <span className="text-slate-600">/</span>
            <span className="text-amber-400 font-semibold">{activeShotTitle || activeShotId.toUpperCase()}</span>
          </div>
        </div>

        {/* Center: 3 Studio Workspaces (Directing Stage, VFX Plate Solver, ComfyUI Studio) */}
        <div className="flex items-center gap-1 rounded-lg bg-[#11131c] p-1 border border-white/10 font-mono text-xs shadow-inner">
          <button
            onClick={() => {
              setWorkspaceMode('previs');
              setActiveDeckTab('camera');
            }}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1 font-semibold transition-all ${
              workspaceMode === 'previs'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="3D Previs Stage, Camera Optics & Soundstage Actor Blocking"
          >
            <Box className="h-3.5 w-3.5" />
            <span>Directing Stage</span>
          </button>

          <button
            onClick={() => {
              setWorkspaceMode('vfx');
              setActiveDeckTab('vfx');
            }}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1 font-semibold transition-all ${
              workspaceMode === 'vfx'
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="VFX Video Plate Motion Tracking & Multi-Pass Computer Vision"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>VFX Plate Solver</span>
          </button>

          <button
            onClick={() => {
              setWorkspaceMode('diffusion');
            }}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1 font-semibold transition-all ${
              workspaceMode === 'diffusion'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
            title="ComfyUI Generation, Diffusion Queue & Directorial Mapping"
          >
            <Zap className="h-3.5 w-3.5 fill-current" />
            <span>ComfyUI Studio</span>
          </button>
        </div>

        {/* Right: Actions, Modals & Unified Comfy Status */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {/* Undo / Redo Controls */}
          <div className="flex items-center rounded-md bg-white/5 border border-white/10 p-0.5">
            <button
              onClick={() => undo()}
              disabled={!canUndo}
              aria-label="Undo"
              className={`p-1 rounded transition-colors ${
                canUndo
                  ? 'text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => redo()}
              disabled={!canRedo}
              aria-label="Redo"
              className={`p-1 rounded transition-colors ${
                canRedo
                  ? 'text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Director Diff Button */}
          <button
            onClick={() => setShowDiffInspector(!showDiffInspector)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] border transition-colors ${
              showDiffInspector
                ? 'bg-cyan-600 text-white border-cyan-500'
                : 'bg-white/5 text-slate-300 border-white/10 hover:text-white'
            }`}
            title="Director Revision Diff Inspector"
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span>Diff</span>
            {revisions.length > 0 && (
              <span className="rounded-full bg-cyan-500/20 px-1 font-mono text-[9px] text-cyan-300">
                {revisions.length}
              </span>
            )}
          </button>

          {/* 3D Asset Library & AI Generator Button */}
          <button
            onClick={() => openAssetLibrary()}
            className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-amber-600/90 to-indigo-600/90 hover:from-amber-500 hover:to-indigo-500 px-2.5 py-1 text-[11px] font-semibold text-white border border-amber-400/40 shadow-sm transition-all"
            title="3D Asset Library, GLB Upload & AI 3D Generator"
          >
            <Box className="h-3.5 w-3.5 text-amber-300" />
            <span>3D Library</span>
          </button>

          {/* Directing Presets Button */}
          <button
            onClick={() => setShowPresetsModal(true)}
            className="flex items-center gap-1 rounded-md bg-white/5 hover:bg-white/10 px-2 py-1 text-[11px] text-amber-400 border border-amber-400/30 transition-all"
            title="Cinematic Mood Presets"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Presets</span>
          </button>

          {/* Prompt Inspector Button */}
          <button
            onClick={() => setShowPromptModal(true)}
            className="flex items-center gap-1 rounded-md bg-white/5 hover:bg-white/10 px-2 py-1 text-[11px] text-slate-300 hover:text-white border border-white/10"
            title="Inspect compiled prompt"
          >
            <Code2 className="h-3 w-3 text-blue-400" />
            <span>Prompt</span>
          </button>

          {/* Quickstart Help Guide Button */}
          <button
            onClick={() => setShowWelcomeModal(true)}
            className="flex items-center gap-1 rounded-md bg-white/5 hover:bg-white/10 px-2 py-1 text-[11px] text-slate-300 hover:text-white border border-white/10"
            title="Getting Started & Tour Guide"
          >
            <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
            <span className="hidden xl:inline">Help</span>
          </button>

          {/* In-App Debugger Toggle */}
          <DebuggerTogglePill />

          {/* Deck Toggle Button */}
          <button
            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-mono border transition-all ${
              isRightSidebarOpen
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/30'
                : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
            }`}
            title={isRightSidebarOpen ? 'Hide Parameters Deck (Collapse Right Sidebar)' : 'Show Parameters Deck (Expand Right Sidebar)'}
          >
            <span className="hidden lg:inline font-semibold">
              {workspaceMode === 'diffusion' ? 'Comfy Deck' : 'Deck'}
            </span>
            {isRightSidebarOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>

          {/* Unified Studio Settings button (ComfyUI connection + LLM reasoner) */}
          <button
            onClick={() => openSettings()}
            id="studio-settings-button"
            className="flex items-center gap-2 rounded-md border border-white/10 bg-[#131620] px-2.5 py-1 hover:border-amber-400/60 hover:bg-[#181d2a] transition-all"
            title="Studio Settings: ComfyUI connection & LLM provider"
          >
            <Settings className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-[11px] font-semibold text-white">Settings</span>
            <span className="h-3 w-px bg-white/15" />
            <span className="flex items-center gap-1 text-[9px] font-mono text-slate-300">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                    : 'bg-rose-400'
                }`}
              />
              {connectionStatus === 'connected' ? 'ComfyUI' : 'Comfy offline'}
            </span>
            <span className="flex items-center gap-1 text-[9px] font-mono text-slate-300">
              <Brain className="h-3 w-3 text-indigo-300" />
              {PROVIDERS[getReasonerConfig().provider].label}
            </span>
          </button>
        </div>
      </header>

      {/* Main Studio Body */}
      {showDiffInspector ? (
        <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-director-darkest text-slate-500 font-mono text-xs">
                Loading Diff Inspector...
              </div>
            }
          >
            <DirectorDiffInspector onClose={() => setShowDiffInspector(false)} />
          </Suspense>
        </div>
      ) : (
        <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden relative">
          {/* Left Column: Permanent Shot Bible & Scene Project Hierarchy */}
          <aside
            className={`flex flex-col border-r border-white/10 bg-[#0b0d13] shrink-0 overflow-hidden transition-all duration-200 ease-in-out ${
              isLeftSidebarOpen ? 'w-64 min-w-[256px] max-w-[256px]' : 'w-0 min-w-0 max-w-0 border-r-0'
            }`}
          >
            <div className="w-64 h-full flex flex-col min-w-[256px]">
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center text-slate-500 font-mono text-xs">
                    Loading Shot Bible...
                  </div>
                }
              >
                <ShotBible
                  activeShotId={activeShotId}
                  onSelectShot={(id, title, sceneName) => {
                    setActiveShotId(id);
                    if (sceneName) setActiveSceneName(sceneName);
                    if (title) {
                      setActiveShotTitle(title);
                    } else if (id === 'shot-01a') setActiveShotTitle('Shot 01A Tracking In');
                    else if (id === 'shot-01b') setActiveShotTitle('Shot 01B Pan Right');
                    else if (id === 'shot-01c') setActiveShotTitle('Shot 01C Push In');
                    else if (id === 'shot-01d') setActiveShotTitle('Shot 01D Low Angle');
                    else if (id === 'shot-01e') setActiveShotTitle('Shot 01E Over Shoulder');
                  }}
                />
              </Suspense>
            </div>
          </aside>

          {/* Center Column: Stage Previs OR VFX Multi-Pass Analyzer depending on workspaceMode */}
          <main className="flex flex-1 min-w-0 min-h-0 flex-col overflow-hidden bg-[#090b10]">
            {workspaceMode === 'vfx' ? (
              <div className="flex-1 overflow-y-auto">
                <Suspense
                  fallback={
                    <div className="flex h-full w-full items-center justify-center text-slate-500 font-mono text-xs">
                      Loading VFX Analyzer...
                    </div>
                  }
                >
                  <VFXVideoDeck />
                </Suspense>
              </div>
            ) : (
              <MotionPrevisStage
                shotTitle={activeShotTitle}
                workspaceMode={workspaceMode}
                onDirectWithComfy={() => setWorkspaceMode('diffusion')}
              />
            )}
          </main>

          {/* Right Column: Previs Parameters Deck or Full Comfy Execution Panel */}
          <aside
            className={`flex flex-col border-l border-white/10 bg-[#0b0d13] shrink-0 transition-all duration-200 ease-in-out ${
              isRightSidebarOpen
                ? 'w-80 min-w-[320px] max-w-[320px] overflow-y-auto overflow-x-hidden'
                : 'w-0 min-w-0 max-w-0 border-l-0 overflow-hidden'
            }`}
          >
            <div className="w-80 h-full flex flex-col min-w-[320px] overflow-y-auto">
              {workspaceMode === 'diffusion' ? (
                <div className="flex flex-col h-full">
                  <Suspense
                    fallback={
                      <div className="flex h-full w-full items-center justify-center text-slate-500 font-mono text-xs">
                        Loading ComfyUI Deck...
                      </div>
                    }
                  >
                    <ComfyExecutionPanel onBackToPrevis={() => setWorkspaceMode('previs')} />
                  </Suspense>
                  {/* Directorial Capability Breakdown */}
                  <div className="p-4 pt-0 space-y-2 font-mono text-[10px]">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">
                      Directorial Capability Mapping
                    </span>
                    <div className="space-y-1.5 rounded-lg border border-white/10 bg-[#131620] p-2.5">
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
                </div>
              ) : (
                <PrevisParametersDeck
                  onOpenPromptInspector={() => setShowPromptModal(true)}
                  onExportProductionPack={() => setWorkspaceMode('diffusion')}
                  onDirectShotWithComfy={() => setWorkspaceMode('diffusion')}
                />
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Floating Prompt Inspector Modal with Model-Specific Paradigm & Timeline */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0e111a] p-5 flex flex-col gap-4 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black shadow-md">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm text-white">
                    Compiled Directorial Prompt Pack
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border ${
                      shot.targetModel === 'seedance'
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                        : shot.targetModel === 'minimax-h3'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                    }`}>
                      {shot.targetModel === 'seedance'
                        ? 'Seedance 2.0 Motion Matrix'
                        : shot.targetModel === 'minimax-h3'
                          ? 'MiniMax H3 / Hailuo Formula'
                          : 'LTX-2.5 DiT Narrative Flow'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {shot.targetModel === 'seedance'
                        ? '6-Axis Coordinate Trajectory, Aerodynamic Physics & Sensor Profile'
                        : shot.targetModel === 'minimax-h3'
                          ? 'Structured Micro-Acting & Optical Photorealism'
                          : 'Present-Tense Continuous Action & DiT Temporal Pacing'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowPromptModal(false)}
                className="font-mono text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
              >
                ✕ Close
              </button>
            </div>

            {/* Target Model Selector Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#08090d] border border-white/10">
              <span className="font-mono text-[10px] text-slate-400 px-2 font-bold uppercase tracking-wider shrink-0">
                Target Model:
              </span>
              {[
                { id: 'ltx-2.5', label: 'LTX-2.5', desc: 'DiT Narrative Flow' },
                { id: 'minimax-h3', label: 'MiniMax H3', desc: 'Micro-Acting Formula' },
                { id: 'seedance', label: 'Seedance 2.0', desc: '6-Axis Matrix & Physics' },
              ].map((m) => {
                const isActive = shot.targetModel === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      updateTargetModel(m.id as any);
                      const adapter = getAdapter(m.id);
                      setCompiledPrompt(adapter.compilePrompt({ ...shot, targetModel: m.id as any }));
                      setAiDirectorFeedback(null);
                    }}
                    className={`flex-1 flex flex-col items-center py-1 px-2 rounded-lg text-xs font-display font-semibold transition-all ${
                      isActive
                        ? m.id === 'seedance'
                          ? 'bg-cyan-600/30 text-cyan-200 border border-cyan-500/50 shadow-sm'
                          : m.id === 'minimax-h3'
                            ? 'bg-amber-600/30 text-amber-200 border border-amber-500/50 shadow-sm'
                            : 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/50 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <span>{m.label}</span>
                    <span className="font-mono text-[8px] opacity-75">{m.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* AI Directing Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-gradient-to-r from-blue-950/40 via-indigo-950/20 to-purple-950/40 border border-blue-500/20">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-400" />
                <span className="font-display font-semibold text-xs text-slate-200">AI Prompt Reasoner:</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {getReasonerConfig().provider.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetToDeterministicPrompt}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-[11px] transition-colors border border-white/10"
                  title="Reset to deterministic compiler output without AI rewrites"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Standard Compile</span>
                </button>
                <button
                  onClick={handleDirectWithAi}
                  disabled={isDirectingPrompt}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-display font-semibold text-xs transition-all shadow-md disabled:opacity-50"
                >
                  {isDirectingPrompt ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  <span>{isDirectingPrompt ? 'Directing with AI...' : 'Direct & Polish with AI'}</span>
                </button>
              </div>
            </div>

            {/* AI Director Feedback notification */}
            {aiDirectorFeedback && (
              <div
                className={`p-2.5 rounded-lg border font-mono text-xs leading-relaxed flex items-start gap-2 ${
                  aiDirectorFeedback.toLowerCase().includes('fail') || aiDirectorFeedback.toLowerCase().includes('error')
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                }`}
              >
                <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1">{aiDirectorFeedback}</div>
              </div>
            )}

            {/* Stage Temporal Beats & Timeline Choreography */}
            {compiledPrompt.temporalBeats && compiledPrompt.temporalBeats.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-[#08090d] p-3 flex flex-col gap-2">
                <button
                  onClick={() => setShowTimelineDetails(!showTimelineDetails)}
                  className="flex items-center justify-between text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    <span className="font-display font-bold text-xs text-slate-200 group-hover:text-white transition-colors">
                      Stage Timeline & Choreography Beats ({shot.durationSeconds}s Duration)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 font-mono text-[10px]">
                    <span>{showTimelineDetails ? 'Hide Beats' : 'Show Beats'}</span>
                    {showTimelineDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </div>
                </button>

                {showTimelineDetails && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1 pt-2 border-t border-white/5">
                    {compiledPrompt.temporalBeats.map((beat, idx) => (
                      <div key={idx} className="rounded-lg bg-[#11131c] border border-white/5 p-2 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {beat.timeRange}
                          </span>
                          <span className="font-mono text-[9px] text-slate-500">
                            Beat {idx === 0 ? 'I (Open)' : idx === 1 ? 'II (Progression)' : 'III (Resolve)'}
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-300 leading-snug">
                          <span className="text-blue-400 font-semibold">Camera: </span>
                          {beat.cameraAction}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 leading-snug">
                          <span className="text-emerald-400 font-semibold">Stage & Actors: </span>
                          {beat.actorAction}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Positive Prompt Section */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[11px] text-blue-400 font-bold">
                  Positive Directorial Prompt:
                </label>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(compiledPrompt.positivePrompt);
                    setCopiedPrompt(true);
                    setTimeout(() => setCopiedPrompt(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 font-mono text-[10px] transition-all border border-blue-500/30"
                >
                  {copiedPrompt ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedPrompt ? 'Copied to Clipboard!' : 'Copy Prompt'}</span>
                </button>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#08090d] p-3 font-mono text-xs text-slate-200 leading-relaxed max-h-48 overflow-y-auto select-all">
                {compiledPrompt.positivePrompt}
              </div>
            </div>

            {/* Negative Prompt Section */}
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[11px] text-slate-400 font-bold">Negative Prompt:</label>
              <div className="rounded-lg border border-white/10 bg-[#08090d] p-3 font-mono text-xs text-slate-400 leading-relaxed">
                {compiledPrompt.negativePrompt}
              </div>
            </div>

            {/* Footer Metrics & Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 border-t border-white/10">
              <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-400 bg-[#131620] p-2.5 rounded-lg border border-white/10 flex-1">
                <div>Target: <span className="text-white font-bold">{shot.targetModel}</span></div>
                <div>Duration: <span className="text-white font-bold">{shot.durationSeconds}s</span></div>
                <div>Lens: <span className="text-white font-bold">{shot.camera.lens.focalLength}</span></div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(compiledPrompt, null, 2));
                    setCopiedJson(true);
                    setTimeout(() => setCopiedJson(false), 2000);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-[10px] transition-all border border-white/10"
                >
                  {copiedJson ? <Check className="h-3 w-3 text-emerald-400" /> : <Code2 className="h-3 w-3" />}
                  <span>{copiedJson ? 'Copied JSON!' : 'Copy Full Bundle'}</span>
                </button>
                <button
                  onClick={() => {
                    setShowPromptModal(false);
                    setWorkspaceMode('diffusion');
                  }}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-display font-bold text-xs transition-all shadow-md"
                >
                  <Sparkles className="h-3.5 w-3.5 fill-current" />
                  <span>Queue in ComfyUI ▶</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Docked In-App Debugger & Modals wrapped in Suspense */}
      <Suspense fallback={null}>
        <InAppDebugger />
        <ComfyConnectionModal />
        <CinematicPresetsModal
          isOpen={showPresetsModal}
          onClose={() => setShowPresetsModal(false)}
        />
        <AssetLibraryModal />
        <WelcomeModal
          isOpen={showWelcomeModal}
          onClose={() => setShowWelcomeModal(false)}
          onOpenWorkspace={(mode) => setWorkspaceMode(mode)}
        />
      </Suspense>
    </div>
  );
}
