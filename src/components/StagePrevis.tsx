import React, { useState, useEffect, useRef } from 'react';
import { useShotStore } from '../stores/useShotStore';
import { Play, Pause, RotateCcw, Crosshair, Users, Sparkles } from 'lucide-react';

const FOV_MAP: Record<string, number> = {
  '18mm': 100,
  '24mm': 84,
  '35mm': 63,
  '50mm': 47,
  '85mm': 28,
  '135mm': 18,
};

export const StagePrevis: React.FC = () => {
  const { shot, setCameraPositions, updateActor } = useShotStore();
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeDrag, setActiveDrag] = useState<'camera-start' | 'camera-end' | string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const duration = shot.durationSeconds;
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  // Animation Loop for real-time 2D stage playback
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      lastTimeRef.current = null;
      return;
    }

    const tick = (now: number) => {
      if (lastTimeRef.current != null) {
        const deltaSec = (now - lastTimeRef.current) / 1000;
        setCurrentTime((prev) => {
          const next = prev + deltaSec;
          if (next >= duration) {
            return 0; // loop
          }
          return next;
        });
      }
      lastTimeRef.current = now;
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, duration]);

  // Compute live interpolated positions based on currentTime
  const camStart = shot.camera.movement.startPosition;
  const camEnd = shot.camera.movement.endPosition;

  // Linear easing interpolation for camera
  const currentCamX = camStart.x + (camEnd.x - camStart.x) * progressRatio;
  const currentCamY = camStart.y + (camEnd.y - camStart.y) * progressRatio;

  // Compute camera rotation angle toward look-at target
  const lookAt = shot.camera.movement.targetLookAt || { x: 50, y: 50 };
  const dx = lookAt.x - currentCamX;
  const dy = lookAt.y - currentCamY;
  const camAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  const fov = FOV_MAP[shot.camera.lens.focalLength] || 60;
  const coneLength = 32; // visually projecting cone into the stage

  // Calculate FOV cone polygon points in stage coordinates (0..100)
  const halfFovRad = ((fov / 2) * Math.PI) / 180;
  const centerAngleRad = (camAngleDeg * Math.PI) / 180;

  const leftAngleRad = centerAngleRad - halfFovRad;
  const rightAngleRad = centerAngleRad + halfFovRad;

  const coneLeftX = currentCamX + Math.cos(leftAngleRad) * coneLength;
  const coneLeftY = currentCamY + Math.sin(leftAngleRad) * coneLength;
  const coneRightX = currentCamX + Math.cos(rightAngleRad) * coneLength;
  const coneRightY = currentCamY + Math.sin(rightAngleRad) * coneLength;

  // Handle stage mouse drag
  const handlePointerDown = (item: 'camera-start' | 'camera-end' | string) => {
    setActiveDrag(item);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!activeDrag || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.min(95, Math.max(5, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(95, Math.max(5, ((e.clientY - rect.top) / rect.height) * 100));

    if (activeDrag === 'camera-start') {
      setCameraPositions({ ...camStart, x: Math.round(x), y: Math.round(y) }, camEnd);
    } else if (activeDrag === 'camera-end') {
      setCameraPositions(camStart, { ...camEnd, x: Math.round(x), y: Math.round(y) });
    } else if (activeDrag.startsWith('actor-')) {
      const actorId = activeDrag.replace('actor-', '');
      updateActor(actorId, {
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: Math.round(x), y: Math.round(y) },
          endPosition: { x: Math.round(x), y: Math.round(y) },
        },
      });
    }
  };

  const handlePointerUp = () => {
    setActiveDrag(null);
  };

  const currentFrame = Math.round(currentTime * shot.frameRate);
  const totalFrames = Math.round(duration * shot.frameRate);

  return (
    <div className="flex h-full w-full flex-col bg-director-dark select-none">
      {/* Stage Toolbar */}
      <div className="flex h-12 items-center justify-between border-b border-director-border px-4 glass-panel">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wider text-white">
            <Crosshair className="h-4 w-4 text-director-gold" />
            2D Film Stage Previsualization
          </div>
          <span className="rounded bg-director-panel px-2 py-0.5 font-mono text-[10px] text-director-cyan">
            DETERMINISTIC • ZERO GPU CREDITS
          </span>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-director-gold text-director-darkest transition-all hover:bg-director-amber active:scale-95"
            title={isPlaying ? 'Pause' : 'Play Previs'}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentTime(0);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md glass-control text-slate-300 hover:text-white"
            title="Reset to 0s"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <span className="text-director-gold font-bold">{currentTime.toFixed(2)}s</span>
            <span className="text-slate-500">/</span>
            <span>{duration.toFixed(1)}s</span>
            <span className="rounded bg-director-panel px-1.5 py-0.5 text-[10px] text-slate-400">
              F: {currentFrame} / {totalFrames}
            </span>
          </div>
        </div>
      </div>

      {/* SVG Stage Canvas */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6 stage-grid">
        <div className="relative aspect-video max-h-full max-w-full rounded-xl border border-director-border bg-director-darkest/90 shadow-glass-panel overflow-hidden">
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            className="h-full w-full cursor-crosshair"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <defs>
              {/* Dynamic Camera Frustum Gradient */}
              <linearGradient id="frustumGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.02" />
              </linearGradient>

              {/* Marker Arrow for Trajectory */}
              <marker
                id="trajArrow"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 8 5 L 0 9 z" fill="#06B6D4" />
              </marker>
            </defs>

            {/* Stage Safe Frame Guides */}
            <rect
              x="5"
              y="5"
              width="90"
              height="90"
              fill="none"
              stroke="#2A3044"
              strokeWidth="0.3"
              strokeDasharray="1,1"
            />
            {/* Center Stage Crosshairs */}
            <line x1="50" y1="46" x2="50" y2="54" stroke="#3B4460" strokeWidth="0.4" />
            <line x1="46" y1="50" x2="54" y2="50" stroke="#3B4460" strokeWidth="0.4" />
            <text x="52" y="49" fill="#4B5563" fontSize="2.2" fontFamily="monospace">
              STAGE CENTER
            </text>

            {/* Camera Trajectory Vector (Start to End) */}
            <line
              x1={camStart.x}
              y1={camStart.y}
              x2={camEnd.x}
              y2={camEnd.y}
              stroke="#06B6D4"
              strokeWidth="0.8"
              strokeDasharray="1.5,1.5"
              markerEnd="url(#trajArrow)"
            />

            {/* Camera FOV Frustum Cone (Projected from current animated camera position) */}
            <polygon
              points={`${currentCamX},${currentCamY} ${coneLeftX},${coneLeftY} ${coneRightX},${coneRightY}`}
              fill="url(#frustumGrad)"
              stroke="#F59E0B"
              strokeWidth="0.3"
              strokeDasharray="0.8,0.8"
            />

            {/* Look-At Focal Point */}
            <circle cx={lookAt.x} cy={lookAt.y} r="0.8" fill="#F59E0B" opacity="0.6" />

            {/* Actor Tokens and Trajectories */}
            {shot.actors.map((actor, idx) => {
              const start = actor.trajectory.startPosition;
              const end = actor.trajectory.endPosition;
              // Actor live position interpolation
              const actorX = start.x + (end.x - start.x) * progressRatio;
              const actorY = start.y + (end.y - start.y) * progressRatio;

              return (
                <g key={actor.id}>
                  {/* Actor trajectory path */}
                  {start.x !== end.x || start.y !== end.y ? (
                    <line
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      stroke="#10B981"
                      strokeWidth="0.6"
                      strokeDasharray="1,1"
                    />
                  ) : null}

                  {/* Actor Token Node */}
                  <g
                    className="cursor-move"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handlePointerDown(`actor-${actor.id}`);
                    }}
                  >
                    <circle
                      cx={actorX}
                      cy={actorY}
                      r="2.8"
                      fill="#10B981"
                      fillOpacity="0.25"
                      stroke="#10B981"
                      strokeWidth="0.8"
                    />
                    <circle cx={actorX} cy={actorY} r="1.2" fill="#10B981" />
                    <text
                      x={actorX}
                      y={actorY + 4.5}
                      textAnchor="middle"
                      fill="#A7F3D0"
                      fontSize="2.4"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      {actor.name || `Subject ${idx + 1}`}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Camera Start Drag Handle */}
            <g
              className="cursor-move"
              onPointerDown={(e) => {
                e.stopPropagation();
                handlePointerDown('camera-start');
              }}
            >
              <circle
                cx={camStart.x}
                cy={camStart.y}
                r="2.2"
                fill="#0E1017"
                stroke="#06B6D4"
                strokeWidth="0.7"
              />
              <text x={camStart.x} y={camStart.y + 0.8} textAnchor="middle" fill="#06B6D4" fontSize="2" fontWeight="bold">
                S
              </text>
            </g>

            {/* Camera End Drag Handle */}
            <g
              className="cursor-move"
              onPointerDown={(e) => {
                e.stopPropagation();
                handlePointerDown('camera-end');
              }}
            >
              <circle
                cx={camEnd.x}
                cy={camEnd.y}
                r="2.2"
                fill="#0E1017"
                stroke="#F59E0B"
                strokeWidth="0.7"
              />
              <text x={camEnd.x} y={camEnd.y + 0.8} textAnchor="middle" fill="#F59E0B" fontSize="2" fontWeight="bold">
                E
              </text>
            </g>

            {/* Current Active Camera Body with FOV directional indicator */}
            <g transform={`translate(${currentCamX}, ${currentCamY}) rotate(${camAngleDeg})`}>
              {/* Camera Body Box */}
              <rect x="-2.2" y="-1.6" width="4.4" height="3.2" rx="0.6" fill="#F59E0B" />
              {/* Lens Barrel */}
              <polygon points="2.2,-1 3.4,-1.4 3.4,1.4 2.2,1" fill="#FBBF24" />
            </g>
          </svg>

          {/* Interactive Stage Overlay Info */}
          <div className="absolute bottom-2 left-3 flex items-center gap-3 font-mono text-[10px] text-slate-400 bg-director-darkest/80 px-2.5 py-1 rounded-md border border-director-border/60">
            <span className="flex items-center gap-1 text-director-gold">
              <Sparkles className="h-3 w-3" />
              {shot.camera.lens.focalLength} ({fov}° FOV)
            </span>
            <span>•</span>
            <span className="text-director-cyan">{shot.camera.movement.type}</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <Users className="h-3 w-3" />
              {shot.actors.length} Subject(s)
            </span>
          </div>

          <div className="absolute top-2 right-3 font-mono text-[10px] text-slate-400 bg-director-darkest/80 px-2 py-0.5 rounded border border-director-border/60">
            DRAG GIZMOS: S (START) • E (END)
          </div>
        </div>
      </div>

      {/* Timeline Scrubber Bar */}
      <div className="flex h-10 items-center gap-4 border-t border-director-border px-6 glass-panel">
        <span className="font-mono text-[10px] text-slate-400">TIME SCRUBBER:</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={currentTime}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentTime(parseFloat(e.target.value));
          }}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-director-surface accent-director-gold"
        />
        <span className="font-mono text-xs text-white font-bold">{Math.round(progressRatio * 100)}%</span>
      </div>
    </div>
  );
};
