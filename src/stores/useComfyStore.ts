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

interface ComfyState {
  serverUrl: string;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  systemStats: ComfySystemStats | null;
  activeJob: ActiveJob | null;
  recentOutputs: GeneratedOutput[];

  setServerUrl: (url: string) => void;
  setConnectionStatus: (status: ComfyState['connectionStatus']) => void;
  setSystemStats: (stats: ComfySystemStats | null) => void;
  startJob: (promptId: string, shotId: string, shotName: string) => void;
  updateJobProgress: (progress: number, currentNodeTitle?: string) => void;
  setJobCompleted: (outputVideoUrl: string, outputFilename: string) => void;
  setJobFailed: (error: string) => void;
  clearActiveJob: () => void;
  addRecentOutput: (output: GeneratedOutput) => void;
}

export const useComfyStore = create<ComfyState>((set, get) => ({
  serverUrl: 'http://127.0.0.1:8188',
  connectionStatus: 'disconnected',
  systemStats: null,
  activeJob: null,
  recentOutputs: [],

  setServerUrl: (serverUrl) => set({ serverUrl }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setSystemStats: (systemStats) => set({ systemStats }),

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
