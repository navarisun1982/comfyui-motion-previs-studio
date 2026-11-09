import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
export type CharacterCardSubTab = 'motion' | 'timing' | 'look' | 'rig' | 'all';
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
  findReadyMadeMotionById,
  HumanoidMotionGroup,
  DEFAULT_HUMANOID_LANDMARKS,
  AutoRigType,
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
  Globe,
  Video,
} from 'lucide-react';
import { GlbResourcesDirectory } from './GlbResourcesDirectory';
import {
  MocapStudioModal,
  MocapStudioApplyPayload,
  applyMocapStudioPayloadToShotStore,
} from './MocapStudioModal';

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
      motionCycles?: number;
    }
  ) => void;
  onDirectCustomAction: (
    actor: Actor,
    actionText: string,
    safeStart: number,
    safeEnd: number,
    cueDuration: number,
    motionCycles?: number
  ) => Promise<void>;
  onResetActorMotion?: (actorId: string) => void;
  onRemoveActorCue?: (actorId: string, cueId: string) => void;
  onExtendShotDuration?: (nextDurationSec: number) => void;
  onMoveActorCueTime?: (actorId: string, cueId: string, newTime: number) => void;
  onScaleActorCuesInRange?: (
    actorId: string,
    oldStart: number,
    oldEnd: number,
    newStart: number,
    newEnd: number,
    initialTimesById?: Record<string, number>
  ) => void;
  onApplyActorMotionCurve?: (
    actorId: string,
    curve: 'linear' | 'ease-in-out' | 'fast-start' | 'slow-start',
    startTimeSec?: number,
    endTimeSec?: number
  ) => void;
  onSeekTime?: (time: number) => void;
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
  onResetActorMotion,
  onRemoveActorCue,
  onExtendShotDuration,
  onMoveActorCueTime,
  onScaleActorCuesInRange,
  onApplyActorMotionCurve,
  onSeekTime,
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
  const cueRibbonRef = useRef<HTMLDivElement | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<CharacterCardSubTab>('motion');
  const [showGlbResources, setShowGlbResources] = useState<boolean>(false);
  const [showRigLandmarksDrawer, setShowRigLandmarksDrawer] = useState<boolean>(false);
  const [selectedInspectorBone, setSelectedInspectorBone] = useState<HumanoidBone>('RightArm');
  const [lastDirectedSignature, setLastDirectedSignature] = useState<string | null>(null);
  const [draggingCueId, setDraggingCueId] = useState<string | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [draggingCueGrabOffsetSec, setDraggingCueGrabOffsetSec] = useState<number>(0);

  useEffect(() => {
    const handleCueSelectEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { kind?: string; actorId?: string; cueId?: string } | null;
      if (!detail || detail.kind !== 'actor-cue' || detail.actorId !== actor.id) {
        setSelectedCueId(null);
      } else {
        setSelectedCueId(detail.cueId || null);
      }
    };
    window.addEventListener('cmpvs:select-cue', handleCueSelectEvent);
    return () => window.removeEventListener('cmpvs:select-cue', handleCueSelectEvent);
  }, [actor.id]);

  useEffect(() => {
    if (!selectedCueId || !onRemoveActorCue) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.isContentEditable
      ) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        onRemoveActorCue(actor.id, selectedCueId);
        setSelectedCueId(null);
        window.dispatchEvent(new CustomEvent('cmpvs:select-cue', { detail: null }));
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [actor.id, selectedCueId, onRemoveActorCue]);
  const [draggingSpanEdge, setDraggingSpanEdge] = useState<{
    side: 'start' | 'end' | 'move';
    initialStart: number;
    initialEnd: number;
    startClientX: number;
    initialTimesById: Record<string, number>;
  } | null>(null);
  const [activePacingCurve, setActivePacingCurve] = useState<'linear' | 'ease-in-out' | 'fast-start' | 'slow-start'>('linear');
  const [isMocapStudioOpen, setIsMocapStudioOpen] = useState(false);
  const [motionSourceFilter, setMotionSourceFilter] = useState<'all' | 'mocap' | 'clips' | 'ai'>('all');

  const actorKeyframes = actor.trajectory.keyframes ?? [];
  const hasActiveMocapTrack = actorKeyframes.some(
    (kf) => Boolean(kf.pose?.anatomicalIk) || Boolean(kf.cueLabel && /mocap|smpl|fbx/i.test(kf.cueLabel))
  );
  const activeUnifiedDriverLabel = hasActiveMocapTrack
    ? `🎥 3D Mocap (${actorKeyframes.length}f)`
    : actor.motionClip
      ? `🏃 Clip: ${actor.motionClip}`
      : actorKeyframes.length > 1
        ? `✨ AI Keyframes (${actorKeyframes.length} pts)`
        : `🧍 Stance / Gait (${actor.gait || 'idle'})`;

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
  const currentActionText = (actor.actionDescription || 'walk forward').trim();
  const currentCycles = actor.motionCycles ?? 1;
  const currentSignature = `${currentActionText}|${safeStart.toFixed(1)}|${safeEnd.toFixed(1)}|${currentCycles}`;
  const isAlreadyDirected = kfs.length > 0 && lastDirectedSignature === currentSignature;
  const hasExistingMotionWithNewPrompt = kfs.length > 0 && !isAlreadyDirected;

  const rawCategory = detectObjectPoseCategory(actor);
  const objCategory =
    actor.rigType === 'humanoid'
      ? 'humanoid'
      : actor.rigType === 'quadruped'
        ? 'quadruped'
        : actor.rigType === 'rigid_prop' && rawCategory === 'humanoid'
          ? 'environment_prop'
          : rawCategory;
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
  const activeMotionClipObj = actor.motionClip ? findReadyMadeMotionById(actor.motionClip) : undefined;

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
      className={`rounded-xl p-2.5 space-y-2.5 transition-all cursor-pointer ${isSelected
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
              setIsMocapStudioOpen(true);
            }}
            data-testid={`card-header-mocap-btn-${actor.id}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-600/25 hover:bg-cyan-600/45 text-cyan-100 border border-cyan-400/45 text-[10.5px] font-bold transition-colors cursor-pointer"
            title="Open 3D Mocap, Body & Scene Studio (.MP4 Video or .FBX)"
          >
            <Video className="h-2.5 w-2.5 text-cyan-300" />
            <span>Mocap</span>
          </button>

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
          {/* ================= 4 FOCUSED SUB-TABS BAR (ZERO-SCROLL INSPECTOR) ================= */}
          <div className="space-y-1.5">
            {/* Compact Status Summary Strip */}
            <div className="flex items-center justify-between gap-1.5 px-1 text-[9.5px] font-mono text-slate-400">
              <span className="truncate flex items-center gap-1.5">
                {actor.conceptImageUrl ? (
                  <span className="text-emerald-300 font-semibold">🖼️ Ref Ready</span>
                ) : (
                  <span>🖼️ No Ref</span>
                )}
                <span className="text-slate-600">•</span>
                <span className="text-cyan-300">
                  📍 ({currentX}, {currentDepthZ})
                </span>
                <span className="text-slate-600">•</span>
                <span>{(actor.scale ?? 1.0).toFixed(1)}x</span>
              </span>
              {activeMotionClipObj && (
                <span className="text-emerald-300 font-semibold truncate">
                  {activeMotionClipObj.icon} {activeMotionClipObj.name}
                </span>
              )}
            </div>

            {/* 4 Focused Sub-Tabs + All Toggle (Smart Expanding Bar: Active = Icon + Full Name, Inactive = Large Clear Icon Only) */}
            <div
              className="flex items-center gap-1 rounded-xl bg-[#080b12] p-1 border border-white/[0.08]"
              role="tablist"
              aria-label="Character Inspector Sub-Tabs"
            >
              {(
                [
                  {
                    id: 'motion' as const,
                    label: 'Motion',
                    activeLabel: 'Motion & Stance',
                    icon: '🏃',
                    dot: Boolean(actor.motionClip),
                    tip: 'Motion & Stance: Ready-Made Motions, Floor Path, Stance & Stage Spot',
                  },
                  {
                    id: 'timing' as const,
                    label: 'Timing',
                    activeLabel: 'Timing & Cues',
                    icon: '⏱️',
                    badge: kfs.length > 0 ? String(kfs.length) : undefined,
                    tip: 'Timing & Cues: Timing Window (sec), Action Cycles (1x–5x) & Natural-Language AI Directing',
                  },
                  {
                    id: 'look' as const,
                    label: 'Look/Ref',
                    activeLabel: 'Look/Ref & 3D',
                    icon: '🎨',
                    dot: Boolean(actor.conceptImageUrl || actor.modelUrl),
                    tip: 'Look/Ref & 3D: ComfyUI Reference Image, 3D Look Prompt, Attach .GLB & Color Swatches',
                  },
                  {
                    id: 'rig' as const,
                    label: 'Rig/XYZ',
                    activeLabel: 'Rig/XYZ & Bones',
                    icon: '🦴',
                    dot: Boolean(actor.socketToBone),
                    tip: 'Rig/XYZ & Bones: XYZ Stage Coordinates, Scale, Facing Angle, Bone Sockets & FK/IK Rig',
                  },
                  {
                    id: 'all' as const,
                    label: 'All',
                    activeLabel: 'All Controls',
                    icon: '⊞',
                    tip: 'All Controls: Show all sections expanded at once',
                  },
                ]
              ).map((tab) => {
                const isTabActive = activeSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isTabActive}
                    onClick={() => {
                      setActiveSubTab(tab.id);
                      if ((tab.id === 'look' || tab.id === 'rig') && !isFineTuneOpen) {
                        onToggleFineTune(actor.id);
                      }
                      if (tab.id === 'motion' && !isMotionSectionOpen) {
                        onToggleMotionSection?.(actor.id);
                      }
                      if (tab.id === 'timing' && !isTimingSectionOpen) {
                        onToggleTimingSection?.(actor.id);
                      }
                    }}
                    title={tab.tip}
                    className={`relative flex items-center justify-center rounded-lg font-semibold transition-all cursor-pointer ${
                      isTabActive
                        ? 'flex-1 min-w-0 gap-1.5 py-1.5 px-2.5 text-[11px] bg-gradient-to-r from-indigo-600 via-indigo-600 to-blue-600 text-white shadow-[0_2px_10px_rgba(79,70,229,0.35)] border border-indigo-400/60'
                        : 'w-9 h-8 shrink-0 bg-[#0d1322] text-slate-300 hover:text-white hover:bg-[#162038] hover:scale-105 border border-white/[0.06] hover:border-indigo-400/40'
                    }`}
                  >
                    <span className={isTabActive ? 'text-[13px] leading-none shrink-0' : 'text-[14px] leading-none'}>
                      {tab.icon}
                    </span>
                    <span className={isTabActive ? 'truncate font-bold tracking-tight' : 'sr-only'}>
                      {isTabActive ? tab.activeLabel : tab.label}
                    </span>
                    {tab.dot && (
                      <span
                        className={
                          isTabActive
                            ? 'h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399] shrink-0'
                            : 'absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_#34d399]'
                        }
                      />
                    )}
                    {tab.badge && (
                      <span
                        className={
                          isTabActive
                            ? 'px-1.5 py-0.2 rounded bg-cyan-500/30 text-cyan-100 font-mono text-[9px] leading-tight shrink-0'
                            : 'absolute -top-1 -right-1 px-1 rounded-full bg-cyan-500 text-slate-950 font-mono font-bold text-[8px] leading-tight shadow'
                        }
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ================= MIXAMO STUDIO 3D CHARACTER BODY THUMBNAIL SELECTOR ================= */}
          {objCategory === 'humanoid' && (
            <div
              className={
                activeSubTab === 'look' || activeSubTab === 'motion' || activeSubTab === 'all'
                  ? 'rounded-xl bg-[#0d1220] border border-cyan-500/25 p-2 space-y-1.5'
                  : 'hidden'
              }
            >
              <div className="flex items-center justify-between gap-2 text-[9.5px]">
                <span className="font-bold text-cyan-200 flex items-center gap-1">
                  <span>🧍</span>
                  <span>Mixamo Studio 3D Character Rig:</span>
                </span>
                <span className="font-mono text-[8.5px] text-slate-400">
                  8 Studio Bodies • 65-Bone Mocap
                </span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                {[
                  {
                    id: 'ybot-male',
                    label: 'Y-Bot M',
                    sourceBadge: '🎭 Mixamo',
                    modelUrl: './models/y-bot-tpose.fbx',
                    thumb: './images/library/mixamo-ybot-male.jpg',
                    match: (u?: string) => !u || u.includes('y-bot-tpose'),
                  },
                  {
                    id: 'xbot-female',
                    label: 'X-Bot F',
                    sourceBadge: '🎭 Mixamo',
                    modelUrl: './models/x-bot-tpose.fbx',
                    thumb: './images/library/mixamo-xbot-female.jpg',
                    match: (u?: string) => Boolean(u && u.includes('x-bot-tpose')),
                  },
                  {
                    id: 'soldier',
                    label: 'Soldier',
                    sourceBadge: '🎭 Mixamo',
                    modelUrl: './models/Soldier.glb',
                    thumb: './images/library/mixamo-soldier.jpg',
                    match: (u?: string) => Boolean(u && u.toLowerCase().includes('soldier.glb')),
                  },
                  {
                    id: 'michelle',
                    label: 'Michelle',
                    sourceBadge: '🎭 Mixamo',
                    modelUrl: './models/Michelle.glb',
                    thumb: './images/library/mixamo-michelle.jpg',
                    match: (u?: string) => Boolean(u && u.toLowerCase().includes('michelle.glb')),
                  },
                  {
                    id: 'rpm-avatar',
                    label: 'Suit & Hat',
                    sourceBadge: '🎩 RPM',
                    modelUrl: './models/ReadyPlayerMeAvatar.glb',
                    thumb: './images/library/mixamo-rpm-avatar.jpg',
                    match: (u?: string) => Boolean(u && u.toLowerCase().includes('readyplayerme')),
                  },
                  {
                    id: 'xbot-studio',
                    label: 'X-Bot GLB',
                    sourceBadge: '🎭 Mixamo',
                    modelUrl: './models/Xbot.glb',
                    thumb: './images/library/mixamo-xbot-studio.jpg',
                    match: (u?: string) => Boolean(u && u.toLowerCase().includes('xbot.glb')),
                  },
                  {
                    id: 'robot-expressive',
                    label: 'Robot CC0',
                    sourceBadge: '🤖 CC0',
                    modelUrl: './models/RobotExpressive.glb',
                    thumb: './images/library/mixamo-robot-expressive.jpg',
                    match: (u?: string) => Boolean(u && u.toLowerCase().includes('robotexpressive.glb')),
                  },
                  {
                    id: 'cesium-man',
                    label: 'Runner',
                    sourceBadge: '🌐 glTF',
                    modelUrl: './models/CesiumMan.glb',
                    thumb: './images/library/mixamo-cesium-man.jpg',
                    match: (u?: string) => Boolean(u && u.toLowerCase().includes('cesiumman.glb')),
                  },
                ].map((preset) => {
                  const isActiveBody = preset.match(actor.modelUrl);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        onUpdateActor(actor.id, {
                          modelUrl: preset.modelUrl,
                          rigType: 'humanoid',
                        })
                      }
                      title={`Switch 3D Character Body to ${preset.label} (${preset.sourceBadge})`}
                      className={`group relative flex flex-col items-center rounded-lg overflow-hidden border transition-all cursor-pointer p-0.5 ${
                        isActiveBody
                          ? 'border-cyan-400 bg-cyan-500/20 ring-1 ring-cyan-400/50 shadow'
                          : 'border-white/10 bg-black/40 hover:border-cyan-400/50 hover:bg-white/5'
                      }`}
                    >
                      <div className="relative w-full">
                        <img
                          src={preset.thumb}
                          alt={preset.label}
                          className="h-11 w-full rounded object-cover object-top bg-[#090d16]"
                        />
                        <span className="absolute top-0.5 left-0.5 rounded bg-black/75 border border-white/15 px-1 py-0 text-[7px] font-mono text-cyan-200 leading-tight">
                          {preset.sourceBadge}
                        </span>
                      </div>
                      <span
                        className={`text-[8.5px] font-mono font-semibold truncate w-full text-center mt-0.5 ${
                          isActiveBody ? 'text-cyan-200' : 'text-slate-300 group-hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= SUB-TAB 3 (OR ALL): COMFYUI VIDEO REFERENCE IMAGE ================= */}
          <div
            className={
              activeSubTab === 'look' || activeSubTab === 'all'
                ? 'rounded-xl bg-[#101524] border border-indigo-500/30 p-2 flex items-center justify-between gap-2.5'
                : 'hidden'
            }
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {actor.conceptImageUrl ? (
                <img
                  src={actor.conceptImageUrl}
                  alt={actor.name}
                  className="h-11 w-11 rounded-lg object-cover border border-indigo-400/50 shrink-0 bg-black"
                />
              ) : (
                <div className="h-11 w-11 rounded-lg bg-black/60 border border-dashed border-indigo-400/35 flex items-center justify-center text-indigo-300/70 shrink-0 text-[10px] font-mono">
                  IMG
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] font-bold text-indigo-200 truncate">
                    Reference Image
                  </span>
                  {actor.conceptImageUrl && (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-[8.5px] font-mono text-emerald-300">
                      Ready
                    </span>
                  )}
                </div>
                <p className="text-[9.5px] text-slate-400 leading-tight">
                  Used directly as subject reference in ComfyUI video render (no re-upload needed in Render Studio).
                </p>
                {actor.conceptImageName && (
                  <div className="text-[9px] font-mono text-indigo-300 truncate mt-0.5">
                    📎 {actor.conceptImageName}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <label
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/40 text-[10px] font-semibold text-indigo-100 cursor-pointer transition-colors"
                title="Upload reference image for this character/object (used in ComfyUI MiniMax H3 / LTX video)"
              >
                <Upload className="h-3 w-3 text-indigo-300" />
                <span>{actor.conceptImageUrl ? 'Change' : 'Upload Ref'}</span>
                <input
                  key={`ref-upload-${actor.id}`}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const targetActorId = actor.id;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        onUpdateActor(targetActorId, {
                          conceptImageUrl: reader.result,
                          conceptImageName: file.name,
                        });
                      }
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
              </label>
              {actor.conceptImageUrl && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateActor(actor.id, {
                      conceptImageUrl: undefined,
                      conceptImageName: undefined,
                    })
                  }
                  className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 border border-rose-500/35 text-rose-300"
                  title="Clear reference image"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* ================= SUB-TAB 1 (MOTION & STANCE) ================= */}
          <div className={activeSubTab === 'motion' || activeSubTab === 'all' ? 'space-y-2.5' : 'hidden'}>
            {/* UNIFIED MOTION SOURCE MODE SWITCHER + ACTIVE ENGINE DRIVER INDICATOR */}
            <div
              data-testid="unified-motion-source-switcher"
              className="rounded-xl bg-[#0b101d] border border-indigo-500/25 p-2 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-[9.5px]">
                <span className="font-semibold text-slate-300 flex items-center gap-1 truncate">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span>Active Driver:</span>
                  <span className="font-mono text-cyan-300 truncate">{activeUnifiedDriverLabel}</span>
                </span>
                {hasActiveMocapTrack && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onResetActorMotion) {
                        onResetActorMotion(actor.id);
                      } else {
                        onUpdateActor(actor.id, {
                          pose: undefined,
                          trajectory: { ...actor.trajectory, keyframes: [] },
                        });
                      }
                    }}
                    className="px-1.5 py-0.5 rounded bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-200 font-semibold text-[9px] shrink-0"
                    title="Detach 3D Mocap track so Motion Clips or AI Keyframe Direction takes priority"
                  >
                    Detach Mocap
                  </button>
                )}
              </div>
              <div
                className="grid grid-cols-4 gap-1 rounded-lg bg-[#070a12] p-0.5 border border-white/[0.07] text-[9.5px]"
                role="group"
                aria-label="Motion Source Filter"
              >
                {(
                  [
                    { id: 'all', label: 'All', icon: '⊞', tip: 'Show all motion sources (Mocap, Clips, AI)' },
                    { id: 'mocap', label: 'Mocap', icon: '🎥', tip: 'Focus on 3D Video / FBX Mocap Studio' },
                    { id: 'clips', label: 'Clips', icon: '🏃', tip: 'Focus on Ready-Made Motion Clips & Stance' },
                    { id: 'ai', label: 'AI Direct', icon: '✨', tip: 'Focus on Natural-Language AI Motion Direction' },
                  ] as const
                ).map((modeBtn) => {
                  const isActiveFilter = motionSourceFilter === modeBtn.id;
                  return (
                    <button
                      key={modeBtn.id}
                      type="button"
                      onClick={() => setMotionSourceFilter(modeBtn.id)}
                      title={modeBtn.tip}
                      className={`inline-flex items-center justify-center gap-1 py-1 px-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                        isActiveFilter
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>{modeBtn.icon}</span>
                      <span className="truncate">{modeBtn.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PROMINENT FULL-WIDTH 3D MOCAP & FBX STUDIO LAUNCHER */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMocapStudioOpen(true);
              }}
              data-testid="open-mocap-studio-btn"
              className={`${
                motionSourceFilter === 'all' || motionSourceFilter === 'mocap' ? 'flex' : 'hidden'
              } w-full rounded-xl bg-gradient-to-r from-indigo-600/35 via-blue-600/30 to-cyan-600/35 hover:from-indigo-600/55 hover:to-cyan-600/55 border border-cyan-400/50 px-3 py-2 items-center justify-between gap-2 text-left transition-all shadow-[0_4px_14px_rgba(6,182,212,0.18)] cursor-pointer group`}
              title="Open 3D Mocap Studio: Extract 19-bone human motion, SMPL body proportions, and surrounding 3D buildings/props from RGB Video (.MP4) or toyxyz_RGBMocap / Mixamo (.FBX)"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shrink-0">
                  <Video className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-white group-hover:text-cyan-200 truncate">
                    🎥 3D Mocap &amp; FBX Studio
                  </div>
                  <div className="text-[9.5px] text-cyan-200/80 truncate">
                    Import Video (.MP4) or .FBX (Body + Motion + 3D Scene)
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-cyan-400 text-slate-950 font-bold text-[9.5px] shrink-0">
                Open ↗
              </span>
            </button>

            {/* ================= B. MOTION STUDIO ================= */}
            <div
              className={`${
                motionSourceFilter === 'all' || motionSourceFilter === 'clips' ? 'block' : 'hidden'
              } inspector-section space-y-2`}
            >
              {/* Motion Studio Header + Active Motion Status Badge */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onToggleMotionSection?.(actor.id)}
                  className="flex items-center gap-1.5 text-left group min-w-0"
                  title="Toggle Ready-Made Motions section"
                >
                  {isMotionSectionOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span className="text-emerald-400 text-sm leading-none shrink-0">🏃</span>
                  <span className="text-[11.5px] font-semibold text-emerald-300 group-hover:text-emerald-200 tracking-tight truncate">
                    Motion Clips
                  </span>
                </button>

                {/* Live Active Motion Indicator Pill */}
                {activeMotionClipObj ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-400/50 text-[10px] font-semibold text-emerald-200 truncate max-w-[165px] shadow-sm"
                    title={`Currently applied motion clip: ${activeMotionClipObj.name}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="shrink-0">{activeMotionClipObj.icon}</span>
                    <span className="truncate">Active: {activeMotionClipObj.name}</span>
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900/80 border border-white/[0.08] text-[9.5px] text-slate-400 truncate"
                    title="Pick any action clip below to apply a ready-made motion"
                  >
                    <span>Select an action clip</span>
                  </span>
                )}
              </div>

              {(isMotionSectionOpen || activeSubTab === 'motion') && (
                <div className="pt-0.5">
                  {/* Step 1: Connected Category Folder Tabs (Humanoid) */}
                  {isHumanoid && (
                    <div>
                      <div className="flex items-center justify-between px-1 pb-1 text-[9.5px] font-medium text-slate-400">
                        <span>1. Category</span>
                        <span className="text-indigo-300/80 font-mono">2. Action</span>
                      </div>
                      <div className="flex items-stretch gap-1 px-1">
                        {(
                          [
                            { id: 'move', label: 'Move / Jump', fullLabel: 'Move / Jump', icon: '🏃' },
                            { id: 'combat', label: 'Fight / Action', fullLabel: 'Fight / Action', icon: '⚔️' },
                            { id: 'acting', label: 'Act / Emote', fullLabel: 'Act / Emote', icon: '🎭' },
                          ] as const
                        ).map((tab) => {
                          const isTabActive = activeHumanGroup === tab.id;
                          const hasActiveClipInTab = activeMotionClipObj?.humanGroup === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => onUpdateHumanGroup(actor.id, tab.id)}
                              title={
                                hasActiveClipInTab
                                  ? `${tab.fullLabel} folder (contains active clip: ${activeMotionClipObj?.name})`
                                  : `Browse ${tab.fullLabel} action presets`
                              }
                              className={`relative flex items-center justify-center rounded-t-lg tracking-tight font-semibold border-t border-x transition-all cursor-pointer ${
                                isTabActive
                                  ? 'flex-1 min-w-0 gap-1.5 py-1.5 px-2.5 text-[10.5px] bg-[#111726] border-indigo-400/60 text-white shadow-[0_-2px_10px_rgba(99,102,241,0.15)] z-10 -mb-px pb-2'
                                  : 'w-10 shrink-0 py-1.5 px-2 bg-[#090d16] border-white/[0.07] text-slate-300 hover:text-white hover:bg-[#0e1526]'
                              }`}
                            >
                              <span className={isTabActive ? 'text-[13px] leading-none shrink-0' : 'text-[14px] leading-none'}>
                                {tab.icon}
                              </span>
                              <span className={isTabActive ? 'truncate font-bold' : 'sr-only'}>
                                {tab.label}
                              </span>
                              {hasActiveClipInTab && (
                                <span
                                  className={
                                    isTabActive
                                      ? 'h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] shrink-0'
                                      : 'absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]'
                                  }
                                  title={`Active motion (${activeMotionClipObj?.name}) is in this category`}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Connected Folder Body: Preset Action Grid + Dedicated Floor Path Bar */}
                  <div
                    className={`rounded-b-xl ${isHumanoid ? 'rounded-tl-none rounded-tr-none border-indigo-400/45' : 'rounded-xl border-white/[0.1]'
                      } bg-[#111726] border p-2 space-y-2 shadow-inner overflow-hidden`}
                  >
                    {/* Folder Sub-Header showing active category & clip count */}
                    <div className="flex items-center justify-between gap-1 text-[9.5px] text-slate-400 px-0.5">
                      <span className="font-medium text-indigo-200/90 truncate">
                        {isHumanoid
                          ? activeHumanGroup === 'move'
                            ? '📂 Move & Jump Clips:'
                            : activeHumanGroup === 'combat'
                              ? '📂 Fight & Action Clips:'
                              : '📂 Act & Emote Clips:'
                          : `📂 ${OBJECT_CATEGORY_LABELS[objCategory]} Clips:`}
                      </span>
                      <span className="font-mono text-[9px] text-slate-400 bg-black/30 px-1.5 py-0.5 rounded border border-white/[0.06] shrink-0">
                        {visibleClips.length} clips
                      </span>
                    </div>

                    {/* Step 2: Action Preset Grid (All Ready-Made Motions for Active Category) */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {visibleClips.map((clip) => {
                        const isActiveClip = actor.motionClip === clip.id;
                        const clipWillTravel =
                          travelMode === 'travel'
                            ? true
                            : travelMode === 'in-place'
                              ? false
                              : clip.travelsByDefault;
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
                                motionCycles: actor.motionCycles ?? 1,
                              });
                            }}
                            className={`flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg text-left text-[10.5px] font-medium border transition-all min-w-0 ${isActiveClip
                                ? 'bg-emerald-600/25 border-emerald-400/80 text-white font-semibold shadow-[0_0_12px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/40'
                                : 'bg-[#161e31] hover:bg-[#1d2740] border-white/[0.08] hover:border-indigo-400/40 text-slate-200 hover:text-white'
                              }`}
                            title={`${clip.description} (${safeStart.toFixed(1)}s → ${safeEnd.toFixed(1)}s • ${clipWillTravel ? 'Travels across floor' : 'Stays in-place on spot'
                              })`}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs leading-none shrink-0">{clip.icon}</span>
                              <span className="truncate">{clip.name}</span>
                            </span>
                            <span
                              className={`shrink-0 text-[8.5px] font-mono px-1 py-0.2 rounded ${isActiveClip
                                  ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-300/40'
                                  : clipWillTravel
                                    ? 'bg-cyan-950/60 text-cyan-300/80'
                                    : 'bg-slate-900/70 text-slate-400'
                                }`}
                            >
                              {isActiveClip ? 'ON' : clipWillTravel ? '👣' : '📍'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Dedicated Floor Path Footer Bar (Label on line 1, 3-way buttons on line 2 so nothing overflows) */}
                    <div className="pt-1.5 border-t border-white/[0.07] space-y-1">
                      <div className="flex items-center justify-between text-[9.5px] px-0.5">
                        <span
                          className="font-semibold text-slate-300"
                          title="Controls whether the selected action travels across the stage floor or stays planted on the current spot"
                        >
                          Floor Path:
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {travelMode === 'auto'
                            ? 'Default per clip'
                            : travelMode === 'travel'
                              ? 'Forces floor travel'
                              : 'Locked on spot'}
                        </span>
                      </div>
                      <div
                        className="grid grid-cols-3 gap-1 rounded-lg bg-[#090c14] p-0.5 border border-white/[0.08] text-[10px]"
                        role="group"
                        aria-label="Motion Floor Travel Mode"
                      >
                        {(
                          [
                            {
                              id: 'auto',
                              label: 'Auto',
                              icon: '⚡',
                              tip: 'Auto Path: Walk/Run/Jump travels across floor; Fight/Act stays on spot',
                            },
                            {
                              id: 'travel',
                              label: 'Move',
                              icon: '👣',
                              tip: 'Move / Travel Floor: Move across the stage floor while performing the action',
                            },
                            {
                              id: 'in-place',
                              label: 'Spot',
                              icon: '📍',
                              tip: 'In-Place (Spot): Lock to current floor coordinates and perform action on the spot',
                            },
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
                                    motionCycles: actor.motionCycles ?? 1,
                                  });
                                }
                              }}
                              className={`inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md font-medium transition-all min-w-0 ${isActiveMode
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'text-slate-400 hover:text-slate-200'
                                }`}
                              title={mMode.tip}
                            >
                              <span className="text-[10px] leading-none shrink-0">{mMode.icon}</span>
                              <span className="truncate">{mMode.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
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
                        let nextTrajectory = actor.trajectory;
                        const curDist = Math.hypot(
                          actor.trajectory.endPosition.x - actor.trajectory.startPosition.x,
                          actor.trajectory.endPosition.y - actor.trajectory.startPosition.y
                        );
                        if (
                          (gaitMode === 'walk' || gaitMode === 'run' || gaitMode === 'sneak') &&
                          travelMode !== 'in-place' &&
                          curDist < 1.0 &&
                          (!actor.trajectory.keyframes || actor.trajectory.keyframes.length === 0)
                        ) {
                          const naturalSpeed =
                            gaitMode === 'run' ? 6.85 : gaitMode === 'sneak' ? 2.65 : 4.16;
                          const travelSpan = Math.min(36, Math.max(10, shotDur * naturalSpeed));
                          const sPos = actor.trajectory.startPosition;
                          const targetY =
                            sPos.y <= 70
                              ? Math.min(90, Number((sPos.y + travelSpan).toFixed(1)))
                              : Math.max(10, Number((sPos.y - travelSpan).toFixed(1)));
                          nextTrajectory = {
                            ...actor.trajectory,
                            endPosition: {
                              x: sPos.x,
                              y: targetY,
                              z: sPos.z ?? 0,
                            },
                          };
                        }
                        onUpdateActor(actor.id, {
                          gait: gaitMode,
                          motionClip: undefined,
                          posePreset: undefined,
                          pose: undefined,
                          rotation: uprightRot,
                          trajectory: nextTrajectory,
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
          </div>

          {/* ================= SUB-TAB 2: TIMING & DIRECTION ================= */}
          <div className={activeSubTab === 'timing' || activeSubTab === 'all' ? 'inspector-section space-y-2' : 'hidden'}>
            {/* Row 1: Timing Header + Quick Range Buttons (Full / Playhead) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleTimingSection?.(actor.id)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200 hover:text-white shrink-0"
                  title="Toggle Timing & Direction section"
                >
                  <Clock className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span>Timing</span>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateMotionWindow(actor.id, { start: 0, end: shotDur });
                      if (actor.motionClip) {
                        onApplyReadyMadeMotion(actor.id, actor.motionClip, {
                          startTimeSec: 0,
                          endTimeSec: shotDur,
                          travelMode,
                          motionCycles: actor.motionCycles ?? 1,
                        });
                      }
                    }}
                    className="px-2 py-0.5 rounded-md bg-[#141926] hover:bg-[#1c2334] text-[10px] font-medium text-slate-300 hover:text-white border border-white/[0.08]"
                    title={`Span full shot duration (0s – ${shotDur}s)`}
                  >
                    Full ({shotDur}s)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const playheadStart = Math.min(shotDur - 0.5, Number(currentTime.toFixed(1)));
                      onUpdateMotionWindow(actor.id, { start: playheadStart, end: shotDur });
                      if (actor.motionClip) {
                        onApplyReadyMadeMotion(actor.id, actor.motionClip, {
                          startTimeSec: playheadStart,
                          endTimeSec: shotDur,
                          travelMode,
                          motionCycles: actor.motionCycles ?? 1,
                        });
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-[10px] font-semibold text-amber-300 border border-amber-500/35"
                    title="Set start time to current playhead position"
                  >
                    <Play className="h-2.5 w-2.5 fill-amber-300 text-amber-300 shrink-0" />
                    <span>Playhead</span>
                  </button>
                </div>
              </div>

              {/* Row 1B: Start & End Second Inputs on their own clean line */}
              <div className="flex items-center justify-between gap-2 rounded-lg bg-[#111622] border border-white/[0.06] px-2.5 py-1 font-mono text-[10.5px]">
                <span className="text-[10px] font-sans font-medium text-slate-400">Range (sec):</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, shotDur - 0.5)}
                    step={0.5}
                    value={safeStart}
                    aria-label="Start time in seconds"
                    onChange={(e) => {
                      const nextStart = Math.max(0, Math.min(shotDur - 0.5, Number(e.target.value) || 0));
                      const nextEnd = Math.max(nextStart + 0.5, safeEnd);
                      onUpdateMotionWindow(actor.id, {
                        start: nextStart,
                        end: nextEnd,
                      });
                      if (actor.motionClip) {
                        onApplyReadyMadeMotion(actor.id, actor.motionClip, {
                          startTimeSec: nextStart,
                          endTimeSec: nextEnd,
                          travelMode,
                          motionCycles: actor.motionCycles ?? 1,
                        });
                      }
                    }}
                    className="w-12 rounded-md bg-[#131824] border border-white/[0.1] px-1.5 py-0.5 text-center text-emerald-300 font-bold focus:outline-none focus:border-emerald-400"
                  />
                  <span className="text-slate-500">to</span>
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
                      if (actor.motionClip) {
                        onApplyReadyMadeMotion(actor.id, actor.motionClip, {
                          startTimeSec: safeStart,
                          endTimeSec: nextEnd,
                          travelMode,
                          motionCycles: actor.motionCycles ?? 1,
                        });
                      }
                    }}
                    className="w-12 rounded-md bg-[#131824] border border-white/[0.1] px-1.5 py-0.5 text-center text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-slate-500 text-[10px]">s</span>
                </div>
              </div>
            </div>

            {(isTimingSectionOpen || activeSubTab === 'timing') && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-[#111622] border border-white/[0.06] px-2.5 py-1.5">
                <span
                  className="flex items-center gap-1.5 text-[10.5px] font-semibold text-indigo-200/90"
                  title="Define how many times the character repeats this action across the selected duration instead of looping endlessly"
                >
                  <Repeat className="h-3 w-3 text-indigo-400 shrink-0" />
                  <span>Action Cycles</span>
                </span>
                <div className="flex items-center gap-1 font-mono text-[10px]" role="group" aria-label="Action Cycle Count">
                  {[1, 2, 3, 4, 5].map((cyc) => {
                    const activeCycles = actor.motionCycles ?? 1;
                    const isActiveCyc = activeCycles === cyc;
                    return (
                      <button
                        key={cyc}
                        type="button"
                        onClick={() => {
                          onSelectActor(actor.id);
                          onUpdateActor(actor.id, { motionCycles: cyc });
                          if (actor.motionClip) {
                            onApplyReadyMadeMotion(actor.id, actor.motionClip, {
                              startTimeSec: safeStart,
                              endTimeSec: safeEnd,
                              travelMode,
                              motionCycles: cyc,
                            });
                          } else {
                            const actionText = (actor.actionDescription || 'walk forward').trim();
                            onDirectCustomAction(actor, actionText, safeStart, safeEnd, cueDuration, cyc);
                          }
                        }}
                        className={`px-2 py-0.5 rounded-md font-bold transition-all border ${
                          isActiveCyc
                            ? 'bg-indigo-600 text-white border-indigo-400/70 shadow-sm'
                            : 'bg-[#0b0e17] text-slate-400 hover:text-white border-white/[0.07] hover:bg-[#161c2c]'
                        }`}
                        title={`Repeat action ${cyc} ${cyc === 1 ? 'time' : 'times'} across ${safeStart}s–${safeEnd}s`}
                      >
                        {cyc}x
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

            {/* ================= AI MOTION DIRECTOR (VISIBLE IN MOTION, TIMING & ALL TABS) ================= */}
            <div
              className={
                (activeSubTab === 'motion' && (motionSourceFilter === 'all' || motionSourceFilter === 'ai')) ||
                activeSubTab === 'timing' ||
                activeSubTab === 'all'
                  ? 'inspector-section space-y-2'
                  : 'hidden'
              }
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-emerald-300">
                  <Sparkles className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span>AI Motion Direction (Describe Movement)</span>
                  {isAlreadyDirected && (
                    <span
                      data-testid="directed-active-badge"
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 text-[9px] font-mono"
                      title="Current prompt & timing window are already compiled into live motion keyframes. Edit prompt or click + Chain to add next movement."
                    >
                      <Check className="h-2.5 w-2.5 text-cyan-300" />
                      <span>Directed</span>
                    </span>
                  )}
                </span>
                <span className="text-[9.5px] font-mono text-slate-400">
                  {safeStart.toFixed(1)}s → {safeEnd.toFixed(1)}s
                </span>
              </div>

              {/* Natural-Language Direction Prompt + Direct & Chain Buttons */}
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
                        setLastDirectedSignature(
                          `${actionText}|${safeStart.toFixed(1)}|${safeEnd.toFixed(1)}|${actor.motionCycles ?? 1}`
                        );
                        onDirectCustomAction(actor, actionText, safeStart, safeEnd, cueDuration, actor.motionCycles ?? 1);
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
                    setLastDirectedSignature(
                      `${actionText}|${safeStart.toFixed(1)}|${safeEnd.toFixed(1)}|${actor.motionCycles ?? 1}`
                    );
                    onDirectCustomAction(actor, actionText, safeStart, safeEnd, cueDuration, actor.motionCycles ?? 1);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg disabled:opacity-50 text-white text-[11px] font-semibold shadow-sm border shrink-0 cursor-pointer transition-colors ${
                    isAlreadyDirected
                      ? 'bg-cyan-700/80 hover:bg-cyan-600 border-cyan-400/50'
                      : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400/40'
                  }`}
                  title={
                    isAlreadyDirected
                      ? `Current prompt already compiled (${safeStart.toFixed(1)}s → ${safeEnd.toFixed(1)}s) — Click to replay or edit prompt to direct a new action`
                      : `Compile action into stage trajectory & pose keyframes (${safeStart.toFixed(1)}s → ${safeEnd.toFixed(1)}s)`
                  }
                >
                  {generatingActingId === actor.id ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Directing...</span>
                    </>
                  ) : isAlreadyDirected ? (
                    <>
                      <RotateCcw className="h-3 w-3 text-cyan-200" />
                      <span>Direct</span>
                      <span className="text-[9.5px] font-mono text-cyan-200">(Replay)</span>
                    </>
                  ) : (
                    <>
                      <Activity className="h-3.5 w-3.5" />
                      <span>Direct</span>
                      <Play className="h-2.5 w-2.5 fill-white" />
                    </>
                  )}
                </button>

                {hasExistingMotionWithNewPrompt && (
                  <button
                    type="button"
                    disabled={generatingActingId === actor.id}
                    onClick={() => {
                      const actionText = (actor.actionDescription || 'walk forward').trim();
                      const chainStart = Number(lastKfTime.toFixed(1));
                      const neededEnd =
                        chainStart >= shotDur - 0.5 ? Math.min(15, Number((chainStart + 3.0).toFixed(1))) : shotDur;
                      if (neededEnd > shotDur && onExtendShotDuration) {
                        onExtendShotDuration(neededEnd);
                      }
                      const chainDur = Math.max(0.5, Number((neededEnd - chainStart).toFixed(1)));
                      onUpdateMotionWindow(actor.id, { start: chainStart, end: neededEnd });
                      setLastDirectedSignature(
                        `${actionText}|${chainStart.toFixed(1)}|${neededEnd.toFixed(1)}|${actor.motionCycles ?? 1}`
                      );
                      onDirectCustomAction(
                        actor,
                        actionText,
                        chainStart,
                        neededEnd,
                        chainDur,
                        actor.motionCycles ?? 1
                      );
                    }}
                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-50 text-white text-[10.5px] font-semibold shadow-sm border border-indigo-400/50 shrink-0 cursor-pointer transition-colors"
                    title={`Append "${currentActionText}" starting from ${lastKfTime.toFixed(1)}s where the previous movement ended`}
                  >
                    <span>+ Chain</span>
                  </button>
                )}
              </div>

              {/* Active Cue Status, Chaining & Start Fresh / Clear */}
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/[0.06] font-mono text-[10px]">
                <span
                  className="flex items-center gap-1.5 text-slate-400 truncate"
                  style={actor.color ? { color: actor.color } : undefined}
                >
                  <MapPin
                    className="h-3 w-3 text-rose-400 shrink-0"
                    style={actor.color ? { color: actor.color } : undefined}
                  />
                  <span className="truncate">
                    {kfs.length} {kfs.length === 1 ? 'cue' : 'cues'} ({Math.round(actor.trajectory.startPosition.x)},{Math.round(actor.trajectory.startPosition.y)} → {Math.round(actor.trajectory.endPosition.x)},{Math.round(actor.trajectory.endPosition.y)})
                  </span>
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  {kfs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextStart = Number(lastKfTime.toFixed(1));
                        const nextEnd =
                          nextStart >= shotDur - 0.5 ? Math.min(15, Number((nextStart + 3.0).toFixed(1))) : shotDur;
                        if (nextEnd > shotDur && onExtendShotDuration) {
                          onExtendShotDuration(nextEnd);
                        }
                        onUpdateMotionWindow(actor.id, {
                          start: nextStart,
                          end: nextEnd,
                        });
                        promptInputRef.current?.focus();
                        promptInputRef.current?.select();
                      }}
                      className="px-2 py-0.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 font-semibold"
                      title="Set timing window to continue where the previous cue finished (auto-extends shot duration if at end)"
                    >
                      + Next ({lastKfTime.toFixed(1)}s→
                      {lastKfTime >= shotDur - 0.5 ? Math.min(15, Number((lastKfTime + 3.0).toFixed(1))) : shotDur}s)
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setLastDirectedSignature(null);
                      onUpdateMotionWindow(actor.id, { start: 0, end: shotDur });
                      if (onResetActorMotion) {
                        onResetActorMotion(actor.id);
                      }
                      onUpdateActor(actor.id, {
                        gait: 'idle',
                        motionClip: undefined,
                        motionCycles: 1,
                        posePreset: 'neutral-stand',
                        pose: undefined,
                        ikTargets: undefined,
                        trajectory: {
                          ...actor.trajectory,
                          endPosition: { ...actor.trajectory.startPosition },
                          keyframes: [],
                        },
                      });
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/35 font-medium transition-colors"
                    title="Cancel all motion completely, rewind to 0.0s, and start fresh from initial position"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              {/* ================= INTERACTIVE DRAG & DROP CUE RIBBON & PACING SHAPER ================= */}
              {kfs.length > 0 && (() => {
                const actorHex = actor.color || '#10b981';
                const cueSpanStart = kfs[0].time;
                const cueSpanEnd = kfs[kfs.length - 1].time;
                const cueSpanDur = Math.max(0.1, cueSpanEnd - cueSpanStart);
                const startPct = Math.max(0, Math.min(100, (cueSpanStart / shotDur) * 100));
                const endPct = Math.max(startPct + 2, Math.min(100, (cueSpanEnd / shotDur) * 100));

                return (
                  <div
                    data-testid={`actor-cue-ribbon-${actor.id}`}
                    className="rounded-lg bg-[#090d16] border border-white/[0.08] p-2 space-y-1.5 select-none"
                  >
                    {/* Header: Subject Identity Badge + Speed Span + Motion Pacing Curve Buttons */}
                    <div className="flex items-center justify-between gap-1.5 flex-wrap text-[9.5px] font-mono">
                      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: actorHex }}>
                        <span
                          className="h-2 w-2 rounded-full border border-white/40"
                          style={{ backgroundColor: actorHex }}
                        />
                        <span>
                          {actor.name.slice(0, 12)} Cues ({cueSpanStart.toFixed(1)}s–{cueSpanEnd.toFixed(1)}s • {cueSpanDur.toFixed(1)}s)
                        </span>
                      </span>

                      <div className="flex items-center gap-1 flex-wrap">
                        {selectedCueId && kfs.some((k) => k.id === selectedCueId) && onRemoveActorCue && (
                          <button
                            type="button"
                            data-testid={`delete-selected-cue-btn-${actor.id}`}
                            onClick={() => {
                              onRemoveActorCue(actor.id, selectedCueId);
                              setSelectedCueId(null);
                              window.dispatchEvent(new CustomEvent('cmpvs:select-cue', { detail: null }));
                            }}
                            className="px-1.5 py-0.5 rounded text-[8.5px] font-bold border border-rose-500/60 bg-rose-500/20 text-rose-200 hover:bg-rose-500/35 transition-colors flex items-center gap-1"
                            title="Delete selected cue (or press Delete / Backspace)"
                          >
                            <span>✕ Delete Cue (Del)</span>
                          </button>
                        )}
                        {(
                          [
                            { id: 'linear' as const, label: 'Linear', tip: 'Constant steady speed across cues' },
                            { id: 'ease-in-out' as const, label: 'Smooth', tip: 'Smooth cinematic Ease-In-Out acceleration' },
                            { id: 'fast-start' as const, label: 'Burst ⚡', tip: 'Explosive fast start, gradual slow finish' },
                            { id: 'slow-start' as const, label: 'Ramp ↗', tip: 'Slow stealth start, rapid finish' },
                          ]
                        ).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setActivePacingCurve(c.id);
                              if (onApplyActorMotionCurve) {
                                onApplyActorMotionCurve(actor.id, c.id, cueSpanStart, cueSpanEnd);
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded text-[8.5px] font-semibold border transition-colors ${
                              activePacingCurve === c.id
                                ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50'
                                : 'bg-[#121723] text-slate-400 hover:text-white border-white/[0.08]'
                            }`}
                            title={c.tip}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Interactive Drag-and-Drop Cue Track */}
                    <div
                      ref={cueRibbonRef}
                      onPointerMove={(e) => {
                        if (!cueRibbonRef.current) return;
                        const rect = cueRibbonRef.current.getBoundingClientRect();
                        if (rect.width <= 0) return;
                        if (draggingCueId) {
                          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                          const nextTime = Number(
                            Math.min(shotDur, Math.max(0, pct * shotDur + draggingCueGrabOffsetSec)).toFixed(2)
                          );
                          onMoveActorCueTime?.(actor.id, draggingCueId, nextTime);
                          onSeekTime?.(nextTime);
                        } else if (draggingSpanEdge) {
                          const initStart = draggingSpanEdge.initialStart;
                          const initEnd = draggingSpanEdge.initialEnd;
                          const deltaSec = ((e.clientX - draggingSpanEdge.startClientX) / rect.width) * shotDur;
                          if (draggingSpanEdge.side === 'start') {
                            const nextStart = Math.max(0, Math.min(initEnd - 0.3, initStart + deltaSec));
                            onScaleActorCuesInRange?.(
                              actor.id,
                              initStart,
                              initEnd,
                              Number(nextStart.toFixed(2)),
                              initEnd,
                              draggingSpanEdge.initialTimesById
                            );
                            onUpdateMotionWindow(actor.id, {
                              start: Number(nextStart.toFixed(1)),
                              end: Number(initEnd.toFixed(1)),
                            });
                          } else if (draggingSpanEdge.side === 'end') {
                            const nextEnd = Math.max(initStart + 0.3, Math.min(shotDur, initEnd + deltaSec));
                            onScaleActorCuesInRange?.(
                              actor.id,
                              initStart,
                              initEnd,
                              initStart,
                              Number(nextEnd.toFixed(2)),
                              draggingSpanEdge.initialTimesById
                            );
                            onUpdateMotionWindow(actor.id, {
                              start: Number(initStart.toFixed(1)),
                              end: Number(nextEnd.toFixed(1)),
                            });
                          } else if (draggingSpanEdge.side === 'move') {
                            const spanLen = initEnd - initStart;
                            const nextStart = Math.max(0, Math.min(shotDur - spanLen, initStart + deltaSec));
                            const nextEnd = Math.min(shotDur, nextStart + spanLen);
                            onScaleActorCuesInRange?.(
                              actor.id,
                              initStart,
                              initEnd,
                              Number(nextStart.toFixed(2)),
                              Number(nextEnd.toFixed(2)),
                              draggingSpanEdge.initialTimesById
                            );
                            onUpdateMotionWindow(actor.id, {
                              start: Number(nextStart.toFixed(1)),
                              end: Number(nextEnd.toFixed(1)),
                            });
                          }
                        }
                      }}
                      onPointerUp={(e) => {
                        if (draggingCueId || draggingSpanEdge) {
                          setDraggingCueId(null);
                          setDraggingCueGrabOffsetSec(0);
                          setDraggingSpanEdge(null);
                          try {
                            cueRibbonRef.current?.releasePointerCapture(e.pointerId);
                          } catch {}
                        }
                      }}
                      onPointerCancel={() => {
                        setDraggingCueId(null);
                        setDraggingCueGrabOffsetSec(0);
                        setDraggingSpanEdge(null);
                      }}
                      className="relative h-7 w-full rounded-md bg-[#111726] border border-white/[0.1] overflow-hidden touch-none"
                      title="Drag cue nodes to retime individual moments, or drag the colored bar edges to speed up / slow down the entire movement"
                    >
                      {/* Span Bar (Drag body to shift window, drag left/right handles to stretch/compress speed) */}
                      <div
                        data-testid={`actor-cue-span-bar-${actor.id}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          cueRibbonRef.current?.setPointerCapture(e.pointerId);
                          const initialTimesById: Record<string, number> = {};
                          kfs.forEach((k) => {
                            initialTimesById[k.id] = k.time;
                          });
                          setDraggingSpanEdge({
                            side: 'move',
                            initialStart: cueSpanStart,
                            initialEnd: cueSpanEnd,
                            startClientX: e.clientX,
                            initialTimesById,
                          });
                        }}
                        className="absolute top-1 bottom-1 rounded flex items-center justify-between cursor-grab active:cursor-grabbing"
                        style={{
                          left: `${startPct}%`,
                          width: `${Math.max(3, endPct - startPct)}%`,
                          backgroundColor: `${actorHex}28`,
                          border: `1px solid ${actorHex}90`,
                        }}
                      >
                        {/* Left Speed Stretch Handle */}
                        <div
                          data-testid={`actor-cue-stretch-start-${actor.id}`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            cueRibbonRef.current?.setPointerCapture(e.pointerId);
                            const initialTimesById: Record<string, number> = {};
                            kfs.forEach((k) => {
                              initialTimesById[k.id] = k.time;
                            });
                            setDraggingSpanEdge({
                              side: 'start',
                              initialStart: cueSpanStart,
                              initialEnd: cueSpanEnd,
                              startClientX: e.clientX,
                              initialTimesById,
                            });
                          }}
                          className="h-full w-2 cursor-ew-resize flex items-center justify-center hover:bg-white/30 rounded-l"
                          title="Drag left/right to change movement start time & speed"
                        >
                          <span className="h-2.5 w-0.5 rounded bg-white/80" />
                        </div>

                        <span className="text-[8.5px] font-mono text-white/90 truncate px-1 pointer-events-none">
                          ⇄ Drag to shift / edges for speed
                        </span>

                        {/* Right Speed Stretch Handle */}
                        <div
                          data-testid={`actor-cue-stretch-end-${actor.id}`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            cueRibbonRef.current?.setPointerCapture(e.pointerId);
                            const initialTimesById: Record<string, number> = {};
                            kfs.forEach((k) => {
                              initialTimesById[k.id] = k.time;
                            });
                            setDraggingSpanEdge({
                              side: 'end',
                              initialStart: cueSpanStart,
                              initialEnd: cueSpanEnd,
                              startClientX: e.clientX,
                              initialTimesById,
                            });
                          }}
                          className="h-full w-2 cursor-ew-resize flex items-center justify-center hover:bg-white/30 rounded-r"
                          title="Drag left/right to compress (faster) or stretch (slower) movement"
                        >
                          <span className="h-2.5 w-0.5 rounded bg-white/80" />
                        </div>
                      </div>

                      {/* Draggable Individual Cue Nodes (All Cues Rendered Stably & Centered 1:1) */}
                      {kfs.map((kf) => {
                        const kfPct = Math.max(0, Math.min(100, (kf.time / shotDur) * 100));
                        const isAirborne = (kf.position.z ?? 0) > 2;
                        const isLocomotion = kf.gait === 'walk' || kf.gait === 'run' || kf.gait === 'sneak';
                        const isCueSelected = selectedCueId === kf.id;

                        return (
                          <div
                            key={kf.id}
                            data-testid={`draggable-cue-node-${kf.id}`}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              cueRibbonRef.current?.setPointerCapture(e.pointerId);
                              const rect = cueRibbonRef.current?.getBoundingClientRect();
                              const clickedTime =
                                rect && rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * shotDur : kf.time;
                              const rawOffset = kf.time - clickedTime;
                              setDraggingCueGrabOffsetSec(Math.abs(rawOffset) <= 0.12 ? rawOffset : 0);
                              setDraggingCueId(kf.id);
                              setSelectedCueId(kf.id);
                              window.dispatchEvent(
                                new CustomEvent('cmpvs:select-cue', {
                                  detail: { kind: 'actor-cue', actorId: actor.id, cueId: kf.id },
                                })
                              );
                              onSeekTime?.(kf.time);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (onRemoveActorCue) {
                                onRemoveActorCue(actor.id, kf.id);
                                if (selectedCueId === kf.id) {
                                  setSelectedCueId(null);
                                  window.dispatchEvent(new CustomEvent('cmpvs:select-cue', { detail: null }));
                                }
                              }
                            }}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-30 h-5 w-5 flex items-center justify-center cursor-ew-resize group"
                            style={{ left: `${kfPct}%` }}
                            title={`Click to select & press Delete to remove • Right-click to delete • Drag to retime Cue @ ${kf.time.toFixed(2)}s (${kf.motionClip || kf.posePreset || kf.gait || 'pose'})`}
                          >
                            <div
                              className={`h-3 w-3 border shadow transition-transform group-hover:scale-125 ${
                                isCueSelected
                                  ? 'border-white ring-2 ring-rose-400 scale-125'
                                  : 'border-white'
                              } ${
                                isAirborne
                                  ? 'rounded-sm rotate-12'
                                  : isLocomotion
                                  ? 'rotate-45'
                                  : 'rounded-full'
                              }`}
                              style={{ backgroundColor: actorHex }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ================= E. APPEARANCE, COLOR & RIG SLIDERS ================= */}
            <div
              className={
                activeSubTab === 'look' || activeSubTab === 'rig' || activeSubTab === 'all'
                  ? 'rounded-xl bg-[#0d111a] border border-white/[0.08] overflow-hidden'
                  : 'hidden'
              }
            >
              {/* Collapsible Section Header (shown in All mode) */}
              <button
                type="button"
                onClick={() => onToggleFineTune(actor.id)}
                className={
                  activeSubTab === 'all'
                    ? 'w-full flex items-center justify-between gap-2 px-3 py-2 bg-[#121724] hover:bg-[#171e2f] text-slate-200 transition-colors'
                    : 'hidden'
                }
                title="Toggle Appearance, Color, Transform & Rigging controls"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold min-w-0">
                  {isFineTuneOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  )}
                  <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">Look &amp; Rig</span>
                </span>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">
                  X:{currentX} Z:{currentDepthZ} <span className="text-slate-600">|</span> {(actor.scale ?? 1.0).toFixed(1)}
                </span>
              </button>

              {(isFineTuneOpen || activeSubTab === 'look' || activeSubTab === 'rig') && (
                <div className="p-2.5 space-y-2.5 border-t border-white/[0.06]">
                  {/* SUB-TAB 3: LOOK, .GLB & COLOR SWATCHES */}
                  <div className={activeSubTab === 'look' || activeSubTab === 'all' ? 'space-y-2.5' : 'hidden'}>
                    {/* 1. Edit 3D Look by Prompt & Attach .GLB (Locked once a .GLB 3D object is created) */}
                    <div className="inspector-subcard space-y-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                          <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          <span>
                            {actor.modelUrl ? '🔒 Locked .GLB' : '3D Look Prompt'}
                          </span>
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!actor.modelUrl && (
                            <>
                              <label
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#161c2a] hover:bg-[#1e2638] border border-white/[0.1] text-[10px] font-medium text-slate-200 hover:text-white cursor-pointer transition-colors"
                                title="Attach a custom .GLB / .GLTF 3D model"
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
                                <span>Attach .GLB</span>
                              </label>

                              <button
                                type="button"
                                onClick={() => setShowGlbResources((prev) => !prev)}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium transition-colors cursor-pointer ${showGlbResources
                                    ? 'bg-indigo-600 text-white border-indigo-400'
                                    : 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 border-indigo-500/35'
                                  }`}
                                title="Browse 14 curated Free CC0, Sketchfab, Mixamo & AI Animated .GLB websites"
                              >
                                <Globe className="h-3 w-3 text-indigo-300" />
                                <span>.GLB Sites</span>
                              </button>

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
                            </>
                          )}
                          {actor.modelUrl && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-[9.5px] font-mono text-emerald-200 font-semibold">
                              ✓ Authentic .GLB
                            </span>
                          )}
                        </div>
                      </div>

                      {actor.modelUrl ? (
                        <div className="rounded-lg bg-[#0d111a] border border-white/[0.08] px-2.5 py-1.5 text-[10.5px] font-mono text-slate-400 leading-relaxed">
                          3D <code className="text-cyan-300">.GLB</code> mesh is locked after creation. You can position, rotate, scale, and animate its rig on stage.
                        </div>
                      ) : (
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
                      )}

                      {showGlbResources && !actor.modelUrl && (
                        <div className="pt-1">
                          <GlbResourcesDirectory compact defaultExpanded />
                        </div>
                      )}
                    </div>

                    {/* 2. Target Color (Scene ID) */}
                    <div className="inspector-subcard space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                          <Palette className="h-3.5 w-3.5 text-purple-400" />
                          <span>Target Color</span>
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
                                className={`h-5 w-5 rounded-full border transition-transform ${isColorActive
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
                  </div>

                  {/* SUB-TAB 4: RIG, XYZ TRANSFORM, SCALE & BONE SOCKETS */}
                  <div className={activeSubTab === 'rig' || activeSubTab === 'all' ? 'space-y-2.5' : 'hidden'}>
                    {/* .GLB Automatic Bone Rigging, Skeleton Overlay & Landmark Fine-Tuner */}
                    {actor.modelUrl && (
                      <div className="inspector-subcard space-y-2 border border-indigo-500/35 bg-[#0f1422]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-200">
                            <span>🦴</span>
                            <span>Auto-Rig &amp; Bones</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onUpdateActor(actor.id, { showBones: !actor.showBones })}
                              className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-semibold border transition-all cursor-pointer ${actor.showBones
                                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                                  : 'bg-black/50 border-white/15 text-slate-300 hover:text-white'
                                }`}
                              title="Toggle 3D skeleton bone & joint overlay on stage"
                            >
                              {actor.showBones ? '🦴 Bones ON' : '🦴 Show Bones'}
                            </button>
                             {actor.rigType !== 'rigid_prop' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setShowRigLandmarksDrawer((v) => {
                                    const next = !v;
                                    if (next && !actor.showBones) {
                                      onUpdateActor(actor.id, { showBones: true });
                                    }
                                    return next;
                                  });
                                }}
                                className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-semibold border transition-all cursor-pointer ${showRigLandmarksDrawer
                                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                                    : 'bg-black/50 border-white/15 text-slate-300 hover:text-white'
                                  }`}
                                title="Fine-tune silhouette joint landmarks (shoulders, wrists, hips, ankles)"
                              >
                                🎯 Joints
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Rig Type Selector */}
                        <div className="grid grid-cols-5 gap-1">
                          {(
                            [
                              { id: 'auto', label: '✨ Auto' },
                              { id: 'humanoid', label: '🧍 Human' },
                              { id: 'quadruped', label: '🐾 Animal' },
                              { id: 'spine_flex', label: '🐍 Spine' },
                              { id: 'rigid_prop', label: '📦 Rigid' },
                            ] as { id: AutoRigType; label: string }[]
                          ).map((opt) => {
                            const activeRig = actor.rigType || 'auto';
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() =>
                                  onUpdateActor(actor.id, {
                                    rigType: opt.id,
                                    showBones: opt.id !== 'rigid_prop' ? true : false,
                                  })
                                }
                                className={`py-1 px-1 rounded text-[9.5px] font-semibold border text-center transition-all cursor-pointer ${activeRig === opt.id
                                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-100'
                                    : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                                  }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Interactive Joint Landmark Fine-Tuner Drawer */}
                        {showRigLandmarksDrawer && actor.rigType !== 'rigid_prop' && (
                          <div className="rounded-lg border border-amber-500/30 bg-black/60 p-2 space-y-2 text-[9.5px] font-mono">
                            <div className="flex items-center justify-between">
                              <span className="text-amber-300 font-bold">
                                🎯 Joint Tuning
                              </span>
                              <button
                                type="button"
                                onClick={() => onUpdateActor(actor.id, { rigLandmarks: undefined })}
                                className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-cyan-200 border border-cyan-500/30 cursor-pointer"
                              >
                                ↺ Reset Auto-Fit
                              </button>
                            </div>
                            {(() => {
                              const lm = {
                                ...DEFAULT_HUMANOID_LANDMARKS,
                                ...(actor.rigLandmarks || {}),
                              };
                              return (
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="flex flex-col gap-0.5 text-slate-300">
                                    <span>Shoulder Y: {Math.round(lm.shoulderY * 100)}%</span>
                                    <input
                                      type="range"
                                      min={0.68}
                                      max={0.86}
                                      step={0.005}
                                      value={lm.shoulderY}
                                      onChange={(e) =>
                                        onUpdateActor(actor.id, {
                                          rigLandmarks: { ...lm, shoulderY: Number(e.target.value) },
                                        })
                                      }
                                      className="accent-amber-400"
                                    />
                                  </label>
                                  <label className="flex flex-col gap-0.5 text-slate-300">
                                    <span>Shoulder X: {Math.round(lm.shoulderSpanX * 100)}%</span>
                                    <input
                                      type="range"
                                      min={0.09}
                                      max={0.24}
                                      step={0.005}
                                      value={lm.shoulderSpanX}
                                      onChange={(e) =>
                                        onUpdateActor(actor.id, {
                                          rigLandmarks: { ...lm, shoulderSpanX: Number(e.target.value) },
                                        })
                                      }
                                      className="accent-amber-400"
                                    />
                                  </label>
                                  <label className="flex flex-col gap-0.5 text-slate-300">
                                    <span>Wrist Span X: {Math.round(lm.wristPos[0] * 100)}%</span>
                                    <input
                                      type="range"
                                      min={0.14}
                                      max={0.46}
                                      step={0.005}
                                      value={lm.wristPos[0]}
                                      onChange={(e) => {
                                        const wx = Number(e.target.value);
                                        onUpdateActor(actor.id, {
                                          rigLandmarks: {
                                            ...lm,
                                            wristPos: [wx, lm.wristPos[1], lm.wristPos[2]],
                                            elbowPos: [
                                              (lm.shoulderSpanX + wx) * 0.5,
                                              lm.elbowPos[1],
                                              lm.elbowPos[2],
                                            ],
                                          },
                                        });
                                      }}
                                      className="accent-amber-400"
                                    />
                                  </label>
                                  <label className="flex flex-col gap-0.5 text-slate-300">
                                    <span>Wrist Height Y: {Math.round(lm.wristPos[1] * 100)}%</span>
                                    <input
                                      type="range"
                                      min={0.42}
                                      max={0.82}
                                      step={0.005}
                                      value={lm.wristPos[1]}
                                      onChange={(e) => {
                                        const wy = Number(e.target.value);
                                        onUpdateActor(actor.id, {
                                          rigLandmarks: {
                                            ...lm,
                                            wristPos: [lm.wristPos[0], wy, lm.wristPos[2]],
                                            elbowPos: [
                                              lm.elbowPos[0],
                                              (lm.shoulderY + wy) * 0.5,
                                              lm.elbowPos[2],
                                            ],
                                          },
                                        });
                                      }}
                                      className="accent-amber-400"
                                    />
                                  </label>
                                  <label className="flex flex-col gap-0.5 text-slate-300">
                                    <span>Hips / Groin Y: {Math.round(lm.hipsY * 100)}%</span>
                                    <input
                                      type="range"
                                      min={0.42}
                                      max={0.62}
                                      step={0.005}
                                      value={lm.hipsY}
                                      onChange={(e) =>
                                        onUpdateActor(actor.id, {
                                          rigLandmarks: { ...lm, hipsY: Number(e.target.value) },
                                        })
                                      }
                                      className="accent-amber-400"
                                    />
                                  </label>
                                  <label className="flex flex-col gap-0.5 text-slate-300">
                                    <span>Leg Width X: {Math.round(lm.anklePos[0] * 100)}%</span>
                                    <input
                                      type="range"
                                      min={0.04}
                                      max={0.22}
                                      step={0.005}
                                      value={lm.anklePos[0]}
                                      onChange={(e) => {
                                        const ax = Number(e.target.value);
                                        onUpdateActor(actor.id, {
                                          rigLandmarks: {
                                            ...lm,
                                            anklePos: [ax, lm.anklePos[1], lm.anklePos[2]],
                                            kneePos: [ax * 0.95, lm.kneePos[1], lm.kneePos[2]],
                                            hipSpanX: Math.max(0.06, ax * 0.85),
                                          },
                                        });
                                      }}
                                      className="accent-amber-400"
                                    />
                                  </label>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Direct Bone Pose & Joint Rotation Inspector (FK + Stage Gizmo Link) */}
                    {(isHumanoid ||
                      actor.rigType === 'humanoid' ||
                      actor.rigType === 'quadruped' ||
                      actor.rigType === 'spine_flex' ||
                      (Boolean(actor.modelUrl) && actor.rigType !== 'rigid_prop')) && (
                      <div className="inspector-subcard space-y-2 border border-cyan-500/30 bg-[#0d1320] font-mono">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-200">
                            <span>🦴</span>
                            <span>Bone Pose &amp; Joint Control</span>
                          </span>
                          <div className="flex items-center gap-1">
                            {actor.pose?.rotations && Object.keys(actor.pose.rotations).length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateActor(actor.id, {
                                    pose: undefined,
                                    posePreset: 'neutral-stand',
                                    gait: 'none',
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-cyan-200 border border-cyan-500/30 text-[9.5px] cursor-pointer"
                                title="Reset all custom bone rotations back to neutral bind pose"
                              >
                                ↺ Reset Pose
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Clickable Bone Pills */}
                        <div className="flex flex-wrap gap-1">
                          {(
                            [
                              'Head',
                              'Neck',
                              'Chest',
                              'Spine',
                              'Hips',
                              'LeftArm',
                              'LeftForeArm',
                              'LeftHand',
                              'RightArm',
                              'RightForeArm',
                              'RightHand',
                              'LeftUpLeg',
                              'LeftLeg',
                              'LeftFoot',
                              'RightUpLeg',
                              'RightLeg',
                              'RightFoot',
                            ] as HumanoidBone[]
                          ).map((bName) => {
                            const bQuat = actor.pose?.rotations?.[bName];
                            const hasRot = Boolean(
                              bQuat &&
                                (Math.abs(bQuat[0]) > 0.005 ||
                                  Math.abs(bQuat[1]) > 0.005 ||
                                  Math.abs(bQuat[2]) > 0.005)
                            );
                            const isSel = selectedInspectorBone === bName;
                            return (
                              <button
                                key={bName}
                                type="button"
                                onClick={() => {
                                  setSelectedInspectorBone(bName);
                                  if (typeof window !== 'undefined') {
                                    window.dispatchEvent(
                                      new CustomEvent('cmpvs:select-actor-bone', {
                                        detail: { actorId: actor.id, bone: bName },
                                      })
                                    );
                                  }
                                }}
                                className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold transition-all cursor-pointer ${
                                  isSel
                                    ? 'bg-cyan-500/30 border-cyan-400 text-cyan-100'
                                    : hasRot
                                      ? 'bg-indigo-500/25 border-indigo-400/40 text-indigo-200'
                                      : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                                }`}
                              >
                                {bName}
                              </button>
                            );
                          })}
                        </div>

                        {/* Pitch (X) / Twist (Y) / Roll (Z) Sliders for Selected Bone */}
                        {(() => {
                          const curQuatTuple = actor.pose?.rotations?.[selectedInspectorBone] || [0, 0, 0, 1];
                          const curEuler = new THREE.Euler().setFromQuaternion(
                            new THREE.Quaternion(
                              curQuatTuple[0],
                              curQuatTuple[1],
                              curQuatTuple[2],
                              curQuatTuple[3]
                            ),
                            'XYZ'
                          );
                          const degX = Math.round((curEuler.x * 180) / Math.PI);
                          const degY = Math.round((curEuler.y * 180) / Math.PI);
                          const degZ = Math.round((curEuler.z * 180) / Math.PI);

                          const handleBoneAxisChange = (axisIdx: 0 | 1 | 2, degVal: number) => {
                            const radVal = Number(((degVal * Math.PI) / 180).toFixed(4));
                            const nextEulerTuple: [number, number, number] = [
                              curEuler.x,
                              curEuler.y,
                              curEuler.z,
                            ];
                            nextEulerTuple[axisIdx] = radVal;
                            const nextQ = new THREE.Quaternion().setFromEuler(
                              new THREE.Euler(
                                nextEulerTuple[0],
                                nextEulerTuple[1],
                                nextEulerTuple[2],
                                'XYZ'
                              )
                            );
                            const nextRotations: Record<string, [number, number, number, number]> = {
                              ...(actor.pose?.rotations || {}),
                              [selectedInspectorBone]: [nextQ.x, nextQ.y, nextQ.z, nextQ.w],
                            };

                            onUpdateActor(actor.id, {
                              pose: {
                                ...(actor.pose || {}),
                                rotations: nextRotations,
                              },
                              posePreset: undefined,
                              gait: 'none',
                            });
                          };

                          return (
                            <div className="grid grid-cols-3 gap-1.5 pt-1 text-[9.5px]">
                              <label className="flex flex-col gap-0.5 text-slate-300">
                                <span>Pitch X: {degX}°</span>
                                <input
                                  type="range"
                                  min={-120}
                                  max={120}
                                  step={1}
                                  value={degX}
                                  onChange={(e) => handleBoneAxisChange(0, Number(e.target.value))}
                                  className="accent-cyan-400"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5 text-slate-300">
                                <span>Twist Y: {degY}°</span>
                                <input
                                  type="range"
                                  min={-120}
                                  max={120}
                                  step={1}
                                  value={degY}
                                  onChange={(e) => handleBoneAxisChange(1, Number(e.target.value))}
                                  className="accent-cyan-400"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5 text-slate-300">
                                <span>Roll Z: {degZ}°</span>
                                <input
                                  type="range"
                                  min={-120}
                                  max={120}
                                  step={1}
                                  value={degZ}
                                  onChange={(e) => handleBoneAxisChange(2, Number(e.target.value))}
                                  className="accent-cyan-400"
                                />
                              </label>
                            </div>
                          );
                        })()}
                      </div>
                    )}

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
                          <span>Object Scale</span>
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
                                className={`py-1 rounded-md text-center border transition-all ${isActiveScale
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

                    {/* 5. Rig Utilities & Facing Angle (Humanoid) OR 3D Orientation Angles (Non-Human) */}
                    {isHumanoid ? (
                      <div className="space-y-2">
                        {/* Humanoid Body Facing / Yaw Orientation */}
                        <div className="inspector-subcard space-y-2 font-mono">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-sans font-semibold text-slate-200">
                              Facing Angle
                            </span>
                            <span className="text-[11px] font-bold text-indigo-300">
                              {Math.round(rot.y)}°
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            step={5}
                            value={Math.round(rot.y)}
                            aria-label="Humanoid Facing Yaw Angle"
                            onChange={(e) =>
                              onUpdateActor(actor.id, { rotation: { ...rot, x: 0, y: Number(e.target.value), z: 0 } })
                            }
                            className="studio-slider accent-indigo-400"
                          />
                          <div className="grid grid-cols-4 gap-1 text-[9.5px]">
                            {[
                              { label: 'Face Cam', val: 0 },
                              { label: '3/4 Left', val: -25 },
                              { label: 'Profile', val: 90 },
                              { label: 'OTS Back', val: 155 },
                            ].map((dir) => {
                              const isActiveDir = Math.abs((rot.y ?? 0) - dir.val) <= 5;
                              return (
                                <button
                                  key={dir.label}
                                  type="button"
                                  onClick={() =>
                                    onUpdateActor(actor.id, { rotation: { ...rot, x: 0, y: dir.val, z: 0 } })
                                  }
                                  className={`py-1 rounded-md text-center border transition-all ${isActiveDir
                                      ? 'bg-indigo-600/35 border-indigo-400/70 text-indigo-200 font-bold'
                                      : 'bg-[#0d111a] hover:bg-[#171e2e] border-white/[0.08] text-slate-300'
                                    }`}
                                >
                                  {dir.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

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
                              <span>Bone Socket</span>
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
                </div>
              )}
            </div>
          </div>
      )}

      {isMocapStudioOpen && (
        <MocapStudioModal
          isOpen={isMocapStudioOpen}
          actor={actor}
          shotDurationSeconds={shotDur}
          onClose={() => setIsMocapStudioOpen(false)}
          onApplyMocap={(payload: MocapStudioApplyPayload) => {
            applyMocapStudioPayloadToShotStore(payload, actor, onUpdateActor);
          }}
        />
      )}
        </div>
      );
};

