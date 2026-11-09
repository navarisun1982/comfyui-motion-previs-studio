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
import { buildTemporalTimeline, formatEnvironment, formatReadableEnginePrompt } from '../engine/promptCompiler';
import { analyzeShotPovVisibility } from '../engine/povVisibilityEngine';

export interface DirectedPromptResult {
  positivePrompt: string;
  negativePrompt: string;
  directorNotes: string;
  providerUsed: string;
  modelUsed: string;
}

const LTX_SYSTEM_INSTRUCTION = `You are a world-class Hollywood cinematographer and AI Prompt Director specialized in Lightricks LTX-Video (LTX-2.5 Gemma-4 22B Distilled Audio-Visual DiT).
Your objective is to convert a 3D directorial ShotSpec into a clear, well-organized multi-paragraph narrative prompt written strictly in the present tense, separated by blank lines (\\n\\n) for easy human readability.

CORE LTX-2.5 OFFICIAL RULES:
1. STRICT CAMERA-POV VISIBILITY ONLY: Describe ONLY the entities listed under "POV-VISIBLE STAGE ACTORS". Never mention or allude to any off-screen stage objects. If zero entities are visible in the camera POV, write a pure environmental/architectural shot.
2. UNIVERSAL PREVIS-TO-REALITY INSTANTIATION (NO TEXTURE-WRAPPING): Treat the 3D previz guide strictly as a spatial and camera blueprint (position, scale volume, and perspective). Every visible entity (whether a human, animal, tree/foliage, vehicle, prop, architecture, or environment) must completely supplant its 3D placeholder proxy as a true, living real-world entity with its own authentic silhouette, organic complexity, and natural secondary physics—never a texture-wrapped or painted-over 3D proxy mesh.
3. WRITE IN PRESENT TENSE ONLY ("walks, turns, sways, shifts, breathes" — NEVER past tense or passive participles).
4. PHYSICAL CUES & CAMERA-RELATIVE FRAMING: Describe each visible entity's camera-relative screen zone (screen-left, center-frame, screen-right; close foreground, midground, distant background), authentic physical dynamics, and secondary micro-motion.
5. ORGANIZED PARAGRAPH STRUCTURE (4-5 READABLE PARAGRAPHS SEPARATED BY \\n\\n):
   - Paragraph 1: Camera framing, lens optics, POV-visible subjects, setting, and lighting/atmosphere.
   - Paragraph 2: Continuous camera trajectory and opening beat choreography.
   - Paragraph 3: Mid-shot progression and closing beat resolution.
   - Paragraph 4: Previs-to-reality spatial fidelity and synchronized diegetic soundscape cues (footsteps, wind, cloth rustle, environmental acoustics) for the LTX-2.5 audio VAE.
6. AVOID AI BUZZWORDS: Absolutely NO "8k, masterpiece, hyperrealistic, trending on artstation". Use real-world optical terms (depth of field, shutter angle, lens focal length, volumetric light).
7. OUTPUT FORMAT: Return ONLY the final organized multi-paragraph positive prompt text. Do not add conversational preamble.`;

const MINIMAX_SYSTEM_INSTRUCTION = `You are an elite Hollywood director and prompt engineer specialized in MiniMax H3 Reference-to-Video (MiniMaxH3ReferenceToVideo / Hailuo Ref2VA).
Your objective is to convert a 3D directorial ShotSpec into the canonical 6-section MiniMax H3 Full-Reference Video Generation Prompt schema (subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music).

CORE MINIMAX H3 REF2VA OFFICIAL FULL-REFERENCE SCHEMA:
Structure the output strictly with these 6 sections:
subject_definitions:
Define <Subject 1> (<Picture 1>) through <Subject N> (<Picture N>) ONLY for the POV-visible entities listed in "POV-VISIBLE STAGE ACTORS" (up to 3 visible entities), plus <Subject 4> (<Picture 4> Scene Environment).
CRITICAL OFFICIAL FULL-REFERENCE RULES:
- <Picture N> defines <Subject N>'s finished appearance, construction, materials, colors, proportions, and lighting treatment. <Subject N>'s motion trajectory, timing, body/object mechanics, orientation, and complete progression come from <Video 1>.
- <Subject 4> ([Scene Environment] visually defined by <Picture 4>) defines the finished environment, architecture, terrain, material palette, atmospheric depth, and lighting relationships, while its spatial perspective, camera parallax, and background movement follow <Video 1> exactly.
- <Video 1> is the original 3D animation reference and the authoritative temporal and spatial source for the entire target video. It defines the exact subject animation, frame-by-frame trajectories, environment parallax, camera angle, camera position, framing, tracking behavior, lens behavior, shot duration, and complete temporal progression. Whenever movement or static posture implied by <Picture 1>..<Picture 4> differs from <Video 1>, <Video 1> takes absolute priority.
- Never include hex color codes or ask the model to ignore a reference image's background.

summary: [reference generation] The target video recreates the exact 3D animation, subject motion, and camera performance of <Video 1> while applying the finished subject and world appearance established by <Picture 1>..<Picture 4>. <Video 1> has absolute priority for movement, timing, blocking, camera motion, and framing.

retention_analysis:
- For each visible subject <Subject 1>..<Subject 3>, use: "<Subject N> (present throughout): attribute_transfer - the finished appearance, materials, proportions, and surface details from <Picture N> are transferred onto the animated subject in <Video 1> while preserving the source motion sequence, timing, orientation, and 3D spatial trajectory."
- For <Subject 4> (environment), use: "<Subject 4> (present throughout): fully_preserved - the architecture, terrain, surface materials, lighting, and atmospheric depth from <Picture 4> define the finished environment while following the exact 3D perspective and camera motion of <Video 1>."
- For <Video 1>, use: "<Video 1> (entire temporal structure): fully_preserved - preserve its complete animation, timing, camera transform, camera angle, framing, environment parallax, shot duration, and frame progression without alteration."

detailed_description:
The target video is a highly detailed cinematic sequence combining the finished visual treatment of <Picture 1>..<Picture 4> with the exact animation and virtual-camera performance of <Video 1>. <Video 1> is the strict motion master; no movement should be regenerated from the still reference images. Follow with [Shot 1] time-coded choreography using the exact beat time ranges provided in CHRONOLOGICAL STAGE TIMELINE BEATS, describing exact camera movement in every beat and ONLY the POV-visible entities' trajectories, organic secondary motion, and lighting.

overall_soundscape:
Diegetic sound effects synchronized with the visible action and environment for MiniMax H3 audio generation.

non_diegetic_music:
N/A (or subtle score if requested).

OUTPUT FORMAT: Return ONLY the final structured prompt text. Do not add conversational preamble.`;

const SEEDANCE_SYSTEM_INSTRUCTION = `You are an elite Hollywood Director and AI Prompt Engineer specialized in Seedance 2.0 (ByteDance Seaweed Video Architecture).
Your objective is to translate a 3D directorial ShotSpec into the canonical, high-fidelity Seedance motion-matrix prompt formula, organized into distinct paragraphs separated by blank lines (\\n\\n) for easy human readability.

CORE SEEDANCE 2.0 OFFICIAL FORMULA:
1. STRICT CAMERA-POV VISIBILITY ONLY: Include ONLY the POV-visible entities listed under "POV-VISIBLE STAGE ACTORS". Never mention off-screen stage objects.
2. UNIVERSAL PREVIS-TO-REALITY INSTANTIATION: Use 3D stage vectors strictly for camera perspective, spatial placement, and scale volumes; instantiate every visible entity (human, tree, vehicle, prop, architecture, environment) as a full, living real-world entity with natural secondary physics rather than texture-wrapped proxy geometry.
3. Structure the prompt strictly with these labeled brackets, placing EACH bracketed section in its own paragraph separated by a blank line (\\n\\n):

[Camera 6-Axis Motion & Matrix Trajectory]:
Explicit 3D movement trajectory (dolly, truck, pedestal, pan, tilt), lens focal length, dynamic depth of field, and camera physics.

[Subject Dynamics & Aerodynamic Physics]:
POV-visible entity physical appearance, camera-relative screen framing, organic secondary motion, and velocity (omit if 0 visible entities).

[Previs-to-Reality Spatial Instantiation]:
Explicit instruction to replace 3D placeholder volumes with authentic living real-world entities.

[Temporal Cue Timetable]:
Sequential time-coded action beats across the shot, with each beat on its own line (- [0.0s - Xs]: ... \\n- [Xs - Ys]: ... \\n- [Ys - Zs]: ...).

[Atmospheric Space & Volumetric Lighting]:
Light source geometry, volumetric falloff, atmospheric density, and environmental reflections.

[Render & Motion Profile]:
Optical photorealism, 24fps motion matrix coherence, 180-degree shutter angle.

OUTPUT FORMAT: Return ONLY the final assembled multi-paragraph bracketed prompt text. Do not add conversational preamble.`;

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

  const actorDetails = pov.visibleAnalyses
    .map((analysis, idx) => {
      const a = analysis.actor;
      const firstBeat = analysis.firstVisibleBeat
        ? analysis.beats[analysis.firstVisibleBeat]
        : analysis.beats.open;
      const presence = analysis.visibleInAllBeats
        ? 'present throughout all beats'
        : `visible in beats: ${(['open', 'mid', 'close'] as const)
            .filter((phase) => analysis.visibleInBeats[phase])
            .join(', ')}`;
      return `- <Subject ${idx + 1}> Name: ${a.name}, Kind: ${a.kind || 'human'}, Descriptors: "${a.token}", Scale: ${
        a.scale ?? 1.0
      }x, Camera-POV Screen Zone: ${analysis.primaryScreenZone}, Coverage: ${
        firstBeat.coverage
      }, Initial Elevation: ${firstBeat.elevationPhrase}, 3D Camera-Relative Viewing Orientation: ${
        analysis.orientationTransitionSummary
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
  const effectiveCameraMoveDesc = pov.cameraKinematics.isCustomCameraTrajectory
    ? `${pov.cameraKinematics.overallDescription} (custom 3D camera trajectory — do NOT mention preset "${shot.camera.movement.type}")`
    : `${shot.camera.movement.type} (${pov.cameraKinematics.overallDescription})`;

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
- Measured 3D Camera Trajectory: ${effectiveCameraMoveDesc}
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
  const cleanedPositive = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:markdown|text)?/gi, '')
    .trim()
    .replace(/^["']|["']$/g, '');
  const positivePrompt = formatReadableEnginePrompt(cleanedPositive, model);

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

export interface PromptChatRefinementResult {
  positivePrompt: string;
  negativePrompt: string;
  assistantReply: string;
  providerUsed: string;
  modelUsed: string;
}

/**
 * Multi-turn interactive AI Prompt Co-Director Chat.
 * Modifies ONLY the prompt text (positivePrompt and optionally negativePrompt)
 * based on the user's conversational instructions (Arabic or English), without altering the 3D Stage.
 */
export async function refinePromptWithAIChat(options: {
  shot: ShotSpec;
  targetModelId?: string;
  currentPositivePrompt: string;
  currentNegativePrompt: string;
  userInstruction: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; text: string }>;
}): Promise<PromptChatRefinementResult> {
  const {
    shot,
    targetModelId,
    currentPositivePrompt,
    currentNegativePrompt,
    userInstruction,
    chatHistory = [],
  } = options;

  const cfg = getReasonerConfig();
  const providerInfo = PROVIDERS[cfg.provider];
  const model = targetModelId || shot.targetModel;
  const isMiniMax = model === 'minimax-h3';
  const isSeedance = model === 'seedance';
  const baseEngineRules = isMiniMax
    ? MINIMAX_SYSTEM_INSTRUCTION
    : isSeedance
      ? SEEDANCE_SYSTEM_INSTRUCTION
      : LTX_SYSTEM_INSTRUCTION;

  const isArabicInput = /[\u0600-\u06FF]/.test(userInstruction);

  const chatSystemInstruction = `${baseEngineRules}

INTERACTIVE AI PROMPT CO-DIRECTOR MODE:
You are collaborating directly with the Film Director to refine the existing video generation prompt.
CRITICAL RULES:
1. Modify ONLY the prompt text ("positivePrompt" and optionally "negativePrompt") according to the Director's instruction.
2. Keep the positivePrompt in English and strictly formatted into organized paragraphs separated by blank lines (\\n\\n) for ${
    isMiniMax ? 'MiniMax H3 (6-section schema with <Subject N> / <Picture N> / <Video 1>)' : isSeedance ? 'Seedance 2.0 multi-paragraph bracketed formula' : 'LTX-2.5 present-tense multi-paragraph narrative'
  }, even if the Director speaks to you in Arabic.
3. Preserve all parts of the current prompt that the Director did NOT ask to change.
4. Write "assistantReply" in ${
    isArabicInput ? 'Arabic (العربية)' : 'the same language the Director used'
  } — briefly and clearly explaining what you updated in the prompt (1 to 3 sentences).
5. Respond ONLY with a valid JSON object matching this exact structure (no markdown code fences around it if possible):
{
  "assistantReply": "Brief explanation to the director...",
  "positivePrompt": "The complete updated positive prompt...",
  "negativePrompt": "The updated negative prompt..."
}`;

  const historyTranscript =
    chatHistory.length > 0
      ? chatHistory
          .slice(-8)
          .map((m) => `${m.role === 'user' ? 'Director' : 'AI Co-Director'}: ${m.text}`)
          .join('\n')
      : 'None';

  const userPayload = `CURRENT POSITIVE PROMPT:
"""
${currentPositivePrompt}
"""

CURRENT NEGATIVE PROMPT:
"""
${currentNegativePrompt}
"""

RECENT CONVERSATION HISTORY:
${historyTranscript}

DIRECTOR'S NEW INSTRUCTION / REQUEST:
"${userInstruction}"

Apply the Director's request to the prompt while preserving the ${
    isMiniMax ? 'MiniMax H3' : isSeedance ? 'Seedance 2.0' : 'LTX-2.5'
  } prompt structure. Return JSON with "assistantReply", "positivePrompt", and "negativePrompt".`;

  let requestUrl = '';
  let requestHeaders: Record<string, string> = {};
  let requestBody: unknown = null;

  if (cfg.provider === 'gemini') {
    const req = buildGeminiRequest(cfg, userPayload, 'object');
    req.body.systemInstruction = { parts: [{ text: chatSystemInstruction }] };
    requestUrl = req.url;
    requestHeaders = req.headers;
    requestBody = req.body;
  } else if (cfg.provider === 'ollama') {
    requestUrl = `${cfg.url}/api/chat`;
    requestHeaders = { 'Content-Type': 'application/json' };
    requestBody = {
      model: cfg.model,
      messages: [
        { role: 'system', content: chatSystemInstruction },
        { role: 'user', content: userPayload },
      ],
      format: 'json',
      stream: false,
      think: false,
      options: {
        temperature: 0.35,
        num_predict: 2500,
      },
    };
  } else {
    const req = buildOpenAiRequest(cfg, userPayload, 'object');
    const openAiBody = req.body as {
      messages: Array<{ role: string; content: string }>;
      temperature?: number;
      max_tokens?: number;
    };
    if (openAiBody.messages && openAiBody.messages[0]) {
      openAiBody.messages[0].content = chatSystemInstruction;
    }
    openAiBody.temperature = 0.35;
    openAiBody.max_tokens = 2500;
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
        `LLM Reasoner (${providerInfo.label} - ${cfg.model}) timed out after ${timeoutMs / 1000}s.`
      );
    }
    const isNetwork = err instanceof TypeError && /failed to fetch/i.test(err.message);
    if (isNetwork) {
      throw new Error(
        `Cannot reach ${providerInfo.label} at ${requestUrl}. Check that the local LLM server is running.`
      );
    }
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM provider error (HTTP ${res.status}): ${text.slice(0, 180)}`);
  }

  const data = await res.json();
  const rawText = extractResponseText(providerInfo.protocol, data)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();

  let parsedPositive = '';
  let parsedNegative = currentNegativePrompt;
  let parsedReply = '';

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      if (typeof obj.positivePrompt === 'string' && obj.positivePrompt.trim()) {
        parsedPositive = obj.positivePrompt.trim();
      }
      if (typeof obj.negativePrompt === 'string' && obj.negativePrompt.trim()) {
        parsedNegative = obj.negativePrompt.trim();
      }
      if (typeof obj.assistantReply === 'string' && obj.assistantReply.trim()) {
        parsedReply = obj.assistantReply.trim();
      }
    } catch {
      // Fallback if JSON had unescaped newlines
    }
  }

  if (!parsedPositive) {
    const cleaned = rawText
      .replace(/```(?:json|markdown|text)?/gi, '')
      .trim()
      .replace(/^["']|["']$/g, '');
    parsedPositive = cleaned || currentPositivePrompt;
  }

  if (!parsedReply) {
    parsedReply = isArabicInput
      ? 'تم تحديث نص البرومبت بناءً على طلبك مع الحفاظ على صيغة المحرك.'
      : 'Updated the prompt according to your instruction while preserving the engine schema.';
  }

  return {
    positivePrompt: formatReadableEnginePrompt(parsedPositive, model),
    negativePrompt: parsedNegative,
    assistantReply: parsedReply,
    providerUsed: providerInfo.label,
    modelUsed: cfg.model,
  };
}
