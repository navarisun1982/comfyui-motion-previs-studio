/**
 * 3Dviz Pro Max BM25 Semantic Archetype Resolver.
 * Replaces ad-hoc string regex cascades with probabilistic BM25 token matching,
 * sub-word root stemming, query expansion, and Levenshtein typo resilience.
 * Grounded in scripts/search.py and references/object-reasoning.md.
 */

import { ProceduralPalette } from './craftForms';
import { ProceduralKitResult } from './proceduralKits';
import {
  createTimberCottage,
  createRoundTower,
  createWatermill,
  createMarketStall,
  createStoneBridge,
  createMoonStag,
  createBipedWalker,
  createTreeRound,
  createPineTree,
  createLanternPost,
  createBarrel,
  createCrate,
  createStoneWell,
  createSciFiFighter,
  createSciFiDrone,
  createCameraRigDolly,
  createZodiacBoat,
  createAutomobile,
  createHelicopter,
  createQuadrupedWalker,
  extractQuadrupedMorphology,
  createUniversalFurniture,
  createHeroWeaponProp,
  createCartAssembly,
  createFenceRunAssembly,
  createSignboardAssembly,
  createRockClusterAssembly,
  createReedsAssembly,
  createClotheslineAssembly,
  createStoneGuildhall,
  createTelevisionAssembly,
  createNinjaCharacter,
  createCyberBeastCreature,
  createDragonCreature,
  createKnightWarrior,
  createDetectiveCharacter,
  createDoctorSurgeon,
  createSportsCarVehicle,
  createTankArmoredVehicle,
  createSubmarineVessel,
  createCastleTowerArchitecture,
} from './proceduralKits';
import {
  createWoodwindFluteAssembly,
  createGuitarAssembly,
  createPianoKeyboardAssembly,
  createPercussionDrumAssembly,
  createMotorcycleAssembly,
  createAircraftAssembly,
  createMicroscopeAssembly,
  createTelescopeAssembly,
  createCameraAssembly,
  createTableLampAssembly,
  createOscillatingFanAssembly,
  createTimepieceAssembly,
  createApplianceCabinetAssembly,
  createBedFurnitureAssembly,
  createShieldDefenseAssembly,
  createDoorGateAssembly,
  createAudioSpeakerAssembly,
  createMicrophoneAssembly,
  createHollowVesselAssembly,
  createLayeredFoodAssembly,
  createLaptopAssembly,
  createRobotMechaAssembly,
} from './geometricDecomposer';
import { synthesizeMorphometricObject } from './morphometricReasoner';

export interface ObjectArchetype {
  id: string;
  name: string;
  domain: string;
  keywords: string[];
  aliases?: string[];
  targetScale: number;
  build: (palette: ProceduralPalette, query?: string) => ProceduralKitResult;
}

/**
 * Unicode normalization and punctuation-safe token extraction.
 */
export function extractTokens(text: string): string[] {
  if (!text) return [];
  const normalized = text
    .normalize('NFKC')
    .toLowerCase()
    // Strip Arabic diacritics and tatweel
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/['"؛،,.\-_/\\()[\]{}*+?]/g, ' ');

  return normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Levenshtein distance for typo resilience.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/**
 * 3Dviz Pro Max Canonical Query Aliases (from manifest.json).
 * Guarded against short-word substring poisoning (e.g. 'car' matching 'cat' or 'cart').
 */
const QUERY_ALIASES: Record<string, string[]> = {
  motorcycle: ['motorbike', 'bike', 'scooter', 'دباب', 'موتوسيكل'],
  flute: ['woodwind', 'aerophone', 'instrument', 'ناي', 'مزمار'],
  camera: ['lens', 'rig', 'optics', 'dolly', 'cine', 'tripod'],
  airplane: ['plane', 'aircraft', 'jet', 'aviation'],
  automobile: ['car', 'sedan', 'vehicle', 'truck', 'suv', 'sportscar'],
  computer: ['laptop', 'notebook', 'macbook'],
  sound: ['speaker', 'audio', 'acoustic', 'loudspeaker'],
  hound: ['dog', 'canine', 'beast', 'wolf', 'كلب'],
  beast: ['creature', 'animal', 'monster', 'hound', 'cyberbeast', 'وحش'],
  ninja: ['shinobi', 'assassin', 'shadow', 'ronin', 'نينجا'],
  knight: ['warrior', 'paladin', 'fighter', 'soldier', 'فارس'],
  dragon: ['wyvern', 'drake', 'serpent', 'monster', 'تنين'],
  car: ['automobile', 'sedan', 'vehicle', 'sportscar', 'سيارة'],
  dog: ['hound', 'canine', 'puppy', 'كلب'],
  actor: ['character', 'human', 'person', 'walker', 'biped', 'ممثل'],
  character: ['actor', 'human', 'person', 'walker', 'biped', 'شخصية'],
  television: ['tv', 'monitor', 'screen', 'display'],
  signboard: ['billboard', 'noticeboard', 'placard', 'لافتة', 'يافطة'],
  boulder: ['rock', 'stone', 'crag', 'cliff', 'صخرة', 'حجر'],
  reeds: ['reed', 'cattails', 'rushes', 'bamboo', 'قصب', 'بردي'],
  clothesline: ['laundry', 'washing', 'حبل غسيل', 'غسيل'],
  cart: ['wagon', 'handcart', 'wheelbarrow', 'chariot', 'عربة', 'كارو'],
  fence: ['railing', 'paling', 'palisade', 'barrier', 'سور', 'سياج'],
};

/**
 * Archetype Registry: 38 authoritative physical domains matching all 22 3Dviz Pro Max blueprints + set essentials.
 */
export const ARCHETYPE_REGISTRY: ObjectArchetype[] = [
  // 1. Acoustic Woodwind (Flute, Recorder, Piccolo, Clarinet, Oboe, Nay)
  {
    id: 'archetype.acoustic.woodwind',
    name: 'Concert Woodwind Flute',
    domain: 'acoustic',
    keywords: [
      'flute', 'recorder', 'piccolo', 'clarinet', 'oboe', 'woodwind', 'fife', 'panpipe', 'whistle',
      'ناي', 'الناي', 'فلوت', 'الفلوت', 'مزمار', 'المزمار', 'كوالا', 'يرغول', 'صفارة',
    ],
    targetScale: 2.2,
    build: (p) => createWoodwindFluteAssembly(p),
  },

  // 2. Ground Two-Wheel Locomotion (Motorcycle, Motorbike, Scooter, Vespa)
  {
    id: 'archetype.vehicle.motorcycle',
    name: 'Articulated Motorcycle',
    domain: 'vehicle',
    keywords: [
      'motorcycle', 'motocycle', 'motorbike', 'motobike', 'moto', 'bike', 'bicycle', 'scooter', 'dirtbike', 'moped', 'vespa',
      'موتوسيكل', 'الموتوسيكل', 'موتسيكل', 'الموتسيكل', 'موتوسكل', 'دراجه ناريه', 'دباب', 'الدباب', 'سكوتر', 'السكوتر', 'بسكلته', 'عجله', 'دراجه',
    ],
    targetScale: 2.4,
    build: (p) => createMotorcycleAssembly(p),
  },

  // 3. Acoustic Chordophone (Guitar, Oud, Violin, Cello, Lute)
  {
    id: 'archetype.acoustic.chordophone',
    name: 'Acoustic Guitar / String Instrument',
    domain: 'acoustic',
    keywords: [
      'guitar', 'oud', 'violin', 'cello', 'strings', 'lute', 'sitar', 'banjo', 'mandolin',
      'جيتار', 'الجيتار', 'قيثاره', 'القيثاره', 'عود', 'العود', 'كمان', 'الكمان', 'كمنجه', 'تشيلو',
    ],
    targetScale: 2.2,
    build: (p) => createGuitarAssembly(p),
  },

  // 4. Acoustic Keyboard (Grand Piano, Organ, Synthesizer)
  {
    id: 'archetype.acoustic.keyboard',
    name: 'Grand Piano & Keybed',
    domain: 'acoustic',
    keywords: [
      'piano', 'keyboard', 'grandpiano', 'pianoforte', 'organ', 'synthesizer', 'keybed',
      'بيانو', 'البيانو', 'اورج', 'الاورج', 'كيبورد', 'الكيبورد', 'بيانو كبير',
    ],
    targetScale: 2.4,
    build: (p) => createPianoKeyboardAssembly(p),
  },

  // 5. Acoustic Percussion (Drums, Snare, Timpani, Bongo)
  {
    id: 'archetype.acoustic.percussion',
    name: 'Percussion Drum Kit',
    domain: 'acoustic',
    keywords: [
      'drum', 'drums', 'snare', 'timpani', 'conga', 'bongo', 'percussion', 'tambourine',
      'طبله', 'طبلة', 'الطبله', 'درامز', 'طبل', 'دف', 'الدف', 'ايقاع',
    ],
    targetScale: 2.2,
    build: (p) => createPercussionDrumAssembly(p),
  },

  // 6. Audio Capture: Microphones
  {
    id: 'archetype.audio.microphone',
    name: 'Studio Condenser Microphone',
    domain: 'audio',
    keywords: [
      'microphone', 'mic', 'recording', 'condenser', 'megaphone', 'bullhorn',
      'مايك', 'المايك', 'ميكروفون', 'الميكروفون', 'ميكرفون', 'لاقط صوت', 'مكبر صوت يدوي',
    ],
    targetScale: 2.2,
    build: (p) => createMicrophoneAssembly(p),
  },

  // 7. Audio Loudspeaker / Sound Monitor
  {
    id: 'archetype.audio.speaker',
    name: 'Studio Audio Speaker',
    domain: 'audio',
    keywords: [
      'speaker', 'soundbar', 'subwoofer', 'loudspeaker', 'boombox', 'audio',
      'مكبر صوت', 'مكبرات', 'سماعه كبيره', 'صب', 'صب ووفر', 'سماعات',
    ],
    targetScale: 2.2,
    build: (p) => createAudioSpeakerAssembly(p),
  },

  // 8. Hollow Vessels & Containers (Cup, Mug, Glass, Bottle, Bowl, Teapot)
  {
    id: 'archetype.container.vessel',
    name: 'Hollow Vessel Container',
    domain: 'container',
    keywords: [
      'cup', 'mug', 'glass', 'bottle', 'bowl', 'vase', 'flask', 'teapot', 'jug', 'pitcher', 'chalice', 'pot',
      'كبايه', 'كوبايه', 'كوب', 'فنجان', 'كاس', 'كأس', 'قدح', 'مج', 'شوب', 'زجاجه', 'قاروره', 'ابريق', 'براد شاي', 'وعاء', 'سلطانيه',
    ],
    targetScale: 2.0,
    build: (p, q) => createHollowVesselAssembly(p, !q?.includes('bowl')),
  },

  // 9. Optics & Cinematography (Camera, Dolly, Rig, Lens)
  {
    id: 'archetype.optics.camera',
    name: 'Cinema Camera Rig',
    domain: 'optics',
    keywords: [
      'camera', 'cine', 'lens', 'dolly', 'rig', 'optics', 'tripod', 'film',
      'كاميرا', 'الكاميرا', 'كاميره', 'شاريو', 'عدسه', 'العدسه', 'ترايبود',
    ],
    targetScale: 2.2,
    build: (p, q) => {
      if (q?.includes('dolly') || q?.includes('crane')) return createCameraRigDolly(p);
      return createCameraAssembly(p);
    },
  },

  // 10. Scientific Optical Instruments: Microscope
  {
    id: 'archetype.optics.microscope',
    name: 'Laboratory Microscope',
    domain: 'optics',
    keywords: [
      'microscope', 'labscope',
      'ميكروسكوب', 'الميكروسكوب', 'مجهر', 'المجهر',
    ],
    targetScale: 2.2,
    build: (p) => createMicroscopeAssembly(p),
  },

  // 11. Astronomical Optics: Telescope
  {
    id: 'archetype.optics.telescope',
    name: 'Stargazing Telescope',
    domain: 'optics',
    keywords: [
      'telescope', 'spyglass', 'monocular', 'stargazer',
      'تلسكوب', 'التلسكوب', 'مرقب', 'المرقب', 'منظار فلكي',
    ],
    targetScale: 2.2,
    build: (p) => createTelescopeAssembly(p),
  },

  // 12. Aviation & Aerospace (Airplane, Aircraft, Jet)
  {
    id: 'archetype.aerospace.aircraft',
    name: 'Fixed-Wing Aircraft',
    domain: 'aerospace',
    keywords: [
      'airplane', 'plane', 'aeroplane', 'jet', 'aircraft', 'biplane', 'glider', 'aviation',
      'طياره', 'الطياره', 'طائره', 'الطائره', 'طائرة', 'طيران', 'نفاثه',
    ],
    targetScale: 2.6,
    build: (p) => createAircraftAssembly(p),
  },

  // 13. Rotary Helicopter
  {
    id: 'archetype.aerospace.helicopter',
    name: 'Rotary Helicopter',
    domain: 'aerospace',
    keywords: [
      'helicopter', 'chopper', 'copter',
      'هليكوبتر', 'الهليكوبتر', 'طوافه',
    ],
    targetScale: 2.6,
    build: (p) => createHelicopter(p),
  },

  // 14. Sci-Fi Aerospace Fighter & Starship
  {
    id: 'archetype.aerospace.scifi',
    name: 'Sci-Fi Starfighter',
    domain: 'aerospace',
    keywords: [
      'fighter', 'starfighter', 'starship', 'spaceship', 'spacecraft', 'interceptor',
      'مركبه فضائيه', 'سفينه فضاء', 'صاروخ فضائي',
    ],
    targetScale: 2.6,
    build: (p) => createSciFiFighter(p),
  },

  // 15. Sci-Fi Hover Drone
  {
    id: 'archetype.aerospace.drone',
    name: 'Sci-Fi Recon Drone',
    domain: 'aerospace',
    keywords: [
      'drone', 'ufo', 'hover', 'probe', 'bot',
      'درون', 'الدرون', 'طائره مسيره',
    ],
    targetScale: 2.4,
    build: (p) => createSciFiDrone(p),
  },

  // 16. Marine Watercraft (Zodiac, Boat, Ship, Yacht)
  {
    id: 'archetype.marine.boat',
    name: 'Zodiac Marine Craft',
    domain: 'marine',
    keywords: [
      'zodiac', 'boat', 'rib', 'inflatable', 'vessel', 'yacht', 'speedboat', 'watercraft', 'raft', 'dinghy',
      'زودياك', 'الزودياك', 'قارب', 'القارب', 'مركب', 'المركب', 'يخت', 'لنش',
    ],
    targetScale: 2.4,
    build: (p) => createZodiacBoat(p),
  },

  // 17. Ground Automotive (Car, Automobile, Sedan, Truck)
  {
    id: 'archetype.vehicle.automobile',
    name: 'Automobile Vehicle',
    domain: 'vehicle',
    keywords: [
      'car', 'automobile', 'sedan', 'truck', 'suv', 'van', 'taxi', 'jeep',
      'عربيه', 'العربيه', 'سياره', 'السياره', 'تاكسي', 'شاحنه',
    ],
    targetScale: 2.4,
    build: (p) => createAutomobile(p),
  },

  // 18. Farm Cart & Wagon (3Dviz Pro Max blueprint-cart)
  {
    id: 'archetype.vehicle.cart',
    name: 'Two-Wheeled Farm Cart',
    domain: 'vehicle',
    keywords: [
      'cart', 'wagon', 'handcart', 'wheelbarrow', 'chariot', 'dray', 'carriage',
      'عربه', 'عربة', 'كارو', 'حنطور', 'عربه يد', 'عربة يد',
    ],
    targetScale: 2.3,
    build: (p) => createCartAssembly(p),
  },

  // 19. Paddock Fence Run (3Dviz Pro Max blueprint-fence-run)
  {
    id: 'archetype.prop.fence',
    name: 'Paddock Fence Run',
    domain: 'prop',
    keywords: [
      'fence', 'fencing', 'paling', 'railing', 'palisade', 'barrier', 'enclosure',
      'سور', 'السور', 'سياج', 'السياج', 'حاجز',
    ],
    targetScale: 2.2,
    build: (p) => createFenceRunAssembly(p),
  },

  // 20. Tavern Signboard (3Dviz Pro Max blueprint-signboard)
  {
    id: 'archetype.prop.signboard',
    name: 'Hanging Tavern Signboard',
    domain: 'prop',
    keywords: [
      'signboard', 'sign', 'billboard', 'noticeboard', 'placard', 'wooden sign', 'tavern sign',
      'لافته', 'لافتة', 'لوحه', 'لوحة', 'يافطه', 'يافطة', 'شاخصه', 'شاخصة',
    ],
    targetScale: 2.2,
    build: (p) => createSignboardAssembly(p),
  },

  // 21. Faceted Rock Cluster (3Dviz Pro Max blueprint-rock-cluster)
  {
    id: 'archetype.nature.rock',
    name: 'Glacial Rock Cluster',
    domain: 'nature',
    keywords: [
      'rock', 'rocks', 'boulder', 'stone', 'stones', 'crag', 'cliff', 'pebble', 'pebbles',
      'صخره', 'صخرة', 'صخور', 'حجر', 'احجار', 'جلمود',
    ],
    targetScale: 2.4,
    build: (p) => createRockClusterAssembly(p),
  },

  // 22. Marsh Reeds & Cattails (3Dviz Pro Max blueprint-reeds)
  {
    id: 'archetype.nature.reeds',
    name: 'Marsh Reeds & Cattails',
    domain: 'nature',
    keywords: [
      'reeds', 'reed', 'cattails', 'cattail', 'rushes', 'bamboo', 'marsh grass', 'water plants',
      'قصب', 'القصب', 'بردي', 'خيزران', 'نباتات مائيه',
    ],
    targetScale: 2.2,
    build: (p) => createReedsAssembly(p),
  },

  // 23. Paddock Clothesline (3Dviz Pro Max blueprint-clothesline)
  {
    id: 'archetype.prop.clothesline',
    name: 'Paddock Clothesline',
    domain: 'prop',
    keywords: [
      'clothesline', 'laundry', 'washing line', 'drying rack', 'clothes line',
      'حبل غسيل', 'حبل الغسيل', 'غسيل', 'منشر',
    ],
    targetScale: 2.2,
    build: (p) => createClotheslineAssembly(p),
  },

  // 24. Production Appliance: Television & Display
  {
    id: 'archetype.appliance.television',
    name: 'High-Definition Television / Monitor',
    domain: 'appliance',
    keywords: [
      'tv', 'television', 'monitor', 'screen', 'display', 'flatscreen', 'telly',
      'تلفزيون', 'التلفزيون', 'شاشه', 'شاشة', 'شاشه عرض', 'تلفاز',
    ],
    targetScale: 2.2,
    build: (p) => createTelevisionAssembly(p),
  },

  // 25. 3Dviz Pro Max Universal Quadruped Walker Blueprint (blueprint-quadruped-walker)
  {
    id: 'blueprint-quadruped-walker',
    name: 'Articulated Quadruped Walker (3Dviz Pro Max)',
    domain: 'creature',
    keywords: [
      'stag', 'deer', 'horse', 'stallion', 'mare', 'colt', 'pony', 'donkey', 'mule', 'camel', 'dromedary',
      'cow', 'cattle', 'bovine', 'bull', 'ox', 'calf', 'heifer', 'dairy cow', 'holstein', 'buffalo', 'bison', 'beef', 'steer',
      'cat', 'kitten', 'kitty', 'feline', 'dog', 'puppy', 'hound', 'canine',
      'lion', 'tiger', 'leopard', 'cheetah', 'bear', 'wolf', 'fox',
      'goat', 'sheep', 'ram', 'lamb', 'pig', 'boar', 'elephant', 'rhino', 'hippo',
      'beast', 'animal', 'creature', 'quadruped',
      'بقرة', 'بقره', 'بقر', 'البقر', 'البقرة', 'ثور', 'الثور', 'عجل', 'العجل', 'جاموس', 'جاموسة',
      'غزال', 'الغزال', 'حصان', 'الحصان', 'مهر', 'فرس', 'حمار', 'جمل', 'ناقة',
      'قط', 'قطه', 'قطة', 'بسه', 'كلب', 'الكلب', 'جرو',
      'اسد', 'الاسد', 'نمر', 'فهد', 'دب', 'ذئب', 'ثعلب', 'ماعز', 'خروف', 'كبش', 'فيل', 'حيوان', 'وحش', 'كائن',
    ],
    targetScale: 1.0,
    build: (p, q) => createQuadrupedWalker(extractQuadrupedMorphology(q || '', p)),
  },

  // 26. Human Character & Walker (Actor, Man, Woman, Soldier, Hero)
  {
    id: 'archetype.character.biped',
    name: 'Articulated Biped Walker',
    domain: 'character',
    keywords: [
      'actor', 'human', 'person', 'man', 'woman', 'girl', 'boy', 'guy', 'lady', 'soldier', 'guard', 'villager', 'hero', 'detective', 'policeman', 'officer', 'doctor', 'nurse', 'child', 'kid', 'dancer', 'walker', 'biped',
      'انسان', 'ممثل', 'رجل', 'امراه', 'شخص', 'جندي', 'بطل', 'حارس', 'ضابط', 'محقق', 'طبيب', 'طفل', 'فتاه',
    ],
    targetScale: 2.6,
    build: (p, q) => {
      const isFemale = /\b(woman|girl|female|lady|actress|daughter|mother|queen|sister|bride)\b/i.test(q || '');
      return createBipedWalker(p, isFemale);
    },
  },

  // 27. Architecture & Heritage (Cottage, Tower, Watermill, Market Stall, Bridge, Guildhall, Hall)
  {
    id: 'archetype.architecture.building',
    name: 'Heritage Architecture',
    domain: 'architecture',
    keywords: [
      'cottage', 'house', 'building', 'tower', 'watermill', 'mill', 'stall', 'shop', 'bridge', 'guildhall', 'hall', 'manor', 'castle',
      'بيت', 'كوخ', 'منزل', 'برج', 'طاحونه', 'كشك', 'دكان', 'جسر', 'كوبري', 'قاعه', 'قاعة', 'مبنى', 'قلعه',
    ],
    targetScale: 2.8,
    build: (p, q) => {
      if (q?.includes('guildhall') || q?.includes('hall') || q?.includes('قاع')) return createStoneGuildhall(p);
      if (q?.includes('tower') || q?.includes('برج')) return createRoundTower(p);
      if (q?.includes('mill') || q?.includes('طاحون')) return createWatermill(p);
      if (q?.includes('stall') || q?.includes('shop') || q?.includes('كشك')) return createMarketStall(p);
      if (q?.includes('bridge') || q?.includes('جسر')) return createStoneBridge(p);
      return createTimberCottage(p);
    },
  },

  // 28. Robotics & Mecha (Robot, Mecha, Cyborg, Android)
  {
    id: 'archetype.robotics.mecha',
    name: 'Articulated Mecha Robot',
    domain: 'robotics',
    keywords: [
      'robot', 'mech', 'mecha', 'android', 'cyborg', 'automaton', 'golem',
      'روبوت', 'الروبوت', 'الي', 'رجل الي', 'ميكا',
    ],
    targetScale: 2.6,
    build: (p) => createRobotMechaAssembly(p),
  },

  // 29. Practical Luminaires (Lamp, Lantern, Spotlight, Torch)
  {
    id: 'archetype.prop.luminaire',
    name: 'Table Lamp / Lantern',
    domain: 'prop',
    keywords: [
      'lamp', 'lantern', 'lampshade', 'light', 'torch', 'candle', 'chandelier', 'streetlamp', 'spotlight', 'bulb',
      'مصباح', 'لمبه', 'فانوس', 'اباجوره', 'نجفه', 'كشاف',
    ],
    targetScale: 2.0,
    build: (p, q) => {
      if (q?.includes('post') || q?.includes('streetlamp') || q?.includes('عمود')) return createLanternPost(p);
      return createTableLampAssembly(p);
    },
  },

  // 30. Furniture & Interior Elements (Bed, Sofa, Table, Chair, Cabinet)
  {
    id: 'archetype.furniture.interior',
    name: 'Interior Furniture',
    domain: 'furniture',
    keywords: [
      'bed', 'mattress', 'sofa', 'couch', 'table', 'desk', 'chair', 'stool', 'bench', 'shelf', 'cabinet', 'refrigerator', 'fridge', 'appliance',
      'سرير', 'كنبه', 'ترابيزه', 'طاوله', 'طاولة', 'كرسي', 'دولاب', 'ثلاجه', 'فرن', 'مكتب', 'مقعد',
    ],
    targetScale: 2.2,
    build: (p, q) => {
      if (q?.includes('bed') || q?.includes('سرير')) return createBedFurnitureAssembly(p);
      if (q?.includes('fridge') || q?.includes('refrigerator') || q?.includes('cabinet') || q?.includes('ثلاجه')) {
        return createApplianceCabinetAssembly(p);
      }
      if (q?.includes('sofa') || q?.includes('couch') || q?.includes('كنبه')) return createUniversalFurniture('sofa', p);
      if (q?.includes('table') || q?.includes('desk') || q?.includes('ترابيز') || q?.includes('طاول') || q?.includes('مكتب')) {
        return createUniversalFurniture('table', p);
      }
      return createUniversalFurniture('chair', p);
    },
  },

  // 31. Combat Defense & Action Props (Shield, Sword, Gun)
  {
    id: 'archetype.prop.defense',
    name: 'Combat Defense Gear',
    domain: 'prop',
    keywords: [
      'shield', 'buckler', 'aegis', 'sword', 'blade', 'gun', 'rifle', 'pistol', 'dagger', 'knife', 'bow', 'spear',
      'درع', 'الدرع', 'سيف', 'السيف', 'سلاح', 'بندقيه', 'مسدس', 'خنجر', 'رمح',
    ],
    targetScale: 2.0,
    build: (p, q) => {
      if (q?.includes('sword') || q?.includes('blade') || q?.includes('dagger') || q?.includes('سيف') || q?.includes('خنجر')) {
        return createHeroWeaponProp('sword', p);
      }
      if (q?.includes('gun') || q?.includes('rifle') || q?.includes('pistol') || q?.includes('سلاح') || q?.includes('بندقيه') || q?.includes('مسدس')) {
        return createHeroWeaponProp('gun', p);
      }
      return createShieldDefenseAssembly(p);
    },
  },

  // 32. Rotary Airflow: Oscillating Fan
  {
    id: 'archetype.mechanical.fan',
    name: 'Oscillating Electric Fan',
    domain: 'mechanical',
    keywords: [
      'fan', 'ventilator', 'blower', 'turbine', 'propeller',
      'مروحه', 'المروحه', 'توربين',
    ],
    targetScale: 2.0,
    build: (p) => createOscillatingFanAssembly(p),
  },

  // 33. Precision Horology: Timepiece & Clock
  {
    id: 'archetype.mechanical.timepiece',
    name: 'Precision Timepiece Clock',
    domain: 'mechanical',
    keywords: [
      'clock', 'timepiece', 'wristwatch', 'watch', 'stopwatch', 'chronometer',
      'ساعه', 'الساعه', 'منبه', 'ساعة يد',
    ],
    targetScale: 2.0,
    build: (p) => createTimepieceAssembly(p),
  },

  // 34. Portals & Portcullis: Door / Gate
  {
    id: 'archetype.architecture.portal',
    name: 'Architectural Door / Gate',
    domain: 'architecture',
    keywords: [
      'door', 'gate', 'portal', 'entrance', 'doorway', 'portcullis',
      'باب', 'الباب', 'بوابه', 'البوابه', 'مدخل',
    ],
    targetScale: 2.2,
    build: (p) => createDoorGateAssembly(p),
  },

  // 35. Culinary Layered Food (Burger, Sandwich, Bread)
  {
    id: 'archetype.culinary.layered',
    name: 'Layered Culinary Food Assembly',
    domain: 'culinary',
    keywords: [
      'burger', 'sandwich', 'pizza', 'bread', 'patty', 'meal', 'food', 'hamburger',
      'برجر', 'البرجر', 'ساندوتش', 'بيتزا', 'خبز', 'وجبه',
    ],
    targetScale: 2.0,
    build: (p) => createLayeredFoodAssembly(p),
  },

  // 36. Computing Clamshell (Laptop, Notebook)
  {
    id: 'archetype.computing.clamshell',
    name: 'Computing Clamshell Laptop',
    domain: 'computing',
    keywords: [
      'laptop', 'computer', 'notebook', 'macbook',
      'لابتوب', 'اللابتوب', 'كمبيوتر', 'حاسوب',
    ],
    targetScale: 2.0,
    build: (p) => createLaptopAssembly(p),
  },

  // 37. Nature: Trees & Foliage
  {
    id: 'archetype.nature.foliage',
    name: 'Botanical Tree',
    domain: 'nature',
    keywords: [
      'tree', 'pine', 'conifer', 'fir', 'bush', 'plant', 'foliage',
      'شجره', 'الشجره', 'شجر', 'صنوبر', 'نبات',
    ],
    targetScale: 2.8,
    build: (p, q) => {
      if (q?.includes('pine') || q?.includes('conifer') || q?.includes('صنوبر')) return createPineTree(p);
      return createTreeRound(p);
    },
  },

  // 38. Set Dressing Props (Barrel, Crate, Well)
  {
    id: 'archetype.prop.setdressing',
    name: 'Set Dressing Prop',
    domain: 'prop',
    keywords: [
      'barrel', 'keg', 'crate', 'cargo', 'chest', 'well',
      'برميل', 'صندوق', 'بئر',
    ],
    targetScale: 2.0,
    build: (p, q) => {
      if (q?.includes('barrel') || q?.includes('برميل')) return createBarrel(p);
      if (q?.includes('well') || q?.includes('بئر')) return createStoneWell(p);
      return createCrate(p);
    },
  },

  // 39. Shadow Ninja Shinobi Assassin
  {
    id: 'archetype.character.ninja',
    name: 'Shadow Ninja Shinobi Assassin',
    domain: 'character',
    keywords: [
      'ninja', 'shinobi', 'assassin', 'shadow', 'ronin', 'stealth', 'ninjas',
      'نينجا', 'النينجا', 'شينوبي', 'سياف', 'مقاتل ظل', 'قاتل ماجور', 'قاتل مأجور',
    ],
    targetScale: 2.6,
    build: (p) => createNinjaCharacter(p),
  },

  // 40. Cybernetic War Beast / Mech Hound
  {
    id: 'archetype.creature.cyberbeast',
    name: 'Cybernetic War Beast / Mech Hound',
    domain: 'creature',
    keywords: [
      'cyberbeast', 'cybernetic beast', 'cyber dog', 'robot dog', 'mecha hound', 'robotic beast', 'cyber hound', 'attack hound', 'cyber animal', 'mech beast',
      'وحش سيبراني', 'كلب آلي', 'ذئب آلي', 'حيوان آلي', 'وحش الي',
    ],
    targetScale: 2.4,
    build: (p) => createCyberBeastCreature(p),
  },

  // 41. Flying Scaled Wyvern Dragon
  {
    id: 'archetype.creature.dragon',
    name: 'Flying Scaled Wyvern Dragon',
    domain: 'creature',
    keywords: [
      'dragon', 'wyvern', 'drake', 'serpent', 'monster',
      'تنين', 'التنين', 'تنين مجنح',
    ],
    targetScale: 2.6,
    build: (p) => createDragonCreature(p),
  },

  // 42. Armored Medieval Knight Warrior
  {
    id: 'archetype.character.knight',
    name: 'Armored Medieval Knight Warrior',
    domain: 'character',
    keywords: [
      'knight', 'paladin', 'crusader', 'gladiator', 'swordsman', 'warrior', 'armor', 'armoured',
      'فارس', 'الفارس', 'محارب', 'المحارب', 'فارس مدرع', 'مبارز',
    ],
    targetScale: 2.6,
    build: (p) => createKnightWarrior(p),
  },

  // 43. Film Noir Detective in Trenchcoat
  {
    id: 'archetype.character.detective',
    name: 'Film Noir Detective',
    domain: 'character',
    keywords: [
      'detective', 'investigator', 'inspector', 'noir', 'sherlock', 'sleuth', 'agent', 'spy',
      'محقق', 'المحقق', 'مفتش', 'تحري', 'عميل', 'جاسوس',
    ],
    targetScale: 2.6,
    build: (p) => createDetectiveCharacter(p),
  },

  // 44. Hospital Chief Surgeon / Doctor
  {
    id: 'archetype.character.surgeon',
    name: 'Hospital Chief Surgeon / Doctor',
    domain: 'character',
    keywords: [
      'surgeon', 'doctor', 'physician', 'medic', 'nurse', 'paramedic', 'hospital', 'scrubs',
      'طبيب', 'الطبيب', 'جراح', 'الجراح', 'ممرض', 'دكتور', 'مسعف',
    ],
    targetScale: 2.6,
    build: (p) => createDoctorSurgeon(p),
  },

  // 45. High-Performance Aerodynamic Sports Car
  {
    id: 'archetype.vehicle.sportscar',
    name: 'High-Performance Sports Car',
    domain: 'vehicle',
    keywords: [
      'sportscar', 'supercar', 'racecar', 'ferrari', 'lamborghini', 'porsche', 'corvette', 'coupe', 'sports car', 'race car',
      'سيارة سباق', 'فيراري', 'سيارة رياضية', 'عربيه سباق',
    ],
    targetScale: 2.4,
    build: (p) => createSportsCarVehicle(p),
  },

  // 46. Main Battle Tank with Continuous Tracks
  {
    id: 'archetype.vehicle.tank',
    name: 'Main Battle Tank',
    domain: 'vehicle',
    keywords: [
      'tank', 'panzer', 'apc', 'artillery', 'armored', 'armoured', 'tanker',
      'دبابة', 'الدبابة', 'مدرعة', 'دبابه', 'المدرعه',
    ],
    targetScale: 2.4,
    build: (p) => createTankArmoredVehicle(p),
  },

  // 47. Deep-Sea Exploration Submarine
  {
    id: 'archetype.vehicle.submarine',
    name: 'Deep-Sea Exploration Submarine',
    domain: 'vehicle',
    keywords: [
      'submarine', 'submersible', 'sub', 'u-boat', 'underwater',
      'غواصة', 'الغواصة', 'غواصه',
    ],
    targetScale: 2.4,
    build: (p) => createSubmarineVessel(p),
  },

  // 48. Grand Medieval Fortress Castle Tower
  {
    id: 'archetype.architecture.castletower',
    name: 'Grand Medieval Castle Tower',
    domain: 'architecture',
    keywords: [
      'castle', 'fortress', 'keep', 'citadel', 'stronghold', 'rampart',
      'قلعة', 'القلعة', 'حصن', 'الحصن', 'برج قلعة', 'قلعه',
    ],
    targetScale: 2.5,
    build: (p) => createCastleTowerArchitecture(p),
  },
];

export interface SpatialReasoningTrace {
  step01Prompt: string;
  step02Intent: {
    domain: string;
    primaryMaterial: string;
    aspectRatio: string;
  };
  step03Object: {
    label: string;
    subparts: string[];
    articulation: string;
  };
  step04Representation: {
    type: 'literal' | 'schematic' | 'functional-silhouette';
    proportions: string;
  };
  step05Routing: {
    decision: 'reuse-kit' | 'adapt-kit' | 'author-custom-csg';
    source: string;
    score: number;
    rationale: string;
  };
  step07Scaffolding: {
    chamferBevels: boolean;
    kinematicsActive: boolean;
    pbrResponse: string;
    estimatedParts: number;
  };
}

const ARCHETYPE_SUBPARTS_MAP: Record<string, string[]> = {
  'timber-cottage': ['Bevelled Stone Foundation', 'Timber Wall Shell', 'Timber Gable Roof', 'Stone Chimney Stack', 'Recessed Door Inset'],
  'round-tower': ['Tapered Stone Cylinder', 'Corbelled Parapet', 'Battlements Crenellation', 'Slit Arrow Loops', 'Embrasures'],
  'watermill': ['Millhouse Scaffolding', 'Flume Sluice Box', 'Radial Paddle Wheel', 'Axletree Drive Pinion', 'Churn Basin'],
  'market-stall': ['Corner Upright Posts', 'Timber Counter Deck', 'Slanted Canvas Canopy', 'Cross Bracing Struts'],
  'stone-bridge': ['Segmental Pier Arch', 'Spandrel Parapets', 'Cobblestone Roadway', 'Water Cutwaters'],
  'biped-walker': ['Stylized Humanoid Head & Hair', 'Anatomical Neck & Torso', 'Two-Bone Articulated Arms & Hands', 'Pelvis & Articulated Legs', 'Stance Feet Shoes'],
  'archetype.character.biped': ['Stylized Humanoid Head & Hair', 'Anatomical Neck & Torso', 'Two-Bone Articulated Arms & Hands', 'Pelvis & Articulated Legs', 'Stance Feet Shoes'],
  'scifi-fighter': ['Needle Fuselage', 'Delta Wing Sweeps', 'Twin Wingtip Canards', 'Cockpit Viewport Canopy', 'Dual Plasma Thrusters'],
  'scifi-drone': ['Central Sensor Hub', 'Hex Rotor Arm Booms', 'Motor Pod Housings', 'High-Speed Blade Propellers', 'Gimbal Camera Lens'],
  'moon-stag': ['Sculpted Torso Barrel', 'Articulated Quadruped Legs', 'Neck Arch', 'Dual Antler Tines', 'Glowing Runes'],
  'guitar': ['Figure-8 Resonator Body', 'Spruce Soundboard', 'Soundhole Port', 'Hardwood Neck Beam', 'Headstock & Pegs'],
  'laptop': ['Base Keyboard Chassis', 'Recessed Trackpad', 'Key Matrix Plate', 'Friction Hinge', 'Bezel Screen Display'],
  'robot-mecha': ['Armored Torso Hull', 'Twin Shoulder Pauldrons', 'Actuated Bicep-Forearm', 'Piston Hydraulic Grippers', 'Reactor Core'],
  'piano-keyboard': ['Chassis Keybed Frame', '52 Diatonic Ivory Keys', '36 Chromatic Ebony Sharps', 'Rear Sheet Music Stand', 'Sustain Pedal Lyre'],
  'percussion-drum': ['Hardwood Shell Cylinder', 'Resonant Batter Drumhead', 'Chrome Counterhoop Rings', 'Tension Rod Lugs', 'Tripod Stand'],
  'woodwind-flute': ['Cylindrical Bore Body', 'Tapered Headjoint & Lip Plate', 'Key Pad Mechanism', 'Split-E Bridge Linkage', 'Cork Crown Cap'],
  'microscope': ['Heavy Horseshoe Base', 'Curved Arm Limb', 'Mechanical Specimen Stage', 'Triple Revolving Nosepiece', 'Dual Eyepiece Tubes'],
  'telescope': ['Solid Ash Tripod Stanchions', 'Equatorial Mount Gimbal', 'Anodized Optical Tube', 'Dew Shield Hood', 'Star Diagonal Eyepiece'],
  'camera': ['Magnesium Alloy Body', 'Rubberized Handgrip', 'Multi-Element Lens Barrel', 'Optical Viewfinder Eyecup', 'Command Control Dials'],
  'motorcycle': ['Tubular Cradle Frame', 'Telescopic Fork Assembly', 'V-Twin Engine Block', 'Teardrop Fuel Tank', 'Dual Spoke Wheels'],
  'aircraft': ['Aerodynamic Tube Fuselage', 'Swept Main Wings', 'Underwing Turbofan Nacelles', 'T-Tail Vertical Stabilizer', 'Tricycle Gear'],
  'table-lamp': ['Weighted Brass Base Disk', 'Dual Articulated Counterpoise Arms', 'Dome Cone Reflector Shade', 'Tension Knurled Knobs', 'Warm Filament Bulb'],
  'oscillating-fan': ['Flanged Weighted Pedestal', 'Telescoping Tubular Mast', 'Electric Motor Nacelle Housing', 'Wire Safety Cage', 'Aerodynamic 3-Blade Impeller'],
  'timepiece-clock': ['Octagonal Chamfered Bezel', 'Enamelled Numerals Dial', 'Dual Spindle Clock Hands', 'Clear Mineral Glass Cover', 'Cast Suspension Ring'],
  'appliance-cabinet': ['Welded Sheet Metal Chassis', 'Recessed Dual Doors', 'Horizontal Brushed Pull Handles', 'Recessed Kickplate Toe-Kick', 'Cooling Grille Louvers'],
  'bed-furniture': ['Hardwood Post Bedstead', 'Framed Headboard Slat Panel', 'Dual Bolted Side Rails', 'Box Spring Foundation', 'Plump Mattress & Pillows'],
  'shield-defense': ['Convex Curved Heater Shield Plate', 'Reinforced Riveted Rim Edge', 'Central Hardened Steel Boss Umbo', 'Rear Leather Forearm Straps'],
  'door-gate': ['Heavy Timber Jamb Frame', 'Vertical Tongue-and-Groove Planks', 'Cast Iron Strap Hinges', 'Sliding Drop-Latch Bolt', 'Overhead Lintel Header'],
  'audio-speaker': ['Acoustic MDF Cabinet Enclosure', 'Large Low-Frequency Bass Woofer', 'High-Frequency Silk Dome Tweeter', 'Circular Tuned Port', 'Rear Binding Posts'],
  'microphone': ['Heavy Cast Zinc Base Plate', 'Threaded Upright Shaft', 'Dynamic Cartridge Capsule Head', 'Woven Steel Mesh Windscreen', 'XLR Output Socket'],
  'hollow-vessel': ['Broad Footed Pedestal Base', 'Curved Ceramic Belly Body', 'Graceful Constricted Neck', 'Outward Flared Lip Rim', 'Optional Loop Handle'],
  'layered-food': ['Toasted Brioche Base Bun', 'Charbroiled Ground Patty', 'Melted Cheddar Slice', 'Layered Crisp Lettuce & Tomato', 'Sesame Crown Bun'],
  'stone-guildhall': ['Heavy Ashlar Foundation', 'Arcaded Portico Columns', 'Vaulted Grand Hall Walls', 'Steep Slated Roof Deck', 'Carved Relief Pediment'],
  'television': ['Slim Bezel Display Casing', 'Edge-to-Edge Glazed Panel', 'Rear Electronics Housing Pod', 'Dual Angled Chrome Legs', 'Input Connector Bay'],
  'stone-well': ['Circular Rubble Stone Basin', 'Aged Timber Twin Upright Posts', 'Gable Shingle Roof', 'Spindle Winch Drum', 'Suspended Oak Bucket'],
  'barrel': ['White Oak Convex Staves', 'Chiseled Top Head Disk', 'Dual Iron Belly Hoops', 'Top and Bottom Chime Hoops', 'Tapered Bunghole'],
  'crate': ['Corner Structural Battens', 'Horizontal Slat Planking', 'Diagonal Shear Braces', 'Countersunk Fastener Nails'],
  'lantern-post': ['Octagonal Iron Pedestal', 'Fluted Cast Post', 'Corbelled Support Bracket', 'Glazed Lantern Box', 'Warm Filament Core'],
  'tree-round': ['Tapered Hardwood Trunk', 'Root Flange Flare', 'Lower Foliage Bough', 'Mid Foliage Bough', 'Crown Canopy Mass'],
  'tree-pine': ['Vertical Spire Trunk', '3-Tier Conical Evergreen Branches', 'Needle Foliage Layering', 'Forest Bed Flare'],
  'zodiac-boat': ['Inflatable Pontoon Sponson Collar', 'Rigid V-Hull Keel', 'Transom Engine Plate', 'Dual Bench Thwarts', 'Outboard Motor Unit'],
  'helicopter': ['Pod Fuselage Cockpit', 'Tail Boom Empennage', 'Horizontal Tail Fin', 'Dual Skids Landing Gear', '4-Blade Main Rotor Mast'],
  'quadruped': ['Anatomical Ribcage Barrel', 'Dual Shoulder & Hip Girdles', 'Segmented Fore & Hind Legs', 'Articulated Paw/Hoof End-Effectors', 'Neck & Muzzle'],
  'blueprint-quadruped-walker': [
    'Barrel Trunk & Pelvic Girdle',
    'Two-Bone IK Legs & Cloven Hooves',
    'Arched Neck & Cranium',
    'Muzzle with Nostrils & Ears',
    'Swept Horns / Antlers',
    'Procedural Gait Cycloid Kinematics',
  ],
  'universal-furniture': ['Heavy Solid Hardwood Surface Top', 'Quad Chamfered Support Legs', 'Perimeter Apron Rails', 'Corner Block Reinforcements'],
  'hero-weapon': ['Forged Full-Tang Core Blade', 'Hardened Steel Crossguard Quillons', 'Leather-Wrapped Handle Grip', 'Counterweight Pommel Finial'],
  'cart-assembly': ['Dual Spoked Wood Carriage Wheels', 'Solid Steel Axle Rod', 'Plank Cargo Tray Box', 'Twin Draft Animal Thills'],
  'fence-run': ['Square Timber Fence Posts', 'Dual Horizontal Cross Rails', 'Pointed Slat Pickets', 'Mortise & Tenon Joinery'],
  'signboard': ['Cast Iron Swivel Bracket', 'Solid Oak Hanging Plaque', 'Brass Suspension Ring Eyes', 'Relief Border Trim Frame'],
  'rock-cluster': ['Primary Weathered Boulder Core', 'Secondary Angular Fracture Slabs', 'Base Cobble Talus Scree', 'Moss Texture Crevices'],
  'reeds-cluster': ['Clustered Tapered Reed Culms', 'Graceful Curved Leaf Blades', 'Velvety Cylindrical Catkin Heads', 'Marsh Rooting Mound'],
  'clothesline': ['Twin Wood T-Frame Uprights', 'Taut Suspended Sisal Ropes', 'Hanging Textile Drape Meshes', 'Pin Clothespins'],
  'ninja': ['Shinobi Mask & Hood Cowl', 'Night Recon Tunic', 'Dual Crossed Back Katanas', 'Crimson Waist Obi Sash', 'Steel Forearm Bracers & Tabi Boots'],
  'archetype.character.ninja': ['Shinobi Mask & Hood Cowl', 'Night Recon Tunic', 'Dual Crossed Back Katanas', 'Crimson Waist Obi Sash', 'Steel Forearm Bracers & Tabi Boots'],
  'cyberbeast': ['Titanium Armored Skull & Visor', 'Hydraulic Quadruped Piston Limbs', 'Carbon-Fiber Spine & Energy Conduit', 'Internal Heat Radiator Grilles', 'Segmented Whip Stinger Tail'],
  'archetype.creature.cyberbeast': ['Titanium Armored Skull & Visor', 'Hydraulic Quadruped Piston Limbs', 'Carbon-Fiber Spine & Energy Conduit', 'Internal Heat Radiator Grilles', 'Segmented Whip Stinger Tail'],
  'dragon': ['Horned Crest Dragon Skull', 'Dual Membranous Bat Wings', 'Segmented Serpentine Neck', 'Quad Taloned Claws', 'Spined Barbed Tail'],
  'archetype.creature.dragon': ['Horned Crest Dragon Skull', 'Dual Membranous Bat Wings', 'Segmented Serpentine Neck', 'Quad Taloned Claws', 'Spined Barbed Tail'],
  'knight': ['Great Helm Visor & Comb', 'Hardened Steel Plate Cuirass', 'Engraved Heater Defense Shield', 'Forged Steel Longsword Blade', 'Segmented Pauldrons & Greaves'],
  'archetype.character.knight': ['Great Helm Visor & Comb', 'Hardened Steel Plate Cuirass', 'Engraved Heater Defense Shield', 'Forged Steel Longsword Blade', 'Segmented Pauldrons & Greaves'],
  'detective': ['Classic Creased Fedora Hat', 'Wide-Lapel Double-Breasted Trenchcoat', 'Cinch Waist Belt & Buckle', 'Formal Tie & Collar', 'Polished Oxfords Shoes'],
  'archetype.character.detective': ['Classic Creased Fedora Hat', 'Wide-Lapel Double-Breasted Trenchcoat', 'Cinch Waist Belt & Buckle', 'Formal Tie & Collar', 'Polished Oxfords Shoes'],
  'surgeon': ['Protective Hospital Scrub Cap', 'Pleated Surgical Face Mask', 'Binaural Tube Stethoscope', 'Teal Latex Medical Gloves', 'Hospital White Lab Coat'],
  'archetype.character.surgeon': ['Protective Hospital Scrub Cap', 'Pleated Surgical Face Mask', 'Binaural Tube Stethoscope', 'Teal Latex Medical Gloves', 'Hospital White Lab Coat'],
  'sportscar': ['Low-Slung Aerodynamic Chassis', 'Tinted Windshield Greenhouse', 'High-Downforce Rear Spoiler', 'Dual-Spoke Alloy Wheels & Brake Calipers', 'High-Intensity LED Projectors'],
  'archetype.vehicle.sportscar': ['Low-Slung Aerodynamic Chassis', 'Tinted Windshield Greenhouse', 'High-Downforce Rear Spoiler', 'Dual-Spoke Alloy Wheels & Brake Calipers', 'High-Intensity LED Projectors'],
  'tank': ['Continuous Heavy Rubberized Tracks', 'Multi-Wheel Road Bogeys', 'Sloped Armor Front Glacis', '360-Degree Traversing Turret', 'High-Velocity Smoothbore Cannon'],
  'archetype.vehicle.tank': ['Continuous Heavy Rubberized Tracks', 'Multi-Wheel Road Bogeys', 'Sloped Armor Front Glacis', '360-Degree Traversing Turret', 'High-Velocity Smoothbore Cannon'],
  'submarine': ['Streamlined Cylindrical Pressure Hull', 'Spherical Bow Sonar Dome', 'Sail Conning Tower & Periscope Mast', 'Aft Dive Planes & Hydrofoils', 'Seven-Blade Screw Propeller'],
  'archetype.vehicle.submarine': ['Streamlined Cylindrical Pressure Hull', 'Spherical Bow Sonar Dome', 'Sail Conning Tower & Periscope Mast', 'Aft Dive Planes & Hydrofoils', 'Seven-Blade Screw Propeller'],
  'castletower': ['Battered Solid Stone Foundation Plinth', 'Coursed Masonry Round Tower Shaft', 'Arched Heavy Timber Portcullis Entry', 'Crenellated Overhanging Machicolation Battlements', 'Conical Slate Roof & Heraldic Banner'],
  'archetype.architecture.castletower': ['Battered Solid Stone Foundation Plinth', 'Coursed Masonry Round Tower Shaft', 'Arched Heavy Timber Portcullis Entry', 'Crenellated Overhanging Machicolation Battlements', 'Conical Slate Roof & Heraldic Banner'],
  'quantumcore': ['Magnetic Toroidal Solenoids', 'Plasma Vacuum Chamber', 'Cryostat Vacuum Vessel', 'Cooling Busbar Grids', 'Glow Containment Field'],
  'archetype.scifi.quantumcore': ['Magnetic Toroidal Solenoids', 'Plasma Vacuum Chamber', 'Cryostat Vacuum Vessel', 'Cooling Busbar Grids', 'Glow Containment Field'],
};

export interface ArchetypeResolutionResult {
  matchedArchetype?: ObjectArchetype;
  confidence: number;
  query: string;
  reasoningTrace: SpatialReasoningTrace;
  build: (palette: ProceduralPalette) => ProceduralKitResult;
}

/**
 * 3Dviz Pro Max Archetype Resolver.
 * Uses BM25 token frequencies, query aliases, and Levenshtein typo scoring.
 * Strict query prioritization: user-typed subject names NEVER get overridden by a default 'human' category.
 * Falls back cleanly to First-Principles Morphometric Synthesis when no archetype matches.
 */
export function resolveObjectArchetype(
  query: string,
  category: string = 'custom'
): ArchetypeResolutionResult {
  const cleanQuery = (query || '').trim().toLowerCase();
  const cleanCategory = (category || 'custom').trim().toLowerCase();

  // 1. Separate user's explicit query tokens from the fallback category
  const rawQueryTokens = extractTokens(cleanQuery);

  // Stop-word tokens (numbers, pure articles, empty placeholders)
  const STOP_TOKENS = new Set([
    'item', 'object', 'element', 'new', 'unnamed',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
    'detailed', 'distinct', 'custom', 'a', 'an', 'the',
    'عنصر', 'شيء', 'جديد',
  ]);

  const substantiveQueryTokens = rawQueryTokens.filter((t) => !STOP_TOKENS.has(t));

  // Determine effective search tokens:
  // If the user specified substantive terms in the name or prompt, PRIORITIZE THEM STRICTLY.
  // Never let a default category: 'human' hijack an explicit object name like 'table' or 'car'!
  const isQuerySubstantive = substantiveQueryTokens.length > 0;
  const activeTokens = isQuerySubstantive
    ? substantiveQueryTokens
    : (rawQueryTokens.length > 0 ? rawQueryTokens : extractTokens(cleanCategory));

  // Expand with query aliases (strictly on exact token match - NEVER Levenshtein distance on alias dictionary keys!)
  const expandedTokens = new Set<string>(activeTokens);
  for (const token of activeTokens) {
    const directExpansion = QUERY_ALIASES[token];
    if (directExpansion) {
      for (const exp of directExpansion) expandedTokens.add(exp);
    }
  }

  let bestArchetype: ObjectArchetype | null = null;
  let highestScore = 0;

  // BM25 parameters tuned for concise keyword descriptors
  const k1 = 1.2;
  const b = 0.15;
  const avgKwLength = 25;

  for (const archetype of ARCHETYPE_REGISTRY) {
    let score = 0;
    const docLength = archetype.keywords.length;

    for (const token of expandedTokens) {
      for (const kw of archetype.keywords) {
        const cleanKw = extractTokens(kw)[0] || kw.toLowerCase();

        // Exact match
        if (cleanKw === token) {
          score += 10.0;
        }
        // Sub-word stem match (minimum 4 chars prefix stem)
        else if (token.length >= 4 && cleanKw.length >= 4 && (cleanKw.startsWith(token) || token.startsWith(cleanKw))) {
          score += 5.0;
        }
        // Typo tolerance: Levenshtein distance <= 1 for words >= 5 characters (comparing word to keyword ONLY, never alias root!)
        else if (token.length >= 5 && cleanKw.length >= 5) {
          const dist = levenshteinDistance(token, cleanKw);
          if (dist === 1) score += 4.0;
          else if (dist === 2 && token.length >= 7) score += 2.0;
        }
      }
    }

    // BM25 length normalization
    let normalizedScore = score / (1 + k1 * (1 - b + b * (docLength / avgKwLength)));
    if (cleanCategory && cleanCategory !== 'custom' && cleanCategory !== 'all') {
      if (archetype.domain === cleanCategory) {
        normalizedScore *= 3.0;
      }
    }

    if (normalizedScore > highestScore) {
      highestScore = normalizedScore;
      bestArchetype = archetype;
    }
  }

  // Minimum confidence threshold for archetype matching
  if (bestArchetype && highestScore >= 1.0) {
    const isKinematic = ['walker', 'drone', 'fighter', 'helicopter', 'stag', 'watermill', 'fan', 'clock', 'cyberbeast', 'dragon', 'ninja'].some((k) =>
      bestArchetype!.id.includes(k)
    );
    const subpartsKey = bestArchetype.id.replace('archetype.', '').split('.').pop() || '';
    const subparts =
      ARCHETYPE_SUBPARTS_MAP[bestArchetype.id] ||
      ARCHETYPE_SUBPARTS_MAP[subpartsKey] ||
      ARCHETYPE_SUBPARTS_MAP[bestArchetype.domain] || [
        'Core Chassis',
        'Structural Foundation',
        'Surface Trim',
        'Fasteners',
      ];
    const routingDecision: 'reuse-kit' | 'adapt-kit' = highestScore >= 3.0 ? 'reuse-kit' : 'adapt-kit';

    const reasoningTrace: SpatialReasoningTrace = {
      step01Prompt: cleanQuery || cleanCategory,
      step02Intent: {
        domain: bestArchetype.domain,
        primaryMaterial:
          bestArchetype.domain === 'architecture'
            ? 'Aged Timber & Chiseled Stone'
            : bestArchetype.domain === 'vehicle' || bestArchetype.domain === 'scifi'
            ? 'Machined Aerospace Alloy & Glass'
            : bestArchetype.domain === 'foliage'
            ? 'Organic Bark & Pine Needle Foliage'
            : bestArchetype.domain === 'instrument'
            ? 'Resonant Tone Wood & Polished Brass'
            : 'Industrial Ferrous Metal',
        aspectRatio: `Target Scale ${bestArchetype.targetScale.toFixed(1)}x`,
      },
      step03Object: {
        label: bestArchetype.name,
        subparts,
        articulation: isKinematic ? 'Active Kinematic Loop (60 FPS)' : 'Rigid Static Anchor',
      },
      step04Representation: {
        type: 'literal',
        proportions: `Scale ${bestArchetype.targetScale.toFixed(1)}x Bounding Envelope`,
      },
      step05Routing: {
        decision: routingDecision,
        source: `procedural-kit:${bestArchetype.id}`,
        score: Math.round(highestScore * 10) / 10,
        rationale:
          routingDecision === 'reuse-kit'
            ? `BM25 matched archetype "${bestArchetype.name}" with high confidence.`
            : `BM25 adapted archetype "${bestArchetype.name}" via sub-word/alias expansion.`,
      },
      step07Scaffolding: {
        chamferBevels: true,
        kinematicsActive: isKinematic,
        pbrResponse: 'PBR Physical Material (Roughness + Metalness + Bump Maps)',
        estimatedParts: subparts.length,
      },
    };

    return {
      matchedArchetype: bestArchetype,
      confidence: highestScore,
      query: cleanQuery || cleanCategory,
      reasoningTrace,
      build: (palette: ProceduralPalette) => {
        const res = bestArchetype!.build(palette, cleanQuery || cleanCategory);
        res.group.scale.setScalar(bestArchetype!.targetScale);
        return res;
      },
    };
  }

  // 3. Category-Aware Domain Fallback (The Golden Rule):
  // When no specific archetype scored >= 1.0, NEVER turn characters, creatures,
  // vehicles, or architecture into an abstract stone plinth with a cyan slit!
  const q = (cleanQuery || cleanCategory).toLowerCase();

  // A. Human / Character Domain Fallback
  const isCharacterDomain =
    cleanCategory === 'character' ||
    cleanCategory === 'human' ||
    /\b(character|actor|human|person|man|woman|girl|boy|soldier|guard|villager|hero|assassin|ninja|warrior|knight|detective|doctor|nurse|biped|walker|lead|subject|npc|figure|شخص|انسان|ممثل|رجل|امراه|فتاه|جندي|فارس|محارب|محقق|طبيب)\b/i.test(q);

  if (isCharacterDomain) {
    let builder = (p: ProceduralPalette) => createBipedWalker(p, /\b(woman|girl|female|lady|queen|actress|daughter|mother)\b/i.test(q));
    let label = 'Articulated Biped Walker';
    let kitSource = 'archetype.character.biped';

    if (/\b(ninja|shinobi|assassin|shadow|ronin|نينجا)\b/i.test(q)) {
      builder = createNinjaCharacter;
      label = 'Shadow Ninja Shinobi Assassin';
      kitSource = 'archetype.character.ninja';
    } else if (/\b(knight|paladin|crusader|warrior|gladiator|swordsman|فارس|محارب)\b/i.test(q)) {
      builder = createKnightWarrior;
      label = 'Armored Medieval Knight';
      kitSource = 'archetype.character.knight';
    } else if (/\b(detective|investigator|inspector|noir|sherlock|agent|spy|محقق|مفتش)\b/i.test(q)) {
      builder = createDetectiveCharacter;
      label = 'Film Noir Detective';
      kitSource = 'archetype.character.detective';
    } else if (/\b(doctor|surgeon|physician|medic|nurse|hospital|طبيب|جراح|دكتور)\b/i.test(q)) {
      builder = createDoctorSurgeon;
      label = 'Hospital Chief Surgeon';
      kitSource = 'archetype.character.surgeon';
    }

    const matchedArchetype: ObjectArchetype = {
      id: kitSource,
      name: label,
      domain: 'character',
      keywords: [label.toLowerCase()],
      targetScale: 2.6,
      build: builder,
    };

    return {
      matchedArchetype,
      confidence: 5.0,
      query: cleanQuery || cleanCategory,
      reasoningTrace: {
        step01Prompt: cleanQuery || cleanCategory,
        step02Intent: { domain: 'character', primaryMaterial: 'Flesh, Fabric & Plate Armor', aspectRatio: 'Target Scale 2.6x' },
        step03Object: {
          label,
          subparts: ARCHETYPE_SUBPARTS_MAP[kitSource] || ['Humanoid Head & Hair', 'Anatomical Torso', 'Two-Bone Articulated Arms', 'Pelvis & Articulated Legs', 'Stance Feet Shoes'],
          articulation: 'Articulated Skeleton (60 FPS)',
        },
        step04Representation: { type: 'literal', proportions: 'Scale 2.6x Humanoid Silhouette' },
        step05Routing: { decision: 'adapt-kit', source: `procedural-kit:${kitSource}`, score: 5.0, rationale: `Domain fallback routed to authentic ${label}.` },
        step07Scaffolding: { chamferBevels: true, kinematicsActive: true, pbrResponse: 'PBR Physical Material', estimatedParts: 12 },
      },
      build: (palette: ProceduralPalette) => {
        const res = builder(palette);
        res.group.scale.setScalar(2.6);
        return res;
      },
    };
  }

  // B. Creature / Animal Domain Fallback
  const isCreatureDomain =
    cleanCategory === 'creature' ||
    /\b(creature|beast|monster|animal|cow|cattle|bull|ox|bovine|calf|heifer|holstein|buffalo|dog|cat|hound|wolf|dragon|wyvern|drake|stag|deer|horse|lion|tiger|bear|quadruped|alien|وحش|حيوان|كائن|بقرة|بقر|ثور|عجل|جاموس|كلب|ذئب|اسد|نمر|تنين|غزال|حصان)\b/i.test(q);

  if (isCreatureDomain) {
    let builder: (palette: ProceduralPalette, query?: string) => ProceduralKitResult = (p, qStr) =>
      createQuadrupedWalker(extractQuadrupedMorphology(qStr || cleanQuery, p));
    let label = 'Articulated Quadruped Walker (3Dviz Pro Max)';
    let kitSource = 'blueprint-quadruped-walker';

    if (/\b(cyber|robot|mech|hound|cybernetic|war beast|machine|وحش سيبراني|كلب آلي)\b/i.test(q)) {
      builder = createCyberBeastCreature;
      label = 'Cybernetic War Beast / Mech Hound';
      kitSource = 'archetype.creature.cyberbeast';
    } else if (/\b(dragon|wyvern|drake|serpent|winged|تنين)\b/i.test(q)) {
      builder = createDragonCreature;
      label = 'Flying Scaled Wyvern Dragon';
      kitSource = 'archetype.creature.dragon';
    } else if (/\b(stag|deer|غزال)\b/i.test(q)) {
      builder = createMoonStag;
      label = 'Forest Moonwood Stag';
      kitSource = 'moon-stag';
    }

    const matchedArchetype: ObjectArchetype = {
      id: kitSource,
      name: label,
      domain: 'creature',
      keywords: [label.toLowerCase()],
      targetScale: 2.5,
      build: builder,
    };

    return {
      matchedArchetype,
      confidence: 5.0,
      query: cleanQuery || cleanCategory,
      reasoningTrace: {
        step01Prompt: cleanQuery || cleanCategory,
        step02Intent: { domain: 'creature', primaryMaterial: 'Organic Hide & Articulated Skeletal Chassis', aspectRatio: 'Target Scale 2.5x' },
        step03Object: {
          label,
          subparts: ARCHETYPE_SUBPARTS_MAP[kitSource] || ['Anatomical Ribcage Barrel', 'Dual Shoulder & Hip Girdles', 'Segmented Fore & Hind Legs', 'Articulated End-Effectors', 'Neck & Muzzle'],
          articulation: 'Active Kinematic Loop (60 FPS)',
        },
        step04Representation: { type: 'literal', proportions: 'Scale 2.5x Quadruped Silhouette' },
        step05Routing: { decision: 'adapt-kit', source: `procedural-kit:${kitSource}`, score: 5.0, rationale: `Domain fallback routed to authentic ${label}.` },
        step07Scaffolding: { chamferBevels: true, kinematicsActive: true, pbrResponse: 'PBR Physical Material', estimatedParts: 14 },
      },
      build: (palette: ProceduralPalette) => {
        const res = builder(palette);
        res.group.scale.setScalar(2.5);
        return res;
      },
    };
  }

  // C. Vehicle Domain Fallback
  const isVehicleDomain =
    cleanCategory === 'vehicle' ||
    /\b(vehicle|car|automobile|sedan|truck|suv|sportscar|racecar|tank|submarine|aircraft|airplane|plane|jet|helicopter|drone|boat|ship|craft|bike|motorcycle|cart|عربيه|سياره|مركبه|دبابه|غواصه|طياره|قارب)\b/i.test(q);

  if (isVehicleDomain) {
    let builder = createAutomobile;
    let label = 'Automobile Vehicle';
    let kitSource = 'automobile';

    if (/\b(tank|panzer|apc|artillery|armored|armoured|دبابة|مدرعة)\b/i.test(q)) {
      builder = createTankArmoredVehicle;
      label = 'Main Battle Tank';
      kitSource = 'archetype.vehicle.tank';
    } else if (/\b(submarine|submersible|sub|u-boat|underwater|غواصة)\b/i.test(q)) {
      builder = createSubmarineVessel;
      label = 'Deep-Sea Exploration Submarine';
      kitSource = 'archetype.vehicle.submarine';
    } else if (/\b(sportscar|supercar|racecar|ferrari|lamborghini|porsche|fast|سيارة سباق)\b/i.test(q)) {
      builder = createSportsCarVehicle;
      label = 'High-Performance Sports Car';
      kitSource = 'archetype.vehicle.sportscar';
    } else if (/\b(motorcycle|motorbike|bike|scooter|دباب|موتوسيكل)\b/i.test(q)) {
      builder = createMotorcycleAssembly;
      label = 'Articulated Motorcycle';
      kitSource = 'motorcycle';
    } else if (/\b(aircraft|airplane|plane|jet|طائرة)\b/i.test(q)) {
      builder = createAircraftAssembly;
      label = 'Fixed-Wing Aircraft';
      kitSource = 'aircraft';
    } else if (/\b(helicopter|chopper|طوافة)\b/i.test(q)) {
      builder = createHelicopter;
      label = 'Rotary Helicopter';
      kitSource = 'helicopter';
    } else if (/\b(drone|hover|درون)\b/i.test(q)) {
      builder = createSciFiDrone;
      label = 'Sci-Fi Recon Drone';
      kitSource = 'scifi-drone';
    } else if (/\b(boat|zodiac|ship|yacht|قارب)\b/i.test(q)) {
      builder = createZodiacBoat;
      label = 'Zodiac Marine Craft';
      kitSource = 'zodiac-boat';
    } else if (/\b(cart|wagon|عربة)\b/i.test(q)) {
      builder = createCartAssembly;
      label = 'Two-Wheeled Farm Cart';
      kitSource = 'cart-assembly';
    }

    const matchedArchetype: ObjectArchetype = {
      id: kitSource,
      name: label,
      domain: 'vehicle',
      keywords: [label.toLowerCase()],
      targetScale: 2.4,
      build: builder,
    };

    return {
      matchedArchetype,
      confidence: 5.0,
      query: cleanQuery || cleanCategory,
      reasoningTrace: {
        step01Prompt: cleanQuery || cleanCategory,
        step02Intent: { domain: 'vehicle', primaryMaterial: 'Machined Alloy, Rubber & Glass', aspectRatio: 'Target Scale 2.4x' },
        step03Object: {
          label,
          subparts: ARCHETYPE_SUBPARTS_MAP[kitSource] || ['Aerodynamic Lower Chassis', 'Cab Glasshouse Greenhouse', 'Dual Axle Wheel Assemblies', 'Headlight Fixtures'],
          articulation: 'Rigid Static Anchor',
        },
        step04Representation: { type: 'literal', proportions: 'Scale 2.4x Vehicle Silhouette' },
        step05Routing: { decision: 'adapt-kit', source: `procedural-kit:${kitSource}`, score: 5.0, rationale: `Domain fallback routed to authentic ${label}.` },
        step07Scaffolding: { chamferBevels: true, kinematicsActive: false, pbrResponse: 'PBR Physical Material', estimatedParts: 10 },
      },
      build: (palette: ProceduralPalette) => {
        const res = builder(palette);
        res.group.scale.setScalar(2.4);
        return res;
      },
    };
  }

  // D. Architecture Domain Fallback
  const isArchitectureDomain =
    cleanCategory === 'architecture' ||
    cleanCategory === 'building' ||
    /\b(building|architecture|cottage|house|home|cabin|tower|castle|fortress|keep|citadel|watermill|mill|bridge|guildhall|hall|gate|door|well|structure|temple|مبنى|بيت|منزل|كوخ|برج|قلعه|حصن|طاحونه|جسر|بوابه)\b/i.test(q);

  if (isArchitectureDomain) {
    let builder = createTimberCottage;
    let label = 'Timber Cottage';
    let kitSource = 'timber-cottage';

    if (/\b(castle|fortress|keep|citadel|قلعة|حصن)\b/i.test(q)) {
      builder = createCastleTowerArchitecture;
      label = 'Grand Medieval Castle Tower';
      kitSource = 'archetype.architecture.castletower';
    } else if (/\b(tower|watchtower|برج)\b/i.test(q)) {
      builder = createRoundTower;
      label = 'Round Watchtower';
      kitSource = 'round-tower';
    } else if (/\b(watermill|mill|طاحونة)\b/i.test(q)) {
      builder = createWatermill;
      label = 'Medieval Watermill';
      kitSource = 'watermill';
    } else if (/\b(bridge|جسر)\b/i.test(q)) {
      builder = createStoneBridge;
      label = 'Segmental Stone Bridge';
      kitSource = 'stone-bridge';
    } else if (/\b(guildhall|hall|قاعة)\b/i.test(q)) {
      builder = createStoneGuildhall;
      label = 'Stone Guildhall';
      kitSource = 'stone-guildhall';
    } else if (/\b(well|بئر)\b/i.test(q)) {
      builder = createStoneWell;
      label = 'Village Stone Well';
      kitSource = 'stone-well';
    } else if (/\b(door|gate|portal|باب|بوابة)\b/i.test(q)) {
      builder = createDoorGateAssembly;
      label = 'Architectural Door / Gate';
      kitSource = 'door-gate';
    }

    const matchedArchetype: ObjectArchetype = {
      id: kitSource,
      name: label,
      domain: 'architecture',
      keywords: [label.toLowerCase()],
      targetScale: 2.6,
      build: builder,
    };

    return {
      matchedArchetype,
      confidence: 5.0,
      query: cleanQuery || cleanCategory,
      reasoningTrace: {
        step01Prompt: cleanQuery || cleanCategory,
        step02Intent: { domain: 'architecture', primaryMaterial: 'Aged Timber & Chiseled Ashlar Stone', aspectRatio: 'Target Scale 2.6x' },
        step03Object: {
          label,
          subparts: ARCHETYPE_SUBPARTS_MAP[kitSource] || ['Solid Stone Foundation', 'Masonry Wall Shell', 'Pitched Slated Roof', 'Recessed Door Inset'],
          articulation: 'Rigid Architectural Anchor',
        },
        step04Representation: { type: 'literal', proportions: 'Scale 2.6x Architectural Silhouette' },
        step05Routing: { decision: 'adapt-kit', source: `procedural-kit:${kitSource}`, score: 5.0, rationale: `Domain fallback routed to authentic ${label}.` },
        step07Scaffolding: { chamferBevels: true, kinematicsActive: false, pbrResponse: 'PBR Physical Material', estimatedParts: 12 },
      },
      build: (palette: ProceduralPalette) => {
        const res = builder(palette);
        res.group.scale.setScalar(2.6);
        return res;
      },
    };
  }

  // E. Furniture Domain Fallback
  const isFurnitureDomain =
    cleanCategory === 'furniture' ||
    /\b(table|chair|bench|bed|cabinet|desk|furniture|طاوله|كرسي|سرير|مكتب|دولاب)\b/i.test(q);

  if (isFurnitureDomain) {
    let builder: (palette: ProceduralPalette) => ProceduralKitResult = (p) => createUniversalFurniture('table', p);
    let label = 'Handcrafted Wood Furniture';
    let kitSource = 'universal-furniture';

    if (/\b(bed|mattress|سرير)\b/i.test(q)) {
      builder = (p) => createBedFurnitureAssembly(p);
      label = 'Bed Frame & Mattress';
      kitSource = 'bed-furniture';
    } else if (/\b(cabinet|cupboard|wardrobe|خزانة|دولاب)\b/i.test(q)) {
      builder = (p) => createApplianceCabinetAssembly(p);
      label = 'Cabinet Unit';
      kitSource = 'appliance-cabinet';
    } else if (/\b(chair|bench|مقعد|كرسي)\b/i.test(q)) {
      builder = (p) => createUniversalFurniture('chair', p);
      label = 'Turned Wooden Chair';
      kitSource = 'universal-chair';
    } else if (/\b(sofa|couch|أريكة|كنبة)\b/i.test(q)) {
      builder = (p) => createUniversalFurniture('sofa', p);
      label = 'Upholstered Sofa';
      kitSource = 'universal-sofa';
    }

    const matchedArchetype: ObjectArchetype = {
      id: kitSource,
      name: label,
      domain: 'furniture',
      keywords: [label.toLowerCase()],
      targetScale: 2.2,
      build: builder,
    };

    return {
      matchedArchetype,
      confidence: 5.0,
      query: cleanQuery || cleanCategory,
      reasoningTrace: {
        step01Prompt: cleanQuery || cleanCategory,
        step02Intent: { domain: 'furniture', primaryMaterial: 'Hardwood & Joinery', aspectRatio: 'Target Scale 2.2x' },
        step03Object: { label, subparts: ARCHETYPE_SUBPARTS_MAP[kitSource] || ['Chamfered Top Deck', 'Four Turned Legs', 'Perimeter Apron'], articulation: 'Rigid Anchor' },
        step04Representation: { type: 'literal', proportions: 'Scale 2.2x Furniture Silhouette' },
        step05Routing: { decision: 'adapt-kit', source: `procedural-kit:${kitSource}`, score: 5.0, rationale: `Domain fallback routed to authentic ${label}.` },
        step07Scaffolding: { chamferBevels: true, kinematicsActive: false, pbrResponse: 'PBR Physical Material', estimatedParts: 6 },
      },
      build: (palette: ProceduralPalette) => {
        const res = builder(palette);
        res.group.scale.setScalar(2.2);
        return res;
      },
    };
  }

  // F. Weapons Domain Fallback
  const isWeaponDomain =
    cleanCategory === 'weapons' ||
    /\b(sword|blade|dagger|saber|katana|shield|axe|spear|weapon|سيف|درع|سلاح|خنجر)\b/i.test(q);

  if (isWeaponDomain) {
    const isShield = /\b(shield|buckler|درع)\b/i.test(q);
    const builder: (palette: ProceduralPalette) => ProceduralKitResult = isShield
      ? (p) => createShieldDefenseAssembly(p)
      : (p) => createHeroWeaponProp('sword', p);
    const label = isShield ? 'Heater Defense Shield' : 'Forged Hero Longsword';
    const kitSource = isShield ? 'shield-defense' : 'hero-weapon';

    const matchedArchetype: ObjectArchetype = {
      id: kitSource,
      name: label,
      domain: 'weapons',
      keywords: [label.toLowerCase()],
      targetScale: 2.2,
      build: builder,
    };

    return {
      matchedArchetype,
      confidence: 5.0,
      query: cleanQuery || cleanCategory,
      reasoningTrace: {
        step01Prompt: cleanQuery || cleanCategory,
        step02Intent: { domain: 'weapons', primaryMaterial: 'Tempered High-Carbon Steel', aspectRatio: 'Target Scale 2.2x' },
        step03Object: { label, subparts: ARCHETYPE_SUBPARTS_MAP[kitSource] || ['Forged Blade/Plate', 'Crossguard/Rim', 'Leather Grip'], articulation: 'Rigid Anchor' },
        step04Representation: { type: 'literal', proportions: 'Scale 2.2x Weapon Silhouette' },
        step05Routing: { decision: 'adapt-kit', source: `procedural-kit:${kitSource}`, score: 5.0, rationale: `Domain fallback routed to authentic ${label}.` },
        step07Scaffolding: { chamferBevels: true, kinematicsActive: false, pbrResponse: 'PBR Physical Material', estimatedParts: 5 },
      },
      build: (palette: ProceduralPalette) => {
        const res = builder(palette);
        res.group.scale.setScalar(2.2);
        return res;
      },
    };
  }

  // G. Nature Domain Fallback
  const isNatureDomain =
    cleanCategory === 'nature' ||
    /\b(tree|pine|fir|boulder|rock|stone|cliff|reeds|plant|bush|foliage|شجر|صخر|نبات|قصب)\b/i.test(q);

  if (isNatureDomain) {
    let builder = createTreeRound;
    let label = 'Deciduous Oak Tree';
    let kitSource = 'tree-round';

    if (/\b(pine|conifer|fir|evergreen|صنوبر)\b/i.test(q)) {
      builder = createPineTree;
      label = 'Evergreen Pine Tree';
      kitSource = 'tree-pine';
    } else if (/\b(rock|boulder|stone|crag|cliff|صخرة|حجر)\b/i.test(q)) {
      builder = createRockClusterAssembly;
      label = 'Glacial Rock Cluster';
      kitSource = 'rock-cluster';
    } else if (/\b(reeds|reed|cattails|bamboo|قصب)\b/i.test(q)) {
      builder = createReedsAssembly;
      label = 'Marsh Reeds & Cattails';
      kitSource = 'reeds-cluster';
    }

    const matchedArchetype: ObjectArchetype = {
      id: kitSource,
      name: label,
      domain: 'nature',
      keywords: [label.toLowerCase()],
      targetScale: 2.6,
      build: builder,
    };

    return {
      matchedArchetype,
      confidence: 5.0,
      query: cleanQuery || cleanCategory,
      reasoningTrace: {
        step01Prompt: cleanQuery || cleanCategory,
        step02Intent: { domain: 'nature', primaryMaterial: 'Organic Wood, Bark & Foliage', aspectRatio: 'Target Scale 2.6x' },
        step03Object: { label, subparts: ARCHETYPE_SUBPARTS_MAP[kitSource] || ['Trunk/Core', 'Branch Boughs', 'Foliage Canopy'], articulation: 'Rigid Anchor' },
        step04Representation: { type: 'literal', proportions: 'Scale 2.6x Nature Silhouette' },
        step05Routing: { decision: 'adapt-kit', source: `procedural-kit:${kitSource}`, score: 5.0, rationale: `Domain fallback routed to authentic ${label}.` },
        step07Scaffolding: { chamferBevels: true, kinematicsActive: false, pbrResponse: 'PBR Physical Material', estimatedParts: 8 },
      },
      build: (palette: ProceduralPalette) => {
        const res = builder(palette);
        res.group.scale.setScalar(2.6);
        return res;
      },
    };
  }

  // 4. Fallback to First-Principles Morphometric Synthesis ONLY for abstract custom geometric entities
  const isTall = /\b(tower|pole|staff|spear|column|antenna|monolith|pillar|tall|rod|spire|obelisk|mast|totem|chimney)\b/i.test(q);
  const isRound = /\b(ball|sphere|globe|orb|wheel|disc|coin|ring|donut|round|circle|gyro|rotor)\b/i.test(q);
  const isWide = /\b(bench|couch|platform|table|bridge|wall|desk|wide|flat|slab|shelf|altar|stage|counter|chassis)\b/i.test(q);
  const isMechanical = /\b(engine|motor|generator|pump|gear|press|valve|turbine|flywheel|boiler|furnace|compressor|machine|apparatus|centrifuge)\b/i.test(q);
  const isHighTech = /\b(sensor|laser|scanner|device|gadget|terminal|console|spectrometer|accelerator|pod|capsule|module|data|quantum|battery|reactor|core)\b/i.test(q);
  const isCrystalline = /\b(crystal|gem|diamond|prism|glass|ice|magic|hologram|ruby|emerald|mineral|ore)\b/i.test(q);
  const isWood = /\b(wood|timber|rustic|wooden|ancient|antique|plank|log|timberwork)\b/i.test(q);

  const domain = isHighTech
    ? 'Advanced Tech / Laboratory'
    : isMechanical
    ? 'Industrial Machinery'
    : isCrystalline
    ? 'Crystalline / Mineral'
    : isWood
    ? 'Carpentry / Timber Structure'
    : isTall
    ? 'Monolith / Columnar Structure'
    : isWide
    ? 'Architectural Deck / Slab'
    : 'Custom Geometric Entity';

  const primaryMaterial = isCrystalline
    ? 'Refractive Glass / Crystal'
    : isWood
    ? 'Polished Hardwood'
    : isMechanical || isHighTech
    ? 'Machined Ferrous Alloy'
    : 'Chiseled Stone';

  const aspectRatio = isTall
    ? 'Vertical Column (1 : 4 : 1)'
    : isWide
    ? 'Horizontal Platform (3 : 1 : 2)'
    : isRound
    ? 'Spherical Cage (1 : 1 : 1)'
    : 'Equilateral Chamfer Block (1 : 1 : 1)';

  const subparts = [
    'Foundational Chamfer Base',
    'Corner Anchor Fastener Studs',
    isTall
      ? 'Segmented Telescoping Riser Column'
      : isRound
      ? 'Multi-Axis Orbital Gimbal Cage'
      : isWide
      ? 'Structural Crossbeams & Deck Slabs'
      : isMechanical
      ? 'Machine Engine Block & Flywheel'
      : isHighTech
      ? 'Slanted Console Deck & Optical Lens'
      : 'Articulated Structural Housing',
    'Toroidal Collar Trim Rings',
    'Accent Apertures & Glowing Busbars',
  ];

  const morphometricTrace: SpatialReasoningTrace = {
    step01Prompt: cleanQuery || cleanCategory,
    step02Intent: {
      domain,
      primaryMaterial,
      aspectRatio,
    },
    step03Object: {
      label: cleanQuery ? cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1) : 'Morphometric Specimen',
      subparts,
      articulation: isMechanical || isHighTech ? 'Mechanical Actuator Links' : 'Rigid Structural Anchor',
    },
    step04Representation: {
      type: 'functional-silhouette',
      proportions: `${aspectRatio} - Bounding Envelope Calculated`,
    },
    step05Routing: {
      decision: 'author-custom-csg',
      source: 'morphometric-first-principles-solver',
      score: 0,
      rationale:
        'Novel/uncataloged prompt decomposed via First-Principles CSG (Constructive Solid Geometry) & Morphometrics.',
    },
    step07Scaffolding: {
      chamferBevels: true,
      kinematicsActive:
        q.includes('centrifuge') || q.includes('reactor') || q.includes('rotor') || q.includes('core'),
      pbrResponse: 'Procedural Physical Material PBR (Roughness + Metalness)',
      estimatedParts: subparts.length + 4,
    },
  };

  return {
    confidence: 0,
    query: cleanQuery || cleanCategory,
    reasoningTrace: morphometricTrace,
    build: (palette: ProceduralPalette) => {
      const res = synthesizeMorphometricObject(cleanQuery || cleanCategory, palette);
      res.group.scale.setScalar(2.0);
      return res;
    },
  };
}
