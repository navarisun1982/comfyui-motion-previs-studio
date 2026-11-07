import { create } from 'zustand';
import { SubjectKind } from '../types/shotspec';
import { reasonObject, ObjectReasonerError } from '../services/objectReasoner';
import { SculptSpec, registerSculptSpec, removeSculptSpec } from '../engine/procedural3D/sculptSpec';
import { safeGetItem, safeSetItem } from '../services/storage';
import {
  registerModelFile,
  getModelBlobUrl,
  offloadLargeImageToIndexedDB,
  resolveOffloadedImage,
  resolveOffloadedImageSync,
} from '../services/modelStorage';
import { CURATED_200_GLB_ASSETS, resolvePolyforkGlbUrl } from '../data/externalCatalogsRegistry';

export type AssetCategory =
  | 'all'
  | 'architecture'
  | 'vehicle'
  | 'character'
  | 'creature'
  | 'furniture'
  | 'props'
  | 'nature'
  | 'weapons'
  | 'scifi'
  | 'custom';

export interface Asset3DItem {
  id: string;
  name: string;
  nameAr: string;
  category: AssetCategory;
  icon: string;
  tokenPrompt: string;
  kind: SubjectKind;
  modelUrl?: string; // Optional GLB/GLTF file URL or Data URI
  modelId?: string; // Persistent model ID in IndexedDB / modelStorage
  conceptImageUrl?: string;
  rigType?: 'auto' | 'humanoid' | 'quadruped' | 'spine_flex' | 'rigid_prop';
  rigLandmarks?: Record<string, any>;
  showBones?: boolean;
  isCustom?: boolean;
  scale?: number;
  source: 'curated' | 'uploaded' | 'ai-generated';
  createdAt?: string;
  description?: string;
  fileSize?: string;
}

export interface SaveGeneratedGlbParams {
  modelId: string;
  blobUrl: string;
  name: string;
  actorCategory: 'human' | 'creature' | 'prop';
  sizeBytes?: number;
  conceptImageUrl?: string;
  rigType?: 'auto' | 'humanoid' | 'quadruped' | 'spine_flex' | 'rigid_prop';
  rigLandmarks?: Record<string, any>;
  showBones?: boolean;
  engineUsed?: string;
}

// 200 Curated Open .GLB Assets across 9 production domains (Polyfork Open GLB Catalog + Posable IK/FK Rigs)
export const CURATED_3D_ASSETS: Asset3DItem[] = CURATED_200_GLB_ASSETS;

const STORAGE_KEY = 'comfy_director_custom_3d_assets_v1';

const getSafeCustomAssets = (): Asset3DItem[] => {
  const rawLoaded = safeGetItem<Asset3DItem[]>(STORAGE_KEY, []);
  const loaded = rawLoaded.map((a) => {
    if (a.conceptImageUrl?.startsWith('refimg://')) {
      const syncResolved = resolveOffloadedImageSync(a.conceptImageUrl);
      if (syncResolved) {
        return { ...a, conceptImageUrl: syncResolved };
      }
    }
    return a;
  });
  // Asynchronously rehydrate blob URLs for persisted models and offloaded concept images
  if (typeof window !== 'undefined') {
    setTimeout(async () => {
      let changed = false;
      const rehydrated = await Promise.all(
        loaded.map(async (a) => {
          let nextItem = a;
          if (
            !a.modelUrl?.startsWith('/api/comfy-glb-output') &&
            (a.modelId || (a.modelUrl && a.modelUrl.startsWith('model://')))
          ) {
            const key = a.modelId || a.modelUrl!;
            const activeUrl = await getModelBlobUrl(key);
            if (activeUrl && activeUrl !== a.modelUrl) {
              changed = true;
              nextItem = { ...nextItem, modelUrl: activeUrl };
            }
          }
          if (nextItem.conceptImageUrl?.startsWith('refimg://')) {
            const resolvedImg = await resolveOffloadedImage(nextItem.conceptImageUrl);
            if (resolvedImg && resolvedImg !== nextItem.conceptImageUrl) {
              changed = true;
              nextItem = { ...nextItem, conceptImageUrl: resolvedImg };
            }
          }
          return nextItem;
        })
      );
      if (changed) {
        useAssetLibraryStore.setState({ customAssets: rehydrated });
      }
    }, 100);
  }
  return loaded;
};

const persistCustomAssets = (assets: Asset3DItem[]) => {
  // Sanitize assets so we don't store ephemeral blob: URLs or multi-MB base64 images in localStorage
  const sanitized = assets.map((a) => {
    let next = a;
    if (a.modelUrl?.startsWith('blob:') && a.modelId) {
      next = { ...next, modelUrl: `model://${a.modelId}` };
    }
    if (next.conceptImageUrl?.startsWith('data:') && next.conceptImageUrl.length > 80_000) {
      next = { ...next, conceptImageUrl: offloadLargeImageToIndexedDB(next.conceptImageUrl) };
    }
    return next;
  });
  if (!safeSetItem(STORAGE_KEY, sanitized)) {
    // Fallback if a large base64 conceptImageUrl exceeds localStorage quota
    const compact = sanitized.map((a) =>
      a.conceptImageUrl && a.conceptImageUrl.length > 100_000
        ? { ...a, conceptImageUrl: undefined }
        : a
    );
    safeSetItem(STORAGE_KEY, compact);
  }
};

export interface AssetLibraryState {
  isOpen: boolean;
  selectedCategory: AssetCategory;
  searchQuery: string;
  customAssets: Asset3DItem[];
  isGenerating: boolean;
  generationProgress: number; // 0 to 100
  generationStage: string;
  /** Last generation failure (e.g. Ollama offline) - shown verbatim, never masked by a fake asset. */
  generationError: string | null;
  isUploading: boolean;
  is3DStudioOpen: boolean;
  studioInitialPrompt: string;
  studioInitialImageUrl?: string;
  studioTargetActorId?: string;
  studioInitialMode?: 'image-to-3d' | 'text-to-3d';
  open3DStudio: (opts?: {
    initialPrompt?: string;
    initialImageUrl?: string;
    targetActorId?: string;
    initialMode?: 'image-to-3d' | 'text-to-3d';
  }) => void;
  close3DStudio: () => void;

  // Actions
  openLibrary: (initialCategory?: AssetCategory) => void;
  closeLibrary: () => void;
  setSelectedCategory: (category: AssetCategory) => void;
  setSearchQuery: (query: string) => void;
  addCustomAsset: (asset: Asset3DItem) => void;
  removeCustomAsset: (id: string) => void;
  uploadGlbFile: (file: File) => Promise<Asset3DItem>;
  saveGeneratedGlbToLibrary: (params: SaveGeneratedGlbParams) => Asset3DItem;
  generateAssetWithAi: (
    prompt: string,
    category: AssetCategory,
    style?: string
  ) => Promise<Asset3DItem>;
}

export const useAssetLibraryStore = create<AssetLibraryState>((set, get) => {
  return {
    isOpen: false,
    selectedCategory: 'all',
    searchQuery: '',
    customAssets: getSafeCustomAssets(),
    isGenerating: false,
    generationProgress: 0,
    generationStage: '',
    generationError: null,
    isUploading: false,
    is3DStudioOpen: false,
    studioInitialPrompt: '',
    studioInitialImageUrl: undefined,
    studioTargetActorId: undefined,
    studioInitialMode: undefined,
    open3DStudio: (opts) => {
      set({
        is3DStudioOpen: true,
        studioInitialPrompt: opts?.initialPrompt ?? '',
        studioInitialImageUrl: opts?.initialImageUrl,
        studioTargetActorId: opts?.targetActorId,
        studioInitialMode: opts?.initialMode,
      });
    },
    close3DStudio: () => {
      set({ is3DStudioOpen: false });
    },

    openLibrary: (initialCategory = 'all') => {
      set({ isOpen: true, selectedCategory: initialCategory });
    },

    closeLibrary: () => {
      set({ isOpen: false });
    },

    setSelectedCategory: (category) => {
      set({ selectedCategory: category });
    },

    setSearchQuery: (searchQuery) => {
      set({ searchQuery });
    },

    addCustomAsset: (asset) => {
      const next = [asset, ...get().customAssets];
      set({ customAssets: next });
      persistCustomAssets(next);
    },

    removeCustomAsset: (id) => {
      const removed = get().customAssets.find((a) => a.id === id);
      if (removed?.source === 'ai-generated') removeSculptSpec(removed.tokenPrompt);
      const next = get().customAssets.filter((a) => a.id !== id);
      set({ customAssets: next });
      persistCustomAssets(next);
    },

    uploadGlbFile: async (file: File): Promise<Asset3DItem> => {
      set({ isUploading: true });
      try {
        const registered = await registerModelFile(file);

        const newAsset: Asset3DItem = {
          id: `custom-glb-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: registered.name,
          nameAr: registered.name,
          category: 'custom',
          kind: 'prop',
          icon: '📦',
          tokenPrompt: `an authentic 3D model of ${registered.name}`,
          modelUrl: registered.blobUrl,
          modelId: registered.modelId,
          isCustom: true,
          scale: 1.0,
          source: 'uploaded',
          createdAt: new Date().toLocaleDateString(),
          fileSize: `${registered.sizeMB} MB`,
        };

        const next = [newAsset, ...get().customAssets];
        set({ customAssets: next, isUploading: false, selectedCategory: 'custom' });
        persistCustomAssets(next);
        return newAsset;
      } catch (err) {
        set({ isUploading: false });
        throw err;
      }
    },

    saveGeneratedGlbToLibrary: (params: SaveGeneratedGlbParams): Asset3DItem => {
      const cleanName = (params.name || 'ComfyUI 3D Character').trim();
      const category: AssetCategory =
        params.actorCategory === 'human'
          ? 'character'
          : params.actorCategory === 'creature'
          ? 'creature'
          : 'props';
      const kind: SubjectKind =
        params.actorCategory === 'human'
          ? 'human'
          : params.actorCategory === 'creature'
          ? 'creature'
          : 'prop';
      const icon =
        params.actorCategory === 'human'
          ? '👤'
          : params.actorCategory === 'creature'
          ? '🐾'
          : '📦';
      const sizeMB = params.sizeBytes
        ? `${(params.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : undefined;

      const existing = get().customAssets;
      const existingIdx = existing.findIndex(
        (a) =>
          (params.modelId && a.modelId === params.modelId) ||
          (params.blobUrl && a.modelUrl === params.blobUrl) ||
          (params.modelId && a.modelUrl === `model://${params.modelId}`)
      );

      const item: Asset3DItem = {
        id: existingIdx >= 0 ? existing[existingIdx].id : `comfy-3d-${params.modelId}`,
        name: cleanName,
        nameAr: cleanName,
        category,
        kind,
        icon,
        tokenPrompt: `an authentic 3D ${params.actorCategory} model of ${cleanName}`,
        modelUrl: params.blobUrl || `model://${params.modelId}`,
        modelId: params.modelId,
        conceptImageUrl: params.conceptImageUrl,
        rigType: params.rigType,
        rigLandmarks: params.rigLandmarks,
        showBones: params.showBones,
        isCustom: true,
        scale: 1.0,
        source: 'uploaded',
        createdAt: existingIdx >= 0 ? existing[existingIdx].createdAt : new Date().toLocaleDateString(),
        fileSize: sizeMB || (existingIdx >= 0 ? existing[existingIdx].fileSize : undefined),
        description: `ComfyUI Image-to-3D (.GLB${params.engineUsed ? ` • ${params.engineUsed.toUpperCase()}` : ''})`,
      };

      let next: Asset3DItem[];
      if (existingIdx >= 0) {
        next = [...existing];
        next[existingIdx] = item;
      } else {
        next = [item, ...existing];
      }
      set({ customAssets: next });
      persistCustomAssets(next);
      return item;
    },

    generateAssetWithAi: async (
      prompt: string,
      category: AssetCategory,
      _style: string = 'Cinematic'
    ): Promise<Asset3DItem> => {
      const cleanPrompt = prompt.trim();
      set({
        isGenerating: true,
        generationError: null,
        generationProgress: 15,
        generationStage: 'Connecting to object reasoner...',
      });

      let graph: SculptSpec;
      try {
        graph = await reasonObject(cleanPrompt, {
          onStage: (stage) => set({ generationStage: stage, generationProgress: 45 }),
        });
      } catch (err) {
        const message =
          err instanceof ObjectReasonerError
            ? err.message
            : `Object reasoning failed: ${(err as Error)?.message ?? err}`;
        set({ isGenerating: false, generationProgress: 0, generationStage: '', generationError: message });
        throw err;
      }

      set({ generationProgress: 90, generationStage: 'Building geometry from reasoned sculpt spec...' });
      registerSculptSpec(cleanPrompt, graph);

      const routedCategory: AssetCategory =
        graph.route === 'quadruped-walker'
          ? 'creature'
          : graph.route === 'biped-walker'
          ? 'character'
          : category === 'all'
          ? 'custom'
          : category;
      const kind: SubjectKind =
        graph.route === 'quadruped-walker'
          ? 'creature'
          : graph.route === 'biped-walker'
          ? 'human'
          : routedCategory === 'vehicle'
          ? 'vehicle'
          : routedCategory === 'architecture'
          ? 'building'
          : 'prop';

      const routeLabel =
        graph.route === 'author'
          ? `${graph.parts.length} authored parts`
          : graph.route === 'quadruped-walker'
          ? 'adapted quadruped-walker kit'
          : 'adapted biped-walker kit';
      const seconds = graph.source?.ms ? ` in ${(graph.source.ms / 1000).toFixed(1)}s` : '';
      const matchedGlbUrl = resolvePolyforkGlbUrl(cleanPrompt, cleanPrompt, kind);

      const generatedAsset: Asset3DItem = {
        id: `ai-gen-${Date.now()}`,
        name: graph.name || cleanPrompt,
        nameAr: cleanPrompt,
        category: routedCategory,
        kind,
        icon: graph.route === 'quadruped-walker' ? '🐾' : graph.route === 'biped-walker' ? '👤' : '✨',
        tokenPrompt: cleanPrompt,
        modelUrl: matchedGlbUrl,
        isCustom: true,
        scale: 1.0,
        source: 'ai-generated',
        createdAt: new Date().toLocaleDateString(),
        description: `Reasoned by ${graph.source?.model ?? 'local model'}${seconds}: ${routeLabel}, ${graph.heightMeters.toFixed(2)} m tall. ${graph.identity ?? ''}`.trim(),
      };

      const next = [generatedAsset, ...get().customAssets];
      set({
        customAssets: next,
        isGenerating: false,
        generationProgress: 100,
        generationStage: 'Ready!',
        selectedCategory: 'custom',
      });
      persistCustomAssets(next);

      return generatedAsset;
    },
  };
});
