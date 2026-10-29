// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createLinearDepthMaterial, invertDepthCanvas, muxFramesToMp4, renderOfflinePrevisPasses } from '../src/engine/offlinePrevisRenderer';
import * as THREE from 'three';

beforeAll(() => {
  const contextMap = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

  // Polyfill canvas 2d context for jsdom environment with full state preservation
  (HTMLCanvasElement.prototype as any).getContext = function (contextId: string) {
    if (contextId === '2d') {
      if (contextMap.has(this)) return contextMap.get(this)!;
      const canvas = this;
      const w = () => canvas.width || 1;
      const h = () => canvas.height || 1;
      let pixels = new Uint8ClampedArray(w() * h() * 4);

      const ctx = {
        canvas,
        drawImage: vi.fn((src: any) => {
          if (src && typeof src.getContext === 'function') {
            const srcCtx = src.getContext('2d');
            if (srcCtx) {
              const srcData = srcCtx.getImageData(0, 0, w(), h());
              pixels = new Uint8ClampedArray(srcData.data);
            }
          }
        }),
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        getImageData: (_sx: number, _sy: number, sw: number, sh: number) => {
          if (pixels.length !== sw * sh * 4) {
            const next = new Uint8ClampedArray(sw * sh * 4);
            next.set(pixels.subarray(0, Math.min(pixels.length, next.length)));
            pixels = next;
          }
          return { data: new Uint8ClampedArray(pixels) };
        },
        putImageData: (imgData: { data: Uint8ClampedArray }) => {
          pixels = new Uint8ClampedArray(imgData.data);
        },
        fillStyle: '',
        fillRect: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      contextMap.set(this, ctx);
      return ctx;
    }
    return null;
  };
});

describe('offlinePrevisRenderer', () => {
  describe('createLinearDepthMaterial', () => {
    it('creates a MeshDepthMaterial configured with linear depth uniforms and shader hooks', () => {
      const mat = createLinearDepthMaterial(1.0, 50.0);
      expect(mat).toBeInstanceOf(THREE.MeshDepthMaterial);
      expect(typeof mat.onBeforeCompile).toBe('function');
      expect(typeof mat.customProgramCacheKey).toBe('function');
      expect(mat.customProgramCacheKey()).toContain('50');

      // Test onBeforeCompile hook
      const shader = {
        uniforms: {} as any,
        vertexShader: '#include <common>\n#include <project_vertex>',
        fragmentShader: '',
      };
      mat.onBeforeCompile(shader as any, {} as any);

      expect(shader.uniforms.depthNear?.value).toBe(1.0);
      expect(shader.uniforms.depthFar?.value).toBe(50.0);
      expect(shader.vertexShader).toContain('vViewZ = -mvPosition.z');
      expect(shader.fragmentShader).toContain('clamp((depthFar - vViewZ) / (depthFar - depthNear)');
    });
  });

  describe('invertDepthCanvas', () => {
    it('inverts depth map values so near geometry is white and far is dark', () => {
      const width = 2;
      const height = 2;

      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const srcCtx = sourceCanvas.getContext('2d')!;

      // Create test pattern with known values
      const imgData = srcCtx.createImageData(width, height);
      // Pixel 0: 0 (Far) -> should become 255 (Far is dark, near is white)
      imgData.data[0] = 0;
      imgData.data[1] = 0;
      imgData.data[2] = 0;
      imgData.data[3] = 255;

      // Pixel 1: 50 -> should become 205
      imgData.data[4] = 50;
      imgData.data[5] = 50;
      imgData.data[6] = 50;
      imgData.data[7] = 255;

      // Pixel 2: 200 -> should become 55
      imgData.data[8] = 200;
      imgData.data[9] = 200;
      imgData.data[10] = 200;
      imgData.data[11] = 255;

      // Pixel 3: 255 -> should become 0
      imgData.data[12] = 255;
      imgData.data[13] = 255;
      imgData.data[14] = 255;
      imgData.data[15] = 255;

      srcCtx.putImageData(imgData, 0, 0);

      const targetCanvas = document.createElement('canvas');
      invertDepthCanvas(sourceCanvas, targetCanvas, width, height);

      const tgtCtx = targetCanvas.getContext('2d')!;
      const resultData = tgtCtx.getImageData(0, 0, width, height).data;

      // Check pixel 0 (was 0 -> now 255)
      expect(resultData[0]).toBe(255);
      expect(resultData[1]).toBe(255);
      expect(resultData[2]).toBe(255);
      expect(resultData[3]).toBe(255);

      // Check pixel 1 (was 50 -> now 205)
      expect(resultData[4]).toBe(205);
      expect(resultData[5]).toBe(205);
      expect(resultData[6]).toBe(205);
      expect(resultData[7]).toBe(255);

      // Check pixel 2 (was 200 -> now 55)
      expect(resultData[8]).toBe(55);
      expect(resultData[9]).toBe(55);
      expect(resultData[10]).toBe(55);
      expect(resultData[11]).toBe(255);

      // Check pixel 3 (was 255 -> now 0)
      expect(resultData[12]).toBe(0);
      expect(resultData[13]).toBe(0);
      expect(resultData[14]).toBe(0);
      expect(resultData[15]).toBe(255);
    });
  });

  describe('muxFramesToMp4', () => {
    it('throws when given empty canvas sequence', async () => {
      await expect(muxFramesToMp4([], 1280, 720, 24)).rejects.toThrow(
        'Cannot mux MP4: empty canvas sequence supplied.'
      );
    });

    it('returns a video/mp4 Blob with byte content in fallback environment', async () => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 36;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 64, 36);

      const blob = await muxFramesToMp4([c, c], 64, 36, 24);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('video/mp4');
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('renderOfflinePrevisPasses', () => {
    it('executes deterministic step iterations with 8n+1 frame snapping', async () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);

      const fakeDom = document.createElement('canvas');
      const fakeRenderer = {
        domElement: fakeDom,
        setSize: vi.fn(),
        getSize: vi.fn((target: THREE.Vector2) => {
          target.set(128, 72);
          return target;
        }),
        render: vi.fn(),
        setRenderTarget: vi.fn(),
        readRenderTargetPixels: vi.fn(),
      } as unknown as THREE.WebGLRenderer;

      const syncedTimes: number[] = [];
      const syncPositions = vi.fn((time: number) => {
        syncedTimes.push(time);
      });

      const onProgress = vi.fn();
      const onFrame = vi.fn();

      const result = await renderOfflinePrevisPasses({
        scene,
        camera,
        renderer: fakeRenderer,
        durationSeconds: 5,
        fps: 24,
        width: 128,
        height: 72,
        renderPass: 'rgb',
        snap8n1: true,
        syncPositions,
        onProgress,
        onFrame,
      });

      // 5s @ 24fps with snap8n1 must be exactly 121 frames
      expect(result.totalFrames).toBe(121);
      expect(result.totalFrames % 8).toBe(1);
      expect(syncPositions).toHaveBeenCalledTimes(121);
      expect(syncedTimes[0]).toBe(0);
      expect(syncedTimes[syncedTimes.length - 1]).toBeCloseTo(5, 1);
      expect(onProgress).toHaveBeenCalled();
      expect(onFrame).toHaveBeenCalledWith(120, 121);
      expect(result.rgbBlob).toBeDefined();
      expect(result.rgbBlob?.type).toBe('video/mp4');
    });
  });
});
