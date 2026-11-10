import React, { useState, useEffect, useRef } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { useComfyStore } from '../stores/useComfyStore';
import { getAdapter } from '../adapters';
import { getReasonerConfig } from '../services/objectReasoner';
import { directPromptWithAI, refinePromptWithAIChat } from '../services/aiPromptDirector';
import { analyzeShotPovVisibility } from '../engine/povVisibilityEngine';
import { formatReadableEnginePrompt, isCustomPromptCoherentWithShot } from '../engine/promptCompiler';
import { exportCameraPoseBundle, exportCameraExtrinsicsJson } from '../engine/cameraMatrixExport';
import { shouldHideStageBackdropInPrevis } from '../engine/staging/environmentBuilder';
import { CINEMATIC_ENVIRONMENT_PRESETS } from '../types/environment';
import { defaultComfyClient } from '../services/comfyClient';
import { defaultJobRunner } from '../pipeline/jobRunner';
import { loadBundledTemplates } from '../pipeline/templateLoader';
import { templateRegistry } from '../pipeline/templateRegistry';
import {
  WorkflowChoiceItem,
  ensureWorkflowSyncedToComfyUI,
  getActiveWorkflowForEngine,
  getWorkflowArchitectureProfile,
  syncActiveEngineWorkflowToRegistry,
} from '../pipeline/customWorkflowResolver';
import { CustomWorkflowConfigBar } from './CustomWorkflowConfigBar';
import { BundledWorkflowsModal } from './BundledWorkflowsModal';
import {
  Download,
  Copy,
  Check,
  Play,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Video,
  FileCode,
  Compass,
  Layers,
  Target,
  Brain,
  Wand2,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Code2,
  Zap,
  Columns,
  Upload,
  CheckCircle2,
  AlertCircle,
  Square,
  MessageSquare,
  Undo2,
} from 'lucide-react';

export type PrevisSourcePass = 'rgb' | 'clay' | 'openpose' | 'depth' | 'id-mask';

export interface WorkflowQuickTuning {
  steps: number;
  controlStrength: number;
  firstPassScale: number;
  referenceMode: 'OFF' | 'ON';
  presetSummary: string;
  saveNodeBadge: string;
  inputNodeBadge: string;
  recommendedPass: PrevisSourcePass;
}

/**
 * Computes the scientifically optimal workflow parameters for each (Engine × Workflow × Video Pass)
 * combination without exposing fragile internal ComfyUI constants (such as CFG=1.0 or divisible_by=32).
 */
export function computeOptimalWorkflowTuning(
  engine: 'ltx-2.5' | 'minimax-h3',
  workflowId: string,
  sourcePass: PrevisSourcePass
): WorkflowQuickTuning {
  const arch = getWorkflowArchitectureProfile(workflowId, engine);
  const saveNodeBadge = arch.fallbackSaveNodeIds.length
    ? `Save: ${arch.primarySaveNodeLabel} + Fallback #${arch.fallbackSaveNodeIds[0]}`
    : `Save: ${arch.primarySaveNodeLabel}`;
  const inputNodeBadge = `Input: ${arch.controlInputNodeLabel}`;

  if (engine === 'ltx-2.5') {
    const isStrictMotion = workflowId === 'ltx25_ic_lora_motion';
    const isFastNative = workflowId === 'ltx25_fast_native';
    switch (sourcePass) {
      case 'clay':
        return {
          steps: isStrictMotion ? 10 : 8,
          controlStrength: isStrictMotion ? 0.62 : 0.52,
          firstPassScale: 1.0,
          referenceMode: 'OFF',
          presetSummary: isFastNative
            ? 'Fast Native Clay IC-LoRA (3D Silhouette + Full Prompt Restyle • Node #15/#10)'
            : 'Zero-Chroma Clay IC-LoRA (3D Silhouette + Full Photoreal Restyle • 24GB Safe)',
          saveNodeBadge,
          inputNodeBadge,
          recommendedPass: arch.recommendedPass,
        };
      case 'depth':
        return {
          steps: isStrictMotion ? 10 : 8,
          controlStrength: isStrictMotion ? 0.8 : 0.7,
          firstPassScale: 1.0,
          referenceMode: 'OFF',
          presetSummary: 'Volumetric Z-Depth Conditioning (Spatial Lock + Free Surface Synthesis • 24GB Safe)',
          saveNodeBadge,
          inputNodeBadge,
          recommendedPass: arch.recommendedPass,
        };
      case 'openpose':
        return {
          steps: 10,
          controlStrength: isStrictMotion ? 0.75 : 0.7,
          firstPassScale: 1.0,
          referenceMode: 'OFF',
          presetSummary: 'Skeletal Pose Conditioning (Joint Trajectory Lock + Full Body Synthesis • 24GB Safe)',
          saveNodeBadge,
          inputNodeBadge,
          recommendedPass: arch.recommendedPass,
        };
      case 'id-mask':
        return {
          steps: 10,
          controlStrength: 0.5,
          firstPassScale: 1.0,
          referenceMode: 'OFF',
          presetSummary: 'Segmentation Mask Conditioning (Softened Chroma to Prevent Flat Mask Bleed • 24GB Safe)',
          saveNodeBadge,
          inputNodeBadge,
          recommendedPass: arch.recommendedPass,
        };
      case 'rgb':
      default:
        return {
          steps: 10,
          controlStrength: 0.5,
          firstPassScale: 1.0,
          referenceMode: 'OFF',
          presetSummary: 'RGB Previs Restyle (Softened Chroma Lock to Prevent Mannequin Copy • 24GB Safe)',
          saveNodeBadge,
          inputNodeBadge,
          recommendedPass: arch.recommendedPass,
        };
    }
  }

  // MiniMax H3 / Wan2.2 14B Fun V2.2 Ref2VA
  const isStubeliusH3 = workflowId.toLowerCase().includes('stubelius');
  const isFastDraft = workflowId === 'minimax_h3_fast_draft';
  const isSeedHunter = workflowId === 'minimax_h3_seed_hunter';
  const baseMp = isFastDraft ? 0.5 : 0.8;
  switch (sourcePass) {
    case 'clay':
      return {
        steps: isStubeliusH3 || isSeedHunter ? 10 : 8,
        controlStrength: 0.8,
        firstPassScale: baseMp,
        referenceMode: 'ON',
        presetSummary: isStubeliusH3
          ? 'Stubelius H3 Clay Structure + Omni 4-Ref Identity (Save Node #12)'
          : 'H3 Ref2VA Clay Structure + Smart 4-Ref Identity (Save Node #145)',
        saveNodeBadge,
        inputNodeBadge,
        recommendedPass: arch.recommendedPass,
      };
    case 'depth':
    case 'openpose':
    case 'id-mask':
      return {
        steps: 10,
        controlStrength: 0.7,
        firstPassScale: baseMp,
        referenceMode: 'ON',
        presetSummary: `H3 ${sourcePass.toUpperCase()} Motion Guide + Smart 4-Ref Identity (${arch.primarySaveNodeLabel})`,
        saveNodeBadge,
        inputNodeBadge,
        recommendedPass: arch.recommendedPass,
      };
    case 'rgb':
    default:
      return {
        steps: isStubeliusH3 || isSeedHunter ? 10 : 8,
        controlStrength: 0.75,
        firstPassScale: baseMp,
        referenceMode: 'ON',
        presetSummary: isStubeliusH3
          ? 'Stubelius H3 RGB Motion + Omni 4-Ref Identity (Save Node #12)'
          : 'H3 Ref2VA RGB Motion + Smart 4-Ref Identity (Save Node #145)',
        saveNodeBadge,
        inputNodeBadge,
        recommendedPass: arch.recommendedPass,
      };
  }
}

interface PrevisExportDeckProps {
  onBackToPrevis?: () => void;
}

export const PrevisExportDeck: React.FC<PrevisExportDeckProps> = ({ onBackToPrevis }) => {
  const {
    shot,
    compiledPrompt,
    setCompiledPrompt,
    setNegativePrompt,
    setCustomPositivePrompt,
    undoCustomPositivePrompt,
    appendPromptChatMessage,
    clearPromptChatMessages,
    previsVideoUrl,
    previsClayUrl,
    previsOpenPoseUrl,
    previsDepthUrl,
    previsIdMaskUrl,
    isRenderingPrevis,
    previsProgress,
    renderPrevisVideo,
    setPrevisVideo,
    updateTargetModel,
    updateActor,
    setEnvironment,
  } = useShotStore();

  const backdropDecision = React.useMemo(() => shouldHideStageBackdropInPrevis(shot), [shot]);
  const lastRenderedBackdropHideRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (previsVideoUrl && lastRenderedBackdropHideRef.current === null) {
      lastRenderedBackdropHideRef.current = backdropDecision.hide;
    }
  }, [previsVideoUrl, backdropDecision.hide]);

  const [promptChatInput, setPromptChatInput] = useState('');
  const [isSendingPromptChat, setIsSendingPromptChat] = useState(false);
  const [isPromptChatOpen, setIsPromptChatOpen] = useState(true);
  const promptChatEndRef = useRef<HTMLDivElement | null>(null);

  const [activeEngineTab, setActiveEngineTab] = useState<'ltx-2.5' | 'minimax-h3' | 'seedance'>(
    shot.targetModel === 'minimax-h3' ? 'minimax-h3' : shot.targetModel === 'seedance' ? 'seedance' : 'ltx-2.5'
  );
  const [activePassTab, setActivePassTab] = useState<
    'rgb' | 'clay' | 'openpose' | 'depth' | 'id-mask' | 'comfy-final' | 'side-by-side'
  >('rgb');
  const [activeSourcePass, setActiveSourcePass] = useState<PrevisSourcePass>(
    shot.targetModel === 'minimax-h3' ? 'rgb' : 'clay'
  );
  const [renderPassMode, setRenderPassMode] = useState<'all' | 'rgb' | 'clay' | 'openpose' | 'depth' | 'id-mask'>('all');
  const [compareViewMode, setCompareViewMode] = useState<'wipe' | 'split'>('wipe');
  const [wipePercent, setWipePercent] = useState<number>(50);
  const isDraggingWipeRef = useRef<boolean>(false);
  const wipeViewportRef = useRef<HTMLDivElement | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedNegative, setCopiedNegative] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedMatrix, setCopiedMatrix] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<'720p' | '1080p'>('720p');
  const [isDirectingPrompt, setIsDirectingPrompt] = useState(false);
  const [aiDirectorFeedback, setAiDirectorFeedback] = useState<string | null>(null);
  const [showTimelineDetails, setShowTimelineDetails] = useState(true);
  const [showWorkflowsPackModal, setShowWorkflowsPackModal] = useState(false);

  // ComfyUI Live Bridge State (MiniMax H3 Ref2VA & LTX-2.5)
  const {
    activeJob,
    serverUrl: storeServerUrl,
    connectionStatus: storeConnectionStatus,
    systemStats: storeSystemStats,
    setConnectionStatus: setStoreConnectionStatus,
    setSystemStats: setStoreSystemStats,
  } = useComfyStore();
  const [comfyOnline, setComfyOnline] = useState<boolean>(storeConnectionStatus === 'connected');
  const [comfyGpuLabel, setComfyGpuLabel] = useState<string>(
    storeSystemStats ? `${storeSystemStats.gpuName} (${storeSystemStats.vramTotalGb}GB VRAM)` : 'Checking 127.0.0.1:8188...'
  );
  const povReport = React.useMemo(() => analyzeShotPovVisibility(shot), [shot]);

  // Per-shot custom reference slot cache so switching scenes/shots never leaks custom slots or actor references
  const slotTargetsByShotRef = useRef<Record<string, [string, string, string, string]>>({});
  const customSlotsByShotRef = useRef<
    Record<string, Record<number, { thumb: string | null; name: string; file: File | null }>>
  >({});
  const prevShotIdRef = useRef<string>(shot.id);

  const [refImageNames, setRefImageNames] = useState<[string, string, string, string]>(() => {
    const vis = povReport.visibleActors;
    const slot0HasImg = Boolean(vis[0]?.conceptImageUrl || shot.actors[0]?.conceptImageUrl);
    const slot1HasImg = Boolean(vis[1]?.conceptImageUrl || shot.actors[1]?.conceptImageUrl);
    const slot2HasImg = Boolean(vis[2]?.conceptImageUrl || shot.actors[2]?.conceptImageUrl);
    const slot3HasImg = Boolean(shot.environment?.conceptImageUrl);
    return [
      slot0HasImg ? vis[0]?.conceptImageName || shot.actors[0]?.conceptImageName || 'ref_slot_1.png' : '',
      slot1HasImg ? vis[1]?.conceptImageName || shot.actors[1]?.conceptImageName || 'ref_slot_2.png' : '',
      slot2HasImg ? vis[2]?.conceptImageName || shot.actors[2]?.conceptImageName || 'ref_slot_3.png' : '',
      slot3HasImg ? shot.environment?.conceptImageName || 'ref_slot_4.png' : '',
    ];
  });
  const [refSlotTargets, setRefSlotTargets] = useState<[string, string, string, string]>(() => {
    const vis = povReport.visibleActors;
    return [
      vis[0]?.id || shot.actors[0]?.id || 'custom',
      vis[1]?.id || shot.actors[1]?.id || 'custom',
      vis[2]?.id || shot.actors[2]?.id || 'custom',
      'environment',
    ];
  });
  const [refImageThumbs, setRefImageThumbs] = useState<[string | null, string | null, string | null, string | null]>(() => {
    const vis = povReport.visibleActors;
    return [
      vis[0]?.conceptImageUrl || shot.actors[0]?.conceptImageUrl || null,
      vis[1]?.conceptImageUrl || shot.actors[1]?.conceptImageUrl || null,
      vis[2]?.conceptImageUrl || shot.actors[2]?.conceptImageUrl || null,
      shot.environment?.conceptImageUrl || null,
    ];
  });
  const [refImageFiles, setRefImageFiles] = useState<[File | null, File | null, File | null, File | null]>([
    null,
    null,
    null,
    null,
  ]);
  const [comfySeed, setComfySeed] = useState<number>(532752046112665);
  const [activeWorkflowChoice, setActiveWorkflowChoice] = useState<WorkflowChoiceItem>(() =>
    getActiveWorkflowForEngine(activeEngineTab === 'ltx-2.5' ? 'ltx-2.5' : 'minimax-h3')
  );

  // Smart Workflow Quick Settings (Auto-Tune per Engine × Workflow × Video Pass + Manual Override)
  const initialTuning = React.useMemo(
    () =>
      computeOptimalWorkflowTuning(
        activeEngineTab === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5',
        activeWorkflowChoice.id,
        activeSourcePass
      ),
    []
  );
  const [isWorkflowAutoTune, setIsWorkflowAutoTune] = useState<boolean>(true);
  const [wfSteps, setWfSteps] = useState<number>(initialTuning.steps);
  const [wfControlStrength, setWfControlStrength] = useState<number>(initialTuning.controlStrength);
  const [wfFirstPassScale, setWfFirstPassScale] = useState<number>(initialTuning.firstPassScale);
  const [wfReferenceMode, setWfReferenceMode] = useState<'OFF' | 'ON'>(initialTuning.referenceMode);
  const [wfPresetSummary, setWfPresetSummary] = useState<string>(initialTuning.presetSummary);
  const [wfSaveNodeBadge, setWfSaveNodeBadge] = useState<string>(initialTuning.saveNodeBadge);
  const [wfInputNodeBadge, setWfInputNodeBadge] = useState<string>(initialTuning.inputNodeBadge);
  const [wfRecommendedPass, setWfRecommendedPass] = useState<PrevisSourcePass>(initialTuning.recommendedPass);

  // Sync activeSourcePass whenever the user selects one of the 5 source video pass tabs
  useEffect(() => {
    if (
      activePassTab === 'rgb' ||
      activePassTab === 'clay' ||
      activePassTab === 'openpose' ||
      activePassTab === 'depth' ||
      activePassTab === 'id-mask'
    ) {
      setActiveSourcePass(activePassTab);
    }
  }, [activePassTab]);

  // Auto-Tune workflow parameters whenever (Engine × Workflow × Active Source Pass) changes
  useEffect(() => {
    const engineKey: 'ltx-2.5' | 'minimax-h3' = activeEngineTab === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5';
    const optimal = computeOptimalWorkflowTuning(engineKey, activeWorkflowChoice.id, activeSourcePass);
    setWfPresetSummary(optimal.presetSummary);
    setWfSaveNodeBadge(optimal.saveNodeBadge);
    setWfInputNodeBadge(optimal.inputNodeBadge);
    setWfRecommendedPass(optimal.recommendedPass);
    if (isWorkflowAutoTune) {
      setWfSteps(optimal.steps);
      setWfControlStrength(optimal.controlStrength);
      setWfFirstPassScale(optimal.firstPassScale);
      setWfReferenceMode(optimal.referenceMode);
    }
  }, [activeEngineTab, activeWorkflowChoice.id, activeSourcePass, isWorkflowAutoTune]);

  const handleResetWorkflowToOptimal = () => {
    const engineKey: 'ltx-2.5' | 'minimax-h3' = activeEngineTab === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5';
    const optimal = computeOptimalWorkflowTuning(engineKey, activeWorkflowChoice.id, activeSourcePass);
    setIsWorkflowAutoTune(true);
    setWfSteps(optimal.steps);
    setWfControlStrength(optimal.controlStrength);
    setWfFirstPassScale(optimal.firstPassScale);
    setWfReferenceMode(optimal.referenceMode);
    setWfPresetSummary(optimal.presetSummary);
    setWfSaveNodeBadge(optimal.saveNodeBadge);
    setWfInputNodeBadge(optimal.inputNodeBadge);
    setWfRecommendedPass(optimal.recommendedPass);
  };

  const [isSubmittingComfy, setIsSubmittingComfy] = useState<boolean>(false);
  const [comfyStatusText, setComfyStatusText] = useState<string | null>(null);
  const [comfyErrorText, setComfyErrorText] = useState<string | null>(null);
  const [finalComfyVideoUrl, setFinalComfyVideoUrl] = useState<string | null>(null);
  const [finalComfyFilename, setFinalComfyFilename] = useState<string | null>(null);
  const [finalComfyMeta, setFinalComfyMeta] = useState<string | null>(null);

  const syncLeftVideoRef = useRef<HTMLVideoElement | null>(null);
  const syncRightVideoRef = useRef<HTMLVideoElement | null>(null);

  const probeComfyHealth = async () => {
    setComfyErrorText(null);
    setComfyGpuLabel('Connecting to 127.0.0.1:8188...');
    const health = await defaultComfyClient.checkHealth();
    if (health.ok && health.stats) {
      setComfyOnline(true);
      setStoreConnectionStatus('connected');
      setStoreSystemStats(health.stats);
      setComfyGpuLabel(`${health.stats.gpuName} (${health.stats.vramTotalGb}GB VRAM)`);
      const latest = await defaultComfyClient.fetchLatestCompletedOutput(10);
      if (latest) {
        setFinalComfyVideoUrl(latest.videoUrl);
        setFinalComfyFilename(latest.filename);
        const metaParts = [
          latest.width && latest.height ? `${latest.width}×${latest.height}` : null,
          latest.fps ? `${latest.fps}fps` : null,
          latest.duration ? `${latest.duration.toFixed(1)}s` : null,
        ].filter(Boolean);
        setFinalComfyMeta(metaParts.join(' • ') || 'ComfyUI Output');
      }
      return true;
    } else {
      setComfyOnline(false);
      setStoreConnectionStatus('error');
      setComfyGpuLabel('Offline (127.0.0.1:8188) • Click to Reconnect');
      const currentJob = useComfyStore.getState().activeJob;
      if (currentJob && (currentJob.status === 'executing' || currentJob.status === 'queued')) {
        defaultJobRunner.cancelActiveJob().catch(() => {});
        useComfyStore.getState().setJobFailed(
          'ComfyUI server disconnected during execution. Once ComfyUI is running again, click Render in ComfyUI to retry.'
        );
        setIsSubmittingComfy(false);
        setComfyStatusText(null);
        setComfyErrorText(
          'ComfyUI server disconnected during execution. Once ComfyUI is running again, click Render in ComfyUI to retry.'
        );
      }
      return false;
    }
  };

  // Automatically re-enable the Render button if activeJob finishes, fails, or is cleared
  useEffect(() => {
    if (activeJob && (activeJob.status === 'failed' || activeJob.status === 'completed')) {
      setIsSubmittingComfy(false);
      if (activeJob.status === 'failed' && activeJob.error) {
        setComfyStatusText(null);
        setComfyErrorText(activeJob.error);
      }
    }
  }, [activeJob?.status, activeJob?.error]);

  // Sync when Settings modal updates useComfyStore
  useEffect(() => {
    if (storeConnectionStatus === 'connected' && storeSystemStats) {
      setComfyOnline(true);
      setComfyGpuLabel(`${storeSystemStats.gpuName} (${storeSystemStats.vramTotalGb}GB VRAM)`);
      setComfyErrorText(null);
    }
  }, [storeConnectionStatus, storeSystemStats, storeServerUrl]);

  // Ensure bundled workflow templates are registered and probe ComfyUI on mount + auto-reconnect
  useEffect(() => {
    if (templateRegistry.list().length === 0) {
      loadBundledTemplates();
    }
    probeComfyHealth();
    const timer = setInterval(() => {
      if (useComfyStore.getState().connectionStatus !== 'connected') {
        probeComfyHealth();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleLoadLatestComfyRender = async () => {
    setComfyErrorText(null);
    setComfyStatusText('Checking ComfyUI /history for latest completed render...');
    const health = await defaultComfyClient.checkHealth();
    if (health.ok && health.stats) {
      setComfyOnline(true);
      setComfyGpuLabel(`${health.stats.gpuName} (${health.stats.vramTotalGb}GB VRAM)`);
    }
    const latest = await defaultComfyClient.fetchLatestCompletedOutput(15);
    if (latest) {
      setFinalComfyVideoUrl(latest.videoUrl);
      setFinalComfyFilename(latest.filename);
      const metaParts = [
        latest.width && latest.height ? `${latest.width}×${latest.height}` : null,
        latest.fps ? `${latest.fps}fps` : null,
        latest.duration ? `${latest.duration.toFixed(1)}s` : null,
      ].filter(Boolean);
      setFinalComfyMeta(metaParts.join(' • ') || 'ComfyUI Output');
      setComfyStatusText(`Loaded latest ComfyUI render: ${latest.filename}`);
      setActivePassTab(previsVideoUrl ? 'side-by-side' : 'comfy-final');
    } else {
      setComfyErrorText('No completed video output found in ComfyUI history.');
      setComfyStatusText(null);
    }
  };

  // Automatically sync reference image slots with active shot's POV-visible Directing Stage object/set reference images
  // Strictly isolated per shot (`shot.id`) and per actor (`actor.id`) so switching shots NEVER leaks reference images.
  useEffect(() => {
    const visibleActors = povReport.visibleActors;
    const isShotSwitch = prevShotIdRef.current !== shot.id;
    prevShotIdRef.current = shot.id;

    setRefSlotTargets((prevTargets) => {
      const savedForShot = slotTargetsByShotRef.current[shot.id];
      const baseTargets: [string, string, string, string] = isShotSwitch
        ? savedForShot
          ? [...savedForShot]
          : [
              visibleActors[0]?.id || shot.actors[0]?.id || 'custom',
              visibleActors[1]?.id || shot.actors[1]?.id || 'custom',
              visibleActors[2]?.id || shot.actors[2]?.id || 'custom',
              'environment',
            ]
        : ([...prevTargets] as [string, string, string, string]);

      for (let i = 0; i < 3; i++) {
        const cur = baseTargets[i];
        const existsInShot = cur === 'custom' || cur === 'environment' || shot.actors.some((a) => a.id === cur);
        if (!existsInShot) {
          baseTargets[i] = visibleActors[i]?.id || shot.actors[i]?.id || 'custom';
        }
      }
      if (
        baseTargets[3] !== 'environment' &&
        baseTargets[3] !== 'custom' &&
        !shot.actors.some((a) => a.id === baseTargets[3])
      ) {
        baseTargets[3] = 'environment';
      }

      slotTargetsByShotRef.current[shot.id] = baseTargets;
      return baseTargets;
    });
  }, [shot.id, shot.actors, povReport]);

  useEffect(() => {
    const nextThumbs: [string | null, string | null, string | null, string | null] = [null, null, null, null];
    const nextNames: [string, string, string, string] = ['', '', '', ''];
    const nextFiles: [File | null, File | null, File | null, File | null] = [null, null, null, null];
    const shotCustomSlots = customSlotsByShotRef.current[shot.id] || {};

    for (let idx = 0; idx < 4; idx++) {
      const targetId = refSlotTargets[idx];
      const defaultPlaceholder = `ref_slot_${idx + 1}.png`;
      if (targetId === 'environment') {
        const envThumb = shot.environment?.conceptImageUrl || null;
        nextThumbs[idx] = envThumb;
        nextNames[idx] = envThumb ? shot.environment?.conceptImageName || defaultPlaceholder : '';
        nextFiles[idx] = null;
      } else if (targetId && targetId !== 'custom') {
        const actor = shot.actors.find((a) => a.id === targetId);
        const actorThumb =
          actor?.conceptImageUrl &&
          !/raw\.githubusercontent\.com\/lucas-martinic\/polyfork-catalog|images\.unsplash\.com/i.test(
            actor.conceptImageUrl
          )
            ? actor.conceptImageUrl
            : null;
        nextThumbs[idx] = actorThumb;
        nextNames[idx] = actorThumb ? actor?.conceptImageName || defaultPlaceholder : '';
        nextFiles[idx] = null;
      } else {
        const customEntry = shotCustomSlots[idx];
        const hasCustom = Boolean(customEntry?.thumb || customEntry?.file);
        nextThumbs[idx] = customEntry?.thumb || null;
        nextNames[idx] = hasCustom ? customEntry?.name || defaultPlaceholder : '';
        nextFiles[idx] = customEntry?.file || null;
      }
    }

    setRefImageThumbs((prev) =>
      prev[0] === nextThumbs[0] &&
      prev[1] === nextThumbs[1] &&
      prev[2] === nextThumbs[2] &&
      prev[3] === nextThumbs[3]
        ? prev
        : nextThumbs
    );
    setRefImageNames((prev) =>
      prev[0] === nextNames[0] &&
      prev[1] === nextNames[1] &&
      prev[2] === nextNames[2] &&
      prev[3] === nextNames[3]
        ? prev
        : nextNames
    );
    setRefImageFiles((prev) =>
      prev[0] === nextFiles[0] &&
      prev[1] === nextFiles[1] &&
      prev[2] === nextFiles[2] &&
      prev[3] === nextFiles[3]
        ? prev
        : nextFiles
    );
  }, [shot.id, refSlotTargets, shot.actors, shot.environment]);

  const handleRenderInComfyUI = async () => {
    setComfyErrorText(null);
    if (activeEngineTab === 'seedance') {
      setComfyErrorText(
        'Seedance 2.0 is a prompt-export engine (no local ComfyUI weights). Switch to LTX-2.5 or MiniMax H3 to render locally in ComfyUI, or copy/export the Seedance prompt below.'
      );
      return;
    }

    const targetEngine: 'ltx-2.5' | 'minimax-h3' = activeEngineTab === 'ltx-2.5' ? 'ltx-2.5' : 'minimax-h3';
    const currentWorkflow = getActiveWorkflowForEngine(targetEngine);
    const trimmedRefs = refImageNames.map((n) => n.trim()) as [string, string, string, string];
    // Validate that all 4 Reference Image slots are filled when using a 4-ref workflow
    if (currentWorkflow.requiresFourRefs && trimmedRefs.some((n) => n.length === 0)) {
      setComfyErrorText('All 4 Reference Image slots (<picture 1> to <picture 4>) must be filled before submitting to this workflow.');
      return;
    }

    setIsSubmittingComfy(true);
    try {
      // 1. Resolve which 3D Previs video pass is actively selected to send to ComfyUI ('clay' | 'rgb' | 'openpose' | 'depth' | 'id-mask')
      const passToUpload: PrevisSourcePass =
        activePassTab === 'rgb' ||
        activePassTab === 'clay' ||
        activePassTab === 'openpose' ||
        activePassTab === 'depth' ||
        activePassTab === 'id-mask'
          ? activePassTab
          : activeSourcePass;

      const getPassUrlFromStore = (pass: PrevisSourcePass): string | undefined => {
        const s = useShotStore.getState();
        switch (pass) {
          case 'clay':
            return s.previsClayUrl;
          case 'openpose':
            return s.previsOpenPoseUrl;
          case 'depth':
            return s.previsDepthUrl;
          case 'id-mask':
            return s.previsIdMaskUrl;
          case 'rgb':
          default:
            return s.previsVideoUrl;
        }
      };

      const passHumanName =
        passToUpload === 'clay'
          ? 'Clay Layout'
          : passToUpload === 'openpose'
          ? 'OpenPose Rig'
          : passToUpload === 'depth'
          ? 'Volumetric Depth'
          : passToUpload === 'id-mask'
          ? 'Object ID Mask'
          : 'RGB Plate';

      let sourcePassUrl = getPassUrlFromStore(passToUpload);
      const backdropChangedSinceRender =
        lastRenderedBackdropHideRef.current !== null &&
        lastRenderedBackdropHideRef.current !== backdropDecision.hide;
      if (!sourcePassUrl || backdropChangedSinceRender) {
        setComfyStatusText(
          `Step 1/3: Rendering 24fps 3D ${passHumanName} MP4 (${selectedResolution}, ${
            backdropDecision.hide ? 'Clean BG' : '3D Stage'
          }) for <Video 1> reference...`
        );
        await renderPrevisVideo(passToUpload, selectedResolution);
        lastRenderedBackdropHideRef.current = backdropDecision.hide;
        sourcePassUrl = getPassUrlFromStore(passToUpload);
      }
      if (!sourcePassUrl) {
        throw new Error(`Failed to generate 3D ${passHumanName} Previs video for ComfyUI upload.`);
      }

      // Fetch blob from object URL + resolve any DataURL thumbnails uploaded in Directing Stage into Blobs!
      setComfyStatusText(
        `Step 2/3: Uploading 3D ${passHumanName} MP4 & Reference Images to ComfyUI (127.0.0.1:8188)...`
      );
      const previsBlob = await (await fetch(sourcePassUrl)).blob();

      const resolvedRefBlobs: [Blob | null, Blob | null, Blob | null, Blob | null] = [null, null, null, null];
      const resolvedSlotUrls: [string | null, string | null, string | null, string | null] = [null, null, null, null];
      const refImageDescriptions: [string, string, string, string] = ['', '', '', ''];
      for (let i = 0; i < 4; i++) {
        const slotTarget = refSlotTargets[i];
        const matchedActor =
          slotTarget && slotTarget !== 'environment' && slotTarget !== 'custom'
            ? shot.actors.find((a) => a.id === slotTarget)
            : undefined;
        const rawActorImageUrl =
          matchedActor?.conceptImageUrl &&
          !/raw\.githubusercontent\.com\/lucas-martinic\/polyfork-catalog|images\.unsplash\.com/i.test(
            matchedActor.conceptImageUrl
          )
            ? matchedActor.conceptImageUrl
            : null;
        const slotImageUrl =
          slotTarget === 'environment'
            ? shot.environment?.conceptImageUrl || null
            : matchedActor
            ? rawActorImageUrl
            : refImageThumbs[i] || null;
        resolvedSlotUrls[i] = slotImageUrl;

        if (slotTarget === 'custom' && refImageFiles[i]) {
          resolvedRefBlobs[i] = refImageFiles[i];
        } else if (slotImageUrl) {
          // If the environment slot (slot 3) shares the exact same composite reference image URL as an earlier subject slot,
          // do not upload a duplicate copy of the same image unless the workflow explicitly requires 4 separate slots.
          const isDuplicateCompositeEnv =
            i === 3 &&
            !currentWorkflow.requiresFourRefs &&
            (slotImageUrl === resolvedSlotUrls[0] ||
              slotImageUrl === resolvedSlotUrls[1] ||
              slotImageUrl === resolvedSlotUrls[2]);
          if (!isDuplicateCompositeEnv) {
            try {
              const res = await fetch(slotImageUrl);
              resolvedRefBlobs[i] = await res.blob();
            } catch {
              resolvedRefBlobs[i] = null;
            }
          }
        }

        if (slotTarget === 'environment') {
          refImageDescriptions[i] =
            resolvedRefBlobs[i]
              ? shot.environment?.promptDescription || shot.environment?.name || 'Active studio environment'
              : '';
        } else if (slotTarget && slotTarget !== 'custom') {
          const isActorInPov = povReport.byActorId[slotTarget]?.everVisible ?? true;
          if (matchedActor && isActorInPov && resolvedRefBlobs[i]) {
            refImageDescriptions[i] = matchedActor.token || matchedActor.name || '';
          } else {
            // Do not inject off-screen or unpopulated actor descriptions into the generation job
            resolvedRefBlobs[i] = null;
            refImageDescriptions[i] = '';
          }
        }
      }

      let objInfo: Record<string, unknown> | null = null;
      try {
        objInfo = await defaultComfyClient.getObjectInfo();
      } catch {
        objInfo = null;
      }
      const verifiedRefFilenames: [string, string, string, string] = [0, 1, 2, 3].map((idx) => {
        if (resolvedRefBlobs[idx]) return trimmedRefs[idx] || `ref_slot_${idx + 1}.png`;
        return '';
      }) as [string, string, string, string];

      const { choice: activeWf, templateId: selectedTemplateId } =
        syncActiveEngineWorkflowToRegistry(targetEngine, objInfo);
      await ensureWorkflowSyncedToComfyUI(activeWf);

      // 2. Queue job via JobRunner using active engine template (LTX-2.5 or MiniMax H3)
      const engineCompiled = getAdapter(targetEngine).compilePrompt(shot);
      const rawLockedCustomForEngine = shot.customPositivePrompts?.[targetEngine]?.trim();
      const lockedCustomForEngine = isCustomPromptCoherentWithShot(rawLockedCustomForEngine, shot)
        ? rawLockedCustomForEngine
        : undefined;
      const effectivePrompt =
        lockedCustomForEngine && lockedCustomForEngine.length > 0
          ? lockedCustomForEngine
          : engineCompiled.positivePrompt;

      // Guarantee that Auto-Tune uses the exact tuning for (targetEngine, activeWf.id, passToUpload)
      const effectiveTuning = isWorkflowAutoTune
        ? computeOptimalWorkflowTuning(targetEngine, activeWf.id, passToUpload)
        : {
            steps: wfSteps,
            controlStrength: wfControlStrength,
            firstPassScale: wfFirstPassScale,
            referenceMode: wfReferenceMode,
          };

      setComfyStatusText(
        `Step 3/3: Binding "${activeWf.shortLabel}" (${passHumanName} • ${effectiveTuning.steps} steps • Str ${effectiveTuning.controlStrength.toFixed(
          2
        )} • RefMode ${effectiveTuning.referenceMode}) & queuing in ComfyUI...`
      );
      await defaultJobRunner.run({
        shot,
        engine: targetEngine,
        mode: 'control',
        templateId: selectedTemplateId,
        profile: activeWf.forcedProfile || (selectedResolution === '1080p' ? 'final' : 'draft'),
        prompt: effectivePrompt,
        negative: displayNegativePrompt,
        seed: Math.max(0, Math.floor(comfySeed)),
        steps: effectiveTuning.steps,
        icLoraStrength: effectiveTuning.controlStrength,
        firstPassScale: effectiveTuning.firstPassScale,
        referenceMode: effectiveTuning.referenceMode,
        promptSource: 'compiled',
        controlVideoBlob: previsBlob,
        refImageBlobs: resolvedRefBlobs,
        refImageFilenames: verifiedRefFilenames,
        refImageDescriptions,
        onProgress: (pct, title) => {
          setComfyStatusText(`ComfyUI Executing (${pct}%): ${title}`);
        },
        onSuccess: (_revId, videoUrl, filename) => {
          setFinalComfyVideoUrl(videoUrl);
          setFinalComfyFilename(filename);
          setFinalComfyMeta(
            targetEngine === 'ltx-2.5'
              ? `${selectedResolution === '1080p' ? '1080p Upscaled' : 'Native Draft'} • LTX-2.5 INT8`
              : '1504×832 • 60fps RIFE + Audio'
          );
          setComfyStatusText(`Completed! Final video ready: ${filename}`);
          setIsSubmittingComfy(false);
          setActivePassTab('side-by-side');
        },
        onError: (err) => {
          setComfyErrorText(err.message);
          setComfyStatusText(null);
          setIsSubmittingComfy(false);
        },
        onInterrupted: () => {
          setComfyErrorText('ComfyUI execution stopped.');
          setComfyStatusText(null);
          setIsSubmittingComfy(false);
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setComfyErrorText(msg);
      setComfyStatusText(null);
      setIsSubmittingComfy(false);
    }
  };

  const handleStopComfyRender = async () => {
    try {
      await defaultJobRunner.cancelActiveJob();
    } catch {
      // ignore network error if ComfyUI is already offline
    }
    useComfyStore.getState().clearActiveJob();
    setIsSubmittingComfy(false);
    setComfyStatusText(null);
    setComfyErrorText('Render stopped by user. You can edit your shot or workflow and click Render in ComfyUI again.');
  };

  const handleSyncRestartBoth = () => {
    if (syncLeftVideoRef.current) {
      syncLeftVideoRef.current.currentTime = 0;
      syncLeftVideoRef.current.play().catch(() => {});
    }
    if (syncRightVideoRef.current) {
      syncRightVideoRef.current.currentTime = 0;
      syncRightVideoRef.current.play().catch(() => {});
    }
  };

  // Keep local tab synced if shot.targetModel changes externally (e.g. from Right Inspector)
  useEffect(() => {
    const normalized =
      shot.targetModel === 'minimax-h3'
        ? 'minimax-h3'
        : shot.targetModel === 'seedance'
        ? 'seedance'
        : 'ltx-2.5';
    setActiveEngineTab(normalized);
  }, [shot.targetModel]);

  useEffect(() => {
    const onPreviewState = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.activePassTab) setActivePassTab(detail.activePassTab);
      if (detail.activeSourcePass) setActiveSourcePass(detail.activeSourcePass);
      if (detail.compareViewMode) setCompareViewMode(detail.compareViewMode);
      if (detail.wipePercent !== undefined) setWipePercent(Number(detail.wipePercent));
      if (detail.finalComfyVideoUrl !== undefined) setFinalComfyVideoUrl(detail.finalComfyVideoUrl);
      if (detail.useRenderedPrevisAsComfyFinal) {
        const rgbUrl = useShotStore.getState().previsVideoUrl;
        if (rgbUrl) setFinalComfyVideoUrl(rgbUrl);
      }
      if (detail.finalComfyFilename !== undefined) setFinalComfyFilename(detail.finalComfyFilename);
      if (detail.finalComfyMeta !== undefined) setFinalComfyMeta(detail.finalComfyMeta);
      if (detail.isPromptChatOpen !== undefined) setIsPromptChatOpen(Boolean(detail.isPromptChatOpen));
      if (detail.showTimelineDetails !== undefined) setShowTimelineDetails(Boolean(detail.showTimelineDetails));
    };
    window.addEventListener('cmpvs:export-deck-preview-state', onPreviewState);
    return () => window.removeEventListener('cmpvs:export-deck-preview-state', onPreviewState);
  }, []);

  // Compile deterministic fallback for active tab
  const activeAdapter = getAdapter(activeEngineTab);
  const deterministicPrompt = activeAdapter.compilePrompt(shot);
  const customLockedPrompt = shot.customPositivePrompts?.[activeEngineTab];
  const isCustomPromptLocked =
    typeof customLockedPrompt === 'string' &&
    customLockedPrompt.trim().length > 0 &&
    isCustomPromptCoherentWithShot(customLockedPrompt, shot);
  const engineUndoCount = (shot.promptHistory?.[activeEngineTab] || []).length;
  const displayPositivePrompt = formatReadableEnginePrompt(
    isCustomPromptLocked ? customLockedPrompt : deterministicPrompt.positivePrompt,
    activeEngineTab
  );
  const displayNegativePrompt = shot.negativePrompt ?? compiledPrompt?.negativePrompt ?? deterministicPrompt.negativePrompt ?? '';
  const temporalBeats = deterministicPrompt.temporalBeats || compiledPrompt?.temporalBeats || [];
  const poseBundle = exportCameraPoseBundle(shot);

  const handleSelectEngine = (engineId: 'ltx-2.5' | 'minimax-h3' | 'seedance') => {
    setActiveEngineTab(engineId);
    updateTargetModel(engineId);
    if (engineId === 'ltx-2.5' || engineId === 'minimax-h3') {
      setActiveWorkflowChoice(getActiveWorkflowForEngine(engineId));
    }
    const adapter = getAdapter(engineId);
    const baseCompiled = adapter.compilePrompt({ ...shot, targetModel: engineId });
    const locked = shot.customPositivePrompts?.[engineId];
    setCompiledPrompt(
      locked && locked.trim().length > 0 && isCustomPromptCoherentWithShot(locked, shot)
        ? { ...baseCompiled, positivePrompt: locked }
        : baseCompiled
    );
    setAiDirectorFeedback(null);
  };

  const handleDirectWithAi = async () => {
    setIsDirectingPrompt(true);
    setAiDirectorFeedback(null);
    try {
      const res = await directPromptWithAI(shot, activeEngineTab);
      setCustomPositivePrompt(activeEngineTab, res.positivePrompt, true);
      setCompiledPrompt({
        ...compiledPrompt,
        positivePrompt: res.positivePrompt,
        negativePrompt: res.negativePrompt,
      });
      if (res.negativePrompt && !shot.negativePrompt?.trim()) {
        setNegativePrompt(res.negativePrompt);
      }
      setAiDirectorFeedback(res.directorNotes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiDirectorFeedback(`AI Direction failed: ${msg}`);
    } finally {
      setIsDirectingPrompt(false);
    }
  };

  const handleSendAiPromptChat = async (overrideText?: string) => {
    const instruction = (overrideText ?? promptChatInput).trim();
    if (!instruction || isSendingPromptChat) return;
    if (!overrideText) setPromptChatInput('');
    setIsSendingPromptChat(true);
    setAiDirectorFeedback(null);

    const userMsgId = `pchat_u_${Date.now()}`;
    appendPromptChatMessage({
      id: userMsgId,
      role: 'user',
      text: instruction,
      engine: activeEngineTab,
      timestamp: Date.now(),
    });

    try {
      const historyForEngine = (shot.promptChatMessages || []).map((m) => ({
        role: m.role,
        text: m.text,
      }));
      const res = await refinePromptWithAIChat({
        shot,
        targetModelId: activeEngineTab,
        currentPositivePrompt: displayPositivePrompt,
        currentNegativePrompt: displayNegativePrompt,
        userInstruction: instruction,
        chatHistory: historyForEngine,
      });

      setCustomPositivePrompt(activeEngineTab, res.positivePrompt, true);
      setCompiledPrompt({
        ...(compiledPrompt || deterministicPrompt),
        positivePrompt: res.positivePrompt,
        negativePrompt: res.negativePrompt,
      });
      if (res.negativePrompt && res.negativePrompt !== displayNegativePrompt) {
        setNegativePrompt(res.negativePrompt);
      }

      appendPromptChatMessage({
        id: `pchat_a_${Date.now()}`,
        role: 'assistant',
        text: res.assistantReply,
        engine: activeEngineTab,
        timestamp: Date.now(),
      });
      setTimeout(() => {
        promptChatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendPromptChatMessage({
        id: `pchat_err_${Date.now()}`,
        role: 'assistant',
        text: `⚠️ تعذر الاتصال بالـ AI Reasoner: ${msg}`,
        engine: activeEngineTab,
        timestamp: Date.now(),
      });
    } finally {
      setIsSendingPromptChat(false);
    }
  };

  const handleCopyPrompt = (text: string, isNeg = false) => {
    navigator.clipboard.writeText(text);
    if (isNeg) {
      setCopiedNegative(true);
      setTimeout(() => setCopiedNegative(false), 2000);
    } else {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const activeSourcePassUrl =
    activeSourcePass === 'clay'
      ? previsClayUrl
      : activeSourcePass === 'openpose'
      ? previsOpenPoseUrl
      : activeSourcePass === 'depth'
      ? previsDepthUrl
      : activeSourcePass === 'id-mask'
      ? previsIdMaskUrl
      : previsVideoUrl;

  const compareLeftUrl = activeSourcePassUrl || previsVideoUrl || previsClayUrl;

  const currentPassUrl =
    activePassTab === 'rgb'
      ? previsVideoUrl
      : activePassTab === 'clay'
      ? previsClayUrl
      : activePassTab === 'openpose'
      ? previsOpenPoseUrl
      : activePassTab === 'depth'
      ? previsDepthUrl
      : activePassTab === 'id-mask'
      ? previsIdMaskUrl
      : activePassTab === 'comfy-final'
      ? finalComfyVideoUrl
      : finalComfyVideoUrl || compareLeftUrl;

  const currentPassLabel =
    activePassTab === 'rgb'
      ? 'RGB Viewfinder'
      : activePassTab === 'clay'
      ? 'Baked Clay Layout (Zero-Chroma)'
      : activePassTab === 'openpose'
      ? 'OpenPose Rig'
      : activePassTab === 'depth'
      ? 'Volumetric Depth'
      : activePassTab === 'id-mask'
      ? 'Object ID Segmentation Mask'
      : activePassTab === 'comfy-final'
      ? 'Final ComfyUI Render (MP4 + Audio)'
      : compareViewMode === 'wipe'
      ? 'Interactive A/B Wipe (3D Previs vs Final Render)'
      : 'Side-by-Side Sync (Previs vs Final)';

  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadTextFile = (content: string, filename: string, mimeType = 'application/json') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    downloadFile(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadActivePass = () => {
    if (!currentPassUrl) return;
    if ((activePassTab === 'comfy-final' || activePassTab === 'side-by-side') && finalComfyVideoUrl) {
      downloadFile(finalComfyVideoUrl, finalComfyFilename || `${shot.name.replace(/[^a-z0-9_-]/gi, '_')}_Final_Render.mp4`);
      return;
    }
    const sanitized = shot.name.replace(/[^a-z0-9_-]/gi, '_') || 'previs_shot';
    const tag =
      activePassTab === 'rgb'
        ? 'RGB'
        : activePassTab === 'clay'
        ? 'Clay'
        : activePassTab === 'openpose'
        ? 'OpenPose'
        : activePassTab === 'id-mask'
        ? 'IDMask'
        : 'Depth';
    downloadFile(currentPassUrl, `${sanitized}_${tag}_${selectedResolution}.mp4`);
  };

  const handleDownloadAllPasses = () => {
    const sanitized = shot.name.replace(/[^a-z0-9_-]/gi, '_') || 'previs_shot';
    if (previsVideoUrl) {
      downloadFile(previsVideoUrl, `${sanitized}_RGB_${selectedResolution}.mp4`);
    }
    if (previsClayUrl) {
      setTimeout(() => {
        downloadFile(previsClayUrl, `${sanitized}_Clay_${selectedResolution}.mp4`);
      }, 250);
    }
    if (previsOpenPoseUrl) {
      setTimeout(() => {
        downloadFile(previsOpenPoseUrl, `${sanitized}_OpenPose_${selectedResolution}.mp4`);
      }, 500);
    }
    if (previsDepthUrl) {
      setTimeout(() => {
        downloadFile(previsDepthUrl, `${sanitized}_Depth_${selectedResolution}.mp4`);
      }, 750);
    }
    if (previsIdMaskUrl) {
      setTimeout(() => {
        downloadFile(previsIdMaskUrl, `${sanitized}_IDMask_${selectedResolution}.mp4`);
      }, 1000);
    }
  };

  const handleDownloadCameraExtrinsics = () => {
    const sanitized = shot.name.replace(/[^a-z0-9_-]/gi, '_') || 'previs_shot';
    const json = exportCameraExtrinsicsJson(shot);
    downloadTextFile(json, `${sanitized}_camera_extrinsics_c2w_w2c.json`);
  };

  const handleDownloadFullBundle = () => {
    const sanitized = shot.name.replace(/[^a-z0-9_-]/gi, '_') || 'previs_shot';
    const fullBundle = {
      exportedAt: new Date().toISOString(),
      targetEngine: activeEngineTab,
      shotSpec: shot,
      compiledPrompt: {
        ...compiledPrompt,
        positivePrompt: displayPositivePrompt,
        negativePrompt: displayNegativePrompt,
      },
      cameraExtrinsics: poseBundle,
    };
    downloadTextFile(JSON.stringify(fullBundle, null, 2), `${sanitized}_${activeEngineTab}_production_pack.json`);
  };

  const availablePassCount = [
    previsVideoUrl,
    previsClayUrl,
    previsOpenPoseUrl,
    previsDepthUrl,
    previsIdMaskUrl,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-[#070a12] text-slate-200 overflow-y-auto custom-scrollbar font-sans">
      {/* Bundled ComfyUI Workflows Pack Modal */}
      <BundledWorkflowsModal
        isOpen={showWorkflowsPackModal}
        onClose={() => setShowWorkflowsPackModal(false)}
      />

      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-white/10 bg-[#0b0e18]/95 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3.5">
          {onBackToPrevis && (
            <button
              onClick={onBackToPrevis}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 hover:text-white border border-white/15 transition-colors text-xs font-medium cursor-pointer"
              title="Return to 3D Directing Stage"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Stage</span>
            </button>
          )}
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-bold shadow-[0_0_20px_rgba(245,158,11,0.35)] border border-amber-300/40 shrink-0">
            <Play className="h-4 w-4 fill-current ml-0.5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-white tracking-tight">
                Render &amp; Export
              </h1>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 font-semibold">
                {shot.name} • {shot.durationSeconds}s
              </span>
            </div>
            <p className="text-[11.5px] text-slate-400">
              Render multi-pass reference videos (RGB, OpenPose, Depth), refine prompts with AI, and export camera matrices.
            </p>
          </div>
        </div>

        {/* Engine Switcher & ComfyUI Workflows Pack */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowWorkflowsPackModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/40 text-xs font-semibold shadow-[0_0_15px_rgba(34,211,238,0.15)] transition-all cursor-pointer"
            title="Download all ComfyUI workflows used in this app (Image-to-3D, Text-to-3D, MiniMax H3 & LTX-2.5)"
          >
            <FileCode className="h-3.5 w-3.5 text-cyan-300" />
            <span>Workflows</span>
          </button>

          <span className="text-xs text-slate-400 font-medium ml-1">Engine:</span>
          <div className="flex items-center bg-[#060911] rounded-xl p-1 border border-white/15 text-xs font-medium shadow-inner">
            <button
              onClick={() => handleSelectEngine('ltx-2.5')}
              className={`flex items-center gap-1 px-3.5 py-1.5 rounded-lg transition-all font-bold cursor-pointer ${
                activeEngineTab === 'ltx-2.5'
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.35)]'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="LTX-2.5 DiT Narrative Flow (8n+1 frame cadence)"
            >
              <span>LTX-2.5</span>
              <ChevronDown className="h-3 w-3 opacity-80" />
            </button>
            <button
              onClick={() => handleSelectEngine('minimax-h3')}
              className={`px-3.5 py-1.5 rounded-lg transition-all font-semibold cursor-pointer ${
                activeEngineTab === 'minimax-h3'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.35)]'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="MiniMax H3 / Hailuo Structured Micro-Acting Formula"
            >
              MiniMax H3
            </button>
            <button
              onClick={() => handleSelectEngine('seedance')}
              className={`px-3.5 py-1.5 rounded-lg transition-all font-semibold cursor-pointer ${
                activeEngineTab === 'seedance'
                  ? 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.35)]'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Seedance 2.0 6-Axis Coordinate Trajectory & Sensor Profile"
            >
              Seedance 2.0
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="flex-1 p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
        {/* Column 1: Reference Video Output + ComfyUI Bridge + Temporal Beats + Camera Matrix (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-[#0d1222]/95 to-[#090d18]/95 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-300">
                  <Video className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Preview Video
                </h2>
              </div>

              {/* Multi-Pass Selector Tabs */}
              <div className="flex flex-wrap items-center bg-[#060911] rounded-xl p-1 border border-white/10 gap-1 text-[11px] font-medium">
                <button
                  onClick={() => setActivePassTab('rgb')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activePassTab === 'rgb'
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-black font-bold shadow-[0_0_12px_rgba(245,158,11,0.35)]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Full-color 3D Previs Plate"
                >
                  <Video className="h-3 w-3" />
                  <span>RGB Plate</span>
                  {previsVideoUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActivePassTab('clay')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activePassTab === 'clay'
                      ? 'bg-gradient-to-r from-slate-200 to-slate-400 text-black font-bold shadow-[0_0_12px_rgba(226,232,240,0.35)]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Zero-Chrominance (R=G=B) Matte Studio Clay Layout Pass — Ideal for LTX-2.5 Union IC-LoRA restyling without plastic mannequin color bleed"
                >
                  <Layers className="h-3 w-3" />
                  <span>Clay</span>
                  {previsClayUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActivePassTab('openpose')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activePassTab === 'openpose'
                      ? 'bg-emerald-500 text-black font-bold shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="OpenPose 2D/3D Skeleton Pass"
                >
                  <Target className="h-3 w-3" />
                  <span>Pose</span>
                  {previsOpenPoseUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActivePassTab('depth')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activePassTab === 'depth'
                      ? 'bg-cyan-500 text-black font-bold shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Layers className="h-3 w-3" />
                  <span>Depth</span>
                  {previsDepthUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActivePassTab('id-mask')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activePassTab === 'id-mask'
                      ? 'bg-rose-500 text-white font-bold shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Cryptomatte-style per-subject Object ID Segmentation Mask (#EF4444, #22C55E, #3B82F6 on #000000)"
                >
                  <Layers className="h-3 w-3" />
                  <span>Mask</span>
                  {previsIdMaskUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActivePassTab('comfy-final')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activePassTab === 'comfy-final'
                      ? 'bg-indigo-500 text-white font-bold shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Final ComfyUI Render Output"
                >
                  <Zap className="h-3 w-3" />
                  <span>Final</span>
                  {finalComfyVideoUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
                <button
                  onClick={() => setActivePassTab('side-by-side')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activePassTab === 'side-by-side'
                      ? 'bg-gradient-to-r from-amber-500 to-indigo-500 text-white font-bold shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Columns className="h-3 w-3" />
                  <span>Compare</span>
                  {compareLeftUrl && finalComfyVideoUrl && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </button>
              </div>
            </div>

            {/* Video Viewport / Player */}
            <div className="relative rounded-2xl overflow-hidden bg-[#050811] border border-cyan-500/20 aspect-video flex items-center justify-center group shadow-inner">
              {activePassTab === 'side-by-side' ? (
                compareViewMode === 'wipe' ? (
                  <div
                    ref={wipeViewportRef}
                    className="relative w-full h-full bg-[#080a0f] select-none overflow-hidden"
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest('button, input')) return;
                      isDraggingWipeRef.current = true;
                      const rect = e.currentTarget.getBoundingClientRect();
                      if (rect.width > 0) {
                        const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                        setWipePercent(Math.round(pct));
                      }
                    }}
                    onPointerMove={(e) => {
                      if (!isDraggingWipeRef.current) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      if (rect.width > 0) {
                        const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                        setWipePercent(Math.round(pct));
                      }
                    }}
                    onPointerUp={() => {
                      isDraggingWipeRef.current = false;
                    }}
                    onPointerLeave={() => {
                      isDraggingWipeRef.current = false;
                    }}
                  >
                    {/* Base Layer (Right side of curtain): Final ComfyUI Render */}
                    <div className="absolute inset-0 flex items-center justify-center bg-[#080a0f]">
                      {finalComfyVideoUrl ? (
                        <video
                          ref={syncRightVideoRef}
                          key={`wipe-right-${finalComfyVideoUrl}`}
                          src={finalComfyVideoUrl}
                          loop
                          autoPlay
                          muted
                          playsInline
                          onPlay={() => syncLeftVideoRef.current?.play().catch(() => {})}
                          onPause={() => syncLeftVideoRef.current?.pause()}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-6 text-[11px] font-mono text-slate-400">
                          Click <strong>&quot;Render in ComfyUI&quot;</strong> or <strong>&quot;Load Latest ComfyUI Render&quot;</strong> below to compare on the right side of the curtain.
                        </div>
                      )}
                    </div>

                    {/* Top Clipped Layer (Left side of curtain): 3D Previs (<Video 1>) */}
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-[#080a0f]"
                      style={{ clipPath: `inset(0 ${100 - wipePercent}% 0 0)` }}
                    >
                      {compareLeftUrl ? (
                        <video
                          ref={syncLeftVideoRef}
                          key={`wipe-left-${compareLeftUrl}`}
                          src={compareLeftUrl}
                          loop
                          autoPlay
                          muted
                          playsInline
                          onPlay={() => syncRightVideoRef.current?.play().catch(() => {})}
                          onPause={() => syncRightVideoRef.current?.pause()}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-6 text-[11px] font-mono text-slate-400">
                          Click <strong>&quot;Render Preview&quot;</strong> below to populate the left 3D Previs layer.
                        </div>
                      )}
                    </div>

                    {/* Vertical Wipe Divider Line & Handle */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-400 via-white to-indigo-400 shadow-[0_0_12px_rgba(251,191,36,0.85)] pointer-events-none"
                      style={{ left: `${wipePercent}%` }}
                    >
                      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/90 border-2 border-amber-400 text-amber-300 shadow-lg flex items-center justify-center text-[10px] font-mono font-bold">
                        ◄►
                      </div>
                    </div>

                    {/* Left & Right Corner Badges */}
                    <div className="absolute bottom-11 left-3 px-2 py-0.5 rounded bg-black/80 border border-amber-500/40 text-[9px] font-mono text-amber-300 font-bold pointer-events-none">
                      ◄ 1. 3D {activeSourcePass.toUpperCase()} PREVIS (&lt;Video 1&gt;) • {wipePercent}%
                    </div>
                    <div className="absolute bottom-11 right-3 px-2 py-0.5 rounded bg-black/80 border border-indigo-500/40 text-[9px] font-mono text-indigo-300 font-bold pointer-events-none">
                      2. {activeEngineTab === 'ltx-2.5' ? 'LTX-2.5' : 'MINIMAX H3'} FINAL ({100 - wipePercent}%) ►
                    </div>

                    {/* Top-Right Mode Switcher (A/B Wipe vs Split 2-Up) */}
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-black/80 backdrop-blur-md p-1 rounded-lg border border-white/15 text-[10px] font-mono">
                      <button
                        type="button"
                        onClick={() => setCompareViewMode('wipe')}
                        className="px-2 py-0.5 rounded bg-amber-500 text-black font-bold cursor-pointer"
                      >
                        A/B Wipe
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompareViewMode('split')}
                        className="px-2 py-0.5 rounded text-slate-300 hover:text-white cursor-pointer"
                      >
                        Split 2-Up
                      </button>
                    </div>

                    {/* Bottom Scrubber Bar + Sync Play */}
                    <div className="absolute bottom-2 left-3 right-3 z-10 flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/15">
                      <span className="text-[9px] font-mono text-amber-300 font-bold shrink-0">PREVIS</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={wipePercent}
                        onChange={(e) => setWipePercent(Number(e.target.value))}
                        aria-label="A/B Wipe Curtain Position"
                        className="flex-1 accent-amber-400 h-1.5 bg-white/15 rounded-lg cursor-ew-resize"
                      />
                      <span className="text-[9px] font-mono text-indigo-300 font-bold shrink-0">FINAL</span>
                      {compareLeftUrl && finalComfyVideoUrl && (
                        <button
                          type="button"
                          onClick={handleSyncRestartBoth}
                          className="px-2.5 py-0.5 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold border border-white/20 flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          <span>Sync Play</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full h-full grid grid-cols-2 gap-1 bg-black p-1">
                    {/* Top-Right Mode Switcher (A/B Wipe vs Split 2-Up) */}
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-black/80 backdrop-blur-md p-1 rounded-lg border border-white/15 text-[10px] font-mono">
                      <button
                        type="button"
                        onClick={() => setCompareViewMode('wipe')}
                        className="px-2 py-0.5 rounded text-slate-300 hover:text-white cursor-pointer"
                      >
                        A/B Wipe
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompareViewMode('split')}
                        className="px-2 py-0.5 rounded bg-indigo-500 text-white font-bold cursor-pointer"
                      >
                        Split 2-Up
                      </button>
                    </div>
                    {/* Left: 3D Previs */}
                    <div className="relative rounded-lg overflow-hidden bg-[#080a0f] border border-amber-500/30 flex items-center justify-center">
                      {compareLeftUrl ? (
                        <video
                          ref={syncLeftVideoRef}
                          key={compareLeftUrl}
                          src={compareLeftUrl}
                          controls
                          loop
                          autoPlay
                          muted
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-4 text-[11px] font-mono text-slate-400">
                          Click <strong>&quot;Render Preview&quot;</strong> below to populate left 3D Previs plate.
                        </div>
                      )}
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-amber-500/40 text-[9px] font-mono text-amber-300 font-bold">
                        1. 3D {activeSourcePass.toUpperCase()} PREVIS (&lt;Video 1&gt;)
                      </div>
                    </div>
                    {/* Right: Final ComfyUI Render */}
                    <div className="relative rounded-lg overflow-hidden bg-[#080a0f] border border-indigo-500/40 flex items-center justify-center">
                      {finalComfyVideoUrl ? (
                        <video
                          ref={syncRightVideoRef}
                          key={finalComfyVideoUrl}
                          src={finalComfyVideoUrl}
                          controls
                          loop
                          autoPlay
                          muted
                          playsInline
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center p-4 text-[11px] font-mono text-slate-400">
                          Click <strong>&quot;Render in ComfyUI&quot;</strong> or <strong>&quot;Load Latest ComfyUI Render&quot;</strong> below.
                        </div>
                      )}
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-indigo-500/40 text-[9px] font-mono text-indigo-300 font-bold">
                        2. {activeEngineTab === 'ltx-2.5' ? 'LTX-2.5' : 'MINIMAX H3'} FINAL RENDER ({finalComfyFilename || 'ComfyUI'})
                      </div>
                    </div>
                    {compareLeftUrl && finalComfyVideoUrl && (
                      <button
                        onClick={handleSyncRestartBoth}
                        className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold shadow-lg border border-white/20 flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Sync Play</span>
                      </button>
                    )}
                  </div>
                )
              ) : currentPassUrl ? (
                <video
                  key={currentPassUrl}
                  src={currentPassUrl}
                  controls
                  loop
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : isRenderingPrevis ? (
                <div className="flex flex-col items-center gap-3 p-6 text-center z-10">
                  <div className="relative">
                    <div className="h-14 w-14 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-mono font-bold text-amber-300">
                      {Math.round(previsProgress)}%
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      Rendering 3D Previs ({renderPassMode.toUpperCase()})...
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Encoding frame canvases at 24fps via WebCodecs MP4 muxer
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-full flex flex-col items-center justify-center gap-3.5 p-6 text-center overflow-hidden">
                  {/* Ambient Aurora Corner Glows + Decorative Wave */}
                  <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-fuchsia-600/15 blur-3xl" />
                  <svg
                    viewBox="0 0 400 120"
                    className="pointer-events-none absolute bottom-0 right-0 w-72 h-28 opacity-55"
                    fill="none"
                  >
                    <path
                      d="M120 120 C 210 100, 260 30, 400 20"
                      stroke="url(#previewWaveGrad)"
                      strokeWidth="2"
                    />
                    <defs>
                      <linearGradient id="previewWaveGrad" x1="120" y1="120" x2="400" y2="20" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="rgba(56,189,248,0)" />
                        <stop offset="50%" stopColor="rgba(168,85,247,0.75)" />
                        <stop offset="100%" stopColor="rgba(236,72,153,0.9)" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {/* 3D Rendered Amber Film Artwork with Orbiting Ring */}
                  <div className="relative flex items-center justify-center select-none pointer-events-none">
                    <img
                      src="./images/preview-video-hero.png"
                      alt="No Render Yet"
                      className="w-36 h-auto object-contain drop-shadow-[0_0_30px_rgba(245,158,11,0.28)]"
                    />
                  </div>
                  <div className="z-10">
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      No Render Yet
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mt-1">
                      Select a render pass above and click <strong>&quot;Render Preview&quot;</strong> to generate a video.
                    </p>
                  </div>
                </div>
              )}

              {/* Resolution & Active Pass Badge (shown when video is loaded or rendering) */}
              {(currentPassUrl || isRenderingPrevis || activePassTab === 'side-by-side') && (
                <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/15 text-[9.5px] font-mono text-slate-300 flex items-center gap-1.5">
                  <span className="font-bold text-amber-400">{currentPassLabel.toUpperCase()}</span>
                  <span>•</span>
                  <span>{selectedResolution}</span>
                  <span>•</span>
                  <span>{shot.aspectRatio}</span>
                  <span>•</span>
                  <span className={backdropDecision.hide ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
                    {backdropDecision.reason}
                  </span>
                </div>
              )}
            </div>

            {/* Render & Download Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              {/* Pass Mode, Stage Backdrop Mode & Resolution Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Pass:</span>
                  <select
                    value={renderPassMode}
                    onChange={(e) => setRenderPassMode(e.target.value as any)}
                    className="bg-[#060911] border border-white/15 hover:border-white/25 rounded-xl px-3 py-2 text-xs font-medium text-slate-100 focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="all">All Passes (RGB + Clay + Pose + Depth + Mask)</option>
                    <option value="rgb">RGB Viewfinder Only</option>
                    <option value="clay">Clay Layout Only (Zero-Chroma)</option>
                    <option value="openpose">OpenPose Rig Only</option>
                    <option value="depth">Volumetric Depth Only</option>
                    <option value="id-mask">Object ID Mask Only</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Stage BG:</span>
                  <select
                    value={backdropDecision.mode}
                    onChange={(e) => {
                      const nextMode = e.target.value as 'auto' | 'hide-stage' | 'show-stage';
                      setEnvironment({
                        ...(shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec),
                        previsStageMode: nextMode,
                        visibleInPrevis: nextMode !== 'hide-stage',
                      });
                      setPrevisVideo(undefined, undefined);
                    }}
                    title="Control whether the #334155 3D studio floor & walls appear in <Video 1> (Auto hides them when <Picture 4> or an outdoor/aerial environment is active)"
                    className={`bg-[#060911] border rounded-xl px-3 py-2 text-xs font-medium focus:outline-none cursor-pointer ${
                      backdropDecision.hide
                        ? 'border-emerald-500/40 text-emerald-300 focus:border-emerald-400'
                        : 'border-white/15 text-slate-100 focus:border-amber-400'
                    }`}
                  >
                    <option value="auto">
                      {backdropDecision.hide ? 'Auto (Clean BG — Hide Studio Floor)' : '3D Studio Floor & Walls (Auto)'}
                    </option>
                    <option value="hide-stage">Clean BG (Actors &amp; Camera Only)</option>
                    <option value="show-stage">3D Studio Floor &amp; Walls</option>
                  </select>
                </div>

                <div className="flex items-center bg-[#060911] border border-white/15 rounded-xl p-0.5">
                  <button
                    onClick={() => setSelectedResolution('720p')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      selectedResolution === '720p'
                        ? 'bg-indigo-500/25 text-white border border-indigo-400/40 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    720p
                  </button>
                  <button
                    onClick={() => setSelectedResolution('1080p')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      selectedResolution === '1080p'
                        ? 'bg-indigo-500/25 text-white border border-indigo-400/40 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    1080p
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => renderPrevisVideo(renderPassMode, selectedResolution)}
                  disabled={isRenderingPrevis}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-black font-bold text-xs shadow-[0_0_20px_rgba(245,158,11,0.35)] disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isRenderingPrevis ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                      <span>Rendering ({Math.round(previsProgress)}%)...</span>
                    </>
                  ) : currentPassUrl ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Re-Render</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Render Preview</span>
                    </>
                  )}
                </button>

                {currentPassUrl && (
                  <button
                    onClick={handleDownloadActivePass}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                    title={`Download ${currentPassLabel} MP4`}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>
                      Download{' '}
                      {activePassTab === 'rgb'
                        ? 'RGB'
                        : activePassTab === 'clay'
                        ? 'Clay'
                        : activePassTab === 'openpose'
                        ? 'Pose'
                        : activePassTab === 'depth'
                        ? 'Depth'
                        : activePassTab === 'id-mask'
                        ? 'ID Mask'
                        : 'Final Render'}{' '}
                      MP4
                    </span>
                  </button>
                )}

                {availablePassCount > 1 && (
                  <button
                    onClick={handleDownloadAllPasses}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 border border-white/15 font-mono text-xs font-semibold transition-all cursor-pointer"
                    title="Download all generated MP4 passes sequentially"
                  >
                    <Download className="h-3.5 w-3.5 text-amber-400" />
                    <span>All ({availablePassCount})</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Live ComfyUI Render Bridge Card */}
          <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-[#0e1224] via-[#0b0f1c] to-[#121024] p-5 shadow-xl flex flex-col gap-3.5">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.25)] shrink-0">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white tracking-tight">
                        ComfyUI Render Bridge
                      </h3>
                      <button
                        type="button"
                        onClick={() => probeComfyHealth()}
                        title="Click to test & reconnect to ComfyUI at 127.0.0.1:8188"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                          comfyOnline
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${comfyOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        <span>{comfyOnline ? 'ONLINE' : comfyGpuLabel}</span>
                      </button>
                      {comfyOnline && (
                        <>
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-semibold">
                            CUDA • {storeSystemStats?.gpuName || comfyGpuLabel.split('(')[0].trim()}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-semibold">
                            VRAM {storeSystemStats?.vramTotalGb || 24}GB
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>Active Workflow:</span>
                      <span className="text-slate-200 font-semibold">
                        {activeWorkflowChoice.shortLabel}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span>{activeWorkflowChoice.description}</span>
                      <span className="text-slate-600">|</span>
                      <span>4 Ref Images</span>
                      <span className="text-slate-600">|</span>
                      <span>{activeEngineTab === 'ltx-2.5' ? 'Node 15' : 'Node 155'}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="flex flex-wrap items-center gap-2.5">
                <a
                  href={`./workflows/${
                    activeWorkflowChoice.uiFilename ||
                    (activeEngineTab === 'ltx-2.5' ? 'Stubelius_Ultimate_LTX.json' : 'Stubelius_Ultimate_H3.json')
                  }`}
                  download={
                    activeWorkflowChoice.uiFilename ||
                    (activeEngineTab === 'ltx-2.5' ? 'Stubelius_Ultimate_LTX.json' : 'Stubelius_Ultimate_H3.json')
                  }
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 border border-amber-400/40 text-xs font-semibold transition-all cursor-pointer"
                  title={`Download the active ${
                    activeEngineTab === 'ltx-2.5' ? 'LTX-2.5' : 'MiniMax H3'
                  } ComfyUI workflow (.json) to drag-and-drop into ComfyUI`}
                >
                  <Download className="h-3.5 w-3.5 text-amber-400" />
                  <span>{activeEngineTab === 'ltx-2.5' ? 'LTX Workflow JSON' : 'MiniMax Workflow JSON'}</span>
                </a>
                <button
                  type="button"
                  onClick={handleLoadLatestComfyRender}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/15 text-xs font-semibold transition-all cursor-pointer"
                  title="Load the most recent completed render from ComfyUI /history into the player"
                >
                  <Columns className="h-3.5 w-3.5 text-indigo-300" />
                  <span>Load Latest</span>
                </button>
                <button
                  type="button"
                  onClick={handleRenderInComfyUI}
                  disabled={
                    isSubmittingComfy ||
                    activeJob?.status === 'executing' ||
                    activeJob?.status === 'queued'
                  }
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-xs shadow-[0_0_20px_rgba(99,102,241,0.4)] disabled:opacity-50 transition-all cursor-pointer"
                  title={`Auto-upload 3D ${activeSourcePass.toUpperCase()} Previs MP4 + Reference Images and execute the selected workflow in ComfyUI`}
                >
                  {isSubmittingComfy ||
                  activeJob?.status === 'executing' ||
                  activeJob?.status === 'queued' ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Executing in ComfyUI...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5 fill-current" />
                      <span>
                        Render in ComfyUI (
                        {activeSourcePass === 'clay'
                          ? 'Clay'
                          : activeSourcePass === 'rgb'
                          ? 'RGB'
                          : activeSourcePass === 'openpose'
                          ? 'Pose'
                          : activeSourcePass === 'depth'
                          ? 'Depth'
                          : 'Mask'}
                        )
                      </span>
                    </>
                  )}
                </button>
                {(isSubmittingComfy ||
                  activeJob?.status === 'executing' ||
                  activeJob?.status === 'queued') && (
                  <button
                    type="button"
                    onClick={handleStopComfyRender}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-500/40 text-xs font-bold shadow-lg shadow-rose-500/15 transition-all cursor-pointer"
                    title="Immediately interrupt and stop the current render in ComfyUI (/interrupt)"
                  >
                    <Square className="h-3 w-3 fill-current text-rose-400" />
                    <span>Stop Render</span>
                  </button>
                )}
              </div>
            </div>

            {/* Workflow Library Selector + Add Workflow by URL Bar + Smart Workflow Quick Settings + Live Render Progress Banner */}
            <CustomWorkflowConfigBar
              compact
              engine={activeEngineTab === 'ltx-2.5' ? 'ltx-2.5' : 'minimax-h3'}
              onWorkflowChanged={(choice) => setActiveWorkflowChoice(choice)}
            >
              {/* Smart Workflow Quick Settings Bar (Auto-Tune per Engine × Workflow × Video Pass) */}
              <div className="rounded-xl border border-white/10 bg-[#050811]/90 p-3 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      <span>Workflow Quick Settings</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9.5px] font-mono font-bold border ${
                        isWorkflowAutoTune
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                      }`}
                      title={wfPresetSummary}
                    >
                      {isWorkflowAutoTune ? `✨ Auto-Tuned: ${wfPresetSummary}` : '⚙️ Custom Manual Override'}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-200 border border-indigo-400/30 text-[9px] font-mono font-semibold"
                      title="Automatic ComfyUI Video Save Node & Fallback Output Node bound for this workflow"
                    >
                      🎯 {wfSaveNodeBadge}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-200 border border-cyan-400/25 text-[9px] font-mono"
                      title="Control Video Input Node bound for this workflow"
                    >
                      🔗 {wfInputNodeBadge}
                    </span>
                    {activeSourcePass !== wfRecommendedPass && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSourcePass(wfRecommendedPass);
                          setActivePassTab(wfRecommendedPass);
                        }}
                        className="px-2 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 text-[9px] font-mono font-bold transition-all cursor-pointer"
                        title={`Switch to the recommended source pass (${wfRecommendedPass.toUpperCase()}) for this workflow`}
                      >
                        💡 Recommended Pass: {wfRecommendedPass.toUpperCase()} (Click to Apply)
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsWorkflowAutoTune((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                        isWorkflowAutoTune
                          ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30'
                          : 'bg-white/[0.06] text-slate-300 border-white/15 hover:text-white'
                      }`}
                      title="When Auto-Tune is ON, switching the Video Pass tab (Clay / RGB / Depth / Pose) or Workflow automatically sets the scientifically optimal Steps, Control Strength, Scale, and Reference Mode."
                    >
                      Auto-Tune: {isWorkflowAutoTune ? 'ON' : 'OFF'}
                    </button>
                    {!isWorkflowAutoTune && (
                      <button
                        type="button"
                        onClick={handleResetWorkflowToOptimal}
                        className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/35 text-[10px] font-mono font-semibold transition-all cursor-pointer flex items-center gap-1"
                        title="Reset workflow settings to the optimal values for the active Engine, Workflow, and Video Pass"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        <span>Reset Optimal</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 5 Non-Destructive Controls Row: Video Pass to Send | Steps | Control Strength | Structure Scale | Reference Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 text-[10.5px]">
                  {/* 1. Source Video Pass Routing */}
                  <div className="rounded-lg bg-[#0b0f1c] border border-white/10 px-2.5 py-1.5 flex flex-col justify-between gap-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Send Video Pass</span>
                      <span className="font-mono text-[9.5px] text-cyan-300 font-bold">
                        &lt;Video 1&gt;
                      </span>
                    </div>
                    <select
                      aria-label="Send Video Pass to ComfyUI"
                      value={activeSourcePass}
                      onChange={(e) => {
                        const nextPass = e.target.value as PrevisSourcePass;
                        setActiveSourcePass(nextPass);
                        setActivePassTab(nextPass);
                      }}
                      className="bg-[#060911] border border-white/15 rounded-md px-2 py-1 text-[11px] font-semibold text-white focus:outline-none focus:border-cyan-400 cursor-pointer"
                    >
                      <option value="clay">Clay (Zero-Chroma)</option>
                      <option value="rgb">RGB Plate (Colored)</option>
                      <option value="depth">Depth Map</option>
                      <option value="openpose">OpenPose Skeleton</option>
                      <option value="id-mask">Object ID Mask</option>
                    </select>
                  </div>

                  {/* 2. Steps */}
                  <div className="rounded-lg bg-[#0b0f1c] border border-white/10 px-2.5 py-1.5 flex flex-col justify-between gap-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Sampling Steps</span>
                      <span className="font-mono text-[10.5px] text-amber-300 font-bold">{wfSteps}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="range"
                        aria-label="Workflow Sampling Steps"
                        min={4}
                        max={20}
                        step={1}
                        value={wfSteps}
                        onChange={(e) => {
                          setIsWorkflowAutoTune(false);
                          setWfSteps(Number(e.target.value));
                        }}
                        className="flex-1 accent-amber-400 h-1.5 bg-white/15 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* 3. Control / IC-LoRA Strength */}
                  <div className="rounded-lg bg-[#0b0f1c] border border-white/10 px-2.5 py-1.5 flex flex-col justify-between gap-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>{activeEngineTab === 'ltx-2.5' ? 'IC-LoRA Strength' : 'Control Strength'}</span>
                      <span className="font-mono text-[10.5px] text-indigo-300 font-bold">
                        {wfControlStrength.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="range"
                        aria-label="Workflow Control Strength"
                        min={0.3}
                        max={1.0}
                        step={0.05}
                        value={wfControlStrength}
                        onChange={(e) => {
                          setIsWorkflowAutoTune(false);
                          setWfControlStrength(Number(e.target.value));
                        }}
                        className="flex-1 accent-indigo-400 h-1.5 bg-white/15 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* 4. Structure Scale / Resolution Scale */}
                  <div className="rounded-lg bg-[#0b0f1c] border border-white/10 px-2.5 py-1.5 flex flex-col justify-between gap-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>{activeEngineTab === 'ltx-2.5' ? 'First-Pass Scale' : 'Base Megapixels'}</span>
                      <span className="font-mono text-[10px] text-emerald-300 font-bold">
                        {activeEngineTab === 'ltx-2.5' ? `${wfFirstPassScale}x` : `${wfFirstPassScale} MP`}
                      </span>
                    </div>
                    {activeEngineTab === 'ltx-2.5' ? (
                      <select
                        aria-label="LTX First Pass Scale"
                        value={String(wfFirstPassScale)}
                        onChange={(e) => {
                          setIsWorkflowAutoTune(false);
                          setWfFirstPassScale(Number(e.target.value));
                        }}
                        title="1.00x renders full 1280×704 in a single pass and uses RTX VSR for 1080p (prevents 2nd-pass 20.4GB LTXAV reload & VRAM overflow on 24GB GPUs). 0.50x runs a 2-pass x2 latent refine."
                        className="bg-[#060911] border border-white/15 rounded-md px-2 py-1 text-[11px] font-semibold text-white focus:outline-none focus:border-emerald-400 cursor-pointer"
                      >
                        <option value="1">1.00x (Single-Pass + RTX VSR • 24GB Safe)</option>
                        <option value="0.5">0.50x (2-Pass x2 Refine • High VRAM)</option>
                      </select>
                    ) : (
                      <select
                        aria-label="MiniMax Base Megapixels"
                        value={String(wfFirstPassScale)}
                        onChange={(e) => {
                          setIsWorkflowAutoTune(false);
                          setWfFirstPassScale(Number(e.target.value));
                        }}
                        className="bg-[#060911] border border-white/15 rounded-md px-2 py-1 text-[11px] font-semibold text-white focus:outline-none focus:border-emerald-400 cursor-pointer"
                      >
                        <option value="0.5">0.50 MP (Fast Draft)</option>
                        <option value="0.8">0.80 MP (HD Optimal)</option>
                        <option value="1">1.00 MP (Max Detail)</option>
                      </select>
                    )}
                  </div>

                  {/* 5. Reference Mode: OFF / ON */}
                  <div className="rounded-lg bg-[#0b0f1c] border border-white/10 px-2.5 py-1.5 flex flex-col justify-between gap-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Reference Mode</span>
                      <span
                        className={`font-mono text-[10px] font-bold ${
                          wfReferenceMode === 'ON' ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {wfReferenceMode}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 bg-[#060911] p-0.5 rounded-md border border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          setIsWorkflowAutoTune(false);
                          setWfReferenceMode('OFF');
                        }}
                        title={
                          activeEngineTab === 'ltx-2.5'
                            ? 'OFF (Recommended for 3D Previs): Disables Ghost Mask frame-lock so LTX-2.5 generates photorealistic skin, fabric, and lighting instead of copying the 3D mannequin.'
                            : 'OFF: Normal I2V/T2V mode without VLM multi-reference identity lock.'
                        }
                        className={`py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                          wfReferenceMode === 'OFF'
                            ? 'bg-amber-500 text-black shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        OFF
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsWorkflowAutoTune(false);
                          setWfReferenceMode('ON');
                        }}
                        title={
                          activeEngineTab === 'ltx-2.5'
                            ? 'ON (Licon MSR): Locks onto reference image appearance frames.'
                            : 'ON (Smart Ref2V): Uses Qwen3-VL + 4 Reference Images (<Picture 1..4>) to lock character and environment identity.'
                        }
                        className={`py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                          wfReferenceMode === 'ON'
                            ? 'bg-emerald-500 text-black shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        ON
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {(comfyStatusText || comfyErrorText || finalComfyFilename) && (
                <div
                  className={`rounded-xl border px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono ${
                    comfyErrorText
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {comfyErrorText ? (
                      <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    ) : isSubmittingComfy ||
                      activeJob?.status === 'executing' ||
                      activeJob?.status === 'queued' ? (
                      <RefreshCw className="h-3.5 w-3.5 text-indigo-400 animate-spin shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span>
                      {comfyErrorText ||
                        comfyStatusText ||
                        `Latest ComfyUI Render Ready: ${finalComfyFilename} (${finalComfyMeta})`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(isSubmittingComfy ||
                      activeJob?.status === 'executing' ||
                      activeJob?.status === 'queued') && (
                      <button
                        type="button"
                        onClick={handleStopComfyRender}
                        className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 text-[10px] font-bold border border-rose-400/40 cursor-pointer"
                        title="Stop the running render in ComfyUI"
                      >
                        <Square className="h-2.5 w-2.5 fill-current text-rose-400" />
                        <span>Stop Render</span>
                      </button>
                    )}
                    {finalComfyVideoUrl && (
                      <>
                        <span className="px-2 py-0.5 rounded bg-black/50 text-slate-300 text-[9.5px] font-mono border border-white/10">
                          📁 D:\ComfyUI\output\{finalComfyFilename}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActivePassTab('side-by-side')}
                          className="px-2 py-0.5 rounded bg-indigo-500/30 hover:bg-indigo-500/50 text-white text-[10px] font-bold border border-indigo-400/40 cursor-pointer"
                        >
                          View Side-by-Side
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadFile(finalComfyVideoUrl, finalComfyFilename || 'minimax_h3_output.mp4')}
                          className="px-2 py-0.5 rounded bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 text-[10px] font-bold border border-emerald-400/40 cursor-pointer"
                        >
                          Download Final MP4
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CustomWorkflowConfigBar>

            {/* Collapsible Engine-Specific Workflow Setup & Required Models Guide */}
            <details className="rounded-xl bg-[#070a14] border border-white/10 px-3.5 py-2.5 text-[11px] text-slate-300">
              <summary className="cursor-pointer font-semibold text-amber-200 hover:text-white select-none">
                {activeEngineTab === 'ltx-2.5'
                  ? '⚡ First-time rendering LTX-2.5? Click here for Stubelius Ultimate LTX 2.5 Workflow & Model Setup'
                  : '⚡ First-time rendering MiniMax H3? Click here for Stubelius Ultimate H3 Workflow & Model Setup'}
              </summary>
              {activeEngineTab === 'ltx-2.5' ? (
                <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5 text-slate-300 leading-relaxed">
                  <div>
                    <span className="text-amber-300 font-bold">1. Install Stubelius Ultimate LTX 2.5 Custom Node &amp; Workflow:</span> Install{' '}
                    <a
                      href="https://github.com/stuubszzz/Stubelius-Ultimate-LTX2.5"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 underline hover:text-indigo-200 font-semibold"
                    >
                      stuubszzz/Stubelius-Ultimate-LTX2.5
                    </a>{' '}
                    into <code className="text-slate-200">ComfyUI/custom_nodes/</code>, or use Auto-Sync above to copy all LTX-2.5 workflows into ComfyUI (<code className="text-indigo-300">http://127.0.0.1:8188</code>).
                  </div>
                  <div>
                    <span className="text-emerald-300 font-bold">2. Required LTX-2.5 Model Weights</span> in <code className="text-white">ComfyUI/models/</code>:
                    <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-400">
                      <li>
                        <code className="text-slate-200">models/diffusion_models/LTX2.5/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors</code>
                      </li>
                      <li>
                        <code className="text-slate-200">models/text_encoders/LTX2.5/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors</code>
                      </li>
                      <li>
                        <code className="text-slate-200">models/loras/LTX2.5/ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors</code> (IC-LoRA Control Video)
                      </li>
                      <li>
                        <code className="text-slate-200">models/vae/LTX2.5/ltx-2.5-video-vae-bf16.safetensors</code> &amp;{' '}
                        <code className="text-slate-200">ltx-2.5-audio-vae-bf16.safetensors</code>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5 text-slate-300 leading-relaxed">
                  <div>
                    <span className="text-amber-300 font-bold">1. Install Stubelius Ultimate H3 Custom Node &amp; Workflow:</span> Install{' '}
                    <a
                      href="https://github.com/stuubszzz/Stubelius-Ultimate-H3"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 underline hover:text-indigo-200 font-semibold"
                    >
                      stuubszzz/Stubelius-Ultimate-H3
                    </a>{' '}
                    via ComfyUI Manager (or clone into <code className="text-slate-200">ComfyUI/custom_nodes/</code>), or use Auto-Sync above to copy all MiniMax H3 workflows into ComfyUI (<code className="text-indigo-300">http://127.0.0.1:8188</code>).
                  </div>
                  <div>
                    <span className="text-emerald-300 font-bold">2. Download Required MiniMax H3 Model Weights</span> from{' '}
                    <a
                      href="https://huggingface.co/Comfy-Org/MiniMax-H3"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 underline hover:text-indigo-200"
                    >
                      huggingface.co/Comfy-Org/MiniMax-H3
                    </a>{' '}
                    into your <code className="text-white">ComfyUI/models/</code> directory:
                    <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-400">
                      <li>
                        <code className="text-slate-200">models/diffusion_models/Minimax h3/minimax_h3_ref2va_pruned_int8_convrot.safetensors</code> (Ref2VA Model)
                      </li>
                      <li>
                        <code className="text-slate-200">models/diffusion_models/Minimax h3/minimax_h3_fl2va_pruned_int8_convrot.safetensors</code> (FL2VA Model)
                      </li>
                      <li>
                        <code className="text-slate-200">models/text_encoders/Minimax h3/qwen3vl_32b_minimax_h3_int8_convrot.safetensors</code> (Text Encoder)
                      </li>
                      <li>
                        <code className="text-slate-200">models/loras/MiniMax H3/MiniMax-H3-Ref2VA-Acc-8Step.safetensors</code> (8-Step Speedup LoRA)
                      </li>
                      <li>
                        <code className="text-slate-200">models/vae/minimax/minimax_h3_video_vae_fp16.safetensors</code> &amp;{' '}
                        <code className="text-slate-200">minimax_h3_audio_vae_fp32.safetensors</code>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </details>

            {/* 4 Required Reference Image Slots (<picture 1> to <picture 4> -> Nodes 137, 139, 144, 151) + Seed */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-1">
              {[0, 1, 2, 3].map((idx) => {
                const nodeIds = ['137', '139', '144', '151'];
                const targetVal = refSlotTargets[idx];
                const mappedActor =
                  targetVal && targetVal !== 'environment' && targetVal !== 'custom'
                    ? shot.actors.find((a) => a.id === targetVal)
                    : undefined;
                const displayObjectTitle =
                  targetVal === 'environment'
                    ? `🌍 Set: ${shot.environment?.name || 'Alley / Studio Set'}`
                    : mappedActor
                    ? `${mappedActor.kind === 'human' || mappedActor.kind === 'character' ? '👤 Character' : `📦 ${mappedActor.kind || 'Object'}`}: ${mappedActor.name}`
                    : `🖼️ Custom Reference ${idx + 1}`;
                const thumbUrl =
                  targetVal === 'environment'
                    ? shot.environment?.conceptImageUrl || null
                    : mappedActor
                    ? mappedActor.conceptImageUrl || null
                    : refImageThumbs[idx] || null;

                return (
                  <div
                    key={`${shot.id}-refslot-${idx}`}
                    className="rounded-xl bg-black/60 border border-white/15 p-2.5 flex flex-col gap-1.5"
                  >
                    {/* Prominent Object / Character Title + Slot Badge */}
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="text-[10.5px] font-bold text-white truncate"
                        title={displayObjectTitle}
                      >
                        {displayObjectTitle}
                      </span>
                      <span className="text-[8.5px] font-mono text-indigo-300 bg-indigo-500/15 border border-indigo-400/30 px-1.5 py-0.2 rounded shrink-0">
                        {activeEngineTab === 'ltx-2.5' ? `@ref${idx + 1} #7` : `<pic ${idx + 1}> #${nodeIds[idx]}`}
                      </span>
                    </div>

                    {/* Dropdown to pick which Stage Object / Character / Set maps to this <picture 1..4> slot */}
                    <select
                      value={targetVal}
                      onChange={(e) => {
                        const newTarget = e.target.value;
                        const nextTargets = [...refSlotTargets] as [string, string, string, string];
                        nextTargets[idx] = newTarget;
                        slotTargetsByShotRef.current[shot.id] = nextTargets;
                        setRefSlotTargets(nextTargets);

                        const defaultPlaceholder = `char${idx + 1}.png`;
                        const nextThumbs = [...refImageThumbs] as [string | null, string | null, string | null, string | null];
                        const nextNames = [...refImageNames] as [string, string, string, string];
                        const nextFiles = [...refImageFiles] as [File | null, File | null, File | null, File | null];

                        if (newTarget === 'environment') {
                          nextThumbs[idx] = shot.environment?.conceptImageUrl || null;
                          nextNames[idx] = shot.environment?.conceptImageName || defaultPlaceholder;
                          nextFiles[idx] = null;
                        } else if (newTarget !== 'custom') {
                          const found = shot.actors.find((a) => a.id === newTarget);
                          nextThumbs[idx] = found?.conceptImageUrl || null;
                          nextNames[idx] = found?.conceptImageName || defaultPlaceholder;
                          nextFiles[idx] = null;
                        } else {
                          const customEntry = customSlotsByShotRef.current[shot.id]?.[idx];
                          nextThumbs[idx] = customEntry?.thumb || null;
                          nextNames[idx] = customEntry?.name || defaultPlaceholder;
                          nextFiles[idx] = customEntry?.file || null;
                        }
                        setRefImageThumbs(nextThumbs);
                        setRefImageNames(nextNames);
                        setRefImageFiles(nextFiles);
                      }}
                      className="w-full bg-[#0d1220] border border-white/15 rounded px-1.5 py-1 text-[9.5px] font-mono text-indigo-200 focus:outline-none focus:border-indigo-400"
                      title={`Select which Stage Object or Set maps to <picture ${idx + 1}>`}
                    >
                      {shot.actors.map((act) => {
                        const inPov = povReport.byActorId[act.id]?.everVisible ?? true;
                        return (
                          <option key={act.id} value={act.id}>
                            {inPov ? '👁️ ' : '🚫 [Off-Screen] '}
                            {act.kind === 'human' || act.kind === 'character' ? '👤 ' : '📦 '}
                            {act.name} ({act.kind || 'human'})
                            {act.conceptImageUrl ? ' ✓ Ref' : ''}
                          </option>
                        );
                      })}
                      <option value="environment">
                        🌍 Set: {shot.environment?.name || 'Active Environment'}
                        {shot.environment?.conceptImageUrl ? ' ✓ Ref' : ''}
                      </option>
                      <option value="custom">🖼️ Custom / ComfyUI Input File</option>
                    </select>

                    {/* Thumbnail Preview + Filename + Upload Button */}
                    <div className="flex items-center gap-2 pt-0.5">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={displayObjectTitle}
                          className="h-10 w-10 rounded-lg object-cover border border-emerald-400/50 shrink-0 bg-black"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-white/5 border border-dashed border-white/15 flex items-center justify-center text-[8.5px] font-mono text-slate-400 shrink-0">
                          NO THUMB
                        </div>
                      )}

                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={refImageNames[idx]}
                            onChange={(e) => {
                              const newName = e.target.value;
                              const next = [...refImageNames] as [string, string, string, string];
                              next[idx] = newName;
                              setRefImageNames(next);
                              if (targetVal === 'custom') {
                                const shotCustom = customSlotsByShotRef.current[shot.id] || {};
                                customSlotsByShotRef.current[shot.id] = {
                                  ...shotCustom,
                                  [idx]: {
                                    thumb: shotCustom[idx]?.thumb || null,
                                    name: newName,
                                    file: shotCustom[idx]?.file || null,
                                  },
                                };
                              }
                            }}
                            placeholder={`char${idx + 1}.png`}
                            className="w-full bg-black/70 border border-white/15 rounded px-1.5 py-1 text-[10px] font-mono text-slate-200 focus:outline-none focus:border-indigo-400"
                          />
                          <label
                            className="px-2 py-1 rounded bg-indigo-500/25 hover:bg-indigo-500/40 border border-indigo-400/40 text-indigo-200 cursor-pointer shrink-0 flex items-center gap-1 text-[9.5px] font-mono"
                            title={`Upload reference image for ${displayObjectTitle} (saved independently for this element & shot)`}
                          >
                            <Upload className="h-3 w-3" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                if (!f) return;
                                const activeShotIdAtUpload = shot.id;
                                const activeTargetAtUpload = targetVal;

                                const nextFiles = [...refImageFiles] as [File | null, File | null, File | null, File | null];
                                nextFiles[idx] = activeTargetAtUpload === 'custom' ? f : null;
                                setRefImageFiles(nextFiles);

                                const nextNames = [...refImageNames] as [string, string, string, string];
                                nextNames[idx] = f.name;
                                setRefImageNames(nextNames);

                                const reader = new FileReader();
                                reader.onload = () => {
                                  if (typeof reader.result === 'string') {
                                    const dataUrl = reader.result;
                                    const nextThumbs = [...refImageThumbs] as [string | null, string | null, string | null, string | null];
                                    nextThumbs[idx] = dataUrl;
                                    setRefImageThumbs(nextThumbs);

                                    if (activeTargetAtUpload === 'custom') {
                                      const shotCustom = customSlotsByShotRef.current[activeShotIdAtUpload] || {};
                                      customSlotsByShotRef.current[activeShotIdAtUpload] = {
                                        ...shotCustom,
                                        [idx]: { thumb: dataUrl, name: f.name, file: f },
                                      };
                                    } else if (
                                      useShotStore.getState().shot.id === activeShotIdAtUpload
                                    ) {
                                      // Sync back to the mapped Stage Object or Environment in this specific shot!
                                      if (activeTargetAtUpload === 'environment' && shot.environment) {
                                        setEnvironment({
                                          ...shot.environment,
                                          conceptImageUrl: dataUrl,
                                          conceptImageName: f.name,
                                        });
                                      } else if (activeTargetAtUpload && activeTargetAtUpload !== 'custom') {
                                        updateActor(activeTargetAtUpload, {
                                          conceptImageUrl: dataUrl,
                                          conceptImageName: f.name,
                                        });
                                      }
                                    }
                                  }
                                };
                                reader.readAsDataURL(f);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                        <span className="text-[8.5px] font-mono text-slate-400 truncate">
                          {thumbUrl ? '✓ Synced from Directing Stage' : `ComfyUI input/${refImageNames[idx]}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Seed Control (Node 3 for LTX-2.5 / Node 142 for MiniMax H3) */}
              <div className="rounded-xl bg-black/50 border border-white/10 p-2 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[9px] font-mono">
                  <span className="text-amber-300 font-bold">
                    {activeEngineTab === 'ltx-2.5' ? 'SEED (Node 3)' : 'SEED (Node 142)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setComfySeed(Math.floor(Math.random() * 900000000000000) + 100000000000000)}
                    className="text-indigo-300 hover:text-white underline"
                  >
                    Random
                  </button>
                </div>
                <input
                  type="number"
                  value={comfySeed}
                  onChange={(e) => setComfySeed(Number(e.target.value) || 0)}
                  className="w-full bg-black/70 border border-white/15 rounded px-1.5 py-1 text-[10px] font-mono text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          </div>

          {/* Stage Temporal Beats & Timeline Choreography */}
          {temporalBeats.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#0f121b] p-4 flex flex-col gap-2">
              <button
                onClick={() => setShowTimelineDetails(!showTimelineDetails)}
                className="flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-400" />
                  <span className="font-display font-bold text-xs text-slate-200 group-hover:text-white transition-colors uppercase tracking-wider">
                    Timeline Beats ({shot.durationSeconds}s)
                  </span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 font-mono text-[10px]">
                  <span>{showTimelineDetails ? 'Hide Beats' : 'Show Beats'}</span>
                  {showTimelineDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
              </button>

              {showTimelineDetails && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-1 pt-2.5 border-t border-white/10">
                  {temporalBeats.map((beat, idx) => (
                    <div key={idx} className="rounded-xl bg-black/40 border border-white/5 p-3 flex flex-col gap-1.5">
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
                        <span className="text-emerald-400 font-semibold">Stage &amp; Actors: </span>
                        {beat.actorAction}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Camera Trajectory, Intrinsics & Extrinsics Card */}
          <div className="rounded-2xl border border-white/10 bg-[#0f121b] p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-white tracking-wide uppercase">
                  Camera Matrix ({poseBundle.frameCount}f @ {poseBundle.fps}fps)
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(exportCameraExtrinsicsJson(shot));
                    setCopiedMatrix(true);
                    setTimeout(() => setCopiedMatrix(false), 2000);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 font-mono text-[10px] transition-all"
                  title="Copy 4x4 Camera-to-World (c2w) and World-to-Camera (w2c) matrices as JSON"
                >
                  {copiedMatrix ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-cyan-400" />}
                  <span>{copiedMatrix ? 'Copied!' : 'Copy Matrix'}</span>
                </button>
                <button
                  onClick={handleDownloadCameraExtrinsics}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] font-semibold transition-all"
                  title="Download 4x4 Camera Pose Matrices for ComfyUI CameraCtrl / LTXVConditioning"
                >
                  <Download className="h-3 w-3" />
                  <span>Matrix JSON</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono">
              <div className="rounded-lg bg-black/40 border border-white/5 p-2">
                <span className="text-slate-500 text-[9px] block">LENS / FOV</span>
                <span className="font-bold text-slate-200">
                  {shot.camera.lens.focalLength} ({poseBundle.intrinsics.fovDegrees}°)
                </span>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/5 p-2">
                <span className="text-slate-500 text-[9px] block">MOVE TYPE</span>
                <span className="font-bold text-slate-200 truncate block">{shot.camera.movement.type.toUpperCase()}</span>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/5 p-2">
                <span className="text-slate-500 text-[9px] block">ASPECT / RES</span>
                <span className="font-bold text-slate-200">
                  {shot.aspectRatio} ({poseBundle.intrinsics.width}×{poseBundle.intrinsics.height})
                </span>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/5 p-2">
                <span className="text-slate-500 text-[9px] block">KEYFRAMES</span>
                <span className="font-bold text-slate-200">
                  {shot.camera.movement.keyframes?.length || 2} pts
                </span>
              </div>
              <div className="rounded-lg bg-black/40 border border-white/5 p-2">
                <span className="text-slate-500 text-[9px] block">CADENCE</span>
                <span className="font-bold text-emerald-300">
                  {poseBundle.frameCount}f ({shot.durationSeconds}s)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: AI Prompt Director, Engine-Optimized Prompts & Production Pack (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-[#0d1222]/95 to-[#090d18]/95 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] flex flex-col gap-4 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-indigo-500/15 border border-indigo-400/35 flex items-center justify-center text-indigo-300 shrink-0">
                  <FileCode className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    {activeEngineTab === 'ltx-2.5'
                      ? 'LTX-2.5 Directorial Prompt'
                      : activeEngineTab === 'minimax-h3'
                      ? 'MiniMax H3 Motion Prompt'
                      : 'Seedance 2.0 Cinematic Prompt'}
                  </h2>
                  <span className="text-[11px] text-slate-400">
                    {activeEngineTab === 'seedance'
                      ? '6-Axis Coordinate Trajectory, Aerodynamic Physics & Sensor Profile'
                      : activeEngineTab === 'minimax-h3'
                      ? 'Structured Micro-Acting & Optical Photorealism Formula'
                      : 'Present-Tense Action & DiT Temporal Pacing'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleCopyPrompt(displayPositivePrompt)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/25 hover:bg-blue-600/40 text-blue-100 text-xs font-semibold border border-blue-400/40 shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all cursor-pointer shrink-0"
                title="Copy positive prompt to clipboard"
              >
                {copiedPrompt ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-blue-300" />}
                <span>{copiedPrompt ? 'Copied!' : 'Copy Prompt'}</span>
              </button>
            </div>

            {/* AI Directing & Polish Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#080c18] border border-indigo-500/25">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-400" />
                <span className="font-semibold text-xs text-slate-200">AI Reasoner:</span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-400/35">
                  {getReasonerConfig().provider.toUpperCase()}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {engineUndoCount > 0 && (
                  <button
                    type="button"
                    onClick={() => undoCustomPositivePrompt(activeEngineTab)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/30 text-amber-200 font-mono text-[10.5px] transition-colors border border-amber-500/30 cursor-pointer"
                    title="Undo last prompt edit or AI modification"
                  >
                    <Undo2 className="h-3 w-3" />
                    <span>Undo ({engineUndoCount})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDirectWithAi}
                  disabled={isDirectingPrompt}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-white font-semibold text-xs transition-all shadow-[0_0_15px_rgba(99,102,241,0.35)] disabled:opacity-50 cursor-pointer"
                  title="Polish prompt using AI Reasoner"
                >
                  {isDirectingPrompt ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>{isDirectingPrompt ? 'Directing...' : 'AI Polish'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPromptChatOpen((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                    isPromptChatOpen
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                      : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/10'
                  }`}
                  title="Toggle interactive AI Prompt Co-Director Chat"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>AI Chat</span>
                </button>
              </div>
            </div>

            {/* Interactive Multi-Turn AI Prompt Co-Director Chat */}
            {isPromptChatOpen && (
              <div className="rounded-xl bg-[#080c18] border border-indigo-500/25 p-3.5 flex flex-col gap-3 shadow-inner">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white tracking-wide">
                      Prompt Co-Director
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      clearPromptChatMessages();
                      setPromptChatInput('');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[10.5px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Clear prompt chat history and input"
                  >
                    <span>Clear</span>
                  </button>
                </div>

                {/* Quick Suggestion Chips (2x2 Grid matching Reference Design) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {[
                    {
                      label: 'Smoother camera & character motion',
                      prompt: 'Make character and camera motion smoother and more natural',
                    },
                    {
                      label: 'Warmer cinematic light & atmosphere',
                      prompt: 'Add warm cinematic golden-hour lighting and atmospheric depth',
                    },
                    {
                      label: 'Richer diegetic soundscape & environment',
                      prompt: 'Enhance diegetic soundscape and environmental audio details',
                    },
                    {
                      label: 'Sharper photorealism, lens & texture',
                      prompt: 'Sharpen optical photorealism, lens bokeh, and surface textures',
                    },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      disabled={isSendingPromptChat}
                      onClick={() => handleSendAiPromptChat(chip.prompt)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0e1526] hover:bg-indigo-500/25 border border-indigo-400/25 text-slate-200 hover:text-white text-[10.5px] font-medium text-left flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <span className="text-cyan-400 font-bold text-xs leading-none">+</span>
                      <span className="truncate">{chip.label}</span>
                    </button>
                  ))}
                </div>

                {/* Chat Messages History */}
                {(shot.promptChatMessages || []).length > 0 && (
                  <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                    {(shot.promptChatMessages || []).map((m) => {
                      const isAr = /[\u0600-\u06FF]/.test(m.text);
                      return (
                        <div
                          key={m.id}
                          dir={isAr ? 'rtl' : 'ltr'}
                          className={`rounded-lg px-2.5 py-1.5 text-[10.5px] leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-indigo-600/25 border border-indigo-500/40 text-indigo-100'
                              : 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-200'
                          }`}
                        >
                          <span className="font-mono text-[9px] font-bold opacity-75 block mb-0.5">
                            {m.role === 'user' ? '🎬 You:' : '🤖 AI Co-Director:'}
                          </span>
                          <div>{m.text}</div>
                        </div>
                      );
                    })}
                    <div ref={promptChatEndRef} />
                  </div>
                )}

                {/* Chat Input Row */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    dir="auto"
                    value={promptChatInput}
                    onChange={(e) => setPromptChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendAiPromptChat();
                      }
                    }}
                    disabled={isSendingPromptChat}
                    placeholder="Describe how to modify the prompt..."
                    className="flex-1 rounded-xl bg-[#050811] border border-white/15 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 shadow-inner"
                  />
                  <button
                    type="button"
                    disabled={!promptChatInput.trim() || isSendingPromptChat}
                    onClick={() => handleSendAiPromptChat()}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold border border-emerald-400/40 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                  >
                    {isSendingPromptChat ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    <span>{isSendingPromptChat ? 'Updating...' : 'Apply'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* AI Director Feedback notification */}
            {aiDirectorFeedback && (
              <div
                className={`p-2.5 rounded-lg border font-mono text-[11px] leading-relaxed flex items-start gap-2 ${
                  aiDirectorFeedback.toLowerCase().includes('fail') || aiDirectorFeedback.toLowerCase().includes('error')
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div className="flex-1">{aiDirectorFeedback}</div>
              </div>
            )}

            {/* Scene Object Color Target Map (For Color-Guided Targeting & Masking) */}
            {shot.actors.length > 0 && (
              <div className="rounded-xl bg-[#080c18] border border-indigo-500/20 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white tracking-wide flex items-center gap-1.5">
                    <span>🎨 Target Colors</span>
                    <span className="text-amber-400 font-mono">({shot.actors.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const colorLines = shot.actors
                        .map((a, i) => {
                          const hex = (a.color || ['#38bdf8', '#f472b6', '#cb8768', '#a18991', '#a2388f', '#a15977'][i % 6]).toUpperCase();
                          return `[${hex} = ${a.name} (${a.token || a.kind || 'subject'})]`;
                        })
                        .join(', ');
                      const appended = `${displayPositivePrompt}\n\nColor Target Map: ${colorLines}.`;
                      setCustomPositivePrompt(activeEngineTab, appended, true);
                      setCompiledPrompt({
                        ...(compiledPrompt || deterministicPrompt),
                        positivePrompt: appended,
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-[10.5px] font-semibold transition-colors cursor-pointer"
                    title="Append Object Color Target Map to Positive Prompt"
                  >
                    + Add Color
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {shot.actors.map((act, idx) => {
                    const hex = act.color || ['#38bdf8', '#f472b6', '#cb8768', '#a18991', '#a2388f', '#a15977'][idx % 6];
                    return (
                      <div
                        key={act.id}
                        className="flex items-center justify-between gap-1.5 rounded-lg bg-[#0d1222] border border-white/10 px-2.5 py-1.5 text-[10px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-full border border-white/30 shrink-0 shadow-sm"
                            style={{ backgroundColor: hex }}
                          />
                          <span className="font-bold text-white truncate" title={act.name}>
                            {act.name}
                          </span>
                        </div>
                        <span className="font-mono text-[9.5px] text-slate-400 uppercase shrink-0">
                          {hex}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Editable Positive Prompt Card */}
            <div className="space-y-2 flex-1 flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-white tracking-wide flex items-center gap-2">
                  <FileCode className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Positive Prompt</span>
                </label>
              </div>
              <textarea
                rows={9}
                value={displayPositivePrompt}
                onChange={(e) => {
                  const nextText = e.target.value;
                  setCustomPositivePrompt(activeEngineTab, nextText, false);
                  setCompiledPrompt({
                    ...(compiledPrompt || deterministicPrompt),
                    positivePrompt: nextText,
                  });
                }}
                onFocus={() => {
                  setCustomPositivePrompt(activeEngineTab, displayPositivePrompt, true);
                }}
                placeholder="Edit your positive prompt manually here or discuss modifications with the AI Prompt Co-Director above..."
                className="flex-1 min-h-[175px] w-full rounded-xl bg-[#050811] border border-white/15 focus:border-indigo-400 p-3.5 text-xs font-mono text-slate-100 leading-relaxed overflow-y-auto custom-scrollbar focus:outline-none resize-y shadow-inner"
              />
            </div>

            {/* Editable Negative Prompt Card */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10.5px] font-mono text-rose-300/90 uppercase tracking-wider font-semibold">
                  Negative Prompt
                </label>
                <button
                  onClick={() => handleCopyPrompt(displayNegativePrompt, true)}
                  className="text-[10.5px] font-mono text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {copiedNegative ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedNegative ? 'Copied' : 'Copy Negative'}</span>
                </button>
              </div>
              <textarea
                rows={2}
                value={displayNegativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="blurry, distorted anatomy, extra limbs, camera jitter, morphing, watermark..."
                className="w-full rounded-xl bg-[#050811] border border-white/10 p-2.5 text-[11px] font-mono text-slate-300 leading-normal focus:outline-none focus:border-rose-500/50 resize-none"
              />
            </div>

            {/* Full Production Pack & JSON Bundle Footer */}
            <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() => {
                  const fullBundle = {
                    targetEngine: activeEngineTab,
                    shotSpec: shot,
                    compiledPrompt: {
                      ...compiledPrompt,
                      positivePrompt: displayPositivePrompt,
                      negativePrompt: displayNegativePrompt,
                    },
                    cameraExtrinsics: poseBundle,
                  };
                  navigator.clipboard.writeText(JSON.stringify(fullBundle, null, 2));
                  setCopiedJson(true);
                  setTimeout(() => setCopiedJson(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-mono text-xs border border-white/10 transition-all cursor-pointer"
              >
                {copiedJson ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Code2 className="h-3.5 w-3.5 text-indigo-400" />}
                <span>{copiedJson ? 'Copied JSON!' : 'Copy JSON'}</span>
              </button>

              <button
                onClick={handleDownloadFullBundle}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 font-mono text-xs font-semibold transition-all cursor-pointer"
                title="Download complete ShotSpec + Compiled Prompt + Camera Extrinsics JSON package"
              >
                <Download className="h-3.5 w-3.5 text-indigo-300" />
                <span>Shot Pack (.json)</span>
              </button>
            </div>

            {/* Export Instructions / Workflow Guide */}
            <div className="rounded-xl bg-indigo-950/30 border border-indigo-500/20 p-3 space-y-1 text-[11px] font-mono text-indigo-200">
              <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Quick Guide</span>
              </div>
              <p className="text-[10px] text-slate-300 leading-relaxed">
                1. Click <strong>&quot;Render Preview&quot;</strong> &amp; download the MP4 passes (RGB, Pose, Depth, Mask).
                <br />
                2. Click <strong>&quot;AI Polish&quot;</strong> or <strong>&quot;Copy Prompt&quot;</strong> for your target model.
                <br />
                3. Click <strong>&quot;Render in ComfyUI&quot;</strong> or feed the MP4 + Camera Matrix JSON into your LTX-2.5 / MiniMax H3 workflow.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
