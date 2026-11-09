/**
 * Multimodal Vision AI Filmstrip Analyzer for Video-to-3D Stage Reconstruction
 *
 * Inspects a multi-frame timestamped video contact sheet (6 frames across 0%..100% duration)
 * using the configured Vision LLM (Gemini 2.5 Flash, Ollama Vision Qwen/Gemma, LM Studio, or OpenAI)
 * to extract:
 * 1. Every person in the video (1, 2, 3, or more actors), their appearance, clothing color,
 *    3D stage trajectory (start -> keyframes -> end), and physical actions across time.
 * 2. Camera movement (dolly, pan, tilt, truck, tracking, orbit, static, handheld), lens focal length,
 *    shot framing, vertical angle, and 3D stage camera path.
 * 3. Actual surrounding buildings, walls, architectural structures, vehicles, trees, and props
 *    visible in the video frames at their real relative 3D stage positions.
 */

import {
  getReasonerConfig,
  buildOllamaRequest,
  buildOpenAiRequest,
  buildGeminiRequest,
  resolveWireUrl,
  extractResponseText,
  parseModelJson,
  JsonMode,
} from '../../services/objectReasoner';
import {
  CameraMovementType,
  MovementSpeed,
  ShotType,
  CameraAngle,
  FocalLength,
} from '../../types/shotspec';
import {
  EnvironmentCategory,
  EnvironmentTimeOfDay,
  EnvironmentWeather,
  GroundSurfaceType,
} from '../../types/environment';
import { DetectedMocapAction } from './videoToMocapExtractor';

export interface VisionAiActorKeyframe {
  timeRatio: number; // 0.0 .. 1.0
  stageX: number; // 10 .. 90 (10=left, 50=center, 90=right)
  stageY: number; // 12 .. 88 (20=far background, 50=midground, 80=close foreground)
  stageZ: number; // 0 .. 40 (0=grounded on floor, >0=jumping/elevated)
  actionCategory: DetectedMocapAction;
  actionDetail: string; // e.g. "walks forward while raising right arm to wave"
}

export interface VisionAiExtractedActor {
  name: string;
  appearanceToken: string;
  clothingColorHex: string;
  heightMeters: number;
  bulkFactor: number;
  dominantAction: DetectedMocapAction;
  actionSummary: string;
  keyframes: VisionAiActorKeyframe[];
}

export interface VisionAiExtractedCamera {
  movementType: CameraMovementType;
  speed: MovementSpeed;
  shotType: ShotType;
  angle: CameraAngle;
  focalLength: FocalLength;
  startPosition: { x: number; y: number; z: number };
  endPosition: { x: number; y: number; z: number };
  targetLookAt: { x: number; y: number };
  summaryText: string;
}

export interface VisionAiSurroundingStructure {
  name: string;
  kind: 'building' | 'wall' | 'pillar' | 'tree' | 'vehicle' | 'table' | 'chair' | 'prop';
  appearancePrompt: string;
  colorHex: string;
  stageX: number; // 8 .. 92
  stageY: number; // 12 .. 88
  scale: number; // 0.6 .. 3.5
  yawDeg: number; // -180 .. 180
}

export interface VisionAiSceneAnalysis {
  personCount: number;
  actors: VisionAiExtractedActor[];
  camera: VisionAiExtractedCamera;
  environment: {
    settingLabel: string;
    isIndoorBuilding: boolean;
    category: EnvironmentCategory;
    groundSurface: GroundSurfaceType;
    timeOfDay: EnvironmentTimeOfDay;
    weather: EnvironmentWeather;
    architectureDescription: string;
    lightingSummary: string;
    skyOrCeilingHex: string;
    wallOrMidgroundHex: string;
    floorHex: string;
    accentHex: string;
  };
  surroundingStructures: VisionAiSurroundingStructure[];
}

const VIDEO_FILMSTRIP_SYSTEM_PROMPT = `You are a Principal 3D Motion Capture, Camera Tracking & Architectural Scene Reconstruction Director.
You are given a timestamped multi-frame video filmstrip (or reference frame) showing a real video sequence from t=0% to t=100%.

Carefully inspect ALL frames and return ONLY a valid JSON object matching the exact structure below:
1. "personCount": Exact number of distinct human subjects visible in the video (1, 2, 3, 4, etc.).
2. "actors": Array of ALL distinct people visible in the video. For EACH person:
   - "name": Descriptive role label in English (e.g. "Lead Fighter in Black Jacket", "Second Person on Right").
   - "appearanceToken": Concise visual description of clothing, build, and appearance in English.
   - "clothingColorHex": Sampled dominant clothing hex color (#rrggbb).
   - "heightMeters": Estimated height in meters (1.55 to 2.05).
   - "bulkFactor": Body build factor (0.8 = slim, 1.0 = average, 1.25 = muscular/heavy).
   - "dominantAction": One of ["walk", "run-sprint", "jump-leap", "combat-strike", "crouch-stealth", "dance-expressive", "idle-turn"].
   - "actionSummary": Clear English description of how this person moves across the video (including arm, leg, torso actions).
   - "keyframes": Array of 3 to 5 timestamped progression points from timeRatio 0.0 to 1.0:
     - "timeRatio": 0.0 to 1.0
     - "stageX": Horizontal 3D stage position (10 = far stage-left, 50 = center, 90 = far stage-right)
     - "stageY": Depth 3D stage position (20 = far background, 50 = center stage, 78 = close foreground near camera)
     - "stageZ": Floor elevation (0 = feet on ground, 8..30 = jumping in air)
     - "actionCategory": One of ["walk", "run-sprint", "jump-leap", "combat-strike", "crouch-stealth", "dance-expressive", "idle-turn"]
     - "actionDetail": Specific body posture at this moment in English.
3. "camera": How the physical camera moves and frames the shot across the frames:
   - "movementType": One of ["static", "dolly-in", "dolly-out", "truck-left", "truck-right", "pan-left", "pan-right", "tilt-up", "tilt-down", "orbit-clockwise", "orbit-counter-clockwise", "steadicam-follow", "handheld-subtle", "crane-arc", "zoom-in", "zoom-out"].
   - "speed": One of ["slow-cinematic", "moderate", "rapid-dynamic"].
   - "shotType": One of ["extreme-wide", "wide", "medium-wide", "medium", "medium-close-up", "close-up"].
   - "angle": One of ["eye-level", "low-angle", "high-angle", "overhead-gods-eye", "ground-level", "dutch-angle"].
   - "focalLength": One of ["18mm", "24mm", "35mm", "50mm", "85mm"].
   - "startPosition": {"x": 15..85, "y": 55..95, "z": 8..65} (Camera starting 3D position on stage)
   - "endPosition": {"x": 15..85, "y": 45..95, "z": 8..65} (Camera ending 3D position on stage)
   - "targetLookAt": {"x": 20..80, "y": 25..75}
   - "summaryText": Concise English summary of camera lens, angle, and movement trajectory.
4. "environment": The actual physical location, architecture, lighting, and surfaces seen in the video:
   - "settingLabel": Specific English name of the environment/building (e.g. "Urban Street with Brick Apartment Facades", "Indoor Modern Living Room", "Concrete Industrial Warehouse").
   - "isIndoorBuilding": true if inside a room/building, false if outdoors.
   - "category": One of ["studio", "urban", "nature", "scifi", "interior", "historical"].
   - "groundSurface": One of ["studio-floor", "asphalt-wet", "concrete-floor", "sand-dunes", "grass-terrain", "metal-grate", "wood-parquet", "stone-cobblestone"].
   - "timeOfDay": One of ["day", "golden-hour", "twilight", "night", "neon-night", "dawn"].
   - "weather": One of ["clear", "rain", "fog", "snow", "dust-storm", "overcast"].
   - "architectureDescription": Detailed English description of the buildings, walls, ceiling/sky, and ground in the video.
   - "lightingSummary": Detailed English description of key light direction, color temperature, and shadows.
   - "skyOrCeilingHex": "#rrggbb"
   - "wallOrMidgroundHex": "#rrggbb"
   - "floorHex": "#rrggbb"
   - "accentHex": "#rrggbb"
5. "surroundingStructures": Array of 2 to 6 actual buildings, walls, columns, trees, vehicles, or furniture pieces visible around the actors in the video:
   - "name": Specific English name (e.g. "Left Concrete Apartment Building", "Background Brick Wall & Archway", "Right Street Lamp & Sidewalk", "Wooden Dining Table").
   - "kind": One of ["building", "wall", "pillar", "tree", "vehicle", "table", "chair", "prop"].
   - "appearancePrompt": Visual description in English for 3D reconstruction.
   - "colorHex": Sampled hex color (#rrggbb) from the video.
   - "stageX": 8..92 (left in video = 14..34, center background = 38..62, right in video = 66..86).
   - "stageY": 12..88 (far background = 16..34, midground = 36..58, foreground side = 60..76).
   - "scale": 0.7..3.0
   - "yawDeg": -180..180`;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function sanitizeHex(hex: unknown, fallback: string): string {
  const s = String(hex ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}

const VALID_ACTIONS = new Set<DetectedMocapAction>([
  'walk',
  'run-sprint',
  'jump-leap',
  'combat-strike',
  'crouch-stealth',
  'dance-expressive',
  'idle-turn',
]);

const VALID_CAMERA_MOVES = new Set<CameraMovementType>([
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
  'rack-focus',
  'crash-zoom',
  'fpv-dive',
  'dolly-zoom-vertigo',
  'steadicam-follow',
  'crane-arc',
  'spiral-orbit-in',
]);

/**
 * Sends the stitched multi-frame video contact sheet (`contactSheetDataUrl`) to the configured
 * Vision LLM with a fast timeout so it enriches multi-person tracking, camera motion, and
 * surrounding building reconstruction whenever a Vision model is available.
 */
export async function analyzeVideoFilmstripWithVisionAI(
  imageDataUrl: string,
  options: {
    fileName?: string;
    hintPrompt?: string;
    durationSeconds?: number;
    timeoutMs?: number;
  } = {}
): Promise<VisionAiSceneAnalysis | null> {
  if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
    return null;
  }
  // SVG fallback placeholders are for headless unit tests; only call Vision LLM on real raster images
  if (imageDataUrl.startsWith('data:image/svg')) {
    return null;
  }

  let cfg;
  try {
    cfg = getReasonerConfig();
    if (!cfg || !cfg.url) return null;
    if (cfg.info.needsKey && !cfg.apiKey && !(cfg.provider === 'openai' && cfg.url.includes('/api/openai'))) {
      return null;
    }
  } catch {
    return null;
  }

  const timeoutMs = options.timeoutMs ?? 9000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const userPrompt = `Video File: "${options.fileName || 'uploaded_video.mp4'}" (Duration: ${(options.durationSeconds ?? 4.0).toFixed(1)}s).
${options.hintPrompt ? `Director Context Hint: "${options.hintPrompt}".\n` : ''}Analyze the attached multi-frame video contact sheet. Identify ALL people (1 or multiple actors), their independent 3D stage trajectories and body motions, the camera's movement and lens, and all surrounding buildings, walls, and 3D objects in the scene. Return JSON only.`;

  try {
    const protocol = cfg.info.protocol;
    const mode: JsonMode = 'object';
    const req =
      protocol === 'ollama'
        ? buildOllamaRequest(
            cfg,
            userPrompt,
            mode,
            VIDEO_FILMSTRIP_SYSTEM_PROMPT,
            undefined,
            '',
            imageDataUrl
          )
        : protocol === 'openai'
          ? buildOpenAiRequest(
              cfg,
              userPrompt,
              mode,
              VIDEO_FILMSTRIP_SYSTEM_PROMPT,
              undefined,
              '',
              imageDataUrl
            )
          : buildGeminiRequest(
              cfg,
              userPrompt,
              mode,
              VIDEO_FILMSTRIP_SYSTEM_PROMPT,
              undefined,
              '',
              imageDataUrl
            );

    const wireUrl = resolveWireUrl(req.url, cfg.provider);
    const resp = await fetch(wireUrl, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: ctrl.signal,
    });

    if (!resp.ok) return null;
    const body = await resp.json();
    const rawText = extractResponseText(protocol, body);
    const parsed = parseModelJson(rawText) as any;
    if (!parsed || typeof parsed !== 'object') return null;

    return sanitizeVisionAiSceneAnalysis(parsed);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function sanitizeVisionAiSceneAnalysis(raw: any): VisionAiSceneAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;

  const rawActors = Array.isArray(raw.actors) ? raw.actors : [];
  const actors: VisionAiExtractedActor[] = rawActors.slice(0, 6).map((a: any, idx: number) => {
    const domAct = VALID_ACTIONS.has(a?.dominantAction) ? (a.dominantAction as DetectedMocapAction) : 'walk';
    const rawKfs = Array.isArray(a?.keyframes) ? a.keyframes : [];
    const defaultX = clamp(35 + idx * 22, 16, 84);
    const keyframes: VisionAiActorKeyframe[] =
      rawKfs.length >= 2
        ? rawKfs.map((k: any, kIdx: number) => ({
            timeRatio: clamp(Number(k?.timeRatio ?? kIdx / Math.max(1, rawKfs.length - 1)), 0, 1),
            stageX: clamp(Number(k?.stageX ?? defaultX), 10, 90),
            stageY: clamp(Number(k?.stageY ?? 50), 12, 88),
            stageZ: clamp(Number(k?.stageZ ?? 0), 0, 40),
            actionCategory: VALID_ACTIONS.has(k?.actionCategory) ? k.actionCategory : domAct,
            actionDetail: String(k?.actionDetail || a?.actionSummary || domAct),
          }))
        : [
            {
              timeRatio: 0,
              stageX: defaultX,
              stageY: 46,
              stageZ: 0,
              actionCategory: domAct,
              actionDetail: String(a?.actionSummary || domAct),
            },
            {
              timeRatio: 1,
              stageX: clamp(defaultX + (domAct === 'idle-turn' ? 0 : 12), 10, 90),
              stageY: clamp(46 + (domAct === 'idle-turn' ? 0 : 12), 12, 88),
              stageZ: 0,
              actionCategory: domAct,
              actionDetail: String(a?.actionSummary || domAct),
            },
          ];

    return {
      name: String(a?.name || `Person ${idx + 1}`).trim(),
      appearanceToken: String(a?.appearanceToken || `person ${idx + 1} from video`).trim(),
      clothingColorHex: sanitizeHex(a?.clothingColorHex, idx === 0 ? '#38bdf8' : '#f472b6'),
      heightMeters: clamp(Number(a?.heightMeters || 1.75), 1.5, 2.08),
      bulkFactor: clamp(Number(a?.bulkFactor || 1.0), 0.75, 1.38),
      dominantAction: domAct,
      actionSummary: String(a?.actionSummary || `${domAct} motion in scene`).trim(),
      keyframes,
    };
  });

  const c = raw.camera || {};
  const movementType: CameraMovementType = VALID_CAMERA_MOVES.has(c.movementType)
    ? c.movementType
    : 'static';
  const speed: MovementSpeed =
    c.speed === 'rapid-dynamic' || c.speed === 'moderate' || c.speed === 'slow-cinematic'
      ? c.speed
      : 'moderate';
  const shotType: ShotType = [
    'extreme-wide',
    'wide',
    'medium-wide',
    'medium',
    'medium-close-up',
    'close-up',
    'extreme-close-up',
  ].includes(c.shotType)
    ? c.shotType
    : 'medium-wide';
  const angle: CameraAngle = [
    'eye-level',
    'low-angle',
    'high-angle',
    'overhead-gods-eye',
    'ground-level',
    'dutch-angle',
  ].includes(c.angle)
    ? c.angle
    : 'eye-level';
  const focalLength: FocalLength = [
    '12mm',
    '14mm',
    '18mm',
    '24mm',
    '35mm',
    '40mm',
    '50mm',
    '70mm',
    '85mm',
    '100mm',
    '135mm',
    '200mm',
  ].includes(c.focalLength)
    ? c.focalLength
    : '35mm';

  const camera: VisionAiExtractedCamera = {
    movementType,
    speed,
    shotType,
    angle,
    focalLength,
    startPosition: {
      x: clamp(Number(c?.startPosition?.x ?? 50), 10, 90),
      y: clamp(Number(c?.startPosition?.y ?? 82), 35, 96),
      z: clamp(Number(c?.startPosition?.z ?? 22), 5, 85),
    },
    endPosition: {
      x: clamp(Number(c?.endPosition?.x ?? 50), 10, 90),
      y: clamp(Number(c?.endPosition?.y ?? 74), 30, 96),
      z: clamp(Number(c?.endPosition?.z ?? 22), 5, 85),
    },
    targetLookAt: {
      x: clamp(Number(c?.targetLookAt?.x ?? 50), 10, 90),
      y: clamp(Number(c?.targetLookAt?.y ?? 48), 15, 85),
    },
    summaryText: String(
      c?.summaryText || `${focalLength} ${shotType} (${angle}), ${movementType} (${speed})`
    ).trim(),
  };

  const env = raw.environment || {};
  const category: EnvironmentCategory = [
    'studio',
    'urban',
    'nature',
    'scifi',
    'interior',
    'historical',
  ].includes(env.category)
    ? env.category
    : env.isIndoorBuilding
      ? 'interior'
      : 'urban';

  const groundSurface: GroundSurfaceType = [
    'studio-floor',
    'asphalt-wet',
    'concrete-floor',
    'sand-dunes',
    'grass-terrain',
    'metal-grate',
    'wood-parquet',
    'stone-cobblestone',
  ].includes(env.groundSurface)
    ? env.groundSurface
    : env.isIndoorBuilding
      ? 'wood-parquet'
      : 'concrete-floor';

  const timeOfDay: EnvironmentTimeOfDay = [
    'day',
    'golden-hour',
    'twilight',
    'night',
    'neon-night',
    'dawn',
  ].includes(env.timeOfDay)
    ? env.timeOfDay
    : 'day';

  const weather: EnvironmentWeather = [
    'clear',
    'rain',
    'fog',
    'snow',
    'dust-storm',
    'overcast',
  ].includes(env.weather)
    ? env.weather
    : 'clear';

  const rawStructures = Array.isArray(raw.surroundingStructures) ? raw.surroundingStructures : [];
  const surroundingStructures: VisionAiSurroundingStructure[] = rawStructures
    .slice(0, 6)
    .map((s: any, idx: number) => {
      const validKinds = ['building', 'wall', 'pillar', 'tree', 'vehicle', 'table', 'chair', 'prop'];
      const kind = validKinds.includes(s?.kind) ? s.kind : 'building';
      return {
        name: String(s?.name || `Scene Structure ${idx + 1}`).trim(),
        kind,
        appearancePrompt: String(s?.appearancePrompt || s?.name || 'architectural structure').trim(),
        colorHex: sanitizeHex(s?.colorHex, '#475569'),
        stageX: clamp(Number(s?.stageX ?? (idx % 2 === 0 ? 24 : 76)), 8, 92),
        stageY: clamp(Number(s?.stageY ?? 30 + idx * 8), 12, 88),
        scale: clamp(Number(s?.scale ?? 1.4), 0.6, 3.5),
        yawDeg: clamp(Number(s?.yawDeg ?? 0), -180, 180),
      };
    });

  return {
    personCount: Math.max(actors.length, Number(raw.personCount) || 1),
    actors,
    camera,
    environment: {
      settingLabel: String(env.settingLabel || 'Reconstructed Video Location').trim(),
      isIndoorBuilding: Boolean(env.isIndoorBuilding),
      category,
      groundSurface,
      timeOfDay,
      weather,
      architectureDescription: String(
        env.architectureDescription || 'reconstructed architectural setting from video frames'
      ).trim(),
      lightingSummary: String(env.lightingSummary || 'natural directional scene lighting').trim(),
      skyOrCeilingHex: sanitizeHex(env.skyOrCeilingHex, '#1e293b'),
      wallOrMidgroundHex: sanitizeHex(env.wallOrMidgroundHex, '#334155'),
      floorHex: sanitizeHex(env.floorHex, '#1f2937'),
      accentHex: sanitizeHex(env.accentHex, '#38bdf8'),
    },
    surroundingStructures,
  };
}

