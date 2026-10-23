import { ShotSpec, CameraMovementType } from '../types/shotspec';
import { ApiWorkflow, EngineId, GenerationMode, QualityProfile } from './templateTypes';

export interface MotionVectorGridPoint {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  dx: number;
  dy: number;
  magnitude: number;
}

export interface MotionFidelityAnalysis {
  overallScore: number; // 0..100
  directionalScore: number; // 0..100
  speedScore: number; // 0..100
  stabilityScore: number; // 0..100
  detectedMovement: CameraMovementType;
  directedMovement: CameraMovementType;
  achievedVector: {
    avgDx: number;
    avgDy: number;
    divergence: number;
    magnitude: number;
  };
  expectedVector: {
    expectedDx: number;
    expectedDy: number;
    expectedDivergence: number;
  };
  gridVectors?: MotionVectorGridPoint[];
  classification: 'excellent' | 'good' | 'fair' | 'drift';
  summary: string;
  recommendations: string[];
  analyzedAt: number;
}

export interface ShotRevisionV2 {
  id: string;
  shotId: string;
  version: number;
  createdAt: number;
  /** Backwards compatibility alias for createdAt */
  timestamp?: number;
  note: string;
  engine: EngineId;
  templateId: string;
  templateHash: string;
  bindingSchema: number;
  mode: GenerationMode;
  profile: QualityProfile;
  seed: number;
  prompt: string;
  /** Backwards compatibility alias for prompt */
  compiledPrompt?: string;
  negative: string;
  promptSource: 'compiled' | 'ai' | 'manual';
  submittedWorkflow: ApiWorkflow;
  promptId?: string;
  status: 'completed' | 'failed' | 'interrupted';
  outputVideoUrl?: string;
  outputFilename?: string;
  shotSpec: ShotSpec;
  isLegacy?: boolean;
  isCircled?: boolean;
  rating?: number;
  takeNumber?: number;
  motionFidelity?: MotionFidelityAnalysis;
}
