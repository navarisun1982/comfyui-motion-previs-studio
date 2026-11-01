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
  FolderOpen,
  RotateCw,
} from 'lucide-react';
import { ReasonerSettingsPanel } from './ReasonerSettingsPanel';
import { useShotStore } from '../stores/useShotStore';
import { useAssetLibraryStore } from '../stores/useAssetLibraryStore';
import { useComfyStore } from '../stores/useComfyStore';
import { loadGltfModel } from '../engine/gltfModelLoader';
import {
  Comfy3DEngineMode,
  Comfy3DQualityMode,
  Comfy3DGenerationResult,
  generate3DGlbInComfy,
} from '../services/comfy3dGenerator';
import {
  listLocalComfyWorkflows,
  normalizeWorkflowUrl,
} from '../pipeline/customWorkflowResolver';

export interface AIGenerator3DProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialImageUrl?: string;
  targetActorId?: string;
  onApplyToScene?: (actorId: string) => void;
}

export const AIGenerator3D: React.FC<AIGenerator3DProps> = ({
  isOpen,
  onClose,
  initialPrompt = '',
  initialImageUrl,
  targetActorId,
  onApplyToScene,
}) => {
  const addActor = useShotStore((s) => s.addActor);
  const updateActor = useShotStore((s) => s.updateActor);
  const uploadGlbFile = useAssetLibraryStore((s) => s.uploadGlbFile);
  const comfyStatus = useComfyStore((s) => s.connectionStatus);
  const comfyStats = useComfyStore((s) => s.systemStats);

  // Input & Actor Metadata
  const [actorName, setActorName] = useState(initialPrompt || 'Hero Character');
  const [actorCategory, setActorCategory] = useState<'human' | 'creature' | 'prop'>('human');
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(initialImageUrl || null);

  // ComfyUI 3D Workflow Controls (#aa77013b-18f1-4679-9678-6d455d3536c5)
  const [engineMode, setEngineMode] = useState<Comfy3DEngineMode>('pixal3d');
  const [qualityMode, setQualityMode] = useState<Comfy3DQualityMode>('fast_vertex');
  const [removeBackground, setRemoveBackground] = useState<boolean>(true);
  const [textureResolution, setTextureResolution] = useState<1024 | 2048 | 4096>(2048);
  const [seed, setSeed] = useState<number>(42);

  // Custom Local 3D Workflow URL / .JSON
  const [workflowSource, setWorkflowSource] = useState<'builtin' | 'custom'>('builtin');
  const [customWorkflowUrl, setCustomWorkflowUrl] = useState<string>('');
  const [customWorkflowJson, setCustomWorkflowJson] = useState<string>('');
  const [customWorkflowLabel, setCustomWorkflowLabel] = useState<string>('');
  const [localWorkflows, setLocalWorkflows] = useState<string[]>([]);
  const [isScanningLocal, setIsScanningLocal] = useState<boolean>(false);

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState('');
  const [stepProgress, setStepProgress] = useState<{ step: number; maxSteps: number } | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Generated .GLB Result & Viewport Controls
  const [generatedResult, setGeneratedResult] = useState<Comfy3DGenerationResult | null>(null);
  const [isWireframe, setIsWireframe] = useState(false);
  const [autoSpin, setAutoSpin] = useState(true);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [savedLibrarySuccess, setSavedLibrarySuccess] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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
    if (initialPrompt && !actorName) setActorName(initialPrompt);
    if (initialImageUrl && !referenceImageUrl) {
      setReferenceImageUrl(initialImageUrl);
    }
  }, [initialPrompt, initialImageUrl]);

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

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;
    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    if (!actorName || actorName === 'Hero Character') {
      setActorName(baseName || 'Hero Character');
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReferenceImageUrl(reader.result as string);
      setGenerationError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Load Custom 3D Workflow from Local URL / Local File Path
  const handleLoadCustomWorkflowUrl = async (targetUrl?: string) => {
    const raw = (targetUrl ?? customWorkflowUrl).trim();
    if (!raw) {
      setGenerationError('Please enter a local ComfyUI 3D workflow URL or file path (.json).');
      return;
    }
    setGenerationError(null);
    try {
      const normalized = normalizeWorkflowUrl(raw);
      const res = await fetch(normalized);
      if (!res.ok) {
        throw new Error(`Failed to load local 3D workflow (HTTP ${res.status}).`);
      }
      const text = await res.text();
      JSON.parse(text);
      setCustomWorkflowJson(text);
      setCustomWorkflowUrl(raw);
      setCustomWorkflowLabel(raw.split(/[\\/]/).pop() || 'custom_3d_workflow.json');
    } catch (err: any) {
      setGenerationError(err?.message || 'Could not load custom 3D workflow JSON.');
    }
  };

  const handleUploadCustomWorkflowFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGenerationError(null);
    try {
      const text = await file.text();
      JSON.parse(text);
      setCustomWorkflowJson(text);
      setCustomWorkflowUrl(file.name);
      setCustomWorkflowLabel(file.name);
    } catch (err: any) {
      setGenerationError(`Invalid workflow JSON in ${file.name}: ${err?.message || 'parse error'}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleScanLocalComfyWorkflows = async () => {
    setIsScanningLocal(true);
    setGenerationError(null);
    try {
      const list = await listLocalComfyWorkflows();
      setLocalWorkflows(list);
    } catch (err: any) {
      setGenerationError(err?.message || 'Could not scan local ComfyUI workflows.');
    } finally {
      setIsScanningLocal(false);
    }
  };

  // Initialize Three.js interactive preview
  useEffect(() => {
    if (!isOpen || !canvasMountRef.current) return;

    const container = canvasMountRef.current;
    const w = container.clientWidth || 480;
    const h = container.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090c14);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Lighting for PBR & Vertex-Colored GLB Models
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 0.9);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff5ea, 2.4);
    dirLight.position.set(5, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
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

    // Mouse Drag Orbit
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
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
      if (autoSpinRef.current && !isDraggingRef.current && modelGroupRef.current?.children.length) {
        orbitRef.current.theta += 0.0045;
        updateCamera();
      }
      renderer.render(scene, camera);
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
        renderer.setSize(nw, nh);
      }
    });
    ro.observe(container);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      ro.disconnect();
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [isOpen]);

  // Mount generated .GLB mesh into the Three.js viewport when `generatedResult` or `isWireframe` changes
  useEffect(() => {
    const group = modelGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
    }

    if (!generatedResult?.blobUrl) return;

    let cancelled = false;
    loadGltfModel(generatedResult.blobUrl)
      .then((loaded) => {
        if (cancelled) return;
        loaded.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
              if (m && 'wireframe' in m) {
                (m as any).wireframe = isWireframe;
              }
            }
          }
        });
        group.add(loaded.scene);

        const box = new THREE.Box3().setFromObject(loaded.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 1.0);
        orbitRef.current.radius = maxDim * 1.65;
        targetLookAtRef.current.copy(center);
        updateCameraRef.current?.();
      })
      .catch((err) => {
        console.error('Failed to display generated GLB in preview:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [generatedResult, isWireframe]);

  // Execute ComfyUI 3D .GLB Generation
  const handleGenerateGlb = async () => {
    if (!referenceImageUrl) {
      setGenerationError('Please upload a reference character or object image first.');
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
    setGenerationStage('Connecting to local ComfyUI & uploading reference image...');

    try {
      const result = await generate3DGlbInComfy({
        imageDataUrl: referenceImageUrl,
        actorName: actorName.trim() || 'Hero Character',
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

  // Save generated .GLB to 3D Asset Library
  const handleSaveToLibrary = async () => {
    if (!generatedResult) return;
    await uploadGlbFile(generatedResult.glbFile);
    setSavedLibrarySuccess(true);
    setTimeout(() => setSavedLibrarySuccess(false), 1500);
  };

  // Add or apply generated .GLB character/object to active 3D scene
  // Auto-syncs `conceptImageUrl: referenceImageUrl` so <picture 1> is immediately bound for MiniMax H3 video rendering!
  const handleAddToScene = () => {
    if (!generatedResult) return;
    const cleanName = actorName.trim() || 'ComfyUI 3D Character';

    if (targetActorId) {
      updateActor(targetActorId, {
        name: cleanName,
        kind: actorCategory,
        modelUrl: generatedResult.blobUrl,
        conceptImageUrl: referenceImageUrl || undefined,
      });
    } else {
      addActor(cleanName, actorCategory, cleanName, {
        modelUrl: generatedResult.blobUrl,
        conceptImageUrl: referenceImageUrl || undefined,
      });
    }

    setAppliedSuccess(true);
    setTimeout(() => {
      setAppliedSuccess(false);
      onApplyToScene?.(cleanName);
      onClose();
    }, 500);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-5xl h-[90vh] max-h-[880px] bg-[#0b0e17] border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Studio Settings Modal Overlay */}
        {showSettingsModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
            <div className="w-full max-w-2xl">
              <ReasonerSettingsPanel onClose={() => setShowSettingsModal(false)} />
            </div>
          </div>
        )}

        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-white/10 bg-[#111624] shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-500 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  ComfyUI 3D Character &amp; Object Studio (.GLB)
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/35 font-semibold">
                  Pixal3D • TRELLIS.2 • BiRefNet
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Turn any character or object concept image into a real textured 3D <code className="text-cyan-300">.GLB</code> mesh via local ComfyUI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center gap-1.5 text-[11px] font-mono text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-white/25 transition-all cursor-pointer"
              title="Open ComfyUI & Workflow Settings"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  comfyStatus === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span>
                {comfyStatus === 'connected'
                  ? `ComfyUI Online${comfyStats ? ` • ${comfyStats.vramTotalGb}GB` : ''}`
                  : 'ComfyUI Offline'}
              </span>
              <Settings className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 text-slate-300 hover:text-white hover:bg-rose-500/25 hover:border-rose-400/40 text-xs font-semibold transition-colors cursor-pointer"
              title="Close 3D Generator"
            >
              <X className="h-4 w-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Main Two-Column Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* LEFT COLUMN (5 Cols): Image Input + ComfyUI 3D Controls */}
          <div className="lg:col-span-5 border-r border-white/10 bg-[#0d111c] p-4 overflow-y-auto space-y-3.5">
            {/* 1. Reference Image Upload */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono uppercase tracking-wider text-slate-300 font-bold flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5 text-cyan-400" />
                  1. Character / Object Reference Image
                </label>
                {referenceImageUrl && (
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
                onClick={(e) => e.stopPropagation()}
                onChange={handleImageFileChange}
                className="hidden"
              />

              {!referenceImageUrl ? (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = () => setReferenceImageUrl(reader.result as string);
                      reader.readAsDataURL(file);
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
                  </div>
                </div>
              )}
            </div>

            {/* 2. Actor Name & Category */}
            <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-2.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-300 font-bold">
                2. Actor Name &amp; Stage Category
              </div>
              <input
                type="text"
                value={actorName}
                onChange={(e) => setActorName(e.target.value)}
                placeholder="e.g. Elven Archer, Cyberpunk Scout, Sci-Fi Rover..."
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
                    onClick={() => setActorCategory(cat.id)}
                    className={`py-1.5 px-2 rounded-lg font-semibold border transition-all cursor-pointer truncate ${
                      actorCategory === cat.id
                        ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. ComfyUI 3D Engine & Quality Controls (#aa77013b) */}
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/15 p-3 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-indigo-200 uppercase tracking-wider">
                  3. ComfyUI 3D Engine &amp; Mesh Settings
                </span>
                <div className="flex rounded-lg bg-black/60 p-0.5 border border-white/10 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setWorkflowSource('builtin')}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                      workflowSource === 'builtin'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Built-in (#aa77013b)
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkflowSource('custom')}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                      workflowSource === 'custom'
                        ? 'bg-cyan-500 text-black font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Custom 3D .JSON
                  </button>
                </div>
              </div>

              {workflowSource === 'custom' ? (
                <div className="space-y-2 pt-1 border-t border-white/10">
                  <div className="text-[10px] text-slate-300">
                    Load any local ComfyUI 3D workflow (e.g. <code className="text-cyan-300">StableFast3D_to_Mesh.json</code> or custom local URL/path):
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={customWorkflowUrl}
                      onChange={(e) => setCustomWorkflowUrl(e.target.value)}
                      placeholder="D:\ComfyUI\custom_nodes\ComfyUI-3D-Pack\_Example_Workflows\StableFast3D_to_Mesh.json"
                      className="flex-1 rounded-lg bg-black/70 border border-white/15 px-2.5 py-1.5 text-[10.5px] text-white placeholder-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleLoadCustomWorkflowUrl()}
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-[10px] cursor-pointer shrink-0"
                    >
                      Load
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleLoadCustomWorkflowUrl(
                          'D:\\ComfyUI\\custom_nodes\\ComfyUI-3D-Pack\\_Example_Workflows\\StableFast3D_to_Mesh.json'
                        )
                      }
                      className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[10px] text-cyan-200 border border-cyan-500/30 cursor-pointer"
                    >
                      ⚡ Load Installed StableFast3D_to_Mesh.json
                    </button>
                    <button
                      type="button"
                      onClick={handleScanLocalComfyWorkflows}
                      disabled={isScanningLocal}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-[10px] text-indigo-200 border border-indigo-400/30 cursor-pointer"
                    >
                      <FolderOpen className="h-3 w-3" />
                      <span>{isScanningLocal ? 'Scanning...' : 'Scan Local ComfyUI'}</span>
                    </button>
                    <label className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-[10px] text-slate-200 border border-white/15 cursor-pointer">
                      <Upload className="h-3 w-3 text-cyan-300" />
                      <span>Upload .JSON</span>
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleUploadCustomWorkflowFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {localWorkflows.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {localWorkflows.map((wf) => (
                        <button
                          key={wf}
                          type="button"
                          onClick={() => handleLoadCustomWorkflowUrl(wf)}
                          className="px-1.5 py-0.5 rounded bg-indigo-500/20 hover:bg-cyan-500/30 text-[9.5px] text-indigo-100 border border-indigo-400/30 cursor-pointer"
                        >
                          📄 {wf}
                        </button>
                      ))}
                    </div>
                  )}
                  {customWorkflowLabel && (
                    <div className="text-[10px] text-emerald-300 font-semibold">
                      ✓ Active Custom 3D Workflow: {customWorkflowLabel}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Model Switch: Pixal3D vs. TRELLIS.2 */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400">
                      3D Diffusion Model (Installed in <code className="text-slate-300">D:\ComfyUI\models\</code>)
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEngineMode('pixal3d')}
                        className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                          engineMode === 'pixal3d'
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
                        className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                          engineMode === 'trellis2'
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
                        className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                          qualityMode === 'fast_vertex'
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
                        className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                          qualityMode === 'full_pbr'
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
                </>
              )}

              {/* Background Removal Toggle + Texture Resolution + Seed */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Auto Cutout</label>
                  <button
                    type="button"
                    onClick={() => setRemoveBackground((v) => !v)}
                    className={`py-1.5 px-2 rounded-lg border text-[10.5px] font-bold transition-all cursor-pointer truncate ${
                      removeBackground
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

            {/* 4. Generate 3D .GLB Button */}
            <button
              type="button"
              onClick={handleGenerateGlb}
              disabled={isGenerating || !referenceImageUrl}
              className="w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-cyan-500 via-indigo-600 to-violet-600 hover:brightness-110 disabled:opacity-40 shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generating 3D .GLB in ComfyUI ({elapsedSec}s)...</span>
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  <span>
                    {generatedResult
                      ? 'Re-Generate 3D .GLB in ComfyUI'
                      : 'Generate 3D .GLB in ComfyUI'}
                  </span>
                </>
              )}
            </button>

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
          <div className="lg:col-span-7 flex flex-col bg-[#080a10] relative min-h-[380px]">
            {/* Top Viewport Overlay Badges & Controls */}
            <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
                {generatedResult ? (
                  <>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11px] font-mono font-bold">
                      ✓ .GLB Ready • {(generatedResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-black/75 border border-white/15 text-slate-200 text-[10.5px] font-mono">
                      {generatedResult.vertexCount.toLocaleString()} verts •{' '}
                      {generatedResult.triangleCount.toLocaleString()} tris
                    </span>
                  </>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-black/70 border border-white/10 text-slate-400 text-[11px] font-mono">
                    3D .GLB Preview Stage (Drag to Orbit • Scroll to Zoom)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setAutoSpin((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10.5px] font-mono font-semibold cursor-pointer ${
                    autoSpin
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
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10.5px] font-mono font-semibold cursor-pointer ${
                    isWireframe
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
            <div ref={canvasMountRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing" />

            {/* Empty State Guidance Overlay when no .GLB is generated yet */}
            {!generatedResult && !isGenerating && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
                <div className="max-w-md rounded-2xl border border-white/10 bg-black/75 backdrop-blur-md p-5 text-center space-y-2">
                  <Sparkles className="h-7 w-7 text-cyan-400 mx-auto" />
                  <div className="text-sm font-bold text-white">
                    Upload an Image &amp; Click &ldquo;Generate 3D .GLB in ComfyUI&rdquo;
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Your local ComfyUI server (<code className="text-cyan-300">http://127.0.0.1:8188</code>) will remove the background with <strong>BiRefNet</strong>, reconstruct the 3D geometry and textures using <strong>Pixal3D</strong> or <strong>TRELLIS.2</strong>, and load the resulting <code className="text-cyan-300">.GLB</code> model right here.
                  </p>
                </div>
              </div>
            )}

            {/* Bottom Action Bar */}
            <div className="px-5 py-3.5 border-t border-white/10 bg-[#101420] flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs font-mono text-slate-400 truncate max-w-[260px]">
                {generatedResult ? (
                  <span className="text-emerald-300 font-semibold" title={generatedResult.diskPath}>
                    {generatedResult.filename}
                  </span>
                ) : (
                  <span>No .GLB generated yet</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {generatedResult && (
                  <button
                    type="button"
                    onClick={handleDownloadGlb}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-slate-100 cursor-pointer transition-all"
                    title="Download generated .GLB file to your PC"
                  >
                    <Download className="h-3.5 w-3.5 text-cyan-300" />
                    <span>Download .GLB</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={!generatedResult}
                  onClick={handleSaveToLibrary}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-bold text-white shadow-md shadow-indigo-600/20 cursor-pointer transition-all"
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
                  disabled={!generatedResult}
                  onClick={handleAddToScene}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 text-xs font-bold text-black shadow-md shadow-amber-500/20 cursor-pointer transition-all"
                >
                  {appliedSuccess ? (
                    <>
                      <Check className="h-4 w-4" />
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
