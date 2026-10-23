/**
 * Universal Directorial Scene Decomposer Engine.
 *
 * Solves the root cause of partial prompt translation:
 * Instead of treating a user prompt as just a narrative string or matching a single keyword,
 * this engine performs a full 4-layer directorial decomposition:
 *   1. Architecture & Materials: Wall textures (brick, wood, stone, concrete), floor surfaces, window views.
 *   2. Dynamic Practical Lighting: Light emitters (fire, candle, neon, lamps, sunlight, moonlight) with color & flicker.
 *   3. Atmospheric FX & Particle Systems: Smoke, embers, dust motes, rain, steam, fog.
 *   4. Stage Props & Actors: Extracts focal physical subjects, places them on stage, and preserves their full descriptive tokens.
 *   5. Cinematic Camera Direction: Suggests framing, lens focal length, and movement matching the narrative mood.
 */

import { EnvironmentSpec } from '../types/environment';
import {
  LightingStyle,
  LightingDirection,
  CameraMovementType,
  MovementSpeed,
} from '../types/shotspec';

export type LightingContrast = 'soft' | 'balanced' | 'high-contrast';

export interface DecomposedPracticalLight {
  id: string;
  type: 'fire' | 'candle' | 'neon' | 'lamp' | 'moonlight' | 'spotlight';
  colorHex: number;
  intensity: number;
  distance: number;
  decay: number;
  flicker: boolean;
  flickerSpeed?: number;
  relativePosition: [number, number, number]; // [x, y, z] in stage coordinates
}

export interface DecomposedActor {
  name: string;
  kind: 'human' | 'creature' | 'vehicle' | 'prop' | 'building';
  tokenPrompt: string;
  scale: number;
  stagePosition: { x: number; y: number }; // 0-100 percentage coordinates
  actionDescription: string;
}

export interface DecomposedScene {
  environment: Partial<EnvironmentSpec> & {
    wallSurface: 'brick' | 'wood-panel' | 'stone-masonry' | 'concrete' | 'sci-fi' | 'charcoal';
    windowView: 'twilight' | 'daylight' | 'neon-city' | 'forest' | 'none';
  };
  lighting: {
    style: LightingStyle;
    direction: LightingDirection;
    contrast: LightingContrast;
  };
  practicalLights: DecomposedPracticalLight[];
  particles: {
    smoke: boolean;
    embers: boolean;
    dustMotes: boolean;
    rain: boolean;
  };
  extractedActors: DecomposedActor[];
  cameraSuggestion: {
    shotType: 'extreme-wide' | 'wide' | 'medium-full' | 'medium' | 'medium-close' | 'close-up' | 'extreme-close';
    lensFocalLength: string;
    angle: 'eye-level' | 'low-angle' | 'high-angle' | 'dutch-angle' | 'birds-eye' | 'worm-eye';
    movement: {
      type: CameraMovementType;
      speed: MovementSpeed;
      pacing?: 'linear' | 'ease-in-out' | 'ease-in' | 'ease-out';
    };
  };
  summary: string;
}

/**
 * Universal rule-based first-principles semantic decomposition.
 * Executes synchronously with 0ms latency, handling English & Arabic.
 */
export function decomposeDirectorialScene(prompt: string): DecomposedScene {
  const p = (prompt || '').trim();
  const lower = p.toLowerCase();

  // -------------------------------------------------------------------------
  // 1. Architecture & Surface Materials
  // -------------------------------------------------------------------------
  let wallSurface: 'brick' | 'wood-panel' | 'stone-masonry' | 'concrete' | 'sci-fi' | 'charcoal' = 'charcoal';
  if (/brick|terracotta|masonry\s*wall|طوب|قرميد/i.test(lower)) {
    wallSurface = 'brick';
  } else if (/wood\s*panel|timber\s*wall|cabin\s*wall|oak\s*wall|victorian\s*study|study|library|chalet|خشب|لوح\s*خشبي/i.test(lower)) {
    wallSurface = 'wood-panel';
  } else if (/stone\s*wall|castle\s*wall|dungeon|cave|حجر|صخر/i.test(lower)) {
    wallSurface = 'stone-masonry';
  } else if (/concrete|cement|brutalist|bunker|خرسانة|اسمنت/i.test(lower)) {
    wallSurface = 'concrete';
  } else if (/sci-fi|spaceship|cyber|corridor|metallic\s*wall|فضائي|معدني/i.test(lower)) {
    wallSurface = 'sci-fi';
  }

  // Floor Surface
  let groundSurface: EnvironmentSpec['groundSurface'] = 'studio-floor';
  if (/wood\s*floor|parquet|hardwood|timber\s*floor|باركيه|خشب\s*ارضية/i.test(lower)) {
    groundSurface = 'wood-parquet';
  } else if (/wet\s*asphalt|rain-slicked|street|alleyway|puddle|اسفلت|شارع/i.test(lower)) {
    groundSurface = 'asphalt-wet';
  } else if (/cobblestone|stone\s*floor|paved|حجر\s*مرصوف|حصى/i.test(lower)) {
    groundSurface = 'stone-cobblestone';
  } else if (/sand|desert|dune|beach|صحراء|رمال/i.test(lower)) {
    groundSurface = 'sand-dunes';
  } else if (/grass|forest\s*floor|meadow|moss|عشب|مرج|حديقة/i.test(lower)) {
    groundSurface = 'grass-terrain';
  } else if (/grate|metal\s*floor|catwalk|شباك\s*حديد/i.test(lower)) {
    groundSurface = 'metal-grate';
  } else if (/concrete|warehouse\s*floor|cement\s*floor/i.test(lower)) {
    groundSurface = 'concrete-floor';
  }

  // Time of Day & Weather
  let timeOfDay: EnvironmentSpec['timeOfDay'] = 'day';
  let windowView: 'twilight' | 'daylight' | 'neon-city' | 'forest' | 'none' = 'none';

  if (/twilight|dusk|sunset|deep\s*blue|شفق|غروب/i.test(lower)) {
    timeOfDay = 'twilight';
    windowView = 'twilight';
  } else if (/neon\s*night|cyberpunk|midnight|ليل\s*نيون/i.test(lower)) {
    timeOfDay = 'neon-night';
    windowView = 'neon-city';
  } else if (/night|moonlight|dark\s*room|ليل|ضوء\s*قمر/i.test(lower)) {
    timeOfDay = 'night';
    windowView = 'twilight';
  } else if (/golden\s*hour|warm\s*sun|ساعة\s*ذهبية/i.test(lower)) {
    timeOfDay = 'golden-hour';
    windowView = 'daylight';
  } else if (/dawn|morning|fجر|صباح/i.test(lower)) {
    timeOfDay = 'dawn';
    windowView = 'daylight';
  }

  let weather: EnvironmentSpec['weather'] = 'clear';
  if (/rain|storm|downpour|مطر|عاصفة/i.test(lower)) {
    weather = 'rain';
  } else if (/fog|mist|haze|ضباب|سديم/i.test(lower)) {
    weather = 'fog';
  } else if (/snow|blizzard|ثلج|جليد/i.test(lower)) {
    weather = 'snow';
  } else if (/sandstorm|dust\s*storm|عاصفة\s*رملية/i.test(lower)) {
    weather = 'sandstorm';
  }

  // Category
  let category: EnvironmentSpec['category'] = 'interior';
  if (/forest|pine|nature|meadow|mountain|river|غابة|طبيعة/i.test(lower)) {
    category = 'nature';
  } else if (/street|alley|city|urban|highway|sidewalk|مدينة|شارع/i.test(lower)) {
    category = 'urban';
  } else if (/cyberpunk|space|spaceship|sci-fi|lab|مستقبلي|خيال\s*علمي/i.test(lower)) {
    category = 'scifi';
  } else if (/desert|dunes|sahara|صحراء/i.test(lower)) {
    category = 'nature';
  }

  // -------------------------------------------------------------------------
  // 2. Dynamic Practical Lighting
  // -------------------------------------------------------------------------
  const practicalLights: DecomposedPracticalLight[] = [];
  let lightingStyle: LightingStyle = 'cinematic-natural';
  let lightingDirection: LightingDirection = 'side-key';
  let lightingContrast: LightingContrast = 'balanced';

  // Fire / Hearth Light
  if (/fireplace|hearth|fire\s*box|crackl|ember|flame|bonfire|camp\s*fire|مدفأة|موقد|نار|جمر/i.test(lower)) {
    lightingStyle = 'golden-hour';
    lightingDirection = 'side-key';
    lightingContrast = 'high-contrast';
    practicalLights.push({
      id: 'light-fire-hearth',
      type: 'fire',
      colorHex: 0xf97316, // Vibrant warm orange
      intensity: 4.8,
      distance: 50,
      decay: 1.2,
      flicker: true,
      flickerSpeed: 1.0,
      relativePosition: [0, 1.2, -22],
    });
  }

  // Candle / Torch Light
  if (/candle|torch|lantern|شمعة|مشعل|فانوس/i.test(lower)) {
    lightingStyle = 'practical-candlelight';
    practicalLights.push({
      id: 'light-candle',
      type: 'candle',
      colorHex: 0xfdba74, // Soft warm amber
      intensity: 2.2,
      distance: 25,
      decay: 1.8,
      flicker: true,
      flickerSpeed: 1.4,
      relativePosition: [6, 1.5, -8],
    });
  }

  // Neon Light
  if (/neon|hologram|cyber\s*glow|نيون|هولوغرام/i.test(lower)) {
    lightingStyle = 'neon-cyberpunk';
    lightingContrast = 'high-contrast';
    practicalLights.push({
      id: 'light-neon-cyan',
      type: 'neon',
      colorHex: 0x06b6d4, // Cyan
      intensity: 3.5,
      distance: 35,
      decay: 1.4,
      flicker: false,
      relativePosition: [-12, 4.0, -15],
    });
    practicalLights.push({
      id: 'light-neon-magenta',
      type: 'neon',
      colorHex: 0xec4899, // Magenta
      intensity: 2.8,
      distance: 30,
      decay: 1.5,
      flicker: false,
      relativePosition: [12, 3.5, -15],
    });
  }

  // Practical Desk / Banker / Floor Lamp
  if (/lamp|table\s*lamp|desk\s*lamp|مصباح|اباجورة/i.test(lower)) {
    practicalLights.push({
      id: 'light-practical-lamp',
      type: 'lamp',
      colorHex: 0xfef08a, // Soft warm white
      intensity: 2.6,
      distance: 28,
      decay: 1.5,
      flicker: false,
      relativePosition: [8, 2.0, -10],
    });
  }

  // Window Moonlight
  if (/moonlight|blue\s*twilight|window\s*light|ضوء\s*القمر|شباك/i.test(lower)) {
    practicalLights.push({
      id: 'light-window-moon',
      type: 'moonlight',
      colorHex: 0x60a5fa, // Cool moonlight blue
      intensity: 3.0,
      distance: 60,
      decay: 1.1,
      flicker: false,
      relativePosition: [0, 8.0, -42],
    });
  }

  // -------------------------------------------------------------------------
  // 3. Atmospheric Particles
  // -------------------------------------------------------------------------
  const particles = {
    smoke: /smoke|rising\s*smoke|chimney|steam|دخان|بخار/i.test(lower) || practicalLights.some((l) => l.type === 'fire'),
    embers: /ember|crackl|spark|sparkle|جمر|شرار/i.test(lower) || practicalLights.some((l) => l.type === 'fire'),
    dustMotes: /dust\s*mote|drifting\s*dust|sunbeam|light\s*beam|غبار|ذرات\s*غبار/i.test(lower) || /dimly\s*lit|quiet|study/i.test(lower),
    rain: /rain|downpour|puddle|storm|مطر|رذاذ/i.test(lower) || weather === 'rain',
  };

  // -------------------------------------------------------------------------
  // 4. Stage Props & Actors Extraction
  // -------------------------------------------------------------------------
  const extractedActors: DecomposedActor[] = [];

  // Fireplace Prop
  if (/fireplace|hearth|fire\s*box|مدفأة|موقد/i.test(lower)) {
    extractedActors.push({
      name: 'Rustic Stone Fireplace',
      kind: 'prop',
      tokenPrompt: 'a rustic stone fireplace with fieldstone pillars, arched keystone lintel, glowing embers, and wavering flames',
      scale: 1.6,
      stagePosition: { x: 50, y: 35 },
      actionDescription: 'Crackling warm embers and flickering orange flame core in stone hearth',
    });
  }

  // Grandfather Clock / Timepiece
  if (/grandfather\s*clock|pendulum\s*clock|antique\s*clock|ساعة\s*حائط|ساعة\s*بندول/i.test(lower)) {
    extractedActors.push({
      name: 'Grandfather Clock',
      kind: 'prop',
      tokenPrompt: 'an ornate grandfather clock with polished mahogany wood casing, brass pendulum, and Roman numeral dial',
      scale: 1.4,
      stagePosition: { x: 25, y: 35 },
      actionDescription: 'Brass pendulum swinging rhythmically in wooden cabinet',
    });
  }

  // Armchair / Chesterfield Sofa
  if (/armchair|chesterfield|leather\s*chair|sofa|couch|كرسي|اريكة/i.test(lower)) {
    extractedActors.push({
      name: 'Leather Armchair',
      kind: 'prop',
      tokenPrompt: 'a classic tufted leather armchair with dark mahogany wooden legs and brass nailhead trim',
      scale: 1.3,
      stagePosition: { x: 65, y: 45 },
      actionDescription: 'Stationary plush leather armchair facing warm hearth',
    });
  }

  // Desk / Study Table
  if (/desk|study\s*table|writing\s*desk|مكتب|طاولة\s*كتابة/i.test(lower)) {
    extractedActors.push({
      name: 'Mahogany Writing Desk',
      kind: 'prop',
      tokenPrompt: 'a solid carved mahogany executive writing desk with brass drawer handles and leather inlay top',
      scale: 1.4,
      stagePosition: { x: 30, y: 50 },
      actionDescription: 'Stately writing desk with lamp and open leather journal',
    });
  }

  // Bookshelf / Library Stack
  if (/bookshelf|bookcase|library|كتب|مكتبة/i.test(lower)) {
    extractedActors.push({
      name: 'Tall Bookshelf Stack',
      kind: 'prop',
      tokenPrompt: 'tall dark wood bookshelves lined with leather-bound volumes and brass bookends',
      scale: 1.8,
      stagePosition: { x: 80, y: 35 },
      actionDescription: 'Massive floor-to-ceiling wooden library shelving',
    });
  }

  // Table / Lantern Lamp
  if (/lamp|lantern|مصباح|فانوس/i.test(lower) && !extractedActors.some((a) => a.name.includes('Desk'))) {
    extractedActors.push({
      name: 'Forged Iron Floor Lamp',
      kind: 'prop',
      tokenPrompt: 'a tall forged wrought-iron floor lamp with frosted glass lantern casting warm golden light',
      scale: 1.3,
      stagePosition: { x: 75, y: 40 },
      actionDescription: 'Steady warm practical glow',
    });
  }

  // Cyberpunk Vending Machine
  if (/vending\s*machine|arcade|kiosk|ماكينة\s*بيع/i.test(lower)) {
    extractedActors.push({
      name: 'Cyberpunk Vending Machine',
      kind: 'prop',
      tokenPrompt: 'a futuristic glowing vending machine with holographic drink cans, illuminated marquee, and chrome dispenser',
      scale: 1.5,
      stagePosition: { x: 30, y: 40 },
      actionDescription: 'Holographic display flickering with neon soda advertisements',
    });
  }

  // Automobile / Car
  if (/car|automobile|vehicle|truck|sports\s*car|سيارة|مركبة/i.test(lower)) {
    extractedActors.push({
      name: 'Automobile',
      kind: 'vehicle',
      tokenPrompt: 'a sleek cinematic automobile with glossy metallic paint, chrome trim, and detailed headlamps',
      scale: 1.8,
      stagePosition: { x: 50, y: 50 },
      actionDescription: 'Gleaming vehicle chassis parked on wet reflective ground',
    });
  }

  // Ancient Stone Well
  if (/stone\s*well|well\s*in|water\s*well|بئر/i.test(lower)) {
    extractedActors.push({
      name: 'Ancient Stone Well',
      kind: 'prop',
      tokenPrompt: 'a circular weathered stone well with timber gabled roof, wooden bucket, and hemp rope winch',
      scale: 1.5,
      stagePosition: { x: 50, y: 45 },
      actionDescription: 'Ancient masonry well with mossy stone ring',
    });
  }

  // -------------------------------------------------------------------------
  // 5. Cinematic Camera Direction
  // -------------------------------------------------------------------------
  let shotType: 'extreme-wide' | 'wide' | 'medium-full' | 'medium' | 'medium-close' | 'close-up' | 'extreme-close' = 'medium';
  let lensFocalLength = '35mm';
  let cameraMovementType: CameraMovementType = 'dolly-in';
  let cameraSpeed: MovementSpeed = 'slow-cinematic';

  if (/close-up|close\s*up|macro|detail|عن\s*قرب|تفاصيل/i.test(lower)) {
    shotType = 'close-up';
    lensFocalLength = '85mm';
  } else if (/wide\s*shot|panoramic|establishing|vista|مشهد\s*واسع/i.test(lower)) {
    shotType = 'wide';
    lensFocalLength = '24mm';
  }

  if (/slow|gentle|peaceful|quiet|cinematic|cozy|هادئ|بطيء/i.test(lower)) {
    cameraMovementType = 'dolly-in';
    cameraSpeed = 'slow-cinematic';
  } else if (/pan|sweep|مسح|تحريك/i.test(lower)) {
    cameraMovementType = 'pan-left';
    cameraSpeed = 'slow-cinematic';
  } else if (/action|fast|rapid|speed|سريع|مطاردة/i.test(lower)) {
    cameraMovementType = 'truck-left';
    cameraSpeed = 'rapid-dynamic';
  }

  const cameraMovement = {
    type: cameraMovementType,
    speed: cameraSpeed,
    pacing: 'ease-in-out' as const,
  };

  const summary = `Decomposed into ${wallSurface} walls, ${groundSurface} floor, ${practicalLights.length} dynamic light sources, ${extractedActors.length} physical stage props, and ${Object.entries(particles).filter(([, v]) => v).map(([k]) => k).join(', ')} particles.`;

  return {
    environment: {
      category,
      groundSurface,
      wallSurface,
      windowView,
      timeOfDay,
      weather,
      fogDensity: weather === 'fog' ? 0.045 : particles.smoke ? 0.015 : 0.008,
      fogColor: timeOfDay === 'twilight' ? '#0f172a' : timeOfDay === 'golden-hour' ? '#78350f' : '#1e293b',
      skyColor: timeOfDay === 'twilight' ? '#0a1128' : timeOfDay === 'golden-hour' ? '#ea580c' : '#1e293b',
      ambientColor: lightingStyle === 'golden-hour' || lightingStyle === 'practical-candlelight' ? '#3b1c10' : '#0f172a',
    },
    lighting: {
      style: lightingStyle,
      direction: lightingDirection,
      contrast: lightingContrast,
    },
    practicalLights,
    particles,
    extractedActors,
    cameraSuggestion: {
      shotType,
      lensFocalLength,
      angle: 'eye-level',
      movement: cameraMovement,
    },
    summary,
  };
}
