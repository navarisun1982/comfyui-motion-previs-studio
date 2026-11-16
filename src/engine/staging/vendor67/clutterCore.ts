/**
 * Vendored & typed from codepawl/67.js `src/clutter.js` and `src/tile-field.js`
 * (MIT License, Copyright (c) 2026 CodePawl).
 * Ground clutter generator: noise-displaced stones cut by random chipping planes,
 * rounded pebbles, curved twigs, and cupped fallen leaves with soil-line AO and upper-surface moss.
 */

import {
  FULL_TURN,
  MeshBuilder,
  RawGeometryBuffers,
  Vec3Tuple,
  addTube,
  clamp,
  createMeshBuilder,
  createRandom,
  crossProduct,
  lerp,
  lerpVectors,
  normalized,
  valueNoise,
} from './vegetationGeometry';

export type ClutterPresetName = 'meadow' | 'forest' | 'riverbed' | 'scree';

export interface ClutterPresetSpec {
  pebbles: number;
  rocks: number;
  twigs: number;
  leaves: number;
  moss: number;
}

export const CLUTTER_PRESETS: Record<ClutterPresetName, ClutterPresetSpec> = {
  meadow: { pebbles: 0.8, rocks: 0.03, twigs: 0.08, leaves: 0.3, moss: 0.4 },
  forest: { pebbles: 0.5, rocks: 0.06, twigs: 1.2, leaves: 16, moss: 0.8 },
  riverbed: { pebbles: 14, rocks: 0.6, twigs: 0.15, leaves: 0.1, moss: 0.15 },
  scree: { pebbles: 12, rocks: 1.4, twigs: 0, leaves: 0, moss: 0.05 },
};

const ROCK_DETAIL = [
  { segments: 7, rings: 5 },
  { segments: 12, rings: 7 },
] as const;

const PEBBLE_DETAIL = [
  { segments: 5, rings: 3 },
  { segments: 7, rings: 5 },
] as const;

export function hashTile(seed: number, column: number, row: number): number {
  let mixed =
    Math.imul(column + 7919, 374761393) ^
    Math.imul(row - 104729, 668265263) ^
    Math.imul(seed, 2246822519);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 1274126177);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function smoothstep(edgeLow: number, edgeHigh: number, value: number): number {
  const amount = clamp((value - edgeLow) / (edgeHigh - edgeLow), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function groundNormal(
  terrainHeight: (x: number, z: number) => number,
  x: number,
  z: number
): Vec3Tuple {
  const step = 0.25;
  const slopeX = terrainHeight(x + step, z) - terrainHeight(x - step, z);
  const slopeZ = terrainHeight(x, z + step) - terrainHeight(x, z - step);
  return normalized([-slopeX, 2 * step, -slopeZ]);
}

function groundFrame(up: Vec3Tuple, yaw: number) {
  const heading: Vec3Tuple = [Math.cos(yaw), 0, Math.sin(yaw)];
  const side = normalized(crossProduct(heading, up));
  const forward = normalized(crossProduct(up, side));
  return { up, forward, side };
}

function placeInFrame(
  frame: { up: Vec3Tuple; forward: Vec3Tuple; side: Vec3Tuple },
  origin: Vec3Tuple,
  local: Vec3Tuple
): Vec3Tuple {
  return [
    origin[0] + frame.forward[0] * local[0] + frame.up[0] * local[1] + frame.side[0] * local[2],
    origin[1] + frame.forward[1] * local[0] + frame.up[1] * local[1] + frame.side[1] * local[2],
    origin[2] + frame.forward[2] * local[0] + frame.up[2] * local[1] + frame.side[2] * local[2],
  ];
}

interface StoneShape {
  roughness: number;
  phases: [number, number, number, number];
  planes: Array<{ normal: Vec3Tuple; distance: number }>;
  colorSeed: number;
  height: number;
  base: Vec3Tuple;
  grain: number;
}

/** Radius multiplier of a stone along `direction`: smooth noise, then flat chipped faces from cutting planes. */
function stoneRadius(direction: Vec3Tuple, stone: StoneShape): number {
  const [x, y, z] = direction;
  const phases = stone.phases;
  let radius =
    1 +
    stone.roughness *
      (Math.sin(x * 2.6 + phases[0]) * Math.sin(y * 2.6 + phases[1]) +
        0.5 * Math.sin(z * 4.4 + phases[2]) * Math.cos(x * 3.4 + phases[3]));
  for (const plane of stone.planes) {
    const facing = x * plane.normal[0] + y * plane.normal[1] + z * plane.normal[2];
    if (facing > 0.05) radius = Math.min(radius, plane.distance / facing);
  }
  return radius;
}

export interface ClutterBuildSettings {
  preset?: ClutterPresetName;
  seed?: number;
  detail?: 0 | 1;
  rockCount?: number;
  pebbleCount?: number;
  twigCount?: number;
  leafCount?: number;
  rockSize?: readonly [number, number];
  pebbleSize?: readonly [number, number];
  stoneColor?: Vec3Tuple;
  mossColor?: Vec3Tuple;
  soilColor?: Vec3Tuple;
  twigColor?: Vec3Tuple;
  leafColors?: ReadonlyArray<Vec3Tuple>;
  moss?: number;
  clumping?: number;
  area: { minX: number; maxX: number; minZ: number; maxZ: number };
  terrainHeight: (x: number, z: number) => number;
  exclude?: (x: number, z: number) => boolean;
}

interface ResolvedInternalClutter {
  seed: number;
  detail: 0 | 1;
  rockSize: readonly [number, number];
  pebbleSize: readonly [number, number];
  stoneColor: Vec3Tuple;
  mossColor: Vec3Tuple;
  soilColor: Vec3Tuple;
  twigColor: Vec3Tuple;
  leafColors: ReadonlyArray<Vec3Tuple>;
  moss: number;
  clumping: number;
  terrainHeight: (x: number, z: number) => number;
}

function stoneColor(
  normal: Vec3Tuple,
  localPoint: Vec3Tuple,
  heightAboveGround: number,
  stone: StoneShape,
  vertexIndex: number,
  settings: ResolvedInternalClutter,
  isRock: boolean
): Vec3Tuple {
  const underside = lerp(0.45, 1, smoothstep(-0.6, 0.7, normal[1]));
  const speckle = lerp(0.82, 1.12, (hashTile(stone.colorSeed, vertexIndex, 3) & 1023) / 1023);
  const blotch = valueNoise(
    localPoint[0] * stone.grain + localPoint[1] * 0.7 * stone.grain,
    localPoint[2] * stone.grain,
    stone.colorSeed
  );
  const stain = lerp(0.6, 1.25, blotch);
  let color: Vec3Tuple = [
    stone.base[0] * underside * speckle * stain,
    stone.base[1] * underside * speckle * stain,
    stone.base[2] * underside * speckle * stain,
  ];
  // Soil clings to the stone where it meets the ground.
  const soil = 1 - smoothstep(0, stone.height * 0.35, heightAboveGround);
  color = lerpVectors(color, settings.soilColor, soil * 0.7);

  // Upper-hemisphere moss cushion on chipped rock faces (matching 67.js world-material moss layer)
  if (isRock && settings.moss > 0.02) {
    const mossPatch = valueNoise(
      localPoint[0] * 3.1 + 4.7,
      localPoint[2] * 3.1 - 2.3,
      stone.colorSeed + 29
    );
    const upward = smoothstep(0.32, 0.76, normal[1] + (mossPatch - 0.5) * 0.45);
    const mossAmount = clamp(upward * settings.moss * (1 - soil * 0.6), 0, 0.92);
    if (mossAmount > 0.01) {
      color = lerpVectors(color, settings.mossColor, mossAmount);
    }
  }
  return color;
}

function addStone(
  builder: MeshBuilder,
  kind: 'rocks' | 'pebbles',
  x: number,
  z: number,
  rolls: readonly number[],
  settings: ResolvedInternalClutter
): void {
  const isRock = kind === 'rocks';
  const { segments, rings } = (isRock ? ROCK_DETAIL : PEBBLE_DETAIL)[settings.detail];
  const sizeRange = isRock ? settings.rockSize : settings.pebbleSize;
  const radius = lerp(sizeRange[0], sizeRange[1], rolls[0] ** 2.1);
  const random = createRandom(hashTile(settings.seed, Math.floor(x * 977), Math.floor(z * 977)));
  const stone: StoneShape = {
    roughness: isRock ? 0.16 : 0.08,
    phases: [
      random() * FULL_TURN,
      random() * FULL_TURN,
      random() * FULL_TURN,
      random() * FULL_TURN,
    ],
    planes: [],
    colorSeed: hashTile(settings.seed + 17, Math.floor(x * 977), Math.floor(z * 977)),
    height: radius * lerp(0.45, 0.78, rolls[1]),
    base: [0.3, 0.3, 0.3],
    grain: lerp(2.5, 5, random()),
  };
  if (isRock) {
    for (let plane = 0; plane < 4; plane++) {
      const theta = random() * FULL_TURN;
      const lift = random() * 1.6 - 0.4;
      stone.planes.push({
        normal: normalized([Math.cos(theta), lift, Math.sin(theta)]),
        distance: lerp(0.68, 0.9, random()),
      });
    }
  }
  const tone = lerp(0.62, 1.38, rolls[2]);
  const warmth = rolls[3] * 2 - 1;
  stone.base = [
    settings.stoneColor[0] * tone * (1 + warmth * 0.22),
    settings.stoneColor[1] * tone * (1 + warmth * 0.04),
    settings.stoneColor[2] * tone * (1 - warmth * 0.26),
  ];
  const scale: Vec3Tuple = [
    radius * lerp(0.75, 1.15, rolls[4]),
    stone.height,
    radius * lerp(0.72, 1.05, rolls[5]),
  ];
  const ground = settings.terrainHeight(x, z);
  const frame = groundFrame(groundNormal(settings.terrainHeight, x, z), rolls[5] * FULL_TURN);
  const sink = lerp(0.28, 0.46, rolls[1]);
  const center: Vec3Tuple = [x, ground + stone.height * (1 - 2 * sink), z];

  const directions: Vec3Tuple[] = [[0, 1, 0]];
  for (let ring = 1; ring < rings; ring++) {
    const polar = (Math.PI * ring) / rings;
    for (let segment = 0; segment < segments; segment++) {
      const azimuth = (FULL_TURN * segment) / segments;
      directions.push([
        Math.sin(polar) * Math.cos(azimuth),
        Math.cos(polar),
        Math.sin(polar) * Math.sin(azimuth),
      ]);
    }
  }
  directions.push([0, -1, 0]);

  const localPoints: Vec3Tuple[] = directions.map((direction) => {
    const distance = stoneRadius(direction, stone);
    return [
      direction[0] * distance * scale[0],
      direction[1] * distance * scale[1],
      direction[2] * distance * scale[2],
    ];
  });

  const triangles: Array<[number, number, number]> = [];
  const ringStart = (ring: number) => 1 + (ring - 1) * segments;
  const bottom = directions.length - 1;
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    triangles.push([0, ringStart(1) + next, ringStart(1) + segment]);
    for (let ring = 1; ring < rings - 1; ring++) {
      const upper = ringStart(ring);
      const lower = ringStart(ring + 1);
      triangles.push([upper + segment, upper + next, lower + segment]);
      triangles.push([upper + next, lower + next, lower + segment]);
    }
    const last = ringStart(rings - 1);
    triangles.push([last + segment, last + next, bottom]);
  }

  const localNormals: Vec3Tuple[] = localPoints.map(() => [0, 0, 0]);
  for (const [first, second, third] of triangles) {
    const edgeOne: Vec3Tuple = [
      localPoints[second][0] - localPoints[first][0],
      localPoints[second][1] - localPoints[first][1],
      localPoints[second][2] - localPoints[first][2],
    ];
    const edgeTwo: Vec3Tuple = [
      localPoints[third][0] - localPoints[first][0],
      localPoints[third][1] - localPoints[first][1],
      localPoints[third][2] - localPoints[first][2],
    ];
    const face = crossProduct(edgeOne, edgeTwo);
    for (const vertex of [first, second, third]) {
      localNormals[vertex][0] += face[0];
      localNormals[vertex][1] += face[1];
      localNormals[vertex][2] += face[2];
    }
  }

  const firstVertex = builder.vertexCount;
  localPoints.forEach((point, index) => {
    const position = placeInFrame(frame, center, point);
    const normal = normalized(placeInFrame(frame, [0, 0, 0], normalized(localNormals[index])));
    const unitLocal: Vec3Tuple = [
      point[0] / scale[0],
      point[1] / scale[1],
      point[2] / scale[2],
    ];
    const color = stoneColor(
      normal,
      unitLocal,
      position[1] - ground,
      stone,
      index,
      settings,
      isRock
    );
    builder.addVertex(position, normal, 0, 0, color);
  });
  for (const [first, second, third] of triangles) {
    builder.addTriangle(firstVertex + first, firstVertex + second, firstVertex + third);
  }
}

function addTwig(
  builder: MeshBuilder,
  x: number,
  z: number,
  rolls: readonly number[],
  settings: ResolvedInternalClutter
): void {
  const length = lerp(0.28, 0.95, rolls[0] ** 1.4);
  const thickness = lerp(0.012, 0.032, rolls[1]) * (0.6 + length * 0.6);
  const yaw = rolls[2] * FULL_TURN;
  const bend = (rolls[3] - 0.5) * 0.6;
  const pointCount = settings.detail ? 4 : 3;
  const points: Vec3Tuple[] = [];
  const radii: number[] = [];
  for (let index = 0; index < pointCount; index++) {
    const progress = index / (pointCount - 1);
    const angle = yaw + bend * progress;
    const along = (progress - 0.5) * length;
    const px = x + Math.cos(angle) * along;
    const pz = z + Math.sin(angle) * along;
    const radius = thickness * lerp(1, 0.45, progress);
    points.push([px, settings.terrainHeight(px, pz) + radius * 0.7, pz]);
    radii.push(radius);
  }
  const color = settings.twigColor.map((channel) => channel * lerp(0.7, 1.3, rolls[4]));
  addTube(builder, points, radii, settings.detail ? 5 : 4, 1, color);
}

function addFallenLeaf(
  builder: MeshBuilder,
  x: number,
  z: number,
  rolls: readonly number[],
  settings: ResolvedInternalClutter
): void {
  const length = lerp(0.12, 0.28, rolls[0]);
  const width = length * lerp(0.45, 0.7, rolls[1]);
  const curl = width * lerp(0.06, 0.42, rolls[2]);
  const palette = settings.leafColors;
  const base = palette[Math.floor(rolls[3] * palette.length) % palette.length];
  const color = base.map((channel) => channel * lerp(0.75, 1.25, rolls[4]));
  const ground = settings.terrainHeight(x, z);
  const frame = groundFrame(groundNormal(settings.terrainHeight, x, z), rolls[5] * FULL_TURN);
  const origin: Vec3Tuple = [x, ground + 0.012, z];
  const rows = settings.detail ? 3 : 2;
  const grid: number[][] = [];
  for (let row = 0; row < rows; row++) {
    const progress = row / (rows - 1);
    const halfWidth = width * 0.5 * Math.sin(Math.PI * lerp(0.08, 1, progress)) ** 0.8;
    const rowVertices: number[] = [];
    for (let across = -1; across <= 1; across++) {
      const lift = curl * across * across;
      const local: Vec3Tuple = [(progress - 0.5) * length, lift, across * halfWidth];
      const normal = normalized(
        placeInFrame(frame, [0, 0, 0], [0, 1, (-across * curl) / Math.max(halfWidth, 1e-4)])
      );
      const shade = across === 0 ? 0.82 : 1;
      rowVertices.push(
        builder.addVertex(
          placeInFrame(frame, origin, local),
          normal,
          (across + 1) / 2,
          progress,
          color.map((c) => c * shade)
        )
      );
    }
    grid.push(rowVertices);
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < 2; column++) {
      builder.addTriangle(grid[row][column], grid[row][column + 1], grid[row + 1][column]);
      builder.addTriangle(grid[row][column + 1], grid[row + 1][column + 1], grid[row + 1][column]);
    }
  }
}

function clumpWeight(x: number, z: number, seed: number, clumping: number, salt: number): number {
  const patch = smoothstep(0.3, 0.75, valueNoise(x * 0.12, z * 0.12, seed + salt));
  return lerp(1, patch * 2, clumping);
}

export interface BuiltClutterBatches {
  rocks: RawGeometryBuffers | null;
  pebbles: RawGeometryBuffers | null;
  litter: RawGeometryBuffers | null;
}

/**
 * Generates batched 67.js vertex-colored ground clutter (plane-chipped mossy rocks,
 * rounded pebbles, curved twigs, and cupped fallen leaves) respecting stage exclusion zones.
 */
export function buildClutterBatches(options: ClutterBuildSettings): BuiltClutterBatches {
  const preset = CLUTTER_PRESETS[options.preset ?? 'meadow'];
  const seed = options.seed ?? 67;
  const detail: 0 | 1 = options.detail ?? 0;
  const clumping = options.clumping ?? 0.6;
  const internal: ResolvedInternalClutter = {
    seed,
    detail,
    rockSize: options.rockSize ?? [0.28, 1.35],
    pebbleSize: options.pebbleSize ?? [0.08, 0.26],
    stoneColor: options.stoneColor ?? [0.34, 0.32, 0.29],
    mossColor: options.mossColor ?? [0.16, 0.29, 0.11],
    soilColor: options.soilColor ?? [0.16, 0.13, 0.09],
    twigColor: options.twigColor ?? [0.26, 0.18, 0.11],
    leafColors: options.leafColors ?? [
      [0.42, 0.24, 0.09],
      [0.54, 0.35, 0.11],
      [0.26, 0.18, 0.08],
      [0.32, 0.28, 0.1],
    ],
    moss: options.moss ?? preset.moss,
    clumping,
    terrainHeight: options.terrainHeight,
  };

  const rocksBuilder = createMeshBuilder({ withColors: true });
  const pebblesBuilder = createMeshBuilder({ withColors: true });
  const litterBuilder = createMeshBuilder({ withColors: true });

  const scatterKind = (
    count: number,
    salt: number,
    emit: (x: number, z: number, rolls: readonly number[]) => void
  ) => {
    if (count <= 0) return;
    const rand = createRandom(seed + salt * 7907);
    let placed = 0;
    const maxAttempts = count * 5;
    for (let i = 0; i < maxAttempts && placed < count; i++) {
      const x = lerp(options.area.minX, options.area.maxX, rand());
      const z = lerp(options.area.minZ, options.area.maxZ, rand());
      if (options.exclude && options.exclude(x, z)) continue;
      if (rand() * 2 >= clumpWeight(x, z, seed, clumping, salt)) continue;
      const rolls = [rand(), rand(), rand(), rand(), rand(), rand()];
      emit(x, z, rolls);
      placed++;
    }
  };

  scatterKind(options.rockCount ?? 24, 1, (x, z, rolls) =>
    addStone(rocksBuilder, 'rocks', x, z, rolls, internal)
  );
  scatterKind(options.pebbleCount ?? 40, 2, (x, z, rolls) =>
    addStone(pebblesBuilder, 'pebbles', x, z, rolls, internal)
  );
  scatterKind(options.twigCount ?? 0, 3, (x, z, rolls) =>
    addTwig(litterBuilder, x, z, rolls, internal)
  );
  scatterKind(options.leafCount ?? 0, 4, (x, z, rolls) =>
    addFallenLeaf(litterBuilder, x, z, rolls, internal)
  );

  return {
    rocks: rocksBuilder.vertexCount > 0 ? rocksBuilder.build() : null,
    pebbles: pebblesBuilder.vertexCount > 0 ? pebblesBuilder.build() : null,
    litter: litterBuilder.vertexCount > 0 ? litterBuilder.build() : null,
  };
}

