import React from 'react';
import { useShotStore } from '../stores/useShotStore';
import { FocalLength, CameraMovementType, CameraAngle, ShotType, MovementSpeed } from '../types/shotspec';
import { Camera, Compass, Move, Aperture, Video, Gauge, Target } from 'lucide-react';

const FOCAL_LENGTHS: { value: FocalLength; label: string; fov: string; note: string; feeling: string }[] = [
  { value: '18mm', label: '18mm', fov: '100°', note: 'Ultra-wide angle', feeling: 'Vast scale & deep perspective. Swallows subjects in massive environments.' },
  { value: '24mm', label: '24mm', fov: '84°', note: 'Environmental', feeling: 'Dynamic immersive wide. Captures character and surrounding world in motion.' },
  { value: '35mm', label: '35mm', fov: '63°', note: 'Classic cinema', feeling: 'The Hollywood storytelling standard. Natural balance between character and space.' },
  { value: '50mm', label: '50mm', fov: '47°', note: 'Natural eye', feeling: 'Human eye perspective. Zero lens distortion; honest, grounded emotional realism.' },
  { value: '85mm', label: '85mm', fov: '28°', note: 'Portrait telephoto', feeling: 'Emotional close-ups. Compresses background into creamy cinematic bokeh.' },
  { value: '135mm', label: '135mm', fov: '18°', note: 'Compressed bokeh', feeling: 'Extreme telephoto isolation. Creates voyeuristic intimacy and flattened depth.' },
];

const MOVEMENTS: { value: CameraMovementType; label: string; group: string }[] = [
  { value: 'static', label: 'Static Locked', group: 'Tripod' },
  { value: 'dolly-in', label: 'Dolly Push-In', group: 'Physical' },
  { value: 'dolly-out', label: 'Dolly Pull-Out', group: 'Physical' },
  { value: 'truck-left', label: 'Truck Left', group: 'Lateral' },
  { value: 'truck-right', label: 'Truck Right', group: 'Lateral' },
  { value: 'pedestal-up', label: 'Pedestal Up', group: 'Vertical' },
  { value: 'pedestal-down', label: 'Pedestal Down', group: 'Vertical' },
  { value: 'pan-left', label: 'Pan Left', group: 'Rotational' },
  { value: 'pan-right', label: 'Pan Right', group: 'Rotational' },
  { value: 'tilt-up', label: 'Tilt Up', group: 'Rotational' },
  { value: 'tilt-down', label: 'Tilt Down', group: 'Rotational' },
  { value: 'orbit-clockwise', label: 'Orbit CW', group: 'Arc' },
  { value: 'orbit-counter-clockwise', label: 'Orbit CCW', group: 'Arc' },
  { value: 'zoom-in', label: 'Optical Zoom In', group: 'Lens' },
  { value: 'zoom-out', label: 'Optical Zoom Out', group: 'Lens' },
  { value: 'handheld-subtle', label: 'Handheld Organic', group: 'Organic' },
  { value: 'whip-pan', label: 'Whip-Pan Swish', group: 'Dynamic' },
];

const ANGLES: { value: CameraAngle; label: string; feeling: string }[] = [
  { value: 'eye-level', label: 'Eye Level', feeling: 'Neutral, objective equality with the character.' },
  { value: 'low-angle', label: 'Low Angle', feeling: 'Power, authority, heroism, or looming intimidation.' },
  { value: 'high-angle', label: 'High Angle', feeling: 'Vulnerability, weakness, or feeling watched.' },
  { value: 'dutch-angle', label: 'Dutch Angle', feeling: 'Psychological disorientation, tension, and impending doom.' },
  { value: 'overhead-gods-eye', label: "God's Eye (Top-Down)", feeling: 'Omniscient, detached, fateful overhead perspective.' },
  { value: 'ground-level', label: 'Ground Skim', feeling: 'Visceral speed, energy, and ground-up dynamism.' },
];

const SHOT_SIZES: { value: ShotType; label: string }[] = [
  { value: 'extreme-wide', label: 'Extreme Wide (EWS)' },
  { value: 'wide', label: 'Wide Shot (WS)' },
  { value: 'medium-wide', label: 'Medium Wide (MWS)' },
  { value: 'medium', label: 'Medium Shot (MS)' },
  { value: 'medium-close-up', label: 'Medium Close-Up (MCU)' },
  { value: 'close-up', label: 'Close-Up (CU)' },
  { value: 'extreme-close-up', label: 'Extreme Close-Up (ECU)' },
];

export const CameraDeck: React.FC = () => {
  const {
    shot,
    setFocalLength,
    setCameraMovement,
    setCameraAngle,
    setShotType,
    selectedActorId,
    focusCameraOnSubject,
  } = useShotStore();
  const currentMovement = shot.camera.movement.type;
  const currentSpeed = shot.camera.movement.speed;
  const selectedActor = shot.actors.find((a) => a.id === selectedActorId);

  const currentLensInfo = FOCAL_LENGTHS.find((l) => l.value === shot.camera.lens.focalLength);
  const currentAngleInfo = ANGLES.find((a) => a.value === shot.camera.angle);

  return (
    <div className="flex flex-col gap-5 p-4 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-director-border pb-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-director-gold" />
          <span className="font-display font-bold text-sm tracking-wider uppercase text-white">Camera Deck</span>
        </div>
        <span className="rounded bg-director-surface px-2 py-0.5 font-mono text-[10px] text-director-gold">
          {shot.camera.lens.focalLength} • {shot.camera.shotType}
        </span>
      </div>

      {/* Optical Lens Selection */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center justify-between font-mono text-[11px] text-slate-300">
          <span className="flex items-center gap-1.5">
            <Aperture className="h-3.5 w-3.5 text-director-amber" />
            Focal Length (Optics)
          </span>
          <span className="text-[10px] text-slate-400">Sensor: Full Frame</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {FOCAL_LENGTHS.map((lens) => {
            const isSelected = shot.camera.lens.focalLength === lens.value;
            return (
              <button
                key={lens.value}
                onClick={() => setFocalLength(lens.value)}
                className={`flex flex-col items-center justify-center rounded-lg p-2 transition-all ${
                  isSelected
                    ? 'border-director-gold bg-director-gold/15 text-white ring-1 ring-director-gold shadow-glow-gold'
                    : 'glass-control text-slate-300 hover:text-white'
                }`}
              >
                <span className="font-display font-bold text-xs">{lens.label}</span>
                <span className="font-mono text-[9px] text-slate-400">{lens.fov} FOV</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Lens Insight Callout */}
        {currentLensInfo && (
          <div className="rounded-lg bg-director-panel/60 p-2.5 border border-director-border/60 text-[11px] leading-relaxed text-slate-300">
            <span className="font-mono text-[10px] text-director-gold font-bold block mb-0.5">
              OPTICAL IMPACT ({currentLensInfo.label})
            </span>
            {currentLensInfo.feeling}
          </div>
        )}
      </div>

      {/* Camera Movement Type */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center justify-between font-mono text-[11px] text-slate-300">
          <span className="flex items-center gap-1.5">
            <Move className="h-3.5 w-3.5 text-director-cyan" />
            Trajectory Movement
          </span>
          <span className="text-[10px] text-director-cyan font-bold capitalize">{currentMovement.replace('-', ' ')}</span>
        </label>
        <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
          {MOVEMENTS.map((m) => {
            const isSelected = currentMovement === m.value;
            return (
              <button
                key={m.value}
                onClick={() => setCameraMovement(m.value)}
                className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-all ${
                  isSelected
                    ? 'border-director-cyan bg-director-cyan/15 text-white ring-1 ring-director-cyan'
                    : 'glass-control text-slate-300 hover:text-white'
                }`}
              >
                <span className="font-sans text-[11px]">{m.label}</span>
                <span className="font-mono text-[9px] text-slate-400">{m.group}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Movement Speed & Pacing */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
          <Gauge className="h-3.5 w-3.5 text-director-amber" />
          Camera Pacing & Easing
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {(['slow-cinematic', 'moderate', 'rapid-dynamic'] as MovementSpeed[]).map((speed) => {
            const isSelected = currentSpeed === speed;
            return (
              <button
                key={speed}
                onClick={() => setCameraMovement(currentMovement, speed)}
                className={`rounded-md py-1.5 text-center font-mono text-[10px] transition-all capitalize ${
                  isSelected
                    ? 'border-director-amber bg-director-amber/20 text-director-amber font-bold ring-1 ring-director-amber'
                    : 'glass-control text-slate-400 hover:text-slate-200'
                }`}
              >
                {speed.replace('-', ' ')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject Tracking & Target Focus */}
      <div className="flex flex-col gap-2 rounded-lg border border-director-border/60 bg-director-panel/40 p-2.5">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
            <Target className="h-3.5 w-3.5 text-cyan-400" />
            Subject Focus & Tracking
          </label>
          <span className="font-mono text-[10px] text-slate-400">
            {selectedActor ? selectedActor.name : 'Scene Center'}
          </span>
        </div>
        <button
          onClick={() => focusCameraOnSubject(selectedActorId !== '__camera__' ? selectedActorId : undefined)}
          className="flex items-center justify-center gap-1.5 rounded-md py-1.5 px-2 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 hover:text-white border border-cyan-500/40 font-mono text-[10px] font-semibold transition-all shadow-sm active:scale-95"
          title="Lock camera target directly onto active subject"
        >
          <Target className="h-3 w-3 text-cyan-400" />
          <span>Focus Camera on {selectedActor ? selectedActor.name : 'Primary Subject'}</span>
        </button>
      </div>

      {/* Angle & Framing Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Camera Angle */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1 font-mono text-[10px] text-slate-300">
            <Compass className="h-3 w-3 text-slate-400" />
            Camera Angle
          </label>
          <select
            value={shot.camera.angle}
            onChange={(e) => setCameraAngle(e.target.value as CameraAngle)}
            className="glass-control rounded-md px-2 py-1.5 font-sans text-xs text-white"
          >
            {ANGLES.map((a) => (
              <option key={a.value} value={a.value} className="bg-director-panel text-white">
                {a.label}
              </option>
            ))}
          </select>
        </div>

        {/* Shot Size */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1 font-mono text-[10px] text-slate-300">
            <Video className="h-3 w-3 text-slate-400" />
            Shot Framing
          </label>
          <select
            value={shot.camera.shotType}
            onChange={(e) => setShotType(e.target.value as ShotType)}
            className="glass-control rounded-md px-2 py-1.5 font-sans text-xs text-white"
          >
            {SHOT_SIZES.map((s) => (
              <option key={s.value} value={s.value} className="bg-director-panel text-white">
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dynamic Angle Insight Callout */}
      {currentAngleInfo && (
        <div className="rounded-lg bg-director-panel/40 p-2 border border-director-border/40 text-[10px] text-slate-400 font-sans">
          <span className="text-director-cyan font-bold block mb-0.5">
            ANGLE PSYCHOLOGY ({currentAngleInfo.label}):
          </span>
          {currentAngleInfo.feeling}
        </div>
      )}
    </div>
  );
};
