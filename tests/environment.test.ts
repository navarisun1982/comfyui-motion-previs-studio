import { describe, it, expect } from 'vitest';
import {
  EnvironmentSpecSchema,
  CINEMATIC_ENVIRONMENT_PRESETS,
  GroundSurfaceTypeSchema,
  EnvironmentWeatherSchema,
  EnvironmentTimeOfDaySchema,
} from '../src/types/environment';
import { createDefaultShotSpec, ShotSpecSchema } from '../src/types/shotspec';
import { formatEnvironment, compileLtxPrompt, compileMiniMaxPrompt, compileSeedancePrompt } from '../src/engine/promptCompiler';
import {
  ENVIRONMENT_JSON_SCHEMA,
  ENVIRONMENT_REASONER_SYSTEM_PROMPT,
  buildOllamaRequest,
  buildOpenAiRequest,
  buildGeminiRequest,
  PROVIDERS,
  ReasonerConfig,
} from '../src/services/objectReasoner';

const cfg = (provider: keyof typeof PROVIDERS, over: Partial<ReasonerConfig> = {}): ReasonerConfig => ({
  provider,
  info: PROVIDERS[provider],
  url: 'http://host/v1',
  model: 'model-a',
  apiKey: '',
  ...over,
});

describe('Environment & Scene Location System', () => {
  it('validates canonical EnvironmentSpecSchema and default fallback values', () => {
    const defaultEnv = EnvironmentSpecSchema.parse({});
    expect(defaultEnv.id).toBe('env-studio-stage');
    expect(defaultEnv.name).toBe('Soundstage Studio');
    expect(defaultEnv.nameAr).toBe('بلاتوه استوديو تصوير');
    expect(defaultEnv.category).toBe('studio');
    expect(defaultEnv.weather).toBe('clear');
    expect(defaultEnv.timeOfDay).toBe('night');
    expect(defaultEnv.groundSurface).toBe('studio-floor');
    expect(defaultEnv.fogDensity).toBeGreaterThanOrEqual(0);
    expect(defaultEnv.fogColor).toBe('#0d111a');
  });

  it('validates all production CINEMATIC_ENVIRONMENT_PRESETS against EnvironmentSpecSchema', () => {
    expect(CINEMATIC_ENVIRONMENT_PRESETS.length).toBeGreaterThanOrEqual(8);

    for (const preset of CINEMATIC_ENVIRONMENT_PRESETS) {
      expect(preset.spec.id).toBeDefined();
      expect(preset.spec.name).toBeDefined();
      expect(preset.spec.nameAr).toBeDefined();
      expect(preset.icon).toBeDefined();

      const parseResult = EnvironmentSpecSchema.safeParse(preset.spec);
      expect(parseResult.success, `Preset ${preset.spec.name} failed schema parse`).toBe(true);

      expect(GroundSurfaceTypeSchema.safeParse(preset.spec.groundSurface).success).toBe(true);
      expect(EnvironmentWeatherSchema.safeParse(preset.spec.weather).success).toBe(true);
      expect(EnvironmentTimeOfDaySchema.safeParse(preset.spec.timeOfDay).success).toBe(true);
    }
  });

  it('integrates default environment into canonical ShotSpec', () => {
    const shot = createDefaultShotSpec();
    expect(shot.environment).toBeDefined();
    expect(shot.environment.name).toBe('Soundstage Studio');
    expect(shot.environment.category).toBe('studio');

    const validated = ShotSpecSchema.safeParse(shot);
    expect(validated.success).toBe(true);
  });

  it('formats environment cues accurately for video prompt compilers', () => {
    const env = CINEMATIC_ENVIRONMENT_PRESETS[1].spec; // Cyberpunk Tokyo Alley
    const formatted = formatEnvironment(env);

    expect(formatted).toContain('narrow neo-Tokyo cyberpunk back-alley');
    expect(formatted).toContain('weather condition rain');
    expect(formatted).toContain('time of day neon night');
  });

  it('injects environment into LTX-2.5, MiniMax, and Seedance prompt compilers', () => {
    const shot = createDefaultShotSpec({
      environment: { ...CINEMATIC_ENVIRONMENT_PRESETS[1].spec },
    });

    const ltx = compileLtxPrompt(shot);
    expect(ltx.positivePrompt).toContain('Setting:');
    expect(ltx.positivePrompt).toContain('narrow neo-Tokyo cyberpunk back-alley');

    const minimax = compileMiniMaxPrompt(shot);
    expect(minimax.positivePrompt).toContain('[Scene Environment]:');
    expect(minimax.positivePrompt).toContain('narrow neo-Tokyo cyberpunk back-alley');

    const seedance = compileSeedancePrompt(shot);
    expect(seedance.positivePrompt).toContain('scene environment:');
    expect(seedance.positivePrompt).toContain('narrow neo-Tokyo cyberpunk back-alley');
  });

  it('constructs structured environment reasoning requests across Ollama, OpenAI, and Gemini', () => {
    const testPrompt = 'Abandoned underground reactor hall filled with toxic green mist and flooded walkways';

    // 1. Ollama
    const ollamaReq = buildOllamaRequest(
      cfg('ollama', { url: 'http://localhost:11434', model: 'qwen2.5:latest' }),
      testPrompt,
      ENVIRONMENT_REASONER_SYSTEM_PROMPT,
      ENVIRONMENT_JSON_SCHEMA,
      'Environment to design: '
    );
    expect(ollamaReq.url).toBe('http://localhost:11434/api/chat');
    expect((ollamaReq.body as any).format).toEqual(ENVIRONMENT_JSON_SCHEMA);
    expect((ollamaReq.body as any).messages[1].content).toContain('Environment to design: Abandoned underground reactor hall');

    // 2. OpenAI Compatible
    const openAiReq = buildOpenAiRequest(
      cfg('openai', { url: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o' }),
      testPrompt,
      'schema',
      ENVIRONMENT_REASONER_SYSTEM_PROMPT,
      ENVIRONMENT_JSON_SCHEMA,
      'Environment to design: '
    );
    expect(openAiReq.url).toBe('https://api.openai.com/v1/chat/completions');
    expect((openAiReq.body as any).response_format.type).toBe('json_schema');
    expect((openAiReq.body as any).messages[0].content).toContain('environment-reasoning stage');

    // 3. Google Gemini
    const geminiReq = buildGeminiRequest(
      cfg('gemini', { url: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'AIzaSy-test', model: 'gemini-2.0-flash' }),
      testPrompt,
      'schema',
      ENVIRONMENT_REASONER_SYSTEM_PROMPT,
      ENVIRONMENT_JSON_SCHEMA,
      'Environment to design: '
    );
    expect(geminiReq.url).toContain('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent');
    expect((geminiReq.body as any).generationConfig.responseMimeType).toBe('application/json');
    expect((geminiReq.body as any).generationConfig.responseJsonSchema).toEqual(ENVIRONMENT_JSON_SCHEMA);
  });
});
