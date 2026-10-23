import { CinematicSequence, SequenceContinuityReport, ContinuityIssue } from '../types/sequenceTypes';
import { ShotSpec } from '../types/shotspec';

/**
 * Checks whether two camera movement types represent conflicting kinetic vectors.
 */
function isMotionClash(moveA: string, moveB: string): boolean {
  if (moveA === 'pan-left' && moveB === 'pan-right') return true;
  if (moveA === 'pan-right' && moveB === 'pan-left') return true;
  if (moveA === 'tilt-up' && moveB === 'tilt-down') return true;
  if (moveA === 'tilt-down' && moveB === 'tilt-up') return true;
  if (moveA === 'truck-left' && moveB === 'truck-right') return true;
  if (moveA === 'truck-right' && moveB === 'truck-left') return true;
  if (moveA === 'dolly-in' && moveB === 'dolly-out') return true;
  if (moveA === 'dolly-out' && moveB === 'dolly-in') return true;
  return false;
}

/**
 * Evaluates actor horizontal placement to check for 180-degree axis breaks.
 */
function detectAxisJump(specA?: ShotSpec, specB?: ShotSpec): boolean {
  if (!specA || !specB) return false;
  if (specA.actors.length === 0 || specB.actors.length === 0) return false;

  const actorA = specA.actors[0];
  const actorB = specB.actors[0];

  // Compare end position of A with start position of B
  const posA = actorA.trajectory.endPosition || actorA.trajectory.startPosition;
  const posB = actorB.trajectory.startPosition;

  if (posA && posB) {
    const isLeftA = posA.x < 45;
    const isRightA = posA.x > 55;
    const isLeftB = posB.x < 45;
    const isRightB = posB.x > 55;

    // Direct flip from left side of screen to right side without coverage
    if ((isLeftA && isRightB) || (isRightA && isLeftB)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether two adjacent shots constitute a discontinuous jump cut.
 */
function isJumpCut(specA?: ShotSpec, specB?: ShotSpec): boolean {
  if (!specA || !specB) return false;

  const sameShotType = specA.camera.shotType === specB.camera.shotType;
  const sameAngle = specA.camera.angle === specB.camera.angle;
  const focalA = specA.camera.lens.focalLength;
  const focalB = specB.camera.lens.focalLength;
  const sameFocal = focalA === focalB;

  // Jump cut condition: exact same framing, same angle, same focal length
  if (sameShotType && sameAngle && sameFocal) {
    return true;
  }

  return false;
}

/**
 * Core continuity and pacing verification engine for multi-shot sequences.
 */
export function analyzeSequenceContinuity(
  sequence: CinematicSequence,
  shotsById: Record<string, ShotSpec>
): SequenceContinuityReport {
  const issues: ContinuityIssue[] = [];
  const shots = sequence.shots;
  const totalCuts = Math.max(0, shots.length - 1);

  if (shots.length === 0) {
    return {
      overallScore: 100,
      rating: 'exemplary',
      totalCuts: 0,
      cleanCutsCount: 0,
      issues: [],
      pacingRhythmSummary: 'Empty sequence.',
      directorNotes: ['Add shots from the Shot Bible to begin assembling a sequence.'],
      analyzedAt: Date.now(),
    };
  }

  // 1. Analyze Individual Shot Pacing
  const shotDurations = shots.map((s) => s.durationSeconds);
  const avgDuration = shotDurations.reduce((a, b) => a + b, 0) / shots.length;

  shots.forEach((shot, idx) => {
    if (shot.durationSeconds < 1.0) {
      issues.push({
        cutIndex: idx,
        shotFromId: shot.shotId,
        shotFromName: shot.shotCode,
        shotToId: shot.shotId,
        shotToName: shot.shotCode,
        severity: 'warning',
        rule: 'pacing_rush',
        title: `Flash Cut Pacing Warning (${shot.shotCode})`,
        description: `Shot duration (${shot.durationSeconds}s) is under 1.0 second, which may cause perceptual disorientation.`,
        directorRecommendation: 'Extend duration to at least 1.5s unless intentionally editing an MTV-style action montage.',
      });
    } else if (shot.durationSeconds > 10.0) {
      issues.push({
        cutIndex: idx,
        shotFromId: shot.shotId,
        shotFromName: shot.shotCode,
        shotToId: shot.shotId,
        shotToName: shot.shotCode,
        severity: 'info',
        rule: 'pacing_drag',
        title: `Extended Take Notice (${shot.shotCode})`,
        description: `Shot runs for ${shot.durationSeconds}s. Extended takes require compelling camera or actor blocking to maintain visual interest.`,
        directorRecommendation: 'Ensure camera trajectory remains dynamic or consider splitting into a two-shot coverage setup.',
      });
    }
  });

  // Check for monotonous shot rhythm (all shots exact same duration)
  if (shots.length >= 3) {
    const allSameDuration = shotDurations.every((d) => Math.abs(d - shotDurations[0]) < 0.1);
    if (allSameDuration) {
      issues.push({
        cutIndex: 0,
        shotFromId: shots[0].shotId,
        shotFromName: shots[0].shotCode,
        shotToId: shots[shots.length - 1].shotId,
        shotToName: shots[shots.length - 1].shotCode,
        severity: 'info',
        rule: 'pacing_drag',
        title: 'Monotonous Shot Cadence',
        description: `All ${shots.length} shots have an identical duration of ~${shotDurations[0].toFixed(1)}s.`,
        directorRecommendation: 'Introduce pacing variation (e.g. wide establishing 5s, medium action 3.5s, punchy close-up 2s) to create cinematic rhythm.',
      });
    }
  }

  // 2. Analyze Cut-by-Cut Transitions
  for (let i = 0; i < shots.length - 1; i++) {
    const shotA = shots[i];
    const shotB = shots[i + 1];

    const specA = shotsById[shotA.shotId] || shotA.shotSpecSnapshot;
    const specB = shotsById[shotB.shotId] || shotB.shotSpecSnapshot;

    // A. 180-Degree Rule / Screen Direction
    if (detectAxisJump(specA, specB)) {
      issues.push({
        cutIndex: i,
        shotFromId: shotA.shotId,
        shotFromName: `${shotA.shotCode} (${shotA.title})`,
        shotToId: shotB.shotId,
        shotToName: `${shotB.shotCode} (${shotB.title})`,
        severity: 'error',
        rule: '180_degree_rule',
        title: `Axis Break: 180-Degree Rule Violation (${shotA.shotCode} -> ${shotB.shotCode})`,
        description: `Lead actor jumps screen position abruptly between ${shotA.shotCode} and ${shotB.shotCode}, crossing the 180-degree line of action.`,
        directorRecommendation: 'Insert a neutral cutaway, reverse-angle over-the-shoulder, or match-action bridge to reorient the viewer.',
      });
    }

    // B. Jump Cut Detection
    if (isJumpCut(specA, specB)) {
      issues.push({
        cutIndex: i,
        shotFromId: shotA.shotId,
        shotFromName: `${shotA.shotCode} (${shotA.title})`,
        shotToId: shotB.shotId,
        shotToName: `${shotB.shotCode} (${shotB.title})`,
        severity: 'warning',
        rule: 'jump_cut',
        title: `Discontinuous Jump Cut (${shotA.shotCode} -> ${shotB.shotCode})`,
        description: `Both shots share identical shot size (${specA?.camera.shotType}), angle (${specA?.camera.angle}), and focal length (${specA?.camera.lens.focalLength}) without sufficient spatial change.`,
        directorRecommendation: 'Apply the 30-degree rule: change camera angle by at least 30° or alternate focal length (e.g. Wide -> Close-Up).',
      });
    }

    // C. Motion Vector Flow Clash
    if (specA && specB) {
      const moveA = specA.camera.movement.type;
      const moveB = specB.camera.movement.type;

      if (isMotionClash(moveA, moveB)) {
        issues.push({
          cutIndex: i,
          shotFromId: shotA.shotId,
          shotFromName: `${shotA.shotCode} (${shotA.title})`,
          shotToId: shotB.shotId,
          shotToName: `${shotB.shotCode} (${shotB.title})`,
          severity: 'warning',
          rule: 'motion_clash',
          title: `Kinetic Vector Clash: ${moveA} -> ${moveB}`,
          description: `Cutting directly from a ${moveA} to an opposing ${moveB} creates a jarring inertial whiplash for the audience.`,
          directorRecommendation: 'Add a stationary cushioning shot, utilize a match-cut on subject action, or soften with a 0.5s dissolve transition.',
        });
      }
    }

    // D. Aspect Ratio Discrepancy
    if (specA && specB && specA.aspectRatio !== specB.aspectRatio) {
      issues.push({
        cutIndex: i,
        shotFromId: shotA.shotId,
        shotFromName: `${shotA.shotCode} (${shotA.title})`,
        shotToId: shotB.shotId,
        shotToName: `${shotB.shotCode} (${shotB.title})`,
        severity: 'error',
        rule: 'aspect_mismatch',
        title: `Aspect Ratio Mismatch (${specA.aspectRatio} -> ${specB.aspectRatio})`,
        description: `Inconsistent framing aspect ratios across cuts will cause pillarboxing or letterboxing jumps in NLE export.`,
        directorRecommendation: `Standardize all sequence shots to a unified delivery aspect ratio (e.g. ${specA.aspectRatio}).`,
      });
    }

    // E. Lighting & Mood Discontinuity
    if (specA && specB) {
      const lightA = specA.lighting.style;
      const lightB = specB.lighting.style;
      const isExtremeMismatch =
        (lightA.includes('noir') && lightB.includes('high-key')) ||
        (lightA.includes('cyberpunk') && lightB.includes('golden-hour')) ||
        (lightA.includes('candlelight') && lightB.includes('harsh-fluorescent'));

      if (isExtremeMismatch) {
        issues.push({
          cutIndex: i,
          shotFromId: shotA.shotId,
          shotFromName: `${shotA.shotCode} (${shotA.title})`,
          shotToId: shotB.shotId,
          shotToName: `${shotB.shotCode} (${shotB.title})`,
          severity: 'info',
          rule: 'lighting_mismatch',
          title: `Lighting Palette Shift: ${lightA} -> ${lightB}`,
          description: `Color temperature and contrast shift dramatically between ${shotA.shotCode} and ${shotB.shotCode}.`,
          directorRecommendation: 'Ensure this lighting change represents a deliberate narrative event (e.g. entering an interior room) or align lighting presets.',
        });
      }
    }
  }

  // 3. Compute Composite Score
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'error') score -= 15;
    else if (issue.severity === 'warning') score -= 8;
    else score -= 3;
  }
  score = Math.max(10, Math.min(100, score));

  let rating: SequenceContinuityReport['rating'] = 'exemplary';
  const hasErrors = issues.some((i) => i.severity === 'error');
  if (score < 50) rating = 'disjointed';
  else if (score < 70) rating = 'needs_coverage';
  else if (score < 90 || hasErrors) rating = 'sound';

  const cleanCutsCount = totalCuts - new Set(issues.map((iss) => iss.cutIndex)).size;

  const directorNotes: string[] = [];
  if (issues.length === 0) {
    directorNotes.push('Flawless cinematic continuity: spatial axes, eye lines, and kinetic vectors are seamlessly matched.');
  } else {
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warnCount = issues.filter((i) => i.severity === 'warning').length;
    if (errorCount > 0) {
      directorNotes.push(`${errorCount} severe spatial/aspect continuity issue(s) detected that will disorient the audience.`);
    }
    if (warnCount > 0) {
      directorNotes.push(`${warnCount} kinetic or framing warning(s) flagged for directorial refinement.`);
    }
  }

  const pacingRhythmSummary = `Sequence contains ${shots.length} shots across ${sequence.totalDurationSeconds.toFixed(1)}s (average shot duration: ${avgDuration.toFixed(1)}s). ${issues.length === 0 ? 'Rhythm is balanced and engaging.' : 'Review flagged cut transitions below.'}`;

  return {
    overallScore: score,
    rating,
    totalCuts,
    cleanCutsCount: Math.max(0, cleanCutsCount),
    issues,
    pacingRhythmSummary,
    directorNotes,
    analyzedAt: Date.now(),
  };
}
