const { app, BrowserWindow, Menu, nativeTheme } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;

nativeTheme.themeSource = 'dark';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: 'AI Director Studio · Direct the Shot, Not the Prompt',
    backgroundColor: '#08090C',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allows direct local media streaming and ComfyUI websocket
    },
  });

  Menu.setApplicationMenu(null);

  // Register F12 and Ctrl+Shift+I shortcut to toggle Chromium DevTools if needed
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.key === 'F12' && input.type === 'keyDown') || 
        (input.control && input.shift && input.key.toLowerCase() === 'i' && input.type === 'keyDown')) {
      mainWindow.webContents.toggleDevTools();
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

  const fs = require('fs');
  checkDevServer().then((isDevRunning) => {
    if (isDevRunning) {
      mainWindow.loadURL(devUrl);
    } else if (fs.existsSync(prodPath)) {
      mainWindow.loadFile(prodPath);
    } else {
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <body style="background:#08090C;color:#f3f4f6;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;">
          <h2 style="color:#60a5fa;margin-bottom:8px;">AI Director Studio</h2>
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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
