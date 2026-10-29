/**
 * AI Acting Director Service
 * Translates natural language character acting prompts into timed 3D stage keyframe cues,
 * semantic pose presets, locomotion gaits, and spatial waypoints.
 * Works seamlessly offline with rule-based heuristics, or elevates through local LLM / Gemini.
 */

import {
  getReasonerConfig,
  buildOpenAiRequest,
  buildGeminiRequest,
  extractResponseText,
} from './objectReasoner';

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
    .split(/(?:;|\. |\n|,\s*(?=[0-9]+(?:\.[0-9]+)?s\b)|,|\band then\b|\bthen\b|\bafter that\b|\bfollowed by\b)/i)
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
    if (cfg.provider === 'gemini') {
      const { url, headers, body } = buildGeminiRequest(cfg, prompt, 'object', systemInstruction);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        rawText = extractResponseText('gemini', data);
      }
    } else {
      const protocol = cfg.provider === 'ollama' ? 'ollama' : 'openai';
      const { url, headers, body } = buildOpenAiRequest(cfg, prompt, 'object', systemInstruction);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        rawText = extractResponseText(protocol, data);
      }
    }

    if (rawText) {
      const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validated: ActingCueProposal[] = parsed.map((item, idx) => {
          const t = Math.max(0, Math.min(safeDuration, Number(item.time ?? (idx / parsed.length) * safeDuration)));
          const posePreset = VALID_PRESETS.includes(item.posePreset) ? item.posePreset : 'neutral-stand';
          const gait = ['auto', 'walk', 'run', 'sneak', 'idle', 'none'].includes(item.gait) ? item.gait : 'none';
          return {
            time: Number(t.toFixed(2)),
            cueLabel: item.cueLabel || item.posePreset || `Beat ${idx + 1}`,
            posePreset,
            gait,
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
