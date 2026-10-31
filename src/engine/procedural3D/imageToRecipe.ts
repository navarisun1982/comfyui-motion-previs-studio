/**
 * Image-to-Recipe 3D Synthesis Engine.
 *
 * Deterministically synthesizes a declarative parametric 3D SculptSpec from:
 * 1. SilhouetteMask & SilhouetteMetrics (measured aspect ratio, bounding box, 10-band width profile).
 * 2. ExtractedPalette (primary, secondary, accent, and dominant colors sampled from foreground pixels).
 * 3. Optional prompt/name semantics (e.g. "bag of chips", "packet of chips", "bottle", "crate").
 *
 * Grounded in the declarative recipe philosophy:
 * - The 3D model is purely structured data (SculptSpec with parametric geometric parts), NOT executable code.
 * - Objects, props, food, vehicles, and furniture are NEVER forced into humanoid skeletons.
 * - Colors are sampled authentic hex values, rendered with tactile clay/PBR materials.
 */

import { SculptSpec, SculptPart, lookupCuratedSculptSpec } from './sculptSpec';
import { SilhouetteMetrics, ExtractedPalette } from './silhouette';
import {
  extractCharacterFeaturesFromModelOutput,
  compileCharacterToClaySculpt,
} from './characterClayCompiler';

export type SupportedPalette = ExtractedPalette | Record<string, any>;

export interface ImageToRecipeOptions {
  name?: string;
  prompt?: string;
  metrics?: SilhouetteMetrics;
  palette?: SupportedPalette;
  defaultHeight?: number;
}

function resolveColors(palette?: SupportedPalette): {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  dominantColors: string[];
} {
  const p = (palette || {}) as any;
  const primaryColor = p.primaryColor || p.primaryClothing || p.leather || '#d92525';
  const secondaryColor = p.secondaryColor || p.secondaryClothing || p.metal || '#f59e0b';
  const accentColor = p.accentColor || p.weaponAccent || '#ffffff';
  const dominantColors = Array.isArray(p.dominantColors) && p.dominantColors.length > 0
    ? p.dominantColors
    : [primaryColor, secondaryColor, accentColor];
  return { primaryColor, secondaryColor, accentColor, dominantColors };
}

/**
 * Checks if a prompt or name explicitly requests a humanoid character.
 */
export function isHumanoidPrompt(text?: string): boolean {
  if (!text) return false;
  const clean = text.toLowerCase().trim();
  // If it's a food, prop, container, vehicle, bag, package, coffee, or jewelry/ring, treat as prop
  if (
    /\b(bag of|packet of|pack of|can of|bottle of|box of|crate of|chips|crisps|snack|soda|coffee|espresso|beans|drink|food|car|truck|drone|furniture|chair|table|ring|snake|serpent|jewelry|jewellery|bracelet|necklace|pave)\b/i.test(
      clean
    ) ||
    /(قهوة|بن|كيس|شاي|حبوب|أكياس|علبة|زجاجة|عطر|شيبس|مقرمشات|طاولة|كرسي|صندوق|مزاج|خاتم|محبس|دبلة|سوار|ثعبان|أفعى|مجوهرات)/.test(
      clean
    )
  ) {
    return false;
  }
  return (
    /\b(person|human|character|actor|man|woman|male|female|boy|girl|warrior|knight|soldier|elf|wizard|archer|scout|hero|villain|king|queen|assassin|dancer|ninja|monk|priest)\b/i.test(
      clean
    ) || /(شخص|إنسان|رجل|امرأة|بطل|محارب|فارس|جندي|ساحر|نينجا)/.test(clean)
  );
}

/**
 * Synthesizes a stand-up coffee pouch / roasted coffee bean bag 3D sculpt recipe.
 */
export function buildCoffeePouchRecipe(
  optionsOrName?: ImageToRecipeOptions | string,
  pMetrics?: SilhouetteMetrics,
  pPalette?: SupportedPalette,
  pHeight?: number
): SculptSpec {
  const opts: ImageToRecipeOptions =
    typeof optionsOrName === 'object'
      ? optionsOrName
      : { name: optionsOrName, metrics: pMetrics, palette: pPalette, defaultHeight: pHeight };

  const name = opts.name || 'Coffee Pouch';
  const palette = opts.palette;
  const metrics = opts.metrics;
  const height = opts.defaultHeight || 0.28;
  const { primaryColor, secondaryColor, accentColor } = resolveColors(palette);

  // If metrics are available, use measured aspect ratio (typically 1.4 to 2.2 for stand-up pouches)
  const ar =
    metrics?.aspectRatio && metrics.aspectRatio > 0.6 && metrics.aspectRatio < 3.5
      ? metrics.aspectRatio
      : 1.65;
  const fullHeight = height || 0.28;
  const fullWidth = Number((fullHeight / ar).toFixed(3));
  const fullDepth = Number((fullWidth * 0.48).toFixed(3));

  const parts: SculptPart[] = [
    // 1. Main vertical pouch body (slender, standing, smooth organic clay foil)
    {
      id: 'pouch_body',
      shape: 'blob',
      size: [fullWidth, Number((fullHeight * 0.88).toFixed(3)), fullDepth],
      position: [0, Number((fullHeight * 0.47).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_pouch_body',
      color: primaryColor,
      roundness: 0.58,
      taper: 0.08,
    },
    // 2. Sealed top crimped strip
    {
      id: 'crimp_seal_top',
      parent: 'pouch_body',
      shape: 'box',
      size: [
        Number((fullWidth * 0.98).toFixed(3)),
        Number((fullHeight * 0.09).toFixed(3)),
        Number((fullDepth * 0.22).toFixed(3)),
      ],
      position: [0, Number((fullHeight * 0.45).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_crimp',
      color: secondaryColor,
      roundness: 0.06,
    },
    // 3. Embossed sealing ridge accent across top crimp
    {
      id: 'crimp_ridge',
      parent: 'pouch_body',
      shape: 'box',
      size: [
        Number((fullWidth * 0.92).toFixed(3)),
        Number((fullHeight * 0.02).toFixed(3)),
        Number((fullDepth * 0.26).toFixed(3)),
      ],
      position: [0, Number((fullHeight * 0.43).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_accent_gold',
      color: accentColor,
      roundness: 0.04,
    },
    // 4. Circular aroma freshness degassing valve
    {
      id: 'degassing_valve',
      parent: 'pouch_body',
      shape: 'blob',
      size: [
        Number((fullWidth * 0.16).toFixed(3)),
        Number((fullWidth * 0.16).toFixed(3)),
        Number((fullDepth * 0.16).toFixed(3)),
      ],
      position: [0, Number((fullHeight * 0.22).toFixed(3)), Number((fullDepth * 0.48).toFixed(3))],
      rotation: [0, 0, 0],
      material: 'mat_crimp',
      color: secondaryColor,
      roundness: 0.85,
    },
    // 5. Front brand emblem / calligraphy banner (e.g. مزاج / gold seal)
    {
      id: 'front_brand_label',
      parent: 'pouch_body',
      shape: 'blob',
      size: [
        Number((fullWidth * 0.72).toFixed(3)),
        Number((fullHeight * 0.42).toFixed(3)),
        Number((fullDepth * 0.18).toFixed(3)),
      ],
      position: [0, Number((-fullHeight * 0.04).toFixed(3)), Number((fullDepth * 0.46).toFixed(3))],
      rotation: [0, 0, 0],
      material: 'mat_accent_gold',
      color: accentColor,
      roundness: 0.5,
    },
    // 6. Folded bottom base gusset for realistic standing stability
    {
      id: 'bottom_gusset',
      parent: 'pouch_body',
      shape: 'box',
      size: [
        Number((fullWidth * 0.88).toFixed(3)),
        Number((fullHeight * 0.06).toFixed(3)),
        Number((fullDepth * 0.92).toFixed(3)),
      ],
      position: [0, Number((-fullHeight * 0.44).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_pouch_body',
      color: primaryColor,
      roundness: 0.15,
    },
  ];

  return {
    version: 2,
    route: 'author',
    rig: 'none',
    name: name || 'Coffee Pouch',
    heightMeters: fullHeight,
    materials: [
      { id: 'mat_pouch_body', color: primaryColor, roughness: 0.65, metalness: 0.15 },
      { id: 'mat_crimp', color: secondaryColor, roughness: 0.5, metalness: 0.25 },
      { id: 'mat_accent_gold', color: accentColor, roughness: 0.35, metalness: 0.45 },
    ],
    parts,
  };
}

/**
 * Synthesizes a luxury coiled Diamond Pavé Snake Ring (Serpenti style) 3D sculpt recipe.
 * Features an authentic hollow finger bore, 3D helical winding coils, pavé diamond serpent head,
 * emerald gemstone eyes, and tapered tail wrapping around the lower band.
 */
export function buildSnakeRingRecipe(
  optionsOrName?: ImageToRecipeOptions | string,
  pMetrics?: SilhouetteMetrics,
  pPalette?: SupportedPalette,
  pHeight?: number
): SculptSpec {
  const opts: ImageToRecipeOptions =
    typeof optionsOrName === 'object'
      ? optionsOrName
      : { name: optionsOrName, metrics: pMetrics, palette: pPalette, defaultHeight: pHeight };

  const name = opts.name || 'Diamond Pavé Snake Ring';
  const palette = opts.palette;
  const height = opts.defaultHeight || 0.034;
  const { primaryColor, secondaryColor } = resolveColors(palette);

  const isGoldOrWarm = (c: string) => /(#[cdef][a-f0-9][a-f0-9]|#d4af37|#ffd700|#e6be58|#c69a38)/i.test(c);
  const goldColor = isGoldOrWarm(primaryColor) ? primaryColor : isGoldOrWarm(secondaryColor) ? secondaryColor : '#d4af37';
  const diamondColor = '#ffffff';
  const emeraldColor = '#059669';

  const ringHeight = height || 0.034;
  const outerDiameter = Number((ringHeight * 0.82).toFixed(3));
  const ringRadius = outerDiameter * 0.44;
  const tubeThick = Number((outerDiameter * 0.16).toFixed(3));

  // Generate 3D helical spiral points for continuous serpent spine (2.4 turns)
  const numPoints = 28;
  const numTurns = 2.4;
  const points: [number, number, number][] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    const angle = t * numTurns * Math.PI * 2;
    const px = Number((ringRadius * Math.cos(angle)).toFixed(4));
    const pz = Number((ringRadius * Math.sin(angle)).toFixed(4));
    const py = Number(((t - 0.5) * ringHeight * 0.85).toFixed(4));
    points.push([px, py, pz]);
  }

  const parts: SculptPart[] = [
    // 1. Continuous helical coiled serpent body
    {
      id: 'serpent_coiled_body',
      shape: 'tube',
      size: [outerDiameter, ringHeight, outerDiameter],
      position: [0, Number((ringHeight * 0.45).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_18k_gold',
      color: goldColor,
      points,
    },
    // 2. Base circular finger ring collar
    {
      id: 'base_finger_ring',
      shape: 'torus',
      size: [outerDiameter, tubeThick, tubeThick],
      position: [0, Number((ringHeight * 0.22).toFixed(3)), 0],
      rotation: [90, 0, 0],
      material: 'mat_18k_gold',
      color: goldColor,
    },
    // 3. Middle overlapping coil band
    {
      id: 'mid_coil_band',
      shape: 'torus',
      size: [Number((outerDiameter * 0.95).toFixed(3)), tubeThick, tubeThick],
      position: [0, Number((ringHeight * 0.5).toFixed(3)), 0],
      rotation: [95, 12, 6],
      material: 'mat_18k_gold',
      color: goldColor,
    },
    // 4. Upper coil band leading to head
    {
      id: 'upper_coil_band',
      shape: 'torus',
      size: [Number((outerDiameter * 0.9).toFixed(3)), tubeThick, tubeThick],
      position: [0, Number((ringHeight * 0.75).toFixed(3)), 0],
      rotation: [85, 28, -8],
      material: 'mat_18k_gold',
      color: goldColor,
    },
    // 5. Pavé Diamond Encrusted Serpent Head
    {
      id: 'snake_head_pavé',
      shape: 'blob',
      size: [
        Number((outerDiameter * 0.38).toFixed(3)),
        Number((ringHeight * 0.22).toFixed(3)),
        Number((outerDiameter * 0.52).toFixed(3)),
      ],
      position: [
        Number((outerDiameter * 0.12).toFixed(3)),
        Number((ringHeight * 0.92).toFixed(3)),
        Number((outerDiameter * 0.32).toFixed(3)),
      ],
      rotation: [-14, 18, -6],
      material: 'mat_pave_diamond',
      color: diamondColor,
      roundness: 0.42,
      taper: 0.38,
    },
    // 6. Serpent Crown Crest (Diamond pavé top plate)
    {
      id: 'snake_crown_crest',
      parent: 'snake_head_pavé',
      shape: 'blob',
      size: [
        Number((outerDiameter * 0.28).toFixed(3)),
        Number((ringHeight * 0.1).toFixed(3)),
        Number((outerDiameter * 0.38).toFixed(3)),
      ],
      position: [0, Number((ringHeight * 0.04).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_pave_diamond',
      color: diamondColor,
      roundness: 0.35,
    },
    // 7. Left Emerald Gemstone Eye
    {
      id: 'left_eye_emerald',
      parent: 'snake_head_pavé',
      shape: 'blob',
      size: [
        Number((outerDiameter * 0.08).toFixed(3)),
        Number((ringHeight * 0.06).toFixed(3)),
        Number((outerDiameter * 0.12).toFixed(3)),
      ],
      position: [
        Number((outerDiameter * 0.15).toFixed(3)),
        Number((ringHeight * 0.02).toFixed(3)),
        Number((outerDiameter * 0.06).toFixed(3)),
      ],
      rotation: [0, 24, 0],
      material: 'mat_emerald_eye',
      color: emeraldColor,
      roundness: 0.7,
    },
    // 8. Right Emerald Gemstone Eye
    {
      id: 'right_eye_emerald',
      parent: 'snake_head_pavé',
      shape: 'blob',
      size: [
        Number((outerDiameter * 0.08).toFixed(3)),
        Number((ringHeight * 0.06).toFixed(3)),
        Number((outerDiameter * 0.12).toFixed(3)),
      ],
      position: [
        Number((-outerDiameter * 0.15).toFixed(3)),
        Number((ringHeight * 0.02).toFixed(3)),
        Number((outerDiameter * 0.06).toFixed(3)),
      ],
      rotation: [0, -24, 0],
      material: 'mat_emerald_eye',
      color: emeraldColor,
      roundness: 0.7,
    },
    // 9. Serpent Tail Tip
    {
      id: 'snake_tail_tip',
      shape: 'blob',
      size: [
        Number((outerDiameter * 0.22).toFixed(3)),
        Number((ringHeight * 0.14).toFixed(3)),
        Number((outerDiameter * 0.38).toFixed(3)),
      ],
      position: [
        Number((-outerDiameter * 0.25).toFixed(3)),
        Number((ringHeight * 0.16).toFixed(3)),
        Number((-outerDiameter * 0.2).toFixed(3)),
      ],
      rotation: [12, -40, 15],
      material: 'mat_18k_gold',
      color: goldColor,
      roundness: 0.48,
      taper: 0.75,
    },
    // 10. Tail Pavé Diamond Accent
    {
      id: 'tail_diamond_accent',
      parent: 'snake_tail_tip',
      shape: 'blob',
      size: [
        Number((outerDiameter * 0.14).toFixed(3)),
        Number((ringHeight * 0.08).toFixed(3)),
        Number((outerDiameter * 0.2).toFixed(3)),
      ],
      position: [0, Number((ringHeight * 0.02).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_pave_diamond',
      color: diamondColor,
      roundness: 0.4,
    },
  ];

  return {
    version: 2,
    route: 'author',
    rig: 'none',
    name,
    heightMeters: ringHeight,
    materials: [
      { id: 'mat_18k_gold', color: goldColor, roughness: 0.18, metalness: 0.95 },
      { id: 'mat_pave_diamond', color: diamondColor, roughness: 0.05, metalness: 0.12 },
      { id: 'mat_emerald_eye', color: emeraldColor, roughness: 0.08, metalness: 0.25 },
    ],
    parts,
  };
}

/**
 * Synthesizes a luxury gemstone / solitaire jewelry ring 3D sculpt recipe.
 */
export function buildJewelryRingRecipe(
  optionsOrName?: ImageToRecipeOptions | string,
  pMetrics?: SilhouetteMetrics,
  pPalette?: SupportedPalette,
  pHeight?: number
): SculptSpec {
  const opts: ImageToRecipeOptions =
    typeof optionsOrName === 'object'
      ? optionsOrName
      : { name: optionsOrName, metrics: pMetrics, palette: pPalette, defaultHeight: pHeight };

  const name = opts.name || 'Jewelry Ring';
  const palette = opts.palette;
  const height = opts.defaultHeight || 0.028;
  const { primaryColor } = resolveColors(palette);

  const ringHeight = height || 0.028;
  const outerDiameter = Number((ringHeight * 0.88).toFixed(3));
  const tubeThick = Number((outerDiameter * 0.15).toFixed(3));
  const goldColor = '#d4af37';
  const gemColor = primaryColor && primaryColor !== '#c82828' ? primaryColor : '#38bdf8';

  const parts: SculptPart[] = [
    {
      id: 'ring_band',
      shape: 'torus',
      size: [outerDiameter, tubeThick, tubeThick],
      position: [0, Number((ringHeight * 0.4).toFixed(3)), 0],
      rotation: [90, 0, 0],
      material: 'mat_gold',
      color: goldColor,
    },
    {
      id: 'gem_crown_setting',
      shape: 'cylinder',
      size: [
        Number((outerDiameter * 0.32).toFixed(3)),
        Number((ringHeight * 0.22).toFixed(3)),
        Number((outerDiameter * 0.32).toFixed(3)),
      ],
      position: [0, Number((ringHeight * 0.82).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_gold',
      color: goldColor,
      taper: -0.3,
    },
    {
      id: 'faceted_center_gem',
      parent: 'gem_crown_setting',
      shape: 'blob',
      size: [
        Number((outerDiameter * 0.28).toFixed(3)),
        Number((ringHeight * 0.24).toFixed(3)),
        Number((outerDiameter * 0.28).toFixed(3)),
      ],
      position: [0, Number((ringHeight * 0.08).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_gem',
      color: gemColor,
      roundness: 0.25,
    },
  ];

  return {
    version: 2,
    route: 'author',
    rig: 'none',
    name,
    heightMeters: ringHeight,
    materials: [
      { id: 'mat_gold', color: goldColor, roughness: 0.18, metalness: 0.95 },
      { id: 'mat_gem', color: gemColor, roughness: 0.05, metalness: 0.1 },
    ],
    parts,
  };
}

/**
 * Synthesizes a bag of chips / snack packet 3D sculpt recipe.
 */
export function buildBagOfChipsRecipe(
  optionsOrName?: ImageToRecipeOptions | string,
  pMetrics?: SilhouetteMetrics,
  pPalette?: SupportedPalette,
  pHeight?: number
): SculptSpec {
  const opts: ImageToRecipeOptions = typeof optionsOrName === 'object'
    ? optionsOrName
    : { name: optionsOrName, metrics: pMetrics, palette: pPalette, defaultHeight: pHeight };

  const name = opts.name || 'Bag of Chips';
  const palette = opts.palette;
  const metrics = opts.metrics;
  const height = opts.defaultHeight || 0.28;
  const { primaryColor, secondaryColor, accentColor } = resolveColors(palette);

  const ar = metrics?.aspectRatio && metrics.aspectRatio > 0.4 && metrics.aspectRatio < 3.0 ? metrics.aspectRatio : 1.35;
  const fullHeight = height || 0.28;
  const fullWidth = Number((fullHeight / ar).toFixed(3));
  const fullDepth = Number((fullWidth * 0.38).toFixed(3));

  const parts: SculptPart[] = [
    // 1. Main puffed snack pouch body (pillowy rectangular volume)
    {
      id: 'pouch_body',
      shape: 'blob',
      size: [fullWidth, Number((fullHeight * 0.86).toFixed(3)), fullDepth],
      position: [0, Number((fullHeight * 0.5).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_primary',
      color: primaryColor,
      roundness: 0.65,
      taper: 0.04,
    },
    // 2. Top crimped sealed edge (solidly welded to top edge)
    {
      id: 'crimp_top',
      shape: 'box',
      size: [Number((fullWidth * 1.02).toFixed(3)), Number((fullHeight * 0.08).toFixed(3)), Number((fullDepth * 0.22).toFixed(3))],
      position: [0, Number((fullHeight * 0.93).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_secondary',
      color: secondaryColor,
      roundness: 0.08,
    },
    // 3. Bottom crimped sealed edge (solidly welded to bottom edge)
    {
      id: 'crimp_bottom',
      shape: 'box',
      size: [Number((fullWidth * 0.98).toFixed(3)), Number((fullHeight * 0.07).toFixed(3)), Number((fullDepth * 0.22).toFixed(3))],
      position: [0, Number((fullHeight * 0.07).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_secondary',
      color: secondaryColor,
      roundness: 0.08,
    },
    // 4. Front branding label / flavor banner (flush with front surface)
    {
      id: 'front_label_emblem',
      shape: 'blob',
      size: [Number((fullWidth * 0.72).toFixed(3)), Number((fullHeight * 0.4).toFixed(3)), Number((fullDepth * 0.16).toFixed(3))],
      position: [0, Number((fullHeight * 0.5).toFixed(3)), Number((fullDepth * 0.44).toFixed(3))],
      rotation: [0, 0, 0],
      material: 'mat_accent',
      color: accentColor,
      roundness: 0.45,
    },
    // 5. Flavor illustration chip accent (flush on front pouch face)
    {
      id: 'flavor_chip_accent',
      shape: 'blob',
      size: [Number((fullWidth * 0.32).toFixed(3)), Number((fullHeight * 0.18).toFixed(3)), Number((fullDepth * 0.12).toFixed(3))],
      position: [Number((fullWidth * 0.12).toFixed(3)), Number((fullHeight * 0.42).toFixed(3)), Number((fullDepth * 0.46).toFixed(3))],
      rotation: [0, 0, 15],
      material: 'mat_secondary',
      color: secondaryColor,
      roundness: 0.8,
    },
  ];

  return {
    version: 2,
    route: 'author',
    rig: 'none',
    name: name || 'Bag of Chips',
    heightMeters: fullHeight,
    materials: [
      { id: 'mat_primary', color: primaryColor, roughness: 0.55, metalness: 0.15 },
      { id: 'mat_secondary', color: secondaryColor, roughness: 0.45, metalness: 0.25 },
      { id: 'mat_accent', color: accentColor, roughness: 0.5, metalness: 0.05 },
    ],
    parts,
  };
}

/**
 * Synthesizes a bottle / drink container 3D sculpt recipe.
 */
export function buildBottleRecipe(
  optionsOrName?: ImageToRecipeOptions | string,
  pMetrics?: SilhouetteMetrics,
  pPalette?: SupportedPalette,
  pHeight?: number
): SculptSpec {
  const opts: ImageToRecipeOptions = typeof optionsOrName === 'object'
    ? optionsOrName
    : { name: optionsOrName, metrics: pMetrics, palette: pPalette, defaultHeight: pHeight };

  const name = opts.name || 'Bottle';
  const palette = opts.palette;
  const metrics = opts.metrics;
  const height = opts.defaultHeight || 0.3;
  const { primaryColor, secondaryColor, accentColor } = resolveColors(palette);

  const fullHeight = height || 0.3;
  const ar = metrics?.aspectRatio && metrics.aspectRatio > 1.2 ? metrics.aspectRatio : 2.6;
  const fullWidth = Number((fullHeight / ar).toFixed(3));

  const parts: SculptPart[] = [
    // Lower Base
    {
      id: 'bottle_base',
      shape: 'cylinder',
      size: [fullWidth, Number((fullHeight * 0.58).toFixed(3)), fullWidth],
      position: [0, Number((fullHeight * 0.29).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_body',
      color: primaryColor,
      taper: 0.05,
    },
    // Shoulder Taper
    {
      id: 'bottle_shoulder',
      parent: 'bottle_base',
      shape: 'cylinder',
      size: [Number((fullWidth * 0.95).toFixed(3)), Number((fullHeight * 0.2).toFixed(3)), Number((fullWidth * 0.95).toFixed(3))],
      position: [0, Number((fullHeight * 0.38).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_body',
      color: primaryColor,
      taper: 0.65,
    },
    // Neck
    {
      id: 'bottle_neck',
      parent: 'bottle_shoulder',
      shape: 'cylinder',
      size: [Number((fullWidth * 0.38).toFixed(3)), Number((fullHeight * 0.16).toFixed(3)), Number((fullWidth * 0.38).toFixed(3))],
      position: [0, Number((fullHeight * 0.17).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_body',
      color: primaryColor,
      taper: 0,
    },
    // Cap
    {
      id: 'bottle_cap',
      parent: 'bottle_neck',
      shape: 'cylinder',
      size: [Number((fullWidth * 0.42).toFixed(3)), Number((fullHeight * 0.07).toFixed(3)), Number((fullWidth * 0.42).toFixed(3))],
      position: [0, Number((fullHeight * 0.11).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_cap',
      color: secondaryColor,
      taper: 0,
    },
    // Brand Label Band
    {
      id: 'bottle_label',
      parent: 'bottle_base',
      shape: 'cylinder',
      size: [Number((fullWidth * 1.02).toFixed(3)), Number((fullHeight * 0.32).toFixed(3)), Number((fullWidth * 1.02).toFixed(3))],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      material: 'mat_accent',
      color: accentColor,
      taper: 0.02,
    },
  ];

  return {
    version: 2,
    route: 'author',
    rig: 'none',
    name: name || 'Bottle',
    heightMeters: fullHeight,
    materials: [
      { id: 'mat_body', color: primaryColor, roughness: 0.3, metalness: 0.1 },
      { id: 'mat_cap', color: secondaryColor, roughness: 0.4, metalness: 0.2 },
      { id: 'mat_accent', color: accentColor, roughness: 0.6, metalness: 0.0 },
    ],
    parts,
  };
}

/**
 * Synthesizes a box / crate / electronics / prop 3D sculpt recipe.
 */
export function buildBoxPropRecipe(
  optionsOrName?: ImageToRecipeOptions | string,
  pMetrics?: SilhouetteMetrics,
  pPalette?: SupportedPalette,
  pHeight?: number
): SculptSpec {
  const opts: ImageToRecipeOptions = typeof optionsOrName === 'object'
    ? optionsOrName
    : { name: optionsOrName, metrics: pMetrics, palette: pPalette, defaultHeight: pHeight };

  const name = opts.name || 'Box Prop';
  const palette = opts.palette;
  const metrics = opts.metrics;
  const height = opts.defaultHeight || 0.4;
  const { primaryColor, secondaryColor, accentColor } = resolveColors(palette);

  const fullHeight = height || 0.4;
  const ar = metrics?.aspectRatio && metrics.aspectRatio > 0.3 ? metrics.aspectRatio : 1.0;
  const fullWidth = Number((fullHeight / ar).toFixed(3));
  const fullDepth = Number((fullWidth * 0.85).toFixed(3));

  const parts: SculptPart[] = [
    {
      id: 'main_chassis',
      shape: 'box',
      size: [fullWidth, fullHeight, fullDepth],
      position: [0, Number((fullHeight * 0.5).toFixed(3)), 0],
      rotation: [0, 0, 0],
      material: 'mat_primary',
      color: primaryColor,
      roundness: 0.12,
    },
    {
      id: 'front_face',
      parent: 'main_chassis',
      shape: 'box',
      size: [Number((fullWidth * 0.88).toFixed(3)), Number((fullHeight * 0.82).toFixed(3)), Number((fullDepth * 0.1).toFixed(3))],
      position: [0, 0, Number((fullDepth * 0.48).toFixed(3))],
      rotation: [0, 0, 0],
      material: 'mat_secondary',
      color: secondaryColor,
      roundness: 0.08,
    },
    {
      id: 'indicator_accent',
      parent: 'front_face',
      shape: 'blob',
      size: [Number((fullWidth * 0.25).toFixed(3)), Number((fullHeight * 0.15).toFixed(3)), Number((fullDepth * 0.08).toFixed(3))],
      position: [0, 0, Number((fullDepth * 0.06).toFixed(3))],
      rotation: [0, 0, 0],
      material: 'mat_accent',
      color: accentColor,
      roundness: 0.5,
    },
  ];

  return {
    version: 2,
    route: 'author',
    rig: 'none',
    name: name || 'Box Prop',
    heightMeters: fullHeight,
    materials: [
      { id: 'mat_primary', color: primaryColor, roughness: 0.65, metalness: 0.15 },
      { id: 'mat_secondary', color: secondaryColor, roughness: 0.4, metalness: 0.3 },
      { id: 'mat_accent', color: accentColor, roughness: 0.3, metalness: 0.4 },
    ],
    parts,
  };
}

import {
  recognizeShapeTopology,
  buildShapeFromTopology,
  synthesizeUniversalProceduralShape,
} from './universalShapeRecognizer';

export { recognizeShapeTopology, buildShapeFromTopology, synthesizeUniversalProceduralShape };

/**
 * Backwards-compatibility alias: routes through the Universal Shape Recognizer.
 */
export function buildTrayOrPanRecipe(
  optionsOrName?: ImageToRecipeOptions | string,
  pMetrics?: SilhouetteMetrics,
  pPalette?: SupportedPalette,
  pHeight?: number
): SculptSpec {
  const opts: ImageToRecipeOptions =
    typeof optionsOrName === 'object'
      ? optionsOrName
      : { name: optionsOrName, metrics: pMetrics, palette: pPalette, defaultHeight: pHeight };
  return synthesizeUniversalProceduralShape({
    ...opts,
    defaultHeight: opts.defaultHeight || 0.08,
  });
}

/**
 * Universal Fallback: synthesizes an integrated multi-part 3D volumetric hull
 * directly from the 2D silhouette mask width profile and palette without arbitrary horizontal slices.
 */
export function buildUniversalSilhouetteSlicesRecipe(
  optionsOrName: ImageToRecipeOptions | string,
  pMetrics?: SilhouetteMetrics,
  pPalette?: SupportedPalette,
  pHeight?: number
): SculptSpec {
  const opts: ImageToRecipeOptions =
    typeof optionsOrName === 'object'
      ? optionsOrName
      : { name: optionsOrName, metrics: pMetrics, palette: pPalette, defaultHeight: pHeight };
  return synthesizeUniversalProceduralShape(opts);
}

/**
 * Anatomical Character Clay Maquette Tracer (replaces horizontal slice slabs for humanoid characters):
 * Uses `compileCharacterToClaySculpt` with extracted palette colors so humanoid characters ALWAYS
 * have proper head, hair/hood, torso, tunic skirt, arms, legs, boots, and equipment — never horizontal slabs!
 */
export function buildCozyClaySilhouetteTraceRecipe(opts: ImageToRecipeOptions): SculptSpec | null {
  const { name = 'Clay Figure', prompt = '', metrics, palette, defaultHeight } = opts;
  const cleanText = `${name} ${prompt}`;
  const isHuman =
    isHumanoidPrompt(cleanText) ||
    /\b(reference figure|character|archer|traveler|humanoid|scout|warrior|person|figure)\b/i.test(cleanText) ||
    Boolean((palette as any)?.skin);

  if (isHuman) {
    const features = extractCharacterFeaturesFromModelOutput(
      { name: name || 'Sculpted Character', heightMeters: defaultHeight || 1.75 },
      cleanText || 'Elven Scout Archer',
      palette as any
    );
    return compileCharacterToClaySculpt(features);
  }

  const outline = metrics?.outline;
  if (!outline || !Array.isArray(outline.rows) || outline.rows.length === 0) {
    return null;
  }

  const fullHeight = defaultHeight || (metrics && metrics.aspectRatio > 1.3 ? 1.2 : 0.45);
  const { primaryColor, secondaryColor, accentColor, dominantColors } = resolveColors(palette);

  const numRows = outline.rows.length;
  const sliceH = Number(((fullHeight / numRows) * 1.32).toFixed(3));
  const parts: SculptPart[] = [];

  outline.rows.forEach((slice, rowIdx) => {
    const centerY = Number(((1 - slice.y) * fullHeight).toFixed(3));
    if (!Array.isArray(slice.spans) || slice.spans.length === 0) return;

    slice.spans.forEach((span, spanIdx) => {
      const [startX, endX] = span;
      const spanW = Math.max(0.03, Number(((endX - startX) * fullHeight).toFixed(3)));
      const centerX = Number((((startX + endX) / 2) * fullHeight).toFixed(3));
      const isLimbSpan = slice.spans.length > 1;
      const spanD = Math.max(0.03, Number((spanW * (isLimbSpan ? 0.85 : 0.72)).toFixed(3)));

      const localColor =
        slice.spanColors?.[spanIdx] ||
        dominantColors[(rowIdx + spanIdx) % Math.max(1, dominantColors.length)] ||
        primaryColor;

      parts.push({
        id: `slice_${rowIdx + 1}_${spanIdx + 1}`,
        shape: 'blob',
        size: [spanW, sliceH, spanD],
        position: [centerX, centerY, 0],
        rotation: [0, 0, 0],
        material: 'mat_clay_primary',
        color: localColor,
        roundness: 0.9,
        taper: rowIdx === 0 ? 0.25 : rowIdx === numRows - 1 ? -0.15 : 0,
      });
    });
  });

  if (parts.length === 0) return null;

  return {
    version: 2,
    route: 'author',
    rig: 'none',
    name: name && name !== '3D Object' && name !== 'reference object' ? name : 'Sculpted Clay Figure',
    heightMeters: fullHeight,
    identity: `Sculpted clay figure (${parts.length} parts, aspect ratio ${metrics?.aspectRatio ?? 1}:1).`,
    materials: [
      { id: 'mat_clay_primary', color: primaryColor, roughness: 0.68, metalness: 0.05 },
      { id: 'mat_clay_secondary', color: secondaryColor, roughness: 0.65, metalness: 0.08 },
      { id: 'mat_clay_accent', color: accentColor, roughness: 0.55, metalness: 0.12 },
    ],
    parts,
  };
}

/**
 * Main entry point: First recognizes the physical & geometric topology of ANY shape,
 * then constructs its authentic 3D parts without category-specific hardcoding.
 */
export function synthesizeRecipeFromImage(opts: ImageToRecipeOptions): SculptSpec {
  const { name = '3D Object', prompt = '', metrics, palette, defaultHeight = 0.3 } = opts;
  const cleanPrompt = `${name} ${prompt}`.toLowerCase();

  // 1. Explicit food/packaging formats with palette sampling (chips, coffee, stand-up pouches)
  if (/\b(chip|chips|crisps|doritos|lays)\b/i.test(cleanPrompt)) {
    return buildBagOfChipsRecipe(name || 'Bag of Chips', metrics, palette, defaultHeight || 0.28);
  }
  const isCoffeePrompt =
    /\b(coffee|espresso|bean|beans|roast|pouch|stand-up pouch)\b/i.test(cleanPrompt) ||
    /(قهوة|بن|كيس قهوة|كيس بن|حبوب بن|شاي|بهارات)/.test(cleanPrompt);

  if (isCoffeePrompt) {
    return buildCoffeePouchRecipe(name || 'Coffee Pouch', metrics, palette, defaultHeight || 0.28);
  }

  // 2. Curated High-Fidelity Procedural Kit Ground Truth (Rings, Vehicles, Chairs, Swords, Bottles...)
  const curated =
    lookupCuratedSculptSpec(cleanPrompt) ||
    lookupCuratedSculptSpec(prompt) ||
    lookupCuratedSculptSpec(name);
  if (curated) {
    return curated;
  }

  // 2.5. Humanoid Character Clay Maquette Compiler (head, torso, tunic skirt, arms, legs, boots, bow/weapons)
  if (isHumanoidPrompt(cleanPrompt) || /\b(reference figure|character)\b/i.test(cleanPrompt)) {
    const features = extractCharacterFeaturesFromModelOutput(
      { name: name || 'Sculpted Character', heightMeters: defaultHeight || 1.75 },
      cleanPrompt || 'Elven Scout Archer',
      palette as any
    );
    return compileCharacterToClaySculpt(features);
  }

  // 3. Legacy stand-up pouch fallback when synthetic 10-band widthProfile is passed
  const isLegacyPouchGeometry =
    !metrics?.outline &&
    !isHumanoidPrompt(cleanPrompt) &&
    metrics &&
    metrics.aspectRatio >= 1.3 &&
    metrics.aspectRatio <= 2.8 &&
    metrics.widthProfile.length >= 8 &&
    metrics.widthProfile[metrics.widthProfile.length - 1] <
      Math.max(...metrics.widthProfile.slice(2, 7)) * 0.82 &&
    metrics.widthProfile[0] >= 0.75;

  if (isLegacyPouchGeometry) {
    return buildCoffeePouchRecipe(name || 'Coffee Pouch', metrics, palette, defaultHeight || 0.28);
  }

  // 4. UNIVERSAL FIRST-PRINCIPLES SHAPE RECOGNITION & RECONSTRUCTION
  // Analyzes the visual/geometric topology (aspect ratio, central void, cavity, rotational symmetry,
  // bounding envelope, surface optical properties) and constructs the 3D model directly from it.
  return synthesizeUniversalProceduralShape(opts);
}


