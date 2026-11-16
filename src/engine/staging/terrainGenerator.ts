import * as THREE from 'three';
import {
  EnvironmentDetailLevel,
  EnvironmentSpec,
  TerrainProfile,
} from '../../types/environment';
import { SemanticEnvironmentBiome } from './environmentBuilder';
import {
  OCTAVE_ROTATION,
  SPLAT_FRAGMENT_PREAMBLE_GLSL,
  SplatBiomeTheme,
  TerrainNoiseOptions,
  erosionNoise,
  getSplatBiomeAtlas,
  ridgedNoise,
  sampleNoiseWithGradient,
} from './vendor67/terrainNoiseAndSplat';

export interface ResolvedTerrainConfig {
  profile: Exclude<TerrainProfile, 'auto'>;
  heightScale: number;
  clearingRadius: number;
  seed: number;
  detailLevel: EnvironmentDetailLevel;
  groundSurface: string;
  biomeCategory: string;
}

const TERRAIN_WORLD_SIZE = 120;
const TERRAIN_HALF_SIZE = TERRAIN_WORLD_SIZE / 2;

interface CachedTerrainGrid {
  segments: number;
  side: number;
  spacing: number;
  heights: Float32Array;
}

const terrainGridCache = new Map<string, CachedTerrainGrid>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Smooth 2D value noise in [-1, 1] with quintic C2 interpolation (from 67.js `sampleNoise`).
 */
export function noise2D(x: number, z: number, seed: number): number {
  const out = new Float64Array(3);
  sampleNoiseWithGradient(x, z, seed, out);
  return out[0];
}

/**
 * Multi-octave rotated fBm in [-1, 1] using 67.js `OCTAVE_ROTATION`.
 */
export function fbm2D(
  x: number,
  z: number,
  seed: number,
  octaves: number = 4,
  lacunarity: number = 2.0,
  gain: number = 0.5
): number {
  const out = new Float64Array(3);
  let px = x;
  let pz = z;
  let sum = 0;
  let amp = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sampleNoiseWithGradient(px, pz, seed + i * 17, out);
    sum += amp * out[0];
    norm += amp;
    amp *= gain;
    const rx = (OCTAVE_ROTATION.cosine * px - OCTAVE_ROTATION.sine * pz) * lacunarity;
    pz = (OCTAVE_ROTATION.sine * px + OCTAVE_ROTATION.cosine * pz) * lacunarity;
    px = rx;
  }
  return norm > 0 ? sum / norm : 0;
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
  } else if (
    biomeCategory.includes('nature') ||
    biomeCategory.includes('forest') ||
    groundSurface === 'grass-terrain'
  ) {
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
 * Evaluates the continuous 67.js domain-warped erosion & ridged multifractal elevation before grid triangulation.
 * Guarantees a 100% flat central acting circle (r <= clearingRadius, default 18m)
 * with a C1-continuous Hermite transition to surrounding hills/dunes/ridges.
 */
function evaluateAnalyticalHeight(
  x: number,
  z: number,
  config: ResolvedTerrainConfig,
  scratch: Float64Array,
  warpScratch: Float64Array
): number {
  if (config.profile === 'flat' || config.heightScale <= 0.001) {
    return 0;
  }

  const r = Math.hypot(x, z);
  const clearR = config.clearingRadius;
  if (r <= clearR) {
    return 0;
  }

  const blendSpan = 15;
  const clearMask = smoothstep(clearR, clearR + blendSpan, r);
  const octaves = config.detailLevel === 'hd' ? 6 : 4;
  const seed = config.seed;

  // 67.js Domain Warping (`sampleNoise` warp field)
  sampleNoiseWithGradient(x / 34, z / 34, seed + 31, warpScratch);
  const wx = x + warpScratch[0] * 8.5;
  const wz = z + warpScratch[0] * 6.0 + warpScratch[1] * 2.2;

  const baseNoiseSpec: Required<TerrainNoiseOptions> = {
    amplitude: 1,
    mountainAmplitude: 1,
    featureSize: 28,
    octaves,
    gain: 0.5,
    lacunarity: 2.0,
    warp: 8.5,
    warpFeatureSize: 34,
    baseHeight: 0,
  };

  let rawH = 0;
  switch (config.profile) {
    case 'rolling-hills': {
      // 67.js slope-damped erosionNoise (smooth valley flanks + textured crests) + subtle horizon rim
      const eroded = erosionNoise(wx, wz, baseNoiseSpec, seed, scratch);
      const ridgeAccent = ridgedNoise(
        wx,
        wz,
        { ...baseNoiseSpec, featureSize: 38, octaves: Math.max(3, octaves - 1) },
        seed + 19,
        scratch
      );
      const rimBoost = smoothstep(22, 54, r) * 3.6;
      rawH = Math.max(0, (eroded * 0.55 + 0.52) * 6.4 + ridgeAccent * 2.4 + rimBoost);
      break;
    }
    case 'mountain-ridge': {
      // 67.js ridgedNoise alpine peaks + eroded foothills
      const alpine = ridgedNoise(
        wx,
        wz,
        { ...baseNoiseSpec, featureSize: 32 },
        seed,
        scratch
      );
      const foothills = erosionNoise(wx, wz, { ...baseNoiseSpec, featureSize: 22 }, seed + 41, scratch);
      const horizonWall = smoothstep(25, 56, r) * 7.8;
      rawH = Math.max(0, alpine * 11.2 + foothills * 1.8 + horizonWall);
      break;
    }
    case 'canyon-valley': {
      // Central Z-corridor stays passable while left/right flanks rise into stratified eroded canyon cliffs
      const flankMask = smoothstep(14, 37, Math.abs(x));
      const eroded = erosionNoise(wx, wz, { ...baseNoiseSpec, featureSize: 24 }, seed, scratch) * 0.5 + 0.5;
      // Stratified sandstone benches blended with natural erosion
      const bench = Math.floor(eroded * 4.5) / 4.5;
      const strata = eroded * 0.35 + bench * 0.65;
      rawH = Math.max(0, flankMask * (5.2 + strata * 9.2 + smoothstep(28, 54, r) * 3.2));
      break;
    }
    case 'sand-dunes': {
      // Wind-swept asymmetric barchan dunes + domain-warped macro erg swells
      const windPhase = wx * 0.048 + wz * 0.024;
      const duneCrest = Math.pow(1.0 - Math.abs(Math.sin(windPhase * Math.PI)), 1.35);
      const macroErg = erosionNoise(wx, wz, { ...baseNoiseSpec, featureSize: 40 }, seed + 53, scratch) * 0.5 + 0.5;
      const ripple = config.detailLevel === 'hd' ? Math.sin(x * 1.35 + z * 0.55) * 0.07 : 0;
      rawH = Math.max(0, duneCrest * 4.8 + macroErg * 3.8 + smoothstep(25, 55, r) * 2.5 + ripple);
      break;
    }
    case 'coastal-slope': {
      // Flanking eroded coastal headlands/dunes + gentle backshore slope keeping -Z ocean clear
      const flank = smoothstep(20, 48, Math.abs(x));
      const headland = erosionNoise(wx, wz, { ...baseNoiseSpec, featureSize: 26 }, seed, scratch) * 0.5 + 0.5;
      const backShore = z > 10 ? smoothstep(10, 48, z) * 2.8 : 0;
      rawH = Math.max(0, flank * headland * 5.2 + backShore);
      break;
    }
  }

  return rawH * clearMask * config.heightScale;
}

function getTerrainGridKey(config: ResolvedTerrainConfig): string {
  return `${config.profile}|${config.heightScale.toFixed(3)}|${config.clearingRadius}|${config.seed}|${config.detailLevel}`;
}

function getOrBuildTerrainGrid(config: ResolvedTerrainConfig): CachedTerrainGrid {
  const key = getTerrainGridKey(config);
  const cached = terrainGridCache.get(key);
  if (cached) return cached;

  const segments = config.detailLevel === 'hd' ? 112 : 48;
  const side = segments + 1;
  const spacing = TERRAIN_WORLD_SIZE / segments;
  const heights = new Float32Array(side * side);
  const scratch = new Float64Array(3);
  const warpScratch = new Float64Array(3);

  for (let iy = 0; iy < side; iy++) {
    const worldZ = iy * spacing - TERRAIN_HALF_SIZE;
    for (let ix = 0; ix < side; ix++) {
      const worldX = ix * spacing - TERRAIN_HALF_SIZE;
      heights[iy * side + ix] = evaluateAnalyticalHeight(worldX, worldZ, config, scratch, warpScratch);
    }
  }

  if (terrainGridCache.size > 24) {
    const oldest = terrainGridCache.keys().next().value;
    if (oldest) terrainGridCache.delete(oldest);
  }

  const built: CachedTerrainGrid = { segments, side, spacing, heights };
  terrainGridCache.set(key, built);
  return built;
}

/**
 * Evaluates exact triangle-interpolated terrain height `heightAt(x, z)` matching
 * `THREE.PlaneGeometry`'s `(a, b, d)` / `(b, c, d)` diagonal (`fx + fz <= 1`) so trees,
 * clutter stones, actors, and vehicles rest on the rendered triangles with 0.000m error!
 */
export function evaluateTerrainHeight(
  x: number,
  z: number,
  config: ResolvedTerrainConfig
): number {
  if (config.profile === 'flat' || config.heightScale <= 0.001) {
    return 0;
  }
  // Inside the guaranteed central stage circle, return exact 0 immediately
  if (Math.hypot(x, z) <= config.clearingRadius - 1.5) {
    return 0;
  }

  const grid = getOrBuildTerrainGrid(config);
  const gx = clamp((x + TERRAIN_HALF_SIZE) / grid.spacing, 0, grid.segments);
  const gz = clamp((z + TERRAIN_HALF_SIZE) / grid.spacing, 0, grid.segments);
  const ix = Math.min(Math.floor(gx), grid.segments - 1);
  const iy = Math.min(Math.floor(gz), grid.segments - 1);
  const fx = gx - ix;
  const fz = gz - iy;

  const hA = grid.heights[iy * grid.side + ix]; // (0, 0)
  const hD = grid.heights[iy * grid.side + (ix + 1)]; // (1, 0)
  const hB = grid.heights[(iy + 1) * grid.side + ix]; // (0, 1)
  const hC = grid.heights[(iy + 1) * grid.side + (ix + 1)]; // (1, 1)

  if (fx + fz <= 1.0) {
    return hA + fx * (hD - hA) + fz * (hB - hA);
  }
  return hC + (1.0 - fx) * (hB - hC) + (1.0 - fz) * (hD - hC);
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

  const eps = 0.45;
  const hL = evaluateTerrainHeight(x - eps, z, config);
  const hR = evaluateTerrainHeight(x + eps, z, config);
  const hD = evaluateTerrainHeight(x, z - eps, config);
  const hU = evaluateTerrainHeight(x, z + eps, config);

  const dhdx = (hR - hL) / (2 * eps);
  const dhdz = (hU - hD) / (2 * eps);

  const normal = new THREE.Vector3(-dhdx, 1.0, -dhdz).normalize();
  const slopeRad = Math.acos(clamp(normal.y, -1, 1));
  const slopeDeg = (slopeRad * 180) / Math.PI;

  return { normal, slopeDeg, height: hC };
}

function resolveSplatTheme(config: ResolvedTerrainConfig): SplatBiomeTheme {
  if (config.profile === 'coastal-slope' || config.biomeCategory.includes('coastal')) {
    return 'coastal';
  }
  if (config.profile === 'canyon-valley') {
    return 'canyon';
  }
  if (config.profile === 'sand-dunes' || config.groundSurface === 'sand-dunes') {
    return 'desert';
  }
  return 'temperate';
}

/**
 * CPU evaluation of the 4-layer splat color (kept for vertex color attributes, tests, and fallback).
 */
export function evaluateTerrainSplatColor(
  x: number,
  z: number,
  height: number,
  slopeDeg: number,
  config: ResolvedTerrainConfig
): THREE.Color {
  const micro = fbm2D(x * 0.14, z * 0.14, config.seed + 211, 2) * 0.08;

  let layer0Valley = new THREE.Color(0x284624);
  let layer1MidSlope = new THREE.Color(0x3a3222);
  let layer2CliffRock = new THREE.Color(0x57534e);
  let layer3HighPeak = new THREE.Color(0xd6d3d1);

  if (config.profile === 'sand-dunes' || config.groundSurface === 'sand-dunes') {
    layer0Valley = new THREE.Color(0xb89658);
    layer1MidSlope = new THREE.Color(0xd4a959);
    layer2CliffRock = new THREE.Color(0x7c4f2b);
    layer3HighPeak = new THREE.Color(0xe8c478);
  } else if (config.profile === 'coastal-slope') {
    layer0Valley = new THREE.Color(0xc9ab74);
    layer1MidSlope = new THREE.Color(0xa38b5c);
    layer2CliffRock = new THREE.Color(0x64748b);
    layer3HighPeak = new THREE.Color(0x4d6b3c);
  } else if (config.profile === 'canyon-valley') {
    layer0Valley = new THREE.Color(0x5c4738);
    layer1MidSlope = new THREE.Color(0x8c583a);
    layer2CliffRock = new THREE.Color(0x6b442a);
    layer3HighPeak = new THREE.Color(0xa6754b);
  }

  const midWeight = smoothstep(0.25, 3.6, height + micro * 4.0);
  const col = layer0Valley.clone().lerp(layer1MidSlope, midWeight);

  const peakWeight = smoothstep(6.2, 10.5, height + micro * 3.0);
  col.lerp(layer3HighPeak, peakWeight);

  const rockWeight = smoothstep(25, 35, slopeDeg + micro * 12);
  col.lerp(layer2CliffRock, rockWeight);

  col.offsetHSL(0, 0, micro * 0.35);
  return col;
}

interface SplatUniformBundle {
  uSplatColorAtlas: { value: THREE.DataTexture };
  uSplatHRAtlas: { value: THREE.DataTexture };
  uSplatLayer: { value: THREE.Vector4[] };
  uSplatSlope: { value: THREE.Vector4[] };
  uSplatHeightRange: { value: THREE.Vector4[] };
  uSplatBlend: { value: THREE.Vector4 };
  uSplatVariation: { value: THREE.Vector4 };
}

/**
 * Creates or updates a dedicated MeshStandardMaterial wired with 67.js's real 4-layer GPU
 * Fragment Splat Shader (dual-scale anti-tiling, triplanar cliff projection, height-blend,
 * cavity darkening, and per-pixel micro-normal perturbation) without mutating the flat studio material.
 */
function getOrUpdateSplatTerrainMaterial(
  floorMesh: THREE.Mesh,
  config: ResolvedTerrainConfig
): THREE.MeshStandardMaterial {
  const theme = resolveSplatTheme(config);
  const atlas = getSplatBiomeAtlas(theme);

  let splatMat = floorMesh.userData._splatStandardMaterial as THREE.MeshStandardMaterial | undefined;
  let uniforms = floorMesh.userData._splatUniforms as SplatUniformBundle | undefined;

  if (!splatMat || !uniforms) {
    uniforms = {
      uSplatColorAtlas: { value: atlas.colorAtlas },
      uSplatHRAtlas: { value: atlas.heightRoughAtlas },
      uSplatLayer: {
        value: [
          new THREE.Vector4(3.8, 0.32, 0, 0), // Layer 0: Base Valley / Clearing (fallback layer, hasRules=0)
          new THREE.Vector4(4.4, 0.38, 0, 1), // Layer 1: Mid-Slope Loam / Sand / Strata
          new THREE.Vector4(5.2, 0.55, 1, 1), // Layer 2: Steep Cliff Rock (triplanar = 1!)
          new THREE.Vector4(4.0, 0.35, 0, 1), // Layer 3: High Crest / Scree / Dune Peak
        ],
      },
      uSplatSlope: {
        value: [
          new THREE.Vector4(0, 90, 4, 0),
          new THREE.Vector4(4, 34, 5, 1),
          new THREE.Vector4(27, 90, 4.5, 1), // Slope >= 27° -> Exposed Cliff Rock with Triplanar Projection!
          new THREE.Vector4(0, 38, 6, 1),
        ],
      },
      uSplatHeightRange: {
        value: [
          new THREE.Vector4(-100, 100, 1.5, 0),
          new THREE.Vector4(0.35, 7.2, 1.4, 1),
          new THREE.Vector4(-10, 100, 1.5, 0),
          new THREE.Vector4(6.4, 100, 1.8, 1),
        ],
      },
      uSplatBlend: {
        // heightBlend = 0.22, heightInfluence = 0.82, triplanarStart = 28°, triplanarEnd = 44°
        value: new THREE.Vector4(0.22, 0.82, 28.0, 44.0),
      },
      uSplatVariation: {
        // variation = 0.58, edgeNoise = 0.85, cavity = 0.45, seedOffset
        value: new THREE.Vector4(0.58, 0.85, 0.45, (config.seed % 97) * 1.37),
      },
    };

    const capturedUniforms = uniforms;
    splatMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.03,
      vertexColors: false,
    });
    splatMat.customProgramCacheKey = () => 'Vendor67_FourLayerTriplanarSplatMaterial_v1';
    splatMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSplatColorAtlas = capturedUniforms.uSplatColorAtlas;
      shader.uniforms.uSplatHRAtlas = capturedUniforms.uSplatHRAtlas;
      shader.uniforms.uSplatLayer = capturedUniforms.uSplatLayer;
      shader.uniforms.uSplatSlope = capturedUniforms.uSplatSlope;
      shader.uniforms.uSplatHeightRange = capturedUniforms.uSplatHeightRange;
      shader.uniforms.uSplatBlend = capturedUniforms.uSplatBlend;
      shader.uniforms.uSplatVariation = capturedUniforms.uSplatVariation;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vSplatWorldPos;
varying vec3 vSplatWorldNormal;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vSplatWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSplatWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
${SPLAT_FRAGMENT_PREAMBLE_GLSL}`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
vec3 splatAlbedo;
float splatRough;
vec3 splatWorldPerturb;
evaluateSplatGround(splatAlbedo, splatRough, splatWorldPerturb);
diffuseColor.rgb = splatAlbedo;
roughnessFactor = splatRough;
vec3 splatViewPerturb = (viewMatrix * vec4(splatWorldPerturb, 0.0)).xyz;
normal = normalize(normal + splatViewPerturb);`
      );
    };

    splatMat.userData.isSharedResource = true;
    splatMat.userData.is67SplatShader = true;
    floorMesh.userData._splatStandardMaterial = splatMat;
    floorMesh.userData._splatUniforms = uniforms;
  }

  // Update biome-specific uniforms in O(1) with zero WebGL shader recompilation
  uniforms.uSplatColorAtlas.value = atlas.colorAtlas;
  uniforms.uSplatHRAtlas.value = atlas.heightRoughAtlas;
  uniforms.uSplatVariation.value.set(
    theme === 'desert' ? 0.42 : 0.58,
    0.85,
    theme === 'desert' ? 0.3 : 0.48,
    (config.seed % 97) * 1.37
  );

  return splatMat;
}

/**
 * Applies the 67.js domain-warped heightfield + 4-Layer Triplanar GPU Splat Shader
 * directly to the stage's floor mesh while preserving flat studio floors cleanly.
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

  // Preserve the original clean studio/interior material before any splat swap
  if (!floorMesh.userData._baseStandardMaterial && floorMesh.material) {
    floorMesh.userData._baseStandardMaterial = floorMesh.material;
  }

  if (isFlat) {
    const baseMat = floorMesh.userData._baseStandardMaterial as THREE.MeshStandardMaterial | undefined;
    if (baseMat && floorMesh.material !== baseMat) {
      floorMesh.material = baseMat;
    }
    if (baseMat) {
      baseMat.vertexColors = false;
      baseMat.needsUpdate = true;
    }
  }

  const sig = `${config.profile}_${config.heightScale.toFixed(2)}_${config.clearingRadius}_${config.seed}_${config.detailLevel}_${config.groundSurface}`;
  if (floorMesh.userData._terrainSignature === sig) {
    if (!isFlat) {
      floorMesh.material = getOrUpdateSplatTerrainMaterial(floorMesh, config);
    }
    return config;
  }
  floorMesh.userData._terrainSignature = sig;
  floorMesh.userData.terrainConfig = config;

  if (floorMesh.geometry) {
    floorMesh.geometry.dispose();
  }

  const geo = new THREE.PlaneGeometry(TERRAIN_WORLD_SIZE, TERRAIN_WORLD_SIZE, segments, segments);

  if (isFlat) {
    floorMesh.geometry = geo;
    return config;
  }

  const grid = getOrBuildTerrainGrid(config);
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const vertexCount = posAttr.count;
  const colors = new Float32Array(vertexCount * 3);

  // PlaneGeometry iterates iy = 0..segments (y = iy * spacing - 60 -> worldZ = y) and ix = 0..segments (worldX = x)
  for (let i = 0; i < vertexCount; i++) {
    const worldX = posAttr.getX(i);
    const worldZ = -posAttr.getY(i);
    const height = grid.heights[i];
    posAttr.setZ(i, height);

    const { slopeDeg } = evaluateTerrainNormalAndSlope(worldX, worldZ, config);
    const splatColor = evaluateTerrainSplatColor(worldX, worldZ, height, slopeDeg, config);
    colors[i * 3] = splatColor.r;
    colors[i * 3 + 1] = splatColor.g;
    colors[i * 3 + 2] = splatColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  floorMesh.geometry = geo;
  floorMesh.material = getOrUpdateSplatTerrainMaterial(floorMesh, config);

  return config;
}
