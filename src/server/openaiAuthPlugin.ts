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

export function openaiAuthPlugin(): Plugin {
  return {
    name: 'openai-auth-plugin',
    configurePreviewServer(server) {
      attachComfyMiddleware(server.middlewares);
    },
    configureServer(server) {
      attachComfyMiddleware(server.middlewares);
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

