import { create } from 'zustand';
import { ShotSpec, createDefaultShotSpec, CameraMovementType, FocalLength, CameraAngle, LightingStyle, LightingDirection, StageLight, Actor, ShotType, MovementSpeed, SubjectKind, ShotCreationMode, Point2D, Point3D, EnvironmentSpec, CINEMATIC_ENVIRONMENT_PRESETS, ActorPose, ActorGait } from '../types/shotspec';

export const DEFAULT_LIGHT_POSITIONS: Record<LightingDirection, Point3D> = {
  'front-soft': { x: 68, y: 74, z: 50 },
  'side-key': { x: 82, y: 50, z: 45 },
  'rim-backlit': { x: 50, y: 16, z: 50 },
  'overhead-top': { x: 50, y: 46, z: 90 },
  'underlit-dramatic': { x: 50, y: 68, z: 8 },
};

export function getStyleDefaultColorAndIntensity(style: LightingStyle): { color: string; intensity: number } {
  if (style === 'golden-hour') return { color: '#f59e0b', intensity: 2.8 };
  if (style === 'neon-cyberpunk') return { color: '#06b6d4', intensity: 2.5 };
  if (style === 'moonlight-foggy') return { color: '#93c5fd', intensity: 1.5 };
  if (style === 'low-key-film-noir') return { color: '#ffffff', intensity: 3.2 };
  if (style === 'practical-candlelight') return { color: '#fb923c', intensity: 2.4 };
  if (style === 'harsh-fluorescent') return { color: '#e2e8f0', intensity: 2.6 };
  if (style === 'high-key-studio') return { color: '#ffffff', intensity: 2.8 };
  return { color: '#eab308', intensity: 2.2 };
}

export function getEffectiveStageLights(lighting: ShotSpec['lighting']): StageLight[] {
  if (lighting.lights && lighting.lights.length > 0) {
    return lighting.lights;
  }
  const pos = DEFAULT_LIGHT_POSITIONS[lighting.direction] || DEFAULT_LIGHT_POSITIONS['side-key'];
  const { color, intensity } = getStyleDefaultColorAndIntensity(lighting.style);
  return [
    {
      id: 'light-1',
      name: 'Key Light',
      position: { ...pos },
      color,
      intensity,
      enabled: true,
    },
  ];
}
import { getAdapter } from '../adapters';
import { ValidationReport, CompiledPromptBundle } from '../adapters/types';
import { logger } from './useLogStore';
import { recordTrajectoryPositionAtTime, interpolateTrajectoryPosition, recordTrajectoryPoseAtTime } from '../engine/trajectoryMath';
import { decomposeDirectorialMotion, compileMotionPlan, compileReadyMadeMotionKeyframes } from '../engine/kinematics';
import { STORAGE_KEYS, safeGetItem, safeSetItem, sanitizeShotForStorage } from '../services/storage';

export type PrevisRendererFn = (
  passMode?: 'rgb' | 'depth' | 'openpose' | 'all',
  resolution?: '720p' | '1080p'
) => Promise<{ url: string; blob: Blob; openposeUrl?: string; depthUrl?: string } | null>;

interface RendererEntry {
  fn: PrevisRendererFn;
  priority: number;
}
let activeRendererEntries: RendererEntry[] = [];

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
  setCameraTargetLookAt: (targetLookAt: Point2D) => void;
  focusCameraOnSubject: (actorId?: string) => void;
  updateCameraPositionAtTime: (time: number, position: Point3D, duration: number, forceMode?: 'base' | 'keyframe') => void;
  removeCameraKeyframe: (keyframeId: string) => void;
  setCameraColor: (color: string) => void;
  
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
  updateActorPositionAtTime: (actorId: string, time: number, position: Point2D, duration: number, forceMode?: 'base' | 'keyframe') => void;
  removeActorKeyframe: (actorId: string, keyframeId: string) => void;
  recordActorPoseAtTime: (actorId: string, time: number, pose?: ActorPose, posePreset?: string, gait?: ActorGait, duration?: number) => void;
  updateActorRotationAtTime: (actorId: string, time: number, rotation: Point3D, duration?: number) => void;
  socketActorToBone: (propActorId: string, targetActorId: string, boneName: string, offset?: Point3D, rotationOffset?: Point3D) => void;
  unsocketActor: (propActorId: string) => void;
  applyDirectorialMotion: (actorId: string, prompt: string, options?: { startTimeSec?: number; endTimeSec?: number }) => void;
  applyReadyMadeMotion: (actorId: string, clipId: string, options?: { startTimeSec?: number; endTimeSec?: number; travelMode?: 'auto' | 'travel' | 'in-place'; motionCycles?: number }) => void;
  setClaymationMode: (enabled: boolean, fps?: number) => void;
  stagingMoveMode: 'base' | 'keyframe';
  setStagingMoveMode: (mode: 'base' | 'keyframe') => void;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;

  // Scene Environment & Location Setting
  setEnvironment: (env: EnvironmentSpec | Partial<EnvironmentSpec>) => void;

  // Lighting & Mood
  setLighting: (style: LightingStyle, direction?: LightingDirection, contrast?: 'soft' | 'balanced' | 'high-contrast') => void;
  addStageLight: (partial?: Partial<StageLight>) => void;
  updateStageLight: (lightId: string, updates: Partial<StageLight>) => void;
  removeStageLight: (lightId: string) => void;
  
  // Context & Reference
  setSceneDescription: (desc: string) => void;
  setNegativePrompt: (neg: string) => void;
  setReferenceImage: (ref?: ShotSpec['referenceImage']) => void;
  updateVfxReference: (updates: Partial<NonNullable<ShotSpec['vfxReference']>>) => void;
  setTakeAsActivePlate: (videoUrl: string, fileName?: string) => void;
  
  // UI Inspector Tab Coordination
  activeDeckTab: 'camera' | 'staging' | 'environment' | 'atmosphere';
  setActiveDeckTab: (tab: 'camera' | 'staging' | 'environment' | 'atmosphere') => void;
  selectedActorId?: string;
  setSelectedActorId: (id?: string) => void;

  // In-App 3D Previs Video
  previsVideoUrl?: string;
  previsVideoBlob?: Blob;
  previsOpenPoseUrl?: string;
  previsOpenPoseBlob?: Blob;
  previsDepthUrl?: string;
  previsDepthBlob?: Blob;
  isRenderingPrevis: boolean;
  previsProgress: number;
  previsRendererFn: PrevisRendererFn | null;
  registerPrevisRenderer: (
    fn: PrevisRendererFn | null,
    priority?: 'primary' | 'fallback'
  ) => (() => void) | void;
  renderPrevisVideo: (
    passMode?: 'rgb' | 'depth' | 'openpose' | 'all',
    resolution?: '720p' | '1080p'
  ) => Promise<{ url: string; blob: Blob; openposeUrl?: string; depthUrl?: string } | null>;
  setPrevisVideo: (url?: string, blob?: Blob) => void;
  setPrevisOpenPose: (url?: string, blob?: Blob) => void;
  setPrevisDepth: (url?: string, blob?: Blob) => void;
  setPrevisRendering: (rendering: boolean, progress?: number) => void;

  // Prompt Management
  setCompiledPrompt: (bundle: CompiledPromptBundle) => void;

  // Full Reset / Load
  loadShot: (shot: ShotSpec) => void;
  resetToDefault: () => void;
  resetActorsToDefaultLead: () => void;

  // Per-Shot Undo / Redo & Editing Safety
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  beginGesture: () => void;
  endGesture: () => void;
  clearHistory: (shotId?: string) => void;
}

export const FRAMING_DISTANCES: Record<ShotType, number> = {
  'extreme-close-up': 6,
  'close-up': 12,
  'medium-close-up': 18,
  'medium': 25,
  'medium-wide': 34,
  'wide': 42,
  'extreme-wide': 45,
};

export const ANGLE_ELEVATIONS: Record<CameraAngle, number> = {
  'ground-level': 5,
  'low-angle': 18,
  'eye-level': 45,
  'high-angle': 75,
  'overhead-gods-eye': 98,
  'dutch-angle': 45,
};

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

const BUILTIN_DEMO_VERSION = 'studio-demo-3x6-v3';
const DEMO_VERSION_STORAGE_KEY = 'comfy_ai_director_demo_version_v1';

const loadCachedShots = (): Record<string, ShotSpec> => {
  const savedVer = safeGetItem<string | null>(DEMO_VERSION_STORAGE_KEY, null);
  if (savedVer !== BUILTIN_DEMO_VERSION) {
    return {};
  }
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
    id: 'cast-agent-kael',
    name: 'Agent Kael',
    kind: 'human',
    color: '#3b82f6',
    token: 'cyberpunk operative in a rain-slicked charcoal trenchcoat with glowing cyan collar',
    actionDescription: 'striding purposefully through neon-lit streets with tactical precision',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 48, y: 66, z: 0 },
      endPosition: { x: 48, y: 40, z: 0 },
    },
  },
  {
    id: 'cast-cipher-informant',
    name: 'Cipher Informant',
    kind: 'human',
    color: '#a855f7',
    token: 'mysterious cybernetic broker in a silver reflective hood with holographic visor',
    actionDescription: 'gesturing in urgent conversation while scanning for syndicate drones',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 57, y: 50, z: 0 },
      endPosition: { x: 57, y: 50, z: 0 },
    },
  },
  {
    id: 'cast-ronin-enforcer',
    name: 'Ronin Enforcer',
    kind: 'human',
    color: '#ef4444',
    token: 'armored syndicate street samurai in crimson neon exo-plate',
    actionDescription: 'unleashing a wide plasma katana slash in close-quarters combat',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 57, y: 50, z: 0 },
      endPosition: { x: 55, y: 50, z: 0 },
    },
  },
  {
    id: 'cast-elena-romance',
    name: 'Elena',
    kind: 'human',
    color: '#ec4899',
    token: 'graceful romantic heroine in a rose-silk evening dress illuminated by warm golden light',
    actionDescription: 'smiles and gestures softly in intimate close-up dialogue',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 52, y: 48, z: 0 },
      endPosition: { x: 52, y: 48, z: 0 },
    },
  },
  {
    id: 'cast-julian-romance',
    name: 'Julian',
    kind: 'human',
    color: '#3b82f6',
    token: 'charismatic romantic lead in a tailored navy coat',
    actionDescription: 'gazes attentively and speaks warmly in close-up dialogue',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 48, y: 48, z: 0 },
      endPosition: { x: 48, y: 48, z: 0 },
    },
  },
  {
    id: 'cast-explorer-aria',
    name: 'Explorer Aria',
    kind: 'human',
    color: '#10b981',
    token: 'expedition archaeologist in weathered desert-and-frontier cloak with glowing chronos gauntlet',
    actionDescription: 'advancing boldly across ancient ruins toward the Chronos Relic',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 45, y: 62, z: 0 },
      endPosition: { x: 49, y: 46, z: 0 },
    },
  },
  {
    id: 'cast-detective-miller',
    name: 'Detective Miller',
    kind: 'human',
    color: '#ef4444',
    token: 'hardboiled neo-noir detective in a rain-slicked charcoal trench coat',
    actionDescription: 'walks cautiously down the rain-slicked alley and glances over his shoulder',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 50, y: 65, z: 0 },
      endPosition: { x: 50, y: 40, z: 0 },
    },
  },
  {
    id: 'cast-recon-hound',
    name: 'Recon Hound',
    kind: 'quadruped',
    color: '#06b6d4',
    token: 'autonomous cybernetic tracking hound with glowing optics',
    actionDescription: 'prowls alongside the operative',
    trajectory: {
      startTimeSeconds: 0,
      startPosition: { x: 54, y: 65, z: 0 },
      endPosition: { x: 54, y: 40, z: 0 },
    },
  },
];

const loadCachedCastPool = (): Actor[] => {
  const savedVer = safeGetItem<string | null>(DEMO_VERSION_STORAGE_KEY, null);
  if (savedVer !== BUILTIN_DEMO_VERSION) {
    return DEFAULT_CAST_POOL;
  }
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
    previsOpenPoseUrl: undefined,
    previsOpenPoseBlob: undefined,
    previsDepthUrl: undefined,
    previsDepthBlob: undefined,
    isRenderingPrevis: false,
    previsProgress: 0,
    previsRendererFn: null,
    setActiveDeckTab: (tab) => set({ activeDeckTab: tab }),
    stagingMoveMode: 'base',
    setStagingMoveMode: (stagingMoveMode) => set({ stagingMoveMode }),
    currentTime: 0.0,
    setCurrentTime: (currentTime) => set({ currentTime }),
    isPlaying: false,
    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setSelectedActorId: (id) => {
      if (id && id !== '__camera__') {
        set({ selectedActorId: id, activeDeckTab: 'staging' });
      } else if (id === '__camera__') {
        set({ selectedActorId: id, activeDeckTab: 'camera' });
      } else {
        set({ selectedActorId: id });
      }
    },

    registerPrevisRenderer: (fn, priority = 'primary') => {
      if (!fn) {
        activeRendererEntries = [];
        set({ previsRendererFn: null });
        return;
      }
      const entry: RendererEntry = {
        fn,
        priority: priority === 'primary' ? 10 : 1,
      };
      activeRendererEntries = activeRendererEntries.filter((e) => e.fn !== fn);
      activeRendererEntries.push(entry);
      activeRendererEntries.sort((a, b) => b.priority - a.priority);
      set({ previsRendererFn: activeRendererEntries[0].fn });

      return () => {
        activeRendererEntries = activeRendererEntries.filter((e) => e.fn !== fn);
        activeRendererEntries.sort((a, b) => b.priority - a.priority);
        set({ previsRendererFn: activeRendererEntries[0]?.fn || null });
      };
    },

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

    setPrevisOpenPose: (url?: string, blob?: Blob) => {
      set({
        previsOpenPoseUrl: url,
        previsOpenPoseBlob: blob,
      });
    },

    setPrevisDepth: (url?: string, blob?: Blob) => {
      set({
        previsDepthUrl: url,
        previsDepthBlob: blob,
      });
    },

    renderPrevisVideo: async (passMode = 'all', resolution = '720p') => {
      const fn = get().previsRendererFn;
      if (!fn) {
        console.warn('No active 3D Previs renderer registered');
        return null;
      }
      return await fn(passMode, resolution);
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
        previsOpenPoseUrl: undefined,
        previsOpenPoseBlob: undefined,
        previsDepthUrl: undefined,
        previsDepthBlob: undefined,
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
      const targetDist = FRAMING_DISTANCES[shotType] ?? 40;
      const lookAt = shot.camera.movement.targetLookAt ?? { x: 50, y: 50 };

      const start = shot.camera.movement.startPosition;
      const dxStart = start.x - lookAt.x;
      const dyStart = start.y - lookAt.y;
      const currentStartDist = Math.hypot(dxStart, dyStart) || 40;
      const scaleStart = targetDist / currentStartDist;

      const newStartX = Math.max(5, Math.min(95, lookAt.x + (dxStart === 0 && dyStart === 0 ? 0 : dxStart * scaleStart)));
      const newStartY = Math.max(5, Math.min(95, lookAt.y + (dxStart === 0 && dyStart === 0 ? targetDist : dyStart * scaleStart)));

      const end = shot.camera.movement.endPosition;
      const dxEnd = end.x - lookAt.x;
      const dyEnd = end.y - lookAt.y;
      const currentEndDist = Math.hypot(dxEnd, dyEnd) || 40;
      const scaleEnd = targetDist / currentEndDist;

      const newEndX = Math.max(5, Math.min(95, lookAt.x + (dxEnd === 0 && dyEnd === 0 ? 0 : dxEnd * scaleEnd)));
      const newEndY = Math.max(5, Math.min(95, lookAt.y + (dxEnd === 0 && dyEnd === 0 ? targetDist : dyEnd * scaleEnd)));

      const updated: ShotSpec = {
        ...shot,
        camera: {
          ...shot.camera,
          shotType,
          movement: {
            ...shot.camera.movement,
            startPosition: { ...start, x: newStartX, y: newStartY },
            endPosition: { ...end, x: newEndX, y: newEndY },
          },
        },
      };
      logger.action(`Changed shot framing to ${shotType} (${targetDist}m target distance)`);
      commitShot(updated);
    },

    setCameraAngle: (angle) => {
      const { shot } = get();
      const elevationZ = ANGLE_ELEVATIONS[angle] ?? 45;
      const updated: ShotSpec = {
        ...shot,
        camera: {
          ...shot.camera,
          angle,
          movement: {
            ...shot.camera.movement,
            startPosition: { ...shot.camera.movement.startPosition, z: elevationZ },
            endPosition: { ...shot.camera.movement.endPosition, z: elevationZ },
          },
        },
      };
      logger.action(`Changed camera angle to ${angle} (elevation ${elevationZ}%)`);
      commitShot(updated);
    },

    setCameraMovement: (type, speed) => {
      const { shot } = get();
      const normalizedSpeed: MovementSpeed = speed ?? shot.camera.movement.speed;
      const updated: ShotSpec = {
        ...shot,
        camera: {
          ...shot.camera,
          movement: {
            ...shot.camera.movement,
            type,
            speed: normalizedSpeed,
          },
        },
      };
      logger.action(`Configured camera trajectory: ${type} (${normalizedSpeed})`);
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

    setCameraTargetLookAt: (targetLookAt) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        camera: {
          ...shot.camera,
          movement: {
            ...shot.camera.movement,
            targetLookAt,
          },
        },
      };
      logger.action(`Set camera look-at target: (${targetLookAt.x}, ${targetLookAt.y})`);
      commitShot(updated);
    },

    focusCameraOnSubject: (actorId) => {
      const { shot } = get();
      const targetId = actorId || get().selectedActorId;
      let targetActor = shot.actors.find((a) => a.id === targetId);
      if (!targetActor && shot.actors.length > 0) {
        targetActor = shot.actors.find((a) => a.name.toLowerCase().includes('lead') || a.id === 'actor-1') || shot.actors[0];
      }
      if (!targetActor) return;

      const actorPos = interpolateTrajectoryPosition(targetActor.trajectory, 0, shot.durationSeconds);
      const targetLookAt = {
        x: Math.round(actorPos.x),
        y: Math.round(actorPos.y),
      };

      const updated: ShotSpec = {
        ...shot,
        camera: {
          ...shot.camera,
          movement: {
            ...shot.camera.movement,
            targetLookAt,
          },
        },
      };
      logger.action(`Focused camera look-at on subject "${targetActor.name}" (${targetLookAt.x}, ${targetLookAt.y})`);
      commitShot(updated);
    },

    updateCameraPositionAtTime: (time, position, duration, forceMode) => {
      const { shot } = get();
      const curMov = shot.camera.movement;
      const safeDuration = duration > 0 ? duration : 4.0;
      const clampedTime = Math.max(0, Math.min(safeDuration, time));
      const curKeyframes = curMov.keyframes || [];
      const hasKeyframes = curKeyframes.length > 0;
      const isStatic =
        !hasKeyframes &&
        curMov.startPosition.x === curMov.endPosition.x &&
        curMov.startPosition.y === curMov.endPosition.y &&
        (curMov.startPosition.z ?? 20) === (curMov.endPosition.z ?? 20);

      let newMov = { ...curMov };

      if (forceMode === 'base') {
        const curPosAtTime = interpolateTrajectoryPosition(curMov, clampedTime, safeDuration);
        const curZ = position.z ?? curPosAtTime.z ?? curMov.startPosition.z ?? 20;
        if (isStatic) {
          newMov.startPosition = { x: position.x, y: position.y, z: curZ };
          newMov.endPosition = { x: position.x, y: position.y, z: curZ };
        } else {
          const dx = position.x - curPosAtTime.x;
          const dy = position.y - curPosAtTime.y;
          const dz = curZ - (curPosAtTime.z ?? curMov.startPosition.z ?? 20);

          newMov.startPosition = {
            x: Number(Math.min(100, Math.max(0, curMov.startPosition.x + dx)).toFixed(2)),
            y: Number(Math.min(100, Math.max(0, curMov.startPosition.y + dy)).toFixed(2)),
            z: Number(Math.min(100, Math.max(0, (curMov.startPosition.z ?? 20) + dz)).toFixed(2)),
          };
          newMov.endPosition = {
            x: Number(Math.min(100, Math.max(0, curMov.endPosition.x + dx)).toFixed(2)),
            y: Number(Math.min(100, Math.max(0, curMov.endPosition.y + dy)).toFixed(2)),
            z: Number(Math.min(100, Math.max(0, (curMov.endPosition.z ?? 20) + dz)).toFixed(2)),
          };
          if (hasKeyframes) {
            newMov.keyframes = curKeyframes.map((kf) => ({
              ...kf,
              position: {
                x: Number(Math.min(100, Math.max(0, kf.position.x + dx)).toFixed(2)),
                y: Number(Math.min(100, Math.max(0, kf.position.y + dy)).toFixed(2)),
                z: Number(Math.min(100, Math.max(0, (kf.position.z ?? 20) + dz)).toFixed(2)),
              },
            }));
          }
        }
      } else {
        const isAtStart = clampedTime <= 0.15;
        const isAtEnd = clampedTime >= safeDuration - 0.15;

        if (isAtStart) {
          if (isStatic) {
            newMov.startPosition = position;
            newMov.endPosition = position;
          } else {
            newMov.startPosition = position;
          }
        } else if (isAtEnd) {
          newMov.endPosition = position;
        } else {
          const kfs = [...curKeyframes];
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

    setCameraColor: (color) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        camera: {
          ...shot.camera,
          color,
        },
      };
      logger.action(`Set camera rig color to ${color}`);
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
      const updatedActors = shot.actors.map((a) => {
        if (a.id !== actorId) return a;
        let nextTrajectory = updates.trajectory ?? a.trajectory;
        if (updates.rotation && !updates.trajectory && nextTrajectory?.keyframes?.length) {
          const prevRot = a.rotation ?? { x: 0, y: 0, z: 0 };
          const dX = updates.rotation.x - prevRot.x;
          const dY = updates.rotation.y - prevRot.y;
          const dZ = updates.rotation.z - prevRot.z;
          nextTrajectory = {
            ...nextTrajectory,
            keyframes: nextTrajectory.keyframes.map((kf) =>
              kf.rotation
                ? {
                    ...kf,
                    rotation: {
                      x: Number((kf.rotation.x + dX).toFixed(2)),
                      y: Number((kf.rotation.y + dY).toFixed(2)),
                      z: Number((kf.rotation.z + dZ).toFixed(2)),
                    },
                  }
                : kf
            ),
          };
        }
        return { ...a, ...updates, trajectory: nextTrajectory };
      });
      const targetActor = updatedActors.find((a) => a.id === actorId);
      logger.action(`Updated actor "${targetActor?.name || actorId}" properties`, updates);
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      commitShot(updated);
    },

    updateActorPositionAtTime: (actorId, time, position, duration, forceMode) => {
      const { shot } = get();
      const target = shot.actors.find((a) => a.id === actorId);
      if (!target) return;

      const curKeyframes = target.trajectory.keyframes || [];
      const hasKeyframes = curKeyframes.length > 0;
      const isStatic =
        !hasKeyframes &&
        target.trajectory.startPosition.x === target.trajectory.endPosition.x &&
        target.trajectory.startPosition.y === target.trajectory.endPosition.y &&
        (target.trajectory.startPosition.z ?? 0) === (target.trajectory.endPosition.z ?? 0);

      let updatedTrajectory: typeof target.trajectory;

      if (forceMode === 'base') {
        const curPosAtTime = interpolateTrajectoryPosition(target.trajectory, time, duration);
        const curZ = position.z ?? curPosAtTime.z ?? target.trajectory.startPosition.z ?? 0;
        if (isStatic) {
          updatedTrajectory = {
            ...target.trajectory,
            startPosition: { x: position.x, y: position.y, z: curZ },
            endPosition: { x: position.x, y: position.y, z: curZ },
          };
        } else {
          const dx = position.x - curPosAtTime.x;
          const dy = position.y - curPosAtTime.y;
          const dz = curZ - (curPosAtTime.z ?? target.trajectory.startPosition.z ?? 0);

          updatedTrajectory = {
            ...target.trajectory,
            startPosition: {
              x: Number(Math.min(100, Math.max(0, target.trajectory.startPosition.x + dx)).toFixed(2)),
              y: Number(Math.min(100, Math.max(0, target.trajectory.startPosition.y + dy)).toFixed(2)),
              z: Number(Math.min(100, Math.max(0, (target.trajectory.startPosition.z ?? 0) + dz)).toFixed(2)),
            },
            endPosition: {
              x: Number(Math.min(100, Math.max(0, target.trajectory.endPosition.x + dx)).toFixed(2)),
              y: Number(Math.min(100, Math.max(0, target.trajectory.endPosition.y + dy)).toFixed(2)),
              z: Number(Math.min(100, Math.max(0, (target.trajectory.endPosition.z ?? curZ) + dz)).toFixed(2)),
            },
            keyframes: curKeyframes.map((kf) => ({
              ...kf,
              position: {
                x: Number(Math.min(100, Math.max(0, kf.position.x + dx)).toFixed(2)),
                y: Number(Math.min(100, Math.max(0, kf.position.y + dy)).toFixed(2)),
                z: Number(Math.min(100, Math.max(0, (kf.position.z ?? 0) + dz)).toFixed(2)),
              },
            })),
          };
        }
      } else {
        // Individual Keyframing: updates position strictly at `time` (creates or updates keyframe without touching other cues)
        updatedTrajectory = recordTrajectoryPositionAtTime(
          target.trajectory,
          time,
          duration,
          position
        );
      }

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

    recordActorPoseAtTime: (actorId, time, pose, posePreset, gait, duration) => {
      const { shot } = get();
      const target = shot.actors.find((a) => a.id === actorId);
      if (!target) return;
      const safeDuration = duration ?? shot.durationSeconds ?? 4.0;
      const updatedTrajectory = recordTrajectoryPoseAtTime(
        target.trajectory,
        time,
        safeDuration,
        pose,
        posePreset,
        gait
      );
      const isAtStart = time <= 0.15;
      const updatedActors = shot.actors.map((a) =>
        a.id === actorId
          ? {
              ...a,
              trajectory: {
                ...updatedTrajectory,
                startTimeSeconds: a.trajectory.startTimeSeconds ?? 0,
              },
              pose: isAtStart ? pose : a.pose,
              posePreset: isAtStart ? (posePreset ?? a.posePreset) : a.posePreset,
              gait: isAtStart ? (gait ?? a.gait) : a.gait,
            }
          : a
      );
      logger.action(`Recorded pose cue for "${target.name}" at ${time.toFixed(1)}s`, { posePreset, gait });
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      commitShot(updated);
    },

    updateActorRotationAtTime: (actorId, time, rotation, duration) => {
      const { shot } = get();
      const target = shot.actors.find((a) => a.id === actorId);
      if (!target) return;
      const safeDuration = duration ?? shot.durationSeconds ?? 4.0;
      const isAtStart = time <= 0.15;
      const currentKeyframes = [...(target.trajectory.keyframes || [])];
      const existingIdx = currentKeyframes.findIndex((k) => Math.abs(k.time - time) <= 0.25);
      if (existingIdx >= 0) {
        currentKeyframes[existingIdx] = { ...currentKeyframes[existingIdx], time, rotation };
      } else {
        const curPos = interpolateTrajectoryPosition(target.trajectory, time, safeDuration);
        currentKeyframes.push({
          id: `kf_rot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          time: Number(time.toFixed(2)),
          position: curPos,
          rotation,
        });
      }
      currentKeyframes.sort((a, b) => a.time - b.time);
      const updatedTrajectory = { ...target.trajectory, keyframes: currentKeyframes };
      const updatedActors = shot.actors.map((a) =>
        a.id === actorId
          ? {
              ...a,
              trajectory: updatedTrajectory,
              rotation: isAtStart ? rotation : (a.rotation || rotation),
            }
          : a
      );
      logger.action(`Updated "${target.name}" rotation at ${time.toFixed(1)}s`, rotation);
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      commitShot(updated);
    },

    socketActorToBone: (propActorId, targetActorId, boneName, offset, rotationOffset) => {
      const { shot } = get();
      const updatedActors = shot.actors.map((a) =>
        a.id === propActorId
          ? {
              ...a,
              socketToBone: { targetActorId, boneName, offset, rotationOffset },
            }
          : a
      );
      logger.action(`Socketed actor "${propActorId}" to "${targetActorId}" bone "${boneName}"`);
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      commitShot(updated);
    },

    unsocketActor: (propActorId) => {
      const { shot } = get();
      const updatedActors = shot.actors.map((a) =>
        a.id === propActorId ? { ...a, socketToBone: undefined } : a
      );
      logger.action(`Unsocketed actor "${propActorId}"`);
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      commitShot(updated);
    },

    applyDirectorialMotion: (actorId, prompt, options) => {
      const { shot } = get();
      const target = shot.actors.find((a) => a.id === actorId);
      if (!target) return;

      const shotDur = shot.durationSeconds || 4.0;
      const winStart = Math.max(0, Math.min(shotDur - 0.2, options?.startTimeSec ?? 0));
      const winEnd = Math.max(winStart + 0.2, Math.min(shotDur, options?.endTimeSec ?? shotDur));
      const winDuration = winEnd - winStart;

      // Sample actor's position at winStart so chained cues (e.g. 0-3s then 3-6s) continue seamlessly from where the previous cue ended
      const startCoord =
        winStart > 0.05
          ? interpolateTrajectoryPosition(target.trajectory, winStart, shotDur)
          : target.trajectory.startPosition;
      const startPos: [number, number] = [
        startCoord.x ?? target.trajectory.startPosition.x ?? 50,
        startCoord.y ?? target.trajectory.startPosition.y ?? 50,
      ];

      const otherActors = shot.actors
        .filter((a) => a.id !== actorId)
        .map((a) => ({
          id: a.id,
          name: a.name,
          position: [a.trajectory.startPosition.x ?? 0, a.trajectory.startPosition.y ?? 0] as [number, number],
          kind: a.kind,
        }));

      const plan = decomposeDirectorialMotion(prompt, {
        actorName: target.name,
        startPosition: startPos,
        actors: otherActors,
      });

      // Scale skill timings proportionally to fill the requested [winStart, winEnd] duration window
      const timeScale = plan.totalDurationSec > 0 ? winDuration / plan.totalDurationSec : 1;
      const scaledPlan = {
        ...plan,
        totalDurationSec: winDuration,
        skills: plan.skills.map((s) => ({
          ...s,
          startTimeSec: Number((s.startTimeSec * timeScale).toFixed(3)),
          durationSec: Number(((s.durationSec ?? 2.0) * timeScale).toFixed(3)),
        })),
      };

      const compiled = compileMotionPlan(scaledPlan, {
        startPosition: startPos,
        startHeadingDeg: 0,
        shotDurationSec: winDuration,
      });

      const shiftedKeyframes = compiled.keyframes.map((kf) => ({
        ...kf,
        time: Number((kf.time + winStart).toFixed(2)),
        position: {
          ...kf.position,
          z: startCoord.z ?? target.trajectory.startPosition.z ?? 0,
        },
      }));

      // Preserve existing keyframes outside [winStart, winEnd] so multi-segment cues can be built sequentially
      const preservedKeyframes = (target.trajectory.keyframes || []).filter(
        (kf) => kf.time < winStart - 0.08 || kf.time > winEnd + 0.08
      );
      const mergedKeyframes = [...preservedKeyframes, ...shiftedKeyframes].sort((a, b) => a.time - b.time);

      const updatedTrajectory = {
        ...target.trajectory,
        keyframes: mergedKeyframes,
        endPosition:
          mergedKeyframes.length > 0
            ? {
                x: mergedKeyframes[mergedKeyframes.length - 1].position.x,
                y: mergedKeyframes[mergedKeyframes.length - 1].position.y,
                z: target.trajectory.endPosition.z ?? 0,
              }
            : target.trajectory.endPosition,
      };

      const isLocomotionPrompt =
        /\b(walk|walks|walking|run|runs|running|sprint|jog|sneak|sneaking|creep|step|stride|move|moves|moving|advance|approach|head|go|drive|drives|driving)\b/i.test(prompt) ||
        /(يمشي|يمش|يركض|يجري|يتسلل|يتحرك|يتجه|يتقدم|يخطو|يسير|الذهاب|المشي)/.test(prompt);

      const detectedGait: ActorGait =
        /\b(run|runs|running|sprint|jog)\b/i.test(prompt) || /(يركض|يجري)/.test(prompt)
          ? 'run'
          : /\b(sneak|sneaking|creep)\b/i.test(prompt) || /(يتسلل)/.test(prompt)
          ? 'sneak'
          : isLocomotionPrompt
          ? 'walk'
          : target.gait || 'auto';

      const detectedPosePreset =
        /\b(sit|sitting|seated)\b/i.test(prompt) || /(يجلس|جالس)/.test(prompt)
          ? 'sitting-chair'
          : /\b(crouch|duck|cover)\b/i.test(prompt)
          ? 'crouch-cover'
          : /\b(kneel)\b/i.test(prompt)
          ? 'hero-kneel'
          : /\b(bow|archer)\b/i.test(prompt)
          ? 'aim-bow'
          : /\b(pistol|gun|firearm|aim)\b/i.test(prompt)
          ? 'aim-pistol'
          : /\b(combat|fight|guard)\b/i.test(prompt)
          ? 'combat-ready'
          : /\b(talk|speak|dialogue|gesture)\b/i.test(prompt) || /(يتحدث|يتكلم)/.test(prompt)
          ? 'dialogue-gesturing'
          : isLocomotionPrompt
          ? undefined
          : target.posePreset;

      const updatedActors = shot.actors.map((a) =>
        a.id === actorId
          ? {
              ...a,
              actionDescription: prompt,
              gait: detectedGait,
              posePreset: detectedPosePreset,
              trajectory: updatedTrajectory,
              pose: compiled.frames.length > 0 ? compiled.frames[0].pose : a.pose,
              ikTargets: compiled.frames.length > 0 ? compiled.frames[0].ikTargets : a.ikTargets,
            }
          : a
      );

      logger.action(`Applied directorial motion plan to "${target.name}" (${plan.skills.length} skills compiled into ${compiled.keyframes.length} keyframes)`);
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      commitShot(updated, { currentTime: winStart, isPlaying: true });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cmpvs:transport-play', { detail: { time: winStart, play: true } }));
      }
    },

    applyReadyMadeMotion: (actorId, clipId, options) => {
      const { shot } = get();
      const target = shot.actors.find((a) => a.id === actorId);
      if (!target) return;

      const shotDur = shot.durationSeconds || 4.0;
      const winStart = Math.max(0, Math.min(shotDur - 0.3, options?.startTimeSec ?? 0));
      const winEnd = Math.max(winStart + 0.4, Math.min(shotDur, options?.endTimeSec ?? shotDur));

      const startCoord =
        winStart > 0.05
          ? interpolateTrajectoryPosition(target.trajectory, winStart, shotDur)
          : target.trajectory.startPosition;

      const compiled = compileReadyMadeMotionKeyframes(target, clipId, {
        startTimeSec: winStart,
        endTimeSec: winEnd,
        startPosition: {
          x: startCoord.x ?? target.trajectory.startPosition.x ?? 50,
          y: startCoord.y ?? target.trajectory.startPosition.y ?? 50,
          z: startCoord.z ?? target.trajectory.startPosition.z ?? 0,
        },
        startRotation: target.rotation,
        travelMode: options?.travelMode ?? 'auto',
        motionCycles: options?.motionCycles ?? target.motionCycles ?? 1,
      });

      const preservedKeyframes = (target.trajectory.keyframes || []).filter(
        (kf) => kf.time < winStart - 0.08 || kf.time > winEnd + 0.08
      );
      const mergedKeyframes = [...preservedKeyframes, ...compiled.keyframes].sort((a, b) => a.time - b.time);

      const updatedTrajectory = {
        ...target.trajectory,
        startPosition:
          winStart <= 0.08 && compiled.keyframes.length > 0
            ? compiled.keyframes[0].position
            : target.trajectory.startPosition,
        endPosition:
          mergedKeyframes.length > 0
            ? mergedKeyframes[mergedKeyframes.length - 1].position
            : compiled.endPosition,
        keyframes: mergedKeyframes,
      };

      const isHumanoid = compiled.clip.category === 'humanoid';
      const uprightRot = isHumanoid
        ? { x: 0, y: target.rotation?.y || 0, z: 0 }
        : compiled.endRotation;

      const updatedActors = shot.actors.map((a) =>
        a.id === actorId
          ? {
              ...a,
              actionDescription: compiled.clip.promptPhrase,
              motionClip: compiled.clip.id,
              motionCycles: Math.max(1, Math.min(20, Math.round(options?.motionCycles ?? target.motionCycles ?? 1))),
              gait: compiled.clip.baseGait ?? 'none',
              posePreset: compiled.clip.basePosePreset,
              pose: undefined,
              rotation: uprightRot,
              trajectory: updatedTrajectory,
            }
          : a
      );

      logger.action(`Applied Ready-Made Motion "${compiled.clip.name}" to "${target.name}" (${winStart.toFixed(1)}s -> ${winEnd.toFixed(1)}s)`);
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      commitShot(updated, { currentTime: winStart, isPlaying: true });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cmpvs:transport-play', { detail: { time: winStart, play: true } }));
      }
    },

    setClaymationMode: (enabled, fps = 12) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        claymationMode: enabled,
        claymationFps: fps,
      };
      logger.action(`Set Claymation stop-motion mode to ${enabled ? `${fps}fps` : 'disabled'}`);
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
      const nextDir = direction || shot.lighting.direction;
      const nextContrast = contrast || shot.lighting.contrast;
      let nextLights = shot.lighting.lights ? [...shot.lighting.lights] : undefined;
      if (nextLights && nextLights.length > 0) {
        const dirChanged = direction && direction !== shot.lighting.direction;
        const styleChanged = style !== shot.lighting.style;
        const primary = { ...nextLights[0] };
        if (dirChanged) {
          primary.position = { ...(DEFAULT_LIGHT_POSITIONS[nextDir] || DEFAULT_LIGHT_POSITIONS['side-key']) };
        }
        if (styleChanged) {
          const def = getStyleDefaultColorAndIntensity(style);
          primary.color = def.color;
          primary.intensity = def.intensity;
        }
        nextLights[0] = primary;
      }
      logger.action(`Set lighting mood to ${style} (dir: ${nextDir}, contrast: ${nextContrast})`);
      const updated: ShotSpec = {
        ...shot,
        lighting: {
          style,
          direction: nextDir,
          contrast: nextContrast,
          lights: nextLights,
        },
      };
      commitShot(updated);
    },

    addStageLight: (partial) => {
      const { shot } = get();
      const existing = getEffectiveStageLights(shot.lighting);
      const idx = existing.length + 1;
      const presetColors = ['#eab308', '#38bdf8', '#f43f5e', '#a855f7', '#10b981', '#fb923c'];
      const presetPositions: Point3D[] = [
        { x: 82, y: 50, z: 45 },
        { x: 20, y: 65, z: 40 },
        { x: 50, y: 18, z: 55 },
        { x: 25, y: 25, z: 50 },
        { x: 75, y: 75, z: 35 },
      ];
      const defaultPos = presetPositions[(idx - 1) % presetPositions.length];
      const newLight: StageLight = {
        id: partial?.id || `light-${Date.now()}-${idx}`,
        name: partial?.name || (idx === 2 ? 'Fill Light' : idx === 3 ? 'Rim Light' : `Light ${idx}`),
        position: partial?.position || { ...defaultPos },
        color: partial?.color || presetColors[(idx - 1) % presetColors.length],
        intensity: partial?.intensity ?? 2.0,
        enabled: partial?.enabled ?? true,
      };
      const nextLights = [...existing, newLight];
      logger.action(`Added stage light "${newLight.name}" (${newLight.color})`, newLight);
      const updated: ShotSpec = {
        ...shot,
        lighting: {
          ...shot.lighting,
          lights: nextLights,
        },
      };
      commitShot(updated);
    },

    updateStageLight: (lightId, updates) => {
      const { shot } = get();
      const existing = getEffectiveStageLights(shot.lighting);
      const nextLights = existing.map((l) =>
        l.id === lightId
          ? {
              ...l,
              ...updates,
              position: updates.position ? { ...l.position, ...updates.position } : l.position,
            }
          : l
      );
      const updated: ShotSpec = {
        ...shot,
        lighting: {
          ...shot.lighting,
          lights: nextLights,
        },
      };
      commitShot(updated);
    },

    removeStageLight: (lightId) => {
      const { shot } = get();
      const existing = getEffectiveStageLights(shot.lighting);
      if (existing.length <= 1) return; // Keep at least 1 stage light
      const nextLights = existing.filter((l) => l.id !== lightId);
      logger.action(`Removed stage light ${lightId}`);
      const updated: ShotSpec = {
        ...shot,
        lighting: {
          ...shot.lighting,
          lights: nextLights,
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

    resetActorsToDefaultLead: () => {
      logger.action('Reset soundstage actors to clean default lead subject');
      const cur = get().shot;
      const lead = cur.actors.find((a) => a.id === 'actor-1') || {
        id: 'actor-1',
        name: 'Lead Subject',
        kind: 'human' as const,
        token: 'a lone traveler in a weathered jacket',
        actionDescription: 'turns head slowly toward the camera with focused gaze',
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: 50, y: 50, z: 0 },
          endPosition: { x: 50, y: 50, z: 0 },
        },
      };
      const cleaned: ShotSpec = {
        ...cur,
        actors: [
          {
            ...lead,
            scale: 1.0,
            trajectory: {
              ...lead.trajectory,
              startPosition: { x: 50, y: 50, z: 0 },
              endPosition: { x: 50, y: 50, z: 0 },
            },
          },
        ],
      };
      commitShot(cleaned, { selectedActorId: 'actor-1' }, { immediatePersist: true });
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

if (typeof window !== 'undefined') {
  (window as unknown as { __useShotStore?: typeof useShotStore }).__useShotStore = useShotStore;
}
