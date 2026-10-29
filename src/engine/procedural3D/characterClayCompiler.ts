/**
 * Character Clay Compiler
 *
 * Translates semantic character features (extracted by vision or directorial prompts)
 * into an authentic parametric clay 3D sculpt recipe with:
 * - Real anthropometric proportions (humanoid bone rigging)
 * - Superellipsoid anatomy with continuous vertical tapering
 * - Layered clothing (tunics, robes, belts, bracers, boots) with CSG cutters
 * - Handheld and back-mounted equipment (recurve bow, quiver with arrows)
 * - Sampled hex color palette applied to tactile clay PBR materials
 */
import { SculptSpec, SculptPart } from './sculptSpec';
import type { PartGradient } from './clayMaterial';

export interface CharacterVisualFeatures {
  name: string;
  archetype?: string;
  gender?: 'female' | 'male' | 'neutral';
  heightMeters?: number;
  palette: {
    skin: string;
    hair: string;
    primaryClothing: string;
    secondaryClothing?: string;
    leather: string;
    metal: string;
    weaponWood?: string;
    weaponAccent?: string;
  };
  costume: {
    hasHat?: boolean;
    hatStyle?: 'fedora' | 'cap' | 'tophat' | 'cowboy' | 'beanie';
    hatColor?: string;
    hasHelmet?: boolean;
    hasCrown?: boolean;
    hasGlasses?: boolean;
    hasBackpack?: boolean;
    hasHair?: boolean;
    hasCuirass?: boolean;
    hasBoots?: boolean;
    selectiveMode?: boolean;
    hasHood?: boolean;
    hasCowl?: boolean;
    hasBelt?: boolean;
    hasBracers?: boolean;
    hasCape?: boolean;
    lowerGarment?: 'skirt' | 'robe' | 'trousers' | 'none';
    hasAntlersOrPins?: boolean;
  };
  equipment: {
    hasBow?: boolean;
    hasQuiver?: boolean;
    hasStaff?: boolean;
    hasSword?: boolean;
    hasShield?: boolean;
    hasGun?: boolean;
  };
  proportions?: {
    shoulderWidthRatio?: number; // 0.8..1.2
    torsoLengthRatio?: number;
    skirtFlare?: number; // 0.2..0.8
  };
}

export function hasRequestedCharacterAccessories(features?: CharacterVisualFeatures | null): boolean {
  if (!features) return false;
  const c = features.costume || {};
  const e = features.equipment || {};
  return Boolean(
    c.hasHat ||
    c.hasHelmet ||
    c.hasCrown ||
    c.hasGlasses ||
    c.hasHood ||
    c.hasCape ||
    c.hasBackpack ||
    c.hasHair ||
    c.hasCuirass ||
    e.hasBow ||
    e.hasQuiver ||
    e.hasStaff ||
    e.hasSword ||
    e.hasShield ||
    e.hasGun
  );
}

export function createDefaultCharacterFeatures(partial?: Partial<CharacterVisualFeatures>): CharacterVisualFeatures {
  const p = partial || {};
  return {
    name: p.name || 'Hero Character',
    archetype: p.archetype || 'archer',
    gender: p.gender || 'female',
    heightMeters: p.heightMeters || 1.75,
    palette: {
      skin: p.palette?.skin || '#f3ceb2',
      hair: p.palette?.hair || '#ad8748',
      primaryClothing: p.palette?.primaryClothing || '#2e4e3f',
      secondaryClothing: p.palette?.secondaryClothing || '#3d6350',
      leather: p.palette?.leather || '#4a3321',
      metal: p.palette?.metal || '#c2a649',
      weaponWood: p.palette?.weaponWood || '#4a2810',
      weaponAccent: p.palette?.weaponAccent || '#e5e7eb',
    },
    costume: {
      hasHat: p.costume?.hasHat ?? false,
      hatStyle: p.costume?.hatStyle,
      hatColor: p.costume?.hatColor,
      hasHelmet: p.costume?.hasHelmet ?? false,
      hasCrown: p.costume?.hasCrown ?? false,
      hasGlasses: p.costume?.hasGlasses ?? false,
      hasBackpack: p.costume?.hasBackpack ?? false,
      hasHair: p.costume?.hasHair ?? true,
      hasCuirass: p.costume?.hasCuirass ?? true,
      hasBoots: p.costume?.hasBoots ?? true,
      selectiveMode: p.costume?.selectiveMode ?? false,
      hasHood: p.costume?.hasHood ?? true,
      hasCowl: p.costume?.hasCowl ?? true,
      hasBelt: p.costume?.hasBelt ?? true,
      hasBracers: p.costume?.hasBracers ?? true,
      hasCape: p.costume?.hasCape ?? false,
      lowerGarment: p.costume?.lowerGarment ?? 'skirt',
      hasAntlersOrPins: p.costume?.hasAntlersOrPins ?? true,
    },
    equipment: {
      hasBow: p.equipment?.hasBow ?? true,
      hasQuiver: p.equipment?.hasQuiver ?? true,
      hasStaff: p.equipment?.hasStaff ?? false,
      hasSword: p.equipment?.hasSword ?? false,
      hasShield: p.equipment?.hasShield ?? false,
      hasGun: p.equipment?.hasGun ?? false,
    },
    proportions: p.proportions,
  };
}

/**
 * Extracts structured character features from unstructured or semantic LLM/VLM outputs.
 * Robustly parses layer lists, character profiles, free-form text, and prompt keywords.
 */
export function extractCharacterFeaturesFromModelOutput(
  raw: any,
  prompt: string,
  fallbackPalette?: Partial<CharacterVisualFeatures['palette']>
): CharacterVisualFeatures {
  const textContext = `${prompt} ${typeof raw === 'string' ? raw : JSON.stringify(raw || '')}`.toLowerCase();

  const isFullFantasyArchetype =
    /\b(elf|elven|archer|scout|huntress|knight|warrior|wizard|mage|paladin|cleric|druid|assassin)\b/i.test(textContext);

  // Detect gender
  const isFemale =
    raw?.gender === 'female' ||
    /\b(female|woman|girl|huntress|maiden|elf\b|elven\b)/i.test(prompt) ||
    !/\b(male|man|boy|guy|gentleman)\b/i.test(prompt);

  // Detect headwear & accessories
  const hasHat =
    raw?.costume?.hasHat ??
    (/\b(hat|fedora|cowboy|cap|beret|beanie|tophat|top hat|sombrero|sunhat|brim)\b/i.test(textContext) ||
      /(قبعة|طاقية)/.test(textContext));

  let hatStyle: 'fedora' | 'cap' | 'tophat' | 'cowboy' | 'beanie' = 'fedora';
  if (/\b(cap|baseball)\b/i.test(textContext)) hatStyle = 'cap';
  else if (/\b(tophat|top hat|cylinder hat)\b/i.test(textContext)) hatStyle = 'tophat';
  else if (/\b(cowboy|western|sombrero)\b/i.test(textContext)) hatStyle = 'cowboy';
  else if (/\b(beanie|beret)\b/i.test(textContext)) hatStyle = 'beanie';

  let hatColor = raw?.costume?.hatColor;
  if (!hatColor) {
    if (/\b(red|crimson|scarlet)\b/i.test(textContext)) hatColor = '#dc2626';
    else if (/\b(blue|navy|azure)\b/i.test(textContext)) hatColor = '#2563eb';
    else if (/\b(green|emerald|olive)\b/i.test(textContext)) hatColor = '#16a34a';
    else if (/\b(white|cream|ivory)\b/i.test(textContext)) hatColor = '#f8fafc';
    else if (/\b(yellow|gold|golden|straw)\b/i.test(textContext)) hatColor = '#eab308';
    else if (/\b(brown|tan|leather|khak[iy])\b/i.test(textContext)) hatColor = '#6b4226';
    else if (/\b(purple|violet)\b/i.test(textContext)) hatColor = '#7c3aed';
    else hatColor = '#27272a';
  }

  const hasHelmet =
    raw?.costume?.hasHelmet ??
    (/\b(helmet|helm|visor|spartan|astronaut)\b/i.test(textContext) || /خوذة/.test(textContext));

  const hasCrown =
    raw?.costume?.hasCrown ??
    (/\b(crown|tiara|diadem|king|queen|royal)\b/i.test(textContext) || /تاج/.test(textContext));

  const hasGlasses =
    raw?.costume?.hasGlasses ??
    (/\b(glasses|sunglasses|spectacles|goggles|eyewear|shades)\b/i.test(textContext) || /(نظارة|نظارات)/.test(textContext));

  const hasBackpack =
    raw?.costume?.hasBackpack ??
    (/\b(backpack|rucksack|knapsack|schoolbag|satchel)\b/i.test(textContext) || /حقيبة/.test(textContext));

  const hasCape =
    raw?.costume?.hasCape ??
    (/\b(cape|cloak|mantle|poncho)\b/i.test(textContext) || /(عباءة|رداء)/.test(textContext));

  // Detect equipment
  const hasBow =
    raw?.equipment?.hasBow ??
    raw?.equipment?.bow ??
    /\b(bow|archer|scout|hunt|arrow|quiver)\b/i.test(textContext);
  const hasQuiver =
    raw?.equipment?.hasQuiver ??
    raw?.equipment?.quiver ??
    (hasBow || /\b(quiver|arrows)\b/i.test(textContext));
  const hasStaff =
    raw?.equipment?.hasStaff ??
    (/\b(staff|wand|wizard|mage|cleric|cane|spear|scepter)\b/i.test(textContext) || /(عصا|رمح)/.test(textContext));
  const hasSword =
    raw?.equipment?.hasSword ??
    (/\b(sword|blade|knight|warrior|katana|dagger|saber|rapier)\b/i.test(textContext) || /(سيف|خنجر)/.test(textContext));
  const hasShield =
    raw?.equipment?.hasShield ??
    (/\b(shield|buckler|knight)\b/i.test(textContext) || /ترس/.test(textContext));
  const hasGun =
    raw?.equipment?.hasGun ??
    (/\b(gun|pistol|revolver|rifle|blaster|shotgun)\b/i.test(textContext) || /(مسدس|بندقية)/.test(textContext));

  // Detect costume
  const hasHood =
    raw?.costume?.hasHood ??
    /\b(hood|hooded|cowl|cloak|mantle|scout|assassin|stealth)\b/i.test(textContext);
  const hasCowl = raw?.costume?.hasCowl ?? (isFullFantasyArchetype ? hasHood : /\b(scarf|cowl|bandana)\b/i.test(textContext));
  const hasAntlersOrPins =
    raw?.costume?.hasAntlersOrPins ??
    /\b(elf|elven|antler|pin|circlet|nature|druid)\b/i.test(textContext);
  const hasHair =
    raw?.costume?.hasHair ??
    (isFullFantasyArchetype || /\b(hair|braid|ponytail|bun|afro|wig)\b/i.test(textContext) || /شعر/.test(textContext));
  const hasCuirass =
    raw?.costume?.hasCuirass ??
    (isFullFantasyArchetype || /\b(armor|cuirass|vest|chestplate|tunic|jacket|coat|trenchcoat|suit|shirt|sweater)\b/i.test(textContext) || /(درع|معطف|جاكيت|بدلة)/.test(textContext));
  const hasBelt =
    raw?.costume?.hasBelt ??
    (isFullFantasyArchetype || /\b(belt|harness|strap|sash|holster)\b/i.test(textContext));
  const hasBracers =
    raw?.costume?.hasBracers ??
    (isFullFantasyArchetype || /\b(bracer|gauntlet|wristband|gloves)\b/i.test(textContext));
  const hasBoots =
    raw?.costume?.hasBoots ??
    (isFullFantasyArchetype || /\b(boot|boots|shoes|sneakers|greaves)\b/i.test(textContext));

  let lowerGarment: 'skirt' | 'robe' | 'trousers' | 'none' = isFullFantasyArchetype ? 'skirt' : 'none';
  if (/\b(robe|gown|dress|wizard)\b/i.test(textContext)) {
    lowerGarment = 'robe';
  } else if (/\b(pants|trousers|breeches|armor|knight|jeans)\b/i.test(textContext)) {
    lowerGarment = 'trousers';
  } else if (/\b(skirt|kilt|tunic)\b/i.test(textContext)) {
    lowerGarment = 'skirt';
  }

  // Detect or sample palette
  const rawPal = raw?.palette || raw?.colors || {};
  const palette: CharacterVisualFeatures['palette'] = {
    skin: rawPal.skin || fallbackPalette?.skin || '#f3ceb2',
    hair: rawPal.hair || fallbackPalette?.hair || '#ad8748',
    primaryClothing: rawPal.primaryClothing || rawPal.tunic || rawPal.clothing || fallbackPalette?.primaryClothing || '#2e4e3f',
    secondaryClothing: rawPal.secondaryClothing || fallbackPalette?.secondaryClothing || '#3d6350',
    leather: rawPal.leather || rawPal.straps || fallbackPalette?.leather || '#4a3321',
    metal: rawPal.metal || rawPal.armor || fallbackPalette?.metal || '#c2a649',
    weaponWood: rawPal.weaponWood || rawPal.wood || fallbackPalette?.weaponWood || '#4a2810',
    weaponAccent: rawPal.weaponAccent || fallbackPalette?.weaponAccent || '#e5e7eb',
  };

  const name = raw?.name || raw?.subject || prompt.replace(/[^\w\s-]/g, '').trim().slice(0, 48) || 'Clay Character';

  return {
    name,
    archetype: raw?.archetype || (hasBow ? 'archer' : hasStaff ? 'mage' : hasSword ? 'warrior' : 'scout'),
    gender: isFemale ? 'female' : 'male',
    heightMeters: typeof raw?.heightMeters === 'number' ? raw.heightMeters : 1.75,
    palette,
    costume: {
      hasHat: Boolean(hasHat),
      hatStyle,
      hatColor,
      hasHelmet: Boolean(hasHelmet),
      hasCrown: Boolean(hasCrown),
      hasGlasses: Boolean(hasGlasses),
      hasBackpack: Boolean(hasBackpack),
      hasHair: Boolean(hasHair),
      hasCuirass: Boolean(hasCuirass),
      hasBoots: Boolean(hasBoots),
      selectiveMode: !isFullFantasyArchetype,
      hasHood: Boolean(hasHood),
      hasCowl: Boolean(hasCowl),
      hasBelt: Boolean(hasBelt),
      hasBracers: Boolean(hasBracers),
      hasCape: Boolean(hasCape),
      lowerGarment,
      hasAntlersOrPins: Boolean(hasAntlersOrPins),
    },
    equipment: {
      hasBow: Boolean(hasBow),
      hasQuiver: Boolean(hasQuiver),
      hasStaff: Boolean(hasStaff),
      hasSword: Boolean(hasSword),
      hasShield: Boolean(hasShield),
      hasGun: Boolean(hasGun),
    },
    proportions: raw?.proportions,
  };
}

export function compileCharacterToClaySculpt(inputFeatures: CharacterVisualFeatures): SculptSpec {
  const features = createDefaultCharacterFeatures(inputFeatures);
  const height = features.heightMeters || 1.75;
  const isFemale = features.gender === 'female';
  const pal = features.palette;

  const parts: SculptPart[] = [];

  // 1. Pelvis / Hips (Root of humanoid motion & posing)
  const pelvisY = 0.92;
  const hipWidth = isFemale ? 0.32 : 0.28;
  parts.push({
    id: 'pelvis',
    shape: 'blob',
    size: [hipWidth, 0.18, 0.22],
    position: [0, pelvisY, 0],
    rotation: [0, 0, 0],
    material: 'mat_pelvis',
    color: pal.primaryClothing,
    roundness: 0.35,
    bone: 'Hips',
  });

  // 2. Torso / Abdomen
  const spineY = 1.08;
  parts.push({
    id: 'abdomen',
    parent: 'pelvis',
    shape: 'blob',
    size: [isFemale ? 0.26 : 0.3, 0.2, 0.2],
    position: [0, spineY, 0],
    rotation: [0, 0, 0],
    material: 'mat_tunic',
    color: pal.primaryClothing,
    roundness: 0.3,
    taper: 0.2,
    bone: 'Spine',
  });

  // 3. Chest / Bust with Leather Harness
  const chestY = 1.28;
  const chestWidth = (isFemale ? 0.34 : 0.4) * (features.proportions?.shoulderWidthRatio || 1.0);
  parts.push({
    id: 'chest',
    parent: 'abdomen',
    shape: 'blob',
    size: [chestWidth, 0.28, 0.24],
    position: [0, chestY, 0],
    rotation: [0, 0, 0],
    material: 'mat_tunic',
    color: pal.primaryClothing,
    roundness: 0.32,
    taper: -0.15,
    bone: 'Chest',
  });

  // Leather Chest Harness & Buckles
  if (features.costume.hasBelt !== false) {
    // Cross-chest strap
    parts.push({
      id: 'harness_strap',
      parent: 'chest',
      shape: 'blob',
      size: [chestWidth * 0.95, 0.06, 0.25],
      position: [0, chestY + 0.02, 0.01],
      rotation: [0, 0, 24],
      material: 'mat_leather',
      color: pal.leather,
      roundness: 0.2,
    });

    // Waist Belt
    parts.push({
      id: 'waist_belt',
      parent: 'abdomen',
      shape: 'torus',
      size: [0.32, 0.06, 0],
      position: [0, spineY - 0.04, 0],
      rotation: [90, 0, 0],
      material: 'mat_leather',
      color: pal.leather,
    });

    // Brass Belt Buckle
    parts.push({
      id: 'belt_buckle',
      parent: 'waist_belt',
      shape: 'blob',
      size: [0.07, 0.05, 0.02],
      position: [0, spineY - 0.04, 0.14],
      rotation: [0, 0, 0],
      material: 'mat_metal',
      color: pal.metal,
      roundness: 0.15,
    });
  }

  // 4. Lower Garment (Flared Tunic Skirt / Robe)
  const garmentType = features.costume.lowerGarment || 'skirt';
  if (garmentType === 'skirt' || garmentType === 'robe') {
    const flare = features.proportions?.skirtFlare || 0.45;
    parts.push({
      id: 'tunic_skirt',
      parent: 'pelvis',
      shape: 'blob',
      size: [0.42 * (1 + flare), 0.48, 0.34 * (1 + flare)],
      position: [0, 0.68, 0],
      rotation: [0, 0, 0],
      material: 'mat_tunic',
      color: pal.primaryClothing,
      roundness: 0.25,
      taper: -0.4, // negative taper: flares out downward
      gradient: {
        color: pal.secondaryClothing || pal.primaryClothing,
        axis: 'y',
        from: 0.2,
        to: 0.9,
      } as PartGradient,
    });

    // CSG Cutter: Front slit in the skirt for mobility
    parts.push({
      id: 'skirt_slit_cutter',
      parent: 'tunic_skirt',
      op: 'subtract',
      shape: 'blob',
      size: [0.1, 0.35, 0.25],
      position: [0, 0.55, 0.15],
      rotation: [0, 0, 0],
      material: 'mat_tunic',
    });
  }

  // 5. Neck, Head, Hair & Cowl
  const neckY = 1.46;
  parts.push({
    id: 'neck',
    parent: 'chest',
    shape: 'cylinder',
    size: [0.1, 0.1, 0.1],
    position: [0, neckY, 0],
    rotation: [0, 0, 0],
    material: 'mat_skin',
    color: pal.skin,
    bone: 'Neck',
  });

  const headY = 1.62;
  parts.push({
    id: 'head',
    parent: 'neck',
    shape: 'blob',
    size: [0.18, 0.22, 0.2],
    position: [0, headY, 0.02],
    rotation: [0, 0, 0],
    material: 'mat_skin',
    color: pal.skin,
    roundness: 0.3,
    taper: 0.15,
    bone: 'Head',
  });

  // Hair / Hood
  if (features.costume.hasHood) {
    parts.push({
      id: 'cowl_hood',
      parent: 'head',
      shape: 'blob',
      size: [0.24, 0.28, 0.26],
      position: [0, headY + 0.03, -0.02],
      rotation: [0, 0, 0],
      material: 'mat_hair',
      color: pal.hair,
      roundness: 0.35,
      taper: -0.2,
    });
  } else {
    parts.push({
      id: 'hair_style',
      parent: 'head',
      shape: 'blob',
      size: [0.21, 0.22, 0.22],
      position: [0, headY + 0.03, -0.02],
      rotation: [0, 0, 0],
      material: 'mat_hair',
      color: pal.hair,
      roundness: 0.4,
    });
  }

  // Shoulder Cowl / Mantle
  if (features.costume.hasCowl !== false) {
    parts.push({
      id: 'shoulder_cowl',
      parent: 'neck',
      shape: 'torus',
      size: [0.38, 0.12, 0],
      position: [0, neckY - 0.02, 0],
      rotation: [90, 0, 0],
      material: 'mat_tunic',
      color: pal.primaryClothing,
    });
  }

  // Antler / Pin Accessories
  if (features.costume.hasAntlersOrPins) {
    parts.push({
      id: 'antler_pin',
      parent: 'head',
      shape: 'cylinder',
      size: [0.015, 0.25, 0.015],
      position: [0.08, headY + 0.16, 0.02],
      rotation: [15, 0, -35],
      material: 'mat_wood',
      color: pal.weaponWood || '#5c3a21',
      mirrorX: true,
      taper: 0.6,
    });
  }

  // 6. Shoulders, Arms, Leather Bracers, Hands (Bilateral Mirrored across x=0)
  const armSpread = chestWidth * 0.65;
  parts.push({
    id: 'shoulder',
    parent: 'chest',
    shape: 'blob',
    size: [0.12, 0.12, 0.12],
    position: [armSpread, chestY + 0.08, 0],
    rotation: [0, 0, 0],
    material: 'mat_tunic',
    color: pal.primaryClothing,
    roundness: 0.4,
    mirrorX: true,
    bone: 'LeftShoulder',
  });

  parts.push({
    id: 'upper_arm',
    parent: 'shoulder',
    shape: 'cylinder',
    size: [0.09, 0.26, 0.09],
    position: [armSpread + 0.04, chestY - 0.08, 0],
    rotation: [0, 0, -10],
    material: 'mat_tunic',
    color: pal.primaryClothing,
    taper: 0.15,
    mirrorX: true,
    bone: 'LeftArm',
  });

  parts.push({
    id: 'forearm',
    parent: 'upper_arm',
    shape: 'cylinder',
    size: [0.08, 0.24, 0.08],
    position: [armSpread + 0.07, chestY - 0.32, 0.02],
    rotation: [0, 0, -8],
    material: 'mat_leather',
    color: pal.leather, // Leather bracer
    taper: 0.2,
    mirrorX: true,
    bone: 'LeftForeArm',
  });

  parts.push({
    id: 'hand',
    parent: 'forearm',
    shape: 'blob',
    size: [0.065, 0.09, 0.04],
    position: [armSpread + 0.08, chestY - 0.48, 0.04],
    rotation: [0, 0, 0],
    material: 'mat_skin',
    color: pal.skin,
    roundness: 0.3,
    mirrorX: true,
    bone: 'LeftHand',
  });

  // 7. Legs & Wrapped Leather Boots (Bilateral Mirrored across x=0)
  const legSpread = hipWidth * 0.42;
  parts.push({
    id: 'thigh',
    parent: 'pelvis',
    shape: 'blob',
    size: [0.14, 0.42, 0.15],
    position: [legSpread, 0.72, 0],
    rotation: [0, 0, 0],
    material: 'mat_tunic',
    color: pal.primaryClothing,
    roundness: 0.3,
    mirrorX: true,
    bone: 'LeftUpLeg',
  });

  parts.push({
    id: 'shin',
    parent: 'thigh',
    shape: 'cylinder',
    size: [0.11, 0.38, 0.11],
    position: [legSpread, 0.34, 0],
    rotation: [0, 0, 0],
    material: 'mat_tunic',
    color: pal.primaryClothing,
    taper: 0.15,
    mirrorX: true,
    bone: 'LeftLeg',
  });

  parts.push({
    id: 'boot',
    parent: 'shin',
    shape: 'blob',
    size: [0.11, 0.16, 0.22],
    position: [legSpread, 0.08, 0.04],
    rotation: [0, 0, 0],
    material: 'mat_leather',
    color: pal.leather,
    roundness: 0.28,
    mirrorX: true,
    bone: 'LeftFoot',
  });

  // 8. Handheld & Back-Mounted Gear
  // Back Quiver with Arrows
  if (features.equipment.hasQuiver !== false) {
    parts.push({
      id: 'quiver',
      parent: 'chest',
      shape: 'cylinder',
      size: [0.1, 0.65, 0.1],
      position: [-0.1, chestY + 0.05, -0.16],
      rotation: [15, 0, -25],
      material: 'mat_leather',
      color: pal.leather,
      taper: -0.2, // wider opening at the top
    });

    parts.push({
      id: 'arrow_bundle',
      parent: 'quiver',
      shape: 'cylinder',
      size: [0.06, 0.24, 0.06],
      position: [-0.14, chestY + 0.42, -0.18],
      rotation: [15, 0, -25],
      material: 'mat_wood',
      color: pal.weaponWood || '#5c3a21',
    });

    parts.push({
      id: 'arrow_fletching',
      parent: 'arrow_bundle',
      shape: 'blob',
      size: [0.08, 0.12, 0.08],
      position: [-0.15, chestY + 0.52, -0.19],
      rotation: [15, 0, -25],
      material: 'mat_feather',
      color: pal.weaponAccent || '#e5e7eb',
      roundness: 0.2,
    });
  }

  // Recurve Hunting Bow in Hand
  if (features.equipment.hasBow !== false) {
    parts.push({
      id: 'recurve_bow',
      parent: 'hand',
      shape: 'cylinder',
      size: [0.035, 1.18, 0.035],
      position: [armSpread + 0.12, chestY - 0.44, 0.08],
      rotation: [12, 10, 6],
      material: 'mat_wood',
      color: pal.weaponWood || '#4a2810',
      taper: 0.3,
    });

    // Bowstring
    parts.push({
      id: 'bow_string',
      parent: 'recurve_bow',
      shape: 'cylinder',
      size: [0.005, 1.14, 0.005],
      position: [armSpread + 0.12, chestY - 0.44, 0.02],
      rotation: [12, 10, 6],
      material: 'mat_string',
      color: '#e5e7eb',
    });
  }

  const materials = [
    { id: 'mat_skin', color: pal.skin, roughness: 0.65, metalness: 0.0 },
    { id: 'mat_hair', color: pal.hair, roughness: 0.85, metalness: 0.0 },
    { id: 'mat_tunic', color: pal.primaryClothing, roughness: 0.82, metalness: 0.02 },
    { id: 'mat_pelvis', color: pal.primaryClothing, roughness: 0.82, metalness: 0.02 },
    { id: 'mat_leather', color: pal.leather, roughness: 0.55, metalness: 0.05 },
    { id: 'mat_metal', color: pal.metal, roughness: 0.25, metalness: 0.9 },
    { id: 'mat_wood', color: pal.weaponWood || '#5c3a21', roughness: 0.68, metalness: 0.0 },
    { id: 'mat_feather', color: pal.weaponAccent || '#e5e7eb', roughness: 0.9, metalness: 0.0 },
    { id: 'mat_string', color: '#e5e7eb', roughness: 0.7, metalness: 0.0 },
  ];

  return {
    version: 2,
    name: features.name || 'Clay Character',
    route: 'author',
    rig: 'humanoid',
    heightMeters: height,
    identity: `${features.name} - authentic sculpted clay character with full anatomical costume and equipment layers.`,
    materials,
    parts,
  };
}
