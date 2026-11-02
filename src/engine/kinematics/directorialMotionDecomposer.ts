/**
 * Directorial Motion Decomposer (AI & Pattern-Driven)
 * 
 * Transforms natural language directorial scene descriptions (in Arabic & English)
 * into an executable sequential MotionPlan of parameterized motion skills.
 * 
 * Examples:
 * - "Actor walks to the table, picks up the cup, and sits down"
 *   -> [walkTo, reachGrip, sitInSeat]
 * - "الممثل يقف ويتحدث بإيماءات معبرة ثم يتجه نحو الباب"
 *   -> [standIdle, talkGesture, walkTo]
 */

import { Point2D, Point3D } from '../../types/shotspec';
import {
  MotionPlan,
  MotionSkillInvocation,
  DEFAULT_SKILL_DURATIONS,
} from './motionSkills';
import { buildOfflineUniversalKinematicProgram } from './universalKinematicSynthesizer';

export interface SceneContextEntity {
  id: string;
  name: string;
  position: Point2D | Point3D;
  kind?: string;
}

export interface DecomposerContext {
  actorId?: string;
  actorName?: string;
  actorPosition?: [number, number] | Point2D;
  startPosition?: [number, number] | Point2D;
  sceneEntities?: SceneContextEntity[];
  actors?: Array<{
    id: string;
    name: string;
    position: [number, number] | Point2D | Point3D | any;
    kind?: string;
  }>;
  totalShotDurationSec?: number;
}

/**
 * Normalizes Arabic text by unifying hamzas, removing diacritics, and trimming
 */
function normalizeArabicText(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();
}

function toCoord2D(pos: any): [number, number] {
  if (Array.isArray(pos)) return [Number(pos[0]) || 0, Number(pos[1] ?? pos[2]) || 0];
  if (pos && typeof pos === 'object') return [Number(pos.x) || 0, Number(pos.y ?? pos.z) || 0];
  return [0, 0];
}

/**
 * Parses numeric coordinates from text like "[2, -1]", "(1.5, 3)", or "2.5, 3.0"
 */
function extractCoordinates(text: string): [number, number] | null {
  const bracketed = /\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]|\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/;
  const match1 = text.match(bracketed);
  if (match1) {
    const x = parseFloat(match1[1] || match1[3]);
    const z = parseFloat(match1[2] || match1[4]);
    return [x, z];
  }
  const rawCoord = /(?:to|at|إلى|الي|عند)\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i;
  const match2 = text.match(rawCoord);
  if (match2) {
    return [parseFloat(match2[1]), parseFloat(match2[2])];
  }
  return null;
}

/**
 * Decomposes a directorial prompt into a sequence of motion skills.
 */
export function decomposeDirectorialMotion(
  prompt: string,
  context: DecomposerContext
): MotionPlan {
  const initialPos = toCoord2D(context.startPosition || context.actorPosition || [0, 0]);
  const actorId = context.actorId || 'actor_primary';
  const totalShotDurationSec = context.totalShotDurationSec ?? 6.0;

  // Merge sceneEntities and actors
  const entities: Array<{ id: string; name: string; position: [number, number]; kind?: string }> = [
    ...(context.sceneEntities || []).map((e) => ({
      id: e.id,
      name: e.name,
      position: toCoord2D(e.position),
      kind: e.kind,
    })),
    ...(context.actors || []).map((a) => ({
      id: a.id,
      name: a.name,
      position: toCoord2D(a.position),
      kind: a.kind,
    })),
  ];

  const skills: MotionSkillInvocation[] = [];
  let currentTime = 0;
  let currentPos = [...initialPos] as [number, number];

  // Protect coordinates with commas, e.g. "2.5, 3.0"
  const protectedText = prompt.replace(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g, '$1__COORD_COMMA__$2');

  // Split clauses by punctuation, transition words, and compound actions
  const rawClauses = protectedText.split(
    /(?<!\d),(?!\d)|[.;،\n]+|\b(?:then|and then|after that)\b|\b(?:and)\s+(?=(?:sit|sits|reach|reaches|grab|grabs|pick|picks|walk|walks|run|runs|crawl|crawls|climb|climbs|push|pushes|jump|jumps|wave|waves|fight|fights|punch|punches|shoot|shoots|dodge|dodges|cheer|cheers|stand|stands|get\s+up|gets\s+up|rise|rises|fall|falls|collapse|collapses|kneel|kneels|talk|talks|wait|waits|exit|exits))\b|(?:ثم|وبعد ذلك|وبعدها|فـ?(?=(?:يقوم|ينهض|يسقط|يقع|يجلس|يقف)))|\bو(?=(?:يجلس|يمشي|يركض|يزحف|يحبو|يتسلق|يدفع|يقفز|يلوح|يقاتل|يقف|يقوم|ينهض|يسقط|يقع|ينهار|يركع|يسجد|يتحدث|يمد|يمسك|ينظر))/i
  );

  const clauses = rawClauses.map((c) => c.replace(/__COORD_COMMA__/g, ',').trim()).filter(Boolean);

  for (let idx = 0; idx < clauses.length; idx++) {
    const clause = clauses[idx];
    const clauseEn = clause.toLowerCase();
    const clauseAr = normalizeArabicText(clause);

    // 1. Walk / Locomotion / Crawl / Climb / Push / Jump / Dodge / Retreat / Drive
    const isCrawlClause =
      /\b(crawl|crawls|crawling|prone|on\s+all\s+fours|hands\s+and\s+knees)\b/i.test(clauseEn) ||
      /(يزحف|زحف|يحبو|حبو|علي بطنه)/.test(clauseAr);
    const isClimbClause =
      /\b(climb|climbs|climbing|scale|scales|scaling|ladder)\b/i.test(clauseEn) ||
      /(يتسلق|يصعد السلم|تسلق)/.test(clauseAr);
    const isPushClause =
      /\b(push|pushes|pushing|shove|shoves|shoving)\b/i.test(clauseEn) ||
      /(يدفع|يزيح|يدفش|دفع)/.test(clauseAr);
    const isJumpClause =
      /\b(jump|jumps|jumping|leap|leaps|leaping|hop|hops|vault)\b/i.test(clauseEn) ||
      /(يقفز|قفز|يثب)/.test(clauseAr);
    const isDodgeClause =
      /\b(dodge|dodges|dodging|evade|evades|evading|weave|weaves|sidestep)\b/i.test(clauseEn) ||
      /(يراوغ|يتفادي)/.test(clauseAr);
    const isRetreatClause =
      /\b(retreat|retreats|retreating|back\s+up|backs\s+up|step\s+back|steps\s+back|walk\s+back|walks\s+back)\b/i.test(clauseEn) ||
      /(يتراجع|يرجع للخلف|يعود للخلف)/.test(clauseAr);
    const isWalk =
      isCrawlClause ||
      isClimbClause ||
      isPushClause ||
      isJumpClause ||
      isDodgeClause ||
      isRetreatClause ||
      /\b(walk|walks|walking|run|runs|running|sprint|jog|sneak|move|moves|moving|step|steps|head|go|advance|approach|stride|drive|drives|driving)\b/i.test(clauseEn) ||
      /(يمشي|يمش|يركض|يجري|يتحرك|يتجه|يتقدم|يخطو|يسير|الذهاب|المشي)/i.test(clauseAr);

    if (isWalk) {
      // Find destination coordinates or entity
      const coords = extractCoordinates(clause);
      const isStageGrid = currentPos[0] > 5 || currentPos[1] > 5;
      let defaultTarget: [number, number] = isClimbClause
        ? [currentPos[0], currentPos[1]]
        : [currentPos[0] + 1.5, currentPos[1] + 1.0];

      if (isStageGrid && !coords && !isClimbClause) {
        const isFast = /\b(run|runs|running|sprint|dash)\b/i.test(clauseEn) || /(يركض|يجري)/.test(clauseAr);
        const stepDist = isCrawlClause
          ? 16
          : isPushClause
          ? 14
          : isJumpClause
          ? 18
          : isDodgeClause
          ? 14
          : isFast
          ? 32
          : 26;
        if (/\b(center|middle)\b/i.test(clauseEn) || /(المنتصف|الوسط)/.test(clauseAr)) {
          defaultTarget = [50, 55];
        } else if (/\b(left|stage left)\b/i.test(clauseEn) || /(يسار|شمال)/.test(clauseAr)) {
          defaultTarget = [Math.max(10, currentPos[0] - stepDist), currentPos[1]];
        } else if (/\b(right|stage right)\b/i.test(clauseEn) || /(يمين)/.test(clauseAr)) {
          defaultTarget = [Math.min(90, currentPos[0] + stepDist), currentPos[1]];
        } else if (
          isRetreatClause ||
          /\b(back|backward|backwards|away|upstage|north)\b/i.test(clauseEn) ||
          /(خلف|وراء|للخلف)/.test(clauseAr)
        ) {
          defaultTarget = [currentPos[0], Math.max(12, currentPos[1] - stepDist)];
        } else if (isDodgeClause) {
          const sideSign = currentPos[0] > 55 ? -1 : 1;
          defaultTarget = [Math.max(10, Math.min(90, currentPos[0] + sideSign * stepDist)), currentPos[1]];
        } else {
          // Default "forward / toward camera / ahead" movement on 0..100 stage
          const nextY = currentPos[1] <= 68 ? Math.min(88, currentPos[1] + stepDist) : Math.max(16, currentPos[1] - stepDist);
          defaultTarget = [currentPos[0], nextY];
        }
      }

      let targetPos: [number, number] = coords || defaultTarget;

      // Check if target is a known scene entity (by name or kind)
      for (const ent of entities) {
        const entName = ent.name.toLowerCase();
        const entKind = (ent.kind || '').toLowerCase();
        const entAr = normalizeArabicText(ent.name);
        if (
          clauseEn.includes(entName) ||
          (entKind && clauseEn.includes(entKind)) ||
          clauseAr.includes(entAr)
        ) {
          targetPos = [ent.position[0], ent.position[1]];
          break;
        }
      }

      const isRunClause = /\b(run|runs|running|sprint|jog|dash)\b/i.test(clauseEn) || /(يركض|يجري)/.test(clauseAr);
      const isSneakClause = /\b(sneak|sneaks|sneaking|stealth|creep|prowl)\b/i.test(clauseEn) || /(يتسلل)/.test(clauseAr);
      const clipForWalk = isCrawlClause
        ? 'human-crawl-prone'
        : isClimbClause
        ? 'human-climb-ascend'
        : isPushClause
        ? 'human-push-heavy'
        : isJumpClause
        ? 'human-jump-leap'
        : isDodgeClause
        ? 'human-dodge-weave'
        : isRetreatClause
        ? 'human-back-retreat'
        : isRunClause
        ? 'human-run-sprint'
        : isSneakClause
        ? 'human-sneak-prowl'
        : 'human-walk-forward';

      const dur = DEFAULT_SKILL_DURATIONS.walkTo;
      skills.push({
        id: `skill_${idx}_walkTo`,
        skill: 'walkTo',
        args: {
          to: targetPos,
          gait: isRunClause ? 'run' : isSneakClause || isCrawlClause ? 'sneak' : 'walk',
          motionClip: clipForWalk,
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentPos = [...targetPos];
      currentTime += dur;
      continue;
    }

    // 2. Sit / Sit Down / Kneel / Bow Down
    const isKneelClause =
      /\b(kneel|kneels|kneeling|bow\s+down|bows\s+down|prostrate|on\s+knees)\b/i.test(clauseEn) ||
      /(يركع|يسجد|يجثو|ركوع|سجود)/.test(clauseAr);
    const isSit =
      isKneelClause ||
      /\b(sit|sits|sitting|sit down|take a seat|resting|seated)\b/i.test(clauseEn) ||
      /(يجلس|جلس|الجلوس|يقعد|يستقر في مقعد)/i.test(clauseAr);

    if (isSit) {
      let seatActorId: string | undefined;
      let seatPos: [number, number, number] = [currentPos[0], 0.45, currentPos[1]];
      for (const ent of entities) {
        const entName = ent.name.toLowerCase();
        const entAr = normalizeArabicText(ent.name);
        if (clauseEn.includes(entName) || clauseAr.includes(entAr) || ent.kind === 'prop' || ent.kind === 'furniture') {
          seatPos = [ent.position[0], 0.45, ent.position[1]];
          seatActorId = ent.id;
          break;
        }
      }

      const dur = DEFAULT_SKILL_DURATIONS.sitInSeat;
      skills.push({
        id: `skill_${idx}_sitInSeat`,
        skill: 'sitInSeat',
        args: {
          seatTarget: seatPos,
          seatActorId,
          motionClip: isKneelClause ? 'human-kneel-bow' : 'human-sit-down',
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentTime += dur;
      continue;
    }

    // 3. Reach / Pick up / Grab / Hold
    const isReach =
      /\b(pick\s*up|reach|reaches|grab|grabs|take|touch|grip|hold|grasp)\b/i.test(clauseEn) ||
      /(يمسك|يلتقط|ياخذ|يمد يده|يلمس|يتناول|مسك|التقاط)/i.test(clauseAr);

    if (isReach) {
      const isLeft = /\b(left|left hand)\b/i.test(clauseEn) || /(شمال|يسار|باليد اليسري)/i.test(clauseAr);
      const hand = isLeft ? 'left' : 'right';

      let targetPos: [number, number, number] = [currentPos[0] + (hand === 'left' ? -0.25 : 0.25), 1.0, currentPos[1] + 0.35];
      let targetEntityId: string | undefined;
      for (const ent of entities) {
        if (clauseEn.includes(ent.name.toLowerCase()) || clauseAr.includes(normalizeArabicText(ent.name))) {
          targetPos = [ent.position[0], 0.85, ent.position[1]];
          targetEntityId = ent.id;
          break;
        }
      }

      const dur = DEFAULT_SKILL_DURATIONS.reachGrip;
      skills.push({
        id: `skill_${idx}_reachGrip`,
        skill: 'reachGrip',
        args: {
          hand,
          target: targetPos,
          targetActorId: targetEntityId,
          grasp: 'grip',
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentTime += dur;
      continue;
    }

    // 4. Talk / Dialogue / Wave / Cheer / Expressive Gestures
    const isWaveClause =
      /\b(wave|waves|waving|greet|greets|greeting|signal|signals|hello)\b/i.test(clauseEn) ||
      /(يلوح|يحيي|تلويح)/.test(clauseAr);
    const isCheerClause =
      /\b(cheer|cheers|cheering|celebrate|celebrates|celebrating|victory|triumph|dance)\b/i.test(clauseEn) ||
      /(يحتفل|يهتف|انتصار)/.test(clauseAr);
    const isTalk =
      isWaveClause ||
      isCheerClause ||
      /\b(talk|talks|speak|speaks|dialogue|gesture|gestures|explain|conversing)\b/i.test(clauseEn) ||
      /(يتحدث|يتكلم|يشرح|يتحاور|حوار|ايماءات|يتحدث بطلاقه)/i.test(clauseAr);

    if (isTalk) {
      const isSubtle = /\b(subtle|quiet|soft)\b/i.test(clauseEn) || /(بهدوء|خفيف|بسيط)/i.test(clauseAr);
      const dur = DEFAULT_SKILL_DURATIONS.talkGesture;
      skills.push({
        id: `skill_${idx}_talkGesture`,
        skill: 'talkGesture',
        args: {
          style: isSubtle ? 'subtle' : 'expressive',
          intensity: isSubtle ? 0.4 : 0.8,
          motionClip: isWaveClause ? 'human-wave-greet' : isCheerClause ? 'human-victory-cheer' : undefined,
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentTime += dur;
      continue;
    }

    // 5. Stand Up / Rise / Stand / Idle / Look Around / Scan / Waiting
    const isStandUpClause =
      /\b(stand\s+up|stands\s+up|standing\s+up|get\s+up|gets\s+up|getting\s+up|rise|rises|rising)\b/i.test(clauseEn) ||
      /(يقوم|ينهض|نهوض|يستقيم|يقف من جديد)/.test(clauseAr);
    const isLookClause =
      /\b(look|looks|looking|turn\s+head|turns\s+head|scan|scans|search|searches|gaze|gazes|glance|watch)\b/i.test(clauseEn) ||
      /(ينظر|يلتفت|يتلفت|يبحث|يراقب)/.test(clauseAr);
    const isStand =
      isStandUpClause ||
      isLookClause ||
      /\b(stand|stands|idle|wait|waits|pose|stay)\b/i.test(clauseEn) ||
      /(يقف|وقوف|ينتظر|مسترخيا|ثابت|يتطلع)/i.test(clauseAr);

    if (isStand) {
      const dur = isStandUpClause ? 2.2 : DEFAULT_SKILL_DURATIONS.standIdle;
      skills.push({
        id: `skill_${idx}_standIdle`,
        skill: 'standIdle',
        args: {
          stance: isLookClause ? 'alert' : 'relaxed',
          motionClip: isStandUpClause
            ? 'human-stand-up'
            : isLookClause
            ? 'human-look-search'
            : 'human-idle-breathe',
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentTime += dur;
      continue;
    }

    // 6. Combat / Fight / Shoot / Fall / Collapse / Hit Reaction / Impact
    const isFallClause =
      /\b(fall|falls|falling|collapse|collapses|collapsing|faint|faints|drop\s+down|drops\s+down|pass\s+out)\b/i.test(clauseEn) ||
      /(يسقط|يقع|ينهار|يغمي عليه|سقوط|وقع)/.test(clauseAr);
    const isSwordClause =
      /\b(sword|blade|slash|slashes|slashing|cleave)\b/i.test(clauseEn) ||
      /(سيف|يلوح بالسيف)/.test(clauseAr);
    const isShootClause =
      /\b(aim|aims|aiming|shoot|shoots|shooting|fire|fires|firing|gun|pistol|rifle)\b/i.test(clauseEn) ||
      /(يصوب|يطلق النار|مسدس)/.test(clauseAr);
    const isPunchClause =
      /\b(punch|punches|punching|fight|fights|fighting|jab|cross|box|boxing|strike|attack|kick)\b/i.test(clauseEn) ||
      /(يلكم|يقاتل|يتشاجر|ضربه|قتال)/.test(clauseAr);
    const isHit =
      isFallClause ||
      isSwordClause ||
      isShootClause ||
      isPunchClause ||
      /\b(hit|struck|impact|recoil|knocked|stumble|stagger)\b/i.test(clauseEn) ||
      /(يتلقي ضربه|يرتد|يصطدم|يتعثر|صدمه)/i.test(clauseAr);

    if (isHit) {
      const combatClip = isFallClause
        ? 'human-fall-collapse'
        : isSwordClause
        ? 'human-sword-slash'
        : isShootClause
        ? 'human-aim-fire'
        : isPunchClause
        ? 'human-combo-punch'
        : 'human-hit-stagger';
      const dur = isFallClause || isSwordClause || isShootClause || isPunchClause ? 1.8 : DEFAULT_SKILL_DURATIONS.hitReaction;
      skills.push({
        id: `skill_${idx}_hitReaction`,
        skill: 'hitReaction',
        args: {
          direction: 'front',
          intensity: 0.85,
          motionClip: combatClip,
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentTime += dur;
      continue;
    }

    // 7. Universal Open-Ended Clause Synthesis (Clapping, Swimming, Bending, Custom Actions)
    const clauseProg = buildOfflineUniversalKinematicProgram(clause);
    const firstPhase = clauseProg.phases[0];
    const dur = 2.2;
    if (firstPhase?.stageDelta && (Math.abs(firstPhase.stageDelta[0]) > 1 || Math.abs(firstPhase.stageDelta[1]) > 1)) {
      const nextTarget: [number, number] = [
        Math.max(8, Math.min(92, currentPos[0] + firstPhase.stageDelta[0])),
        Math.max(8, Math.min(92, currentPos[1] + firstPhase.stageDelta[1])),
      ];
      skills.push({
        id: `skill_${idx}_universal_move`,
        skill: 'walkTo',
        args: {
          to: nextTarget,
          gait: 'walk',
          motionClip: clauseProg.id,
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentPos = [...nextTarget];
    } else {
      skills.push({
        id: `skill_${idx}_universal_act`,
        skill: 'talkGesture',
        args: {
          style: 'expressive',
          intensity: 0.8,
          motionClip: clauseProg.id,
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
    }
    currentTime += dur;
  }

  // Fallback: If no discrete skills were matched, synthesize an expressive universal kinematic program
  if (skills.length === 0) {
    const fallbackProg = buildOfflineUniversalKinematicProgram(prompt || 'stand');
    skills.push({
      id: 'skill_fallback_stand',
      skill: 'standIdle',
      args: { stance: 'neutral', motionClip: fallbackProg.id },
      startTimeSec: 0,
      durationSec: Math.min(3.0, totalShotDurationSec),
    });
  }

  return {
    actorId,
    skills,
    totalDurationSec: Math.max(totalShotDurationSec, currentTime),
  };
}
