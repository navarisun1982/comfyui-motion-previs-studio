import { ShotSpec, CameraMovementType, FocalLength, CameraAngle, LightingStyle, LightingDirection, EnvironmentSpec } from '../types/shotspec';
import { CompiledPromptBundle, TemporalPromptBeat } from '../adapters/types';
import {
  analyzeShotPovVisibility,
  BeatPhase,
  ShotPovVisibilityReport,
} from './povVisibilityEngine';

export function formatEnvironment(env?: EnvironmentSpec): string {
  if (!env) return '';
  const parts = [
    env.promptDescription || env.name,
    env.weather && env.weather !== 'clear' ? `weather condition ${env.weather}` : '',
    env.timeOfDay ? `time of day ${env.timeOfDay.replace(/-/g, ' ')}` : '',
    env.groundSurface ? `ground surface ${env.groundSurface.replace(/-/g, ' ')}` : '',
    env.fogDensity && env.fogDensity >= 0.015 ? `atmospheric haze and volumetric fog (density ${Math.round(env.fogDensity * 100)}%)` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

export function formatCameraMovement(
  type: CameraMovementType,
  speed: string,
  movementOpts?: {
    arcCurve?: number;
    trackTargetActorId?: string;
    keyframes?: Array<{ time: number; position: { x: number; y: number; z?: number }; cueLabel?: string }>;
  }
): string {
  const speedPhrase = speed === 'slow-cinematic' ? 'slow, controlled' : speed === 'rapid-dynamic' ? 'fast, energetic' : 'steady, continuous';
  
  let baseMove = '';
  switch (type) {
    case 'dolly-in':
      baseMove = `steady camera dolly-in (dolly in) push, camera physically moving forward toward the subject at a ${speedPhrase} pace, creating increasing emotional intimacy`;
      break;
    case 'dolly-out':
      baseMove = `smooth camera dolly-out (dolly out) pull, camera smoothly moving backward away from the subject at a ${speedPhrase} pace, revealing the surrounding environment`;
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
      baseMove = `smooth 360 orbit camera arc moving clockwise around the focal subject, dynamic volumetric parallax`;
      break;
    case 'orbit-counter-clockwise':
      baseMove = `smooth circular orbit arc moving counter-clockwise around the focal subject, dynamic volumetric parallax`;
      break;
    case 'zoom-in':
      baseMove = `optical zoom-in lens compression, focal length narrowing toward subject, background compression`;
      break;
    case 'zoom-out':
      baseMove = `optical zoom-out lens expansion, wide perspective reveal`;
      break;
    case 'handheld-subtle':
      baseMove = `subtle organic handheld camera feel, breathing cinematic realism with gentle natural stabilization`;
      break;
    case 'whip-pan':
      baseMove = `rapid whip-pan transition, fast motion blur swish`;
      break;
    case 'rack-focus':
      baseMove = `cinematic rack focus transition, smoothly shifting critical optical focus plane from foreground to background`;
      break;
    case 'crash-zoom':
      baseMove = `rapid crash-zoom snap telephoto rush, high-energy focal length punch-in toward the focal subject`;
      break;
    case 'fpv-dive':
      baseMove = `dynamic FPV drone aerial dive, sweeping three-dimensional plunge with banked horizon roll`;
      break;
    case 'dolly-zoom-vertigo':
      baseMove = `Hitchcock dolly-zoom vertigo effect, camera physically moving backward while lens simultaneously zooms in, keeping subject scale constant while background perspective warps dramatically`;
      break;
    case 'steadicam-follow':
      baseMove = `fluid Steadicam tracking rig following the subject at a ${speedPhrase} pace, maintaining constant framing distance with smooth gimbal stabilization`;
      break;
    case 'crane-arc':
      baseMove = `sweeping jib crane arc movement, camera rising and curving gracefully across the set with rich multi-plane parallax`;
      break;
    case 'spiral-orbit-in':
      baseMove = `tightening spiral orbit camera movement, circling around the subject while progressively pushing closer into an intimate frame`;
      break;
    case 'static':
    default:
      baseMove = `locked-off tripod shot, completely stable, motionless camera frame`;
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
      ? 'large-format IMAX 65mm sensor'
      : sensorSize === 'anamorphic-2x'
      ? '2x anamorphic cinema sensor'
      : sensorSize === 'super-35'
      ? 'Super-35 cinema sensor'
      : sensorSize === 'full-frame'
      ? 'Full-Frame 35mm sensor'
      : '';
  const sensorSuffix = sensorPhrase ? ` on a ${sensorPhrase}` : '';

  if (typeof customFocalLengthMm === 'number' && Number.isFinite(customFocalLengthMm) && `${customFocalLengthMm}mm` !== focalLength) {
    const mm = Math.round(customFocalLengthMm);
    const charDesc =
      mm <= 16
        ? 'ultra-wide rectilinear perspective with dramatic spatial depth'
        : mm <= 28
        ? 'wide-angle cinema framing with strong environmental context'
        : mm <= 45
        ? 'natural narrative cinema field of view'
        : mm <= 65
        ? 'true-to-eye standard focal length with zero distortion'
        : mm <= 105
        ? 'intimate portrait telephoto compression with creamy shallow depth of field'
        : 'long telephoto axial background compression and subject isolation';
    return `${mm}mm custom cinema lens${sensorSuffix}, ${charDesc} at ${aperture}`;
  }

  switch (focalLength) {
    case '12mm':
      return `extreme ultra-wide 12mm rectilinear cinema lens${sensorSuffix}, 122-degree dramatic spatial depth, towering close foregrounds, deep focus`;
    case '14mm':
      return `ultra-wide 14mm cinema prime lens${sensorSuffix}, 114-degree sweeping architectural scale, dramatic perspective convergence`;
    case '18mm':
      return `ultra-wide 18mm lens${sensorSuffix}, broad expansive field of view, subtle wide-angle perspective distortion at edges, deep focus`;
    case '24mm':
      return `wide 24mm lens${sensorSuffix}, environmental framing with cinematic presence, crisp background context`;
    case '35mm':
      return `classic 35mm cinema prime lens${sensorSuffix}, natural human perspective, gentle background separation at ${aperture}`;
    case '40mm':
      return `40mm anamorphic cinema prime lens${sensorSuffix}, classic widescreen storytelling perspective, oval bokeh highlights at ${aperture}`;
    case '50mm':
      return `50mm lens${sensorSuffix}, standard focal length prime, zero perspective distortion, natural cinematic depth of field at ${aperture}`;
    case '70mm':
      return `70mm large-format IMAX cinema lens${sensorSuffix}, rich medium-telephoto dimensionality, razor-sharp subject presence at ${aperture}`;
    case '85mm':
      return `85mm telephoto portrait lens${sensorSuffix}, creamy shallow depth of field, compressed background bokeh at ${aperture}, isolated subject`;
    case '100mm':
      return `100mm macro-portrait cinema prime lens${sensorSuffix}, intimate detail rendering, velvety background melt at ${aperture}`;
    case '135mm':
      return `135mm long telephoto lens${sensorSuffix}, extreme cinematic background compression, soft creamy bokeh`;
    case '200mm':
      return `200mm super-telephoto cinema lens${sensorSuffix}, dramatic axial background compression, shallow razor-thin focal plane at ${aperture}`;
    default:
      return `${focalLength} lens${sensorSuffix}, cinematic optics`;
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
      baseAngle = `${shotPhrase} shot, low-angle perspective looking up at subject, conveying stature and authority`;
      break;
    case 'high-angle':
      baseAngle = `${shotPhrase} shot, high-angle perspective angled downward, vulnerable composition`;
      break;
    case 'overhead-gods-eye':
      baseAngle = `overhead god's eye view, perpendicular top-down vertical perspective`;
      break;
    case 'ground-level':
      baseAngle = `ground-level perspective, camera skimming just above the surface`;
      break;
    case 'dutch-angle':
      baseAngle = `${shotPhrase} shot, Dutch tilt angle, canted horizon line evoking psychological tension`;
      break;
    case 'eye-level':
    default:
      baseAngle = `${shotPhrase} shot, neutral eye-level framing, balanced horizontal composition`;
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
      baseLight = `low-key film noir lighting, ${dirPhrase} light source with deep rich shadows and ${contrastPhrase}`;
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
      baseLight = `clinical fluorescent overhead tubes, cool greenish-white tint, industrial atmosphere`;
      break;
    case 'high-key-studio':
      baseLight = `high-key commercial lighting, clean even illumination across the scene, minimal shadows`;
      break;
    case 'cinematic-natural':
    default:
      baseLight = `natural cinematic film lighting, realistic ambient bounce, ${dirPhrase} illumination with ${contrastPhrase}`;
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
 * camera motion speed/pacing, and camera-POV frustum visibility (`povVisibilityEngine`).
 * Only actors visible inside the camera POV during each beat (`open`, `mid`, `close`) are
 * described in that beat, using true camera-relative screen positions (`screen-left / center-frame / screen-right`
 * and `close foreground / midground / distant background`).
 */
export function buildTemporalTimeline(
  shot: ShotSpec,
  precomputedPov?: ShotPovVisibilityReport
): TemporalPromptBeat[] {
  const duration = Math.max(1.0, shot.durationSeconds);
  const t1 = Number((duration * 0.35).toFixed(1));
  const t2 = Number((duration * 0.75).toFixed(1));

  const pov = precomputedPov || analyzeShotPovVisibility(shot);

  const camType = shot.camera.movement.type;
  const speed = shot.camera.movement.speed;
  const pacing = shot.camera.movement.pacing || 'ease-in-out';
  const speedTerm = speed === 'slow-cinematic' ? 'gentle' : speed === 'rapid-dynamic' ? 'brisk' : 'steady';

  // Helper for camera phase
  const getCameraPhase = (phase: BeatPhase) => {
    if (camType === 'static') return 'Camera holds a motionless locked-off frame';
    if (phase === 'open') {
      return `Camera establishes framing and initiates a ${speedTerm} ${camType.replace(/-/g, ' ')} with ${pacing} pacing`;
    }
    if (phase === 'mid') {
      return `Camera continues active ${camType.replace(/-/g, ' ')} across the scene, maintaining dynamic framing and parallax`;
    }
    return `Camera smoothly decelerates, settling into the final composition and locking focus`;
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
        const startPos = actor.trajectory?.startPosition ?? { x: 50, y: 50 };
        const endPos = actor.trajectory?.endPosition ?? { x: 50, y: 50 };
        const hasDisplacement =
          Math.abs(startPos.x - endPos.x) > 3 || Math.abs(startPos.y - endPos.y) > 3;

        const currentZone = beatState.screenZone;
        const openZone = analysis.beats.open.visible ? analysis.beats.open.screenZone : currentZone;
        const closeZone = analysis.beats.close.visible ? analysis.beats.close.screenZone : currentZone;
        const coverageNote =
          beatState.coverage !== 'full-body' ? ` in ${beatState.coverage} framing` : '';

        const kfs = (actor.trajectory?.keyframes || []).filter(
          (k) => k.posePreset || k.cueLabel || k.gait
        );
        const openCue = kfs.find((k) => k.time <= t1);
        const midCue = kfs.find((k) => k.time > t1 && k.time <= t2);
        const closeCue = kfs.find((k) => k.time > t2);

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
        const clipStr = actor.motionClip
          ? ` [motion clip: ${actor.motionClip.replace(/-/g, ' ')}${
              actor.motionCycles && actor.motionCycles > 1 ? ` ×${actor.motionCycles} cycles` : ''
            }]`
          : actor.motionCycles && actor.motionCycles > 1
          ? ` [×${actor.motionCycles} cycles]`
          : '';

        const exitsAfterOpen = phase === 'open' && !analysis.visibleInBeats.mid;
        const entersInMid = phase === 'mid' && !analysis.visibleInBeats.open;
        const exitsAfterMid = phase === 'mid' && !analysis.visibleInBeats.close;
        const entersInClose =
          phase === 'close' && !analysis.visibleInBeats.open && !analysis.visibleInBeats.mid;

        if (phase === 'open') {
          const exitSuffix = exitsAfterOpen
            ? ' before moving out of the camera frame as the view shifts'
            : '';
          if (actStart > t1) {
            return `${actor.name}${socketStr} holds initial position in the ${currentZone}${coverageNote}${openPoseStr}${exitSuffix}`;
          }
          if (hasDisplacement) {
            return `${actor.name}${socketStr} begins in the ${currentZone}${coverageNote} and initiates movement${openPoseStr}${clipStr}: ${actor.actionDescription}${exitSuffix}`;
          }
          return `${actor.name}${socketStr} remains positioned in the ${currentZone}${coverageNote}${clipStr}: ${actor.actionDescription}${exitSuffix}`;
        }

        if (phase === 'mid') {
          const entryPrefix = entersInMid
            ? `${actor.name}${socketStr} enters the camera frame in the ${currentZone}${coverageNote}`
            : `${actor.name}${socketStr}`;
          const exitSuffix = exitsAfterMid ? ', passing toward the edge of the camera frame' : '';

          if (hasDisplacement) {
            const transitionPhrase = entersInMid
              ? ` and advances toward the ${closeZone}`
              : openZone !== currentZone
              ? ` advances continuously from the ${openZone} into the ${currentZone}`
              : ` advances steadily through the ${currentZone}`;
            return `${entryPrefix}${transitionPhrase}${midPoseStr} with fluid, lifelike biomechanics—grounded heel-to-toe footsteps, natural hip weight transfer, relaxed shoulder counter-rotation, natural elbow flexion, and realistic garment drape${exitSuffix}`;
          }
          return entersInMid
            ? `${entryPrefix}${midPoseStr} (${actor.actionDescription})${exitSuffix}`
            : `${entryPrefix} stays anchored in the ${currentZone}${coverageNote} (${actor.actionDescription})${exitSuffix}`;
        }

        // close
        if (entersInClose) {
          return `${actor.name}${socketStr} enters the camera frame in the ${currentZone}${coverageNote}${closePoseStr} (${actor.actionDescription}), holding eyeline toward the camera`;
        }
        if (hasDisplacement) {
          return `${actor.name}${socketStr} arrives in the ${currentZone}${coverageNote}${closePoseStr}, settling posture and holding eyeline toward the camera`;
        }
        return `${actor.name}${socketStr} holds steady presence in the ${currentZone}${coverageNote} through the final frame`;
      })
      .join('; ');
  };

  return [
    {
      timeRange: `0.0s - ${t1}s`,
      cameraAction: getCameraPhase('open'),
      actorAction: getActorPhase('open'),
      description: `Opening beat: ${getCameraPhase('open')}. ${getActorPhase('open')}.`,
    },
    {
      timeRange: `${t1}s - ${t2}s`,
      cameraAction: getCameraPhase('mid'),
      actorAction: getActorPhase('mid'),
      description: `Progression beat: ${getCameraPhase('mid')}. ${getActorPhase('mid')}.`,
    },
    {
      timeRange: `${t2}s - ${duration.toFixed(1)}s`,
      cameraAction: getCameraPhase('close'),
      actorAction: getActorPhase('close'),
      description: `Resolution beat: ${getCameraPhase('close')}. ${getActorPhase('close')}.`,
    },
  ];
}

/**
 * LTX-2.5 (Lightricks Gemma-4 22B Distilled Audio-Visual DiT) Prompt Compiler
 * Follows official Lightricks LTX-2.5 prompting guidelines:
 * - Single continuous narrative paragraph in present tense ("walks, turns, looks, shifts").
 * - Strictly describes ONLY subjects that actually enter the camera POV frustum (`pov.visibleAnalyses`).
 * - Camera framing & optical lens defined first, followed by POV-visible subject appearances, chronological motion, and diegetic audio cues.
 * - Zero comma-soup/buzzwords ("masterpiece, 8k").
 */
export function compileLtxPrompt(shot: ShotSpec): CompiledPromptBundle {
  const pov = analyzeShotPovVisibility(shot);
  const cameraMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed, {
    arcCurve: shot.camera.movement.arcCurve,
    trackTargetActorId: shot.camera.trackTargetActorId,
    keyframes: shot.camera.movement.keyframes,
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
  const lightInfo = formatLighting(
    shot.lighting.style,
    shot.lighting.direction,
    shot.lighting.contrast,
    shot.lighting.lights
  );
  const timeline = buildTemporalTimeline(shot, pov);

  const duration = shot.durationSeconds.toFixed(1);

  // Subject descriptors filtered strictly to POV-visible subjects with true camera-relative zones
  const subjectSentence =
    pov.visibleAnalyses.length > 0
      ? `In the camera frame, ${pov.visibleAnalyses
          .map((analysis) => {
            const actor = analysis.actor;
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
                : 'positioned in the ';
            return `${scalePrefix}${actor.token} (${actor.name}, ${entryTiming}${analysis.primaryScreenZone})`;
          })
          .join(' and ')}.`
      : '';

  // Construct fluid, present-tense chronological narrative
  const openingActorAction = timeline[0].actorAction;
  const midActorAction = timeline[1].actorAction;
  const closingActorAction = timeline[2].actorAction;

  const soundscapeSentence =
    pov.visibleAnalyses.length > 0
      ? `Natural environmental acoustics matching ${shot.environment?.name || 'the space'}, subtle footsteps, and physical cloth movement accompany the action.`
      : `Natural ambient soundscape and spatial acoustics fill ${shot.environment?.name || 'the environment'}.`;

  const narrativeProgression = `Throughout the continuous ${duration}-second take, the ${cameraMove}. At the opening of the shot (${timeline[0].timeRange}), ${openingActorAction}. Over the mid-shot progression (${timeline[1].timeRange}), ${timeline[1].cameraAction.toLowerCase()} as ${midActorAction}. Towards the final resolution (${timeline[2].timeRange}), ${closingActorAction}, while the camera smoothly holds focus. ${soundscapeSentence}`;

  const envText = shot.environment ? formatEnvironment(shot.environment) : '';

  const positivePrompt = [
    `Cinematic ${shot.aspectRatio} ${angleInfo}, filmed on a ${lensInfo}.`,
    subjectSentence,
    envText ? `Setting: ${envText}.` : '',
    `${shot.sceneDescription.trim()}.`,
    shot.claymationMode
      ? `Authentic stop-motion claymation aesthetic, handcrafted malleable clay surface textures, subtle fingerprint imperfections, animated on-twos at ${shot.claymationFps || 12}fps motion cadence.`
      : `Atmospheric environment under ${lightInfo}, with volumetric light bounce, natural motion cadence at 24fps, and physical depth.`,
    narrativeProgression,
  ]
    .filter(Boolean)
    .join(' ');

  const negativePrompt =
    shot.negativePrompt ||
    'jitter, warping, temporal flicker, distorted anatomy, morphing faces, plastic skin, jittery frame skips, overexposed, low quality, 3d render, watermark, blurry';

  return {
    positivePrompt,
    negativePrompt,
    cameraDirectives: `${angleInfo}. ${cameraMove}. Shot on ${lensInfo}.`,
    actorDirectives:
      pov.visibleAnalyses.length > 0
        ? pov.visibleAnalyses
            .map(
              (a) =>
                `${a.actor.token} (${a.actor.actionDescription}; POV: ${a.primaryScreenZone}${
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
 * - subject_definitions: Maps <Subject 1..N> to <picture 1..N> ONLY for POV-visible actors (`pov.visibleAnalyses`),
 *   plus <Subject 4> (<picture 4> environment) and <Video 1> (3D previz plate).
 * - summary: [reference generation] overview.
 * - retention_analysis: Identity & attribute transfer directives with official `(present throughout)` vs `(appears in [Shot 1])` tags.
 * - detailed_description: Continuous time-stamped [Shot 1] camera, optics, and POV-visible micro-acting choreography.
 * - overall_soundscape & non_diegetic_music: Drives the MiniMax H3 audio VAE decoder.
 */
export function compileMiniMaxPrompt(shot: ShotSpec): CompiledPromptBundle {
  const pov = analyzeShotPovVisibility(shot);
  const cameraMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed, {
    arcCurve: shot.camera.movement.arcCurve,
    trackTargetActorId: shot.camera.trackTargetActorId,
    keyframes: shot.camera.movement.keyframes,
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
  const lightInfo = formatLighting(
    shot.lighting.style,
    shot.lighting.direction,
    shot.lighting.contrast,
    shot.lighting.lights
  );
  const timeline = buildTemporalTimeline(shot, pov);
  const envText = shot.environment ? formatEnvironment(shot.environment) : '';
  const defaultPalette = ['#EF4444', '#06B6D4', '#F59E0B', '#10B981'];

  // Build actor subject definitions (<Subject 1..3>) strictly from POV-visible actors + <Subject 4> environment
  const subjectDefLines: string[] = [];
  const retentionLines: string[] = [];
  const proxySpatialAnchors: string[] = [];

  const visibleTop3 = pov.visibleAnalyses.slice(0, 3);
  for (let i = 0; i < visibleTop3.length; i++) {
    const analysis = visibleTop3[i];
    const actor = analysis.actor;
    const subjIdx = i + 1;
    const hex = (actor.color || defaultPalette[i]).toUpperCase();
    const horizZone = analysis.primaryHorizontalZone;
    const presenceTag = analysis.visibleInAllBeats
      ? 'present throughout'
      : analysis.firstVisibleBeat === 'mid'
      ? 'appears in [Shot 1] mid-shot progression'
      : analysis.firstVisibleBeat === 'close'
      ? 'appears in [Shot 1] closing beat'
      : 'appears in [Shot 1]';

    const isHuman =
      actor.kind === 'character' ||
      actor.kind === 'human' ||
      /agent|man|woman|person|operative|detective|guard|hero|runner|character/i.test(
        `${actor.name} ${actor.token}`
      );

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
      ? ` (carrying prop attached to bone ${actor.socketToBone.boneName})`
      : '';

    proxySpatialAnchors.push(
      `<Subject ${subjIdx}> (${actor.name}) replaces the ${hex} proxy in the ${horizZone}`
    );

    if (isHuman) {
      subjectDefLines.push(
        `<Subject ${subjIdx}> is ${actor.name}, defined by <picture ${subjIdx}>: ${scalePrefix}${actor.token}${socketNote}, ${actor.actionDescription}. Preserve the exact facial identity, hair, and wardrobe across all angles. Replaces the ${hex} 3D mannequin figure in the ${horizZone} of <Video 1>; the ${hex} color is an identification cue, not skin or clothing color.`
      );
      retentionLines.push(
        `<Subject ${subjIdx}> (${presenceTag}): fully_preserved - retain facial identity, hair, and wardrobe from <picture ${subjIdx}> while following the exact ${horizZone} trajectory of the ${hex} figure in <Video 1>.`
      );
    } else {
      subjectDefLines.push(
        `<Subject ${subjIdx}> is ${actor.name}, defined by <picture ${subjIdx}>: ${scalePrefix}${actor.token} positioned on the ${horizZone} (${actor.actionDescription}). Replaces the ${hex} 3D proxy object on the ${horizZone} of <Video 1>; keep it strictly on the ${horizZone} as shown in <Video 1>, and replace the ${hex} proxy tint with realistic materials from <picture ${subjIdx}>.`
      );
      retentionLines.push(
        `<Subject ${subjIdx}> (${presenceTag}): attribute_transfer - strictly retain the ${horizZone} position, scale, and orientation from <Video 1>, rendered with the realistic appearance of <picture ${subjIdx}>.`
      );
    }
  }

  if (pov.visibleAnalyses.length > 3) {
    for (let i = 3; i < pov.visibleAnalyses.length; i++) {
      const extraAnalysis = pov.visibleAnalyses[i];
      const extraActor = extraAnalysis.actor;
      const hex = (extraActor.color || defaultPalette[i % defaultPalette.length]).toUpperCase();
      proxySpatialAnchors.push(
        `${extraActor.name} (${extraActor.token}) replaces the ${hex} proxy in the ${extraAnalysis.primaryHorizontalZone}`
      );
    }
  }

  const envDesc = `${shot.environment?.promptDescription || shot.sceneDescription.trim()}${
    envText ? ` (${envText})` : ''
  }`;
  subjectDefLines.push(
    `<Subject 4> is the [Scene Environment]: ${envDesc}, replacing the dark-slate #334155 previz architecture blocks presented by <picture 4>, while preserving the open spatial width and ground plane layout of <Video 1>.`
  );
  retentionLines.push(
    `<Subject 4> (present throughout): attribute_transfer - preserve the wide spatial layout and ground-plane relationships of <Video 1> while applying the realistic surface textures and lighting atmosphere from <picture 4>.`
  );

  const blockingDetail =
    proxySpatialAnchors.length > 0
      ? ` and exact camera-POV spatial blocking (${proxySpatialAnchors.join('; ')})`
      : ' across the environment';
  subjectDefLines.push(
    `<Video 1> is the supplied 3D previz reference video. Reference the animated 3D camera movement, perspective,${blockingDetail}. Replace any synthetic 3D mannequin limb stiffness with fluid, organic human biomechanics (natural heel-to-toe footfalls, relaxed shoulder counter-swing, bent elbows, and steady head stabilization). Exclude any flat proxy shading or helper artifacts.`
  );
  retentionLines.push(
    `<Video 1> ([Shot 1] motion and blocking reference): partially_preserved - strictly retain the continuous 3D camera trajectory${
      proxySpatialAnchors.length > 0 ? ', camera-POV subject arrangement, and locomotion speed' : ' and environmental perspective'
    } across the ${shot.durationSeconds.toFixed(1)}-second duration${
      proxySpatialAnchors.length > 0 ? ' while rendering lifelike, natural human gait physics' : ''
    }.`
  );

  // Subject micro-acting summary for metadata (POV-visible only)
  const subjectBlocks = pov.visibleAnalyses
    .map(
      (a) =>
        `${a.actor.token} (${a.actor.name}, POV: ${a.primaryScreenZone}): ${a.actor.actionDescription}`
    )
    .join('; ');

  const styleLine = shot.claymationMode
    ? `Authentic stop-motion claymation aesthetic, handcrafted malleable clay surface textures, tactile fingerprint imperfections, animated on-twos at ${shot.claymationFps || 12}fps motion cadence.`
    : `The target video is a photorealistic cinema shot in ${shot.aspectRatio}, lasting ${shot.durationSeconds.toFixed(1)} seconds at 24fps motion cadence. Use one uninterrupted take with ${lensInfo}, ${angleInfo}, ${cameraMove}, realistic motion blur, and natural 180-degree shutter angle.`;

  const beatParagraphs = timeline
    .map((beat, idx) => {
      const prefix = idx === 0 ? `[Shot 1] From ${beat.timeRange}` : `From ${beat.timeRange}`;
      return `${prefix}, ${beat.cameraAction}. Simultaneously, ${beat.actorAction}.`;
    })
    .join('\n\n');

  const refRangePhrase =
    visibleTop3.length > 0
      ? `<picture 1>–<picture ${visibleTop3.length}> and <picture 4> for subject and environment identity`
      : `<picture 4> for environment identity`;

  const positivePrompt = [
    `subject_definitions:\n${subjectDefLines.join('\n\n')}`,
    `summary: [reference generation] Create a cinematic, photorealistic ${shot.aspectRatio}, ${shot.durationSeconds.toFixed(1)}-second continuous shot ("${shot.name}"), using <Video 1> for blocking and camera-path guidance and ${refRangePhrase}.`,
    `retention_analysis:\n${retentionLines.join('\n')}`,
    `detailed_description: ${styleLine}\n\n${beatParagraphs}\n\nThroughout, ${lightInfo}. Preserve natural skin tones, readable facial micro-expressions, and physical depth. No readable text, subtitles, or interface graphics.`,
    `overall_soundscape: Natural environmental ambiance matching ${
      shot.environment?.name || 'the scene'
    }${
      visibleTop3.length > 0
        ? ', realistic footsteps and cloth movement synchronized with visible subject locomotion,'
        : ','
    } and subtle spatial acoustics. No unintended vocalizations.`,
    `non_diegetic_music: N/A.`,
  ].join('\n\n');

  const negativePrompt =
    shot.negativePrompt ||
    'blurry, low quality, deformed limbs, floating artifacts, jerky camera, unnatural motion, digital noise, oversaturated, morphing';

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
 * - Structured brackets emphasizing 6-axis camera motion matrix coordinates, POV-visible subject locomotion physics,
 *   sequential cue timetables, spatial volumetric lighting, and optical sensor profiles.
 */
export function compileSeedancePrompt(shot: ShotSpec): CompiledPromptBundle {
  const pov = analyzeShotPovVisibility(shot);
  const cameraMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed, {
    arcCurve: shot.camera.movement.arcCurve,
    trackTargetActorId: shot.camera.trackTargetActorId,
    keyframes: shot.camera.movement.keyframes,
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
  const lightInfo = formatLighting(
    shot.lighting.style,
    shot.lighting.direction,
    shot.lighting.contrast,
    shot.lighting.lights
  );
  const timeline = buildTemporalTimeline(shot, pov);
  const envText = shot.environment ? formatEnvironment(shot.environment) : '';

  const dx = ((shot.camera.movement.endPosition.x - shot.camera.movement.startPosition.x) / 10.0).toFixed(2);
  const dy = ((shot.camera.movement.endPosition.y - shot.camera.movement.startPosition.y) / 10.0).toFixed(2);
  const dz = (((shot.camera.movement.endPosition.z ?? 50) - (shot.camera.movement.startPosition.z ?? 50)) / 10.0).toFixed(2);

  // Subject with aerodynamic & locomotion physics (strictly filtered to POV-visible subjects)
  const subjectBlocks = pov.visibleAnalyses
    .map((analysis) => {
      const actor = analysis.actor;
      const scale = actor.scale ?? 1.0;
      const scalePrefix =
        scale >= 2.0 ? 'towering scale ' : scale >= 1.4 ? 'large scale ' : scale <= 0.5 ? 'miniature scale ' : '';
      const start = actor.trajectory?.startPosition ?? { x: 50, y: 50 };
      const end = actor.trajectory?.endPosition ?? { x: 50, y: 50 };
      const socketPart = actor.socketToBone ? ` [Socketed: Bone ${actor.socketToBone.boneName}]` : '';
      const closeZone = analysis.beats.close.visible
        ? analysis.beats.close.screenZone
        : analysis.primaryScreenZone;
      return `${scalePrefix}${actor.token} (${actor.name})${socketPart} [Camera POV Framing: ${analysis.primaryScreenZone} -> ${closeZone} | Stage Vector: (${start.x}%, ${start.y}%) -> (${end.x}%, ${end.y}%)], performing: ${actor.actionDescription}, attire aerodynamic drape and physical mass responding to acceleration`;
    })
    .join('; ');

  // Chronological cue beats
  const timelineString = timeline
    .map((beat) => `[${beat.timeRange}]: ${beat.cameraAction}; ${beat.actorAction}`)
    .join(' | ');

  const positivePrompt = [
    `[Camera 6-Axis Motion & Matrix Trajectory]: ${angleInfo}, ${cameraMove}, 3D displacement vector (dx: ${dx}, dy: ${dy}, dz: ${dz}), filmed on ${lensInfo}.`,
    subjectBlocks ? `[Subject Dynamics & Aerodynamic Physics]: ${subjectBlocks}.` : '',
    `[Temporal Cue Timetable]: ${timelineString}.`,
    `[Atmospheric Space & Volumetric Lighting]: ${lightInfo}, volumetric shadow falloff, spatial air density, scene environment: ${
      shot.environment?.promptDescription || shot.sceneDescription.trim()
    }${envText ? ` (${envText})` : ''}.`,
    shot.claymationMode
      ? `[Render & Motion Profile]: Stop-motion claymation aesthetic, handcrafted tactile clay micro-textures, ${
          shot.claymationFps || 12
        }fps on-twos motion cadence.`
      : `[Render & Motion Profile]: Optical photorealism, 24fps motion matrix coherence, natural 180-degree optical shutter angle, rich texture fidelity.`,
  ]
    .filter(Boolean)
    .join(' ');

  const negativePrompt =
    shot.negativePrompt ||
    'floating artifacts, frame tearing, flickering geometry, unnatural jerky acceleration, low resolution, warped proportions, morphing hands, plastic textures, watermark';

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

