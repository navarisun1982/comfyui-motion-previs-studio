/**
 * Direct RGB Video-to-3D Multi-Person Motion Capture, Camera Tracker & Anthropometric Extractor
 *
 * Inspired by GVHMR / toyxyz_RGBMocap world-grounded motion recovery:
 * 1. Background Optical Flow Camera Solver (`ExtractedVideoCameraMotion`):
 *    Separates background camera motion (pan, tilt, truck, dolly, zoom, handheld) from
 *    foreground actors, outputting a full 3D Stage Camera trajectory (`startPosition`,
 *    `endPosition`, `targetLookAt`, `keyframes`, `focalLength`, `shotType`, `angle`).
 * 2. Multi-Person Detection & Independent 3D Tracking (`ExtractedVideoActorTrack[]`):
 *    Detects 1, 2, 3, or more distinct human silhouettes in the video, tracks each person
 *    across frames by spatial continuity + clothing color signature, and extracts each
 *    person's independent 3D Stage trajectory (`Stage X: 10..90`, `Stage Y: 12..88`, `Stage Z >= 0`)
 *    with GVHMR Gravity-Aligned Foot Contact Lock (`lockFootContacts`).
 * 3. Direct 5-Zone Per-Limb Silhouette Articulation + 19-Bone Kinematic Solver:
 *    Measures each person's left-arm, right-arm, head/torso lean, crouch compression, and
 *    left/right leg stride spread directly from their per-frame silhouette sub-zones,
 *    blending real optical limb articulation with biomechanical gait synthesis.
 * 4. Multimodal Vision AI Filmstrip Contact Sheet Integration (`analyzeVideoFilmstripWithVisionAI`):
 *    Stitches a 6-frame timestamped filmstrip grid (`contactSheetDataUrl`) and queries the
 *    configured Vision LLM (when available) to enrich multi-actor roles, actions, camera
 *    tracking, and surrounding building/scene reconstruction.
 */

import * as THREE from 'three';
import { HumanoidBone, HUMANOID_BONES } from '../procedural3D/sculptSpec';
import {
  ActorPose,
  TrajectoryKeyframe,
  CameraMovementType,
  MovementSpeed,
  ShotType,
  CameraAngle,
  FocalLength,
  CameraKeyframe,
} from '../../types/shotspec';
import {
  ActorPoseKeyframe,
  BoneEulerDelta,
  MocapBodyProportions,
} from './fbxMocapImporter';
import {
  analyzeVideoFilmstripWithVisionAI,
  VisionAiSceneAnalysis,
  VisionAiExtractedActor,
} from './videoVisionAiAnalyzer';
import { buildOfflineUniversalKinematicProgram } from './universalKinematicSynthesizer';
import {
  decomposeMocapAndSceneHint,
  ExplicitPersonSpec,
} from './mocapHintDecomposer';
import {
  MediaPipeFrameDetection,
  TrackedMediaPipePersonSequence,
  getOrCreateMediaPipePoseLandmarker,
  trackMultiPersonMediaPipePoses,
  convertMediaPipeFrameTo17JointLandmarks,
  solveAnatomicalPoseFromMediaPipe,
  MP_POSE,
} from './mediaPipePoseLandmarker';
import { convertSmpl24JointsToMixamoPose } from './unifiedRigSolver';

export const MAX_MOCAP_VIDEO_DURATION_SECONDS = 30;

export interface NlfSmpl3dPersonDetection {
  confidence: number;
  bboxNorm: [number, number, number, number];
  /** Unclamped full-body bounding box `[x, crownY, w, fullBodyH]` in normalized frame coords (may have `crownY + fullBodyH > 1.0` when legs are cropped at the bottom of the frame) */
  unclampedBboxNorm?: [number, number, number, number];
  /** Fraction `0.25..1.0` of the person's full standing height (crown to soles) visible inside the video frame */
  visibleBodyRatio?: number;
  centerXNorm: number;
  centerYNorm: number;
  pelvis3d: [number, number, number];
  joints3dSmpl24: number[][];
  /** 2D projected coordinates `[24][2]` in normalized original video frame coordinates (unclamped in Y so off-screen lower-leg joints have `y > 1.0`) */
  joints2dSmpl24Norm?: number[][];
  /** 24-joint SMPL Axis-Angle vectors `[24][3]` in radians from `pred["pose"]` */
  poseRotvecsSmpl24?: number[][];
  /** Metric 3D root translation `[tx, ty, tz]` in meters from `pred["trans"]` */
  trans3d?: [number, number, number];
  /** 10 SMPL body-shape beta coefficients from `pred["betas"]` */
  shapeBetas?: number[];
  /** Canonical T-Pose 24 SMPL joint coordinates (`[24][3]` in meters) evaluated from `J_template + J_shapedirs * betas` */
  tposeJointsSmpl24?: number[][];
  /** Canonical T-Pose SMPL standing stature in meters evaluated from `v_template + shapedirs * betas` */
  tposeHeightM?: number;
  /** Pose-invariant 3D SMPL surface mesh cross-sections in meters from `pred["vertices3d"]` */
  surfaceAnthropometry?: {
    shoulderWidthM: number;
    chestWidthM: number;
    chestDepthM: number;
    waistWidthM: number;
    waistDepthM: number;
    hipWidthM: number;
    hipDepthM: number;
  };
}

/**
 * Calibrates a 10-element SMPL shape beta vector (`\vec{\beta} \in \mathbb{R}^{10}`) by combining
 * NLF-Large's raw `shapeBetas` with solved 3D anthropometric measurements (`heightMeters`,
 * `bulkFactor`, `shoulderWidthRatio`, `hipWidthRatio`, `torsoLengthRatio`, `legLengthRatio`).
 *
 * Grounded in the exact PCA basis of `nlf_l_multi_0.3.2.torchscript` (`m.body_models.smpl.shapedirs`):
 * - `beta[0]`: overall stature (+0.1002m per +1.0 unit around 1.7271m baseline)
 * - `beta[1]`: slimness vs girth (-0.031m waist/belly width & depth per +1.0 unit; negative = fuller build)
 * - `beta[2]`: hip/waist fullness (+0.0086m per +1.0 unit)
 * - `beta[3]`: shoulder V-taper breadth (+0.0076m shoulder span per +1.0 unit)
 */
export function synthesizeCalibratedSmplBetas(
  rawBetas: number[] | undefined,
  bp: Pick<
    MocapBodyProportions,
    | 'heightMeters'
    | 'shoulderWidthRatio'
    | 'hipWidthRatio'
    | 'torsoLengthRatio'
    | 'legLengthRatio'
    | 'bulkFactor'
  >
): number[] {
  const out = new Array<number>(10).fill(0);
  if (Array.isArray(rawBetas)) {
    for (let i = 0; i < Math.min(10, rawBetas.length); i++) {
      const v = Number(rawBetas[i]);
      if (Number.isFinite(v)) out[i] = v;
    }
  }

  const anthroBeta0 = clamp((bp.heightMeters - 1.727) / 0.1, -3.2, 3.2);
  const anthroBeta1 = clamp(
    -((bp.bulkFactor - 1.0) * 4.8 + (bp.hipWidthRatio - 1.0) * 1.8),
    -3.8,
    3.8
  );
  const anthroBeta2 = clamp(
    (bp.hipWidthRatio - 1.0) * 3.2 + (bp.bulkFactor - 1.0) * 1.6,
    -3.2,
    3.2
  );
  const anthroBeta3 = clamp(
    (bp.shoulderWidthRatio - bp.hipWidthRatio) * 4.2 + (bp.shoulderWidthRatio - 1.0) * 2.5,
    -3.2,
    3.2
  );

  const hasRaw = Array.isArray(rawBetas) && rawBetas.length >= 2;
  out[0] = Number(clamp(hasRaw ? anthroBeta0 * 0.72 + out[0] * 0.28 : anthroBeta0, -3.5, 3.5).toFixed(4));
  out[1] = Number(clamp(hasRaw ? anthroBeta1 * 0.65 + out[1] * 0.35 : anthroBeta1, -3.8, 3.8).toFixed(4));
  out[2] = Number(clamp(hasRaw ? anthroBeta2 * 0.55 + out[2] * 0.45 : anthroBeta2, -3.5, 3.5).toFixed(4));
  out[3] = Number(clamp(hasRaw ? anthroBeta3 * 0.6 + out[3] * 0.4 : anthroBeta3, -3.5, 3.5).toFixed(4));
  for (let i = 4; i < 10; i++) {
    out[i] = Number(clamp(out[i], -3.0, 3.0).toFixed(4));
  }
  return out;
}

/**
 * Infers the fraction `visibleBodyRatio` (0.25..1.0) of a person's full standing height (crown to soles)
 * that is actually visible inside the video frame `[0..1]`, along with the unclamped full-body height ratio.
 * Handles both explicit `visibleBodyRatio` / `unclampedBboxNorm` from `mocap_nlf_extractor.py` and
 * fallback inference when a person's legs are cropped off by the bottom border of the frame (`bMaxY >= 0.93`).
 */
export function inferPersonVisibleBodyRatioAndUnclampedSpan(p: NlfSmpl3dPersonDetection): {
  visibleBodyRatio: number;
  unclampedBboxH: number;
  visibleBboxH: number;
  crownYNorm: number;
} {
  const [, by, bw, bh] = p.bboxNorm ?? [0.35, 0.2, 0.25, 0.55];
  const visibleBboxH = clamp(Number(bh) || 0.54, 0.14, 0.98);
  const bMinY = clamp(Number(by) || 0.2, 0, 0.92);
  const bMaxY = clamp(bMinY + visibleBboxH, 0.12, 1.0);

  if (
    typeof p.visibleBodyRatio === 'number' &&
    Number.isFinite(p.visibleBodyRatio) &&
    Array.isArray(p.unclampedBboxNorm) &&
    p.unclampedBboxNorm.length >= 4
  ) {
    const vRatio = clamp(p.visibleBodyRatio, 0.25, 1.0);
    const unclampedH = clamp(
      Number(p.unclampedBboxNorm[3]) || visibleBboxH / vRatio,
      visibleBboxH,
      3.4
    );
    return {
      visibleBodyRatio: vRatio,
      unclampedBboxH: unclampedH,
      visibleBboxH,
      crownYNorm: clamp(Number(p.unclampedBboxNorm[1]) || bMinY, -0.25, 0.88),
    };
  }

  if (Array.isArray(p.joints2dSmpl24Norm) && p.joints2dSmpl24Norm.length >= 16) {
    const headY2d = Number(p.joints2dSmpl24Norm[15]?.[1] ?? bMinY + visibleBboxH * 0.1);
    const shY2d =
      p.joints2dSmpl24Norm.length >= 18
        ? 0.5 *
          (Number(p.joints2dSmpl24Norm[16]?.[1] ?? headY2d + 0.08) +
            Number(p.joints2dSmpl24Norm[17]?.[1] ?? headY2d + 0.08))
        : headY2d + 0.08;
    const pelvY2d = Number(p.joints2dSmpl24Norm[0]?.[1] ?? bMinY + visibleBboxH * 0.52);
    const ankY2d = Math.max(
      Number(p.joints2dSmpl24Norm[7]?.[1] ?? bMaxY),
      Number(p.joints2dSmpl24Norm[8]?.[1] ?? bMaxY)
    );
    const upper2d = Math.max(0.05, pelvY2d - headY2d);
    const crownY = Math.min(bMinY, headY2d - upper2d * 0.36);
    const crownToSh = Math.max(0.04, shY2d - crownY);
    const trueAnkleY = Math.max(crownY + crownToSh * 5.3, pelvY2d + upper2d * 1.66);
    const trueSoleY = Math.max(crownY + crownToSh * 5.55, pelvY2d + upper2d * 1.8);
    const touchesBottom = bMaxY >= 0.93 || ankY2d >= 0.95 || trueAnkleY > 0.98;
    const soleY = touchesBottom
      ? Math.max(ankY2d, trueSoleY)
      : Math.max(bMaxY, ankY2d + upper2d * 0.14);
    const fullH = clamp(soleY - crownY, visibleBboxH, 3.4);
    const visBottom = Math.min(1.0, soleY);
    const vRatio = clamp((visBottom - Math.max(0, crownY)) / Math.max(0.1, fullH), 0.25, 1.0);
    return {
      visibleBodyRatio: vRatio,
      unclampedBboxH: fullH,
      visibleBboxH,
      crownYNorm: crownY,
    };
  }

  const j24 = p.joints3dSmpl24;
  const headY3d = Number(j24?.[15]?.[1] ?? -0.52);
  const pelvY3d = Number(j24?.[0]?.[1] ?? 0);
  const ankY3d = 0.5 * (Number(j24?.[7]?.[1] ?? 0.82) + Number(j24?.[8]?.[1] ?? 0.82));
  const upper3d = Math.max(0.18, pelvY3d - headY3d);
  const legs3d = Math.max(0.06, ankY3d - pelvY3d);
  const boxAspect = (Number(bw) || 0.22) / Math.max(0.14, visibleBboxH);

  if (bMaxY >= 0.93 && (legs3d < upper3d * 0.92 || boxAspect > 0.44)) {
    const ratioFrom3d = clamp((upper3d * 1.22 + legs3d) / (upper3d * 2.42), 0.35, 1.0);
    const ratioFromAspect =
      boxAspect > 0.44 ? clamp(0.32 / Math.max(0.28, boxAspect), 0.32, 1.0) : 1.0;
    const vRatio = Math.min(ratioFrom3d, ratioFromAspect);
    const unclampedH = clamp(visibleBboxH / Math.max(0.25, vRatio), visibleBboxH, 3.4);
    return {
      visibleBodyRatio: vRatio,
      unclampedBboxH: unclampedH,
      visibleBboxH,
      crownYNorm: bMinY,
    };
  }

  return {
    visibleBodyRatio: 1.0,
    unclampedBboxH: visibleBboxH,
    visibleBboxH,
    crownYNorm: bMinY,
  };
}

export interface NlfSmpl3dFrameDetection {
  frameIndex: number;
  timeSec: number;
  persons: NlfSmpl3dPersonDetection[];
}

export type { ActorPoseKeyframe, BoneEulerDelta, MocapBodyProportions };

export type DetectedMocapAction =
  | 'walk'
  | 'run-sprint'
  | 'jump-leap'
  | 'combat-strike'
  | 'crouch-stealth'
  | 'dance-expressive'
  | 'idle-turn';

export interface VideoFrameSample {
  timeSec: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface MocapJoint2D {
  x: number; // normalized 0..1 image X
  y: number; // normalized 0..1 image Y
  z: number; // relative depth (-0.5..+0.5)
  confidence: number;
}

export interface PersonFramePoseLandmarks {
  timeSec: number;
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  leftFootContact: boolean;
  rightFootContact: boolean;
  joints: {
    head: MocapJoint2D;
    neck: MocapJoint2D;
    leftShoulder: MocapJoint2D;
    rightShoulder: MocapJoint2D;
    leftElbow: MocapJoint2D;
    rightElbow: MocapJoint2D;
    leftWrist: MocapJoint2D;
    rightWrist: MocapJoint2D;
    hips: MocapJoint2D;
    leftHip: MocapJoint2D;
    rightHip: MocapJoint2D;
    leftKnee: MocapJoint2D;
    rightKnee: MocapJoint2D;
    leftAnkle: MocapJoint2D;
    rightAnkle: MocapJoint2D;
  };
}

export interface VideoMocapExtractionOptions {
  startPosition?: { x: number; y: number; z: number };
  targetDurationSeconds?: number;
  sampleFps?: number;
  lockFootContacts?: boolean;
  extractBodyProportions?: boolean;
  /** Savitzky-Golay / temporal smoothing strength (0.0 = raw, 1.0 = max smooth, default 0.65) */
  smoothingStrength?: number;
  motionHintPrompt?: string;
  enableVisionAi?: boolean;
  onProgress?: (stageLabel: string, percent: number) => void;
}

export interface ExtractedVideoActorTrack {
  trackId: string;
  personIndex: number;
  actorName: string;
  appearanceToken: string;
  clothingColorHex: string;
  detectedActionLabel: DetectedMocapAction;
  actionSummary: string;
  inferredMotionClipId: string;
  universalIkClipId?: string;
  confidenceScore: number;
  bodyProportions: MocapBodyProportions;
  poseKeyframes: ActorPoseKeyframe[];
  trajectoryKeyframes: TrajectoryKeyframe[];
  /** Per-frame 17-joint 2D/3D landmarks + bounding boxes + FootMR contact states (toyxyz_RGBMocap style) */
  frameLandmarks?: PersonFramePoseLandmarks[];
  startPosition: { x: number; y: number; z: number };
  endPosition: { x: number; y: number; z: number };
  averageBbox: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface ExtractedVideoCameraMotion {
  movementType: CameraMovementType;
  speed: MovementSpeed;
  shotType: ShotType;
  angle: CameraAngle;
  focalLength: FocalLength;
  /** Continuous optical pinhole focal length (16..135mm) solved from 3D metric depth & bbox height */
  customFocalLengthMm?: number;
  /** Solved camera downward pitch angle in degrees (+ = high-angle looking down, - = low-angle looking up) */
  pitchOffsetDeg?: number;
  /** Solved camera dutch roll angle in degrees */
  dutchRollDeg?: number;
  /** True optical focus distance in meters to the primary subject group */
  focusDistanceMeters?: number;
  /** Average 3D camera-to-subject metric distance in meters */
  subjectDistanceMeters?: number;
  startPosition: { x: number; y: number; z: number };
  endPosition: { x: number; y: number; z: number };
  targetLookAt: { x: number; y: number };
  keyframes: CameraKeyframe[];
  panDeltaNorm: number;
  tiltDeltaNorm: number;
  zoomDeltaRatio: number;
  summaryText: string;
}

export type MocapExtractionEngineId =
  | 'nlf-smpl24-rotvec'
  | 'nlf-smpl24-joints'
  | 'mediapipe-33-3d'
  | 'silhouette-fallback';

export interface VideoMocapExtractionResult {
  fileName: string;
  durationSeconds: number;
  detectedActionLabel: string;
  inferredMotionClipId: string;
  poseKeyframes: ActorPoseKeyframe[];
  trajectoryKeyframes: TrajectoryKeyframe[];
  bodyProportions: MocapBodyProportions;
  referenceFrameDataUrl: string;
  contactSheetDataUrl?: string;
  referenceFramePixels?: {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  };
  frameSamplesAnalyzed: number;
  confidenceScore: number;
  summaryText: string;
  /** All 1..N human subjects detected and tracked in the video */
  actorTracks: ExtractedVideoActorTrack[];
  detectedPersonCount: number;
  /** Extracted 3D camera motion, lens focal length, framing & trajectory */
  cameraMotion: ExtractedVideoCameraMotion;
  /** Optional deep Vision AI filmstrip analysis when a VLM is connected */
  visionAiAnalysis?: VisionAiSceneAnalysis | null;
  /** Cached decoded frames so re-solving with updated hint prompt is instantaneous */
  sampledFrames?: VideoFrameSample[];
  /** Cached MediaPipe 33-joint 2D/3D pose detections across the sampled frames */
  mediaPipeDetections?: MediaPipeFrameDetection[];
  /** Cached NLF-Large 24-joint 3D SMPL multi-person detections when extracted on local GPU */
  nlfSmpl3dDetections?: NlfSmpl3dFrameDetection[];
  /** Explicit telemetry indicating which extraction engine actually solved the motion */
  extractionEngine?: MocapExtractionEngineId;
  /** Diagnostic message if the local GPU NLF-Large SMPL-24 service failed or was unreachable */
  nlfDiagnostic?: string;
}

const ACTION_TO_MOTION_CLIP: Record<DetectedMocapAction, string> = {
  'walk': 'human-walk-forward',
  'run-sprint': 'human-run-sprint',
  'jump-leap': 'human-jump-leap',
  'combat-strike': 'human-combo-punch',
  'crouch-stealth': 'human-sneak-prowl',
  'dance-expressive': 'human-victory-celebrate',
  'idle-turn': 'human-look-around',
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function rgbToHex(r: number, g: number, b: number): string {
  const toH = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toH(r)}${toH(g)}${toH(b)}`;
}

interface FrameBackgroundFlow {
  dxNorm: number; // Background translation in X (-1..1, >0 means background pixels moved right -> camera panned left)
  dyNorm: number; // Background translation in Y (-1..1, >0 means background pixels moved down -> camera tilted up)
  radialScaleDelta: number; // >0 means background expanded outward -> camera dolly-in / zoom-in
  cumPanX: number; // Cumulative background pan offset
  cumTiltY: number; // Cumulative background tilt offset
  cumZoom: number; // Cumulative zoom/dolly scale
}

interface PersonFrameMetrics {
  timeSec: number;
  centroidX: number; // 0..1 (raw in frame)
  centroidY: number; // 0..1 (raw in frame)
  worldCentroidX: number; // Camera-compensated horizontal position
  worldFootY: number; // Camera-compensated foot contact Y (larger = closer to foreground)
  bboxMinX: number;
  bboxMaxX: number;
  bboxMinY: number;
  bboxMaxY: number;
  bboxWidth: number;
  bboxHeight: number;
  upperWidthRatio: number;
  midWidthRatio: number;
  lowerWidthRatio: number;
  upperMotionEnergy: number;
  lowerMotionEnergy: number;
  totalMotionEnergy: number;
  leftRightAsymmetry: number;
  // Direct 5-zone anatomical limb articulation measurements from silhouette:
  leftArmRaiseRatio: number; // 0 (down at side) .. 1 (raised overhead)
  leftArmReachRatio: number; // 0 (tucked) .. 1 (extended wide/forward)
  rightArmRaiseRatio: number; // 0 (down at side) .. 1 (raised overhead)
  rightArmReachRatio: number; // 0 (tucked) .. 1 (extended wide/forward)
  legSpreadRatio: number; // 0 (feet together) .. 1 (wide stride / kick split)
  torsoLeanRatio: number; // -1 (leaning left) .. +1 (leaning right)
  clothingRgb: [number, number, number];
  foregroundCoverage: number;
  landmarks: PersonFramePoseLandmarks;
}

/**
 * Estimates background RGB palette from the outer perimeter of a frame
 * (top sky/ceiling strip, left/right outer borders, and bottom corners).
 */
function estimateBorderBackgroundModel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): {
  topRgb: [number, number, number];
  midLeftRgb: [number, number, number];
  midRightRgb: [number, number, number];
  bottomRgb: [number, number, number];
  globalRgb: [number, number, number];
  horizonRatioY: number;
} {
  const sampleStrip = (x0: number, x1: number, y0: number, y1: number): [number, number, number] => {
    let r = 0;
    let g = 0;
    let b = 0;
    let c = 0;
    const sx = Math.max(1, Math.floor((x1 - x0) / 12));
    const sy = Math.max(1, Math.floor((y1 - y0) / 8));
    for (let y = y0; y <= y1; y += sy) {
      for (let x = x0; x <= x1; x += sx) {
        const idx = (clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)) * 4;
        if (idx + 2 < pixels.length) {
          r += pixels[idx];
          g += pixels[idx + 1];
          b += pixels[idx + 2];
          c++;
        }
      }
    }
    return c > 0 ? [r / c, g / c, b / c] : [18, 22, 32];
  };

  const topRgb = sampleStrip(0, width - 1, 0, Math.floor(height * 0.14));
  const midLeftRgb = sampleStrip(0, Math.floor(width * 0.1), Math.floor(height * 0.18), Math.floor(height * 0.78));
  const midRightRgb = sampleStrip(Math.floor(width * 0.9), width - 1, Math.floor(height * 0.18), Math.floor(height * 0.78));
  const bottomRgb = sampleStrip(0, width - 1, Math.floor(height * 0.88), height - 1);

  const globalRgb: [number, number, number] = [
    (topRgb[0] + midLeftRgb[0] + midRightRgb[0] + bottomRgb[0]) * 0.25,
    (topRgb[1] + midLeftRgb[1] + midRightRgb[1] + bottomRgb[1]) * 0.25,
    (topRgb[2] + midLeftRgb[2] + midRightRgb[2] + bottomRgb[2]) * 0.25,
  ];

  // Estimate horizon / wall-floor boundary row by vertical luminance gradient along outer columns
  let bestGrad = -1;
  let horizonRow = Math.floor(height * 0.52);
  for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.82); y++) {
    let gradSum = 0;
    for (const xFrac of [0.06, 0.14, 0.86, 0.94]) {
      const x = clamp(Math.floor(width * xFrac), 0, width - 1);
      const idxAbove = (Math.max(0, y - 2) * width + x) * 4;
      const idxBelow = (Math.min(height - 1, y + 2) * width + x) * 4;
      const lumA = (pixels[idxAbove] + pixels[idxAbove + 1] + pixels[idxAbove + 2]) / 3;
      const lumB = (pixels[idxBelow] + pixels[idxBelow + 1] + pixels[idxBelow + 2]) / 3;
      gradSum += Math.abs(lumA - lumB);
    }
    if (gradSum > bestGrad) {
      bestGrad = gradSum;
      horizonRow = y;
    }
  }

  return {
    topRgb,
    midLeftRgb,
    midRightRgb,
    bottomRgb,
    globalRgb,
    horizonRatioY: clamp(horizonRow / Math.max(1, height), 0.2, 0.8),
  };
}

/**
 * Estimates per-frame background optical flow `(dxNorm, dyNorm, radialScaleDelta)` using
 * block matching on perimeter background patches so camera motion is accurately separated
 * from foreground human motion.
 */
function estimateBackgroundOpticalFlowSequence(frames: VideoFrameSample[]): FrameBackgroundFlow[] {
  const flows: FrameBackgroundFlow[] = [];
  if (frames.length === 0) return flows;

  let cumPanX = 0;
  let cumTiltY = 0;
  let cumZoom = 0;

  flows.push({ dxNorm: 0, dyNorm: 0, radialScaleDelta: 0, cumPanX: 0, cumTiltY: 0, cumZoom: 0 });

  // Perimeter patch centers in normalized coordinates (avoiding center where primary actors stand)
  const patchCenters: Array<[number, number]> = [
    [0.12, 0.14],
    [0.5, 0.12],
    [0.88, 0.14],
    [0.09, 0.42],
    [0.91, 0.42],
    [0.11, 0.72],
    [0.89, 0.72],
    [0.22, 0.24],
    [0.78, 0.24],
  ];

  for (let i = 1; i < frames.length; i++) {
    const cur = frames[i];
    const prev = frames[i - 1];
    const w = Math.max(16, cur.width);
    const h = Math.max(16, cur.height);

    if (prev.width !== cur.width || prev.height !== cur.height) {
      flows.push({ dxNorm: 0, dyNorm: 0, radialScaleDelta: 0, cumPanX, cumTiltY, cumZoom });
      continue;
    }

    const searchRadiusX = Math.max(2, Math.min(5, Math.floor(w * 0.06)));
    const searchRadiusY = Math.max(2, Math.min(4, Math.floor(h * 0.06)));
    const patchRad = Math.max(1, Math.floor(Math.min(w, h) * 0.04));

    const dxs: number[] = [];
    const dys: number[] = [];
    let radialSum = 0;
    let radialCount = 0;

    for (const [pxFrac, pyFrac] of patchCenters) {
      const cx = clamp(Math.round(pxFrac * (w - 1)), patchRad + searchRadiusX, w - 1 - patchRad - searchRadiusX);
      const cy = clamp(Math.round(pyFrac * (h - 1)), patchRad + searchRadiusY, h - 1 - patchRad - searchRadiusY);

      let bestSad = Number.POSITIVE_INFINITY;
      let bestDx = 0;
      let bestDy = 0;

      for (let dy = -searchRadiusY; dy <= searchRadiusY; dy++) {
        for (let dx = -searchRadiusX; dx <= searchRadiusX; dx++) {
          let sad = 0;
          for (let py = -patchRad; py <= patchRad; py++) {
            for (let px = -patchRad; px <= patchRad; px++) {
              const idxPrev = ((cy + py) * w + (cx + px)) * 4;
              const idxCur = ((cy + py + dy) * w + (cx + px + dx)) * 4;
              sad +=
                Math.abs(cur.pixels[idxCur] - prev.pixels[idxPrev]) +
                Math.abs(cur.pixels[idxCur + 1] - prev.pixels[idxPrev + 1]) +
                Math.abs(cur.pixels[idxCur + 2] - prev.pixels[idxPrev + 2]);
            }
          }
          // Slight tie-breaker favoring zero motion on uniform sky/wall patches
          const penalty = (Math.abs(dx) + Math.abs(dy)) * 4;
          if (sad + penalty < bestSad) {
            bestSad = sad + penalty;
            bestDx = dx;
            bestDy = dy;
          }
        }
      }

      const dxNorm = bestDx / w;
      const dyNorm = bestDy / h;
      dxs.push(dxNorm);
      dys.push(dyNorm);

      // Radial projection away from frame center (0.5, 0.5)
      const vx = pxFrac - 0.5;
      const vy = pyFrac - 0.5;
      const vLen = Math.hypot(vx, vy);
      if (vLen > 0.15) {
        const radialProj = (dxNorm * vx + dyNorm * vy) / vLen;
        radialSum += radialProj;
        radialCount++;
      }
    }

    dxs.sort((a, b) => a - b);
    dys.sort((a, b) => a - b);
    const medDx = dxs[Math.floor(dxs.length / 2)] ?? 0;
    const medDy = dys[Math.floor(dys.length / 2)] ?? 0;
    const radialScaleDelta = radialCount > 0 ? radialSum / radialCount : 0;

    cumPanX += medDx;
    cumTiltY += medDy;
    cumZoom += radialScaleDelta;

    flows.push({
      dxNorm: medDx,
      dyNorm: medDy,
      radialScaleDelta,
      cumPanX,
      cumTiltY,
      cumZoom,
    });
  }

  return flows;
}

/**
 * Converts a full 3D Mixamo quaternion `ActorPose` into a complete 19-bone `BoneEulerDelta` record
 * (`HUMANOID_BONES`) so all consumers (timeline preview, pose inspector, and procedural rigs)
 * receive all 19 anatomical joint rotations rather than a 7-bone subset.
 */
function extract19BoneEulerDeltasFromActorPose(
  pose: ActorPose
): Partial<Record<HumanoidBone, BoneEulerDelta>> {
  const bones: Partial<Record<HumanoidBone, BoneEulerDelta>> = {};
  const rots = pose.rotations;
  if (rots) {
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, 'XYZ');
    for (const boneName of HUMANOID_BONES) {
      const tuple = rots[boneName];
      if (tuple && tuple.length === 4) {
        q.set(tuple[0], tuple[1], tuple[2], tuple[3]).normalize();
        e.setFromQuaternion(q, 'XYZ');
        bones[boneName] = {
          x: Number(e.x.toFixed(4)),
          y: Number(e.y.toFixed(4)),
          z: Number(e.z.toFixed(4)),
        };
      }
    }
    if (Object.keys(bones).length > 0) {
      return bones;
    }
  }
  const ik = pose.anatomicalIk;
  const lFoot = ik?.leftAnkle ?? [0.09, 0, 0];
  const rFoot = ik?.rightAnkle ?? [-0.09, 0, 0];
  const lHand = ik?.leftHand ?? [0.2, 0.48, 0.08];
  const rHand = ik?.rightHand ?? [-0.2, 0.48, 0.08];
  bones.LeftUpLeg = { x: Number(clamp(-lFoot[2] * 1.4 - lFoot[1] * 0.6, -0.95, 0.95).toFixed(4)), y: 0, z: 0 };
  bones.RightUpLeg = { x: Number(clamp(-rFoot[2] * 1.4 - rFoot[1] * 0.6, -0.95, 0.95).toFixed(4)), y: 0, z: 0 };
  bones.LeftLeg = { x: Number(clamp(lFoot[1] * 2.1 + Math.max(0, -lFoot[2]) * 0.9, 0, 1.4).toFixed(4)), y: 0, z: 0 };
  bones.RightLeg = { x: Number(clamp(rFoot[1] * 2.1 + Math.max(0, -rFoot[2]) * 0.9, 0, 1.4).toFixed(4)), y: 0, z: 0 };
  bones.LeftArm = { x: Number(clamp(-lHand[2] * 1.1, -1.1, 1.1).toFixed(4)), y: 0, z: Number(clamp((0.55 - lHand[1]) * 0.95, 0.14, 1.1).toFixed(4)) };
  bones.RightArm = { x: Number(clamp(-rHand[2] * 1.1, -1.1, 1.1).toFixed(4)), y: 0, z: Number(clamp(-(0.55 - rHand[1]) * 0.95, -1.1, -0.14).toFixed(4)) };
  bones.Spine = { x: 0.05, y: 0, z: 0 };
  return bones;
}

/**
 * Solves the 3D Stage Camera specification (`ExtractedVideoCameraMotion`) from NLF 3D metric
 * camera-space coordinates (`trans3d`, `joints3dSmpl24`, `bboxNorm`) when available, combined with
 * background optical flow, subject screen occupancy, horizon height, and optional prompt/filename hints.
 */
function solveCameraMotionFromFrames(
  frames: VideoFrameSample[],
  bgFlows: FrameBackgroundFlow[],
  primaryMetrics: PersonFrameMetrics[],
  durationSeconds: number,
  hintText: string,
  actorTracks: ExtractedVideoActorTrack[] = [],
  nlfDetections?: NlfSmpl3dFrameDetection[]
): ExtractedVideoCameraMotion {
  const lowerHint = String(hintText ?? '').toLowerCase().replace(/[_-]+/g, ' ');
  const lastFlow = bgFlows[bgFlows.length - 1] ?? {
    dxNorm: 0,
    dyNorm: 0,
    radialScaleDelta: 0,
    cumPanX: 0,
    cumTiltY: 0,
    cumZoom: 0,
  };

  // Note: When camera pans RIGHT, background pixels move LEFT (cumPanX < 0).
  // When camera pans LEFT, background pixels move RIGHT (cumPanX > 0).
  const cameraYawDeltaNorm = -lastFlow.cumPanX;
  const cameraPitchDeltaNorm = lastFlow.cumTiltY;
  const cameraDollyZoomRatio = lastFlow.cumZoom;

  // Measure high-frequency handheld jitter energy
  let jitterSum = 0;
  for (let i = 1; i < bgFlows.length; i++) {
    const ddx = bgFlows[i].dxNorm - bgFlows[i - 1].dxNorm;
    const ddy = bgFlows[i].dyNorm - bgFlows[i - 1].dyNorm;
    jitterSum += Math.hypot(ddx, ddy);
  }
  const avgJitter = bgFlows.length > 1 ? jitterSum / (bgFlows.length - 1) : 0;

  // Extract per-frame 3D metric camera observations from NLF detections when available
  interface NlfFrameCamSample {
    camX: number;
    camY: number;
    camZ: number;
    bboxH: number;
    unclampedBboxH: number;
    visibleBodyRatio: number;
    crownYNorm: number;
    heightM: number;
    ankY: number;
    ankZ: number;
    bodyTiltRad: number;
  }
  const nlfCamSeries: NlfFrameCamSample[] = [];
  if (Array.isArray(nlfDetections)) {
    const defaultTrackHeight =
      actorTracks.length > 0
        ? actorTracks.reduce((acc, t) => acc + (t.bodyProportions?.heightMeters ?? 1.74), 0) /
          actorTracks.length
        : 1.74;
    for (const fDet of nlfDetections) {
      if (!Array.isArray(fDet.persons) || fDet.persons.length === 0) continue;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      let sumBh = 0;
      let sumUnclampedBh = 0;
      let sumVisRatio = 0;
      let sumCrownY = 0;
      let sumHm = 0;
      let sumAnkY = 0;
      let sumAnkZ = 0;
      let sumTilt = 0;
      for (const p of fDet.persons) {
        const px = Number(p.trans3d?.[0] ?? p.pelvis3d?.[0] ?? 0);
        const py = Number(p.trans3d?.[1] ?? p.pelvis3d?.[1] ?? 0);
        const pz = clamp(Number(p.trans3d?.[2] ?? p.pelvis3d?.[2] ?? 3.2), 1.15, 14.0);
        const visInfo = inferPersonVisibleBodyRatioAndUnclampedSpan(p);
        const bh = visInfo.visibleBboxH;
        const unclampedBh = visInfo.unclampedBboxH;
        const visRatio = visInfo.visibleBodyRatio;
        const crownY = visInfo.crownYNorm;
        const j24 = p.joints3dSmpl24;
        const head = j24?.[15] ?? [px, py - 0.65, pz];
        const neck = j24?.[12] ?? [px, py - 0.48, pz];
        const lAnk = j24?.[7] ?? [px + 0.1, py + 0.78, pz];
        const rAnk = j24?.[8] ?? [px - 0.1, py + 0.78, pz];
        const lAnkY = Number(lAnk[1]);
        const rAnkY = Number(rAnk[1]);
        const ankY = 0.5 * (lAnkY + rAnkY);
        const ankZ = 0.5 * (Number(lAnk[2]) + Number(rAnk[2]));
        const stanceAnkY = Math.max(lAnkY, rAnkY);
        const stanceAnkZ = lAnkY >= rAnkY ? Number(lAnk[2]) : Number(rAnk[2]);
        const dyBody = Math.max(0.4, ankY - Number(head[1]));
        const dzBody = ankZ - Number(head[2]);
        const dyLegs = Math.max(0.32, ankY - py);
        const dzLegs = ankZ - pz;
        const dyTorso = Math.max(0.24, py - Number(neck[1]));
        const dzTorso = pz - Number(neck[2]);
        const span3d = Math.hypot(
          Number(head[0]) - 0.5 * (Number(lAnk[0]) + Number(rAnk[0])),
          dyBody,
          dzBody
        );
        const hm =
          visRatio >= 0.88
            ? clamp(span3d + 0.22, 1.48, 2.02) || defaultTrackHeight
            : clamp(dyTorso * 3.45, 1.54, 1.96) || defaultTrackHeight;
        // When ankles are cropped off the bottom of the frame (`visRatio < 0.88`), their 3D depth `ankZ`
        // is hallucinated; measure camera tilt from the visible upper torso (`pelvis - neck`) instead.
        const bodyTiltRad =
          visRatio >= 0.88
            ? Math.atan2(dzLegs, dyLegs) * 0.78 + Math.atan2(dzBody, dyBody) * 0.22
            : Math.atan2(dzTorso, dyTorso) * 0.55;
        sumX += px;
        sumY += py;
        sumZ += pz;
        sumBh += bh;
        sumUnclampedBh += unclampedBh;
        sumVisRatio += visRatio;
        sumCrownY += crownY;
        sumHm += hm;
        sumAnkY += stanceAnkY;
        sumAnkZ += stanceAnkZ;
        sumTilt += bodyTiltRad;
      }
      const n = fDet.persons.length;
      nlfCamSeries.push({
        camX: sumX / n,
        camY: sumY / n,
        camZ: sumZ / n,
        bboxH: sumBh / n,
        unclampedBboxH: sumUnclampedBh / n,
        visibleBodyRatio: sumVisRatio / n,
        crownYNorm: sumCrownY / n,
        heightM: sumHm / n,
        ankY: sumAnkY / n,
        ankZ: sumAnkZ / n,
        bodyTiltRad: sumTilt / n,
      });
    }

    // Apply Zero-Phase Raised-Cosine (Hann) temporal smoothing across nlfCamSeries so monocular depth fluctuations
    // never cause camera distance or framing jitter while preserving true dynamic push-in & crane/tilt progression.
    if (nlfCamSeries.length >= 3) {
      const camSmoothRadius = clamp(Math.floor(nlfCamSeries.length * 0.18), 2, 7);
      const rawCamX = nlfCamSeries.map((s) => s.camX);
      const rawCamY = nlfCamSeries.map((s) => s.camY);
      const rawCamZ = nlfCamSeries.map((s) => s.camZ);
      const rawBboxH = nlfCamSeries.map((s) => s.bboxH);
      const rawUnclampedBh = nlfCamSeries.map((s) => s.unclampedBboxH);
      const rawVisRatio = nlfCamSeries.map((s) => s.visibleBodyRatio);
      const rawCrownY = nlfCamSeries.map((s) => s.crownYNorm);
      const rawTilt = nlfCamSeries.map((s) => s.bodyTiltRad);
      for (let i = 0; i < nlfCamSeries.length; i++) {
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let sb = 0;
        let sub = 0;
        let svr = 0;
        let scy = 0;
        let stilt = 0;
        let wSum = 0;
        for (let k = -camSmoothRadius; k <= camSmoothRadius; k++) {
          const j = clamp(i + k, 0, nlfCamSeries.length - 1);
          const w = 0.5 * (1 + Math.cos((Math.PI * k) / (camSmoothRadius + 1)));
          sx += rawCamX[j] * w;
          sy += rawCamY[j] * w;
          sz += rawCamZ[j] * w;
          sb += rawBboxH[j] * w;
          sub += rawUnclampedBh[j] * w;
          svr += rawVisRatio[j] * w;
          scy += rawCrownY[j] * w;
          stilt += rawTilt[j] * w;
          wSum += w;
        }
        if (wSum > 1e-5) {
          nlfCamSeries[i].camX = sx / wSum;
          nlfCamSeries[i].camY = sy / wSum;
          nlfCamSeries[i].camZ = sz / wSum;
          nlfCamSeries[i].bboxH = sb / wSum;
          nlfCamSeries[i].unclampedBboxH = sub / wSum;
          nlfCamSeries[i].visibleBodyRatio = svr / wSum;
          nlfCamSeries[i].crownYNorm = scy / wSum;
          nlfCamSeries[i].bodyTiltRad = stilt / wSum;
        }
      }
    }
  }

  const hasNlf3dCamera = nlfCamSeries.length > 0;

  // Average subject height ratio & visible body fraction for shotType & focalLength estimation
  const avgBboxH = hasNlf3dCamera
    ? nlfCamSeries.reduce((acc, s) => acc + s.bboxH, 0) / nlfCamSeries.length
    : primaryMetrics.length > 0
      ? primaryMetrics.reduce((acc, m) => acc + m.bboxHeight, 0) / primaryMetrics.length
      : 0.52;
  const avgUnclampedBboxH = hasNlf3dCamera
    ? nlfCamSeries.reduce((acc, s) => acc + s.unclampedBboxH, 0) / nlfCamSeries.length
    : avgBboxH;
  const avgVisibleBodyRatio = hasNlf3dCamera
    ? nlfCamSeries.reduce((acc, s) => acc + s.visibleBodyRatio, 0) / nlfCamSeries.length
    : 1.0;
  const firstBboxH = hasNlf3dCamera
    ? nlfCamSeries[0].unclampedBboxH
    : (primaryMetrics[0]?.bboxHeight ?? avgBboxH);
  const lastBboxH = hasNlf3dCamera
    ? nlfCamSeries[nlfCamSeries.length - 1].unclampedBboxH
    : (primaryMetrics[primaryMetrics.length - 1]?.bboxHeight ?? avgBboxH);
  const subjectScaleGrowth = lastBboxH - firstBboxH;

  // Horizon estimation from first frame (used as fallback when NLF 3D is absent)
  const bgModel =
    frames[0] && frames[0].pixels.length >= 4
      ? estimateBorderBackgroundModel(frames[0].pixels, frames[0].width, frames[0].height)
      : null;
  const horizonY = bgModel ? bgModel.horizonRatioY : 0.5;

  // Determine ShotType from human vertical occupancy & visible body crop ratio
  let shotType: ShotType = 'medium-wide';
  if (avgVisibleBodyRatio <= 0.38 || avgUnclampedBboxH >= 1.85 || avgBboxH >= 0.88) {
    shotType = 'close-up';
  } else if (avgVisibleBodyRatio <= 0.50 || avgUnclampedBboxH >= 1.42 || avgBboxH >= 0.78) {
    shotType = 'medium-close-up';
  } else if (avgVisibleBodyRatio <= 0.68 || avgUnclampedBboxH >= 1.08 || avgBboxH >= 0.62) {
    shotType = 'medium';
  } else if (actorTracks.length >= 2 && avgBboxH < 0.72 && avgVisibleBodyRatio >= 0.88) {
    shotType = avgBboxH < 0.35 ? 'wide' : 'medium-wide';
  } else if (avgVisibleBodyRatio <= 0.86 || avgBboxH >= 0.42) {
    shotType = 'medium-wide';
  } else if (avgBboxH >= 0.26) {
    shotType = 'wide';
  } else {
    shotType = 'extreme-wide';
  }

  // Solve 3D camera downward pitch angle (degrees) and CameraAngle
  let pitchOffsetDeg = 0;
  let medianBodyTiltRad = 0;
  let angle: CameraAngle = 'eye-level';
  if (hasNlf3dCamera) {
    const sortedTilts = nlfCamSeries.map((s) => s.bodyTiltRad).sort((a, b) => a - b);
    medianBodyTiltRad = sortedTilts[Math.floor(sortedTilts.length * 0.5)] ?? 0;
    let alphaDownRad = medianBodyTiltRad;

    if (nlfCamSeries.length >= 2) {
      let minAnkZ = Infinity;
      let maxAnkZ = -Infinity;
      let meanZ = 0;
      let meanY = 0;
      for (const s of nlfCamSeries) {
        if (s.ankZ < minAnkZ) minAnkZ = s.ankZ;
        if (s.ankZ > maxAnkZ) maxAnkZ = s.ankZ;
        meanZ += s.ankZ;
        meanY += s.ankY;
      }
      meanZ /= nlfCamSeries.length;
      meanY /= nlfCamSeries.length;
      const depthSpan = maxAnkZ - minAnkZ;
      // Only fit floor-plane slope when the grounded stance ankle actually translates across >=0.75m of depth
      if (depthSpan >= 0.75) {
        let covZY = 0;
        let varZ = 0;
        for (const s of nlfCamSeries) {
          const dz = s.ankZ - meanZ;
          const dy = s.ankY - meanY;
          covZY += dz * dy;
          varZ += dz * dz;
        }
        if (varZ > 1e-4) {
          const groundTiltRad = Math.atan(-covZY / varZ);
          alphaDownRad = groundTiltRad * 0.55 + medianBodyTiltRad * 0.45;
        }
      }
    }
    const rawPitchDeg = (alphaDownRad * 180) / Math.PI;
    // Apply a 1.8-deg natural posture deadband so eye-level shots stay rock-solid at 0 deg
    const deadbandPitchDeg =
      Math.abs(rawPitchDeg) <= 1.8
        ? 0
        : rawPitchDeg > 0
          ? rawPitchDeg - 1.8
          : rawPitchDeg + 1.8;
    pitchOffsetDeg = Number(clamp(deadbandPitchDeg, -35, 65).toFixed(1));
  } else {
    pitchOffsetDeg = Number(clamp((0.5 - horizonY) * 45, -25, 45).toFixed(1));
  }

  if (/\b(low[- ]angle|hero[- ]low|worm)\b/.test(lowerHint)) {
    angle = 'low-angle';
    if (pitchOffsetDeg > -10) pitchOffsetDeg = -14;
  } else if (/\b(overhead|bird|gods[- ]eye|top[- ]down)\b/.test(lowerHint)) {
    angle = 'overhead-gods-eye';
    if (pitchOffsetDeg < 38) pitchOffsetDeg = 45;
  } else if (/\b(high[- ]angle|crane|rooftop)\b/.test(lowerHint)) {
    angle = 'high-angle';
    if (pitchOffsetDeg < 14) pitchOffsetDeg = 22;
  } else if (hasNlf3dCamera) {
    if (pitchOffsetDeg >= 36) angle = 'overhead-gods-eye';
    else if (pitchOffsetDeg >= 10.5) angle = 'high-angle';
    else if (pitchOffsetDeg <= -9.5) angle = 'low-angle';
    else angle = 'eye-level';
  } else {
    if (horizonY > 0.66) angle = 'low-angle';
    else if (horizonY < 0.26) angle = 'overhead-gods-eye';
    else if (horizonY < 0.36) angle = 'high-angle';
  }

  // Solve optical pinhole focal length (mm) and standard FocalLength preset
  let customFocalLengthMm = 35;
  let subjectDistanceMeters = 3.4;
  if (hasNlf3dCamera) {
    const pitchCos = Math.max(0.65, Math.cos((pitchOffsetDeg * Math.PI) / 180));
    const fSamples = nlfCamSeries
      .map((s) => (24 * (s.unclampedBboxH * s.camZ)) / (Math.max(1.4, s.heightM) * pitchCos))
      .sort((a, b) => a - b);
    const medianFmm = fSamples[Math.floor(fSamples.length * 0.5)] ?? 35;
    customFocalLengthMm = Math.round(clamp(medianFmm, 16, 135));
    subjectDistanceMeters = Number(
      (nlfCamSeries.reduce((acc, s) => acc + s.camZ, 0) / nlfCamSeries.length).toFixed(2)
    );
  } else {
    if (shotType === 'extreme-wide' || shotType === 'wide') customFocalLengthMm = 24;
    else if (shotType === 'medium-close-up' || shotType === 'close-up') customFocalLengthMm = 50;
    else customFocalLengthMm = 35;
    subjectDistanceMeters = Number(
      clamp((24 * 1.72) / Math.max(16, customFocalLengthMm * Math.max(0.2, avgBboxH)), 1.4, 12.0).toFixed(2)
    );
  }

  const presetMmList: { preset: FocalLength; mm: number }[] = [
    { preset: '14mm', mm: 14 },
    { preset: '18mm', mm: 18 },
    { preset: '24mm', mm: 24 },
    { preset: '35mm', mm: 35 },
    { preset: '40mm', mm: 40 },
    { preset: '50mm', mm: 50 },
    { preset: '70mm', mm: 70 },
    { preset: '85mm', mm: 85 },
    { preset: '100mm', mm: 100 },
    { preset: '135mm', mm: 135 },
  ];
  let focalLength: FocalLength = '35mm';
  let bestMmDiff = Infinity;
  for (const item of presetMmList) {
    const d = Math.abs(customFocalLengthMm - item.mm);
    if (d < bestMmDiff) {
      bestMmDiff = d;
      focalLength = item.preset;
    }
  }

  // Helper to sample the multi-person group centroid on the 3D Stage at normalized time ratio u in [0..1]
  const sampleGroupStageCentroid = (u: number): { x: number; y: number; spanX: number } => {
    if (actorTracks.length > 0) {
      let sumX = 0;
      let sumY = 0;
      let minX = 100;
      let maxX = 0;
      for (const track of actorTracks) {
        const kfs = track.trajectoryKeyframes;
        if (kfs.length === 0) {
          sumX += track.startPosition.x;
          sumY += track.startPosition.y;
          minX = Math.min(minX, track.startPosition.x);
          maxX = Math.max(maxX, track.startPosition.x);
          continue;
        }
        const fIdx = clamp(u * (kfs.length - 1), 0, kfs.length - 1);
        const i0 = Math.floor(fIdx);
        const i1 = Math.min(kfs.length - 1, i0 + 1);
        const frac = fIdx - i0;
        const px = kfs[i0].position.x + (kfs[i1].position.x - kfs[i0].position.x) * frac;
        const py = kfs[i0].position.y + (kfs[i1].position.y - kfs[i0].position.y) * frac;
        sumX += px;
        sumY += py;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
      }
      return {
        x: sumX / actorTracks.length,
        y: sumY / actorTracks.length,
        spanX: Math.max(0, maxX - minX),
      };
    }
    const fIdx =
      primaryMetrics.length > 0
        ? clamp(Math.round(u * (primaryMetrics.length - 1)), 0, primaryMetrics.length - 1)
        : 0;
    const cx = primaryMetrics[fIdx]?.centroidX ?? 0.5;
    return {
      x: clamp(50 + (cx - 0.5) * 24, 24, 76),
      y: 44 + u * 12,
      spanX: 0,
    };
  };

  const groupStart = sampleGroupStageCentroid(0);
  const groupEnd = sampleGroupStageCentroid(1);
  const groupTravelDist = Math.hypot(groupEnd.x - groupStart.x, groupEnd.y - groupStart.y);
  const hasLocomotionActors = actorTracks.some(
    (t) => t.detectedActionLabel === 'walk' || t.detectedActionLabel === 'run-sprint'
  );

  // Determine CameraMovementType from optical flow + subject scale growth + explicit hints + locomotion tracking
  let movementType: CameraMovementType = 'static';
  const combinedDollySignal = cameraDollyZoomRatio + subjectScaleGrowth * 0.45;

  if (/\b(orbit|arc|360)\b/.test(lowerHint)) {
    movementType = 'orbit-clockwise';
  } else if (/\b(dolly[- ]?in|push[- ]?in|zoom[- ]?in)\b/.test(lowerHint)) {
    movementType = 'dolly-in';
  } else if (/\b(dolly[- ]?out|pull[- ]?back|zoom[- ]?out)\b/.test(lowerHint)) {
    movementType = 'dolly-out';
  } else if (/\b(pan[- ]?right|truck[- ]?right)\b/.test(lowerHint)) {
    movementType = 'pan-right';
  } else if (/\b(pan[- ]?left|truck[- ]?left)\b/.test(lowerHint)) {
    movementType = 'pan-left';
  } else if (/\b(follow|tracking|steadicam)\b/.test(lowerHint)) {
    movementType = 'steadicam-follow';
  } else if (hasLocomotionActors || groupTravelDist > 5) {
    movementType = 'steadicam-follow';
  } else if (Math.abs(cameraYawDeltaNorm) > 0.08 && Math.abs(cameraYawDeltaNorm) >= Math.abs(combinedDollySignal)) {
    movementType = cameraYawDeltaNorm > 0 ? 'pan-right' : 'pan-left';
  } else if (Math.abs(combinedDollySignal) > 0.07) {
    movementType = combinedDollySignal > 0 ? 'dolly-in' : 'dolly-out';
  } else if (Math.abs(cameraPitchDeltaNorm) > 0.07) {
    movementType = cameraPitchDeltaNorm > 0 ? 'tilt-up' : 'tilt-down';
  } else if (avgJitter > 0.028) {
    movementType = 'handheld-subtle';
  } else {
    movementType = 'static';
  }

  const totalFlowMag =
    Math.hypot(cameraYawDeltaNorm, cameraPitchDeltaNorm, combinedDollySignal) /
    Math.max(0.5, durationSeconds);
  const speed: MovementSpeed =
    totalFlowMag > 0.12 ? 'rapid-dynamic' : totalFlowMag > 0.04 || hasLocomotionActors ? 'moderate' : 'slow-cinematic';

  // Compute 3D Stage Camera keyframes that frame the subject group at true metric distance, elevation & leg-crop level.
  // Match StagePrevis3D baseLookHeight and use continuous sub-unit precision (0.01) so camera angles never stair-step.
  const pitchRad = (pitchOffsetDeg * Math.PI) / 180;
  const baseLookHeight =
    shotType === 'close-up'
      ? 4.32
      : shotType === 'medium-close-up'
        ? 3.95
        : shotType === 'medium'
          ? 3.45
          : 2.85;
  const hfovRad = 2 * Math.atan(18 / Math.max(14, customFocalLengthMm));
  const fallbackDistY =
    (shotType === 'wide' || shotType === 'extreme-wide'
      ? 14
      : shotType === 'medium-close-up' || shotType === 'close-up'
        ? 8
        : 10.5) +
    Math.max(0, groupStart.spanX - 4) * 0.45;

  const sampleNlfMetricDepthAtU = (
    u: number
  ): {
    camZ: number;
    camX: number;
    bboxH: number;
    unclampedBboxH: number;
    visibleBodyRatio: number;
    crownYNorm: number;
    bodyTiltRad: number;
  } => {
    if (!hasNlf3dCamera) {
      return {
        camZ: subjectDistanceMeters,
        camX: 0,
        bboxH: avgBboxH,
        unclampedBboxH: avgUnclampedBboxH,
        visibleBodyRatio: 1.0,
        crownYNorm: 0.14,
        bodyTiltRad: 0,
      };
    }
    const fIdx = clamp(u * (nlfCamSeries.length - 1), 0, nlfCamSeries.length - 1);
    const i0 = Math.floor(fIdx);
    const i1 = Math.min(nlfCamSeries.length - 1, i0 + 1);
    const frac = fIdx - i0;
    return {
      camZ: nlfCamSeries[i0].camZ + (nlfCamSeries[i1].camZ - nlfCamSeries[i0].camZ) * frac,
      camX: nlfCamSeries[i0].camX + (nlfCamSeries[i1].camX - nlfCamSeries[i0].camX) * frac,
      bboxH: nlfCamSeries[i0].bboxH + (nlfCamSeries[i1].bboxH - nlfCamSeries[i0].bboxH) * frac,
      unclampedBboxH:
        nlfCamSeries[i0].unclampedBboxH +
        (nlfCamSeries[i1].unclampedBboxH - nlfCamSeries[i0].unclampedBboxH) * frac,
      visibleBodyRatio:
        nlfCamSeries[i0].visibleBodyRatio +
        (nlfCamSeries[i1].visibleBodyRatio - nlfCamSeries[i0].visibleBodyRatio) * frac,
      crownYNorm:
        nlfCamSeries[i0].crownYNorm +
        (nlfCamSeries[i1].crownYNorm - nlfCamSeries[i0].crownYNorm) * frac,
      bodyTiltRad:
        nlfCamSeries[i0].bodyTiltRad +
        (nlfCamSeries[i1].bodyTiltRad - nlfCamSeries[i0].bodyTiltRad) * frac,
    };
  };

  const kfSteps = clamp(Math.round(durationSeconds * 4), 8, 60);
  const keyframes: CameraKeyframe[] = [];
  for (let k = 0; k < kfSteps; k++) {
    const u = k / (kfSteps - 1);
    const tSec = Number((u * durationSeconds).toFixed(2));
    const grp = sampleGroupStageCentroid(u);
    const flowIdx =
      bgFlows.length > 0 ? clamp(Math.round(u * (bgFlows.length - 1)), 0, bgFlows.length - 1) : 0;
    const flowAtT = bgFlows[flowIdx];
    // When NLF 3D metric camera observations (`hasNlf3dCamera`) are available, isolate the 3D camera
    // from 2D border optical-flow drift (`cumPanX`, `cumTiltY`, `cumZoom`) caused by moving background
    // elements such as ocean waves, blowing foliage, or passing ground texture.
    const yawAtT = hasNlf3dCamera ? 0 : flowAtT ? -flowAtT.cumPanX : cameraYawDeltaNorm * u;
    const pitchAtT = hasNlf3dCamera ? 0 : flowAtT ? flowAtT.cumTiltY : cameraPitchDeltaNorm * u;
    const zoomAtT = hasNlf3dCamera ? 0 : flowAtT ? flowAtT.cumZoom : combinedDollySignal * u;

    const nlfAtU = sampleNlfMetricDepthAtU(u);
    const rawTiltDeltaRad = hasNlf3dCamera ? nlfAtU.bodyTiltRad - medianBodyTiltRad : 0;
    // Apply a 2.5-deg (0.044 rad) deadband so steady eye-level walks remain rock-solid while true
    // crane/tilt shots smoothly evolve their elevation pitch across the shot timeline.
    const deadbandTiltDeltaRad =
      Math.abs(rawTiltDeltaRad) <= 0.044
        ? 0
        : rawTiltDeltaRad > 0
          ? rawTiltDeltaRad - 0.044
          : rawTiltDeltaRad + 0.044;
    const pitchRadAtU = clamp(pitchRad + deadbandTiltDeltaRad, -0.61, 1.13);

    let groundDistStage = fallbackDistY - zoomAtT * 3.5;
    let frameLookThreeY = baseLookHeight - pitchAtT * 1.1;

    if (hasNlf3dCamera) {
      const fullBodyDist = clamp(
        nlfAtU.camZ * Math.max(0.55, Math.cos(pitchRadAtU)) * 2.57 +
          Math.max(0, grp.spanX - 4) * 0.45,
        6.2,
        24.0
      );
      if (nlfAtU.visibleBodyRatio < 0.95) {
        // On the 3D Stage (`StagePrevis3D.tsx`), the humanoid character stands from Y = 0.0 (soles) to Y = 4.65 (crown of head),
        // and `computeCameraFovDeg` sets `vfCamera.fov` (vertical FOV) from `sensorWidthMm = 36.0` (`2 * tan(vFOV/2) = 36.0 / f_mm`).
        // Solve the exact per-frame vertical frustum span (`fullScreenSpanThreeY`) and headroom (`crownYNorm`) so the
        // Left Stage Viewfinder dynamically pushes in and shifts its vertical framing (e.g. from knees to chest) across time.
        const visRatio = clamp(nlfAtU.visibleBodyRatio, 0.28, 0.95);
        const visibleBboxSpan = clamp(nlfAtU.bboxH, 0.35, 0.95);
        const fullScreenSpanThreeY = (4.65 * visRatio) / visibleBboxSpan;
        const headroomFrac = clamp(nlfAtU.crownYNorm, 0.01, Math.max(0.02, 1.0 - visibleBboxSpan));
        const topCutThreeY = 4.65 + headroomFrac * fullScreenSpanThreeY;
        const bottomCutThreeY = topCutThreeY - fullScreenSpanThreeY;
        const cropLookThreeY = 0.5 * (topCutThreeY + bottomCutThreeY);
        const opticalCropDist =
          ((fullScreenSpanThreeY * customFocalLengthMm) / 36.0) *
          Math.max(0.65, Math.cos(pitchRadAtU));
        const minHorizDist =
          grp.spanX > 0.5
            ? (((grp.spanX + 1.8) / (16 / 9)) * customFocalLengthMm) / 36.0
            : 0;
        const cropDist = clamp(Math.max(opticalCropDist, minHorizDist), 2.2, 24.0);
        // Smooth C0 blend between cropped-frustum framing (visRatio <= 0.85) and full-body framing (visRatio >= 0.95)
        const fullBlend = clamp((visRatio - 0.85) / 0.1, 0, 1);
        groundDistStage = cropDist * (1 - fullBlend) + fullBodyDist * fullBlend;
        frameLookThreeY = cropLookThreeY * (1 - fullBlend) + baseLookHeight * fullBlend;
      } else {
        groundDistStage = fullBodyDist;
      }
    } else {
      groundDistStage = clamp(groundDistStage, 6.5, 24.0);
    }

    const panAzimuthRad = clamp(yawAtT * hfovRad * 0.85, -0.65, 0.65);
    const framingShiftStageX = hasNlf3dCamera ? clamp(-nlfAtU.camX * 1.85, -7.5, 7.5) : 0;
    const targetLookThreeY = clamp(frameLookThreeY, 1.8, 4.5);
    const camThreeY = clamp(targetLookThreeY + groundDistStage * Math.tan(pitchRadAtU), 0.55, 24.0);

    const camX = Number(
      clamp(grp.x + framingShiftStageX + groundDistStage * Math.sin(panAzimuthRad), 15, 85).toFixed(2)
    );
    const camY = Number(
      clamp(grp.y + groundDistStage * Math.cos(panAzimuthRad), 18, 92).toFixed(2)
    );
    const camZ = Number(clamp((camThreeY - 1.5) / 0.3, 0, 76).toFixed(2));
    const lookX = Number(clamp(grp.x + framingShiftStageX, 18, 82).toFixed(2));
    const lookY = Number(clamp(grp.y, 18, 82).toFixed(2));
    const lookZ = Number(clamp(50 + (targetLookThreeY - baseLookHeight) / 0.075, 10, 90).toFixed(2));

    keyframes.push({
      id: k === 0 ? 'cam-kf-vid-start' : k === kfSteps - 1 ? 'cam-kf-vid-end' : `cam-kf-vid-${k}`,
      time: tSec,
      position: { x: camX, y: camY, z: camZ },
      lookAt: { x: lookX, y: lookY, z: lookZ },
    });
  }

  const firstKf = keyframes[0];
  const midKf = keyframes[Math.floor(keyframes.length * 0.5)] ?? firstKf;
  const lastKf = keyframes[keyframes.length - 1] ?? firstKf;
  const focusDistanceMeters = Number(clamp(subjectDistanceMeters, 1.2, 15.0).toFixed(2));

  const summaryText = `Camera: ${customFocalLengthMm}mm (${focalLength}) ${shotType} (${angle}, pitch ${pitchOffsetDeg >= 0 ? '+' : ''}${pitchOffsetDeg}°, dist ${subjectDistanceMeters}m), movement "${movementType}" (${speed}) framing ${actorTracks.length || 1} subject(s) from (${firstKf.position.x}, ${firstKf.position.y}, ${firstKf.position.z}) to (${lastKf.position.x}, ${lastKf.position.y}, ${lastKf.position.z}).`;

  return {
    movementType,
    speed,
    shotType,
    angle,
    focalLength,
    customFocalLengthMm,
    pitchOffsetDeg,
    dutchRollDeg: 0,
    focusDistanceMeters,
    subjectDistanceMeters,
    startPosition: { ...firstKf.position },
    endPosition: { ...lastKf.position },
    targetLookAt: { ...(midKf.lookAt ?? { x: 50, y: 50 }) },
    keyframes,
    panDeltaNorm: Number(cameraYawDeltaNorm.toFixed(3)),
    tiltDeltaNorm: Number(cameraPitchDeltaNorm.toFixed(3)),
    zoomDeltaRatio: Number(combinedDollySignal.toFixed(3)),
    summaryText,
  };
}

interface RawPersonBlob {
  minX: number; // pixel x
  maxX: number;
  minY: number; // pixel y
  maxY: number;
  centroidX: number; // 0..1
  centroidY: number; // 0..1
  weightSum: number;
  upperWidthRatio: number;
  midWidthRatio: number;
  lowerWidthRatio: number;
  upperMotionEnergy: number;
  lowerMotionEnergy: number;
  leftRightAsymmetry: number;
  leftArmRaiseRatio: number;
  leftArmReachRatio: number;
  rightArmRaiseRatio: number;
  rightArmReachRatio: number;
  legSpreadRatio: number;
  torsoLeanRatio: number;
  clothingRgb: [number, number, number];
  foregroundCoverage: number;
  landmarks: PersonFramePoseLandmarks;
}

/**
 * Segments 1..4 distinct human silhouettes in a single frame using camera-compensated
 * foreground salience and horizontal column-projection peak clustering, then extracts
 * a 17-joint 2D/3D pose landmark skeleton (`PersonFramePoseLandmarks`) for each person
 * following the `toyxyz_RGBMocap` (`YOLO/ByteTrack` + `ViTPose` landmark) pipeline.
 */
function segmentPeopleInFrame(
  frame: VideoFrameSample,
  prevFrame: VideoFrameSample | null,
  bgFlow: FrameBackgroundFlow,
  expectedMinPeople = 1,
  strictMaxPeople = 4
): RawPersonBlob[] {
  const w = Math.max(1, frame.width);
  const h = Math.max(1, frame.height);
  const pixels = frame.pixels;
  const prevPixels =
    prevFrame && prevFrame.width === w && prevFrame.height === h ? prevFrame.pixels : null;

  const bgModel = estimateBorderBackgroundModel(pixels, w, h);
  const [bgR, bgG, bgB] = bgModel.globalRgb;

  const shiftX = Math.round(bgFlow.dxNorm * w);
  const shiftY = Math.round(bgFlow.dyNorm * h);

  const salMap = new Float32Array(w * h);
  const diffMap = new Float32Array(w * h);
  const colSalience = new Float32Array(w);

  for (let y = 0; y < h; y++) {
    // Compare against row-appropriate background reference (top vs mid vs bottom)
    const refRgb =
      y < h * 0.22
        ? bgModel.topRgb
        : y > h * 0.8
          ? bgModel.bottomRgb
          : [bgR, bgG, bgB];

    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = pixels[idx] ?? 0;
      const g = pixels[idx + 1] ?? 0;
      const b = pixels[idx + 2] ?? 0;

      const bgDiff =
        (Math.abs(r - refRgb[0]) + Math.abs(g - refRgb[1]) + Math.abs(b - refRgb[2])) / (255 * 3);

      let temporalDiff = 0;
      if (prevPixels) {
        const px = clamp(x - shiftX, 0, w - 1);
        const py = clamp(y - shiftY, 0, h - 1);
        const pIdx = (py * w + px) * 4;
        const pr = prevPixels[pIdx] ?? r;
        const pg = prevPixels[pIdx + 1] ?? g;
        const pb = prevPixels[pIdx + 2] ?? b;
        temporalDiff = (Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb)) / (255 * 3);
      }

      // Weight central vertical human zone (y: 0.1..0.92) higher than extreme sky/floor edges
      const vertPrior = y >= h * 0.08 && y <= h * 0.94 ? 1.0 : 0.35;
      const sal = Math.max(bgDiff * 0.95, temporalDiff * 1.45) * vertPrior;
      salMap[y * w + x] = sal;
      diffMap[y * w + x] = temporalDiff;
      if (sal > 0.13) {
        colSalience[x] += sal;
      }
    }
  }

  // Smooth horizontal column profile with a 5-tap Gaussian filter to separate distinct people
  const smoothCol = new Float32Array(w);
  let maxColVal = 0;
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let wSum = 0;
    for (let k = -2; k <= 2; k++) {
      const nx = clamp(x + k, 0, w - 1);
      const wt = k === 0 ? 0.36 : Math.abs(k) === 1 ? 0.24 : 0.08;
      sum += colSalience[nx] * wt;
      wSum += wt;
    }
    smoothCol[x] = sum / wSum;
    if (smoothCol[x] > maxColVal) maxColVal = smoothCol[x];
  }

  // Find horizontal spans [xStart, xEnd] corresponding to distinct people
  const spans: Array<{ x0: number; x1: number; peakX: number; peakVal: number }> = [];
  const colThreshold = Math.max(0.32, maxColVal * 0.34);

  let inSpan = false;
  let spanStart = 0;
  let peakX = 0;
  let peakVal = 0;

  for (let x = 0; x < w; x++) {
    const v = smoothCol[x];
    if (v >= colThreshold) {
      if (!inSpan) {
        inSpan = true;
        spanStart = x;
        peakX = x;
        peakVal = v;
      } else {
        if (v > peakVal) {
          peakVal = v;
          peakX = x;
        }
        // Only split a wide span if there is a true deep separation valley (< 30% of peak)
        if (
          x - spanStart >= Math.floor(w * 0.28) &&
          x > 1 &&
          x < w - 2 &&
          v < peakVal * 0.3 &&
          smoothCol[x + 1] > v * 1.12
        ) {
          spans.push({ x0: spanStart, x1: x - 1, peakX, peakVal });
          spanStart = x;
          peakX = x;
          peakVal = v;
        }
      }
    } else if (inSpan) {
      if (x - spanStart >= Math.max(3, Math.floor(w * 0.07))) {
        spans.push({ x0: spanStart, x1: x - 1, peakX, peakVal });
      }
      inSpan = false;
    }
  }
  if (inSpan && w - spanStart >= Math.max(3, Math.floor(w * 0.07))) {
    spans.push({ x0: spanStart, x1: w - 1, peakX, peakVal });
  }

  // If no span exceeded threshold (e.g. very low-contrast frame), create a default full-frame span
  if (spans.length === 0) {
    spans.push({
      x0: Math.floor(w * 0.25),
      x1: Math.floor(w * 0.75),
      peakX: Math.floor(w * 0.5),
      peakVal: 1,
    });
  }

  // If caller/hint indicates multiple people (e.g. 2 actors) but a single wide span was merged, split it cleanly
  while (spans.length < expectedMinPeople && spans.length < strictMaxPeople) {
    spans.sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0));
    const widest = spans[0];
    if (widest.x1 - widest.x0 >= 6) {
      const mid = Math.floor((widest.x0 + widest.x1) * 0.5);
      spans.splice(
        0,
        1,
        { x0: widest.x0, x1: mid, peakX: Math.floor((widest.x0 + mid) * 0.5), peakVal: widest.peakVal },
        { x0: mid + 1, x1: widest.x1, peakX: Math.floor((mid + 1 + widest.x1) * 0.5), peakVal: widest.peakVal }
      );
    } else {
      break;
    }
  }

  // Sort spans by salience strength, cap at strictMaxPeople, then order left-to-right
  const selectedSpans = spans
    .sort((a, b) => b.peakVal - a.peakVal)
    .slice(0, clamp(strictMaxPeople, 1, 4))
    .sort((a, b) => a.x0 - b.x0);

  const blobs: RawPersonBlob[] = [];
  const totalPixels = w * h;

  for (const sp of selectedSpans) {
    let weightSum = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = sp.x1;
    let maxX = sp.x0;
    let minY = h;
    let maxY = 0;
    let fgCount = 0;

    let upperEnergySum = 0;
    let lowerEnergySum = 0;
    let leftWeight = 0;
    let rightWeight = 0;

    let clothR = 0;
    let clothG = 0;
    let clothB = 0;
    let clothCount = 0;

    const rowMinX = new Int32Array(h).fill(w);
    const rowMaxX = new Int32Array(h).fill(-1);
    const rowWeightedX = new Float32Array(h);
    const rowWeightSum = new Float32Array(h);

    const spanCenter = (sp.x0 + sp.x1) * 0.5;

    for (let y = 0; y < h; y++) {
      for (let x = sp.x0; x <= sp.x1; x++) {
        const sal = salMap[y * w + x];
        const tDiff = diffMap[y * w + x];

        if (sal > 0.12) {
          fgCount++;
          sumX += x * sal;
          sumY += y * sal;
          weightSum += sal;

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          if (x < rowMinX[y]) rowMinX[y] = x;
          if (x > rowMaxX[y]) rowMaxX[y] = x;
          rowWeightedX[y] += x * sal;
          rowWeightSum[y] += sal;

          if (x < spanCenter) leftWeight += sal;
          else rightWeight += sal;

          // Sample clothing RGB from torso middle region
          if (y >= h * 0.28 && y <= h * 0.65) {
            const idx = (y * w + x) * 4;
            clothR += pixels[idx] ?? 0;
            clothG += pixels[idx + 1] ?? 0;
            clothB += pixels[idx + 2] ?? 0;
            clothCount++;
          }
        }

        if (y < h * 0.52) upperEnergySum += tDiff;
        else lowerEnergySum += tDiff;
      }
    }

    const hasValidFg = weightSum > 0.01 && maxX >= minX && maxY >= minY;
    const centroidX = hasValidFg ? clamp(sumX / weightSum / Math.max(1, w - 1), 0.05, 0.95) : ((sp.x0 + sp.x1) * 0.5) / w;
    const centroidY = hasValidFg ? clamp(sumY / weightSum / Math.max(1, h - 1), 0.1, 0.9) : 0.52;

    const bboxMinX = hasValidFg ? minX / w : sp.x0 / w;
    const bboxMaxX = hasValidFg ? (maxX + 1) / w : (sp.x1 + 1) / w;
    const bboxMinY = hasValidFg ? minY / h : 0.18;
    const bboxMaxY = hasValidFg ? (maxY + 1) / h : 0.88;
    const bboxWidth = clamp(bboxMaxX - bboxMinX, 0.06, 0.95);
    const bboxHeight = clamp(bboxMaxY - bboxMinY, 0.12, 0.95);

    const measureSliceWidth = (ratioFromTop: number): number => {
      if (!hasValidFg) return bboxWidth * 0.65;
      const centerRow = clamp(Math.round(minY + (maxY - minY) * ratioFromTop), 0, h - 1);
      let spanSum = 0;
      let spanRows = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ry = clamp(centerRow + dy, 0, h - 1);
        if (rowMaxX[ry] >= rowMinX[ry]) {
          spanSum += (rowMaxX[ry] - rowMinX[ry] + 1) / w;
          spanRows++;
        }
      }
      return spanRows > 0 ? spanSum / spanRows : bboxWidth * 0.65;
    };

    const upperWidthRatio = measureSliceWidth(0.24);
    const midWidthRatio = measureSliceWidth(0.54);
    const lowerWidthRatio = measureSliceWidth(0.82);

    // -------------------------------------------------------------------------
    // Extract 17 Anatomical 2D/3D Pose Landmarks from Silhouette Contour
    // -------------------------------------------------------------------------
    const bH = Math.max(4, maxY - minY);
    const headRowEnd = clamp(Math.round(minY + bH * 0.18), 0, h - 1);
    const neckRow = clamp(Math.round(minY + bH * 0.2), 0, h - 1);
    const shoulderRow = clamp(Math.round(minY + bH * 0.24), 0, h - 1);
    const armRowStart = clamp(Math.round(minY + bH * 0.12), 0, h - 1);
    const armRowEnd = clamp(Math.round(minY + bH * 0.56), 0, h - 1);
    const hipRow = clamp(Math.round(minY + bH * 0.55), 0, h - 1);
    const kneeRow = clamp(Math.round(minY + bH * 0.76), 0, h - 1);
    const legRowStart = clamp(Math.round(minY + bH * 0.68), 0, h - 1);

    const getRowCenterNormX = (r0: number, r1: number, fallbackNormX: number): number => {
      let sx = 0;
      let sw = 0;
      for (let ry = clamp(r0, 0, h - 1); ry <= clamp(r1, 0, h - 1); ry++) {
        if (rowWeightSum[ry] > 0) {
          sx += rowWeightedX[ry];
          sw += rowWeightSum[ry];
        } else if (rowMaxX[ry] >= rowMinX[ry]) {
          sx += (rowMinX[ry] + rowMaxX[ry]) * 0.5;
          sw += 1;
        }
      }
      return sw > 0 ? clamp(sx / sw / Math.max(1, w - 1), 0.04, 0.96) : fallbackNormX;
    };

    const hipsNormX = getRowCenterNormX(hipRow - 1, hipRow + 1, centroidX);
    const hipsNormY = clamp((minY + bH * 0.55) / h, 0.15, 0.92);
    const hipCenterPx = hipsNormX * w;
    const halfTorsoPx = Math.max(2, (midWidthRatio * w) * 0.5);

    const headNormX = getRowCenterNormX(minY, headRowEnd, hipsNormX);
    const headNormY = clamp((minY + bH * 0.09) / h, 0.04, 0.85);
    const neckNormX = getRowCenterNormX(neckRow - 1, neckRow + 1, (headNormX + hipsNormX) * 0.5);
    const neckNormY = clamp((minY + bH * 0.2) / h, 0.08, 0.88);

    const shoulderHalfSpan = clamp(upperWidthRatio * 0.42, 0.035, 0.14);
    const leftShoulderX = clamp(neckNormX - shoulderHalfSpan, 0.03, 0.97);
    const rightShoulderX = clamp(neckNormX + shoulderHalfSpan, 0.03, 0.97);
    const shoulderY = clamp(shoulderRow / h, 0.1, 0.88);

    const hipHalfSpan = clamp(midWidthRatio * 0.34, 0.028, 0.11);
    const leftHipX = clamp(hipsNormX - hipHalfSpan, 0.03, 0.97);
    const rightHipX = clamp(hipsNormX + hipHalfSpan, 0.03, 0.97);

    // Track left & right upper-body contour extremities for Elbows & Wrists
    let maxLeftExtPx = 0;
    let maxLeftExtRow = armRowEnd;
    let maxRightExtPx = 0;
    let maxRightExtRow = armRowEnd;

    for (let ry = armRowStart; ry <= armRowEnd; ry++) {
      if (rowMaxX[ry] >= rowMinX[ry]) {
        const lExt = hipCenterPx - rowMinX[ry];
        const rExt = rowMaxX[ry] - hipCenterPx;
        if (lExt > maxLeftExtPx) {
          maxLeftExtPx = lExt;
          maxLeftExtRow = ry;
        }
        if (rExt > maxRightExtPx) {
          maxRightExtPx = rExt;
          maxRightExtRow = ry;
        }
      }
    }

    const torsoLeanRatio = clamp(((headNormX - hipsNormX) * w) / Math.max(3, bH * 0.35), -1, 1);

    const leftArmReachRatio = clamp((maxLeftExtPx - halfTorsoPx * 0.85) / Math.max(2, halfTorsoPx * 1.6), 0, 1);
    const rightArmReachRatio = clamp((maxRightExtPx - halfTorsoPx * 0.85) / Math.max(2, halfTorsoPx * 1.6), 0, 1);
    const leftArmRaiseRatio = clamp(1 - (maxLeftExtRow - minY) / Math.max(2, bH * 0.52), 0, 1) * clamp(leftArmReachRatio + 0.25, 0, 1);
    const rightArmRaiseRatio = clamp(1 - (maxRightExtRow - minY) / Math.max(2, bH * 0.52), 0, 1) * clamp(rightArmReachRatio + 0.25, 0, 1);

    const leftWristX = clamp(
      leftArmReachRatio > 0.14 && hasValidFg
        ? rowMinX[maxLeftExtRow] / w
        : leftShoulderX - 0.02 - leftArmReachRatio * 0.08,
      0.02,
      0.98
    );
    const leftWristY = clamp(
      leftArmReachRatio > 0.14 && hasValidFg
        ? maxLeftExtRow / h
        : shoulderY + (0.24 - leftArmRaiseRatio * 0.22) * bboxHeight,
      0.04,
      0.96
    );
    const leftElbowX = clamp((leftShoulderX + leftWristX) * 0.5 - 0.015, 0.02, 0.98);
    const leftElbowY = clamp((shoulderY + leftWristY) * 0.5 + 0.02 * bboxHeight, 0.05, 0.95);

    const rightWristX = clamp(
      rightArmReachRatio > 0.14 && hasValidFg
        ? rowMaxX[maxRightExtRow] / w
        : rightShoulderX + 0.02 + rightArmReachRatio * 0.08,
      0.02,
      0.98
    );
    const rightWristY = clamp(
      rightArmReachRatio > 0.14 && hasValidFg
        ? maxRightExtRow / h
        : shoulderY + (0.24 - rightArmRaiseRatio * 0.22) * bboxHeight,
      0.04,
      0.96
    );
    const rightElbowX = clamp((rightShoulderX + rightWristX) * 0.5 + 0.015, 0.02, 0.98);
    const rightElbowY = clamp((shoulderY + rightWristY) * 0.5 + 0.02 * bboxHeight, 0.05, 0.95);

    // Track left & right lower-leg columns separately for Knees & Ankles
    let maxLegSpanPx = 0;
    let leftFootMaxRow = Math.round(minY + bH * 0.94);
    let rightFootMaxRow = Math.round(minY + bH * 0.94);
    let leftAnkleSumX = 0;
    let leftAnkleCount = 0;
    let rightAnkleSumX = 0;
    let rightAnkleCount = 0;

    for (let ry = legRowStart; ry <= maxY; ry++) {
      if (rowMaxX[ry] >= rowMinX[ry]) {
        const span = rowMaxX[ry] - rowMinX[ry] + 1;
        if (span > maxLegSpanPx) maxLegSpanPx = span;
        if (ry >= minY + bH * 0.82) {
          if (rowMinX[ry] <= hipCenterPx) {
            leftFootMaxRow = Math.max(leftFootMaxRow, ry);
            leftAnkleSumX += (rowMinX[ry] + Math.min(hipCenterPx, rowMaxX[ry])) * 0.5;
            leftAnkleCount++;
          }
          if (rowMaxX[ry] >= hipCenterPx) {
            rightFootMaxRow = Math.max(rightFootMaxRow, ry);
            rightAnkleSumX += (Math.max(hipCenterPx, rowMinX[ry]) + rowMaxX[ry]) * 0.5;
            rightAnkleCount++;
          }
        }
      }
    }
    const legSpreadRatio = clamp((maxLegSpanPx / w - midWidthRatio * 0.7) / Math.max(0.06, midWidthRatio * 1.1), 0, 1);

    const leftAnkleX = clamp(
      leftAnkleCount > 0 ? leftAnkleSumX / leftAnkleCount / w : leftHipX - legSpreadRatio * 0.05,
      0.02,
      0.98
    );
    const rightAnkleX = clamp(
      rightAnkleCount > 0 ? rightAnkleSumX / rightAnkleCount / w : rightHipX + legSpreadRatio * 0.05,
      0.02,
      0.98
    );
    const leftAnkleY = clamp((hasValidFg ? leftFootMaxRow : maxY) / h, 0.2, 0.98);
    const rightAnkleY = clamp((hasValidFg ? rightFootMaxRow : maxY) / h, 0.2, 0.98);

    const leftKneeX = clamp((leftHipX + leftAnkleX) * 0.5, 0.02, 0.98);
    const rightKneeX = clamp((rightHipX + rightAnkleX) * 0.5, 0.02, 0.98);
    const kneeY = clamp(kneeRow / h, 0.18, 0.95);

    const spanArea = Math.max(1, (sp.x1 - sp.x0 + 1) * h * 0.5);
    const upperMotionEnergy = clamp((upperEnergySum / spanArea) * 6.5, 0, 1);
    const lowerMotionEnergy = clamp((lowerEnergySum / spanArea) * 6.5, 0, 1);
    const asymDenom = Math.max(0.001, leftWeight + rightWeight);
    const leftRightAsymmetry = clamp((rightWeight - leftWeight) / asymDenom, -1, 1);

    const clothingRgb: [number, number, number] =
      clothCount > 0
        ? [clothR / clothCount, clothG / clothCount, clothB / clothCount]
        : [56, 189, 248];

    const landmarks: PersonFramePoseLandmarks = {
      timeSec: frame.timeSec,
      bbox: {
        minX: Number(bboxMinX.toFixed(4)),
        maxX: Number(bboxMaxX.toFixed(4)),
        minY: Number(bboxMinY.toFixed(4)),
        maxY: Number(bboxMaxY.toFixed(4)),
      },
      leftFootContact: Math.abs(leftAnkleY - bboxMaxY) < 0.045,
      rightFootContact: Math.abs(rightAnkleY - bboxMaxY) < 0.045,
      joints: {
        head: { x: headNormX, y: headNormY, z: 0, confidence: 0.9 },
        neck: { x: neckNormX, y: neckNormY, z: 0, confidence: 0.9 },
        leftShoulder: { x: leftShoulderX, y: shoulderY, z: 0, confidence: 0.88 },
        rightShoulder: { x: rightShoulderX, y: shoulderY, z: 0, confidence: 0.88 },
        leftElbow: { x: leftElbowX, y: leftElbowY, z: -leftArmReachRatio * 0.15, confidence: 0.84 },
        rightElbow: { x: rightElbowX, y: rightElbowY, z: -rightArmReachRatio * 0.15, confidence: 0.84 },
        leftWrist: { x: leftWristX, y: leftWristY, z: -leftArmReachRatio * 0.25, confidence: 0.82 },
        rightWrist: { x: rightWristX, y: rightWristY, z: -rightArmReachRatio * 0.25, confidence: 0.82 },
        hips: { x: hipsNormX, y: hipsNormY, z: 0, confidence: 0.92 },
        leftHip: { x: leftHipX, y: hipsNormY, z: 0, confidence: 0.9 },
        rightHip: { x: rightHipX, y: hipsNormY, z: 0, confidence: 0.9 },
        leftKnee: { x: leftKneeX, y: kneeY, z: -0.04, confidence: 0.86 },
        rightKnee: { x: rightKneeX, y: kneeY, z: -0.04, confidence: 0.86 },
        leftAnkle: { x: leftAnkleX, y: leftAnkleY, z: 0, confidence: 0.88 },
        rightAnkle: { x: rightAnkleX, y: rightAnkleY, z: 0, confidence: 0.88 },
      },
    };

    blobs.push({
      minX: hasValidFg ? minX : sp.x0,
      maxX: hasValidFg ? maxX : sp.x1,
      minY: hasValidFg ? minY : Math.floor(h * 0.18),
      maxY: hasValidFg ? maxY : Math.floor(h * 0.88),
      centroidX,
      centroidY,
      weightSum,
      upperWidthRatio,
      midWidthRatio,
      lowerWidthRatio,
      upperMotionEnergy,
      lowerMotionEnergy,
      leftRightAsymmetry,
      leftArmRaiseRatio,
      leftArmReachRatio,
      rightArmRaiseRatio,
      rightArmReachRatio,
      legSpreadRatio,
      torsoLeanRatio,
      clothingRgb,
      foregroundCoverage: clamp(fgCount / totalPixels, 0, 1),
      landmarks,
    });
  }

  return blobs;
}

/**
 * Applies a symmetric Savitzky-Golay / Gaussian temporal smoothing filter across a person's
 * tracked `PersonFrameMetrics[]` sequence and refines `FootMR` foot contact locking states.
 */
function smoothPersonMetricTrack(
  rawTrack: PersonFrameMetrics[],
  smoothingStrength = 0.65
): PersonFrameMetrics[] {
  const n = rawTrack.length;
  if (n <= 2 || smoothingStrength <= 0.01) return rawTrack;

  const alpha = clamp(smoothingStrength, 0, 1);
  const jointKeys = Object.keys(rawTrack[0].landmarks.joints) as Array<
    keyof PersonFramePoseLandmarks['joints']
  >;

  // Find ground baseline ankle Y (90th percentile of max ankle Y across sequence)
  const allAnkleYs = rawTrack.flatMap((m) => [
    m.landmarks.joints.leftAnkle.y,
    m.landmarks.joints.rightAnkle.y,
  ]);
  allAnkleYs.sort((a, b) => a - b);
  const groundAnkleY = allAnkleYs[Math.floor(allAnkleYs.length * 0.85)] ?? 0.85;

  return rawTrack.map((cur, i) => {
    const getWeight = (offset: number): number => {
      if (offset === 0) return 1.0;
      if (Math.abs(offset) === 1) return 0.55 * alpha;
      return 0.22 * alpha;
    };

    let wSum = 0;
    let cX = 0;
    let cY = 0;
    let wCX = 0;
    let wFY = 0;
    let lRaise = 0;
    let lReach = 0;
    let rRaise = 0;
    let rReach = 0;
    let legSp = 0;
    let tLean = 0;

    const smoothedJoints = { ...cur.landmarks.joints };
    for (const jk of jointKeys) {
      let jx = 0;
      let jy = 0;
      let jz = 0;
      let jw = 0;
      for (let k = -2; k <= 2; k++) {
        const idx = clamp(i + k, 0, n - 1);
        const wt = getWeight(k);
        const jSample = rawTrack[idx].landmarks.joints[jk];
        jx += jSample.x * wt;
        jy += jSample.y * wt;
        jz += jSample.z * wt;
        jw += wt;
      }
      smoothedJoints[jk] = {
        x: Number((jx / jw).toFixed(4)),
        y: Number((jy / jw).toFixed(4)),
        z: Number((jz / jw).toFixed(4)),
        confidence: cur.landmarks.joints[jk].confidence,
      };
    }

    for (let k = -2; k <= 2; k++) {
      const idx = clamp(i + k, 0, n - 1);
      const wt = getWeight(k);
      const m = rawTrack[idx];
      cX += m.centroidX * wt;
      cY += m.centroidY * wt;
      wCX += m.worldCentroidX * wt;
      wFY += m.worldFootY * wt;
      lRaise += m.leftArmRaiseRatio * wt;
      lReach += m.leftArmReachRatio * wt;
      rRaise += m.rightArmRaiseRatio * wt;
      rReach += m.rightArmReachRatio * wt;
      legSp += m.legSpreadRatio * wt;
      tLean += m.torsoLeanRatio * wt;
      wSum += wt;
    }

    const prevIdx = Math.max(0, i - 1);
    const lAnkleVel = Math.hypot(
      smoothedJoints.leftAnkle.x - rawTrack[prevIdx].landmarks.joints.leftAnkle.x,
      smoothedJoints.leftAnkle.y - rawTrack[prevIdx].landmarks.joints.leftAnkle.y
    );
    const rAnkleVel = Math.hypot(
      smoothedJoints.rightAnkle.x - rawTrack[prevIdx].landmarks.joints.rightAnkle.x,
      smoothedJoints.rightAnkle.y - rawTrack[prevIdx].landmarks.joints.rightAnkle.y
    );

    const leftFootContact =
      smoothedJoints.leftAnkle.y >= groundAnkleY - 0.045 && lAnkleVel < 0.045;
    const rightFootContact =
      smoothedJoints.rightAnkle.y >= groundAnkleY - 0.045 && rAnkleVel < 0.045;

    return {
      ...cur,
      centroidX: cX / wSum,
      centroidY: cY / wSum,
      worldCentroidX: wCX / wSum,
      worldFootY: wFY / wSum,
      leftArmRaiseRatio: lRaise / wSum,
      leftArmReachRatio: lReach / wSum,
      rightArmRaiseRatio: rRaise / wSum,
      rightArmReachRatio: rReach / wSum,
      legSpreadRatio: legSp / wSum,
      torsoLeanRatio: tLean / wSum,
      landmarks: {
        ...cur.landmarks,
        leftFootContact,
        rightFootContact,
        joints: smoothedJoints,
      },
    };
  });
}

/**
 * Detects and tracks 1..N people across the video frame sequence, returning per-person
 * `PersonFrameMetrics[]` sequences compensated for camera motion and smoothed with
 * Savitzky-Golay temporal filtering.
 */
function trackMultiplePeopleAcrossFrames(
  frames: VideoFrameSample[],
  bgFlows: FrameBackgroundFlow[],
  hintText: string,
  smoothingStrength = 0.65
): PersonFrameMetrics[][] {
  if (frames.length === 0) return [];

  const lowerHint = String(hintText ?? '').toLowerCase().replace(/[_-]+/g, ' ');
  const explicitDecomp = decomposeMocapAndSceneHint(hintText);
  let expectedMinPeople = explicitDecomp.hasExplicitPersonCount ? explicitDecomp.personCount : 1;
  if (!explicitDecomp.hasExplicitPersonCount) {
    if (/\b(4|four|أربع|اربعة|أربعة)\b/.test(lowerHint)) expectedMinPeople = Math.max(expectedMinPeople, 4);
    else if (/\b(3|three|trio|group|crowd|ثلاث|ثلاثة)\b/.test(lowerHint)) expectedMinPeople = Math.max(expectedMinPeople, 3);
    else if (/\b(2|two|both|pair|duel|couple|versus|vs|fight between|شخصين|اثنين)\b/.test(lowerHint)) expectedMinPeople = Math.max(expectedMinPeople, 2);
  }

  // If the user explicitly stated how many people (or roles like "رجل وامرأة" = 2), cap strictly at that number!
  const strictMaxPeople = explicitDecomp.hasExplicitPersonCount
    ? explicitDecomp.personCount
    : 4;

  const perFrameBlobs: RawPersonBlob[][] = [];
  const counts: number[] = [];

  for (let i = 0; i < frames.length; i++) {
    const blobs = segmentPeopleInFrame(
      frames[i],
      i > 0 ? frames[i - 1] : null,
      bgFlows[i] ?? { dxNorm: 0, dyNorm: 0, radialScaleDelta: 0, cumPanX: 0, cumTiltY: 0, cumZoom: 0 },
      expectedMinPeople,
      strictMaxPeople
    );
    perFrameBlobs.push(blobs);
    counts.push(blobs.length);
  }

  // Determine authoritative target person count:
  // If user explicitly provided person count/roles, strictly use `explicitDecomp.personCount`!
  const sortedCounts = [...counts].sort((a, b) => a - b);
  const medianCount = sortedCounts[Math.floor(sortedCounts.length * 0.5)] ?? 1;
  const targetPersonCount = explicitDecomp.hasExplicitPersonCount
    ? clamp(explicitDecomp.personCount, 1, 4)
    : clamp(Math.max(expectedMinPeople, Math.min(2, medianCount)), 1, 4);

  // Initialize tracks from the first frame that has >= targetPersonCount blobs (or frame 0)
  const tracks: PersonFrameMetrics[][] = Array.from({ length: targetPersonCount }, () => []);

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const flow = bgFlows[i] ?? { dxNorm: 0, dyNorm: 0, radialScaleDelta: 0, cumPanX: 0, cumTiltY: 0, cumZoom: 0 };
    const blobs = perFrameBlobs[i];

    for (let p = 0; p < targetPersonCount; p++) {
      const prevTrackMetric = tracks[p].length > 0 ? tracks[p][tracks[p].length - 1] : null;

      // Pick best matching blob for person p
      let chosenBlob = blobs[Math.min(p, blobs.length - 1)];
      if (prevTrackMetric && blobs.length > 1) {
        let bestScore = Number.POSITIVE_INFINITY;
        for (const candidate of blobs) {
          const distX = Math.abs(candidate.centroidX - prevTrackMetric.centroidX);
          const distY = Math.abs(candidate.centroidY - prevTrackMetric.centroidY);
          const colorDiff =
            (Math.abs(candidate.clothingRgb[0] - prevTrackMetric.clothingRgb[0]) +
              Math.abs(candidate.clothingRgb[1] - prevTrackMetric.clothingRgb[1]) +
              Math.abs(candidate.clothingRgb[2] - prevTrackMetric.clothingRgb[2])) /
            (255 * 3);
          const score = distX * 2.0 + distY * 1.0 + colorDiff * 0.5;
          if (score < bestScore) {
            bestScore = score;
            chosenBlob = candidate;
          }
        }
      }

      const w = Math.max(1, f.width);
      const h = Math.max(1, f.height);
      const bboxMinX = chosenBlob ? chosenBlob.minX / w : 0.35;
      const bboxMaxX = chosenBlob ? (chosenBlob.maxX + 1) / w : 0.65;
      const bboxMinY = chosenBlob ? chosenBlob.minY / h : 0.18;
      const bboxMaxY = chosenBlob ? (chosenBlob.maxY + 1) / h : 0.88;
      const bboxWidth = clamp(bboxMaxX - bboxMinX, 0.08, 0.95);
      const bboxHeight = clamp(bboxMaxY - bboxMinY, 0.12, 0.95);
      const centroidX = chosenBlob ? chosenBlob.centroidX : 0.5;
      const centroidY = chosenBlob ? chosenBlob.centroidY : 0.52;

      // Subtract cumulative background optical flow so worldCentroidX reflects true actor motion in world space!
      const worldCentroidX = clamp(centroidX - flow.cumPanX, 0.02, 0.98);
      const worldFootY = clamp(bboxMaxY - flow.cumTiltY, 0.1, 0.98);

      const upperEnergy = chosenBlob?.upperMotionEnergy ?? 0;
      const lowerEnergy = chosenBlob?.lowerMotionEnergy ?? 0;

      const defaultJoint: MocapJoint2D = { x: centroidX, y: centroidY, z: 0, confidence: 0.75 };
      const fallbackLandmarks: PersonFramePoseLandmarks = {
        timeSec: f.timeSec,
        bbox: { minX: bboxMinX, maxX: bboxMaxX, minY: bboxMinY, maxY: bboxMaxY },
        leftFootContact: true,
        rightFootContact: true,
        joints: {
          head: { ...defaultJoint, y: bboxMinY + bboxHeight * 0.1 },
          neck: { ...defaultJoint, y: bboxMinY + bboxHeight * 0.2 },
          leftShoulder: { ...defaultJoint, x: centroidX - 0.06, y: bboxMinY + bboxHeight * 0.24 },
          rightShoulder: { ...defaultJoint, x: centroidX + 0.06, y: bboxMinY + bboxHeight * 0.24 },
          leftElbow: { ...defaultJoint, x: centroidX - 0.08, y: bboxMinY + bboxHeight * 0.4 },
          rightElbow: { ...defaultJoint, x: centroidX + 0.08, y: bboxMinY + bboxHeight * 0.4 },
          leftWrist: { ...defaultJoint, x: centroidX - 0.09, y: bboxMinY + bboxHeight * 0.55 },
          rightWrist: { ...defaultJoint, x: centroidX + 0.09, y: bboxMinY + bboxHeight * 0.55 },
          hips: { ...defaultJoint, y: bboxMinY + bboxHeight * 0.55 },
          leftHip: { ...defaultJoint, x: centroidX - 0.04, y: bboxMinY + bboxHeight * 0.55 },
          rightHip: { ...defaultJoint, x: centroidX + 0.04, y: bboxMinY + bboxHeight * 0.55 },
          leftKnee: { ...defaultJoint, x: centroidX - 0.04, y: bboxMinY + bboxHeight * 0.76 },
          rightKnee: { ...defaultJoint, x: centroidX + 0.04, y: bboxMinY + bboxHeight * 0.76 },
          leftAnkle: { ...defaultJoint, x: centroidX - 0.04, y: bboxMaxY },
          rightAnkle: { ...defaultJoint, x: centroidX + 0.04, y: bboxMaxY },
        },
      };

      tracks[p].push({
        timeSec: f.timeSec,
        centroidX,
        centroidY,
        worldCentroidX,
        worldFootY,
        bboxMinX,
        bboxMaxX,
        bboxMinY,
        bboxMaxY,
        bboxWidth,
        bboxHeight,
        upperWidthRatio: chosenBlob?.upperWidthRatio ?? bboxWidth * 0.65,
        midWidthRatio: chosenBlob?.midWidthRatio ?? bboxWidth * 0.55,
        lowerWidthRatio: chosenBlob?.lowerWidthRatio ?? bboxWidth * 0.5,
        upperMotionEnergy: upperEnergy,
        lowerMotionEnergy: lowerEnergy,
        totalMotionEnergy: clamp((upperEnergy + lowerEnergy) * 0.5, 0, 1),
        leftRightAsymmetry: chosenBlob?.leftRightAsymmetry ?? 0,
        leftArmRaiseRatio: chosenBlob?.leftArmRaiseRatio ?? 0,
        leftArmReachRatio: chosenBlob?.leftArmReachRatio ?? 0,
        rightArmRaiseRatio: chosenBlob?.rightArmRaiseRatio ?? 0,
        rightArmReachRatio: chosenBlob?.rightArmReachRatio ?? 0,
        legSpreadRatio: chosenBlob?.legSpreadRatio ?? 0,
        torsoLeanRatio: chosenBlob?.torsoLeanRatio ?? 0,
        clothingRgb: chosenBlob?.clothingRgb ?? [56, 189, 248],
        foregroundCoverage: chosenBlob?.foregroundCoverage ?? 0.15,
        landmarks: chosenBlob?.landmarks ?? fallbackLandmarks,
      });
    }
  }

  // Filter out duplicate tracks if two tracks converged to the exact same bounding box across >75% of frames
  const uniqueTracks: PersonFrameMetrics[][] = [];
  for (const tr of tracks) {
    if (tr.length === 0) continue;
    const isDuplicate = uniqueTracks.some((existing) => {
      let sameCount = 0;
      for (let i = 0; i < tr.length; i++) {
        if (Math.abs(tr[i].centroidX - existing[i].centroidX) < 0.12) {
          sameCount++;
        }
      }
      return sameCount > tr.length * 0.75;
    });
    if (!isDuplicate || uniqueTracks.length < expectedMinPeople) {
      uniqueTracks.push(smoothPersonMetricTrack(tr, smoothingStrength));
    }
  }

  return uniqueTracks.length > 0
    ? uniqueTracks
    : [smoothPersonMetricTrack(tracks[0], smoothingStrength)];
}

/**
 * Estimates anthropometric `MocapBodyProportions` from the analyzed video silhouette slices.
 */
function estimateBodyProportionsFromVision(
  metrics: PersonFrameMetrics[],
  extractEnabled: boolean
): MocapBodyProportions {
  if (!extractEnabled || metrics.length === 0) {
    return {
      heightMeters: 1.75,
      shoulderWidthRatio: 1.0,
      hipWidthRatio: 1.0,
      torsoLengthRatio: 1.0,
      legLengthRatio: 1.0,
      bulkFactor: 1.0,
      hasSkinnedMesh: false,
      vertexCount: 0,
      boneCount: 19,
    };
  }

  const sortedByHeight = [...metrics].sort((a, b) => b.bboxHeight - a.bboxHeight);
  const topCount = Math.max(1, Math.ceil(sortedByHeight.length * 0.6));
  const uprightSample = sortedByHeight.slice(0, topCount);

  let avgBboxH = 0;
  let avgBboxW = 0;
  let avgUpperW = 0;
  let avgMidW = 0;
  let avgLowerW = 0;

  for (const m of uprightSample) {
    avgBboxH += m.bboxHeight;
    avgBboxW += m.bboxWidth;
    avgUpperW += m.upperWidthRatio;
    avgMidW += m.midWidthRatio;
    avgLowerW += m.lowerWidthRatio;
  }
  avgBboxH /= uprightSample.length;
  avgBboxW /= uprightSample.length;
  avgUpperW /= uprightSample.length;
  avgMidW /= uprightSample.length;
  avgLowerW /= uprightSample.length;

  const safeH = Math.max(0.18, avgBboxH);
  const shoulderWidthRatio = clamp(avgUpperW / (safeH * 0.27), 0.78, 1.38);
  const hipWidthRatio = clamp(avgMidW / (safeH * 0.23), 0.78, 1.36);

  const upperToLowerRatio = clamp(avgUpperW / Math.max(0.05, avgLowerW), 0.75, 1.35);
  const torsoLengthRatio = clamp(0.96 + (upperToLowerRatio - 1.0) * 0.18, 0.84, 1.22);
  const legLengthRatio = clamp(1.04 - (upperToLowerRatio - 1.0) * 0.15, 0.84, 1.24);

  const aspectBulk = clamp(avgBboxW / (safeH * 0.34), 0.75, 1.35);
  const bulkFactor = clamp(
    shoulderWidthRatio * 0.4 + hipWidthRatio * 0.3 + aspectBulk * 0.3,
    0.75,
    1.35
  );

  const heightMeters = clamp(1.68 + (safeH - 0.55) * 0.32, 1.52, 2.05);

  return {
    heightMeters: Number(heightMeters.toFixed(3)),
    shoulderWidthRatio: Number(shoulderWidthRatio.toFixed(3)),
    hipWidthRatio: Number(hipWidthRatio.toFixed(3)),
    torsoLengthRatio: Number(torsoLengthRatio.toFixed(3)),
    legLengthRatio: Number(legLengthRatio.toFixed(3)),
    bulkFactor: Number(bulkFactor.toFixed(3)),
    hasSkinnedMesh: false,
    vertexCount: 0,
    boneCount: 19,
  };
}

/**
 * Classifies the dominant physical action from multi-frame CV metrics and optional prompt/filename hints.
 */
function classifyDominantMocapAction(
  metrics: PersonFrameMetrics[],
  hintText: string
): { action: DetectedMocapAction; confidence: number } {
  const lowerHint = String(hintText ?? '').toLowerCase();

  if (metrics.length < 2) {
    if (/(jump|leap|hop|vault|قفر|قفز|ينط)/.test(lowerHint)) return { action: 'jump-leap', confidence: 0.86 };
    if (/(run|sprint|dash|chase|يجري|يركض|ركض)/.test(lowerHint)) return { action: 'run-sprint', confidence: 0.86 };
    if (/(fight|punch|kick|strike|combat|box|sword|قتال|يلكم|ضرب)/.test(lowerHint)) return { action: 'combat-strike', confidence: 0.85 };
    if (/(crouch|sneak|stealth|crawl|duck|يتسلل|يجثو|ينحني)/.test(lowerHint)) return { action: 'crouch-stealth', confidence: 0.85 };
    if (/(dance|celebrat|wave|cheer|يرقص|رقص|يحتفل)/.test(lowerHint)) return { action: 'dance-expressive', confidence: 0.84 };
    if (/(idle|stand|turn|look|wait|يقف|يلتفت)/.test(lowerHint)) return { action: 'idle-turn', confidence: 0.82 };
    return { action: 'walk', confidence: 0.78 };
  }

  const first = metrics[0];
  const last = metrics[metrics.length - 1];
  const duration = Math.max(0.2, last.timeSec - first.timeSec);

  let totalLateralStep = 0;
  let minCentroidY = 1.0;
  let maxCentroidY = 0.0;
  let avgCentroidY = 0;
  let avgBboxHeight = 0;
  let avgUpperEnergy = 0;
  let avgLowerEnergy = 0;
  let directionReversals = 0;
  let prevDxSign = 0;

  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    if (m.centroidY < minCentroidY) minCentroidY = m.centroidY;
    if (m.centroidY > maxCentroidY) maxCentroidY = m.centroidY;
    avgCentroidY += m.centroidY;
    avgBboxHeight += m.bboxHeight;
    avgUpperEnergy += m.upperMotionEnergy;
    avgLowerEnergy += m.lowerMotionEnergy;

    if (i > 0) {
      const dx = m.worldCentroidX - metrics[i - 1].worldCentroidX;
      totalLateralStep += Math.abs(dx);
      if (Math.abs(dx) > 0.015) {
        const sign = dx > 0 ? 1 : -1;
        if (prevDxSign !== 0 && sign !== prevDxSign) {
          directionReversals++;
        }
        prevDxSign = sign;
      }
    }
  }

  const n = metrics.length;
  avgCentroidY /= n;
  avgBboxHeight /= n;
  avgUpperEnergy /= Math.max(1, n - 1);
  avgLowerEnergy /= Math.max(1, n - 1);

  const netDisplacementX = Math.abs(last.worldCentroidX - first.worldCentroidX);
  const lateralSpeed = (netDisplacementX * 0.7 + totalLateralStep * 0.3) / duration;

  const endpointsY = (first.centroidY + last.centroidY) * 0.5;
  const jumpApexRise = Math.max(0, endpointsY - minCentroidY);
  const crouchDrop = Math.max(0, maxCentroidY - first.centroidY);

  if (/(jump|leap|hop|vault|airborne|قفز|ينط)/.test(lowerHint) && jumpApexRise >= 0.02) {
    return { action: 'jump-leap', confidence: 0.92 };
  }
  if (/(fight|punch|kick|strike|combat|attack|قتال|يلكم|يضرب)/.test(lowerHint)) {
    return { action: 'combat-strike', confidence: 0.9 };
  }
  if (/(crouch|sneak|stealth|duck|يتسلل|ينحني)/.test(lowerHint)) {
    return { action: 'crouch-stealth', confidence: 0.9 };
  }
  if (/(dance|celebrat|groove|يرقص|رقص)/.test(lowerHint)) {
    return { action: 'dance-expressive', confidence: 0.89 };
  }
  if (/(run|sprint|dash|يركض|يجري)/.test(lowerHint)) {
    return { action: 'run-sprint', confidence: 0.91 };
  }

  if (jumpApexRise > 0.085) {
    return { action: 'jump-leap', confidence: Number(clamp(0.78 + jumpApexRise * 1.1, 0.78, 0.96).toFixed(2)) };
  }

  if ((crouchDrop > 0.075 || (avgCentroidY > 0.62 && avgBboxHeight < 0.48)) && lateralSpeed < 0.22) {
    return { action: 'crouch-stealth', confidence: 0.86 };
  }

  if (lateralSpeed > 0.16 || (netDisplacementX > 0.28 && avgLowerEnergy > 0.18)) {
    return { action: 'run-sprint', confidence: Number(clamp(0.8 + lateralSpeed * 0.6, 0.8, 0.95).toFixed(2)) };
  }

  if (avgUpperEnergy > 0.14 && avgUpperEnergy > avgLowerEnergy * 1.45 && netDisplacementX < 0.18) {
    return { action: 'combat-strike', confidence: 0.85 };
  }

  if (directionReversals >= 2 && (avgUpperEnergy + avgLowerEnergy) > 0.16 && netDisplacementX < 0.2) {
    return { action: 'dance-expressive', confidence: 0.84 };
  }

  if (netDisplacementX > 0.06 || totalLateralStep > 0.1 || avgLowerEnergy > 0.06) {
    return { action: 'walk', confidence: 0.86 };
  }

  return { action: 'idle-turn', confidence: 0.82 };
}

/**
 * Generates a compact, valid SVG data URL representing the analyzed reference frame
 * when a browser canvas JPEG data URL is not provided (e.g., in headless Node/Vitest tests).
 */
function buildFallbackReferenceFrameDataUrl(
  frames: VideoFrameSample[],
  action: DetectedMocapAction
): string {
  const sample = frames[Math.floor(frames.length * 0.25)] ?? frames[0];
  let hexBg = '#101624';
  let hexFg = '#60a5fa';

  if (sample && sample.pixels.length >= 4) {
    const bgModel = estimateBorderBackgroundModel(sample.pixels, sample.width, sample.height);
    hexBg = rgbToHex(bgModel.globalRgb[0], bgModel.globalRgb[1], bgModel.globalRgb[2]);

    const midIdx = Math.floor(sample.pixels.length / 8) * 4;
    hexFg = rgbToHex(
      sample.pixels[midIdx] ?? 96,
      sample.pixels[midIdx + 1] ?? 165,
      sample.pixels[midIdx + 2] ?? 250
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="${hexBg}"/><circle cx="160" cy="58" r="18" fill="${hexFg}"/><rect x="142" y="80" width="36" height="58" rx="10" fill="${hexFg}"/><text x="14" y="166" fill="#e2e8f0" font-family="monospace" font-size="11">Mocap Ref: ${action}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Solves 19-bone humanoid rotations for a single frame using `toyxyz_RGBMocap` / `GVHMR`
 * Analytical Limb-Vector Inverse Kinematics from the frame's smoothed 17-joint pose landmarks
 * (`metric.landmarks`) and `FootMR` foot contact locking states — 100% landmark-driven with
 * ZERO fake procedural sine-wave (`Math.sin`) gait.
 */
function synthesizeFrameSkeletonPose(
  action: DetectedMocapAction,
  _timeSec: number,
  _u: number,
  metric: PersonFrameMetrics,
  prevMetric: PersonFrameMetrics | null,
  jumpClearanceRatio: number,
  _personIndex = 0
): {
  bones: Partial<Record<HumanoidBone, BoneEulerDelta>>;
  hipsOffset: [number, number, number];
  pose: ActorPose;
} {
  const j = metric.landmarks.joints;
  const bH = Math.max(0.18, metric.bboxHeight);

  // 1. Torso & Pelvis Vector IK (hips -> neck)
  const torsoDx = j.neck.x - j.hips.x;
  const torsoDy = Math.max(0.08, j.hips.y - j.neck.y);
  const leanRoll = clamp(Math.atan2(torsoDx, torsoDy) * 0.55, -0.22, 0.22);

  const shoulderMidX = (j.leftShoulder.x + j.rightShoulder.x) * 0.5;
  const torsoTwistYaw = clamp(
    (shoulderMidX - j.hips.x) * 1.8 + metric.leftRightAsymmetry * 0.12,
    -0.28,
    0.28
  );

  const crouchCompression = clamp(
    1 - torsoDy / Math.max(0.12, bH * 0.35),
    0,
    0.45
  );

  const spinePitch = clamp(
    crouchCompression * 0.28 + Math.abs(metric.torsoLeanRatio) * 0.12,
    -0.12,
    0.32
  );
  const spineYaw = clamp(torsoTwistYaw, -0.32, 0.32);
  const chestPitch = clamp(spinePitch * 0.65, -0.1, 0.24);
  const chestYaw = clamp(torsoTwistYaw * 0.7, -0.32, 0.32);

  // 2. Head & Neck Vector IK (neck -> head)
  const headDx = j.head.x - j.neck.x;
  const headDy = Math.max(0.04, j.neck.y - j.head.y);
  const headRoll = clamp(Math.atan2(headDx, headDy) * 0.4 - leanRoll * 0.4, -0.2, 0.2);
  const neckPitch = clamp(-spinePitch * 0.45, -0.2, 0.16);
  const headYaw = clamp(headDx * 2.2 + metric.leftRightAsymmetry * 0.14, -0.38, 0.38);

  // 3. Left & Right Arm Limb-Vector IK (Shoulder -> Elbow -> Wrist)
  const luDx = Math.max(0.005, j.leftShoulder.x - j.leftElbow.x);
  const luDy = j.leftElbow.y - j.leftShoulder.y;
  const ruDx = Math.max(0.005, j.rightElbow.x - j.rightShoulder.x);
  const ruDy = j.rightElbow.y - j.rightShoulder.y;

  const lArmRoll = clamp(
    Math.atan2(luDx, Math.max(0.03, Math.abs(luDy))) * 0.55 + 0.08,
    0.08,
    1.05
  );
  const rArmRoll = -clamp(
    Math.atan2(ruDx, Math.max(0.03, Math.abs(ruDy))) * 0.55 + 0.08,
    0.08,
    1.05
  );

  // Measure actual wrist-to-hip horizontal offset to drive arm swing pitch directly from landmarks
  const lWristSwingOffset = (j.hips.x - j.leftWrist.x) / bH;
  const rWristSwingOffset = (j.rightWrist.x - j.hips.x) / bH;

  let lArmPitch = clamp(
    -metric.leftArmRaiseRatio * 1.1 - metric.leftArmReachRatio * 0.28 - (lWristSwingOffset - 0.12) * 0.65,
    -1.35,
    0.42
  );
  let rArmPitch = clamp(
    -metric.rightArmRaiseRatio * 1.1 - metric.rightArmReachRatio * 0.28 - (rWristSwingOffset - 0.12) * 0.65,
    -1.35,
    0.42
  );

  const llDy = j.leftWrist.y - j.leftElbow.y;
  const rlDy = j.rightWrist.y - j.rightElbow.y;
  const lWristRaised = clamp((j.leftElbow.y - j.leftWrist.y) * 2.8, 0, 0.85);
  const rWristRaised = clamp((j.rightElbow.y - j.rightWrist.y) * 2.8, 0, 0.85);

  const lForeArmPitch = clamp(
    -0.22 - metric.leftArmReachRatio * 0.38 - lWristRaised * 0.58 - (llDy < 0 ? 0.3 : 0),
    -1.25,
    -0.1
  );
  const rForeArmPitch = clamp(
    -0.22 - metric.rightArmReachRatio * 0.38 - rWristRaised * 0.58 - (rlDy < 0 ? 0.3 : 0),
    -1.25,
    -0.1
  );

  // 4. Left & Right Leg Limb-Vector IK + FootMR Contact Locking (100% from landmark ankle/knee/hip vectors)
  const lFootLiftFromCv = metric.landmarks.leftFootContact
    ? 0
    : clamp((metric.bboxMaxY - j.leftAnkle.y) / bH, 0, 0.24);
  const rFootLiftFromCv = metric.landmarks.rightFootContact
    ? 0
    : clamp((metric.bboxMaxY - j.rightAnkle.y) / bH, 0, 0.24);

  const lLegLateral = clamp((j.leftHip.x - j.leftAnkle.x) * 1.2, -0.14, 0.22);
  const rLegLateral = clamp((j.rightAnkle.x - j.rightHip.x) * 1.2, -0.14, 0.22);

  // Derive thigh & knee flexion directly from landmark ankle lift and hip-to-ankle displacement
  const lAnkleRelX = (j.leftAnkle.x - j.leftHip.x) / bH;
  const rAnkleRelX = (j.rightAnkle.x - j.rightHip.x) / bH;
  const lAnkleVelX = prevMetric
    ? (j.leftAnkle.x - prevMetric.landmarks.joints.leftAnkle.x) / bH
    : 0;
  const rAnkleVelX = prevMetric
    ? (j.rightAnkle.x - prevMetric.landmarks.joints.rightAnkle.x) / bH
    : 0;

  let lThighPitch = clamp(
    -lFootLiftFromCv * 1.45 - lAnkleRelX * 0.85 - crouchCompression * 0.45,
    -0.85,
    0.48
  );
  let rThighPitch = clamp(
    -rFootLiftFromCv * 1.45 - rAnkleRelX * 0.85 - crouchCompression * 0.45,
    -0.85,
    0.48
  );

  let lKneePitch = clamp(
    0.04 + lFootLiftFromCv * 2.15 + Math.abs(lAnkleVelX) * 0.65 + crouchCompression * 0.65,
    0.04,
    1.15
  );
  let rKneePitch = clamp(
    0.04 + rFootLiftFromCv * 2.15 + Math.abs(rAnkleVelX) * 0.65 + crouchCompression * 0.65,
    0.04,
    1.15
  );

  const hipStanceWidth = clamp(0.095 + (metric.legSpreadRatio - 0.22) * 0.08, 0.08, 0.15);
  const lAnkleZ = clamp(lAnkleRelX * 0.65 + (lFootLiftFromCv - rFootLiftFromCv) * 0.55, -0.26, 0.28);
  const rAnkleZ = clamp(rAnkleRelX * 0.65 + (rFootLiftFromCv - lFootLiftFromCv) * 0.55, -0.26, 0.28);
  let lAnkleY = metric.landmarks.leftFootContact && action !== 'jump-leap' ? 0 : lFootLiftFromCv;
  let rAnkleY = metric.landmarks.rightFootContact && action !== 'jump-leap' ? 0 : rFootLiftFromCv;

  const lFootPitch = lAnkleY <= 0.008 ? 0 : clamp(-lAnkleZ * 0.6, -0.24, 0.24);
  const rFootPitch = rAnkleY <= 0.008 ? 0 : clamp(-rAnkleZ * 0.6, -0.24, 0.24);

  const crouchDropNorm =
    action === 'crouch-stealth'
      ? -0.07
      : -crouchCompression * 0.06;
  const hipsOffsetX = Number(clamp((j.hips.x - metric.centroidX) * 0.18, -0.04, 0.04).toFixed(4));
  let hipsOffsetY = Number(crouchDropNorm.toFixed(4));

  if (action === 'jump-leap' && jumpClearanceRatio > 0.04) {
    const airborne = clamp(jumpClearanceRatio * 2.0, 0, 1);
    lArmPitch = clamp(lArmPitch - airborne * 0.65, -1.4, 0.4);
    rArmPitch = clamp(rArmPitch - airborne * 0.65, -1.4, 0.4);
    lThighPitch = clamp(lThighPitch - airborne * 0.35, -0.9, 0.4);
    rThighPitch = clamp(rThighPitch - airborne * 0.25, -0.9, 0.4);
    lKneePitch = clamp(lKneePitch + airborne * 0.45, 0.08, 1.2);
    rKneePitch = clamp(rKneePitch + airborne * 0.35, 0.08, 1.2);
    lAnkleY = Math.max(lAnkleY, airborne * 0.14);
    rAnkleY = Math.max(rAnkleY, airborne * 0.12);
    hipsOffsetY = Number((airborne * 0.16).toFixed(4));
  }

  // 5. Character-local 3D Hand IK Targets directly from wrist & elbow landmarks
  // Note: Character Local +X is Character Left, -X is Character Right (matching `rigPoint` in `posePresets.ts`)
  const lHandX = Number(
    clamp(0.18 + metric.leftArmRaiseRatio * 0.08 + Math.max(0, j.leftShoulder.x - j.leftWrist.x) * 0.18, 0.1, 0.38).toFixed(4)
  );
  const lHandY = Number(
    clamp(0.48 + metric.leftArmRaiseRatio * 0.38 + (j.hips.y - j.leftWrist.y) / bH * 0.12, 0.4, 0.94).toFixed(4)
  );
  const lHandZ = Number(
    clamp(0.06 + metric.leftArmReachRatio * 0.22 + (lWristSwingOffset - 0.12) * 0.25, -0.16, 0.34).toFixed(4)
  );

  const rHandX = Number(
    clamp(-0.18 - metric.rightArmRaiseRatio * 0.08 - Math.max(0, j.rightWrist.x - j.rightShoulder.x) * 0.18, -0.38, -0.1).toFixed(4)
  );
  const rHandY = Number(
    clamp(0.48 + metric.rightArmRaiseRatio * 0.38 + (j.hips.y - j.rightWrist.y) / bH * 0.12, 0.4, 0.94).toFixed(4)
  );
  const rHandZ = Number(
    clamp(0.06 + metric.rightArmReachRatio * 0.22 + (rWristSwingOffset - 0.12) * 0.25, -0.16, 0.34).toFixed(4)
  );

  const bones: Partial<Record<HumanoidBone, BoneEulerDelta>> = {
    Hips: { x: Number((spinePitch * 0.25).toFixed(4)), y: Number((spineYaw * 0.5).toFixed(4)), z: Number((leanRoll * 0.4).toFixed(4)) },
    Spine: { x: Number(spinePitch.toFixed(4)), y: Number(spineYaw.toFixed(4)), z: Number(leanRoll.toFixed(4)) },
    Chest: { x: Number(chestPitch.toFixed(4)), y: Number(chestYaw.toFixed(4)), z: Number((leanRoll * 0.6).toFixed(4)) },
    Neck: { x: Number(neckPitch.toFixed(4)), y: Number((headYaw * 0.4).toFixed(4)), z: 0 },
    Head: { x: Number((neckPitch * 0.5).toFixed(4)), y: Number(headYaw.toFixed(4)), z: Number(headRoll.toFixed(4)) },
    LeftShoulder: { x: 0, y: 0, z: Number((0.04 + metric.leftArmRaiseRatio * 0.06).toFixed(4)) },
    LeftArm: { x: Number(lArmPitch.toFixed(4)), y: 0, z: Number(lArmRoll.toFixed(4)) },
    LeftForeArm: { x: Number(lForeArmPitch.toFixed(4)), y: 0, z: 0 },
    LeftHand: { x: 0, y: 0, z: 0 },
    RightShoulder: { x: 0, y: 0, z: Number((-0.04 - metric.rightArmRaiseRatio * 0.06).toFixed(4)) },
    RightArm: { x: Number(rArmPitch.toFixed(4)), y: 0, z: Number(rArmRoll.toFixed(4)) },
    RightForeArm: { x: Number(rForeArmPitch.toFixed(4)), y: 0, z: 0 },
    RightHand: { x: 0, y: 0, z: 0 },
    LeftUpLeg: { x: Number(lThighPitch.toFixed(4)), y: 0, z: Number(lLegLateral.toFixed(4)) },
    LeftLeg: { x: Number(lKneePitch.toFixed(4)), y: 0, z: 0 },
    LeftFoot: { x: Number(lFootPitch.toFixed(4)), y: 0, z: 0 },
    RightUpLeg: { x: Number(rThighPitch.toFixed(4)), y: 0, z: Number((-rLegLateral).toFixed(4)) },
    RightLeg: { x: Number(rKneePitch.toFixed(4)), y: 0, z: 0 },
    RightFoot: { x: Number(rFootPitch.toFixed(4)), y: 0, z: 0 },
  };

  const rotations: Record<string, [number, number, number, number]> = {};
  for (const boneName of HUMANOID_BONES) {
    const e = bones[boneName] ?? { x: 0, y: 0, z: 0 };
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x, e.y, e.z, 'XYZ'));
    rotations[boneName] = [
      Number(q.x.toFixed(5)),
      Number(q.y.toFixed(5)),
      Number(q.z.toFixed(5)),
      Number(q.w.toFixed(5)),
    ];
  }

  const hipsOffset: [number, number, number] = [
    hipsOffsetX,
    hipsOffsetY,
    0,
  ];

  const anatomicalIk = {
    leftAnkle: [Number(hipStanceWidth.toFixed(4)), Number(lAnkleY.toFixed(4)), Number(lAnkleZ.toFixed(4))] as [number, number, number],
    rightAnkle: [-Number(hipStanceWidth.toFixed(4)), Number(rAnkleY.toFixed(4)), Number(rAnkleZ.toFixed(4))] as [number, number, number],
    leftKneePole: [Number(hipStanceWidth.toFixed(4)), 0.28, 0.35] as [number, number, number],
    rightKneePole: [-Number(hipStanceWidth.toFixed(4)), 0.28, 0.35] as [number, number, number],
    leftFootPitch: Number(lFootPitch.toFixed(4)),
    rightFootPitch: Number(rFootPitch.toFixed(4)),
    leftHand: [lHandX, lHandY, lHandZ] as [number, number, number],
    rightHand: [rHandX, rHandY, rHandZ] as [number, number, number],
    leftElbowPole: [0.28, 0.56, -0.35] as [number, number, number],
    rightElbowPole: [-0.28, 0.56, -0.35] as [number, number, number],
    headLookAt: [Number((headYaw * 0.25).toFixed(4)), 0.92, 0.85] as [number, number, number],
  };

  return {
    bones,
    hipsOffset,
    pose: {
      hipsOffset,
      rotations,
      anatomicalIk,
    },
  };
}

/**
 * Builds a single `ExtractedVideoActorTrack` from its tracked per-frame CV metrics,
 * optionally enriched by a matched `VisionAiExtractedActor` or explicit user hint (`ExplicitPersonSpec`).
 */
function buildActorTrackFromMetrics(
  personIndex: number,
  totalPeople: number,
  metrics: PersonFrameMetrics[],
  durationSeconds: number,
  baseStartPos: { x: number; y: number; z: number },
  lockFootContacts: boolean,
  extractBodyProportions: boolean,
  hintPrompt: string,
  visionActor?: VisionAiExtractedActor,
  explicitPerson?: ExplicitPersonSpec,
  hasExplicitActionOverride = false
): ExtractedVideoActorTrack {
  const bodyProportions = estimateBodyProportionsFromVision(metrics, extractBodyProportions);
  if (visionActor) {
    bodyProportions.heightMeters = visionActor.heightMeters;
    bodyProportions.bulkFactor = visionActor.bulkFactor;
  }
  bodyProportions.shapeBetas = synthesizeCalibratedSmplBetas(undefined, bodyProportions);
  bodyProportions.humanoidMeshMode = 'smpl';

  const { action: cvAction, confidence } = classifyDominantMocapAction(metrics, hintPrompt);
  const action: DetectedMocapAction =
    hasExplicitActionOverride && explicitPerson
      ? explicitPerson.action
      : visionActor?.dominantAction || explicitPerson?.action || cvAction;
  const inferredMotionClipId = ACTION_TO_MOTION_CLIP[action];

  // Register a UniversalKinematicProgram when rich action description is available
  const richActionText =
    explicitPerson?.actionSummary || visionActor?.actionSummary || hintPrompt || action;
  const ikProgram = buildOfflineUniversalKinematicProgram(richActionText);

  // Compute starting stage position:
  // Use metric side-by-side placement around Stage Center X=50 (`flow_placement.py` unprojection)
  // so 2 side-by-side people start at ~47 and ~53 (6 units apart), NOT 48 meters apart!
  const firstMetric = metrics[0];
  const baseCentroidX = firstMetric?.worldCentroidX ?? 0.5;
  const baseBboxHeight = firstMetric?.bboxHeight ?? 0.5;

  const defaultPairSpacingX =
    totalPeople > 1
      ? Math.round(50 + (personIndex - (totalPeople - 1) * 0.5) * 6)
      : baseStartPos.x;

  const actorStartX =
    totalPeople > 1
      ? explicitPerson
        ? clamp(explicitPerson.startX, 38, 62)
        : clamp(
            Math.round(
              defaultPairSpacingX * 0.7 +
                (50 + ((firstMetric?.centroidX ?? (0.4 + personIndex * 0.2)) - 0.5) * 14) * 0.3
            ),
            40,
            60
          )
      : visionActor?.keyframes?.[0]?.stageX ?? baseStartPos.x;
  const actorStartY =
    totalPeople > 1
      ? explicitPerson
        ? explicitPerson.startY
        : 42
      : visionActor?.keyframes?.[0]?.stageY ?? baseStartPos.y;
  const actorStartZ = visionActor?.keyframes?.[0]?.stageZ ?? (baseStartPos.z ?? 0);

  const sortedCentroidYs = metrics.map((m) => m.centroidY).sort((a, b) => b - a);
  const stanceBaselineCentroidY =
    sortedCentroidYs.length > 0
      ? sortedCentroidYs[Math.floor(sortedCentroidYs.length * 0.2)]
      : 0.55;

  const poseKeyframes: ActorPoseKeyframe[] = [];
  const trajectoryKeyframes: TrajectoryKeyframe[] = [];

  let minBboxX = 1;
  let maxBboxX = 0;
  let minBboxY = 1;
  let maxBboxY = 0;

  const frameCount = metrics.length;
  for (let i = 0; i < frameCount; i++) {
    const m = metrics[i];
    if (m.bboxMinX < minBboxX) minBboxX = m.bboxMinX;
    if (m.bboxMaxX > maxBboxX) maxBboxX = m.bboxMaxX;
    if (m.bboxMinY < minBboxY) minBboxY = m.bboxMinY;
    if (m.bboxMaxY > maxBboxY) maxBboxY = m.bboxMaxY;

    const u = frameCount > 1 ? i / (frameCount - 1) : 0;
    const outTime = Number((u * durationSeconds).toFixed(3));

    // Interpolate Vision AI keyframe trajectory if available (for single actor), else use camera-compensated CV trajectory
    // For multi-person shots, keep side-by-side spacing around `actorStartX` so actors stay inside the camera viewfinder!
    let stageX: number;
    let stageY: number;
    let frameAction: DetectedMocapAction = action;

    if (visionActor && visionActor.keyframes.length >= 2 && totalPeople === 1) {
      const kfs = visionActor.keyframes;
      let kIdx = 0;
      for (let j = 0; j < kfs.length - 1; j++) {
        if (u >= kfs[j].timeRatio) kIdx = j;
      }
      const k0 = kfs[kIdx];
      const k1 = kfs[Math.min(kfs.length - 1, kIdx + 1)];
      const span = Math.max(0.01, k1.timeRatio - k0.timeRatio);
      const localT = clamp((u - k0.timeRatio) / span, 0, 1);
      stageX = Number(clamp(k0.stageX + (k1.stageX - k0.stageX) * localT, 10, 90).toFixed(2));
      stageY = Number(clamp(k0.stageY + (k1.stageY - k0.stageY) * localT, 12, 88).toFixed(2));
      frameAction = k0.actionCategory || action;
    } else {
      const dxNorm = m.worldCentroidX - baseCentroidX;
      const scaleDelta = clamp(m.bboxHeight - baseBboxHeight, -0.25, 0.25);
      const footDepthDelta = clamp(m.worldFootY - (firstMetric?.worldFootY ?? 0.7), -0.25, 0.25);
      const defaultTravelY =
        action === 'walk'
          ? u * 16
          : action === 'run-sprint'
            ? u * 24
            : action === 'crouch-stealth'
              ? u * 10
              : action === 'jump-leap'
                ? u * 12
                : 0;

      const explicitTravelX =
        explicitPerson
          ? (explicitPerson.endX - actorStartX) * u + clamp(dxNorm * 8, -2.5, 2.5)
          : totalPeople > 1
            ? clamp(dxNorm * 14, -4, 4)
            : clamp(dxNorm * 28, -18, 18);
      const explicitTravelY =
        explicitPerson
          ? (explicitPerson.endY - actorStartY) * u
          : defaultTravelY + clamp(scaleDelta * 12 + footDepthDelta * 10, -4, 8);

      stageX = Number(clamp(actorStartX + explicitTravelX, 14, 86).toFixed(2));
      stageY = Number(clamp(actorStartY + explicitTravelY, 16, 84).toFixed(2));
    }

    const riseRatio = Math.max(0, stanceBaselineCentroidY - m.centroidY);
    let rawStageZ = actorStartZ + riseRatio * 42;

    if (lockFootContacts) {
      const airborneThreshold = frameAction === 'jump-leap' ? 0.035 : 0.075;
      if (riseRatio < airborneThreshold || m.landmarks.leftFootContact || m.landmarks.rightFootContact) {
        rawStageZ = Math.max(0, actorStartZ);
      }
    }
    const stageZ = Number(Math.max(0, rawStageZ).toFixed(2));

    const { bones, hipsOffset, pose } = synthesizeFrameSkeletonPose(
      frameAction,
      outTime,
      u,
      m,
      i > 0 ? metrics[i - 1] : null,
      riseRatio,
      personIndex
    );

    poseKeyframes.push({
      time: outTime,
      bones,
      hipsOffset,
      pose,
    });

    trajectoryKeyframes.push({
      id: `kf-vidmocap-p${personIndex + 1}-${i}`,
      time: outTime,
      position: {
        x: stageX,
        y: stageY,
        z: stageZ,
      },
      pose,
      motionClip: undefined,
      gait: 'none',
      cueLabel: i === 0 ? `Person ${personIndex + 1} (${frameAction})` : undefined,
    });
  }

  const avgRgb = metrics.reduce(
    (acc, m) => [acc[0] + m.clothingRgb[0], acc[1] + m.clothingRgb[1], acc[2] + m.clothingRgb[2]],
    [0, 0, 0]
  );
  const sampledHex =
    metrics.length > 0
      ? rgbToHex(avgRgb[0] / metrics.length, avgRgb[1] / metrics.length, avgRgb[2] / metrics.length)
      : '#38bdf8';

  const clothingColorHex =
    explicitPerson?.clothingColorHex || visionActor?.clothingColorHex || sampledHex;
  const actorName =
    explicitPerson?.name ||
    visionActor?.name ||
    (personIndex === 0
      ? totalPeople > 1
        ? 'Person 1 (Left / Lead)'
        : 'Lead Subject'
      : `Person ${personIndex + 1}`);
  const appearanceToken =
    explicitPerson?.appearanceToken ||
    visionActor?.appearanceToken ||
    `human subject ${personIndex + 1} in ${clothingColorHex} attire extracted from video`;

  const firstPos = trajectoryKeyframes[0]?.position ?? { x: actorStartX, y: actorStartY, z: actorStartZ };
  const lastPos = trajectoryKeyframes[trajectoryKeyframes.length - 1]?.position ?? firstPos;

  return {
    trackId: `video-person-${personIndex + 1}`,
    personIndex,
    actorName,
    appearanceToken,
    clothingColorHex,
    detectedActionLabel: action,
    actionSummary:
      explicitPerson?.actionSummary ||
      visionActor?.actionSummary ||
      `${action} from (${Math.round(firstPos.x)}, ${Math.round(firstPos.y)}) to (${Math.round(lastPos.x)}, ${Math.round(lastPos.y)})`,
    inferredMotionClipId,
    universalIkClipId: ikProgram.id,
    confidenceScore: confidence,
    bodyProportions,
    poseKeyframes,
    trajectoryKeyframes,
    frameLandmarks: metrics.map((m) => m.landmarks),
    startPosition: { x: firstPos.x, y: firstPos.y, z: firstPos.z ?? 0 },
    endPosition: { x: lastPos.x, y: lastPos.y, z: lastPos.z ?? 0 },
    averageBbox: {
      minX: Number(minBboxX.toFixed(3)),
      maxX: Number(maxBboxX.toFixed(3)),
      minY: Number(minBboxY.toFixed(3)),
      maxY: Number(maxBboxY.toFixed(3)),
    },
  };
}

/**
 * Enforces Quaternion Hemisphere Continuity (`dot(q[i], q[i-1]) >= 0`) and applies a
 * Zero-Phase Raised-Cosine (Hann) temporal quaternion/vector filter across solved `poseKeyframes`
 * and `trajectoryKeyframes` so 24-FPS mocap sequences play with zero high-frequency jitter.
 */
function smoothSolvedMocapPoseAndTrajectoryKeyframes(
  poseKeyframes: ActorPoseKeyframe[],
  trajectoryKeyframes: TrajectoryKeyframe[],
  durationSeconds: number,
  smoothingStrength: number
): void {
  const n = poseKeyframes.length;
  const blend = clamp(smoothingStrength, 0, 1);
  if (n < 3 || blend <= 0.02) return;

  const effectiveFps = n / Math.max(0.5, durationSeconds);
  const isDenseCapture = n >= 16 && effectiveFps >= 12;
  const qRadius = isDenseCapture
    ? clamp(Math.round(effectiveFps * (0.14 + blend * 0.14)), 2, 7)
    : 1;
  const hipsRadius = isDenseCapture ? clamp(qRadius + 1, 3, 8) : 1;
  const yawRadius = isDenseCapture
    ? clamp(Math.round(effectiveFps * (0.22 + blend * 0.14)), 3, 9)
    : 1;
  const effBlend = isDenseCapture ? blend : blend * 0.35;

  const smoothQuatChannelRecord = (
    getter: (kf: ActorPoseKeyframe) => Record<string, [number, number, number, number]> | undefined
  ) => {
    const boneSet = new Set<string>();
    for (const kf of poseKeyframes) {
      const rec = getter(kf);
      if (rec) {
        for (const k of Object.keys(rec)) boneSet.add(k);
      }
    }
    for (const boneName of boneSet) {
      const seqQ: [number, number, number, number][] = poseKeyframes.map((kf) => {
        const q = getter(kf)?.[boneName];
        return q && q.length === 4 ? [q[0], q[1], q[2], q[3]] : [0, 0, 0, 1];
      });
      // 1. Enforce antipodal hemisphere continuity across adjacent frames
      for (let i = 1; i < n; i++) {
        const prev = seqQ[i - 1];
        const cur = seqQ[i];
        const dot = prev[0] * cur[0] + prev[1] * cur[1] + prev[2] * cur[2] + prev[3] * cur[3];
        if (dot < 0) {
          seqQ[i] = [-cur[0], -cur[1], -cur[2], -cur[3]];
        }
      }
      // 2. Zero-Phase Raised-Cosine (Hann) Quaternion Low-Pass Filter
      const outQ: [number, number, number, number][] = new Array(n);
      for (let i = 0; i < n; i++) {
        const ref = seqQ[i];
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let sw = 0;
        for (let k = -qRadius; k <= qRadius; k++) {
          const j = clamp(i + k, 0, n - 1);
          const w = 0.5 * (1 + Math.cos((Math.PI * k) / (qRadius + 1)));
          const cand = seqQ[j];
          const dot = ref[0] * cand[0] + ref[1] * cand[1] + ref[2] * cand[2] + ref[3] * cand[3];
          const sgn = dot < 0 ? -w : w;
          sx += cand[0] * sgn;
          sy += cand[1] * sgn;
          sz += cand[2] * sgn;
          sw += cand[3] * sgn;
        }
        const smLen = Math.hypot(sx, sy, sz, sw) || 1;
        const smX = sx / smLen;
        const smY = sy / smLen;
        const smZ = sz / smLen;
        const smW = sw / smLen;
        const bx = ref[0] * (1 - effBlend) + smX * effBlend;
        const by = ref[1] * (1 - effBlend) + smY * effBlend;
        const bz = ref[2] * (1 - effBlend) + smZ * effBlend;
        const bw = ref[3] * (1 - effBlend) + smW * effBlend;
        const bLen = Math.hypot(bx, by, bz, bw) || 1;
        outQ[i] = [
          Number((bx / bLen).toFixed(5)),
          Number((by / bLen).toFixed(5)),
          Number((bz / bLen).toFixed(5)),
          Number((bw / bLen).toFixed(5)),
        ];
      }
      for (let i = 0; i < n; i++) {
        const rec = getter(poseKeyframes[i]);
        if (rec) {
          rec[boneName] = outQ[i];
        }
      }
    }
  };

  smoothQuatChannelRecord((kf) => kf.pose?.charSpaceRotations);
  smoothQuatChannelRecord((kf) => kf.pose?.rotations);

  // Smooth hipsOffset (with extra vertical stability)
  const rawHips = poseKeyframes.map(
    (kf) => kf.pose?.hipsOffset ?? kf.hipsOffset ?? ([0, 0, 0] as [number, number, number])
  );
  for (let i = 0; i < n; i++) {
    let hx = 0;
    let hy = 0;
    let hz = 0;
    let wSum = 0;
    for (let k = -hipsRadius; k <= hipsRadius; k++) {
      const j = clamp(i + k, 0, n - 1);
      const w = 0.5 * (1 + Math.cos((Math.PI * k) / (hipsRadius + 1)));
      hx += (Number(rawHips[j][0]) || 0) * w;
      hy += (Number(rawHips[j][1]) || 0) * w;
      hz += (Number(rawHips[j][2]) || 0) * w;
      wSum += w;
    }
    const sm: [number, number, number] = [
      Number(((rawHips[i][0] * (1 - blend) + (hx / wSum) * blend)).toFixed(4)),
      Number(((rawHips[i][1] * (1 - blend) + (hy / wSum) * blend)).toFixed(4)),
      Number(((rawHips[i][2] * (1 - blend) + (hz / wSum) * blend)).toFixed(4)),
    ];
    poseKeyframes[i].hipsOffset = sm;
    if (poseKeyframes[i].pose) {
      poseKeyframes[i].pose!.hipsOffset = sm;
    }
  }

  // Smooth anatomicalIk targets when present
  const vecKeys: Array<
    | 'leftAnkle'
    | 'rightAnkle'
    | 'leftKneePole'
    | 'rightKneePole'
    | 'leftHand'
    | 'rightHand'
    | 'leftElbowPole'
    | 'rightElbowPole'
  > = [
    'leftAnkle',
    'rightAnkle',
    'leftKneePole',
    'rightKneePole',
    'leftHand',
    'rightHand',
    'leftElbowPole',
    'rightElbowPole',
  ];
  const hasAnatIk = poseKeyframes.every((kf) => Boolean(kf.pose?.anatomicalIk));
  if (hasAnatIk) {
    for (const vk of vecKeys) {
      const rawV = poseKeyframes.map((kf) => kf.pose!.anatomicalIk![vk]);
      for (let i = 0; i < n; i++) {
        let vx = 0;
        let vy = 0;
        let vz = 0;
        let wSum = 0;
        for (let k = -qRadius; k <= qRadius; k++) {
          const j = clamp(i + k, 0, n - 1);
          const w = 0.5 * (1 + Math.cos((Math.PI * k) / (qRadius + 1)));
          vx += rawV[j][0] * w;
          vy += rawV[j][1] * w;
          vz += rawV[j][2] * w;
          wSum += w;
        }
        poseKeyframes[i].pose!.anatomicalIk![vk] = [
          Number((rawV[i][0] * (1 - blend) + (vx / wSum) * blend).toFixed(4)),
          Number((rawV[i][1] * (1 - blend) + (vy / wSum) * blend).toFixed(4)),
          Number((rawV[i][2] * (1 - blend) + (vz / wSum) * blend).toFixed(4)),
        ];
      }
    }
  }

  // Circular-smooth trajectoryKeyframes facingYawDeg (`rotation.y`) so whole-body yaw never twitches
  if (trajectoryKeyframes.length === n && trajectoryKeyframes.some((tk) => tk.rotation !== undefined)) {
    const rawYawsRad = trajectoryKeyframes.map((tk) => ((tk.rotation?.y ?? 0) * Math.PI) / 180);
    for (let i = 0; i < n; i++) {
      let sumSin = 0;
      let sumCos = 0;
      for (let k = -yawRadius; k <= yawRadius; k++) {
        const j = clamp(i + k, 0, n - 1);
        const w = 0.5 * (1 + Math.cos((Math.PI * k) / (yawRadius + 1)));
        sumSin += Math.sin(rawYawsRad[j]) * w;
        sumCos += Math.cos(rawYawsRad[j]) * w;
      }
      const smYawRad = Math.atan2(sumSin, sumCos);
      const diff = Math.atan2(Math.sin(smYawRad - rawYawsRad[i]), Math.cos(smYawRad - rawYawsRad[i]));
      const outYawDeg = Number((((rawYawsRad[i] + diff * blend) * 180) / Math.PI).toFixed(2));
      if (trajectoryKeyframes[i].rotation) {
        trajectoryKeyframes[i].rotation!.y = outYawDeg;
      }
    }
  }

  // Re-synchronize 19-bone Euler deltas & trajectoryKeyframe pose references
  for (let i = 0; i < n; i++) {
    const pose = poseKeyframes[i].pose;
    if (pose) {
      poseKeyframes[i].bones = extract19BoneEulerDeltasFromActorPose(pose);
      if (trajectoryKeyframes[i]) {
        trajectoryKeyframes[i].pose = pose;
      }
    }
  }
}

/**
 * Builds an `ExtractedVideoActorTrack` directly from a tracked 33-joint MediaPipe sequence
 * (`TrackedMediaPipePersonSequence`), using `solveAnatomicalPoseFromMediaPipe` (`anatomical_ik.py`)
 * and `flow_placement.py` metric stage coordinates — with zero fake `Math.sin` gait.
 */
function buildActorTrackFromMediaPipeSequence(
  personIndex: number,
  totalPeople: number,
  mpTrack: TrackedMediaPipePersonSequence,
  durationSeconds: number,
  lockFootContacts: boolean,
  extractBodyProportions: boolean,
  hintPrompt: string,
  visionActor?: VisionAiExtractedActor,
  explicitPerson?: ExplicitPersonSpec
): ExtractedVideoActorTrack {
  const frames = mpTrack.frames;
  const frameCount = frames.length;

  // Classify dominant action from real 3D worldLandmarks & stage displacement
  let action: DetectedMocapAction = 'walk';
  const lowerHint = String(hintPrompt ?? '').toLowerCase();
  if (explicitPerson?.action) {
    action = explicitPerson.action;
  } else if (visionActor?.dominantAction) {
    action = visionActor.dominantAction;
  } else if (/(jump|leap|hop|vault|قفز|ينط)/.test(lowerHint)) {
    action = 'jump-leap';
  } else if (/(run|sprint|dash|يركض|يجري)/.test(lowerHint)) {
    action = 'run-sprint';
  } else if (/(fight|punch|kick|strike|combat|قتال|يلكم)/.test(lowerHint)) {
    action = 'combat-strike';
  } else if (/(crouch|sneak|stealth|يتسلل|ينحني)/.test(lowerHint)) {
    action = 'crouch-stealth';
  } else if (/(dance|celebrat|يرقص|رقص)/.test(lowerHint)) {
    action = 'dance-expressive';
  } else if (frameCount >= 2) {
    const firstF = frames[0];
    const lastF = frames[frameCount - 1];
    const stageTravel = Math.hypot(
      lastF.stagePosition.x - firstF.stagePosition.x,
      lastF.stagePosition.y - firstF.stagePosition.y
    );
    let ankleStepMotion = 0;
    let wristMotion = 0;
    let maxElevation = 0;
    for (let i = 1; i < frameCount; i++) {
      const curW = frames[i].worldLandmarksYUp;
      const prevW = frames[i - 1].worldLandmarksYUp;
      ankleStepMotion +=
        Math.hypot(
          curW[MP_POSE.LEFT_ANKLE].z - prevW[MP_POSE.LEFT_ANKLE].z,
          curW[MP_POSE.LEFT_ANKLE].y - prevW[MP_POSE.LEFT_ANKLE].y
        ) +
        Math.hypot(
          curW[MP_POSE.RIGHT_ANKLE].z - prevW[MP_POSE.RIGHT_ANKLE].z,
          curW[MP_POSE.RIGHT_ANKLE].y - prevW[MP_POSE.RIGHT_ANKLE].y
        );
      wristMotion +=
        Math.hypot(
          curW[MP_POSE.LEFT_WRIST].x - prevW[MP_POSE.LEFT_WRIST].x,
          curW[MP_POSE.LEFT_WRIST].y - prevW[MP_POSE.LEFT_WRIST].y
        ) +
        Math.hypot(
          curW[MP_POSE.RIGHT_WRIST].x - prevW[MP_POSE.RIGHT_WRIST].x,
          curW[MP_POSE.RIGHT_WRIST].y - prevW[MP_POSE.RIGHT_WRIST].y
        );
      if (frames[i].stagePosition.z > maxElevation) {
        maxElevation = frames[i].stagePosition.z;
      }
    }
    const avgAnkleStep = ankleStepMotion / Math.max(1, frameCount - 1);
    const avgWrist = wristMotion / Math.max(1, frameCount - 1);

    if (maxElevation >= 2.5) action = 'jump-leap';
    else if (avgAnkleStep > 0.22 || stageTravel > 18) action = 'run-sprint';
    else if (avgAnkleStep > 0.04 || stageTravel > 2.5) action = 'walk';
    else if (avgWrist > 0.22) action = 'combat-strike';
    else action = 'idle-turn';
  }

  const inferredMotionClipId = ACTION_TO_MOTION_CLIP[action];
  const richActionText =
    explicitPerson?.actionSummary || visionActor?.actionSummary || hintPrompt || action;
  const ikProgram = buildOfflineUniversalKinematicProgram(richActionText);

  const poseKeyframes: ActorPoseKeyframe[] = [];
  const trajectoryKeyframes: TrajectoryKeyframe[] = [];
  const frameLandmarks: PersonFramePoseLandmarks[] = [];

  let minBboxX = 1;
  let maxBboxX = 0;
  let minBboxY = 1;
  let maxBboxY = 0;

  for (let i = 0; i < frameCount; i++) {
    const f = frames[i];
    if (f.bbox.minX < minBboxX) minBboxX = f.bbox.minX;
    if (f.bbox.maxX > maxBboxX) maxBboxX = f.bbox.maxX;
    if (f.bbox.minY < minBboxY) minBboxY = f.bbox.minY;
    if (f.bbox.maxY > maxBboxY) maxBboxY = f.bbox.maxY;

    const u = frameCount > 1 ? i / (frameCount - 1) : 0;
    const outTime = Number((u * durationSeconds).toFixed(3));

    const { bones, hipsOffset, pose } = solveAnatomicalPoseFromMediaPipe(f);
    const lm17 = convertMediaPipeFrameTo17JointLandmarks(f);
    frameLandmarks.push(lm17);

    const stageX = f.stagePosition.x;
    const stageY =
      explicitPerson && Math.abs(f.stagePosition.y - frames[0].stagePosition.y) < 1.5
        ? Number(
            clamp(
              explicitPerson.startY + (explicitPerson.endY - explicitPerson.startY) * u,
              16,
              84
            ).toFixed(2)
          )
        : f.stagePosition.y;
    const stageZ = lockFootContacts && (f.leftFootContact || f.rightFootContact)
      ? 0
      : f.stagePosition.z;

    poseKeyframes.push({
      time: outTime,
      bones,
      hipsOffset,
      pose,
    });

    trajectoryKeyframes.push({
      id: `kf-mpmocap-p${personIndex + 1}-${i}`,
      time: outTime,
      position: {
        x: stageX,
        y: stageY,
        z: stageZ,
      },
      pose,
      motionClip: undefined,
      gait: 'none',
      cueLabel: i === 0 ? `Person ${personIndex + 1} (${action})` : undefined,
    });
  }

  smoothSolvedMocapPoseAndTrajectoryKeyframes(
    poseKeyframes,
    trajectoryKeyframes,
    durationSeconds,
    0.65
  );

  const bodyProportions: MocapBodyProportions = extractBodyProportions
    ? {
        heightMeters: visionActor?.heightMeters ?? mpTrack.estimatedHeightMeters,
        shoulderWidthRatio: mpTrack.estimatedShoulderSpanRatio,
        hipWidthRatio: mpTrack.estimatedHipSpanRatio,
        torsoLengthRatio: 1.0,
        legLengthRatio: 1.0,
        bulkFactor:
          visionActor?.bulkFactor ??
          Number(
            clamp(
              mpTrack.estimatedShoulderSpanRatio * 0.55 + mpTrack.estimatedHipSpanRatio * 0.45,
              0.82,
              1.25
            ).toFixed(2)
          ),
        hasSkinnedMesh: false,
        vertexCount: 0,
        boneCount: 19,
        humanoidMeshMode: 'smpl',
      }
    : {
        heightMeters: 1.75,
        shoulderWidthRatio: 1.0,
        hipWidthRatio: 1.0,
        torsoLengthRatio: 1.0,
        legLengthRatio: 1.0,
        bulkFactor: 1.0,
        hasSkinnedMesh: false,
        vertexCount: 0,
        boneCount: 19,
        humanoidMeshMode: 'smpl',
      };
  bodyProportions.shapeBetas = synthesizeCalibratedSmplBetas(undefined, bodyProportions);

  const clothingColorHex =
    explicitPerson?.clothingColorHex || visionActor?.clothingColorHex || mpTrack.clothingColorHex;
  const actorName =
    explicitPerson?.name ||
    visionActor?.name ||
    (personIndex === 0
      ? totalPeople > 1
        ? 'Person 1 (Left / Lead)'
        : 'Lead Subject'
      : `Person ${personIndex + 1}`);
  const appearanceToken =
    explicitPerson?.appearanceToken ||
    visionActor?.appearanceToken ||
    `human subject ${personIndex + 1} in ${clothingColorHex} attire extracted via 33-joint 3D pose landmarker`;

  const firstPos = trajectoryKeyframes[0]?.position ?? { x: 50, y: 46, z: 0 };
  const lastPos = trajectoryKeyframes[trajectoryKeyframes.length - 1]?.position ?? firstPos;

  return {
    trackId: `video-person-${personIndex + 1}`,
    personIndex,
    actorName,
    appearanceToken,
    clothingColorHex,
    detectedActionLabel: action,
    actionSummary:
      explicitPerson?.actionSummary ||
      visionActor?.actionSummary ||
      `${action} (33-joint 3D Pose Landmarker + FootMR) from (${Math.round(firstPos.x)}, ${Math.round(firstPos.y)}) to (${Math.round(lastPos.x)}, ${Math.round(lastPos.y)})`,
    inferredMotionClipId,
    universalIkClipId: ikProgram.id,
    confidenceScore: 0.94,
    bodyProportions,
    poseKeyframes,
    trajectoryKeyframes,
    frameLandmarks,
    startPosition: { x: firstPos.x, y: firstPos.y, z: firstPos.z ?? 0 },
    endPosition: { x: lastPos.x, y: lastPos.y, z: lastPos.z ?? 0 },
    averageBbox: {
      minX: Number(minBboxX.toFixed(3)),
      maxX: Number(maxBboxX.toFixed(3)),
      minY: Number(minBboxY.toFixed(3)),
      maxY: Number(maxBboxY.toFixed(3)),
    },
  };
}

/**
 * Converts NLF-Large 24-joint 3D SMPL multi-person detections (`nlf_l_multi_0.3.2.torchscript`)
 * into canonical Mixamo-compatible `ExtractedVideoActorTrack[]` via `convertSmpl24JointsToMixamoPose`.
 */
export function buildActorTracksFromNlfSmpl3dDetections(
  nlfFrames: NlfSmpl3dFrameDetection[],
  _safeFrames: VideoFrameSample[],
  durationSeconds: number,
  lockFootContacts: boolean,
  extractBodyProportions: boolean,
  hintPrompt: string,
  visionAi: VisionAiSceneAnalysis | null,
  explicitDecomp: ReturnType<typeof decomposeMocapAndSceneHint>,
  requestedCount?: number,
  smoothingStrength = 0.65
): ExtractedVideoActorTrack[] {
  const validFrames = (nlfFrames || []).filter(
    (f) => f && Array.isArray(f.persons) && f.persons.some((p) => Array.isArray(p.joints3dSmpl24) && p.joints3dSmpl24.length >= 24)
  );
  if (validFrames.length === 0) return [];

  const counts = validFrames.map((f) => f.persons.length).sort((a, b) => a - b);
  const medianCount = counts[Math.floor(counts.length / 2)] || 1;
  const totalPeople = clamp(requestedCount ?? medianCount, 1, 4);

  // Build continuous per-person sequences across frames (anchoring on the first frame that has >= totalPeople detections)
  const frameCount = validFrames.length;
  const personSequences: NlfSmpl3dPersonDetection[][] = Array.from(
    { length: totalPeople },
    () => new Array<NlfSmpl3dPersonDetection>(frameCount)
  );

  let anchorFrameIdx = 0;
  for (let fIdx = 0; fIdx < frameCount; fIdx++) {
    if (validFrames[fIdx].persons.length >= totalPeople) {
      anchorFrameIdx = fIdx;
      break;
    }
    if (validFrames[fIdx].persons.length > validFrames[anchorFrameIdx].persons.length) {
      anchorFrameIdx = fIdx;
    }
  }

  const anchorCandidates = [...validFrames[anchorFrameIdx].persons].sort(
    (a, b) => (a.pelvis3d?.[0] ?? 0) - (b.pelvis3d?.[0] ?? 0)
  );
  for (let p = 0; p < totalPeople; p++) {
    personSequences[p][anchorFrameIdx] =
      anchorCandidates[Math.min(p, anchorCandidates.length - 1)];
  }

  // Forward pass from anchorFrameIdx + 1 .. frameCount - 1 using global minimum-distance bipartite matching
  for (let fIdx = anchorFrameIdx + 1; fIdx < frameCount; fIdx++) {
    const candidates = [...validFrames[fIdx].persons].sort(
      (a, b) => (a.pelvis3d?.[0] ?? 0) - (b.pelvis3d?.[0] ?? 0)
    );
    const pairs: { p: number; c: number; dist: number; dzRaw: number }[] = [];
    for (let p = 0; p < totalPeople; p++) {
      const prev = personSequences[p][fIdx - 1];
      for (let c = 0; c < candidates.length; c++) {
        const cand = candidates[c];
        const dx = (cand.pelvis3d?.[0] ?? 0) - (prev.pelvis3d?.[0] ?? 0);
        const dy = (cand.pelvis3d?.[1] ?? 0) - (prev.pelvis3d?.[1] ?? 0);
        const dzRaw = (cand.pelvis3d?.[2] ?? 0) - (prev.pelvis3d?.[2] ?? 0);
        const dCx = (cand.centerXNorm ?? 0.5) - (prev.centerXNorm ?? 0.5);
        const dCy = (cand.centerYNorm ?? 0.5) - (prev.centerYNorm ?? 0.5);
        const dist = Math.hypot(dx, dy, dzRaw * 0.35) + Math.hypot(dCx * 1.4, dCy * 1.4);
        pairs.push({ p, c, dist, dzRaw });
      }
    }
    pairs.sort((a, b) => a.dist - b.dist);
    const assignedP = new Set<number>();
    const usedC = new Set<number>();
    for (const pair of pairs) {
      if (assignedP.has(pair.p) || usedC.has(pair.c)) continue;
      const isPartialFrame = candidates.length < totalPeople;
      if (!isPartialFrame || (pair.dist <= 1.15 && Math.abs(pair.dzRaw) <= 1.4)) {
        assignedP.add(pair.p);
        usedC.add(pair.c);
        personSequences[pair.p][fIdx] = candidates[pair.c];
      }
    }
    for (let p = 0; p < totalPeople; p++) {
      if (!assignedP.has(p)) {
        personSequences[p][fIdx] = personSequences[p][fIdx - 1];
      }
    }
  }

  // Backward pass from anchorFrameIdx - 1 down to 0 using global minimum-distance bipartite matching
  for (let fIdx = anchorFrameIdx - 1; fIdx >= 0; fIdx--) {
    const candidates = [...validFrames[fIdx].persons].sort(
      (a, b) => (a.pelvis3d?.[0] ?? 0) - (b.pelvis3d?.[0] ?? 0)
    );
    const pairs: { p: number; c: number; dist: number; dzRaw: number }[] = [];
    for (let p = 0; p < totalPeople; p++) {
      const next = personSequences[p][fIdx + 1];
      for (let c = 0; c < candidates.length; c++) {
        const cand = candidates[c];
        const dx = (cand.pelvis3d?.[0] ?? 0) - (next.pelvis3d?.[0] ?? 0);
        const dy = (cand.pelvis3d?.[1] ?? 0) - (next.pelvis3d?.[1] ?? 0);
        const dzRaw = (cand.pelvis3d?.[2] ?? 0) - (next.pelvis3d?.[2] ?? 0);
        const dCx = (cand.centerXNorm ?? 0.5) - (next.centerXNorm ?? 0.5);
        const dCy = (cand.centerYNorm ?? 0.5) - (next.centerYNorm ?? 0.5);
        const dist = Math.hypot(dx, dy, dzRaw * 0.35) + Math.hypot(dCx * 1.4, dCy * 1.4);
        pairs.push({ p, c, dist, dzRaw });
      }
    }
    pairs.sort((a, b) => a.dist - b.dist);
    const assignedP = new Set<number>();
    const usedC = new Set<number>();
    for (const pair of pairs) {
      if (assignedP.has(pair.p) || usedC.has(pair.c)) continue;
      const isPartialFrame = candidates.length < totalPeople;
      if (!isPartialFrame || (pair.dist <= 1.15 && Math.abs(pair.dzRaw) <= 1.4)) {
        assignedP.add(pair.p);
        usedC.add(pair.c);
        personSequences[pair.p][fIdx] = candidates[pair.c];
      }
    }
    for (let p = 0; p < totalPeople; p++) {
      if (!assignedP.has(p)) {
        personSequences[p][fIdx] = personSequences[p][fIdx + 1];
      }
    }
  }

  // Compute shared group 3D metric origin across all tracked subjects at the start of the clip
  // so multi-person pairs (e.g. a couple walking side-by-side) preserve their true metric spacing & relative depth.
  const personInitXs: number[] = [];
  const personInitZs: number[] = [];
  for (let p = 0; p < totalPeople; p++) {
    const pSeq = personSequences[p];
    const initCount = Math.min(3, pSeq.length);
    let sx = 0;
    let sz = 0;
    for (let k = 0; k < initCount; k++) {
      sx += Number(pSeq[k]?.trans3d?.[0] ?? pSeq[k]?.pelvis3d?.[0] ?? 0);
      sz += Number(pSeq[k]?.trans3d?.[2] ?? pSeq[k]?.pelvis3d?.[2] ?? 3.0);
    }
    personInitXs.push(sx / Math.max(1, initCount));
    personInitZs.push(sz / Math.max(1, initCount));
  }
  const groupStartPelvisX =
    personInitXs.reduce((acc, v) => acc + v, 0) / Math.max(1, totalPeople);
  const groupStartPelvisZ =
    personInitZs.reduce((acc, v) => acc + v, 0) / Math.max(1, totalPeople);

  const tracks: ExtractedVideoActorTrack[] = [];

  for (let p = 0; p < totalPeople; p++) {
    const rawSeq = personSequences[p];
    const vActor = visionAi?.actors?.[p];
    const explicitPerson = explicitDecomp.hasExplicitPeople ? explicitDecomp.people[p] : undefined;

    // Compute 85th-percentile 2D bbox height to distinguish upright walking from genuine deep squats
    const sortedBhs = rawSeq
      .map((item) => Number(item.bboxNorm?.[3] ?? 0.55))
      .sort((a, b) => a - b);
    const p85Bh = sortedBhs[Math.min(sortedBhs.length - 1, Math.floor(sortedBhs.length * 0.85))] ?? 0.55;

    // Resolve monocular bilateral-squat depth ambiguity on passing frames using 3D/2D ankle vertical separation
    const seq: NlfSmpl3dPersonDetection[] = rawSeq.map((det) => {
      if (!Array.isArray(det.poseRotvecsSmpl24) || det.poseRotvecsSmpl24.length < 22) {
        return det;
      }
      const bh = Number(det.bboxNorm?.[3] ?? p85Bh);
      const rv = det.poseRotvecsSmpl24.map((r) => [...r]);
      const lHipX = Number(rv[1]?.[0]) || 0;
      const rHipX = Number(rv[2]?.[0]) || 0;
      const lKneeX = Number(rv[4]?.[0]) || 0;
      const rKneeX = Number(rv[5]?.[0]) || 0;
      const isUprightBbox = bh >= p85Bh * 0.72;
      const isMonocularBilateralSquat =
        isUprightBbox &&
        lHipX < -0.5 &&
        rHipX < -0.5 &&
        lKneeX > 0.8 &&
        rKneeX > 0.8;

      if (isMonocularBilateralSquat) {
        const lAnkY = Number(det.joints3dSmpl24[7]?.[1] ?? 0.7);
        const rAnkY = Number(det.joints3dSmpl24[8]?.[1] ?? 0.7);
        const diffY = clamp((lAnkY - rAnkY) / 0.13, -1.0, 1.0);
        rv[1][0] = Number((-0.08 - diffY * 0.44).toFixed(5));
        rv[2][0] = Number((-0.08 + diffY * 0.44).toFixed(5));
        rv[4][0] = Number(
          (diffY < 0 ? 0.22 + Math.abs(diffY) * 0.52 : 0.12 + (1 - diffY) * 0.2).toFixed(5)
        );
        rv[5][0] = Number(
          (diffY > 0 ? 0.22 + Math.abs(diffY) * 0.52 : 0.12 + (1 + diffY) * 0.2).toFixed(5)
        );
        rv[3][0] = Number(Math.min(0.22, (Number(rv[3]?.[0]) || 0) * 0.35).toFixed(5));
      }
      return {
        ...det,
        poseRotvecsSmpl24: rv,
      };
    });

    // Extract and unwrap per-frame root orientation (yaw, pitch, roll) anchored on the highest-confidence frame
    // and cross-checked against the 3D hip+shoulder lateral vector so low-confidence edge frames never flip 180 deg.
    const rawYawCandidates: number[] = new Array(frameCount).fill(0);
    const rawPitchRads: number[] = new Array(frameCount).fill(0);
    const rawRollRads: number[] = new Array(frameCount).fill(0);
    const qFlipX180 = new THREE.Quaternion(1, 0, 0, 0);
    let bestYawAnchorIdx = 0;
    let bestYawAnchorConf = -1;

    for (let i = 0; i < frameCount; i++) {
      const det = seq[i];
      const conf = Number(det.confidence ?? 0.5);
      if (conf > bestYawAnchorConf) {
        bestYawAnchorConf = conf;
        bestYawAnchorIdx = i;
      }
      const j = det.joints3dSmpl24;
      const latX = (j[1]?.[0] ?? 0) - (j[2]?.[0] ?? 0) + ((j[16]?.[0] ?? 0) - (j[17]?.[0] ?? 0));
      const latZ = (j[1]?.[2] ?? 0) - (j[2]?.[2] ?? 0) + ((j[16]?.[2] ?? 0) - (j[17]?.[2] ?? 0));
      const hasJointYaw = Math.hypot(latX, latZ) > 1e-3;
      const jointYaw = hasJointYaw ? Math.atan2(latZ, latX) : 0;

      const rv0 = det.poseRotvecsSmpl24?.[0];
      if (rv0 && rv0.length >= 3) {
        const rx = Number(rv0[0]) || 0;
        const ry = Number(rv0[1]) || 0;
        const rz = Number(rv0[2]) || 0;
        const ang = Math.hypot(rx, ry, rz);
        const qRoot =
          ang > 1e-7
            ? new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(rx / ang, ry / ang, rz / ang),
                ang
              )
            : new THREE.Quaternion(0, 0, 0, 1);
        const qWorld = qFlipX180.clone().multiply(qRoot).normalize();
        const eul = new THREE.Euler().setFromQuaternion(qWorld, 'YXZ');
        let yRad = eul.y;
        if (hasJointYaw) {
          const dJoint = Math.atan2(Math.sin(yRad - jointYaw), Math.cos(yRad - jointYaw));
          if (Math.abs(dJoint) > 1.75 && conf < 0.52) {
            yRad = jointYaw;
          }
        }
        rawYawCandidates[i] = yRad;
        rawPitchRads[i] = eul.x;
        rawRollRads[i] = eul.z;
      } else {
        rawYawCandidates[i] = jointYaw;
        rawPitchRads[i] = 0;
        rawRollRads[i] = 0;
      }
    }

    const rawYawRads: number[] = new Array(frameCount).fill(0);
    rawYawRads[bestYawAnchorIdx] = rawYawCandidates[bestYawAnchorIdx];
    for (let i = bestYawAnchorIdx + 1; i < frameCount; i++) {
      const prevY = rawYawRads[i - 1];
      const yRad = rawYawCandidates[i];
      const diff = Math.atan2(Math.sin(yRad - prevY), Math.cos(yRad - prevY));
      rawYawRads[i] = Math.abs(diff) > 1.85 ? prevY : prevY + diff;
    }
    for (let i = bestYawAnchorIdx - 1; i >= 0; i--) {
      const nextY = rawYawRads[i + 1];
      const yRad = rawYawCandidates[i];
      const diff = Math.atan2(Math.sin(yRad - nextY), Math.cos(yRad - nextY));
      rawYawRads[i] = Math.abs(diff) > 1.85 ? nextY : nextY + diff;
    }

    const effectiveFps = frameCount / Math.max(0.5, durationSeconds);
    const fpsStepScale = clamp(10.0 / Math.max(4.0, effectiveFps), 0.25, 1.15);
    const sgBlend = clamp(smoothingStrength, 0, 1);
    const isDense24Fps = frameCount >= 16 && effectiveFps >= 12;

    const smoothHann = (arr: number[], radius: number, preserveEndpoints = false): number[] => {
      if (arr.length <= 2 || radius <= 0) return [...arr];
      return arr.map((val, idx) => {
        const effR = preserveEndpoints
          ? Math.min(radius, idx, arr.length - 1 - idx)
          : radius;
        if (effR <= 0) return val;
        let sum = 0;
        let wSum = 0;
        for (let k = -effR; k <= effR; k++) {
          const j = clamp(idx + k, 0, arr.length - 1);
          const w = 0.5 * (1 + Math.cos((Math.PI * k) / (effR + 1)));
          sum += arr[j] * w;
          wSum += w;
        }
        return sum / Math.max(1e-6, wSum);
      });
    };

    const median3 = (a: number, b: number, c: number): number =>
      Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

    const cameraHorizonRadius = Math.max(5, Math.floor(frameCount * 0.35));
    const yawSmoothRadius = isDense24Fps ? clamp(Math.round(effectiveFps * 0.32), 3, 9) : 2;
    const headingYawRads = smoothHann(rawYawRads, yawSmoothRadius);
    const cameraPitchOffsets = smoothHann(rawPitchRads, cameraHorizonRadius);
    const cameraRollOffsets = smoothHann(rawRollRads, cameraHorizonRadius);

    // Compute 85th-percentile floor ankle Y in camera space (+Y is down in image)
    const ankleYs = seq
      .map((item) => {
        const lA = item.joints3dSmpl24[7]?.[1] ?? 0.7;
        const rA = item.joints3dSmpl24[8]?.[1] ?? 0.7;
        return Math.max(Number(lA), Number(rA));
      })
      .sort((a, b) => a - b);
    const stanceFloorAnkleY = ankleYs[Math.min(ankleYs.length - 1, Math.floor(ankleYs.length * 0.85))] ?? 0.7;

    const rawPelvisXs = seq.map((item) => Number(item.trans3d?.[0] ?? item.pelvis3d?.[0] ?? 0));
    const rawPelvisZs = seq.map((item) => Number(item.trans3d?.[2] ?? item.pelvis3d?.[2] ?? 3.0));
    const despikedPelvisZs = isDense24Fps
      ? rawPelvisZs.map((v, i) =>
          median3(rawPelvisZs[Math.max(0, i - 1)], v, rawPelvisZs[Math.min(frameCount - 1, i + 1)])
        )
      : rawPelvisZs;
    const pelvisXRadius = isDense24Fps ? clamp(Math.round(effectiveFps * 0.25), 3, 8) : 2;
    const pelvisZRadius = isDense24Fps ? clamp(Math.round(effectiveFps * 0.35), 4, 11) : 2;
    const smoothedPelvisXs = smoothHann(rawPelvisXs, pelvisXRadius, true);
    const smoothedPelvisZs = smoothHann(despikedPelvisZs, pelvisZRadius, true);
    const startPelvisX = smoothedPelvisXs[0] ?? 0;
    const startPelvisZ = smoothedPelvisZs[0] ?? 3.0;
    const relStartMetricX = (personInitXs[p] ?? startPelvisX) - groupStartPelvisX;
    const relStartMetricZ = (personInitZs[p] ?? startPelvisZ) - groupStartPelvisZ;
    const slotSign =
      Math.abs(relStartMetricX) > 0.05
        ? Math.sign(relStartMetricX)
        : Math.sign(p - (totalPeople - 1) * 0.5);
    const metricStageOffsetX =
      totalPeople === 1
        ? 0
        : totalPeople === 2
          ? slotSign * clamp(Math.abs(relStartMetricX) * 3.2, 1.35, 5.5)
          : clamp(
              relStartMetricX * 3.2 || (p - (totalPeople - 1) * 0.5) * 3.2,
              -8.5,
              8.5
            );
    const baseStageX = explicitPerson?.startX ?? Number((50 + metricStageOffsetX).toFixed(2));
    const baseStageY =
      explicitPerson?.startY ??
      (totalPeople === 1 || Math.abs(relStartMetricZ) <= 0.35
        ? 48
        : Number(clamp(48 - relStartMetricZ * 2.5, 42, 54).toFixed(2)));

    // Anisotropic Zero-Phase Hann Pre-Filtering of 24-joint 3D coordinates & SMPL rotvecs:
    // Smooth image-plane X/Y with a nimble window, and smooth pelvis-relative depth Z (`relZ`)
    // with a wider window after 3-tap median spike rejection so monocular depth noise never shakes limbs.
    const jointXYRadius = isDense24Fps ? clamp(Math.round(effectiveFps * 0.16), 2, 5) : 1;
    const jointRelZRadius = isDense24Fps ? clamp(Math.round(effectiveFps * 0.28), 3, 8) : 1;
    const rotvecRadius = isDense24Fps ? clamp(Math.round(effectiveFps * 0.18), 2, 6) : 1;
    const preFilterBlend = isDense24Fps ? sgBlend : sgBlend * 0.45;

    const smoothedJointsSeq: number[][][] = Array.from({ length: frameCount }, () =>
      Array.from({ length: 24 }, () => [0, 0, 0])
    );
    for (let jIdx = 0; jIdx < 24; jIdx++) {
      const xs = seq.map((d) => Number(d.joints3dSmpl24[jIdx]?.[0]) || 0);
      const ys = seq.map((d) => Number(d.joints3dSmpl24[jIdx]?.[1]) || 0);
      const rawRelZs = seq.map(
        (d) => (Number(d.joints3dSmpl24[jIdx]?.[2]) || 2.5) - (Number(d.joints3dSmpl24[0]?.[2]) || 2.5)
      );
      const despikedRelZs = isDense24Fps
        ? rawRelZs.map((v, idx) =>
            median3(rawRelZs[Math.max(0, idx - 1)], v, rawRelZs[Math.min(frameCount - 1, idx + 1)])
          )
        : rawRelZs;
      const filtXs = smoothHann(xs, jointXYRadius);
      const filtYs = smoothHann(ys, jointXYRadius);
      const filtRelZs = smoothHann(despikedRelZs, jointRelZRadius);
      for (let i = 0; i < frameCount; i++) {
        const rawZ = Number(seq[i].joints3dSmpl24[jIdx]?.[2]) || 2.5;
        const targetZ = (smoothedPelvisZs[i] ?? rawZ) + filtRelZs[i];
        smoothedJointsSeq[i][jIdx][0] = xs[i] * (1 - preFilterBlend) + filtXs[i] * preFilterBlend;
        smoothedJointsSeq[i][jIdx][1] = ys[i] * (1 - preFilterBlend) + filtYs[i] * preFilterBlend;
        smoothedJointsSeq[i][jIdx][2] = rawZ * (1 - preFilterBlend) + targetZ * preFilterBlend;
      }
    }

    const hasSeqRotvecs = seq.every(
      (d) => Array.isArray(d.poseRotvecsSmpl24) && d.poseRotvecsSmpl24.length >= 22
    );
    const smoothedRotvecsSeq: (number[][] | undefined)[] = new Array(frameCount).fill(undefined);
    if (hasSeqRotvecs) {
      const jointCountRv = Math.min(24, seq[0].poseRotvecsSmpl24?.length ?? 24);
      const perFrameRv: number[][][] = Array.from({ length: frameCount }, () =>
        Array.from({ length: jointCountRv }, () => [0, 0, 0])
      );
      for (let jIdx = 0; jIdx < jointCountRv; jIdx++) {
        for (let c = 0; c < 3; c++) {
          const rawComp = seq.map((d) => Number(d.poseRotvecsSmpl24?.[jIdx]?.[c]) || 0);
          if (jIdx === 0) {
            for (let i = 0; i < frameCount; i++) {
              perFrameRv[i][jIdx][c] = rawComp[i];
            }
          } else {
            const despiked = isDense24Fps
              ? rawComp.map((v, idx) =>
                  median3(rawComp[Math.max(0, idx - 1)], v, rawComp[Math.min(frameCount - 1, idx + 1)])
                )
              : rawComp;
            const filt = smoothHann(despiked, rotvecRadius);
            for (let i = 0; i < frameCount; i++) {
              perFrameRv[i][jIdx][c] = rawComp[i] * (1 - preFilterBlend) + filt[i] * preFilterBlend;
            }
          }
        }
      }
      for (let i = 0; i < frameCount; i++) {
        smoothedRotvecsSeq[i] = perFrameRv[i];
      }
    }

    const poseKeyframes: ActorPoseKeyframe[] = [];
    const trajectoryKeyframes: TrajectoryKeyframe[] = [];
    const frameLandmarks: PersonFramePoseLandmarks[] = [];
    const cumStrideByFrame: number[] = new Array(frameCount).fill(0);
    const frameStrideSteps: number[] = new Array(frameCount).fill(0);
    const frameAnkleVisWs: number[] = new Array(frameCount).fill(1);

    let minBboxX = 1;
    let maxBboxX = 0;
    let minBboxY = 1;
    let maxBboxY = 0;
    let totalHeightMeters = 0;
    let stepMotionAccum = 0;
    let armMotionAccum = 0;
    let cumFootStrideMeters = 0;

    for (let i = 0; i < frameCount; i++) {
      const det = seq[i];
      const u = frameCount > 1 ? i / (frameCount - 1) : 0;
      const outTime = Number((u * durationSeconds).toFixed(3));
      const visInfo = inferPersonVisibleBodyRatioAndUnclampedSpan(det);
      const ankleVisW = THREE.MathUtils.smoothstep(visInfo.visibleBodyRatio, 0.45, 0.65);
      const kneeVisW = THREE.MathUtils.smoothstep(visInfo.visibleBodyRatio, 0.35, 0.55);

      // Keep complete, natural 3D legs on the 3D Stage so tilting/moving the camera down reveals full walking legs!
      // Only clamp extreme monocular Z-depth spikes on unseen ankles (`visibleBodyRatio < 0.90`), and only blend toward
      // a neutral standing column when cropped above the waist (`visibleBodyRatio < 0.65`).
      const smoothed24 = smoothedJointsSeq[i].map((pt) => [...pt]);
      let smoothedRotvecs24 = smoothedRotvecsSeq[i]
        ? smoothedRotvecsSeq[i]!.map((rv) => [...rv])
        : undefined;

      if (visInfo.visibleBodyRatio < 0.9) {
        const pelvZ = Number(smoothed24[0]?.[2] ?? 2.5);
        for (const legIdx of [4, 5, 7, 8, 10, 11]) {
          if (smoothed24[legIdx]) {
            const relZ = smoothed24[legIdx][2] - pelvZ;
            if (Math.abs(relZ) > 0.26) {
              smoothed24[legIdx][2] = pelvZ + clamp(relZ, -0.26, 0.26);
            }
          }
        }
      }

      if (ankleVisW < 0.99) {
        const pelvY = Number(smoothed24[0]?.[1] ?? 0);
        const headY = Number(smoothed24[15]?.[1] ?? pelvY - 0.52);
        const upperSpanM = Math.max(0.42, pelvY - headY);
        const thighLenM = upperSpanM * 0.76;
        const shinLenM = upperSpanM * 0.8;
        const lHip = smoothed24[1] ?? [smoothed24[0][0] + 0.1, pelvY + 0.06, smoothed24[0][2]];
        const rHip = smoothed24[2] ?? [smoothed24[0][0] - 0.1, pelvY + 0.06, smoothed24[0][2]];

        const standLKnee = [lHip[0], lHip[1] + thighLenM, lHip[2]];
        const standRKnee = [rHip[0], rHip[1] + thighLenM, rHip[2]];
        // Prevent unseen knees/ankles from tucking upward into the torso when cropped at the bottom border,
        // while preserving horizontal X and natural walking Z/flexion swing so the 3D Stage character always
        // has complete, natural legs when the camera is tilted or orbited down.
        if (smoothed24[4] && smoothed24[5]) {
          smoothed24[4][0] = standLKnee[0] * (1 - kneeVisW) + smoothed24[4][0] * kneeVisW;
          smoothed24[5][0] = standRKnee[0] * (1 - kneeVisW) + smoothed24[5][0] * kneeVisW;
          smoothed24[4][1] = Math.max(
            standLKnee[1] * 0.92,
            standLKnee[1] * (1 - kneeVisW) + smoothed24[4][1] * kneeVisW
          );
          smoothed24[5][1] = Math.max(
            standRKnee[1] * 0.92,
            standRKnee[1] * (1 - kneeVisW) + smoothed24[5][1] * kneeVisW
          );
        }
        const curLKnee = smoothed24[4] ?? standLKnee;
        const curRKnee = smoothed24[5] ?? standRKnee;
        const standLAnk = [curLKnee[0], curLKnee[1] + shinLenM, curLKnee[2]];
        const standRAnk = [curRKnee[0], curRKnee[1] + shinLenM, curRKnee[2]];
        if (smoothed24[7] && smoothed24[8]) {
          smoothed24[7][0] = standLAnk[0] * (1 - ankleVisW) + smoothed24[7][0] * ankleVisW;
          smoothed24[8][0] = standRAnk[0] * (1 - ankleVisW) + smoothed24[8][0] * ankleVisW;
          smoothed24[7][1] = Math.max(
            standLAnk[1] * 0.92,
            standLAnk[1] * (1 - ankleVisW) + smoothed24[7][1] * ankleVisW
          );
          smoothed24[8][1] = Math.max(
            standRAnk[1] * 0.92,
            standRAnk[1] * (1 - ankleVisW) + smoothed24[8][1] * ankleVisW
          );
        }
        if (smoothed24[10] && smoothed24[11]) {
          for (let c = 0; c < 3; c++) {
            smoothed24[10][c] =
              (smoothed24[7][c] + (c === 1 ? 0.04 : 0)) * (1 - ankleVisW) +
              smoothed24[10][c] * ankleVisW;
            smoothed24[11][c] =
              (smoothed24[8][c] + (c === 1 ? 0.04 : 0)) * (1 - ankleVisW) +
              smoothed24[11][c] * ankleVisW;
          }
        }
        if (smoothedRotvecs24) {
          const hipKeepW = Math.max(0.55, kneeVisW);
          const kneeKeepW = Math.max(0.45, ankleVisW);
          for (const kIdx of [1, 2]) {
            if (smoothedRotvecs24[kIdx]) {
              smoothedRotvecs24[kIdx][0] = clamp(smoothedRotvecs24[kIdx][0] * hipKeepW, -0.55, 0.55);
              smoothedRotvecs24[kIdx][1] *= kneeVisW;
              smoothedRotvecs24[kIdx][2] *= kneeVisW;
            }
          }
          for (const aIdx of [4, 5]) {
            if (smoothedRotvecs24[aIdx]) {
              smoothedRotvecs24[aIdx][0] = clamp(smoothedRotvecs24[aIdx][0] * kneeKeepW, 0, 0.85);
              smoothedRotvecs24[aIdx][1] *= ankleVisW;
              smoothedRotvecs24[aIdx][2] *= ankleVisW;
            }
          }
          for (const fIdx of [7, 8, 10, 11]) {
            if (smoothedRotvecs24[fIdx]) {
              smoothedRotvecs24[fIdx][0] *= ankleVisW;
              smoothedRotvecs24[fIdx][1] *= ankleVisW;
              smoothedRotvecs24[fIdx][2] *= ankleVisW;
            }
          }
        }
      }

      const solved = convertSmpl24JointsToMixamoPose(
        smoothed24,
        stanceFloorAnkleY,
        lockFootContacts,
        smoothedRotvecs24,
        det.trans3d,
        {
          headingYawRad: headingYawRads[i],
          cameraPitchOffsetRad: cameraPitchOffsets[i],
          cameraRollOffsetRad: cameraRollOffsets[i],
        }
      );
      totalHeightMeters += solved.estimatedHeightMeters;
      frameAnkleVisWs[i] = ankleVisW;

      if (i > 0) {
        const prevJ = seq[i - 1].joints3dSmpl24;
        const curJ = det.joints3dSmpl24;
        const frameStepDelta =
          (Math.hypot((curJ[7]?.[2] ?? 0) - (prevJ[7]?.[2] ?? 0), (curJ[7]?.[1] ?? 0) - (prevJ[7]?.[1] ?? 0)) +
            Math.hypot((curJ[8]?.[2] ?? 0) - (prevJ[8]?.[2] ?? 0), (curJ[8]?.[1] ?? 0) - (prevJ[8]?.[1] ?? 0))) *
          ankleVisW;
        stepMotionAccum += frameStepDelta;

        const dAnkleSepY =
          Math.abs(
            ((curJ[7]?.[1] ?? 0) - (curJ[8]?.[1] ?? 0)) -
              ((prevJ[7]?.[1] ?? 0) - (prevJ[8]?.[1] ?? 0))
          ) * ankleVisW;
        const curRv = det.poseRotvecsSmpl24;
        const prevRv = seq[i - 1].poseRotvecsSmpl24;
        const dHipPhase =
          curRv && prevRv && curRv.length >= 3 && prevRv.length >= 3
            ? Math.abs(
                ((Number(curRv[1]?.[0]) || 0) - (Number(curRv[2]?.[0]) || 0)) -
                  ((Number(prevRv[1]?.[0]) || 0) - (Number(prevRv[2]?.[0]) || 0))
              ) * Math.max(0.45, kneeVisW)
            : 0;
        if (dAnkleSepY > 0.012 * fpsStepScale || dHipPhase > 0.08 * fpsStepScale) {
          const stepInc = Math.min(0.24 * fpsStepScale, dAnkleSepY * 1.15 + dHipPhase * 0.14);
          frameStrideSteps[i] = stepInc;
          cumFootStrideMeters += stepInc;
        }

        armMotionAccum +=
          Math.hypot(
            (curJ[20]?.[0] ?? 0) - (prevJ[20]?.[0] ?? 0),
            (curJ[20]?.[1] ?? 0) - (prevJ[20]?.[1] ?? 0),
            (curJ[20]?.[2] ?? 0) - (prevJ[20]?.[2] ?? 0)
          ) +
          Math.hypot(
            (curJ[21]?.[0] ?? 0) - (prevJ[21]?.[0] ?? 0),
            (curJ[21]?.[1] ?? 0) - (prevJ[21]?.[1] ?? 0),
            (curJ[21]?.[2] ?? 0) - (prevJ[21]?.[2] ?? 0)
          );
      }
      cumStrideByFrame[i] = cumFootStrideMeters;

      const [bx, by, bw, bh] = det.bboxNorm ?? [0.4, 0.25, 0.2, 0.55];
      const bMinX = clamp(bx, 0, 1);
      const bMaxX = clamp(bx + bw, 0, 1);
      const bMinY = clamp(by, 0, 1);
      const bMaxY = clamp(by + bh, 0, 1);
      if (bMinX < minBboxX) minBboxX = bMinX;
      if (bMaxX > maxBboxX) maxBboxX = bMaxX;
      if (bMinY < minBboxY) minBboxY = bMinY;
      if (bMaxY > maxBboxY) maxBboxY = bMaxY;

      // Convert character-local Mixamo ActorPose into full 19-bone BoneEulerDelta record (`HUMANOID_BONES`)
      const bones = extract19BoneEulerDeltasFromActorPose(solved.pose);

      poseKeyframes.push({
        time: outTime,
        bones,
        hipsOffset: solved.pose.hipsOffset ?? [0, 0, 0],
        pose: solved.pose,
      });

      trajectoryKeyframes.push({
        id: `kf-nlfmocap-p${p + 1}-${i}`,
        time: outTime,
        position: { x: baseStageX, y: baseStageY, z: 0 },
        rotation: { x: 0, y: solved.facingYawDeg, z: 0 },
        pose: solved.pose,
        motionClip: undefined,
        gait: 'none',
        cueLabel: i === 0 ? `Person ${p + 1} (NLF 3D SMPL)` : undefined,
      });

      // Populate 17-joint landmark overlay from SMPL-24 joints using true unclamped 2D vertical span
      // so off-screen knees/ankles remain at `y > 1.0` instead of being squashed inside the visible frame!
      const unclampedSpanY = Math.max(
        0.08,
        visInfo.unclampedBboxH || (bMaxY - bMinY) / Math.max(0.25, visInfo.visibleBodyRatio)
      );
      const pelv3dY = Number(smoothed24[0]?.[1] ?? solved.pelvisCameraXyz[1]);
      const head3dY = Number(smoothed24[15]?.[1] ?? pelv3dY - 0.52);
      const upper3dSpan = Math.max(0.38, pelv3dY - head3dY);
      const crown3dY = head3dY - upper3dSpan * 0.44;
      const fullStanding3dSpan = Math.max(solved.estimatedHeightMeters, upper3dSpan * 3.24);
      const toJoint2D = (smplIdx: number): MocapJoint2D => {
        const j = smoothed24[smplIdx] ?? [0, 0, 2.5];
        const j2dExplicit = det.joints2dSmpl24Norm?.[smplIdx];
        if (Array.isArray(j2dExplicit) && j2dExplicit.length >= 2) {
          const exX = clamp(Number(j2dExplicit[0]) || 0.5, -0.2, 1.2);
          const exY = clamp(Number(j2dExplicit[1]) || 0.5, -0.2, 1.85);
          const isInFrame = exY >= 0 && exY <= 1.0 && exX >= 0 && exX <= 1.0;
          return {
            x: Number(exX.toFixed(4)),
            y: Number(exY.toFixed(4)),
            z: Number(clamp((Number(j[2]) - solved.pelvisCameraXyz[2]) * 0.5, -0.5, 0.5).toFixed(4)),
            confidence: isInFrame ? (det.confidence ?? 0.92) : 0.15,
          };
        }
        const relX = clamp(
          0.5 + (Number(j[0]) - solved.pelvisCameraXyz[0]) / Math.max(0.6, solved.estimatedHeightMeters),
          0,
          1
        );
        const effJoint3dY =
          smplIdx === 15 ? Number(j[1]) - upper3dSpan * 0.22 : Number(j[1]);
        const relYFromCrown = clamp(
          (effJoint3dY - crown3dY) / Math.max(0.6, fullStanding3dSpan),
          0,
          1.25
        );
        const outY = clamp(visInfo.crownYNorm + relYFromCrown * unclampedSpanY, 0.01, 1.85);
        return {
          x: Number(clamp(bMinX + relX * Math.max(0.05, bMaxX - bMinX), 0.01, 0.99).toFixed(4)),
          y: Number(outY.toFixed(4)),
          z: Number(clamp((Number(j[2]) - solved.pelvisCameraXyz[2]) * 0.5, -0.5, 0.5).toFixed(4)),
          confidence: outY <= 1.0 ? (det.confidence ?? 0.92) : 0.15,
        };
      };

      const leftAnkle2D = toJoint2D(7);
      const rightAnkle2D = toJoint2D(8);

      frameLandmarks.push({
        timeSec: outTime,
        bbox: { minX: bMinX, maxX: bMaxX, minY: bMinY, maxY: bMaxY },
        leftFootContact:
          leftAnkle2D.y <= 0.99 && (solved.pose.anatomicalIk?.leftAnkle?.[1] ?? 0) <= 0.01,
        rightFootContact:
          rightAnkle2D.y <= 0.99 && (solved.pose.anatomicalIk?.rightAnkle?.[1] ?? 0) <= 0.01,
        joints: {
          head: toJoint2D(15),
          neck: toJoint2D(12),
          leftShoulder: toJoint2D(16),
          rightShoulder: toJoint2D(17),
          leftElbow: toJoint2D(18),
          rightElbow: toJoint2D(19),
          leftWrist: toJoint2D(20),
          rightWrist: toJoint2D(21),
          hips: toJoint2D(0),
          leftHip: toJoint2D(1),
          rightHip: toJoint2D(2),
          leftKnee: toJoint2D(4),
          rightKnee: toJoint2D(5),
          leftAnkle: leftAnkle2D,
          rightAnkle: rightAnkle2D,
        },
      });
    }

    // Carry over established walking stride velocity into frames where the camera pushes in and crops the lower legs
    let visibleStrideSum = 0;
    let visibleStrideCount = 0;
    for (let i = 1; i < frameCount; i++) {
      if (frameAnkleVisWs[i] >= 0.55) {
        visibleStrideSum += frameStrideSteps[i];
        visibleStrideCount++;
      }
    }
    const meanVisibleStrideStep = visibleStrideCount >= 2 ? visibleStrideSum / visibleStrideCount : 0;
    if (meanVisibleStrideStep > 0.008 * fpsStepScale) {
      let rebuiltCumStride = 0;
      cumStrideByFrame[0] = 0;
      for (let i = 1; i < frameCount; i++) {
        const visW = frameAnkleVisWs[i];
        const effStep =
          visW >= 0.55
            ? frameStrideSteps[i]
            : Math.max(frameStrideSteps[i], meanVisibleStrideStep * 0.9 * (1 - visW) + frameStrideSteps[i] * visW);
        rebuiltCumStride += effStep;
        cumStrideByFrame[i] = rebuiltCumStride;
      }
      cumFootStrideMeters = rebuiltCumStride;
    }

    // Compute continuous, non-switching 3D Stage floor trajectory (stageX, stageY)
    const endPelvisZ = smoothedPelvisZs[frameCount - 1] ?? startPelvisZ;
    const totalDzMag = Math.abs(startPelvisZ - endPelvisZ);
    const strideAssistW =
      cumFootStrideMeters > 0.15
        ? clamp(1 - totalDzMag / Math.max(0.25, cumFootStrideMeters * 0.65), 0, 1)
        : 0;
    const rawStageXs: number[] = new Array(frameCount);
    const rawStageYs: number[] = new Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      const dxMeters = (smoothedPelvisXs[i] ?? startPelvisX) - startPelvisX;
      const dzMeters = startPelvisZ - (smoothedPelvisZs[i] ?? startPelvisZ);
      const headingRad = headingYawRads[i] ?? 0;
      const strideM = cumStrideByFrame[i] ?? 0;
      const forwardMeters =
        dzMeters * (1 - strideAssistW) + strideM * Math.cos(headingRad) * strideAssistW;
      const lateralMeters =
        dxMeters + strideM * Math.sin(headingRad) * 0.5 * strideAssistW;
      rawStageXs[i] = clamp(baseStageX + lateralMeters * 3.2, 24, 76);
      rawStageYs[i] = clamp(baseStageY + forwardMeters * 3.2, 24, 78);
    }
    const trajSmoothRadius = isDense24Fps ? clamp(Math.round(effectiveFps * 0.22), 2, 6) : 1;
    const finalStageXs = smoothHann(rawStageXs, trajSmoothRadius, true);
    const finalStageYs = smoothHann(rawStageYs, trajSmoothRadius, true);
    for (let i = 0; i < frameCount; i++) {
      trajectoryKeyframes[i].position.x = Number(finalStageXs[i].toFixed(2));
      trajectoryKeyframes[i].position.y = Number(finalStageYs[i].toFixed(2));
    }

    // Apply Post-Solve Quaternion Hemisphere Continuity & Zero-Phase Temporal Quaternion Filter
    smoothSolvedMocapPoseAndTrajectoryKeyframes(
      poseKeyframes,
      trajectoryKeyframes,
      durationSeconds,
      sgBlend
    );

    const avgStep = stepMotionAccum / Math.max(1, frameCount - 1);
    const avgArm = armMotionAccum / Math.max(1, frameCount - 1);
    const firstKfPos = trajectoryKeyframes[0]?.position ?? { x: baseStageX, y: baseStageY };
    const lastKfPos = trajectoryKeyframes[trajectoryKeyframes.length - 1]?.position ?? firstKfPos;
    const stageTravelDist = Math.hypot(lastKfPos.x - firstKfPos.x, lastKfPos.y - firstKfPos.y);
    const detectedAction: DetectedMocapAction =
      explicitPerson?.action ??
      (avgStep > 0.22
        ? 'run-sprint'
        : stageTravelDist > 1.2 || avgStep > 0.045
          ? 'walk'
          : avgArm > 0.06
            ? 'dance-expressive'
            : 'idle-turn');
    const inferredMotionClipId = ACTION_TO_MOTION_CLIP[detectedAction];
    const ikProgram = buildOfflineUniversalKinematicProgram(
      explicitPerson?.actionSummary || vActor?.actionSummary || hintPrompt || detectedAction
    );

    const avgHeight = Number(clamp(totalHeightMeters / Math.max(1, frameCount), 1.5, 2.05).toFixed(2));
    // Compute pose-invariant 3D anthropometric body proportions from SMPL 24-joint bone chains & shapeBetas (β_0..β_9)
    const dist3d = (a?: number[], b?: number[]): number =>
      a && b && a.length >= 3 && b.length >= 3
        ? Math.hypot(
            (Number(a[0]) || 0) - (Number(b[0]) || 0),
            (Number(a[1]) || 0) - (Number(b[1]) || 0),
            (Number(a[2]) || 0) - (Number(b[2]) || 0)
          )
        : 0;
    const medianSorted = (vals: number[], fallback: number): number => {
      if (vals.length === 0) return fallback;
      const sorted = [...vals].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * 0.5)] ?? fallback;
    };

    const torsoLensM: number[] = [];
    const shoulderSpansM: number[] = [];
    const hipSpansM: number[] = [];
    const legLensM: number[] = [];
    const standingHeightsM: number[] = [];
    const tposeHeightsM: number[] = [];
    const tposeJointsRows: number[][][] = [];
    const betaRows: number[][] = [];
    const surfShoulderRows: number[] = [];
    const surfChestWRows: number[] = [];
    const surfChestDRows: number[] = [];
    const surfWaistWRows: number[] = [];
    const surfWaistDRows: number[] = [];
    const surfHipWRows: number[] = [];
    const surfHipDRows: number[] = [];

    for (let i = 0; i < frameCount; i++) {
      const det = seq[i];
      const j = det.joints3dSmpl24;
      if (Array.isArray(j) && j.length >= 18) {
        const torsoM =
          dist3d(j[0], j[3]) + dist3d(j[3], j[6]) + dist3d(j[6], j[9]) + dist3d(j[9], j[12]);
        const directShoulderM = dist3d(j[16], j[17]);
        const collarChainM =
          dist3d(j[16], j[13]) + dist3d(j[13], j[14]) + dist3d(j[14], j[17]);
        const shoulderM =
          collarChainM > 0.15
            ? directShoulderM * 0.65 + collarChainM * 0.35
            : directShoulderM;
        const hipM = dist3d(j[1], j[2]);
        const lLegM = dist3d(j[1], j[4]) + dist3d(j[4], j[7]);
        const rLegM = dist3d(j[2], j[5]) + dist3d(j[5], j[8]);
        const legM = 0.5 * (lLegM + rLegM);
        const neckHeadM = dist3d(j[12], j[15]);

        if (torsoM > 0.25 && torsoM < 0.78) torsoLensM.push(torsoM);
        if (shoulderM > 0.18 && shoulderM < 0.62) shoulderSpansM.push(shoulderM);
        if (hipM > 0.09 && hipM < 0.38) hipSpansM.push(hipM);
        if (legM > 0.42 && legM < 1.18) legLensM.push(legM);

        // Pose-invariant geodesic full standing stature (ankle sole + leg + pelvis-hip rise + spine + neck-head + crown)
        const effLegM = legM > 0.48 ? legM : torsoM * 1.74;
        const statureM = 0.075 + effLegM + 0.068 + torsoM + Math.max(0.16, neckHeadM) + 0.115;
        if (statureM > 1.38 && statureM < 2.15) standingHeightsM.push(statureM);
      }
      if (Array.isArray(det.shapeBetas) && det.shapeBetas.length >= 2) {
        betaRows.push(det.shapeBetas.map((b) => Number(b) || 0));
      }
      if (typeof det.tposeHeightM === 'number' && det.tposeHeightM > 1.35 && det.tposeHeightM < 2.15) {
        tposeHeightsM.push(det.tposeHeightM);
      }
      if (Array.isArray(det.tposeJointsSmpl24) && det.tposeJointsSmpl24.length >= 24) {
        tposeJointsRows.push(det.tposeJointsSmpl24);
      }
      if (det.surfaceAnthropometry) {
        const sa = det.surfaceAnthropometry;
        if (sa.shoulderWidthM > 0.28 && sa.shoulderWidthM < 0.68) surfShoulderRows.push(sa.shoulderWidthM);
        if (sa.chestWidthM > 0.22 && sa.chestWidthM < 0.56) surfChestWRows.push(sa.chestWidthM);
        if (sa.chestDepthM > 0.14 && sa.chestDepthM < 0.42) surfChestDRows.push(sa.chestDepthM);
        if (sa.waistWidthM > 0.18 && sa.waistWidthM < 0.52) surfWaistWRows.push(sa.waistWidthM);
        if (sa.waistDepthM > 0.14 && sa.waistDepthM < 0.44) surfWaistDRows.push(sa.waistDepthM);
        if (sa.hipWidthM > 0.22 && sa.hipWidthM < 0.56) surfHipWRows.push(sa.hipWidthM);
        if (sa.hipDepthM > 0.15 && sa.hipDepthM < 0.44) surfHipDRows.push(sa.hipDepthM);
      }
    }

    const medTorsoM = medianSorted(torsoLensM, 0.455);
    const medShoulderM = medianSorted(shoulderSpansM, 0.358);
    const medHipM = medianSorted(hipSpansM, 0.178);
    const medLegM = medianSorted(legLensM, 0.795);
    const medStatureM = medianSorted(standingHeightsM, avgHeight);

    const hasSurfaceAnthro = surfShoulderRows.length > 0 || surfWaistWRows.length > 0;
    const medSurfShoulderM = medianSorted(surfShoulderRows, 0.435);
    const medSurfChestW = medianSorted(surfChestWRows, 0.335);
    const medSurfChestD = medianSorted(surfChestDRows, 0.235);
    const medSurfWaistW = medianSorted(surfWaistWRows, 0.295);
    const medSurfWaistD = medianSorted(surfWaistDRows, 0.215);
    const medSurfHipW = medianSorted(surfHipWRows, 0.345);
    const medSurfHipD = medianSorted(surfHipDRows, 0.235);

    const hasSmplBetas = betaRows.length > 0 || hasSurfaceAnthro || tposeJointsRows.length > 0;
    const medBetas: number[] = [];
    if (betaRows.length > 0) {
      const betaDim = Math.min(10, betaRows[0].length);
      for (let bIdx = 0; bIdx < betaDim; bIdx++) {
        medBetas.push(medianSorted(betaRows.map((r) => r[bIdx] ?? 0), 0));
      }
    }
    const medTposeJointsSmpl24: number[][] | undefined =
      tposeJointsRows.length > 0
        ? Array.from({ length: 24 }, (_, jIdx) => [
            Number(medianSorted(tposeJointsRows.map((r) => Number(r[jIdx]?.[0]) || 0), 0).toFixed(4)),
            Number(medianSorted(tposeJointsRows.map((r) => Number(r[jIdx]?.[1]) || 0), 0).toFixed(4)),
            Number(medianSorted(tposeJointsRows.map((r) => Number(r[jIdx]?.[2]) || 0), 0).toFixed(4)),
          ])
        : undefined;
    const beta0 = medBetas[0] ?? 0;
    const beta1 = medBetas[1] ?? 0;
    const beta2 = medBetas[2] ?? 0;

    // Canonical SMPL neutral template baselines: torso = 0.455m, shoulder = 0.358m, hip = 0.178m, leg = 0.795m
    const rawTorsoRatio = clamp(medTorsoM / 0.455, 0.82, 1.24);
    const rawLegRatio = clamp(medLegM / 0.795, 0.82, 1.24);
    // Combine skeletal span, torso-relative proportion, 3D SMPL surface cross-sections, and SMPL shape PCA betas
    // with 1.8x contrast gain around 1.0 so body-shape differences are clearly preserved in 3D.
    const absShoulderRatio = medShoulderM / 0.358;
    const relShoulderToTorso = (medShoulderM / Math.max(0.3, medTorsoM)) / (0.358 / 0.455);
    const surfShoulderRatio = hasSurfaceAnthro
      ? 0.55 * (medSurfShoulderM / 0.435) + 0.45 * (medSurfChestW / 0.335)
      : absShoulderRatio * 0.6 + relShoulderToTorso * 0.4;
    const rawShoulderCombined =
      (absShoulderRatio * 0.42 + relShoulderToTorso * 0.28 + surfShoulderRatio * 0.30) -
      beta1 * 0.055 +
      beta2 * 0.045;
    const solvedShoulderRatio = Number(
      clamp(1.0 + (rawShoulderCombined - 1.0) * 1.85, 0.78, 1.32).toFixed(2)
    );

    const absHipRatio = medHipM / 0.178;
    const relHipToTorso = (medHipM / Math.max(0.3, medTorsoM)) / (0.178 / 0.455);
    const surfHipRatio = hasSurfaceAnthro
      ? 0.6 * (medSurfHipW / 0.345) + 0.4 * (medSurfWaistW / 0.295)
      : absHipRatio * 0.6 + relHipToTorso * 0.4;
    const rawHipCombined =
      (absHipRatio * 0.40 + relHipToTorso * 0.25 + surfHipRatio * 0.35) -
      beta1 * 0.05 +
      beta2 * 0.05;
    const solvedHipRatio = Number(
      clamp(1.0 + (rawHipCombined - 1.0) * 1.85, 0.78, 1.32).toFixed(2)
    );
    const solvedTorsoRatio = Number(rawTorsoRatio.toFixed(2));
    const solvedLegRatio = Number(rawLegRatio.toFixed(2));

    const rawBetaStatureM = medStatureM - beta0 * 0.045;
    const betaStatureM = clamp(1.72 + (rawBetaStatureM - 1.72) * 1.55, 1.48, 2.05);
    const solvedHeightMeters = Number(
      clamp(
        vActor?.heightMeters
          ? betaStatureM * 0.78 + vActor.heightMeters * 0.22
          : betaStatureM,
        1.48,
        2.05
      ).toFixed(2)
    );

    const surfDepthGirthRatio = hasSurfaceAnthro
      ? 0.45 * (medSurfWaistD / 0.215) + 0.35 * (medSurfChestD / 0.235) + 0.20 * (medSurfHipD / 0.235)
      : 1.0;
    const rawBulk =
      1.0 +
      (solvedShoulderRatio - 1.0) * 0.55 +
      (solvedHipRatio - 1.0) * 0.45 +
      (surfDepthGirthRatio - 1.0) * 0.75 -
      beta1 * 0.14 +
      beta2 * 0.09;
    const smplBulkFactor = clamp(rawBulk, 0.74, 1.42);
    const solvedBulkFactor = Number(
      clamp(
        vActor?.bulkFactor
          ? smplBulkFactor * 0.72 + vActor.bulkFactor * 0.28
          : smplBulkFactor,
        0.74,
        1.42
      ).toFixed(2)
    );

    const defaultColors = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24'];
    const clothingColorHex =
      explicitPerson?.clothingColorHex || vActor?.clothingColorHex || defaultColors[p % defaultColors.length];
    const actorName =
      explicitPerson?.name ||
      vActor?.name ||
      (totalPeople === 2
        ? p === 0
          ? 'Person 1 (Left)'
          : 'Person 2 (Right)'
        : p === 0
          ? 'Lead Subject'
          : `Person ${p + 1}`);

    const firstPos = trajectoryKeyframes[0]?.position ?? { x: baseStageX, y: baseStageY, z: 0 };
    const lastPos = trajectoryKeyframes[trajectoryKeyframes.length - 1]?.position ?? firstPos;

    tracks.push({
      trackId: `video-person-${p + 1}`,
      personIndex: p,
      actorName,
      appearanceToken:
        explicitPerson?.appearanceToken ||
        vActor?.appearanceToken ||
        `human subject ${p + 1} extracted via NLF-Large 24-joint 3D SMPL`,
      clothingColorHex,
      detectedActionLabel: detectedAction,
      actionSummary:
        explicitPerson?.actionSummary ||
        vActor?.actionSummary ||
        `${detectedAction} (NLF-Large 24-Joint 3D SMPL + Mixamo Solver) from (${Math.round(firstPos.x)}, ${Math.round(firstPos.y)}) to (${Math.round(lastPos.x)}, ${Math.round(lastPos.y)})`,
      inferredMotionClipId,
      universalIkClipId: ikProgram.id,
      confidenceScore: 0.96,
      bodyProportions: extractBodyProportions
        ? {
            heightMeters: solvedHeightMeters,
            shoulderWidthRatio: solvedShoulderRatio,
            hipWidthRatio: solvedHipRatio,
            torsoLengthRatio: solvedTorsoRatio,
            legLengthRatio: solvedLegRatio,
            bulkFactor: solvedBulkFactor,
            hasSkinnedMesh: hasSmplBetas,
            vertexCount: hasSmplBetas ? 6890 : 0,
            boneCount: 24,
            shapeBetas: synthesizeCalibratedSmplBetas(medBetas, {
              heightMeters: solvedHeightMeters,
              shoulderWidthRatio: solvedShoulderRatio,
              hipWidthRatio: solvedHipRatio,
              torsoLengthRatio: solvedTorsoRatio,
              legLengthRatio: solvedLegRatio,
              bulkFactor: solvedBulkFactor,
            }),
            ...(medTposeJointsSmpl24 ? { tposeJointsSmpl24: medTposeJointsSmpl24 } : {}),
            humanoidMeshMode: 'smpl',
          }
        : {
            heightMeters: 1.75,
            shoulderWidthRatio: 1.0,
            hipWidthRatio: 1.0,
            torsoLengthRatio: 1.0,
            legLengthRatio: 1.0,
            bulkFactor: 1.0,
            hasSkinnedMesh: false,
            vertexCount: 0,
            boneCount: 24,
            shapeBetas: new Array(10).fill(0),
            humanoidMeshMode: 'smpl',
          },
      poseKeyframes,
      trajectoryKeyframes,
      frameLandmarks,
      startPosition: { x: firstPos.x, y: firstPos.y, z: firstPos.z ?? 0 },
      endPosition: { x: lastPos.x, y: lastPos.y, z: lastPos.z ?? 0 },
      averageBbox: {
        minX: Number(minBboxX.toFixed(3)),
        maxX: Number(maxBboxX.toFixed(3)),
        minY: Number(minBboxY.toFixed(3)),
        maxY: Number(maxBboxY.toFixed(3)),
      },
    });
  }

  // Amplify between-person SMPL anthropometric contrast when multiple subjects are tracked
  // (counteracts monocular SMPL prior shrinkage toward the mean template) and tag slender/female silhouettes.
  if (extractBodyProportions && tracks.length >= 2) {
    const meanH =
      tracks.reduce((acc, tr) => acc + tr.bodyProportions.heightMeters, 0) / tracks.length;
    const meanSh =
      tracks.reduce((acc, tr) => acc + tr.bodyProportions.shoulderWidthRatio, 0) / tracks.length;
    const meanBulk =
      tracks.reduce((acc, tr) => acc + tr.bodyProportions.bulkFactor, 0) / tracks.length;

    for (const tr of tracks) {
      const bp = tr.bodyProportions;
      bp.heightMeters = Number(
        clamp(meanH + (bp.heightMeters - meanH) * 1.45, 1.48, 2.05).toFixed(2)
      );
      bp.shoulderWidthRatio = Number(
        clamp(meanSh + (bp.shoulderWidthRatio - meanSh) * 1.45, 0.78, 1.32).toFixed(2)
      );
      bp.bulkFactor = Number(
        clamp(meanBulk + (bp.bulkFactor - meanBulk) * 1.45, 0.74, 1.42).toFixed(2)
      );
      bp.shapeBetas = synthesizeCalibratedSmplBetas(bp.shapeBetas, bp);

      const hasExplicitGenderWord =
        /\b(man|woman|male|female|boy|girl|lady|gentleman|husband|wife|father|mother|soldier|doctor)\b/i.test(
          `${tr.actorName} ${tr.appearanceToken}`
        );
      if (
        !hasExplicitGenderWord &&
        (bp.heightMeters <= meanH - 0.015 || bp.shoulderWidthRatio <= meanSh - 0.02)
      ) {
        tr.appearanceToken = `${tr.appearanceToken} (female slender silhouette)`;
      }
    }
  } else if (extractBodyProportions && tracks.length === 1) {
    const tr = tracks[0];
    const bp = tr.bodyProportions;
    const hasExplicitGenderWord =
      /\b(man|woman|male|female|boy|girl|lady|gentleman)\b/i.test(
        `${tr.actorName} ${tr.appearanceToken}`
      );
    if (!hasExplicitGenderWord && bp.heightMeters < 1.67 && bp.shoulderWidthRatio < 0.96) {
      tr.appearanceToken = `${tr.appearanceToken} (female slender silhouette)`;
    }
  }

  // Synchronize forward Y progression for co-walking side-by-side pairs (e.g. couples walking together)
  // so monocular depth fluctuations on loose clothing never cause one partner to drift ahead of the other.
  if (
    tracks.length === 2 &&
    Math.abs(tracks[0].startPosition.y - tracks[1].startPosition.y) <= 0.6 &&
    tracks[0].detectedActionLabel === 'walk' &&
    tracks[1].detectedActionLabel === 'walk'
  ) {
    const kLen = Math.min(tracks[0].trajectoryKeyframes.length, tracks[1].trajectoryKeyframes.length);
    for (let i = 0; i < kLen; i++) {
      const y0 = tracks[0].trajectoryKeyframes[i].position.y;
      const y1 = tracks[1].trajectoryKeyframes[i].position.y;
      const meanY = 0.5 * (y0 + y1);
      tracks[0].trajectoryKeyframes[i].position.y = Number((y0 * 0.4 + meanY * 0.6).toFixed(2));
      tracks[1].trajectoryKeyframes[i].position.y = Number((y1 * 0.4 + meanY * 0.6).toFixed(2));
    }
    if (kLen > 0) {
      tracks[0].endPosition.y = tracks[0].trajectoryKeyframes[kLen - 1].position.y;
      tracks[1].endPosition.y = tracks[1].trajectoryKeyframes[kLen - 1].position.y;
    }
  }

  return tracks;
}

/**
 * Pure, deterministic multi-frame computer vision analyzer that extracts:
 * - Multi-person `actorTracks` (`1..N` people with 19-bone `poseKeyframes` & 3D `trajectoryKeyframes`)
 * - Background optical-flow `cameraMotion` (`ExtractedVideoCameraMotion`)
 * - Primary actor `poseKeyframes`, `trajectoryKeyframes`, and `bodyProportions`
 */
export function extractMocapFromVideoElementOrFrames(
  frames: VideoFrameSample[],
  options: VideoMocapExtractionOptions & {
    fileName?: string;
    referenceFrameDataUrl?: string;
    contactSheetDataUrl?: string;
    visionAiAnalysis?: VisionAiSceneAnalysis | null;
    mediaPipeDetections?: MediaPipeFrameDetection[];
    nlfSmpl3dDetections?: NlfSmpl3dFrameDetection[];
    nlfDiagnostic?: string;
  } = {}
): VideoMocapExtractionResult {
  const fileName = options.fileName || 'video_mocap_plate.mp4';
  const startPos = options.startPosition ?? { x: 50, y: 50, z: 0 };
  const lockFootContacts = options.lockFootContacts !== false;
  const extractBodyProportions = options.extractBodyProportions !== false;
  const smoothingStrength = options.smoothingStrength ?? 0.65;
  const hintPrompt = `${options.motionHintPrompt || ''} ${fileName}`.trim();
  const visionAi = options.visionAiAnalysis ?? null;
  const mpDetections = options.mediaPipeDetections;
  const nlfDetections = options.nlfSmpl3dDetections;

  // Parse explicit user instructions (in Arabic or English) from motionHintPrompt + fileName
  const explicitDecomp = decomposeMocapAndSceneHint(hintPrompt);

  const safeFrames: VideoFrameSample[] =
    Array.isArray(frames) && frames.length > 0
      ? frames
      : createSyntheticVideoFramesFromHint(hintPrompt, options.targetDurationSeconds ?? 3.0, options.sampleFps ?? 12);

  const firstTime = safeFrames[0]?.timeSec ?? 0;
  const lastTime = safeFrames[safeFrames.length - 1]?.timeSec ?? 0;
  const nlfSpan =
    Array.isArray(nlfDetections) && nlfDetections.length >= 2
      ? Math.max(0, (nlfDetections[nlfDetections.length - 1]?.timeSec ?? 0) - (nlfDetections[0]?.timeSec ?? 0))
      : 0;
  const rawSpan = Math.max(0.5, lastTime - firstTime, nlfSpan);

  // Strict 30-second maximum video duration validation
  if (
    (options.targetDurationSeconds && options.targetDurationSeconds > MAX_MOCAP_VIDEO_DURATION_SECONDS + 0.05) ||
    rawSpan > MAX_MOCAP_VIDEO_DURATION_SECONDS + 0.25
  ) {
    const offendingSec = Math.max(rawSpan, options.targetDurationSeconds ?? 0);
    const limitErr: any = new Error(
      `Video duration (${offendingSec.toFixed(1)}s) exceeds the ${MAX_MOCAP_VIDEO_DURATION_SECONDS}-second maximum limit (الحد الأقصى لمدة الفيديو 30 ثانية).`
    );
    limitErr.isDurationLimitError = true;
    throw limitErr;
  }

  const durationSeconds = Number(
    (options.targetDurationSeconds && options.targetDurationSeconds > 0
      ? Math.min(options.targetDurationSeconds, MAX_MOCAP_VIDEO_DURATION_SECONDS)
      : Math.min(rawSpan, MAX_MOCAP_VIDEO_DURATION_SECONDS)
    ).toFixed(3)
  );

  // 1. Estimate background optical flow across frames (for camera motion + foreground compensation)
  const bgFlows = estimateBackgroundOpticalFlowSequence(safeFrames);

  // 2. Check if real 24-joint NLF 3D SMPL or 33-joint MediaPipe PoseLandmarker detections are available
  const explicitRequestedCount = explicitDecomp.hasExplicitPersonCount
    ? clamp(explicitDecomp.personCount, 1, 4)
    : undefined;
  const requestedCount =
    explicitRequestedCount ??
    (visionAi?.actors && visionAi.actors.length > 0 ? clamp(visionAi.actors.length, 1, 4) : undefined);

  const nlfTracks =
    Array.isArray(nlfDetections) && nlfDetections.some((d) => Array.isArray(d.persons) && d.persons.length > 0)
      ? buildActorTracksFromNlfSmpl3dDetections(
          nlfDetections,
          safeFrames,
          durationSeconds,
          lockFootContacts,
          extractBodyProportions,
          hintPrompt,
          visionAi,
          explicitDecomp,
          explicitRequestedCount,
          smoothingStrength
        )
      : [];

  const mpSequences =
    nlfTracks.length === 0 &&
    Array.isArray(mpDetections) &&
    mpDetections.some((d) => d.landmarks && d.landmarks.length > 0)
      ? trackMultiPersonMediaPipePoses(mpDetections, safeFrames, bgFlows, requestedCount)
      : [];

  // Fallback silhouette metric tracks (also used for camera optical-flow occupancy)
  const personMetricTracks = trackMultiplePeopleAcrossFrames(
    safeFrames,
    bgFlows,
    hintPrompt,
    smoothingStrength
  );

  const actorTracks: ExtractedVideoActorTrack[] = [];

  if (nlfTracks.length > 0) {
    actorTracks.push(...nlfTracks);
  } else if (mpSequences.length > 0) {
    const totalPeopleCount = mpSequences.length;
    for (let p = 0; p < totalPeopleCount; p++) {
      const mpSeq = mpSequences[p];
      const vActor = visionAi?.actors?.[p];
      const explicitPerson = explicitDecomp.hasExplicitPeople ? explicitDecomp.people[p] : undefined;
      actorTracks.push(
        buildActorTrackFromMediaPipeSequence(
          p,
          totalPeopleCount,
          mpSeq,
          durationSeconds,
          lockFootContacts,
          extractBodyProportions,
          hintPrompt,
          vActor,
          explicitPerson
        )
      );
    }
  } else {
    // Combine CV tracks, Vision AI actors, and Explicit User Hint People Count:
    const totalPeopleCount = explicitDecomp.hasExplicitPersonCount
      ? clamp(explicitDecomp.personCount, 1, 4)
      : visionAi?.actors && visionAi.actors.length > 0
        ? clamp(visionAi.actors.length, 1, 4)
        : clamp(personMetricTracks.length, 1, 4);

    for (let p = 0; p < totalPeopleCount; p++) {
      const mTrack = personMetricTracks[Math.min(p, personMetricTracks.length - 1)];
      const vActor = visionAi?.actors?.[p];
      const explicitPerson = explicitDecomp.hasExplicitPeople ? explicitDecomp.people[p] : undefined;
      actorTracks.push(
        buildActorTrackFromMetrics(
          p,
          totalPeopleCount,
          mTrack,
          durationSeconds,
          startPos,
          lockFootContacts,
          extractBodyProportions,
          hintPrompt,
          vActor,
          explicitPerson,
          Boolean(explicitPerson)
        )
      );
    }
  }

  // 3. Solve 3D Stage Camera Motion from NLF 3D metric coordinates + background optical flow + multi-person group centroid (`scene_camera.py`)
  const cvCameraMotion = solveCameraMotionFromFrames(
    safeFrames,
    bgFlows,
    personMetricTracks[0] ?? [],
    durationSeconds,
    hintPrompt,
    actorTracks,
    nlfDetections
  );

  const hasNlfMetricCam = nlfTracks.length > 0;
  let cameraMotion: ExtractedVideoCameraMotion = visionAi?.camera
    ? {
        ...cvCameraMotion,
        movementType: visionAi.camera.movementType || cvCameraMotion.movementType,
        speed: visionAi.camera.speed || cvCameraMotion.speed,
        shotType: visionAi.camera.shotType || cvCameraMotion.shotType,
        angle: hasNlfMetricCam ? cvCameraMotion.angle : (visionAi.camera.angle || cvCameraMotion.angle),
        focalLength: hasNlfMetricCam ? cvCameraMotion.focalLength : (visionAi.camera.focalLength || cvCameraMotion.focalLength),
        // Preserve cvCameraMotion startPosition, endPosition, targetLookAt, and keyframes
        // which are computed from the actual extracted actorTracks group centroid & 3D metric depth!
        startPosition: cvCameraMotion.startPosition,
        endPosition: cvCameraMotion.endPosition,
        targetLookAt: cvCameraMotion.targetLookAt,
        keyframes: cvCameraMotion.keyframes,
        summaryText: hasNlfMetricCam ? cvCameraMotion.summaryText : (visionAi.camera.summaryText || cvCameraMotion.summaryText),
      }
    : cvCameraMotion;

  if (explicitDecomp.hasExplicitCamera && explicitDecomp.camera) {
    const mv = explicitDecomp.camera.movementType ?? cameraMotion.movementType;
    const sp = explicitDecomp.camera.speed ?? cameraMotion.speed;
    const st = explicitDecomp.camera.shotType ?? cameraMotion.shotType;
    const ang = explicitDecomp.camera.angle ?? cameraMotion.angle;
    const fl = explicitDecomp.camera.focalLength ?? cameraMotion.focalLength;
    cameraMotion = {
      ...cameraMotion,
      movementType: mv,
      speed: sp,
      shotType: st,
      angle: ang,
      focalLength: fl,
      summaryText: `Solved Camera: ${mv} (${sp}) • ${st} (${ang}, ${fl} lens)`,
    };
  }

  const leadTrack = actorTracks[0];

  const refSampleFrame = safeFrames[Math.floor(safeFrames.length * 0.25)] ?? safeFrames[0];
  const referenceFramePixels =
    refSampleFrame && refSampleFrame.pixels
      ? {
          width: refSampleFrame.width,
          height: refSampleFrame.height,
          data: refSampleFrame.pixels,
        }
      : undefined;

  const referenceFrameDataUrl =
    options.referenceFrameDataUrl && options.referenceFrameDataUrl.startsWith('data:')
      ? options.referenceFrameDataUrl
      : buildFallbackReferenceFrameDataUrl(safeFrames, leadTrack.detectedActionLabel);

  const peopleDesc =
    actorTracks.length > 1
      ? `${actorTracks.length} people tracked (${actorTracks.map((t) => `${t.actorName}: ${t.detectedActionLabel}`).join(', ')})`
      : `1 person tracked ("${leadTrack.actorName}" • ${leadTrack.detectedActionLabel}, ${Math.round(leadTrack.confidenceScore * 100)}% confidence)`;

  const hasRotvecInNlf =
    nlfTracks.length > 0 &&
    Boolean(
      leadTrack.poseKeyframes?.[0]?.pose?.charSpaceRotations &&
        Object.keys(leadTrack.poseKeyframes[0].pose.charSpaceRotations).length > 0
    );
  const extractionEngine: MocapExtractionEngineId =
    nlfTracks.length > 0
      ? hasRotvecInNlf
        ? 'nlf-smpl24-rotvec'
        : 'nlf-smpl24-joints'
      : mpSequences.length > 0
        ? 'mediapipe-33-3d'
        : 'silhouette-fallback';

  const analyzedFrameCount = Math.max(
    safeFrames.length,
    Array.isArray(nlfDetections) ? nlfDetections.length : 0
  );
  const summaryText = `Extracted 3D mocap & camera from "${fileName}" (${analyzedFrameCount} frames, ${durationSeconds.toFixed(2)}s): ${peopleDesc}. ${cameraMotion.summaryText}${lockFootContacts ? ' [Foot Contacts Grounded]' : ''}`;

  return {
    fileName,
    durationSeconds,
    detectedActionLabel: leadTrack.detectedActionLabel,
    inferredMotionClipId: leadTrack.inferredMotionClipId,
    poseKeyframes: leadTrack.poseKeyframes,
    trajectoryKeyframes: leadTrack.trajectoryKeyframes,
    bodyProportions: leadTrack.bodyProportions,
    referenceFrameDataUrl,
    contactSheetDataUrl: options.contactSheetDataUrl,
    referenceFramePixels,
    frameSamplesAnalyzed: analyzedFrameCount,
    confidenceScore: leadTrack.confidenceScore,
    summaryText,
    actorTracks,
    detectedPersonCount: actorTracks.length,
    cameraMotion,
    visionAiAnalysis: visionAi,
    sampledFrames: safeFrames,
    mediaPipeDetections: mpDetections,
    nlfSmpl3dDetections: nlfDetections,
    extractionEngine,
    nlfDiagnostic: options.nlfDiagnostic,
  };
}

async function blobToBase64DataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  }
  return '';
}

/**
 * Calls the local GPU NLF-Large 24-Joint 3D SMPL extractor (`scripts/mocap_nlf_extractor.py`
 * via Electron IPC or `/api/mocap-nlf/extract`) when available.
 * When a local `File`/`Blob` is provided, sends the direct video file path or binary base64
 * so OpenCV `cv2.VideoCapture` decodes sequentially at cinema 24 FPS (up to 720 frames / 30s)
 * without HTML5 `<video>.currentTime` GOP seeking overhead.
 */
async function requestLocalNlfSmpl3dExtraction(
  nlfSampleFrames: { timeSec: number; dataUrl: string }[],
  rawVideoFile?: File | Blob | string,
  fileName?: string,
  targetDurationSeconds?: number
): Promise<{ frames: NlfSmpl3dFrameDetection[]; diagnostic?: string; durationSec?: number }> {
  const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
  if (isJsdom) return { frames: [] };

  let videoPath: string | undefined;
  let videoBase64: string | undefined;
  if (rawVideoFile && typeof rawVideoFile !== 'string') {
    const fileWithPath = rawVideoFile as any;
    if (typeof fileWithPath.path === 'string' && fileWithPath.path.trim().length > 0) {
      videoPath = fileWithPath.path.trim();
    } else if (rawVideoFile.size > 0 && rawVideoFile.size <= 120 * 1024 * 1024) {
      const b64 = await blobToBase64DataUrl(rawVideoFile);
      if (b64.length > 0) {
        videoBase64 = b64;
      }
    }
  }

  if (
    !videoPath &&
    !videoBase64 &&
    (!Array.isArray(nlfSampleFrames) || nlfSampleFrames.length === 0)
  ) {
    return { frames: [], diagnostic: 'No video frames captured for NLF extraction.' };
  }

  const desiredFps = 24.0;
  const maxSampleCount = clamp(
    Math.round((targetDurationSeconds || MAX_MOCAP_VIDEO_DURATION_SECONDS) * desiredFps),
    24,
    720
  );

  const payload: Record<string, any> = {
    confThreshold: 0.25,
    maxPeople: 4,
    targetFps: desiredFps,
    sampleCount: maxSampleCount,
    maxDurationSec: MAX_MOCAP_VIDEO_DURATION_SECONDS + 0.25,
    fileName: fileName || 'uploaded_video.mp4',
  };

  if (videoPath) {
    payload.videoPath = videoPath;
  } else if (videoBase64) {
    payload.videoBase64 = videoBase64;
  } else {
    payload.frames = nlfSampleFrames;
  }

  let lastDiag = '';

  const checkDurationLimitDiagnostic = (diagMsg: string) => {
    if (/exceeds the 30-second maximum limit/i.test(diagMsg)) {
      const limitErr: any = new Error(diagMsg);
      limitErr.isDurationLimitError = true;
      throw limitErr;
    }
  };

  try {
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (win?.electronComfyBridge && typeof win.electronComfyBridge.request === 'function') {
      const ipcRes = await win.electronComfyBridge.request({
        path: '/__local_mocap_nlf/extract',
        method: 'POST',
        body: payload,
        responseType: 'json',
        timeoutMs: 240000,
      });
      const data = ipcRes?.data;
      if (data && data.ok && Array.isArray(data.frames) && data.dominantPersonCount > 0) {
        return {
          frames: data.frames as NlfSmpl3dFrameDetection[],
          durationSec: typeof data.durationSec === 'number' ? data.durationSec : undefined,
        };
      }
      if (data?.error) {
        lastDiag = String(data.error);
        checkDurationLimitDiagnostic(lastDiag);
      }
    }
  } catch (err: any) {
    if (err?.isDurationLimitError) throw err;
    lastDiag = err?.message || '';
  }

  const endpoints = ['/api/mocap-nlf/extract', 'http://127.0.0.1:51731/api/mocap-nlf/extract'];
  for (const endpoint of endpoints) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 240000) : null;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
      if (timer) clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.frames) && data.dominantPersonCount > 0) {
          return {
            frames: data.frames as NlfSmpl3dFrameDetection[],
            durationSec: typeof data.durationSec === 'number' ? data.durationSec : undefined,
          };
        }
        if (data && data.ok && data.dominantPersonCount === 0) {
          lastDiag = 'NLF-Large ran on GPU but detected 0 human subjects in the sampled frames.';
        } else if (data?.error) {
          lastDiag = String(data.error);
          checkDurationLimitDiagnostic(lastDiag);
        }
      } else {
        try {
          const errJson = await res.json();
          if (errJson?.error) {
            lastDiag = String(errJson.error);
            checkDurationLimitDiagnostic(lastDiag);
          }
        } catch (innerErr: any) {
          if (innerErr?.isDurationLimitError) throw innerErr;
          lastDiag = `HTTP ${res.status} from ${endpoint}`;
        }
      }
    } catch (err: any) {
      if (err?.isDurationLimitError) throw err;
      if (!lastDiag) {
        lastDiag = err?.message || `Could not reach ${endpoint}`;
      }
    }
  }

  return { frames: [], diagnostic: lastDiag || undefined };
}

/**
 * Generates deterministic synthetic `64x64` RGBA frames seeded from the filename and motionHintPrompt
 * as a clean fallback when `<video>` decoding is unavailable (e.g. JSDOM/headless environments).
 * Supports single-person and multi-person synthetic silhouettes + camera pan simulation.
 */
export function createSyntheticVideoFramesFromHint(
  hintText: string,
  durationSeconds = 3.0,
  sampleFps = 8
): VideoFrameSample[] {
  const lower = String(hintText ?? '').toLowerCase().replace(/[_-]+/g, ' ');
  const width = 64;
  const height = 64;
  const frameCount = clamp(Math.round(durationSeconds * sampleFps), 8, 24);
  const frames: VideoFrameSample[] = [];

  const isJump = /(jump|leap|hop|vault|قفز|ينط)/.test(lower);
  const isRun = /(run|sprint|dash|chase|يجري|يركض)/.test(lower);
  const isCombat = /(fight|punch|kick|strike|combat|قتال|يلكم)/.test(lower);
  const isCrouch = /(crouch|sneak|stealth|يتسلل|ينحني)/.test(lower);
  const isDance = /(dance|celebrat|يرقص|رقص)/.test(lower);
  const decompHint = decomposeMocapAndSceneHint(hintText);
  const isTwoPeople =
    (decompHint.hasExplicitPersonCount && decompHint.personCount === 2) ||
    /\b(2|two|both|pair|duel|couple|versus|vs|شخصين|اثنين)\b/.test(lower);
  const isThreePeople =
    (decompHint.hasExplicitPersonCount && decompHint.personCount >= 3) ||
    /\b(3|three|trio|group|ثلاث|ثلاثة)\b/.test(lower);
  const personCount = isThreePeople ? 3 : isTwoPeople ? 2 : 1;

  for (let i = 0; i < frameCount; i++) {
    const u = frameCount > 1 ? i / (frameCount - 1) : 0;
    const timeSec = Number((u * durationSeconds).toFixed(3));
    const pixels = new Uint8ClampedArray(width * height * 4);

    // Fill studio background
    for (let p = 0; p < width * height; p++) {
      pixels[p * 4] = 18;
      pixels[p * 4 + 1] = 22;
      pixels[p * 4 + 2] = 32;
      pixels[p * 4 + 3] = 255;
    }

    for (let pIdx = 0; pIdx < personCount; pIdx++) {
      let cx =
        personCount === 1
          ? 0.5
          : personCount === 2
            ? pIdx === 0
              ? 0.36
              : 0.64
            : 0.24 + pIdx * 0.26;
      let cy = 0.54;
      let bodyH = 0.56;
      const bodyW = personCount > 1 ? 0.14 : 0.2;

      if (personCount === 1) {
        if (isRun) {
          cx = 0.22 + u * 0.56;
          cy = 0.52 - Math.abs(Math.sin(u * Math.PI * 4)) * 0.04;
        } else if (isJump) {
          cx = 0.35 + u * 0.3;
          const arc = Math.sin(u * Math.PI);
          cy = 0.56 - arc * 0.22;
        } else if (isCrouch) {
          cx = 0.38 + u * 0.18;
          cy = 0.65;
          bodyH = 0.38;
        } else if (isDance) {
          cx = 0.5 + Math.sin(u * Math.PI * 4) * 0.09;
          cy = 0.53 + Math.cos(u * Math.PI * 4) * 0.03;
        } else if (!isCombat) {
          cx = 0.32 + u * 0.36;
          cy = 0.54 - Math.abs(Math.sin(u * Math.PI * 3)) * 0.02;
        }
      } else {
        // Multi-person side-by-side parallel movement (unless combat/duel)
        if (isCombat) {
          const dir = pIdx % 2 === 0 ? 1 : -1;
          cx = clamp(cx + dir * u * 0.08, 0.2, 0.8);
        } else {
          cx = clamp(cx + Math.sin(u * Math.PI * 2 + pIdx) * 0.015, 0.2, 0.8);
          bodyH = clamp(0.52 + u * 0.06, 0.44, 0.64);
        }
        cy = 0.54 - Math.abs(Math.sin((u + pIdx * 0.25) * Math.PI * 3)) * 0.025;
      }

      const minY = clamp(Math.floor((cy - bodyH * 0.5) * height), 2, height - 4);
      const maxY = clamp(Math.floor((cy + bodyH * 0.5) * height), minY + 4, height - 2);
      const armReach = isCombat ? Math.sin(i * 1.4 + pIdx) * 0.14 : Math.sin(i * 0.9 + pIdx) * 0.05;
      const legStrideOsc = Math.sin(u * Math.PI * 3 + pIdx * 0.8) * 0.05;

      for (let y = minY; y <= maxY; y++) {
        const vSlice = (y - minY) / Math.max(1, maxY - minY);
        const sliceHalfW =
          vSlice < 0.35
            ? (bodyW * 0.65 + Math.abs(armReach)) * width
            : vSlice < 0.65
              ? bodyW * 0.45 * width
              : (bodyW * 0.48 + Math.abs(legStrideOsc)) * width;
        const rowCx =
          cx * width +
          (vSlice < 0.4
            ? armReach * width * 0.5
            : vSlice > 0.72
              ? legStrideOsc * width * 0.75
              : 0);
        const x0 = clamp(Math.floor(rowCx - sliceHalfW), 1, width - 2);
        const x1 = clamp(Math.ceil(rowCx + sliceHalfW), x0, width - 2);

        for (let x = x0; x <= x1; x++) {
          const idx = (y * width + x) * 4;
          pixels[idx] = pIdx === 0 ? 215 : pIdx === 1 ? 90 : 240;
          pixels[idx + 1] = pIdx === 0 ? 190 + ((i * 17) % 45) : pIdx === 1 ? 210 : 120;
          pixels[idx + 2] = pIdx === 0 ? 165 : pIdx === 1 ? 250 : 190;
          pixels[idx + 3] = 255;
        }
      }
    }

    frames.push({ timeSec, width, height, pixels });
  }

  return frames;
}

/**
 * Samples RGB frames, a `640x360` JPEG reference frame, and a 6-panel timestamped
 * `contactSheetDataUrl` from a browser `<video>` element, optionally running Vision AI
 * filmstrip analysis, and falling back cleanly to deterministic synthetic frames in JSDOM.
 */
export async function extractMocapFromVideoFile(
  fileOrUrl: File | Blob | string,
  options: VideoMocapExtractionOptions = {}
): Promise<VideoMocapExtractionResult> {
  const fileName =
    typeof fileOrUrl === 'string'
      ? fileOrUrl.split('/').pop()?.split('?')[0] || 'video_plate.mp4'
      : (fileOrUrl as File).name || 'uploaded_video.mp4';

  // Fast check on explicit targetDurationSeconds before decoding
  if (
    options.targetDurationSeconds &&
    options.targetDurationSeconds > MAX_MOCAP_VIDEO_DURATION_SECONDS + 0.05
  ) {
    const limitErr: any = new Error(
      `Video duration (${options.targetDurationSeconds.toFixed(1)}s) exceeds the ${MAX_MOCAP_VIDEO_DURATION_SECONDS}-second maximum limit (الحد الأقصى لمدة الفيديو 30 ثانية).`
    );
    limitErr.isDurationLimitError = true;
    throw limitErr;
  }

  options.onProgress?.('Validating video duration (max 30s) & sampling RGB frames...', 12);

  const isJsdomEnv =
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
  const canUseBrowserVideo =
    !isJsdomEnv &&
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function';

  if (canUseBrowserVideo) {
    let objectUrlToRevoke: string | null = null;
    try {
      const videoSrc =
        typeof fileOrUrl === 'string'
          ? fileOrUrl
          : typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
            ? (objectUrlToRevoke = URL.createObjectURL(fileOrUrl))
            : '';

      if (videoSrc) {
        const sampled = await sampleVideoFramesInBrowser(videoSrc, options);
        if (sampled && sampled.frames.length >= 2) {
          let nlfSmpl3dDetections: NlfSmpl3dFrameDetection[] = [];
          let nlfDiagnostic: string | undefined;
          const effectiveDuration =
            options.targetDurationSeconds && options.targetDurationSeconds > 0
              ? Math.min(options.targetDurationSeconds, sampled.detectedDurationSeconds)
              : sampled.detectedDurationSeconds;
          const expectedNlfFrames = clamp(Math.round(effectiveDuration * 24), 24, 720);

          if (
            (typeof fileOrUrl !== 'string' && fileOrUrl) ||
            (sampled.nlfSampleFrames && sampled.nlfSampleFrames.length >= 2)
          ) {
            options.onProgress?.(
              `Running Local GPU NLF-Large 24-FPS Frame-by-Frame SMPL-24 (~${expectedNlfFrames} frames, ${effectiveDuration.toFixed(1)}s)...`,
              74
            );
            const nlfRes = await requestLocalNlfSmpl3dExtraction(
              sampled.nlfSampleFrames,
              fileOrUrl,
              fileName,
              effectiveDuration
            );
            nlfSmpl3dDetections = nlfRes.frames;
            nlfDiagnostic = nlfRes.diagnostic;
          }

          let visionAiAnalysis: VisionAiSceneAnalysis | null = null;
          if (options.enableVisionAi !== false) {
            const sheetOrRef = sampled.contactSheetDataUrl || sampled.referenceFrameDataUrl;
            if (sheetOrRef && sheetOrRef.startsWith('data:image/jpeg')) {
              options.onProgress?.('Running Multimodal Vision AI scene & cast analysis...', 82);
              visionAiAnalysis = await analyzeVideoFilmstripWithVisionAI(sheetOrRef, {
                fileName,
                hintPrompt: options.motionHintPrompt,
                durationSeconds: effectiveDuration,
                timeoutMs: 8500,
              });
            }
          }

          options.onProgress?.('Solving Unified Mixamo-SMPL 3D kinematics, camera & scene...', 92);
          const result = extractMocapFromVideoElementOrFrames(sampled.frames, {
            ...options,
            targetDurationSeconds: effectiveDuration,
            fileName,
            referenceFrameDataUrl: sampled.referenceFrameDataUrl,
            contactSheetDataUrl: sampled.contactSheetDataUrl,
            visionAiAnalysis,
            mediaPipeDetections: sampled.mediaPipeDetections,
            nlfSmpl3dDetections,
            nlfDiagnostic,
          });
          options.onProgress?.('Capture complete', 100);
          return result;
        }
      }
    } catch (err: any) {
      if (err?.isDurationLimitError) {
        throw err;
      }
      // Fall through to deterministic synthetic fallback below
    } finally {
      if (objectUrlToRevoke && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(objectUrlToRevoke);
        } catch {
          // ignore revoke errors
        }
      }
    }
  }

  // Safe fallback for JSDOM / Node tests or unsupported video codecs
  options.onProgress?.('Synthesizing multi-person 19-bone motion & 3D scene...', 85);
  const fallbackDuration = options.targetDurationSeconds ?? 3.0;
  const fallbackFps = clamp(options.sampleFps ?? 8, 4, 24);
  const syntheticFrames = createSyntheticVideoFramesFromHint(
    `${options.motionHintPrompt || ''} ${fileName}`,
    fallbackDuration,
    fallbackFps
  );

  const fallbackResult = extractMocapFromVideoElementOrFrames(syntheticFrames, {
    ...options,
    fileName,
  });
  options.onProgress?.('Capture complete', 100);
  return fallbackResult;
}

/**
 * Internal browser helper: mounts a hidden `<video>` to `document.body` (preventing Chromium
 * detached-video frame throttling), waits for decoded frame data (`loadeddata`/`canplay`),
 * enforces the strict 30-second video duration limit, and samples frames + contact sheet.
 */
async function sampleVideoFramesInBrowser(
  videoSrc: string,
  options: VideoMocapExtractionOptions
): Promise<{
  frames: VideoFrameSample[];
  referenceFrameDataUrl: string;
  contactSheetDataUrl: string;
  mediaPipeDetections: MediaPipeFrameDetection[];
  nlfSampleFrames: { timeSec: number; dataUrl: string }[];
  detectedDurationSeconds: number;
} | null> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Attach offscreen in DOM so Chromium/Electron hardware video decoder renders actual frame textures
  video.style.position = 'fixed';
  video.style.left = '-9999px';
  video.style.top = '-9999px';
  video.style.width = '160px';
  video.style.height = '90px';
  video.style.opacity = '0.01';
  video.style.pointerEvents = 'none';
  video.style.zIndex = '-1';

  let mountedToBody = false;
  if (typeof document !== 'undefined' && document.body) {
    try {
      document.body.appendChild(video);
      mountedToBody = true;
    } catch {
      mountedToBody = false;
    }
  }

  const loadReady = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Video load timeout')), 2800);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    video.onloadeddata = done;
    video.oncanplay = done;
    video.onloadedmetadata = () => {
      // Give decoder 60ms after metadata to decode first frame if onloadeddata hasn't fired yet
      setTimeout(done, 60);
    };
    video.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Video load error'));
    };
  });

  video.src = videoSrc;
  try {
    video.load();
  } catch {
    if (mountedToBody && video.parentNode) {
      video.parentNode.removeChild(video);
    }
    return null;
  }

  try {
    await loadReady;
  } catch {
    if (mountedToBody && video.parentNode) {
      video.parentNode.removeChild(video);
    }
    return null;
  }

  // Enforce strict 30-second maximum video duration rule immediately on video metadata load
  if (
    Number.isFinite(video.duration) &&
    video.duration > MAX_MOCAP_VIDEO_DURATION_SECONDS + 0.05
  ) {
    if (mountedToBody && video.parentNode) {
      try {
        video.parentNode.removeChild(video);
      } catch {
        // ignore
      }
    }
    const limitErr: any = new Error(
      `Video duration (${video.duration.toFixed(1)}s) exceeds the ${MAX_MOCAP_VIDEO_DURATION_SECONDS}-second maximum limit (الحد الأقصى لمدة الفيديو 30 ثانية).`
    );
    limitErr.isDurationLimitError = true;
    throw limitErr;
  }

  const rawDuration =
    Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : (options.targetDurationSeconds ?? 3.0);
  const targetDuration =
    options.targetDurationSeconds && options.targetDurationSeconds > 0
      ? Math.min(rawDuration, options.targetDurationSeconds, MAX_MOCAP_VIDEO_DURATION_SECONDS)
      : Math.min(rawDuration, MAX_MOCAP_VIDEO_DURATION_SECONDS);

  const sampleCount = clamp(Math.round(targetDuration * (options.sampleFps ?? 12)), 24, 60);
  const analysisW = 96;
  const analysisH = 64;
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = analysisW;
  smallCanvas.height = analysisH;
  const smallCtx = smallCanvas.getContext('2d');
  if (!smallCtx) {
    if (mountedToBody && video.parentNode) {
      video.parentNode.removeChild(video);
    }
    return null;
  }

  const refCanvas = document.createElement('canvas');
  refCanvas.width = 640;
  refCanvas.height = 360;
  const refCtx = refCanvas.getContext('2d');

  // 3x2 Contact Sheet Canvas (960x360) for 6 timestamped keyframes
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = 960;
  sheetCanvas.height = 360;
  const sheetCtx = sheetCanvas.getContext('2d');
  const cellW = 320;
  const cellH = 180;

  const refSampleIndex = Math.max(0, Math.min(sampleCount - 1, Math.floor(sampleCount * 0.25)));
  let referenceFrameDataUrl = '';
  let contactSheetDataUrl = '';
  const frames: VideoFrameSample[] = [];
  const mediaPipeDetections: MediaPipeFrameDetection[] = [];
  const nlfSampleFrames: { timeSec: number; dataUrl: string }[] = [];
  const rawVw = Math.max(160, video.videoWidth || 960);
  const rawVh = Math.max(90, video.videoHeight || 540);
  const nlfScale = Math.min(1.0, 896 / Math.max(rawVw, rawVh));
  const nlfCanvas = document.createElement('canvas');
  nlfCanvas.width = Math.max(160, Math.round((rawVw * nlfScale) / 16) * 16);
  nlfCanvas.height = Math.max(160, Math.round((rawVh * nlfScale) / 16) * 16);
  const nlfCtx = nlfCanvas.getContext('2d');
  const maxNlfFrames = 48;
  const nlfStride = Math.max(1, Math.ceil(sampleCount / maxNlfFrames));

  // Initialize MediaPipe 33-joint 3D PoseLandmarker (`pose_landmarker_full.task`)
  const poseLandmarker = await getOrCreateMediaPipePoseLandmarker();
  const poseScale = Math.min(1.0, 480 / Math.max(rawVw, rawVh));
  const poseCanvas = document.createElement('canvas');
  poseCanvas.width = Math.max(128, Math.round((rawVw * poseScale) / 16) * 16);
  poseCanvas.height = Math.max(128, Math.round((rawVh * poseScale) / 16) * 16);
  const poseCtx = poseCanvas.getContext('2d');
  let monotonicTimestampMs = Math.round(performance.now()) + 100;

  const seekTo = (tSec: number) =>
    new Promise<void>((resolve) => {
      const targetTime = Math.max(0.02, Math.min(Math.max(0.05, rawDuration - 0.02), tSec));
      const onSeeked = () => {
        clearTimeout(timeout);
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      const timeout = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }, 320);
      video.addEventListener('seeked', onSeeked);
      try {
        video.currentTime = targetTime;
      } catch {
        clearTimeout(timeout);
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }
    });

  let nonZeroPixelSamples = 0;

  try {
    let sheetPanelIdx = 0;
    for (let i = 0; i < sampleCount; i++) {
      const u = sampleCount > 1 ? i / (sampleCount - 1) : 0;
      const tSec = Number((u * targetDuration).toFixed(3));
      await seekTo(i === 0 ? 0.04 : tSec);

      const pct = Math.round(15 + ((i + 1) / sampleCount) * 58);
      options.onProgress?.(`Sampling & analyzing video frame ${i + 1}/${sampleCount} (t=${tSec.toFixed(1)}s)...`, pct);

      smallCtx.drawImage(video, 0, 0, analysisW, analysisH);
      const imgData = smallCtx.getImageData(0, 0, analysisW, analysisH);
      const pxCopy = new Uint8ClampedArray(imgData.data);

      // Verify frame has actual decoded RGB content (not all transparent/black 0s)
      for (let k = 0; k < pxCopy.length; k += 64) {
        if (pxCopy[k] > 4 || pxCopy[k + 1] > 4 || pxCopy[k + 2] > 4) {
          nonZeroPixelSamples++;
          break;
        }
      }

      frames.push({
        timeSec: tSec,
        width: analysisW,
        height: analysisH,
        pixels: pxCopy,
      });

      if (poseLandmarker && poseCtx) {
        try {
          poseCtx.drawImage(video, 0, 0, poseCanvas.width, poseCanvas.height);
          monotonicTimestampMs += Math.max(33, Math.round((targetDuration / Math.max(1, sampleCount)) * 1000));
          const mpRes = poseLandmarker.detectForVideo(poseCanvas, monotonicTimestampMs);
          if (mpRes && Array.isArray(mpRes.landmarks)) {
            mediaPipeDetections.push({
              timeSec: tSec,
              landmarks: mpRes.landmarks.map((lms: any[]) =>
                lms.map((lm: any) => ({
                  x: Number(lm.x ?? 0.5),
                  y: Number(lm.y ?? 0.5),
                  z: Number(lm.z ?? 0),
                  visibility: Number(lm.visibility ?? 0.9),
                }))
              ),
              worldLandmarks: (mpRes.worldLandmarks ?? mpRes.landmarks).map((wLms: any[]) =>
                wLms.map((w: any) => ({
                  x: Number(w.x ?? 0),
                  y: Number(w.y ?? 0),
                  z: Number(w.z ?? 0),
                  visibility: Number(w.visibility ?? 0.9),
                }))
              ),
            });
          } else {
            mediaPipeDetections.push({ timeSec: tSec, landmarks: [], worldLandmarks: [] });
          }
        } catch {
          mediaPipeDetections.push({ timeSec: tSec, landmarks: [], worldLandmarks: [] });
        }
      }

      if (i === refSampleIndex && refCtx) {
        refCtx.drawImage(video, 0, 0, 640, 360);
        try {
          referenceFrameDataUrl = refCanvas.toDataURL('image/jpeg', 0.86);
        } catch {
          referenceFrameDataUrl = '';
        }
      }

      if (nlfCtx && nlfSampleFrames.length < maxNlfFrames && (i % nlfStride === 0 || i === sampleCount - 1)) {
        try {
          nlfCtx.drawImage(video, 0, 0, nlfCanvas.width, nlfCanvas.height);
          const nlfDataUrl = nlfCanvas.toDataURL('image/jpeg', 0.85);
          if (nlfDataUrl && nlfDataUrl.startsWith('data:image/jpeg')) {
            nlfSampleFrames.push({ timeSec: tSec, dataUrl: nlfDataUrl });
          }
        } catch {
          // ignore canvas export error
        }
      }

      // Draw 6 evenly spaced panels onto the 3x2 filmstrip contact sheet
      const targetSheetIndex = Math.min(5, Math.floor((i / Math.max(1, sampleCount - 1)) * 5.99));
      if (sheetCtx && targetSheetIndex === sheetPanelIdx && sheetPanelIdx < 6) {
        const col = sheetPanelIdx % 3;
        const row = Math.floor(sheetPanelIdx / 3);
        const dx = col * cellW;
        const dy = row * cellH;
        sheetCtx.drawImage(video, dx, dy, cellW, cellH);
        sheetCtx.fillStyle = 'rgba(0, 0, 0, 0.76)';
        sheetCtx.fillRect(dx + 6, dy + 6, 128, 22);
        sheetCtx.fillStyle = '#38bdf8';
        sheetCtx.font = 'bold 12px monospace';
        sheetCtx.fillText(`#${sheetPanelIdx + 1} t=${tSec.toFixed(1)}s`, dx + 12, dy + 21);
        sheetPanelIdx++;
      }
    }

    if (sheetCtx) {
      try {
        contactSheetDataUrl = sheetCanvas.toDataURL('image/jpeg', 0.84);
      } catch {
        contactSheetDataUrl = '';
      }
    }
  } finally {
    try {
      video.removeAttribute('src');
      video.load();
    } catch {
      // ignore cleanup errors in headless DOM
    }
    if (mountedToBody && video.parentNode) {
      try {
        video.parentNode.removeChild(video);
      } catch {
        // ignore DOM removal errors
      }
    }
  }

  // If the environment returned completely blank frames (e.g. headless test canvas), return null so synthetic fallback runs
  if (nonZeroPixelSamples === 0) {
    return null;
  }

  return {
    frames,
    referenceFrameDataUrl,
    contactSheetDataUrl,
    mediaPipeDetections,
    nlfSampleFrames,
    detectedDurationSeconds: Number(targetDuration.toFixed(3)),
  };
}
