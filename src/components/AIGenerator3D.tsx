import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  Sparkles,
  Upload,
  X,
  Check,
  Loader2,
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
} from '../engine/procedural3D/silhouette';
import {
  reasonSculpt,
  describeReasoner,
  getReasonerConfig,
  ObjectReasonerError,
} from '../services/objectReasoner';
import { useShotStore } from '../stores/useShotStore';
import {
  useAssetLibraryStore,
  Asset3DItem,
} from '../stores/useAssetLibraryStore';
import { createSkinnedCharacterFromConcept, type HumanoidRig } from '../engine/kinematics';
import {
  synthesizeRecipeFromImage,
  isHumanoidPrompt,
} from '../engine/procedural3D/imageToRecipe';
import {
  extractCharacterFeaturesFromModelOutput,
  compileCharacterToClaySculpt,
} from '../engine/procedural3D/characterClayCompiler';

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
  const [, setReferenceMask] = useState<SilhouetteMask | null>(null);
  const [referenceMetrics, setReferenceMetrics] = useState<SilhouetteMetrics | null>(null);
  const [referencePalette, setReferencePalette] = useState<ExtractedPalette | null>(null);
  const [, setMaskPreviewUrl] = useState<string | null>(null);

  // Generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Resulting 3D Spec & Rig
  const [sculpt, setSculpt] = useState<SculptSpec | null>(null);
  const [characterRig, setCharacterRig] = useState<HumanoidRig | null>(null);
  const [displayMode, setDisplayMode] = useState<'skinned' | 'parametric'>('skinned');
  const [, setCurrentIoU] = useState<number | null>(null);
  const [compareSheetUrl, setCompareSheetUrl] = useState<string | null>(null);
  const [compareReport, setCompareReport] = useState<any>(null);
  const [showCompareSheet, setShowCompareSheet] = useState(false);
  const [candidateRace, setCandidateRace] = useState<{ label: string; iou: number; delta: number }[]>([]);
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

  // Process reference image to sample center-zone color palette & stage untouched image.
  // Do NOT synthesize a placeholder 3D sculpt until the user explicitly clicks
  // "Generate 3D Figure" or "Instant Procedural 3D".
  const processImageForSilhouette = async (url: string) => {
    try {
      // Clear any previous 3D figure so the user returns to the clean Guided Step-2 card
      setSculpt(null);
      setCharacterRig(null);
      setCurrentIoU(null);
      setCompareSheetUrl(null);
      setCompareReport(null);
      setShowCompareSheet(false);
      setCandidateRace([]);
      setGenerationError(null);

      const { mask, metrics, palette, canvasDataUrl } = await extractMaskFromImageUrl(url, 512);
      setReferenceMask(mask);
      setReferenceMetrics(metrics);
      setReferencePalette(palette);
      setReferenceImageUrl(canvasDataUrl);
    } catch (err) {
      console.warn('Could not extract palette from image:', err);
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

  // Execute initial generation (Direct Vision-to-3D: Raw Untouched Image + Center-Zone Palette -> Vision LLM + Skinned 3D Rig / Anatomical Clay Compiler)
  const handleGenerate = async () => {
    const cleanPrompt = (prompt || name).trim();
    if (!cleanPrompt && !referenceImageUrl) {
      setGenerationError('Please provide a prompt description or reference image.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationStage('Analyzing reference image & directorial description...');

    const effectivePrompt = cleanPrompt || (referenceImageUrl ? 'character or object in reference image' : '3d object');
    const isHumanoid = isHumanoidPrompt(effectivePrompt) || (!cleanPrompt && Boolean(referenceImageUrl));
    const reasonerPrompt = referenceImageUrl
      ? isHumanoid
        ? `Analyze the attached reference image (${effectivePrompt}) and sculpt a complete anatomical 3D character recipe (head, hair/hood, torso, tunic/armor, arms, legs, boots, and held weapons/gear) using the sampled colors.`
        : `Analyze the attached reference image (${effectivePrompt}) and construct a clean multi-part 3D recipe with accurate primitives and sampled colors.`
      : effectivePrompt;

    try {
      setGenerationStage('Reasoning 3D anatomy, costume layers & parts from vision...');
      let generated = await reasonSculpt(reasonerPrompt, {
        imageBase64: referenceImageUrl || undefined,
        extractedPalette: referencePalette || undefined,
        timeoutMs: 120_000,
        onStage: (s) => setGenerationStage(s),
      });

      const isHumanoidSubject =
        generated.rig === 'humanoid' ||
        isHumanoidPrompt(effectivePrompt) ||
        isHumanoidPrompt(generated.name) ||
        (!cleanPrompt && Boolean(referenceImageUrl));

      // If the LLM returned horizontal slices or fewer than 6 anatomical parts for a humanoid character,
      // upgrade the Parametric tab to our full Anatomical Character Clay Maquette (`compileCharacterToClaySculpt`)
      // so there are NEVER horizontal slice slabs!
      const hasSliceSlabs = generated.parts.some((p) => /^slice_\d+/i.test(p.id));
      if (isHumanoidSubject && (hasSliceSlabs || generated.parts.length < 6)) {
        const features = extractCharacterFeaturesFromModelOutput(
          generated,
          `${cleanPrompt} ${generated.name || ''} ${generated.identity || ''}`.trim() || 'Elven Scout Archer',
          referencePalette || undefined
        );
        generated = compileCharacterToClaySculpt(features);
      }

      setSculpt(generated);
      setName(generated.name || cleanPrompt || '3D Figure');
      setCurrentIoU(null);
      setCompareReport(null);
      setCompareSheetUrl(null);
      setCandidateRace([]);

      if (cleanPrompt) {
        registerSculptSpec(cleanPrompt, generated);
      }
      if (effectivePrompt) {
        registerSculptSpec(effectivePrompt, generated);
      }

      // For humanoid characters, build and default to the Skinned 3D Character Rig (Smooth Humanoid + Sculpted Hair, Tunic, Armor & Bow/Weapon),
      // with the Parametric Clay Maquette available on the second tab!
      if (isHumanoidSubject) {
        setGenerationStage('Dressing Skinned 3D Character Rig with sculpted costume & gear...');
        try {
          const rig = await createSkinnedCharacterFromConcept(
            referenceImageUrl || '',
            `${cleanPrompt} ${generated.name || ''} ${generated.identity || ''}`.trim() || 'Elven Scout Archer',
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
      // Graceful procedural recovery: build full Anatomical Character Clay Maquette + Skinned 3D Rig (never horizontal slabs!)
      try {
        const isHumanoidFallback = isHumanoidPrompt(effectivePrompt) || Boolean(referenceImageUrl);
        let fallbackSculpt: SculptSpec;
        if (isHumanoidFallback) {
          const features = extractCharacterFeaturesFromModelOutput(
            { name: cleanPrompt || 'Sculpted Character' },
            cleanPrompt || 'Elven Scout Archer',
            referencePalette || undefined
          );
          fallbackSculpt = compileCharacterToClaySculpt(features);
        } else {
          fallbackSculpt = synthesizeRecipeFromImage({
            name: cleanPrompt || '3D Figure',
            prompt: cleanPrompt || effectivePrompt,
            palette: referencePalette || undefined,
          });
        }

        if (fallbackSculpt && fallbackSculpt.parts && fallbackSculpt.parts.length > 0) {
          setSculpt(fallbackSculpt);
          setName(fallbackSculpt.name || cleanPrompt || '3D Figure');
          if (cleanPrompt) registerSculptSpec(cleanPrompt, fallbackSculpt);

          if (isHumanoidFallback) {
            try {
              const rig = await createSkinnedCharacterFromConcept(
                referenceImageUrl || '',
                cleanPrompt || 'Elven Scout Archer',
                { rawModelOutput: fallbackSculpt }
              );
              setCharacterRig(rig);
              setDisplayMode('skinned');
            } catch {
              setDisplayMode('parametric');
            }
          } else {
            setDisplayMode('parametric');
          }
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

  // Instant offline procedural 3D figure generation (0ms: Skinned 3D Character Rig + Anatomical Clay Maquette, no LLM required)
  const handleInstantProceduralGenerate = async () => {
    const cleanPrompt = prompt.trim();
    const effectivePrompt = cleanPrompt || (referenceImageUrl ? 'Elven Scout Archer' : '3D Figure');
    setGenerationError(null);
    setGenerationStage('Synthesizing 3D character rig & anatomical clay maquette...');
    try {
      const isHumanoidTarget = isHumanoidPrompt(effectivePrompt) || Boolean(referenceImageUrl && !cleanPrompt);
      let fallbackSculpt: SculptSpec;

      if (isHumanoidTarget) {
        const features = extractCharacterFeaturesFromModelOutput(
          { name: cleanPrompt || 'Sculpted Character' },
          effectivePrompt,
          referencePalette || undefined
        );
        fallbackSculpt = compileCharacterToClaySculpt(features);
      } else {
        fallbackSculpt = synthesizeRecipeFromImage({
          name: cleanPrompt || '3D Figure',
          prompt: effectivePrompt,
          palette: referencePalette || undefined,
        });
      }

      setCurrentIoU(null);
      setCompareReport(null);
      setCompareSheetUrl(null);
      setCandidateRace([]);

      if (fallbackSculpt && fallbackSculpt.parts && fallbackSculpt.parts.length > 0) {
        setSculpt(fallbackSculpt);
        setName(fallbackSculpt.name || cleanPrompt || '3D Figure');
        if (cleanPrompt) registerSculptSpec(cleanPrompt, fallbackSculpt);
      }

      if (isHumanoidTarget) {
        try {
          const rig = await createSkinnedCharacterFromConcept(
            referenceImageUrl || '',
            effectivePrompt,
            { rawModelOutput: fallbackSculpt }
          );
          setCharacterRig(rig);
          setDisplayMode('skinned');
        } catch {
          setCharacterRig(null);
          setDisplayMode('parametric');
        }
      } else {
        setCharacterRig(null);
        setDisplayMode('parametric');
      }
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
    setGenerationStage('Refining 3D proportions, costume & gear...');

    try {
      const revised = await reasonSculpt(cleanFeedback, {
        reviseSpec: sculpt,
        revisionFeedback: cleanFeedback,
        imageBase64: referenceImageUrl || undefined,
        extractedPalette: referencePalette || undefined,
        timeoutMs: 120_000,
        onStage: (s) => setGenerationStage(s),
      });

      setSculpt(revised);
      setRevisionFeedback('');
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
                      setCompareSheetUrl(null);
                      setCompareReport(null);
                      setShowCompareSheet(false);
                      setCandidateRace([]);
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
                    src={referenceImageUrl}
                    alt="Reference Preview"
                    className="w-full h-full object-contain"
                  />

                  {/* Extracted Center-Zone Palette Swatches */}
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

                  {/* Direct Vision-to-3D Status Footer HUD */}
                  <div className="absolute bottom-0 inset-x-0 bg-black/85 backdrop-blur-sm px-3 py-1.5 border-t border-white/10 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-emerald-300 font-semibold">
                      ✓ Direct Vision-to-3D Ready
                    </span>
                    <span className="text-slate-300">
                      Palette Sampled ✓
                    </span>
                  </div>
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
              {/* Active 3D Mode Badge */}
              <div className="pointer-events-auto flex items-center gap-2">
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

            {/* Instructions / Guided Step-2 Overlay (When no 3D figure is generated yet) */}
            {!sculpt && !characterRig && !isGenerating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                {referenceImageUrl ? (
                  <div className="pointer-events-auto max-w-md w-full rounded-2xl bg-[#0e121d]/90 backdrop-blur-xl border border-cyan-500/30 p-5 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-[10px] font-mono font-bold text-cyan-300 uppercase tracking-wider">
                        ✓ Step 1 Complete · Reference Staged
                      </span>
                      {referenceMetrics && (
                        <span className="text-[10px] font-mono text-slate-400">
                          Ratio <strong className="text-cyan-300">{referenceMetrics.aspectRatio}:1</strong>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-left">
                      <div className="relative h-24 w-24 rounded-xl overflow-hidden border border-white/15 bg-black/60 shrink-0 flex items-center justify-center">
                        <img
                          src={referenceImageUrl}
                          alt="Staged Reference"
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        <h3 className="text-xs font-bold text-white font-mono">
                          Step 2: Ready to Generate 3D Figure
                        </h3>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Your concept silhouette &amp; color palette are extracted. Add an optional description on the left (e.g.{' '}
                          <span className="text-amber-300 font-mono">&quot;Tribal Archer Female&quot;</span>) or generate directly now.
                        </p>

                        {referencePalette && (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[9px] font-mono text-slate-500 uppercase">Extracted Palette:</span>
                            <div className="flex items-center gap-1">
                              <span
                                className="h-3.5 w-3.5 rounded-full border border-white/30"
                                style={{ backgroundColor: referencePalette.primaryColor }}
                                title={`Primary: ${referencePalette.primaryColor}`}
                              />
                              <span
                                className="h-3.5 w-3.5 rounded-full border border-white/30"
                                style={{ backgroundColor: referencePalette.secondaryColor }}
                                title={`Secondary: ${referencePalette.secondaryColor}`}
                              />
                              <span
                                className="h-3.5 w-3.5 rounded-full border border-white/30"
                                style={{ backgroundColor: referencePalette.accentColor }}
                                title={`Accent: ${referencePalette.accentColor}`}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleGenerate}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 via-indigo-600 to-cyan-600 hover:from-amber-500 hover:via-indigo-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 transition-all font-mono"
                      >
                        <Sparkles className="h-4 w-4 text-amber-300" />
                        <span>Generate 3D Figure Now</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleInstantProceduralGenerate}
                        className="py-2.5 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-cyan-300 hover:text-cyan-200 text-[11px] font-mono flex items-center justify-center gap-1.5 transition-colors"
                        title="Instant 0ms Procedural Synthesis"
                      >
                        <Zap className="h-3.5 w-3.5 text-cyan-400" />
                        <span>0ms Procedural</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 mb-3">
                      <Box className="h-8 w-8" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-300 mb-1">
                      Interactive 3D Stage Preview
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm">
                      Upload an image or enter a description on the left to reason and build a multi-part parametric 3D proxy.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* CozyClay Side-by-Side Compare Sheet & Candidate Race Drawer */}
            {showCompareSheet && compareSheetUrl && (
              <div className="absolute top-14 left-3 w-80 bg-[#0c0e15]/95 backdrop-blur-xl border border-cyan-500/40 rounded-xl p-3 z-20 shadow-2xl font-mono text-[10px] space-y-2.5">
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                  <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                    <span>🎯</span>
                    <span>CozyClay Silhouette Compare Sheet</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCompareSheet(false)}
                    className="text-slate-400 hover:text-white"
                    title="Close Compare Sheet"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="rounded-lg overflow-hidden border border-white/15 bg-black/70">
                  <img
                    src={compareSheetUrl}
                    alt="CozyClay Reference vs Sculpt Overlay"
                    className="w-full h-36 object-contain"
                  />
                  <div className="px-2 py-1 bg-black/80 border-t border-white/10 flex items-center justify-between text-[9px] text-slate-300">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#bebebe] inline-block" /> Match
                    </span>
                    <span className="flex items-center gap-1 text-rose-300">
                      <span className="h-2 w-2 rounded-full bg-[#dc2828] inline-block" /> Missing
                    </span>
                    <span className="flex items-center gap-1 text-blue-300">
                      <span className="h-2 w-2 rounded-full bg-[#285adc] inline-block" /> Extra
                    </span>
                  </div>
                </div>

                {compareReport && (
                  <div className="grid grid-cols-3 gap-1.5 text-center bg-white/[0.03] border border-white/10 rounded-lg p-1.5">
                    <div>
                      <div className="text-[9px] text-slate-400">Top Missing</div>
                      <div className="font-bold text-rose-300">
                        {Math.round(compareReport.missingByBand.top * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400">Mid Missing</div>
                      <div className="font-bold text-amber-300">
                        {Math.round(compareReport.missingByBand.middle * 100)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-400">Bot Missing</div>
                      <div className="font-bold text-cyan-300">
                        {Math.round(compareReport.missingByBand.bottom * 100)}%
                      </div>
                    </div>
                  </div>
                )}

                {candidateRace.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-white/10">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                      CozyClay Candidate Race ({candidateRace.length} tested)
                    </div>
                    <div className="max-h-28 overflow-y-auto custom-scrollbar space-y-1">
                      {candidateRace.map((c, idx) => (
                        <div
                          key={`${c.label}-${idx}`}
                          className="flex items-center justify-between px-1.5 py-0.5 rounded bg-white/[0.03] text-slate-300"
                        >
                          <span className="truncate max-w-[175px]">{c.label}</span>
                          <span className={c.delta > 0 ? 'text-emerald-300 font-bold' : 'text-slate-400'}>
                            {Math.round(c.iou * 100)}%{' '}
                            {c.delta !== 0 && `(${c.delta > 0 ? '+' : ''}${Math.round(c.delta * 100)}%)`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                ) : referenceImageUrl ? (
                  <span className="text-cyan-300">
                    Reference image staged · Click <strong className="text-white">Generate 3D Figure</strong> to build your 3D model
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
