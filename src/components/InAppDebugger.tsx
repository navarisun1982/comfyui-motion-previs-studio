import React, { useRef, useEffect, useState } from 'react';
import { useLogStore, LogCategory, LogEntry } from '../stores/useLogStore';
import { useShotStore } from '../stores/useShotStore';
import {
  Terminal,
  Trash2,
  Copy,
  Search,
  ChevronDown,
  Maximize2,
  Minimize2,
  Layers,
  Check,
} from 'lucide-react';

export const InAppDebugger: React.FC = () => {
  const {
    logs,
    isOpen,
    toggleOpen,
    clearLogs,
    filterCategory,
    setFilterCategory,
    searchQuery,
    setSearchQuery,
    autoScroll,
    setAutoScroll,
  } = useLogStore();

  const { shot } = useShotStore();

  const [activeTab, setActiveTab] = useState<'console' | 'shotspec'>('console');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new log
  useEffect(() => {
    if (autoScroll && scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isOpen]);

  const filteredLogs = logs.filter((l) => {
    if (filterCategory !== 'ALL' && l.category !== filterCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        l.message.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        (l.details && JSON.stringify(l.details).toLowerCase().includes(q))
      );
    }
    return true;
  });

  const errorCount = logs.filter((l) => l.level === 'error').length;

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.timeStr}] [${l.category}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const heightClass = isExpanded ? 'h-96' : 'h-64';

  const categoryBadgeColor = (cat: LogCategory) => {
    switch (cat) {
      case 'ACTION':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'COMFY_API':
        return 'text-director-gold bg-director-gold/10 border-director-gold/30';
      case 'WEBSOCKET':
        return 'text-director-cyan bg-director-cyan/10 border-director-cyan/30';
      case 'WORKFLOW':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      case 'ERROR':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30 font-bold';
      case 'SYSTEM':
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
    }
  };

  const levelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-rose-400 font-semibold';
      case 'warn':
        return 'text-amber-400';
      case 'success':
        return 'text-emerald-300';
      case 'info':
      default:
        return 'text-slate-200';
    }
  };

  return (
    <div
      className={`flex w-full flex-col border-t border-director-border bg-director-darkest/98 shadow-2xl backdrop-blur-xl transition-all duration-200 z-40 ${heightClass}`}
    >
      {/* Debugger Dock Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-director-border bg-director-panel px-4 font-mono text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-bold text-director-gold">
            <Terminal className="h-4 w-4" />
            <span>IN-APP DEBUGGER & ACTION CONSOLE</span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-l border-director-border/70 pl-3">
            <button
              onClick={() => setActiveTab('console')}
              className={`rounded px-2 py-0.5 text-[11px] transition-all ${
                activeTab === 'console'
                  ? 'bg-director-gold text-director-darkest font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Console ({logs.length})
            </button>
            <button
              onClick={() => setActiveTab('shotspec')}
              className={`rounded px-2 py-0.5 text-[11px] transition-all flex items-center gap-1 ${
                activeTab === 'shotspec'
                  ? 'bg-director-cyan text-director-darkest font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="h-3 w-3" />
              ShotSpec State
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-400 font-bold border border-rose-500/30">
              {errorCount} Error(s)
            </span>
          )}

          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1 rounded glass-control px-2 py-0.5 text-[10px] text-slate-300 hover:text-white"
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            onClick={clearLogs}
            className="flex items-center gap-1 rounded glass-control px-2 py-0.5 text-[10px] text-slate-400 hover:text-rose-400"
            title="Clear all logs"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded glass-control p-1 text-slate-400 hover:text-white"
            title={isExpanded ? 'Restore size' : 'Expand panel'}
          >
            {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>

          <button
            onClick={toggleOpen}
            className="rounded glass-control p-1 text-slate-400 hover:text-white"
            title="Close debugger dock"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tab 1: Live Console Stream */}
      {activeTab === 'console' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Filter Toolbar */}
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-director-border/60 bg-director-darkest px-3 font-mono text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">FILTER:</span>
              {(['ALL', 'ACTION', 'COMFY_API', 'WEBSOCKET', 'WORKFLOW', 'ERROR'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`rounded px-1.5 py-0.2 transition-all ${
                    filterCategory === cat
                      ? 'bg-director-surface text-white font-bold border border-director-border'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {/* Search Box */}
              <div className="flex items-center gap-1 rounded bg-director-surface px-2 py-0.5 border border-director-border/60">
                <Search className="h-2.5 w-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-white text-[10px] focus:outline-none w-28"
                />
              </div>

              <label className="flex items-center gap-1 cursor-pointer text-slate-400">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded bg-director-surface"
                />
                Auto-Scroll
              </label>
            </div>
          </div>

          {/* Log Stream Body */}
          <div className="flex flex-1 overflow-hidden">
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-2 font-mono text-[11px] divide-y divide-director-border/20"
            >
              {filteredLogs.length === 0 ? (
                <div className="p-4 text-center text-slate-500">No logs matching active filters.</div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                    className={`flex items-start gap-2.5 px-2 py-1 cursor-pointer transition-colors hover:bg-director-surface/50 ${
                      selectedLog?.id === log.id ? 'bg-director-surface border-l-2 border-director-gold' : ''
                    }`}
                  >
                    <span className="text-[10px] text-slate-500 shrink-0 select-none">{log.timeStr}</span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] border shrink-0 ${categoryBadgeColor(
                        log.category
                      )}`}
                    >
                      {log.category}
                    </span>
                    <span className={`flex-1 break-all ${levelColor(log.level)}`}>{log.message}</span>
                    {log.details ? (
                      <span className="text-[9px] text-slate-500 shrink-0 font-sans">
                        {selectedLog?.id === log.id ? '▲ hide' : '▼ json'}
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {/* Selected Log JSON Detail Viewer */}
            {selectedLog && selectedLog.details !== undefined && (
              <div className="w-80 shrink-0 border-l border-director-border bg-director-panel p-3 overflow-y-auto font-mono text-[10px]">
                <div className="flex items-center justify-between border-b border-director-border/60 pb-1.5 mb-2">
                  <span className="font-bold text-director-gold">LOG PAYLOAD DETAILS</span>
                  <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white">
                    ✕
                  </button>
                </div>
                <pre className="text-slate-300 whitespace-pre-wrap break-all leading-tight">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Live ShotSpec State */}
      {activeTab === 'shotspec' && (
        <div className="flex flex-1 overflow-y-auto p-4 bg-director-darkest font-mono text-xs">
          <pre className="text-slate-200 leading-relaxed whitespace-pre-wrap">
            {JSON.stringify(shot, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export { DebuggerTogglePill } from './DebuggerTogglePill';

