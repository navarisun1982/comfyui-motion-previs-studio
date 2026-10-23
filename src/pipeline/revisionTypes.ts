import { ShotSpec } from '../types/shotspec';
import { ApiWorkflow, EngineId, GenerationMode, QualityProfile } from './templateTypes';

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
}
