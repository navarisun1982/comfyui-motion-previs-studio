declare const __APP_GIT_SHA__: string | undefined;
declare const __APP_GIT_SUMMARY__: string | undefined;

export interface IncomingGitCommit {
  sha: string;
  message: string;
  date: string;
}

export interface AppUpdateStatus {
  ok: boolean;
  version: string;
  branch?: string;
  localSha?: string;
  localCommitSummary?: string;
  remoteSha?: string;
  behindCount: number;
  aheadCount?: number;
  updateAvailable: boolean;
  incomingCommits: IncomingGitCommit[];
  offlineWarning?: string;
  error?: string;
  checkedAt: string;
}

export interface AppUpdateApplyResult {
  ok: boolean;
  alreadyUpToDate?: boolean;
  previousSha?: string;
  newSha?: string;
  updatedCommitsCount?: number;
  stashedChanges?: boolean;
  ranNpmInstall?: boolean;
  ranBuild?: boolean;
  stepsLog?: string[];
  status?: AppUpdateStatus;
  error?: string;
}

type UpdateListener = (status: AppUpdateStatus | null) => void;

let cachedStatus: AppUpdateStatus | null = null;
const listeners = new Set<UpdateListener>();

function getElectronBridge(): {
  checkAppUpdate?: (options?: { fetchRemote?: boolean }) => Promise<AppUpdateStatus>;
  applyAppUpdate?: () => Promise<AppUpdateApplyResult>;
} | null {
  if (typeof window !== 'undefined' && (window as any).electronComfyBridge) {
    return (window as any).electronComfyBridge;
  }
  return null;
}

function resolveApiBase(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://127.0.0.1:51731';
  }
  return '';
}

function notifyListeners() {
  for (const fn of listeners) {
    try {
      fn(cachedStatus);
    } catch {}
  }
}

export function getCachedAppUpdateStatus(): AppUpdateStatus | null {
  return cachedStatus;
}

export function subscribeAppUpdateStatus(listener: UpdateListener): () => void {
  listeners.add(listener);
  if (cachedStatus) {
    listener(cachedStatus);
  }
  return () => {
    listeners.delete(listener);
  };
}

async function checkDirectGitHubFallback(fetchRemote: boolean): Promise<AppUpdateStatus> {
  const localSha =
    typeof __APP_GIT_SHA__ !== 'undefined' && __APP_GIT_SHA__ ? __APP_GIT_SHA__ : 'local';
  const localSummary =
    typeof __APP_GIT_SUMMARY__ !== 'undefined' && __APP_GIT_SUMMARY__
      ? __APP_GIT_SUMMARY__
      : `${localSha} • Local Build`;

  if (!fetchRemote) {
    return {
      ok: true,
      version: '1.0.0',
      branch: 'master',
      localSha,
      localCommitSummary: localSummary,
      remoteSha: localSha,
      behindCount: 0,
      aheadCount: 0,
      updateAvailable: false,
      incomingCommits: [],
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    const ghRes = await fetch(
      'https://api.github.com/repos/gfarag/comfyui-motion-previs-studio/commits?sha=master&per_page=15',
      {
        method: 'GET',
        headers: { Accept: 'application/vnd.github.v3+json' },
      }
    );
    if (!ghRes.ok) {
      throw new Error(`GitHub API HTTP ${ghRes.status}`);
    }
    const commits = (await ghRes.json()) as Array<{
      sha?: string;
      commit?: { message?: string; author?: { date?: string } };
    }>;
    if (!Array.isArray(commits) || commits.length === 0) {
      throw new Error('Empty commit list from GitHub');
    }

    const remoteSha = (commits[0]?.sha || '').slice(0, 7) || localSha;
    const matchIdx = commits.findIndex(
      (c) => c.sha && localSha !== 'local' && c.sha.startsWith(localSha)
    );
    const behindCount = matchIdx > 0 ? matchIdx : 0;
    const incomingCommits: IncomingGitCommit[] =
      behindCount > 0
        ? commits.slice(0, behindCount).map((c) => ({
            sha: (c.sha || '').slice(0, 7),
            message: (c.commit?.message || '').split('\n')[0] || 'Update commit',
            date: c.commit?.author?.date
              ? new Date(c.commit.author.date).toLocaleDateString()
              : 'recent',
          }))
        : [];

    return {
      ok: true,
      version: '1.0.0',
      branch: 'master',
      localSha,
      localCommitSummary: localSummary,
      remoteSha,
      behindCount,
      aheadCount: 0,
      updateAvailable: behindCount > 0,
      incomingCommits,
      checkedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      ok: true,
      version: '1.0.0',
      branch: 'master',
      localSha,
      localCommitSummary: localSummary,
      remoteSha: localSha,
      behindCount: 0,
      aheadCount: 0,
      updateAvailable: false,
      incomingCommits: [],
      offlineWarning: `Checked local build (${localSha}). Could not reach GitHub (${err?.message || 'offline'}).`,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function checkForAppUpdates(fetchRemote = true): Promise<AppUpdateStatus> {
  // 1. Prefer direct Electron IPC when running inside desktop app
  const bridge = getElectronBridge();
  if (bridge && typeof bridge.checkAppUpdate === 'function') {
    try {
      const ipcData = await bridge.checkAppUpdate({ fetchRemote });
      if (ipcData && typeof ipcData === 'object') {
        cachedStatus = ipcData;
        notifyListeners();
        return ipcData;
      }
    } catch {
      // Fall through to HTTP / GitHub fallback
    }
  }

  // 2. Try local HTTP update service
  const base = resolveApiBase();
  const query = fetchRemote ? '' : '?fetch=0';
  try {
    const res = await fetch(`${base}/api/app-update/check${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as AppUpdateStatus;
      cachedStatus = data;
      notifyListeners();
      return data;
    }
  } catch {
    // Fall through to direct GitHub REST API check
  }

  // 3. Direct GitHub REST API check (never throws "Failed to fetch")
  const fallback = await checkDirectGitHubFallback(fetchRemote);
  cachedStatus = fallback;
  notifyListeners();
  return fallback;
}

export async function applyAppUpdateFromGitHub(): Promise<AppUpdateApplyResult> {
  const bridge = getElectronBridge();
  if (bridge && typeof bridge.applyAppUpdate === 'function') {
    const ipcResult = await bridge.applyAppUpdate();
    if (!ipcResult.ok) {
      throw new Error(ipcResult.error || 'Update failed via Electron IPC.');
    }
    if (ipcResult.status) {
      cachedStatus = ipcResult.status;
      notifyListeners();
    }
    return ipcResult;
  }

  const base = resolveApiBase();
  const res = await fetch(`${base}/api/app-update/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  const data = (await res.json()) as AppUpdateApplyResult;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Update failed (HTTP ${res.status})`);
  }
  if (data.status) {
    cachedStatus = data.status;
    notifyListeners();
  }
  return data;
}

