/**
 * Vendored & typed from codepawl/67.js `src/vegetation-species.js` and `src/tree-level-gains.js`
 * (MIT License, Copyright (c) 2026 CodePawl).
 * Parametric recursive branching species presets, LOD settings, and calibrated crown luminance gains.
 */

export type TreeSpeciesName = 'broadleaf' | 'birch' | 'conifer' | 'palm' | 'bush';
export type LeafTextureKind = 'sprig' | 'needles' | 'single' | 'grass' | 'clump';
export type BarkTextureKind = 'rough' | 'birch';

export interface BranchChildrenSpec {
  count?: readonly [number, number];
  whorls?: number;
  perWhorl?: readonly [number, number];
  start: number;
  end: number;
  angle: readonly [number, number];
  lengthRatio: readonly [number, number];
  radiusRatio: number;
  profile?: 'crown' | 'cone';
}

export interface BranchLevelSpec {
  segments: number;
  gnarl: number;
  tropism: number;
  tipRadius: number;
  lean?: number;
  lengthScale?: number;
  pairedLeaves?: boolean;
  children?: BranchChildrenSpec;
}

export interface SpeciesLeafSpec {
  texture: LeafTextureKind;
  color: readonly [number, number, number];
  foliageColor: readonly [number, number, number];
  tint: readonly [number, number, number];
  sitesPerMeter: number;
  start: number;
  upBias: number;
  meshLength: number;
  meshWidth: number;
  meshPerSite: number;
  meshSpread: number;
  profile: ReadonlyArray<readonly [number, number]>;
  droop: number;
  fold: number;
  cardSize: readonly [number, number];
  cardsPerSite: number;
  clumpScale?: number;
  clumpCanopyBlend?: number;
}

export interface SpeciesPreset {
  label: string;
  height: readonly [number, number];
  trunkRadiusRatio: number;
  rootFlare: number;
  bark: {
    texture: BarkTextureKind;
    tint: readonly [number, number, number];
  };
  sides: readonly number[];
  levels: readonly BranchLevelSpec[];
  leaf: SpeciesLeafSpec;
}

export interface TreeLevelSetting {
  sideScale: number;
  leafKeep: number;
  leafScale: number;
  maximumBranchLevel: number;
  pointStride?: number;
  crownScale?: number;
}

const OVATE_LEAF: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.28, 0.85],
  [0.62, 0.95],
  [1, 0],
];
const NARROW_LEAF: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.3, 0.7],
  [0.65, 0.75],
  [1, 0],
];
const FIR_SPRAY: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.12, 0.55],
  [0.22, 0.4],
  [0.36, 0.85],
  [0.48, 0.6],
  [0.62, 1],
  [0.76, 0.7],
  [0.9, 0.5],
  [1, 0],
];

export const SPECIES: Record<TreeSpeciesName, SpeciesPreset> = {
  broadleaf: {
    label: 'Broadleaf (oak-like)',
    height: [8, 11],
    trunkRadiusRatio: 0.03,
    rootFlare: 1.45,
    bark: { texture: 'rough', tint: [0.5, 0.4, 0.31] },
    sides: [10, 7, 5, 4],
    levels: [
      {
        segments: 8,
        gnarl: 0.09,
        tropism: 0.02,
        tipRadius: 0.4,
        lean: 0.07,
        lengthScale: 0.66,
        children: {
          count: [6, 8],
          start: 0.34,
          end: 0.97,
          angle: [0.7, 1.15],
          lengthRatio: [0.42, 0.58],
          radiusRatio: 0.52,
          profile: 'crown',
        },
      },
      {
        segments: 5,
        gnarl: 0.16,
        tropism: 0.1,
        tipRadius: 0.35,
        children: {
          count: [3, 4],
          start: 0.3,
          end: 0.95,
          angle: [0.55, 0.95],
          lengthRatio: [0.4, 0.6],
          radiusRatio: 0.55,
        },
      },
      {
        segments: 3,
        gnarl: 0.2,
        tropism: 0.04,
        tipRadius: 0.4,
        children: {
          count: [2, 4],
          start: 0.3,
          end: 1,
          angle: [0.5, 0.9],
          lengthRatio: [0.35, 0.55],
          radiusRatio: 0.6,
        },
      },
      { segments: 2, gnarl: 0.25, tropism: -0.02, tipRadius: 0.3 },
    ],
    leaf: {
      texture: 'sprig',
      color: [64, 110, 36],
      foliageColor: [0.085, 0.24, 0.04],
      tint: [1.05, 1, 0.85],
      sitesPerMeter: 5,
      start: 0.2,
      upBias: 0.35,
      meshLength: 0.62,
      meshWidth: 0.4,
      meshPerSite: 4,
      meshSpread: 0.75,
      profile: OVATE_LEAF,
      droop: 0.28,
      fold: 0.14,
      cardSize: [1.05, 1.1],
      cardsPerSite: 2,
    },
  },
  birch: {
    label: 'Birch',
    height: [9, 12],
    trunkRadiusRatio: 0.018,
    rootFlare: 1.35,
    bark: { texture: 'birch', tint: [0.95, 0.94, 0.88] },
    sides: [8, 6, 4, 4],
    levels: [
      {
        segments: 10,
        gnarl: 0.05,
        tropism: 0.02,
        tipRadius: 0.3,
        lean: 0.05,
        lengthScale: 0.84,
        children: {
          count: [9, 12],
          start: 0.3,
          end: 0.98,
          angle: [0.42, 0.8],
          lengthRatio: [0.2, 0.34],
          radiusRatio: 0.38,
          profile: 'crown',
        },
      },
      {
        segments: 5,
        gnarl: 0.12,
        tropism: 0.06,
        tipRadius: 0.35,
        children: {
          count: [3, 4],
          start: 0.25,
          end: 0.95,
          angle: [0.5, 0.9],
          lengthRatio: [0.4, 0.55],
          radiusRatio: 0.55,
        },
      },
      {
        segments: 3,
        gnarl: 0.14,
        tropism: -0.12,
        tipRadius: 0.4,
        children: {
          count: [2, 4],
          start: 0.3,
          end: 1,
          angle: [0.5, 0.9],
          lengthRatio: [0.4, 0.55],
          radiusRatio: 0.6,
        },
      },
      { segments: 3, gnarl: 0.16, tropism: -0.22, tipRadius: 0.3 },
    ],
    leaf: {
      texture: 'sprig',
      color: [112, 150, 52],
      foliageColor: [0.2, 0.34, 0.06],
      tint: [1.05, 1.02, 0.85],
      sitesPerMeter: 5,
      start: 0.15,
      upBias: 0.1,
      meshLength: 0.42,
      meshWidth: 0.26,
      meshPerSite: 3,
      meshSpread: 0.8,
      profile: OVATE_LEAF,
      droop: 0.3,
      fold: 0.12,
      cardSize: [0.8, 0.85],
      cardsPerSite: 2,
    },
  },
  conifer: {
    label: 'Conifer (spruce-like)',
    height: [11, 15],
    trunkRadiusRatio: 0.021,
    rootFlare: 1.5,
    bark: { texture: 'rough', tint: [0.38, 0.27, 0.2] },
    sides: [10, 5, 4, 3],
    levels: [
      {
        segments: 12,
        gnarl: 0.015,
        tropism: 0.0,
        tipRadius: 0.06,
        lean: 0.02,
        lengthScale: 0.93,
        children: {
          whorls: 13,
          perWhorl: [4, 6],
          start: 0.14,
          end: 0.98,
          angle: [1.3, 1.6],
          lengthRatio: [0.27, 0.33],
          radiusRatio: 0.34,
          profile: 'cone',
        },
      },
      {
        segments: 5,
        gnarl: 0.05,
        tropism: -0.1,
        tipRadius: 0.3,
        children: {
          count: [6, 8],
          start: 0.12,
          end: 0.95,
          angle: [0.95, 1.2],
          lengthRatio: [0.2, 0.3],
          radiusRatio: 0.5,
          profile: 'cone',
        },
      },
      { segments: 2, gnarl: 0.05, tropism: -0.08, tipRadius: 0.4 },
    ],
    leaf: {
      texture: 'needles',
      color: [34, 78, 52],
      foliageColor: [0.03, 0.12, 0.07],
      tint: [0.9, 1, 0.95],
      sitesPerMeter: 3,
      start: 0.1,
      upBias: 0.15,
      meshLength: 0.7,
      meshWidth: 0.36,
      meshPerSite: 1,
      meshSpread: 0,
      profile: FIR_SPRAY,
      droop: 0.18,
      fold: 0.1,
      cardSize: [0.95, 0.95],
      cardsPerSite: 2,
    },
  },
  palm: {
    label: 'Palm',
    height: [6, 9],
    trunkRadiusRatio: 0.026,
    rootFlare: 1.4,
    bark: { texture: 'rough', tint: [0.46, 0.4, 0.33] },
    sides: [10, 4, 3, 3],
    levels: [
      {
        segments: 12,
        gnarl: 0.015,
        tropism: 0.0,
        tipRadius: 0.62,
        lean: 0.14,
        children: {
          count: [11, 14],
          start: 1,
          end: 1,
          angle: [0.2, 1.75],
          lengthRatio: [0.36, 0.46],
          radiusRatio: 0.1,
        },
      },
      { segments: 8, gnarl: 0.015, tropism: -0.42, tipRadius: 0.3, pairedLeaves: true },
    ],
    leaf: {
      texture: 'single',
      color: [70, 118, 40],
      foliageColor: [0.1, 0.27, 0.04],
      tint: [1.05, 1, 0.9],
      sitesPerMeter: 7,
      start: 0.14,
      upBias: 0.0,
      meshLength: 0.95,
      meshWidth: 0.16,
      meshPerSite: 1,
      meshSpread: 0,
      profile: NARROW_LEAF,
      droop: 0.35,
      fold: 0.1,
      cardSize: [0.28, 1.1],
      cardsPerSite: 1,
    },
  },
  bush: {
    label: 'Bush',
    height: [1.1, 1.9],
    trunkRadiusRatio: 0.018,
    rootFlare: 1.2,
    bark: { texture: 'rough', tint: [0.4, 0.32, 0.25] },
    sides: [5, 4, 3, 3],
    levels: [
      {
        segments: 3,
        gnarl: 0.05,
        tropism: 0.0,
        tipRadius: 0.8,
        lean: 0.0,
        lengthScale: 0.28,
        children: {
          count: [7, 10],
          start: 0.5,
          end: 1,
          angle: [0.35, 0.85],
          lengthRatio: [2, 2.8],
          radiusRatio: 0.55,
        },
      },
      {
        segments: 4,
        gnarl: 0.18,
        tropism: 0.1,
        tipRadius: 0.4,
        children: {
          count: [3, 4],
          start: 0.3,
          end: 1,
          angle: [0.6, 1.0],
          lengthRatio: [0.35, 0.5],
          radiusRatio: 0.6,
        },
      },
      {
        segments: 2,
        gnarl: 0.2,
        tropism: 0.02,
        tipRadius: 0.4,
        children: {
          count: [2, 3],
          start: 0.3,
          end: 1,
          angle: [0.6, 1.0],
          lengthRatio: [0.45, 0.65],
          radiusRatio: 0.6,
        },
      },
      { segments: 2, gnarl: 0.2, tropism: 0.0, tipRadius: 0.4 },
    ],
    leaf: {
      texture: 'sprig',
      color: [54, 104, 40],
      foliageColor: [0.06, 0.2, 0.045],
      tint: [1, 1, 0.9],
      sitesPerMeter: 9,
      start: 0.1,
      upBias: 0.3,
      meshLength: 0.22,
      meshWidth: 0.14,
      meshPerSite: 3,
      meshSpread: 0.9,
      profile: OVATE_LEAF,
      droop: 0.25,
      fold: 0.12,
      cardSize: [0.4, 0.42],
      cardsPerSite: 2,
      clumpScale: 0.5,
      clumpCanopyBlend: 0.3,
    },
  },
};

export const LEVEL_SETTINGS: readonly TreeLevelSetting[] = [
  { sideScale: 1, leafKeep: 1, leafScale: 1, maximumBranchLevel: Infinity },
  { sideScale: 0.6, leafKeep: 0.34, leafScale: 1.7, maximumBranchLevel: -1 },
  { sideScale: 0.4, leafKeep: 0, leafScale: 1, maximumBranchLevel: 1 },
  { sideScale: 0.25, leafKeep: 0, leafScale: 1, maximumBranchLevel: 1, pointStride: 3, crownScale: 1.5 },
];

export const TREE_LEVEL_DISTANCES: readonly number[] = [38, 95, 150];

export const TREE_LEVEL_GAINS: Record<
  TreeSpeciesName,
  {
    areaExponent: number;
    2: { color: number; sky: number; area: number };
    3: { color: number; sky: number; area: number };
  }
> = {
  palm: {
    areaExponent: 0.6,
    2: { color: 2.449, sky: 3.373, area: 0.8953 },
    3: { color: 2.492, sky: 3.613, area: 1.7062 },
  },
  broadleaf: {
    areaExponent: 0.45,
    2: { color: 1.832, sky: 1.644, area: 0.5478 },
    3: { color: 1.835, sky: 1.869, area: 1.3587 },
  },
  conifer: {
    areaExponent: 0.8,
    2: { color: 1.121, sky: 10.132, area: 0.1494 },
    3: { color: 1.21, sky: 11.362, area: 0.9604 },
  },
  birch: {
    areaExponent: 0.7,
    2: { color: 1.528, sky: 2.251, area: 0.7787 },
    3: { color: 1.615, sky: 2.49, area: 1.5896 },
  },
  bush: {
    areaExponent: 0.35,
    2: { color: 1.472, sky: 0.978, area: -1.4443 },
    3: { color: 1.418, sky: 1.47, area: -0.6334 },
  },
};

