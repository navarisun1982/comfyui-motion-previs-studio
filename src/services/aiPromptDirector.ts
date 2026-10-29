/**
 * AI Prompt Director Service
 * Uses the active LLM Provider (Ollama, llama.cpp, OpenAI-compatible, Gemini)
 * to synthesize cinematic, model-specialized video generation prompts grounded in the
 * official prompting documentation of LTX-2.5 and MiniMax (Hailuo AI).
 */
import { ShotSpec } from '../types/shotspec';
import {
  getReasonerConfig,
  buildOpenAiRequest,
  buildGeminiRequest,
  extractResponseText,
  PROVIDERS,
} from './objectReasoner';
import { buildTemporalTimeline } from '../engine/promptCompiler';

export interface DirectedPromptResult {
  positivePrompt: string;
  negativePrompt: string;
  directorNotes: string;
  providerUsed: string;
  modelUsed: string;
}

const LTX_SYSTEM_INSTRUCTION = `You are a world-class Hollywood cinematographer and AI Prompt Director specialized in Lightricks LTX-Video (LTX-2.5).
Your objective is to convert a 3D directorial ShotSpec into a single continuous, natural descriptive paragraph written strictly in the present tense.

CORE LTX RULES:
1. WRITE IN PRESENT TENSE ONLY ("walks, turns, looks, shifts, breathes" — NEVER "walking, turned, or walks into").
2. PHYSICAL CUES OVER EMOTION: Instead of describing feelings, describe physical performance, jaw tension, gaze, and posture.
3. VERBS DRIVE MOTION: Use active physical verbs to drive diffusion frame-to-frame mechanics.
4. NARRATIVE FLOW ACROSS TIME: Structure the paragraph chronologically across the shot duration (opening camera/action -> mid-shot movement -> closing resolution).
5. AVOID AI BUZZWORDS: Absolutely NO "8k, masterpiece, hyperrealistic, trending on artstation". Use real-world optical terms (depth of field, shutter angle, lens focal length, volumetric light).
6. OUTPUT FORMAT: Return ONLY the final positive prompt text paragraph. Do not add conversational preamble.`;

const MINIMAX_SYSTEM_INSTRUCTION = `You are an elite Hollywood director and prompt engineer specialized in MiniMax H3 Reference-to-Video (MiniMaxH3ReferenceToVideo / Hailuo).
Your objective is to convert a 3D directorial ShotSpec into the canonical MiniMax H3 Reference-to-Video multi-subject + video-reference schema.

CORE MINIMAX H3 REF2VA SCHEMA:
Structure the output strictly with these sections:
subject_definitions:
Define <Subject 1> (<picture 1>), <Subject 2> (<picture 2>), <Subject 3> (<picture 3>), and <Subject 4> (<picture 4> environment), explicitly noting which 3D previz hex color each subject replaces (e.g. #EF4444, #06B6D4, #F59E0B, #334155) as an identification cue rather than surface color. Define <Video 1> as the supplied 3D previz video for camera trajectory and spatial blocking.

summary: [reference generation] One-sentence summary of the shot duration, aspect ratio, and reference guidance.

retention_analysis:
List <Subject 1> through <Subject 4> (fully_preserved or attribute_transfer) and <Video 1> (partially_preserved motion and blocking reference).

detailed_description:
Continuous photorealistic lens, aperture, and [Shot 1] time-coded choreography (From 0.0–Xs... From X–Ys... From Y–Zs...) describing exact camera movement, subject trajectories, micro-acting cues, and lighting.

overall_soundscape:
Diegetic sound effects (footsteps, weather, cloth, ambient acoustics) synchronized with the action for MiniMax H3 audio generation.

non_diegetic_music:
N/A (or subtle score if requested).

OUTPUT FORMAT: Return ONLY the final structured prompt text. Do not add conversational preamble.`;

const SEEDANCE_SYSTEM_INSTRUCTION = `You are an elite Hollywood Director and AI Prompt Engineer specialized in Seedance 2.0 (ByteDance Seaweed Video Architecture).
Your objective is to translate a 3D directorial ShotSpec into the canonical, high-fidelity Seedance motion-matrix prompt formula.

CORE SEEDANCE FORMULA:
Structure the prompt strictly with these labeled brackets:
[Camera 6-Axis Motion & Matrix Trajectory]: Explicit 3D movement trajectory (dolly, truck, pedestal, pan, tilt), lens focal length, dynamic depth of field, and camera physics.
[Subject Dynamics & Aerodynamic Physics]: Subject physical appearance, attire movement aerodynamics, locomotion velocity, and stage coordinate trajectory.
[Temporal Cue Timetable]: Sequential time-coded action beats across the shot (e.g. [0.0s - Xs]: ... | [Xs - Ys]: ... | [Ys - Zs]: ...).
[Atmospheric Space & Volumetric Lighting]: Light source geometry, volumetric falloff, atmospheric density, and environmental reflections.
[Render & Motion Profile]: Optical photorealism, 24fps motion matrix coherence, 180-degree shutter angle.

OUTPUT FORMAT: Return ONLY the final assembled bracketed prompt text. Do not add conversational preamble.`;

export async function directPromptWithAI(
  shot: ShotSpec,
  targetModelId?: string
): Promise<DirectedPromptResult> {
  const cfg = getReasonerConfig();
  const providerInfo = PROVIDERS[cfg.provider];
  const model = targetModelId || shot.targetModel;
  const isMiniMax = model === 'minimax-h3';
  const isSeedance = model === 'seedance';
  const systemInstruction = isMiniMax
    ? MINIMAX_SYSTEM_INSTRUCTION
    : isSeedance
      ? SEEDANCE_SYSTEM_INSTRUCTION
      : LTX_SYSTEM_INSTRUCTION;
  const modelLabel = isMiniMax
    ? 'MiniMax H3 / Hailuo Video'
    : isSeedance
      ? 'Seedance 2.0 (ByteDance Seaweed)'
      : 'Lightricks LTX-2.5 (22B Distilled DiT)';

  const timeline = buildTemporalTimeline(shot);
  const timelineSummary = timeline
    .map((b) => `Phase (${b.timeRange}): ${b.cameraAction} | ${b.actorAction}`)
    .join('\n');

  const actorDetails = shot.actors
    .map(
      (a) =>
        `- Name: ${a.name}, Descriptors: "${a.token}", Scale: ${a.scale ?? 1.0}x, Cue Start: ${a.trajectory?.startTimeSeconds ?? 0}s, Trajectory: (${a.trajectory?.startPosition?.x}, ${a.trajectory?.startPosition?.y}) -> (${a.trajectory?.endPosition?.x}, ${a.trajectory?.endPosition?.y}), Action: "${a.actionDescription}"`
    )
    .join('\n');

  const userContent = `DIRECTORIAL SHOT SPECIFICATION:
Shot Title: "${shot.name}"
Target Diffusion Engine: ${modelLabel}
Duration: ${shot.durationSeconds} seconds @ ${shot.frameRate} fps
Aspect Ratio: ${shot.aspectRatio}

SCENE DESCRIPTION:
"${shot.sceneDescription}"

CAMERA & OPTICS:
- Lens: ${shot.camera.lens.focalLength} (Aperture: ${shot.camera.lens.aperture})
- Shot Framing: ${shot.camera.shotType}
- Camera Angle: ${shot.camera.angle}
- Movement Type: ${shot.camera.movement.type}
- Speed & Pacing: ${shot.camera.movement.speed}, ${shot.camera.movement.pacing || 'ease-in-out'}

STAGE ACTORS & CHOREOGRAPHY:
${actorDetails || 'None (environmental shot)'}

LIGHTING & ATMOSPHERE:
- Style: ${shot.lighting.style}
- Direction: ${shot.lighting.direction}
- Contrast: ${shot.lighting.contrast}

CHRONOLOGICAL STAGE TIMELINE BEATS:
${timelineSummary}

Generate the optimal, high-fidelity prompt for ${isMiniMax ? 'MiniMax (Hailuo)' : 'LTX-2.5'} following the official prompting standards.`;

  let requestUrl = '';
  let requestHeaders: Record<string, string> = {};
  let requestBody: unknown = null;

  if (cfg.provider === 'gemini') {
    const req = buildGeminiRequest(cfg, userContent, 'none');
    req.body.systemInstruction = { parts: [{ text: systemInstruction }] };
    requestUrl = req.url;
    requestHeaders = req.headers;
    requestBody = req.body;
  } else if (cfg.provider === 'ollama') {
    requestUrl = `${cfg.url}/api/chat`;
    requestHeaders = { 'Content-Type': 'application/json' };
    requestBody = {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userContent },
      ],
      stream: false,
      think: false,
      options: {
        temperature: 0.4,
        num_predict: 500,
      },
    };
  } else {
    // OpenAI or llama.cpp
    const req = buildOpenAiRequest(cfg, userContent, 'none');
    const openAiBody = req.body as { messages: Array<{ role: string; content: string }>; temperature?: number; max_tokens?: number };
    if (openAiBody.messages && openAiBody.messages[0]) {
      openAiBody.messages[0].content = systemInstruction;
    }
    openAiBody.temperature = 0.4;
    openAiBody.max_tokens = 500;
    requestUrl = req.url;
    requestHeaders = req.headers;
    requestBody = openAiBody;
  }

  let res: Response;
  const timeoutMs = 180_000;
  try {
    res = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    const isTimeout =
      (err instanceof DOMException && err.name === 'TimeoutError') ||
      (err instanceof Error && /timeout|abort|signal/i.test(err.message));
    if (isTimeout) {
      throw new Error(
        `LLM Reasoner (${providerInfo.label} - ${cfg.model}) timed out after ${timeoutMs / 1000}s. The model may be cold-loading into GPU VRAM or busy. Please try again.`
      );
    }
    const isNetwork = err instanceof TypeError && /failed to fetch/i.test(err.message);
    if (isNetwork) {
      throw new Error(
        `Cannot reach ${providerInfo.label} at ${requestUrl}. Check that the local server is running and accessible.`
      );
    }
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM provider error (HTTP ${res.status}): ${text.slice(0, 180)}`);
  }

  const data = await res.json();
  const rawText = extractResponseText(providerInfo.protocol, data);
  const positivePrompt = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:markdown|text)?/gi, '')
    .trim()
    .replace(/^["']|["']$/g, '');

  const negativePrompt = isMiniMax
    ? 'blurry, low quality, deformed limbs, floating artifacts, jerky camera, unnatural motion, digital noise, oversaturated, morphing'
    : isSeedance
      ? 'floating artifacts, frame tearing, flickering geometry, unnatural jerky acceleration, low resolution, warped proportions, morphing hands, plastic textures, watermark'
      : 'jitter, warping, temporal flicker, distorted anatomy, morphing faces, plastic skin, jittery frame skips, overexposed, low quality, 3d render, watermark, blurry';

  return {
    positivePrompt,
    negativePrompt,
    directorNotes: `Directorial prompt synthesized via ${providerInfo.label} (${cfg.model}) matching official ${isMiniMax ? 'MiniMax H3' : isSeedance ? 'Seedance 2.0' : 'LTX-2.5'} standards.`,
    providerUsed: providerInfo.label,
    modelUsed: cfg.model,
  };
}
