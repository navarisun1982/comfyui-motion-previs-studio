import { ComfyWorkflowGraph } from '../adapters/types';
import { ComfySystemStats } from '../stores/useComfyStore';
import { logger } from '../stores/useLogStore';
import { sha256Hex } from '../pipeline/hash';

export interface ElectronComfyBridge {
  isElectron?: boolean;
  request: (options: {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string | null;
    responseType?: 'json' | 'text' | 'base64';
    timeoutMs?: number;
    targetUrl?: string | null;
  }) => Promise<{
    ok: boolean;
    status: number;
    statusText?: string;
    activePort?: number;
    contentType?: string;
    text?: string;
    data?: any;
    base64?: string;
    error?: string;
  }>;
  uploadImage: (options: {
    filename: string;
    mimeType: string;
    base64Data: string;
    overwrite?: boolean;
    targetUrl?: string | null;
  }) => Promise<{
    ok: boolean;
    status: number;
    data?: { name: string; subfolder: string; type: string };
    text?: string;
    error?: string;
  }>;
  syncWorkflows?: (options?: Record<string, unknown>) => Promise<any>;
  getSyncStatus?: () => Promise<any>;
  fetchRemoteWorkflow?: (url: string) => Promise<any>;
}

declare global {
  interface Window {
    electronComfyBridge?: ElectronComfyBridge;
  }
}

export interface ComfyWsMessage {
  type: string;
  data: Record<string, unknown>;
}

export interface WsJobListener {
  promptId: string;
  onStart?: () => void;
  onExecuting?: (nodeId: string | null) => void;
  onProgress?: (nodeId: string, current: number, max: number) => void;
  onExecuted?: (nodeId: string, output: Record<string, unknown>) => void;
  onSuccess?: () => void;
  onInterrupted?: (nodeId?: string) => void;
  onError?: (message: string, details?: unknown) => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = String(reader.result || '');
        const comma = res.indexOf(',');
        resolve(comma >= 0 ? res.slice(comma + 1) : res);
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
      return;
    }
    blob
      .arrayBuffer()
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        resolve(btoa(binary));
      })
      .catch(reject);
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class ComfyClient {
  private baseUrl: string;
  private targetServerUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private clientId: string;
  private jobListeners = new Map<string, WsJobListener>();
  private globalListeners = new Set<(msg: ComfyWsMessage) => void>();
  private objectInfoCache: Record<string, unknown> | null = null;
  private isConnecting = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private isFileProtocol(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(window.location?.protocol?.startsWith('file:'));
  }

  private isHttpDevContext(): boolean {
    if (typeof window === 'undefined') return false;
    if (this.isFileProtocol()) return false;
    return (
      Boolean(import.meta.env.DEV) ||
      ['5173', '5174', '5175', '4173', '51265', '51266'].includes(window.location.port) ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === 'localhost'
    );
  }

  private getElectronBridge(): ElectronComfyBridge | null {
    if (typeof window !== 'undefined' && window.electronComfyBridge) {
      return window.electronComfyBridge;
    }
    return null;
  }

  constructor(serverUrl: string = 'http://127.0.0.1:8188') {
    this.targetServerUrl = serverUrl.replace(/\/+$/, '') || 'http://127.0.0.1:8188';
    const isDevServer = this.isHttpDevContext();
    const isFile = this.isFileProtocol();

    // In Vite dev mode, use '/api/comfy'. In Electron file:// mode, prefer local proxy 51731.
    if (isDevServer) {
      this.baseUrl = '/api/comfy';
    } else if (isFile) {
      this.baseUrl = 'http://127.0.0.1:51731/api/comfy';
    } else {
      this.baseUrl = this.targetServerUrl;
    }

    if (isDevServer) {
      const loc = window.location;
      const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsUrl = `${wsProtocol}//${loc.host}/ws`;
    } else {
      this.wsUrl = this.targetServerUrl.replace(/^http/, 'ws') + '/ws';
    }

    this.clientId = `cmpvs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  getClientId(): string {
    return this.clientId;
  }

  getServerUrl(): string {
    return this.baseUrl;
  }

  updateServerUrl(serverUrl: string) {
    const cleanTarget = (serverUrl || 'http://127.0.0.1:8188').trim().replace(/\/+$/, '');
    this.targetServerUrl = cleanTarget;
    const isLocalDefault =
      cleanTarget.includes('127.0.0.1:8188') ||
      cleanTarget.includes('localhost:8188') ||
      cleanTarget.includes('127.0.0.1:8000') ||
      cleanTarget.includes('localhost:8000');

    if (this.isHttpDevContext() && isLocalDefault) {
      this.baseUrl = '/api/comfy';
      const loc = window.location;
      const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsUrl = `${wsProtocol}//${loc.host}/ws`;
    } else if (this.isFileProtocol() && isLocalDefault) {
      // Never clobber Electron's local proxy with a raw 127.0.0.1:8188 URL that lacks CORS headers
      this.baseUrl = 'http://127.0.0.1:51731/api/comfy';
      this.wsUrl = cleanTarget.replace(/^http/, 'ws') + '/ws';
    } else {
      this.baseUrl = cleanTarget;
      this.wsUrl = cleanTarget.replace(/^http/, 'ws') + '/ws';
    }

    this.objectInfoCache = null;

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    logger.system(`ComfyUI client updated endpoint to: ${this.baseUrl} (target: ${this.targetServerUrl})`);
  }

  private getCandidateEndpoints(overrideTargetUrl?: string): string[] {
    const isFile = this.isFileProtocol();
    const isDev = this.isHttpDevContext();
    const cleanOverride = overrideTargetUrl ? overrideTargetUrl.trim().replace(/\/+$/, '') : '';

    const raw = isFile
      ? [
          'http://127.0.0.1:51731/api/comfy',
          'http://127.0.0.1:5173/api/comfy',
          this.baseUrl,
          cleanOverride,
          this.targetServerUrl,
          'http://127.0.0.1:8188',
          'http://127.0.0.1:8000',
        ]
      : isDev
      ? [
          '/api/comfy',
          this.baseUrl,
          'http://127.0.0.1:5173/api/comfy',
          'http://127.0.0.1:51731/api/comfy',
          cleanOverride,
          this.targetServerUrl,
          'http://127.0.0.1:8188',
          'http://127.0.0.1:8000',
        ]
      : [
          this.baseUrl,
          cleanOverride,
          this.targetServerUrl,
          'http://127.0.0.1:51731/api/comfy',
          'http://127.0.0.1:5173/api/comfy',
          'http://127.0.0.1:8188',
          'http://127.0.0.1:8000',
        ];

    return Array.from(
      new Set(raw.filter((c) => Boolean(c) && !(isFile && c.startsWith('/'))))
    );
  }

  private updateActivePortAndWs(candidateUrl: string, activePort?: number | string | null) {
    const portStr = activePort
      ? String(activePort)
      : candidateUrl.includes(':8000')
      ? '8000'
      : '8188';
    if (this.isHttpDevContext() && candidateUrl === '/api/comfy' && portStr === '8188') {
      const loc = window.location;
      const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsUrl = `${wsProtocol}//${loc.host}/ws`;
    } else {
      this.wsUrl = `ws://127.0.0.1:${portStr}/ws`;
    }
  }

  private async requestComfy<T = any>(
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string | null;
      timeoutMs?: number;
      targetUrl?: string;
      expectSystemStats?: boolean;
    } = {}
  ): Promise<{
    ok: boolean;
    status: number;
    data: T | null;
    text: string;
    error?: string;
  }> {
    const normPath = path.startsWith('/') ? path : `/${path}`;
    const method = options.method || 'GET';
    const timeoutMs = options.timeoutMs ?? 8000;
    const targetUrl = options.targetUrl || this.targetServerUrl;

    // Channel 1: Native Electron IPC Bridge (100% immune to Chromium CORS, Origin, or port conflicts)
    const bridge = this.getElectronBridge();
    if (bridge?.request) {
      try {
        const ipcRes = await bridge.request({
          path: normPath,
          method,
          headers: options.headers,
          body: options.body ?? null,
          responseType: 'json',
          timeoutMs,
          targetUrl,
        });
        if (ipcRes && ipcRes.ok) {
          if (!options.expectSystemStats || (ipcRes.data && typeof ipcRes.data === 'object' && ipcRes.data.system)) {
            this.updateActivePortAndWs('http://127.0.0.1:51731/api/comfy', ipcRes.activePort);
            return {
              ok: true,
              status: ipcRes.status || 200,
              data: (ipcRes.data ?? null) as T | null,
              text: ipcRes.text || '',
            };
          }
        } else if (ipcRes && ipcRes.status >= 400 && ipcRes.status < 500) {
          // Genuine 4xx from ComfyUI (e.g. prompt validation error 400) — return immediately!
          return {
            ok: false,
            status: ipcRes.status,
            data: (ipcRes.data ?? null) as T | null,
            text: ipcRes.text || ipcRes.error || '',
            error: ipcRes.error || `HTTP ${ipcRes.status}`,
          };
        }
      } catch {
        // Fall through to HTTP channels
      }
    }

    // Channel 2 & 3: Self-healing HTTP Candidate Loop (Local Proxy 51731 -> Vite /api/comfy -> Direct 8188/8000)
    const candidates = this.getCandidateEndpoints(options.targetUrl);
    let lastError = 'Connection failed';
    let lastStatus = 0;
    let lastText = '';

    for (const candidate of candidates) {
      try {
        const reqHeaders: Record<string, string> = { ...(options.headers || {}) };
        if (
          (candidate.includes('51731') || candidate.startsWith('/api/comfy') || candidate.includes('5173/api/comfy')) &&
          targetUrl &&
          !targetUrl.includes('5173')
        ) {
          reqHeaders['X-Comfy-Target'] = targetUrl;
        }

        const res = await fetch(`${candidate}${normPath}`, {
          method,
          headers: Object.keys(reqHeaders).length > 0 ? reqHeaders : undefined,
          body: options.body ?? undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });

        lastStatus = res.status;
        const text = await res.text();
        lastText = text;
        let parsed: any = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = null;
        }

        if (!res.ok) {
          // If ComfyUI returned a 400 Bad Request on /prompt (node error), don't retry other ports
          if (res.status >= 400 && res.status < 500 && normPath === '/prompt') {
            return {
              ok: false,
              status: res.status,
              data: parsed,
              text,
              error: `HTTP ${res.status}: ${res.statusText}`,
            };
          }
          lastError = `HTTP ${res.status}: ${res.statusText}`;
          continue;
        }

        if (options.expectSystemStats && (!parsed || typeof parsed !== 'object' || !parsed.system)) {
          lastError = 'Invalid system_stats payload';
          continue;
        }

        if (candidate !== this.baseUrl) {
          this.baseUrl = candidate;
        }
        const activePortHeader = res.headers.get('X-Comfy-Active-Port');
        this.updateActivePortAndWs(candidate, activePortHeader);

        return {
          ok: true,
          status: res.status,
          data: parsed as T,
          text,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      ok: false,
      status: lastStatus || 502,
      data: null,
      text: lastText,
      error: lastError,
    };
  }

  private parseSystemStats(data: any): ComfySystemStats {
    const gpu = data?.devices?.[0];
    return {
      os: data?.system?.os || 'windows',
      ramTotalGb: Math.round((data?.system?.ram_total || 0) / (1024 * 1024 * 1024)),
      ramFreeGb: Math.round((data?.system?.ram_free || 0) / (1024 * 1024 * 1024)),
      comfyVersion: data?.system?.comfyui_version || 'unknown',
      gpuName: gpu?.name || 'NVIDIA GPU',
      vramTotalGb: Math.round((gpu?.vram_total || 0) / (1024 * 1024 * 1024)),
      vramFreeGb: Math.round((gpu?.vram_free || 0) / (1024 * 1024 * 1024)),
    };
  }

  async ping(targetUrl?: string): Promise<{ ok: boolean; latencyMs: number; stats?: ComfySystemStats; error?: string }> {
    const start = performance.now();
    const res = await this.requestComfy<any>('/system_stats', {
      timeoutMs: 5000,
      targetUrl,
      expectSystemStats: true,
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok || !res.data) {
      return { ok: false, latencyMs, error: res.error || 'ComfyUI unreachable' };
    }
    return {
      ok: true,
      latencyMs,
      stats: this.parseSystemStats(res.data),
    };
  }

  async detectModels(targetUrl?: string): Promise<{ ltxDetected: boolean; minimaxDetected: boolean; wanDetected: boolean; customNodes: string[] }> {
    const res = await this.requestComfy<Record<string, unknown>>('/object_info', {
      timeoutMs: 8000,
      targetUrl,
    });
    if (!res.ok || !res.data || typeof res.data !== 'object') {
      return { ltxDetected: false, minimaxDetected: false, wanDetected: false, customNodes: [] };
    }
    const nodeKeys = Object.keys(res.data);
    const ltxDetected = nodeKeys.some((k) => k.toLowerCase().includes('ltx'));
    const minimaxDetected = nodeKeys.some((k) => k.toLowerCase().includes('minimax') || k.toLowerCase().includes('hailuo'));
    const wanDetected = nodeKeys.some((k) => k.toLowerCase().includes('wan'));
    const customNodes = nodeKeys
      .filter((k) => k.toLowerCase().includes('ltx') || k.toLowerCase().includes('director') || k.toLowerCase().includes('video'))
      .slice(0, 15);
    return { ltxDetected, minimaxDetected, wanDetected, customNodes };
  }

  async checkHealth(): Promise<{ ok: boolean; stats?: ComfySystemStats; raw?: unknown; error?: string }> {
    const res = await this.requestComfy<any>('/system_stats', {
      timeoutMs: 4500,
      expectSystemStats: true,
    });
    if (!res.ok || !res.data) {
      return { ok: false, error: res.error || 'Connection failed' };
    }
    return {
      ok: true,
      stats: this.parseSystemStats(res.data),
      raw: res.data,
    };
  }

  async getObjectInfo(nodeClass?: string): Promise<Record<string, unknown> | null> {
    if (!nodeClass && this.objectInfoCache) {
      return this.objectInfoCache;
    }
    const path = nodeClass ? `/object_info/${encodeURIComponent(nodeClass)}` : '/object_info';
    const res = await this.requestComfy<Record<string, unknown>>(path, { timeoutMs: 12000 });
    if (!res.ok || !res.data || typeof res.data !== 'object') {
      return null;
    }
    if (!nodeClass) {
      this.objectInfoCache = res.data;
    }
    return res.data;
  }

  async uploadContentAddressed(fileOrBlob: Blob, originalName = 'frame.png'): Promise<{ name: string; subfolder: string; type: string }> {
    const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : fileOrBlob.type.includes('mp4') ? 'mp4' : 'png';
    const hash = await sha256Hex(fileOrBlob);
    const filename = `cmpvs_${hash.slice(0, 12)}.${ext}`;

    logger.api(`Content-addressed upload to ComfyUI: ${filename} (${Math.round(fileOrBlob.size / 1024)} KB)`);

    // Channel 1: Native Electron IPC Bridge upload
    const bridge = this.getElectronBridge();
    if (bridge?.uploadImage) {
      try {
        const base64Data = await blobToBase64(fileOrBlob);
        const ipcUp = await bridge.uploadImage({
          filename,
          mimeType: fileOrBlob.type || (ext === 'mp4' ? 'video/mp4' : 'image/png'),
          base64Data,
          overwrite: true,
          targetUrl: this.targetServerUrl,
        });
        if (ipcUp && ipcUp.ok && ipcUp.data?.name) {
          logger.api(`Media successfully uploaded via IPC bridge: ${ipcUp.data.name}`);
          return ipcUp.data;
        }
      } catch {
        // Fall through to HTTP FormData upload
      }
    }

    // Channel 2 & 3: HTTP FormData across candidate endpoints
    const candidates = this.getCandidateEndpoints();
    let lastError = 'Upload failed';
    for (const candidate of candidates) {
      try {
        const formData = new FormData();
        formData.append('image', fileOrBlob, filename);
        formData.append('overwrite', 'true');

        const res = await fetch(`${candidate}/upload/image`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          lastError = `${res.status} ${res.statusText}`;
          continue;
        }
        const data = await res.json();
        if (candidate !== this.baseUrl) {
          this.baseUrl = candidate;
        }
        logger.api(`Media successfully uploaded: ${data.name}`);
        return data;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    const errMsg = `Failed to upload media to ComfyUI: ${lastError}`;
    logger.error(errMsg);
    throw new Error(errMsg);
  }

  async uploadImage(file: File | Blob, customFilename?: string): Promise<{ name: string; subfolder: string; type: string }> {
    return this.uploadContentAddressed(file, customFilename || (file instanceof File ? file.name : undefined));
  }

  async saveUserWorkflow(filename: string, rawJson: string): Promise<boolean> {
    const cleanRel = filename.replace(/^workflows[\\/]/i, '').replace(/\\/g, '/');
    const encodedPath = encodeURIComponent(`workflows/${cleanRel}`);
    const res = await this.requestComfy(`/api/userdata/${encodedPath}?overwrite=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: rawJson,
      timeoutMs: 6000,
    });
    return res.ok;
  }

  async submitPrompt(graph: ComfyWorkflowGraph): Promise<{ promptId: string; number: number }> {
    this.ensureWebSocket();
    const nodeCount = Object.keys(graph).length;
    logger.workflow(`Compiling workflow graph with ${nodeCount} execution nodes...`, { nodes: Object.keys(graph) });

    const payload = {
      prompt: graph,
      client_id: this.clientId,
    };
    const serializedPayload = JSON.stringify(payload)
      .replace(/9:16 \(Vertical\)/g, '9:16 (Portrait Widescreen)')
      .replace(/4:3 \(Classic TV\)/g, '4:3 (Standard)');

    logger.api(`Submitting prompt to ComfyUI POST /prompt...`, { client_id: this.clientId });
    const res = await this.requestComfy<any>('/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serializedPayload,
      timeoutMs: 15000,
    });

    if (!res.ok || !res.data) {
      const errText = res.text || res.error || 'Unknown error';
      let parsed = errText;
      let errorDetails: unknown = null;
      try {
        const json = res.data || JSON.parse(errText);
        parsed = json.error?.message || json.error || errText;
        errorDetails = json.node_errors || null;
      } catch {
        // use raw text
      }
      logger.error(`ComfyUI prompt rejected: ${parsed}`, errorDetails);
      throw new Error(`ComfyUI prompt rejection: ${parsed}`);
    }

    const data = res.data;
    logger.api(`Prompt successfully queued in ComfyUI: PromptID=${data.prompt_id}`, data);
    return {
      promptId: data.prompt_id,
      number: data.number,
    };
  }

  async interrupt(): Promise<boolean> {
    logger.action('Sending POST /interrupt to ComfyUI...');
    const res = await this.requestComfy('/interrupt', { method: 'POST', timeoutMs: 5000 });
    return res.ok;
  }

  async deleteQueueItem(promptId: string): Promise<boolean> {
    logger.action(`Deleting queued prompt ${promptId}...`);
    const res = await this.requestComfy('/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: [promptId] }),
      timeoutMs: 5000,
    });
    return res.ok;
  }

  ensureWebSocket(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.isConnecting) return;
    this.isConnecting = true;

    const url = `${this.wsUrl}?clientId=${this.clientId}`;
    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.isConnecting = false;
        logger.ws(`WebSocket connection established with ComfyUI.`);
      };

      ws.onmessage = (event) => {
        try {
          if (typeof event.data === 'string') {
            const msg: ComfyWsMessage = JSON.parse(event.data);
            this.dispatchWsMessage(msg);
          }
        } catch (e) {
          console.error('Error handling Comfy WebSocket message', e);
        }
      };

      ws.onerror = () => {
        this.isConnecting = false;
      };

      ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
          if (this.jobListeners.size > 0) {
            this.ensureWebSocket();
          }
        }, 2500);
      };
    } catch {
      this.isConnecting = false;
    }
  }

  private dispatchWsMessage(msg: ComfyWsMessage): void {
    for (const listener of this.globalListeners) {
      listener(msg);
    }

    const promptId = (msg.data?.prompt_id as string) || '';
    if (!promptId) return;

    const listener = this.jobListeners.get(promptId);
    if (!listener) return;

    switch (msg.type) {
      case 'execution_start':
        listener.onStart?.();
        break;

      case 'executing': {
        const nodeId = msg.data.node as string | null;
        listener.onExecuting?.(nodeId);
        break;
      }

      case 'progress': {
        const val = msg.data.value as number;
        const max = msg.data.max as number;
        const node = (msg.data.node as string) || '';
        listener.onProgress?.(node, val, max);
        break;
      }

      case 'executed': {
        const node = msg.data.node as string;
        const output = (msg.data.output as Record<string, unknown>) || {};
        listener.onExecuted?.(node, output);
        break;
      }

      case 'execution_success':
        listener.onSuccess?.();
        this.jobListeners.delete(promptId);
        break;

      case 'execution_interrupted': {
        const nodeId = (msg.data.node_id as string) || undefined;
        listener.onInterrupted?.(nodeId);
        this.jobListeners.delete(promptId);
        break;
      }

      case 'execution_error': {
        const message = (msg.data.exception_message as string) || 'Execution error in ComfyUI';
        listener.onError?.(message, msg.data);
        this.jobListeners.delete(promptId);
        break;
      }
    }
  }

  registerJobListener(listener: WsJobListener): () => void {
    this.jobListeners.set(listener.promptId, listener);
    this.ensureWebSocket();
    return () => {
      this.jobListeners.delete(listener.promptId);
    };
  }

  /**
   * Backwards compatible method for legacy callers.
   */
  connectWebSocket(handlers: {
    onOpen?: () => void;
    onProgress?: (nodeId: string, current: number, max: number) => void;
    onExecuting?: (nodeId: string | null) => void;
    onExecuted?: (nodeId: string, output: Record<string, unknown>) => void;
    onError?: (err: string) => void;
    onClose?: () => void;
  }): () => void {
    this.ensureWebSocket();
    const globalHandler = (msg: ComfyWsMessage) => {
      if (msg.type === 'progress') {
        handlers.onProgress?.(msg.data.node as string, msg.data.value as number, msg.data.max as number);
      } else if (msg.type === 'executing') {
        handlers.onExecuting?.(msg.data.node as string | null);
      } else if (msg.type === 'executed') {
        handlers.onExecuted?.(msg.data.node as string, (msg.data.output as Record<string, unknown>) || {});
      } else if (msg.type === 'execution_error') {
        handlers.onError?.((msg.data.exception_message as string) || 'Error');
      }
    };
    this.globalListeners.add(globalHandler);
    return () => {
      this.globalListeners.delete(globalHandler);
    };
  }

  async getPromptHistory(promptId: string): Promise<Record<string, unknown> | null> {
    const res = await this.requestComfy<Record<string, Record<string, unknown>>>(`/history/${promptId}`, {
      timeoutMs: 8000,
    });
    if (!res.ok || !res.data) return null;
    return res.data[promptId] || null;
  }

  async fetchLatestCompletedOutput(maxItems = 15): Promise<{
    promptId: string;
    filename: string;
    videoUrl: string;
    width?: number;
    height?: number;
    fps?: number;
    duration?: number;
  } | null> {
    try {
      const res = await this.requestComfy<Record<string, Record<string, unknown>>>(`/history?max_items=${maxItems}`, {
        timeoutMs: 8000,
      });
      if (!res.ok || !res.data) return null;
      const data = res.data;
      const entries = Object.entries(data).sort((a, b) => {
        const qa = Array.isArray(a[1]?.prompt) ? Number(a[1].prompt[0] ?? 0) : 0;
        const qb = Array.isArray(b[1]?.prompt) ? Number(b[1].prompt[0] ?? 0) : 0;
        return qb - qa;
      });

      // Pass 1: Prefer studio renders (Node 145 or cmpvs_ / mmh3_ prefix)
      for (const preferStudioOnly of [true, false]) {
        for (const [promptId, item] of entries) {
          const outputs = item.outputs as Record<string, Record<string, unknown>> | undefined;
          if (!outputs) continue;
          for (const [nodeId, nodeOut] of Object.entries(outputs)) {
            const v = this.extractVideoOutput(nodeOut);
            if (!v) continue;
            const isStudioRender =
              nodeId === '145' || v.filename.startsWith('cmpvs_') || v.filename.startsWith('mmh3_');
            if (preferStudioOnly && !isStudioRender) continue;

            const gifMeta = Array.isArray(nodeOut.gifs) && nodeOut.gifs[0] ? (nodeOut.gifs[0] as Record<string, unknown>) : null;
            const metadata = gifMeta?.metadata as Record<string, number> | undefined;
            return {
              promptId,
              filename: v.filename,
              videoUrl: await this.fetchVideoBlobUrl(v.filename, v.subfolder || '', v.type || 'output'),
              width: metadata?.width,
              height: metadata?.height,
              fps: (gifMeta?.frame_rate as number) || metadata?.fps,
              duration: metadata?.duration,
            };
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  getViewUrl(filename: string, subfolder = '', type = 'output'): string {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type,
    });
    return `${this.baseUrl}/view?${params.toString()}`;
  }

  private blobUrlCache = new Map<string, string>();

  async fetchVideoBlobUrl(filename: string, subfolder = '', type = 'output'): Promise<string> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type,
    });
    const relViewPath = `/view?${params.toString()}`;
    const cacheKey = `${filename}|${subfolder}|${type}`;
    const cached = this.blobUrlCache.get(cacheKey);
    if (cached) return cached;

    // Channel 1: Electron IPC Bridge binary fetch
    const bridge = this.getElectronBridge();
    if (bridge?.request) {
      try {
        const ipcRes = await bridge.request({
          path: relViewPath,
          method: 'GET',
          responseType: 'base64',
          timeoutMs: 25000,
          targetUrl: this.targetServerUrl,
        });
        if (ipcRes && ipcRes.ok && ipcRes.base64) {
          const bytes = base64ToUint8Array(ipcRes.base64);
          const videoBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' });
          const blobUrl = URL.createObjectURL(videoBlob);
          this.blobUrlCache.set(cacheKey, blobUrl);
          return blobUrl;
        }
      } catch {
        // Fall through to HTTP fetch
      }
    }

    // Channel 2 & 3: HTTP candidate loop
    const candidates = this.getCandidateEndpoints();
    for (const candidate of candidates) {
      try {
        const res = await fetch(`${candidate}${relViewPath}`);
        if (!res.ok) continue;
        const rawBlob = await res.blob();
        const videoBlob = new Blob([rawBlob], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(videoBlob);
        this.blobUrlCache.set(cacheKey, blobUrl);
        return blobUrl;
      } catch {
        // try next candidate
      }
    }

    return this.getViewUrl(filename, subfolder, type);
  }

  extractVideoOutput(
    output: Record<string, unknown>,
    targetNodeId?: string,
    currentNodeId?: string
  ): { filename: string; subfolder?: string; type?: string } | null {
    if (!output || typeof output !== 'object') return null;

    // If targetNodeId is specified, ensure we only accept output from the bound output node!
    if (targetNodeId && currentNodeId && targetNodeId !== currentNodeId) {
      return null;
    }

    // 1. VHS_VideoCombine outputs gifs array
    if (output.gifs && Array.isArray(output.gifs) && output.gifs.length > 0) {
      const item = output.gifs[0];
      if (item && typeof item === 'object' && 'filename' in item) {
        return item as { filename: string; subfolder?: string; type?: string };
      }
    }

    // 2. Standard video nodes output videos array
    if (output.videos && Array.isArray(output.videos) && output.videos.length > 0) {
      const item = output.videos[0];
      if (item && typeof item === 'object' && 'filename' in item) {
        return item as { filename: string; subfolder?: string; type?: string };
      }
    }

    // 3. Custom video preview nodes output video array [filename, subfolder]
    if (output.video && Array.isArray(output.video) && output.video.length > 0) {
      const fn = output.video[0];
      const subfolder = typeof output.video[1] === 'string' ? output.video[1] : '';
      if (typeof fn === 'string' && fn.length > 0) {
        return { filename: fn, subfolder, type: 'output' };
      }
    }

    // 4. Output images that are actually video files (.mp4, .webm, .gif)
    if (output.images && Array.isArray(output.images) && output.images.length > 0) {
      const item = output.images[0];
      if (item && typeof item === 'object' && 'filename' in item) {
        const fn = (item as { filename: string }).filename;
        if (typeof fn === 'string' && (fn.endsWith('.mp4') || fn.endsWith('.webm') || fn.endsWith('.gif'))) {
          return item as { filename: string; subfolder?: string; type?: string };
        }
      }
    }

    return null;
  }
}

export const defaultComfyClient = new ComfyClient();
