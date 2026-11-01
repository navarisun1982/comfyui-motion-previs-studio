import React from 'react';
import * as THREE from 'three';
import { ShotSpec } from '../../types/shotspec';

export interface StageViewfinderOverlaysProps {
  vfxReference?: ShotSpec['vfxReference'];
  actors: ShotSpec['actors'];
  showRuleOfThirds: boolean;
}

/**
 * Creates 3D Camera Frustum Wireframe Geometry pointing forward along +Z
 */
export function updateFrustumGeometry(
  fovDeg: number,
  aspect: number,
  distance: number = 24,
  focusDistance?: number
): THREE.BufferGeometry {
  if (distance <= 0.1) {
    const emptyGeo = new THREE.BufferGeometry();
    emptyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    return emptyGeo;
  }
  const fovRad = (fovDeg * Math.PI) / 180;
  const hHalf = Math.tan(fovRad / 2) * distance;
  const wHalf = hHalf * aspect;

  const baseVerts: number[] = [
    // Apex to 4 corners (forward along +Z)
    0, 0, 0,  -wHalf,  hHalf, distance,
    0, 0, 0,   wHalf,  hHalf, distance,
    0, 0, 0,   wHalf, -hHalf, distance,
    0, 0, 0,  -wHalf, -hHalf, distance,
    // Perimeter rectangle
    -wHalf,  hHalf, distance,   wHalf,  hHalf, distance,
     wHalf,  hHalf, distance,   wHalf, -hHalf, distance,
     wHalf, -hHalf, distance,  -wHalf, -hHalf, distance,
    -wHalf, -hHalf, distance,  -wHalf,  hHalf, distance,
  ];

  // Optional Optical Focus Distance Plane Slice inside Frustum
  if (focusDistance && focusDistance > 1 && focusDistance < distance - 0.5) {
    const fhHalf = Math.tan(fovRad / 2) * focusDistance;
    const fwHalf = fhHalf * aspect;
    baseVerts.push(
      -fwHalf,  fhHalf, focusDistance,   fwHalf,  fhHalf, focusDistance,
       fwHalf,  fhHalf, focusDistance,   fwHalf, -fhHalf, focusDistance,
       fwHalf, -fhHalf, focusDistance,  -fwHalf, -fhHalf, focusDistance,
      -fwHalf, -fhHalf, focusDistance,  -fwHalf,  fhHalf, focusDistance,
      // Focus crosshair ticks
      -fwHalf * 0.15, 0, focusDistance,  fwHalf * 0.15, 0, focusDistance,
      0, -fhHalf * 0.15, focusDistance,  0, fhHalf * 0.15, focusDistance
    );
  }

  const vertices = new Float32Array(baseVerts);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  return geo;
}

/**
 * Viewfinder Through-the-Lens HUD Overlays:
 * - Active VFX reference mode badge watermark
 * - Actor choreography bounding frames
 * - Rule of thirds composition grid
 * - Center optical crosshair
 */
export const StageViewfinderOverlays: React.FC<StageViewfinderOverlaysProps> = ({
  vfxReference,
  actors,
  showRuleOfThirds,
}) => {
  return (
    <>
      {/* Active Reference Mode Watermark in Viewfinder */}
      {vfxReference?.enabled && (
        <div
          className={`absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-lg backdrop-blur px-2.5 py-1 font-mono text-[10px] border shadow-lg ${
            vfxReference.referenceMode === 'actor-motion'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
              : vfxReference.referenceMode === 'camera-only'
              ? 'bg-amber-950/80 border-director-gold/40 text-director-gold'
              : vfxReference.referenceMode === 'full-scene'
              ? 'bg-cyan-950/80 border-director-cyan/40 text-director-cyan'
              : 'bg-purple-950/80 border-purple-500/40 text-purple-300'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
          <span className="font-bold uppercase tracking-wider">
            {vfxReference.referenceMode === 'actor-motion'
              ? `ACTOR CHOREOGRAPHY (${actors.length} SUBJECTS)`
              : vfxReference.referenceMode === 'camera-only'
              ? 'CAMERA SOLVE (REPLACE SUBJECTS)'
              : vfxReference.referenceMode === 'full-scene'
              ? 'FULL SCENE VFX (VOLUMETRIC DEPTH)'
              : 'OBJECT TRACKING MODE'}
          </span>
        </div>
      )}

      {/* Actor Choreography Brackets in Viewfinder when in Actor Motion Mode */}
      {vfxReference?.enabled && vfxReference.referenceMode === 'actor-motion' && (
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-around px-8">
          {actors.map((actor, idx) => (
            <div key={actor.id} className="flex flex-col items-center gap-1 opacity-80">
              <div className="h-28 w-20 border-2 border-dashed border-emerald-400/60 rounded-lg flex items-start justify-start p-1 bg-emerald-500/5">
                <span className="font-mono text-[8px] bg-emerald-900/80 text-emerald-300 px-1 rounded font-bold">
                  ACTOR {idx + 1}
                </span>
              </div>
              <span className="font-mono text-[9px] text-emerald-300 bg-black/70 px-1.5 py-0.5 rounded border border-emerald-500/30">
                {actor.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Camera Only Mode Callout */}
      {vfxReference?.enabled && vfxReference.referenceMode === 'camera-only' && (
        <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center pointer-events-none">
          <span className="bg-amber-950/80 text-amber-300 border border-amber-500/40 font-mono text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-lg">
            📷 CAMERA FLIGHT ISOLATED • SUBJECTS WILL BE NEWLY GENERATED
          </span>
        </div>
      )}

      {/* Rule of Thirds Overlay */}
      {showRuleOfThirds && (
        <div className="absolute inset-0 pointer-events-none z-10 grid grid-cols-3 grid-rows-3 border border-white/10">
          <div className="border-r border-b border-white/10" />
          <div className="border-r border-b border-white/10" />
          <div className="border-b border-white/10" />
          <div className="border-r border-b border-white/10" />
          <div className="border-r border-b border-white/10" />
          <div className="border-b border-white/10" />
          <div className="border-r border-b border-white/10" />
          <div className="border-r border-b border-white/10" />
          <div />
        </div>
      )}

      {/* Center Crosshair */}
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center opacity-30">
        <div className="h-6 w-0.5 bg-white" />
        <div className="w-6 h-0.5 bg-white absolute" />
      </div>
    </>
  );
};
