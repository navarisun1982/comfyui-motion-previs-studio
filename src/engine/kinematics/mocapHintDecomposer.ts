/**
 * Bilingual (Arabic + English) Explicit Cast, Action, Camera & Scene/Building Decomposer
 *
 * Ensures that whenever the user provides explicit instructions in the Mocap Studio hint field
 * (in Arabic or English) — about how many people are in the scene, who they are, what they are
 * doing, how the camera moves, or what building/place/objects surround them — the engine
 * deterministically understands and honors 100% of those explicit facts alongside the video frames.
 */

import {
  CameraMovementType,
  MovementSpeed,
  ShotType,
  CameraAngle,
  FocalLength,
} from '../../types/shotspec';
import {
  EnvironmentCategory,
  EnvironmentTimeOfDay,
  EnvironmentWeather,
  GroundSurfaceType,
} from '../../types/environment';
import { DetectedMocapAction } from './videoToMocapExtractor';

export interface ExplicitPersonSpec {
  name: string;
  appearanceToken: string;
  clothingColorHex: string;
  action: DetectedMocapAction;
  actionSummary: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface ExplicitStructureSpec {
  name: string;
  kind: 'building' | 'wall' | 'pillar' | 'tree' | 'vehicle' | 'table' | 'chair' | 'prop';
  appearancePrompt: string;
  colorHex: string;
  stageX: number;
  stageY: number;
  scale: number;
  yawDeg: number;
}

export interface ExplicitSceneDecompResult {
  hasExplicitPeople: boolean;
  /** True when the user explicitly named the cast or count (e.g. "رجل وامرأة", "2 people") */
  hasExplicitPersonCount: boolean;
  personCount: number;
  people: ExplicitPersonSpec[];
  hasExplicitCamera: boolean;
  camera?: {
    movementType?: CameraMovementType;
    speed?: MovementSpeed;
    shotType?: ShotType;
    angle?: CameraAngle;
    focalLength?: FocalLength;
  };
  hasExplicitPlace: boolean;
  place?: {
    archetypeKey: string;
    settingLabel: string;
    isIndoorBuilding: boolean;
    category: EnvironmentCategory;
    groundSurface: GroundSurfaceType;
    timeOfDay: EnvironmentTimeOfDay;
    weather: EnvironmentWeather;
    architectureDescription: string;
    skyOrCeilingHex: string;
    wallOrMidgroundHex: string;
    floorHex: string;
    accentHex: string;
  };
  explicitStructures: ExplicitStructureSpec[];
}

function normalizeArabicText(input: string): string {
  return input
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/يء/g, 'ئ')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim();
}

function classifyActionFromClause(clause: string): DetectedMocapAction | null {
  const norm = normalizeArabicText(clause);
  if (/(jump|leap|hop|vault|airborne|يقفز|قفز|ينط|نط|وثب|يطير)/.test(norm)) {
    return 'jump-leap';
  }
  if (/(fight|punch|kick|strike|combat|attack|duel|box|sword|brawl|يتقاتل|قتال|يضرب|ضرب|يلكم|يركل|مبارزه|شجار|يتعارك|هجوم)/.test(norm)) {
    return 'combat-strike';
  }
  if (/(run|sprint|dash|chase|flee|rush|jog|يجري|جري|يركض|ركض|يهرول|يطارد|مطارده|يهرب)/.test(norm)) {
    return 'run-sprint';
  }
  if (/(crouch|sneak|stealth|crawl|duck|kneel|hide|يتسلل|تسلل|يجثو|ينحني|يزحف|يختبئ|يركع)/.test(norm)) {
    return 'crouch-stealth';
  }
  if (/(dance|celebrat|wave|cheer|clap|groove|يرقص|رقص|يحتفل|يلوح|يصفق|فرح)/.test(norm)) {
    return 'dance-expressive';
  }
  if (/(stand|idle|wait|sit|talk|speak|watch|look|يقف|واقف|يجلس|جالس|يتحدث|يتكلم|ينتظر|ينظر|يلتفت)/.test(norm)) {
    return 'idle-turn';
  }
  if (/(walk|stride|stroll|march|step|move|enter|يمشي|مشي|يسير|سير|يتحرك|يتجول|يدخل|يخرج)/.test(norm)) {
    return 'walk';
  }
  return null;
}

const ROLE_DICTIONARY: Array<{
  pattern: RegExp;
  labelEn: string;
  tokenEn: string;
  colorHex: string;
}> = [
  { pattern: /(\b(doctor|physician|surgeon)\b|طبيب|دكتور|جراح)/i, labelEn: 'Doctor', tokenEn: 'a medical doctor in white lab coat', colorHex: '#38bdf8' },
  { pattern: /(\bnurse\b|ممرض|ممرضه)/i, labelEn: 'Nurse', tokenEn: 'a hospital nurse in medical scrubs', colorHex: '#2dd4bf' },
  { pattern: /(\bpatient\b|مريض|مصاب)/i, labelEn: 'Patient', tokenEn: 'a patient in hospital attire', colorHex: '#94a3b8' },
  { pattern: /(\b(soldier|military|trooper|warrior)\b|جندي|عسكري|محارب)/i, labelEn: 'Soldier', tokenEn: 'a tactical soldier in combat gear', colorHex: '#4ade80' },
  { pattern: /(\b(police|cop|officer)\b|شرطي|ضابط)/i, labelEn: 'Police Officer', tokenEn: 'a police officer in tactical uniform', colorHex: '#3b82f6' },
  { pattern: /(\b(guard|security)\b|حارس|بودي جارد)/i, labelEn: 'Security Guard', tokenEn: 'a security guard in dark uniform', colorHex: '#64748b' },
  { pattern: /(\b(knight|paladin)\b|فارس|مدرع)/i, labelEn: 'Armored Knight', tokenEn: 'an armored medieval knight', colorHex: '#cbd5e1' },
  { pattern: /(\b(fighter|boxer|martial)\b|مقاتل|ملاكم|مصارع)/i, labelEn: 'Fighter', tokenEn: 'a martial arts fighter in athletic gear', colorHex: '#f43f5e' },
  { pattern: /(\bdancer\b|راقص|راقصه)/i, labelEn: 'Dancer', tokenEn: 'an expressive dancer in street attire', colorHex: '#ec4899' },
  { pattern: /(\b(player|athlete|runner)\b|لاعب|عداء|رياضي)/i, labelEn: 'Athlete', tokenEn: 'an athletic sportsperson', colorHex: '#f59e0b' },
  { pattern: /(\b(chef|cook|waiter)\b|طباخ|شيف|نادل)/i, labelEn: 'Chef / Staff', tokenEn: 'a culinary chef in kitchen apron', colorHex: '#fb923c' },
  { pattern: /(\b(teacher|professor)\b|معلم|مدرس|استاذ|دكتور جامعي)/i, labelEn: 'Professor', tokenEn: 'an academic instructor in blazer', colorHex: '#818cf8' },
  { pattern: /(\b(student|pupil)\b|طالب|تلميذ)/i, labelEn: 'Student', tokenEn: 'a student in casual attire', colorHex: '#60a5fa' },
  { pattern: /(\b(detective|investigator)\b|محقق|مفتش)/i, labelEn: 'Detective', tokenEn: 'a detective in trench coat', colorHex: '#a78bfa' },
  { pattern: /(\b(woman|lady|girl|female)\b|امراه|سيده|فتاه|بنت)/i, labelEn: 'Woman', tokenEn: 'a woman in modern attire', colorHex: '#f472b6' },
  { pattern: /(\b(man|guy|male|gentleman)\b|رجل|شاب)/i, labelEn: 'Man', tokenEn: 'a man in casual jacket', colorHex: '#38bdf8' },
  { pattern: /(\b(child|boy|kid)\b|طفل|ولد|صبي)/i, labelEn: 'Young Person', tokenEn: 'a young person in casual clothes', colorHex: '#fbbf24' },
];

const PERSON_PALETTE = ['#38bdf8', '#f472b6', '#4ade80', '#fbbf24', '#a78bfa', '#fb923c'];

/**
 * Parses explicit user text (Arabic or English) for people count, roles, actions,
 * camera directions, and place/building/object descriptions.
 */
export function decomposeMocapAndSceneHint(rawHint: string): ExplicitSceneDecompResult {
  const cleanRaw = String(rawHint ?? '').trim();
  const norm = normalizeArabicText(cleanRaw);

  if (!norm) {
    return {
      hasExplicitPeople: false,
      hasExplicitPersonCount: false,
      personCount: 1,
      people: [],
      hasExplicitCamera: false,
      hasExplicitPlace: false,
      explicitStructures: [],
    };
  }

  // ---------------------------------------------------------------------------
  // 1. DETECT EXPLICIT PERSON COUNT & INDIVIDUAL ROLES / ACTIONS
  // ---------------------------------------------------------------------------
  let explicitCount = 0;

  // Check explicit numbers and Arabic dual/plural nouns
  const numMatch = norm.match(
    /(?:^|\s)([1-6]|[١-٦])\s*(?:people|persons|actors|men|women|fighters|soldiers|players|guards|dancers|اشخاص|انفار|افراد|رجال|نساء|شباب|بنات|اولاد|مقاتلين|جنود|لاعبين)/
  );
  if (numMatch) {
    const d = numMatch[1]
      .replace('١', '1')
      .replace('٢', '2')
      .replace('٣', '3')
      .replace('٤', '4')
      .replace('٥', '5')
      .replace('٦', '6');
    explicitCount = Math.max(1, Math.min(4, parseInt(d, 10) || 1));
  } else if (/(four|\b4\b|اربعه|اربع اشخاص|٤ اشخاص)/.test(norm)) {
    explicitCount = 4;
  } else if (/(three|\b3\b|trio|group|crowd|ثلاثه|ثلاث|٣ اشخاص|مجموعه|تجمع|حشد)/.test(norm)) {
    explicitCount = 3;
  } else if (
    /(two|\b2\b|both|pair|duel|couple|versus|\bvs\b|شخصين|شخصان|اثنين|اثنان|رجلين|رجلان|امراتين|بنتين|ولدين|مقاتلين|لاعبين|جنديين|شابين|زوجين)/.test(
      norm
    )
  ) {
    explicitCount = 2;
  } else if (/(\bone person\b|\bsingle person\b|\bsolo\b|شخص واحد|فرد واحد|لوحده|بمفرده)/.test(norm)) {
    explicitCount = 1;
  }

  // Also check if distinct roles are mentioned (e.g. "طبيب ومريض", "رجل وامرأة", "doctor and patient")
  // Sort by where each role appears in the user's text so "رجل وامرأة" preserves [Man, Woman] order.
  const matchedRolesWithIdx: Array<{ idx: number; labelEn: string; tokenEn: string; colorHex: string }> = [];
  for (const r of ROLE_DICTIONARY) {
    const m = r.pattern.exec(norm);
    if (m) {
      matchedRolesWithIdx.push({
        idx: m.index,
        labelEn: r.labelEn,
        tokenEn: r.tokenEn,
        colorHex: r.colorHex,
      });
    }
  }
  matchedRolesWithIdx.sort((a, b) => a.idx - b.idx);
  const matchedRoles = matchedRolesWithIdx.map(({ labelEn, tokenEn, colorHex }) => ({
    labelEn,
    tokenEn,
    colorHex,
  }));
  if (matchedRoles.length >= 2 && explicitCount < matchedRoles.length) {
    explicitCount = Math.min(4, matchedRoles.length);
  }

  const globalAction = classifyActionFromClause(norm) || 'walk';
  const hasExplicitAction = classifyActionFromClause(norm) !== null;
  const hasExplicitPersonCount = explicitCount > 0 || matchedRoles.length > 0;
  const hasExplicitPeople = hasExplicitPersonCount || hasExplicitAction;
  const finalPersonCount = Math.max(1, explicitCount || matchedRoles.length || 1);

  // Split clauses if the user described different actions for each person
  const personClauses = norm
    .split(/(?:بينما|وآخر|والثاني|والاخر|while|whereas|and the second|and another)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const isOpposingDuel =
    /(versus|\bvs\b|duel|against each other|towards each other|face each other|ضد|يتواجهان|نحو بعضهما|امام بعض)/.test(
      norm
    );

  const people: ExplicitPersonSpec[] = [];
  for (let i = 0; i < finalPersonCount; i++) {
    const role = matchedRoles[i];
    const clauseForPerson = personClauses[i] || norm;
    const personAction = classifyActionFromClause(clauseForPerson) || globalAction;

    // Metric side-by-side placement (`toyxyz_RGBMocap/mocap/flow_placement.py` shared frustum anchor):
    // Side-by-side people stand 6 stage units apart centered around x = 50 (e.g. 47 and 53 for 2 people)
    // at the same depth Y so they walk side-by-side inside the camera frustum.
    const metricSideBySideSpacing = isOpposingDuel || personAction === 'combat-strike' ? 10 : 6;
    const groupWidth = (finalPersonCount - 1) * metricSideBySideSpacing;
    const centeredStartX = Math.round(50 - groupWidth * 0.5 + i * metricSideBySideSpacing);

    const startX =
      finalPersonCount === 1
        ? personAction === 'walk' || personAction === 'run-sprint'
          ? 50
          : 50
        : centeredStartX;
    const startY =
      personAction === 'walk' || personAction === 'run-sprint'
        ? 42
        : 48;

    let endX = startX;
    let endY = startY;
    if (personAction === 'walk') {
      endX = startX;
      endY = Math.min(76, startY + 16);
    } else if (personAction === 'run-sprint') {
      endX = startX;
      endY = Math.min(80, startY + 22);
    } else if (personAction === 'crouch-stealth') {
      endX = startX;
      endY = Math.min(72, startY + 10);
    } else if ((personAction === 'combat-strike' || isOpposingDuel) && finalPersonCount >= 2) {
      // Fighters step toward each other near center while staying within camera frame
      endX = i === 0 ? 46 : 54;
      endY = 50;
    } else if (personAction === 'jump-leap') {
      endX = startX;
      endY = Math.min(74, startY + 12);
    }

    const isDuplicateRoleLabel =
      role && matchedRoles.filter((r) => r.labelEn === role.labelEn).length > 1;
    const name = role
      ? isDuplicateRoleLabel
        ? `${role.labelEn} ${i + 1}`
        : role.labelEn
      : finalPersonCount > 1
        ? `Person ${i + 1}`
        : 'Lead Subject';

    people.push({
      name,
      appearanceToken: role?.tokenEn || `human subject ${i + 1} in scene`,
      clothingColorHex: role?.colorHex || PERSON_PALETTE[i % PERSON_PALETTE.length],
      action: personAction,
      actionSummary: `${name} performing ${personAction}`,
      startX,
      startY,
      endX,
      endY,
    });
  }

  // ---------------------------------------------------------------------------
  // 2. DETECT EXPLICIT CAMERA MOVEMENT, FRAMING & ANGLE
  // ---------------------------------------------------------------------------
  let movementType: CameraMovementType | undefined;
  let speed: MovementSpeed | undefined;
  let shotType: ShotType | undefined;
  let angle: CameraAngle | undefined;
  let focalLength: FocalLength | undefined;

  if (/(orbit|arc|360|دوران|تدور حول|تلتف)/.test(norm)) {
    movementType = 'orbit-clockwise';
  } else if (/(dolly in|push in|zoom in|تقترب|اقتراب|زوم ان|تتقدم)/.test(norm)) {
    movementType = 'dolly-in';
  } else if (/(dolly out|pull back|zoom out|تبتعد|ابتعاد|زوم اوت|تتراجع)/.test(norm)) {
    movementType = 'dolly-out';
  } else if (/(pan right|truck right|بان يمين|تتحرك يمين|يمينا)/.test(norm)) {
    movementType = 'pan-right';
  } else if (/(pan left|truck left|بان يسار|تتحرك يسار|يسارا)/.test(norm)) {
    movementType = 'pan-left';
  } else if (/(tilt up|pedestal up|تيلت لاعلي|ترتفع|لاعلى)/.test(norm)) {
    movementType = 'tilt-up';
  } else if (/(tilt down|pedestal down|تيلت لاسفل|تهبط)/.test(norm)) {
    movementType = 'tilt-down';
  } else if (/(follow|tracking|steadicam|تتبع|تلاحق|ترافق)/.test(norm)) {
    movementType = 'steadicam-follow';
  } else if (/(handheld|shake|مهتزه|يدويه)/.test(norm)) {
    movementType = 'handheld-subtle';
  } else if (/(static|fixed|tripod|ثابته|كاميرا ثابته)/.test(norm)) {
    movementType = 'static';
  }

  if (/(fast|rapid|quick|سريع|سريعه)/.test(norm)) speed = 'rapid-dynamic';
  else if (/(slow|gentle|بطيء|بطيئه|هادئه)/.test(norm)) speed = 'slow-cinematic';

  if (/(close up|closeup|لقطه قريبه|كلوز)/.test(norm)) {
    shotType = 'close-up';
    focalLength = '85mm';
  } else if (/(wide|establishing|لقطه واسعه|كادر واسع)/.test(norm)) {
    shotType = 'wide';
    focalLength = '24mm';
  }

  if (/(low angle|زاويه منخفضه|من اسفل)/.test(norm)) angle = 'low-angle';
  else if (/(overhead|bird|top down|من الاعلي|عموديه)/.test(norm)) angle = 'overhead-gods-eye';
  else if (/(high angle|زاويه مرتفعه)/.test(norm)) angle = 'high-angle';

  const hasExplicitCamera = Boolean(movementType || shotType || angle);

  // ---------------------------------------------------------------------------
  // 3. DETECT EXPLICIT PLACE / BUILDING / ENVIRONMENT (ARABIC + ENGLISH)
  // ---------------------------------------------------------------------------
  let place: ExplicitSceneDecompResult['place'] | undefined;
  const explicitStructures: ExplicitStructureSpec[] = [];

  if (/(hospital|clinic|medical|ward|pharmacy|مستشفي|عياده|طبي|غرفه عمليات|صيدليه|مختبر|معمل|lab|laboratory)/.test(norm)) {
    place = {
      archetypeKey: 'laboratory-facility',
      settingLabel: 'Hospital / Medical Facility Interior',
      isIndoorBuilding: true,
      category: 'interior',
      groundSurface: 'concrete-floor',
      timeOfDay: 'day',
      weather: 'clear',
      architectureDescription: 'clean medical hospital interior with glass partitions, examination beds, medical cabinets, and bright clinical lighting',
      skyOrCeilingHex: '#1e293b',
      wallOrMidgroundHex: '#334155',
      floorHex: '#1e293b',
      accentHex: '#38bdf8',
    };
    explicitStructures.push(
      { name: 'Medical Partition Wall & Window', kind: 'wall', appearancePrompt: 'hospital room glass partition wall', colorHex: '#475569', stageX: 24, stageY: 36, scale: 1.5, yawDeg: 45 },
      { name: 'Clinical Examination Table & Console', kind: 'table', appearancePrompt: 'medical examination table and monitor console', colorHex: '#38bdf8', stageX: 74, stageY: 42, scale: 1.3, yawDeg: -45 },
      { name: 'Medical Supply Cabinet Tower', kind: 'building', appearancePrompt: 'tall hospital medical storage cabinet unit', colorHex: '#64748b', stageX: 34, stageY: 26, scale: 1.4, yawDeg: 15 }
    );
  } else if (/(street|city|urban|alley|road|downtown|avenue|highway|sidewalk|neighborhood|شارع|مدينه|حاره|زقاق|طريق|حي|عمارات|مباني|رصيف|تقاطع)/.test(norm)) {
    place = {
      archetypeKey: 'cyberpunk-urban-alley',
      settingLabel: 'Urban Street & Surrounding Multi-Storey Buildings',
      isIndoorBuilding: false,
      category: 'urban',
      groundSurface: 'asphalt-wet',
      timeOfDay: /(night|ليل|مساء)/.test(norm) ? 'neon-night' : 'day',
      weather: /(rain|مطر)/.test(norm) ? 'rain' : 'clear',
      architectureDescription: 'urban street canyon flanked by multi-storey apartment and commercial building facades, sidewalks, street lamps, and parked vehicles',
      skyOrCeilingHex: /(night|ليل)/.test(norm) ? '#0b1021' : '#1e3a5f',
      wallOrMidgroundHex: '#334155',
      floorHex: '#181c24',
      accentHex: '#38bdf8',
    };
    explicitStructures.push(
      { name: 'Left Multi-Storey Apartment Building', kind: 'building', appearancePrompt: 'multi-storey urban brick and concrete apartment building facade', colorHex: '#475569', stageX: 22, stageY: 38, scale: 1.9, yawDeg: 65 },
      { name: 'Right Commercial Building Facade', kind: 'building', appearancePrompt: 'multi-storey commercial building with storefront windows', colorHex: '#3b4252', stageX: 78, stageY: 40, scale: 1.85, yawDeg: -65 },
      { name: 'Background Tower Block', kind: 'building', appearancePrompt: 'tall background urban office tower block', colorHex: '#2e3440', stageX: 48, stageY: 24, scale: 2.0, yawDeg: 0 },
      { name: 'Parked Street Vehicle', kind: 'vehicle', appearancePrompt: 'parked urban sedan vehicle by the curb', colorHex: '#64748b', stageX: 72, stageY: 62, scale: 1.3, yawDeg: -30 }
    );
  } else if (/(kitchen|restaurant|cafe|coffee|diner|bakery|مطبخ|مطعم|مقهي|كافيه|كافتيريا)/.test(norm)) {
    place = {
      archetypeKey: 'modern-interior-room',
      settingLabel: 'Restaurant / Cafe / Kitchen Interior',
      isIndoorBuilding: true,
      category: 'interior',
      groundSurface: 'wood-parquet',
      timeOfDay: 'day',
      weather: 'clear',
      architectureDescription: 'architectural kitchen and cafe interior with service counters, dining tables, seating chairs, and warm pendant lighting',
      skyOrCeilingHex: '#1c1917',
      wallOrMidgroundHex: '#44403c',
      floorHex: '#292524',
      accentHex: '#f59e0b',
    };
    explicitStructures.push(
      { name: 'Counter & Kitchen Island Unit', kind: 'table', appearancePrompt: 'long kitchen counter and service island bar', colorHex: '#57534e', stageX: 25, stageY: 38, scale: 1.45, yawDeg: 55 },
      { name: 'Dining Table & Seating', kind: 'table', appearancePrompt: 'wooden cafe dining table with chairs', colorHex: '#78350f', stageX: 74, stageY: 46, scale: 1.3, yawDeg: -45 },
      { name: 'Back Wall Shelving & Partition', kind: 'wall', appearancePrompt: 'interior cafe wall with shelving and framed windows', colorHex: '#44403c', stageX: 50, stageY: 25, scale: 1.65, yawDeg: 0 }
    );
  } else if (/(office|company|workspace|meeting|conference|classroom|school|library|university|مكتب|شركه|قاعه اجتماعات|مدرسه|فصل|جامعه|مكتبه)/.test(norm)) {
    place = {
      archetypeKey: 'modern-interior-room',
      settingLabel: 'Office / Academic Hall Interior Building',
      isIndoorBuilding: true,
      category: 'interior',
      groundSurface: 'wood-parquet',
      timeOfDay: 'day',
      weather: 'clear',
      architectureDescription: 'modern architectural office and hall interior with glass wall partitions, executive desks, bookshelves, and structural columns',
      skyOrCeilingHex: '#0f172a',
      wallOrMidgroundHex: '#334155',
      floorHex: '#1e293b',
      accentHex: '#60a5fa',
    };
    explicitStructures.push(
      { name: 'Left Glass Wall & Window Partition', kind: 'wall', appearancePrompt: 'architectural office wall with large window panels', colorHex: '#334155', stageX: 24, stageY: 40, scale: 1.65, yawDeg: 65 },
      { name: 'Executive Workstation Desk', kind: 'table', appearancePrompt: 'modern executive office desk with monitor', colorHex: '#475569', stageX: 74, stageY: 44, scale: 1.3, yawDeg: -50 },
      { name: 'Background Shelving & Wall Unit', kind: 'building', appearancePrompt: 'tall architectural shelving and wall unit', colorHex: '#1e293b', stageX: 48, stageY: 25, scale: 1.6, yawDeg: 0 }
    );
  } else if (/(house|home|room|living room|bedroom|apartment|penthouse|hall|lobby|villa|منزل|بيت|غرفه|صاله|شقه|فيلا|غرفه نوم|غرفه معيشه|بهو|قاعه)/.test(norm)) {
    place = {
      archetypeKey: 'modern-interior-room',
      settingLabel: 'Residential Room / Interior Building Set',
      isIndoorBuilding: true,
      category: 'interior',
      groundSurface: 'wood-parquet',
      timeOfDay: 'day',
      weather: 'clear',
      architectureDescription: 'interior residential room with perimeter walls, window frames, timber parquet floor, and room furnishings',
      skyOrCeilingHex: '#18181b',
      wallOrMidgroundHex: '#3f3f46',
      floorHex: '#2e2118',
      accentHex: '#fbbf24',
    };
    explicitStructures.push(
      { name: 'Left Room Wall & Window Frame', kind: 'wall', appearancePrompt: 'interior room wall with window frame', colorHex: '#3f3f46', stageX: 24, stageY: 42, scale: 1.65, yawDeg: 65 },
      { name: 'Right Interior Wall & Column', kind: 'wall', appearancePrompt: 'interior room wall and structural column', colorHex: '#52525b', stageX: 76, stageY: 42, scale: 1.6, yawDeg: -65 },
      { name: 'Interior Room Table & Furnishings', kind: 'table', appearancePrompt: 'interior room table and lounge furniture', colorHex: '#78350f', stageX: 34, stageY: 28, scale: 1.3, yawDeg: 20 }
    );
  } else if (/(warehouse|factory|industrial|garage|hangar|depot|workshop|bunker|مستودع|مصنع|ورشه|كراج|مخزن|عنبر|صناعي|جراج)/.test(norm)) {
    place = {
      archetypeKey: 'industrial-warehouse',
      settingLabel: 'Industrial Warehouse & Concrete Building',
      isIndoorBuilding: true,
      category: 'interior',
      groundSurface: 'concrete-floor',
      timeOfDay: 'day',
      weather: 'overcast',
      architectureDescription: 'expansive industrial warehouse building with concrete walls, heavy steel support pillars, loading bay doors, and cargo containers',
      skyOrCeilingHex: '#18181b',
      wallOrMidgroundHex: '#27272a',
      floorHex: '#1f242d',
      accentHex: '#f59e0b',
    };
    explicitStructures.push(
      { name: 'Warehouse Concrete Bay Building Wall', kind: 'building', appearancePrompt: 'industrial warehouse bay wall structure', colorHex: '#3f3f46', stageX: 23, stageY: 38, scale: 1.8, yawDeg: 65 },
      { name: 'Structural Steel & Concrete Pillar', kind: 'pillar', appearancePrompt: 'industrial reinforced concrete support column', colorHex: '#52525b', stageX: 75, stageY: 40, scale: 1.5, yawDeg: -65 },
      { name: 'Loading Bay Cargo Unit', kind: 'wall', appearancePrompt: 'industrial loading bay gate and cargo containers', colorHex: '#475569', stageX: 50, stageY: 25, scale: 1.65, yawDeg: 0 }
    );
  } else if (/(mosque|temple|church|castle|palace|courtyard|fortress|ancient|ruins|museum|مسجد|معبد|كنيسه|قلعه|قصر|ساحه|حصن|اثري|تاريخي|متحف)/.test(norm)) {
    place = {
      archetypeKey: 'historical-courtyard-temple',
      settingLabel: 'Monumental Palace / Courtyard / Historic Architecture',
      isIndoorBuilding: false,
      category: 'historical',
      groundSurface: 'stone-cobblestone',
      timeOfDay: 'twilight',
      weather: 'clear',
      architectureDescription: 'monumental stone architecture with carved arches, colonnade pillars, courtyard walls, and stone gatehouses',
      skyOrCeilingHex: '#151821',
      wallOrMidgroundHex: '#44403c',
      floorHex: '#292524',
      accentHex: '#f59e0b',
    };
    explicitStructures.push(
      { name: 'Monumental Stone Gatehouse Building', kind: 'building', appearancePrompt: 'carved stone gatehouse building with arches', colorHex: '#57534e', stageX: 23, stageY: 36, scale: 1.85, yawDeg: 60 },
      { name: 'Right Stone Colonnade Pillar', kind: 'pillar', appearancePrompt: 'tall carved stone colonnade pillar', colorHex: '#78716c', stageX: 76, stageY: 38, scale: 1.6, yawDeg: -60 },
      { name: 'Background Courtyard Wall & Arch', kind: 'wall', appearancePrompt: 'ancient stone courtyard wall and archway', colorHex: '#44403c', stageX: 50, stageY: 24, scale: 1.75, yawDeg: 0 }
    );
  } else if (/(beach|coast|shore|shoreline|ocean|sea|seaside|bay|island|شاطئ|شاطي|بحر|ساحل|محيط|امواج|موج|جزيره|كورنيش|رمل البحر)/.test(norm)) {
    place = {
      archetypeKey: 'coastal-beach-shoreline',
      settingLabel: 'Coastal Sandy Beach & Ocean Shoreline',
      isIndoorBuilding: false,
      category: 'coastal-beach',
      groundSurface: 'sand-dunes',
      timeOfDay: /(sunset|غروب)/.test(norm) ? 'golden-hour' : 'day',
      weather: 'clear',
      architectureDescription: 'open sandy beach shoreline with turquoise ocean water horizon, gentle surf waves, coastal rock formations, and beachfront boardwalk pavilion',
      skyOrCeilingHex: '#38bdf8',
      wallOrMidgroundHex: '#0284c7',
      floorHex: '#d6b37c',
      accentHex: '#0ea5e9',
    };
    explicitStructures.push(
      { name: 'Coastal Shoreline Rock Outcrop', kind: 'prop', appearancePrompt: 'weathered coastal sea rock formation on sandy beach', colorHex: '#64748b', stageX: 22, stageY: 38, scale: 1.45, yawDeg: 40 },
      { name: 'Beachfront Sun Lounger & Umbrella Deck', kind: 'table', appearancePrompt: 'wooden beachfront deck lounger and sun shade canopy', colorHex: '#d97706', stageX: 76, stageY: 42, scale: 1.3, yawDeg: -45 }
    );
  } else if (/(forest|woods|jungle|park|garden|trees|farm|nature|river|غابه|حديقه|منتزه|اشجار|مزرعه|طبيعه|نهر)/.test(norm)) {
    place = {
      archetypeKey: 'nature-forest-clearing',
      settingLabel: 'Natural Park / Forest & Woodland Trees',
      isIndoorBuilding: false,
      category: 'nature',
      groundSurface: 'grass-terrain',
      timeOfDay: 'day',
      weather: 'clear',
      architectureDescription: 'natural woodland park clearing surrounded by tall canopy trees, foliage, boulders, and wooden structures',
      skyOrCeilingHex: '#0f291e',
      wallOrMidgroundHex: '#166534',
      floorHex: '#14532d',
      accentHex: '#22c55e',
    };
    explicitStructures.push(
      { name: 'Left Canopy Tree Cluster', kind: 'tree', appearancePrompt: 'tall woodland tree with lush green canopy', colorHex: '#15803d', stageX: 23, stageY: 38, scale: 1.75, yawDeg: 45 },
      { name: 'Right Woodland Tree & Rocks', kind: 'tree', appearancePrompt: 'tall park tree with mossy rocks', colorHex: '#166534', stageX: 77, stageY: 40, scale: 1.7, yawDeg: -45 },
      { name: 'Background Park Structure / Cabin', kind: 'building', appearancePrompt: 'wooden park pavilion and cabin structure', colorHex: '#78350f', stageX: 50, stageY: 25, scale: 1.6, yawDeg: 0 }
    );
  } else if (/(desert|dunes|sand|canyon|mountain|صحراء|رمال|جبل|وادي)/.test(norm)) {
    place = {
      archetypeKey: 'desert-canyon-dunes',
      settingLabel: 'Desert Canyon & Sandstone Outpost Buildings',
      isIndoorBuilding: false,
      category: 'nature',
      groundSurface: 'sand-dunes',
      timeOfDay: 'golden-hour',
      weather: 'clear',
      architectureDescription: 'open desert and canyon terrain with sandstone outpost buildings, rock formations, and golden horizon light',
      skyOrCeilingHex: '#3a220d',
      wallOrMidgroundHex: '#92400e',
      floorHex: '#b45309',
      accentHex: '#fbbf24',
    };
    explicitStructures.push(
      { name: 'Sandstone Outpost Building', kind: 'building', appearancePrompt: 'desert sandstone adobe building structure', colorHex: '#b45309', stageX: 24, stageY: 36, scale: 1.75, yawDeg: 55 },
      { name: 'Canyon Rock Wall Formation', kind: 'wall', appearancePrompt: 'weathered sandstone canyon rock wall', colorHex: '#92400e', stageX: 76, stageY: 40, scale: 1.65, yawDeg: -55 }
    );
  } else if (/(gym|stadium|arena|ring|stage|theater|studio|ملعب|صاله رياضيه|جيم|حلبه|مسرح|استوديو)/.test(norm)) {
    place = {
      archetypeKey: 'soundstage-studio',
      settingLabel: 'Arena / Gym / Production Stage Building',
      isIndoorBuilding: true,
      category: 'studio',
      groundSurface: 'studio-floor',
      timeOfDay: 'night',
      weather: 'clear',
      architectureDescription: 'enclosed arena and production stage with structural lighting trusses, perimeter walls, and stage equipment',
      skyOrCeilingHex: '#090c14',
      wallOrMidgroundHex: '#1e293b',
      floorHex: '#111827',
      accentHex: '#38bdf8',
    };
    explicitStructures.push(
      { name: 'Left Stage Truss & Wall Unit', kind: 'wall', appearancePrompt: 'arena stage perimeter wall and lighting truss', colorHex: '#334155', stageX: 24, stageY: 40, scale: 1.65, yawDeg: 65 },
      { name: 'Right Arena Pillar & Rig', kind: 'pillar', appearancePrompt: 'structural stage tower pillar', colorHex: '#475569', stageX: 76, stageY: 40, scale: 1.55, yawDeg: -65 }
    );
  }

  // ---------------------------------------------------------------------------
  // 4. EXTRACT ANY ADDITIONAL EXPLICIT OBJECTS MENTIONED IN THE HINT
  // ---------------------------------------------------------------------------
  if (/(car|vehicle|truck|taxi|bus|سياره|مركبه|شاحنه|اتوبيس|باص)/.test(norm) && !explicitStructures.some((s) => s.kind === 'vehicle')) {
    explicitStructures.push({
      name: 'Scene Vehicle',
      kind: 'vehicle',
      appearancePrompt: 'parked automobile vehicle in scene',
      colorHex: '#ef4444',
      stageX: 75,
      stageY: 56,
      scale: 1.35,
      yawDeg: -35,
    });
  }
  if (/(tree|palm|bush|شجره|اشجار|نخله)/.test(norm) && !explicitStructures.some((s) => s.kind === 'tree')) {
    explicitStructures.push({
      name: 'Surrounding Tree',
      kind: 'tree',
      appearancePrompt: 'tall tree with foliage canopy',
      colorHex: '#16a34a',
      stageX: 22,
      stageY: 52,
      scale: 1.55,
      yawDeg: 25,
    });
  }
  if (/(table|desk|bench|counter|طاوله|مكتب|منضده|كونتر|سرير|bed)/.test(norm) && !explicitStructures.some((s) => s.kind === 'table')) {
    explicitStructures.push({
      name: /(bed|سرير)/.test(norm) ? 'Room Bed / Couch Unit' : 'Scene Table / Desk',
      kind: 'table',
      appearancePrompt: /(bed|سرير)/.test(norm) ? 'bed and frame unit' : 'table and desk unit',
      colorHex: '#854d0e',
      stageX: 28,
      stageY: 46,
      scale: 1.25,
      yawDeg: 35,
    });
  }
  if (/(building|tower|facade|house|عماره|برج|مبني|واجهه)/.test(norm) && !explicitStructures.some((s) => s.kind === 'building')) {
    explicitStructures.push(
      {
        name: 'Left Surrounding Building',
        kind: 'building',
        appearancePrompt: 'multi-storey surrounding building facade',
        colorHex: '#475569',
        stageX: 22,
        stageY: 36,
        scale: 1.85,
        yawDeg: 65,
      },
      {
        name: 'Right Surrounding Building',
        kind: 'building',
        appearancePrompt: 'multi-storey surrounding building facade',
        colorHex: '#334155',
        stageX: 78,
        stageY: 36,
        scale: 1.85,
        yawDeg: -65,
      }
    );
  }

  return {
    hasExplicitPeople,
    hasExplicitPersonCount,
    personCount: finalPersonCount,
    people,
    hasExplicitCamera,
    camera: hasExplicitCamera
      ? { movementType, speed, shotType, angle, focalLength }
      : undefined,
    hasExplicitPlace: Boolean(place || explicitStructures.length > 0),
    place,
    explicitStructures,
  };
}
