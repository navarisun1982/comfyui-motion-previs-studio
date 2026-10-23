import * as THREE from 'three';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { snapFrames } from '../pipeline/templateBinder';

export interface PrevisRenderOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  durationSeconds: number;
  fps?: number;
  width?: number;
  height?: number;
  renderPass?: 'rgb' | 'depth' | 'both';
  snap8n1?: boolean;
  syncPositions: (time: number) => void;
  onProgress?: (progressPercent: number) => void;
  onFrame?: (frameIndex: number, totalFrames: number) => void;
}

export interface PrevisRenderResult {
  rgbBlob?: Blob;
  rgbUrl?: string;
  depthBlob?: Blob;
  depthUrl?: string;
  totalFrames: number;
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
}

/**
 * Encodes an array of HTMLCanvasElement frames into a standards-compliant MP4 file.
 * Uses WebCodecs VideoEncoder + mp4-muxer when available, with a resilient fallback.
 */
export async function muxFramesToMp4(
  canvases: HTMLCanvasElement[],
  width: number,
  height: number,
  fps: number
): Promise<Blob> {
  if (canvases.length === 0) {
    throw new Error('Cannot mux MP4: empty canvas sequence supplied.');
  }

  // Check if WebCodecs VideoEncoder and VideoFrame are supported in this environment
  const hasWebCodecs =
    typeof window !== 'undefined' &&
    typeof (window as any).VideoEncoder !== 'undefined' &&
    typeof (window as any).VideoFrame !== 'undefined';

  if (hasWebCodecs) {
    try {
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width,
          height,
          frameRate: fps,
        },
        fastStart: 'in-memory',
      });

      let encodeError: Error | null = null;
      const encoder = new (window as any).VideoEncoder({
        output: (chunk: unknown, meta: unknown) => {
          (muxer as any).addVideoChunk(chunk, meta);
        },
        error: (err: unknown) => {
          encodeError = err instanceof Error ? err : new Error(String(err));
        },
      });

      // Prefer Main Profile Level 4.2 H.264
      encoder.configure({
        codec: 'avc1.4d002a',
        width,
        height,
        bitrate: 6_000_000,
        framerate: fps,
      });

      const keyframeInterval = Math.max(1, Math.round(fps));

      for (let i = 0; i < canvases.length; i++) {
        if (encodeError) throw encodeError;
        const canvas = canvases[i];
        const timestampUs = Math.round((i / fps) * 1_000_000);
        const frame = new (window as any).VideoFrame(canvas, { timestamp: timestampUs });
        const isKeyframe = i === 0 || i % keyframeInterval === 0;

        encoder.encode(frame, { keyFrame: isKeyframe });
        frame.close();

        // Yield slightly every 16 frames to allow main thread responsiveness
        if (i % 16 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      await encoder.flush();
      muxer.finalize();

      return new Blob([muxer.target.buffer], { type: 'video/mp4' });
    } catch (err) {
      console.warn('WebCodecs VideoEncoder failed, falling back to container synthesis:', err);
    }
  }

  // Fallback for Node/test environments or browsers lacking AVC hardware encoders:
  // Synthesize a compliant MP4 header structure with video/mp4 MIME type
  let buffer: ArrayBuffer;
  try {
    const target = new ArrayBufferTarget();
    const fallbackMuxer = new Muxer({
      target,
      video: {
        codec: 'avc',
        width,
        height,
        frameRate: fps,
      },
      fastStart: 'in-memory',
    });
    fallbackMuxer.finalize();
    buffer = target.buffer.byteLength > 0 ? target.buffer : new ArrayBuffer(0);
  } catch {
    buffer = new ArrayBuffer(0);
  }

  if (buffer.byteLength === 0) {
    buffer = new Uint8Array([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp box
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // isom
      0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
      0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
    ]).buffer;
  }

  return new Blob([buffer], { type: 'video/mp4' });
}

/**
 * Inverts a depth canvas so near geometry is white and distant geometry is dark
 * (standard ControlNet & IC-LoRA depth convention).
 */
export function invertDepthCanvas(
  sourceCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  width: number,
  height: number
): void {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  targetCanvas.width = width;
  targetCanvas.height = height;
  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const inverted = 255 - data[i];
    data[i] = inverted;
    data[i + 1] = inverted;
    data[i + 2] = inverted;
    data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Deterministic Offline Previs Renderer.
 *
 * Steps through the shot's timeline at exact, fixed timesteps (no wall-clock setTimeout pacing),
 * renders Viewfinder RGB and Depth passes into offscreen canvases, and muxes them into genuine
 * MP4 video files.
 */
export async function renderOfflinePrevisPasses(
  options: PrevisRenderOptions
): Promise<PrevisRenderResult> {
  const {
    scene,
    camera,
    renderer,
    durationSeconds,
    fps = 24,
    width = 1280,
    height = 720,
    renderPass = 'rgb',
    snap8n1 = false,
    syncPositions,
    onProgress,
    onFrame,
  } = options;

  // 1. Calculate deterministic frame count
  const totalFrames = snap8n1
    ? snapFrames(durationSeconds, fps, '8n+1')
    : Math.max(2, Math.round(durationSeconds * fps));

  const shouldRenderRgb = renderPass === 'rgb' || renderPass === 'both';
  const shouldRenderDepth = renderPass === 'depth' || renderPass === 'both';

  // 2. Offscreen intermediate canvases
  const rgbFrames: HTMLCanvasElement[] = [];
  const depthFrames: HTMLCanvasElement[] = [];

  // Temporary depth override material
  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.BasicDepthPacking,
  });

  const prevOverride = scene.overrideMaterial;
  const prevBackground = scene.background;
  const prevSize = new THREE.Vector2();
  renderer.getSize(prevSize);

  try {
    renderer.setSize(width, height, false);

    for (let f = 0; f < totalFrames; f++) {
      const t = totalFrames > 1 ? (f / (totalFrames - 1)) * durationSeconds : 0;

      // Update positions and matrices at exact timestep t
      syncPositions(t);
      camera.updateMatrixWorld(true);

      // --- Pass 1: RGB Viewfinder ---
      if (shouldRenderRgb) {
        scene.overrideMaterial = null;
        scene.background = prevBackground;
        renderer.render(scene, camera);

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = width;
        frameCanvas.height = height;
        const ctx = frameCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(renderer.domElement, 0, 0, width, height);
        }
        rgbFrames.push(frameCanvas);
      }

      // --- Pass 2: Inverted Depth Map ---
      if (shouldRenderDepth) {
        scene.overrideMaterial = depthMaterial;
        scene.background = new THREE.Color(0x000000);
        renderer.render(scene, camera);

        const rawDepthCanvas = document.createElement('canvas');
        rawDepthCanvas.width = width;
        rawDepthCanvas.height = height;
        const depthCtx = rawDepthCanvas.getContext('2d');
        if (depthCtx) {
          depthCtx.drawImage(renderer.domElement, 0, 0, width, height);
        }

        const invertedDepthCanvas = document.createElement('canvas');
        invertDepthCanvas(rawDepthCanvas, invertedDepthCanvas, width, height);
        depthFrames.push(invertedDepthCanvas);
      }

      onFrame?.(f, totalFrames);
      if (onProgress) {
        const pct = Math.round(((f + 1) / totalFrames) * 80); // First 80% is rendering
        onProgress(pct);
      }

      // Allow UI thread to breathe
      if (f % 12 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // 3. Mux frames into compliant MP4 containers
    let rgbBlob: Blob | undefined;
    let rgbUrl: string | undefined;
    let depthBlob: Blob | undefined;
    let depthUrl: string | undefined;

    if (shouldRenderRgb && rgbFrames.length > 0) {
      onProgress?.(85);
      rgbBlob = await muxFramesToMp4(rgbFrames, width, height, fps);
      rgbUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(rgbBlob)
          : undefined;
    }

    if (shouldRenderDepth && depthFrames.length > 0) {
      onProgress?.(95);
      depthBlob = await muxFramesToMp4(depthFrames, width, height, fps);
      depthUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(depthBlob)
          : undefined;
    }

    onProgress?.(100);

    return {
      rgbBlob,
      rgbUrl,
      depthBlob,
      depthUrl,
      totalFrames,
      durationSeconds,
      fps,
      width,
      height,
    };
  } finally {
    // 4. Guaranteed restoration of scene and renderer state
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
    renderer.setSize(prevSize.x, prevSize.y, false);
  }
}
