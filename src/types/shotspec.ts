import { z } from 'zod';
export * from './environment';
import { EnvironmentSpecSchema, CINEMATIC_ENVIRONMENT_PRESETS } from './environment';

export const FocalLengthSchema = z.enum(['18mm', '24mm', '35mm', '50mm', '85mm', '135mm']);
export type FocalLength = z.infer<typeof FocalLengthSchema>;

export const SensorSizeSchema = z.enum(['full-frame', 'super35', 'anamorphic']);
export type SensorSize = z.infer<typeof SensorSizeSchema>;

export const ApertureSchema = z.enum(['f/1.4', 'f/2.8', 'f/5.6', 'f/11']);
export type Aperture = z.infer<typeof ApertureSchema>;

export const ShotTypeSchema = z.enum([
  'extreme-wide',
  'wide',
  'medium-wide',
  'medium',
  'medium-close-up',
  'close-up',
  'extreme-close-up',
]);
export type ShotType = z.infer<typeof ShotTypeSchema>;

export const CameraAngleSchema = z.enum([
  'eye-level',
  'low-angle',
  'high-angle',
  'overhead-gods-eye',
  'ground-level',
  'dutch-angle',
]);
export type CameraAngle = z.infer<typeof CameraAngleSchema>;

export const CameraMovementTypeSchema = z.enum([
  'static',
  'dolly-in',
  'dolly-out',
  'truck-left',
  'truck-right',
  'pedestal-up',
  'pedestal-down',
  'pan-left',
  'pan-right',
  'tilt-up',
  'tilt-down',
  'orbit-clockwise',
  'orbit-counter-clockwise',
  'zoom-in',
  'zoom-out',
  'handheld-subtle',
  'whip-pan',
]);
export type CameraMovementType = z.infer<typeof CameraMovementTypeSchema>;

export const MovementSpeedSchema = z.enum(['slow-cinematic', 'moderate', 'rapid-dynamic']);
export type MovementSpeed = z.infer<typeof MovementSpeedSchema>;

export const Point2DSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  z: z.number().min(0).max(100).optional(),
});
export type Point2D = z.infer<typeof Point2DSchema>;

export const Point3DSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  z: z.number().min(0).max(100).default(50),
});
export type Point3D = z.infer<typeof Point3DSchema>;

export const VfxReferenceModeSchema = z.enum([
  'camera-only',
  'actor-motion',
  'object-motion',
  'full-scene',
]);
export type VfxReferenceMode = z.infer<typeof VfxReferenceModeSchema>;

export const VfxReferenceSchema = z.object({
  videoUrl: z.string().optional(),
  fileName: z.string().optional(),
  referenceMode: VfxReferenceModeSchema.default('actor-motion'),
  depthGuidanceWeight: z.number().min(0).max(1).default(0.7),
  edgeFidelity: z.number().min(0).max(1).default(0.5),
  motionRetention: z.number().min(0.1).max(1).default(0.65),
  trimStartSeconds: z.number().min(0).default(0),
  trimEndSeconds: z.number().min(0).default(4),
  solvedCameraMove: z.string().optional(),
  depthPreviewUrl: z.string().optional(),
  edgePreviewUrl: z.string().optional(),
  footLock: z.boolean().default(true).optional(),
  motionSmoothing: z.number().min(0).max(100).default(60).optional(),
  groundConstraint: z.boolean().default(true).optional(),
  cameraSmoothing: z.number().min(0).max(100).default(65).optional(),
  stabilization: z.enum(['Low', 'Medium', 'High']).default('Medium').optional(),
  enabled: z.boolean().default(false),
});
export type VfxReference = z.infer<typeof VfxReferenceSchema>;

export const SubjectKindSchema = z.string().default('human');
export type SubjectKind = string;

export const TrajectoryKeyframeSchema = z.object({
  id: z.string(),
  time: z.number().min(0),
  position: Point2DSchema,
});
export type TrajectoryKeyframe = z.infer<typeof TrajectoryKeyframeSchema>;

export const CameraKeyframeSchema = z.object({
  id: z.string(),
  time: z.number().min(0),
  position: Point3DSchema,
  lookAt: Point2DSchema.optional(),
});
export type CameraKeyframe = z.infer<typeof CameraKeyframeSchema>;

export const ActorSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: SubjectKindSchema.default('human'),
  token: z.string().min(1), // e.g. "a rogue operative in tactical coat"
  actionDescription: z.string().default("stands still and surveys surroundings"),
  trajectory: z.object({
    startTimeSeconds: z.number().min(0).default(0),
    startPosition: Point2DSchema.default({ x: 50, y: 50 }),
    endPosition: Point2DSchema.default({ x: 50, y: 50 }),
    keyframes: z.array(TrajectoryKeyframeSchema).optional(),
  }),
  conceptImageUrl: z.string().optional(),
  modelUrl: z.string().optional(),
  scale: z.number().min(0.05).max(30).default(1.0).optional(),
  partGraph: z.any().optional(),
});
export type Actor = z.infer<typeof ActorSchema>;

export const LightingStyleSchema = z.enum([
  'cinematic-natural',
  'low-key-film-noir',
  'high-key-studio',
  'neon-cyberpunk',
  'golden-hour',
  'moonlight-foggy',
  'practical-candlelight',
  'harsh-fluorescent',
]);
export type LightingStyle = z.infer<typeof LightingStyleSchema>;

export const LightingDirectionSchema = z.enum([
  'front-soft',
  'side-key',
  'rim-backlit',
  'overhead-top',
  'underlit-dramatic',
]);
export type LightingDirection = z.infer<typeof LightingDirectionSchema>;

export const TargetModelSchema = z.enum(['ltx-2.5', 'minimax-h3', 'seedance']);
export type TargetModel = z.infer<typeof TargetModelSchema>;

export const AspectRatioSchema = z.enum(['16:9', '9:16', '2.39:1', '4:3', '1:1']);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const ShotCreationModeSchema = z.enum(['construct-3d', 'video-plate']).default('construct-3d');
export type ShotCreationMode = z.infer<typeof ShotCreationModeSchema>;

export const ShotSpecSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  version: z.number().int().min(1).default(1),
  timestamp: z.number(),

  // Workflow Creation Mode: 3D Previs from Scratch vs Video Plate VFX Solve
  creationMode: ShotCreationModeSchema.default('construct-3d'),

  // Canvas & Frame Pacing
  aspectRatio: AspectRatioSchema.default('16:9'),
  durationSeconds: z.number().min(1.0).max(15.0).default(4.0),
  frameRate: z.number().int().min(12).max(60).default(24),

  // Reference Frame
  referenceImage: z.object({
    filename: z.string(),
    previewUrl: z.string(),
    subfolder: z.string().optional(),
  }).optional(),

  // Camera Specification
  camera: z.object({
    lens: z.object({
      focalLength: FocalLengthSchema.default('35mm'),
      sensorSize: SensorSizeSchema.default('full-frame'),
      aperture: ApertureSchema.default('f/2.8'),
    }),
    shotType: ShotTypeSchema.default('medium'),
    angle: CameraAngleSchema.default('eye-level'),
    movement: z.object({
      type: CameraMovementTypeSchema.default('dolly-in'),
      speed: MovementSpeedSchema.default('slow-cinematic'),
      pacing: z.enum(['linear', 'ease-in-out', 'ease-in', 'ease-out']).default('ease-in-out').optional(),
      startPosition: Point3DSchema.default({ x: 50, y: 85, z: 20 }),
      endPosition: Point3DSchema.default({ x: 50, y: 65, z: 20 }),
      targetLookAt: Point2DSchema.default({ x: 50, y: 50 }),
      keyframes: z.array(CameraKeyframeSchema).optional(),
    }),
  }),

  // Actor / Subject Blocking
  actors: z.array(ActorSchema).default([
    {
      id: 'actor-1',
      name: 'Lead Subject',
      token: 'a lone traveler in a weathered jacket',
      actionDescription: 'turns head slowly toward the camera with focused gaze',
      trajectory: {
        startTimeSeconds: 0.5,
        startPosition: { x: 50, y: 50 },
        endPosition: { x: 50, y: 50 },
      },
    },
  ]),

  // Lighting & Mood
  lighting: z.object({
    style: LightingStyleSchema.default('cinematic-natural'),
    direction: LightingDirectionSchema.default('side-key'),
    contrast: z.enum(['soft', 'balanced', 'high-contrast']).default('balanced'),
  }),

  // Scene Environment (Filming Location & Physical Setting)
  environment: EnvironmentSpecSchema.default(CINEMATIC_ENVIRONMENT_PRESETS[0].spec),

  // Scene Context & Prompt Details
  sceneDescription: z.string().default('cinematic film still, moody atmospheric interior with subtle dust motes floating in light beam'),
  negativePrompt: z.string().default('jitter, warping, distorted faces, blurry, cartoon, low quality, 3d render, plastic skin, jittery camera shake'),

  // Execution Constraints
  targetModel: TargetModelSchema.default('ltx-2.5'),
  seed: z.number().int().optional(),

  // Directorial VFX & Video-to-Video Plate Reference
  vfxReference: z
    .object({
      videoUrl: z.string().optional(),
      fileName: z.string().optional(),
      referenceMode: z.enum(['camera-only', 'actor-motion', 'object-motion', 'full-scene']).default('actor-motion'),
      depthGuidanceWeight: z.number().min(0).max(1).default(0.7),
      edgeFidelity: z.number().min(0).max(1).default(0.5),
      motionRetention: z.number().min(0.1).max(1).default(0.65),
      trimStartSeconds: z.number().min(0).default(0),
      trimEndSeconds: z.number().min(0).default(4),
      solvedCameraMove: z.string().optional(),
      depthPreviewUrl: z.string().optional(),
      edgePreviewUrl: z.string().optional(),
      footLock: z.boolean().default(true).optional(),
      groundConstraint: z.boolean().default(true).optional(),
      motionSmoothing: z.number().min(0).max(100).default(60).optional(),
      cameraSmoothing: z.number().min(0).max(100).default(45).optional(),
      stabilization: z.enum(['Low', 'Medium', 'High']).default('Medium').optional(),
      enabled: z.boolean().default(false),
    })
    .optional(),
});

export type ShotSpec = z.infer<typeof ShotSpecSchema>;

/**
 * Creates a default, production-grade ShotSpec instance
 */
export function createDefaultShotSpec(partial?: Partial<ShotSpec>): ShotSpec {
  const base: ShotSpec = {
    id: `shot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: 'Untitled Shot 01',
    version: 1,
    timestamp: Date.now(),
    creationMode: 'construct-3d',
    aspectRatio: '16:9',
    durationSeconds: 4.0,
    frameRate: 24,
    camera: {
      lens: {
        focalLength: '35mm',
        sensorSize: 'full-frame',
        aperture: 'f/2.8',
      },
      shotType: 'medium',
      angle: 'eye-level',
      movement: {
        type: 'dolly-in',
        speed: 'slow-cinematic',
        startPosition: { x: 50, y: 85, z: 20 },
        endPosition: { x: 50, y: 65, z: 20 },
        targetLookAt: { x: 50, y: 50 },
      },
    },
    actors: [
      {
        id: 'actor-1',
        name: 'Lead Subject',
        kind: 'human',
        token: 'a lone traveler in a weathered jacket',
        actionDescription: 'turns head slowly toward the camera with focused gaze',
        trajectory: {
          startTimeSeconds: 0.5,
          startPosition: { x: 50, y: 50 },
          endPosition: { x: 50, y: 50 },
        },
      },
    ],
    lighting: {
      style: 'cinematic-natural',
      direction: 'side-key',
      contrast: 'balanced',
    },
    environment: { ...CINEMATIC_ENVIRONMENT_PRESETS[0].spec },
    sceneDescription: 'cinematic film still, moody atmospheric interior with subtle dust motes floating in light beam',
    negativePrompt: 'jitter, warping, distorted faces, blurry, cartoon, low quality, 3d render, plastic skin, jittery camera shake',
    targetModel: 'ltx-2.5',
    seed: 42,
  };

  if (!partial) return base;
  return ShotSpecSchema.parse({ ...base, ...partial });
}
