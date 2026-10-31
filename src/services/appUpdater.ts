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

export async function checkForAppUpdates(fetchRemote = true): Promise<AppUpdateStatus> {
  const base = resolveApiBase();
  const query = fetchRemote ? '' : '?fetch=0';
  try {
    const res = await fetch(`${base}/api/app-update/check${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const data = (await res.json()) as AppUpdateStatus;
    cachedStatus = data;
    notifyListeners();
    return data;
  } catch (err: any) {
    const fallback: AppUpdateStatus = {
      ok: false,
      version: '1.0.0',
      behindCount: 0,
      updateAvailable: false,
      incomingCommits: [],
      error: err?.message || 'Unable to reach local update service.',
      checkedAt: new Date().toISOString(),
    };
    cachedStatus = fallback;
    notifyListeners();
    return fallback;
  }
}

export async function applyAppUpdateFromGitHub(): Promise<AppUpdateApplyResult> {
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

