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

export interface CompiledPromptBundle {
  positivePrompt: string;
  negativePrompt: string;
  cameraDirectives: string;
  actorDirectives: string;
  lightingDirectives: string;
  styleDirectives: string;
  technicalMetadata: {
    targetModel: string;
    duration: number;
    fps: number;
    focalLength: string;
    aspectRatio: string;
  };
}

export interface ComfyNode {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: {
    title: string;
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
  buildWorkflow(shot: ShotSpec, uploadedImageFilename?: string): ComfyWorkflowGraph;
}
