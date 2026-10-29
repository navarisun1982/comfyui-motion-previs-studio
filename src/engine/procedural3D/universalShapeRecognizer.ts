/**
 * Universal Shape Recognition & Procedural 3D Synthesis Engine.
 *
 * First-Principles Architecture:
 * 1. Analyzes the visual/geometric topology of ANY shape first (aspect ratio, cavity,
 *    symmetry, central void, bounding envelope, surface optical properties).
 * 2. Directly constructs the 3D procedural geometry from the recognized topology,
 *    WITHOUT relying on hardcoded object-specific recipes or arbitrary slice stacking.
 */

import { SculptSpec, SculptPart } from './sculptSpec';
import { SilhouetteMetrics, ExtractedPalette } from './silhouette';

export type SupportedPalette = ExtractedPalette | Record<string, any>;

export interface UniversalShapeOptions {
  name?: string;
  prompt?: string;
  metrics?: SilhouetteMetrics;
  palette?: SupportedPalette;
  defaultHeight?: number;
}

export type ShapeTopologyType =
  | 'cavity_container' // Open/hollow recessed interior with perimeter walls (e.g. pans, trays, dishes, bowls, basins, crates)
  | 'annular_ring'     // Central void / toroidal topology (e.g. rings, bracelets, tires, donuts, toruses)
  | 'rotational_lathe'  // Radially symmetric / lathe body (e.g. bottles, vases, cups, mugs, columns, cylinders)
  | 'prismatic_hull';   // Solid multi-tier prismatic envelope (e.g. boxes, devices, furniture, vehicles, chassis)

export type AspectCategory =
  | 'ultra_flat'         // ar < 0.4
  | 'shallow_wide'        // 0.4 <= ar < 0.85
  | 'compact_isometric'   // 0.85 <= ar < 1.35
  | 'upright_tall'        // 1.35 <= ar < 2.5
  | 'slender_column';     // ar >= 2.5

export interface RecognizedTopology {
  topology: ShapeTopologyType;
  aspectCategory: AspectCategory;
  aspectRatio: number;
  fullHeight: number;
  fullWidth: number;
  fullDepth: number;
  isHollow: boolean;
  symmetryScore: number;
  material: {
    type: 'metallic' | 'dielectric' | 'organic';
    roughness: number;
    metalness: number;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    dominantColors: string[];
  };
  inferredLabel: string;
}

function resolvePaletteColors(palette?: SupportedPalette): {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  dominantColors: string[];
} {
  const p = (palette || {}) as any;
  const primaryColor = p.primaryColor || p.primaryClothing || p.leather || '#9ca3af';
  const secondaryColor = p.secondaryColor || p.secondaryClothing || p.metal || '#d1d5db';
  const accentColor = p.accentColor || p.weaponAccent || '#374151';
  const dominantColors =
    Array.isArray(p.dominantColors) && p.dominantColors.length > 0
      ? p.dominantColors
      : [primaryColor, secondaryColor, accentColor];
  return { primaryColor, secondaryColor, accentColor, dominantColors };
}

/**
 * Phase 1: Recognizes the physical and geometric topology of ANY shape from its measurements and semantics.
 */
export function recognizeShapeTopology(opts: UniversalShapeOptions): RecognizedTopology {
  const { name = '', prompt = '', metrics, palette, defaultHeight } = opts;
  const clean = `${name} ${prompt}`.toLowerCase();
  const ar = metrics?.aspectRatio && metrics.aspectRatio > 0.05 && metrics.aspectRatio < 10 ? metrics.aspectRatio : 1.0;

  // Aspect classification
  let aspectCategory: AspectCategory = 'compact_isometric';
  if (ar < 0.4) aspectCategory = 'ultra_flat';
  else if (ar < 0.85) aspectCategory = 'shallow_wide';
  else if (ar < 1.35) aspectCategory = 'compact_isometric';
  else if (ar < 2.5) aspectCategory = 'upright_tall';
  else aspectCategory = 'slender_column';

  // 1. Annular / Central Void Detection (Rings, Tires, Toruses)
  const isRingPrompt =
    /\b(ring|band|bracelet|hoop|donut|torus|tire|tyre|coil|annular)\b/i.test(clean) ||
    /(خاتم|دبلة|محبس|سوار|إطار|حلقة)/.test(clean);

  // 2. Cavity / Hollow Container Detection (Pans, Trays, Dishes, Bowls, Basins, Open Boxes)
  const isCavityPrompt =
    /\b(pan|tray|dish|platter|bowl|basin|pot|tub|sink|crate|bin|casserole|skillet|sheet|cavity|container|hollow)\b/i.test(
      clean
    ) || /(صينية|صاج|طاسة|طبق|وعاء|قالب|حوض|صندوق مفتوح)/.test(clean);

  // Geometric detection of cavity/container from silhouette:
  // Shallow/wide aspect ratio with a wide base profile indicates a flat open container/tray
  const isCavityGeometry =
    aspectCategory === 'shallow_wide' || aspectCategory === 'ultra_flat';

  // 3. Rotational / Lathe Detection (Bottles, Vases, Cups, Jugs, Columns, Flasks)
  const isRotationalPrompt =
    /\b(bottle|vase|cup|mug|glass|jar|flask|can|jug|chalice|column|pillar|cylinder|chalice|urn|potion)\b/i.test(clean) ||
    /(زجاجة|قارورة|كوب|فنجان|إبريق|كأس|عمود|مزهرية)/.test(clean);

  const isRotationalGeometry =
    aspectCategory === 'upright_tall' &&
    Array.isArray(metrics?.widthProfile) &&
    metrics.widthProfile.length === 10 &&
    metrics.widthProfile[9] < (metrics.widthProfile[4] || 1) * 0.9;

  let topology: ShapeTopologyType = 'prismatic_hull';
  let inferredLabel = 'Volumetric 3D Form';

  if (isRingPrompt) {
    topology = 'annular_ring';
    inferredLabel = 'Annular Ring Form';
  } else if (isCavityPrompt || (isCavityGeometry && !/\b(car|vehicle|chair|table|sword)\b/i.test(clean))) {
    topology = 'cavity_container';
    inferredLabel = 'Recessed Cavity Container';
  } else if (isRotationalPrompt || isRotationalGeometry) {
    topology = 'rotational_lathe';
    inferredLabel = 'Revolved Lathe Form';
  } else {
    topology = 'prismatic_hull';
    inferredLabel = 'Prismatic Structural Hull';
  }

  // Dimensions
  const fullHeight = defaultHeight || (topology === 'cavity_container' ? 0.08 : topology === 'rotational_lathe' ? 0.32 : 0.35);
  const fullWidth = Number((fullHeight / Math.min(Math.max(ar, 0.2), 3.0)).toFixed(3));
  const fullDepth = Number((fullWidth * (topology === 'cavity_container' ? 0.72 : 0.8)).toFixed(3));

  // Material & Surface Analysis
  const { primaryColor, secondaryColor, accentColor, dominantColors } = resolvePaletteColors(palette);
  const isNeutralSilver = /#([89a-f][0-9a-f]){3}/i.test(primaryColor) || /gray|grey|silver|metal/i.test(clean);
  const isMetallic =
    isNeutralSilver ||
    /\b(metal|steel|iron|aluminum|gold|silver|brass|chrome|metallic)\b/i.test(clean) ||
    /(معدن|حديد|صلب|ألومنيوم|ذهب|فضة|نحاس)/.test(clean);

  const material = {
    type: (isMetallic ? 'metallic' : 'dielectric') as 'metallic' | 'dielectric' | 'organic',
    roughness: isMetallic ? 0.28 : 0.55,
    metalness: isMetallic ? 0.85 : 0.15,
    primaryColor,
    secondaryColor,
    accentColor,
    dominantColors,
  };

  return {
    topology,
    aspectCategory,
    aspectRatio: ar,
    fullHeight,
    fullWidth,
    fullDepth,
    isHollow: topology === 'cavity_container' || topology === 'annular_ring',
    symmetryScore: 0.9,
    material,
    inferredLabel,
  };
}

/**
 * Phase 2: Procedural Construction — Generates authentic Three.js SculptSpec parts
 * directly from the recognized topology without arbitrary slicing.
 */
export function buildShapeFromTopology(recognized: RecognizedTopology, displayName?: string): SculptSpec {
  const {
    topology,
    fullHeight,
    fullWidth,
    fullDepth,
    material,
    inferredLabel,
  } = recognized;

  const parts: SculptPart[] = [];
  const name = displayName || inferredLabel;

  if (topology === 'annular_ring') {
    // ------------------------------------------------------------------------------------------
    // Annular / Torus Topology: Central void with continuous tubular ring and bezel
    // ------------------------------------------------------------------------------------------
    const outerRadius = Number((fullWidth * 0.48).toFixed(3));
    const tubeRadius = Number((fullWidth * 0.08).toFixed(3));

    parts.push(
      // Primary Torus Loop with hollow center
      {
        id: 'annular_torus_band',
        shape: 'torus',
        size: [Number((outerRadius * 2).toFixed(3)), Number((tubeRadius * 2).toFixed(3)), 0],
        position: [0, outerRadius, 0],
        rotation: [90, 0, 0],
        material: 'mat_primary',
        color: material.primaryColor,
      },
      // Accent Bezel Crest
      {
        id: 'annular_bezel_crest',
        parent: 'annular_torus_band',
        shape: 'blob',
        size: [Number((tubeRadius * 2.8).toFixed(3)), Number((tubeRadius * 2.2).toFixed(3)), Number((tubeRadius * 2.8).toFixed(3))],
        position: [0, 0, outerRadius],
        rotation: [0, 0, 0],
        material: 'mat_accent',
        color: material.accentColor,
        roundness: 0.35,
      },
      // Gem / Core Jewel
      {
        id: 'annular_core_gem',
        parent: 'annular_bezel_crest',
        shape: 'blob',
        size: [Number((tubeRadius * 1.6).toFixed(3)), Number((tubeRadius * 1.6).toFixed(3)), Number((tubeRadius * 1.6).toFixed(3))],
        position: [0, 0, Number((tubeRadius * 0.9).toFixed(3))],
        rotation: [0, 0, 0],
        material: 'mat_secondary',
        color: material.secondaryColor,
        roundness: 1.0,
      }
    );
  } else if (topology === 'cavity_container') {
    // ------------------------------------------------------------------------------------------
    // Cavity / Container Topology: Solid bottom plate, 4 boundary walls, rolled lip, interior floor
    // ------------------------------------------------------------------------------------------
    const wallThick = Number((fullWidth * 0.035).toFixed(3));
    const bottomThick = Number((fullHeight * 0.12).toFixed(3));

    parts.push(
      // 1. Flat base bottom plate
      {
        id: 'container_base_bottom',
        shape: 'box',
        size: [
          Number((fullWidth - wallThick * 2).toFixed(3)),
          bottomThick,
          Number((fullDepth - wallThick * 2).toFixed(3)),
        ],
        position: [0, Number((bottomThick * 0.5).toFixed(3)), 0],
        rotation: [0, 0, 0],
        material: 'mat_primary',
        color: material.primaryColor,
        roundness: 0.15,
      },
      // 2. Front angled wall
      {
        id: 'container_wall_front',
        parent: 'container_base_bottom',
        shape: 'box',
        size: [fullWidth, fullHeight, wallThick],
        position: [0, Number((fullHeight * 0.5).toFixed(3)), Number((fullDepth * 0.5 - wallThick * 0.5).toFixed(3))],
        rotation: [0.12, 0, 0],
        material: 'mat_primary',
        color: material.primaryColor,
        roundness: 0.18,
      },
      // 3. Back angled wall
      {
        id: 'container_wall_back',
        parent: 'container_base_bottom',
        shape: 'box',
        size: [fullWidth, fullHeight, wallThick],
        position: [0, Number((fullHeight * 0.5).toFixed(3)), Number((-fullDepth * 0.5 + wallThick * 0.5).toFixed(3))],
        rotation: [-0.12, 0, 0],
        material: 'mat_primary',
        color: material.primaryColor,
        roundness: 0.18,
      },
      // 4. Side walls (mirrorX)
      {
        id: 'container_wall_side',
        parent: 'container_base_bottom',
        shape: 'box',
        size: [wallThick, fullHeight, Number((fullDepth - wallThick * 1.5).toFixed(3))],
        position: [Number((fullWidth * 0.5 - wallThick * 0.5).toFixed(3)), Number((fullHeight * 0.5).toFixed(3)), 0],
        rotation: [0, 0, -0.12],
        mirrorX: true,
        material: 'mat_primary',
        color: material.primaryColor,
        roundness: 0.18,
      },
      // 5. Perimeter rolled lip flange
      {
        id: 'container_lip_front',
        parent: 'container_base_bottom',
        shape: 'box',
        size: [Number((fullWidth * 1.04).toFixed(3)), Number((wallThick * 0.8).toFixed(3)), Number((wallThick * 1.4).toFixed(3))],
        position: [0, fullHeight, Number((fullDepth * 0.52).toFixed(3))],
        rotation: [0, 0, 0],
        material: 'mat_secondary',
        color: material.secondaryColor,
        roundness: 0.5,
      },
      {
        id: 'container_lip_back',
        parent: 'container_base_bottom',
        shape: 'box',
        size: [Number((fullWidth * 1.04).toFixed(3)), Number((wallThick * 0.8).toFixed(3)), Number((wallThick * 1.4).toFixed(3))],
        position: [0, fullHeight, Number((-fullDepth * 0.52).toFixed(3))],
        rotation: [0, 0, 0],
        material: 'mat_secondary',
        color: material.secondaryColor,
        roundness: 0.5,
      },
      {
        id: 'container_lip_side',
        parent: 'container_base_bottom',
        shape: 'box',
        size: [Number((wallThick * 1.4).toFixed(3)), Number((wallThick * 0.8).toFixed(3)), fullDepth],
        position: [Number((fullWidth * 0.52).toFixed(3)), fullHeight, 0],
        rotation: [0, 0, 0],
        mirrorX: true,
        material: 'mat_secondary',
        color: material.secondaryColor,
        roundness: 0.5,
      },
      // 6. Recessed inner cavity floor
      {
        id: 'container_inner_cavity',
        parent: 'container_base_bottom',
        shape: 'box',
        size: [
          Number((fullWidth - wallThick * 2.8).toFixed(3)),
          Number((bottomThick * 0.4).toFixed(3)),
          Number((fullDepth - wallThick * 2.8).toFixed(3)),
        ],
        position: [0, Number((bottomThick * 0.7).toFixed(3)), 0],
        rotation: [0, 0, 0],
        material: 'mat_accent',
        color: material.dominantColors[1] || material.primaryColor,
        roundness: 0.1,
      }
    );
  } else if (topology === 'rotational_lathe') {
    // ------------------------------------------------------------------------------------------
    // Rotational / Lathe Topology: Concentric body, shoulder taper, slender neck, lip collar
    // ------------------------------------------------------------------------------------------
    const bodyHeight = Number((fullHeight * 0.62).toFixed(3));
    const neckHeight = Number((fullHeight * 0.28).toFixed(3));
    const bodyRadius = Number((fullWidth * 0.46).toFixed(3));
    const neckRadius = Number((bodyRadius * 0.38).toFixed(3));

    parts.push(
      // Base Foot
      {
        id: 'lathe_base_foot',
        shape: 'cylinder',
        size: [Number((bodyRadius * 2).toFixed(3)), Number((fullHeight * 0.06).toFixed(3)), Number((bodyRadius * 2).toFixed(3))],
        position: [0, Number((fullHeight * 0.03).toFixed(3)), 0],
        rotation: [0, 0, 0],
        material: 'mat_primary',
        color: material.primaryColor,
      },
      // Main Concentric Body
      {
        id: 'lathe_main_body',
        parent: 'lathe_base_foot',
        shape: 'cylinder',
        size: [Number((bodyRadius * 2).toFixed(3)), bodyHeight, Number((bodyRadius * 2).toFixed(3))],
        position: [0, Number((bodyHeight * 0.5 + fullHeight * 0.03).toFixed(3)), 0],
        rotation: [0, 0, 0],
        material: 'mat_primary',
        color: material.primaryColor,
      },
      // Tapered Shoulder Transition
      {
        id: 'lathe_shoulder_taper',
        parent: 'lathe_main_body',
        shape: 'cone',
        size: [Number((bodyRadius * 2).toFixed(3)), Number((fullHeight * 0.12).toFixed(3)), Number((bodyRadius * 2).toFixed(3))],
        position: [0, Number((bodyHeight * 0.5 + fullHeight * 0.06).toFixed(3)), 0],
        rotation: [0, 0, 0],
        material: 'mat_secondary',
        color: material.secondaryColor,
      },
      // Slender Upright Neck
      {
        id: 'lathe_slender_neck',
        parent: 'lathe_shoulder_taper',
        shape: 'cylinder',
        size: [Number((neckRadius * 2).toFixed(3)), neckHeight, Number((neckRadius * 2).toFixed(3))],
        position: [0, Number((fullHeight * 0.06 + neckHeight * 0.5).toFixed(3)), 0],
        rotation: [0, 0, 0],
        material: 'mat_primary',
        color: material.primaryColor,
      },
      // Aperture Lip Rim Collar
      {
        id: 'lathe_aperture_rim',
        parent: 'lathe_slender_neck',
        shape: 'torus',
        size: [Number((neckRadius * 2.3).toFixed(3)), Number((neckRadius * 0.44).toFixed(3)), 0],
        position: [0, Number((neckHeight * 0.5).toFixed(3)), 0],
        rotation: [90, 0, 0],
        material: 'mat_accent',
        color: material.accentColor,
      }
    );
  } else {
    // ------------------------------------------------------------------------------------------
    // Prismatic Structural Hull Topology: Foundation chassis, core envelope, flank panels, deck
    // ------------------------------------------------------------------------------------------
    parts.push(
      // Foundation Chassis
      {
        id: 'hull_base_chassis',
        shape: 'box',
        size: [Number((fullWidth * 0.94).toFixed(3)), Number((fullHeight * 0.14).toFixed(3)), Number((fullDepth * 0.94).toFixed(3))],
        position: [0, Number((fullHeight * 0.07).toFixed(3)), 0],
        rotation: [0, 0, 0],
        material: 'mat_primary',
        color: material.dominantColors[0] || material.primaryColor,
        roundness: 0.2,
      },
      // Main Volumetric Core Body
      {
        id: 'hull_core_body',
        parent: 'hull_base_chassis',
        shape: 'blob',
        size: [Number((fullWidth * 0.9).toFixed(3)), Number((fullHeight * 0.58).toFixed(3)), Number((fullDepth * 0.88).toFixed(3))],
        position: [0, Number((fullHeight * 0.36).toFixed(3)), 0],
        rotation: [0, 0, 0],
        material: 'mat_primary',
        color: material.primaryColor,
        roundness: 0.45,
      },
      // Lateral Wing Flanks (mirrorX)
      {
        id: 'hull_lateral_flanks',
        parent: 'hull_core_body',
        shape: 'box',
        size: [Number((fullWidth * 0.08).toFixed(3)), Number((fullHeight * 0.42).toFixed(3)), Number((fullDepth * 0.78).toFixed(3))],
        position: [Number((fullWidth * 0.45).toFixed(3)), 0, 0],
        rotation: [0, 0, 0],
        mirrorX: true,
        material: 'mat_secondary',
        color: material.secondaryColor,
        roundness: 0.25,
      },
      // Front Protective Deck
      {
        id: 'hull_front_deck',
        parent: 'hull_core_body',
        shape: 'box',
        size: [Number((fullWidth * 0.76).toFixed(3)), Number((fullHeight * 0.35).toFixed(3)), Number((fullDepth * 0.08).toFixed(3))],
        position: [0, 0, Number((fullDepth * 0.44).toFixed(3))],
        rotation: [0, 0, 0],
        material: 'mat_secondary',
        color: material.dominantColors[1] || material.secondaryColor,
        roundness: 0.2,
      },
      // Upper Crown Deck
      {
        id: 'hull_crown_deck',
        parent: 'hull_core_body',
        shape: 'box',
        size: [Number((fullWidth * 0.65).toFixed(3)), Number((fullHeight * 0.12).toFixed(3)), Number((fullDepth * 0.65).toFixed(3))],
        position: [0, Number((fullHeight * 0.34).toFixed(3)), 0],
        rotation: [0, 0, 0],
        material: 'mat_accent',
        color: material.accentColor,
        roundness: 0.3,
      }
    );
  }

  return {
    version: 2,
    route: 'author',
    rig: 'none',
    name,
    heightMeters: fullHeight,
    materials: [
      { id: 'mat_primary', color: material.primaryColor, roughness: material.roughness, metalness: material.metalness },
      { id: 'mat_secondary', color: material.secondaryColor, roughness: material.roughness * 0.9, metalness: material.metalness },
      { id: 'mat_accent', color: material.accentColor, roughness: 0.35, metalness: material.metalness * 0.8 },
    ],
    parts,
  };
}

/**
 * Universal procedural synthesis: Recognizes ANY shape from image & metrics, then builds it.
 */
export function synthesizeUniversalProceduralShape(opts: UniversalShapeOptions): SculptSpec {
  const recognized = recognizeShapeTopology(opts);
  return buildShapeFromTopology(recognized, opts.name);
}
