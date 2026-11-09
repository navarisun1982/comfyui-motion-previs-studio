import {
  CINEMATIC_ENVIRONMENT_PRESETS,
  EnvironmentCategory,
  EnvironmentSpec,
  EnvironmentTimeOfDay,
  EnvironmentWeather,
  GroundSurfaceType,
} from '../../types/environment';
import { Actor } from '../../types/shotspec';
import { Asset3DItem, CURATED_3D_ASSETS } from '../../stores/useAssetLibraryStore';
import { SculptSpec } from '../procedural3D/sculptSpec';
import {
  VisionAiSceneAnalysis,
  VisionAiSurroundingStructure,
} from '../kinematics/videoVisionAiAnalyzer';
import { decomposeMocapAndSceneHint } from '../kinematics/mocapHintDecomposer';

export interface ReconstructedSceneResult {
  environment: EnvironmentSpec;
  surroundingActors: Actor[];
  isIndoorBuilding: boolean;
  detectedSettingLabel: string;
  lightingSummary: string;
  dominantColors: {
    skyOrCeilingHex: string;
    wallOrMidgroundHex: string;
    floorHex: string;
    accentHex: string;
  };
}

export interface ReconstructSceneOptions {
  fileName?: string;
  sceneHintPrompt?: string;
  referenceFrameDataUrl?: string;
  framePixels?: { width: number; height: number; data: Uint8ClampedArray };
  humanTrajectoryBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  maxSurroundingObjects?: number;
  visionAiAnalysis?: VisionAiSceneAnalysis | null;
}

interface RgbSample {
  r: number;
  g: number;
  b: number;
  luminance: number;
  saturation: number;
  warmth: number;
  edgeDensity: number;
}

interface FrameZoneAnalysis {
  topZone: RgbSample;
  midLeftZone: RgbSample;
  midCenterBackZone: RgbSample;
  midRightZone: RgbSample;
  midCombinedZone: RgbSample;
  bottomZone: RgbSample;
  accentSample: RgbSample;
  verticalEdgeStrength: number;
  leftToRightBias: number; // < 0 means left brighter, > 0 means right brighter
  topToBottomBias: number; // > 0 means top brighter than bottom
}

interface SceneArchetypeConfig {
  key: string;
  presetId: string;
  settingLabel: string;
  name: string;
  nameAr: string;
  category: EnvironmentCategory;
  groundSurface: GroundSurfaceType;
  weather: EnvironmentWeather;
  timeOfDay: EnvironmentTimeOfDay;
  isIndoorBuilding: boolean;
  fogDensity: number;
  defaultColors: {
    skyOrCeilingHex: string;
    wallOrMidgroundHex: string;
    floorHex: string;
    accentHex: string;
  };
  architectureDescription: string;
  preferredAssetQueries: Array<{
    keywords: string[];
    fallbackRole: string;
    structureKind: 'building' | 'wall' | 'pillar' | 'tree' | 'vehicle' | 'table' | 'prop';
    actorKind: 'environment' | 'prop' | 'vehicle';
    scaleMultiplier: number;
  }>;
}

const SCENE_ARCHETYPES: SceneArchetypeConfig[] = [
  {
    key: 'scifi-hive-corridor',
    presetId: 'env-scifi-hangar',
    settingLabel: 'Sci-Fi Hangar / Underground Hive Structure',
    name: 'Reconstructed Sci-Fi Facility & Hangar',
    nameAr: 'Reconstructed Sci-Fi Facility & Hangar',
    category: 'scifi',
    groundSurface: 'metal-grate',
    weather: 'clear',
    timeOfDay: 'night',
    isIndoorBuilding: true,
    fogDensity: 0.02,
    defaultColors: {
      skyOrCeilingHex: '#07131e',
      wallOrMidgroundHex: '#102334',
      floorHex: '#141f2c',
      accentHex: '#06b6d4',
    },
    architectureDescription:
      'enclosed futuristic industrial facility with reinforced alloy bulkheads, metallic deck grating, overhead conduit ribs, and recessed cyan telemetry strips',
    preferredAssetQueries: [
      { keywords: ['airlock', 'cabin', 'capsule'], fallbackRole: 'Airlock Bulkhead Unit', structureKind: 'wall', actorKind: 'environment', scaleMultiplier: 1.35 },
      { keywords: ['reactor', 'battery', 'console'], fallbackRole: 'Reactor Telemetry Core', structureKind: 'pillar', actorKind: 'prop', scaleMultiplier: 1.25 },
      { keywords: ['field console', 'arcade console', 'holo'], fallbackRole: 'Command Terminal Console', structureKind: 'table', actorKind: 'prop', scaleMultiplier: 1.15 },
      { keywords: ['survey drone', 'service drone', 'starfighter'], fallbackRole: 'Autonomous Recon Unit', structureKind: 'vehicle', actorKind: 'vehicle', scaleMultiplier: 1.2 },
    ],
  },
  {
    key: 'laboratory-facility',
    presetId: 'env-scifi-hangar',
    settingLabel: 'High-Tech Research Laboratory Building',
    name: 'Reconstructed Research Laboratory',
    nameAr: 'Reconstructed Research Laboratory',
    category: 'interior',
    groundSurface: 'concrete-floor',
    weather: 'clear',
    timeOfDay: 'night',
    isIndoorBuilding: true,
    fogDensity: 0.012,
    defaultColors: {
      skyOrCeilingHex: '#0f1722',
      wallOrMidgroundHex: '#1e293b',
      floorHex: '#161e29',
      accentHex: '#38bdf8',
    },
    architectureDescription:
      'clean containment research laboratory interior with sealed glass partitions, polished concrete floor, overhead fluorescent light banks, and analytical workstations',
    preferredAssetQueries: [
      { keywords: ['biosafety cabinet', 'chemical storage'], fallbackRole: 'Biosafety Containment Cabinet', structureKind: 'wall', actorKind: 'prop', scaleMultiplier: 1.25 },
      { keywords: ['air shower', 'airlock'], fallbackRole: 'Decontamination Airlock Chamber', structureKind: 'building', actorKind: 'environment', scaleMultiplier: 1.3 },
      { keywords: ['island bench', 'mobile bench', 'centrifuge'], fallbackRole: 'Laboratory Workstation Bench', structureKind: 'table', actorKind: 'prop', scaleMultiplier: 1.15 },
      { keywords: ['gas cylinder', 'battery bank'], fallbackRole: 'Pressurized Utility Rack', structureKind: 'pillar', actorKind: 'prop', scaleMultiplier: 1.15 },
    ],
  },
  {
    key: 'cyberpunk-urban-alley',
    presetId: 'env-cyberpunk-alley',
    settingLabel: 'Urban Street & Surrounding Building Facades',
    name: 'Reconstructed Urban Street & Buildings',
    nameAr: 'Reconstructed Urban Street & Buildings',
    category: 'urban',
    groundSurface: 'asphalt-wet',
    weather: 'clear',
    timeOfDay: 'neon-night',
    isIndoorBuilding: false,
    fogDensity: 0.022,
    defaultColors: {
      skyOrCeilingHex: '#0b0716',
      wallOrMidgroundHex: '#1d122b',
      floorHex: '#0e1017',
      accentHex: '#ec4899',
    },
    architectureDescription:
      'urban street flanked by multi-storey brick and concrete building facades, recessed windows, storefront signage, utility poles, and asphalt pavement',
    preferredAssetQueries: [
      { keywords: ['corner shop', 'shop row', 'office tower'], fallbackRole: 'Left Multi-Storey Building Facade', structureKind: 'building', actorKind: 'environment', scaleMultiplier: 1.8 },
      { keywords: ['office tower', 'classical bank', 'hotel'], fallbackRole: 'Right Perimeter Apartment Building', structureKind: 'building', actorKind: 'environment', scaleMultiplier: 1.75 },
      { keywords: ['motel neon sign', 'holo billboard', 'pay phone booth'], fallbackRole: 'Background Street Facade & Sign', structureKind: 'wall', actorKind: 'environment', scaleMultiplier: 1.5 },
      { keywords: ['boxy-sedan', 'city taxi', 'police cruiser', 'pickup truck'], fallbackRole: 'Parked Street Vehicle', structureKind: 'vehicle', actorKind: 'vehicle', scaleMultiplier: 1.35 },
    ],
  },
  {
    key: 'industrial-warehouse',
    presetId: 'env-post-apocalyptic',
    settingLabel: 'Industrial Warehouse / Concrete Structure',
    name: 'Reconstructed Industrial Warehouse',
    nameAr: 'Reconstructed Industrial Warehouse',
    category: 'interior',
    groundSurface: 'concrete-floor',
    weather: 'overcast',
    timeOfDay: 'day',
    isIndoorBuilding: true,
    fogDensity: 0.018,
    defaultColors: {
      skyOrCeilingHex: '#1a1d22',
      wallOrMidgroundHex: '#2a2e35',
      floorHex: '#23262b',
      accentHex: '#f59e0b',
    },
    architectureDescription:
      'expansive industrial warehouse structure with weathered concrete pillars, structural walls, steel roof trusses, roll-up loading bays, and heavy utility equipment',
    preferredAssetQueries: [
      { keywords: ['auto repair garage', 'fire station', 'water pump house'], fallbackRole: 'Warehouse Concrete Bay Structure', structureKind: 'building', actorKind: 'environment', scaleMultiplier: 1.75 },
      { keywords: ['groomer fuel drum', 'chicha barrel', 'gas cylinder'], fallbackRole: 'Structural Support Pillar & Drums', structureKind: 'pillar', actorKind: 'prop', scaleMultiplier: 1.3 },
      { keywords: ['luggage trolley', 'shopping trolley', 'mobile bench'], fallbackRole: 'Heavy Cargo Bay Unit', structureKind: 'wall', actorKind: 'prop', scaleMultiplier: 1.2 },
      { keywords: ['articulated dump truck', 'tow truck', 'covered goods van'], fallbackRole: 'Service Utility Vehicle', structureKind: 'vehicle', actorKind: 'vehicle', scaleMultiplier: 1.35 },
    ],
  },
  {
    key: 'modern-interior-room',
    presetId: 'env-modern-penthouse',
    settingLabel: 'Architectural Room / Modern Interior Building',
    name: 'Reconstructed Architectural Interior',
    nameAr: 'Reconstructed Architectural Interior',
    category: 'interior',
    groundSurface: 'wood-parquet',
    weather: 'clear',
    timeOfDay: 'night',
    isIndoorBuilding: true,
    fogDensity: 0.01,
    defaultColors: {
      skyOrCeilingHex: '#11151d',
      wallOrMidgroundHex: '#242933',
      floorHex: '#2b2118',
      accentHex: '#e2e8f0',
    },
    architectureDescription:
      'architectural interior room with structured perimeter walls, tall window frames, polished flooring, recessed ceiling coves, and interior furnishings framing the stage',
    preferredAssetQueries: [
      { keywords: ['office tower', 'classical bank'], fallbackRole: 'Left Interior Wall & Window Partition', structureKind: 'wall', actorKind: 'environment', scaleMultiplier: 1.65 },
      { keywords: ['grand front desk', 'island bench', 'baccarat table'], fallbackRole: 'Architectural Console Desk', structureKind: 'table', actorKind: 'prop', scaleMultiplier: 1.2 },
      { keywords: ['table game chair', 'counter stool', 'piano bench'], fallbackRole: 'Right Perimeter Wall & Pillar', structureKind: 'pillar', actorKind: 'environment', scaleMultiplier: 1.45 },
      { keywords: ['gilded urn palm', 'lobby tiered fountain'], fallbackRole: 'Interior Architectural Planter', structureKind: 'prop', actorKind: 'prop', scaleMultiplier: 1.25 },
    ],
  },
  {
    key: 'rustic-chamber',
    presetId: 'env-rustic-hearth',
    settingLabel: 'Rustic Timber & Stone Interior Building',
    name: 'Reconstructed Rustic Chamber',
    nameAr: 'Reconstructed Rustic Chamber',
    category: 'interior',
    groundSurface: 'wood-parquet',
    weather: 'clear',
    timeOfDay: 'twilight',
    isIndoorBuilding: true,
    fogDensity: 0.022,
    defaultColors: {
      skyOrCeilingHex: '#1c120b',
      wallOrMidgroundHex: '#332014',
      floorHex: '#3b2314',
      accentHex: '#f97316',
    },
    architectureDescription:
      'warm rustic timber-and-brick interior chamber with rough-hewn beams, hearthside amber bounce light, and wooden furnishings along the walls',
    preferredAssetQueries: [
      { keywords: ['porch log cabin', 'alpine hay barn', 'adobe colonial'], fallbackRole: 'Timber Framing Wall Structure', structureKind: 'building', actorKind: 'environment', scaleMultiplier: 1.65 },
      { keywords: ['camp kitchen table', 'station bench'], fallbackRole: 'Rustic Wooden Table', structureKind: 'table', actorKind: 'prop', scaleMultiplier: 1.15 },
      { keywords: ['chicha barrel', 'barrel organ'], fallbackRole: 'Oak Storage Cask', structureKind: 'pillar', actorKind: 'prop', scaleMultiplier: 1.15 },
      { keywords: ['reed fire torch', 'camping lantern'], fallbackRole: 'Warm Hearth Pillar', structureKind: 'pillar', actorKind: 'prop', scaleMultiplier: 1.15 },
    ],
  },
  {
    key: 'historical-courtyard-temple',
    presetId: 'env-medieval-courtyard',
    settingLabel: 'Ancient Stone Courtyard & Monumental Buildings',
    name: 'Reconstructed Stone Temple & Courtyard',
    nameAr: 'Reconstructed Stone Temple & Courtyard',
    category: 'historical',
    groundSurface: 'stone-cobblestone',
    weather: 'fog',
    timeOfDay: 'twilight',
    isIndoorBuilding: false,
    fogDensity: 0.022,
    defaultColors: {
      skyOrCeilingHex: '#151821',
      wallOrMidgroundHex: '#2e2c28',
      floorHex: '#282622',
      accentHex: '#f59e0b',
    },
    architectureDescription:
      'monumental carved stone courtyard and temple precinct with weathered granite walls, cobblestone paving, colonnade pillars, and stone gatehouses',
    preferredAssetQueries: [
      { keywords: ['castle gatehouse', 'parish church', 'brick church'], fallbackRole: 'Monumental Stone Gatehouse Building', structureKind: 'building', actorKind: 'environment', scaleMultiplier: 1.85 },
      { keywords: ['corner yagura turret', 'water tower'], fallbackRole: 'Fortified Stone Watchtower Wing', structureKind: 'building', actorKind: 'environment', scaleMultiplier: 1.7 },
      { keywords: ['guardian lion statue', 'lobby tiered fountain'], fallbackRole: 'Carved Stone Colonnade Pillar', structureKind: 'pillar', actorKind: 'prop', scaleMultiplier: 1.35 },
      { keywords: ['reed fire torch', 'cemetery lantern post'], fallbackRole: 'Courtyard Perimeter Wall', structureKind: 'wall', actorKind: 'environment', scaleMultiplier: 1.45 },
    ],
  },
  {
    key: 'nature-forest-clearing',
    presetId: 'env-misty-forest',
    settingLabel: 'Natural Forest Clearing & Woodland Structures',
    name: 'Reconstructed Forest Environment',
    nameAr: 'Reconstructed Forest Environment',
    category: 'nature',
    groundSurface: 'grass-terrain',
    weather: 'fog',
    timeOfDay: 'dawn',
    isIndoorBuilding: false,
    fogDensity: 0.03,
    defaultColors: {
      skyOrCeilingHex: '#0c1912',
      wallOrMidgroundHex: '#183022',
      floorHex: '#1b2c1d',
      accentHex: '#10b981',
    },
    architectureDescription:
      'atmospheric woodland clearing framed by towering tree trunks, fern-covered boulders, mossy ground cover, and diffused shafts of canopy light',
    preferredAssetQueries: [
      { keywords: ['cherry tree', 'ginkgo tree', 'toromiro tree'], fallbackRole: 'Left Canopy Perimeter Tree', structureKind: 'tree', actorKind: 'environment', scaleMultiplier: 1.65 },
      { keywords: ['log cabin', 'porch log cabin'], fallbackRole: 'Woodland Outpost Building', structureKind: 'building', actorKind: 'environment', scaleMultiplier: 1.65 },
      { keywords: ['fern-covered boulder', 'rock armour', 'lava rock'], fallbackRole: 'Right Canopy Tree & Boulder', structureKind: 'tree', actorKind: 'environment', scaleMultiplier: 1.5 },
      { keywords: ['fern clump', 'azalea bush', 'moss-covered stump'], fallbackRole: 'Forest Undergrowth Cluster', structureKind: 'prop', actorKind: 'prop', scaleMultiplier: 1.25 },
    ],
  },
  {
    key: 'coastal-beach-shoreline',
    presetId: 'env-desert-dunes',
    settingLabel: 'Coastal Sandy Beach & Ocean Shoreline',
    name: 'Reconstructed Coastal Beach & Ocean Set',
    nameAr: 'Reconstructed Coastal Beach & Ocean Set',
    category: 'coastal-beach',
    groundSurface: 'sand-dunes',
    weather: 'clear',
    timeOfDay: 'day',
    isIndoorBuilding: false,
    fogDensity: 0.012,
    defaultColors: {
      skyOrCeilingHex: '#0ea5e9',
      wallOrMidgroundHex: '#0284c7',
      floorHex: '#d6b37c',
      accentHex: '#38bdf8',
    },
    architectureDescription:
      'open sandy beach shoreline with turquoise ocean water horizon, gentle surf waves, coastal rock outcrops, and beachfront sun deck',
    preferredAssetQueries: [
      { keywords: ['rock armour revetment', 'lava rock'], fallbackRole: 'Coastal Shoreline Rock Outcrop', structureKind: 'prop', actorKind: 'environment', scaleMultiplier: 1.35 },
      { keywords: ['lava rock pile'], fallbackRole: 'Sea Stack Boulder Cluster', structureKind: 'prop', actorKind: 'environment', scaleMultiplier: 1.25 },
    ],
  },
  {
    key: 'desert-canyon-dunes',
    presetId: 'env-desert-dunes',
    settingLabel: 'Arid Desert Dunes & Sandstone Buildings',
    name: 'Reconstructed Desert & Canyon Set',
    nameAr: 'Reconstructed Desert & Canyon Set',
    category: 'nature',
    groundSurface: 'sand-dunes',
    weather: 'clear',
    timeOfDay: 'golden-hour',
    isIndoorBuilding: false,
    fogDensity: 0.016,
    defaultColors: {
      skyOrCeilingHex: '#3a220d',
      wallOrMidgroundHex: '#8a5a2b',
      floorHex: '#b47b36',
      accentHex: '#fbbf24',
    },
    architectureDescription:
      'sun-baked desert expanse with sandstone buildings, weathered canyon walls, arid scrub, and warm golden-hour rim light',
    preferredAssetQueries: [
      { keywords: ['adobe colonial farmhouse', 'orongo house'], fallbackRole: 'Sandstone Outpost Building', structureKind: 'building', actorKind: 'environment', scaleMultiplier: 1.75 },
      { keywords: ['lava rock pile', 'rock armour revetment'], fallbackRole: 'Weathered Canyon Cliff Wall', structureKind: 'wall', actorKind: 'environment', scaleMultiplier: 1.55 },
      { keywords: ['joshua tree', 'creosote bush', 'scorched tree'], fallbackRole: 'Arid Desert Flora', structureKind: 'tree', actorKind: 'environment', scaleMultiplier: 1.4 },
      { keywords: ['pickup truck', 'boxy-sedan'], fallbackRole: 'Expedition Utility Vehicle', structureKind: 'vehicle', actorKind: 'vehicle', scaleMultiplier: 1.35 },
    ],
  },
  {
    key: 'soundstage-studio',
    presetId: 'env-studio-stage',
    settingLabel: 'Controlled Soundstage / Production Set',
    name: 'Reconstructed Soundstage Set',
    nameAr: 'Reconstructed Soundstage Set',
    category: 'studio',
    groundSurface: 'studio-floor',
    weather: 'clear',
    timeOfDay: 'night',
    isIndoorBuilding: true,
    fogDensity: 0.011,
    defaultColors: {
      skyOrCeilingHex: '#090c14',
      wallOrMidgroundHex: '#151c2c',
      floorHex: '#111623',
      accentHex: '#60a5fa',
    },
    architectureDescription:
      'controlled production soundstage with acoustic perimeter walls, matte cyclorama floor, overhead lighting trusses, and rigged architectural flats',
    preferredAssetQueries: [
      { keywords: ['one-storey shop row', 'office tower'], fallbackRole: 'Soundstage Architectural Building Flat', structureKind: 'building', actorKind: 'environment', scaleMultiplier: 1.65 },
      { keywords: ['camera gizmo', 'antenna mast'], fallbackRole: 'Stage Lighting & Truss Tower', structureKind: 'pillar', actorKind: 'prop', scaleMultiplier: 1.3 },
      { keywords: ['island bench', 'grand front desk'], fallbackRole: 'Stage Blocking Wall Unit', structureKind: 'wall', actorKind: 'prop', scaleMultiplier: 1.25 },
      { keywords: ['field console', 'desk keyboard'], fallbackRole: 'Director Production Console', structureKind: 'table', actorKind: 'prop', scaleMultiplier: 1.15 },
    ],
  },
];

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(r: number, g: number, b: number): string {
  const hr = clampByte(r).toString(16).padStart(2, '0');
  const hg = clampByte(g).toString(16).padStart(2, '0');
  const hb = clampByte(b).toString(16).padStart(2, '0');
  return `#${hr}${hg}${hb}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) {
    return { r: 24, g: 32, b: 48 };
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) {
    return { r: 24, g: 32, b: 48 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function blendHexColors(baseHex: string, targetHex: string, weightTarget: number): string {
  const w = Math.max(0, Math.min(1, weightTarget));
  const a = hexToRgb(baseHex);
  const b = hexToRgb(targetHex);
  return rgbToHex(
    a.r * (1 - w) + b.r * w,
    a.g * (1 - w) + b.g * w,
    a.b * (1 - w) + b.b * w
  );
}

function computeDeterministicHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sampleRegion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0Frac: number,
  x1Frac: number,
  y0Frac: number,
  y1Frac: number
): RgbSample {
  const x0 = Math.max(0, Math.floor(width * x0Frac));
  const x1 = Math.min(width, Math.ceil(width * x1Frac));
  const y0 = Math.max(0, Math.floor(height * y0Frac));
  const y1 = Math.min(height, Math.ceil(height * y1Frac));

  const stepX = Math.max(1, Math.floor((x1 - x0) / 24));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 24));

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let satSum = 0;
  let edgeSum = 0;
  let count = 0;

  for (let y = y0; y < y1; y += stepY) {
    for (let x = x0; x < x1; x += stepX) {
      const idx = (y * width + x) * 4;
      if (idx + 2 >= data.length) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      rSum += r;
      gSum += g;
      bSum += b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      satSum += maxC > 0 ? (maxC - minC) / maxC : 0;

      if (x + 1 < width) {
        const nextIdx = (y * width + (x + 1)) * 4;
        if (nextIdx + 2 < data.length) {
          edgeSum +=
            (Math.abs(r - data[nextIdx]) +
              Math.abs(g - data[nextIdx + 1]) +
              Math.abs(b - data[nextIdx + 2])) /
            (255 * 3);
        }
      }
      count++;
    }
  }

  if (count === 0) {
    return { r: 24, g: 30, b: 42, luminance: 29, saturation: 0.15, warmth: -18, edgeDensity: 0.1 };
  }

  const r = rSum / count;
  const g = gSum / count;
  const b = bSum / count;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const saturation = satSum / count;
  const warmth = r - b;
  const edgeDensity = Math.min(1, (edgeSum / count) * 6.5);

  return { r, g, b, luminance, saturation, warmth, edgeDensity };
}

function analyzeFramePixels(framePixels: {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}): FrameZoneAnalysis | null {
  const { width, height, data } = framePixels;
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return null;
  }

  const topZone = sampleRegion(data, width, height, 0.08, 0.92, 0.0, 0.24);
  const midLeftZone = sampleRegion(data, width, height, 0.0, 0.28, 0.22, 0.74);
  const midCenterBackZone = sampleRegion(data, width, height, 0.28, 0.72, 0.16, 0.48);
  const midRightZone = sampleRegion(data, width, height, 0.72, 1.0, 0.22, 0.74);
  const bottomZone = sampleRegion(data, width, height, 0.12, 0.88, 0.74, 1.0);

  const midCombinedZone: RgbSample = {
    r: (midLeftZone.r + midRightZone.r + midCenterBackZone.r) / 3,
    g: (midLeftZone.g + midRightZone.g + midCenterBackZone.g) / 3,
    b: (midLeftZone.b + midRightZone.b + midCenterBackZone.b) / 3,
    luminance: (midLeftZone.luminance + midRightZone.luminance + midCenterBackZone.luminance) / 3,
    saturation: (midLeftZone.saturation + midRightZone.saturation + midCenterBackZone.saturation) / 3,
    warmth: (midLeftZone.warmth + midRightZone.warmth + midCenterBackZone.warmth) / 3,
    edgeDensity: (midLeftZone.edgeDensity + midRightZone.edgeDensity + midCenterBackZone.edgeDensity) / 3,
  };

  let bestAccent: RgbSample = midCombinedZone;
  let bestAccentScore = -1;
  const stepX = Math.max(1, Math.floor(width / 20));
  const stepY = Math.max(1, Math.floor(height / 20));

  let verticalGradSum = 0;
  let gradSamples = 0;

  for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.85); y += stepY) {
    for (let x = Math.floor(width * 0.05); x < Math.floor(width * 0.95); x += stepX) {
      const idx = (y * width + x) * 4;
      if (idx + 2 >= data.length) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const score = sat * 180 + (lum > 35 && lum < 235 ? 45 : 0);

      if (score > bestAccentScore) {
        bestAccentScore = score;
        bestAccent = { r, g, b, luminance: lum, saturation: sat, warmth: r - b, edgeDensity: 0.2 };
      }

      if (x + 1 < width && x > 0) {
        const leftIdx = (y * width + (x - 1)) * 4;
        const rightIdx = (y * width + (x + 1)) * 4;
        if (rightIdx + 2 < data.length) {
          const lumL = 0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2];
          const lumR = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
          verticalGradSum += Math.abs(lumR - lumL);
          gradSamples++;
        }
      }
    }
  }

  const verticalEdgeStrength = gradSamples > 0 ? Math.min(1, verticalGradSum / (gradSamples * 38)) : 0.35;
  const leftToRightBias = (midRightZone.luminance - midLeftZone.luminance) / 255;
  const topToBottomBias = (topZone.luminance - bottomZone.luminance) / 255;

  return {
    topZone,
    midLeftZone,
    midCenterBackZone,
    midRightZone,
    midCombinedZone,
    bottomZone,
    accentSample: bestAccent,
    verticalEdgeStrength,
    leftToRightBias,
    topToBottomBias,
  };
}

function selectArchetype(
  normalizedText: string,
  zoneAnalysis: FrameZoneAnalysis | null,
  explicitArchetypeKey?: string
): SceneArchetypeConfig {
  if (explicitArchetypeKey) {
    const explicitMatch = SCENE_ARCHETYPES.find((a) => a.key === explicitArchetypeKey);
    if (explicitMatch) return explicitMatch;
  }

  // 1. Explicit keyword matching on filename + sceneHintPrompt
  if (/(beach|coast|shore|shoreline|ocean|sea|seaside|bay|island|شاطئ|شاطي|بحر|ساحل|محيط|امواج)/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'coastal-beach-shoreline')!;
  }
  if (/\b(lab|laboratory|research|clinic|biosafety|cleanroom|medical|hospital)\b/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'laboratory-facility')!;
  }
  if (/\b(hangar|hive|corridor|scifi|sci-fi|starship|spaceship|airlock|bunker|reactor|orbital|cyber)\b/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'scifi-hive-corridor')!;
  }
  if (/\b(alley|cyberpunk|neon|street|downtown|city|road|intersection|avenue|urban|building|buildings|plaza|sidewalk)\b/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'cyberpunk-urban-alley')!;
  }
  if (/\b(warehouse|factory|industrial|garage|depot|ruins|apocalyptic|storage)\b/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'industrial-warehouse')!;
  }
  if (/\b(temple|castle|courtyard|medieval|fortress|dungeon|cathedral|church|palace|ancient)\b/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'historical-courtyard-temple')!;
  }
  if (/\b(hearth|cabin|tavern|fireplace|rustic|lodge|barn)\b/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'rustic-chamber')!;
  }
  if (/\b(penthouse|office|room|apartment|lobby|hall|hallway|interior|house|home|classroom|library|kitchen|cafe)\b/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'modern-interior-room')!;
  }
  if (/\b(forest|woods|jungle|redwood|trees|park|garden|swamp|grove)\b/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'nature-forest-clearing')!;
  }
  if (/\b(desert|dunes|sand|canyon|arid|wasteland|sahara|mesa)\b/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'desert-canyon-dunes')!;
  }
  if (/\b(studio|soundstage|cyclorama|stage)\b/.test(normalizedText)) {
    return SCENE_ARCHETYPES.find((a) => a.key === 'soundstage-studio')!;
  }

  // 2. Pixel-driven classification when no explicit scene keyword matched in filename
  if (zoneAnalysis) {
    const { topZone, midCombinedZone, bottomZone, accentSample, verticalEdgeStrength } = zoneAnalysis;

    // Blue/cyan water or sky + bright warm sandy bottom (with low architectural vertical edges) -> coastal beach shoreline
    if (
      ((topZone.b > topZone.r * 1.32 && topZone.luminance > 110) ||
        (midCombinedZone.b > midCombinedZone.r * 1.25 && midCombinedZone.luminance > 100)) &&
      bottomZone.warmth > 22 &&
      bottomZone.luminance > 120 &&
      verticalEdgeStrength < 0.28
    ) {
      return SCENE_ARCHETYPES.find((a) => a.key === 'coastal-beach-shoreline')!;
    }

    // Strong green dominance in mid/bottom (and NOT blue/cyan water) -> forest nature
    if (
      midCombinedZone.g > midCombinedZone.r * 1.22 &&
      midCombinedZone.g > midCombinedZone.b * 1.25 &&
      bottomZone.g > bottomZone.r * 1.1
    ) {
      return SCENE_ARCHETYPES.find((a) => a.key === 'nature-forest-clearing')!;
    }

    // High warmth + bright sandy bottom -> desert
    if (bottomZone.warmth > 45 && bottomZone.luminance > 110 && topZone.luminance > 100) {
      return SCENE_ARCHETYPES.find((a) => a.key === 'desert-canyon-dunes')!;
    }

    // Outdoor sky (top significantly brighter than floor or cool blue sky) with architectural sides -> urban street & buildings
    if (
      (topZone.luminance > bottomZone.luminance * 1.22 && topZone.luminance > 95) ||
      (topZone.b > topZone.r * 1.18 && topZone.luminance > 80)
    ) {
      return SCENE_ARCHETYPES.find((a) => a.key === 'cyberpunk-urban-alley')!;
    }

    // High neon saturation in dark scene -> cyberpunk urban alley or scifi hangar
    if (accentSample.saturation > 0.58 && topZone.luminance < 75) {
      if (accentSample.b > accentSample.r * 1.25 && verticalEdgeStrength > 0.3) {
        return SCENE_ARCHETYPES.find((a) => a.key === 'scifi-hive-corridor')!;
      }
      return SCENE_ARCHETYPES.find((a) => a.key === 'cyberpunk-urban-alley')!;
    }

    // Warm indoor wood/hearth tone
    if (midCombinedZone.warmth > 28 && bottomZone.warmth > 25 && topZone.luminance < 115) {
      return SCENE_ARCHETYPES.find((a) => a.key === 'rustic-chamber')!;
    }

    // High architectural edge density or darker ceiling -> industrial warehouse or modern interior room
    if (verticalEdgeStrength > 0.38 || topZone.luminance < midCombinedZone.luminance * 1.05) {
      if (midCombinedZone.saturation < 0.16) {
        return SCENE_ARCHETYPES.find((a) => a.key === 'industrial-warehouse')!;
      }
      return SCENE_ARCHETYPES.find((a) => a.key === 'modern-interior-room')!;
    }
  }

  return SCENE_ARCHETYPES.find((a) => a.key === 'modern-interior-room')!;
}

function inferLightingMood(
  zoneAnalysis: FrameZoneAnalysis | null,
  archetype: SceneArchetypeConfig
): {
  lightingSummary: string;
  timeOfDay: EnvironmentTimeOfDay;
  weather: EnvironmentWeather;
} {
  if (!zoneAnalysis) {
    const directionHint = archetype.isIndoorBuilding
      ? 'overhead architectural softbox key with balanced perimeter wall bounce'
      : 'directional key light with atmospheric horizon fill';
    return {
      lightingSummary: `${directionHint} (${archetype.timeOfDay} palette, ${archetype.defaultColors.accentHex} accent tint)`,
      timeOfDay: archetype.timeOfDay,
      weather: archetype.weather,
    };
  }

  const { topZone, midCombinedZone, bottomZone, leftToRightBias, topToBottomBias, accentSample } = zoneAnalysis;
  const avgLum = (topZone.luminance + midCombinedZone.luminance + bottomZone.luminance) / 3;

  let horizontalKey = 'balanced frontal fill';
  if (leftToRightBias < -0.08) {
    horizontalKey = 'strong stage-left key light casting rightward shadow falloff';
  } else if (leftToRightBias > 0.08) {
    horizontalKey = 'strong stage-right key light casting leftward shadow falloff';
  }

  let verticalKey = 'eye-level motivated fill';
  if (topToBottomBias > 0.14) {
    verticalKey = 'overhead top-down skylight / ceiling fixture dominance';
  } else if (topToBottomBias < -0.1) {
    verticalKey = 'low-angle floor bounce / practical uplighting';
  }

  let colorTempLabel = 'neutral cinematic white balance';
  if (midCombinedZone.warmth > 24) {
    colorTempLabel = 'warm tungsten / golden amber color temperature';
  } else if (midCombinedZone.warmth < -20) {
    colorTempLabel = 'cool cyan / moonlight steel color temperature';
  } else if (accentSample.saturation > 0.55) {
    colorTempLabel = 'high-saturation neon dichromatic accent lighting';
  }

  let timeOfDay: EnvironmentTimeOfDay = archetype.timeOfDay;
  if (avgLum > 145) {
    timeOfDay = midCombinedZone.warmth > 28 ? 'golden-hour' : 'day';
  } else if (avgLum < 65) {
    timeOfDay = accentSample.saturation > 0.52 ? 'neon-night' : 'night';
  } else if (midCombinedZone.warmth > 30) {
    timeOfDay = 'golden-hour';
  } else if (midCombinedZone.warmth < -18) {
    timeOfDay = 'twilight';
  }

  return {
    lightingSummary: `${horizontalKey}, ${verticalKey}, ${colorTempLabel} (avg luminance ${Math.round(avgLum)}/255)`,
    timeOfDay,
    weather: archetype.weather,
  };
}

/**
 * Synthesizes a multi-part 3D Procedural `SculptSpec` for an architectural building, wall,
 * column/pillar, tree, vehicle, or furniture piece using the exact hex colors sampled from
 * the video frame so the 3D Stage displays realistic architectural geometry matching the video!
 */
export function buildProceduralSceneStructureSculpt(
  kind: 'building' | 'wall' | 'pillar' | 'tree' | 'vehicle' | 'table' | 'chair' | 'prop',
  name: string,
  primaryHex: string,
  accentHex: string,
  roofOrTrimHex: string
): SculptSpec {
  const cleanPrimary = /^#[0-9a-fA-F]{6}$/.test(primaryHex) ? primaryHex : '#475569';
  const cleanAccent = /^#[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : '#38bdf8';
  const cleanTrim = /^#[0-9a-fA-F]{6}$/.test(roofOrTrimHex) ? roofOrTrimHex : '#1e293b';

  if (kind === 'building') {
    return {
      version: 2,
      name,
      route: 'author',
      rig: 'none',
      heightMeters: 4.2,
      identity: `Reconstructed multi-storey architectural building facade (${name})`,
      materials: [
        { id: 'facade', color: cleanPrimary, roughness: 0.78, metalness: 0.12 },
        { id: 'trim', color: cleanTrim, roughness: 0.65, metalness: 0.22 },
        { id: 'windows', color: cleanAccent, roughness: 0.2, metalness: 0.6, emissive: true },
      ],
      parts: [
        { id: 'main_tower', shape: 'box', size: [2.4, 3.8, 1.6], position: [0, 1.9, 0], rotation: [0, 0, 0], material: 'facade' },
        { id: 'base_plinth', shape: 'box', size: [2.56, 0.35, 1.74], position: [0, 0.175, 0], rotation: [0, 0, 0], material: 'trim' },
        { id: 'roof_cornice', shape: 'box', size: [2.58, 0.24, 1.76], position: [0, 3.88, 0], rotation: [0, 0, 0], material: 'trim' },
        { id: 'win_row_1_l', shape: 'box', size: [0.45, 0.55, 0.08], position: [-0.6, 1.2, 0.81], rotation: [0, 0, 0], material: 'windows', mirrorX: true },
        { id: 'win_row_2_l', shape: 'box', size: [0.45, 0.55, 0.08], position: [-0.6, 2.2, 0.81], rotation: [0, 0, 0], material: 'windows', mirrorX: true },
        { id: 'win_row_3_l', shape: 'box', size: [0.45, 0.55, 0.08], position: [-0.6, 3.15, 0.81], rotation: [0, 0, 0], material: 'windows', mirrorX: true },
        { id: 'entrance_portal', shape: 'box', size: [0.65, 0.85, 0.12], position: [0, 0.45, 0.82], rotation: [0, 0, 0], material: 'trim' },
      ],
    };
  }

  if (kind === 'wall') {
    return {
      version: 2,
      name,
      route: 'author',
      rig: 'none',
      heightMeters: 2.8,
      identity: `Reconstructed architectural wall & window partition (${name})`,
      materials: [
        { id: 'wall_mat', color: cleanPrimary, roughness: 0.75, metalness: 0.1 },
        { id: 'frame_mat', color: cleanTrim, roughness: 0.55, metalness: 0.25 },
        { id: 'glass_mat', color: cleanAccent, roughness: 0.18, metalness: 0.5, emissive: true },
      ],
      parts: [
        { id: 'wall_slab', shape: 'box', size: [3.2, 2.6, 0.32], position: [0, 1.3, 0], rotation: [0, 0, 0], material: 'wall_mat' },
        { id: 'top_beam', shape: 'box', size: [3.3, 0.2, 0.42], position: [0, 2.65, 0], rotation: [0, 0, 0], material: 'frame_mat' },
        { id: 'skirt_base', shape: 'box', size: [3.3, 0.22, 0.38], position: [0, 0.11, 0], rotation: [0, 0, 0], material: 'frame_mat' },
        { id: 'pilaster_l', shape: 'box', size: [0.28, 2.6, 0.42], position: [-1.42, 1.3, 0], rotation: [0, 0, 0], material: 'frame_mat', mirrorX: true },
        { id: 'panel_window', shape: 'box', size: [1.5, 1.2, 0.36], position: [0, 1.55, 0], rotation: [0, 0, 0], material: 'glass_mat' },
      ],
    };
  }

  if (kind === 'pillar') {
    return {
      version: 2,
      name,
      route: 'author',
      rig: 'none',
      heightMeters: 3.1,
      identity: `Reconstructed architectural structural column (${name})`,
      materials: [
        { id: 'stone', color: cleanPrimary, roughness: 0.7, metalness: 0.15 },
        { id: 'cap', color: cleanTrim, roughness: 0.6, metalness: 0.25 },
        { id: 'light_strip', color: cleanAccent, roughness: 0.25, metalness: 0.5, emissive: true },
      ],
      parts: [
        { id: 'pedestal', shape: 'box', size: [0.85, 0.38, 0.85], position: [0, 0.19, 0], rotation: [0, 0, 0], material: 'cap' },
        { id: 'shaft', shape: 'cylinder', size: [0.58, 2.45, 0.58], position: [0, 1.58, 0], rotation: [0, 0, 0], material: 'stone' },
        { id: 'capital', shape: 'box', size: [0.9, 0.32, 0.9], position: [0, 2.92, 0], rotation: [0, 0, 0], material: 'cap' },
        { id: 'beacon', shape: 'box', size: [0.16, 1.4, 0.62], position: [0, 1.6, 0], rotation: [0, 0, 0], material: 'light_strip' },
      ],
    };
  }

  if (kind === 'tree') {
    return {
      version: 2,
      name,
      route: 'author',
      rig: 'none',
      heightMeters: 3.4,
      identity: `Reconstructed natural tree & foliage canopy (${name})`,
      materials: [
        { id: 'trunk', color: '#4a321f', roughness: 0.88, metalness: 0.04 },
        { id: 'canopy', color: cleanPrimary, roughness: 0.82, metalness: 0.05 },
        { id: 'highlight', color: cleanAccent, roughness: 0.78, metalness: 0.05 },
      ],
      parts: [
        { id: 'trunk_main', shape: 'cylinder', size: [0.42, 1.45, 0.42], position: [0, 0.72, 0], rotation: [0, 0, 0], material: 'trunk', taper: 0.75 },
        { id: 'crown_low', shape: 'blob', size: [1.85, 1.25, 1.85], position: [0, 1.75, 0], rotation: [0, 0, 0], material: 'canopy', roundness: 0.88 },
        { id: 'crown_top', shape: 'blob', size: [1.35, 1.15, 1.35], position: [0, 2.55, 0], rotation: [0, 0, 0], material: 'highlight', roundness: 0.9 },
      ],
    };
  }

  if (kind === 'vehicle') {
    return {
      version: 2,
      name,
      route: 'author',
      rig: 'none',
      heightMeters: 1.55,
      identity: `Reconstructed street vehicle (${name})`,
      materials: [
        { id: 'body', color: cleanPrimary, roughness: 0.35, metalness: 0.65 },
        { id: 'glass', color: cleanTrim, roughness: 0.15, metalness: 0.8 },
        { id: 'tire', color: '#111827', roughness: 0.9, metalness: 0.1 },
        { id: 'headlight', color: cleanAccent, roughness: 0.2, metalness: 0.5, emissive: true },
      ],
      parts: [
        { id: 'chassis', shape: 'box', size: [1.8, 0.65, 3.6], position: [0, 0.52, 0], rotation: [0, 0, 0], material: 'body' },
        { id: 'cabin', shape: 'box', size: [1.55, 0.55, 1.85], position: [0, 1.08, -0.15], rotation: [0, 0, 0], material: 'glass' },
        { id: 'wheel_fl', shape: 'cylinder', size: [0.62, 0.26, 0.62], position: [-0.88, 0.31, 1.15], rotation: [0, 0, 90], material: 'tire', mirrorX: true },
        { id: 'wheel_rl', shape: 'cylinder', size: [0.62, 0.26, 0.62], position: [-0.88, 0.31, -1.15], rotation: [0, 0, 90], material: 'tire', mirrorX: true },
        { id: 'lamp_l', shape: 'box', size: [0.32, 0.16, 0.1], position: [-0.6, 0.58, 1.81], rotation: [0, 0, 0], material: 'headlight', mirrorX: true },
      ],
    };
  }

  const lowerName = name.toLowerCase();
  if (/(rock|boulder|outcrop|sea stack|stone|revetment|cliff)/i.test(lowerName)) {
    return {
      version: 2,
      name,
      route: 'author',
      rig: 'none',
      heightMeters: 1.45,
      identity: `Reconstructed natural coastal rock formation (${name})`,
      materials: [
        { id: 'rock_base', color: '#64748b', roughness: 0.92, metalness: 0.05 },
        { id: 'rock_mid', color: cleanPrimary, roughness: 0.88, metalness: 0.06 },
        { id: 'sand_crest', color: cleanTrim, roughness: 0.95, metalness: 0.02 },
      ],
      parts: [
        { id: 'boulder_main', shape: 'blob', size: [1.9, 1.15, 1.5], position: [0, 0.52, 0], rotation: [0, 12, 0], material: 'rock_base', roundness: 0.65 },
        { id: 'boulder_flank_l', shape: 'blob', size: [1.2, 0.78, 1.1], position: [-0.85, 0.35, 0.25], rotation: [0, -18, 0], material: 'rock_mid', roundness: 0.7 },
        { id: 'boulder_flank_r', shape: 'blob', size: [1.1, 0.68, 0.95], position: [0.8, 0.3, -0.2], rotation: [0, 24, 0], material: 'sand_crest', roundness: 0.72 },
      ],
    };
  }

  const hasTechMonitor = /(console|workstation|monitor|computer|terminal|lab)/i.test(lowerName);

  // Default architectural table / bench / prop unit
  return {
    version: 2,
    name,
    route: 'author',
    rig: 'none',
    heightMeters: 0.95,
    identity: `Reconstructed furniture / prop unit (${name})`,
    materials: [
      { id: 'surface', color: cleanPrimary, roughness: 0.65, metalness: 0.15 },
      { id: 'frame', color: cleanTrim, roughness: 0.6, metalness: 0.25 },
      { id: 'accent', color: cleanAccent, roughness: 0.35, metalness: 0.35, emissive: hasTechMonitor },
    ],
    parts: [
      { id: 'tabletop', shape: 'box', size: [1.75, 0.12, 0.95], position: [0, 0.78, 0], rotation: [0, 0, 0], material: 'surface' },
      { id: 'leg_fl', shape: 'box', size: [0.12, 0.74, 0.12], position: [-0.75, 0.37, 0.36], rotation: [0, 0, 0], material: 'frame', mirrorX: true },
      { id: 'leg_bl', shape: 'box', size: [0.12, 0.74, 0.12], position: [-0.75, 0.37, -0.36], rotation: [0, 0, 0], material: 'frame', mirrorX: true },
      ...(hasTechMonitor
        ? [{ id: 'top_monitor', shape: 'box' as const, size: [0.65, 0.32, 0.12] as [number, number, number], position: [0, 0.98, -0.15] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], material: 'accent' }]
        : []),
    ],
  };
}

function findCuratedAssetByKeywords(keywords: string[], usedIds: Set<string>): Asset3DItem | undefined {
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    const match = CURATED_3D_ASSETS.find(
      (item) =>
        !usedIds.has(item.id) &&
        item.modelUrl &&
        (item.name.toLowerCase().includes(kwLower) ||
          item.id.toLowerCase().includes(kwLower) ||
          item.tokenPrompt.toLowerCase().includes(kwLower))
    );
    if (match) {
      return match;
    }
  }
  return undefined;
}

interface PerimeterSlot {
  zone: 'stage-left' | 'stage-right' | 'background';
  x: number;
  y: number;
  yawDeg: number;
}

/**
 * Computes safe perimeter coordinates in stage-left (x: 24..34),
 * stage-right (x: 66..76), or background (y: 24..36) that never collide
 * with the human actor's motion corridor.
 */
function buildSafePerimeterSlots(
  humanBounds: { minX: number; maxX: number; minY: number; maxY: number },
  seedHash: number
): PerimeterSlot[] {
  const jitter = (offset: number, span: number) => {
    const bits = ((seedHash >>> offset) & 0xff) / 255;
    return (bits - 0.5) * span;
  };

  const rawSlots: PerimeterSlot[] = [
    {
      zone: 'stage-left',
      x: Math.round((27 + jitter(0, 4)) * 10) / 10,
      y: Math.round((44 + jitter(4, 6)) * 10) / 10,
      yawDeg: 65,
    },
    {
      zone: 'stage-right',
      x: Math.round((73 + jitter(8, 4)) * 10) / 10,
      y: Math.round((46 + jitter(12, 6)) * 10) / 10,
      yawDeg: -65,
    },
    {
      zone: 'background',
      x: Math.round((33 + jitter(16, 4)) * 10) / 10,
      y: Math.round((28 + jitter(20, 4)) * 10) / 10,
      yawDeg: 25,
    },
    {
      zone: 'background',
      x: Math.round((67 + jitter(24, 4)) * 10) / 10,
      y: Math.round((29 + jitter(2, 4)) * 10) / 10,
      yawDeg: -25,
    },
  ];

  const pad = 4;
  const corridorMinX = humanBounds.minX - pad;
  const corridorMaxX = humanBounds.maxX + pad;
  const corridorMinY = humanBounds.minY - pad;
  const corridorMaxY = humanBounds.maxY + pad;

  return rawSlots.map((slot) => {
    let { x, y } = slot;

    if (slot.zone === 'stage-left') {
      x = Math.max(24, Math.min(34, x));
    } else if (slot.zone === 'stage-right') {
      x = Math.max(66, Math.min(76, x));
    } else {
      y = Math.max(24, Math.min(36, y));
    }

    const insideCorridorX = x >= corridorMinX && x <= corridorMaxX;
    const insideCorridorY = y >= corridorMinY && y <= corridorMaxY;

    if (insideCorridorX && insideCorridorY) {
      if (slot.zone === 'stage-left') {
        x = Math.max(24, Math.min(34, corridorMinX - 2));
        if (x >= corridorMinX) {
          y = Math.max(24, Math.min(36, corridorMinY - 2));
        }
      } else if (slot.zone === 'stage-right') {
        x = Math.max(66, Math.min(76, corridorMaxX + 2));
        if (x <= corridorMaxX) {
          y = Math.max(24, Math.min(36, corridorMinY - 2));
        }
      } else {
        y = Math.max(24, Math.min(36, corridorMinY - 2));
        if (y >= corridorMinY) {
          x = x < 50 ? Math.max(24, Math.min(34, corridorMinX - 2)) : Math.max(66, Math.min(76, corridorMaxX + 2));
        }
      }
      if (x >= corridorMinX && x <= corridorMaxX && y >= corridorMinY && y <= corridorMaxY) {
        const candidates: Array<{ cx: number; cy: number; dist: number }> = [];
        const leftX = corridorMinX - 4;
        const rightX = corridorMaxX + 4;
        const backY = corridorMinY - 4;
        const frontY = corridorMaxY + 4;

        if (leftX >= 10 && leftX <= 90) {
          candidates.push({ cx: leftX, cy: Math.max(12, Math.min(88, y)), dist: Math.abs(x - leftX) });
        }
        if (rightX >= 10 && rightX <= 90) {
          candidates.push({ cx: rightX, cy: Math.max(12, Math.min(88, y)), dist: Math.abs(x - rightX) });
        }
        if (backY >= 12 && backY <= 88) {
          candidates.push({ cx: Math.max(10, Math.min(90, x)), cy: backY, dist: Math.abs(y - backY) });
        }
        if (frontY >= 12 && frontY <= 88) {
          candidates.push({ cx: Math.max(10, Math.min(90, x)), cy: frontY, dist: Math.abs(y - frontY) });
        }

        if (candidates.length > 0) {
          candidates.sort((a, b) => a.dist - b.dist);
          x = candidates[0].cx;
          y = candidates[0].cy;
        } else {
          x = leftX >= 4 ? leftX : rightX <= 96 ? rightX : 10;
          y = backY >= 4 ? backY : frontY <= 96 ? frontY : 12;
        }
      }
    }

    return {
      ...slot,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
    };
  });
}

function buildSurroundingActors(
  archetype: SceneArchetypeConfig,
  normalizedText: string,
  dominantColors: ReconstructedSceneResult['dominantColors'],
  zoneAnalysis: FrameZoneAnalysis | null,
  humanBounds: { minX: number; maxX: number; minY: number; maxY: number },
  maxObjects: number,
  seedHash: number,
  visionStructures?: VisionAiSurroundingStructure[]
): Actor[] {
  const targetCount = Math.max(0, Math.min(4, maxObjects));
  if (targetCount === 0) return [];

  const slots = buildSafePerimeterSlots(humanBounds, seedHash);
  const usedAssetIds = new Set<string>();
  const actors: Actor[] = [];

  // If Vision AI extracted real structures from the video frames, build them directly!
  if (visionStructures && visionStructures.length > 0) {
    const chosen = visionStructures.slice(0, targetCount);
    for (let i = 0; i < chosen.length; i++) {
      const vs = chosen[i];
      const fallbackSlot = slots[i % slots.length];
      // Ensure Vision AI coordinates don't collide with human motion corridor
      const pad = 4;
      const inCorridor =
        vs.stageX >= humanBounds.minX - pad &&
        vs.stageX <= humanBounds.maxX + pad &&
        vs.stageY >= humanBounds.minY - pad &&
        vs.stageY <= humanBounds.maxY + pad;
      const finalX = inCorridor ? fallbackSlot.x : vs.stageX;
      const finalY = inCorridor ? fallbackSlot.y : vs.stageY;

      const sculpt = buildProceduralSceneStructureSculpt(
        vs.kind,
        vs.name,
        vs.colorHex,
        dominantColors.accentHex,
        dominantColors.floorHex
      );

      actors.push({
        id: `reconstructed-scene-obj-${i + 1}`,
        name: vs.name,
        kind: vs.kind === 'vehicle' ? 'vehicle' : vs.kind === 'building' || vs.kind === 'wall' || vs.kind === 'tree' ? 'environment' : 'prop',
        token: `${vs.appearancePrompt}, reconstructed from video scene`,
        actionDescription: 'stationary in scene',
        color: vs.colorHex,
        scale: vs.scale,
        gait: 'none',
        rigType: 'rigid_prop',
        modelUrl: undefined,
        sculpt,
        rotation: { x: 0, y: vs.yawDeg, z: 0 },
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: finalX, y: finalY, z: 0 },
          endPosition: { x: finalX, y: finalY, z: 0 },
        },
      });
    }
    return actors;
  }

  const count = Math.max(2, targetCount);
  const promptWords = normalizedText
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !['video', 'scene', 'shot', 'frame', 'actor', 'human', 'person', 'mocap'].includes(w));

  for (let i = 0; i < count; i++) {
    const querySpec = archetype.preferredAssetQueries[i % archetype.preferredAssetQueries.length];
    const slot = slots[i % slots.length];

    let matchedAsset: Asset3DItem | undefined;
    if (i === 0 && promptWords.length > 0) {
      matchedAsset = findCuratedAssetByKeywords(promptWords, usedAssetIds);
    }
    if (!matchedAsset) {
      matchedAsset = findCuratedAssetByKeywords(querySpec.keywords, usedAssetIds);
    }
    if (matchedAsset) {
      usedAssetIds.add(matchedAsset.id);
    }

    // Sample the exact color of the corresponding spatial zone in the video frame (left, right, or background)
    let zoneColorHex = dominantColors.wallOrMidgroundHex;
    let structureKind = querySpec.structureKind;
    const isNaturalOutdoorBiome =
      archetype.key === 'coastal-beach-shoreline' ||
      archetype.key === 'nature-forest-clearing' ||
      archetype.key === 'desert-canyon-dunes';
    if (zoneAnalysis) {
      if (slot.zone === 'stage-left') {
        zoneColorHex = rgbToHex(zoneAnalysis.midLeftZone.r, zoneAnalysis.midLeftZone.g, zoneAnalysis.midLeftZone.b);
        if (zoneAnalysis.midLeftZone.edgeDensity > 0.35 && !archetype.isIndoorBuilding && !isNaturalOutdoorBiome) {
          structureKind = 'building';
        }
      } else if (slot.zone === 'stage-right') {
        zoneColorHex = rgbToHex(zoneAnalysis.midRightZone.r, zoneAnalysis.midRightZone.g, zoneAnalysis.midRightZone.b);
        if (zoneAnalysis.midRightZone.edgeDensity > 0.35 && !archetype.isIndoorBuilding && !isNaturalOutdoorBiome) {
          structureKind = 'building';
        }
      } else {
        zoneColorHex = rgbToHex(
          zoneAnalysis.midCenterBackZone.r,
          zoneAnalysis.midCenterBackZone.g,
          zoneAnalysis.midCenterBackZone.b
        );
      }
    }

    const actorKind: 'environment' | 'prop' | 'vehicle' =
      matchedAsset?.category === 'vehicle'
        ? 'vehicle'
        : matchedAsset?.category === 'architecture' || matchedAsset?.category === 'nature'
          ? 'environment'
          : querySpec.actorKind;

    const actorName = matchedAsset ? matchedAsset.name : querySpec.fallbackRole;
    const actorToken = matchedAsset
      ? `${matchedAsset.tokenPrompt}, positioned in the ${slot.zone} perimeter of the ${archetype.settingLabel.toLowerCase()}`
      : `a photorealistic ${querySpec.fallbackRole.toLowerCase()} in the ${slot.zone} perimeter`;

    const baseScale = matchedAsset?.scale ?? 1.2;
    const computedScale = Math.round(Math.max(0.6, Math.min(4.0, baseScale * querySpec.scaleMultiplier * 0.85)) * 100) / 100;

    const actorColor = blendHexColors(zoneColorHex, dominantColors.accentHex, i % 2 === 0 ? 0.22 : 0.1);

    const sculpt = buildProceduralSceneStructureSculpt(
      structureKind,
      actorName,
      actorColor,
      dominantColors.accentHex,
      dominantColors.floorHex
    );

    actors.push({
      id: `reconstructed-scene-obj-${i + 1}`,
      name: actorName,
      kind: actorKind,
      token: actorToken,
      actionDescription: 'stationary in scene',
      color: actorColor,
      scale: computedScale,
      gait: 'none',
      rigType: 'rigid_prop',
      modelUrl: matchedAsset?.modelUrl,
      sculpt,
      rotation: { x: 0, y: slot.yawDeg, z: 0 },
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: slot.x, y: slot.y, z: 0 },
        endPosition: { x: slot.x, y: slot.y, z: 0 },
      },
    });
  }

  return actors;
}

/**
 * Synchronously and deterministically reconstructs the surrounding building/environment
 * (`EnvironmentSpec`), non-colliding perimeter 3D buildings & objects (`Actor[]` with
 * procedural `SculptSpec`), and directional lighting mood from video frame pixels,
 * Vision AI analysis, and optional hints.
 */
export function reconstructSceneFromVideoFrame(
  options: ReconstructSceneOptions
): ReconstructedSceneResult {
  const fileNameClean = (options.fileName || '').trim();
  const promptClean = (options.sceneHintPrompt || '').trim();
  const explicitDecomp = decomposeMocapAndSceneHint(`${promptClean} ${fileNameClean}`);
  const explicitPlace = explicitDecomp.place;
  const visionEnv = options.visionAiAnalysis?.environment;
  const normalizedText = `${fileNameClean} ${promptClean} ${explicitPlace?.settingLabel || ''} ${visionEnv?.settingLabel || ''} ${visionEnv?.architectureDescription || ''}`
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  const seedHash = computeDeterministicHash(
    `${normalizedText}|${options.referenceFrameDataUrl ? options.referenceFrameDataUrl.slice(0, 128) : 'no-frame'}`
  );

  const zoneAnalysis = options.framePixels ? analyzeFramePixels(options.framePixels) : null;
  const archetype = selectArchetype(normalizedText, zoneAnalysis, explicitPlace?.archetypeKey);

  let isIndoorBuilding = explicitPlace
    ? explicitPlace.isIndoorBuilding
    : visionEnv
      ? visionEnv.isIndoorBuilding
      : archetype.isIndoorBuilding;
  if (!explicitPlace) {
    if (/\b(indoor|interior|inside|room|hall|office|hangar|warehouse|lab|laboratory|corridor|hive|studio)\b/.test(normalizedText)) {
      isIndoorBuilding = true;
    } else if (/\b(outdoor|exterior|outside|forest|desert|street|alley|courtyard)\b/.test(normalizedText)) {
      isIndoorBuilding = false;
    } else if (!visionEnv && zoneAnalysis) {
      if (
        zoneAnalysis.topZone.luminance < zoneAnalysis.midCombinedZone.luminance * 0.95 &&
        zoneAnalysis.verticalEdgeStrength > 0.32
      ) {
        isIndoorBuilding = true;
      }
    }
  }

  const dominantColors = explicitPlace
    ? {
        skyOrCeilingHex: explicitPlace.skyOrCeilingHex,
        wallOrMidgroundHex: explicitPlace.wallOrMidgroundHex,
        floorHex: explicitPlace.floorHex,
        accentHex: explicitPlace.accentHex,
      }
    : visionEnv
      ? {
          skyOrCeilingHex: visionEnv.skyOrCeilingHex,
          wallOrMidgroundHex: visionEnv.wallOrMidgroundHex,
          floorHex: visionEnv.floorHex,
          accentHex: visionEnv.accentHex,
        }
      : zoneAnalysis
        ? {
            skyOrCeilingHex: blendHexColors(
              archetype.defaultColors.skyOrCeilingHex,
              rgbToHex(zoneAnalysis.topZone.r, zoneAnalysis.topZone.g, zoneAnalysis.topZone.b),
              0.65
            ),
            wallOrMidgroundHex: blendHexColors(
              archetype.defaultColors.wallOrMidgroundHex,
              rgbToHex(
                zoneAnalysis.midCombinedZone.r,
                zoneAnalysis.midCombinedZone.g,
                zoneAnalysis.midCombinedZone.b
              ),
              0.65
            ),
            floorHex: blendHexColors(
              archetype.defaultColors.floorHex,
              rgbToHex(zoneAnalysis.bottomZone.r, zoneAnalysis.bottomZone.g, zoneAnalysis.bottomZone.b),
              0.65
            ),
            accentHex: blendHexColors(
              archetype.defaultColors.accentHex,
              rgbToHex(zoneAnalysis.accentSample.r, zoneAnalysis.accentSample.g, zoneAnalysis.accentSample.b),
              0.7
            ),
          }
        : { ...archetype.defaultColors };

  const lightingInference = inferLightingMood(zoneAnalysis, archetype);
  const finalLightingSummary = visionEnv?.lightingSummary || lightingInference.lightingSummary;

  const basePreset =
    CINEMATIC_ENVIRONMENT_PRESETS.find((p) => p.id === archetype.presetId)?.spec ??
    CINEMATIC_ENVIRONMENT_PRESETS[0].spec;

  const customHintSuffix = promptClean
    ? `, incorporating scene context: ${promptClean}`
    : fileNameClean
      ? `, reconstructed from reference plate (${fileNameClean})`
      : '';

  const detectedSettingLabel =
    explicitPlace?.settingLabel || visionEnv?.settingLabel || archetype.settingLabel;
  const archDesc =
    explicitPlace?.architectureDescription ||
    visionEnv?.architectureDescription ||
    archetype.architectureDescription;

  const environment: EnvironmentSpec = {
    ...basePreset,
    id: `reconstructed-${archetype.key}`,
    name: detectedSettingLabel,
    nameAr: detectedSettingLabel,
    category: explicitPlace?.category || visionEnv?.category || archetype.category,
    groundSurface: explicitPlace?.groundSurface || visionEnv?.groundSurface || archetype.groundSurface,
    weather: explicitPlace?.weather || visionEnv?.weather || lightingInference.weather,
    timeOfDay: explicitPlace?.timeOfDay || visionEnv?.timeOfDay || lightingInference.timeOfDay,
    fogDensity: archetype.fogDensity,
    fogColor: blendHexColors(dominantColors.skyOrCeilingHex, dominantColors.wallOrMidgroundHex, 0.5),
    skyColor: dominantColors.skyOrCeilingHex,
    groundColor: dominantColors.floorHex,
    ambientColor: dominantColors.accentHex,
    promptDescription: `${archDesc}, ${finalLightingSummary}${customHintSuffix}`,
    visibleInPrevis: true,
    previsStageMode: 'show-stage',
    conceptImageUrl: undefined,
    conceptImageName: undefined,
  };

  const humanBounds = options.humanTrajectoryBounds ?? {
    minX: 42,
    maxX: 58,
    minY: 42,
    maxY: 66,
  };

  const maxSurroundingObjects = options.maxSurroundingObjects ?? 4;
  const explicitOrVisionStructures: VisionAiSurroundingStructure[] | undefined =
    explicitDecomp.explicitStructures.length > 0
      ? explicitDecomp.explicitStructures.map((es) => ({
          name: es.name,
          kind: es.kind,
          appearancePrompt: es.appearancePrompt,
          colorHex: es.colorHex,
          stageX: es.stageX,
          stageY: es.stageY,
          scale: es.scale,
          yawDeg: es.yawDeg,
        }))
      : options.visionAiAnalysis?.surroundingStructures;

  const surroundingActors = buildSurroundingActors(
    archetype,
    normalizedText,
    dominantColors,
    zoneAnalysis,
    humanBounds,
    maxSurroundingObjects,
    seedHash,
    explicitOrVisionStructures
  );

  return {
    environment,
    surroundingActors,
    isIndoorBuilding,
    detectedSettingLabel,
    lightingSummary: finalLightingSummary,
    dominantColors,
  };
}

/**
 * Decodes an image URL or data URI onto an offscreen canvas to extract pixel zones,
 * then runs `reconstructSceneFromVideoFrame`. Safely falls back to deterministic
 * reconstruction if `Image` or `HTMLCanvasElement` decoding is unavailable (e.g. JSDOM).
 */
export async function reconstructSceneFromImageUrl(
  imageUrl: string,
  options?: Omit<ReconstructSceneOptions, 'referenceFrameDataUrl'>
): Promise<ReconstructedSceneResult> {
  const baseOptions: ReconstructSceneOptions = {
    ...options,
    referenceFrameDataUrl: imageUrl,
  };

  if (
    !imageUrl ||
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof Image === 'undefined'
  ) {
    return reconstructSceneFromVideoFrame(baseOptions);
  }

  if (baseOptions.framePixels) {
    return reconstructSceneFromVideoFrame(baseOptions);
  }

  return new Promise<ReconstructedSceneResult>((resolve) => {
    let settled = false;
    const finishWithFallback = () => {
      if (settled) return;
      settled = true;
      resolve(reconstructSceneFromVideoFrame(baseOptions));
    };

    const timeoutId = setTimeout(finishWithFallback, 1500);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        if (settled) return;
        clearTimeout(timeoutId);
        try {
          const sampleWidth = Math.max(16, Math.min(96, img.naturalWidth || img.width || 64));
          const sampleHeight = Math.max(16, Math.min(96, img.naturalHeight || img.height || 64));
          const canvas = document.createElement('canvas');
          canvas.width = sampleWidth;
          canvas.height = sampleHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finishWithFallback();
            return;
          }
          ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
          const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
          settled = true;
          resolve(
            reconstructSceneFromVideoFrame({
              ...baseOptions,
              framePixels: {
                width: sampleWidth,
                height: sampleHeight,
                data: imageData.data,
              },
            })
          );
        } catch {
          finishWithFallback();
        }
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        finishWithFallback();
      };

      img.src = imageUrl;
    } catch {
      clearTimeout(timeoutId);
      finishWithFallback();
    }
  });
}
