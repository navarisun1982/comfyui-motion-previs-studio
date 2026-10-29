import { z } from 'zod';

export const GroundSurfaceTypeSchema = z.enum([
  'asphalt-wet',
  'stone-cobblestone',
  'sand-dunes',
  'metal-grate',
  'wood-parquet',
  'grass-terrain',
  'studio-floor',
  'concrete-floor',
]);
export type GroundSurfaceType = z.infer<typeof GroundSurfaceTypeSchema>;

export const EnvironmentWeatherSchema = z.enum([
  'clear',
  'fog',
  'rain',
  'sandstorm',
  'snow',
  'overcast',
]);
export type EnvironmentWeather = z.infer<typeof EnvironmentWeatherSchema>;

export const EnvironmentTimeOfDaySchema = z.enum([
  'dawn',
  'day',
  'golden-hour',
  'twilight',
  'night',
  'neon-night',
]);
export type EnvironmentTimeOfDay = z.infer<typeof EnvironmentTimeOfDaySchema>;

export const EnvironmentCategorySchema = z.enum([
  'urban',
  'nature',
  'interior',
  'scifi',
  'historical',
  'studio',
  'custom',
]);
export type EnvironmentCategory = z.infer<typeof EnvironmentCategorySchema>;

export const EnvironmentSpecSchema = z.object({
  id: z.string().default('env-studio-stage'),
  name: z.string().default('Soundstage Studio'),
  nameAr: z.string().default('بلاتوه استوديو تصوير'),
  category: EnvironmentCategorySchema.default('studio'),
  promptDescription: z
    .string()
    .default(
      'cinematic soundstage studio with dark matte cyclorama floor, professional directorial calibration grid, and overhead softbox bounce'
    ),
  weather: EnvironmentWeatherSchema.default('clear'),
  timeOfDay: EnvironmentTimeOfDaySchema.default('night'),
  groundSurface: GroundSurfaceTypeSchema.default('studio-floor'),
  fogDensity: z.number().min(0).max(1).default(0.012),
  fogColor: z.string().default('#0d111a'),
  skyColor: z.string().default('#08090d'),
  groundColor: z.string().default('#131722'),
  ambientColor: z.string().default('#38bdf8'),
  visibleInPrevis: z.boolean().default(true),
  conceptImageUrl: z.string().optional(),
  conceptImageName: z.string().optional(),
});
export type EnvironmentSpec = z.infer<typeof EnvironmentSpecSchema>;

export interface EnvironmentPreset {
  id: string;
  name: string;
  nameAr: string;
  category: EnvironmentCategory;
  icon: string;
  thumbnailGradient: string;
  description: string;
  spec: EnvironmentSpec;
}

export const CINEMATIC_ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    id: 'env-studio-stage',
    name: 'Soundstage Studio',
    nameAr: 'بلاتوه استوديو تصوير',
    category: 'studio',
    icon: '🎬',
    thumbnailGradient: 'from-slate-900 to-indigo-950 border-indigo-500/30',
    description: 'Clean professional film soundstage with cyclorama floor and overhead lighting rig.',
    spec: {
      id: 'env-studio-stage',
      name: 'Soundstage Studio',
      nameAr: 'بلاتوه استوديو تصوير',
      category: 'studio',
      promptDescription:
        'professional film studio soundstage, dark matte cyclorama infinity stage floor, soft overhead grid lighting bounce, volumetric dust motes, clean cinematic set',
      weather: 'clear',
      timeOfDay: 'night',
      groundSurface: 'studio-floor',
      fogDensity: 0.01,
      fogColor: '#0c0e17',
      skyColor: '#07090e',
      groundColor: '#111522',
      ambientColor: '#60a5fa',
      visibleInPrevis: true,
    },
  },
  {
    id: 'env-cyberpunk-alley',
    name: 'Cyberpunk Tokyo Alley',
    nameAr: 'زقاق طوكيو سايبربانك',
    category: 'urban',
    icon: '🏙️',
    thumbnailGradient: 'from-fuchsia-950 via-purple-900 to-slate-950 border-fuchsia-500/40',
    description: 'Dark rainy neon alley with wet asphalt reflections, steam pipes, and glowing Kanji holograms.',
    spec: {
      id: 'env-cyberpunk-alley',
      name: 'Cyberpunk Tokyo Alley',
      nameAr: 'زقاق طوكيو سايبربانك',
      category: 'urban',
      promptDescription:
        'narrow neo-Tokyo cyberpunk back-alley at midnight, wet asphalt shimmering with vibrant pink and cyan neon reflections, rising steam plumes from floor grates, overhead tangled cables, rain mist',
      weather: 'rain',
      timeOfDay: 'neon-night',
      groundSurface: 'asphalt-wet',
      fogDensity: 0.028,
      fogColor: '#160824',
      skyColor: '#090514',
      groundColor: '#0a0a12',
      ambientColor: '#ec4899',
      visibleInPrevis: true,
    },
  },
  {
    id: 'env-medieval-courtyard',
    name: 'Medieval Castle Courtyard',
    nameAr: 'فناء قلعة العصور الوسطى',
    category: 'historical',
    icon: '🏰',
    thumbnailGradient: 'from-amber-950 via-stone-900 to-slate-950 border-amber-600/30',
    description: 'Fortified stone courtyard with ancient cobblestones, high battlements, and burning iron wall braziers.',
    spec: {
      id: 'env-medieval-courtyard',
      name: 'Medieval Castle Courtyard',
      nameAr: 'فناء قلعة العصور الوسطى',
      category: 'historical',
      promptDescription:
        'ancient medieval stone fortress courtyard, wet cobblestone ground, towering crenellated granite walls, flickering iron braziers casting amber torchlight, cool twilight mist',
      weather: 'fog',
      timeOfDay: 'twilight',
      groundSurface: 'stone-cobblestone',
      fogDensity: 0.022,
      fogColor: '#1a1917',
      skyColor: '#13151c',
      groundColor: '#2b2a26',
      ambientColor: '#f59e0b',
      visibleInPrevis: true,
    },
  },
  {
    id: 'env-desert-dunes',
    name: 'Vast Saharan Dunes',
    nameAr: 'كثبان صحراوية شاسعة',
    category: 'nature',
    icon: '🏜️',
    thumbnailGradient: 'from-amber-900 via-orange-950 to-stone-950 border-amber-500/40',
    description: 'Monumental golden sand dunes stretching toward a warm blazing horizon with subtle heat shimmer.',
    spec: {
      id: 'env-desert-dunes',
      name: 'Vast Saharan Dunes',
      nameAr: 'كثبان صحراوية شاسعة',
      category: 'nature',
      promptDescription:
        'epic panoramic desert dunes landscape, sweeping golden wind-rippled sand ridges, intense warm golden hour sun casting long cinematic shadows, subtle dust haze on distant horizon',
      weather: 'clear',
      timeOfDay: 'golden-hour',
      groundSurface: 'sand-dunes',
      fogDensity: 0.015,
      fogColor: '#2d1a08',
      skyColor: '#3a200a',
      groundColor: '#b47b36',
      ambientColor: '#fbbf24',
      visibleInPrevis: true,
    },
  },
  {
    id: 'env-scifi-hangar',
    name: 'Orbital Starship Hangar',
    nameAr: 'عنبر مركبة فضائية مدارية',
    category: 'scifi',
    icon: '🚀',
    thumbnailGradient: 'from-cyan-950 via-slate-900 to-slate-950 border-cyan-500/40',
    description: 'Monumental deep-space vessel bay with metallic deck plating, force-field atmospheric shield, and blue conduits.',
    spec: {
      id: 'env-scifi-hangar',
      name: 'Orbital Starship Hangar',
      nameAr: 'عنبر مركبة فضائية مدارية',
      category: 'scifi',
      promptDescription:
        'massive futuristic orbital hangar bay, modular dark alloy deck plating with illuminated hazard striping, cyan atmospheric containment forcefield overlooking outer space, giant hydraulic blast bulkheads',
      weather: 'clear',
      timeOfDay: 'night',
      groundSurface: 'metal-grate',
      fogDensity: 0.018,
      fogColor: '#081724',
      skyColor: '#030810',
      groundColor: '#121e2c',
      ambientColor: '#06b6d4',
      visibleInPrevis: true,
    },
  },
  {
    id: 'env-misty-forest',
    name: 'Deep Redwood Forest',
    nameAr: 'غابة أشجار صنوبر ضبابية',
    category: 'nature',
    icon: '🌲',
    thumbnailGradient: 'from-emerald-950 via-teal-950 to-slate-950 border-emerald-500/40',
    description: 'Towering ancient conifers with lush mossy ground, drifting volumetric fog, and morning sun rays.',
    spec: {
      id: 'env-misty-forest',
      name: 'Deep Redwood Forest',
      nameAr: 'غابة أشجار صنوبر ضبابية',
      category: 'nature',
      promptDescription:
        'primeval temperate rainforest with towering moss-covered redwood trunks, damp needle-strewn earthen ground, thick volumetric god rays piercing misty morning canopy',
      weather: 'fog',
      timeOfDay: 'dawn',
      groundSurface: 'grass-terrain',
      fogDensity: 0.035,
      fogColor: '#0f1a14',
      skyColor: '#08120b',
      groundColor: '#192b1a',
      ambientColor: '#10b981',
      visibleInPrevis: true,
    },
  },
  {
    id: 'env-modern-penthouse',
    name: 'Minimalist Penthouse',
    nameAr: 'بنتهاوس زجاجي فاخر',
    category: 'interior',
    icon: '🍸',
    thumbnailGradient: 'from-slate-800 via-stone-900 to-black border-slate-400/30',
    description: 'High-end architectural luxury interior with polished herringbone floor and floor-to-ceiling city skyline glass.',
    spec: {
      id: 'env-modern-penthouse',
      name: 'Minimalist Penthouse',
      nameAr: 'بنتهاوس زجاجي فاخر',
      category: 'interior',
      promptDescription:
        'sleek architectural minimalist luxury penthouse, polished dark oak herringbone floor, floor-to-ceiling glass curtain walls overlooking a sparkling nocturnal metropolis skyline, warm recessed architectural lighting',
      weather: 'clear',
      timeOfDay: 'night',
      groundSurface: 'wood-parquet',
      fogDensity: 0.008,
      fogColor: '#0d1117',
      skyColor: '#0a0d14',
      groundColor: '#231d16',
      ambientColor: '#e2e8f0',
      visibleInPrevis: true,
    },
  },
  {
    id: 'env-post-apocalyptic',
    name: 'Decaying Urban Ruins',
    nameAr: 'أطلال مدينة مدمرة',
    category: 'historical',
    icon: '🏚️',
    thumbnailGradient: 'from-stone-900 via-zinc-950 to-neutral-950 border-stone-600/30',
    description: 'Cracked concrete highway, scattered debris, skeletal skyscraper remnants under desolate overcast sky.',
    spec: {
      id: 'env-post-apocalyptic',
      name: 'Decaying Urban Ruins',
      nameAr: 'أطلال مدينة مدمرة',
      category: 'historical',
      promptDescription:
        'post-apocalyptic shattered city boulevard, cracked weathered concrete with weeds pushing through fissures, rubble mounds and rusted rebar, decaying hollowed-out skyscraper husks under an ash-grey overcast sky',
      weather: 'overcast',
      timeOfDay: 'day',
      groundSurface: 'concrete-floor',
      fogDensity: 0.024,
      fogColor: '#1a1c1e',
      skyColor: '#26292d',
      groundColor: '#2b2d30',
      ambientColor: '#94a3b8',
      visibleInPrevis: true,
    },
  },
  {
    id: 'env-rustic-hearth',
    name: 'Rustic Hearthside Chamber',
    nameAr: 'مدفأة ريفية دافئة',
    category: 'interior',
    icon: '🔥',
    thumbnailGradient: 'from-amber-950 via-stone-900 to-slate-950 border-amber-600/40',
    description: 'Rustic stone hearth with crackling embers, flickering firelight, brick walls, and polished wood floors under twilight sky.',
    spec: {
      id: 'env-rustic-hearth',
      name: 'Rustic Hearthside Chamber',
      nameAr: 'مدفأة ريفية دافئة',
      category: 'interior',
      promptDescription:
        'A rustic stone fireplace crackles with warm embers, casting flickering orange light across textured brick walls and polished wood floors. Volumetric smoke rises gently into the dimly lit room, creating soft shadows that dance against the deep blue twilight visible through a distant window.',
      weather: 'clear',
      timeOfDay: 'twilight',
      groundSurface: 'wood-parquet',
      fogDensity: 0.025,
      fogColor: '#261608',
      skyColor: '#0a1128',
      groundColor: '#3e2114',
      ambientColor: '#f97316',
      visibleInPrevis: true,
    },
  },
];
