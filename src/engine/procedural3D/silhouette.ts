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
 * Extracts a binary silhouette mask from raw RGBA pixel data.
 * If transparent pixels exist, uses alpha channel (alpha > 30).
 * Otherwise detects background by sampling corner pixels and thresholds color distance.
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
    return { width, height, data };
  }

  // No alpha: sample the 4 corners to estimate the background color
  const sampleCorner = (x: number, y: number): [number, number, number] => {
    const idx = (y * width + x) * 4;
    return [rgba[idx], rgba[idx + 1], rgba[idx + 2]];
  };

  const corners = [
    sampleCorner(0, 0),
    sampleCorner(width - 1, 0),
    sampleCorner(0, height - 1),
    sampleCorner(width - 1, height - 1),
  ];

  const bgR = Math.round(corners.reduce((sum, c) => sum + c[0], 0) / 4);
  const bgG = Math.round(corners.reduce((sum, c) => sum + c[1], 0) / 4);
  const bgB = Math.round(corners.reduce((sum, c) => sum + c[2], 0) / 4);

  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const dr = rgba[i] - bgR;
    const dg = rgba[i + 1] - bgG;
    const db = rgba[i + 2] - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    data[p] = dist > colorThreshold ? 1 : 0;
  }

  return { width, height, data };
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
export async function extractMaskFromImageUrl(
  imageUrl: string,
  maxDim = 512
): Promise<{ mask: SilhouetteMask; metrics: SilhouetteMetrics; canvasDataUrl: string }> {
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
      resolve({ mask, metrics, canvasDataUrl: canvas.toDataURL('image/png') });
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

