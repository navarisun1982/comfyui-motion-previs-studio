import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Asset3DItem } from '../stores/useAssetLibraryStore';
import { loadGltfModel } from '../engine/gltfModelLoader';
import { createSubjectMesh } from '../engine/staging/subjectMeshFactory';
import {
  autoRigGltfScene,
  resolveAutoRigType,
  applyPosePreset,
  evaluateGait,
  resetToRestPose,
  setRigOverlayVisible,
  POSE_PRESETS,
  HumanoidRig,
  loadFbxTemplate,
  instantiateMannequinRig,
} from '../engine/kinematics';
import { disposeObject3D } from './stage/stageGizmoHelpers';
import {
  X,
  RotateCw,
  Plus,
  Loader2,
  Eye,
  Maximize2,
  Bone,
  Sparkles,
} from 'lucide-react';

export interface Asset3DPreviewPlacementOptions {
  scale?: number;
  posePreset?: string;
  gait?: 'none' | 'walk' | 'run';
  showBones?: boolean;
}

interface Asset3DPreviewInspectorProps {
  asset: Asset3DItem;
  onClose: () => void;
  onPlaceOnStage: (asset: Asset3DItem, options?: Asset3DPreviewPlacementOptions) => void;
}

type ShadingMode = 'pbr' | 'wireframe' | 'clay';

const HUMANOID_PREVIEW_POSES: {
  id: string;
  label: string;
  gait?: 'walk' | 'run';
  posePreset?: string;
}[] = [
  { id: 'neutral-stand', label: '🧍 Neutral Stand', posePreset: 'neutral-stand' },
  { id: 'walk-cycle', label: '🚶 Walk Cycle', gait: 'walk' },
  { id: 'run-cycle', label: '🏃 Run Cycle', gait: 'run' },
  { id: 'combat-ready', label: '⚔️ Combat Ready', posePreset: 'combat-ready' },
  { id: 'aim-pistol', label: '🔫 Aim Pistol', posePreset: 'aim-pistol' },
  { id: 'sitting-chair', label: '🪑 Sitting', posePreset: 'sitting-chair' },
  { id: 'hero-kneel', label: '🧎 Hero Kneel', posePreset: 'hero-kneel' },
  { id: 'dialogue-gesturing', label: '💬 Dialogue', posePreset: 'dialogue-gesturing' },
];

export const Asset3DPreviewInspector: React.FC<Asset3DPreviewInspectorProps> = ({
  asset,
  onClose,
  onPlaceOnStage,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(true);
  const [shadingMode, setShadingMode] = useState<ShadingMode>('pbr');
  const [showBones, setShowBones] = useState<boolean>(false);
  const [previewScale, setPreviewScale] = useState<number>(asset.scale || 1.0);
  const [activePoseId, setActivePoseId] = useState<string>('neutral-stand');
  const [stats, setStats] = useState<{
    meshes: number;
    triangles: number;
    vertices: number;
    width: number;
    height: number;
    depth: number;
    rigType: string;
  }>({
    meshes: 0,
    triangles: 0,
    vertices: 0,
    width: 0,
    height: 0,
    depth: 0,
    rigType: asset.rigType || 'none',
  });

  // Refs for live Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const subjectRootRef = useRef<THREE.Group | null>(null);
  const activeRigRef = useRef<HumanoidRig | null>(null);
  const activeMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const activePoseIdRef = useRef<string>(activePoseId);
  const isAutoRotateRef = useRef<boolean>(isAutoRotate);

  useEffect(() => {
    activePoseIdRef.current = activePoseId;
  }, [activePoseId]);

  useEffect(() => {
    isAutoRotateRef.current = isAutoRotate;
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAutoRotate;
    }
  }, [isAutoRotate]);

  // Reset per-asset state when switching assets
  useEffect(() => {
    setPreviewScale(asset.scale || 1.0);
    setActivePoseId('neutral-stand');
    setShadingMode('pbr');
    setShowBones(false);
  }, [asset.id, asset.scale]);

  // Initialize Three.js Viewport & Load Selected Asset
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    setIsLoading(true);
    setLoadError(null);

    const width = Math.max(260, container.clientWidth || 340);
    const height = Math.max(240, container.clientHeight || 300);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 200);
    camera.position.set(3.4, 2.4, 4.6);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer | null = null;
    let pmremGenerator: THREE.PMREMGenerator | null = null;
    let envTarget: THREE.WebGLRenderTarget | null = null;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      pmremGenerator = new THREE.PMREMGenerator(renderer);
      envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envTarget.texture;
    } catch (err) {
      console.warn('WebGL preview renderer fallback:', err);
      setLoadError('WebGL context unavailable in this environment.');
      setIsLoading(false);
      return;
    }

    // Studio 3-Point Lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.85);
    hemiLight.position.set(0, 12, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
    keyLight.position.set(6, 10, 7);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    fillLight.position.set(-6, 5, -4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf59e0b, 1.1);
    rimLight.position.set(0, 6, -8);
    scene.add(rimLight);

    // Turntable Pedestal & Grid
    const pedestalGroup = new THREE.Group();
    pedestalGroup.name = '__preview_pedestal__';
    const grid = new THREE.GridHelper(8, 16, 0x3b82f6, 0x1e293b);
    grid.position.y = 0.002;
    pedestalGroup.add(grid);

    const ringGeo = new THREE.RingGeometry(1.55, 1.62, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.005;
    pedestalGroup.add(ringMesh);
    scene.add(pedestalGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = isAutoRotateRef.current;
    controls.autoRotateSpeed = 2.2;
    controls.minDistance = 0.6;
    controls.maxDistance = 30;
    controls.target.set(0, 1.1, 0);
    controls.update();
    controlsRef.current = controls;

    const subjectHolder = new THREE.Group();
    subjectHolder.name = '__preview_subject_holder__';
    scene.add(subjectHolder);
    subjectRootRef.current = subjectHolder;

    const frameObjectInCamera = (obj: THREE.Object3D) => {
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;

      const center = box.getCenter(new THREE.Vector3());
      obj.position.x -= center.x;
      obj.position.z -= center.z;
      obj.position.y -= box.min.y;
      obj.updateMatrixWorld(true);

      const groundedBox = new THREE.Box3().setFromObject(obj);
      const groundedSize = groundedBox.getSize(new THREE.Vector3());
      const groundedCenter = groundedBox.getCenter(new THREE.Vector3());

      const maxDim = Math.max(0.5, groundedSize.x, groundedSize.y, groundedSize.z);
      const fovRad = THREE.MathUtils.degToRad(camera.fov);
      const idealDist = Math.max(2.2, (maxDim / (2 * Math.tan(fovRad / 2))) * 1.35);

      controls.target.set(0, groundedCenter.y, 0);
      camera.position.set(
        idealDist * 0.72,
        groundedCenter.y + idealDist * 0.36,
        idealDist * 0.92
      );
      controls.update();

      // Update ring radius to match object footprint
      const footRadius = Math.max(1.1, Math.max(groundedSize.x, groundedSize.z) * 0.65);
      ringMesh.scale.setScalar(footRadius / 1.6);

      // Compute mesh/triangle/vertex telemetry
      let meshCount = 0;
      let triCount = 0;
      let vertCount = 0;
      originalMaterialsRef.current.clear();

      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          if (m.name.startsWith('__') || m.userData?.isRigOverlay) return;
          meshCount += 1;
          originalMaterialsRef.current.set(m, m.material);
          const geom = m.geometry;
          if (geom) {
            const posAttr = geom.getAttribute('position');
            if (posAttr) {
              vertCount += posAttr.count;
              if (geom.index) {
                triCount += Math.round(geom.index.count / 3);
              } else {
                triCount += Math.round(posAttr.count / 3);
              }
            }
          }
        }
      });

      setStats({
        meshes: meshCount,
        triangles: triCount,
        vertices: vertCount,
        width: Number(groundedSize.x.toFixed(2)),
        height: Number(groundedSize.y.toFixed(2)),
        depth: Number(groundedSize.z.toFixed(2)),
        rigType: activeRigRef.current ? 'humanoid (19-bone IK/FK)' : asset.rigType || 'static-glb',
      });
    };

    const mountLoadedScene = (sceneRoot: THREE.Group, animations?: THREE.AnimationClip[]) => {
      if (disposed) return;
      subjectHolder.clear();
      activeRigRef.current = null;
      activeMixerRef.current = null;

      // Normalize scale to stage-friendly size (~2.8–4.5m) for comfortable inspection
      sceneRoot.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(sceneRoot);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const resolvedRigType = resolveAutoRigType(sceneRoot, {
        rigType: asset.rigType,
        categoryHint: asset.kind,
        nameHint: asset.name,
        promptHint: asset.tokenPrompt,
      });

      const targetSpan =
        resolvedRigType === 'humanoid'
          ? 3.6
          : resolvedRigType === 'quadruped'
          ? 2.8
          : 2.6;
      const maxRaw = Math.max(0.1, rawSize.x, rawSize.y, rawSize.z);
      const normScale = targetSpan / maxRaw;
      sceneRoot.scale.multiplyScalar(normScale);
      sceneRoot.updateMatrixWorld(true);

      // Run auto-rigging if humanoid or quadruped
      try {
        const autoRes = autoRigGltfScene(sceneRoot, {
          rigType: resolvedRigType,
          categoryHint: asset.kind,
          nameHint: asset.name,
          promptHint: asset.tokenPrompt,
          showBones: false,
        });
        if (autoRes.rig) {
          activeRigRef.current = autoRes.rig;
          applyPosePreset(autoRes.rig, 'neutral-stand');
        }
      } catch {
        // Ignore auto-rig fallback on static props
      }

      if (!activeRigRef.current && animations && animations.length > 0) {
        const mixer = new THREE.AnimationMixer(sceneRoot);
        mixer.clipAction(animations[0]).play();
        activeMixerRef.current = mixer;
      }

      subjectHolder.add(sceneRoot);
      frameObjectInCamera(sceneRoot);
      setIsLoading(false);
    };

    const modelUri = asset.modelUrl || (asset.modelId ? `model://${asset.modelId}` : undefined);

    if (modelUri && /\.fbx(\?|$)/i.test(modelUri)) {
      loadFbxTemplate(modelUri)
        .then((tpl) => {
          if (disposed) return;
          const isFemale = /x-bot|female|actress|woman|girl/i.test(`${asset.name} ${modelUri}`);
          const fbxRig = instantiateMannequinRig(tpl, {
            height: 3.6,
            tint: isFemale ? '#f472b6' : '#7dd3fc',
          });
          activeRigRef.current = fbxRig;
          applyPosePreset(fbxRig, 'neutral-stand');
          subjectHolder.add(fbxRig.root);
          frameObjectInCamera(fbxRig.root);
          setIsLoading(false);
        })
        .catch((err) => {
          if (disposed) return;
          console.warn('FBX preview load fallback to procedural mesh:', err);
          const fallbackGroup = createSubjectMesh({
            name: asset.name,
            kind: asset.kind,
            tokenPrompt: asset.tokenPrompt,
            showLabels: false,
          });
          if (fallbackGroup.userData.rig) {
            activeRigRef.current = fallbackGroup.userData.rig;
          }
          subjectHolder.add(fallbackGroup);
          frameObjectInCamera(fallbackGroup);
          setIsLoading(false);
        });
    } else if (modelUri) {
      loadGltfModel(modelUri)
        .then((res) => {
          if (disposed) return;
          mountLoadedScene(res.scene, res.animations);
        })
        .catch((err) => {
          if (disposed) return;
          console.warn('GLB preview load fallback to procedural mesh:', err);
          const fallbackGroup = createSubjectMesh({
            name: asset.name,
            kind: asset.kind,
            tokenPrompt: asset.tokenPrompt,
            showLabels: false,
          });
          if (fallbackGroup.userData.rig) {
            activeRigRef.current = fallbackGroup.userData.rig;
          }
          subjectHolder.add(fallbackGroup);
          frameObjectInCamera(fallbackGroup);
          setIsLoading(false);
        });
    } else {
      // Posable 19-Bone Director Rig or procedural asset
      const builtGroup = createSubjectMesh({
        name: asset.name,
        kind: asset.kind,
        tokenPrompt: asset.tokenPrompt,
        showLabels: false,
      });
      // Remove stage ring/hit-proxy so only the clean 3D character/object sits on the turntable
      const toRemove: THREE.Object3D[] = [];
      builtGroup.children.forEach((ch) => {
        if (
          ch.name === '__actor_hit_proxy__' ||
          ch instanceof THREE.Sprite ||
          (ch as THREE.Mesh).geometry instanceof THREE.RingGeometry
        ) {
          toRemove.push(ch);
        }
      });
      toRemove.forEach((ch) => builtGroup.remove(ch));

      if (builtGroup.userData.rig) {
        activeRigRef.current = builtGroup.userData.rig;
      }
      subjectHolder.add(builtGroup);
      frameObjectInCamera(builtGroup);
      setIsLoading(false);
    }

    // ResizeObserver for responsive viewport
    const resizeObs = new ResizeObserver((entries) => {
      if (disposed || !renderer) return;
      for (const entry of entries) {
        const w = Math.max(220, Math.floor(entry.contentRect.width));
        const h = Math.max(220, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObs.observe(container);

    // 60 FPS Animation Loop
    const clock = new THREE.Clock();
    let animFrameId = 0;

    const animate = () => {
      if (disposed || !renderer) return;
      animFrameId = window.requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      if (activeMixerRef.current) {
        activeMixerRef.current.update(dt);
      }

      const rig = activeRigRef.current;
      const poseId = activePoseIdRef.current;
      if (rig) {
        if (poseId === 'walk-cycle' || poseId === 'run-cycle') {
          resetToRestPose(rig);
          evaluateGait(rig, elapsed, {
            gait: poseId === 'run-cycle' ? 'run' : 'walk',
            speed: poseId === 'run-cycle' ? 4.2 : 1.7,
          });
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animFrameId = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animFrameId);
      resizeObs.disconnect();
      controls.dispose();
      disposeObject3D(scene);
      envTarget?.dispose();
      pmremGenerator?.dispose();
      renderer?.dispose();
    };
  }, [asset]);

  // Apply Shading Mode (PBR / Wireframe / Clay)
  useEffect(() => {
    const holder = subjectRootRef.current;
    if (!holder) return;

    const clayMat = new THREE.MeshStandardMaterial({
      color: 0xd6d3cd,
      roughness: 0.55,
      metalness: 0.08,
    });

    originalMaterialsRef.current.forEach((origMat, mesh) => {
      if (shadingMode === 'pbr') {
        mesh.material = origMat;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m: any) => {
            if ('wireframe' in m) m.wireframe = false;
          });
        } else if (mesh.material && 'wireframe' in mesh.material) {
          (mesh.material as any).wireframe = false;
        }
      } else if (shadingMode === 'wireframe') {
        mesh.material = origMat;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m: any) => {
            if ('wireframe' in m) m.wireframe = true;
          });
        } else if (mesh.material && 'wireframe' in mesh.material) {
          (mesh.material as any).wireframe = true;
        }
      } else if (shadingMode === 'clay') {
        mesh.material = clayMat;
      }
    });

    return () => {
      clayMat.dispose();
    };
  }, [shadingMode, isLoading]);

  // Apply Scale Multiplier Live on Pedestal
  useEffect(() => {
    const holder = subjectRootRef.current;
    if (!holder) return;
    holder.scale.setScalar(previewScale);
  }, [previewScale]);

  // Apply Show Bones Overlay
  useEffect(() => {
    const holder = subjectRootRef.current;
    if (!holder) return;
    setRigOverlayVisible(holder, showBones);
  }, [showBones, isLoading]);

  // Apply Static Pose Preset when user clicks a Pose button
  const handleSelectPose = (poseOption: (typeof HUMANOID_PREVIEW_POSES)[number]) => {
    setActivePoseId(poseOption.id);
    const rig = activeRigRef.current;
    if (!rig) return;
    resetToRestPose(rig);
    if (poseOption.posePreset && POSE_PRESETS[poseOption.posePreset]) {
      applyPosePreset(rig, poseOption.posePreset);
    }
  };

  const handleResetCamera = () => {
    const holder = subjectRootRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!holder || !camera || !controls) return;
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(0.5, size.x, size.y, size.z);
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const idealDist = Math.max(2.2, (maxDim / (2 * Math.tan(fovRad / 2))) * 1.35);
    controls.target.set(0, center.y, 0);
    camera.position.set(idealDist * 0.72, center.y + idealDist * 0.36, idealDist * 0.92);
    controls.update();
  };

  const isHumanoidCapable =
    asset.category === 'character' ||
    asset.rigType === 'humanoid' ||
    Boolean(activeRigRef.current);

  const selectedPoseConfig = HUMANOID_PREVIEW_POSES.find((p) => p.id === activePoseId);

  return (
    <aside className="flex w-full sm:w-[350px] md:w-[380px] shrink-0 flex-col border-l border-white/10 bg-[#0b0e17] text-slate-100 select-none">
      {/* Inspector Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 bg-[#101422]">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white truncate" title={asset.name}>
              {asset.name}
            </h3>
            <p className="text-[10px] font-mono text-cyan-300/90 truncate">
              360° Interactive 3D Preview • {asset.category.toUpperCase()}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close 3D Preview Inspector"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-300 hover:bg-rose-500/25 hover:border-rose-400/50 hover:text-white transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Interactive 3D WebGL Canvas */}
      <div className="relative flex-1 min-h-[250px] bg-[#090d16] overflow-hidden">
        <div
          ref={mountRef}
          className="h-full w-full cursor-grab active:cursor-grabbing"
          title="Drag with Left-Click to Orbit 360° • Scroll to Zoom • Right-Click to Pan"
        />

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 backdrop-blur-xs text-xs font-mono text-cyan-300">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
            <span>Loading 3D Mesh &amp; Textures...</span>
          </div>
        )}

        {loadError && (
          <div className="absolute inset-x-3 bottom-3 rounded-lg border border-amber-500/40 bg-amber-950/80 px-3 py-2 text-[11px] font-mono text-amber-200">
            {loadError}
          </div>
        )}

        {/* Top-Left Viewport Controls Overlay */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsAutoRotate((v) => !v)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-mono font-bold border transition-all cursor-pointer ${
              isAutoRotate
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm'
                : 'bg-black/65 border-white/15 text-slate-300 hover:text-white'
            }`}
            title="Toggle 360° Turntable Auto-Rotation"
          >
            <RotateCw className={`h-3 w-3 ${isAutoRotate ? 'animate-spin' : ''}`} />
            <span>Turntable</span>
          </button>

          <button
            type="button"
            onClick={handleResetCamera}
            className="flex items-center gap-1 rounded-lg bg-black/65 hover:bg-black/85 border border-white/15 px-2 py-1 text-[10px] font-mono text-slate-300 hover:text-white cursor-pointer"
            title="Reset Camera Framing"
          >
            <Maximize2 className="h-3 w-3" />
            <span>Center</span>
          </button>

          {isHumanoidCapable && (
            <button
              type="button"
              onClick={() => setShowBones((v) => !v)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                showBones
                  ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                  : 'bg-black/65 border-white/15 text-slate-300 hover:text-white'
              }`}
              title="Toggle 3D Skeleton Bones Overlay"
            >
              <Bone className="h-3 w-3" />
              <span>Bones</span>
            </button>
          )}
        </div>

        {/* Top-Right Shading Mode Switcher */}
        <div className="absolute top-2.5 right-2.5 flex items-center rounded-lg border border-white/15 bg-black/70 p-0.5 font-mono text-[9.5px]">
          {(
            [
              { id: 'pbr', label: 'PBR' },
              { id: 'wireframe', label: 'Wire' },
              { id: 'clay', label: 'Clay' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setShadingMode(mode.id)}
              className={`rounded-md px-2 py-0.5 font-bold transition-all cursor-pointer ${
                shadingMode === mode.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Bottom-Left Mouse Hint */}
        <div className="pointer-events-none absolute bottom-2 left-2.5 rounded bg-black/60 px-2 py-0.5 font-mono text-[9.5px] text-slate-300 border border-white/10">
          🖱️ Drag: Orbit 360° • Scroll: Zoom • Right-Drag: Pan
        </div>
      </div>

      {/* Telemetry & Controls Section */}
      <div className="space-y-3 border-t border-white/10 p-3.5 bg-[#0d111c] text-xs overflow-y-auto max-h-[42vh]">
        {/* Geometry & Dimensions Readout */}
        <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-black/40 p-2 font-mono text-[10px]">
          <div>
            <span className="text-slate-500 block">TRIANGLES</span>
            <strong className="text-emerald-300">{stats.triangles.toLocaleString()}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">MESH PARTS</span>
            <strong className="text-cyan-300">{stats.meshes}</strong>
          </div>
          <div>
            <span className="text-slate-500 block">DIMENSIONS</span>
            <strong className="text-amber-300">
              {stats.width}×{stats.height}×{stats.depth}m
            </strong>
          </div>
        </div>

        {/* Scale Adjustment before Placing */}
        <div className="space-y-1">
          <div className="flex items-center justify-between font-mono text-[10.5px]">
            <span className="text-slate-300 font-semibold">Initial Stage Scale</span>
            <span className="text-cyan-300 font-bold">{previewScale.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min={0.4}
            max={2.5}
            step={0.05}
            value={previewScale}
            onChange={(e) => setPreviewScale(parseFloat(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-black/60 rounded-lg"
          />
        </div>

        {/* Pose & Gait Tester (For Characters / Rigged Models) */}
        {isHumanoidCapable && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between font-mono text-[10.5px]">
              <span className="text-amber-300 font-semibold flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                <span>Test Pose / Motion Before Placing</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {HUMANOID_PREVIEW_POSES.map((pose) => (
                <button
                  key={pose.id}
                  type="button"
                  onClick={() => handleSelectPose(pose)}
                  className={`rounded-lg border px-2 py-1 text-left font-mono text-[10px] transition-all cursor-pointer truncate ${
                    activePoseId === pose.id
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {pose.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Primary CTA: Place on Stage */}
        <div className="pt-1">
          <button
            type="button"
            title={`Place "${asset.name}" on 3D Stage`}
            onClick={() =>
              onPlaceOnStage(asset, {
                scale: previewScale,
                posePreset: selectedPoseConfig?.posePreset,
                gait: selectedPoseConfig?.gait || 'none',
                showBones,
              })
            }
            className="w-full max-w-full overflow-hidden flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600 hover:brightness-110 py-2.5 px-3 text-xs font-bold font-mono text-white shadow-lg shadow-cyan-500/25 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0 stroke-[3]" />
            <span className="truncate min-w-0">
              Place &ldquo;{asset.name}&rdquo; on 3D Stage
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
};

