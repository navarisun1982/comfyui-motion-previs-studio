import React, { useState, useEffect } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { logger } from '../stores/useLogStore';
import { ShotCreationMode, Actor, ShotSpec, createDefaultShotSpec, FocalLength, CINEMATIC_ENVIRONMENT_PRESETS } from '../types/shotspec';
import { compileReadyMadeMotionKeyframes } from '../engine/kinematics';
import { safeGetItem, safeSetItem, safeRemoveItem, STORAGE_KEYS } from '../services/storage';
import { saveProjectToStudioStorage } from '../services/studioStorageClient';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  MoreVertical,
  CheckCircle2,
  FolderOpen,
  Trash2,
  Copy,
  RotateCcw,
  Edit3,
} from 'lucide-react';

export interface ShotBibleItem {
  id: string;
  code: string;
  title: string;
  duration: string;
  focalLength: string;
  movement: string;
  thumbnail: string;
  mode: ShotCreationMode;
}

export interface SceneItem {
  id: string;
  name: string;
  shots: ShotBibleItem[];
}

function withMotion(
  actor: Actor,
  clipId: string,
  durationSec: number,
  travelMode: 'auto' | 'travel' | 'in-place' = 'auto',
  motionCycles = 1
): Actor {
  const startPos = {
    x: actor.trajectory.startPosition.x ?? 50,
    y: actor.trajectory.startPosition.y ?? 50,
    z: actor.trajectory.startPosition.z ?? 0,
  };
  const endPos = {
    x: actor.trajectory.endPosition.x ?? startPos.x,
    y: actor.trajectory.endPosition.y ?? startPos.y,
    z: actor.trajectory.endPosition.z ?? startPos.z,
  };
  const hasExplicitTravelTarget =
    travelMode === 'travel' &&
    (Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y) > 0.5 ||
      Math.abs((endPos.z ?? 0) - (startPos.z ?? 0)) > 0.5);

  const compiled = compileReadyMadeMotionKeyframes(actor, clipId, {
    startTimeSec: 0,
    endTimeSec: durationSec,
    startPosition: startPos,
    targetPosition: hasExplicitTravelTarget ? endPos : undefined,
    startRotation: actor.rotation,
    travelMode,
    motionCycles,
  });

  const allowsElevation =
    clipId === 'human-jump-leap' ||
    clipId === 'human-climb-ascend' ||
    clipId === 'quad-pounce-leap' ||
    clipId === 'quad-gallop-charge' ||
    clipId.startsWith('air-') ||
    clipId === 'prop-float-spin' ||
    clipId === 'prop-drop-bounce' ||
    startPos.z > 0 ||
    endPos.z > 0;

  // Ensure floor-bound clips stay grounded (z = 0) while preserving 3D altitude for aerial/jump clips
  const groundedKeyframes = compiled.keyframes.map((kf) => ({
    ...kf,
    position: {
      x: kf.position.x,
      y: kf.position.y,
      z: allowsElevation ? (kf.position.z ?? startPos.z) : 0,
    },
  }));

  return {
    ...actor,
    actionDescription: actor.actionDescription || compiled.clip.promptPhrase,
    motionClip: compiled.clip.id,
    motionCycles,
    gait: compiled.clip.baseGait ?? 'none',
    posePreset: compiled.clip.basePosePreset,
    rotation: compiled.endRotation,
    trajectory: {
      ...actor.trajectory,
      startPosition:
        groundedKeyframes.length > 0 ? groundedKeyframes[0].position : startPos,
      endPosition:
        groundedKeyframes.length > 0
          ? groundedKeyframes[groundedKeyframes.length - 1].position
          : { ...compiled.endPosition, z: allowsElevation ? (compiled.endPosition.z ?? endPos.z) : 0 },
      keyframes: groundedKeyframes,
    },
  };
}

function getEnvPreset(id: string) {
  const spec = CINEMATIC_ENVIRONMENT_PRESETS.find((p) => p.id === id)?.spec || CINEMATIC_ENVIRONMENT_PRESETS[0].spec;
  return { ...spec };
}

export const buildDefaultShotSpec = (shotItem: ShotBibleItem): ShotSpec => {
  const fullTitle = shotItem.code;
  const durNumber = Math.min(15, Math.max(1, parseInt(shotItem.duration, 10) || 4));
  const parsedFocal = parseInt(shotItem.focalLength, 10);
  const validFocals: FocalLength[] = ['18mm', '24mm', '35mm', '50mm', '85mm', '135mm'];
  const focalLength: FocalLength = validFocals.includes(shotItem.focalLength as any)
    ? (shotItem.focalLength as FocalLength)
    : !isNaN(parsedFocal) && validFocals.includes(`${parsedFocal}mm` as any)
    ? (`${parsedFocal}mm` as FocalLength)
    : '35mm';

  const baseSpec = createDefaultShotSpec({
    id: shotItem.id,
    name: fullTitle,
  });
  baseSpec.durationSeconds = durNumber;
  baseSpec.aspectRatio = '16:9';
  baseSpec.camera.lens.focalLength = focalLength;

  // ==========================================================================
  // SCENE 01: NEON PROTOCOL (Cyberpunk Neo-Noir Action)
  // ==========================================================================
  if (shotItem.id === 'shot-01a') {
    baseSpec.environment = {
      ...getEnvPreset('env-cyberpunk-alley'),
      name: 'Rain-Slicked Neo-Tokyo Rooftop Helipad',
      nameAr: 'مهبط طائرات على سطح ناطحة سحاب ممطرة في طوكيو الجديدة',
      promptDescription:
        'rain-slicked cyberpunk skyscraper rooftop helipad at neon night with wet reflective asphalt, glowing cyan perimeter beacons, steam vents, and towering Neo-Tokyo hologram skyline in the rain',
      weather: 'rain',
      groundSurface: 'asphalt-wet',
      timeOfDay: 'neon-night',
      fogDensity: 0.032,
      ambientColor: '#06b6d4',
    };
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'rapid-dynamic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 74, z: 7 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 61, z: 6 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 48 };
    baseSpec.camera.angle = 'low-angle';
    baseSpec.camera.shotType = 'medium-wide';
    baseSpec.lighting = {
      style: 'neon-cyberpunk',
      direction: 'side-key',
      contrast: 'high-contrast',
      lights: [
        { id: 'lgt-1', name: 'Drone Crimson Searchlight', position: { x: 56, y: 44, z: 54 }, color: '#f43f5e', intensity: 3.8, enabled: true },
        { id: 'lgt-2', name: 'Cyan Rooftop Helipad Key', position: { x: 34, y: 56, z: 44 }, color: '#06b6d4', intensity: 3.5, enabled: true },
        { id: 'lgt-3', name: 'Amber Skyline Backlight', position: { x: 50, y: 24, z: 64 }, color: '#f59e0b', intensity: 2.9, enabled: true },
      ],
    };

    // 1. Lead Cyber-Ronin Operative charging right across the rooftop and cleaving with his rigged glowing cyan plasma katana
    const kael = withMotion(
      {
        id: 'actor-kael',
        name: 'Agent Kael (Cyber-Ronin)',
        kind: 'human',
        rigType: 'humanoid',
        color: '#38bdf8',
        token: 'cyberpunk samurai warrior holding a glowing cyan katana sword in rain-slicked tactical exo-armor',
        actionDescription: 'charges forward from left to center across the wet rooftop and swings two powerful diagonal plasma katana slashes into the diving attack drone',
        partGraph: {
          dressRig: true,
          palette: {
            primaryClothing: '#0f172a',
            secondaryClothing: '#1e293b',
            metal: '#eab308',
            weaponAccent: '#06b6d4',
          },
        },
        rotation: { x: 0, y: 90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 38, y: 48, z: 0 }, endPosition: { x: 47, y: 48, z: 0 } },
      },
      'human-sword-slash',
      durNumber,
      'travel',
      2
    );

    // 2. Primary Syndicate Hunter-Killer Drone diving aggressively from upper-right (z: 15 -> 4.5) straight into Kael's katana clash at center stage
    const hunterDrone = withMotion(
      {
        id: 'actor-hunter-drone',
        name: 'Hunter-Killer Attack Drone',
        kind: 'aircraft',
        color: '#f43f5e',
        scale: 1.45,
        modelUrl: 'https://polyfork.dev/cdn/survey-drone-7c71f9.glb',
        token: 'armored autonomous hunter-killer combat drone with glowing crimson targeting optics and twin rotors',
        actionDescription: 'dives steeply downward from upper-right directly toward Agent Kael for a close-range strike at center stage',
        rotation: { x: 26, y: -90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 64, y: 48, z: 15 }, endPosition: { x: 51, y: 48, z: 4.5 } },
      },
      'air-dive-attack',
      durNumber,
      'travel',
      1
    );

    // 3. Syndicate Gunship Overwatch hovering in the background sky (z: 13)
    const gunshipOverwatch = withMotion(
      {
        id: 'actor-gunship-overwatch',
        name: 'Syndicate Gunship Overwatch',
        kind: 'spaceship',
        color: '#f59e0b',
        scale: 1.55,
        modelUrl: 'https://polyfork.dev/cdn/gunship-d2c5a9.glb',
        token: 'armored syndicate VTOL gunship hovering in the rain with twin thruster nacelles',
        actionDescription: 'hovers menacingly in the background sky with subtle altitude stabilization',
        rotation: { x: 8, y: 0, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 32, z: 13 }, endPosition: { x: 50, y: 32, z: 13 } },
      },
      'air-hover-bob',
      durNumber,
      'in-place',
      2
    );

    // 4. Rooftop Communications Antenna Mast framing stage left
    const rooftopAntenna: Actor = {
      id: 'env-rooftop-antenna',
      name: 'Rooftop Antenna Array',
      kind: 'monolith',
      color: '#38bdf8',
      scale: 1.45,
      modelUrl: 'https://polyfork.dev/cdn/rooftop-antenna-mast-6e4944.glb',
      token: 'cyberpunk rooftop communications antenna mast drenched in heavy rain',
      actionDescription: 'standing on the left side of the rooftop helipad',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 28, y: 34, z: 0 }, endPosition: { x: 28, y: 34, z: 0 } },
    };

    baseSpec.actors = [kael, hunterDrone, gunshipOverwatch, rooftopAntenna];
    baseSpec.sceneDescription =
      'Dynamic 35mm low-angle push-in across a rain-slicked Neo-Tokyo rooftop helipad at midnight as Cyber-Ronin Agent Kael charges from stage left with a glowing cyan plasma katana slash colliding head-on with a steeply diving Syndicate Hunter-Killer Attack Drone while a VTOL Gunship hovers in the background sky.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-01b') {
    baseSpec.environment = {
      ...getEnvPreset('env-cyberpunk-alley'),
      name: 'Neo-Tokyo Rain-Slicked Security Checkpoint Alley',
      nameAr: 'زقاق نقطة تفتيش أمنية ممطرة في طوكيو الجديدة',
      promptDescription:
        'rain-slicked cyberpunk security checkpoint alley at neon night with wet reflective asphalt, crimson turret laser beams, steam vents, and holographic signage',
      weather: 'rain',
      groundSurface: 'asphalt-wet',
      timeOfDay: 'neon-night',
      fogDensity: 0.03,
      ambientColor: '#06b6d4',
    };
    baseSpec.camera.movement.type = 'truck-right';
    baseSpec.camera.movement.speed = 'rapid-dynamic';
    baseSpec.camera.movement.startPosition = { x: 43, y: 73, z: 7 };
    baseSpec.camera.movement.endPosition = { x: 57, y: 71, z: 7 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 47 };
    baseSpec.camera.angle = 'low-angle';
    baseSpec.camera.shotType = 'medium-wide';
    baseSpec.lighting = {
      style: 'neon-cyberpunk',
      direction: 'side-key',
      contrast: 'high-contrast',
      lights: [
        { id: 'lgt-1', name: 'Plasma Muzzle Cyan Key', position: { x: 34, y: 56, z: 42 }, color: '#06b6d4', intensity: 3.6, enabled: true },
        { id: 'lgt-2', name: 'Turret Crimson Flood', position: { x: 68, y: 52, z: 46 }, color: '#f43f5e', intensity: 3.5, enabled: true },
        { id: 'lgt-3', name: 'Cruiser Headlight Backfill', position: { x: 50, y: 26, z: 58 }, color: '#f59e0b', intensity: 2.8, enabled: true },
      ],
    };

    // 1. Agent Kael on stage left aiming and firing his rigged plasma carbine (Equipment_Gun) with 3 recoil bursts
    const kael = withMotion(
      {
        id: 'actor-kael',
        name: 'Agent Kael (Tactical Marksman)',
        kind: 'human',
        rigType: 'humanoid',
        color: '#38bdf8',
        token: 'cyberpunk tactical operative aiming and firing a plasma rifle gun in rain-slicked exo-armor',
        actionDescription: 'holds a low tactical stance on stage left, aiming his plasma rifle across the alley and firing three rapid recoil bursts at the Syndicate checkpoint',
        partGraph: {
          dressRig: true,
          palette: {
            primaryClothing: '#0f172a',
            secondaryClothing: '#1e293b',
            metal: '#38bdf8',
            weaponAccent: '#06b6d4',
          },
        },
        rotation: { x: 0, y: 85, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 36, y: 50, z: 0 }, endPosition: { x: 36, y: 50, z: 0 } },
      },
      'human-aim-fire',
      durNumber,
      'in-place',
      3
    );

    // 2. Syndicate Enforcer Guard on stage right staggering backward under Kael's plasma fire
    const enforcerGuard = withMotion(
      {
        id: 'actor-syndicate-enforcer',
        name: 'Syndicate Enforcer Guard',
        kind: 'human',
        rigType: 'humanoid',
        color: '#f43f5e',
        token: 'armored syndicate security soldier wearing ballistic helmet and chest armor staggering backward from gunfire impact',
        actionDescription: 'reels and staggers backward under the impact of Kael plasma rifle fire',
        partGraph: {
          dressRig: true,
          palette: {
            primaryClothing: '#450a0a',
            secondaryClothing: '#18181b',
            metal: '#f43f5e',
            weaponAccent: '#f43f5e',
          },
        },
        rotation: { x: 0, y: -95, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 56, y: 49, z: 0 }, endPosition: { x: 63, y: 47, z: 0 } },
      },
      'human-hit-stagger',
      durNumber,
      'travel',
      2
    );

    // 3. Syndicate Patrol Cruiser speeding into the alley and slamming on the brakes with nose-dive pitch
    const patrolCruiser = withMotion(
      {
        id: 'veh-patrol-cruiser',
        name: 'Syndicate Patrol Cruiser',
        kind: 'vehicle',
        color: '#a855f7',
        scale: 1.55,
        modelUrl: 'https://polyfork.dev/cdn/patrol-cruiser-bed309.glb',
        token: 'armored cyberpunk police patrol cruiser skidding to a hard brake stop on wet neon asphalt',
        actionDescription: 'speeds down the center of the rain-slicked alley and slams on the brakes with a sharp forward nose-dive',
        rotation: { x: 0, y: -6, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 52, y: 30, z: 0 }, endPosition: { x: 50, y: 43, z: 0 } },
      },
      'veh-hard-brake',
      durNumber,
      'travel',
      1
    );

    // 4. Automated Defense Turret on the right flank returning fire with recoil
    const defenseTurret = withMotion(
      {
        id: 'prop-defense-turret',
        name: 'Automated Defense Turret',
        kind: 'weapon',
        color: '#f59e0b',
        scale: 1.25,
        modelUrl: 'https://polyfork.dev/cdn/defense-turret-12ba8d.glb',
        token: 'armored automated security defense turret emplacement firing heavy rounds',
        actionDescription: 'recoils rhythmically on the right flank while exchanging fire across the checkpoint',
        rotation: { x: 0, y: -90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 65, y: 51, z: 0 }, endPosition: { x: 65, y: 51, z: 0 } },
      },
      'prop-recoil-kick',
      durNumber,
      'in-place',
      3
    );

    baseSpec.actors = [kael, enforcerGuard, patrolCruiser, defenseTurret];
    baseSpec.sceneDescription =
      'Dynamic 35mm low-angle lateral tracking shot across a rain-slicked Neo-Tokyo security checkpoint as Agent Kael fires three rapid bursts from his rigged plasma rifle, staggering a Syndicate Enforcer Guard backward beside a recoiling Automated Defense Turret while an armored Patrol Cruiser slams on its brakes in the center lane.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-01c') {
    baseSpec.environment = {
      ...getEnvPreset('env-cyberpunk-alley'),
      name: 'Neo-Tokyo Neon Highway Intersection',
      nameAr: 'تقاطع طريق سريع مضاء بالنيون في طوكيو الجديدة',
      promptDescription:
        'wide rain-drenched cyberpunk highway intersection at midnight with glowing neon holographic billboards, wet tire reflections, and high-speed pursuit traffic',
      weather: 'rain',
      groundSurface: 'asphalt-wet',
      timeOfDay: 'neon-night',
      fogDensity: 0.028,
      ambientColor: '#a855f7',
    };
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'rapid-dynamic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 74, z: 6 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 62, z: 5 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 48 };
    baseSpec.camera.angle = 'low-angle';
    baseSpec.camera.shotType = 'wide';
    baseSpec.lighting = {
      style: 'neon-cyberpunk',
      direction: 'side-key',
      contrast: 'high-contrast',
      lights: [
        { id: 'lgt-1', name: 'Magenta Highway Billboard Key', position: { x: 66, y: 52, z: 54 }, color: '#ec4899', intensity: 3.8, enabled: true },
        { id: 'lgt-2', name: 'Cyan Streetlight Rim', position: { x: 32, y: 54, z: 48 }, color: '#06b6d4', intensity: 3.5, enabled: true },
        { id: 'lgt-3', name: 'Headlight Streak Fill', position: { x: 50, y: 28, z: 56 }, color: '#f59e0b', intensity: 3.0, enabled: true },
      ],
    };

    // 1. Agent Kael leaping in a high parabolic mid-air vault across the street right over the drifting cruiser's path
    const kael = withMotion(
      {
        id: 'actor-kael',
        name: 'Agent Kael (Cyber-Runner)',
        kind: 'human',
        rigType: 'humanoid',
        color: '#38bdf8',
        token: 'cyberpunk samurai operative holding a glowing cyan katana sword executing a high mid-air acrobatic leap across the street',
        actionDescription: 'crouches and launches into an explosive mid-air parabolic leap from stage left to stage right directly over the drifting interceptor lane',
        partGraph: {
          dressRig: true,
          palette: {
            primaryClothing: '#0f172a',
            secondaryClothing: '#1e293b',
            metal: '#eab308',
            weaponAccent: '#06b6d4',
          },
        },
        rotation: { x: 0, y: 90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 36, y: 49, z: 0 }, endPosition: { x: 58, y: 49, z: 0 } },
      },
      'human-jump-leap',
      durNumber,
      'travel',
      1
    );

    // 2. Syndicate Interceptor Cruiser executing a high-speed lateral drift turn across center stage
    const driftCruiser = withMotion(
      {
        id: 'veh-drift-cruiser',
        name: 'Syndicate Drift Cruiser',
        kind: 'vehicle',
        color: '#f43f5e',
        scale: 1.55,
        modelUrl: 'https://polyfork.dev/cdn/patrol-cruiser-bed309.glb',
        token: 'cyberpunk interceptor cruiser powersliding in a dramatic lateral tire-smoking drift across wet asphalt',
        actionDescription: 'powerslides into a sharp 55-degree lateral drift turn across the wet neon intersection with body roll',
        rotation: { x: 0, y: 12, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 42, y: 33, z: 0 }, endPosition: { x: 53, y: 47, z: 0 } },
      },
      'veh-drift-turn',
      durNumber,
      'travel',
      1
    );

    // 3. Outlaw Cyber-Motorcycle launching forward at full throttle along the right lane
    const cyberMotorcycle = withMotion(
      {
        id: 'veh-cyber-bike',
        name: 'Outlaw Cyber-Motorcycle',
        kind: 'bicycle',
        color: '#f59e0b',
        scale: 1.35,
        modelUrl: 'https://polyfork.dev/cdn/touring-motorcycle-3b1ad3.glb',
        token: 'high-speed cyberpunk motorcycle launching forward with rear-squat acceleration on wet neon street',
        actionDescription: 'accelerates explosively forward along the right flank with rear-squat nose lift',
        rotation: { x: 0, y: 0, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 65, y: 35, z: 0 }, endPosition: { x: 65, y: 53, z: 0 } },
      },
      'veh-accel-launch',
      durNumber,
      'travel',
      1
    );

    // 4. Holographic Billboard Gantry framing the background intersection
    const holoBillboard: Actor = {
      id: 'env-holo-billboard',
      name: 'Neon Holo-Billboard Gantry',
      kind: 'monolith',
      color: '#a855f7',
      scale: 1.6,
      modelUrl: 'https://polyfork.dev/cdn/holo-billboard-frame-96e583.glb',
      token: 'towering cyberpunk holographic billboard gantry glowing in the rain',
      actionDescription: 'standing in the background intersection',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 32, y: 32, z: 0 }, endPosition: { x: 32, y: 32, z: 0 } },
    };

    baseSpec.actors = [kael, driftCruiser, cyberMotorcycle, holoBillboard];
    baseSpec.sceneDescription =
      'Explosive 24mm wide low-angle push-in across a rain-slicked Neo-Tokyo intersection as Agent Kael executes a high-arcing mid-air leap over a powersliding Syndicate Drift Cruiser while an Outlaw Cyber-Motorcycle launches forward at full throttle.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-01d') {
    baseSpec.environment = getEnvPreset('env-cyberpunk-alley');
    baseSpec.camera.movement.type = 'truck-right';
    baseSpec.camera.movement.speed = 'rapid-dynamic';
    baseSpec.camera.movement.startPosition = { x: 42, y: 70, z: 8 };
    baseSpec.camera.movement.endPosition = { x: 58, y: 70, z: 8 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 50 };
    baseSpec.camera.angle = 'low-angle';
    baseSpec.camera.shotType = 'medium';
    baseSpec.lighting = {
      style: 'neon-cyberpunk',
      direction: 'rim-backlit',
      contrast: 'high-contrast',
      lights: [
        { id: 'lgt-1', name: 'Crimson Duel Rim', position: { x: 64, y: 42, z: 48 }, color: '#ec4899', intensity: 3.5, enabled: true },
        { id: 'lgt-2', name: 'Cyan Duel Key', position: { x: 36, y: 58, z: 45 }, color: '#06b6d4', intensity: 3.2, enabled: true },
      ],
    };

    const kael = withMotion(
      {
        id: 'actor-kael',
        name: 'Agent Kael',
        kind: 'human',
        color: '#3b82f6',
        token: 'cyberpunk operative throwing a martial arts punch combo',
        actionDescription: 'throws a rapid martial arts jab and cross punch combination',
        rotation: { x: 0, y: 90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 44, y: 50, z: 0 }, endPosition: { x: 44, y: 50, z: 0 } },
      },
      'human-combo-punch',
      durNumber,
      'in-place'
    );
    const ronin = withMotion(
      {
        id: 'actor-ronin',
        name: 'Ronin Enforcer',
        kind: 'human',
        color: '#ef4444',
        token: 'armored syndicate warrior swinging a diagonal weapon slash',
        actionDescription: 'lunges forward and swings a powerful diagonal weapon slash',
        rotation: { x: 0, y: -90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 56, y: 50, z: 0 }, endPosition: { x: 56, y: 50, z: 0 } },
      },
      'human-sword-slash',
      durNumber,
      'in-place'
    );

    baseSpec.actors = [kael, ronin];
    baseSpec.sceneDescription =
      'Low-angle lateral tracking shot across wet neon asphalt as Agent Kael and the Ronin Enforcer clash in close-quarters combat at center stage.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-01e') {
    baseSpec.environment = getEnvPreset('env-cyberpunk-alley');
    baseSpec.camera.movement.type = 'truck-left';
    baseSpec.camera.movement.speed = 'rapid-dynamic';
    baseSpec.camera.movement.startPosition = { x: 62, y: 78, z: 12 };
    baseSpec.camera.movement.endPosition = { x: 38, y: 78, z: 12 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 50 };
    baseSpec.camera.angle = 'low-angle';
    baseSpec.camera.shotType = 'wide';
    baseSpec.lighting = {
      style: 'neon-cyberpunk',
      direction: 'side-key',
      contrast: 'high-contrast',
      lights: [
        { id: 'lgt-1', name: 'Expressway Arc Key', position: { x: 50, y: 55, z: 65 }, color: '#fbbf24', intensity: 3.4, enabled: true },
        { id: 'lgt-2', name: 'Cyan Street Fill', position: { x: 32, y: 60, z: 45 }, color: '#38bdf8', intensity: 3.0, enabled: true },
      ],
    };

    const heroCar = withMotion(
      {
        id: 'veh-hero-interceptor',
        name: 'Kael Interceptor',
        kind: 'car',
        color: '#3b82f6',
        scale: 1.05,
        token: 'pursuit interceptor sports car launching forward down the expressway',
        actionDescription: 'launches forward at full throttle down the left lane',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 42, y: 36, z: 0 }, endPosition: { x: 42, y: 58, z: 0 } },
      },
      'veh-accel-launch',
      durNumber,
      'travel'
    );
    const syndicateCar = withMotion(
      {
        id: 'veh-syndicate-sedan',
        name: 'Syndicate Chase Sedan',
        kind: 'car',
        color: '#ef4444',
        scale: 1.05,
        token: 'syndicate pursuit sedan racing alongside in the right lane',
        actionDescription: 'drives forward at high speed in pursuit',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 58, y: 34, z: 0 }, endPosition: { x: 58, y: 56, z: 0 } },
      },
      'veh-drive-cruise',
      durNumber,
      'travel'
    );

    baseSpec.actors = [heroCar, syndicateCar];
    baseSpec.sceneDescription =
      'High-speed 24mm lateral tracking shot as Agent Kael Interceptor launches at full throttle alongside a pursuing Syndicate Sedan.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-01f') {
    baseSpec.environment = getEnvPreset('env-modern-penthouse');
    baseSpec.camera.movement.type = 'dolly-out';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 68, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 82, z: 13 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 48 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium-wide';
    baseSpec.lighting = {
      style: 'golden-hour',
      direction: 'rim-backlit',
      contrast: 'balanced',
      lights: [
        { id: 'lgt-1', name: 'Dawn Horizon Gold', position: { x: 50, y: 24, z: 58 }, color: '#f59e0b', intensity: 3.5, enabled: true },
        { id: 'lgt-2', name: 'Penthouse Warm Key', position: { x: 35, y: 66, z: 46 }, color: '#fde047', intensity: 2.8, enabled: true },
      ],
    };

    const kael = withMotion(
      {
        id: 'actor-kael',
        name: 'Agent Kael',
        kind: 'human',
        color: '#3b82f6',
        token: 'operative standing on the penthouse floor signaling extraction',
        actionDescription: 'raises one hand high and waves toward extraction',
        rotation: { x: 0, y: 0, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 44, y: 50, z: 0 }, endPosition: { x: 44, y: 50, z: 0 } },
      },
      'human-wave-greet',
      durNumber,
      'in-place'
    );
    const cipher = withMotion(
      {
        id: 'actor-cipher',
        name: 'Cipher Informant',
        kind: 'human',
        color: '#a855f7',
        token: 'ally standing calmly beside Kael at dawn',
        actionDescription: 'stands naturally with subtle breathing watching the horizon',
        rotation: { x: 0, y: 0, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 56, y: 50, z: 0 }, endPosition: { x: 56, y: 50, z: 0 } },
      },
      'human-idle-breathe',
      durNumber,
      'in-place'
    );
    const loungeTable: Actor = {
      id: 'prop-penthouse-table',
      name: 'Penthouse Console Table',
      kind: 'table',
      color: '#eab308',
      scale: 0.95,
      token: 'designer glass-and-walnut console table in the penthouse',
      actionDescription: 'placed behind the operatives',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 40, z: 0 }, endPosition: { x: 50, y: 40, z: 0 } },
    };

    baseSpec.actors = [kael, cipher, loungeTable];
    baseSpec.sceneDescription =
      'Sweeping 85mm dolly-out across the sunlit Minimalist Penthouse as Agent Kael and Cipher complete the mission at golden hour.';
    return baseSpec;
  }

  // ==========================================================================
  // SCENE 02: CHRONOS RELIC (Epic Adventure & Sci-Fi Worldbuilding)
  // ==========================================================================
  if (shotItem.id === 'shot-02a') {
    baseSpec.environment = getEnvPreset('env-desert-dunes');
    baseSpec.camera.movement.type = 'pedestal-down';
    baseSpec.camera.movement.speed = 'moderate';
    baseSpec.camera.movement.startPosition = { x: 50, y: 80, z: 20 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 68, z: 10 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 46 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'wide';
    baseSpec.lighting = {
      style: 'golden-hour',
      direction: 'side-key',
      contrast: 'balanced',
      lights: [
        { id: 'lgt-1', name: 'Saharan Sun Key', position: { x: 75, y: 40, z: 68 }, color: '#f59e0b', intensity: 3.6, enabled: true },
        { id: 'lgt-2', name: 'Warm Sand Bounce', position: { x: 30, y: 64, z: 38 }, color: '#fde047', intensity: 2.8, enabled: true },
      ],
    };

    const scout = withMotion(
      {
        id: 'actor-aria',
        name: 'Explorer Aria',
        kind: 'human',
        color: '#10b981',
        token: 'expedition archaeologist running forward across golden desert dunes',
        actionDescription: 'runs forward in an energetic sprint toward the foreground',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 44, y: 38, z: 0 }, endPosition: { x: 44, y: 56, z: 0 } },
      },
      'human-run-sprint',
      durNumber,
      'travel'
    );
    const duneBuggy = withMotion(
      {
        id: 'veh-dune-buggy',
        name: 'Nomad Dune Buggy',
        kind: 'car',
        color: '#eab308',
        scale: 1.05,
        token: 'rugged desert expedition rover driving across the sand dunes',
        actionDescription: 'drives forward smoothly across the golden desert',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 58, y: 36, z: 0 }, endPosition: { x: 58, y: 54, z: 0 } },
      },
      'veh-drive-cruise',
      durNumber,
      'travel'
    );
    const obelisk: Actor = {
      id: 'env-desert-obelisk',
      name: 'Ancient Solar Obelisk',
      kind: 'monolith',
      color: '#a855f7',
      scale: 1.3,
      token: 'ancient weathered stone obelisk rising from the desert floor',
      actionDescription: 'standing monumentally in the background center',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 28, z: 0 }, endPosition: { x: 50, y: 28, z: 0 } },
    };

    baseSpec.actors = [scout, duneBuggy, obelisk];
    baseSpec.sceneDescription =
      'Sweeping 18mm crane descent over the Vast Saharan Dunes as Explorer Aria and the Nomad Dune Buggy advance from the Ancient Solar Obelisk.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-02b') {
    baseSpec.environment = getEnvPreset('env-misty-forest');
    baseSpec.camera.movement.type = 'pan-right';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 74, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 70, z: 10 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 46 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium-wide';
    baseSpec.lighting = {
      style: 'moonlight-foggy',
      direction: 'overhead-top',
      contrast: 'balanced',
      lights: [
        { id: 'lgt-1', name: 'Forest Canopy Key', position: { x: 46, y: 54, z: 65 }, color: '#93c5fd', intensity: 3.4, enabled: true },
        { id: 'lgt-2', name: 'Emerald Shrine Glow', position: { x: 54, y: 42, z: 38 }, color: '#10b981', intensity: 3.2, enabled: true },
      ],
    };

    const aria = withMotion(
      {
        id: 'actor-aria',
        name: 'Explorer Aria',
        kind: 'human',
        color: '#10b981',
        token: 'explorer walking cautiously through the redwood forest clearing',
        actionDescription: 'sneaks forward cautiously toward the forest clearing',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 46, y: 38, z: 0 }, endPosition: { x: 46, y: 52, z: 0 } },
      },
      'human-sneak-prowl',
      durNumber,
      'travel'
    );
    const shrineMonolith: Actor = {
      id: 'env-forest-shrine',
      name: 'Chronos Shrine',
      kind: 'monolith',
      color: '#06b6d4',
      scale: 1.15,
      token: 'moss-covered stone shrine with glowing emerald carvings',
      actionDescription: 'standing in the forest clearing',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 56, y: 42, z: 0 }, endPosition: { x: 56, y: 42, z: 0 } },
    };
    const treeLeft: Actor = {
      id: 'env-redwood-1',
      name: 'Redwood Pine Left',
      kind: 'tree',
      color: '#10b981',
      scale: 1.15,
      token: 'tall conifer tree framing stage left',
      actionDescription: 'standing on stage left',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 32, y: 44, z: 0 }, endPosition: { x: 32, y: 44, z: 0 } },
    };
    const treeRight: Actor = {
      id: 'env-redwood-2',
      name: 'Redwood Pine Right',
      kind: 'tree',
      color: '#10b981',
      scale: 1.15,
      token: 'tall conifer tree framing stage right',
      actionDescription: 'standing on stage right',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 68, y: 44, z: 0 }, endPosition: { x: 68, y: 44, z: 0 } },
    };

    baseSpec.actors = [aria, shrineMonolith, treeLeft, treeRight];
    baseSpec.sceneDescription =
      'Atmospheric 35mm pan across the Deep Redwood Forest as Explorer Aria advances past the glowing Chronos Shrine framed by ancient pines.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-02c') {
    baseSpec.environment = getEnvPreset('env-medieval-courtyard');
    baseSpec.camera.movement.type = 'pedestal-down';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 76, z: 22 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 68, z: 11 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 48 };
    baseSpec.camera.angle = 'high-angle';
    baseSpec.camera.shotType = 'wide';
    baseSpec.lighting = {
      style: 'practical-candlelight',
      direction: 'side-key',
      contrast: 'balanced',
      lights: [
        { id: 'lgt-1', name: 'Brazier Torch West', position: { x: 30, y: 52, z: 48 }, color: '#f59e0b', intensity: 3.4, enabled: true },
        { id: 'lgt-2', name: 'Brazier Torch East', position: { x: 70, y: 52, z: 48 }, color: '#f59e0b', intensity: 3.4, enabled: true },
        { id: 'lgt-3', name: 'Courtyard Moon Fill', position: { x: 50, y: 30, z: 68 }, color: '#93c5fd', intensity: 2.8, enabled: true },
      ],
    };

    const aria = withMotion(
      {
        id: 'actor-aria',
        name: 'Explorer Aria',
        kind: 'human',
        color: '#10b981',
        token: 'explorer walking down the center of the stone castle courtyard',
        actionDescription: 'walks forward steadily between the two courtyard guardians',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 36, z: 0 }, endPosition: { x: 50, y: 54, z: 0 } },
      },
      'human-walk-forward',
      durNumber,
      'travel'
    );
    const guardianLeft = withMotion(
      {
        id: 'actor-guardian-left',
        name: 'Citadel Guardian A',
        kind: 'human',
        color: '#ef4444',
        scale: 1.1,
        token: 'armored temple knight standing guard on the left flank',
        actionDescription: 'performs a ceremonial guardian slash on the left flank',
        rotation: { x: 0, y: 90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 36, y: 46, z: 0 }, endPosition: { x: 36, y: 46, z: 0 } },
      },
      'human-sword-slash',
      durNumber,
      'in-place'
    );
    const guardianRight = withMotion(
      {
        id: 'actor-guardian-right',
        name: 'Citadel Guardian B',
        kind: 'human',
        color: '#a855f7',
        scale: 1.1,
        token: 'armored temple knight standing guard on the right flank',
        actionDescription: 'performs a ceremonial guardian slash on the right flank',
        rotation: { x: 0, y: -90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 64, y: 46, z: 0 }, endPosition: { x: 64, y: 46, z: 0 } },
      },
      'human-sword-slash',
      durNumber,
      'in-place'
    );

    baseSpec.actors = [aria, guardianLeft, guardianRight];
    baseSpec.sceneDescription =
      'Majestic crane descent into the torchlit Medieval Castle Courtyard as Explorer Aria walks down the center aisle between two Citadel Guardians.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-02d') {
    baseSpec.environment = getEnvPreset('env-post-apocalyptic');
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'rapid-dynamic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 74, z: 9 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 62, z: 8 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 48 };
    baseSpec.camera.angle = 'low-angle';
    baseSpec.camera.shotType = 'medium';
    baseSpec.lighting = {
      style: 'low-key-film-noir',
      direction: 'side-key',
      contrast: 'high-contrast',
      lights: [
        { id: 'lgt-1', name: 'Amber Ruin Key', position: { x: 36, y: 56, z: 48 }, color: '#f59e0b', intensity: 3.5, enabled: true },
        { id: 'lgt-2', name: 'Storm Sky Rim', position: { x: 64, y: 38, z: 62 }, color: '#38bdf8', intensity: 3.0, enabled: true },
      ],
    };

    const aria = withMotion(
      {
        id: 'actor-aria',
        name: 'Explorer Aria',
        kind: 'human',
        color: '#10b981',
        token: 'explorer leaping forward across ancient stone ruins',
        actionDescription: 'crouches and leaps through the air before landing firmly on both feet',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 43, y: 40, z: 0 }, endPosition: { x: 43, y: 52, z: 0 } },
      },
      'human-jump-leap',
      durNumber,
      'travel'
    );
    const golem = withMotion(
      {
        id: 'actor-construct',
        name: 'Ruin Sentinel',
        kind: 'human',
        color: '#ef4444',
        scale: 1.15,
        token: 'ancient sentinel staggering back from kinetic shockwave',
        actionDescription: 'recoils backward from impact and staggers before regaining balance',
        rotation: { x: 0, y: 0, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 57, y: 48, z: 0 }, endPosition: { x: 57, y: 40, z: 0 } },
      },
      'human-hit-stagger',
      durNumber,
      'travel'
    );
    const ruinPillar: Actor = {
      id: 'env-ruin-pillar',
      name: 'Ancient Stone Pillar',
      kind: 'monolith',
      color: '#eab308',
      scale: 0.9,
      token: 'weathered stone column standing in the ruins',
      actionDescription: 'framing the background of the ruins',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 32, z: 0 }, endPosition: { x: 50, y: 32, z: 0 } },
    };

    baseSpec.actors = [aria, golem, ruinPillar];
    baseSpec.sceneDescription =
      'Dynamic 50mm low-angle push-in as Explorer Aria leaps forward across the ruins while the Ruin Sentinel staggers backward from the impact.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-02e') {
    baseSpec.environment = getEnvPreset('env-rustic-hearth');
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 62, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 57, z: 10 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 50 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'close-up';
    baseSpec.lighting = {
      style: 'practical-candlelight',
      direction: 'front-soft',
      contrast: 'balanced',
      lights: [
        { id: 'lgt-1', name: 'Hearth Firelight Key', position: { x: 50, y: 36, z: 42 }, color: '#f97316', intensity: 3.6, enabled: true },
        { id: 'lgt-2', name: 'Warm Chamber Fill', position: { x: 40, y: 64, z: 48 }, color: '#fbbf24', intensity: 2.8, enabled: true },
      ],
    };

    const aria = withMotion(
      {
        id: 'actor-aria',
        name: 'Explorer Aria',
        kind: 'human',
        color: '#10b981',
        token: 'explorer standing on the left of the council map table',
        actionDescription: 'scans the ancient map table in the warm firelight',
        rotation: { x: 0, y: 90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 41, y: 50, z: 0 }, endPosition: { x: 41, y: 50, z: 0 } },
      },
      'human-look-search',
      durNumber,
      'in-place'
    );
    const elder = withMotion(
      {
        id: 'actor-elder',
        name: 'Archivist Vance',
        kind: 'human',
        color: '#3b82f6',
        token: 'scholarly archivist standing on the right of the council table',
        actionDescription: 'gestures across the map table toward Explorer Aria',
        rotation: { x: 0, y: -90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 59, y: 50, z: 0 }, endPosition: { x: 59, y: 50, z: 0 } },
      },
      'human-wave-greet',
      durNumber,
      'in-place'
    );
    const mapTable: Actor = {
      id: 'prop-council-table',
      name: 'Council Map Table',
      kind: 'table',
      color: '#eab308',
      scale: 0.95,
      token: 'carved oak council table at center stage',
      actionDescription: 'standing between Aria and Archivist Vance',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50, z: 0 }, endPosition: { x: 50, y: 50, z: 0 } },
    };

    baseSpec.actors = [aria, elder, mapTable];
    baseSpec.sceneDescription =
      'Intimate 85mm push-in inside the Rustic Hearthside Chamber as Explorer Aria and Archivist Vance study the Council Map Table by warm firelight.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-02f') {
    baseSpec.environment = getEnvPreset('env-scifi-hangar');
    baseSpec.camera.movement.type = 'pedestal-up';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 78, z: 9 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 74, z: 16 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 46 };
    baseSpec.camera.angle = 'low-angle';
    baseSpec.camera.shotType = 'wide';
    baseSpec.lighting = {
      style: 'neon-cyberpunk',
      direction: 'rim-backlit',
      contrast: 'balanced',
      lights: [
        { id: 'lgt-1', name: 'Hangar Deck Flood', position: { x: 50, y: 60, z: 58 }, color: '#38bdf8', intensity: 3.6, enabled: true },
        { id: 'lgt-2', name: 'Bay Beacon Amber', position: { x: 28, y: 46, z: 48 }, color: '#f59e0b', intensity: 3.0, enabled: true },
        { id: 'lgt-3', name: 'Starship Rim Glow', position: { x: 72, y: 46, z: 48 }, color: '#10b981', intensity: 3.0, enabled: true },
      ],
    };

    const aria = withMotion(
      {
        id: 'actor-aria',
        name: 'Explorer Aria',
        kind: 'human',
        color: '#10b981',
        token: 'explorer celebrating on the orbital hangar deck',
        actionDescription: 'raises both arms overhead and cheers in triumph',
        rotation: { x: 0, y: 0, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 43, y: 54, z: 0 }, endPosition: { x: 43, y: 54, z: 0 } },
      },
      'human-victory-cheer',
      durNumber,
      'in-place'
    );
    const elder = withMotion(
      {
        id: 'actor-elder',
        name: 'Commander Vance',
        kind: 'human',
        color: '#3b82f6',
        token: 'commander standing beside Aria on the hangar deck',
        actionDescription: 'raises one hand high and waves in salute',
        rotation: { x: 0, y: 0, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 57, y: 54, z: 0 }, endPosition: { x: 57, y: 54, z: 0 } },
      },
      'human-wave-greet',
      durNumber,
      'in-place'
    );
    const starship: Actor = {
      id: 'veh-chronos-starship',
      name: 'Chronos Ark Starship',
      kind: 'spaceship',
      color: '#06b6d4',
      scale: 1.35,
      token: 'sleek deep-space exploration starship docked at center bay',
      actionDescription: 'positioned majestically behind the crew in the orbital hangar bay',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 34, z: 0 }, endPosition: { x: 50, y: 34, z: 0 } },
    };

    baseSpec.actors = [aria, elder, starship];
    baseSpec.sceneDescription =
      'Monumental 135mm low-angle crane ascent inside the Orbital Starship Hangar as Explorer Aria and Commander Vance celebrate before the docked Chronos Ark Starship.';
    return baseSpec;
  }

  // Fallback default for any newly added user shot
  const defaultActor: Actor = {
    id: `actor-${Date.now()}`,
    name: 'Lead Subject',
    kind: 'human',
    color: '#3b82f6',
    token: 'a dramatic subject in the spotlight',
    actionDescription: 'stands at center stage',
    trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50, z: 0 }, endPosition: { x: 50, y: 50, z: 0 } },
  };
  baseSpec.actors = [defaultActor];
  return baseSpec;
};

export const BUILTIN_DEMO_VERSION = 'competition-2x6-v4';
const DEMO_VERSION_STORAGE_KEY = 'comfy_ai_director_demo_version_v1';

export const DEFAULT_SCENES: SceneItem[] = [
  {
    id: 'scene-1',
    name: 'Scene 01 - Neon Protocol',
    shots: [
      {
        id: 'shot-01a',
        code: 'Shot 01A',
        title: 'Rooftop Drone Stand-Off',
        duration: '5s',
        focalLength: '35mm',
        movement: 'Low-Angle Push-In',
        thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-01b',
        code: 'Shot 01B',
        title: 'Alley Turret & Cruiser Firefight',
        duration: '5s',
        focalLength: '35mm',
        movement: 'Lateral Tracking Firefight',
        thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-01c',
        code: 'Shot 01C',
        title: 'Neon Street Drift & Mid-Air Leap',
        duration: '5s',
        focalLength: '24mm',
        movement: 'Wide Dynamic Push-In',
        thumbnail: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-01d',
        code: 'Shot 01D',
        title: 'Katana Clash in Rain',
        duration: '5s',
        focalLength: '18mm',
        movement: 'Ground Lateral Track',
        thumbnail: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-01e',
        code: 'Shot 01E',
        title: 'Interceptor Pursuit',
        duration: '4s',
        focalLength: '24mm',
        movement: 'High-Speed Track',
        thumbnail: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-01f',
        code: 'Shot 01F',
        title: 'Penthouse Extraction',
        duration: '6s',
        focalLength: '85mm',
        movement: 'Skyline Dolly Out',
        thumbnail: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
    ],
  },
  {
    id: 'scene-2',
    name: 'Scene 02 - Chronos Relic',
    shots: [
      {
        id: 'shot-02a',
        code: 'Shot 02A',
        title: 'Dune Horizon Convoy',
        duration: '5s',
        focalLength: '18mm',
        movement: 'FPV Aerial Dive',
        thumbnail: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-02b',
        code: 'Shot 02B',
        title: 'Redwood Shrine Relic',
        duration: '5s',
        focalLength: '35mm',
        movement: 'Misty Pan Reveal',
        thumbnail: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-02c',
        code: 'Shot 02C',
        title: 'Courtyard of Guardians',
        duration: '5s',
        focalLength: '24mm',
        movement: "God's-Eye Descent",
        thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-02d',
        code: 'Shot 02D',
        title: 'Leap Across the Abyss',
        duration: '4s',
        focalLength: '50mm',
        movement: 'Heroic Low Dolly',
        thumbnail: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-02e',
        code: 'Shot 02E',
        title: 'Council by Firelight',
        duration: '6s',
        focalLength: '85mm',
        movement: 'Chiaroscuro Push-In',
        thumbnail: 'https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-02f',
        code: 'Shot 02F',
        title: 'Orbital Hangar Launch',
        duration: '6s',
        focalLength: '135mm',
        movement: 'Telephoto Crane Up',
        thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
    ],
  },
];

const loadSavedScenes = (): SceneItem[] => {
  try {
    const savedVer = safeGetItem<string | null>(DEMO_VERSION_STORAGE_KEY, null);
    if (savedVer !== BUILTIN_DEMO_VERSION) {
      safeSetItem(DEMO_VERSION_STORAGE_KEY, BUILTIN_DEMO_VERSION);
      safeRemoveItem(STORAGE_KEYS.SCENES);
      safeRemoveItem(STORAGE_KEYS.SHOTS_CACHE);
      safeRemoveItem(STORAGE_KEYS.CAST_POOL);
      return DEFAULT_SCENES;
    }
    const parsed = safeGetItem<SceneItem[] | null>(STORAGE_KEYS.SCENES, null);
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((scene: SceneItem) => ({
        ...scene,
        shots: (scene.shots || []).map((sh) => {
          const num = parseInt(sh.duration, 10);
          return {
            ...sh,
            duration: (!num || num > 15 || num < 1) ? '4s' : `${num}s`,
          };
        }),
      }));
    }
  } catch {}
  return DEFAULT_SCENES;
};

export interface ShotBibleProps {
  activeShotId?: string;
  onSelectShot?: (shotId: string, shotTitle?: string, sceneName?: string) => void;
}

export const ShotBible: React.FC<ShotBibleProps> = ({
  activeShotId = 'shot-01a',
  onSelectShot,
}) => {
  const { switchShot, shot, updateShotName } = useShotStore();
  const [scenes, setScenes] = useState<SceneItem[]>(loadSavedScenes);
  const [collapsedScenes, setCollapsedScenes] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isProjectInfoCollapsed, setIsProjectInfoCollapsed] = useState(false);
  const [openMenuShotId, setOpenMenuShotId] = useState<string | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Computed project info
  const totalShots = scenes.reduce((acc, sc) => acc + sc.shots.length, 0);
  const totalDurationSeconds = scenes.reduce((acc, sc) => {
    return acc + sc.shots.reduce((sAcc, sh) => sAcc + (parseInt(sh.duration, 10) || 4), 0);
  }, 0);
  const formatProjectDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `00:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  const getResolutionForRatio = (ratio?: string) => {
    switch (ratio) {
      case '2.39:1':
        return '1920 × 804 (2.39:1)';
      case '9:16':
        return '1080 × 1920 (9:16)';
      case '4:3':
        return '1440 × 1080 (4:3)';
      case '1:1':
        return '1080 × 1080 (1:1)';
      case '16:9':
      default:
        return '1920 × 1080 (16:9)';
    }
  };
  const formattedDate = shot?.timestamp
    ? new Date(shot.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Oct 23, 2026';

  // Close context menus on click-outside
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuShotId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Hydrate initial Shot 01A showcase scene only when starting from the uninitialized generic fallback
  useEffect(() => {
    const current = useShotStore.getState().shot;
    const firstScene = scenes[0];
    const firstShotItem = firstScene?.shots?.[0];
    if (
      firstShotItem &&
      current.id === 'shot-01a' &&
      current.name === 'Shot 01A Tracking In' &&
      current.actors.length === 1 &&
      current.actors[0]?.id === 'actor-1' &&
      current.actors[0]?.token === 'a lone traveler in a weathered jacket'
    ) {
      const built = { ...buildDefaultShotSpec(firstShotItem), name: firstShotItem.code };
      useShotStore.getState().loadShot(built);
      if (onSelectShot) {
        onSelectShot(firstShotItem.id, firstShotItem.code, firstScene.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist scenes to localStorage & Studio Storage disk folder
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SCENES, scenes);
    const castPool = useShotStore.getState().sceneCastPool;
    saveProjectToStudioStorage({ scenes, castPool }).catch(() => {});
  }, [scenes]);

  // Listen for project restoration from Studio Storage disk folder
  useEffect(() => {
    const handleRestored = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && Array.isArray(detail.scenes) && detail.scenes.length > 0) {
        setScenes(detail.scenes);
      }
    };
    window.addEventListener('studio-storage:project-restored', handleRestored);
    return () => window.removeEventListener('studio-storage:project-restored', handleRestored);
  }, []);

  // Sync active shot duration & focal length to Left Panel card
  useEffect(() => {
    if (!shot?.id) return;
    const durationStr = `${shot.durationSeconds || 4}s`;
    const focalStr = shot.camera?.lens?.customFocalLengthMm
      ? `${Math.round(shot.camera.lens.customFocalLengthMm)}mm`
      : shot.camera?.lens?.focalLength || '35mm';

    setScenes((prev) => {
      let changed = false;
      const next = prev.map((sc) => {
        if (!sc.shots.some((sh) => sh.id === shot.id)) return sc;
        return {
          ...sc,
          shots: sc.shots.map((sh) => {
            if (sh.id !== shot.id) return sh;
            if (sh.duration === durationStr && sh.focalLength === focalStr) {
              return sh;
            }
            changed = true;
            return {
              ...sh,
              duration: durationStr,
              focalLength: focalStr,
            };
          }),
        };
      });
      return changed ? next : prev;
    });
  }, [shot?.id, shot?.durationSeconds, shot?.camera?.lens?.focalLength, shot?.camera?.lens?.customFocalLengthMm]);

  const toggleScene = (sceneId: string) => {
    setCollapsedScenes((prev) => ({ ...prev, [sceneId]: !prev[sceneId] }));
  };

  const handleSelectShot = (shotItem: SceneItem['shots'][0], customFallback?: () => ShotSpec) => {
    const parentScene = scenes.find((s) => s.shots.some((sh) => sh.id === shotItem.id));
    if (onSelectShot) onSelectShot(shotItem.id, shotItem.code, parentScene?.name);
    switchShot(
      shotItem.id,
      customFallback || (() => ({ ...buildDefaultShotSpec(shotItem), name: shotItem.code }))
    );
  };

  const handleCreateNewScene = () => {
    const sceneNum = scenes.length + 1;
    const sceneId = `scene-${Date.now().toString(36)}`;
    const newShot: ShotBibleItem = {
      id: `shot-0${sceneNum}a-${Date.now().toString(36)}`,
      code: `Shot 0${sceneNum}A`,
      title: 'Establishing 3D Previs',
      duration: '4s',
      focalLength: '35mm',
      movement: 'Slow Dolly In',
      thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=160&q=80&auto=format&fit=crop',
      mode: 'construct-3d',
    };
    const newScene: SceneItem = {
      id: sceneId,
      name: `Scene 0${sceneNum} - Sequence`,
      shots: [newShot],
    };
    setScenes((prev) => [...prev, newScene]);
    setCollapsedScenes((prev) => ({ ...prev, [sceneId]: false }));
    handleSelectShot(newShot);
  };

  const handleCreateShot = (targetScId?: string) => {
    const scId = targetScId || scenes[0]?.id;
    const targetScene = scenes.find((s) => s.id === scId) || scenes[0];
    if (!targetScene) return;
    const newShotNum = targetScene.shots.length + 1;
    const letter = String.fromCharCode(64 + newShotNum);
    const scenePrefixMatch = targetScene.name.match(/\b(?:Scene\s*)?(\d+)/i);
    const sceneNumStr = scenePrefixMatch ? String(scenePrefixMatch[1]).padStart(2, '0') : '01';
    const newShot: ShotBibleItem = {
      id: `shot-${sceneNumStr}${letter.toLowerCase()}-${Date.now().toString(36)}`,
      code: `Shot ${sceneNumStr}${letter}`,
      title: '3D Stage Previs',
      duration: '4s',
      focalLength: '35mm',
      movement: 'Orbit / Track',
      thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=160&q=80&auto=format&fit=crop',
      mode: 'construct-3d',
    };

    setScenes((prev) =>
      prev.map((sc) => (sc.id === targetScene.id ? { ...sc, shots: [...sc.shots, newShot] } : sc))
    );
    handleSelectShot(newShot);
  };

  const handleDeleteShot = (sceneId: string, shotId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const targetScene = scenes.find((s) => s.id === sceneId);
    if (!targetScene) return;

    if (targetScene.shots.length <= 1 && scenes.length <= 1) {
      logger.warn('Cannot delete the last remaining shot in the project.');
      setNoticeMessage('Cannot delete the last remaining shot in the project.');
      return;
    }

    const updatedShots = targetScene.shots.filter((s) => s.id !== shotId);
    const updatedScenes = scenes.map((s) =>
      s.id === sceneId ? { ...s, shots: updatedShots } : s
    );

    setScenes(updatedScenes);

    // If the deleted shot was currently selected, select another valid shot
    if (activeShotId === shotId) {
      let nextShot: ShotBibleItem | undefined = updatedShots[0];
      if (!nextShot) {
        for (const sc of updatedScenes) {
          if (sc.shots.length > 0) {
            nextShot = sc.shots[0];
            break;
          }
        }
      }

      if (nextShot) {
        handleSelectShot(nextShot);
      }
    }

    setOpenMenuShotId(null);
  };

  const handleDeleteScene = (sceneId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (scenes.length <= 1) {
      logger.warn('Project must have at least one scene.');
      setNoticeMessage('Project must have at least one scene.');
      return;
    }

    const sceneToDelete = scenes.find((s) => s.id === sceneId);
    const updatedScenes = scenes.filter((s) => s.id !== sceneId);

    setScenes(updatedScenes);

    const wasActiveInScene = sceneToDelete?.shots.some((s) => s.id === activeShotId);
    if (wasActiveInScene) {
      const nextShot = updatedScenes[0]?.shots[0];
      if (nextShot) {
        handleSelectShot(nextShot);
      }
    }
  };

  const handleDuplicateShot = (sceneId: string, shotItem: ShotBibleItem, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const targetScene = scenes.find((s) => s.id === sceneId);
    if (!targetScene) return;

    const duplicatedShot: ShotBibleItem = {
      ...shotItem,
      id: `shot-${Date.now().toString(36)}`,
      code: `${shotItem.code} Copy`,
      title: `${shotItem.title} (Copy)`,
    };

    const storeState = useShotStore.getState();
    const sourceSpec =
      (storeState.shot.id === shotItem.id ? storeState.shot : storeState.shotsById[shotItem.id]) ||
      buildDefaultShotSpec(shotItem);
    const clonedSpec: ShotSpec = {
      ...JSON.parse(JSON.stringify(sourceSpec)),
      id: duplicatedShot.id,
      name: duplicatedShot.code,
      timestamp: Date.now(),
    };

    const updatedScenes = scenes.map((s) =>
      s.id === sceneId ? { ...s, shots: [...s.shots, duplicatedShot] } : s
    );

    setScenes(updatedScenes);
    handleSelectShot(duplicatedShot, () => clonedSpec);
    setOpenMenuShotId(null);
  };

  const handleRenameScene = (sceneId: string, newName: string) => {
    if (!newName.trim()) {
      setEditingSceneId(null);
      return;
    }
    const updatedScenes = scenes.map((s) =>
      s.id === sceneId ? { ...s, name: newName.trim() } : s
    );
    setScenes(updatedScenes);
    setEditingSceneId(null);
  };

  const handleRenameShot = (sceneId: string, shotId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setEditingShotId(null);
      return;
    }
    const targetScene = scenes.find((s) => s.id === sceneId);
    const updatedScenes = scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            shots: s.shots.map((sh) => (sh.id === shotId ? { ...sh, code: trimmed, title: trimmed } : sh)),
          }
        : s
    );
    setScenes(updatedScenes);
    if (activeShotId === shotId) {
      updateShotName(trimmed);
      if (onSelectShot) onSelectShot(shotId, trimmed, targetScene?.name);
    }
    setEditingShotId(null);
  };

  const handleResetDemoScenes = () => {
    if (window.confirm('Reset all scenes and shots back to default demo project?')) {
      setScenes(DEFAULT_SCENES);
      safeRemoveItem(STORAGE_KEYS.SCENES);
      safeRemoveItem(STORAGE_KEYS.SHOTS_CACHE);
      useShotStore.getState().resetToDefault();
      handleSelectShot(DEFAULT_SCENES[0].shots[0]);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#0D1320] text-[#F0F3FA] select-none relative">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#273247] bg-[#121A2A]/80 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-display text-xs font-bold tracking-wider text-white">Shot Bible</span>
          <span className="rounded-md bg-[#1A2436] border border-[#273247] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[#98A5BC]">
            {scenes.reduce((acc, sc) => acc + sc.shots.length, 0)} shots
          </span>
        </div>
        <button
          onClick={() => handleCreateShot()}
          className="flex items-center gap-1 rounded-lg bg-gradient-to-b from-[#6658F5] to-[#5243E2] hover:from-[#7467FF] hover:to-[#5E4FF0] px-2.5 py-1 text-[10.5px] font-bold text-white border border-[#8E84FF]/40 shadow-[0_2px_8px_rgba(102,88,245,0.35)] transition-all active:scale-95"
          title="Add New Shot"
        >
          <Plus className="h-3 w-3" />
          <span>Add Shot</span>
        </button>
      </div>

      {/* Search Input */}
      {noticeMessage && (
        <div className="mx-3 mt-2 p-2 rounded-lg bg-[#2A2012] border border-[#F0AE42]/40 text-[#F0AE42] text-[10px] font-mono flex items-center justify-between gap-1.5">
          <span>{noticeMessage}</span>
          <button
            onClick={() => setNoticeMessage(null)}
            className="text-[#F0AE42] hover:text-white px-1 py-0.5 rounded hover:bg-[#F0AE42]/20"
            title="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-[#090D16] px-2.5 py-1.5 border border-[#273247] focus-within:border-[#6658F5] transition-colors shadow-inner">
          <Search className="h-3.5 w-3.5 text-[#98A5BC] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shots..."
            className="w-full bg-transparent text-[11px] text-[#F0F3FA] placeholder-[#64748B] focus:outline-none"
          />
        </div>
      </div>

      {/* Scenes List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-1.5">
        {scenes.map((scene) => {
          const isCollapsed = !!collapsedScenes[scene.id];
          const filteredShots = scene.shots.filter(
            (s) =>
              s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
              s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
              s.movement.toLowerCase().includes(searchQuery.toLowerCase())
          );

          return (
            <div key={scene.id} className="space-y-1">
              {/* Scene Accordion Header with Inline Rename & Delete */}
              <div className="group/scene flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[11px] font-semibold text-[#98A5BC] hover:bg-[#121A2A] hover:text-[#F0F3FA] transition-colors">
                <div
                  onClick={() => toggleScene(scene.id)}
                  className="flex flex-1 items-center gap-1.5 cursor-pointer min-w-0 py-0.5"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-[#64748B] shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-[#98A5BC] shrink-0" />
                  )}
                  <FolderOpen className="h-3.5 w-3.5 text-[#6658F5] shrink-0" />
                  {editingSceneId === scene.id ? (
                    <input
                      type="text"
                      defaultValue={scene.name}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameScene(scene.id, (e.target as HTMLInputElement).value);
                        if (e.key === 'Escape') setEditingSceneId(null);
                      }}
                      onBlur={(e) => handleRenameScene(scene.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-[#090D16] border border-[#6658F5] rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none w-36"
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingSceneId(scene.id);
                      }}
                      className="truncate text-[#D5DFEE]"
                      title="Double-click to rename scene"
                    >
                      {scene.name}
                    </span>
                  )}
                  <span className="font-mono text-[9.5px] text-[#64748B] shrink-0">
                    ({scene.shots.length})
                  </span>
                </div>

                {/* Scene Action Buttons */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover/scene:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSceneId(scene.id);
                    }}
                    className="p-1 rounded hover:bg-[#1A2436] text-[#98A5BC] hover:text-[#F0AE42] transition-colors"
                    title={`Rename ${scene.name}`}
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateShot(scene.id);
                    }}
                    className="p-1 rounded hover:bg-[#6658F5]/25 text-[#98A5BC] hover:text-[#C4BEFF] transition-colors"
                    title={`Add shot to ${scene.name}`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  {scenes.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteScene(scene.id, e)}
                      className="p-1 rounded hover:bg-[#EF5261]/20 text-[#98A5BC] hover:text-[#EF5261] transition-colors"
                      title={`Delete ${scene.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Shots List under Scene */}
              {!isCollapsed && (
                <div className="space-y-1 pl-1">
                  {filteredShots.map((shotItem) => {
                    const isSelected = activeShotId === shotItem.id;
                    return (
                      <div
                        key={shotItem.id}
                        onClick={() => handleSelectShot(shotItem)}
                        className={`group relative flex items-center gap-2.5 rounded-xl p-1.5 cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-gradient-to-r from-[#1A2436] to-[#141D2E] border-[#6658F5]/80 text-white shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]'
                            : 'bg-[#121A2A]/55 border-transparent hover:border-[#273247] hover:bg-[#151F32] text-[#D0D9E8]'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className={`relative h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-[#090D16] border ${
                          isSelected ? 'border-[#6658F5]/60' : 'border-[#273247]'
                        }`}>
                          <img
                            src={shotItem.thumbnail}
                            alt={shotItem.code}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                          <span className="absolute bottom-0.5 right-1 font-mono text-[8.5px] font-bold text-white/95">
                            {shotItem.duration}
                          </span>
                        </div>

                        {/* Shot Info */}
                        <div className="flex flex-1 flex-col min-w-0 gap-0.5">
                          <div className="flex items-center justify-between gap-1">
                            {editingShotId === shotItem.id ? (
                              <input
                                type="text"
                                defaultValue={shotItem.code}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameShot(scene.id, shotItem.id, (e.target as HTMLInputElement).value);
                                  if (e.key === 'Escape') setEditingShotId(null);
                                }}
                                onBlur={(e) => handleRenameShot(scene.id, shotItem.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-[#090D16] border border-[#F0AE42] rounded px-1.5 py-0.5 text-white text-[10px] focus:outline-none w-full min-w-0"
                              />
                            ) : (
                              <span
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingShotId(shotItem.id);
                                }}
                                className="font-semibold text-[11px] leading-tight text-[#F0F3FA] truncate"
                                title={`${shotItem.code} — ${shotItem.title} (Double-click to rename)`}
                              >
                                {shotItem.code} · {shotItem.title}
                              </span>
                            )}
                            <div className="relative flex items-center gap-0.5 shrink-0">
                              {/* Quick Rename Button on Hover */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingShotId(shotItem.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-[#98A5BC] hover:text-[#F0AE42] hover:bg-white/10 p-1 rounded transition-all"
                                title="Rename Shot"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>

                              {/* Quick Delete Button on Hover */}
                              <button
                                onClick={(e) => handleDeleteShot(scene.id, shotItem.id, e)}
                                className="opacity-0 group-hover:opacity-100 text-[#98A5BC] hover:text-[#EF5261] hover:bg-[#EF5261]/20 p-1 rounded transition-all"
                                title="Delete Shot"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>

                              {/* Options Dropdown Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuShotId(openMenuShotId === shotItem.id ? null : shotItem.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-[#98A5BC] hover:text-white hover:bg-white/10 p-1 rounded transition-all"
                                title="Shot Options"
                              >
                                <MoreVertical className="h-3 w-3" />
                              </button>

                              {/* Dropdown Menu */}
                              {openMenuShotId === shotItem.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-0 top-6 z-50 w-36 rounded-xl border border-[#273247] bg-[#121A2A] p-1 shadow-2xl backdrop-blur-md text-[11px]"
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingShotId(shotItem.id);
                                      setOpenMenuShotId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[#D0D9E8] hover:bg-[#1A2436] hover:text-white transition-colors"
                                  >
                                    <Edit3 className="h-3 w-3 text-[#F0AE42]" />
                                    <span>Rename Shot</span>
                                  </button>
                                  <button
                                    onClick={(e) => handleDuplicateShot(scene.id, shotItem, e)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[#D0D9E8] hover:bg-[#1A2436] hover:text-white transition-colors"
                                  >
                                    <Copy className="h-3 w-3 text-[#18B8D8]" />
                                    <span>Duplicate Shot</span>
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteShot(scene.id, shotItem.id, e)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[#EF5261] hover:bg-[#EF5261]/15 hover:text-[#FF7A86] transition-colors"
                                  >
                                    <Trash2 className="h-3 w-3 text-[#EF5261]" />
                                    <span>Delete Shot</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-[9.5px] text-[#98A5BC]">
                            <span className="text-[#D5DFEE]">{isSelected ? `${shot.durationSeconds}s` : shotItem.duration}</span>
                            <span className="text-[#384764]">•</span>
                            <span className="text-[#18B8D8] font-semibold">{isSelected ? shot.camera.lens.focalLength : shotItem.focalLength}</span>
                            <span className="text-[#384764]">•</span>
                            <span className="rounded px-1.5 py-0.2 text-[8px] font-bold tracking-wider uppercase bg-[#6658F5]/20 text-[#C4BEFF] border border-[#6658F5]/35">
                              3D Previs
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Add Scene Button */}
        <div className="pt-2 pb-1">
          <button
            onClick={handleCreateNewScene}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#384764] bg-[#121A2A]/50 hover:bg-[#1A2436] hover:border-[#F0AE42]/60 py-2 font-mono text-[10.5px] text-[#D0D9E8] hover:text-white transition-all shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 text-[#F0AE42]" />
            <span className="font-semibold">+ Add New Scene</span>
          </button>
        </div>
      </div>

      {/* Project Info Section */}
      <div className="border-t border-[#273247] bg-[#121A2A] p-3 text-[11px]">
        <button
          onClick={() => setIsProjectInfoCollapsed(!isProjectInfoCollapsed)}
          className="flex w-full items-center justify-between text-[#98A5BC] hover:text-white font-medium mb-2"
        >
          <span className="font-display text-[11px] font-bold uppercase tracking-wider text-[#D5DFEE]">
            Project Info
          </span>
          {isProjectInfoCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-[#98A5BC]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[#98A5BC]" />
          )}
        </button>

        {!isProjectInfoCollapsed && (
          <div className="space-y-1.5 font-mono text-[10px] text-[#98A5BC]">
            <div className="flex justify-between">
              <span>Project</span>
              <span className="text-white font-sans font-semibold">Motion Previs</span>
            </div>
            <div className="flex justify-between">
              <span>Scenes / Shots</span>
              <span className="text-white">
                {scenes.length} sc · {totalShots} sh
              </span>
            </div>
            <div className="flex justify-between">
              <span>Resolution</span>
              <span className="text-white">{getResolutionForRatio(shot?.aspectRatio)}</span>
            </div>
            <div className="flex justify-between">
              <span>Frame Rate</span>
              <span className="text-white">{shot?.frameRate || 24} fps</span>
            </div>
            <div className="flex justify-between">
              <span>Total Duration</span>
              <span className="text-white">
                {formatProjectDuration(totalDurationSeconds)} ({totalDurationSeconds}s)
              </span>
            </div>
            <div className="flex justify-between">
              <span>Active Shot</span>
              <span className="text-[#F0AE42] font-semibold">
                {shot?.durationSeconds ?? 4}s · {shot?.camera?.lens?.focalLength ?? '35mm'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Date</span>
              <span className="text-white">{formattedDate}</span>
            </div>
          </div>
        )}

        {/* Status Badge */}
        <div className="mt-3 flex items-center justify-between rounded-lg bg-[#0F2924] border border-[#20C997]/35 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-[#20C997]">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="font-display text-[10px] font-bold">
              3D Previs Soundstage
            </span>
          </div>
          <span className="font-mono text-[9.5px] text-[#D0D9E8]">
            {shot.durationSeconds}s · {shot.camera.lens.focalLength}
          </span>
        </div>

        {/* Reset Demo Project Button */}
        <div className="mt-2.5 pt-2 border-t border-[#273247] flex justify-end">
          <button
            onClick={handleResetDemoScenes}
            className="flex items-center gap-1 font-mono text-[9.5px] text-[#98A5BC] hover:text-white transition-colors"
            title="Restore original demo scenes & shots"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset Demo Scenes</span>
          </button>
        </div>
      </div>
    </div>
  );
};
