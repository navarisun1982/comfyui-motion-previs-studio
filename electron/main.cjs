const { app, BrowserWindow, Menu, nativeTheme, shell, session, screen } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const APP_TITLE = 'ComfyUI Motion Previs Studio';

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

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const rawUrl = req.url || '/';
    let targetHost = '127.0.0.1';
    let targetPort = 8188;
    let forwardPath = rawUrl;

    if (rawUrl.startsWith('/api/comfy')) {
      forwardPath = rawUrl.replace(/^\/api\/comfy/, '') || '/';
    } else if (rawUrl.startsWith('/api/ollama')) {
      targetPort = 11434;
      forwardPath = rawUrl.replace(/^\/api\/ollama/, '') || '/';
    } else if (rawUrl.startsWith('/api/llamacpp')) {
      targetPort = 8080;
      forwardPath = rawUrl.replace(/^\/api\/llamacpp/, '') || '/';
    }

    const outHeaders = { ...req.headers };
    delete outHeaders['host'];
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
        const resHeaders = { ...proxyRes.headers };
        resHeaders['access-control-allow-origin'] = '*';
        resHeaders['access-control-allow-headers'] = '*';
        resHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        res.writeHead(proxyRes.statusCode || 200, resHeaders);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
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

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 1024,
    minHeight: 680,
    title: APP_TITLE,
    backgroundColor: '#08090C',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

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

  const distDir = path.join(__dirname, '../dist');
  let reloadTimeout = null;

  if (fs.existsSync(distDir)) {
    try {
      fs.watch(distDir, { recursive: true }, () => {
        if (reloadTimeout) clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed() && fs.existsSync(prodPath)) {
            mainWindow.webContents.reloadIgnoringCache();
          }
        }, 1200);
      });
    } catch {
      // ignore
    }
  }

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
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const localDaemonUrls = [
    'http://127.0.0.1:8188/*',
    'ws://127.0.0.1:8188/*',
    'http://localhost:8188/*',
    'http://127.0.0.1:11434/*',
    'http://localhost:11434/*',
    'http://127.0.0.1:8080/*',
    'http://localhost:8080/*',
  ];

  // Prevent ComfyUI (8188) and Ollama (11434) from rejecting requests with HTTP 403 due to mismatched Origin headers
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: localDaemonUrls },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      if (details.url.includes(':8188')) {
        headers['Origin'] = 'http://127.0.0.1:8188';
        headers['Referer'] = 'http://127.0.0.1:8188/';
      } else if (!headers['Origin'] || headers['Origin'] === 'null' || headers['Origin'].startsWith('file:')) {
        headers['Origin'] = 'http://127.0.0.1';
      }
      callback({ requestHeaders: headers });
    }
  );

  // Inject CORS headers for local previs & reasoning daemons (ComfyUI, Ollama, llama.cpp)
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: localDaemonUrls },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*'],
          'Access-Control-Allow-Headers': ['*'],
          'Access-Control-Allow-Methods': ['GET, POST, OPTIONS, PUT, DELETE'],
        },
      });
    }
  );

  startLocalProxyServer();
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
