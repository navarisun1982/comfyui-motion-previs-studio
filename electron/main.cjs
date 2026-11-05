const { app, BrowserWindow, Menu, nativeTheme, shell, session, screen, nativeImage, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let ipcHandlersRegistered = false;
function registerComfyIpcHandlers() {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  const getComfySyncService = () => {
    try {
      const resolved = require.resolve('../src/server/comfyWorkflowSyncService.cjs');
      delete require.cache[resolved];
    } catch {
      // ignore
    }
    return require('../src/server/comfyWorkflowSyncService.cjs');
  };

  ipcMain.handle('comfy:request', async (_event, options) => {
    return await getComfySyncService().comfyRequestDirect(options || {});
  });

  ipcMain.handle('comfy:upload-image', async (_event, options) => {
    return await getComfySyncService().comfyUploadImageDirect(options || {});
  });

  ipcMain.handle('comfy:sync-workflows', async (_event, options) => {
    return await getComfySyncService().syncWorkflowsToComfyUI(options || {});
  });

  ipcMain.handle('comfy:sync-status', async () => {
    return getComfySyncService().getComfyWorkflowSyncStatus();
  });

  ipcMain.handle('comfy:fetch-remote-workflow', async (_event, rawUrl) => {
    return await getComfySyncService().fetchRemoteWorkflowJson(rawUrl);
  });
}

const APP_TITLE = 'ComfyUI Motion Previs Studio';

// Set a unique Windows AppUserModelID so Windows 11 Taskbar displays our custom .ico
// instead of grouping under the generic electron.exe blue atom icon.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.comfyui.motion-previs-studio');
}

function resolveAppIconPath() {
  const candidates = [
    path.join(__dirname, '../public/logo.ico'),
    path.join(__dirname, '../dist/logo.ico'),
    path.join(__dirname, '../Assets/logo.ico'),
    path.join(__dirname, '../public/logo.png'),
    path.join(__dirname, '../Assets/logo.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

// Pin the userData directory to the pre-rename folder. Electron derives it from
// package.json productName/name, so renaming the package would otherwise start
// with an empty profile and silently orphan every saved shot in localStorage.
// S2 (project files) migrates this data out; until then, keep this pin.
app.setPath('userData', path.join(app.getPath('appData'), 'comfy-ai-director-studio'));

const WINDOW_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  const defaults = {
    width: 1480,
    height: 940,
    isMaximized: false,
  };

  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, 'utf-8'));
      if (typeof data.width === 'number' && typeof data.height === 'number') {
        // Validate coordinates against current display topology to prevent off-screen spawn
        let isValidPosition = false;
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          const displays = screen.getAllDisplays();
          isValidPosition = displays.some((d) => {
            const b = d.bounds;
            return (
              data.x >= b.x - 20 &&
              data.x < b.x + b.width - 100 &&
              data.y >= b.y - 20 &&
              data.y < b.y + b.height - 100
            );
          });
        }

        return {
          width: Math.max(1024, data.width),
          height: Math.max(680, data.height),
          x: isValidPosition ? data.x : undefined,
          y: isValidPosition ? data.y : undefined,
          isMaximized: Boolean(data.isMaximized),
        };
      }
    }
  } catch (err) {
    console.warn('[electron] Could not read window-state.json, using defaults:', err);
  }
  return defaults;
}

let saveStateTimer = null;
function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    const state = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    };
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[electron] Failed to save window state:', err);
  }
}

function scheduleSaveWindowState(win) {
  if (saveStateTimer) clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    saveWindowState(win);
  }, 400);
}

let mainWindow = null;
let localProxyServer = null;

function startLocalProxyServer() {
  if (localProxyServer) return;
  localProxyServer = http.createServer((req, res) => {
    // Add permissive CORS headers on all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const rawUrl = req.url || '/';
    const pathname = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

    if (rawUrl.startsWith('/api/comfy-glb-output')) {
      try {
        const parsedUrl = new URL(rawUrl, 'http://127.0.0.1:51731');
        const listMode = parsedUrl.searchParams.get('list') === '1';
        const explicitPath = (parsedUrl.searchParams.get('path') || '').trim();
        const sinceMs = Number(parsedUrl.searchParams.get('sinceMs') || '0');
        const comfyOutputDirs = ['D:\\ComfyUI\\output\\3d', 'D:\\ComfyUI\\output', 'D:\\ComfyUI\\temp'];

        if (listMode) {
          const items = [];
          const seen = new Set();
          const collectDir = (dir, depth = 0) => {
            if (depth > 2 || !fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                collectDir(full, depth + 1);
              } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
                const norm = full.toLowerCase();
                if (seen.has(norm)) continue;
                seen.add(norm);
                const stat = fs.statSync(full);
                items.push({
                  filename: entry.name,
                  path: full,
                  sizeBytes: stat.size,
                  mtimeMs: stat.mtimeMs,
                  downloadUrl: `http://127.0.0.1:51731/api/comfy-glb-output?path=${encodeURIComponent(full)}`,
                });
              }
            }
          };
          for (const d of ['D:\\ComfyUI\\output\\3d', 'D:\\ComfyUI\\output']) {
            collectDir(d, 0);
          }
          items.sort((a, b) => b.mtimeMs - a.mtimeMs);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ items }));
          return;
        }

        let targetFile = '';
        if (explicitPath && explicitPath.toLowerCase().endsWith('.glb') && fs.existsSync(explicitPath)) {
          targetFile = explicitPath;
        } else {
          let newestMtime = Math.max(0, sinceMs - 5000);
          const scanDir = (dir, depth = 0) => {
            if (depth > 2 || !fs.existsSync(dir)) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                scanDir(full, depth + 1);
              } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
                const stat = fs.statSync(full);
                if (stat.mtimeMs >= newestMtime) {
                  newestMtime = stat.mtimeMs;
                  targetFile = full;
                }
              }
            }
          };
          for (const d of comfyOutputDirs) {
            scanDir(d, 0);
          }
        }

        if (!targetFile || !fs.existsSync(targetFile)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No generated .glb file found in ComfyUI output directory yet.' }));
          return;
        }

        const buf = fs.readFileSync(targetFile);
        res.setHeader('X-Comfy-Glb-Path', encodeURIComponent(targetFile));
        res.writeHead(200, {
          'Content-Type': 'model/gltf-binary',
          'Content-Length': buf.length,
        });
        res.end(buf);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Failed to read generated .glb file' }));
      }
      return;
    }

    if (pathname.startsWith('/api/app-update')) {
      const appUpdateService = require('../src/server/appUpdateService.cjs');
      if (pathname === '/api/app-update/check' && req.method === 'GET') {
        const fetchRemote = !rawUrl.includes('fetch=0');
        appUpdateService
          .checkAppUpdate({ fetchRemote })
          .then((result) => {
            if (!res.headersSent) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            }
          })
          .catch((err) => {
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
        return;
      }
      if (pathname === '/api/app-update/apply' && req.method === 'POST') {
        appUpdateService
          .applyAppUpdate({ isElectron: true })
          .then((result) => {
            if (!res.headersSent) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            }
          })
          .catch((err) => {
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
        return;
      }
    }

    if (rawUrl.startsWith('/api/comfy-sync-workflows')) {
      const comfySyncService = require('../src/server/comfyWorkflowSyncService.cjs');
      if (req.method === 'GET') {
        try {
          const status = comfySyncService.getComfyWorkflowSyncStatus();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(status));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }
      if (req.method === 'POST') {
        let bodyStr = '';
        req.on('data', (chunk) => {
          bodyStr += chunk;
        });
        req.on('end', () => {
          const payload = bodyStr ? JSON.parse(bodyStr) : {};
          comfySyncService
            .syncWorkflowsToComfyUI(payload)
            .then((result) => {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify(result));
            })
            .catch((err) => {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            });
        });
        return;
      }
    }

    if (rawUrl.startsWith('/api/fetch-remote-workflow')) {
      const comfySyncService = require('../src/server/comfyWorkflowSyncService.cjs');
      try {
        const parsedUrl = new URL(rawUrl, 'http://127.0.0.1:51731');
        const target = (parsedUrl.searchParams.get('url') || '').trim();
        comfySyncService
          .fetchRemoteWorkflowJson(target)
          .then((result) => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
          })
          .catch((err) => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    if (rawUrl.startsWith('/api/local-workflow')) {
      try {
        const parsedUrl = new URL(rawUrl, 'http://127.0.0.1:51731');
        let filePath = (parsedUrl.searchParams.get('path') || '').trim();
        filePath = filePath.replace(/^["']+|["']+$/g, '');
        if (filePath.toLowerCase().startsWith('file:///')) {
          filePath = decodeURIComponent(filePath.replace(/^file:\/\/\//i, ''));
        } else if (filePath.toLowerCase().startsWith('file://')) {
          filePath = decodeURIComponent(filePath.replace(/^file:\/\//i, ''));
        }
        if (!filePath || !filePath.toLowerCase().endsWith('.json') || !fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Local workflow JSON file not found at: ${filePath}` }));
          return;
        }
        const resolved = path.resolve(filePath);
        const rawContent = fs.readFileSync(resolved, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(rawContent);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Failed to read local workflow file' }));
      }
      return;
    }

    if (
      rawUrl.startsWith('/api/comfy/') ||
      rawUrl === '/api/comfy' ||
      rawUrl.startsWith('/api/comfy?')
    ) {
      const comfySyncService = require('../src/server/comfyWorkflowSyncService.cjs');
      const forwardPath = rawUrl.replace(/^\/api\/comfy/, '') || '/';
      comfySyncService.forwardComfyRequest(req, res, forwardPath);
      return;
    }

    let targetHost = '127.0.0.1';
    let targetPort = 8188;
    let forwardPath = rawUrl;

    if (rawUrl.startsWith('/api/ollama')) {
      targetPort = 11434;
      forwardPath = rawUrl.replace(/^\/api\/ollama/, '') || '/';
    } else if (rawUrl.startsWith('/api/llamacpp')) {
      targetPort = 8080;
      forwardPath = rawUrl.replace(/^\/api\/llamacpp/, '') || '/';
    } else if (rawUrl.startsWith('/api/lmstudio')) {
      targetPort = 1234;
      forwardPath = rawUrl.replace(/^\/api\/lmstudio/, '') || '/';
    } else {
      // Any other direct route goes through ComfyUI multi-port forwarder
      const comfySyncService = require('../src/server/comfyWorkflowSyncService.cjs');
      comfySyncService.forwardComfyRequest(req, res, forwardPath);
      return;
    }

    const outHeaders = { ...req.headers };
    for (const k of Object.keys(outHeaders)) {
      if (/^(host|origin|referer)$/i.test(k)) delete outHeaders[k];
    }
    outHeaders['host'] = `${targetHost}:${targetPort}`;
    outHeaders['origin'] = `http://${targetHost}:${targetPort}`;
    outHeaders['referer'] = `http://${targetHost}:${targetPort}/`;

    const proxyReq = http.request(
      {
        hostname: targetHost,
        port: targetPort,
        path: forwardPath,
        method: req.method,
        headers: outHeaders,
      },
      (proxyRes) => {
        const cleanHeaders = {};
        for (const [k, v] of Object.entries(proxyRes.headers || {})) {
          if (!/^access-control-allow-/i.test(k)) {
            cleanHeaders[k] = v;
          }
        }
        cleanHeaders['Access-Control-Allow-Origin'] = '*';
        cleanHeaders['Access-Control-Allow-Headers'] = '*';
        cleanHeaders['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        res.writeHead(proxyRes.statusCode || 200, cleanHeaders);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.destroy();
      }
    });

    req.pipe(proxyReq);
  });

  localProxyServer.on('error', () => {
    // Port 51731 may already be bound by another instance
  });

  localProxyServer.listen(51731, '127.0.0.1');
}

nativeTheme.themeSource = 'dark';

function createWindow() {
  const windowState = loadWindowState();
  const iconPath = resolveAppIconPath();
  const appIcon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 1024,
    minHeight: 680,
    title: APP_TITLE,
    icon: appIcon || iconPath,
    backgroundColor: '#08090C',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  if (appIcon && !appIcon.isEmpty()) {
    mainWindow.setIcon(appIcon);
  }

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.on('resize', () => scheduleSaveWindowState(mainWindow));
  mainWindow.on('move', () => scheduleSaveWindowState(mainWindow));
  mainWindow.on('close', () => saveWindowState(mainWindow));

  Menu.setApplicationMenu(null);

  // Prevent uncontrolled blank white child windows from window.open()
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Register F12 / DevTools, and F5 / Ctrl+R reload shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.key === 'F12' && input.type === 'keyDown') || 
        (input.control && input.shift && input.key.toLowerCase() === 'i' && input.type === 'keyDown')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if ((input.key === 'F5' && input.type === 'keyDown') ||
        (input.control && input.key.toLowerCase() === 'r' && input.type === 'keyDown')) {
      mainWindow.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
  });

  const devUrl = 'http://localhost:5173';
  const prodPath = path.join(__dirname, '../dist/index.html');

  const checkDevServer = () => {
    return new Promise((resolve) => {
      const req = http.get(devUrl, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
  };

  let lastDistMtimeMs = 0;
  try {
    if (fs.existsSync(prodPath)) {
      lastDistMtimeMs = fs.statSync(prodPath).mtimeMs;
    }
  } catch {
    // ignore
  }

  const distPollInterval = setInterval(() => {
    try {
      if (!mainWindow || mainWindow.isDestroyed() || !fs.existsSync(prodPath)) return;
      const currentMtime = fs.statSync(prodPath).mtimeMs;
      if (lastDistMtimeMs > 0 && currentMtime > lastDistMtimeMs + 50) {
        lastDistMtimeMs = currentMtime;
        mainWindow.webContents.reloadIgnoringCache();
      } else if (lastDistMtimeMs === 0) {
        lastDistMtimeMs = currentMtime;
      }
    } catch {
      // ignore transient stat errors during vite build
    }
  }, 1500);

  mainWindow.webContents.on('did-fail-load', (_event, _errorCode, _errorDescription, validatedURL) => {
    if (validatedURL && validatedURL.startsWith(devUrl) && fs.existsSync(prodPath)) {
      mainWindow.loadFile(prodPath);
    }
  });

  checkDevServer().then((isDevRunning) => {
    if (isDevRunning) {
      mainWindow.loadURL(devUrl);
    } else if (fs.existsSync(prodPath)) {
      mainWindow.loadFile(prodPath);
    } else {
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <body style="background:#08090C;color:#f3f4f6;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;">
          <h2 style="color:#60a5fa;margin-bottom:8px;">${APP_TITLE}</h2>
          <p style="color:#9ca3af;margin-bottom:16px;">Production build not found. Please run <code>npm run build</code> first.</p>
        </body>
      `));
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    clearInterval(distPollInterval);
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerComfyIpcHandlers();
  const localDaemonUrls = [
    'http://127.0.0.1:8188/*',
    'ws://127.0.0.1:8188/*',
    'http://localhost:8188/*',
    'ws://localhost:8188/*',
    'http://127.0.0.1:8000/*',
    'ws://127.0.0.1:8000/*',
    'http://localhost:8000/*',
    'ws://localhost:8000/*',
    'http://127.0.0.1:51731/*',
    'http://127.0.0.1:11434/*',
    'http://localhost:11434/*',
    'http://127.0.0.1:8080/*',
    'http://localhost:8080/*',
    'http://127.0.0.1:1234/*',
    'http://localhost:1234/*',
  ];

  // Prevent ComfyUI (8188 / 8000) and Ollama (11434) from rejecting requests with HTTP 403 due to mismatched Origin headers
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: localDaemonUrls },
    (details, callback) => {
      const headers = {};
      for (const [k, v] of Object.entries(details.requestHeaders || {})) {
        if (!/^(origin|referer)$/i.test(k)) {
          headers[k] = v;
        }
      }
      if (details.url.includes(':8188')) {
        headers['Origin'] = 'http://127.0.0.1:8188';
        headers['Referer'] = 'http://127.0.0.1:8188/';
      } else if (details.url.includes(':8000')) {
        headers['Origin'] = 'http://127.0.0.1:8000';
        headers['Referer'] = 'http://127.0.0.1:8000/';
      } else {
        headers['Origin'] = 'http://127.0.0.1';
      }
      callback({ requestHeaders: headers });
    }
  );

  // Inject single-value CORS headers for local previs & reasoning daemons (strip duplicates first!)
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: localDaemonUrls },
    (details, callback) => {
      const cleanHeaders = {};
      for (const [k, v] of Object.entries(details.responseHeaders || {})) {
        if (!/^access-control-allow-/i.test(k)) {
          cleanHeaders[k] = v;
        }
      }
      cleanHeaders['Access-Control-Allow-Origin'] = ['*'];
      cleanHeaders['Access-Control-Allow-Headers'] = ['*'];
      cleanHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS, PUT, DELETE'];
      cleanHeaders['Access-Control-Expose-Headers'] = ['*'];
      callback({
        responseHeaders: cleanHeaders,
      });
    }
  );

  startLocalProxyServer();
  try {
    const comfySyncService = require('../src/server/comfyWorkflowSyncService.cjs');
    comfySyncService.syncWorkflowsToComfyUI({ overwrite: false }).catch(() => {});
  } catch {
    // ignore
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startLocalProxyServer();
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
