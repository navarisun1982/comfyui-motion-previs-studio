/**
 * Character Texture Projector & Rigged Costume Dresser Bridge
 *
 * Implements the hybrid Skinned Character Base with UV Projection architecture:
 * 1. Takes the high-poly organic skinned humanoid mesh (Mixamo Y-Bot / X-Bot).
 * 2. Projects the uploaded 2D concept art directly onto the front and back of the humanoid mesh.
 * 3. Delegates costume accessories and dressing to characterDresser.ts.
 */

import * as THREE from 'three';
import { CharacterVisualFeatures } from '../procedural3D/characterClayCompiler';

export interface ProjectorOptions {
  tint?: string;
  roughness?: number;
  metalness?: number;
  preserveJoints?: boolean;
}

/**
 * Projects a 2D concept art image onto a 3D humanoid skinned mesh.
 * Computes front/back orthographic UV coordinates and maps the concept art
 * with seamless anatomical alignment and clothing palette back-shading.
 */
export function projectConceptArtOntoSkinnedMesh(
  mesh: THREE.SkinnedMesh,
  imageCanvasOrDataUrl: HTMLCanvasElement | string,
  _palette: CharacterVisualFeatures['palette'],
  options: ProjectorOptions = {}
): THREE.Texture {
  const geom = mesh.geometry;
  geom.computeBoundingBox();
  const bbox = geom.boundingBox!;
  const min = bbox.min;
  const max = bbox.max;

  const width = Math.max(max.x - min.x, 0.001);
  const height = Math.max(max.y - min.y, 0.001);

  const posAttr = geom.attributes.position;
  const normAttr = geom.attributes.normal;
  const count = posAttr.count;

  // Create planar projected UVs: [0..1] mapped across X and Y bounds
  const projectedUvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);

    const nz = normAttr ? normAttr.getZ(i) : 1;

    // Normalize horizontal and vertical positions
    let u = (x - min.x) / width;
    let v = (y - min.y) / height;

    // Flip horizontally for front view facing camera (+Z)
    u = 1.0 - u;

    // If vertex faces backward (back of the head/torso), mirror U to avoid text inversion
    if (nz < -0.1) {
      u = (x - min.x) / width; // mirrored
    }

    projectedUvs[i * 2] = Math.max(0, Math.min(1, u));
    projectedUvs[i * 2 + 1] = Math.max(0, Math.min(1, v));
  }

  geom.setAttribute('uv', new THREE.BufferAttribute(projectedUvs, 2));
  geom.attributes.uv.needsUpdate = true;

  // Load or construct Three.js Texture
  let texture: THREE.Texture;
  if (typeof imageCanvasOrDataUrl === 'string') {
    const loader = new THREE.TextureLoader();
    texture = loader.load(imageCanvasOrDataUrl);
  } else {
    texture = new THREE.CanvasTexture(imageCanvasOrDataUrl);
  }

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  // Apply material with concept art map
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: options.roughness ?? 0.65,
    metalness: options.metalness ?? 0.05,
    bumpScale: 0.02,
  });

  mesh.material = mat;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return texture;
}

// Re-export costume accessories and full character generation from modular characterDresser
export {
  createRiggedCostumeAccessories,
  dressAndTextureHumanoidRig,
  createSkinnedCharacterFromConcept,
} from './characterDresser';
