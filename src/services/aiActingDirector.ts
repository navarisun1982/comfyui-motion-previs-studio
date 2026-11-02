/**
 * AI Acting Director Service
 * Translates natural language character acting prompts into timed 3D stage keyframe cues,
 * semantic pose presets, locomotion gaits, and spatial waypoints.
 * Works seamlessly offline with rule-based heuristics, or elevates through local LLM / Gemini.
 */

import {
  getReasonerConfig,
  buildOllamaRequest,
  buildOpenAiRequest,
  buildGeminiRequest,
  extractResponseText,
  resolveWireUrl,
} from './objectReasoner';
import {
  UniversalKinematicPhase,
  UniversalKinematicProgram,
  buildOfflineUniversalKinematicProgram,
  registerUniversalKinematicProgram,
} from '../engine/kinematics/universalKinematicSynthesizer';

export interface ActingCueProposal {
  time: number;
  cueLabel: string;
  posePreset: string;
  gait: 'auto' | 'walk' | 'run' | 'sneak' | 'idle' | 'none';
  position?: { x: number; y: number; z?: number };
  description?: string;
}

const VALID_PRESETS = [
  'neutral-stand',
  'aim-pistol',
  'aim-bow',
  'combat-ready',
  'crouch-cover',
  'stride-mid',
  'dialogue-gesturing',
  'sitting-chair',
  'dramatic-lunge',
  'hero-kneel',
  'defensive-block',
  't-pose',
];

/**
 * Universal rule-based parser that executes instantly offline with 0 latency.
 */
export function decomposeActingPromptRules(
  prompt: string,
  duration: number
): ActingCueProposal[] {
  const safeDuration = duration > 0 ? duration : 4.0;
  const rawBeats = prompt
    .split(/(?:;|\. |\n|,\s*(?=[0-9]+(?:\.[0-9]+)?s\b)|\band then\b|\bthen\b|\bafter that\b|\bfollowed by\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  if (rawBeats.length === 0) {
    return [
      {
        time: 0,
        cueLabel: 'Neutral Stand',
        posePreset: 'neutral-stand',
        gait: 'idle',
        description: prompt,
      },
    ];
  }

  const results: ActingCueProposal[] = [];

  rawBeats.forEach((beatText, idx) => {
    // 1. Extract explicit timestamp if present (e.g. "0s", "1.5s", "at 1.5s", "@ 2.0s", "at 3 sec")
    let time = (idx / rawBeats.length) * safeDuration;
    const timeMatch =
      beatText.match(/(?:^|\b)(?:(?:at|@)\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:s|sec|seconds)\b/i) ||
      beatText.match(/(?:at|@)\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (timeMatch) {
      const parsed = parseFloat(timeMatch[1]);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= safeDuration) {
        time = parsed;
      }
    }

    // 2. Identify semantic pose preset
    let posePreset = 'neutral-stand';
    let cueLabel = 'Stage Stand';
    let gait: 'auto' | 'walk' | 'run' | 'sneak' | 'idle' | 'none' = 'none';

    if (/\b(bow|arrow|archer|quiver|draw bow|aim bow)\b/i.test(beatText)) {
      posePreset = 'aim-bow';
      cueLabel = 'Aim Bow & Arrow';
    } else if (/\b(gun|pistol|firearm|shoot|aim pistol)\b/i.test(beatText)) {
      posePreset = 'aim-pistol';
      cueLabel = 'Aim Firearm';
    } else if (/\b(crouch|duck|cover|low|hide|kneel down)\b/i.test(beatText)) {
      posePreset = 'crouch-cover';
      cueLabel = 'Crouch in Cover';
    } else if (/\b(lunge|thrust|sword strike|charge ahead)\b/i.test(beatText)) {
      posePreset = 'dramatic-lunge';
      cueLabel = 'Dramatic Lunge';
    } else if (/\b(hero kneel|superhero landing|kneel|ground touch)\b/i.test(beatText)) {
      posePreset = 'hero-kneel';
      cueLabel = 'Hero Kneel';
    } else if (/\b(guard|combat|fight|boxing|fists|martial)\b/i.test(beatText)) {
      posePreset = 'combat-ready';
      cueLabel = 'Combat Stance';
    } else if (/\b(block|shield|parry|defend)\b/i.test(beatText)) {
      posePreset = 'defensive-block';
      cueLabel = 'Defensive Block';
    } else if (/\b(run|sprint|dash|flee|rush)\b/i.test(beatText)) {
      posePreset = 'stride-mid';
      gait = 'run';
      cueLabel = 'Sprint Stride';
    } else if (/\b(walk|stride|march|step|pace)\b/i.test(beatText)) {
      posePreset = 'stride-mid';
      gait = 'walk';
      cueLabel = 'Walk Forward';
    } else if (/\b(sneak|creep|prowl|stealth)\b/i.test(beatText)) {
      posePreset = 'crouch-cover';
      gait = 'sneak';
      cueLabel = 'Sneak Forward';
    } else if (/\b(talk|speak|dialogue|gesture|explain|shout)\b/i.test(beatText)) {
      posePreset = 'dialogue-gesturing';
      cueLabel = 'Dialogue Gesturing';
    } else if (/\b(sit|chair|bench|seated)\b/i.test(beatText)) {
      posePreset = 'sitting-chair';
      cueLabel = 'Sit in Chair';
    }

    results.push({
      time: Number(time.toFixed(2)),
      cueLabel,
      posePreset,
      gait,
      description: beatText,
    });
  });

  // Ensure sorted by ascending time
  results.sort((a, b) => a.time - b.time);
  return results;
}

/**
 * Executes AI Acting Beat decomposition via LLM with automatic rule fallback.
 */
export async function generateActingCuesFromPrompt(
  prompt: string,
  duration: number,
  actorName: string = 'Character',
  sceneDescription?: string
): Promise<ActingCueProposal[]> {
  const cfg = getReasonerConfig();
  const safeDuration = duration > 0 ? duration : 4.0;

  if (!prompt || !prompt.trim()) {
    return decomposeActingPromptRules(prompt, safeDuration);
  }

  // If the prompt already contains explicit timestamped cues (e.g. "0s combat ready, 2s defensive block"),
  // use the instant deterministic parser directly without waiting for a cold LLM network call.
  if (/(?:^|[,;\n])\s*\d+(?:\.\d+)?\s*(?:s|sec|seconds)?\s*[:\s-]/i.test(prompt)) {
    return decomposeActingPromptRules(prompt, safeDuration);
  }

  // If provider requires an API key and none is configured, fall back immediately
  if (cfg.info.needsKey && !cfg.apiKey) {
    return decomposeActingPromptRules(prompt, safeDuration);
  }

  const systemInstruction = `You are an expert Hollywood character animator and 3D choreography director.
Your objective is to translate an acting sequence prompt for character "${actorName}" across a ${safeDuration}s shot into a JSON array of timed keyframe cues.
${sceneDescription ? `Scene Context: "${sceneDescription}".` : ''}

Available Pose Presets:
${VALID_PRESETS.map((p) => `- "${p}"`).join('\n')}

Available Gaits: "auto", "walk", "run", "sneak", "idle", "none".

OUTPUT FORMAT: Return strictly a valid JSON array of objects with keys:
[
  {
    "time": 0.0,
    "cueLabel": "Start Neutral",
    "posePreset": "neutral-stand",
    "gait": "idle",
    "description": "brief note"
  }
]
No preamble, markdown backticks, or explanation.`;

  try {
    let rawText = '';
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(30_000) : undefined;
    if (cfg.provider === 'gemini') {
      const { url, headers, body } = buildGeminiRequest(cfg, prompt, 'object', systemInstruction);
      const res = await fetch(resolveWireUrl(url, cfg.provider), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        rawText = extractResponseText('gemini', data);
      }
    } else if (cfg.provider === 'ollama') {
      const { url, headers, body } = buildOllamaRequest(cfg, prompt, 'object', systemInstruction, undefined, 'Acting sequence prompt: ');
      const res = await fetch(resolveWireUrl(url, cfg.provider), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        rawText = extractResponseText('ollama', data);
      }
    } else {
      const { url, headers, body } = buildOpenAiRequest(cfg, prompt, 'object', systemInstruction);
      const res = await fetch(resolveWireUrl(url, cfg.provider), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        rawText = extractResponseText('openai', data);
      }
    }

    if (rawText) {
      const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const parsedArray = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.cues)
        ? parsed.cues
        : Array.isArray(parsed?.beats)
        ? parsed.beats
        : null;
      if (parsedArray && parsedArray.length > 0) {
        const validated: ActingCueProposal[] = parsedArray.map((item: any, idx: number) => {
          const t = Math.max(0, Math.min(safeDuration, Number(item.time ?? (idx / parsedArray.length) * safeDuration)));
          const posePreset = VALID_PRESETS.includes(item.posePreset) ? item.posePreset : 'neutral-stand';
          const gait = ['auto', 'walk', 'run', 'sneak', 'idle', 'none'].includes(item.gait) ? item.gait : 'none';
          return {
            time: Number(t.toFixed(2)),
            cueLabel: item.cueLabel || item.posePreset || `Beat ${idx + 1}`,
            posePreset,
            gait,
            position:
              item.position && typeof item.position.x === 'number' && typeof item.position.y === 'number'
                ? item.position
                : undefined,
            description: item.description,
          };
        });
        validated.sort((a, b) => a.time - b.time);
        return validated;
      }
    }
  } catch (err) {
    console.warn('[AIActingDirector] LLM request fallback to heuristic parser:', err);
  }

  // Graceful rule-based fallback
  return decomposeActingPromptRules(prompt, safeDuration);
}

function clampTuple3(
  val: unknown,
  fallback: [number, number, number],
  min: number = -2,
  max: number = 2
): [number, number, number] {
  if (!Array.isArray(val) || val.length < 3) return fallback;
  return [
    Math.max(min, Math.min(max, Number(val[0]) || fallback[0])),
    Math.max(min, Math.min(max, Number(val[1]) || fallback[1])),
    Math.max(min, Math.min(max, Number(val[2]) || fallback[2])),
  ];
}

/**
 * Synthesizes an open-ended 6-Effector Universal Kinematic Program from ANY natural-language prompt
 * (in Arabic, English, or any language) using the configured AI Reasoner (Gemini, OpenAI, or local Ollama),
 * with instant fallback to `buildOfflineUniversalKinematicProgram`.
 */
export async function generateUniversalKinematicProgramFromPrompt(
  prompt: string,
  duration: number,
  actorName: string = 'Character',
  sceneDescription?: string
): Promise<UniversalKinematicProgram> {
  const cfg = getReasonerConfig();
  if (!prompt || !prompt.trim()) {
    return buildOfflineUniversalKinematicProgram('stand');
  }
  if (cfg.info.needsKey && !cfg.apiKey) {
    return buildOfflineUniversalKinematicProgram(prompt);
  }

  const systemInstruction = `You are a Principal 3D Biomechanical Character Animator and Inverse Kinematics (IK) Choreographer.
Translate the user's motion prompt (in any language, e.g. Arabic or English) for character "${actorName}" over a ${duration}s shot into a JSON object with a "phases" array of 6-effector IK keyframes.
${sceneDescription ? `Scene Context: "${sceneDescription}".` : ''}

CHARACTER-LOCAL COORDINATE SYSTEM (in fractions of character height H = 1.0):
- X axis: +0.18 is Left Shoulder/Hip, -0.18 is Right Shoulder/Hip, 0.0 is Centerline.
- Y axis: 0.0 is Floor/Ground contact, 0.53 is Standing Hips height, 0.78 is Shoulders, 0.95 is Head, 1.25 is Overhead reach.
- Z axis: +Z is Forward (in front of character, e.g. +0.35), -Z is Backward (behind character, e.g. -0.25).

KEY BIOMECHANICAL EXAMPLES:
- Standing upright: hipsOffset [0, 0, 0], torsoAnglesDeg [0, 0, 0], leftHand [0.20, 0.50, 0.04], rightHand [-0.20, 0.50, 0.04], leftFoot [0.11, 0.04, 0], rightFoot [-0.11, 0.04, 0], lookAt [0, 0.90, 0.95]
- Crawling on ground: hipsOffset [0, -0.34, -0.06], torsoAnglesDeg [68, 0, 0], leftHand [0.18, 0.05, 0.36], rightHand [-0.18, 0.05, 0.36], leftFoot [0.14, 0.05, -0.26], rightFoot [-0.14, 0.05, -0.26], lookAt [0, 0.28, 0.95], oscillation: { frequencyHz: 1.5, handsAmp: [0, 0.05, 0.14], handsPhaseDiffRad: 3.14, feetAmp: [0, 0.04, 0.12], feetPhaseDiffRad: 3.14, hipsBobAmp: 0.015 }, stageDelta: [0, 16, 0]
- Kneeling / bowing: hipsOffset [0, -0.22, 0], torsoAnglesDeg [22, 0, 0], leftHand [0.15, 0.38, 0.18], rightHand [-0.15, 0.38, 0.18], leftFoot [0.12, 0.04, 0.16], rightFoot [-0.12, 0.04, -0.22], lookAt [0, 0.65, 0.85]

Return STRICTLY valid JSON matching this schema:
{
  "phases": [
    {
      "startRatio": 0.0,
      "endRatio": 0.5,
      "label": "Short description",
      "hipsOffset": [0, 0, 0],
      "torsoAnglesDeg": [0, 0, 0],
      "leftHand": [0.20, 0.50, 0.04],
      "rightHand": [-0.20, 0.50, 0.04],
      "leftFoot": [0.11, 0.04, 0],
      "rightFoot": [-0.11, 0.04, 0],
      "lookAt": [0, 0.90, 0.95],
      "oscillation": {
        "frequencyHz": 1.5,
        "handsAmp": [0, 0.05, 0.12],
        "handsPhaseDiffRad": 3.14,
        "feetAmp": [0, 0.04, 0.10],
        "feetPhaseDiffRad": 3.14,
        "hipsBobAmp": 0.01
      },
      "stageDelta": [0, 0, 0]
    }
  ]
}
No markdown fences or commentary.`;

  try {
    let rawText = '';
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(25_000)
        : undefined;
    if (cfg.provider === 'gemini') {
      const { url, headers, body } = buildGeminiRequest(cfg, prompt, 'object', systemInstruction);
      const res = await fetch(resolveWireUrl(url, cfg.provider), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        rawText = extractResponseText('gemini', data);
      }
    } else if (cfg.provider === 'ollama') {
      const { url, headers, body } = buildOllamaRequest(
        cfg,
        prompt,
        'object',
        systemInstruction,
        undefined,
        'Motion choreography prompt: '
      );
      const res = await fetch(resolveWireUrl(url, cfg.provider), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        rawText = extractResponseText('ollama', data);
      }
    } else {
      const { url, headers, body } = buildOpenAiRequest(cfg, prompt, 'object', systemInstruction);
      const res = await fetch(resolveWireUrl(url, cfg.provider), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        rawText = extractResponseText('openai', data);
      }
    }

    if (rawText) {
      const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const rawPhases = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.phases) ? parsed.phases : null;
      if (rawPhases && rawPhases.length > 0) {
        const phases: UniversalKinematicPhase[] = rawPhases.map((p: any, idx: number) => {
          const defStart = idx / rawPhases.length;
          const defEnd = (idx + 1) / rawPhases.length;
          return {
            startRatio: Math.max(0, Math.min(1, Number(p.startRatio ?? defStart))),
            endRatio: Math.max(0.05, Math.min(1, Number(p.endRatio ?? defEnd))),
            label: String(p.label || `Phase ${idx + 1}`),
            hipsOffset: clampTuple3(p.hipsOffset, [0, 0, 0], -0.45, 0.45),
            torsoAnglesDeg: clampTuple3(p.torsoAnglesDeg, [0, 0, 0], -85, 85),
            leftHand: clampTuple3(p.leftHand, [0.20, 0.50, 0.04], -0.6, 1.35),
            rightHand: clampTuple3(p.rightHand, [-0.20, 0.50, 0.04], -0.6, 1.35),
            leftFoot: clampTuple3(p.leftFoot, [0.11, 0.04, 0], -0.5, 0.8),
            rightFoot: clampTuple3(p.rightFoot, [-0.11, 0.04, 0], -0.5, 0.8),
            lookAt: clampTuple3(p.lookAt, [0, 0.90, 0.95], -1.5, 1.5),
            oscillation: p.oscillation
              ? {
                  frequencyHz: Math.max(0.2, Math.min(6, Number(p.oscillation.frequencyHz) || 1.5)),
                  handsAmp: p.oscillation.handsAmp
                    ? clampTuple3(p.oscillation.handsAmp, [0, 0, 0], -0.5, 0.5)
                    : undefined,
                  handsPhaseDiffRad: Number(p.oscillation.handsPhaseDiffRad ?? Math.PI),
                  feetAmp: p.oscillation.feetAmp
                    ? clampTuple3(p.oscillation.feetAmp, [0, 0, 0], -0.4, 0.4)
                    : undefined,
                  feetPhaseDiffRad: Number(p.oscillation.feetPhaseDiffRad ?? Math.PI),
                  hipsBobAmp: Number(p.oscillation.hipsBobAmp ?? 0),
                }
              : undefined,
            stageDelta: p.stageDelta ? clampTuple3(p.stageDelta, [0, 0, 0], -45, 45) : undefined,
          };
        });
        const hash = Math.abs(
          Array.from(prompt).reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0)
        ).toString(36);
        const program: UniversalKinematicProgram = {
          id: `universal-ik:llm_${hash}`,
          prompt,
          phases,
        };
        registerUniversalKinematicProgram(program);
        return program;
      }
    }
  } catch (err) {
    console.warn('[AIActingDirector] Universal IK synthesis fallback to offline synthesizer:', err);
  }

  return buildOfflineUniversalKinematicProgram(prompt);
}
