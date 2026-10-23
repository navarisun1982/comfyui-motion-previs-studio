import { ComfyWorkflowGraph } from '../adapters/types';
import { ComfySystemStats } from '../stores/useComfyStore';
import { logger } from '../stores/useLogStore';
import { sha256Hex } from '../pipeline/hash';

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

export class ComfyClient {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private clientId: string;
  private jobListeners = new Map<string, WsJobListener>();
  private globalListeners = new Set<(msg: ComfyWsMessage) => void>();
  private objectInfoCache: Record<string, unknown> | null = null;
  private isConnecting = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(serverUrl: string = 'http://127.0.0.1:8188') {
    const isBrowser = typeof window !== 'undefined';
    const isDevServer = isBrowser && window.location.port === '5173';

    // In Vite dev mode, use proxy '/api/comfy' to avoid CORS issues.
    // In Electron or production desktop builds, connect directly to ComfyUI.
    this.baseUrl = isDevServer ? '/api/comfy' : serverUrl;

    if (isDevServer) {
      const loc = window.location;
      const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsUrl = `${wsProtocol}//${loc.host}/ws`;
    } else {
      this.wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws';
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
    const isBrowser = typeof window !== 'undefined';
    const isDevServer =
      isBrowser &&
      window.location.port === '5173' &&
      (serverUrl.includes('127.0.0.1:8188') || serverUrl.includes('localhost:8188'));

    this.baseUrl = isDevServer ? '/api/comfy' : serverUrl.replace(/\/+$/, '');

    if (isDevServer) {
      const loc = window.location;
      const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsUrl = `${wsProtocol}//${loc.host}/ws`;
    } else {
      this.wsUrl = serverUrl.replace(/\/+$/, '').replace(/^http/, 'ws') + '/ws';
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
    logger.system(`ComfyUI client updated endpoint to: ${this.baseUrl}`);
  }

  private resolveUrl(targetUrl?: string): string {
    const isBrowser = typeof window !== 'undefined';
    const isDevServer = isBrowser && window.location.port === '5173';
    if (!targetUrl) return this.baseUrl;
    const cleanUrl = targetUrl.replace(/\/+$/, '');
    if (isDevServer && (cleanUrl.includes('127.0.0.1:8188') || cleanUrl.includes('localhost:8188'))) {
      return '/api/comfy';
    }
    return cleanUrl;
  }

  async ping(targetUrl?: string): Promise<{ ok: boolean; latencyMs: number; stats?: ComfySystemStats; error?: string }> {
    const start = performance.now();
    const url = this.resolveUrl(targetUrl);
    try {
      const res = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(5000) });
      const latencyMs = Math.round(performance.now() - start);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();

      const gpu = data.devices?.[0];
      const stats: ComfySystemStats = {
        os: data.system?.os || 'windows',
        ramTotalGb: Math.round((data.system?.ram_total || 0) / (1024 * 1024 * 1024)),
        ramFreeGb: Math.round((data.system?.ram_free || 0) / (1024 * 1024 * 1024)),
        comfyVersion: data.system?.comfyui_version || 'unknown',
        gpuName: gpu?.name || 'NVIDIA GPU',
        vramTotalGb: Math.round((gpu?.vram_total || 0) / (1024 * 1024 * 1024)),
        vramFreeGb: Math.round((gpu?.vram_free || 0) / (1024 * 1024 * 1024)),
      };

      return { ok: true, latencyMs, stats };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, latencyMs, error: msg };
    }
  }

  async detectModels(targetUrl?: string): Promise<{ ltxDetected: boolean; minimaxDetected: boolean; wanDetected: boolean; customNodes: string[] }> {
    const url = this.resolveUrl(targetUrl);
    try {
      const res = await fetch(`${url}/object_info`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { ltxDetected: false, minimaxDetected: false, wanDetected: false, customNodes: [] };
      const data = await res.json();
      const nodeKeys = Object.keys(data);
      const ltxDetected = nodeKeys.some((k) => k.toLowerCase().includes('ltx'));
      const minimaxDetected = nodeKeys.some((k) => k.toLowerCase().includes('minimax') || k.toLowerCase().includes('hailuo'));
      const wanDetected = nodeKeys.some((k) => k.toLowerCase().includes('wan'));
      const customNodes = nodeKeys
        .filter((k) => k.toLowerCase().includes('ltx') || k.toLowerCase().includes('director') || k.toLowerCase().includes('video'))
        .slice(0, 15);
      return { ltxDetected, minimaxDetected, wanDetected, customNodes };
    } catch {
      return { ltxDetected: false, minimaxDetected: false, wanDetected: false, customNodes: [] };
    }
  }

  async checkHealth(): Promise<{ ok: boolean; stats?: ComfySystemStats; raw?: unknown; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/system_stats`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();

      const gpu = data.devices?.[0];
      const stats: ComfySystemStats = {
        os: data.system?.os || 'windows',
        ramTotalGb: Math.round((data.system?.ram_total || 0) / (1024 * 1024 * 1024)),
        ramFreeGb: Math.round((data.system?.ram_free || 0) / (1024 * 1024 * 1024)),
        comfyVersion: data.system?.comfyui_version || 'unknown',
        gpuName: gpu?.name || 'NVIDIA GPU',
        vramTotalGb: Math.round((gpu?.vram_total || 0) / (1024 * 1024 * 1024)),
        vramFreeGb: Math.round((gpu?.vram_free || 0) / (1024 * 1024 * 1024)),
      };

      return { ok: true, stats, raw: data };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  async getObjectInfo(nodeClass?: string): Promise<Record<string, unknown> | null> {
    if (!nodeClass && this.objectInfoCache) {
      return this.objectInfoCache;
    }
    try {
      const url = nodeClass ? `${this.baseUrl}/object_info/${encodeURIComponent(nodeClass)}` : `${this.baseUrl}/object_info`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const data = await res.json();
      if (!nodeClass) {
        this.objectInfoCache = data;
      }
      return data;
    } catch {
      return null;
    }
  }

  async uploadContentAddressed(fileOrBlob: Blob, originalName = 'frame.png'): Promise<{ name: string; subfolder: string; type: string }> {
    const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : fileOrBlob.type.includes('mp4') ? 'mp4' : 'png';
    const hash = await sha256Hex(fileOrBlob);
    const filename = `cmpvs_${hash.slice(0, 12)}.${ext}`;

    logger.api(`Content-addressed upload to ComfyUI: ${filename} (${Math.round(fileOrBlob.size / 1024)} KB)`);
    const formData = new FormData();
    formData.append('image', fileOrBlob, filename);
    formData.append('overwrite', 'true');

    const res = await fetch(`${this.baseUrl}/upload/image`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = `Failed to upload media to ComfyUI: ${res.status} ${res.statusText}`;
      logger.error(err);
      throw new Error(err);
    }

    const data = await res.json();
    logger.api(`Media successfully uploaded: ${data.name}`);
    return data;
  }

  async uploadImage(file: File | Blob, customFilename?: string): Promise<{ name: string; subfolder: string; type: string }> {
    return this.uploadContentAddressed(file, customFilename || (file instanceof File ? file.name : undefined));
  }

  async submitPrompt(graph: ComfyWorkflowGraph): Promise<{ promptId: string; number: number }> {
    this.ensureWebSocket();
    const nodeCount = Object.keys(graph).length;
    logger.workflow(`Compiling workflow graph with ${nodeCount} execution nodes...`, { nodes: Object.keys(graph) });

    const payload = {
      prompt: graph,
      client_id: this.clientId,
    };

    logger.api(`Submitting prompt to ComfyUI POST /prompt...`, { client_id: this.clientId });
    const res = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsed = errText;
      let errorDetails: unknown = null;
      try {
        const json = JSON.parse(errText);
        parsed = json.error?.message || json.error || errText;
        errorDetails = json.node_errors || null;
      } catch {
        // use raw text
      }
      logger.error(`ComfyUI prompt rejected: ${parsed}`, errorDetails);
      throw new Error(`ComfyUI prompt rejection: ${parsed}`);
    }

    const data = await res.json();
    logger.api(`Prompt successfully queued in ComfyUI: PromptID=${data.prompt_id}`, data);
    return {
      promptId: data.prompt_id,
      number: data.number,
    };
  }

  async interrupt(): Promise<boolean> {
    try {
      logger.action('Sending POST /interrupt to ComfyUI...');
      const res = await fetch(`${this.baseUrl}/interrupt`, { method: 'POST' });
      return res.ok;
    } catch (e) {
      logger.error('Failed to interrupt ComfyUI execution', e);
      return false;
    }
  }

  async deleteQueueItem(promptId: string): Promise<boolean> {
    try {
      logger.action(`Deleting queued prompt ${promptId}...`);
      const res = await fetch(`${this.baseUrl}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: [promptId] }),
      });
      return res.ok;
    } catch {
      return false;
    }
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
    try {
      const res = await fetch(`${this.baseUrl}/history/${promptId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data[promptId] || null;
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
