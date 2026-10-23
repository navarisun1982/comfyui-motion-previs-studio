import { ShotSpec, CameraMovementType } from '../types/shotspec';

export type CapabilityTier = 'native' | 'approximated' | 'unsupported';

export interface ModelCapabilities {
  targetModelId: string;
  name: string;
  isOpenWeights: boolean;
  maxDurationSeconds: number;
  supportedAspectRatios: string[];
  cameraMovements: Record<CameraMovementType, CapabilityTier>;
  focalLengthControl: CapabilityTier;
  actorTrajectoryControl: CapabilityTier;
  referenceImageControl: CapabilityTier;
  lightingControl: CapabilityTier;
}

export interface TemporalPromptBeat {
  timeRange: string;
  cameraAction: string;
  actorAction: string;
  description: string;
}

export interface CompiledPromptBundle {
  positivePrompt: string;
  negativePrompt: string;
  cameraDirectives: string;
  actorDirectives: string;
  lightingDirectives: string;
  styleDirectives: string;
  temporalBeats?: TemporalPromptBeat[];
  modelPromptParadigm?: 'ltx-continuous-narrative' | 'minimax-structured-cinematic' | 'seedance-motion-matrix';
  technicalMetadata: {
    targetModel: string;
    duration: number;
    fps: number;
    focalLength: string;
    aspectRatio: string;
    vfxReferenceMode?: string;
    depthGuidance?: number;
    [key: string]: unknown;
  };
}

export interface ComfyNode {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: {
    title?: string;
  };
}

export type ComfyWorkflowGraph = Record<string, ComfyNode>;

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  capabilityNotes: Array<{
    feature: string;
    tier: CapabilityTier;
    explanation: string;
  }>;
}

export interface ModelCapabilityAdapter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: ModelCapabilities;

  validate(shot: ShotSpec): ValidationReport;
  compilePrompt(shot: ShotSpec): CompiledPromptBundle;
  /**
   * @deprecated Legacy hand-crafted graph builder. In S1+, execution is template-driven
   * via JobRunner, ApiWorkflow templates, and TemplateBinding schemas. Kept for backwards
   * compatibility with standalone adapter tests.
   */
  buildWorkflow(shot: ShotSpec, uploadedImageFilename?: string): ComfyWorkflowGraph;
}
