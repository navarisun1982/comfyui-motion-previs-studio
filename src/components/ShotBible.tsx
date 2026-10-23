import React, { useState, useEffect } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { logger } from '../stores/useLogStore';
import { ShotCreationMode, Actor, ShotSpec, createDefaultShotSpec, FocalLength } from '../types/shotspec';
import { safeGetItem, safeSetItem, safeRemoveItem, STORAGE_KEYS } from '../services/storage';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  MoreVertical,
  CheckCircle2,
  FolderOpen,
  Box,
  Video,
  Sparkles,
  X,
  Trash2,
  Copy,
  RotateCcw,
  Film,
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

export const buildDefaultShotSpec = (shotItem: ShotBibleItem): ShotSpec => {
  const fullTitle = `${shotItem.code} ${shotItem.title}`;
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
    creationMode: shotItem.mode || 'construct-3d',
    durationSeconds: durNumber,
  });

  baseSpec.camera.lens.focalLength = focalLength;

  if (shotItem.id === 'shot-01a') {
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 85, z: 20 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 55, z: 20 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium';
    baseSpec.lighting = { style: 'low-key-film-noir', direction: 'rim-backlit', contrast: 'balanced' };
    const det: Actor = {
      id: 'actor-det',
      name: 'Lead Detective',
      kind: 'human',
      token: 'a seasoned detective in a dark trench coat',
      actionDescription: 'walking forward through the damp rain',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } },
    };
    baseSpec.actors = [det];
    baseSpec.sceneDescription = 'A lone detective walking through a rain-slicked alleyway under flickering neon signs.';
    baseSpec.creationMode = 'video-plate';
    return baseSpec;
  }

  if (shotItem.id === 'shot-01b') {
    baseSpec.camera.movement.type = 'pan-right';
    baseSpec.camera.movement.speed = 'moderate';
    baseSpec.camera.movement.startPosition = { x: 40, y: 70, z: 25 };
    baseSpec.camera.movement.endPosition = { x: 60, y: 70, z: 25 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'wide';
    baseSpec.lighting = { style: 'neon-cyberpunk', direction: 'side-key', contrast: 'balanced' };
    const det: Actor = {
      id: 'actor-det',
      name: 'Lead Detective',
      kind: 'human',
      token: 'a detective scanning the sidewalk',
      actionDescription: 'pauses and turns right',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 45, y: 48 }, endPosition: { x: 45, y: 48 } },
    };
    const tree: Actor = {
      id: 'actor-tree-1',
      name: 'Urban Tree',
      kind: 'tree',
      token: 'a stylized wet pine tree on the curb',
      actionDescription: 'swaying gently in the city breeze',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 65, y: 45 }, endPosition: { x: 65, y: 45 } },
    };
    baseSpec.actors = [det, tree];
    baseSpec.sceneDescription = 'Cyberpunk urban sidewalk with wet asphalt and holographic reflections.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-01c') {
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 90, z: 15 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 40, z: 15 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'close-up';
    baseSpec.lighting = { style: 'cinematic-natural', direction: 'side-key', contrast: 'balanced' };
    const det: Actor = {
      id: 'actor-det',
      name: 'Lead Detective',
      kind: 'human',
      token: 'detective with focused piercing eyes',
      actionDescription: 'stares directly into camera',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } },
    };
    baseSpec.actors = [det];
    baseSpec.sceneDescription = "Intense close-up of detective's focused eyes as headlights sweep across the face.";
    return baseSpec;
  }

  if (shotItem.id === 'shot-01d') {
    baseSpec.camera.movement.type = 'pedestal-up';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 75, z: 5 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 75, z: 35 };
    baseSpec.camera.angle = 'low-angle';
    baseSpec.camera.shotType = 'medium-wide';
    baseSpec.lighting = { style: 'low-key-film-noir', direction: 'underlit-dramatic', contrast: 'balanced' };
    const det: Actor = {
      id: 'actor-det',
      name: 'Lead Detective',
      kind: 'human',
      token: 'detective standing over shipping crates',
      actionDescription: 'observing the freight yard',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 48, y: 50 }, endPosition: { x: 48, y: 50 } },
    };
    const crate: Actor = {
      id: 'prop-crate',
      name: 'Cargo Crate',
      kind: 'prop',
      token: 'industrial shipping freight container',
      actionDescription: 'stacked on the warehouse tarmac',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 58, y: 52 }, endPosition: { x: 58, y: 52 } },
    };
    baseSpec.actors = [det, crate];
    baseSpec.sceneDescription = 'Low angle looking up from the alley floor past industrial cargo crates.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-01e') {
    baseSpec.camera.movement.type = 'truck-right';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 35, y: 65, z: 20 };
    baseSpec.camera.movement.endPosition = { x: 65, y: 65, z: 20 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium';
    baseSpec.lighting = { style: 'cinematic-natural', direction: 'rim-backlit', contrast: 'balanced' };
    const det: Actor = {
      id: 'actor-det',
      name: 'Detective',
      kind: 'human',
      token: 'detective holding confidential envelope',
      actionDescription: 'facing informant',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 40, y: 50 }, endPosition: { x: 40, y: 50 } },
    };
    const inf: Actor = {
      id: 'actor-inf',
      name: 'Informant',
      kind: 'human',
      token: 'mysterious informant in dark leather jacket',
      actionDescription: 'whispering confidential intel',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 60, y: 50 }, endPosition: { x: 60, y: 50 } },
    };
    baseSpec.actors = [det, inf];
    baseSpec.sceneDescription = 'Two figures meeting in shadow, silhouettes rimmed in sodium vapor light.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-02a') {
    baseSpec.camera.movement.type = 'truck-right';
    baseSpec.camera.movement.speed = 'rapid-dynamic';
    baseSpec.camera.movement.startPosition = { x: 30, y: 70, z: 20 };
    baseSpec.camera.movement.endPosition = { x: 70, y: 70, z: 20 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'wide';
    baseSpec.lighting = { style: 'golden-hour', direction: 'side-key', contrast: 'balanced' };
    const car1: Actor = {
      id: 'car-1',
      name: 'Hero Interceptor',
      kind: 'car',
      token: 'matte black pursuit interceptor muscle car',
      actionDescription: 'accelerating aggressively',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 42, y: 55 }, endPosition: { x: 42, y: 38 } },
    };
    const car2: Actor = {
      id: 'car-2',
      name: 'Fleeing Sedan',
      kind: 'car',
      token: 'silver getaway sedan with smoking tires',
      actionDescription: 'swerving to evade pursuit',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 58, y: 65 }, endPosition: { x: 58, y: 48 } },
    };
    baseSpec.actors = [car1, car2];
    baseSpec.sceneDescription = 'Two high-speed vehicles tearing down a wide coastal highway in low golden sunset.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-02b') {
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'moderate';
    baseSpec.camera.movement.startPosition = { x: 50, y: 80, z: 12 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 50, z: 12 };
    baseSpec.camera.angle = 'low-angle';
    baseSpec.camera.shotType = 'medium-wide';
    baseSpec.lighting = { style: 'golden-hour', direction: 'overhead-top', contrast: 'balanced' };
    const carLead: Actor = {
      id: 'car-lead',
      name: 'Fleeing Sedan',
      kind: 'car',
      token: 'silver getaway sedan braking hard',
      actionDescription: 'approaching roadblock obstacle',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 68 }, endPosition: { x: 50, y: 48 } },
    };
    const b1: Actor = {
      id: 'prop-barrier-1',
      name: 'Roadblock Crate A',
      kind: 'prop',
      token: 'industrial steel barrier container',
      actionDescription: 'blocking the road',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 44, y: 35 }, endPosition: { x: 44, y: 35 } },
    };
    const b2: Actor = {
      id: 'prop-barrier-2',
      name: 'Roadblock Crate B',
      kind: 'prop',
      token: 'industrial hazard crate barrier',
      actionDescription: 'blocking the road',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 56, y: 35 }, endPosition: { x: 56, y: 35 } },
    };
    baseSpec.actors = [carLead, b1, b2];
    baseSpec.sceneDescription = 'Speeding car approaching a barricade of industrial shipping crates on the highway.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-03a') {
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 85, z: 18 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 55, z: 18 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium';
    baseSpec.lighting = { style: 'low-key-film-noir', direction: 'overhead-top', contrast: 'balanced' };
    const tbl: Actor = {
      id: 'tbl-1',
      name: 'War Room Table',
      kind: 'table',
      token: 'worn wooden war room table with maps',
      actionDescription: 'center of the hideout room',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 48 }, endPosition: { x: 50, y: 48 } },
    };
    const chr: Actor = {
      id: 'chr-1',
      name: 'Leather Chair',
      kind: 'chair',
      token: 'vintage brown leather armchair',
      actionDescription: 'pulled up to the war room table',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 40 }, endPosition: { x: 50, y: 40 } },
    };
    const prp: Actor = {
      id: 'prp-1',
      name: 'Munitions Crate',
      kind: 'prop',
      token: 'military equipment storage container',
      actionDescription: 'resting against the wall',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 64, y: 52 }, endPosition: { x: 64, y: 52 } },
    };
    const boss: Actor = {
      id: 'act-boss',
      name: 'Syndicate Boss',
      kind: 'human',
      token: 'syndicate boss in dark tailored suit',
      actionDescription: 'standing contemplatively beside the table',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 38, y: 48 }, endPosition: { x: 38, y: 48 } },
    };
    baseSpec.actors = [tbl, chr, prp, boss];
    baseSpec.sceneDescription = 'Dimly lit clandestine warehouse office with dust motes drifting through a single hanging lightbulb.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-03b') {
    baseSpec.camera.movement.type = 'orbit-clockwise';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 35, y: 65, z: 20 };
    baseSpec.camera.movement.endPosition = { x: 65, y: 65, z: 20 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'close-up';
    baseSpec.lighting = { style: 'low-key-film-noir', direction: 'side-key', contrast: 'balanced' };
    const tbl: Actor = {
      id: 'tbl-int',
      name: 'Interrogation Table',
      kind: 'table',
      token: 'cold steel interrogation table',
      actionDescription: 'separating investigator and subject',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } },
    };
    const inv: Actor = {
      id: 'act-inv',
      name: 'Lead Detective',
      kind: 'human',
      token: 'hardened investigator leaning in',
      actionDescription: 'demanding answers across table',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 60 }, endPosition: { x: 50, y: 60 } },
    };
    const spy: Actor = {
      id: 'act-spy',
      name: 'Captured Suspect',
      kind: 'human',
      token: 'unshaven suspect in handcuffs',
      actionDescription: 'refusing to talk',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 40 }, endPosition: { x: 50, y: 40 } },
    };
    baseSpec.actors = [tbl, inv, spy];
    baseSpec.sceneDescription = 'Tense confrontation across an interrogation table, sharp shadows cast across faces.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-04a') {
    baseSpec.camera.movement.type = 'dolly-in';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 50, y: 90, z: 25 };
    baseSpec.camera.movement.endPosition = { x: 50, y: 45, z: 25 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'medium-wide';
    baseSpec.lighting = { style: 'moonlight-foggy', direction: 'rim-backlit', contrast: 'balanced' };
    const t1: Actor = {
      id: 'tree-hero-1',
      name: 'Ancient Pine Left',
      kind: 'tree',
      token: 'massive ancient evergreen pine tree',
      actionDescription: 'framing the left edge of frame',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 32, y: 45 }, endPosition: { x: 32, y: 45 } },
    };
    const t2: Actor = {
      id: 'tree-hero-2',
      name: 'Towering Spruce Right',
      kind: 'tree',
      token: 'tall spruce tree with thick dark needle foliage',
      actionDescription: 'framing the right edge of frame',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 68, y: 45 }, endPosition: { x: 68, y: 45 } },
    };
    const w: Actor = {
      id: 'act-wanderer',
      name: 'Hero Wanderer',
      kind: 'human',
      token: 'cloaked wanderer looking out toward the mountain edge',
      actionDescription: 'standing at the edge of the overlook',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } },
    };
    baseSpec.actors = [t1, t2, w];
    baseSpec.sceneDescription = 'Dramatic vertigo reveal between deep forest pines as mist rolls over the precipice.';
    return baseSpec;
  }

  if (shotItem.id === 'shot-04b') {
    baseSpec.camera.movement.type = 'pan-left';
    baseSpec.camera.movement.speed = 'slow-cinematic';
    baseSpec.camera.movement.startPosition = { x: 60, y: 75, z: 20 };
    baseSpec.camera.movement.endPosition = { x: 40, y: 75, z: 20 };
    baseSpec.camera.angle = 'eye-level';
    baseSpec.camera.shotType = 'wide';
    baseSpec.lighting = { style: 'moonlight-foggy', direction: 'side-key', contrast: 'balanced' };
    const t1: Actor = {
      id: 'tree-bg-1',
      name: 'Forest Pine A',
      kind: 'tree',
      token: 'evergreen pine',
      actionDescription: 'standing in wilderness',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 30, y: 40 }, endPosition: { x: 30, y: 40 } },
    };
    const t2: Actor = {
      id: 'tree-bg-2',
      name: 'Forest Pine B',
      kind: 'tree',
      token: 'conical pine tree',
      actionDescription: 'standing in wilderness',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 52, y: 35 }, endPosition: { x: 52, y: 35 } },
    };
    const t3: Actor = {
      id: 'tree-bg-3',
      name: 'Forest Pine C',
      kind: 'tree',
      token: 'tall evergreen spruce',
      actionDescription: 'standing in wilderness',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 72, y: 42 }, endPosition: { x: 72, y: 42 } },
    };
    const overland: Actor = {
      id: 'car-overland',
      name: 'Expedition 4x4',
      kind: 'car',
      token: 'rugged matte overland 4x4 truck with roof rack',
      actionDescription: 'parked in the clearing',
      trajectory: { startTimeSeconds: 0, startPosition: { x: 48, y: 55 }, endPosition: { x: 48, y: 55 } },
    };
    baseSpec.actors = [t1, t2, t3, overland];
    baseSpec.sceneDescription = 'Expedition truck parked in the quiet misty pine woods under moonlight.';
    return baseSpec;
  }

  // Fallback default
  const defaultActor: Actor = {
    id: `actor-${Date.now()}`,
    name: 'Lead Subject',
    kind: 'human',
    token: 'a dramatic subject in the spotlight',
    actionDescription: 'stands at center stage',
    trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } },
  };
  baseSpec.actors = [defaultActor];
  return baseSpec;
};

const DEFAULT_SCENES: SceneItem[] = [
  {
    id: 'scene-1',
    name: 'Scene 01 - Arrival',
    shots: [
      {
        id: 'shot-01a',
        code: 'Shot 01A',
        title: 'Tracking In',
        duration: '4s',
        focalLength: '35mm',
        movement: 'Tracking In',
        thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=160&q=80&auto=format&fit=crop',
        mode: 'video-plate',
      },
      {
        id: 'shot-01b',
        code: 'Shot 01B',
        title: 'Pan Right',
        duration: '5s',
        focalLength: '24mm',
        movement: 'Pan Right',
        thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-01c',
        code: 'Shot 01C',
        title: 'Push In',
        duration: '3s',
        focalLength: '50mm',
        movement: 'Push In',
        thumbnail: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-01d',
        code: 'Shot 01D',
        title: 'Low Angle',
        duration: '4s',
        focalLength: '35mm',
        movement: 'Low Angle',
        thumbnail: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-01e',
        code: 'Shot 01E',
        title: 'Over Shoulder',
        duration: '5s',
        focalLength: '24mm',
        movement: 'Over Shoulder',
        thumbnail: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
    ],
  },
  {
    id: 'scene-2',
    name: 'Scene 02 - Chase',
    shots: [
      {
        id: 'shot-02a',
        code: 'Shot 02A',
        title: 'High Speed Follow',
        duration: '4s',
        focalLength: '24mm',
        movement: 'Tracking Lateral',
        thumbnail: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-02b',
        code: 'Shot 02B',
        title: 'Roadblock Ahead',
        duration: '5s',
        focalLength: '35mm',
        movement: 'Dolly In (Obstacle)',
        thumbnail: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
    ],
  },
  {
    id: 'scene-3',
    name: 'Scene 03 - Hideout',
    shots: [
      {
        id: 'shot-03a',
        code: 'Shot 03A',
        title: 'Atmospheric Reveal',
        duration: '6s',
        focalLength: '50mm',
        movement: 'Slow Dolly In',
        thumbnail: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-03b',
        code: 'Shot 03B',
        title: 'Interrogation Over Table',
        duration: '5s',
        focalLength: '35mm',
        movement: 'Orbit Confrontation',
        thumbnail: 'https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
    ],
  },
  {
    id: 'scene-4',
    name: 'Scene 04 - Reveal',
    shots: [
      {
        id: 'shot-04a',
        code: 'Shot 04A',
        title: 'Hero Dolly Zoom',
        duration: '4s',
        focalLength: '85mm',
        movement: 'Vertigo Zoom',
        thumbnail: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
      {
        id: 'shot-04b',
        code: 'Shot 04B',
        title: 'Deep Pine Wilderness',
        duration: '5s',
        focalLength: '24mm',
        movement: 'Pan Left Overlook',
        thumbnail: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=160&q=80&auto=format&fit=crop',
        mode: 'construct-3d',
      },
    ],
  },
];

const loadSavedScenes = (): SceneItem[] => {
  try {
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
  onAssembleScene?: (scene: SceneItem) => void;
}

export const ShotBible: React.FC<ShotBibleProps> = ({
  activeShotId = 'shot-01a',
  onSelectShot,
  onAssembleScene,
}) => {
  const { switchShot, shot } = useShotStore();
  const [scenes, setScenes] = useState<SceneItem[]>(loadSavedScenes);
  const [collapsedScenes, setCollapsedScenes] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isProjectInfoCollapsed, setIsProjectInfoCollapsed] = useState(false);
  const [showNewShotModal, setShowNewShotModal] = useState(false);
  const [targetSceneId, setTargetSceneId] = useState<string>('scene-1');
  const [openMenuShotId, setOpenMenuShotId] = useState<string | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
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

  // Persist scenes to localStorage
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.SCENES, scenes);
  }, [scenes]);

  const toggleScene = (sceneId: string) => {
    setCollapsedScenes((prev) => ({ ...prev, [sceneId]: !prev[sceneId] }));
  };

  const handleSelectShot = (shotItem: SceneItem['shots'][0]) => {
    const fullTitle = `${shotItem.code} ${shotItem.title}`;
    const parentScene = scenes.find((s) => s.shots.some((sh) => sh.id === shotItem.id));
    if (onSelectShot) onSelectShot(shotItem.id, fullTitle, parentScene?.name);
    switchShot(shotItem.id, () => buildDefaultShotSpec(shotItem));
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

  const handleCreateShotWithMode = (mode: ShotCreationMode) => {
    const targetScene = scenes.find((s) => s.id === targetSceneId) || scenes[0];
    if (!targetScene) return;
    const newShotNum = targetScene.shots.length + 1;
    const letter = String.fromCharCode(64 + newShotNum);
    const scenePrefixMatch = targetScene.name.match(/\b(?:Scene\s*)?(\d+)/i);
    const sceneNumStr = scenePrefixMatch ? String(scenePrefixMatch[1]).padStart(2, '0') : '01';
    const is3D = mode === 'construct-3d';
    const newShot: ShotBibleItem = {
      id: `shot-${sceneNumStr}${letter.toLowerCase()}-${Date.now().toString(36)}`,
      code: `Shot ${sceneNumStr}${letter}`,
      title: is3D ? '3D Stage Previs' : 'VFX Motion Plate',
      duration: is3D ? '4s' : '5s',
      focalLength: is3D ? '35mm' : '50mm',
      movement: is3D ? 'Orbit / Track' : 'Dolly In (Solved)',
      thumbnail: is3D
        ? 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=160&q=80&auto=format&fit=crop'
        : 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=160&q=80&auto=format&fit=crop',
      mode,
    };

    setScenes((prev) =>
      prev.map((sc) => (sc.id === targetScene.id ? { ...sc, shots: [...sc.shots, newShot] } : sc))
    );
    setShowNewShotModal(false);
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

  const handleResetDemoScenes = () => {
    if (window.confirm('Reset all scenes and shots back to default demo project?')) {
      setScenes(DEFAULT_SCENES);
      safeRemoveItem(STORAGE_KEYS.SCENES);
      handleSelectShot(DEFAULT_SCENES[0].shots[0]);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#0b0d13] text-slate-200 select-none relative">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="font-display text-xs font-bold tracking-wider text-white">Shot Bible</span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
            {scenes.reduce((acc, sc) => acc + sc.shots.length, 0)} shots
          </span>
        </div>
        <button
          onClick={() => {
            setTargetSceneId(scenes[0]?.id || 'scene-1');
            setShowNewShotModal(true);
          }}
          className="flex items-center gap-1 rounded bg-blue-600/80 hover:bg-blue-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm transition-all active:scale-95"
          title="Add New Shot"
        >
          <Plus className="h-3 w-3" />
          <span>Add Shot</span>
        </button>
      </div>

      {/* Search Input */}
      {noticeMessage && (
        <div className="mx-3 mt-2 p-2 rounded bg-amber-500/15 border border-amber-500/30 text-amber-200 text-[10px] font-mono flex items-center justify-between gap-1.5">
          <span>{noticeMessage}</span>
          <button
            onClick={() => setNoticeMessage(null)}
            className="text-amber-400 hover:text-white px-1 py-0.5 rounded hover:bg-amber-500/20"
            title="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2 rounded-md bg-[#13161f] px-2.5 py-1.5 border border-white/5">
          <Search className="h-3 w-3 text-slate-500 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search shots..."
            className="w-full bg-transparent text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Scenes List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {scenes.map((scene) => {
          const isCollapsed = !!collapsedScenes[scene.id];
          const filteredShots = scene.shots.filter(
            (s) =>
              s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
              s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
              s.movement.toLowerCase().includes(searchQuery.toLowerCase())
          );

          return (
            <div key={scene.id} className="space-y-0.5">
              {/* Scene Accordion Header with Inline Rename & Delete */}
              <div className="group/scene flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] font-semibold text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors">
                <div
                  onClick={() => toggleScene(scene.id)}
                  className="flex flex-1 items-center gap-1.5 cursor-pointer min-w-0 py-0.5"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-slate-500 shrink-0" />
                  )}
                  <FolderOpen className="h-3 w-3 text-slate-500 shrink-0" />
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
                      className="bg-black/60 border border-blue-500 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none w-36"
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingSceneId(scene.id);
                      }}
                      className="truncate"
                      title="Double-click to rename scene"
                    >
                      {scene.name}
                    </span>
                  )}
                  <span className="font-mono text-[9px] text-slate-500 shrink-0">
                    ({scene.shots.length})
                  </span>
                </div>

                {/* Scene Action Buttons */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover/scene:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssembleScene?.(scene);
                    }}
                    className="p-1 rounded hover:bg-purple-600/30 text-slate-400 hover:text-purple-300 transition-colors"
                    title={`Assemble ${scene.name} in Sequence Timeline`}
                  >
                    <Film className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTargetSceneId(scene.id);
                      setShowNewShotModal(true);
                    }}
                    className="p-1 rounded hover:bg-blue-600/30 text-slate-400 hover:text-blue-300 transition-colors"
                    title={`Add shot to ${scene.name}`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  {scenes.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteScene(scene.id, e)}
                      className="p-1 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors"
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
                        className={`group relative flex items-center gap-2.5 rounded-md p-1.5 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#1a2233] border border-blue-500/80 text-white shadow-sm'
                            : 'hover:bg-white/5 text-slate-300'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded bg-black/60 border border-white/10">
                          <img
                            src={shotItem.thumbnail}
                            alt={shotItem.code}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                          <span className="absolute bottom-0.5 right-1 font-mono text-[8px] text-white/90">
                            {shotItem.duration}
                          </span>
                        </div>

                        {/* Shot Info */}
                        <div className="flex flex-1 flex-col min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[11px] leading-tight text-white truncate">
                              {shotItem.code}
                            </span>
                            <div className="relative flex items-center gap-0.5">
                              {/* Quick Delete Button on Hover */}
                              <button
                                onClick={(e) => handleDeleteShot(scene.id, shotItem.id, e)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 p-1 rounded transition-all"
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
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white hover:bg-white/10 p-1 rounded transition-all"
                                title="Shot Options"
                              >
                                <MoreVertical className="h-3 w-3" />
                              </button>

                              {/* Dropdown Menu */}
                              {openMenuShotId === shotItem.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-0 top-6 z-50 w-36 rounded-lg border border-white/10 bg-[#161a26] p-1 shadow-2xl backdrop-blur-md text-[11px]"
                                >
                                  <button
                                    onClick={(e) => handleDuplicateShot(scene.id, shotItem, e)}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                                  >
                                    <Copy className="h-3 w-3 text-blue-400" />
                                    <span>Duplicate Shot</span>
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteShot(scene.id, shotItem.id, e)}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-400 hover:bg-rose-950/60 hover:text-rose-300 transition-colors"
                                  >
                                    <Trash2 className="h-3 w-3 text-rose-400" />
                                    <span>Delete Shot</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-400">
                            <span>{shotItem.duration}</span>
                            <span>•</span>
                            <span>{shotItem.focalLength}</span>
                            <span>•</span>
                            <span
                              className={`rounded px-1 py-0.2 text-[8px] font-semibold tracking-wider uppercase ${
                                shotItem.mode === 'video-plate'
                                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                  : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}
                            >
                              {shotItem.mode === 'video-plate' ? 'VFX Plate' : '3D Previs'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-300 truncate">
                            {shotItem.movement}
                          </span>
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
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/20 bg-white/[0.02] hover:bg-white/[0.06] hover:border-amber-400/50 py-2 font-mono text-[10px] text-slate-300 hover:text-white transition-all shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold">+ Add New Scene</span>
          </button>
        </div>
      </div>

      {/* Project Info Section */}
      <div className="border-t border-white/5 bg-[#0e1017] p-3 text-[11px]">
        <button
          onClick={() => setIsProjectInfoCollapsed(!isProjectInfoCollapsed)}
          className="flex w-full items-center justify-between text-slate-400 hover:text-white font-medium mb-2"
        >
          <span className="font-display text-[11px] font-bold uppercase tracking-wider text-slate-300">
            Project Info
          </span>
          {isProjectInfoCollapsed ? (
            <ChevronRight className="h-3 w-3 text-slate-500" />
          ) : (
            <ChevronDown className="h-3 w-3 text-slate-500" />
          )}
        </button>

        {!isProjectInfoCollapsed && (
          <div className="space-y-1.5 font-mono text-[10px] text-slate-400">
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
              <span className="text-amber-400 font-semibold">
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
        <div className="mt-3 flex items-center justify-between rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="font-display text-[10px] font-bold">
              {shot.creationMode === 'video-plate' ? 'VFX Plate Mode' : '3D Previs Soundstage'}
            </span>
          </div>
          <span className="font-mono text-[9px] text-slate-400">
            {shot.durationSeconds}s · {shot.camera.lens.focalLength}
          </span>
        </div>

        {/* Reset Demo Project Button */}
        <div className="mt-2.5 pt-2 border-t border-white/5 flex justify-end">
          <button
            onClick={handleResetDemoScenes}
            className="flex items-center gap-1 font-mono text-[9px] text-slate-500 hover:text-slate-300 transition-colors"
            title="Restore original demo scenes & shots"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset Demo Scenes</span>
          </button>
        </div>
      </div>

      {/* New Shot Modal Dialog (Two direct choices for every shot) */}
      {showNewShotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-xl bg-[#0f121a] border border-white/15 p-5 shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  Create New Shot
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Choose how you want to direct and construct this shot
                </p>
              </div>
              <button
                onClick={() => setShowNewShotModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 2-Card Directorial Choice Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Option 1: 3D Previs from Scratch */}
              <button
                onClick={() => handleCreateShotWithMode('construct-3d')}
                className="group flex flex-col items-start justify-between rounded-lg bg-gradient-to-b from-[#182133] to-[#111723] p-4 border border-blue-500/40 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/10 text-left transition-all active:scale-[0.98]"
              >
                <div className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/30 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <Box className="h-5 w-5" />
                  </div>
                  <span className="font-display text-xs font-bold text-white group-hover:text-blue-300 transition-colors">
                    🎬 Construct from Scratch
                  </span>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Build virtual soundstage scene: place characters, trees, cars, tables, and props. Direct camera dolly paths, focal lengths, framing, and cinematic lighting.
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 font-mono text-[9px] font-bold text-blue-400 group-hover:translate-x-0.5 transition-transform">
                  <span>Start 3D Previs</span>
                  <span>→</span>
                </div>
              </button>

              {/* Option 2: Video Plate Solve */}
              <button
                onClick={() => handleCreateShotWithMode('video-plate')}
                className="group flex flex-col items-start justify-between rounded-lg bg-gradient-to-b from-[#162927] to-[#0f1d1c] p-4 border border-teal-500/40 hover:border-teal-400 hover:shadow-lg hover:shadow-teal-500/10 text-left transition-all active:scale-[0.98]"
              >
                <div className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600/30 text-teal-400 group-hover:bg-teal-600 group-hover:text-white transition-all">
                    <Video className="h-5 w-5" />
                  </div>
                  <span className="font-display text-xs font-bold text-white group-hover:text-teal-300 transition-colors">
                    📹 Video Plate Solve
                  </span>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Upload a live-action reference video plate. Studio analyzes 5 computer vision passes (Depth, Pose, Edges, Masks, Multi-Pose) and transfers exact motion into ComfyUI.
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1 font-mono text-[9px] font-bold text-teal-400 group-hover:translate-x-0.5 transition-transform">
                  <span>Import & Solve Plate</span>
                  <span>→</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
