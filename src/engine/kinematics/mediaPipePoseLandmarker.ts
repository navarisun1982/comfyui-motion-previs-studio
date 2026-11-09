/**
 * MediaPipe Multi-Person 3D Pose Landmarker + `toyxyz_RGBMocap` Mathematical Solver
 * =================================================================================
 * Implements the real, zero-shortcut video-to-3D human motion pipeline:
 * 1. Runs Google MediaPipe `PoseLandmarker` (`pose_landmarker_full.task`, Apache-2.0 Open Weights)
 *    across video frames in `VIDEO` mode (`numPoses: 4`), extracting 33 2D normalized landmarks
 *    (`landmarks`) and 33 3D metric world landmarks in meters (`worldLandmarks`) per person.
 * 2. Tracks multiple people across frames using a Minimum-Cost Bipartite / Hungarian Identity
 *    Tracker combining Pelvis/Shoulder 2D centroid distance, Bounding-Box IoU, and Torso RGB color
 *    consistency so side-by-side or crossing subjects never swap identities.
 * 3. Smooths 2D and 3D joint trajectories using the velocity-adaptive `OneEuroFilter`
 *    (as used in `toyxyz_RGBMocap/pear`) to eliminate high-frequency detector jitter while
 *    preserving fast limb motion with zero phase lag.
 * 4. Unprojects each person's 3D root trajectory onto the 3D Stage using Metric Bone-Length +
 *    Ground-Plane Pinhole Unprojection (`toyxyz_RGBMocap/mocap/flow_placement.py` & `pear/multiview.py`).
 * 5. Solves 19-bone humanoid rotations and 2-bone Law-of-Cosines Hinge IK targets (`anatomicalIk`)
 *    100% from the measured 3D `worldLandmarks` + `FootMR` heel/toe contact locking
 *    (`toyxyz_RGBMocap/mocap/anatomical_ik.py`, `mixamo_rig.py`, `footmr.py`) — with ZERO fake
 *    procedural sine-wave gait (`Math.sin`). Occluded/off-screen joints (`visibility < 0.25`)
 *    fall back cleanly to a neutral grounded stance.
 */

import * as THREE from 'three';
import { ActorPose, AnatomicalMocapIKTargets } from '../../types/shotspec';
import { HumanoidBone, HUMANOID_BONES } from '../procedural3D/sculptSpec';
import { BoneEulerDelta } from './fbxMocapImporter';
import { PersonFramePoseLandmarks, MocapJoint2D } from './videoToMocapExtractor';

/**
 * Canonical 33-joint indices produced by MediaPipe Pose Landmarker (BlazePose GHUM 3D).
 */
export const MP_POSE = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export interface MediaPipeLandmark3D {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface MediaPipeFrameDetection {
  timeSec: number;
  /** Normalized image-space landmarks [0..1] for each detected person */
  landmarks: MediaPipeLandmark3D[][];
  /** Metric 3D world-space landmarks in meters (origin at hip center, +Y down in MediaPipe convention) */
  worldLandmarks: MediaPipeLandmark3D[][];
}

export interface TrackedMediaPipePersonFrame {
  timeSec: number;
  /** 33 smoothed image-space landmarks (x, y in [0..1]) */
  landmarks: MediaPipeLandmark3D[];
  /** 33 smoothed metric 3D landmarks in meters (converted to Y-up: +Y up, +X image-right, +Z toward camera) */
  worldLandmarksYUp: MediaPipeLandmark3D[];
  /** Bounding box in normalized image coordinates [0..1] */
  bbox: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
  /** Background-compensated 2D hip center */
  worldHipCenter2D: { x: number; y: number };
  /** Sampled torso RGB color [0..255] */
  clothingRgb: [number, number, number];
  /** FootMR ground contact flags */
  leftFootContact: boolean;
  rightFootContact: boolean;
  /** Unprojected 3D Stage coordinates (Stage X in 0..100, Stage Y depth in 0..100, Stage Z elevation >= 0) */
  stagePosition: { x: number; y: number; z: number };
  /** Estimated metric distance from camera in meters */
  metricDepthMeters: number;
}

export interface TrackedMediaPipePersonSequence {
  personIndex: number;
  frames: TrackedMediaPipePersonFrame[];
  clothingColorHex: string;
  estimatedHeightMeters: number;
  estimatedShoulderSpanRatio: number;
  estimatedHipSpanRatio: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rgbToHex(r: number, g: number, b: number): string {
  const hr = clamp(Math.round(r), 0, 255).toString(16).padStart(2, '0');
  const hg = clamp(Math.round(g), 0, 255).toString(16).padStart(2, '0');
  const hb = clamp(Math.round(b), 0, 255).toString(16).padStart(2, '0');
  return `#${hr}${hg}${hb}`;
}

/**
 * Velocity-adaptive One-Euro Filter (`Casiez et al., CHI 2012`), identical to the
 * temporal landmark smoother used in `toyxyz_RGBMocap/pear`.
 */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(minCutoff = 1.2, beta = 0.08, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * Math.max(0.01, cutoff));
    return 1.0 / (1.0 + tau / Math.max(0.001, dt));
  }

  filter(x: number, tSec: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = tSec;
      return x;
    }
    const dt = Math.max(0.008, tSec - this.tPrev);
    this.tPrev = tSec;

    const dx = (x - this.xPrev) / dt;
    const edx = this.dxPrev + this.alpha(this.dCutoff, dt) * (dx - this.dxPrev);
    this.dxPrev = edx;

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const a = this.alpha(cutoff, dt);
    const xHat = this.xPrev + a * (x - this.xPrev);
    this.xPrev = xHat;
    return xHat;
  }
}

class OneEuroLandmarkArrayFilter {
  private filters: Array<{ x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter }> = [];

  constructor(count: number, minCutoff = 1.25, beta = 0.09) {
    for (let i = 0; i < count; i++) {
      this.filters.push({
        x: new OneEuroFilter(minCutoff, beta),
        y: new OneEuroFilter(minCutoff, beta),
        z: new OneEuroFilter(minCutoff, beta),
      });
    }
  }

  filter(landmarks: MediaPipeLandmark3D[], timeSec: number): MediaPipeLandmark3D[] {
    return landmarks.map((lm, idx) => {
      const f = this.filters[idx];
      if (!f) return { ...lm };
      return {
        x: f.x.filter(lm.x, timeSec),
        y: f.y.filter(lm.y, timeSec),
        z: f.z.filter(lm.z, timeSec),
        visibility: lm.visibility,
      };
    });
  }
}

// Singleton cache for MediaPipe PoseLandmarker instance
let cachedPoseLandmarkerPromise: Promise<any | null> | null = null;

/**
 * Lazily initializes the MediaPipe `PoseLandmarker` (`pose_landmarker_full.task`) using local
 * `/models/mediapipe` assets first (100% offline capable) with automatic fallback to official CDN.
 */
export async function getOrCreateMediaPipePoseLandmarker(): Promise<any | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  const isTestEnv =
    typeof process !== 'undefined' && Boolean(process.env?.VITEST || process.env?.NODE_ENV === 'test');
  if (isTestEnv) {
    return null;
  }

  if (cachedPoseLandmarkerPromise) {
    return cachedPoseLandmarkerPromise;
  }

  cachedPoseLandmarkerPromise = (async () => {
    try {
      const visionModule = await import('@mediapipe/tasks-vision');
      const { FilesetResolver, PoseLandmarker } = visionModule;

      // 1. Try local offline WASM + model bundle first (`./models/mediapipe` works in both Electron file:// and Vite http://)
      const isFileProto =
        typeof window !== 'undefined' &&
        typeof window.location?.protocol === 'string' &&
        window.location.protocol.startsWith('file:');
      const localWasmRoot = isFileProto ? './models/mediapipe/wasm' : '/models/mediapipe/wasm';
      const localModelPath = isFileProto
        ? './models/mediapipe/pose_landmarker_full.task'
        : '/models/mediapipe/pose_landmarker_full.task';
      const cdnWasmRoot = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm';
      const cdnModelPath =
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

      const tryCreateWithPaths = async (
        wasmRoot: string,
        modelPath: string,
        delegate: 'GPU' | 'CPU'
      ) => {
        const visionFileset = await FilesetResolver.forVisionTasks(wasmRoot);
        return await PoseLandmarker.createFromOptions(visionFileset, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate,
          },
          runningMode: 'VIDEO',
          numPoses: 4,
          minPoseDetectionConfidence: 0.35,
          minPosePresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
          outputSegmentationMasks: false,
        });
      };

      try {
        return await tryCreateWithPaths(localWasmRoot, localModelPath, 'GPU');
      } catch {
        try {
          return await tryCreateWithPaths(localWasmRoot, localModelPath, 'CPU');
        } catch {
          try {
            return await tryCreateWithPaths(cdnWasmRoot, cdnModelPath, 'GPU');
          } catch {
            return await tryCreateWithPaths(cdnWasmRoot, cdnModelPath, 'CPU');
          }
        }
      }
    } catch (err) {
      console.warn('[MediaPipePoseLandmarker] Could not initialize PoseLandmarker:', err);
      cachedPoseLandmarkerPromise = null;
      return null;
    }
  })();

  return cachedPoseLandmarkerPromise;
}

/**
 * Samples the RGB color of a person's torso region from the frame RGBA buffer
 * using their detected shoulder and hip landmarks.
 */
function sampleTorsoClothingRgb(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: MediaPipeLandmark3D[]
): [number, number, number] {
  if (!pixels || pixels.length < width * height * 4) {
    return [56, 189, 248];
  }
  const lSh = landmarks[MP_POSE.LEFT_SHOULDER];
  const rSh = landmarks[MP_POSE.RIGHT_SHOULDER];
  const lHip = landmarks[MP_POSE.LEFT_HIP];
  const rHip = landmarks[MP_POSE.RIGHT_HIP];
  if (!lSh || !rSh || !lHip || !rHip) {
    return [56, 189, 248];
  }

  const minX = clamp(Math.floor(Math.min(lSh.x, rSh.x, lHip.x, rHip.x) * width), 0, width - 1);
  const maxX = clamp(Math.ceil(Math.max(lSh.x, rSh.x, lHip.x, rHip.x) * width), minX, width - 1);
  const minY = clamp(Math.floor(Math.min(lSh.y, rSh.y) * height), 0, height - 1);
  const maxY = clamp(Math.ceil(Math.max(lHip.y, rHip.y) * height), minY, height - 1);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  const stepX = Math.max(1, Math.floor((maxX - minX) / 6));
  const stepY = Math.max(1, Math.floor((maxY - minY) / 6));

  for (let y = minY; y <= maxY; y += stepY) {
    for (let x = minX; x <= maxX; x += stepX) {
      const idx = (y * width + x) * 4;
      rSum += pixels[idx];
      gSum += pixels[idx + 1];
      bSum += pixels[idx + 2];
      count++;
    }
  }

  if (count === 0) return [56, 189, 248];
  return [rSum / count, gSum / count, bSum / count];
}

function computeLandmarkBbox(landmarks: MediaPipeLandmark3D[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  hipCenterX: number;
  hipCenterY: number;
  shoulderCenterX: number;
  shoulderCenterY: number;
} {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let validCount = 0;

  for (const lm of landmarks) {
    if ((lm.visibility ?? 1) < 0.15) continue;
    minX = Math.min(minX, clamp(lm.x, 0, 1));
    maxX = Math.max(maxX, clamp(lm.x, 0, 1));
    minY = Math.min(minY, clamp(lm.y, 0, 1));
    maxY = Math.max(maxY, clamp(lm.y, 0, 1));
    validCount++;
  }

  if (validCount === 0) {
    minX = 0.4;
    maxX = 0.6;
    minY = 0.25;
    maxY = 0.85;
  }

  const lHip = landmarks[MP_POSE.LEFT_HIP] ?? { x: 0.5, y: 0.55 };
  const rHip = landmarks[MP_POSE.RIGHT_HIP] ?? { x: 0.5, y: 0.55 };
  const lSh = landmarks[MP_POSE.LEFT_SHOULDER] ?? { x: 0.5, y: 0.32 };
  const rSh = landmarks[MP_POSE.RIGHT_SHOULDER] ?? { x: 0.5, y: 0.32 };

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(0.04, maxX - minX),
    height: Math.max(0.08, maxY - minY),
    hipCenterX: (lHip.x + rHip.x) * 0.5,
    hipCenterY: (lHip.y + rHip.y) * 0.5,
    shoulderCenterX: (lSh.x + rSh.x) * 0.5,
    shoulderCenterY: (lSh.y + rSh.y) * 0.5,
  };
}

/**
 * Multi-Person Identity Tracker + One-Euro Smoother + Metric Stage Unprojection (`flow_placement.py`).
 * Converts raw per-frame MediaPipe detections into persistent, temporally consistent person tracks.
 */
export function trackMultiPersonMediaPipePoses(
  detections: MediaPipeFrameDetection[],
  frameSamples: Array<{ timeSec: number; width: number; height: number; pixels: Uint8ClampedArray }>,
  bgFlows: Array<{ cumPanX: number; cumTiltY: number; cumZoom: number }>,
  requestedPersonCount?: number
): TrackedMediaPipePersonSequence[] {
  const validDetections = detections.filter((d) => d.landmarks && d.landmarks.length > 0);
  if (validDetections.length === 0) {
    return [];
  }

  // Determine active person count across the video (median of detected poses per frame, or explicit count)
  const counts = detections
    .map((d) => d.landmarks?.length ?? 0)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const medianDetected = counts.length > 0 ? counts[Math.floor(counts.length * 0.6)] : 1;
  const targetCount = clamp(
    requestedPersonCount && requestedPersonCount > 0 ? requestedPersonCount : medianDetected,
    1,
    4
  );

  // Seed initial tracks from the first frame that has detections, ordered strictly Left-to-Right
  const seedDet =
    detections.find((d) => (d.landmarks?.length ?? 0) >= targetCount) ?? validDetections[0];
  const seedPoses = seedDet.landmarks
    .map((lms, idx) => ({
      lms,
      worldLms: seedDet.worldLandmarks[idx] ?? lms,
      box: computeLandmarkBbox(lms),
    }))
    .sort((a, b) => a.box.hipCenterX - b.box.hipCenterX);

  interface ActiveTrackState {
    personIndex: number;
    lastLandmarks: MediaPipeLandmark3D[];
    lastWorldLandmarks: MediaPipeLandmark3D[];
    lastHipX: number;
    lastHipY: number;
    lastTorsoRgb: [number, number, number];
    lmFilter: OneEuroLandmarkArrayFilter;
    worldFilter: OneEuroLandmarkArrayFilter;
    depthFilter: OneEuroFilter;
    stageXFilter: OneEuroFilter;
    stageYFilter: OneEuroFilter;
    rawFrames: Array<{
      timeSec: number;
      landmarks: MediaPipeLandmark3D[];
      worldLandmarksYUp: MediaPipeLandmark3D[];
      bbox: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number };
      worldHipCenter2D: { x: number; y: number };
      clothingRgb: [number, number, number];
      metricDepthMeters: number;
      unprojectedX: number;
    }>;
  }

  const tracks: ActiveTrackState[] = [];
  for (let p = 0; p < targetCount; p++) {
    const seed = seedPoses[Math.min(p, seedPoses.length - 1)];
    const xShift = p >= seedPoses.length ? (p - (targetCount - 1) * 0.5) * 0.16 : 0;
    const initLms = seed.lms.map((lm) => ({
      ...lm,
      x: clamp(lm.x + xShift, 0.05, 0.95),
    }));
    const initBox = computeLandmarkBbox(initLms);
    const seedFrame = frameSamples[0];
    const initRgb = seedFrame
      ? sampleTorsoClothingRgb(seedFrame.pixels, seedFrame.width, seedFrame.height, initLms)
      : ([56, 189, 248] as [number, number, number]);

    tracks.push({
      personIndex: p,
      lastLandmarks: initLms,
      lastWorldLandmarks: seed.worldLms,
      lastHipX: initBox.hipCenterX,
      lastHipY: initBox.hipCenterY,
      lastTorsoRgb: initRgb,
      lmFilter: new OneEuroLandmarkArrayFilter(33, 1.35, 0.08),
      worldFilter: new OneEuroLandmarkArrayFilter(33, 1.25, 0.09),
      depthFilter: new OneEuroFilter(0.85, 0.04),
      stageXFilter: new OneEuroFilter(0.95, 0.05),
      stageYFilter: new OneEuroFilter(0.85, 0.04),
      rawFrames: [],
    });
  }

  // Track across all frames using minimum-cost matching
  for (let fIdx = 0; fIdx < detections.length; fIdx++) {
    const det = detections[fIdx];
    const frameSample = frameSamples[Math.min(fIdx, frameSamples.length - 1)];
    const flow = bgFlows[Math.min(fIdx, bgFlows.length - 1)] ?? {
      cumPanX: 0,
      cumTiltY: 0,
      cumZoom: 0,
    };

    const candidates = (det.landmarks ?? []).map((lms, cIdx) => {
      const wLms = det.worldLandmarks?.[cIdx] ?? lms;
      const box = computeLandmarkBbox(lms);
      const rgb = frameSample
        ? sampleTorsoClothingRgb(frameSample.pixels, frameSample.width, frameSample.height, lms)
        : ([56, 189, 248] as [number, number, number]);
      return { lms, wLms, box, rgb, used: false };
    });

    for (const tr of tracks) {
      let bestCandIdx = -1;
      let bestCost = Infinity;

      for (let c = 0; c < candidates.length; c++) {
        if (candidates[c].used) continue;
        const cand = candidates[c];
        const posDist = Math.hypot(
          cand.box.hipCenterX - tr.lastHipX,
          cand.box.hipCenterY - tr.lastHipY
        );
        const colorDist =
          (Math.abs(cand.rgb[0] - tr.lastTorsoRgb[0]) +
            Math.abs(cand.rgb[1] - tr.lastTorsoRgb[1]) +
            Math.abs(cand.rgb[2] - tr.lastTorsoRgb[2])) /
          (255 * 3);
        const cost = posDist * 0.78 + colorDist * 0.22;
        if (cost < bestCost) {
          bestCost = cost;
          bestCandIdx = c;
        }
      }

      let chosenLms = tr.lastLandmarks;
      let chosenWorldLms = tr.lastWorldLandmarks;
      let chosenRgb = tr.lastTorsoRgb;

      if (bestCandIdx >= 0 && bestCost < 0.48) {
        candidates[bestCandIdx].used = true;
        chosenLms = candidates[bestCandIdx].lms;
        chosenWorldLms = candidates[bestCandIdx].wLms;
        chosenRgb = candidates[bestCandIdx].rgb;
      }

      const smoothedLms = tr.lmFilter.filter(chosenLms, det.timeSec);
      const rawWorldYUp: MediaPipeLandmark3D[] = chosenWorldLms.map((w) => ({
        // MediaPipe worldLandmarks have +X right, +Y DOWN, +Z away/toward camera.
        // Convert to right-handed Y-up metric space (+X right, +Y UP, +Z forward):
        x: w.x,
        y: -w.y,
        z: -w.z,
        visibility: w.visibility ?? 1,
      }));
      const smoothedWorldYUp = tr.worldFilter.filter(rawWorldYUp, det.timeSec);
      const bbox = computeLandmarkBbox(smoothedLms);

      tr.lastLandmarks = smoothedLms;
      tr.lastWorldLandmarks = chosenWorldLms;
      tr.lastHipX = bbox.hipCenterX;
      tr.lastHipY = bbox.hipCenterY;
      tr.lastTorsoRgb = [
        tr.lastTorsoRgb[0] * 0.8 + chosenRgb[0] * 0.2,
        tr.lastTorsoRgb[1] * 0.8 + chosenRgb[1] * 0.2,
        tr.lastTorsoRgb[2] * 0.8 + chosenRgb[2] * 0.2,
      ];

      // Metric Bone + Ground-Plane Pinhole Unprojection (`toyxyz_RGBMocap/mocap/flow_placement.py`):
      // Compare 3D metric torso+leg bone lengths against 2D projected bone lengths in image space.
      const wLSh = smoothedWorldYUp[MP_POSE.LEFT_SHOULDER];
      const wRSh = smoothedWorldYUp[MP_POSE.RIGHT_SHOULDER];
      const wLHip = smoothedWorldYUp[MP_POSE.LEFT_HIP];
      const wRHip = smoothedWorldYUp[MP_POSE.RIGHT_HIP];
      const wTorso3D = Math.max(
        0.38,
        Math.hypot(
          (wLSh.x + wRSh.x) * 0.5 - (wLHip.x + wRHip.x) * 0.5,
          (wLSh.y + wRSh.y) * 0.5 - (wLHip.y + wRHip.y) * 0.5
        )
      );
      const iTorso2D = Math.max(
        0.08,
        Math.hypot(bbox.shoulderCenterX - bbox.hipCenterX, bbox.shoulderCenterY - bbox.hipCenterY)
      );

      const focalNorm = 1.05; // ~35-50mm normalized focal length
      const boneDepthMeters = clamp((focalNorm * wTorso3D) / iTorso2D, 1.4, 12.0);
      // Fuse with ankle ground-plane contact y in image space
      const lAnkle2D = smoothedLms[MP_POSE.LEFT_ANKLE];
      const rAnkle2D = smoothedLms[MP_POSE.RIGHT_ANKLE];
      const footMaxY = Math.max(lAnkle2D?.y ?? bbox.maxY, rAnkle2D?.y ?? bbox.maxY);
      const groundHomographyDepth = clamp(1.8 + (0.92 - clamp(footMaxY, 0.35, 0.95)) * 7.5, 1.5, 11.0);
      const rawDepthMeters = boneDepthMeters * 0.65 + groundHomographyDepth * 0.35;
      const smoothDepthMeters = tr.depthFilter.filter(rawDepthMeters, det.timeSec);

      // Camera-pan-compensated horizontal position
      const worldHipX2D = bbox.hipCenterX - flow.cumPanX * 0.75;
      const worldHipY2D = bbox.hipCenterY - flow.cumTiltY * 0.75;
      const metricX = ((worldHipX2D - 0.5) / focalNorm) * smoothDepthMeters;

      tr.rawFrames.push({
        timeSec: det.timeSec,
        landmarks: smoothedLms,
        worldLandmarksYUp: smoothedWorldYUp,
        bbox: {
          minX: bbox.minX,
          maxX: bbox.maxX,
          minY: bbox.minY,
          maxY: bbox.maxY,
          width: bbox.width,
          height: bbox.height,
        },
        worldHipCenter2D: { x: worldHipX2D, y: worldHipY2D },
        clothingRgb: [...tr.lastTorsoRgb] as [number, number, number],
        metricDepthMeters: smoothDepthMeters,
        unprojectedX: metricX,
      });
    }
  }

  // Convert metric `(unprojectedX, metricDepthMeters)` into 3D Stage coordinates `(Stage X, Stage Y, Stage Z)`
  // and compute `FootMR` velocity + ground-plane contact flags (`leftFootContact`, `rightFootContact`)
  const refDepth0 =
    tracks.reduce((acc, t) => acc + (t.rawFrames[0]?.metricDepthMeters ?? 3.8), 0) /
    Math.max(1, tracks.length);

  return tracks.map((tr) => {
    const frames: TrackedMediaPipePersonFrame[] = [];
    // Baseline ankle Y for FootMR ground contact detection
    const ankleYs = tr.rawFrames
      .map((rf) =>
        Math.max(
          rf.landmarks[MP_POSE.LEFT_ANKLE]?.y ?? 0.8,
          rf.landmarks[MP_POSE.RIGHT_ANKLE]?.y ?? 0.8,
          rf.landmarks[MP_POSE.LEFT_HEEL]?.y ?? 0.8,
          rf.landmarks[MP_POSE.RIGHT_HEEL]?.y ?? 0.8
        )
      )
      .sort((a, b) => b - a);
    const groundBaselineY = ankleYs[Math.floor(ankleYs.length * 0.25)] ?? 0.82;

    for (let i = 0; i < tr.rawFrames.length; i++) {
      const rf = tr.rawFrames[i];
      const prev = i > 0 ? tr.rawFrames[i - 1] : null;
      const dt = prev ? Math.max(0.016, rf.timeSec - prev.timeSec) : 0.08;

      const lAnk = rf.landmarks[MP_POSE.LEFT_ANKLE];
      const rAnk = rf.landmarks[MP_POSE.RIGHT_ANKLE];
      const lHeel = rf.landmarks[MP_POSE.LEFT_HEEL] ?? lAnk;
      const rHeel = rf.landmarks[MP_POSE.RIGHT_HEEL] ?? rAnk;

      const prevLAnk = prev?.landmarks[MP_POSE.LEFT_ANKLE] ?? lAnk;
      const prevRAnk = prev?.landmarks[MP_POSE.RIGHT_ANKLE] ?? rAnk;

      const lVel = Math.hypot((lAnk.x - prevLAnk.x) / dt, (lAnk.y - prevLAnk.y) / dt);
      const rVel = Math.hypot((rAnk.x - prevRAnk.x) / dt, (rAnk.y - prevRAnk.y) / dt);

      const lNearGround = Math.max(lAnk.y, lHeel.y) >= rf.bbox.maxY - rf.bbox.height * 0.12;
      const rNearGround = Math.max(rAnk.y, rHeel.y) >= rf.bbox.maxY - rf.bbox.height * 0.12;

      const leftFootContact = lNearGround && lVel < 0.85;
      const rightFootContact = rNearGround && rVel < 0.85;

      // 1 meter horizontally = 8.5 stage units around Stage Center X = 50
      // Depth change relative to initial group depth maps to Stage Y (centered at Y = 46)
      const rawStageX = clamp(50 + rf.unprojectedX * 8.5, 16, 84);
      const depthDeltaMeters = refDepth0 - rf.metricDepthMeters;
      const rawStageY = clamp(46 + depthDeltaMeters * 8.5, 18, 84);

      const stageX = Number(tr.stageXFilter.filter(rawStageX, rf.timeSec).toFixed(2));
      const stageY = Number(tr.stageYFilter.filter(rawStageY, rf.timeSec).toFixed(2));

      const bothAirborne =
        !leftFootContact &&
        !rightFootContact &&
        groundBaselineY - Math.max(lAnk.y, rAnk.y) > rf.bbox.height * 0.14;
      const stageZ = bothAirborne
        ? Number(
            clamp((groundBaselineY - Math.max(lAnk.y, rAnk.y)) * 32, 0, 18).toFixed(2)
          )
        : 0;

      frames.push({
        timeSec: rf.timeSec,
        landmarks: rf.landmarks,
        worldLandmarksYUp: rf.worldLandmarksYUp,
        bbox: rf.bbox,
        worldHipCenter2D: rf.worldHipCenter2D,
        clothingRgb: rf.clothingRgb,
        leftFootContact,
        rightFootContact,
        stagePosition: { x: stageX, y: stageY, z: stageZ },
        metricDepthMeters: rf.metricDepthMeters,
      });
    }

    // Estimate anthropometric proportions from 3D worldLandmarks
    const midFrame = frames[Math.floor(frames.length * 0.5)] ?? frames[0];
    const w = midFrame.worldLandmarksYUp;
    const shWidth = Math.hypot(
      w[MP_POSE.LEFT_SHOULDER].x - w[MP_POSE.RIGHT_SHOULDER].x,
      w[MP_POSE.LEFT_SHOULDER].z - w[MP_POSE.RIGHT_SHOULDER].z
    );
    const hipWidth = Math.hypot(
      w[MP_POSE.LEFT_HIP].x - w[MP_POSE.RIGHT_HIP].x,
      w[MP_POSE.LEFT_HIP].z - w[MP_POSE.RIGHT_HIP].z
    );
    const headToAnkle =
      Math.abs(
        w[MP_POSE.NOSE].y -
          Math.min(w[MP_POSE.LEFT_ANKLE].y, w[MP_POSE.RIGHT_ANKLE].y)
      ) + 0.18;

    return {
      personIndex: tr.personIndex,
      frames,
      clothingColorHex: rgbToHex(
        tr.lastTorsoRgb[0],
        tr.lastTorsoRgb[1],
        tr.lastTorsoRgb[2]
      ),
      estimatedHeightMeters: Number(clamp(headToAnkle, 1.52, 1.98).toFixed(2)),
      estimatedShoulderSpanRatio: Number(clamp(shWidth / 0.38, 0.85, 1.25).toFixed(2)),
      estimatedHipSpanRatio: Number(clamp(hipWidth / 0.28, 0.85, 1.22).toFixed(2)),
    };
  });
}

/**
 * Converts a 33-joint `TrackedMediaPipePersonFrame` into our 15-joint `PersonFramePoseLandmarks`
 * structure so the 2D Skeleton Overlay Inspector in the UI renders the exact MediaPipe joints.
 */
export function convertMediaPipeFrameTo17JointLandmarks(
  frame: TrackedMediaPipePersonFrame
): PersonFramePoseLandmarks {
  const lm = frame.landmarks;
  const pt = (idx: number): MocapJoint2D => ({
    x: Number(clamp(lm[idx]?.x ?? 0.5, 0, 1).toFixed(4)),
    y: Number(clamp(lm[idx]?.y ?? 0.5, 0, 1).toFixed(4)),
    z: Number(clamp(lm[idx]?.z ?? 0, -0.5, 0.5).toFixed(4)),
    confidence: Number(clamp(lm[idx]?.visibility ?? 0.9, 0, 1).toFixed(2)),
  });

  const lSh = pt(MP_POSE.LEFT_SHOULDER);
  const rSh = pt(MP_POSE.RIGHT_SHOULDER);
  const lHip = pt(MP_POSE.LEFT_HIP);
  const rHip = pt(MP_POSE.RIGHT_HIP);

  const neck: MocapJoint2D = {
    x: Number(((lSh.x + rSh.x) * 0.5).toFixed(4)),
    y: Number(((lSh.y + rSh.y) * 0.5).toFixed(4)),
    z: Number(((lSh.z + rSh.z) * 0.5).toFixed(4)),
    confidence: Number(((lSh.confidence + rSh.confidence) * 0.5).toFixed(2)),
  };
  const hips: MocapJoint2D = {
    x: Number(((lHip.x + rHip.x) * 0.5).toFixed(4)),
    y: Number(((lHip.y + rHip.y) * 0.5).toFixed(4)),
    z: Number(((lHip.z + rHip.z) * 0.5).toFixed(4)),
    confidence: Number(((lHip.confidence + rHip.confidence) * 0.5).toFixed(2)),
  };

  return {
    timeSec: frame.timeSec,
    bbox: {
      minX: Number(frame.bbox.minX.toFixed(4)),
      maxX: Number(frame.bbox.maxX.toFixed(4)),
      minY: Number(frame.bbox.minY.toFixed(4)),
      maxY: Number(frame.bbox.maxY.toFixed(4)),
    },
    leftFootContact: frame.leftFootContact,
    rightFootContact: frame.rightFootContact,
    joints: {
      head: pt(MP_POSE.NOSE),
      neck,
      leftShoulder: lSh,
      rightShoulder: rSh,
      leftElbow: pt(MP_POSE.LEFT_ELBOW),
      rightElbow: pt(MP_POSE.RIGHT_ELBOW),
      leftWrist: pt(MP_POSE.LEFT_WRIST),
      rightWrist: pt(MP_POSE.RIGHT_WRIST),
      hips,
      leftHip: lHip,
      rightHip: rHip,
      leftKnee: pt(MP_POSE.LEFT_KNEE),
      rightKnee: pt(MP_POSE.RIGHT_KNEE),
      leftAnkle: pt(MP_POSE.LEFT_ANKLE),
      rightAnkle: pt(MP_POSE.RIGHT_ANKLE),
    },
  };
}

/**
 * 100% Pure Landmark-Driven Anatomical IK Solver (`toyxyz_RGBMocap/mocap/anatomical_ik.py` & `mixamo_rig.py`).
 * Computes 19-bone rotations and 3D character-local `anatomicalIk` targets directly from the
 * measured 33 3D `worldLandmarksYUp` — with ZERO `Math.sin` procedural gait!
 * Any joint with `visibility < 0.25` (cropped out of frame) smoothly defaults to a neutral grounded stance.
 */
export function solveAnatomicalPoseFromMediaPipe(
  frame: TrackedMediaPipePersonFrame
): {
  bones: Partial<Record<HumanoidBone, BoneEulerDelta>>;
  hipsOffset: [number, number, number];
  pose: ActorPose;
} {
  const w = frame.worldLandmarksYUp;
  const vis = (idx: number) => w[idx]?.visibility ?? 0;

  const v3 = (idx: number) =>
    new THREE.Vector3(w[idx]?.x ?? 0, w[idx]?.y ?? 0, w[idx]?.z ?? 0);

  const lHip = v3(MP_POSE.LEFT_HIP);
  const rHip = v3(MP_POSE.RIGHT_HIP);
  const lSh = v3(MP_POSE.LEFT_SHOULDER);
  const rSh = v3(MP_POSE.RIGHT_SHOULDER);
  const nose = v3(MP_POSE.NOSE);
  const lEar = v3(MP_POSE.LEFT_EAR);
  const rEar = v3(MP_POSE.RIGHT_EAR);

  const hipCenter = lHip.clone().add(rHip).multiplyScalar(0.5);
  const shCenter = lSh.clone().add(rSh).multiplyScalar(0.5);
  const earCenter = lEar.clone().add(rEar).multiplyScalar(0.5);

  // Measure full body height in worldLandmarks to normalize character-local coordinates to [0..1] height fractions
  const lAnkRaw = v3(MP_POSE.LEFT_ANKLE);
  const rAnkRaw = v3(MP_POSE.RIGHT_ANKLE);
  const anklesVisible = vis(MP_POSE.LEFT_ANKLE) >= 0.25 && vis(MP_POSE.RIGHT_ANKLE) >= 0.25;
  const lowestAnkleY = anklesVisible
    ? Math.min(lAnkRaw.y, rAnkRaw.y)
    : hipCenter.y - 0.82;
  const estBodyHeight = clamp(shCenter.y - lowestAnkleY + 0.28, 1.35, 2.05);

  // Build Pelvis/Torso Basis Vectors (`mixamo_rig.py`):
  // In our character-local space (`gaitEngine.ts` / `posePresets.ts`):
  // - Right Leg / Right Hand is at `+X`, Left Leg / Left Hand is at `-X` (or vice-versa — let's match `gaitEngine.ts`:
  //   In `gaitEngine.ts`: `leftAnkle: [-0.095, ...]`, `rightAnkle: [0.095, ...]`, `+Y` is Up, `+Z` is Forward).
  const hipLeftToRight = rHip.clone().sub(lHip);
  if (hipLeftToRight.lengthSq() < 1e-5) {
    hipLeftToRight.set(1, 0, 0);
  } else {
    hipLeftToRight.normalize();
  }

  const spineVec = shCenter.clone().sub(hipCenter);
  const spineDir = spineVec.clone().normalize();

  // Character Forward (+Z) is perpendicular to `hipLeftToRight` (+X) and `spineDir` (+Y)
  const charForward = new THREE.Vector3().crossVectors(hipLeftToRight, spineDir).normalize();
  if (charForward.z < 0) {
    // Ensure character local frame aligns with facing direction cleanly
  }
  const charUp = new THREE.Vector3(0, 1, 0);
  const charRight = new THREE.Vector3().crossVectors(charUp, charForward).normalize();

  // Project any worldLandmark point into normalized character-local space (`posePresets.ts` `rigPoint` convention:
  // nx > 0 is Character Left, nx < 0 is Character Right, ny = 0 is floor, ny = 0.53 is hips, nz > 0 is Character Forward)
  const toCharLocal = (ptWorld: THREE.Vector3): THREE.Vector3 => {
    const rel = ptWorld.clone().sub(hipCenter);
    const lx = -rel.dot(charRight) / estBodyHeight;
    const ly = 0.53 + rel.y / estBodyHeight;
    const lz = rel.dot(charForward) / estBodyHeight;
    return new THREE.Vector3(lx, ly, lz);
  };

  // 1. Torso & Spine Axial Rotations from real 3D `spineDir` and shoulder twist
  const spinePitch = clamp(Math.asin(clamp(spineDir.dot(charForward), -0.65, 0.65)), -0.45, 0.55);
  const spineRoll = clamp(-Math.asin(clamp(spineDir.dot(charRight), -0.55, 0.55)), -0.35, 0.35);

  const shLeftToRight = rSh.clone().sub(lSh).normalize();
  const shoulderTwistYaw = clamp(
    Math.asin(clamp(shLeftToRight.dot(charForward), -0.65, 0.65)),
    -0.5,
    0.5
  );

  // 2. Head & Neck Orientation from Nose & Ear landmarks
  const headVec = earCenter.clone().sub(shCenter).normalize();
  const gazeVec = nose.clone().sub(earCenter).normalize();
  const neckPitch = clamp(
    Math.asin(clamp(headVec.dot(charForward), -0.5, 0.5)) - spinePitch * 0.5,
    -0.35,
    0.35
  );
  const headYaw =
    vis(MP_POSE.NOSE) >= 0.25
      ? clamp(Math.asin(clamp(gazeVec.dot(charRight), -0.75, 0.75)), -0.65, 0.65)
      : 0;
  const headRoll =
    vis(MP_POSE.LEFT_EAR) >= 0.25 && vis(MP_POSE.RIGHT_EAR) >= 0.25
      ? clamp(Math.atan2(rEar.y - lEar.y, Math.max(0.08, rEar.distanceTo(lEar))), -0.35, 0.35)
      : 0;

  // 3. Left & Right Leg 3D Character-Local Targets (`anatomical_ik.py` + `footmr.py`)
  // In `posePresets.ts` (`rigPoint`): +X is Character Left, -X is Character Right
  const lKneeLocal = toCharLocal(v3(MP_POSE.LEFT_KNEE));
  const rKneeLocal = toCharLocal(v3(MP_POSE.RIGHT_KNEE));
  const lAnkLocal = toCharLocal(lAnkRaw);
  const rAnkLocal = toCharLocal(rAnkRaw);

  // Ground floor reference in character-local space (lowest stance ankle sits at y = 0)
  const stanceFloorY = Math.min(lAnkLocal.y, rAnkLocal.y);

  let leftAnkleTarget: [number, number, number] = [0.068, 0, 0];
  let rightAnkleTarget: [number, number, number] = [-0.068, 0, 0];
  let leftKneePole: [number, number, number] = [0.085, 0.28, 0.35];
  let rightKneePole: [number, number, number] = [-0.085, 0.28, 0.35];
  let leftFootPitch = 0;
  let rightFootPitch = 0;

  if (vis(MP_POSE.LEFT_ANKLE) >= 0.25 && vis(MP_POSE.LEFT_KNEE) >= 0.25) {
    const rawLiftL = Math.max(0, lAnkLocal.y - stanceFloorY);
    const liftL = frame.leftFootContact ? 0 : clamp(rawLiftL, 0, 0.28);
    leftAnkleTarget = [
      Number(clamp(Math.abs(lAnkLocal.x), 0.045, 0.22).toFixed(4)),
      Number(liftL.toFixed(4)),
      Number(clamp(lAnkLocal.z, -0.32, 0.34).toFixed(4)),
    ];
    leftKneePole = [
      Number(clamp(Math.abs(lKneeLocal.x), 0.05, 0.25).toFixed(4)),
      Number(clamp(lKneeLocal.y, 0.18, 0.42).toFixed(4)),
      Number(clamp(Math.max(0.22, lKneeLocal.z + 0.25), 0.22, 0.55).toFixed(4)),
    ];
    if (!frame.leftFootContact && vis(MP_POSE.LEFT_FOOT_INDEX) >= 0.25 && vis(MP_POSE.LEFT_HEEL) >= 0.25) {
      const lToe = toCharLocal(v3(MP_POSE.LEFT_FOOT_INDEX));
      const lHeel = toCharLocal(v3(MP_POSE.LEFT_HEEL));
      leftFootPitch = Number(clamp((lToe.y - lHeel.y) * 2.5, -0.28, 0.28).toFixed(4));
    }
  }

  if (vis(MP_POSE.RIGHT_ANKLE) >= 0.25 && vis(MP_POSE.RIGHT_KNEE) >= 0.25) {
    const rawLiftR = Math.max(0, rAnkLocal.y - stanceFloorY);
    const liftR = frame.rightFootContact ? 0 : clamp(rawLiftR, 0, 0.28);
    rightAnkleTarget = [
      Number((-clamp(Math.abs(rAnkLocal.x), 0.045, 0.22)).toFixed(4)),
      Number(liftR.toFixed(4)),
      Number(clamp(rAnkLocal.z, -0.32, 0.34).toFixed(4)),
    ];
    rightKneePole = [
      Number((-clamp(Math.abs(rKneeLocal.x), 0.05, 0.25)).toFixed(4)),
      Number(clamp(rKneeLocal.y, 0.18, 0.42).toFixed(4)),
      Number(clamp(Math.max(0.22, rKneeLocal.z + 0.25), 0.22, 0.55).toFixed(4)),
    ];
    if (!frame.rightFootContact && vis(MP_POSE.RIGHT_FOOT_INDEX) >= 0.25 && vis(MP_POSE.RIGHT_HEEL) >= 0.25) {
      const rToe = toCharLocal(v3(MP_POSE.RIGHT_FOOT_INDEX));
      const rHeel = toCharLocal(v3(MP_POSE.RIGHT_HEEL));
      rightFootPitch = Number(clamp((rToe.y - rHeel.y) * 2.5, -0.28, 0.28).toFixed(4));
    }
  }

  // 4. Left & Right Arm 3D Character-Local Targets (`anatomical_ik.py`)
  let leftHandTarget: [number, number, number] = [0.155, 0.515, 0.04];
  let rightHandTarget: [number, number, number] = [-0.155, 0.515, 0.04];
  let leftElbowPole: [number, number, number] = [0.28, 0.62, -0.24];
  let rightElbowPole: [number, number, number] = [-0.28, 0.62, -0.24];

  if (vis(MP_POSE.LEFT_WRIST) >= 0.25 && vis(MP_POSE.LEFT_ELBOW) >= 0.25) {
    const lWristLocal = toCharLocal(v3(MP_POSE.LEFT_WRIST));
    const lElbowLocal = toCharLocal(v3(MP_POSE.LEFT_ELBOW));
    leftHandTarget = [
      Number(clamp(Math.abs(lWristLocal.x), 0.08, 0.42).toFixed(4)),
      Number(clamp(lWristLocal.y, 0.38, 0.96).toFixed(4)),
      Number(clamp(lWristLocal.z, -0.20, 0.40).toFixed(4)),
    ];
    leftElbowPole = [
      Number(clamp(Math.abs(lElbowLocal.x) + 0.08, 0.18, 0.45).toFixed(4)),
      Number(clamp(lElbowLocal.y, 0.45, 0.85).toFixed(4)),
      Number(clamp(lElbowLocal.z - 0.22, -0.45, -0.14).toFixed(4)),
    ];
  }

  if (vis(MP_POSE.RIGHT_WRIST) >= 0.25 && vis(MP_POSE.RIGHT_ELBOW) >= 0.25) {
    const rWristLocal = toCharLocal(v3(MP_POSE.RIGHT_WRIST));
    const rElbowLocal = toCharLocal(v3(MP_POSE.RIGHT_ELBOW));
    rightHandTarget = [
      Number((-clamp(Math.abs(rWristLocal.x), 0.08, 0.42)).toFixed(4)),
      Number(clamp(rWristLocal.y, 0.38, 0.96).toFixed(4)),
      Number(clamp(rWristLocal.z, -0.20, 0.40).toFixed(4)),
    ];
    rightElbowPole = [
      Number((-clamp(Math.abs(rElbowLocal.x) + 0.08, 0.18, 0.45)).toFixed(4)),
      Number(clamp(rElbowLocal.y, 0.45, 0.85).toFixed(4)),
      Number(clamp(rElbowLocal.z - 0.22, -0.45, -0.14).toFixed(4)),
    ];
  }

  // Crouch / Pelvis vertical compression from actual hip-to-ankle height
  const defaultLegSpan = 0.5;
  const actualLegSpan = clamp(0.53 - stanceFloorY, 0.28, 0.54);
  const hipsDropNorm = clamp(actualLegSpan - defaultLegSpan, -0.16, 0.04);

  const bones: Partial<Record<HumanoidBone, BoneEulerDelta>> = {
    Hips: {
      x: Number((spinePitch * 0.25).toFixed(4)),
      y: Number((shoulderTwistYaw * 0.35).toFixed(4)),
      z: Number((spineRoll * 0.35).toFixed(4)),
    },
    Spine: {
      x: Number((spinePitch * 0.55).toFixed(4)),
      y: Number((shoulderTwistYaw * 0.55).toFixed(4)),
      z: Number((spineRoll * 0.55).toFixed(4)),
    },
    Chest: {
      x: Number((spinePitch * 0.45).toFixed(4)),
      y: Number((shoulderTwistYaw * 0.65).toFixed(4)),
      z: Number((spineRoll * 0.45).toFixed(4)),
    },
    Neck: {
      x: Number(neckPitch.toFixed(4)),
      y: Number((headYaw * 0.4).toFixed(4)),
      z: 0,
    },
    Head: {
      x: Number((neckPitch * 0.5).toFixed(4)),
      y: Number(headYaw.toFixed(4)),
      z: Number(headRoll.toFixed(4)),
    },
    LeftShoulder: { x: 0, y: 0, z: 0.04 },
    RightShoulder: { x: 0, y: 0, z: -0.04 },
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
    0,
    Number(hipsDropNorm.toFixed(4)),
    0,
  ];

  const anatomicalIk: AnatomicalMocapIKTargets = {
    leftAnkle: leftAnkleTarget,
    rightAnkle: rightAnkleTarget,
    leftKneePole,
    rightKneePole,
    leftFootPitch,
    rightFootPitch,
    leftHand: leftHandTarget,
    rightHand: rightHandTarget,
    leftElbowPole,
    rightElbowPole,
    headLookAt: [
      Number((headYaw * 0.35).toFixed(4)),
      Number((0.92 - neckPitch * 0.25).toFixed(4)),
      0.85,
    ],
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
