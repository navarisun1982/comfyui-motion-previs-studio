import { create } from 'zustand';
import {
  CinematicSequence,
  SequenceShotItem,
  SequenceTransition,
  SequenceContinuityReport,
} from '../types/sequenceTypes';
import { ShotSpec } from '../types/shotspec';
import { ShotRevisionV2 } from '../pipeline/revisionTypes';
import { calculateSequenceDuration, findShotAtTime } from '../engine/timecodeMath';
import { analyzeSequenceContinuity } from '../engine/sequenceContinuityEngine';
import { safeGetItem, safeSetItem } from '../services/storage';
import { logger } from './useLogStore';

const STORAGE_KEY = 'comfy_director_active_sequence_v1';

interface SequenceState {
  sequence: CinematicSequence;
  selectedShotId: string | null;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  isLooping: boolean;
  continuityReport: SequenceContinuityReport | null;
  isContinuityModalOpen: boolean;
  isExportModalOpen: boolean;

  // Actions
  initializeFromScene: (
    sceneId: string,
    sceneName: string,
    shotItems: Array<{
      id: string;
      code: string;
      title: string;
      duration: string;
      thumbnail?: string;
    }>,
    shotsById: Record<string, ShotSpec>,
    revisions: ShotRevisionV2[]
  ) => void;
  reorderShots: (sourceIndex: number, targetIndex: number) => void;
  setHeroTakeForShot: (shotId: string, take: ShotRevisionV2 | null) => void;
  setTransition: (cutIndex: number, transition: SequenceTransition) => void;
  updateShotTrim: (shotId: string, trimIn: number, trimOut: number) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  toggleLooping: () => void;
  jumpToShot: (index: number) => void;
  setSelectedShotId: (shotId: string | null) => void;
  runContinuityCheck: (shotsById: Record<string, ShotSpec>) => void;
  setContinuityModalOpen: (open: boolean) => void;
  setExportModalOpen: (open: boolean) => void;
  addShotToSequence: (shot: SequenceShotItem) => void;
  removeShotFromSequence: (shotId: string) => void;
}

function createDefaultInitialSequence(): CinematicSequence {
  return {
    id: 'seq-default',
    sceneId: 'scene-1',
    sceneName: 'Scene 01 - Arrival',
    fps: 24,
    shots: [
      {
        shotId: 'shot-01a',
        shotCode: 'Shot 01A',
        title: 'Tracking In',
        durationSeconds: 4.0,
        trimInSeconds: 0,
        trimOutSeconds: 4.0,
        thumbnailUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=160&q=80&auto=format&fit=crop',
      },
      {
        shotId: 'shot-01b',
        shotCode: 'Shot 01B',
        title: 'Pan Right',
        durationSeconds: 5.0,
        trimInSeconds: 0,
        trimOutSeconds: 5.0,
        thumbnailUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=160&q=80&auto=format&fit=crop',
      },
      {
        shotId: 'shot-01c',
        shotCode: 'Shot 01C',
        title: 'Push In',
        durationSeconds: 3.0,
        trimInSeconds: 0,
        trimOutSeconds: 3.0,
        thumbnailUrl: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=160&q=80&auto=format&fit=crop',
      },
      {
        shotId: 'shot-01d',
        shotCode: 'Shot 01D',
        title: 'Low Angle',
        durationSeconds: 4.0,
        trimInSeconds: 0,
        trimOutSeconds: 4.0,
        thumbnailUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=160&q=80&auto=format&fit=crop',
      },
      {
        shotId: 'shot-01e',
        shotCode: 'Shot 01E',
        title: 'Over Shoulder',
        durationSeconds: 5.0,
        trimInSeconds: 0,
        trimOutSeconds: 5.0,
        thumbnailUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=160&q=80&auto=format&fit=crop',
      },
    ],
    totalDurationSeconds: 21.0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function loadPersistedSequence(): CinematicSequence {
  try {
    const saved = safeGetItem<CinematicSequence | null>(STORAGE_KEY, null);
    if (saved && Array.isArray(saved.shots) && saved.shots.length > 0) {
      return saved;
    }
  } catch (err) {
    console.error('Failed to load sequence from storage:', err);
  }
  return createDefaultInitialSequence();
}

export const useSequenceStore = create<SequenceState>((set, get) => {
  const initialSeq = loadPersistedSequence();

  return {
    sequence: initialSeq,
    selectedShotId: initialSeq.shots[0]?.shotId ?? null,
    currentTime: 0,
    isPlaying: false,
    playbackSpeed: 1.0,
    isLooping: true,
    continuityReport: null,
    isContinuityModalOpen: false,
    isExportModalOpen: false,

    initializeFromScene: (sceneId, sceneName, shotItems, shotsById, revisions) => {
      const shots: SequenceShotItem[] = shotItems.map((item) => {
        const spec = shotsById[item.id];
        const dur = spec ? spec.durationSeconds : parseInt(item.duration, 10) || 4.0;
        
        // Find hero take or newest circled take for this shot
        const takesForShot = revisions.filter((r) => r.shotId === item.id);
        const circledTake = takesForShot.find((r) => r.isCircled) || takesForShot[takesForShot.length - 1];

        return {
          shotId: item.id,
          shotCode: item.code,
          title: item.title,
          durationSeconds: dur,
          trimInSeconds: 0,
          trimOutSeconds: dur,
          thumbnailUrl: item.thumbnail,
          heroTakeId: circledTake?.id,
          heroTakeNumber: circledTake?.takeNumber ?? circledTake?.version,
          heroTakeVideoUrl: circledTake?.outputVideoUrl,
          heroFidelityScore: circledTake?.motionFidelity?.overallScore,
          shotSpecSnapshot: spec,
        };
      });

      const totalDuration = calculateSequenceDuration(shots);

      const sequence: CinematicSequence = {
        id: `seq-${sceneId}`,
        sceneId,
        sceneName,
        fps: 24,
        shots,
        totalDurationSeconds: totalDuration,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      safeSetItem(STORAGE_KEY, sequence);
      logger.action(`Loaded sequence for "${sceneName}" (${shots.length} shots, ${totalDuration.toFixed(1)}s)`);

      const report = analyzeSequenceContinuity(sequence, shotsById);

      set({
        sequence,
        selectedShotId: shots[0]?.shotId ?? null,
        currentTime: 0,
        isPlaying: false,
        continuityReport: report,
      });
    },

    reorderShots: (sourceIndex, targetIndex) => {
      const { sequence } = get();
      if (sourceIndex === targetIndex) return;
      if (sourceIndex < 0 || sourceIndex >= sequence.shots.length) return;
      if (targetIndex < 0 || targetIndex >= sequence.shots.length) return;

      const updatedShots = [...sequence.shots];
      const [moved] = updatedShots.splice(sourceIndex, 1);
      updatedShots.splice(targetIndex, 0, moved);

      const updatedSequence: CinematicSequence = {
        ...sequence,
        shots: updatedShots,
        updatedAt: Date.now(),
      };

      safeSetItem(STORAGE_KEY, updatedSequence);
      logger.action(`Reordered shot ${moved.shotCode} in timeline (position ${sourceIndex + 1} -> ${targetIndex + 1})`);

      set({ sequence: updatedSequence });
    },

    setHeroTakeForShot: (shotId, take) => {
      const { sequence } = get();
      const updatedShots = sequence.shots.map((shot) => {
        if (shot.shotId !== shotId) return shot;
        if (!take) {
          return {
            ...shot,
            heroTakeId: undefined,
            heroTakeNumber: undefined,
            heroTakeVideoUrl: undefined,
            heroFidelityScore: undefined,
          };
        }
        return {
          ...shot,
          heroTakeId: take.id,
          heroTakeNumber: take.takeNumber ?? take.version,
          heroTakeVideoUrl: take.outputVideoUrl,
          heroFidelityScore: take.motionFidelity?.overallScore,
        };
      });

      const updatedSequence: CinematicSequence = {
        ...sequence,
        shots: updatedShots,
        updatedAt: Date.now(),
      };

      safeSetItem(STORAGE_KEY, updatedSequence);
      logger.action(`Assigned hero take ${take ? `Take ${take.takeNumber ?? take.version}` : 'None'} to shot ${shotId}`);

      set({ sequence: updatedSequence });
    },

    setTransition: (cutIndex, transition) => {
      const { sequence } = get();
      if (cutIndex < 0 || cutIndex >= sequence.shots.length - 1) return;

      const updatedShots = sequence.shots.map((shot, idx) => {
        if (idx !== cutIndex) return shot;
        return {
          ...shot,
          transitionAfter: transition,
        };
      });

      const updatedSequence: CinematicSequence = {
        ...sequence,
        shots: updatedShots,
        updatedAt: Date.now(),
      };

      safeSetItem(STORAGE_KEY, updatedSequence);
      set({ sequence: updatedSequence });
    },

    updateShotTrim: (shotId, trimIn, trimOut) => {
      const { sequence } = get();
      const updatedShots = sequence.shots.map((shot) => {
        if (shot.shotId !== shotId) return shot;
        const validIn = Math.max(0, Math.min(trimIn, shot.durationSeconds - 0.2));
        const validOut = Math.max(validIn + 0.2, Math.min(trimOut, shot.durationSeconds));
        return {
          ...shot,
          trimInSeconds: validIn,
          trimOutSeconds: validOut,
        };
      });

      const totalDuration = calculateSequenceDuration(updatedShots);

      const updatedSequence: CinematicSequence = {
        ...sequence,
        shots: updatedShots,
        totalDurationSeconds: totalDuration,
        updatedAt: Date.now(),
      };

      safeSetItem(STORAGE_KEY, updatedSequence);
      set({ sequence: updatedSequence });
    },

    setCurrentTime: (time) => {
      const { sequence, isLooping } = get();
      let clamped = Math.max(0, time);
      if (clamped >= sequence.totalDurationSeconds) {
        if (isLooping) {
          clamped = 0;
        } else {
          clamped = sequence.totalDurationSeconds;
          set({ isPlaying: false });
        }
      }

      // Update selected shot based on playhead
      const { shot } = findShotAtTime(sequence.shots, clamped, sequence.fps);
      set({
        currentTime: clamped,
        selectedShotId: shot ? shot.shotId : get().selectedShotId,
      });
    },

    setIsPlaying: (playing) => set({ isPlaying: playing }),

    setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

    toggleLooping: () => set((s) => ({ isLooping: !s.isLooping })),

    jumpToShot: (index) => {
      const { sequence } = get();
      if (index < 0 || index >= sequence.shots.length) return;
      let timeOffset = 0;
      for (let i = 0; i < index; i++) {
        const s = sequence.shots[i];
        const dur = (s.trimOutSeconds ?? s.durationSeconds) - (s.trimInSeconds ?? 0);
        timeOffset += Math.max(0.2, dur);
      }
      set({
        currentTime: timeOffset,
        selectedShotId: sequence.shots[index].shotId,
      });
    },

    setSelectedShotId: (shotId) => set({ selectedShotId: shotId }),

    runContinuityCheck: (shotsById) => {
      const { sequence } = get();
      const report = analyzeSequenceContinuity(sequence, shotsById);
      set({ continuityReport: report });
    },

    setContinuityModalOpen: (open) => set({ isContinuityModalOpen: open }),

    setExportModalOpen: (open) => set({ isExportModalOpen: open }),

    addShotToSequence: (shot) => {
      const { sequence } = get();
      const updatedShots = [...sequence.shots, shot];
      const totalDuration = calculateSequenceDuration(updatedShots);
      const updated: CinematicSequence = {
        ...sequence,
        shots: updatedShots,
        totalDurationSeconds: totalDuration,
        updatedAt: Date.now(),
      };
      safeSetItem(STORAGE_KEY, updated);
      set({ sequence: updated });
    },

    removeShotFromSequence: (shotId) => {
      const { sequence } = get();
      const updatedShots = sequence.shots.filter((s) => s.shotId !== shotId);
      const totalDuration = calculateSequenceDuration(updatedShots);
      const updated: CinematicSequence = {
        ...sequence,
        shots: updatedShots,
        totalDurationSeconds: totalDuration,
        updatedAt: Date.now(),
      };
      safeSetItem(STORAGE_KEY, updated);
      set({ sequence: updated });
    },
  };
});
