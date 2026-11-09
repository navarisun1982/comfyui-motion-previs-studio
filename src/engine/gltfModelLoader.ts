import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getModelBuffer, getModelIdFromUrl, storeModelBuffer } from '../services/modelStorage';

const dracoLoader = new DRACOLoader();
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
if (MeshoptDecoder) {
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
}

// Master cache of normalized template groups keyed by modelUrl or model ID
const normalizedTemplateCache = new Map<string, THREE.Group>();

// In-flight loading promises to prevent duplicate fetches/parses
const pendingLoads = new Map<string, Promise<THREE.Group>>();

export interface LoadedModelResult {
  scene: THREE.Group;
  bbox: THREE.Box3;
  size: THREE.Vector3;
  center: THREE.Vector3;
  sourceUrl: string;
  animations?: THREE.AnimationClip[];
}

function normalizeLocalPublicModelUrl(url: string): string {
  if (
    typeof window !== 'undefined' &&
    window.location?.protocol?.startsWith('file:') &&
    url.startsWith('/models/')
  ) {
    return `.${url}`;
  }
  return url;
}

function storeTemplateWithAliases(modelUrl: string, template: THREE.Group): void {
  normalizedTemplateCache.set(modelUrl, template);
  if (modelUrl.startsWith('./models/')) {
    normalizedTemplateCache.set(modelUrl.slice(1), template);
  } else if (modelUrl.startsWith('/models/')) {
    normalizedTemplateCache.set(`.${modelUrl}`, template);
  }
  const modelId = getModelIdFromUrl(modelUrl);
  if (modelId) {
    normalizedTemplateCache.set(modelId, template);
    normalizedTemplateCache.set(`model://${modelId}`, template);
  }
}

function lookupTemplateWithAliases(modelUrl: string): THREE.Group | undefined {
  const direct = normalizedTemplateCache.get(modelUrl);
  if (direct) return direct;
  if (modelUrl.startsWith('./models/')) {
    const slashAlias = normalizedTemplateCache.get(modelUrl.slice(1));
    if (slashAlias) return slashAlias;
  } else if (modelUrl.startsWith('/models/')) {
    const dotAlias = normalizedTemplateCache.get(`.${modelUrl}`);
    if (dotAlias) return dotAlias;
  }
  const modelId = getModelIdFromUrl(modelUrl);
  if (modelId) {
    return (
      normalizedTemplateCache.get(`model://${modelId}`) ||
      normalizedTemplateCache.get(modelId)
    );
  }
  return undefined;
}

/**
 * Clones a cached GLTF template and deep-clones each Mesh's BufferGeometry
 * so scaling, auto-rigging, or skinning a clone never mutates the master template.
 */
function cloneNormalizedTemplate(template: THREE.Group): THREE.Group {
  const cloned = skeletonClone(template) as THREE.Group;
  cloned.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        const srcSkinCache = mesh.geometry.userData?.__cachedAutoSkin;
        mesh.geometry = mesh.geometry.clone();
        if (srcSkinCache) {
          mesh.geometry.userData = { ...mesh.geometry.userData, __cachedAutoSkin: srcSkinCache };
        }
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => (m ? m.clone() : m));
        } else {
          mesh.material = mesh.material.clone();
        }
      }
    }
  });
  cloned.updateMatrixWorld(true);
  return cloned;
}

/**
 * Normalizes an imported GLTF hierarchy:
 * 1. Centers the geometry on X and Z (pivot at center of footprint).
 * 2. Normalizes scale to standard cinematic unit scale (~2.0m baseline height).
 * 3. Rests the base precisely on the ground plane (min.y = 0).
 * 4. Ensures double-sided rendering, shadows, and PBR illumination.
 */
export function normalizeGltfScene(rawScene: THREE.Group, targetHeightMeters: number = 2.0): THREE.Group {
  const container = new THREE.Group();
  container.name = 'gltf_normalized_root';

  // Work on a wrapper to preserve original object transforms
  container.add(rawScene);

  // 0. If this GLTF contains a humanoid skeleton (Mixamo / standard Hips + Head + LeftUpLeg + RightUpLeg),
  // ensure the character stands upright (+Y) and faces forward (+Z, where LeftUpLeg.x > RightUpLeg.x)
  // before computing bounding boxes or capturing rest-pose bone matrices.
  rawScene.updateMatrixWorld(true);
  let hipsBone: THREE.Object3D | null = null;
  let headBone: THREE.Object3D | null = null;
  let leftUpLegBone: THREE.Object3D | null = null;
  let rightUpLegBone: THREE.Object3D | null = null;
  rawScene.traverse((child) => {
    if ((child as THREE.Bone).isBone) {
      const n = child.name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (!hipsBone && (n === 'mixamorighips' || n === 'hips' || n.endsWith('hips'))) {
        hipsBone = child;
      } else if (!headBone && (n === 'mixamorighead' || n === 'head' || n.endsWith('head'))) {
        headBone = child;
      } else if (!leftUpLegBone && (n.includes('leftupleg') || n.includes('lthigh'))) {
        leftUpLegBone = child;
      } else if (!rightUpLegBone && (n.includes('rightupleg') || n.includes('rthigh'))) {
        rightUpLegBone = child;
      }
    }
  });

  if (hipsBone && headBone) {
    const hipsPos = new THREE.Vector3();
    const headPos = new THREE.Vector3();
    (hipsBone as THREE.Object3D).getWorldPosition(hipsPos);
    (headBone as THREE.Object3D).getWorldPosition(headPos);
    const dy = headPos.y - hipsPos.y;
    const dz = headPos.z - hipsPos.z;
    if (Math.abs(dz) > Math.abs(dy) * 1.2) {
      rawScene.rotateX(dz > 0 ? -Math.PI / 2 : Math.PI / 2);
      rawScene.updateMatrixWorld(true);
    }
    if (leftUpLegBone && rightUpLegBone) {
      const lPos = new THREE.Vector3();
      const rPos = new THREE.Vector3();
      (leftUpLegBone as THREE.Object3D).getWorldPosition(lPos);
      (rightUpLegBone as THREE.Object3D).getWorldPosition(rPos);
      if (lPos.x < rPos.x - 1e-4) {
        rawScene.rotateY(Math.PI);
        rawScene.updateMatrixWorld(true);
      }
    }
  }

  // 1. Compute initial untransformed bounding box to determine scale
  rawScene.updateMatrixWorld(true);
  const initialBbox = new THREE.Box3().setFromObject(rawScene);
  const initialSize = initialBbox.getSize(new THREE.Vector3());

  // 2. Scale first so geometry dimensions match target height
  const maxDim = Math.max(initialSize.x, initialSize.y, initialSize.z, 0.001);
  const scaleFactor = targetHeightMeters / maxDim;
  rawScene.scale.set(scaleFactor, scaleFactor, scaleFactor);
  rawScene.updateMatrixWorld(true);

  // 3. Compute scaled bounds and center X/Z while grounding Y
  const scaledBbox = new THREE.Box3().setFromObject(rawScene);
  const scaledCenter = scaledBbox.getCenter(new THREE.Vector3());

  rawScene.position.x -= scaledCenter.x;
  rawScene.position.z -= scaledCenter.z;
  rawScene.position.y -= scaledBbox.min.y;
  rawScene.updateMatrixWorld(true);

  // 5. Enhance materials and shadows across all meshes
  rawScene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Layer 0 is visible to both Editor and Viewfinder cameras
      mesh.layers.set(0);

      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          // Double-sided rendering prevents inverted normals or thin polygons from being culled
          mat.side = THREE.DoubleSide;

          if ('roughness' in mat) {
            const std = mat as THREE.MeshStandardMaterial;
            if (std.roughness === undefined || isNaN(std.roughness)) std.roughness = 0.55;
            if (std.metalness === undefined || isNaN(std.metalness)) std.metalness = 0.15;
            std.needsUpdate = true;
          }
        });
      }
    }
  });

  container.updateMatrixWorld(true);
  return container;
}

/**
 * Loads and normalizes a GLB/GLTF model from any URL, model:// URI, Data URI, or ArrayBuffer.
 * Returns a cloned THREE.Group ready to be added to a scene.
 */
export async function loadGltfModel(
  modelUrl: string,
  targetHeightMeters: number = 2.0
): Promise<LoadedModelResult> {
  if (!modelUrl) {
    throw new Error('Cannot load GLTF: empty modelUrl provided.');
  }

  // 1. Check template cache (including model:// <-> blob: aliases)
  const cachedTemplate = lookupTemplateWithAliases(modelUrl);
  if (cachedTemplate) {
    storeTemplateWithAliases(modelUrl, cachedTemplate);
    const cloned = cloneNormalizedTemplate(cachedTemplate);
    const bbox = new THREE.Box3().setFromObject(cloned);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const animations =
      (cachedTemplate.userData?.gltfAnimations as THREE.AnimationClip[] | undefined)?.map((c) => c.clone()) || [];
    return { scene: cloned, bbox, size, center, sourceUrl: modelUrl, animations };
  }

  // 2. Check pending in-flight loads to prevent duplicate simultaneous parses
  let loadPromise = pendingLoads.get(modelUrl);
  if (!loadPromise) {
    loadPromise = (async () => {
      // Step A: Attempt to retrieve raw ArrayBuffer from memory/IndexedDB/data-uri
      const arrayBuffer = await getModelBuffer(modelUrl);

      if (arrayBuffer && arrayBuffer.byteLength > 0) {
        // Direct in-memory parsing — 100% resilient, bypasses fetch() and FileLoader URL length limits
        return new Promise<THREE.Group>((resolve, reject) => {
          gltfLoader.parse(
            arrayBuffer,
            '',
            (gltf) => {
              const normalized = normalizeGltfScene(gltf.scene, targetHeightMeters);
              normalized.userData.gltfAnimations = gltf.animations || [];
              resolve(normalized);
            },
            (err) => {
              console.error(`GLTFLoader.parse failed for model [${modelUrl}]:`, err);
              reject(err);
            }
          );
        });
      }

      // Step B: For remote HTTP/HTTPS GLB URLs, fetch ArrayBuffer and persist in IndexedDB (modelStorage)
      // so subsequent loads and offline sessions load instantaneously from local storage!
      if (typeof fetch === 'function' && /^https?:\/\//i.test(modelUrl)) {
        try {
          const resp = await fetch(modelUrl);
          if (resp.ok) {
            const remoteBuf = await resp.arrayBuffer();
            if (remoteBuf && remoteBuf.byteLength > 0) {
              await storeModelBuffer(modelUrl, remoteBuf, modelUrl).catch(() => {});
              return await new Promise<THREE.Group>((resolve, reject) => {
                gltfLoader.parse(
                  remoteBuf,
                  '',
                  (gltf) => {
                    const normalized = normalizeGltfScene(gltf.scene, targetHeightMeters);
                    normalized.userData.gltfAnimations = gltf.animations || [];
                    resolve(normalized);
                  },
                  (err) => reject(err)
                );
              });
            }
          }
        } catch (fetchErr) {
          console.warn(`Direct fetch+cache fallback to gltfLoader.load for [${modelUrl}]:`, fetchErr);
        }
      }

      // Step C: Fallback to standard URL loader
      const resolvedLoadUrl = normalizeLocalPublicModelUrl(modelUrl);
      return new Promise<THREE.Group>((resolve, reject) => {
        gltfLoader.load(
          resolvedLoadUrl,
          (gltf) => {
            const normalized = normalizeGltfScene(gltf.scene, targetHeightMeters);
            normalized.userData.gltfAnimations = gltf.animations || [];
            resolve(normalized);
          },
          undefined,
          (err) => {
            console.error(`GLTFLoader.load failed for model [${resolvedLoadUrl}]:`, err);
            reject(err);
          }
        );
      });
    })();

    pendingLoads.set(modelUrl, loadPromise);
  }

  try {
    const template = await loadPromise;
    storeTemplateWithAliases(modelUrl, template);

    const cloned = cloneNormalizedTemplate(template);
    const bbox = new THREE.Box3().setFromObject(cloned);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const animations =
      (template.userData?.gltfAnimations as THREE.AnimationClip[] | undefined)?.map((c) => c.clone()) || [];

    return { scene: cloned, bbox, size, center, sourceUrl: modelUrl, animations };
  } finally {
    pendingLoads.delete(modelUrl);
  }
}

/**
 * Synchronously checks if a model has already been parsed and cached.
 */
export function getCachedGltfModel(modelUrl: string): LoadedModelResult | null {
  const cached = lookupTemplateWithAliases(modelUrl);
  if (!cached) return null;
  storeTemplateWithAliases(modelUrl, cached);
  const cloned = cloneNormalizedTemplate(cached);
  const bbox = new THREE.Box3().setFromObject(cloned);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());
  const animations =
    (cached.userData?.gltfAnimations as THREE.AnimationClip[] | undefined)?.map((c) => c.clone()) || [];
  return { scene: cloned, bbox, size, center, sourceUrl: modelUrl, animations };
}

/**
 * Preloads an array of model URLs so that rendering loops don't experience pop-in.
 */
export async function preloadGltfModels(modelUrls: string[]): Promise<void> {
  const tasks = modelUrls
    .filter((url) => !!url && !lookupTemplateWithAliases(url))
    .map((url) => loadGltfModel(url).catch((err) => console.warn(`Preload failed for ${url}:`, err)));
  await Promise.all(tasks);
}

/**
 * Clears cached models (for tests or scene resets).
 */
export function clearGltfCache(): void {
  normalizedTemplateCache.clear();
  pendingLoads.clear();
}
