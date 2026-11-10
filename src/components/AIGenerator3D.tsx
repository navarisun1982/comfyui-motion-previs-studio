import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import {
  Sparkles,
  Upload,
  X,
  Check,
  Loader2,
  Box,
  Download,
  Zap,
  Settings,
  AlertTriangle,
  Dice5,
  RotateCw,
  FileCode,
  Lock,
  Plus,
  Square,
} from 'lucide-react';
import { ReasonerSettingsPanel } from './ReasonerSettingsPanel';
import { BundledWorkflowsModal } from './BundledWorkflowsModal';
import { useShotStore } from '../stores/useShotStore';
import { useAssetLibraryStore } from '../stores/useAssetLibraryStore';
import { useComfyStore } from '../stores/useComfyStore';
import { loadGltfModel } from '../engine/gltfModelLoader';
import {
  autoRigGltfScene,
  setRigOverlayVisible,
  AutoRigType,
  AutoRigResult,
  RigLandmarks,
  evaluateGait,
  evaluateReadyMadeHumanoidClip,
  evaluateReadyMadeObjectClip,
  resetToRestPose,
  isUuidOrNoiseName,
  inferSubjectCategoryAndCleanName,
} from '../engine/kinematics';
import { ActorPose } from '../types/shotspec';
import { HumanoidBone } from '../engine/procedural3D/sculptSpec';
import {
  Comfy3DEngineMode,
  Comfy3DQualityMode,
  Comfy3DGenerationMode,
  Comfy3DGenerationResult,
  format3DStudioTextPrompt,
  generate3DGlbInComfy,
  cancelActive3DGeneration,
  fetchLatestCompleted3DGlbFromComfyHistory,
} from '../services/comfy3dGenerator';
import {
  ensure3DWorkflowsSyncedToComfyUI,
} from '../pipeline/customWorkflowResolver';

export interface AIGenerator3DProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialImageUrl?: string;
  targetActorId?: string;
  initialMode?: Comfy3DGenerationMode;
  onApplyToScene?: (actorId: string) => void;
}

export const AIGenerator3D: React.FC<AIGenerator3DProps> = ({
  isOpen,
  onClose,
  initialPrompt = '',
  initialImageUrl,
  targetActorId,
  initialMode,
  onApplyToScene,
}) => {
  const addActor = useShotStore((s) => s.addActor);
  const updateActor = useShotStore((s) => s.updateActor);
  const setSelectedActorId = useShotStore((s) => s.setSelectedActorId);
  const saveGeneratedGlbToLibrary = useAssetLibraryStore((s) => s.saveGeneratedGlbToLibrary);
  const closeLibrary = useAssetLibraryStore((s) => s.closeLibrary);
  const comfyStatus = useComfyStore((s) => s.connectionStatus);
  const comfyStats = useComfyStore((s) => s.systemStats);

  // Unified Mode Switcher: Image-to-3D (#aa77013b) vs Text-to-3D (#e7a9555b)
  const [generationMode, setGenerationMode] = useState<Comfy3DGenerationMode>(
    initialMode || (initialPrompt && !initialImageUrl ? 'text-to-3d' : 'image-to-3d')
  );
  const [textPrompt, setTextPrompt] = useState<string>(initialPrompt || '');

  // Input & Actor Metadata
  const initialInferred = inferSubjectCategoryAndCleanName(initialPrompt, 'human');
  const [actorName, setActorName] = useState(
    initialPrompt && !initialInferred.isNoiseOrUuid ? initialInferred.cleanName : 'Hero Character'
  );
  const [actorCategory, setActorCategory] = useState<'human' | 'creature' | 'prop'>(
    initialPrompt && !initialInferred.isNoiseOrUuid ? initialInferred.category : 'human'
  );
  const userManuallySelectedCategoryRef = useRef<boolean>(false);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(initialImageUrl || null);
  const [showWorkflowsPackModal, setShowWorkflowsPackModal] = useState<boolean>(false);

  // ComfyUI 3D Workflow Controls (#aa77013b-18f1-4679-9678-6d455d3536c5)
  const [engineMode, setEngineMode] = useState<Comfy3DEngineMode>('pixal3d');
  const [qualityMode, setQualityMode] = useState<Comfy3DQualityMode>('fast_vertex');
  const [removeBackground, setRemoveBackground] = useState<boolean>(true);
  const [textureResolution, setTextureResolution] = useState<1024 | 2048 | 4096>(2048);
  const [seed, setSeed] = useState<number>(42);

  // Custom Local 3D Workflow URL / .JSON
  const [workflowSource] = useState<'builtin' | 'custom'>('builtin');
  const [customWorkflowJson] = useState<string>('');
  const [customWorkflowLabel] = useState<string>('');

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState('');
  const [stepProgress, setStepProgress] = useState<{ step: number; maxSteps: number } | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Generated .GLB Result & Viewport Controls
  const [generatedResult, setGeneratedResult] = useState<Comfy3DGenerationResult | null>(null);
  const [previewUnlocked, setPreviewUnlocked] = useState(false);
  const [isWireframe, setIsWireframe] = useState(false);
  const [autoSpin, setAutoSpin] = useState(true);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [savedLibrarySuccess, setSavedLibrarySuccess] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Automatic Bone Rigging & Live Motion Preview Controls
  const [rigType, setRigType] = useState<AutoRigType>('auto');
  const [showBones, setShowBones] = useState<boolean>(true);
  const [previewMotion, setPreviewMotion] = useState<
    'bind' | 'idle' | 'walk' | 'run' | 'wave' | 'fight'
  >('bind');
  const [showLandmarkEditor, setShowLandmarkEditor] = useState<boolean>(false);
  const [showBonePoseEditor, setShowBonePoseEditor] = useState<boolean>(false);
  const [selectedPreviewBone, setSelectedPreviewBone] = useState<HumanoidBone>('RightArm');
  const [customBonePose, setCustomBonePose] = useState<
    Partial<Record<HumanoidBone, [number, number, number]>>
  >({});
  const [rigInfo, setRigInfo] = useState<AutoRigResult | null>(null);
  const [customLandmarks, setCustomLandmarks] = useState<Partial<RigLandmarks> | null>(null);

  const previewMotionRef = useRef(previewMotion);
  previewMotionRef.current = previewMotion;
  const showBonesRef = useRef(showBones);
  showBonesRef.current = showBones;
  const customBonePoseRef = useRef<Partial<Record<HumanoidBone, [number, number, number]>>>(
    customBonePose
  );
  customBonePoseRef.current = customBonePose;
  const draggingPreviewBoneRef = useRef<HumanoidBone | null>(null);
  const loadedSceneRef = useRef<THREE.Group | null>(null);

  // 3D Canvas Mount Ref
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const orbitRef = useRef({ theta: 0.35, phi: 1.25, radius: 3.4 });
  const targetLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.9, 0));
  const updateCameraRef = useRef<(() => void) | null>(null);
  const autoSpinRef = useRef<boolean>(autoSpin);
  autoSpinRef.current = autoSpin;

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialMode) {
      setGenerationMode(initialMode);
    } else if (initialPrompt && !initialImageUrl) {
      setGenerationMode('text-to-3d');
    } else if (initialImageUrl) {
      setGenerationMode('image-to-3d');
    }
    if (initialPrompt) {
      setTextPrompt(initialPrompt);
      const inferred = inferSubjectCategoryAndCleanName(initialPrompt, actorCategory);
      if (!userManuallySelectedCategoryRef.current && !inferred.isNoiseOrUuid) {
        setActorCategory(inferred.category);
      }
      if (!actorName || actorName === 'Hero Character' || isUuidOrNoiseName(actorName)) {
        setActorName(inferred.cleanName);
      }
    } else if (isUuidOrNoiseName(actorName)) {
      setActorName(
        actorCategory === 'prop'
          ? '3D Object'
          : actorCategory === 'creature'
          ? '3D Creature'
          : 'Hero Character'
      );
    }
    setReferenceImageUrl(initialImageUrl || null);
  }, [initialPrompt, initialImageUrl, initialMode, targetActorId]);

  // Automatically sync both 3D workflows (Image-to-3D & Text-to-3D) to ComfyUI whenever 3D Studio is opened or mode switches
  useEffect(() => {
    if (!isOpen) return;
    void ensure3DWorkflowsSyncedToComfyUI(
      workflowSource === 'custom' && customWorkflowJson
        ? { filename: customWorkflowLabel || 'Custom_3D_Studio_Workflow.json', rawJson: customWorkflowJson }
        : undefined
    );
  }, [isOpen, generationMode, workflowSource, customWorkflowJson, customWorkflowLabel]);

  // Elapsed timer during generation
  useEffect(() => {
    if (!isGenerating) return;
    const started = Date.now();
    setElapsedSec(0);
    const interval = window.setInterval(() => {
      setElapsedSec(Math.round((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(interval);
  }, [isGenerating]);

  const isUuidOrNoiseFilename = (raw: string): boolean => isUuidOrNoiseName(raw);

  const applyUploadedImageFile = (file: File) => {
    const inferred = inferSubjectCategoryAndCleanName(file.name, actorCategory);
    if (!userManuallySelectedCategoryRef.current && !inferred.isNoiseOrUuid) {
      setActorCategory(inferred.category);
    }
    if (
      !actorName ||
      actorName === 'Hero Character' ||
      actorName === '3D Object' ||
      actorName === '3D Creature' ||
      isUuidOrNoiseFilename(actorName)
    ) {
      setActorName(inferred.cleanName);
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReferenceImageUrl(reader.result as string);
      setGenerationError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;
    applyUploadedImageFile(file);
    e.target.value = '';
  };

  // Initialize Three.js interactive preview ONLY when a generated .GLB is ready
  // (avoids allocating a second WebGL context while uploading images or while ComfyUI is using the GPU)
  useEffect(() => {
    if (!isOpen || !generatedResult?.blobUrl || !canvasMountRef.current) return;

    const container = canvasMountRef.current;
    const w = container.clientWidth || 480;
    const h = container.clientHeight || 420;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'default',
      });
    } catch (err) {
      console.warn('Could not initialize 3D preview WebGLRenderer:', err);
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090c14);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 1000);
    camera.layers.enable(0);
    camera.layers.enable(1);
    cameraRef.current = camera;

    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);

    // Studio Lighting for PBR & Vertex-Colored GLB Models
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 0.9);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff5ea, 2.4);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 1.4);
    rimLight.position.set(-6, 4, -5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xa855f7, 0.8);
    fillLight.position.set(0, -4, 4);
    scene.add(fillLight);

    // Ground Grid
    const grid = new THREE.GridHelper(10, 20, 0x06b6d4, 0x1e293b);
    grid.position.y = 0;
    scene.add(grid);

    // Model Group
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // Camera update helper
    const updateCamera = () => {
      const { theta, phi, radius } = orbitRef.current;
      const target = targetLookAtRef.current;
      const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
      const y = target.y + radius * Math.cos(phi);
      const z = target.z + radius * Math.sin(phi) * Math.cos(theta);
      camera.position.set(x, Math.max(0.15, y), z);
      camera.lookAt(target);
    };
    updateCameraRef.current = updateCamera;
    updateCamera();

    // Load generated .GLB mesh into the scene and run automatic bone rigging
    let cancelled = false;
    loadGltfModel(generatedResult.blobUrl)
      .then((loaded) => {
        if (cancelled) return;
        loaded.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
              if (m && 'wireframe' in m) {
                (m as any).wireframe = isWireframe;
              }
            }
          }
        });
        modelGroup.add(loaded.scene);
        loadedSceneRef.current = loaded.scene;

        loaded.scene.updateMatrixWorld(true);
        const size = loaded.size || new THREE.Vector3(1.0, 2.0, 1.0);
        const center = loaded.center || new THREE.Vector3(0, 1.0, 0);
        const maxDim = THREE.MathUtils.clamp(Math.max(size.x, size.y, size.z, 1.8), 1.6, 3.6);
        orbitRef.current.radius = maxDim * 1.55;
        targetLookAtRef.current.set(
          THREE.MathUtils.clamp(center.x, -1.0, 1.0),
          THREE.MathUtils.clamp(center.y, 0.75, 1.35),
          THREE.MathUtils.clamp(center.z, -1.0, 1.0)
        );
        updateCamera();

        // Automatically fit skeleton & volumetric skin weights
        const rigRes = autoRigGltfScene(loaded.scene, {
          rigType,
          categoryHint: userManuallySelectedCategoryRef.current ? actorCategory : undefined,
          nameHint: actorName,
          promptHint: textPrompt,
          landmarks: customLandmarks || undefined,
          showBones: showBonesRef.current,
        });
        setRigOverlayVisible(loaded.scene, showBonesRef.current, true);
        setRigInfo(rigRes);
        try {
          renderer.render(scene, camera);
        } catch {}

        // If the user did not manually force a category, sync actorCategory & default name with the 3D geometry detection
        if (!userManuallySelectedCategoryRef.current) {
          if (rigRes.rigType === 'rigid_prop' || rigRes.rigType === 'spine_flex') {
            setActorCategory('prop');
            setActorName((prev) =>
              !prev || prev === 'Hero Character' || isUuidOrNoiseName(prev) ? '3D Object' : prev
            );
          } else if (rigRes.rigType === 'quadruped') {
            setActorCategory('creature');
            setActorName((prev) =>
              !prev || prev === 'Hero Character' || isUuidOrNoiseName(prev) ? '3D Creature' : prev
            );
          }
        }
      })
      .catch((err) => {
        console.error('Failed to display generated GLB in preview:', err);
      });

    // Mouse Drag Orbit + Interactive 3D Joint Sphere Clicking & Bone Posing
    const previewRaycaster = new THREE.Raycaster();
    previewRaycaster.layers.enable(0);
    previewRaycaster.layers.enable(1);

    const onMouseDown = (e: MouseEvent) => {
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

      // Check if clicking directly on a 3D bone joint sphere when Bones are visible
      const activeScene = loadedSceneRef.current;
      if (activeScene && showBonesRef.current && cameraRef.current) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          previewRaycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cameraRef.current);

          const jointSpheres: THREE.Object3D[] = [];
          activeScene.traverse((obj) => {
            if (obj.name === '__bone_joint_sphere__' && obj.visible) {
              jointSpheres.push(obj);
            }
          });

          const hits = previewRaycaster.intersectObjects(jointSpheres, false);
          if (hits.length > 0) {
            const hitBone = hits[0].object.userData?.boneName as HumanoidBone | undefined;
            if (hitBone) {
              draggingPreviewBoneRef.current = hitBone;
              setSelectedPreviewBone(hitBone);
              setShowBonePoseEditor(true);
              setPreviewMotion('bind');
              setAutoSpin(false);
              return;
            }
          }
        }
      }

      draggingPreviewBoneRef.current = null;
      isDraggingRef.current = true;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (draggingPreviewBoneRef.current) {
        const dx = e.clientX - prevMouseRef.current.x;
        const dy = e.clientY - prevMouseRef.current.y;
        prevMouseRef.current = { x: e.clientX, y: e.clientY };
        const bName = draggingPreviewBoneRef.current;
        setCustomBonePose((prev) => {
          const cur = prev[bName] || [0, 0, 0];
          const nextX = e.shiftKey ? cur[0] : Number(Math.max(-2.2, Math.min(2.2, cur[0] + dy * 0.012)).toFixed(3));
          const nextY = e.shiftKey ? cur[1] : Number(Math.max(-2.2, Math.min(2.2, cur[1] + dx * 0.012)).toFixed(3));
          const nextZ = e.shiftKey ? Number(Math.max(-2.2, Math.min(2.2, cur[2] - dx * 0.012)).toFixed(3)) : cur[2];
          return {
            ...prev,
            [bName]: [nextX, nextY, nextZ],
          };
        });
        return;
      }

      if (!isDraggingRef.current) return;
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

      orbitRef.current.theta -= dx * 0.008;
      orbitRef.current.phi = Math.max(
        0.12,
        Math.min(Math.PI * 0.48, orbitRef.current.phi - dy * 0.008)
      );
      updateCamera();
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      draggingPreviewBoneRef.current = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.radius = Math.max(
        1.0,
        Math.min(15, orbitRef.current.radius + e.deltaY * 0.004)
      );
      updateCamera();
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    // Render loop
    let running = true;
    const render = () => {
      if (!running) return;
      animFrameRef.current = requestAnimationFrame(render);
      const tSec = performance.now() / 1000;
      const activeScene = loadedSceneRef.current;
      const activeRig = activeScene?.userData?.rig;
      const activeRigType = activeScene?.userData?.autoRigType;
      const motion = previewMotionRef.current;

      if (activeScene && typeof activeScene.userData?.setAnimationTime === 'function' && motion !== 'bind') {
        activeScene.userData.setAnimationTime(tSec, 1);
      } else if (activeScene && activeRig) {
        if (motion === 'bind') {
          resetToRestPose(activeRig);
          if (customBonePoseRef.current && Object.keys(customBonePoseRef.current).length > 0) {
            for (const [bName, eulerTuple] of Object.entries(customBonePoseRef.current)) {
              const bone = activeRig.bones?.get(bName as HumanoidBone);
              if (bone && eulerTuple) {
                const restRot = activeRig.restRotations?.get(bName as HumanoidBone);
                const deltaQ = new THREE.Quaternion().setFromEuler(
                  new THREE.Euler(eulerTuple[0], eulerTuple[1], eulerTuple[2], 'XYZ')
                );
                if (restRot) {
                  bone.quaternion.copy(restRot).multiply(deltaQ);
                } else {
                  bone.quaternion.copy(deltaQ);
                }
              }
            }
            activeRig.root?.updateMatrixWorld(true);
          }
        } else if (activeRigType === 'humanoid') {
          if (motion === 'idle') {
            evaluateGait(activeRig, tSec, { gait: 'idle', speed: 0 });
          } else if (motion === 'walk') {
            evaluateGait(activeRig, tSec, { gait: 'walk', speed: 1.5 });
          } else if (motion === 'run') {
            evaluateGait(activeRig, tSec, { gait: 'run', speed: 2.8 });
          } else if (motion === 'wave') {
            evaluateReadyMadeHumanoidClip(
              activeRig,
              'human-wave-greet',
              tSec,
              (tSec % 2.4) / 2.4,
              false,
              1
            );
          } else if (motion === 'fight') {
            evaluateReadyMadeHumanoidClip(
              activeRig,
              'human-combo-punch',
              tSec,
              (tSec % 2.0) / 2.0,
              false,
              1
            );
          }
        } else if (activeRigType === 'quadruped') {
          const clipMap: Record<string, string> = {
            idle: 'quad-alert-idle',
            walk: 'quad-trot-forward',
            run: 'quad-gallop-charge',
            wave: 'quad-stalk-prowl',
            fight: 'quad-pounce-leap',
          };
          evaluateReadyMadeObjectClip(activeScene, clipMap[motion] || 'quad-trot-forward', tSec, 1);
        } else if (activeRigType === 'spine_flex') {
          resetToRestPose(activeRig);
          const sway = Math.sin(tSec * 3.0) * 0.22;
          const spine = activeRig.bones.get('Spine');
          const chest = activeRig.bones.get('Chest');
          const neck = activeRig.bones.get('Neck');
          const head = activeRig.bones.get('Head');
          if (spine) spine.rotation.z = sway * 0.5;
          if (chest) chest.rotation.z = sway * 0.8;
          if (neck) neck.rotation.z = -sway * 0.6;
          if (head) head.rotation.z = -sway * 0.9;
        }
        activeScene.updateMatrixWorld(true);
        const overlay = activeScene.getObjectByName('__auto_rig_skeleton_helper__');
        if (overlay && typeof overlay.userData?.updateLines === 'function') {
          overlay.userData.updateLines();
        }
      }

      if (autoSpinRef.current && !isDraggingRef.current && modelGroup.children.length) {
        orbitRef.current.theta += 0.0045;
        updateCamera();
      }
      try {
        renderer.render(scene, camera);
      } catch {
        // ignore transient context loss
      }
    };
    render();

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (nw > 0 && nh > 0) {
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh, false);
      }
    });
    ro.observe(container);

    return () => {
      cancelled = true;
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost, false);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      ro.disconnect();
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [isOpen, generatedResult?.blobUrl]);

  // Re-run auto-rigging live when rigType or actorCategory change (full skinning)
  useEffect(() => {
    const activeScene = loadedSceneRef.current;
    if (!activeScene) return;
    const rigRes = autoRigGltfScene(activeScene, {
      rigType,
      categoryHint: actorCategory,
      nameHint: actorName,
      landmarks: customLandmarks || undefined,
      showBones,
    });
    setRigOverlayVisible(activeScene, showBones, true);
    setRigInfo(rigRes);
  }, [rigType, actorCategory]);

  // When dragging Joint Landmark sliders on high-poly meshes (e.g. 400k verts),
  // immediately update the 3D skeleton & joint spheres in <1ms (fastPreviewOnly: true)
  // and debounce the heavy volumetric vertex skinning pass by 140ms so sliders stay 60 FPS!
  useEffect(() => {
    const activeScene = loadedSceneRef.current;
    if (!activeScene) return;
    const fastRes = autoRigGltfScene(activeScene, {
      rigType,
      categoryHint: actorCategory,
      nameHint: actorName,
      landmarks: customLandmarks || undefined,
      showBones,
      fastPreviewOnly: true,
    });
    setRigOverlayVisible(activeScene, showBones, true);
    setRigInfo(fastRes);

    const timer = window.setTimeout(() => {
      if (!loadedSceneRef.current) return;
      const fullRes = autoRigGltfScene(loadedSceneRef.current, {
        rigType,
        categoryHint: actorCategory,
        nameHint: actorName,
        landmarks: customLandmarks || undefined,
        showBones: showBonesRef.current,
        fastPreviewOnly: false,
      });
      setRigOverlayVisible(loadedSceneRef.current, showBonesRef.current, true);
      setRigInfo(fullRes);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [customLandmarks]);

  // Toggle bone overlay visibility on already-mounted mesh
  useEffect(() => {
    const activeScene = loadedSceneRef.current;
    if (!activeScene) return;
    setRigOverlayVisible(activeScene, showBones, true);
  }, [showBones]);

  // Toggle wireframe on already-mounted mesh
  useEffect(() => {
    const group = modelGroupRef.current;
    if (!group) return;
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m && 'wireframe' in m) {
            (m as any).wireframe = isWireframe;
          }
        }
      }
    });
  }, [isWireframe]);

  // Once a 3D object is created, lock its creation inputs (mode, prompt, image, engine settings)
  const isCreationLocked = Boolean(generatedResult) && !previewUnlocked;

  useEffect(() => {
    const onPreviewGlb = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.openStudio !== false) {
        useAssetLibraryStore.getState().closeLibrary();
        useAssetLibraryStore.getState().open3DStudio({
          initialMode: detail.generationMode || 'image-to-3d',
          initialImageUrl: detail.referenceImageUrl,
          initialPrompt: detail.textPrompt,
        });
      }
      if (!detail.blobUrl) return;
      if (detail.generationMode) setGenerationMode(detail.generationMode);
      if (detail.textPrompt !== undefined) setTextPrompt(detail.textPrompt);
      if (detail.actorName) setActorName(detail.actorName);
      if (detail.actorCategory) {
        userManuallySelectedCategoryRef.current = true;
        setActorCategory(detail.actorCategory);
      }
      if (detail.referenceImageUrl !== undefined) setReferenceImageUrl(detail.referenceImageUrl);
      if (detail.rigType) setRigType(detail.rigType);
      if (detail.showBones !== undefined) setShowBones(Boolean(detail.showBones));
      if (detail.showBonePoseEditor !== undefined) setShowBonePoseEditor(Boolean(detail.showBonePoseEditor));
      if (detail.showLandmarkEditor !== undefined) setShowLandmarkEditor(Boolean(detail.showLandmarkEditor));
      if (detail.previewMotion) setPreviewMotion(detail.previewMotion);
      if (detail.autoSpin !== undefined) setAutoSpin(Boolean(detail.autoSpin));
      setPreviewUnlocked(Boolean(detail.previewUnlocked));
      setGeneratedResult({
        modelId: detail.modelId || 'preview-3d-glb',
        modelUri: `model://${detail.modelId || 'preview-3d-glb'}`,
        blobUrl: detail.blobUrl,
        glbFile: new File([], detail.filename || 'Tactical_Soldier_Rigged.glb', { type: 'model/gltf-binary' }),
        filename: detail.filename || 'Tactical_Soldier_Rigged.glb',
        sizeBytes: detail.sizeBytes || 2248192,
        vertexCount: detail.vertexCount || 7432,
        triangleCount: detail.triangleCount || 11840,
        bboxSize: { x: 0.85, y: 1.82, z: 0.45 },
        engineUsed: detail.engineUsed || 'pixal3d',
        qualityUsed: detail.qualityUsed || 'full_pbr',
        generationModeUsed: detail.generationMode || 'image-to-3d',
      });
    };
    window.addEventListener('cmpvs:preview-glb-in-3d-studio', onPreviewGlb);
    return () => window.removeEventListener('cmpvs:preview-glb-in-3d-studio', onPreviewGlb);
  }, []);

  const userClearedPreviewRef = useRef<boolean>(false);
  const [isRecoveringLatest, setIsRecoveringLatest] = useState<boolean>(false);

  const handleLoadLatestFromComfy = async (silent = false) => {
    setIsRecoveringLatest(true);
    if (!silent) {
      setGenerationError(null);
    }
    try {
      const recovered = await fetchLatestCompleted3DGlbFromComfyHistory();
      if (!recovered) {
        if (!silent) {
          setGenerationError('No completed 3D .GLB render found in recent ComfyUI history.');
        }
        return;
      }
      userClearedPreviewRef.current = false;
      setGeneratedResult(recovered.result);
      if (recovered.actorName) {
        setActorName((prev) =>
          !prev || prev === 'Hero Character' || isUuidOrNoiseName(prev) ? recovered.actorName! : prev
        );
      }
      if (recovered.referenceImageUrl) {
        setReferenceImageUrl((prev) => prev || recovered.referenceImageUrl!);
      }
      if (recovered.textPrompt) {
        setTextPrompt((prev) => prev || recovered.textPrompt!);
      }
      saveGeneratedGlbToLibrary({
        modelId: recovered.result.modelId,
        blobUrl: recovered.result.blobUrl,
        name: recovered.actorName || actorName || 'Hero Character',
        actorCategory,
        sizeBytes: recovered.result.sizeBytes,
        conceptImageUrl: recovered.referenceImageUrl || referenceImageUrl || undefined,
        rigType,
        rigLandmarks: customLandmarks || undefined,
        showBones,
        engineUsed: recovered.result.engineUsed,
      });
    } catch (err: any) {
      if (!silent) {
        setGenerationError(err?.message || 'Could not load latest .GLB from ComfyUI.');
      }
    } finally {
      setIsRecoveringLatest(false);
    }
  };

  useEffect(() => {
    if (!isOpen || generatedResult || isGenerating || userClearedPreviewRef.current || initialPrompt) {
      return;
    }
    void handleLoadLatestFromComfy(true);
  }, [isOpen]);

  // Reset Studio to start a brand-new 3D object
  const handleStartNew3DObject = () => {
    userClearedPreviewRef.current = true;
    setGeneratedResult(null);
    setPreviewUnlocked(false);
    setRigInfo(null);
    setCustomLandmarks(null);
    setGenerationError(null);
    setStepProgress(null);
    setGenerationStage('');
  };

  // Execute ComfyUI 3D .GLB Generation (Image-to-3D #aa77013b OR Text-to-3D #e7a9555b)
  const handleGenerateGlb = async () => {
    if (isCreationLocked) return;
    if (generationMode === 'image-to-3d' && !referenceImageUrl) {
      setGenerationError('Please upload a reference character or object image first.');
      return;
    }
    if (generationMode === 'text-to-3d' && !textPrompt.trim()) {
      setGenerationError('Please enter a text description of the 3D object or character first.');
      return;
    }
    if (workflowSource === 'custom' && !customWorkflowJson.trim()) {
      setGenerationError(
        'Please load a custom local 3D workflow (.json) or switch back to the Built-in Pixal3D / TRELLIS.2 workflow.'
      );
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setStepProgress(null);
    setGenerationStage(
      generationMode === 'text-to-3d'
        ? 'Connecting to local ComfyUI & queueing Text-to-3D workflow (#e7a9555b)...'
        : 'Connecting to local ComfyUI & uploading reference image (#aa77013b)...'
    );

    try {
      const fallbackCategoryName =
        actorCategory === 'prop'
          ? 'Hero 3D Object'
          : actorCategory === 'creature'
          ? 'Hero 3D Creature'
          : 'Hero Character';
      const rawActorName = actorName.trim();
      const effectiveActorName =
        rawActorName && !isUuidOrNoiseFilename(rawActorName)
          ? rawActorName
          : generationMode === 'text-to-3d'
          ? textPrompt.trim().slice(0, 36) || fallbackCategoryName
          : fallbackCategoryName;

      const result = await generate3DGlbInComfy({
        generationMode,
        imageDataUrl: generationMode === 'image-to-3d' ? referenceImageUrl || undefined : undefined,
        textPrompt: generationMode === 'text-to-3d' ? textPrompt.trim() : undefined,
        actorName: effectiveActorName,
        engineMode,
        qualityMode,
        removeBackground,
        textureResolution,
        seed,
        customWorkflowJson: workflowSource === 'custom' ? customWorkflowJson : undefined,
        onProgress: (stageText, detail) => {
          setGenerationStage(stageText);
          if (detail?.step !== undefined && detail?.maxSteps !== undefined) {
            setStepProgress({ step: detail.step, maxSteps: detail.maxSteps });
          } else {
            setStepProgress(null);
          }
        },
      });

      setGeneratedResult(result);
      if (!actorName.trim() || actorName === 'Hero Character') {
        setActorName(effectiveActorName);
      }

      const resolvedConceptImage =
        generationMode === 'text-to-3d'
          ? result.generatedConceptImageUrl || undefined
          : referenceImageUrl || undefined;

      // Automatically save the generated 3D .GLB character/object into the 3D Asset Library
      saveGeneratedGlbToLibrary({
        modelId: result.modelId,
        blobUrl: result.blobUrl,
        name: effectiveActorName,
        actorCategory,
        sizeBytes: result.sizeBytes,
        conceptImageUrl: resolvedConceptImage,
        rigType,
        rigLandmarks: customLandmarks || undefined,
        showBones,
        engineUsed: result.engineUsed,
      });
      setSavedLibrarySuccess(true);
      setTimeout(() => setSavedLibrarySuccess(false), 2000);
    } catch (err: any) {
      setGenerationError(
        err?.message ||
        'Failed to generate 3D .GLB in ComfyUI. Please verify ComfyUI is running at http://127.0.0.1:8188.'
      );
    } finally {
      setIsGenerating(false);
      setGenerationStage('');
      setStepProgress(null);
    }
  };

  const handleStop3DGeneration = async () => {
    try {
      await cancelActive3DGeneration();
    } catch {
      // ignore if ComfyUI is already offline
    }
    setIsGenerating(false);
    setGenerationStage('');
    setStepProgress(null);
    setGenerationError('3D .GLB render stopped by user. You can adjust settings and generate again.');
  };

  // Download generated .GLB file to user's computer
  const handleDownloadGlb = () => {
    if (!generatedResult) return;
    const a = document.createElement('a');
    a.href = generatedResult.blobUrl;
    a.download = generatedResult.filename.endsWith('.glb')
      ? generatedResult.filename
      : `${generatedResult.filename}.glb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Save or update generated .GLB in 3D Asset Library with current name, category & rig settings
  const handleSaveToLibrary = async () => {
    if (!generatedResult) return;
    const rawTrimmed = actorName.trim();
    const fallbackCategoryName =
      actorCategory === 'prop'
        ? 'Hero 3D Object'
        : actorCategory === 'creature'
        ? 'Hero 3D Creature'
        : 'Hero Character';
    const cleanName =
      rawTrimmed && !isUuidOrNoiseFilename(rawTrimmed) ? rawTrimmed : fallbackCategoryName;
    const resolvedConceptImage =
      generationMode === 'text-to-3d'
        ? generatedResult.generatedConceptImageUrl || undefined
        : referenceImageUrl || undefined;
    saveGeneratedGlbToLibrary({
      modelId: generatedResult.modelId,
      blobUrl: generatedResult.blobUrl,
      name: cleanName,
      actorCategory,
      sizeBytes: generatedResult.sizeBytes,
      conceptImageUrl: resolvedConceptImage,
      rigType,
      rigLandmarks: customLandmarks || rigInfo?.landmarks,
      showBones,
      engineUsed: generatedResult.engineUsed,
    });
    setSavedLibrarySuccess(true);
    setTimeout(() => setSavedLibrarySuccess(false), 1500);
  };

  // Add or apply generated .GLB character/object to active 3D scene
  // Auto-syncs `conceptImageUrl` so <picture 1> is immediately bound for MiniMax H3 video rendering,
  // and ensures the 3D Asset Library entry is updated and both modals close so the rigged .GLB appears immediately on stage.
  const handleAddToScene = () => {
    if (!generatedResult) return;
    const rawTrimmed = actorName.trim();
    const fallbackCategoryName =
      actorCategory === 'prop'
        ? 'Hero 3D Object'
        : actorCategory === 'creature'
        ? 'Hero 3D Creature'
        : 'Hero Character';
    const cleanName =
      rawTrimmed && !isUuidOrNoiseFilename(rawTrimmed) ? rawTrimmed : fallbackCategoryName;
    const resolvedToken =
      generationMode === 'text-to-3d' && textPrompt.trim()
        ? textPrompt.trim()
        : cleanName;
    const resolvedConceptImage =
      generationMode === 'text-to-3d'
        ? generatedResult.generatedConceptImageUrl || undefined
        : referenceImageUrl || undefined;

    // Ensure the 3D Asset Library has the latest name, category, and rig configuration
    saveGeneratedGlbToLibrary({
      modelId: generatedResult.modelId,
      blobUrl: generatedResult.blobUrl,
      name: cleanName,
      actorCategory,
      sizeBytes: generatedResult.sizeBytes,
      conceptImageUrl: resolvedConceptImage,
      rigType,
      rigLandmarks: customLandmarks || rigInfo?.landmarks,
      showBones,
      engineUsed: generatedResult.engineUsed,
    });

    const customRotations: Record<string, [number, number, number, number]> = {};
    for (const [bName, eulerTuple] of Object.entries(customBonePose)) {
      if (!eulerTuple) continue;
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(eulerTuple[0], eulerTuple[1], eulerTuple[2], 'XYZ')
      );
      customRotations[bName] = [q.x, q.y, q.z, q.w];
    }
    const serializedActorPose: ActorPose | undefined =
      Object.keys(customRotations).length > 0 ? { rotations: customRotations } : undefined;

    if (targetActorId) {
      updateActor(targetActorId, {
        name: cleanName,
        kind: actorCategory,
        token: resolvedToken,
        ...(actorCategory === 'prop'
          ? { actionDescription: 'maintains steady physical presence in the camera frame' }
          : {}),
        modelUrl: generatedResult.blobUrl,
        conceptImageUrl: resolvedConceptImage,
        sculpt: undefined,
        partGraph: undefined,
        rigType,
        rigLandmarks: customLandmarks || rigInfo?.landmarks,
        showBones,
        pose: serializedActorPose,
      });
      setSelectedActorId(targetActorId);
    } else {
      addActor(cleanName, actorCategory, resolvedToken, {
        modelUrl: generatedResult.blobUrl,
        conceptImageUrl: resolvedConceptImage,
        rigType,
        rigLandmarks: customLandmarks || rigInfo?.landmarks,
        showBones,
        pose: serializedActorPose,
      });
    }

    setAppliedSuccess(true);
    setTimeout(() => {
      setAppliedSuccess(false);
      onApplyToScene?.(cleanName);
      closeLibrary();
      onClose();
    }, 350);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className="relative w-full max-w-5xl h-[90vh] max-h-[880px] bg-[#0b0e17] border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200 font-sans"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Studio Settings Modal Overlay */}
        {showSettingsModal && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto"
            onClick={() => setShowSettingsModal(false)}
          >
            <div
              className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0e111a] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <ReasonerSettingsPanel onClose={() => setShowSettingsModal(false)} />
            </div>
          </div>
        )}

        {/* Bundled ComfyUI Workflows Pack Modal */}
        <BundledWorkflowsModal
          isOpen={showWorkflowsPackModal}
          onClose={() => setShowWorkflowsPackModal(false)}
        />

        {/* Header Bar */}
        <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-white/10 bg-[#111624] shrink-0">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
                <Box className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    ComfyUI 3D Character &amp; Object Studio (.GLB)
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/35 font-semibold">
                    {generationMode === 'text-to-3d'
                      ? 'Z-Image Turbo • Pixal3D • TRELLIS.2 (#e7a9555b)'
                      : 'Pixal3D • TRELLIS.2 • BiRefNet (#aa77013b)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {generationMode === 'text-to-3d'
                    ? 'Generate a 3D .GLB character or object directly from a text prompt via ComfyUI workflow #e7a9555b'
                    : 'Turn any character or object concept image into a real textured 3D .GLB mesh via ComfyUI workflow #aa77013b'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {/* Recover / Load Latest Completed .GLB from ComfyUI History */}
              <button
                type="button"
                disabled={isRecoveringLatest || isGenerating}
                onClick={() => handleLoadLatestFromComfy(false)}
                className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-emerald-200 hover:text-white bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1.5 rounded-lg border border-emerald-400/40 transition-all cursor-pointer disabled:opacity-50"
                title="Load the most recently completed 3D .GLB render directly from ComfyUI history"
              >
                {isRecoveringLatest ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5 text-emerald-300" />
                )}
                <span>Load Latest .GLB</span>
              </button>

              {/* Download All Bundled ComfyUI Workflows Button */}
              <button
                type="button"
                onClick={() => setShowWorkflowsPackModal(true)}
                className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-cyan-200 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/25 px-2.5 py-1.5 rounded-lg border border-cyan-400/40 transition-all cursor-pointer"
                title="Download all ComfyUI workflows used in this app (Image-to-3D, Text-to-3D, MiniMax H3 & LTX-2.5)"
              >
                <FileCode className="h-3.5 w-3.5 text-cyan-300" />
                <span>📥 Workflows Pack</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="flex items-center gap-1.5 text-[11px] font-mono text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-white/25 transition-all cursor-pointer"
                title="Open ComfyUI & Workflow Settings"
              >
                <span
                  className={`h-2 w-2 rounded-full ${comfyStatus === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'
                    }`}
                />
                <span>
                  {comfyStatus === 'connected'
                    ? `ComfyUI Online${comfyStats ? ` • ${comfyStats.vramTotalGb}GB` : ''}`
                    : 'ComfyUI Offline'}
                </span>
                <Settings className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close 3D Generator"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-300 hover:text-white hover:bg-rose-500/25 hover:border-rose-400/40 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Main Two-Column Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* LEFT COLUMN (5 Cols): Mode Switcher + Mutually Exclusive Input + ComfyUI 3D Controls */}
          <div className="lg:col-span-5 border-r border-white/10 bg-[#0d111c] p-4 overflow-y-auto space-y-3.5">
            {/* Creation Locked Banner (Once a 3D .GLB is created, its creation inputs cannot be edited) */}
            {isCreationLocked && (
              <div className="rounded-xl border border-amber-500/45 bg-amber-950/25 p-3 space-y-2 font-mono">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-amber-200">
                    <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    <span>3D Object Created — Creation Inputs Locked</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleStartNew3DObject}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[10.5px] font-bold shadow cursor-pointer shrink-0"
                    title="Clear current 3D object and start creating a brand-new 3D object"
                  >
                    <Plus className="h-3 w-3 stroke-[3]" />
                    <span>New 3D Object</span>
                  </button>
                </div>
                <p className="text-[10.5px] text-slate-300 leading-relaxed font-sans">
                  Once a 3D <code className="text-cyan-300">.GLB</code> object is created, its mesh &amp; generation prompt are locked. Place it on the 3D Stage, download the <code className="text-cyan-300">.GLB</code>, or click <strong>New 3D Object</strong> to create another.
                </p>
              </div>
            )}

            {/* 0. Unified Mode Switcher: Image-to-3D (#aa77013b) vs Text-to-3D (#e7a9555b) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300 font-bold">
                  1. Choose 3D Creation Mode (Mutually Exclusive)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/60 border border-white/15 font-mono text-xs">
                <button
                  type="button"
                  disabled={isCreationLocked || isGenerating}
                  onClick={() => {
                    setGenerationMode('image-to-3d');
                    setGenerationError(null);
                  }}
                  className={`py-2 px-2.5 rounded-lg font-bold transition-all flex flex-col items-start gap-0.5 text-left ${isCreationLocked || isGenerating ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    } ${generationMode === 'image-to-3d'
                      ? 'bg-gradient-to-r from-cyan-600/40 to-indigo-600/40 border border-cyan-400 text-white shadow'
                      : 'bg-transparent border border-transparent text-slate-400 hover:text-white'
                    }`}
                >
                  <span className="text-[11px] flex items-center gap-1.5">
                    <span>🖼️ Image-to-3D</span>
                  </span>
                  <span className="text-[9.5px] text-cyan-300/90 font-normal">
                    Image Only • #aa77013b
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isCreationLocked || isGenerating}
                  onClick={() => {
                    setGenerationMode('text-to-3d');
                    setGenerationError(null);
                  }}
                  className={`py-2 px-2.5 rounded-lg font-bold transition-all flex flex-col items-start gap-0.5 text-left ${isCreationLocked || isGenerating ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    } ${generationMode === 'text-to-3d'
                      ? 'bg-gradient-to-r from-amber-500/35 to-indigo-600/40 border border-amber-400 text-white shadow'
                      : 'bg-transparent border border-transparent text-slate-400 hover:text-white'
                    }`}
                >
                  <span className="text-[11px] flex items-center gap-1.5">
                    <span>✍️ Text-to-3D</span>
                  </span>
                  <span className="text-[9.5px] text-amber-300/90 font-normal">
                    Text Prompt Only • #e7a9555b
                  </span>
                </button>
              </div>
            </div>

            {/* 1A. IMAGE-TO-3D INPUT (Shown ONLY when generationMode === 'image-to-3d') */}
            {generationMode === 'image-to-3d' ? (
              <div className={`space-y-1.5 ${isCreationLocked ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-slate-300 font-bold flex items-center gap-1.5">
                    <Upload className="h-3.5 w-3.5 text-cyan-400" />
                    2. Character / Object Reference Image (No Text Prompt Needed)
                  </label>
                  {referenceImageUrl && !isCreationLocked && (
                    <button
                      type="button"
                      onClick={() => {
                        setReferenceImageUrl(null);
                        setGeneratedResult(null);
                      }}
                      className="text-[11px] text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
                    >
                      Clear Image
                    </button>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  disabled={isCreationLocked || isGenerating}
                  onClick={(e) => e.stopPropagation()}
                  onChange={handleImageFileChange}
                  className="hidden"
                />

                {!referenceImageUrl ? (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isCreationLocked && !isGenerating) fileInputRef.current?.click();
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (isCreationLocked || isGenerating) return;
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) {
                        applyUploadedImageFile(file);
                      }
                    }}
                    className="border-2 border-dashed border-cyan-500/35 hover:border-cyan-400/70 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer bg-cyan-950/10 hover:bg-cyan-950/20 transition-all text-center"
                  >
                    <Upload className="h-6 w-6 text-cyan-400" />
                    <div className="text-xs font-semibold text-white">
                      Click or Drag &amp; Drop Character / Object Image
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Supports any PNG, JPG, or WebP concept image — BiRefNet removes the background automatically in ComfyUI
                    </span>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-white/15 bg-black/60 p-2 flex items-center gap-3">
                    <img
                      src={referenceImageUrl}
                      alt="Reference"
                      className="h-24 w-24 object-contain rounded-lg bg-[#141824] border border-white/10 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        <span>Reference Image Staged</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        This image will be reconstructed into a 3D <code className="text-cyan-300">.GLB</code> mesh and automatically linked as the character&apos;s ComfyUI Reference Image (<code className="text-amber-300">&lt;picture 1&gt;</code>).
                      </p>
                      {!isCreationLocked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="text-[10px] font-mono px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-slate-200 cursor-pointer"
                        >
                          Replace Image...
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* 1B. TEXT-TO-3D INPUT (Shown ONLY when generationMode === 'text-to-3d') */
              <div className={`space-y-2 rounded-xl border border-amber-500/35 bg-amber-950/15 p-3 ${isCreationLocked ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-amber-200 font-bold flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    2. Describe 3D Object / Character (No Image Needed)
                  </label>
                  <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Node 327 • Z-Image Turbo
                  </span>
                </div>

                <textarea
                  rows={3}
                  disabled={isCreationLocked || isGenerating}
                  value={textPrompt}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTextPrompt(val);
                    const inferred = inferSubjectCategoryAndCleanName(val, actorCategory);
                    if (!userManuallySelectedCategoryRef.current && !inferred.isNoiseOrUuid && val.trim()) {
                      setActorCategory(inferred.category);
                    }
                    if (
                      !actorName ||
                      actorName === 'Hero Character' ||
                      actorName === '3D Object' ||
                      actorName === '3D Creature' ||
                      isUuidOrNoiseName(actorName)
                    ) {
                      setActorName(inferred.cleanName);
                    }
                  }}
                  placeholder="e.g. a weathered medieval treasure chest with iron bands, or an armored sci-fi scout character..."
                  className="w-full rounded-lg bg-black/75 border border-amber-500/30 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono leading-relaxed resize-none"
                />

                <div className="text-[10px] text-slate-400 leading-relaxed font-mono bg-black/50 rounded-lg p-2 border border-white/5">
                  <span className="text-amber-300 font-semibold">Studio Isolation Prompt (#e7a9555b): </span>
                  <span className="text-slate-300">
                    {format3DStudioTextPrompt(textPrompt || 'your described 3D object')}
                  </span>
                </div>
              </div>
            )}

            {/* 2. Actor Name & Category */}
            <div className={`rounded-xl border border-white/10 bg-black/40 p-3 space-y-2.5 ${isCreationLocked ? 'opacity-60 pointer-events-none' : ''}`}>
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-300 font-bold">
                3. Actor Name &amp; Stage Category
              </div>
              <input
                type="text"
                disabled={isCreationLocked || isGenerating}
                value={actorName}
                onChange={(e) => {
                  const val = e.target.value;
                  setActorName(val);
                  if (!userManuallySelectedCategoryRef.current && val.trim()) {
                    const inferred = inferSubjectCategoryAndCleanName(val, actorCategory);
                    if (!inferred.isNoiseOrUuid) {
                      setActorCategory(inferred.category);
                    }
                  }
                }}
                placeholder="e.g. Elven Archer, Medieval Chest, Sci-Fi Rover..."
                className="w-full rounded-lg bg-black/70 border border-white/15 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
                {(
                  [
                    { id: 'human' as const, label: '👤 Character' },
                    { id: 'creature' as const, label: '🐾 Creature' },
                    { id: 'prop' as const, label: '📦 Prop / Object' },
                  ]
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={isCreationLocked || isGenerating}
                    onClick={() => {
                      userManuallySelectedCategoryRef.current = true;
                      setActorCategory(cat.id);
                    }}
                    className={`py-1.5 px-2 rounded-lg font-semibold border transition-all cursor-pointer truncate ${actorCategory === cat.id
                        ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                      }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. ComfyUI 3D Engine & Quality Controls */}
            <div className={`rounded-xl border border-indigo-500/30 bg-indigo-950/15 p-3 space-y-3 font-mono text-xs ${isCreationLocked ? 'opacity-60 pointer-events-none' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-indigo-200 uppercase tracking-wider">
                  4. ComfyUI 3D Engine &amp; Mesh Settings
                </span>
              </div>

              {/* Model Switch: Pixal3D vs. TRELLIS.2 */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">
                  3D Diffusion Model (Installed in <code className="text-slate-300">D:\ComfyUI\models\</code>)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEngineMode('pixal3d')}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${engineMode === 'pixal3d'
                        ? 'bg-indigo-600/30 border-indigo-400 text-white shadow'
                        : 'bg-black/50 border-white/10 text-slate-400 hover:text-white'
                      }`}
                  >
                    <div className="font-bold text-[11px] text-indigo-200">⚡ Pixal3D INT8</div>
                    <div className="text-[9.5px] text-slate-400 truncate">
                      + MoGe Camera FoV Depth
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEngineMode('trellis2')}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${engineMode === 'trellis2'
                        ? 'bg-cyan-600/30 border-cyan-400 text-white shadow'
                        : 'bg-black/50 border-white/10 text-slate-400 hover:text-white'
                      }`}
                  >
                    <div className="font-bold text-[11px] text-cyan-200">🧊 TRELLIS.2 INT8</div>
                    <div className="text-[9.5px] text-slate-400 truncate">
                      Direct Voxel-to-Mesh
                    </div>
                  </button>
                </div>
              </div>

              {/* Quality Mode: Fast Vertex-Color vs. Full PBR */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">Mesh &amp; Texture Baking Mode</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQualityMode('fast_vertex')}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${qualityMode === 'fast_vertex'
                        ? 'bg-emerald-600/25 border-emerald-400 text-white'
                        : 'bg-black/50 border-white/10 text-slate-400 hover:text-white'
                      }`}
                  >
                    <div className="font-bold text-[11px] text-emerald-300">
                      🚀 Fast Vertex-Color
                    </div>
                    <div className="text-[9.5px] text-slate-400 truncate">
                      Skips slow UV/Normal bake
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQualityMode('full_pbr')}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${qualityMode === 'full_pbr'
                        ? 'bg-amber-600/25 border-amber-400 text-white'
                        : 'bg-black/50 border-white/10 text-slate-400 hover:text-white'
                      }`}
                  >
                    <div className="font-bold text-[11px] text-amber-300">
                      🎨 Full PBR UV-Baked
                    </div>
                    <div className="text-[9.5px] text-slate-400 truncate">
                      Base + Normal + AO + Roughness
                    </div>
                  </button>
                </div>
              </div>

              {/* Background Removal Toggle + Texture Resolution + Seed */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Auto Cutout</label>
                  <button
                    type="button"
                    onClick={() => setRemoveBackground((v) => !v)}
                    className={`py-1.5 px-2 rounded-lg border text-[10.5px] font-bold transition-all cursor-pointer truncate ${removeBackground
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                        : 'bg-white/5 border-white/15 text-slate-400'
                      }`}
                    title="Run BiRefNet AI background removal inside ComfyUI before 3D generation"
                  >
                    {removeBackground ? '✓ BiRefNet ON' : 'BiRefNet OFF'}
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Texture Res</label>
                  <select
                    value={textureResolution}
                    onChange={(e) =>
                      setTextureResolution(Number(e.target.value) as 1024 | 2048 | 4096)
                    }
                    className="rounded-lg bg-black/70 border border-white/15 px-2 py-1.5 text-[10.5px] text-white"
                  >
                    <option value={1024}>1024 px</option>
                    <option value={2048}>2048 px</option>
                    <option value={4096}>4096 px</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>Seed</span>
                    <button
                      type="button"
                      onClick={() => setSeed(Math.floor(Math.random() * 999999) + 1)}
                      className="text-cyan-300 hover:text-white cursor-pointer"
                      title="Randomize seed"
                    >
                      <Dice5 className="h-3 w-3" />
                    </button>
                  </label>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(Math.max(1, Number(e.target.value) || 42))}
                    className="rounded-lg bg-black/70 border border-white/15 px-2 py-1.5 text-[10.5px] text-white"
                  />
                </div>
              </div>
            </div>

            {/* 4. Generate 3D .GLB Button (Locked once a 3D object is created) */}
            {!isCreationLocked ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateGlb}
                  disabled={
                    isGenerating ||
                    (generationMode === 'image-to-3d' ? !referenceImageUrl : !textPrompt.trim())
                  }
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-cyan-500 via-indigo-600 to-violet-600 hover:brightness-110 disabled:opacity-40 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>
                        {generationMode === 'text-to-3d'
                          ? `Generating Text-to-3D .GLB (#e7a9555b • ${elapsedSec}s)...`
                          : `Generating Image-to-3D .GLB (#aa77013b • ${elapsedSec}s)...`}
                      </span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      <span>
                        {generationMode === 'text-to-3d'
                          ? 'Generate Text-to-3D .GLB in ComfyUI (#e7a9555b)'
                          : 'Generate Image-to-3D .GLB in ComfyUI (#aa77013b)'}
                      </span>
                    </>
                  )}
                </button>
                {isGenerating && (
                  <button
                    type="button"
                    onClick={handleStop3DGeneration}
                    className="py-3 px-3.5 rounded-xl font-mono text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 shadow-lg shadow-rose-500/15 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                    title="Immediately interrupt and stop the 3D .GLB render in ComfyUI"
                  >
                    <Square className="h-3.5 w-3.5 fill-current text-rose-400" />
                    <span>Stop</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full py-2.5 px-3.5 rounded-xl font-mono text-xs font-bold text-emerald-300 bg-emerald-950/30 border border-emerald-500/40 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-emerald-400" />
                    <span>✓ 3D .GLB Created &amp; Saved to Library</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleStartNew3DObject}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10.5px] font-semibold cursor-pointer"
                  >
                    + New Object
                  </button>
                </div>
                {generatedResult && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-500/20">
                    <button
                      type="button"
                      onClick={handleSaveToLibrary}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow cursor-pointer transition-all"
                    >
                      {savedLibrarySuccess ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Saved to 3D Library!</span>
                        </>
                      ) : (
                        <span>Save to 3D Library</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddToScene}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black text-[11px] font-bold shadow cursor-pointer transition-all"
                    >
                      {appliedSuccess ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Added to Stage!</span>
                        </>
                      ) : (
                        <span>{targetActorId ? 'Apply .GLB to Actor' : 'Add to Active Scene (Stage)'}</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Live Progress Banner */}
            {isGenerating && (
              <div className="rounded-xl border border-cyan-500/35 bg-cyan-950/20 p-3 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between text-[11px] text-cyan-200">
                  <span className="truncate font-semibold">{generationStage}</span>
                  <span className="text-cyan-400 shrink-0">{elapsedSec}s</span>
                </div>
                {stepProgress && stepProgress.maxSteps > 0 && (
                  <div className="w-full h-1.5 rounded-full bg-black/60 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all duration-200"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((stepProgress.step / stepProgress.maxSteps) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Error Banner */}
            {generationError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/25 p-3 text-xs text-rose-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-rose-300">ComfyUI 3D Generation Notice</div>
                  <div className="text-[11px] leading-relaxed">{generationError}</div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN (7 Cols): Interactive 3D .GLB Viewport & Export Bar */}
          <div className="lg:col-span-7 flex flex-col bg-[#080a10] relative min-h-0 overflow-hidden">
            {/* Top Viewport Overlay Badges & Controls */}
            <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
                {generatedResult ? (
                  <>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11px] font-mono font-bold">
                      ✓ .GLB Ready • {(generatedResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-lg border text-[10.5px] font-mono ${
                        generatedResult.triangleCount > 250000
                          ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 font-semibold'
                          : 'bg-black/75 border-white/15 text-slate-200'
                      }`}
                      title={
                        generatedResult.triangleCount > 250000
                          ? 'High-density mesh (>250k triangles)'
                          : 'Mesh vertex and triangle count'
                      }
                    >
                      {generatedResult.triangleCount > 250000 ? '⚠️ ' : ''}
                      {generatedResult.vertexCount.toLocaleString()} verts •{' '}
                      {generatedResult.triangleCount.toLocaleString()} tris
                    </span>
                    {rigInfo && (
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-500/25 border border-indigo-400/40 text-indigo-200 text-[10.5px] font-mono font-semibold">
                        🦴{' '}
                        {rigInfo.rigType === 'humanoid'
                          ? `Humanoid Rig (${rigInfo.boneCount} Bones • ${rigInfo.landmarks.detectedStance?.toUpperCase() || 'AUTO'})`
                          : rigInfo.rigType === 'quadruped'
                            ? `Quadruped Rig (${rigInfo.boneCount} Bones)`
                            : rigInfo.rigType === 'spine_flex'
                              ? `Flex Spine Rig (${rigInfo.boneCount} Bones)`
                              : 'Rigid Prop Pivot'}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-black/70 border border-white/10 text-slate-400 text-[11px] font-mono">
                    3D .GLB Preview Stage (Drag to Orbit • Scroll to Zoom)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 pointer-events-auto">
                {generatedResult && rigInfo && rigInfo.boneCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowBones((v) => !v)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10.5px] font-mono font-semibold cursor-pointer ${showBones
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                        : 'bg-black/70 border-white/15 text-slate-400 hover:text-white'
                      }`}
                    title="Show or hide 3D skeleton bones & joint markers inside the mesh"
                  >
                    <span>🦴 {showBones ? 'Bones ON' : 'Bones OFF'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAutoSpin((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10.5px] font-mono font-semibold cursor-pointer ${autoSpin
                      ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                      : 'bg-black/70 border-white/15 text-slate-400 hover:text-white'
                    }`}
                >
                  <RotateCw className="h-3 w-3" />
                  <span>Turntable</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsWireframe((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10.5px] font-mono font-semibold cursor-pointer ${isWireframe
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                      : 'bg-black/70 border-white/15 text-slate-400 hover:text-white'
                    }`}
                >
                  <Box className="h-3 w-3" />
                  <span>Wireframe</span>
                </button>
              </div>
            </div>

            {/* 3D WebGL Canvas Container */}
            <div
              ref={canvasMountRef}
              className="flex-1 min-h-[180px] w-full relative overflow-hidden cursor-grab active:cursor-grabbing"
            />

            {/* Staged Image / Text Prompt / Empty State Guidance Overlay when no .GLB is generated yet */}
            {!generatedResult && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
                <div className="max-w-md rounded-2xl border border-white/15 bg-[#0d111c]/95 backdrop-blur-md p-5 text-center space-y-3 shadow-2xl">
                  {generationMode === 'image-to-3d' && referenceImageUrl ? (
                    <>
                      <img
                        src={referenceImageUrl}
                        alt="Staged Reference"
                        className="h-44 w-44 object-contain mx-auto rounded-xl border border-cyan-500/40 bg-black/60 p-2 shadow-lg"
                      />
                      <div className="text-sm font-bold text-emerald-300">
                        {isGenerating
                          ? `Reconstructing 3D .GLB in ComfyUI (${elapsedSec}s)...`
                          : 'Reference Image Ready for 3D Conversion (#aa77013b)'}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {isGenerating
                          ? generationStage || 'Running ComfyUI Image-to-3D pipeline...'
                          : 'Click "Generate Image-to-3D .GLB in ComfyUI" on the left to reconstruct the 3D mesh and load the interactive 3D turntable.'}
                      </p>
                    </>
                  ) : generationMode === 'text-to-3d' && textPrompt.trim() ? (
                    <>
                      <div className="h-14 w-14 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center mx-auto">
                        <Sparkles className="h-7 w-7 text-amber-400" />
                      </div>
                      <div className="text-sm font-bold text-amber-300">
                        {isGenerating
                          ? `Generating Text-to-3D .GLB in ComfyUI (${elapsedSec}s)...`
                          : 'Text Prompt Ready for 3D Generation (#e7a9555b)'}
                      </div>
                      <div className="rounded-xl bg-black/60 border border-amber-500/30 p-2.5 text-[11px] font-mono text-amber-100">
                        &ldquo;{textPrompt.trim()}&rdquo;
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {isGenerating
                          ? generationStage || 'Running Z-Image Turbo + Pixal3D/TRELLIS.2 pipeline...'
                          : 'Click "Generate Text-to-3D .GLB in ComfyUI (#e7a9555b)" on the left to synthesize the isolated 2D studio image and reconstruct the 3D .GLB mesh.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-7 w-7 text-cyan-400 mx-auto" />
                      <div className="text-sm font-bold text-white">
                        {generationMode === 'text-to-3d'
                          ? 'Describe a 3D Object & Click "Generate Text-to-3D .GLB"'
                          : 'Upload an Image & Click "Generate Image-to-3D .GLB"'}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {generationMode === 'text-to-3d' ? (
                          <>
                            Workflow <code className="text-amber-300">#e7a9555b</code> synthesizes a clean 3/4 studio concept image using <strong>Z-Image Turbo (Qwen-3-4B + Flux VAE)</strong>, removes the background with <strong>BiRefNet</strong>, reconstructs a 3D <code className="text-cyan-300">.GLB</code> mesh with <strong>Pixal3D / TRELLIS.2</strong>, and saves it automatically to your 3D Asset Library.
                          </>
                        ) : (
                          <>
                            Workflow <code className="text-cyan-300">#aa77013b</code> removes the background with <strong>BiRefNet</strong>, reconstructs the 3D geometry and textures using <strong>Pixal3D</strong> or <strong>TRELLIS.2</strong>, and saves the resulting <code className="text-cyan-300">.GLB</code> model automatically to your 3D Asset Library.
                          </>
                        )}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Auto-Rigging, Live Motion Preview & Joint Landmark Tuner Bar */}
            {generatedResult && (
              <div className="px-4 py-2 border-t border-white/10 bg-[#0c101b] space-y-2 max-h-[42%] overflow-y-auto shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Rig Type Selector */}
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">
                      Skeleton Rig:
                    </span>
                    {(
                      [
                        { id: 'auto', label: '✨ Auto' },
                        { id: 'humanoid', label: '🧍 Humanoid (19-Bone)' },
                        { id: 'quadruped', label: '🐾 Animal (4-Leg)' },
                        { id: 'spine_flex', label: '🐍 Flex Spine' },
                        { id: 'rigid_prop', label: '📦 Rigid Prop' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setRigType(opt.id);
                          if (opt.id !== 'rigid_prop') {
                            setShowBones(true);
                          }
                        }}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition-all cursor-pointer ${rigType === opt.id
                            ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                          }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Fine-Tune Joint Landmarks & Direct Bone Pose Toggles */}
                  {rigInfo && rigInfo.rigType !== 'rigid_prop' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setShowBonePoseEditor((v) => {
                            const next = !v;
                            if (next) {
                              setShowBones(true);
                              setPreviewMotion('bind');
                            }
                            return next;
                          });
                        }}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold border transition-all cursor-pointer ${showBonePoseEditor
                            ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200'
                            : 'bg-white/5 border-white/15 text-slate-300 hover:text-white'
                          }`}
                      >
                        🦴 {showBonePoseEditor ? 'Hide Bone Pose' : 'Pose Bones'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowLandmarkEditor((v) => {
                            const next = !v;
                            if (next) setShowBones(true);
                            return next;
                          });
                        }}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold border transition-all cursor-pointer ${showLandmarkEditor
                            ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                            : 'bg-white/5 border-white/15 text-slate-300 hover:text-white'
                          }`}
                      >
                        🎯 {showLandmarkEditor ? 'Hide Joint Tuner' : 'Adjust Joint Landmarks'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Live Motion Preview Buttons */}
                {rigInfo && rigInfo.rigType !== 'rigid_prop' && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">
                      Test Motion:
                    </span>
                    {(
                      [
                        { id: 'bind', label: '🧍 Bind Pose' },
                        { id: 'idle', label: '🫁 Idle Breathe' },
                        {
                          id: 'walk',
                          label: rigInfo.rigType === 'quadruped' ? '🐾 Trot' : '🚶 Walk',
                        },
                        {
                          id: 'run',
                          label: rigInfo.rigType === 'quadruped' ? '🐎 Gallop' : '🏃 Run',
                        },
                        {
                          id: 'wave',
                          label: rigInfo.rigType === 'quadruped' ? '🐺 Stalk' : '👋 Wave',
                        },
                        {
                          id: 'fight',
                          label: rigInfo.rigType === 'quadruped' ? '🦁 Pounce' : '🥊 Fight',
                        },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPreviewMotion(m.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer ${previewMotion === m.id
                            ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                            : 'bg-black/50 border-white/10 text-slate-400 hover:text-white'
                          }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Interactive Bone Pose & Rotation Controls */}
                {showBonePoseEditor && rigInfo && rigInfo.rigType !== 'rigid_prop' && (
                  <div className="rounded-lg border border-indigo-500/35 bg-black/65 p-2.5 space-y-2 text-[10px] font-mono">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-indigo-300 font-bold">
                        🦴 Interactive Bone Pose &amp; Rotation (Click any 3D joint sphere in viewport or pick bone below)
                      </span>
                      <button
                        type="button"
                        onClick={() => setCustomBonePose({})}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-indigo-200 border border-indigo-500/30 cursor-pointer"
                      >
                        ↺ Reset Bone Pose
                      </button>
                    </div>

                    {/* Bone Selector Pills */}
                    <div className="flex flex-wrap gap-1">
                      {(rigInfo.rigType === 'humanoid'
                        ? ([
                            'Head',
                            'Neck',
                            'Chest',
                            'Spine',
                            'Hips',
                            'LeftArm',
                            'LeftForeArm',
                            'LeftHand',
                            'RightArm',
                            'RightForeArm',
                            'RightHand',
                            'LeftUpLeg',
                            'LeftLeg',
                            'LeftFoot',
                            'RightUpLeg',
                            'RightLeg',
                            'RightFoot',
                          ] as HumanoidBone[])
                        : (['Hips', 'Spine', 'Chest', 'Neck', 'Head'] as HumanoidBone[])
                      ).map((bName) => {
                        const hasEdit = Boolean(
                          customBonePose[bName] &&
                            (Math.abs(customBonePose[bName]![0]) > 0.01 ||
                              Math.abs(customBonePose[bName]![1]) > 0.01 ||
                              Math.abs(customBonePose[bName]![2]) > 0.01)
                        );
                        return (
                          <button
                            key={bName}
                            type="button"
                            onClick={() => {
                              setSelectedPreviewBone(bName);
                              setShowBones(true);
                              setPreviewMotion('bind');
                            }}
                            className={`px-2 py-0.5 rounded border text-[9.5px] font-semibold transition-all cursor-pointer ${
                              selectedPreviewBone === bName
                                ? 'bg-indigo-500/30 border-indigo-400 text-indigo-100'
                                : hasEdit
                                  ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                            }`}
                          >
                            {bName}
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected Bone X / Y / Z Rotation Sliders (in degrees) */}
                    {(() => {
                      const curEuler = customBonePose[selectedPreviewBone] || [0, 0, 0];
                      const degX = Math.round((curEuler[0] * 180) / Math.PI);
                      const degY = Math.round((curEuler[1] * 180) / Math.PI);
                      const degZ = Math.round((curEuler[2] * 180) / Math.PI);
                      const updateAxis = (axisIdx: 0 | 1 | 2, degVal: number) => {
                        const radVal = (degVal * Math.PI) / 180;
                        setPreviewMotion('bind');
                        setShowBones(true);
                        setCustomBonePose((prev) => {
                          const existing = prev[selectedPreviewBone] || [0, 0, 0];
                          const nextTuple: [number, number, number] = [
                            existing[0],
                            existing[1],
                            existing[2],
                          ];
                          nextTuple[axisIdx] = radVal;
                          return {
                            ...prev,
                            [selectedPreviewBone]: nextTuple,
                          };
                        });
                      };
                      return (
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <label className="flex flex-col gap-0.5 text-slate-300">
                            <span>
                              {selectedPreviewBone} Pitch (X): {degX}°
                            </span>
                            <input
                              type="range"
                              min={-120}
                              max={120}
                              step={1}
                              value={degX}
                              onChange={(e) => updateAxis(0, Number(e.target.value))}
                              className="accent-indigo-400"
                            />
                          </label>
                          <label className="flex flex-col gap-0.5 text-slate-300">
                            <span>
                              {selectedPreviewBone} Twist (Y): {degY}°
                            </span>
                            <input
                              type="range"
                              min={-120}
                              max={120}
                              step={1}
                              value={degY}
                              onChange={(e) => updateAxis(1, Number(e.target.value))}
                              className="accent-indigo-400"
                            />
                          </label>
                          <label className="flex flex-col gap-0.5 text-slate-300">
                            <span>
                              {selectedPreviewBone} Roll (Z): {degZ}°
                            </span>
                            <input
                              type="range"
                              min={-120}
                              max={120}
                              step={1}
                              value={degZ}
                              onChange={(e) => updateAxis(2, Number(e.target.value))}
                              className="accent-indigo-400"
                            />
                          </label>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Interactive Joint Landmark Fine-Tuner Sliders */}
                {showLandmarkEditor && rigInfo && rigInfo.rigType !== 'rigid_prop' && (
                  <div className="rounded-lg border border-amber-500/30 bg-black/60 p-2.5 space-y-2 text-[10px] font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-300 font-bold">
                        🎯 Silhouette Joint Landmark Fine-Tuner (Symmetrical L/R)
                      </span>
                      <button
                        type="button"
                        onClick={() => setCustomLandmarks(null)}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-cyan-200 border border-cyan-500/30 cursor-pointer"
                      >
                        ↺ Reset Auto-Fit
                      </button>
                    </div>

                    {rigInfo.rigType === 'humanoid' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <label className="flex flex-col gap-0.5 text-slate-300">
                          <span>
                            Shoulder Height:{' '}
                            {Math.round(
                              ((customLandmarks?.shoulderY ?? rigInfo.landmarks.shoulderY) || 0.78) *
                              100
                            )}
                            %
                          </span>
                          <input
                            type="range"
                            min={0.68}
                            max={0.86}
                            step={0.005}
                            value={customLandmarks?.shoulderY ?? rigInfo.landmarks.shoulderY}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setCustomLandmarks((prev) => ({
                                ...(prev || rigInfo.landmarks),
                                shoulderY: val,
                              }));
                            }}
                            className="accent-amber-400"
                          />
                        </label>

                        <label className="flex flex-col gap-0.5 text-slate-300">
                          <span>
                            Shoulder Width:{' '}
                            {Math.round(
                              ((customLandmarks?.shoulderSpanX ??
                                rigInfo.landmarks.shoulderSpanX) ||
                                0.145) * 100
                            )}
                            %
                          </span>
                          <input
                            type="range"
                            min={0.09}
                            max={0.24}
                            step={0.005}
                            value={
                              customLandmarks?.shoulderSpanX ?? rigInfo.landmarks.shoulderSpanX
                            }
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setCustomLandmarks((prev) => ({
                                ...(prev || rigInfo.landmarks),
                                shoulderSpanX: val,
                              }));
                            }}
                            className="accent-amber-400"
                          />
                        </label>

                        <label className="flex flex-col gap-0.5 text-slate-300">
                          <span>
                            Wrist Span X:{' '}
                            {Math.round(
                              ((customLandmarks?.wristPos?.[0] ??
                                rigInfo.landmarks.wristPos[0]) ||
                                0.28) * 100
                            )}
                            %
                          </span>
                          <input
                            type="range"
                            min={0.14}
                            max={0.46}
                            step={0.005}
                            value={customLandmarks?.wristPos?.[0] ?? rigInfo.landmarks.wristPos[0]}
                            onChange={(e) => {
                              const wx = Number(e.target.value);
                              const curW = customLandmarks?.wristPos ?? rigInfo.landmarks.wristPos;
                              const shX =
                                customLandmarks?.shoulderSpanX ?? rigInfo.landmarks.shoulderSpanX;
                              const curE = customLandmarks?.elbowPos ?? rigInfo.landmarks.elbowPos;
                              setCustomLandmarks((prev) => ({
                                ...(prev || rigInfo.landmarks),
                                wristPos: [wx, curW[1], curW[2]],
                                elbowPos: [(shX + wx) * 0.5, curE[1], curE[2]],
                              }));
                            }}
                            className="accent-amber-400"
                          />
                        </label>

                        <label className="flex flex-col gap-0.5 text-slate-300">
                          <span>
                            Wrist Height Y:{' '}
                            {Math.round(
                              ((customLandmarks?.wristPos?.[1] ??
                                rigInfo.landmarks.wristPos[1]) ||
                                0.52) * 100
                            )}
                            %
                          </span>
                          <input
                            type="range"
                            min={0.42}
                            max={0.82}
                            step={0.005}
                            value={customLandmarks?.wristPos?.[1] ?? rigInfo.landmarks.wristPos[1]}
                            onChange={(e) => {
                              const wy = Number(e.target.value);
                              const curW = customLandmarks?.wristPos ?? rigInfo.landmarks.wristPos;
                              const shY =
                                customLandmarks?.shoulderY ?? rigInfo.landmarks.shoulderY;
                              const curE = customLandmarks?.elbowPos ?? rigInfo.landmarks.elbowPos;
                              setCustomLandmarks((prev) => ({
                                ...(prev || rigInfo.landmarks),
                                wristPos: [curW[0], wy, curW[2]],
                                elbowPos: [curE[0], (shY + wy) * 0.5, curE[2]],
                              }));
                            }}
                            className="accent-amber-400"
                          />
                        </label>

                        <label className="flex flex-col gap-0.5 text-slate-300">
                          <span>
                            Hips / Groin Y:{' '}
                            {Math.round(
                              ((customLandmarks?.hipsY ?? rigInfo.landmarks.hipsY) || 0.52) * 100
                            )}
                            %
                          </span>
                          <input
                            type="range"
                            min={0.42}
                            max={0.62}
                            step={0.005}
                            value={customLandmarks?.hipsY ?? rigInfo.landmarks.hipsY}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setCustomLandmarks((prev) => ({
                                ...(prev || rigInfo.landmarks),
                                hipsY: val,
                              }));
                            }}
                            className="accent-amber-400"
                          />
                        </label>

                        <label className="flex flex-col gap-0.5 text-slate-300">
                          <span>
                            Leg Stance X:{' '}
                            {Math.round(
                              ((customLandmarks?.anklePos?.[0] ??
                                rigInfo.landmarks.anklePos[0]) ||
                                0.09) * 100
                            )}
                            %
                          </span>
                          <input
                            type="range"
                            min={0.04}
                            max={0.22}
                            step={0.005}
                            value={customLandmarks?.anklePos?.[0] ?? rigInfo.landmarks.anklePos[0]}
                            onChange={(e) => {
                              const ax = Number(e.target.value);
                              const curA = customLandmarks?.anklePos ?? rigInfo.landmarks.anklePos;
                              const curK = customLandmarks?.kneePos ?? rigInfo.landmarks.kneePos;
                              setCustomLandmarks((prev) => ({
                                ...(prev || rigInfo.landmarks),
                                anklePos: [ax, curA[1], curA[2]],
                                kneePos: [ax * 0.95, curK[1], curK[2]],
                                hipSpanX: Math.max(0.06, ax * 0.85),
                              }));
                            }}
                            className="accent-amber-400"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        <label className="flex flex-col gap-0.5 text-slate-300">
                          <span>
                            Spine Height:{' '}
                            {Math.round(
                              ((customLandmarks?.quadSpineY ??
                                rigInfo.landmarks.quadSpineY ??
                                0.58) ||
                                0.58) * 100
                            )}
                            %
                          </span>
                          <input
                            type="range"
                            min={0.4}
                            max={0.78}
                            step={0.01}
                            value={
                              customLandmarks?.quadSpineY ?? rigInfo.landmarks.quadSpineY ?? 0.58
                            }
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setCustomLandmarks((prev) => ({
                                ...(prev || rigInfo.landmarks),
                                quadSpineY: val,
                              }));
                            }}
                            className="accent-amber-400"
                          />
                        </label>

                        <label className="flex flex-col gap-0.5 text-slate-300">
                          <span>
                            Front Leg Z:{' '}
                            {Math.round(
                              ((customLandmarks?.quadFrontLegZ ??
                                rigInfo.landmarks.quadFrontLegZ ??
                                0.24) ||
                                0.24) * 100
                            )}
                            %
                          </span>
                          <input
                            type="range"
                            min={-0.45}
                            max={0.45}
                            step={0.01}
                            value={
                              customLandmarks?.quadFrontLegZ ??
                              rigInfo.landmarks.quadFrontLegZ ??
                              0.24
                            }
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setCustomLandmarks((prev) => ({
                                ...(prev || rigInfo.landmarks),
                                quadFrontLegZ: val,
                              }));
                            }}
                            className="accent-amber-400"
                          />
                        </label>

                        <label className="flex flex-col gap-0.5 text-slate-300">
                          <span>
                            Back Leg Z:{' '}
                            {Math.round(
                              ((customLandmarks?.quadBackLegZ ??
                                rigInfo.landmarks.quadBackLegZ ??
                                -0.24) ||
                                -0.24) * 100
                            )}
                            %
                          </span>
                          <input
                            type="range"
                            min={-0.45}
                            max={0.45}
                            step={0.01}
                            value={
                              customLandmarks?.quadBackLegZ ??
                              rigInfo.landmarks.quadBackLegZ ??
                              -0.24
                            }
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setCustomLandmarks((prev) => ({
                                ...(prev || rigInfo.landmarks),
                                quadBackLegZ: val,
                              }));
                            }}
                            className="accent-amber-400"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Action Bar */}
            <div className="px-4 py-3 border-t border-white/10 bg-[#101420] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="text-[11px] font-mono text-slate-400 truncate min-w-0 flex-1 max-w-[180px]">
                {generatedResult ? (
                  <span className="text-emerald-300 font-semibold" title={generatedResult.diskPath}>
                    {generatedResult.filename}
                  </span>
                ) : (
                  <span>No .GLB generated yet</span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                {generatedResult && (
                  <button
                    type="button"
                    onClick={handleDownloadGlb}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-semibold text-slate-100 cursor-pointer transition-all shrink-0"
                    title="Download generated .GLB file to your PC"
                  >
                    <Download className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
                    <span>Download .GLB</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={!generatedResult}
                  onClick={handleSaveToLibrary}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-[11px] font-bold text-white shadow-md shadow-indigo-600/20 cursor-pointer transition-all shrink-0"
                >
                  {savedLibrarySuccess ? (
                    <>
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <span>Save to Library</span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!generatedResult}
                  onClick={handleAddToScene}
                  className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 text-[11px] font-bold text-black shadow-md shadow-amber-500/20 cursor-pointer transition-all shrink-0"
                >
                  {appliedSuccess ? (
                    <>
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span>Added to Scene!</span>
                    </>
                  ) : (
                    <span>{targetActorId ? 'Apply .GLB to Actor' : 'Add to Active Scene'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
