import React from 'react';
import { useShotStore } from '../stores/useShotStore';
import { Users, Plus, Trash2, Clock, UserCheck } from 'lucide-react';

export const ActorBlocking: React.FC = () => {
  const { shot, updateActor, addActor, removeActor } = useShotStore();

  return (
    <div className="flex flex-col gap-4 p-4 text-xs">
      <div className="flex items-center justify-between border-b border-director-border pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-emerald-400" />
          <span className="font-display font-bold text-sm tracking-wider uppercase text-white">
            Actor & Subject Blocking
          </span>
        </div>
        <button
          onClick={() => addActor()}
          className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-1 font-mono text-[10px] text-emerald-400 border border-emerald-500/30 transition-all hover:bg-emerald-500/30 active:scale-95"
        >
          <Plus className="h-3 w-3" />
          Add Subject
        </button>
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
              </div>

              {shot.actors.length > 1 && (
                <button
                  onClick={() => removeActor(actor.id)}
                  className="text-slate-400 hover:text-rose-400 transition-colors p-1"
                  title="Remove Subject"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
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
