import { create } from 'zustand';
import { ShotSpec, createDefaultShotSpec, CameraMovementType, FocalLength, CameraAngle, LightingStyle, LightingDirection, Actor, ShotType, SubjectKind, ShotCreationMode, Point2D, Point3D, EnvironmentSpec, CINEMATIC_ENVIRONMENT_PRESETS } from '../types/shotspec';
import { getAdapter } from '../adapters';
import { ValidationReport, CompiledPromptBundle } from '../adapters/types';
import { logger } from './useLogStore';
import { recordTrajectoryPositionAtTime } from '../engine/trajectoryMath';
import { STORAGE_KEYS, safeGetItem, safeSetItem, sanitizeShotForStorage } from '../services/storage';

interface ShotState {
  shot: ShotSpec;
  shotsById: Record<string, ShotSpec>;
  validation: ValidationReport;
  compiledPrompt: CompiledPromptBundle;
  isDirty: boolean;

  // Setters & Actions
  switchShot: (shotId: string, initialFallback?: () => ShotSpec) => void;
  updateShotName: (name: string) => void;
  setCreationMode: (mode: ShotCreationMode) => void;
  updateDuration: (seconds: number) => void;
  updateAspectRatio: (ratio: ShotSpec['aspectRatio']) => void;
  updateTargetModel: (model: ShotSpec['targetModel']) => void;
  
  // Camera
  setFocalLength: (focalLength: FocalLength) => void;
  setShotType: (shotType: ShotType) => void;
  setCameraAngle: (angle: CameraAngle) => void;
  setCameraMovement: (type: CameraMovementType, speed?: ShotSpec['camera']['movement']['speed']) => void;
  setCameraPositions: (start: ShotSpec['camera']['movement']['startPosition'], end: ShotSpec['camera']['movement']['endPosition']) => void;
  updateCameraPositionAtTime: (time: number, position: Point3D, duration: number) => void;
  removeCameraKeyframe: (keyframeId: string) => void;
  
  // Actors & Scene Objects
  sceneCastPool: Actor[];
  addToCastPool: (actor: Actor) => void;
  removeFromCastPool: (actorId: string) => void;
  importFromCastPool: (actorId: string) => void;
  updateActor: (actorId: string, updates: Partial<Actor>) => void;
  addActor: (
    name?: string,
    kind?: SubjectKind,
    token?: string,
    options?: {
      modelUrl?: string;
      scale?: number;
      conceptImageUrl?: string;
      actionDescription?: string;
      sculpt?: any;
      partGraph?: any;
    }
  ) => void;
  removeActor: (actorId: string) => void;
  clearAllActors: () => void;
  setActors: (actors: Actor[]) => void;
  updateActorPositionAtTime: (actorId: string, time: number, position: Point2D, duration: number) => void;
  removeActorKeyframe: (actorId: string, keyframeId: string) => void;

  // Scene Environment & Location Setting
  setEnvironment: (env: EnvironmentSpec | Partial<EnvironmentSpec>) => void;

  // Lighting & Mood
  setLighting: (style: LightingStyle, direction?: LightingDirection, contrast?: 'soft' | 'balanced' | 'high-contrast') => void;
  
  // Context & Reference
  setSceneDescription: (desc: string) => void;
  setNegativePrompt: (neg: string) => void;
  setReferenceImage: (ref?: ShotSpec['referenceImage']) => void;
  updateVfxReference: (updates: Partial<NonNullable<ShotSpec['vfxReference']>>) => void;
  setTakeAsActivePlate: (videoUrl: string, fileName?: string) => void;
  
  // UI Inspector Tab Coordination
  activeDeckTab: 'camera' | 'staging' | 'environment' | 'atmosphere' | 'vfx';
  setActiveDeckTab: (tab: 'camera' | 'staging' | 'environment' | 'atmosphere' | 'vfx') => void;
  selectedActorId?: string;
  setSelectedActorId: (id?: string) => void;

  // In-App 3D Previs Video
  previsVideoUrl?: string;
  previsVideoBlob?: Blob;
  isRenderingPrevis: boolean;
  previsProgress: number;
  previsRendererFn: (() => Promise<{ url: string; blob: Blob } | null>) | null;
  registerPrevisRenderer: (fn: (() => Promise<{ url: string; blob: Blob } | null>) | null) => void;
  renderPrevisVideo: () => Promise<{ url: string; blob: Blob } | null>;
  setPrevisVideo: (url?: string, blob?: Blob) => void;
  setPrevisRendering: (rendering: boolean, progress?: number) => void;

  // Prompt Management
  setCompiledPrompt: (bundle: CompiledPromptBundle) => void;

  // Full Reset / Load
  loadShot: (shot: ShotSpec) => void;
  resetToDefault: () => void;

  // Per-Shot Undo / Redo & Editing Safety
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  beginGesture: () => void;
  endGesture: () => void;
  clearHistory: (shotId?: string) => void;
}

let isGestureActive = false;
let gestureStartShot: ShotSpec | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingShotsToPersist: Record<string, ShotSpec> | null = null;

export const flushShotsPersistence = () => {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!pendingShotsToPersist) return;
  const shots = pendingShotsToPersist;
  pendingShotsToPersist = null;
  const sanitized: Record<string, ShotSpec> = {};
  for (const [id, s] of Object.entries(shots)) {
    sanitized[id] = sanitizeShotForStorage(s);
  }
  safeSetItem(STORAGE_KEYS.SHOTS_CACHE, sanitized);
};

const persistShotsMap = (shots: Record<string, ShotSpec>, immediate = false) => {
  pendingShotsToPersist = shots;
  if (!immediate && isGestureActive) {
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(flushShotsPersistence, 300);
    return;
  }
  flushShotsPersistence();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushShotsPersistence);
}

const loadCachedShots = (): Record<string, ShotSpec> => {
  const parsed = safeGetItem<Record<string, ShotSpec>>(STORAGE_KEYS.SHOTS_CACHE, {});
  if (typeof parsed === 'object' && parsed !== null) {
    for (const key of Object.keys(parsed)) {
      if (parsed[key] && !parsed[key].environment) {
        parsed[key].environment = CINEMATIC_ENVIRONMENT_PRESETS[0].spec;
      }
    }
    return parsed;
  }
  return {};
};

const DEFAULT_CAST_POOL: Actor[] = [
  {
    id: 'cast-detective-miller',
    name: 'Detective Miller',
    kind: 'human',
    token: 'a gritty detective in a weathered charcoal trench coat with keen observant eyes',
    actionDescription: 'walks deliberately, scanning surroundings with intense focus',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 35, y: 50 },
      endPosition: { x: 50, y: 50 },
    },
  },
  {
    id: 'cast-cyber-operative',
    name: 'Cyber Operative',
    kind: 'human',
    token: 'a sleek tactical operative in matte carbon stealth suit with illuminated visor',
    actionDescription: 'crouches quietly in low ready stance',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 65, y: 45 },
      endPosition: { x: 65, y: 55 },
    },
  },
  {
    id: 'cast-recon-hound',
    name: 'Cyber Hound',
    kind: 'creature',
    token: 'a quad-legged robotic reconnaissance hound with glowing blue ocular sensor',
    actionDescription: 'trots forward alertly, tracking scent along the floor',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 45, y: 65 },
      endPosition: { x: 55, y: 65 },
    },
  },
];

const loadCachedCastPool = (): Actor[] => {
  const parsed = safeGetItem<Actor[]>(STORAGE_KEYS.CAST_POOL, DEFAULT_CAST_POOL);
  if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  return DEFAULT_CAST_POOL;
};

const persistCastPool = (pool: Actor[]) => {
  safeSetItem(STORAGE_KEYS.CAST_POOL, pool);
};

const initialCachedShots = loadCachedShots();
const initialShot = initialCachedShots['shot-01a'] || createDefaultShotSpec({ id: 'shot-01a', name: 'Shot 01A Tracking In' });
const initialShotsMap: Record<string, ShotSpec> = {
  ...initialCachedShots,
  [initialShot.id]: initialShot,
};
const initialAdapter = getAdapter(initialShot.targetModel);

const MAX_HISTORY_STEPS = 50;

interface ShotHistory {
  past: ShotSpec[];
  future: ShotSpec[];
}

const historyByShot: Record<string, ShotHistory> = {};

function getShotHistory(shotId: string): ShotHistory {
  if (!historyByShot[shotId]) {
    historyByShot[shotId] = { past: [], future: [] };
  }
  return historyByShot[shotId];
}

export const useShotStore = create<ShotState>((set, get) => {
  const evaluate = (shot: ShotSpec) => {
    const adapter = getAdapter(shot.targetModel);
    const validation = adapter.validate(shot);
    const compiledPrompt = adapter.compilePrompt(shot);
    return { validation, compiledPrompt };
  };

  const commitShot = (
    updated: ShotSpec,
    extraState?: Partial<ShotState>,
    options?: { skipHistory?: boolean; immediatePersist?: boolean }
  ) => {
    const currentShot = get().shot;
    const shotHistory = getShotHistory(updated.id);

    if (!options?.skipHistory && currentShot.id === updated.id) {
      if (isGestureActive) {
        if (!gestureStartShot) {
          gestureStartShot = currentShot;
        }
      } else {
        shotHistory.past.push(currentShot);
        if (shotHistory.past.length > MAX_HISTORY_STEPS) {
          shotHistory.past.shift();
        }
        shotHistory.future = [];
        gestureStartShot = null;
      }
    }

    const currentShots = get().shotsById;
    const nextShots = { ...currentShots, [updated.id]: updated };
    persistShotsMap(nextShots, options?.immediatePersist || false);
    set({
      shot: updated,
      shotsById: nextShots,
      ...evaluate(updated),
      isDirty: true,
      canUndo: shotHistory.past.length > 0,
      canRedo: shotHistory.future.length > 0,
      ...extraState,
    });
  };

  return {
    shot: initialShot,
    shotsById: initialShotsMap,
    sceneCastPool: loadCachedCastPool(),
    validation: initialAdapter.validate(initialShot),
    compiledPrompt: initialAdapter.compilePrompt(initialShot),
    isDirty: false,
    canUndo: false,
    canRedo: false,
    activeDeckTab: 'camera',
    selectedActorId: initialShot.actors[0]?.id,
    previsVideoUrl: undefined,
    previsVideoBlob: undefined,
    isRenderingPrevis: false,
    previsProgress: 0,
    previsRendererFn: null,
    setActiveDeckTab: (tab) => set({ activeDeckTab: tab }),
    setSelectedActorId: (id) => {
      if (id && id !== '__camera__') {
        set({ selectedActorId: id, activeDeckTab: 'staging' });
      } else if (id === '__camera__') {
        set({ selectedActorId: id, activeDeckTab: 'camera' });
      } else {
        set({ selectedActorId: id });
      }
    },

    registerPrevisRenderer: (fn) => set({ previsRendererFn: fn }),

    setPrevisRendering: (isRenderingPrevis, progress = 0) =>
      set({ isRenderingPrevis, previsProgress: progress }),

    setPrevisVideo: (url, blob) => {
      const shot = get().shot;
      const vfxRef = shot.vfxReference
        ? {
            ...shot.vfxReference,
            videoUrl: url || shot.vfxReference.videoUrl,
            fileName: `${shot.name.replace(/\s+/g, '_')}_previs.${blob?.type.includes('mp4') ? 'mp4' : 'webm'}`,
            enabled: true,
          }
        : undefined;

      const newShot = vfxRef ? { ...shot, vfxReference: vfxRef } : shot;
      logger.action(url ? `In-app 3D Previs video ready: ${newShot.name}` : 'Cleared previs video');
      commitShot(newShot, {
        previsVideoUrl: url,
        previsVideoBlob: blob,
      });
    },

    renderPrevisVideo: async () => {
      const fn = get().previsRendererFn;
      if (!fn) {
        console.warn('No active 3D Previs renderer registered');
        return null;
      }
      return await fn();
    },

    setCompiledPrompt: (compiledPrompt) => set({ compiledPrompt }),

    switchShot: (shotId: string, initialFallback?: () => ShotSpec) => {
      if (isGestureActive) {
        get().endGesture();
      }
      gestureStartShot = null;
      const { shot, shotsById } = get();
      // 1. Ensure current active shot is stored in cache
      const currentMap: Record<string, ShotSpec> = { ...shotsById, [shot.id]: shot };

      // 2. Lookup target shot or build via fallback
      let targetShot = currentMap[shotId];
      if (!targetShot) {
        targetShot = initialFallback ? initialFallback() : createDefaultShotSpec({ id: shotId });
        currentMap[shotId] = targetShot;
      }

      persistShotsMap(currentMap, true);
      const targetHistory = getShotHistory(targetShot.id);

      logger.action(`Switched active shot to "${targetShot.name}" (${targetShot.id})`);
      set({
        shot: targetShot,
        shotsById: currentMap,
        selectedActorId: targetShot.actors[0]?.id,
        ...evaluate(targetShot),
        isDirty: false,
        canUndo: targetHistory.past.length > 0,
        canRedo: targetHistory.future.length > 0,
        previsVideoUrl: undefined,
        previsVideoBlob: undefined,
        isRenderingPrevis: false,
        previsProgress: 0,
      });
    },

    updateShotName: (name) => {
      const shot = { ...get().shot, name };
      logger.action(`Renamed shot to "${name}"`);
      commitShot(shot);
    },

    setCreationMode: (creationMode) => {
      const shot = { ...get().shot, creationMode };
      logger.action(`Switched shot workflow mode to ${creationMode === 'construct-3d' ? '3D Previs from Scratch' : 'Video Plate VFX Solve'}`);
      commitShot(shot);
    },

    updateDuration: (durationSeconds) => {
      const shot = { ...get().shot, durationSeconds };
      logger.action(`Updated shot duration to ${durationSeconds}s`);
      commitShot(shot);
    },

    updateAspectRatio: (aspectRatio) => {
      const shot = { ...get().shot, aspectRatio };
      logger.action(`Switched aspect ratio to ${aspectRatio}`);
      commitShot(shot);
    },

    updateTargetModel: (targetModel) => {
      const shot = { ...get().shot, targetModel };
      logger.action(`Switched target model to "${targetModel}"`);
      commitShot(shot);
    },

    setFocalLength: (focalLength) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        camera: {
          ...shot.camera,
          lens: { ...shot.camera.lens, focalLength },
        },
      };
      logger.action(`Changed camera focal length to ${focalLength}`);
      commitShot(updated);
    },

    setShotType: (shotType) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        camera: { ...shot.camera, shotType },
      };
      logger.action(`Changed shot framing to ${shotType}`);
      commitShot(updated);
    },

    setCameraAngle: (angle) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        camera: { ...shot.camera, angle },
      };
      logger.action(`Changed camera angle to ${angle}`);
      commitShot(updated);
    },

    setCameraMovement: (type, speed) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        camera: {
          ...shot.camera,
          movement: {
            ...shot.camera.movement,
            type,
            ...(speed ? { speed } : {}),
          },
        },
      };
      logger.action(`Configured camera trajectory: ${type} (${speed || shot.camera.movement.speed})`);
      commitShot(updated);
    },

    setCameraPositions: (startPosition, endPosition) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        camera: {
          ...shot.camera,
          movement: {
            ...shot.camera.movement,
            startPosition,
            endPosition,
          },
        },
      };
      logger.action(`Stage repositioned camera: (${startPosition.x}, ${startPosition.y}) -> (${endPosition.x}, ${endPosition.y})`);
      commitShot(updated);
    },

    updateCameraPositionAtTime: (time, position, duration) => {
      const { shot } = get();
      const curMov = shot.camera.movement;
      const safeDuration = duration > 0 ? duration : 4.0;
      const clampedTime = Math.max(0, Math.min(safeDuration, time));
      const isAtStart = clampedTime <= 0.15;
      const isAtEnd = clampedTime >= safeDuration - 0.15;

      let newMov = { ...curMov };
      if (isAtStart) {
        newMov.startPosition = position;
      } else if (isAtEnd) {
        newMov.endPosition = position;
      } else {
        const kfs = [...(curMov.keyframes || [])];
        const existingIdx = kfs.findIndex((k) => Math.abs(k.time - clampedTime) <= 0.25);
        if (existingIdx >= 0) {
          kfs[existingIdx] = { ...kfs[existingIdx], time: clampedTime, position };
        } else {
          kfs.push({
            id: `cam_kf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            time: Number(clampedTime.toFixed(2)),
            position,
          });
        }
        kfs.sort((a, b) => a.time - b.time);
        newMov.keyframes = kfs;
      }

      logger.action(`Camera keyframed at ${clampedTime.toFixed(1)}s`, position);
      const updated: ShotSpec = {
        ...shot,
        camera: { ...shot.camera, movement: newMov },
      };
      commitShot(updated);
    },

    removeCameraKeyframe: (keyframeId) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        camera: {
          ...shot.camera,
          movement: {
            ...shot.camera.movement,
            keyframes: (shot.camera.movement.keyframes || []).filter((k) => k.id !== keyframeId),
          },
        },
      };
      logger.action(`Removed camera keyframe ${keyframeId}`);
      commitShot(updated);
    },

    addToCastPool: (actor) => {
      const { sceneCastPool } = get();
      const existingIdx = sceneCastPool.findIndex(
        (a) => a.id === actor.id || a.name.toLowerCase() === actor.name.toLowerCase()
      );
      let next: Actor[];
      if (existingIdx >= 0) {
        next = [...sceneCastPool];
        next[existingIdx] = { ...actor };
      } else {
        next = [actor, ...sceneCastPool];
      }
      set({ sceneCastPool: next });
      persistCastPool(next);
      logger.action(`Saved "${actor.name}" to Scene Cast Pool`);
    },

    removeFromCastPool: (actorId) => {
      const { sceneCastPool } = get();
      const next = sceneCastPool.filter((a) => a.id !== actorId);
      set({ sceneCastPool: next });
      persistCastPool(next);
      logger.action(`Removed actor ${actorId} from Scene Cast Pool`);
    },

    importFromCastPool: (actorId) => {
      const { sceneCastPool, addActor } = get();
      const target = sceneCastPool.find((a) => a.id === actorId);
      if (!target) return;
      addActor(target.name, target.kind, target.token, {
        modelUrl: target.modelUrl,
        scale: target.scale,
        conceptImageUrl: target.conceptImageUrl,
        actionDescription: target.actionDescription,
      });
      logger.action(`Imported "${target.name}" from Scene Cast Pool into active shot`);
    },

    updateActor: (actorId, updates) => {
      const { shot } = get();
      const updatedActors = shot.actors.map((a) => (a.id === actorId ? { ...a, ...updates } : a));
      const targetActor = updatedActors.find((a) => a.id === actorId);
      logger.action(`Updated actor "${targetActor?.name || actorId}" properties`, updates);
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      commitShot(updated);
    },

    updateActorPositionAtTime: (actorId, time, position, duration) => {
      const { shot } = get();
      const target = shot.actors.find((a) => a.id === actorId);
      if (!target) return;
      const updatedTrajectory = recordTrajectoryPositionAtTime(
        target.trajectory,
        time,
        duration,
        position
      );
      const updatedActors = shot.actors.map((a) =>
        a.id === actorId ? { ...a, trajectory: updatedTrajectory } : a
      );
      logger.action(`Updated "${target.name}" position at ${time.toFixed(1)}s`, position);
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      commitShot(updated);
    },

    removeActorKeyframe: (actorId, keyframeId) => {
      const { shot } = get();
      const updatedActors = shot.actors.map((a) => {
        if (a.id !== actorId) return a;
        return {
          ...a,
          trajectory: {
            ...a.trajectory,
            keyframes: (a.trajectory.keyframes || []).filter((k) => k.id !== keyframeId),
          },
        };
      });
      logger.action(`Removed keyframe for actor ${actorId}`);
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      commitShot(updated);
    },

    addActor: (name, kind = 'human', token, options) => {
      const { shot } = get();
      const resolvedKind = (kind || 'human').trim().toLowerCase();
      const defaultName = name && name.trim()
        ? name.trim().charAt(0).toUpperCase() + name.trim().slice(1)
        : resolvedKind !== 'human'
        ? resolvedKind.charAt(0).toUpperCase() + resolvedKind.slice(1)
        : `Character ${shot.actors.length + 1}`;

      const defaultToken = token
        ? token
        : name && name.trim()
        ? `a detailed ${name.trim().toLowerCase()}`
        : resolvedKind === 'spaceship' || resolvedKind === 'space ship' || resolvedKind === 'starship'
        ? 'a sleek futuristic sci-fi starship with glowing cyan ion thrusters and cockpit canopy'
        : resolvedKind === 'mountain'
        ? 'a majestic rugged mountain peak with alpine stone crags'
        : resolvedKind === 'car'
        ? 'a vintage automobile'
        : resolvedKind === 'table'
        ? 'a rustic wooden table'
        : resolvedKind === 'tree'
        ? 'a tall lush tree'
        : resolvedKind === 'chair'
        ? 'an armchair'
        : resolvedKind === 'prop'
        ? 'a storage crate'
        : resolvedKind === 'sofa' || resolvedKind === 'couch'
        ? 'a comfortable leather sofa'
        : resolvedKind === 'house' || resolvedKind === 'building'
        ? 'a rustic stone building'
        : resolvedKind === 'tv' || resolvedKind === 'screen'
        ? 'a high-definition television monitor'
        : resolvedKind === 'bicycle' || resolvedKind === 'bike'
        ? 'a classic bicycle'
        : resolvedKind === 'lamp' || resolvedKind === 'streetlamp'
        ? 'a vintage cast-iron streetlamp'
        : resolvedKind === 'robot'
        ? 'an advanced robotic humanoid droid'
        : resolvedKind !== 'human'
        ? `a detailed ${resolvedKind}`
        : 'a central dramatic protagonist';

      const defaultAction =
        resolvedKind === 'spaceship' || resolvedKind === 'space ship' || resolvedKind === 'starship'
          ? 'cruising smoothly through space with glowing ion thrusters'
          : resolvedKind === 'mountain' || resolvedKind === 'hill' || resolvedKind === 'rock'
          ? 'towering majestically in the background landscape'
          : resolvedKind === 'human'
          ? 'stands and surveys the scene'
          : resolvedKind === 'car'
          ? 'parked along the road'
          : 'positioned on set in the environment';

      const spawnX = 35 + Math.floor(Math.random() * 30);
      const spawnY = 35 + Math.floor(Math.random() * 30);
      const spawnZ = 0; // Default on ground

      const newActor: Actor = {
        id: `actor-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: defaultName,
        kind,
        token: defaultToken,
        actionDescription: options?.actionDescription || defaultAction,
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: spawnX, y: spawnY, z: spawnZ },
          endPosition: { x: spawnX, y: spawnY, z: spawnZ },
        },
        modelUrl: options?.modelUrl,
        scale: options?.scale,
        conceptImageUrl: options?.conceptImageUrl,
        sculpt: options?.sculpt,
        partGraph: options?.partGraph || options?.sculpt,
      };
      logger.action(`Added ${kind} to stage: "${defaultName}"`, newActor);
      const updated: ShotSpec = { ...shot, actors: [...shot.actors, newActor] };
      commitShot(updated, {
        selectedActorId: newActor.id,
        activeDeckTab: 'staging',
      });
    },

    removeActor: (actorId) => {
      const { shot, selectedActorId } = get();
      const target = shot.actors.find(a => a.id === actorId);
      logger.action(`Removed character from stage: "${target?.name || actorId}"`);
      const updatedActors = shot.actors.filter((a) => a.id !== actorId);
      const updated: ShotSpec = {
        ...shot,
        actors: updatedActors,
      };
      commitShot(updated, {
        selectedActorId: selectedActorId === actorId ? (updatedActors[0]?.id || undefined) : selectedActorId,
      });
    },

    clearAllActors: () => {
      const { shot } = get();
      logger.action(`Cleared all characters from stage`);
      const updated: ShotSpec = {
        ...shot,
        actors: [],
      };
      commitShot(updated, {
        selectedActorId: undefined,
      });
    },

    setActors: (actors) => {
      const { shot } = get();
      logger.action(`Set ${actors.length} actors on stage`, actors);
      const updated: ShotSpec = {
        ...shot,
        actors,
      };
      commitShot(updated);
    },

    setEnvironment: (env) => {
      const { shot } = get();
      const currentEnv = shot.environment || CINEMATIC_ENVIRONMENT_PRESETS[0].spec;
      const nextEnv: EnvironmentSpec = {
        ...currentEnv,
        ...env,
      };
      logger.action(`Set scene environment to ${nextEnv.name} (${nextEnv.category})`, {
        weather: nextEnv.weather,
        timeOfDay: nextEnv.timeOfDay,
        groundSurface: nextEnv.groundSurface,
      });
      const updated: ShotSpec = {
        ...shot,
        environment: nextEnv,
      };
      commitShot(updated);
    },

    setLighting: (style, direction, contrast) => {
      const { shot } = get();
      logger.action(`Set lighting mood to ${style} (dir: ${direction || shot.lighting.direction}, contrast: ${contrast || shot.lighting.contrast})`);
      const updated: ShotSpec = {
        ...shot,
        lighting: {
          style,
          direction: direction || shot.lighting.direction,
          contrast: contrast || shot.lighting.contrast,
        },
      };
      commitShot(updated);
    },

    setSceneDescription: (sceneDescription) => {
      const shot = { ...get().shot, sceneDescription };
      logger.action(`Updated scene narrative description (${sceneDescription.length} chars)`);
      commitShot(shot);
    },

    setNegativePrompt: (negativePrompt) => {
      const shot = { ...get().shot, negativePrompt };
      logger.action(`Updated negative prompt filter (${negativePrompt.length} chars)`);
      commitShot(shot);
    },

    setReferenceImage: (referenceImage) => {
      const shot = { ...get().shot, referenceImage };
      logger.action(`Assigned reference image for Image-to-Video`, { hasImage: !!referenceImage });
      commitShot(shot);
    },

    updateVfxReference: (updates) => {
      const { shot } = get();
      const current = shot.vfxReference || {
        referenceMode: 'actor-motion' as const,
        depthGuidanceWeight: 0.7,
        edgeFidelity: 0.5,
        motionRetention: 0.65,
        trimStartSeconds: 0,
        trimEndSeconds: shot.durationSeconds,
        enabled: true,
      };
      const vfxReference = { ...current, ...updates };
      const updated: ShotSpec = { ...shot, vfxReference };
      logger.action(`Updated VFX reference plate (${vfxReference.referenceMode}, depth: ${vfxReference.depthGuidanceWeight})`);
      commitShot(updated);
    },

    setTakeAsActivePlate: (videoUrl, fileName) => {
      const { shot } = get();
      const current = shot.vfxReference || {
        referenceMode: 'full-scene' as const,
        depthGuidanceWeight: 0.8,
        edgeFidelity: 0.6,
        motionRetention: 0.7,
        trimStartSeconds: 0,
        trimEndSeconds: shot.durationSeconds,
      };
      const resolvedFileName = fileName || `Take_Plate_${shot.name.replace(/\s+/g, '_')}.mp4`;
      const vfxReference = {
        ...current,
        videoUrl,
        fileName: resolvedFileName,
        enabled: true,
        referenceMode: 'full-scene' as const,
      };
      const updated: ShotSpec = { ...shot, vfxReference };
      logger.action(`Set Take as active shot plate: "${resolvedFileName}"`);
      commitShot(updated);
    },

    loadShot: (shot) => {
      logger.action(`Loaded shot "${shot.name}" (${shot.id}) into active editor`);
      gestureStartShot = null;
      const currentShots = get().shotsById;
      const nextShots = { ...currentShots, [shot.id]: shot };
      persistShotsMap(nextShots, true);
      const shotHistory = getShotHistory(shot.id);
      set({
        shot,
        shotsById: nextShots,
        selectedActorId: shot.actors[0]?.id,
        ...evaluate(shot),
        isDirty: false,
        canUndo: shotHistory.past.length > 0,
        canRedo: shotHistory.future.length > 0,
        previsVideoUrl: undefined,
        previsVideoBlob: undefined,
        isRenderingPrevis: false,
        previsProgress: 0,
      });
    },

    resetToDefault: () => {
      logger.action(`Reset director studio state to default master shot`);
      const fresh = createDefaultShotSpec({ id: get().shot.id, name: get().shot.name });
      const history = getShotHistory(fresh.id);
      history.past = [];
      history.future = [];
      gestureStartShot = null;
      isGestureActive = false;
      commitShot(
        fresh,
        {
          isDirty: false,
          canUndo: false,
          canRedo: false,
          previsVideoUrl: undefined,
          previsVideoBlob: undefined,
          isRenderingPrevis: false,
          previsProgress: 0,
        },
        { skipHistory: true, immediatePersist: true }
      );
    },

    undo: () => {
      const currentShot = get().shot;
      const history = getShotHistory(currentShot.id);
      if (history.past.length === 0) return;

      const previousShot = history.past.pop()!;
      history.future.push(currentShot);
      if (history.future.length > MAX_HISTORY_STEPS) {
        history.future.shift();
      }

      logger.action(`Undo in "${currentShot.name}"`);
      commitShot(
        previousShot,
        {
          canUndo: history.past.length > 0,
          canRedo: history.future.length > 0,
        },
        { skipHistory: true }
      );
    },

    redo: () => {
      const currentShot = get().shot;
      const history = getShotHistory(currentShot.id);
      if (history.future.length === 0) return;

      const nextShot = history.future.pop()!;
      history.past.push(currentShot);
      if (history.past.length > MAX_HISTORY_STEPS) {
        history.past.shift();
      }

      logger.action(`Redo in "${currentShot.name}"`);
      commitShot(
        nextShot,
        {
          canUndo: history.past.length > 0,
          canRedo: history.future.length > 0,
        },
        { skipHistory: true }
      );
    },

    beginGesture: () => {
      isGestureActive = true;
      gestureStartShot = get().shot;
    },

    endGesture: () => {
      if (!isGestureActive) return;
      isGestureActive = false;
      const currentShot = get().shot;
      if (gestureStartShot && gestureStartShot !== currentShot) {
        const history = getShotHistory(currentShot.id);
        history.past.push(gestureStartShot);
        if (history.past.length > MAX_HISTORY_STEPS) {
          history.past.shift();
        }
        history.future = [];
        set({
          canUndo: history.past.length > 0,
          canRedo: false,
        });
      }
      gestureStartShot = null;
      flushShotsPersistence();
    },

    clearHistory: (shotId?: string) => {
      const id = shotId || get().shot.id;
      if (historyByShot[id]) {
        historyByShot[id] = { past: [], future: [] };
      }
      if (id === get().shot.id) {
        set({ canUndo: false, canRedo: false });
      }
    },
  };
});
