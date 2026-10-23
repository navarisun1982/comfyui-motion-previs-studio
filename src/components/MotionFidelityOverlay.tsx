import React, { useState } from 'react';
import { MotionFidelityAnalysis } from '../pipeline/revisionTypes';
import {
  Compass,
  HelpCircle,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  Wand2,
} from 'lucide-react';

interface MotionFidelityOverlayProps {
  analysis: MotionFidelityAnalysis;
  showVectorsDefault?: boolean;
  onAutoSteer?: () => void;
}

export const MotionFidelityOverlay: React.FC<MotionFidelityOverlayProps> = ({
  analysis,
  showVectorsDefault = true,
  onAutoSteer,
}) => {
  const [showVectors, setShowVectors] = useState<boolean>(showVectorsDefault);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40';
    if (score >= 70) return 'text-blue-400 bg-blue-500/20 border-blue-500/40';
    if (score >= 50) return 'text-amber-400 bg-amber-500/20 border-amber-500/40';
    return 'text-rose-400 bg-rose-500/20 border-rose-500/40';
  };

  const getScoreBadgeText = (classification: MotionFidelityAnalysis['classification']) => {
    switch (classification) {
      case 'excellent':
        return 'EXCELLENT MATCH';
      case 'good':
        return 'GOOD ALIGNMENT';
      case 'fair':
        return 'MODERATE DRIFT';
      case 'drift':
      default:
        return 'CAMERA DRIFT';
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-10 flex flex-col justify-between p-2.5">
      {/* SVG Vector Field Layer */}
      {showVectors && analysis.gridVectors && analysis.gridVectors.length > 0 && (
        <svg className="absolute inset-0 h-full w-full pointer-events-none opacity-80">
          <defs>
            <marker
              id="vectorArrow"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
          </defs>
          {analysis.gridVectors.map((pt, idx) => {
            const startX = pt.x * 100;
            const startY = pt.y * 100;
            // Scale vector for clean visibility
            const endX = startX + pt.dx * 3;
            const endY = startY + pt.dy * 3;

            return (
              <g key={idx}>
                <line
                  x1={`${startX}%`}
                  y1={`${startY}%`}
                  x2={`${endX}%`}
                  y2={`${endY}%`}
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  markerEnd="url(#vectorArrow)"
                  className="transition-all duration-300"
                />
                <circle cx={`${startX}%`} cy={`${startY}%`} r="1.5" fill="#f59e0b" />
              </g>
            );
          })}
        </svg>
      )}

      {/* Top Header: Score Badge & Vector Toggle Button */}
      <div className="flex items-center justify-between pointer-events-auto">
        <div
          onClick={() => setShowDetails(!showDetails)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[10px] font-bold backdrop-blur-md shadow-lg cursor-pointer transition-all hover:scale-105 active:scale-95 ${getScoreColor(
            analysis.overallScore
          )}`}
          title="Click to view detailed directorial breakdown"
        >
          <Compass className="h-3.5 w-3.5" />
          <span>{analysis.overallScore}% FIDELITY</span>
          <span className="text-[9px] opacity-80">• {getScoreBadgeText(analysis.classification)}</span>
        </div>

        <button
          onClick={() => setShowVectors(!showVectors)}
          className="flex items-center gap-1 rounded bg-black/70 hover:bg-black/90 px-2 py-1 font-mono text-[9px] text-slate-300 border border-white/10 backdrop-blur-sm transition-colors"
          title={showVectors ? 'Hide motion vectors' : 'Show optical flow vectors'}
        >
          {showVectors ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          <span>{showVectors ? 'Vectors' : 'Vectors'}</span>
        </button>
      </div>

      {/* Directed vs Achieved Trajectory Compass (Bottom Bar) */}
      <div className="flex items-end justify-between pointer-events-auto">
        <div className="flex items-center gap-2 rounded-lg bg-black/75 p-1.5 border border-white/10 backdrop-blur-md font-mono text-[9px]">
          <div className="flex items-center gap-1 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>DIRECTED:</span>
            <strong className="uppercase">{analysis.directedMovement}</strong>
          </div>
          <ArrowRight className="h-3 w-3 text-slate-500" />
          <div className="flex items-center gap-1 text-blue-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            <span>ACHIEVED:</span>
            <strong className="uppercase">{analysis.detectedMovement}</strong>
          </div>
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="rounded-lg bg-black/75 hover:bg-black/90 p-1.5 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition-colors"
          title="Directorial guidance details"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded Directorial Details Popover */}
      {showDetails && (
        <div className="absolute inset-x-2 top-11 bottom-11 z-30 pointer-events-auto rounded-xl border border-white/15 bg-black/90 backdrop-blur-xl p-3 flex flex-col gap-2 overflow-y-auto text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5 font-mono text-[10px]">
            <div className="flex items-center gap-1.5 text-director-gold font-bold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Directorial Motion Assessment</span>
            </div>
            <button
              onClick={() => setShowDetails(false)}
              className="text-slate-400 hover:text-white p-0.5"
            >
              ✕
            </button>
          </div>

          <p className="font-sans text-[11px] text-slate-300 leading-snug">
            {analysis.summary}
          </p>

          {/* Metric gauges */}
          <div className="grid grid-cols-3 gap-2 font-mono text-[9px] pt-1">
            <div className="rounded bg-white/5 p-2 border border-white/5 flex flex-col gap-1">
              <span className="text-slate-400">Directional</span>
              <span className="text-xs font-bold text-white">{analysis.directionalScore}%</span>
            </div>
            <div className="rounded bg-white/5 p-2 border border-white/5 flex flex-col gap-1">
              <span className="text-slate-400">Speed Match</span>
              <span className="text-xs font-bold text-white">{analysis.speedScore}%</span>
            </div>
            <div className="rounded bg-white/5 p-2 border border-white/5 flex flex-col gap-1">
              <span className="text-slate-400">Stability</span>
              <span className="text-xs font-bold text-white">{analysis.stabilityScore}%</span>
            </div>
          </div>

          {/* Recommendations */}
          <div className="flex flex-col gap-1 pt-1 border-t border-white/10">
            <span className="font-mono text-[10px] font-bold text-director-cyan">
              Director Recommendations:
            </span>
            <ul className="flex flex-col gap-1 pl-4 list-disc text-[10px] text-slate-300 font-sans">
              {analysis.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>

          {onAutoSteer && (
            <button
              onClick={() => {
                setShowDetails(false);
                onAutoSteer();
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-director-gold to-amber-500 text-black px-3 py-1.5 font-mono text-[10px] font-bold transition-all hover:brightness-110 active:scale-95 shadow-md cursor-pointer mt-1"
            >
              <Wand2 className="h-3.5 w-3.5 fill-current" />
              <span>Auto-Steer Next Take</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
