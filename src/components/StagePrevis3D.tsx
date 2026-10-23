import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useShotStore } from '../stores/useShotStore';
import { FocalLength, AspectRatio, SubjectKind, Point2D } from '../types/shotspec';
import { interpolateTrajectoryPosition, interpolateCameraPosition } from '../engine/trajectoryMath';
import { createProceduralActorMesh } from '../engine/procedural3D';
import { lookupCuratedPartGraph, buildPartGraph } from '../engine/procedural3D/partGraph';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();
const gltfCache = new Map<string, THREE.Group>();

/**
 * Procedural PBR Brick Coursing Texture
 * Renders warm running-bond terracotta lodge brickwork with deep mortar and surface relief
 */
function createBrickCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#261b14';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 16;
    const cols = 8;
    const brickH = 512 / rows;
    const brickW = 512 / cols;
    const mortar = 3;
    const brickColors = ['#6e3422', '#5c281a', '#793b26', '#4b2014', '#632d1e', '#522417'];

    for (let r = 0; r < rows; r++) {
      const isOffset = r % 2 === 1;
      const startX = isOffset ? -brickW / 2 : 0;
      for (let c = -1; c <= cols + 1; c++) {
        const x = startX + c * brickW;
        const y = r * brickH;
        const colorIdx = (r * 11 + c * 17) % brickColors.length;
        ctx.fillStyle = brickColors[Math.abs(colorIdx)];
        ctx.fillRect(x + mortar, y + mortar, brickW - mortar * 2, brickH - mortar * 2);

        // Highlight upper edge for 3D bevel relief
        ctx.fillStyle = 'rgba(255, 180, 140, 0.12)';
        ctx.fillRect(x + mortar + 1, y + mortar + 1, brickW - mortar * 2 - 2, 2);
        // Shadow lower edge
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fillRect(x + mortar + 1, y + brickH - mortar - 2, brickW - mortar * 2 - 2, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 4);
  return tex;
}

/**
 * Procedural Polished Hardwood Parquet Texture
 * Renders rich dark walnut / oak floorboards with specular luster
 */
function createWoodParquetCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#2b1407';
    ctx.fillRect(0, 0, 512, 512);

    const planks = 16;
    const plankH = 512 / planks;
    const woodTones = ['#452414', '#381c0e', '#4c2916', '#2f1509', '#412211', '#4e2c18'];

    for (let p = 0; p < planks; p++) {
      const y = p * plankH;
      ctx.fillStyle = woodTones[p % woodTones.length];
      ctx.fillRect(0, y + 1, 512, plankH - 2);

      // Wood grain lines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, y + plankH - 1, 512, 1);
      ctx.fillStyle = 'rgba(255, 190, 130, 0.09)';
      ctx.fillRect(0, y + 2, 512, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}
import {
  Play,
  Pause,
  RotateCcw,
  Camera,
  Eye,
  Layers,
  Grid,
  Compass,
  Trash2,
  X,
  Target,
  Film,
  Download,
  Loader2,
  Maximize2,
  ChevronDown,
  ChevronUp,
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
}

export const StagePrevis3D: React.FC<StagePrevis3DProps> = ({
  externalTime,
  isExternalPlaying,
  onTimeChange,
  initialViewMode = 'split',
  showToolbar = true,
}) => {
  const {
    shot,
    selectedActorId,
    setSelectedActorId,
    updateActor,
    updateActorPositionAtTime,
    updateCameraPositionAtTime,
    removeActorKeyframe,
    removeActor,
    previsVideoUrl,
    isRenderingPrevis,
    previsProgress,
    registerPrevisRenderer,
    setPrevisVideo,
    setPrevisRendering,
    beginGesture,
    endGesture,
  } = useShotStore();

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(externalTime ?? 0);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showRuleOfThirds, setShowRuleOfThirds] = useState<boolean>(true);
  const [isHudMinimized, setIsHudMinimized] = useState<boolean>(false);

  // 3D Direct Manipulation & Dragging State
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseVecRef = useRef(new THREE.Vector2());
  const floorPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const [isFloorDragging, setIsFloorDragging] = useState(false);

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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedActorId, removeActor, setSelectedActorId]);

  // 2. Compute Camera 3D Position at currentTime with full keyframe interpolation
  const getCameraPositionAtTime = (t: number) => {
    return interpolateCameraPosition(shot.camera.movement, t, duration);
  };

  // 3. Compute Actor 3D Position at currentTime with full keyframe interpolation
  const getActorPositionAtTime = (actor: (typeof shot.actors)[0], t: number) => {
    const stagePos = interpolateTrajectoryPosition(actor.trajectory, t, duration);
    const x = (stagePos.x - 50) * 1.0;
    const z = (stagePos.y - 50) * 1.0;
    const y = (stagePos.z ?? 0) * 0.4;
    return { x, y, z };
  };

  // Helper: Recursively assign Three.js layers to an Object3D hierarchy
  const setLayerRecursively = (obj: THREE.Object3D, layer: number) => {
    obj.layers.set(layer);
    obj.children.forEach((child) => setLayerRecursively(child, layer));
  };

  // Helper: Create Sprite Banner for 3D Subjects
  const createSpriteBanner = (
    name: string,
    subtitleBadge?: string,
    isGhostWireframe: boolean = false
  ) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = isGhostWireframe ? 'rgba(6, 182, 212, 0.25)' : 'rgba(10, 12, 16, 0.85)';
      ctx.roundRect(4, 4, 248, 56, 12);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = isGhostWireframe ? '#06b6d4' : '#f59e0b';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (subtitleBadge) {
        ctx.fillText(name.toUpperCase(), 128, 22);
        ctx.fillStyle = isGhostWireframe ? '#22d3ee' : '#10b981';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(subtitleBadge, 128, 44);
      } else {
        ctx.fillText(name.toUpperCase(), 128, 32);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(10, 2.5, 1);
    sprite.layers.set(1); // Editor Gizmo Layer (hidden in Viewfinder / Previs render)
    return sprite;
  };

  // Helper: Create Ground Selection Ring (Only visible when selected or in ghost preview)
  const createBaseRing = (
    radius: number,
    colorHex: number,
    isGhostWireframe: boolean = false,
    isSelected: boolean = false
  ) => {
    const group = new THREE.Group();

    // Keep ground completely clean: do not display rings or discs around unselected objects
    if (!isSelected && !isGhostWireframe) {
      return group;
    }

    const ringColor = isSelected ? 0xf59e0b : isGhostWireframe ? 0x06b6d4 : colorHex;

    // Single sleek, crisp selection circle (no concentric rings, no vertical beacon cylinder)
    const ringThickness = 0.12;
    const ringGeo = new THREE.RingGeometry(Math.max(0.1, radius - ringThickness), radius, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: ringColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isSelected ? 0.85 : 0.25,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.04;
    ringMesh.layers.set(1); // Editor Gizmo Layer (hidden in Viewfinder / Previs render)
    group.add(ringMesh);

    return group;
  };



  // Helper: Universal Semantic Procedural 3D Subject/Prop Mesh Generator (powered by 3dviz-pro-max + GLTF Loader)
  const createSubjectMesh = (
    name: string,
    kind: SubjectKind = 'human',
    colorHex: number,
    isGhostWireframe: boolean = false,
    subtitleBadge?: string,
    isSelected: boolean = false,
    _conceptImageUrl?: string,
    tokenPrompt?: string,
    modelUrl?: string,
    partGraph?: any
  ): THREE.Group => {
    const group = new THREE.Group();

    // 1. If explicit GLB/GLTF modelUrl is provided, load or clone from cache
    if (modelUrl) {
      const cached = gltfCache.get(modelUrl);
      if (cached) {
        const cloned = cached.clone(true);
        group.add(cloned);
        const bbox = new THREE.Box3().setFromObject(cloned);
        const size = bbox.getSize(new THREE.Vector3());
        const baseRadius = Math.max(2.4, Math.max(size.x, size.z) * 0.55);
        group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
        const banner = createSpriteBanner(
          name || kind.toUpperCase() || '3D MODEL',
          subtitleBadge || 'GLB 3D MODEL',
          isGhostWireframe
        );
        banner.position.y = Math.max(4.5, size.y + 1.8);
        group.add(banner);
        return group;
      }

      // Placeholder while loading
      const procMesh = createProceduralActorMesh({
        category: kind || 'custom',
        name,
        tokenPrompt,
        colorHex,
        isSelected,
        isGhostWireframe,
        partGraph,
      });
      procMesh.name = '__gltf_placeholder__';
      group.add(procMesh);

      // Async load GLTF
      gltfLoader.load(
        modelUrl,
        (gltf) => {
          const loadedRoot = gltf.scene;
          const bbox = new THREE.Box3().setFromObject(loadedRoot);
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);
          const targetHeight = 2.2;
          const scaleFactor = targetHeight / maxDim;
          loadedRoot.scale.setScalar(scaleFactor);

          // Center vertically so bottom rests on ground ring
          const newBbox = new THREE.Box3().setFromObject(loadedRoot);
          loadedRoot.position.y = -newBbox.min.y;

          loadedRoot.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          gltfCache.set(modelUrl, loadedRoot.clone(true));

          const pl = group.getObjectByName('__gltf_placeholder__');
          if (pl) {
            group.remove(pl);
          }
          group.add(loadedRoot);
        },
        undefined,
        (err) => {
          console.warn('Failed to load GLTF 3D model:', err);
        }
      );

      // Base ring & banner
      const bbox = new THREE.Box3().setFromObject(procMesh);
      const size = bbox.getSize(new THREE.Vector3());
      const baseRadius = Math.max(2.4, Math.max(size.x, size.z) * 0.55);
      group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
      const banner = createSpriteBanner(
        name || kind.toUpperCase() || '3D MODEL',
        subtitleBadge || 'GLB 3D MODEL',
        isGhostWireframe
      );
      banner.position.y = Math.max(4.5, size.y + 1.8);
      group.add(banner);
      return group;
    }

    // High-Fidelity Procedural 3D Model from 3dviz-pro-max Engine
    const procMesh = createProceduralActorMesh({
      category: kind || 'custom',
      name,
      tokenPrompt,
      colorHex,
      isSelected,
      isGhostWireframe,
      partGraph,
    });
    group.add(procMesh);

    // Dynamic bounding geometry for ground ring and hovering HUD billboard banner
    const bbox = new THREE.Box3().setFromObject(procMesh);
    const size = bbox.getSize(new THREE.Vector3());
    const baseRadius = Math.max(2.4, Math.max(size.x, size.z) * 0.55);

    group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
    const banner = createSpriteBanner(
      name || kind.toUpperCase() || 'SUBJECT',
      subtitleBadge || kind.toUpperCase() || 'SUBJECT',
      isGhostWireframe
    );
    banner.position.y = Math.max(4.5, size.y + 1.8);
    group.add(banner);

    if (procMesh.userData.update) {
      group.userData.update = procMesh.userData.update;
    }

    return group;
  };

  // Helper: Create 3D Camera Frustum Wireframe (pointing forward along +Z)
  const updateFrustumGeometry = (fovDeg: number, aspect: number, distance: number = 35) => {
    const fovRad = (fovDeg * Math.PI) / 180;
    const hHalf = Math.tan(fovRad / 2) * distance;
    const wHalf = hHalf * aspect;

    const vertices = new Float32Array([
      // Apex to 4 corners (forward along +Z)
      0, 0, 0,  -wHalf,  hHalf, distance,
      0, 0, 0,   wHalf,  hHalf, distance,
      0, 0, 0,   wHalf, -hHalf, distance,
      0, 0, 0,  -wHalf, -hHalf, distance,
      // Perimeter rectangle
      -wHalf,  hHalf, distance,   wHalf,  hHalf, distance,
       wHalf,  hHalf, distance,   wHalf, -hHalf, distance,
       wHalf, -hHalf, distance,  -wHalf, -hHalf, distance,
      -wHalf, -hHalf, distance,  -wHalf,  hHalf, distance,
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    return geo;
  };

  // 4. Initialize Three.js Stages
  useEffect(() => {
    // A. Main Virtual Soundstage Scene
    const stageScene = new THREE.Scene();
    stageScene.background = new THREE.Color(0x08090c);
    stageScene.fog = new THREE.FogExp2(0x08090c, 0.007);
    stageSceneRef.current = stageScene;

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
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.4);
    stageScene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    stageScene.add(ambientLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.75);
    fillLight.position.set(0, 35, 55);
    stageScene.add(fillLight);

    // Stage Lighting Rig Group
    const lightsGroup = new THREE.Group();
    stageScene.add(lightsGroup);
    lightsGroupRef.current = lightsGroup;

    // Camera Gizmo Group (represented in stage view - Layer 1 Gizmo Only)
    const cameraGizmoGroup = new THREE.Group();
    const camBodyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 });
    const camBody = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 5), camBodyMat);
    camBody.position.y = 1.5;
    camBody.userData.isCamera = true;
    cameraGizmoGroup.add(camBody);

    // Lens Barrel (pointing forward +Z)
    const lensMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.1, metalness: 0.9 });
    const lensMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3, 16), lensMat);
    lensMesh.rotation.x = Math.PI / 2;
    lensMesh.position.set(0, 1.5, 3.5);
    lensMesh.userData.isCamera = true;
    cameraGizmoGroup.add(lensMesh);

    // Frustum Lines (pointing forward +Z directly matching camera line of sight)
    const fov = FOV_MAP[shot.camera.lens.focalLength] || 63;
    const aspect = ASPECT_RATIOS[shot.aspectRatio] || 16 / 9;
    const frustumGeo = updateFrustumGeometry(fov, aspect, 35);
    const frustumMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.8 });
    const frustumLine = new THREE.LineSegments(frustumGeo, frustumMat);
    frustumLine.position.set(0, 1.5, 4);
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
    stageCamera.position.set(0, 65, 85);
    stageCameraRef.current = stageCamera;

    // Direct Raycaster enables selection for both Layer 0 (Actors) and Layer 1 (Camera Gizmo)
    raycasterRef.current.layers.enable(0);
    raycasterRef.current.layers.enable(1);

    // Renderers Setup
    if (stageMountRef.current) {
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
      renderer.toneMappingExposure = 1.15;
      stageMountRef.current.appendChild(renderer.domElement);
      stageRendererRef.current = renderer;

      const controls = new OrbitControls(stageCamera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI / 2 - 0.05; // don't go below floor
      controls.target.set(0, 5, 0);
      stageControlsRef.current = controls;
    }

    if (viewfinderMountRef.current) {
      const vfRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      vfRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const w = viewfinderMountRef.current.clientWidth || 400;
      const h = viewfinderMountRef.current.clientHeight || 300;
      vfRenderer.setSize(w, h, false);
      vfRenderer.domElement.style.position = 'absolute';
      vfRenderer.domElement.style.top = '0';
      vfRenderer.domElement.style.left = '0';
      vfRenderer.domElement.style.width = '100%';
      vfRenderer.domElement.style.height = '100%';
      vfRenderer.domElement.style.zIndex = '5';
      vfRenderer.domElement.dataset.role = 'viewfinder';
      vfRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      vfRenderer.toneMappingExposure = 1.15;
      viewfinderMountRef.current.appendChild(vfRenderer.domElement);
      vfRendererRef.current = vfRenderer;
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
          vfCameraRef.current.aspect = w / h;
          vfCameraRef.current.updateProjectionMatrix();
          vfRendererRef.current.setSize(w, h, false);
        }
      }
    };

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

      // 3. Continuous Kinematic Updates for 3D Actors & Props (flame wavers, rotations, etc.)
      actorMeshesRef.current.forEach((mesh) => {
        if (typeof mesh.userData.update === 'function') {
          mesh.userData.update(dt);
        }
      });
      if (environmentGroupRef.current) {
        environmentGroupRef.current.traverse((child) => {
          if (typeof child.userData.update === 'function') {
            child.userData.update(dt);
          }
        });
      }

      if (stageControlsRef.current) {
        stageControlsRef.current.update();
      }

      if (stageRendererRef.current && stageSceneRef.current && stageCameraRef.current) {
        stageRendererRef.current.render(stageSceneRef.current, stageCameraRef.current);
      }

      // Do NOT interfere with vfRenderer while in-app previs is actively capturing frames
      if (!useShotStore.getState().isRenderingPrevis) {
        if (vfRendererRef.current && stageSceneRef.current && vfCameraRef.current) {
          vfRendererRef.current.render(stageSceneRef.current, vfCameraRef.current);
        }
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(mainLoopId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSizes);

      if (stageRendererRef.current) {
        stageRendererRef.current.dispose();
        stageMountRef.current?.replaceChildren();
      }
      if (vfRendererRef.current) {
        vfRendererRef.current.dispose();
        viewfinderMountRef.current?.replaceChildren();
      }
    };
  }, []);

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

    const direction = shot.lighting.direction;
    const style = shot.lighting.style;

    let keyPos = new THREE.Vector3(30, 25, 30);
    let keyIntensity = 2.0;
    let keyColor = 0xffffff;

    if (direction === 'side-key') {
      keyPos = new THREE.Vector3(45, 18, 0);
    } else if (direction === 'rim-backlit') {
      keyPos = new THREE.Vector3(0, 20, -40);
    } else if (direction === 'overhead-top') {
      keyPos = new THREE.Vector3(0, 45, 0);
    } else if (direction === 'underlit-dramatic') {
      keyPos = new THREE.Vector3(0, 2, 20);
    }

    if (style === 'golden-hour') {
      keyColor = 0xf59e0b;
      keyIntensity = 2.8;
    } else if (style === 'neon-cyberpunk') {
      keyColor = 0x06b6d4;
      keyIntensity = 2.5;
    } else if (style === 'moonlight-foggy') {
      keyColor = 0x93c5fd;
      keyIntensity = 1.4;
    } else if (style === 'low-key-film-noir') {
      keyColor = 0xffffff;
      keyIntensity = 3.2;
    }

    const keyLight = new THREE.DirectionalLight(keyColor, keyIntensity);
    keyLight.position.copy(keyPos);
    keyLight.castShadow = true;
    keyLight.target.position.set(0, 5, 0);
    lightsGroup.add(keyLight);
    lightsGroup.add(keyLight.target);

    // Visual softbox fixture mesh (Layer 1 Editor Gizmo)
    const fixtureMat = new THREE.MeshBasicMaterial({ color: keyColor });
    const fixtureMesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 1), fixtureMat);
    fixtureMesh.position.copy(keyPos);
    fixtureMesh.lookAt(0, 5, 0);
    fixtureMesh.layers.set(1);
    lightsGroup.add(fixtureMesh);

    // Light stand line (Layer 1 Editor Gizmo)
    const standGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(keyPos.x, 0, keyPos.z),
      keyPos,
    ]);
    const standLine = new THREE.Line(standGeo, new THREE.LineBasicMaterial({ color: 0x475569 }));
    standLine.layers.set(1);
    lightsGroup.add(standLine);

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
  }, [shot.lighting.style, shot.lighting.direction, shot.environment, shot.sceneDescription, shot.actors]);

  // 5b. Update Environment Visuals (Ground surface, sky color, fog, perimeter structures)
  useEffect(() => {
    const scene = stageSceneRef.current;
    const envGroup = environmentGroupRef.current;
    const floorMesh = floorMeshRef.current;
    if (!scene || !envGroup || !floorMesh) return;

    const env = shot.environment;
    const skyHex = env?.skyColor || '#08090c';
    const fogHex = env?.fogColor || '#08090c';
    const fogDensity = (env?.fogDensity ?? 0.15) * 0.035;

    // 1. Sky & Atmospheric Fog
    scene.background = new THREE.Color(skyHex);
    scene.fog = new THREE.FogExp2(new THREE.Color(fogHex), Math.max(0.001, fogDensity));

    // 2. Ground Material & Surface Texturing
    const floorMat = floorMesh.material as THREE.MeshStandardMaterial;
    if (floorMat) {
      const surface = env?.groundSurface || 'studio-floor';
      switch (surface) {
        case 'asphalt-wet':
          floorMat.color.set(0x111317);
          floorMat.roughness = 0.18;
          floorMat.metalness = 0.45;
          break;
        case 'concrete-floor':
          floorMat.color.set(0x22262e);
          floorMat.roughness = 0.88;
          floorMat.metalness = 0.12;
          break;
        case 'stone-cobblestone':
          floorMat.color.set(0x2b2723);
          floorMat.roughness = 0.82;
          floorMat.metalness = 0.08;
          break;
        case 'sand-dunes':
          floorMat.color.set(0xbfa06a);
          floorMat.roughness = 0.96;
          floorMat.metalness = 0.02;
          break;
        case 'grass-terrain':
          floorMat.color.set(0x1b2e19);
          floorMat.roughness = 0.92;
          floorMat.metalness = 0.04;
          break;
        case 'metal-grate':
          floorMat.color.set(0x1b2330);
          floorMat.roughness = 0.32;
          floorMat.metalness = 0.85;
          break;
        case 'wood-parquet':
          floorMat.color.set(0x3e2114);
          floorMat.map = createWoodParquetCanvasTexture();
          floorMat.roughness = 0.22;
          floorMat.metalness = 0.18;
          break;
        case 'studio-floor':
        default:
          floorMat.color.set(0x0f1117);
          floorMat.map = null;
          floorMat.roughness = 0.85;
          floorMat.metalness = 0.15;
          break;
      }
      floorMat.needsUpdate = true;
    }

    // 3. Clear and Rebuild Perimeter Environmental Architecture
    envGroup.clear();
    const rawCat = (env?.category || 'interior-studio').toLowerCase();

    if (rawCat.includes('urban')) {
      // Urban Cityscape: Distant Skyline Silhouettes, Illuminated Signs & Streetlamps
      const bldgMat = new THREE.MeshStandardMaterial({
        color: 0x0a0e17,
        roughness: 0.75,
        metalness: 0.35,
      });
      const neonMats = [
        new THREE.MeshBasicMaterial({ color: 0x06b6d4 }), // Cyan
        new THREE.MeshBasicMaterial({ color: 0xec4899 }), // Magenta
        new THREE.MeshBasicMaterial({ color: 0xf59e0b }), // Amber
      ];

      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const dist = 54 + (i % 3) * 7;
        const w = 9 + (i % 4) * 3;
        const h = 28 + (i % 5) * 10;
        const d = 9 + (i % 3) * 2;

        const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bldgMat);
        bldg.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
        bldg.lookAt(0, h / 2, 0);
        envGroup.add(bldg);

        // Rooftop neon crown
        const neonMat = neonMats[i % neonMats.length];
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.6, 0.6), neonMat);
        strip.position.set(Math.cos(angle) * dist, h - 0.3, Math.sin(angle) * dist);
        strip.lookAt(0, h, 0);
        envGroup.add(strip);
      }

      // Perimeter Streetlights (4 points around stage corners)
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
      const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
      [
        { x: -45, z: -45 },
        { x: 45, z: -45 },
        { x: -45, z: 45 },
        { x: 45, z: 45 },
      ].forEach((pt) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 14, 8), poleMat);
        pole.position.set(pt.x, 7, pt.z);
        envGroup.add(pole);

        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 12), lampGlowMat);
        bulb.position.set(pt.x, 14, pt.z);
        envGroup.add(bulb);
      });
    } else if (rawCat.includes('scifi')) {
      // Sci-Fi Orbital Station Bay: Massive Torus Bulkheads & Glowing Plasma Conduits
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x111622,
        metalness: 0.85,
        roughness: 0.25,
      });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const warningMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

      for (let i = 0; i < 7; i++) {
        const z = -48 + i * 16;
        const ringGeo = new THREE.TorusGeometry(34, 1.4, 8, 28, Math.PI);
        const ring = new THREE.Mesh(ringGeo, frameMat);
        ring.position.set(0, 0, z);
        ring.rotation.z = Math.PI;
        envGroup.add(ring);

        const glowRing = new THREE.Mesh(new THREE.TorusGeometry(33.5, 0.25, 8, 28, Math.PI), glowMat);
        glowRing.position.set(0, 0, z);
        glowRing.rotation.z = Math.PI;
        envGroup.add(glowRing);
      }

      // 4 Heavy Vertical Support Gantries with Hazard Markings
      [-48, 48].forEach((x) => {
        [-35, 0, 35].forEach((z) => {
          const col = new THREE.Mesh(new THREE.BoxGeometry(3, 26, 3), frameMat);
          col.position.set(x, 13, z);
          envGroup.add(col);

          const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.8, 3.1), warningMat);
          stripe.position.set(x, 2, z);
          envGroup.add(stripe);
        });
      });
    } else if (rawCat.includes('historical') || rawCat.includes('castle')) {
      // Medieval Castle Courtyard: Towering Stone Walls, Watchtower Bastions & Torches
      const stoneMat = new THREE.MeshStandardMaterial({
        color: 0x221f1c,
        roughness: 0.95,
        metalness: 0.05,
      });
      const torchMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const x = Math.cos(angle) * 52;
        const z = Math.sin(angle) * 52;

        // Crenelated Bastion Tower
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 22, 12), stoneMat);
        tower.position.set(x, 11, z);
        envGroup.add(tower);

        // Tower Parapet Top
        const top = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.2, 2.5, 12), stoneMat);
        top.position.set(x, 22.5, z);
        envGroup.add(top);

        // Torch Fire Sconce
        const torch = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), torchMat);
        torch.position.set(x * 0.92, 12, z * 0.92);
        envGroup.add(torch);

        // Curtain Wall Spanning Between Bastions
        const nextAngle = ((i + 1) / 10) * Math.PI * 2;
        const midX = (Math.cos(angle) + Math.cos(nextAngle)) * 0.5 * 52;
        const midZ = (Math.sin(angle) + Math.sin(nextAngle)) * 0.5 * 52;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 2.2), stoneMat);
        wall.position.set(midX, 7, midZ);
        wall.lookAt(0, 7, 0);
        envGroup.add(wall);
      }
    } else if (rawCat.includes('nature') || rawCat.includes('forest')) {
      // Redwood Forest Clearing: Rolling Terrain Mounds & Towering Conifer Trees
      const hillMat = new THREE.MeshStandardMaterial({
        color: 0x152414,
        roughness: 0.96,
        metalness: 0.0,
      });
      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x2e1a0f,
        roughness: 0.9,
      });
      const foliageMat = new THREE.MeshStandardMaterial({
        color: 0x0f2c12,
        roughness: 0.85,
      });

      // Mounds
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const dist = 50 + (i % 3) * 6;
        const rad = 14 + (i % 3) * 5;
        const mound = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hillMat);
        mound.position.set(Math.cos(angle) * dist, -2, Math.sin(angle) * dist);
        mound.scale.set(1.6, 0.45, 1.6);
        envGroup.add(mound);
      }

      // Redwood / Pine Trees
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2;
        const dist = 48 + (i % 4) * 6;
        const tx = Math.cos(angle) * dist;
        const tz = Math.sin(angle) * dist;

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, 16, 8), trunkMat);
        trunk.position.set(tx, 8, tz);
        envGroup.add(trunk);

        for (let j = 0; j < 3; j++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(5 - j * 1.1, 8, 8), foliageMat);
          cone.position.set(tx, 14 + j * 5, tz);
          envGroup.add(cone);
        }
      }
    } else if (rawCat.includes('desert') || rawCat.includes('wasteland')) {
      // Sahara Desert: Undulating Sand Dunes & Weathered Rock Mesas
      const sandMat = new THREE.MeshStandardMaterial({
        color: 0xb58e52,
        roughness: 0.97,
        metalness: 0.02,
      });
      const rockMat = new THREE.MeshStandardMaterial({
        color: 0x7c4f2b,
        roughness: 0.92,
        metalness: 0.05,
      });

      // Rolling Sand Dunes
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const dist = 48 + (i % 3) * 8;
        const dune = new THREE.Mesh(new THREE.SphereGeometry(18, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), sandMat);
        dune.position.set(Math.cos(angle) * dist, -4, Math.sin(angle) * dist);
        dune.scale.set(2.2, 0.35, 1.4);
        dune.rotation.y = angle;
        envGroup.add(dune);
      }

      // Distant Weathered Mesa Rock Monoliths
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + 0.3;
        const mesa = new THREE.Mesh(new THREE.CylinderGeometry(8, 12, 28, 7), rockMat);
        mesa.position.set(Math.cos(angle) * 62, 12, Math.sin(angle) * 62);
        envGroup.add(mesa);
      }
    } else if (rawCat.includes('room') || rawCat.includes('penthouse') || rawCat.includes('interior') || rawCat.includes('hearth') || rawCat.includes('cabin')) {
      // Interior Chamber / Hearthside Salon / Study: Textured Walls, Timber Beams & Distant Window
      const descLower = (shot.sceneDescription + ' ' + (env?.promptDescription || '')).toLowerCase();
      const isBrick = /brick|terracotta|masonry\s*wall|طوب|قرميد/i.test(descLower) || descLower.includes('fireplace') || rawCat.includes('hearth');
      const isWoodPanel = (/wood\s*panel|timber\s*wall|study|library|chalet|cabin|خشب/i.test(descLower) || rawCat.includes('cabin')) && !isBrick;

      const wallTex = isBrick ? createBrickCanvasTexture() : isWoodPanel ? createWoodParquetCanvasTexture() : null;
      const wallMat = new THREE.MeshStandardMaterial({
        color: isBrick ? 0x9a4a32 : isWoodPanel ? 0x3d271d : 0x141822, // Rich terracotta brick vs warm dark walnut vs sleek charcoal
        map: wallTex,
        roughness: isBrick ? 0.78 : isWoodPanel ? 0.45 : 0.85,
        metalness: isBrick ? 0.04 : isWoodPanel ? 0.12 : 0.1,
      });
      const frameMat = new THREE.MeshStandardMaterial({
        color: isBrick || isWoodPanel ? 0x271911 : 0x090c12, // Dark timber wood frame vs black steel
        roughness: 0.6,
        metalness: 0.3,
      });

      // Back Wall with Genuine Window Opening so deep blue twilight sky is visible!
      const backWallLeft = new THREE.Mesh(new THREE.BoxGeometry(39, 24, 1), wallMat);
      backWallLeft.position.set(-30.5, 12, -49);
      envGroup.add(backWallLeft);

      const backWallRight = new THREE.Mesh(new THREE.BoxGeometry(39, 24, 1), wallMat);
      backWallRight.position.set(30.5, 12, -49);
      envGroup.add(backWallRight);

      const backWallSill = new THREE.Mesh(new THREE.BoxGeometry(22, 4, 1), wallMat);
      backWallSill.position.set(0, 2, -49);
      envGroup.add(backWallSill);

      const backWallHeader = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 1), wallMat);
      backWallHeader.position.set(0, 21, -49);
      envGroup.add(backWallHeader);

      // Window Frame (allowing twilight sky / distant landscape to show through)
      const windowOuter = new THREE.Mesh(new THREE.BoxGeometry(22, 14, 1.4), frameMat);
      windowOuter.position.set(0, 11, -48.6);
      envGroup.add(windowOuter);

      // Window cross mullions
      const horizMullion = new THREE.Mesh(new THREE.BoxGeometry(21.6, 0.4, 1.6), frameMat);
      horizMullion.position.set(0, 11, -48.5);
      envGroup.add(horizMullion);

      const vertMullion1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 13.6, 1.6), frameMat);
      vertMullion1.position.set(-5.5, 11, -48.5);
      envGroup.add(vertMullion1);

      const vertMullion2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 13.6, 1.6), frameMat);
      vertMullion2.position.set(5.5, 11, -48.5);
      envGroup.add(vertMullion2);

      // Side Walls
      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 24, 100), wallMat);
      leftWall.position.set(-49, 12, 0);
      envGroup.add(leftWall);

      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 24, 100), wallMat);
      rightWall.position.set(49, 12, 0);
      envGroup.add(rightWall);

      // Ceiling timber beams
      for (let z = -40; z <= 40; z += 16) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(98, 1.0, 1.0), frameMat);
        beam.position.set(0, 23.5, z);
        envGroup.add(beam);
      }

      // Architectural Built-in Stone Fireplace on stage if no fireplace actor is placed
      const hasFireplaceActor = shot.actors.some((a) =>
        /fireplace|hearth/i.test(`${a.name} ${a.token || ''} ${a.kind || ''}`)
      );
      if ((isBrick || rawCat.includes('hearth')) && !hasFireplaceActor) {
        const fpGraph = lookupCuratedPartGraph('rustic stone fireplace');
        if (fpGraph) {
          const fpKit = buildPartGraph(fpGraph);
          fpKit.group.position.set(0, 0, -22);
          fpKit.group.scale.set(1.5, 1.5, 1.5);
          if (fpKit.update) {
            fpKit.group.userData.update = fpKit.update;
          }
          envGroup.add(fpKit.group);
        }
      }
    } else {
      // Default: Soundstage Studio — Real Physical Stage with Acoustic Perimeter Walls & Overhead Lighting Box Truss
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x0d1017,
        roughness: 0.88,
        metalness: 0.15,
      });
      const trussMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        metalness: 0.8,
        roughness: 0.3,
      });
      const onAirGlowMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

      // Studio Acoustic Walls (U-shape around back and sides)
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(104, 28, 1), wallMat);
      backWall.position.set(0, 14, -51);
      envGroup.add(backWall);

      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 28, 104), wallMat);
      leftWall.position.set(-51, 14, 0);
      envGroup.add(leftWall);

      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 28, 104), wallMat);
      rightWall.position.set(51, 14, 0);
      envGroup.add(rightWall);

      // Overhead Four-Sided Box Truss Lighting Rig (suspended at y=28)
      const trussY = 27;
      const trussBeams = [
        { geo: new THREE.BoxGeometry(80, 0.8, 0.8), pos: [0, trussY, -35] },
        { geo: new THREE.BoxGeometry(80, 0.8, 0.8), pos: [0, trussY, 35] },
        { geo: new THREE.BoxGeometry(0.8, 0.8, 70), pos: [-40, trussY, 0] },
        { geo: new THREE.BoxGeometry(0.8, 0.8, 70), pos: [40, trussY, 0] },
      ];
      trussBeams.forEach((tb) => {
        const beam = new THREE.Mesh(tb.geo, trussMat);
        beam.position.set(tb.pos[0] as number, tb.pos[1] as number, tb.pos[2] as number);
        envGroup.add(beam);
      });

      // Soundstage Stage Door & Illuminated "ON AIR" Sign
      const door = new THREE.Mesh(new THREE.BoxGeometry(8, 14, 0.5), trussMat);
      door.position.set(0, 7, -50.6);
      envGroup.add(door);

      const onAirSign = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 0.4), onAirGlowMat);
      onAirSign.position.set(0, 15.2, -50.4);
      envGroup.add(onAirSign);
    }

    // Ensure all environment objects are on Layer 0 (World objects - visible in Viewfinder)
    setLayerRecursively(envGroup, 0);
  }, [shot.environment]);

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
        actorMeshesRef.current.delete(id);
      }
    });

    shot.actors.forEach((actor, index) => {
      const color = colors[index % colors.length];
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
        mesh.userData.isSelected !== isSelected ||
        mesh.userData.isGhostMode !== isGhostMode ||
        mesh.userData.partGraph !== actor.partGraph;

      if (needsFullRebuild) {
        if (mesh) scene.remove(mesh);
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
          actor.partGraph
        );
        mesh.userData.actorId = actor.id;
        mesh.userData.kind = actorKind;
        mesh.userData.name = actorName;
        mesh.userData.token = actorToken;
        mesh.userData.conceptImageUrl = actor.conceptImageUrl;
        mesh.userData.modelUrl = actor.modelUrl;
        mesh.userData.isSelected = isSelected;
        mesh.userData.isGhostMode = isGhostMode;
        mesh.userData.partGraph = actor.partGraph;

        const pos = getActorPositionAtTime(actor, currentTime);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.lookAt(pos.x, pos.y, pos.z + 10);
        scene.add(mesh);
        actorMeshesRef.current.set(actor.id, mesh);
      }

      // Always apply scale instantaneously
      if (mesh) {
        mesh.scale.set(actorScale, actorScale, actorScale);
      }
    });
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

    if (vfCameraRef.current) {
      vfCameraRef.current.fov = fov;
      vfCameraRef.current.aspect = aspect;
      vfCameraRef.current.updateProjectionMatrix();
    }
  }, [shot.camera.lens.focalLength, shot.aspectRatio]);

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

  // 9. Sync Positions for Camera & Actors at arbitrary time t
  const syncPositions = (t: number) => {
    const camPos = getCameraPositionAtTime(t);

    const lookAtCoord = shot.camera.movement.targetLookAt ?? { x: 50, y: 50 };
    let targetX = (lookAtCoord.x - 50) * 1.0;
    let targetY = lookAtCoord.z !== undefined ? lookAtCoord.z * 0.3 : 6.0;
    let targetZ = (lookAtCoord.y - 50) * 1.0;

    const ratio = duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0;

    if (shot.camera.movement.type === 'pan-left') {
      targetX += (0.5 - ratio) * 35;
    } else if (shot.camera.movement.type === 'pan-right') {
      targetX += (ratio - 0.5) * 35;
    } else if (shot.camera.movement.type === 'tilt-up') {
      targetY += (ratio - 0.5) * 20;
    } else if (shot.camera.movement.type === 'tilt-down') {
      targetY += (0.5 - ratio) * 20;
    } else if (shot.camera.movement.type === 'whip-pan') {
      targetX += Math.sin(ratio * Math.PI) * 45;
    }

    const targetLookAt = new THREE.Vector3(targetX, targetY, targetZ);

    const isDirectlyOverhead = Math.abs(camPos.x - targetX) < 0.01 && Math.abs(camPos.z - targetZ) < 0.01;
    const safeUp = isDirectlyOverhead ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);

    if (cameraGizmoGroupRef.current) {
      cameraGizmoGroupRef.current.position.set(camPos.x, camPos.y, camPos.z);
      cameraGizmoGroupRef.current.up.copy(safeUp);
      cameraGizmoGroupRef.current.lookAt(targetLookAt);
      if (shot.camera.angle === 'dutch-angle') {
        cameraGizmoGroupRef.current.rotateZ(THREE.MathUtils.degToRad(-15));
      }
    }

    if (vfCameraRef.current) {
      vfCameraRef.current.position.set(camPos.x, camPos.y + 1.5, camPos.z);
      vfCameraRef.current.up.copy(safeUp);
      vfCameraRef.current.lookAt(targetLookAt);

      if (shot.camera.angle === 'dutch-angle') {
        vfCameraRef.current.rotateZ(THREE.MathUtils.degToRad(-15));
      }
    }

    shot.actors.forEach((actor, idx) => {
      const mesh = actorMeshesRef.current.get(actor.id);
      if (mesh) {
        const actorPos = getActorPositionAtTime(actor, t);
        const isHuman = !actor.kind || actor.kind === 'human';
        const isActorMode = shot.vfxReference?.enabled && shot.vfxReference?.referenceMode === 'actor-motion';
        const cadenceY = isHuman && isActorMode ? Math.sin(t * 8 + idx * 1.5) * 0.35 : 0;
        mesh.position.set(actorPos.x, actorPos.y + cadenceY, actorPos.z);
        if (typeof mesh.userData.update === 'function') {
          mesh.userData.update(0.016);
        }
        const actorScale = actor.scale ?? 1.0;
        mesh.scale.set(actorScale, actorScale, actorScale);

        const start = actor.trajectory.startPosition;
        const end = actor.trajectory.endPosition;
        const dx = end.x - start.x;
        const dz = end.y - start.y;
        const isMoving = Math.sqrt(dx * dx + dz * dz) > 1.0;

        if (isMoving) {
          mesh.lookAt(actorPos.x + dx, actorPos.y, actorPos.z + dz);
        } else if (isHuman && shot.actors.length === 2) {
          const otherActor = shot.actors[1 - idx];
          if (!otherActor.kind || otherActor.kind === 'human') {
            const otherPos = getActorPositionAtTime(otherActor, t);
            mesh.lookAt(otherPos.x, actorPos.y, otherPos.z);
          }
        }
      }
    });
  };

  useEffect(() => {
    syncPositions(currentTime);
  }, [currentTime, shot, duration]);

  // In-App 3D Previs Video Renderer (Client-side 24 FPS capture)
  const handleRenderInAppPrevis = async (): Promise<{ url: string; blob: Blob } | null> => {
    if (!vfRendererRef.current || !stageSceneRef.current || !vfCameraRef.current) {
      console.warn('Cannot record previs: Three.js viewfinder not ready');
      return null;
    }

    const canvas = vfRendererRef.current.domElement;
    if (!canvas) return null;

    setPrevisRendering(true, 0);

    let mimeType = 'video/webm';
    const candidates = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    if (typeof MediaRecorder !== 'undefined') {
      for (const c of candidates) {
        if (MediaRecorder.isTypeSupported(c)) {
          mimeType = c;
          break;
        }
      }
    }

    try {
      const stream = canvas.captureStream(24);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      const recorderDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
          resolve(blob);
        };
      });

      // Temporarily hide helper gizmos that shouldn't appear in the viewfinder
      if (cameraGizmoGroupRef.current) cameraGizmoGroupRef.current.visible = false;
      if (trajectoryLineRef.current) trajectoryLineRef.current.visible = false;
      if (gridHelperRef.current) gridHelperRef.current.visible = false;

      recorder.start(100);

      const totalFrames = Math.max(24, Math.round(duration * 24));
      const frameIntervalMs = 1000 / 24;

      for (let f = 0; f < totalFrames; f++) {
        const t = (f / Math.max(1, totalFrames - 1)) * duration;
        syncPositions(t);
        vfRendererRef.current.render(stageSceneRef.current, vfCameraRef.current);

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && 'requestFrame' in videoTrack) {
          (videoTrack as any).requestFrame();
        }

        const pct = Math.round(((f + 1) / totalFrames) * 100);
        setPrevisRendering(true, pct);

        await new Promise((r) => setTimeout(r, frameIntervalMs));
      }

      await new Promise((r) => setTimeout(r, 80));

      // Restore gizmos
      if (cameraGizmoGroupRef.current) cameraGizmoGroupRef.current.visible = true;
      if (trajectoryLineRef.current) trajectoryLineRef.current.visible = true;
      if (gridHelperRef.current) gridHelperRef.current.visible = showGrid;

      // Restore positions to current time
      syncPositions(currentTime);

      recorder.stop();
      const blob = await recorderDone;
      const url = URL.createObjectURL(blob);

      setPrevisVideo(url, blob);
      setPrevisRendering(false, 100);
      return { url, blob };
    } catch (err) {
      console.error('In-app previs render failed:', err);
      setPrevisRendering(false, 0);
      return null;
    }
  };

  // Register renderer if this is the viewfinder camera instance
  useEffect(() => {
    if (initialViewMode === 'viewfinder' || viewMode === 'viewfinder') {
      registerPrevisRenderer(handleRenderInAppPrevis);
      return () => {
        registerPrevisRenderer(null);
      };
    }
  }, [initialViewMode, viewMode, duration, shot, currentTime]);

  const handleDownloadPrevis = () => {
    if (!previsVideoUrl) return;
    const a = document.createElement('a');
    a.href = previsVideoUrl;
    a.download = `${shot.name.replace(/\s+/g, '_')}_3D_Previs.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Preset Views for Orbit Controls
  const setOrbitView = (view: 'top' | 'iso' | 'eye') => {
    if (!stageCameraRef.current || !stageControlsRef.current) return;
    if (view === 'top') {
      stageCameraRef.current.position.set(0, 110, 0.1);
    } else if (view === 'iso') {
      stageCameraRef.current.position.set(55, 55, 65);
    } else if (view === 'eye') {
      stageCameraRef.current.position.set(0, 15, 80);
    }
    stageControlsRef.current.target.set(0, 5, 0);
  };

  // Handle Stage Pointer Interactions (Raycasting selection & floor dragging)
  const isPointerDownRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-hud]')) return;
    if (e.button !== 0) return; // Left click only

    const rect = stageMountRef.current?.getBoundingClientRect();
    if (!rect || !stageCameraRef.current || !stageSceneRef.current) return;

    isPointerDownRef.current = true;
    hasDraggedRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };

    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    mouseVecRef.current.set(mouseX, mouseY);
    raycasterRef.current.setFromCamera(mouseVecRef.current, stageCameraRef.current);

    // Raycast against scene objects
    const intersects = raycasterRef.current.intersectObjects(stageSceneRef.current.children, true);

    let clickedActorId: string | null = null;
    let clickedCamera = false;

    for (const hit of intersects) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        if (cur.userData?.actorId) {
          clickedActorId = cur.userData.actorId;
          break;
        }
        if (cur.userData?.isCamera) {
          clickedCamera = true;
          break;
        }
        cur = cur.parent;
      }
      if (clickedActorId || clickedCamera) break;
    }

    if (clickedActorId) {
      setSelectedActorId(clickedActorId);
      setIsFloorDragging(true);
      beginGesture();
      if (stageControlsRef.current) stageControlsRef.current.enabled = false;
    } else if (clickedCamera) {
      setSelectedActorId('__camera__');
      setIsFloorDragging(true);
      beginGesture();
      if (stageControlsRef.current) stageControlsRef.current.enabled = false;
    }
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;

    const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
    const dy = Math.abs(e.clientY - dragStartPosRef.current.y);
    if (dx > 4 || dy > 4) {
      hasDraggedRef.current = true;
    }

    if (!isFloorDragging) return;

    const rect = stageMountRef.current?.getBoundingClientRect();
    if (!rect || !stageCameraRef.current) return;

    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    mouseVecRef.current.set(mouseX, mouseY);
    raycasterRef.current.setFromCamera(mouseVecRef.current, stageCameraRef.current);

    const hitPoint = new THREE.Vector3();
    const hit = raycasterRef.current.ray.intersectPlane(floorPlaneRef.current, hitPoint);
    if (!hit) return;

    // Convert Three.js floor (-50..50) to Stage space (0..100)
    const stageX = Math.round(Math.min(100, Math.max(0, hitPoint.x + 50)));
    const stageY = Math.round(Math.min(100, Math.max(0, hitPoint.z + 50)));

    if (selectedActorId === '__camera__') {
      const curZ = shot.camera.movement.startPosition.z ?? 20;
      updateCameraPositionAtTime(currentTime, { x: stageX, y: stageY, z: curZ }, duration);
    } else if (selectedActorId) {
      const targetActor = shot.actors.find((a) => a.id === selectedActorId);
      if (targetActor) {
        const curZ = targetActor.trajectory.startPosition.z ?? 0;
        updateActorPositionAtTime(selectedActorId, currentTime, { x: stageX, y: stageY, z: curZ }, duration);
      }
    }
  };

  const handleStagePointerUp = () => {
    isPointerDownRef.current = false;
    if (isFloorDragging) {
      setIsFloorDragging(false);
      endGesture();
      if (stageControlsRef.current) stageControlsRef.current.enabled = true;
    }
  };

  const activeActor = shot.actors.find((a) => a.id === selectedActorId);
  const isCameraSelected = selectedActorId === '__camera__';

  return (
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-director-darkest select-none relative min-h-0 min-w-0">
      {/* Top Previs Control Toolbar */}
      {showToolbar && (
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-director-border px-4 glass-panel z-10 font-mono text-xs">
        {/* View Mode Switcher */}
        <div className="flex items-center rounded-lg bg-director-surface p-1 border border-director-border">
          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-all ${
              viewMode === 'split'
                ? 'bg-director-gold text-director-darkest font-bold shadow-glow-gold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Split Director View
          </button>

          <button
            onClick={() => setViewMode('stage')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-all ${
              viewMode === 'stage'
                ? 'bg-director-gold text-director-darkest font-bold shadow-glow-gold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            3D Soundstage
          </button>

          <button
            onClick={() => setViewMode('viewfinder')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-all ${
              viewMode === 'viewfinder'
                ? 'bg-director-cyan text-director-darkest font-bold shadow-glow-cyan'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Director Viewfinder
          </button>
        </div>

        {/* Orbit Angle Quick-Buttons */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <button
            onClick={() => setOrbitView('iso')}
            className="rounded px-2 py-0.5 glass-control text-slate-300 hover:text-white"
          >
            Isometric
          </button>
          <button
            onClick={() => setOrbitView('top')}
            className="rounded px-2 py-0.5 glass-control text-slate-300 hover:text-white"
          >
            Top-Down
          </button>
          <button
            onClick={() => setOrbitView('eye')}
            className="rounded px-2 py-0.5 glass-control text-slate-300 hover:text-white"
          >
            Ground Eye
          </button>

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`flex items-center gap-1 rounded px-2 py-0.5 border ${
              showGrid
                ? 'border-director-gold text-director-gold bg-director-gold/10'
                : 'border-director-border text-slate-500'
            }`}
            title="Toggle Stage Floor Grid"
          >
            <Grid className="h-3 w-3" />
            Grid
          </button>

          <button
            onClick={() => setShowRuleOfThirds(!showRuleOfThirds)}
            className={`rounded px-2 py-0.5 border ${
              showRuleOfThirds
                ? 'border-director-gold text-director-gold bg-director-gold/10'
                : 'border-director-border text-slate-500'
            }`}
            title="Toggle Rule of Thirds Grid"
          >
            3x3 Grid
          </button>
        </div>

        {/* In-App 3D Previs Video Render Actions */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-director-border">
          {isRenderingPrevis ? (
            <div className="flex items-center gap-1.5 rounded px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[10px]">
              <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
              <span>RENDERING PREVIS {previsProgress}%</span>
            </div>
          ) : (
            <button
              onClick={handleRenderInAppPrevis}
              className="flex items-center gap-1.5 rounded px-2.5 py-1 bg-gradient-to-r from-director-gold to-director-amber text-director-darkest font-bold shadow-sm hover:brightness-110 active:scale-95 transition-all text-[10px]"
              title="Render 3D camera viewfinder motion directly in-app at 24fps"
            >
              <Film className="h-3 w-3" />
              <span>Render 3D Previs</span>
            </button>
          )}

          {previsVideoUrl && !isRenderingPrevis && (
            <button
              onClick={handleDownloadPrevis}
              className="flex items-center gap-1 rounded px-2 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 font-mono text-[10px] transition-all"
              title="Download rendered 3D Previs MP4 to your computer"
            >
              <Download className="h-3 w-3" />
              <span>Download MP4</span>
            </button>
          )}
        </div>
        </div>
      )}

      {/* Main Viewports Area */}
      <div className="flex flex-1 h-full w-full min-w-0 min-h-0 overflow-hidden relative">
        {/* Viewport 1: 3D Soundstage Orbit */}
        <div
          ref={stageMountRef}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerUp}
          onPointerLeave={handleStagePointerUp}
          className={`relative h-full min-w-0 min-h-0 overflow-hidden transition-all ${
            isFloorDragging ? 'cursor-grabbing' : 'cursor-grab'
          } ${
            viewMode === 'split' ? 'w-[58%] border-r border-director-border' : viewMode === 'stage' ? 'w-full' : 'hidden'
          }`}
        >
          {/* Watermark Label */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-black/60 backdrop-blur px-2.5 py-1 border border-white/10 font-mono text-[10px] text-slate-300">
            <span className="h-2 w-2 rounded-full bg-director-gold animate-pulse" />
            3D VIRTUAL SOUNDSTAGE (ORBIT VIEW)
          </div>

          {/* Solved VFX Camera Motion Sync Indicator */}
          {shot.vfxReference?.enabled && shot.vfxReference?.solvedCameraMove && (
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg bg-purple-950/80 backdrop-blur px-2.5 py-1 border border-purple-500/40 font-mono text-[10px] text-purple-200 shadow-glow-cyan/20">
              <span className="h-2 w-2 rounded-full bg-director-cyan animate-pulse" />
              <span>VFX SOLVE: {shot.vfxReference.solvedCameraMove.toUpperCase()} SYNCED</span>
            </div>
          )}

          {/* 3D Interactive Floor Drag & Manipulation HUD */}
          {/* 3D Interactive Floor Drag & Manipulation HUD */}
          {(activeActor || isCameraSelected) && (
            isHudMinimized ? (
              <div
                data-hud="true"
                className="absolute bottom-4 left-4 z-20 flex items-center gap-2.5 rounded-xl bg-director-darkest/95 backdrop-blur-md px-3.5 py-2 border border-director-gold/50 shadow-2xl shadow-black/80 text-xs font-mono select-none"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-director-gold/20 text-director-gold border border-director-gold/40">
                    {isCameraSelected ? <Camera className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
                  </span>
                  <div>
                    <div className="font-bold text-white uppercase text-[11px] truncate max-w-[130px]">
                      {isCameraSelected ? 'CAMERA RIG' : activeActor?.name}
                    </div>
                    <div className="text-[9px] text-director-gold/90 font-mono">
                      {(() => {
                        const pos = isCameraSelected
                          ? {
                              x: Math.round(shot.camera.movement.startPosition.x + (shot.camera.movement.endPosition.x - shot.camera.movement.startPosition.x) * (duration > 0 ? currentTime / duration : 0)),
                              y: Math.round(shot.camera.movement.startPosition.y + (shot.camera.movement.endPosition.y - shot.camera.movement.startPosition.y) * (duration > 0 ? currentTime / duration : 0)),
                              z: shot.camera.movement.startPosition.z ?? 20,
                            }
                          : activeActor
                          ? interpolateTrajectoryPosition(activeActor.trajectory, currentTime, duration)
                          : { x: 50, y: 50, z: 0 };
                        return `(${pos.x}%, ${pos.y}%${pos.z !== undefined ? `, ${pos.z}%` : ''})`;
                      })()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-2 border-l border-white/10 pl-2">
                  <button
                    onClick={() => setIsHudMinimized(false)}
                    className="px-2 py-1 rounded bg-director-gold/20 hover:bg-director-gold/30 text-director-gold border border-director-gold/30 text-[10px] font-bold flex items-center gap-1 transition-all"
                    title="Expand HUD Controls"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span>EXPAND</span>
                  </button>
                  <button
                    onClick={() => setSelectedActorId(undefined)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Deselect"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                data-hud="true"
                className="absolute bottom-4 left-4 z-20 flex flex-col gap-2.5 rounded-xl bg-director-darkest/95 backdrop-blur-md p-3.5 border border-director-gold/50 shadow-2xl shadow-black/80 max-w-sm w-80 text-xs font-mono select-none"
              >
                {/* HUD Header */}
                <div className="flex items-center justify-between border-b border-director-border pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-director-gold/20 text-director-gold border border-director-gold/40">
                      {isCameraSelected ? <Camera className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
                    </span>
                    <div>
                      <div className="font-bold text-white uppercase text-[11px] truncate max-w-[140px]">
                        {isCameraSelected ? 'CAMERA RIG' : activeActor?.name}
                      </div>
                      <div className="text-[9px] text-director-amber uppercase">
                        {isCameraSelected ? shot.camera.movement.type : activeActor?.kind || 'OBJECT'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setIsHudMinimized(true)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      title="Minimize HUD"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    {!isCameraSelected && activeActor && (
                      <button
                        onClick={() => {
                          removeActor(activeActor.id);
                          setSelectedActorId(undefined);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete this object"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedActorId(undefined)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      title="Deselect"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Timeline Timecode & Keypoint Sync */}
                <div className="flex flex-col gap-1 bg-director-surface/80 rounded-lg p-1.5 border border-director-border">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-semibold">Timeline Position:</span>
                  <span className="font-mono text-amber-400 font-bold">
                    {currentTime.toFixed(2)}s / {duration.toFixed(1)}s
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      onTimeChange?.(0);
                      setCurrentTime(0);
                    }}
                    className={`flex-1 py-0.5 rounded text-[9px] font-bold transition-all ${
                      currentTime <= 0.15
                        ? 'bg-director-gold text-director-darkest shadow-glow-gold'
                        : 'bg-white/5 text-slate-300 hover:text-white'
                    }`}
                  >
                    ● Start (0s)
                  </button>
                  {currentTime > 0.15 && currentTime < duration - 0.15 && (
                    <span className="flex-1 py-0.5 rounded text-[9px] font-bold text-center bg-blue-600/40 text-blue-300 border border-blue-500/30">
                      ◆ Keyframe ({currentTime.toFixed(1)}s)
                    </span>
                  )}
                  <button
                    onClick={() => {
                      onTimeChange?.(duration);
                      setCurrentTime(duration);
                    }}
                    className={`flex-1 py-0.5 rounded text-[9px] font-bold transition-all ${
                      currentTime >= duration - 0.15
                        ? 'bg-director-cyan text-director-darkest shadow-glow-cyan'
                        : 'bg-white/5 text-slate-300 hover:text-white'
                    }`}
                  >
                    ○ End ({duration.toFixed(0)}s)
                  </button>
                </div>
                {/* Keyframes chips if present for this actor */}
                {activeActor?.trajectory.keyframes && activeActor.trajectory.keyframes.length > 0 && (
                  <div className="flex items-center gap-1 pt-1 border-t border-white/5 overflow-x-auto">
                    <span className="text-[8px] text-slate-500 font-bold shrink-0">CUES:</span>
                    {activeActor.trajectory.keyframes.map((kf) => (
                      <div
                        key={kf.id}
                        className="flex items-center gap-0.5 bg-blue-500/20 border border-blue-500/30 rounded px-1 py-0.2 text-[8px] font-mono text-blue-300 shrink-0"
                      >
                        <button
                          onClick={() => {
                            onTimeChange?.(kf.time);
                            setCurrentTime(kf.time);
                          }}
                          className="hover:underline"
                        >
                          {kf.time.toFixed(1)}s
                        </button>
                        <button
                          onClick={() => removeActorKeyframe(activeActor.id, kf.id)}
                          className="hover:text-rose-400 ml-0.5"
                          title="Remove keyframe"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Position Coordinates & Sliders */}
              {(() => {
                const pos: Point2D = isCameraSelected
                  ? {
                      x: Math.round(shot.camera.movement.startPosition.x + (shot.camera.movement.endPosition.x - shot.camera.movement.startPosition.x) * (duration > 0 ? currentTime / duration : 0)),
                      y: Math.round(shot.camera.movement.startPosition.y + (shot.camera.movement.endPosition.y - shot.camera.movement.startPosition.y) * (duration > 0 ? currentTime / duration : 0)),
                      z: shot.camera.movement.startPosition.z ?? 20,
                    }
                  : activeActor
                  ? interpolateTrajectoryPosition(activeActor.trajectory, currentTime, duration)
                  : { x: 50, y: 50, z: 0 };

                const handleSetPos = (nx: number, ny: number, nz?: number) => {
                  const clampedX = Math.round(Math.min(100, Math.max(0, nx)));
                  const clampedY = Math.round(Math.min(100, Math.max(0, ny)));
                  const targetZ = nz !== undefined ? Math.round(Math.min(100, Math.max(0, nz))) : (pos.z ?? 0);
                  if (isCameraSelected) {
                    updateCameraPositionAtTime(currentTime, { x: clampedX, y: clampedY, z: targetZ }, duration);
                  } else if (activeActor) {
                    updateActorPositionAtTime(activeActor.id, currentTime, { x: clampedX, y: clampedY, z: targetZ }, duration);
                  }
                };

                return (
                  <div className="flex flex-col gap-2">
                    {/* Stage X Slider */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">Lateral (Left ↔ Right):</span>
                        <span className="text-director-gold font-bold">{pos.x}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={pos.x}
                        onPointerDown={() => beginGesture()}
                        onPointerUp={() => endGesture()}
                        onChange={(e) => handleSetPos(Number(e.target.value), pos.y, pos.z)}
                        className="w-full h-1 bg-director-surface rounded appearance-none cursor-pointer accent-director-gold"
                      />
                      <div className="flex justify-between gap-1">
                        <button
                          onClick={() => handleSetPos(25, pos.y, pos.z)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Left (25)
                        </button>
                        <button
                          onClick={() => handleSetPos(50, pos.y, pos.z)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Center (50)
                        </button>
                        <button
                          onClick={() => handleSetPos(75, pos.y, pos.z)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Right (75)
                        </button>
                      </div>
                    </div>

                    {/* Stage Y (Depth) Slider */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">Stage Depth (Deep ↔ Fore):</span>
                        <span className="text-director-cyan font-bold">{pos.y}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={pos.y}
                        onPointerDown={() => beginGesture()}
                        onPointerUp={() => endGesture()}
                        onChange={(e) => handleSetPos(pos.x, Number(e.target.value), pos.z)}
                        className="w-full h-1 bg-director-surface rounded appearance-none cursor-pointer accent-director-cyan"
                      />
                      <div className="flex justify-between gap-1">
                        <button
                          onClick={() => handleSetPos(pos.x, 25, pos.z)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Deep (25)
                        </button>
                        <button
                          onClick={() => handleSetPos(pos.x, 50, pos.z)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Mid (50)
                        </button>
                        <button
                          onClick={() => handleSetPos(pos.x, 75, pos.z)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Fore (75)
                        </button>
                      </div>
                    </div>

                    {/* Stage Elevation / Height (3D Y-Axis: Ground ↔ Sky) Slider */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">Elevation / Height (3D Y-Axis):</span>
                        <span className="text-emerald-400 font-bold">{pos.z ?? 0}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={pos.z ?? 0}
                        onPointerDown={() => beginGesture()}
                        onPointerUp={() => endGesture()}
                        onChange={(e) => handleSetPos(pos.x, pos.y, Number(e.target.value))}
                        className="w-full h-1 bg-director-surface rounded appearance-none cursor-pointer accent-emerald-400"
                      />
                      <div className="flex justify-between gap-1">
                        <button
                          onClick={() => handleSetPos(pos.x, pos.y, 0)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Ground (0)
                        </button>
                        <button
                          onClick={() => handleSetPos(pos.x, pos.y, 10)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Low (10)
                        </button>
                        <button
                          onClick={() => handleSetPos(pos.x, pos.y, 25)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Table (25)
                        </button>
                        <button
                          onClick={() => handleSetPos(pos.x, pos.y, 50)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Mid (50)
                        </button>
                        <button
                          onClick={() => handleSetPos(pos.x, pos.y, 100)}
                          className="flex-1 py-0.5 text-[9px] rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5"
                        >
                          Sky (100)
                        </button>
                      </div>
                    </div>

                    {/* 3D Object Scale Slider & Presets (when an actor is selected) */}
                    {activeActor && (
                      <div className="flex flex-col gap-1 pt-1.5 border-t border-director-border/60">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-300 font-semibold flex items-center gap-1">
                            <Maximize2 className="h-3 w-3 text-cyan-400" />
                            3D Object Scale:
                          </span>
                          <span className="text-cyan-400 font-bold font-mono">
                            {(activeActor.scale ?? 1.0).toFixed(2)}×
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={6.0}
                          step={0.05}
                          value={activeActor.scale ?? 1.0}
                          onChange={(e) => {
                            const newScale = Number(e.target.value);
                            updateActor(activeActor.id, { scale: newScale });
                            const mesh = actorMeshesRef.current.get(activeActor.id);
                            if (mesh) {
                              mesh.scale.set(newScale, newScale, newScale);
                            }
                          }}
                          className="w-full h-1 bg-director-surface rounded appearance-none cursor-pointer accent-cyan-400"
                        />
                        <div className="flex justify-between gap-1">
                          {[
                            { label: '0.25×', val: 0.25 },
                            { label: '0.5×', val: 0.5 },
                            { label: '1.0×', val: 1.0 },
                            { label: '2.0×', val: 2.0 },
                            { label: '4.0×', val: 4.0 },
                          ].map((p) => (
                            <button
                              key={p.val}
                              onClick={() => {
                                updateActor(activeActor.id, { scale: p.val });
                                const mesh = actorMeshesRef.current.get(activeActor.id);
                                if (mesh) {
                                  mesh.scale.set(p.val, p.val, p.val);
                                }
                              }}
                              className={`flex-1 py-0.5 text-[8px] rounded font-mono transition-all ${
                                Math.abs((activeActor.scale ?? 1.0) - p.val) < 0.05
                                  ? 'bg-cyan-600 text-white font-bold'
                                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Drag Hint Footer */}
              <div className="pt-1 border-t border-director-border/60 text-[9px] text-slate-400 leading-tight">
                💡 <strong className="text-director-gold">Direct 3D:</strong> Drag on the floor to position, or click another object.
              </div>
            </div>
          )
        )}
      </div>

        {/* Viewport 2: Director's Through-the-Lens Viewfinder */}
        <div
          ref={viewfinderMountRef}
          className={`relative h-full min-w-0 min-h-0 bg-black flex items-center justify-center overflow-hidden transition-all ${
            viewMode === 'split' ? 'w-[42%]' : viewMode === 'viewfinder' ? 'w-full' : 'hidden'
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
          <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-lg bg-black/70 backdrop-blur px-2.5 py-1 border border-white/10 font-mono text-[10px] text-director-cyan">
            <Camera className="h-3 w-3" />
            THROUGH-THE-LENS • {shot.camera.lens.focalLength} • {shot.aspectRatio}
          </div>

          {/* Video Plate / Canvas Plate Overlay Controls */}
          {(shot.vfxReference?.videoUrl || shot.referenceImage?.previewUrl) && (
            <div className="absolute top-11 left-3 z-20 flex items-center gap-1.5 rounded-lg bg-black/85 backdrop-blur px-2 py-0.5 border border-white/10 font-mono text-[9px]">
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

          {/* Active Reference Mode Watermark in Viewfinder */}
          {shot.vfxReference?.enabled && (
            <div className={`absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg backdrop-blur px-2.5 py-1 font-mono text-[10px] border shadow-lg ${
              shot.vfxReference.referenceMode === 'actor-motion'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                : shot.vfxReference.referenceMode === 'camera-only'
                ? 'bg-amber-950/80 border-director-gold/40 text-director-gold'
                : shot.vfxReference.referenceMode === 'full-scene'
                ? 'bg-cyan-950/80 border-director-cyan/40 text-director-cyan'
                : 'bg-purple-950/80 border-purple-500/40 text-purple-300'
            }`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              <span className="font-bold uppercase tracking-wider">
                {shot.vfxReference.referenceMode === 'actor-motion'
                  ? `ACTOR CHOREOGRAPHY (${shot.actors.length} SUBJECTS)`
                  : shot.vfxReference.referenceMode === 'camera-only'
                  ? 'CAMERA SOLVE (REPLACE SUBJECTS)'
                  : shot.vfxReference.referenceMode === 'full-scene'
                  ? 'FULL SCENE VFX (VOLUMETRIC DEPTH)'
                  : 'OBJECT TRACKING MODE'}
              </span>
            </div>
          )}

          {/* Actor Choreography Brackets in Viewfinder when in Actor Motion Mode */}
          {shot.vfxReference?.enabled && shot.vfxReference.referenceMode === 'actor-motion' && (
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-around px-8">
              {shot.actors.map((actor, idx) => (
                <div key={actor.id} className="flex flex-col items-center gap-1 opacity-80">
                  <div className="h-28 w-20 border-2 border-dashed border-emerald-400/60 rounded-lg flex items-start justify-start p-1 bg-emerald-500/5">
                    <span className="font-mono text-[8px] bg-emerald-900/80 text-emerald-300 px-1 rounded font-bold">
                      ACTOR {idx + 1}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-emerald-300 bg-black/70 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    {actor.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Camera Only Mode Callout */}
          {shot.vfxReference?.enabled && shot.vfxReference.referenceMode === 'camera-only' && (
            <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center pointer-events-none">
              <span className="bg-amber-950/80 text-amber-300 border border-amber-500/40 font-mono text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-lg">
                📷 CAMERA FLIGHT ISOLATED • SUBJECTS WILL BE NEWLY GENERATED
              </span>
            </div>
          )}

          {/* Rule of Thirds Overlay */}
          {showRuleOfThirds && (
            <div className="absolute inset-0 pointer-events-none z-10 grid grid-cols-3 grid-rows-3 border border-white/10">
              <div className="border-r border-b border-white/10" />
              <div className="border-r border-b border-white/10" />
              <div className="border-b border-white/10" />
              <div className="border-r border-b border-white/10" />
              <div className="border-r border-b border-white/10" />
              <div className="border-b border-white/10" />
              <div className="border-r border-white/10" />
              <div className="border-r border-white/10" />
              <div />
            </div>
          )}

          {/* Center Crosshair */}
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center opacity-30">
            <div className="h-6 w-0.5 bg-white" />
            <div className="w-6 h-0.5 bg-white absolute" />
          </div>
        </div>
      </div>

      {/* Bottom 24fps Scrub Transport Bar */}
      {showToolbar && (
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

          {/* Timeline Slider */}
          <div className="flex flex-1 items-center max-w-xl mx-6">
            <input
              type="range"
              min={0}
              max={duration}
              step={0.0416} // 1/24th sec
              value={currentTime}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentTime(parseFloat(e.target.value));
              }}
              className="w-full h-1.5 bg-director-surface rounded-lg appearance-none cursor-pointer accent-director-gold"
            />
          </div>

          {/* Active Trajectory and Actor Badge */}
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
