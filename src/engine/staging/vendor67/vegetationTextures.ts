/**
 * Vendored & typed from codepawl/67.js `src/vegetation-textures.js` (MIT License, Copyright (c) 2026 CodePawl).
 * Procedural 128x128 RGBA textures for vegetation: leaf sprigs with alpha, needle sprays, blades,
 * crown clumps, and tileable bark with vertical furrows or birch lenticels.
 * Built in pure JavaScript typed arrays so Node/Vitest and WebGL2 share identical pixels without a DOM canvas.
 */

import * as THREE from 'three';
import { FULL_TURN, clamp, createRandom, valueNoise } from './vegetationGeometry';
import { BarkTextureKind, LeafTextureKind } from './vegetationSpecies';

const TEXTURE_SIZE = 128;

export interface PixelBufferRGBA {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const threeTextureCache = new Map<string, THREE.DataTexture>();

function createPixels(fillColor: readonly number[]): PixelBufferRGBA {
  const data = new Uint8ClampedArray(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = fillColor[0];
    data[offset + 1] = fillColor[1];
    data[offset + 2] = fillColor[2];
    data[offset + 3] = 0;
  }
  return { width: TEXTURE_SIZE, height: TEXTURE_SIZE, data };
}

function compositePixel(
  pixels: PixelBufferRGBA,
  x: number,
  y: number,
  color: readonly number[],
  coverage: number
): void {
  const offset = (y * pixels.width + x) * 4;
  const existingAlpha = pixels.data[offset + 3] / 255;
  const outputAlpha = coverage + existingAlpha * (1 - coverage);
  if (outputAlpha <= 0) return;
  for (let channel = 0; channel < 3; channel++) {
    const mixed =
      (color[channel] * coverage + pixels.data[offset + channel] * existingAlpha * (1 - coverage)) /
      outputAlpha;
    pixels.data[offset + channel] = mixed;
  }
  pixels.data[offset + 3] = outputAlpha * 255;
}

function paintLeaf(
  pixels: PixelBufferRGBA,
  {
    baseX,
    baseY,
    angle,
    length,
    width,
    color,
    shade,
  }: {
    baseX: number;
    baseY: number;
    angle: number;
    length: number;
    width: number;
    color: readonly number[];
    shade: number;
  }
): void {
  const axisX = Math.sin(angle);
  const axisY = -Math.cos(angle);
  const sideX = -axisY;
  const sideY = axisX;
  const reach = Math.ceil(length + width);
  const minimumY = Math.max(0, Math.floor(baseY - reach));
  const maximumY = Math.min(pixels.height - 1, Math.ceil(baseY + reach));
  const minimumX = Math.max(0, Math.floor(baseX - reach));
  const maximumX = Math.min(pixels.width - 1, Math.ceil(baseX + reach));
  for (let y = minimumY; y <= maximumY; y++) {
    for (let x = minimumX; x <= maximumX; x++) {
      const offsetX = x + 0.5 - baseX;
      const offsetY = y + 0.5 - baseY;
      const along = (offsetX * axisX + offsetY * axisY) / length;
      if (along < 0 || along > 1) continue;
      const across = offsetX * sideX + offsetY * sideY;
      const halfWidth = (width / 2) * Math.sin(Math.PI * along ** 0.7);
      const coverage = clamp(halfWidth - Math.abs(across) + 0.5, 0, 1);
      if (coverage <= 0) continue;
      const sideDistance = Math.abs(across) / (halfWidth + 1e-3);
      const midrib = Math.abs(across) < 0.7 ? 0.2 : 0;
      const vein = (along * 7 + sideDistance * 0.9) % 1 < 0.1 ? -0.1 : 0;
      const brightness = shade * (0.82 + 0.3 * (1 - sideDistance) + midrib + vein);
      compositePixel(
        pixels,
        x,
        y,
        color.map((channel) => channel * brightness),
        coverage
      );
    }
  }
}

function paintStem(
  pixels: PixelBufferRGBA,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: readonly number[]
): void {
  const steps = Math.ceil(Math.hypot(toX - fromX, toY - fromY) * 2);
  for (let step = 0; step <= steps; step++) {
    const progress = step / steps;
    const x = Math.round(fromX + (toX - fromX) * progress);
    const y = Math.round(fromY + (toY - fromY) * progress);
    for (let spread = 0; spread < 2; spread++) {
      if (x + spread < pixels.width && y >= 0 && y < pixels.height) {
        compositePixel(pixels, x + spread, y, color, 1);
      }
    }
  }
}

function paintSprig(pixels: PixelBufferRGBA, color: readonly number[], random: () => number): void {
  const stemColor = [color[0] * 0.55, color[1] * 0.5, color[2] * 0.4];
  paintStem(pixels, 64, 126, 64, 30, stemColor);
  for (let pair = 0; pair < 6; pair++) {
    const baseY = 106 - pair * 13;
    const length = 22 + 10 * Math.sin(((pair + 1) / 6) * Math.PI);
    for (const side of [-1, 1]) {
      const angle = side * (1.0 + random() * 0.3);
      paintLeaf(pixels, {
        baseX: 64,
        baseY: baseY - (side > 0 ? 6 : 0),
        angle,
        length,
        width: length * 0.55,
        color,
        shade: 0.85 + random() * 0.3,
      });
    }
  }
  paintLeaf(pixels, {
    baseX: 64,
    baseY: 44,
    angle: 0,
    length: 40,
    width: 25,
    color,
    shade: 1.05,
  });
}

function paintNeedleSpray(
  pixels: PixelBufferRGBA,
  color: readonly number[],
  random: () => number
): void {
  const stemColor = [color[0] * 0.7, color[1] * 0.6, color[2] * 0.5];
  paintStem(pixels, 64, 126, 64, 6, stemColor);
  for (let step = 0; step < 24; step++) {
    const baseY = 118 - step * 4.6;
    const length = 30 - step * 0.45 + random() * 4;
    for (const side of [-1, 1]) {
      paintLeaf(pixels, {
        baseX: 64,
        baseY,
        angle: side * (1.0 + random() * 0.2),
        length,
        width: 3.4,
        color,
        shade: 0.85 + random() * 0.3,
      });
    }
  }
}

function paintBlades(
  pixels: PixelBufferRGBA,
  color: readonly number[],
  random: () => number,
  count: number,
  width: number
): void {
  for (let blade = 0; blade < count; blade++) {
    const spread = count > 1 ? (blade / (count - 1) - 0.5) * 0.9 : 0;
    const length = 96 + random() * 28;
    paintLeaf(pixels, {
      baseX: 64 + spread * 40,
      baseY: 127,
      angle: spread + (random() - 0.5) * 0.12,
      length,
      width,
      color,
      shade: 0.8 + random() * 0.4,
    });
  }
}

function paintClump(pixels: PixelBufferRGBA, color: readonly number[], random: () => number): void {
  for (let leaf = 0; leaf < 150; leaf++) {
    const angle = random() * FULL_TURN;
    const radius = Math.sqrt(random()) * 46;
    paintLeaf(pixels, {
      baseX: 64 + Math.cos(angle) * radius,
      baseY: 64 + Math.sin(angle) * radius * 0.8,
      angle: random() * FULL_TURN,
      length: 24 + random() * 12,
      width: 16 + random() * 8,
      color,
      shade: 0.6 + random() * 0.6,
    });
  }
}

function bleedColorIntoTransparentPixels(pixels: PixelBufferRGBA, color: readonly number[]): void {
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    if (pixels.data[offset + 3] > 0) continue;
    pixels.data[offset] = color[0] * 0.8;
    pixels.data[offset + 1] = color[1] * 0.8;
    pixels.data[offset + 2] = color[2] * 0.8;
  }
}

const LEAF_PAINTERS: Record<
  LeafTextureKind,
  (pixels: PixelBufferRGBA, color: readonly number[], random: () => number) => void
> = {
  sprig: paintSprig,
  needles: paintNeedleSpray,
  single: (pixels, color, random) => paintBlades(pixels, color, random, 1, 38),
  grass: (pixels, color, random) => paintBlades(pixels, color, random, 9, 7),
  clump: paintClump,
};

/** RGBA leaf texture: stem base sits at bottom edge (y = 127 -> v = 1.0 with flipY=false), transparent elsewhere. */
export function createLeafPixels(
  kind: LeafTextureKind,
  color: readonly number[],
  seed: number = 1
): PixelBufferRGBA {
  const painter = LEAF_PAINTERS[kind];
  if (!painter) throw new RangeError(`Unknown leaf texture kind: ${kind}`);
  const pixels = createPixels(color);
  painter(pixels, color, createRandom(seed));
  bleedColorIntoTransparentPixels(pixels, color);
  return pixels;
}

const BARK_STYLES: Record<
  BarkTextureKind,
  { base: readonly [number, number, number]; crevice: number; stretch: number }
> = {
  rough: { base: [168, 142, 118], crevice: 0.28, stretch: 2 },
  birch: { base: [238, 235, 224], crevice: 0.12, stretch: 2 },
};

/** Opaque, tileable bark luminance texture with vertical furrows (rough) or dark lenticels (birch). */
export function createBarkPixels(kind: BarkTextureKind, seed: number = 1): PixelBufferRGBA {
  const style = BARK_STYLES[kind];
  if (!style) throw new RangeError(`Unknown bark texture kind: ${kind}`);
  const pixels = createPixels(style.base);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const unitX = x / TEXTURE_SIZE;
      const unitY = y / TEXTURE_SIZE;
      const furrow = valueNoise(unitX * 8, unitY * style.stretch, seed, 8, style.stretch);
      const fine = valueNoise(unitX * 24, unitY * 12, seed + 5, 24, 12);
      let brightness = 1 - style.crevice + style.crevice * (0.65 * furrow + 0.35 * fine) * 1.6;
      if (kind === 'birch') {
        const mark = valueNoise(unitX * 6, unitY * 40, seed + 9, 6, 40);
        if (mark > 0.7) brightness *= 0.28 + (1 - mark) * 1.6;
      } else {
        brightness *= 0.55 + 0.9 * furrow ** 1.4;
      }
      const offset = (y * TEXTURE_SIZE + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        pixels.data[offset + channel] = clamp(style.base[channel] * brightness, 0, 255);
      }
      pixels.data[offset + 3] = 255;
    }
  }
  return pixels;
}

/**
 * Cached shared THREE.DataTexture for alpha-masked foliage cards (`flipY = false` matches `v = 1 - progress`).
 */
export function getLeafDataTexture(
  kind: LeafTextureKind,
  color: readonly [number, number, number]
): THREE.DataTexture {
  const key = `leaf:${kind}:${color.join(',')}`;
  const cached = threeTextureCache.get(key);
  if (cached) return cached;

  const pixels = createLeafPixels(kind, color, 1);
  const data = new Uint8Array(pixels.data.buffer);
  const tex = new THREE.DataTexture(data, pixels.width, pixels.height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.userData.isSharedResource = true;
  tex.needsUpdate = true;

  threeTextureCache.set(key, tex);
  return tex;
}

/**
 * Cached shared THREE.DataTexture for tileable tree bark (`rough` oak/pine/palm or `birch` white lenticel bark).
 */
export function getBarkDataTexture(kind: BarkTextureKind): THREE.DataTexture {
  const key = `bark:${kind}`;
  const cached = threeTextureCache.get(key);
  if (cached) return cached;

  const pixels = createBarkPixels(kind, 1);
  const data = new Uint8Array(pixels.data.buffer);
  const tex = new THREE.DataTexture(data, pixels.width, pixels.height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.userData.isSharedResource = true;
  tex.needsUpdate = true;

  threeTextureCache.set(key, tex);
  return tex;
}
