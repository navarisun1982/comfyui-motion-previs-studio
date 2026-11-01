import type { Plugin } from 'vite';
import { createRequire } from 'module';
import http from 'http';
const require = createRequire(import.meta.url);

function attachComfyMiddleware(middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void }) {
  middlewares.use((req, res, next) => {
    const rawUrl = req.url || '';
    if (!rawUrl.startsWith('/api/comfy')) {
      next();
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const forwardPath = rawUrl.replace(/^\/api\/comfy/, '') || '/';
    const outHeaders: Record<string, any> = { ...req.headers };
    delete outHeaders['host'];
    outHeaders['host'] = '127.0.0.1:8188';
    outHeaders['origin'] = 'http://127.0.0.1:8188';
    outHeaders['referer'] = 'http://127.0.0.1:8188/';

    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: 8188,
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
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.destroy();
      }
    });

    req.pipe(proxyReq);
  });
}

function getAuthService() {
  try {
    const resolved = require.resolve('./openaiAuthService.cjs');
    delete require.cache[resolved];
  } catch {}
  return require('./openaiAuthService.cjs');
}

function getAppUpdateService() {
  try {
    const resolved = require.resolve('./appUpdateService.cjs');
    delete require.cache[resolved];
  } catch {}
  return require('./appUpdateService.cjs');
}

function attachLocalWorkflowMiddleware(middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void }) {
  const fs = require('fs');
  const path = require('path');
  middlewares.use((req, res, next) => {
    const rawUrl = req.url || '';
    if (rawUrl.startsWith('/api/comfy-glb-output')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      try {
        const parsedUrl = new URL(rawUrl, 'http://127.0.0.1:5173');
        const explicitPath = (parsedUrl.searchParams.get('path') || '').trim();
        const sinceMs = Number(parsedUrl.searchParams.get('sinceMs') || '0');
        const comfyOutputDirs = ['D:\\ComfyUI\\output\\3d', 'D:\\ComfyUI\\output', 'D:\\ComfyUI\\temp'];

        let targetFile = '';
        if (explicitPath && fs.existsSync(explicitPath)) {
          targetFile = explicitPath;
        } else {
          // Find the most recently modified .glb file across ComfyUI output directories
          let newestMtime = Math.max(0, sinceMs - 5000);
          const scanDir = (dir: string, depth = 0) => {
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
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err?.message || 'Failed to read generated .glb file' }));
      }
      return;
    }

    if (!rawUrl.startsWith('/api/local-workflow')) {
      next();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      const parsedUrl = new URL(rawUrl, 'http://127.0.0.1:5173');
      let filePath = (parsedUrl.searchParams.get('path') || '').trim();
      // Strip surrounding quotes if user used "Copy as path" in Windows Explorer
      filePath = filePath.replace(/^["']+|["']+$/g, '');
      if (filePath.toLowerCase().startsWith('file:///')) {
        filePath = decodeURIComponent(filePath.replace(/^file:\/\/\//i, ''));
      } else if (filePath.toLowerCase().startsWith('file://')) {
        filePath = decodeURIComponent(filePath.replace(/^file:\/\//i, ''));
      }
      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Local workflow file not found at: ${filePath}` }));
        return;
      }
      const resolved = path.resolve(filePath);
      const rawContent = fs.readFileSync(resolved, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(rawContent);
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err?.message || 'Failed to read local workflow file' }));
    }
  });
}

function attachAppUpdateMiddleware(middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void }) {
  middlewares.use(async (req, res, next) => {
    const rawUrl = req.url || '';
    const pathname = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

    if (!pathname.startsWith('/api/app-update')) {
      next();
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/app-update/check' && req.method === 'GET') {
      try {
        const fetchRemote = !rawUrl.includes('fetch=0');
        const result = await getAppUpdateService().checkAppUpdate({ fetchRemote });
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err: any) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      }
      return;
    }

    if (pathname === '/api/app-update/apply' && req.method === 'POST') {
      try {
        const result = await getAppUpdateService().applyAppUpdate({ isElectron: false });
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err: any) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      }
      return;
    }

    next();
  });
}

export function openaiAuthPlugin(): Plugin {
  return {
    name: 'openai-auth-plugin',
    configurePreviewServer(server) {
      attachComfyMiddleware(server.middlewares);
      attachLocalWorkflowMiddleware(server.middlewares);
      attachAppUpdateMiddleware(server.middlewares);
    },
    configureServer(server) {
      attachComfyMiddleware(server.middlewares);
      attachLocalWorkflowMiddleware(server.middlewares);
      attachAppUpdateMiddleware(server.middlewares);
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        const pathname = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

        if (pathname.startsWith('/api/openai')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }
        }

        // Status check
        if (pathname === '/api/openai/auth/status' && req.method === 'GET') {
          try {
            const status = await getAuthService().getAuthStatus();
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(JSON.stringify(status));
          } catch (err: any) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Login start
        if (pathname === '/api/openai/auth/login' && req.method === 'POST') {
          try {
            const loginInfo = await getAuthService().startBrowserLogin();
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(JSON.stringify(loginInfo));
          } catch (err: any) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Logout
        if (pathname === '/api/openai/auth/logout' && req.method === 'POST') {
          try {
            const result = getAuthService().logout();
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (err: any) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // Models list proxy
        if ((pathname === '/api/openai/models' || pathname === '/api/openai/v1/models') && req.method === 'GET') {
          try {
            const authHeader = (req.headers['authorization'] || '') as string;
            if (authHeader && authHeader.startsWith('Bearer sk-')) {
              const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim();
              const models = await getAuthService().fetchRemoteModels(apiKey);
              res.setHeader('Content-Type', 'application/json');
              res.writeHead(200);
              res.end(JSON.stringify(models));
            } else {
              const status = await getAuthService().getAuthStatus();
              const modelsData = {
                object: 'list',
                data: (status.availableModels || []).map((m: any) => ({
                  id: m.id,
                  object: 'model',
                  created: Date.now(),
                  owned_by: 'openai',
                })),
              };
              res.setHeader('Content-Type', 'application/json');
              res.writeHead(200);
              res.end(JSON.stringify(modelsData));
            }
          } catch (err: any) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(500);
            res.end(JSON.stringify({ error: { message: err.message } }));
          }
          return;
        }

        // Chat completions proxy
        if ((pathname === '/api/openai/chat/completions' || pathname === '/api/openai/v1/chat/completions') && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', chunk => {
            bodyStr += chunk;
          });
          req.on('end', async () => {
            try {
              const body = bodyStr ? JSON.parse(bodyStr) : {};
              const authHeader = (req.headers['authorization'] || '') as string;
              let completion;
              if (authHeader && authHeader.startsWith('Bearer sk-')) {
                const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim();
                completion = await getAuthService().proxyDirectChatCompletions(apiKey, body);
              } else {
                completion = await getAuthService().proxyChatCompletions(body);
              }
              res.setHeader('Content-Type', 'application/json');
              res.writeHead(200);
              res.end(JSON.stringify(completion));
            } catch (err: any) {
              res.setHeader('Content-Type', 'application/json');
              res.writeHead(500);
              res.end(JSON.stringify({ error: { message: err.message } }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

