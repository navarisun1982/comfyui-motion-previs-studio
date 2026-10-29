import React from 'react';
import { useShotStore } from '../stores/useShotStore';
import { Users, Trash2, Clock, UserCheck, Bookmark, BookmarkPlus, Box, Activity } from 'lucide-react';
import { registerModelFile } from '../services/modelStorage';
import { preloadGltfModels } from '../engine/gltfModelLoader';
import { POSE_PRESETS } from '../engine/kinematics';
import { interpolateTrajectoryPosition } from '../engine/trajectoryMath';

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
    applyDirectorialMotion,
    updateActorPositionAtTime,
    currentTime,
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
        {shot.actors.map((actor, idx) => {
          const currentPos = interpolateTrajectoryPosition(
            actor.trajectory,
            currentTime,
            shot.durationSeconds || 4.0
          );
          return (
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
                <label
                  className="text-slate-400 hover:text-indigo-400 transition-colors p-1 cursor-pointer"
                  title={actor.modelUrl ? 'Replace attached .glb/.gltf 3D model' : 'Attach .glb/.gltf 3D model file'}
                >
                  <input
                    type="file"
                    accept=".glb,.gltf"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const registered = await registerModelFile(file);
                        await preloadGltfModels([registered.blobUrl]);
                        updateActor(actor.id, { modelUrl: registered.blobUrl });
                      } catch (err) {
                        console.error('Failed to attach 3D model:', err);
                      }
                    }}
                  />
                  <Box className={`h-3.5 w-3.5 ${actor.modelUrl ? 'text-indigo-400 fill-indigo-400/20' : ''}`} />
                </label>
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

            {/* Directorial Character Pose Preset (Kinematics) */}
            {(!actor.kind || actor.kind === 'human') && (
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10px] text-slate-400 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-director-gold" />
                    Pose Preset (IK Rig)
                  </span>
                  <span className="text-[9px] text-director-gold font-mono uppercase">
                    {actor.posePreset || 'neutral-stand'}
                  </span>
                </label>
                <select
                  value={actor.posePreset || 'neutral-stand'}
                  onChange={(e) => updateActor(actor.id, { posePreset: e.target.value })}
                  className="bg-slate-800 text-[11px] text-slate-200 rounded px-2 py-1 border border-slate-700 font-mono focus:border-director-gold focus:outline-none"
                >
                  {Object.values(POSE_PRESETS).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.category})
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-[9px] text-slate-400">Gait / Locomotion:</span>
                  <select
                    value={actor.gait || 'auto'}
                    onChange={(e) => updateActor(actor.id, { gait: e.target.value as any })}
                    className="flex-1 bg-slate-800 text-[10px] text-slate-200 rounded px-1.5 py-0.5 border border-slate-700 font-mono focus:border-director-cyan focus:outline-none"
                  >
                    <option value="auto">Auto (Walk on Move / Idle)</option>
                    <option value="walk">Walk</option>
                    <option value="run">Run</option>
                    <option value="sneak">Sneak</option>
                    <option value="idle">Idle Stance</option>
                    <option value="none">None (Frozen Pose)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Action / Movement Prompt */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                <Activity className="h-3 w-3 text-emerald-400" />
                Action & Directorial Movement Prompt
              </label>
              <textarea
                value={actor.actionDescription}
                onChange={(e) => updateActor(actor.id, { actionDescription: e.target.value })}
                rows={2}
                placeholder="e.g. walk to 2.5, 3.0 then sit down in chair / يمشي إلى 3, 2 ثم يجلس"
                className="glass-control rounded p-2 text-slate-200 text-xs resize-none"
              />
              <button
                type="button"
                onClick={() => applyDirectorialMotion(actor.id, actor.actionDescription || 'stands still')}
                className="w-full py-1.5 px-3 rounded bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white font-mono text-[10px] font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-all border border-emerald-400/40 cursor-pointer active:scale-[0.99]"
                title="Compile natural language prompt into kinematic motion keyframes with foot-grounding lock"
              >
                <Activity className="h-3.5 w-3.5 text-emerald-200" />
                <span>⚡ Compile Kinematic Motion</span>
              </button>
            </div>

            {/* 3D Spatial Coordinates on Soundstage (Complete 3-Axis: X, Elevation Y, Depth Z) */}
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-director-border/50 font-mono text-[10px]">
              <div className="flex items-center justify-between text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span>Stage Position @ {currentTime.toFixed(1)}s:</span>
                  {currentTime > 0.15 && (
                    <span className="px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[8px] font-bold border border-cyan-500/40">
                      KEYFRAME
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      updateActorPositionAtTime(
                        actor.id,
                        currentTime,
                        { x: 50, y: 50, z: currentPos.z ?? 0 },
                        shot.durationSeconds || 4.0,
                        currentTime <= 0.15 ? 'base' : 'keyframe'
                      )
                    }
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300 transition-all cursor-pointer"
                    title="Center Stage"
                  >
                    Center
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateActorPositionAtTime(
                        actor.id,
                        currentTime,
                        { x: 25, y: currentPos.y, z: currentPos.z ?? 0 },
                        shot.durationSeconds || 4.0,
                        currentTime <= 0.15 ? 'base' : 'keyframe'
                      )
                    }
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300 transition-all cursor-pointer"
                    title="Stage Left"
                  >
                    Left
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateActorPositionAtTime(
                        actor.id,
                        currentTime,
                        { x: 75, y: currentPos.y, z: currentPos.z ?? 0 },
                        shot.durationSeconds || 4.0,
                        currentTime <= 0.15 ? 'base' : 'keyframe'
                      )
                    }
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300 transition-all cursor-pointer"
                    title="Stage Right"
                  >
                    Right
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateActorPositionAtTime(
                        actor.id,
                        currentTime,
                        { x: currentPos.x, y: 25, z: currentPos.z ?? 0 },
                        shot.durationSeconds || 4.0,
                        currentTime <= 0.15 ? 'base' : 'keyframe'
                      )
                    }
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300 transition-all cursor-pointer"
                    title="Deep Stage (Upstage)"
                  >
                    Deep
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateActorPositionAtTime(
                        actor.id,
                        currentTime,
                        { x: currentPos.x, y: 75, z: currentPos.z ?? 0 },
                        shot.durationSeconds || 4.0,
                        currentTime <= 0.15 ? 'base' : 'keyframe'
                      )
                    }
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300 transition-all cursor-pointer"
                    title="Fore Stage (Downstage)"
                  >
                    Fore
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateActorPositionAtTime(
                        actor.id,
                        currentTime,
                        { x: currentPos.x, y: currentPos.y, z: 12 },
                        shot.durationSeconds || 4.0,
                        currentTime <= 0.15 ? 'base' : 'keyframe'
                      )
                    }
                    className="px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[9px] transition-all border border-amber-500/20 cursor-pointer"
                    title="Lift off floor"
                  >
                    Float
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-slate-400">
                {/* Stage X Slider */}
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-cyan-300 font-medium">Stage X</span>
                    <span className="text-cyan-400 font-bold">{Math.round(currentPos.x)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={currentPos.x}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActorPositionAtTime(
                        actor.id,
                        currentTime,
                        {
                          x: val,
                          y: currentPos.y,
                          z: currentPos.z ?? 0,
                        },
                        shot.durationSeconds || 4.0,
                        currentTime <= 0.15 ? 'base' : 'keyframe'
                      );
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-cyan-400"
                    title="Stage Lateral X (Left ↔ Right)"
                  />
                </div>

                {/* Elevation Y Slider (Vertical / Height) */}
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-amber-300 font-medium">Height Y</span>
                    <span className="text-amber-400 font-bold">{Math.round(currentPos.z ?? 0)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={0.5}
                    value={currentPos.z ?? 0}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActorPositionAtTime(
                        actor.id,
                        currentTime,
                        {
                          x: currentPos.x,
                          y: currentPos.y,
                          z: val,
                        },
                        shot.durationSeconds || 4.0,
                        currentTime <= 0.15 ? 'base' : 'keyframe'
                      );
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-amber-400"
                    title="Elevation Y (Floor ↔ Sky)"
                  />
                </div>

                {/* Depth Z Slider */}
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-emerald-300 font-medium">Depth Z</span>
                    <span className="text-emerald-400 font-bold">{Math.round(currentPos.y)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={currentPos.y}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActorPositionAtTime(
                        actor.id,
                        currentTime,
                        {
                          x: currentPos.x,
                          y: val,
                          z: currentPos.z ?? 0,
                        },
                        shot.durationSeconds || 4.0,
                        currentTime <= 0.15 ? 'base' : 'keyframe'
                      );
                    }}
                    className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
                    title="Stage Depth Z (Fore ↔ Deep)"
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
        );
      })}
      </div>
    </div>
  );
};
