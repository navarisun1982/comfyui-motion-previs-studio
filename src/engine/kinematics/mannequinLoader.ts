/**
 * Skinned Humanoid Mannequin Loader & Rigging Engine
 * Grounded in open-source character architectures and industry Mixamo conventions.
 * 
 * Provides:
 * 1. Seamless, single-mesh clay skinned mannequin (Mixamo Y-Bot / X-Bot)
 * 2. Instantaneous clone instantiation via Three.js SkeletonUtils.clone
 * 3. Maquette clay PBR material (#f2eee6 / #d4cfc7 with darker anatomical joint shells)
 * 4. Stature normalization to soundstage units (~5.06 units baseline)
 * 5. Full 19-bone humanoid mapping and rest pose registration
 * 6. Cross-platform loading (Browser fetch + Node.js filesystem for tests)
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HumanoidRig } from './skeletonHierarchy';
import { HumanoidBone, HUMANOID_BONES } from '../procedural3D/sculptSpec';

export interface MannequinOptions {
  modelUrl?: string;
  height?: number;
  tint?: string | number;
}

/**
 * Normalized bone name lookup table mapping canonical HumanoidBone
 * to candidate Mixamo FBX joint names.
 */
const BONE_TO_MIXAMO_CANDIDATES: Record<HumanoidBone, string[]> = {
  Hips: ['mixamorighips', 'hips', 'pelvis'],
  Spine: ['mixamorigspine', 'spine'],
  Chest: ['mixamorigspine1', 'mixamorigspine2', 'chest'],
  Neck: ['mixamorigneck', 'neck'],
  Head: ['mixamorighead', 'head'],
  LeftShoulder: ['mixamorigleftshoulder', 'leftshoulder', 'lshoulder'],
  LeftArm: ['mixamorigleftarm', 'leftarm', 'larm', 'leftupperarm'],
  LeftForeArm: ['mixamorigleftforearm', 'leftforearm', 'lforearm', 'leftelbow'],
  LeftHand: ['mixamoriglefthand', 'lefthand', 'lhand', 'leftwrist'],
  RightShoulder: ['mixamorigrightshoulder', 'rightshoulder', 'rshoulder'],
  RightArm: ['mixamorigrightarm', 'rightarm', 'rarm', 'rightupperarm'],
  RightForeArm: ['mixamorigrightforearm', 'rightforearm', 'rforearm', 'rightelbow'],
  RightHand: ['mixamorigrighthand', 'righthand', 'rhand', 'rightwrist'],
  LeftUpLeg: ['mixamorigleftupleg', 'leftupleg', 'lupleg', 'leftthigh', 'lefthip'],
  LeftLeg: ['mixamorigleftleg', 'leftleg', 'lleg', 'leftshin', 'leftknee'],
  LeftFoot: ['mixamorigleftfoot', 'leftfoot', 'lfoot', 'leftankle'],
  RightUpLeg: ['mixamorigrightupleg', 'rightupleg', 'rupleg', 'rightthigh', 'righthip'],
  RightLeg: ['mixamorigrightleg', 'rightleg', 'rleg', 'rightshin', 'rightknee'],
  RightFoot: ['mixamorigrightfoot', 'rightfoot', 'rfoot', 'rightankle'],
};

// Global in-memory parsed template cache
let cachedFbxTemplate: THREE.Group | null = null;
let pendingLoadPromise: Promise<THREE.Group> | null = null;

const DEFAULT_MANNEQUIN_URL = '/models/y-bot-tpose.fbx';
const DEFAULT_HEIGHT = 5.06;
const DEFAULT_CLAY_TINT = '#f2eee6';

export function normalizeBoneName(name: string): string {
  return String(name ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Parses raw ArrayBuffer into an FBX Group.
 */
export function parseFbxBuffer(buffer: ArrayBuffer): THREE.Group {
  const loader = new FBXLoader();
  return loader.parse(buffer, '');
}

/**
 * Asynchronously loads and parses the FBX template.
 * In browser: uses window.fetch()
 * In Node/Vitest: reads directly from filesystem
 */
export async function loadFbxTemplate(url: string = DEFAULT_MANNEQUIN_URL): Promise<THREE.Group> {
  if (cachedFbxTemplate) {
    return cachedFbxTemplate;
  }
  if (pendingLoadPromise) {
    return pendingLoadPromise;
  }

  pendingLoadPromise = (async () => {
    try {
      let arrayBuffer: ArrayBuffer;

      if (typeof window === 'undefined') {
        // Node.js test environment
        const fsMod = 'fs';
        const pathMod = 'path';
        const fs = await import(/* @vite-ignore */ fsMod);
        const path = await import(/* @vite-ignore */ pathMod);
        const resolvedPath = path.resolve(process.cwd(), 'public' + url);
        const buf = fs.readFileSync(resolvedPath);
        arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      } else {
        // Browser / Electron environment
        const targetUrl =
          typeof window !== 'undefined' && window.location.protocol.startsWith('file:') && url.startsWith('/')
            ? '.' + url
            : url;
        const response = await fetch(targetUrl);
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status} loading mannequin FBX from ${targetUrl}`);
        }
        arrayBuffer = await response.arrayBuffer();
      }

      const fbx = parseFbxBuffer(arrayBuffer);
      cachedFbxTemplate = fbx;
      return fbx;
    } finally {
      pendingLoadPromise = null;
    }
  })();

  return pendingLoadPromise;
}

/**
 * Preloads the default Y-Bot mannequin in background.
 */
export async function preloadMannequinModel(url: string = DEFAULT_MANNEQUIN_URL): Promise<void> {
  try {
    await loadFbxTemplate(url);
  } catch (err) {
    console.warn(`[MannequinLoader] Could not preload mannequin from ${url}:`, err);
  }
}

/**
 * Instantiates a cloned, rigged, clay-styled HumanoidRig from a parsed FBX template.
 */
export function instantiateMannequinRig(
  template: THREE.Group,
  options: MannequinOptions = {}
): HumanoidRig {
  const targetHeight = options.height ?? DEFAULT_HEIGHT;
  const tint = options.tint ?? DEFAULT_CLAY_TINT;

  // 1. Deep clone skeleton and skinned meshes
  const clone = skeletonClone(template) as THREE.Group;
  clone.name = 'ProceduralMannequinRoot';

  // 2. Measure untransformed model height and scale to target stage height
  clone.updateMatrixWorld(true);
  const rawBbox = new THREE.Box3().setFromObject(clone);
  const rawSize = rawBbox.getSize(new THREE.Vector3());
  const rawHeight = rawSize.y > 0 ? rawSize.y : 180.47;
  const scaleFactor = targetHeight / rawHeight;

  clone.scale.setScalar(scaleFactor);
  clone.position.y -= rawBbox.min.y * scaleFactor;
  clone.updateMatrixWorld(true);

  // 3. Apply warm maquette clay material
  const bodyColor = new THREE.Color(tint).multiplyScalar(0.9);
  const jointColor = bodyColor.clone().multiplyScalar(0.62);

  clone.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const isJointShell = /_Joints$/i.test(mesh.name);

      mesh.material = new THREE.MeshStandardMaterial({
        color: isJointShell ? jointColor : bodyColor,
        roughness: 0.66,
        metalness: 0.0,
        envMapIntensity: 0.35,
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  });

  // 4. Map bones to canonical 19-bone hierarchy
  const bonesMap = new Map<HumanoidBone, THREE.Bone>();
  const restPositions = new Map<HumanoidBone, THREE.Vector3>();
  const restRotations = new Map<HumanoidBone, THREE.Quaternion>();

  // Index all bones in clone
  const indexedBones: { bone: THREE.Bone; normName: string }[] = [];
  clone.traverse((child) => {
    if ((child as THREE.Bone).isBone) {
      indexedBones.push({
        bone: child as THREE.Bone,
        normName: normalizeBoneName(child.name),
      });
    }
  });

  for (const boneName of HUMANOID_BONES) {
    const candidates = BONE_TO_MIXAMO_CANDIDATES[boneName] || [boneName.toLowerCase()];
    let matchedBone: THREE.Bone | null = null;

    for (const cand of candidates) {
      const normCand = normalizeBoneName(cand);
      const match = indexedBones.find(
        (b) => b.normName === normCand || b.normName.endsWith(normCand) || normCand.endsWith(b.normName)
      );
      if (match) {
        matchedBone = match.bone;
        break;
      }
    }

    if (matchedBone) {
      bonesMap.set(boneName, matchedBone);
      restPositions.set(boneName, matchedBone.position.clone());
      restRotations.set(boneName, matchedBone.quaternion.clone());
    }
  }

  // 5. Locate skinned mesh skeleton
  let skeleton: THREE.Skeleton | null = null;
  clone.traverse((child) => {
    if (!skeleton && (child as THREE.SkinnedMesh).isSkinnedMesh) {
      skeleton = (child as THREE.SkinnedMesh).skeleton;
    }
  });

  if (!skeleton) {
    skeleton = new THREE.Skeleton(Array.from(bonesMap.values()));
  }

  clone.userData.isMannequinRig = true;

  return {
    root: clone,
    skeleton,
    bones: bonesMap,
    restPositions,
    restRotations,
    height: targetHeight,
  };
}

/**
 * Returns a cloned HumanoidRig synchronously if template is already cached.
 */
export function getCachedMannequinRig(options: MannequinOptions = {}): HumanoidRig | null {
  if (!cachedFbxTemplate) return null;
  return instantiateMannequinRig(cachedFbxTemplate, options);
}

/**
 * Asynchronously loads and returns a fully configured HumanoidRig.
 */
export async function loadMannequinModel(options: MannequinOptions = {}): Promise<HumanoidRig> {
  const template = await loadFbxTemplate(options.modelUrl ?? DEFAULT_MANNEQUIN_URL);
  return instantiateMannequinRig(template, options);
}

/**
 * Returns true if the mannequin FBX is cached and ready for instant synchronous cloning.
 */
export function isMannequinReady(): boolean {
  return cachedFbxTemplate !== null;
}
