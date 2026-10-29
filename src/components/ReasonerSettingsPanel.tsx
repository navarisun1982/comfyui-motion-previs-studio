import React, { useMemo, useState, useEffect } from 'react';
import {
  PROVIDERS,
  OPENAI_COMPATIBLE_PRESETS,
  OPENAI_MODEL_PRESETS,
  GEMINI_MODEL_PRESETS,
  ReasonerProvider,
  ReasonerSettings,
  ReasonerConfig,
  getReasonerSettings,
  saveReasonerSettings,
  listReasonerModels,
  reasonObject,
  ObjectReasonerError,
} from '../services/objectReasoner';
import {
  OpenAiAuthStatus,
  subscribeOpenAiAuth,
  fetchOpenAiAuthStatus,
  startOpenAiBrowserLogin,
  logoutOpenAi,
  pollUntilLoggedIn,
} from '../services/openaiAuth';
import {
  Cpu,
  Cloud,
  RefreshCw,
  PlugZap,
  FlaskConical,
  Save,
  Eye,
  EyeOff,
  Loader2,
  Info,
  CheckCircle2,
  LogIn,
  LogOut,
  Sparkles,
  SlidersHorizontal,
  ShieldCheck,
  User,
} from 'lucide-react';

type Status = { tone: 'ok' | 'err' | 'info'; text: string } | null;

const ORDER: ReasonerProvider[] = ['ollama', 'llamacpp', 'openai', 'gemini'];

const toConfig = (
  s: ReasonerSettings,
  auth?: OpenAiAuthStatus | null,
  _useAdvanced = false,
  openAiMode: 'apikey' | 'browser' = 'browser'
): ReasonerConfig => {
  const provider = s.provider && s.provider in PROVIDERS ? s.provider : 'ollama';
  const p = s.providers?.[provider] || { baseUrl: '', model: '', apiKey: '' };
  let url = (p.baseUrl || '').trim().replace(/\/+$/, '');
  let model = (p.model || '').trim();
  if (provider === 'openai') {
    if (openAiMode === 'browser' && auth?.authenticated) {
      url = '/api/openai';
      if (!model) model = auth.activeModel || 'gpt-5.6-sol';
    } else if (openAiMode === 'browser') {
      url = '/api/openai';
      if (!model) model = auth?.activeModel || 'gpt-5.6-sol';
    } else if (p.apiKey) {
      // In web app, route through proxy to prevent browser CORS block
      url = !url || url === 'https://api.openai.com/v1' ? '/api/openai-proxy' : url;
      if (!model) model = p.model || 'gpt-4o';
    } else {
      url = !url || url === 'https://api.openai.com/v1' ? '/api/openai-proxy' : url;
      if (!model) model = p.model || 'gpt-4o';
    }
  }
  return {
    provider,
    info: PROVIDERS[provider] || PROVIDERS.ollama,
    url,
    model,
    apiKey: (p.apiKey || '').trim(),
  };
};

const errMsg = (e: unknown) => (e instanceof ObjectReasonerError ? e.message : (e as Error)?.message ?? String(e));

/**
 * Settings for the LLM that reasons prompts into 3D part graphs.
 * Supports direct OpenAI / ChatGPT browser authentication (no manual API key needed),
 * as well as Ollama, llama.cpp, Gemini, and custom OpenAI-compatible endpoints.
 */
export const ReasonerSettingsPanel: React.FC<{ onSaved?: () => void; onClose?: () => void }> = ({ onSaved, onClose }) => {
  const [draft, setDraft] = useState<ReasonerSettings>(() => getReasonerSettings());
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<'models' | 'test' | 'login' | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [showKey, setShowKey] = useState(false);
  const [showAdvancedOpenAi, setShowAdvancedOpenAi] = useState(false);
  const [openAiAuth, setOpenAiAuth] = useState<OpenAiAuthStatus | null>(null);
  const [openAiMode, setOpenAiMode] = useState<'apikey' | 'browser'>('browser');

  useEffect(() => {
    const unsub = subscribeOpenAiAuth((newStatus) => {
      setOpenAiAuth(newStatus);
      if (newStatus?.authenticated) {
        setOpenAiMode('browser');
      }
    });
    fetchOpenAiAuthStatus();
    return unsub;
  }, []);

  const active = draft.provider;
  const info = PROVIDERS[active];
  const p = draft.providers[active];
  const cfg = useMemo(
    () => toConfig(draft, openAiAuth, showAdvancedOpenAi, openAiMode),
    [draft, openAiAuth, showAdvancedOpenAi, openAiMode]
  );

  const patch = (fields: Partial<typeof p>) =>
    setDraft((d) => ({ ...d, providers: { ...d.providers, [d.provider]: { ...d.providers[d.provider], ...fields } } }));

  const selectProvider = (id: ReasonerProvider) => {
    setDraft((d) => {
      const next = { ...d, provider: id };
      if (id === 'openai') {
        const curOpenAi = next.providers.openai || {};
        next.providers.openai = {
          ...curOpenAi,
          baseUrl: '/api/openai',
          model: curOpenAi.model || openAiAuth?.activeModel || 'gpt-5.6-sol',
        };
      }
      return next;
    });
    setModels([]);
    setStatus(null);
  };

  const handleOpenAiBrowserLogin = async () => {
    setBusy('login');
    setStatus({ tone: 'info', text: 'Opening OpenAI authorization window in your browser...' });
    const authWindow = window.open('about:blank', '_blank');
    try {
      const { authorizeUrl } = await startOpenAiBrowserLogin();
      if (authWindow && !authWindow.closed) {
        authWindow.location.href = authorizeUrl;
      } else {
        window.open(authorizeUrl, '_blank');
      }
      setStatus({ tone: 'info', text: 'Browser sign-in launched! Approve the sign-in in your browser window...' });
      const auth = await pollUntilLoggedIn(120_000);
      setOpenAiMode('browser');
      patch({ baseUrl: '/api/openai', model: auth.activeModel || 'gpt-5.6-sol' });
      setStatus({
        tone: 'ok',
        text: `Connected as ${auth.name || auth.email} (${auth.plan || 'Plus/Pro'}). Ready to direct!`,
      });
    } catch (err: any) {
      if (authWindow && !authWindow.closed) {
        try { authWindow.close(); } catch {}
      }
      const msg = err.message === 'Failed to fetch'
        ? 'Could not connect to local server proxy. Please ensure the dev server is running on http://127.0.0.1:5173.'
        : (err.message || 'Browser sign-in failed');
      setStatus({ tone: 'err', text: msg });
    } finally {
      setBusy(null);
    }
  };

  const handleOpenAiLogout = async () => {
    await logoutOpenAi();
    patch({ baseUrl: OPENAI_COMPATIBLE_PRESETS[1].baseUrl, model: 'gpt-4o' });
    setStatus({ tone: 'info', text: 'Signed out of OpenAI.' });
  };

  const refreshModels = async () => {
    if (active === 'openai' && !openAiAuth?.authenticated && !showAdvancedOpenAi) {
      setStatus({
        tone: 'info',
        text: 'Please click "Sign in with OpenAI (Browser)" above to connect your account.',
      });
      return;
    }
    setBusy('models');
    setStatus(null);
    try {
      const list = await listReasonerModels(cfg);
      setModels(list);
      const hasCurrent = !cfg.model || list.includes(cfg.model) || active === 'llamacpp';
      setStatus({
        tone: list.length ? 'ok' : 'info',
        text: list.length
          ? `Connected to ${info.label}: ${list.length} model${list.length === 1 ? '' : 's'} available.${hasCurrent ? '' : ` "${cfg.model}" is not among them.`}`
          : `Connected to ${info.label}, but it reported no models.`,
      });
    } catch (e) {
      setModels([]);
      setStatus({ tone: 'err', text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const testGeneration = async () => {
    if (active === 'openai' && !openAiAuth?.authenticated && !showAdvancedOpenAi) {
      setStatus({
        tone: 'err',
        text: 'Not signed in to OpenAI. Please click "Sign in with OpenAI (Browser)" above first.',
      });
      return;
    }
    setBusy('test');
    setStatus({ tone: 'info', text: `Asking ${info.label} to reason "wooden chair" into a part graph...` });
    try {
      const g = await reasonObject('wooden chair', { config: cfg, timeoutMs: 240_000 });
      setStatus({
        tone: 'ok',
        text: `Real test passed: "${g.name}" · route ${g.route} · ${g.parts.length} parts · ${((g.source?.ms ?? 0) / 1000).toFixed(1)} s.`,
      });
    } catch (e) {
      setStatus({ tone: 'err', text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const save = () => {
    const toSave = { ...draft };
    if (toSave.provider === 'openai') {
      if (openAiMode === 'browser' || openAiAuth?.authenticated || !toSave.providers.openai?.apiKey) {
        toSave.providers.openai = {
          ...toSave.providers.openai,
          baseUrl: '/api/openai',
          model: toSave.providers.openai?.model || openAiAuth?.activeModel || 'gpt-5.6-sol',
          apiKey: '',
        };
      } else if (toSave.providers.openai?.apiKey) {
        toSave.providers.openai = {
          ...toSave.providers.openai,
          baseUrl: toSave.providers.openai?.baseUrl || 'https://api.openai.com/v1',
          model: toSave.providers.openai?.model || 'gpt-4o',
        };
      }
    }
    saveReasonerSettings(toSave);
    setStatus({ tone: 'ok', text: `Saved. New generations use ${info.label}.` });
    onSaved?.();
  };

  const inputCls =
    'w-full rounded-lg bg-black/50 border border-white/15 px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all';

  return (
    <div
      className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3 animate-in fade-in duration-200"
      id="reasoner-settings-panel"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-200 tracking-wide">Object reasoner · LLM provider</span>
        {onClose && (
          <button type="button" onClick={onClose} className="text-[11px] text-slate-400 hover:text-white" id="reasoner-settings-close">
            Close
          </button>
        )}
      </div>

      {/* Provider selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ORDER.map((id) => {
          const pi = PROVIDERS[id];
          const on = id === active;
          return (
            <button
              key={id}
              type="button"
              id={`reasoner-provider-${id}`}
              onClick={() => selectProvider(id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                on
                  ? 'border-amber-400 bg-amber-500/15 text-amber-200 shadow-md shadow-amber-500/10'
                  : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.06]'
              }`}
            >
              {pi.local ? <Cpu className="h-4 w-4 shrink-0" /> : <Cloud className="h-4 w-4 shrink-0" />}
              <span className="flex flex-col leading-tight">
                <span className="text-xs font-semibold">{id === 'openai' ? 'OpenAI / ChatGPT' : pi.label}</span>
                <span className="text-[10px] text-slate-500">
                  {id === 'openai'
                    ? openAiAuth?.authenticated
                      ? '✓ Browser Signed In'
                      : 'Browser Sign-in'
                    : pi.local
                      ? 'local · open weights'
                      : pi.needsKey
                        ? 'API key'
                        : 'local or hosted'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400">{info.hint}</p>

      {/* OpenAI Configuration Section */}
      {active === 'openai' && (
        <div className="space-y-3">
          {openAiAuth?.authenticated ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 space-y-3 shadow-lg shadow-emerald-950/20">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex items-center justify-center h-8 w-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                    <User className="h-4 w-4" />
                    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{openAiAuth.name || 'ChatGPT Subscriber'}</span>
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300 uppercase tracking-wider">
                        {openAiAuth.plan || 'Plus / Pro'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">{openAiAuth.email}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenAiLogout}
                    className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300 hover:text-rose-300 hover:border-rose-500/30 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <LogOut className="h-3 w-3" /> Sign Out
                  </button>
                </div>
              </div>

              {/* Models selection pills */}
              <div className="space-y-1.5 pt-1 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-400" /> ChatGPT Reasoning Models:
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Via browser subscription</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(openAiAuth.availableModels || []).map((m) => {
                    const isSelected = p.model === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => patch({ model: m.id, baseUrl: '/api/openai' })}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold shadow-sm shadow-emerald-500/20'
                            : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/30 hover:text-white'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] text-emerald-300/80">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>Connected via browser session. Prompts and scene recipes route directly through your personal ChatGPT plan.</span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4 space-y-3 shadow-lg shadow-blue-950/20">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-blue-400" /> Sign In with OpenAI (Browser)
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Sign in with your ChatGPT account in your browser to unlock frontier reasoning models (GPT-5.6 Sol, GPT-6.1 Sol). No OpenAI API key required.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  id="openai-browser-login-btn"
                  onClick={handleOpenAiBrowserLogin}
                  disabled={busy === 'login'}
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-600/30 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {busy === 'login' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  Sign in with OpenAI (Browser)
                </button>
                <span className="text-[10px] text-slate-400">Opens authorization window in your browser</span>
              </div>
            </div>
          )}

          {/* Collapsed Advanced Option (Custom endpoint / API key for external power users only) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvancedOpenAi((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>{showAdvancedOpenAi ? 'Hide Advanced Options' : 'Advanced: Custom Endpoint or API Key (Optional)'}</span>
            </button>

            {showAdvancedOpenAi && (
              <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-3.5 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                    <span>Custom API Key (Optional)</span>
                    <span className="text-[10px] text-slate-400 font-mono">sk-...</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={p.apiKey || ''}
                      onChange={(e) => {
                        setOpenAiMode(e.target.value ? 'apikey' : 'browser');
                        patch({ apiKey: e.target.value });
                      }}
                      placeholder="sk-proj-... (leave blank for browser sign-in)"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Leave blank to use browser sign-in. Only fill if connecting a custom corporate proxy or third-party provider.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-200">Custom Base URL</label>
                  <input
                    type="text"
                    value={p.baseUrl || ''}
                    onChange={(e) => patch({ baseUrl: e.target.value })}
                    placeholder="/api/openai or https://api.openai.com/v1"
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(active === 'ollama' || active === 'llamacpp') && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200" id="reasoner-vision-note">
          <Info className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            <strong className="font-semibold text-amber-300">Vision model recommended:</strong> Please use a model with vision support (e.g. <span className="font-mono text-white">Gemma 4</span> or <span className="font-mono text-white">Qwen 3.8 / Qwen2.5-VL</span> with <span className="font-mono text-white">--mmproj</span>) for visual scene understanding and image references.
          </span>
        </div>
      )}

      {active === 'gemini' && (
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Quick Model Presets (Google AI Studio Free Tier):</span>
          <div className="flex flex-wrap gap-1.5">
            {GEMINI_MODEL_PRESETS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => patch({ model: m.id })}
                className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
                  p.model === m.id
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
                    : 'border-white/10 text-slate-300 hover:text-white hover:border-white/30'
                }`}
                title={m.desc}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual Input Fields (Always visible for Ollama, llama.cpp, Gemini, and collapsible for OpenAI) */}
      {(active !== 'openai' || showAdvancedOpenAi) && (
        <div className="space-y-3 pt-1 border-t border-white/10">
          {active === 'openai' && (
            <div className="space-y-2">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Endpoint Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {OPENAI_COMPATIBLE_PRESETS.map((pr) => (
                    <button
                      key={pr.label}
                      type="button"
                      onClick={() => patch({ baseUrl: pr.baseUrl })}
                      className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
                        p.baseUrl === pr.baseUrl ? 'border-amber-400 bg-amber-500/15 text-amber-200 font-bold' : 'border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {pr.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Model Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {OPENAI_MODEL_PRESETS.map((om) => (
                    <button
                      key={om.id}
                      type="button"
                      onClick={() => patch({ model: om.id })}
                      className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
                        p.model === om.id ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 font-bold' : 'border-white/10 text-slate-300 hover:text-white'
                      }`}
                    >
                      {om.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Base URL</span>
              <input id="reasoner-base-url" className={inputCls} value={p.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} />
            </label>

            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                Model {active === 'llamacpp' && '(optional — llama-server uses the GGUF it was started with)'}
              </span>
              <div className="flex gap-2">
                <input
                  id="reasoner-model"
                  className={inputCls}
                  list="reasoner-model-options"
                  value={p.model}
                  placeholder={active === 'openai' ? 'e.g. gpt-5.6-sol or meta-llama/llama-3.3-70b-instruct:free' : ''}
                  onChange={(e) => patch({ model: e.target.value })}
                />
                <datalist id="reasoner-model-options">
                  {models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <button
                  type="button"
                  id="reasoner-refresh-models"
                  onClick={refreshModels}
                  disabled={busy !== null}
                  title="Check connection and list models"
                  className="shrink-0 rounded-lg border border-white/15 px-2.5 text-slate-300 hover:text-white hover:border-white/30 disabled:opacity-50"
                >
                  {busy === 'models' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {(info.needsKey || active === 'openai' || active === 'llamacpp') && (
              <label className="space-y-1 md:col-span-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  API key {info.needsKey ? '' : '(optional for local or browser session)'}
                  {active === 'gemini' && (
                    <>
                      {' · '}
                      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-amber-300 hover:underline normal-case">
                        get a free key
                      </a>
                    </>
                  )}
                </span>
                <div className="flex gap-2">
                  <input
                    id="reasoner-api-key"
                    className={inputCls}
                    type={showKey ? 'text' : 'password'}
                    autoComplete="off"
                    value={p.apiKey}
                    onChange={(e) => patch({ apiKey: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="shrink-0 rounded-lg border border-white/15 px-2.5 text-slate-400 hover:text-white"
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-500">Stored only in this browser's localStorage, sent only to {p.baseUrl || 'the provider'}.</span>
              </label>
            )}
          </div>
        </div>
      )}

      {models.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
          {models.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => patch({ model: m })}
              className={`rounded-md border px-2 py-0.5 text-[10px] font-mono transition-colors ${
                m === p.model ? 'border-amber-400 bg-amber-500/10 text-amber-200' : 'border-white/10 text-slate-400 hover:text-white hover:border-white/25'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {status && (
        <div
          id="reasoner-settings-status"
          className={`rounded-lg border px-3 py-2 text-[11px] font-mono ${
            status.tone === 'ok'
              ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
              : status.tone === 'err'
                ? 'border-rose-500/40 bg-rose-950/60 text-rose-200'
                : 'border-sky-500/30 bg-sky-950/40 text-sky-200'
          }`}
        >
          {status.text}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          id="reasoner-check-connection"
          onClick={refreshModels}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:border-white/30 disabled:opacity-50"
        >
          <PlugZap className="h-3.5 w-3.5" /> Check connection
        </button>
        <button
          type="button"
          id="reasoner-test-generation"
          onClick={testGeneration}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
        >
          {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Test reasoning
        </button>
        <button
          type="button"
          id="reasoner-save"
          onClick={save}
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-bold text-black hover:from-amber-400 hover:to-amber-500 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" /> Save
        </button>
      </div>
    </div>
  );
};
