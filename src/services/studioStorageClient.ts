/**
 * Studio Disk Storage Client Service
 * Connects the frontend studio (3D Models, Scenes, Shots, References & Renders)
 * to the user-configured disk storage folder on Windows / Desktop.
 */

export interface StudioStorageStats {
  modelsCount: number;
  modelsBytes: number;
  scenesCount: number;
  shotsCount: number;
  scenesBytes: number;
  referencesCount: number;
  referencesBytes: number;
  rendersCount: number;
  rendersBytes: number;
  totalBytes: number;
  lastSyncedAt: number | null;
}

export interface StudioStorageStatus {
  ok: boolean;
  storageDir: string;
  defaultStorageDir: string;
  subfolders: {
    models: string;
    scenes: string;
    references: string;
    renders: string;
  };
  stats: StudioStorageStats;
  migratedFilesCount?: number;
  error?: string;
}

export interface StudioProjectDiskPayload {
  scenes?: unknown[];
  shotsById?: Record<string, unknown>;
  castPool?: unknown[];
  customLibraryAssets?: unknown[];
}

export interface StudioProjectDiskLoadResult extends StudioStorageStatus {
  hasSavedProject: boolean;
  scenes: any[] | null;
  shotsById: Record<string, any> | null;
  castPool: any[] | null;
  customLibraryAssets: any[] | null;
  updatedAt: number | null;
}

function isLiveBrowserEnvironment(): boolean {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
  // Skip automatic background HTTP calls inside headless jsdom unit test runners
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (ua.includes('jsdom') || ua.includes('Node.js')) return false;
  return true;
}

export function resolveStudioStorageApiBase(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://127.0.0.1:51731';
  }
  return '';
}

export async function fetchStudioStorageStatus(): Promise<StudioStorageStatus> {
  const base = resolveStudioStorageApiBase();
  const res = await fetch(`${base}/api/studio-storage/status`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Failed to read studio storage status (${res.status})`);
  }
  return data as StudioStorageStatus;
}

export async function updateStudioStorageDirectory(
  storageDir: string,
  migrateExisting = true
): Promise<StudioStorageStatus> {
  const base = resolveStudioStorageApiBase();
  const res = await fetch(`${base}/api/studio-storage/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageDir, migrateExisting }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Failed to update storage folder (${res.status})`);
  }
  return data as StudioStorageStatus;
}

export async function browseStudioStorageFolder(
  initialDir?: string
): Promise<{ ok: boolean; cancelled?: boolean; selectedPath?: string; error?: string }> {
  const base = resolveStudioStorageApiBase();
  const res = await fetch(`${base}/api/studio-storage/browse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initialDir }),
  });
  return await res.json();
}

export async function openStudioStorageInExplorer(
  subfolder?: 'models' | 'scenes' | 'references' | 'renders'
): Promise<{ ok: boolean; openedPath?: string }> {
  const base = resolveStudioStorageApiBase();
  const res = await fetch(`${base}/api/studio-storage/open-explorer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subfolder }),
  });
  return await res.json();
}

export async function saveProjectToStudioStorage(
  payload: StudioProjectDiskPayload
): Promise<StudioStorageStatus | null> {
  if (!isLiveBrowserEnvironment()) return null;
  try {
    const bridge = typeof window !== 'undefined' ? (window as any).electronComfyBridge : null;
    if (bridge && typeof bridge.saveStudioProject === 'function') {
      const ipcResult = await bridge.saveStudioProject(payload);
      if (ipcResult && ipcResult.ok) {
        return ipcResult as StudioStorageStatus;
      }
    }
  } catch {
    // Fall back to HTTP below
  }
  try {
    const base = resolveStudioStorageApiBase();
    const res = await fetch(`${base}/api/studio-storage/save-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return (await res.json()) as StudioStorageStatus;
  } catch {
    return null;
  }
}

export async function loadProjectFromStudioStorage(): Promise<StudioProjectDiskLoadResult | null> {
  if (!isLiveBrowserEnvironment()) return null;
  try {
    const bridge = typeof window !== 'undefined' ? (window as any).electronComfyBridge : null;
    if (bridge && typeof bridge.loadStudioProject === 'function') {
      const ipcResult = await bridge.loadStudioProject();
      if (ipcResult && ipcResult.ok) {
        return ipcResult as StudioProjectDiskLoadResult;
      }
    }
  } catch {
    // Fall back to HTTP below
  }
  try {
    const base = resolveStudioStorageApiBase();
    const res = await fetch(`${base}/api/studio-storage/load-project`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as StudioProjectDiskLoadResult;
  } catch {
    return null;
  }
}

export async function saveModelBufferToStudioStorage(
  id: string,
  buffer: ArrayBuffer,
  name = 'Model',
  mimeType = 'model/gltf-binary'
): Promise<boolean> {
  if (!isLiveBrowserEnvironment()) return false;
  try {
    const base = resolveStudioStorageApiBase();
    const res = await fetch(`${base}/api/studio-storage/save-model`, {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'X-Model-Id': encodeURIComponent(id),
        'X-Model-Name': encodeURIComponent(name),
      },
      body: buffer,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchModelBufferFromStudioStorage(
  id: string
): Promise<ArrayBuffer | null> {
  if (!isLiveBrowserEnvironment()) return null;
  try {
    const base = resolveStudioStorageApiBase();
    const res = await fetch(
      `${base}/api/studio-storage/model?id=${encodeURIComponent(id)}`,
      { method: 'GET' }
    );
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

