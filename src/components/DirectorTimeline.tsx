import React from 'react';
import { useShotStore } from '../stores/useShotStore';
import { LightingStyle, LightingDirection, AspectRatio } from '../types/shotspec';
import { Clock, Sun, Sparkles, Layers, Sliders } from 'lucide-react';

const ASPECT_RATIOS: { value: AspectRatio; label: string; desc: string }[] = [
  { value: '16:9', label: '16:9', desc: 'Widescreen Standard' },
  { value: '2.39:1', label: '2.39:1', desc: 'Anamorphic Cinema' },
  { value: '9:16', label: '9:16', desc: 'Vertical Mobile' },
  { value: '4:3', label: '4:3', desc: 'Classic Academy' },
  { value: '1:1', label: '1:1', desc: 'Square Frame' },
];

const LIGHTING_STYLES: { value: LightingStyle; label: string }[] = [
  { value: 'cinematic-natural', label: 'Cinematic Natural' },
  { value: 'low-key-film-noir', label: 'Low-Key Film Noir' },
  { value: 'neon-cyberpunk', label: 'Neon Cyberpunk' },
  { value: 'golden-hour', label: 'Golden Hour' },
  { value: 'moonlight-foggy', label: 'Moonlight Fog' },
  { value: 'practical-candlelight', label: 'Practical Candlelight' },
  { value: 'high-key-studio', label: 'High-Key Commercial' },
  { value: 'harsh-fluorescent', label: 'Industrial Fluorescent' },
];

const LIGHTING_DIRS: { value: LightingDirection; label: string }[] = [
  { value: 'side-key', label: 'Side Key' },
  { value: 'front-soft', label: 'Front Soft' },
  { value: 'rim-backlit', label: 'Rim / Backlit' },
  { value: 'overhead-top', label: 'Overhead Top' },
  { value: 'underlit-dramatic', label: 'Underlit Dramatic' },
];

export const DirectorTimeline: React.FC = () => {
  const {
    shot,
    updateDuration,
    updateAspectRatio,
    setLighting,
    setSceneDescription,
    setNegativePrompt,
    updateShotName,
  } = useShotStore();

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      <div className="flex items-center justify-between border-b border-director-border pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-director-gold" />
          <span className="font-display font-bold text-sm tracking-wider uppercase text-white">
            Shot & Environment Deck
          </span>
        </div>
      </div>

      {/* Shot Title */}
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] text-slate-400">Shot Name / Slate</label>
        <input
          type="text"
          value={shot.name}
          onChange={(e) => updateShotName(e.target.value)}
          placeholder="Shot 01 — The Discovery"
          className="glass-control rounded px-2.5 py-1.5 font-display font-semibold text-white text-xs"
        />
      </div>

      {/* Duration Slider */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between font-mono text-[11px] text-slate-300">
          <span className="flex items-center gap-1">
            <Sliders className="h-3 w-3 text-director-amber" />
            Shot Duration:
          </span>
          <span className="text-director-gold font-bold">{shot.durationSeconds.toFixed(1)}s</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1.0}
            max={8.0}
            step={0.5}
            value={shot.durationSeconds}
            onChange={(e) => updateDuration(parseFloat(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-director-surface accent-director-gold"
          />
          <span className="font-mono text-[10px] text-slate-400">{Math.round(shot.durationSeconds * shot.frameRate)} frames</span>
        </div>
      </div>

      {/* Aspect Ratio Selector */}
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
          <Layers className="h-3 w-3 text-director-cyan" />
          Aspect Ratio (Framing)
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {ASPECT_RATIOS.map((r) => {
            const isSelected = shot.aspectRatio === r.value;
            return (
              <button
                key={r.value}
                onClick={() => updateAspectRatio(r.value)}
                className={`flex flex-col items-center justify-center rounded p-1.5 transition-all ${
                  isSelected
                    ? 'border-director-cyan bg-director-cyan/15 text-white ring-1 ring-director-cyan font-bold'
                    : 'glass-control text-slate-300 hover:text-white'
                }`}
              >
                <span className="font-mono text-xs">{r.label}</span>
                <span className="text-[9px] text-slate-400 font-sans truncate">{r.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lighting Style & Direction */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
            <Sun className="h-3 w-3 text-director-gold" />
            Lighting Mood
          </label>
          <select
            value={shot.lighting.style}
            onChange={(e) => setLighting(e.target.value as LightingStyle)}
            className="glass-control rounded p-1.5 font-sans text-xs text-white"
          >
            {LIGHTING_STYLES.map((l) => (
              <option key={l.value} value={l.value} className="bg-director-panel text-white">
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] text-slate-400">Direction</label>
          <select
            value={shot.lighting.direction}
            onChange={(e) => setLighting(shot.lighting.style, e.target.value as LightingDirection)}
            className="glass-control rounded p-1.5 font-sans text-xs text-white"
          >
            {LIGHTING_DIRS.map((d) => (
              <option key={d.value} value={d.value} className="bg-director-panel text-white">
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scene Context Prompt */}
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-director-amber" />
          Environment & Scene Setting
        </label>
        <textarea
          value={shot.sceneDescription}
          onChange={(e) => setSceneDescription(e.target.value)}
          rows={3}
          placeholder="Describe the environment, architecture, time of day, atmosphere..."
          className="glass-control rounded p-2 text-slate-200 text-xs resize-none"
        />
      </div>

      {/* Negative Prompt */}
      <div className="flex flex-col gap-1">
        <label className="font-mono text-[10px] text-slate-400">Negative Prompt (Defects to avoid)</label>
        <textarea
          value={shot.negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          rows={2}
          placeholder="Defects to suppress..."
          className="glass-control rounded p-2 text-slate-400 text-xs resize-none"
        />
      </div>
    </div>
  );
};
