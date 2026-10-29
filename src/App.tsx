import { useState, useEffect, Suspense, lazy, Component, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useShotStore } from './stores/useShotStore';
import { useHistoryStore } from './stores/useHistoryStore';
import { MotionPrevisStage } from './components/MotionPrevisStage';
import { PrevisParametersDeck } from './components/PrevisParametersDeck';
import { useLogStore } from './stores/useLogStore';
import { getReasonerConfig, PROVIDERS } from './services/objectReasoner';
import {
  Clapperboard,
  GitCompare,
  Sparkles,
  Settings,
  Box,
  Brain,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Redo2,
  HelpCircle,
  Download,
} from 'lucide-react';
import { DebuggerTogglePill } from './components/DebuggerTogglePill';

import { ShotBible } from './components/ShotBible';

class StudioErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center bg-[#090D16] text-slate-200 p-6 font-mono text-xs gap-3">
          <div className="text-[#F0AE42] font-bold text-sm">Stage Viewport Recovered from an Error</div>
          <div className="text-[#98A5BC] max-w-lg text-center">{this.state.error.message}</div>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-3.5 py-1.5 rounded-lg bg-[#6658F5] hover:bg-[#7669FF] text-white font-bold shadow-md"
          >
            Resume Stage
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
const DirectorDiffInspector = lazy(() =>
  import('./components/DirectorDiffInspector').then((m) => ({ default: m.DirectorDiffInspector }))
);
const InAppDebugger = lazy(() =>
  import('./components/InAppDebugger').then((m) => ({ default: m.InAppDebugger }))
);
const ReasonerSettingsPanel = lazy(() =>
  import('./components/ReasonerSettingsPanel').then((m) => ({ default: m.ReasonerSettingsPanel }))
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
const PrevisExportDeck = lazy(() =>
  import('./components/PrevisExportDeck').then((m) => ({ default: m.PrevisExportDeck }))
);

export type WorkspaceMode = 'previs' | 'export';
export type StepTab = WorkspaceMode | 'shot' | 'analyze' | 'plan';

export default function App() {
  const {
    shot,
    setActiveDeckTab,
    canUndo,
    canRedo,
    undo,
    redo,
  } = useShotStore(
    useShallow((s) => ({
      shot: s.shot,
      setActiveDeckTab: s.setActiveDeckTab,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      undo: s.undo,
      redo: s.redo,
    }))
  );
  const revisions = useHistoryStore((s) => s.revisions);

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('previs');
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [activeShotId, setActiveShotId] = useState('shot-01a');
  const [activeShotTitle, setActiveShotTitle] = useState('Shot 01A');
  const [activeSceneName, setActiveSceneName] = useState<string>('Scene 01 - Neon Protocol');
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(true);
  const [showPresetsModal, setShowPresetsModal] = useState<boolean>(false);
  const [showDiffInspector, setShowDiffInspector] = useState<boolean>(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState<boolean>(false);
  const { toggleOpen: toggleDebugger } = useLogStore();

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
    <div className="flex h-screen w-screen flex-col bg-[#090D16] text-[#F0F3FA] font-sans overflow-hidden">
      {/* Top Main Navigation Bar — Cinematic Command Center 2026 */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#273247] px-3.5 bg-gradient-to-b from-[#121A2A] to-[#0D1320] shadow-[0_2px_12px_rgba(0,0,0,0.45)] z-20">
        {/* Left: Project & Scene Branding */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition-all ${
              isLeftSidebarOpen
                ? 'bg-[#6658F5]/20 text-[#C4BEFF] border-[#6658F5]/55 hover:bg-[#6658F5]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'bg-[#131C2E] text-[#98A5BC] border-[#273247] hover:text-white hover:bg-[#1A2436]'
            }`}
            title={isLeftSidebarOpen ? 'Hide Shot Bible (Collapse Left Sidebar)' : 'Show Shot Bible (Expand Left Sidebar)'}
          >
            {isLeftSidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">Bible</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#6658F5] to-[#4A3DE0] text-white font-black shadow-[0_2px_8px_rgba(102,88,245,0.45)] border border-[#8E84FF]/40">
              <Clapperboard className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-bold text-xs tracking-wide text-[#F0F3FA]">
                <span className="text-[#18B8D8]">ComfyUI</span> Motion Previs Studio
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 rounded-lg bg-[#090D16]/80 border border-[#273247] px-2.5 py-1 font-mono text-[10px] text-[#98A5BC] shadow-inner">
            <span className="text-[#D5DFEE] font-bold uppercase tracking-wider">{activeSceneName}</span>
            <span className="text-[#384764]">/</span>
            <span className="text-[#F0AE42] font-semibold">{shot.name || activeShotTitle || activeShotId.toUpperCase()}</span>
          </div>
        </div>

        {/* Center: Studio Workspaces (Directing Stage vs Render, Prompt & Export Studio) */}
        <div className="flex items-center gap-1 rounded-xl bg-[#090D16] p-1 border border-[#273247] text-xs shadow-inner">
          <button
            onClick={() => {
              setWorkspaceMode('previs');
              setActiveDeckTab('camera');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1 font-semibold transition-all ${
              workspaceMode === 'previs'
                ? 'bg-gradient-to-b from-[#6658F5] to-[#5243E2] text-white shadow-[0_2px_10px_rgba(102,88,245,0.4)] border border-[#8E84FF]/40'
                : 'text-[#98A5BC] hover:text-white hover:bg-white/[0.05] border border-transparent'
            }`}
            title="3D Previs Stage, Camera Optics & Soundstage Actor Blocking"
          >
            <Box className="h-3.5 w-3.5" />
            <span>Directing Stage</span>
          </button>

          <button
            onClick={() => {
              setWorkspaceMode('export');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1 font-semibold transition-all ${
              workspaceMode === 'export'
                ? 'bg-gradient-to-b from-[#20C997] to-[#139E74] text-white font-bold shadow-[0_2px_10px_rgba(32,201,151,0.35)] border border-[#5CE8BE]/45'
                : 'text-[#98A5BC] hover:text-white hover:bg-white/[0.05] border border-transparent'
            }`}
            title="Render Reference Previs Video (MP4, OpenPose, Depth), AI Prompt Polish & Camera Matrix Export"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Render, Prompt &amp; Export Studio</span>
          </button>
        </div>

        {/* Right: Global Actions, Modals & Studio Settings */}
        <div className="flex items-center gap-1.5 text-xs">
          {/* Undo / Redo Controls */}
          <div className="flex items-center rounded-lg bg-[#090D16] border border-[#273247] p-0.5">
            <button
              onClick={() => undo()}
              disabled={!canUndo}
              aria-label="Undo"
              className={`p-1 rounded-md transition-colors ${
                canUndo
                  ? 'text-[#D5DFEE] hover:text-white hover:bg-[#1A2436] cursor-pointer'
                  : 'text-[#475569] cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => redo()}
              disabled={!canRedo}
              aria-label="Redo"
              className={`p-1 rounded-md transition-colors ${
                canRedo
                  ? 'text-[#D5DFEE] hover:text-white hover:bg-[#1A2436] cursor-pointer'
                  : 'text-[#475569] cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Director Diff Button */}
          <button
            onClick={() => setShowDiffInspector(!showDiffInspector)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition-all ${
              showDiffInspector
                ? 'bg-[#18B8D8] text-[#090D16] border-[#67E8F9] font-bold shadow-[0_2px_8px_rgba(24,184,216,0.35)]'
                : 'bg-[#131C2E] text-[#D0D9E8] border-[#273247] hover:text-white hover:bg-[#1A2436]'
            }`}
            title="Director Revision Diff Inspector"
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span>Diff</span>
            {revisions.length > 0 && (
              <span className="rounded-full bg-[#18B8D8]/20 px-1.5 font-mono text-[9px] text-[#67E8F9] border border-[#18B8D8]/40">
                {revisions.length}
              </span>
            )}
          </button>

          {/* Directing Presets Button */}
          <button
            onClick={() => setShowPresetsModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#231B12] hover:bg-[#2F2417] px-2.5 py-1 text-[11px] font-semibold text-[#F0AE42] border border-[#F0AE42]/40 transition-all"
            title="Cinematic Mood Presets"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Presets</span>
          </button>

          {/* Quickstart Help Guide Button */}
          <button
            onClick={() => setShowWelcomeModal(true)}
            className="flex items-center gap-1 rounded-lg bg-[#131C2E] hover:bg-[#1A2436] px-2.5 py-1 text-[11px] font-semibold text-[#D0D9E8] hover:text-white border border-[#273247]"
            title="Getting Started & Tour Guide"
          >
            <HelpCircle className="h-3.5 w-3.5 text-[#18B8D8]" />
            <span className="hidden xl:inline">Help</span>
          </button>

          {/* In-App Debugger Toggle */}
          <DebuggerTogglePill />

          {/* Studio Settings button (AI Reasoner & Preferences) */}
          <button
            onClick={() => setShowSettingsModal(true)}
            id="studio-settings-button"
            className="flex items-center gap-2 rounded-lg border border-[#273247] bg-[#131C2E] px-2.5 py-1 hover:border-[#F0AE42]/60 hover:bg-[#1A2436] transition-all cursor-pointer"
            title="Studio Settings: AI Reasoner & Preferences"
          >
            <Settings className="h-3.5 w-3.5 text-[#F0AE42]" />
            <span className="text-[11px] font-semibold text-white">Settings</span>
            <span className="h-3 w-px bg-[#273247]" />
            <span className="flex items-center gap-1 text-[9.5px] font-mono text-[#98A5BC]">
              <Brain className="h-3 w-3 text-[#8E84FF]" />
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
              <div className="flex h-full w-full items-center justify-center bg-[#090D16] text-[#98A5BC] font-mono text-xs">
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
            className={`flex flex-col border-r border-[#273247] bg-[#0D1320] shrink-0 overflow-hidden transition-all duration-200 ease-in-out ${
              isLeftSidebarOpen ? 'w-64 min-w-[256px] max-w-[256px]' : 'w-0 min-w-0 max-w-0 border-r-0'
            }`}
          >
            <div className="w-64 h-full flex flex-col min-w-[256px]">
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center text-[#98A5BC] font-mono text-xs">
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

          {/* Center Column: Stage Previs OR Previs Export Deck depending on workspaceMode */}
          <main className="flex flex-1 min-w-0 min-h-0 flex-col overflow-hidden bg-[#090D16]">
            {/* 3D Motion Previs Soundstage (Kept mounted so 3D WebGL scene & offline renderer remain alive) */}
            <div
              className={`flex-1 flex flex-col min-h-0 min-w-0 ${
                workspaceMode === 'previs' ? '' : 'hidden'
              }`}
            >
              <StudioErrorBoundary>
                <MotionPrevisStage
                  shotTitle={shot.name || activeShotTitle}
                />
              </StudioErrorBoundary>
            </div>

            {workspaceMode === 'export' && (
              <div className="flex-1 overflow-hidden">
                <Suspense
                  fallback={
                    <div className="flex h-full w-full items-center justify-center text-[#98A5BC] font-mono text-xs">
                      Loading Render, Prompt &amp; Export Studio...
                    </div>
                  }
                >
                  <PrevisExportDeck onBackToPrevis={() => setWorkspaceMode('previs')} />
                </Suspense>
              </div>
            )}
          </main>

          {/* Right Column: Previs Parameters Deck */}
          <aside
            className={`flex flex-col border-l border-[#273247] bg-[#0D1320] shrink-0 transition-all duration-200 ease-in-out ${
              isRightSidebarOpen
                ? 'w-[380px] min-w-[380px] max-w-[380px] overflow-y-auto overflow-x-hidden'
                : 'w-0 min-w-0 max-w-0 border-l-0 overflow-hidden'
            }`}
          >
            <div className="w-[380px] h-full flex flex-col min-w-[380px] overflow-y-auto">
              <PrevisParametersDeck
                onOpenPromptInspector={() => setWorkspaceMode('export')}
                onExportProductionPack={() => setWorkspaceMode('export')}
              />
            </div>
          </aside>

          {/* Floating Collapsible Drawer Toggle Tab on the Sidebar Seam */}
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            className={`absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center w-4 h-12 rounded-l-md border border-[#273247] bg-[#121A2A]/95 hover:bg-[#6658F5] text-[#98A5BC] hover:text-white shadow-2xl backdrop-blur-md transition-all duration-200 group cursor-pointer ${
              isRightSidebarOpen ? 'right-[380px]' : 'right-0'
            }`}
            title={isRightSidebarOpen ? 'Collapse Parameters Deck' : 'Expand Parameters Deck'}
            aria-label={isRightSidebarOpen ? 'Collapse Parameters Deck' : 'Expand Parameters Deck'}
          >
            {isRightSidebarOpen ? (
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            )}
          </button>
        </div>
      )}

      {/* Docked In-App Debugger & Modals wrapped in Suspense */}
      <Suspense fallback={null}>
        <InAppDebugger />
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
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#273247] bg-[#0D1320] p-6 shadow-2xl">
              <Suspense fallback={<div className="text-[#98A5BC] font-mono text-xs p-4">Loading settings...</div>}>
                <ReasonerSettingsPanel onClose={() => setShowSettingsModal(false)} />
              </Suspense>
            </div>
          </div>
        )}
      </Suspense>
    </div>
  );
}
