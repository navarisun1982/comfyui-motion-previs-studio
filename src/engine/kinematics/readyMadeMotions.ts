/**
 * Unified Ready-Made Motion Library & Procedural Action Clip Engine
 *
 * Provides 1-click ready-made motions for both Humanoid Characters and Non-Human
 * Stage Objects (Quadrupeds/Animals, Vehicles, Aerial Craft/Drones, Weapons/Props,
 * and Furniture/Set Pieces).
 *
 * Designed specifically for a Timeline-Driven Cinematic Previs Studio:
 * 1. Purely deterministic evaluation `f(t)` — supports timeline scrubbing, looping,
 *    multi-cue time windows `[From -> To]`, and frame-accurate AI video pass rendering.
 * 2. Combines Root Stage Trajectory synthesis (Travel vs In-Place, Jump Parabolas,
 *    Knockback, Drift curves, Drop bounces) with 60fps Skeletal IK/FK & Sub-Mesh Articulation.
 * 3. Zero external runtime dependencies and 100% compatible with any character height/scale.
 */

import * as THREE from 'three';
import { Actor, ActorGait, Point2D, Point3D, TrajectoryKeyframe } from '../../types/shotspec';
import { HumanoidRig } from './skeletonHierarchy';
import { solveLimbIK, solveLookAt } from './twoBoneIKSolver';
import { evaluateGait } from './gaitEngine';
import { applyPosePreset } from './posePresets';
import {
  ObjectPoseCategory,
  detectObjectPoseCategory,
} from './objectPosePresets';

export type HumanoidMotionGroup = 'move' | 'combat' | 'acting';

export interface ReadyMadeMotionClip {
  id: string;
  name: string;
  icon: string;
  category: ObjectPoseCategory;
  /** Sub-group for humanoid clips to organize UI tabs/chips cleanly */
  humanGroup?: HumanoidMotionGroup;
  description: string;
  /** Prompt phrase automatically injected into actor.actionDescription for LTX / MiniMax */
  promptPhrase: string;
  /** Default duration in seconds when triggered as a cue */
  defaultDurationSec: number;
  /** Whether this clip naturally travels across the stage floor by default */
  travelsByDefault: boolean;
  /** Optional underlying continuous gait loop */
  baseGait?: ActorGait;
  /** Optional ending or base pose preset */
  basePosePreset?: string;
}

export const READY_MADE_MOTIONS: ReadyMadeMotionClip[] = [
  // ============================================================================
  // 1. HUMANOID — LOCOMOTION & MOVEMENT ('move')
  // ============================================================================
  {
    id: 'human-walk-forward',
    name: 'Walk Forward',
    icon: '🚶',
    category: 'humanoid',
    humanGroup: 'move',
    description: 'Natural balanced walking stride across the stage.',
    promptPhrase: 'walks forward with a natural steady stride',
    defaultDurationSec: 2.5,
    travelsByDefault: true,
    baseGait: 'walk',
  },
  {
    id: 'human-run-sprint',
    name: 'Run / Sprint',
    icon: '🏃',
    category: 'humanoid',
    humanGroup: 'move',
    description: 'High-energy athletic running cycle with forward torso drive.',
    promptPhrase: 'runs forward in an energetic athletic sprint',
    defaultDurationSec: 2.0,
    travelsByDefault: true,
    baseGait: 'run',
  },
  {
    id: 'human-jump-leap',
    name: 'Jump / Leap',
    icon: '🦘',
    category: 'humanoid',
    humanGroup: 'move',
    description: 'Crouch anticipation, explosive airborne leap arc, and cushioned landing.',
    promptPhrase: 'crouches and leaps through the air before landing firmly on both feet',
    defaultDurationSec: 1.8,
    travelsByDefault: true,
    baseGait: 'none',
  },
  {
    id: 'human-sneak-prowl',
    name: 'Sneak / Stealth',
    icon: '🕵️',
    category: 'humanoid',
    humanGroup: 'move',
    description: 'Low crouched tactical stealth movement with cautious footsteps.',
    promptPhrase: 'sneaks forward in a low cautious stealth crouch',
    defaultDurationSec: 3.0,
    travelsByDefault: true,
    baseGait: 'sneak',
  },
  {
    id: 'human-back-retreat',
    name: 'Back Up / Retreat',
    icon: '🔙',
    category: 'humanoid',
    humanGroup: 'move',
    description: 'Defensive backward steps while keeping eyes locked ahead.',
    promptPhrase: 'steps backward cautiously while facing forward',
    defaultDurationSec: 2.2,
    travelsByDefault: true,
    baseGait: 'walk',
  },

  // ============================================================================
  // 2. HUMANOID — COMBAT & ACTION ('combat')
  // ============================================================================
  {
    id: 'human-combo-punch',
    name: 'Punch / Fight Combo',
    icon: '🥊',
    category: 'humanoid',
    humanGroup: 'combat',
    description: 'Martial arts fighting guard with left jab, torso-twisting right cross, and recovery.',
    promptPhrase: 'throws a rapid martial arts jab and cross punch combination from a fighting stance',
    defaultDurationSec: 2.0,
    travelsByDefault: false,
    baseGait: 'none',
    basePosePreset: 'combat-guard',
  },
  {
    id: 'human-sword-slash',
    name: 'Weapon / Sword Slash',
    icon: '⚔️',
    category: 'humanoid',
    humanGroup: 'combat',
    description: 'High overhead wind-up followed by a powerful diagonal weapon cleave and lunge.',
    promptPhrase: 'lunges forward and swings a powerful diagonal weapon slash',
    defaultDurationSec: 1.8,
    travelsByDefault: false,
    baseGait: 'none',
    basePosePreset: 'combat-guard',
  },
  {
    id: 'human-aim-fire',
    name: 'Aim & Shoot (Recoil)',
    icon: '🔫',
    category: 'humanoid',
    humanGroup: 'combat',
    description: 'Tactical two-handed firearm aim with sharp muzzle recoil kicks.',
    promptPhrase: 'raises weapon in a tactical stance and fires with sharp recoil',
    defaultDurationSec: 2.0,
    travelsByDefault: false,
    baseGait: 'none',
    basePosePreset: 'aim-pistol',
  },
  {
    id: 'human-dodge-weave',
    name: 'Dodge / Evade',
    icon: '💨',
    category: 'humanoid',
    humanGroup: 'combat',
    description: 'Quick evasive duck and lateral side-step weave under incoming attack.',
    promptPhrase: 'ducks low and weaves sideways to dodge an incoming strike',
    defaultDurationSec: 1.6,
    travelsByDefault: true,
    baseGait: 'none',
    basePosePreset: 'crouch-stealth',
  },
  {
    id: 'human-hit-stagger',
    name: 'Hit / Knockback',
    icon: '💥',
    category: 'humanoid',
    humanGroup: 'combat',
    description: 'Heavy chest impact reaction with backward stagger and balance recovery.',
    promptPhrase: 'recoils backward from a heavy impact and staggers before regaining balance',
    defaultDurationSec: 1.6,
    travelsByDefault: true,
    baseGait: 'none',
  },

  // ============================================================================
  // 3. HUMANOID — ACTING & STANCE ('acting')
  // ============================================================================
  {
    id: 'human-idle-breathe',
    name: 'Idle Breathing',
    icon: '🧍',
    category: 'humanoid',
    humanGroup: 'acting',
    description: 'Natural standing posture with subtle organic chest breathing and weight shift.',
    promptPhrase: 'stands naturally with subtle breathing and weight shift',
    defaultDurationSec: 3.0,
    travelsByDefault: false,
    baseGait: 'idle',
    basePosePreset: 'neutral-stand',
  },
  {
    id: 'human-wave-greet',
    name: 'Wave / Signal',
    icon: '👋',
    category: 'humanoid',
    humanGroup: 'acting',
    description: 'Raises right hand high and waves side-to-side in greeting or signaling.',
    promptPhrase: 'raises one hand high and waves warmly toward the camera',
    defaultDurationSec: 2.4,
    travelsByDefault: false,
    baseGait: 'none',
  },
  {
    id: 'human-look-search',
    name: 'Look Around (Scan)',
    icon: '👀',
    category: 'humanoid',
    humanGroup: 'acting',
    description: 'Alert scanning of the environment, turning head and chest left and right.',
    promptPhrase: 'scans the surroundings alertly, looking left and right',
    defaultDurationSec: 2.8,
    travelsByDefault: false,
    baseGait: 'none',
  },
  {
    id: 'human-sit-down',
    name: 'Sit Down',
    icon: '🪑',
    category: 'humanoid',
    humanGroup: 'acting',
    description: 'Smooth transition from standing posture down into a seated position.',
    promptPhrase: 'lowers down smoothly into a seated posture',
    defaultDurationSec: 2.0,
    travelsByDefault: false,
    baseGait: 'none',
    basePosePreset: 'seated-chair',
  },
  {
    id: 'human-victory-cheer',
    name: 'Celebrate / Cheer',
    icon: '🙌',
    category: 'humanoid',
    humanGroup: 'acting',
    description: 'Both arms raised overhead pumping in celebration with energetic bounce.',
    promptPhrase: 'raises both arms overhead and cheers in triumph',
    defaultDurationSec: 2.4,
    travelsByDefault: false,
    baseGait: 'none',
  },

  // ============================================================================
  // 4. QUADRUPEDS / ANIMALS / CREATURES ('quadruped')
  // ============================================================================
  {
    id: 'quad-trot-forward',
    name: 'Walk / Trot',
    icon: '🐾',
    category: 'quadruped',
    description: 'Steady four-legged diagonal trotting gait across the stage.',
    promptPhrase: 'trots forward steadily on all fours',
    defaultDurationSec: 2.5,
    travelsByDefault: true,
  },
  {
    id: 'quad-gallop-charge',
    name: 'Gallop / Charge',
    icon: '🐎',
    category: 'quadruped',
    description: 'High-speed bounding gallop with dynamic spine pitch and stride extension.',
    promptPhrase: 'gallops forward at full speed with powerful bounding strides',
    defaultDurationSec: 2.0,
    travelsByDefault: true,
  },
  {
    id: 'quad-pounce-leap',
    name: 'Pounce / Leap Attack',
    icon: '🦁',
    category: 'quadruped',
    description: 'Coils low on hind legs then launches into a high parabolic pounce.',
    promptPhrase: 'coils low and launches into a fierce airborne pounce',
    defaultDurationSec: 1.8,
    travelsByDefault: true,
  },
  {
    id: 'quad-stalk-prowl',
    name: 'Stalk / Prowl Low',
    icon: '🐺',
    category: 'quadruped',
    description: 'Slow predatory prowl with lowered shoulders and head.',
    promptPhrase: 'prowls forward slowly in a low predatory crouch',
    defaultDurationSec: 3.0,
    travelsByDefault: true,
  },
  {
    id: 'quad-alert-idle',
    name: 'Alert Idle Scan',
    icon: '🦌',
    category: 'quadruped',
    description: 'Stationary four-legged stance with subtle breathing and alert head turns.',
    promptPhrase: 'stands alertly on all fours, scanning the surroundings',
    defaultDurationSec: 3.0,
    travelsByDefault: false,
  },

  // ============================================================================
  // 5. VEHICLES ('vehicle')
  // ============================================================================
  {
    id: 'veh-drive-cruise',
    name: 'Drive / Cruise',
    icon: '🚗',
    category: 'vehicle',
    description: 'Smooth forward driving motion with realistic road suspension micro-bounce.',
    promptPhrase: 'drives forward smoothly along the road',
    defaultDurationSec: 2.5,
    travelsByDefault: true,
  },
  {
    id: 'veh-accel-launch',
    name: 'Full-Throttle Launch',
    icon: '🏎️',
    category: 'vehicle',
    description: 'Aggressive acceleration with rear suspension squat and nose lift.',
    promptPhrase: 'launches forward at full throttle with rear suspension squat',
    defaultDurationSec: 2.0,
    travelsByDefault: true,
  },
  {
    id: 'veh-hard-brake',
    name: 'Hard Brake (Nose Dive)',
    icon: '🛑',
    category: 'vehicle',
    description: 'Speeds in then slams the brakes with forward chassis nose-dive pitch.',
    promptPhrase: 'brakes hard to a halt with dramatic forward nose-dive pitch',
    defaultDurationSec: 2.0,
    travelsByDefault: true,
  },
  {
    id: 'veh-drift-turn',
    name: 'Drift / Power Slide',
    icon: '💨',
    category: 'vehicle',
    description: 'Sweeping curve with oversteer yaw angle and lateral chassis body roll.',
    promptPhrase: 'drifts sideways through a sharp turn with dramatic body roll',
    defaultDurationSec: 2.4,
    travelsByDefault: true,
  },
  {
    id: 'veh-idle-rumble',
    name: 'Engine Idle Rumble',
    icon: '🚙',
    category: 'vehicle',
    description: 'Parked stationary with high-frequency engine vibration.',
    promptPhrase: 'idles in place with a subtle engine rumble',
    defaultDurationSec: 3.0,
    travelsByDefault: false,
  },

  // ============================================================================
  // 6. AERIAL / DRONES / AIRCRAFT / BIRDS ('aerial')
  // ============================================================================
  {
    id: 'air-hover-bob',
    name: 'Hover & Stabilize',
    icon: '🚁',
    category: 'aerial',
    description: 'Mid-air hovering with gentle vertical bobbing and roll stabilization.',
    promptPhrase: 'hovers steadily in mid-air with subtle altitude stabilization',
    defaultDurationSec: 3.0,
    travelsByDefault: false,
  },
  {
    id: 'air-swoop-flyby',
    name: 'Banked Swoop Fly-By',
    icon: '✈️',
    category: 'aerial',
    description: 'Fast forward flight banking into a dramatic aerodynamic roll.',
    promptPhrase: 'swoops forward through the air in a banked aerodynamic turn',
    defaultDurationSec: 2.2,
    travelsByDefault: true,
  },
  {
    id: 'air-takeoff-climb',
    name: 'Takeoff & Ascend',
    icon: '🚀',
    category: 'aerial',
    description: 'Lifts off from the ground and climbs steeply into forward flight.',
    promptPhrase: 'lifts off from the ground and ascends steeply into the sky',
    defaultDurationSec: 2.5,
    travelsByDefault: true,
  },
  {
    id: 'air-dive-attack',
    name: 'Steep Dive Swoop',
    icon: '🦅',
    category: 'aerial',
    description: 'Dives down from high altitude and pulls up level near the stage floor.',
    promptPhrase: 'dives steeply downward before pulling up into level flight',
    defaultDurationSec: 2.2,
    travelsByDefault: true,
  },

  // ============================================================================
  // 7. WEAPONS & HANDHELD PROPS ('weapon_prop')
  // ============================================================================
  {
    id: 'prop-slash-swing',
    name: 'Slash / Swing Arc',
    icon: '⚔️',
    category: 'weapon_prop',
    description: 'Dynamic sweeping slash rotation arc.',
    promptPhrase: 'swings through the air in a fast sweeping arc',
    defaultDurationSec: 1.6,
    travelsByDefault: false,
  },
  {
    id: 'prop-float-spin',
    name: 'Hero Levitate & Spin',
    icon: '✨',
    category: 'weapon_prop',
    description: 'Levitates in mid-air with a smooth 360° showcase rotation.',
    promptPhrase: 'levitates and rotates smoothly in mid-air',
    defaultDurationSec: 3.0,
    travelsByDefault: false,
  },
  {
    id: 'prop-recoil-kick',
    name: 'Fire / Recoil Kick',
    icon: '💥',
    category: 'weapon_prop',
    description: 'Repeated sharp upward and backward recoil impulses.',
    promptPhrase: 'fires with sharp mechanical recoil kicks',
    defaultDurationSec: 1.8,
    travelsByDefault: false,
  },
  {
    id: 'prop-drop-bounce',
    name: 'Drop & Floor Bounce',
    icon: '⬇️',
    category: 'weapon_prop',
    description: 'Falls to the floor under gravity and bounces to a rest.',
    promptPhrase: 'falls to the ground and bounces before settling on the floor',
    defaultDurationSec: 1.8,
    travelsByDefault: false,
  },

  // ============================================================================
  // 8. FURNITURE / SET PIECES / ENVIRONMENT ('furniture_set' & 'environment_prop')
  // ============================================================================
  {
    id: 'env-swing-open',
    name: 'Swing Open (90°)',
    icon: '🚪',
    category: 'furniture_set',
    description: 'Swings open smoothly through a 90° hinge arc.',
    promptPhrase: 'swings open smoothly on its hinges',
    defaultDurationSec: 2.0,
    travelsByDefault: false,
  },
  {
    id: 'env-quake-shake',
    name: 'Impact / Tremor Shake',
    icon: '🌋',
    category: 'furniture_set',
    description: 'Rattles and tilts from an explosion or seismic impact.',
    promptPhrase: 'rattles and shakes violently from an impact tremor',
    defaultDurationSec: 1.8,
    travelsByDefault: false,
  },
  {
    id: 'env-fall-topple',
    name: 'Topple / Knock Over',
    icon: '📉',
    category: 'furniture_set',
    description: 'Tips over 90° onto the floor with a heavy impact bounce.',
    promptPhrase: 'tips over and crashes onto the floor',
    defaultDurationSec: 1.8,
    travelsByDefault: false,
  },
  {
    id: 'env-turntable-spin',
    name: 'Turntable Spin 360°',
    icon: '🔄',
    category: 'furniture_set',
    description: 'Smooth 360° showcase rotation in place.',
    promptPhrase: 'rotates 360 degrees smoothly in place',
    defaultDurationSec: 3.0,
    travelsByDefault: false,
  },
];

export function findReadyMadeMotionById(id?: string | null): ReadyMadeMotionClip | undefined {
  if (!id) return undefined;
  return READY_MADE_MOTIONS.find((m) => m.id === id);
}

export function getReadyMadeMotionsForCategory(category: ObjectPoseCategory): ReadyMadeMotionClip[] {
  if (category === 'environment_prop') {
    return READY_MADE_MOTIONS.filter(
      (m) => m.category === 'furniture_set' || m.category === 'environment_prop' || m.category === 'weapon_prop'
    );
  }
  return READY_MADE_MOTIONS.filter((m) => m.category === category);
}

export function getReadyMadeMotionsForActor(actor?: Partial<Actor> | null): {
  category: ObjectPoseCategory;
  clips: ReadyMadeMotionClip[];
} {
  const category = detectObjectPoseCategory(actor);
  return {
    category,
    clips: getReadyMadeMotionsForCategory(category),
  };
}

export interface CompileReadyMadeMotionOptions {
  startTimeSec: number;
  endTimeSec: number;
  startPosition: Point2D;
  startRotation?: Point3D;
  /** 'auto' uses clip.travelsByDefault; 'travel' forces stage translation; 'in-place' keeps X/Y locked */
  travelMode?: 'auto' | 'travel' | 'in-place';
  /** Optional target destination on the 0..100 stage floor */
  targetPosition?: Point2D;
  /** Number of times the action cycle repeats across [startTimeSec, endTimeSec] (default 1) */
  motionCycles?: number;
}

/**
 * Generates deterministic multi-point trajectory keyframes (Position X/Y/Z, Rotation X/Y/Z, Gait, Pose, MotionClip)
 * over `[startTimeSec, endTimeSec]` so any Ready-Made Motion plays immediately on the timeline.
 */
export function compileReadyMadeMotionKeyframes(
  actor: Partial<Actor>,
  clipId: string,
  options: CompileReadyMadeMotionOptions
): {
  clip: ReadyMadeMotionClip;
  keyframes: TrajectoryKeyframe[];
  endPosition: Point2D;
  endRotation: Point3D;
} {
  const clip = findReadyMadeMotionById(clipId) || READY_MADE_MOTIONS[0];
  const winStart = Math.max(0, options.startTimeSec);
  const winEnd = Math.max(winStart + 0.4, options.endTimeSec);
  const dur = winEnd - winStart;
  const safeCycles = Math.max(1, Math.min(20, Math.round(options.motionCycles ?? actor.motionCycles ?? 1)));

  const startX = options.startPosition.x ?? 50;
  const startY = options.startPosition.y ?? 50;
  const startZ = options.startPosition.z ?? (clip.category === 'aerial' ? 18 : 0);

  const baseRot: Point3D = options.startRotation
    ? { ...options.startRotation }
    : actor.rotation
    ? { ...actor.rotation }
    : { x: 0, y: 0, z: 0 };

  const shouldTravel =
    options.travelMode === 'travel'
      ? true
      : options.travelMode === 'in-place'
      ? false
      : clip.travelsByDefault;

  // Compute natural stage travel vector (0..100 stage grid)
  let destX = startX;
  let destY = startY;

  if (options.targetPosition) {
    destX = THREE.MathUtils.clamp(options.targetPosition.x, 8, 92);
    destY = THREE.MathUtils.clamp(options.targetPosition.y, 8, 92);
  } else if (shouldTravel) {
    // Travel distance scaled by clip speed and window duration
    const speedFactor =
      clip.id.includes('run') || clip.id.includes('gallop') || clip.id.includes('accel') || clip.id.includes('swoop')
        ? 11.5
        : clip.id.includes('jump') || clip.id.includes('pounce')
        ? 9.0
        : clip.id.includes('dodge') || clip.id.includes('hit') || clip.id.includes('back')
        ? 5.5
        : 7.5;
    const travelDist = Math.min(38, Math.max(8, dur * speedFactor));

    if (clip.id === 'human-dodge-weave') {
      const sideSign = startX > 55 ? -1 : 1;
      destX = THREE.MathUtils.clamp(startX + sideSign * 12, 10, 90);
      destY = THREE.MathUtils.clamp(startY - 4, 10, 90);
    } else if (clip.id === 'human-hit-stagger' || clip.id === 'human-back-retreat') {
      destX = startX;
      destY = THREE.MathUtils.clamp(startY - travelDist, 10, 90);
    } else if (clip.id === 'veh-drift-turn') {
      const turnSign = startX > 50 ? -1 : 1;
      destX = THREE.MathUtils.clamp(startX + turnSign * (travelDist * 0.7), 10, 90);
      destY = THREE.MathUtils.clamp(startY + travelDist * 0.85, 10, 90);
    } else {
      // If actor has an explicit yaw rotation, travel along their facing heading; otherwise move downstage/across
      const hasYaw = Math.abs(baseRot.y) > 1;
      if (hasYaw) {
        const rad = THREE.MathUtils.degToRad(baseRot.y);
        destX = THREE.MathUtils.clamp(startX + Math.sin(rad) * travelDist, 8, 92);
        destY = THREE.MathUtils.clamp(startY + Math.cos(rad) * travelDist, 8, 92);
      } else if (startY <= 70) {
        destY = THREE.MathUtils.clamp(startY + travelDist, 10, 90);
      } else {
        destY = THREE.MathUtils.clamp(startY - travelDist, 10, 90);
      }
    }
  }

  // Automatically align heading with travel direction when moving across the stage floor
  if (
    shouldTravel &&
    !options.startRotation &&
    !actor.rotation &&
    clip.id !== 'human-back-retreat' &&
    clip.id !== 'human-hit-stagger'
  ) {
    const travelDx = destX - startX;
    const travelDy = destY - startY;
    if (Math.hypot(travelDx, travelDy) > 1.0) {
      baseRot.y = Number((Math.atan2(travelDx, travelDy) * (180 / Math.PI)).toFixed(1));
    }
  }

  const numSamples = 12;
  const keyframes: TrajectoryKeyframe[] = [];
  let finalPos: Point2D = { x: destX, y: destY, z: startZ };
  let finalRot: Point3D = { ...baseRot };

  for (let i = 0; i <= numSamples; i++) {
    const u = i / numSamples; // 0..1 normalized progress through the cue
    const t = Number((winStart + u * dur).toFixed(2));

    // Smooth ease-in-out or specialized progress curve
    const smoothU = u * u * (3 - 2 * u);
    let curX = startX + (destX - startX) * smoothU;
    let curY = startY + (destY - startY) * smoothU;
    let curZ = startZ;

    let rotX = baseRot.x;
    let rotY = baseRot.y;
    let rotZ = baseRot.z;

    // Special elevation (Z) & orientation curves by clip ID
    switch (clip.id) {
      case 'human-jump-leap': {
        // Crouch [0..0.22], Airborne parabola [0.22..0.78], Landing [0.78..1.0]
        if (u > 0.2 && u < 0.82) {
          const airU = (u - 0.2) / 0.62;
          curZ = startZ + Math.sin(airU * Math.PI) * 14;
          curX = startX + (destX - startX) * airU;
          curY = startY + (destY - startY) * airU;
        } else if (u <= 0.2) {
          curX = startX;
          curY = startY;
        } else {
          curX = destX;
          curY = destY;
        }
        break;
      }

      case 'quad-pounce-leap': {
        if (u > 0.22 && u < 0.85) {
          const airU = (u - 0.22) / 0.63;
          curZ = startZ + Math.sin(airU * Math.PI) * 16;
          // Pitch up on launch (-24 deg), pitch down on landing (+22 deg)
          rotX = Math.cos(airU * Math.PI) * -24;
          curX = startX + (destX - startX) * airU;
          curY = startY + (destY - startY) * airU;
        } else if (u <= 0.22) {
          rotX = 10; // coil crouch
          curX = startX;
          curY = startY;
        } else {
          rotX = 0;
          curX = destX;
          curY = destY;
        }
        break;
      }

      case 'quad-gallop-charge': {
        const boundPhase = Math.sin(u * Math.PI * 6);
        curZ = startZ + Math.max(0, boundPhase) * 3.5;
        rotX = boundPhase * -9;
        break;
      }

      case 'veh-accel-launch': {
        const accelU = Math.pow(u, 1.7);
        curX = startX + (destX - startX) * accelU;
        curY = startY + (destY - startY) * accelU;
        // Rear squat nose-up (-9 deg) during peak acceleration
        rotX = Math.sin(u * Math.PI) * -9;
        break;
      }

      case 'veh-hard-brake': {
        const decelU = 1 - Math.pow(1 - u, 2.2);
        curX = startX + (destX - startX) * decelU;
        curY = startY + (destY - startY) * decelU;
        // Nose dive pitch (+13 deg) between u=0.35 and u=0.85, then settle
        if (u > 0.25 && u < 0.9) {
          rotX = Math.sin(((u - 0.25) / 0.65) * Math.PI) * 13;
        }
        break;
      }

      case 'veh-drift-turn': {
        const turnSign = destX >= startX ? 1 : -1;
        curX = startX + (destX - startX) * Math.pow(u, 1.3);
        curY = startY + (destY - startY) * u;
        rotY = baseRot.y + turnSign * smoothU * 55;
        rotZ = -turnSign * Math.sin(u * Math.PI) * 11;
        break;
      }

      case 'air-hover-bob': {
        const baseAirZ = Math.max(15, startZ);
        curZ = baseAirZ + Math.sin(u * Math.PI * 2) * 3.5;
        rotZ = Math.sin(u * Math.PI * 2) * 5;
        rotX = Math.cos(u * Math.PI * 2) * 3;
        break;
      }

      case 'air-swoop-flyby': {
        const baseAirZ = Math.max(18, startZ);
        curZ = baseAirZ - Math.sin(u * Math.PI) * 6;
        rotZ = Math.sin(u * Math.PI) * -32;
        rotX = 8;
        break;
      }

      case 'air-takeoff-climb': {
        const climbU = Math.pow(u, 1.5);
        curZ = startZ + climbU * 26;
        rotX = -Math.sin(u * Math.PI) * 22;
        break;
      }

      case 'air-dive-attack': {
        const highZ = Math.max(28, startZ);
        curZ = highZ - smoothU * 20;
        rotX = u < 0.7 ? 28 * Math.sin((u / 0.7) * Math.PI) : 0;
        break;
      }

      case 'prop-slash-swing': {
        const slashWave = Math.sin(u * Math.PI * 2);
        rotX = baseRot.x + slashWave * 55;
        rotY = baseRot.y + slashWave * 75;
        rotZ = baseRot.z + Math.cos(u * Math.PI * 2) * 35;
        break;
      }

      case 'prop-float-spin': {
        const floatZ = Math.max(10, startZ);
        curZ = floatZ + Math.sin(u * Math.PI * 2) * 3;
        rotY = baseRot.y + u * 360;
        rotZ = 15 * Math.sin(u * Math.PI * 2);
        break;
      }

      case 'prop-recoil-kick': {
        const kick = Math.abs(Math.sin(u * Math.PI * 3));
        rotX = baseRot.x - kick * 28;
        curZ = startZ + kick * 2;
        break;
      }

      case 'prop-drop-bounce': {
        const dropStartZ = Math.max(20, startZ || 22);
        if (u < 0.45) {
          const fallU = u / 0.45;
          curZ = dropStartZ * (1 - fallU * fallU);
          rotX = baseRot.x + u * 140;
        } else if (u < 0.75) {
          const b1 = (u - 0.45) / 0.3;
          curZ = Math.sin(b1 * Math.PI) * 6.5;
          rotX = baseRot.x + 85;
        } else {
          const b2 = (u - 0.75) / 0.25;
          curZ = Math.sin(b2 * Math.PI) * 2.0;
          rotX = baseRot.x + 90;
        }
        break;
      }

      case 'env-swing-open': {
        rotY = baseRot.y + smoothU * 90;
        break;
      }

      case 'env-quake-shake': {
        const decay = 1 - u * 0.5;
        rotZ = Math.sin(u * Math.PI * 10) * 9 * decay;
        rotX = Math.cos(u * Math.PI * 8) * 6 * decay;
        break;
      }

      case 'env-fall-topple': {
        const toppleU = Math.min(1, Math.pow(u / 0.75, 2));
        rotZ = baseRot.z + toppleU * 90;
        if (u > 0.75) {
          const bounceU = (u - 0.75) / 0.25;
          rotZ = baseRot.z + 90 - Math.sin(bounceU * Math.PI) * 8;
        }
        break;
      }

      case 'env-turntable-spin': {
        rotY = baseRot.y + u * 360;
        break;
      }

      default:
        break;
    }

    const posPt: Point2D = {
      x: Number(THREE.MathUtils.clamp(curX, 2, 98).toFixed(2)),
      y: Number(THREE.MathUtils.clamp(curY, 2, 98).toFixed(2)),
      z: Number(THREE.MathUtils.clamp(curZ, 0, 95).toFixed(2)),
    };
    const rotPt: Point3D = {
      x: Number(rotX.toFixed(1)),
      y: Number(rotY.toFixed(1)),
      z: Number(rotZ.toFixed(1)),
    };

    finalPos = posPt;
    finalRot = rotPt;

    keyframes.push({
      id: `kf_${clip.id}_${i}_${Date.now()}`,
      time: t,
      position: posPt,
      rotation: rotPt,
      gait: clip.baseGait || 'none',
      posePreset: i === numSamples ? clip.basePosePreset : undefined,
      motionClip: clip.id,
      motionCycles: safeCycles,
      cueLabel: i === 0 ? `${clip.icon} ${clip.name}${safeCycles > 1 ? ` (${safeCycles}x)` : ''}` : undefined,
    });
  }

  return {
    clip,
    keyframes,
    endPosition: finalPos,
    endRotation: finalRot,
  };
}

/**
 * Evaluates a Ready-Made Humanoid Motion Clip at timestamp `timeSeconds` directly on the 19-bone HumanoidRig.
 * Uses character-local normalized coordinates (`rigPoint`) so all limb lengths and scales work identically.
 */
export function evaluateReadyMadeHumanoidClip(
  rig: HumanoidRig,
  clipId: string,
  timeSeconds: number,
  clipProgress01?: number,
  isTravelingOnFloor?: boolean,
  motionCycles?: number
): boolean {
  const h = rig.height;
  const root = rig.root;
  if (root.parent) {
    root.parent.updateMatrixWorld(true);
  }
  root.updateMatrixWorld(true);

  const rootScale = root.scale.y || 1.0;
  const invRootScale = 1.0 / rootScale;

  // Helper to convert character-proportion offsets (in multiples of height `h`) into world space
  const rigPoint = (rx: number, ry: number, rz: number): THREE.Vector3 => {
    const localPt = new THREE.Vector3(
      rx * h * invRootScale,
      ry * h * invRootScale,
      rz * h * invRootScale
    );
    return localPt.applyMatrix4(root.matrixWorld);
  };

  // Reset bones to bind rest pose before solving frame kinematics
  const resetToRest = () => {
    for (const [boneName, bone] of rig.bones) {
      const restPos = rig.restPositions.get(boneName);
      const restRot = rig.restRotations.get(boneName);
      if (restPos) bone.position.copy(restPos);
      if (restRot) bone.quaternion.copy(restRot);
    }
  };

  const setHipsOffsetAndTilt = (
    offsetXRatio: number,
    offsetYRatio: number,
    offsetZRatio: number,
    pitchRad: number,
    yawRad: number,
    rollRad: number
  ) => {
    const hips = rig.bones.get('Hips');
    if (!hips) return;
    const restHips = rig.restPositions.get('Hips');
    const rx = restHips ? restHips.x : 0;
    const ry = restHips ? restHips.y : 0.53 * h * invRootScale;
    const rz = restHips ? restHips.z : 0;
    hips.position.set(
      rx + offsetXRatio * h * invRootScale,
      ry + offsetYRatio * h * invRootScale,
      rz + offsetZRatio * h * invRootScale
    );
    const restRot = rig.restRotations.get('Hips');
    const qTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchRad, yawRad, rollRad, 'YXZ'));
    if (restRot) {
      hips.quaternion.copy(restRot).multiply(qTilt);
    } else {
      hips.quaternion.copy(qTilt);
    }
  };

  const setChestTilt = (pitchRad: number, yawRad: number, rollRad: number) => {
    const spine = rig.bones.get('Spine');
    const chest = rig.bones.get('Chest');
    if (spine) {
      const rest = rig.restRotations.get('Spine');
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(pitchRad * 0.45, yawRad * 0.45, rollRad * 0.45, 'YXZ')
      );
      if (rest) spine.quaternion.copy(rest).multiply(q);
      else spine.quaternion.copy(q);
    }
    if (chest) {
      const rest = rig.restRotations.get('Chest');
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(pitchRad * 0.55, yawRad * 0.55, rollRad * 0.55, 'YXZ')
      );
      if (rest) chest.quaternion.copy(rest).multiply(q);
      else chest.quaternion.copy(q);
    }
    root.updateMatrixWorld(true);
  };

  const applyWalkingLegsIfTraveling = (): boolean => {
    if (!isTravelingOnFloor) return false;
    const phase = timeSeconds * Math.PI * 2 * 1.45;
    const strideLen = 0.16;
    const liftHeight = 0.08;
    const lSin = Math.sin(phase);
    const lCos = Math.cos(phase);
    const rSin = Math.sin(phase + Math.PI);
    const rCos = Math.cos(phase + Math.PI);

    const lY = 0.04 + Math.max(0, lCos) * liftHeight;
    const lZ = lSin * strideLen;
    const rY = 0.04 + Math.max(0, rCos) * liftHeight;
    const rZ = rSin * strideLen;

    solveLimbIK(rig, 'leftLeg', rigPoint(0.11, lY, lZ), rigPoint(0.13, 0.34, 0.55));
    solveLimbIK(rig, 'rightLeg', rigPoint(-0.11, rY, rZ), rigPoint(-0.13, 0.34, 0.55));
    return true;
  };

  // Continuous locomotion clips delegate to evaluateGait with tailored frequency/speed
  if (clipId === 'human-walk-forward' || clipId === 'human-back-retreat') {
    evaluateGait(rig, timeSeconds, { gait: 'walk', speed: 1.5 });
    return true;
  }
  if (clipId === 'human-run-sprint') {
    evaluateGait(rig, timeSeconds, { gait: 'run', speed: 2.8, frequencyScale: 1.1 });
    return true;
  }
  if (clipId === 'human-sneak-prowl') {
    evaluateGait(rig, timeSeconds, { gait: 'sneak', speed: 1.0 });
    return true;
  }
  if (clipId === 'human-idle-breathe') {
    evaluateGait(rig, timeSeconds, { gait: 'idle', speed: 0 });
    return true;
  }

  // Phase in [0..1] per cycle across `motionCycles` repetitions within the active window
  const safeCycles = Math.max(1, Math.min(20, Math.round(motionCycles || 1)));
  const rawProgress =
    clipProgress01 !== undefined
      ? THREE.MathUtils.clamp(clipProgress01, 0, 1)
      : (timeSeconds * 0.5) % 1.0;
  const scaledProgress = rawProgress * safeCycles;
  const u = scaledProgress >= safeCycles ? 1.0 : scaledProgress % 1.0;
  const cycleEnvelope = Math.sin(u * Math.PI);

  switch (clipId) {
    case 'human-jump-leap': {
      resetToRest();
      // Phase 1 [0..0.22]: Crouch & swing arms back
      // Phase 2 [0.22..0.76]: Airborne tuck & reach arms high
      // Phase 3 [0.76..1.0]: Landing cushion & recover
      let crouchY = 0;
      let pitch = 0.08;
      let armY = 0.52;
      let armZ = 0.12;
      let footL_Y = 0.04;
      let footR_Y = 0.04;
      let footL_Z = 0.04;
      let footR_Z = -0.04;

      if (u < 0.22) {
        const p = Math.sin((u / 0.22) * Math.PI);
        crouchY = -0.16 * p;
        pitch = 0.24 * p;
        armY = 0.42 - 0.06 * p;
        armZ = -0.22 * p;
      } else if (u < 0.78) {
        const airU = (u - 0.22) / 0.56;
        const arc = Math.sin(airU * Math.PI);
        crouchY = 0.04 * arc;
        pitch = -0.10 * arc;
        armY = 0.52 + 0.38 * arc;
        armZ = 0.24 * arc;
        footL_Y = 0.04 + 0.18 * arc;
        footR_Y = 0.04 + 0.14 * arc;
        footL_Z = 0.16 * arc;
        footR_Z = -0.18 * arc;
      } else {
        const landU = (u - 0.78) / 0.22;
        const absorb = Math.sin(landU * Math.PI);
        crouchY = -0.14 * absorb;
        pitch = 0.18 * absorb;
        armY = 0.56;
        armZ = 0.20 * absorb;
      }

      setHipsOffsetAndTilt(0, crouchY, 0, pitch * 0.4, 0, 0);
      setChestTilt(pitch * 0.6, 0, 0);

      const poleKneeL = rigPoint(0.12, 0.35, 0.55);
      const poleKneeR = rigPoint(-0.12, 0.35, 0.55);
      solveLimbIK(rig, 'leftLeg', rigPoint(0.11, footL_Y, footL_Z), poleKneeL);
      solveLimbIK(rig, 'rightLeg', rigPoint(-0.11, footR_Y, footR_Z), poleKneeR);

      const poleElbowL = rigPoint(0.32, 0.62, -0.35);
      const poleElbowR = rigPoint(-0.32, 0.62, -0.35);
      solveLimbIK(rig, 'leftArm', rigPoint(0.24, armY, armZ), poleElbowL);
      solveLimbIK(rig, 'rightArm', rigPoint(-0.24, armY, armZ), poleElbowR);
      solveLookAt(rig, rigPoint(0, 0.96, 0.85));
      return true;
    }

    case 'human-combo-punch': {
      resetToRest();
      // 2-beat martial arts combo per cycle: Beat 1 = Left Jab [0..0.45], Beat 2 = Right Cross [0.45..0.90], Guard settle [0.90..1.0]
      const cycle = u;
      const jabExt = cycle < 0.45 ? Math.sin((cycle / 0.45) * Math.PI) : 0;
      const crossExt = cycle >= 0.45 && cycle < 0.90 ? Math.sin(((cycle - 0.45) / 0.45) * Math.PI) : 0;

      const torsoYaw = -0.32 * jabExt + 0.44 * crossExt;
      const torsoPitch = 0.10 + 0.08 * (jabExt + crossExt);

      setHipsOffsetAndTilt(0, -0.06, 0.04 * (jabExt + crossExt), 0.06, torsoYaw * 0.45, 0);
      setChestTilt(torsoPitch, torsoYaw * 0.65, 0);

      if (!applyWalkingLegsIfTraveling()) {
        const poleKneeL = rigPoint(0.14, 0.32, 0.55);
        const poleKneeR = rigPoint(-0.14, 0.32, 0.55);
        solveLimbIK(rig, 'leftLeg', rigPoint(0.14, 0.04, 0.14), poleKneeL);
        solveLimbIK(rig, 'rightLeg', rigPoint(-0.14, 0.04, -0.14), poleKneeR);
      }

      // Left hand: guards chin or extends straight forward on Jab
      const lHandPos = rigPoint(
        0.16 - 0.12 * jabExt,
        0.78 + 0.03 * jabExt,
        0.22 + 0.34 * jabExt
      );
      // Right hand: guards chin or explodes forward on Cross
      const rHandPos = rigPoint(
        -0.15 + 0.13 * crossExt,
        0.76 + 0.05 * crossExt,
        0.18 + 0.40 * crossExt
      );

      solveLimbIK(rig, 'leftArm', lHandPos, rigPoint(0.32, 0.62, -0.30));
      solveLimbIK(rig, 'rightArm', rHandPos, rigPoint(-0.32, 0.62, -0.30));
      solveLookAt(rig, rigPoint(0, 0.88, 1.0));
      return true;
    }

    case 'human-sword-slash': {
      resetToRest();
      // Wind-up [0..0.35], Cleave slash [0.35..0.75], Follow-through recovery [0.75..1.0] per cycle
      const cycle = u;
      let rx = -0.22;
      let ry = 0.78;
      let rz = 0.25;
      let torsoYaw = 0;
      let torsoPitch = 0.08;

      if (cycle < 0.35) {
        const w = Math.sin((cycle / 0.35) * (Math.PI / 2));
        rx = -0.22 - 0.08 * w;
        ry = 0.78 + 0.24 * w;
        rz = 0.25 - 0.18 * w;
        torsoYaw = -0.35 * w;
        torsoPitch = -0.08 * w;
      } else if (cycle < 0.75) {
        const s = (cycle - 0.35) / 0.40;
        const easeS = s * s * (3 - 2 * s);
        rx = -0.30 + 0.54 * easeS;
        ry = 1.02 - 0.48 * easeS;
        rz = 0.07 + 0.42 * easeS;
        torsoYaw = -0.35 + 0.75 * easeS;
        torsoPitch = -0.08 + 0.28 * easeS;
      } else {
        const r = (cycle - 0.75) / 0.25;
        rx = 0.24 - 0.46 * r;
        ry = 0.54 + 0.24 * r;
        rz = 0.49 - 0.24 * r;
        torsoYaw = 0.40 * (1 - r);
        torsoPitch = 0.20 * (1 - r);
      }

      setHipsOffsetAndTilt(0, -0.07, 0, 0.05, torsoYaw * 0.4, 0);
      setChestTilt(torsoPitch, torsoYaw * 0.7, 0);

      if (!applyWalkingLegsIfTraveling()) {
        solveLimbIK(rig, 'leftLeg', rigPoint(0.14, 0.04, 0.15), rigPoint(0.16, 0.32, 0.55));
        solveLimbIK(rig, 'rightLeg', rigPoint(-0.14, 0.04, -0.14), rigPoint(-0.16, 0.32, 0.55));
      }

      solveLimbIK(rig, 'rightArm', rigPoint(rx, ry, rz), rigPoint(-0.35, 0.68, -0.25));
      solveLimbIK(rig, 'leftArm', rigPoint(0.22, 0.66, 0.18), rigPoint(0.32, 0.58, -0.25));
      solveLookAt(rig, rigPoint(0, 0.88, 1.0));
      return true;
    }

    case 'human-aim-fire': {
      resetToRest();
      // 1 crisp recoil shot per cycle [0.20..0.60], stabilizing aim before and after
      const shotPhase = u;
      const recoil = shotPhase >= 0.20 && shotPhase < 0.60 ? Math.sin(((shotPhase - 0.20) / 0.40) * Math.PI) : 0;

      setHipsOffsetAndTilt(0, -0.03, 0, -0.04 * recoil, 0.12, 0);
      setChestTilt(-0.12 * recoil, -0.10, 0);

      if (!applyWalkingLegsIfTraveling()) {
        solveLimbIK(rig, 'leftLeg', rigPoint(0.12, 0.04, 0.08), rigPoint(0.14, 0.32, 0.55));
        solveLimbIK(rig, 'rightLeg', rigPoint(-0.12, 0.04, -0.10), rigPoint(-0.14, 0.32, 0.55));
      }

      const aimY = 0.81 + 0.08 * recoil;
      const aimZ = 0.46 - 0.07 * recoil;
      solveLimbIK(rig, 'rightArm', rigPoint(-0.04, aimY, aimZ), rigPoint(-0.28, 0.68, -0.15));
      solveLimbIK(rig, 'leftArm', rigPoint(0.03, aimY - 0.02, aimZ - 0.04), rigPoint(0.26, 0.64, -0.15));
      solveLookAt(rig, rigPoint(0, 0.90 + 0.04 * recoil, 1.0));
      return true;
    }

    case 'human-dodge-weave': {
      resetToRest();
      const weave = Math.sin(u * Math.PI);
      const swayX = Math.sin(u * Math.PI * 2) * 0.14;

      setHipsOffsetAndTilt(swayX, -0.18 * weave, 0, 0.18 * weave, -swayX * 1.2, swayX * 0.5);
      setChestTilt(0.24 * weave, -swayX * 1.5, -swayX * 0.8);

      solveLimbIK(rig, 'leftLeg', rigPoint(0.15, 0.04, 0.06), rigPoint(0.18, 0.30, 0.55));
      solveLimbIK(rig, 'rightLeg', rigPoint(-0.15, 0.04, -0.06), rigPoint(-0.18, 0.30, 0.55));

      solveLimbIK(rig, 'leftArm', rigPoint(0.18 + swayX * 0.5, 0.76 - 0.08 * weave, 0.24), rigPoint(0.32, 0.60, -0.25));
      solveLimbIK(rig, 'rightArm', rigPoint(-0.18 + swayX * 0.5, 0.76 - 0.08 * weave, 0.24), rigPoint(-0.32, 0.60, -0.25));
      solveLookAt(rig, rigPoint(0, 0.85, 0.95));
      return true;
    }

    case 'human-hit-stagger': {
      resetToRest();
      const impact = Math.sin(u * Math.PI);
      setHipsOffsetAndTilt(0, -0.08 * impact, -0.08 * impact, -0.18 * impact, 0, 0);
      setChestTilt(-0.32 * impact, 0.12 * impact, 0.08 * impact);

      solveLimbIK(rig, 'leftLeg', rigPoint(0.13, 0.04, 0.08 * impact), rigPoint(0.15, 0.32, 0.55));
      solveLimbIK(rig, 'rightLeg', rigPoint(-0.13, 0.04, -0.12 * impact), rigPoint(-0.15, 0.32, 0.55));

      solveLimbIK(rig, 'leftArm', rigPoint(0.32, 0.68 + 0.10 * impact, 0.12), rigPoint(0.36, 0.55, -0.25));
      solveLimbIK(rig, 'rightArm', rigPoint(-0.32, 0.68 + 0.10 * impact, 0.12), rigPoint(-0.36, 0.55, -0.25));
      solveLookAt(rig, rigPoint(0, 0.98 + 0.2 * impact, 0.7));
      return true;
    }

    case 'human-wave-greet': {
      resetToRest();
      // Smoothly raises right hand (cycleEnvelope), waves gently twice per cycle, and lowers arm back to natural rest
      const lift = Math.sin(Math.min(1, u < 0.5 ? u * 2.2 : (1 - u) * 2.2) * (Math.PI / 2));
      const waveOsc = Math.sin(u * Math.PI * 3) * lift;
      const breathe = Math.sin(timeSeconds * 2.2) * 0.008;

      setHipsOffsetAndTilt(0.01 * waveOsc, breathe, 0, 0, -0.04 * lift, 0.02 * lift);
      setChestTilt(0.02 * lift, -0.06 * lift, -0.04 * lift);

      if (!applyWalkingLegsIfTraveling()) {
        solveLimbIK(rig, 'leftLeg', rigPoint(0.10, 0.04, 0), rigPoint(0.12, 0.32, 0.55));
        solveLimbIK(rig, 'rightLeg', rigPoint(-0.10, 0.04, 0), rigPoint(-0.12, 0.32, 0.55));
      }

      // Left arm relaxed at side, Right arm smoothly lifts to wave and settles back down
      solveLimbIK(rig, 'leftArm', rigPoint(0.21, 0.48, 0.05), rigPoint(0.26, 0.62, -0.28));
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(
          -0.22 - 0.06 * lift + waveOsc * 0.08,
          0.50 + 0.44 * lift + Math.abs(waveOsc) * 0.025,
          0.08 + 0.14 * lift
        ),
        rigPoint(-0.34, 0.64 + 0.06 * lift, -0.18)
      );
      solveLookAt(rig, rigPoint(-0.04 * lift, 0.90, 0.95));
      return true;
    }

    case 'human-look-search': {
      resetToRest();
      const scan = Math.sin(u * Math.PI * 2) * cycleEnvelope;
      setHipsOffsetAndTilt(0, -0.02 * cycleEnvelope, 0, 0.03 * cycleEnvelope, scan * 0.15, 0);
      setChestTilt(0.04 * cycleEnvelope, scan * 0.32, 0);

      if (!applyWalkingLegsIfTraveling()) {
        solveLimbIK(rig, 'leftLeg', rigPoint(0.11, 0.04, 0.03), rigPoint(0.12, 0.32, 0.55));
        solveLimbIK(rig, 'rightLeg', rigPoint(-0.11, 0.04, -0.03), rigPoint(-0.12, 0.32, 0.55));
      }

      solveLimbIK(rig, 'leftArm', rigPoint(0.22, 0.52 + 0.04 * cycleEnvelope, 0.10 + 0.04 * cycleEnvelope), rigPoint(0.28, 0.62, -0.25));
      solveLimbIK(rig, 'rightArm', rigPoint(-0.22, 0.52 + 0.04 * cycleEnvelope, 0.10 + 0.04 * cycleEnvelope), rigPoint(-0.28, 0.62, -0.25));
      solveLookAt(rig, rigPoint(-scan * 0.75, 0.88, 0.75));
      return true;
    }

    case 'human-sit-down': {
      // Smoothly transition from standing to seated-chair
      if (u > 0.85) {
        applyPosePreset(rig, 'seated-chair');
        return true;
      }
      resetToRest();
      const sitEase = u * u * (3 - 2 * u);
      setHipsOffsetAndTilt(0, -0.20 * sitEase, -0.06 * sitEase, 0.08 * (1 - sitEase), 0, 0);
      setChestTilt(0.14 * Math.sin(u * Math.PI), 0, 0);

      solveLimbIK(rig, 'leftLeg', rigPoint(0.12, 0.04, 0.22 * sitEase), rigPoint(0.12, 0.35, 0.58));
      solveLimbIK(rig, 'rightLeg', rigPoint(-0.12, 0.04, 0.22 * sitEase), rigPoint(-0.12, 0.35, 0.58));

      solveLimbIK(rig, 'leftArm', rigPoint(0.16, 0.48, 0.22 * sitEase), rigPoint(0.26, 0.55, -0.20));
      solveLimbIK(rig, 'rightArm', rigPoint(-0.16, 0.48, 0.22 * sitEase), rigPoint(-0.26, 0.55, -0.20));
      solveLookAt(rig, rigPoint(0, 0.72, 0.90));
      return true;
    }

    case 'human-victory-cheer': {
      resetToRest();
      const lift = Math.sin(Math.min(1, u < 0.5 ? u * 2.2 : (1 - u) * 2.2) * (Math.PI / 2));
      const pump = Math.sin(u * Math.PI * 3) * lift;
      const bounce = Math.abs(pump) * 0.04;

      setHipsOffsetAndTilt(0, bounce, 0, -0.04 * lift, 0, 0);
      setChestTilt(-0.08 * lift, 0, 0);

      if (!applyWalkingLegsIfTraveling()) {
        solveLimbIK(rig, 'leftLeg', rigPoint(0.12, 0.04, 0), rigPoint(0.14, 0.32, 0.55));
        solveLimbIK(rig, 'rightLeg', rigPoint(-0.12, 0.04, 0), rigPoint(-0.14, 0.32, 0.55));
      }

      solveLimbIK(
        rig,
        'leftArm',
        rigPoint(0.22 + 0.04 * lift, 0.50 + 0.48 * lift + pump * 0.06, 0.08 + 0.06 * lift),
        rigPoint(0.34, 0.65 + 0.07 * lift, -0.15)
      );
      solveLimbIK(
        rig,
        'rightArm',
        rigPoint(-0.22 - 0.04 * lift, 0.50 + 0.48 * lift - pump * 0.06, 0.08 + 0.06 * lift),
        rigPoint(-0.34, 0.65 + 0.07 * lift, -0.15)
      );
      solveLookAt(rig, rigPoint(0, 0.90 + 0.15 * lift, 0.85));
      return true;
    }

    default:
      return false;
  }
}

/**
 * Evaluates 60fps procedural sub-part articulation for Non-Human 3D Objects
 * (Quadruped legs/tail/head, Vehicle wheels/suspension, Aerial rotors/wings).
 */
export function evaluateReadyMadeObjectClip(
  mesh: THREE.Object3D,
  clipId: string,
  timeSeconds: number
): void {
  const isQuadMove =
    clipId === 'quad-trot-forward' ||
    clipId === 'quad-gallop-charge' ||
    clipId === 'quad-pounce-leap' ||
    clipId === 'quad-stalk-prowl';
  const isQuadGallop = clipId === 'quad-gallop-charge';
  const isVehMove =
    clipId === 'veh-drive-cruise' ||
    clipId === 'veh-accel-launch' ||
    clipId === 'veh-hard-brake' ||
    clipId === 'veh-drift-turn';

  const freq = isQuadGallop ? 11.0 : clipId === 'quad-stalk-prowl' ? 4.0 : 7.5;
  const phase = timeSeconds * freq;

  mesh.traverse((child) => {
    if (child === mesh) return;
    const label = `${child.name || ''} ${child.userData?.partName || ''} ${child.userData?.role || ''}`.toLowerCase();
    if (!label.trim()) return;

    if (child.userData.__baseRotX === undefined) {
      child.userData.__baseRotX = child.rotation.x;
      child.userData.__baseRotY = child.rotation.y;
      child.userData.__baseRotZ = child.rotation.z;
    }
    const bx = child.userData.__baseRotX;
    const by = child.userData.__baseRotY;
    const bz = child.userData.__baseRotZ;

    // 1. Quadruped Legs, Head & Tail stride articulation
    if (isQuadMove && /(leg|thigh|calf|shin|paw|hoof|limb)/.test(label)) {
      const isLeft = /(left|_l\b|\bl_)/.test(label) || child.position.x > 0;
      const isFront = /(front|fore|arm|shoulder)/.test(label) || child.position.z > 0;
      const offset = isQuadGallop
        ? (isFront ? 0 : Math.PI) + (isLeft ? 0 : 0.45)
        : (isFront === isLeft ? 0 : Math.PI);
      const amp = isQuadGallop ? 0.62 : 0.42;
      child.rotation.set(bx + Math.sin(phase + offset) * amp, by, bz);
    } else if (clipId.startsWith('quad-') && /(tail)/.test(label)) {
      child.rotation.set(bx + 0.25, by + Math.sin(timeSeconds * 5.0) * 0.28, bz);
    } else if (clipId.startsWith('quad-') && /(head|neck)/.test(label)) {
      const bob = isQuadMove ? Math.cos(phase) * 0.12 : Math.sin(timeSeconds * 1.8) * 0.08;
      child.rotation.set(bx + bob, by + (clipId === 'quad-alert-idle' ? Math.sin(timeSeconds * 2.0) * 0.35 : 0), bz);
    }

    // 2. Vehicle Wheels & Suspension
    if (isVehMove && /(wheel|tire|rim)/.test(label)) {
      child.rotation.x = bx + timeSeconds * 14.0;
    }

    // 3. Aerial Rotors, Propellers & Bird Wings
    if (clipId.startsWith('air-') && /(rotor|propeller|blade)/.test(label)) {
      child.rotation.y = by + timeSeconds * 28.0;
    } else if (clipId.startsWith('air-') && /(wing)/.test(label)) {
      const isLeft = /(left|_l\b|\bl_)/.test(label) || child.position.x > 0;
      const flap = Math.sin(timeSeconds * 9.0) * 0.45;
      child.rotation.z = bz + (isLeft ? flap : -flap);
    }
  });
}

