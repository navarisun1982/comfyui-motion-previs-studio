import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getModelBuffer } from '../services/modelStorage';

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

  // 1. Check template cache
  const cachedTemplate = normalizedTemplateCache.get(modelUrl);
  if (cachedTemplate) {
    const cloned = skeletonClone(cachedTemplate) as THREE.Group;
    cloned.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(cloned);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const animations = (cachedTemplate.userData?.gltfAnimations as THREE.AnimationClip[] | undefined)?.map((c) => c.clone()) || [];
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

      // Step B: Fallback to standard URL loader for remote HTTP assets
      return new Promise<THREE.Group>((resolve, reject) => {
        gltfLoader.load(
          modelUrl,
          (gltf) => {
            const normalized = normalizeGltfScene(gltf.scene, targetHeightMeters);
            normalized.userData.gltfAnimations = gltf.animations || [];
            resolve(normalized);
          },
          undefined,
          (err) => {
            console.error(`GLTFLoader.load failed for model [${modelUrl}]:`, err);
            reject(err);
          }
        );
      });
    })();

    pendingLoads.set(modelUrl, loadPromise);
  }

  try {
    const template = await loadPromise;
    normalizedTemplateCache.set(modelUrl, template);

    const cloned = skeletonClone(template) as THREE.Group;
    cloned.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(cloned);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const animations = (template.userData?.gltfAnimations as THREE.AnimationClip[] | undefined)?.map((c) => c.clone()) || [];

    return { scene: cloned, bbox, size, center, sourceUrl: modelUrl, animations };
  } finally {
    pendingLoads.delete(modelUrl);
  }
}

/**
 * Synchronously checks if a model has already been parsed and cached.
 */
export function getCachedGltfModel(modelUrl: string): LoadedModelResult | null {
  const cached = normalizedTemplateCache.get(modelUrl);
  if (!cached) return null;
  const cloned = skeletonClone(cached) as THREE.Group;
  cloned.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(cloned);
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());
  const animations = (cached.userData?.gltfAnimations as THREE.AnimationClip[] | undefined)?.map((c) => c.clone()) || [];
  return { scene: cloned, bbox, size, center, sourceUrl: modelUrl, animations };
}

/**
 * Preloads an array of model URLs so that rendering loops don't experience pop-in.
 */
export async function preloadGltfModels(modelUrls: string[]): Promise<void> {
  const tasks = modelUrls
    .filter((url) => !!url && !normalizedTemplateCache.has(url))
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
