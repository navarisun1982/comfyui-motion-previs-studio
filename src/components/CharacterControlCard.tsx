import React, { useRef } from 'react';
import { Actor, Point2D, Point3D } from '../types/shotspec';
import { HumanoidBone } from '../engine/procedural3D/sculptSpec';
import {
  POSE_PRESETS,
  detectObjectPoseCategory,
  getObjectPosePresetsForCategory,
  findObjectPosePresetById,
  getObjectAwareStagePlacements,
  OBJECT_CATEGORY_LABELS,
  getReadyMadeMotionsForCategory,
  HumanoidMotionGroup,
} from '../engine/kinematics';
import { interpolateTrajectoryPosition } from '../engine/trajectoryMath';
import {
  Trash2,
  Upload,
  Sparkles,
  Loader2,
  Maximize2,
  Activity,
  Link2,
  Unlink,
  Clock,
  ChevronDown,
  ChevronRight,
  Pencil,
  Bookmark,
  MapPin,
  Repeat,
  Palette,
  Grid,
  ArrowUpDown,
  Box,
  RotateCcw,
  Clapperboard,
  Footprints,
  Play,
  Check,
  SlidersHorizontal,
  User,
} from 'lucide-react';

export const OBJECT_TARGET_PALETTE = [
  { hex: '#ef4444', name: 'Red' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#10b981', name: 'Green' },
  { hex: '#eab308', name: 'Yellow' },
  { hex: '#a855f7', name: 'Purple' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#ec4899', name: 'Magenta' },
] as const;

export const HUMANOID_SOCKET_BONES: { id: HumanoidBone; label: string }[] = [
  { id: 'RightHand', label: 'Right Hand' },
  { id: 'LeftHand', label: 'Left Hand' },
  { id: 'Head', label: 'Head' },
  { id: 'Spine', label: 'Back / Spine' },
  { id: 'Hips', label: 'Waist / Hips' },
  { id: 'RightFoot', label: 'Right Foot' },
  { id: 'LeftFoot', label: 'Left Foot' },
];

export interface CharacterControlCardProps {
  actor: Actor;
  allActors: Actor[];
  humanoidActors: Actor[];
  shotDurationSeconds: number;
  sceneDescription: string;
  currentTime: number;
  isSelected: boolean;
  isCollapsed: boolean;
  isFineTuneOpen: boolean;
  isMotionSectionOpen?: boolean;
  isTimingSectionOpen?: boolean;
  motionWindow: { start: number; end: number };
  activeHumanGroup: HumanoidMotionGroup;
  travelMode: 'auto' | 'travel' | 'in-place';
  refiningActorId: string | null;
  generatingActingId: string | null;
  socketTargetActorId: string;
  socketTargetBone: HumanoidBone;
  onSelectActor: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onToggleFineTune: (id: string) => void;
  onToggleMotionSection?: (id: string) => void;
  onToggleTimingSection?: (id: string) => void;
  onUpdateMotionWindow: (id: string, win: { start: number; end: number }) => void;
  onUpdateHumanGroup: (id: string, group: HumanoidMotionGroup) => void;
  onUpdateTravelMode: (id: string, mode: 'auto' | 'travel' | 'in-place') => void;
  onUpdateActor: (id: string, patch: Partial<Actor>) => void;
  onRemoveActor: (id: string) => void;
  onAddToCastPool: (actor: Actor) => void;
  onUpdateActorPositionAtTime: (id: string, time: number, pos: Point2D, duration: number) => void;
  onApplyReadyMadeMotion: (
    id: string,
    clipId: string,
    options?: {
      startTimeSec?: number;
      endTimeSec?: number;
      travelMode?: 'auto' | 'travel' | 'in-place';
    }
  ) => void;
  onDirectCustomAction: (actor: Actor, actionText: string, safeStart: number, safeEnd: number, cueDuration: number) => Promise<void>;
  onRefineObjectByPrompt: (actor: Actor) => Promise<void>;
  onAttachGlbFile: (actorId: string, file: File) => Promise<void>;
  onSocketActorToBone: (actorId: string, targetActorId: string, bone: HumanoidBone) => void;
  onUnsocketActor: (actorId: string) => void;
  onChangeSocketTargetActor: (targetId: string) => void;
  onChangeSocketTargetBone: (bone: HumanoidBone) => void;
}

export const CharacterControlCard: React.FC<CharacterControlCardProps> = ({
  actor,
  allActors,
  humanoidActors,
  shotDurationSeconds,
  currentTime,
  isSelected,
  isCollapsed,
  isFineTuneOpen,
  isMotionSectionOpen = true,
  isTimingSectionOpen = true,
  motionWindow,
  activeHumanGroup,
  travelMode,
  refiningActorId,
  generatingActingId,
  socketTargetActorId,
  socketTargetBone,
  onSelectActor,
  onToggleCollapse,
  onToggleFineTune,
  onToggleMotionSection,
  onToggleTimingSection,
  onUpdateMotionWindow,
  onUpdateHumanGroup,
  onUpdateTravelMode,
  onUpdateActor,
  onRemoveActor,
  onAddToCastPool,
  onUpdateActorPositionAtTime,
  onApplyReadyMadeMotion,
  onDirectCustomAction,
  onRefineObjectByPrompt,
  onAttachGlbFile,
  onSocketActorToBone,
  onUnsocketActor,
  onChangeSocketTargetActor,
  onChangeSocketTargetBone,
}) => {
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const promptInputRef = useRef<HTMLInputElement | null>(null);
  const lookPromptInputRef = useRef<HTMLInputElement | null>(null);

  const kind = actor.kind || 'human';
  const shotDur = shotDurationSeconds || 4;
  const currentPos = interpolateTrajectoryPosition(actor.trajectory, currentTime, shotDur);
  const currentX = Math.round(currentPos.x);
  const currentDepthZ = Math.round(currentPos.y);
  const currentElevationY = Math.round(currentPos.z ?? 0);

  const otherHumanoids = humanoidActors.filter((h) => h.id !== actor.id);

  const safeStart = Math.max(0, Math.min(shotDur - 0.5, motionWindow.start));
  const safeEnd = Math.max(safeStart + 0.5, Math.min(shotDur, motionWindow.end));
  const cueDuration = Number((safeEnd - safeStart).toFixed(1));
  const kfs = actor.trajectory.keyframes || [];
  const lastKfTime = kfs.length > 0 ? kfs[kfs.length - 1].time : 0;

  const objCategory = detectObjectPoseCategory(actor);
  const isHumanoid = objCategory === 'humanoid';
  const objPresets = !isHumanoid ? getObjectPosePresetsForCategory(objCategory) : [];
  const rot: Point3D = actor.rotation || { x: 0, y: 0, z: 0 };

  const placements = getObjectAwareStagePlacements(actor, allActors, (a) => {
    const pos = interpolateTrajectoryPosition(a.trajectory, currentTime, shotDur);
    return { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z ?? 0) };
  });
  const relationalOpts = placements.filter((p) => p.group === 'relational');
  const objectOpts = placements.filter((p) => p.group === 'object');
  const stageOpts = placements.filter((p) => p.group === 'stage');

  const validHumanPreset =
    actor.posePreset && POSE_PRESETS[actor.posePreset]
      ? actor.posePreset
      : 'neutral-stand';
  const unifiedHumanValue =
    actor.gait && actor.gait !== 'none'
      ? `gait:${actor.gait}`
      : `pose:${validHumanPreset}`;

  const allCategoryClips = getReadyMadeMotionsForCategory(objCategory);
  const visibleClips = isHumanoid
    ? allCategoryClips.filter((c) => c.humanGroup === activeHumanGroup)
    : allCategoryClips;

  const renderSubjectAvatar = () => {
    if (kind === 'human' || kind === 'character') {
      return <User className="h-3.5 w-3.5 text-indigo-400 shrink-0" />;
    }
    const emoji =
      kind === 'car'
        ? '🚗'
        : kind === 'table'
        ? '🪑'
        : kind === 'tree'
        ? '🌲'
        : kind === 'chair'
        ? '💺'
        : kind === 'prop'
        ? '📦'
        : kind === 'cutout'
        ? '🖼️'
        : '📦';
    return <span className="text-xs leading-none shrink-0">{emoji}</span>;
  };

  return (
    <div
      data-actor-card={actor.id}
      onClick={() => onSelectActor(actor.id)}
      className={`rounded-xl p-2.5 space-y-2.5 transition-all cursor-pointer ${
        isSelected
          ? 'bg-[#0e1320] border border-blue-500/70 shadow-[0_4px_20px_-4px_rgba(37,99,235,0.22)] ring-1 ring-blue-500/30'
          : 'bg-[#0c101a] border border-white/[0.08] hover:border-white/[0.16]'
      }`}
    >
      {/* ================= A. CHARACTER HEADER ================= */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* Collapse / Expand Card */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(actor.id);
            }}
            aria-label={isCollapsed ? 'Expand character panel' : 'Collapse character panel'}
            className="p-1 rounded-md hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors shrink-0"
            title={isCollapsed ? 'Expand controls' : 'Collapse controls'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Character Color Indicator */}
          <label
            onClick={(e) => e.stopPropagation()}
            className="relative flex items-center cursor-pointer shrink-0"
            title={actor.color ? `Target Color: ${actor.color} (Click to change)` : 'Default Color (Click to set Scene ID color)'}
          >
            <input
              type="color"
              value={actor.color || '#eab308'}
              onChange={(e) => onUpdateActor(actor.id, { color: e.target.value })}
              className="sr-only"
            />
            <span
              className="h-3 w-3 rounded-full border border-white/40 shadow-sm hover:scale-110 transition-transform"
              style={{ backgroundColor: actor.color || '#eab308' }}
            />
          </label>

          {/* Avatar / Type Icon */}
          {renderSubjectAvatar()}

          {/* Editable Character Name + Pencil Affordance */}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <input
              ref={nameInputRef}
              type="text"
              value={actor.name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdateActor(actor.id, { name: e.target.value })}
              className="bg-transparent font-semibold text-white text-[12px] focus:outline-none min-w-[60px] w-full border-b border-transparent focus:border-blue-400/70 truncate"
              title="Click to rename subject"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                nameInputRef.current?.focus();
                nameInputRef.current?.select();
              }}
              className="text-slate-500 hover:text-slate-300 p-0.5 rounded shrink-0"
              title="Rename subject"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>

        {/* Right Header Controls: Type Badge, Save to Cast, Delete */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-md bg-[#161c2c] border border-white/[0.08] px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-indigo-200/90 uppercase">
            <span>{kind}</span>
          </span>

          {isCollapsed && (
            <span className="font-mono text-[9.5px] text-cyan-300 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20">
              {currentX},{currentDepthZ}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCastPool(actor);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-100 border border-indigo-400/35 text-[10.5px] font-medium transition-colors"
            title="Save character/prop to Scene Cast Pool for cross-shot continuity"
          >
            <Bookmark className="h-2.5 w-2.5 text-indigo-300" />
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveActor(actor.id);
            }}
            aria-label={`Delete ${actor.name}`}
            className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 p-1 rounded-md border border-transparent hover:border-rose-500/30 transition-colors"
            title="Remove from stage"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ================= CARD BODY ================= */}
      {!isCollapsed && (
        <div className="space-y-2.5 pt-2 border-t border-white/[0.07]" onClick={(e) => e.stopPropagation()}>
          {/* ================= B. MOTION STUDIO ================= */}
          <div className="inspector-section space-y-2.5">
            {/* Motion Studio Header + Auto / Move / Spot Segmented Control */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onToggleMotionSection?.(actor.id)}
                className="flex items-center gap-1.5 text-left group"
                title="Toggle Ready-Made Motions section"
              >
                <span className="text-emerald-400 text-sm leading-none">🏃</span>
                <span className="text-[11.5px] font-semibold text-emerald-300 group-hover:text-emerald-200 tracking-tight">
                  Ready-Made Motions
                </span>
              </button>

              {/* Segmented Travel Mode Control: Auto | Move | Spot */}
              <div
                className="inline-flex items-center rounded-lg bg-[#090c14] p-0.5 border border-white/[0.08] text-[10.5px]"
                role="group"
                aria-label="Motion Floor Travel Mode"
              >
                {(
                  [
                    { id: 'auto', label: 'Auto', icon: '⚡', tip: 'Auto: Locomotion travels across floor; acting/combat stays on spot' },
                    { id: 'travel', label: 'Move', icon: '🚶', tip: 'Move: Travel across the stage floor while performing motion' },
                    { id: 'in-place', label: 'Spot', icon: '📍', tip: 'Spot: Lock to current floor coordinates and perform motion in-place' },
                  ] as const
                ).map((mMode) => {
                  const isActiveMode = travelMode === mMode.id;
                  return (
                    <button
                      key={mMode.id}
                      type="button"
                      onClick={() => {
                        onUpdateTravelMode(actor.id, mMode.id);
                        onSelectActor(actor.id);
                        const clipToApply =
                          actor.motionClip ||
                          visibleClips[0]?.id ||
                          allCategoryClips[0]?.id;
                        if (clipToApply) {
                          onApplyReadyMadeMotion(actor.id, clipToApply, {
                            startTimeSec: safeStart,
                            endTimeSec: safeEnd,
                            travelMode: mMode.id,
                          });
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-all ${
                        isActiveMode
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title={mMode.tip}
                    >
                      <span className="text-[10px]">{mMode.icon}</span>
                      <span>{mMode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {isMotionSectionOpen && (
              <>
                {/* Humanoid Category Segmented Tabs: Move / Jump | Fight / Action | Act / Emote */}
                {isHumanoid && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'move', label: 'Move / Jump', icon: '🏃' },
                        { id: 'combat', label: 'Fight / Action', icon: '⚔️' },
                        { id: 'acting', label: 'Act / Emote', icon: '🎭' },
                      ] as const
                    ).map((tab) => {
                      const isTabActive = activeHumanGroup === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => onUpdateHumanGroup(actor.id, tab.id)}
                          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[10.5px] font-semibold border transition-all ${
                            isTabActive
                              ? 'bg-indigo-600/90 border-indigo-400/60 text-white shadow-sm'
                              : 'bg-[#131824] border-white/[0.07] text-slate-300 hover:text-white hover:bg-[#192030]'
                          }`}
                        >
                          <span className="text-xs leading-none">{tab.icon}</span>
                          <span className="truncate">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Preset Grid (All Ready-Made Motions for Active Category) */}
                <div className="grid grid-cols-2 gap-1.5">
                  {visibleClips.map((clip) => {
                    const isActiveClip = actor.motionClip === clip.id;
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => {
                          onSelectActor(actor.id);
                          onApplyReadyMadeMotion(actor.id, clip.id, {
                            startTimeSec: safeStart,
                            endTimeSec: safeEnd,
                            travelMode,
                          });
                        }}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[11px] font-medium border transition-all ${
                          isActiveClip
                            ? 'bg-emerald-600/25 border-emerald-400/70 text-white font-semibold shadow-sm'
                            : 'bg-[#131824] hover:bg-[#1a2132] border-white/[0.07] hover:border-white/20 text-slate-200 hover:text-white'
                        }`}
                        title={`${clip.description} (${safeStart.toFixed(1)}s → ${safeEnd.toFixed(1)}s)`}
                      >
                        <span className="text-xs leading-none shrink-0">{clip.icon}</span>
                        <span className="truncate">{clip.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ================= C. POSITIONING & STANCE ================= */}
          <div className="grid grid-cols-2 gap-2">
            {/* Left Sub-Card: Stance / Loop */}
            <div className="inspector-subcard space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-amber-300">
                <Repeat className="h-3 w-3 text-amber-400 shrink-0" />
                <span className="truncate">
                  {isHumanoid ? 'Stance / Loop' : OBJECT_CATEGORY_LABELS[objCategory]}
                </span>
              </div>

              {isHumanoid ? (
                <select
                  value={unifiedHumanValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    onSelectActor(actor.id);
                    const uprightRot =
                      actor.rotation && (Math.abs(actor.rotation.x) > 1 || Math.abs(actor.rotation.z) > 1)
                        ? { x: 0, y: actor.rotation.y || 0, z: 0 }
                        : actor.rotation;
                    if (val.startsWith('gait:')) {
                      const gaitMode = val.slice(5) as Actor['gait'];
                      onUpdateActor(actor.id, {
                        gait: gaitMode,
                        motionClip: undefined,
                        posePreset: undefined,
                        pose: undefined,
                        rotation: uprightRot,
                      });
                      window.dispatchEvent(
                        new CustomEvent('cmpvs:transport-play', {
                          detail: { play: true },
                        })
                      );
                    } else if (val.startsWith('pose:')) {
                      const presetId = val.slice(5);
                      onUpdateActor(actor.id, {
                        posePreset: presetId,
                        motionClip: undefined,
                        pose: undefined,
                        gait: 'none',
                        rotation: uprightRot,
                      });
                      window.dispatchEvent(
                        new CustomEvent('cmpvs:apply-pose-preset', {
                          detail: { actorId: actor.id, presetId },
                        })
                      );
                    }
                  }}
                  className="ui-select"
                >
                  <optgroup label="Continuous Motion Loops">
                    <option value="gait:auto">🏃 Auto (Walk / Idle)</option>
                    <option value="gait:walk">🚶 Walk Cycle Loop</option>
                    <option value="gait:run">🏃 Run Cycle Loop</option>
                    <option value="gait:sneak">🕵️ Sneak Cycle Loop</option>
                    <option value="gait:idle">🧍 Idle Breathing</option>
                  </optgroup>
                  <optgroup label="Static Acting Poses (Hold)">
                    {Object.values(POSE_PRESETS).map((p) => (
                      <option key={p.id} value={`pose:${p.id}`}>
                        🧍 {p.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              ) : (
                <select
                  value={actor.posePreset || objPresets[0]?.id || ''}
                  onChange={(e) => {
                    const presetId = e.target.value;
                    onSelectActor(actor.id);
                    const matched = findObjectPosePresetById(presetId);
                    if (matched) {
                      onUpdateActor(actor.id, {
                        posePreset: presetId,
                        rotation: { ...matched.rotation },
                      });
                      if (matched.elevationY !== undefined) {
                        onUpdateActorPositionAtTime(
                          actor.id,
                          currentTime,
                          { x: currentX, y: currentDepthZ, z: matched.elevationY },
                          shotDur
                        );
                      }
                    }
                    window.dispatchEvent(
                      new CustomEvent('cmpvs:apply-pose-preset', {
                        detail: { actorId: actor.id, presetId },
                      })
                    );
                  }}
                  className="ui-select"
                >
                  {objPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Right Sub-Card: Floor Spot (X, Z) */}
            <div className="inspector-subcard space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-cyan-300">
                <MapPin className="h-3 w-3 text-rose-400 shrink-0" />
                <span className="truncate">
                  Floor Spot ({currentX}, {currentDepthZ})
                </span>
              </div>

              <select
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  const chosen = placements.find((p) => p.id === val);
                  if (!chosen) return;
                  if (chosen.position) {
                    onUpdateActorPositionAtTime(actor.id, currentTime, chosen.position, shotDur);
                  }
                  if (chosen.rotation) {
                    onUpdateActor(actor.id, { rotation: chosen.rotation });
                  }
                }}
                className="ui-select"
              >
                <option value="">📍 Snap to Spot...</option>
                {relationalOpts.length > 0 && (
                  <optgroup label="Relative to Scene Objects">
                    {relationalOpts.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {objectOpts.length > 0 && (
                  <optgroup label="Object-Aware Spots">
                    {objectOpts.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Stage Blocking Zones">
                  {stageOpts.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* ================= D. TIMING & DIRECTION ================= */}
          <div className="inspector-section space-y-2.5">
            {/* Row 1: Timing Controls */}
            <div className="flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={() => onToggleTimingSection?.(actor.id)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200 hover:text-white shrink-0"
                title="Toggle Timing & Direction section"
              >
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                <span>Timing</span>
              </button>

              <div className="flex items-center gap-1 font-mono text-[10.5px]">
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, shotDur - 0.5)}
                  step={0.5}
                  value={safeStart}
                  aria-label="Start time in seconds"
                  onChange={(e) => {
                    const nextStart = Math.max(0, Math.min(shotDur - 0.5, Number(e.target.value) || 0));
                    onUpdateMotionWindow(actor.id, {
                      start: nextStart,
                      end: Math.max(nextStart + 0.5, safeEnd),
                    });
                  }}
                  className="w-11 rounded-md bg-[#131824] border border-white/[0.1] px-1 py-0.5 text-center text-emerald-300 font-bold focus:outline-none focus:border-emerald-400"
                />
                <span className="text-slate-500">-</span>
                <input
                  type="number"
                  min={0.5}
                  max={shotDur}
                  step={0.5}
                  value={safeEnd}
                  aria-label="End time in seconds"
                  onChange={(e) => {
                    const nextEnd = Math.max(safeStart + 0.5, Math.min(shotDur, Number(e.target.value) || shotDur));
                    onUpdateMotionWindow(actor.id, {
                      start: safeStart,
                      end: nextEnd,
                    });
                  }}
                  className="w-11 rounded-md bg-[#131824] border border-white/[0.1] px-1 py-0.5 text-center text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                />
                <span className="text-slate-500 text-[10px]">s</span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onUpdateMotionWindow(actor.id, { start: 0, end: shotDur })}
                  className="px-2 py-1 rounded-md bg-[#141926] hover:bg-[#1c2334] text-[10px] font-medium text-slate-300 hover:text-white border border-white/[0.08]"
                  title={`Span full shot duration (0s – ${shotDur}s)`}
                >
                  Full ({shotDur}s)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const playheadStart = Math.min(shotDur - 0.5, Number(currentTime.toFixed(1)));
                    onUpdateMotionWindow(actor.id, { start: playheadStart, end: shotDur });
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-[10px] font-semibold text-amber-300 border border-amber-500/35"
                  title="Set start time to current playhead position"
                >
                  <Play className="h-2.5 w-2.5 fill-amber-300 text-amber-300" />
                  <span>Playhead</span>
                </button>
              </div>
            </div>

            {isTimingSectionOpen && (
              <>
                {/* Row 2: Natural-Language Direction Prompt + Direct Button */}
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <input
                      ref={promptInputRef}
                      type="text"
                      value={actor.actionDescription}
                      onChange={(e) => onUpdateActor(actor.id, { actionDescription: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && generatingActingId !== actor.id) {
                          e.preventDefault();
                          const actionText = (actor.actionDescription || 'walk forward').trim();
                          onDirectCustomAction(actor, actionText, safeStart, safeEnd, cueDuration);
                        }
                      }}
                      placeholder="Direct action (e.g. walk to right, sit down)..."
                      className="w-full rounded-lg bg-[#121723] border border-white/[0.1] pl-2.5 pr-7 py-1.5 text-slate-100 text-[11px] font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500/70"
                    />
                    <button
                      type="button"
                      onClick={() => promptInputRef.current?.focus()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      title="Edit action prompt"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={generatingActingId === actor.id}
                    onClick={() => {
                      const actionText = (actor.actionDescription || 'walk forward').trim();
                      onDirectCustomAction(actor, actionText, safeStart, safeEnd, cueDuration);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-semibold shadow-sm border border-emerald-400/40 shrink-0 cursor-pointer"
                    title={`Compile action into stage trajectory & pose keyframes (${safeStart.toFixed(1)}s → ${safeEnd.toFixed(1)}s)`}
                  >
                    {generatingActingId === actor.id ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Directing...</span>
                      </>
                    ) : (
                      <>
                        <Activity className="h-3.5 w-3.5" />
                        <span>Direct</span>
                        <Play className="h-2.5 w-2.5 fill-white" />
                      </>
                    )}
                  </button>
                </div>

                {/* Row 3: Active Cue Status, Chaining & Clear */}
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/[0.06] font-mono text-[10px]">
                  <span className="flex items-center gap-1.5 text-slate-400 truncate">
                    <MapPin className="h-3 w-3 text-rose-400 shrink-0" />
                    <span className="truncate">
                      {kfs.length} {kfs.length === 1 ? 'cue' : 'cues'} ({Math.round(actor.trajectory.startPosition.x)},{Math.round(actor.trajectory.startPosition.y)} → {Math.round(actor.trajectory.endPosition.x)},{Math.round(actor.trajectory.endPosition.y)})
                    </span>
                  </span>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {kfs.length > 0 && lastKfTime < shotDur - 0.5 && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateMotionWindow(actor.id, {
                            start: Number(lastKfTime.toFixed(1)),
                            end: shotDur,
                          })
                        }
                        className="px-2 py-0.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 font-semibold"
                        title="Chain next action starting where the previous cue finished"
                      >
                        + Next ({lastKfTime.toFixed(1)}s→{shotDur}s)
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        onUpdateActor(actor.id, {
                          gait: 'idle',
                          motionClip: undefined,
                          trajectory: {
                            ...actor.trajectory,
                            endPosition: { ...actor.trajectory.startPosition },
                            keyframes: [],
                          },
                        })
                      }
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/35 font-medium transition-colors"
                      title="Clear all motion keyframes and hold starting position"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ================= E. APPEARANCE, COLOR & RIG SLIDERS ================= */}
          <div className="rounded-xl bg-[#0d111a] border border-white/[0.08] overflow-hidden">
            {/* Collapsible Section Header */}
            <button
              type="button"
              onClick={() => onToggleFineTune(actor.id)}
              className="w-full flex items-center justify-between px-3 py-2 bg-[#121724] hover:bg-[#171e2f] text-slate-200 transition-colors"
              title="Toggle Appearance, Color, Transform & Rigging controls"
            >
              <span className="flex items-center gap-2 text-[11px] font-semibold">
                {isFineTuneOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-cyan-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                )}
                <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
                <span>Appearance, Color &amp; Rig Sliders</span>
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                X:{currentX} Z:{currentDepthZ} <span className="text-slate-600">|</span> {(actor.scale ?? 1.0).toFixed(1)}
              </span>
            </button>

            {isFineTuneOpen && (
              <div className="p-2.5 space-y-2.5 border-t border-white/[0.06]">
                {/* 1. Edit 3D Look by Prompt & Attach .GLB */}
                <div className="inspector-subcard space-y-2">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                      <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span>Edit 3D Look by Prompt</span>
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <label
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#161c2a] hover:bg-[#1e2638] border border-white/[0.1] text-[10px] font-medium text-slate-200 hover:text-white cursor-pointer transition-colors"
                        title="Attach or replace with a custom .GLB / .GLTF 3D model"
                      >
                        <input
                          type="file"
                          accept=".glb,.gltf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onAttachGlbFile(actor.id, file);
                          }}
                        />
                        <Upload className="h-3 w-3 text-slate-300" />
                        <span>{actor.modelUrl ? 'Replace .GLB' : 'Attach .GLB'}</span>
                      </label>

                      <button
                        type="button"
                        disabled={refiningActorId === actor.id || !(actor.token || actor.name || '').trim()}
                        onClick={() => onRefineObjectByPrompt(actor)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/35 disabled:opacity-40 border border-amber-500/45 text-amber-200 text-[10px] font-semibold transition-colors cursor-pointer"
                        title="Rebuild 3D appearance using prompt"
                      >
                        {refiningActorId === actor.id ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin text-amber-300" />
                            <span>Editing...</span>
                          </>
                        ) : (
                          <>
                            <Box className="h-3 w-3 text-amber-300" />
                            <span>Edit 3D</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      ref={lookPromptInputRef}
                      type="text"
                      value={actor.token}
                      onChange={(e) => onUpdateActor(actor.id, { token: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          onRefineObjectByPrompt(actor);
                        }
                      }}
                      placeholder="Describe 3D look / wearables (e.g. wearing a trench coat)..."
                      className="w-full rounded-lg bg-[#0d111a] border border-white/[0.09] pl-2.5 pr-7 py-1.5 text-slate-200 text-[11px] font-mono placeholder-slate-500 focus:outline-none focus:border-amber-400/70"
                    />
                    <button
                      type="button"
                      onClick={() => lookPromptInputRef.current?.focus()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      title="Edit 3D appearance description"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* 2. Target Color (Scene ID) */}
                <div className="inspector-subcard space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                      <Palette className="h-3.5 w-3.5 text-purple-400" />
                      <span>Target Color (Scene ID)</span>
                    </span>
                    {actor.color && (
                      <button
                        type="button"
                        onClick={() => onUpdateActor(actor.id, { color: undefined })}
                        className="px-2 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[9.5px] font-mono text-slate-300 border border-white/[0.08]"
                        title="Reset to natural 3D material color"
                      >
                        Natural
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {OBJECT_TARGET_PALETTE.map((swatch) => {
                        const isColorActive = actor.color?.toLowerCase() === swatch.hex.toLowerCase();
                        return (
                          <button
                            key={swatch.hex}
                            type="button"
                            onClick={() => onUpdateActor(actor.id, { color: swatch.hex })}
                            className={`h-5 w-5 rounded-full border transition-transform ${
                              isColorActive
                                ? 'scale-115 border-white ring-2 ring-white/40'
                                : 'border-white/20 hover:scale-110'
                            }`}
                            style={{ backgroundColor: swatch.hex }}
                            title={`${swatch.name} (${swatch.hex})`}
                          />
                        );
                      })}
                    </div>

                    <label
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0d111a] hover:bg-[#161c2a] border border-white/[0.1] text-[10.5px] font-medium text-slate-200 cursor-pointer shrink-0"
                      title="Pick custom hex color"
                    >
                      <input
                        type="color"
                        value={actor.color || '#ef4444'}
                        onChange={(e) => onUpdateActor(actor.id, { color: e.target.value })}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <span>Custom</span>
                      <ChevronDown className="h-3 w-3 text-slate-400" />
                    </label>
                  </div>
                </div>

                {/* 3. Transform & Position: 3-Column Stage X, Height Y, Depth Z Cards */}
                <div className="grid grid-cols-3 gap-1.5 font-mono">
                  {/* Stage X */}
                  <div className="inspector-subcard space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1 text-cyan-300 font-semibold">
                        <Grid className="h-3 w-3 text-cyan-400" />
                        <span>Stage X</span>
                      </span>
                      <span className="text-cyan-300 font-bold">{currentX}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={currentX}
                      aria-label="Stage X coordinate"
                      onChange={(e) =>
                        onUpdateActorPositionAtTime(
                          actor.id,
                          currentTime,
                          { x: Number(e.target.value), y: currentDepthZ, z: currentElevationY },
                          shotDur
                        )
                      }
                      className="studio-slider accent-cyan-400"
                    />
                  </div>

                  {/* Height Y */}
                  <div className="inspector-subcard space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1 text-amber-300 font-semibold">
                        <ArrowUpDown className="h-3 w-3 text-amber-400" />
                        <span>Height Y</span>
                      </span>
                      <span className="text-amber-300 font-bold">{currentElevationY}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={0.5}
                      value={currentElevationY}
                      aria-label="Height Y elevation"
                      onChange={(e) =>
                        onUpdateActorPositionAtTime(
                          actor.id,
                          currentTime,
                          { x: currentX, y: currentDepthZ, z: Number(e.target.value) },
                          shotDur
                        )
                      }
                      className="studio-slider accent-amber-400"
                    />
                  </div>

                  {/* Depth Z */}
                  <div className="inspector-subcard space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1 text-emerald-300 font-semibold">
                        <Box className="h-3 w-3 text-emerald-400" />
                        <span>Depth Z</span>
                      </span>
                      <span className="text-emerald-300 font-bold">{currentDepthZ}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={currentDepthZ}
                      aria-label="Depth Z coordinate"
                      onChange={(e) =>
                        onUpdateActorPositionAtTime(
                          actor.id,
                          currentTime,
                          { x: currentX, y: Number(e.target.value), z: currentElevationY },
                          shotDur
                        )
                      }
                      className="studio-slider accent-emerald-400"
                    />
                  </div>
                </div>

                {/* 4. 3D Object Scale Card */}
                <div className="inspector-subcard space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                      <Maximize2 className="h-3.5 w-3.5 text-cyan-400" />
                      <span>3D Object Scale</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-cyan-300">
                      {(actor.scale ?? 1.0).toFixed(2)}x
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0.1}
                    max={6.0}
                    step={0.05}
                    value={actor.scale ?? 1.0}
                    aria-label="3D Object Scale"
                    onChange={(e) => onUpdateActor(actor.id, { scale: Number(e.target.value) })}
                    className="studio-slider accent-cyan-400"
                  />

                  <div className="flex items-center justify-between gap-1 pt-0.5 font-mono text-[10px]">
                    <span className="text-slate-400">Scale:</span>
                    <div className="grid grid-cols-5 gap-1 flex-1 ml-1">
                      {[
                        { label: '0.5x', val: 0.5 },
                        { label: '1.0x', val: 1.0 },
                        { label: '1.5x', val: 1.5 },
                        { label: '2.0x', val: 2.0 },
                        { label: '4.0x', val: 4.0 },
                      ].map((preset) => {
                        const isActiveScale = Math.abs((actor.scale ?? 1.0) - preset.val) < 0.05;
                        return (
                          <button
                            key={preset.val}
                            type="button"
                            onClick={() => onUpdateActor(actor.id, { scale: preset.val })}
                            className={`py-1 rounded-md text-center border transition-all ${
                              isActiveScale
                                ? 'bg-cyan-500/25 border-cyan-400/70 text-cyan-200 font-bold'
                                : 'bg-[#0d111a] hover:bg-[#171e2e] border-white/[0.08] text-slate-300'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 5. Rig Utilities (Humanoid) OR 3D Orientation Angles (Non-Human) */}
                {isHumanoid ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectActor(actor.id);
                        setTimeout(() => window.dispatchEvent(new CustomEvent('cmpvs:ground-actor-feet')), 10);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 text-[10.5px] font-semibold transition-colors"
                      title="Snap character feet onto floor plane using analytic IK"
                    >
                      <Footprints className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>Ground Feet</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectActor(actor.id);
                        setTimeout(() => window.dispatchEvent(new CustomEvent('cmpvs:record-pose-cue')), 10);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40 text-amber-300 text-[10.5px] font-semibold transition-colors"
                      title={`Record current manual FK/IK skeleton pose at ${currentTime.toFixed(1)}s`}
                    >
                      <Clapperboard className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span>Pose Cue</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectActor(actor.id);
                        setTimeout(() => window.dispatchEvent(new CustomEvent('cmpvs:reset-actor-pose')), 10);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-[#141926] hover:bg-[#1c2334] border border-white/[0.1] text-slate-200 text-[10.5px] font-medium transition-colors"
                      title="Reset character skeleton to T-Pose / Rest"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>Reset</span>
                    </button>
                  </div>
                ) : (
                  <div className="inspector-subcard space-y-2 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-sans font-semibold text-slate-200">
                        3D Orientation (Angles)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateActor(actor.id, {
                            rotation: { x: 0, y: 0, z: 0 },
                            posePreset: objPresets[0]?.id,
                          })
                        }
                        className="px-2 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-300 text-[9.5px]"
                      >
                        ↺ Reset 0°
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-cyan-300">Yaw</span>
                          <span className="text-cyan-300 font-bold">{Math.round(rot.y)}°</span>
                        </div>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={5}
                          value={Math.round(rot.y)}
                          onChange={(e) =>
                            onUpdateActor(actor.id, { rotation: { ...rot, y: Number(e.target.value) } })
                          }
                          className="studio-slider accent-cyan-400"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-amber-300">Pitch</span>
                          <span className="text-amber-300 font-bold">{Math.round(rot.x)}°</span>
                        </div>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={5}
                          value={Math.round(rot.x)}
                          onChange={(e) =>
                            onUpdateActor(actor.id, { rotation: { ...rot, x: Number(e.target.value) } })
                          }
                          className="studio-slider accent-amber-400"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-emerald-300">Roll</span>
                          <span className="text-emerald-300 font-bold">{Math.round(rot.z)}°</span>
                        </div>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={5}
                          value={Math.round(rot.z)}
                          onChange={(e) =>
                            onUpdateActor(actor.id, { rotation: { ...rot, z: Number(e.target.value) } })
                          }
                          className="studio-slider accent-emerald-400"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. Socket / Attach to Character Bone (Always visible on Character & Prop cards) */}
                {(() => {
                  const otherStageActors = allActors.filter((a) => a.id !== actor.id);
                  const socketCandidates = isHumanoid ? otherStageActors : otherHumanoids;
                  const propsAttachedToThisChar = allActors.filter(
                    (a) => a.socketToBone?.targetActorId === actor.id
                  );

                  return (
                    <div className="inspector-subcard space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                          <Link2 className="h-3.5 w-3.5 text-amber-400" />
                          <span>Socket to Character Bone</span>
                        </span>
                        {actor.socketToBone && (
                          <span className="font-mono text-[9.5px] text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                            Attached ➔ {actor.socketToBone.boneName}
                          </span>
                        )}
                      </div>

                      {/* If any stage props are attached to THIS character, show quick Detach badges */}
                      {propsAttachedToThisChar.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {propsAttachedToThisChar.map((attachedProp) => (
                            <div
                              key={attachedProp.id}
                              className="flex items-center justify-between gap-2 w-full rounded-lg bg-emerald-950/35 border border-emerald-500/30 px-2.5 py-1 text-[10px]"
                            >
                              <span className="text-emerald-200 font-mono truncate">
                                🔗 <strong>{attachedProp.name}</strong> ➔ {attachedProp.socketToBone?.boneName}
                              </span>
                              <button
                                type="button"
                                onClick={() => onUnsocketActor(attachedProp.id)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 text-rose-200 font-semibold shrink-0"
                              >
                                <Unlink className="h-2.5 w-2.5" />
                                <span>Detach</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {actor.socketToBone ? (
                        <button
                          type="button"
                          onClick={() => onUnsocketActor(actor.id)}
                          className="w-full py-1.5 px-2.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 border border-rose-500/40 text-rose-200 flex items-center justify-center gap-1.5 text-[11px] font-semibold"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                          <span>Detach from {actor.socketToBone.boneName}</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={socketTargetActorId || socketCandidates[0]?.id || ''}
                            onChange={(e) => onChangeSocketTargetActor(e.target.value)}
                            disabled={socketCandidates.length === 0}
                            className="ui-select flex-1 min-w-0 disabled:opacity-50"
                          >
                            {socketCandidates.length === 0 ? (
                              <option value="">Add a prop/character first...</option>
                            ) : (
                              socketCandidates.map((cand) => (
                                <option key={cand.id} value={cand.id}>
                                  {cand.name}
                                </option>
                              ))
                            )}
                          </select>

                          <select
                            value={socketTargetBone}
                            onChange={(e) => onChangeSocketTargetBone(e.target.value as HumanoidBone)}
                            className="ui-select flex-1 min-w-0"
                          >
                            {HUMANOID_SOCKET_BONES.map((b) => (
                              <option key={b.id} value={b.id}>
                                ✋ {b.label}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            disabled={socketCandidates.length === 0}
                            onClick={() => {
                              const chosenId = socketTargetActorId || socketCandidates[0]?.id;
                              if (!chosenId) return;
                              const chosenActor = allActors.find((a) => a.id === chosenId);
                              const isChosenHumanoid =
                                !chosenActor?.kind ||
                                chosenActor.kind === 'human' ||
                                chosenActor.kind === 'character';
                              // If we are on a Character card and selected a non-human Prop, attach the Prop to THIS Character's bone!
                              if (isHumanoid && chosenActor && !isChosenHumanoid) {
                                onSocketActorToBone(chosenId, actor.id, socketTargetBone);
                              } else {
                                onSocketActorToBone(actor.id, chosenId, socketTargetBone);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 disabled:opacity-40 border border-amber-500/45 text-amber-200 text-[10.5px] font-semibold shrink-0 cursor-pointer"
                            title="Attach object to selected character bone"
                          >
                            <Check className="h-3 w-3 text-amber-300" />
                            <span>Attach</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

