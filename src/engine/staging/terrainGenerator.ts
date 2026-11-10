import * as THREE from 'three';
import {
  EnvironmentDetailLevel,
  EnvironmentSpec,
  TerrainProfile,
} from '../../types/environment';
import { SemanticEnvironmentBiome } from './environmentBuilder';

export interface ResolvedTerrainConfig {
  profile: Exclude<TerrainProfile, 'auto'>;
  heightScale: number;
  clearingRadius: number;
  seed: number;
  detailLevel: EnvironmentDetailLevel;
  groundSurface: string;
  biomeCategory: string;
}

/**
 * Deterministic 2D hash in [0, 1] seeded by integer seed.
 */
function hash2D(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Smooth 2D value noise in [-1, 1] with quintic C2 interpolation.
 */
export function noise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  // Quintic smoothstep: 6t^5 - 15t^4 + 10t^3
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

  const v00 = hash2D(ix, iz, seed);
  const v10 = hash2D(ix + 1, iz, seed);
  const v01 = hash2D(ix, iz + 1, seed);
  const v11 = hash2D(ix + 1, iz + 1, seed);

  const a = v00 + (v10 - v00) * ux;
  const b = v01 + (v11 - v01) * ux;
  return (a + (b - a) * uz) * 2 - 1;
}

/**
 * Multi-octave Fractal Brownian Motion (fBm) in [-1, 1].
 */
export function fbm2D(
  x: number,
  z: number,
  seed: number,
  octaves: number = 4,
  lacunarity: number = 2.05,
  gain: number = 0.5
): number {
  let sum = 0;
  let amp = 1.0;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, z * freq, seed + i * 101);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Resolves the effective plain-data terrain configuration from EnvironmentSpec + inferred biome.
 */
export function resolveEffectiveTerrainConfig(
  env?: EnvironmentSpec,
  inferredBiome?: SemanticEnvironmentBiome,
  sceneDescription?: string
): ResolvedTerrainConfig {
  const rawProfile = env?.terrain?.profile ?? 'auto';
  const heightScale = Math.max(0, Math.min(3, env?.terrain?.heightScale ?? 1.0));
  const clearingRadius = Math.max(8, Math.min(42, env?.terrain?.clearingRadius ?? 18));
  const seed = Math.round(env?.terrain?.seed ?? 67);
  const detailLevel: EnvironmentDetailLevel = env?.detailLevel === 'hd' ? 'hd' : 'simple';
  const biomeCategory = (inferredBiome?.category || env?.category || 'studio').toLowerCase();
  const groundSurface = inferredBiome?.groundSurface || env?.groundSurface || 'studio-floor';

  if (rawProfile !== 'auto') {
    return {
      profile: rawProfile,
      heightScale,
      clearingRadius,
      seed,
      detailLevel,
      groundSurface,
      biomeCategory,
    };
  }

  const combinedText = `${sceneDescription || ''} ${env?.promptDescription || ''} ${env?.name || ''}`.toLowerCase();

  let resolvedProfile: Exclude<TerrainProfile, 'auto'> = 'flat';
  if (biomeCategory.includes('coastal') || biomeCategory.includes('beach')) {
    resolvedProfile = 'coastal-slope';
  } else if (biomeCategory.includes('desert') || groundSurface === 'sand-dunes') {
    resolvedProfile = /\b(canyon|gorge|mesa|wadi|وادي)\b/i.test(combinedText)
      ? 'canyon-valley'
      : 'sand-dunes';
  } else if (biomeCategory.includes('nature') || biomeCategory.includes('forest') || groundSurface === 'grass-terrain') {
    if (/\b(mountain|mountains|peak|ridge|cliff|alpine|highland|جبل|جبال|قمة)\b/i.test(combinedText)) {
      resolvedProfile = 'mountain-ridge';
    } else if (/\b(canyon|valley|gorge|ravine|pass|وادي|ممر)\b/i.test(combinedText)) {
      resolvedProfile = 'canyon-valley';
    } else {
      resolvedProfile = 'rolling-hills';
    }
  }

  return {
    profile: resolvedProfile,
    heightScale,
    clearingRadius,
    seed,
    detailLevel,
    groundSurface,
    biomeCategory,
  };
}

/**
 * Evaluates the deterministic 3D terrain elevation y = heightAt(x, z) in stage meters.
 * Guarantees a 100% flat central acting circle (r <= clearingRadius, default 18m)
 * with a C1-continuous Hermite transition to surrounding hills/dunes/ridges.
 */
export function evaluateTerrainHeight(
  x: number,
  z: number,
  config: ResolvedTerrainConfig
): number {
  if (config.profile === 'flat' || config.heightScale <= 0.001) {
    return 0;
  }

  const r = Math.hypot(x, z);
  const clearR = config.clearingRadius;
  if (r <= clearR) {
    return 0;
  }

  const blendSpan = 16;
  const clearMask = smoothstep(clearR, clearR + blendSpan, r);
  const octaves = config.detailLevel === 'hd' ? 5 : 3;
  const seed = config.seed;

  let rawH = 0;
  switch (config.profile) {
    case 'rolling-hills': {
      const n1 = fbm2D(x * 0.032, z * 0.032, seed, octaves);
      const n2 = fbm2D(x * 0.075 + 4.2, z * 0.075 - 3.1, seed + 17, 2);
      const rimBoost = smoothstep(22, 54, r) * 3.8;
      rawH = Math.max(0, (n1 * 0.55 + 0.45) * 5.8 + n2 * 1.15 + rimBoost);
      break;
    }
    case 'mountain-ridge': {
      // Ridged multifractal: 1 - |fbm| creates sharp alpine mountain crests
      const baseN = fbm2D(x * 0.028, z * 0.028, seed, octaves);
      const ridge = 1.0 - Math.abs(baseN);
      const ridgeSharp = ridge * ridge;
      const detail = fbm2D(x * 0.08, z * 0.08, seed + 31, 3) * 1.4;
      const horizonWall = smoothstep(26, 56, r) * 7.5;
      rawH = Math.max(0, ridgeSharp * 9.5 + horizonWall + detail);
      break;
    }
    case 'canyon-valley': {
      // Central Z-corridor stays passable while left/right flanks (|x| > 16m) rise into canyon cliffs
      const flankMask = smoothstep(14, 38, Math.abs(x));
      const terrace = fbm2D(x * 0.035, z * 0.035, seed, octaves);
      const stepped = Math.floor((terrace * 0.5 + 0.5) * 4.5) / 4.5;
      rawH = Math.max(0, flankMask * (5.5 + stepped * 8.5 + smoothstep(28, 52, r) * 3.0));
      break;
    }
    case 'sand-dunes': {
      // Wind-swept asymmetric Saharan dunes with sharp leeward crests
      const windCoord = x * 0.045 + z * 0.025 + fbm2D(x * 0.025, z * 0.025, seed, 2) * 1.6;
      const duneWave = 1.0 - Math.abs(Math.sin(windCoord * Math.PI));
      const macroDune = fbm2D(x * 0.022, z * 0.022, seed + 53, octaves) * 0.5 + 0.5;
      const ripple = config.detailLevel === 'hd' ? Math.sin(x * 1.4 + z * 0.6) * 0.08 : 0;
      rawH = Math.max(0, (duneWave * 4.2 + macroDune * 3.8 + smoothstep(25, 55, r) * 2.4) + ripple);
      break;
    }
    case 'coastal-slope': {
      // Flanking sandy dunes on left/right + gentle beach slope toward -Z ocean horizon
      const flank = smoothstep(20, 48, Math.abs(x));
      const duneN = fbm2D(x * 0.038, z * 0.038, seed, octaves) * 0.5 + 0.5;
      const backShore = z > 10 ? smoothstep(10, 48, z) * 2.6 : 0;
      rawH = Math.max(0, flank * duneN * 4.5 + backShore);
      break;
    }
  }

  return rawH * clearMask * config.heightScale;
}

/**
 * Computes exact surface normal vector and slope angle (in degrees) at (x, z).
 */
export function evaluateTerrainNormalAndSlope(
  x: number,
  z: number,
  config: ResolvedTerrainConfig
): { normal: THREE.Vector3; slopeDeg: number; height: number } {
  const hC = evaluateTerrainHeight(x, z, config);
  if (config.profile === 'flat' || config.heightScale <= 0.001) {
    return { normal: new THREE.Vector3(0, 1, 0), slopeDeg: 0, height: 0 };
  }

  const eps = 0.35;
  const hL = evaluateTerrainHeight(x - eps, z, config);
  const hR = evaluateTerrainHeight(x + eps, z, config);
  const hD = evaluateTerrainHeight(x, z - eps, config);
  const hU = evaluateTerrainHeight(x, z + eps, config);

  const dhdx = (hR - hL) / (2 * eps);
  const dhdz = (hU - hD) / (2 * eps);

  const normal = new THREE.Vector3(-dhdx, 1.0, -dhdz).normalize();
  const slopeRad = Math.acos(Math.max(-1, Math.min(1, normal.y)));
  const slopeDeg = (slopeRad * 180) / Math.PI;

  return { normal, slopeDeg, height: hC };
}

/**
 * 67.js-inspired 4-Layer Physical Splat Shader Rules evaluated per vertex:
 * - Layer 0: Base Clearing / Valley Floor (Grass / Sand / Cobblestone / Asphalt)
 * - Layer 1: Mid-Elevation Loam / Dune Slope (height: [0.4m .. 5.5m])
 * - Layer 2: Steep Cliff Rock Face (slope: [26° .. 90°], triplanar-style rock exposure)
 * - Layer 3: High Crest / Alpine Peak / Shoreline Accent (height >= 6.8m)
 */
export function evaluateTerrainSplatColor(
  x: number,
  z: number,
  height: number,
  slopeDeg: number,
  config: ResolvedTerrainConfig
): THREE.Color {
  const micro = fbm2D(x * 0.14, z * 0.14, config.seed + 211, 2) * 0.08;

  // Define 4 physical layer palettes by biome/surface
  let layer0Valley = new THREE.Color(0x284624); // lush meadow grass
  let layer1MidSlope = new THREE.Color(0x3a3222); // forest earth & loam
  let layer2CliffRock = new THREE.Color(0x57534e); // exposed granite cliff rock
  let layer3HighPeak = new THREE.Color(0xd6d3d1); // high alpine ridge / scree

  if (config.profile === 'sand-dunes' || config.groundSurface === 'sand-dunes') {
    layer0Valley = new THREE.Color(0xb89658); // packed desert floor sand
    layer1MidSlope = new THREE.Color(0xd4a959); // warm golden windward dune
    layer2CliffRock = new THREE.Color(0x7c4f2b); // weathered canyon sandstone
    layer3HighPeak = new THREE.Color(0xe8c478); // sunlit dune crest
  } else if (config.profile === 'coastal-slope') {
    layer0Valley = new THREE.Color(0xc9ab74); // warm beach sand
    layer1MidSlope = new THREE.Color(0xa38b5c); // coastal dune scrub sand
    layer2CliffRock = new THREE.Color(0x64748b); // coastal sea-stack slate rock
    layer3HighPeak = new THREE.Color(0x4d6b3c); // dune crest grass
  } else if (config.profile === 'canyon-valley') {
    layer0Valley = new THREE.Color(0x5c4738); // canyon trail dirt
    layer1MidSlope = new THREE.Color(0x8c583a); // red-ochre canyon strata
    layer2CliffRock = new THREE.Color(0x6b442a); // steep red-rock cliff face
    layer3HighPeak = new THREE.Color(0xa6754b); // mesa plateau sandstone
  }

  // Blend Layer 0 (valley) -> Layer 1 (mid-slope) by elevation + depth blend
  const midWeight = smoothstep(0.25, 3.6, height + micro * 4.0);
  const col = layer0Valley.clone().lerp(layer1MidSlope, midWeight);

  // Blend Layer 3 (high peak / crest) at high elevations
  const peakWeight = smoothstep(6.2, 10.5, height + micro * 3.0);
  col.lerp(layer3HighPeak, peakWeight);

  // Rule: Slope >= 26° transitions sharply to exposed cliff rock (Layer 2)
  const rockWeight = smoothstep(24, 34, slopeDeg + micro * 12);
  col.lerp(layer2CliffRock, rockWeight);

  // Subtle organic tonal variation
  col.offsetHSL(0, 0, micro * 0.35);
  return col;
}

/**
 * Applies the 67.js-inspired procedural heightfield + 4-layer splat vertex coloring
 * directly to the stage's floor mesh.
 * - In 'simple' mode (default): lightweight 48x48 grid (4,608 tris, < 1ms build).
 * - In 'hd' mode: high-resolution 112x112 grid (25,088 tris) with micro-ridge detail.
 */
export function applyTerrainToFloorMesh(
  floorMesh: THREE.Mesh,
  env?: EnvironmentSpec,
  inferredBiome?: SemanticEnvironmentBiome,
  sceneDescription?: string
): ResolvedTerrainConfig {
  const config = resolveEffectiveTerrainConfig(env, inferredBiome, sceneDescription);
  const isFlat = config.profile === 'flat' || config.heightScale <= 0.001;
  const segments = isFlat ? 1 : config.detailLevel === 'hd' ? 112 : 48;

  const sig = `${config.profile}_${config.heightScale.toFixed(2)}_${config.clearingRadius}_${config.seed}_${config.detailLevel}_${config.groundSurface}`;
  if (floorMesh.userData._terrainSignature === sig) {
    return config;
  }
  floorMesh.userData._terrainSignature = sig;
  floorMesh.userData.terrainConfig = config;

  if (floorMesh.geometry) {
    floorMesh.geometry.dispose();
  }

  const geo = new THREE.PlaneGeometry(120, 120, segments, segments);
  const floorMat = floorMesh.material as THREE.MeshStandardMaterial;

  if (isFlat) {
    if (floorMat) {
      floorMat.vertexColors = false;
      floorMat.needsUpdate = true;
    }
    floorMesh.geometry = geo;
    return config;
  }

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const vertexCount = posAttr.count;
  const colors = new Float32Array(vertexCount * 3);

  // Note: floorMesh has rotation.x = -Math.PI / 2, so local (x, y, z) maps to
  // worldX = localX, worldZ = -localY, worldY = localZ!
  for (let i = 0; i < vertexCount; i++) {
    const localX = posAttr.getX(i);
    const localY = posAttr.getY(i);
    const worldX = localX;
    const worldZ = -localY;

    const { height, slopeDeg } = evaluateTerrainNormalAndSlope(worldX, worldZ, config);
    posAttr.setZ(i, height);

    const splatColor = evaluateTerrainSplatColor(worldX, worldZ, height, slopeDeg, config);
    colors[i * 3] = splatColor.r;
    colors[i * 3 + 1] = splatColor.g;
    colors[i * 3 + 2] = splatColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
  floorMesh.geometry = geo;

  if (floorMat) {
    floorMat.color.set(0xffffff);
    floorMat.map = null;
    floorMat.vertexColors = true;
    floorMat.roughness = 0.92;
    floorMat.metalness = 0.04;
    floorMat.needsUpdate = true;
  }

  return config;
}

