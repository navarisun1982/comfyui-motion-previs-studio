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

// Global in-memory parsed template cache keyed by URL (supports both y-bot-tpose.fbx and x-bot-tpose.fbx)
const cachedFbxTemplatesByUrl = new Map<string, THREE.Group>();
const pendingLoadPromisesByUrl = new Map<string, Promise<THREE.Group>>();

export const DEFAULT_MANNEQUIN_URL = '/models/y-bot-tpose.fbx';
export const FEMALE_MANNEQUIN_URL = '/models/x-bot-tpose.fbx';
const DEFAULT_HEIGHT = 5.06;
const DEFAULT_CLAY_TINT = '#f2eee6';

export function resolveMannequinUrlForIdentity(nameOrToken?: string): string {
  const text = String(nameOrToken ?? '').toLowerCase();
  if (
    /\b(woman|female|girl|lady|heroine|actress|mother|mom|sister|queen|princess|bride|witch|sorceress|valkyrie|kunoichi|ballerina|dancer|slender\s+silhouette)\b/.test(
      text
    ) ||
    /(امرأة|امراة|بنت|فتاة|سيدة|بطلة|ملكة|أميرة|اميرة|ممثلة|أخت|اخت|راقصة)/.test(text)
  ) {
    return FEMALE_MANNEQUIN_URL;
  }
  return DEFAULT_MANNEQUIN_URL;
}

export function normalizeBoneName(name: string): string {
  return String(name ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

export function stripMixamoPrefix(name: string): string {
  return String(name ?? '').replace(/^mixamorig:?/i, '').trim();
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
export async function loadFbxTemplate(rawUrl: string = DEFAULT_MANNEQUIN_URL): Promise<THREE.Group> {
  const url = rawUrl.startsWith('./models/') ? rawUrl.slice(1) : rawUrl;
  const existing = cachedFbxTemplatesByUrl.get(url) || cachedFbxTemplatesByUrl.get(rawUrl);
  if (existing) {
    return existing;
  }
  const pending = pendingLoadPromisesByUrl.get(url);
  if (pending) {
    return pending;
  }

  const loadPromise = (async () => {
    try {
      let arrayBuffer: ArrayBuffer;

      const isNodeTestEnv =
        typeof window === 'undefined' ||
        (typeof process !== 'undefined' &&
          Boolean((process as any).versions?.node) &&
          typeof (window as any)?.electronAPI === 'undefined');

      if (isNodeTestEnv && url.startsWith('/')) {
        // Node.js or Vitest JSDOM test environment (where relative fetch('/models/...') fails in undici)
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
      cachedFbxTemplatesByUrl.set(url, fbx);
      cachedFbxTemplatesByUrl.set(`.${url}`, fbx);
      return fbx;
    } finally {
      pendingLoadPromisesByUrl.delete(url);
    }
  })();

  pendingLoadPromisesByUrl.set(url, loadPromise);
  return loadPromise;
}

/**
 * Preloads both the male Y-Bot and female X-Bot mannequins in background.
 */
export async function preloadMannequinModel(url: string = DEFAULT_MANNEQUIN_URL): Promise<void> {
  try {
    await Promise.all([
      loadFbxTemplate(url),
      url === DEFAULT_MANNEQUIN_URL ? loadFbxTemplate(FEMALE_MANNEQUIN_URL).catch(() => null) : Promise.resolve(null),
    ]);
  } catch (err) {
    console.warn(`[MannequinLoader] Could not preload mannequin from ${url}:`, err);
  }
}

/**
 * Instantiates a cloned, rigged, Mixamo-styled HumanoidRig from a parsed FBX template.
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

  // 3. Apply authentic Mixamo 2-tone studio material:
  //    - Outer armor surface (`_Surface`): crisp satin studio finish
  //    - Inner mechanical joints (`_Joints`): deep gunmetal charcoal (preserved across target color tints!)
  const bodyColor = new THREE.Color(tint).multiplyScalar(0.92);
  const jointColor = new THREE.Color('#1c222e');

  clone.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      // Clone geometry per actor instance so SMPL SkinnedMesh vertex morphing never mutates the shared cached template
      if (mesh.geometry) {
        mesh.geometry = mesh.geometry.clone();
        const posAttr = mesh.geometry.attributes?.position;
        if (posAttr && posAttr.array) {
          const baseArr = new Float32Array(posAttr.array as ArrayLike<number>);
          let minY = Infinity;
          let maxY = -Infinity;
          for (let i = 1; i < baseArr.length; i += 3) {
            const vy = baseArr[i];
            if (vy < minY) minY = vy;
            if (vy > maxY) maxY = vy;
          }
          mesh.geometry.userData._basePositions = baseArr;
          mesh.geometry.userData._bindMinY = Number.isFinite(minY) ? minY : 0;
          mesh.geometry.userData._bindHeight =
            Number.isFinite(maxY - minY) && maxY - minY > 1 ? maxY - minY : 180.47;
        }
      }
      const isJointShell = /_Joints$/i.test(mesh.name);
      if (isJointShell) {
        mesh.userData.preserveAccessoryColor = true;
      }

      mesh.material = new THREE.MeshStandardMaterial({
        color: isJointShell ? jointColor : bodyColor,
        roughness: isJointShell ? 0.38 : 0.34,
        metalness: isJointShell ? 0.42 : 0.08,
        envMapIntensity: isJointShell ? 0.65 : 0.55,
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  });

  // 4. Map bones to canonical 19-bone hierarchy AND full 67-bone Mixamo map
  const bonesMap = new Map<HumanoidBone, THREE.Bone>();
  const restPositions = new Map<HumanoidBone, THREE.Vector3>();
  const restRotations = new Map<HumanoidBone, THREE.Quaternion>();
  const mixamoBones = new Map<string, THREE.Bone>();
  const mixamoRestRotations = new Map<string, THREE.Quaternion>();
  const mixamoCharSpaceRestRotations = new Map<string, THREE.Quaternion>();

  clone.updateMatrixWorld(true);
  const invRootWorldQuat = new THREE.Quaternion();
  clone.getWorldQuaternion(invRootWorldQuat).invert();

  // Index all bones in clone (first pre-order occurrence is the hierarchy parent bone in FBXLoader)
  const indexedBones: { bone: THREE.Bone; normName: string; shortName: string }[] = [];
  clone.traverse((child) => {
    if ((child as THREE.Bone).isBone) {
      const bone = child as THREE.Bone;
      const shortName = stripMixamoPrefix(bone.name);
      indexedBones.push({
        bone,
        normName: normalizeBoneName(bone.name),
        shortName,
      });
      if (shortName && !mixamoBones.has(shortName)) {
        mixamoBones.set(shortName, bone);
        mixamoRestRotations.set(shortName, bone.quaternion.clone());
        const boneWorldQuat = new THREE.Quaternion();
        bone.getWorldQuaternion(boneWorldQuat);
        mixamoCharSpaceRestRotations.set(
          shortName,
          invRootWorldQuat.clone().multiply(boneWorldQuat)
        );
      }
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
    mixamoBones,
    mixamoRestRotations,
    mixamoCharSpaceRestRotations,
    height: targetHeight,
    isMannequinRig: true,
  };
}

/**
 * Returns a cloned HumanoidRig synchronously if template is already cached.
 */
export function getCachedMannequinRig(options: MannequinOptions = {}): HumanoidRig | null {
  const targetUrl = options.modelUrl || DEFAULT_MANNEQUIN_URL;
  const tpl = cachedFbxTemplatesByUrl.get(targetUrl) || cachedFbxTemplatesByUrl.get(DEFAULT_MANNEQUIN_URL);
  if (!tpl) return null;
  return instantiateMannequinRig(tpl, options);
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
export function isMannequinReady(url: string = DEFAULT_MANNEQUIN_URL): boolean {
  return cachedFbxTemplatesByUrl.has(url) || cachedFbxTemplatesByUrl.size > 0;
}
