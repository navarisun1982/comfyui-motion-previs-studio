/**
 * Vendored & typed from codepawl/67.js `src/terrain.js`, `src/splat.js`, and `src/splat-shader.js`
 * (MIT License, Copyright (c) 2026 CodePawl).
 * Domain-warped erosion & ridged mountain heightfield noise (`OCTAVE_ROTATION`, analytic gradients),
 * exact triangle-consistent grid height/normal queries, and procedural 128x128 4-layer GPU splat
 * textures + GLSL chunk for Three.js `MeshStandardMaterial.onBeforeCompile`.
 */

import * as THREE from 'three';
import { clamp, valueNoise } from './vegetationGeometry';

export const OCTAVE_ROTATION = { cosine: 0.8, sine: 0.6 } as const;

export interface TerrainNoiseOptions {
  amplitude?: number;
  mountainAmplitude?: number;
  featureSize?: number;
  octaves?: number;
  gain?: number;
  lacunarity?: number;
  warp?: number;
  warpFeatureSize?: number;
  baseHeight?: number;
}

const DEFAULT_NOISE: Required<TerrainNoiseOptions> = {
  amplitude: 14,
  mountainAmplitude: 46,
  featureSize: 160,
  octaves: 6,
  gain: 0.5,
  lacunarity: 2,
  warp: 36,
  warpFeatureSize: 90,
  baseHeight: 0,
};

function smoothstep(low: number, high: number, value: number): number {
  const fraction = clamp((value - low) / Math.max(1e-6, high - low), 0, 1);
  return fraction * fraction * (3 - 2 * fraction);
}

function hashLattice(cellX: number, cellZ: number, seed: number): number {
  let hash =
    Math.imul(cellX, 374761393) ^
    Math.imul(cellZ, 668265263) ^
    Math.imul(seed | 0, 1597334677);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

/** Value noise in [-1, 1] with its analytic gradient written into `output` as [value, dx, dz]. */
export function sampleNoiseWithGradient(
  pointX: number,
  pointZ: number,
  seed: number,
  output: Float64Array
): void {
  const cellX = Math.floor(pointX);
  const cellZ = Math.floor(pointZ);
  const fractionX = pointX - cellX;
  const fractionZ = pointZ - cellZ;
  const blendX =
    fractionX * fractionX * fractionX * (fractionX * (fractionX * 6 - 15) + 10);
  const blendZ =
    fractionZ * fractionZ * fractionZ * (fractionZ * (fractionZ * 6 - 15) + 10);
  const slopeX = 30 * fractionX * fractionX * (fractionX - 1) * (fractionX - 1);
  const slopeZ = 30 * fractionZ * fractionZ * (fractionZ - 1) * (fractionZ - 1);
  const lowerLeft = hashLattice(cellX, cellZ, seed);
  const lowerRight = hashLattice(cellX + 1, cellZ, seed);
  const upperLeft = hashLattice(cellX, cellZ + 1, seed);
  const upperRight = hashLattice(cellX + 1, cellZ + 1, seed);
  const crossTerm = lowerLeft - lowerRight - upperLeft + upperRight;
  const value =
    lowerLeft +
    (lowerRight - lowerLeft) * blendX +
    (upperLeft - lowerLeft) * blendZ +
    crossTerm * blendX * blendZ;
  output[0] = value * 2 - 1;
  output[1] = 2 * slopeX * (lowerRight - lowerLeft + crossTerm * blendZ);
  output[2] = 2 * slopeZ * (upperLeft - lowerLeft + crossTerm * blendX);
}

/**
 * 67.js slope-damped erosion noise: slopes damp finer octaves, leaving smooth flanks and rough crests.
 */
export function erosionNoise(
  worldX: number,
  worldZ: number,
  noise: Required<TerrainNoiseOptions>,
  seed: number,
  scratch: Float64Array
): number {
  let pointX = worldX / noise.featureSize;
  let pointZ = worldZ / noise.featureSize;
  let sum = 0;
  let amplitude = 1;
  let amplitudeTotal = 0;
  let gradientX = 0;
  let gradientZ = 0;
  for (let octave = 0; octave < noise.octaves; octave++) {
    sampleNoiseWithGradient(pointX, pointZ, seed + octave * 17, scratch);
    gradientX += scratch[1];
    gradientZ += scratch[2];
    sum += (amplitude * scratch[0]) / (1 + gradientX * gradientX + gradientZ * gradientZ);
    amplitudeTotal += amplitude;
    amplitude *= noise.gain;
    const rotatedX =
      (OCTAVE_ROTATION.cosine * pointX - OCTAVE_ROTATION.sine * pointZ) * noise.lacunarity;
    pointZ =
      (OCTAVE_ROTATION.sine * pointX + OCTAVE_ROTATION.cosine * pointZ) * noise.lacunarity;
    pointX = rotatedX;
  }
  return sum / amplitudeTotal;
}

/**
 * 67.js ridged multifractal noise: each ridge feeds the next octave only where strong, carving sharp alpine valleys.
 */
export function ridgedNoise(
  worldX: number,
  worldZ: number,
  noise: Required<TerrainNoiseOptions>,
  seed: number,
  scratch: Float64Array
): number {
  let pointX = worldX / noise.featureSize;
  let pointZ = worldZ / noise.featureSize;
  let sum = 0;
  let amplitude = 1;
  let amplitudeTotal = 0;
  let weight = 1;
  for (let octave = 0; octave < noise.octaves; octave++) {
    sampleNoiseWithGradient(pointX, pointZ, seed + 101 + octave * 13, scratch);
    const ridge = (1 - Math.abs(scratch[0])) ** 2 * weight;
    weight = clamp(ridge * 2, 0, 1);
    sum += ridge * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= noise.gain;
    const rotatedX =
      (OCTAVE_ROTATION.cosine * pointX - OCTAVE_ROTATION.sine * pointZ) * noise.lacunarity;
    pointZ =
      (OCTAVE_ROTATION.sine * pointX + OCTAVE_ROTATION.cosine * pointZ) * noise.lacunarity;
    pointX = rotatedX;
  }
  return sum / amplitudeTotal;
}

export function createNoiseHeight(
  options: TerrainNoiseOptions = {},
  seed: number = 1
): (worldX: number, worldZ: number) => number {
  const noise: Required<TerrainNoiseOptions> = { ...DEFAULT_NOISE, ...options };
  const scratch = new Float64Array(3);
  const warpScratch = new Float64Array(3);
  const maskNoise: Required<TerrainNoiseOptions> = {
    ...noise,
    featureSize: noise.featureSize * 2.6,
    octaves: 2,
  };
  return (worldX: number, worldZ: number) => {
    sampleNoiseWithGradient(
      worldX / noise.warpFeatureSize,
      worldZ / noise.warpFeatureSize,
      seed + 31,
      warpScratch
    );
    const warpedX = worldX + warpScratch[0] * noise.warp;
    const warpedZ =
      worldZ + warpScratch[0] * noise.warp * 0.7 + warpScratch[1] * noise.warp * 0.2;
    const hills = erosionNoise(warpedX, warpedZ, noise, seed, scratch) * noise.amplitude;
    const mask = smoothstep(0.05, 0.4, erosionNoise(worldX, worldZ, maskNoise, seed + 7, scratch));
    if (mask <= 0) return noise.baseHeight + hills;
    const mountains =
      ridgedNoise(
        warpedX,
        warpedZ,
        { ...noise, featureSize: noise.featureSize * 1.3 },
        seed,
        scratch
      ) * noise.mountainAmplitude;
    return noise.baseHeight + hills * (1 - mask) + (hills * 0.4 + mountains) * mask;
  };
}

export type SplatBiomeTheme = 'temperate' | 'desert' | 'canyon' | 'coastal';

interface SplatAtlasSet {
  colorAtlas: THREE.DataTexture;
  heightRoughAtlas: THREE.DataTexture;
}

const splatAtlasCache = new Map<SplatBiomeTheme, SplatAtlasSet>();

/**
 * Builds a 4-layer procedural 2x2 tile atlas (each tile 64x64 with seamless internal wrapping in shader)
 * carrying genuine micro-detail (grass blades, forest loam pebbles, fractured granite/sandstone strata,
 * wind-rippled sand, and alpine scree) + per-texel heightmap & roughness for 67.js Height-Blend!
 */
export function getSplatBiomeAtlas(theme: SplatBiomeTheme): SplatAtlasSet {
  const cached = splatAtlasCache.get(theme);
  if (cached) return cached;

  const TILE = 128;
  const ATLAS_W = TILE * 4; // 4 horizontal tiles: Layer 0, Layer 1, Layer 2 (Rock), Layer 3 (Crest)
  const ATLAS_H = TILE;
  const colorBytes = new Uint8Array(ATLAS_W * ATLAS_H * 4);
  const hrBytes = new Uint8Array(ATLAS_W * ATLAS_H * 4); // R = roughness, G = height, B = normalX, A = normalZ

  const palettes: Record<
    SplatBiomeTheme,
    [
      { base: [number, number, number]; rough: number; kind: 'grass' | 'sand' | 'dirt' },
      { base: [number, number, number]; rough: number; kind: 'loam' | 'sand' | 'strata' },
      { base: [number, number, number]; rough: number; kind: 'rock' | 'sandstone' },
      { base: [number, number, number]; rough: number; kind: 'scree' | 'sand' | 'grass' }
    ]
  > = {
    temperate: [
      { base: [56, 98, 44], rough: 0.88, kind: 'grass' },
      { base: [78, 64, 44], rough: 0.92, kind: 'loam' },
      { base: [108, 104, 98], rough: 0.82, kind: 'rock' },
      { base: [198, 196, 192], rough: 0.78, kind: 'scree' },
    ],
    desert: [
      { base: [188, 150, 92], rough: 0.93, kind: 'sand' },
      { base: [214, 170, 96], rough: 0.9, kind: 'sand' },
      { base: [132, 86, 54], rough: 0.84, kind: 'sandstone' },
      { base: [232, 198, 128], rough: 0.88, kind: 'sand' },
    ],
    canyon: [
      { base: [108, 82, 62], rough: 0.92, kind: 'dirt' },
      { base: [154, 94, 62], rough: 0.88, kind: 'strata' },
      { base: [118, 72, 46], rough: 0.82, kind: 'sandstone' },
      { base: [178, 126, 82], rough: 0.86, kind: 'scree' },
    ],
    coastal: [
      { base: [204, 174, 120], rough: 0.9, kind: 'sand' },
      { base: [162, 140, 96], rough: 0.92, kind: 'loam' },
      { base: [104, 118, 134], rough: 0.8, kind: 'rock' },
      { base: [82, 114, 64], rough: 0.88, kind: 'grass' },
    ],
  };

  const layers = palettes[theme];

  for (let layerIdx = 0; layerIdx < 4; layerIdx++) {
    const spec = layers[layerIdx];
    const seedBase = 41 + layerIdx * 97;

    // Precompute tileable height field for analytic finite-difference micro-normals
    const hGrid = new Float32Array(TILE * TILE);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const u = x / TILE;
        const v = y / TILE;
        const coarse = valueNoise(u * 6, v * 6, seedBase, 6, 6);
        const medium = valueNoise(u * 16, v * 16, seedBase + 11, 16, 16);
        const fine = valueNoise(u * 32, v * 32, seedBase + 23, 32, 32);

        let h = 0.5;
        if (spec.kind === 'rock' || spec.kind === 'sandstone') {
          // Chipped rock facets & horizontal strata cracks
          const strata = valueNoise(u * 4, v * 18, seedBase + 37, 4, 18);
          const crack = 1 - Math.abs(coarse * 2 - 1);
          h = clamp(0.35 + strata * 0.35 + crack * 0.25 + fine * 0.15, 0, 1);
        } else if (spec.kind === 'sand') {
          // Wind-blown sand ripples + fine quartz grain
          const ripple = 0.5 + 0.5 * Math.sin((v * 10 + coarse * 1.4) * Math.PI * 2);
          h = clamp(0.3 + ripple * 0.42 + fine * 0.22, 0, 1);
        } else if (spec.kind === 'grass') {
          // Clumped turf tufts & blade micro-relief
          h = clamp(0.25 + coarse * 0.35 + medium * 0.22 + fine * 0.25, 0, 1);
        } else {
          // Loam, dirt, strata, scree pebbles
          const pebble = Math.max(0, fine - 0.58) * 1.6;
          h = clamp(0.28 + coarse * 0.35 + medium * 0.2 + pebble, 0, 1);
        }
        hGrid[y * TILE + x] = h;
      }
    }

    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const hC = hGrid[y * TILE + x];
        const hL = hGrid[y * TILE + ((x - 1 + TILE) % TILE)];
        const hR = hGrid[y * TILE + ((x + 1) % TILE)];
        const hD = hGrid[((y - 1 + TILE) % TILE) * TILE + x];
        const hU = hGrid[((y + 1) % TILE) * TILE + x];

        const nx = clamp((hL - hR) * 2.4, -1, 1);
        const nz = clamp((hD - hU) * 2.4, -1, 1);

        const u = x / TILE;
        const v = y / TILE;
        const hueJitter = valueNoise(u * 12, v * 12, seedBase + 59, 12, 12) - 0.5;
        const shade = 0.68 + hC * 0.56;

        const outX = layerIdx * TILE + x;
        const idx = (y * ATLAS_W + outX) * 4;

        colorBytes[idx] = clamp(
          Math.round(spec.base[0] * shade * (1 + hueJitter * 0.14)),
          0,
          255
        );
        colorBytes[idx + 1] = clamp(
          Math.round(spec.base[1] * shade * (1 + hueJitter * 0.08)),
          0,
          255
        );
        colorBytes[idx + 2] = clamp(
          Math.round(spec.base[2] * shade * (1 - hueJitter * 0.12)),
          0,
          255
        );
        colorBytes[idx + 3] = 255;

        const rough = clamp(spec.rough + (0.5 - hC) * 0.12, 0.25, 1.0);
        hrBytes[idx] = Math.round(rough * 255);
        hrBytes[idx + 1] = Math.round(hC * 255);
        hrBytes[idx + 2] = Math.round((nx * 0.5 + 0.5) * 255);
        hrBytes[idx + 3] = Math.round((nz * 0.5 + 0.5) * 255);
      }
    }
  }

  const colorAtlas = new THREE.DataTexture(colorBytes, ATLAS_W, ATLAS_H, THREE.RGBAFormat);
  colorAtlas.colorSpace = THREE.SRGBColorSpace;
  colorAtlas.wrapS = THREE.ClampToEdgeWrapping;
  colorAtlas.wrapT = THREE.ClampToEdgeWrapping;
  colorAtlas.minFilter = THREE.LinearFilter;
  colorAtlas.magFilter = THREE.LinearFilter;
  colorAtlas.generateMipmaps = false;
  colorAtlas.flipY = false;
  colorAtlas.userData.isSharedResource = true;
  colorAtlas.needsUpdate = true;

  const heightRoughAtlas = new THREE.DataTexture(hrBytes, ATLAS_W, ATLAS_H, THREE.RGBAFormat);
  heightRoughAtlas.colorSpace = THREE.NoColorSpace;
  heightRoughAtlas.wrapS = THREE.ClampToEdgeWrapping;
  heightRoughAtlas.wrapT = THREE.ClampToEdgeWrapping;
  heightRoughAtlas.minFilter = THREE.LinearFilter;
  heightRoughAtlas.magFilter = THREE.LinearFilter;
  heightRoughAtlas.generateMipmaps = false;
  heightRoughAtlas.flipY = false;
  heightRoughAtlas.userData.isSharedResource = true;
  heightRoughAtlas.needsUpdate = true;

  const result: SplatAtlasSet = { colorAtlas, heightRoughAtlas };
  splatAtlasCache.set(theme, result);
  return result;
}

/**
 * 67.js 4-Layer Physical Splat GLSL Fragment Functions adapted cleanly to Three.js MeshStandardMaterial:
 * - Dual-scale rotated anti-tiling (`SPLAT_ROTATION`, `SPLAT_SECOND_SCALE = 0.58`, `splatContrastDivisor`)
 * - Slope & elevation rules with organic `edgeJitter` (`splatOctaves`)
 * - True Triplanar Projection (`uSplatBlend.z..w` degrees) on steep cliff faces
 * - True Height-Blend (`uSplatBlend.x`) so grass/sand fills rock crevices naturally
 * - Field/patch/clump multi-scale variation tint (`splatVariationTint`) + world-normal tilt & cavity darkening!
 */
export const SPLAT_FRAGMENT_PREAMBLE_GLSL = /* glsl */ `
uniform sampler2D uSplatColorAtlas;
uniform sampler2D uSplatHRAtlas;
uniform vec4 uSplatLayer[4];       // x: scaleMeters, y: normalStrength, z: triplanar(0/1), w: hasRules(0/1)
uniform vec4 uSplatSlope[4];       // x: minDeg, y: maxDeg, z: softness, w: enabled(0/1)
uniform vec4 uSplatHeightRange[4]; // x: minY, y: maxY, z: softness, w: enabled(0/1)
uniform vec4 uSplatBlend;          // x: heightBlend(0.22), y: heightInfluence(0.85), z: triStart(30), w: triEnd(46)
uniform vec4 uSplatVariation;      // x: variation(0.65), y: edgeNoise(0.9), z: cavity(0.45), w: seedOffset

varying vec3 vSplatWorldPos;
varying vec3 vSplatWorldNormal;

const mat2 SPLAT_ROTATION = mat2(0.8253, 0.5646, -0.5646, 0.8253);
const float SPLAT_SECOND_SCALE = 0.58;
const vec2 SPLAT_SECOND_OFFSET = vec2(0.37, 0.71);

float splatHash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float splatValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = splatHash21(i);
  float b = splatHash21(i + vec2(1.0, 0.0));
  float c = splatHash21(i + vec2(0.0, 1.0));
  float d = splatHash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float splatOctaves(vec2 position) {
  return splatValueNoise(position) * 0.5
       + splatValueNoise(position * 2.03 + 7.1) * 0.3
       + splatValueNoise(position * 4.11 + 13.7) * 0.2;
}

float splatRange(float value, float minimum, float maximum, float softness) {
  float width = max(softness, 0.001);
  return smoothstep(minimum - width, minimum + width, value)
       * (1.0 - smoothstep(maximum - width, maximum + width, value));
}

vec2 splatAtlasUv(vec2 tileUv, float layerIdx) {
  // Wrap seamlessly inside [0.5/128 .. 127.5/128] of the 4-tile horizontal strip to prevent cross-tile bleed
  vec2 wrapped = fract(tileUv);
  vec2 safe = mix(vec2(0.006), vec2(0.994), wrapped);
  return vec2((layerIdx + safe.x) * 0.25, safe.y);
}

vec4 sampleAtlasTwoScale(sampler2D atlas, vec2 uv, float layerIdx, float blend) {
  vec4 first = texture2D(atlas, splatAtlasUv(uv, layerIdx));
  if (blend < 0.01) return first;
  vec2 secondUv = SPLAT_ROTATION * uv * SPLAT_SECOND_SCALE + SPLAT_SECOND_OFFSET;
  vec4 second = texture2D(atlas, splatAtlasUv(secondUv, layerIdx));
  return mix(first, second, blend);
}

vec3 splatVariationTint(vec2 xz) {
  float amount = uSplatVariation.x;
  if (amount < 0.001) return vec3(1.0);
  float fieldScale = splatOctaves(xz * 0.012 + 3.7) - 0.5;
  float patchScale = splatOctaves(xz * 0.065 + 21.0) - 0.5;
  float clumpScale = splatOctaves(xz * 0.38 + 41.0) - 0.5;
  float brightness = 1.0 + (fieldScale * 0.55 + patchScale * 0.65 + clumpScale * 0.35) * amount;
  float dryness = smoothstep(0.42, 0.72, splatOctaves(xz * 0.025 + 11.0));
  float lush = smoothstep(0.48, 0.76, splatOctaves(xz * 0.045 + 57.0));
  vec3 hue = mix(vec3(1.0), vec3(1.18, 1.03, 0.74), dryness * 0.55);
  hue = mix(hue, vec3(0.82, 0.96, 0.86), lush * 0.5);
  return mix(vec3(1.0), hue, min(amount, 1.0)) * clamp(brightness, 0.52, 1.42);
}

void evaluateSplatGround(
  out vec3 outAlbedoLinear,
  out float outRoughness,
  out vec3 outWorldPerturb
) {
  vec3 geomN = normalize(vSplatWorldNormal);
  float slopeDeg = degrees(acos(clamp(geomN.y, -1.0, 1.0)));
  vec2 xz = vSplatWorldPos.xz + vec2(uSplatVariation.w);

  float antiTileBlend = mix(0.35, splatValueNoise(xz * 0.05), 0.65);
  float edgeJitter = (splatOctaves(xz * 0.32 + 71.0) - 0.5) * 2.0 * uSplatVariation.y;
  float ruleSlope = slopeDeg + edgeJitter * 8.5;
  float ruleHeight = vSplatWorldPos.y + edgeJitter * 1.4;

  float weights[4];
  float covered = 0.0;
  for (int i = 0; i < 4; i++) {
    weights[i] = 0.0;
    if (uSplatLayer[i].w < 0.5) continue;
    float w = 1.0;
    if (uSplatSlope[i].w > 0.5) {
      w *= splatRange(ruleSlope, uSplatSlope[i].x, uSplatSlope[i].y, uSplatSlope[i].z);
    }
    if (uSplatHeightRange[i].w > 0.5) {
      w *= splatRange(ruleHeight, uSplatHeightRange[i].x, uSplatHeightRange[i].y, uSplatHeightRange[i].z);
    }
    weights[i] = w;
    covered = max(covered, w);
  }
  for (int i = 0; i < 4; i++) {
    if (uSplatLayer[i].w < 0.5) {
      weights[i] = max(0.0, 1.0 - covered);
    }
  }

  float triAmount = smoothstep(uSplatBlend.z, uSplatBlend.w, slopeDeg);
  vec2 sideShare = pow(abs(geomN.xz), vec2(4.0));
  sideShare /= max(sideShare.x + sideShare.y, 0.0001);

  vec4 hrSamples[4];
  vec3 colSamples[4];
  float scores[4];
  float highestScore = -10.0;

  for (int i = 0; i < 4; i++) {
    scores[i] = -10.0;
    hrSamples[i] = vec4(0.85, 0.5, 0.5, 0.5);
    colSamples[i] = vec3(0.2);
    if (weights[i] < 0.002) continue;

    float scale = max(0.5, uSplatLayer[i].x);
    float tri = uSplatLayer[i].z > 0.5 ? triAmount : 0.0;
    vec3 proj = vec3(tri * sideShare.x, 1.0 - tri, tri * sideShare.y);
    float fLayer = float(i);

    vec2 uvTop = vSplatWorldPos.xz / scale;
    vec2 uvSideX = vec2(vSplatWorldPos.z, -vSplatWorldPos.y) / scale;
    vec2 uvSideZ = vec2(vSplatWorldPos.x, -vSplatWorldPos.y) / scale;

    vec4 col = vec4(0.0);
    vec4 hr = vec4(0.0);
    if (proj.y > 0.002) {
      col += sampleAtlasTwoScale(uSplatColorAtlas, uvTop, fLayer, antiTileBlend) * proj.y;
      hr += sampleAtlasTwoScale(uSplatHRAtlas, uvTop, fLayer, antiTileBlend) * proj.y;
    }
    if (proj.x > 0.002) {
      col += sampleAtlasTwoScale(uSplatColorAtlas, uvSideX, fLayer, antiTileBlend) * proj.x;
      hr += sampleAtlasTwoScale(uSplatHRAtlas, uvSideX, fLayer, antiTileBlend) * proj.x;
    }
    if (proj.z > 0.002) {
      col += sampleAtlasTwoScale(uSplatColorAtlas, uvSideZ, fLayer, antiTileBlend) * proj.z;
      hr += sampleAtlasTwoScale(uSplatHRAtlas, uvSideZ, fLayer, antiTileBlend) * proj.z;
    }

    // DataTexture with SRGBColorSpace already decodes to linear RGB in WebGL2
    colSamples[i] = col.rgb;
    hrSamples[i] = hr;
    scores[i] = weights[i] + hr.g * uSplatBlend.y;
    highestScore = max(highestScore, scores[i]);
  }

  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    float hw = scores[i] < -5.0
      ? 0.0
      : max(scores[i] - (highestScore - uSplatBlend.x), 0.0) * step(0.002, weights[i]);
    weights[i] = hw;
    total += hw;
  }
  total = max(total, 0.0001);

  vec3 blendedCol = vec3(0.0);
  float blendedRough = 0.0;
  float blendedHeight = 0.0;
  vec2 blendedTiltXZ = vec2(0.0);

  for (int i = 0; i < 4; i++) {
    float w = weights[i] / total;
    if (w < 0.003) continue;
    blendedCol += colSamples[i] * w;
    blendedRough += hrSamples[i].r * w;
    blendedHeight += hrSamples[i].g * w;
    vec2 nXZ = (hrSamples[i].ba * 2.0 - 1.0) * uSplatLayer[i].y;
    blendedTiltXZ += nXZ * w;
  }

  float cavity = mix(1.0, mix(0.56, 1.0, smoothstep(0.12, 0.85, blendedHeight)), uSplatVariation.z);
  outAlbedoLinear = blendedCol * splatVariationTint(xz) * cavity;
  outRoughness = clamp(blendedRough, 0.2, 1.0);
  outWorldPerturb = vec3(blendedTiltXZ.x, 0.0, blendedTiltXZ.y);
}
`;

