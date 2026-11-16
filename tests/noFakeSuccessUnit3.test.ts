// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createRequire } from 'module';
import {
  selectAvcCodecCandidates,
  muxFramesToMp4,
  renderOfflinePrevisPasses,
} from '../src/engine/offlinePrevisRenderer';
import {
  storeModelBuffer,
  countCachedModelUrls,
  clearModelMemoryCache,
} from '../src/services/modelStorage';
import { JobRunner } from '../src/pipeline/jobRunner';
import { templateRegistry } from '../src/pipeline/templateRegistry';
import { createDefaultShotSpec } from '../src/types/shotspec';
import { useComfyStore } from '../src/stores/useComfyStore';
import { installMemoryStorage } from './helpers/memoryStorage';

const requireCjs = createRequire(import.meta.url);

// Minimal valid ISO-BMFF avcC decoderConfig description record
const MINIMAL_AVCC = new Uint8Array([
  0x01, 0x64, 0x00, 0x33, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x64, 0x00, 0x33, 0x01, 0x00, 0x02, 0x68,
  0xeb,
]);

describe('Unit 3 (P0-B): Zero Fake Success & Streaming H.264 Level 5.1 Previs Encoder', () => {
  beforeEach(() => {
    installMemoryStorage();
    clearModelMemoryCache();
    (HTMLCanvasElement.prototype as any).getContext = function (contextId: string) {
      if (contextId === '2d') {
        return {
          canvas: this,
          drawImage: vi.fn(),
          createImageData: (w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
          }),
          getImageData: (_sx: number, _sy: number, sw: number, sh: number) => ({
            data: new Uint8ClampedArray(sw * sh * 4),
          }),
          putImageData: vi.fn(),
          fillStyle: '',
          fillRect: vi.fn(),
        };
      }
      return null;
    };
  });

  it('selects AVC Level 5.1 (0x33) for > 2,228,224 px (2580x1080 anamorphic 2.39:1) and Level 4.2 for 1080p', () => {
    const anamorphicCodecs = selectAvcCodecCandidates(2580, 1080);
    expect(anamorphicCodecs[0]).toBe('avc1.640033');
    expect(anamorphicCodecs).toContain('avc1.4d0033');

    const hdCodecs = selectAvcCodecCandidates(1920, 1080);
    expect(hdCodecs[0]).toBe('avc1.4d002a');
  });

  it('rounds odd dimensions to even H.264 dimensions and closes WebCodecs encoder in finally', async () => {
    const closeSpy = vi.fn();
    const configureSpy = vi.fn();
    const flushSpy = vi.fn(async () => {});
    const frameCloseSpy = vi.fn();

    class FakeEncodedVideoChunk {
      type: 'key' | 'delta';
      timestamp: number;
      duration: number;
      byteLength: number;
      private payload: Uint8Array;
      constructor(init: {
        type: 'key' | 'delta';
        timestamp: number;
        duration: number;
        data: Uint8Array;
      }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.duration = init.duration;
        this.payload = init.data;
        this.byteLength = init.data.byteLength;
      }
      copyTo(dest: ArrayBuffer | Uint8Array) {
        const view = dest instanceof Uint8Array ? dest : new Uint8Array(dest);
        view.set(this.payload);
      }
    }

    class FakeVideoEncoder {
      static isConfigSupported = vi.fn(async (cfg: any) => ({ supported: true, config: cfg }));
      state = 'configured';
      encodeQueueSize = 0;
      private outputCb: (chunk: any, meta: any) => void;
      private configuredCfg: any = null;
      constructor(init: any) {
        this.outputCb = init.output;
      }
      configure = (cfg: any) => {
        this.configuredCfg = cfg;
        configureSpy(cfg);
      };
      encode = (frame: any, opts: any) => {
        const payload = new Uint8Array([0x00, 0x00, 0x00, 0x02, 0x65, 0x88]);
        const chunk = new FakeEncodedVideoChunk({
          type: opts?.keyFrame ? 'key' : 'delta',
          timestamp: frame.timestamp ?? 0,
          duration: Math.round(1_000_000 / 24),
          data: payload,
        });
        const meta = opts?.keyFrame
          ? {
              decoderConfig: {
                codec: this.configuredCfg?.codec || 'avc1.640033',
                codedWidth: this.configuredCfg?.width || 2580,
                codedHeight: this.configuredCfg?.height || 1080,
                description: MINIMAL_AVCC,
                colorSpace: {
                  primaries: 'bt709',
                  transfer: 'bt709',
                  matrix: 'bt709',
                  fullRange: false,
                },
              },
            }
          : {};
        this.outputCb(chunk, meta);
      };
      flush = flushSpy;
      close = () => {
        this.state = 'closed';
        closeSpy();
      };
    }
    class FakeVideoFrame {
      timestamp: number;
      constructor(_src: any, opts: any) {
        this.timestamp = opts?.timestamp ?? 0;
      }
      close = frameCloseSpy;
    }

    (window as any).VideoEncoder = FakeVideoEncoder;
    (window as any).VideoFrame = FakeVideoFrame;
    (globalThis as any).EncodedVideoChunk = FakeEncodedVideoChunk;

    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 2.39, 0.1, 1000);
      const fakeDom = document.createElement('canvas');
      const fakeRenderer = {
        domElement: fakeDom,
        setSize: vi.fn(),
        getSize: vi.fn((target: THREE.Vector2) => target.set(2581, 1081)),
        render: vi.fn(),
        setRenderTarget: vi.fn(),
        readRenderTargetPixels: vi.fn(),
      } as unknown as THREE.WebGLRenderer;

      const res = await renderOfflinePrevisPasses({
        scene,
        camera,
        renderer: fakeRenderer,
        durationSeconds: 0.4,
        fps: 24,
        width: 2581,
        height: 1081,
        renderPass: 'rgb',
        snap8n1: true,
        syncPositions: vi.fn(),
      });

      expect(res.width).toBe(2580);
      expect(res.height).toBe(1080);
      expect(res.rgbBlob?.size).toBeGreaterThan(64);
      expect(configureSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          codec: 'avc1.640033',
          width: 2580,
          height: 1080,
        })
      );
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(frameCloseSpy).toHaveBeenCalledTimes(res.totalFrames);
    } finally {
      delete (window as any).VideoEncoder;
      delete (window as any).VideoFrame;
      delete (globalThis as any).EncodedVideoChunk;
    }
  });

  it('refuses to return a fake 32-byte ftyp MP4 in a non-headless browser when WebCodecs is missing', async () => {
    const origDesc = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0',
      configurable: true,
    });
    delete (window as any).VideoEncoder;
    delete (window as any).VideoFrame;

    try {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 36;
      await expect(muxFramesToMp4([c], 64, 36, 24)).rejects.toThrow(/WebCodecs.*VideoEncoder/i);
    } finally {
      if (origDesc) {
        Object.defineProperty(window.navigator, 'userAgent', origDesc);
      } else {
        Object.defineProperty(window.navigator, 'userAgent', {
          value: 'Mozilla/5.0 (darwin) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/24.0.0',
          configurable: true,
        });
      }
    }
  });

  it('counts only bundled local GLBs and actually cached remote URLs in countCachedModelUrls', async () => {
    const remoteCached = 'https://polyfork.dev/cdn/cached-chair.glb';
    const remoteUncached = 'https://polyfork.dev/cdn/uncached-table.glb';
    const localBundled = './models/Soldier.glb';

    const beforeCount = await countCachedModelUrls([localBundled, remoteCached, remoteUncached]);
    expect(beforeCount).toBe(1);

    await storeModelBuffer(remoteCached, new Uint8Array([1, 2, 3, 4]).buffer, 'chair.glb');
    const afterCount = await countCachedModelUrls([localBundled, remoteCached, remoteUncached]);
    expect(afterCount).toBe(2);
  });

  it('checks real filesystem / PATH for python executable in mocapNlfService.cjs instead of || true tautology', () => {
    const mocapNlf = requireCjs('../src/server/mocapNlfService.cjs');
    const origPath = process.env.PATH;
    const origPathWin = process.env.Path;
    try {
      process.env.PATH = 'Z:\\__definitely_nonexistent_dir_unit3__';
      process.env.Path = 'Z:\\__definitely_nonexistent_dir_unit3__';
      expect(mocapNlf.isPythonExecutableFound('python')).toBe(false);
      expect(mocapNlf.isPythonExecutableFound('Z:\\__missing__\\python.exe')).toBe(false);
      expect(mocapNlf.isPythonExecutableFound(process.execPath)).toBe(true);
    } finally {
      if (origPath !== undefined) process.env.PATH = origPath;
      if (origPathWin !== undefined) process.env.Path = origPathWin;
    }
  });

  it('never turns ComfyUI execution_error into finalizeSuccess even if a fallback preview node emitted earlier', async () => {
    templateRegistry.register(
      {
        schema: 'shotspec-binding/v1',
        version: 1,
        templateId: 'unit3_no_fake_success',
        templateFile: 'unit3_no_fake_success.api.json',
        engine: 'ltx-2.5',
        modes: ['t2v'],
        nodes: {
          '1': 'CLIPTextEncode',
          '2': 'RandomNoise',
          '3': 'EmptyLTXVLatentVideo',
          '10': 'VHS_VideoCombine',
          '99': 'VHS_VideoCombine',
        },
        fields: {
          prompt: { node: '1', input: 'text', classType: 'CLIPTextEncode' },
          seed: { node: '2', input: 'noise_seed', classType: 'RandomNoise' },
          durationSeconds: {
            node: '3',
            input: 'length',
            classType: 'EmptyLTXVLatentVideo',
            transform: 'seconds_to_frames_8n_plus_1',
          },
        },
        profiles: {
          draft: [],
          final: [],
        },
        output: {
          node: '99',
          classType: 'VHS_VideoCombine',
          fallbackNodes: ['10'],
        },
      } as any,
      {
        '1': { class_type: 'CLIPTextEncode', inputs: { text: 'init' } },
        '2': { class_type: 'RandomNoise', inputs: { noise_seed: 1 } },
        '3': {
          class_type: 'EmptyLTXVLatentVideo',
          inputs: { length: 97, width: 1280, height: 720 },
        },
        '10': { class_type: 'VHS_VideoCombine', inputs: { filename_prefix: 'preview' } },
        '99': { class_type: 'VHS_VideoCombine', inputs: { filename_prefix: 'final' } },
      }
    );

    let wsCallbacks: any = null;
    const fakeClient: any = {
      getServerUrl: () => 'http://127.0.0.1:8188',
      checkHealth: vi.fn(async () => ({ ok: true })),
      submitPrompt: vi.fn(async () => ({ promptId: 'prompt-unit3-err' })),
      registerJobListener: vi.fn((cbs: any) => {
        wsCallbacks = cbs;
        return () => {};
      }),
      extractVideoOutput: vi.fn((out: any, expectedNodeId?: string, actualNodeId?: string) => {
        if (expectedNodeId && actualNodeId && expectedNodeId !== actualNodeId) return null;
        return out?.video || null;
      }),
      fetchVideoBlobUrl: vi.fn(async (filename: string) => `blob:fake/${filename}`),
      getPromptHistory: vi.fn(async () => null),
      getQueueStatus: vi.fn(async () => ({ running: ['prompt-unit3-err'], pending: [] })),
      interrupt: vi.fn(async () => {}),
    };

    const onSuccess = vi.fn();
    const onError = vi.fn();
    const runner = new JobRunner();
    const shot = createDefaultShotSpec({ name: 'Unit3 Test Shot' });

    await runner.run({
      shot,
      engine: 'ltx-2.5',
      mode: 't2v',
      profile: 'draft',
      templateId: 'unit3_no_fake_success',
      prompt: 'A test prompt',
      negative: '',
      seed: 42,
      promptSource: 'compiled',
      client: fakeClient,
      onSuccess,
      onError,
    });

    expect(wsCallbacks).toBeTruthy();
    await wsCallbacks.onExecuted('10', { video: { filename: 'seed1_preview.mp4' } });
    await wsCallbacks.onError('CUDA out of memory on Node #99');

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain('CUDA out of memory');
    expect(onError.mock.calls[0][0].message).toContain('seed1_preview.mp4');
    expect(useComfyStore.getState().activeJob?.status).toBe('failed');
  });
});
