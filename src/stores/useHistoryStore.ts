import { create } from 'zustand';
import { ShotSpec } from '../types/shotspec';
import { logger } from './useLogStore';
import { ShotRevisionV2 } from '../pipeline/revisionTypes';
import { safeGetItem, safeSetItem } from '../services/storage';

export type ShotRevision = ShotRevisionV2;

export interface ParameterDiffItem {
  category: 'Camera' | 'Actors' | 'Lighting' | 'Canvas' | 'Prompt';
  label: string;
  valueA: string;
  valueB: string;
  changed: boolean;
}

export interface SaveRevisionParams {
  shot: ShotSpec;
  engine: ShotRevisionV2['engine'];
  templateId: string;
  templateHash: string;
  bindingSchema: number;
  mode: ShotRevisionV2['mode'];
  profile: ShotRevisionV2['profile'];
  seed: number;
  prompt: string;
  negative: string;
  promptSource: ShotRevisionV2['promptSource'];
  submittedWorkflow: ShotRevisionV2['submittedWorkflow'];
  promptId?: string;
  status?: ShotRevisionV2['status'];
  outputVideoUrl?: string;
  outputFilename?: string;
  note?: string;
}

interface HistoryState {
  revisions: ShotRevision[];
  activeRevisionId: string | null;
  comparisonRevisionId: string | null;

  saveRevisionV2: (params: SaveRevisionParams) => string;
  /** Backwards compatible signature for existing UI callers. */
  saveRevision: (shot: ShotSpec, compiledPrompt: string, outputVideoUrl?: string, note?: string) => string;
  setActiveRevision: (id: string | null) => void;
  setComparisonRevision: (id: string | null) => void;
  deleteRevision: (id: string) => void;
  clearHistory: () => void;
  getRevision: (id: string) => ShotRevision | undefined;
}

const STORAGE_KEY_V2 = 'comfy_previs_shot_revisions_v2';
const STORAGE_KEY_V1 = 'ai_director_shot_revisions_v1';

function loadPersistedRevisions(): ShotRevision[] {
  try {
    // Check v2 first
    const rawV2 = safeGetItem<ShotRevision[] | null>(STORAGE_KEY_V2, null);
    if (rawV2 && Array.isArray(rawV2)) {
      return rawV2;
    }

    // Migrate v1 if present
    const v1List = safeGetItem<any[] | null>(STORAGE_KEY_V1, null);
    if (v1List && Array.isArray(v1List)) {
      const migrated: ShotRevision[] = v1List.map((r: any) => ({
        id: r.id || `rev-${Date.now()}`,
        shotId: r.shotSpec?.id || 'unknown',
        version: r.version || 1,
        createdAt: r.timestamp || Date.now(),
        timestamp: r.timestamp || Date.now(),
        note: r.note || 'Legacy revision',
        engine: (r.shotSpec?.targetModel as any) === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5',
        templateId: 'legacy_template',
        templateHash: '',
        bindingSchema: 1,
        mode: 't2v',
        profile: 'final',
        seed: r.shotSpec?.seed ?? 42,
        prompt: r.compiledPrompt || '',
        compiledPrompt: r.compiledPrompt || '',
        negative: r.shotSpec?.negativePrompt || '',
        promptSource: 'compiled',
        submittedWorkflow: {},
        status: 'completed',
        outputVideoUrl: r.outputVideoUrl,
        outputFilename: undefined,
        shotSpec: r.shotSpec || {},
        isLegacy: true,
      }));
      persistRevisions(migrated);
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

function persistRevisions(revs: ShotRevision[]): void {
  safeSetItem(STORAGE_KEY_V2, revs);
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  revisions: loadPersistedRevisions(),
  activeRevisionId: null,
  comparisonRevisionId: null,

  saveRevisionV2: (params) => {
    const existing = get().revisions;
    const versionNumber = existing.filter((r) => r.shotId === params.shot.id).length + 1;

    const revision: ShotRevision = {
      id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shotId: params.shot.id,
      version: versionNumber,
      createdAt: Date.now(),
      timestamp: Date.now(),
      note: params.note || `Revision ${versionNumber}: ${params.engine} (${params.shot.camera.movement.type})`,
      engine: params.engine,
      templateId: params.templateId,
      templateHash: params.templateHash,
      bindingSchema: params.bindingSchema,
      mode: params.mode,
      profile: params.profile,
      seed: params.seed,
      prompt: params.prompt,
      compiledPrompt: params.prompt,
      negative: params.negative,
      promptSource: params.promptSource,
      submittedWorkflow: params.submittedWorkflow,
      promptId: params.promptId,
      status: params.status || 'completed',
      outputVideoUrl: params.outputVideoUrl,
      outputFilename: params.outputFilename,
      shotSpec: JSON.parse(JSON.stringify(params.shot)),
      isLegacy: false,
    };

    const updated = [revision, ...existing];
    set({ revisions: updated, activeRevisionId: revision.id });
    persistRevisions(updated);
    logger.action(`Saved shot revision #${versionNumber} ("${revision.note}")`, { revisionId: revision.id });
    return revision.id;
  },

  saveRevision: (shot, compiledPrompt, outputVideoUrl, note) => {
    return get().saveRevisionV2({
      shot,
      engine: shot.targetModel === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5',
      templateId: 'unspecified',
      templateHash: '',
      bindingSchema: 1,
      mode: 't2v',
      profile: 'final',
      seed: shot.seed ?? 42,
      prompt: compiledPrompt,
      negative: shot.negativePrompt,
      promptSource: 'compiled',
      submittedWorkflow: {},
      outputVideoUrl,
      note,
    });
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
