import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useShotStore, getEffectiveStageLights } from '../../stores/useShotStore';
import { FocalLength } from '../../types/shotspec';
import {
  interpolateTrajectoryPosition,
  interpolateObjectRotationAtTime,
} from '../../engine/trajectoryMath';
import { ChevronDown, ChevronRight, Sun, Moon, RotateCcw, Plus, Trash2 } from 'lucide-react';

const FOV_MAP: Record<FocalLength, number> = {
  '18mm': 100,
  '24mm': 84,
  '35mm': 63,
  '50mm': 47,
  '85mm': 28,
  '135mm': 18,
};

const QUICK_COLOR_SWATCHES = [
  '#0284c7', // Sky Cyan
  '#eab308', // Warm Gold
  '#f43f5e', // Rose Crimson
  '#10b981', // Emerald
  '#a855f7', // Neon Purple
  '#f97316', // Sunset Orange
  '#ffffff', // Pure White
];

function hexToRgba(hex: string, alpha: number): string {
  const clean = (hex || '#0284c7').replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return `rgba(2, 132, 199, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface StageTopViewRadarProps {
  currentTime: number;
  duration: number;
  onSelectCamera?: () => void;
}

type DragTarget =
  | { kind: 'actor'; actorId: string; offsetX: number; offsetY: number }
  | { kind: 'actor-rotate'; actorId: string }
  | { kind: 'camera'; offsetX: number; offsetY: number }
  | { kind: 'camera-end'; offsetX: number; offsetY: number }
  | { kind: 'lookAt'; offsetX: number; offsetY: number }
  | { kind: 'light'; lightId: string; offsetX: number; offsetY: number };

type SelectedRadarEntity =
  | { kind: 'camera' }
  | { kind: 'light'; lightId: string }
  | { kind: 'actor'; actorId: string };

export const StageTopViewRadar: React.FC<StageTopViewRadarProps> = ({
  currentTime,
  duration,
}) => {
  const {
    shot,
    selectedActorId,
    setSelectedActorId,
    updateActor,
    setCameraColor,
    addStageLight,
    updateStageLight,
    removeStageLight,
    setActiveDeckTab,
    beginGesture,
    endGesture,
  } = useShotStore();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLightTheme, setIsLightTheme] = useState(true);
  const [size, setSize] = useState<number>(232);
  const [zoom, setZoom] = useState<number>(1.0);
  const [selectedEntity, setSelectedEntity] = useState<SelectedRadarEntity>({ kind: 'camera' });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const activeDragRef = useRef<DragTarget | null>(null);
  const resizeStartRef = useRef<{ startX: number; startY: number; startSize: number } | null>(null);

  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const safeDur = duration || shot.durationSeconds || 4.0;
  const safeDurRef = useRef(safeDur);
  safeDurRef.current = safeDur;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Sync external selection into radar entity bar
  useEffect(() => {
    if (selectedActorId === '__camera__') {
      setSelectedEntity({ kind: 'camera' });
    } else if (selectedActorId && shot.actors.some((a) => a.id === selectedActorId)) {
      setSelectedEntity({ kind: 'actor', actorId: selectedActorId });
    }
  }, [selectedActorId, shot.actors]);

  // Convert stage coordinate (0..100) to SVG viewBox coordinate (0..100) with zoom centered at (50, 50)
  const stageToView = (pt: { x: number; y: number }) => {
    return {
      x: 50 + (pt.x - 50) * zoom,
      y: 50 + (pt.y - 50) * zoom,
    };
  };

  // Convert client pointer (px) inside SVG to stage coordinate (0..100)
  const clientToStage = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 50, y: 50 };
    const rect = svg.getBoundingClientRect();
    const z = zoomRef.current || 1.0;
    const vx = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const vy = ((clientY - rect.top) / Math.max(1, rect.height)) * 100;
    const sx = 50 + (vx - 50) / z;
    const sy = 50 + (vy - 50) / z;
    return {
      x: Number(Math.min(98, Math.max(2, sx)).toFixed(2)),
      y: Number(Math.min(98, Math.max(2, sy)).toFixed(2)),
    };
  };

  // Window-level pointer move & up listeners so dragging NEVER drops or resets if pointer leaves the SVG!
  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag) return;

      const rawPt = clientToStage(e.clientX, e.clientY);
      const liveState = useShotStore.getState();
      const liveShot = liveState.shot;
      const t = currentTimeRef.current;
      const dur = safeDurRef.current;
      const moveMode = liveState.stagingMoveMode;

      if (drag.kind === 'actor') {
        const nextX = Number(Math.min(98, Math.max(2, rawPt.x + drag.offsetX)).toFixed(2));
        const nextY = Number(Math.min(98, Math.max(2, rawPt.y + drag.offsetY)).toFixed(2));
        const act = liveShot.actors.find((a) => a.id === drag.actorId);
        const curZ = act
          ? interpolateTrajectoryPosition(act.trajectory, t, dur).z ??
            act.trajectory.startPosition.z ??
            0
          : 0;
        liveState.updateActorPositionAtTime(
          drag.actorId,
          t,
          { x: nextX, y: nextY, z: curZ },
          dur,
          moveMode
        );
      } else if (drag.kind === 'actor-rotate') {
        const act = liveShot.actors.find((a) => a.id === drag.actorId);
        if (act) {
          const actPos = interpolateTrajectoryPosition(act.trajectory, t, dur);
          const dx = rawPt.x - actPos.x;
          const dz = rawPt.y - actPos.y;
          if (Math.hypot(dx, dz) > 0.5) {
            const yawRad = Math.atan2(dx, dz);
            const yawDeg = Number(((yawRad * 180) / Math.PI).toFixed(1));
            const curRot = interpolateObjectRotationAtTime(act.trajectory, act.rotation, t, dur);
            liveState.updateActorRotationAtTime(
              drag.actorId,
              t,
              {
                x: curRot.x,
                y: yawDeg,
                z: curRot.z,
              },
              dur
            );
          }
        }
      } else if (drag.kind === 'camera') {
        const nextX = Number(Math.min(98, Math.max(2, rawPt.x + drag.offsetX)).toFixed(2));
        const nextY = Number(Math.min(98, Math.max(2, rawPt.y + drag.offsetY)).toFixed(2));
        const curCamPos = interpolateTrajectoryPosition(liveShot.camera.movement, t, dur);
        const curZ = curCamPos.z ?? liveShot.camera.movement.startPosition.z ?? 20;
        // If camera was in a locked orbital preset and user drags it at t > 0, switch to dolly/free path so it follows cursor
        if (
          t > 0.05 &&
          (liveShot.camera.movement.type === 'orbit-clockwise' ||
            liveShot.camera.movement.type === 'orbit-counter-clockwise')
        ) {
          liveState.setCameraMovement('dolly-in', liveShot.camera.movement.speed);
        }
        liveState.updateCameraPositionAtTime(
          t,
          { x: nextX, y: nextY, z: curZ },
          dur,
          moveMode
        );
      } else if (drag.kind === 'camera-end') {
        const nextX = Number(Math.min(98, Math.max(2, rawPt.x + drag.offsetX)).toFixed(2));
        const nextY = Number(Math.min(98, Math.max(2, rawPt.y + drag.offsetY)).toFixed(2));
        const curEndZ = liveShot.camera.movement.endPosition.z ?? liveShot.camera.movement.startPosition.z ?? 20;
        liveState.setCameraPositions(liveShot.camera.movement.startPosition, {
          x: nextX,
          y: nextY,
          z: curEndZ,
        });
      } else if (drag.kind === 'lookAt') {
        const nextX = Number(Math.min(98, Math.max(2, rawPt.x + drag.offsetX)).toFixed(2));
        const nextY = Number(Math.min(98, Math.max(2, rawPt.y + drag.offsetY)).toFixed(2));
        liveState.setCameraTargetLookAt({ x: nextX, y: nextY });
      } else if (drag.kind === 'light') {
        const nextX = Number(Math.min(98, Math.max(2, rawPt.x + drag.offsetX)).toFixed(2));
        const nextY = Number(Math.min(98, Math.max(2, rawPt.y + drag.offsetY)).toFixed(2));
        const lights = getEffectiveStageLights(liveShot.lighting);
        const targetLight = lights.find((l) => l.id === drag.lightId);
        const curZ = targetLight?.position.z ?? 50;
        liveState.updateStageLight(drag.lightId, {
          position: { x: nextX, y: nextY, z: curZ },
        });
      }
    };

    const handleWindowPointerUp = () => {
      if (activeDragRef.current) {
        activeDragRef.current = null;
        endGesture();
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [endGesture]);

  // Live Camera & Look-At Positions in 0..100 Stage Space
  const camStagePos = useMemo(
    () => interpolateTrajectoryPosition(shot.camera.movement, currentTime, safeDur),
    [shot.camera.movement, currentTime, safeDur]
  );

  const camColor = shot.camera.color || '#0284c7';
  const lookAtStagePos = shot.camera.movement.targetLookAt ?? { x: 50, y: 50 };
  const camView = stageToView(camStagePos);
  const lookAtView = stageToView(lookAtStagePos);
  const camStartView = stageToView(shot.camera.movement.startPosition);
  const camEndView = stageToView(shot.camera.movement.endPosition);
  const hasCameraPath =
    Math.hypot(
      shot.camera.movement.startPosition.x - shot.camera.movement.endPosition.x,
      shot.camera.movement.startPosition.y - shot.camera.movement.endPosition.y
    ) > 1.5;

  // Compute Camera FOV Cone Polygon in View Coordinates
  const fovConePoints = useMemo(() => {
    const fovDeg = FOV_MAP[shot.camera.lens.focalLength] || 63;
    const halfRad = ((fovDeg * 0.5) * Math.PI) / 180;
    const dx = lookAtView.x - camView.x;
    const dy = lookAtView.y - camView.y;
    const dist = Math.hypot(dx, dy);
    const baseAngle = dist > 0.5 ? Math.atan2(dy, dx) : -Math.PI / 2;
    const coneLength = Math.max(24 * zoom, Math.min(48 * zoom, dist > 2 ? dist * 1.05 : 32 * zoom));

    const leftX = camView.x + Math.cos(baseAngle - halfRad) * coneLength;
    const leftY = camView.y + Math.sin(baseAngle - halfRad) * coneLength;
    const rightX = camView.x + Math.cos(baseAngle + halfRad) * coneLength;
    const rightY = camView.y + Math.sin(baseAngle + halfRad) * coneLength;

    return {
      polygon: `${camView.x.toFixed(2)},${camView.y.toFixed(2)} ${leftX.toFixed(2)},${leftY.toFixed(2)} ${rightX.toFixed(2)},${rightY.toFixed(2)}`,
      baseAngleDeg: (baseAngle * 180) / Math.PI,
    };
  }, [camView.x, camView.y, lookAtView.x, lookAtView.y, shot.camera.lens.focalLength, zoom]);

  // Effective Stage Lights (1 or more freely-positioned lights)
  const stageLights = useMemo(() => getEffectiveStageLights(shot.lighting), [shot.lighting]);

  // Pointer Down Helper with exact grab-offset calculation
  const startEntityDrag = (
    e: React.PointerEvent,
    target:
      | { kind: 'actor'; actorId: string; currentStagePos: { x: number; y: number } }
      | { kind: 'actor-rotate'; actorId: string }
      | { kind: 'camera'; currentStagePos: { x: number; y: number } }
      | { kind: 'camera-end'; currentStagePos: { x: number; y: number } }
      | { kind: 'lookAt'; currentStagePos: { x: number; y: number } }
      | { kind: 'light'; lightId: string; currentStagePos: { x: number; y: number } }
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const pointerStage = clientToStage(e.clientX, e.clientY);
    beginGesture();

    if (target.kind === 'actor') {
      activeDragRef.current = {
        kind: 'actor',
        actorId: target.actorId,
        offsetX: target.currentStagePos.x - pointerStage.x,
        offsetY: target.currentStagePos.y - pointerStage.y,
      };
      setSelectedActorId(target.actorId);
      setSelectedEntity({ kind: 'actor', actorId: target.actorId });
    } else if (target.kind === 'actor-rotate') {
      activeDragRef.current = {
        kind: 'actor-rotate',
        actorId: target.actorId,
      };
      setSelectedActorId(target.actorId);
      setSelectedEntity({ kind: 'actor', actorId: target.actorId });
    } else if (target.kind === 'camera') {
      activeDragRef.current = {
        kind: 'camera',
        offsetX: target.currentStagePos.x - pointerStage.x,
        offsetY: target.currentStagePos.y - pointerStage.y,
      };
      setSelectedActorId('__camera__');
      setSelectedEntity({ kind: 'camera' });
    } else if (target.kind === 'camera-end') {
      activeDragRef.current = {
        kind: 'camera-end',
        offsetX: target.currentStagePos.x - pointerStage.x,
        offsetY: target.currentStagePos.y - pointerStage.y,
      };
      setSelectedActorId('__camera__');
      setSelectedEntity({ kind: 'camera' });
    } else if (target.kind === 'lookAt') {
      activeDragRef.current = {
        kind: 'lookAt',
        offsetX: target.currentStagePos.x - pointerStage.x,
        offsetY: target.currentStagePos.y - pointerStage.y,
      };
      setSelectedActorId('__camera__');
      setSelectedEntity({ kind: 'camera' });
    } else if (target.kind === 'light') {
      activeDragRef.current = {
        kind: 'light',
        lightId: target.lightId,
        offsetX: target.currentStagePos.x - pointerStage.x,
        offsetY: target.currentStagePos.y - pointerStage.y,
      };
      setSelectedEntity({ kind: 'light', lightId: target.lightId });
      setActiveDeckTab('atmosphere');
    }
  };

  // Resize Handle Pointer Events
  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startSize: size,
    };
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current) return;
    e.stopPropagation();
    const delta = Math.max(
      e.clientX - resizeStartRef.current.startX,
      e.clientY - resizeStartRef.current.startY
    );
    const nextSize = Math.min(360, Math.max(176, resizeStartRef.current.startSize + delta));
    setSize(nextSize);
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (resizeStartRef.current) {
      e.stopPropagation();
      resizeStartRef.current = null;
    }
  };

  // Resolve active entity for the bottom quick color/intensity bar
  const activeBarData = useMemo(() => {
    if (selectedEntity.kind === 'light') {
      const lgt = stageLights.find((l) => l.id === selectedEntity.lightId) || stageLights[0];
      if (lgt) {
        return {
          kind: 'light' as const,
          id: lgt.id,
          label: lgt.name,
          color: lgt.color || '#eab308',
          intensity: lgt.intensity ?? 2.2,
          canDelete: stageLights.length > 1,
          onChangeColor: (c: string) => updateStageLight(lgt.id, { color: c }),
        };
      }
    }
    if (selectedEntity.kind === 'actor') {
      const act = shot.actors.find((a) => a.id === selectedEntity.actorId);
      if (act) {
        return {
          kind: 'actor' as const,
          id: act.id,
          label: act.name.slice(0, 12),
          color: act.color || '#3b82f6',
          onChangeColor: (c: string) => updateActor(act.id, { color: c }),
        };
      }
    }
    return {
      kind: 'camera' as const,
      id: '__camera__',
      label: `CAM (${shot.camera.lens.focalLength})`,
      color: camColor,
      onChangeColor: (c: string) => setCameraColor(c),
    };
  }, [selectedEntity, stageLights, shot.actors, shot.camera.lens.focalLength, camColor, updateStageLight, updateActor, setCameraColor]);

  if (isCollapsed) {
    return (
      <div
        data-hud="true"
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-3 left-3 z-20 select-none"
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] font-bold shadow-xl border transition-all cursor-pointer ${
            isLightTheme
              ? 'bg-[#f8f6f0]/95 text-slate-800 border-slate-400/80 hover:bg-white'
              : 'bg-[#0f131d]/95 text-slate-100 border-white/20 hover:border-director-gold/60'
          }`}
          title="Expand 2D Orthographic Top-View Stage Radar"
        >
          <ChevronRight className="h-3 w-3" />
          <span>TOP-VIEW</span>
        </button>
      </div>
    );
  }

  return (
    <div
      data-hud="true"
      onPointerDown={(e) => e.stopPropagation()}
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`absolute bottom-3 left-3 z-20 rounded-2xl shadow-2xl border overflow-hidden select-none transition-colors ${
        isLightTheme
          ? 'bg-[#e9eaec]/95 border-slate-400/90 text-slate-800'
          : 'bg-[#0d111a]/95 border-white/20 text-slate-200'
      }`}
    >
      {/* Floating Header Controls (Collapsible Pill + Add Light + Theme & Zoom Controls) */}
      <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between pointer-events-none">
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className={`pointer-events-auto flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] font-extrabold tracking-wide shadow-sm border transition-all cursor-pointer ${
            isLightTheme
              ? 'bg-[#fbfaf5] text-slate-800 border-slate-300 hover:bg-white'
              : 'bg-[#171c29] text-white border-white/15 hover:border-white/35'
          }`}
          title="Collapse Top-View Floorplan"
        >
          <ChevronDown className="h-3 w-3" />
          <span>TOP-VIEW</span>
        </button>

        <div className="pointer-events-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              addStageLight();
              setActiveDeckTab('atmosphere');
            }}
            className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold border shadow-sm transition-colors cursor-pointer ${
              isLightTheme
                ? 'bg-amber-100/95 text-amber-900 border-amber-400 hover:bg-amber-200'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
            }`}
            title="Add another Stage Light (Key / Fill / Rim / Practical)"
          >
            <Plus className="h-2.5 w-2.5" />
            <span>LGT</span>
          </button>

          {zoom !== 1.0 && (
            <button
              type="button"
              onClick={() => setZoom(1.0)}
              className={`rounded-md p-1 font-mono text-[9px] border shadow-sm transition-colors cursor-pointer ${
                isLightTheme
                  ? 'bg-[#fbfaf5]/90 text-slate-700 border-slate-300 hover:bg-white'
                  : 'bg-[#171c29]/90 text-slate-300 border-white/15 hover:text-white'
              }`}
              title="Reset Top-View Zoom (1:1)"
            >
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsLightTheme(!isLightTheme)}
            className={`rounded-md p-1 border shadow-sm transition-colors cursor-pointer ${
              isLightTheme
                ? 'bg-[#fbfaf5]/90 text-slate-700 border-slate-300 hover:bg-white'
                : 'bg-[#171c29]/90 text-amber-300 border-white/15 hover:text-white'
            }`}
            title={isLightTheme ? 'Switch to Dark Studio Blueprint' : 'Switch to Light Architectural Grid'}
          >
            {isLightTheme ? <Moon className="h-2.5 w-2.5" /> : <Sun className="h-2.5 w-2.5" />}
          </button>
        </div>
      </div>

      {/* 2D Orthographic Interactive Floorplan SVG */}
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        onWheel={(e) => {
          e.stopPropagation();
          const factor = e.deltaY < 0 ? 1.12 : 0.9;
          setZoom((z) => Number(Math.min(2.5, Math.max(0.6, z * factor)).toFixed(2)));
        }}
        className="w-full h-full touch-none cursor-crosshair"
      >
        <defs>
          <pattern
            id="topview-minor-grid"
            width={5 * zoom}
            height={5 * zoom}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${5 * zoom} 0 L 0 0 0 ${5 * zoom}`}
              fill="none"
              stroke={isLightTheme ? 'rgba(15, 23, 42, 0.07)' : 'rgba(255, 255, 255, 0.05)'}
              strokeWidth="0.3"
            />
          </pattern>
          <pattern
            id="topview-major-grid"
            width={15 * zoom}
            height={15 * zoom}
            patternUnits="userSpaceOnUse"
          >
            <rect width={15 * zoom} height={15 * zoom} fill="url(#topview-minor-grid)" />
            <path
              d={`M ${15 * zoom} 0 L 0 0 0 ${15 * zoom}`}
              fill="none"
              stroke={isLightTheme ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.11)'}
              strokeWidth="0.45"
            />
          </pattern>
        </defs>

        {/* Background Grid */}
        <rect width="100" height="100" fill="url(#topview-major-grid)" />

        {/* Center Stage Axes (X=50, Z=50) */}
        <line
          x1="0"
          y1="50"
          x2="100"
          y2="50"
          stroke={isLightTheme ? 'rgba(15, 23, 42, 0.22)' : 'rgba(255, 255, 255, 0.18)'}
          strokeWidth="0.6"
        />
        <line
          x1="50"
          y1="0"
          x2="50"
          y2="100"
          stroke={isLightTheme ? 'rgba(15, 23, 42, 0.22)' : 'rgba(255, 255, 255, 0.18)'}
          strokeWidth="0.6"
        />

        {/* All Stage Lights (Rays & Freely Draggable Light Sources) */}
        {stageLights.map((lgt, idx) => {
          if (lgt.enabled === false) return null;
          const lView = stageToView(lgt.position);
          const isLightSelected =
            selectedEntity.kind === 'light' && selectedEntity.lightId === lgt.id;
          const lColor = lgt.color || '#eab308';
          const shortLabel = stageLights.length === 1 ? 'LGT' : `LGT${idx + 1}`;

          return (
            <g key={lgt.id}>
              <line
                x1={lView.x}
                y1={lView.y}
                x2="50"
                y2="50"
                stroke={hexToRgba(lColor, isLightTheme ? 0.55 : 0.45)}
                strokeWidth={isLightSelected ? '0.75' : '0.5'}
                strokeDasharray="1.5 1.5"
              />
              <g
                transform={`translate(${lView.x}, ${lView.y})`}
                onPointerDown={(e) =>
                  startEntityDrag(e, {
                    kind: 'light',
                    lightId: lgt.id,
                    currentStagePos: lgt.position,
                  })
                }
                className="cursor-grab active:cursor-grabbing"
              >
                <title>{`${lgt.name} — Drag freely to position light, use bottom bar to change color/intensity`}</title>
                <circle r="5.5" fill="transparent" />
                {isLightSelected && (
                  <circle
                    r="4.0"
                    fill="none"
                    stroke={lColor}
                    strokeWidth="0.85"
                    strokeDasharray="1.2 0.8"
                  />
                )}
                <circle
                  r="2.3"
                  fill={lColor}
                  stroke={isLightTheme ? '#1e293b' : '#ffffff'}
                  strokeWidth="0.5"
                />
                <text
                  y="-3.3"
                  textAnchor="middle"
                  fontSize="3.2"
                  fontWeight="800"
                  fontFamily="monospace"
                  fill={isLightTheme ? '#334155' : '#f8fafc'}
                >
                  {shortLabel}
                </text>
              </g>
            </g>
          );
        })}

        {/* Camera Trajectory Path (Start -> End) + Draggable End Waypoint if moving */}
        {hasCameraPath && (
          <g>
            <line
              x1={camStartView.x}
              y1={camStartView.y}
              x2={camEndView.x}
              y2={camEndView.y}
              stroke={camColor}
              strokeWidth="0.6"
              strokeDasharray="1.5 1.2"
              opacity="0.7"
            />
            <g
              transform={`translate(${camEndView.x}, ${camEndView.y})`}
              onPointerDown={(e) =>
                startEntityDrag(e, {
                  kind: 'camera-end',
                  currentStagePos: shot.camera.movement.endPosition,
                })
              }
              className="cursor-grab active:cursor-grabbing"
            >
              <title>Camera End Position — Drag to change camera destination</title>
              <circle r="4.5" fill="transparent" />
              <circle
                r="1.5"
                fill={hexToRgba(camColor, 0.35)}
                stroke={camColor}
                strokeWidth="0.55"
              />
            </g>
          </g>
        )}

        {/* Camera FOV Frustum Cone (Tinted with custom Camera Color) */}
        <polygon
          points={fovConePoints.polygon}
          fill={hexToRgba(camColor, isLightTheme ? 0.28 : 0.22)}
          stroke={hexToRgba(camColor, 0.6)}
          strokeWidth="0.45"
          className="pointer-events-none"
        />

        {/* Draggable Camera Look-At Target Point */}
        <g
          transform={`translate(${lookAtView.x}, ${lookAtView.y})`}
          onPointerDown={(e) =>
            startEntityDrag(e, {
              kind: 'lookAt',
              currentStagePos: lookAtStagePos,
            })
          }
          className="cursor-grab active:cursor-grabbing"
        >
          <title>Camera Look-At Target — Drag to pan / aim camera</title>
          <circle r="5" fill="transparent" />
          <circle
            r="1.4"
            fill="none"
            stroke={camColor}
            strokeWidth="0.55"
            strokeDasharray="0.8 0.8"
          />
          <circle r="0.65" fill={camColor} />
        </g>

        {/* Actors & Props on Stage */}
        {shot.actors.map((actor, idx) => {
          const isSelected =
            actor.id === selectedActorId ||
            (selectedEntity.kind === 'actor' && selectedEntity.actorId === actor.id);
          const pos = interpolateTrajectoryPosition(actor.trajectory, currentTime, safeDur);
          const vPos = stageToView(pos);
          const startV = stageToView(actor.trajectory.startPosition);
          const endV = stageToView(actor.trajectory.endPosition);
          const isHuman = !actor.kind || actor.kind === 'human';
          const actColor = actor.color || (isSelected ? '#2563eb' : isLightTheme ? '#64748b' : '#94a3b8');

          // Compute actor facing angle in top-down view (0 deg = +Z / downward in SVG)
          const hasExplicitRot =
            actor.rotation !== undefined ||
            (actor.trajectory.keyframes &&
              actor.trajectory.keyframes.some((k) => k.rotation !== undefined));
          let facingRad = 0;
          if (hasExplicitRot) {
            const rot = interpolateObjectRotationAtTime(
              actor.trajectory,
              actor.rotation,
              currentTime,
              safeDur
            );
            facingRad = (rot.y * Math.PI) / 180;
          } else {
            const dx = actor.trajectory.endPosition.x - actor.trajectory.startPosition.x;
            const dz = actor.trajectory.endPosition.y - actor.trajectory.startPosition.y;
            if (Math.hypot(dx, dz) > 1.0) {
              facingRad = Math.atan2(dx, dz);
            } else if (isHuman && shot.actors.length === 2) {
              const other = shot.actors[1 - idx];
              if (other) {
                const oPos = interpolateTrajectoryPosition(other.trajectory, currentTime, safeDur);
                facingRad = Math.atan2(oPos.x - pos.x, oPos.y - pos.y);
              }
            }
          }

          const arrowLen = isHuman ? 5.2 : 4.2;
          const tipX = Math.sin(facingRad) * arrowLen;
          const tipY = Math.cos(facingRad) * arrowLen;

          return (
            <g key={actor.id}>
              {/* Actor Movement Trajectory Line */}
              {Math.hypot(startV.x - endV.x, startV.y - endV.y) > 1 && (
                <line
                  x1={startV.x}
                  y1={startV.y}
                  x2={endV.x}
                  y2={endV.y}
                  stroke={actColor}
                  strokeWidth="0.55"
                  strokeDasharray="1.4 1.2"
                  opacity="0.75"
                />
              )}

              <g
                transform={`translate(${vPos.x}, ${vPos.y})`}
                onPointerDown={(e) =>
                  startEntityDrag(e, {
                    kind: 'actor',
                    actorId: actor.id,
                    currentStagePos: pos,
                  })
                }
                className="cursor-grab active:cursor-grabbing"
              >
                <title>{`${actor.name} (${actor.kind || 'human'}) — Drag to move on stage`}</title>
                <circle r="6" fill="transparent" />

                {/* Selection Ring */}
                {isSelected && (
                  <circle
                    r="4.6"
                    fill="none"
                    stroke={actor.color || '#1d4ed8'}
                    strokeWidth="0.9"
                  />
                )}

                {isHuman ? (
                  <>
                    <ellipse
                      cx="0"
                      cy="0"
                      rx="2.8"
                      ry="1.7"
                      transform={`rotate(${(-facingRad * 180) / Math.PI})`}
                      fill={
                        actor.color
                          ? hexToRgba(actor.color, 0.55)
                          : isSelected
                          ? '#3b82f6'
                          : isLightTheme
                          ? '#cbd5e1'
                          : '#475569'
                      }
                      stroke={actor.color || (isSelected ? '#1d4ed8' : '#475569')}
                      strokeWidth="0.5"
                    />
                    <circle
                      r="1.5"
                      fill={actor.color || (isSelected ? '#1d4ed8' : isLightTheme ? '#64748b' : '#e2e8f0')}
                    />
                  </>
                ) : (
                  <>
                    <rect
                      x="-3.6"
                      y="-3.6"
                      width="5.2"
                      height="5.2"
                      fill={isLightTheme ? 'rgba(15, 23, 42, 0.12)' : 'rgba(0, 0, 0, 0.35)'}
                    />
                    <rect
                      x="-2.6"
                      y="-2.6"
                      width="5.2"
                      height="5.2"
                      fill={
                        actor.color
                          ? hexToRgba(actor.color, 0.45)
                          : isLightTheme
                          ? '#e2e8f0'
                          : '#334155'
                      }
                      stroke={actor.color || (isSelected ? '#2563eb' : '#94a3b8')}
                      strokeWidth={isSelected ? '0.8' : '0.5'}
                    />
                  </>
                )}

                {/* Facing Direction Arrow + Interactive Rotation Handle at Tip */}
                <line
                  x1="0"
                  y1="0"
                  x2={tipX}
                  y2={tipY}
                  stroke={actor.color || (isSelected ? '#1d4ed8' : '#64748b')}
                  strokeWidth="0.65"
                />
                <circle
                  cx={tipX}
                  cy={tipY}
                  r="1.4"
                  fill={actor.color || (isSelected ? '#1d4ed8' : '#64748b')}
                  onPointerDown={(e) =>
                    startEntityDrag(e, { kind: 'actor-rotate', actorId: actor.id })
                  }
                  className="cursor-alias"
                >
                  <title>Drag arrow tip to rotate {actor.name}</title>
                </circle>

                {/* Actor Label */}
                <text
                  y={isHuman ? -5.3 : -4.2}
                  textAnchor="middle"
                  fontSize="3.1"
                  fontWeight="700"
                  fontFamily="monospace"
                  fill={
                    isSelected
                      ? isLightTheme
                        ? '#1e3a8a'
                        : '#60a5fa'
                      : isLightTheme
                      ? '#475569'
                      : '#cbd5e1'
                  }
                >
                  {actor.name.slice(0, 10)}
                </text>
              </g>
            </g>
          );
        })}

        {/* Draggable Camera Icon (CAM) */}
        <g
          transform={`translate(${camView.x}, ${camView.y})`}
          onPointerDown={(e) =>
            startEntityDrag(e, {
              kind: 'camera',
              currentStagePos: camStagePos,
            })
          }
          className="cursor-grab active:cursor-grabbing"
        >
          <title>Camera Rig ({shot.camera.lens.focalLength}) — Drag freely to position camera on stage</title>
          <circle r="6.5" fill="transparent" />
          {(selectedActorId === '__camera__' || selectedEntity.kind === 'camera') && (
            <circle r="4.5" fill="none" stroke={camColor} strokeWidth="0.85" />
          )}
          {/* Camera Tail / Direction Indicator */}
          <line
            x1="0"
            y1="0"
            x2={-Math.cos((fovConePoints.baseAngleDeg * Math.PI) / 180) * 4.5}
            y2={-Math.sin((fovConePoints.baseAngleDeg * Math.PI) / 180) * 4.5}
            stroke={camColor}
            strokeWidth="0.65"
          />
          <circle
            r="2.3"
            fill={camColor}
            stroke={isLightTheme ? '#082f49' : '#ffffff'}
            strokeWidth="0.5"
          />
          <text
            y="-3.5"
            textAnchor="middle"
            fontSize="3.4"
            fontWeight="800"
            fontFamily="monospace"
            fill={isLightTheme ? '#0f172a' : '#f8fafc'}
          >
            CAM
          </text>
        </g>
      </svg>

      {/* Bottom Quick-Control Strip: Color Swatches, Native Color Picker, & Light Intensity/Delete */}
      <div
        className={`absolute bottom-1.5 left-2 right-6 z-10 flex items-center justify-between gap-1 rounded-lg px-2 py-1 border font-mono text-[9px] shadow-md ${
          isLightTheme
            ? 'bg-[#fbfaf5]/95 border-slate-300 text-slate-800'
            : 'bg-[#141926]/95 border-white/15 text-slate-200'
        }`}
      >
        <span className="font-bold truncate max-w-[64px]" title={activeBarData.label}>
          {activeBarData.label}
        </span>

        <div className="flex items-center gap-1">
          {QUICK_COLOR_SWATCHES.slice(0, activeBarData.kind === 'light' ? 5 : 6).map((sw) => (
            <button
              key={sw}
              type="button"
              onClick={() => activeBarData.onChangeColor(sw)}
              style={{ backgroundColor: sw }}
              className={`w-2.5 h-2.5 rounded-full border transition-transform hover:scale-125 cursor-pointer ${
                activeBarData.color.toLowerCase() === sw.toLowerCase()
                  ? 'ring-2 ring-blue-500 border-white scale-110'
                  : 'border-black/30'
              }`}
              title={`Set ${activeBarData.label} color`}
            />
          ))}
          <input
            type="color"
            value={activeBarData.color.startsWith('#') ? activeBarData.color : '#0284c7'}
            onChange={(e) => activeBarData.onChangeColor(e.target.value)}
            className="w-3.5 h-3.5 rounded border-0 bg-transparent p-0 cursor-pointer"
            title={`Custom color picker for ${activeBarData.label}`}
          />
        </div>

        {activeBarData.kind === 'light' && (
          <div className="flex items-center gap-1">
            <input
              type="range"
              min={0.2}
              max={6}
              step={0.2}
              value={activeBarData.intensity}
              onChange={(e) =>
                updateStageLight(activeBarData.id, { intensity: Number(e.target.value) })
              }
              className="w-10 h-1 bg-slate-400/50 rounded appearance-none cursor-pointer accent-amber-500"
              title={`Light Intensity: ${activeBarData.intensity.toFixed(1)}×`}
            />
            {activeBarData.canDelete && (
              <button
                type="button"
                onClick={() => {
                  removeStageLight(activeBarData.id);
                  setSelectedEntity({ kind: 'camera' });
                }}
                className="text-rose-500 hover:text-rose-400 p-0.5 cursor-pointer"
                title="Remove this light"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom-Right Corner Resize Handle */}
      <div
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        title="Drag to resize Top-View Floorplan"
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5 opacity-80 hover:opacity-100 z-20"
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5">
          <path
            d="M 16 4 L 16 16 L 4 16 Z"
            fill={isLightTheme ? '#64748b' : '#94a3b8'}
          />
          <path
            d="M 13 8 L 13 13 L 8 13"
            fill="none"
            stroke={isLightTheme ? '#ffffff' : '#0f172a'}
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </div>
  );
};
