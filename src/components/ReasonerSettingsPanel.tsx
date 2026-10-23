import React, { useMemo, useState } from 'react';
import {
  PROVIDERS,
  OPENAI_COMPATIBLE_PRESETS,
  ReasonerProvider,
  ReasonerSettings,
  ReasonerConfig,
  getReasonerSettings,
  saveReasonerSettings,
  listReasonerModels,
  reasonObject,
  ObjectReasonerError,
} from '../services/objectReasoner';
import { Cpu, Cloud, RefreshCw, PlugZap, FlaskConical, Save, Eye, EyeOff, Loader2, Lock } from 'lucide-react';

type Status = { tone: 'ok' | 'err' | 'info'; text: string } | null;

const ORDER: ReasonerProvider[] = ['ollama', 'llamacpp', 'openai', 'gemini'];

const toConfig = (s: ReasonerSettings): ReasonerConfig => {
  const p = s.providers[s.provider];
  return {
    provider: s.provider,
    info: PROVIDERS[s.provider],
    url: p.baseUrl.trim().replace(/\/+$/, ''),
    model: p.model.trim(),
    apiKey: p.apiKey.trim(),
  };
};

const errMsg = (e: unknown) => (e instanceof ObjectReasonerError ? e.message : (e as Error)?.message ?? String(e));

/**
 * Settings for the LLM that reasons prompts into 3D part graphs.
 * Everything is stored in this browser's localStorage (including API keys).
 */
export const ReasonerSettingsPanel: React.FC<{ onSaved?: () => void; onClose?: () => void }> = ({ onSaved, onClose }) => {
  const [draft, setDraft] = useState<ReasonerSettings>(() => getReasonerSettings());
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<'models' | 'test' | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [showKey, setShowKey] = useState(false);

  const active = draft.provider;
  const info = PROVIDERS[active];
  const p = draft.providers[active];
  const cfg = useMemo(() => toConfig(draft), [draft]);

  const patch = (fields: Partial<typeof p>) =>
    setDraft((d) => ({ ...d, providers: { ...d.providers, [d.provider]: { ...d.providers[d.provider], ...fields } } }));

  const selectProvider = (id: ReasonerProvider) => {
    setDraft((d) => ({ ...d, provider: id }));
    setModels([]);
    setStatus(null);
  };

  const refreshModels = async () => {
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
    saveReasonerSettings(draft);
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
                <span className="text-xs font-semibold">{pi.label}</span>
                <span className="text-[10px] text-slate-500">{pi.local ? 'local · open weights' : pi.needsKey ? 'API key' : 'local or hosted'}</span>
              </span>
            </button>
          );
        })}
        <div
          className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-3 py-2 text-slate-500 cursor-not-allowed"
          title="ChatGPT/Codex sign-in tokens are only usable through the Codex CLI; there is no supported browser API. Not available."
          id="reasoner-provider-codex"
        >
          <Lock className="h-4 w-4 shrink-0" />
          <span className="flex flex-col leading-tight">
            <span className="text-xs font-semibold">Codex sign-in</span>
            <span className="text-[10px]">unavailable</span>
          </span>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">{info.hint}</p>

      {active === 'openai' && (
        <div className="flex flex-wrap gap-1.5">
          {OPENAI_COMPATIBLE_PRESETS.map((pr) => (
            <button
              key={pr.label}
              type="button"
              onClick={() => patch({ baseUrl: pr.baseUrl })}
              className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
                p.baseUrl === pr.baseUrl ? 'border-amber-400 text-amber-200' : 'border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              {pr.label}
            </button>
          ))}
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
              placeholder={active === 'openai' ? 'e.g. meta-llama/llama-3.3-70b-instruct:free' : ''}
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
              API key {info.needsKey ? '' : '(optional)'}
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
