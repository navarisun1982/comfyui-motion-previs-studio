import { create } from 'zustand';
import { ShotSpec } from '../types/shotspec';
import { logger } from './useLogStore';

export interface ShotRevision {
  id: string;
  version: number;
  timestamp: number;
  note: string;
  shotSpec: ShotSpec;
  compiledPrompt: string;
  outputVideoUrl?: string;
}

export interface ParameterDiffItem {
  category: 'Camera' | 'Actors' | 'Lighting' | 'Canvas' | 'Prompt';
  label: string;
  valueA: string;
  valueB: string;
  changed: boolean;
}

interface HistoryState {
  revisions: ShotRevision[];
  activeRevisionId: string | null;
  comparisonRevisionId: string | null;

  saveRevision: (shot: ShotSpec, compiledPrompt: string, outputVideoUrl?: string, note?: string) => string;
  setActiveRevision: (id: string | null) => void;
  setComparisonRevision: (id: string | null) => void;
  deleteRevision: (id: string) => void;
  clearHistory: () => void;
  getRevision: (id: string) => ShotRevision | undefined;
}

const STORAGE_KEY = 'ai_director_shot_revisions_v1';

function loadPersistedRevisions(): ShotRevision[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function persistRevisions(revs: ShotRevision[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(revs));
  } catch {
    // Ignore storage quota or environment restrictions
  }
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  revisions: loadPersistedRevisions(),
  activeRevisionId: null,
  comparisonRevisionId: null,

  saveRevision: (shot, compiledPrompt, outputVideoUrl, note) => {
    const existing = get().revisions;
    const versionNumber = existing.filter((r) => r.shotSpec.id === shot.id).length + 1;
    
    const revision: ShotRevision = {
      id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      version: versionNumber,
      timestamp: Date.now(),
      note: note || `Revision ${versionNumber}: ${shot.camera.movement.type} (${shot.camera.lens.focalLength})`,
      shotSpec: JSON.parse(JSON.stringify(shot)),
      compiledPrompt,
      outputVideoUrl,
    };

    const updated = [revision, ...existing];
    set({ revisions: updated, activeRevisionId: revision.id });
    persistRevisions(updated);
    logger.action(`Saved shot revision #${versionNumber} ("${revision.note}")`, { revisionId: revision.id });
    return revision.id;
  },

  setActiveRevision: (id) => {
    logger.action(`Active revision set to ${id || 'none'}`);
    set({ activeRevisionId: id });
  },

  setComparisonRevision: (id) => {
    logger.action(`Comparison diff target set to ${id || 'none'}`);
    set({ comparisonRevisionId: id });
  },

  deleteRevision: (id) => {
    const filtered = get().revisions.filter((r) => r.id !== id);
    logger.action(`Deleted shot revision ${id}`);
    set({
      revisions: filtered,
      activeRevisionId: get().activeRevisionId === id ? null : get().activeRevisionId,
      comparisonRevisionId: get().comparisonRevisionId === id ? null : get().comparisonRevisionId,
    });
    persistRevisions(filtered);
  },

  clearHistory: () => {
    logger.action('Cleared all shot revision history');
    set({ revisions: [], activeRevisionId: null, comparisonRevisionId: null });
    persistRevisions([]);
  },

  getRevision: (id) => get().revisions.find((r) => r.id === id),
}));

export function computeShotDiff(shotA: ShotSpec, shotB: ShotSpec): ParameterDiffItem[] {
  const items: ParameterDiffItem[] = [];

  const add = (category: ParameterDiffItem['category'], label: string, valA: unknown, valB: unknown) => {
    const sA = String(valA ?? '');
    const sB = String(valB ?? '');
    items.push({
      category,
      label,
      valueA: sA,
      valueB: sB,
      changed: sA !== sB,
    });
  };

  // Camera
  add('Camera', 'Focal Length', shotA.camera.lens.focalLength, shotB.camera.lens.focalLength);
  add('Camera', 'Shot Type', shotA.camera.shotType, shotB.camera.shotType);
  add('Camera', 'Camera Angle', shotA.camera.angle, shotB.camera.angle);
  add('Camera', 'Movement Type', shotA.camera.movement.type, shotB.camera.movement.type);
  add('Camera', 'Movement Speed', shotA.camera.movement.speed, shotB.camera.movement.speed);
  add(
    'Camera',
    'Trajectory (Start -> End)',
    `(${shotA.camera.movement.startPosition.x}, ${shotA.camera.movement.startPosition.y}) -> (${shotA.camera.movement.endPosition.x}, ${shotA.camera.movement.endPosition.y})`,
    `(${shotB.camera.movement.startPosition.x}, ${shotB.camera.movement.startPosition.y}) -> (${shotB.camera.movement.endPosition.x}, ${shotB.camera.movement.endPosition.y})`
  );

  // Canvas
  add('Canvas', 'Duration', `${shotA.durationSeconds}s`, `${shotB.durationSeconds}s`);
  add('Canvas', 'Aspect Ratio', shotA.aspectRatio, shotB.aspectRatio);
  add('Canvas', 'Target Model', shotA.targetModel, shotB.targetModel);

  // Lighting
  add('Lighting', 'Style', shotA.lighting.style, shotB.lighting.style);
  add('Lighting', 'Direction', shotA.lighting.direction, shotB.lighting.direction);
  add('Lighting', 'Contrast', shotA.lighting.contrast, shotB.lighting.contrast);

  // Actors
  add(
    'Actors',
    'Actors Count',
    `${shotA.actors.length} (${shotA.actors.map((a) => a.name).join(', ')})`,
    `${shotB.actors.length} (${shotB.actors.map((a) => a.name).join(', ')})`
  );

  // Scene Description
  add('Prompt', 'Scene Concept', shotA.sceneDescription, shotB.sceneDescription);

  return items;
}
