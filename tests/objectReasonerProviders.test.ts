import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildGeminiRequest,
  buildOllamaRequest,
  buildOpenAiRequest,
  extractResponseText,
  getReasonerConfig,
  getReasonerSettings,
  listReasonerModels,
  OLLAMA_MODEL_KEY,
  parseModelJson,
  PART_GRAPH_JSON_SCHEMA,
  PROVIDERS,
  reasonObject,
  ReasonerConfig,
  setReasonerConfig,
  ObjectReasonerError,
} from '../src/services/objectReasoner';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};

const cfg = (provider: keyof typeof PROVIDERS, over: Partial<ReasonerConfig> = {}): ReasonerConfig => ({
  provider,
  info: PROVIDERS[provider],
  url: 'http://host/v1',
  model: 'm',
  apiKey: '',
  ...over,
});

const chairGraph = {
  name: 'Chair',
  identity: 'Four legs, seat, backrest.',
  route: 'author',
  heightMeters: 0.9,
  walker: { coat: '#000000', belly: '#000000', female: false, morphology: {} },
  materials: [{ id: 'wood', color: '#8b5a2b', roughness: 0.7, metalness: 0 }],
  parts: [
    { id: 'seat', shape: 'box', size: [0.45, 0.04, 0.45], position: [0, 0.45, 0], rotation: [0, 0, 0], material: 'wood' },
    { id: 'leg', shape: 'box', size: [0.04, 0.43, 0.04], position: [0.2, 0.215, 0.2], rotation: [0, 0, 0], material: 'wood', mirrorX: true },
    { id: 'back', shape: 'box', size: [0.45, 0.45, 0.03], position: [0, 0.7, -0.21], rotation: [0, 0, 0], material: 'wood' },
  ],
};

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reasoner settings', () => {
  it('defaults to local Ollama and migrates the legacy model key', () => {
    expect(getReasonerConfig().provider).toBe('ollama');
    localStorage.setItem(OLLAMA_MODEL_KEY, 'gemma4:26b');
    expect(getReasonerSettings().providers.ollama.model).toBe('gemma4:26b');
  });

  it('keeps per-provider settings when switching providers', () => {
    setReasonerConfig({ provider: 'gemini', apiKey: 'k1', model: 'gemini-2.5-flash' });
    setReasonerConfig({ provider: 'llamacpp', url: 'http://127.0.0.1:9090/v1/' });
    const s = getReasonerSettings();
    expect(s.provider).toBe('llamacpp');
    expect(s.providers.gemini.apiKey).toBe('k1');
    expect(getReasonerConfig().url).toBe('http://127.0.0.1:9090/v1');
  });
});

describe('request builders', () => {
  it('Ollama uses /api/chat with the schema as format and thinking on', () => {
    const r = buildOllamaRequest(cfg('ollama', { url: 'http://127.0.0.1:11434' }), 'chair');
    expect(r.url).toBe('http://127.0.0.1:11434/api/chat');
    expect(r.body.format).toBe(PART_GRAPH_JSON_SCHEMA);
    expect(r.body.think).toBe(true);
  });

  it('OpenAI-compatible sends json_schema, bearer key, and relaxes by mode', () => {
    const r = buildOpenAiRequest(cfg('openai', { apiKey: 'sk' }), 'chair');
    expect(r.url).toBe('http://host/v1/chat/completions');
    expect(r.headers.Authorization).toBe('Bearer sk');
    expect((r.body.response_format as any).type).toBe('json_schema');
    expect((r.body.response_format as any).json_schema.schema).toBe(PART_GRAPH_JSON_SCHEMA);
    expect((buildOpenAiRequest(cfg('openai'), 'x', 'object').body.response_format as any).type).toBe('json_object');
    expect(buildOpenAiRequest(cfg('openai'), 'x', 'none').body.response_format).toBeUndefined();
  });

  it('llama.cpp omits the placeholder model name and auth header', () => {
    const r = buildOpenAiRequest(cfg('llamacpp', { model: 'local' }), 'chair');
    expect(r.body.model).toBeUndefined();
    expect(r.headers.Authorization).toBeUndefined();
  });

  it('Gemini uses generateContent with x-goog-api-key and responseJsonSchema', () => {
    const r = buildGeminiRequest(
      cfg('gemini', { url: 'https://generativelanguage.googleapis.com/v1beta', model: 'models/gemini-2.5-flash', apiKey: 'AIza' }),
      'chair'
    );
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(r.headers['x-goog-api-key']).toBe('AIza');
    const gc = r.body.generationConfig as any;
    expect(gc.responseMimeType).toBe('application/json');
    expect(gc.responseJsonSchema).toBe(PART_GRAPH_JSON_SCHEMA);
    expect((buildGeminiRequest(cfg('gemini', { apiKey: 'k' }), 'x', 'object').body.generationConfig as any).responseJsonSchema).toBeUndefined();
  });
});

describe('response parsing', () => {
  it('extracts text per protocol and skips Gemini thought parts', () => {
    expect(extractResponseText('ollama', { message: { content: '{"a":1}' } })).toBe('{"a":1}');
    expect(extractResponseText('openai', { choices: [{ message: { content: '{}' } }] })).toBe('{}');
    expect(
      extractResponseText('gemini', { candidates: [{ content: { parts: [{ text: 'plan', thought: true }, { text: '{"b":2}' }] } }] })
    ).toBe('{"b":2}');
  });

  it('flags truncated output instead of returning partial JSON', () => {
    expect(() => extractResponseText('openai', { choices: [{ finish_reason: 'length', message: { content: '{' } }] })).toThrow(
      ObjectReasonerError
    );
    expect(() => extractResponseText('gemini', { candidates: [{ finishReason: 'MAX_TOKENS' }] })).toThrow(/output tokens/);
  });

  it('tolerates think blocks and code fences', () => {
    expect(parseModelJson('<think>hmm {no}</think>\n```json\n{"x":1}\n```')).toEqual({ x: 1 });
    expect(() => parseModelJson('not json')).toThrow(/malformed/);
  });
});

describe('reasonObject transport', () => {
  it('retries with relaxed JSON mode when a server rejects the schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'response_format json_schema not supported' } }), { status: 400 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(chairGraph) } }] }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);
    const g = await reasonObject('chair', { config: cfg('openai', { model: 'x' }) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format.type).toBe('json_object');
    expect(g.parts.length).toBe(3);
    expect(g.source?.model).toContain('OpenAI-compatible');
  });

  it('reports auth and rate-limit failures honestly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 403 })));
    await expect(reasonObject('chair', { config: cfg('gemini', { apiKey: 'bad' }) })).rejects.toMatchObject({ kind: 'auth' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 })));
    await expect(reasonObject('chair', { config: cfg('gemini', { apiKey: 'k' }) })).rejects.toThrow(/rate limit/);
  });

  it('refuses to call Gemini without a key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(reasonObject('chair', { config: cfg('gemini', { apiKey: '' }) })).rejects.toMatchObject({ kind: 'config' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists only text-generation Gemini models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
              { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
            ],
          }),
          { status: 200 }
        )
      )
    );
    expect(await listReasonerModels(cfg('gemini', { apiKey: 'k' }))).toEqual(['gemini-2.5-flash']);
  });
});
