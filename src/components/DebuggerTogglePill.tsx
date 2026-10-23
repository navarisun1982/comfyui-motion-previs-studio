import React from 'react';
import { useLogStore } from '../stores/useLogStore';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';

export const DebuggerTogglePill: React.FC = () => {
  const { isOpen, toggleOpen, logs } = useLogStore();
  const errorCount = logs.filter((l) => l.level === 'error').length;

  return (
    <button
      onClick={toggleOpen}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1 font-mono text-xs transition-all border ${
        isOpen
          ? 'bg-director-gold text-director-darkest border-director-gold font-bold shadow-glow-gold'
          : errorCount > 0
          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
          : 'glass-control text-slate-300 hover:text-white'
      }`}
      title="Toggle in-app debugger console (~)"
    >
      <Terminal className="h-3.5 w-3.5" />
      <span>Debugger</span>
      {errorCount > 0 ? (
        <span className="rounded bg-rose-500 text-white px-1 text-[9px] font-bold">{errorCount}</span>
      ) : (
        <span className="text-slate-500 text-[10px]">[{logs.length}]</span>
      )}
      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
    </button>
  );
};
