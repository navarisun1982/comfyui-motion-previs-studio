import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  FolderOpen,
  Save,
  RefreshCw,
  Box,
  Film,
  Image as ImageIcon,
  FileCode2,
  CheckCircle2,
  Loader2,
  Download,
  Upload,
} from 'lucide-react';
import {
  StudioStorageStatus,
  fetchStudioStorageStatus,
  updateStudioStorageDirectory,
  browseStudioStorageFolder,
  openStudioStorageInExplorer,
  saveProjectToStudioStorage,
  loadProjectFromStudioStorage,
} from '../services/studioStorageClient';
import { syncAllIndexedDBModelsToDisk } from '../services/modelStorage';
import { STORAGE_KEYS, safeGetItem, safeSetItem, sanitizeShotForStorage } from '../services/storage';
import { useShotStore } from '../stores/useShotStore';
import { useAssetLibraryStore } from '../stores/useAssetLibraryStore';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const StudioStorageSettingsCard: React.FC = () => {
  const [storageStatus, setStorageStatus] = useState<StudioStorageStatus | null>(null);
  const [pathInput, setPathInput] = useState<string>('');
  const [migrateExisting, setMigrateExisting] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<
    'loading' | 'saving-path' | 'browsing' | 'syncing' | 'restoring' | null
  >(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);

  const refreshStatus = async () => {
    setBusyAction('loading');
    try {
      const st = await fetchStudioStorageStatus();
      setStorageStatus(st);
      setPathInput((prev) => prev || st.storageDir);
    } catch (err: any) {
      setMessage({
        tone: 'err',
        text: err?.message || 'Unable to connect to local studio storage service.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const handleBrowseFolder = async () => {
    setBusyAction('browsing');
    setMessage({ tone: 'info', text: 'Opening Windows folder selection dialog...' });
    try {
      const res = await browseStudioStorageFolder(pathInput || storageStatus?.storageDir);
      if (res.ok && res.selectedPath) {
        setPathInput(res.selectedPath);
        setMessage({
          tone: 'info',
          text: `Selected folder: ${res.selectedPath} — Click "Apply Storage Folder" to activate.`,
        });
      } else {
        setMessage(null);
      }
    } catch (err: any) {
      setMessage({ tone: 'err', text: err?.message || 'Could not open folder browser.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveDirectory = async () => {
    const trimmed = pathInput.trim();
    if (!trimmed) {
      setMessage({ tone: 'err', text: 'Please enter or select a valid folder path.' });
      return;
    }
    setBusyAction('saving-path');
    setMessage({
      tone: 'info',
      text: migrateExisting
        ? `Applying storage folder "${trimmed}" and migrating existing models & scenes...`
        : `Applying storage folder "${trimmed}"...`,
    });
    try {
      const updated = await updateStudioStorageDirectory(trimmed, migrateExisting);
      setStorageStatus(updated);
      setPathInput(updated.storageDir);
      setMessage({
        tone: 'ok',
        text: `Studio Storage path set to "${updated.storageDir}"${
          updated.migratedFilesCount ? ` • Migrated ${updated.migratedFilesCount} file(s)` : ''
        }.`,
      });
    } catch (err: any) {
      setMessage({ tone: 'err', text: err?.message || 'Failed to update storage folder.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncAllToDisk = async () => {
    setBusyAction('syncing');
    setMessage({
      tone: 'info',
      text: 'Syncing all 3D models (.glb), scenes, shots, and custom library assets to disk...',
    });
    try {
      const syncedModelsCount = await syncAllIndexedDBModelsToDisk();
      const scenes = safeGetItem<any[]>(STORAGE_KEYS.SCENES, []);
      const shotStore = useShotStore.getState();
      const rawShots = {
        ...shotStore.shotsById,
        [shotStore.shot.id]: shotStore.shot,
      };
      const sanitizedShots: Record<string, any> = {};
      for (const [id, s] of Object.entries(rawShots)) {
        if (s) sanitizedShots[id] = sanitizeShotForStorage(s);
      }
      const customAssets = useAssetLibraryStore.getState().customAssets;

      const updatedStatus = await saveProjectToStudioStorage({
        scenes,
        shotsById: sanitizedShots,
        castPool: shotStore.sceneCastPool,
        customLibraryAssets: customAssets,
      });

      if (updatedStatus) {
        setStorageStatus(updatedStatus);
      } else {
        await refreshStatus();
      }
      setMessage({
        tone: 'ok',
        text: `Synced ${scenes.length} scene(s), ${Object.keys(sanitizedShots).length} shot(s), and ${syncedModelsCount} 3D model(s) to disk.`,
      });
    } catch (err: any) {
      setMessage({ tone: 'err', text: err?.message || 'Failed to sync project to disk.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestoreFromDisk = async () => {
    setBusyAction('restoring');
    setMessage({ tone: 'info', text: 'Loading saved scenes & shots from Studio Storage disk...' });
    try {
      const res = await loadProjectFromStudioStorage();
      if (!res || !res.hasSavedProject || !Array.isArray(res.scenes) || res.scenes.length === 0) {
        setMessage({
          tone: 'info',
          text: 'No saved project_scenes.json found in the active storage folder yet. Click "Sync All to Disk" first.',
        });
        return;
      }

      safeSetItem(STORAGE_KEYS.SCENES, res.scenes);
      if (res.shotsById && typeof res.shotsById === 'object') {
        safeSetItem(STORAGE_KEYS.SHOTS_CACHE, res.shotsById);
        const firstShotId = res.scenes[0]?.shots?.[0]?.id;
        const firstSpec = firstShotId ? res.shotsById[firstShotId] : null;
        useShotStore.setState((state) => ({
          ...state,
          shotsById: res.shotsById as any,
          ...(firstSpec ? { shot: firstSpec } : {}),
        }));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('studio-storage:project-restored', {
            detail: { scenes: res.scenes, shotsById: res.shotsById },
          })
        );
      }
      setStorageStatus(res);
      setMessage({
        tone: 'ok',
        text: `Restored ${res.scenes.length} scene(s) and ${
          res.shotsById ? Object.keys(res.shotsById).length : 0
        } shot(s) from disk.`,
      });
    } catch (err: any) {
      setMessage({ tone: 'err', text: err?.message || 'Failed to restore project from disk.' });
    } finally {
      setBusyAction(null);
    }
  };

  const inputCls =
    'w-full rounded-lg bg-black/50 border border-white/15 px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all';

  return (
    <div className="space-y-3 animate-in fade-in duration-150" id="studio-storage-settings-card">
      <div className="rounded-xl border border-emerald-500/35 bg-gradient-to-br from-emerald-950/35 via-slate-900/60 to-black/60 p-3.5 space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white tracking-wide">
                Studio Storage Drive (3D Models, Scenes, Shots &amp; Renders)
              </div>
              <div className="text-[10.5px] text-slate-400">
                Choose the local disk folder where your 3D <code className="text-emerald-300">.glb</code> models, scenes, shots, and reference plates are stored permanently.
              </div>
            </div>
          </div>

          {storageStatus && (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              TOTAL USED: {formatBytes(storageStatus.stats.totalBytes)}
            </span>
          )}
        </div>

        {/* Folder Path Input + Browse + Save */}
        <div className="space-y-2">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Active Storage Folder Path (Windows / Local Drive)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="studio-storage-path-input"
              className={inputCls}
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="E:\work\Comfy AI Director\studio_storage"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                id="studio-storage-browse-btn"
                onClick={handleBrowseFolder}
                disabled={busyAction !== null}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50 cursor-pointer"
                title="Browse local Windows folders"
              >
                {busyAction === 'browsing' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5 text-emerald-300" />
                )}
                <span>Browse...</span>
              </button>

              <button
                type="button"
                id="studio-storage-save-btn"
                onClick={handleSaveDirectory}
                disabled={busyAction !== null}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 px-3.5 py-2 text-xs font-bold text-black shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
              >
                {busyAction === 'saving-path' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span>Apply Storage Folder</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <label className="inline-flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={migrateExisting}
                onChange={(e) => setMigrateExisting(e.target.checked)}
                className="rounded border-white/20 bg-black/60 text-emerald-500 focus:ring-emerald-400"
              />
              <span>Automatically copy existing 3D models &amp; scenes when changing folder</span>
            </label>

            <button
              type="button"
              onClick={() => openStudioStorageInExplorer()}
              className="inline-flex items-center gap-1 text-[10.5px] font-mono text-emerald-300 hover:text-emerald-200 underline underline-offset-2 cursor-pointer"
            >
              <FolderOpen className="h-3 w-3" />
              <span>Open Storage Folder in Windows Explorer</span>
            </button>
          </div>
        </div>

        {/* 4 Subfolder Breakdown Cards */}
        {storageStatus && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="rounded-lg border border-white/10 bg-black/45 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-1 text-cyan-300 font-bold">
                  <Box className="h-3 w-3" /> 3D MODELS
                </span>
                <button
                  type="button"
                  onClick={() => openStudioStorageInExplorer('models')}
                  className="hover:text-white cursor-pointer"
                  title="Open models/ subfolder"
                >
                  Open ↗
                </button>
              </div>
              <div className="text-sm font-bold text-white font-mono">
                {storageStatus.stats.modelsCount} .GLB
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {formatBytes(storageStatus.stats.modelsBytes)} • <code className="text-slate-300">/models</code>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/45 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-1 text-amber-300 font-bold">
                  <FileCode2 className="h-3 w-3" /> SCENES &amp; SHOTS
                </span>
                <button
                  type="button"
                  onClick={() => openStudioStorageInExplorer('scenes')}
                  className="hover:text-white cursor-pointer"
                  title="Open scenes/ subfolder"
                >
                  Open ↗
                </button>
              </div>
              <div className="text-sm font-bold text-white font-mono">
                {storageStatus.stats.scenesCount} Sc / {storageStatus.stats.shotsCount} Sh
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {formatBytes(storageStatus.stats.scenesBytes)} • <code className="text-slate-300">/scenes</code>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/45 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-1 text-violet-300 font-bold">
                  <ImageIcon className="h-3 w-3" /> REFERENCES
                </span>
                <button
                  type="button"
                  onClick={() => openStudioStorageInExplorer('references')}
                  className="hover:text-white cursor-pointer"
                  title="Open references/ subfolder"
                >
                  Open ↗
                </button>
              </div>
              <div className="text-sm font-bold text-white font-mono">
                {storageStatus.stats.referencesCount} Files
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {formatBytes(storageStatus.stats.referencesBytes)} • <code className="text-slate-300">/references</code>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/45 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-1 text-rose-300 font-bold">
                  <Film className="h-3 w-3" /> RENDERS
                </span>
                <button
                  type="button"
                  onClick={() => openStudioStorageInExplorer('renders')}
                  className="hover:text-white cursor-pointer"
                  title="Open renders/ subfolder"
                >
                  Open ↗
                </button>
              </div>
              <div className="text-sm font-bold text-white font-mono">
                {storageStatus.stats.rendersCount} MP4s
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {formatBytes(storageStatus.stats.rendersBytes)} • <code className="text-slate-300">/renders</code>
              </div>
            </div>
          </div>
        )}

        {/* Sync & Restore Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
          <div className="text-[10.5px] text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>
              Scene edits &amp; cached <code className="text-emerald-300">.glb</code> models auto-sync to this folder.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="studio-storage-sync-now-btn"
              onClick={handleSyncAllToDisk}
              disabled={busyAction !== null}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-200 disabled:opacity-50 cursor-pointer"
            >
              {busyAction === 'syncing' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span>Sync All to Disk Now</span>
            </button>

            <button
              type="button"
              id="studio-storage-restore-btn"
              onClick={handleRestoreFromDisk}
              disabled={busyAction !== null}
              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-50 cursor-pointer"
            >
              {busyAction === 'restoring' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 text-cyan-300" />
              )}
              <span>Restore Project from Disk</span>
            </button>

            <button
              type="button"
              onClick={refreshStatus}
              disabled={busyAction !== null}
              className="flex items-center justify-center rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 p-1.5 text-slate-300 hover:text-white disabled:opacity-50 cursor-pointer"
              title="Refresh Storage Stats"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busyAction === 'loading' ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`rounded-lg border px-2.5 py-1.5 text-[10.5px] font-mono ${
              message.tone === 'ok'
                ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
                : message.tone === 'err'
                ? 'border-rose-500/40 bg-rose-950/60 text-rose-200'
                : 'border-sky-500/30 bg-sky-950/40 text-sky-200'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};

