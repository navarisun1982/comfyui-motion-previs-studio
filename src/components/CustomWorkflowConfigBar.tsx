import React, { useState, useEffect } from 'react';
import {
  AutoDetectedWorkflowResult,
  CustomWorkflowSlotOverrides,
  StoredCustomWorkflowConfig,
  autoDetectWorkflowBindings,
  fetchAndDetectWorkflowFromUrl,
  loadStoredCustomWorkflowConfig,
  saveStoredCustomWorkflowConfig,
  syncActiveMinimaxTemplateToRegistry,
} from '../pipeline/customWorkflowResolver';
import { defaultComfyClient } from '../services/comfyClient';
import {
  Globe,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sliders,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';

interface CustomWorkflowConfigBarProps {
  compact?: boolean;
  onConfigChanged?: (
    config: StoredCustomWorkflowConfig,
    detected: AutoDetectedWorkflowResult | null
  ) => void;
}

export const CustomWorkflowConfigBar: React.FC<CustomWorkflowConfigBarProps> = ({
  compact = false,
  onConfigChanged,
}) => {
  const [config, setConfig] = useState<StoredCustomWorkflowConfig>(() =>
    loadStoredCustomWorkflowConfig()
  );
  const [urlInput, setUrlInput] = useState<string>(() => loadStoredCustomWorkflowConfig().url || '');
  const [isLoadingUrl, setIsLoadingUrl] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState<boolean>(false);
  const [detected, setDetected] = useState<AutoDetectedWorkflowResult | null>(() => {
    const initial = loadStoredCustomWorkflowConfig();
    if (initial.rawJson) {
      try {
        return autoDetectWorkflowBindings(initial.rawJson, initial.overrides);
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    syncActiveMinimaxTemplateToRegistry(config);
  }, []);

  const applyAndPersist = (
    nextConfig: StoredCustomWorkflowConfig,
    nextDetected: AutoDetectedWorkflowResult | null
  ) => {
    setConfig(nextConfig);
    setDetected(nextDetected);
    saveStoredCustomWorkflowConfig(nextConfig);
    syncActiveMinimaxTemplateToRegistry(nextConfig);
    onConfigChanged?.(nextConfig, nextDetected);
  };

  const handleSwitchSource = (source: 'builtin' | 'custom') => {
    setErrorText(null);
    const nextConfig: StoredCustomWorkflowConfig = {
      ...config,
      activeSource: source,
    };
    applyAndPersist(nextConfig, detected);
  };

  const handleFetchFromUrl = async () => {
    if (!urlInput.trim()) {
      setErrorText('Please paste a GitHub, HuggingFace, or direct .json workflow URL.');
      return;
    }
    setIsLoadingUrl(true);
    setErrorText(null);
    setStatusText('Fetching workflow JSON & auto-detecting ComfyUI nodes...');
    try {
      let objInfo: Record<string, unknown> | null = null;
      try {
        objInfo = await defaultComfyClient.getObjectInfo();
      } catch {
        objInfo = null;
      }

      const { normalizedUrl, rawJson, result } = await fetchAndDetectWorkflowFromUrl(
        urlInput,
        {},
        objInfo
      );
      const label = normalizedUrl.split('/').pop() || 'custom_workflow.json';
      const nextConfig: StoredCustomWorkflowConfig = {
        activeSource: 'custom',
        url: urlInput.trim(),
        label,
        rawJson,
        overrides: {},
        updatedAt: new Date().toISOString(),
      };
      applyAndPersist(nextConfig, result);
      setStatusText(
        `Auto-detected ${result.candidates.length} nodes (${
          result.formatConvertedFrom === 'ui' ? 'auto-converted from UI format' : 'API format'
        }) from ${label}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorText(msg);
      setStatusText(null);
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorText(null);
    setStatusText(`Reading ${file.name} & auto-detecting nodes...`);
    try {
      const rawJson = await file.text();
      let objInfo: Record<string, unknown> | null = null;
      try {
        objInfo = await defaultComfyClient.getObjectInfo();
      } catch {
        objInfo = null;
      }
      const result = autoDetectWorkflowBindings(rawJson, {}, objInfo);
      const nextConfig: StoredCustomWorkflowConfig = {
        activeSource: 'custom',
        url: file.name,
        label: file.name,
        rawJson,
        overrides: {},
        updatedAt: new Date().toISOString(),
      };
      setUrlInput(file.name);
      applyAndPersist(nextConfig, result);
      setStatusText(
        `Loaded ${file.name}: ${result.candidates.length} nodes (${
          result.formatConvertedFrom === 'ui' ? 'auto-converted from UI format' : 'API format'
        })`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorText(`Failed to parse ${file.name}: ${msg}`);
      setStatusText(null);
    } finally {
      e.target.value = '';
    }
  };

  const handleOverrideSlotNode = (
    slotKey: keyof CustomWorkflowSlotOverrides,
    nodeId: string,
    defaultInputName: string
  ) => {
    if (!config.rawJson) return;
    const nextOverrides: CustomWorkflowSlotOverrides = {
      ...(config.overrides || {}),
    };
    if (slotKey === 'outputNode') {
      nextOverrides.outputNode = nodeId || undefined;
    } else if (!nodeId) {
      nextOverrides[slotKey] = null;
    } else {
      const cand = detected?.candidates.find((c) => c.id === nodeId);
      const chosenInput =
        cand && cand.inputs.includes(defaultInputName)
          ? defaultInputName
          : cand?.inputs[0] || defaultInputName;
      nextOverrides[slotKey] = { node: nodeId, input: chosenInput };
    }

    try {
      const reDetected = autoDetectWorkflowBindings(config.rawJson, nextOverrides);
      const nextConfig: StoredCustomWorkflowConfig = {
        ...config,
        overrides: nextOverrides,
        updatedAt: new Date().toISOString(),
      };
      applyAndPersist(nextConfig, reDetected);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResetOverrides = () => {
    if (!config.rawJson) return;
    try {
      const reDetected = autoDetectWorkflowBindings(config.rawJson, {});
      const nextConfig: StoredCustomWorkflowConfig = {
        ...config,
        overrides: {},
      };
      applyAndPersist(nextConfig, reDetected);
      setStatusText('Reset to automatic node bindings.');
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`rounded-xl border ${
        config.activeSource === 'custom'
          ? 'border-cyan-500/40 bg-cyan-950/15'
          : 'border-white/10 bg-black/40'
      } ${compact ? 'p-2.5' : 'p-3.5'} space-y-2.5 font-mono text-xs`}
    >
      {/* Top Row: Source Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <span className="font-bold text-[11px] text-white">ComfyUI Workflow Source:</span>
          {config.activeSource === 'custom' && detected ? (
            <span className="rounded bg-cyan-500/20 border border-cyan-400/40 px-1.5 py-0.5 text-[9.5px] text-cyan-200 font-semibold">
              Custom Active: {config.label || 'Custom JSON'} ({detected.candidates.length} nodes)
            </span>
          ) : (
            <span className="rounded bg-indigo-500/20 border border-indigo-400/30 px-1.5 py-0.5 text-[9.5px] text-indigo-200 font-semibold">
              Built-in Stubelius Ultimate H3 (15 Nodes)
            </span>
          )}
        </div>

        <div className="flex items-center rounded-lg bg-black/70 p-0.5 border border-white/15 text-[10px]">
          <button
            type="button"
            onClick={() => handleSwitchSource('builtin')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              config.activeSource === 'builtin'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Built-in Stubelius H3
          </button>
          <button
            type="button"
            onClick={() => handleSwitchSource('custom')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              config.activeSource === 'custom'
                ? 'bg-cyan-500 text-black font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🌐 Custom Workflow URL / .JSON
          </button>
        </div>
      </div>

      {/* Custom Workflow URL & File Loader */}
      {config.activeSource === 'custom' && (
        <div className="space-y-2 pt-1 border-t border-white/10">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste GitHub / HuggingFace / raw ComfyUI workflow .json URL..."
              className="flex-1 rounded-lg bg-black/70 border border-white/15 px-2.5 py-1.5 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="button"
              onClick={handleFetchFromUrl}
              disabled={isLoadingUrl}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-3 py-1.5 text-[10.5px] transition-all disabled:opacity-50 cursor-pointer shrink-0"
              title="Fetch workflow JSON from URL and auto-detect Video, Prompt, Reference Image, Seed & Output nodes"
            >
              <RefreshCw className={`h-3 w-3 ${isLoadingUrl ? 'animate-spin' : ''}`} />
              <span>{isLoadingUrl ? 'Detecting...' : 'Fetch & Auto-Detect'}</span>
            </button>
            <label
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 border border-white/15 px-2.5 py-1.5 text-[10.5px] font-semibold cursor-pointer shrink-0"
              title="Or upload a local ComfyUI .json workflow file (supports both UI format and API format)"
            >
              <Upload className="h-3 w-3 text-cyan-300" />
              <span>Upload .JSON</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleUploadFile}
                className="hidden"
              />
            </label>
          </div>

          {/* Detected Nodes Badge + Interactive Inspector Toggle */}
          {detected && (
            <div className="rounded-lg bg-black/50 border border-cyan-500/25 px-2.5 py-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                <div className="flex flex-wrap items-center gap-1.5 text-slate-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="font-bold text-emerald-300">Auto-Detected Nodes:</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    Video: <strong className="text-cyan-300">#{detected.detectedSlots.controlVideo?.node || 'None'}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    Prompt: <strong className="text-cyan-300">#{detected.detectedSlots.prompt?.node || 'None'}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    Pics 1–4:{' '}
                    <strong className="text-cyan-300">
                      {[
                        detected.detectedSlots.refImage1?.node,
                        detected.detectedSlots.refImage2?.node,
                        detected.detectedSlots.refImage3?.node,
                        detected.detectedSlots.refImage4?.node,
                      ]
                        .filter(Boolean)
                        .map((n) => `#${n}`)
                        .join(', ') || 'None'}
                    </strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    Seed: <strong className="text-cyan-300">#{detected.detectedSlots.seed?.node || 'None'}</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    Output: <strong className="text-emerald-300">#{detected.detectedSlots.outputNode}</strong>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowInspector((prev) => !prev)}
                  className="flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/25 cursor-pointer"
                >
                  <Sliders className="h-3 w-3" />
                  <span>{showInspector ? 'Hide Node Mapping' : 'Inspect / Override Mapping'}</span>
                  {showInspector ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>

              {/* Warnings if any slot couldn't be auto-detected */}
              {detected.warnings.length > 0 && (
                <div className="text-[10px] text-amber-300 flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{detected.warnings.join(' • ')}</span>
                </div>
              )}

              {/* Interactive Node Mapping Inspector */}
              {showInspector && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      Override any auto-detected node below if your custom workflow uses different nodes:
                    </span>
                    <button
                      type="button"
                      onClick={handleResetOverrides}
                      className="flex items-center gap-1 text-[10px] text-cyan-300 hover:text-white cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset to Auto-Detect</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                    {/* Previs Video Input */}
                    <div className="flex flex-col gap-0.5">
                      <label className="text-slate-400">Previs Video (&lt;Video 1&gt;)</label>
                      <select
                        value={detected.detectedSlots.controlVideo?.node || ''}
                        onChange={(e) => handleOverrideSlotNode('controlVideo', e.target.value, 'video')}
                        className="rounded bg-black/80 border border-white/15 px-1.5 py-1 text-slate-200"
                      >
                        <option value="">-- Unbound --</option>
                        {detected.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.id} • {c.title} ({c.classType})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Positive Prompt */}
                    <div className="flex flex-col gap-0.5">
                      <label className="text-slate-400">Positive Prompt Node</label>
                      <select
                        value={detected.detectedSlots.prompt?.node || ''}
                        onChange={(e) => handleOverrideSlotNode('prompt', e.target.value, 'value')}
                        className="rounded bg-black/80 border border-white/15 px-1.5 py-1 text-slate-200"
                      >
                        <option value="">-- Unbound --</option>
                        {detected.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.id} • {c.title} ({c.classType})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Seed Node */}
                    <div className="flex flex-col gap-0.5">
                      <label className="text-slate-400">Seed Node</label>
                      <select
                        value={detected.detectedSlots.seed?.node || ''}
                        onChange={(e) => handleOverrideSlotNode('seed', e.target.value, 'seed')}
                        className="rounded bg-black/80 border border-white/15 px-1.5 py-1 text-slate-200"
                      >
                        <option value="">-- Unbound --</option>
                        {detected.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.id} • {c.title} ({c.classType})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Output Video Node */}
                    <div className="flex flex-col gap-0.5">
                      <label className="text-slate-400">Video Output Node</label>
                      <select
                        value={detected.detectedSlots.outputNode || ''}
                        onChange={(e) => handleOverrideSlotNode('outputNode', e.target.value, 'filename_prefix')}
                        className="rounded bg-black/80 border border-white/15 px-1.5 py-1 text-slate-200"
                      >
                        {detected.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.id} • {c.title} ({c.classType})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Reference Images 1..4 */}
                    {(['refImage1', 'refImage2', 'refImage3', 'refImage4'] as const).map((slotKey, i) => (
                      <div key={slotKey} className="flex flex-col gap-0.5">
                        <label className="text-slate-400">Ref Image &lt;picture {i + 1}&gt;</label>
                        <select
                          value={detected.detectedSlots[slotKey]?.node || ''}
                          onChange={(e) => handleOverrideSlotNode(slotKey, e.target.value, 'image')}
                          className="rounded bg-black/80 border border-white/15 px-1.5 py-1 text-slate-200"
                        >
                          <option value="">-- Unbound --</option>
                          {detected.candidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              #{c.id} • {c.title} ({c.classType})
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status / Error Banner */}
          {(errorText || statusText) && (
            <div
              className={`rounded-lg px-2.5 py-1.5 text-[10px] flex items-center gap-1.5 ${
                errorText
                  ? 'bg-rose-500/15 border border-rose-500/35 text-rose-200'
                  : 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-200'
              }`}
            >
              {errorText ? (
                <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              )}
              <span>{errorText || statusText}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

