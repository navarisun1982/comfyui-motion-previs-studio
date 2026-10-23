import React, { useState, useEffect } from 'react';
import { useComfyStore } from '../stores/useComfyStore';
import { defaultComfyClient } from '../services/comfyClient';
import { logger } from '../stores/useLogStore';
import {
  Server,
  Cpu,
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  HardDrive,
  ShieldCheck,
  Brain,
  Settings,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';
import { ReasonerSettingsPanel } from './ReasonerSettingsPanel';
import { describeReasoner } from '../services/objectReasoner';

export const ComfyConnectionModal: React.FC = () => {
  const {
    serverUrl,
    setServerUrl,
    connectionStatus,
    setConnectionStatus,
    systemStats,
    setSystemStats,
    latencyMs,
    setLatencyMs,
    detectedModels,
    setDetectedModels,
    isSettingsOpen,
    closeSettings,
    settingsTab,
    setSettingsTab,
  } = useComfyStore();

  const [inputUrl, setInputUrl] = useState<string>(serverUrl);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [, bumpReasonerLabel] = useState(0);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    ok: boolean;
    latencyMs?: number;
    error?: string;
  }>({ tested: false, ok: false });
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(false);
  const [copiedCommand, setCopiedCommand] = useState<boolean>(false);

  const handleCopyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  useEffect(() => {
    setInputUrl(serverUrl);
  }, [serverUrl]);

  if (!isSettingsOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult({ tested: false, ok: false });
    logger.api(`Testing connection to ComfyUI at: ${inputUrl}`);

    const res = await defaultComfyClient.ping(inputUrl);
    setIsTesting(false);

    if (res.ok) {
      setTestResult({ tested: true, ok: true, latencyMs: res.latencyMs });
      setLatencyMs(res.latencyMs);
      if (res.stats) {
        setSystemStats(res.stats);
      }
      logger.system(`Ping successful (${res.latencyMs}ms) to ${inputUrl}`, res.stats);

      // Detect models
      const models = await defaultComfyClient.detectModels(inputUrl);
      setDetectedModels({
        ltx: models.ltxDetected,
        minimax: models.minimaxDetected,
        wan: models.wanDetected,
        customNodes: models.customNodes,
      });
    } else {
      setTestResult({ tested: true, ok: false, error: res.error, latencyMs: res.latencyMs });
      logger.error(`Ping failed to ${inputUrl}: ${res.error}`);
    }
  };

  const handleSaveAndConnect = async () => {
    setServerUrl(inputUrl);
    defaultComfyClient.updateServerUrl(inputUrl);
    setConnectionStatus('connecting');

    const res = await defaultComfyClient.ping(inputUrl);
    if (res.ok) {
      setConnectionStatus('connected');
      if (res.stats) setSystemStats(res.stats);
      setLatencyMs(res.latencyMs);
      const models = await defaultComfyClient.detectModels(inputUrl);
      setDetectedModels({
        ltx: models.ltxDetected,
        minimax: models.minimaxDetected,
        wan: models.wanDetected,
        customNodes: models.customNodes,
      });
      logger.system(`Connected to ComfyUI at: ${inputUrl}`);
      closeSettings();
    } else {
      setConnectionStatus('error');
      logger.error(`Failed to connect to ComfyUI at: ${inputUrl}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative flex w-full max-w-3xl flex-col rounded-2xl border border-director-border bg-director-darkest/95 shadow-2xl glass-card overflow-hidden" id="studio-settings-modal">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-director-border px-6 py-4 bg-director-panel/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-director-gold/20 text-director-gold border border-director-gold/30">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                Studio Settings
              </h2>
              <p className="font-mono text-xs text-slate-400">Video backend (ComfyUI) and the LLM that reasons 3D objects</p>
            </div>
          </div>
          <button
            onClick={closeSettings}
            id="studio-settings-close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-director-surface hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-director-border px-4 pt-2 bg-director-panel/30">
          {(
            [
              { id: 'comfy', label: 'ComfyUI Connection', sub: connectionStatus, icon: Server },
              { id: 'llm', label: 'LLM Reasoner', sub: describeReasoner(), icon: Brain },
            ] as const
          ).map((t) => {
            const on = settingsTab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                id={`studio-settings-tab-${t.id}`}
                onClick={() => setSettingsTab(t.id)}
                className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2 text-left transition-all ${
                  on ? 'border-director-gold text-white bg-director-gold/10' : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`h-4 w-4 ${on ? 'text-director-gold' : ''}`} />
                <span className="flex flex-col leading-tight">
                  <span className="font-display text-xs font-bold">{t.label}</span>
                  <span className="font-mono text-[10px] text-slate-500">{t.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {settingsTab === 'llm' ? (
          <div className="p-6 overflow-y-auto max-h-[75vh]">
            <ReasonerSettingsPanel onSaved={() => bumpReasonerLabel((n) => n + 1)} />
          </div>
        ) : (
        <>
        {/* Modal Body */}
        <div className="flex flex-col gap-5 p-6 overflow-y-auto max-h-[75vh]">
          {/* Server Host & Port */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                ComfyUI Server Endpoint (REST & WebSocket)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSetupGuide(!showSetupGuide)}
                  className="flex items-center gap-1 text-[11px] font-mono text-director-gold hover:text-white transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span>{showSetupGuide ? 'Hide Setup Guide' : 'How to Connect & Enable CORS'}</span>
                </button>
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <button
                    type="button"
                    onClick={() => setInputUrl('http://127.0.0.1:8188')}
                    className="rounded px-2 py-0.5 bg-director-surface border border-director-border text-slate-300 hover:text-white"
                  >
                    Localhost (8188)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputUrl('http://localhost:8188')}
                    className="rounded px-2 py-0.5 bg-director-surface border border-director-border text-slate-300 hover:text-white"
                  >
                    localhost
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="http://127.0.0.1:8188"
                  className="w-full rounded-xl border border-director-border bg-director-darkest px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:border-director-gold focus:outline-none focus:ring-1 focus:ring-director-gold"
                />
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="flex items-center gap-2 rounded-xl bg-director-surface border border-director-border px-4 py-2 font-display text-xs font-semibold text-slate-200 hover:bg-director-panel hover:text-white transition-all disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isTesting ? 'animate-spin text-director-gold' : ''}`} />
                Test Connection
              </button>
            </div>

            {/* Test Result Banner */}
            {testResult.tested && (
              <div
                className={`flex items-center justify-between rounded-xl p-3 border text-xs font-mono transition-all ${
                  testResult.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  )}
                  <span>
                    {testResult.ok
                      ? `Connected successfully (${testResult.latencyMs}ms latency)`
                      : `Connection failed: ${testResult.error || 'Server unreachable'}`}
                  </span>
                </div>
                {testResult.ok && systemStats && (
                  <span className="text-[10px] text-emerald-400/80">
                    ComfyUI {systemStats.comfyVersion} · {systemStats.os}
                  </span>
                )}
              </div>
            )}

            {/* Inline Hint if failed and guide not yet open */}
            {testResult.tested && !testResult.ok && !showSetupGuide && (
              <div className="flex items-center justify-between rounded-xl p-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                <span>Getting <b>403 Forbidden</b>? ComfyUI requires the <code className="bg-black/50 px-1 py-0.5 rounded text-amber-200">--enable-cors-header</code> launch flag.</span>
                <button
                  type="button"
                  onClick={() => setShowSetupGuide(true)}
                  className="rounded px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold ml-2 underline text-[11px] shrink-0"
                >
                  View Setup Steps
                </button>
              </div>
            )}

            {/* Interactive CORS & Setup Guide Card */}
            {showSetupGuide && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 flex flex-col gap-3 font-mono text-xs text-slate-300 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                  <div className="flex items-center gap-2 text-amber-300 font-display font-bold text-sm">
                    <HelpCircle className="h-4 w-4 text-amber-400" />
                    How to Connect & Enable CORS in ComfyUI
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSetupGuide(false)}
                    className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-[12px] leading-relaxed text-slate-300">
                  ComfyUI blocks external browser requests by default, returning <span className="text-rose-400 font-bold">403 Forbidden</span> unless started with the <code className="text-director-gold bg-black/40 px-1.5 py-0.5 rounded">--enable-cors-header</code> argument.
                </p>

                <div className="flex flex-col gap-2">
                  <span className="text-amber-200/90 font-bold text-[11px] uppercase tracking-wider">
                    Option A: Start from Terminal / Command Prompt
                  </span>
                  <div className="flex items-center justify-between rounded-lg bg-black/60 border border-director-border p-2.5">
                    <code className="text-director-gold text-[11px] select-all overflow-x-auto">
                      python main.py --enable-cors-header --listen 127.0.0.1 --port 8188
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopyCommand('python main.py --enable-cors-header --listen 127.0.0.1 --port 8188')}
                      className="ml-2 flex items-center gap-1 rounded bg-director-surface border border-director-border px-2.5 py-1 text-[11px] text-slate-200 hover:text-white shrink-0"
                    >
                      {copiedCommand ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedCommand ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-amber-200/90 font-bold text-[11px] uppercase tracking-wider">
                    Option B: ComfyUI Portable (run_nvidia_gpu.bat)
                  </span>
                  <div className="text-[11px] text-slate-300 bg-black/40 border border-director-border/60 rounded-lg p-2.5 leading-relaxed">
                    1. Right-click <code className="text-white bg-slate-800 px-1 rounded">run_nvidia_gpu.bat</code> and choose <b>Edit</b>.<br />
                    2. Append <code className="text-director-gold bg-slate-800 px-1 rounded">--enable-cors-header</code> to the end of the Python command line.<br />
                    3. Save the file and restart ComfyUI.
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-400 border-t border-amber-500/10 pt-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>Once started, ensure the URL is set to <code className="text-white">http://127.0.0.1:8188</code> and click <b>Test Connection</b>.</span>
                </div>
              </div>
            )}
          </div>

          {/* Hardware & GPU Diagnostics */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Connected Hardware & Memory Diagnostics
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-director-border bg-director-surface/60 p-3 font-mono">
                <span className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <Cpu className="h-3 w-3 text-director-gold" /> GPU Accelerators
                </span>
                <p className="font-bold text-white text-xs mt-1 truncate">
                  {systemStats?.gpuName || (connectionStatus === 'connected' ? 'NVIDIA GPU' : 'N/A')}
                </p>
              </div>

              <div className="rounded-xl border border-director-border bg-director-surface/60 p-3 font-mono">
                <span className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <HardDrive className="h-3 w-3 text-emerald-400" /> GPU VRAM Budget
                </span>
                <p className="font-bold text-emerald-400 text-xs mt-1">
                  {systemStats ? `${systemStats.vramFreeGb}GB free / ${systemStats.vramTotalGb}GB` : 'N/A'}
                </p>
              </div>

              <div className="rounded-xl border border-director-border bg-director-surface/60 p-3 font-mono">
                <span className="text-[10px] text-slate-400 flex items-center gap-1.5">
                  <Activity className="h-3 w-3 text-director-cyan" /> System RAM
                </span>
                <p className="font-bold text-director-cyan text-xs mt-1">
                  {systemStats ? `${systemStats.ramFreeGb}GB free / ${systemStats.ramTotalGb}GB` : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Model Discovery Section */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Discovered Video Models & Nodes
            </label>
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono border ${
                  detectedModels.ltx || connectionStatus === 'connected'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                LTX-2.5 INT8 Transformer {detectedModels.ltx || connectionStatus === 'connected' ? '✓ Ready' : 'Standby'}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono border ${
                  detectedModels.minimax || connectionStatus === 'connected'
                    ? 'border-director-gold/40 bg-director-gold/10 text-director-gold'
                    : 'border-slate-700 bg-slate-800 text-slate-400'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                MiniMax H3 / Hailuo {detectedModels.minimax || connectionStatus === 'connected' ? '✓ Ready' : 'Standby'}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono border ${
                  detectedModels.wan
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                    : 'border-slate-700 bg-slate-800/60 text-slate-500'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Wan 2.1 Video {detectedModels.wan ? '✓ Detected' : 'Optional'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-director-border px-6 py-4 bg-director-panel/60">
          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
            <span
              className={`h-2 w-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            Status: <span className="text-white font-bold capitalize">{connectionStatus}</span>
            {latencyMs !== null && <span>({latencyMs}ms)</span>}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeSettings}
              className="rounded-xl px-4 py-2 font-display text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndConnect}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-director-gold to-director-amber px-5 py-2 font-display text-xs font-bold text-director-darkest shadow-glow-gold hover:brightness-110 transition-all"
            >
              Save & Connect
            </button>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
};
