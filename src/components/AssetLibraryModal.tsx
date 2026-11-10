import React, { useState, useRef, useEffect } from 'react';
import {
  useAssetLibraryStore,
  CURATED_3D_ASSETS,
  AssetCategory,
  Asset3DItem,
} from '../stores/useAssetLibraryStore';
import { useShotStore } from '../stores/useShotStore';
import { describeReasoner } from '../services/objectReasoner';
import { ReasonerSettingsPanel } from './ReasonerSettingsPanel';
import {
  X,
  Search,
  Upload,
  Sparkles,
  Box,
  Trash2,
  Check,
  Plus,
  Loader2,
  ArrowRight,
  Settings2,
  CheckSquare,
  Zap,
  Globe,
  Download,
  Database,
  Copy,
  ExternalLink,
  Heart,
  Clock,
  Folder,
  Compass,
  LayoutGrid,
  List,
  SlidersHorizontal,
  Image as ImageIcon,
  Type,
  Layers,
  HardDrive,
} from 'lucide-react';
import { lookupPartGraph } from '../engine/procedural3D/partGraph';
import { GlbResourcesDirectory } from './GlbResourcesDirectory';
import {
  Asset3DPreviewInspector,
  Asset3DPreviewPlacementOptions,
} from './Asset3DPreviewInspector';
import { useShallow } from 'zustand/react/shallow';
import { getModelBuffer } from '../services/modelStorage';
import {
  POLYFORK_KITS_CATALOG,
  SANDFLOW_DATASETS_CATALOG,
  fetchFullPolyforkCatalog,
  fetchSandflowDatasetPreview,
  SandflowPreviewRow,
} from '../data/externalCatalogsRegistry';

const CATEGORIES: { id: AssetCategory; label: string; shortLabel: string; icon: string }[] = [
  { id: 'all', label: 'All Catalog', shortLabel: 'All Assets', icon: '🌐' },
  { id: 'character', label: 'Characters', shortLabel: 'Characters', icon: '👤' },
  { id: 'vehicle', label: 'Vehicles', shortLabel: 'Vehicles', icon: '🚗' },
  { id: 'architecture', label: 'Architecture', shortLabel: 'Architecture', icon: '🏛️' },
  { id: 'creature', label: 'Creatures', shortLabel: 'Creatures', icon: '🦌' },
  { id: 'furniture', label: 'Furniture', shortLabel: 'Furniture', icon: '🪑' },
  { id: 'props', label: 'Props & Audio', shortLabel: 'Props & Assets', icon: '📦' },
  { id: 'nature', label: 'Nature', shortLabel: 'Environment', icon: '🌲' },
  { id: 'weapons', label: 'Weapons', shortLabel: 'Weapons', icon: '⚔️' },
  { id: 'scifi', label: 'Sci-Fi & Tech', shortLabel: 'Sci-Fi & Tech', icon: '⚛️' },
  { id: 'custom', label: 'My Uploads & AI', shortLabel: 'Uploads & AI', icon: '⭐' },
];

type SidebarNavView = 'explore' | 'my-assets' | 'uploads-ai' | 'favorites' | 'recent';
type SortOption = 'newest' | 'name-asc' | 'category';

const FAVORITES_STORAGE_KEY = 'comfy-director-3d-favorites-v1';
const RECENT_STORAGE_KEY = 'comfy-director-3d-recent-v1';

function readStoredStringArray(key: string): string[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeStoredStringArray(key: string, values: string[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Ignore storage quota errors
  }
}

export const AssetLibraryModal: React.FC = () => {
  const {
    isOpen,
    closeLibrary,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    customAssets,
    addCustomAsset,
    removeCustomAsset,
    uploadGlbFile,
    isUploading,
    generateAssetWithAi,
    isGenerating,
    generationProgress,
    generationStage,
    generationError,
    is3DStudioOpen,
    open3DStudio,
    saveGeneratedGlbToLibrary,
  } = useAssetLibraryStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      closeLibrary: s.closeLibrary,
      selectedCategory: s.selectedCategory,
      setSelectedCategory: s.setSelectedCategory,
      searchQuery: s.searchQuery,
      setSearchQuery: s.setSearchQuery,
      customAssets: s.customAssets,
      addCustomAsset: s.addCustomAsset,
      removeCustomAsset: s.removeCustomAsset,
      uploadGlbFile: s.uploadGlbFile,
      isUploading: s.isUploading,
      generateAssetWithAi: s.generateAssetWithAi,
      isGenerating: s.isGenerating,
      generationProgress: s.generationProgress,
      generationStage: s.generationStage,
      generationError: s.generationError,
      is3DStudioOpen: s.is3DStudioOpen,
      open3DStudio: s.open3DStudio,
      saveGeneratedGlbToLibrary: s.saveGeneratedGlbToLibrary,
    }))
  );

  const addActor = useShotStore((s) => s.addActor);
  const updateActor = useShotStore((s) => s.updateActor);

  // 3D Preview Side Inspector state
  const [previewedAsset, setPreviewedAsset] = useState<Asset3DItem | null>(null);

  // Sidebar & Toolbar UI state
  const [sidebarNav, setSidebarNav] = useState<SidebarNavView>('explore');
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    readStoredStringArray(FAVORITES_STORAGE_KEY)
  );
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    readStoredStringArray(RECENT_STORAGE_KEY)
  );

  // Generator & Drawers state
  const [showGenerator, setShowGenerator] = useState(false);
  const [showResourcesDrawer, setShowResourcesDrawer] = useState(false);
  const [showFullCatalogsDrawer, setShowFullCatalogsDrawer] = useState(false);
  const [activeExternalTab, setActiveExternalTab] = useState<'polyfork' | 'sand3d'>('polyfork');
  const [polyforkFullList, setPolyforkFullList] = useState<
    Array<Asset3DItem & { kitId?: string | null; triangles?: number }>
  >([]);
  const [polyforkLoading, setPolyforkLoading] = useState(false);
  const [selectedPolyforkKit, setSelectedPolyforkKit] = useState<string>('all');
  const [polyforkSearch, setPolyforkSearch] = useState<string>('');
  const [polyforkPage, setPolyforkPage] = useState<number>(1);
  const [cachingProgress, setCachingProgress] = useState<{
    active: boolean;
    done: number;
    total: number;
    label: string;
  } | null>(null);
  const [sandflowPreviewId, setSandflowPreviewId] = useState<string | null>(null);
  const [sandflowPreviewRows, setSandflowPreviewRows] = useState<SandflowPreviewRow[]>([]);
  const [sandflowLoading, setSandflowLoading] = useState(false);
  const [copiedCmdId, setCopiedCmdId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const reasonerLabel = describeReasoner();
  const [genPrompt, setGenPrompt] = useState('');
  const [genCategory, setGenCategory] = useState<AssetCategory>('props');
  const [addedAssetId, setAddedAssetId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Dedicated AI Reasoner state per individual asset
  const [reasoningAssetId, setReasoningAssetId] = useState<string | null>(null);
  const [showOnlyReasoned, setShowOnlyReasoned] = useState<boolean>(false);

  // Multi-Select Mode state
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleFavorite = (assetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteIds((prev) => {
      const next = prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [assetId, ...prev];
      writeStoredStringArray(FAVORITES_STORAGE_KEY, next);
      return next;
    });
  };

  const recordRecentAsset = (assetId: string) => {
    setRecentIds((prev) => {
      const next = [assetId, ...prev.filter((id) => id !== assetId)].slice(0, 36);
      writeStoredStringArray(RECENT_STORAGE_KEY, next);
      return next;
    });
  };

  // Honest progress: real elapsed time while the local model reasons (no simulated percentages).
  useEffect(() => {
    if (!isGenerating) return;
    const started = Date.now();
    setElapsedSec(0);
    const id = window.setInterval(
      () => setElapsedSec(Math.round((Date.now() - started) / 1000)),
      500
    );
    return () => window.clearInterval(id);
  }, [isGenerating]);

  // Automatically discover and import any previously generated .GLB files in D:\ComfyUI\output\3d
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/comfy-glb-output?list=1')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.items)) return;
        for (const item of data.items) {
          const rawBase = String(item.filename || 'Character')
            .replace(/\.(glb|gltf)$/i, '')
            .replace(/_\d+$/g, '')
            .replace(/[_-]+/g, ' ')
            .trim();
          const cleanTitle = rawBase
            ? rawBase.charAt(0).toUpperCase() + rawBase.slice(1)
            : 'ComfyUI 3D Model';
          const modelId = `comfy-disk-${String(item.filename).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          saveGeneratedGlbToLibrary({
            modelId,
            blobUrl: item.downloadUrl,
            name: cleanTitle,
            actorCategory: 'human',
            sizeBytes: item.sizeBytes,
            rigType: 'auto',
            showBones: false,
            engineUsed: 'pixal3d',
          });
        }
      })
      .catch(() => {
        // Ignore if running in static build without local middleware
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, saveGeneratedGlbToLibrary]);

  // Allow closing the 3D Asset Library with Escape key when no nested modal is active
  useEffect(() => {
    if (!isOpen || is3DStudioOpen || showSettingsModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLibrary();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, is3DStudioOpen, showSettingsModal, closeLibrary]);

  // Load Full Polyfork Catalog (2,791 models) when Full Catalogs drawer is opened
  useEffect(() => {
    if (!showFullCatalogsDrawer || polyforkFullList.length > 0 || polyforkLoading) return;
    setPolyforkLoading(true);
    fetchFullPolyforkCatalog()
      .then((list) => {
        setPolyforkFullList(list);
      })
      .finally(() => {
        setPolyforkLoading(false);
      });
  }, [showFullCatalogsDrawer, polyforkFullList.length, polyforkLoading]);

  const handlePreCacheCurated200 = async () => {
    if (cachingProgress?.active) return;
    const glbTargets = CURATED_3D_ASSETS.filter((a) => Boolean(a.modelUrl));
    setCachingProgress({
      active: true,
      done: 0,
      total: glbTargets.length,
      label: 'Pre-caching 200 Curated GLBs to IndexedDB...',
    });
    let completed = 0;
    const batchSize = 6;
    for (let i = 0; i < glbTargets.length; i += batchSize) {
      const slice = glbTargets.slice(i, i + batchSize);
      await Promise.all(
        slice.map(async (item) => {
          if (item.modelUrl) {
            await getModelBuffer(item.modelUrl);
          }
          completed += 1;
          setCachingProgress({
            active: true,
            done: completed,
            total: glbTargets.length,
            label: `Caching ${item.name} (${completed}/${glbTargets.length})`,
          });
        })
      );
    }
    setCachingProgress({
      active: false,
      done: glbTargets.length,
      total: glbTargets.length,
      label: `✓ All ${glbTargets.length} Curated GLBs Cached Offline in IndexedDB`,
    });
  };

  const handleDownloadPolyforkKit = async (kitId: string) => {
    if (cachingProgress?.active) return;
    let list = polyforkFullList;
    if (list.length === 0) {
      setPolyforkLoading(true);
      list = await fetchFullPolyforkCatalog();
      setPolyforkFullList(list);
      setPolyforkLoading(false);
    }
    const kitItems = list.filter((m) => m.kitId === kitId);
    if (kitItems.length === 0) return;
    const kitEntry = POLYFORK_KITS_CATALOG.find((k) => k.id === kitId);
    const kitLabel = kitEntry?.title || kitId;
    setCachingProgress({
      active: true,
      done: 0,
      total: kitItems.length,
      label: `Downloading Kit "${kitLabel}" (${kitItems.length} GLBs)...`,
    });
    let completed = 0;
    const batchSize = 5;
    for (let i = 0; i < kitItems.length; i += batchSize) {
      const slice = kitItems.slice(i, i + batchSize);
      await Promise.all(
        slice.map(async (item) => {
          if (item.modelUrl) {
            await getModelBuffer(item.modelUrl);
          }
          addCustomAsset({
            ...item,
            id: `pf-kit-${item.id}`,
            name: `${item.name} (${kitLabel})`,
            nameAr: `${item.name} (${kitLabel})`,
            isCustom: true,
            source: 'uploaded',
          });
          completed += 1;
          setCachingProgress({
            active: true,
            done: completed,
            total: kitItems.length,
            label: `Cached ${item.name} (${completed}/${kitItems.length})`,
          });
        })
      );
    }
    setCachingProgress({
      active: false,
      done: kitItems.length,
      total: kitItems.length,
      label: `✓ Kit "${kitLabel}" (${kitItems.length} GLBs) Saved to Custom Library & Offline Cache!`,
    });
  };

  const handlePreviewSandflowDataset = async (datasetId: string, hfRepo: string) => {
    if (sandflowPreviewId === datasetId && sandflowPreviewRows.length > 0) {
      setSandflowPreviewId(null);
      return;
    }
    setSandflowPreviewId(datasetId);
    setSandflowLoading(true);
    try {
      const res = await fetchSandflowDatasetPreview(hfRepo, 0, 8);
      setSandflowPreviewRows(res.rows);
    } catch {
      setSandflowPreviewRows([]);
    } finally {
      setSandflowLoading(false);
    }
  };

  const handleCopyCommand = (id: string, cmd: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(cmd).catch(() => {});
    }
    setCopiedCmdId(id);
    window.setTimeout(() => {
      setCopiedCmdId((cur) => (cur === id ? null : cur));
    }, 2000);
  };

  const handleReasonWithLlm = async (asset: Asset3DItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setReasoningAssetId(asset.id);
    try {
      const generated = await generateAssetWithAi(asset.tokenPrompt || asset.name, asset.category);
      setAddedAssetId(generated.id);
    } catch (err) {
      console.error('Failed to reason asset with LLM:', err);
    } finally {
      setReasoningAssetId(null);
    }
  };

  if (!isOpen) return null;

  const resolveAssetThumbUrl = (asset: Asset3DItem): string | undefined => {
    const raw = asset.conceptImageUrl;
    if (raw) {
      if (raw.startsWith('/images/')) {
        return `.${raw}`;
      }
      return raw;
    }
    const modelAndName = `${asset.modelUrl || ''} ${asset.name || ''} ${asset.id || ''}`.toLowerCase();
    if (modelAndName.includes('readyplayerme') || modelAndName.includes('rpm-avatar')) {
      return './images/library/mixamo-rpm-avatar.jpg';
    }
    if (modelAndName.includes('robotexpressive') || modelAndName.includes('robot-expressive')) {
      return './images/library/mixamo-robot-expressive.jpg';
    }
    if (modelAndName.includes('cesiumman') || modelAndName.includes('cesium-man')) {
      return './images/library/mixamo-cesium-man.jpg';
    }
    if (modelAndName.includes('fox.glb') || modelAndName.includes('khronos-fox')) {
      return './images/library/animal-fox.jpg';
    }
    if (modelAndName.includes('horse.glb') || modelAndName.includes('threejs-horse')) {
      return './images/library/animal-horse.jpg';
    }
    if (modelAndName.includes('soldier') || modelAndName.includes('vanguard')) {
      return './images/library/mixamo-soldier.jpg';
    }
    if (modelAndName.includes('michelle')) {
      return './images/library/mixamo-michelle.jpg';
    }
    if (modelAndName.includes('xbot.glb') || modelAndName.includes('xbot-studio')) {
      return './images/library/mixamo-xbot-studio.jpg';
    }
    if (
      modelAndName.includes('x-bot') ||
      /\b(female|woman|girl|actress|heroine|queen|princess|lady)\b/.test(modelAndName) ||
      /(امرأة|بنت|فتاة|ممثلة|بطلة|سيدة)/.test(modelAndName)
    ) {
      return './images/library/mixamo-xbot-female.jpg';
    }
    if (
      modelAndName.includes('y-bot') ||
      asset.category === 'character' ||
      asset.kind === 'human'
    ) {
      return './images/library/mixamo-ybot-male.jpg';
    }
    return undefined;
  };

  const resolveAssetSourceBadge = (
    asset: Asset3DItem
  ): { icon: string; label: string; title: string; className: string } => {
    const idLower = (asset.id || '').toLowerCase();
    const urlLower = (asset.modelUrl || '').toLowerCase();
    const descLower = (asset.description || '').toLowerCase();

    if (idLower === 'char-mixamo-rpm-avatar' || urlLower.includes('readyplayerme')) {
      return {
        icon: '🎩',
        label: 'RPM • Mixamo',
        title: 'Source: ReadyPlayerMe / Mixamo 67-Bone Rig (MIT Sample)',
        className: 'bg-violet-950/90 text-violet-200 border-violet-400/50',
      };
    }
    if (
      idLower.startsWith('char-director-rig-') ||
      idLower.startsWith('char-mixamo-') ||
      urlLower.includes('y-bot-tpose') ||
      urlLower.includes('x-bot-tpose') ||
      urlLower.includes('soldier.glb') ||
      urlLower.includes('michelle.glb') ||
      urlLower.includes('xbot.glb')
    ) {
      return {
        icon: '🎭',
        label: 'Mixamo',
        title: 'Source: Adobe Mixamo / Three.js Open Rig (65-Bone Mocap Ready)',
        className: 'bg-cyan-950/90 text-cyan-200 border-cyan-400/50',
      };
    }
    if (idLower === 'char-quaternius-robot-expressive' || urlLower.includes('robotexpressive')) {
      return {
        icon: '🤖',
        label: 'Quaternius CC0',
        title: 'Source: Quaternius / Three.js (CC0 Public Domain • 14 Embedded Clips)',
        className: 'bg-amber-950/90 text-amber-200 border-amber-400/50',
      };
    }
    if (
      idLower === 'char-khronos-cesium-man' ||
      idLower === 'animal-khronos-fox' ||
      urlLower.includes('cesiumman') ||
      urlLower.includes('fox.glb')
    ) {
      return {
        icon: '🌐',
        label: 'Khronos glTF',
        title: 'Source: Khronos Group Official glTF Sample Models (CC0 / CC-BY 4.0)',
        className: 'bg-teal-950/90 text-teal-200 border-teal-400/50',
      };
    }
    if (idLower === 'animal-threejs-horse' || urlLower.includes('horse.glb')) {
      return {
        icon: '🐎',
        label: 'Three.js MIT',
        title: 'Source: Three.js Official MIT Examples Repository',
        className: 'bg-sky-950/90 text-sky-200 border-sky-400/50',
      };
    }
    if (
      idLower.startsWith('pf-') ||
      urlLower.includes('polyfork.dev') ||
      descLower.includes('polyfork')
    ) {
      return {
        icon: '🌲',
        label: 'Polyfork',
        title: 'Source: Polyfork Open 3D Catalog (polyfork.dev • Free GLB)',
        className: 'bg-emerald-950/90 text-emerald-200 border-emerald-400/50',
      };
    }
    if (idLower.startsWith('sand3d-') || descLower.includes('sand3d')) {
      return {
        icon: '🏖️',
        label: 'Sand3D',
        title: 'Source: Sandflow AI Sand3D (CC-BY 4.0 / SimReady)',
        className: 'bg-amber-950/90 text-amber-200 border-amber-400/50',
      };
    }
    if (asset.modelId?.startsWith('comfy-disk-') || urlLower.includes('comfy-glb-output')) {
      return {
        icon: '🟣',
        label: 'ComfyUI 3D',
        title: 'Source: Local ComfyUI 3D Studio Output (.GLB)',
        className: 'bg-purple-950/90 text-purple-200 border-purple-400/50',
      };
    }
    if (asset.source === 'ai-generated') {
      return {
        icon: '✨',
        label: 'AI Reasoned',
        title: 'Source: Generated by AI Object Reasoner / 3D Studio',
        className: 'bg-fuchsia-950/90 text-fuchsia-200 border-fuchsia-400/50',
      };
    }
    if (asset.source === 'uploaded' || asset.isCustom) {
      return {
        icon: '📤',
        label: 'Uploaded',
        title: 'Source: Custom User-Uploaded 3D Model (.GLB / .FBX)',
        className: 'bg-blue-950/90 text-blue-200 border-blue-400/50',
      };
    }
    return {
      icon: '⚙️',
      label: 'Studio Rig',
      title: 'Source: Built-in Studio Procedural 3D Rig',
      className: 'bg-slate-900/90 text-slate-200 border-white/20',
    };
  };

  // Pin flagship Mixamo Studio 3D rigs & animated creatures at the very top of Explore so they are always the first rows
  const featuredMixamoAssets = CURATED_3D_ASSETS.filter(
    (a) =>
      a.id.startsWith('char-director-rig-') ||
      a.id.startsWith('char-mixamo-') ||
      a.id === 'char-quaternius-robot-expressive' ||
      a.id === 'char-khronos-cesium-man' ||
      a.id === 'animal-khronos-fox' ||
      a.id === 'animal-threejs-horse'
  );
  const featuredMixamoIds = new Set(featuredMixamoAssets.map((a) => a.id));
  const remainingCuratedAssets = CURATED_3D_ASSETS.filter((a) => !featuredMixamoIds.has(a.id));

  // Combine featured Mixamo rigs, custom uploaded/generated assets, and remaining curated catalog
  const allAssets = [...featuredMixamoAssets, ...customAssets, ...remainingCuratedAssets];
  const reasonedTotalCount = allAssets.filter(
    (a) => lookupPartGraph(a.tokenPrompt || a.name) || a.source === 'ai-generated'
  ).length;

  // 1. Filter by Sidebar Nav View (Favorites / Recent / My Assets)
  const navFiltered =
    sidebarNav === 'favorites'
      ? allAssets.filter((a) => favoriteIds.includes(a.id))
      : sidebarNav === 'recent'
      ? recentIds
          .map((id) => allAssets.find((a) => a.id === id))
          .filter((a): a is Asset3DItem => Boolean(a))
      : sidebarNav === 'my-assets' || sidebarNav === 'uploads-ai'
      ? customAssets
      : allAssets;

  // 2. Filter by category
  const categoryFiltered =
    sidebarNav === 'favorites' || sidebarNav === 'recent'
      ? selectedCategory === 'all'
        ? navFiltered
        : navFiltered.filter((a) => a.category === selectedCategory)
      : selectedCategory === 'all'
      ? navFiltered
      : selectedCategory === 'custom'
      ? customAssets
      : navFiltered.filter((a) => a.category === selectedCategory);

  // 3. Filter by AI Reasoned state if toggled
  const reasonedFiltered = showOnlyReasoned
    ? categoryFiltered.filter(
        (a) => lookupPartGraph(a.tokenPrompt || a.name) || a.source === 'ai-generated'
      )
    : categoryFiltered;

  // 4. Filter by search query (Arabic + English)
  const q = searchQuery.trim().toLowerCase();
  const searchFiltered = reasonedFiltered.filter((a) => {
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      a.nameAr.includes(q) ||
      a.tokenPrompt.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    );
  });

  // 5. Sort
  const filteredAssets = [...searchFiltered].sort((a, b) => {
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === 'category') {
      return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
    }
    return 0; // 'newest' preserves catalog + custom-first order
  });

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedAssetIds(new Set());
  };

  const handleSelectAllFiltered = () => {
    const ids = new Set(filteredAssets.map((a) => a.id));
    setSelectedAssetIds(ids);
  };

  const handlePlaceOnStage = (
    asset: Asset3DItem,
    previewOpts?: Asset3DPreviewPlacementOptions
  ) => {
    recordRecentAsset(asset.id);
    const defaultAction =
      previewOpts?.gait === 'run'
        ? 'running along the trajectory with natural momentum'
        : previewOpts?.gait === 'walk'
        ? 'walking steadily along the trajectory'
        : asset.kind === 'vehicle'
        ? 'moving smoothly along its 3D trajectory'
        : 'follows the exact 3D trajectory and pose sequence from <Video 1>';

    addActor(asset.name, asset.kind, asset.tokenPrompt, {
      modelUrl: asset.modelUrl || (asset.modelId ? `model://${asset.modelId}` : undefined),
      scale: previewOpts?.scale ?? (asset.isCustom ? asset.scale || 1.0 : 1.0),
      conceptImageUrl: asset.isCustom ? asset.conceptImageUrl : undefined,
      rigType: asset.rigType,
      rigLandmarks: asset.rigLandmarks,
      showBones: previewOpts?.showBones ?? asset.showBones,
      actionDescription: defaultAction,
    });

    if (previewOpts?.posePreset || (previewOpts?.gait && previewOpts.gait !== 'none')) {
      const latestState = useShotStore.getState();
      const latestSelectedId = latestState.selectedActorId;
      if (latestSelectedId && latestSelectedId !== '__camera__') {
        const createdActor = latestState.shot.actors.find((a) => a.id === latestSelectedId);
        const shotDur = Math.max(2, latestState.shot.durationSeconds || 5);
        const naturalSpeed = previewOpts?.gait === 'run' ? 6.85 : 4.16;
        const travelUnits =
          previewOpts?.gait && previewOpts.gait !== 'none'
            ? Math.min(36, Math.round(shotDur * naturalSpeed))
            : 0;
        const nextTrajectory =
          createdActor && travelUnits > 0
            ? {
                ...createdActor.trajectory,
                endPosition: {
                  x: createdActor.trajectory.startPosition.x,
                  y: Math.min(92, createdActor.trajectory.startPosition.y + travelUnits),
                  z: createdActor.trajectory.startPosition.z || 0,
                },
              }
            : undefined;
        updateActor(latestSelectedId, {
          posePreset: previewOpts.posePreset as any,
          gait: (previewOpts.gait || 'none') as any,
          ...(nextTrajectory ? { trajectory: nextTrajectory } : {}),
        });
      }
    }

    setAddedAssetId(asset.id);
    closeLibrary();
  };

  const handlePlaceSelectedOnStage = () => {
    if (selectedAssetIds.size === 0) return;
    const selectedList = allAssets.filter((a) => selectedAssetIds.has(a.id));
    selectedList.forEach((asset) => {
      recordRecentAsset(asset.id);
      addActor(asset.name, asset.kind, asset.tokenPrompt, {
        modelUrl: asset.modelUrl || (asset.modelId ? `model://${asset.modelId}` : undefined),
        scale: asset.isCustom ? asset.scale || 1.0 : 1.0,
        conceptImageUrl: asset.isCustom ? asset.conceptImageUrl : undefined,
        rigType: asset.rigType,
        rigLandmarks: asset.rigLandmarks,
        showBones: asset.showBones,
        actionDescription:
          asset.kind === 'vehicle'
            ? 'moving smoothly along its 3D trajectory'
            : 'follows the exact 3D trajectory and pose sequence from <Video 1>',
      });
    });
    setSelectedAssetIds(new Set());
    setIsMultiSelectMode(false);
    closeLibrary();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(glb|gltf)$/i)) {
      setUploadError('Please select a valid .glb or .gltf 3D file.');
      return;
    }

    setUploadError(null);
    try {
      const newAsset = await uploadGlbFile(file);
      handlePlaceOnStage(newAsset);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError('Failed to parse 3D file. Please ensure it is a valid GLTF/GLB.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genPrompt.trim()) return;

    try {
      const generated = await generateAssetWithAi(genPrompt, genCategory);
      setGenPrompt('');
      setShowGenerator(false);
      handlePlaceOnStage(generated);
    } catch (err) {
      console.error('Generation error:', err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {/* Hidden native file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".glb,.gltf"
        className="hidden"
      />

      <div
        className="flex h-[93vh] w-[96vw] max-w-[1440px] flex-col rounded-2xl border border-white/15 bg-[#090c15] text-slate-100 shadow-[0_25px_90px_rgba(0,0,0,0.85)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MAIN 2-COLUMN STUDIO SHELL (Left Sidebar + Right Main Content) */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ============================================================
              LEFT NAVIGATION SIDEBAR (Matches Studio Mockup)
             ============================================================ */}
          <aside className="hidden md:flex w-56 lg:w-60 shrink-0 flex-col justify-between border-r border-white/10 bg-gradient-to-b from-[#0d111d] via-[#0b0e19] to-[#0e1222] p-3.5 select-none">
            <div className="flex flex-col min-h-0 flex-1 overflow-y-auto no-scrollbar space-y-4">
              {/* Brand Header */}
              <div className="flex items-center gap-3 px-1.5 pt-0.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/25 via-amber-500/15 to-indigo-600/30 border border-amber-400/40 shadow-lg shadow-amber-500/10 text-amber-300">
                  <Box className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-[15px] font-extrabold tracking-wide text-white leading-tight truncate">
                    3D Library
                  </h2>
                  <p className="text-[11px] text-slate-400 font-sans truncate">
                    3D Asset Catalog
                  </p>
                </div>
              </div>

              {/* Primary Navigation Links */}
              <nav className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setSidebarNav('explore');
                    setSelectedCategory('all');
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    sidebarNav === 'explore' && selectedCategory === 'all'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Compass className="h-4 w-4 text-indigo-300" />
                    <span>Explore</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSidebarNav('my-assets');
                    setSelectedCategory('custom');
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    sidebarNav === 'my-assets'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Folder className="h-4 w-4 text-slate-400" />
                    <span>My Assets</span>
                  </span>
                  {customAssets.length > 0 && (
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                      {customAssets.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSidebarNav('uploads-ai');
                    setSelectedCategory('custom');
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    sidebarNav === 'uploads-ai'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <span>Uploads &amp; AI</span>
                  </span>
                  <span className="rounded-full bg-indigo-500/25 border border-indigo-400/30 px-1.5 py-0.5 text-[10px] font-mono text-indigo-200">
                    {customAssets.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowFullCatalogsDrawer((prev) => !prev)}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    showFullCatalogsDrawer
                      ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-400/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Layers className="h-4 w-4 text-emerald-400" />
                    <span>Collections</span>
                  </span>
                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300">
                    43 Kits
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSidebarNav('favorites');
                    setSelectedCategory('all');
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    sidebarNav === 'favorites'
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/25 border border-rose-400/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Heart className="h-4 w-4 text-rose-400" />
                    <span>Favorites</span>
                  </span>
                  {favoriteIds.length > 0 && (
                    <span className="rounded-full bg-rose-500/25 px-1.5 py-0.5 text-[10px] font-mono text-rose-200">
                      {favoriteIds.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSidebarNav('recent');
                    setSelectedCategory('all');
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                    sidebarNav === 'recent'
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-400/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-cyan-400" />
                    <span>Recent</span>
                  </span>
                  {recentIds.length > 0 && (
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                      {recentIds.length}
                    </span>
                  )}
                </button>
              </nav>

              {/* Divider + CATEGORIES Vertical List */}
              <div className="pt-2 border-t border-white/10 space-y-1">
                <div className="px-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Categories
                </div>
                {CATEGORIES.filter((c) => c.id !== 'custom').map((cat) => {
                  const count =
                    cat.id === 'all'
                      ? allAssets.length
                      : allAssets.filter((a) => a.category === cat.id).length;
                  const isActive =
                    sidebarNav === 'explore' && selectedCategory === cat.id;

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSidebarNav('explore');
                        setSelectedCategory(cat.id);
                      }}
                      className={`w-full flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-600/25 text-white border border-blue-400/40 shadow-sm shadow-blue-500/10'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span className="text-sm">{cat.icon}</span>
                        <span className="truncate">{cat.shortLabel}</span>
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
                          isActive
                            ? 'bg-blue-500/30 text-blue-200 font-bold'
                            : 'bg-white/5 text-slate-400'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Sidebar Dock: Local Cache Card + Upload GLB Button */}
            <div className="pt-3 border-t border-white/10 space-y-2.5 shrink-0">
              <div
                onClick={handlePreCacheCurated200}
                title="Click to pre-cache all 200 curated GLBs into local IndexedDB for 100% offline use"
                className="rounded-xl border border-white/10 bg-[#111728]/90 p-2.5 space-y-2 cursor-pointer hover:border-emerald-500/40 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                      <HardDrive className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-white leading-tight">
                        Local Cache
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {cachingProgress
                          ? `${cachingProgress.done}/${cachingProgress.total} Cached`
                          : `${CURATED_3D_ASSETS.length} Assets (Offline)`}
                      </div>
                    </div>
                  </div>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-black/60 overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 transition-all"
                    style={{
                      width: cachingProgress
                        ? `${Math.max(
                            8,
                            Math.round((cachingProgress.done / Math.max(1, cachingProgress.total)) * 100)
                          )}%`
                        : '65%',
                    }}
                  />
                </div>
                <div className="text-[9.5px] font-mono text-slate-400 text-center">
                  IndexedDB Storage • Ready Offline
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 py-2.5 px-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/40 transition-all disabled:opacity-50 cursor-pointer"
                title="Upload any 3D model (.glb / .gltf) from your PC"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>Upload GLB</span>
              </button>
              <div className="text-center text-[9.5px] font-mono text-slate-500 tracking-wider">
                GLB / GLTF NATIVE
              </div>
            </div>
          </aside>

          {/* ============================================================
              RIGHT MAIN STUDIO CONTENT AREA
             ============================================================ */}
          <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-[#0a0d16]">
            {/* 1. HERO HEADER BANNER (With Classical 3D Wireframe Sculpture & Gold Counter Badge) */}
            <div className="relative flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4 bg-gradient-to-r from-[#0e1322] via-[#11182c] to-[#0d1220] overflow-hidden shrink-0">
              {/* Classical Sculpture 3D Wireframe Artwork in Background Right-Center */}
              <div
                className="pointer-events-none absolute right-48 top-0 bottom-0 w-72 hidden lg:block opacity-85"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to right, transparent 0%, black 22%, black 78%, transparent 100%)',
                  maskImage:
                    'linear-gradient(to right, transparent 0%, black 22%, black 78%, transparent 100%)',
                }}
              >
                <img
                  src="./images/library/hero-sculpture.jpg"
                  alt=""
                  className="h-full w-full object-cover object-center"
                />
              </div>

              {/* Left Hero Copy & Feature Badges */}
              <div className="relative z-10 space-y-2 min-w-0">
                <div>
                  <h1 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                    <span className="bg-gradient-to-r from-cyan-300 via-sky-200 to-white bg-clip-text text-transparent">
                      Your 3D
                    </span>{' '}
                    Asset Library
                  </h1>
                  <p className="text-xs text-slate-300/90 font-sans">
                    200+ high-quality, ready-to-use 3D assets for your projects
                  </p>
                </div>

                {/* Feature Pills Row */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-300">
                    <span>🌐 GLB / GLTF Native</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFullCatalogsDrawer((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/40 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-blue-200 cursor-pointer transition-colors"
                  >
                    <span>📚 Full Catalogs</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGenerator((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/40 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-purple-200 cursor-pointer transition-colors"
                  >
                    <span>✨ AI Tools</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePreCacheCurated200}
                    className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-cyan-200 cursor-pointer transition-colors"
                  >
                    <span>⚡ Offline Cache</span>
                  </button>
                </div>
              </div>

              {/* Right Hero Controls: Gold Counter Card + Multi-Select + Close Button */}
              <div className="relative z-10 flex items-center gap-2.5 shrink-0">
                {/* Gold Asset Counter Badge */}
                <div className="hidden sm:flex items-center gap-2.5 rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-black/60 px-3.5 py-2 shadow-lg shadow-amber-500/10">
                  <Box className="h-6 w-6 text-amber-300 shrink-0" />
                  <div className="leading-tight">
                    <div className="text-lg font-extrabold font-display text-amber-300">
                      {allAssets.length}
                    </div>
                    <div className="text-[10px] font-mono text-amber-100/80">Assets</div>
                  </div>
                </div>

                {/* Mobile Upload GLB Button (visible when sidebar is hidden on small screens) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex md:hidden items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-bold text-white shadow cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload GLB</span>
                </button>

                {/* Multi-Select Toggle Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (isMultiSelectMode) {
                      setIsMultiSelectMode(false);
                      setSelectedAssetIds(new Set());
                    } else {
                      setIsMultiSelectMode(true);
                    }
                  }}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all border cursor-pointer ${
                    isMultiSelectMode
                      ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/30'
                      : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/15'
                  }`}
                  title="Toggle multi-selection to place several 3D models at once"
                >
                  <CheckSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    Multi-Select {selectedAssetIds.size > 0 && `(${selectedAssetIds.size})`}
                  </span>
                </button>

                {/* Close X Button */}
                <button
                  type="button"
                  onClick={closeLibrary}
                  aria-label="Close 3D Asset Library"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-300 hover:bg-rose-500/25 hover:border-rose-400/50 hover:text-white transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 2. SEARCH BAR + AI-REASONED FILTER PILL ROW */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 px-6 pt-3 pb-2 bg-[#0a0d16] shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search 200+ assets (e.g. car, piano, tower, sword)..."
                  className="w-full rounded-xl bg-[#111626] border border-white/15 pl-10 pr-16 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/60 font-mono shadow-inner"
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="rounded p-1 text-slate-400 hover:text-white"
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      open3DStudio({
                        initialMode: 'image-to-3d',
                        initialPrompt: searchQuery || '',
                      })
                    }
                    className="rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 p-1 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Search or generate 3D from reference image"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowOnlyReasoned(!showOnlyReasoned)}
                className={`flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold font-mono transition-all border shrink-0 cursor-pointer ${
                  showOnlyReasoned
                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white border-cyan-400 shadow-lg shadow-cyan-500/20'
                    : 'bg-[#13192b] hover:bg-[#192138] text-indigo-200 border-indigo-500/35'
                }`}
                title="Show only 3D models with reasoned part graphs"
              >
                <Zap className="h-3.5 w-3.5 text-cyan-300" />
                <span>AI-Reasoned ({reasonedTotalCount})</span>
              </button>
            </div>

            {/* 3. 5 GLOWING FEATURE CARDS ROW (Matches Reference Mockup) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 px-6 py-2 bg-[#0a0d16] shrink-0">
              {/* Card 1: Image-to-3D */}
              <button
                type="button"
                onClick={() =>
                  open3DStudio({
                    initialMode: 'image-to-3d',
                    initialPrompt: genPrompt || searchQuery || '',
                  })
                }
                className="group flex items-center gap-2.5 rounded-xl border border-purple-500/40 bg-gradient-to-br from-purple-950/60 via-[#17122a] to-[#111322] hover:border-purple-400 p-2.5 text-left shadow-md hover:shadow-purple-500/20 transition-all cursor-pointer"
                title="Open ComfyUI 3D Studio in Image-to-3D mode (#aa77013b)"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 border border-purple-400/40 text-purple-300 group-hover:scale-105 transition-transform">
                  <ImageIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">Image-to-3D</div>
                  <div className="text-[10px] font-mono text-purple-300/80 truncate">
                    Photo → .GLB
                  </div>
                </div>
              </button>

              {/* Card 2: Text-to-3D */}
              <button
                type="button"
                onClick={() =>
                  open3DStudio({
                    initialMode: 'text-to-3d',
                    initialPrompt: genPrompt || searchQuery || '',
                  })
                }
                className="group flex items-center gap-2.5 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-950/50 via-[#221912] to-[#121320] hover:border-amber-400 p-2.5 text-left shadow-md hover:shadow-amber-500/20 transition-all cursor-pointer"
                title="Open ComfyUI Text-to-3D .GLB Studio (#e7a9555b)"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 group-hover:scale-105 transition-transform">
                  <Type className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">Text-to-3D</div>
                  <div className="text-[10px] font-mono text-amber-300/80 truncate">
                    Prompt → .GLB
                  </div>
                </div>
              </button>

              {/* Card 3: Full Catalogs (Polyfork & Sand3D) */}
              <button
                type="button"
                onClick={() => setShowFullCatalogsDrawer((prev) => !prev)}
                className={`group flex items-center gap-2.5 rounded-xl border p-2.5 text-left shadow-md transition-all cursor-pointer ${
                  showFullCatalogsDrawer
                    ? 'border-emerald-400 bg-emerald-950/70 ring-1 ring-emerald-400/50'
                    : 'border-emerald-500/40 bg-gradient-to-br from-emerald-950/55 via-[#10221e] to-[#101420] hover:border-emerald-400 hover:shadow-emerald-500/20'
                }`}
                title="Browse & download the Full Polyfork Catalog (2,791 free GLBs & 43 Kits) and Sandflow Sand3D (106,094 open assets)"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 group-hover:scale-105 transition-transform">
                  <Database className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">Full Catalogs</div>
                  <div className="text-[10px] font-mono text-emerald-300/80 truncate">
                    (Polyfork &amp; Sand3D)
                  </div>
                </div>
              </button>

              {/* Card 4: .GLB Sites */}
              <button
                type="button"
                onClick={() => setShowResourcesDrawer((prev) => !prev)}
                className={`group flex items-center gap-2.5 rounded-xl border p-2.5 text-left shadow-md transition-all cursor-pointer ${
                  showResourcesDrawer
                    ? 'border-blue-400 bg-blue-950/70 ring-1 ring-blue-400/50'
                    : 'border-blue-500/40 bg-gradient-to-br from-blue-950/55 via-[#111b2e] to-[#101420] hover:border-blue-400 hover:shadow-blue-500/20'
                }`}
                title="Browse 14 curated Free CC0, Sketchfab, Mixamo & AI Animated .GLB websites"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-400/40 text-blue-300 group-hover:scale-105 transition-transform">
                  <Globe className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">.GLB Sites</div>
                  <div className="text-[10px] font-mono text-blue-300/80 truncate">
                    14 Free Directories
                  </div>
                </div>
              </button>

              {/* Card 5: Cache 200 Offline */}
              <button
                type="button"
                onClick={handlePreCacheCurated200}
                disabled={cachingProgress?.active}
                className="group flex items-center gap-2.5 rounded-xl border border-cyan-500/40 bg-gradient-to-br from-cyan-950/55 via-[#0f202c] to-[#101420] hover:border-cyan-400 p-2.5 text-left shadow-md hover:shadow-cyan-500/20 transition-all disabled:opacity-60 cursor-pointer"
                title="Download and cache all 200 Curated .GLB models into local IndexedDB so they work 100% offline"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 group-hover:scale-105 transition-transform">
                  {cachingProgress?.active ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {cachingProgress?.active
                      ? `${cachingProgress.done}/${cachingProgress.total}`
                      : 'Cache 200'}
                  </div>
                  <div className="text-[10px] font-mono text-cyan-300/80 truncate">Offline</div>
                </div>
              </button>
            </div>

            {/* Free Animated .GLB Websites & Resources Directory Drawer */}
            {showResourcesDrawer && (
              <div className="border-y border-indigo-500/35 bg-[#0c101b] p-4 animate-in slide-in-from-top duration-200 max-h-[50vh] overflow-y-auto shrink-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[11px] font-mono text-indigo-300 font-semibold">
                    Download any animated .GLB from these libraries, then click &ldquo;Upload GLB&rdquo; to place it on stage:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowResourcesDrawer(false)}
                    aria-label="Close Resources Drawer"
                    title="Close Resources Drawer"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-300 hover:bg-rose-500/25 hover:border-rose-400/50 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <GlbResourcesDirectory compact defaultExpanded />
              </div>
            )}

            {/* Offline Pre-Caching Status Banner */}
            {cachingProgress && (
              <div className="flex items-center justify-between gap-3 border-y border-cyan-500/35 bg-[#091522] px-6 py-2 text-xs font-mono text-cyan-200 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  {cachingProgress.active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400 shrink-0" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span className="truncate">{cachingProgress.label}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-32 h-1.5 rounded-full bg-black/60 overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
                      style={{
                        width: `${
                          cachingProgress.total > 0
                            ? Math.round((cachingProgress.done / cachingProgress.total) * 100)
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                  {!cachingProgress.active && (
                    <button
                      type="button"
                      onClick={() => setCachingProgress(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Full Open Catalogs Drawer: Polyfork (2,791 GLBs & 43 Kits) + Sandflow Sand3D (106,094 Assets) */}
            {showFullCatalogsDrawer && (
              <div className="border-y border-emerald-500/35 bg-[#0a1019] p-4 animate-in slide-in-from-top duration-200 max-h-[55vh] overflow-y-auto space-y-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveExternalTab('polyfork')}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold font-mono transition-all cursor-pointer ${
                        activeExternalTab === 'polyfork'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <span>📦 Polyfork Full Catalog (2,791 Free .GLBs &amp; 43 Kits)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveExternalTab('sand3d')}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold font-mono transition-all cursor-pointer ${
                        activeExternalTab === 'sand3d'
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      <span>🏗️ Sandflow AI Sand3D (106,094 Open Assets • Apache-2.0 / CC BY 4.0)</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFullCatalogsDrawer(false)}
                    aria-label="Close Full Open Catalogs Drawer"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-300 hover:bg-rose-500/25 hover:border-rose-400/50 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {activeExternalTab === 'polyfork' ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0e1522] p-2.5 rounded-xl border border-white/10">
                      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                        <input
                          type="text"
                          value={polyforkSearch}
                          onChange={(e) => {
                            setPolyforkSearch(e.target.value);
                            setPolyforkPage(1);
                          }}
                          placeholder="Search all 2,791 Polyfork free .GLB models..."
                          className="flex-1 rounded-lg bg-black/50 border border-white/15 px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-400"
                        />
                        <select
                          value={selectedPolyforkKit}
                          onChange={(e) => {
                            setSelectedPolyforkKit(e.target.value);
                            setPolyforkPage(1);
                          }}
                          className="rounded-lg bg-black/50 border border-white/15 px-2.5 py-1.5 text-xs text-emerald-200 font-mono focus:outline-none focus:border-emerald-400"
                        >
                          <option value="all">🌐 All 43 Kits (2,791 Models)</option>
                          {POLYFORK_KITS_CATALOG.map((kit) => (
                            <option key={kit.id} value={kit.id}>
                              {kit.title} ({kit.parts} GLBs)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedPolyforkKit !== 'all' && (
                          <button
                            type="button"
                            disabled={cachingProgress?.active}
                            onClick={() => handleDownloadPolyforkKit(selectedPolyforkKit)}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-bold font-mono text-white shadow cursor-pointer disabled:opacity-50"
                            title="Download and cache all .GLB models in this Kit into your local Custom Library & IndexedDB"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>
                              Download &ldquo;
                              {POLYFORK_KITS_CATALOG.find((k) => k.id === selectedPolyforkKit)?.title ||
                                selectedPolyforkKit}
                              &rdquo; Kit to Library
                            </span>
                          </button>
                        )}
                        <a
                          href="https://github.com/lucas-martinic/polyfork-catalog"
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-[11px] font-mono text-slate-300 hover:text-white"
                        >
                          <span>GitHub Repo</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    {polyforkLoading ? (
                      <div className="flex items-center justify-center py-8 gap-2 text-xs font-mono text-emerald-300">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading 2,791 free .GLB models from Polyfork Open Index...</span>
                      </div>
                    ) : (
                      (() => {
                        const pfQ = polyforkSearch.trim().toLowerCase();
                        const pfFiltered = polyforkFullList.filter((item) => {
                          if (selectedPolyforkKit !== 'all' && item.kitId !== selectedPolyforkKit)
                            return false;
                          if (!pfQ) return true;
                          return (
                            item.name.toLowerCase().includes(pfQ) ||
                            (item.kitId && item.kitId.toLowerCase().includes(pfQ)) ||
                            item.id.toLowerCase().includes(pfQ)
                          );
                        });
                        const pageSize = 48;
                        const totalPages = Math.max(1, Math.ceil(pfFiltered.length / pageSize));
                        const safePage = Math.min(polyforkPage, totalPages);
                        const visibleItems = pfFiltered.slice(
                          (safePage - 1) * pageSize,
                          safePage * pageSize
                        );

                        return (
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
                              <span>
                                Showing <strong className="text-emerald-300">{visibleItems.length}</strong> of{' '}
                                <strong className="text-white">{pfFiltered.length}</strong> free .GLB models (100% Free Tier • Direct CDN + Local IndexedDB Cache)
                              </span>
                              {totalPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={safePage <= 1}
                                    onClick={() => setPolyforkPage((p) => Math.max(1, p - 1))}
                                    className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-slate-200 disabled:opacity-40"
                                  >
                                    ◀ Prev
                                  </button>
                                  <span className="text-slate-300">
                                    Page {safePage} / {totalPages}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPolyforkPage((p) => Math.min(totalPages, p + 1))}
                                    className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-slate-200 disabled:opacity-40"
                                  >
                                    Next ▶
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                              {visibleItems.map((pf) => (
                                <div
                                  key={pf.id}
                                  onClick={() => {
                                    recordRecentAsset(pf.id);
                                    setPreviewedAsset(pf);
                                  }}
                                  className={`flex flex-col justify-between rounded-xl border p-2.5 transition-all cursor-pointer ${
                                    previewedAsset?.id === pf.id
                                      ? 'border-cyan-400 bg-cyan-500/15 ring-1 ring-cyan-400/50'
                                      : 'border-white/10 bg-[#101522] hover:border-emerald-500/50'
                                  }`}
                                  title="Click card to inspect in 3D before placing"
                                >
                                  <div className="flex items-center gap-2">
                                    {pf.conceptImageUrl ? (
                                      <img
                                        src={pf.conceptImageUrl}
                                        alt={pf.name}
                                        loading="lazy"
                                        className="h-10 w-10 rounded-lg object-cover bg-black/60 border border-white/10 shrink-0"
                                      />
                                    ) : (
                                      <span className="text-xl">{pf.icon}</span>
                                    )}
                                    <div className="min-w-0">
                                      <div
                                        className="text-[11px] font-bold text-white truncate"
                                        title={pf.name}
                                      >
                                        {pf.name}
                                      </div>
                                      <div
                                        className="text-[9px] font-mono text-emerald-400 truncate"
                                        title={pf.kitId || 'Polyfork'}
                                      >
                                        {pf.kitId || pf.category}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-white/5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        recordRecentAsset(pf.id);
                                        setPreviewedAsset(pf);
                                      }}
                                      className="rounded border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/30 py-1 px-1.5 text-[10px] font-mono text-cyan-200 cursor-pointer"
                                      title="Inspect in 3D Preview"
                                    >
                                      👁️
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePlaceOnStage(pf);
                                      }}
                                      className="flex-1 rounded bg-emerald-600 hover:bg-emerald-500 py-1 px-1.5 text-[10px] font-bold font-mono text-white cursor-pointer"
                                    >
                                      + Stage
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (pf.modelUrl) {
                                          await getModelBuffer(pf.modelUrl);
                                        }
                                        addCustomAsset({
                                          ...pf,
                                          id: `pf-saved-${pf.id}`,
                                          isCustom: true,
                                          source: 'uploaded',
                                        });
                                        setAddedAssetId(`pf-saved-${pf.id}`);
                                      }}
                                      className="rounded border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/30 py-1 px-1.5 text-[10px] font-mono text-cyan-200 cursor-pointer"
                                      title="Download & cache .GLB to local IndexedDB library"
                                    >
                                      {addedAssetId === `pf-saved-${pf.id}` ? '✓' : '⬇️'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/30 bg-[#0f1424] p-3 text-xs">
                      <div className="space-y-0.5">
                        <div className="font-bold text-indigo-200 font-mono">
                          Sandflow AI — Sand3D Open Programmable 3D Assets (106,094 Items)
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Licensed under <strong>Apache-2.0 (Code)</strong> &amp;{' '}
                          <strong>CC BY 4.0 (3D Datasets)</strong> • Stored as OpenUSD (
                          <code className="text-indigo-300">.usda</code>) &amp; Python{' '}
                          <code className="text-indigo-300">sand3d</code> procedural code on Hugging Face.
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href="https://github.com/Sandflow-ai/sand3d"
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-[11px] font-mono text-slate-200"
                        >
                          <span>GitHub (Sandflow-ai/sand3d)</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <a
                          href="https://huggingface.co/Sandflow"
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1.5 text-[11px] font-mono text-amber-200"
                        >
                          <span>Hugging Face Hub</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {SANDFLOW_DATASETS_CATALOG.map((ds) => (
                        <div
                          key={ds.id}
                          className="rounded-xl border border-white/10 bg-[#101420] p-3 space-y-2 hover:border-indigo-500/40 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-white font-mono">{ds.title}</div>
                              <div className="text-[10px] text-slate-400">{ds.description}</div>
                            </div>
                            <span className="rounded-full bg-indigo-500/20 border border-indigo-500/40 px-2 py-0.5 text-[10px] font-mono font-bold text-indigo-300 shrink-0">
                              {ds.count.toLocaleString()} Assets
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-black/50 rounded-lg border border-white/10 px-2.5 py-1.5 font-mono text-[10px] text-emerald-300">
                            <code className="truncate flex-1">{ds.cliCommand}</code>
                            <button
                              type="button"
                              onClick={() => handleCopyCommand(ds.id, ds.cliCommand)}
                              className="flex items-center gap-1 rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-[10px] text-white shrink-0 cursor-pointer"
                              title="Copy Hugging Face CLI download command"
                            >
                              {copiedCmdId === ds.id ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              <span>{copiedCmdId === ds.id ? 'Copied' : 'Copy CLI'}</span>
                            </button>
                          </div>

                          <div className="flex items-center justify-between pt-1 text-[10px] font-mono">
                            <span className="text-slate-400">License: {ds.license}</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handlePreviewSandflowDataset(ds.id, ds.hfRepo)}
                                className="rounded bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/40 px-2 py-0.5 text-indigo-200 cursor-pointer"
                              >
                                {sandflowPreviewId === ds.id ? 'Hide Live Sample' : '🔍 Live HF Sample'}
                              </button>
                              <a
                                href={ds.hfUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-amber-300 hover:underline flex items-center gap-0.5"
                              >
                                <span>Open Dataset</span>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            </div>
                          </div>

                          {sandflowPreviewId === ds.id && (
                            <div className="mt-2 rounded-lg border border-indigo-500/30 bg-black/60 p-2 space-y-1.5 max-h-44 overflow-y-auto font-mono text-[10px]">
                              {sandflowLoading ? (
                                <div className="flex items-center gap-1.5 text-indigo-300">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>Querying Hugging Face Datasets Server API...</span>
                                </div>
                              ) : sandflowPreviewRows.length === 0 ? (
                                <div className="text-slate-400">
                                  Connect to the internet or open {ds.hfUrl} to browse rows.
                                </div>
                              ) : (
                                sandflowPreviewRows.map((row) => (
                                  <div
                                    key={`${ds.id}-${row.id}`}
                                    className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1 border border-white/5"
                                  >
                                    <span className="text-slate-200 truncate">
                                      {row.name} ({row.category})
                                    </span>
                                    <span className="text-[9px] text-emerald-400 shrink-0">
                                      CC BY 4.0
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI 3D Generator Sub-Panel */}
            {showGenerator && (
              <div className="border-y border-amber-500/30 bg-gradient-to-r from-[#171424] via-[#121524] to-[#171424] p-4 animate-in slide-in-from-top duration-300 shrink-0">
                <form onSubmit={handleGenerateSubmit} className="max-w-4xl mx-auto space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-bold text-sm flex items-center gap-1.5 font-display">
                          <Zap className="h-4 w-4 text-amber-400" />
                          Quick Text-to-3D Generator
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                          (For reference images &amp; multi-angle sculpting, open Concept-to-3D Studio)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          type="button"
                          onClick={() => {
                            open3DStudio({ initialPrompt: genPrompt });
                          }}
                          className="flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-mono text-indigo-200 hover:bg-indigo-500/25 hover:text-white transition-all cursor-pointer"
                        >
                          <Sparkles className="h-3 w-3 text-amber-300" />
                          <span>Open Concept-to-3D Studio</span>
                        </button>
                        <button
                          type="button"
                          id="reasoner-settings-toggle"
                          onClick={() => setShowSettingsModal(true)}
                          title="Change the LLM provider (opens Studio Settings)"
                          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-mono text-slate-400 hover:text-white hover:border-white/25 transition-all"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          Reasoner: {reasonerLabel}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowGenerator(false)}
                      aria-label="Close Quick Text-to-3D Generator"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-300 hover:bg-rose-500/25 hover:border-rose-400/50 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={genPrompt}
                      onChange={(e) => setGenPrompt(e.target.value)}
                      placeholder="Describe any 3D asset (e.g. green billiard table with pool balls / Victorian grandfather clock)..."
                      disabled={isGenerating}
                      className="flex-1 rounded-xl bg-black/50 border border-white/20 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all font-mono"
                    />

                    <select
                      value={genCategory}
                      onChange={(e) => setGenCategory(e.target.value as AssetCategory)}
                      disabled={isGenerating}
                      className="rounded-xl bg-black/50 border border-white/20 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400 font-mono"
                    >
                      <option value="props">📦 Props &amp; Items</option>
                      <option value="furniture">🪑 Furniture</option>
                      <option value="vehicle">🚗 Vehicles</option>
                      <option value="architecture">🏛️ Architecture</option>
                      <option value="character">👤 Character</option>
                      <option value="weapons">⚔️ Weapons</option>
                      <option value="scifi">⚛️ Sci-Fi Tech</option>
                      <option value="nature">🌲 Nature</option>
                    </select>

                    <button
                      type="submit"
                      disabled={isGenerating || !genPrompt.trim()}
                      className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold px-5 py-2 text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-black" />
                          <span>Generating ({generationProgress}%)...</span>
                        </>
                      ) : (
                        <>
                          <span>Start Generation</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>

                  {isGenerating && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-amber-300 font-semibold flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {generationStage}
                        </span>
                        <span className="text-amber-400 font-bold">{elapsedSec}s</span>
                      </div>
                      <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/10">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 via-indigo-500 to-emerald-400 transition-all duration-300"
                          style={{ width: `${generationProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {!isGenerating && generationError && (
                    <div className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200 font-mono">
                      {generationError}
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* Upload error banner if any */}
            {uploadError && (
              <div className="bg-rose-950/80 border-y border-rose-500/40 px-6 py-2 text-xs text-rose-300 flex items-center justify-between shrink-0">
                <span>{uploadError}</span>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="text-rose-400 hover:text-white font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            {/* 4. QUICK-PLACE STAGE ESSENTIALS BAR */}
            <div className="flex items-center gap-1.5 overflow-x-auto px-6 py-1.5 bg-[#0a0d16] no-scrollbar font-mono text-[11px] shrink-0">
              <span className="text-amber-300 font-bold whitespace-nowrap mr-1 flex items-center gap-1">
                <span>⚡</span>
                <span>Quick Place:</span>
              </span>
              {[
                {
                  label: '👤 Character (IK Rig)',
                  name: undefined,
                  kind: 'human' as const,
                  prompt: undefined,
                },
                {
                  label: '🖼️ 2D Standee',
                  name: 'Standee',
                  kind: 'cutout' as const,
                  prompt: 'a cutout standee photo card',
                },
                { label: '🚗 Vehicle', name: 'Car', kind: 'car' as const, prompt: undefined },
                { label: '🌲 Tree', name: 'Tree', kind: 'tree' as const, prompt: undefined },
                { label: '🪑 Table', name: 'Table', kind: 'table' as const, prompt: undefined },
                { label: '💺 Chair', name: 'Chair', kind: 'chair' as const, prompt: undefined },
                {
                  label: '⬛ Cube',
                  name: 'Cube Block',
                  kind: 'cube' as const,
                  prompt: 'a greybox cube blocking prop',
                },
                {
                  label: '🏛️ Cylinder',
                  name: 'Cylinder',
                  kind: 'cylinder' as const,
                  prompt: 'a greybox cylinder column',
                },
                {
                  label: '📐 Plane',
                  name: 'Ground Plane',
                  kind: 'plane' as const,
                  prompt: 'a ground stage plane',
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    addActor(item.name, item.kind, item.prompt);
                    closeLibrary();
                  }}
                  className="flex items-center gap-1 rounded-full bg-[#131a2c] hover:bg-indigo-600/35 border border-white/10 hover:border-indigo-400/60 px-3 py-1 text-slate-200 hover:text-white whitespace-nowrap transition-all cursor-pointer"
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* 5. HORIZONTAL CATEGORIES PILL BAR */}
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/10 px-6 py-2 bg-[#0a0d16] no-scrollbar shrink-0">
              {CATEGORIES.map((cat) => {
                const count =
                  cat.id === 'all'
                    ? allAssets.length
                    : cat.id === 'custom'
                    ? customAssets.length
                    : allAssets.filter((a) => a.category === cat.id).length;

                const isSelected = selectedCategory === cat.id && sidebarNav === 'explore';

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSidebarNav('explore');
                      setSelectedCategory(cat.id);
                    }}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25 border border-blue-400/60'
                        : 'bg-[#121728] text-slate-300 hover:bg-[#192036] hover:text-white border border-white/10'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.2 text-[10px] font-mono ${
                        isSelected
                          ? 'bg-white/25 text-white font-bold'
                          : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 6. SUB-TOOLBAR: Showing Count + Grid/Compact Toggle + Sort Selector */}
            <div className="flex items-center justify-between gap-3 px-6 py-2 bg-[#090c14] border-b border-white/5 text-xs shrink-0">
              <div className="flex items-center gap-2 text-slate-300">
                <span>
                  Showing <strong className="text-white font-bold">{filteredAssets.length}</strong>{' '}
                  Assets
                </span>
                {sidebarNav === 'favorites' && (
                  <span className="rounded-full bg-rose-500/20 border border-rose-400/40 px-2 py-0.5 text-[10px] font-mono text-rose-200">
                    ♥ Favorites
                  </span>
                )}
                {sidebarNav === 'recent' && (
                  <span className="rounded-full bg-cyan-500/20 border border-cyan-400/40 px-2 py-0.5 text-[10px] font-mono text-cyan-200">
                    🕒 Recent
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Grid vs Compact View Toggle */}
                <div className="flex items-center rounded-lg border border-white/10 bg-[#111626] p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`rounded-md p-1.5 transition-colors cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Large Studio Card Grid"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('compact')}
                    className={`rounded-md p-1.5 transition-colors cursor-pointer ${
                      viewMode === 'compact'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Compact Technical Grid"
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Sort Selector */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="rounded-lg border border-white/15 bg-[#111626] px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="name-asc">Name (A–Z)</option>
                  <option value="category">Category</option>
                </select>
              </div>
            </div>

            {/* 7. ASSETS GRID + 360° 3D INTERACTIVE SIDE INSPECTOR */}
            <div className="flex flex-1 min-h-0 overflow-hidden bg-[#080a12]">
              <div className="flex-1 overflow-y-auto p-5">
                {filteredAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
                    <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl text-slate-500">
                      🔍
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-300">No matching assets found</p>
                      <p className="text-xs text-slate-500">
                        Try searching for another keyword, or click <strong>Text-to-3D</strong> to generate it!
                      </p>
                    </div>
                    <button
                      type="button"
                      title={`Generate "${searchQuery}" in 3D (.GLB)`}
                      onClick={() => {
                        open3DStudio({
                          initialMode: 'text-to-3d',
                          initialPrompt: searchQuery,
                        });
                      }}
                      className="max-w-md overflow-hidden rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shadow cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate min-w-0">
                        Generate &ldquo;{searchQuery}&rdquo; in 3D (.GLB)
                      </span>
                    </button>
                  </div>
                ) : (
                  <div
                    className={`grid gap-3.5 ${
                      viewMode === 'compact'
                        ? previewedAsset
                          ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                          : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'
                        : previewedAsset
                        ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4'
                        : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                    }`}
                  >
                    {filteredAssets.map((asset) => {
                      const isRecentlyAdded = addedAssetId === asset.id;
                      const isSelected = selectedAssetIds.has(asset.id);
                      const isPreviewed = previewedAsset?.id === asset.id;
                      const isFav = favoriteIds.includes(asset.id);
                      const reasonedGraph = lookupPartGraph(asset.tokenPrompt || asset.name);
                      const isReasoning = reasoningAssetId === asset.id;

                      return (
                        <div
                          key={asset.id}
                          onClick={() => {
                            if (isMultiSelectMode) {
                              toggleAssetSelection(asset.id);
                            } else {
                              recordRecentAsset(asset.id);
                              setPreviewedAsset(asset);
                            }
                          }}
                          title="Click card to inspect in 360° 3D Preview before placing on stage"
                          className={`group relative flex flex-col justify-between rounded-2xl border overflow-hidden transition-all cursor-pointer select-none ${
                            isSelected
                              ? 'border-amber-400 bg-[#171510] ring-2 ring-amber-500/50 shadow-lg shadow-amber-500/15'
                              : isPreviewed
                              ? 'border-cyan-400 bg-[#0f1a28] ring-2 ring-cyan-400/60 shadow-xl shadow-cyan-500/20'
                              : 'border-white/10 bg-[#111524] hover:border-indigo-400/60 hover:bg-[#141a2c] hover:shadow-xl hover:shadow-indigo-500/15'
                          }`}
                        >
                          {/* CARD TOP HERO THUMBNAIL (Large 4:3 Preview matching reference image) */}
                          <div
                            className={`relative w-full overflow-hidden bg-gradient-to-b from-[#1a2236] to-[#0d111d] ${
                              viewMode === 'compact' ? 'h-24' : 'h-36'
                            }`}
                          >
                            {(() => {
                              const thumbUrl = resolveAssetThumbUrl(asset);
                              return thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt={asset.name}
                                  loading="lazy"
                                  className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-4xl">
                                  <span role="img" aria-label={asset.name}>
                                    {asset.icon}
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Subtle bottom gradient vignette for badge legibility */}
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#111524] via-[#111524]/60 to-transparent" />

                            {/* Top-Left Model Source Icon & Badge */}
                            {(() => {
                              const srcBadge = resolveAssetSourceBadge(asset);
                              return (
                                <div
                                  className="absolute top-2.5 left-2.5 z-10"
                                  title={srcBadge.title}
                                >
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-md backdrop-blur-md border px-2 py-0.5 text-[9.5px] font-mono font-bold shadow ${srcBadge.className}`}
                                  >
                                    <span>{srcBadge.icon}</span>
                                    <span>{srcBadge.label}</span>
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Top-Right Favorite Heart or Multi-Select Checkbox */}
                            <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1">
                              {isMultiSelectMode ? (
                                <div
                                  className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-all ${
                                    isSelected
                                      ? 'bg-amber-500 border-amber-400 text-black shadow'
                                      : 'border-white/40 bg-black/60 text-transparent'
                                  }`}
                                >
                                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => toggleFavorite(asset.id, e)}
                                  aria-label={`Favorite ${asset.name}`}
                                  title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                                  className={`flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md border transition-all cursor-pointer ${
                                    isFav
                                      ? 'bg-rose-500/30 border-rose-400/60 text-rose-400'
                                      : 'bg-black/45 border-white/15 text-slate-300 hover:text-white hover:border-white/35'
                                  }`}
                                >
                                  <Heart
                                    className={`h-3.5 w-3.5 ${isFav ? 'fill-rose-400 text-rose-400' : ''}`}
                                  />
                                </button>
                              )}
                            </div>

                            {/* Bottom-Left Overlapping Category Pill Badge */}
                            <div className="absolute bottom-2 left-2.5 z-10 flex items-center gap-1">
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#0d1220]/90 backdrop-blur-md border border-white/15 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-200 capitalize shadow">
                                <span>
                                  {CATEGORIES.find((c) => c.id === asset.category)?.icon || '📦'}
                                </span>
                                <span>{asset.category}</span>
                              </span>
                              {reasonedGraph && (
                                <span
                                  className="rounded-md px-1.5 py-0.5 text-[9px] font-mono font-bold bg-cyan-950/90 text-cyan-300 border border-cyan-500/40"
                                  title={`Reasoned: ${reasonedGraph.parts.length} parts`}
                                >
                                  ⚡ {reasonedGraph.parts.length}P
                                </span>
                              )}
                            </div>
                          </div>

                          {/* CARD BODY: Title, Technical Subtitle & Action Row */}
                          <div className="flex flex-1 flex-col justify-between p-3 pt-2">
                            <div className="space-y-0.5">
                              <h3
                                className={`font-bold text-[13px] leading-snug line-clamp-1 transition-colors ${
                                  isSelected
                                    ? 'text-amber-200'
                                    : isPreviewed
                                    ? 'text-cyan-200'
                                    : 'text-white group-hover:text-indigo-200'
                                }`}
                                title={asset.name}
                              >
                                {asset.name}
                              </h3>
                              <p className="text-[10.5px] font-mono text-slate-400 line-clamp-1">
                                {asset.fileSize
                                  ? asset.fileSize
                                  : asset.rigType === 'humanoid'
                                  ? '19-Bone IK/FK • GLB'
                                  : reasonedGraph
                                  ? `${reasonedGraph.heightMeters.toFixed(1)}m • ${reasonedGraph.materials.length} mats • GLB`
                                  : 'Open Free Tier • GLB'}
                              </p>
                            </div>

                            {/* Bottom Action Buttons Row (+ Place & 3D Inspector / Controls) */}
                            <div className="mt-2.5 flex items-center gap-1.5">
                              {isMultiSelectMode ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleAssetSelection(asset.id);
                                  }}
                                  className={`flex-1 rounded-xl py-1.5 px-2.5 text-xs font-bold font-mono transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                    isSelected
                                      ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                                      : 'bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10'
                                  }`}
                                >
                                  {isSelected ? (
                                    <>
                                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                                      <span>Selected</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-3.5 w-3.5" />
                                      <span>Select</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePlaceOnStage(asset);
                                    }}
                                    className={`flex-1 rounded-xl py-1.5 px-3 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                      isRecentlyAdded
                                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
                                        : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md shadow-indigo-600/25'
                                    }`}
                                  >
                                    {isRecentlyAdded ? (
                                      <>
                                        <Check className="h-3.5 w-3.5" />
                                        <span>Placed!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                                        <span>Place</span>
                                      </>
                                    )}
                                  </button>

                                  {/* Square 3D Inspector / Settings Toggle Button (Matches Reference Image) */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      recordRecentAsset(asset.id);
                                      setPreviewedAsset((cur) =>
                                        cur?.id === asset.id ? null : asset
                                      );
                                    }}
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all cursor-pointer ${
                                      isPreviewed
                                        ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-500/20'
                                        : 'bg-[#181f33] hover:bg-[#222b45] border-white/15 text-slate-300 hover:text-white'
                                    }`}
                                    title="Inspect in 360° 3D Preview & Pose Tester"
                                  >
                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                  </button>

                                  {/* Reason with LLM Button for procedural rigs */}
                                  {!asset.modelUrl && !asset.modelId && !asset.isCustom && (
                                    <button
                                      type="button"
                                      disabled={isReasoning || isGenerating}
                                      onClick={(e) => handleReasonWithLlm(asset, e)}
                                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-white transition-all cursor-pointer"
                                      title="Reason with LLM to build custom 3D parts"
                                    >
                                      {isReasoning ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                                      ) : (
                                        <Sparkles className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  )}

                                  {/* Delete button if custom */}
                                  {asset.isCustom && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeCustomAsset(asset.id);
                                      }}
                                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                                      title="Remove from custom library"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 360° Interactive 3D Side Inspector Panel */}
              {previewedAsset && (
                <Asset3DPreviewInspector
                  asset={previewedAsset}
                  onClose={() => setPreviewedAsset(null)}
                  onPlaceOnStage={handlePlaceOnStage}
                />
              )}
            </div>

            {/* Multi-Select Floating Action Dock */}
            {isMultiSelectMode && (
              <div className="flex items-center justify-between border-t border-amber-500/30 bg-[#16120e] px-6 py-2.5 text-xs text-slate-200 shadow-2xl animate-in slide-in-from-bottom duration-200 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 font-bold text-amber-300 font-mono">
                    <CheckSquare className="h-4 w-4 text-amber-400" />
                    <span>{selectedAssetIds.size} asset(s) selected</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-mono hover:bg-white/15 hover:text-white transition-colors"
                  >
                    Select All Visible ({filteredAssets.length})
                  </button>
                  {selectedAssetIds.size > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-mono text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMultiSelectMode(false);
                      setSelectedAssetIds(new Set());
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-colors font-mono"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handlePlaceSelectedOnStage}
                    disabled={selectedAssetIds.size === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 px-4 py-1.5 text-xs font-bold text-black shadow-lg shadow-amber-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-mono"
                  >
                    <Plus className="h-4 w-4 stroke-[3]" />
                    <span>Place Selected ({selectedAssetIds.size}) on Stage ▶</span>
                  </button>
                </div>
              </div>
            )}

            {/* 8. BOTTOM ATTRIBUTION FOOTER */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-t border-white/10 px-6 py-2 bg-[#0b0e18] text-[11px] text-slate-400 font-mono shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-emerald-400 font-bold">
                  ● 100% Free &amp; Open 3D Sources:
                </span>
                <a
                  href="https://github.com/lucas-martinic/polyfork-catalog"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-200 hover:text-cyan-300 transition-colors"
                >
                  Polyfork Catalog (lucas-martinic/polyfork-catalog • MIT)
                </a>
                <span className="text-slate-600">|</span>
                <a
                  href="https://github.com/Sandflow-ai/sand3d"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-200 hover:text-indigo-300 transition-colors"
                >
                  Sandflow AI Sand3D (Apache-2.0 / CC BY 4.0)
                </a>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowFullCatalogsDrawer((prev) => !prev)}
                  className="text-amber-300 hover:text-amber-200 underline cursor-pointer"
                >
                  {showFullCatalogsDrawer
                    ? 'Hide Full Catalogs'
                    : 'Browse & Download Full Libraries (108,885 Assets)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Studio Reasoner Settings Modal */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => {
            e.stopPropagation();
            setShowSettingsModal(false);
          }}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0e111a] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ReasonerSettingsPanel onClose={() => setShowSettingsModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
