/**
 * Silhouette extraction, measurement, and 2D IoU scoring for ComfyUI Motion Previs Studio.
 *
 * Provides real, deterministic measurements:
 * 1. extractSilhouette: extracts foreground binary mask from an image or canvas.
 * 2. measureSilhouette: calculates aspect ratio, bounding box, and 10-band vertical width profile.
 * 3. renderOrthographicSilhouette: renders front-view silhouette mask of a SculptSpec in Three.js.
 * 4. computeSilhouetteIoU: calculates true Intersection-over-Union (0..1) between two masks.
 */
import * as THREE from 'three';
import { SculptSpec, buildSculpt } from './sculptSpec';

export interface SilhouetteMask {
  width: number;
  height: number;
  /** 1 for foreground, 0 for background. Length = width * height. */
  data: Uint8Array;
}

export interface SilhouetteMetrics {
  aspectRatio: number; // height / width
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  centerOfMass: [number, number];
  /** 10 normalized width measurements from bottom (0 = base/feet) to top (9 = head/crown). */
  widthProfile: number[];
  promptDescription: string;
}

/**
/**
 * Labels connected components and keeps only the central dominant subject(s),
 * pruning small disconnected noise (such as scattered coffee beans, table crumbs, or floor vignetting).
 */
export function isolateDominantSubject(
  data: Uint8Array,
  width: number,
  height: number,
  minAreaRatio = 0.04
): Uint8Array {
  const size = width * height;
  const labels = new Int32Array(size).fill(-1);
  const components: {
    id: number;
    count: number;
    sumX: number;
    sumY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }[] = [];

  let currentLabel = 0;
  const queue = new Int32Array(size);

  // 4-connectivity BFS labeling
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (data[idx] === 1 && labels[idx] === -1) {
        let qHead = 0;
        let qTail = 0;
        queue[qTail++] = idx;
        labels[idx] = currentLabel;

        let count = 0;
        let sumX = 0;
        let sumY = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;

        while (qHead < qTail) {
          const curr = queue[qHead++];
          const cy = Math.floor(curr / width);
          const cx = curr % width;

          count++;
          sumX += cx;
          sumY += cy;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // 4 neighbors
          const neighbors = [
            cy > 0 ? curr - width : -1,
            cy < height - 1 ? curr + width : -1,
            cx > 0 ? curr - 1 : -1,
            cx < width - 1 ? curr + 1 : -1,
          ];

          for (const n of neighbors) {
            if (n >= 0 && data[n] === 1 && labels[n] === -1) {
              labels[n] = currentLabel;
              queue[qTail++] = n;
            }
          }
        }

        components.push({
          id: currentLabel,
          count,
          sumX,
          sumY,
          minX,
          maxX,
          minY,
          maxY,
        });
        currentLabel++;
      }
    }
  }

  if (components.length <= 1) {
    return data;
  }

  // Score each component: prioritize high pixel count and proximity to image center
  const scored = components.map((c) => {
    const avgX = c.sumX / c.count;
    const avgY = c.sumY / c.count;
    const dx = (avgX - width / 2) / width;
    const dy = (avgY - height / 2) / height;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
    // Score heavily favors larger components and penalizes those far in corners
    const score = c.count / (1 + 2.5 * distFromCenter);
    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const dominant = scored[0];
  const dominantArea = dominant.count;

  // Keep the dominant component plus any closely associated substantial components (e.g. cap, base, accessories)
  // Prune disconnected small specks (beans, crumbs, table reflections)
  const keepLabels = new Set<number>();
  keepLabels.add(dominant.id);

  const domWidth = dominant.maxX - dominant.minX + 1;
  const domHeight = dominant.maxY - dominant.minY + 1;

  for (let i = 1; i < scored.length; i++) {
    const c = scored[i];
    const areaRatio = c.count / dominantArea;
    if (areaRatio < minAreaRatio) {
      // Discard small noise/scattered specks
      continue;
    }
    // Check if it's horizontally aligned with or adjacent to the dominant subject
    const horizOverlap = !(c.maxX < dominant.minX - domWidth * 0.35 || c.minX > dominant.maxX + domWidth * 0.35);
    const vertClose = !(c.maxY < dominant.minY - domHeight * 0.25 || c.minY > dominant.maxY + domHeight * 0.25);
    if (horizOverlap && vertClose && areaRatio >= 0.08) {
      keepLabels.add(c.id);
    }
  }

  const result = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    if (labels[i] >= 0 && keepLabels.has(labels[i])) {
      result[i] = 1;
    }
  }

  return result;
}

/**
 * Extracts a binary silhouette mask from raw RGBA pixel data.
 * If transparent pixels exist, uses alpha channel (alpha > 30).
 * Otherwise detects background by perimeter border sampling and thresholds color distance,
 * followed by Connected Component Analysis (CCA) to isolate the central dominant subject.
 */
export function extractMaskFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  colorThreshold = 28
): SilhouetteMask {
  const data = new Uint8Array(width * height);
  let hasAlpha = false;

  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 220) {
      hasAlpha = true;
      break;
    }
  }

  if (hasAlpha) {
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      data[p] = rgba[i + 3] > 40 ? 1 : 0;
    }
    const filtered = isolateDominantSubject(data, width, height, 0.03);
    return { width, height, data: filtered };
  }

  // Sample perimeter border pixels for robust background estimation
  let sumR = 0, sumG = 0, sumB = 0, borderCount = 0;
  const samplePixel = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    sumR += rgba[idx];
    sumG += rgba[idx + 1];
    sumB += rgba[idx + 2];
    borderCount++;
  };

  // Sample top and bottom rows
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 32))) {
    samplePixel(x, 0);
    samplePixel(x, height - 1);
  }
  // Sample left and right columns
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 32))) {
    samplePixel(0, y);
    samplePixel(width - 1, y);
  }

  const bgR = Math.round(sumR / Math.max(borderCount, 1));
  const bgG = Math.round(sumG / Math.max(borderCount, 1));
  const bgB = Math.round(sumB / Math.max(borderCount, 1));

  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const dr = rgba[i] - bgR;
    const dg = rgba[i + 1] - bgG;
    const db = rgba[i + 2] - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    data[p] = dist > colorThreshold ? 1 : 0;
  }

  // Filter out scattered table items, coffee beans, noise, and shadow islands
  const cleanedData = isolateDominantSubject(data, width, height, 0.04);

  return { width, height, data: cleanedData };
}

/**
 * Measures the silhouette: aspect ratio, center of mass, and 10-band vertical width profile.
 */
export function measureSilhouette(mask: SilhouetteMask): SilhouetteMetrics {
  const { width, height, data } = mask;
  let minX = width,
    maxX = -1,
    minY = height,
    maxY = -1;
  let totalMass = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        sumY += y;
        totalMass++;
      }
    }
  }

  if (totalMass === 0 || maxX < minX || maxY < minY) {
    return {
      aspectRatio: 1.0,
      bounds: { minX: 0, minY: 0, maxX: width, maxY: height },
      centerOfMass: [0.5, 0.5],
      widthProfile: new Array(10).fill(0.5),
      promptDescription: 'Silhouette: standard proportions.',
    };
  }

  const boundW = maxX - minX + 1;
  const boundH = maxY - minY + 1;
  const aspectRatio = Number((boundH / Math.max(boundW, 1)).toFixed(2));
  const cx = Number(((sumX / totalMass - minX + 0.5) / Math.max(boundW, 1)).toFixed(2));
  const cy = Number(((sumY / totalMass - minY + 0.5) / Math.max(boundH, 1)).toFixed(2));

  // Compute 10-band normalized width profile (band 0 = bottom, band 9 = top)
  const widthProfile: number[] = [];
  const bandHeight = boundH / 10;

  for (let b = 0; b < 10; b++) {
    // In canvas coordinates, y=0 is top. We measure band 0 from bottom (maxY) to top (minY).
    const bandBottomY = Math.round(maxY - b * bandHeight);
    const bandTopY = Math.round(maxY - (b + 1) * bandHeight);
    const yStart = Math.max(minY, Math.min(bandTopY, bandBottomY));
    const yEnd = Math.min(maxY, Math.max(bandTopY, bandBottomY));

    let maxWidthInBand = 0;
    for (let y = yStart; y <= yEnd; y++) {
      let rowMin = -1;
      let rowMax = -1;
      for (let x = minX; x <= maxX; x++) {
        if (data[y * width + x] === 1) {
          if (rowMin === -1) rowMin = x;
          rowMax = x;
        }
      }
      if (rowMin !== -1) {
        maxWidthInBand = Math.max(maxWidthInBand, rowMax - rowMin + 1);
      }
    }
    widthProfile.push(Number((maxWidthInBand / Math.max(boundW, 1)).toFixed(2)));
  }

  const promptDescription = `Reference silhouette aspect ratio (height:width) is ${aspectRatio}:1. Relative width from base to crown across 10 bands: [${widthProfile.join(
    ', '
  )}]. Center of mass: [${cx}, ${cy}].`;

  return {
    aspectRatio,
    bounds: { minX, minY, maxX, maxY },
    centerOfMass: [cx, cy],
    widthProfile,
    promptDescription,
  };
}

/**
 * Resamples a bounding-boxed sub-region of a mask to a canonical grid (e.g. 64x64).
 */
export function normalizeMask(
  mask: SilhouetteMask,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  targetSize = 64
): Uint8Array {
  const result = new Uint8Array(targetSize * targetSize);
  const srcW = Math.max(bounds.maxX - bounds.minX + 1, 1);
  const srcH = Math.max(bounds.maxY - bounds.minY + 1, 1);

  for (let ty = 0; ty < targetSize; ty++) {
    const sy = Math.floor(bounds.minY + (ty / targetSize) * srcH);
    for (let tx = 0; tx < targetSize; tx++) {
      const sx = Math.floor(bounds.minX + (tx / targetSize) * srcW);
      if (sx >= 0 && sx < mask.width && sy >= 0 && sy < mask.height) {
        result[ty * targetSize + tx] = mask.data[sy * mask.width + sx];
      }
    }
  }

  return result;
}

/**
 * Calculates true 2D Intersection-over-Union (IoU) between two binary masks.
 * Normalizes both into a shared canonical grid to compare silhouette overlap.
 */
export function computeSilhouetteIoU(maskA: SilhouetteMask, maskB: SilhouetteMask, resolution = 64): number {
  const mA = measureSilhouette(maskA);
  const mB = measureSilhouette(maskB);

  const normA = normalizeMask(maskA, mA.bounds, resolution);
  const normB = normalizeMask(maskB, mB.bounds, resolution);

  let intersection = 0;
  let union = 0;

  for (let i = 0; i < normA.length; i++) {
    const a = normA[i];
    const b = normB[i];
    if (a === 1 && b === 1) intersection++;
    if (a === 1 || b === 1) union++;
  }

  if (union === 0) return 0;
  return Number((intersection / union).toFixed(3));
}

/**
 * Fast geometric orthographic rasterizer fallback for headless/test environments where WebGL is unavailable.
 */
function renderGeometricSilhouetteFallback(spec: SculptSpec, resolution: number): SilhouetteMask {
  const data = new Uint8Array(resolution * resolution);
  const kit = buildSculpt(spec);
  kit.group.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(kit.group);
  if (box.isEmpty()) return { width: resolution, height: resolution, data };

  const min = box.min;
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, 0.001);
  const pad = 0.1;
  const scale = (1 - pad * 2) / maxDim;

  // Traverse meshes and project their bounding boxes/primitives into 2D grid
  kit.group.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      const m = c as THREE.Mesh;
      const mBox = new THREE.Box3().setFromObject(m);
      if (mBox.isEmpty()) return;

      const px0 = Math.floor(
        ((mBox.min.x - min.x - size.x / 2) * scale + 0.5) * resolution
      );
      const px1 = Math.ceil(
        ((mBox.max.x - min.x - size.x / 2) * scale + 0.5) * resolution
      );
      const py0 = Math.floor(
        (1 - ((mBox.max.y - min.y) * scale + pad)) * resolution
      );
      const py1 = Math.ceil(
        (1 - ((mBox.min.y - min.y) * scale + pad)) * resolution
      );

      for (let y = Math.max(0, py0); y < Math.min(resolution, py1); y++) {
        for (let x = Math.max(0, px0); x < Math.min(resolution, px1); x++) {
          data[y * resolution + x] = 1;
        }
      }
    }
  });

  return { width: resolution, height: resolution, data };
}

/**
 * Renders an orthographic front-view silhouette mask of a SculptSpec.
 * Returns a SilhouetteMask of the given resolution.
 */
export function renderSculptSilhouette(spec: SculptSpec, resolution = 128): SilhouetteMask {
  if (typeof document === 'undefined') {
    return renderGeometricSilhouetteFallback(spec, resolution);
  }

  try {
    const kit = buildSculpt(spec);
    const scene = new THREE.Scene();
    scene.add(kit.group);

    kit.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(kit.group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z, 0.5) * 1.15;
    const camera = new THREE.OrthographicCamera(
      -maxDim / 2,
      maxDim / 2,
      maxDim / 2,
      -maxDim / 2,
      0.1,
      maxDim * 4
    );
    camera.position.set(center.x, center.y, center.z + maxDim * 1.5);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    kit.group.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        (c as THREE.Mesh).material = whiteMat;
      }
    });

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(resolution, resolution);
    renderer.setClearColor(0x000000, 1);
    renderer.render(scene, camera);

    const gl = renderer.getContext();
    const pixels = new Uint8Array(resolution * resolution * 4);
    gl.readPixels(0, 0, resolution, resolution, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    renderer.dispose();

    const data = new Uint8Array(resolution * resolution);
    for (let y = 0; y < resolution; y++) {
      const glY = resolution - 1 - y;
      for (let x = 0; x < resolution; x++) {
        const pIdx = (glY * resolution + x) * 4;
        data[y * resolution + x] = pixels[pIdx] > 128 ? 1 : 0;
      }
    }

    return { width: resolution, height: resolution, data };
  } catch {
    return renderGeometricSilhouetteFallback(spec, resolution);
  }
}

/**
 * Loads an image from URL or Data URL, downsamples if necessary (e.g. max 512px for fast processing),
 * draws to an offscreen 2D canvas, and extracts the binary SilhouetteMask.
 */
function componentToHex(c: number): string {
  const hex = Math.max(0, Math.min(255, Math.round(c))).toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

export interface ExtractedPalette {
  skin?: string;
  hair?: string;
  primaryClothing?: string;
  secondaryClothing?: string;
  leather?: string;
  metal?: string;
  weaponWood?: string;
  weaponAccent?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  dominantColors: string[];
}

/**
 * Deterministically samples dominant and anatomical color swatches from reference image pixels
 * using vertical spatial zoning (head/skin, upper torso/hood, waist/leather, legs) and color clustering.
 */
export function extractPaletteFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  mask?: SilhouetteMask
): ExtractedPalette {
  const pixels: { r: number; g: number; b: number; nx: number; ny: number; isInterior: boolean }[] = [];
  const maskData = mask?.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isFg = maskData ? maskData[y * width + x] === 1 : rgba[idx + 3] > 40;
      if (isFg) {
        const isBorder = maskData ? (
          x <= 1 || x >= width - 2 || y <= 1 || y >= height - 2 ||
          maskData[(y - 1) * width + x] === 0 ||
          maskData[(y + 1) * width + x] === 0 ||
          maskData[y * width + x - 1] === 0 ||
          maskData[y * width + x + 1] === 0
        ) : false;

        pixels.push({
          r: rgba[idx],
          g: rgba[idx + 1],
          b: rgba[idx + 2],
          nx: x / width,
          ny: y / height,
          isInterior: !isBorder,
        });
      }
    }
  }

  if (pixels.length === 0) {
    return {
      skin: '#f3ceb2',
      hair: '#ad8748',
      primaryClothing: '#2e4e3f',
      secondaryClothing: '#3d6350',
      leather: '#4a3321',
      metal: '#c2a649',
      weaponWood: '#4a2810',
      weaponAccent: '#e5e7eb',
      primaryColor: '#c82828',
      secondaryColor: '#f59e0b',
      accentColor: '#ffffff',
      dominantColors: ['#c82828', '#f59e0b', '#ffffff'],
    };
  }

  // 0. Extract universal dominant colors: prioritize interior pixels to avoid background halos
  const interiorPixels = pixels.filter((p) => p.isInterior);
  const sampleSet = interiorPixels.length > 40 ? interiorPixels : pixels;

  const buckets = new Map<number, { count: number; sumR: number; sumG: number; sumB: number }>();
  for (const p of sampleSet) {
    const bucketKey = ((p.r >> 4) << 8) | ((p.g >> 4) << 4) | (p.b >> 4);
    const existing = buckets.get(bucketKey);
    if (existing) {
      existing.count++;
      existing.sumR += p.r;
      existing.sumG += p.g;
      existing.sumB += p.b;
    } else {
      buckets.set(bucketKey, { count: 1, sumR: p.r, sumG: p.g, sumB: p.b });
    }
  }

  // Score buckets: favor vibrant, chromatic and luminous colors over dark shadow noise
  const scoredBuckets = Array.from(buckets.values()).map((b) => {
    const avgR = b.sumR / b.count;
    const avgG = b.sumG / b.count;
    const avgB = b.sumB / b.count;
    const brightness = (avgR + avgG + avgB) / 3;
    const chroma = Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB);
    const shadowPenalty = brightness < 35 ? (chroma < 15 ? 0.2 : 0.6) : 1.0;
    const score = b.count * (1 + (chroma / 255) * 1.5) * shadowPenalty;
    return { ...b, avgR, avgG, avgB, score };
  });

  scoredBuckets.sort((a, b) => b.score - a.score);
  const dominantColors: string[] = scoredBuckets.slice(0, 5).map((b) =>
    rgbToHex(b.avgR, b.avgG, b.avgB)
  );
  const primaryColor = dominantColors[0] || '#c82828';
  const secondaryColor = dominantColors[1] || primaryColor;
  const accentColor = dominantColors[2] || secondaryColor;

  // 1. Head / Face zone: top 8% to 32% of character, centered horizontally
  const headPixels = pixels.filter((p) => p.ny >= 0.08 && p.ny <= 0.32 && Math.abs(p.nx - 0.5) <= 0.25);
  const skinCandidates = headPixels.filter(
    (p) => p.r > p.g && p.g >= p.b && p.r > 120 && p.b < 200 && p.r - p.b > 20
  );
  let skin = '#f3ceb2';
  if (skinCandidates.length > 5) {
    const avgR = skinCandidates.reduce((s, p) => s + p.r, 0) / skinCandidates.length;
    const avgG = skinCandidates.reduce((s, p) => s + p.g, 0) / skinCandidates.length;
    const avgB = skinCandidates.reduce((s, p) => s + p.b, 0) / skinCandidates.length;
    skin = rgbToHex(avgR, avgG, avgB);
  }

  // 2. Crown / Hair or Hood
  const crownPixels = pixels.filter((p) => p.ny <= 0.22);
  let hair = '#ad8748';
  if (crownPixels.length > 5) {
    const nonSkinCrown = crownPixels.filter(
      (p) => !(p.r > 160 && p.g > 130 && p.b > 110 && Math.abs(p.r - p.g) < 40)
    );
    const target = nonSkinCrown.length > 5 ? nonSkinCrown : crownPixels;
    const avgR = target.reduce((s, p) => s + p.r, 0) / target.length;
    const avgG = target.reduce((s, p) => s + p.g, 0) / target.length;
    const avgB = target.reduce((s, p) => s + p.b, 0) / target.length;
    hair = rgbToHex(avgR, avgG, avgB);
  }

  // 3. Torso / Clothing zone (ny: 0.25 to 0.70)
  const torsoPixels = pixels.filter((p) => p.ny > 0.25 && p.ny <= 0.70);
  let primaryClothing = '#2e4e3f';
  let secondaryClothing = '#3d6350';
  let leather = '#4a3321';
  let metal = '#c2a649';

  if (torsoPixels.length > 10) {
    const sortedByLuma = [...torsoPixels].sort(
      (a, b) => 0.299 * a.r + 0.587 * a.g + 0.114 * a.b - (0.299 * b.r + 0.587 * b.g + 0.114 * b.b)
    );
    const medianIdx = Math.floor(sortedByLuma.length / 2);
    const midSample = sortedByLuma.slice(Math.max(0, medianIdx - 10), Math.min(sortedByLuma.length, medianIdx + 10));
    const pR = midSample.reduce((s, p) => s + p.r, 0) / midSample.length;
    const pG = midSample.reduce((s, p) => s + p.g, 0) / midSample.length;
    const pB = midSample.reduce((s, p) => s + p.b, 0) / midSample.length;
    primaryClothing = rgbToHex(pR, pG, pB);

    const leatherCandidates = torsoPixels.filter(
      (p) => p.r > p.b && p.r < 140 && p.g < 110 && p.r - p.g < 50
    );
    if (leatherCandidates.length > 5) {
      const lR = leatherCandidates.reduce((s, p) => s + p.r, 0) / leatherCandidates.length;
      const lG = leatherCandidates.reduce((s, p) => s + p.g, 0) / leatherCandidates.length;
      const lB = leatherCandidates.reduce((s, p) => s + p.b, 0) / leatherCandidates.length;
      leather = rgbToHex(lR, lG, lB);
    }

    const metalCandidates = torsoPixels.filter(
      (p) => (p.r > 160 && p.g > 140 && p.b < 120) || (p.r > 180 && p.g > 180 && p.b > 180)
    );
    if (metalCandidates.length > 5) {
      const mR = metalCandidates.reduce((s, p) => s + p.r, 0) / metalCandidates.length;
      const mG = metalCandidates.reduce((s, p) => s + p.g, 0) / metalCandidates.length;
      const mB = metalCandidates.reduce((s, p) => s + p.b, 0) / metalCandidates.length;
      metal = rgbToHex(mR, mG, mB);
    }
  }

  return {
    skin,
    hair,
    primaryClothing,
    secondaryClothing,
    leather,
    metal,
    weaponWood: leather,
    weaponAccent: '#e5e7eb',
    primaryColor,
    secondaryColor,
    accentColor,
    dominantColors,
  };
}

export async function extractMaskFromImageUrl(
  imageUrl: string,
  maxDim = 512
): Promise<{ mask: SilhouetteMask; metrics: SilhouetteMetrics; palette: ExtractedPalette; canvasDataUrl: string }> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image is not defined in this environment.'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (Math.max(w, h) > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get 2D canvas context for silhouette extraction'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const mask = extractMaskFromRgba(imgData.data, w, h);
      const metrics = measureSilhouette(mask);
      const palette = extractPaletteFromRgba(imgData.data, w, h, mask);
      resolve({ mask, metrics, palette, canvasDataUrl: canvas.toDataURL('image/png') });
    };
    img.onerror = () => reject(new Error('Failed to load image for silhouette extraction'));
    img.src = imageUrl;
  });
}

/**
 * Generates a data URL of the silhouette mask visualization for HUD previews.
 */
export function generateMaskDataUrl(
  mask: SilhouetteMask,
  highlightColor: [number, number, number, number] = [6, 182, 212, 220]
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const imgData = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    const p = i * 4;
    if (mask.data[i] === 1) {
      imgData.data[p] = highlightColor[0];
      imgData.data[p + 1] = highlightColor[1];
      imgData.data[p + 2] = highlightColor[2];
      imgData.data[p + 3] = highlightColor[3];
    } else {
      imgData.data[p] = 0;
      imgData.data[p + 1] = 0;
      imgData.data[p + 2] = 0;
      imgData.data[p + 3] = 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

