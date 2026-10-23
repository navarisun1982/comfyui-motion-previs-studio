import React, { useState, useRef, useEffect } from 'react';
import {
  useAssetLibraryStore,
  CURATED_3D_ASSETS,
  AssetCategory,
  Asset3DItem,
} from '../stores/useAssetLibraryStore';
import { useShotStore } from '../stores/useShotStore';
import { useComfyStore } from '../stores/useComfyStore';
import { describeReasoner } from '../services/objectReasoner';
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
} from 'lucide-react';
import { lookupPartGraph } from '../engine/procedural3D/partGraph';

const CATEGORIES: { id: AssetCategory; label: string; labelAr: string; icon: string }[] = [
  { id: 'all', label: 'All Catalog', labelAr: 'الكل', icon: '🌐' },
  { id: 'custom', label: 'My Uploads & AI', labelAr: 'مجسماتي والتوليد', icon: '⭐' },
  { id: 'architecture', label: 'Architecture', labelAr: 'مباني وعمارة', icon: '🏛️' },
  { id: 'vehicle', label: 'Vehicles', labelAr: 'مركبات', icon: '🚗' },
  { id: 'character', label: 'Characters', labelAr: 'شخصيات', icon: '👤' },
  { id: 'creature', label: 'Creatures', labelAr: 'كائنات وحيوانات', icon: '🦌' },
  { id: 'furniture', label: 'Furniture', labelAr: 'أثاث وديكور', icon: '🪑' },
  { id: 'props', label: 'Props & Audio', labelAr: 'دعائم وأدوات', icon: '📦' },
  { id: 'nature', label: 'Nature', labelAr: 'طبيعة وتضاريس', icon: '🌲' },
  { id: 'weapons', label: 'Weapons', labelAr: 'أسلحة ودروع', icon: '⚔️' },
  { id: 'scifi', label: 'Sci-Fi & Tech', labelAr: 'تقنية وخيال علمي', icon: '⚛️' },
];

export const AssetLibraryModal: React.FC = () => {
  const {
    isOpen,
    closeLibrary,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    customAssets,
    removeCustomAsset,
    uploadGlbFile,
    isUploading,
    generateAssetWithAi,
    isGenerating,
    generationProgress,
    generationStage,
    generationError,
  } = useAssetLibraryStore();

  const { addActor } = useShotStore();

  // Generator Panel state
  const [showGenerator, setShowGenerator] = useState(false);
  const openSettings = useComfyStore((s) => s.openSettings);
  // Subscribing re-renders this modal when settings close, so the label reflects a new provider.
  useComfyStore((s) => s.isSettingsOpen);
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

  // Honest progress: real elapsed time while the local model reasons (no simulated percentages).
  useEffect(() => {
    if (!isGenerating) return;
    const started = Date.now();
    setElapsedSec(0);
    const id = window.setInterval(() => setElapsedSec(Math.round((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [isGenerating]);

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

  // Combine curated assets and custom uploaded/generated assets
  const allAssets = [...customAssets, ...CURATED_3D_ASSETS];

  // Filter by category
  const categoryFiltered =
    selectedCategory === 'all'
      ? allAssets
      : selectedCategory === 'custom'
      ? customAssets
      : allAssets.filter((a) => a.category === selectedCategory);

  // Filter by AI Reasoned state if toggled
  const reasonedFiltered = showOnlyReasoned
    ? categoryFiltered.filter((a) => lookupPartGraph(a.tokenPrompt || a.name) || a.source === 'ai-generated')
    : categoryFiltered;

  // Filter by search query (Arabic + English)
  const q = searchQuery.trim().toLowerCase();
  const filteredAssets = reasonedFiltered.filter((a) => {
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      a.nameAr.includes(q) ||
      a.tokenPrompt.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    );
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

  const handlePlaceOnStage = (asset: Asset3DItem) => {
    addActor(asset.name, asset.kind, asset.tokenPrompt, {
      modelUrl: asset.modelUrl,
      scale: asset.scale || 1.0,
      actionDescription: `placed on stage from 3D Asset Library: ${asset.name}`,
    });

    setAddedAssetId(asset.id);
    // Close modal window so the user immediately sees the placed 3D asset on the stage
    closeLibrary();
  };

  const handlePlaceSelectedOnStage = () => {
    if (selectedAssetIds.size === 0) return;
    const selectedList = allAssets.filter((a) => selectedAssetIds.has(a.id));
    selectedList.forEach((asset) => {
      addActor(asset.name, asset.kind, asset.tokenPrompt, {
        modelUrl: asset.modelUrl,
        scale: asset.scale || 1.0,
        actionDescription: `placed on stage from 3D Asset Library: ${asset.name}`,
      });
    });
    setSelectedAssetIds(new Set());
    setIsMultiSelectMode(false);
    // Close modal window so the user immediately sees all placed 3D assets on the stage
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="flex h-[90vh] w-[95vw] max-w-6xl flex-col rounded-2xl border border-white/15 bg-[#0b0d14] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-[#10131d]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-indigo-600 shadow-lg shadow-amber-500/20 text-white font-bold text-lg">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold tracking-wide text-white">
                  3D Asset Library & AI Generator
                </h2>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300 border border-amber-500/30">
                  {allAssets.length} Assets
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  GLB / GLTF Native
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans">
                مكتبة المجسمات ثلاثية الأبعاد المعتمدة • دعم كامل لرفع ملفات GLB والتوليد بالذكاء الاصطناعي
              </p>
            </div>
          </div>

          {/* Action Buttons in Header */}
          <div className="flex items-center gap-2.5">
            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".glb,.gltf"
              className="hidden"
            />

            {/* Upload GLB Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
              title="Upload any 3D model (.glb / .gltf) from your PC"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>Upload GLB / GLTF</span>
            </button>

            {/* Generate with AI Button */}
            <button
              onClick={() => setShowGenerator(!showGenerator)}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                showGenerator
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:brightness-110 shadow-md shadow-purple-600/30'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>✨ AI 3D Generator</span>
            </button>

            {/* Multi-Select Toggle Button */}
            <button
              onClick={() => {
                if (isMultiSelectMode) {
                  setIsMultiSelectMode(false);
                  setSelectedAssetIds(new Set());
                } else {
                  setIsMultiSelectMode(true);
                }
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all border ${
                isMultiSelectMode
                  ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/30'
                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
              }`}
              title="Toggle multi-selection to place several 3D models at once"
            >
              <CheckSquare className="h-4 w-4" />
              <span>Select Multiple {selectedAssetIds.size > 0 && `(${selectedAssetIds.size})`}</span>
            </button>

            {/* Close Button */}
            <button
              onClick={closeLibrary}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              title="Close Library (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* AI 3D Generator Sub-Panel */}
        {showGenerator && (
          <div className="border-b border-amber-500/30 bg-gradient-to-r from-[#171424] via-[#121524] to-[#171424] p-5 animate-in slide-in-from-top duration-300">
            <form onSubmit={handleGenerateSubmit} className="max-w-4xl mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold text-sm flex items-center gap-1.5 font-display">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    AI 3D Model Generation Pipeline (مسار التوليد بالذكاء الاصطناعي)
                  </span>
                </div>
                <button
                  type="button"
                  id="reasoner-settings-toggle"
                  onClick={() => openSettings('llm')}
                  title="Change the LLM provider (opens Studio Settings)"
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-mono text-slate-400 hover:text-white hover:border-white/25 transition-all"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Reasoner: {reasonerLabel}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder="Describe any 3D asset in English or Arabic (e.g. طاولة بلياردو خضراء مع كرات / Victorian grandfather clock)"
                  disabled={isGenerating}
                  className="flex-1 rounded-xl bg-black/50 border border-white/20 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all font-mono"
                />

                <select
                  value={genCategory}
                  onChange={(e) => setGenCategory(e.target.value as AssetCategory)}
                  disabled={isGenerating}
                  className="rounded-xl bg-black/50 border border-white/20 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400 font-mono"
                >
                  <option value="props">📦 Props & Items</option>
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
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold px-5 py-2.5 text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0"
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

              {/* Real-Time Stepper Progress when Generating */}
              {isGenerating && (
                <div className="space-y-1.5 pt-2">
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
          <div className="bg-rose-950/80 border-b border-rose-500/40 px-6 py-2 text-xs text-rose-300 flex items-center justify-between">
            <span>{uploadError}</span>
            <button
              onClick={() => setUploadError(null)}
              className="text-rose-400 hover:text-white font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Search & Category Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-white/10 px-6 py-3 bg-[#0d0f17]">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 200+ assets (English or Arabic e.g. سيارة, piano, tower, sword)..."
              className="w-full rounded-xl bg-black/40 border border-white/10 pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Stats & Filters */}
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <button
              onClick={() => setShowOnlyReasoned(!showOnlyReasoned)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all border ${
                showOnlyReasoned
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-sm'
                  : 'bg-white/5 text-slate-400 hover:text-white border-white/10'
              }`}
              title="Show only 3D models with reasoned part graphs"
            >
              <Zap className="h-3.5 w-3.5 text-cyan-400" />
              <span>⚡ AI-Reasoned ({allAssets.filter((a) => lookupPartGraph(a.tokenPrompt || a.name) || a.source === 'ai-generated').length})</span>
            </button>
            <span className="text-slate-600">•</span>
            <span>Showing <strong className="text-white">{filteredAssets.length}</strong></span>
            <span className="text-slate-600">•</span>
            <button
              onClick={() => setSelectedCategory('custom')}
              className={`hover:text-amber-300 transition-colors ${
                selectedCategory === 'custom' ? 'text-amber-400 font-bold' : ''
              }`}
            >
              ⭐ Custom & Uploads ({customAssets.length})
            </button>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/10 px-6 py-2 bg-[#090b12] no-scrollbar">
          {CATEGORIES.map((cat) => {
            const count =
              cat.id === 'all'
                ? allAssets.length
                : cat.id === 'custom'
                ? customAssets.length
                : allAssets.filter((a) => a.category === cat.id).length;

            const isSelected = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 ring-1 ring-blue-400'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/5'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Assets Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#08090d]">
          {filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
              <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl text-slate-500">
                🔍
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-300">No matching assets found</p>
                <p className="text-xs text-slate-500">
                  Try searching for another keyword, or click <strong>✨ AI 3D Generator</strong> to generate it instantly!
                </p>
              </div>
              <button
                onClick={() => {
                  setGenPrompt(searchQuery);
                  setShowGenerator(true);
                }}
                className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Generate "{searchQuery}" with AI</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
              {filteredAssets.map((asset) => {
                const isRecentlyAdded = addedAssetId === asset.id;
                const isSelected = selectedAssetIds.has(asset.id);
                const reasonedGraph = lookupPartGraph(asset.tokenPrompt || asset.name);
                const isReasoning = reasoningAssetId === asset.id;

                return (
                  <div
                    key={asset.id}
                    onClick={() => {
                      if (isMultiSelectMode) {
                        toggleAssetSelection(asset.id);
                      }
                    }}
                    className={`group relative flex flex-col justify-between rounded-xl border p-3 transition-all ${
                      isMultiSelectMode ? 'cursor-pointer select-none' : ''
                    } ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-500/50 shadow-lg shadow-amber-500/10'
                        : reasonedGraph
                        ? 'border-cyan-500/30 bg-[#0e1422] hover:border-cyan-400/60 hover:bg-[#12192a] hover:shadow-xl hover:shadow-cyan-500/10'
                        : 'border-white/10 bg-[#10131d] hover:border-blue-500/50 hover:bg-[#141824] hover:shadow-xl hover:shadow-blue-500/10'
                    }`}
                  >
                    {/* Top Badges */}
                    <div className="flex items-center justify-between">
                      <span className="text-2xl" role="img" aria-label={asset.name}>
                        {asset.icon}
                      </span>
                      <div className="flex items-center gap-1">
                        {isMultiSelectMode ? (
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
                              isSelected
                                ? 'bg-amber-500 border-amber-400 text-black shadow-sm'
                                : 'border-white/30 bg-black/40 text-transparent hover:border-white/60'
                            }`}
                          >
                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <>
                            {reasonedGraph && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[8px] font-mono font-bold tracking-wider bg-cyan-950/90 text-cyan-300 border border-cyan-500/40 flex items-center gap-0.5"
                                title={`Reasoned: ${reasonedGraph.parts.length} physical parts, ${reasonedGraph.heightMeters}m tall`}
                              >
                                <Zap className="h-2.5 w-2.5 text-cyan-400 fill-current" />
                                <span>{reasonedGraph.route === 'author' ? `${reasonedGraph.parts.length}P` : 'KIT'}</span>
                              </span>
                            )}
                            {asset.isCustom && !reasonedGraph && (
                              <span
                                className={`rounded px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider ${
                                  asset.source === 'uploaded'
                                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-purple-950/80 text-purple-300 border border-purple-500/30'
                                }`}
                              >
                                {asset.source === 'uploaded' ? 'GLB' : 'AI'}
                              </span>
                            )}
                            <span className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[8px] font-mono text-slate-400 capitalize">
                              {asset.category}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Asset Name & Details */}
                    <div className="my-2.5 space-y-1">
                      <h3
                        className={`font-bold text-xs transition-colors line-clamp-1 ${
                          isSelected ? 'text-amber-200' : reasonedGraph ? 'text-cyan-100 group-hover:text-cyan-300' : 'text-white group-hover:text-blue-300'
                        }`}
                        title={asset.name}
                      >
                        {asset.name}
                      </h3>
                      <p className="text-[10px] text-amber-300/80 font-sans line-clamp-1" dir="rtl">
                        {asset.nameAr}
                      </p>
                      {reasonedGraph ? (
                        <p className="text-[9px] font-mono text-cyan-400/80 line-clamp-1">
                          {reasonedGraph.heightMeters.toFixed(1)}m • {reasonedGraph.materials.length} mats • {reasonedGraph.route}
                        </p>
                      ) : asset.fileSize ? (
                        <p className="text-[9px] font-mono text-slate-400">
                          File: {asset.fileSize}
                        </p>
                      ) : (
                        <p className="text-[9px] font-mono text-slate-500 line-clamp-1">
                          Standard archetype
                        </p>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center gap-1 pt-2 border-t border-white/5">
                      {isMultiSelectMode ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAssetSelection(asset.id);
                          }}
                          className={`flex-1 rounded-lg py-1.5 px-2 text-[11px] font-bold font-mono transition-all flex items-center justify-center gap-1 ${
                            isSelected
                              ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20 hover:bg-amber-400'
                              : 'bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <Check className="h-3 w-3 stroke-[3]" />
                              <span>Selected</span>
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3" />
                              <span>Select</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePlaceOnStage(asset)}
                            className={`flex-1 rounded-lg py-1.5 px-2 text-[11px] font-bold font-mono transition-all flex items-center justify-center gap-1 ${
                              isRecentlyAdded
                                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
                                : reasonedGraph
                                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-sm'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow group-hover:shadow-blue-500/30'
                            }`}
                          >
                            {isRecentlyAdded ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>Placed!</span>
                              </>
                            ) : (
                              <>
                                <Plus className="h-3 w-3" />
                                <span>Place</span>
                              </>
                            )}
                          </button>

                          {/* Reason with LLM Button */}
                          <button
                            type="button"
                            disabled={isReasoning || isGenerating}
                            onClick={(e) => handleReasonWithLlm(asset, e)}
                            className={`rounded-lg p-1.5 transition-all border ${
                              isReasoning
                                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                                : reasonedGraph
                                ? 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 text-cyan-300 hover:text-white'
                                : 'bg-indigo-600/20 hover:bg-indigo-600/40 border-indigo-500/30 text-indigo-300 hover:text-white'
                            }`}
                            title={
                              reasonedGraph
                                ? 'Re-reason this 3D shape with the active LLM'
                                : 'Reason with LLM to build authentic 3D parts & materials'
                            }
                          >
                            {isReasoning ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </>
                      )}

                      {/* Delete button if custom */}
                      {!isMultiSelectMode && asset.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCustomAsset(asset.id);
                          }}
                          className="rounded-lg p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Remove from custom library"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Multi-Select Floating Action Dock */}
        {isMultiSelectMode && (
          <div className="flex items-center justify-between border-t border-amber-500/30 bg-[#16120e] px-6 py-3 text-xs text-slate-200 shadow-2xl animate-in slide-in-from-bottom duration-200">
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

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 bg-[#0d0f17] text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">● 60 FPS Three.js Viewport</span>
            <span className="text-slate-600">•</span>
            <span>Drag-and-Drop or Click to Place</span>
          </div>
          <div>
            <span>AI Director Studio • 3D Asset Ecosystem</span>
          </div>
        </div>
      </div>
    </div>
  );
};
