import React from 'react';
import { useShotStore } from '../stores/useShotStore';
import { Users, Trash2, Clock, UserCheck, Bookmark, BookmarkPlus } from 'lucide-react';

export const ActorBlocking: React.FC = () => {
  const {
    shot,
    updateActor,
    addActor,
    removeActor,
    sceneCastPool,
    addToCastPool,
    removeFromCastPool,
    importFromCastPool,
  } = useShotStore();

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      <div className="flex items-center justify-between border-b border-director-border pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-emerald-400" />
          <span className="font-display font-bold text-sm tracking-wider uppercase text-white">
            Actor & Subject Blocking
          </span>
        </div>
        <div className="flex items-center gap-1">
          <select
            onChange={(e) => {
              if (e.target.value) {
                addActor(undefined, e.target.value as any);
                e.target.value = '';
              }
            }}
            defaultValue=""
            className="rounded bg-emerald-500/20 px-2 py-1 font-mono text-[10px] text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all cursor-pointer"
          >
            <option value="" disabled>+ Add Subject / Prop...</option>
            <option value="human">👤 Human Actor</option>
            <option value="car">🚗 Car (Primitive)</option>
            <option value="table">🪑 Table (Furniture)</option>
            <option value="tree">🌲 Tree (Nature)</option>
            <option value="chair">💺 Chair (Furniture)</option>
            <option value="prop">📦 Cargo Prop Crate</option>
          </select>
        </div>
      </div>

      {/* Scene Cast Pool (Persistent cross-shot character roster) */}
      <div className="rounded-lg bg-director-darkest/90 border border-emerald-500/30 p-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-300 font-bold">
            <Bookmark className="h-3.5 w-3.5 text-emerald-400" />
            <span>SCENE CAST POOL ({sceneCastPool.length})</span>
          </div>
          <span className="text-[9px] text-slate-500 font-mono">Persistent Across All Shots</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sceneCastPool.map((cActor) => (
            <div
              key={cActor.id}
              className="flex items-center gap-1 rounded bg-slate-900 border border-slate-700/80 px-2 py-1 text-[10px] font-mono text-slate-300"
            >
              <span>{cActor.kind === 'creature' ? '🐾' : cActor.kind === 'vehicle' ? '🚗' : '👤'}</span>
              <span className="font-bold text-white max-w-[95px] truncate">{cActor.name}</span>
              <button
                onClick={() => importFromCastPool(cActor.id)}
                className="ml-1 px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold border border-emerald-500/30 text-[9px] transition-all cursor-pointer"
                title={`Cast "${cActor.name}" into current shot`}
              >
                + Cast
              </button>
              <button
                onClick={() => removeFromCastPool(cActor.id)}
                className="text-slate-500 hover:text-red-400 transition-colors ml-0.5 cursor-pointer"
                title="Remove from cast pool"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {shot.actors.map((actor, idx) => (
          <div key={actor.id} className="glass-card rounded-lg p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300 font-mono text-[10px] font-bold">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={actor.name}
                  onChange={(e) => updateActor(actor.id, { name: e.target.value })}
                  placeholder="Subject Name"
                  className="bg-transparent font-display font-semibold text-white text-xs focus:outline-none focus:border-b border-director-gold"
                />
                <select
                  value={actor.kind || 'human'}
                  onChange={(e) => updateActor(actor.id, { kind: e.target.value as any })}
                  className="bg-slate-800 text-[10px] text-slate-300 rounded px-1.5 py-0.5 border border-slate-700 font-mono"
                  title="3D Primitive Shape Type"
                >
                  <option value="human">👤 Human</option>
                  <option value="car">🚗 Car</option>
                  <option value="table">🪑 Table</option>
                  <option value="tree">🌲 Tree</option>
                  <option value="chair">💺 Chair</option>
                  <option value="prop">📦 Prop Crate</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => addToCastPool(actor)}
                  className="text-slate-400 hover:text-emerald-400 transition-colors p-1"
                  title="Save character to Scene Cast Pool (reusable across all shots)"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeActor(actor.id)}
                  className="text-slate-400 hover:text-rose-400 transition-colors p-1"
                  title="Remove Subject from stage"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Character Descriptor / Visual Token */}
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
                <UserCheck className="h-3 w-3 text-emerald-400" />
                Character Description (Token)
              </label>
              <input
                type="text"
                value={actor.token}
                onChange={(e) => updateActor(actor.id, { token: e.target.value })}
                placeholder="e.g. a cybernetic investigator in worn leather trenchcoat"
                className="glass-control rounded px-2 py-1 text-slate-200 text-xs"
              />
            </div>

            {/* Action / Movement Prompt */}
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] text-slate-400">Action & Performance Prompt</label>
              <textarea
                value={actor.actionDescription}
                onChange={(e) => updateActor(actor.id, { actionDescription: e.target.value })}
                rows={2}
                placeholder="e.g. steps out from the shadows, looks up cautiously into the rain"
                className="glass-control rounded p-2 text-slate-200 text-xs resize-none"
              />
            </div>

            {/* 3D Spatial Coordinates on Soundstage */}
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-director-border/50 font-mono text-[10px]">
              <div className="flex items-center justify-between text-slate-400">
                <span>Soundstage Position:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      updateActor(actor.id, {
                        trajectory: {
                          ...actor.trajectory,
                          startPosition: { x: 50, y: 50 },
                          endPosition: { x: 50, y: 50 },
                        },
                      })
                    }
                    className="px-1.5 py-0.2 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300"
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateActor(actor.id, {
                        trajectory: {
                          ...actor.trajectory,
                          startPosition: { x: 25, y: 50 },
                          endPosition: { x: 25, y: 50 },
                        },
                      })
                    }
                    className="px-1.5 py-0.2 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300"
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateActor(actor.id, {
                        trajectory: {
                          ...actor.trajectory,
                          startPosition: { x: 75, y: 50 },
                          endPosition: { x: 75, y: 50 },
                        },
                      })
                    }
                    className="px-1.5 py-0.2 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300"
                  >
                    Right
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateActor(actor.id, {
                        trajectory: {
                          ...actor.trajectory,
                          startPosition: { x: 50, y: 80 },
                          endPosition: { x: 50, y: 80 },
                        },
                      })
                    }
                    className="px-1.5 py-0.2 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300"
                  >
                    Deep
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-400">
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span>Stage X</span>
                    <span className="text-emerald-400 font-bold">{Math.round(actor.trajectory.startPosition.x)}</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    value={actor.trajectory.startPosition.x}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActor(actor.id, {
                        trajectory: {
                          ...actor.trajectory,
                          startPosition: { ...actor.trajectory.startPosition, x: val },
                          endPosition: { ...actor.trajectory.endPosition, x: val },
                        },
                      });
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span>Depth Z</span>
                    <span className="text-emerald-400 font-bold">{Math.round(actor.trajectory.startPosition.y)}</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    value={actor.trajectory.startPosition.y}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActor(actor.id, {
                        trajectory: {
                          ...actor.trajectory,
                          startPosition: { ...actor.trajectory.startPosition, y: val },
                          endPosition: { ...actor.trajectory.endPosition, y: val },
                        },
                      });
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Action Timing */}
            <div className="flex items-center justify-between font-mono text-[10px] text-slate-400 pt-1 border-t border-director-border/50">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-director-amber" />
                Action Start Time:
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={shot.durationSeconds}
                  step={0.1}
                  value={actor.trajectory.startTimeSeconds}
                  onChange={(e) =>
                    updateActor(actor.id, {
                      trajectory: {
                        ...actor.trajectory,
                        startTimeSeconds: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-14 rounded glass-control px-1.5 py-0.5 text-right font-mono text-xs text-white"
                />
                <span>sec</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
