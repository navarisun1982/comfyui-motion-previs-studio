// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { resolveLocalApiUrl, ELECTRON_LOCAL_API_ORIGIN } from '../src/services/localApiBase';
import { resolveWireUrl } from '../src/services/objectReasoner';
import { openaiAuthPlugin } from '../src/server/openaiAuthPlugin';

const requireCjs = createRequire(import.meta.url);

describe('Unit 4 (P0-C): Electron / Preview Server Parity, Cache Preservation & Security Hardening', () => {
  const origAuthFileEnv = process.env.CMPVS_OPENAI_AUTH_FILE;
  let tempAuthFile = '';

  beforeEach(() => {
    tempAuthFile = path.join(
      os.tmpdir(),
      `cmpvs_unit4_auth_${Date.now()}_${Math.random().toString(16).slice(2)}.json`
    );
    process.env.CMPVS_OPENAI_AUTH_FILE = tempAuthFile;
  });

  afterEach(() => {
    if (origAuthFileEnv === undefined) {
      delete process.env.CMPVS_OPENAI_AUTH_FILE;
    } else {
      process.env.CMPVS_OPENAI_AUTH_FILE = origAuthFileEnv;
    }
    try {
      if (tempAuthFile && fs.existsSync(tempAuthFile)) {
        fs.unlinkSync(tempAuthFile);
      }
    } catch {
      // ignore
    }
  });

  it('resolves /api/* URLs to http://127.0.0.1:51731 under file:// protocol and relative under http://', () => {
    const origLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { protocol: 'file:', origin: 'null', port: '', href: 'file:///C:/app/dist/index.html' },
      configurable: true,
    });
    try {
      expect(resolveLocalApiUrl('/api/openai/auth/status')).toBe(
        `${ELECTRON_LOCAL_API_ORIGIN}/api/openai/auth/status`
      );
      expect(resolveLocalApiUrl('/api/mocap-nlf/status')).toBe(
        'http://127.0.0.1:51731/api/mocap-nlf/status'
      );
      expect(resolveWireUrl('/api/openai/chat/completions', 'openai')).toBe(
        'http://127.0.0.1:51731/api/openai/chat/completions'
      );
    } finally {
      Object.defineProperty(window, 'location', {
        value: origLocation,
        configurable: true,
      });
    }
  });

  it('mounts /api/openai/auth/status and /api/mocap-nlf/status identically in both configureServer and configurePreviewServer', async () => {
    const plugin = openaiAuthPlugin();
    const runStack = async (hookName: 'configureServer' | 'configurePreviewServer', url: string) => {
      const handlers: Array<(req: any, res: any, next: () => void) => void> = [];
      const fakeServer = {
        middlewares: {
          use(fn: (req: any, res: any, next: () => void) => void) {
            handlers.push(fn);
          },
        },
      };
      const hook = plugin[hookName] as (s: any) => void;
      hook(fakeServer);

      return await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        let statusCode = 200;
        const headers: Record<string, string> = {};
        const req = {
          url,
          method: 'GET',
          headers: { origin: 'http://127.0.0.1:4173' },
        };
        const res = {
          headersSent: false,
          setHeader(k: string, v: string) {
            headers[k.toLowerCase()] = v;
          },
          writeHead(code: number) {
            statusCode = code;
            this.headersSent = true;
          },
          end(chunk?: string) {
            this.headersSent = true;
            resolve({ statusCode, body: chunk || '' });
          },
        };

        let idx = 0;
        const next = () => {
          if (idx >= handlers.length) {
            resolve({ statusCode: 404, body: '' });
            return;
          }
          const fn = handlers[idx++];
          try {
            fn(req, res, next);
          } catch (err) {
            reject(err);
          }
        };
        next();
      });
    };

    const devAuth = await runStack('configureServer', '/api/openai/auth/status');
    const previewAuth = await runStack('configurePreviewServer', '/api/openai/auth/status');
    expect(devAuth.statusCode).toBe(200);
    expect(previewAuth.statusCode).toBe(200);
    expect(JSON.parse(previewAuth.body)).toHaveProperty('authenticated', false);

    const previewNlf = await runStack('configurePreviewServer', '/api/mocap-nlf/status');
    expect(previewNlf.statusCode).toBe(200);
    expect(JSON.parse(previewNlf.body)).toHaveProperty('ok', true);
  });

  it('isolates OpenAI token writes/logouts to studio auth file and enforces TLS rejectUnauthorized: true', () => {
    const authSvc = requireCjs('../src/server/openaiAuthService.cjs');
    const authSource = fs.readFileSync(
      path.resolve(__dirname, '../src/server/openaiAuthService.cjs'),
      'utf-8'
    );
    expect(authSource).not.toContain('rejectUnauthorized: false');

    authSvc.saveTokens({ access_token: 'tok_test_123', refresh_token: 'ref_456' });
    expect(fs.existsSync(tempAuthFile)).toBe(true);
    expect(authSvc.loadTokens()).toEqual({
      access_token: 'tok_test_123',
      refresh_token: 'ref_456',
    });

    authSvc.logout();
    expect(authSvc.loadTokens()).toBeNull();
  });

  it('rejects untrusted non-model paths in mocapNlfService.resolveVerifiedNlfModelPath', () => {
    const mocapNlf = requireCjs('../src/server/mocapNlfService.cjs');
    const fallback = 'D:\\ComfyUI\\models\\nlf\\nlf_l_multi.torchscript';
    expect(
      mocapNlf.resolveVerifiedNlfModelPath('C:\\Windows\\System32\\drivers\\etc\\hosts', fallback)
    ).toBe(fallback);
    expect(mocapNlf.resolveVerifiedNlfModelPath('evil\0model.torchscript', fallback)).toBe(
      fallback
    );
    expect(mocapNlf.resolveVerifiedNlfModelPath('../../package.json', fallback)).toBe(fallback);
  });

  it('ensures electron/main.cjs and openaiAuthPlugin.ts preserve require.cache and guard unknown /api/* routes', () => {
    const electronMainSrc = fs.readFileSync(
      path.resolve(__dirname, '../electron/main.cjs'),
      'utf-8'
    );
    const vitePluginSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/server/openaiAuthPlugin.ts'),
      'utf-8'
    );

    expect(electronMainSrc).not.toContain('delete require.cache');
    expect(vitePluginSrc).not.toContain('delete require.cache');
    expect(electronMainSrc).toContain('handleOpenAiHttpRequest');
    expect(electronMainSrc).toContain('Unknown local studio API endpoint');
    expect(electronMainSrc).not.toContain("return { action: 'allow' }");
  });
});
