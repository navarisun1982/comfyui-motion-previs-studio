import React, { useState } from 'react';
import { useShotStore, getEffectiveStageLights } from '../stores/useShotStore';
import {
  SubjectKind,
  FocalLength,
  ShotType,
  CameraAngle,
  CameraMovementType,
  MovementSpeed,
  AspectRatio,
  LightingStyle,
  LightingDirection,
} from '../types/shotspec';
import {
  Camera,
  Box,
  Sun,
  Download,
  Zap,
  Sparkles,
  Trash2,
  Film,
  Loader2,
  Globe,
  Users,
  Target,
  Clock,
} from 'lucide-react';

import { useAssetLibraryStore } from '../stores/useAssetLibraryStore';
import { CINEMATIC_ENVIRONMENT_PRESETS } from '../types/environment';
import { reasonEnvironment, reasonObject } from '../services/objectReasoner';
import { registerModelFile } from '../services/modelStorage';
import { preloadGltfModels } from '../engine/gltfModelLoader';
import { decomposeDirectorialScene } from '../engine/directorialSceneDecomposer';
import { HumanoidMotionGroup } from '../engine/kinematics';
import { generateActingCuesFromPrompt } from '../services/aiActingDirector';
import { HumanoidBone } from '../engine/procedural3D/sculptSpec';
import { CharacterControlCard, OBJECT_TARGET_PALETTE } from './CharacterControlCard';

const LENS_OPTICS_INFO: Record<FocalLength, { fov: string; label: string; impact: string }> = {
  '18mm': {
    fov: '100°',
    label: 'Ultra-Wide',
    impact: 'Exaggerated spatial depth & dramatic architectural scale; looms close subjects.',
  },
  '24mm': {
    fov: '84°',
    label: 'Wide Cinema',
    impact: 'Expansive environment context with dynamic foreground-to-background separation.',
  },
  '35mm': {
    fov: '63°',
    label: 'Director Standard',
    impact: 'Classic narrative cinema field of view; balances character emotion with setting.',
  },
  '50mm': {
    fov: '47°',
    label: 'Human Eye',
    impact: 'Natural perspective with zero distortion; truthful spatial proportions.',
  },
  '85mm': {
    fov: '28°',
    label: 'Portrait Prime',
    impact: 'Flattering facial geometry & intimate subject isolation against soft background.',
  },
  '135mm': {
    fov: '18°',
    label: 'Telephoto',
    impact: 'Strong axial compression; pulls distant backgrounds right behind the subject.',
  },
};

const ANGLE_PSYCHOLOGY_INFO: Record<CameraAngle, string> = {
  'eye-level': 'Neutral empathy — places the audience on equal footing with the subject.',
  'low-angle': 'Heroic dominance — empowers the subject against the sky or ceiling.',
  'high-angle': 'Vulnerability & isolation — diminishes the subject within the environment.',
  'overhead-gods-eye': 'Omniscient geometry — reveals tactical choreography & floor patterns.',
  'ground-level': 'Visceral ground intensity — emphasizes footsteps, terrain, and scale.',
  'dutch-angle': 'Psychological unease — tilted horizon creates tension and disorientation.',
};

export interface PrevisParametersDeckProps {
  onOpenPromptInspector?: () => void;
  onExportProductionPack?: () => void;
}

export const PrevisParametersDeck: React.FC<PrevisParametersDeckProps> = ({
  onOpenPromptInspector,
  onExportProductionPack,
}) => {
  const {
    shot,
    updateDuration,
    setFocalLength,
    addActor,
    updateActor,
    removeActor,
    clearAllActors,
    sceneCastPool,
    addToCastPool,
    removeFromCastPool,
    importFromCastPool,
    socketActorToBone,
    unsocketActor,
    recordActorPoseAtTime,
    setCameraPositions,
    setCameraTargetLookAt,
    setCameraColor,
    setCameraMovement,
    setCameraAngle,
    setShotType,
    focusCameraOnSubject,
    setLighting,
    addStageLight,
    updateStageLight,
    removeStageLight,
    setSceneDescription,
    setNegativePrompt,
    setEnvironment,
    updateAspectRatio,
    activeDeckTab,
    setActiveDeckTab,
    applyDirectorialMotion,
    applyReadyMadeMotion,
    selectedActorId,
    setSelectedActorId,
    previsVideoUrl,
    isRenderingPrevis,
    previsProgress,
    renderPrevisVideo,
    updateActorPositionAtTime,
    currentTime,
  } = useShotStore();

  const openAssetLibrary = useAssetLibraryStore((s) => s.openLibrary);

  const activeTab = activeDeckTab;
  const setActiveTab = setActiveDeckTab;

  // Environment & AI Location Synthesizer State
  const [isSynthesizingEnv, setIsSynthesizingEnv] = useState(false);
  const [envPromptInput, setEnvPromptInput] = useState('');
  const [refiningActorId, setRefiningActorId] = useState<string | null>(null);
  const [customObjectName, setCustomObjectName] = useState('');

  // AI Acting Director, Animation Time Window, Collapsible Cards & Bone Socketing local UI state
  const [generatingActingId, setGeneratingActingId] = useState<string | null>(null);
  const [motionWindowByActor, setMotionWindowByActor] = useState<Record<string, { start: number; end: number }>>({});
  const [collapsedActors, setCollapsedActors] = useState<Record<string, boolean>>({});
  const [expandedFineTuneByActor, setExpandedFineTuneByActor] = useState<Record<string, boolean>>({});
  const [motionSectionOpenByActor, setMotionSectionOpenByActor] = useState<Record<string, boolean>>({});
  const [timingSectionOpenByActor, setTimingSectionOpenByActor] = useState<Record<string, boolean>>({});
  const [humanMotionGroupByActor, setHumanMotionGroupByActor] = useState<Record<string, HumanoidMotionGroup>>({});
  const [motionTravelModeByActor, setMotionTravelModeByActor] = useState<Record<string, 'auto' | 'travel' | 'in-place'>>({});
  const [showQuickPropsDrawer, setShowQuickPropsDrawer] = useState(false);
  const [socketTargetActorId, setSocketTargetActorId] = useState<string>('');
  const [socketTargetBone, setSocketTargetBone] = useState<HumanoidBone>('RightHand');

  const handleSynthesizeEnv = async () => {
    if (!envPromptInput.trim() || isSynthesizingEnv) return;
    const promptText = envPromptInput.trim();
    setIsSynthesizingEnv(true);
    try {
      const decomposed = decomposeDirectorialScene(promptText);
      let resultEnv: any;
      try {
        resultEnv = await reasonEnvironment(promptText);
      } catch {
        resultEnv = {
          id: `env-${Date.now()}`,
          name: promptText.slice(0, 40),
          nameAr: promptText.slice(0, 40),
          category: decomposed.environment.category || 'interior',
          promptDescription: promptText,
          weather: decomposed.environment.weather || 'clear',
          timeOfDay: decomposed.environment.timeOfDay || 'day',
          groundSurface: decomposed.environment.groundSurface || 'studio-floor',
          fogDensity: decomposed.environment.fogDensity || 0.01,
          fogColor: decomposed.environment.fogColor || '#1e293b',
          skyColor: decomposed.environment.skyColor || '#0a1128',
          groundColor: '#1e293b',
          ambientColor: decomposed.environment.ambientColor || '#0f172a',
          visibleInPrevis: true,
        };
      }

      setEnvironment(resultEnv);
      setSceneDescription(promptText);
      setLighting(decomposed.lighting.style, decomposed.lighting.direction, decomposed.lighting.contrast);
      setCameraMovement(decomposed.cameraSuggestion.movement.type, decomposed.cameraSuggestion.movement.speed);

      for (const actor of decomposed.extractedActors) {
        const alreadyExists = shot.actors.some(
          (a) =>
            a.name.toLowerCase() === actor.name.toLowerCase() ||
            (a.token && a.token.toLowerCase().includes(actor.name.toLowerCase()))
        );
        if (!alreadyExists) {
          addActor(actor.name, actor.kind, actor.tokenPrompt, {
            scale: actor.scale,
            actionDescription: actor.actionDescription,
          });
        }
      }

      setEnvPromptInput('');
    } catch (err) {
      console.error('Failed to synthesize environment:', err);
    } finally {
      setIsSynthesizingEnv(false);
    }
  };

  const handleDirectSceneFromNarrative = (narrativeText: string) => {
    if (!narrativeText.trim()) return;
    const decomposed = decomposeDirectorialScene(narrativeText);

    if (shot.environment) {
      setEnvironment({
        ...shot.environment,
        category: decomposed.environment.category || shot.environment.category,
        groundSurface: decomposed.environment.groundSurface || shot.environment.groundSurface,
        timeOfDay: decomposed.environment.timeOfDay || shot.environment.timeOfDay,
        weather: decomposed.environment.weather || shot.environment.weather,
        fogDensity: decomposed.environment.fogDensity || shot.environment.fogDensity,
        skyColor: decomposed.environment.skyColor || shot.environment.skyColor,
      });
    }

    setLighting(decomposed.lighting.style, decomposed.lighting.direction, decomposed.lighting.contrast);
    setCameraMovement(decomposed.cameraSuggestion.movement.type, decomposed.cameraSuggestion.movement.speed);

    for (const actor of decomposed.extractedActors) {
      const alreadyExists = shot.actors.some(
        (a) =>
          a.name.toLowerCase() === actor.name.toLowerCase() ||
          (a.token && a.token.toLowerCase().includes(actor.name.toLowerCase()))
      );
      if (!alreadyExists) {
        addActor(actor.name, actor.kind, actor.tokenPrompt, {
          scale: actor.scale,
          actionDescription: actor.actionDescription,
        });
      }
    }
  };

  // Auto-expand and auto-scroll to selected actor card in staging tab
  React.useEffect(() => {
    if (selectedActorId && selectedActorId !== '__camera__') {
      setCollapsedActors((prev) => (prev[selectedActorId] ? { ...prev, [selectedActorId]: false } : prev));
    }
    if (selectedActorId && activeTab === 'staging') {
      const el = document.querySelector(`[data-actor-card="${selectedActorId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedActorId, activeTab]);

  const handleAddSubjectKind = (kind: SubjectKind, customName?: string) => {
    addActor(customName || (kind !== 'human' ? kind.charAt(0).toUpperCase() + kind.slice(1) : undefined), kind);
  };

  const activeLensInfo = LENS_OPTICS_INFO[shot.camera.lens.focalLength] || LENS_OPTICS_INFO['35mm'];
  const activeAngleInfo = ANGLE_PSYCHOLOGY_INFO[shot.camera.angle] || ANGLE_PSYCHOLOGY_INFO['eye-level'];
  const humanoidActors = shot.actors.filter((a) => !a.kind || a.kind === 'human');

  return (
    <div className="flex h-full w-full flex-col bg-[#0D1320] text-[#F0F3FA] select-none font-sans text-xs">
      {/* 0. Persistent Active Shot Name (Read-Only) & Duration Header */}
      <div className="border-b border-[#273247] bg-[#121A2A]/90 px-3 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex items-center gap-1.5 flex-1 min-w-0 bg-[#090D16] border border-[#273247] rounded-lg px-2.5 py-1.5 shadow-inner"
            title="Active Shot (Rename on the Shot Bible card in the Left Panel)"
          >
            <Film className="h-3.5 w-3.5 text-[#18B8D8] shrink-0" />
            <span className="font-display font-bold text-white text-xs truncate">
              {shot.name || 'Shot 01A'}
            </span>
          </div>

          {/* Shot Duration Stepper */}
          <div className="flex items-center gap-1 rounded-lg bg-[#090D16] border border-[#273247] px-2 py-1.5 font-mono text-[10.5px] shrink-0 shadow-inner" title="Shot Duration (1s – 10s)">
            <Clock className="h-3 w-3 text-[#F0AE42]" />
            <button
              type="button"
              onClick={() => updateDuration(Math.max(1, (shot.durationSeconds || 4) - 1))}
              className="px-1 rounded hover:bg-white/10 text-slate-300 hover:text-white font-bold"
            >
              -
            </button>
            <span className="text-white font-bold min-w-[26px] text-center">{shot.durationSeconds || 4}s</span>
            <button
              type="button"
              onClick={() => updateDuration(Math.min(10, (shot.durationSeconds || 4) + 1))}
              className="px-1 rounded hover:bg-white/10 text-slate-300 hover:text-white font-bold"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* 1. Header Tab Navigation — 2026 Segmented Inspector Bar */}
      <div className="grid grid-cols-4 border-b border-[#273247] bg-[#090D16] p-1.5 gap-1.5 shrink-0">
        <button
          onClick={() => setActiveTab('camera')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'camera'
              ? 'bg-gradient-to-b from-[#6658F5] to-[#5243E2] text-white border border-[#8E84FF]/55 shadow-[0_2px_10px_rgba(102,88,245,0.4)]'
              : 'text-[#98A5BC] hover:text-white hover:bg-[#131C2E] border border-transparent'
          }`}
        >
          <Camera className="h-3.5 w-3.5 shrink-0" />
          <span>Camera</span>
        </button>

        <button
          onClick={() => setActiveTab('staging')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'staging'
              ? 'bg-gradient-to-b from-[#6658F5] to-[#5243E2] text-white border border-[#8E84FF]/55 shadow-[0_2px_10px_rgba(102,88,245,0.4)]'
              : 'text-[#98A5BC] hover:text-white hover:bg-[#131C2E] border border-transparent'
          }`}
        >
          <Box className="h-3.5 w-3.5 shrink-0" />
          <span>Cast ({shot.actors.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('environment')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'environment'
              ? 'bg-gradient-to-b from-[#20C997] to-[#14A378] text-[#06241B] font-bold border border-[#5CE8BE]/60 shadow-[0_2px_10px_rgba(32,201,151,0.35)]'
              : 'text-[#98A5BC] hover:text-white hover:bg-[#131C2E] border border-transparent'
          }`}
          title="Scene Environment & Physical Location Setting"
        >
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span>Set</span>
        </button>

        <button
          onClick={() => setActiveTab('atmosphere')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === 'atmosphere'
              ? 'bg-gradient-to-b from-[#F0AE42] to-[#D48B1E] text-[#1A1205] font-bold border border-[#F8CA78]/60 shadow-[0_2px_10px_rgba(240,174,66,0.35)]'
              : 'text-[#98A5BC] hover:text-white hover:bg-[#131C2E] border border-transparent'
          }`}
          title="Lighting Rig, Scene Narrative & Negative Prompt"
        >
          <Sun className="h-3.5 w-3.5 shrink-0" />
          <span>Light</span>
        </button>
      </div>

      {/* 2. Scrollable Body Content per Tab */}
      <div className="flex-1 overflow-y-auto">
        {/* ================= TAB 1: CAMERA & LENS ================= */}
        {activeTab === 'camera' && (
          <div className="p-3.5 space-y-4">
            {/* Focal Length & Lens with FOV Degrees & Optical Impact */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">Camera Prime Lens</span>
                <span className="font-mono text-[10px] text-blue-400 font-bold">
                  {shot.camera.lens.focalLength} • {activeLensInfo.fov} FOV ({activeLensInfo.label})
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1 font-mono text-[10px]">
                {(['18mm', '24mm', '35mm', '50mm', '85mm', '135mm'] as FocalLength[]).map((fl) => (
                  <button
                    key={fl}
                    onClick={() => setFocalLength(fl)}
                    className={`rounded py-1.5 text-center transition-all flex flex-col items-center ${
                      shot.camera.lens.focalLength === fl
                        ? 'bg-gradient-to-b from-[#6658F5] to-[#5243E2] text-white font-bold shadow-[0_2px_8px_rgba(102,88,245,0.4)] border border-[#8E84FF]/60'
                        : 'bg-[#131C2E] text-[#98A5BC] hover:text-white hover:bg-[#1A2436] border border-[#273247]'
                    }`}
                  >
                    <span>{fl}</span>
                    <span className="text-[8px] opacity-75">{LENS_OPTICS_INFO[fl].fov}</span>
                  </button>
                ))}
              </div>
              <div className="rounded-md bg-blue-950/30 border border-blue-500/20 px-2.5 py-1.5 text-[10px] text-blue-200/90 font-mono">
                <strong className="text-blue-400">Optical Impact:</strong> {activeLensInfo.impact}
              </div>
            </div>

            {/* Aspect Ratio & Shot Framing (with Extreme-Wide restored) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Aspect Ratio</span>
                <select
                  value={shot.aspectRatio}
                  onChange={(e) => updateAspectRatio(e.target.value as AspectRatio)}
                  className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none"
                >
                  <option value="16:9">16:9 (Standard Widescreen)</option>
                  <option value="2.39:1">2.39:1 (Anamorphic Scope)</option>
                  <option value="9:16">9:16 (Vertical Reels)</option>
                  <option value="4:3">4:3 (Academy Ratio)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Shot Framing</span>
                <select
                  value={shot.camera.shotType}
                  onChange={(e) => setShotType(e.target.value as ShotType)}
                  className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none"
                >
                  <option value="extreme-wide">Extreme Wide (Vast Scale)</option>
                  <option value="wide">Wide Shot (Establishing)</option>
                  <option value="medium-wide">Medium Wide (Cowboy / Knees)</option>
                  <option value="medium">Medium Shot (Waist Up)</option>
                  <option value="medium-close-up">Medium Close-Up (Chest Up)</option>
                  <option value="close-up">Close-Up (Face)</option>
                  <option value="extreme-close-up">Extreme Close-Up (Eyes/Detail)</option>
                </select>
              </div>
            </div>

            {/* Camera Angle & Angle Psychology */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-slate-400 font-mono text-[10px]">Camera Angle</span>
                  <select
                    value={shot.camera.angle}
                    onChange={(e) => setCameraAngle(e.target.value as CameraAngle)}
                    className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none"
                  >
                    <option value="eye-level">Eye Level (Neutral)</option>
                    <option value="low-angle">Low Angle (Heroic/Dominant)</option>
                    <option value="high-angle">High Angle (Vulnerable)</option>
                    <option value="overhead-gods-eye">Overhead (God's Eye)</option>
                    <option value="ground-level">Ground Level (Worm's Eye)</option>
                    <option value="dutch-angle">Dutch Angle (Tilted Unease)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 font-mono text-[10px]">Movement Speed</span>
                  <select
                    value={shot.camera.movement.speed}
                    onChange={(e) => setCameraMovement(shot.camera.movement.type, e.target.value as MovementSpeed)}
                    className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none"
                  >
                    <option value="slow-cinematic">Slow Cinematic</option>
                    <option value="moderate">Moderate Paced</option>
                    <option value="rapid-dynamic">Dynamic Fast Action</option>
                  </select>
                </div>
              </div>
              <div className="rounded-md bg-amber-950/25 border border-amber-500/20 px-2.5 py-1.5 text-[10px] text-amber-200/90 font-mono">
                <strong className="text-amber-400">Angle Psychology:</strong> {activeAngleInfo}
              </div>
            </div>

            {/* All 17 Categorized Camera Movements (Restored from CameraDeck!) */}
            <div className="space-y-1">
              <span className="text-slate-400 font-mono text-[10px]">Camera Movement Archetype (17 Rigs)</span>
              <select
                value={shot.camera.movement.type}
                onChange={(e) => setCameraMovement(e.target.value as CameraMovementType, shot.camera.movement.speed)}
                className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none font-mono"
              >
                <optgroup label="Tripod & Static">
                  <option value="static">⏸️ Static Locked-Off Tripod</option>
                </optgroup>
                <optgroup label="Depth & Dolly">
                  <option value="dolly-in">🎥 Dolly In (Push Toward Subject)</option>
                  <option value="dolly-out">🎥 Dolly Out (Pull Back Reveal)</option>
                </optgroup>
                <optgroup label="Lateral Tracking">
                  <option value="truck-left">◀️ Truck Left (Lateral Track)</option>
                  <option value="truck-right">▶️ Truck Right (Lateral Track)</option>
                </optgroup>
                <optgroup label="Vertical Crane / Pedestal">
                  <option value="pedestal-up">🔺 Pedestal / Crane Up</option>
                  <option value="pedestal-down">🔻 Pedestal / Crane Down</option>
                </optgroup>
                <optgroup label="Rotational Pan & Tilt">
                  <option value="pan-left">⬅️ Pan Left (Horizontal Sweep)</option>
                  <option value="pan-right">➡️ Pan Right (Horizontal Sweep)</option>
                  <option value="tilt-up">⬆️ Tilt Up (Vertical Reveal)</option>
                  <option value="tilt-down">⬇️ Tilt Down (Vertical Sweep)</option>
                </optgroup>
                <optgroup label="360° Orbital Arcs">
                  <option value="orbit-clockwise">🔄 Orbit Clockwise Around Subject</option>
                  <option value="orbit-counter-clockwise">🔄 Orbit Counter-Clockwise</option>
                </optgroup>
                <optgroup label="Optical & Specialty Rigs">
                  <option value="rack-focus">🔍 Rack Focus (Foreground ➔ Background)</option>
                  <option value="handheld-subtle">📹 Handheld Organic Cinema Rig</option>
                  <option value="whip-pan">⚡ Whip Pan (High-Velocity Blur)</option>
                  <option value="crash-zoom">💥 Crash Zoom (Snap Telephoto Rush)</option>
                  <option value="fpv-dive">🦅 FPV Drone Dive (Aerial Plunge)</option>
                </optgroup>
              </select>
            </div>

            {/* Camera 3D Path Coordinates Sliders */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="font-bold text-slate-200">Camera 3D Trajectory (Start ➔ End)</span>
                <button
                  type="button"
                  onClick={() => focusCameraOnSubject(selectedActorId !== '__camera__' ? selectedActorId : undefined)}
                  className="flex items-center gap-1 rounded bg-cyan-500/15 hover:bg-cyan-500/30 border border-cyan-500/40 px-2 py-0.5 text-cyan-300 hover:text-white transition-all font-bold"
                  title="Lock camera look-at target onto selected subject"
                >
                  <Target className="h-3 w-3 text-cyan-400" />
                  <span>Aim at Subject</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[9px] text-slate-400">
                <div className="space-y-1 bg-[#131C2E] p-3 rounded-xl border border-[#273247]">
                  <span className="text-blue-400 font-bold">Start Position</span>
                  <div className="flex justify-between">
                    <span>Lateral X</span>
                    <span className="text-white">{Math.round(shot.camera.movement.startPosition.x)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={shot.camera.movement.startPosition.x}
                    onChange={(e) => {
                      setCameraPositions(
                        { ...shot.camera.movement.startPosition, x: Number(e.target.value) },
                        shot.camera.movement.endPosition
                      );
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between">
                    <span>Depth Z</span>
                    <span className="text-white">{Math.round(shot.camera.movement.startPosition.y)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={shot.camera.movement.startPosition.y}
                    onChange={(e) => {
                      setCameraPositions(
                        { ...shot.camera.movement.startPosition, y: Number(e.target.value) },
                        shot.camera.movement.endPosition
                      );
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between">
                    <span>Height Y</span>
                    <span className="text-white">{Math.round(shot.camera.movement.startPosition.z ?? 20)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={shot.camera.movement.startPosition.z ?? 20}
                    onChange={(e) => {
                      setCameraPositions(
                        { ...shot.camera.movement.startPosition, z: Number(e.target.value) },
                        shot.camera.movement.endPosition
                      );
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="space-y-1 bg-[#131C2E] p-3 rounded-xl border border-[#273247]">
                  <span className="text-emerald-400 font-bold">End Position</span>
                  <div className="flex justify-between">
                    <span>Lateral X</span>
                    <span className="text-white">{Math.round(shot.camera.movement.endPosition.x)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={shot.camera.movement.endPosition.x}
                    onChange={(e) => {
                      setCameraPositions(
                        shot.camera.movement.startPosition,
                        { ...shot.camera.movement.endPosition, x: Number(e.target.value) }
                      );
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex justify-between">
                    <span>Depth Z</span>
                    <span className="text-white">{Math.round(shot.camera.movement.endPosition.y)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={shot.camera.movement.endPosition.y}
                    onChange={(e) => {
                      setCameraPositions(
                        shot.camera.movement.startPosition,
                        { ...shot.camera.movement.endPosition, y: Number(e.target.value) }
                      );
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex justify-between">
                    <span>Height Y</span>
                    <span className="text-white">{Math.round(shot.camera.movement.endPosition.z ?? 20)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={shot.camera.movement.endPosition.z ?? 20}
                    onChange={(e) => {
                      setCameraPositions(
                        shot.camera.movement.startPosition,
                        { ...shot.camera.movement.endPosition, z: Number(e.target.value) }
                      );
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>

              {/* Camera Look-At Target & Custom Rig Color */}
              <div className="flex items-center justify-between gap-2 bg-[#131C2E] p-3 rounded-xl border border-[#273247] font-mono text-[9px]">
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-bold">Camera Rig Color:</span>
                  <div className="flex items-center gap-1">
                    {['#0284c7', '#f59e0b', '#10b981', '#f43f5e', '#a855f7', '#ffffff'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCameraColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-3.5 h-3.5 rounded-full border transition-transform hover:scale-110 ${
                          (shot.camera.color || '#0284c7').toLowerCase() === c.toLowerCase()
                            ? 'ring-2 ring-cyan-400 border-white scale-110'
                            : 'border-white/20'
                        }`}
                        title={`Set Camera Color to ${c}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={shot.camera.color || '#0284c7'}
                      onChange={(e) => setCameraColor(e.target.value)}
                      className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer"
                      title="Custom Camera Rig & Frustum Color"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCameraTargetLookAt({ x: 50, y: 50 })}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white"
                  title="Reset camera look-at aim to center stage (50, 50)"
                >
                  Center Aim
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: CAST & STAGE (ZERO DUPLICATES + SCENE CAST POOL) ================= */}
        {activeTab === 'staging' && (
          <div className="p-3.5 space-y-4">
            {/* 1. Unified Add to Stage Card — Clean, Uncluttered, Tactile */}
            <div className="ui-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">Add Subject or Prop</span>
                <span className="font-mono text-[10px] text-slate-400">1-Click Place on Stage</span>
              </div>

              {/* 6 Primary Subject Cards */}
              <div className="grid grid-cols-3 gap-2 font-mono">
                <button
                  onClick={() => handleAddSubjectKind('human')}
                  className="flex items-center gap-2 rounded-xl bg-[#131C2E] border border-blue-500/30 px-2.5 py-2 text-slate-200 hover:bg-blue-600/25 hover:border-blue-400 transition-all text-left"
                >
                  <span className="text-lg shrink-0">👤</span>
                  <div className="min-w-0">
                    <div className="font-bold text-white text-[11px] leading-tight">Character</div>
                    <div className="text-[9.5px] text-blue-300/80">IK Rigged</div>
                  </div>
                </button>

                <button
                  onClick={() => addActor('Standee', 'cutout', 'a cutout standee photo card')}
                  className="flex items-center gap-2 rounded-xl bg-[#131C2E] border border-purple-500/30 px-2.5 py-2 text-slate-200 hover:bg-purple-600/25 hover:border-purple-400 transition-all text-left"
                >
                  <span className="text-lg shrink-0">🖼️</span>
                  <div className="min-w-0">
                    <div className="font-bold text-white text-[11px] leading-tight">Standee</div>
                    <div className="text-[9.5px] text-purple-300/80">2D Cutout</div>
                  </div>
                </button>

                <button
                  onClick={() => handleAddSubjectKind('car')}
                  className="flex items-center gap-2 rounded-xl bg-[#131C2E] border border-amber-500/30 px-2.5 py-2 text-slate-200 hover:bg-amber-600/25 hover:border-amber-400 transition-all text-left"
                >
                  <span className="text-lg shrink-0">🚗</span>
                  <div className="min-w-0">
                    <div className="font-bold text-white text-[11px] leading-tight">Vehicle</div>
                    <div className="text-[9.5px] text-amber-300/80">Car Rig</div>
                  </div>
                </button>

                <button
                  onClick={() => handleAddSubjectKind('tree')}
                  className="flex items-center gap-2 rounded-xl bg-[#131C2E] border border-emerald-500/30 px-2.5 py-2 text-slate-200 hover:bg-emerald-600/25 hover:border-emerald-400 transition-all text-left"
                >
                  <span className="text-lg shrink-0">🌲</span>
                  <div className="min-w-0">
                    <div className="font-bold text-white text-[11px] leading-tight">Tree</div>
                    <div className="text-[9.5px] text-emerald-300/80">Foliage</div>
                  </div>
                </button>

                <button
                  onClick={() => handleAddSubjectKind('table')}
                  className="flex items-center gap-2 rounded-xl bg-[#131C2E] border border-orange-500/30 px-2.5 py-2 text-slate-200 hover:bg-orange-600/25 hover:border-orange-400 transition-all text-left"
                >
                  <span className="text-lg shrink-0">🪑</span>
                  <div className="min-w-0">
                    <div className="font-bold text-white text-[11px] leading-tight">Table</div>
                    <div className="text-[9.5px] text-orange-300/80">Furniture</div>
                  </div>
                </button>

                <button
                  onClick={() => handleAddSubjectKind('chair')}
                  className="flex items-center gap-2 rounded-xl bg-[#131C2E] border border-cyan-500/30 px-2.5 py-2 text-slate-200 hover:bg-cyan-600/25 hover:border-cyan-400 transition-all text-left"
                >
                  <span className="text-lg shrink-0">💺</span>
                  <div className="min-w-0">
                    <div className="font-bold text-white text-[11px] leading-tight">Chair</div>
                    <div className="text-[9.5px] text-cyan-300/80">Seat</div>
                  </div>
                </button>
              </div>

              {/* Custom Procedural Object Input + Collapsible Quick Props Drawer */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Type any 3D object (Spaceship, Boat, Robot, Sofa)..."
                    value={customObjectName}
                    onChange={(e) => setCustomObjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customObjectName.trim()) {
                        handleAddSubjectKind(customObjectName.trim().toLowerCase(), customObjectName.trim());
                        setCustomObjectName('');
                      }
                    }}
                    className="flex-1 bg-[#0b0e16] border border-white/15 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                  />
                  <button
                    onClick={() => {
                      if (customObjectName.trim()) {
                        handleAddSubjectKind(customObjectName.trim().toLowerCase(), customObjectName.trim());
                        setCustomObjectName('');
                      }
                    }}
                    disabled={!customObjectName.trim()}
                    className="px-3 py-1.5 rounded-lg bg-director-gold text-director-darkest font-bold text-[11px] disabled:opacity-40 hover:brightness-110 transition-all"
                  >
                    + Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQuickPropsDrawer((v) => !v)}
                    className="ui-btn text-[10.5px] px-2.5 py-1.5"
                    title="Show quick-add props and greybox primitives"
                  >
                    <span>{showQuickPropsDrawer ? '▾ Less' : '+ More Props'}</span>
                  </button>
                </div>

                {showQuickPropsDrawer && (
                  <div className="rounded-lg bg-[#0c0f18] border border-white/10 p-2.5 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '🚀 Spaceship', val: 'spaceship' },
                        { label: '🚤 Boat', val: 'boat' },
                        { label: '🚁 Helicopter', val: 'helicopter' },
                        { label: '🏔️ Mountain', val: 'mountain' },
                        { label: '📺 TV', val: 'tv' },
                        { label: '🏠 House', val: 'house' },
                        { label: '🛋️ Sofa', val: 'sofa' },
                        { label: '🤖 Robot', val: 'robot' },
                      ].map((item) => (
                        <button
                          key={item.val}
                          onClick={() => handleAddSubjectKind(item.val, item.label.replace(/^[^\s]+\s+/, ''))}
                          className="ui-chip text-[10.5px]"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-white/10">
                      <span className="text-[10px] font-mono text-slate-400 mr-1">Greybox:</span>
                      <button
                        type="button"
                        onClick={() => addActor('Cube Block', 'cube', 'a greybox cube blocking prop')}
                        className="ui-chip text-[10px]"
                      >
                        +⬛ Cube
                      </button>
                      <button
                        type="button"
                        onClick={() => addActor('Cylinder', 'cylinder', 'a greybox cylinder column')}
                        className="ui-chip text-[10px]"
                      >
                        +🏛️ Cylinder
                      </button>
                      <button
                        type="button"
                        onClick={() => addActor('Ground Plane', 'plane', 'a ground stage plane')}
                        className="ui-chip text-[10px]"
                      >
                        +📐 Plane
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddSubjectKind('prop')}
                        className="ui-chip text-[10px]"
                      >
                        +📦 Crate
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 3D Asset Library Button */}
              <button
                type="button"
                onClick={() => openAssetLibrary()}
                className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-amber-600/90 via-indigo-600/90 to-purple-600/90 hover:from-amber-500 hover:via-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-between shadow-lg border border-amber-400/40 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm">📦</span>
                  <span>Browse 3D Asset Library &amp; AI Studio</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/45 border border-white/20 text-amber-200">
                  200+ Models
                </span>
              </button>
            </div>

                        {/* 2. Scene Cast Pool (Compact Cross-Shot Roster) */}
            <div className="rounded-xl bg-[#121A2A] border border-[#6658F5]/35 shadow-sm p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Scene Cast Pool ({sceneCastPool.length})</span>
                </span>
                <span className="font-mono text-[9.5px] text-slate-400">Cross-Shot Continuity</span>
              </div>
              {sceneCastPool.length === 0 ? (
                <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
                  Click <strong className="text-indigo-300">Save</strong> on any stage character below to keep their look &amp; scale ready across shots.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sceneCastPool.map((poolActor) => (
                    <div
                      key={poolActor.id}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/40 px-2.5 py-1 font-mono text-[10.5px] text-indigo-200"
                    >
                      <span className="font-bold text-white truncate max-w-[100px]">{poolActor.name}</span>
                      <button
                        type="button"
                        onClick={() => importFromCastPool(poolActor.id)}
                        className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors"
                        title="Import this cast member onto the current shot's stage"
                      >
                        + Stage
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCastPool(poolActor.id)}
                        className="text-slate-400 hover:text-rose-400 px-1"
                        title="Remove from Scene Cast Pool"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Placed 3D Objects List */}
            <div className="space-y-3 pt-1 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs text-white">Placed on Stage ({shot.actors.length})</span>
                {shot.actors.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const allCollapsed = shot.actors.every((a) => collapsedActors[a.id]);
                        const next: Record<string, boolean> = {};
                        shot.actors.forEach((a) => {
                          next[a.id] = !allCollapsed;
                        });
                        setCollapsedActors(next);
                      }}
                      className="ui-chip text-[10px] px-2 py-1"
                      title="Collapse or expand all object cards"
                    >
                      {shot.actors.every((a) => collapsedActors[a.id]) ? '▸ Expand' : '▾ Collapse'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        shot.actors.forEach((act, idx) => {
                          const pal = OBJECT_TARGET_PALETTE[idx % OBJECT_TARGET_PALETTE.length];
                          updateActor(act.id, { color: pal.hex });
                        });
                      }}
                      className="ui-chip text-[10px] px-2 py-1 border-indigo-400/40 text-indigo-200 bg-indigo-500/15"
                      title="Assign a distinct Target Color to every object on stage"
                    >
                      🎨 Auto-Color
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearAllActors();
                      }}
                      className="ui-chip text-[10px] px-2 py-1 border-rose-500/30 text-rose-300 bg-rose-500/10 hover:bg-rose-500/25"
                      title="Remove all objects from stage"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear</span>
                    </button>
                  </div>
                )}
              </div>

              {shot.actors.length === 0 ? (
                <div className="p-4 rounded-xl bg-black/30 border border-dashed border-white/10 text-center text-xs text-slate-400">
                  No subjects on stage yet. Click any card in <strong className="text-white">Add Subject or Prop</strong> above to place one.
                </div>
              ) : (
                <div className="space-y-3">
                  {shot.actors.map((actor) => {
                    const shotDur = shot.durationSeconds || 4;
                    const win = motionWindowByActor[actor.id] || { start: 0, end: shotDur };
                    const isSelected = actor.id === selectedActorId;
                    const isCollapsed = Boolean(collapsedActors[actor.id]);
                    const isFineTuneOpen = expandedFineTuneByActor[actor.id] !== false;
                    const isMotionSectionOpen = motionSectionOpenByActor[actor.id] !== false;
                    const isTimingSectionOpen = timingSectionOpenByActor[actor.id] !== false;
                    const activeHumanGroup: HumanoidMotionGroup = humanMotionGroupByActor[actor.id] || 'move';
                    const travelMode = motionTravelModeByActor[actor.id] || 'auto';

                    return (
                      <CharacterControlCard
                        key={actor.id}
                        actor={actor}
                        allActors={shot.actors}
                        humanoidActors={humanoidActors}
                        shotDurationSeconds={shotDur}
                        sceneDescription={shot.sceneDescription}
                        currentTime={currentTime}
                        isSelected={isSelected}
                        isCollapsed={isCollapsed}
                        isFineTuneOpen={isFineTuneOpen}
                        isMotionSectionOpen={isMotionSectionOpen}
                        isTimingSectionOpen={isTimingSectionOpen}
                        motionWindow={win}
                        activeHumanGroup={activeHumanGroup}
                        travelMode={travelMode}
                        refiningActorId={refiningActorId}
                        generatingActingId={generatingActingId}
                        socketTargetActorId={socketTargetActorId}
                        socketTargetBone={socketTargetBone}
                        onSelectActor={(id) => setSelectedActorId(id)}
                        onToggleCollapse={(id) =>
                          setCollapsedActors((prev) => ({ ...prev, [id]: !prev[id] }))
                        }
                        onToggleFineTune={(id) =>
                          setExpandedFineTuneByActor((prev) => ({
                            ...prev,
                            [id]: prev[id] === false ? true : false,
                          }))
                        }
                        onToggleMotionSection={(id) =>
                          setMotionSectionOpenByActor((prev) => ({
                            ...prev,
                            [id]: prev[id] === false ? true : false,
                          }))
                        }
                        onToggleTimingSection={(id) =>
                          setTimingSectionOpenByActor((prev) => ({
                            ...prev,
                            [id]: prev[id] === false ? true : false,
                          }))
                        }
                        onUpdateMotionWindow={(id, nextWin) =>
                          setMotionWindowByActor((prev) => ({ ...prev, [id]: nextWin }))
                        }
                        onUpdateHumanGroup={(id, grp) =>
                          setHumanMotionGroupByActor((prev) => ({ ...prev, [id]: grp }))
                        }
                        onUpdateTravelMode={(id, mode) =>
                          setMotionTravelModeByActor((prev) => ({ ...prev, [id]: mode }))
                        }
                        onUpdateActor={(id, patch) => updateActor(id, patch)}
                        onRemoveActor={(id) => removeActor(id)}
                        onAddToCastPool={(act) => addToCastPool(act)}
                        onUpdateActorPositionAtTime={(id, time, pos, dur) =>
                          updateActorPositionAtTime(id, time, pos, dur)
                        }
                        onApplyReadyMadeMotion={(id, clipId, opts) =>
                          applyReadyMadeMotion(id, clipId, opts)
                        }
                        onDirectCustomAction={async (act, actionText, safeStart, safeEnd, cueDuration) => {
                          applyDirectorialMotion(act.id, actionText, {
                            startTimeSec: safeStart,
                            endTimeSec: safeEnd,
                          });
                          useShotStore.setState({ currentTime: safeStart, isPlaying: true });
                          window.dispatchEvent(
                            new CustomEvent('cmpvs:transport-play', {
                              detail: { time: safeStart, play: true },
                            })
                          );
                          if (!act.kind || act.kind === 'human' || act.kind === 'character') {
                            setGeneratingActingId(act.id);
                            try {
                              const cues = await generateActingCuesFromPrompt(
                                actionText,
                                cueDuration,
                                act.name,
                                shot.sceneDescription
                              );
                              const latestActor = useShotStore
                                .getState()
                                .shot.actors.find((a) => a.id === act.id);
                              const baseGait = latestActor?.gait;
                              cues.forEach((cue) => {
                                const effectiveGait =
                                  cue.gait && cue.gait !== 'none'
                                    ? cue.gait
                                    : baseGait === 'walk' || baseGait === 'run' || baseGait === 'sneak'
                                    ? baseGait
                                    : cue.gait;
                                const effectivePosePreset =
                                  effectiveGait === 'walk' || effectiveGait === 'run' || effectiveGait === 'sneak'
                                    ? undefined
                                    : cue.posePreset;
                                if (effectivePosePreset || (effectiveGait && effectiveGait !== 'none')) {
                                  recordActorPoseAtTime(
                                    act.id,
                                    Math.min(shotDur, safeStart + cue.time),
                                    undefined,
                                    effectivePosePreset,
                                    effectiveGait,
                                    shotDur
                                  );
                                }
                              });
                            } catch {
                              // Deterministic motion plan already applied
                            } finally {
                              setGeneratingActingId(null);
                            }
                          }
                        }}
                        onRefineObjectByPrompt={async (act) => {
                          const promptToReason = (act.token || act.name || '').trim();
                          if (!promptToReason || refiningActorId === act.id) return;
                          try {
                            setRefiningActorId(act.id);
                            if (!act.kind || act.kind === 'human') {
                              updateActor(act.id, {
                                token: promptToReason,
                                sculpt: undefined,
                                partGraph: undefined,
                              });
                            } else {
                              const graph = await reasonObject(promptToReason);
                              updateActor(act.id, { sculpt: graph, partGraph: graph });
                            }
                          } catch (err) {
                            console.error('Failed to edit object by prompt:', err);
                          } finally {
                            setRefiningActorId(null);
                          }
                        }}
                        onAttachGlbFile={async (actorId, file) => {
                          try {
                            const registered = await registerModelFile(file);
                            await preloadGltfModels([registered.blobUrl]);
                            updateActor(actorId, {
                              modelUrl: registered.blobUrl,
                            });
                          } catch (err) {
                            console.error('Failed to attach model:', err);
                          }
                        }}
                        onSocketActorToBone={(actorId, targetId, bone) =>
                          socketActorToBone(actorId, targetId, bone)
                        }
                        onUnsocketActor={(actorId) => unsocketActor(actorId)}
                        onChangeSocketTargetActor={(targetId) => setSocketTargetActorId(targetId)}
                        onChangeSocketTargetBone={(bone) => setSocketTargetBone(bone)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: ENVIRONMENT / SET ================= */}
        {activeTab === 'environment' && (
          <div className="p-3.5 space-y-4">
            <div className="rounded-lg bg-gradient-to-br from-emerald-950/40 via-[#10141f] to-[#0c0e14] border border-emerald-500/30 p-3 space-y-2 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🌍</span>
                  <div>
                    <div className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span>{shot.environment?.name || 'Soundstage Studio'}</span>
                    </div>
                    <div className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider">
                      Category: {shot.environment?.category || 'studio'}
                    </div>
                  </div>
                </div>
                <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 font-mono text-[9px] font-bold">
                  Active Set
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-mono text-slate-400">Environment Visual & Architectural Cue:</span>
                <textarea
                  rows={2}
                  value={shot.environment?.promptDescription || ''}
                  onChange={(e) =>
                    setEnvironment({
                      ...(shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec),
                      promptDescription: e.target.value,
                    })
                  }
                  placeholder="Describe location architecture, lighting bounce, and atmosphere..."
                  className="w-full rounded bg-[#0b0d13] border border-white/10 px-2.5 py-1.5 text-slate-200 text-[10px] focus:outline-none focus:border-emerald-500 font-mono resize-none"
                />
              </div>
            </div>

            {/* AI Environment Synthesizer */}
            <div className="rounded-lg bg-[#0e121b] border border-white/10 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Synthesize Location with AI</span>
                </span>
                <span className="font-mono text-[9px] text-slate-400">LLM Reasoner</span>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. Abandoned brutalist concrete bunker with snow drifts..."
                  value={envPromptInput}
                  onChange={(e) => setEnvPromptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && envPromptInput.trim() && !isSynthesizingEnv) {
                      handleSynthesizeEnv();
                    }
                  }}
                  className="flex-1 bg-black/60 border border-white/20 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <button
                  type="button"
                  disabled={!envPromptInput.trim() || isSynthesizingEnv}
                  onClick={handleSynthesizeEnv}
                  className="px-3 py-1.5 rounded-md bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono text-[10px] font-bold disabled:opacity-40 transition-all shadow flex items-center gap-1 shrink-0"
                >
                  {isSynthesizingEnv ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>...</span>
                    </>
                  ) : (
                    <span>✨ Synthesize</span>
                  )}
                </button>
              </div>
            </div>

            {/* Cinematic Location Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">Cinematic Location Presets</span>
                <span className="font-mono text-[9px] text-slate-400">{CINEMATIC_ENVIRONMENT_PRESETS.length} Locations</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {CINEMATIC_ENVIRONMENT_PRESETS.map((preset) => {
                  const isActive = shot.environment?.id === preset.spec.id;
                  return (
                    <button
                      key={preset.spec.id}
                      type="button"
                      onClick={() => {
                        setEnvironment({ ...preset.spec });
                        if (preset.spec.id === 'env-rustic-hearth') {
                          if (preset.spec.promptDescription) {
                            setSceneDescription(preset.spec.promptDescription);
                          }
                          const hasFp = shot.actors.some((a) =>
                            /fireplace|hearth/i.test(`${a.name} ${a.token || ''} ${a.kind || ''}`)
                          );
                          if (!hasFp) {
                            addActor(
                              'Rustic Stone Fireplace',
                              'prop',
                              'a rustic stone fireplace with rough-hewn fieldstone pillars, arched keystone lintel, glowing embers, and flickering flames',
                              { scale: 1.5, actionDescription: 'Crackling warm embers and flickering orange flame core in stone hearth' }
                            );
                          }
                          setLighting('golden-hour', 'side-key', 'high-contrast');
                        }
                      }}
                      className={`text-left p-2.5 rounded-lg border transition-all space-y-1 relative overflow-hidden ${
                        isActive
                          ? 'bg-[#152326] border-emerald-500 shadow-glow-cyan/20 ring-1 ring-emerald-400'
                          : 'bg-[#0f131c] border-white/10 hover:border-white/25 hover:bg-[#141824]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base">{preset.icon}</span>
                        <span className="font-mono text-[8px] uppercase tracking-wider text-slate-400 bg-white/5 px-1 py-0.2 rounded">
                          {preset.spec.category}
                        </span>
                      </div>
                      <div className="font-bold text-white text-[11px] leading-tight">
                        {preset.spec.name}
                      </div>
                      <div className="text-[8px] font-mono text-slate-400 flex items-center gap-1.5 pt-0.5">
                        <span>🌦 {preset.spec.weather}</span>
                        <span>•</span>
                        <span>⏰ {preset.spec.timeOfDay}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Physical Scene Controls */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-xs text-white">Weather Condition</span>
                  <span className="font-mono text-[10px] text-emerald-400 uppercase">
                    {shot.environment?.weather || 'clear'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 font-mono text-[10px]">
                  {[
                    { id: 'clear', label: '☀️ Clear' },
                    { id: 'rain', label: '🌧️ Rain' },
                    { id: 'fog', label: '🌫️ Fog' },
                    { id: 'snow', label: '❄️ Snow' },
                    { id: 'overcast', label: '☁️ Overcast' },
                    { id: 'sandstorm', label: '🏜️ Sandstorm' },
                  ].map((w) => {
                    const active = (shot.environment?.weather || 'clear') === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() =>
                          setEnvironment({
                            ...(shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec),
                            weather: w.id as any,
                          })
                        }
                        className={`py-1.5 px-2 rounded border text-left transition-all ${
                          active
                            ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50 font-bold'
                            : 'bg-[#121622] text-slate-300 border-white/5 hover:border-white/20'
                        }`}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-xs text-white">Time of Day</span>
                  <span className="font-mono text-[10px] text-amber-400 uppercase">
                    {shot.environment?.timeOfDay || 'night'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 font-mono text-[10px]">
                  {[
                    { id: 'dawn', label: '🌅 Dawn' },
                    { id: 'day', label: '☀️ Day' },
                    { id: 'golden-hour', label: '🌇 Golden Hour' },
                    { id: 'twilight', label: '🌆 Twilight' },
                    { id: 'night', label: '🌙 Night' },
                    { id: 'neon-night', label: '🟣 Neon Night' },
                  ].map((tod) => {
                    const active = (shot.environment?.timeOfDay || 'night') === tod.id;
                    return (
                      <button
                        key={tod.id}
                        type="button"
                        onClick={() =>
                          setEnvironment({
                            ...(shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec),
                            timeOfDay: tod.id as any,
                          })
                        }
                        className={`py-1.5 px-2 rounded border text-left transition-all ${
                          active
                            ? 'bg-amber-600/30 text-amber-300 border-amber-500/50 font-bold'
                            : 'bg-[#121622] text-slate-300 border-white/5 hover:border-white/20'
                        }`}
                      >
                        {tod.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-xs text-white">Ground Surface</span>
                  <span className="font-mono text-[10px] text-cyan-400">
                    {shot.environment?.groundSurface || 'studio-floor'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
                  {[
                    { id: 'studio-floor', label: '🎬 Soundstage Floor' },
                    { id: 'asphalt-wet', label: '🌧️ Wet Asphalt' },
                    { id: 'concrete-floor', label: '🏢 Grimy Concrete' },
                    { id: 'stone-cobblestone', label: '🧱 Cobblestone' },
                    { id: 'sand-dunes', label: '🏜️ Desert Sand' },
                    { id: 'grass-terrain', label: '🌿 Natural Grass' },
                    { id: 'metal-grate', label: '⚙️ Industrial Grate' },
                    { id: 'wood-parquet', label: '🪵 Polished Parquet' },
                  ].map((surf) => {
                    const active = (shot.environment?.groundSurface || 'studio-floor') === surf.id;
                    return (
                      <button
                        key={surf.id}
                        type="button"
                        onClick={() =>
                          setEnvironment({
                            ...(shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec),
                            groundSurface: surf.id as any,
                          })
                        }
                        className={`py-1.5 px-2 rounded border text-left transition-all ${
                          active
                            ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50 font-bold'
                            : 'bg-[#121622] text-slate-300 border-white/5 hover:border-white/20'
                        }`}
                      >
                        {surf.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 pt-1 border-t border-white/5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-300">Volumetric Fog Density</span>
                  <span className="text-white font-bold">
                    {Math.round((shot.environment?.fogDensity ?? 0.15) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={shot.environment?.fogDensity ?? 0.15}
                  onChange={(e) =>
                    setEnvironment({
                      ...(shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec),
                      fogDensity: Number(e.target.value),
                    })
                  }
                  className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
                />

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[9px] font-mono text-slate-400 block mb-1">Fog Tint:</span>
                    <div className="flex items-center gap-1.5 bg-[#121622] p-1.5 rounded border border-white/10">
                      <input
                        type="color"
                        value={shot.environment?.fogColor || '#0d111a'}
                        onChange={(e) =>
                          setEnvironment({
                            ...(shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec),
                            fogColor: e.target.value,
                          })
                        }
                        className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                      />
                      <span className="font-mono text-[10px] text-slate-300">
                        {shot.environment?.fogColor || '#0d111a'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] font-mono text-slate-400 block mb-1">Sky Dome:</span>
                    <div className="flex items-center gap-1.5 bg-[#121622] p-1.5 rounded border border-white/10">
                      <input
                        type="color"
                        value={shot.environment?.skyColor || '#08090c'}
                        onChange={(e) =>
                          setEnvironment({
                            ...(shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec),
                            skyColor: e.target.value,
                          })
                        }
                        className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                      />
                      <span className="font-mono text-[10px] text-slate-300">
                        {shot.environment?.skyColor || '#08090c'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: LIGHT & SCRIPT (WITH EDITABLE NEGATIVE PROMPT RESTORED!) ================= */}
        {activeTab === 'atmosphere' && (
          <div className="p-3.5 space-y-4">
            {/* Lighting Style */}
            <div className="space-y-1.5">
              <span className="font-display font-bold text-xs tracking-wide text-white">Lighting Mood Style</span>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                {([
                  { id: 'cinematic-natural', label: 'Cinematic Natural', icon: '🎬' },
                  { id: 'low-key-film-noir', label: 'Noir Chiaroscuro', icon: '🌑' },
                  { id: 'neon-cyberpunk', label: 'Cyberpunk Neon', icon: '🟣' },
                  { id: 'golden-hour', label: 'Golden Hour Sunset', icon: '🌅' },
                  { id: 'moonlight-foggy', label: 'Moonlit Foggy Blue', icon: '🌙' },
                  { id: 'high-key-studio', label: 'High Key Studio', icon: '💡' },
                  { id: 'practical-candlelight', label: 'Practical Candlelight', icon: '🕯️' },
                  { id: 'harsh-fluorescent', label: 'Harsh Fluorescent', icon: '⚡' },
                ] as { id: LightingStyle; label: string; icon: string }[]).map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setLighting(style.id, shot.lighting.direction, shot.lighting.contrast)}
                    className={`flex items-center gap-1.5 rounded-lg p-2 text-left transition-all border ${
                      shot.lighting.style === style.id
                        ? 'bg-[#182338] text-white border-blue-500 shadow-sm'
                        : 'bg-[#12151e] text-slate-400 hover:text-white border-white/5'
                    }`}
                  >
                    <span>{style.icon}</span>
                    <span className="truncate">{style.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Key Light Direction & Contrast */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Key Light Direction</span>
                <select
                  value={shot.lighting.direction}
                  onChange={(e) => setLighting(shot.lighting.style, e.target.value as LightingDirection, shot.lighting.contrast)}
                  className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none font-mono"
                >
                  <option value="front-soft">Front Soft</option>
                  <option value="side-key">Side Key (45°)</option>
                  <option value="rim-backlit">Rim / Backlight</option>
                  <option value="overhead-top">Overhead Top</option>
                  <option value="underlit-dramatic">Underlit Dramatic</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Contrast Ratio</span>
                <select
                  value={shot.lighting.contrast}
                  onChange={(e) => setLighting(shot.lighting.style, shot.lighting.direction, e.target.value as 'soft' | 'balanced' | 'high-contrast')}
                  className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none font-mono"
                >
                  <option value="soft">Soft (Low Contrast)</option>
                  <option value="balanced">Balanced Fill</option>
                  <option value="high-contrast">High Contrast (Chiaroscuro)</option>
                </select>
              </div>
            </div>

            {/* Multi-Light Stage Rig (Position, Color, Intensity, Add/Remove Lights) */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white flex items-center gap-1.5">
                  <Sun className="h-3.5 w-3.5 text-amber-400" />
                  <span>Stage Lights ({getEffectiveStageLights(shot.lighting).length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => addStageLight()}
                  className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold transition-colors cursor-pointer"
                >
                  + Add Light
                </button>
              </div>

              <div className="space-y-2">
                {getEffectiveStageLights(shot.lighting).map((lgt, idx) => (
                  <div
                    key={lgt.id}
                    className="rounded-lg bg-[#101420] border border-white/10 p-2.5 space-y-2 font-mono text-[9px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/30"
                          style={{ backgroundColor: lgt.color || '#eab308' }}
                        />
                        <input
                          type="text"
                          value={lgt.name}
                          onChange={(e) => updateStageLight(lgt.id, { name: e.target.value })}
                          className="bg-transparent font-bold text-white text-[10px] focus:outline-none w-28 border-b border-transparent focus:border-amber-400"
                        />
                        <span className="text-[8px] text-slate-400">LGT{idx + 1}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {['#eab308', '#38bdf8', '#f43f5e', '#a855f7', '#10b981', '#ffffff'].map((sw) => (
                          <button
                            key={sw}
                            type="button"
                            onClick={() => updateStageLight(lgt.id, { color: sw })}
                            style={{ backgroundColor: sw }}
                            className={`w-3 h-3 rounded-full border transition-transform hover:scale-110 ${
                              (lgt.color || '#eab308').toLowerCase() === sw.toLowerCase()
                                ? 'ring-1 ring-white scale-110'
                                : 'border-black/40'
                            }`}
                            title={`Set light color ${sw}`}
                          />
                        ))}
                        <input
                          type="color"
                          value={lgt.color || '#eab308'}
                          onChange={(e) => updateStageLight(lgt.id, { color: e.target.value })}
                          className="w-4 h-4 rounded border-0 bg-transparent cursor-pointer"
                          title="Custom Light Color"
                        />
                        {getEffectiveStageLights(shot.lighting).length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStageLight(lgt.id)}
                            className="text-slate-400 hover:text-rose-400 p-0.5 ml-1"
                            title="Remove Light"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-slate-400">
                      <div className="space-y-0.5">
                        <div className="flex justify-between">
                          <span>X</span>
                          <span className="text-white">{Math.round(lgt.position.x)}</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={98}
                          value={lgt.position.x}
                          onChange={(e) =>
                            updateStageLight(lgt.id, {
                              position: { ...lgt.position, x: Number(e.target.value) },
                            })
                          }
                          className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex justify-between">
                          <span>Z</span>
                          <span className="text-white">{Math.round(lgt.position.y)}</span>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={98}
                          value={lgt.position.y}
                          onChange={(e) =>
                            updateStageLight(lgt.id, {
                              position: { ...lgt.position, y: Number(e.target.value) },
                            })
                          }
                          className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex justify-between">
                          <span>Height</span>
                          <span className="text-white">{Math.round(lgt.position.z ?? 45)}</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          value={lgt.position.z ?? 45}
                          onChange={(e) =>
                            updateStageLight(lgt.id, {
                              position: { ...lgt.position, z: Number(e.target.value) },
                            })
                          }
                          className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex justify-between">
                          <span>Power</span>
                          <span className="text-amber-300">{(lgt.intensity ?? 2.2).toFixed(1)}×</span>
                        </div>
                        <input
                          type="range"
                          min={0.2}
                          max={6.0}
                          step={0.2}
                          value={lgt.intensity ?? 2.2}
                          onChange={(e) =>
                            updateStageLight(lgt.id, { intensity: Number(e.target.value) })
                          }
                          className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scene Narrative & Atmosphere Prompt */}
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">Scene Narrative / Atmosphere</span>
                <span className="font-mono text-[9px] text-indigo-400">Universal Directorial Decomposer</span>
              </div>
              <textarea
                value={shot.sceneDescription}
                onChange={(e) => setSceneDescription(e.target.value)}
                rows={3}
                placeholder="Describe weather, rain streaks, wet asphalt, smoke, volumetric haze, props, lighting..."
                className="w-full rounded-lg bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] p-2 text-slate-200 text-[11px] placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none font-sans"
              />
              <button
                type="button"
                onClick={() => handleDirectSceneFromNarrative(shot.sceneDescription)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow transition-all"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>🧠 Direct 3D Stage from Narrative</span>
              </button>
            </div>

            {/* Restored Editable Negative Prompt */}
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-rose-300">Negative Prompt (Exclusions)</span>
                <span className="font-mono text-[9px] text-slate-400">Compiled into Target Engine</span>
              </div>
              <textarea
                value={shot.negativePrompt || ''}
                onChange={(e) => setNegativePrompt(e.target.value)}
                rows={2}
                placeholder="blurry, low quality, deformed limbs, watermark, text, static frame..."
                className="w-full rounded-lg bg-[#13161f] border border-rose-500/25 p-2 text-slate-200 text-[10px] placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none font-mono"
              />
              <div className="flex flex-wrap gap-1 font-mono text-[8px]">
                {[
                  'blurry, lowres, jpeg artifacts',
                  'bad anatomy, extra limbs',
                  'watermark, text, signature',
                  'flicker, temporal jitter',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      const current = (shot.negativePrompt || '').trim();
                      if (!current.includes(chip)) {
                        setNegativePrompt(current ? `${current}, ${chip}` : chip);
                      }
                    }}
                    className="px-1.5 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 transition-colors"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Streamlined Persistent Footer: Render & Export Studio */}
      <div className="border-t border-white/5 bg-[#121A2A] border-t border-[#273247] p-3 shrink-0 flex flex-col gap-2">
        {isRenderingPrevis ? (
          <div className="flex flex-col gap-1 rounded-lg bg-amber-500/20 border border-amber-500/40 p-2.5 text-center">
            <div className="flex items-center justify-between font-mono text-[10px] text-amber-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                RENDERING 3D PREVIS (24 FPS)...
              </span>
              <span>{previsProgress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-amber-400 transition-all duration-150"
                style={{ width: `${previsProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {onExportProductionPack && (
              <button
                onClick={onExportProductionPack}
                className="flex w-full items-center justify-center gap-2 rounded-lg font-display text-xs font-bold py-2.5 shadow-md transition-all active:scale-[0.98] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold shadow-glow-gold cursor-pointer"
                title="Open Unified Render, Prompt & Export Studio"
              >
                <Film className="h-4 w-4" />
                <span>RENDER & EXPORT STUDIO</span>
              </button>
            )}

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => renderPrevisVideo()}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white font-mono text-[10px] transition-all border border-white/10 cursor-pointer"
                title="Quick-render 24fps 3D Previs video in-app"
              >
                <Zap className="h-3 w-3 text-amber-400" />
                <span>{previsVideoUrl ? 'Re-Render Previs' : 'Quick Render Previs'}</span>
              </button>

              {previsVideoUrl && (
                <a
                  href={previsVideoUrl}
                  download={`${shot.name.replace(/\s+/g, '_')}_3D_Previs.mp4`}
                  className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300 font-mono text-[10px] font-bold transition-all cursor-pointer"
                  title="Download rendered 3D Previs MP4"
                >
                  <Download className="h-3 w-3" />
                  <span>MP4</span>
                </a>
              )}

              {onOpenPromptInspector && !onExportProductionPack && (
                <button
                  onClick={onOpenPromptInspector}
                  className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-300 font-mono text-[10px] font-bold transition-all cursor-pointer"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Prompt</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
