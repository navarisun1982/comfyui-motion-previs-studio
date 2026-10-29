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
    /(?<!\d),(?!\d)|[.;،\n]+|\b(?:then|and then|after that)\b|\b(?:and)\s+(?=(?:sit|reach|grab|pick|walk|stand|talk|wait|exit))\b|(?:ثم|وبعد ذلك|وبعدها)|\bو(?=(?:يجلس|يمشي|يقف|يتحدث|يمد|يمسك|ينظر))/i
  );

  const clauses = rawClauses.map((c) => c.replace(/__COORD_COMMA__/g, ',').trim()).filter(Boolean);

  for (let idx = 0; idx < clauses.length; idx++) {
    const clause = clauses[idx];
    const clauseEn = clause.toLowerCase();
    const clauseAr = normalizeArabicText(clause);

    // 1. Walk / Locomotion / Drive
    const isWalk =
      /\b(walk|walks|walking|run|runs|running|sprint|jog|sneak|move|moves|moving|step|steps|head|go|advance|approach|stride|drive|drives|driving)\b/i.test(clauseEn) ||
      /(يمشي|يمش|يركض|يجري|يتحرك|يتجه|يتقدم|يخطو|يسير|الذهاب|المشي)/i.test(clauseAr);

    if (isWalk) {
      // Find destination coordinates or entity
      const coords = extractCoordinates(clause);
      const isStageGrid = currentPos[0] > 5 || currentPos[1] > 5;
      let defaultTarget: [number, number] = [currentPos[0] + 1.5, currentPos[1] + 1.0];

      if (isStageGrid && !coords) {
        const stepDist = 26;
        if (/\b(left|stage left)\b/i.test(clauseEn) || /(يسار|شمال)/.test(clauseAr)) {
          defaultTarget = [Math.max(10, currentPos[0] - stepDist), currentPos[1]];
        } else if (/\b(right|stage right)\b/i.test(clauseEn) || /(يمين)/.test(clauseAr)) {
          defaultTarget = [Math.min(90, currentPos[0] + stepDist), currentPos[1]];
        } else if (/\b(back|backward|backwards|away|upstage|north)\b/i.test(clauseEn) || /(خلف|وراء|للخلف)/.test(clauseAr)) {
          defaultTarget = [currentPos[0], Math.max(12, currentPos[1] - stepDist)];
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

      const dur = DEFAULT_SKILL_DURATIONS.walkTo;
      skills.push({
        id: `skill_${idx}_walkTo`,
        skill: 'walkTo',
        args: {
          to: targetPos,
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentPos = [...targetPos];
      currentTime += dur;
      continue;
    }

    // 2. Sit / Sit Down
    const isSit =
      /\b(sit|sit down|take a seat|resting|seated)\b/i.test(clauseEn) ||
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
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentTime += dur;
      continue;
    }

    // 3. Reach / Pick up / Grab / Hold
    const isReach =
      /\b(pick\s*up|reach|grab|take|touch|grip|hold|grasp)\b/i.test(clauseEn) ||
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

    // 4. Talk / Dialogue / Expressive Gestures
    const isTalk =
      /\b(talk|speak|dialogue|gesture|explain|conversing)\b/i.test(clauseEn) ||
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
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentTime += dur;
      continue;
    }

    // 5. Stand / Idle / Waiting
    const isStand =
      /\b(stand|idle|wait|look around|pose|stay)\b/i.test(clauseEn) ||
      /(يقف|وقوف|ينتظر|مسترخيا|ثابت|يتطلع)/i.test(clauseAr);

    if (isStand) {
      const dur = DEFAULT_SKILL_DURATIONS.standIdle;
      skills.push({
        id: `skill_${idx}_standIdle`,
        skill: 'standIdle',
        args: {
          stance: 'relaxed',
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentTime += dur;
      continue;
    }

    // 6. Hit Reaction / Impact
    const isHit =
      /\b(hit|struck|impact|recoil|knocked|stumble)\b/i.test(clauseEn) ||
      /(يتلقي ضربه|يرتد|يصطدم|يتعثر|صدمه)/i.test(clauseAr);

    if (isHit) {
      const dur = DEFAULT_SKILL_DURATIONS.hitReaction;
      skills.push({
        id: `skill_${idx}_hitReaction`,
        skill: 'hitReaction',
        args: {
          direction: 'front',
          intensity: 0.85,
        },
        startTimeSec: currentTime,
        durationSec: dur,
      });
      currentTime += dur;
      continue;
    }
  }

  // Fallback: If no discrete skills were matched, default to standIdle -> talkGesture
  if (skills.length === 0) {
    skills.push({
      id: 'skill_fallback_stand',
      skill: 'standIdle',
      args: { stance: 'neutral' },
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
