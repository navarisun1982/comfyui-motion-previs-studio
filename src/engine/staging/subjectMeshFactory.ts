import * as THREE from 'three';
import { SubjectKind } from '../../types/shotspec';
import { createProceduralActorMesh } from '../procedural3D';
import { loadGltfModel, getCachedGltfModel } from '../gltfModelLoader';
import {
  createHumanoidSkeleton,
  createStylizedHumanoidStandin,
  loadMannequinModel,
  getCachedMannequinRig,
  applyPosePreset,
  applyBonePose,
  dressAndTextureHumanoidRig,
} from '../kinematics';
import {
  extractCharacterFeaturesFromModelOutput,
  hasRequestedCharacterAccessories,
} from '../procedural3D/characterClayCompiler';
import {
  createBaseRing,
  createSpriteBanner,
  disposeObject3D,
} from '../../components/stage/stageGizmoHelpers';
import { isCutoutKind, createCutoutMesh } from './cutoutMeshFactory';
import { isGreyboxPrimitiveKind, createGreyboxPrimitiveMesh } from './greyboxPrimitives';

export interface CreateSubjectMeshOptions {
  name: string;
  kind?: SubjectKind;
  colorHex?: number;
  isGhostWireframe?: boolean;
  subtitleBadge?: string;
  isSelected?: boolean;
  conceptImageUrl?: string;
  tokenPrompt?: string;
  modelUrl?: string;
  partGraph?: any;
  sculpt?: any;
  actorPosePreset?: string;
  actorPose?: any;
  showLabels?: boolean;
}

/**
 * Universal Semantic Procedural 3D Subject/Prop Mesh Factory
 * Integrates GLB caching, skinned humanoid mannequin rigs with organic deformation,
 * and procedural 3D primitives from the 3dviz-pro-max engine.
 */
/**
 * Tints all 3D mesh surfaces of a subject/prop group with its assigned Target Color
 * while preserving PBR shading/normals so 3D form remains readable on stage and in viewfinder.
 */
export function applyObjectTargetColor(object3d: THREE.Object3D, colorHex: number): void {
  const targetColor = new THREE.Color(colorHex);
  const subtleEmissive = targetColor.clone().multiplyScalar(0.1);
  object3d.traverse((child) => {
    if (
      child.userData?.isBaseRing ||
      child.userData?.preserveAccessoryColor ||
      child.name === '__actor_hit_proxy__' ||
      child instanceof THREE.Sprite
    ) {
      return;
    }
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const tintMaterial = (mat: THREE.Material): THREE.Material => {
        if (!mat || (mat as any).wireframe) return mat;
        const cloned = mat.clone() as any;
        if (cloned.color) {
          cloned.color.copy(targetColor);
        }
        if (cloned.emissive) {
          cloned.emissive.copy(subtleEmissive);
        }
        return cloned;
      };
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map(tintMaterial);
      } else if (mesh.material) {
        mesh.material = tintMaterial(mesh.material);
      }
    }
  });
}

export function createSubjectMesh(
  nameOrOptions: string | CreateSubjectMeshOptions,
  pKind: SubjectKind = 'human',
  pColorHex: number = 0xd4af37,
  pIsGhostWireframe: boolean = false,
  pSubtitleBadge?: string,
  pIsSelected: boolean = false,
  pConceptImageUrl?: string,
  pTokenPrompt?: string,
  pModelUrl?: string,
  pPartGraph?: any,
  pActorPosePreset?: string,
  pActorPose?: any,
  pShowLabels: boolean = true
): THREE.Group {
  const opts: CreateSubjectMeshOptions =
    typeof nameOrOptions === 'object'
      ? nameOrOptions
      : {
          name: nameOrOptions,
          kind: pKind,
          colorHex: pColorHex,
          isGhostWireframe: pIsGhostWireframe,
          subtitleBadge: pSubtitleBadge,
          isSelected: pIsSelected,
          conceptImageUrl: pConceptImageUrl,
          tokenPrompt: pTokenPrompt,
          modelUrl: pModelUrl,
          partGraph: pPartGraph,
          sculpt: pPartGraph,
          actorPosePreset: pActorPosePreset,
          actorPose: pActorPose,
          showLabels: pShowLabels,
        };

  const {
    name,
    kind = 'human',
    colorHex = 0xd4af37,
    isGhostWireframe = false,
    subtitleBadge,
    isSelected = false,
    conceptImageUrl,
    tokenPrompt,
    modelUrl,
    partGraph,
    sculpt,
    actorPosePreset,
    actorPose,
    showLabels = true,
  } = opts;

  const activeSculpt = sculpt || partGraph;

  const group = new THREE.Group();
  group.name = name;
  group.userData.subjectName = name;
  group.userData.subjectKind = kind;

  // 1. If explicit GLB/GLTF modelUrl is provided, load or clone from cache
  if (modelUrl) {
    const attachGltfAnimations = (sceneRoot: THREE.Group, clips?: THREE.AnimationClip[]) => {
      if (!clips || clips.length === 0) return;
      const mixer = new THREE.AnimationMixer(sceneRoot);
      const action = mixer.clipAction(clips[0]);
      action.play();
      group.userData.animationMixer = mixer;
      group.userData.animationClips = clips;
      group.userData.setAnimationTime = (timeSec: number, cycles: number = 1) => {
        mixer.setTime(Math.max(0, timeSec * Math.max(0.1, cycles)));
      };
    };

    const cached = getCachedGltfModel(modelUrl);
    if (cached) {
      group.add(cached.scene);
      attachGltfAnimations(cached.scene, cached.animations);
      const size = cached.size;
      const baseRadius = Math.max(2.4, Math.max(size.x, size.z) * 0.55);
      group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
      const banner = createSpriteBanner(
        name || kind.toUpperCase() || '3D MODEL',
        subtitleBadge || 'GLB 3D MODEL',
        isGhostWireframe,
        showLabels
      );
      banner.position.y = Math.max(1.8, size.y + 0.25);
      group.add(banner);
      return group;
    }

    // Placeholder while loading
    const procMesh = createProceduralActorMesh({
      category: kind || 'custom',
      name,
      tokenPrompt,
      colorHex,
      isSelected,
      isGhostWireframe,
      sculpt: activeSculpt,
      partGraph: activeSculpt,
    });
    procMesh.name = '__gltf_placeholder__';
    group.add(procMesh);

    // Async load GLTF via universal parser
    loadGltfModel(modelUrl)
      .then((result) => {
        const pl = group.getObjectByName('__gltf_placeholder__');
        if (pl) {
          group.remove(pl);
          disposeObject3D(pl);
        }
        if (typeof group.userData.customColorHex === 'number') {
          applyObjectTargetColor(result.scene, group.userData.customColorHex);
        }
        group.add(result.scene);
        attachGltfAnimations(result.scene, result.animations);

        // Dynamically adjust banner position to match real model height
        group.children.forEach((child) => {
          if (child instanceof THREE.Sprite) {
            child.position.y = Math.max(1.8, result.size.y + 0.25);
          }
        });
      })
      .catch((err) => {
        console.error(`Failed to load GLTF 3D model [${modelUrl}]:`, err);
        const errBanner = createSpriteBanner(
          name || '3D MODEL',
          'GLB LOAD ERROR',
          false,
          showLabels
        );
        errBanner.position.y = 1.9;
        group.add(errBanner);
      });

    // Base ring & banner for loading state
    const bbox = new THREE.Box3().setFromObject(procMesh);
    const size = bbox.getSize(new THREE.Vector3());
    const baseRadius = Math.max(2.4, Math.max(size.x, size.z) * 0.55);
    group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
    const banner = createSpriteBanner(
      name || kind.toUpperCase() || '3D MODEL',
      subtitleBadge || 'LOADING 3D MODEL...',
      isGhostWireframe,
      showLabels
    );
    banner.position.y = Math.max(1.8, size.y + 0.25);
    group.add(banner);
    return group;
  }

  // 2. Cutouts & Standees (2D image cards standing on stage or backdrops)
  if (isCutoutKind(kind)) {
    const cutoutGroup = createCutoutMesh({
      imageUrl: conceptImageUrl,
      name,
      kind,
      colorHex,
      isSelected,
      isGhostWireframe,
    });
    group.add(cutoutGroup);

    const bbox = new THREE.Box3().setFromObject(cutoutGroup);
    const size = bbox.getSize(new THREE.Vector3());
    const baseRadius = Math.max(1.8, Math.max(size.x, size.z) * 0.55);

    group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
    const banner = createSpriteBanner(
      name || kind.toUpperCase() || 'CUTOUT',
      subtitleBadge || (kind.toLowerCase() === 'backdrop' ? 'BACKDROP PLATE' : '2D STANDEE'),
      isGhostWireframe,
      showLabels
    );
    banner.position.y = Math.max(1.8, size.y + 0.25);
    group.add(banner);

    return group;
  }

  // 3. Greybox Set Primitives (Cube, Sphere, Capsule, Cylinder, Cone, Plane)
  if (isGreyboxPrimitiveKind(kind)) {
    const primitiveMesh = createGreyboxPrimitiveMesh(kind, {
      colorHex,
      isSelected,
    });
    group.add(primitiveMesh);

    const bbox = new THREE.Box3().setFromObject(primitiveMesh);
    const size = bbox.getSize(new THREE.Vector3());
    const baseRadius = Math.max(1.8, Math.max(size.x, size.z) * 0.55);

    group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
    const banner = createSpriteBanner(
      name || kind.toUpperCase() || 'GREYBOX',
      subtitleBadge || 'GREYBOX PRIMITIVE',
      isGhostWireframe,
      showLabels
    );
    banner.position.y = Math.max(1.5, size.y + 0.25);
    group.add(banner);

    return group;
  }

  // 4. Check if actor is a humanoid subject (character with Mixamo bone rig)
  const hasHumanoidSignals =
    kind === 'human' ||
    kind === 'character' ||
    activeSculpt?.rig === 'humanoid' ||
    activeSculpt?.parts?.some?.((p: any) => !!p.bone);

  const hasExplicitHumanPerson =
    /\b(character|person|man|woman|boy|girl|human|actor|actress|hero|heroine|knight|warrior|archer|scout|detective|soldier|doctor|pilot|wizard|mage)\b/i.test(
      `${name} ${tokenPrompt || ''}`
    ) || /(شخصية|رجل|امرأة|إنسان|بطل|فارس|محارب)/.test(`${name} ${tokenPrompt || ''}`);

  const isPropSignal =
    kind === 'prop' ||
    kind === 'vehicle' ||
    kind === 'building' ||
    kind === 'custom' ||
    (!hasExplicitHumanPerson &&
      (/\b(car|automobile|vehicle|ring|jewelry|jewel|sword|blade|bottle|chair|table|desk|box|lamp|clock|well|camera|lens|machine|drone)\b/i.test(
        `${name} ${tokenPrompt || ''}`
      ) ||
        /(خاتم|سيارة|كرسي|سيف|زجاجة|طاولة|مكتب|مصباح|ساعة)/.test(`${name} ${tokenPrompt || ''}`)));

  const isExplicitHumanKind = kind === 'human' || kind === 'character';
  const isHumanoid = isExplicitHumanKind || (hasHumanoidSignals && !isPropSignal);

  if (isHumanoid) {
    const clayTint = colorHex || '#f2eee6';
    const hasConcept = Boolean(conceptImageUrl);
    const fullCharacterPrompt = `${name || ''} ${tokenPrompt || ''}`.trim() || 'Character';
    const features = extractCharacterFeaturesFromModelOutput(
      partGraph || {},
      fullCharacterPrompt,
      partGraph?.palette
    );
    const shouldDressCharacter = hasConcept || hasRequestedCharacterAccessories(features);

    const cachedRig = getCachedMannequinRig({ height: 5.06, tint: clayTint });
    const rig = cachedRig || createHumanoidSkeleton(5.06);

    if (cachedRig) {
      if (shouldDressCharacter) {
        try {
          dressAndTextureHumanoidRig(rig, features, conceptImageUrl);
        } catch (err) {
          console.warn('[SubjectMeshFactory] Failed to dress cached humanoid rig:', err);
        }
      }
    } else {
      // Instant fallback standin while the single-mesh humanoid mannequin loads
      createStylizedHumanoidStandin(rig, colorHex);
      if (shouldDressCharacter) {
        try {
          dressAndTextureHumanoidRig(rig, features, conceptImageUrl);
        } catch (err) {
          console.warn('[SubjectMeshFactory] Failed to dress fallback humanoid rig:', err);
        }
      }

      loadMannequinModel({ height: 5.06, tint: clayTint })
        .then((loadedRig) => {
          if (shouldDressCharacter) {
            try {
              dressAndTextureHumanoidRig(loadedRig, features, conceptImageUrl);
            } catch (err) {
              console.warn('[SubjectMeshFactory] Failed to dress loaded humanoid rig:', err);
            }
          }
          if (typeof group.userData.customColorHex === 'number') {
            applyObjectTargetColor(loadedRig.root, group.userData.customColorHex);
          }

          if (group.userData.rig?.root) {
            group.remove(group.userData.rig.root);
            disposeObject3D(group.userData.rig.root);
          }
          group.add(loadedRig.root);
          group.userData.rig = loadedRig;
          group.updateMatrixWorld(true);

          if (actorPose) {
            applyBonePose(loadedRig, actorPose);
          } else if (actorPosePreset) {
            applyPosePreset(loadedRig, actorPosePreset);
          } else {
            applyPosePreset(loadedRig, 'neutral-stand');
          }

          // Dynamically adjust banner position above loaded rig head
          group.children.forEach((child) => {
            if (child instanceof THREE.Sprite) {
              child.position.y = Math.max(5.3, (loadedRig.height || 5.06) + 0.35);
            }
          });
        })
        .catch((err) => {
          console.warn('[SubjectMeshFactory] Procedural mannequin load fallback:', err);
        });
    }

    group.add(rig.root);
    group.userData.rig = rig;
    group.updateMatrixWorld(true);

    if (actorPose) {
      applyBonePose(rig, actorPose);
    } else if (actorPosePreset) {
      applyPosePreset(rig, actorPosePreset);
    } else {
      applyPosePreset(rig, 'neutral-stand');
    }

    const bbox = new THREE.Box3().setFromObject(rig.root);
    const size = bbox.getSize(new THREE.Vector3());
    const baseRadius = Math.max(2.4, Math.max(size.x, size.z) * 0.55);

    group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
    const banner = createSpriteBanner(
      name || kind.toUpperCase() || 'SUBJECT',
      subtitleBadge || (actorPosePreset ? actorPosePreset.toUpperCase() : 'HUMANOID'),
      isGhostWireframe,
      showLabels
    );
    banner.position.y = Math.max(5.3, size.y + 0.25);
    group.add(banner);

    return group;
  }

  // 3. High-Fidelity Procedural 3D Model from 3dviz-pro-max Engine (for non-humanoid objects/props)
  const procMesh = createProceduralActorMesh({
    category: kind || 'custom',
    name,
    tokenPrompt,
    colorHex,
    isSelected,
    isGhostWireframe,
    sculpt: activeSculpt,
    partGraph: activeSculpt,
  });
  // Snap procedural mesh base to floor (y = 0) so objects never float in mid-air or sink below floor
  procMesh.updateMatrixWorld(true);
  const rawProcBox = new THREE.Box3().setFromObject(procMesh);
  if (!rawProcBox.isEmpty() && Number.isFinite(rawProcBox.min.y) && Math.abs(rawProcBox.min.y) > 0.005) {
    procMesh.position.y -= rawProcBox.min.y;
    procMesh.updateMatrixWorld(true);
  }
  group.add(procMesh);

  // Dynamic bounding geometry for ground ring and hovering HUD billboard banner
  const bbox = new THREE.Box3().setFromObject(procMesh);
  const size = bbox.getSize(new THREE.Vector3());
  const baseRadius = Math.max(2.4, Math.max(size.x, size.z) * 0.55);

  group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
  const banner = createSpriteBanner(
    name || kind.toUpperCase() || 'SUBJECT',
    subtitleBadge || kind.toUpperCase() || 'SUBJECT',
    isGhostWireframe,
    showLabels
  );
  banner.position.y = Math.max(1.8, size.y + 0.25);
  group.add(banner);

  if (procMesh.userData.update) {
    group.userData.update = procMesh.userData.update;
  }

  return group;
}
