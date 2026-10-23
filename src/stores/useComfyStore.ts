import { create } from 'zustand';

export interface ComfySystemStats {
  os: string;
  ramTotalGb: number;
  ramFreeGb: number;
  comfyVersion: string;
  gpuName: string;
  vramTotalGb: number;
  vramFreeGb: number;
}

export interface ActiveJob {
  promptId: string;
  shotId: string;
  shotName: string;
  status: 'idle' | 'queued' | 'executing' | 'completed' | 'failed';
  progress: number; // 0..100
  currentNodeTitle: string;
  error: string | null;
  outputVideoUrl: string | null;
  outputFilename: string | null;
  startTime: number;
}

export interface GeneratedOutput {
  id: string;
  shotId: string;
  shotName: string;
  promptId: string;
  videoUrl: string;
  filename: string;
  timestamp: number;
}

const SERVER_URL_KEY = 'ai_director_comfy_server_url';

interface ComfyState {
  serverUrl: string;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  systemStats: ComfySystemStats | null;
  latencyMs: number | null;
  detectedModels: {
    ltx: boolean;
    minimax: boolean;
    wan: boolean;
    customNodes: string[];
  };
  isSettingsOpen: boolean;
  settingsTab: SettingsTab;
  activeJob: ActiveJob | null;
  recentOutputs: GeneratedOutput[];

  setServerUrl: (url: string) => void;
  setConnectionStatus: (status: ComfyState['connectionStatus']) => void;
  setSystemStats: (stats: ComfySystemStats | null) => void;
  setLatencyMs: (latency: number | null) => void;
  setDetectedModels: (detected: ComfyState['detectedModels']) => void;
  openSettings: (tab?: SettingsTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  closeSettings: () => void;
  toggleSettings: () => void;
  startJob: (promptId: string, shotId: string, shotName: string) => void;
  updateJobProgress: (progress: number, currentNodeTitle?: string) => void;
  setJobCompleted: (outputVideoUrl: string, outputFilename: string) => void;
  setJobFailed: (error: string) => void;
  clearActiveJob: () => void;
  addRecentOutput: (output: GeneratedOutput) => void;
}

export type SettingsTab = 'comfy' | 'llm';

const initialServerUrl = typeof window !== 'undefined' && window.localStorage?.getItem(SERVER_URL_KEY)
  ? window.localStorage.getItem(SERVER_URL_KEY)!
  : 'http://127.0.0.1:8188';

export const useComfyStore = create<ComfyState>((set, get) => ({
  serverUrl: initialServerUrl,
  connectionStatus: 'disconnected',
  systemStats: null,
  latencyMs: null,
  detectedModels: {
    ltx: false,
    minimax: false,
    wan: false,
    customNodes: [],
  },
  isSettingsOpen: false,
  settingsTab: 'comfy',
  activeJob: null,
  recentOutputs: [],

  setServerUrl: (serverUrl) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SERVER_URL_KEY, serverUrl);
      }
    } catch {
      // ignore
    }
    set({ serverUrl });
  },

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setSystemStats: (systemStats) => set({ systemStats }),
  setLatencyMs: (latencyMs) => set({ latencyMs }),
  setDetectedModels: (detectedModels) => set({ detectedModels }),
  openSettings: (tab) =>
    set((s) => ({ isSettingsOpen: true, settingsTab: tab === 'llm' || tab === 'comfy' ? tab : s.settingsTab })),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  closeSettings: () => set({ isSettingsOpen: false }),
  toggleSettings: () => set({ isSettingsOpen: !get().isSettingsOpen }),

  startJob: (promptId, shotId, shotName) => {
    set({
      activeJob: {
        promptId,
        shotId,
        shotName,
        status: 'queued',
        progress: 0,
        currentNodeTitle: 'Queuing job in ComfyUI...',
        error: null,
        outputVideoUrl: null,
        outputFilename: null,
        startTime: Date.now(),
      },
    });
  },

  updateJobProgress: (progress, currentNodeTitle) => {
    const job = get().activeJob;
    if (!job) return;
    set({
      activeJob: {
        ...job,
        status: 'executing',
        progress: Math.min(100, Math.max(0, progress)),
        currentNodeTitle: currentNodeTitle || job.currentNodeTitle,
      },
    });
  },

  setJobCompleted: (outputVideoUrl, outputFilename) => {
    const job = get().activeJob;
    if (!job) return;

    const output: GeneratedOutput = {
      id: `out-${Date.now()}`,
      shotId: job.shotId,
      shotName: job.shotName,
      promptId: job.promptId,
      videoUrl: outputVideoUrl,
      filename: outputFilename,
      timestamp: Date.now(),
    };

    set({
      activeJob: {
        ...job,
        status: 'completed',
        progress: 100,
        currentNodeTitle: 'Generation completed successfully',
        outputVideoUrl,
        outputFilename,
      },
      recentOutputs: [output, ...get().recentOutputs],
    });
  },

  setJobFailed: (error) => {
    const job = get().activeJob;
    if (!job) return;
    set({
      activeJob: {
        ...job,
        status: 'failed',
        currentNodeTitle: 'Failed',
        error,
      },
    });
  },

  clearActiveJob: () => set({ activeJob: null }),

  addRecentOutput: (output) => {
    set({ recentOutputs: [output, ...get().recentOutputs] });
  },
}));
