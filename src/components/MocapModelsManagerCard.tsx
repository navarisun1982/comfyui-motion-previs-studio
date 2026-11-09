import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FolderOpen,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Box,
} from 'lucide-react';

export interface BundledModelStatusItem {
  id: string;
  name: string;
  relPath: string;
  role: string;
  installed: boolean;
  sizeBytes: number;
  sizeMb: number;
}

export interface MocapNlfStatusResponse {
  ok: boolean;
  available: boolean;
  engine: string;
  pythonExe: string;
  pythonFound?: boolean;
  modelPath: string | null;
  targetInstallPath: string;
  modelSizeBytes: number;
  modelSizeMb: number;
  expectedSizeMb: number;
  downloadUrl: string;
  scriptExists: boolean;
  bundledModels?: BundledModelStatusItem[];
  downloadProgress?: {
    active: boolean;
    bytesDownloaded: number;
    totalBytes: number;
    percent: number;
    targetPath: string | null;
    error: string | null;
    completedAt: number | null;
  };
}

const CUSTOM_NLF_DIR_STORAGE_KEY = 'cmpvs_custom_nlf_models_dir';

export function getSavedCustomNlfModelsDir(): string {
  try {
    return localStorage.getItem(CUSTOM_NLF_DIR_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveCustomNlfModelsDir(dir: string): void {
  try {
    if (dir.trim()) {
      localStorage.setItem(CUSTOM_NLF_DIR_STORAGE_KEY, dir.trim());
    } else {
      localStorage.removeItem(CUSTOM_NLF_DIR_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function queryMocapNlfStatus(customModelDir?: string): Promise<MocapNlfStatusResponse | null> {
  const dirParam = (customModelDir ?? getSavedCustomNlfModelsDir()).trim();
  const qs = dirParam ? `?customModelDir=${encodeURIComponent(dirParam)}` : '';

  const bridge =
    typeof window !== 'undefined'
      ? (
          window as unknown as {
            electronComfyBridge?: {
              request?: (opts: {
                path: string;
                method: string;
                body?: unknown;
                responseType?: string;
                timeoutMs?: number;
              }) => Promise<{ ok?: boolean; data?: MocapNlfStatusResponse }>;
            };
          }
        ).electronComfyBridge
      : undefined;

  if (bridge && typeof bridge.request === 'function') {
    try {
      const ipcRes = await bridge.request({
        path: `/__local_mocap_nlf/status${qs}`,
        method: 'GET',
        responseType: 'json',
        timeoutMs: 8000,
      });
      if (ipcRes?.data) {
        return ipcRes.data;
      }
    } catch {
      // fall through to HTTP fetch
    }
  }

  try {
    const res = await fetch(`/api/mocap-nlf/status${qs}`);
    if (res.ok) {
      return (await res.json()) as MocapNlfStatusResponse;
    }
  } catch {
    // ignore offline/test environment
  }
  return null;
}

export async function startMocapNlfDownload(customModelDir?: string): Promise<{
  ok: boolean;
  alreadyInstalled?: boolean;
  alreadyDownloading?: boolean;
  started?: boolean;
  status?: MocapNlfStatusResponse;
  error?: string;
}> {
  const dirParam = (customModelDir ?? getSavedCustomNlfModelsDir()).trim();
  const payload = dirParam ? { customModelDir: dirParam } : {};

  const bridge =
    typeof window !== 'undefined'
      ? (
          window as unknown as {
            electronComfyBridge?: {
              request?: (opts: {
                path: string;
                method: string;
                body?: unknown;
                responseType?: string;
                timeoutMs?: number;
              }) => Promise<{ ok?: boolean; data?: Record<string, unknown> }>;
            };
          }
        ).electronComfyBridge
      : undefined;

  if (bridge && typeof bridge.request === 'function') {
    try {
      const ipcRes = await bridge.request({
        path: '/__local_mocap_nlf/download',
        method: 'POST',
        body: payload,
        responseType: 'json',
        timeoutMs: 15000,
      });
      if (ipcRes?.data) {
        return ipcRes.data as {
          ok: boolean;
          alreadyInstalled?: boolean;
          alreadyDownloading?: boolean;
          started?: boolean;
          status?: MocapNlfStatusResponse;
          error?: string;
        };
      }
    } catch {
      // fall through to HTTP fetch
    }
  }

  try {
    const res = await fetch('/api/mocap-nlf/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'Download request failed' };
  }
  return { ok: false, error: 'Unable to reach local model download service' };
}

export const MocapModelsManagerCard: React.FC<{
  compact?: boolean;
  onStatusChange?: (status: MocapNlfStatusResponse | null) => void;
}> = ({ compact = false, onStatusChange }) => {
  const [status, setStatus] = useState<MocapNlfStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [customDir, setCustomDir] = useState<string>(() => getSavedCustomNlfModelsDir());
  const [message, setMessage] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);

  const refreshStatus = useCallback(
    async (dirOverride?: string) => {
      setLoading(true);
      const next = await queryMocapNlfStatus(dirOverride ?? customDir);
      setStatus(next);
      onStatusChange?.(next);
      setLoading(false);
      return next;
    },
    [customDir, onStatusChange]
  );

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Poll automatically while download is active
  useEffect(() => {
    if (!status?.downloadProgress?.active) return;
    const timer = setInterval(async () => {
      const next = await queryMocapNlfStatus(customDir);
      if (next) {
        setStatus(next);
        onStatusChange?.(next);
        if (!next.downloadProgress?.active && next.available) {
          setMessage({
            tone: 'ok',
            text: `NLF-Large 3D Multi-Person SMPL model installed at ${next.modelPath} (${next.modelSizeMb} MB).`,
          });
        } else if (next.downloadProgress?.error) {
          setMessage({
            tone: 'err',
            text: `Download failed: ${next.downloadProgress.error}`,
          });
        }
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [status?.downloadProgress?.active, customDir, onStatusChange]);

  const handleDownloadClick = async () => {
    saveCustomNlfModelsDir(customDir);
    setMessage({
      tone: 'info',
      text: 'Starting direct open-weights download (470.3 MB) from github.com/isarandi/nlf...',
    });
    const res = await startMocapNlfDownload(customDir);
    if (res.status) {
      setStatus(res.status);
      onStatusChange?.(res.status);
    } else {
      await refreshStatus(customDir);
    }
    if (res.alreadyInstalled) {
      setMessage({
        tone: 'ok',
        text: `Model is already installed and verified (${res.status?.modelPath || ''}).`,
      });
    } else if (!res.ok) {
      setMessage({
        tone: 'err',
        text: res.error || 'Could not start model download.',
      });
    }
  };

  const isDownloading = Boolean(status?.downloadProgress?.active);
  const pct = status?.downloadProgress?.percent ?? 0;
  const dlMb = Number(((status?.downloadProgress?.bytesDownloaded ?? 0) / (1024 * 1024)).toFixed(1));
  const totalMb = Number(
    ((status?.downloadProgress?.totalBytes ?? 493117974) / (1024 * 1024)).toFixed(1)
  );

  return (
    <div
      data-testid="mocap-models-manager-card"
      className={
        compact
          ? 'rounded-2xl border border-white/[0.08] bg-[#0c111d]/95 p-3.5 space-y-2.5 shadow-inner'
          : 'rounded-xl border border-cyan-500/35 bg-gradient-to-br from-cyan-950/35 via-slate-900/70 to-black/70 p-3.5 space-y-2.5'
      }
    >
      {/* Header Row */}
      {compact ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 text-cyan-400 shrink-0" />
              <span className="text-xs font-bold text-white tracking-tight">Models</span>
            </div>
            <span className="text-[10.5px] text-slate-400">
              3D mocap &amp; SMPL model manager
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              data-testid="nlf-model-status-badge"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
                status?.available
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : isDownloading
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50 animate-pulse'
                    : 'bg-amber-500/15 text-amber-200 border-amber-400/50'
              }`}
            >
              {status?.available && <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />}
              <span>
                {status?.available
                  ? `INSTALLED • ${status.modelSizeMb || 470.3} MB`
                  : isDownloading
                    ? `DOWNLOADING • ${pct}%`
                    : 'MODEL NOT FOUND (470.3 MB)'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void refreshStatus(customDir)}
              disabled={loading || isDownloading}
              title="Re-scan local ComfyUI models directory"
              className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-50 cursor-pointer transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-cyan-300' : ''}`} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white tracking-wide truncate">
                3D Mocap &amp; SMPL Models Manager (Open Weights)
              </div>
              <div className="text-[10px] font-mono text-slate-400 truncate">
                Keeps GitHub repo lightweight (&lt;10 MB) while managing heavy local GPU weights (470.3 MB)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              data-testid="nlf-model-status-badge"
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                status?.available
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : isDownloading
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50 animate-pulse'
                    : 'bg-amber-500/20 text-amber-200 border-amber-400/50'
              }`}
            >
              {status?.available
                ? `INSTALLED • ${status.modelSizeMb || 470.3} MB`
                : isDownloading
                  ? `DOWNLOADING • ${pct}%`
                  : 'MODEL NOT FOUND (470.3 MB)'}
            </span>
            <button
              type="button"
              onClick={() => void refreshStatus(customDir)}
              disabled={loading || isDownloading}
              title="Re-scan local ComfyUI models directory"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-cyan-300' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Primary GPU Model Card: NLF-Large 3D Multi-Person SMPL */}
      <div className="rounded-xl border border-white/[0.08] bg-[#070a12]/90 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-white">
              {status?.available ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              )}
              <span className="truncate">
                NLF-Large 3D Multi-Person SMPL (nlf_l_multi_0.3.2.torchscript)
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 break-all pl-5">
              {status?.available
                ? `Active Path: ${status.modelPath}`
                : `Target Install Path: ${status?.targetInstallPath || 'D:\\ComfyUI\\models\\nlf\\nlf_l_multi_0.3.2.torchscript'}`}
            </div>
            {status?.pythonExe && (
              <div className="text-[10px] font-mono text-slate-400 pl-5">
                Python Runtime: {status.pythonExe}
              </div>
            )}
          </div>

          {!status?.available && (
            <button
              type="button"
              data-testid="download-nlf-model-btn"
              onClick={handleDownloadClick}
              disabled={isDownloading}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/20 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    Downloading {dlMb} / {totalMb} MB ({pct}%)
                  </span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Model (470.3 MB)</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Live Progress Bar during download */}
        {isDownloading && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.max(3, pct)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9.5px] font-mono text-cyan-200">
              <span>Downloading from github.com/isarandi/nlf/releases/v0.3.2...</span>
              <span>
                {dlMb} MB / {totalMb} MB ({pct}%)
              </span>
            </div>
          </div>
        )}

        {/* Custom Models Folder Override (for users whose ComfyUI is on another drive) */}
        {!compact && (
          <div className="pt-1.5 border-t border-white/[0.07] flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 shrink-0">
              <FolderOpen className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span>Custom Folder:</span>
            </div>
            <input
              type="text"
              value={customDir}
              onChange={(e) => setCustomDir(e.target.value)}
              placeholder="Default: D:\ComfyUI\models\nlf (or custom path)"
              className="flex-1 rounded-md bg-black/60 border border-white/15 px-2.5 py-1 text-[10.5px] text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="button"
              onClick={() => {
                saveCustomNlfModelsDir(customDir);
                void refreshStatus(customDir);
                setMessage({
                  tone: 'ok',
                  text: customDir.trim()
                    ? `Saved custom NLF model path: ${customDir.trim()}`
                    : 'Reset to default ComfyUI models path.',
                });
              }}
              className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/15 text-[10px] font-semibold text-slate-200 shrink-0 cursor-pointer"
            >
              Verify &amp; Save Path
            </button>
          </div>
        )}
      </div>

      {/* Repo-Bundled Lightweight Rig & Pose Assets (<10 MB total, always in GitHub repo) */}
      {!compact && status?.bundledModels && status.bundledModels.length > 0 && (
        <div className="rounded-lg border border-white/[0.08] bg-black/40 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-300 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Bundled In-Repo Rig &amp; Fallback Assets (&lt;10 MB Total • GitHub Safe)</span>
            </span>
            <span className="font-mono text-emerald-300">100% Open / Competition Safe</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {status.bundledModels.map((bm) => (
              <div
                key={bm.id}
                className="rounded-md bg-white/[0.03] border border-white/[0.07] px-2 py-1.5 flex items-center justify-between gap-1.5 text-[10px]"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-200 truncate" title={bm.name}>
                    {bm.name}
                  </div>
                  <div className="text-[9px] font-mono text-slate-400 truncate">{bm.relPath}</div>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono text-[9px] shrink-0 ${
                    bm.installed
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {bm.installed ? `✓ ${bm.sizeMb} MB` : 'Missing'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {message && (
        <div
          className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-mono flex items-center gap-1.5 ${
            message.tone === 'ok'
              ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
              : message.tone === 'err'
                ? 'border-rose-500/40 bg-rose-950/60 text-rose-200'
                : 'border-sky-500/30 bg-sky-950/40 text-sky-200'
          }`}
        >
          <HardDrive className="h-3.5 w-3.5 shrink-0" />
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
};

