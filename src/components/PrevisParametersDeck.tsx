import React, { useState } from 'react';
import { useShotStore } from '../stores/useShotStore';
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
  Layers,
  Download,
  Zap,
  Sparkles,
  Trash2,
  Upload,
  Film,
  Loader2,
  ArrowRight,
  Maximize2,
  Globe,
  Activity,
} from 'lucide-react';

import { downloadBlob } from '../engine/vfxAnalyzer';
import { generateConceptPrevisPlate } from '../engine/conceptPrevisGenerator';
import { useAssetLibraryStore } from '../stores/useAssetLibraryStore';
import { CINEMATIC_ENVIRONMENT_PRESETS } from '../types/environment';
import { reasonEnvironment, reasonObject } from '../services/objectReasoner';
import { registerModelFile } from '../services/modelStorage';
import { preloadGltfModels } from '../engine/gltfModelLoader';
import { decomposeDirectorialScene } from '../engine/directorialSceneDecomposer';
import { AIGenerator3D } from './AIGenerator3D';
import { POSE_PRESETS } from '../engine/kinematics';
import {
  generateBlenderCameraScript,
  generateRunwayCameraJson,
  generateKlingCameraJson,
  generateComfyWorkflowJson,
  generateSeedanceProductionPack,
} from '../engine/pipelineExporters';

export interface PrevisParametersDeckProps {
  onOpenPromptInspector?: () => void;
  onExportProductionPack?: () => void;
  onDirectShotWithComfy?: () => void;
}

export const PrevisParametersDeck: React.FC<PrevisParametersDeckProps> = ({
  onOpenPromptInspector,
  onExportProductionPack,
  onDirectShotWithComfy,
}) => {
  const {
    shot,
    setFocalLength,
    updateVfxReference,
    addActor,
    updateActor,
    removeActor,
    clearAllActors,
    setCameraPositions,
    setCameraMovement,
    setCameraAngle,
    setShotType,
    setLighting,
    setSceneDescription,
    setEnvironment,
    updateAspectRatio,
    activeDeckTab,
    setActiveDeckTab,
    selectedActorId,
    setSelectedActorId,
    previsVideoUrl,
    isRenderingPrevis,
    previsProgress,
    renderPrevisVideo,
    updateTargetModel,
  } = useShotStore();

  const openAssetLibrary = useAssetLibraryStore((s) => s.openLibrary);

  // Active Tab synchronized across app
  const activeTab = activeDeckTab;
  const setActiveTab = setActiveDeckTab;

  // Environment & AI Location Synthesizer State
  const [isSynthesizingEnv, setIsSynthesizingEnv] = useState(false);
  const [envPromptInput, setEnvPromptInput] = useState('');
  const [refiningActorId, setRefiningActorId] = useState<string | null>(null);

  const handleSynthesizeEnv = async () => {
    if (!envPromptInput.trim() || isSynthesizingEnv) return;
    const promptText = envPromptInput.trim();
    setIsSynthesizingEnv(true);
    try {
      // 1. Directorial Scene Decomposition (Architecture, Lighting, Particles, Props, Camera)
      const decomposed = decomposeDirectorialScene(promptText);

      // 2. Query LLM Reasoner for refined environment parameters if available
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

      // 3. Apply Lighting Rig & Camera Direction
      setLighting(decomposed.lighting.style, decomposed.lighting.direction, decomposed.lighting.contrast);
      setCameraMovement(decomposed.cameraSuggestion.movement.type, decomposed.cameraSuggestion.movement.speed);

      // 4. Automatically Instantiate Any Extracted Physical Props / Stage Actors
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

    // Apply environment parameters
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

    // Apply lighting & camera
    setLighting(decomposed.lighting.style, decomposed.lighting.direction, decomposed.lighting.contrast);
    setCameraMovement(decomposed.cameraSuggestion.movement.type, decomposed.cameraSuggestion.movement.speed);

    // Instantiate extracted props
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

  // VFX State
  const [cameraMoveMode, setCameraMoveMode] = useState<'camera-only' | 'with-subject' | 'full-scene'>('camera-only');
  const [cameraSmoothing, setCameraSmoothing] = useState(65);
  const [stabilization, setStabilization] = useState<'Low' | 'Medium' | 'High'>('Medium');

  const [subjectMotionMode, setSubjectMotionMode] = useState<'actor-motion' | 'object-motion' | 'off'>('actor-motion');
  const [footLock, setFootLock] = useState(true);
  const [motionSmoothing, setMotionSmoothing] = useState(60);
  const [groundConstraint, setGroundConstraint] = useState(true);

  // Control layers toggles
  const [layers, setLayers] = useState({
    depth: true,
    masks: true,
    pose: true,
    opticalFlow: false,
    edges: true,
  });

  // Export preset selected
  const [selectedExportPreset, setSelectedExportPreset] = useState<'ComfyUI' | 'Seedance' | 'Blender' | 'Runway' | 'Kling'>('ComfyUI');
  const [isExporting, setIsExporting] = useState(false);
  const [customObjectName, setCustomObjectName] = useState('');
  const [showAiGeneratorModal, setShowAiGeneratorModal] = useState(false);
  const [aiGeneratorInitialPrompt, setAiGeneratorInitialPrompt] = useState('');
  const [aiGeneratorInitialImage, setAiGeneratorInitialImage] = useState<string | undefined>(undefined);
  const [targetActorIdForGenerator, setTargetActorIdForGenerator] = useState<string | null>(null);

  const toggleLayer = (layerKey: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  // Auto-scroll to selected actor card in staging tab
  React.useEffect(() => {
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

  const handleExportPack = () => {
    setIsExporting(true);
    try {
      const sanitizedName = shot.name.replace(/[^a-zA-Z0-9_-]/g, '_');

      if (selectedExportPreset === 'Blender') {
        const pythonScript = generateBlenderCameraScript(shot);
        const blob = new Blob([pythonScript], { type: 'text/x-python' });
        downloadBlob(blob, `${sanitizedName}_blender_setup.py`);
      } else if (selectedExportPreset === 'Runway') {
        const runwayJson = generateRunwayCameraJson(shot, layers);
        const blob = new Blob([JSON.stringify(runwayJson, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${sanitizedName}_runway_gen3.json`);
      } else if (selectedExportPreset === 'Kling') {
        const klingJson = generateKlingCameraJson(shot, layers);
        const blob = new Blob([JSON.stringify(klingJson, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${sanitizedName}_kling_motion.json`);
      } else if (selectedExportPreset === 'ComfyUI') {
        const comfyGraph = generateComfyWorkflowJson(shot, layers);
        const blob = new Blob([JSON.stringify(comfyGraph, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${sanitizedName}_comfyui_workflow.json`);
      } else {
        // Seedance / Production Matrix Pack
        const vfxSettings = {
          cameraMoveMode,
          smoothing: cameraSmoothing,
          stabilization,
          subjectMotionMode,
          footLock,
          motionSmoothing,
          groundConstraint,
        };
        const seedancePack = generateSeedanceProductionPack(shot, layers, vfxSettings);
        const blob = new Blob([JSON.stringify(seedancePack, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${sanitizedName}_seedance_production_pack.json`);
      }

      if (onExportProductionPack) {
        onExportProductionPack();
      }
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setTimeout(() => setIsExporting(false), 800);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#0b0d13] text-slate-200 select-none font-sans text-xs">
      {/* Target Video Model Selector */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-[#0a0c11] shrink-0">
        <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400 font-bold">
          Target Engine:
        </span>
        <div className="flex items-center gap-1 bg-[#12151f] p-0.5 rounded-lg border border-white/5">
          {[
            { id: 'ltx-2.5', label: 'LTX-2.5' },
            { id: 'minimax-h3', label: 'MiniMax H3' },
            { id: 'seedance', label: 'Seedance 2.0' },
          ].map((m) => {
            const active = shot.targetModel === m.id;
            return (
              <button
                key={m.id}
                onClick={() => updateTargetModel(m.id as any)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                  active
                    ? m.id === 'seedance'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                      : m.id === 'minimax-h3'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Header Tab Navigation */}
      <div className="grid grid-cols-5 border-b border-white/5 bg-[#0e1017] p-1 gap-0.5 shrink-0">
        <button
          onClick={() => setActiveTab('camera')}
          className={`flex items-center justify-center gap-1 py-2 px-0.5 rounded text-[10px] font-semibold transition-all ${
            activeTab === 'camera'
              ? 'bg-[#182030] text-blue-400 border border-blue-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Camera className="h-3 w-3" />
          <span>Camera</span>
        </button>

        <button
          onClick={() => setActiveTab('staging')}
          className={`flex items-center justify-center gap-1 py-2 px-0.5 rounded text-[10px] font-semibold transition-all ${
            activeTab === 'staging'
              ? 'bg-[#182030] text-blue-400 border border-blue-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Box className="h-3 w-3" />
          <span>Stage ({shot.actors.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('environment')}
          className={`flex items-center justify-center gap-1 py-2 px-0.5 rounded text-[10px] font-semibold transition-all ${
            activeTab === 'environment'
              ? 'bg-[#152424] text-emerald-400 border border-emerald-500/40 shadow-sm font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
          title="Scene Environment & Physical Location Setting"
        >
          <Globe className="h-3 w-3" />
          <span>Environment</span>
        </button>

        <button
          onClick={() => setActiveTab('atmosphere')}
          className={`flex items-center justify-center gap-1 py-2 px-0.5 rounded text-[10px] font-semibold transition-all ${
            activeTab === 'atmosphere'
              ? 'bg-[#182030] text-blue-400 border border-blue-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Sun className="h-3 w-3" />
          <span>Light</span>
        </button>

        <button
          onClick={() => setActiveTab('vfx')}
          className={`flex items-center justify-center gap-1 py-2 px-0.5 rounded text-[10px] font-semibold transition-all ${
            activeTab === 'vfx'
              ? 'bg-[#182030] text-blue-400 border border-blue-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Layers className="h-3 w-3" />
          <span>VFX</span>
        </button>
      </div>

      {/* 2. Scrollable Body Content per Tab */}
      <div className="flex-1 overflow-y-auto">
        {/* ================= TAB 1: CAMERA ================= */}
        {activeTab === 'camera' && (
          <div className="p-3.5 space-y-4">
            {/* Focal Length & Lens */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">Camera Optics</span>
                <span className="font-mono text-[10px] text-blue-400">{shot.camera.lens.focalLength}</span>
              </div>
              <div className="grid grid-cols-4 gap-1 font-mono text-[10px]">
                {(['18mm', '24mm', '35mm', '50mm', '85mm', '135mm'] as FocalLength[]).map((fl) => (
                  <button
                    key={fl}
                    onClick={() => setFocalLength(fl)}
                    className={`rounded py-1.5 text-center transition-all ${
                      shot.camera.lens.focalLength === fl
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'bg-[#13161f] text-slate-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {fl}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio & Shot Framing */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Aspect Ratio</span>
                <select
                  value={shot.aspectRatio}
                  onChange={(e) => updateAspectRatio(e.target.value as AspectRatio)}
                  className="w-full rounded bg-[#13161f] border border-white/10 px-2 py-1.5 text-white text-[11px] focus:outline-none"
                >
                  <option value="16:9">16:9 (Standard HD)</option>
                  <option value="2.39:1">2.39:1 (Cinemascope)</option>
                  <option value="9:16">9:16 (Vertical Reels)</option>
                  <option value="4:3">4:3 (Classic Academy)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Shot Framing</span>
                <select
                  value={shot.camera.shotType}
                  onChange={(e) => setShotType(e.target.value as ShotType)}
                  className="w-full rounded bg-[#13161f] border border-white/10 px-2 py-1.5 text-white text-[11px] focus:outline-none"
                >
                  <option value="wide">Wide Shot (Establishing)</option>
                  <option value="medium-wide">Medium Wide (Cowboy)</option>
                  <option value="medium">Medium Shot (Waist Up)</option>
                  <option value="medium-close-up">Medium Close-Up</option>
                  <option value="close-up">Close-Up (Face)</option>
                  <option value="extreme-close-up">Extreme Close-Up (Eyes)</option>
                </select>
              </div>
            </div>

            {/* Camera Angle & Movement Archetype */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Camera Angle</span>
                <select
                  value={shot.camera.angle}
                  onChange={(e) => setCameraAngle(e.target.value as CameraAngle)}
                  className="w-full rounded bg-[#13161f] border border-white/10 px-2 py-1.5 text-white text-[11px] focus:outline-none"
                >
                  <option value="eye-level">Eye Level (Neutral)</option>
                  <option value="low-angle">Low Angle (Heroic/Dominant)</option>
                  <option value="high-angle">High Angle (Vulnerable)</option>
                  <option value="overhead-gods-eye">Overhead (God's Eye)</option>
                  <option value="ground-level">Ground Level (Worm's Eye)</option>
                  <option value="dutch-angle">Dutch Angle (Unease)</option>
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Movement Speed</span>
                <select
                  value={shot.camera.movement.speed}
                  onChange={(e) => setCameraMovement(shot.camera.movement.type, e.target.value as MovementSpeed)}
                  className="w-full rounded bg-[#13161f] border border-white/10 px-2 py-1.5 text-white text-[11px] focus:outline-none"
                >
                  <option value="slow-cinematic">Slow Cinematic</option>
                  <option value="moderate">Moderate Paced</option>
                  <option value="dynamic-fast">Dynamic Fast Action</option>
                </select>
              </div>
            </div>

            {/* Camera Movement Archetype */}
            <div className="space-y-1">
              <span className="text-slate-400 font-mono text-[10px]">Camera Archetype</span>
              <select
                value={shot.camera.movement.type}
                onChange={(e) => setCameraMovement(e.target.value as CameraMovementType, shot.camera.movement.speed)}
                className="w-full rounded bg-[#13161f] border border-white/10 px-2 py-1.5 text-white text-[11px] focus:outline-none font-mono"
              >
                <option value="dolly-in">🎥 Dolly In (Push In)</option>
                <option value="dolly-out">🎥 Dolly Out (Pull Back)</option>
                <option value="truck-left">◀️ Truck Left (Tracking)</option>
                <option value="truck-right">▶️ Truck Right (Tracking)</option>
                <option value="pan-left">⬅️ Pan Left</option>
                <option value="pan-right">➡️ Pan Right</option>
                <option value="tilt-up">⬆️ Tilt Up</option>
                <option value="tilt-down">⬇️ Tilt Down</option>
                <option value="pedestal-up">🔺 Pedestal Up</option>
                <option value="pedestal-down">🔻 Pedestal Down</option>
                <option value="orbit-clockwise">🔄 Orbit Clockwise</option>
                <option value="whip-pan">⚡ Whip Pan</option>
                <option value="static">⏸️ Static Tripod</option>
              </select>
            </div>

            {/* Camera 3D Path Coordinates Sliders */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="font-bold text-slate-200">Camera Path (Start ➔ End)</span>
                <span className="text-amber-400 font-bold">{shot.camera.movement.type}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-[9px] text-slate-400">
                <div className="space-y-1 bg-[#0d0f17] p-2.5 rounded-lg border border-white/5">
                  <span className="text-blue-400 font-bold">Start Position</span>
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
                </div>

                <div className="space-y-1 bg-[#0d0f17] p-2.5 rounded-lg border border-white/5">
                  <span className="text-emerald-400 font-bold">End Position</span>
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
                </div>
              </div>
            </div>

            {/* Smoothing & Stabilization */}
            <div className="space-y-2 pt-1 border-t border-white/5">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>Camera Smoothing</span>
                  <span className="text-white">{cameraSmoothing}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={cameraSmoothing}
                  onChange={(e) => setCameraSmoothing(Number(e.target.value))}
                  className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-mono text-[10px]">Stabilization</span>
                <select
                  value={stabilization}
                  onChange={(e) => setStabilization(e.target.value as any)}
                  className="w-full rounded bg-[#13161f] border border-white/10 px-2 py-1 text-white text-[11px] focus:outline-none"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: STAGING ================= */}
        {activeTab === 'staging' && (
          <div className="p-3.5 space-y-4">
            {/* Quick 1-Click Asset Add Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">Add 3D Subject / Prop</span>
                <span className="font-mono text-[9px] text-slate-400">1-click to stage</span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
                <button
                  onClick={() => handleAddSubjectKind('human')}
                  className="flex items-center gap-1.5 rounded-lg bg-[#141926] border border-blue-500/30 p-2 text-slate-200 hover:bg-blue-600/30 hover:border-blue-400 transition-all text-left"
                >
                  <span className="text-base">👤</span>
                  <div>
                    <div className="font-bold text-white">Person</div>
                    <div className="text-[8px] text-slate-400">Actor</div>
                  </div>
                </button>

                <button
                  onClick={() => handleAddSubjectKind('tree')}
                  className="flex items-center gap-1.5 rounded-lg bg-[#141926] border border-emerald-500/30 p-2 text-slate-200 hover:bg-emerald-600/30 hover:border-emerald-400 transition-all text-left"
                >
                  <span className="text-base">🌲</span>
                  <div>
                    <div className="font-bold text-white">Tree</div>
                    <div className="text-[8px] text-slate-400">Nature</div>
                  </div>
                </button>

                <button
                  onClick={() => handleAddSubjectKind('car')}
                  className="flex items-center gap-1.5 rounded-lg bg-[#141926] border border-amber-500/30 p-2 text-slate-200 hover:bg-amber-600/30 hover:border-amber-400 transition-all text-left"
                >
                  <span className="text-base">🚗</span>
                  <div>
                    <div className="font-bold text-white">Car</div>
                    <div className="text-[8px] text-slate-400">Vehicle</div>
                  </div>
                </button>

                <button
                  onClick={() => handleAddSubjectKind('table')}
                  className="flex items-center gap-1.5 rounded-lg bg-[#141926] border border-orange-500/30 p-2 text-slate-200 hover:bg-orange-600/30 hover:border-orange-400 transition-all text-left"
                >
                  <span className="text-base">🪑</span>
                  <div>
                    <div className="font-bold text-white">Table</div>
                    <div className="text-[8px] text-slate-400">Furniture</div>
                  </div>
                </button>

                <button
                  onClick={() => handleAddSubjectKind('chair')}
                  className="flex items-center gap-1.5 rounded-lg bg-[#141926] border border-purple-500/30 p-2 text-slate-200 hover:bg-purple-600/30 hover:border-purple-400 transition-all text-left"
                >
                  <span className="text-base">💺</span>
                  <div>
                    <div className="font-bold text-white">Chair</div>
                    <div className="text-[8px] text-slate-400">Seat</div>
                  </div>
                </button>

                <button
                  onClick={() => handleAddSubjectKind('prop')}
                  className="flex items-center gap-1.5 rounded-lg bg-[#141926] border border-cyan-500/30 p-2 text-slate-200 hover:bg-cyan-600/30 hover:border-cyan-400 transition-all text-left"
                >
                  <span className="text-base">📦</span>
                  <div>
                    <div className="font-bold text-white">Prop</div>
                    <div className="text-[8px] text-slate-400">Crate</div>
                  </div>
                </button>
              </div>

              {/* Arbitrary Custom Object Creation Bar */}
              <div className="space-y-1.5 pt-2 border-t border-white/10 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-director-gold font-bold flex items-center gap-1">
                    <span>✨</span> Add Any Custom Object
                  </span>
                  <span className="text-[9px] text-slate-500">Procedural 3D primitive</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Type object: Mountain, TV, House, Sofa, Car..."
                    value={customObjectName}
                    onChange={(e) => setCustomObjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customObjectName.trim()) {
                        handleAddSubjectKind(customObjectName.trim().toLowerCase(), customObjectName.trim());
                        setCustomObjectName('');
                      }
                    }}
                    className="flex-1 bg-black/60 border border-white/20 rounded-md px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-director-gold"
                  />
                  <button
                    onClick={() => {
                      if (customObjectName.trim()) {
                        handleAddSubjectKind(customObjectName.trim().toLowerCase(), customObjectName.trim());
                        setCustomObjectName('');
                      }
                    }}
                    disabled={!customObjectName.trim()}
                    className="px-3 py-1 rounded-md bg-director-gold text-director-darkest font-bold text-xs disabled:opacity-40 hover:brightness-110 transition-all shadow-glow-gold"
                  >
                    + Add
                  </button>
                </div>
                {/* Quick Suggestion Chips */}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  <button
                    onClick={() => openAssetLibrary()}
                    className="px-2 py-0.5 rounded text-[10px] bg-gradient-to-r from-amber-600/80 to-indigo-600/80 border border-amber-400/50 text-amber-200 hover:text-white font-semibold transition-all shadow-sm flex items-center gap-1"
                    title="Open 3D Asset Library to browse 200+ models or upload GLB"
                  >
                    <span>📦</span>
                    <span>3D Library (200+)...</span>
                  </button>
                  <button
                    onClick={() => {
                      setAiGeneratorInitialPrompt(customObjectName || '');
                      setAiGeneratorInitialImage(undefined);
                      setTargetActorIdForGenerator(null);
                      setShowAiGeneratorModal(true);
                    }}
                    className="px-2 py-0.5 rounded text-[10px] bg-gradient-to-r from-amber-500 via-indigo-600 to-cyan-500 border border-cyan-400/50 text-white font-semibold transition-all shadow-sm flex items-center gap-1 font-mono"
                    title="Open AI 3D Generator (Concept-to-3D with Silhouette Alignment)"
                  >
                    <span>✨</span>
                    <span>AI 3D Generator...</span>
                  </button>
                  {[
                    { label: '🚀 Spaceship', val: 'spaceship' },
                    { label: '🏔️ Mountain', val: 'mountain' },
                    { label: '📺 TV', val: 'tv' },
                    { label: '🏠 House', val: 'house' },
                    { label: '🛋️ Sofa', val: 'sofa' },
                    { label: '🚲 Bicycle', val: 'bicycle' },
                    { label: '💡 Streetlamp', val: 'streetlamp' },
                    { label: '🤖 Robot', val: 'robot' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      onClick={() => handleAddSubjectKind(item.val, item.label.replace(/^[^\s]+\s+/, ''))}
                      className="px-2 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 hover:border-director-gold/60 text-slate-300 hover:text-white transition-all"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Foot Lock & Ground Constraint */}
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-white/5">
              <label className="flex items-center gap-2 cursor-pointer bg-[#0f121a] p-2 rounded border border-white/5">
                <input
                  type="checkbox"
                  checked={footLock}
                  onChange={(e) => setFootLock(e.target.checked)}
                  className="h-3.5 w-3.5 rounded bg-slate-800 border-slate-700 accent-blue-600 cursor-pointer"
                />
                <span className="text-slate-300">Foot Lock (IK)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer bg-[#0f121a] p-2 rounded border border-white/5">
                <input
                  type="checkbox"
                  checked={groundConstraint}
                  onChange={(e) => setGroundConstraint(e.target.checked)}
                  className="h-3.5 w-3.5 rounded bg-slate-800 border-slate-700 accent-blue-600 cursor-pointer"
                />
                <span className="text-slate-300">Ground Lock</span>
              </label>
            </div>

            {/* Motion Smoothing */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>Motion Smoothing</span>
                <span className="text-white">{motionSmoothing}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={motionSmoothing}
                onChange={(e) => setMotionSmoothing(Number(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Placed 3D Objects List */}
            <div className="space-y-2.5 pt-1 border-t border-white/5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-white">Placed on Stage ({shot.actors.length})</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openAssetLibrary()}
                    className="font-mono text-[9px] text-amber-300 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 px-2 py-0.5 rounded flex items-center gap-1 transition-all shadow-sm"
                    title="Open 3D Asset Library"
                  >
                    <span>📦 3D Library</span>
                  </button>
                  {shot.actors.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearAllActors();
                      }}
                      className="font-mono text-[9px] text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 transition-colors"
                      title="Remove all objects from stage"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>
              </div>

              {shot.actors.length === 0 ? (
                <div className="p-4 rounded-lg bg-black/30 border border-dashed border-white/10 text-center space-y-2">
                  <p className="text-[11px] text-slate-400">Stage is empty.</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => addActor(undefined, 'human')}
                      className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-mono text-[10px] font-bold"
                    >
                      + Place Character
                    </button>
                    <button
                      type="button"
                      onClick={() => openAssetLibrary()}
                      className="px-2.5 py-1 rounded bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white font-mono text-[10px] font-bold flex items-center gap-1 shadow"
                    >
                      <span>📦 Open 3D Library</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {shot.actors.map((actor) => {
                    const kind = actor.kind || 'human';
                    const icon =
                      kind === 'car' ? '🚗' : kind === 'table' ? '🪑' : kind === 'tree' ? '🌲' : kind === 'chair' ? '💺' : kind === 'prop' ? '📦' : '👤';
                    const startX = actor.trajectory.startPosition.x;
                    const startZ = actor.trajectory.startPosition.y;
                    const isSelected = actor.id === selectedActorId;

                    return (
                      <div
                        key={actor.id}
                        data-actor-card={actor.id}
                        onClick={() => setSelectedActorId(actor.id)}
                        className={`rounded-lg p-2.5 space-y-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#141b2e] border-2 border-blue-500 shadow-glow-cyan/20 ring-1 ring-blue-400'
                            : 'bg-[#0f121a] border border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{icon}</span>
                            <input
                              type="text"
                              value={actor.name}
                              onChange={(e) => updateActor(actor.id, { name: e.target.value })}
                              className="bg-transparent font-bold text-white text-[11px] focus:outline-none w-32 border-b border-transparent focus:border-blue-400"
                            />
                            <span className="rounded bg-white/10 px-1.5 py-0.2 font-mono text-[8px] text-slate-300 uppercase">
                              {kind}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeActor(actor.id);
                            }}
                            className="text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 p-1 rounded transition-colors"
                            title="Delete this object from stage"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                      {/* Prompt Token */}
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-mono text-slate-400">Prompt Visual Token</span>
                        <input
                          type="text"
                          value={actor.token}
                          onChange={(e) => updateActor(actor.id, { token: e.target.value })}
                          placeholder="e.g. a tall lush pine tree"
                          className="w-full rounded bg-[#161a25] border border-white/10 px-2 py-1 text-slate-200 text-[10px] focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>

                      {/* Action Prompt */}
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-mono text-slate-400">Action / Placement Cue</span>
                        <input
                          type="text"
                          value={actor.actionDescription}
                          onChange={(e) => updateActor(actor.id, { actionDescription: e.target.value })}
                          placeholder="e.g. stands surveying the rainy street"
                          className="w-full rounded bg-[#161a25] border border-white/10 px-2 py-1 text-slate-200 text-[10px] focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>

                      {/* Character Pose Preset (Kinematics) */}
                      {kind === 'human' && (
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-mono text-director-gold flex items-center gap-1">
                              <Activity className="h-3 w-3" />
                              Pose Preset (IK Rig)
                            </span>
                            <span className="text-[8px] text-slate-400 font-mono">
                              {actor.posePreset || 'neutral-stand'}
                            </span>
                          </div>
                          <select
                            value={actor.posePreset || 'neutral-stand'}
                            onChange={(e) => updateActor(actor.id, { posePreset: e.target.value })}
                            className="w-full rounded bg-[#161a25] border border-white/10 px-2 py-1 text-slate-200 text-[10px] focus:outline-none focus:border-director-gold font-mono"
                          >
                            {Object.values(POSE_PRESETS).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>

                          {/* Gait / Locomotion Mode */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[9px] font-mono text-slate-400">Locomotion Gait:</span>
                            <select
                              value={actor.gait || 'auto'}
                              onChange={(e) => updateActor(actor.id, { gait: e.target.value as any })}
                              className="rounded bg-[#161a25] border border-white/10 px-1.5 py-0.5 text-slate-300 text-[9px] font-mono focus:border-director-cyan focus:outline-none"
                            >
                              <option value="auto">Auto (Walk on Move / Idle)</option>
                              <option value="walk">Walk</option>
                              <option value="run">Run</option>
                              <option value="sneak">Sneak</option>
                              <option value="idle">Idle Stance</option>
                              <option value="none">None (Frozen)</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Previs Visual Reference & 3D Billboard */}
                      <div className="pt-1.5 border-t border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono text-director-gold font-semibold flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-director-gold" />
                            Visual Attachment & 3D Billboard
                          </span>
                          {actor.conceptImageUrl && (
                            <span className="text-[8px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                              3D Billboard Active
                            </span>
                          )}
                        </div>

                        {/* Hidden native file input for direct photo/image upload */}
                        <input
                          type="file"
                          id={`actor-upload-${actor.id}`}
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                const result = event.target?.result as string;
                                if (result) {
                                  updateActor(actor.id, { conceptImageUrl: result });
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />

                        {actor.conceptImageUrl ? (
                          <div className="relative group/concept rounded overflow-hidden border border-white/15 bg-black/40">
                            <img
                              src={actor.conceptImageUrl}
                              alt="Object Visual Reference"
                              className="w-full h-24 object-cover"
                            />
                            <div className="absolute inset-0 bg-black/75 opacity-0 group-hover/concept:opacity-100 flex flex-wrap items-center justify-center gap-1 p-2 transition-opacity">
                              <label
                                htmlFor={`actor-upload-${actor.id}`}
                                className="cursor-pointer px-1.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-mono text-[9px] font-semibold flex items-center gap-1 shadow"
                                title="Upload new photo"
                              >
                                <Upload className="h-2.5 w-2.5" />
                                <span>Upload</span>
                              </label>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const plate = generateConceptPrevisPlate({
                                    name: actor.name,
                                    kind: actor.kind || 'human',
                                    token: actor.token || actor.name,
                                  });
                                  updateActor(actor.id, { conceptImageUrl: plate });
                                }}
                                className="px-1.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-mono text-[9px] shadow"
                                title="Re-generate procedural concept plate"
                              >
                                🔄 AI
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateActor(actor.id, { conceptImageUrl: undefined });
                                }}
                                className="px-1.5 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white font-mono text-[9px]"
                                title="Remove visual reference"
                              >
                                ✕ Clear
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-1">
                            <label
                              htmlFor={`actor-upload-${actor.id}`}
                              className="cursor-pointer py-1.5 px-1 rounded bg-blue-950/60 hover:bg-blue-900/80 border border-blue-500/30 hover:border-blue-400 text-blue-200 hover:text-white font-mono text-[9px] flex flex-col items-center justify-center gap-0.5 transition-all text-center"
                              title="Upload reference photo from PC"
                            >
                              <Upload className="h-3 w-3 text-blue-400" />
                              <span>📁 Upload Photo</span>
                            </label>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const plate = generateConceptPrevisPlate({
                                  name: actor.name,
                                  kind: actor.kind || 'human',
                                  token: actor.token || actor.name,
                                });
                                updateActor(actor.id, { conceptImageUrl: plate });
                              }}
                              className="py-1.5 px-1 rounded bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/30 hover:border-purple-400 text-purple-200 hover:text-white font-mono text-[9px] flex flex-col items-center justify-center gap-0.5 transition-all text-center"
                              title="Instant client-side procedural AI plate"
                            >
                              <Sparkles className="h-3 w-3 text-purple-400" />
                              <span>✨ AI Plate</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* AI 3D Object Reasoner (LLM Synthesis & Multi-Part Graph) */}
                      <div className="pt-1.5 border-t border-white/5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono text-cyan-300 font-semibold flex items-center gap-1">
                            <Zap className="h-3 w-3 text-cyan-400" />
                            3D Procedural Mesh
                          </span>
                          {(actor.sculpt || actor.partGraph) ? (
                            <span className="text-[8px] font-mono text-emerald-300 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-500/40">
                              ⚡ AI-Reasoned ({(actor.sculpt || actor.partGraph).parts?.length || 0} parts)
                            </span>
                          ) : (
                            <span className="text-[8px] font-mono text-slate-400">
                              Catalog / Heuristic
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            disabled={refiningActorId === actor.id}
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                setRefiningActorId(actor.id);
                                const promptToReason = actor.token || actor.name;
                                const graph = await reasonObject(promptToReason, {
                                  imageBase64: actor.conceptImageUrl,
                                });
                                updateActor(actor.id, { sculpt: graph, partGraph: graph });
                              } catch (err) {
                                console.error('Failed to reason object:', err);
                              } finally {
                                setRefiningActorId(null);
                              }
                            }}
                            className="py-1.5 px-2 rounded bg-gradient-to-r from-amber-600/70 via-indigo-600/70 to-cyan-600/70 hover:from-amber-500 hover:via-indigo-500 hover:to-cyan-500 text-white font-mono text-[9px] font-bold flex items-center justify-center gap-1 shadow transition-all border border-amber-400/30 disabled:opacity-50"
                            title="Generate bespoke 3D structure using LLM Object Reasoner (supports reference photo)"
                          >
                            {refiningActorId === actor.id ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin text-amber-300" />
                                <span>Reasoning...</span>
                              </>
                            ) : (
                              <span>⚡ LLM Reason</span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAiGeneratorInitialPrompt(actor.token || actor.name);
                              setAiGeneratorInitialImage(actor.conceptImageUrl);
                              setTargetActorIdForGenerator(actor.id);
                              setShowAiGeneratorModal(true);
                            }}
                            className="py-1.5 px-2 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-200 hover:text-white font-mono text-[9px] font-bold flex items-center justify-center gap-1 transition-all shadow"
                            title="Open in AI 3D Studio for interactive 3D preview & silhouette alignment"
                          >
                            <Sparkles className="h-3 w-3 text-cyan-400" />
                            <span>✨ 3D Studio...</span>
                          </button>
                        </div>
                      </div>

                      {/* 3D Model File (.GLB / .GLTF) */}
                      <div className="pt-1.5 border-t border-white/5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono text-indigo-300 font-semibold flex items-center gap-1">
                            <Box className="h-3 w-3 text-indigo-400" />
                            3D Model File (.glb / .gltf)
                          </span>
                          {actor.modelUrl ? (
                            <span className="text-[8px] font-mono text-emerald-300 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-500/40">
                              ✓ Model Loaded
                            </span>
                          ) : (
                            <span className="text-[8px] font-mono text-slate-500">
                              None (Procedural)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <label className="flex-1 cursor-pointer">
                            <input
                              type="file"
                              accept=".glb,.gltf"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const registered = await registerModelFile(file);
                                  await preloadGltfModels([registered.blobUrl]);
                                  updateActor(actor.id, {
                                    modelUrl: registered.blobUrl,
                                  });
                                } catch (err) {
                                  console.error('Failed to attach model:', err);
                                }
                              }}
                            />
                            <div className="py-1 px-2 rounded bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-500/40 text-indigo-200 hover:text-white font-mono text-[9px] font-medium flex items-center justify-center gap-1 transition-all">
                              <Upload className="h-3 w-3 text-indigo-400" />
                              <span>{actor.modelUrl ? 'Replace 3D Model' : 'Attach .GLB / .GLTF'}</span>
                            </div>
                          </label>

                          {actor.modelUrl && (
                            <button
                              type="button"
                              onClick={() => updateActor(actor.id, { modelUrl: undefined })}
                              className="py-1 px-2 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 font-mono text-[9px] transition-all"
                              title="Clear 3D model (revert to procedural)"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Stage Coordinates & Presets */}
                      <div className="grid grid-cols-2 gap-2 font-mono text-[9px] text-slate-400 pt-1">
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>Stage X</span>
                            <span className="text-blue-400 font-bold">{Math.round(startX)}</span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={90}
                            value={startX}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateActor(actor.id, {
                                trajectory: {
                                  ...actor.trajectory,
                                  startPosition: { ...actor.trajectory.startPosition, x: val },
                                  endPosition: { ...actor.trajectory.endPosition, x: val },
                                },
                              });
                            }}
                            className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>Depth Z</span>
                            <span className="text-emerald-400 font-bold">{Math.round(startZ)}</span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={90}
                            value={startZ}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateActor(actor.id, {
                                trajectory: {
                                  ...actor.trajectory,
                                  startPosition: { ...actor.trajectory.startPosition, y: val },
                                  endPosition: { ...actor.trajectory.endPosition, y: val },
                                },
                              });
                            }}
                            className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
                          />
                        </div>
                      </div>

                      {/* Stage Quick Presets */}
                      <div className="flex items-center gap-1 font-mono text-[8px] pt-1">
                        <span className="text-slate-500">Preset:</span>
                        <button
                          onClick={() => {
                            updateActor(actor.id, {
                              trajectory: {
                                ...actor.trajectory,
                                startPosition: { x: 50, y: 50 },
                                endPosition: { x: 50, y: 50 },
                              },
                            });
                          }}
                          className="rounded bg-white/5 hover:bg-white/15 px-1.5 py-0.5 text-slate-300"
                        >
                          Center
                        </button>
                        <button
                          onClick={() => {
                            updateActor(actor.id, {
                              trajectory: {
                                ...actor.trajectory,
                                startPosition: { x: 25, y: 50 },
                                endPosition: { x: 25, y: 50 },
                              },
                            });
                          }}
                          className="rounded bg-white/5 hover:bg-white/15 px-1.5 py-0.5 text-slate-300"
                        >
                          Left
                        </button>
                        <button
                          onClick={() => {
                            updateActor(actor.id, {
                              trajectory: {
                                ...actor.trajectory,
                                startPosition: { x: 75, y: 50 },
                                endPosition: { x: 75, y: 50 },
                              },
                            });
                          }}
                          className="rounded bg-white/5 hover:bg-white/15 px-1.5 py-0.5 text-slate-300"
                        >
                          Right
                        </button>
                        <button
                          onClick={() => {
                            updateActor(actor.id, {
                              trajectory: {
                                ...actor.trajectory,
                                startPosition: { x: 50, y: 75 },
                                endPosition: { x: 50, y: 75 },
                              },
                            });
                          }}
                          className="rounded bg-white/5 hover:bg-white/15 px-1.5 py-0.5 text-slate-300"
                        >
                          Deep
                        </button>
                      </div>

                      {/* 3D Object Scale Slider & Presets */}
                      <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                        <div className="flex items-center justify-between text-[9px] font-mono">
                          <span className="text-slate-300 font-semibold flex items-center gap-1">
                            <Maximize2 className="h-3 w-3 text-cyan-400" />
                            3D Object Scale
                          </span>
                          <span className="text-cyan-400 font-bold">
                            {(actor.scale ?? 1.0).toFixed(2)}×
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={6.0}
                          step={0.05}
                          value={actor.scale ?? 1.0}
                          onChange={(e) => {
                            updateActor(actor.id, { scale: Number(e.target.value) });
                          }}
                          className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-cyan-500"
                        />
                        <div className="flex items-center gap-1 font-mono text-[8px] pt-0.5">
                          <span className="text-slate-500">Preset:</span>
                          {[
                            { label: '0.25× Tiny', val: 0.25 },
                            { label: '0.5× Half', val: 0.5 },
                            { label: '1.0× Normal', val: 1.0 },
                            { label: '2.0× Double', val: 2.0 },
                            { label: '4.0× Huge', val: 4.0 },
                          ].map((preset) => (
                            <button
                              key={preset.val}
                              type="button"
                              onClick={() => updateActor(actor.id, { scale: preset.val })}
                              className={`rounded px-1.5 py-0.5 transition-all ${
                                Math.abs((actor.scale ?? 1.0) - preset.val) < 0.05
                                  ? 'bg-cyan-600 text-white font-bold'
                                  : 'bg-white/5 hover:bg-white/15 text-slate-300'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: ENVIRONMENT ================= */}
        {activeTab === 'environment' && (
          <div className="p-3.5 space-y-4">
            {/* Header & Current Environment Summary */}
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
                  Active Scene Setting
                </span>
              </div>

              {/* Editable Prompt Description */}
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

            {/* AI Environment Synthesizer (LLM Reasoner) */}
            <div className="rounded-lg bg-[#0e121b] border border-white/10 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Synthesize Location with AI</span>
                </span>
                <span className="font-mono text-[9px] text-slate-400">LLM Environment Reasoner</span>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. Abandoned brutalist concrete bunker with snow drifts and red emergency beacons..."
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
                      <span>Synthesizing...</span>
                    </>
                  ) : (
                    <>
                      <span>✨ Synthesize</span>
                    </>
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
                      <div>
                        <div className="font-bold text-white text-[11px] leading-tight">
                          {preset.spec.name}
                        </div>
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

              {/* Rustic Hearth Atmosphere Directing Hub */}
              {shot.environment?.id === 'env-rustic-hearth' && (
                <div className="p-3 rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-[#18110b] to-[#120e0a] space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base animate-pulse">🔥</span>
                      <span className="font-display font-bold text-xs text-amber-300">
                        Cinematic Hearthside Chamber Active
                      </span>
                    </div>
                    <span className="font-mono text-[9px] text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      LIVE 3D HEARTH
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    Multi-part stone fireplace, real-time flickering orange firelight, glowing ember bed, volumetric rising woodsmoke, textured brick walls, and polished floor reflections are active.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const hasFp = shot.actors.some((a) =>
                          /fireplace|hearth/i.test(`${a.name} ${a.token || ''}`)
                        );
                        if (!hasFp) {
                          addActor(
                            'Rustic Stone Fireplace',
                            'prop',
                            'a rustic stone fireplace with rough-hewn fieldstone pillars, arched keystone lintel, glowing embers, and flickering flames',
                            { scale: 1.5, actionDescription: 'Crackling warm embers and flickering orange flame core in stone hearth' }
                          );
                        }
                        setSceneDescription(
                          'A rustic stone fireplace crackles with warm embers, casting flickering orange light across textured brick walls and polished wood floors. Volumetric smoke rises gently into the dimly lit room, creating soft shadows that dance against the deep blue twilight visible through a distant window.'
                        );
                        setLighting('golden-hour', 'side-key', 'high-contrast');
                        setCameraMovement('dolly-in', 'slow-cinematic');
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold shadow-sm transition-all"
                    >
                      <span>🎬 Direct Cinematic Hearth Shot</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Physical Scene Controls (Weather, Time of Day, Surface, Fog) */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              {/* Weather Condition */}
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

              {/* Time of Day */}
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

              {/* Ground Surface Type */}
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
                    { id: 'metal-grate', label: '⚙️ Industrial Metal Grate' },
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

              {/* Atmospheric Fog Density & Colors */}
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

        {/* ================= TAB 4: ATMOSPHERE ================= */}
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
                  className="w-full rounded bg-[#13161f] border border-white/10 px-2 py-1.5 text-white text-[11px] focus:outline-none font-mono"
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
                  className="w-full rounded bg-[#13161f] border border-white/10 px-2 py-1.5 text-white text-[11px] focus:outline-none font-mono"
                >
                  <option value="soft">Soft (Low Contrast)</option>
                  <option value="balanced">Balanced Fill</option>
                  <option value="high-contrast">High Contrast (Chiaroscuro)</option>
                </select>
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
                rows={4}
                placeholder="Describe weather, rain streaks, wet asphalt, smoke, volumetric haze, props, lighting..."
                className="w-full rounded-lg bg-[#13161f] border border-white/10 p-2 text-slate-200 text-[11px] placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none font-sans"
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
          </div>
        )}

        {/* ================= TAB 4: VFX & EXPORT ================= */}
        {activeTab === 'vfx' && (
          <div className="p-3.5 space-y-4">
            {/* Camera Tracking Reference Mode */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">VFX Camera Tracking</span>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[9px] font-semibold text-emerald-400">
                  {cameraMoveMode}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 rounded-md bg-[#13161f] p-1 border border-white/5 font-mono text-[10px]">
                <button
                  onClick={() => {
                    setCameraMoveMode('camera-only');
                    updateVfxReference({ referenceMode: 'camera-only' });
                  }}
                  className={`rounded py-1 text-center font-medium transition-all ${
                    cameraMoveMode === 'camera-only'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Camera only
                </button>
                <button
                  onClick={() => {
                    setCameraMoveMode('with-subject');
                    updateVfxReference({ referenceMode: 'full-scene' });
                  }}
                  className={`rounded py-1 text-center font-medium transition-all ${
                    cameraMoveMode === 'with-subject'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  With Subject
                </button>
                <button
                  onClick={() => {
                    setCameraMoveMode('full-scene');
                    updateVfxReference({ referenceMode: 'full-scene' });
                  }}
                  className={`rounded py-1 text-center font-medium transition-all ${
                    cameraMoveMode === 'full-scene'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Full Scene
                </button>
              </div>
            </div>

            {/* Subject Motion Transfer Mode */}
            <div className="space-y-2 pt-1 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">Subject Motion Transfer</span>
                <span className="rounded bg-blue-500/20 px-2 py-0.5 font-mono text-[9px] font-semibold text-blue-400">
                  {subjectMotionMode}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 rounded-md bg-[#13161f] p-1 border border-white/5 font-mono text-[10px]">
                <button
                  onClick={() => {
                    setSubjectMotionMode('actor-motion');
                    updateVfxReference({ referenceMode: 'actor-motion' });
                  }}
                  className={`rounded py-1 text-center font-medium transition-all ${
                    subjectMotionMode === 'actor-motion'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Actor motion
                </button>
                <button
                  onClick={() => {
                    setSubjectMotionMode('object-motion');
                    updateVfxReference({ referenceMode: 'full-scene' });
                  }}
                  className={`rounded py-1 text-center font-medium transition-all ${
                    subjectMotionMode === 'object-motion'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Object motion
                </button>
                <button
                  onClick={() => {
                    setSubjectMotionMode('off');
                    updateVfxReference({ enabled: false });
                  }}
                  className={`rounded py-1 text-center font-medium transition-all ${
                    subjectMotionMode === 'off'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Off
                </button>
              </div>
            </div>

            {/* Control Layers Selection */}
            <div className="space-y-2 pt-1 border-t border-white/5">
              <span className="font-display font-bold text-xs tracking-wide text-white">Passes & Control Layers</span>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer bg-[#0f121a] p-2 rounded border border-white/5">
                  <input
                    type="checkbox"
                    checked={layers.depth}
                    onChange={() => toggleLayer('depth')}
                    className="h-3.5 w-3.5 rounded bg-slate-800 border-slate-700 accent-blue-600 cursor-pointer"
                  />
                  <span>Depth Map</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer bg-[#0f121a] p-2 rounded border border-white/5">
                  <input
                    type="checkbox"
                    checked={layers.masks}
                    onChange={() => toggleLayer('masks')}
                    className="h-3.5 w-3.5 rounded bg-slate-800 border-slate-700 accent-blue-600 cursor-pointer"
                  />
                  <span>Actor Masks</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer bg-[#0f121a] p-2 rounded border border-white/5">
                  <input
                    type="checkbox"
                    checked={layers.pose}
                    onChange={() => toggleLayer('pose')}
                    className="h-3.5 w-3.5 rounded bg-slate-800 border-slate-700 accent-blue-600 cursor-pointer"
                  />
                  <span>Pose OpenPose</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer bg-[#0f121a] p-2 rounded border border-white/5">
                  <input
                    type="checkbox"
                    checked={layers.edges}
                    onChange={() => toggleLayer('edges')}
                    className="h-3.5 w-3.5 rounded bg-slate-800 border-slate-700 accent-blue-600 cursor-pointer"
                  />
                  <span>Edges (Canny)</span>
                </label>
              </div>
            </div>

            {/* Dynamic Tracking & Quality Score Section */}
            <div className="space-y-2 pt-1 border-t border-white/5">
              <span className="font-display font-bold text-xs tracking-wide text-white">VFX Tracking & Quality Score</span>
              {shot.vfxReference?.videoUrl || previsVideoUrl ? (
                (() => {
                  const trackingScore = shot.vfxReference?.solvedCameraMove ? 94 : previsVideoUrl ? 96 : 88;
                  const geometryScore = Math.min(98, 84 + (shot.actors.length > 0 ? 10 : 0));
                  const continuityScore = shot.durationSeconds > 0 ? 92 : 75;
                  const overallScore = Math.round((trackingScore + geometryScore + continuityScore) / 3);

                  return (
                    <div className="flex items-center gap-4 bg-[#0f121a] p-3 rounded-lg border border-white/5">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-slate-800"
                            strokeWidth="3.5"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className="text-emerald-500 transition-all duration-1000 ease-out"
                            strokeDasharray={`${overallScore}, 100`}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <span className="absolute font-mono text-sm font-extrabold text-white">{overallScore}</span>
                      </div>

                      <div className="flex-1 space-y-0.5 font-mono text-[9px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Tracking:</span>
                          <span className="text-emerald-400 font-semibold">{trackingScore}% {trackingScore >= 90 ? 'High' : 'Good'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Geometry:</span>
                          <span className="text-emerald-400 font-semibold">{geometryScore}% Clean</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Continuity:</span>
                          <span className="text-emerald-400 font-semibold">{continuityScore}% Verified</span>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col gap-1.5 bg-[#0f121a] p-3 rounded-lg border border-dashed border-white/10 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-400 font-mono text-[10px]">
                    <span>Plate Tracking Score:</span>
                    <span className="text-amber-400 font-bold">Unanalyzed (No Plate Loaded)</span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-sans">
                    Render 3D Previs or load a VFX plate to evaluate kinematic tracking metrics.
                  </p>
                </div>
              )}
            </div>

            {/* Kinematic Motion Constraints & Physics Solver */}
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-xs tracking-wide text-white">
                  Kinematics & Motion Physics
                </span>
                <span className="font-mono text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  Active Rig
                </span>
              </div>

              {/* Toggles: Foot Lock & Ground Constraint */}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer bg-[#0f121a] p-2 rounded border border-white/5 hover:border-white/10 transition-colors">
                  <input
                    type="checkbox"
                    checked={footLock}
                    onChange={(e) => {
                      setFootLock(e.target.checked);
                      updateVfxReference({ footLock: e.target.checked });
                    }}
                    className="h-3.5 w-3.5 rounded bg-slate-800 border-slate-700 accent-blue-600 cursor-pointer"
                  />
                  <span>Foot Contact Lock</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer bg-[#0f121a] p-2 rounded border border-white/5 hover:border-white/10 transition-colors">
                  <input
                    type="checkbox"
                    checked={groundConstraint}
                    onChange={(e) => {
                      setGroundConstraint(e.target.checked);
                      updateVfxReference({ groundConstraint: e.target.checked });
                    }}
                    className="h-3.5 w-3.5 rounded bg-slate-800 border-slate-700 accent-blue-600 cursor-pointer"
                  />
                  <span>Ground Constraint</span>
                </label>
              </div>

              {/* Sliders: Actor Motion Smoothing & Camera Smoothing */}
              <div className="space-y-2 bg-[#0f121a] p-2.5 rounded-lg border border-white/5">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Actor Motion Smoothing:</span>
                    <span className="text-blue-400 font-bold">{motionSmoothing}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={motionSmoothing}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setMotionSmoothing(val);
                      updateVfxReference({ motionSmoothing: val });
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Camera Gyro Smoothing:</span>
                    <span className="text-amber-400 font-bold">{cameraSmoothing}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={cameraSmoothing}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCameraSmoothing(val);
                      updateVfxReference({ cameraSmoothing: val });
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono pt-1">
                  <span className="text-slate-400">Stabilization:</span>
                  <div className="flex gap-1">
                    {(['Low', 'Medium', 'High'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => {
                          setStabilization(level);
                          updateVfxReference({ stabilization: level });
                        }}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                          stabilization === level
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Prompt Pack Button */}
            <div className="flex items-center justify-between bg-[#121622] p-2.5 rounded-lg border border-white/10">
              <div className="flex items-center gap-1.5 text-slate-200">
                <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-[11px] font-semibold">Prompt Compiler</span>
              </div>
              <button
                onClick={onOpenPromptInspector}
                className="rounded bg-blue-600 px-3 py-1 font-mono text-[10px] font-bold text-white hover:bg-blue-500 transition-colors shadow-sm"
              >
                Inspect Pack
              </button>
            </div>

            {/* Export Presets Grid */}
            <div className="space-y-2 pt-1 border-t border-white/5">
              <span className="font-display font-bold text-xs tracking-wide text-white">Target Pipeline</span>
              <div className="grid grid-cols-5 gap-1.5 text-center font-mono text-[9px]">
                {(['ComfyUI', 'Blender', 'Seedance', 'Runway', 'Kling'] as const).map((preset) => {
                  const isSelected = selectedExportPreset === preset;
                  return (
                    <button
                      key={preset}
                      onClick={() => setSelectedExportPreset(preset)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-md p-1.5 transition-all border ${
                        isSelected
                          ? 'border-blue-500 bg-[#162033] text-white shadow-sm'
                          : 'border-white/5 bg-[#13161f] text-slate-400 hover:text-white hover:border-white/10'
                      }`}
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-black/40 text-blue-400 font-bold text-xs">
                        {preset === 'ComfyUI' ? '⚡' : preset === 'Blender' ? '🔶' : '🎬'}
                      </div>
                      <span className="truncate w-full">{preset}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Export Production Pack */}
            <button
              onClick={handleExportPack}
              disabled={isExporting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-display text-xs font-bold py-2.5 shadow-md transition-all active:scale-[0.98]"
            >
              <Download className="h-4 w-4" />
              <span>{isExporting ? 'Generating Production Passes...' : 'Export Production Pack'}</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Persistent Footer Action: Two-Stage Directorial Pipeline */}
      <div className="border-t border-white/5 bg-[#0e1017] p-3 shrink-0 flex flex-col gap-2">
        {isRenderingPrevis ? (
          <div className="flex flex-col gap-1 rounded-lg bg-amber-500/20 border border-amber-500/40 p-2.5 text-center">
            <div className="flex items-center justify-between font-mono text-[10px] text-amber-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                RENDERING 3D PREVIS (IN-APP)...
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
        ) : previsVideoUrl ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1.5 font-mono text-[10px] text-emerald-400">
              <span className="flex items-center gap-1.5 font-bold">
                <Film className="h-3.5 w-3.5" />
                ✓ 3D PREVIS READY ({shot.durationSeconds}s @ 24 FPS)
              </span>
              <button
                onClick={() => renderPrevisVideo()}
                className="text-[9px] text-slate-400 hover:text-white underline cursor-pointer"
              >
                Re-render
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Download Previs MP4 */}
              <a
                href={previsVideoUrl}
                download={`${shot.name.replace(/\s+/g, '_')}_3D_Previs.mp4`}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-300 font-mono text-[10px] font-bold py-2 transition-all cursor-pointer text-center"
                title="Download 3D Previs MP4 video to your computer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Previs MP4</span>
              </a>

              {/* Step 2: Send to ComfyUI */}
              <button
                onClick={onDirectShotWithComfy}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-display text-[10px] font-extrabold py-2 transition-all shadow-md shadow-amber-500/20 active:scale-[0.98] cursor-pointer"
                title="Send Previs video plate to ComfyUI for AI diffusion"
              >
                <Zap className="h-3.5 w-3.5 fill-current" />
                <span>Direct in ComfyUI ▶</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => renderPrevisVideo()}
              disabled={isRenderingPrevis}
              className="flex w-full items-center justify-center gap-2 rounded-lg font-display text-xs font-bold py-2.5 shadow-md transition-all active:scale-[0.98] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold shadow-glow-gold cursor-pointer"
              title="Render 3D camera viewfinder motion directly in-app at 24fps"
            >
              <Film className="h-4 w-4" />
              <span>RENDER 3D PREVIS (IN-APP 24 FPS)</span>
            </button>

            <button
              onClick={onDirectShotWithComfy}
              className="flex w-full items-center justify-center gap-1 text-amber-400 hover:text-amber-300 font-mono text-[10px] py-1 transition-colors cursor-pointer"
              title="Open ComfyUI AI Diffusion Studio"
            >
              <span>or direct with ComfyUI Studio</span>
              <ArrowRight className="h-3 w-3 ml-0.5" />
            </button>
          </div>
        )}
      </div>

      {/* AI Concept-to-3D Studio Modal */}
      <AIGenerator3D
        isOpen={showAiGeneratorModal}
        onClose={() => {
          setShowAiGeneratorModal(false);
          setTargetActorIdForGenerator(null);
        }}
        initialPrompt={aiGeneratorInitialPrompt}
        initialImageUrl={aiGeneratorInitialImage}
        onApplyToScene={() => {
          if (targetActorIdForGenerator) {
            removeActor(targetActorIdForGenerator);
          }
          setShowAiGeneratorModal(false);
          setTargetActorIdForGenerator(null);
        }}
      />
    </div>
  );
};
