import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Video,
  FileBox,
  Sparkles,
  CheckCircle2,
  Footprints,
  UserCheck,
  Building2,
  Upload,
  Layers,
  Activity,
  ExternalLink,
  Camera,
  Users,
  RefreshCw,
  ChevronRight,
  Info,
  BarChart2,
  SquarePen,
} from 'lucide-react';
import { Actor, TrajectoryKeyframe } from '../types/shotspec';
import { EnvironmentSpec } from '../types/environment';
import {
  importMocapFileBuffer,
  FbxMocapImportResult,
  MocapBodyProportions,
  ActorPoseKeyframe,
} from '../engine/kinematics/fbxMocapImporter';
import {
  extractMocapFromVideoFile,
  extractMocapFromVideoElementOrFrames,
  VideoMocapExtractionResult,
  ExtractedVideoActorTrack,
  ExtractedVideoCameraMotion,
} from '../engine/kinematics/videoToMocapExtractor';
import { MocapModelsManagerCard } from './MocapModelsManagerCard';
import {
  reconstructSceneFromVideoFrame,
  ReconstructedSceneResult,
} from '../engine/staging/videoSceneReconstructor';
import { storeModelBuffer } from '../services/modelStorage';
import { useShotStore } from '../stores/useShotStore';

export interface MocapStudioApplyPayload {
  actorId: string;
  poseKeyframes: ActorPoseKeyframe[];
  trajectoryKeyframes: TrajectoryKeyframe[];
  actionDescription: string;
  durationSeconds?: number;
  bodyProportions?: MocapBodyProportions;
  /** Target 3D character mesh representation on the 3D Stage: `'smpl'` (true 6,890v SMPL body) or `'ybot'` (natural unstretched Mixamo Y-Bot) */
  humanoidMeshMode?: 'smpl' | 'ybot';
  fullBodyModelUrl?: string;
  reconstructedEnvironment?: EnvironmentSpec;
  surroundingActors?: Actor[];
  /** Additional or all multi-person tracks extracted from the video (1..N people) */
  actorTracks?: ExtractedVideoActorTrack[];
  /** Extracted 3D camera motion, lens focal length, framing & trajectory */
  cameraMotion?: ExtractedVideoCameraMotion;
}

/**
 * Single canonical store updater for applying a `MocapStudioApplyPayload`
 * onto `useShotStore` (shared by `MotionPrevisStage` and `CharacterControlCard`).
 */
export function applyMocapStudioPayloadToShotStore(
  payload: MocapStudioApplyPayload,
  targetActor: Actor,
  onUpdateActor?: (id: string, patch: Partial<Actor>) => void
): void {
  const firstPos =
    payload.trajectoryKeyframes.length > 0
      ? payload.trajectoryKeyframes[0].position
      : targetActor.trajectory.startPosition;
  const lastPos =
    payload.trajectoryKeyframes.length > 0
      ? payload.trajectoryKeyframes[payload.trajectoryKeyframes.length - 1].position
      : targetActor.trajectory.endPosition;

  const mergedKeyframes = payload.trajectoryKeyframes.map((tk, idx) => {
    const matchingPoseKf =
      payload.poseKeyframes[idx] ||
      payload.poseKeyframes.find((pk) => Math.abs(pk.time - tk.time) < 0.05);
    return {
      ...tk,
      pose: matchingPoseKf?.pose || tk.pose,
    };
  });

  const primaryTrack = payload.actorTracks?.[0];
  const isDefaultKaelPreset = /kael|ronin|syndicate|aria|vance|guardian/i.test(
    `${targetActor.id} ${targetActor.name} ${targetActor.token || ''}`
  );
  const isSpecificRoleName =
    Boolean(
      primaryTrack?.actorName &&
        (!/^(Lead Subject|Person 1(\s*\(Left \/ Lead\))?)$/i.test(primaryTrack.actorName) ||
          (payload.reconstructedEnvironment && isDefaultKaelPreset))
    );
  const updates: Partial<Actor> = {
    actionDescription: payload.actionDescription,
    motionClip: undefined,
    posePreset: undefined,
    gait: 'none',
    pose: mergedKeyframes[0]?.pose || targetActor.pose,
    ...(mergedKeyframes[0]?.rotation ? { rotation: mergedKeyframes[0].rotation } : {}),
    ...(primaryTrack?.clothingColorHex ? { color: primaryTrack.clothingColorHex } : {}),
    ...(primaryTrack ? { partGraph: undefined, sculpt: undefined } : {}),
    ...(isSpecificRoleName && primaryTrack
      ? {
          name: primaryTrack.actorName,
          token: primaryTrack.appearanceToken || targetActor.token,
        }
      : {}),
    trajectory: {
      ...targetActor.trajectory,
      startPosition: firstPos,
      endPosition: lastPos,
      keyframes: mergedKeyframes,
    },
  };

  const resolvedMeshMode: 'smpl' | 'ybot' =
    payload.humanoidMeshMode ??
    payload.bodyProportions?.humanoidMeshMode ??
    (payload.bodyProportions ? 'smpl' : 'ybot');

  if (payload.bodyProportions) {
    const heightRatio = payload.bodyProportions.heightMeters / 1.75;
    const blendedScale =
      resolvedMeshMode === 'ybot'
        ? Number(Math.max(0.72, Math.min(1.35, heightRatio)).toFixed(2))
        : Math.max(
            0.65,
            Math.min(1.65, heightRatio * 0.7 + payload.bodyProportions.bulkFactor * 0.3)
          );
    updates.scale = Number(blendedScale.toFixed(2));
    updates.bodyProportions = {
      ...payload.bodyProportions,
      humanoidMeshMode: resolvedMeshMode,
    };
    updates.kind = 'human';
    updates.rigType = 'humanoid';
  } else if (resolvedMeshMode === 'smpl') {
    updates.bodyProportions = {
      heightMeters: 1.75,
      shoulderWidthRatio: 1.0,
      hipWidthRatio: 1.0,
      torsoLengthRatio: 1.0,
      legLengthRatio: 1.0,
      armLengthRatio: 1.0,
      bulkFactor: 1.0,
      hasSkinnedMesh: true,
      vertexCount: 6890,
      boneCount: 24,
      humanoidMeshMode: 'smpl',
    };
    updates.kind = 'human';
    updates.rigType = 'humanoid';
  } else {
    updates.bodyProportions = undefined;
  }

  if (payload.fullBodyModelUrl) {
    updates.modelUrl = payload.fullBodyModelUrl;
    updates.rigType = 'humanoid';
  }

  const store = useShotStore.getState();
  if (onUpdateActor) {
    onUpdateActor(payload.actorId, updates);
  } else {
    const actorExistsInStore = store.shot.actors.some((a) => a.id === payload.actorId);
    if (actorExistsInStore) {
      store.updateActor(payload.actorId, updates);
    } else {
      store.setActors([...store.shot.actors, { ...targetActor, ...updates }]);
    }
  }

  // Spawn/update any additional human actors (Person 2, Person 3, ...) detected in the video
  const shouldApplyBodyProps = Boolean(payload.bodyProportions);
  const extraPersonActors: Actor[] = (payload.actorTracks ?? []).slice(1).map((tr, idx) => {
    const trFirstPos =
      tr.trajectoryKeyframes[0]?.position ?? tr.startPosition ?? { x: 53, y: 42, z: 0 };
    const trLastPos =
      tr.trajectoryKeyframes[tr.trajectoryKeyframes.length - 1]?.position ??
      tr.endPosition ??
      trFirstPos;
    const trMergedKfs = tr.trajectoryKeyframes.map((tk, kIdx) => ({
      ...tk,
      pose: tr.poseKeyframes[kIdx]?.pose || tk.pose,
    }));
    const hRatio = tr.bodyProportions.heightMeters / 1.75;
    const trScale = shouldApplyBodyProps
      ? Number(
          (resolvedMeshMode === 'ybot'
            ? Math.max(0.72, Math.min(1.35, hRatio))
            : Math.max(0.65, Math.min(1.65, hRatio * 0.7 + tr.bodyProportions.bulkFactor * 0.3))
          ).toFixed(2)
        )
      : 1.0;
    const trBodyProps: Actor['bodyProportions'] = shouldApplyBodyProps
      ? {
          ...tr.bodyProportions,
          humanoidMeshMode: resolvedMeshMode,
        }
      : resolvedMeshMode === 'smpl'
      ? {
          heightMeters: 1.75,
          shoulderWidthRatio: 1.0,
          hipWidthRatio: 1.0,
          torsoLengthRatio: 1.0,
          legLengthRatio: 1.0,
          armLengthRatio: 1.0,
          bulkFactor: 1.0,
          hasSkinnedMesh: true,
          vertexCount: 6890,
          boneCount: 24,
          humanoidMeshMode: 'smpl',
        }
      : undefined;
    return {
      id: `mocap-person-${idx + 2}`,
      name: tr.actorName || `Person ${idx + 2}`,
      kind: 'human',
      rigType: 'humanoid',
      token: tr.appearanceToken || `human subject ${idx + 2} from video`,
      actionDescription: `${tr.actionSummary} (Video Mocap)`,
      color: tr.clothingColorHex || '#f472b6',
      scale: trScale,
      bodyProportions: trBodyProps,
      gait: 'none',
      pose: trMergedKfs[0]?.pose,
      ...(trMergedKfs[0]?.rotation ? { rotation: trMergedKfs[0].rotation } : {}),
      trajectory: {
        startTimeSeconds: 0,
        startPosition: trFirstPos,
        endPosition: trLastPos,
        keyframes: trMergedKfs,
      },
    };
  });

  // Apply extracted 3D camera motion, framing & lens when requested
  if (payload.cameraMotion) {
    const cm = payload.cameraMotion;
    store.setFocalLength(cm.focalLength);
    if (typeof store.updateCameraLens === 'function') {
      store.updateCameraLens({
        focalLength: cm.focalLength,
        ...(typeof cm.customFocalLengthMm === 'number'
          ? { customFocalLengthMm: cm.customFocalLengthMm }
          : {}),
        ...(typeof cm.focusDistanceMeters === 'number'
          ? { focusDistanceMeters: cm.focusDistanceMeters }
          : {}),
      });
    }
    store.setShotType(cm.shotType);
    store.setCameraAngle(cm.angle);
    store.setCameraMovement(cm.movementType, cm.speed);
    store.setCameraPositions(cm.startPosition, cm.endPosition);
    store.setCameraTargetLookAt(cm.targetLookAt);
    store.updateCameraOptions({
      trackTargetActorId: undefined,
      followActorMovement: false,
      yawOffsetDeg: 0,
      pitchOffsetDeg: 0,
      dutchRollDeg: typeof cm.dutchRollDeg === 'number' ? cm.dutchRollDeg : 0,
      lookAtHeightOffset: 0,
    });
    if (cm.keyframes && cm.keyframes.length > 0) {
      store.updateCameraMovementOptions({
        keyframes: cm.keyframes,
        customTrajectory: true,
      });
    }
  }

  if (payload.reconstructedEnvironment) {
    store.setEnvironment(payload.reconstructedEnvironment);
    const envPrompt =
      payload.reconstructedEnvironment.promptDescription ||
      payload.reconstructedEnvironment.name ||
      '';
    if (envPrompt && typeof store.setSceneDescription === 'function') {
      store.setSceneDescription(envPrompt);
    }
    const isCyberEnv = /cyberpunk|neo-tokyo|neon|helipad/i.test(
      `${payload.reconstructedEnvironment.name || ''} ${envPrompt}`
    );
    const currentLights = useShotStore.getState().shot.lighting;
    if (
      !isCyberEnv &&
      currentLights.style === 'neon-cyberpunk' &&
      typeof store.setLighting === 'function'
    ) {
      const tod = payload.reconstructedEnvironment.timeOfDay;
      store.setLighting(
        tod === 'golden-hour'
          ? 'golden-hour'
          : tod === 'night'
          ? 'moonlight-foggy'
          : 'cinematic-natural',
        'side-key',
        'balanced'
      );
    }
  }

  if (
    typeof payload.durationSeconds === 'number' &&
    Number.isFinite(payload.durationSeconds) &&
    payload.durationSeconds >= 1 &&
    typeof store.updateDuration === 'function'
  ) {
    store.updateDuration(Math.min(30, Math.max(1, Number(payload.durationSeconds.toFixed(2)))));
  }

  if (
    (payload.actorTracks && payload.actorTracks.length > 0) ||
    extraPersonActors.length > 0 ||
    (payload.surroundingActors && payload.surroundingActors.length > 0) ||
    Boolean(payload.reconstructedEnvironment)
  ) {
    const hasVideoTracks = Boolean(payload.actorTracks && payload.actorTracks.length > 0);
    const isFullSceneCapture = Boolean(payload.reconstructedEnvironment);
    const currentActors = useShotStore.getState().shot.actors;
    const baseActors = currentActors
      .filter((a) => {
        if (a.id.startsWith('mocap-surrounding-') || a.id.startsWith('mocap-person-')) {
          return false;
        }
        if (isFullSceneCapture) {
          return a.id === payload.actorId;
        }
        return !hasVideoTracks || a.id === payload.actorId || a.kind !== 'human';
      })
      .map((a) => (a.id === payload.actorId ? { ...a, ...updates } : a));
    const taggedSurrounding = (payload.surroundingActors ?? []).map((sa, idx) => ({
      ...sa,
      id: sa.id.startsWith('mocap-surrounding-')
        ? sa.id
        : `mocap-surrounding-${idx + 1}-${sa.id}`,
    }));
    store.setActors([...baseActors, ...extraPersonActors, ...taggedSurrounding]);
  }

  if (
    payload.cameraMotion &&
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function'
  ) {
    window.dispatchEvent(
      new CustomEvent('cmpvs:apply-mocap-camera', { detail: payload.cameraMotion })
    );
  }
}

export type CaptureScopePreset = 'motion-body-scene' | 'motion-body' | 'motion-only';

interface MocapStudioModalProps {
  isOpen: boolean;
  actor: Actor;
  shotDurationSeconds: number;
  onClose: () => void;
  onApplyMocap: (payload: MocapStudioApplyPayload) => void;
}

const ACCEPTED_VIDEO_ONLY_EXTENSIONS =
  'video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,.mp4,.mov,.webm,.mkv,.avi,.m4v';
const ACCEPTED_MOCAP_AND_VIDEO_EXTENSIONS = '.mp4,.mov,.webm,.mkv,.avi,.fbx,.glb,.gltf,.json,.bvh';

export const MocapStudioModal: React.FC<MocapStudioModalProps> = ({
  isOpen,
  actor,
  shotDurationSeconds,
  onClose,
  onApplyMocap,
}) => {
  const [activeTab, setActiveTab] = useState<'video' | 'fbx'>('video');

  // Extraction Options (controlled directly by Active Layers)
  const [lockFootContacts, setLockFootContacts] = useState(true);
  const [extractBodyProportions, setExtractBodyProportions] = useState(true);
  const [humanoidMeshMode, setHumanoidMeshMode] = useState<'smpl' | 'ybot'>(
    actor.bodyProportions?.humanoidMeshMode === 'ybot' ? 'ybot' : 'smpl'
  );
  const [smoothingStrength, setSmoothingStrength] = useState<number>(0.65);
  const [applyCameraMotion, setApplyCameraMotion] = useState(true);
  const [reconstructSurroundingScene, setReconstructSurroundingScene] = useState(true);
  const [motionHintPrompt, setMotionHintPrompt] = useState('');
  const [previewFrameIdx, setPreviewFrameIdx] = useState<number>(0);

  // Processing & Result State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [processingPercent, setProcessingPercent] = useState<number>(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<VideoMocapExtractionResult | null>(null);
  const [fbxResult, setFbxResult] = useState<FbxMocapImportResult | null>(null);
  const [sceneResult, setSceneResult] = useState<ReconstructedSceneResult | null>(null);
  const [selectedPersonTrackIds, setSelectedPersonTrackIds] = useState<Record<string, boolean>>({});
  const [selectedSurroundingIds, setSelectedSurroundingIds] = useState<Record<string, boolean>>({});

  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const fbxInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);

  if (!isOpen) return null;

  const startPos = {
    x: actor.trajectory.startPosition.x,
    y: actor.trajectory.startPosition.y,
    z: actor.trajectory.startPosition.z ?? 0,
  };

  const applyHintAndOptionsLive = (
    nextHintRaw: string,
    nextLockFeet: boolean,
    nextExtractProps: boolean,
    nextSmooth = smoothingStrength
  ) => {
    const trimmedHint = nextHintRaw.trim();

    if (videoResult) {
      const reSolved = extractMocapFromVideoElementOrFrames(videoResult.sampledFrames ?? [], {
        fileName: videoResult.fileName,
        startPosition: startPos,
        targetDurationSeconds: videoResult.durationSeconds || shotDurationSeconds,
        sampleFps: 16,
        lockFootContacts: nextLockFeet,
        extractBodyProportions: nextExtractProps,
        smoothingStrength: nextSmooth,
        motionHintPrompt: trimmedHint || undefined,
        referenceFrameDataUrl: videoResult.referenceFrameDataUrl,
        contactSheetDataUrl: videoResult.contactSheetDataUrl,
        visionAiAnalysis: videoResult.visionAiAnalysis,
        mediaPipeDetections: videoResult.mediaPipeDetections,
        nlfSmpl3dDetections: videoResult.nlfSmpl3dDetections,
        nlfDiagnostic: videoResult.nlfDiagnostic,
      });
      setVideoResult(reSolved);
      setSelectedPersonTrackIds((prev) => {
        const next: Record<string, boolean> = {};
        for (const tr of reSolved.actorTracks) {
          next[tr.trackId] = prev[tr.trackId] ?? true;
        }
        return next;
      });

      const combinedTrajectories = reSolved.actorTracks.flatMap((t) => t.trajectoryKeyframes);
      const xs = combinedTrajectories.map((k) => k.position.x);
      const ys = combinedTrajectories.map((k) => k.position.y);
      const reconstructed = reconstructSceneFromVideoFrame({
        fileName: reSolved.fileName,
        sceneHintPrompt: trimmedHint || reSolved.detectedActionLabel,
        referenceFrameDataUrl: reSolved.referenceFrameDataUrl || undefined,
        framePixels: reSolved.referenceFramePixels,
        humanTrajectoryBounds: {
          minX: xs.length ? Math.min(...xs) - 6 : 40,
          maxX: xs.length ? Math.max(...xs) + 6 : 60,
          minY: ys.length ? Math.min(...ys) - 6 : 40,
          maxY: ys.length ? Math.max(...ys) + 6 : 60,
        },
        maxSurroundingObjects: 4,
        visionAiAnalysis: reSolved.visionAiAnalysis,
      });
      setSceneResult(reconstructed);
      setSelectedSurroundingIds((prev) => {
        const next: Record<string, boolean> = {};
        for (const sur of reconstructed.surroundingActors) {
          next[sur.id] = prev[sur.id] ?? true;
        }
        return next;
      });
    } else if (fbxResult) {
      const xs = fbxResult.trajectoryKeyframes.map((k) => k.position.x);
      const ys = fbxResult.trajectoryKeyframes.map((k) => k.position.y);
      const reconstructed = reconstructSceneFromVideoFrame({
        fileName: fbxResult.fileName,
        sceneHintPrompt: trimmedHint || fbxResult.fileName,
        humanTrajectoryBounds: {
          minX: xs.length ? Math.min(...xs) - 6 : 40,
          maxX: xs.length ? Math.max(...xs) + 6 : 60,
          minY: ys.length ? Math.min(...ys) - 6 : 40,
          maxY: ys.length ? Math.max(...ys) + 6 : 60,
        },
        maxSurroundingObjects: 4,
      });
      setSceneResult(reconstructed);
      setSelectedSurroundingIds((prev) => {
        const next: Record<string, boolean> = {};
        for (const sur of reconstructed.surroundingActors) {
          next[sur.id] = prev[sur.id] ?? true;
        }
        return next;
      });
    } else if (trimmedHint.length >= 2) {
      const solvedFromHint = extractMocapFromVideoElementOrFrames([], {
        fileName: 'scene_hint_capture.mp4',
        startPosition: startPos,
        targetDurationSeconds: shotDurationSeconds,
        sampleFps: 12,
        lockFootContacts: nextLockFeet,
        extractBodyProportions: nextExtractProps,
        motionHintPrompt: trimmedHint,
      });
      setVideoResult(solvedFromHint);
      const initTrackMap: Record<string, boolean> = {};
      for (const tr of solvedFromHint.actorTracks) {
        initTrackMap[tr.trackId] = true;
      }
      setSelectedPersonTrackIds(initTrackMap);

      const combinedTrajectories = solvedFromHint.actorTracks.flatMap((t) => t.trajectoryKeyframes);
      const xs = combinedTrajectories.map((k) => k.position.x);
      const ys = combinedTrajectories.map((k) => k.position.y);
      const reconstructed = reconstructSceneFromVideoFrame({
        fileName: 'scene_hint_capture.mp4',
        sceneHintPrompt: trimmedHint,
        humanTrajectoryBounds: {
          minX: xs.length ? Math.min(...xs) - 6 : 40,
          maxX: xs.length ? Math.max(...xs) + 6 : 60,
          minY: ys.length ? Math.min(...ys) - 6 : 40,
          maxY: ys.length ? Math.max(...ys) + 6 : 60,
        },
        maxSurroundingObjects: 4,
      });
      setSceneResult(reconstructed);
      const initSur: Record<string, boolean> = {};
      for (const sur of reconstructed.surroundingActors) {
        initSur[sur.id] = true;
      }
      setSelectedSurroundingIds(initSur);
    }
  };

  const buildSceneReconstructionForTrajectory = (
    fileName: string,
    hintText: string,
    allTrajectories: TrajectoryKeyframe[],
    referenceFrameDataUrl?: string,
    framePixels?: { width: number; height: number; data: Uint8ClampedArray },
    visionAiAnalysis?: VideoMocapExtractionResult['visionAiAnalysis']
  ) => {
    const xs = allTrajectories.map((k) => k.position.x);
    const ys = allTrajectories.map((k) => k.position.y);
    const bounds = {
      minX: xs.length ? Math.min(...xs) - 6 : 40,
      maxX: xs.length ? Math.max(...xs) + 6 : 60,
      minY: ys.length ? Math.min(...ys) - 6 : 40,
      maxY: ys.length ? Math.max(...ys) + 6 : 60,
    };

    const reconstructed = reconstructSceneFromVideoFrame({
      fileName,
      sceneHintPrompt: motionHintPrompt.trim() || hintText,
      referenceFrameDataUrl,
      framePixels,
      humanTrajectoryBounds: bounds,
      maxSurroundingObjects: 4,
      visionAiAnalysis,
    });
    setSceneResult(reconstructed);
    const initSelected: Record<string, boolean> = {};
    for (const sur of reconstructed.surroundingActors) {
      initSelected[sur.id] = true;
    }
    setSelectedSurroundingIds(initSelected);
  };

  const handleVideoFileSelect = async (file: File) => {
    setActiveTab('video');
    setLastUploadedFile(file);
    setErrorMsg(null);
    setIsProcessing(true);
    setProcessingStage('Initializing video decoder...');
    setProcessingPercent(8);
    try {
      const objUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
      if (objUrl) setVideoPreviewUrl(objUrl);

      const extracted = await extractMocapFromVideoFile(file, {
        startPosition: startPos,
        targetDurationSeconds: undefined,
        sampleFps: 24,
        lockFootContacts,
        extractBodyProportions,
        smoothingStrength,
        motionHintPrompt: motionHintPrompt.trim() || undefined,
        enableVisionAi: true,
        onProgress: (stageLabel, pct) => {
          setProcessingStage(stageLabel);
          setProcessingPercent(pct);
        },
      });
      setVideoResult(extracted);
      setFbxResult(null);

      const initTrackMap: Record<string, boolean> = {};
      for (const tr of extracted.actorTracks) {
        initTrackMap[tr.trackId] = true;
      }
      setSelectedPersonTrackIds(initTrackMap);

      const combinedTrajectories = extracted.actorTracks.flatMap((t) => t.trajectoryKeyframes);
      buildSceneReconstructionForTrajectory(
        file.name,
        extracted.detectedActionLabel,
        combinedTrajectories.length > 0 ? combinedTrajectories : extracted.trajectoryKeyframes,
        extracted.referenceFrameDataUrl || undefined,
        extracted.referenceFramePixels,
        extracted.visionAiAnalysis
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to extract 3D motion from video file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFbxFileSelect = async (file: File) => {
    setActiveTab('fbx');
    setLastUploadedFile(file);
    setErrorMsg(null);
    setIsProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const imported = await importMocapFileBuffer(buffer, file.name, {
        importMode: extractBodyProportions ? 'import-full-body' : 'retarget-motion',
        startPosition: startPos,
        targetDurationSeconds: shotDurationSeconds,
        sampleFps: 16,
        lockFootContacts,
      });
      setFbxResult(imported);
      setVideoResult(null);

      buildSceneReconstructionForTrajectory(
        file.name,
        motionHintPrompt.trim() || file.name,
        imported.trajectoryKeyframes
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse .FBX / .GLB motion file.');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Smart router: whether the user clicked "Upload Video" OR "Import Mocap",
   * if they select a video (.mp4/.webm/.mov), process it as Video Mocap + Scene;
   * if they select a 3D file (.fbx/.glb/.gltf), process it as 3D Skeleton Mocap + Scene.
   */
  const handleAnyFileSelect = async (file: File) => {
    const lower = (file.name || '').toLowerCase();
    const isVideoFile =
      (file.type && file.type.startsWith('video/')) ||
      /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(lower);
    const is3dMocapFile = /\.(fbx|glb|gltf|json|bvh)$/i.test(lower);

    if (isVideoFile && !is3dMocapFile) {
      await handleVideoFileSelect(file);
    } else if (is3dMocapFile) {
      await handleFbxFileSelect(file);
    } else if (activeTab === 'fbx') {
      await handleFbxFileSelect(file);
    } else {
      await handleVideoFileSelect(file);
    }
  };

  const handleReAnalyzeWithHint = async () => {
    if (lastUploadedFile) {
      await handleAnyFileSelect(lastUploadedFile);
      return;
    }
    const trimmed = motionHintPrompt.trim();
    if (!trimmed) return;
    const solved = extractMocapFromVideoElementOrFrames(videoResult?.sampledFrames ?? [], {
      fileName: videoResult?.fileName || 'scene_hint_capture.mp4',
      startPosition: startPos,
      targetDurationSeconds: videoResult?.durationSeconds || shotDurationSeconds,
      sampleFps: 24,
      lockFootContacts,
      extractBodyProportions,
      smoothingStrength,
      motionHintPrompt: trimmed,
      referenceFrameDataUrl: videoResult?.referenceFrameDataUrl,
      contactSheetDataUrl: videoResult?.contactSheetDataUrl,
      visionAiAnalysis: videoResult?.visionAiAnalysis,
      mediaPipeDetections: videoResult?.mediaPipeDetections,
      nlfSmpl3dDetections: videoResult?.nlfSmpl3dDetections,
    });
    setVideoResult(solved);
    const initTrackMap: Record<string, boolean> = {};
    for (const tr of solved.actorTracks) {
      initTrackMap[tr.trackId] = true;
    }
    setSelectedPersonTrackIds(initTrackMap);
    const combinedTrajectories = solved.actorTracks.flatMap((t) => t.trajectoryKeyframes);
    buildSceneReconstructionForTrajectory(
      solved.fileName,
      trimmed,
      combinedTrajectories,
      solved.referenceFrameDataUrl || undefined,
      solved.referenceFramePixels,
      solved.visionAiAnalysis
    );
  };

  const triggerVideoPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveTab('video');
    if (videoInputRef.current) {
      videoInputRef.current.value = '';
      videoInputRef.current.click();
    }
  };

  const handleApplyToStage = () => {
    const trimmedHint = motionHintPrompt.trim();

    if (videoResult) {
      // Always ensure the latest Active Capture Layers (`lockFootContacts`, `extractBodyProportions`,
      // `smoothingStrength`) and `motionHintPrompt` are solved into `latestVideo` at apply time
      // while preserving `nlfSmpl3dDetections` and `mediaPipeDetections`.
      const latestVideo = extractMocapFromVideoElementOrFrames(videoResult.sampledFrames ?? [], {
        fileName: videoResult.fileName,
        startPosition: startPos,
        targetDurationSeconds: videoResult.durationSeconds || shotDurationSeconds,
        sampleFps: 24,
        lockFootContacts,
        extractBodyProportions,
        smoothingStrength,
        motionHintPrompt: trimmedHint || undefined,
        referenceFrameDataUrl: videoResult.referenceFrameDataUrl,
        contactSheetDataUrl: videoResult.contactSheetDataUrl,
        visionAiAnalysis: videoResult.visionAiAnalysis,
        mediaPipeDetections: videoResult.mediaPipeDetections,
        nlfSmpl3dDetections: videoResult.nlfSmpl3dDetections,
        nlfDiagnostic: videoResult.nlfDiagnostic,
      });

      const combinedTrajectories = latestVideo.actorTracks.flatMap((t) => t.trajectoryKeyframes);
      const xs = combinedTrajectories.map((k) => k.position.x);
      const ys = combinedTrajectories.map((k) => k.position.y);
      const latestScene =
        reconstructSurroundingScene && (trimmedHint.length > 0 || !sceneResult)
          ? reconstructSceneFromVideoFrame({
              fileName: latestVideo.fileName,
              sceneHintPrompt: trimmedHint || latestVideo.detectedActionLabel,
              referenceFrameDataUrl: latestVideo.referenceFrameDataUrl || undefined,
              framePixels: latestVideo.referenceFramePixels,
              humanTrajectoryBounds: {
                minX: xs.length ? Math.min(...xs) - 6 : 40,
                maxX: xs.length ? Math.max(...xs) + 6 : 60,
                minY: ys.length ? Math.min(...ys) - 6 : 40,
                maxY: ys.length ? Math.max(...ys) + 6 : 60,
              },
              maxSurroundingObjects: 4,
              visionAiAnalysis: latestVideo.visionAiAnalysis,
            })
          : sceneResult;

      const chosenSurrounding =
        reconstructSurroundingScene && latestScene
          ? latestScene.surroundingActors.filter((a) => selectedSurroundingIds[a.id] !== false)
          : undefined;

      const enabledTracks = latestVideo.actorTracks.filter(
        (t) => selectedPersonTrackIds[t.trackId] !== false
      );
      const tracksWithMode = (enabledTracks.length > 0 ? enabledTracks : latestVideo.actorTracks).map(
        (tr) => ({
          ...tr,
          bodyProportions: {
            ...tr.bodyProportions,
            humanoidMeshMode,
          },
        })
      );
      const primaryTrack = tracksWithMode[0];
      const baseBodyProps = primaryTrack?.bodyProportions || latestVideo.bodyProportions;

      onApplyMocap({
        actorId: actor.id,
        poseKeyframes: primaryTrack ? primaryTrack.poseKeyframes : latestVideo.poseKeyframes,
        trajectoryKeyframes: primaryTrack ? primaryTrack.trajectoryKeyframes : latestVideo.trajectoryKeyframes,
        actionDescription: primaryTrack
          ? `${primaryTrack.actionSummary} (Video Mocap: ${latestVideo.fileName})`
          : `${latestVideo.detectedActionLabel} (Video Mocap: ${latestVideo.fileName})`,
        durationSeconds: latestVideo.durationSeconds,
        bodyProportions:
          extractBodyProportions && baseBodyProps
            ? { ...baseBodyProps, humanoidMeshMode }
            : undefined,
        humanoidMeshMode,
        reconstructedEnvironment:
          reconstructSurroundingScene && latestScene ? latestScene.environment : undefined,
        surroundingActors: chosenSurrounding,
        actorTracks: tracksWithMode,
        cameraMotion: applyCameraMotion ? latestVideo.cameraMotion : undefined,
      });
      onClose();
      return;
    }

    const chosenSurrounding =
      reconstructSurroundingScene && sceneResult
        ? sceneResult.surroundingActors.filter((a) => selectedSurroundingIds[a.id] !== false)
        : undefined;

    if (fbxResult) {
      let fullBodyModelUrl: string | undefined;
      if (extractBodyProportions && fbxResult.exportedGlbBuffer) {
        const assetKey = `mocap-body-${actor.id}-${Date.now()}`;
        storeModelBuffer(assetKey, fbxResult.exportedGlbBuffer, fbxResult.fileName);
        fullBodyModelUrl = `model://${assetKey}`;
      }

      onApplyMocap({
        actorId: actor.id,
        poseKeyframes: fbxResult.poseKeyframes,
        trajectoryKeyframes: fbxResult.trajectoryKeyframes,
        actionDescription: `Mocap ${fbxResult.fileName} (${fbxResult.matchedBones.length} bones)`,
        durationSeconds: fbxResult.durationSeconds,
        bodyProportions: extractBodyProportions
          ? { ...fbxResult.bodyProportions, humanoidMeshMode }
          : undefined,
        humanoidMeshMode,
        fullBodyModelUrl,
        reconstructedEnvironment:
          reconstructSurroundingScene && sceneResult ? sceneResult.environment : undefined,
        surroundingActors: chosenSurrounding,
      });
      onClose();
    }
  };

  const activeProportions = videoResult?.bodyProportions || fbxResult?.bodyProportions;
  const canApply = Boolean(videoResult || fbxResult);

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      data-testid="mocap-studio-modal"
    >
      <div
        className="w-full max-w-5xl rounded-3xl bg-[#070b14] border border-indigo-500/30 shadow-[0_28px_90px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header with Aurora Light Beam */}
        <div className="relative flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#0b1122] via-[#0e172e] to-[#0a2236] border-b border-white/[0.08] overflow-hidden">
          <div className="pointer-events-none absolute -top-10 right-24 h-36 w-56 rotate-12 bg-gradient-to-br from-cyan-400/20 via-indigo-500/15 to-transparent blur-2xl" />
          <div className="relative flex items-center gap-3.5">
            <img
              src="./images/mocap-header-icon.png"
              alt="3D Mocap Studio"
              className="h-11 w-11 rounded-2xl object-cover border border-indigo-300/40 shadow-[0_0_24px_rgba(99,102,241,0.5)] shrink-0"
            />
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-extrabold text-white tracking-tight">
                  3D Mocap Studio
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-[11px] font-mono font-semibold text-emerald-300">
                  Target: {actor.name}
                </span>
              </div>
              <p className="text-xs text-slate-300/90 mt-0.5">
                Extracts multi-person motion, 3D SMPL body shapes, camera, and scene data from RGB video.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close 3D Mocap Studio"
            className="relative h-8 w-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Main Content Grid (Single Unified View Controlled by Active Layers) */}
        <div className="p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 bg-[#070b14]">
          {/* LEFT COLUMN (6 cols): Models, Upload, Scene Prompt, Active Layers, Attribution */}
          <div className="lg:col-span-6 space-y-3">
            {/* Hidden Native File Inputs (videoInputRef strictly accepts video files only) */}
            <input
              ref={videoInputRef}
              type="file"
              accept={ACCEPTED_VIDEO_ONLY_EXTENSIONS}
              data-testid="mocap-video-input"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAnyFileSelect(f);
                e.target.value = '';
              }}
            />
            <input
              ref={fbxInputRef}
              type="file"
              accept={ACCEPTED_MOCAP_AND_VIDEO_EXTENSIONS}
              data-testid="mocap-fbx-input"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAnyFileSelect(f);
                e.target.value = '';
              }}
            />

            {/* CARD 1: LOCAL GPU 3D SMPL MODEL STATUS & ONE-CLICK DOWNLOADER */}
            <MocapModelsManagerCard compact />

            {/* CARD 2: UPLOAD (VIDEO-ONLY FILE PICKER + DRAG & DROP ZONE) */}
            <div className="rounded-2xl bg-[#0c111d]/95 border border-white/[0.08] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Upload className="h-4 w-4 text-cyan-400" />
                  <span>Upload Video</span>
                </span>
                <span className="text-[10.5px] text-slate-400">
                  Video files only (.MP4 / .MOV / .WEBM / .MKV / .AVI)
                </span>
              </div>

              <button
                type="button"
                onClick={triggerVideoPicker}
                data-testid="mocap-tab-video"
                className="w-full flex items-center justify-between gap-2 py-2.5 px-3.5 rounded-xl text-xs font-bold transition-all border cursor-pointer bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white border-cyan-300/50 shadow-[0_4px_18px_rgba(37,99,235,0.35)]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                    <Video className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="truncate font-bold">Upload RGB Video</div>
                    <div className="text-[9.5px] font-mono text-cyan-100/90 font-normal truncate">
                      .MP4 / .MOV / .WEBM / .MKV / .AVI
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/80 shrink-0" />
              </button>

              {/* Unified Drag & Drop Zone + Video Preview */}
              <div
                onClick={triggerVideoPicker}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFile(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFile(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFile(false);
                  const droppedFile = e.dataTransfer?.files?.[0];
                  if (droppedFile) {
                    handleAnyFileSelect(droppedFile);
                  }
                }}
                className={`rounded-xl border-2 border-dashed p-3.5 text-center transition-all cursor-pointer ${
                  isDraggingFile
                    ? 'border-cyan-400 bg-cyan-950/40 scale-[1.01]'
                    : 'border-indigo-500/35 hover:border-cyan-400/60 bg-[#080c16]/90'
                }`}
              >
                {videoPreviewUrl ? (
                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    <video
                      src={videoPreviewUrl}
                      controls
                      muted
                      playsInline
                      className="w-full max-h-44 rounded-lg bg-black object-contain mx-auto border border-white/10"
                    />
                    <div className="flex items-center justify-between text-[11px] text-slate-300 px-1">
                      <span className="font-mono text-cyan-300 truncate">
                        🎬 {videoResult?.fileName || 'Loaded Video'}
                      </span>
                      <button
                        type="button"
                        onClick={triggerVideoPicker}
                        className="text-indigo-300 hover:text-indigo-200 underline cursor-pointer font-semibold"
                      >
                        Change Video
                      </button>
                    </div>
                  </div>
                ) : fbxResult ? (
                  <div className="py-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <FileBox className="h-7 w-7 text-emerald-400 mx-auto" />
                    <div className="text-xs font-bold text-emerald-300 font-mono">
                      ✓ {fbxResult.fileName} ({fbxResult.matchedBones.length}/19 Bones)
                    </div>
                    <button
                      type="button"
                      onClick={triggerVideoPicker}
                      className="inline-block text-[11px] text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
                    >
                      Select Another Video
                    </button>
                  </div>
                ) : (
                  <div className="py-2.5 space-y-1.5">
                    <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center mx-auto text-cyan-400">
                      <Upload className="h-4 w-4" />
                    </div>
                    <div className="text-xs font-bold text-white leading-snug">
                      Drag &amp; Drop Video File (Max 30s)
                      <span className="block font-semibold text-slate-200">or Click to Browse Video (.MP4 / .MOV / .WEBM)</span>
                    </div>
                    <p className="text-[10.5px] text-slate-400">
                      Supports up to{' '}
                      <span className="text-amber-300 font-semibold">30 seconds @ 24 FPS</span>{' '}
                      (frame-by-frame).
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 3: SCENE PROMPT */}
            <div className="rounded-2xl bg-[#0c111d]/95 border border-white/[0.08] p-3.5 space-y-2">
              <label className="text-xs font-bold text-white flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <SquarePen className="h-4 w-4 text-cyan-400" />
                  <span>Scene Prompt</span>
                </span>
                <span className="text-[10.5px] font-medium text-cyan-300 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  <span>Auto-Parse: Cast &amp; 3D Place</span>
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={motionHintPrompt}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setMotionHintPrompt(nextVal);
                    applyHintAndOptionsLive(nextVal, lockFootContacts, extractBodyProportions);
                  }}
                  data-testid="mocap-hint-input"
                  placeholder="e.g., doctor and patient in a hospital / 2 soldiers in a city"
                  className="flex-1 rounded-xl bg-[#070a12] border border-white/[0.1] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="button"
                  onClick={handleReAnalyzeWithHint}
                  disabled={isProcessing}
                  data-testid="mocap-resolve-hint-btn"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 border border-indigo-400/40 text-white text-xs font-bold shrink-0 cursor-pointer shadow-md shadow-indigo-950/50"
                  title="Solve cast, camera, and 3D place from video & hint"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>Re-Solve</span>
                </button>
              </div>
            </div>

            {/* CARD 4: ACTIVE LAYERS */}
            <div
              data-testid="scope-motion-body-scene"
              className="rounded-2xl bg-[#0c111d]/95 border border-white/[0.08] p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Layers className="h-4 w-4 text-cyan-400" />
                  <span>Active Layers</span>
                </span>
                <span className="text-[10.5px] text-slate-400">
                  Select what to capture and solve
                </span>
              </div>

              <div className="space-y-2 pt-0.5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lockFootContacts}
                    onChange={(e) => {
                      const nextLock = e.target.checked;
                      setLockFootContacts(nextLock);
                      applyHintAndOptionsLive(motionHintPrompt, nextLock, extractBodyProportions);
                    }}
                    className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-blue-500 cursor-pointer"
                  />
                  <div className="text-[11.5px] font-medium text-slate-100 flex items-center gap-2">
                    <Footprints className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>GVHMR Gravity-Aligned Foot Contact Lock (z = 0)</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extractBodyProportions}
                    onChange={(e) => {
                      const nextProps = e.target.checked;
                      setExtractBodyProportions(nextProps);
                      applyHintAndOptionsLive(motionHintPrompt, lockFootContacts, nextProps);
                    }}
                    className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-blue-500 cursor-pointer"
                  />
                  <div className="text-[11.5px] font-medium text-slate-100 flex items-center gap-2">
                    <UserCheck className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <span>SMPL 3D Body Shape, Proportions &amp; SkinnedMesh</span>
                  </div>
                </label>

                {/* 3D Character Body Mesh Type Selector: Real SMPL Body vs Mixamo Y-Bot */}
                <div
                  data-testid="mocap-mesh-mode-selector"
                  className="rounded-xl bg-[#080c16] border border-white/[0.07] p-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[10.5px] px-0.5">
                    <span className="font-semibold text-slate-200">
                      3D Stage Character Mesh:
                    </span>
                    <span className="font-mono text-[9.5px] text-cyan-300">
                      {humanoidMeshMode === 'smpl'
                        ? 'True 6,890v SMPL Body'
                        : 'Mixamo Y-Bot (Unstretched)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setHumanoidMeshMode('smpl')}
                      data-testid="mocap-mesh-mode-smpl"
                      className={`px-2.5 py-1.5 rounded-lg text-left transition-all border cursor-pointer ${
                        humanoidMeshMode === 'smpl'
                          ? 'bg-cyan-500/20 border-cyan-400/60 text-white shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                          : 'bg-slate-900/70 border-white/[0.06] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-[11px] font-bold flex items-center justify-between">
                        <span>Real SMPL Body</span>
                        <span className="text-[9px] font-mono text-cyan-300">6,890v</span>
                      </div>
                      <div className="text-[9.5px] text-slate-300/80 truncate">
                        True human β body from video
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHumanoidMeshMode('ybot')}
                      data-testid="mocap-mesh-mode-ybot"
                      className={`px-2.5 py-1.5 rounded-lg text-left transition-all border cursor-pointer ${
                        humanoidMeshMode === 'ybot'
                          ? 'bg-indigo-500/20 border-indigo-400/60 text-white shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                          : 'bg-slate-900/70 border-white/[0.06] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-[11px] font-bold flex items-center justify-between">
                        <span>Mixamo Y-Bot</span>
                        <span className="text-[9px] font-mono text-indigo-300">1:1</span>
                      </div>
                      <div className="text-[9.5px] text-slate-300/80 truncate">
                        Natural Y-Bot (no stretching)
                      </div>
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyCameraMotion}
                    onChange={(e) => setApplyCameraMotion(e.target.checked)}
                    data-testid="toggle-apply-camera"
                    className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-blue-500 cursor-pointer"
                  />
                  <div className="text-[11.5px] font-medium text-slate-100 flex items-center gap-2">
                    <Camera className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                    <span>Apply Extracted 3D Camera Motion, Framing &amp; Lens</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reconstructSurroundingScene}
                    onChange={(e) => setReconstructSurroundingScene(e.target.checked)}
                    data-testid="toggle-reconstruct-scene"
                    className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-blue-500 cursor-pointer"
                  />
                  <div className="text-[11.5px] font-medium text-slate-100 flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span>Include 3D Environment, Beach/Street &amp; Props</span>
                  </div>
                </label>
              </div>

              {/* Smoothing (Savitzky-Golay) Slider */}
              <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Smoothing (Savitzky-Golay)</span>
                  </span>
                  <span className="font-mono font-bold text-cyan-300">
                    {Math.round(smoothingStrength * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(smoothingStrength * 100)}
                  onChange={(e) => {
                    const nextSmooth = Number(e.target.value) / 100;
                    setSmoothingStrength(nextSmooth);
                    applyHintAndOptionsLive(
                      motionHintPrompt,
                      lockFootContacts,
                      extractBodyProportions,
                      nextSmooth
                    );
                  }}
                  data-testid="mocap-smoothing-slider"
                  className="w-full h-1.5 bg-slate-800 rounded-lg accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>

            {/* CARD 5: ATTRIBUTION & OPEN SOURCE NOTICE */}
            <div className="rounded-2xl bg-[#0c111d]/95 border border-white/[0.08] px-3.5 py-2.5 flex items-center justify-between gap-2 text-[10.5px]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-300 shrink-0">
                  <Info className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-slate-200 truncate">
                    Powered by <strong className="text-white">toyxyz/toyxyz_RGBMocap</strong>
                  </div>
                  <div className="text-[9.5px] text-slate-400 truncate">
                    MIT License • GVHMR World-Grounded Multi-Person &amp; Camera Recovery
                  </div>
                </div>
              </div>
              <a
                href="https://github.com/toyxyz/toyxyz_RGBMocap"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-cyan-300 hover:text-cyan-200 font-semibold shrink-0 transition-colors"
              >
                <span>GitHub</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {errorMsg && (
              <div className="rounded-xl bg-rose-950/60 border border-rose-500/40 p-2.5 text-xs text-rose-200">
                ⚠️ {errorMsg}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (6 cols): Capture Telemetry */}
          <div className="lg:col-span-6 space-y-3">
            <div className="rounded-2xl bg-[#0c111d]/95 border border-cyan-500/20 p-4 space-y-3 h-full flex flex-col justify-between relative overflow-hidden">
              <div className="space-y-3 relative z-10">
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
                  <span className="text-sm font-bold text-white flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-cyan-400" />
                    <span>Capture Telemetry</span>
                  </span>
                  {isProcessing && (
                    <span className="text-[10px] font-mono text-amber-300 animate-pulse">
                      {processingStage || 'Analyzing Video Frames...'} ({processingPercent}%)
                    </span>
                  )}
                </div>

                {isProcessing && (
                  <div className="rounded-lg bg-[#080b12] border border-indigo-500/35 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-cyan-300">{processingStage || 'Decoding & analyzing video frames...'}</span>
                      <span className="text-indigo-300">{processingPercent}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-200"
                        style={{ width: `${Math.max(8, processingPercent)}%` }}
                      />
                    </div>
                  </div>
                )}

                {!videoResult && !fbxResult ? (
                  <div className="py-12 px-4 text-center flex flex-col items-center justify-center space-y-2">
                    {/* 3D Rendered Holographic Video Player Artwork (Non-Vector) */}
                    <div className="relative flex items-center justify-center select-none pointer-events-none">
                      <img
                        src="./images/mocap-video-hero.png"
                        alt="Upload RGB Video"
                        className="w-64 h-auto object-contain drop-shadow-[0_14px_36px_rgba(6,182,212,0.28)]"
                      />
                    </div>

                    <div className="space-y-1.5 max-w-sm">
                      <h3 className="text-base font-bold text-white">
                        Upload a Video
                      </h3>
                      <p className="text-xs text-slate-300">
                        Choose an RGB video file on the left.
                      </p>
                      <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                        After detection, people (1..N), 3D camera motion, body proportions, and nearby 3D buildings will appear here.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-[11px]">
                    {/* 1. Motion Summary + toyxyz_RGBMocap Live Skeleton & Bounding-Box Inspector */}
                    <div className="rounded-lg bg-[#080b12] border border-emerald-500/30 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>
                            {videoResult ? videoResult.detectedActionLabel : fbxResult?.fileName}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {(videoResult ? videoResult.durationSeconds : fbxResult?.durationSeconds)?.toFixed(1)}s
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-300 leading-relaxed">
                        {videoResult ? videoResult.summaryText : fbxResult?.summaryText}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {videoResult?.extractionEngine && (
                          <span
                            data-testid="mocap-engine-telemetry-badge"
                            className={`px-1.5 py-0.5 rounded font-mono text-[9.5px] font-semibold border ${
                              videoResult.extractionEngine === 'nlf-smpl24-rotvec' ||
                              videoResult.extractionEngine === 'nlf-smpl24-joints'
                                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                                : videoResult.extractionEngine === 'mediapipe-33-3d'
                                  ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                                  : 'bg-slate-700/60 text-slate-300 border-slate-500/40'
                            }`}
                          >
                            {videoResult.extractionEngine === 'nlf-smpl24-rotvec'
                              ? '🟢 GPU NLF-Large SMPL-24 Full-Rotation'
                              : videoResult.extractionEngine === 'nlf-smpl24-joints'
                                ? '🟢 GPU NLF-Large SMPL-24 3D Joints'
                                : videoResult.extractionEngine === 'mediapipe-33-3d'
                                  ? '🟡 MediaPipe 33-Joint 3D'
                                  : '⚪ CV Silhouette Fallback'}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono text-[9.5px]">
                          Keyframes: {videoResult ? videoResult.poseKeyframes.length : fbxResult?.poseKeyframes.length}
                        </span>
                        {videoResult && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono text-[9.5px]">
                            People Tracked: {videoResult.detectedPersonCount}
                          </span>
                        )}
                        {fbxResult && (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono text-[9.5px]">
                            Matched Bones: {fbxResult.matchedBones.length}/19
                          </span>
                        )}
                      </div>
                      {videoResult?.nlfDiagnostic &&
                        videoResult.extractionEngine !== 'nlf-smpl24-rotvec' &&
                        videoResult.extractionEngine !== 'nlf-smpl24-joints' && (
                          <div
                            data-testid="mocap-nlf-diagnostic-banner"
                            className="rounded bg-amber-950/50 border border-amber-500/35 px-2 py-1 text-[9.5px] font-mono text-amber-200"
                          >
                            ⚠️ NLF GPU status: {videoResult.nlfDiagnostic}
                          </div>
                        )}

                      {/* toyxyz_RGBMocap Live 17-Joint Skeleton & Bounding-Box Overlay Preview */}
                      {videoResult && videoResult.actorTracks.length > 0 && (() => {
                        const maxFrames = Math.max(
                          1,
                          videoResult.actorTracks[0]?.frameLandmarks?.length ??
                            videoResult.poseKeyframes.length
                        );
                        const safeFrameIdx = Math.min(maxFrames - 1, Math.max(0, previewFrameIdx));
                        const frameTimeSec =
                          videoResult.actorTracks[0]?.frameLandmarks?.[safeFrameIdx]?.timeSec ??
                          videoResult.poseKeyframes[safeFrameIdx]?.time ??
                          0;
                        return (
                          <div
                            data-testid="mocap-skeleton-overlay-inspector"
                            className="rounded-lg bg-slate-950/90 border border-cyan-500/30 p-2 space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-[9.5px] font-mono">
                              <span className="text-cyan-300 font-semibold">
                                🦴 toyxyz_RGBMocap 17-Joint Skeleton + BBox + FootMR Preview
                              </span>
                              <span className="text-slate-300">
                                Frame {safeFrameIdx + 1}/{maxFrames} (t={frameTimeSec.toFixed(2)}s)
                              </span>
                            </div>
                            <div className="relative w-full aspect-video max-h-52 mx-auto rounded bg-[#070a12] overflow-hidden border border-white/10">
                              {videoResult.referenceFrameDataUrl && (
                                <img
                                  src={videoResult.referenceFrameDataUrl}
                                  alt="Mocap Frame Backdrop"
                                  className="absolute inset-0 w-full h-full object-fill opacity-65"
                                />
                              )}
                              <svg
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                className="absolute inset-0 w-full h-full"
                              >
                                {videoResult.actorTracks.map((tr, tIdx) => {
                                  if (selectedPersonTrackIds[tr.trackId] === false) return null;
                                  const lm =
                                    tr.frameLandmarks?.[
                                      Math.min(
                                        safeFrameIdx,
                                        Math.max(0, (tr.frameLandmarks?.length ?? 1) - 1)
                                      )
                                    ];
                                  if (!lm) return null;
                                  const j = lm.joints;
                                  const color = tr.clothingColorHex || '#38bdf8';
                                  const bx = lm.bbox.minX * 100;
                                  const by = lm.bbox.minY * 100;
                                  const bw = Math.max(6, (lm.bbox.maxX - lm.bbox.minX) * 100);
                                  const bh = Math.max(12, (lm.bbox.maxY - lm.bbox.minY) * 100);
                                  const bones2D: Array<[keyof typeof j, keyof typeof j]> = [
                                    ['head', 'neck'],
                                    ['neck', 'leftShoulder'],
                                    ['neck', 'rightShoulder'],
                                    ['leftShoulder', 'leftElbow'],
                                    ['leftElbow', 'leftWrist'],
                                    ['rightShoulder', 'rightElbow'],
                                    ['rightElbow', 'rightWrist'],
                                    ['neck', 'hips'],
                                    ['hips', 'leftHip'],
                                    ['hips', 'rightHip'],
                                    ['leftHip', 'leftKnee'],
                                    ['leftKnee', 'leftAnkle'],
                                    ['rightHip', 'rightKnee'],
                                    ['rightKnee', 'rightAnkle'],
                                  ];
                                  return (
                                    <g key={tr.trackId}>
                                      {/* Person Bounding Box */}
                                      <rect
                                        x={bx}
                                        y={by}
                                        width={bw}
                                        height={bh}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth="0.7"
                                        strokeDasharray="2 1"
                                      />
                                      <text
                                        x={Math.max(2, bx + 1)}
                                        y={Math.max(6, by - 1.5)}
                                        fill={color}
                                        fontSize="4.2"
                                        fontFamily="monospace"
                                        fontWeight="bold"
                                      >
                                        #{tIdx + 1} {tr.actorName}
                                      </text>
                                      {/* 17-Joint Full-Body Skeleton Limb Lines */}
                                      {bones2D.map(([aKey, bKey]) => {
                                        const ptA = j[aKey];
                                        const ptB = j[bKey];
                                        const y1 = Math.min(98, ptA.y * 100);
                                        const y2 = Math.min(98, ptB.y * 100);
                                        const isOffscreenLimb = ptA.y > 1.0 || ptB.y > 1.0;
                                        return (
                                          <line
                                            key={`${tr.trackId}-${aKey}-${bKey}`}
                                            x1={ptA.x * 100}
                                            y1={y1}
                                            x2={ptB.x * 100}
                                            y2={y2}
                                            stroke={color}
                                            strokeWidth="1.1"
                                            strokeOpacity={isOffscreenLimb ? 0.55 : 1}
                                            strokeDasharray={isOffscreenLimb ? '1.5 1' : undefined}
                                            strokeLinecap="round"
                                          />
                                        );
                                      })}
                                      {/* Joint Keypoints (full 17-joint body) */}
                                      {(Object.keys(j) as Array<keyof typeof j>).map((k) => {
                                        const cy = Math.min(98, j[k].y * 100);
                                        return (
                                          <circle
                                            key={`${tr.trackId}-jt-${k}`}
                                            cx={j[k].x * 100}
                                            cy={cy}
                                            r={k === 'head' ? 1.8 : 1.1}
                                            fill="#ffffff"
                                            fillOpacity={j[k].y > 1.0 ? 0.6 : 1}
                                            stroke={color}
                                            strokeWidth="0.6"
                                          />
                                        );
                                      })}
                                      {/* FootMR Contact Lock Indicators */}
                                      {lm.leftFootContact && (
                                        <circle
                                          cx={j.leftAnkle.x * 100}
                                          cy={Math.min(98, j.leftAnkle.y * 100)}
                                          r={2.2}
                                          fill="none"
                                          stroke="#22c55e"
                                          strokeWidth="0.9"
                                        />
                                      )}
                                      {lm.rightFootContact && (
                                        <circle
                                          cx={j.rightAnkle.x * 100}
                                          cy={Math.min(98, j.rightAnkle.y * 100)}
                                          r={2.2}
                                          fill="none"
                                          stroke="#22c55e"
                                          strokeWidth="0.9"
                                        />
                                      )}
                                    </g>
                                  );
                                })}
                              </svg>
                            </div>
                            {maxFrames > 1 && (
                              <div className="flex items-center gap-2 pt-0.5">
                                <span className="text-[9px] font-mono text-slate-400 shrink-0">Scrub Frame:</span>
                                <input
                                  type="range"
                                  min={0}
                                  max={maxFrames - 1}
                                  value={safeFrameIdx}
                                  onChange={(e) => setPreviewFrameIdx(Number(e.target.value))}
                                  data-testid="mocap-frame-scrubber"
                                  className="w-full h-1.5 bg-slate-800 rounded-lg accent-cyan-400 cursor-pointer"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {videoResult?.contactSheetDataUrl && (
                        <div className="pt-1 space-y-1">
                          <div className="text-[9px] font-mono text-slate-400">
                            Sampled 6-Frame Timestamped Video Filmstrip:
                          </div>
                          <img
                            src={videoResult.contactSheetDataUrl}
                            alt="Sampled Video Frames Filmstrip"
                            className="w-full max-h-36 object-contain bg-black/60 rounded border border-white/10"
                          />
                        </div>
                      )}
                    </div>

                    {/* 2. Multi-Person Tracks Card (1..N People in Video) */}
                    {videoResult && videoResult.actorTracks.length > 0 && (
                      <div className="rounded-lg bg-[#080b12] border border-cyan-500/30 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-cyan-300 uppercase flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            <span>
                              Detected People in Video ({videoResult.actorTracks.length}{' '}
                              {videoResult.actorTracks.length === 1 ? 'Person' : 'People'})
                            </span>
                          </span>
                          <span className="font-mono text-[9px] text-slate-400">
                            19-Bone IK + 3D Path
                          </span>
                        </div>

                        <div className="space-y-1">
                          {videoResult.actorTracks.map((tr) => (
                            <label
                              key={tr.trackId}
                              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-slate-900/90 border border-white/[0.06] text-[10px] cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={selectedPersonTrackIds[tr.trackId] !== false}
                                  onChange={(e) =>
                                    setSelectedPersonTrackIds((prev) => ({
                                      ...prev,
                                      [tr.trackId]: e.target.checked,
                                    }))
                                  }
                                  className="rounded border-white/20 bg-slate-950 text-cyan-500"
                                />
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0 border border-white/20"
                                  style={{ backgroundColor: tr.clothingColorHex }}
                                />
                                <div className="truncate">
                                  <span className="font-bold text-white">{tr.actorName}</span>
                                  <span className="text-slate-400 ml-1.5">({tr.detectedActionLabel})</span>
                                </div>
                              </div>
                              <span className="font-mono text-[9px] text-cyan-300 shrink-0">
                                ({Math.round(tr.startPosition.x)},{Math.round(tr.startPosition.y)}) → (
                                {Math.round(tr.endPosition.x)},{Math.round(tr.endPosition.y)})
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Extracted Camera Motion & Lens Card */}
                    {videoResult?.cameraMotion && applyCameraMotion && (
                      <div className="rounded-lg bg-[#080b12] border border-purple-500/30 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-purple-300 uppercase flex items-center gap-1">
                            <Camera className="h-3.5 w-3.5" />
                            <span>Solved 3D Camera Motion &amp; Lens</span>
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-200 font-mono text-[9px]">
                            {videoResult.cameraMotion.customFocalLengthMm
                              ? `${videoResult.cameraMotion.customFocalLengthMm}mm`
                              : videoResult.cameraMotion.focalLength}{' '}
                            • {videoResult.cameraMotion.angle} • {videoResult.cameraMotion.movementType}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-300">
                          {videoResult.cameraMotion.summaryText}
                        </div>
                      </div>
                    )}

                    {/* 4. SMPL Body Proportions Readout */}
                    {activeProportions && extractBodyProportions && (
                      <div className="rounded-lg bg-[#080b12] border border-white/[0.07] p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-bold text-cyan-300 uppercase">
                            🧍 Extracted 3D Body Proportions
                          </div>
                          {activeProportions.hasSkinnedMesh && (
                            <span className="text-[8.5px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              {humanoidMeshMode === 'smpl'
                                ? `SMPL β (${activeProportions.vertexCount}v Real Body)`
                                : 'Mixamo Y-Bot (Natural 1:1)'}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono">
                          <div className="bg-slate-900/90 p-1.5 rounded border border-white/[0.05]">
                            <div className="text-slate-400 text-[9px]">Height</div>
                            <div className="text-white">{activeProportions.heightMeters.toFixed(2)}m</div>
                          </div>
                          <div className="bg-slate-900/90 p-1.5 rounded border border-white/[0.05]">
                            <div className="text-slate-400 text-[9px]">Shoulders</div>
                            <div className="text-white">
                              {(activeProportions.shoulderWidthRatio * 100).toFixed(0)}%
                            </div>
                          </div>
                          <div className="bg-slate-900/90 p-1.5 rounded border border-white/[0.05]">
                            <div className="text-slate-400 text-[9px]">Hips</div>
                            <div className="text-white">
                              {(activeProportions.hipWidthRatio * 100).toFixed(0)}%
                            </div>
                          </div>
                          <div className="bg-slate-900/90 p-1.5 rounded border border-white/[0.05]">
                            <div className="text-slate-400 text-[9px]">Bulk (β)</div>
                            <div className="text-white">{activeProportions.bulkFactor.toFixed(2)}x</div>
                          </div>
                        </div>
                        {videoResult && videoResult.actorTracks.length > 1 && (
                          <div className="space-y-1 pt-1 border-t border-white/[0.05]">
                            {videoResult.actorTracks.map((tr, idx) => (
                              <div
                                key={`prop-${tr.trackId}`}
                                className="flex items-center justify-between text-[9.5px] font-mono text-slate-300"
                              >
                                <span className="truncate">
                                  #{idx + 1} {tr.actorName}
                                </span>
                                <span className="text-cyan-300 shrink-0">
                                  {tr.bodyProportions.heightMeters.toFixed(2)}m • Sh{' '}
                                  {(tr.bodyProportions.shoulderWidthRatio * 100).toFixed(0)}% • Hip{' '}
                                  {(tr.bodyProportions.hipWidthRatio * 100).toFixed(0)}% •{' '}
                                  {tr.bodyProportions.bulkFactor.toFixed(2)}x
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. Reconstructed Building & Surrounding 3D Objects */}
                    {reconstructSurroundingScene && sceneResult && (
                      <div className="rounded-lg bg-[#080b12] border border-amber-500/30 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-amber-300 uppercase">
                            🏛️ {sceneResult.detectedSettingLabel}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 font-mono text-[9px]">
                            {sceneResult.isIndoorBuilding ? 'Indoor Building' : 'Outdoor Set'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {sceneResult.lightingSummary}
                        </div>
                        <div className="space-y-1 pt-1">
                          <div className="text-[9.5px] font-semibold text-slate-300">
                            Surrounding 3D Buildings &amp; Objects to Place ({sceneResult.surroundingActors.length}):
                          </div>
                          {sceneResult.surroundingActors.map((sur) => (
                            <label
                              key={sur.id}
                              className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-slate-900/90 border border-white/[0.05] text-[10px] cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <input
                                  type="checkbox"
                                  checked={selectedSurroundingIds[sur.id] !== false}
                                  onChange={(e) =>
                                    setSelectedSurroundingIds((prev) => ({
                                      ...prev,
                                      [sur.id]: e.target.checked,
                                    }))
                                  }
                                  className="rounded border-white/20 bg-slate-950 text-amber-500"
                                />
                                <span
                                  className="h-2.5 w-2.5 rounded-sm shrink-0 border border-white/20"
                                  style={{ backgroundColor: sur.color || '#475569' }}
                                />
                                <span className="text-slate-200 truncate">{sur.name}</span>
                              </div>
                              <span className="font-mono text-[9px] text-slate-400 shrink-0">
                                ({Math.round(sur.trajectory.startPosition.x)},{' '}
                                {Math.round(sur.trajectory.startPosition.y)})
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Action Buttons */}
              <div className="pt-3 border-t border-white/[0.08] flex items-center justify-end gap-2.5 relative z-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canApply || isProcessing}
                  onClick={handleApplyToStage}
                  data-testid="apply-mocap-to-stage-btn"
                  className={`px-4.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                    canApply && !isProcessing
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white border-cyan-300/50 shadow-[0_0_24px_rgba(37,99,235,0.45)] cursor-pointer'
                      : 'bg-gradient-to-r from-blue-600/50 to-indigo-600/50 text-white/60 border-blue-400/25 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Apply to 3D Stage</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
