import { ShotSpec, CameraMovementType, FocalLength, CameraAngle, LightingStyle, LightingDirection } from '../types/shotspec';
import { CompiledPromptBundle } from '../adapters/types';

export function formatCameraMovement(type: CameraMovementType, speed: string): string {
  const speedPhrase = speed === 'slow-cinematic' ? 'slow, controlled' : speed === 'rapid-dynamic' ? 'fast, energetic' : 'steady, continuous';
  
  switch (type) {
    case 'dolly-in':
      return `steady camera dolly-in push, camera physically moving forward toward the subject at a ${speedPhrase} pace, creating increasing emotional intimacy`;
    case 'dolly-out':
      return `smooth camera dolly-out pull, camera smoothly moving backward away from the subject at a ${speedPhrase} pace, revealing the surrounding environment`;
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
      return `ultra-wide 18mm cinematic lens, broad expansive field of view, subtle wide-angle perspective distortion at edges, deep focus`;
    case '24mm':
      return `wide 24mm prime lens, environmental framing with cinematic presence, crisp background context`;
    case '35mm':
      return `classic 35mm cinema prime, natural human perspective, gentle background separation at ${aperture}`;
    case '50mm':
      return `50mm standard focal length, zero perspective distortion, natural cinematic depth of field at ${aperture}`;
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

export function compilePromptForShot(shot: ShotSpec, targetModelId: string): CompiledPromptBundle {
  const cameraMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed);
  const lensInfo = formatLens(shot.camera.lens.focalLength, shot.camera.lens.aperture);
  const angleInfo = formatCameraAngle(shot.camera.angle, shot.camera.shotType);
  const lightInfo = formatLighting(shot.lighting.style, shot.lighting.direction, shot.lighting.contrast);

  // Actor blocking directives
  const actorDescriptions = shot.actors.map((actor) => {
    return `${actor.token} (${actor.actionDescription})`;
  }).join('; ');

  const cameraDirectives = `${angleInfo}. ${cameraMove}. Shot on ${lensInfo}.`;
  const actorDirectives = actorDescriptions ? `Subject blocking: ${actorDescriptions}.` : '';
  const lightingDirectives = `Lighting: ${lightInfo}.`;
  const styleDirectives = `Cinematic film aesthetic, 24fps motion cadence, natural shutter angle, high dynamic range.`;

  // Master assembled positive prompt
  const positivePrompt = [
    shot.sceneDescription.trim(),
    actorDirectives,
    cameraDirectives,
    lightingDirectives,
    styleDirectives,
  ].filter(Boolean).join(' ');

  return {
    positivePrompt,
    negativePrompt: shot.negativePrompt || 'jitter, warping, distorted faces, blurry, cartoon, low quality, 3d render, plastic skin, jittery camera shake',
    cameraDirectives,
    actorDirectives,
    lightingDirectives,
    styleDirectives,
    technicalMetadata: {
      targetModel: targetModelId,
      duration: shot.durationSeconds,
      fps: shot.frameRate,
      focalLength: shot.camera.lens.focalLength,
      aspectRatio: shot.aspectRatio,
    },
  };
}
