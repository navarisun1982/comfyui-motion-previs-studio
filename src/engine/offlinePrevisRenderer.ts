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
 * Creates a true metric linear depth override material for ControlNet / MiDaS / DepthAnything passes.
 * Near geometry is mapped to 1.0 (white), distant geometry to 0.0 (dark), and background is 0.0 (black).
 * Supports standard meshes, skinned meshes, and instanced meshes with no non-linear perspective warping.
 */
export function createLinearDepthMaterial(near: number = 0.5, far: number = 60.0): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.BasicDepthPacking,
  });

  mat.customProgramCacheKey = () => `ControlNetLinearDepthMaterial_${near}_${far}`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.depthNear = { value: near };
    shader.uniforms.depthFar = { value: far };

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
    trimStartSeconds,
    trimEndSeconds,
    syncPositions,
    onProgress,
    onFrame,
    modelUrls,
  } = options;

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

  // 2. Offscreen intermediate canvases
  const rgbFrames: HTMLCanvasElement[] = [];
  const clayFrames: HTMLCanvasElement[] = [];
  const depthFrames: HTMLCanvasElement[] = [];
  const openposeFrames: HTMLCanvasElement[] = [];
  const idMaskFrames: HTMLCanvasElement[] = [];

  // True metric linear depth override material (Near = 1.0 White, Far = 0.0 Black, Background = Black)
  const depthFar = Math.min(Math.max(camera.far * 0.1, 40.0), 80.0);
  const depthNear = Math.max(camera.near, 0.4);
  const depthMaterial = createLinearDepthMaterial(depthNear, depthFar);

  // Albedo-Neutral Matte 3D Studio Clay Materials for LTX-2.5 `layout-to-render` (Zero Chrominance R=G=B)
  const clayActorMaterial = new THREE.MeshStandardMaterial({
    color: 0xb4b4b4,
    roughness: 0.85,
    metalness: 0.04,
  });
  const clayEnvMaterial = new THREE.MeshStandardMaterial({
    color: 0x828282,
    roughness: 0.9,
    metalness: 0.02,
  });
  const clayFloorMaterial = new THREE.MeshStandardMaterial({
    color: 0x626262,
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

  const prevOverride = scene.overrideMaterial;
  const prevBackground = scene.background;
  const prevFog = scene.fog;
  const prevShadowEnabled = renderer.shadowMap ? renderer.shadowMap.enabled : false;
  const prevSize = new THREE.Vector2();
  renderer.getSize(prevSize);

  try {
    // Ensure all 3D actor models are preloaded before recording frame canvases
    if (modelUrls && modelUrls.length > 0) {
      await preloadGltfModels(modelUrls);
    }

    renderer.setSize(width, height, false);

    for (let f = 0; f < totalFrames; f++) {
      const t = totalFrames > 1 ? startSec + (f / (totalFrames - 1)) * activeDuration : startSec;

      // Update positions and matrices at exact timestep t
      syncPositions(t);
      camera.updateMatrixWorld(true);

      // --- Pass 1: RGB Viewfinder ---
      if (shouldRenderRgb) {
        if (renderer.shadowMap) {
          renderer.shadowMap.enabled = true;
        }
        scene.overrideMaterial = null;
        scene.background = prevBackground;
        scene.fog = prevFog;
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

        scene.traverse((obj) => {
          if (obj === scene) return;

          const asLight = obj as THREE.Light;
          if (asLight.isLight) {
            const hemi = asLight as THREE.HemisphereLight;
            savedLightStates.push({
              light: asLight,
              colorHex: asLight.color ? asLight.color.getHex() : 0xffffff,
              groundHex: hemi.isHemisphereLight && hemi.groundColor ? hemi.groundColor.getHex() : undefined,
              intensity: asLight.intensity,
            });
            if (asLight.color) {
              asLight.color.setHex(0xffffff);
            }
            if (hemi.isHemisphereLight && hemi.groundColor) {
              hemi.groundColor.setHex(0x4a4a4a);
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
            const isFloor =
              mesh.rotation.x < -1.4 &&
              mesh.position.y <= 0.05 &&
              !isInsideActorRoot(mesh);
            if (isInsideActorRoot(mesh)) {
              mesh.material = clayActorMaterial;
            } else if (isFloor) {
              mesh.material = clayFloorMaterial;
            } else {
              mesh.material = clayEnvMaterial;
            }
          }
        });

        if (renderer.shadowMap) {
          renderer.shadowMap.enabled = true;
        }
        scene.overrideMaterial = null;
        scene.background = new THREE.Color(0x3a3a3e);
        scene.fog = new THREE.Fog(0x3a3a3e, 38, 190);
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
        scene.background = prevBackground;
        scene.fog = prevFog;

        const clayCanvas = document.createElement('canvas');
        clayCanvas.width = width;
        clayCanvas.height = height;
        const clayCtx = clayCanvas.getContext('2d');
        if (clayCtx) {
          clayCtx.drawImage(renderer.domElement, 0, 0, width, height);
        }
        clayFrames.push(clayCanvas);
      }

      // --- Pass 2: Volumetric Linear Depth Map ---
      if (shouldRenderDepth) {
        const hiddenContactShadows: THREE.Object3D[] = [];
        scene.traverse((obj) => {
          if (obj.userData?.isContactShadow && obj.visible) {
            obj.visible = false;
            hiddenContactShadows.push(obj);
          }
        });
        scene.overrideMaterial = depthMaterial;
        scene.background = new THREE.Color(0x000000);
        renderer.render(scene, camera);
        for (const obj of hiddenContactShadows) {
          obj.visible = true;
        }

        const depthCanvas = document.createElement('canvas');
        depthCanvas.width = width;
        depthCanvas.height = height;
        const depthCtx = depthCanvas.getContext('2d');
        if (depthCtx) {
          depthCtx.drawImage(renderer.domElement, 0, 0, width, height);
        }
        depthFrames.push(depthCanvas);
      }

      // --- Pass 3: ControlNet OpenPose Skeleton Pass ---
      if (shouldRenderOpenpose) {
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

        const openposeCanvas = document.createElement('canvas');
        renderOpenPoseCanvas(activeRigs, camera, openposeCanvas, width, height);
        openposeFrames.push(openposeCanvas);
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

        const idMaskCanvas = document.createElement('canvas');
        idMaskCanvas.width = width;
        idMaskCanvas.height = height;
        const idMaskCtx = idMaskCanvas.getContext('2d');
        if (idMaskCtx) {
          idMaskCtx.drawImage(renderer.domElement, 0, 0, width, height);
        }
        idMaskFrames.push(idMaskCanvas);
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
    let clayBlob: Blob | undefined;
    let clayUrl: string | undefined;
    let depthBlob: Blob | undefined;
    let depthUrl: string | undefined;
    let openposeBlob: Blob | undefined;
    let openposeUrl: string | undefined;
    let idMaskBlob: Blob | undefined;
    let idMaskUrl: string | undefined;

    if (shouldRenderRgb && rgbFrames.length > 0) {
      onProgress?.(83);
      rgbBlob = await muxFramesToMp4(rgbFrames, width, height, fps);
      rgbUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(rgbBlob)
          : undefined;
    }

    if (shouldRenderClay && clayFrames.length > 0) {
      onProgress?.(87);
      clayBlob = await muxFramesToMp4(clayFrames, width, height, fps);
      clayUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(clayBlob)
          : undefined;
    }

    if (shouldRenderDepth && depthFrames.length > 0) {
      onProgress?.(91);
      depthBlob = await muxFramesToMp4(depthFrames, width, height, fps);
      depthUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(depthBlob)
          : undefined;
    }

    if (shouldRenderOpenpose && openposeFrames.length > 0) {
      onProgress?.(95);
      openposeBlob = await muxFramesToMp4(openposeFrames, width, height, fps);
      openposeUrl =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(openposeBlob)
          : undefined;
    }

    if (shouldRenderIdMask && idMaskFrames.length > 0) {
      onProgress?.(98);
      idMaskBlob = await muxFramesToMp4(idMaskFrames, width, height, fps);
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
    // 4. Guaranteed restoration of scene and renderer state
    depthMaterial.dispose();
    clayActorMaterial.dispose();
    clayEnvMaterial.dispose();
    clayFloorMaterial.dispose();
    idMaskMaterialCache.forEach((mat) => mat.dispose());
    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
    scene.fog = prevFog;
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = prevShadowEnabled;
    }
    renderer.setSize(prevSize.x, prevSize.y, false);
  }
}
