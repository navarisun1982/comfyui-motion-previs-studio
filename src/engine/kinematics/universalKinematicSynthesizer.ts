/**
 * Universal Open-Ended Kinematic Synthesizer & 6-Effector IK Evaluator
 *
 * Allows ANY arbitrary human motion description (in Arabic, English, or any language)
 * to be represented as a time-series of 6 normalized spatial end-effectors + rhythmic
 * limb oscillations, and solved at 60fps on the 19-bone HumanoidRig via Closed-Form
 * 2-Bone Analytic Inverse Kinematics (`twoBoneIKSolver.ts`).
 *
 * Coordinate System (Character-Local Normalized Units, scaled by `rig.height`):
 * - `x`: Lateral (+X is Character Left, -X is Character Right; shoulders ~ ±0.18)
 * - `y`: Vertical height above ground (`0.0` = floor contact, `0.53` = standing hips, `0.95` = head)
 * - `z`: Fore-Aft (`+Z` is Character Forward, `-Z` is Character Backward)
 */

import * as THREE from 'three';
import { HumanoidRig } from './skeletonHierarchy';
import { solveLimbIK, solveLookAt } from './twoBoneIKSolver';

export interface KinematicOscillationSpec {
  /** Oscillation frequency in Hz (cycles per second, e.g. 1.5 for crawling/clapping) */
  frequencyHz?: number;
  /** Alternating left/right hand delta amplitude [dx, dy, dz] in character-height ratios */
  handsAmp?: [number, number, number];
  /** Phase offset in radians between left and right hands (0 = synchronous like clapping, PI = alternating like crawling/swimming) */
  handsPhaseDiffRad?: number;
  /** Alternating left/right foot delta amplitude [dx, dy, dz] in character-height ratios */
  feetAmp?: [number, number, number];
  /** Phase offset in radians between left and right feet (default PI) */
  feetPhaseDiffRad?: number;
  /** Vertical pelvic bounce amplitude ratio */
  hipsBobAmp?: number;
  /** Torso pitch/yaw oscillation in degrees [pitchDeg, yawDeg, rollDeg] */
  spineRockDeg?: [number, number, number];
}

export interface UniversalKinematicPhase {
  /** Normalized start time within the cue window [0.0 .. 1.0] */
  startRatio: number;
  /** Normalized end time within the cue window [0.0 .. 1.0] */
  endRatio: number;
  /** Human-readable beat label */
  label: string;
  /** Hips position offset from standing rest [dx, dy, dz] in character-height ratios (e.g. dy = -0.34 is prone on floor, dy = 0 is upright) */
  hipsOffset: [number, number, number];
  /** Torso/Spine orientation in degrees [pitchForwardDeg, yawDeg, rollDeg] (e.g. +65 pitch = horizontal prone/bowing, -20 = leaning back) */
  torsoAnglesDeg: [number, number, number];
  /** Left hand target [x, y, z] in character-local height ratios */
  leftHand: [number, number, number];
  /** Right hand target [x, y, z] in character-local height ratios */
  rightHand: [number, number, number];
  /** Left foot target [x, y, z] in character-local height ratios */
  leftFoot: [number, number, number];
  /** Right foot target [x, y, z] in character-local height ratios */
  rightFoot: [number, number, number];
  /** Head gaze target [x, y, z] in character-local height ratios */
  lookAt: [number, number, number];
  /** Optional rhythmic limb oscillation during this phase */
  oscillation?: KinematicOscillationSpec;
  /** Optional stage floor displacement [dx, dy, dz] across this phase (in stage grid units) */
  stageDelta?: [number, number, number];
}

export interface UniversalKinematicProgram {
  id: string;
  prompt: string;
  phases: UniversalKinematicPhase[];
}

const UNIVERSAL_PROGRAM_REGISTRY = new Map<string, UniversalKinematicProgram>();

export function registerUniversalKinematicProgram(program: UniversalKinematicProgram): string {
  const clipId = program.id.startsWith('universal-ik:') ? program.id : `universal-ik:${program.id}`;
  const normalized: UniversalKinematicProgram = { ...program, id: clipId };
  UNIVERSAL_PROGRAM_REGISTRY.set(clipId, normalized);
  return clipId;
}

export function getUniversalKinematicProgram(clipId?: string | null): UniversalKinematicProgram | undefined {
  if (!clipId || !clipId.startsWith('universal-ik:')) return undefined;
  return UNIVERSAL_PROGRAM_REGISTRY.get(clipId);
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

const DEG2RAD = Math.PI / 180;

/**
 * Evaluates a registered `UniversalKinematicProgram` on the 19-bone `HumanoidRig` at `timeSeconds`
 * and normalized progress `u` in `[0..1]`.
 */
export function evaluateUniversalKinematicProgram(
  rig: HumanoidRig,
  clipId: string,
  timeSeconds: number,
  clipProgress01?: number,
  motionCycles: number = 1
): boolean {
  const program = getUniversalKinematicProgram(clipId);
  if (!program || program.phases.length === 0) return false;

  const safeCycles = Math.max(1, Math.min(20, Math.round(motionCycles || 1)));
  const rawProg = clipProgress01 !== undefined ? THREE.MathUtils.clamp(clipProgress01, 0, 1) : (timeSeconds * 0.25) % 1.0;
  const scaled = rawProg * safeCycles;
  const u = scaled >= safeCycles ? 1.0 : scaled % 1.0;

  // Reset bones to bind rest pose before solving frame kinematics
  for (const [boneName, bone] of rig.bones) {
    const restPos = rig.restPositions.get(boneName);
    const restRot = rig.restRotations.get(boneName);
    if (restPos) bone.position.copy(restPos);
    if (restRot) bone.quaternion.copy(restRot);
  }
  if (rig.root.parent) rig.root.parent.updateMatrixWorld(true);
  rig.root.updateMatrixWorld(true);

  const h = rig.height;
  const invRootScale = 1.0 / (rig.root.scale.y || 1.0);
  const rigPoint = (rx: number, ry: number, rz: number): THREE.Vector3 => {
    const localPt = new THREE.Vector3(rx * h * invRootScale, ry * h * invRootScale, rz * h * invRootScale);
    return localPt.applyMatrix4(rig.root.matrixWorld);
  };

  // Locate active phase and previous phase for smooth C1 blending across phase boundaries
  const phases = program.phases;
  let activeIdx = 0;
  for (let i = 0; i < phases.length; i++) {
    if (u >= phases[i].startRatio - 1e-4) {
      activeIdx = i;
    }
  }
  const curPhase = phases[activeIdx];
  const prevPhase = activeIdx > 0 ? phases[activeIdx - 1] : curPhase;
  const phaseSpan = Math.max(0.05, curPhase.endRatio - curPhase.startRatio);
  const localU = THREE.MathUtils.clamp((u - curPhase.startRatio) / phaseSpan, 0, 1);
  const smoothU = localU * localU * (3 - 2 * localU);

  const hipsOff = lerp3(prevPhase.hipsOffset, curPhase.hipsOffset, smoothU);
  const torsoDeg = lerp3(prevPhase.torsoAnglesDeg, curPhase.torsoAnglesDeg, smoothU);
  const lHand = lerp3(prevPhase.leftHand, curPhase.leftHand, smoothU);
  const rHand = lerp3(prevPhase.rightHand, curPhase.rightHand, smoothU);
  const lFoot = lerp3(prevPhase.leftFoot, curPhase.leftFoot, smoothU);
  const rFoot = lerp3(prevPhase.rightFoot, curPhase.rightFoot, smoothU);
  const look = lerp3(prevPhase.lookAt, curPhase.lookAt, smoothU);

  // Apply rhythmic limb oscillations if present in the active phase
  const osc = curPhase.oscillation;
  if (osc) {
    const freq = (osc.frequencyHz ?? 1.5) * (safeCycles > 1 ? 1 + (safeCycles - 1) * 0.25 : 1);
    const omega = timeSeconds * Math.PI * 2 * freq;
    const hDiff = osc.handsPhaseDiffRad ?? Math.PI;
    const fDiff = osc.feetPhaseDiffRad ?? Math.PI;

    if (osc.handsAmp) {
      const sL = Math.sin(omega);
      const sR = Math.sin(omega + hDiff);
      lHand[0] += osc.handsAmp[0] * sL;
      lHand[1] += osc.handsAmp[1] * Math.max(-0.5, sL);
      lHand[2] += osc.handsAmp[2] * sL;
      rHand[0] += osc.handsAmp[0] * sR;
      rHand[1] += osc.handsAmp[1] * Math.max(-0.5, sR);
      rHand[2] += osc.handsAmp[2] * sR;
    }
    if (osc.feetAmp) {
      const sL = Math.sin(omega + Math.PI);
      const sR = Math.sin(omega + Math.PI + fDiff);
      lFoot[0] += osc.feetAmp[0] * sL;
      lFoot[1] = Math.max(0.03, lFoot[1] + osc.feetAmp[1] * Math.max(0, sL));
      lFoot[2] += osc.feetAmp[2] * sL;
      rFoot[0] += osc.feetAmp[0] * sR;
      rFoot[1] = Math.max(0.03, rFoot[1] + osc.feetAmp[1] * Math.max(0, sR));
      rFoot[2] += osc.feetAmp[2] * sR;
    }
    if (osc.hipsBobAmp) {
      hipsOff[1] += Math.sin(omega * 2) * osc.hipsBobAmp;
    }
    if (osc.spineRockDeg) {
      torsoDeg[0] += Math.sin(omega) * osc.spineRockDeg[0];
      torsoDeg[1] += Math.cos(omega) * osc.spineRockDeg[1];
      torsoDeg[2] += Math.sin(omega) * osc.spineRockDeg[2];
    }
  }

  // 1. Apply Hips offset and tilt
  const hips = rig.bones.get('Hips');
  if (hips) {
    const restHips = rig.restPositions.get('Hips');
    const rx = restHips ? restHips.x : 0;
    const ry = restHips ? restHips.y : 0.53 * h * invRootScale;
    const rz = restHips ? restHips.z : 0;
    hips.position.set(
      rx + hipsOff[0] * h * invRootScale,
      ry + hipsOff[1] * h * invRootScale,
      rz + hipsOff[2] * h * invRootScale
    );
    const restRot = rig.restRotations.get('Hips');
    const qTilt = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        torsoDeg[0] * DEG2RAD * 0.45,
        torsoDeg[1] * DEG2RAD * 0.4,
        torsoDeg[2] * DEG2RAD * 0.4,
        'YXZ'
      )
    );
    if (restRot) hips.quaternion.copy(restRot).multiply(qTilt);
    else hips.quaternion.copy(qTilt);
  }

  // 2. Apply Spine and Chest orientation
  const spine = rig.bones.get('Spine');
  const chest = rig.bones.get('Chest');
  if (spine) {
    const rest = rig.restRotations.get('Spine');
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        torsoDeg[0] * DEG2RAD * 0.3,
        torsoDeg[1] * DEG2RAD * 0.3,
        torsoDeg[2] * DEG2RAD * 0.3,
        'YXZ'
      )
    );
    if (rest) spine.quaternion.copy(rest).multiply(q);
    else spine.quaternion.copy(q);
  }
  if (chest) {
    const rest = rig.restRotations.get('Chest');
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        torsoDeg[0] * DEG2RAD * 0.35,
        torsoDeg[1] * DEG2RAD * 0.35,
        torsoDeg[2] * DEG2RAD * 0.35,
        'YXZ'
      )
    );
    if (rest) chest.quaternion.copy(rest).multiply(q);
    else chest.quaternion.copy(q);
  }
  rig.root.updateMatrixWorld(true);

  // 3. Solve 2-Bone IK for both Legs and Arms + Head LookAt
  solveLimbIK(
    rig,
    'leftLeg',
    rigPoint(lFoot[0], lFoot[1], lFoot[2]),
    rigPoint(lFoot[0] + 0.04, Math.max(0.12, lFoot[1] + 0.24), lFoot[2] + 0.42)
  );
  solveLimbIK(
    rig,
    'rightLeg',
    rigPoint(rFoot[0], rFoot[1], rFoot[2]),
    rigPoint(rFoot[0] - 0.04, Math.max(0.12, rFoot[1] + 0.24), rFoot[2] + 0.42)
  );

  solveLimbIK(
    rig,
    'leftArm',
    rigPoint(lHand[0], lHand[1], lHand[2]),
    rigPoint(lHand[0] + 0.14, Math.max(0.2, lHand[1] + 0.08), lHand[2] - 0.24)
  );
  solveLimbIK(
    rig,
    'rightArm',
    rigPoint(rHand[0], rHand[1], rHand[2]),
    rigPoint(rHand[0] - 0.14, Math.max(0.2, rHand[1] + 0.08), rHand[2] - 0.24)
  );

  solveLookAt(rig, rigPoint(look[0], look[1], look[2]));
  return true;
}

/**
 * Offline Semantic Phrase-to-Kinematic Phase Builder.
 * Synthesizes a multi-phase `UniversalKinematicProgram` for arbitrary compound or expressive
 * descriptions (in Arabic or English) even when no external LLM is online.
 */
export function buildOfflineUniversalKinematicProgram(prompt: string): UniversalKinematicProgram {
  const cleanAr = prompt
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();
  const cleanEn = prompt.toLowerCase().trim();

  const clauses = cleanAr
    .split(/(?:،|;|,|\.|ثم|وبعد ذلك|وبعدها|\bthen\b|\band then\b|\bafter that\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const beatTexts = clauses.length > 0 ? clauses : [cleanEn];
  const phases: UniversalKinematicPhase[] = [];

  for (let i = 0; i < beatTexts.length; i++) {
    const b = beatTexts[i];
    const startRatio = Number((i / beatTexts.length).toFixed(3));
    const endRatio = Number(((i + 1) / beatTexts.length).toFixed(3));

    // Detect posture & motion family from Arabic/English semantics
    if (/(يزحف|يحبو|زحف|crawl|prone|all fours)/.test(b)) {
      phases.push({
        startRatio,
        endRatio,
        label: 'Crawl on Ground',
        hipsOffset: [0, -0.34, -0.06],
        torsoAnglesDeg: [68, 0, 0],
        leftHand: [0.18, 0.05, 0.36],
        rightHand: [-0.18, 0.05, 0.36],
        leftFoot: [0.14, 0.05, -0.26],
        rightFoot: [-0.14, 0.05, -0.26],
        lookAt: [0, 0.28, 0.95],
        oscillation: {
          frequencyHz: 1.4,
          handsAmp: [0, 0.05, 0.14],
          handsPhaseDiffRad: Math.PI,
          feetAmp: [0, 0.04, 0.12],
          feetPhaseDiffRad: Math.PI,
          hipsBobAmp: 0.015,
          spineRockDeg: [4, 10, 4],
        },
        stageDelta: [0, 16, 0],
      });
    } else if (/(يقوم|ينهض|نهوض|يقف|يستقيم|stand up|get up|rise)/.test(b)) {
      phases.push({
        startRatio,
        endRatio,
        label: 'Rise & Stand Upright',
        hipsOffset: [0, 0, 0],
        torsoAnglesDeg: [0, 0, 0],
        leftHand: [0.20, 0.50, 0.04],
        rightHand: [-0.20, 0.50, 0.04],
        leftFoot: [0.11, 0.04, 0],
        rightFoot: [-0.11, 0.04, 0],
        lookAt: [0, 0.90, 0.95],
      });
    } else if (/(يسقط|يقع|ينهار|يغمي|fall|collapse|faint|drop)/.test(b)) {
      phases.push({
        startRatio,
        endRatio,
        label: 'Collapse to Ground',
        hipsOffset: [0, -0.35, -0.04],
        torsoAnglesDeg: [72, 6, 8],
        leftHand: [0.22, 0.05, 0.32],
        rightHand: [-0.22, 0.05, 0.32],
        leftFoot: [0.13, 0.04, -0.24],
        rightFoot: [-0.13, 0.04, -0.24],
        lookAt: [0, 0.22, 0.85],
      });
    } else if (/(يسجد|يركع|يجثو|kneel|bow|prostrate|pray)/.test(b)) {
      const isProstrate = /(يسجد|سجود|prostrate)/.test(b);
      phases.push({
        startRatio,
        endRatio,
        label: isProstrate ? 'Prostrate on Ground' : 'Kneel Down',
        hipsOffset: [0, isProstrate ? -0.30 : -0.22, -0.04],
        torsoAnglesDeg: [isProstrate ? 65 : 18, 0, 0],
        leftHand: [0.16, isProstrate ? 0.05 : 0.38, isProstrate ? 0.34 : 0.16],
        rightHand: [-0.16, isProstrate ? 0.05 : 0.38, isProstrate ? 0.34 : 0.16],
        leftFoot: [0.12, 0.04, isProstrate ? -0.20 : 0.16],
        rightFoot: [-0.12, 0.04, -0.22],
        lookAt: [0, isProstrate ? 0.15 : 0.65, 0.80],
      });
    } else if (/(يصفق|تصفيق|clap|applaud)/.test(b)) {
      phases.push({
        startRatio,
        endRatio,
        label: 'Clap Hands',
        hipsOffset: [0, -0.01, 0],
        torsoAnglesDeg: [4, 0, 0],
        leftHand: [0.06, 0.74, 0.28],
        rightHand: [-0.06, 0.74, 0.28],
        leftFoot: [0.11, 0.04, 0],
        rightFoot: [-0.11, 0.04, 0],
        lookAt: [0, 0.88, 0.95],
        oscillation: {
          frequencyHz: 2.6,
          handsAmp: [0.08, 0.02, 0.02],
          handsPhaseDiffRad: Math.PI,
          hipsBobAmp: 0.008,
        },
      });
    } else if (/(يسبح|سباحه|swim|swimming)/.test(b)) {
      phases.push({
        startRatio,
        endRatio,
        label: 'Swim Forward',
        hipsOffset: [0, -0.24, 0],
        torsoAnglesDeg: [76, 0, 0],
        leftHand: [0.20, 0.28, 0.42],
        rightHand: [-0.20, 0.28, 0.42],
        leftFoot: [0.12, 0.22, -0.32],
        rightFoot: [-0.12, 0.22, -0.32],
        lookAt: [0, 0.42, 0.95],
        oscillation: {
          frequencyHz: 1.5,
          handsAmp: [0.06, 0.12, 0.20],
          handsPhaseDiffRad: Math.PI,
          feetAmp: [0, 0.08, 0.06],
          feetPhaseDiffRad: Math.PI,
          spineRockDeg: [4, 12, 8],
        },
        stageDelta: [0, 20, 0],
      });
    } else if (/(ينحني|يلتقط|يمد|bend|pick|reach|crouch)/.test(b)) {
      phases.push({
        startRatio,
        endRatio,
        label: 'Bend & Reach Down',
        hipsOffset: [0, -0.18, -0.04],
        torsoAnglesDeg: [42, 0, 0],
        leftHand: [0.14, 0.22, 0.30],
        rightHand: [-0.10, 0.16, 0.34],
        leftFoot: [0.12, 0.04, 0.08],
        rightFoot: [-0.12, 0.04, -0.06],
        lookAt: [0, 0.35, 0.80],
      });
    } else {
      // Expressive full-body acting gesture default
      phases.push({
        startRatio,
        endRatio,
        label: b.slice(0, 28) || 'Expressive Motion',
        hipsOffset: [0, -0.03, 0],
        torsoAnglesDeg: [8, 0, 0],
        leftHand: [0.22, 0.68, 0.22],
        rightHand: [-0.22, 0.72, 0.26],
        leftFoot: [0.12, 0.04, 0.04],
        rightFoot: [-0.12, 0.04, -0.04],
        lookAt: [0, 0.88, 0.95],
        oscillation: {
          frequencyHz: 1.3,
          handsAmp: [0.06, 0.08, 0.08],
          handsPhaseDiffRad: Math.PI * 0.5,
          hipsBobAmp: 0.012,
          spineRockDeg: [4, 8, 3],
        },
      });
    }
  }

  const hash = Math.abs(
    Array.from(prompt).reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0)
  ).toString(36);
  const id = `universal-ik:${hash}`;
  const program: UniversalKinematicProgram = { id, prompt, phases };
  registerUniversalKinematicProgram(program);
  return program;
}

