import React, { useState } from 'react';
import { useShotStore, getEffectiveStageLights } from '../stores/useShotStore';
import {
  FocalLength,
  ShotType,
  CameraAngle,
  CameraMovementType,
  MovementSpeed,
  AspectRatio,
  SensorSize,
  Aperture,
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
  ChevronDown,
  ChevronRight,
  Plus,
} from 'lucide-react';

import { useAssetLibraryStore } from '../stores/useAssetLibraryStore';
import { Upload } from 'lucide-react';
import { CINEMATIC_ENVIRONMENT_PRESETS } from '../types/environment';
import { reasonEnvironment, reasonObject } from '../services/objectReasoner';
import { registerModelFile } from '../services/modelStorage';
import { preloadGltfModels } from '../engine/gltfModelLoader';
import { decomposeDirectorialScene } from '../engine/directorialSceneDecomposer';
import { HumanoidMotionGroup } from '../engine/kinematics';
import { generateActingCuesFromPrompt, generateUniversalKinematicProgramFromPrompt } from '../services/aiActingDirector';
import { HumanoidBone } from '../engine/procedural3D/sculptSpec';
import { CharacterControlCard, OBJECT_TARGET_PALETTE } from './CharacterControlCard';

const LENS_OPTICS_INFO: Record<FocalLength, { fov: string; label: string; impact: string }> = {
  '12mm': {
    fov: '122°',
    label: 'Extreme Wide',
    impact: 'Hyper-expansive rectilinear field; monumental architectural scale & dramatic close-up perspective.',
  },
  '14mm': {
    fov: '114°',
    label: 'Ultra-Wide Prime',
    impact: 'Sweeping wide perspective with dynamic leading lines and deep environmental immersion.',
  },
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
  '40mm': {
    fov: '56°',
    label: 'Anamorphic Sweet-Spot',
    impact: 'Beloved cinema prime between 35mm & 50mm; intimate presence with natural spatial context.',
  },
  '50mm': {
    fov: '47°',
    label: 'Human Eye',
    impact: 'Natural perspective with zero distortion; truthful spatial proportions.',
  },
  '70mm': {
    fov: '34°',
    label: 'IMAX Medium-Tele',
    impact: 'Large-format three-dimensional subject pop with subtle background compression.',
  },
  '85mm': {
    fov: '28°',
    label: 'Portrait Prime',
    impact: 'Flattering facial geometry & intimate subject isolation against soft background.',
  },
  '100mm': {
    fov: '24°',
    label: 'Macro Portrait',
    impact: 'Razor-sharp emotional detail & velvety bokeh separation for close-ups.',
  },
  '135mm': {
    fov: '18°',
    label: 'Telephoto',
    impact: 'Strong axial compression; pulls distant backgrounds right behind the subject.',
  },
  '200mm': {
    fov: '12°',
    label: 'Super-Telephoto',
    impact: 'Extreme optical compression & voyeuristic isolation; flattens depth into painterly layers.',
  },
};

const PRIME_LENSES: FocalLength[] = [
  '12mm',
  '14mm',
  '18mm',
  '24mm',
  '35mm',
  '40mm',
  '50mm',
  '70mm',
  '85mm',
  '100mm',
  '135mm',
  '200mm',
];

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
    updateCameraOptions,
    updateCameraLens,
    updateCameraMovementOptions,
    applyCameraFramingPreset,
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
    resetActorMotion,
    moveActorKeyframeTime,
    scaleActorCuesInRange,
    applyActorMotionCurve,
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

  // AI Acting Director, Animation Time Window, Collapsible Cards & Bone Socketing local UI state
  const [generatingActingId, setGeneratingActingId] = useState<string | null>(null);
  const [motionWindowByActor, setMotionWindowByActor] = useState<Record<string, { start: number; end: number }>>({});
  const [collapsedActors, setCollapsedActors] = useState<Record<string, boolean>>({});
  const [expandedFineTuneByActor, setExpandedFineTuneByActor] = useState<Record<string, boolean>>({});
  const [motionSectionOpenByActor, setMotionSectionOpenByActor] = useState<Record<string, boolean>>({});
  const [timingSectionOpenByActor, setTimingSectionOpenByActor] = useState<Record<string, boolean>>({});
  const [humanMotionGroupByActor, setHumanMotionGroupByActor] = useState<Record<string, HumanoidMotionGroup>>({});
  const [motionTravelModeByActor, setMotionTravelModeByActor] = useState<Record<string, 'auto' | 'travel' | 'in-place'>>({});
  const [socketTargetActorId, setSocketTargetActorId] = useState<string>('');
  const [socketTargetBone, setSocketTargetBone] = useState<HumanoidBone>('RightHand');

  // Zero-Scroll Sub-Tabs & Collapsible Vertical Sections State
  const [cameraSubTab, setCameraSubTab] = useState<'optics' | 'trajectory' | 'all'>('optics');
  const [showCastPoolDrawer, setShowCastPoolDrawer] = useState<boolean>(false);
  const [envSubTab, setEnvSubTab] = useState<'presets' | 'weather' | 'all'>('presets');
  const [lightSubTab, setLightSubTab] = useState<'lights' | 'script' | 'all'>('lights');

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
      setSceneDescription(resultEnv.promptDescription || promptText);
      setLighting(decomposed.lighting.style, decomposed.lighting.direction, decomposed.lighting.contrast);
      setCameraMovement(decomposed.cameraSuggestion.movement.type, decomposed.cameraSuggestion.movement.speed);
      if (decomposed.cameraSuggestion.shotType) {
        const mappedShotType =
          decomposed.cameraSuggestion.shotType === 'medium-full' || decomposed.cameraSuggestion.shotType === 'medium'
            ? 'medium'
            : decomposed.cameraSuggestion.shotType === 'medium-close' || decomposed.cameraSuggestion.shotType === 'close-up'
            ? 'close-up'
            : decomposed.cameraSuggestion.shotType === 'extreme-close'
            ? 'extreme-close-up'
            : decomposed.cameraSuggestion.shotType;
        setShotType(mappedShotType as ShotType);
      }
      if (decomposed.cameraSuggestion.lensFocalLength) {
        setFocalLength(decomposed.cameraSuggestion.lensFocalLength as FocalLength);
      }
      if (decomposed.cameraSuggestion.angle) {
        const mappedAngle =
          decomposed.cameraSuggestion.angle === 'birds-eye'
            ? 'overhead-gods-eye'
            : decomposed.cameraSuggestion.angle === 'worm-eye'
            ? 'ground-level'
            : decomposed.cameraSuggestion.angle;
        setCameraAngle(mappedAngle as CameraAngle);
      }
      if (decomposed.cameraSuggestion.movement.pacing) {
        updateCameraMovementOptions({ pacing: decomposed.cameraSuggestion.movement.pacing });
      }

      if (decomposed.practicalLights && decomposed.practicalLights.length > 0) {
        for (const pl of decomposed.practicalLights.slice(0, 3)) {
          const hexColor = `#${(pl.colorHex ?? 0xffaa44).toString(16).padStart(6, '0')}`;
          addStageLight({
            name: `${pl.type.charAt(0).toUpperCase() + pl.type.slice(1)} Light`,
            color: hexColor,
            intensity: pl.intensity,
            position: {
              x: Math.min(95, Math.max(5, Math.round(50 + (pl.relativePosition?.[0] ?? 0) * 5))),
              y: Math.min(95, Math.max(5, Math.round(50 + (pl.relativePosition?.[2] ?? 0) * 5))),
              z: Math.min(95, Math.max(5, Math.round(15 + (pl.relativePosition?.[1] ?? 1) * 15))),
            },
            enabled: true,
          });
        }
      }

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
            sculpt: actor.sculpt,
            partGraph: actor.sculpt,
            startPosition: actor.stagePosition
              ? { x: actor.stagePosition.x, y: actor.stagePosition.y, z: 0 }
              : undefined,
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
    if (decomposed.cameraSuggestion.shotType) {
      const mappedShotType =
        decomposed.cameraSuggestion.shotType === 'medium-full' || decomposed.cameraSuggestion.shotType === 'medium'
          ? 'medium'
          : decomposed.cameraSuggestion.shotType === 'medium-close' || decomposed.cameraSuggestion.shotType === 'close-up'
          ? 'close-up'
          : decomposed.cameraSuggestion.shotType === 'extreme-close'
          ? 'extreme-close-up'
          : decomposed.cameraSuggestion.shotType;
      setShotType(mappedShotType as ShotType);
    }
    if (decomposed.cameraSuggestion.lensFocalLength) {
      setFocalLength(decomposed.cameraSuggestion.lensFocalLength as FocalLength);
    }
    if (decomposed.cameraSuggestion.angle) {
      const mappedAngle =
        decomposed.cameraSuggestion.angle === 'birds-eye'
          ? 'overhead-gods-eye'
          : decomposed.cameraSuggestion.angle === 'worm-eye'
          ? 'ground-level'
          : decomposed.cameraSuggestion.angle;
      setCameraAngle(mappedAngle as CameraAngle);
    }
    if (decomposed.cameraSuggestion.movement.pacing) {
      updateCameraMovementOptions({ pacing: decomposed.cameraSuggestion.movement.pacing });
    }

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
          sculpt: actor.sculpt,
          partGraph: actor.sculpt,
          startPosition: actor.stagePosition
            ? { x: actor.stagePosition.x, y: actor.stagePosition.y, z: 0 }
            : undefined,
        });
      }
    }
  };

  // Auto-expand selected actor card and auto-collapse other cards (Vertical Accordion) in staging tab
  React.useEffect(() => {
    if (selectedActorId && selectedActorId !== '__camera__') {
      setCollapsedActors(() => {
        const next: Record<string, boolean> = {};
        useShotStore.getState().shot.actors.forEach((a) => {
          next[a.id] = a.id !== selectedActorId;
        });
        return next;
      });
    }
    if (selectedActorId && activeTab === 'staging') {
      const el = document.querySelector(`[data-actor-card="${selectedActorId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedActorId, activeTab]);

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
          <div className="flex items-center gap-1 rounded-lg bg-[#090D16] border border-[#273247] px-2 py-1.5 font-mono text-[10.5px] shrink-0 shadow-inner" title="Shot Duration (1s – 15s)">
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
              onClick={() => updateDuration(Math.min(15, (shot.durationSeconds || 4) + 1))}
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
          <div className="p-3.5 space-y-3">
            {/* Zero-Scroll Camera Sub-Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#080b12] p-1 border border-white/[0.08]">
              {(
                [
                  { id: 'optics' as const, label: '🎥 Lens' },
                  { id: 'trajectory' as const, label: '🛤️ Path' },
                  { id: 'all' as const, label: '⊞ All' },
                ]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCameraSubTab(t.id)}
                  className={`py-1.5 px-2 rounded-lg text-[10.5px] font-semibold transition-all truncate ${
                    cameraSubTab === t.id
                      ? 'bg-gradient-to-b from-indigo-600 to-indigo-700 text-white shadow-sm border border-indigo-400/50'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.05] border border-transparent'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className={cameraSubTab === 'optics' || cameraSubTab === 'all' ? 'space-y-3.5' : 'hidden'}>
            {/* 1. Compact 3D Stage Camera Gizmo Scale & Frustum Controls */}
            <div className="rounded-xl bg-[#0b101b] border border-[#243046] p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="font-bold text-amber-300 flex items-center gap-1">
                  🎥 Rig Size
                </span>
                <div className="flex items-center gap-1">
                  {[
                    { label: '0.5x', val: 0.5 },
                    { label: '1.0x', val: 1.0 },
                    { label: '1.4x', val: 1.4 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => updateCameraOptions({ gizmoScale: preset.val })}
                      className={`px-1.5 py-0.5 rounded text-[9px] border transition-all ${
                        Math.abs((shot.camera.gizmoScale ?? 1.0) - preset.val) < 0.08
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-bold'
                          : 'bg-[#131C2E] border-[#273247] text-slate-400 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 text-[9.5px] font-mono text-slate-400">
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span>Scale</span>
                    <span className="text-white font-bold">{(shot.camera.gizmoScale ?? 1.0).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={1.5}
                    step={0.05}
                    value={shot.camera.gizmoScale ?? 1.0}
                    onChange={(e) => updateCameraOptions({ gizmoScale: Number(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-amber-400"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span>Frustum</span>
                    <span className="text-white font-bold">
                      {(shot.camera.frustumLength ?? 24) === 0 ? 'Hidden' : `${shot.camera.frustumLength ?? 24}m`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={55}
                    step={1}
                    value={shot.camera.frustumLength ?? 24}
                    onChange={(e) => updateCameraOptions({ frustumLength: Number(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* 2. Unified Camera Prime & Zoom Lens Slider (10–200mm + 12 Primes) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">Camera Lens</span>
                <span className="font-mono text-[10px] text-blue-400 font-bold">
                  {shot.camera.lens.customFocalLengthMm ? `${shot.camera.lens.customFocalLengthMm}mm` : shot.camera.lens.focalLength} • {activeLensInfo.fov} ({activeLensInfo.label})
                </span>
              </div>

              <div className="rounded-xl bg-[#111827] border border-[#273247] p-2.5 space-y-2.5 font-mono text-[9.5px]">
                {/* Unified Focal Length Slider + 12 Prime Stops */}
                <div className="space-y-1.5">
                  <input
                    type="range"
                    aria-label="Camera Prime and Zoom Lens Slider"
                    min={10}
                    max={200}
                    step={1}
                    value={shot.camera.lens.customFocalLengthMm ?? parseInt(shot.camera.lens.focalLength, 10)}
                    onChange={(e) => {
                      const mm = Number(e.target.value);
                      const exactPrime = PRIME_LENSES.find((p) => parseInt(p, 10) === mm);
                      const nearestPrime = PRIME_LENSES.reduce((prev, curr) =>
                        Math.abs(parseInt(curr, 10) - mm) < Math.abs(parseInt(prev, 10) - mm) ? curr : prev
                      );
                      setFocalLength(nearestPrime);
                      updateCameraLens({
                        focalLength: nearestPrime,
                        customFocalLengthMm: exactPrime ? undefined : mm,
                      });
                    }}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-[#6658F5]"
                  />
                  <div className="flex items-center justify-between text-[8.5px]">
                    {PRIME_LENSES.map((fl) => {
                      const currentMm = shot.camera.lens.customFocalLengthMm ?? parseInt(shot.camera.lens.focalLength, 10);
                      const isActive = currentMm === parseInt(fl, 10);
                      return (
                        <button
                          key={fl}
                          type="button"
                          onClick={() => {
                            setFocalLength(fl);
                            updateCameraLens({ focalLength: fl, customFocalLengthMm: undefined });
                          }}
                          title={`${fl} Prime (${LENS_OPTICS_INFO[fl].fov} FOV • ${LENS_OPTICS_INFO[fl].label})`}
                          className={`px-1 py-0.5 rounded transition-all ${
                            isActive
                              ? 'bg-[#6658F5] text-white font-bold shadow-[0_1px_6px_rgba(102,88,245,0.5)]'
                              : 'text-[#98A5BC] hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {fl.replace('mm', '')}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Focus Plane Distance */}
                <div className="pt-1 border-t border-slate-800/80">
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>Focus Dist</span>
                    <button
                      type="button"
                      onClick={() => updateCameraOptions({ showFocusPlane: shot.camera.showFocusPlane === false })}
                      className={`text-[8.5px] px-1.5 py-0.5 rounded ${
                        shot.camera.showFocusPlane !== false
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                      title="Toggle 3D Focus Plane slice inside frustum"
                    >
                      {shot.camera.lens.focusDistanceMeters ?? 12}m {shot.camera.showFocusPlane !== false ? '• ON' : '• OFF'}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={50}
                    step={1}
                    value={shot.camera.lens.focusDistanceMeters ?? 12}
                    onChange={(e) => updateCameraLens({ focusDistanceMeters: Number(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-0.5">
                    <span className="text-slate-400 text-[9px]">Sensor</span>
                    <select
                      value={shot.camera.lens.sensorSize || 'full-frame'}
                      onChange={(e) => updateCameraLens({ sensorSize: e.target.value as SensorSize })}
                      className="w-full rounded bg-[#090D16] border border-[#273247] px-2 py-1 text-white text-[10px] focus:outline-none"
                    >
                      <option value="full-frame">Full-Frame 35mm</option>
                      <option value="super35">Super 35mm</option>
                      <option value="anamorphic">Anamorphic 2x</option>
                      <option value="imax-65mm">IMAX 65mm</option>
                      <option value="micro-four-thirds">Micro 4/3</option>
                    </select>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400 text-[9px]">Aperture</span>
                    <select
                      value={shot.camera.lens.aperture || 'f/2.8'}
                      onChange={(e) => updateCameraLens({ aperture: e.target.value as Aperture })}
                      className="w-full rounded bg-[#090D16] border border-[#273247] px-2 py-1 text-white text-[10px] focus:outline-none"
                    >
                      <option value="f/1.2">f/1.2 (Ultra Shallow)</option>
                      <option value="f/1.4">f/1.4 (Fast Prime)</option>
                      <option value="f/2.0">f/2.0 (Soft Bokeh)</option>
                      <option value="f/2.8">f/2.8 (Standard)</option>
                      <option value="f/4.0">f/4.0 (Balanced)</option>
                      <option value="f/5.6">f/5.6 (Crisp)</option>
                      <option value="f/8.0">f/8.0 (Deep)</option>
                      <option value="f/11">f/11 (Wide Deep)</option>
                      <option value="f/16">f/16 (Hyper-Focal)</option>
                      <option value="f/22">f/22 (Infinite)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-blue-950/30 border border-blue-500/20 px-2.5 py-1.5 text-[10px] text-blue-200/90 font-mono">
                <strong className="text-blue-400">Lens Note:</strong> {activeLensInfo.impact}
              </div>
            </div>

            {/* 3. Smart Subject Tracking & 1-Click Auto-Framing Presets */}
            <div className="rounded-xl bg-[#0e1628] border border-cyan-500/30 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold text-cyan-300 flex items-center gap-1">
                  <Target className="h-3 w-3 text-cyan-400" />
                  Auto-Framing
                </span>
                {shot.camera.trackTargetActorId && (
                  <button
                    type="button"
                    onClick={() => updateCameraOptions({ trackTargetActorId: undefined, followActorMovement: false })}
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30"
                  >
                    Unlock
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-1 font-mono text-[9px]">
                {(
                  [
                    { id: 'face-cu' as const, label: '👤 Face CU' },
                    { id: 'medium-bust' as const, label: '👔 Med Bust' },
                    { id: 'cowboy' as const, label: '🤠 Cowboy' },
                    { id: 'ots-right' as const, label: '📐 OTS Right' },
                    { id: 'ots-left' as const, label: '📐 OTS Left' },
                    { id: 'hero-low' as const, label: '🦸 Hero Low' },
                    { id: 'birds-eye' as const, label: '🦅 Bird Eye' },
                    { id: 'wide-establish' as const, label: '🌄 Wide Set' },
                  ]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyCameraFramingPreset(p.id, selectedActorId)}
                    className="py-1 px-1.5 rounded bg-[#131C2E] hover:bg-cyan-500/25 border border-[#273247] hover:border-cyan-400/50 text-slate-200 hover:text-white transition-all truncate"
                    title={`Snap camera position, lens & aim to ${p.label}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[9.5px]">
                <div className="space-y-0.5">
                  <span className="text-slate-400 text-[9px]">Track Subject</span>
                  <select
                    value={shot.camera.trackTargetActorId || ''}
                    onChange={(e) =>
                      updateCameraOptions({
                        trackTargetActorId: e.target.value ? e.target.value : undefined,
                      })
                    }
                    className="w-full rounded bg-[#090D16] border border-[#273247] px-2 py-1 text-white text-[10px] focus:outline-none"
                  >
                    <option value="">🔓 Free Aim</option>
                    {shot.actors.map((a) => (
                      <option key={a.id} value={a.id}>
                        🎯 {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-0.5">
                  <span className="text-slate-400 text-[9px]">Aim Zone</span>
                  <select
                    value={shot.camera.trackTargetBone || 'head'}
                    onChange={(e) =>
                      updateCameraOptions({
                        trackTargetBone: e.target.value as 'head' | 'chest' | 'pelvis' | 'feet',
                      })
                    }
                    className="w-full rounded bg-[#090D16] border border-[#273247] px-2 py-1 text-white text-[10px] focus:outline-none"
                  >
                    <option value="head">👁️ Head (4.4m)</option>
                    <option value="chest">🫀 Chest (3.5m)</option>
                    <option value="pelvis">🧍 Waist (2.6m)</option>
                    <option value="feet">👟 Feet (0.5m)</option>
                  </select>
                </div>
              </div>

              {shot.camera.trackTargetActorId && (
                <label className="flex items-center justify-between pt-1 text-[9.5px] font-mono text-emerald-300 cursor-pointer">
                  <span>🏃 Follow Subject</span>
                  <input
                    type="checkbox"
                    checked={Boolean(shot.camera.followActorMovement)}
                    onChange={(e) => updateCameraOptions({ followActorMovement: e.target.checked })}
                    className="rounded accent-emerald-400"
                  />
                </label>
              )}
            </div>

            {/* Aspect Ratio & Shot Framing (with Extreme-Wide restored) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Ratio</span>
                <select
                  value={shot.aspectRatio}
                  onChange={(e) => updateAspectRatio(e.target.value as AspectRatio)}
                  className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none"
                >
                  <option value="16:9">16:9 (Widescreen)</option>
                  <option value="2.39:1">2.39:1 (Scope)</option>
                  <option value="9:16">9:16 (Vertical)</option>
                  <option value="4:3">4:3 (Academy)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Framing</span>
                <select
                  value={shot.camera.shotType}
                  onChange={(e) => setShotType(e.target.value as ShotType)}
                  className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none"
                >
                  <option value="extreme-wide">Extreme Wide</option>
                  <option value="wide">Wide Shot</option>
                  <option value="medium-wide">Medium Wide</option>
                  <option value="medium">Medium Shot</option>
                  <option value="medium-close-up">Medium Close-Up</option>
                  <option value="close-up">Close-Up</option>
                  <option value="extreme-close-up">Extreme Close-Up</option>
                </select>
              </div>
            </div>

            {/* Camera Angle & Angle Psychology */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-slate-400 font-mono text-[10px]">Angle</span>
                  <select
                    value={shot.camera.angle}
                    onChange={(e) => setCameraAngle(e.target.value as CameraAngle)}
                    className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none"
                  >
                    <option value="eye-level">Eye Level</option>
                    <option value="low-angle">Low Angle</option>
                    <option value="high-angle">High Angle</option>
                    <option value="overhead-gods-eye">Overhead</option>
                    <option value="ground-level">Ground Level</option>
                    <option value="dutch-angle">Dutch Angle</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <span className="text-slate-400 font-mono text-[10px]">Speed</span>
                  <select
                    value={shot.camera.movement.speed}
                    onChange={(e) => setCameraMovement(shot.camera.movement.type, e.target.value as MovementSpeed)}
                    className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none"
                  >
                    <option value="slow-cinematic">Slow</option>
                    <option value="moderate">Moderate</option>
                    <option value="rapid-dynamic">Fast</option>
                  </select>
                </div>
              </div>
              <div className="rounded-md bg-amber-950/25 border border-amber-500/20 px-2.5 py-1.5 text-[10px] text-amber-200/90 font-mono">
                <strong className="text-amber-400">Angle Note:</strong> {activeAngleInfo}
              </div>
            </div>
            </div>

            <div className={cameraSubTab === 'trajectory' || cameraSubTab === 'all' ? 'space-y-3.5' : 'hidden'}>
            {/* All 21 Categorized Camera Movements */}
            <div className="space-y-1">
              <span className="text-slate-400 font-mono text-[10px]">Camera Move</span>
              <select
                value={shot.camera.movement.type}
                onChange={(e) => setCameraMovement(e.target.value as CameraMovementType, shot.camera.movement.speed)}
                className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none font-mono"
              >
                <optgroup label="Tripod & Static">
                  <option value="static">⏸️ Static Tripod</option>
                </optgroup>
                <optgroup label="Depth & Dolly">
                  <option value="dolly-in">🎥 Dolly In</option>
                  <option value="dolly-out">🎥 Dolly Out</option>
                  <option value="dolly-zoom-vertigo">🌀 Dolly-Zoom (Vertigo)</option>
                  <option value="steadicam-follow">🏃 Steadicam Follow</option>
                </optgroup>
                <optgroup label="Lateral Tracking">
                  <option value="truck-left">◀️ Truck Left</option>
                  <option value="truck-right">▶️ Truck Right</option>
                </optgroup>
                <optgroup label="Vertical Crane / Pedestal">
                  <option value="pedestal-up">🔺 Crane Up</option>
                  <option value="pedestal-down">🔻 Crane Down</option>
                  <option value="crane-arc">🏗️ Crane Arc</option>
                </optgroup>
                <optgroup label="Rotational Pan & Tilt">
                  <option value="pan-left">⬅️ Pan Left</option>
                  <option value="pan-right">➡️ Pan Right</option>
                  <option value="tilt-up">⬆️ Tilt Up</option>
                  <option value="tilt-down">⬇️ Tilt Down</option>
                </optgroup>
                <optgroup label="360° Orbital Arcs">
                  <option value="orbit-clockwise">🔄 Orbit CW</option>
                  <option value="orbit-counter-clockwise">🔄 Orbit CCW</option>
                  <option value="spiral-orbit-in">🎯 Spiral Push-In</option>
                </optgroup>
                <optgroup label="Optical & Specialty Rigs">
                  <option value="rack-focus">🔍 Rack Focus</option>
                  <option value="handheld-subtle">📹 Handheld</option>
                  <option value="whip-pan">⚡ Whip Pan</option>
                  <option value="crash-zoom">💥 Crash Zoom</option>
                  <option value="fpv-dive">🦅 FPV Dive</option>
                </optgroup>
              </select>
            </div>

            {/* Direct Orientation & Aim Controls (Dutch Roll, Pitch, Yaw, Look-At Height) */}
            <div className="rounded-xl bg-[#111827] border border-[#273247] p-2.5 space-y-2 font-mono text-[9.5px]">
              <div className="flex items-center justify-between">
                <span className="text-indigo-300 font-bold">📐 Aim & Tilt</span>
                <button
                  type="button"
                  onClick={() =>
                    updateCameraOptions({
                      dutchRollDeg: 0,
                      pitchOffsetDeg: 0,
                      yawOffsetDeg: 0,
                      lookAtHeightOffset: 0,
                    })
                  }
                  className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white text-[8.5px]"
                >
                  Reset
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-slate-400">
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span>Dutch Roll</span>
                    <span className="text-white font-bold">{shot.camera.dutchRollDeg ?? 0}°</span>
                  </div>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={shot.camera.dutchRollDeg ?? 0}
                    onChange={(e) => updateCameraOptions({ dutchRollDeg: Number(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span>Pitch</span>
                    <span className="text-white font-bold">{shot.camera.pitchOffsetDeg ?? 0}°</span>
                  </div>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={shot.camera.pitchOffsetDeg ?? 0}
                    onChange={(e) => updateCameraOptions({ pitchOffsetDeg: Number(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span>Yaw</span>
                    <span className="text-white font-bold">{shot.camera.yawOffsetDeg ?? 0}°</span>
                  </div>
                  <input
                    type="range"
                    min={-60}
                    max={60}
                    step={1}
                    value={shot.camera.yawOffsetDeg ?? 0}
                    onChange={(e) => updateCameraOptions({ yawOffsetDeg: Number(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span>Aim Height</span>
                    <span className="text-white font-bold">
                      {(shot.camera.lookAtHeightOffset ?? 0) >= 0 ? '+' : ''}
                      {(shot.camera.lookAtHeightOffset ?? 0).toFixed(1)}m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-3.0}
                    max={4.0}
                    step={0.2}
                    value={shot.camera.lookAtHeightOffset ?? 0}
                    onChange={(e) => updateCameraOptions({ lookAtHeightOffset: Number(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
              </div>
            </div>

            {/* Advanced Trajectory Curve, Shake & Easing Tuning */}
            <div className="rounded-xl bg-[#111827] border border-[#273247] p-2.5 space-y-2 font-mono text-[9.5px]">
              <div className="flex items-center justify-between">
                <span className="text-emerald-300 font-bold">🛤️ Curve & Shake</span>
                <select
                  value={shot.camera.movement.pacing || 'ease-in-out'}
                  onChange={(e) =>
                    updateCameraMovementOptions({
                      pacing: e.target.value as 'linear' | 'ease-in-out' | 'ease-in' | 'ease-out',
                    })
                  }
                  className="rounded bg-[#090D16] border border-[#273247] px-1.5 py-0.5 text-white text-[9px] focus:outline-none"
                >
                  <option value="ease-in-out">Ease-In-Out</option>
                  <option value="linear">Linear</option>
                  <option value="ease-in">Ease-In</option>
                  <option value="ease-out">Ease-Out</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2.5 text-slate-400">
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span>Curve Arc</span>
                    <span className="text-white font-bold">{shot.camera.movement.arcCurve ?? 0}</span>
                  </div>
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    step={1}
                    value={shot.camera.movement.arcCurve ?? 0}
                    onChange={(e) => updateCameraMovementOptions({ arcCurve: Number(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-400"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span>Shake</span>
                    <span className="text-white font-bold">{shot.camera.movement.shakeIntensity ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={2}
                    value={shot.camera.movement.shakeIntensity ?? 0}
                    onChange={(e) => updateCameraMovementOptions({ shakeIntensity: Number(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Camera 3D Path Coordinates Sliders */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="font-bold text-slate-200">Camera Path</span>
                <button
                  type="button"
                  onClick={() => focusCameraOnSubject(selectedActorId !== '__camera__' ? selectedActorId : undefined)}
                  className="flex items-center gap-1 rounded bg-cyan-500/15 hover:bg-cyan-500/30 border border-cyan-500/40 px-2 py-0.5 text-cyan-300 hover:text-white transition-all font-bold"
                  title="Lock camera look-at target onto selected subject"
                >
                  <Target className="h-3 w-3 text-cyan-400" />
                  <span>Aim Subject</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[9px] text-slate-400">
                <div className="space-y-1 bg-[#131C2E] p-3 rounded-xl border border-[#273247]">
                  <span className="text-blue-400 font-bold">Start Pos</span>
                  <div className="flex justify-between">
                    <span>X</span>
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
                    <span>Z</span>
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
                    <span>Y</span>
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
                  <span className="text-emerald-400 font-bold">End Pos</span>
                  <div className="flex justify-between">
                    <span>X</span>
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
                    <span>Z</span>
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
                    <span>Y</span>
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
                  <span className="text-slate-300 font-bold">Rig Color:</span>
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
          </div>
        )}

        {/* ================= TAB 2: CAST & STAGE (ZERO DUPLICATES + SCENE CAST POOL) ================= */}
        {activeTab === 'staging' && (
          <div className="p-3 space-y-2.5">
            {/* 1. Single Top Button to Open the 3D Asset Library & AI Studio Popup (No Collapsible Drawer) */}
            <button
              type="button"
              onClick={() => openAssetLibrary()}
              className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-amber-600/90 via-indigo-600/90 to-purple-600/90 hover:from-amber-500 hover:via-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-between shadow-lg border border-amber-400/40 transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-amber-300 shrink-0" />
                <span>Add Subject</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/45 border border-white/20 text-amber-200">
                Library / Upload
              </span>
            </button>

            {/* 2. Scene Cast Pool — Individual Vertical Collapsible Panel */}
            <div className="rounded-xl bg-[#121A2A] border border-[#6658F5]/35 shadow-sm p-2.5 space-y-2">
              <button
                type="button"
                onClick={() => setShowCastPoolDrawer((v) => !v)}
                className="w-full flex items-center justify-between gap-2 text-left group"
                title="Expand or collapse Scene Cast Pool for cross-shot continuity"
              >
                <span className="font-mono text-[11px] font-bold text-indigo-300 group-hover:text-indigo-200 flex items-center gap-1.5 min-w-0">
                  {showCastPoolDrawer ? (
                    <ChevronDown className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  )}
                  <Users className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">Cast Pool ({sceneCastPool.length})</span>
                </span>
                <span className="font-mono text-[9.5px] text-slate-400 shrink-0">
                  {showCastPoolDrawer ? '▾ Hide' : 'Saved'}
                </span>
              </button>

              <div className={showCastPoolDrawer ? 'pt-1.5 border-t border-indigo-500/20' : 'hidden'}>
              {sceneCastPool.length === 0 ? (
                <p className="text-[10px] font-mono text-slate-400 leading-relaxed">
                  Click <strong className="text-indigo-300">Save</strong> on any stage character below to reuse across shots.
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
            </div>

            {/* 3. Placed 3D Objects List (Vertical Stack with Auto-Collapse Accordion) */}
            <div className="space-y-2.5 pt-1 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs text-white">On Stage ({shot.actors.length})</span>
                {shot.actors.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const effectiveFocusedActorId =
                          selectedActorId && shot.actors.some((a) => a.id === selectedActorId)
                            ? selectedActorId
                            : shot.actors[0]?.id;
                        const allCollapsed = shot.actors.every((a) =>
                          collapsedActors[a.id] !== undefined ? collapsedActors[a.id] : a.id !== effectiveFocusedActorId
                        );
                        const next: Record<string, boolean> = {};
                        shot.actors.forEach((a) => {
                          next[a.id] = !allCollapsed;
                        });
                        setCollapsedActors(next);
                      }}
                      className="ui-chip text-[10px] px-2 py-1"
                      title="Collapse or expand all object cards"
                    >
                      {shot.actors.every((a) =>
                        collapsedActors[a.id] !== undefined
                          ? collapsedActors[a.id]
                          : a.id !==
                            (selectedActorId && shot.actors.some((act) => act.id === selectedActorId)
                              ? selectedActorId
                              : shot.actors[0]?.id)
                      )
                        ? '▸ Expand'
                        : '▾ Collapse'}
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
                <div className="space-y-2.5">
                  {shot.actors.map((actor) => {
                    const shotDur = shot.durationSeconds || 4;
                    const win = motionWindowByActor[actor.id] || { start: 0, end: shotDur };
                    const effectiveFocusedActorId =
                      selectedActorId && shot.actors.some((a) => a.id === selectedActorId)
                        ? selectedActorId
                        : shot.actors[0]?.id;
                    const isSelected = actor.id === effectiveFocusedActorId;
                    const isCollapsed =
                      collapsedActors[actor.id] !== undefined
                        ? Boolean(collapsedActors[actor.id])
                        : actor.id !== effectiveFocusedActorId;
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
                        onSelectActor={(id) => {
                          setSelectedActorId(id);
                          setCollapsedActors(() => {
                            const next: Record<string, boolean> = {};
                            shot.actors.forEach((a) => {
                              next[a.id] = a.id !== id;
                            });
                            return next;
                          });
                        }}
                        onToggleCollapse={(id) =>
                          setCollapsedActors((prev) => {
                            const currentlyCollapsed =
                              prev[id] !== undefined ? Boolean(prev[id]) : id !== effectiveFocusedActorId;
                            return { ...prev, [id]: !currentlyCollapsed };
                          })
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
                        onResetActorMotion={(id) => resetActorMotion(id)}
                        onExtendShotDuration={(nextDur) => updateDuration(nextDur)}
                        onMoveActorCueTime={(id, cueId, nextTime) => moveActorKeyframeTime(id, cueId, nextTime)}
                        onScaleActorCuesInRange={(id, oldStart, oldEnd, newStart, newEnd, initialTimesById) =>
                          scaleActorCuesInRange(id, oldStart, oldEnd, newStart, newEnd, initialTimesById)
                        }
                        onApplyActorMotionCurve={(id, curve, startSec, endSec) =>
                          applyActorMotionCurve(id, curve, startSec, endSec)
                        }
                        onSeekTime={(t) => {
                          useShotStore.setState({ currentTime: t, isPlaying: false });
                          window.dispatchEvent(
                            new CustomEvent('cmpvs:transport-play', {
                              detail: { time: t, play: false },
                            })
                          );
                        }}
                        onDirectCustomAction={async (act, actionText, safeStart, safeEnd, cueDuration, overrideCycles) => {
                          const effectiveCycles = Math.max(1, Math.min(20, Math.round(overrideCycles ?? act.motionCycles ?? 1)));
                          applyDirectorialMotion(act.id, actionText, {
                            startTimeSec: safeStart,
                            endTimeSec: safeEnd,
                            motionCycles: effectiveCycles,
                          });
                          useShotStore.setState({ currentTime: safeStart, isPlaying: true });
                          window.dispatchEvent(
                            new CustomEvent('cmpvs:transport-play', {
                              detail: { time: safeStart, play: true },
                            })
                          );
                          const latestAfterApply = useShotStore
                            .getState()
                            .shot.actors.find((a) => a.id === act.id);
                          const hasUniversalFallbackClip = Boolean(
                            latestAfterApply?.motionClip?.startsWith('universal-ik:') ||
                              latestAfterApply?.trajectory.keyframes?.some((kf) =>
                                Boolean(kf.motionClip?.startsWith('universal-ik:'))
                              )
                          );
                          const hasCompiledMotionClips = Boolean(
                            !hasUniversalFallbackClip &&
                              (latestAfterApply?.motionClip ||
                                latestAfterApply?.trajectory.keyframes?.some((kf) => Boolean(kf.motionClip)))
                          );
                          // When an open-ended prompt synthesized a Universal IK program, upgrade it via the AI Reasoner if configured
                          if (
                            hasUniversalFallbackClip &&
                            (!act.kind || act.kind === 'human' || act.kind === 'character')
                          ) {
                            setGeneratingActingId(act.id);
                            try {
                              const singleCycleDur = Math.max(0.2, cueDuration / effectiveCycles);
                              const llmProgram = await generateUniversalKinematicProgramFromPrompt(
                                actionText,
                                singleCycleDur,
                                act.name,
                                shot.sceneDescription
                              );
                              if (llmProgram && llmProgram.id.startsWith('universal-ik:llm_')) {
                                const currentShot = useShotStore.getState().shot;
                                const updatedActors = currentShot.actors.map((a) => {
                                  if (a.id !== act.id) return a;
                                  const updatedKfs = (a.trajectory.keyframes || []).map((kf) =>
                                    kf.time >= safeStart - 0.08 &&
                                    kf.time <= safeEnd + 0.08 &&
                                    kf.motionClip?.startsWith('universal-ik:')
                                      ? { ...kf, motionClip: llmProgram.id }
                                      : kf
                                  );
                                  return {
                                    ...a,
                                    motionClip: a.motionClip?.startsWith('universal-ik:') ? llmProgram.id : a.motionClip,
                                    trajectory: {
                                      ...a.trajectory,
                                      keyframes: updatedKfs,
                                    },
                                  };
                                });
                                useShotStore.setState({
                                  shot: { ...currentShot, actors: updatedActors },
                                  currentTime: safeStart,
                                  isPlaying: true,
                                });
                              }
                            } catch {
                              // Offline universal kinematic program already active
                            } finally {
                              setGeneratingActingId(null);
                            }
                          } else if (
                            !hasCompiledMotionClips &&
                            (!act.kind || act.kind === 'human' || act.kind === 'character')
                          ) {
                            setGeneratingActingId(act.id);
                            try {
                              const singleCycleDur = Math.max(0.2, cueDuration / effectiveCycles);
                              const cues = await generateActingCuesFromPrompt(
                                actionText,
                                singleCycleDur,
                                act.name,
                                shot.sceneDescription
                              );
                              const latestActor = useShotStore
                                .getState()
                                .shot.actors.find((a) => a.id === act.id);
                              const baseGait = latestActor?.gait;
                              for (let c = 0; c < effectiveCycles; c++) {
                                const cycleOffset = c * singleCycleDur;
                                cues.forEach((cue) => {
                                  const effectiveGait =
                                    cue.gait && cue.gait !== 'none'
                                      ? cue.gait
                                      : baseGait === 'walk' || baseGait === 'run' || baseGait === 'sneak'
                                      ? baseGait
                                      : undefined;
                                  const effectivePosePreset =
                                    effectiveGait === 'walk' || effectiveGait === 'run' || effectiveGait === 'sneak'
                                      ? undefined
                                      : cue.posePreset && cue.posePreset !== 'neutral-stand'
                                      ? cue.posePreset
                                      : undefined;
                                  if (effectivePosePreset || effectiveGait) {
                                    recordActorPoseAtTime(
                                      act.id,
                                      Math.min(shotDur, safeStart + cycleOffset + cue.time),
                                      undefined,
                                      effectivePosePreset,
                                      effectiveGait,
                                      shotDur
                                    );
                                  }
                                });
                              }
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
                            const existingSculpt = act.sculpt || act.partGraph;
                            const graph = await reasonObject(promptToReason, {
                              reviseSpec: existingSculpt,
                              revisionFeedback: existingSculpt ? promptToReason : undefined,
                              imageBase64: act.conceptImageUrl?.startsWith('data:') ? act.conceptImageUrl : undefined,
                            });
                            updateActor(act.id, {
                              token: promptToReason,
                              sculpt: graph,
                              partGraph: graph,
                            });
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
          <div className="p-3.5 space-y-3">
            {/* Zero-Scroll Environment Sub-Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#080b12] p-1 border border-white/[0.08]">
              {(
                [
                  { id: 'presets' as const, label: '🏛️ Presets' },
                  { id: 'weather' as const, label: '🌦️ Weather' },
                  { id: 'all' as const, label: '⊞ All' },
                ]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setEnvSubTab(t.id)}
                  className={`py-1.5 px-2 rounded-lg text-[10.5px] font-semibold transition-all truncate ${
                    envSubTab === t.id
                      ? 'bg-gradient-to-b from-emerald-600 to-teal-700 text-white shadow-sm border border-emerald-400/50'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.05] border border-transparent'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className={envSubTab === 'presets' || envSubTab === 'all' ? 'space-y-3.5' : 'hidden'}>
            <div className="rounded-lg bg-gradient-to-br from-emerald-950/40 via-[#10141f] to-[#0c0e14] border border-emerald-500/30 p-3 space-y-2 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🌍</span>
                  <div>
                    <div className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span>{shot.environment?.name || 'Soundstage Studio'}</span>
                    </div>
                    <div className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider">
                      {shot.environment?.category || 'studio'}
                    </div>
                  </div>
                </div>
                <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 font-mono text-[9px] font-bold">
                  Active
                </span>
              </div>

              <div className="space-y-1">
                <div className="rounded-xl bg-[#0b101d] border border-emerald-500/30 p-2 flex items-center justify-between gap-2.5 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {shot.environment?.conceptImageUrl ? (
                      <img
                        src={shot.environment.conceptImageUrl}
                        alt={shot.environment?.name || 'Set Reference'}
                        className="h-11 w-11 rounded-lg object-cover border border-emerald-400/50 shrink-0 bg-black"
                      />
                    ) : (
                      <div className="h-11 w-11 rounded-lg bg-black/60 border border-dashed border-emerald-400/35 flex items-center justify-center text-emerald-300/70 shrink-0 text-[10px] font-mono">
                        SET
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10.5px] font-bold text-emerald-200 truncate">
                          Set Ref Image
                        </span>
                        {shot.environment?.conceptImageUrl && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-[8.5px] font-mono text-emerald-300">
                            Ready
                          </span>
                        )}
                      </div>
                      <p className="text-[9.5px] text-slate-400 leading-tight">
                        Used as location plate in ComfyUI render.
                      </p>
                      {shot.environment?.conceptImageName && (
                        <div className="text-[9px] font-mono text-emerald-300 truncate mt-0.5">
                          📎 {shot.environment.conceptImageName}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <label
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-400/40 text-[10px] font-semibold text-emerald-100 cursor-pointer transition-colors"
                      title="Upload reference image for the Set / Environment (used in ComfyUI video render)"
                    >
                      <Upload className="h-3 w-3 text-emerald-300" />
                      <span>{shot.environment?.conceptImageUrl ? 'Change' : 'Upload'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              setEnvironment({
                                ...(shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec),
                                conceptImageUrl: reader.result,
                                conceptImageName: file.name,
                              });
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {shot.environment?.conceptImageUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setEnvironment({
                            ...(shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec),
                            conceptImageUrl: undefined,
                            conceptImageName: undefined,
                          })
                        }
                        className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 border border-rose-500/35 text-rose-300"
                        title="Clear set reference image"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <span className="text-[9px] font-mono text-slate-400">Set Prompt:</span>
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
                  <span>AI Set Builder</span>
                </span>
                <span className="font-mono text-[9px] text-slate-400">Reasoner</span>
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
                    <span>✨ Build</span>
                  )}
                </button>
              </div>
            </div>

            {/* Cinematic Location Presets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">Set Presets</span>
                <span className="font-mono text-[9px] text-slate-400">{CINEMATIC_ENVIRONMENT_PRESETS.length} Sets</span>
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
            </div>

            {/* Physical Scene Controls */}
            <div className={envSubTab === 'weather' || envSubTab === 'all' ? 'space-y-3 pt-1' : 'hidden'}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-xs text-white">Weather</span>
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
                  <span className="font-display font-bold text-xs text-white">Time</span>
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
                  <span className="font-display font-bold text-xs text-white">Floor</span>
                  <span className="font-mono text-[10px] text-cyan-400">
                    {shot.environment?.groundSurface || 'studio-floor'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
                  {[
                    { id: 'studio-floor', label: '🎬 Studio Floor' },
                    { id: 'asphalt-wet', label: '🌧️ Wet Asphalt' },
                    { id: 'concrete-floor', label: '🏢 Concrete' },
                    { id: 'stone-cobblestone', label: '🧱 Cobblestone' },
                    { id: 'sand-dunes', label: '🏜️ Sand' },
                    { id: 'grass-terrain', label: '🌿 Grass' },
                    { id: 'metal-grate', label: '⚙️ Metal Grate' },
                    { id: 'wood-parquet', label: '🪵 Wood Floor' },
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
                  <span className="text-slate-300">Fog Density</span>
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
          <div className="p-3.5 space-y-3">
            {/* Zero-Scroll Lighting Sub-Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#080b12] p-1 border border-white/[0.08]">
              {(
                [
                  { id: 'lights' as const, label: '💡 Lights' },
                  { id: 'script' as const, label: '📜 Script' },
                  { id: 'all' as const, label: '⊞ All' },
                ]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLightSubTab(t.id)}
                  className={`py-1.5 px-2 rounded-lg text-[10.5px] font-semibold transition-all truncate ${
                    lightSubTab === t.id
                      ? 'bg-gradient-to-b from-amber-500 to-amber-600 text-black font-bold shadow-sm border border-amber-300/60'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.05] border border-transparent'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className={lightSubTab === 'lights' || lightSubTab === 'all' ? 'space-y-3.5' : 'hidden'}>
            {/* Lighting Style */}
            <div className="space-y-1.5">
              <span className="font-display font-bold text-xs tracking-wide text-white">Lighting Style</span>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                {([
                  { id: 'cinematic-natural', label: 'Cinematic', icon: '🎬' },
                  { id: 'low-key-film-noir', label: 'Film Noir', icon: '🌑' },
                  { id: 'neon-cyberpunk', label: 'Cyberpunk', icon: '🟣' },
                  { id: 'golden-hour', label: 'Golden Hour', icon: '🌅' },
                  { id: 'moonlight-foggy', label: 'Moonlight', icon: '🌙' },
                  { id: 'high-key-studio', label: 'High Key', icon: '💡' },
                  { id: 'practical-candlelight', label: 'Candlelight', icon: '🕯️' },
                  { id: 'harsh-fluorescent', label: 'Fluorescent', icon: '⚡' },
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
                <span className="text-slate-400 font-mono text-[10px]">Light Dir</span>
                <select
                  value={shot.lighting.direction}
                  onChange={(e) => setLighting(shot.lighting.style, e.target.value as LightingDirection, shot.lighting.contrast)}
                  className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none font-mono"
                >
                  <option value="front-soft">Front Soft</option>
                  <option value="side-key">Side Key</option>
                  <option value="rim-backlit">Backlight</option>
                  <option value="overhead-top">Overhead</option>
                  <option value="underlit-dramatic">Underlit</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Contrast</span>
                <select
                  value={shot.lighting.contrast}
                  onChange={(e) => setLighting(shot.lighting.style, shot.lighting.direction, e.target.value as 'soft' | 'balanced' | 'high-contrast')}
                  className="w-full rounded bg-[#090D16] border border-[#273247] hover:border-[#384764] focus:border-[#6658F5] px-2 py-1.5 text-white text-[11px] focus:outline-none font-mono"
                >
                  <option value="soft">Soft</option>
                  <option value="balanced">Balanced</option>
                  <option value="high-contrast">High Contrast</option>
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
            </div>

            <div className={lightSubTab === 'script' || lightSubTab === 'all' ? 'space-y-3.5' : 'hidden'}>
            {/* Scene Narrative & Atmosphere Prompt */}
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">Scene Script</span>
                <span className="font-mono text-[9px] text-indigo-400">Auto-Stage</span>
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
                <span>🧠 Direct Stage</span>
              </button>
            </div>

            {/* Restored Editable Negative Prompt */}
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-rose-300">Negative Prompt</span>
                <span className="font-mono text-[9px] text-slate-400">Exclusions</span>
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
                RENDERING PREVIS...
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
                <span>RENDER & EXPORT</span>
              </button>
            )}

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => renderPrevisVideo()}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white font-mono text-[10px] transition-all border border-white/10 cursor-pointer"
                title="Quick-render 24fps 3D Previs video in-app"
              >
                <Zap className="h-3 w-3 text-amber-400" />
                <span>{previsVideoUrl ? 'Re-Render' : 'Render Previs'}</span>
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
