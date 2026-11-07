import type { Plugin } from 'vite';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function getComfySyncService() {
  try {
    const resolved = require.resolve('./comfyWorkflowSyncService.cjs');
    delete require.cache[resolved];
  } catch {}
  return require('./comfyWorkflowSyncService.cjs');
}

function getStudioStorageService() {
  try {
    const resolved = require.resolve('./studioStorageService.cjs');
    delete require.cache[resolved];
  } catch {}
  return require('./studioStorageService.cjs');
}

function resolveSafeCorsOrigin(req: any): string {
  const origin = String(req?.headers?.origin || '').trim();
  if (!origin) return 'http://127.0.0.1:5173';
  if (
    origin === 'null' ||
    origin.startsWith('file://') ||
    origin.startsWith('app://') ||
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)
  ) {
    return origin;
  }
  return 'http://127.0.0.1:5173';
}

function isAllowedGlbFilePath(candidatePath: string, pathMod: any): boolean {
  if (!candidatePath || candidatePath.includes('\0')) return false;
  const resolved = pathMod.resolve(candidatePath).replace(/\\/g, '/').toLowerCase();
  if (!resolved.endsWith('.glb') && !resolved.endsWith('.gltf')) return false;
  const workspaceRoot = pathMod.resolve(process.cwd()).replace(/\\/g, '/').toLowerCase();
  let customStorageRoot = '';
  try {
    customStorageRoot = pathMod
      .resolve(getStudioStorageService().getActiveStorageDir())
      .replace(/\\/g, '/')
      .toLowerCase();
  } catch {}
  const allowedRoots = [
    'd:/comfyui/output',
    'd:/comfyui/temp',
    'd:/comfyui/input',
    workspaceRoot,
    ...(customStorageRoot ? [customStorageRoot] : []),
  ];
  return allowedRoots.some((root) => resolved === root || resolved.startsWith(root + '/'));
}

function isValidComfyWorkflowJsonString(rawContent: string): boolean {
  try {
    const parsed = JSON.parse(rawContent);
    if (!parsed || typeof parsed !== 'object') return false;
    if (Array.isArray((parsed as any).nodes)) return true;
    const values = Object.values(parsed as Record<string, any>);
    return values.some(
      (v) => v && typeof v === 'object' && typeof (v as any).class_type === 'string'
    );
  } catch {
    return false;
  }
}

function attachComfyMiddleware(middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void }) {
  middlewares.use((req, res, next) => {
    const rawUrl = req.url || '';
    if (
      !rawUrl.startsWith('/api/comfy/') &&
      rawUrl !== '/api/comfy' &&
      !rawUrl.startsWith('/api/comfy?')
    ) {
      next();
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': resolveSafeCorsOrigin(req),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      res.end();
      return;
    }

    const forwardPath = rawUrl.replace(/^\/api\/comfy/, '') || '/';
    getComfySyncService().forwardComfyRequest(req, res, forwardPath);
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
      res.setHeader('Access-Control-Allow-Origin', resolveSafeCorsOrigin(req));
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      try {
        const parsedUrl = new URL(rawUrl, 'http://127.0.0.1:5173');
        const listMode = parsedUrl.searchParams.get('list') === '1';
        const explicitPath = (parsedUrl.searchParams.get('path') || '').trim();
        const sinceMs = Number(parsedUrl.searchParams.get('sinceMs') || '0');
        const comfyOutputDirs = ['D:\\ComfyUI\\output\\3d', 'D:\\ComfyUI\\output', 'D:\\ComfyUI\\temp'];

        if (listMode) {
          const items: Array<{
            filename: string;
            path: string;
            sizeBytes: number;
            mtimeMs: number;
            downloadUrl: string;
          }> = [];
          const seen = new Set<string>();
          const collectDir = (dir: string, depth = 0) => {
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
                  downloadUrl: `/api/comfy-glb-output?path=${encodeURIComponent(full)}`,
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
        if (explicitPath) {
          if (!isAllowedGlbFilePath(explicitPath, path)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden: .glb path must reside in ComfyUI output or project workspace.' }));
            return;
          }
          if (fs.existsSync(explicitPath)) {
            targetFile = path.resolve(explicitPath);
          }
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

    if (rawUrl.startsWith('/api/comfy-sync-workflows')) {
      res.setHeader('Access-Control-Allow-Origin', resolveSafeCorsOrigin(req));
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === 'GET') {
        try {
          const status = getComfySyncService().getComfyWorkflowSyncStatus();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(status));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err?.message || 'Failed to read sync status' }));
        }
        return;
      }
      if (req.method === 'POST') {
        let bodyStr = '';
        req.on('data', (chunk: any) => {
          bodyStr += chunk;
        });
        req.on('end', async () => {
          try {
            const payload = bodyStr ? JSON.parse(bodyStr) : {};
            const result = await getComfySyncService().syncWorkflowsToComfyUI(payload);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Failed to sync workflows' }));
          }
        });
        return;
      }
    }

    if (rawUrl.startsWith('/api/fetch-remote-workflow')) {
      res.setHeader('Access-Control-Allow-Origin', resolveSafeCorsOrigin(req));
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      try {
        const parsedUrl = new URL(rawUrl, 'http://127.0.0.1:5173');
        const target = (parsedUrl.searchParams.get('url') || '').trim();
        getComfySyncService()
          .fetchRemoteWorkflowJson(target)
          .then((result: any) => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
          })
          .catch((err: any) => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Failed to fetch remote workflow' }));
          });
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err?.message || 'Invalid URL' }));
      }
      return;
    }

    if (!rawUrl.startsWith('/api/local-workflow')) {
      next();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', resolveSafeCorsOrigin(req));
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
      if (!filePath || filePath.includes('\0') || !filePath.toLowerCase().endsWith('.json') || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Local workflow JSON file not found at: ${filePath}` }));
        return;
      }
      const resolved = path.resolve(filePath);
      const stat = fs.statSync(resolved);
      if (!stat.isFile() || stat.size > 15 * 1024 * 1024) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid workflow file.' }));
        return;
      }
      const rawContent = fs.readFileSync(resolved, 'utf-8');
      if (!isValidComfyWorkflowJsonString(rawContent)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: Target file is not a valid ComfyUI workflow JSON.' }));
        return;
      }
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

    res.setHeader('Access-Control-Allow-Origin', resolveSafeCorsOrigin(req));
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

function attachStudioStorageMiddleware(middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void }) {
  middlewares.use((req, res, next) => {
    const rawUrl = req.url || '';
    if (!rawUrl.startsWith('/api/studio-storage')) {
      next();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', resolveSafeCorsOrigin(req));
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Model-Id, X-Model-Name');
    const handled = getStudioStorageService().handleStudioStorageRequest(req, res);
    if (!handled) {
      next();
    }
  });
}

export function openaiAuthPlugin(): Plugin {
  return {
    name: 'openai-auth-plugin',
    configurePreviewServer(server) {
      attachComfyMiddleware(server.middlewares);
      attachLocalWorkflowMiddleware(server.middlewares);
      attachAppUpdateMiddleware(server.middlewares);
      attachStudioStorageMiddleware(server.middlewares);
    },
    configureServer(server) {
      attachComfyMiddleware(server.middlewares);
      attachLocalWorkflowMiddleware(server.middlewares);
      attachAppUpdateMiddleware(server.middlewares);
      attachStudioStorageMiddleware(server.middlewares);
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        const pathname = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

        if (pathname.startsWith('/api/openai')) {
          res.setHeader('Access-Control-Allow-Origin', resolveSafeCorsOrigin(req));
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

