import React, { useState, useEffect } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { logger } from '../stores/useLogStore';
import { ShotCreationMode, Actor, ShotSpec, createDefaultShotSpec, FocalLength, CINEMATIC_ENVIRONMENT_PRESETS } from '../types/shotspec';
import { compileReadyMadeMotionKeyframes } from '../engine/kinematics';
import { safeGetItem, safeSetItem, safeRemoveItem, STORAGE_KEYS } from '../services/storage';
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
  travelMode: 'auto' | 'travel' | 'in-place' = 'auto'
): Actor {
  const startPos = {
    x: actor.trajectory.startPosition.x ?? 50,
    y: actor.trajectory.startPosition.y ?? 50,
    z: 0,
  };
  const endPos = {
    x: actor.trajectory.endPosition.x ?? startPos.x,
    y: actor.trajectory.endPosition.y ?? startPos.y,
    z: 0,
  };
  const hasExplicitTravelTarget =
    travelMode === 'travel' && Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y) > 0.5;

  const compiled = compileReadyMadeMotionKeyframes(actor, clipId, {
    startTimeSec: 0,
    endTimeSec: durationSec,
    startPosition: startPos,
    targetPosition: hasExplicitTravelTarget ? endPos : undefined,
    startRotation: actor.rotation,
    travelMode,
  });

  // Ensure every keyframe stays grounded on the stage floor (z = 0) unless jumping
  const groundedKeyframes = compiled.keyframes.map((kf) => ({
    ...kf,
    position: {
      x: kf.position.x,
      y: kf.position.y,
      z: clipId === 'human-jump-leap' ? (kf.position.z ?? 0) : 0,
    },
  }));

  return {
    ...actor,
    actionDescription: actor.actionDescription || compiled.clip.promptPhrase,
    motionClip: compiled.clip.id,
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
          : { ...compiled.endPosition, z: 0 },
      keyframes: groundedKeyframes,
    },
  };
}

function getEnvPreset(id: string) {
  return CINEMATIC_ENVIRONMENT_PRESETS.find((p) => p.id === id)?.spec || CINEMATIC_ENVIRONMENT_PRESETS[0].spec;
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
    baseSpec.environment = getEnvPreset('env-cyberpunk-alley');
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 78, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 66, z: 9 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 48 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium-wide';
    baseSpec.lighting = {
      style: 'neon-cyberpunk',
      direction: 'side-key',
      contrast: 'high-contrast',
      lights: [
        { id: 'lgt-1', name: 'Cyan Alley Key', position: { x: 26, y: 58, z: 48 }, color: '#38bdf8', intensity: 3.4, enabled: true },
        { id: 'lgt-2', name: 'Magenta Neon Fill', position: { x: 74, y: 56, z: 44 }, color: '#ec4899', intensity: 3.0, enabled: true },
        { id: 'lgt-3', name: 'Warm Streetlamp Rim', position: { x: 50, y: 26, z: 62 }, color: '#fbbf24', intensity: 2.8, enabled: true },
      ],
    };

    // Agent Kael walks forward toward the camera down the center of the alley (y: 36 -> 54, facing +Z = 0 deg)
    const kael = withMotion(
      {
        id: 'actor-kael',
        name: 'Agent Kael',
        kind: 'human',
        color: '#3b82f6',
        token: 'cyberpunk operative in a charcoal trenchcoat walking forward down a neon-lit alley',
        actionDescription: 'walks forward with a natural steady stride down the neon alley',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 36, z: 0 }, endPosition: { x: 50, y: 54, z: 0 } },
      },
      'human-walk-forward',
      durNumber,
      'travel'
    );
    const interceptorCar = withMotion(
      {
        id: 'veh-interceptor',
        name: 'Interceptor Coupe',
        kind: 'car',
        color: '#06b6d4',
        scale: 1.0,
        token: 'sleek cyberpunk sports car parked on the left side of the alley',
        actionDescription: 'idles in place with glowing cyan headlights',
        rotation: { x: 0, y: 25, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 34, y: 44, z: 0 }, endPosition: { x: 34, y: 44, z: 0 } },
      },
      'veh-idle-rumble',
      durNumber,
      'in-place'
    );
    const cyberPine: Actor = {
      id: 'env-cyber-pine',
      name: 'Street Planter Tree',
      kind: 'tree',
      color: '#10b981',
      scale: 0.9,
      token: 'sculpted urban street tree on the right sidewalk',
      actionDescription: 'framing the right side of the alley',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 66, y: 42, z: 0 }, endPosition: { x: 66, y: 42, z: 0 } },
    };

    baseSpec.actors = [kael, interceptorCar, cyberPine];
    baseSpec.sceneDescription =
      'Cinematic dolly-in down a neon-lit cyberpunk alley as Agent Kael walks purposefully toward the camera past his parked Interceptor Coupe.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-01b') {
    baseSpec.environment = getEnvPreset('env-cyberpunk-alley');
    baseSpec.camera.movement.type = 'orbit-clockwise';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 62, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 60, y: 56, z: 10 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 50 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium-close-up';
    baseSpec.lighting = {
      style: 'neon-cyberpunk',
      direction: 'side-key',
      contrast: 'balanced',
      lights: [
        { id: 'lgt-1', name: 'Hologram Table Glow', position: { x: 50, y: 60, z: 36 }, color: '#38bdf8', intensity: 3.4, enabled: true },
        { id: 'lgt-2', name: 'Magenta Key Right', position: { x: 72, y: 50, z: 48 }, color: '#a855f7', intensity: 3.0, enabled: true },
        { id: 'lgt-3', name: 'Alley Backlight', position: { x: 50, y: 28, z: 58 }, color: '#f59e0b', intensity: 2.6, enabled: true },
      ],
    };

    const kael = withMotion(
      {
        id: 'actor-kael',
        name: 'Agent Kael',
        kind: 'human',
        color: '#3b82f6',
        token: 'cyberpunk operative standing on the left side of the terminal table',
        actionDescription: 'scans the surroundings alertly during the informant meeting',
        rotation: { x: 0, y: 90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 42, y: 50, z: 0 }, endPosition: { x: 42, y: 50, z: 0 } },
      },
      'human-look-search',
      durNumber,
      'in-place'
    );
    const cipher = withMotion(
      {
        id: 'actor-cipher',
        name: 'Cipher Informant',
        kind: 'human',
        color: '#a855f7',
        token: 'hooded informant standing on the right side of the table',
        actionDescription: 'signals and gestures toward Agent Kael across the table',
        rotation: { x: 0, y: -90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 58, y: 50, z: 0 }, endPosition: { x: 58, y: 50, z: 0 } },
      },
      'human-wave-greet',
      durNumber,
      'in-place'
    );
    const holoTable: Actor = {
      id: 'prop-holo-table',
      name: 'Holo-Terminal Table',
      kind: 'table',
      color: '#06b6d4',
      scale: 0.9,
      token: 'sleek briefing table between the two operatives',
      actionDescription: 'positioned at center stage between Kael and Cipher',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50, z: 0 }, endPosition: { x: 50, y: 50, z: 0 } },
    };

    baseSpec.actors = [kael, cipher, holoTable];
    baseSpec.sceneDescription =
      'Smooth 50mm orbital camera move around Agent Kael and the Cipher Informant as they exchange intelligence across a central briefing table.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-01c') {
    baseSpec.environment = getEnvPreset('env-cyberpunk-alley');
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'rapid-dynamic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 76, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 62, z: 9 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 48 };
    baseSpec.camera.angle = 'dutch-angle';
    baseSpec.camera.shotType = 'medium-wide';
    baseSpec.lighting = {
      style: 'neon-cyberpunk',
      direction: 'overhead-top',
      contrast: 'high-contrast',
      lights: [
        { id: 'lgt-1', name: 'Searchlight Beam', position: { x: 50, y: 55, z: 68 }, color: '#f43f5e', intensity: 3.5, enabled: true },
        { id: 'lgt-2', name: 'Cyan Rim Fill', position: { x: 28, y: 44, z: 45 }, color: '#06b6d4', intensity: 3.0, enabled: true },
      ],
    };

    const kael = withMotion(
      {
        id: 'actor-kael',
        name: 'Agent Kael',
        kind: 'human',
        color: '#3b82f6',
        token: 'operative in tactical stance aiming forward during ambush',
        actionDescription: 'raises weapon in a tactical stance and fires with recoil',
        rotation: { x: 0, y: 0, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 44, y: 48, z: 0 }, endPosition: { x: 44, y: 48, z: 0 } },
      },
      'human-aim-fire',
      durNumber,
      'in-place'
    );
    const cipher = withMotion(
      {
        id: 'actor-cipher',
        name: 'Cipher Informant',
        kind: 'human',
        color: '#a855f7',
        token: 'informant sneaking forward into cover on the right flank',
        actionDescription: 'sneaks forward in a low cautious stealth crouch',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 58, y: 42, z: 0 }, endPosition: { x: 58, y: 54, z: 0 } },
      },
      'human-sneak-prowl',
      durNumber,
      'travel'
    );
    const barricade: Actor = {
      id: 'prop-barricade',
      name: 'Security Barricade',
      kind: 'monolith',
      color: '#eab308',
      scale: 0.75,
      token: 'armored security pillar providing tactical cover',
      actionDescription: 'standing on stage left',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 34, y: 46, z: 0 }, endPosition: { x: 34, y: 46, z: 0 } },
    };

    baseSpec.actors = [kael, cipher, barricade];
    baseSpec.sceneDescription =
      'Dynamic Dutch-angle push-in as crimson searchlights sweep the alley; Agent Kael holds tactical cover while Cipher sneaks forward along the flank.';
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

  // ==========================================================================
  // SCENE 03: GOLDEN HOUR ROMANCE (Intimate Close-Ups, OTS Dialogue & Two-Shots)
  // ==========================================================================
  if (shotItem.id === 'shot-03a') {
    baseSpec.environment = getEnvPreset('env-modern-penthouse');
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 65, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 58, z: 10 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 48 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium';
    baseSpec.lighting = {
      style: 'golden-hour',
      direction: 'side-key',
      contrast: 'soft',
      lights: [
        { id: 'lgt-1', name: 'Sunset Golden Key', position: { x: 32, y: 58, z: 46 }, color: '#f59e0b', intensity: 3.5, enabled: true },
        { id: 'lgt-2', name: 'Warm Rose Fill', position: { x: 68, y: 58, z: 44 }, color: '#f472b6', intensity: 2.8, enabled: true },
        { id: 'lgt-3', name: 'Amber Hair Rim', position: { x: 50, y: 30, z: 56 }, color: '#fde047', intensity: 3.0, enabled: true },
      ],
    };

    const julian = withMotion(
      {
        id: 'actor-julian',
        name: 'Julian',
        kind: 'human',
        color: '#3b82f6',
        token: 'romantic lead in a tailored navy coat walking gently toward Elena at sunset',
        actionDescription: 'walks forward gently to meet Elena at center stage',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 42, y: 48, z: 0 }, endPosition: { x: 47.5, y: 48, z: 0 } },
      },
      'human-walk-forward',
      durNumber,
      'travel'
    );
    const elena = withMotion(
      {
        id: 'actor-elena',
        name: 'Elena',
        kind: 'human',
        color: '#ec4899',
        token: 'graceful heroine in a rose-silk evening dress walking toward Julian',
        actionDescription: 'walks forward warmly to meet Julian face to face',
        trajectory: { startTimeSeconds: 0, startPosition: { x: 58, y: 48, z: 0 }, endPosition: { x: 52.5, y: 48, z: 0 } },
      },
      'human-walk-forward',
      durNumber,
      'travel'
    );

    baseSpec.actors = [julian, elena];
    baseSpec.sceneDescription =
      'Romantic 50mm two-shot dolly-in across the golden-hour terrace as Julian and Elena walk toward each other and meet face-to-face.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-03b') {
    baseSpec.environment = getEnvPreset('env-modern-penthouse');
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 49, y: 57, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 50.5, y: 54.5, z: 10 };
    baseSpec.camera.movement.targetLookAt = { x: 52, y: 48 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'close-up';
    baseSpec.lighting = {
      style: 'golden-hour',
      direction: 'front-soft',
      contrast: 'soft',
      lights: [
        { id: 'lgt-1', name: 'Beauty Key Light', position: { x: 60, y: 58, z: 45 }, color: '#fde047', intensity: 3.5, enabled: true },
        { id: 'lgt-2', name: 'Soft Rose Cheek Fill', position: { x: 42, y: 56, z: 42 }, color: '#f472b6', intensity: 2.8, enabled: true },
        { id: 'lgt-3', name: 'Golden Backlight Rim', position: { x: 54, y: 36, z: 54 }, color: '#f59e0b', intensity: 3.2, enabled: true },
      ],
    };

    const elena = withMotion(
      {
        id: 'actor-elena',
        name: 'Elena',
        kind: 'human',
        color: '#ec4899',
        token: 'graceful heroine in rose-silk dress smiling and gesturing softly in close-up',
        actionDescription: 'waves and gestures warmly toward Julian in intimate close-up',
        rotation: { x: 0, y: -25, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 52, y: 48, z: 0 }, endPosition: { x: 52, y: 48, z: 0 } },
      },
      'human-wave-greet',
      durNumber,
      'in-place'
    );
    const julianOts = withMotion(
      {
        id: 'actor-julian',
        name: 'Julian (OTS Foreground)',
        kind: 'human',
        color: '#3b82f6',
        token: 'romantic lead in foreground left shoulder framing the over-the-shoulder shot',
        actionDescription: 'stands listening attentively in foreground over-the-shoulder framing',
        rotation: { x: 0, y: 155, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 46.5, y: 52, z: 0 }, endPosition: { x: 46.5, y: 52, z: 0 } },
      },
      'human-idle-breathe',
      durNumber,
      'in-place'
    );

    baseSpec.actors = [elena, julianOts];
    baseSpec.sceneDescription =
      'Intimate 85mm Over-The-Shoulder Close-Up on Elena as golden sunset light catches her face while she speaks to Julian.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-03c') {
    baseSpec.environment = getEnvPreset('env-modern-penthouse');
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 51, y: 57, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 49.5, y: 54.5, z: 10 };
    baseSpec.camera.movement.targetLookAt = { x: 48, y: 48 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'close-up';
    baseSpec.lighting = {
      style: 'golden-hour',
      direction: 'side-key',
      contrast: 'soft',
      lights: [
        { id: 'lgt-1', name: 'Warm Sunset Key', position: { x: 38, y: 58, z: 45 }, color: '#f59e0b', intensity: 3.5, enabled: true },
        { id: 'lgt-2', name: 'Twilight Lavender Fill', position: { x: 60, y: 56, z: 42 }, color: '#c084fc', intensity: 2.8, enabled: true },
        { id: 'lgt-3', name: 'Shoulder Rim Glow', position: { x: 46, y: 36, z: 54 }, color: '#fde047', intensity: 3.0, enabled: true },
      ],
    };

    const julian = withMotion(
      {
        id: 'actor-julian',
        name: 'Julian',
        kind: 'human',
        color: '#3b82f6',
        token: 'romantic lead speaking earnestly in an intimate 85mm close-up',
        actionDescription: 'looks intently at Elena with gentle head movement during his confession',
        rotation: { x: 0, y: 25, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 48, y: 48, z: 0 }, endPosition: { x: 48, y: 48, z: 0 } },
      },
      'human-look-search',
      durNumber,
      'in-place'
    );
    const elenaOts = withMotion(
      {
        id: 'actor-elena',
        name: 'Elena (OTS Foreground)',
        kind: 'human',
        color: '#ec4899',
        token: 'heroine in foreground right framing the reverse over-the-shoulder close-up',
        actionDescription: 'stands close in the right foreground listening to Julian',
        rotation: { x: 0, y: -155, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 53.5, y: 52, z: 0 }, endPosition: { x: 53.5, y: 52, z: 0 } },
      },
      'human-idle-breathe',
      durNumber,
      'in-place'
    );

    baseSpec.actors = [julian, elenaOts];
    baseSpec.sceneDescription =
      'Reverse 85mm Over-The-Shoulder Close-Up on Julian as he confesses his feelings to Elena in warm golden-hour light.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-03d') {
    baseSpec.environment = getEnvPreset('env-rustic-hearth');
    baseSpec.camera.movement.type = 'truck-right';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 48.5, y: 55.5, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 51.5, y: 55.5, z: 10 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 49 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'extreme-close-up';
    baseSpec.lighting = {
      style: 'practical-candlelight',
      direction: 'front-soft',
      contrast: 'soft',
      lights: [
        { id: 'lgt-1', name: 'Candlelight Face Glow', position: { x: 50, y: 56, z: 42 }, color: '#fb923c', intensity: 3.5, enabled: true },
        { id: 'lgt-2', name: 'Rose Amber Rim', position: { x: 50, y: 38, z: 48 }, color: '#f472b6', intensity: 3.0, enabled: true },
      ],
    };

    const julian = withMotion(
      {
        id: 'actor-julian',
        name: 'Julian',
        kind: 'human',
        color: '#3b82f6',
        token: 'romantic lead standing inches from Elena in profile extreme close-up',
        actionDescription: 'stands inches from Elena with gentle breathing in tight profile close-up',
        rotation: { x: 0, y: 75, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 48.4, y: 49, z: 0 }, endPosition: { x: 48.4, y: 49, z: 0 } },
      },
      'human-idle-breathe',
      durNumber,
      'in-place'
    );
    const elena = withMotion(
      {
        id: 'actor-elena',
        name: 'Elena',
        kind: 'human',
        color: '#ec4899',
        token: 'heroine standing inches from Julian in profile extreme close-up',
        actionDescription: 'gazes into Julian eyes in an intimate profile extreme close-up',
        rotation: { x: 0, y: -75, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 51.6, y: 49, z: 0 }, endPosition: { x: 51.6, y: 49, z: 0 } },
      },
      'human-idle-breathe',
      durNumber,
      'in-place'
    );

    baseSpec.actors = [julian, elena];
    baseSpec.sceneDescription =
      'Ultra-intimate 135mm Extreme Close-Up profile two-shot as Julian and Elena stand inches apart by flickering firelight.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-03e') {
    baseSpec.environment = getEnvPreset('env-rustic-hearth');
    baseSpec.camera.movement.type = 'orbit-counter-clockwise';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 61, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 42, y: 58, z: 10 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 50 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium-close-up';
    baseSpec.lighting = {
      style: 'practical-candlelight',
      direction: 'side-key',
      contrast: 'balanced',
      lights: [
        { id: 'lgt-1', name: 'Hearth Warm Key', position: { x: 50, y: 36, z: 44 }, color: '#f97316', intensity: 3.6, enabled: true },
        { id: 'lgt-2', name: 'Table Candle Glow', position: { x: 50, y: 58, z: 38 }, color: '#fde047', intensity: 3.0, enabled: true },
      ],
    };

    const julian = withMotion(
      {
        id: 'actor-julian',
        name: 'Julian',
        kind: 'human',
        color: '#3b82f6',
        token: 'romantic lead conversing across a candlelit table',
        actionDescription: 'gestures warmly across the candlelit table toward Elena',
        rotation: { x: 0, y: 90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 44, y: 50, z: 0 }, endPosition: { x: 44, y: 50, z: 0 } },
      },
      'human-wave-greet',
      durNumber,
      'in-place'
    );
    const elena = withMotion(
      {
        id: 'actor-elena',
        name: 'Elena',
        kind: 'human',
        color: '#ec4899',
        token: 'heroine smiling across the candlelit dinner table',
        actionDescription: 'looks fondly across the table at Julian',
        rotation: { x: 0, y: -90, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 56, y: 50, z: 0 }, endPosition: { x: 56, y: 50, z: 0 } },
      },
      'human-look-search',
      durNumber,
      'in-place'
    );
    const bistroTable: Actor = {
      id: 'prop-bistro-table',
      name: 'Candlelit Bistro Table',
      kind: 'table',
      color: '#eab308',
      scale: 0.85,
      token: 'intimate wooden bistro table between Julian and Elena',
      actionDescription: 'placed at center stage between the couple',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50, z: 0 }, endPosition: { x: 50, y: 50, z: 0 } },
    };

    baseSpec.actors = [julian, elena, bistroTable];
    baseSpec.sceneDescription =
      'Warm 85mm Medium-Close-Up orbital move around Julian and Elena sharing an intimate conversation across a candlelit table.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-03f') {
    baseSpec.environment = getEnvPreset('env-misty-forest');
    baseSpec.camera.movement.type = 'dolly-out';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 58, z: 10 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 70, z: 11 };
    baseSpec.camera.movement.targetLookAt = { x: 50, y: 49 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium-close-up';
    baseSpec.lighting = {
      style: 'moonlight-foggy',
      direction: 'rim-backlit',
      contrast: 'soft',
      lights: [
        { id: 'lgt-1', name: 'Starlight Silver Rim', position: { x: 50, y: 34, z: 60 }, color: '#93c5fd', intensity: 3.5, enabled: true },
        { id: 'lgt-2', name: 'Warm Lantern Fill', position: { x: 44, y: 60, z: 42 }, color: '#fbbf24', intensity: 3.0, enabled: true },
        { id: 'lgt-3', name: 'Rose Moonlight Glow', position: { x: 58, y: 58, z: 44 }, color: '#f472b6', intensity: 2.8, enabled: true },
      ],
    };

    const julian = withMotion(
      {
        id: 'actor-julian',
        name: 'Julian',
        kind: 'human',
        color: '#3b82f6',
        token: 'romantic lead celebrating with Elena under the starlit forest canopy',
        actionDescription: 'raises arms in joyful celebration beside Elena',
        rotation: { x: 0, y: 15, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 47.5, y: 49, z: 0 }, endPosition: { x: 47.5, y: 49, z: 0 } },
      },
      'human-victory-cheer',
      durNumber,
      'in-place'
    );
    const elena = withMotion(
      {
        id: 'actor-elena',
        name: 'Elena',
        kind: 'human',
        color: '#ec4899',
        token: 'heroine waving joyfully beside Julian under the stars',
        actionDescription: 'waves warmly beside Julian as the camera pulls back',
        rotation: { x: 0, y: -15, z: 0 },
        trajectory: { startTimeSeconds: 0, startPosition: { x: 52.5, y: 49, z: 0 }, endPosition: { x: 52.5, y: 49, z: 0 } },
      },
      'human-wave-greet',
      durNumber,
      'in-place'
    );

    baseSpec.actors = [julian, elena];
    baseSpec.sceneDescription =
      'Poetic 50mm pull-back starting in a Medium-Close-Up on Julian and Elena and widening out into the starlit forest clearing.';
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

export const BUILTIN_DEMO_VERSION = 'studio-demo-3x6-v3';
const DEMO_VERSION_STORAGE_KEY = 'comfy_ai_director_demo_version_v1';

export const DEFAULT_SCENES: SceneItem[] = [
  {
    id: 'scene-1',
    name: 'Scene 01 - Neon Protocol',
    shots: [
      {
        id: 'shot-01a',
        code: 'Shot 01A',
        title: 'Rain Alley Arrival',
        duration: '5s',
        focalLength: '35mm',
        movement: 'Crane Down Reveal',
        thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-01b',
        code: 'Shot 01B',
        title: 'The Informant Handoff',
        duration: '5s',
        focalLength: '50mm',
        movement: '360° Orbit Tension',
        thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-01c',
        code: 'Shot 01C',
        title: 'Rooftop Drone Ambush',
        duration: '4s',
        focalLength: '35mm',
        movement: 'Dutch Push-In',
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
  {
    id: 'scene-3',
    name: 'Scene 03 - Golden Hour Romance',
    shots: [
      {
        id: 'shot-03a',
        code: 'Shot 03A',
        title: 'Sunset Terrace Meet',
        duration: '5s',
        focalLength: '50mm',
        movement: 'Two-Shot Dolly In',
        thumbnail: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-03b',
        code: 'Shot 03B',
        title: 'Her Eyes (OTS Close-Up)',
        duration: '5s',
        focalLength: '85mm',
        movement: 'Close-Up Push-In',
        thumbnail: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-03c',
        code: 'Shot 03C',
        title: 'His Confession (Close-Up)',
        duration: '5s',
        focalLength: '85mm',
        movement: 'Reverse OTS Close-Up',
        thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-03d',
        code: 'Shot 03D',
        title: 'Whispered Promise (ECU)',
        duration: '5s',
        focalLength: '135mm',
        movement: 'Extreme Close-Up Drift',
        thumbnail: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-03e',
        code: 'Shot 03E',
        title: 'Candlelight Dialogue (MCU)',
        duration: '5s',
        focalLength: '85mm',
        movement: 'Intimate Orbit MCU',
        thumbnail: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-03f',
        code: 'Shot 03F',
        title: 'Starlight Embrace Finale',
        duration: '6s',
        focalLength: '50mm',
        movement: 'MCU Pull-Back Reveal',
        thumbnail: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=160&q=80&auto=format&fit=crop',
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

  // Hydrate initial Shot 01A showcase scene when starting from generic fallback
  useEffect(() => {
    const current = useShotStore.getState().shot;
    const firstScene = scenes[0];
    const firstShotItem = firstScene?.shots?.[0];
    if (
      firstShotItem &&
      current.id === 'shot-01a' &&
      current.actors.length === 1 &&
      current.actors[0]?.id === 'actor-1'
    ) {
      const built = buildDefaultShotSpec(firstShotItem);
      useShotStore.getState().loadShot(built);
      if (onSelectShot) {
        onSelectShot(firstShotItem.id, firstShotItem.code, firstScene.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist scenes to localStorage
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SCENES, scenes);
  }, [scenes]);

  // Sync active shot duration & focal length to Left Panel card, and keep shot.name aligned with card's main name (code)
  useEffect(() => {
    if (!shot?.id) return;
    const durationStr = `${shot.durationSeconds || 4}s`;
    const focalStr = shot.camera?.lens?.focalLength || '35mm';

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
  }, [shot?.id, shot?.durationSeconds, shot?.camera?.lens?.focalLength]);

  // Keep global shot.name synced with the active card's main name (code)
  useEffect(() => {
    if (!shot?.id) return;
    for (const sc of scenes) {
      const found = sc.shots.find((sh) => sh.id === shot.id);
      if (found && shot.name !== found.code) {
        updateShotName(found.code);
        break;
      }
    }
  }, [shot?.id, scenes, shot?.name, updateShotName]);

  const toggleScene = (sceneId: string) => {
    setCollapsedScenes((prev) => ({ ...prev, [sceneId]: !prev[sceneId] }));
  };

  const handleSelectShot = (shotItem: SceneItem['shots'][0]) => {
    const parentScene = scenes.find((s) => s.shots.some((sh) => sh.id === shotItem.id));
    if (onSelectShot) onSelectShot(shotItem.id, shotItem.code, parentScene?.name);
    switchShot(shotItem.id, () => buildDefaultShotSpec(shotItem));
    updateShotName(shotItem.code);
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

    const updatedScenes = scenes.map((s) =>
      s.id === sceneId ? { ...s, shots: [...s.shots, duplicatedShot] } : s
    );

    setScenes(updatedScenes);
    handleSelectShot(duplicatedShot);
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
