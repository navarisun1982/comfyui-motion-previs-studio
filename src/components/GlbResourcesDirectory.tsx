import React, { useState } from 'react';
import {
  ExternalLink,
  Sparkles,
  Box,
  Globe,
  UserCheck,
  Wand2,
  Wrench,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';

export interface GlbResourceEntry {
  id: string;
  name: string;
  url: string;
  domainLabel: string;
  badge: string;
  badgeColor: string;
  description: string;
  tip?: string;
}

export interface GlbResourceCategory {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  icon: 'cc0' | 'marketplace' | 'mocap' | 'ai' | 'pro';
  items: GlbResourceEntry[];
}

export const GLB_RESOURCE_CATEGORIES: GlbResourceCategory[] = [
  {
    id: 'cc0-public-domain',
    number: '1',
    title: 'Free CC0 / Public Domain Animated .GLB Libraries (No Login Needed)',
    subtitle: 'Instant-download rigged & animated .GLB models with zero account or attribution friction',
    icon: 'cc0',
    items: [
      {
        id: 'quaternius',
        name: 'Quaternius',
        url: 'https://quaternius.com',
        domainLabel: 'quaternius.com',
        badge: '100% Free CC0',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        description:
          'Hundreds of low-poly & stylized rigged + animated .GLB packs: knights, cyberpunk characters, zombies, mechs, dinosaurs, horses, wolves, dragons, and spaceships — every .glb comes with built-in Walk, Run, Attack, Hit, and Idle animation clips.',
      },
      {
        id: 'poly-pizza',
        name: 'Poly Pizza',
        url: 'https://poly.pizza',
        domainLabel: 'poly.pizza',
        badge: 'Free CC0 / CC-BY',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        description:
          'Thousands of lightweight .GLB characters, animals, vehicles, weapons, and props searchable by tag (filter by "Animated").',
      },
      {
        id: 'kenney',
        name: 'Kenney 3D Assets',
        url: 'https://kenney.nl/assets/category:3d',
        domainLabel: 'kenney.nl/assets/category:3d',
        badge: '100% Free CC0',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        description:
          'Clean, lightweight .GLB characters, cars, modular buildings, sci-fi kits, and props that load instantaneously.',
      },
      {
        id: 'khronos-sample-assets',
        name: 'Khronos Official glTF Sample Assets',
        url: 'https://github.com/KhronosGroup/glTF-Sample-Assets',
        domainLabel: 'github.com/KhronosGroup/glTF-Sample-Assets',
        badge: 'Official Standard',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        description:
          'The official benchmark .GLB library containing animated creatures (Fox.glb, CesiumMan.glb, BrainStem.glb), vehicles, and Draco/Meshopt compressed showcase models.',
      },
      {
        id: 'threejs-gltf-examples',
        name: 'Three.js Official GLTF Examples',
        url: 'https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf',
        domainLabel: 'github.com/mrdoob/three.js/.../models/gltf',
        badge: 'Open Source',
        badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        description:
          'Includes Soldier.glb, RobotExpressive.glb, Michelle.glb, Horse.glb, Flamingo.glb, Parrot.glb, LittlestTokyo.glb (Draco), and ferrari.glb (Draco).',
      },
    ],
  },
  {
    id: 'searchable-marketplaces',
    number: '2',
    title: 'Massive Searchable .GLB Marketplaces (Free & Pro Filterable by "Animated" + "Downloadable")',
    subtitle: 'Large 3D repositories with direct .GLB autoconversion and animation filtering',
    icon: 'marketplace',
    items: [
      {
        id: 'sketchfab',
        name: 'Sketchfab — Animated & Downloadable .GLB Hub',
        url: 'https://sketchfab.com/search?features= downloadable&type=models',
        domainLabel: 'sketchfab.com',
        badge: 'Free & Pro .GLB',
        badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
        description:
          'The largest 3D library on the web. When downloading any model, choose Autoconverted format (glTF) -> .glb — Sketchfab automatically packs the mesh, PBR textures, and skeletal animation clips into a single .glb file.',
      },
      {
        id: 'fab',
        name: 'Fab.com (Epic Games / Unreal / Quixel Merged Library)',
        url: 'https://www.fab.com',
        domainLabel: 'fab.com',
        badge: 'Epic / Quixel',
        badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        description:
          "Epic Games' unified 3D marketplace with thousands of free photorealistic and stylized animated .GLB characters, creatures, and environment props.",
      },
      {
        id: 'cgtrader',
        name: 'CGTrader — Free Animated .GLB Models',
        url: 'https://www.cgtrader.com/free-3d-models?file_types[]=117&animated=1',
        domainLabel: 'cgtrader.com',
        badge: 'Free Filterable',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        description:
          'Filter by Free + Animated + glTF/GLB for realistic vehicles, characters, and mechanical props.',
      },
    ],
  },
  {
    id: 'character-mocap',
    number: '3',
    title: 'Character & Motion Capture Specific Libraries',
    subtitle: 'Dedicated humanoid rigs, custom avatar builders, and 2,500+ mocap clips',
    icon: 'mocap',
    items: [
      {
        id: 'mixamo',
        name: 'Adobe Mixamo',
        url: 'https://www.mixamo.com',
        domainLabel: 'mixamo.com',
        badge: 'Free with Adobe ID',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        description:
          'Over 2,500+ motion-capture animations (combat, parkour, dance, locomotion, dialogue) and 100+ characters.',
        tip: 'Tip: If you download .FBX from Mixamo, you can convert it to .GLB in 1 click using gltf.report or Blender (File → Export → glTF 2.0 (.glb)).',
      },
      {
        id: 'avaturn',
        name: 'Ready Player Me / Avaturn',
        url: 'https://avaturn.me',
        domainLabel: 'avaturn.me',
        badge: 'Rigged Avatars',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        description:
          'Generates rigged humanoid .GLB avatars directly in the browser ready for skeletal animation.',
      },
    ],
  },
  {
    id: 'ai-glb-generators',
    number: '4',
    title: 'AI Text/Image-to-Animated-.GLB Generators',
    subtitle: 'Generate rigged & animated .GLB characters and props from a text prompt or reference photo',
    icon: 'ai',
    items: [
      {
        id: 'meshy',
        name: 'Meshy AI',
        url: 'https://www.meshy.ai',
        domainLabel: 'meshy.ai',
        badge: 'Text/Image → Animated .GLB',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        description:
          'Generates rigged & animated .GLB characters/creatures from text or a single image and exports directly as .glb with embedded walk/run/action clips.',
      },
      {
        id: 'tripo3d',
        name: 'Tripo3D',
        url: 'https://www.tripo3d.ai',
        domainLabel: 'tripo3d.ai',
        badge: 'Auto-Rigged .GLB',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        description: 'Image/Text to auto-rigged animated .GLB export.',
      },
      {
        id: 'hyper3d-rodin',
        name: 'Rodin / Hyper3D',
        url: 'https://hyper3d.ai',
        domainLabel: 'hyper3d.ai',
        badge: 'High-Detail PBR .GLB',
        badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        description: 'High-detail PBR .GLB generation from reference images.',
      },
    ],
  },
];

export const GLB_PRO_INSPECTOR_TOOL: GlbResourceEntry = {
  id: 'gltf-report',
  name: 'gltf.report (by Don McCurdy)',
  url: 'https://gltf.report',
  domainLabel: 'gltf.report',
  badge: 'Pro Inspector & Draco/Meshopt Compressor',
  badgeColor: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50',
  description:
    'Free drag-and-drop browser tool where you can drop any .glb file to preview what animation clips are embedded inside it, or compress it with Draco / Meshopt before attaching it in the studio.',
};

interface GlbResourcesDirectoryProps {
  compact?: boolean;
  defaultExpanded?: boolean;
}

export const GlbResourcesDirectory: React.FC<GlbResourcesDirectoryProps> = ({
  compact = false,
  defaultExpanded = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(defaultExpanded);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyUrl = (id: string, url: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard?.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const visibleCategories =
    activeCategoryFilter === 'all'
      ? GLB_RESOURCE_CATEGORIES
      : GLB_RESOURCE_CATEGORIES.filter((c) => c.id === activeCategoryFilter);

  const renderCategoryIcon = (icon: GlbResourceCategory['icon']) => {
    switch (icon) {
      case 'cc0':
        return <Box className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
      case 'marketplace':
        return <Globe className="h-3.5 w-3.5 text-sky-400 shrink-0" />;
      case 'mocap':
        return <UserCheck className="h-3.5 w-3.5 text-rose-400 shrink-0" />;
      case 'ai':
        return <Wand2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
      default:
        return <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0" />;
    }
  };

  return (
    <div
      className="rounded-xl border border-indigo-500/35 bg-gradient-to-br from-indigo-950/35 via-slate-900/70 to-black/70 overflow-hidden"
      id="glb-resources-directory"
    >
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shrink-0">
            <Globe className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white tracking-wide">
                3D &amp; Animated .GLB Resource Libraries (14 Curated Sites)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-mono font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-400/40">
                CC0 • Sketchfab • Mixamo • AI .GLB
              </span>
            </div>
            <div className="text-[10.5px] text-slate-400 truncate">
              Download rigged &amp; animated .GLB characters, vehicles, creatures &amp; props to attach in 1 click
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono text-indigo-300 font-semibold">
            {isOpen ? 'Hide Directory' : 'Browse 14 Sites'}
          </span>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-indigo-300" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-white/10 p-3.5 space-y-3.5 bg-black/30">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: '🌐 All Resources (14)' },
              { id: 'cc0-public-domain', label: '1. Free CC0 (No Login)' },
              { id: 'searchable-marketplaces', label: '2. .GLB Marketplaces' },
              { id: 'character-mocap', label: '3. Character & Mocap' },
              { id: 'ai-glb-generators', label: '4. AI .GLB Generators' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategoryFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[10.5px] font-semibold font-mono transition-all border cursor-pointer ${
                  activeCategoryFilter === tab.id
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                    : 'bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] border-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Categories & Resource Cards */}
          <div className={`space-y-3.5 ${compact ? 'max-h-[420px] overflow-y-auto pr-1' : ''}`}>
            {visibleCategories.map((cat) => (
              <div
                key={cat.id}
                className="rounded-xl border border-white/10 bg-[#0c101b]/90 p-3 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] pb-2">
                  <div className="flex items-center gap-2">
                    {renderCategoryIcon(cat.icon)}
                    <div>
                      <div className="text-[11.5px] font-bold text-white">
                        {cat.number}. {cat.title}
                      </div>
                      <div className="text-[10px] text-slate-400">{cat.subtitle}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {cat.items.map((item) => (
                    <div
                      key={item.id}
                      className="group rounded-lg border border-white/[0.08] hover:border-indigo-400/50 bg-[#111726]/80 hover:bg-[#151d30] p-2.5 flex flex-col justify-between gap-2 transition-all"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-1.5">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-white group-hover:text-indigo-300 transition-colors"
                          >
                            <span>{item.name}</span>
                            <ExternalLink className="h-3 w-3 text-indigo-400 shrink-0" />
                          </a>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border shrink-0 ${item.badgeColor}`}
                          >
                            {item.badge}
                          </span>
                        </div>

                        <p className="text-[10.5px] text-slate-300 leading-relaxed">
                          {item.description}
                        </p>

                        {item.tip && (
                          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[10px] text-amber-200">
                            {item.tip}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.05] font-mono text-[10px]">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-300 hover:text-indigo-200 hover:underline truncate"
                        >
                          {item.domainLabel}
                        </a>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleCopyUrl(item.id, item.url, e)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 cursor-pointer"
                            title={`Copy ${item.url}`}
                          >
                            {copiedId === item.id ? (
                              <>
                                <Check className="h-2.5 w-2.5 text-emerald-400" />
                                <span className="text-emerald-300">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-2.5 w-2.5" />
                                <span>Copy URL</span>
                              </>
                            )}
                          </button>

                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-400/40 font-semibold"
                          >
                            <span>Open</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Pro Tool Callout: gltf.report */}
            <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900/80 to-emerald-950/30 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Wrench className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-emerald-200">
                    💡 Pro Tool for Inspecting or Compressing Any .GLB Before Attaching:
                  </span>
                  <a
                    href={GLB_PRO_INSPECTOR_TOOL.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-white hover:text-emerald-300 underline"
                  >
                    <span>{GLB_PRO_INSPECTOR_TOOL.name}</span>
                    <ExternalLink className="h-3 w-3 text-emerald-400" />
                  </a>
                </div>
                <p className="text-[10.5px] text-slate-300 leading-relaxed">
                  {GLB_PRO_INSPECTOR_TOOL.description}
                </p>
              </div>

              <a
                href={GLB_PRO_INSPECTOR_TOOL.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono shrink-0 shadow-md shadow-emerald-600/25"
              >
                <span>Open gltf.report</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
