/**
 * Declarative Motion Skills Specification
 * 
 * Provides high-level, parameterized directorial animation skills:
 * - walkTo: Locomotion to world coordinates with authentic gait and turning
 * - sitInSeat: Lowering into chair/seat with hip settling and arm rest
 * - reachGrip: Procedural arm reach, hand grasp, holding, and release
 * - standIdle: Natural posture with subtle organic breathing and weight shift
 * - talkGesture: Directorial conversational gesticulation and head tilts
 * - hitReaction: Impact impulse displacement and balance recovery
 * - exitCar: Rising from seated vehicular posture to standing stride
 */

import { Point2D, Point3D } from '../../types/shotspec';

export type Coord2D = [number, number] | Point2D;
export type Coord3D = [number, number, number] | Point3D;

export type MotionSkillType =
  | 'walkTo'
  | 'sitInSeat'
  | 'reachGrip'
  | 'standIdle'
  | 'talkGesture'
  | 'hitReaction'
  | 'exitCar';

export interface WalkToArgs {
  to: Coord2D; // [x, z] or { x, y } target on ground
  steps?: number;
  stepLength?: number; // default ~0.5m
  heading?: number; // target yaw in degrees
  vary?: number; // 0..2 rhythm variance
  firstStep?: number; // stride of initial step
}

export interface SitInSeatArgs {
  seatTarget?: Coord3D | Coord2D; // seat surface position
  seatActorId?: string; // target chair / bench actor ID
  heading?: number;
  durationSec?: number;
}

export interface ReachGripArgs {
  target?: Coord3D; // world contact position
  targetActorId?: string; // target prop/object ID
  hand: 'left' | 'right';
  grasp?: 'pinch' | 'grip' | 'palm' | 'index_point';
  reachSec?: number;
  holdSec?: number;
  releaseSec?: number;
}

export interface StandIdleArgs {
  at?: Coord2D;
  heading?: number;
  stance?: 'neutral' | 'relaxed' | 'alert' | 'crossed_arms' | 'hands_on_hips';
  durationSec?: number;
}

export interface TalkGestureArgs {
  intensity?: number; // 0.1 .. 1.0
  style?: 'expressive' | 'subtle' | 'explaining' | 'emphatic';
  durationSec?: number;
}

export interface HitReactionArgs {
  direction?: 'front' | 'back' | 'left' | 'right';
  intensity?: number; // 0.1 .. 1.0
  durationSec?: number;
}

export interface ExitCarArgs {
  carTarget?: Coord2D;
  side?: 'left' | 'right';
  durationSec?: number;
}

export type MotionSkillInvocation =
  | { id: string; skill: 'walkTo'; args: WalkToArgs; startTimeSec: number; durationSec?: number }
  | { id: string; skill: 'sitInSeat'; args: SitInSeatArgs; startTimeSec: number; durationSec?: number }
  | { id: string; skill: 'reachGrip'; args: ReachGripArgs; startTimeSec: number; durationSec?: number }
  | { id: string; skill: 'standIdle'; args: StandIdleArgs; startTimeSec: number; durationSec?: number }
  | { id: string; skill: 'talkGesture'; args: TalkGestureArgs; startTimeSec: number; durationSec?: number }
  | { id: string; skill: 'hitReaction'; args: HitReactionArgs; startTimeSec: number; durationSec?: number }
  | { id: string; skill: 'exitCar'; args: ExitCarArgs; startTimeSec: number; durationSec?: number };

export interface MotionPlan {
  actorId: string;
  skills: MotionSkillInvocation[];
  totalDurationSec: number;
}

/** Default durations for motion skills when omitted */
export const DEFAULT_SKILL_DURATIONS: Record<MotionSkillType, number> = {
  walkTo: 2.5,
  sitInSeat: 1.8,
  reachGrip: 1.6,
  standIdle: 3.0,
  talkGesture: 3.0,
  hitReaction: 0.8,
  exitCar: 2.2,
};

let skillSeq = 0;
const nextSkillId = (type: string) => `mskill_${type}_${Date.now()}_${++skillSeq}`;

export function walkTo(args: WalkToArgs, startTimeSec: number = 0, durationSec?: number): Extract<MotionSkillInvocation, { skill: 'walkTo' }> {
  return {
    id: nextSkillId('walk'),
    skill: 'walkTo',
    args,
    startTimeSec,
    durationSec: durationSec ?? DEFAULT_SKILL_DURATIONS.walkTo,
  };
}

export function sitInSeat(args: SitInSeatArgs = {}, startTimeSec: number = 0, durationSec?: number): Extract<MotionSkillInvocation, { skill: 'sitInSeat' }> {
  return {
    id: nextSkillId('sit'),
    skill: 'sitInSeat',
    args,
    startTimeSec,
    durationSec: durationSec ?? (args.durationSec || DEFAULT_SKILL_DURATIONS.sitInSeat),
  };
}

export function reachGrip(args: ReachGripArgs, startTimeSec: number = 0, durationSec?: number): Extract<MotionSkillInvocation, { skill: 'reachGrip' }> {
  return {
    id: nextSkillId('reach'),
    skill: 'reachGrip',
    args,
    startTimeSec,
    durationSec: durationSec ?? DEFAULT_SKILL_DURATIONS.reachGrip,
  };
}

export function standIdle(args: StandIdleArgs = {}, startTimeSec: number = 0, durationSec?: number): Extract<MotionSkillInvocation, { skill: 'standIdle' }> {
  return {
    id: nextSkillId('idle'),
    skill: 'standIdle',
    args,
    startTimeSec,
    durationSec: durationSec ?? (args.durationSec || DEFAULT_SKILL_DURATIONS.standIdle),
  };
}

export function talkGesture(args: TalkGestureArgs = {}, startTimeSec: number = 0, durationSec?: number): Extract<MotionSkillInvocation, { skill: 'talkGesture' }> {
  return {
    id: nextSkillId('talk'),
    skill: 'talkGesture',
    args,
    startTimeSec,
    durationSec: durationSec ?? (args.durationSec || DEFAULT_SKILL_DURATIONS.talkGesture),
  };
}

export function hitReaction(args: HitReactionArgs = {}, startTimeSec: number = 0, durationSec?: number): Extract<MotionSkillInvocation, { skill: 'hitReaction' }> {
  return {
    id: nextSkillId('hit'),
    skill: 'hitReaction',
    args,
    startTimeSec,
    durationSec: durationSec ?? (args.durationSec || DEFAULT_SKILL_DURATIONS.hitReaction),
  };
}

export function exitCar(args: ExitCarArgs = {}, startTimeSec: number = 0, durationSec?: number): Extract<MotionSkillInvocation, { skill: 'exitCar' }> {
  return {
    id: nextSkillId('exitcar'),
    skill: 'exitCar',
    args,
    startTimeSec,
    durationSec: durationSec ?? (args.durationSec || DEFAULT_SKILL_DURATIONS.exitCar),
  };
}
