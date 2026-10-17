import { ComfyWorkflowGraph } from '../adapters/types';
import { ComfySystemStats } from '../stores/useComfyStore';
import { logger } from '../stores/useLogStore';

export interface ComfyWsMessage {
  type: string;
  data: Record<string, unknown>;
}

export class ComfyClient {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private clientId: string;

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

    this.clientId = `director_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  getClientId(): string {
    return this.clientId;
  }

  getServerUrl(): string {
    return this.baseUrl;
  }

  updateServerUrl(serverUrl: string) {
    const isBrowser = typeof window !== 'undefined';
    const isDevServer = isBrowser && window.location.port === '5173' && (serverUrl.includes('127.0.0.1:8188') || serverUrl.includes('localhost:8188'));
    
    this.baseUrl = isDevServer ? '/api/comfy' : serverUrl.replace(/\/+$/, '');
    
    if (isDevServer) {
      const loc = window.location;
      const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      this.wsUrl = `${wsProtocol}//${loc.host}/ws`;
    } else {
      this.wsUrl = serverUrl.replace(/\/+$/, '').replace(/^http/, 'ws') + '/ws';
    }

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

  async ping(targetUrl?: string): Promise<{ ok: boolean; latencyMs: number; stats?: ComfySystemStats; error?: string }> {
    const start = performance.now();
    const url = targetUrl ? targetUrl.replace(/\/+$/, '') : this.baseUrl;
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
    const url = targetUrl ? targetUrl.replace(/\/+$/, '') : this.baseUrl;
    try {
      const res = await fetch(`${url}/object_info`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { ltxDetected: false, minimaxDetected: false, wanDetected: false, customNodes: [] };
      const data = await res.json();
      const nodeKeys = Object.keys(data);
      const ltxDetected = nodeKeys.some(k => k.toLowerCase().includes('ltx'));
      const minimaxDetected = nodeKeys.some(k => k.toLowerCase().includes('minimax') || k.toLowerCase().includes('hailuo'));
      const wanDetected = nodeKeys.some(k => k.toLowerCase().includes('wan'));
      const customNodes = nodeKeys.filter(k => 
        k.toLowerCase().includes('ltx') || 
        k.toLowerCase().includes('director') || 
        k.toLowerCase().includes('video')
      ).slice(0, 15);
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

  async uploadImage(file: File): Promise<{ name: string; subfolder: string; type: string }> {
    logger.api(`Uploading reference image to ComfyUI: ${file.name} (${Math.round(file.size / 1024)} KB)`);
    const formData = new FormData();
    formData.append('image', file);
    formData.append('overwrite', 'true');

    const res = await fetch(`${this.baseUrl}/upload/image`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = `Failed to upload image: ${res.status} ${res.statusText}`;
      logger.error(err);
      throw new Error(err);
    }

    const data = await res.json();
    logger.api(`Image successfully uploaded to ComfyUI`, data);
    return data;
  }

  async submitPrompt(graph: ComfyWorkflowGraph): Promise<{ promptId: string; number: number }> {
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
      try {
        const json = JSON.parse(errText);
        parsed = json.error?.message || json.error || errText;
      } catch {
        // use raw text
      }
      logger.error(`ComfyUI prompt rejected: ${parsed}`);
      throw new Error(`ComfyUI prompt rejection: ${parsed}`);
    }

    const data = await res.json();
    logger.api(`Prompt successfully queued in ComfyUI: PromptID=${data.prompt_id}`, data);
    return {
      promptId: data.prompt_id,
      number: data.number,
    };
  }

  connectWebSocket(handlers: {
    onOpen?: () => void;
    onProgress?: (nodeId: string, current: number, max: number) => void;
    onExecuting?: (nodeId: string | null) => void;
    onExecuted?: (nodeId: string, output: Record<string, unknown>) => void;
    onError?: (err: string) => void;
    onClose?: () => void;
  }): () => void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close();
    }

    const url = `${this.wsUrl}?clientId=${this.clientId}`;
    logger.ws(`Connecting WebSocket to ${url}...`);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      logger.ws(`WebSocket connection established with ComfyUI.`);
      handlers.onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        if (typeof event.data === 'string') {
          const msg: ComfyWsMessage = JSON.parse(event.data);
          
          if (msg.type === 'progress') {
            const val = msg.data.value as number;
            const max = msg.data.max as number;
            const node = (msg.data.node as string) || '';
            logger.ws(`Sampling progress: ${val}/${max} (node: ${node})`);
            handlers.onProgress?.(node, val, max);
          } else if (msg.type === 'executing') {
            const node = msg.data.node as string | null;
            logger.ws(`Node executing: ${node || 'IDLE'}`);
            handlers.onExecuting?.(node);
          } else if (msg.type === 'executed') {
            const node = msg.data.node as string;
            const output = (msg.data.output as Record<string, unknown>) || {};
            logger.ws(`Node executed successfully: ${node}`, output);
            handlers.onExecuted?.(node, output);
          } else if (msg.type === 'execution_error') {
            const message = (msg.data.exception_message as string) || 'Execution error in ComfyUI';
            logger.error(`ComfyUI Execution Error: ${message}`, msg.data);
            handlers.onError?.(message);
          }
        }
      } catch (e) {
        console.error('Error handling Comfy WebSocket message', e);
      }
    };

    ws.onerror = () => {
      handlers.onError?.('WebSocket connection error');
    };

    ws.onclose = () => {
      handlers.onClose?.();
    };

    return () => {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
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
}

export const defaultComfyClient = new ComfyClient();
