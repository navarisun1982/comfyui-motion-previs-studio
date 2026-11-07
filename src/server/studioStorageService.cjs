const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_STORAGE_DIR = path.join(REPO_ROOT, 'studio_storage');
const LOCAL_CONFIG_PATH = path.join(REPO_ROOT, 'studio-storage-config.json');
const USER_CONFIG_DIR = path.join(os.homedir(), '.config', 'comfy-ai-director');
const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, 'studio-storage-config.json');

const SUBFOLDER_NAMES = ['models', 'scenes', 'references', 'renders'];

function readStorageConfig() {
  for (const cfgPath of [LOCAL_CONFIG_PATH, USER_CONFIG_PATH]) {
    try {
      if (fs.existsSync(cfgPath)) {
        const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        if (raw && typeof raw.storageDir === 'string' && raw.storageDir.trim()) {
          return {
            storageDir: path.resolve(raw.storageDir.trim()),
            lastSyncedAt: raw.lastSyncedAt || null,
          };
        }
      }
    } catch {
      // ignore malformed config
    }
  }
  return {
    storageDir: DEFAULT_STORAGE_DIR,
    lastSyncedAt: null,
  };
}

function writeStorageConfig(config) {
  const payload = JSON.stringify(
    {
      storageDir: path.resolve(config.storageDir || DEFAULT_STORAGE_DIR),
      lastSyncedAt: config.lastSyncedAt || Date.now(),
      updatedAt: Date.now(),
    },
    null,
    2
  );
  try {
    fs.writeFileSync(LOCAL_CONFIG_PATH, payload, 'utf-8');
  } catch {
    // ignore if read-only
  }
  try {
    fs.mkdirSync(USER_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(USER_CONFIG_PATH, payload, 'utf-8');
  } catch {
    // ignore
  }
}

function ensureStorageDirectories(baseDir) {
  const resolved = path.resolve(baseDir || DEFAULT_STORAGE_DIR);
  fs.mkdirSync(resolved, { recursive: true });
  const subfolders = {};
  for (const name of SUBFOLDER_NAMES) {
    const sub = path.join(resolved, name);
    fs.mkdirSync(sub, { recursive: true });
    subfolders[name] = sub;
  }
  fs.mkdirSync(path.join(subfolders.scenes, 'shots'), { recursive: true });
  return { storageDir: resolved, subfolders };
}

function getActiveStorageDir() {
  const cfg = readStorageConfig();
  const { storageDir } = ensureStorageDirectories(cfg.storageDir);
  return storageDir;
}

function computeDirStats(dirPath, extFilter) {
  let count = 0;
  let bytes = 0;
  if (!dirPath || !fs.existsSync(dirPath)) return { count, bytes };
  const walk = (current, depth = 0) => {
    if (depth > 3 || !fs.existsSync(current)) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (extFilter && !extFilter(lower)) continue;
        try {
          const st = fs.statSync(full);
          count += 1;
          bytes += st.size;
        } catch {
          // ignore
        }
      }
    }
  };
  walk(dirPath, 0);
  return { count, bytes };
}

function getStudioStorageStatus() {
  const cfg = readStorageConfig();
  const { storageDir, subfolders } = ensureStorageDirectories(cfg.storageDir);

  const modelsStat = computeDirStats(
    subfolders.models,
    (name) => name.endsWith('.glb') || name.endsWith('.gltf')
  );
  const referencesStat = computeDirStats(
    subfolders.references,
    (name) => name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp')
  );
  const rendersStat = computeDirStats(
    subfolders.renders,
    (name) => name.endsWith('.mp4') || name.endsWith('.webm')
  );
  const scenesStat = computeDirStats(subfolders.scenes, (name) => name.endsWith('.json'));

  let scenesCount = 0;
  let shotsCount = 0;
  const scenesFile = path.join(subfolders.scenes, 'project_scenes.json');
  if (fs.existsSync(scenesFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(scenesFile, 'utf-8'));
      if (Array.isArray(parsed.scenes)) {
        scenesCount = parsed.scenes.length;
        shotsCount = parsed.scenes.reduce(
          (acc, sc) => acc + (Array.isArray(sc.shots) ? sc.shots.length : 0),
          0
        );
      }
    } catch {
      // ignore
    }
  }

  return {
    ok: true,
    storageDir,
    defaultStorageDir: DEFAULT_STORAGE_DIR,
    subfolders,
    stats: {
      modelsCount: modelsStat.count,
      modelsBytes: modelsStat.bytes,
      scenesCount,
      shotsCount,
      scenesBytes: scenesStat.bytes,
      referencesCount: referencesStat.count,
      referencesBytes: referencesStat.bytes,
      rendersCount: rendersStat.count,
      rendersBytes: rendersStat.bytes,
      totalBytes:
        modelsStat.bytes + scenesStat.bytes + referencesStat.bytes + rendersStat.bytes,
      lastSyncedAt: cfg.lastSyncedAt,
    },
  };
}

function copyDirectoryRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return 0;
  fs.mkdirSync(destDir, { recursive: true });
  let copiedFiles = 0;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcFull = path.join(srcDir, entry.name);
    const destFull = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copiedFiles += copyDirectoryRecursive(srcFull, destFull);
    } else if (entry.isFile()) {
      try {
        fs.copyFileSync(srcFull, destFull);
        copiedFiles += 1;
      } catch {
        // ignore locked file
      }
    }
  }
  return copiedFiles;
}

function updateStudioStorageConfig({ storageDir, migrateExisting = true }) {
  if (!storageDir || typeof storageDir !== 'string' || !storageDir.trim()) {
    throw new Error('A valid storage folder path is required.');
  }
  const cleanPath = storageDir.trim().replace(/^["']+|["']+$/g, '');
  if (cleanPath.includes('\0')) {
    throw new Error('Invalid characters in storage folder path.');
  }

  const prevCfg = readStorageConfig();
  const prevDir = path.resolve(prevCfg.storageDir || DEFAULT_STORAGE_DIR);
  const nextDir = path.resolve(cleanPath);

  const { subfolders } = ensureStorageDirectories(nextDir);
  let migratedFilesCount = 0;

  if (migrateExisting && prevDir.toLowerCase() !== nextDir.toLowerCase() && fs.existsSync(prevDir)) {
    for (const sub of SUBFOLDER_NAMES) {
      const oldSub = path.join(prevDir, sub);
      const newSub = subfolders[sub];
      if (fs.existsSync(oldSub)) {
        migratedFilesCount += copyDirectoryRecursive(oldSub, newSub);
      }
    }
  }

  writeStorageConfig({ storageDir: nextDir, lastSyncedAt: Date.now() });
  return {
    ...getStudioStorageStatus(),
    migratedFilesCount,
  };
}

function sanitizeFileId(rawId) {
  return String(rawId || 'asset')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

function saveProjectToDisk(payload) {
  const cfg = readStorageConfig();
  const { storageDir, subfolders } = ensureStorageDirectories(cfg.storageDir);
  const now = Date.now();

  if (payload && Array.isArray(payload.scenes)) {
    const scenesData = {
      version: 'competition-2x6-v1',
      updatedAt: now,
      scenes: payload.scenes,
      castPool: Array.isArray(payload.castPool) ? payload.castPool : [],
      customLibraryAssets: Array.isArray(payload.customLibraryAssets)
        ? payload.customLibraryAssets
        : [],
    };
    fs.writeFileSync(
      path.join(subfolders.scenes, 'project_scenes.json'),
      JSON.stringify(scenesData, null, 2),
      'utf-8'
    );
  }

  if (payload && payload.shotsById && typeof payload.shotsById === 'object') {
    fs.writeFileSync(
      path.join(subfolders.scenes, 'shots_cache.json'),
      JSON.stringify(payload.shotsById, null, 2),
      'utf-8'
    );
    const shotsDir = path.join(subfolders.scenes, 'shots');
    fs.mkdirSync(shotsDir, { recursive: true });
    for (const [shotId, shotSpec] of Object.entries(payload.shotsById)) {
      if (!shotSpec || typeof shotSpec !== 'object') continue;
      const safeShotFile = `${sanitizeFileId(shotId)}.json`;
      fs.writeFileSync(
        path.join(shotsDir, safeShotFile),
        JSON.stringify(shotSpec, null, 2),
        'utf-8'
      );
    }
  }

  writeStorageConfig({ storageDir, lastSyncedAt: now });
  return getStudioStorageStatus();
}

function loadProjectFromDisk() {
  const cfg = readStorageConfig();
  const { subfolders } = ensureStorageDirectories(cfg.storageDir);
  const scenesFile = path.join(subfolders.scenes, 'project_scenes.json');
  const shotsFile = path.join(subfolders.scenes, 'shots_cache.json');

  let scenes = null;
  let castPool = null;
  let customLibraryAssets = null;
  let updatedAt = null;
  let shotsById = null;

  if (fs.existsSync(scenesFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(scenesFile, 'utf-8'));
      scenes = Array.isArray(parsed.scenes) ? parsed.scenes : null;
      castPool = Array.isArray(parsed.castPool) ? parsed.castPool : null;
      customLibraryAssets = Array.isArray(parsed.customLibraryAssets)
        ? parsed.customLibraryAssets
        : null;
      updatedAt = parsed.updatedAt || null;
    } catch {
      // ignore
    }
  }

  if (fs.existsSync(shotsFile)) {
    try {
      const parsedShots = JSON.parse(fs.readFileSync(shotsFile, 'utf-8'));
      if (parsedShots && typeof parsedShots === 'object') {
        shotsById = parsedShots;
      }
    } catch {
      // ignore
    }
  }

  return {
    ok: true,
    hasSavedProject: Boolean(scenes && scenes.length > 0),
    scenes,
    shotsById,
    castPool,
    customLibraryAssets,
    updatedAt,
    ...getStudioStorageStatus(),
  };
}

function saveModelToDisk({ id, name, buffer, mimeType }) {
  if (!id || !buffer) {
    throw new Error('Model id and binary buffer are required.');
  }
  const cfg = readStorageConfig();
  const { storageDir, subfolders } = ensureStorageDirectories(cfg.storageDir);
  const safeId = sanitizeFileId(id);
  const ext = mimeType === 'model/gltf+json' ? '.gltf' : '.glb';
  const modelPath = path.join(subfolders.models, `${safeId}${ext}`);
  const metaPath = path.join(subfolders.models, `${safeId}.meta.json`);

  fs.writeFileSync(modelPath, buffer);
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        id,
        safeId,
        name: name || id,
        mimeType: mimeType || 'model/gltf-binary',
        sizeBytes: buffer.length,
        filePath: modelPath,
        updatedAt: Date.now(),
      },
      null,
      2
    ),
    'utf-8'
  );

  writeStorageConfig({ storageDir, lastSyncedAt: Date.now() });
  return {
    ok: true,
    id,
    filePath: modelPath,
    sizeBytes: buffer.length,
  };
}

function loadModelFromDisk(id) {
  const cfg = readStorageConfig();
  const { subfolders } = ensureStorageDirectories(cfg.storageDir);
  const safeId = sanitizeFileId(id);
  for (const ext of ['.glb', '.gltf']) {
    const candidate = path.join(subfolders.models, `${safeId}${ext}`);
    if (fs.existsSync(candidate)) {
      return {
        buffer: fs.readFileSync(candidate),
        filePath: candidate,
        mimeType: ext === '.gltf' ? 'model/gltf+json' : 'model/gltf-binary',
      };
    }
  }
  return null;
}

function listModelsOnDisk() {
  const cfg = readStorageConfig();
  const { subfolders } = ensureStorageDirectories(cfg.storageDir);
  const results = [];
  if (!fs.existsSync(subfolders.models)) return results;

  const entries = fs.readdirSync(subfolders.models, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const lower = entry.name.toLowerCase();
    if (!lower.endsWith('.glb') && !lower.endsWith('.gltf')) continue;
    const full = path.join(subfolders.models, entry.name);
    const baseName = entry.name.replace(/\.(glb|gltf)$/i, '');
    const metaPath = path.join(subfolders.models, `${baseName}.meta.json`);
    let meta = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch {
        // ignore
      }
    }
    try {
      const st = fs.statSync(full);
      results.push({
        id: meta.id || baseName,
        name: meta.name || baseName,
        filePath: full,
        sizeBytes: st.size,
        updatedAt: meta.updatedAt || st.mtimeMs,
      });
    } catch {
      // ignore
    }
  }
  results.sort((a, b) => b.updatedAt - a.updatedAt);
  return results;
}

function browseFolderDialogWindows(initialDir) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ ok: false, error: 'Folder picker dialog is only supported on Windows.' });
      return;
    }
    const startDir = (initialDir && fs.existsSync(initialDir) ? initialDir : DEFAULT_STORAGE_DIR).replace(/'/g, "''");
    const psScript = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      '$dlg = New-Object System.Windows.Forms.FolderBrowserDialog;',
      "$dlg.Description = 'Select ComfyUI Motion Previs Studio Storage Folder (3D Models, Scenes & Renders)';",
      `$dlg.SelectedPath = '${startDir}';`,
      '$dlg.ShowNewFolderButton = $true;',
      'if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath }',
    ].join(' ');

    execFile(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { timeout: 120000 },
      (err, stdout) => {
        if (err) {
          resolve({ ok: false, cancelled: true });
          return;
        }
        const selected = String(stdout || '').trim();
        if (!selected) {
          resolve({ ok: true, cancelled: true, selectedPath: '' });
          return;
        }
        resolve({ ok: true, cancelled: false, selectedPath: path.resolve(selected) });
      }
    );
  });
}

function openFolderInExplorer(subKey) {
  const cfg = readStorageConfig();
  const { storageDir, subfolders } = ensureStorageDirectories(cfg.storageDir);
  const target = subKey && subfolders[subKey] ? subfolders[subKey] : storageDir;
  if (process.platform === 'win32') {
    execFile('explorer.exe', [target], () => {});
  }
  return { ok: true, openedPath: target };
}

function handleStudioStorageRequest(req, res) {
  const rawUrl = req.url || '';
  const parsedUrl = new URL(rawUrl, 'http://127.0.0.1:5173');
  const pathname = parsedUrl.pathname.replace(/\/+$/, '');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  if (pathname === '/api/studio-storage/status' && req.method === 'GET') {
    try {
      const status = getStudioStorageStatus();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(status));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  if (pathname === '/api/studio-storage/load-project' && req.method === 'GET') {
    try {
      const data = loadProjectFromDisk();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  if (pathname === '/api/studio-storage/list-models' && req.method === 'GET') {
    try {
      const items = listModelsOnDisk();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, items }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  if (pathname === '/api/studio-storage/model' && req.method === 'GET') {
    try {
      const id = parsedUrl.searchParams.get('id') || '';
      const found = loadModelFromDisk(id);
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Model not found on disk' }));
        return true;
      }
      res.writeHead(200, {
        'Content-Type': found.mimeType,
        'Content-Length': found.buffer.length,
      });
      res.end(found.buffer);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return true;
  }

  if (pathname === '/api/studio-storage/save-model' && req.method === 'POST') {
    const id = decodeURIComponent(req.headers['x-model-id'] || parsedUrl.searchParams.get('id') || '');
    const name = decodeURIComponent(req.headers['x-model-name'] || parsedUrl.searchParams.get('name') || id);
    const mimeType = req.headers['content-type'] || 'model/gltf-binary';
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const rawBuf = Buffer.concat(chunks);
        let modelBuffer = rawBuf;
        let finalId = id;
        let finalName = name;
        let finalMime = mimeType;

        if (mimeType.includes('application/json')) {
          const parsed = JSON.parse(rawBuf.toString('utf-8'));
          finalId = parsed.id || finalId;
          finalName = parsed.name || finalName;
          finalMime = parsed.mimeType || 'model/gltf-binary';
          const cleanB64 = String(parsed.base64 || '').replace(/^data:[^,]+,/, '');
          modelBuffer = Buffer.from(cleanB64, 'base64');
        }

        const saved = saveModelToDisk({
          id: finalId,
          name: finalName,
          buffer: modelBuffer,
          mimeType: finalMime,
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(saved));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return true;
  }

  if (req.method === 'POST') {
    let bodyStr = '';
    req.on('data', (chunk) => {
      bodyStr += chunk;
    });
    req.on('end', async () => {
      try {
        const body = bodyStr ? JSON.parse(bodyStr) : {};
        if (pathname === '/api/studio-storage/config') {
          const updated = updateStudioStorageConfig(body);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(updated));
          return;
        }
        if (pathname === '/api/studio-storage/browse') {
          const cfg = readStorageConfig();
          const result = await browseFolderDialogWindows(body.initialDir || cfg.storageDir);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
          return;
        }
        if (pathname === '/api/studio-storage/open-explorer') {
          const result = openFolderInExplorer(body.subfolder);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
          return;
        }
        if (pathname === '/api/studio-storage/save-project') {
          const result = saveProjectToDisk(body);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Unknown studio-storage endpoint' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return true;
  }

  return false;
}

module.exports = {
  DEFAULT_STORAGE_DIR,
  getActiveStorageDir,
  getStudioStorageStatus,
  updateStudioStorageConfig,
  saveProjectToDisk,
  loadProjectFromDisk,
  saveModelToDisk,
  loadModelFromDisk,
  listModelsOnDisk,
  handleStudioStorageRequest,
};

