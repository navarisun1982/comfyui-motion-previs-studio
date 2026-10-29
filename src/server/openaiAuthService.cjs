const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const CALLBACK_PORT = 1455;

function getAuthFilePath() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const codexPath = path.join(home, '.codex', 'auth.json');
  const cozyPath = path.join(home, '.config', 'cozyclay', 'codex-auth.json');
  if (fs.existsSync(codexPath)) return codexPath;
  if (fs.existsSync(cozyPath)) return cozyPath;
  return codexPath;
}

function loadTokens() {
  const p = getAuthFilePath();
  try {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return data.tokens || null;
    }
  } catch (err) {
    console.warn('[OpenAI Auth] Failed to read auth file:', err.message);
  }
  return null;
}

function saveTokens(tokens) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const codexDir = path.join(home, '.codex');
  const cozyDir = path.join(home, '.config', 'cozyclay');

  const targets = [
    { dir: codexDir, file: path.join(codexDir, 'auth.json') },
    { dir: cozyDir, file: path.join(cozyDir, 'codex-auth.json') }
  ];

  for (const t of targets) {
    try {
      if (!fs.existsSync(t.dir)) fs.mkdirSync(t.dir, { recursive: true });
      let existing = {};
      if (fs.existsSync(t.file)) {
        try { existing = JSON.parse(fs.readFileSync(t.file, 'utf8')); } catch { existing = {}; }
      }
      existing.auth_mode = 'chatgpt';
      existing.tokens = tokens;
      existing.last_refresh = new Date().toISOString();
      fs.writeFileSync(t.file, JSON.stringify(existing, null, 2), 'utf8');
    } catch (err) {
      console.warn(`[OpenAI Auth] Could not save to ${t.file}:`, err.message);
    }
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    }
  } catch {
    // ignore
  }
  return null;
}

async function refreshTokens(refreshToken) {
  if (!refreshToken) throw new Error('No refresh token available');
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken
    });
    const body = params.toString();

    const req = https.request('https://auth.openai.com/oauth/token', {
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'OpenAI/Codex-CLI'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const newTokens = JSON.parse(data);
            const current = loadTokens() || {};
            const merged = { ...current, ...newTokens };
            saveTokens(merged);
            resolve(merged);
          } catch (e) {
            reject(new Error('Invalid JSON from token refresh: ' + e.message));
          }
        } else {
          reject(new Error(`Token refresh failed (HTTP ${res.statusCode}): ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const AVAILABLE_MODELS = [
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol (Flagship Reasoning · Recommended)' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (Next-Gen Frontier)' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna (Fast Reasoning)' }
];

async function getAuthStatus() {
  let tokens = loadTokens();
  if (!tokens || !tokens.access_token) {
    return {
      authenticated: false,
      availableModels: AVAILABLE_MODELS
    };
  }

  let accessPayload = decodeJwtPayload(tokens.access_token);
  const nowMs = Date.now();
  const expMs = accessPayload?.exp ? accessPayload.exp * 1000 : 0;

  // If token expires in less than 5 minutes, refresh it automatically
  if (tokens.refresh_token && expMs > 0 && expMs - nowMs < 5 * 60 * 1000) {
    try {
      tokens = await refreshTokens(tokens.refresh_token);
      accessPayload = decodeJwtPayload(tokens.access_token);
    } catch (err) {
      console.warn('[OpenAI Auth] Auto-refresh failed:', err.message);
    }
  }

  const idPayload = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
  const profile = accessPayload?.['https://api.openai.com/profile'] || {};
  const authInfo = accessPayload?.['https://api.openai.com/auth'] || {};

  const email = profile.email || idPayload?.email || accessPayload?.email || 'ChatGPT Subscriber';
  const name = profile.name || idPayload?.name || 'OpenAI User';
  const plan = authInfo.chatgpt_plan_type || 'prolite';
  const accountId = authInfo.chatgpt_account_id || '';

  return {
    authenticated: true,
    email,
    name,
    plan,
    accountId,
    expiresAt: accessPayload?.exp ? accessPayload.exp * 1000 : 0,
    activeModel: 'gpt-5.6-sol',
    availableModels: AVAILABLE_MODELS
  };
}

let activeAuthServer = null;
let currentPkce = null;

function closeExistingServer() {
  return new Promise((resolve) => {
    if (!activeAuthServer) return resolve();
    try {
      activeAuthServer.close(() => {
        activeAuthServer = null;
        resolve();
      });
      setTimeout(() => {
        activeAuthServer = null;
        resolve();
      }, 500);
    } catch {
      activeAuthServer = null;
      resolve();
    }
  });
}

function startBrowserLogin() {
  return new Promise(async (resolve, reject) => {
    // If a server is already listening, safely close it and wait for port release
    await closeExistingServer();

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    currentPkce = { codeVerifier, state };

    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
        if (parsedUrl.pathname === '/auth/callback') {
          const code = parsedUrl.searchParams.get('code');
          const incomingState = parsedUrl.searchParams.get('state');

          if (!code || incomingState !== currentPkce?.state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h2>Authentication Failed</h2><p>State mismatch or missing authorization code.</p>');
            return;
          }

          // Exchange authorization code for tokens
          try {
            const tokenParams = new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: CLIENT_ID,
              code,
              redirect_uri: REDIRECT_URI,
              code_verifier: currentPkce.codeVerifier
            });
            const body = tokenParams.toString();

            const tokenReq = https.request('https://auth.openai.com/oauth/token', {
              method: 'POST',
              rejectUnauthorized: false,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'OpenAI/Codex-CLI'
              }
            }, (tokenRes) => {
              let tokenData = '';
              tokenRes.on('data', chunk => tokenData += chunk);
              tokenRes.on('end', () => {
                if (tokenRes.statusCode === 200) {
                  try {
                    const tokens = JSON.parse(tokenData);
                    saveTokens(tokens);

                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <title>ComfyUI Motion Previs Studio - Authentication</title>
                        <meta charset="utf-8">
                        <style>
                          body { background: #08090C; color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                          .card { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 16px; padding: 40px 48px; text-align: center; max-width: 440px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
                          .badge { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #10b981; font-size: 32px; margin-bottom: 20px; font-weight: bold; }
                          h1 { font-size: 20px; margin: 0 0 10px 0; color: #fff; font-weight: 600; }
                          p { color: #9ca3af; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0; }
                          .btn { display: inline-block; background: #2563eb; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 500; cursor: pointer; border: none; }
                          .btn:hover { background: #1d4ed8; }
                        </style>
                      </head>
                      <body>
                        <div class="card">
                          <div class="badge">✓</div>
                          <h1>Signed In Successfully</h1>
                          <p>Your ChatGPT account is now connected to <strong>ComfyUI Motion Previs Studio</strong>. You can close this tab and return to the studio.</p>
                          <button onclick="window.close()" class="btn">Close Window</button>
                        </div>
                        <script>setTimeout(() => window.close(), 3000);</script>
                      </body>
                      </html>
                    `);
                  } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error parsing token response: ' + e.message);
                  }
                } else {
                  res.writeHead(tokenRes.statusCode, { 'Content-Type': 'text/plain' });
                  res.end(`Token exchange failed (HTTP ${tokenRes.statusCode}): ${tokenData}`);
                }

                // Cleanup server after request completes
                setTimeout(() => {
                  try { server.close(); } catch {}
                  activeAuthServer = null;
                }, 1000);
              });
            });

            tokenReq.on('error', (err) => {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Token request error: ' + err.message);
            });
            tokenReq.write(body);
            tokenReq.end();

          } catch (exchangeErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('OAuth Exchange Exception: ' + exchangeErr.message);
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error: ' + err.message);
      }
    });

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(CALLBACK_PORT, () => {
      activeAuthServer = server;
      const authorizeUrl =
        'https://auth.openai.com/oauth/authorize?' +
        new URLSearchParams({
          response_type: 'code',
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          scope: 'openid profile email offline_access api.connectors.read api.connectors.invoke',
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256'
        }).toString();

      resolve({
        authorizeUrl,
        state
      });
    });

    // Auto-timeout login server after 5 minutes if unused
    setTimeout(() => {
      if (activeAuthServer === server) {
        try { server.close(); } catch {}
        activeAuthServer = null;
      }
    }, 5 * 60 * 1000);
  });
}

function logout() {
  const p = getAuthFilePath();
  try {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      data.tokens = null;
      data.auth_mode = 'none';
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('[OpenAI Auth] Logout file update error:', err.message);
  }
  return { success: true };
}

async function proxyChatCompletions(reqBody) {
  let tokens = loadTokens();
  if (!tokens || !tokens.access_token) {
    throw new Error('Not signed in to OpenAI. Please sign in via browser first.');
  }

  let accessPayload = decodeJwtPayload(tokens.access_token);
  const nowMs = Date.now();
  const expMs = accessPayload?.exp ? accessPayload.exp * 1000 : 0;

  // Refresh if needed
  if (tokens.refresh_token && expMs > 0 && expMs - nowMs < 2 * 60 * 1000) {
    tokens = await refreshTokens(tokens.refresh_token);
    accessPayload = decodeJwtPayload(tokens.access_token);
  }

  const accountId = accessPayload?.['https://api.openai.com/auth']?.chatgpt_account_id;
  const model = reqBody.model || 'gpt-5.6-sol';

  // Format messages into Codex input items
  const messages = Array.isArray(reqBody.messages) ? reqBody.messages : [];
  const input = messages.map(m => {
    let content = m.content;
    if (Array.isArray(content)) {
      // Vision or structured content
      content = content.map(part => {
        if (part.type === 'text') return part.text;
        if (part.type === 'image_url') return `[Image: ${part.image_url?.url?.slice(0, 50)}...]`;
        return '';
      }).join('\n');
    } else if (typeof content !== 'string') {
      content = JSON.stringify(content);
    }
    return {
      role: m.role || 'user',
      content: content || ''
    };
  });

  const payload = JSON.stringify({
    model,
    store: false,
    stream: true,
    input
  });

  return new Promise((resolve, reject) => {
    const req = https.request('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'ChatGPT-Account-ID': accountId,
        'Content-Type': 'application/json',
        'User-Agent': 'OpenAI/Codex-CLI'
      }
    }, (res) => {
      let rawChunks = [];

      res.on('data', chunk => {
        rawChunks.push(chunk);
      });

      res.on('end', () => {
        const rawData = Buffer.concat(rawChunks).toString('utf-8');

        if (res.statusCode === 200) {
          let finalText = '';

          // 1. Primary: Extract from response.completed event (canonical complete text)
          const lines = rawData.split(/\r?\n/);
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (!dataStr || dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.type === 'response.completed' && Array.isArray(parsed.response?.output)) {
                  for (let j = parsed.response.output.length - 1; j >= 0; j--) {
                    const out = parsed.response.output[j];
                    if (out.type === 'message' && Array.isArray(out.content)) {
                      for (const c of out.content) {
                        if (c.type === 'output_text' && typeof c.text === 'string' && c.text) {
                          finalText = c.text;
                          break;
                        }
                      }
                    }
                    if (finalText) break;
                  }
                }
              } catch {}
              if (finalText) break;
            }
          }

          // 2. Secondary: Assemble from response.output_text.delta events without trimming delta content
          if (!finalText) {
            let deltas = '';
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (!dataStr || dataStr.trim() === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(dataStr);
                  if (parsed.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
                    deltas += parsed.delta;
                  }
                } catch {}
              }
            }
            if (deltas) {
              finalText = deltas;
            }
          }

          // 3. Fallback: Parse regex safely with proper string unescaping
          if (!finalText) {
            const match = rawData.match(/"type":\s*"output_text",\s*"text":\s*"((?:[^"\\]|\\.)*)"/);
            if (match) {
              try {
                finalText = JSON.parse(`"${match[1]}"`);
              } catch {
                finalText = match[1];
              }
            }
          }

          resolve({
            id: 'chatcmpl-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: finalText
                },
                finish_reason: 'stop'
              }
            ]
          });
        } else {
          try {
            const errJson = JSON.parse(rawData);
            reject(new Error(errJson.detail || errJson.error?.message || `ChatGPT Error HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`ChatGPT Error HTTP ${res.statusCode}: ${rawData.slice(0, 200)}`));
          }
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function fetchRemoteModels(apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'OpenAI/Codex-CLI'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse models response: ${data.slice(0, 100)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function proxyDirectChatCompletions(apiKey, reqBody) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(reqBody);
    const req = https.request('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'OpenAI/Codex-CLI'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error?.message || `OpenAI API error HTTP ${res.statusCode}`));
          }
        } catch {
          reject(new Error(`OpenAI API error HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = {
  getAuthStatus,
  startBrowserLogin,
  refreshTokens,
  logout,
  proxyChatCompletions,
  proxyDirectChatCompletions,
  fetchRemoteModels,
  AVAILABLE_MODELS
};

