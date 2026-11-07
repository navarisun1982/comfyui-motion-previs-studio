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
    hatStyle?:
      | 'fedora'
      | 'cap'
      | 'tophat'
      | 'cowboy'
      | 'beanie'
      | 'wizard'
      | 'toque'
      | 'hardhat'
      | 'captain'
      | 'scrubcap';
    hatColor?: string;
    hasHelmet?: boolean;
    helmetStyle?: 'knight' | 'astronaut' | 'ballistic' | 'kabuto' | 'default';
    hasCrown?: boolean;
    hasGlasses?: boolean;
    hasFaceMask?: boolean;
    hasTie?: boolean;
    hasApron?: boolean;
    hasPauldrons?: boolean;
    hasStethoscope?: boolean;
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
    hasBriefcase?: boolean;
    hasHammer?: boolean;
    hasBackKatanas?: boolean;
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
    c.hasFaceMask ||
    c.hasTie ||
    c.hasApron ||
    c.hasPauldrons ||
    c.hasStethoscope ||
    c.hasHood ||
    c.hasCape ||
    c.hasBackpack ||
    c.hasHair ||
    c.hasCuirass ||
    c.hasBelt ||
    c.hasBoots ||
    c.lowerGarment === 'robe' ||
    c.lowerGarment === 'skirt' ||
    e.hasBow ||
    e.hasQuiver ||
    e.hasStaff ||
    e.hasSword ||
    e.hasShield ||
    e.hasGun ||
    e.hasBriefcase ||
    e.hasHammer ||
    e.hasBackKatanas
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

  const isElvenArchetype =
    /\b(elf|elven|archer|huntress|druid)\b/i.test(textContext);
  const isKnight = /\b(knight|paladin|crusader|bascinet|plate armor)\b/i.test(textContext);
  const isSamurai = /\b(samurai|kabuto|lamellar|shogun)\b/i.test(textContext);
  const isNinja = /\b(ninja|shinobi|shozoku)\b/i.test(textContext) || (/\b(assassin|stealth)\b/i.test(textContext) && !isElvenArchetype);
  const isAstronaut = /\b(astronaut|spacesuit|eva\b|cosmonaut)\b/i.test(textContext);
  const isWizard = /\b(wizard|mage|sorcerer|warlock|runic)\b/i.test(textContext);
  const isDetective = /\b(detective|noir|trenchcoat|investigator|sleuth)\b/i.test(textContext);
  const isSurgeon = /\b(surgeon|doctor|physician|scrubs|surgical|medic)\b/i.test(textContext);
  const isChef = /\b(chef|toque|cook|culinary|kitchen)\b/i.test(textContext);
  const isSoldier = /\b(soldier|special forces|camouflage|ballistic|tactical plate|commando)\b/i.test(textContext);
  const isMiner = /\b(miner|hardrock|hard hat|cap lamp|underground)\b/i.test(textContext);
  const isPilot = /\b(pilot|airline|captain|epaulet|peaked cap)\b/i.test(textContext);
  const isBlacksmith = /\b(blacksmith|forge|tongs|cross-peen|anvil)\b/i.test(textContext);
  const isExecutive = /\b(executive|corporate|business suit|briefcase|businessman)\b/i.test(textContext);
  const isSteampunk = /\b(steampunk|inventor|clockwork|victorian)\b/i.test(textContext);
  const isCyberpunk = /\b(cyberpunk|cyberware|operative|neon)\b/i.test(textContext);

  const isFullCostumeArchetype =
    isElvenArchetype ||
    isKnight ||
    isSamurai ||
    isNinja ||
    isAstronaut ||
    isWizard ||
    isDetective ||
    isSurgeon ||
    isChef ||
    isSoldier ||
    isMiner ||
    isPilot ||
    isBlacksmith ||
    isExecutive ||
    isSteampunk ||
    isCyberpunk;

  // Detect gender: only default to female for elven/archer or explicit female terms
  const isFemale =
    raw?.gender === 'female' ||
    /\b(female|woman|girl|huntress|maiden|queen|lady|actress|elf\b|elven\b)\b/i.test(prompt) ||
    (isElvenArchetype && !/\b(male|man|boy|guy|gentleman)\b/i.test(prompt));

  // Detect headwear & accessories
  const hasHat =
    raw?.costume?.hasHat ??
    (isWizard ||
      isDetective ||
      isChef ||
      isMiner ||
      isPilot ||
      isSurgeon ||
      isSteampunk ||
      /\b(hat|fedora|cowboy|cap|beret|beanie|tophat|top hat|sombrero|sunhat|brim|toque|peaked cap|scrub cap)\b/i.test(textContext) ||
      /(قبعة|طاقية)/.test(textContext));

  let hatStyle:
    | 'fedora'
    | 'cap'
    | 'tophat'
    | 'cowboy'
    | 'beanie'
    | 'wizard'
    | 'toque'
    | 'hardhat'
    | 'captain'
    | 'scrubcap' = 'fedora';
  if (isWizard || /\b(wizard|witch|pointed hat)\b/i.test(textContext)) hatStyle = 'wizard';
  else if (isChef || /\b(toque|chef)\b/i.test(textContext)) hatStyle = 'toque';
  else if (isMiner || /\b(hard hat|hardhat|miner)\b/i.test(textContext)) hatStyle = 'hardhat';
  else if (isPilot || /\b(peaked cap|airline|captain)\b/i.test(textContext)) hatStyle = 'captain';
  else if (isSurgeon || /\b(scrub|surgical)\b/i.test(textContext)) hatStyle = 'scrubcap';
  else if (isSteampunk || /\b(tophat|top hat|cylinder hat)\b/i.test(textContext)) hatStyle = 'tophat';
  else if (/\b(cap|baseball)\b/i.test(textContext)) hatStyle = 'cap';
  else if (/\b(cowboy|western|sombrero)\b/i.test(textContext)) hatStyle = 'cowboy';
  else if (/\b(beanie|beret)\b/i.test(textContext)) hatStyle = 'beanie';

  let hatColor = raw?.costume?.hatColor;
  if (!hatColor) {
    if (isChef) hatColor = '#f8fafc';
    else if (isMiner) hatColor = '#eab308';
    else if (isPilot) hatColor = '#1e3a8a';
    else if (isSurgeon) hatColor = '#0284c7';
    else if (isWizard) hatColor = '#312e81';
    else if (isDetective) hatColor = '#785233';
    else if (isSteampunk) hatColor = '#451a03';
    else if (/\b(red|crimson|scarlet)\b/i.test(textContext)) hatColor = '#dc2626';
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
    (isKnight ||
      isSamurai ||
      isAstronaut ||
      isSoldier ||
      /\b(helmet|helm|visor|spartan|astronaut|kabuto|bascinet|ballistic)\b/i.test(textContext) ||
      /خوذة/.test(textContext));

  let helmetStyle: 'knight' | 'astronaut' | 'ballistic' | 'kabuto' | 'default' = 'default';
  if (isAstronaut || /\b(astronaut|spacesuit|eva)\b/i.test(textContext)) helmetStyle = 'astronaut';
  else if (isSamurai || /\b(samurai|kabuto)\b/i.test(textContext)) helmetStyle = 'kabuto';
  else if (isKnight || /\b(knight|bascinet|great helm|plate)\b/i.test(textContext)) helmetStyle = 'knight';
  else if (isSoldier || /\b(ballistic|tactical|special forces|soldier)\b/i.test(textContext)) helmetStyle = 'ballistic';

  const hasCrown =
    raw?.costume?.hasCrown ??
    (/\b(crown|tiara|diadem|king|queen|royal)\b/i.test(textContext) || /تاج/.test(textContext));

  const hasGlasses =
    raw?.costume?.hasGlasses ??
    (isSteampunk ||
      isCyberpunk ||
      /\b(glasses|sunglasses|spectacles|goggles|eyewear|shades|optic|cyberware)\b/i.test(textContext) ||
      /(نظارة|نظارات)/.test(textContext));

  const hasFaceMask =
    raw?.costume?.hasFaceMask ??
    (isNinja || isSurgeon || /\b(mask|face wrap|surgical mask|shinobi)\b/i.test(textContext));

  const hasTie =
    raw?.costume?.hasTie ??
    (isDetective || isExecutive || isPilot || /\b(tie|necktie|suit|executive|captain)\b/i.test(textContext));

  const hasApron =
    raw?.costume?.hasApron ??
    (isBlacksmith || isChef || isSteampunk || /\b(apron|blacksmith)\b/i.test(textContext));

  const hasPauldrons =
    raw?.costume?.hasPauldrons ??
    (isKnight || isSamurai || isAstronaut || isSoldier);

  const hasStethoscope =
    raw?.costume?.hasStethoscope ??
    (isSurgeon || /\b(stethoscope|surgeon|doctor)\b/i.test(textContext));

  const hasBackpack =
    raw?.costume?.hasBackpack ??
    (isAstronaut || /\b(backpack|rucksack|knapsack|schoolbag|satchel|spacesuit|eva)\b/i.test(textContext) || /حقيبة/.test(textContext));

  const hasCape =
    raw?.costume?.hasCape ??
    (isWizard || /\b(cape|cloak|mantle|poncho)\b/i.test(textContext) || /(عباءة|رداء)/.test(textContext));

  // Detect equipment
  const hasBow =
    raw?.equipment?.hasBow ??
    raw?.equipment?.bow ??
    /\b(bow|archer|huntress|arrow|quiver)\b/i.test(textContext);
  const hasQuiver =
    raw?.equipment?.hasQuiver ??
    raw?.equipment?.quiver ??
    (hasBow || /\b(quiver|arrows)\b/i.test(textContext));
  const hasStaff =
    raw?.equipment?.hasStaff ??
    (isWizard || /\b(staff|wand|wizard|mage|cleric|cane|spear|scepter)\b/i.test(textContext) || /(عصا|رمح)/.test(textContext));
  const hasSword =
    raw?.equipment?.hasSword ??
    (isKnight ||
      isSamurai ||
      /\b(sword|blade|knight|warrior|katana|dagger|saber|rapier|samurai)\b/i.test(textContext) ||
      /(سيف|خنجر)/.test(textContext));
  const hasShield =
    raw?.equipment?.hasShield ??
    (isKnight || /\b(shield|buckler|knight)\b/i.test(textContext) || /ترس/.test(textContext));
  const hasGun =
    raw?.equipment?.hasGun ??
    (isSoldier || /\b(gun|pistol|revolver|rifle|blaster|shotgun|special forces)\b/i.test(textContext) || /(مسدس|بندقية)/.test(textContext));
  const hasBriefcase =
    raw?.equipment?.hasBriefcase ??
    (isExecutive || /\b(briefcase|suitcase|portfolio)\b/i.test(textContext));
  const hasHammer =
    raw?.equipment?.hasHammer ??
    (isBlacksmith || isMiner || /\b(hammer|pickaxe|tongs|blacksmith)\b/i.test(textContext));
  const hasBackKatanas =
    raw?.equipment?.hasBackKatanas ??
    (isNinja || /\b(twin back sheaths|back sheaths|ninja|shinobi)\b/i.test(textContext));

  // Detect costume
  const hasHood =
    raw?.costume?.hasHood ??
    (isNinja || /\b(hood|hooded|cowl|cloak|mantle|scout|assassin|stealth|ninja|shinobi)\b/i.test(textContext));
  const hasCowl =
    raw?.costume?.hasCowl ??
    (isElvenArchetype ? hasHood : /\b(scarf|cowl|bandana)\b/i.test(textContext));
  const hasAntlersOrPins =
    raw?.costume?.hasAntlersOrPins ??
    /\b(elf|elven|antler|pin|circlet|nature|druid)\b/i.test(textContext);
  const hasHair =
    raw?.costume?.hasHair ??
    (isElvenArchetype ||
      (/\b(hair|braid|ponytail|bun|afro|wig)\b/i.test(textContext) || /شعر/.test(textContext)));
  const hasCuirass =
    raw?.costume?.hasCuirass ??
    (isFullCostumeArchetype ||
      /\b(armor|cuirass|vest|chestplate|tunic|jacket|coat|trenchcoat|suit|shirt|sweater|scrubs|overalls|uniform)\b/i.test(textContext) ||
      /(درع|معطف|جاكيت|بدلة)/.test(textContext));
  const hasBelt =
    raw?.costume?.hasBelt ??
    (isFullCostumeArchetype || /\b(belt|harness|strap|sash|holster)\b/i.test(textContext));
  const hasBracers =
    raw?.costume?.hasBracers ??
    (isElvenArchetype || isKnight || isSamurai || isNinja || isAstronaut || isSurgeon || /\b(bracer|gauntlet|wristband|gloves)\b/i.test(textContext));
  const hasBoots =
    raw?.costume?.hasBoots ??
    (isFullCostumeArchetype || /\b(boot|boots|shoes|sneakers|greaves)\b/i.test(textContext));

  let lowerGarment: 'skirt' | 'robe' | 'trousers' | 'none' = isElvenArchetype ? 'skirt' : 'none';
  if (isWizard || isDetective || /\b(robe|gown|dress|wizard|trenchcoat|surcoat)\b/i.test(textContext)) {
    lowerGarment = 'robe';
  } else if (isSamurai || /\b(skirt|kilt|tunic|hakama)\b/i.test(textContext)) {
    lowerGarment = 'skirt';
  } else if (isKnight || isFullCostumeArchetype || /\b(pants|trousers|breeches|armor|knight|jeans|suit|scrubs|overalls)\b/i.test(textContext)) {
    lowerGarment = 'trousers';
  }

  // Archetype-tuned color palettes so each character looks unmistakable
  let defaultPrimary = '#2e4e3f';
  let defaultSecondary = '#3d6350';
  let defaultLeather = '#4a3321';
  let defaultMetal = '#c2a649';

  if (isKnight) {
    defaultPrimary = '#94a3b8';
    defaultSecondary = '#991b1b';
    defaultLeather = '#451a03';
    defaultMetal = '#cbd5e1';
  } else if (isSamurai) {
    defaultPrimary = '#7f1d1d';
    defaultSecondary = '#18181b';
    defaultLeather = '#27272a';
    defaultMetal = '#eab308';
  } else if (isNinja) {
    defaultPrimary = '#18181b';
    defaultSecondary = '#09090b';
    defaultLeather = '#991b1b';
    defaultMetal = '#94a3b8';
  } else if (isAstronaut) {
    defaultPrimary = '#f8fafc';
    defaultSecondary = '#cbd5e1';
    defaultLeather = '#475569';
    defaultMetal = '#f59e0b';
  } else if (isWizard) {
    defaultPrimary = '#312e81';
    defaultSecondary = '#4338ca';
    defaultLeather = '#581c87';
    defaultMetal = '#38bdf8';
  } else if (isDetective) {
    defaultPrimary = '#b08968';
    defaultSecondary = '#334155';
    defaultLeather = '#451a03';
    defaultMetal = '#d97706';
  } else if (isSurgeon) {
    defaultPrimary = '#0284c7';
    defaultSecondary = '#e0f2fe';
    defaultLeather = '#2dd4bf';
    defaultMetal = '#cbd5e1';
  } else if (isChef) {
    defaultPrimary = '#f8fafc';
    defaultSecondary = '#e2e8f0';
    defaultLeather = '#1e293b';
    defaultMetal = '#94a3b8';
  } else if (isSoldier) {
    defaultPrimary = '#3f4f3a';
    defaultSecondary = '#293325';
    defaultLeather = '#4a3b2c';
    defaultMetal = '#52525b';
  } else if (isMiner) {
    defaultPrimary = '#ca8a04';
    defaultSecondary = '#1e3a8a';
    defaultLeather = '#451a03';
    defaultMetal = '#facc15';
  } else if (isPilot) {
    defaultPrimary = '#1e3a8a';
    defaultSecondary = '#f8fafc';
    defaultLeather = '#18181b';
    defaultMetal = '#eab308';
  } else if (isBlacksmith) {
    defaultPrimary = '#451a03';
    defaultSecondary = '#292524';
    defaultLeather = '#78350f';
    defaultMetal = '#52525b';
  } else if (isExecutive) {
    defaultPrimary = '#1e293b';
    defaultSecondary = '#f8fafc';
    defaultLeather = '#451a03';
    defaultMetal = '#dc2626';
  } else if (isSteampunk) {
    defaultPrimary = '#78350f';
    defaultSecondary = '#451a03';
    defaultLeather = '#92400e';
    defaultMetal = '#d97706';
  } else if (isCyberpunk) {
    defaultPrimary = '#0f172a';
    defaultSecondary = '#06b6d4';
    defaultLeather = '#1e293b';
    defaultMetal = '#22d3ee';
  }

  // Detect or sample palette
  const rawPal = raw?.palette || raw?.colors || {};
  const palette: CharacterVisualFeatures['palette'] = {
    skin: rawPal.skin || fallbackPalette?.skin || '#f3ceb2',
    hair: rawPal.hair || fallbackPalette?.hair || '#ad8748',
    primaryClothing: rawPal.primaryClothing || rawPal.tunic || rawPal.clothing || fallbackPalette?.primaryClothing || defaultPrimary,
    secondaryClothing: rawPal.secondaryClothing || fallbackPalette?.secondaryClothing || defaultSecondary,
    leather: rawPal.leather || rawPal.straps || fallbackPalette?.leather || defaultLeather,
    metal: rawPal.metal || rawPal.armor || fallbackPalette?.metal || defaultMetal,
    weaponWood: rawPal.weaponWood || rawPal.wood || fallbackPalette?.weaponWood || '#4a2810',
    weaponAccent: rawPal.weaponAccent || fallbackPalette?.weaponAccent || '#e5e7eb',
  };

  const name = raw?.name || raw?.subject || prompt.replace(/[^\w\s-]/g, '').trim().slice(0, 48) || 'Clay Character';

  return {
    name,
    archetype:
      raw?.archetype ||
      (isKnight
        ? 'knight'
        : isSamurai
        ? 'samurai'
        : isNinja
        ? 'ninja'
        : isAstronaut
        ? 'astronaut'
        : isWizard
        ? 'mage'
        : isDetective
        ? 'detective'
        : isSurgeon
        ? 'surgeon'
        : isChef
        ? 'chef'
        : isSoldier
        ? 'soldier'
        : isMiner
        ? 'miner'
        : isPilot
        ? 'pilot'
        : isBlacksmith
        ? 'blacksmith'
        : isExecutive
        ? 'executive'
        : isSteampunk
        ? 'steampunk'
        : isCyberpunk
        ? 'cyberpunk'
        : hasBow
        ? 'archer'
        : hasStaff
        ? 'mage'
        : hasSword
        ? 'warrior'
        : 'scout'),
    gender: isFemale ? 'female' : 'male',
    heightMeters: typeof raw?.heightMeters === 'number' ? raw.heightMeters : 1.75,
    palette,
    costume: {
      hasHat: Boolean(hasHat),
      hatStyle,
      hatColor,
      hasHelmet: Boolean(hasHelmet),
      helmetStyle,
      hasCrown: Boolean(hasCrown),
      hasGlasses: Boolean(hasGlasses),
      hasFaceMask: Boolean(hasFaceMask),
      hasTie: Boolean(hasTie),
      hasApron: Boolean(hasApron),
      hasPauldrons: Boolean(hasPauldrons),
      hasStethoscope: Boolean(hasStethoscope),
      hasBackpack: Boolean(hasBackpack),
      hasHair: Boolean(hasHair),
      hasCuirass: Boolean(hasCuirass),
      hasBoots: Boolean(hasBoots),
      selectiveMode: !isFullCostumeArchetype,
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
      hasBriefcase: Boolean(hasBriefcase),
      hasHammer: Boolean(hasHammer),
      hasBackKatanas: Boolean(hasBackKatanas),
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
