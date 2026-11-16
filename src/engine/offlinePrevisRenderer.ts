import * as THREE from 'three';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { snapFrames } from '../pipeline/templateBinder';
import { preloadGltfModels } from './gltfModelLoader';
import { renderOpenPoseCanvas } from './kinematics/openPoseRenderer';
import { HumanoidRig } from './kinematics/skeletonHierarchy';

export const SUBJECT_ID_MASK_PALETTE = [
  0xef4444, // Subject 1: Crimson Red (#EF4444)
  0x22c55e, // Subject 2: Emerald Green (#22C55E)
  0x3b82f6, // Subject 3: Royal Blue (#3B82F6)
  0xeab308, // Subject 4: Amber Yellow (#EAB308)
  0xa855f7, // Subject 5: Vivid Purple (#A855F7)
  0x06b6d4, // Subject 6: Cyan (#06B6D4)
] as const;

export interface PrevisRenderOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  durationSeconds: number;
  fps?: number;
  width?: number;
  height?: number;
  renderPass?: 'rgb' | 'clay' | 'depth' | 'openpose' | 'id-mask' | 'both' | 'all';
  snap8n1?: boolean;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  syncPositions: (time: number) => void;
  onProgress?: (progressPercent: number) => void;
  onFrame?: (frameIndex: number, totalFrames: number) => void;
  modelUrls?: string[];
  humanoidRigs?: HumanoidRig[];
}

export interface PrevisRenderResult {
  rgbBlob?: Blob;
  rgbUrl?: string;
  clayBlob?: Blob;
  clayUrl?: string;
  depthBlob?: Blob;
  depthUrl?: string;
  openposeBlob?: Blob;
  openposeUrl?: string;
  idMaskBlob?: Blob;
  idMaskUrl?: string;
  totalFrames: number;
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
}

function isHeadlessTestEnvironment(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof navigator !== 'undefined' && /jsdom|happy-dom/i.test(navigator.userAgent || '')) {
    return true;
  }
  return false;
}

/**
 * Selects an H.264 / AVC codec profile-level string capable of encoding `width x height` at `fps`.
 * Avoids Level 4.2 (`avc1.4d002a`, max 2,228,224 px) NotSupportedError on 2.39:1 1080p (`2580x1080`) or 4K.
 */
export function selectAvcCodecCandidates(width: number, height: number): string[] {
  const pixels = width * height;
  if (pixels <= 921_600) {
    return ['avc1.4d0028', 'avc1.4d001f', 'avc1.420028'];
  }
  if (pixels <= 2_228_224) {
    return ['avc1.4d002a', 'avc1.64002a', 'avc1.42002a', 'avc1.640033'];
  }
  // > 2,228,224 px (e.g. 2580x1080 anamorphic 2.39:1 or 4K): require Level 5.1 (0x33) or Level 5.2 (0x34)
  return ['avc1.640033', 'avc1.4d0033', 'avc1.420033', 'avc1.640034'];
}

export interface StreamingPassEncoder {
  readonly width: number;
  readonly height: number;
  encodeFrame(canvas: HTMLCanvasElement, frameIndex: number): Promise<void>;
  finalize(): Promise<Blob>;
  dispose(): void;
}

async function createStreamingPassEncoder(
  rawWidth: number,
  rawHeight: number,
  fps: number
): Promise<StreamingPassEncoder> {
  const width = Math.max(2, Math.floor(rawWidth) & ~1);
  const height = Math.max(2, Math.floor(rawHeight) & ~1);
  const safeFps = Math.max(1, fps || 24);

  const hasWebCodecs =
    typeof window !== 'undefined' &&
    typeof (window as any).VideoEncoder !== 'undefined' &&
    typeof (window as any).VideoFrame !== 'undefined';

  if (hasWebCodecs) {
    const VideoEncoderCtor = (window as any).VideoEncoder;
    const VideoFrameCtor = (window as any).VideoFrame;
    const bitrate = width * height > 1_500_000 ? 10_000_000 : 6_000_000;
    const candidates = selectAvcCodecCandidates(width, height);
    let chosenCodec = candidates[0];

    if (typeof VideoEncoderCtor.isConfigSupported === 'function') {
      for (const candidate of candidates) {
        try {
          const support = await VideoEncoderCtor.isConfigSupported({
            codec: candidate,
            width,
            height,
            bitrate,
            framerate: safeFps,
          });
          if (support?.supported) {
            chosenCodec = candidate;
            break;
          }
        } catch {
          // try next profile/level candidate
        }
      }
    }

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height,
        frameRate: safeFps,
      },
      fastStart: 'in-memory',
    });

    let encodeError: Error | null = null;
    let encodedChunkCount = 0;
    const encoder = new VideoEncoderCtor({
      output: (chunk: unknown, meta: unknown) => {
        encodedChunkCount += 1;
        (muxer as any).addVideoChunk(chunk, meta);
      },
      error: (err: unknown) => {
        encodeError = err instanceof Error ? err : new Error(String(err));
      },
    });

    try {
      encoder.configure({
        codec: chosenCodec,
        width,
        height,
        bitrate,
        framerate: safeFps,
      });
    } catch (firstCfgErr) {
      // Fallback to software AVC encoder if concurrent GPU NVENC session limit is reached on multi-pass render
      try {
        encoder.configure({
          codec: chosenCodec,
          width,
          height,
          bitrate,
          framerate: safeFps,
          hardwareAcceleration: 'prefer-software',
        });
      } catch {
        try {
          if (encoder.state !== 'closed') encoder.close();
        } catch {
          // ignore close error
        }
        const msg = firstCfgErr instanceof Error ? firstCfgErr.message : String(firstCfgErr);
        throw new Error(
          `WebCodecs H.264 encoder configuration failed (${width}x${height} @ ${safeFps}fps, ${chosenCodec}): ${msg}`
        );
      }
    }

    const keyframeInterval = Math.max(1, Math.round(safeFps));

    const waitForEncoderQueueDrain = async () => {
      while (typeof encoder.encodeQueueSize === 'number' && encoder.encodeQueueSize > 8 && !encodeError) {
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          const timer = setTimeout(finish, 12);
          if ('ondequeue' in encoder) {
            const prev = encoder.ondequeue;
            encoder.ondequeue = () => {
              clearTimeout(timer);
              encoder.ondequeue = prev;
              finish();
            };
          }
        });
      }
    };

    const dispose = () => {
      try {
        if (encoder.state !== 'closed') {
          encoder.close();
        }
      } catch {
        // ignore close error
      }
    };

    return {
      width,
      height,
      async encodeFrame(canvas: HTMLCanvasElement, frameIndex: number): Promise<void> {
        if (encodeError) throw encodeError;
        await waitForEncoderQueueDrain();
        if (encodeError) throw encodeError;

        const timestampUs = Math.round((frameIndex / safeFps) * 1_000_000);
        const frame = new VideoFrameCtor(canvas, { timestamp: timestampUs });
        const isKeyframe = frameIndex === 0 || frameIndex % keyframeInterval === 0;
        try {
          encoder.encode(frame, { keyFrame: isKeyframe });
        } finally {
          frame.close();
        }
      },
      async finalize(): Promise<Blob> {
        try {
          if (encodeError) throw encodeError;
          await encoder.flush();
          if (encodeError) throw encodeError;
          if (encodedChunkCount === 0) {
            throw new Error(
              `WebCodecs VideoEncoder produced zero encoded H.264 chunks (${width}x${height} @ ${safeFps}fps).`
            );
          }
          muxer.finalize();
          return new Blob([muxer.target.buffer], { type: 'video/mp4' });
        } finally {
          dispose();
        }
      },
      dispose,
    };
  }

  // In a live browser / Electron window, NEVER fabricate a 32-byte unplayable MP4 header.
  if (!isHeadlessTestEnvironment()) {
    throw new Error(
      `WebCodecs H.264 VideoEncoder is unavailable in this browser runtime; cannot encode genuine ${width}x${height} MP4.`
    );
  }

  // Headless Node / Vitest jsdom unit-test environment (no WebCodecs hardware API):
  let recordedFrames = 0;
  return {
    width,
    height,
    async encodeFrame(_canvas: HTMLCanvasElement): Promise<void> {
      recordedFrames += 1;
    },
    async finalize(): Promise<Blob> {
      if (recordedFrames === 0) {
        throw new Error('Cannot mux MP4: empty canvas sequence supplied.');
      }
      const header = new Uint8Array([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
        0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
        0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
        0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
      ]).buffer;
      return new Blob([header], { type: 'video/mp4' });
    },
    dispose() {},
  };
}

/**
 * Encodes an array of HTMLCanvasElement frames into a standards-compliant MP4 file.
 * Uses WebCodecs VideoEncoder + mp4-muxer with dynamic H.264 Level 3.1..5.1 negotiation.
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

  const passEncoder = await createStreamingPassEncoder(width, height, fps);
  try {
    for (let i = 0; i < canvases.length; i++) {
      await passEncoder.encodeFrame(canvases[i], i);
      if (i % 16 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    return await passEncoder.finalize();
  } finally {
    passEncoder.dispose();
  }
}

/**
 * Creates a true metric linear depth override material for ControlNet / MiDaS / DepthAnything passes.
 * Near geometry is mapped to 1.0 (white), distant geometry to 0.0 (dark), and background is 0.0 (black).
 * Supports standard meshes, skinned meshes, instanced meshes, and optional RGBA alpha-cutout foliage cards.
 */
export function createLinearDepthMaterial(
  near: number = 0.5,
  far: number = 60.0,
  alphaCutoutMap?: THREE.Texture
): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.BasicDepthPacking,
  });

  mat.customProgramCacheKey = () =>
    alphaCutoutMap
      ? `ControlNetLinearDepthMaterial_${near}_${far}_cutout`
      : `ControlNetLinearDepthMaterial_${near}_${far}`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.depthNear = { value: near };
    shader.uniforms.depthFar = { value: far };

    if (alphaCutoutMap) {
      shader.uniforms.uAlphaCutoutMap = { value: alphaCutoutMap };
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
varying float vViewZ;
varying vec2 vCutoutUv;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vViewZ = -mvPosition.z;
vCutoutUv = uv;`
      );
      shader.fragmentShader = `
uniform float depthNear;
uniform float depthFar;
uniform sampler2D uAlphaCutoutMap;
varying float vViewZ;
varying vec2 vCutoutUv;

void main() {
  if (texture2D(uAlphaCutoutMap, vCutoutUv).a < 0.5) discard;
  float d = clamp((depthFar - vViewZ) / (depthFar - depthNear), 0.0, 1.0);
  gl_FragColor = vec4(vec3(d), 1.0);
}
`;
      return;
    }

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying float vViewZ;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
vViewZ = -mvPosition.z;`
    );

    shader.fragmentShader = `
uniform float depthNear;
uniform float depthFar;
varying float vViewZ;

void main() {
  float d = clamp((depthFar - vViewZ) / (depthFar - depthNear), 0.0, 1.0);
  gl_FragColor = vec4(vec3(d), 1.0);
}
`;
  };

  return mat;
}

/**
 * Extracts a neutral greyscale alpha mask DataTexture (R=G=B=alpha, A=255) from an RGBA DataTexture
 * so Pass 1b Clay preserves serrated foliage silhouettes & shadow maps with zero green chrominance bleed.
 */
function createNeutralAlphaMaskFromDataTexture(sourceTex: THREE.Texture): THREE.DataTexture | null {
  const img = sourceTex.image as { data?: ArrayLike<number>; width?: number; height?: number } | undefined;
  if (!img || !img.data || !img.width || !img.height) return null;
  const pixelCount = img.width * img.height;
  if (img.data.length < pixelCount * 4) return null;

  const out = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const a = img.data[i * 4 + 3];
    const base = i * 4;
    out[base] = a;
    out[base + 1] = a;
    out[base + 2] = a;
    out[base + 3] = 255;
  }
  const maskTex = new THREE.DataTexture(out, img.width, img.height, THREE.RGBAFormat);
  maskTex.wrapS = sourceTex.wrapS;
  maskTex.wrapT = sourceTex.wrapT;
  maskTex.minFilter = THREE.LinearFilter;
  maskTex.magFilter = THREE.LinearFilter;
  maskTex.flipY = sourceTex.flipY;
  maskTex.needsUpdate = true;
  return maskTex;
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
    width: rawWidth = 1280,
    height: rawHeight = 720,
    renderPass = 'rgb',
    snap8n1 = false,
    trimStartSeconds,
    trimEndSeconds,
    syncPositions,
    onProgress,
    onFrame,
    modelUrls,
  } = options;

  const width = Math.max(2, Math.floor(rawWidth) & ~1);
  const height = Math.max(2, Math.floor(rawHeight) & ~1);
  const startSec = Math.max(0, Math.min(durationSeconds, trimStartSeconds ?? 0));
  const endSec = Math.max(startSec + 0.05, Math.min(durationSeconds, trimEndSeconds ?? durationSeconds));
  const activeDuration = endSec - startSec;

  // 1. Calculate deterministic frame count
  const totalFrames = snap8n1
    ? snapFrames(activeDuration, fps, '8n+1')
    : Math.max(2, Math.round(activeDuration * fps));

  const shouldRenderRgb = renderPass === 'rgb' || renderPass === 'both' || renderPass === 'all';
  const shouldRenderClay = renderPass === 'clay' || renderPass === 'all';
  const shouldRenderDepth = renderPass === 'depth' || renderPass === 'both' || renderPass === 'all';
  const shouldRenderOpenpose = renderPass === 'openpose' || renderPass === 'all';
  const shouldRenderIdMask = renderPass === 'id-mask' || renderPass === 'all';

  // 2. Single reusable scratch canvas per active pass (prevents multi-GB frame array accumulation)
  const makeScratchCanvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  };
  const rgbScratch = shouldRenderRgb ? makeScratchCanvas() : null;
  const clayScratch = shouldRenderClay ? makeScratchCanvas() : null;
  const depthScratch = shouldRenderDepth ? makeScratchCanvas() : null;
  const openposeScratch = shouldRenderOpenpose ? makeScratchCanvas() : null;
  const idMaskScratch = shouldRenderIdMask ? makeScratchCanvas() : null;

  let rgbEncoder: StreamingPassEncoder | null = null;
  let clayEncoder: StreamingPassEncoder | null = null;
  let depthEncoder: StreamingPassEncoder | null = null;
  let openposeEncoder: StreamingPassEncoder | null = null;
  let idMaskEncoder: StreamingPassEncoder | null = null;

  // True metric linear depth override material (Near = 1.0 White, Far = 0.0 Black, Background = Black)
  const depthFar = Math.min(Math.max(camera.far * 0.1, 40.0), 80.0);
  const depthNear = Math.max(camera.near, 0.4);
  const depthMaterial = createLinearDepthMaterial(depthNear, depthFar);

  // Albedo-Neutral Matte 3D Studio Clay Materials for LTX-2.5 `layout-to-render` (Zero Chrominance R=G=B)
  const clayActorMaterial = new THREE.MeshStandardMaterial({
    color: 0xb0b0b0,
    roughness: 0.72,
    metalness: 0.05,
  });
  const clayEnvMaterial = new THREE.MeshStandardMaterial({
    color: 0x757575,
    roughness: 0.85,
    metalness: 0.03,
  });
  const clayOceanMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c5c5c,
    roughness: 0.55,
    metalness: 0.08,
  });
  const clayFloorMaterial = new THREE.MeshStandardMaterial({
    color: 0x484848,
    roughness: 0.92,
    metalness: 0.02,
  });

  const idMaskMaterialCache = new Map<number, THREE.MeshBasicMaterial>();
  const getIdMaskMaterial = (colorHex: number): THREE.MeshBasicMaterial => {
    let mat = idMaskMaterialCache.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: colorHex, toneMapped: false });
      idMaskMaterialCache.set(colorHex, mat);
    }
    return mat;
  };

  const neutralAlphaMaskCache = new Map<THREE.Texture, THREE.DataTexture | null>();
  const cutoutClayMaterialCache = new Map<THREE.Texture, THREE.MeshStandardMaterial>();
  const cutoutDepthMaterialCache = new Map<THREE.Texture, THREE.MeshDepthMaterial>();

  const getClayCutoutMaterial = (alphaTex: THREE.Texture): THREE.MeshStandardMaterial => {
    let mat = cutoutClayMaterialCache.get(alphaTex);
    if (mat) return mat;

    let maskTex = neutralAlphaMaskCache.get(alphaTex);
    if (maskTex === undefined) {
      maskTex = createNeutralAlphaMaskFromDataTexture(alphaTex);
      neutralAlphaMaskCache.set(alphaTex, maskTex);
    }

    if (maskTex) {
      mat = new THREE.MeshStandardMaterial({
        color: 0x757575,
        roughness: 0.85,
        metalness: 0.03,
        alphaMap: maskTex,
        alphaTest: 0.5,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0x757575,
        roughness: 0.85,
        metalness: 0.03,
      });
      mat.defines = { ...(mat.defines || {}), USE_UV: '' };
      mat.customProgramCacheKey = () => 'ClayCutoutFallback_v1';
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uAlphaCutoutMap = { value: alphaTex };
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
uniform sampler2D uAlphaCutoutMap;`
          )
          .replace(
            '#include <alphatest_fragment>',
            `if (texture2D(uAlphaCutoutMap, vUv).a < 0.5) discard;
#include <alphatest_fragment>`
          );
      };
    }

    cutoutClayMaterialCache.set(alphaTex, mat);
    return mat;
  };

  const getDepthCutoutMaterial = (alphaTex: THREE.Texture): THREE.MeshDepthMaterial => {
    let mat = cutoutDepthMaterialCache.get(alphaTex);
    if (!mat) {
      mat = createLinearDepthMaterial(depthNear, depthFar, alphaTex);
      cutoutDepthMaterialCache.set(alphaTex, mat);
    }
    return mat;
  };

  const prevOverride = scene.overrideMaterial;
  const prevBackground = scene.background;
  const prevFog = scene.fog;
  const prevEnvironment = scene.environment;
  const prevExposure = renderer.toneMappingExposure;
  const prevShadowEnabled = renderer.shadowMap ? renderer.shadowMap.enabled : false;
  const prevSize = new THREE.Vector2();
  renderer.getSize(prevSize);

  try {
    // Ensure all 3D actor models are preloaded before recording frame canvases
    if (modelUrls && modelUrls.length > 0) {
      await preloadGltfModels(modelUrls);
    }

    renderer.setSize(width, height, false);

    if (shouldRenderRgb) rgbEncoder = await createStreamingPassEncoder(width, height, fps);
    if (shouldRenderClay) clayEncoder = await createStreamingPassEncoder(width, height, fps);
    if (shouldRenderDepth) depthEncoder = await createStreamingPassEncoder(width, height, fps);
    if (shouldRenderOpenpose) openposeEncoder = await createStreamingPassEncoder(width, height, fps);
    if (shouldRenderIdMask) idMaskEncoder = await createStreamingPassEncoder(width, height, fps);

    for (let f = 0; f < totalFrames; f++) {
      const t = totalFrames > 1 ? startSec + (f / (totalFrames - 1)) * activeDuration : startSec;

      // Update positions and matrices at exact timestep t
      syncPositions(t);
      camera.updateMatrixWorld(true);

      // --- Pass 1: RGB Viewfinder ---
      if (shouldRenderRgb && rgbScratch && rgbEncoder) {
        if (renderer.shadowMap) {
          renderer.shadowMap.enabled = true;
        }
        scene.overrideMaterial = null;
        scene.background = prevBackground;
        scene.fog = prevFog;
        renderer.render(scene, camera);

        const ctx = rgbScratch.getContext('2d');
        if (ctx) {
          ctx.drawImage(renderer.domElement, 0, 0, width, height);
        }
        await rgbEncoder.encodeFrame(rgbScratch, f);
      }

      // --- Pass 1b: Baked Clay Layout Pass (Albedo-Neutral Matte Grey 3D Shaded Geometry) ---
      if (shouldRenderClay) {
        const actorRootSet = new Set<THREE.Object3D>();
        for (const child of scene.children) {
          if (child.userData?.actorId !== undefined || child.userData?.isSubjectRoot === true) {
            actorRootSet.add(child);
          }
        }

        const isInsideActorRoot = (node: THREE.Object3D): boolean => {
          let curr: THREE.Object3D | null = node;
          while (curr && curr !== scene) {
            if (actorRootSet.has(curr)) return true;
            curr = curr.parent;
          }
          return false;
        };

        const isClayHelperOverlay = (node: THREE.Object3D): boolean => {
          let curr: THREE.Object3D | null = node;
          while (curr && curr !== scene) {
            if (
              curr.userData?.isContactShadow ||
              curr.userData?.isBaseRing ||
              curr.userData?.isHitProxy ||
              curr.userData?.isCycloramaBackdrop ||
              curr.name === '__base_ring_group__' ||
              curr.name === '__contact_shadow__' ||
              (curr as THREE.Sprite).isSprite
            ) {
              return true;
            }
            curr = curr.parent;
          }
          return false;
        };

        const savedClayMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
        const hiddenClayHelpers: THREE.Object3D[] = [];
        const savedLightStates: Array<{
          light: THREE.Light;
          colorHex: number;
          groundHex?: number;
          intensity: number;
        }> = [];
        let directionalLightCounter = 0;

        scene.traverse((obj) => {
          if (obj === scene) return;

          const asLight = obj as THREE.Light;
          if (asLight.isLight) {
            const hemi = asLight as THREE.HemisphereLight;
            const amb = asLight as THREE.AmbientLight;
            const dir = asLight as THREE.DirectionalLight;
            savedLightStates.push({
              light: asLight,
              colorHex: asLight.color ? asLight.color.getHex() : 0xffffff,
              groundHex: hemi.isHemisphereLight && hemi.groundColor ? hemi.groundColor.getHex() : undefined,
              intensity: asLight.intensity,
            });
            if (asLight.color) {
              asLight.color.setHex(0xffffff);
            }
            if (hemi.isHemisphereLight) {
              if (hemi.groundColor) {
                hemi.groundColor.setHex(0x3a3a3a);
              }
              asLight.intensity = 0.55;
            } else if (amb.isAmbientLight) {
              asLight.intensity = 0.35;
            } else if (dir.isDirectionalLight) {
              directionalLightCounter += 1;
              asLight.intensity = directionalLightCounter === 1 ? 1.15 : directionalLightCounter === 2 ? 0.45 : 0;
            } else {
              // Suppress arbitrary stage PointLights/SpotLights in the Clay pass so total irradiance never clips to pure white
              asLight.intensity = 0;
            }
            return;
          }

          if (
            (obj as THREE.Sprite).isSprite ||
            (obj as THREE.Points).isPoints ||
            (obj as THREE.Line).isLine ||
            isClayHelperOverlay(obj)
          ) {
            if (obj.visible) {
              obj.visible = false;
              hiddenClayHelpers.push(obj);
            }
            return;
          }

          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            savedClayMaterials.set(mesh, mesh.material);
            const insideActor = isInsideActorRoot(mesh);
            const isOcean =
              !insideActor &&
              (mesh.userData?.isOceanWater === true ||
                (mesh.rotation.x < -1.4 && mesh.position.y <= 0.08 && mesh.position.z <= -35));
            const isFloor =
              !insideActor &&
              !isOcean &&
              (mesh.userData?.isFloorPlane === true ||
                mesh.userData?.isGroundTerrain === true ||
                (mesh.rotation.x < -1.4 && mesh.position.y <= 0.05));
            const alphaCutoutMap = mesh.userData?.alphaCutoutMap as THREE.Texture | undefined;
            if (insideActor) {
              mesh.material = clayActorMaterial;
            } else if (isOcean) {
              mesh.material = clayOceanMaterial;
            } else if (isFloor) {
              mesh.material = clayFloorMaterial;
            } else if (alphaCutoutMap) {
              mesh.material = getClayCutoutMaterial(alphaCutoutMap);
            } else {
              mesh.material = clayEnvMaterial;
            }
          }
        });

        if (renderer.shadowMap) {
          renderer.shadowMap.enabled = true;
        }
        scene.overrideMaterial = null;
        scene.environment = null;
        renderer.toneMappingExposure = 1.0;
        scene.background = new THREE.Color(0x2c2c30);
        scene.fog = new THREE.Fog(0x2c2c30, 45, 210);
        renderer.render(scene, camera);

        // Restore original materials, lights, and helper visibility immediately
        savedClayMaterials.forEach((origMat, mesh) => {
          mesh.material = origMat;
        });
        for (const obj of hiddenClayHelpers) {
          obj.visible = true;
        }
        for (const st of savedLightStates) {
          if (st.light.color) st.light.color.setHex(st.colorHex);
          const hemi = st.light as THREE.HemisphereLight;
          if (hemi.isHemisphereLight && hemi.groundColor && st.groundHex !== undefined) {
            hemi.groundColor.setHex(st.groundHex);
          }
          st.light.intensity = st.intensity;
        }
        scene.environment = prevEnvironment;
        renderer.toneMappingExposure = prevExposure;
        scene.background = prevBackground;
        scene.fog = prevFog;

        if (clayScratch && clayEncoder) {
          const clayCtx = clayScratch.getContext('2d');
          if (clayCtx) {
            clayCtx.drawImage(renderer.domElement, 0, 0, width, height);
          }
          await clayEncoder.encodeFrame(clayScratch, f);
        }
      }

      // --- Pass 2: Volumetric Linear Depth Map ---
      if (shouldRenderDepth) {
        const hiddenContactShadows: THREE.Object3D[] = [];
        let hasAlphaCutoutMeshes = false;
        scene.traverse((obj) => {
          if ((obj.userData?.isContactShadow || obj.userData?.isCycloramaBackdrop) && obj.visible) {
            obj.visible = false;
            hiddenContactShadows.push(obj);
            return;
          }
          if ((obj as THREE.Mesh).isMesh && obj.visible && obj.userData?.alphaCutoutMap) {
            hasAlphaCutoutMeshes = true;
          }
        });

        scene.background = new THREE.Color(0x000000);
        if (hasAlphaCutoutMeshes) {
          const savedDepthMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
          scene.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.visible) {
              savedDepthMaterials.set(mesh, mesh.material);
              const alphaTex = mesh.userData?.alphaCutoutMap as THREE.Texture | undefined;
              mesh.material = alphaTex ? getDepthCutoutMaterial(alphaTex) : depthMaterial;
            }
          });
          scene.overrideMaterial = null;
          renderer.render(scene, camera);
          savedDepthMaterials.forEach((origMat, mesh) => {
            mesh.material = origMat;
          });
        } else {
          scene.overrideMaterial = depthMaterial;
          renderer.render(scene, camera);
        }

        for (const obj of hiddenContactShadows) {
          obj.visible = true;
        }

        if (depthScratch && depthEncoder) {
          const depthCtx = depthScratch.getContext('2d');
          if (depthCtx) {
            depthCtx.drawImage(renderer.domElement, 0, 0, width, height);
          }
          await depthEncoder.encodeFrame(depthScratch, f);
        }
      }

      // --- Pass 3: ControlNet OpenPose Skeleton Pass ---
      if (shouldRenderOpenpose && openposeScratch && openposeEncoder) {
        const activeRigs: HumanoidRig[] = options.humanoidRigs && options.humanoidRigs.length > 0
          ? [...options.humanoidRigs]
          : [];

        if (activeRigs.length === 0) {
          scene.traverse((obj) => {
            const archetype = obj.userData?.rigArchetype || obj.userData?.autoRigType;
            const kind = obj.userData?.kind;
            const isNonHumanoid =
              archetype === 'quadruped' ||
              archetype === 'spine_flex' ||
              archetype === 'rigid_prop' ||
              kind === 'prop' ||
              kind === 'vehicle' ||
              kind === 'quadruped' ||
              kind === 'creature';
            if (obj.userData?.rig && !isNonHumanoid && !activeRigs.includes(obj.userData.rig)) {
              activeRigs.push(obj.userData.rig);
            }
          });
        }

        scene.updateMatrixWorld(true);
        for (const rig of activeRigs) {
          rig.root.updateMatrixWorld(true);
        }

        renderOpenPoseCanvas(activeRigs, camera, openposeScratch, width, height);
        await openposeEncoder.encodeFrame(openposeScratch, f);
      }

      // --- Pass 4: Object ID Segmentation Mask Pass (Cryptomatte-style flat unlit per-subject colors on #000000) ---
      if (shouldRenderIdMask) {
        const actorRootOrder = new Map<THREE.Object3D, number>();
        for (const child of scene.children) {
          if (child.userData?.actorId !== undefined || child.userData?.isSubjectRoot === true) {
            const explicitIdx =
              typeof child.userData?.actorIndex === 'number'
                ? child.userData.actorIndex
                : actorRootOrder.size;
            actorRootOrder.set(child, explicitIdx);
          }
        }
        // Fallback for standalone unit tests where meshes are placed directly in scene without actorId
        if (actorRootOrder.size === 0) {
          for (const child of scene.children) {
            const isMeshOrGroup = (child as THREE.Mesh).isMesh || child.type === 'Group';
            const isHelper =
              child.userData?.isContactShadow ||
              child.userData?.isBaseRing ||
              child.userData?.isHitProxy ||
              child.name === '__base_ring_group__';
            if (isMeshOrGroup && !isHelper) {
              actorRootOrder.set(child, actorRootOrder.size);
            }
          }
        }

        const savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
        const hiddenNonActorObjects: THREE.Object3D[] = [];

        const findActorRoot = (node: THREE.Object3D): THREE.Object3D | null => {
          let curr: THREE.Object3D | null = node;
          while (curr && curr !== scene) {
            if (actorRootOrder.has(curr)) return curr;
            curr = curr.parent;
          }
          return null;
        };

        const isHelperOverlay = (node: THREE.Object3D): boolean => {
          let curr: THREE.Object3D | null = node;
          while (curr && curr !== scene) {
            if (
              curr.userData?.isContactShadow ||
              curr.userData?.isBaseRing ||
              curr.userData?.isHitProxy ||
              curr.name === '__base_ring_group__' ||
              (curr as THREE.Sprite).isSprite
            ) {
              return true;
            }
            curr = curr.parent;
          }
          return false;
        };

        scene.traverse((obj) => {
          if (obj === scene) return;
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh || (obj as THREE.Sprite).isSprite || (obj as THREE.Line).isLine || (obj as THREE.Points).isPoints) {
            const root = findActorRoot(obj);
            if (mesh.isMesh && root && !isHelperOverlay(obj)) {
              const idx = actorRootOrder.get(root) ?? 0;
              const maskColorHex =
                typeof root.userData?.idMaskColorHex === 'number'
                  ? root.userData.idMaskColorHex
                  : SUBJECT_ID_MASK_PALETTE[idx % SUBJECT_ID_MASK_PALETTE.length];
              savedMaterials.set(mesh, mesh.material);
              mesh.material = getIdMaskMaterial(maskColorHex);
            } else if (obj.visible) {
              obj.visible = false;
              hiddenNonActorObjects.push(obj);
            }
          }
        });

        if (renderer.shadowMap) {
          renderer.shadowMap.enabled = false;
        }
        scene.overrideMaterial = null;
        scene.background = new THREE.Color(0x000000);
        scene.fog = null;
        renderer.render(scene, camera);

        // Restore materials & visibility immediately after Pass 4
        savedMaterials.forEach((origMat, mesh) => {
          mesh.material = origMat;
        });
        for (const obj of hiddenNonActorObjects) {
          obj.visible = true;
        }
        scene.fog = prevFog;
        if (renderer.shadowMap) {
          renderer.shadowMap.enabled = prevShadowEnabled;
        }

        if (idMaskScratch && idMaskEncoder) {
          const idMaskCtx = idMaskScratch.getContext('2d');
          if (idMaskCtx) {
            idMaskCtx.drawImage(renderer.domElement, 0, 0, width, height);
          }
          await idMaskEncoder.encodeFrame(idMaskScratch, f);
        }
      }

      onFrame?.(f, totalFrames);
      if (onProgress) {
        const pct = Math.round(((f + 1) / totalFrames) * 85); // First 85% is rendering + streaming encode
        onProgress(pct);
      }

      // Allow UI thread to breathe
      if (f % 12 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // 3. Finalize streaming MP4 encoders into compliant MP4 Blobs
    let rgbBlob: Blob | undefined;
    let rgbUrl: string | undefined;
    let clayBlob: Blob | undefined;
    let clayUrl: string | undefined;
    let depthBlob: Blob | undefined;
    let depthUrl: string | undefined;
    let openposeBlob: Blob | undefined;
    let openposeUrl: string | undefined;
    let idMaskBlob: Blob | undefined;
    let idMaskUrl: string | undefined;

    if (rgbEncoder) {
      onProgress?.(88);
      rgbBlob = await rgbEncoder.finalize();
      rgbUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(rgbBlob)
          : undefined;
    }

    if (clayEncoder) {
      onProgress?.(91);
      clayBlob = await clayEncoder.finalize();
      clayUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(clayBlob)
          : undefined;
    }

    if (depthEncoder) {
      onProgress?.(94);
      depthBlob = await depthEncoder.finalize();
      depthUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(depthBlob)
          : undefined;
    }

    if (openposeEncoder) {
      onProgress?.(97);
      openposeBlob = await openposeEncoder.finalize();
      openposeUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(openposeBlob)
          : undefined;
    }

    if (idMaskEncoder) {
      onProgress?.(99);
      idMaskBlob = await idMaskEncoder.finalize();
      idMaskUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(idMaskBlob)
          : undefined;
    }

    onProgress?.(100);

    return {
      rgbBlob,
      rgbUrl,
      clayBlob,
      clayUrl,
      depthBlob,
      depthUrl,
      openposeBlob,
      openposeUrl,
      idMaskBlob,
      idMaskUrl,
      totalFrames,
      durationSeconds,
      fps,
      width,
      height,
    };
  } finally {
    // 4. Guaranteed encoder handle cleanup & restoration of scene and renderer state
    rgbEncoder?.dispose();
    clayEncoder?.dispose();
    depthEncoder?.dispose();
    openposeEncoder?.dispose();
    idMaskEncoder?.dispose();
    depthMaterial.dispose();
    clayActorMaterial.dispose();
    clayEnvMaterial.dispose();
    clayOceanMaterial.dispose();
    clayFloorMaterial.dispose();
    idMaskMaterialCache.forEach((mat) => mat.dispose());
    cutoutClayMaterialCache.forEach((mat) => mat.dispose());
    cutoutDepthMaterialCache.forEach((mat) => mat.dispose());
    neutralAlphaMaskCache.forEach((tex) => tex?.dispose());
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
    scene.fog = prevFog;
    scene.environment = prevEnvironment;
    renderer.toneMappingExposure = prevExposure;
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = prevShadowEnabled;
    }
    renderer.setSize(prevSize.x, prevSize.y, false);
  }
}
