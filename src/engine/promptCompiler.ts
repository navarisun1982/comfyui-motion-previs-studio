import { ShotSpec, CameraMovementType, FocalLength, CameraAngle, LightingStyle, LightingDirection, EnvironmentSpec } from '../types/shotspec';
import { CompiledPromptBundle, TemporalPromptBeat } from '../adapters/types';
import {
  analyzeShotPovVisibility,
  BeatPhase,
  CameraKinematicsSummary,
  ShotPovVisibilityReport,
} from './povVisibilityEngine';

export function extractPureEnvironmentDescription(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // If the user typed a combined subject+environment prompt like "a helicopter flying in the air over a forest",
  // extract the environmental location after the preposition so <Subject 4> stays strictly environmental.
  const match = trimmed.match(
    /^(?:a|an|the)\s+[^,]+?\s+(?:flying|hovering|soaring|gliding|driving|racing|running|walking|standing|moving|sailing|riding|traveling)(?:\s+in\s+the\s+(?:air|sky))?\s+(?:over|above|through|across|in|inside|along|into|around)\s+(.+)$/i
  );
  if (match && match[1] && match[1].trim().length >= 3) {
    return match[1].trim();
  }
  return trimmed;
}

export function cleanActorToken(token?: string, fallbackName?: string): string {
  const raw = (token || fallbackName || 'subject').trim();
  return raw
    .replace(/,?\s*Procedural 3D stage subject for\s+"[^"]*"\.?/gi, '')
    .replace(/^Procedural 3D stage subject for\s+"([^"]*)"\.?$/i, '$1')
    .replace(/,?\s*placed on stage from 3D Asset Library:\s*[^,.]*/gi, '')
    .trim();
}

export function cleanActorAction(actionDescription?: string, token?: string, name?: string): string {
  const raw = (actionDescription || '').trim();
  if (
    !raw ||
    /^Procedural 3D stage subject for\s+/i.test(raw) ||
    /^placed on stage from 3D Asset Library:/i.test(raw)
  ) {
    const src = (token || name || '').trim();
    const verbMatch = src.match(/\b((?:flying|hovering|soaring|gliding|driving|racing|running|walking|moving|sailing|riding)[^,.]*)/i);
    if (verbMatch && verbMatch[1]) {
      return `${verbMatch[1].trim()} with natural physical momentum`;
    }
    return 'moves along its 3D trajectory with authentic physical dynamics';
  }
  return raw
    .replace(/,?\s*Procedural 3D stage subject for\s+"[^"]*"\.?/gi, '')
    .replace(/,?\s*placed on stage from 3D Asset Library:\s*[^,.]*/gi, '')
    .trim();
}

export function formatEnvironment(env?: EnvironmentSpec): string {
  if (!env) return '';
  const pureDesc = extractPureEnvironmentDescription(env.promptDescription || env.name);
  const isOutdoorNatural = /\b(forest|jungle|woods|trees|desert|dunes|ocean|sea|beach|mountain|valley|canyon|sky|field|meadow|river|lake|snow|tundra|island|highway|street|city|nature|urban)\b/i.test(
    `${pureDesc} ${env.name || ''} ${env.category || ''}`
  );
  const showGroundSurface =
    env.groundSurface && !(isOutdoorNatural && env.groundSurface === 'studio-floor');
  const parts = [
    pureDesc,
    env.weather && env.weather !== 'clear' ? `weather condition ${env.weather}` : '',
    env.timeOfDay ? `time of day ${env.timeOfDay.replace(/-/g, ' ')}` : '',
    showGroundSurface ? `ground surface ${env.groundSurface!.replace(/-/g, ' ')}` : '',
    env.fogDensity && env.fogDensity >= 0.015 ? `atmospheric haze and volumetric fog (density ${Math.round(env.fogDensity * 100)}%)` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

/**
 * Ensures `shot.sceneDescription` does not inject stale ShotBible preset narratives
 * (e.g. "Neo-Tokyo rooftop helipad... Agent Kael... Hunter-Killer Attack Drone")
 * after the user has replaced the environment or actors (such as via 3D Mocap Studio).
 */
export function resolveCoherentSceneDescription(shot: ShotSpec): string {
  const rawDesc = (shot.sceneDescription || '').trim();
  const envPrompt = (shot.environment?.promptDescription || shot.environment?.name || '').trim();
  if (!rawDesc) return envPrompt;

  const currentContext = [
    envPrompt,
    shot.environment?.name || '',
    ...shot.actors.map((a) => `${a.name} ${a.token || ''} ${a.actionDescription || ''}`),
  ]
    .join(' ')
    .toLowerCase();

  const presetSignatures = [
    'neo-tokyo',
    'agent kael',
    'cyber-ronin',
    'hunter-killer attack drone',
    'vtol gunship',
    'syndicate checkpoint',
    'chronos relic',
    'explorer aria',
    'obsidian ziggurat',
    'apex mecha',
    'valkyrie',
  ];

  const hasOrphanedPresetNarrative = presetSignatures.some(
    (sig) => rawDesc.toLowerCase().includes(sig) && !currentContext.includes(sig)
  );
  if (hasOrphanedPresetNarrative) {
    return envPrompt;
  }

  return rawDesc;
}

/**
 * Prevents orphaned Shot 01A/01B cyberpunk light rigs ("Drone Crimson Searchlight", "Cyan Rooftop Helipad Key")
 * from polluting prompts after the user switches to a daylight/natural Mocap or custom environment.
 */
export function resolveCoherentLighting(shot: ShotSpec): {
  style: LightingStyle;
  direction: LightingDirection;
  contrast: string;
  lights?: ShotSpec['lighting']['lights'];
} {
  const envContext = `${shot.environment?.name || ''} ${shot.environment?.promptDescription || ''} ${shot.environment?.category || ''}`.toLowerCase();
  const isCyberpunkEnv = /cyberpunk|neo-tokyo|neon|sci-fi|helipad/.test(envContext);
  const hasKaelActor = shot.actors.some((a) => /kael|ronin|hunter-drone|syndicate/i.test(`${a.id} ${a.name}`));

  const hasPresetCyberpunkLights = (shot.lighting.lights || []).some((l) =>
    /Drone Crimson Searchlight|Cyan Rooftop Helipad Key|Plasma Muzzle Cyan Key|Turret Crimson Flood/i.test(l.name)
  );

  if (!isCyberpunkEnv && !hasKaelActor && hasPresetCyberpunkLights) {
    const tod = shot.environment?.timeOfDay;
    const fallbackStyle: LightingStyle =
      tod === 'golden-hour'
        ? 'golden-hour'
        : tod === 'night'
        ? 'moonlight-foggy'
        : tod === 'neon-night'
        ? 'neon-cyberpunk'
        : 'cinematic-natural';
    return {
      style: shot.lighting.style === 'neon-cyberpunk' ? fallbackStyle : shot.lighting.style,
      direction: shot.lighting.direction,
      contrast: shot.lighting.contrast === 'high-contrast' && fallbackStyle === 'cinematic-natural' ? 'balanced' : shot.lighting.contrast,
      lights: undefined,
    };
  }

  return shot.lighting;
}

export function formatCameraMovement(
  type: CameraMovementType,
  speed: string,
  movementOpts?: {
    arcCurve?: number;
    trackTargetActorId?: string;
    keyframes?: Array<{ time: number; position: { x: number; y: number; z?: number }; cueLabel?: string }>;
    customTrajectory?: boolean;
    cameraKinematics?: CameraKinematicsSummary;
  }
): string {
  const isCustom = Boolean(
    movementOpts?.customTrajectory ||
      (movementOpts?.keyframes && movementOpts.keyframes.length > 0) ||
      movementOpts?.cameraKinematics?.isCustomCameraTrajectory
  );

  // When the user manually repositioned or keyframed the camera in 3D space, do NOT output the stale preset name!
  // Instead, output the true 3D camera kinematics measured from the interpolated camera trajectory.
  if (isCustom && movementOpts?.cameraKinematics?.overallDescription) {
    const extras: string[] = [];
    if (movementOpts.trackTargetActorId) {
      extras.push('actively tracking the focal subject');
    }
    if (movementOpts.keyframes && movementOpts.keyframes.length > 0) {
      extras.push(`passing through ${movementOpts.keyframes.length} choreographed 3D camera waypoint(s)`);
    }
    return extras.length > 0
      ? `${movementOpts.cameraKinematics.overallDescription}, ${extras.join(', ')}`
      : movementOpts.cameraKinematics.overallDescription;
  }

  const speedPhrase = speed === 'slow-cinematic' ? 'slow, controlled' : speed === 'rapid-dynamic' ? 'fast, energetic' : 'steady, continuous';

  let baseMove = '';
  switch (type) {
    case 'dolly-in':
      baseMove = `steady camera dolly-in push, camera physically moving forward toward the subject at a ${speedPhrase} pace`;
      break;
    case 'dolly-out':
      baseMove = `smooth camera dolly-out pull, camera moving backward away from the subject at a ${speedPhrase} pace`;
      break;
    case 'truck-left':
      baseMove = `smooth horizontal truck left, camera laterally sliding to the left parallel to the action at a ${speedPhrase} pace`;
      break;
    case 'truck-right':
      baseMove = `smooth horizontal truck right, camera laterally sliding to the right parallel to the action at a ${speedPhrase} pace`;
      break;
    case 'pedestal-up':
      baseMove = `vertical pedestal-up movement, camera physically elevating upward vertically at a ${speedPhrase} pace`;
      break;
    case 'pedestal-down':
      baseMove = `vertical pedestal-down movement, camera descending downward toward the floor at a ${speedPhrase} pace`;
      break;
    case 'pan-left':
      baseMove = `panning camera rotation to the left, smooth rotational scan across the space`;
      break;
    case 'pan-right':
      baseMove = `panning camera rotation to the right, sweeping rotational scan across the space`;
      break;
    case 'tilt-up':
      baseMove = `tilting camera upward, rotating camera axis up toward the ceiling/sky`;
      break;
    case 'tilt-down':
      baseMove = `tilting camera downward, rotating camera axis down toward the subject's feet/ground`;
      break;
    case 'orbit-clockwise':
      baseMove = `smooth 360 orbit camera arc moving clockwise around the focal subject with volumetric parallax`;
      break;
    case 'orbit-counter-clockwise':
      baseMove = `smooth circular orbit arc moving counter-clockwise around the focal subject with volumetric parallax`;
      break;
    case 'zoom-in':
      baseMove = `optical zoom-in lens compression, focal length narrowing toward subject`;
      break;
    case 'zoom-out':
      baseMove = `optical zoom-out lens expansion, wide perspective reveal`;
      break;
    case 'handheld-subtle':
      baseMove = `subtle organic handheld camera feel with gentle natural stabilization`;
      break;
    case 'whip-pan':
      baseMove = `rapid whip-pan transition with fast motion blur`;
      break;
    case 'rack-focus':
      baseMove = `cinematic rack focus transition, smoothly shifting optical focus plane from foreground to background`;
      break;
    case 'crash-zoom':
      baseMove = `rapid crash-zoom telephoto punch-in toward the focal subject`;
      break;
    case 'fpv-dive':
      baseMove = `dynamic FPV drone aerial dive, sweeping three-dimensional plunge with banked horizon roll`;
      break;
    case 'dolly-zoom-vertigo':
      baseMove = `Hitchcock dolly-zoom vertigo effect, camera moving backward while lens simultaneously zooms in`;
      break;
    case 'steadicam-follow':
      baseMove = `fluid Steadicam tracking rig following the subject at a ${speedPhrase} pace with smooth gimbal stabilization`;
      break;
    case 'crane-arc':
      baseMove = `sweeping jib crane arc movement, camera rising and curving gracefully across the set`;
      break;
    case 'spiral-orbit-in':
      baseMove = `tightening spiral orbit camera movement, circling around the subject while pushing closer`;
      break;
    case 'static':
    default:
      baseMove = `locked-off tripod shot, stationary camera frame`;
      break;
  }

  const extras: string[] = [];
  if (typeof movementOpts?.arcCurve === 'number' && Math.abs(movementOpts.arcCurve) > 0.5) {
    extras.push(`following a ${movementOpts.arcCurve > 0 ? 'rightward' : 'leftward'} curved arc trajectory`);
  }
  if (movementOpts?.trackTargetActorId) {
    extras.push(`actively tracking the focal subject`);
  }
  if (movementOpts?.keyframes && movementOpts.keyframes.length > 0) {
    extras.push(`passing through ${movementOpts.keyframes.length} choreographed camera waypoint(s)`);
  }
  if (
    movementOpts?.cameraKinematics?.overallDescription &&
    movementOpts.cameraKinematics.overallDescription.includes('transitioning camera perspective')
  ) {
    const match = movementOpts.cameraKinematics.overallDescription.match(
      /transitioning camera perspective[^,]+/
    );
    if (match) extras.push(match[0]);
  }
  return extras.length > 0 ? `${baseMove}, ${extras.join(', ')}` : baseMove;
}

export function formatLens(
  focalLength: FocalLength,
  aperture: string,
  customFocalLengthMm?: number,
  sensorSize?: string
): string {
  const sensorPhrase =
    sensorSize === 'imax-65mm'
      ? 'IMAX 65mm sensor'
      : sensorSize === 'anamorphic-2x'
      ? '2x anamorphic sensor'
      : sensorSize === 'super-35'
      ? 'Super-35 sensor'
      : sensorSize === 'full-frame'
      ? 'Full-Frame 35mm sensor'
      : '';
  const sensorSuffix = sensorPhrase ? ` on a ${sensorPhrase}` : '';

  if (typeof customFocalLengthMm === 'number' && Number.isFinite(customFocalLengthMm) && `${customFocalLengthMm}mm` !== focalLength) {
    const mm = Math.round(customFocalLengthMm);
    return `${mm}mm cinema lens${sensorSuffix} at ${aperture}`;
  }

  switch (focalLength) {
    case '12mm':
      return `ultra-wide 12mm cinema lens${sensorSuffix} at ${aperture}`;
    case '14mm':
      return `ultra-wide 14mm cinema prime lens${sensorSuffix} at ${aperture}`;
    case '18mm':
      return `ultra-wide 18mm lens${sensorSuffix} at ${aperture}`;
    case '24mm':
      return `wide 24mm cinema lens${sensorSuffix} at ${aperture}`;
    case '35mm':
      return `35mm cinema prime lens${sensorSuffix} at ${aperture}`;
    case '40mm':
      return `40mm anamorphic cinema prime lens${sensorSuffix} at ${aperture}`;
    case '50mm':
      return `50mm lens (standard cinema prime)${sensorSuffix} at ${aperture}`;
    case '70mm':
      return `70mm IMAX cinema lens${sensorSuffix} at ${aperture}`;
    case '85mm':
      return `85mm telephoto portrait lens${sensorSuffix} at ${aperture}`;
    case '100mm':
      return `100mm telephoto cinema prime lens${sensorSuffix} at ${aperture}`;
    case '135mm':
      return `135mm long telephoto lens${sensorSuffix} at ${aperture}`;
    case '200mm':
      return `200mm super-telephoto cinema lens${sensorSuffix} at ${aperture}`;
    default:
      return `${focalLength} cinema lens${sensorSuffix} at ${aperture}`;
  }
}

export function formatCameraAngle(
  angle: CameraAngle,
  shotType: string,
  cameraOpts?: {
    dutchRollDeg?: number;
    pitchOffsetDeg?: number;
    yawOffsetDeg?: number;
    shakeIntensity?: number;
  }
): string {
  const shotPhrase = shotType.replace(/-/g, ' ');
  let baseAngle = '';
  switch (angle) {
    case 'low-angle':
      baseAngle = `${shotPhrase} shot, low-angle perspective looking up at the subject`;
      break;
    case 'high-angle':
      baseAngle = `${shotPhrase} shot, high-angle perspective angled downward`;
      break;
    case 'overhead-gods-eye':
      baseAngle = `overhead god's eye top-down perspective`;
      break;
    case 'ground-level':
      baseAngle = `ground-level perspective skimming just above the surface`;
      break;
    case 'dutch-angle':
      baseAngle = `${shotPhrase} shot, Dutch tilt angle with canted horizon`;
      break;
    case 'eye-level':
    default:
      baseAngle = `${shotPhrase} shot, eye-level framing`;
      break;
  }

  const rigNotes: string[] = [];
  if (cameraOpts?.dutchRollDeg && Math.abs(cameraOpts.dutchRollDeg) >= 2) {
    rigNotes.push(`canted ${Math.round(cameraOpts.dutchRollDeg)}° Dutch horizon roll`);
  }
  if (cameraOpts?.pitchOffsetDeg && Math.abs(cameraOpts.pitchOffsetDeg) >= 2) {
    rigNotes.push(`${cameraOpts.pitchOffsetDeg > 0 ? 'upward' : 'downward'} ${Math.abs(Math.round(cameraOpts.pitchOffsetDeg))}° pitch offset`);
  }
  if (cameraOpts?.yawOffsetDeg && Math.abs(cameraOpts.yawOffsetDeg) >= 2) {
    rigNotes.push(`${Math.round(cameraOpts.yawOffsetDeg)}° yaw offset`);
  }
  if (cameraOpts?.shakeIntensity && cameraOpts.shakeIntensity >= 0.05) {
    const shakeDesc = cameraOpts.shakeIntensity >= 0.5 ? 'kinetic handheld camera shake' : 'subtle organic handheld micro-shake';
    rigNotes.push(shakeDesc);
  }
  return rigNotes.length > 0 ? `${baseAngle} (${rigNotes.join(', ')})` : baseAngle;
}

export function formatLighting(
  style: LightingStyle,
  direction: LightingDirection,
  contrast: string,
  customLights?: Array<{ name: string; color: string; intensity: number; enabled?: boolean }>
): string {
  const dirPhrase = direction.replace(/-/g, ' ');
  const contrastPhrase = contrast === 'high-contrast' ? 'stark chiaroscuro contrast' : contrast === 'soft' ? 'soft diffused shadows' : 'balanced cinematic contrast';

  let baseLight = '';
  switch (style) {
    case 'low-key-film-noir':
      baseLight = `low-key film noir lighting, ${dirPhrase} light source with deep shadows and ${contrastPhrase}`;
      break;
    case 'neon-cyberpunk':
      baseLight = `stylized cyberpunk volumetric lighting, saturated neon rim lights and practical street reflections, ${contrastPhrase}`;
      break;
    case 'golden-hour':
      baseLight = `warm golden-hour sunlight, long warm shadows, backlit rim glow, ${dirPhrase}`;
      break;
    case 'moonlight-foggy':
      baseLight = `cool atmospheric moonlight through subtle fog, desaturated blue hues, ${dirPhrase}`;
      break;
    case 'practical-candlelight':
      baseLight = `warm flickering candlelight glow, intimate falloff, deep shadow roll-off`;
      break;
    case 'harsh-fluorescent':
      baseLight = `clinical fluorescent overhead tubes, cool industrial atmosphere`;
      break;
    case 'high-key-studio':
      baseLight = `high-key commercial lighting, clean even illumination across the scene`;
      break;
    case 'cinematic-natural':
    default:
      baseLight = `natural cinematic film lighting, ${dirPhrase} illumination with ${contrastPhrase}`;
      break;
  }

  const activeCustomLights = (customLights || []).filter((l) => l.enabled !== false);
  if (activeCustomLights.length > 1) {
    const rigDesc = activeCustomLights
      .slice(0, 4)
      .map((l) => `${l.name} (${l.color}, intensity ${l.intensity.toFixed(1)})`)
      .join(', ');
    return `${baseLight}, illuminated by multi-point stage rig [${rigDesc}]`;
  }
  return baseLight;
}

/**
 * Builds chronological temporal stages for the shot based on stage duration,
 * camera motion speed/pacing, and universal 6-DoF camera-POV frustum visibility (`povVisibilityEngine`).
 * Describes true camera-relative screen positions, 3D subject orientation (`front-facing`, `right-facing side profile`, `rear view`),
 * vertical elevation (`grounded on the surface`, `lifts off and ascends`, `climbs higher`), and measured 3D camera kinematics.
 */
export function buildTemporalTimeline(
  shot: ShotSpec,
  precomputedPov?: ShotPovVisibilityReport
): TemporalPromptBeat[] {
  const pov = precomputedPov || analyzeShotPovVisibility(shot);
  const duration = pov.beatBreakpoints.duration;
  const t1 = Number(pov.beatBreakpoints.t1.toFixed(1));
  const t2 = Number(pov.beatBreakpoints.t2.toFixed(1));

  const camType = shot.camera.movement.type;
  const speed = shot.camera.movement.speed;
  const pacing = shot.camera.movement.pacing || 'ease-in-out';
  const speedTerm = speed === 'slow-cinematic' ? 'gentle' : speed === 'rapid-dynamic' ? 'brisk' : 'steady';
  const isCustomCam = pov.cameraKinematics.isCustomCameraTrajectory;

  // Helper for camera phase: uses measured 3D kinematics when camera was manually moved/keyframed,
  // or enriches the preset with measured perspective shifts and true closing-beat motion
  const getCameraPhase = (phase: BeatPhase) => {
    const measuredBeat = pov.cameraKinematics.beatDescriptions[phase];
    if (isCustomCam) {
      return measuredBeat;
    }
    if (camType === 'static' && pov.cameraKinematics.totalDistanceMeters < 0.8) {
      return 'Camera holds a motionless locked-off frame';
    }
    if (camType === 'static' && pov.cameraKinematics.totalDistanceMeters >= 0.8) {
      return measuredBeat;
    }
    const perspectiveClauseMatch = measuredBeat.match(/, (?:framing|shifting perspective on) [^.]+/);
    const perspectiveClause = perspectiveClauseMatch ? perspectiveClauseMatch[0] : '';

    if (phase === 'open') {
      return `Camera establishes framing and initiates a ${speedTerm} ${camType.replace(/-/g, ' ')} (${pacing} pacing)${perspectiveClause}`;
    }
    if (phase === 'mid') {
      return `Camera continues active ${camType.replace(/-/g, ' ')} across the scene${perspectiveClause}`;
    }
    if (!measuredBeat.startsWith('Camera holds a steady locked-off position')) {
      return `${measuredBeat}, completing the ${camType.replace(/-/g, ' ')} into the closing composition`;
    }
    return `Camera holds the final ${camType.replace(/-/g, ' ')} composition${perspectiveClause}`;
  };

  const cleanCueText = (raw?: string): string => {
    if (!raw) return '';
    return raw.replace(/^[^\w\s<>()-]+\s*/u, '').trim().toLowerCase();
  };

  // Helper for actor phase filtered strictly to actors visible in the camera POV during that beat
  const getActorPhase = (phase: BeatPhase) => {
    const visibleInBeat = pov.visibleAnalyses.filter((a) => a.beats[phase].visible);
    if (visibleInBeat.length === 0) {
      return 'Scene environment fills the camera frame with continuous natural atmospheric motion';
    }

    return visibleInBeat
      .map((analysis) => {
        const actor = analysis.actor;
        const beatState = analysis.beats[phase];
        const actStart = actor.trajectory?.startTimeSeconds ?? 0;
        const hasDisplacement = analysis.has3DDisplacement;

        const currentZone = beatState.screenZone;
        const openZone = analysis.beats.open.visible ? analysis.beats.open.screenZone : currentZone;
        const closeZone = analysis.beats.close.visible ? analysis.beats.close.screenZone : currentZone;
        const coverageNote =
          beatState.coverage !== 'full-body' ? ` in ${beatState.coverage} framing` : '';

        const kfs = (actor.trajectory?.keyframes || []).filter(
          (k) => k.posePreset || k.cueLabel || k.gait
        );
        const openCue = kfs.find((k) => k.time <= t1);
        const midCue =
          kfs.find((k) => k !== openCue && k.time >= t1 && k.time <= t2) ||
          kfs.find((k) => k !== openCue && k.time <= t2);
        const closeCue = kfs.find((k) => k !== openCue && k !== midCue && k.time >= t2);

        const formatCueDetail = (k?: typeof openCue) => {
          if (!k) return '';
          const label =
            cleanCueText(k.cueLabel) ||
            (k.posePreset ? `${k.posePreset.replace(/-/g, ' ')} pose` : '');
          const gaitNote = k.gait && k.gait !== 'auto' && k.gait !== 'none' ? `${k.gait} gait` : '';
          return [label, gaitNote].filter(Boolean).join(', ');
        };

        const openPoseStr = formatCueDetail(openCue) ? ` (${formatCueDetail(openCue)})` : '';
        const midPoseStr = formatCueDetail(midCue)
          ? `, transitioning into ${formatCueDetail(midCue)}`
          : '';
        const closePoseStr = formatCueDetail(closeCue)
          ? `, settling into ${formatCueDetail(closeCue)}`
          : '';

        const socketStr = actor.socketToBone
          ? ` (attached to bone ${actor.socketToBone.boneName})`
          : '';

        const exitsAfterOpen = phase === 'open' && !analysis.visibleInBeats.mid;
        const entersInMid = phase === 'mid' && !analysis.visibleInBeats.open;
        const exitsAfterMid = phase === 'mid' && !analysis.visibleInBeats.close;
        const entersInClose =
          phase === 'close' && !analysis.visibleInBeats.open && !analysis.visibleInBeats.mid;

        const orientNote = `seen in a ${beatState.viewOrientation}`;
        const elevNote = beatState.elevationPhrase;
        const vertMove = beatState.verticalMotionPhrase;
        const relMove = beatState.cameraRelativeMotionPhrase;
        const cleanedAction = cleanActorAction(actor.actionDescription, actor.token, actor.name);

        if (phase === 'open') {
          const exitSuffix = exitsAfterOpen
            ? ' before moving out of the camera frame as the view shifts'
            : '';
          const vertClause = vertMove ? `, then ${vertMove}` : '';
          const relClause = relMove ? ` while ${relMove}` : '';

          if (actStart > t1) {
            return `${actor.name}${socketStr} starts ${elevNote} in the ${currentZone}${coverageNote}, ${orientNote}${openPoseStr}${exitSuffix}`;
          }
          if (hasDisplacement) {
            return `${actor.name}${socketStr} starts ${elevNote} in the ${currentZone}${coverageNote}, ${orientNote}${openPoseStr}${vertClause}${relClause}: ${cleanedAction}${exitSuffix}`;
          }
          return `${actor.name}${socketStr} is positioned ${elevNote} in the ${currentZone}${coverageNote}, ${orientNote}: ${cleanedAction}${exitSuffix}`;
        }

        if (phase === 'mid') {
          const prevOrient = analysis.beats.open.visible ? analysis.beats.open.viewOrientationShort : '';
          const orientShiftClause =
            prevOrient && prevOrient !== beatState.viewOrientationShort
              ? `, now seen in a ${beatState.viewOrientation} (transitioning from ${prevOrient})`
              : `, seen in a ${beatState.viewOrientationShort}`;

          const entryPrefix = entersInMid
            ? `${actor.name}${socketStr} enters the camera frame in the ${currentZone}${coverageNote}${orientShiftClause}`
            : `${actor.name}${socketStr}`;
          const exitSuffix = exitsAfterMid ? ', passing toward the edge of the camera frame' : '';

          if (hasDisplacement) {
            const zonePhrase = entersInMid
              ? ` and advances toward the ${closeZone}`
              : openZone !== currentZone
              ? ` moves from the ${openZone} into the ${currentZone}${orientShiftClause}`
              : ` continues through the ${currentZone}${orientShiftClause}`;
            const vertClause = vertMove ? `, and ${vertMove}` : '';
            const relClause = relMove ? ` (${relMove})` : '';
            return `${entryPrefix}${zonePhrase}${vertClause}${relClause}${midPoseStr}${exitSuffix}`;
          }
          return entersInMid
            ? `${entryPrefix}${midPoseStr} (${cleanedAction})${exitSuffix}`
            : `${entryPrefix} remains in the ${currentZone}${coverageNote}${orientShiftClause}${midPoseStr} (${cleanedAction})${exitSuffix}`;
        }

        // close
        const prevMidOrient = analysis.beats.mid.visible
          ? analysis.beats.mid.viewOrientationShort
          : analysis.beats.open.visible
          ? analysis.beats.open.viewOrientationShort
          : '';
        const closeOrientClause =
          prevMidOrient && prevMidOrient !== beatState.viewOrientationShort
            ? `, now seen in a ${beatState.viewOrientation} (having shifted from ${prevMidOrient})`
            : `, seen in a ${beatState.viewOrientation}`;
        const closeVertClause = vertMove ? ` as it ${vertMove}` : '';
        const closeRelClause = relMove ? ` while ${relMove}` : '';

        if (entersInClose) {
          return `${actor.name}${socketStr} enters the camera frame in the ${currentZone}${coverageNote}${closeOrientClause}${closePoseStr} (${cleanedAction})`;
        }
        if (hasDisplacement) {
          return `${actor.name}${socketStr} reaches the ${currentZone}${coverageNote}${closeOrientClause}${closeVertClause}${closeRelClause}${closePoseStr}`;
        }
        return `${actor.name}${socketStr} holds position in the ${currentZone}${coverageNote}${closeOrientClause} through the final frame`;
      })
      .join('; ');
  };

  const t1Str = t1.toFixed(1);
  const t2Str = t2.toFixed(1);
  return [
    {
      timeRange: `0.0s - ${t1Str}s`,
      cameraAction: getCameraPhase('open'),
      actorAction: getActorPhase('open'),
      description: `Opening beat: ${getCameraPhase('open')}. ${getActorPhase('open')}.`,
    },
    {
      timeRange: `${t1Str}s - ${t2Str}s`,
      cameraAction: getCameraPhase('mid'),
      actorAction: getActorPhase('mid'),
      description: `Progression beat: ${getCameraPhase('mid')}. ${getActorPhase('mid')}.`,
    },
    {
      timeRange: `${t2Str}s - ${duration.toFixed(1)}s`,
      cameraAction: getCameraPhase('close'),
      actorAction: getActorPhase('close'),
      description: `Resolution beat: ${getCameraPhase('close')}. ${getActorPhase('close')}.`,
    },
  ];
}

/**
 * LTX-2.5 (Lightricks Gemma-4 22B Distilled Audio-Visual DiT) Prompt Compiler
 * Follows official Lightricks LTX-2.5 prompting guidelines:
 * - Single continuous narrative paragraph in present tense.
 * - Strictly describes ONLY entities that actually enter the camera POV frustum (`pov.visibleAnalyses`),
 *   with exact camera-relative orientation, ground/air elevation, and measured 3D camera trajectory.
 */
export function compileLtxPrompt(shot: ShotSpec): CompiledPromptBundle {
  const pov = analyzeShotPovVisibility(shot);
  const cameraMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed, {
    arcCurve: shot.camera.movement.arcCurve,
    trackTargetActorId: shot.camera.trackTargetActorId,
    keyframes: shot.camera.movement.keyframes,
    customTrajectory: shot.camera.movement.customTrajectory,
    cameraKinematics: pov.cameraKinematics,
  });
  const lensInfo = formatLens(
    shot.camera.lens.focalLength,
    shot.camera.lens.aperture,
    shot.camera.lens.customFocalLengthMm,
    shot.camera.lens.sensorSize
  );
  const angleInfo = formatCameraAngle(shot.camera.angle, shot.camera.shotType, {
    dutchRollDeg: shot.camera.dutchRollDeg,
    pitchOffsetDeg: shot.camera.pitchOffsetDeg,
    yawOffsetDeg: shot.camera.yawOffsetDeg,
    shakeIntensity: shot.camera.movement.shakeIntensity,
  });
  const coherentLighting = resolveCoherentLighting(shot);
  const lightInfo = formatLighting(
    coherentLighting.style,
    coherentLighting.direction,
    coherentLighting.contrast,
    coherentLighting.lights
  );
  const timeline = buildTemporalTimeline(shot, pov);

  const duration = shot.durationSeconds.toFixed(1);

  // Subject descriptors filtered strictly to POV-visible subjects with true camera-relative zones, elevation, and orientation
  const subjectSentence =
    pov.visibleAnalyses.length > 0
      ? `In the camera frame, ${pov.visibleAnalyses
          .map((analysis) => {
            const actor = analysis.actor;
            const firstBeat = analysis.firstVisibleBeat
              ? analysis.beats[analysis.firstVisibleBeat]
              : analysis.beats.open;
            const scale = actor.scale ?? 1.0;
            const scalePrefix =
              scale >= 2.0
                ? 'towering, massive '
                : scale >= 1.4
                ? 'large, prominent '
                : scale <= 0.4
                ? 'miniature, tiny '
                : scale <= 0.7
                ? 'small '
                : '';
            const entryTiming =
              analysis.firstVisibleBeat === 'mid'
                ? 'entering the frame mid-shot in the '
                : analysis.firstVisibleBeat === 'close'
                ? 'entering the frame in the closing beat in the '
                : 'initially ';
            return `${scalePrefix}${cleanActorToken(actor.token, actor.name)} (${actor.name}, ${entryTiming}${firstBeat.elevationPhrase} in the ${analysis.primaryScreenZone}, ${firstBeat.viewOrientationShort})`;
          })
          .join(' and ')}.`
      : '';

  const openingActorAction = timeline[0].actorAction;
  const midActorAction = timeline[1].actorAction;
  const closingActorAction = timeline[2].actorAction;

  const previsToRealityDirective =
    'Completely supplant the simplified 3D previz background, terrain, and stage proxies with the living real-world environment and entities, using the 3D previz guide strictly for camera trajectory, spatial placement, altitude, and viewing-angle timing. Every entity and background surface in the frame exhibits authentic three-dimensional real-world structure, natural secondary motion, and physical depth without any synthetic 3D previz geometry or keyframe rigidity.';

  const pureEnvName = extractPureEnvironmentDescription(shot.environment?.name) || 'the space';
  const soundscapeSentence =
    pov.visibleAnalyses.length > 0
      ? `Natural environmental acoustics matching ${pureEnvName} and synchronized physical foley accompany the motion.`
      : `Natural ambient soundscape and spatial acoustics fill ${pureEnvName}.`;

  const openingBeatParagraph = `Throughout the continuous ${duration}-second take, the ${cameraMove}. At the opening (${timeline[0].timeRange}), ${timeline[0].cameraAction.toLowerCase()} while ${openingActorAction}.`;
  const midBeatParagraph = `During the mid-shot progression (${timeline[1].timeRange}), ${timeline[1].cameraAction.toLowerCase()} as ${midActorAction}.`;
  const closingBeatParagraph = `In the closing beat (${timeline[2].timeRange}), ${timeline[2].cameraAction.toLowerCase()} while ${closingActorAction}.`;
  const realityAndAudioParagraph = `${previsToRealityDirective}\n\n${soundscapeSentence}`;

  const envText = shot.environment ? formatEnvironment(shot.environment) : '';
  const coherentSceneDesc = resolveCoherentSceneDescription(shot);
  const cleanedSceneDesc = coherentSceneDesc.trim().replace(/\.+$/, '');
  const isRedundantWithEnv =
    Boolean(envText && cleanedSceneDesc) &&
    envText.toLowerCase().includes(cleanedSceneDesc.toLowerCase());
  const styleAndLightSentence = shot.claymationMode
    ? `Authentic stop-motion claymation aesthetic, handcrafted malleable clay surface textures, subtle fingerprint imperfections, animated on-twos at ${shot.claymationFps || 12}fps motion cadence.`
    : `Atmospheric environment under ${lightInfo}, with natural 24fps motion cadence and realistic physical depth.`;

  const openingSceneParagraph = [
    `Cinematic ${shot.aspectRatio} ${angleInfo}, filmed on a ${lensInfo}.`,
    subjectSentence,
    envText ? `Setting: ${envText}.` : '',
    cleanedSceneDesc && !isRedundantWithEnv ? `${cleanedSceneDesc}.` : '',
    styleAndLightSentence,
  ]
    .filter(Boolean)
    .join(' ');

  const positivePrompt = [
    openingSceneParagraph,
    openingBeatParagraph,
    midBeatParagraph,
    closingBeatParagraph,
    realityAndAudioParagraph,
  ]
    .filter(Boolean)
    .join('\n\n');

  const negativePrompt =
    shot.negativePrompt ||
    'jitter, warping, temporal flicker, distorted anatomy, morphing faces, plastic skin, stiff 3d proxy geometry, texture-wrapped low-poly mesh, robotic mannequin motion, jittery frame skips, overexposed, low quality, 3d render, watermark, blurry';

  return {
    positivePrompt,
    negativePrompt,
    cameraDirectives: `${angleInfo}. ${cameraMove}. Shot on ${lensInfo}.`,
    actorDirectives:
      pov.visibleAnalyses.length > 0
        ? pov.visibleAnalyses
            .map(
              (a) =>
                `${cleanActorToken(a.actor.token, a.actor.name)} (${cleanActorAction(a.actor.actionDescription, a.actor.token, a.actor.name)}; POV: ${a.primaryScreenZone}; Orientation: ${a.orientationTransitionSummary}${
                  a.actor.socketToBone ? `; attached to bone ${a.actor.socketToBone.boneName}` : ''
                })`
            )
            .join('; ')
        : 'None in camera POV (environmental shot)',
    lightingDirectives: `Lighting: ${lightInfo}.`,
    styleDirectives: shot.claymationMode
      ? `Stop-motion claymation aesthetic, handcrafted clay textures, ${shot.claymationFps || 12}fps on-twos motion cadence.`
      : 'Cinematic film aesthetic, 24fps motion cadence, natural shutter angle, high dynamic range.',
    temporalBeats: timeline,
    modelPromptParadigm: 'ltx-continuous-narrative',
    technicalMetadata: {
      targetModel: 'ltx-2.5',
      duration: shot.durationSeconds,
      fps: shot.claymationMode ? shot.claymationFps || 12 : shot.frameRate,
      focalLength: shot.camera.lens.focalLength,
      aspectRatio: shot.aspectRatio,
      povVisibleActorIds: pov.visibleActors.map((a) => a.id),
      povOffScreenActorIds: pov.offScreenActors.map((a) => a.id),
    },
  };
}

/**
 * MiniMax H3 / Hailuo Reference-to-Video (Ref2VA) Prompt Compiler
 * Follows the official MiniMax H3 Reference-to-Video multi-subject & video-reference schema:
 * - subject_definitions: Maps <Subject 1..N> to <Picture 1..N> ONLY for POV-visible entities (`pov.visibleAnalyses`),
 *   isolating the subject appearance from <Picture N> (ignoring <Picture N>'s background), plus <Subject 4> (<Picture 4> background environment)
 *   and <Video 1> (camera & 3D motion reference).
 * - Concise, high-attention descriptions of 3D orientation transitions, ground/air altitude changes, and measured camera trajectory.
 */
export function compileMiniMaxPrompt(shot: ShotSpec): CompiledPromptBundle {
  const pov = analyzeShotPovVisibility(shot);
  const cameraMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed, {
    arcCurve: shot.camera.movement.arcCurve,
    trackTargetActorId: shot.camera.trackTargetActorId,
    keyframes: shot.camera.movement.keyframes,
    customTrajectory: shot.camera.movement.customTrajectory,
    cameraKinematics: pov.cameraKinematics,
  });
  const lensInfo = formatLens(
    shot.camera.lens.focalLength,
    shot.camera.lens.aperture,
    shot.camera.lens.customFocalLengthMm,
    shot.camera.lens.sensorSize
  );
  const angleInfo = formatCameraAngle(shot.camera.angle, shot.camera.shotType, {
    dutchRollDeg: shot.camera.dutchRollDeg,
    pitchOffsetDeg: shot.camera.pitchOffsetDeg,
    yawOffsetDeg: shot.camera.yawOffsetDeg,
    shakeIntensity: shot.camera.movement.shakeIntensity,
  });
  const coherentLighting = resolveCoherentLighting(shot);
  const lightInfo = formatLighting(
    coherentLighting.style,
    coherentLighting.direction,
    coherentLighting.contrast,
    coherentLighting.lights
  );
  const timeline = buildTemporalTimeline(shot, pov);
  const envText = shot.environment ? formatEnvironment(shot.environment) : '';

  // Build subject definitions (<Subject 1..3>) strictly from POV-visible entities + <Subject 4> environment
  // Following the official ComfyUI / MiniMax H3 Full-Reference Video Generation Prompt ("Rotating Hive Chamber") schema:
  const subjectDefLines: string[] = [];
  const retentionLines: string[] = [];
  const proxySpatialAnchors: string[] = [];

  const visibleTop3 = pov.visibleAnalyses.slice(0, 3);
  for (let i = 0; i < visibleTop3.length; i++) {
    const analysis = visibleTop3[i];
    const actor = analysis.actor;
    const subjIdx = i + 1;
    const firstBeat = analysis.firstVisibleBeat
      ? analysis.beats[analysis.firstVisibleBeat]
      : analysis.beats.open;
    const lastBeat = analysis.lastVisibleBeat
      ? analysis.beats[analysis.lastVisibleBeat]
      : analysis.beats.close;
    const screenZone = analysis.primaryScreenZone;
    const presenceTag = analysis.visibleInAllBeats
      ? 'present throughout'
      : analysis.firstVisibleBeat === 'mid'
      ? 'appears in [Shot 1] mid-shot progression'
      : analysis.firstVisibleBeat === 'close'
      ? 'appears in [Shot 1] closing beat'
      : 'appears in [Shot 1]';

    const scale = actor.scale ?? 1.0;
    const scalePrefix =
      scale >= 2.0
        ? 'towering, massive '
        : scale >= 1.4
        ? 'large, prominent '
        : scale <= 0.4
        ? 'miniature, tiny '
        : scale <= 0.7
        ? 'small '
        : '';
    const socketNote = actor.socketToBone
      ? ` (attached to bone ${actor.socketToBone.boneName})`
      : '';

    const orientTransition =
      firstBeat.viewOrientationShort !== lastBeat.viewOrientationShort
        ? `initially seen in a ${firstBeat.viewOrientation} and transitioning to a ${lastBeat.viewOrientation} by the end of the shot`
        : `seen in a ${firstBeat.viewOrientation}`;

    const altitudeTransition =
      firstBeat.elevationState === 'grounded' && lastBeat.endAltitudeMeters >= 0.8
        ? `starts grounded on the surface and lifts off into mid-air (~${lastBeat.endAltitudeMeters.toFixed(1)}m altitude)`
        : firstBeat.startAltitudeMeters >= 0.8 && lastBeat.elevationState === 'grounded'
        ? `starts airborne (~${firstBeat.startAltitudeMeters.toFixed(1)}m altitude) and descends to land on the ground`
        : `${firstBeat.elevationPhrase}`;

    const cleanedToken = cleanActorToken(actor.token, actor.name);
    const cleanedAct = cleanActorAction(actor.actionDescription, actor.token, actor.name);

    proxySpatialAnchors.push(
      `<Subject ${subjIdx}> (${actor.name}) in the ${screenZone} (${orientTransition})`
    );

    subjectDefLines.push(
      `<Subject ${subjIdx}> is ${actor.name} (from <Picture ${subjIdx}>): ${scalePrefix}${cleanedToken}${socketNote}. <Picture ${subjIdx}> defines ${actor.name}'s finished real-world appearance, construction, materials, colors, proportions, and lighting treatment. Its complete motion trajectory, timing, body/object mechanics, ${altitudeTransition} in the ${screenZone}, and ${orientTransition} (${cleanedAct}) come strictly from <Video 1> (do NOT merely texture-wrap the untextured 3D blockout mesh).`
    );
    retentionLines.push(
      `<Subject ${subjIdx}> (${presenceTag}): attribute_transfer - matches <Picture ${subjIdx}>; the finished real-world appearance, materials, and proportions from <Picture ${subjIdx}> are transferred onto the animated subject from <Video 1> while preserving the source pose sequence, 3D trajectory, altitude changes, timing, and ${analysis.orientationTransitionSummary} from <Video 1>.`
    );
  }

  if (pov.visibleAnalyses.length > 3) {
    for (let i = 3; i < pov.visibleAnalyses.length; i++) {
      const extraAnalysis = pov.visibleAnalyses[i];
      const extraActor = extraAnalysis.actor;
      proxySpatialAnchors.push(
        `${extraActor.name} (${cleanActorToken(extraActor.token, extraActor.name)}) in the ${extraAnalysis.primaryScreenZone}`
      );
    }
  }

  // Filter out actor names from sceneDescription if the user wrote actor actions in sceneDescription so <Subject 4> remains a pure background environment
  const rawEnvPrompt = extractPureEnvironmentDescription(
    shot.environment?.promptDescription || shot.environment?.name || 'cinematic filming location'
  );
  const envDesc = `${rawEnvPrompt}${envText && !rawEnvPrompt.includes(envText) ? ` (${envText})` : ''}`;

  subjectDefLines.push(
    `<Subject 4> is the [Scene Environment] (from <Picture 4>): ${envDesc}. Completely supplants the entire 3D previz background, terrain, and stage geometry in <Video 1> while strictly preserving <Video 1>'s 3D camera perspective, horizon line, environmental parallax, and ground-plane depth, transforming the surrounding reference geometry into the finished real-world environment defined by <Picture 4> with authentic three-dimensional structure and atmospheric depth.`
  );
  retentionLines.push(
    `<Subject 4> (present throughout): fully_preserved - matches <Picture 4>; the finished real-world environment, architecture, terrain, materials, and lighting from <Picture 4> define the surrounding world across <Video 1>'s exact 3D camera perspective and ground plane.`
  );

  const blockingDetail =
    proxySpatialAnchors.length > 0
      ? ` and subject blocking (${proxySpatialAnchors.join('; ')})`
      : ' and environmental spatial depth';
  subjectDefLines.push(
    `<Video 1> is the original untextured 3D animation reference and the authoritative temporal and spatial source for the entire target video (${cameraMove}). It defines the exact subject animation, frame-by-frame pose and trajectory progression, altitude changes, viewing-angle transitions${blockingDetail}, environment parallax, camera angle, camera position, framing, tracking behavior, lens perspective, shot duration, and complete temporal progression. Whenever movement or framing implied by <Picture 1> differs from <Video 1>, <Video 1> takes absolute priority.`
  );
  subjectDefLines.push(
    `<Picture 1> is the finished visual reference for the target rendering, defining the photorealistic subject and environment appearance, material palette, surface textures, lighting relationships, atmospheric depth, and overall cinematic rendering style.`
  );
  retentionLines.push(
    `<Video 1> (entire temporal structure): fully_preserved - preserve its complete animation, timing, camera transform, camera angle, framing, subject screen placement, scale proportions, altitude changes, orientation transitions, shot duration, and frame progression without alteration.`
  );

  // Subject micro-acting summary for metadata (POV-visible only)
  const subjectBlocks = pov.visibleAnalyses
    .map(
      (a) =>
        `${cleanActorToken(a.actor.token, a.actor.name)} (${a.actor.name}, POV: ${a.primaryScreenZone}, ${a.orientationTransitionSummary}): ${cleanActorAction(a.actor.actionDescription, a.actor.token, a.actor.name)}`
    )
    .join('; ');

  const styleLine = shot.claymationMode
    ? `Authentic stop-motion claymation aesthetic, handcrafted malleable clay surface textures, tactile fingerprint imperfections, animated on-twos at ${shot.claymationFps || 12}fps motion cadence.`
    : `Photorealistic cinema shot in ${shot.aspectRatio}, lasting ${shot.durationSeconds.toFixed(1)} seconds at 24fps. One continuous take filmed on a ${lensInfo}, ${angleInfo}, with ${cameraMove}.`;

  const beatParagraphs = timeline
    .map((beat, idx) => {
      const prefix = idx === 0 ? `From ${beat.timeRange}` : `From ${beat.timeRange}`;
      return `${prefix}, ${beat.cameraAction}. Simultaneously, ${beat.actorAction}.`;
    })
    .join('\n\n');

  const refRangePhrase =
    visibleTop3.length > 0
      ? `<Picture 1>–<Picture ${visibleTop3.length}> for the foreground subject(s) and <Picture 4> for the scene environment`
      : `<Picture 4> for the scene environment`;

  const replaceBlockoutClause =
    visibleTop3.length > 0
      ? `Replace the original 3D blockout subject(s) with ${visibleTop3.map((_, idx) => `<Subject ${idx + 1}>`).join(', ')} and transform the complete surrounding stage geometry into <Subject 4>.`
      : `Transform the complete surrounding stage geometry into <Subject 4>.`;

  const soundscapeEnvName = extractPureEnvironmentDescription(shot.environment?.name) || 'the scene';
  const positivePrompt = [
    `subject_definitions:\n${subjectDefLines.join('\n\n')}`,
    `summary: [reference generation] The target video recreates the exact animation, spatial blocking, and virtual-camera performance of <Video 1> across a continuous ${shot.durationSeconds.toFixed(1)}-second ${shot.aspectRatio} shot ("${shot.name}"), while applying the finished photorealistic appearance and environment established by ${refRangePhrase}. <Video 1> has absolute priority for subject movement, timing, environmental parallax, camera motion, and framing.`,
    `retention_analysis:\n${retentionLines.join('\n')}`,
    `detailed_description: ${styleLine} <Video 1> is the strict motion master; no movement should be regenerated from the still reference image.\n\n[Shot 1] Reproduce the complete continuous shot from <Video 1> at identical duration and timing. ${replaceBlockoutClause} Every moment follows <Video 1> frame for frame: preserve the exact camera angle, camera height, camera distance, lens perspective, tracking behavior, and subject trajectories from <Video 1>.\n\n${beatParagraphs}\n\nScene context: ${resolveCoherentSceneDescription(shot).trim()}. Lighting: ${lightInfo}. Every entity and background surface in the frame exhibits authentic three-dimensional real-world structure, natural secondary motion, and physical depth without any synthetic 3D previz geometry or keyframe rigidity. No readable text, subtitles, or interface graphics.`,
    `overall_soundscape: Natural environmental ambiance matching ${soundscapeEnvName}${
      visibleTop3.length > 0
        ? ', realistic physical foley synchronized with the visible motion,'
        : ','
    } and spatial acoustics. No unintended vocalizations.`,
    `non_diegetic_music: N/A.`,
  ].join('\n\n');

  const negativePrompt =
    shot.negativePrompt ||
    'blurry, low quality, deformed limbs, stiff 3d proxy geometry, texture-wrapped low-poly mesh, robotic mannequin motion, floating artifacts, jerky camera, unnatural motion, digital noise, oversaturated, morphing';

  return {
    positivePrompt,
    negativePrompt,
    cameraDirectives: `${angleInfo}. ${cameraMove}. Shot on ${lensInfo}.`,
    actorDirectives: subjectBlocks || 'None in camera POV (environmental shot)',
    lightingDirectives: `Lighting: ${lightInfo}.`,
    styleDirectives: shot.claymationMode
      ? `Stop-motion claymation aesthetic, handcrafted clay textures, ${shot.claymationFps || 12}fps motion cadence.`
      : 'MiniMax H3 Ref2VA, Arri Alexa 65, cinematic realism, 24fps motion cadence, 180-degree shutter.',
    temporalBeats: timeline,
    modelPromptParadigm: 'minimax-structured-cinematic',
    technicalMetadata: {
      targetModel: 'MiniMax H3 / Hailuo',
      duration: shot.durationSeconds,
      fps: shot.claymationMode ? shot.claymationFps || 12 : shot.frameRate,
      focalLength: shot.camera.lens.focalLength,
      aspectRatio: shot.aspectRatio,
      povVisibleActorIds: pov.visibleActors.map((a) => a.id),
      povOffScreenActorIds: pov.offScreenActors.map((a) => a.id),
    },
  };
}

/**
 * Seedance 2.0 (ByteDance Seaweed / SeaDance) Prompt Compiler
 * Follows official Seedance prompting guidelines:
 * - Structured brackets emphasizing 6-axis camera motion matrix coordinates, POV-visible subject 3D orientation & altitude physics,
 *   sequential cue timetables, spatial volumetric lighting, and optical sensor profiles.
 */
export function compileSeedancePrompt(shot: ShotSpec): CompiledPromptBundle {
  const pov = analyzeShotPovVisibility(shot);
  const cameraMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed, {
    arcCurve: shot.camera.movement.arcCurve,
    trackTargetActorId: shot.camera.trackTargetActorId,
    keyframes: shot.camera.movement.keyframes,
    customTrajectory: shot.camera.movement.customTrajectory,
    cameraKinematics: pov.cameraKinematics,
  });
  const lensInfo = formatLens(
    shot.camera.lens.focalLength,
    shot.camera.lens.aperture,
    shot.camera.lens.customFocalLengthMm,
    shot.camera.lens.sensorSize
  );
  const angleInfo = formatCameraAngle(shot.camera.angle, shot.camera.shotType, {
    dutchRollDeg: shot.camera.dutchRollDeg,
    pitchOffsetDeg: shot.camera.pitchOffsetDeg,
    yawOffsetDeg: shot.camera.yawOffsetDeg,
    shakeIntensity: shot.camera.movement.shakeIntensity,
  });
  const coherentLighting = resolveCoherentLighting(shot);
  const lightInfo = formatLighting(
    coherentLighting.style,
    coherentLighting.direction,
    coherentLighting.contrast,
    coherentLighting.lights
  );
  const timeline = buildTemporalTimeline(shot, pov);
  const envText = shot.environment ? formatEnvironment(shot.environment) : '';

  const dx = ((shot.camera.movement.endPosition.x - shot.camera.movement.startPosition.x) / 10.0).toFixed(2);
  const dy = ((shot.camera.movement.endPosition.y - shot.camera.movement.startPosition.y) / 10.0).toFixed(2);
  const dz = (((shot.camera.movement.endPosition.z ?? 50) - (shot.camera.movement.startPosition.z ?? 50)) / 10.0).toFixed(2);

  // Subject with aerodynamic & locomotion physics (strictly filtered to POV-visible subjects)
  const subjectEntries = pov.visibleAnalyses.map((analysis) => {
    const actor = analysis.actor;
    const firstBeat = analysis.firstVisibleBeat
      ? analysis.beats[analysis.firstVisibleBeat]
      : analysis.beats.open;
    const scale = actor.scale ?? 1.0;
    const scalePrefix =
      scale >= 2.0 ? 'towering scale ' : scale >= 1.4 ? 'large scale ' : scale <= 0.5 ? 'miniature scale ' : '';
    const start = actor.trajectory?.startPosition ?? { x: 50, y: 50 };
    const end = actor.trajectory?.endPosition ?? { x: 50, y: 50 };
    const socketPart = actor.socketToBone ? ` [Socketed: Bone ${actor.socketToBone.boneName}]` : '';
    const closeZone = analysis.beats.close.visible
      ? analysis.beats.close.screenZone
      : analysis.primaryScreenZone;
    return `${scalePrefix}${cleanActorToken(actor.token, actor.name)} (${actor.name})${socketPart} [Camera POV Framing: ${analysis.primaryScreenZone} -> ${closeZone} | Orientation: ${analysis.orientationTransitionSummary} | Elevation: ${firstBeat.elevationPhrase} | Stage Vector: (${start.x}%, ${start.y}%, z:${start.z ?? 0}) -> (${end.x}%, ${end.y}%, z:${end.z ?? 0})], performing: ${cleanActorAction(actor.actionDescription, actor.token, actor.name)}`;
  });

  const subjectBlocks = subjectEntries.join('; ');
  const subjectParagraphLines =
    subjectEntries.length > 1
      ? subjectEntries.map((entry) => `- ${entry}.`).join('\n')
      : subjectEntries.length === 1
      ? `${subjectEntries[0]}.`
      : '';

  // Chronological cue beats formatted on separate readable lines
  const timelineString = timeline
    .map((beat) => `- [${beat.timeRange}]: ${beat.cameraAction}; ${beat.actorAction}.`)
    .join('\n');

  const positivePrompt = [
    `[Camera 6-Axis Motion & Matrix Trajectory]:\n${angleInfo}, ${cameraMove}, 3D displacement vector (dx: ${dx}, dy: ${dy}, dz: ${dz}), filmed on ${lensInfo}.`,
    subjectParagraphLines ? `[Subject Dynamics & Aerodynamic Physics]:\n${subjectParagraphLines}` : '',
    `[Previs-to-Reality Spatial Instantiation]:\nCompletely supplant all simplified 3D previz background shapes, terrain, and subject proxies with the living real-world environment and entities, using the 3D previz guide strictly for camera trajectory, spatial placement, altitude, and viewing-angle timing. Every entity and background surface exhibits authentic three-dimensional real-world structure, natural secondary physics, and fluid kinematics without any synthetic 3D previz geometry or keyframe rigidity.`,
    `[Temporal Cue Timetable]:\n${timelineString}`,
    `[Atmospheric Space & Volumetric Lighting]:\n${lightInfo}, scene environment: ${
      shot.environment?.promptDescription || resolveCoherentSceneDescription(shot).trim()
    }${envText ? ` (${envText})` : ''}.`,
    shot.claymationMode
      ? `[Render & Motion Profile]:\nStop-motion claymation aesthetic, handcrafted tactile clay micro-textures, ${
          shot.claymationFps || 12
        }fps on-twos motion cadence.`
      : `[Render & Motion Profile]:\nOptical photorealism, 24fps motion matrix coherence, natural 180-degree optical shutter angle.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const negativePrompt =
    shot.negativePrompt ||
    'floating artifacts, frame tearing, flickering geometry, stiff 3d proxy geometry, texture-wrapped low-poly mesh, unnatural jerky acceleration, low resolution, warped proportions, morphing hands, plastic textures, watermark';

  return {
    positivePrompt,
    negativePrompt,
    cameraDirectives: `${angleInfo}. ${cameraMove}. 3D delta: (${dx}, ${dy}, dz: ${dz}). Shot on ${lensInfo}.`,
    actorDirectives: subjectBlocks || 'None in camera POV (environmental shot)',
    lightingDirectives: `Lighting: ${lightInfo}.`,
    styleDirectives: shot.claymationMode
      ? `Stop-motion claymation aesthetic, handcrafted clay textures, ${shot.claymationFps || 12}fps on-twos motion cadence.`
      : 'Seedance 2.0 Motion Matrix, 24fps cinema cadence, optical shutter, spatial depth coherence.',
    temporalBeats: timeline,
    modelPromptParadigm: 'seedance-motion-matrix',
    technicalMetadata: {
      targetModel: 'Seedance 2.0',
      duration: shot.durationSeconds,
      fps: shot.claymationMode ? shot.claymationFps || 12 : shot.frameRate,
      focalLength: shot.camera.lens.focalLength,
      aspectRatio: shot.aspectRatio,
      cameraDelta: { dx, dy, dz },
      povVisibleActorIds: pov.visibleActors.map((a) => a.id),
      povOffScreenActorIds: pov.offScreenActors.map((a) => a.id),
    },
  };
}

/**
 * Formats any single-block LTX-2.5 or Seedance 2.0 prompt (including cached custom prompts
 * or single-paragraph LLM outputs) into clean, human-readable paragraphs separated by blank lines.
 */
export function formatReadableEnginePrompt(text: string, engineId?: string): string {
  if (!text || !text.trim()) return text;
  if (text.includes('\n\n')) return text;

  const isSeedance =
    engineId === 'seedance' ||
    /\[(?:Camera 6-Axis Motion|Subject Dynamics|Temporal Cue Timetable)/i.test(text);

  if (isSeedance) {
    let formatted = text
      .replace(
        /\s*(\[(?:Camera 6-Axis Motion & Matrix Trajectory|Subject Dynamics & Aerodynamic Physics|Previs-to-Reality Spatial Instantiation|Temporal Cue Timetable|Atmospheric Space & Volumetric Lighting|Render & Motion Profile|Choreography Reference|Camera Trajectory Reference|Full Scene VFX Reference|Object Motion Reference)[^\]]*\]:?)/g,
        '\n\n$1'
      )
      .replace(
        /(\[(?:Camera 6-Axis Motion & Matrix Trajectory|Subject Dynamics & Aerodynamic Physics|Previs-to-Reality Spatial Instantiation|Temporal Cue Timetable|Atmospheric Space & Volumetric Lighting|Render & Motion Profile)\]:)\s+/g,
        '$1\n'
      )
      .replace(/\n(\[0\.0s\s*-\s*\d+(?:\.\d+)?s\]:)/g, '\n- $1')
      .replace(/\s*\|\s*(\[\d+(?:\.\d+)?s\s*-\s*\d+(?:\.\d+)?s\]:)/g, '\n- $1')
      .trim();
    return formatted;
  }

  // LTX-2.5 narrative paragraph organizer
  let ltxFormatted = text
    .replace(
      /\s+(?=(?:Throughout the continuous |During the mid-shot progression |In the closing beat |Completely supplant the simplified 3D previz |Natural environmental acoustics |Natural ambient soundscape ))/g,
      '\n\n'
    )
    .trim();

  if (!ltxFormatted.includes('\n\n')) {
    const sentences = ltxFormatted
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length >= 3) {
      const paragraphs: string[] = [];
      for (let i = 0; i < sentences.length; i += 2) {
        paragraphs.push(sentences.slice(i, i + 2).join(' '));
      }
      ltxFormatted = paragraphs.join('\n\n');
    }
  }

  return ltxFormatted;
}

/**
 * Universal Director Prompt Compiler
 * Automatically routes to the official prompting paradigm tailored to the target model.
 */
export function compilePromptForShot(shot: ShotSpec, targetModelId?: string): CompiledPromptBundle {
  const model = targetModelId || shot.targetModel;
  if (model === 'minimax-h3') {
    return compileMiniMaxPrompt(shot);
  }
  if (model === 'seedance') {
    return compileSeedancePrompt(shot);
  }
  return compileLtxPrompt(shot);
}
