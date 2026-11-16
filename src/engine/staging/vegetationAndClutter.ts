import * as THREE from 'three';
import {
  EnvironmentDetailLevel,
  EnvironmentSpec,
  VegetationSpecies,
} from '../../types/environment';
import {
  evaluateTerrainHeight,
  evaluateTerrainNormalAndSlope,
  ResolvedTerrainConfig,
} from './terrainGenerator';
import {
  chooseSpecies,
  createFlowerPatchGeometry,
  createGrassClumpGeometry,
  createTree,
  poissonDiskPoints,
  rawBuffersToThreeGeometry,
} from './vendor67/vegetationCore';
import {
  BarkTextureKind,
  LeafTextureKind,
  TreeSpeciesName,
} from './vendor67/vegetationSpecies';
import {
  getBarkDataTexture,
  getLeafDataTexture,
} from './vendor67/vegetationTextures';
import {
  buildClutterBatches,
  ClutterPresetName,
} from './vendor67/clutterCore';

export interface ExclusionTrajectoryActor {
  name?: string;
  token?: string;
  kind?: string;
  trajectory?: {
    startPosition?: { x: number; y: number; z?: number };
    endPosition?: { x: number; y: number; z?: number };
    keyframes?: Array<{ position: { x: number; y: number; z?: number } }>;
  };
}

export interface ExclusionCameraSpec {
  startPosition?: { x: number; y: number; z?: number };
  endPosition?: { x: number; y: number; z?: number };
  targetLookAt?: { x: number; y: number; z?: number };
}

export interface VegetationBuildContext {
  env?: EnvironmentSpec;
  terrainConfig: ResolvedTerrainConfig;
  sceneDescription?: string;
  actors?: ExclusionTrajectoryActor[];
  camera?: ExclusionCameraSpec;
}

export interface ResolvedVegetationConfig {
  species: Exclude<VegetationSpecies, 'auto'>;
  density: number;
  exclusionSightline: boolean;
  windStrength: number;
  seed: number;
  detailLevel: EnvironmentDetailLevel;
  clutterEnabled: boolean;
  clutterDensity: number;
  grassRing: boolean;
}

interface CachedTreeVariant {
  barkGeo: THREE.BufferGeometry;
  foliageGeo: THREE.BufferGeometry;
  barkTexture: BarkTextureKind;
  barkTint: readonly [number, number, number];
  leafTexture: LeafTextureKind;
  leafColor: readonly [number, number, number];
  leafTint: readonly [number, number, number];
  alphaCutout: boolean;
}

const SPECIES_SEED_SALT: Record<TreeSpeciesName, number> = {
  broadleaf: 101,
  birch: 211,
  conifer: 307,
  palm: 401,
  bush: 503,
};

const treeVariantCache = new Map<string, CachedTreeVariant>();
const sharedUndergrowthGeoCache = new Map<string, THREE.BufferGeometry>();

function getCachedTreeVariant(
  species: TreeSpeciesName,
  variantIndex: number,
  lodIndex: 0 | 1
): CachedTreeVariant {
  const key = `${species}:v${variantIndex}:lod${lodIndex}`;
  const existing = treeVariantCache.get(key);
  if (existing) return existing;

  const variantSeed = SPECIES_SEED_SALT[species] + variantIndex * 997;
  const treeData = createTree({ species, leaves: 'cards' }, variantSeed);
  const level = treeData.levels[lodIndex] ?? treeData.levels[0];
  const [barkPart, foliagePart] = level.parts;

  const barkGeo = rawBuffersToThreeGeometry(barkPart.geometry);
  barkGeo.userData.isSharedResource = true;

  const foliageGeo = rawBuffersToThreeGeometry(foliagePart.geometry);
  foliageGeo.userData.isSharedResource = true;

  const entry: CachedTreeVariant = {
    barkGeo,
    foliageGeo,
    barkTexture: barkPart.barkTexture ?? 'rough',
    barkTint: barkPart.barkTint ?? [0.5, 0.4, 0.31],
    leafTexture: foliagePart.leafTexture ?? 'sprig',
    leafColor: foliagePart.leafColor ?? [60, 112, 42],
    leafTint: foliagePart.leafTint ?? [1, 1, 1],
    alphaCutout: foliagePart.alphaCutout,
  };
  treeVariantCache.set(key, entry);
  return entry;
}

function getCachedGrassGeometry(isHD: boolean): THREE.BufferGeometry {
  const key = isHD ? 'grass:hd' : 'grass:simple';
  const cached = sharedUndergrowthGeoCache.get(key);
  if (cached) return cached;
  const raw = createGrassClumpGeometry({
    blades: isHD ? 14 : 8,
    height: 0.52,
    radius: 0.18,
    widthScale: 1.25,
    seed: 67,
  });
  const geo = rawBuffersToThreeGeometry(raw);
  geo.userData.isSharedResource = true;
  sharedUndergrowthGeoCache.set(key, geo);
  return geo;
}

function getCachedFlowerGeometry(seedOffset: number): THREE.BufferGeometry {
  const key = `flower:${seedOffset}`;
  const cached = sharedUndergrowthGeoCache.get(key);
  if (cached) return cached;
  const palettes: Array<[number, number, number]> = [
    [0.95, 0.82, 0.24],
    [0.92, 0.48, 0.58],
    [0.68, 0.62, 0.94],
  ];
  const raw = createFlowerPatchGeometry({
    flowers: 5,
    height: 0.42,
    color: palettes[seedOffset % palettes.length],
    seed: 67 + seedOffset * 31,
  });
  const geo = rawBuffersToThreeGeometry(raw);
  geo.userData.isSharedResource = true;
  sharedUndergrowthGeoCache.set(key, geo);
  return geo;
}

/**
 * Injects subtle GPU leaf-tip wind flutter (`1.0 - uv.y` pinned at stem `uv.y = 1.0`)
 * so individual 67.js sprig/needle cards shimmer organically in real time while keeping
 * whole-tree root sway synchronized via `instanceMatrix` across RGB, Clay, and Depth passes.
 */
function attachFoliageFlutterShader(
  material: THREE.MeshStandardMaterial,
  windStrength: number
): { uWindTime: { value: number }; uWindStrength: { value: number } } {
  const windUniforms = {
    uWindTime: { value: 0 },
    uWindStrength: { value: windStrength },
  };
  material.userData.windUniforms = windUniforms;
  material.customProgramCacheKey = () => 'comfy67-foliage-flutter-v1';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWindTime;
uniform float uWindStrength;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float tipWeight67 = clamp(1.0 - uv.y, 0.0, 1.0);
vec3 instOrigin67 = vec3(0.0);
#ifdef USE_INSTANCING
  instOrigin67 = instanceMatrix[3].xyz;
#endif
float flutterPhase67 = uWindTime * 4.4 + instOrigin67.x * 0.37 + instOrigin67.z * 0.29 + position.x * 2.9 + position.y * 2.3 + position.z * 3.1;
transformed.x += sin(flutterPhase67) * 0.016 * uWindStrength * tipWeight67;
transformed.y += cos(flutterPhase67 * 1.13) * 0.011 * uWindStrength * tipWeight67;
transformed.z += sin(flutterPhase67 * 0.87 + 1.2) * 0.016 * uWindStrength * tipWeight67;`
      );
  };
  return windUniforms;
}

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shortest distance from 2D point (px, pz) to line segment (ax, az) -> (bx, bz),
 * plus normalized projection parameter tProj in [0, 1].
 */
export function distanceToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { dist: number; tProj: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) {
    return { dist: Math.hypot(px - ax, pz - az), tProj: 0 };
  }
  const tProj = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const projX = ax + tProj * dx;
  const projZ = az + tProj * dz;
  return { dist: Math.hypot(px - projX, pz - projZ), tProj };
}

/**
 * Resolves the effective plain-data vegetation and clutter settings.
 */
export function resolveEffectiveVegetationConfig(
  ctx: VegetationBuildContext
): ResolvedVegetationConfig {
  const { env, terrainConfig, sceneDescription } = ctx;
  const rawSpecies = env?.vegetation?.species ?? 'auto';
  const density = Math.max(0, Math.min(2.5, env?.vegetation?.density ?? 1.0));
  const exclusionSightline = env?.vegetation?.exclusionSightline !== false;
  const windStrength = Math.max(0, Math.min(2, env?.vegetation?.windStrength ?? 0.45));
  const seed = Math.round(env?.vegetation?.seed ?? terrainConfig.seed ?? 67);
  const detailLevel: EnvironmentDetailLevel = env?.detailLevel === 'hd' ? 'hd' : 'simple';
  const clutterEnabled = env?.clutter?.enabled !== false;
  const clutterDensity = Math.max(0, Math.min(2.5, env?.clutter?.density ?? 1.0));
  const grassRing = Boolean(
    env?.clutter?.grassRing || (detailLevel === 'hd' && terrainConfig.groundSurface === 'grass-terrain')
  );

  if (rawSpecies !== 'auto') {
    return {
      species: rawSpecies,
      density,
      exclusionSightline,
      windStrength,
      seed,
      detailLevel,
      clutterEnabled,
      clutterDensity,
      grassRing,
    };
  }

  const combinedText = `${sceneDescription || ''} ${env?.promptDescription || ''} ${env?.name || ''}`.toLowerCase();
  const cat = terrainConfig.biomeCategory;

  let species: Exclude<VegetationSpecies, 'auto'> = 'none';
  if (cat.includes('nature') || cat.includes('forest')) {
    if (/\b(palm|tropical|oasis|island|coconut|نخيل|واحة|استوائي)\b/i.test(combinedText)) {
      species = 'palm';
    } else if (/\b(birch|aspen|autumn|بتولا|خريف)\b/i.test(combinedText)) {
      species = 'birch';
    } else if (/\b(oak|maple|broadleaf|deciduous|park|orchard|بلوط|حديقة)\b/i.test(combinedText)) {
      species = 'broadleaf';
    } else if (/\b(mixed|jungle|rainforest|أدغال)\b/i.test(combinedText)) {
      species = 'mixed';
    } else {
      species = 'conifer';
    }
  } else if (cat.includes('coastal') || cat.includes('beach')) {
    species = /\b(palm|tropical|oasis|island|نخيل|جزيرة)\b/i.test(combinedText) ? 'palm' : 'bush';
  } else if (cat.includes('desert')) {
    species = /\b(oasis|palm|واحة|نخيل)\b/i.test(combinedText) ? 'palm' : 'bush';
  }

  return {
    species,
    density,
    exclusionSightline,
    windStrength,
    seed,
    detailLevel,
    clutterEnabled,
    clutterDensity,
    grassRing,
  };
}

/**
 * Triple Smart Exclusion Zone (Q3):
 * Prevents procedural trees from spawning inside:
 * 1. Central Acting Clearing (r < clearingRadius)
 * 2. Active Actor / Vehicle Movement Trajectory Corridors (5.8m buffer)
 * 3. Camera-to-Subject Sightline Frustum Cone so a tree never blocks an actor's face in the lens!
 */
export function isPointExcludedFromScattering(
  x: number,
  z: number,
  ctx: VegetationBuildContext,
  vegConfig: ResolvedVegetationConfig,
  isTree: boolean = true
): boolean {
  const r = Math.hypot(x, z);
  const clearR = ctx.terrainConfig.clearingRadius;

  // 1. Central acting clearing exclusion
  const minRadius = isTree ? clearR : Math.max(11, clearR - 4);
  if (r < minRadius) return true;

  // In coastal-beach biome, ocean water starts at z < -16m
  if (ctx.terrainConfig.biomeCategory.includes('coastal') && z < -15.5) {
    return true;
  }

  // 2. Actor & vehicle movement trajectory corridor exclusion
  const actors = ctx.actors || [];
  const actorCorridorRadius = isTree ? 5.8 : 3.4;
  for (const act of actors) {
    const start = act.trajectory?.startPosition;
    const end = act.trajectory?.endPosition;
    if (!start) continue;
    const waypoints: Array<{ x: number; z: number }> = [
      { x: start.x - 50, z: start.y - 50 },
    ];
    for (const kf of act.trajectory?.keyframes || []) {
      waypoints.push({ x: kf.position.x - 50, z: kf.position.y - 50 });
    }
    if (end) {
      waypoints.push({ x: end.x - 50, z: end.y - 50 });
    }
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (Math.hypot(x - wp.x, z - wp.z) < actorCorridorRadius) return true;
      if (i + 1 < waypoints.length) {
        const nextWp = waypoints[i + 1];
        const { dist } = distanceToSegment2D(x, z, wp.x, wp.z, nextWp.x, nextWp.z);
        if (dist < actorCorridorRadius) return true;
      }
    }
  }

  // 3. Camera-to-Subject Sightline Frustum Cone Exclusion (for trees/tall vegetation)
  if (isTree && vegConfig.exclusionSightline) {
    const camStart = ctx.camera?.startPosition ?? { x: 50, y: 80 };
    const camEnd = ctx.camera?.endPosition ?? camStart;
    const lookTarget = ctx.camera?.targetLookAt ?? { x: 50, y: 50 };

    const camPositions = [
      { x: camStart.x - 50, z: camStart.y - 50 },
      { x: camEnd.x - 50, z: camEnd.y - 50 },
    ];
    const targets = [{ x: lookTarget.x - 50, z: lookTarget.y - 50 }];
    for (const act of actors.slice(0, 3)) {
      if (act.trajectory?.startPosition) {
        targets.push({
          x: act.trajectory.startPosition.x - 50,
          z: act.trajectory.startPosition.y - 50,
        });
      }
    }

    for (const cp of camPositions) {
      for (const tgt of targets) {
        // Extend ray slightly behind target so backdrop behind actor's head also stays clean in close-ups
        const dirX = tgt.x - cp.x;
        const dirZ = tgt.z - cp.z;
        const rayLen = Math.hypot(dirX, dirZ);
        if (rayLen < 0.5) continue;
        const extX = tgt.x + (dirX / rayLen) * 8.0;
        const extZ = tgt.z + (dirZ / rayLen) * 8.0;
        const { dist, tProj } = distanceToSegment2D(x, z, cp.x, cp.z, extX, extZ);
        const coneHalfWidth = 6.2 + tProj * 4.5;
        if (dist < coneHalfWidth) return true;
      }
    }
  }

  return false;
}

/**
 * Scatters genuine 67.js recursive branching trees (with flared roots, multi-level tapered limbs,
 * tileable bark, and 128x128 RGBA alpha-cutout sprig/needle foliage cards), plane-chipped mossy
 * ground clutter, and multi-blade grass/wildflower tufts into batched Three.js meshes.
 */
export function buildProceduralVegetationAndClutter(
  envGroup: THREE.Group,
  ctx: VegetationBuildContext
): void {
  const vegConfig = resolveEffectiveVegetationConfig(ctx);
  const { terrainConfig } = ctx;
  const rand = seededRandom(vegConfig.seed);
  const isHD = vegConfig.detailLevel === 'hd';

  // 1. Genuine 67.js Parametric Recursive Branching Trees & Shrubs
  if (vegConfig.species !== 'none' && vegConfig.density > 0.01) {
    const baseTreeCount =
      vegConfig.species === 'bush'
        ? isHD
          ? 44
          : 18
        : isHD
        ? 58
        : 26;
    const targetCount = Math.max(4, Math.round(baseTreeCount * vegConfig.density));
    const minSpacing = vegConfig.species === 'bush' ? 3.2 : isHD ? 4.6 : 5.8;

    // Curated midground parallax framing anchors first (filtered by Triple Smart Exclusion)
    const candidatePoints: Array<{ x: number; z: number; scale: number }> = [
      { x: -24, z: -28, scale: 1.05 },
      { x: 25, z: -26, scale: 1.12 },
      { x: -34, z: -14, scale: 0.98 },
      { x: 35, z: -12, scale: 1.02 },
      { x: -28, z: 16, scale: 0.96 },
      { x: 29, z: 18, scale: 1.06 },
      { x: -22, z: 32, scale: 1.0 },
      { x: 24, z: 30, scale: 1.08 },
    ];

    // Bridson multi-restart Poisson-disk scatter across the 112m x 112m stage perimeter
    const poissonPts = poissonDiskPoints(
      { minX: -55, maxX: 55, minZ: -55, maxZ: 55 },
      minSpacing,
      rand,
      ([px, pz]) => !isPointExcludedFromScattering(px, pz, ctx, vegConfig, true)
    );

    // Deterministic Fisher-Yates shuffle so perimeter coverage is uniform at any targetCount
    for (let i = poissonPts.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = poissonPts[i];
      poissonPts[i] = poissonPts[j];
      poissonPts[j] = tmp;
    }

    for (const [px, pz] of poissonPts) {
      candidatePoints.push({
        x: px,
        z: pz,
        scale: 0.92 + rand() * 0.34,
      });
    }

    const mixedSpeciesNames: readonly TreeSpeciesName[] = [
      'conifer',
      'broadleaf',
      'birch',
      'bush',
    ];
    const mixedWeights: Record<TreeSpeciesName, number> = {
      conifer: 0.34,
      broadleaf: 0.32,
      birch: 0.18,
      palm: 0,
      bush: 0.16,
    };

    interface VariantBucket {
      species: TreeSpeciesName;
      variantIndex: number;
      lodIndex: 0 | 1;
      matrices: THREE.Matrix4[];
      barkInstanceColors: THREE.Color[];
      foliageInstanceColors: THREE.Color[];
    }

    const buckets = new Map<string, VariantBucket>();
    const placedPositions: Array<{ x: number; z: number }> = [];
    const dummy = new THREE.Object3D();
    const variantCount = isHD ? 3 : 2;
    const isDesertScrub = terrainConfig.biomeCategory.includes('desert');

    for (const pt of candidatePoints) {
      if (placedPositions.length >= targetCount) break;
      if (Math.abs(pt.x) > 56 || Math.abs(pt.z) > 56) continue;

      if (isPointExcludedFromScattering(pt.x, pt.z, ctx, vegConfig, true)) {
        continue;
      }

      if (placedPositions.some((p) => Math.hypot(p.x - pt.x, p.z - pt.z) < minSpacing * 0.88)) {
        continue;
      }

      const { height: groundY, slopeDeg } = evaluateTerrainNormalAndSlope(pt.x, pt.z, terrainConfig);
      if (slopeDeg > 35) continue;

      const placedIndex = placedPositions.length;
      placedPositions.push({ x: pt.x, z: pt.z });

      const activeSp: TreeSpeciesName =
        vegConfig.species === 'mixed'
          ? chooseSpecies(mixedSpeciesNames, mixedWeights, pt.x, pt.z, vegConfig.seed, rand)
          : vegConfig.species;

      const variantIndex = placedIndex % variantCount;
      const distFromOrigin = Math.hypot(pt.x, pt.z);
      const lodIndex: 0 | 1 = isHD && distFromOrigin <= 38 ? 0 : 1;
      const bucketKey = `${activeSp}:v${variantIndex}:lod${lodIndex}`;

      let bucket = buckets.get(bucketKey);
      if (!bucket) {
        bucket = {
          species: activeSp,
          variantIndex,
          lodIndex,
          matrices: [],
          barkInstanceColors: [],
          foliageInstanceColors: [],
        };
        buckets.set(bucketKey, bucket);
      }

      const scaleBoost = activeSp === 'bush' ? 1.15 : 1.12;
      const s = pt.scale * scaleBoost;
      const yaw = rand() * Math.PI * 2;
      const tiltX = (rand() - 0.5) * 0.04;
      const tiltZ = (rand() - 0.5) * 0.04;

      dummy.position.set(pt.x, groundY, pt.z);
      dummy.rotation.set(tiltX, yaw, tiltZ);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      bucket.matrices.push(dummy.matrix.clone());

      const barkShade = 0.9 + rand() * 0.18;
      bucket.barkInstanceColors.push(new THREE.Color(barkShade, barkShade, barkShade));

      const folColor = isDesertScrub && activeSp === 'bush'
        ? new THREE.Color(0xc4b882).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.08)
        : new THREE.Color(1, 1, 1).offsetHSL(
            (rand() - 0.5) * 0.03,
            0,
            (rand() - 0.5) * 0.09
          );
      bucket.foliageInstanceColors.push(folColor);
    }

    // Sort buckets by instance count descending so index 0 holds the primary named InstancedMesh
    const sortedBuckets = Array.from(buckets.values()).sort(
      (a, b) => b.matrices.length - a.matrices.length
    );

    sortedBuckets.forEach((bucket, bucketIdx) => {
      if (bucket.matrices.length === 0) return;
      const variant = getCachedTreeVariant(bucket.species, bucket.variantIndex, bucket.lodIndex);
      const count = bucket.matrices.length;

      // 1a. Bark InstancedMesh (flared roots + recursive tapered branches + tileable furrow/birch bark)
      const barkTex = getBarkDataTexture(variant.barkTexture);
      const barkMat = new THREE.MeshStandardMaterial({
        map: barkTex,
        color: new THREE.Color().setRGB(
          variant.barkTint[0],
          variant.barkTint[1],
          variant.barkTint[2],
          THREE.SRGBColorSpace
        ),
        roughness: variant.barkTexture === 'birch' ? 0.78 : 0.92,
        metalness: 0.02,
      });

      const trunkInst = new THREE.InstancedMesh(variant.barkGeo, barkMat, count);
      trunkInst.castShadow = true;
      trunkInst.receiveShadow = true;
      trunkInst.name =
        bucketIdx === 0 ? '__procedural_tree_trunks__' : `__procedural_tree_trunks__${bucketIdx}`;
      trunkInst.userData.isVegetationBark = true;
      trunkInst.userData.baseMatrices = bucket.matrices.map((m) => m.clone());
      trunkInst.userData.windStrength = vegConfig.windStrength;

      for (let i = 0; i < count; i++) {
        trunkInst.setMatrixAt(i, bucket.matrices[i]);
        trunkInst.setColorAt(i, bucket.barkInstanceColors[i]);
      }
      trunkInst.instanceMatrix.needsUpdate = true;
      if (trunkInst.instanceColor) trunkInst.instanceColor.needsUpdate = true;
      envGroup.add(trunkInst);

      // 1b. Foliage InstancedMesh (128x128 RGBA alpha-cutout sprig/needles/frond cards + crown AO)
      const leafTex = getLeafDataTexture(variant.leafTexture, variant.leafColor);
      const foliageMat = new THREE.MeshStandardMaterial({
        map: leafTex,
        color: new THREE.Color().setRGB(
          variant.leafTint[0],
          variant.leafTint[1],
          variant.leafTint[2],
          THREE.SRGBColorSpace
        ),
        vertexColors: true,
        alphaTest: variant.alphaCutout ? 0.5 : 0,
        side: THREE.FrontSide, // 67.js addLeafSurface emits explicit front & back faces with canopy normals
        roughness: bucket.species === 'palm' ? 0.68 : 0.82,
        metalness: 0.02,
      });
      const windUniforms = attachFoliageFlutterShader(foliageMat, vegConfig.windStrength);

      const canopyInst = new THREE.InstancedMesh(variant.foliageGeo, foliageMat, count);
      canopyInst.castShadow = true;
      canopyInst.receiveShadow = true;
      canopyInst.name =
        bucketIdx === 0
          ? '__procedural_tree_canopies__'
          : `__procedural_tree_canopies__${bucketIdx}`;
      canopyInst.userData.isVegetationFoliage = true;
      canopyInst.userData.alphaCutoutMap = variant.alphaCutout ? leafTex : undefined;
      canopyInst.userData.windUniforms = windUniforms;
      canopyInst.userData.baseMatrices = bucket.matrices.map((m) => m.clone());
      canopyInst.userData.windStrength = vegConfig.windStrength;

      for (let i = 0; i < count; i++) {
        canopyInst.setMatrixAt(i, bucket.matrices[i]);
        canopyInst.setColorAt(i, bucket.foliageInstanceColors[i]);
      }
      canopyInst.instanceMatrix.needsUpdate = true;
      if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
      envGroup.add(canopyInst);
    });
  }

  // 2. Genuine 67.js Plane-Chipped Mossy Rocks, Rounded Pebbles, Twigs & Fallen Leaves
  const isOutdoorBiome =
    terrainConfig.profile !== 'flat' ||
    terrainConfig.biomeCategory.includes('nature') ||
    terrainConfig.biomeCategory.includes('desert') ||
    terrainConfig.biomeCategory.includes('coastal') ||
    Boolean(ctx.env?.clutter?.enabled);

  if (vegConfig.clutterEnabled && isOutdoorBiome && vegConfig.clutterDensity > 0.05) {
    const isDesert =
      terrainConfig.profile === 'sand-dunes' ||
      terrainConfig.profile === 'canyon-valley' ||
      terrainConfig.biomeCategory.includes('desert');
    const isCoastal =
      terrainConfig.profile === 'coastal-slope' ||
      terrainConfig.biomeCategory.includes('coastal');

    const presetName: ClutterPresetName = isDesert
      ? 'scree'
      : isCoastal
      ? 'riverbed'
      : vegConfig.species === 'none'
      ? 'meadow'
      : 'forest';

    const stoneColor: [number, number, number] = isDesert
      ? [0.52, 0.35, 0.21]
      : isCoastal
      ? [0.39, 0.44, 0.49]
      : [0.34, 0.32, 0.29];

    const mossAmount = isDesert ? 0.02 : isCoastal ? 0.16 : 0.72;
    const rockCount = Math.max(4, Math.round((isHD ? 56 : 18) * vegConfig.clutterDensity));
    const pebbleCount = Math.round((isHD ? 92 : 26) * vegConfig.clutterDensity);
    const twigCount = isHD && presetName === 'forest' ? Math.round(44 * vegConfig.clutterDensity) : 0;
    const leafCount = isHD && presetName === 'forest' ? Math.round(96 * vegConfig.clutterDensity) : 0;

    const batches = buildClutterBatches({
      preset: presetName,
      seed: vegConfig.seed + 131,
      detail: isHD ? 1 : 0,
      area: { minX: -54, maxX: 54, minZ: -54, maxZ: 54 },
      rockCount,
      pebbleCount,
      twigCount,
      leafCount,
      rockSize: isDesert ? [0.45, 1.85] : [0.32, 1.45],
      pebbleSize: [0.09, 0.28],
      stoneColor,
      moss: mossAmount,
      terrainHeight: (x, z) => evaluateTerrainHeight(x, z, terrainConfig),
      exclude: (x, z) => isPointExcludedFromScattering(x, z, ctx, vegConfig, false),
    });

    if (batches.rocks) {
      const rockGeo = rawBuffersToThreeGeometry(batches.rocks);
      const rockMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.04,
      });
      const rockMesh = new THREE.Mesh(rockGeo, rockMat);
      rockMesh.castShadow = true;
      rockMesh.receiveShadow = true;
      rockMesh.name = '__procedural_ground_clutter__';
      envGroup.add(rockMesh);
    }

    if (batches.pebbles) {
      const pebbleGeo = rawBuffersToThreeGeometry(batches.pebbles);
      const pebbleMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.04,
      });
      const pebbleMesh = new THREE.Mesh(pebbleGeo, pebbleMat);
      pebbleMesh.castShadow = isHD;
      pebbleMesh.receiveShadow = true;
      pebbleMesh.name = '__procedural_ground_pebbles__';
      envGroup.add(pebbleMesh);
    }

    if (batches.litter) {
      const litterGeo = rawBuffersToThreeGeometry(batches.litter);
      const litterMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.86,
        metalness: 0.02,
        side: THREE.DoubleSide,
      });
      const litterMesh = new THREE.Mesh(litterGeo, litterMat);
      litterMesh.receiveShadow = true;
      litterMesh.name = '__procedural_ground_litter__';
      envGroup.add(litterMesh);
    }
  }

  // 3. Genuine 67.js Multi-Blade Grass Clumps & Wildflower Patches
  if (vegConfig.grassRing && isOutdoorBiome) {
    const tuftCount = isHD ? 180 : 76;
    const grassGeo = getCachedGrassGeometry(isHD);
    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.02,
      side: THREE.FrontSide,
    });
    const grassInst = new THREE.InstancedMesh(grassGeo, grassMat, tuftCount);
    grassInst.receiveShadow = true;
    grassInst.name = '__procedural_grass_ring__';

    const dummy = new THREE.Object3D();
    const grassMatrices: THREE.Matrix4[] = [];
    let placed = 0;

    for (let i = 0; i < tuftCount * 3 && placed < tuftCount; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.max(9.5, terrainConfig.clearingRadius - 5) + rand() * 20;
      const gx = Math.cos(angle) * dist;
      const gz = Math.sin(angle) * dist;
      if (isPointExcludedFromScattering(gx, gz, ctx, vegConfig, false)) continue;

      const { height: gy, slopeDeg } = evaluateTerrainNormalAndSlope(gx, gz, terrainConfig);
      if (slopeDeg > 32) continue;

      const s = 0.8 + rand() * 0.65;
      dummy.position.set(gx, gy, gz);
      dummy.rotation.set((rand() - 0.5) * 0.16, rand() * Math.PI * 2, (rand() - 0.5) * 0.16);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      grassMatrices.push(dummy.matrix.clone());
      grassInst.setMatrixAt(placed, dummy.matrix);
      grassInst.setColorAt(
        placed,
        new THREE.Color(1, 1, 1).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.08)
      );
      placed++;
    }

    grassInst.count = placed;
    grassInst.userData.baseMatrices = grassMatrices;
    grassInst.userData.windStrength = vegConfig.windStrength * 1.35;
    grassInst.instanceMatrix.needsUpdate = true;
    if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
    envGroup.add(grassInst);

    // Scatter wildflower accents in HD meadow/grass-terrain mode
    if (isHD && terrainConfig.groundSurface === 'grass-terrain') {
      const flowerCount = 28;
      const flowerGeo = getCachedFlowerGeometry(vegConfig.seed % 3);
      const flowerMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.76,
        metalness: 0.02,
        side: THREE.FrontSide,
      });
      const flowerInst = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
      flowerInst.receiveShadow = true;
      flowerInst.name = '__procedural_wildflowers__';

      const flowerMatrices: THREE.Matrix4[] = [];
      let fPlaced = 0;
      for (let i = 0; i < flowerCount * 3 && fPlaced < flowerCount; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = Math.max(11, terrainConfig.clearingRadius - 3.5) + rand() * 16;
        const fx = Math.cos(angle) * dist;
        const fz = Math.sin(angle) * dist;
        if (isPointExcludedFromScattering(fx, fz, ctx, vegConfig, false)) continue;

        const { height: fy, slopeDeg } = evaluateTerrainNormalAndSlope(fx, fz, terrainConfig);
        if (slopeDeg > 28) continue;

        const fs = 0.85 + rand() * 0.45;
        dummy.position.set(fx, fy, fz);
        dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        dummy.scale.set(fs, fs, fs);
        dummy.updateMatrix();
        flowerMatrices.push(dummy.matrix.clone());
        flowerInst.setMatrixAt(fPlaced, dummy.matrix);
        fPlaced++;
      }

      flowerInst.count = fPlaced;
      flowerInst.userData.baseMatrices = flowerMatrices;
      flowerInst.userData.windStrength = vegConfig.windStrength * 1.2;
      flowerInst.instanceMatrix.needsUpdate = true;
      envGroup.add(flowerInst);
    }
  }
}

/**
 * Deterministic wind sway for 67.js procedural trees & grass tufts (pure function of shot time `t`
 * so offline 4-Pass Previs export is 100% frame-reproducible across RGB, Clay, and Depth passes).
 */
export function updateVegetationWind(envGroup: THREE.Group, timeSec: number): void {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const swayEuler = new THREE.Euler();
  const swayQuat = new THREE.Quaternion();
  const mat = new THREE.Matrix4();

  envGroup.traverse((child) => {
    const windUniforms = child.userData?.windUniforms as
      | { uWindTime: { value: number }; uWindStrength: { value: number } }
      | undefined;
    if (windUniforms) {
      windUniforms.uWindTime.value = timeSec;
    }

    if (!(child instanceof THREE.InstancedMesh)) return;
    const baseMatrices = child.userData.baseMatrices as THREE.Matrix4[] | undefined;
    const windStrength = Number(child.userData.windStrength ?? 0);
    if (!baseMatrices || baseMatrices.length === 0 || windStrength <= 0.01) return;

    const count = Math.min(child.count, baseMatrices.length);
    for (let i = 0; i < count; i++) {
      baseMatrices[i].decompose(pos, quat, scale);
      // Pure spatial phase so shared (pos.x, pos.z) roots keep bark & foliage 100% locked together
      const phase = pos.x * 0.17 + pos.z * 0.13;
      const swayX = Math.sin(timeSec * 1.65 + phase) * 0.022 * windStrength;
      const swayZ = Math.cos(timeSec * 1.28 + phase * 1.31) * 0.018 * windStrength;
      swayEuler.set(swayX, 0, swayZ);
      swayQuat.setFromEuler(swayEuler);
      quat.multiply(swayQuat);
      mat.compose(pos, quat, scale);
      child.setMatrixAt(i, mat);
    }
    child.instanceMatrix.needsUpdate = true;
  });
}
