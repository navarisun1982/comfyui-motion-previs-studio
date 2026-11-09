import React, { useState, useEffect } from 'react';
import {
  AutoDetectedWorkflowResult,
  CustomWorkflowSlotOverrides,
  RenderEngineId,
  StoredCustomWorkflowConfig,
  WorkflowChoiceItem,
  addUploadedWorkflowToLibrary,
  addWorkflowUrlsToLibrary,
  autoDetectWorkflowBindings,
  ensureWorkflowSyncedToComfyUI,
  getActiveWorkflowForEngine,
  getWorkflowChoicesForEngine,
  getWorkflowSyncStatusFromServer,
  listLocalComfyWorkflows,
  loadStoredCustomWorkflowConfig,
  removeWorkflowFromLibrary,
  selectActiveWorkflowForEngine,
  syncActiveEngineWorkflowToRegistry,
  syncAllWorkflowsToComfyUI,
  updateSavedWorkflowOverrides,
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
  HelpCircle,
  FolderOpen,
  Plus,
  Trash2,
} from 'lucide-react';

interface CustomWorkflowConfigBarProps {
  compact?: boolean;
  engine?: RenderEngineId;
  onConfigChanged?: (
    config: StoredCustomWorkflowConfig,
    detected: AutoDetectedWorkflowResult | null
  ) => void;
  onWorkflowChanged?: (
    choice: WorkflowChoiceItem,
    detected: AutoDetectedWorkflowResult | null
  ) => void;
  children?: React.ReactNode;
}

export const CustomWorkflowConfigBar: React.FC<CustomWorkflowConfigBarProps> = ({
  compact = false,
  engine = 'minimax-h3',
  onConfigChanged,
  onWorkflowChanged,
  children,
}) => {
  const [choices, setChoices] = useState<WorkflowChoiceItem[]>(() =>
    getWorkflowChoicesForEngine(engine)
  );
  const [activeChoice, setActiveChoice] = useState<WorkflowChoiceItem>(() =>
    getActiveWorkflowForEngine(engine)
  );
  const [urlInput, setUrlInput] = useState<string>('');
  const [isLoadingUrl, setIsLoadingUrl] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [localSavedWorkflows, setLocalSavedWorkflows] = useState<string[]>([]);
  const [isScanningLocal, setIsScanningLocal] = useState<boolean>(false);
  const [isSyncingComfy, setIsSyncingComfy] = useState<boolean>(false);
  const [comfySyncBadge, setComfySyncBadge] = useState<string>('Synced to ComfyUI');
  const [detected, setDetected] = useState<AutoDetectedWorkflowResult | null>(() => {
    const initial = getActiveWorkflowForEngine(engine);
    if (initial.kind === 'custom' && initial.savedEntry?.rawJson) {
      try {
        return autoDetectWorkflowBindings(
          initial.savedEntry.rawJson,
          initial.savedEntry.overrides
        );
      } catch {
        return null;
      }
    }
    return null;
  });

  // Check ComfyUI workflow sync status on mount and auto-sync if any bundled workflows are missing
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getWorkflowSyncStatusFromServer();
        if (cancelled) return;
        if (status.ok && !status.allPresent) {
          setComfySyncBadge('Auto-Syncing...');
          const synced = await syncAllWorkflowsToComfyUI(false);
          if (!cancelled && synced.ok) {
            setComfySyncBadge(`✓ Synced (${synced.totalCount} workflows)`);
          }
        } else if (status.ok && status.allPresent) {
          setComfySyncBadge(`✓ Synced (${status.totalCount} workflows)`);
        }
      } catch {
        // ignore offline check
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh choices & active workflow whenever `engine` changes (`ltx-2.5` <-> `minimax-h3`)
  useEffect(() => {
    const nextChoices = getWorkflowChoicesForEngine(engine);
    const nextActive = getActiveWorkflowForEngine(engine);
    setChoices(nextChoices);
    setActiveChoice(nextActive);
    setLocalSavedWorkflows([]);
    setErrorText(null);
    setStatusText(null);

    let nextDetected: AutoDetectedWorkflowResult | null = null;
    if (nextActive.kind === 'custom' && nextActive.savedEntry?.rawJson) {
      try {
        nextDetected = autoDetectWorkflowBindings(
          nextActive.savedEntry.rawJson,
          nextActive.savedEntry.overrides
        );
      } catch {
        nextDetected = null;
      }
    }
    setDetected(nextDetected);
    syncActiveEngineWorkflowToRegistry(engine);
    void ensureWorkflowSyncedToComfyUI(nextActive);
    onWorkflowChanged?.(nextActive, nextDetected);
  }, [engine]);

  const refreshStateForSelection = (
    selected: WorkflowChoiceItem,
    customDetected?: AutoDetectedWorkflowResult | null
  ) => {
    const nextChoices = getWorkflowChoicesForEngine(engine);
    setChoices(nextChoices);
    setActiveChoice(selected);

    let nextDetected = customDetected ?? null;
    if (!nextDetected && selected.kind === 'custom' && selected.savedEntry?.rawJson) {
      try {
        nextDetected = autoDetectWorkflowBindings(
          selected.savedEntry.rawJson,
          selected.savedEntry.overrides
        );
      } catch {
        nextDetected = null;
      }
    }
    setDetected(nextDetected);
    syncActiveEngineWorkflowToRegistry(engine);
    onWorkflowChanged?.(selected, nextDetected);
    onConfigChanged?.(loadStoredCustomWorkflowConfig(), nextDetected);
  };

  const handleSelectWorkflow = async (workflowId: string) => {
    setErrorText(null);
    const selected = selectActiveWorkflowForEngine(engine, workflowId);
    refreshStateForSelection(selected);
    setStatusText(
      `Active ${engine === 'ltx-2.5' ? 'LTX-2.5' : 'MiniMax H3'} workflow set to: ${selected.shortLabel} (Syncing to ComfyUI...)`
    );
    const synced = await ensureWorkflowSyncedToComfyUI(selected);
    setStatusText(
      synced
        ? `Active ${engine === 'ltx-2.5' ? 'LTX-2.5' : 'MiniMax H3'} workflow set to: ${selected.shortLabel} ✓ Synced to ComfyUI`
        : `Active ${engine === 'ltx-2.5' ? 'LTX-2.5' : 'MiniMax H3'} workflow set to: ${selected.shortLabel}`
    );
  };

  const handleSyncAllToComfy = async () => {
    setIsSyncingComfy(true);
    setErrorText(null);
    setStatusText('Syncing all bundled & custom workflows to local ComfyUI (user/default/workflows)...');
    try {
      const res = await syncAllWorkflowsToComfyUI(true);
      if (res.ok) {
        setComfySyncBadge(`✓ Synced (${res.totalCount} workflows)`);
        setStatusText(
          `Successfully synced ${res.syncedCount}/${res.totalCount} workflows to ComfyUI${
            res.comfyWorkflowsDir ? ` (${res.comfyWorkflowsDir})` : ''
          }!`
        );
      } else {
        setErrorText(res.error || 'Could not sync workflows to ComfyUI.');
        setStatusText(null);
      }
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setStatusText(null);
    } finally {
      setIsSyncingComfy(false);
    }
  };

  const handleAddFromUrl = async (customTargetUrl?: string) => {
    const targetUrl = (customTargetUrl ?? urlInput).trim();
    if (!targetUrl) {
      setErrorText(
        'Please paste one or more workflow URLs (e.g. GitHub/HuggingFace .json link, http://127.0.0.1:8188/api/userdata/workflows%2Fmy_workflow.json, or local file path D:\\ComfyUI\\...\\workflow.json).'
      );
      return;
    }
    setIsLoadingUrl(true);
    setErrorText(null);
    setStatusText('Fetching workflow from URL & auto-detecting ComfyUI nodes...');
    try {
      let objInfo: Record<string, unknown> | null = null;
      try {
        objInfo = await defaultComfyClient.getObjectInfo();
      } catch {
        objInfo = null;
      }

      const { added, activeChoice: newlySelected } = await addWorkflowUrlsToLibrary(
        targetUrl,
        engine,
        objInfo
      );
      setUrlInput('');
      refreshStateForSelection(newlySelected);
      if (added.length > 1) {
        setStatusText(
          `Added ${added.length} workflows to ${
            engine === 'ltx-2.5' ? 'LTX-2.5' : 'MiniMax H3'
          } library and selected "${newlySelected.shortLabel}".`
        );
      } else {
        setStatusText(
          `Added "${newlySelected.shortLabel}" (${newlySelected.nodeCount || 0} nodes) to ${
            engine === 'ltx-2.5' ? 'LTX-2.5' : 'MiniMax H3'
          } workflow list and activated it!`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorText(msg);
      setStatusText(null);
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handleRemoveActiveCustomWorkflow = () => {
    if (activeChoice.kind !== 'custom') return;
    const removedLabel = activeChoice.shortLabel;
    const nextActive = removeWorkflowFromLibrary(activeChoice.id, engine);
    refreshStateForSelection(nextActive, null);
    setStatusText(`Removed "${removedLabel}" and switched back to "${nextActive.shortLabel}".`);
  };

  const handleScanLocalComfy = async () => {
    setIsScanningLocal(true);
    setErrorText(null);
    const engineLabel = engine === 'ltx-2.5' ? 'LTX-2.5' : 'MiniMax H3';
    setStatusText(`Scanning local ComfyUI (127.0.0.1:8188) for saved ${engineLabel} workflows...`);
    try {
      const list = await listLocalComfyWorkflows(engine);
      setLocalSavedWorkflows(list);
      if (list.length > 0) {
        setStatusText(
          `Found ${list.length} saved ${engineLabel} workflow(s) on your local ComfyUI server. Click any workflow below to add it to the dropdown.`
        );
      } else {
        setStatusText(null);
        setErrorText(
          `No saved ${engineLabel} workflows found in ComfyUI/user/default/workflows/ on 127.0.0.1:8188. Save your workflow inside ComfyUI (Ctrl+S), paste a workflow URL above, or click "Upload .JSON".`
        );
      }
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setStatusText(null);
    } finally {
      setIsScanningLocal(false);
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
      const { detected: det, activeChoice: newlySelected } = addUploadedWorkflowToLibrary(
        file.name,
        rawJson,
        engine,
        objInfo
      );
      refreshStateForSelection(newlySelected, det);
      setStatusText(
        `Added ${file.name} (${det.candidates.length} nodes, ${
          det.formatConvertedFrom === 'ui' ? 'auto-converted from UI format' : 'API format'
        }) to ${engine === 'ltx-2.5' ? 'LTX-2.5' : 'MiniMax H3'} workflow list!`
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
    if (activeChoice.kind !== 'custom' || !activeChoice.savedEntry) return;
    const nextOverrides: CustomWorkflowSlotOverrides = {
      ...(activeChoice.savedEntry.overrides || {}),
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
      const reDetected = updateSavedWorkflowOverrides(activeChoice.id, nextOverrides);
      const updatedActive = getActiveWorkflowForEngine(engine);
      refreshStateForSelection(updatedActive, reDetected);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResetOverrides = () => {
    if (activeChoice.kind !== 'custom') return;
    try {
      const reDetected = updateSavedWorkflowOverrides(activeChoice.id, {});
      const updatedActive = getActiveWorkflowForEngine(engine);
      refreshStateForSelection(updatedActive, reDetected);
      setStatusText('Reset to automatic node bindings.');
    } catch {
      // ignore
    }
  };

  const builtinChoices = choices.filter((c) => c.kind === 'builtin');
  const customChoices = choices.filter((c) => c.kind === 'custom');

  return (
    <div
      className={`rounded-2xl border ${
        activeChoice.kind === 'custom'
          ? 'border-cyan-500/40 bg-cyan-950/15'
          : 'border-indigo-500/25 bg-[#080c18]/90'
      } ${compact ? 'p-3.5' : 'p-4'} space-y-2.5 text-xs shadow-inner`}
    >
      {/* Row 1: Workflow Library Selector Dropdown (Built-in Curated + User URL Workflows) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-6 w-6 rounded-lg bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-300 shrink-0">
            <Globe className="h-3.5 w-3.5" />
          </div>
          <span className="font-bold text-xs text-white tracking-wide">
            {engine === 'ltx-2.5' ? 'LTX-2.5 Render Workflow' : 'MiniMax H3 Render Workflow'}
          </span>
          {activeChoice.kind === 'custom' && (
            <span className="rounded-md px-1.5 py-0.5 text-[9.5px] font-mono font-semibold border bg-cyan-500/20 border-cyan-400/40 text-cyan-200">
              🔗 URL Workflow
            </span>
          )}
        </div>

        <div className="flex flex-1 items-center gap-2 min-w-0">
          <select
            aria-label="Select Render Workflow"
            value={activeChoice.id}
            onChange={(e) => handleSelectWorkflow(e.target.value)}
            className="flex-1 min-w-0 rounded-xl bg-[#0d1222] border border-white/15 hover:border-cyan-400/60 px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-cyan-400 cursor-pointer shadow-inner"
          >
            <optgroup label={`📦 Curated Built-in ${engine === 'ltx-2.5' ? 'LTX-2.5' : 'MiniMax H3'} Workflows`}>
              {builtinChoices.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.label}
                </option>
              ))}
            </optgroup>
            {customChoices.length > 0 && (
              <optgroup label={`🔗 User-Added Workflow URLs (${customChoices.length})`}>
                {customChoices.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    🔗 {wf.label} — {wf.url}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          {activeChoice.kind === 'custom' && (
            <button
              type="button"
              onClick={handleRemoveActiveCustomWorkflow}
              title="Remove this custom URL workflow from the list"
              className="flex items-center gap-1 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 border border-rose-400/35 px-2.5 py-2 text-[10.5px] font-bold text-rose-200 cursor-pointer shrink-0"
            >
              <Trash2 className="h-3 w-3 text-rose-400" />
              <span>Remove</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Workflow Summary Strip */}
      <div className="flex flex-col gap-2 pt-0.5">
        <div className="text-[11px] text-slate-300 truncate">
          <span className="text-slate-400">Active Pipeline: </span>
          <strong className="text-white font-semibold">{activeChoice.shortLabel}</strong>
          <span className="text-slate-400"> • {activeChoice.description}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-400/35 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-300">
            <span>{comfySyncBadge}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/15 border border-indigo-400/30 px-2.5 py-1 text-[10.5px] font-semibold text-indigo-200">
            <span>› {builtinChoices.length} Built-in + {customChoices.length} Added via URL</span>
          </span>
        </div>
      </div>

      {/* Row 2: Add Workflow(s) by URL Input Bar (Always Accessible inside Render Panel) */}
      <div className="space-y-2 pt-1.5 border-t border-white/10">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddFromUrl();
              }
            }}
            placeholder="Paste Civitai / GitHub / ComfyUI workflow URL..."
            className="flex-1 rounded-xl bg-[#050811] border border-white/15 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 shadow-inner"
          />
          <button
            type="button"
            onClick={() => handleAddFromUrl()}
            disabled={isLoadingUrl}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 text-black font-bold px-3.5 py-2 text-xs shadow-[0_0_15px_rgba(34,211,238,0.25)] transition-all disabled:opacity-50 cursor-pointer shrink-0"
            title="Fetch workflow JSON from Civitai/GitHub/local URL, validate nodes, and add to the workflow selector list"
          >
            {isLoadingUrl ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            )}
            <span>{isLoadingUrl ? 'Adding...' : 'Add Workflow URL'}</span>
          </button>
          <button
            type="button"
            onClick={handleSyncAllToComfy}
            disabled={isSyncingComfy}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-400/35 px-3 py-2 text-xs font-semibold cursor-pointer shrink-0 transition-colors"
            title="Sync all bundled default & custom workflows to your local ComfyUI (D:\ComfyUI\user\default\workflows)"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-emerald-300 ${isSyncingComfy ? 'animate-spin' : ''}`} />
            <span>{isSyncingComfy ? 'Syncing...' : 'Sync Workflows'}</span>
          </button>
          <button
            type="button"
            onClick={handleScanLocalComfy}
            disabled={isScanningLocal}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/40 px-3 py-2 text-xs font-semibold cursor-pointer shrink-0 transition-colors"
            title="Scan saved workflows inside your local ComfyUI server (127.0.0.1:8188)"
          >
            <FolderOpen className={`h-3.5 w-3.5 text-purple-300 ${isScanningLocal ? 'animate-pulse' : ''}`} />
            <span>{isScanningLocal ? 'Scanning...' : 'Scan Local'}</span>
          </button>
          <label
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/15 px-3 py-2 text-xs font-semibold cursor-pointer shrink-0 transition-colors"
            title="Or upload a local ComfyUI .json workflow file to add to the workflow list"
          >
            <Upload className="h-3.5 w-3.5 text-slate-300" />
            <span>Upload .JSON</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleUploadFile}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowGuide((prev) => !prev)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 border border-cyan-400/35 px-2.5 py-2 text-xs font-semibold cursor-pointer shrink-0 transition-colors"
            title="Show / hide step-by-step Workflow URL Guide"
          >
            <HelpCircle className="h-3.5 w-3.5 text-cyan-300" />
            <span>Guide</span>
          </button>
        </div>

        {/* Saved Workflows Found on Local ComfyUI Server */}
        {localSavedWorkflows.length > 0 && (
          <div className="rounded-lg bg-indigo-950/30 border border-indigo-500/30 px-2.5 py-2 space-y-1.5">
            <div className="text-[10px] font-bold text-indigo-200">
              Saved Workflows on Local ComfyUI (127.0.0.1:8188) — click any workflow to add to dropdown:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {localSavedWorkflows.map((wfName) => (
                <button
                  key={wfName}
                  type="button"
                  onClick={() => handleAddFromUrl(wfName)}
                  className="rounded bg-indigo-500/20 hover:bg-cyan-500/30 border border-indigo-400/30 hover:border-cyan-400/50 px-2 py-0.5 text-[10px] text-indigo-100 hover:text-white cursor-pointer transition-colors"
                >
                  + 📄 {wfName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step-by-Step User Guide for Workflow URLs */}
        {showGuide && (
          <div className="rounded-lg bg-[#070b12]/90 border border-cyan-500/25 p-2.5 space-y-1.5 text-[10.5px] text-slate-300 leading-relaxed">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                How to Choose or Add Workflows by URL (MiniMax H3 &amp; LTX-2.5)
              </span>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close Workflow Guide"
                title="Close Guide"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-slate-300 hover:text-white hover:bg-rose-500/25 hover:border-rose-400/40 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[10px] text-slate-300">
              <li>
                <strong className="text-white">Pick from Built-in Curated Workflows:</strong>{' '}
                Use the dropdown above to switch between our pre-configured <strong className="text-indigo-300">MiniMax H3</strong> and <strong className="text-amber-300">LTX-2.5</strong> workflows at any time.
              </li>
              <li>
                <strong className="text-white">Add One or Multiple Workflows by URL:</strong>{' '}
                Paste any GitHub/HuggingFace <code className="text-cyan-300">.json</code> link, local ComfyUI URL (<code className="text-cyan-200">http://127.0.0.1:8188/api/userdata/workflows%2Fyour_workflow.json</code>), or local PC path (<code className="text-cyan-200">D:\ComfyUI\...\workflow.json</code>) — or multiple URLs separated by commas — and click <strong className="text-cyan-300">+ Add Workflow URL</strong>.
              </li>
              <li>
                <strong className="text-white">Scan Local ComfyUI (`127.0.0.1:8188`):</strong>{' '}
                Click <strong className="text-indigo-300">Scan Local ComfyUI</strong> to list all workflows saved in your local ComfyUI and add any of them with a single click.
              </li>
            </ol>
          </div>
        )}

        {/* Detected Nodes Badge + Interactive Inspector Toggle (for Custom URL Workflows) */}
        {activeChoice.kind === 'custom' && detected && (
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

            {detected.warnings.length > 0 && (
              <div className="text-[10px] text-amber-300 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span>{detected.warnings.join(' • ')}</span>
              </div>
            )}

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
            className={`rounded-lg px-2.5 py-1.5 text-[10px] flex items-start gap-1.5 ${
              errorText
                ? 'bg-rose-500/15 border border-rose-500/35 text-rose-200'
                : 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-200'
            }`}
          >
            {errorText ? (
              <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <span className="whitespace-pre-line">{errorText || statusText}</span>
          </div>
        )}

        {children}
      </div>
    </div>
  );
};
