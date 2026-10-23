import { ShotSpec } from './shotspec';

export type TransitionType = 'cut' | 'dissolve' | 'fade-black' | 'wipe-left' | 'wipe-right';

export interface SequenceTransition {
  type: TransitionType;
  durationSeconds: number; // e.g. 0.5s for dissolve
}

export interface SequenceShotItem {
  shotId: string;
  shotCode: string; // e.g. "Shot 01A"
  title: string;    // e.g. "Tracking In"
  durationSeconds: number;
  trimInSeconds: number;  // Offset from start of clip, default 0
  trimOutSeconds: number; // Offset from start for end of clip, default durationSeconds
  heroTakeId?: string;    // ID of the chosen hero take from ShotRevisionV2
  heroTakeNumber?: number;
  heroTakeVideoUrl?: string;
  heroFidelityScore?: number;
  previsVideoUrl?: string;
  thumbnailUrl?: string;
  shotSpecSnapshot?: ShotSpec;
  transitionAfter?: SequenceTransition; // Transition to next shot
}

export interface CinematicSequence {
  id: string;
  sceneId: string;
  sceneName: string;
  fps: number;
  shots: SequenceShotItem[];
  totalDurationSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export type ContinuityRuleType =
  | '180_degree_rule'
  | 'jump_cut'
  | 'motion_clash'
  | 'lighting_mismatch'
  | 'aspect_mismatch'
  | 'pacing_drag'
  | 'pacing_rush';

export interface ContinuityIssue {
  cutIndex: number; // Index between shot i and i+1
  shotFromId: string;
  shotFromName: string;
  shotToId: string;
  shotToName: string;
  severity: 'error' | 'warning' | 'info';
  rule: ContinuityRuleType;
  title: string;
  description: string;
  directorRecommendation: string;
}

export interface SequenceContinuityReport {
  overallScore: number; // 0 - 100%
  rating: 'exemplary' | 'sound' | 'needs_coverage' | 'disjointed';
  totalCuts: number;
  cleanCutsCount: number;
  issues: ContinuityIssue[];
  pacingRhythmSummary: string;
  directorNotes: string[];
  analyzedAt: number;
}

export type SequenceExportFormat = 'otio' | 'edl' | 'fcpxml';
