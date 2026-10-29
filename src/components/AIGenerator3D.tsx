import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import {
  Sparkles,
  Upload,
  X,
  Check,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Box,
  Layers,
  Sliders,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Zap,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { ReasonerSettingsPanel } from './ReasonerSettingsPanel';
import {
  SculptSpec,
  buildSculpt,
  registerSculptSpec,
} from '../engine/procedural3D/sculptSpec';
import {
  SilhouetteMask,
  SilhouetteMetrics,
  ExtractedPalette,
  extractMaskFromImageUrl,
  generateMaskDataUrl,
  renderSculptSilhouette,
  computeSilhouetteIoU,
} from '../engine/procedural3D/silhouette';
import {
  reasonSculpt,
  describeReasoner,
  getReasonerConfig,
  ObjectReasonerError,
} from '../services/objectReasoner';
import { useShotStore } from '../stores/useShotStore';
import { useAssetLibraryStore, Asset3DItem } from '../stores/useAssetLibraryStore';
import { createSkinnedCharacterFromConcept, type HumanoidRig } from '../engine/kinematics';
import { synthesizeRecipeFromImage, isHumanoidPrompt } from '../engine/procedural3D/imageToRecipe';

export interface AIGenerator3DProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialImageUrl?: string;
  onApplyToScene?: (actorId: string) => void;
}

export const AIGenerator3D: React.FC<AIGenerator3DProps> = ({
  isOpen,
  onClose,
  initialPrompt = '',
  initialImageUrl,
  onApplyToScene,
}) => {
  const addActor = useShotStore((s) => s.addActor);

  // Input states
  const [prompt, setPrompt] = useState(initialPrompt);
  const [name, setName] = useState('');
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(initialImageUrl || null);
  const [referenceMask, setReferenceMask] = useState<SilhouetteMask | null>(null);
  const [referenceMetrics, setReferenceMetrics] = useState<SilhouetteMetrics | null>(null);
  const [referencePalette, setReferencePalette] = useState<ExtractedPalette | null>(null);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const [showMaskOverlay, setShowMaskOverlay] = useState(false);

  // Generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Resulting 3D Spec & Rig
  const [sculpt, setSculpt] = useState<SculptSpec | null>(null);
  const [characterRig, setCharacterRig] = useState<HumanoidRig | null>(null);
  const [displayMode, setDisplayMode] = useState<'skinned' | 'parametric'>('parametric');
  const [currentIoU, setCurrentIoU] = useState<number | null>(null);
  const [isWireframe, setIsWireframe] = useState(false);
  const [showPartList, setShowPartList] = useState(false);

  // Revision states
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [showReasonerSettings, setShowReasonerSettings] = useState(false);
  const [reasonerRev, setReasonerRev] = useState(0);

  const cfg = useMemo(() => getReasonerConfig(), [reasonerRev]);
  const reasonerDesc = useMemo(() => describeReasoner(cfg), [cfg]);

  // 3D Canvas Mount Ref
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const orbitRef = useRef({ theta: 0.35, phi: 0.28, radius: 4.5 });
  const targetLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.0, 0));
  const updateCameraRef = useRef<(() => void) | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize from initial props
  useEffect(() => {
    if (initialPrompt && !prompt) setPrompt(initialPrompt);
    if (initialImageUrl && !referenceImageUrl) {
      setReferenceImageUrl(initialImageUrl);
      processImageForSilhouette(initialImageUrl);
    }
  }, [initialPrompt, initialImageUrl]);

  // Elapsed timer during generation
  useEffect(() => {
    if (!isGenerating && !isRefining) return;
    const started = Date.now();
    setElapsedSec(0);
    const interval = window.setInterval(() => {
      setElapsedSec(Math.round((Date.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(interval);
  }, [isGenerating, isRefining]);

  // Process reference image to extract silhouette & geometry metrics
  const processImageForSilhouette = async (url: string) => {
    try {
      const { mask, metrics, palette, canvasDataUrl } = await extractMaskFromImageUrl(url, 512);
      setReferenceMask(mask);
      setReferenceMetrics(metrics);
      setReferencePalette(palette);
      const preview = generateMaskDataUrl(mask, [6, 182, 212, 230]);
      setMaskPreviewUrl(preview);
      setReferenceImageUrl(canvasDataUrl);

      // Instantly synthesize a 3D procedural sculpt matching the reference image
      const cleanPrompt = (prompt || name || '').trim();
      const initialSculpt = synthesizeRecipeFromImage({
        name: cleanPrompt || '3D Object',
        prompt: cleanPrompt,
        metrics,
        palette,
      });
      setSculpt(initialSculpt);
      if (!name && initialSculpt.name && initialSculpt.name !== '3D Object' && initialSculpt.name !== 'Sculpted Prop') {
        setName(initialSculpt.name);
      }
      setDisplayMode('parametric');

      const initialIoU = evaluateSilhouetteMatch(initialSculpt, mask);
      setCurrentIoU(initialIoU);

      // Only attempt to build a skinned character rig IF the user explicitly requested a humanoid character
      if (isHumanoidPrompt(cleanPrompt)) {
        try {
          const rig = await createSkinnedCharacterFromConcept(canvasDataUrl, cleanPrompt);
          setCharacterRig(rig);
          setDisplayMode('skinned');
        } catch (rigErr) {
          console.warn('Could not auto-generate skinned rig from concept:', rigErr);
        }
      } else {
        setCharacterRig(null);
      }
    } catch (err) {
      console.warn('Could not extract silhouette from image:', err);
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setReferenceImageUrl(dataUrl);
      await processImageForSilhouette(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  // Evaluate IoU between current sculpt and reference mask
  const evaluateSilhouetteMatch = useCallback(
    (spec: SculptSpec, refMask: SilhouetteMask | null): number | null => {
      if (!refMask) return null;
      try {
        const sculptMask = renderSculptSilhouette(spec, 128);
        const iou = computeSilhouetteIoU(refMask, sculptMask, 64);
        return iou;
      } catch (err) {
        console.warn('Failed to compute silhouette IoU:', err);
        return null;
      }
    },
    []
  );

  // Initialize Three.js interactive preview
  useEffect(() => {
    if (!isOpen || !canvasMountRef.current) return;

    const container = canvasMountRef.current;
    const w = container.clientWidth || 480;
    const h = container.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0e14);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff5ea, 2.2);
    dirLight.position.set(5, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 1.4);
    rimLight.position.set(-6, 4, -5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xa855f7, 0.8);
    fillLight.position.set(0, -4, -4);
    scene.add(fillLight);

    // Ground Grid
    const grid = new THREE.GridHelper(10, 20, 0xd4af37, 0x1e293b);
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
      camera.position.set(x, Math.max(0.2, y), z);
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
      orbitRef.current.phi = Math.max(0.08, Math.min(Math.PI * 0.48, orbitRef.current.phi - dy * 0.008));
      updateCamera();
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.radius = Math.max(1.2, Math.min(15, orbitRef.current.radius + e.deltaY * 0.005));
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

  // Update 3D Model when sculpt or isWireframe changes
  useEffect(() => {
    const group = modelGroupRef.current;
    if (!group) return;

    // Clear previous children
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
    }

    // If skinned rig mode is active and characterRig is loaded, display it
    if (displayMode === 'skinned' && characterRig) {
      characterRig.root.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const m = c as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
          if (isWireframe && (m.material as any)) {
            (m.material as any).wireframe = true;
          }
        }
      });
      group.add(characterRig.root);

      const box = new THREE.Box3().setFromObject(characterRig.root);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1.0);
      orbitRef.current.radius = maxDim * 1.5;
      targetLookAtRef.current.copy(center);
      updateCameraRef.current?.();
      return;
    }

    if (!sculpt) return;

    try {
      const kit = buildSculpt(sculpt);
      kit.group.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const m = c as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
          if (isWireframe && (m.material as any)) {
            (m.material as any).wireframe = true;
          }
        }
      });
      group.add(kit.group);

      // Center model and adjust orbit distance to fit object height
      const box = new THREE.Box3().setFromObject(kit.group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 1.0);
      orbitRef.current.radius = maxDim * 2.0;
      targetLookAtRef.current.copy(center);
      updateCameraRef.current?.();
    } catch (err) {
      console.error('Failed to construct 3D mesh from sculpt spec:', err);
    }
  }, [sculpt, characterRig, displayMode, isWireframe]);

  // Execute initial generation
  const handleGenerate = async () => {
    const cleanPrompt = (prompt || name).trim();
    if (!cleanPrompt && !referenceImageUrl) {
      setGenerationError('Please provide a prompt description or reference image.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationStage('Connecting to procedural 3D reasoner...');

    const inferredHint = referenceMetrics
      ? referenceMetrics.aspectRatio < 0.85
        ? 'shallow container or tray with perimeter rim'
        : referenceMetrics.aspectRatio > 1.8
          ? 'slender bottle, cylinder, or upright container'
          : 'volumetric prop or container'
      : 'reference object';

    const effectivePrompt = cleanPrompt || (referenceImageUrl ? inferredHint : '3d object');
    const isHumanoid = isHumanoidPrompt(effectivePrompt);
    const reasonerPrompt = referenceImageUrl
      ? isHumanoid
        ? `Sculpt the character in the attached reference image (${effectivePrompt}) as a parametric 3D recipe with anatomical proportions, clothing, gear, and sampled image colors.`
        : `Sculpt the prop/object in the attached reference image (${effectivePrompt}) as a clean parametric 3D recipe with accurate primitives (blobs, boxes, cylinders, cones, lathes), parts, and sampled image colors.`
      : effectivePrompt;

    try {
      const generated = await reasonSculpt(reasonerPrompt, {
        imageBase64: referenceImageUrl || undefined,
        silhouetteMeasurements: referenceMetrics || undefined,
        extractedPalette: referencePalette || undefined,
        timeoutMs: 120_000,
        onStage: (s) => setGenerationStage(s),
      });

      setSculpt(generated);
      setName(generated.name || cleanPrompt || '3D Object');

      if (cleanPrompt) {
        registerSculptSpec(cleanPrompt, generated);
      }
      if (effectivePrompt) {
        registerSculptSpec(effectivePrompt, generated);
      }

      // Calculate silhouette IoU match if reference mask is loaded
      if (referenceMask) {
        const iou = evaluateSilhouetteMatch(generated, referenceMask);
        setCurrentIoU(iou);
      } else {
        setCurrentIoU(null);
      }

      // If humanoid character prompt, build the skinned rig with UV projection & 3D gear
      const isHumanoidSubject = generated.rig === 'humanoid' || isHumanoidPrompt(effectivePrompt);
      if (isHumanoidSubject) {
        setGenerationStage('Projecting concept art UVs & mounting 3D gear on humanoid rig...');
        try {
          const rig = await createSkinnedCharacterFromConcept(
            referenceImageUrl || '',
            effectivePrompt,
            { rawModelOutput: generated }
          );
          setCharacterRig(rig);
          setDisplayMode('skinned');
        } catch (rigErr) {
          console.warn('Could not build skinned character rig:', rigErr);
          setDisplayMode('parametric');
        }
      } else {
        setCharacterRig(null);
        setDisplayMode('parametric');
      }
    } catch (err) {
      let msg = err instanceof ObjectReasonerError ? err.message : (err as Error)?.message || 'Generation failed';
      if (msg.includes('did not answer within')) {
        msg += ' (Tip: Heavy local models like 26B/31B can time out when VRAM is tight or competing with ComfyUI. Switch to a lighter model like qwen3.5:9b or Gemini in Reasoner Settings, or generate procedurally below.)';
      }
      // Graceful procedural recovery: synthesize authentic procedural geometric recipe from recognized topology
      // Always synthesize a high-fidelity 3D proxy whether from image or text prompt so the 3D stage is never empty
      try {
        const fallbackSculpt = synthesizeRecipeFromImage({
          name: cleanPrompt || '3D Object',
          prompt: cleanPrompt || effectivePrompt,
          metrics: referenceMetrics || undefined,
          palette: referencePalette || undefined,
        });
        if (fallbackSculpt && fallbackSculpt.parts && fallbackSculpt.parts.length > 0) {
          setSculpt(fallbackSculpt);
          setName(fallbackSculpt.name || cleanPrompt || '3D Object');
          if (cleanPrompt) registerSculptSpec(cleanPrompt, fallbackSculpt);
        }
      } catch (synthErr) {
        console.warn('Procedural fallback synthesis failed:', synthErr);
      }
      setGenerationError(msg);
    } finally {
      setIsGenerating(false);
      setGenerationStage('');
    }
  };

  // Instant offline procedural 3D figure generation (0ms, no LLM required)
  const handleInstantProceduralGenerate = () => {
    const cleanPrompt = prompt.trim();
    const effectivePrompt = cleanPrompt || (referenceImageUrl ? 'reference object' : '3D Object');
    setGenerationError(null);
    setGenerationStage('Synthesizing instant procedural 3D proxy...');
    try {
      const fallbackSculpt = synthesizeRecipeFromImage({
        name: cleanPrompt || '3D Object',
        prompt: cleanPrompt || effectivePrompt,
        metrics: referenceMetrics || undefined,
        palette: referencePalette || undefined,
      });
      if (fallbackSculpt && fallbackSculpt.parts && fallbackSculpt.parts.length > 0) {
        setSculpt(fallbackSculpt);
        setName(fallbackSculpt.name || cleanPrompt || '3D Object');
        if (cleanPrompt) registerSculptSpec(cleanPrompt, fallbackSculpt);
      }
      if (referenceMask && fallbackSculpt) {
        const iou = evaluateSilhouetteMatch(fallbackSculpt, referenceMask);
        setCurrentIoU(iou);
      } else {
        setCurrentIoU(null);
      }
      setCharacterRig(null);
      setDisplayMode('parametric');
    } catch (err: any) {
      setGenerationError(err?.message || 'Procedural generation failed');
    } finally {
      setGenerationStage('');
    }
  };

  // Execute director revision
  const handleRefine = async () => {
    if (!sculpt) return;
    const cleanFeedback = revisionFeedback.trim();
    if (!cleanFeedback) return;

    setIsRefining(true);
    setGenerationError(null);
    setGenerationStage('Refining 3D proportions and silhouette...');

    try {
      const revised = await reasonSculpt(cleanFeedback, {
        reviseSpec: sculpt,
        revisionFeedback: cleanFeedback,
        imageBase64: referenceImageUrl || undefined,
        silhouetteMeasurements: referenceMetrics || undefined,
        extractedPalette: referencePalette || undefined,
        timeoutMs: 120_000,
        onStage: (s) => setGenerationStage(s),
      });

      setSculpt(revised);
      setRevisionFeedback('');

      if (referenceMask) {
        const iou = evaluateSilhouetteMatch(revised, referenceMask);
        setCurrentIoU(iou);
      }
    } catch (err) {
      let msg = err instanceof ObjectReasonerError ? err.message : (err as Error)?.message || 'Refinement failed';
      if (msg.includes('did not answer within')) {
        msg += ' (Tip: Heavy local models like 26B/31B can time out when VRAM is tight or competing with ComfyUI. Switch to a lighter model like qwen3.5:9b or Gemini in Reasoner Settings, or generate procedurally below.)';
      }
      setGenerationError(msg);
    } finally {
      setIsRefining(false);
      setGenerationStage('');
    }
  };

  // Automated Silhouette Optimization Pass
  const handleAutoAlign = async () => {
    if (!sculpt || !referenceMask || !referenceMetrics) return;

    setIsRefining(true);
    setGenerationError(null);
    setGenerationStage('Automated silhouette alignment pass...');

    try {
      const autoFeedback = `Align silhouette tightly with reference. ${referenceMetrics.promptDescription}. Adjust torso and limb proportions to maximize silhouette overlap.`;
      const revised = await reasonSculpt(autoFeedback, {
        reviseSpec: sculpt,
        revisionFeedback: autoFeedback,
        imageBase64: referenceImageUrl || undefined,
        silhouetteMeasurements: referenceMetrics,
        extractedPalette: referencePalette || undefined,
        timeoutMs: 120_000,
        onStage: (s) => setGenerationStage(s),
      });

      const newIoU = evaluateSilhouetteMatch(revised, referenceMask);
      // Keep whichever pass achieves higher IoU
      if (currentIoU === null || (newIoU !== null && newIoU >= currentIoU)) {
        setSculpt(revised);
        setCurrentIoU(newIoU);
      }
    } catch (err) {
      const msg = err instanceof ObjectReasonerError ? err.message : (err as Error)?.message || 'Auto-alignment failed';
      setGenerationError(msg);
    } finally {
      setIsRefining(false);
      setGenerationStage('');
    }
  };

  // Add created actor to active previs scene
  const handleAddToScene = () => {
    if (!sculpt && !characterRig) return;

    const actorName = sculpt?.name || name || '3D Object';
    const actorToken = prompt || actorName;
    const isHumanoid = sculpt?.rig === 'humanoid' || (displayMode === 'skinned' && !!characterRig);
    const kind = sculpt?.route === 'quadruped-walker' ? 'creature' : isHumanoid ? 'human' : 'prop';

    // If using skinned character rig, do not pass blocky sculpt so StagePrevis3D renders the high-fidelity skinned character
    const passSculpt = displayMode === 'skinned' && characterRig ? undefined : (sculpt || undefined);

    addActor(actorName, kind as any, actorToken, {
      conceptImageUrl: referenceImageUrl || undefined,
      sculpt: passSculpt,
      partGraph: passSculpt,
    });

    setAppliedSuccess(true);
    setTimeout(() => {
      setAppliedSuccess(false);
      onApplyToScene?.(actorName);
      onClose();
    }, 600);
  };

  // Save to persistent 3D Asset Library
  const handleSaveToLibrary = () => {
    if (!sculpt) return;
    const cleanName = sculpt.name || name || 'Custom 3D Model';
    const cleanPrompt = prompt || cleanName;
    registerSculptSpec(cleanPrompt, sculpt);

    const assetItem: Asset3DItem = {
      id: `ai-sculpt-${Date.now()}`,
      name: cleanName,
      nameAr: cleanName,
      category: sculpt.route === 'quadruped-walker' ? 'creature' : sculpt.rig === 'humanoid' ? 'character' : 'custom',
      kind: sculpt.route === 'quadruped-walker' ? 'creature' : sculpt.rig === 'humanoid' ? 'human' : 'prop',
      icon: sculpt.rig === 'humanoid' ? '👤' : sculpt.route === 'quadruped-walker' ? '🐾' : '✨',
      tokenPrompt: cleanPrompt,
      isCustom: true,
      scale: 1.0,
      source: 'ai-generated',
      createdAt: new Date().toLocaleDateString(),
      description: `Parametric 3D Figure: ${sculpt.parts.length} parts, ${sculpt.heightMeters.toFixed(2)}m tall, rig: ${sculpt.rig}. ${sculpt.identity || ''}`,
    };

    useAssetLibraryStore.setState((s) => ({
      customAssets: [assetItem, ...s.customAssets],
      selectedCategory: 'custom',
    }));

    setAppliedSuccess(true);
    setTimeout(() => setAppliedSuccess(false), 1200);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[88vh] max-h-[860px] bg-[#0c0e15] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200 font-sans">
        {/* Reasoner Settings Overlay */}
        {showReasonerSettings && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
            <div className="w-full max-w-xl">
              <ReasonerSettingsPanel
                onClose={() => setShowReasonerSettings(false)}
                onSaved={() => {
                  setShowReasonerSettings(false);
                  setReasonerRev((v) => v + 1);
                }}
              />
            </div>
          </div>
        )}

        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#121622] shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  AI 3D Generator
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">
                  Parametric 3D Studio
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Direct concept photos, sketches, and descriptions into parametric 3D visual proxies
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowReasonerSettings(true)}
              className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded border border-white/10 hover:border-white/25 transition-all"
              title="Click to change Reasoner engine or model"
            >
              <span className="text-slate-400">Reasoner:</span>
              <span className="text-cyan-300 font-semibold">{reasonerDesc}</span>
              <Settings className="h-3 w-3 text-slate-400" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Close Generator"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Main Split Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left Column: Input Deck (5 cols) */}
          <div className="md:col-span-5 border-r border-white/10 bg-[#0e111a] p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            {/* 1. Reference Image Dropzone */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-cyan-400" />
                  Reference Image
                </label>
                {referenceImageUrl && (
                  <button
                    onClick={() => {
                      setReferenceImageUrl(null);
                      setReferenceMask(null);
                      setReferenceMetrics(null);
                      setMaskPreviewUrl(null);
                      setCurrentIoU(null);
                    }}
                    className="text-[10px] font-mono text-rose-400 hover:text-rose-300"
                  >
                    Clear Image
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleImageFileChange}
              />

              {referenceImageUrl ? (
                <div className="relative group rounded-xl overflow-hidden border border-cyan-500/30 bg-black/60 h-44 flex items-center justify-center">
                  <img
                    src={showMaskOverlay && maskPreviewUrl ? maskPreviewUrl : referenceImageUrl}
                    alt="Reference Preview"
                    className="w-full h-full object-contain"
                  />

                  {/* Extracted Palette Swatches & Mask Overlay Controls */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/80 backdrop-blur-md px-2 py-1 rounded-full border border-white/10">
                    {referencePalette ? (
                      <>
                        <div
                          className="h-3 w-3 rounded-full border border-white/30"
                          style={{ backgroundColor: referencePalette.primaryColor }}
                          title={`Primary: ${referencePalette.primaryColor}`}
                        />
                        <div
                          className="h-3 w-3 rounded-full border border-white/30"
                          style={{ backgroundColor: referencePalette.secondaryColor }}
                          title={`Secondary: ${referencePalette.secondaryColor}`}
                        />
                        <div
                          className="h-3 w-3 rounded-full border border-white/30"
                          style={{ backgroundColor: referencePalette.accentColor }}
                          title={`Accent: ${referencePalette.accentColor}`}
                        />
                      </>
                    ) : (
                      <span className="text-[9px] font-mono text-slate-400">Sampling...</span>
                    )}
                  </div>

                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    {maskPreviewUrl && (
                      <button
                        onClick={() => setShowMaskOverlay(!showMaskOverlay)}
                        className={`px-2 py-1 rounded text-[10px] font-mono font-semibold flex items-center gap-1 backdrop-blur-md transition-all ${
                          showMaskOverlay
                            ? 'bg-cyan-500 text-black shadow-glow-cyan'
                            : 'bg-black/75 text-cyan-300 border border-cyan-500/40'
                        }`}
                        title="Toggle Silhouette Mask View"
                      >
                        {showMaskOverlay ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        <span>Silhouette</span>
                      </button>
                    )}
                  </div>

                  {/* Silhouette Metrics Footer HUD */}
                  {referenceMetrics && (
                    <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-sm px-3 py-1.5 border-t border-white/10 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-300">
                        Aspect Ratio:{' '}
                        <strong className="text-cyan-300">{referenceMetrics.aspectRatio}:1</strong>
                      </span>
                      <span className="text-slate-300">
                        Center:{' '}
                        <strong className="text-cyan-300">
                          [{referenceMetrics.centerOfMass[0]}, {referenceMetrics.centerOfMass[1]}]
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-dashed border-white/20 hover:border-cyan-400/60 bg-white/[0.02] hover:bg-cyan-950/20 p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group text-center"
                >
                  <div className="h-10 w-10 rounded-full bg-white/5 group-hover:bg-cyan-500/20 flex items-center justify-center text-slate-400 group-hover:text-cyan-300 transition-colors">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-cyan-200">
                      Upload Concept Image or Sketch
                    </div>
                    <div className="text-[10px] text-slate-500">
                      PNG, JPG, WebP · Auto-extracts silhouette for 3D alignment
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Text Prompt Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-amber-400" />
                Prompt / Directorial Description
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. vintage brass telescope on wooden tripod, armored cyberpunk scout in tactical trench coat, stone garden fountain..."
                rows={3}
                className="w-full bg-black/50 border border-white/15 focus:border-amber-400/80 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none transition-all resize-none font-mono"
              />

              {/* Quick Suggestion Chips */}
              <div className="flex flex-wrap gap-1 pt-1">
                {[
                  'Tribal Archer Female',
                  'Vintage Armored Scout',
                  'Brass Telescope',
                  'Stone Fireplace',
                  'Cyberpunk Drone',
                  'Ornate Wooden Chair',
                ].map((sug) => (
                  <button
                    key={sug}
                    onClick={() => {
                      setPrompt(sug);
                      setName(sug);
                    }}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/5 transition-colors"
                  >
                    + {sug}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Primary Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || (!prompt.trim() && !referenceImageUrl)}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 via-indigo-600 to-cyan-600 hover:from-amber-500 hover:via-indigo-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 disabled:opacity-50 transition-all font-mono"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                  <span>
                    Reasoning 3D Figure ({elapsedSec}s)...
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <span>{sculpt ? 'Re-Generate 3D Figure' : 'Generate 3D Figure'}</span>
                </>
              )}
            </button>

            {/* Quick Instant Procedural Action */}
            <button
              type="button"
              onClick={handleInstantProceduralGenerate}
              disabled={isGenerating || (!prompt.trim() && !referenceImageUrl)}
              className="w-full py-1.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-cyan-300 hover:text-cyan-200 text-[11px] font-mono flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
              title="Instantly construct an authentic multi-part 3D model using the local geometric engine (no LLM, 0ms)"
            >
              <Zap className="h-3 w-3 text-cyan-400" />
              <span>Instant Procedural 3D (0ms · No LLM)</span>
            </button>

            {/* Active Stage or Error Status */}
            {generationStage && (
              <div className="px-3 py-2 rounded-lg bg-blue-950/40 border border-blue-500/30 text-[11px] font-mono text-blue-300 flex items-center gap-2 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{generationStage}</span>
              </div>
            )}
            {generationError && (
              <div className="px-3 py-2.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-[11px] font-mono text-rose-300 space-y-2">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div>{generationError}</div>
                    {sculpt && (
                      <div className="text-[10px] text-emerald-300 mt-1">
                        ✓ <strong>Procedural 3D proxy loaded:</strong> A full multi-part 3D model is active in the preview stage.
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-500/20">
                  <button
                    type="button"
                    onClick={() => setShowReasonerSettings(true)}
                    className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[10px] font-mono transition-colors"
                  >
                    ⚙️ Change Reasoner Model
                  </button>
                  <button
                    type="button"
                    onClick={handleInstantProceduralGenerate}
                    className="px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-[10px] font-mono transition-colors"
                  >
                    ⚡ Re-synthesize Procedurally (0ms)
                  </button>
                </div>
              </div>
            )}

            {/* 4. Revision & Refinement Controls (Visible once figure is generated) */}
            {sculpt && (
              <div className="mt-auto pt-3 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-amber-300 flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3" />
                    Refine & Revise Figure
                  </span>
                  {referenceMask && (
                    <button
                      onClick={handleAutoAlign}
                      disabled={isRefining}
                      className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                      title="Automatically optimize proportions to maximize 2D silhouette overlap"
                    >
                      <Zap className="h-2.5 w-2.5" />
                      <span>Auto-Align Silhouette</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={revisionFeedback}
                    onChange={(e) => setRevisionFeedback(e.target.value)}
                    placeholder="e.g. widen torso, make ears longer, thicker legs..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && revisionFeedback.trim()) handleRefine();
                    }}
                    className="flex-1 bg-black/60 border border-white/15 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
                  />
                  <button
                    onClick={handleRefine}
                    disabled={isRefining || !revisionFeedback.trim()}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs disabled:opacity-40 transition-colors font-mono"
                  >
                    {isRefining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refine'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: 3D Interactive Canvas & Match HUD (7 cols) */}
          <div className="md:col-span-7 bg-[#090b10] flex flex-col relative overflow-hidden">
            {/* Viewport Overlay Controls Top-Bar */}
            <div className="absolute top-3 inset-x-3 z-10 flex items-center justify-between pointer-events-none">
              {/* Silhouette IoU Match Badge */}
              <div className="pointer-events-auto flex items-center gap-2">
                {currentIoU !== null && (
                  <div
                    className={`px-3 py-1 rounded-full backdrop-blur-md border text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg ${
                      currentIoU >= 0.75
                        ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 shadow-emerald-950/50'
                        : currentIoU >= 0.5
                        ? 'bg-amber-950/80 border-amber-500/50 text-amber-300 shadow-amber-950/50'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300'
                    }`}
                  >
                    <span>🎯</span>
                    <span>{Math.round(currentIoU * 100)}% Silhouette Match</span>
                  </div>
                )}
                {characterRig && displayMode === 'skinned' ? (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-950/80 backdrop-blur-md border border-emerald-500/40 text-[10px] font-mono text-emerald-300 font-bold flex items-center gap-1.5 shadow-md">
                    <span>✨</span>
                    <span>Skinned 3D (Sculpted Previs)</span>
                  </span>
                ) : sculpt ? (
                  <span className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-slate-300">
                    {sculpt.parts.length} parts · {sculpt.heightMeters.toFixed(2)}m tall ·{' '}
                    {sculpt.rig === 'humanoid' ? 'Rigged (Humanoid)' : 'Static'}
                  </span>
                ) : null}
              </div>

              {/* View mode toggle, Wireframe, and HUD toggles */}
              <div className="pointer-events-auto flex items-center gap-1.5">
                {characterRig && (
                  <div className="flex items-center bg-black/60 rounded-lg p-0.5 border border-white/15 backdrop-blur-md text-[10px] font-mono">
                    <button
                      onClick={() => setDisplayMode('skinned')}
                      className={`px-2 py-0.5 rounded transition-all ${
                        displayMode === 'skinned'
                          ? 'bg-emerald-500 text-black font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Skinned 3D
                    </button>
                    <button
                      onClick={() => setDisplayMode('parametric')}
                      className={`px-2 py-0.5 rounded transition-all ${
                        displayMode === 'parametric'
                          ? 'bg-amber-500 text-black font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Parametric
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setIsWireframe(!isWireframe)}
                  className={`px-2.5 py-1 rounded-lg backdrop-blur-md text-[10px] font-mono border transition-all flex items-center gap-1 ${
                    isWireframe
                      ? 'bg-cyan-500 text-black border-cyan-400 font-bold'
                      : 'bg-black/60 text-slate-300 border-white/15 hover:border-white/30'
                  }`}
                  title="Toggle wireframe topology view"
                >
                  <Box className="h-3 w-3" />
                  <span>Wireframe</span>
                </button>
                {sculpt && (
                  <button
                    onClick={() => setShowPartList(!showPartList)}
                    className={`px-2.5 py-1 rounded-lg backdrop-blur-md text-[10px] font-mono border transition-all flex items-center gap-1 ${
                      showPartList
                        ? 'bg-indigo-600 text-white border-indigo-400 font-bold'
                        : 'bg-black/60 text-slate-300 border-white/15 hover:border-white/30'
                    }`}
                    title="Toggle part breakdown tree"
                  >
                    <Layers className="h-3 w-3" />
                    <span>Parts</span>
                    {showPartList ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* 3D Canvas Mount Point */}
            <div ref={canvasMountRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing relative" />

            {/* Instructions Overlay (When empty) */}
            {!sculpt && !characterRig && !isGenerating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 mb-3">
                  <Box className="h-8 w-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-300 mb-1">
                  Interactive 3D Stage Preview
                </h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Upload an image or enter a description on the left to reason and build a multi-part parametric 3D proxy.
                </p>
              </div>
            )}

            {/* Part List Inspector Drawer */}
            {sculpt && showPartList && (
              <div className="absolute bottom-16 right-3 w-72 max-h-64 bg-black/90 backdrop-blur-md border border-white/15 rounded-xl p-3 z-20 overflow-y-auto custom-scrollbar shadow-2xl font-mono text-[10px]">
                <div className="font-bold text-slate-200 pb-1.5 border-b border-white/10 flex items-center justify-between">
                  <span>Part Hierarchy ({sculpt.parts.length})</span>
                  <span className="text-slate-500 font-normal">Shape / Bone</span>
                </div>
                <div className="space-y-1 pt-1.5">
                  {sculpt.parts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-1 rounded hover:bg-white/5 text-slate-300"
                    >
                      <span className="font-semibold text-white truncate max-w-[120px]">{p.id}</span>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span className="px-1 py-0.2 rounded bg-white/10 text-cyan-300">{p.shape}</span>
                        {p.bone && (
                          <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">{p.bone}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Action Footer Bar */}
            <div className="px-5 py-3 border-t border-white/10 bg-[#0e111a] flex items-center justify-between shrink-0">
              <div className="text-[11px] font-mono text-slate-400">
                {sculpt ? (
                  <span>
                    Ready to place in scene or export: <strong className="text-white">{sculpt.name}</strong>
                  </span>
                ) : (
                  <span>Left-drag to rotate · Scroll to zoom</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-mono text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveToLibrary}
                  disabled={!sculpt}
                  className="px-4 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white font-mono text-xs font-semibold border border-indigo-400/40 disabled:opacity-40 transition-colors shadow-sm"
                  title="Save figure to persistent 3D Asset Library"
                >
                  Save to 3D Library
                </button>
                <button
                  onClick={handleAddToScene}
                  disabled={!sculpt}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-mono text-xs font-bold disabled:opacity-40 transition-all shadow-glow-gold flex items-center gap-1.5"
                >
                  {appliedSuccess ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Added!</span>
                    </>
                  ) : (
                    <span>Add to Active Scene</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
