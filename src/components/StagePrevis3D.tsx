import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useShotStore, PrevisRendererFn, getEffectiveStageLights } from '../stores/useShotStore';
import { logger } from '../stores/useLogStore';
import { FocalLength, AspectRatio } from '../types/shotspec';
import {
  interpolateTrajectoryPosition,
  interpolateCameraPosition,
  interpolateActorPoseAtTime,
  interpolateObjectRotationAtTime,
} from '../engine/trajectoryMath';
import { preloadGltfModels } from '../engine/gltfModelLoader';
import { registerModelFile } from '../services/modelStorage';
import { renderOfflinePrevisPasses } from '../engine/offlinePrevisRenderer';
import {
  preloadMannequinModel,
  solveLimbIK,
  solveLookAt,
  groundBothFeet,
  resetToRestPose,
  applyPosePreset,
  exportBonePose,
  applyBonePose,
  isSyntheticCompilerPose,
  POSE_PRESETS,
  HumanoidRig,
  evaluateGait,
  JOINT_DISC_DEFINITIONS,
  createJointDiscMesh,
  createBoneTransformGizmo,
  setGizmoHoveredAxis,
  setJointDiscHovered,
  GizmoAxisType,
  applyBoneRotationDelta,
  applyBoneTrackballDelta,
  applyBoneTranslationDelta,
  resetBoneToRest,
  detectObjectPoseCategory,
  getObjectPosePresetsForCategory,
  findObjectPosePresetById,
  applyNonHumanMeshPoseArticulation,
  getObjectAwareStagePlacements,
  OBJECT_CATEGORY_LABELS,
  evaluateReadyMadeHumanoidClip,
  evaluateReadyMadeObjectClip,
  getReadyMadeMotionsForCategory,
} from '../engine/kinematics';
import { HumanoidBone } from '../engine/procedural3D/sculptSpec';

import { setLayerRecursively, applyGroundSurface, buildPerimeterEnvironment } from '../engine/staging/environmentBuilder';
import { createSubjectMesh, applyObjectTargetColor } from '../engine/staging/subjectMeshFactory';
import { StageViewfinderOverlays, updateFrustumGeometry } from './stage/StageViewfinderOverlays';
import { StageTopViewRadar } from './stage/StageTopViewRadar';
import {
  disposeObject3D,
  createIKHandleGizmo,
} from './stage/stageGizmoHelpers';
import {
  Play,
  Pause,
  RotateCcw,
  Camera,
  Eye,
  Layers,
  Grid,
  Compass,
  Target,
  Upload,
  Tag,
  Activity,
  Disc3,

  ArrowLeftRight,
} from 'lucide-react';

const FOV_MAP: Record<FocalLength, number> = {
  '18mm': 100,
  '24mm': 84,
  '35mm': 63,
  '50mm': 47,
  '85mm': 28,
  '135mm': 18,
};

const ASPECT_RATIOS: Record<AspectRatio, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '2.39:1': 2.39,
  '4:3': 4 / 3,
  '1:1': 1.0,
};

type ViewMode = 'split' | 'stage' | 'viewfinder';


export interface StagePrevis3DProps {
  externalTime?: number;
  isExternalPlaying?: boolean;
  onTimeChange?: (t: number) => void;
  initialViewMode?: ViewMode;
  showToolbar?: boolean;
  showBottomTransport?: boolean;
}

export const StagePrevis3D: React.FC<StagePrevis3DProps> = ({
  externalTime,
  isExternalPlaying,
  onTimeChange,
  initialViewMode = 'split',
  showToolbar = true,
  showBottomTransport,
}) => {
  const {
    shot,
    selectedActorId,
    setSelectedActorId,
    addActor,
    updateActor,
    updateActorPositionAtTime,
    updateCameraPositionAtTime,
    recordActorPoseAtTime,
    setClaymationMode,
    removeActor,
    registerPrevisRenderer,
    setPrevisVideo,
    setPrevisOpenPose,
    setPrevisDepth,
    setPrevisRendering,
    beginGesture,
    endGesture,
    focusCameraOnSubject,
    stagingMoveMode,
    setStagingMoveMode,
    updateAspectRatio,
  } = useShotStore();

  const shotRef = useRef(shot);
  shotRef.current = shot;

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isSwapped, setIsSwapped] = useState<boolean>(true);
  const viewModeRef = useRef<ViewMode>(initialViewMode);
  const initStageRendererRef = useRef<(() => void) | null>(null);
  const initVfRendererRef = useRef<(() => void) | null>(null);
  const updateSizesRef = useRef<(() => void) | null>(null);
  const glbFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingGlb, setIsDraggingGlb] = useState(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  isPlayingRef.current = isPlaying;
  const [currentTime, setCurrentTime] = useState<number>(externalTime ?? 0);
  const currentTimeRef = useRef<number>(externalTime ?? 0);
  currentTimeRef.current = currentTime;
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showRuleOfThirds, setShowRuleOfThirds] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const showLabelsRef = useRef<boolean>(true);
  showLabelsRef.current = showLabels;

  // 3D Direct Manipulation & Dragging State
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseVecRef = useRef(new THREE.Vector2());

  const dragPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragStartStagePosRef = useRef<{ x: number; y: number; z: number }>({ x: 50, y: 50, z: 0 });
  const objectAxisPlaneRef = useRef(new THREE.Plane());
  const activeObjectAxisDragRef = useRef<{
    axis: 'x' | 'y' | 'z';
    targetId: string;
    axisVec: THREE.Vector3;
    startHitPoint: THREE.Vector3;
    startStagePos: { x: number; y: number; z: number };
  } | null>(null);
  const [isFloorDragging, setIsFloorDragging] = useState(false);
  const isFloorDraggingRef = useRef(false);
  const draggedActorIdRef = useRef<string | null>(null);
  const floorDragOffsetRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const [showPosingHandles, setShowPosingHandles] = useState<boolean>(true);
  const showPosingHandlesRef = useRef<boolean>(true);
  showPosingHandlesRef.current = showPosingHandles;
  const [posingMode, setPosingMode] = useState<'fk' | 'ik'>('fk');
  const posingModeRef = useRef<'fk' | 'ik'>('fk');
  posingModeRef.current = posingMode;
  const [selectedBone, setSelectedBone] = useState<HumanoidBone | null>(null);
  const selectedBoneRef = useRef<HumanoidBone | null>(null);
  selectedBoneRef.current = selectedBone;
  const [gizmoMode, setGizmoMode] = useState<'rotate' | 'translate'>('rotate');
  const gizmoModeRef = useRef<'rotate' | 'translate'>('rotate');
  gizmoModeRef.current = gizmoMode;
  const ikHandlesGroupRef = useRef<THREE.Group | null>(null);
  const jointDiscsGroupRef = useRef<THREE.Group | null>(null);
  const boneGizmoGroupRef = useRef<THREE.Group | null>(null);
  const hoveredGizmoAxisRef = useRef<GizmoAxisType | null>(null);
  const hoveredJointDiscRef = useRef<THREE.Object3D | null>(null);
  const pointerDownTimestampRef = useRef<number>(0);
  const [hoverDirectionHud, setHoverDirectionHud] = useState<{
    title: string;
    hint: string;
    color: string;
    badge: string;
    axis?: GizmoAxisType;
  } | null>(null);
  const activeGizmoDragRef = useRef<{
    axis: 'x' | 'y' | 'z' | 'center';
    bone: HumanoidBone;
    actorId: string;
    startPointer: { x: number; y: number };
    startQuat: THREE.Quaternion;
    startPos: THREE.Vector3;
  } | null>(null);
  const activeIKHandleRef = useRef<{
    handleType: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'head';
    actorId: string;
  } | null>(null);
  const ikDragPlaneRef = useRef<THREE.Plane>(new THREE.Plane());
  const centerStageCameraRef = useRef<((targetActorId?: string) => void) | null>(null);

  // Sync external props
  useEffect(() => {
    if (externalTime !== undefined) {
      setCurrentTime(externalTime);
    }
  }, [externalTime]);

  useEffect(() => {
    if (isExternalPlaying !== undefined) {
      setIsPlaying(isExternalPlaying);
    }
  }, [isExternalPlaying]);

  useEffect(() => {
    if (initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [initialViewMode]);

  // Containers
  const stageMountRef = useRef<HTMLDivElement | null>(null);
  const viewfinderMountRef = useRef<HTMLDivElement | null>(null);

  // Three.js instances for Stage View
  const stageRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const stageSceneRef = useRef<THREE.Scene | null>(null);
  const stageCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const stageControlsRef = useRef<OrbitControls | null>(null);

  // Three.js instances for Viewfinder
  const vfRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const vfCameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Dynamic Scene Meshes
  const cameraGizmoGroupRef = useRef<THREE.Group | null>(null);
  const cameraFloorAnchorRef = useRef<THREE.Group | null>(null);
  const frustumMeshRef = useRef<THREE.LineSegments | null>(null);
  const trajectoryLineRef = useRef<THREE.Line | null>(null);
  const actorMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const lightsGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const stageBackdropMeshRef = useRef<THREE.Mesh | null>(null);
  const floorMeshRef = useRef<THREE.Mesh | null>(null);
  const environmentGroupRef = useRef<THREE.Group | null>(null);
  const hearthLightRef = useRef<THREE.PointLight | null>(null);
  const hearthParticlesRef = useRef<THREE.Points | null>(null);

  // Synchronized Reference Video Player in Viewfinder
  const vfVideoRef = useRef<HTMLVideoElement | null>(null);
  const [viewfinderOverlayMode, setViewfinderOverlayMode] = useState<'3d-only' | 'overlay' | 'video-only'>('3d-only');
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.55);

  const duration = shot.durationSeconds;

  // Toggle 3D object label sprites visibility
  useEffect(() => {
    if (!stageSceneRef.current) return;
    stageSceneRef.current.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Sprite) {
        child.visible = showLabels;
      }
    });
  }, [showLabels]);

  // 1. Animation playback loop (standalone mode only)
  useEffect(() => {
    // If controlled externally by MotionPrevisStage, do NOT run internal ticker
    if (externalTime !== undefined) return;
    if (!isPlaying) return;

    let animId: number;
    let last = performance.now();

    const tick = (now: number) => {
      const deltaSec = (now - last) / 1000;
      last = now;

      setCurrentTime((prev) => {
        const next = prev + deltaSec;
        if (next >= duration) {
          onTimeChange?.(0);
          return 0; // loop
        }
        onTimeChange?.(next);
        return next;
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, duration, onTimeChange, externalTime]);

  // Synchronize Reference Video Player with 24fps Transport
  useEffect(() => {
    const video = vfVideoRef.current;
    if (!video || !shot.vfxReference?.videoUrl) return;

    const vidDur = video.duration || duration || 4;
    const targetTime = Math.min(vidDur - 0.05, currentTime % vidDur);

    if (Math.abs(video.currentTime - targetTime) > 0.08) {
      video.currentTime = targetTime;
    }

    if (isPlaying) {
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [currentTime, isPlaying, shot.vfxReference?.videoUrl, duration]);

  // Auto-activate ghost overlay in viewfinder when reference image/canvas plate is provided
  useEffect(() => {
    if (shot.referenceImage?.previewUrl) {
      if (viewfinderOverlayMode === '3d-only') {
        setViewfinderOverlayMode('overlay');
      }
      setOverlayOpacity((prev) => (prev < 0.6 ? 0.75 : prev));
    }
  }, [shot.referenceImage?.previewUrl]);

  // Update Soundstage Cyclorama Backdrop with 2D Canvas Drawing / Shot Reference Plate
  useEffect(() => {
    const backdrop = stageBackdropMeshRef.current;
    if (!backdrop) return;

    if (shot.referenceImage?.previewUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(
        shot.referenceImage.previewUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          backdrop.material = new THREE.MeshBasicMaterial({
            map: tex,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.95,
          });
          backdrop.visible = true;
        },
        undefined,
        (err) => console.warn('Could not load soundstage cyclorama texture', err)
      );
    } else {
      backdrop.material = new THREE.MeshBasicMaterial({
        color: 0x1e293b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.15,
      });
    }
  }, [shot.referenceImage?.previewUrl]);

  // Keyboard Shortcut for Object Deletion (Delete / Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.isContentEditable
      ) {
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedActorId) {
        removeActor(selectedActorId);
        setSelectedActorId(undefined);
      }
      if (e.key === 'f' || e.key === 'F' || e.key === 'Home') {
        centerStageCameraRef.current?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedActorId, removeActor, setSelectedActorId]);

  // 2. Compute Camera 3D Position at currentTime with full keyframe interpolation (reads live store state)
  const getCameraPositionAtTime = (t: number) => {
    const liveShot = useShotStore.getState().shot;
    const liveDur = liveShot.durationSeconds || duration || 4.0;
    return interpolateCameraPosition(liveShot.camera.movement, t, liveDur);
  };

  // 3. Compute Actor 3D Position at currentTime with full keyframe interpolation (reads live store state)
  const getActorPositionAtTime = (actor: (typeof shot.actors)[0], t: number) => {
    const liveDur = useShotStore.getState().shot.durationSeconds || duration || 4.0;
    const stagePos = interpolateTrajectoryPosition(actor.trajectory, t, liveDur);
    const x = (stagePos.x - 50) * 1.0;
    const z = (stagePos.y - 50) * 1.0;
    const y = (stagePos.z ?? 0) * 0.4;
    return { x, y, z };
  };






  // 4. Initialize Three.js Stages
  useEffect(() => {
    // A. Main Virtual Soundstage Scene
    const stageScene = new THREE.Scene();
    stageScene.background = new THREE.Color(0x08090c);
    stageScene.fog = new THREE.Fog(0x08090c, 120, 800);
    stageSceneRef.current = stageScene;

    // Preload skinned humanoid mannequin for instant actor staging
    preloadMannequinModel()
      .then(() => {
        syncPositions(currentTimeRef.current);
      })
      .catch((e) => console.warn('[StagePrevis3D] Preload mannequin error:', e));

    // Floor Plane
    const floorGeo = new THREE.PlaneGeometry(120, 120);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f1117,
      roughness: 0.85,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    stageScene.add(floor);
    floorMeshRef.current = floor;

    // 3D Environment Group (World Layer 0 - visible in Stage Orbit + Viewfinder Previs)
    const envGroup = new THREE.Group();
    stageScene.add(envGroup);
    environmentGroupRef.current = envGroup;

    // Stage Grid Helper (Layer 1 Editor Gizmo)
    const grid = new THREE.GridHelper(100, 20, 0xd4af37, 0x1e293b);
    grid.position.y = 0.02;
    setLayerRecursively(grid, 1);
    stageScene.add(grid);
    gridHelperRef.current = grid;

    // Stage Perimeter Border (Layer 1 Editor Gizmo)
    const borderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(100, 0.1, 100));
    const borderMat = new THREE.LineBasicMaterial({ color: 0xd4af37, linewidth: 2 });
    const borderLine = new THREE.LineSegments(borderGeo, borderMat);
    borderLine.position.y = 0.05;
    setLayerRecursively(borderLine, 1);
    stageScene.add(borderLine);

    // 3D Studio Soundstage Rear Cyclorama Projection Screen (2D Canvas Drawing / Reference Plate)
    const screenGeo = new THREE.PlaneGeometry(64, 36);
    const screenMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.15,
    });
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 18, -48);
    stageScene.add(screenMesh);
    stageBackdropMeshRef.current = screenMesh;

    // Outer framing bezel for cyclorama
    const frameGeo = new THREE.BoxGeometry(64.8, 36.8, 0.4);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.7, metalness: 0.5 });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.set(0, 18, -48.25);
    stageScene.add(frameMesh);

    // Multi-angle Studio Lighting for Crystal-Clear Visibility
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x64748b, 2.2);
    stageScene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.45);
    stageScene.add(ambientLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.35);
    fillLight.position.set(12, 40, 58);
    stageScene.add(fillLight);

    const backRimLight = new THREE.DirectionalLight(0xe2e8f0, 0.95);
    backRimLight.position.set(-18, 32, -52);
    stageScene.add(backRimLight);

    // Stage Lighting Rig Group
    const lightsGroup = new THREE.Group();
    stageScene.add(lightsGroup);
    lightsGroupRef.current = lightsGroup;

    // Camera Gizmo Group (represented in stage view - Layer 1 Gizmo Only)
    const cameraGizmoGroup = new THREE.Group();
    const camBodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0xd4af37,
      emissiveIntensity: 0.18,
      roughness: 0.3,
      metalness: 0.8,
    });
    const camBody = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 5), camBodyMat);
    camBody.position.y = 1.5;
    camBody.userData.isCamera = true;
    cameraGizmoGroup.add(camBody);

    // Golden edge highlight on camera body so it stands out clearly on dark stages
    const camEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(4.08, 3.08, 5.08)),
      new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9 })
    );
    camEdges.position.y = 1.5;
    camEdges.raycast = () => {};
    cameraGizmoGroup.add(camEdges);

    // Lens Barrel (pointing forward +Z)
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      emissive: 0xd4af37,
      emissiveIntensity: 0.25,
      roughness: 0.1,
      metalness: 0.9,
    });
    const lensMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3, 16), lensMat);
    lensMesh.rotation.x = Math.PI / 2;
    lensMesh.position.set(0, 1.5, 3.5);
    lensMesh.userData.isCamera = true;
    cameraGizmoGroup.add(lensMesh);

    // Generous invisible hit proxy around camera body & lens for effortless grabbing
    const camHitProxy = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 5.6, 8.8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    camHitProxy.position.set(0, 1.5, 1.2);
    camHitProxy.name = '__camera_hit_proxy__';
    camHitProxy.userData = { isCamera: true };
    cameraGizmoGroup.add(camHitProxy);

    // Frustum Lines (pointing forward +Z directly matching camera line of sight)
    const fov = FOV_MAP[shot.camera.lens.focalLength] || 63;
    const aspect = ASPECT_RATIOS[shot.aspectRatio] || 16 / 9;
    const frustumGeo = updateFrustumGeometry(fov, aspect, 35);
    const frustumMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.8 });
    const frustumLine = new THREE.LineSegments(frustumGeo, frustumMat);
    frustumLine.position.set(0, 1.5, 4);
    frustumLine.raycast = () => {};
    cameraGizmoGroup.add(frustumLine);
    frustumMeshRef.current = frustumLine;

    // Crucial: Isolate entire camera gizmo hierarchy to Layer 1 (Gizmos only)
    setLayerRecursively(cameraGizmoGroup, 1);

    // Position camera gizmo initially
    const initCamPos = getCameraPositionAtTime(currentTime);
    cameraGizmoGroup.position.set(initCamPos.x, initCamPos.y, initCamPos.z);
    cameraGizmoGroup.lookAt(0, 6, 0);

    stageScene.add(cameraGizmoGroup);
    cameraGizmoGroupRef.current = cameraGizmoGroup;

    // Camera Floor Anchor Ring & Vertical Pedestal Drop-Line (Layer 1 Gizmo Only)
    const cameraFloorAnchor = new THREE.Group();
    cameraFloorAnchor.name = 'CameraFloorAnchor';
    const floorRingGeo = new THREE.RingGeometry(1.9, 2.5, 32);
    floorRingGeo.rotateX(-Math.PI / 2);
    const floorRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const floorRingMesh = new THREE.Mesh(floorRingGeo, floorRingMat);
    floorRingMesh.position.y = 0.03;
    floorRingMesh.userData = { isCamera: true };
    cameraFloorAnchor.add(floorRingMesh);

    const floorHitGeo = new THREE.CircleGeometry(2.8, 24);
    floorHitGeo.rotateX(-Math.PI / 2);
    const floorHitMesh = new THREE.Mesh(floorHitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    floorHitMesh.position.y = 0.03;
    floorHitMesh.userData = { isCamera: true };
    cameraFloorAnchor.add(floorHitMesh);

    const dropLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.03, 0),
      new THREE.Vector3(0, 1, 0),
    ]);
    const dropLineMat = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.55,
    });
    const dropLine = new THREE.Line(dropLineGeo, dropLineMat);
    dropLine.name = 'CameraDropLine';
    dropLine.scale.y = Math.max(0.1, initCamPos.y + 1.5);
    dropLine.raycast = () => {};
    cameraFloorAnchor.add(dropLine);

    cameraFloorAnchor.position.set(initCamPos.x, 0, initCamPos.z);
    setLayerRecursively(cameraFloorAnchor, 1);
    stageScene.add(cameraFloorAnchor);
    cameraFloorAnchorRef.current = cameraFloorAnchor;

    // Trajectory Line (Layer 1 Gizmo Only)
    const trajMat = new THREE.LineDashedMaterial({
      color: 0x06b6d4,
      dashSize: 2,
      gapSize: 1,
      linewidth: 2,
    });
    const trajLine = new THREE.Line(new THREE.BufferGeometry(), trajMat);
    setLayerRecursively(trajLine, 1);
    stageScene.add(trajLine);
    trajectoryLineRef.current = trajLine;

    // 3D Character IK Posing Handles Group (Layer 1 Gizmo Only)
    const ikHandlesGroup = new THREE.Group();
    ikHandlesGroup.name = 'IKHandlesGroup';
    setLayerRecursively(ikHandlesGroup, 1);
    stageScene.add(ikHandlesGroup);
    ikHandlesGroupRef.current = ikHandlesGroup;

    // 3D Character FK Joint Discs Group (Layer 1 Gizmo Only)
    const jointDiscsGroup = new THREE.Group();
    jointDiscsGroup.name = 'JointDiscsGroup';
    setLayerRecursively(jointDiscsGroup, 1);
    stageScene.add(jointDiscsGroup);
    jointDiscsGroupRef.current = jointDiscsGroup;

    // 3D Bone Transform Gizmo Group (Layer 1 Gizmo Only)
    const boneGizmoGroup = createBoneTransformGizmo();
    boneGizmoGroup.visible = false;
    setLayerRecursively(boneGizmoGroup, 1);
    stageScene.add(boneGizmoGroup);
    boneGizmoGroupRef.current = boneGizmoGroup;

    // Viewfinder Camera (Through the lens) - STRICTLY Layer 0 (World objects only, NEVER gizmos)
    const vfCamera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 500);
    vfCamera.layers.set(0);
    vfCamera.position.set(initCamPos.x, initCamPos.y + 1.5, initCamPos.z);
    vfCamera.lookAt(0, 6, 0);
    vfCameraRef.current = vfCamera;

    // Orbit Camera for Stage View - Sees BOTH Layer 0 (World) and Layer 1 (Gizmos)
    const stageCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    stageCamera.layers.enable(0);
    stageCamera.layers.enable(1);
    stageCamera.position.set(22, 28, 42);
    stageCameraRef.current = stageCamera;

    // Direct Raycaster enables selection for both Layer 0 (Actors) and Layer 1 (Camera Gizmo)
    raycasterRef.current.layers.enable(0);
    raycasterRef.current.layers.enable(1);

    // Renderers Setup with Lazy Viewport Context Allocation
    const initStageRenderer = () => {
      if (!stageMountRef.current || !stageCameraRef.current) return;
      if (stageRendererRef.current) {
        if (stageControlsRef.current && stageControlsRef.current.object !== stageCameraRef.current) {
          stageControlsRef.current.object = stageCameraRef.current;
          stageControlsRef.current.update();
        }
        (window as any).__stageCamera = stageCameraRef.current;
        (window as any).__stageScene = stageSceneRef.current;
        return;
      }
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const w = stageMountRef.current.clientWidth || 600;
      const h = stageMountRef.current.clientHeight || 400;
      renderer.setSize(w, h, false);
      renderer.domElement.style.position = 'absolute';
      renderer.domElement.style.top = '0';
      renderer.domElement.style.left = '0';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.45;
      // Remove any lingering canvas elements in the mount to prevent ghost/frozen canvases
      const lingeringCanvases = stageMountRef.current.querySelectorAll('canvas');
      lingeringCanvases.forEach((c) => c.remove());
      stageMountRef.current.appendChild(renderer.domElement);
      stageRendererRef.current = renderer;

      const controls = new OrbitControls(stageCameraRef.current, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.enablePan = true;
      controls.screenSpacePanning = true;
      controls.panSpeed = 1.4;
      controls.enableZoom = true;
      controls.zoomSpeed = 1.6;
      controls.minPolarAngle = 0.04; // Prevent polar gimbal singularity
      controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent going below floor
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
      // Distance-Compensated Pan Speed + Stage Boundary Guard so camera never pans into black void
      controls.addEventListener('change', () => {
        if (stageCameraRef.current && controls.object !== stageCameraRef.current) {
          controls.object = stageCameraRef.current;
        }
        if (stageCameraRef.current) {
          controls.target.x = THREE.MathUtils.clamp(controls.target.x, -75, 75);
          controls.target.y = THREE.MathUtils.clamp(controls.target.y, -2, 40);
          controls.target.z = THREE.MathUtils.clamp(controls.target.z, -75, 75);
          stageCameraRef.current.position.x = THREE.MathUtils.clamp(stageCameraRef.current.position.x, -95, 95);
          stageCameraRef.current.position.y = THREE.MathUtils.clamp(stageCameraRef.current.position.y, 0.5, 85);
          stageCameraRef.current.position.z = THREE.MathUtils.clamp(stageCameraRef.current.position.z, -95, 95);
          const camDist = stageCameraRef.current.position.distanceTo(controls.target);
          controls.panSpeed = THREE.MathUtils.clamp(16.0 / Math.max(0.4, camDist), 1.4, 14.0);
        }
      });

      // Push-Through Dolly on Wheel Zoom-In: prevents OrbitControls from hitting a Zeno's-paradox wall when getting close to objects
      renderer.domElement.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          if (!stageCameraRef.current) return;
          const cam = stageCameraRef.current;
          const dist = cam.position.distanceTo(controls.target);
          if (e.deltaY < 0 && dist < 10.0) {
            const forward = new THREE.Vector3();
            cam.getWorldDirection(forward);
            const step = Math.max(1.4, dist * 0.25);
            controls.target.addScaledVector(forward, step);
            if (dist < 4.5) {
              cam.position.addScaledVector(forward, step * 0.85);
            }
            controls.update();
          }
        },
        { passive: true }
      );
      stageControlsRef.current = controls;
      (window as any).__stageCamera = stageCameraRef.current;
      (window as any).__stageControls = controls;
      (window as any).__stageScene = stageSceneRef.current;
      (window as any).__actorMeshes = actorMeshesRef.current;
      (window as any).__stageRenderer = renderer;
      (window as any).__raycaster = raycasterRef.current;

      // Prevent native context menu from interrupting right-drag panning
      renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

      // Center stage camera on scene/actors once mounted
      requestAnimationFrame(() => {
        centerStageCameraRef.current?.();
      });
      setTimeout(() => {
        centerStageCameraRef.current?.();
      }, 80);
      setTimeout(() => {
        centerStageCameraRef.current?.();
      }, 250);
    };

    const initVfRenderer = () => {
      if (vfRendererRef.current || !vfCameraRef.current) return;
      const vfRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      vfRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const w = viewfinderMountRef.current?.clientWidth || 1280;
      const h = viewfinderMountRef.current?.clientHeight || 720;
      const currentAspectStr = shotRef.current?.aspectRatio || shot.aspectRatio;
      const targetAspect = ASPECT_RATIOS[currentAspectStr] || 16 / 9;
      let fitW = w;
      let fitH = Math.round(w / targetAspect);
      if (fitH > h) {
        fitH = h;
        fitW = Math.round(h * targetAspect);
      }
      vfCameraRef.current.aspect = targetAspect;
      vfCameraRef.current.updateProjectionMatrix();
      vfRenderer.setSize(fitW, fitH, false);
      if (viewfinderMountRef.current) {
        const lingeringCanvases = viewfinderMountRef.current.querySelectorAll('canvas');
        lingeringCanvases.forEach((c) => c.remove());
        vfRenderer.domElement.style.position = 'absolute';
        vfRenderer.domElement.style.top = `${Math.max(0, Math.round((h - fitH) / 2))}px`;
        vfRenderer.domElement.style.left = `${Math.max(0, Math.round((w - fitW) / 2))}px`;
        vfRenderer.domElement.style.width = `${fitW}px`;
        vfRenderer.domElement.style.height = `${fitH}px`;
        vfRenderer.domElement.style.zIndex = '5';
        vfRenderer.domElement.dataset.role = 'viewfinder';
        viewfinderMountRef.current.appendChild(vfRenderer.domElement);
      }
      vfRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      vfRenderer.toneMappingExposure = 1.45;
      vfRendererRef.current = vfRenderer;
      (window as any).__vfCamera = vfCameraRef.current;
      (window as any).__vfRenderer = vfRenderer;
    };

    initStageRendererRef.current = initStageRenderer;
    initVfRendererRef.current = initVfRenderer;

    // Lazily instantiate ONLY the renderer needed for initialViewMode
    if (initialViewMode === 'stage' || initialViewMode === 'split') {
      initStageRenderer();
    }
    if (initialViewMode === 'viewfinder' || initialViewMode === 'split') {
      initVfRenderer();
    }

    // Precise Resize Observer with Parent Fallbacks for smooth expansion
    const updateSizes = () => {
      if (stageMountRef.current && stageRendererRef.current && stageCameraRef.current) {
        let w = stageMountRef.current.clientWidth;
        let h = stageMountRef.current.clientHeight;
        if ((w === 0 || h === 0) && stageMountRef.current.parentElement) {
          w = stageMountRef.current.parentElement.clientWidth;
          h = stageMountRef.current.parentElement.clientHeight;
        }
        if (w > 0 && h > 0) {
          stageCameraRef.current.aspect = w / h;
          stageCameraRef.current.updateProjectionMatrix();
          stageRendererRef.current.setSize(w, h, false);
        }
      }
      if (viewfinderMountRef.current && vfRendererRef.current && vfCameraRef.current) {
        let w = viewfinderMountRef.current.clientWidth;
        let h = viewfinderMountRef.current.clientHeight;
        if ((w === 0 || h === 0) && viewfinderMountRef.current.parentElement) {
          w = viewfinderMountRef.current.parentElement.clientWidth;
          h = viewfinderMountRef.current.parentElement.clientHeight;
        }
        if (w > 0 && h > 0) {
          const currentAspectStr = shotRef.current?.aspectRatio || shot.aspectRatio;
          const targetAspect = ASPECT_RATIOS[currentAspectStr] || 16 / 9;
          let fitW = w;
          let fitH = Math.round(w / targetAspect);
          if (fitH > h) {
            fitH = h;
            fitW = Math.round(h * targetAspect);
          }
          vfCameraRef.current.aspect = targetAspect;
          vfCameraRef.current.updateProjectionMatrix();
          vfRendererRef.current.setSize(fitW, fitH, false);
          vfRendererRef.current.domElement.style.width = `${fitW}px`;
          vfRendererRef.current.domElement.style.height = `${fitH}px`;
          vfRendererRef.current.domElement.style.position = 'absolute';
          vfRendererRef.current.domElement.style.left = `${Math.max(0, Math.round((w - fitW) / 2))}px`;
          vfRendererRef.current.domElement.style.top = `${Math.max(0, Math.round((h - fitH) / 2))}px`;
        }
      }
    };

    updateSizesRef.current = updateSizes;

    const resizeObserver = new ResizeObserver(() => {
      updateSizes();
    });

    if (stageMountRef.current) {
      resizeObserver.observe(stageMountRef.current);
      if (stageMountRef.current.parentElement) {
        resizeObserver.observe(stageMountRef.current.parentElement);
      }
    }
    if (viewfinderMountRef.current) {
      resizeObserver.observe(viewfinderMountRef.current);
      if (viewfinderMountRef.current.parentElement) {
        resizeObserver.observe(viewfinderMountRef.current.parentElement);
      }
    }
    window.addEventListener('resize', updateSizes);
    setTimeout(updateSizes, 50);
    setTimeout(updateSizes, 200);

    const syncPosingGizmos = () => {
      const handlesGroup = ikHandlesGroupRef.current;
      const discsGroup = jointDiscsGroupRef.current;
      const gizmoGroup = boneGizmoGroupRef.current;

      const selId = useShotStore.getState().selectedActorId;
      if (!selId) {
        if (handlesGroup) handlesGroup.visible = false;
        if (discsGroup) discsGroup.visible = false;
        if (gizmoGroup) gizmoGroup.visible = false;
        return;
      }

      // When Camera Rig is selected: attach 3D XYZ Transform Gizmo directly onto the Camera!
      if (selId === '__camera__') {
        if (handlesGroup) handlesGroup.visible = false;
        if (discsGroup) discsGroup.visible = false;
        if (gizmoGroup && cameraGizmoGroupRef.current && cameraGizmoGroupRef.current.visible) {
          const camGizmoPos = cameraGizmoGroupRef.current.position;
          gizmoGroup.position.set(camGizmoPos.x, camGizmoPos.y + 1.5, camGizmoPos.z);
          gizmoGroup.visible = true;
          if (stageCameraRef.current) {
            const camDist = stageCameraRef.current.position.distanceTo(gizmoGroup.position);
            const gizmoScale = THREE.MathUtils.clamp(camDist * 0.11, 2.2, 5.5);
            gizmoGroup.scale.setScalar(gizmoScale);
          }
        } else if (gizmoGroup) {
          gizmoGroup.visible = false;
        }
        return;
      }

      const actorMesh = actorMeshesRef.current.get(selId);
      const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
      if (!rig || !showPosingHandlesRef.current) {
        if (handlesGroup) handlesGroup.visible = false;
        if (discsGroup) discsGroup.visible = false;
        if (gizmoGroup) gizmoGroup.visible = false;
        return;
      }

      rig.root.updateMatrixWorld(true);

      const getBoneWorldPos = (boneName: HumanoidBone): THREE.Vector3 => {
        const bone = rig.bones.get(boneName);
        const pos = new THREE.Vector3();
        if (bone) bone.getWorldPosition(pos);
        return pos;
      };

      if (posingModeRef.current === 'ik') {
        // --- IK TARGET MODE ---
        if (discsGroup) discsGroup.visible = false;
        if (gizmoGroup) gizmoGroup.visible = false;
        if (!handlesGroup) return;
        handlesGroup.visible = true;

        if (handlesGroup.userData.actorId !== selId || handlesGroup.children.length === 0) {
          handlesGroup.clear();
          handlesGroup.userData.actorId = selId;

          const handleDefs: Array<{
            type: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'head';
            color: number;
          }> = [
            { type: 'leftArm', color: 0x06b6d4 },
            { type: 'rightArm', color: 0x06b6d4 },
            { type: 'leftLeg', color: 0xf59e0b },
            { type: 'rightLeg', color: 0xf59e0b },
            { type: 'head', color: 0xeab308 },
          ];

          handleDefs.forEach((def) => {
            const handle = createIKHandleGizmo(def.type, def.color, selId);
            handlesGroup.add(handle);
          });
          setLayerRecursively(handlesGroup, 1);
        }

        const headPos = getBoneWorldPos('Head');
        const forwardDir = new THREE.Vector3(0, 0, 1);
        if (actorMesh) {
          forwardDir.applyQuaternion(actorMesh.quaternion);
        }
        const lookAtPos = headPos.clone().add(forwardDir.multiplyScalar(2.5));

        const positions: Record<string, THREE.Vector3> = {
          leftArm: getBoneWorldPos('LeftHand'),
          rightArm: getBoneWorldPos('RightHand'),
          leftLeg: getBoneWorldPos('LeftFoot'),
          rightLeg: getBoneWorldPos('RightFoot'),
          head: lookAtPos,
        };

        handlesGroup.children.forEach((child) => {
          const handleType = child.userData?.handleType;
          if (handleType && positions[handleType]) {
            if (activeIKHandleRef.current?.handleType === handleType) return;
            child.position.copy(positions[handleType]);
          }
        });
      } else {
        // --- FK JOINT GIZMO MODE ---
        if (handlesGroup) handlesGroup.visible = false;
        if (!discsGroup || !gizmoGroup) return;
        discsGroup.visible = true;

        // Rebuild joint discs if actor changed or empty
        if (discsGroup.userData.actorId !== selId || discsGroup.children.length === 0) {
          discsGroup.clear();
          discsGroup.userData.actorId = selId;

          JOINT_DISC_DEFINITIONS.forEach((def) => {
            const disc = createJointDiscMesh(def.bone, def.label, def.color, def.radius, selId);
            discsGroup.add(disc);
          });
          setLayerRecursively(discsGroup, 1);
        }

        // Update disc positions and face camera with camera-adaptive scale
        discsGroup.children.forEach((child) => {
          const boneName = child.userData?.boneName as HumanoidBone | undefined;
          if (boneName) {
            const pos = getBoneWorldPos(boneName);
            child.position.copy(pos);
            if (stageCameraRef.current) {
              child.quaternion.copy(stageCameraRef.current.quaternion);
              // Scale joint disc dynamically so joints are always effortlessly clickable at any zoom distance
              const camDist = stageCameraRef.current.position.distanceTo(pos);
              const discScale = THREE.MathUtils.clamp(camDist * 0.038, 0.60, 1.35);
              child.scale.setScalar(discScale);
            }
            const activeHighlight = child.getObjectByName('ActiveHighlightRing');
            if (activeHighlight) {
              activeHighlight.visible = boneName === selectedBoneRef.current;
            }
          }
        });

        // Position and scale 3D Transform Gizmo ONLY at the actively selected bone for humanoids
        // (prevents a giant root gizmo from intercepting clicks when clicking away from the character)
        if (selectedBoneRef.current) {
          const targetBonePos = getBoneWorldPos(selectedBoneRef.current);
          gizmoGroup.position.copy(targetBonePos);
          gizmoGroup.visible = true;
          if (stageCameraRef.current) {
            const camDist = stageCameraRef.current.position.distanceTo(targetBonePos);
            // Compact, non-overlapping gizmo scaling (stays localized within bone space, never covers adjacent joints)
            const gizmoScale = THREE.MathUtils.clamp(camDist * 0.024, 0.40, 0.95);
            gizmoGroup.scale.setScalar(gizmoScale);
          }
        } else {
          gizmoGroup.visible = false;
        }
      }
    };

    // Continuous Animation & Render Loop
    let mainLoopId: number;
    let lastTime = performance.now();
    const animate = () => {
      mainLoopId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // 1. Dynamic Organic Fireplace Light Flicker
      if (hearthLightRef.current) {
        const timeSec = now / 1000;
        const flicker =
          0.82 +
          0.16 * Math.sin(timeSec * 13.7) +
          0.11 * Math.sin(timeSec * 23.3) +
          0.07 * Math.cos(timeSec * 7.1) +
          0.04 * (Math.random() - 0.5);
        hearthLightRef.current.intensity = 4.5 * Math.max(0.45, flicker);
      }

      // 2. Rising Volumetric Woodsmoke & Floating Glowing Embers Physics
      if (hearthParticlesRef.current) {
        const pSystem = hearthParticlesRef.current;
        const posAttr = pSystem.geometry.attributes.position as THREE.BufferAttribute;
        const vels = pSystem.userData.velocities as Array<{
          x: number;
          y: number;
          z: number;
          life: number;
          maxLife: number;
          isSmoke: boolean;
        }>;
        const origin = pSystem.userData.hearthOrigin as THREE.Vector3;

        if (posAttr && vels) {
          const arr = posAttr.array as Float32Array;
          for (let i = 0; i < vels.length; i++) {
            const v = vels[i];
            v.life += dt;
            if (v.life >= v.maxLife) {
              v.life = 0;
              arr[i * 3] = origin.x + (Math.random() - 0.5) * 1.5;
              arr[i * 3 + 1] = origin.y + 0.15 + Math.random() * 0.3;
              arr[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.8;
            } else {
              const curlX = Math.sin(now * 0.003 + i) * 0.25;
              const curlZ = Math.cos(now * 0.003 + i) * 0.25;
              arr[i * 3] += (v.x + curlX) * dt;
              arr[i * 3 + 1] += v.y * dt;
              arr[i * 3 + 2] += (v.z + curlZ) * dt;
            }
          }
          posAttr.needsUpdate = true;
        }
      }

      // 3. Continuous Kinematic Updates for 3D Actors & Props (flame wavers, rotations, & paused-timeline gait loops)
      const liveShotNow = useShotStore.getState().shot;
      actorMeshesRef.current.forEach((mesh, actorId) => {
        if (typeof mesh.userData.update === 'function') {
          mesh.userData.update(dt);
        }
        if (!isPlayingRef.current && mesh.userData?.rig) {
          const act = liveShotNow.actors.find((a) => a.id === actorId);
          const isActivelyPosing =
            activeGizmoDragRef.current?.actorId === actorId ||
            activeIKHandleRef.current?.actorId === actorId;
          // When timeline playhead is paused, ONLY subtle idle breathing may gently animate;
          // locomotion (walk/run/sneak) and action clips ONLY animate when playhead is playing!
          if (act && !isActivelyPosing && (act.gait === 'idle' || act.motionClip === 'human-idle-breathe')) {
            evaluateGait(mesh.userData.rig, now / 1000, {
              gait: 'idle',
              speed: 0,
            });
            mesh.userData.rig.root.updateMatrixWorld(true);
          }
        }
      });
      if (environmentGroupRef.current) {
        environmentGroupRef.current.traverse((child) => {
          if (typeof child.userData.update === 'function') {
            child.userData.update(dt);
          }
        });
      }

      // 4. Synchronize IK Handles & FK Joint Gizmos with selected actor's humanoid skeleton
      syncPosingGizmos();

      if (stageControlsRef.current) {
        if (stageCameraRef.current && stageControlsRef.current.object !== stageCameraRef.current) {
          stageControlsRef.current.object = stageCameraRef.current;
        }
        stageControlsRef.current.update();
      }

      const activeView = viewModeRef.current;
      if (activeView === 'stage' || activeView === 'split') {
        if (stageRendererRef.current && stageSceneRef.current && stageCameraRef.current) {
          stageRendererRef.current.render(stageSceneRef.current, stageCameraRef.current);
        }
      }

      // Do NOT interfere with vfRenderer while in-app previs is actively capturing frames
      if (activeView === 'viewfinder' || activeView === 'split') {
        if (!useShotStore.getState().isRenderingPrevis) {
          if (vfRendererRef.current && stageSceneRef.current && vfCameraRef.current) {
            vfRendererRef.current.render(stageSceneRef.current, vfCameraRef.current);
          }
        }
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(mainLoopId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSizes);

      if (stageControlsRef.current) {
        stageControlsRef.current.dispose();
        stageControlsRef.current = null;
      }
      if (stageRendererRef.current) {
        const dom = stageRendererRef.current.domElement;
        if (dom.parentElement) {
          dom.remove();
        }
        stageRendererRef.current.dispose();
        stageRendererRef.current = null;
      }
      if (vfRendererRef.current) {
        const dom = vfRendererRef.current.domElement;
        if (dom.parentElement) {
          dom.remove();
        }
        vfRendererRef.current.dispose();
        vfRendererRef.current = null;
      }
      initStageRendererRef.current = null;
      initVfRendererRef.current = null;
      updateSizesRef.current = null;
      stageCameraRef.current = null;
      vfCameraRef.current = null;
      stageSceneRef.current = null;
      lastFramedShotIdRef.current = null;
      delete (window as any).__stageCamera;
      delete (window as any).__stageControls;
      delete (window as any).__stageScene;
      delete (window as any).__stageRenderer;
      delete (window as any).__actorMeshes;
      actorMeshesRef.current.forEach((m) => {
        disposeObject3D(m);
      });
      actorMeshesRef.current.clear();
      if (environmentGroupRef.current) {
        disposeObject3D(environmentGroupRef.current);
      }
      if (ikHandlesGroupRef.current) {
        disposeObject3D(ikHandlesGroupRef.current);
        ikHandlesGroupRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    viewModeRef.current = viewMode;
    if (viewMode === 'stage' || viewMode === 'split') {
      initStageRendererRef.current?.();
    }
    if (viewMode === 'viewfinder' || viewMode === 'split') {
      initVfRendererRef.current?.();
    }
    setTimeout(() => updateSizesRef.current?.(), 25);
  }, [viewMode, isSwapped]);

  // 4b. Toggle Stage Grid Visibility
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // 5. Update Lighting Rig in 3D Space
  useEffect(() => {
    const lightsGroup = lightsGroupRef.current;
    if (!lightsGroup) return;

    // Clear old lights
    lightsGroup.clear();
    hearthLightRef.current = null;
    hearthParticlesRef.current = null;

    const stageLights = getEffectiveStageLights(shot.lighting);
    stageLights.forEach((lgt, idx) => {
      if (lgt.enabled === false) return;
      const lx = (lgt.position.x - 50) * 1.0;
      const lz = (lgt.position.y - 50) * 1.0;
      const ly = Math.max(1.5, (lgt.position.z ?? 45) * 0.45 + 1.5);
      const lPos = new THREE.Vector3(lx, ly, lz);
      const threeColor = new THREE.Color(lgt.color || '#eab308');
      const intensity = lgt.intensity ?? 2.2;

      const dirLight = new THREE.DirectionalLight(threeColor, intensity);
      dirLight.position.copy(lPos);
      if (idx === 0) {
        dirLight.castShadow = true;
      }
      dirLight.target.position.set(0, 4, 0);
      lightsGroup.add(dirLight);
      lightsGroup.add(dirLight.target);

      // Local point glow so colored multi-lights cast rich localized tint on nearby subjects & floor
      const ptLight = new THREE.PointLight(threeColor, intensity * 1.25, 110, 0.6);
      ptLight.position.copy(lPos);
      lightsGroup.add(ptLight);

      // Visual softbox fixture mesh (Layer 1 Editor Gizmo)
      const fixtureMat = new THREE.MeshBasicMaterial({ color: threeColor });
      const fixtureMesh = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.8, 1.0), fixtureMat);
      fixtureMesh.position.copy(lPos);
      fixtureMesh.lookAt(0, 4, 0);
      fixtureMesh.layers.set(1);
      lightsGroup.add(fixtureMesh);

      // Light stand line (Layer 1 Editor Gizmo)
      const standGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(lPos.x, 0, lPos.z),
        lPos,
      ]);
      const standLine = new THREE.Line(standGeo, new THREE.LineBasicMaterial({ color: threeColor }));
      standLine.layers.set(1);
      lightsGroup.add(standLine);
    });

    // 5c. Hearth Practical Lighting & Volumetric Woodsmoke Particles
    const isHearthActive =
      shot.environment?.id === 'env-rustic-hearth' ||
      (shot.environment?.category || '').toLowerCase().includes('hearth') ||
      (shot.environment?.promptDescription || '').toLowerCase().includes('fireplace') ||
      shot.sceneDescription.toLowerCase().includes('fireplace') ||
      shot.actors.some((a) =>
        /fireplace|hearth|fire\s*box/i.test(`${a.name} ${a.token || ''} ${a.kind || ''}`)
      );

    if (isHearthActive) {
      const fpActor = shot.actors.find((a) =>
        /fireplace|hearth|fire\s*box/i.test(`${a.name} ${a.token || ''} ${a.kind || ''}`)
      );
      let hearthPos = new THREE.Vector3(0, 1.2, -22);
      if (fpActor) {
        const p = getActorPositionAtTime(fpActor, 0);
        hearthPos = new THREE.Vector3(p.x, p.y + 1.2, p.z);
      }

      // Primary Warm Incandescent Orange Flickering Fire Light
      const hearthLight = new THREE.PointLight(0xf97316, 4.5, 50, 1.2);
      hearthLight.position.copy(hearthPos);
      hearthLight.castShadow = true;
      lightsGroup.add(hearthLight);
      hearthLightRef.current = hearthLight;

      // Secondary Amber Floor Bounce Fill Light
      const hearthFill = new THREE.PointLight(0xfdba74, 1.8, 30, 1.8);
      hearthFill.position.set(hearthPos.x, hearthPos.y + 0.3, hearthPos.z + 2.5);
      lightsGroup.add(hearthFill);

      // Volumetric Woodsmoke & Floating Incandescent Embers
      const particleCount = 80;
      const pGeo = new THREE.BufferGeometry();
      const pPos = new Float32Array(particleCount * 3);
      const pColors = new Float32Array(particleCount * 3);
      const pSizes = new Float32Array(particleCount);
      const pVelocities: { x: number; y: number; z: number; life: number; maxLife: number; isSmoke: boolean }[] = [];

      for (let i = 0; i < particleCount; i++) {
        const isSmoke = i < 45; // 45 smoke motes, 35 ember sparks
        const px = hearthPos.x + (Math.random() - 0.5) * 1.6;
        const py = hearthPos.y + 0.2 + Math.random() * 3.5;
        const pz = hearthPos.z + (Math.random() - 0.5) * 0.9;

        pPos[i * 3] = px;
        pPos[i * 3 + 1] = py;
        pPos[i * 3 + 2] = pz;

        if (isSmoke) {
          pColors[i * 3] = 0.42 + Math.random() * 0.12;
          pColors[i * 3 + 1] = 0.32 + Math.random() * 0.10;
          pColors[i * 3 + 2] = 0.25 + Math.random() * 0.08;
          pSizes[i] = 16 + Math.random() * 14;
        } else {
          pColors[i * 3] = 1.0;
          pColors[i * 3 + 1] = 0.45 + Math.random() * 0.35;
          pColors[i * 3 + 2] = 0.05;
          pSizes[i] = 7 + Math.random() * 6;
        }

        pVelocities.push({
          x: (Math.random() - 0.5) * 0.35,
          y: 0.7 + Math.random() * 1.2,
          z: (Math.random() - 0.5) * 0.35,
          life: Math.random() * 2.5,
          maxLife: 2.2 + Math.random() * 2.0,
          isSmoke,
        });
      }

      pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
      pGeo.setAttribute('size', new THREE.BufferAttribute(pSizes, 1));

      // Particle texture (soft radial glow)
      const pCanvas = document.createElement('canvas');
      pCanvas.width = 64;
      pCanvas.height = 64;
      const pCtx = pCanvas.getContext('2d');
      if (pCtx) {
        const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.35, 'rgba(255,210,160,0.85)');
        grad.addColorStop(0.7, 'rgba(190,140,100,0.3)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        pCtx.fillStyle = grad;
        pCtx.fillRect(0, 0, 64, 64);
      }
      const pTex = new THREE.CanvasTexture(pCanvas);

      const pMat = new THREE.PointsMaterial({
        size: 1.6,
        map: pTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const pSystem = new THREE.Points(pGeo, pMat);
      pSystem.userData.velocities = pVelocities;
      pSystem.userData.hearthOrigin = hearthPos.clone();
      lightsGroup.add(pSystem);
      hearthParticlesRef.current = pSystem;
    }
  }, [shot.lighting, shot.environment, shot.sceneDescription, shot.actors]);

  // 5b. Update Environment Visuals (Ground surface, sky color, fog, perimeter structures)
  useEffect(() => {
    const scene = stageSceneRef.current;
    const envGroup = environmentGroupRef.current;
    const floorMesh = floorMeshRef.current;
    if (!scene || !envGroup || !floorMesh) return;

    const env = shot.environment;
    const skyHex = env?.skyColor || '#08090c';
    const fogHex = env?.fogColor || '#08090c';

    // 1. Sky & Atmospheric Fog (linear falloff ensures the stage orbit camera never gets blacked out)
    scene.background = new THREE.Color(skyHex);
    scene.fog = new THREE.Fog(new THREE.Color(fogHex), 100, 600);

    // 2. Ground Material & Surface Texturing
    applyGroundSurface(floorMesh, env?.groundSurface);

    // 3. Clear and Rebuild Perimeter Environmental Architecture
    buildPerimeterEnvironment(envGroup, env, {
      sceneDescription: shot.sceneDescription,
      actors: shot.actors,
    });
  }, [shot.environment, shot.sceneDescription, shot.actors]);

  // 6. Update Actor Meshes in 3D Scene
  useEffect(() => {
    const scene = stageSceneRef.current;
    if (!scene) return;

    const isGhostMode = !!(shot.vfxReference?.enabled && shot.vfxReference?.referenceMode === 'camera-only');
    const isActorMode = !!(shot.vfxReference?.enabled && shot.vfxReference?.referenceMode === 'actor-motion');
    const colors = isActorMode
      ? [0x10b981, 0x06b6d4, 0xf59e0b, 0xa855f7]
      : [0xd4af37, 0x06b6d4, 0xf43f5e, 0x10b981];

    const currentActorIds = new Set(shot.actors.map((a) => a.id));

    // Remove meshes for actors that were deleted
    actorMeshesRef.current.forEach((mesh, id) => {
      if (!currentActorIds.has(id)) {
        scene.remove(mesh);
        disposeObject3D(mesh);
        actorMeshesRef.current.delete(id);
      }
    });

    shot.actors.forEach((actor, index) => {
      const parsedCustomColor = actor.color ? parseInt(actor.color.replace('#', ''), 16) : NaN;
      const color = !Number.isNaN(parsedCustomColor) ? parsedCustomColor : colors[index % colors.length];
      const subtitle = isGhostMode
        ? 'REPLACED SUBJECT'
        : isActorMode
        ? 'CHOREOGRAPHY'
        : actor.conceptImageUrl
        ? 'PREVIS CONCEPT'
        : actor.kind
        ? actor.kind.toUpperCase()
        : undefined;
      const isSelected = actor.id === selectedActorId;
      const actorScale = actor.scale ?? 1.0;

      let mesh = actorMeshesRef.current.get(actor.id);
      const actorToken = (actor.token || '').trim();
      const actorName = (actor.name || '').trim();
      const actorKind = (actor.kind || 'human').trim();

      const needsFullRebuild =
        !mesh ||
        mesh.userData.kind !== actorKind ||
        mesh.userData.name !== actorName ||
        mesh.userData.token !== actorToken ||
        mesh.userData.conceptImageUrl !== actor.conceptImageUrl ||
        mesh.userData.modelUrl !== actor.modelUrl ||
        mesh.userData.isGhostMode !== isGhostMode ||
        mesh.userData.customColor !== actor.color ||
        mesh.userData.partGraph !== (actor.sculpt || actor.partGraph);

      if (needsFullRebuild) {
        if (mesh) {
          scene.remove(mesh);
          disposeObject3D(mesh);
        }
        mesh = createSubjectMesh(
          actor.name,
          actor.kind || 'human',
          color,
          isGhostMode,
          subtitle,
          isSelected,
          actor.conceptImageUrl,
          actor.token,
          actor.modelUrl,
          actor.sculpt || actor.partGraph,
          actor.posePreset,
          actor.pose
        );
        mesh.userData.actorId = actor.id;
        mesh.userData.kind = actorKind;
        mesh.userData.name = actorName;
        mesh.userData.token = actorToken;
        mesh.userData.conceptImageUrl = actor.conceptImageUrl;
        mesh.userData.modelUrl = actor.modelUrl;
        mesh.userData.isSelected = isSelected;
        mesh.userData.isGhostMode = isGhostMode;
        mesh.userData.customColor = actor.color;
        if (!Number.isNaN(parsedCustomColor) && !isGhostMode) {
          mesh.userData.customColorHex = parsedCustomColor;
          applyObjectTargetColor(mesh, parsedCustomColor);
        }
        mesh.userData.partGraph = actor.sculpt || actor.partGraph;
        mesh.userData.posePreset = actor.posePreset;
        mesh.userData.pose = actor.pose;
        mesh.traverse((child) => {
          if (!child.userData?.isBaseRing) {
            child.userData.actorId = actor.id;
          }
        });

        // Tight anatomical hit proxy cylinder matching actual body width (0.45m radius)
        // so clicking away from the character NEVER accidentally grabs invisible empty air around it!
        const hitCylGeo = new THREE.CylinderGeometry(0.45, 0.45, 5.1, 12);
        const hitCylMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitProxy = new THREE.Mesh(hitCylGeo, hitCylMat);
        hitProxy.position.y = 2.55;
        hitProxy.name = '__actor_hit_proxy__';
        hitProxy.userData = { isHitProxy: true, actorId: actor.id };
        setLayerRecursively(hitProxy, 0);
        hitProxy.layers.enable(1);
        mesh.add(hitProxy);

        const pos = getActorPositionAtTime(actor, currentTimeRef.current);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.scale.set(actorScale, actorScale, actorScale);
        scene.add(mesh);
        mesh.updateMatrixWorld(true);
        if (mesh.userData.rig) {
          if (actor.pose) {
            applyBonePose(mesh.userData.rig, actor.pose);
          } else if (actor.posePreset) {
            applyPosePreset(mesh.userData.rig, actor.posePreset);
          } else {
            applyPosePreset(mesh.userData.rig, 'neutral-stand');
          }
        }
        actorMeshesRef.current.set(actor.id, mesh);
      } else if (mesh) {
        // Update selection state & floor ring visibility in-place without rebuilding or resetting transform!
        if (mesh.userData.isSelected !== isSelected) {
          mesh.userData.isSelected = isSelected;
          const baseRingGroup = mesh.getObjectByName('__base_ring_group__');
          if (baseRingGroup) {
            baseRingGroup.visible = Boolean(isSelected || isGhostMode);
          }
        }
        if (mesh.userData.rig) {
          if (mesh.userData.posePreset !== actor.posePreset || mesh.userData.pose !== actor.pose) {
            if (actor.pose) {
              applyBonePose(mesh.userData.rig, actor.pose);
            } else if (actor.posePreset) {
              applyPosePreset(mesh.userData.rig, actor.posePreset);
            } else {
              applyPosePreset(mesh.userData.rig, 'neutral-stand');
            }
            mesh.userData.posePreset = actor.posePreset;
            mesh.userData.pose = actor.pose;
          }
        }
      }

      // Always apply scale instantaneously
      if (mesh) {
        mesh.scale.set(actorScale, actorScale, actorScale);
      }
    });

    // Guarantee exact position, rotation, and pose synchronization
    syncPositions(currentTimeRef.current);
  }, [shot.actors, shot.vfxReference?.referenceMode, shot.vfxReference?.enabled, selectedActorId]);

  // 7. Update Frustum Geometry on Lens / Aspect Change
  useEffect(() => {
    const fov = FOV_MAP[shot.camera.lens.focalLength] || 63;
    const aspect = ASPECT_RATIOS[shot.aspectRatio] || 16 / 9;

    if (frustumMeshRef.current) {
      frustumMeshRef.current.geometry.dispose();
      frustumMeshRef.current.geometry = updateFrustumGeometry(fov, aspect, 35);
      setLayerRecursively(frustumMeshRef.current, 1);
    }

    const camHex = shot.camera.color || '#f59e0b';
    if (frustumMeshRef.current && (frustumMeshRef.current.material as THREE.LineBasicMaterial)?.color) {
      (frustumMeshRef.current.material as THREE.LineBasicMaterial).color.set(camHex);
    }
    if (cameraFloorAnchorRef.current) {
      cameraFloorAnchorRef.current.traverse((child) => {
        if ((child as any).material?.color && (child as any).material.visible !== false) {
          (child as any).material.color.set(camHex);
        }
      });
    }

    if (vfCameraRef.current) {
      vfCameraRef.current.fov = fov;
      vfCameraRef.current.aspect = aspect;
      vfCameraRef.current.updateProjectionMatrix();
      updateSizesRef.current?.();
    }
  }, [shot.camera.lens.focalLength, shot.aspectRatio, shot.camera.color]);

  // 8. Update Trajectory Curve Line in Stage View
  useEffect(() => {
    if (!trajectoryLineRef.current) return;

    const start = shot.camera.movement.startPosition;
    const end = shot.camera.movement.endPosition;

    const startX = (start.x - 50) * 1.0;
    const startZ = (start.y - 50) * 1.0;
    const startY = (start.z ?? 50) * 0.3 + 1.5;

    const endX = (end.x - 50) * 1.0;
    const endZ = (end.y - 50) * 1.0;
    const endY = (end.z ?? 50) * 0.3 + 1.5;

    const points = [
      new THREE.Vector3(startX, startY, startZ),
      new THREE.Vector3(endX, endY, endZ),
    ];

    trajectoryLineRef.current.geometry.dispose();
    trajectoryLineRef.current.geometry = new THREE.BufferGeometry().setFromPoints(points);
    trajectoryLineRef.current.computeLineDistances();
    setLayerRecursively(trajectoryLineRef.current, 1);
  }, [shot.camera.movement]);

  // 9. Sync Positions for Camera & Actors at arbitrary time t (reads live Zustand state for 0-latency drag)
  const syncPositions = (t: number) => {
    const liveShot = useShotStore.getState().shot;
    const liveDur = liveShot.durationSeconds || duration || 4.0;
    const camPos = getCameraPositionAtTime(t);

    // Independent Camera Look-At: Camera target direction is defined solely by liveShot.camera.movement.targetLookAt.
    // Moving characters does NOT move or rotate the camera. Camera moves alone, characters move alone.
    const lookAtCoord = liveShot.camera.movement.targetLookAt ?? { x: 50, y: 50 };
    let targetX = (lookAtCoord.x - 50) * 1.0;
    let targetZ = (lookAtCoord.y - 50) * 1.0;
    const shotType = liveShot.camera.shotType;
    const baseLookHeight =
      shotType === 'extreme-close-up'
        ? 4.48
        : shotType === 'close-up'
        ? 4.32
        : shotType === 'medium-close-up'
        ? 3.95
        : shotType === 'medium'
        ? 3.45
        : 2.85;
    let targetY = lookAtCoord.z !== undefined ? baseLookHeight + (lookAtCoord.z - 50) * 0.05 : baseLookHeight;

    const ratio = liveDur > 0 ? Math.min(1, Math.max(0, t / liveDur)) : 0;

    if (liveShot.camera.movement.type === 'pan-left') {
      targetX += (0.5 - ratio) * 15;
    } else if (liveShot.camera.movement.type === 'pan-right') {
      targetX += (ratio - 0.5) * 15;
    } else if (liveShot.camera.movement.type === 'tilt-up') {
      targetY += (ratio - 0.5) * 8;
    } else if (liveShot.camera.movement.type === 'tilt-down') {
      targetY += (0.5 - ratio) * 8;
    } else if (liveShot.camera.movement.type === 'whip-pan') {
      targetX += Math.sin(ratio * Math.PI) * 20;
    }

    const angle = liveShot.camera.angle;
    let effectiveCamY = camPos.y;
    let effectiveTargetY = targetY;

    if (angle === 'low-angle') {
      effectiveTargetY += 1.1;
    } else if (angle === 'ground-level') {
      effectiveCamY = Math.min(effectiveCamY, 0.4);
      effectiveTargetY += 1.4;
    } else if (angle === 'high-angle') {
      effectiveTargetY = Math.max(1.2, effectiveTargetY - 1.2);
    } else if (angle === 'overhead-gods-eye') {
      effectiveCamY = Math.max(effectiveCamY, 28);
      effectiveTargetY = 0.5;
    }

    const targetLookAt = new THREE.Vector3(targetX, effectiveTargetY, targetZ);

    const isDirectlyOverhead = angle === 'overhead-gods-eye' || (Math.abs(camPos.x - targetX) < 0.1 && Math.abs(camPos.z - targetZ) < 0.1);
    const safeUp = isDirectlyOverhead ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);

    if (cameraGizmoGroupRef.current) {
      cameraGizmoGroupRef.current.position.set(camPos.x, effectiveCamY, camPos.z);
      cameraGizmoGroupRef.current.up.copy(safeUp);
      cameraGizmoGroupRef.current.lookAt(targetLookAt);
      if (liveShot.camera.angle === 'dutch-angle') {
        cameraGizmoGroupRef.current.rotateZ(THREE.MathUtils.degToRad(-15));
      }
    }

    if (cameraFloorAnchorRef.current) {
      cameraFloorAnchorRef.current.position.set(camPos.x, 0, camPos.z);
      const dropLine = cameraFloorAnchorRef.current.getObjectByName('CameraDropLine');
      if (dropLine) {
        dropLine.scale.y = Math.max(0.1, effectiveCamY + 1.5);
      }
    }

    if (trajectoryLineRef.current) {
      const start = liveShot.camera.movement.startPosition;
      const end = liveShot.camera.movement.endPosition;
      const startPt = new THREE.Vector3((start.x - 50) * 1.0, (start.z ?? 50) * 0.3 + 1.5, (start.y - 50) * 1.0);
      const endPt = new THREE.Vector3((end.x - 50) * 1.0, (end.z ?? 50) * 0.3 + 1.5, (end.y - 50) * 1.0);
      trajectoryLineRef.current.geometry.dispose();
      trajectoryLineRef.current.geometry = new THREE.BufferGeometry().setFromPoints([startPt, endPt]);
      trajectoryLineRef.current.computeLineDistances();
    }

    if (vfCameraRef.current) {
      vfCameraRef.current.position.set(camPos.x, effectiveCamY + 1.5, camPos.z);
      vfCameraRef.current.up.copy(safeUp);
      vfCameraRef.current.lookAt(targetLookAt);

      if (liveShot.camera.angle === 'dutch-angle') {
        vfCameraRef.current.rotateZ(THREE.MathUtils.degToRad(-15));
      }
    }

    // Pass 1: Root positions, orientations, bone poses, and locomotion for all non-socketed actors
    liveShot.actors.forEach((actor, idx) => {
      if (actor.socketToBone?.targetActorId) return; // handled in pass 2

      const mesh = actorMeshesRef.current.get(actor.id);
      if (mesh) {
        const actorPos = getActorPositionAtTime(actor, t);
        const isHuman = detectObjectPoseCategory(actor) === 'humanoid';
        const isActorMode = liveShot.vfxReference?.enabled && liveShot.vfxReference?.referenceMode === 'actor-motion';
        const cadenceY = isHuman && isActorMode ? Math.sin(t * 8 + idx * 1.5) * 0.35 : 0;
        mesh.position.set(actorPos.x, actorPos.y + cadenceY, actorPos.z);
        if (typeof mesh.userData.update === 'function') {
          mesh.userData.update(0.016);
        }
        const actorScale = actor.scale ?? 1.0;
        mesh.scale.set(actorScale, actorScale, actorScale);

        const hasExplicitRot = actor.rotation !== undefined || (actor.trajectory.keyframes && actor.trajectory.keyframes.some((k) => k.rotation !== undefined));
        if (hasExplicitRot) {
          const objRot = interpolateObjectRotationAtTime(actor.trajectory, actor.rotation, t, liveDur);
          // Prevent humanoid characters with a legacy non-humanoid posePreset (e.g. 'prop-planted') from flipping upside-down
          const hasLegacyPropPreset = isHuman && Boolean(actor.posePreset && !POSE_PRESETS[actor.posePreset]);
          const safeRotX = hasLegacyPropPreset ? 0 : objRot.x;
          const safeRotZ = hasLegacyPropPreset ? 0 : objRot.z;
          mesh.rotation.set(
            THREE.MathUtils.degToRad(safeRotX),
            THREE.MathUtils.degToRad(objRot.y),
            THREE.MathUtils.degToRad(safeRotZ)
          );
        } else {
          const start = actor.trajectory.startPosition;
          const end = actor.trajectory.endPosition;
          const dx = end.x - start.x;
          const dz = end.y - start.y;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist > 1.0) {
            mesh.lookAt(actorPos.x + dx, actorPos.y, actorPos.z + dz);
          } else if (isHuman && liveShot.actors.length === 2 && idx <= 1) {
            const otherActor = liveShot.actors[1 - idx];
            if (otherActor && (!otherActor.kind || otherActor.kind === 'human')) {
              const otherPos = getActorPositionAtTime(otherActor, t);
              mesh.lookAt(otherPos.x, actorPos.y, otherPos.z);
            }
          }
        }

        // Ensure parent mesh transform (position, rotation, scale) is flushed to matrixWorld before evaluating IK / gait
        mesh.updateMatrixWorld(true);

        // Procedural Locomotion / Multi-Cue Bone Posing for rigged humanoids
        if (mesh.userData.rig && isHuman) {
          const isActivelyPosing =
            activeGizmoDragRef.current?.actorId === actor.id ||
            activeIKHandleRef.current?.actorId === actor.id;

          const clayOpt = liveShot.claymationMode ? { claymationFps: liveShot.claymationFps || 12 } : undefined;
          const currentPoseResult = interpolateActorPoseAtTime(actor.trajectory, actor.pose, t, liveDur, clayOpt);
          const activeMotionClip = currentPoseResult?.motionClip || actor.motionClip;

          const dtSampleCheck = 0.08;
          const pBef = interpolateTrajectoryPosition(actor.trajectory, Math.max(0, t - dtSampleCheck), liveDur);
          const pAft = interpolateTrajectoryPosition(actor.trajectory, Math.min(liveDur, t + dtSampleCheck), liveDur);
          const segSpanCheck = Math.max(0.04, Math.min(liveDur, t + dtSampleCheck) - Math.max(0, t - dtSampleCheck));
          const instFloorSpeed = Math.hypot(pAft.x - pBef.x, pAft.y - pBef.y) / segSpanCheck;
          const isTravelingOnFloor = instFloorSpeed > 0.8;

          let handledByReadyMadeClip = false;
          if (!isActivelyPosing && activeMotionClip) {
            handledByReadyMadeClip = evaluateReadyMadeHumanoidClip(
              mesh.userData.rig,
              activeMotionClip,
              t,
              currentPoseResult?.clipProgress,
              isTravelingOnFloor,
              currentPoseResult?.motionCycles ?? actor.motionCycles ?? 1
            );
          }

          if (!isActivelyPosing && !handledByReadyMadeClip) {
            if (currentPoseResult?.pose) {
              applyBonePose(mesh.userData.rig, currentPoseResult.pose);
            } else if (currentPoseResult?.posePreset && POSE_PRESETS[currentPoseResult.posePreset]) {
              applyPosePreset(mesh.userData.rig, currentPoseResult.posePreset);
            } else if (actor.posePreset && POSE_PRESETS[actor.posePreset]) {
              applyPosePreset(mesh.userData.rig, actor.posePreset);
            } else if (actor.posePreset && !POSE_PRESETS[actor.posePreset]) {
              applyPosePreset(mesh.userData.rig, 'neutral-stand');
            }
          }

          if (!handledByReadyMadeClip) {
            const start = actor.trajectory.startPosition;
            const end = actor.trajectory.endPosition;
            const totalDx = end.x - start.x;
            const totalDz = end.y - start.y;
            const totalDist = Math.sqrt(totalDx * totalDx + totalDz * totalDz);

            const dtSample = 0.08;
            const pBefore = interpolateTrajectoryPosition(actor.trajectory, Math.max(0, t - dtSample), liveDur);
            const pAfter = interpolateTrajectoryPosition(actor.trajectory, Math.min(liveDur, t + dtSample), liveDur);
            const segSpan = Math.max(0.04, Math.min(liveDur, t + dtSample) - Math.max(0, t - dtSample));
            const instDist = Math.hypot(pAfter.x - pBefore.x, pAfter.y - pBefore.y);
            const instUnitsPerSec = instDist / segSpan;
            const isMovingNow = instUnitsPerSec > 0.8 || (totalDist > 1.0 && (!actor.trajectory.keyframes || actor.trajectory.keyframes.length === 0));
            const speed = isMovingNow ? Math.max((instUnitsPerSec || totalDist / Math.max(1, liveDur)) * 0.15, 1.2) : 0;

            const activeCueGait = currentPoseResult?.gait;
            const reqGait = activeCueGait && activeCueGait !== 'auto' ? activeCueGait : actor.gait;
            const activePreset = currentPoseResult?.posePreset || actor.posePreset;
            const hasCustomPose =
              (!!actor.pose && !isSyntheticCompilerPose(actor.pose)) ||
              (!!activePreset &&
                activePreset !== 't-pose' &&
                activePreset !== 'neutral-stand' &&
                activePreset !== 'stride-mid');

            const shouldEvaluateGait =
              reqGait !== 'none' &&
              (reqGait === 'walk' || reqGait === 'run' || reqGait === 'sneak'
                ? true
                : reqGait === 'idle'
                ? !hasCustomPose
                : (!reqGait || reqGait === 'auto')
                ? (isMovingNow && !hasCustomPose)
                : false);

            if (shouldEvaluateGait) {
              evaluateGait(mesh.userData.rig, t, {
                gait: reqGait || 'auto',
                speed: reqGait === 'run' ? Math.max(speed, 2.5) : reqGait === 'walk' ? Math.max(speed, 1.3) : speed,
              });
            }
          }

          mesh.userData.rig.root.updateMatrixWorld(true);
        } else {
          const clayOpt = liveShot.claymationMode ? { claymationFps: liveShot.claymationFps || 12 } : undefined;
          const currentPoseResult = interpolateActorPoseAtTime(actor.trajectory, actor.pose, t, liveDur, clayOpt);
          const activeObjClip = currentPoseResult?.motionClip || actor.motionClip;
          if (activeObjClip) {
            evaluateReadyMadeObjectClip(mesh, activeObjClip, t);
          } else if (actor.posePreset) {
            applyNonHumanMeshPoseArticulation(mesh, actor.posePreset);
          }
        }
      }
    });

    // Pass 2: Props & items socketed to character bones
    liveShot.actors.forEach((actor) => {
      if (!actor.socketToBone?.targetActorId) return;

      const mesh = actorMeshesRef.current.get(actor.id);
      if (!mesh) return;

      const baseRingGroup = mesh.getObjectByName('__base_ring_group__');
      if (baseRingGroup) baseRingGroup.visible = false;
      const parentMesh = actorMeshesRef.current.get(actor.socketToBone.targetActorId);
      if (parentMesh && parentMesh.userData.rig) {
        const bone = parentMesh.userData.rig.bones.get(actor.socketToBone.boneName as HumanoidBone);
        if (bone) {
          parentMesh.userData.rig.root.updateMatrixWorld(true);
          const worldPos = new THREE.Vector3();
          const worldQuat = new THREE.Quaternion();
          bone.getWorldPosition(worldPos);
          bone.getWorldQuaternion(worldQuat);

          const localOffset = actor.socketToBone.offset
            ? new THREE.Vector3(actor.socketToBone.offset.x, actor.socketToBone.offset.y, actor.socketToBone.offset.z)
            : new THREE.Vector3(0, 0, 0);
          localOffset.applyQuaternion(worldQuat);
          mesh.position.copy(worldPos).add(localOffset);

          mesh.quaternion.copy(worldQuat);
          if (actor.socketToBone.rotationOffset) {
            const euler = new THREE.Euler(
              THREE.MathUtils.degToRad(actor.socketToBone.rotationOffset.x),
              THREE.MathUtils.degToRad(actor.socketToBone.rotationOffset.y),
              THREE.MathUtils.degToRad(actor.socketToBone.rotationOffset.z)
            );
            const qOffset = new THREE.Quaternion().setFromEuler(euler);
            mesh.quaternion.multiply(qOffset);
          }
        }
      }
    });
  };

  useEffect(() => {
    syncPositions(currentTime);
    if (stageRendererRef.current && stageSceneRef.current && stageCameraRef.current) {
      stageRendererRef.current.render(stageSceneRef.current, stageCameraRef.current);
    }
    if (vfRendererRef.current && stageSceneRef.current && vfCameraRef.current && !useShotStore.getState().isRenderingPrevis) {
      vfRendererRef.current.render(stageSceneRef.current, vfCameraRef.current);
    }
  }, [currentTime, shot, duration]);

  // In-App 3D Previs Video Renderer (Deterministic offline fixed-timestep MP4 capture)
  const handleRenderInAppPrevis = async (
    requestedPassMode?: 'rgb' | 'depth' | 'openpose' | 'all',
    requestedResolution: '720p' | '1080p' = '720p'
  ): Promise<{ url: string; blob: Blob; openposeUrl?: string; depthUrl?: string } | null> => {
    if (!vfRendererRef.current) {
      initVfRendererRef.current?.();
    }
    if (!vfRendererRef.current) {
      vfRendererRef.current = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    }
    if (!stageSceneRef.current || !vfCameraRef.current) {
      console.warn('Cannot record previs: Three.js viewfinder scene/camera not ready');
      return null;
    }

    const canvas = vfRendererRef.current.domElement;
    if (!canvas) return null;

    setPrevisRendering(true, 0);

    try {
      // Preload all 3D actor models so they are fully parsed and rendered
      const actorModelUrls = shot.actors.map((a) => a.modelUrl).filter((u): u is string => !!u);
      if (actorModelUrls.length > 0) {
        await preloadGltfModels(actorModelUrls);
      }

      // Temporarily hide helper gizmos that shouldn't appear in the viewfinder
      if (cameraGizmoGroupRef.current) cameraGizmoGroupRef.current.visible = false;
      if (trajectoryLineRef.current) trajectoryLineRef.current.visible = false;
      if (gridHelperRef.current) gridHelperRef.current.visible = false;
      if (ikHandlesGroupRef.current) ikHandlesGroupRef.current.visible = false;
      if (jointDiscsGroupRef.current) jointDiscsGroupRef.current.visible = false;
      if (boneGizmoGroupRef.current) boneGizmoGroupRef.current.visible = false;

      // Deterministic render (8n+1 frame snapping if target model is LTX-2.5)
      const isLtx = shot.targetModel === 'ltx-2.5';
      const hasHumanActor = shot.actors.some((a) => !a.kind || a.kind === 'human');
      const renderPassMode = requestedPassMode || (hasHumanActor ? 'all' : 'rgb');

      // Calculate target resolution matching shot aspect ratio
      const aspectStr = shot.aspectRatio || '16:9';
      const targetAspect = ASPECT_RATIOS[aspectStr] || 16 / 9;
      let targetWidth = 1280;
      let targetHeight = 720;

      if (aspectStr === '9:16') {
        targetWidth = requestedResolution === '1080p' ? 1080 : 720;
        targetHeight = requestedResolution === '1080p' ? 1920 : 1280;
      } else if (aspectStr === '1:1') {
        targetWidth = requestedResolution === '1080p' ? 1080 : 720;
        targetHeight = requestedResolution === '1080p' ? 1080 : 720;
      } else {
        targetHeight = requestedResolution === '1080p' ? 1080 : 720;
        targetWidth = Math.round(targetHeight * targetAspect);
      }

      if (targetWidth % 2 !== 0) targetWidth += 1;
      if (targetHeight % 2 !== 0) targetHeight += 1;

      // Ensure camera projection matches exact aspect ratio
      vfCameraRef.current.aspect = targetWidth / targetHeight;
      vfCameraRef.current.updateProjectionMatrix();

      // Collect all active humanoid rigs for high-fidelity OpenPose pass
      const activeHumanoidRigs: HumanoidRig[] = [];
      actorMeshesRef.current.forEach((actorMesh) => {
        if (actorMesh.userData?.rig) {
          activeHumanoidRigs.push(actorMesh.userData.rig);
        }
      });

      const result = await renderOfflinePrevisPasses({
        scene: stageSceneRef.current,
        camera: vfCameraRef.current,
        renderer: vfRendererRef.current,
        durationSeconds: duration,
        fps: shot.frameRate || 24,
        width: targetWidth,
        height: targetHeight,
        renderPass: renderPassMode,
        snap8n1: isLtx,
        syncPositions,
        modelUrls: actorModelUrls,
        humanoidRigs: activeHumanoidRigs,
        onProgress: (pct) => setPrevisRendering(true, pct),
      });

      // Restore gizmos
      if (cameraGizmoGroupRef.current) cameraGizmoGroupRef.current.visible = true;
      if (trajectoryLineRef.current) trajectoryLineRef.current.visible = true;
      if (gridHelperRef.current) gridHelperRef.current.visible = showGrid;
      if (ikHandlesGroupRef.current) ikHandlesGroupRef.current.visible = true;
      if (jointDiscsGroupRef.current) jointDiscsGroupRef.current.visible = true;
      if (boneGizmoGroupRef.current) boneGizmoGroupRef.current.visible = false;

      // Restore positions to current time
      syncPositions(currentTime);
      updateSizesRef.current?.();

      if (result.openposeBlob && result.openposeUrl) {
        setPrevisOpenPose(result.openposeUrl, result.openposeBlob);
      }

      if (result.depthBlob && result.depthUrl) {
        setPrevisDepth(result.depthUrl, result.depthBlob);
      }

      if (result.rgbBlob && result.rgbUrl) {
        setPrevisVideo(result.rgbUrl, result.rgbBlob);
        setPrevisRendering(false, 100);
        return {
          url: result.rgbUrl,
          blob: result.rgbBlob,
          openposeUrl: result.openposeUrl,
          depthUrl: result.depthUrl,
        };
      }

      const fallbackUrl = result.openposeUrl || result.depthUrl;
      const fallbackBlob = result.openposeBlob || result.depthBlob;
      if (fallbackUrl && fallbackBlob) {
        setPrevisRendering(false, 100);
        return {
          url: fallbackUrl,
          blob: fallbackBlob,
          openposeUrl: result.openposeUrl,
          depthUrl: result.depthUrl,
        };
      }

      setPrevisRendering(false, 0);
      return null;
    } catch (err) {
      console.error('In-app previs render failed:', err);
      // Restore gizmos on error
      if (cameraGizmoGroupRef.current) cameraGizmoGroupRef.current.visible = true;
      if (trajectoryLineRef.current) trajectoryLineRef.current.visible = true;
      if (gridHelperRef.current) gridHelperRef.current.visible = showGrid;
      if (ikHandlesGroupRef.current) ikHandlesGroupRef.current.visible = true;
      if (jointDiscsGroupRef.current) jointDiscsGroupRef.current.visible = true;
      if (boneGizmoGroupRef.current) boneGizmoGroupRef.current.visible = false;
      syncPositions(currentTime);
      updateSizesRef.current?.();
      setPrevisRendering(false, 0);
      return null;
    }
  };

  const handleRenderInAppPrevisRef = useRef(handleRenderInAppPrevis);
  handleRenderInAppPrevisRef.current = handleRenderInAppPrevis;

  // Register renderer: Viewfinder instance is primary; Stage instance is fallback
  useEffect(() => {
    const isViewfinder = initialViewMode === 'viewfinder' || initialViewMode === 'split' || viewMode === 'viewfinder' || viewMode === 'split';
    const renderFn: PrevisRendererFn = (passMode, resolution) =>
      handleRenderInAppPrevisRef.current(passMode, resolution);

    const cleanup = registerPrevisRenderer(
      renderFn,
      isViewfinder ? 'primary' : 'fallback'
    );
    return () => {
      if (typeof cleanup === 'function') {
        cleanup();
      } else {
        registerPrevisRenderer(null);
      }
    };
  }, [initialViewMode, viewMode]);

  // Preset Views for Orbit Controls
  const setOrbitView = (view: 'top' | 'iso' | 'eye') => {
    if (!stageCameraRef.current || !stageControlsRef.current) return;
    const target = stageControlsRef.current.target;
    const tx = target.x;
    const ty = 1.4;
    const tz = target.z;
    if (view === 'top') {
      stageCameraRef.current.position.set(tx, 70, tz + 2.5);
      stageControlsRef.current.target.set(tx, 0, tz);
    } else if (view === 'iso') {
      centerStageCamera();
      return;
    } else if (view === 'eye') {
      stageCameraRef.current.position.set(tx, ty + 0.3, tz + 28);
      stageControlsRef.current.target.set(tx, ty, tz);
    }
    stageControlsRef.current.update();
  };

  // Recenter and frame 3D Stage Camera onto the complete soundstage scene or selected subject.
  // Manual / Explicit Trigger Only: never auto-zooms or interrupts director editing sessions!
  const centerStageCamera = useCallback((targetActorId?: string) => {
    if (!stageCameraRef.current || !stageControlsRef.current) return;
    if (stageControlsRef.current.object !== stageCameraRef.current) {
      stageControlsRef.current.object = stageCameraRef.current;
    }

    let targetX = 0;
    let targetY = 1.4;
    let targetZ = 0;
    let sceneSpan = 25;

    const currentShot = useShotStore.getState().shot;
    const currentSelId = useShotStore.getState().selectedActorId;
    const actors = currentShot.actors;
    const isFramingCamera = targetActorId === '__camera__' || (!targetActorId && currentSelId === '__camera__');
    const effectiveActorId = !isFramingCamera ? (targetActorId || currentSelId) : undefined;

    if (isFramingCamera) {
      const camPos = getCameraPositionAtTime(currentTimeRef.current);
      targetX = camPos.x;
      targetY = Math.max(1.5, camPos.y);
      targetZ = camPos.z;
      sceneSpan = 22;
    } else if (effectiveActorId) {
      const actor = actors.find((a) => a.id === effectiveActorId);
      if (actor) {
        const pos = getActorPositionAtTime(actor, currentTimeRef.current);
        targetX = pos.x;
        targetY = 1.4; // Ground/eye level framing keeps subject centered
        targetZ = pos.z;
        const scale = actor.scale ?? 1.0;
        sceneSpan = Math.max(14, scale * 10);
      }
    } else if (actors.length > 0) {
      // Focus target on the actors centroid at ground/eye height
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;

      for (const actor of actors) {
        const pos = getActorPositionAtTime(actor, currentTimeRef.current);
        const scale = actor.scale ?? 1.0;
        const radius = Math.max(3, scale * 3.0);
        minX = Math.min(minX, pos.x - radius);
        maxX = Math.max(maxX, pos.x + radius);
        minZ = Math.min(minZ, pos.z - radius);
        maxZ = Math.max(maxZ, pos.z + radius);
      }

      minX -= 2;
      maxX += 2;
      minZ -= 2;
      maxZ += 2;

      targetX = (minX + maxX) / 2;
      targetZ = (minZ + maxZ) / 2;
      targetY = 1.4;

      const spanX = maxX - minX;
      const spanZ = maxZ - minZ;
      sceneSpan = Math.max(spanX, spanZ, 20);
    } else {
      const lookAtCoord = currentShot.camera.movement.targetLookAt ?? { x: 50, y: 50 };
      targetX = (lookAtCoord.x - 50) * 1.0;
      targetZ = (lookAtCoord.y - 50) * 1.0;
      targetY = 1.4;
      sceneSpan = 25;
    }

    const dist = Math.max(18, Math.min(50, sceneSpan * 1.15));
    const camX = targetX + dist * 0.44;
    const camY = targetY + dist * 0.38;
    const camZ = targetZ + dist * 0.66;

    stageControlsRef.current.target.set(targetX, targetY, targetZ);
    stageCameraRef.current.position.set(camX, camY, camZ);
    stageCameraRef.current.lookAt(targetX, targetY, targetZ);
    if ((stageControlsRef.current as any)._panOffset) {
      (stageControlsRef.current as any)._panOffset.set(0, 0, 0);
    }
    if ((stageControlsRef.current as any)._sphericalDelta) {
      (stageControlsRef.current as any)._sphericalDelta.set(0, 0, 0);
    }
    stageControlsRef.current.enabled = true;
    stageControlsRef.current.update();
    logger.system(`[centerStageCamera] target(${targetX.toFixed(1)}, ${targetY.toFixed(1)}, ${targetZ.toFixed(1)}) cam(${camX.toFixed(1)}, ${camY.toFixed(1)}, ${camZ.toFixed(1)}) dist=${dist.toFixed(1)}`);
  }, []);

  centerStageCameraRef.current = centerStageCamera;

  const lastFramedShotIdRef = useRef<string | null>(null);

  // Automatically frame stage camera ONLY once on scene startup or when switching to a different shot
  useEffect(() => {
    if (shot.id && shot.id !== lastFramedShotIdRef.current) {
      lastFramedShotIdRef.current = shot.id;
      centerStageCamera();
    }
  }, [shot.id, centerStageCamera]);

  // Global hotkey 'F' to focus camera on selected subject or scene
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedBone(null);
        selectedBoneRef.current = null;
        setSelectedActorId(undefined);
        if (boneGizmoGroupRef.current) {
          setGizmoHoveredAxis(boneGizmoGroupRef.current, null, null);
        }
        if (hoveredJointDiscRef.current) {
          setJointDiscHovered(hoveredJointDiscRef.current, false);
          hoveredJointDiscRef.current = null;
        }
        setHoverDirectionHud(null);
        logger.action('Deselected subject and joints [Escape]');
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        centerStageCamera();
        logger.action('Focused stage camera on selection [F]');
        return;
      }

      // 3D Soundstage Walkthrough Navigation (WASD / Arrow Keys / Q & E elevation)
      if (
        (viewModeRef.current === 'stage' || viewModeRef.current === 'split') &&
        stageCameraRef.current &&
        stageControlsRef.current &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        const cam = stageCameraRef.current;
        const ctrl = stageControlsRef.current;
        if (ctrl.object !== cam) ctrl.object = cam;

        const step = e.shiftKey ? 4.5 : 2.0;
        const forward = new THREE.Vector3();
        cam.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
        forward.normalize();

        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        const delta = new THREE.Vector3();

        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
          delta.addScaledVector(forward, step);
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          delta.addScaledVector(forward, -step);
        } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
          delta.addScaledVector(right, step);
        } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
          delta.addScaledVector(right, -step);
        } else if (e.key === 'e' || e.key === 'E') {
          delta.y += step * 0.75;
        } else if (e.key === 'q' || e.key === 'Q') {
          delta.y -= step * 0.75;
        }

        if (delta.lengthSq() > 0) {
          e.preventDefault();
          cam.position.add(delta);
          ctrl.target.add(delta);
          if (cam.position.y < 0.6) cam.position.y = 0.6;
          if (ctrl.target.y < 0.2) ctrl.target.y = 0.2;
          ctrl.update();
          if (stageRendererRef.current && stageSceneRef.current) {
            stageRendererRef.current.render(stageSceneRef.current, cam);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [centerStageCamera]);

  // Listen to global recenter event from toolbar or shortcut
  useEffect(() => {
    const handleRecenterEvent = (e: Event) => {
      const customEvt = e as CustomEvent<{ actorId?: string }>;
      centerStageCamera(customEvt.detail?.actorId);
    };
    window.addEventListener('cmpvs:recenter-stage', handleRecenterEvent);
    return () => window.removeEventListener('cmpvs:recenter-stage', handleRecenterEvent);
  }, [centerStageCamera]);

  const isPointerDownRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const hitInteractiveRef = useRef(false);
  const pendingClickedActorIdRef = useRef<string | null>(null);
  const pendingClickedCameraRef = useRef<boolean>(false);
  const pendingClickedDiscRef = useRef<THREE.Object3D | null>(null);

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-hud]')) return;
    if (e.button !== 0) return; // Left click only

    if (e.altKey) {
      hitInteractiveRef.current = false;
      draggedActorIdRef.current = null;
      pendingClickedActorIdRef.current = null;
      pendingClickedCameraRef.current = false;
      if (stageControlsRef.current) stageControlsRef.current.enabled = true;
      return;
    }

    const rect = stageMountRef.current?.getBoundingClientRect();
    if (!rect || !stageCameraRef.current || !stageSceneRef.current) return;

    isPointerDownRef.current = true;
    hasDraggedRef.current = false;
    hitInteractiveRef.current = false;
    pendingClickedActorIdRef.current = null;
    pendingClickedCameraRef.current = false;
    pendingClickedDiscRef.current = null;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    pointerDownTimestampRef.current = performance.now();

    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    mouseVecRef.current.set(mouseX, mouseY);
    raycasterRef.current.setFromCamera(mouseVecRef.current, stageCameraRef.current);

    // Unified Depth-Sorted Raycast: Click directly on arrows or discs with zero offset!
    const gizHits = (boneGizmoGroupRef.current && boneGizmoGroupRef.current.visible)
      ? raycasterRef.current.intersectObjects(boneGizmoGroupRef.current.children, true)
      : [];
    const discHits = (jointDiscsGroupRef.current && jointDiscsGroupRef.current.visible)
      ? raycasterRef.current.intersectObjects(jointDiscsGroupRef.current.children, true)
      : [];
    const ikHits = (posingModeRef.current === 'ik' && ikHandlesGroupRef.current && ikHandlesGroupRef.current.visible)
      ? raycasterRef.current.intersectObjects(ikHandlesGroupRef.current.children, true)
      : [];

    let closestGizmoHit: { hit: THREE.Intersection; handle: THREE.Object3D; axis: GizmoAxisType } | null = null;
    for (const hit of gizHits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        if (cur.userData?.isGizmoHandle) {
          closestGizmoHit = { hit, handle: cur, axis: cur.userData.axis as GizmoAxisType };
          break;
        }
        cur = cur.parent;
      }
      if (closestGizmoHit) break;
    }

    let closestDiscHit: { hit: THREE.Intersection; disc: THREE.Object3D; boneName: HumanoidBone } | null = null;
    for (const hit of discHits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        if (cur.userData?.isJointDisc && cur.userData?.boneName) {
          closestDiscHit = { hit, disc: cur, boneName: cur.userData.boneName as HumanoidBone };
          break;
        }
        cur = cur.parent;
      }
      if (closestDiscHit) break;
    }

    // Determine target with exact depth sorting
    let clickedAxis: GizmoAxisType | null = null;
    let clickedDisc: THREE.Object3D | null = null;

    if (closestGizmoHit && closestDiscHit) {
      // If clicking the current bone's center disc, prioritize the gizmo handles directly
      if (closestDiscHit.boneName === selectedBoneRef.current) {
        clickedAxis = closestGizmoHit.axis;
      } else if (closestGizmoHit.hit.distance <= closestDiscHit.hit.distance) {
        clickedAxis = closestGizmoHit.axis;
      } else {
        clickedDisc = closestDiscHit.disc;
      }
    } else if (closestGizmoHit) {
      clickedAxis = closestGizmoHit.axis;
    } else if (closestDiscHit) {
      clickedDisc = closestDiscHit.disc;
    }

    // 1. If an axis handle of the gizmo was clicked: start active drag immediately right on the arrow!
    if (clickedAxis) {
      hitInteractiveRef.current = true;
      const axis = clickedAxis;
      const liveState = useShotStore.getState();
      const aId = liveState.selectedActorId;
      const boneName = selectedBoneRef.current;

      // Case 1A: Humanoid FK Bone Posing when a specific bone is selected
      if (aId && aId !== '__camera__' && boneName && showPosingHandlesRef.current && posingModeRef.current === 'fk') {
        const actorMesh = actorMeshesRef.current.get(aId);
        const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
        const bone = rig?.bones.get(boneName);
        if (rig && bone) {
          activeGizmoDragRef.current = {
            axis,
            bone: boneName,
            actorId: aId,
            startPointer: { x: e.clientX, y: e.clientY },
            startQuat: bone.quaternion.clone(),
            startPos: bone.position.clone(),
          };
          beginGesture();
          if (stageControlsRef.current) stageControlsRef.current.enabled = false;

          setGizmoHoveredAxis(boneGizmoGroupRef.current, axis, axis);
          hoveredGizmoAxisRef.current = axis;
          setHoverDirectionHud({
            title: `DRAGGING ${axis.toUpperCase()} AXIS`,
            hint: `Posing ${boneName} in 3D`,
            color: '#f59e0b',
            badge: 'ACTIVE',
            axis,
          });
          return;
        }
      }

      // Case 1B: 3D XYZ Axis Translation Gizmo for Selected Camera or Selected Prop/Actor Root!
      if (aId && (axis === 'x' || axis === 'y' || axis === 'z')) {
        const liveShot = liveState.shot;
        const liveDur = liveShot.durationSeconds || duration || 4.0;
        let startStagePos = { x: 50, y: 50, z: 0 };
        if (aId === '__camera__') {
          const st = interpolateTrajectoryPosition(liveShot.camera.movement, currentTimeRef.current, liveDur);
          startStagePos = { x: st.x, y: st.y, z: st.z ?? liveShot.camera.movement.startPosition.z ?? 20 };
        } else {
          const act = liveShot.actors.find((a) => a.id === aId);
          if (act) {
            const st = interpolateTrajectoryPosition(act.trajectory, currentTimeRef.current, liveDur);
            startStagePos = { x: st.x, y: st.y, z: st.z ?? act.trajectory.startPosition.z ?? 0 };
          }
        }

        const axisVec =
          axis === 'x'
            ? new THREE.Vector3(1, 0, 0)
            : axis === 'y'
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(0, 0, 1);

        const gizmoPos = boneGizmoGroupRef.current
          ? boneGizmoGroupRef.current.position.clone()
          : new THREE.Vector3(0, 1.5, 0);

        const camToGizmo = new THREE.Vector3().subVectors(stageCameraRef.current.position, gizmoPos).normalize();
        const planeNormal = camToGizmo.clone().addScaledVector(axisVec, -camToGizmo.dot(axisVec));
        if (planeNormal.lengthSq() < 1e-4) {
          planeNormal.set(axis === 'y' ? 0 : 0, axis === 'y' ? 0 : 1, axis === 'y' ? 1 : 0);
        } else {
          planeNormal.normalize();
        }

        objectAxisPlaneRef.current.setFromNormalAndCoplanarPoint(planeNormal, gizmoPos);
        const startHitPoint = new THREE.Vector3();
        const hasHit = raycasterRef.current.ray.intersectPlane(objectAxisPlaneRef.current, startHitPoint);
        if (!hasHit) {
          startHitPoint.copy(gizmoPos);
        }

        activeObjectAxisDragRef.current = {
          axis,
          targetId: aId,
          axisVec,
          startHitPoint,
          startStagePos,
        };
        beginGesture();
        if (stageControlsRef.current) stageControlsRef.current.enabled = false;
        setGizmoHoveredAxis(boneGizmoGroupRef.current, axis, axis);
        hoveredGizmoAxisRef.current = axis;
        setHoverDirectionHud({
          title: `MOVING ALONG ${axis.toUpperCase()} AXIS`,
          hint:
            axis === 'x'
              ? 'Lateral Truck Left ↔ Right'
              : axis === 'y'
              ? 'Vertical Elevation Up ↕ Down'
              : 'Stage Depth Dolly In ↔ Out',
          color: axis === 'x' ? '#ff4d4d' : axis === 'y' ? '#22c55e' : '#3b82f6',
          badge: `${axis.toUpperCase()} AXIS`,
          axis,
        });
        return;
      }
    }

    // 2. Scene actors and camera gizmo tracking variables
    let clickedActorId: string | null = null;
    let clickedCamera = false;
    let clickedHitPoint: THREE.Vector3 | null = null;

    // If center gizmo sphere was clicked on Camera or Actor root, treat as direct freeform drag of that target
    if (clickedAxis === 'center' && useShotStore.getState().selectedActorId) {
      const sel = useShotStore.getState().selectedActorId!;
      if (sel === '__camera__') {
        clickedCamera = true;
      } else {
        clickedActorId = sel;
      }
      if (closestGizmoHit) {
        clickedHitPoint = closestGizmoHit.hit.point.clone();
      }
    }

    // If a joint disc was clicked: record pending joint disc selection, and enable floor drag
    if (clickedDisc) {
      hitInteractiveRef.current = true;
      pendingClickedDiscRef.current = clickedDisc;
      clickedActorId = (clickedDisc.userData?.actorId as string) || selectedActorId || null;
      if (closestDiscHit) {
        clickedHitPoint = closestDiscHit.hit.point.clone();
      }
    }

    // 3. IK Handles
    let clickedIKHandle: THREE.Object3D | null = null;
    if (ikHits.length > 0) {
      let cur: THREE.Object3D | null = ikHits[0].object;
      while (cur) {
        if (cur.userData?.isIKHandle) {
          clickedIKHandle = cur;
          break;
        }
        cur = cur.parent;
      }
    }

    if (clickedIKHandle) {
      hitInteractiveRef.current = true;
      const hType = clickedIKHandle.userData.handleType;
      const aId = clickedIKHandle.userData.actorId;
      activeIKHandleRef.current = { handleType: hType, actorId: aId };
      beginGesture();
      if (stageControlsRef.current) stageControlsRef.current.enabled = false;

      const handleWorldPos = new THREE.Vector3();
      clickedIKHandle.getWorldPosition(handleWorldPos);
      if (stageCameraRef.current) {
        const camDir = new THREE.Vector3();
        stageCameraRef.current.getWorldDirection(camDir);
        ikDragPlaneRef.current.setFromNormalAndCoplanarPoint(camDir.negate(), handleWorldPos);
      }
      return;
    }

    // 4. Scene actors and camera gizmo (1:1 Elevation-Matched Horizontal Plane Dragging & Selection)
    if (!clickedActorId && !clickedCamera) {
      const actorMeshList = Array.from(actorMeshesRef.current.values());
      const actorHits = raycasterRef.current.intersectObjects(actorMeshList, true);
      for (const hit of actorHits) {
        const obj = hit.object;
        if (
          obj.userData?.isJointDisc ||
          obj.userData?.isIKHandle ||
          obj.userData?.isHelper ||
          (obj as any).isSprite ||
          obj.type === 'Sprite' ||
          (obj as any).isLine ||
          (obj as any).isLineSegments
        ) {
          continue;
        }
        let cur: THREE.Object3D | null = obj;
        let foundActorId: string | null = null;
        while (cur) {
          if (cur.userData?.actorId) {
            foundActorId = cur.userData.actorId;
            break;
          }
          cur = cur.parent;
        }
        if (foundActorId) {
          clickedActorId = foundActorId;
          clickedHitPoint = hit.point.clone();
          break;
        }
      }
    }

    // Camera Gizmo & Floor Anchor check (targeted to camera gizmo group & floor ring)
    if (!clickedActorId && !clickedCamera) {
      const camTargets: THREE.Object3D[] = [];
      if (cameraGizmoGroupRef.current && cameraGizmoGroupRef.current.visible) {
        camTargets.push(...cameraGizmoGroupRef.current.children);
      }
      if (cameraFloorAnchorRef.current && cameraFloorAnchorRef.current.visible) {
        camTargets.push(...cameraFloorAnchorRef.current.children);
      }
      if (camTargets.length > 0) {
        const camHits = raycasterRef.current.intersectObjects(camTargets, true);
        for (const hit of camHits) {
          let cur: THREE.Object3D | null = hit.object;
          while (cur) {
            if (cur.userData?.isCamera) {
              clickedCamera = true;
              clickedHitPoint = hit.point.clone();
              break;
            }
            cur = cur.parent;
          }
          if (clickedCamera) break;
        }
      }
    }

    // Direct 3D Drag for clicked actor or camera on its exact elevation plane:
    if (clickedActorId || clickedCamera) {
      hitInteractiveRef.current = true;
      const targetId = clickedActorId || '__camera__';
      pendingClickedActorIdRef.current = clickedActorId;
      pendingClickedCameraRef.current = clickedCamera;

      // Direct dragging: Always drag actor/camera on direct click-drag, disable OrbitControls while dragging
      draggedActorIdRef.current = targetId;
      if (stageControlsRef.current) {
        stageControlsRef.current.enabled = false;
      }

      const liveShot = useShotStore.getState().shot;
      const liveDur = liveShot.durationSeconds || duration || 4.0;
      let currentPos3D = { x: 0, y: 0, z: 0 };
      if (clickedActorId) {
        const act = liveShot.actors.find((a) => a.id === clickedActorId);
        if (act) {
          const pos = getActorPositionAtTime(act, currentTimeRef.current);
          currentPos3D = { x: pos.x, y: pos.y, z: pos.z };
          const st = interpolateTrajectoryPosition(act.trajectory, currentTimeRef.current, liveDur);
          dragStartStagePosRef.current = {
            x: st.x,
            y: st.y,
            z: st.z ?? act.trajectory.startPosition.z ?? 0,
          };
        }
      } else {
        // getCameraPositionAtTime ALREADY returns Three.js coordinates { x, y, z } in -50..50 space!
        const camPos = getCameraPositionAtTime(currentTimeRef.current);
        currentPos3D = { x: camPos.x, y: camPos.y, z: camPos.z };
        const st = interpolateTrajectoryPosition(liveShot.camera.movement, currentTimeRef.current, liveDur);
        dragStartStagePosRef.current = {
          x: st.x,
          y: st.y,
          z: st.z ?? liveShot.camera.movement.startPosition.z ?? 20,
        };
      }

      // Place drag plane at the grabbed point; if grabY is near/above the 3D Stage camera eye level or near the horizon,
      // tilt the drag plane normal toward the viewer so downward/horizontal cursor rays NEVER shoot to infinity!
      const grabY = clickedHitPoint ? clickedHitPoint.y : currentPos3D.y + (clickedCamera ? 1.5 : 0);
      const planeNormal = new THREE.Vector3(0, 1, 0);
      if (stageCameraRef.current) {
        const camY = stageCameraRef.current.position.y;
        const rayY = raycasterRef.current.ray.direction.y;
        if (grabY >= camY - 2.5 || rayY > -0.25) {
          const camDir = new THREE.Vector3();
          stageCameraRef.current.getWorldDirection(camDir);
          planeNormal.set(-camDir.x, Math.max(0.4, -camDir.y), -camDir.z).normalize();
        }
      }
      dragPlaneRef.current.setFromNormalAndCoplanarPoint(
        planeNormal,
        new THREE.Vector3(currentPos3D.x, grabY, currentPos3D.z)
      );

      const hitFloor = new THREE.Vector3();
      const hasFloorHit = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, hitFloor);
      if (hasFloorHit) {
        floorDragOffsetRef.current = {
          x: currentPos3D.x - hitFloor.x,
          z: currentPos3D.z - hitFloor.z,
        };
      } else {
        floorDragOffsetRef.current = { x: 0, z: 0 };
      }
    } else {
      hitInteractiveRef.current = false;
      draggedActorIdRef.current = null;
      pendingClickedActorIdRef.current = null;
      pendingClickedCameraRef.current = false;
      if (stageControlsRef.current) {
        stageControlsRef.current.enabled = true;
      }
    }
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) {
      // Hover detection for interactive 3D handles & joint discs
      const rect = stageMountRef.current?.getBoundingClientRect();
      if (rect && stageCameraRef.current) {
        const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        mouseVecRef.current.set(mouseX, mouseY);
        raycasterRef.current.setFromCamera(mouseVecRef.current, stageCameraRef.current);

        let hoveredHandle: THREE.Object3D | null = null;
        let hoveredAxis: GizmoAxisType | null = null;
        let hoveredDisc: THREE.Object3D | null = null;
        let hoveredIK: THREE.Object3D | null = null;

        // Unified Depth-Sorted Hover: Raycast both Gizmo and Joint discs simultaneously
        const gizHits = (boneGizmoGroupRef.current && boneGizmoGroupRef.current.visible)
          ? raycasterRef.current.intersectObjects(boneGizmoGroupRef.current.children, true)
          : [];
        const discHits = (jointDiscsGroupRef.current && jointDiscsGroupRef.current.visible)
          ? raycasterRef.current.intersectObjects(jointDiscsGroupRef.current.children, true)
          : [];

        let closestGizmoHit: { hit: THREE.Intersection; handle: THREE.Object3D; axis: GizmoAxisType } | null = null;
        for (const hit of gizHits) {
          let cur: THREE.Object3D | null = hit.object;
          while (cur) {
            if (cur.userData?.isGizmoHandle) {
              closestGizmoHit = { hit, handle: cur, axis: cur.userData.axis as GizmoAxisType };
              break;
            }
            cur = cur.parent;
          }
          if (closestGizmoHit) break;
        }

        let closestDiscHit: { hit: THREE.Intersection; disc: THREE.Object3D; boneName: string } | null = null;
        for (const hit of discHits) {
          let cur: THREE.Object3D | null = hit.object;
          while (cur) {
            if (cur.userData?.isJointDisc && cur.userData?.boneName) {
              closestDiscHit = { hit, disc: cur, boneName: cur.userData.boneName };
              break;
            }
            cur = cur.parent;
          }
          if (closestDiscHit) break;
        }

        if (closestGizmoHit && closestDiscHit) {
          if (closestDiscHit.boneName === selectedBoneRef.current) {
            hoveredHandle = closestGizmoHit.handle;
            hoveredAxis = closestGizmoHit.axis;
          } else if (closestGizmoHit.hit.distance <= closestDiscHit.hit.distance) {
            hoveredHandle = closestGizmoHit.handle;
            hoveredAxis = closestGizmoHit.axis;
          } else {
            hoveredDisc = closestDiscHit.disc;
          }
        } else if (closestGizmoHit) {
          hoveredHandle = closestGizmoHit.handle;
          hoveredAxis = closestGizmoHit.axis;
        } else if (closestDiscHit) {
          hoveredDisc = closestDiscHit.disc;
        }

        // Apply directional highlight to gizmo
        if (hoveredAxis !== hoveredGizmoAxisRef.current) {
          hoveredGizmoAxisRef.current = hoveredAxis;
          setGizmoHoveredAxis(boneGizmoGroupRef.current, hoveredAxis, null);
        }

        // Apply joint disc hover highlighting
        if (hoveredDisc !== hoveredJointDiscRef.current) {
          if (hoveredJointDiscRef.current) {
            setJointDiscHovered(hoveredJointDiscRef.current, false);
          }
          hoveredJointDiscRef.current = hoveredDisc;
          if (hoveredDisc) {
            setJointDiscHovered(hoveredDisc, true);
          }
        }

        // 3. IK Handles hover
        if (!hoveredHandle && !hoveredDisc && ikHandlesGroupRef.current?.visible) {
          const ikHits = raycasterRef.current.intersectObjects(ikHandlesGroupRef.current.children, true);
          if (ikHits.length > 0) hoveredIK = ikHits[0].object;
        }

        // 4. Camera & Actor Hover Detection (for intuitive grab cursor & helpful HUD hint)
        let hoveredCamera = false;
        let hoveredActorName: string | null = null;
        if (!hoveredHandle && !hoveredDisc && !hoveredIK) {
          const camTargets: THREE.Object3D[] = [];
          if (cameraGizmoGroupRef.current && cameraGizmoGroupRef.current.visible) {
            camTargets.push(...cameraGizmoGroupRef.current.children);
          }
          if (cameraFloorAnchorRef.current && cameraFloorAnchorRef.current.visible) {
            camTargets.push(...cameraFloorAnchorRef.current.children);
          }
          if (camTargets.length > 0) {
            const cHits = raycasterRef.current.intersectObjects(camTargets, true);
            for (const h of cHits) {
              let cur: THREE.Object3D | null = h.object;
              while (cur) {
                if (cur.userData?.isCamera) {
                  hoveredCamera = true;
                  break;
                }
                cur = cur.parent;
              }
              if (hoveredCamera) break;
            }
          }
          if (!hoveredCamera) {
            const actorMeshList = Array.from(actorMeshesRef.current.values());
            const aHits = raycasterRef.current.intersectObjects(actorMeshList, true);
            for (const h of aHits) {
              const obj = h.object;
              if (
                obj.userData?.isJointDisc ||
                obj.userData?.isIKHandle ||
                obj.userData?.isHelper ||
                (obj as any).isSprite ||
                obj.type === 'Sprite' ||
                (obj as any).isLine ||
                (obj as any).isLineSegments
              ) {
                continue;
              }
              let cur: THREE.Object3D | null = obj;
              while (cur) {
                if (cur.userData?.actorId) {
                  const foundAct = useShotStore.getState().shot.actors.find((a) => a.id === cur!.userData.actorId);
                  hoveredActorName = foundAct?.name || 'Subject';
                  break;
                }
                cur = cur.parent;
              }
              if (hoveredActorName) break;
            }
          }
        }

        // Update Cursor & Directional HUD
        const isHovered = Boolean(hoveredHandle || hoveredDisc || hoveredIK);
        if (stageMountRef.current) {
          stageMountRef.current.style.cursor = isHovered
            ? 'pointer'
            : hoveredCamera || hoveredActorName
            ? 'grab'
            : 'default';
        }

        if (hoveredAxis) {
          const selId = useShotStore.getState().selectedActorId;
          const isBoneGizmo = Boolean(
            selId &&
              selId !== '__camera__' &&
              selectedBoneRef.current &&
              showPosingHandlesRef.current &&
              posingModeRef.current === 'fk' &&
              actorMeshesRef.current.get(selId)?.userData?.rig
          );
          const modeTranslate = !isBoneGizmo || gizmoModeRef.current === 'translate';
          const hudConfig: Record<GizmoAxisType, { title: string; hint: string; color: string; badge: string }> = {
            x: {
              title: 'X AXIS',
              hint: modeTranslate ? 'Lateral Shift Left ↔ Right (Drag ↔)' : 'Pitch / Tilt (Drag ↕)',
              color: '#ff4d4d',
              badge: 'RED X',
            },
            y: {
              title: 'Y AXIS',
              hint: modeTranslate ? 'Elevation Height Up ↕ Down (Drag ↕)' : 'Twist / Turn (Drag ↔)',
              color: '#22c55e',
              badge: 'GREEN Y',
            },
            z: {
              title: 'Z AXIS',
              hint: modeTranslate ? 'Stage Depth Forward ↔ Back (Drag ↕)' : 'Roll / Bend (Drag ↔)',
              color: '#3b82f6',
              badge: 'BLUE Z',
            },
            center: {
              title: isBoneGizmo ? 'CENTER TRACKBALL' : 'FREEFORM STAGE MOVE',
              hint: isBoneGizmo
                ? 'Freeform 3D Camera-Relative Rotation'
                : 'Drag freely on horizontal plane (Shift+Drag for Height)',
              color: '#06b6d4',
              badge: isBoneGizmo ? 'TRACKBALL' : 'FREE MOVE',
            },
          };
          setHoverDirectionHud({ ...hudConfig[hoveredAxis], axis: hoveredAxis });
        } else if (hoveredDisc) {
          const bLabel = hoveredDisc.userData.label || hoveredDisc.userData.boneName;
          setHoverDirectionHud({
            title: bLabel,
            hint: 'Click to select joint & reveal 3D transform gizmo',
            color: '#38bdf8',
            badge: 'JOINT',
          });
        } else if (hoveredIK) {
          setHoverDirectionHud({
            title: 'IK END-EFFECTOR',
            hint: 'Drag to position limb in 3D space',
            color: '#f59e0b',
            badge: 'IK TARGET',
          });
        } else if (hoveredCamera) {
          setHoverDirectionHud({
            title: 'CAMERA RIG',
            hint: 'Drag to position camera (Shift+Drag for Elevation, or click for XYZ Gizmo)',
            color: '#f59e0b',
            badge: 'CAMERA',
          });
        } else if (hoveredActorName) {
          setHoverDirectionHud({
            title: hoveredActorName.toUpperCase(),
            hint: 'Drag to position on stage (Shift+Drag for Elevation, or click for Gizmo)',
            color: '#38bdf8',
            badge: 'SUBJECT',
          });
        } else {
          setHoverDirectionHud(null);
        }
      }
      return;
    }

    const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
    const dy = Math.abs(e.clientY - dragStartPosRef.current.y);
    if (dx > 8 || dy > 8) {
      hasDraggedRef.current = true;
    }

    // Active 3D Object / Camera Axis-Constrained Translation Gizmo Drag
    if (activeObjectAxisDragRef.current) {
      if (!hasDraggedRef.current) return;
      const rect = stageMountRef.current?.getBoundingClientRect();
      if (!rect || !stageCameraRef.current) return;

      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouseVecRef.current.set(mouseX, mouseY);
      raycasterRef.current.setFromCamera(mouseVecRef.current, stageCameraRef.current);

      const hitPoint = new THREE.Vector3();
      const hit = raycasterRef.current.ray.intersectPlane(objectAxisPlaneRef.current, hitPoint);
      if (!hit) return;

      const { axis, targetId, axisVec, startHitPoint, startStagePos } = activeObjectAxisDragRef.current;
      const deltaWorld = hitPoint.clone().sub(startHitPoint).dot(axisVec);

      let nextX = startStagePos.x;
      let nextY = startStagePos.y;
      let nextZ = startStagePos.z;

      if (axis === 'x') {
        nextX = Number(Math.min(100, Math.max(0, startStagePos.x + deltaWorld)).toFixed(2));
      } else if (axis === 'z') {
        nextY = Number(Math.min(100, Math.max(0, startStagePos.y + deltaWorld)).toFixed(2));
      } else if (axis === 'y') {
        const elevFactor = targetId === '__camera__' ? 0.3 : 0.4;
        nextZ = Number(Math.min(100, Math.max(0, startStagePos.z + deltaWorld / elevFactor)).toFixed(2));
      }

      const liveState = useShotStore.getState();
      const liveDur = liveState.shot.durationSeconds || duration || 4.0;
      const moveMode = liveState.stagingMoveMode;

      if (targetId === '__camera__') {
        updateCameraPositionAtTime(currentTimeRef.current, { x: nextX, y: nextY, z: nextZ }, liveDur, moveMode);
      } else {
        updateActorPositionAtTime(targetId, currentTimeRef.current, { x: nextX, y: nextY, z: nextZ }, liveDur, moveMode);
      }

      syncPositions(currentTimeRef.current);
      if (stageRendererRef.current && stageSceneRef.current && stageCameraRef.current) {
        stageRendererRef.current.render(stageSceneRef.current, stageCameraRef.current);
      }
      if (vfRendererRef.current && stageSceneRef.current && vfCameraRef.current && !liveState.isRenderingPrevis) {
        vfRendererRef.current.render(stageSceneRef.current, vfCameraRef.current);
      }
      return;
    }

    // Active Bone 3D Transform Gizmo Drag
    if (activeGizmoDragRef.current) {
      const { axis, bone: boneName, actorId, startPointer, startQuat, startPos } = activeGizmoDragRef.current;
      const actorMesh = actorMeshesRef.current.get(actorId);
      const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
      const bone = rig?.bones.get(boneName);
      if (rig && bone) {
        const deltaX = e.clientX - startPointer.x;
        const deltaY = e.clientY - startPointer.y;

        if (gizmoModeRef.current === 'translate' || (boneName === 'Hips' && e.shiftKey)) {
          // Translation mode (Hips/root elevation or shift)
          const factor = 0.025;
          bone.position.copy(startPos);
          if (axis === 'x') applyBoneTranslationDelta(rig, boneName, 'x', deltaX * factor);
          else if (axis === 'y') applyBoneTranslationDelta(rig, boneName, 'y', -deltaY * factor);
          else if (axis === 'z') applyBoneTranslationDelta(rig, boneName, 'z', deltaY * factor);
          else if (axis === 'center') {
            applyBoneTranslationDelta(rig, boneName, 'x', deltaX * factor);
            applyBoneTranslationDelta(rig, boneName, 'y', -deltaY * factor);
          }
        } else {
          // FK Rotation mode
          bone.quaternion.copy(startQuat);
          const sensitivity = 0.012;
          if (axis === 'x') {
            applyBoneRotationDelta(rig, boneName, 'x', -deltaY * sensitivity);
          } else if (axis === 'y') {
            applyBoneRotationDelta(rig, boneName, 'y', deltaX * sensitivity);
          } else if (axis === 'z') {
            applyBoneRotationDelta(rig, boneName, 'z', deltaX * sensitivity);
          } else if (axis === 'center' && stageCameraRef.current) {
            applyBoneTrackballDelta(rig, boneName, stageCameraRef.current, deltaX, deltaY, sensitivity);
          }
        }

        rig.root.updateMatrixWorld(true);
      }
      return;
    }

    if (activeIKHandleRef.current) {
      const rect = stageMountRef.current?.getBoundingClientRect();
      if (!rect || !stageCameraRef.current) return;

      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouseVecRef.current.set(mouseX, mouseY);
      raycasterRef.current.setFromCamera(mouseVecRef.current, stageCameraRef.current);

      const hitPoint = new THREE.Vector3();
      const hit = raycasterRef.current.ray.intersectPlane(ikDragPlaneRef.current, hitPoint);
      if (!hit) return;

      const actorMesh = actorMeshesRef.current.get(activeIKHandleRef.current.actorId);
      const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
      if (!rig) return;

      const hType = activeIKHandleRef.current.handleType;

      if (hType === 'leftArm') {
        solveLimbIK(rig, 'leftArm', hitPoint);
      } else if (hType === 'rightArm') {
        solveLimbIK(rig, 'rightArm', hitPoint);
      } else if (hType === 'leftLeg') {
        solveLimbIK(rig, 'leftLeg', hitPoint);
      } else if (hType === 'rightLeg') {
        solveLimbIK(rig, 'rightLeg', hitPoint);
      } else if (hType === 'head') {
        solveLookAt(rig, hitPoint);
      }

      rig.root.updateMatrixWorld(true);

      const handlesGroup = ikHandlesGroupRef.current;
      if (handlesGroup) {
        const handleObj = handlesGroup.children.find((c) => c.userData?.handleType === hType);
        if (handleObj) {
          handleObj.position.copy(hitPoint);
        }
      }
      return;
    }

    if (draggedActorIdRef.current) {
      if (!isFloorDraggingRef.current && (dx > 3 || dy > 3)) {
        isFloorDraggingRef.current = true;
        setIsFloorDragging(true);
        beginGesture();
        if (stageControlsRef.current) {
          stageControlsRef.current.enabled = false;
        }
      }

      if (isFloorDraggingRef.current) {
        const rect = stageMountRef.current?.getBoundingClientRect();
        if (!rect || !stageCameraRef.current) return;

        const effectiveTargetId = draggedActorIdRef.current;
        const liveState = useShotStore.getState();
        const liveDur = liveState.shot.durationSeconds || duration || 4.0;
        const moveMode = liveState.stagingMoveMode;

        // Shift + Drag: Adjust vertical elevation (3D Y-Axis / Stage Z) smoothly like standard 3D apps
        if (e.shiftKey) {
          const deltaPixelsY = dragStartPosRef.current.y - e.clientY;
          const nextZ = Number(
            Math.min(100, Math.max(0, dragStartStagePosRef.current.z + deltaPixelsY * 0.25)).toFixed(2)
          );
          const curSt =
            effectiveTargetId === '__camera__'
              ? interpolateTrajectoryPosition(liveState.shot.camera.movement, currentTimeRef.current, liveDur)
              : (() => {
                  const act = liveState.shot.actors.find((a) => a.id === effectiveTargetId);
                  return act
                    ? interpolateTrajectoryPosition(act.trajectory, currentTimeRef.current, liveDur)
                    : dragStartStagePosRef.current;
                })();

          if (effectiveTargetId === '__camera__') {
            updateCameraPositionAtTime(currentTimeRef.current, { x: curSt.x, y: curSt.y, z: nextZ }, liveDur, moveMode);
          } else if (effectiveTargetId) {
            updateActorPositionAtTime(
              effectiveTargetId,
              currentTimeRef.current,
              { x: curSt.x, y: curSt.y, z: nextZ },
              liveDur,
              moveMode
            );
          }
        } else {
          const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          mouseVecRef.current.set(mouseX, mouseY);
          raycasterRef.current.setFromCamera(mouseVecRef.current, stageCameraRef.current);

          const hitPoint = new THREE.Vector3();
          const hit = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, hitPoint);
          if (!hit || hitPoint.distanceTo(stageCameraRef.current.position) > 160) return;

          // Apply smooth grab offset on the drag plane so object/camera follows cursor 1:1 with zero jump!
          const targetX = hitPoint.x + floorDragOffsetRef.current.x;
          const targetZ = hitPoint.z + floorDragOffsetRef.current.z;

          // Convert Three.js floor (-50..50) to Stage space (0..100) with sub-unit floating point precision
          const stageX = Number(Math.min(100, Math.max(0, targetX + 50)).toFixed(2));
          const stageY = Number(Math.min(100, Math.max(0, targetZ + 50)).toFixed(2));

          if (effectiveTargetId === '__camera__') {
            const curSt = interpolateTrajectoryPosition(liveState.shot.camera.movement, currentTimeRef.current, liveDur);
            const curZ = curSt.z ?? liveState.shot.camera.movement.startPosition.z ?? 20;
            updateCameraPositionAtTime(currentTimeRef.current, { x: stageX, y: stageY, z: curZ }, liveDur, moveMode);
          } else if (effectiveTargetId) {
            const targetActor = liveState.shot.actors.find((a) => a.id === effectiveTargetId);
            if (targetActor) {
              const curSt = interpolateTrajectoryPosition(targetActor.trajectory, currentTimeRef.current, liveDur);
              const curZ = curSt.z ?? targetActor.trajectory.startPosition.z ?? 0;
              updateActorPositionAtTime(
                effectiveTargetId,
                currentTimeRef.current,
                { x: stageX, y: stageY, z: curZ },
                liveDur,
                moveMode
              );
            }
          }
        }

        syncPositions(currentTimeRef.current);
        if (stageRendererRef.current && stageSceneRef.current && stageCameraRef.current) {
          stageRendererRef.current.render(stageSceneRef.current, stageCameraRef.current);
        }
        if (vfRendererRef.current && stageSceneRef.current && vfCameraRef.current && !liveState.isRenderingPrevis) {
          vfRendererRef.current.render(stageSceneRef.current, vfCameraRef.current);
        }
        return;
      }
    }
  };

  const handleStagePointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    isPointerDownRef.current = false;
    if (stageControlsRef.current) stageControlsRef.current.enabled = true;

    if (activeObjectAxisDragRef.current) {
      activeObjectAxisDragRef.current = null;
      setGizmoHoveredAxis(boneGizmoGroupRef.current, hoveredGizmoAxisRef.current, null);
      endGesture();
      return;
    }

    if (activeGizmoDragRef.current) {
      const { actorId, bone: boneName } = activeGizmoDragRef.current;
      const actorMesh = actorMeshesRef.current.get(actorId);
      const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
      if (rig) {
        const newPose = exportBonePose(rig);
        const targetActor = shot.actors.find((a) => a.id === actorId);
        const existingKfs = targetActor?.trajectory?.keyframes || [];
        const isNearKf = existingKfs.some((kf) => Math.abs(kf.time - currentTime) <= 0.25);
        if (stagingMoveMode === 'keyframe' || isNearKf) {
          recordActorPoseAtTime(actorId, currentTime, newPose, undefined, 'none', duration);
          logger.action(`Keyframed "${actorMesh?.name || 'Actor'}" pose cue @ ${currentTime.toFixed(1)}s on bone "${boneName}"`);
        } else {
          updateActor(actorId, { pose: newPose, posePreset: undefined, gait: 'none' });
          logger.action(`Updated "${actorMesh?.name || 'Actor'}" pose on bone "${boneName}"`);
        }
      }
      activeGizmoDragRef.current = null;
      // Restore normal hover state on gizmo
      setGizmoHoveredAxis(boneGizmoGroupRef.current, hoveredGizmoAxisRef.current, null);
      endGesture();
      return;
    }

    if (activeIKHandleRef.current) {
      const activeIK = activeIKHandleRef.current;
      const actorMesh = actorMeshesRef.current.get(activeIK.actorId);
      const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
      if (rig) {
        const newPose = exportBonePose(rig);
        const targetActor = shot.actors.find((a) => a.id === activeIK.actorId);
        const existingKfs = targetActor?.trajectory?.keyframes || [];
        const isNearKf = existingKfs.some((kf) => Math.abs(kf.time - currentTime) <= 0.25);
        if (stagingMoveMode === 'keyframe' || isNearKf) {
          recordActorPoseAtTime(activeIK.actorId, currentTime, newPose, undefined, 'none', duration);
          logger.action(`Keyframed "${actorMesh?.name || 'Actor'}" pose cue @ ${currentTime.toFixed(1)}s via IK`);
        } else {
          updateActor(activeIK.actorId, { pose: newPose, posePreset: undefined, gait: 'none' });
        }
      }
      activeIKHandleRef.current = null;
      endGesture();
      return;
    }

    if (isFloorDraggingRef.current) {
      isFloorDraggingRef.current = false;
      setIsFloorDragging(false);
      endGesture();
    }
    draggedActorIdRef.current = null;
    if (stageControlsRef.current) {
      stageControlsRef.current.enabled = true;
    }
    if (stageRendererRef.current && stageSceneRef.current && stageCameraRef.current) {
      stageRendererRef.current.render(stageSceneRef.current, stageCameraRef.current);
    }

    // Clean Selection / Deselection on click (when not dragging camera)
    const clientX = e ? e.clientX : dragStartPosRef.current.x;
    const clientY = e ? e.clientY : dragStartPosRef.current.y;
    const dragDist = Math.hypot(clientX - dragStartPosRef.current.x, clientY - dragStartPosRef.current.y);
    const clickDuration = performance.now() - pointerDownTimestampRef.current;
    const isCleanClick = dragDist < 8 && !hasDraggedRef.current && clickDuration < 400;

    if (isCleanClick) {
      if (pendingClickedDiscRef.current) {
        const clickedDisc = pendingClickedDiscRef.current;
        const bName = clickedDisc.userData.boneName as HumanoidBone;
        setSelectedBone(bName);
        selectedBoneRef.current = bName;
        const discActorId = clickedDisc.userData.actorId || selectedActorId;
        if (discActorId && discActorId !== selectedActorId) {
          setSelectedActorId(discActorId);
        }
        logger.action(`Selected joint "${clickedDisc.userData.label || bName}" for 3D posing`);
        if (hoveredJointDiscRef.current && hoveredJointDiscRef.current !== clickedDisc) {
          setJointDiscHovered(hoveredJointDiscRef.current, false);
        }
        hoveredJointDiscRef.current = clickedDisc;
        setJointDiscHovered(clickedDisc, true);
        setGizmoHoveredAxis(boneGizmoGroupRef.current, null, null);
        setHoverDirectionHud({
          title: clickedDisc.userData.label || bName,
          hint: 'Use the 3D Gizmo arrows or Nudge buttons to pose',
          color: '#38bdf8',
          badge: 'SELECTED',
        });
      } else if (pendingClickedActorIdRef.current) {
        const aId = pendingClickedActorIdRef.current;
        setSelectedActorId(aId);
        setSelectedBone(null);
        selectedBoneRef.current = null;
        setGizmoHoveredAxis(boneGizmoGroupRef.current, null, null);
        setHoverDirectionHud(null);
        logger.action(`Selected subject "${aId}"`);
      } else if (pendingClickedCameraRef.current) {
        setSelectedActorId('__camera__');
        setSelectedBone(null);
        selectedBoneRef.current = null;
        setGizmoHoveredAxis(boneGizmoGroupRef.current, null, null);
        setHoverDirectionHud(null);
        logger.action('Selected camera');
      } else if (!hitInteractiveRef.current) {
        setSelectedActorId(undefined);
        setSelectedBone(null);
        selectedBoneRef.current = null;
        setGizmoHoveredAxis(boneGizmoGroupRef.current, null, null);
        if (hoveredJointDiscRef.current) {
          setJointDiscHovered(hoveredJointDiscRef.current, false);
          hoveredJointDiscRef.current = null;
        }
        setHoverDirectionHud(null);
        logger.action('Deselected subject and joints');
      }
    }

    pendingClickedDiscRef.current = null;
    pendingClickedActorIdRef.current = null;
    pendingClickedCameraRef.current = false;
  };

  // Global safety net: guarantee Orbit/Pan controls are never stuck disabled
  useEffect(() => {
    const handleGlobalPointerRelease = () => {
      isPointerDownRef.current = false;
      pendingClickedDiscRef.current = null;
      pendingClickedActorIdRef.current = null;
      pendingClickedCameraRef.current = false;
      if (activeObjectAxisDragRef.current) {
        activeObjectAxisDragRef.current = null;
        setGizmoHoveredAxis(boneGizmoGroupRef.current, null, null);
        endGesture();
      }
      if (isFloorDraggingRef.current) {
        isFloorDraggingRef.current = false;
        setIsFloorDragging(false);
        draggedActorIdRef.current = null;
        endGesture();
      }
      if (activeGizmoDragRef.current) {
        const { actorId, bone: boneName } = activeGizmoDragRef.current;
        const actorMesh = actorMeshesRef.current.get(actorId);
        const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
        if (rig) {
          const newPose = exportBonePose(rig);
          const targetActor = shot.actors.find((a) => a.id === actorId);
          const existingKfs = targetActor?.trajectory?.keyframes || [];
          const isNearKf = existingKfs.some((kf) => Math.abs(kf.time - currentTime) <= 0.25);
          if (stagingMoveMode === 'keyframe' || isNearKf) {
            recordActorPoseAtTime(actorId, currentTime, newPose, undefined, 'none', duration);
          } else {
            updateActor(actorId, { pose: newPose, posePreset: undefined, gait: 'none' });
          }
          logger.action(`Updated "${actorMesh?.name || 'Actor'}" pose on bone "${boneName}"`);
        }
        activeGizmoDragRef.current = null;
        endGesture();
      }
      if (activeIKHandleRef.current) {
        const activeIK = activeIKHandleRef.current;
        const actorMesh = actorMeshesRef.current.get(activeIK.actorId);
        const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
        if (rig) {
          const newPose = exportBonePose(rig);
          const targetActor = shot.actors.find((a) => a.id === activeIK.actorId);
          const existingKfs = targetActor?.trajectory?.keyframes || [];
          const isNearKf = existingKfs.some((kf) => Math.abs(kf.time - currentTime) <= 0.25);
          if (stagingMoveMode === 'keyframe' || isNearKf) {
            recordActorPoseAtTime(activeIK.actorId, currentTime, newPose, undefined, 'none', duration);
          } else {
            updateActor(activeIK.actorId, { pose: newPose, posePreset: undefined, gait: 'none' });
          }
        }
        activeIKHandleRef.current = null;
        endGesture();
      }
      if (stageControlsRef.current) {
        stageControlsRef.current.enabled = true;
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerRelease);
    window.addEventListener('pointercancel', handleGlobalPointerRelease);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerRelease);
      window.removeEventListener('pointercancel', handleGlobalPointerRelease);
    };
  }, [isFloorDragging, endGesture, updateActor, currentTime, duration, recordActorPoseAtTime, shot.actors, stagingMoveMode]);

  const handleResetSelectedJoint = () => {
    if (!selectedActorId || selectedActorId === '__camera__' || !selectedBone) return;
    const actorMesh = actorMeshesRef.current.get(selectedActorId);
    const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
    if (rig) {
      beginGesture();
      resetBoneToRest(rig, selectedBone);
      const newPose = exportBonePose(rig);
      updateActor(selectedActorId, { pose: newPose, posePreset: undefined, gait: 'none' });
      endGesture();
      logger.action(`Reset joint "${selectedBone}" to rest rotation`);
    }
  };

  const handleNudgeBoneRotation = (axis: 'x' | 'y' | 'z', angleDelta: number) => {
    if (!selectedActorId || selectedActorId === '__camera__' || !selectedBone) return;
    const actorMesh = actorMeshesRef.current.get(selectedActorId);
    const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
    if (rig) {
      beginGesture();
      applyBoneRotationDelta(rig, selectedBone, axis, angleDelta);
      const newPose = exportBonePose(rig);
      updateActor(selectedActorId, { pose: newPose, posePreset: undefined, gait: 'none' });
      endGesture();
    }
  };

  const handleApplyPresetToSelectedActor = (presetId: string, explicitActorId?: string) => {
    const targetId = explicitActorId || selectedActorId;
    if (!targetId || targetId === '__camera__') return;
    const targetActor = shot.actors.find((a) => a.id === targetId);
    const actorMesh = actorMeshesRef.current.get(targetId);

    // Check if presetId is a non-human ObjectPosePreset
    const objPreset = findObjectPosePresetById(presetId);
    if (objPreset && targetActor) {
      beginGesture();
      const updates: Record<string, any> = {
        posePreset: presetId,
        rotation: { ...objPreset.rotation },
      };
      updateActor(targetId, updates);
      if (objPreset.elevationY !== undefined) {
        const curCoords = interpolateTrajectoryPosition(targetActor.trajectory, currentTime, duration);
        updateActorPositionAtTime(targetId, currentTime, {
          x: Math.round(curCoords.x),
          y: Math.round(curCoords.y),
          z: objPreset.elevationY,
        }, duration);
      }
      if (actorMesh) {
        applyNonHumanMeshPoseArticulation(actorMesh, presetId);
      }
      endGesture();
      logger.action(`Applied object stance "${objPreset.name}" to "${targetActor.name}"`);
      return;
    }

    const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
    if (rig && actorMesh) {
      beginGesture();
      actorMesh.updateMatrixWorld(true);
      applyPosePreset(rig, presetId);
      const newPose = exportBonePose(rig);
      const existingKfs = targetActor?.trajectory?.keyframes || [];
      const isNearKf = existingKfs.some((kf) => Math.abs(kf.time - currentTime) <= 0.25);
      if (stagingMoveMode === 'keyframe' || isNearKf) {
        recordActorPoseAtTime(targetId, currentTime, newPose, presetId, 'none', duration);
        logger.action(`Keyframed "${actorMesh?.name || 'Actor'}" pose preset "${presetId}" @ ${currentTime.toFixed(1)}s`);
      } else {
        updateActor(targetId, { pose: newPose, posePreset: presetId, gait: 'none' });
      }
      endGesture();
    }
  };

  const handleRecordCurrentPoseCue = () => {
    if (!selectedActorId || selectedActorId === '__camera__') return;
    const actor = shot.actors.find((a) => a.id === selectedActorId);
    if (!actor) return;
    const actorMesh = actorMeshesRef.current.get(selectedActorId);
    const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
    const currentPose = rig ? exportBonePose(rig) : actor.pose;
    recordActorPoseAtTime(
      selectedActorId,
      currentTime,
      currentPose,
      actor.posePreset,
      actor.gait || 'none',
      duration
    );
    logger.action(`Recorded pose cue for "${actor.name}" at ${currentTime.toFixed(1)}s`);
  };

  const handleGroundSelectedActorFeet = () => {
    if (!selectedActorId || selectedActorId === '__camera__') return;
    const actorMesh = actorMeshesRef.current.get(selectedActorId);
    const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
    if (rig) {
      beginGesture();
      groundBothFeet(rig);
      const newPose = exportBonePose(rig);
      updateActor(selectedActorId, { pose: newPose, gait: 'none' });
      endGesture();
    }
  };

  const handleResetSelectedActorPose = () => {
    if (!selectedActorId || selectedActorId === '__camera__') return;
    const actorMesh = actorMeshesRef.current.get(selectedActorId);
    const rig: HumanoidRig | undefined = actorMesh?.userData?.rig;
    if (rig) {
      beginGesture();
      resetToRestPose(rig);
      const newPose = exportBonePose(rig);
      updateActor(selectedActorId, { pose: newPose, posePreset: 't-pose' });
      endGesture();
    }
  };

  const handleGlbFileUpload = async (file: File) => {
    if (!file.name.match(/\.(glb|gltf)$/i)) {
      alert('Please select a valid .glb or .gltf 3D file.');
      return;
    }
    try {
      const registered = await registerModelFile(file);
      await preloadGltfModels([registered.blobUrl]);

      if (selectedActorId && selectedActorId !== '__camera__') {
        updateActor(selectedActorId, {
          modelUrl: registered.blobUrl,
          name: registered.name,
        });
      } else {
        addActor(registered.name, 'prop', `an authentic 3D model of ${registered.name}`, {
          modelUrl: registered.blobUrl,
          scale: 1.0,
          actionDescription: `placed 3D model on stage: ${registered.name}`,
        });
      }
    } catch (err) {
      console.error('Failed to import GLB model:', err);
    }
  };

  useEffect(() => {
    const onGroundFeet = () => handleGroundSelectedActorFeet();
    const onResetPose = () => handleResetSelectedActorPose();
    const onRecordPoseCue = () => handleRecordCurrentPoseCue();
    const onApplyPosePreset = (e: Event) => {
      const detail = (e as CustomEvent<{ presetId: string; actorId?: string }>).detail;
      if (detail?.presetId) handleApplyPresetToSelectedActor(detail.presetId, detail.actorId);
    };
    window.addEventListener('cmpvs:ground-actor-feet', onGroundFeet);
    window.addEventListener('cmpvs:reset-actor-pose', onResetPose);
    window.addEventListener('cmpvs:record-pose-cue', onRecordPoseCue);
    window.addEventListener('cmpvs:apply-pose-preset', onApplyPosePreset);
    return () => {
      window.removeEventListener('cmpvs:ground-actor-feet', onGroundFeet);
      window.removeEventListener('cmpvs:reset-actor-pose', onResetPose);
      window.removeEventListener('cmpvs:record-pose-cue', onRecordPoseCue);
      window.removeEventListener('cmpvs:apply-pose-preset', onApplyPosePreset);
    };
  });

  const activeActor = shot.actors.find((a) => a.id === selectedActorId);
  const isCameraSelected = selectedActorId === '__camera__';

  const shouldShowBottomTransport = showBottomTransport ?? (externalTime === undefined && showToolbar);

  return (
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-[#090D16] select-none relative min-h-0 min-w-0">
      {/* Unified Top 3D Stage & Viewport Control Toolbar — 2026 Command Center */}
      {showToolbar && (
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#273247] px-3.5 bg-gradient-to-b from-[#121A2A] to-[#0D1320] z-20 font-mono text-[11px] gap-2.5 overflow-x-auto no-scrollbar">
          {/* Left: View Mode Switcher, Pane Swap & Aspect Ratio */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center rounded-lg bg-[#090D16] p-0.5 border border-[#273247] shadow-inner">
              <button
                onClick={() => setViewMode('split')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-all ${
                  viewMode === 'split'
                    ? 'bg-gradient-to-b from-[#6658F5] to-[#5243E2] text-white font-bold shadow-[0_1px_6px_rgba(102,88,245,0.4)]'
                    : 'text-[#98A5BC] hover:text-white'
                }`}
                title="Side-by-Side Split View (Director Viewfinder + 3D Soundstage)"
              >
                <Layers className="h-3 w-3" />
                <span>Split</span>
              </button>

              <button
                onClick={() => setViewMode('viewfinder')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-all ${
                  viewMode === 'viewfinder'
                    ? 'bg-gradient-to-b from-[#18B8D8] to-[#0E93B0] text-[#090D16] font-bold shadow-[0_1px_6px_rgba(24,184,216,0.4)]'
                    : 'text-[#98A5BC] hover:text-white'
                }`}
                title="Full-Width Director Viewfinder (Through-the-Lens Camera POV)"
              >
                <Eye className="h-3 w-3" />
                <span>Viewfinder</span>
              </button>

              <button
                onClick={() => setViewMode('stage')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-all ${
                  viewMode === 'stage'
                    ? 'bg-gradient-to-b from-[#20C997] to-[#14A378] text-[#06241B] font-bold shadow-[0_1px_6px_rgba(32,201,151,0.4)]'
                    : 'text-[#98A5BC] hover:text-white'
                }`}
                title="Full-Width 3D Virtual Soundstage (Orbit & Blocking View)"
              >
                <Compass className="h-3 w-3" />
                <span>3D Stage</span>
              </button>

              {viewMode === 'split' && (
                <button
                  onClick={() => setIsSwapped(!isSwapped)}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 ml-0.5 text-[#98A5BC] hover:text-white hover:bg-[#1A2436] border-l border-[#273247] transition-all"
                  title="Swap Left & Right Viewports (Instant CSS Swap)"
                >
                  <ArrowLeftRight className="h-3 w-3 text-[#F0AE42]" />
                </button>
              )}
            </div>

            {/* Aspect Ratio Selector */}
            <div className="flex items-center rounded-lg bg-[#090D16] p-0.5 border border-[#273247] shadow-inner">
              {(['16:9', '2.39:1', '9:16', '1:1'] as AspectRatio[]).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => updateAspectRatio(ratio)}
                  className={`rounded-md px-2 py-0.5 transition-all ${
                    shot.aspectRatio === ratio
                      ? 'bg-[#6658F5] text-white font-bold shadow-sm'
                      : 'text-[#98A5BC] hover:text-white'
                  }`}
                  title={`Set Camera Aspect Ratio to ${ratio}`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {/* Center: Move Mode & Orbit Camera Presets */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Base Position vs Keyframe Toggle */}
            <div className="flex items-center rounded-lg bg-[#090D16] p-0.5 border border-[#273247] shadow-inner">
              <button
                onClick={() => setStagingMoveMode('base')}
                className={`rounded-md px-2 py-0.5 transition-all font-semibold ${
                  stagingMoveMode === 'base'
                    ? 'bg-[#20C997]/20 text-[#5CE8BE] border border-[#20C997]/45'
                    : 'text-[#98A5BC] hover:text-white border border-transparent'
                }`}
                title="Move Base Position (moves subject across entire shot without keyframe snapping)"
              >
                Base Pos
              </button>
              <button
                onClick={() => setStagingMoveMode('keyframe')}
                className={`rounded-md px-2 py-0.5 transition-all font-semibold ${
                  stagingMoveMode === 'keyframe'
                    ? 'bg-[#F0AE42]/20 text-[#F0AE42] border border-[#F0AE42]/45'
                    : 'text-[#98A5BC] hover:text-white border border-transparent'
                }`}
                title="Record Waypoint Keyframe at current timeline playhead"
              >
                Keyframe @ {currentTime.toFixed(1)}s
              </button>
            </div>

            <button
              onClick={() => centerStageCamera()}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 border border-[#F0AE42]/40 bg-[#231B12] text-[#F0AE42] hover:text-white hover:bg-[#2F2417] transition-all font-semibold"
              title="Recenter 3D Stage camera on active subject or scene (Hotkey: F)"
            >
              <Target className="h-3 w-3 text-[#F0AE42]" />
              <span>Center (F)</span>
            </button>

            <button
              onClick={() => focusCameraOnSubject(selectedActorId !== '__camera__' ? selectedActorId : undefined)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 border border-[#18B8D8]/40 bg-[#0E2430] text-[#67E8F9] hover:text-white hover:bg-[#133242] transition-all font-semibold"
              title="Aim Director Viewfinder camera directly at active subject"
            >
              <Camera className="h-3 w-3 text-[#18B8D8]" />
              <span>Aim Camera</span>
            </button>

            <div className="flex items-center rounded-lg bg-[#090D16] p-0.5 border border-[#273247] shadow-inner">
              <button
                onClick={() => setOrbitView('iso')}
                className="rounded-md px-2 py-0.5 text-[#D0D9E8] hover:text-white hover:bg-[#1A2436] transition-colors"
                title="Isometric 3D Stage View"
              >
                Iso
              </button>
              <button
                onClick={() => setOrbitView('top')}
                className="rounded-md px-2 py-0.5 text-[#D0D9E8] hover:text-white hover:bg-[#1A2436] transition-colors"
                title="Top-Down Bird's-Eye Floorplan View"
              >
                Top
              </button>
              <button
                onClick={() => setOrbitView('eye')}
                className="rounded-md px-2 py-0.5 text-[#D0D9E8] hover:text-white hover:bg-[#1A2436] transition-colors"
                title="Ground Eye-Level Stage View"
              >
                Eye
              </button>
            </div>
          </div>

          {/* Right: Stage Overlays, Posing Rig, Claymation & GLB Import */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 border transition-colors ${
                showGrid
                  ? 'border-[#6658F5]/55 text-[#C4BEFF] bg-[#6658F5]/15 font-semibold'
                  : 'border-[#273247] bg-[#131C2E] text-[#98A5BC] hover:text-white'
              }`}
              title="Toggle 3D Stage Floor Grid"
            >
              <Grid className="h-3 w-3" />
              <span>Grid</span>
            </button>

            <button
              onClick={() => setShowRuleOfThirds(!showRuleOfThirds)}
              className={`rounded-lg px-2 py-1 border transition-colors ${
                showRuleOfThirds
                  ? 'border-[#6658F5]/55 text-[#C4BEFF] bg-[#6658F5]/15 font-semibold'
                  : 'border-[#273247] bg-[#131C2E] text-[#98A5BC] hover:text-white'
              }`}
              title="Toggle Viewfinder 3x3 Rule of Thirds Guides"
            >
              3x3
            </button>

            <button
              onClick={() => setShowLabels(!showLabels)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 border transition-colors ${
                showLabels
                  ? 'border-[#6658F5]/55 text-[#C4BEFF] bg-[#6658F5]/15 font-semibold'
                  : 'border-[#273247] bg-[#131C2E] text-[#98A5BC] hover:text-white'
              }`}
              title="Toggle 3D Hovering Nametags"
            >
              <Tag className="h-3 w-3" />
              <span>Labels</span>
            </button>

            <button
              onClick={() => setShowPosingHandles(!showPosingHandles)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 border transition-all ${
                showPosingHandles
                  ? 'border-[#20C997]/50 text-[#5CE8BE] bg-[#20C997]/15 font-semibold'
                  : 'border-[#273247] bg-[#131C2E] text-[#98A5BC] hover:text-white'
              }`}
              title="Toggle Character Posing Rig (FK Joint Discs & IK Limb Handles)"
            >
              {posingMode === 'fk' ? <Disc3 className="h-3 w-3 text-[#20C997]" /> : <Activity className="h-3 w-3 text-[#20C997]" />}
              <span>{showPosingHandles ? (posingMode === 'fk' ? 'FK Gizmos' : 'IK Targets') : 'Rig Off'}</span>
            </button>

            <button
              onClick={() => setClaymationMode(!shot.claymationMode, 12)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 border transition-all ${
                shot.claymationMode
                  ? 'border-[#F0AE42] text-[#F0AE42] bg-[#F0AE42]/20 font-bold'
                  : 'border-[#273247] bg-[#131C2E] text-[#98A5BC] hover:text-white'
              }`}
              title="Stop-Motion: Quantize animation to 12fps 'on twos' for claymation feel"
            >
              <span>🏺</span>
              <span>{shot.claymationMode ? '12fps Clay' : 'Clay'}</span>
            </button>

            <input
              type="file"
              ref={glbFileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleGlbFileUpload(file);
                if (glbFileInputRef.current) glbFileInputRef.current.value = '';
              }}
              accept=".glb,.gltf"
              className="hidden"
            />
            <button
              onClick={() => glbFileInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 border border-[#6658F5]/50 bg-[#6658F5]/20 text-[#C4BEFF] hover:bg-[#6658F5]/35 hover:text-white font-semibold transition-all"
              title="Import .glb or .gltf 3D Model file onto stage"
            >
              <Upload className="h-3 w-3 text-[#8E84FF]" />
              <span>Import .GLB</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Viewports Area (Single Scene -> Dual Renderer with Instant CSS Swap) */}
      <div
        className={`flex flex-1 h-full w-full min-w-0 min-h-0 overflow-hidden relative bg-[#090D16] p-1.5 gap-1.5 ${
          viewMode === 'split' && isSwapped ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* Viewport 1: 3D Virtual Soundstage (Orbit & Direct Manipulation) */}
        <div
          ref={stageMountRef}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerLeave={handleStagePointerUp}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingGlb(true);
          }}
          onDragLeave={() => setIsDraggingGlb(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingGlb(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleGlbFileUpload(file);
          }}
          className={`relative h-full min-w-0 min-h-0 overflow-hidden rounded-xl border border-[#273247] bg-black transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
            isFloorDragging ? 'cursor-grabbing' : 'cursor-grab'
          } ${
            viewMode === 'split' ? 'w-1/2' : viewMode === 'stage' ? 'w-full' : 'hidden'
          }`}
        >
        {/* Drag & Drop GLB Visual Overlay */}
          {isDraggingGlb && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-indigo-950/85 backdrop-blur-sm border-2 border-dashed border-indigo-400 pointer-events-none animate-in fade-in duration-150">
              <Upload className="h-12 w-12 text-indigo-300 animate-bounce mb-2" />
              <div className="text-sm font-bold text-white font-mono">DROP .GLB / .GLTF 3D MODEL HERE</div>
              <div className="text-xs text-indigo-300 font-mono mt-1">
                {selectedActorId && selectedActorId !== '__camera__'
                  ? `Attach to selected subject: "${activeActor?.name}"`
                  : 'Place as new 3D model on stage'}
              </div>
            </div>
          )}

          {/* Floating On-Canvas Directional Hover & Action Pill */}
          {hoverDirectionHud && (
            <div
              className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-black/85 backdrop-blur-md px-3.5 py-1.5 border shadow-2xl animate-in fade-in duration-100 font-mono select-none pointer-events-none"
              style={{ borderColor: hoverDirectionHud.color }}
            >
              <span className="h-2 w-2 rounded-full animate-ping" style={{ backgroundColor: hoverDirectionHud.color }} />
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded text-black" style={{ backgroundColor: hoverDirectionHud.color }}>
                {hoverDirectionHud.badge}
              </span>
              <span className="text-[11px] font-bold text-white tracking-wide">
                {hoverDirectionHud.title}
              </span>
              <span className="text-[10px] text-slate-300 pl-1 border-l border-white/20">
                {hoverDirectionHud.hint}
              </span>
            </div>
          )}

          {/* Top-Left Compact Contextual Bar (Non-Blocking On-Canvas Status & FK/IK Bone Strip) */}
          <div
            data-hud="true"
            className="absolute top-2.5 left-2.5 right-2.5 z-20 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none font-mono text-[9px]"
          >
            <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
              {/* Viewport Badge */}
              <div className="flex items-center gap-1.5 rounded-md bg-black/80 backdrop-blur-md px-2.5 py-1 border border-white/10 text-slate-300 shadow">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-white tracking-wider">3D SOUNDSTAGE</span>
              </div>

              {/* Active Selection Pill */}
              {(activeActor || isCameraSelected) && (
                <div className="flex items-center gap-1.5 rounded-md bg-black/85 backdrop-blur-md px-2 py-1 border border-director-gold/40 text-white shadow">
                  <span className="text-director-gold font-bold">
                    {isCameraSelected ? '🎥 Camera Rig' : `🧍 ${activeActor?.name}`}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedBone(null);
                      selectedBoneRef.current = null;
                      setSelectedActorId(undefined);
                    }}
                    className="text-slate-400 hover:text-white px-1 rounded hover:bg-white/10 transition-colors"
                    title="Deselect (Esc)"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Object-Aware Non-Human Stance & Relational Position Strip */}
              {activeActor && detectObjectPoseCategory(activeActor) !== 'humanoid' && (() => {
                const objCat = detectObjectPoseCategory(activeActor) as Exclude<ReturnType<typeof detectObjectPoseCategory>, 'humanoid'>;
                const objPresets = getObjectPosePresetsForCategory(objCat);
                const stagePlacements = getObjectAwareStagePlacements(activeActor, shot.actors, (a) => {
                  const p = interpolateTrajectoryPosition(a.trajectory, currentTime, duration);
                  return { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z ?? 0) };
                });
                return (
                  <div className="flex flex-wrap items-center gap-1 rounded-md bg-black/85 backdrop-blur-md px-2 py-1 border border-white/15 shadow">
                    <span className="text-[8px] text-amber-300 font-bold uppercase tracking-wider">
                      {OBJECT_CATEGORY_LABELS[objCat]}:
                    </span>
                    <select
                      value={
                        activeActor.motionClip
                          ? `clip:${activeActor.motionClip}`
                          : `stance:${activeActor.posePreset || objPresets[0]?.id || ''}`
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.startsWith('clip:')) {
                          useShotStore.getState().applyReadyMadeMotion(activeActor.id, val.slice(5));
                        } else if (val.startsWith('stance:')) {
                          updateActor(activeActor.id, { motionClip: undefined });
                          handleApplyPresetToSelectedActor(val.slice(7), activeActor.id);
                        }
                      }}
                      className="rounded bg-[#141824] border border-director-gold/40 px-1.5 py-0.5 text-director-gold font-bold text-[9px] focus:outline-none cursor-pointer"
                      title="Select Ready-Made Motion or Object Stance"
                    >
                      <optgroup label="🎬 Ready-Made Motions (1-Click Play)" className="bg-[#0f131d] text-emerald-300">
                        {getReadyMadeMotionsForCategory(objCat).map((c) => (
                          <option key={c.id} value={`clip:${c.id}`}>
                            {c.icon} {c.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="📐 Static Stance / Attitude" className="bg-[#0f131d] text-slate-200">
                        {objPresets.map((p) => (
                          <option key={p.id} value={`stance:${p.id}`}>
                            📐 {p.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <select
                      value=""
                      onChange={(e) => {
                        const chosen = stagePlacements.find((s) => s.id === e.target.value);
                        if (!chosen) return;
                        if (chosen.position) {
                          updateActorPositionAtTime(activeActor.id, currentTime, chosen.position, duration);
                        }
                        if (chosen.rotation) {
                          updateActor(activeActor.id, { rotation: chosen.rotation });
                        }
                      }}
                      className="rounded bg-[#141824] border border-cyan-500/40 px-1.5 py-0.5 text-cyan-300 font-bold text-[9px] focus:outline-none cursor-pointer max-w-[190px]"
                      title="Position Object Relative to Other Stage Objects or Stage Zones"
                    >
                      <option value="" className="bg-[#0f131d] text-slate-300">📍 Position Object...</option>
                      {stagePlacements.map((s) => (
                        <option key={s.id} value={s.id} className="bg-[#0f131d] text-slate-200">
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const curRot = activeActor.rotation || { x: 0, y: 0, z: 0 };
                        updateActor(activeActor.id, { rotation: { ...curRot, y: ((curRot.y - 45 + 540) % 360) - 180 } });
                      }}
                      className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 font-bold"
                      title="Rotate Object Yaw -45°"
                    >
                      ↺ -45°
                    </button>
                    <button
                      onClick={() => {
                        const curRot = activeActor.rotation || { x: 0, y: 0, z: 0 };
                        updateActor(activeActor.id, { rotation: { ...curRot, y: ((curRot.y + 45 + 540) % 360) - 180 } });
                      }}
                      className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-200 font-bold"
                      title="Rotate Object Yaw +45°"
                    >
                      ↻ +45°
                    </button>
                  </div>
                );
              })()}

              {/* Compact Humanoid Posing Strip (Only when a humanoid actor is selected & posing handles are enabled) */}
              {activeActor && detectObjectPoseCategory(activeActor) === 'humanoid' && showPosingHandles && (
                <div className="flex flex-wrap items-center gap-1 rounded-md bg-black/85 backdrop-blur-md px-2 py-1 border border-white/15 shadow">
                  {/* FK vs IK Switch */}
                  <button
                    onClick={() => {
                      setPosingMode('fk');
                      posingModeRef.current = 'fk';
                    }}
                    className={`px-1.5 py-0.5 rounded font-bold transition-all ${
                      posingMode === 'fk'
                        ? 'bg-director-gold text-director-darkest'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Forward Kinematics: Click joint discs to rotate/translate bones"
                  >
                    FK
                  </button>
                  <button
                    onClick={() => {
                      setPosingMode('ik');
                      posingModeRef.current = 'ik';
                    }}
                    className={`px-1.5 py-0.5 rounded font-bold transition-all ${
                      posingMode === 'ik'
                        ? 'bg-director-gold text-director-darkest'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Inverse Kinematics: Drag hand/foot/head targets"
                  >
                    IK
                  </button>

                  {posingMode === 'fk' && (
                    <>
                      <span className="text-white/20">|</span>
                      <button
                        onClick={() => {
                          setGizmoMode('rotate');
                          gizmoModeRef.current = 'rotate';
                        }}
                        className={`px-1.5 py-0.5 rounded font-bold ${
                          gizmoMode === 'rotate' ? 'bg-cyan-500 text-black' : 'text-slate-400 hover:text-white'
                        }`}
                        title="Rotate Bone"
                      >
                        Rot ↻
                      </button>
                      <button
                        onClick={() => {
                          setGizmoMode('translate');
                          gizmoModeRef.current = 'translate';
                        }}
                        className={`px-1.5 py-0.5 rounded font-bold ${
                          gizmoMode === 'translate' ? 'bg-cyan-500 text-black' : 'text-slate-400 hover:text-white'
                        }`}
                        title="Translate Bone (Root Crouch / Elevation)"
                      >
                        Move ✥
                      </button>
                    </>
                  )}

                  <span className="text-white/20">|</span>
                  <select
                    value={
                      activeActor.motionClip
                        ? `clip:${activeActor.motionClip}`
                        : activeActor.gait && activeActor.gait !== 'none'
                        ? `gait:${activeActor.gait}`
                        : `pose:${activeActor.posePreset && POSE_PRESETS[activeActor.posePreset] ? activeActor.posePreset : 'neutral-stand'}`
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith('clip:')) {
                        useShotStore.getState().applyReadyMadeMotion(activeActor.id, val.slice(5));
                      } else if (val.startsWith('gait:')) {
                        const gaitMode = val.slice(5) as any;
                        updateActor(activeActor.id, { gait: gaitMode, motionClip: undefined, posePreset: undefined, pose: undefined });
                        window.dispatchEvent(new CustomEvent('cmpvs:transport-play', { detail: { play: true } }));
                      } else if (val.startsWith('pose:')) {
                        updateActor(activeActor.id, { motionClip: undefined });
                        handleApplyPresetToSelectedActor(val.slice(5), activeActor.id);
                      }
                    }}
                    className="rounded bg-[#141824] border border-director-gold/40 px-1.5 py-0.5 text-director-gold font-bold text-[9px] focus:outline-none cursor-pointer"
                    title="Ready-Made Motions, Loops & Static Poses"
                  >
                    <optgroup label="🎬 Ready-Made Motion Clips (1-Click Play)" className="bg-[#0f131d] text-emerald-300">
                      {getReadyMadeMotionsForCategory('humanoid').map((c) => (
                        <option key={c.id} value={`clip:${c.id}`}>
                          {c.icon} {c.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🏃 Continuous Motion Loops" className="bg-[#0f131d] text-slate-200">
                      <option value="gait:auto">🏃 Auto (Walk / Idle)</option>
                      <option value="gait:walk">🚶 Walk Cycle Loop</option>
                      <option value="gait:run">🏃 Run Cycle Loop</option>
                      <option value="gait:sneak">🕵️ Sneak Cycle Loop</option>
                      <option value="gait:idle">🧍 Idle Breathing</option>
                    </optgroup>
                    <optgroup label="🧍 Static Acting Poses" className="bg-[#0f131d] text-slate-200">
                      {Object.values(POSE_PRESETS).map((p) => (
                        <option key={p.id} value={`pose:${p.id}`}>
                          🧍 {p.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <button
                    onClick={handleGroundSelectedActorFeet}
                    className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 font-semibold"
                    title="Snap character feet to floor level"
                  >
                    Ground Feet
                  </button>
                  <button
                    onClick={handleRecordCurrentPoseCue}
                    className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 font-semibold"
                    title={`Record pose keyframe at ${currentTime.toFixed(1)}s`}
                  >
                    + Pose Cue
                  </button>

                  {/* Active Bone Quick Nudge Controls (when an FK joint disc is selected) */}
                  {posingMode === 'fk' && selectedBone && (() => {
                    const activeBoneDef = JOINT_DISC_DEFINITIONS.find((d) => d.bone === selectedBone);
                    return (
                      <div className="flex items-center gap-1 pl-1 border-l border-white/15">
                        <span className="text-cyan-300 font-bold">{activeBoneDef?.label || selectedBone}:</span>
                        <button
                          onClick={() => handleNudgeBoneRotation('x', -0.26)}
                          className="px-1 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/35 border border-red-500/30 font-bold"
                          title="Pitch -15° (X)"
                        >
                          X-
                        </button>
                        <button
                          onClick={() => handleNudgeBoneRotation('x', 0.26)}
                          className="px-1 py-0.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/35 border border-red-500/30 font-bold"
                          title="Pitch +15° (X)"
                        >
                          X+
                        </button>
                        <button
                          onClick={() => handleNudgeBoneRotation('y', -0.26)}
                          className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/35 border border-emerald-500/30 font-bold"
                          title="Yaw -15° (Y)"
                        >
                          Y-
                        </button>
                        <button
                          onClick={() => handleNudgeBoneRotation('y', 0.26)}
                          className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/35 border border-emerald-500/30 font-bold"
                          title="Yaw +15° (Y)"
                        >
                          Y+
                        </button>
                        <button
                          onClick={() => handleNudgeBoneRotation('z', -0.26)}
                          className="px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/35 border border-blue-500/30 font-bold"
                          title="Roll -15° (Z)"
                        >
                          Z-
                        </button>
                        <button
                          onClick={() => handleNudgeBoneRotation('z', 0.26)}
                          className="px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/35 border border-blue-500/30 font-bold"
                          title="Roll +15° (Z)"
                        >
                          Z+
                        </button>
                        <button
                          onClick={handleResetSelectedJoint}
                          className="px-1.5 py-0.5 rounded bg-white/10 text-amber-300 hover:bg-white/20 font-semibold"
                          title="Reset this joint to rest pose"
                        >
                          Reset
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Subtle Navigation Hint on Right */}
            <div className="hidden xl:flex items-center rounded-md bg-black/65 backdrop-blur-md px-2 py-1 border border-white/10 text-slate-400 pointer-events-none">
              Orbit: L-Drag • Pan: R-Drag • Move: Drag Subject • Zoom: Wheel
            </div>
          </div>

          {/* Interactive 2D Orthographic Top-View Floorplan Radar (Bottom-Left PiP) */}
          <StageTopViewRadar currentTime={currentTime} duration={duration} />
        </div>

        {/* Viewport 2: Director's Through-the-Lens Viewfinder */}
        <div
          ref={viewfinderMountRef}
          className={`relative h-full min-w-0 min-h-0 rounded-xl border border-[#273247] bg-black flex items-center justify-center overflow-hidden transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
            viewMode === 'split' ? 'w-1/2' : viewMode === 'viewfinder' ? 'w-full' : 'hidden'
          }`}
        >
          {/* Synchronized Reference Video Player */}
          {shot.vfxReference?.videoUrl && (
            <video
              ref={vfVideoRef}
              src={shot.vfxReference.videoUrl}
              muted
              playsInline
              loop
              className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-150 z-0"
              style={{
                opacity:
                  viewfinderOverlayMode === '3d-only'
                    ? 0
                    : viewfinderOverlayMode === 'video-only'
                    ? 1
                    : overlayOpacity,
              }}
            />
          )}

          {/* Canvas 2D Reference Plate / Storyboard Image */}
          {!shot.vfxReference?.videoUrl && shot.referenceImage?.previewUrl && (
            <img
              src={shot.referenceImage.previewUrl}
              alt="Canvas 2D Reference Plate"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-150 z-0"
              style={{
                opacity:
                  viewfinderOverlayMode === '3d-only'
                    ? 0
                    : viewfinderOverlayMode === 'video-only'
                    ? 1
                    : overlayOpacity,
              }}
            />
          )}

          {/* Watermark Lens & Framing Badge */}
          <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-2 rounded-md bg-black/80 backdrop-blur-md px-2.5 py-1 border border-white/10 font-mono text-[9px] text-director-cyan shadow">
            <Camera className="h-3 w-3" />
            <span className="font-bold text-white">VIEWFINDER (POV)</span>
            <span className="text-slate-500">•</span>
            <span>{shot.camera.lens.focalLength} • {shot.aspectRatio}</span>
          </div>

          {/* Video Plate / Canvas Plate Overlay Controls */}
          {(shot.vfxReference?.videoUrl || shot.referenceImage?.previewUrl) && (
            <div className="absolute top-10 left-2.5 z-20 flex items-center gap-1.5 rounded-md bg-black/85 backdrop-blur px-2 py-0.5 border border-white/10 font-mono text-[9px]">
              <span className="text-slate-400">
                {shot.referenceImage?.previewUrl && !shot.vfxReference?.videoUrl ? 'Canvas Plate:' : 'Plate:'}
              </span>
              <button
                onClick={() => setViewfinderOverlayMode('3d-only')}
                className={`px-1.5 py-0.5 rounded transition-all ${
                  viewfinderOverlayMode === '3d-only'
                    ? 'bg-director-gold text-director-darkest font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                3D Only
              </button>
              <button
                onClick={() => setViewfinderOverlayMode('overlay')}
                className={`px-1.5 py-0.5 rounded transition-all ${
                  viewfinderOverlayMode === 'overlay'
                    ? 'bg-director-cyan text-director-darkest font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Overlay reference plate with 3D camera & actors"
              >
                Ghost Overlay
              </button>
              <button
                onClick={() => setViewfinderOverlayMode('video-only')}
                className={`px-1.5 py-0.5 rounded transition-all ${
                  viewfinderOverlayMode === 'video-only'
                    ? 'bg-purple-400 text-director-darkest font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {shot.referenceImage?.previewUrl && !shot.vfxReference?.videoUrl ? 'Canvas 2D' : 'Video Plate'}
              </button>
              {viewfinderOverlayMode === 'overlay' && (
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                  className="w-12 h-1 accent-director-cyan cursor-pointer"
                  title="Adjust reference plate overlay opacity"
                />
              )}
            </div>
          )}

          {/* Viewfinder HUD Overlays: Watermark, Choreography Brackets, Rule of Thirds & Crosshairs */}
          <StageViewfinderOverlays
            vfxReference={shot.vfxReference}
            actors={shot.actors}
            showRuleOfThirds={showRuleOfThirds}
          />
        </div>
      </div>

      {/* Standalone Bottom 24fps Scrub Transport Bar (Hidden when embedded inside MotionPrevisStage) */}
      {shouldShowBottomTransport && (
        <div className="flex h-14 shrink-0 items-center justify-between border-t border-director-border px-5 bg-director-darkest/95 z-10 font-mono text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-director-gold text-director-darkest shadow-glow-gold hover:brightness-110 transition-all font-bold"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>

            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg glass-control text-slate-400 hover:text-white"
              title="Reset to frame 0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-1.5 font-bold text-white text-xs">
              <span>{currentTime.toFixed(2)}s</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-400">{duration.toFixed(2)}s</span>
            </div>

            <span className="rounded bg-director-surface px-2 py-0.5 font-mono text-[10px] text-director-amber border border-director-amber/30">
              FRAME {Math.round(currentTime * 24)} (24 FPS)
            </span>
          </div>

          <div className="flex flex-1 items-center max-w-xl mx-6">
            <input
              type="range"
              min={0}
              max={duration}
              step={0.0416}
              value={currentTime}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentTime(parseFloat(e.target.value));
              }}
              className="w-full h-1.5 bg-director-surface rounded-lg appearance-none cursor-pointer accent-director-gold"
            />
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
            <span>Camera: <strong className="text-director-gold">{shot.camera.movement.type}</strong></span>
            <span>•</span>
            <span>Actors: <strong className="text-director-cyan">{shot.actors.length} on stage</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};
