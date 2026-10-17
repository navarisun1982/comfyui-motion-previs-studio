import { create } from 'zustand';
import { ShotSpec, createDefaultShotSpec, CameraMovementType, FocalLength, CameraAngle, LightingStyle, LightingDirection, Actor, ShotType } from '../types/shotspec';
import { getAdapter } from '../adapters';
import { ValidationReport, CompiledPromptBundle } from '../adapters/types';
import { logger } from './useLogStore';

interface ShotState {
  shot: ShotSpec;
  validation: ValidationReport;
  compiledPrompt: CompiledPromptBundle;
  isDirty: boolean;

  // Setters & Actions
  updateShotName: (name: string) => void;
  updateDuration: (seconds: number) => void;
  updateAspectRatio: (ratio: ShotSpec['aspectRatio']) => void;
  updateTargetModel: (model: ShotSpec['targetModel']) => void;
  
  // Camera
  setFocalLength: (focalLength: FocalLength) => void;
  setShotType: (shotType: ShotType) => void;
  setCameraAngle: (angle: CameraAngle) => void;
  setCameraMovement: (type: CameraMovementType, speed?: ShotSpec['camera']['movement']['speed']) => void;
  setCameraPositions: (start: ShotSpec['camera']['movement']['startPosition'], end: ShotSpec['camera']['movement']['endPosition']) => void;
  
  // Actors
  updateActor: (actorId: string, updates: Partial<Actor>) => void;
  addActor: (name?: string) => void;
  removeActor: (actorId: string) => void;

  // Lighting & Mood
  setLighting: (style: LightingStyle, direction?: LightingDirection, contrast?: 'soft' | 'balanced' | 'high-contrast') => void;
  
  // Context & Reference
  setSceneDescription: (desc: string) => void;
  setNegativePrompt: (neg: string) => void;
  setReferenceImage: (ref?: ShotSpec['referenceImage']) => void;
  
  // Full Reset / Load
  loadShot: (shot: ShotSpec) => void;
  resetToDefault: () => void;
}

const initialShot = createDefaultShotSpec();
const initialAdapter = getAdapter(initialShot.targetModel);

export const useShotStore = create<ShotState>((set, get) => {
  const evaluate = (shot: ShotSpec) => {
    const adapter = getAdapter(shot.targetModel);
    const validation = adapter.validate(shot);
    const compiledPrompt = adapter.compilePrompt(shot);
    return { validation, compiledPrompt };
  };

  return {
    shot: initialShot,
    validation: initialAdapter.validate(initialShot),
    compiledPrompt: initialAdapter.compilePrompt(initialShot),
    isDirty: false,

    updateShotName: (name) => {
      const shot = { ...get().shot, name };
      logger.action(`Renamed shot to "${name}"`);
      set({ shot, ...evaluate(shot), isDirty: true });
    },

    updateDuration: (durationSeconds) => {
      const shot = { ...get().shot, durationSeconds };
      logger.action(`Updated shot duration to ${durationSeconds}s`);
      set({ shot, ...evaluate(shot), isDirty: true });
    },

    updateAspectRatio: (aspectRatio) => {
      const shot = { ...get().shot, aspectRatio };
      logger.action(`Switched aspect ratio to ${aspectRatio}`);
      set({ shot, ...evaluate(shot), isDirty: true });
    },

    updateTargetModel: (targetModel) => {
      const shot = { ...get().shot, targetModel };
      logger.action(`Switched target model to "${targetModel}"`);
      set({ shot, ...evaluate(shot), isDirty: true });
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
      set({ shot: updated, ...evaluate(updated), isDirty: true });
    },

    setShotType: (shotType) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        camera: { ...shot.camera, shotType },
      };
      logger.action(`Changed shot framing to ${shotType}`);
      set({ shot: updated, ...evaluate(updated), isDirty: true });
    },

    setCameraAngle: (angle) => {
      const { shot } = get();
      const updated: ShotSpec = {
        ...shot,
        camera: { ...shot.camera, angle },
      };
      logger.action(`Changed camera angle to ${angle}`);
      set({ shot: updated, ...evaluate(updated), isDirty: true });
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
      set({ shot: updated, ...evaluate(updated), isDirty: true });
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
      set({ shot: updated, ...evaluate(updated), isDirty: true });
    },

    updateActor: (actorId, updates) => {
      const { shot } = get();
      const updatedActors = shot.actors.map((a) => (a.id === actorId ? { ...a, ...updates } : a));
      const targetActor = updatedActors.find(a => a.id === actorId);
      logger.action(`Updated actor "${targetActor?.name || actorId}" properties`, updates);
      const updated: ShotSpec = { ...shot, actors: updatedActors };
      set({ shot: updated, ...evaluate(updated), isDirty: true });
    },

    addActor: (name = 'Supporting Character') => {
      const { shot } = get();
      const newActor: Actor = {
        id: `actor-${Date.now()}`,
        name,
        token: 'a mysterious figure in the shadows',
        actionDescription: 'watches intently from the edge of frame',
        trajectory: {
          startTimeSeconds: 1.0,
          startPosition: { x: 30, y: 40 },
          endPosition: { x: 35, y: 45 },
        },
      };
      logger.action(`Added character to stage: "${name}"`, newActor);
      const updated: ShotSpec = { ...shot, actors: [...shot.actors, newActor] };
      set({ shot: updated, ...evaluate(updated), isDirty: true });
    },

    removeActor: (actorId) => {
      const { shot } = get();
      const target = shot.actors.find(a => a.id === actorId);
      logger.action(`Removed character from stage: "${target?.name || actorId}"`);
      const updated: ShotSpec = {
        ...shot,
        actors: shot.actors.filter((a) => a.id !== actorId),
      };
      set({ shot: updated, ...evaluate(updated), isDirty: true });
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
      set({ shot: updated, ...evaluate(updated), isDirty: true });
    },

    setSceneDescription: (sceneDescription) => {
      const shot = { ...get().shot, sceneDescription };
      logger.action(`Updated scene narrative description (${sceneDescription.length} chars)`);
      set({ shot, ...evaluate(shot), isDirty: true });
    },

    setNegativePrompt: (negativePrompt) => {
      const shot = { ...get().shot, negativePrompt };
      logger.action(`Updated negative prompt filter (${negativePrompt.length} chars)`);
      set({ shot, ...evaluate(shot), isDirty: true });
    },

    setReferenceImage: (referenceImage) => {
      const shot = { ...get().shot, referenceImage };
      logger.action(`Assigned reference image for Image-to-Video`, { hasImage: !!referenceImage });
      set({ shot, ...evaluate(shot), isDirty: true });
    },

    loadShot: (shot) => {
      logger.action(`Loaded shot "${shot.name}" (${shot.id}) into active editor`);
      set({ shot, ...evaluate(shot), isDirty: false });
    },

    resetToDefault: () => {
      logger.action(`Reset director studio state to default master shot`);
      const fresh = createDefaultShotSpec();
      set({ shot: fresh, ...evaluate(fresh), isDirty: false });
    },
  };
});
