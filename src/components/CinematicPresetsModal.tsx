import React from 'react';
import { useShotStore } from '../stores/useShotStore';
import { logger } from '../stores/useLogStore';
import {
  FocalLength,
  ShotType,
  CameraAngle,
  CameraMovementType,
  MovementSpeed,
  LightingStyle,
  LightingDirection,
  AspectRatio,
} from '../types/shotspec';
import {
  Sparkles,
  X,
  Clapperboard,
  ArrowRight,
} from 'lucide-react';

export interface DirectorPreset {
  id: string;
  title: string;
  subtitle: string;
  directorInspiration: string;
  emotionalFeeling: string;
  tags: string[];
  color: string;
  lens: FocalLength;
  shotType: ShotType;
  angle: CameraAngle;
  movement: CameraMovementType;
  speed: MovementSpeed;
  lightingStyle: LightingStyle;
  lightingDirection: LightingDirection;
  contrast: 'soft' | 'balanced' | 'high-contrast';
  aspectRatio: AspectRatio;
}

export const DIRECTOR_PRESETS: DirectorPreset[] = [
  {
    id: 'fincher-noir',
    title: 'Fincher Neo-Noir Suspense',
    subtitle: 'Slow push-in on 35mm with deep shadows',
    directorInspiration: 'David Fincher (Seven, Zodiac, Mindhunter)',
    emotionalFeeling: 'Calculated, obsessive tension. The deliberate camera movement pulls the audience into an inescapable psychological puzzle.',
    tags: ['Suspense', 'Crime', 'Low-Key', 'Calculated'],
    color: 'from-emerald-900/60 to-slate-900/80 border-emerald-500/30 text-emerald-400',
    lens: '35mm',
    shotType: 'medium',
    angle: 'low-angle',
    movement: 'dolly-in',
    speed: 'slow-cinematic',
    lightingStyle: 'low-key-film-noir',
    lightingDirection: 'side-key',
    contrast: 'high-contrast',
    aspectRatio: '2.39:1',
  },
  {
    id: 'spielberg-wonder',
    title: 'Spielberg Cinematic Wonder',
    subtitle: 'Rising wide perspective bathed in golden rim light',
    directorInspiration: 'Steven Spielberg (Jurassic Park, Close Encounters)',
    emotionalFeeling: 'Childlike awe and monumental revelation. The ascending camera elevates the character against an expansive world.',
    tags: ['Awe', 'Adventure', 'Warm Rim', 'Monumental'],
    color: 'from-amber-900/60 to-slate-900/80 border-director-gold/30 text-director-gold',
    lens: '24mm',
    shotType: 'medium-wide',
    angle: 'low-angle',
    movement: 'pedestal-up',
    speed: 'slow-cinematic',
    lightingStyle: 'golden-hour',
    lightingDirection: 'rim-backlit',
    contrast: 'balanced',
    aspectRatio: '16:9',
  },
  {
    id: 'hitchcock-tension',
    title: 'Hitchcock Vertigo Unease',
    subtitle: 'Dutch tilt angle on tight 85mm portrait lens',
    directorInspiration: 'Alfred Hitchcock (Vertigo, Psycho)',
    emotionalFeeling: 'Psychological panic and impending peril. The tilted horizon disrupts mental balance while telephoto compression isolates the subject.',
    tags: ['Psychological', 'Thriller', 'Claustrophobic', 'Dutch Tilt'],
    color: 'from-rose-900/60 to-slate-900/80 border-rose-500/30 text-rose-400',
    lens: '85mm',
    shotType: 'close-up',
    angle: 'dutch-angle',
    movement: 'dolly-in',
    speed: 'rapid-dynamic',
    lightingStyle: 'harsh-fluorescent',
    lightingDirection: 'side-key',
    contrast: 'high-contrast',
    aspectRatio: '16:9',
  },
  {
    id: 'villeneuve-scifi',
    title: 'Villeneuve Brutalist Sci-Fi',
    subtitle: '18mm ultra-wide overhead descent in cosmic scale',
    directorInspiration: 'Denis Villeneuve (Dune, Blade Runner 2049)',
    emotionalFeeling: 'Staggering scale and existential mystery. The ultra-wide field of view diminishes humans within gigantic monolithic landscapes.',
    tags: ['Sci-Fi', 'Scale', 'Overhead', 'Monolithic'],
    color: 'from-cyan-900/60 to-slate-900/80 border-cyan-500/30 text-cyan-400',
    lens: '18mm',
    shotType: 'extreme-wide',
    angle: 'overhead-gods-eye',
    movement: 'pedestal-down',
    speed: 'slow-cinematic',
    lightingStyle: 'moonlight-foggy',
    lightingDirection: 'overhead-top',
    contrast: 'high-contrast',
    aspectRatio: '2.39:1',
  },
  {
    id: 'wong-kar-wai-romance',
    title: 'Wong Kar-Wai Neon Melancholy',
    subtitle: 'Gentle orbit on 50mm normal lens with neon reflections',
    directorInspiration: 'Wong Kar-Wai (In the Mood for Love, Chungking Express)',
    emotionalFeeling: 'Intimate nostalgia and unspoken longing. Natural human eye focal length bathed in neon glow feels like a stolen dream memory.',
    tags: ['Romantic', 'Neon', 'Orbit', 'Intimacy'],
    color: 'from-purple-900/60 to-slate-900/80 border-purple-500/30 text-purple-400',
    lens: '50mm',
    shotType: 'medium',
    angle: 'eye-level',
    movement: 'orbit-clockwise',
    speed: 'slow-cinematic',
    lightingStyle: 'neon-cyberpunk',
    lightingDirection: 'rim-backlit',
    contrast: 'balanced',
    aspectRatio: '16:9',
  },
  {
    id: 'kubrick-symmetry',
    title: 'Kubrick Geometric Dread',
    subtitle: 'Slow calculated center push with single-point perspective',
    directorInspiration: 'Stanley Kubrick (The Shining, 2001: A Space Odyssey)',
    emotionalFeeling: 'Hypnotic, chilling order. The strict one-point symmetry creates an eerie feeling of an omniscient unseen presence watching.',
    tags: ['Symmetry', 'Horror', 'One-Point', 'Unsettling'],
    color: 'from-slate-800/80 to-slate-950 border-slate-600/40 text-slate-300',
    lens: '18mm',
    shotType: 'wide',
    angle: 'eye-level',
    movement: 'dolly-in',
    speed: 'slow-cinematic',
    lightingStyle: 'harsh-fluorescent',
    lightingDirection: 'overhead-top',
    contrast: 'high-contrast',
    aspectRatio: '4:3',
  },
  {
    id: 'tarantino-low-energy',
    title: 'Tarantino Ground-Level Punch',
    subtitle: 'Low upward framing with dynamic whip-pan energy',
    directorInspiration: 'Quentin Tarantino (Pulp Fiction, Kill Bill)',
    emotionalFeeling: 'Unapologetic swagger and bold authority. Looking straight up from ground-level gives characters supreme coolness and energy.',
    tags: ['Punchy', 'Stylized', 'Trunk Shot', 'Dynamic'],
    color: 'from-orange-900/60 to-slate-900/80 border-orange-500/30 text-orange-400',
    lens: '24mm',
    shotType: 'medium-close-up',
    angle: 'ground-level',
    movement: 'whip-pan',
    speed: 'rapid-dynamic',
    lightingStyle: 'cinematic-natural',
    lightingDirection: 'front-soft',
    contrast: 'balanced',
    aspectRatio: '16:9',
  },
  {
    id: 'action-speed-pursuit',
    title: 'Adrenaline High-Speed Trucking',
    subtitle: 'Rapid lateral tracking shot across dynamic foreground',
    directorInspiration: 'George Miller (Mad Max: Fury Road)',
    emotionalFeeling: 'Visceral kinetic urgency. High-speed lateral trucking past foreground objects creates powerful motion parallax.',
    tags: ['Action', 'Chase', 'Kinetic', 'Parallax'],
    color: 'from-red-900/60 to-slate-900/80 border-red-500/30 text-red-400',
    lens: '24mm',
    shotType: 'medium-wide',
    angle: 'low-angle',
    movement: 'truck-right',
    speed: 'rapid-dynamic',
    lightingStyle: 'cinematic-natural',
    lightingDirection: 'side-key',
    contrast: 'balanced',
    aspectRatio: '2.39:1',
  },
];

interface CinematicPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CinematicPresetsModal: React.FC<CinematicPresetsModalProps> = ({ isOpen, onClose }) => {
  const { setFocalLength, setShotType, setCameraAngle, setCameraMovement, setLighting, updateAspectRatio } = useShotStore();

  if (!isOpen) return null;

  const applyPreset = (preset: DirectorPreset) => {
    setFocalLength(preset.lens);
    setShotType(preset.shotType);
    setCameraAngle(preset.angle);
    setCameraMovement(preset.movement, preset.speed);
    setLighting(preset.lightingStyle, preset.lightingDirection, preset.contrast);
    updateAspectRatio(preset.aspectRatio);

    logger.action(`Applied Directorial Mood Preset: "${preset.title}"`, {
      presetId: preset.id,
      lens: preset.lens,
      angle: preset.angle,
      movement: preset.movement,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative flex w-full max-w-4xl flex-col rounded-2xl border border-director-border bg-director-darkest/95 shadow-2xl glass-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-director-border px-6 py-4 bg-director-panel/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-director-gold/20 text-director-gold border border-director-gold/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                Cinematic Mood & Intent Presets
                <span className="rounded bg-director-gold/20 px-2 py-0.5 font-mono text-[10px] text-director-gold">
                  Direct by Feeling
                </span>
              </h2>
              <p className="font-mono text-xs text-slate-400">
                Choose a visual feeling or director style to instantly configure physical camera physics & lighting
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-director-surface hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preset Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 overflow-y-auto max-h-[75vh]">
          {DIRECTOR_PRESETS.map((p) => (
            <div
              key={p.id}
              className={`flex flex-col justify-between rounded-xl border bg-gradient-to-br ${p.color} p-4 transition-all hover:scale-[1.01] hover:shadow-lg`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-white flex items-center gap-1.5">
                    <Clapperboard className="h-4 w-4" /> {p.title}
                  </h3>
                  <div className="flex items-center gap-1">
                    {p.tags.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-slate-300 border border-white/10"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="font-mono text-[11px] text-slate-300 mt-1">{p.subtitle}</p>

                {/* Director Inspiration Note */}
                <div className="mt-2.5 rounded-lg bg-black/40 p-2.5 border border-white/5 font-sans">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Why this works & emotional intent:
                  </span>
                  <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">{p.emotionalFeeling}</p>
                </div>

                {/* Technical Configuration Specs */}
                <div className="mt-3 grid grid-cols-4 gap-1.5 font-mono text-[10px] text-slate-300">
                  <div className="rounded bg-black/30 p-1.5 border border-white/5">
                    <span className="text-slate-500 block text-[9px]">LENS</span>
                    <span className="font-bold text-white">{p.lens}</span>
                  </div>
                  <div className="rounded bg-black/30 p-1.5 border border-white/5">
                    <span className="text-slate-500 block text-[9px]">MOVE</span>
                    <span className="font-bold text-white truncate block">{p.movement}</span>
                  </div>
                  <div className="rounded bg-black/30 p-1.5 border border-white/5">
                    <span className="text-slate-500 block text-[9px]">ANGLE</span>
                    <span className="font-bold text-white truncate block">{p.angle}</span>
                  </div>
                  <div className="rounded bg-black/30 p-1.5 border border-white/5">
                    <span className="text-slate-500 block text-[9px]">ASPECT</span>
                    <span className="font-bold text-white">{p.aspectRatio}</span>
                  </div>
                </div>
              </div>

              {/* Apply Action */}
              <button
                type="button"
                onClick={() => applyPreset(p)}
                className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 font-display text-xs font-bold text-white transition-all border border-white/15"
              >
                Apply This Feeling to Shot
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-director-border px-6 py-3 bg-director-panel/60 font-mono text-xs text-slate-400">
          <span>Tip: You can fine-tune any camera parameter after applying a preset</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-slate-300 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
