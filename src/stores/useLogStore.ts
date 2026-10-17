import { create } from 'zustand';

export type LogCategory = 'ACTION' | 'COMFY_API' | 'WEBSOCKET' | 'WORKFLOW' | 'SYSTEM' | 'ERROR';
export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  id: string;
  timestamp: number;
  timeStr: string;
  category: LogCategory;
  level: LogLevel;
  message: string;
  details?: unknown;
}

interface LogState {
  logs: LogEntry[];
  isOpen: boolean;
  filterCategory: LogCategory | 'ALL';
  searchQuery: string;
  autoScroll: boolean;

  addLog: (category: LogCategory, level: LogLevel, message: string, details?: unknown) => void;
  toggleOpen: () => void;
  setIsOpen: (isOpen: boolean) => void;
  setFilterCategory: (cat: LogCategory | 'ALL') => void;
  setSearchQuery: (query: string) => void;
  setAutoScroll: (autoScroll: boolean) => void;
  clearLogs: () => void;
}

export const useLogStore = create<LogState>((set, get) => ({
  logs: [
    {
      id: 'init-1',
      timestamp: Date.now(),
      timeStr: new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0'),
      category: 'SYSTEM',
      level: 'info',
      message: 'AI Director Studio engine initialized in desktop environment.',
      details: { version: '1.0.0', platform: 'win32', renderer: 'React 19 / Vite' },
    },
  ],
  isOpen: false,
  filterCategory: 'ALL',
  searchQuery: '',
  autoScroll: true,

  addLog: (category, level, message, details) => {
    const now = Date.now();
    const d = new Date(now);
    const timeStr = `${d.toTimeString().split(' ')[0]}.${String(now % 1000).padStart(3, '0')}`;

    const entry: LogEntry = {
      id: `log-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      timeStr,
      category,
      level,
      message,
      details,
    };

    set({ logs: [...get().logs.slice(-300), entry] }); // keep last 300 logs
  },

  toggleOpen: () => set({ isOpen: !get().isOpen }),
  setIsOpen: (isOpen) => set({ isOpen }),
  setFilterCategory: (filterCategory) => set({ filterCategory }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setAutoScroll: (autoScroll) => set({ autoScroll }),
  clearLogs: () => set({ logs: [] }),
}));

// Quick global logging helpers
export const logger = {
  action: (msg: string, details?: unknown) => useLogStore.getState().addLog('ACTION', 'info', msg, details),
  api: (msg: string, details?: unknown) => useLogStore.getState().addLog('COMFY_API', 'info', msg, details),
  ws: (msg: string, details?: unknown) => useLogStore.getState().addLog('WEBSOCKET', 'info', msg, details),
  workflow: (msg: string, details?: unknown) => useLogStore.getState().addLog('WORKFLOW', 'info', msg, details),
  system: (msg: string, details?: unknown) => useLogStore.getState().addLog('SYSTEM', 'info', msg, details),
  warn: (msg: string, details?: unknown) => useLogStore.getState().addLog('SYSTEM', 'warn', msg, details),
  error: (msg: string, details?: unknown) => useLogStore.getState().addLog('ERROR', 'error', msg, details),
  success: (msg: string, details?: unknown) => useLogStore.getState().addLog('ACTION', 'success', msg, details),
};
