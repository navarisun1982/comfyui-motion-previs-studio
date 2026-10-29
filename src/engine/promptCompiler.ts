import { ShotSpec, CameraMovementType, FocalLength, CameraAngle, LightingStyle, LightingDirection, EnvironmentSpec } from '../types/shotspec';
import { CompiledPromptBundle, TemporalPromptBeat } from '../adapters/types';

export function formatEnvironment(env?: EnvironmentSpec): string {
  if (!env) return '';
  const parts = [
    env.promptDescription || env.name,
    env.weather && env.weather !== 'clear' ? `weather condition ${env.weather}` : '',
    env.timeOfDay ? `time of day ${env.timeOfDay.replace(/-/g, ' ')}` : '',
    env.groundSurface ? `ground surface ${env.groundSurface.replace(/-/g, ' ')}` : '',
    env.fogDensity && env.fogDensity > 0.25 ? `atmospheric haze and volumetric fog (density ${Math.round(env.fogDensity * 100)}%)` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

export function formatCameraMovement(type: CameraMovementType, speed: string): string {
  const speedPhrase = speed === 'slow-cinematic' ? 'slow, controlled' : speed === 'rapid-dynamic' ? 'fast, energetic' : 'steady, continuous';
  
  switch (type) {
    case 'dolly-in':
      return `steady camera dolly-in (dolly in) push, camera physically moving forward toward the subject at a ${speedPhrase} pace, creating increasing emotional intimacy`;
    case 'dolly-out':
      return `smooth camera dolly-out (dolly out) pull, camera smoothly moving backward away from the subject at a ${speedPhrase} pace, revealing the surrounding environment`;
    case 'truck-left':
      return `smooth horizontal truck left, camera laterally sliding to the left parallel to the action at a ${speedPhrase} pace`;
    case 'truck-right':
      return `smooth horizontal truck right, camera laterally sliding to the right parallel to the action at a ${speedPhrase} pace`;
    case 'pedestal-up':
      return `vertical pedestal-up movement, camera physically elevating upward vertically at a ${speedPhrase} pace`;
    case 'pedestal-down':
      return `vertical pedestal-down movement, camera descending downward toward the floor at a ${speedPhrase} pace`;
    case 'pan-left':
      return `panning camera rotation to the left, smooth rotational scan across the space`;
    case 'pan-right':
      return `panning camera rotation to the right, sweeping rotational scan across the space`;
    case 'tilt-up':
      return `tilting camera upward, rotating camera axis up toward the ceiling/sky`;
    case 'tilt-down':
      return `tilting camera downward, rotating camera axis down toward the subject's feet/ground`;
    case 'orbit-clockwise':
      return `smooth 360 orbit camera arc moving clockwise around the focal subject, dynamic volumetric parallax`;
    case 'orbit-counter-clockwise':
      return `smooth circular orbit arc moving counter-clockwise around the focal subject, dynamic volumetric parallax`;
    case 'zoom-in':
      return `optical zoom-in lens compression, focal length narrowing toward subject, background compression`;
    case 'zoom-out':
      return `optical zoom-out lens expansion, wide perspective reveal`;
    case 'handheld-subtle':
      return `subtle organic handheld camera feel, breathing cinematic realism with gentle natural stabilization`;
    case 'whip-pan':
      return `rapid whip-pan transition, fast motion blur swish`;
    case 'static':
    default:
      return `locked-off tripod shot, completely stable, motionless camera frame`;
  }
}

export function formatLens(focalLength: FocalLength, aperture: string): string {
  switch (focalLength) {
    case '18mm':
      return `ultra-wide 18mm lens, broad expansive field of view, subtle wide-angle perspective distortion at edges, deep focus`;
    case '24mm':
      return `wide 24mm lens, environmental framing with cinematic presence, crisp background context`;
    case '35mm':
      return `classic 35mm cinema prime lens, natural human perspective, gentle background separation at ${aperture}`;
    case '50mm':
      return `50mm lens, standard focal length prime, zero perspective distortion, natural cinematic depth of field at ${aperture}`;
    case '85mm':
      return `85mm telephoto portrait lens, creamy shallow depth of field, compressed background bokeh at ${aperture}, isolated subject`;
    case '135mm':
      return `135mm long telephoto lens, extreme cinematic background compression, soft creamy bokeh`;
    default:
      return `${focalLength} lens, cinematic optics`;
  }
}

export function formatCameraAngle(angle: CameraAngle, shotType: string): string {
  const shotPhrase = shotType.replace(/-/g, ' ');
  switch (angle) {
    case 'low-angle':
      return `${shotPhrase} shot, low-angle perspective looking up at subject, conveying stature and authority`;
    case 'high-angle':
      return `${shotPhrase} shot, high-angle perspective angled downward, vulnerable composition`;
    case 'overhead-gods-eye':
      return `overhead god's eye view, perpendicular top-down vertical perspective`;
    case 'ground-level':
      return `ground-level perspective, camera skimming just above the surface`;
    case 'dutch-angle':
      return `${shotPhrase} shot, Dutch tilt angle, canted horizon line evoking psychological tension`;
    case 'eye-level':
    default:
      return `${shotPhrase} shot, neutral eye-level framing, balanced horizontal composition`;
  }
}

export function formatLighting(style: LightingStyle, direction: LightingDirection, contrast: string): string {
  const dirPhrase = direction.replace(/-/g, ' ');
  const contrastPhrase = contrast === 'high-contrast' ? 'stark chiaroscuro contrast' : contrast === 'soft' ? 'soft diffused shadows' : 'balanced cinematic contrast';
  
  switch (style) {
    case 'low-key-film-noir':
      return `low-key film noir lighting, ${dirPhrase} light source with deep rich shadows and ${contrastPhrase}`;
    case 'neon-cyberpunk':
      return `stylized cyberpunk volumetric lighting, saturated neon rim lights and practical street reflections, ${contrastPhrase}`;
    case 'golden-hour':
      return `warm golden-hour sunlight, long warm shadows, backlit rim glow, ${dirPhrase}`;
    case 'moonlight-foggy':
      return `cool atmospheric moonlight through subtle fog, desaturated blue hues, ${dirPhrase}`;
    case 'practical-candlelight':
      return `warm flickering candlelight glow, intimate falloff, deep shadow roll-off`;
    case 'harsh-fluorescent':
      return `clinical fluorescent overhead tubes, cool greenish-white tint, industrial atmosphere`;
    case 'high-key-studio':
      return `high-key commercial lighting, clean even illumination across the scene, minimal shadows`;
    case 'cinematic-natural':
    default:
      return `natural cinematic film lighting, realistic ambient bounce, ${dirPhrase} illumination with ${contrastPhrase}`;
  }
}

/**
 * Builds chronological temporal stages for the shot based on stage duration,
 * camera motion speed/pacing, and actor trajectory timing.
 */
export function buildTemporalTimeline(shot: ShotSpec): TemporalPromptBeat[] {
  const duration = Math.max(1.0, shot.durationSeconds);
  const t1 = Number((duration * 0.35).toFixed(1));
  const t2 = Number((duration * 0.75).toFixed(1));

  const camType = shot.camera.movement.type;
  const speed = shot.camera.movement.speed;
  const pacing = shot.camera.movement.pacing || 'ease-in-out';
  const speedTerm = speed === 'slow-cinematic' ? 'gentle' : speed === 'rapid-dynamic' ? 'brisk' : 'steady';

  // Helper for camera phase
  const getCameraPhase = (phase: 'open' | 'mid' | 'close') => {
    if (camType === 'static') return 'Camera holds a motionless locked-off frame';
    if (phase === 'open') {
      return `Camera establishes framing and initiates a ${speedTerm} ${camType.replace(/-/g, ' ')} with ${pacing} pacing`;
    }
    if (phase === 'mid') {
      return `Camera continues active ${camType.replace(/-/g, ' ')} across the scene, maintaining dynamic framing and parallax`;
    }
    return `Camera smoothly decelerates, settling into the final composition and locking focus`;
  };

  // Helper for actor phase
  const getActorPhase = (phase: 'open' | 'mid' | 'close') => {
    if (!shot.actors || shot.actors.length === 0) {
      return 'Scene environment exhibits continuous natural ambient motion';
    }
    return shot.actors.map((actor) => {
      const actStart = actor.trajectory?.startTimeSeconds ?? 0;
      const startPos = actor.trajectory?.startPosition ?? { x: 50, y: 50 };
      const endPos = actor.trajectory?.endPosition ?? { x: 50, y: 50 };
      const hasDisplacement = Math.abs(startPos.x - endPos.x) > 3 || Math.abs(startPos.y - endPos.y) > 3;

      const kfs = (actor.trajectory?.keyframes || []).filter((k) => k.posePreset || k.cueLabel);
      const openCue = kfs.find((k) => k.time <= t1);
      const midCue = kfs.find((k) => k.time > t1 && k.time <= t2);
      const closeCue = kfs.find((k) => k.time > t2);

      const openPoseStr = openCue ? ` in ${openCue.cueLabel || `${openCue.posePreset?.replace(/-/g, ' ')} pose`}` : '';
      const midPoseStr = midCue ? `, transitioning posture into ${midCue.cueLabel || `${midCue.posePreset?.replace(/-/g, ' ')} pose`}` : '';
      const closePoseStr = closeCue ? `, settling into ${closeCue.cueLabel || `${closeCue.posePreset?.replace(/-/g, ' ')} pose`}` : '';

      const socketStr = actor.socketToBone ? ` (attached to bone ${actor.socketToBone.boneName})` : '';

      if (phase === 'open') {
        if (actStart > t1) {
          return `${actor.name}${socketStr} holds initial stance${openPoseStr} at stage coordinates (${startPos.x}%, ${startPos.y}%), awaiting action cue`;
        }
        return `${actor.name}${socketStr} initiates action${openPoseStr}: ${actor.actionDescription} from mark (${startPos.x}%, ${startPos.y}%)`;
      }
      if (phase === 'mid') {
        if (hasDisplacement) {
          return `${actor.name}${socketStr} advances in continuous physical movement across the stage toward (${endPos.x}%, ${endPos.y}%)${midPoseStr}, physical dynamics and attire shifting with locomotion`;
        }
        return `${actor.name}${socketStr} performs active physical gestures: ${actor.actionDescription}${midPoseStr}`;
      }
      // close
      if (hasDisplacement) {
        return `${actor.name}${socketStr} reaches target mark (${endPos.x}%, ${endPos.y}%)${closePoseStr}, settling posture and holding eyeline`;
      }
      return `${actor.name}${socketStr} resolves action${closePoseStr}, holding steady presence in final frame`;
    }).join('; ');
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
 * LTX-2.5 (Lightricks DiT) Prompt Compiler
 * Follows official Lightricks DiT prompting guidelines:
 * - Single continuous narrative paragraph in present tense ("walks, turns, looks, shifts").
 * - Action verbs driving frame-to-frame motion mechanics instead of static adjectives.
 * - Camera framing & motion defined first, followed by subject appearance and chronological motion.
 * - Zero comma-soup/buzzwords ("masterpiece, 8k").
 */
export function compileLtxPrompt(shot: ShotSpec): CompiledPromptBundle {
  const cameraMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed);
  const lensInfo = formatLens(shot.camera.lens.focalLength, shot.camera.lens.aperture);
  const angleInfo = formatCameraAngle(shot.camera.angle, shot.camera.shotType);
  const lightInfo = formatLighting(shot.lighting.style, shot.lighting.direction, shot.lighting.contrast);
  const timeline = buildTemporalTimeline(shot);

  const duration = shot.durationSeconds.toFixed(1);

  // Subject descriptors with scale
  const subjectText = shot.actors.length > 0
    ? shot.actors.map((actor) => {
        const scale = actor.scale ?? 1.0;
        const scalePrefix = scale >= 2.0 ? 'towering, massive ' : scale >= 1.4 ? 'large, prominent ' : scale <= 0.4 ? 'miniature, tiny ' : scale <= 0.7 ? 'small ' : '';
        return `${scalePrefix}${actor.token} (${actor.name})`;
      }).join(' and ')
    : 'the scene subjects';

  // Construct fluid, present-tense chronological narrative
  const openingActorAction = timeline[0].actorAction;
  const midActorAction = timeline[1].actorAction;
  const closingActorAction = timeline[2].actorAction;

  const narrativeProgression = `Throughout the continuous ${duration}-second take, the ${cameraMove}. At the opening of the shot (${timeline[0].timeRange}), ${openingActorAction}. Over the mid-shot progression (${timeline[1].timeRange}), ${timeline[1].cameraAction.toLowerCase()} as ${midActorAction}. Towards the final resolution (${timeline[2].timeRange}), ${closingActorAction}, while the camera smoothly holds focus.`;

  const envText = shot.environment ? formatEnvironment(shot.environment) : '';

  const positivePrompt = [
    `Cinematic ${shot.aspectRatio} ${angleInfo}, filmed on a ${lensInfo}.`,
    `In the scene, ${subjectText}.`,
    envText ? `Setting: ${envText}.` : '',
    `${shot.sceneDescription.trim()}.`,
    shot.claymationMode
      ? `Authentic stop-motion claymation aesthetic, handcrafted malleable clay surface textures, subtle fingerprint imperfections, animated on-twos at ${shot.claymationFps || 12}fps motion cadence.`
      : `Atmospheric environment under ${lightInfo}, with volumetric light bounce, natural motion cadence at 24fps, and physical depth.`,
    narrativeProgression,
  ].filter(Boolean).join(' ');

  const negativePrompt = shot.negativePrompt || 'jitter, warping, temporal flicker, distorted anatomy, morphing faces, plastic skin, jittery frame skips, overexposed, low quality, 3d render, watermark, blurry';

  return {
    positivePrompt,
    negativePrompt,
    cameraDirectives: `${angleInfo}. ${cameraMove}. Shot on ${lensInfo}.`,
    actorDirectives: shot.actors.map((a) => `${a.token} (${a.actionDescription}${a.socketToBone ? `; attached to bone ${a.socketToBone.boneName}` : ''})`).join('; '),
    lightingDirectives: `Lighting: ${lightInfo}.`,
    styleDirectives: shot.claymationMode
      ? `Stop-motion claymation aesthetic, handcrafted clay textures, ${shot.claymationFps || 12}fps on-twos motion cadence.`
      : 'Cinematic film aesthetic, 24fps motion cadence, natural shutter angle, high dynamic range.',
    temporalBeats: timeline,
    modelPromptParadigm: 'ltx-continuous-narrative',
    technicalMetadata: {
      targetModel: 'ltx-2.5',
      duration: shot.durationSeconds,
      fps: shot.claymationMode ? (shot.claymationFps || 12) : shot.frameRate,
      focalLength: shot.camera.lens.focalLength,
      aspectRatio: shot.aspectRatio,
    },
  };
}

/**
 * MiniMax H3 / Hailuo Reference-to-Video (Ref2VA) Prompt Compiler
 * Follows the official MiniMax H3 Reference-to-Video multi-subject & video-reference schema:
 * - subject_definitions: Maps <Subject 1..4> to <picture 1..4> and 3D previz hex color IDs, plus <Video 1> (3D previz plate).
 * - summary: [reference generation] overview.
 * - retention_analysis: Identity & attribute transfer directives for <Subject 1..4> and <Video 1>.
 * - detailed_description: Continuous time-stamped [Shot 1] camera, optics, and micro-acting choreography.
 * - overall_soundscape & non_diegetic_music: Drives the MiniMax H3 audio VAE decoder.
 */
export function compileMiniMaxPrompt(shot: ShotSpec): CompiledPromptBundle {
  const cameraMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed);
  const lensInfo = formatLens(shot.camera.lens.focalLength, shot.camera.lens.aperture);
  const angleInfo = formatCameraAngle(shot.camera.angle, shot.camera.shotType);
  const lightInfo = formatLighting(shot.lighting.style, shot.lighting.direction, shot.lighting.contrast);
  const timeline = buildTemporalTimeline(shot);
  const envText = shot.environment ? formatEnvironment(shot.environment) : '';
  const defaultPalette = ['#EF4444', '#06B6D4', '#F59E0B', '#10B981'];

  // Build up to 3 actor subject definitions (<Subject 1..3>) + <Subject 4> environment
  const subjectDefLines: string[] = [];
  const retentionLines: string[] = [];

  for (let i = 0; i < 3; i++) {
    const actor = shot.actors[i];
    const subjIdx = i + 1;
    if (actor) {
      const hex = (actor.color || defaultPalette[i]).toUpperCase();
      const scale = actor.scale ?? 1.0;
      const scalePrefix =
        scale >= 2.0 ? 'towering, massive ' : scale >= 1.4 ? 'large, prominent ' : scale <= 0.4 ? 'miniature, tiny ' : scale <= 0.7 ? 'small ' : '';
      const socketNote = actor.socketToBone ? ` (carrying prop attached to bone ${actor.socketToBone.boneName})` : '';
      subjectDefLines.push(
        `<Subject ${subjIdx}> is ${actor.name}, defined by <picture ${subjIdx}>: ${scalePrefix}${actor.token}${socketNote}, performing ${actor.actionDescription}. Preserve the same identity across all angles. Replaces the ${hex} previz figure; the color is an identification cue, not surface skin/paint.`
      );
      retentionLines.push(
        `<Subject ${subjIdx}> (appears in [Shot 1]): ${actor.kind === 'character' ? 'fully_preserved - facial identity, hair, and wardrobe from <picture ' + subjIdx + '>' : 'attribute_transfer - retain previz spatial role and trajectory from <picture ' + subjIdx + '>'}.`
      );
    } else {
      subjectDefLines.push(
        `<Subject ${subjIdx}> is an auxiliary scene element defined by <picture ${subjIdx}>, preserving natural material fidelity within the shot.`
      );
      retentionLines.push(
        `<Subject ${subjIdx}> (appears in [Shot 1]): attribute_transfer - preserve reference appearance from <picture ${subjIdx}>.`
      );
    }
  }

  const envDesc = `${shot.environment?.promptDescription || shot.sceneDescription.trim()}${envText ? ` (${envText})` : ''}`;
  subjectDefLines.push(
    `<Subject 4> is the [Scene Environment]: ${envDesc}, replacing the dark-slate #334155 previz architecture blocks presented by <picture 4>, with rich material textures and atmospheric depth.`
  );
  retentionLines.push(
    `<Subject 4> (appears in [Shot 1]): attribute_transfer - preserve spatial layout and architectural relationships while replacing proxy geometry with realistic architecture from <picture 4>.`
  );

  subjectDefLines.push(
    `<Video 1> is the supplied 3D previz reference video. Reference only the animated 3D camera movement, spatial layout, and character blocking. Exclude any proxy wireframe or helper artifacts.`
  );
  retentionLines.push(
    `<Video 1> ([Shot 1] motion and blocking reference): partially_preserved - retain the continuous 3D camera trajectory, focal framing, and subject blocking across the ${shot.durationSeconds.toFixed(1)}-second duration.`
  );

  // Subject micro-acting summary for metadata
  const subjectBlocks = shot.actors
    .map((actor) => `${actor.token} (${actor.name}): ${actor.actionDescription}`)
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

  const positivePrompt = [
    `subject_definitions:\n${subjectDefLines.join('\n\n')}`,
    `summary: [reference generation] Create a cinematic, photorealistic ${shot.aspectRatio}, ${shot.durationSeconds.toFixed(1)}-second continuous shot ("${shot.name}"), using <Video 1> for blocking and camera-path guidance and <picture 1>–<picture 4> for subject and environment identity.`,
    `retention_analysis:\n${retentionLines.join('\n')}`,
    `detailed_description: ${styleLine}\n\n${beatParagraphs}\n\nThroughout, ${lightInfo}. Preserve natural skin tones, readable facial micro-expressions, and physical depth. No readable text, subtitles, or interface graphics.`,
    `overall_soundscape: Natural environmental ambiance matching ${shot.environment?.name || 'the scene'}, realistic footsteps and cloth movement synchronized with subject locomotion, and subtle spatial acoustics. No unintended vocalizations.`,
    `non_diegetic_music: N/A.`,
  ].join('\n\n');

  const negativePrompt = shot.negativePrompt || 'blurry, low quality, deformed limbs, floating artifacts, jerky camera, unnatural motion, digital noise, oversaturated, morphing';

  return {
    positivePrompt,
    negativePrompt,
    cameraDirectives: `${angleInfo}. ${cameraMove}. Shot on ${lensInfo}.`,
    actorDirectives: subjectBlocks || 'None',
    lightingDirectives: `Lighting: ${lightInfo}.`,
    styleDirectives: shot.claymationMode
      ? `Stop-motion claymation aesthetic, handcrafted clay textures, ${shot.claymationFps || 12}fps motion cadence.`
      : 'MiniMax H3 Ref2VA, Arri Alexa 65, cinematic realism, 24fps motion cadence, 180-degree shutter.',
    temporalBeats: timeline,
    modelPromptParadigm: 'minimax-structured-cinematic',
    technicalMetadata: {
      targetModel: 'MiniMax H3 / Hailuo',
      duration: shot.durationSeconds,
      fps: shot.claymationMode ? (shot.claymationFps || 12) : shot.frameRate,
      focalLength: shot.camera.lens.focalLength,
      aspectRatio: shot.aspectRatio,
    },
  };
}

/**
 * Seedance 2.0 (ByteDance Seaweed / SeaDance) Prompt Compiler
 * Follows official Seedance prompting guidelines:
 * - Structured brackets emphasizing 6-axis camera motion matrix coordinates, subject locomotion physics,
 *   sequential cue timetables, spatial volumetric lighting, and optical sensor profiles.
 */
export function compileSeedancePrompt(shot: ShotSpec): CompiledPromptBundle {
  const cameraMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed);
  const lensInfo = formatLens(shot.camera.lens.focalLength, shot.camera.lens.aperture);
  const angleInfo = formatCameraAngle(shot.camera.angle, shot.camera.shotType);
  const lightInfo = formatLighting(shot.lighting.style, shot.lighting.direction, shot.lighting.contrast);
  const timeline = buildTemporalTimeline(shot);
  const envText = shot.environment ? formatEnvironment(shot.environment) : '';

  const dx = ((shot.camera.movement.endPosition.x - shot.camera.movement.startPosition.x) / 10.0).toFixed(2);
  const dy = ((shot.camera.movement.endPosition.y - shot.camera.movement.startPosition.y) / 10.0).toFixed(2);
  const dz = (((shot.camera.movement.endPosition.z ?? 50) - (shot.camera.movement.startPosition.z ?? 50)) / 10.0).toFixed(2);

  // Subject with aerodynamic & locomotion physics
  const subjectBlocks = shot.actors.map((actor) => {
    const scale = actor.scale ?? 1.0;
    const scalePrefix = scale >= 2.0 ? 'towering scale ' : scale >= 1.4 ? 'large scale ' : scale <= 0.5 ? 'miniature scale ' : '';
    const start = actor.trajectory?.startPosition ?? { x: 50, y: 50 };
    const end = actor.trajectory?.endPosition ?? { x: 50, y: 50 };
    const socketPart = actor.socketToBone ? ` [Socketed: Bone ${actor.socketToBone.boneName}]` : '';
    return `${scalePrefix}${actor.token}${socketPart} [Stage Vector: (${start.x}%, ${start.y}%) -> (${end.x}%, ${end.y}%)], performing: ${actor.actionDescription}, attire aerodynamic drape and physical mass responding to acceleration`;
  }).join('; ');

  // Chronological cue beats
  const timelineString = timeline.map((beat) => `[${beat.timeRange}]: ${beat.cameraAction}; ${beat.actorAction}`).join(' | ');

  const positivePrompt = [
    `[Camera 6-Axis Motion & Matrix Trajectory]: ${angleInfo}, ${cameraMove}, 3D displacement vector (dx: ${dx}, dy: ${dy}, dz: ${dz}), filmed on ${lensInfo}.`,
    subjectBlocks ? `[Subject Dynamics & Aerodynamic Physics]: ${subjectBlocks}.` : '',
    `[Temporal Cue Timetable]: ${timelineString}.`,
    `[Atmospheric Space & Volumetric Lighting]: ${lightInfo}, volumetric shadow falloff, spatial air density, scene environment: ${shot.environment?.promptDescription || shot.sceneDescription.trim()}${envText ? ` (${envText})` : ''}.`,
    shot.claymationMode
      ? `[Render & Motion Profile]: Stop-motion claymation aesthetic, handcrafted tactile clay micro-textures, ${shot.claymationFps || 12}fps on-twos motion cadence.`
      : `[Render & Motion Profile]: Optical photorealism, 24fps motion matrix coherence, natural 180-degree optical shutter angle, rich texture fidelity.`,
  ].filter(Boolean).join(' ');

  const negativePrompt = shot.negativePrompt || 'floating artifacts, frame tearing, flickering geometry, unnatural jerky acceleration, low resolution, warped proportions, morphing hands, plastic textures, watermark';

  return {
    positivePrompt,
    negativePrompt,
    cameraDirectives: `${angleInfo}. ${cameraMove}. 3D delta: (${dx}, ${dy}, dz: ${dz}). Shot on ${lensInfo}.`,
    actorDirectives: subjectBlocks || 'None',
    lightingDirectives: `Lighting: ${lightInfo}.`,
    styleDirectives: shot.claymationMode
      ? `Stop-motion claymation aesthetic, handcrafted clay textures, ${shot.claymationFps || 12}fps on-twos motion cadence.`
      : 'Seedance 2.0 Motion Matrix, 24fps cinema cadence, optical shutter, spatial depth coherence.',
    temporalBeats: timeline,
    modelPromptParadigm: 'seedance-motion-matrix',
    technicalMetadata: {
      targetModel: 'Seedance 2.0',
      duration: shot.durationSeconds,
      fps: shot.claymationMode ? (shot.claymationFps || 12) : shot.frameRate,
      focalLength: shot.camera.lens.focalLength,
      aspectRatio: shot.aspectRatio,
      cameraDelta: { dx, dy, dz },
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

