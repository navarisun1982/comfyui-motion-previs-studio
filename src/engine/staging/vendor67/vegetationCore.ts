/**
 * Vendored & typed from codepawl/67.js `src/vegetation.js` (MIT License, Copyright (c) 2026 CodePawl).
 * Parametric recursive branching tree generator (`createTree`), grass tufts (`createGrassClump`),
 * flower patches (`createFlowerPatch`), and Poisson-disk spatial scattering (`poissonDiskPoints`).
 * Stripped of proprietary 67.js renderer side-effect imports and gl-matrix dependency.
 */

import * as THREE from 'three';
import {
  FULL_TURN,
  LeafFrame,
  MeshBuilder,
  RawGeometryBuffers,
  Vec3Tuple,
  WORLD_UP,
  addLeafSurface,
  addScaled,
  addTube,
  addVectors,
  clamp,
  createFrame,
  createLeafFrame,
  createMeshBuilder,
  createRandom,
  crossProduct,
  lerp,
  lerpVectors,
  normalized,
  randomInRange,
  scaleVector,
  subtractVectors,
  valueNoise,
  vectorLength,
} from './vegetationGeometry';
import {
  BarkTextureKind,
  BranchChildrenSpec,
  LEVEL_SETTINGS,
  LeafTextureKind,
  SPECIES,
  SpeciesLeafSpec,
  SpeciesPreset,
  TREE_LEVEL_DISTANCES,
  TreeLevelSetting,
  TreeSpeciesName,
} from './vegetationSpecies';

const BARK_TILE_SIZE = 0.6;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LEAF_COLOR_BASE: Vec3Tuple = [0.85, 0.95, 0.8];
const LEAF_COLOR_TIP: Vec3Tuple = [1.1, 1.05, 0.9];

interface BranchData {
  level: number;
  points: Vec3Tuple[];
  radii: number[];
  length: number;
}

interface LeafSite {
  position: Vec3Tuple;
  direction: Vec3Tuple;
  scale: number;
  roll: number;
}

interface TreeSkeleton {
  branches: BranchData[];
  leafSites: LeafSite[];
  crown: {
    center: Vec3Tuple;
    radius: number;
  };
}

export interface TreePartData {
  role: 'bark' | 'foliage';
  geometry: RawGeometryBuffers;
  barkTexture?: BarkTextureKind;
  barkTint?: readonly [number, number, number];
  leafTexture?: LeafTextureKind;
  leafColor?: readonly [number, number, number];
  leafTint?: readonly [number, number, number];
  foliageColor?: readonly [number, number, number];
  alphaCutout: boolean;
}

export interface TreeLevelData {
  parts: [TreePartData, TreePartData];
  triangles: number;
}

export interface GeneratedTreeData {
  kind: 'tree';
  species: TreeSpeciesName;
  seed: number;
  height: number;
  leaves: 'cards' | 'mesh';
  levels: TreeLevelData[];
  distances: readonly number[];
  bounds: { minimum: Vec3Tuple; maximum: Vec3Tuple };
}

function rotateAroundUp(vector: Vec3Tuple, angle: number): Vec3Tuple {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    vector[0] * cosine + vector[2] * sine,
    vector[1],
    -vector[0] * sine + vector[2] * cosine,
  ];
}

function randomUnitOffset(random: () => number): Vec3Tuple {
  return [random() - 0.5, random() - 0.5, random() - 0.5];
}

function sampleBranch(branch: BranchData, fraction: number) {
  const { points, radii } = branch;
  const scaled = clamp(fraction, 0, 1) * (points.length - 1);
  const index = Math.min(Math.floor(scaled), points.length - 2);
  const local = scaled - index;
  return {
    position: lerpVectors(points[index], points[index + 1], local),
    direction: normalized(subtractVectors(points[index + 1], points[index])),
    radius: lerp(radii[index], radii[index + 1], local),
  };
}

function lengthProfile(profile: 'crown' | 'cone' | undefined, progress: number): number {
  if (profile === 'crown') {
    return 0.62 + 0.38 * Math.sin(Math.PI * clamp(progress * 0.85 + 0.1, 0, 1));
  }
  if (profile === 'cone') return 1 - 0.9 * progress;
  return 1;
}

function createChildSlots(
  spec: BranchChildrenSpec,
  random: () => number
): Array<{ fraction: number; azimuth: number }> {
  const slots: Array<{ fraction: number; azimuth: number }> = [];
  if (spec.whorls && spec.perWhorl) {
    for (let whorl = 0; whorl < spec.whorls; whorl++) {
      const fraction = lerp(spec.start, spec.end, spec.whorls > 1 ? whorl / (spec.whorls - 1) : 0);
      const count = Math.round(randomInRange(random, spec.perWhorl));
      for (let member = 0; member < count; member++) {
        slots.push({
          fraction,
          azimuth: (member / count) * FULL_TURN + whorl * 0.9 + (random() - 0.5) * 0.5,
        });
      }
    }
    return slots;
  }
  const count = Math.round(randomInRange(random, spec.count ?? [3, 4]));
  for (let index = 0; index < count; index++) {
    slots.push({
      fraction: lerp(spec.start, spec.end, (index + random() * 0.5) / count),
      azimuth: index * 2.399963 + random() * 0.5,
    });
  }
  return slots;
}

function describeCrown(leafSites: LeafSite[]): { center: Vec3Tuple; radius: number } {
  if (leafSites.length === 0) {
    return { center: [0, 4, 0], radius: 1 };
  }
  const center = scaleVector(
    leafSites.reduce<Vec3Tuple>((sum, site) => addVectors(sum, site.position), [0, 0, 0]),
    1 / leafSites.length
  );
  const radius = Math.max(
    ...leafSites.map((site) => vectorLength(subtractVectors(site.position, center))),
    0.1
  );
  return { center, radius };
}

function growSkeleton(preset: SpeciesPreset, height: number, random: () => number): TreeSkeleton {
  const lastLevel = preset.levels.length - 1;
  const branches: BranchData[] = [];
  const leafSites: LeafSite[] = [];

  function addLeafSites(branch: BranchData) {
    const spec = preset.leaf;
    const paired = preset.levels[branch.level].pairedLeaves;
    const count = Math.max(2, Math.round(branch.length * spec.sitesPerMeter));
    for (let index = 0; index < count; index++) {
      const sample = sampleBranch(branch, lerp(spec.start, 1, index / (count - 1)));
      const sideAxis = normalized(crossProduct(sample.direction, WORLD_UP));
      const directions: Vec3Tuple[] = paired
        ? ([-1, 1] as const).map((side) =>
            normalized(
              addVectors(scaleVector(sample.direction, 0.5), scaleVector(sideAxis, 0.85 * side))
            )
          )
        : [
            normalized(
              addVectors(
                addVectors(sample.direction, scaleVector(WORLD_UP, spec.upBias)),
                scaleVector(randomUnitOffset(random), 0.9)
              )
            ),
          ];
      for (const direction of directions) {
        leafSites.push({
          position: sample.position,
          direction,
          scale: 0.8 + random() * 0.45,
          roll: (random() - 0.5) * 0.8,
        });
      }
    }
  }

  function spawnChildren(branch: BranchData, spec: BranchChildrenSpec) {
    for (const slot of createChildSlots(spec, random)) {
      const sample = sampleBranch(branch, slot.fraction);
      const frame = createFrame(sample.direction);
      const axis = addVectors(
        scaleVector(frame.first, Math.cos(slot.azimuth)),
        scaleVector(frame.second, Math.sin(slot.azimuth))
      );
      const angle = randomInRange(random, spec.angle);
      const direction = normalized(
        addVectors(
          scaleVector(sample.direction, Math.cos(angle)),
          scaleVector(axis, Math.sin(angle))
        )
      );
      const progress = (slot.fraction - spec.start) / Math.max(spec.end - spec.start, 1e-6);
      growBranch({
        origin: sample.position,
        direction,
        length:
          branch.length *
          randomInRange(random, spec.lengthRatio) *
          lengthProfile(spec.profile, progress),
        radius: sample.radius * spec.radiusRatio,
        level: branch.level + 1,
      });
    }
  }

  function growBranch({
    origin,
    direction,
    length,
    radius,
    level,
  }: {
    origin: Vec3Tuple;
    direction: Vec3Tuple;
    length: number;
    radius: number;
    level: number;
  }) {
    const parameters = preset.levels[level];
    const points: Vec3Tuple[] = [origin];
    const radii: number[] = [radius];
    const stepLength = length / parameters.segments;
    let current = direction;
    for (let step = 1; step <= parameters.segments; step++) {
      const wander = scaleVector(randomUnitOffset(random), parameters.gnarl * 2);
      current = normalized(
        addVectors(addVectors(current, wander), [0, parameters.tropism, 0])
      );
      points.push(addScaled(points[step - 1], current, stepLength));
      radii.push(radius * lerp(1, parameters.tipRadius, step / parameters.segments));
    }
    const branch: BranchData = { level, points, radii, length };
    branches.push(branch);
    if (parameters.children) spawnChildren(branch, parameters.children);
    if (level === lastLevel) addLeafSites(branch);
  }

  const trunkSettings = preset.levels[0];
  const leanAngle = random() * FULL_TURN;
  const lean = trunkSettings.lean ?? 0;
  growBranch({
    origin: [0, 0, 0],
    direction: normalized([Math.cos(leanAngle) * lean, 1, Math.sin(leanAngle) * lean]),
    length: height * (trunkSettings.lengthScale ?? 1),
    radius: height * preset.trunkRadiusRatio,
    level: 0,
  });
  return { branches, leafSites, crown: describeCrown(leafSites) };
}

function thinnedRings(points: Vec3Tuple[], radii: number[], stride: number) {
  const kept = points
    .map((_, index) => index)
    .filter((index) => index % stride === 0 || index === points.length - 1);
  return {
    points: kept.map((index) => points[index]),
    radii: kept.map((index) => radii[index]),
  };
}

function buildBark(
  skeleton: TreeSkeleton,
  preset: SpeciesPreset,
  setting: TreeLevelSetting,
  tileSize: number
): RawGeometryBuffers {
  const lastLevel = preset.levels.length - 1;
  const maximumLevel =
    setting.maximumBranchLevel < 0
      ? lastLevel + setting.maximumBranchLevel
      : setting.maximumBranchLevel;
  const builder = createMeshBuilder();
  for (const branch of skeleton.branches) {
    if (branch.level > maximumLevel) continue;
    const baseSides = preset.sides[Math.min(branch.level, preset.sides.length - 1)];
    const sides = Math.max(3, Math.round(baseSides * setting.sideScale));
    let { points, radii } = branch;
    if (setting.pointStride && setting.pointStride > 1) {
      ({ points, radii } = thinnedRings(points, radii, setting.pointStride));
    }
    if (branch.level === 0) {
      const direction = normalized(subtractVectors(points[1], points[0]));
      points = [addScaled(points[0], direction, -0.3), ...points];
      radii = [radii[0] * preset.rootFlare, ...radii];
    }
    addTube(builder, points, radii, sides, tileSize, [1, 1, 1], { worldScaleUv: false });
  }
  return builder.build();
}

function crownShading(skeleton: TreeSkeleton, position: Vec3Tuple) {
  const { center, radius } = skeleton.crown;
  const offset = subtractVectors(position, center);
  const distanceFraction = clamp(vectorLength(offset) / radius, 0, 1);
  const heightFraction = clamp((offset[1] / radius) * 0.5 + 0.5, 0, 1);
  return {
    brightness: lerp(0.55, 1.1, distanceFraction ** 0.8) + 0.12 * heightFraction,
    canopyNormal: normalized(addVectors(normalized(offset), scaleVector(WORLD_UP, 0.35))),
  };
}

function addMeshLeaves(
  builder: MeshBuilder,
  skeleton: TreeSkeleton,
  spec: SpeciesLeafSpec,
  site: LeafSite,
  scale: number,
  random: () => number
) {
  const { brightness, canopyNormal } = crownShading(skeleton, site.position);
  for (let index = 0; index < spec.meshPerSite; index++) {
    const yaw = (index - (spec.meshPerSite - 1) / 2) * spec.meshSpread;
    const direction = normalized(
      addScaled(rotateAroundUp(site.direction, yaw), WORLD_UP, (random() - 0.5) * 0.5)
    );
    const length = spec.meshLength * site.scale * scale;
    addLeafSurface(builder, {
      origin: site.position,
      frame: createLeafFrame(direction, site.roll + (random() - 0.5) * 0.6),
      length,
      width: spec.meshWidth * site.scale * scale,
      rows: spec.profile,
      droop: spec.droop,
      fold: spec.fold,
      canopyNormal,
      canopyBlend: 0.45,
      colorBase: LEAF_COLOR_BASE,
      colorTip: LEAF_COLOR_TIP,
      brightness: (brightness * (0.9 + random() * 0.2)) / 1.5,
    });
  }
}

function addCards(
  builder: MeshBuilder,
  skeleton: TreeSkeleton,
  spec: SpeciesLeafSpec,
  site: LeafSite,
  scale: number,
  random: () => number
) {
  const { brightness, canopyNormal } = crownShading(skeleton, site.position);
  const firstRoll = (random() - 0.5) * 0.6;
  for (let index = 0; index < spec.cardsPerSite; index++) {
    addLeafSurface(builder, {
      origin: site.position,
      frame: createLeafFrame(
        site.direction,
        firstRoll + index * (Math.PI / 2 + (random() - 0.5) * 0.5)
      ),
      length: spec.cardSize[1] * site.scale * scale,
      width: spec.cardSize[0] * site.scale * scale,
      rows: [
        [0, 1],
        [0.5, 1],
        [1, 1],
      ],
      backFaces: false,
      droop: 0.12,
      canopyNormal,
      canopyBlend: 0.55,
      colorBase: LEAF_COLOR_BASE,
      colorTip: LEAF_COLOR_TIP,
      brightness: brightness * (0.9 + random() * 0.2),
    });
  }
}

function addBlob(
  builder: MeshBuilder,
  center: Vec3Tuple,
  radius: number,
  brightness: number = 1
) {
  const segments = 8;
  const rings = 5;
  const firstVertex = builder.vertexCount;
  for (let ring = 0; ring <= rings; ring++) {
    const polar = (ring / rings) * Math.PI;
    for (let segment = 0; segment <= segments; segment++) {
      const azimuth = ((segment % segments) / segments) * FULL_TURN;
      const direction: Vec3Tuple = [
        Math.sin(polar) * Math.cos(azimuth),
        Math.cos(polar),
        Math.sin(polar) * Math.sin(azimuth),
      ];
      const jitter =
        1 +
        (valueNoise(direction[0] * 2 + center[0], direction[2] * 2 + center[2], 3) - 0.5) * 0.5;
      const position: Vec3Tuple = [
        center[0] + direction[0] * radius * jitter,
        center[1] + direction[1] * radius * 0.8 * jitter,
        center[2] + direction[2] * radius * jitter,
      ];
      const color = scaleVector(LEAF_COLOR_BASE, brightness);
      builder.addVertex(position, direction, segment / segments, ring / rings, color);
    }
  }
  const ringSize = segments + 1;
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const current = firstVertex + ring * ringSize + segment;
      builder.addTriangle(current, current + 1, current + ringSize);
      builder.addTriangle(current + ringSize, current + 1, current + ringSize + 1);
    }
  }
}

function addCrownClumps(
  builder: MeshBuilder,
  skeleton: TreeSkeleton,
  spec: SpeciesLeafSpec,
  mode: 'cards' | 'mesh',
  widthScale: number = 1
) {
  const cellSize = skeleton.crown.radius / 2.1;
  const cells = new Map<string, LeafSite[]>();
  for (const site of skeleton.leafSites) {
    const key = site.position.map((value) => Math.floor(value / cellSize)).join(',');
    const list = cells.get(key);
    if (list) list.push(site);
    else cells.set(key, [site]);
  }
  let clumpIndex = 0;
  for (const sites of cells.values()) {
    const center = scaleVector(
      sites.reduce<Vec3Tuple>((sum, site) => addVectors(sum, site.position), [0, 0, 0]),
      1 / sites.length
    );
    const yaw = clumpIndex * GOLDEN_ANGLE;
    clumpIndex++;
    const shading = crownShading(skeleton, center);
    const radius =
      cellSize * (0.55 + 0.1 * Math.min(sites.length, 5)) * widthScale * (spec.clumpScale ?? 1);
    if (mode === 'mesh') {
      addBlob(builder, center, radius, shading.brightness / 1.5);
      continue;
    }
    for (let card = 0; card < 3; card++) {
      const direction: Vec3Tuple =
        card === 2
          ? WORLD_UP
          : [Math.cos(card * 1.9 + center[0]), 0.15, Math.sin(card * 1.9 + center[2])];
      addLeafSurface(builder, {
        origin: addScaled(center, normalized(direction), -radius),
        frame: createLeafFrame(normalized(direction), card === 2 ? yaw : 0),
        length: radius * 2,
        width: radius * 2,
        rows: [
          [0, 1],
          [1, 1],
        ],
        backFaces: false,
        canopyNormal: shading.canopyNormal,
        canopyBlend: spec.clumpCanopyBlend ?? 0,
        colorBase: LEAF_COLOR_BASE,
        colorTip: LEAF_COLOR_TIP,
        brightness: shading.brightness,
      });
    }
  }
}

function buildFoliage(
  skeleton: TreeSkeleton,
  preset: SpeciesPreset,
  mode: 'cards' | 'mesh',
  setting: TreeLevelSetting,
  random: () => number
): RawGeometryBuffers {
  const builder = createMeshBuilder({ withColors: true });
  if (setting.leafKeep === 0) {
    addCrownClumps(builder, skeleton, preset.leaf, mode, setting.crownScale ?? 1);
    return builder.build();
  }
  const stride = Math.round(1 / setting.leafKeep);
  skeleton.leafSites.forEach((site, index) => {
    if (index % stride !== 0) return;
    if (mode === 'mesh') addMeshLeaves(builder, skeleton, preset.leaf, site, setting.leafScale, random);
    else addCards(builder, skeleton, preset.leaf, site, setting.leafScale, random);
  });
  return builder.build();
}

function boundsOf(geometries: RawGeometryBuffers[]): { minimum: Vec3Tuple; maximum: Vec3Tuple } {
  const minimum: Vec3Tuple = [Infinity, Infinity, Infinity];
  const maximum: Vec3Tuple = [-Infinity, -Infinity, -Infinity];
  for (const geometry of geometries) {
    for (let offset = 0; offset < geometry.positions.length; offset++) {
      const axis = offset % 3;
      minimum[axis] = Math.min(minimum[axis], geometry.positions[offset]);
      maximum[axis] = Math.max(maximum[axis], geometry.positions[offset]);
    }
  }
  return { minimum, maximum };
}

/**
 * Grows one genuine 67.js parametric recursive branching tree across 4 LOD levels.
 */
export function createTree(
  speciesOrOptions:
    | TreeSpeciesName
    | {
        species: TreeSpeciesName;
        height?: number;
        leaves?: 'cards' | 'mesh';
        barkTileSize?: number;
      } = 'broadleaf',
  seed: number = 1
): GeneratedTreeData {
  const options =
    typeof speciesOrOptions === 'string' ? { species: speciesOrOptions } : { ...speciesOrOptions };
  const preset = SPECIES[options.species];
  if (!preset) throw new RangeError(`Unknown tree species: ${options.species}`);
  const leaves = options.leaves ?? 'cards';
  const random = createRandom(seed * 7919 + 17);
  const height = options.height ?? randomInRange(random, preset.height);
  const skeleton = growSkeleton(preset, height, random);
  const tileSize = options.barkTileSize ?? BARK_TILE_SIZE;

  const levels: TreeLevelData[] = LEVEL_SETTINGS.map((setting, levelIndex) => {
    const levelRandom = createRandom(seed * 104729 + levelIndex);
    const barkGeometry = buildBark(skeleton, preset, setting, tileSize);
    const foliageGeometry = buildFoliage(skeleton, preset, leaves, setting, levelRandom);
    const isClumpLevel = setting.leafKeep === 0;

    const barkPart: TreePartData = {
      role: 'bark',
      geometry: barkGeometry,
      barkTexture: preset.bark.texture,
      barkTint: preset.bark.tint,
      alphaCutout: false,
    };

    const foliagePart: TreePartData = {
      role: 'foliage',
      geometry: foliageGeometry,
      leafTexture: isClumpLevel ? 'clump' : preset.leaf.texture,
      leafColor: preset.leaf.color,
      leafTint: preset.leaf.tint,
      foliageColor: preset.leaf.foliageColor,
      alphaCutout: leaves === 'cards',
    };

    return {
      parts: [barkPart, foliagePart],
      triangles:
        barkGeometry.indices.length / 3 + foliageGeometry.indices.length / 3,
    };
  });

  return {
    kind: 'tree',
    species: options.species,
    seed,
    height,
    leaves,
    levels,
    distances: TREE_LEVEL_DISTANCES,
    bounds: boundsOf(levels[0].parts.map((p) => p.geometry)),
  };
}

/**
 * Builds curved swaying grass blade tufts (`createGrassClump` from 67.js).
 */
export function createGrassClumpGeometry({
  blades = 14,
  height = 0.45,
  radius = 0.14,
  widthScale = 1.2,
  seed = 1,
}: {
  blades?: number;
  height?: number;
  radius?: number;
  widthScale?: number;
  seed?: number;
} = {}): RawGeometryBuffers {
  const random = createRandom(seed * 6271 + 5);
  const builder = createMeshBuilder({ withColors: true });
  for (let blade = 0; blade < blades; blade++) {
    const azimuth = random() * FULL_TURN;
    const distance = Math.sqrt(random()) * radius;
    const lean = 0.2 + random() * 0.4;
    addLeafSurface(builder, {
      origin: [Math.cos(azimuth) * distance, 0, Math.sin(azimuth) * distance],
      frame: createLeafFrame(
        normalized([Math.cos(azimuth) * lean, 1, Math.sin(azimuth) * lean]),
        random() * FULL_TURN
      ),
      length: height * (0.6 + random() * 0.6),
      width: 0.045 * widthScale * (0.8 + random() * 0.5),
      rows: [
        [0, 1],
        [0.35, 0.85],
        [0.7, 0.5],
        [1, 0],
      ],
      droop: 0.3 + random() * 0.4,
      canopyNormal: WORLD_UP,
      canopyBlend: 0.55,
      colorBase: [0.22, 0.38, 0.16],
      colorTip: [0.58, 0.72, 0.34],
    });
  }
  return builder.build();
}

/**
 * Builds a small wildflower patch with curved stems and 6-petal blossoms (`createFlowerPatch` from 67.js).
 */
export function createFlowerPatchGeometry({
  flowers = 5,
  height = 0.4,
  color = [0.95, 0.8, 0.25] as Vec3Tuple,
  seed = 1,
}: {
  flowers?: number;
  height?: number;
  color?: Vec3Tuple;
  seed?: number;
} = {}): RawGeometryBuffers {
  const random = createRandom(seed * 3571 + 11);
  const builder = createMeshBuilder({ withColors: true });
  const stemColor: Vec3Tuple = [0.16, 0.3, 0.07];
  for (let flower = 0; flower < flowers; flower++) {
    const azimuth = random() * FULL_TURN;
    const distance = Math.sqrt(random()) * 0.14;
    const base: Vec3Tuple = [Math.cos(azimuth) * distance, 0, Math.sin(azimuth) * distance];
    const stemHeight = height * (0.7 + random() * 0.5);
    const lean: Vec3Tuple = [(random() - 0.5) * 0.12, 0, (random() - 0.5) * 0.12];
    const top = addVectors(addVectors(base, [0, stemHeight, 0]), lean);
    const middle = addVectors(lerpVectors(base, top, 0.5), scaleVector(lean, 0.6));
    addTube(builder, [base, middle, top], [0.006, 0.005, 0.004], 3, 0.3, stemColor);
    const petals = 6;
    for (let petal = 0; petal < petals; petal++) {
      const angle = (petal / petals) * FULL_TURN;
      const forward = normalized([Math.cos(angle), 0.3, Math.sin(angle)]);
      const lf: LeafFrame = createLeafFrame(forward, 0);
      addLeafSurface(builder, {
        origin: top,
        frame: lf,
        length: 0.06,
        width: 0.044,
        rows: [
          [0, 0.5],
          [0.5, 1],
          [1, 0.5],
        ],
        canopyNormal: WORLD_UP,
        canopyBlend: 0.5,
        colorBase: color,
        colorTip: color,
      });
    }
    addBlob(builder, addScaled(top, WORLD_UP, 0.004), 0.015);
  }
  return builder.build();
}

/**
 * Bridson multi-restart Poisson-disk spatial point sampler from 67.js `src/vegetation.js`
 * (restarts allow natural coverage across regions split by camera sightline exclusion cones).
 */
export function poissonDiskPoints(
  area: { minX: number; maxX: number; minZ: number; maxZ: number },
  radius: number,
  random: () => number,
  accept: (point: [number, number]) => boolean
): Array<[number, number]> {
  const cellSize = radius / Math.SQRT2;
  const columns = Math.ceil((area.maxX - area.minX) / cellSize) + 1;
  const rows = Math.ceil((area.maxZ - area.minZ) / cellSize) + 1;
  const grid = new Int32Array(columns * rows).fill(-1);
  const points: Array<[number, number]> = [];

  const cellOf = (point: [number, number]): [number, number] => [
    Math.floor((point[0] - area.minX) / cellSize),
    Math.floor((point[1] - area.minZ) / cellSize),
  ];

  const isFree = (point: [number, number]): boolean => {
    if (
      point[0] < area.minX ||
      point[0] > area.maxX ||
      point[1] < area.minZ ||
      point[1] > area.maxZ
    ) {
      return false;
    }
    const [column, row] = cellOf(point);
    for (let rowOffset = -2; rowOffset <= 2; rowOffset++) {
      for (let columnOffset = -2; columnOffset <= 2; columnOffset++) {
        const neighborColumn = column + columnOffset;
        const neighborRow = row + rowOffset;
        if (
          neighborColumn < 0 ||
          neighborRow < 0 ||
          neighborColumn >= columns ||
          neighborRow >= rows
        ) {
          continue;
        }
        const neighbor = grid[neighborRow * columns + neighborColumn];
        if (
          neighbor >= 0 &&
          Math.hypot(points[neighbor][0] - point[0], points[neighbor][1] - point[1]) < radius
        ) {
          return false;
        }
      }
    }
    return accept(point);
  };

  const insert = (point: [number, number]) => {
    const [column, row] = cellOf(point);
    grid[row * columns + column] = points.length;
    points.push(point);
  };

  for (let restart = 0; restart < 24; restart++) {
    const start: [number, number] = [
      lerp(area.minX, area.maxX, random()),
      lerp(area.minZ, area.maxZ, random()),
    ];
    if (!isFree(start)) continue;
    const active = [points.length];
    insert(start);
    while (active.length) {
      const activeIndex = Math.floor(random() * active.length);
      const origin = points[active[activeIndex]];
      let placed = false;
      for (let attempt = 0; attempt < 24 && !placed; attempt++) {
        const angle = random() * FULL_TURN;
        const distance = radius * (1 + random());
        const candidate: [number, number] = [
          origin[0] + Math.cos(angle) * distance,
          origin[1] + Math.sin(angle) * distance,
        ];
        if (!isFree(candidate)) continue;
        active.push(points.length);
        insert(candidate);
        placed = true;
      }
      if (!placed) active.splice(activeIndex, 1);
    }
  }

  return points;
}

/**
 * Spatial patch-weighted species selector from 67.js `src/vegetation.js`.
 */
export function chooseSpecies<T extends string>(
  speciesNames: readonly T[],
  weights: Record<T, number>,
  x: number,
  z: number,
  seed: number,
  random: () => number
): T {
  const scores = speciesNames.map(
    (name, index) => weights[name] * (0.15 + valueNoise(x / 22, z / 22, seed + index * 17)) ** 2
  );
  let pick = random() * scores.reduce((total, score) => total + score, 0);
  for (let index = 0; index < scores.length; index++) {
    pick -= scores[index];
    if (pick <= 0) return speciesNames[index];
  }
  return speciesNames[speciesNames.length - 1];
}

/**
 * Converts 67.js plain-data geometry buffers into a native THREE.BufferGeometry.
 */
export function rawBuffersToThreeGeometry(raw: RawGeometryBuffers): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(raw.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(raw.normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(raw.uvs, 2));
  if (raw.colors) {
    geo.setAttribute('color', new THREE.BufferAttribute(raw.colors, 3));
  }
  geo.setIndex(new THREE.BufferAttribute(raw.indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

