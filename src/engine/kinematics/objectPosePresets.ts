/**
 * Object-Aware Posture, Orientation & Relational Stage Positioning Engine
 *
 * When a stage subject is NOT a humanoid (e.g. quadruped/creature, vehicle, aerial craft,
 * weapon/handheld prop, furniture/set piece, or environment prop), standard humanoid
 * bone-rig presets do not apply. This module provides:
 * 1. Semantic object category detection from actor kind, name, prompt, and sculpt spec
 * 2. Category-specific 3D posture & orientation presets (Pitch/Yaw/Roll + Elevation)
 * 3. Object-aware stage placement presets AND relational positioning relative to other stage objects
 */

import * as THREE from 'three';
import { Actor as ActorTrack } from '../../types/shotspec';

export type ObjectPoseCategory =
  | 'humanoid'
  | 'quadruped'
  | 'vehicle'
  | 'aerial'
  | 'weapon_prop'
  | 'furniture_set'
  | 'environment_prop';

export interface ObjectPosePreset {
  id: string;
  name: string;
  category: Exclude<ObjectPoseCategory, 'humanoid'>;
  description: string;
  /** Target Euler orientation in degrees (X = Pitch, Y = Yaw, Z = Roll) */
  rotation: { x: number; y: number; z: number };
  /** Optional stage elevation (Height Y in 0..50 stage coordinates) */
  elevationY?: number;
}

export interface StagePlacementOption {
  id: string;
  label: string;
  group: 'relational' | 'object' | 'stage';
  /** Target stage coordinates (x: 0..100, y: depth 0..100, z: elevation 0..50) */
  position?: { x: number; y: number; z: number };
  /** Optional orientation override (degrees) */
  rotation?: { x: number; y: number; z: number };
}

/**
 * Classifies an actor into its semantic 3D posture/positioning category.
 */
export function detectObjectPoseCategory(actor?: (Partial<ActorTrack> & { tokenPrompt?: string }) | null): ObjectPoseCategory {
  if (!actor) return 'humanoid';
  const kind = (actor.kind || 'human').toLowerCase();
  const promptText = actor.token || actor.tokenPrompt || '';
  const text = `${actor.name || ''} ${promptText} ${(actor as any).sculpt?.name || ''}`.toLowerCase();
  const sculptRoute = (actor as any).sculpt?.route || (actor as any).partGraph?.route;
  const sculptRig = (actor as any).sculpt?.rig || (actor as any).partGraph?.rig;

  // 0. Explicit Human Person check FIRST so a human character "holding a pistol" or "sitting on a chair" is never misclassified as a weapon or furniture prop
  const hasExplicitHuman =
    /\b(character|person|man|woman|boy|girl|child|kid|baby|lady|gentleman|guy|dude|human|actor|actress|hero|heroine|villain|knight|warrior|archer|scout|detective|officer|cop|police|soldier|doctor|surgeon|nurse|scientist|pilot|driver|chef|worker|wizard|mage|witch|priest|monk|king|queen|prince|princess|pirate|cowboy|astronaut|ninja|samurai|guard|villager|citizen|pedestrian|dancer|singer|musician|mannequin|biped)\b/i.test(
      text
    ) || /(شخصية|رجل|امرأة|ولد|بنت|طفل|إنسان|بطل|فارس|محارب|نينجا|طبيب|محقق|شرطي|جندي|ممثل|ساحر|ملك|ملكة)/.test(text);

  const hasNonHumanSculpt =
    sculptRoute === 'quadruped-walker' ||
    sculptRoute === 'vehicle' ||
    sculptRoute === 'prop' ||
    (sculptRig && sculptRig !== 'humanoid');

  if (
    !hasNonHumanSculpt &&
    !isNonHumanKind(kind) &&
    (hasExplicitHuman || sculptRig === 'humanoid' || (kind === 'human' && !promptText && !actor.name))
  ) {
    return 'humanoid';
  }

  // 1. Quadrupeds / Animals / Creatures
  if (
    sculptRoute === 'quadruped-walker' ||
    kind === 'animal' ||
    kind === 'quadruped' ||
    /\b(dog|hound|wolf|canine|cat|feline|lion|tiger|panther|horse|stallion|pony|stag|deer|elk|bear|boar|bull|cow|sheep|goat|fox|rabbit|beast|cyberbeast|dragon|wyvern|drake|creature|monster)\b/i.test(
      text
    ) ||
    /(كلب|ذئب|قط|حصان|فرس|أسد|نمر|غزال|وعل|دب|تنين|وحش|حيوان)/.test(text)
  ) {
    return 'quadruped';
  }

  // 2. Aerial / Drones / Aircraft
  if (
    /\b(drone|quadcopter|uav|helicopter|chopper|aircraft|airplane|plane|jet|fighter|biplane|spaceship|starship|ufo|shuttle|blimp|airship|bird|eagle|falcon|hawk)\b/i.test(
      text
    ) ||
    /(طائرة|مروحية|هليكوبتر|درون|مقاتلة|مركبة فضائية|صقر|نسر)/.test(text)
  ) {
    return 'aerial';
  }

  // 3. Ground & Marine Vehicles
  if (
    kind === 'vehicle' ||
    /\b(car|automobile|sedan|coupe|sportscar|supercar|suv|jeep|truck|pickup|van|bus|taxi|police car|motorcycle|motorbike|bike|bicycle|scooter|vespa|chopper|tank|apc|cart|wagon|chariot|wheelbarrow|boat|zodiac|yacht|ship|submarine|vessel)\b/i.test(
      text
    ) ||
    /(سيارة|مركبة|شاحنة|حافلة|دراجة|موتوسيكل|دباب|دبابة|عربة|قارب|سفينة|غواصة)/.test(text)
  ) {
    return 'vehicle';
  }

  // 4. Weapons & Handheld Hero Props
  if (
    /\b(sword|blade|katana|sabre|dagger|knife|axe|hatchet|hammer|mace|spear|lance|halberd|staff|wand|bow|crossbow|arrow|shield|buckler|gun|pistol|revolver|rifle|shotgun|blaster|flute|woodwind|nay|recorder|clarine|oboe|guitar|violin|lute|oud|drum|microphone|mic|flashlight|torch|lantern|bottle|potion|goblet|cup|mug|chalice|ring|jewel|crown|book|scroll|key|compass|camera|lens|telescope|microscope)\b/i.test(
      text
    ) ||
    /(سيف|خنجر|فأس|رمح|عصا|قوس|درع|مسدس|بندقية|ناي|فلوت|مزمار|عود|جيتار|طبلة|ميكروفون|فانوس|شعلة|زجاجة|كأس|خاتم|تاج|كتاب|مفتاح|كاميرا|عدسة|منظار)/.test(
      text
    )
  ) {
    return 'weapon_prop';
  }

  // 5. Furniture, Set Pieces & Interior Appliances
  if (
    /\b(chair|armchair|throne|stool|bench|sofa|couch|table|desk|workbench|counter|bed|bunk|mattress|cabinet|wardrobe|closet|bookshelf|shelf|rack|chest|trunk|crate|box|barrel|keg|cask|lamp|chandelier|sconce|fan|television|tv|monitor|screen|speaker|radio|piano|keyboard|organ|clock|watch|hourglass|door|gate|portal|window|mirror|vase|pot|urn|bowl|plate|laptop|computer)\b/i.test(
      text
    ) ||
    /(كرسي|عرش|مقعد|أريكة|كنبة|طاولة|مكتب|سرير|خزانة|دولاب|رف|صندوق|برميل|مصباح|أباجورة|مروحة|تلفزيون|شاشة|سماعة|بيانو|ساعة|باب|بوابة|مرآة|مزهرية|حاسوب|لابتوب)/.test(
      text
    )
  ) {
    return 'furniture_set';
  }

  // 6. Fallback Human Person check
  if ((kind === 'human' || kind === 'character' || sculptRig === 'humanoid') && (hasExplicitHuman || (kind === 'human' && !promptText))) {
    return 'humanoid';
  }

  if (kind === 'human' && !isNonHumanKind(kind)) {
    return 'humanoid';
  }

  return 'environment_prop';
}

function isNonHumanKind(kind: string): boolean {
  return (
    kind === 'prop' ||
    kind === 'vehicle' ||
    kind === 'building' ||
    kind === 'custom' ||
    kind === 'light' ||
    kind === 'cube' ||
    kind === 'sphere' ||
    kind === 'cylinder' ||
    kind === 'cone' ||
    kind === 'capsule' ||
    kind === 'plane' ||
    kind === 'cutout' ||
    kind === 'standee' ||
    kind === 'backdrop'
  );
}

export const OBJECT_CATEGORY_LABELS: Record<ObjectPoseCategory, string> = {
  humanoid: 'Humanoid Rig',
  quadruped: 'Creature / Quadruped Posture',
  vehicle: 'Vehicle Stance & Attitude',
  aerial: 'Flight Attitude & Altitude',
  weapon_prop: 'Prop / Item Orientation',
  furniture_set: 'Set Piece / Furniture Angle',
  environment_prop: 'Object / Environment Stance',
};

export const OBJECT_POSE_PRESETS: Record<Exclude<ObjectPoseCategory, 'humanoid'>, ObjectPosePreset[]> = {
  quadruped: [
    {
      id: 'quad-alert-stand',
      name: 'Alert Stand (Level)',
      category: 'quadruped',
      description: 'Balanced four-legged stance looking straight ahead.',
      rotation: { x: 0, y: 0, z: 0 },
      elevationY: 0,
    },
    {
      id: 'quad-hero-34',
      name: 'Hero 3/4 Profile (+35°)',
      category: 'quadruped',
      description: 'Classic 3/4 cinematic creature profile angled toward camera.',
      rotation: { x: 0, y: 35, z: 0 },
      elevationY: 0,
    },
    {
      id: 'quad-stalk-low',
      name: 'Stalking / Prowl Low',
      category: 'quadruped',
      description: 'Predatory forward pitch with shoulders lowered.',
      rotation: { x: 11, y: 0, z: 0 },
      elevationY: 0,
    },
    {
      id: 'quad-sit-haunches',
      name: 'Seated on Haunches',
      category: 'quadruped',
      description: 'Hindquarters lowered with chest and head pitched upright.',
      rotation: { x: -22, y: 0, z: 0 },
      elevationY: 0,
    },
    {
      id: 'quad-play-bow',
      name: 'Play Bow / Pounce Ready',
      category: 'quadruped',
      description: 'Deep front-leg bow coiled to spring forward.',
      rotation: { x: 18, y: 0, z: 0 },
      elevationY: 0,
    },
    {
      id: 'quad-rear-up',
      name: 'Rearing Up (Hind Legs)',
      category: 'quadruped',
      description: 'Dramatic rear-up on hind legs with forelegs elevated.',
      rotation: { x: -38, y: 0, z: 0 },
      elevationY: 1.5,
    },
    {
      id: 'quad-rest-side',
      name: 'Resting / Lying on Side',
      category: 'quadruped',
      description: 'Resting flat on its side on the stage floor.',
      rotation: { x: 4, y: 20, z: 82 },
      elevationY: 0,
    },
  ],

  vehicle: [
    {
      id: 'veh-parked-level',
      name: 'Parked Level (Front 0°)',
      category: 'vehicle',
      description: 'Level on the ground facing downstage.',
      rotation: { x: 0, y: 0, z: 0 },
      elevationY: 0,
    },
    {
      id: 'veh-hero-left',
      name: 'Hero 3/4 Showroom Left (+35°)',
      category: 'vehicle',
      description: 'Classic automotive 3/4 front-left commercial angle.',
      rotation: { x: 0, y: 35, z: 0 },
      elevationY: 0,
    },
    {
      id: 'veh-hero-right',
      name: 'Hero 3/4 Showroom Right (-35°)',
      category: 'vehicle',
      description: 'Classic automotive 3/4 front-right commercial angle.',
      rotation: { x: 0, y: -35, z: 0 },
      elevationY: 0,
    },
    {
      id: 'veh-side-profile',
      name: 'Side Profile Tracking (90°)',
      category: 'vehicle',
      description: 'Full lateral profile facing across the stage.',
      rotation: { x: 0, y: 90, z: 0 },
      elevationY: 0,
    },
    {
      id: 'veh-tail-away',
      name: 'Tail-Away / Upstage (180°)',
      category: 'vehicle',
      description: 'Rear tail-lights view facing upstage away from camera.',
      rotation: { x: 0, y: 180, z: 0 },
      elevationY: 0,
    },
    {
      id: 'veh-wheelie-launch',
      name: 'Launch / Wheelie Pitch Up (-16°)',
      category: 'vehicle',
      description: 'Aggressive acceleration pitch with front end lifted.',
      rotation: { x: -16, y: 0, z: 0 },
      elevationY: 1.0,
    },
    {
      id: 'veh-hard-brake',
      name: 'Hard Braking Nose Dive (+8°)',
      category: 'vehicle',
      description: 'Forward weight transfer under heavy braking.',
      rotation: { x: 8, y: 0, z: 0 },
      elevationY: 0,
    },
    {
      id: 'veh-drift-left',
      name: 'Drift / Banked Turn Left',
      category: 'vehicle',
      description: 'Dynamic cornering yaw with outward body roll.',
      rotation: { x: 2, y: 28, z: -12 },
      elevationY: 0,
    },
    {
      id: 'veh-drift-right',
      name: 'Drift / Banked Turn Right',
      category: 'vehicle',
      description: 'Dynamic cornering yaw with outward body roll.',
      rotation: { x: 2, y: -28, z: 12 },
      elevationY: 0,
    },
    {
      id: 'veh-overturned',
      name: 'Crashed / Rolled Over (115°)',
      category: 'vehicle',
      description: 'Wrecked or overturned vehicle resting on its side/roof.',
      rotation: { x: 6, y: 25, z: 115 },
      elevationY: 0.5,
    },
  ],

  aerial: [
    {
      id: 'air-hover-level',
      name: 'Hovering Level (Mid-Air)',
      category: 'aerial',
      description: 'Stable level hover at mid-air altitude.',
      rotation: { x: 0, y: 0, z: 0 },
      elevationY: 10,
    },
    {
      id: 'air-high-overwatch',
      name: 'High Overwatch Patrol',
      category: 'aerial',
      description: 'High altitude overwatch pitched slightly down toward stage.',
      rotation: { x: 14, y: 25, z: 0 },
      elevationY: 20,
    },
    {
      id: 'air-attack-dive',
      name: 'Forward Attack Dive (+22°)',
      category: 'aerial',
      description: 'Aggressive nose-down forward flight attitude.',
      rotation: { x: 22, y: 0, z: 0 },
      elevationY: 12,
    },
    {
      id: 'air-bank-left',
      name: 'Banked Aerial Turn Left',
      category: 'aerial',
      description: 'Sweeping left bank maneuver in mid-air.',
      rotation: { x: 6, y: 30, z: -28 },
      elevationY: 12,
    },
    {
      id: 'air-bank-right',
      name: 'Banked Aerial Turn Right',
      category: 'aerial',
      description: 'Sweeping right bank maneuver in mid-air.',
      rotation: { x: 6, y: -30, z: 28 },
      elevationY: 12,
    },
    {
      id: 'air-steep-climb',
      name: 'Steep Climb Up (-28°)',
      category: 'aerial',
      description: 'Nose-up rapid ascent.',
      rotation: { x: -28, y: 0, z: 0 },
      elevationY: 14,
    },
    {
      id: 'air-landed',
      name: 'Landed on Ground Pad (Height 0)',
      category: 'aerial',
      description: 'Grounded on the soundstage floor.',
      rotation: { x: 0, y: 0, z: 0 },
      elevationY: 0,
    },
  ],

  weapon_prop: [
    {
      id: 'prop-upright',
      name: 'Upright Hero Display',
      category: 'weapon_prop',
      description: 'Standing vertically upright in hero presentation.',
      rotation: { x: 0, y: 0, z: 0 },
      elevationY: 0,
    },
    {
      id: 'prop-hero-tilt',
      name: 'Angled 45° Showcase',
      category: 'weapon_prop',
      description: 'Dramatic 45° diagonal showcase orientation.',
      rotation: { x: 20, y: 35, z: -35 },
      elevationY: 1.5,
    },
    {
      id: 'prop-flat-floor',
      name: 'Resting Flat on Ground',
      category: 'weapon_prop',
      description: 'Lying flat horizontally on the floor or surface.',
      rotation: { x: 90, y: 25, z: 0 },
      elevationY: 0,
    },
    {
      id: 'prop-planted',
      name: 'Planted / Driven Into Ground',
      category: 'weapon_prop',
      description: 'Point driven downward into the stage floor.',
      rotation: { x: 168, y: 15, z: 6 },
      elevationY: 1.0,
    },
    {
      id: 'prop-leaning',
      name: 'Leaning Against Surface (65°)',
      category: 'weapon_prop',
      description: 'Propped at a 65° resting angle.',
      rotation: { x: 65, y: 20, z: 0 },
      elevationY: 0,
    },
    {
      id: 'prop-levitate',
      name: 'Levitating / Mid-Air Inspect',
      category: 'weapon_prop',
      description: 'Floating at chest/eye level for close-up inspection.',
      rotation: { x: 15, y: 40, z: -20 },
      elevationY: 8,
    },
  ],

  furniture_set: [
    {
      id: 'furn-front',
      name: 'Standard Front (0°)',
      category: 'furniture_set',
      description: 'Squarely aligned facing downstage toward camera.',
      rotation: { x: 0, y: 0, z: 0 },
      elevationY: 0,
    },
    {
      id: 'furn-angle-left',
      name: 'Angled 3/4 Stage Left (+35°)',
      category: 'furniture_set',
      description: 'Angled 35° inward for conversational or room staging.',
      rotation: { x: 0, y: 35, z: 0 },
      elevationY: 0,
    },
    {
      id: 'furn-angle-right',
      name: 'Angled 3/4 Stage Right (-35°)',
      category: 'furniture_set',
      description: 'Angled -35° inward for conversational or room staging.',
      rotation: { x: 0, y: -35, z: 0 },
      elevationY: 0,
    },
    {
      id: 'furn-profile-right',
      name: 'Profile Facing Right (+90°)',
      category: 'furniture_set',
      description: 'Turned 90° facing Stage Right.',
      rotation: { x: 0, y: 90, z: 0 },
      elevationY: 0,
    },
    {
      id: 'furn-profile-left',
      name: 'Profile Facing Left (-90°)',
      category: 'furniture_set',
      description: 'Turned -90° facing Stage Left.',
      rotation: { x: 0, y: -90, z: 0 },
      elevationY: 0,
    },
    {
      id: 'furn-upstage',
      name: 'Facing Upstage (180°)',
      category: 'furniture_set',
      description: 'Turned 180° with back toward the camera.',
      rotation: { x: 0, y: 180, z: 0 },
      elevationY: 0,
    },
    {
      id: 'furn-askew',
      name: 'Askew / Lived-In (+18°)',
      category: 'furniture_set',
      description: 'Subtle organic 18° offset so set feels natural.',
      rotation: { x: 0, y: 18, z: 0 },
      elevationY: 0,
    },
    {
      id: 'furn-toppled',
      name: 'Knocked Over / Toppled (90°)',
      category: 'furniture_set',
      description: 'Tipped over onto its side on the floor.',
      rotation: { x: 88, y: 24, z: 0 },
      elevationY: 0,
    },
  ],

  environment_prop: [
    {
      id: 'env-upright',
      name: 'Upright Default (0°)',
      category: 'environment_prop',
      description: 'Standard upright orientation facing downstage.',
      rotation: { x: 0, y: 0, z: 0 },
      elevationY: 0,
    },
    {
      id: 'env-hero-35',
      name: 'Angled 3/4 (+35°)',
      category: 'environment_prop',
      description: 'Rotated +35° for dimensional depth.',
      rotation: { x: 0, y: 35, z: 0 },
      elevationY: 0,
    },
    {
      id: 'env-hero-neg35',
      name: 'Angled 3/4 (-35°)',
      category: 'environment_prop',
      description: 'Rotated -35° for dimensional depth.',
      rotation: { x: 0, y: -35, z: 0 },
      elevationY: 0,
    },
    {
      id: 'env-profile-90',
      name: 'Side Profile (90°)',
      category: 'environment_prop',
      description: 'Rotated 90° perpendicular to camera.',
      rotation: { x: 0, y: 90, z: 0 },
      elevationY: 0,
    },
    {
      id: 'env-back-180',
      name: 'Rear View (180°)',
      category: 'environment_prop',
      description: 'Rotated 180° facing upstage.',
      rotation: { x: 0, y: 180, z: 0 },
      elevationY: 0,
    },
    {
      id: 'env-leaning',
      name: 'Weathered / Leaning (+12°)',
      category: 'environment_prop',
      description: 'Tilted slightly for organic weathered staging.',
      rotation: { x: 8, y: 15, z: 10 },
      elevationY: 0,
    },
    {
      id: 'env-fallen',
      name: 'Fallen / Collapsed (85°)',
      category: 'environment_prop',
      description: 'Toppled onto the ground plane.',
      rotation: { x: 85, y: 30, z: 0 },
      elevationY: 0,
    },
  ],
};

/**
 * Returns the list of ObjectPosePresets for a given non-human category.
 */
export function getObjectPosePresetsForCategory(
  category: Exclude<ObjectPoseCategory, 'humanoid'>
): ObjectPosePreset[] {
  return OBJECT_POSE_PRESETS[category] || OBJECT_POSE_PRESETS.environment_prop;
}

/**
 * Finds an ObjectPosePreset by its ID across all categories.
 */
export function findObjectPosePresetById(presetId?: string | null): ObjectPosePreset | null {
  if (!presetId) return null;
  for (const list of Object.values(OBJECT_POSE_PRESETS)) {
    const found = list.find((p) => p.id === presetId);
    if (found) return found;
  }
  return null;
}

/**
 * Applies subtle child-part articulation to non-human procedural 3D meshes (e.g., quadrupeds)
 * when an object pose preset is active.
 */
export function applyNonHumanMeshPoseArticulation(mesh: THREE.Object3D, presetId?: string): void {
  if (!mesh || !presetId) return;
  const preset = findObjectPosePresetById(presetId);
  if (!preset) return;

  // Articulation for quadruped walker / animal parts if present
  if (preset.category === 'quadruped') {
    mesh.traverse((child) => {
      const n = (child.name || '').toLowerCase();
      if (n.includes('head') || n.includes('neck')) {
        if (presetId === 'quad-stalk-low') {
          child.rotation.x = 0.25;
        } else if (presetId === 'quad-sit-haunches') {
          child.rotation.x = 0.35;
        } else if (presetId === 'quad-play-bow') {
          child.rotation.x = -0.25;
        } else {
          child.rotation.x = 0;
        }
      }
    });
  }
}

/**
 * Builds object-aware AND relational stage placement presets for an actor,
 * including positions relative to other objects/actors currently on stage.
 */
export function getObjectAwareStagePlacements(
  actor: ActorTrack,
  allActors: ActorTrack[],
  getActorCoords: (a: ActorTrack) => { x: number; y: number; z?: number }
): StagePlacementOption[] {
  const category = detectObjectPoseCategory(actor);
  const options: StagePlacementOption[] = [];
  const clampCoord = (v: number) => Math.max(4, Math.min(96, Math.round(v)));

  // 1. Relational Positions relative to other actors/objects on stage
  const otherActors = allActors.filter((a) => a.id !== actor.id);
  for (const other of otherActors) {
    const rawOPos = getActorCoords(other);
    const oPos = { x: rawOPos.x, y: rawOPos.y, z: rawOPos.z ?? 0 };
    const rawCurPos = getActorCoords(actor);
    const curPos = { x: rawCurPos.x, y: rawCurPos.y, z: rawCurPos.z ?? 0 };
    const shortName = other.name.length > 20 ? other.name.slice(0, 18) + '…' : other.name;

    options.push({
      id: `rel:${other.id}:in-front`,
      label: `📍 In Front of ${shortName} (${clampCoord(oPos.x)}, ${clampCoord(oPos.y + 10)})`,
      group: 'relational',
      position: { x: clampCoord(oPos.x), y: clampCoord(oPos.y + 10), z: oPos.z },
    });

    options.push({
      id: `rel:${other.id}:beside-left`,
      label: `📍 Beside Left of ${shortName} (${clampCoord(oPos.x - 10)}, ${clampCoord(oPos.y)})`,
      group: 'relational',
      position: { x: clampCoord(oPos.x - 10), y: clampCoord(oPos.y), z: oPos.z },
    });

    options.push({
      id: `rel:${other.id}:beside-right`,
      label: `📍 Beside Right of ${shortName} (${clampCoord(oPos.x + 10)}, ${clampCoord(oPos.y)})`,
      group: 'relational',
      position: { x: clampCoord(oPos.x + 10), y: clampCoord(oPos.y), z: oPos.z },
    });

    options.push({
      id: `rel:${other.id}:behind`,
      label: `📍 Behind ${shortName} (${clampCoord(oPos.x)}, ${clampCoord(oPos.y - 10)})`,
      group: 'relational',
      position: { x: clampCoord(oPos.x), y: clampCoord(oPos.y - 10), z: oPos.z },
    });

    if (category !== 'humanoid') {
      options.push({
        id: `rel:${other.id}:on-top`,
        label: `📍 On Top of / At ${shortName} (${clampCoord(oPos.x)}, ${clampCoord(oPos.y)}, H:${Math.min(50, Math.round(oPos.z + 5))})`,
        group: 'relational',
        position: { x: clampCoord(oPos.x), y: clampCoord(oPos.y), z: Math.min(50, Math.round(oPos.z + 5)) },
      });
    }

    // Compute yaw angle (degrees) to face directly toward `other`
    const dx = oPos.x - curPos.x;
    const dz = oPos.y - curPos.y;
    const yawDeg = Math.round(THREE.MathUtils.radToDeg(Math.atan2(dx, dz)));
    options.push({
      id: `rel:${other.id}:face-toward`,
      label: `👁️ Face Toward ${shortName} (Yaw ${yawDeg}°)`,
      group: 'relational',
      rotation: {
        x: actor.rotation?.x ?? 0,
        y: yawDeg,
        z: actor.rotation?.z ?? 0,
      },
    });
  }

  // 2. Category-Specific Object Placements
  if (category === 'vehicle') {
    options.push(
      { id: 'obj:veh-road-fg', label: '🚗 Roadside Foreground (50, 72)', group: 'object', position: { x: 50, y: 72, z: 0 }, rotation: { x: 0, y: 35, z: 0 } },
      { id: 'obj:veh-curb-left', label: '🚗 Curbside Stage Left (24, 60)', group: 'object', position: { x: 24, y: 60, z: 0 }, rotation: { x: 0, y: 25, z: 0 } },
      { id: 'obj:veh-curb-right', label: '🚗 Curbside Stage Right (76, 60)', group: 'object', position: { x: 76, y: 60, z: 0 }, rotation: { x: 0, y: -25, z: 0 } },
      { id: 'obj:veh-bg-approach', label: '🚗 Upstage Approach (50, 26)', group: 'object', position: { x: 50, y: 26, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    );
  } else if (category === 'aerial') {
    options.push(
      { id: 'obj:air-hover-center', label: '🚁 Center Mid-Air Hover (50, 50, H:10)', group: 'object', position: { x: 50, y: 50, z: 10 } },
      { id: 'obj:air-overwatch-high', label: '🚁 High Overwatch (50, 38, H:22)', group: 'object', position: { x: 50, y: 38, z: 22 }, rotation: { x: 14, y: 0, z: 0 } },
      { id: 'obj:air-fg-flyby', label: '🚁 Foreground Flyby (35, 72, H:10)', group: 'object', position: { x: 35, y: 72, z: 10 }, rotation: { x: 8, y: 30, z: -20 } },
      { id: 'obj:air-helipad-ground', label: '🚁 Grounded Pad Center (50, 50, H:0)', group: 'object', position: { x: 50, y: 50, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    );
  } else if (category === 'weapon_prop') {
    options.push(
      { id: 'obj:prop-hero-fg', label: '⚔️ Foreground Hero Close-Up (50, 74, H:2)', group: 'object', position: { x: 50, y: 74, z: 2 }, rotation: { x: 20, y: 35, z: -35 } },
      { id: 'obj:prop-tabletop', label: '⚔️ Tabletop / Waist Height (50, 52, H:6)', group: 'object', position: { x: 50, y: 52, z: 6 } },
      { id: 'obj:prop-floor-drop', label: '⚔️ Dropped on Floor Center (50, 58, H:0)', group: 'object', position: { x: 50, y: 58, z: 0 }, rotation: { x: 90, y: 25, z: 0 } },
      { id: 'obj:prop-eye-float', label: '⚔️ Floating Eye-Level (50, 62, H:11)', group: 'object', position: { x: 50, y: 62, z: 11 } }
    );
  } else if (category === 'furniture_set') {
    options.push(
      { id: 'obj:furn-center-piece', label: '🪑 Center Room Set Piece (50, 50)', group: 'object', position: { x: 50, y: 50, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      { id: 'obj:furn-lounge-left', label: '🪑 Stage Left Angle (30, 52)', group: 'object', position: { x: 30, y: 52, z: 0 }, rotation: { x: 0, y: 35, z: 0 } },
      { id: 'obj:furn-lounge-right', label: '🪑 Stage Right Angle (70, 52)', group: 'object', position: { x: 70, y: 52, z: 0 }, rotation: { x: 0, y: -35, z: 0 } },
      { id: 'obj:furn-back-wall', label: '🪑 Upstage Back Wall (50, 22)', group: 'object', position: { x: 50, y: 22, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    );
  } else if (category === 'quadruped') {
    options.push(
      { id: 'obj:quad-fg-prowl', label: '🐾 Foreground Prowl (50, 68)', group: 'object', position: { x: 50, y: 68, z: 0 } },
      { id: 'obj:quad-flank-left', label: '🐾 Flank Stage Left (28, 52)', group: 'object', position: { x: 28, y: 52, z: 0 }, rotation: { x: 0, y: 25, z: 0 } },
      { id: 'obj:quad-flank-right', label: '🐾 Flank Stage Right (72, 52)', group: 'object', position: { x: 72, y: 52, z: 0 }, rotation: { x: 0, y: -25, z: 0 } },
      { id: 'obj:quad-ridge-high', label: '🐾 High Perch / Ridge (50, 30, H:8)', group: 'object', position: { x: 50, y: 30, z: 8 } }
    );
  }

  // 3. Standard Stage Blocking Zones
  options.push(
    { id: 'stage:center', label: '🎯 Center Stage (50, 50)', group: 'stage', position: { x: 50, y: 50, z: 0 } },
    { id: 'stage:left', label: '⬅️ Stage Left (25, 50)', group: 'stage', position: { x: 25, y: 50, z: 0 } },
    { id: 'stage:right', label: '➡️ Stage Right (75, 50)', group: 'stage', position: { x: 75, y: 50, z: 0 } },
    { id: 'stage:downstage', label: '⬇️ Downstage Foreground (50, 75)', group: 'stage', position: { x: 50, y: 75, z: 0 } },
    { id: 'stage:upstage', label: '⬆️ Upstage Background (50, 25)', group: 'stage', position: { x: 50, y: 25, z: 0 } },
    { id: 'stage:downstage-left', label: '↙️ Downstage Left (28, 72)', group: 'stage', position: { x: 28, y: 72, z: 0 } },
    { id: 'stage:downstage-right', label: '↘️ Downstage Right (72, 72)', group: 'stage', position: { x: 72, y: 72, z: 0 } },
    { id: 'stage:upstage-left', label: '↖️ Upstage Left (28, 28)', group: 'stage', position: { x: 28, y: 28, z: 0 } },
    { id: 'stage:upstage-right', label: '↗️ Upstage Right (72, 28)', group: 'stage', position: { x: 72, y: 28, z: 0 } }
  );

  return options;
}
