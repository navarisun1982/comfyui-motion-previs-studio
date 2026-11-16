import { ShotSpec, CameraMovementType } from '../types/shotspec';
import {
  ShotRevisionV2,
  DirectorialSteeringPatch,
  MotionFidelityAnalysis,
} from '../pipeline/revisionTypes';

export interface SteeringOptions {
  currentIcLoraStrength?: number;
  seedIncrement?: number;
  customDirective?: string;
}

export interface SteeringResult {
  patch: DirectorialSteeringPatch;
  steeredShotSpec: ShotSpec;
  suggestedSeed: number;
}

/**
 * Returns natural-language counter-steering negative phrases for modern video DiTs
 * (LTX-2.5 Gemma & MiniMax H3 Qwen-VL — zero legacy SD1.5 `(token:1.35)` parenthesis weights).
 */
function getCounterMovementNegative(directed: CameraMovementType, detected: CameraMovementType): string {
  const parts: string[] = [];

  // Suppress detected unintended motion
  if (detected !== 'static' && detected !== directed) {
    switch (detected) {
      case 'pan-left':
        parts.push('camera panning left, leftward flow');
        break;
      case 'pan-right':
        parts.push('camera panning right, rightward flow');
        break;
      case 'tilt-up':
        parts.push('camera tilting up, upward tilt');
        break;
      case 'tilt-down':
        parts.push('camera tilting down, downward tilt');
        break;
      case 'dolly-in':
      case 'zoom-in':
        parts.push('camera pushing in, zooming in');
        break;
      case 'dolly-out':
      case 'zoom-out':
        parts.push('camera pulling back, zooming out');
        break;
    }
  }

  // Prevent opposite movement to directed
  switch (directed) {
    case 'pan-left':
      parts.push('camera pan right, panning right');
      break;
    case 'pan-right':
      parts.push('camera pan left, panning left');
      break;
    case 'tilt-up':
      parts.push('camera tilt down, downward camera tilt');
      break;
    case 'tilt-down':
      parts.push('camera tilt up, upward camera tilt');
      break;
    case 'dolly-in':
    case 'zoom-in':
      parts.push('pull back, dolly out, zooming out, retreating camera');
      break;
    case 'dolly-out':
    case 'zoom-out':
      parts.push('push in, dolly in, zooming in, advancing camera');
      break;
    case 'static':
      parts.push('camera movement, panning, tilting, shaky handheld camera, moving camera');
      break;
  }

  return parts.join(', ');
}

function computeSafeSteeredControlStrength(baseStrength: number, delta: number): number {
  const clampedBase = Math.max(0.1, Math.min(1.0, baseStrength));
  return Number(Math.min(1.0, clampedBase + delta).toFixed(2));
}

/**
 * Closed-Loop Directorial Auto-Steering Engine
 * Compares take motion fidelity against directed trajectory and constructs a compensatory patch
 * using clean natural-language camera prose compatible with LTX-2.5 and MiniMax H3.
 */
export function generateDirectorialSteeringPatch(
  take: ShotRevisionV2,
  options: SteeringOptions = {}
): SteeringResult {
  const analysis: MotionFidelityAnalysis = take.motionFidelity || {
    overallScore: 50,
    directionalScore: 50,
    speedScore: 50,
    stabilityScore: 50,
    detectedMovement: 'static',
    directedMovement: take.shotSpec.camera?.movement?.type || 'static',
    achievedVector: { avgDx: 0, avgDy: 0, divergence: 0, magnitude: 0 },
    expectedVector: { expectedDx: 0, expectedDy: 0, expectedDivergence: 0 },
    classification: 'fair',
    summary: 'No motion fidelity analysis recorded yet.',
    recommendations: ['Perform motion analysis prior to steering.'],
    analyzedAt: Date.now(),
  };

  const directed = analysis.directedMovement;
  const detected = analysis.detectedMovement;
  const originalPos = take.prompt || take.shotSpec.sceneDescription || '';
  const originalNeg = take.negative || take.shotSpec.negativePrompt || '';
  const baseIcLora = Math.max(0.1, Math.min(1.0, options.currentIcLoraStrength ?? 0.85));

  const appliedDirectives: string[] = [];
  let posAddition = '';
  let negAddition = '';
  let steeredIcLora = baseIcLora;
  let seedOffset = options.seedIncrement ?? 107; // Prime offset to escape seed basin
  let reason = '';

  // 1. Static Shot Drift Correction
  if (directed === 'static') {
    if (analysis.overallScore < 85) {
      reason = `Take ${take.takeNumber ?? take.version} exhibited camera motion drift (${detected}) on a directed static shot.`;
      steeredIcLora = computeSafeSteeredControlStrength(baseIcLora, 0.12);
      appliedDirectives.push('Lock camera to stationary tripod anchor');
      appliedDirectives.push('Inject anti-motion suppression in negative prompt');
      appliedDirectives.push(
        steeredIcLora > baseIcLora
          ? `Raise 3D control conditioning to ${steeredIcLora.toFixed(2)}x (safe <= 1.00x ceiling) to pin background`
          : 'Maintain 1.00x 3D control conditioning ceiling to pin background without overbaking'
      );

      posAddition = 'static locked camera, locked tripod shot, stationary camera framing with zero camera drift';
      negAddition = getCounterMovementNegative(directed, detected);
    } else {
      reason = `Take ${take.takeNumber ?? take.version} maintained excellent static stability (${analysis.overallScore}%).`;
      appliedDirectives.push('Maintain locked static framing');
      seedOffset = 1;
    }
  }
  // 2. Translational Move Steering (Pan, Tilt, Pedestal, Truck, Orbit)
  else if (
    directed === 'pan-left' ||
    directed === 'pan-right' ||
    directed === 'tilt-up' ||
    directed === 'tilt-down' ||
    directed === 'pedestal-up' ||
    directed === 'pedestal-down' ||
    directed === 'truck-left' ||
    directed === 'truck-right' ||
    directed === 'orbit-clockwise' ||
    directed === 'orbit-counter-clockwise'
  ) {
    if (analysis.directionalScore < 60 || (detected !== directed && detected !== 'static')) {
      reason = `Take ${take.takeNumber ?? take.version} drifted from directed ${directed} (achieved ${detected}, fidelity: ${analysis.overallScore}%).`;
      steeredIcLora = computeSafeSteeredControlStrength(baseIcLora, 0.15);
      appliedDirectives.push(`Reinforce directed ${directed} camera trajectory in natural-language prose`);
      appliedDirectives.push(`Counter-steer against detected ${detected} in negative prompt`);
      appliedDirectives.push(
        steeredIcLora > baseIcLora
          ? `Elevate 3D trajectory control strength to ${steeredIcLora.toFixed(2)}x (capped <= 1.00x)`
          : 'Hold 3D trajectory control strength at 1.00x safe ceiling'
      );

      posAddition = `deliberate camera ${directed}, steady ${directed} tracking shot, continuous cinematic camera motion`;
      negAddition = getCounterMovementNegative(directed, detected);
    } else if (analysis.speedScore < 65) {
      reason = `Take ${take.takeNumber ?? take.version} achieved direction but had insufficient camera velocity (${analysis.speedScore}% speed match).`;
      steeredIcLora = computeSafeSteeredControlStrength(baseIcLora, 0.1);
      appliedDirectives.push(`Amplify kinetic momentum for ${directed}`);
      appliedDirectives.push('Suppress stationary and motionless frames');

      posAddition = `dynamic fast camera ${directed}, kinetic camera translation, swift tracking motion`;
      negAddition = 'static, frozen, slow motion, stationary camera, motionless';
    } else {
      reason = `Take ${take.takeNumber ?? take.version} achieved strong alignment (${analysis.overallScore}%). Iterating seed for visual variety.`;
      appliedDirectives.push('Preserve proven prompt structure and iterate RNG seed');
      seedOffset = 1;
    }
  }
  // 3. Radial Divergence Steering (Dolly / Zoom)
  else if (directed === 'dolly-in' || directed === 'zoom-in') {
    if (analysis.overallScore < 75 || detected !== 'dolly-in') {
      reason = `Take ${take.takeNumber ?? take.version} lacked forward camera momentum (detected ${detected}).`;
      steeredIcLora = computeSafeSteeredControlStrength(baseIcLora, 0.12);
      appliedDirectives.push('Enforce forward camera push-in trajectory');
      appliedDirectives.push('Suppress backward retreating camera motion');
      appliedDirectives.push(`Set 3D previs control strength to ${steeredIcLora.toFixed(2)}x (safe <= 1.00x ceiling)`);

      posAddition = 'push in dolly camera move, camera zooming in, steady forward advance toward subject';
      negAddition = getCounterMovementNegative(directed, detected);
    } else {
      reason = `Take ${take.takeNumber ?? take.version} achieved clean forward expansion (${analysis.overallScore}%).`;
      appliedDirectives.push('Preserve forward push-in parameters');
      seedOffset = 1;
    }
  } else if (directed === 'dolly-out' || directed === 'zoom-out') {
    if (analysis.overallScore < 75 || detected !== 'dolly-out') {
      reason = `Take ${take.takeNumber ?? take.version} lacked backward camera retreat (detected ${detected}).`;
      steeredIcLora = computeSafeSteeredControlStrength(baseIcLora, 0.12);
      appliedDirectives.push('Enforce backward camera pull-out trajectory');
      appliedDirectives.push('Suppress forward advancing motion in negative prompt');
      appliedDirectives.push(`Set 3D previs control strength to ${steeredIcLora.toFixed(2)}x (safe <= 1.00x ceiling)`);

      posAddition = 'pull out dolly camera move, camera zooming out, widening angle revealing the scene';
      negAddition = getCounterMovementNegative(directed, detected);
    } else {
      reason = `Take ${take.takeNumber ?? take.version} achieved clean backward retreat (${analysis.overallScore}%).`;
      appliedDirectives.push('Preserve backward pull-out parameters');
      seedOffset = 1;
    }
  } else {
    reason = `Directorial steering pass for ${directed}.`;
    appliedDirectives.push('Fine-tune camera stability');
  }

  if (options.customDirective) {
    appliedDirectives.push(options.customDirective);
  }

  // Construct steered prompts without duplicating additions
  let steeredPositive = originalPos.trim();
  if (posAddition && !steeredPositive.includes(posAddition)) {
    steeredPositive = steeredPositive ? `${steeredPositive}. ${posAddition}` : posAddition;
  }

  let steeredNegative = originalNeg.trim();
  if (negAddition && !steeredNegative.includes(negAddition)) {
    steeredNegative = steeredNegative ? `${steeredNegative}, ${negAddition}` : negAddition;
  }

  const suggestedSeed = (take.seed + seedOffset) % 2147483647;
  const targetEngineKey = take.shotSpec.targetModel === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5';

  const patch: DirectorialSteeringPatch = {
    sourceTakeId: take.id,
    sourceTakeNumber: take.takeNumber ?? take.version,
    reason,
    originalPositivePrompt: originalPos,
    steeredPositivePrompt: steeredPositive,
    originalNegativePrompt: originalNeg,
    steeredNegativePrompt: steeredNegative,
    originalIcLoraStrength: baseIcLora,
    steeredIcLoraStrength: Number(steeredIcLora.toFixed(2)),
    suggestedSeedOffset: seedOffset,
    appliedDirectives,
  };

  const steeredShotSpec: ShotSpec = {
    ...take.shotSpec,
    seed: suggestedSeed,
    negativePrompt: steeredNegative,
    customPositivePrompts: {
      ...(take.shotSpec.customPositivePrompts || {}),
      [targetEngineKey]: steeredPositive,
    },
  };

  return {
    patch,
    steeredShotSpec,
    suggestedSeed,
  };
}

/**
 * Applies a steering patch onto an active ShotSpec without wiping custom prompts
 */
export function applySteeringPatchToShot(
  shot: ShotSpec,
  patch: DirectorialSteeringPatch
): ShotSpec {
  const currentSeed = shot.seed ?? 42;
  const targetEngineKey = shot.targetModel === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5';
  return {
    ...shot,
    seed: patch.suggestedSeedOffset ? (currentSeed + patch.suggestedSeedOffset) % 2147483647 : currentSeed,
    negativePrompt: patch.steeredNegativePrompt,
    customPositivePrompts: {
      ...(shot.customPositivePrompts || {}),
      [targetEngineKey]: patch.steeredPositivePrompt,
    },
  };
}

/**
 * Computes comparative fidelity delta between an original take and a steered re-take
 */
export function calculateFidelityImprovement(
  takeOriginal: ShotRevisionV2,
  takeSteered: ShotRevisionV2
): {
  scoreDelta: number;
  improved: boolean;
  summary: string;
} {
  const scoreOrig = takeOriginal.motionFidelity?.overallScore ?? 0;
  const scoreSteered = takeSteered.motionFidelity?.overallScore ?? 0;
  const scoreDelta = scoreSteered - scoreOrig;
  const improved = scoreDelta > 0;

  let summary = '';
  if (scoreDelta > 0) {
    summary = `Motion fidelity improved by +${scoreDelta}% (from ${scoreOrig}% to ${scoreSteered}%). Closed-loop steering successfully counteracted camera drift.`;
  } else if (scoreDelta === 0) {
    summary = `Motion fidelity remained steady at ${scoreSteered}%.`;
  } else {
    summary = `Motion fidelity shifted by ${scoreDelta}% (from ${scoreOrig}% to ${scoreSteered}%). Additional steering required.`;
  }

  return {
    scoreDelta,
    improved,
    summary,
  };
}
