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
  resolveWireUrl,
  PROVIDERS,
} from './objectReasoner';
import { buildTemporalTimeline, formatEnvironment } from '../engine/promptCompiler';
import { analyzeShotPovVisibility } from '../engine/povVisibilityEngine';

export interface DirectedPromptResult {
  positivePrompt: string;
  negativePrompt: string;
  directorNotes: string;
  providerUsed: string;
  modelUsed: string;
}

const LTX_SYSTEM_INSTRUCTION = `You are a world-class Hollywood cinematographer and AI Prompt Director specialized in Lightricks LTX-Video (LTX-2.5 Gemma-4 22B Distilled Audio-Visual DiT).
Your objective is to convert a 3D directorial ShotSpec into a single continuous, natural descriptive paragraph written strictly in the present tense.

CORE LTX-2.5 OFFICIAL RULES:
1. STRICT CAMERA-POV VISIBILITY ONLY: Describe ONLY the subjects listed under "POV-VISIBLE STAGE ACTORS". Never mention or allude to any off-screen stage objects. If zero actors are visible in the camera POV, write a pure environmental/architectural shot.
2. WRITE IN PRESENT TENSE ONLY ("walks, turns, looks, shifts, breathes" — NEVER past tense or passive participles).
3. PHYSICAL CUES & CAMERA-RELATIVE FRAMING: Describe each visible subject's camera-relative screen zone (screen-left, center-frame, screen-right; close foreground, midground, distant background), physical performance, gaze, and posture.
4. NARRATIVE FLOW ACROSS TIME: Structure the paragraph chronologically across the shot duration (opening camera/action -> mid-shot movement -> closing resolution), noting if a subject enters or exits the camera frame during a pan or track.
5. DIEGETIC SOUNDSCAPE CUES: Conclude with a concise present-tense sentence describing synchronized diegetic audio (footsteps, cloth rustle, environmental acoustics) for the LTX-2.5 audio VAE.
6. AVOID AI BUZZWORDS: Absolutely NO "8k, masterpiece, hyperrealistic, trending on artstation". Use real-world optical terms (depth of field, shutter angle, lens focal length, volumetric light).
7. OUTPUT FORMAT: Return ONLY the final positive prompt text paragraph. Do not add conversational preamble.`;

const MINIMAX_SYSTEM_INSTRUCTION = `You are an elite Hollywood director and prompt engineer specialized in MiniMax H3 Reference-to-Video (MiniMaxH3ReferenceToVideo / Hailuo Ref2VA).
Your objective is to convert a 3D directorial ShotSpec into the canonical 6-section MiniMax H3 Reference-to-Video multi-subject + video-reference schema.

CORE MINIMAX H3 REF2VA OFFICIAL SCHEMA:
Structure the output strictly with these 6 sections:
subject_definitions:
Define <Subject 1> (<picture 1>) through <Subject N> (<picture N>) ONLY for the POV-visible actors listed in "POV-VISIBLE STAGE ACTORS" (up to 3 visible actors), explicitly noting which 3D previz hex color each visible subject replaces (e.g. #EF4444, #06B6D4, #F59E0B) in its camera-relative screen zone (screen-left, center-frame, screen-right) as an identification cue rather than surface color. Never define <Subject> slots for off-screen actors. Always define <Subject 4> (<picture 4> environment) replacing #334155 previz architecture, and <Video 1> as the supplied 3D previz video for camera trajectory and spatial blocking.

summary: [reference generation] One-sentence summary of the shot duration, aspect ratio, and reference guidance.

retention_analysis:
List each defined <Subject N> with its exact presence tag — (present throughout) if visible across all beats, or (appears in [Shot 1]) if entering/exiting mid-shot — followed by fully_preserved (for humans) or attribute_transfer (for props/vehicles/environment), and <Video 1> ([Shot 1] motion and blocking reference): partially_preserved.

detailed_description:
Continuous photorealistic lens, aperture, and [Shot 1] time-coded choreography (From 0.0–Xs... From X–Ys... From Y–Zs...) describing exact camera movement and ONLY the POV-visible subjects' trajectories, micro-acting cues, and lighting.

overall_soundscape:
Diegetic sound effects (footsteps, weather, cloth, ambient acoustics) synchronized with the visible action for MiniMax H3 audio generation.

non_diegetic_music:
N/A (or subtle score if requested).

OUTPUT FORMAT: Return ONLY the final structured prompt text. Do not add conversational preamble.`;

const SEEDANCE_SYSTEM_INSTRUCTION = `You are an elite Hollywood Director and AI Prompt Engineer specialized in Seedance 2.0 (ByteDance Seaweed Video Architecture).
Your objective is to translate a 3D directorial ShotSpec into the canonical, high-fidelity Seedance motion-matrix prompt formula.

CORE SEEDANCE 2.0 OFFICIAL FORMULA:
1. STRICT CAMERA-POV VISIBILITY ONLY: Include ONLY the POV-visible subjects listed under "POV-VISIBLE STAGE ACTORS". Never mention off-screen stage objects.
2. Structure the prompt strictly with these labeled brackets:
[Camera 6-Axis Motion & Matrix Trajectory]: Explicit 3D movement trajectory (dolly, truck, pedestal, pan, tilt), lens focal length, dynamic depth of field, and camera physics.
[Subject Dynamics & Aerodynamic Physics]: POV-visible subject physical appearance, camera-relative screen framing, attire movement aerodynamics, and locomotion velocity (omit if 0 visible actors).
[Temporal Cue Timetable]: Sequential time-coded action beats across the shot ([0.0s - Xs]: ... | [Xs - Ys]: ... | [Ys - Zs]: ...).
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

  const pov = analyzeShotPovVisibility(shot);
  const timeline = buildTemporalTimeline(shot, pov);
  const timelineSummary = timeline
    .map((b) => `Phase (${b.timeRange}): ${b.cameraAction} | ${b.actorAction}`)
    .join('\n');

  const defaultPalette = ['#EF4444', '#06B6D4', '#F59E0B', '#10B981'];
  const actorDetails = pov.visibleAnalyses
    .map((analysis, idx) => {
      const a = analysis.actor;
      const presence = analysis.visibleInAllBeats
        ? 'present throughout all beats'
        : `visible in beats: ${(['open', 'mid', 'close'] as const)
            .filter((phase) => analysis.visibleInBeats[phase])
            .join(', ')}`;
      return `- <Subject ${idx + 1}> Name: ${a.name}, Kind: ${a.kind || 'human'}, Previs Hex ID: ${(
        a.color || defaultPalette[idx % defaultPalette.length]
      ).toUpperCase()}, Descriptors: "${a.token}", Scale: ${
        a.scale ?? 1.0
      }x, Camera-POV Screen Zone: ${analysis.primaryScreenZone}, Coverage: ${
        analysis.beats[analysis.firstVisibleBeat || 'open'].coverage
      }, Temporal Presence: (${presence}), Action: "${a.actionDescription}"${
        a.motionClip ? `, Motion Clip: ${a.motionClip}` : ''
      }`;
    })
    .join('\n');

  const excludedNote =
    pov.offScreenActors.length > 0
      ? `\nOFF-SCREEN STAGE OBJECTS (OUTSIDE CAMERA POV FRUSTUM — DO NOT MENTION OR INCLUDE IN PROMPT): ${pov.offScreenActors
          .map((a) => a.name)
          .join(', ')}`
      : '';

  const effectiveLensStr =
    typeof shot.camera.lens.customFocalLengthMm === 'number' &&
    `${shot.camera.lens.customFocalLengthMm}mm` !== shot.camera.lens.focalLength
      ? `${shot.camera.lens.customFocalLengthMm}mm (custom slider, base preset ${shot.camera.lens.focalLength})`
      : shot.camera.lens.focalLength;

  const envSummary = shot.environment ? formatEnvironment(shot.environment) : 'Standard stage';

  const userContent = `DIRECTORIAL SHOT SPECIFICATION:
Shot Title: "${shot.name}"
Target Diffusion Engine: ${modelLabel}
Duration: ${shot.durationSeconds} seconds @ ${shot.frameRate} fps
Aspect Ratio: ${shot.aspectRatio}

SCENE DESCRIPTION & ENVIRONMENT:
"${shot.sceneDescription}"
Environment Details: ${envSummary}

CAMERA & OPTICS:
- Lens: ${effectiveLensStr} (Aperture: ${shot.camera.lens.aperture}, Sensor: ${shot.camera.lens.sensorSize || 'super-35'})
- Shot Framing: ${shot.camera.shotType}
- Camera Angle: ${shot.camera.angle}${shot.camera.dutchRollDeg ? ` (Dutch Roll: ${shot.camera.dutchRollDeg}°)` : ''}
- Movement Type: ${shot.camera.movement.type}
- Speed & Pacing: ${shot.camera.movement.speed}, ${shot.camera.movement.pacing || 'ease-in-out'}

POV-VISIBLE STAGE ACTORS & CHOREOGRAPHY:
${actorDetails || 'None in camera POV (pure environmental shot)'}${excludedNote}

LIGHTING & ATMOSPHERE:
- Style: ${shot.lighting.style}
- Direction: ${shot.lighting.direction}
- Contrast: ${shot.lighting.contrast}

CHRONOLOGICAL STAGE TIMELINE BEATS:
${timelineSummary}

Generate the optimal, high-fidelity prompt for ${isSeedance ? 'Seedance 2.0' : isMiniMax ? 'MiniMax (Hailuo)' : 'LTX-2.5'} following the official prompting standards.`;

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
        num_predict: 2048,
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
    openAiBody.max_tokens = 2048;
    requestUrl = req.url;
    requestHeaders = req.headers;
    requestBody = openAiBody;
  }

  let res: Response;
  const timeoutMs = 180_000;
  const wireUrl = resolveWireUrl(requestUrl, cfg.provider);
  try {
    res = await fetch(wireUrl, {
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
