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
  autoRigGltfScene,
  resolveAutoRigType,
  AutoRigType,
  RigLandmarks,
  POSE_PRESETS,
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
import { resolvePolyforkGlbUrl } from '../../data/externalCatalogsRegistry';

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
  rigType?: AutoRigType;
  rigLandmarks?: Partial<RigLandmarks>;
  showBones?: boolean;
  actionDescription?: string;
  onAsyncLoadComplete?: () => void;
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
  const targetHSL = { h: 0, s: 0, l: 0 };
  targetColor.getHSL(targetHSL);
  const subtleEmissive = targetColor.clone().multiplyScalar(0.06);

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
        if (cloned.color instanceof THREE.Color) {
          const origColor = cloned.color as THREE.Color;
          const origHSL = { h: 0, s: 0, l: 0 };
          origColor.getHSL(origHSL);
          const metalness = typeof cloned.metalness === 'number' ? cloned.metalness : 0;
          const roughness = typeof cloned.roughness === 'number' ? cloned.roughness : 0.5;
          const isGlassOrTrans = Boolean(cloned.transparent && cloned.opacity < 0.92) || roughness < 0.16;
          const hasStrongEmissive =
            cloned.emissive instanceof THREE.Color &&
            (cloned.emissive.r + cloned.emissive.g + cloned.emissive.b > 0.35);

          if (hasStrongEmissive || isGlassOrTrans) {
            // Preserve glass, glowing plasma, fire, and optical lenses with only a gentle 18% harmony tint
            origColor.lerp(targetColor, 0.18);
          } else if (origHSL.l < 0.16) {
            // Preserve dark tires, iron hardware, visors, and structural shadows
            origColor.lerp(targetColor, 0.2);
          } else if (origHSL.l > 0.82 || metalness > 0.78) {
            // Preserve bright highlights, chrome, steel blades, and snow/marble accents
            origColor.lerp(targetColor, 0.25);
          } else {
            // Shaded multi-tone tint: shift hue/saturation toward targetColor while preserving part lightness contrast
            const shadedTint = new THREE.Color().setHSL(
              targetHSL.h,
              Math.max(0.35, targetHSL.s * 0.85),
              THREE.MathUtils.clamp(origHSL.l * 0.75 + targetHSL.l * 0.25, 0.18, 0.78)
            );
            origColor.lerp(shadedTint, 0.62);
          }
        }
        if (
          cloned.emissive instanceof THREE.Color &&
          cloned.emissive.r + cloned.emissive.g + cloned.emissive.b < 0.2
        ) {
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

  const hasHumanoidSignals =
    kind === 'human' ||
    kind === 'character' ||
    activeSculpt?.rig === 'humanoid' ||
    activeSculpt?.parts?.some?.((p: any) => !!p.bone);

  const combinedIdentityText = `${name} ${tokenPrompt || ''}`;

  const hasExplicitHumanPerson =
    /\b(character|person|man|woman|boy|girl|human|actor|actress|hero|heroine|knight|warrior|archer|scout|detective|soldier|doctor|surgeon|chef|samurai|miner|ninja|blacksmith|captain|inventor|executive|operative|astronaut|biped|pilot|wizard|mage)\b/i.test(
      combinedIdentityText
    ) || /(شخصية|رجل|امرأة|إنسان|بطل|فارس|محارب|محقق|جندي|ساحر|نينجا|ساموراي|طيار|حداد|طاهي|جراح)/.test(combinedIdentityText);

  const isExplicitNonHumanKind =
    kind === 'prop' ||
    kind === 'vehicle' ||
    kind === 'car' ||
    kind === 'chair' ||
    kind === 'table' ||
    kind === 'tree' ||
    kind === 'spaceship' ||
    kind === 'building' ||
    kind === 'architecture' ||
    kind === 'creature' ||
    kind === 'quadruped' ||
    kind === 'nature' ||
    kind === 'furniture' ||
    kind === 'weapon' ||
    kind === 'scifi' ||
    kind === 'custom';

  const isPropSignal =
    isExplicitNonHumanKind ||
    (!hasExplicitHumanPerson &&
      (/\b(car|automobile|vehicle|helicopter|chopper|aircraft|airplane|jet|plane|ship|boat|yacht|submarine|train|locomotive|truck|bus|van|ambulance|motorcycle|bike|bicycle|scooter|tank|tractor|excavator|forklift|spaceship|starship|ufo|saucer|rover|mech|ring|jewelry|jewel|sword|broadsword|longsword|blade|katana|dagger|knife|axe|battleaxe|hammer|warhammer|spear|halberd|bow|crossbow|ballista|shield|gun|pistol|revolver|rifle|sniper|cannon|turret|raygun|flamethrower|shuriken|morningstar|scythe|bottle|potion|goblet|chalice|decanter|mug|cup|chair|armchair|throne|sofa|couch|bench|stool|table|desk|workbench|podium|easel|bed|cabinet|wardrobe|bookshelf|shelf|box|crate|chest|barrel|lamp|lantern|chandelier|candelabra|torch|clock|well|fountain|statue|altar|pillar|column|arch|gate|bridge|wall|fence|tower|castle|fortress|house|cottage|cabin|building|skyscraper|cathedral|church|temple|shrine|pagoda|pyramid|tent|windmill|lighthouse|ruins|tree|pine|oak|palm|willow|bamboo|cactus|bush|shrub|flower|mushroom|rock|boulder|cliff|mountain|volcano|crystal|cloud|fire|campfire|bonfire|tornado|camera|dolly|clapperboard|clapboard|megaphone|gramophone|tripod|lens|microphone|guitar|piano|drum|violin|book|scroll|globe|telescope|microscope|compass|hourglass|trophy|crown|anvil|cauldron|laptop|computer|monitor|tv|television|phone|smartphone|arcade|vending|generator|reactor|portal|stargate|satellite|beacon|console|hologram|pod|capsule|machine|drone|dog|hound|wolf|werewolf|fox|cat|lion|tiger|sabertooth|panther|leopard|horse|stallion|unicorn|pegasus|bear|deer|stag|moose|elephant|rhino|gorilla|monkey|minotaur|gargoyle|mummy|dragon|wyvern|drake|dinosaur|rex|raptor|eagle|hawk|falcon|owl|raven|crow|bird|swan|phoenix|griffin|shark|whale|dolphin|octopus|kraken|crab|lobster|fish|turtle|tortoise|frog|toad|snake|serpent|cobra|spider|scorpion|beetle|butterfly|bee|ant|worm)\b/i.test(
        combinedIdentityText
      ) ||
        /(خاتم|سيارة|مركبة|طائرة|هليكوبتر|مروحية|سفينة|قارب|قطار|شاحنة|دراجة|دبابة|صاروخ|كرسي|أريكة|كنبة|سرير|خزانة|طاولة|مكتب|مصباح|فانوس|ساعة|سيف|درع|رمح|فأس|قوس|بندقية|مسدس|مدفع|زجاجة|صندوق|برميل|منزل|بيت|مبنى|قلعة|برج|جسر|بوابة|عمود|معبد|خيمة|طاحونة|منارة|شجرة|نخلة|صبار|زهرة|صخرة|جبل|بركان|كريستال|سحابة|نار|كاميرا|كتاب|حاسوب|لابتوب|تلفاز|هاتف|بوابة|قمر صناعي|مفاعل|كلب|ذئب|قط|أسد|نمر|حصان|دب|غزال|فيل|تنين|ديناصور|نسر|صقر|بومة|غراب|طائر|قرش|حوت|دلفين|ثعبان|أفعى|عنكبوت|عقرب)/.test(combinedIdentityText)));

  const isMechaOrRobot =
    /\b(robot|mecha|mech\b|automaton|golem|droid|cyberbeast)\b/i.test(combinedIdentityText) ||
    /(روبوت|ميكا|رجل آلي)/.test(combinedIdentityText);

  const isExplicitHumanKind =
    (kind === 'human' || kind === 'character') &&
    !isMechaOrRobot &&
    !isPropSignal &&
    hasExplicitHumanPerson;
  const isHumanoid = (isExplicitHumanKind || (hasHumanoidSignals && !isPropSignal)) && !isMechaOrRobot;

  const isTestEnv =
    typeof process !== 'undefined' && Boolean(process.env?.VITEST || process.env?.NODE_ENV === 'test');

  const effectiveModelUrl =
    modelUrl ||
    (!isTestEnv && !isCutoutKind(kind) && !isGreyboxPrimitiveKind(kind) && !isHumanoid
      ? resolvePolyforkGlbUrl(name, tokenPrompt, kind)
      : undefined);

  // 1. If explicit or auto-resolved GLB/GLTF modelUrl is provided, load or clone from cache
  if (effectiveModelUrl) {
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

    const scaleAndAutoRigGltfForStage = (sceneRoot: THREE.Group): THREE.Vector3 => {
      sceneRoot.updateMatrixWorld(true);
      const resolvedRigType = resolveAutoRigType(sceneRoot, {
        rigType: opts.rigType,
        categoryHint: kind,
        nameHint: name,
        promptHint: tokenPrompt,
      });

      const rawBox = new THREE.Box3().setFromObject(sceneRoot);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const targetStageSpan =
        resolvedRigType === 'humanoid'
          ? 5.06
          : resolvedRigType === 'quadruped'
          ? 3.8
          : resolvedRigType === 'spine_flex'
          ? 4.2
          : 3.2;

      const currentRefDim =
        resolvedRigType === 'humanoid' || resolvedRigType === 'spine_flex'
          ? Math.max(0.1, rawSize.y)
          : Math.max(0.1, Math.max(rawSize.x, rawSize.y, rawSize.z));

      const scaleMult = targetStageSpan / currentRefDim;
      if (Math.abs(scaleMult - 1.0) > 0.02) {
        sceneRoot.children.forEach((child) => {
          child.scale.multiplyScalar(scaleMult);
          child.position.multiplyScalar(scaleMult);
        });
      }
      // Always recenter horizontally (X/Z) and snap lowest vertex (min.y) onto the floor plane (y = 0)
      sceneRoot.updateMatrixWorld(true);
      const reBox = new THREE.Box3().setFromObject(sceneRoot);
      if (!reBox.isEmpty()) {
        const reCenter = reBox.getCenter(new THREE.Vector3());
        sceneRoot.children.forEach((child) => {
          child.position.x -= reCenter.x;
          child.position.z -= reCenter.z;
          child.position.y -= reBox.min.y;
        });
        sceneRoot.updateMatrixWorld(true);
      }

      try {
        const autoRigRes = autoRigGltfScene(sceneRoot, {
          rigType: resolvedRigType,
          categoryHint: kind,
          nameHint: name,
          promptHint: tokenPrompt,
          landmarks: opts.rigLandmarks,
          showBones: opts.showBones,
        });

        group.userData.autoRigResult = autoRigRes;
        group.userData.autoRigType = autoRigRes.rigType;
        group.userData.isAutoRiggedGlb = Boolean(sceneRoot.userData?.isAutoRiggedGlb);
        if (autoRigRes.rig) {
          group.userData.rig = autoRigRes.rig;
          if (actorPose) {
            applyBonePose(autoRigRes.rig, actorPose);
          } else if (
            actorPosePreset &&
            POSE_PRESETS[actorPosePreset] &&
            (!sceneRoot.userData?.isAutoRiggedGlb || actorPosePreset !== 'neutral-stand')
          ) {
            applyPosePreset(autoRigRes.rig, actorPosePreset);
          } else if (autoRigRes.rigType === 'humanoid' && !sceneRoot.userData?.isAutoRiggedGlb) {
            applyPosePreset(autoRigRes.rig, 'neutral-stand');
          }
        }
      } catch (rigErr) {
        console.warn(`Auto-rigging fallback to static GLB for [${name}]:`, rigErr);
        group.userData.autoRigType = resolvedRigType;
      }

      // Disable CPU triangle raycasting on all imported high-poly GLTF child meshes
      // so StagePrevis3D uses the lightweight `__actor_hit_proxy__` cylinder in O(1) time.
      sceneRoot.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.raycast = () => {};
        }
      });

      const finalBox = new THREE.Box3().setFromObject(sceneRoot);
      if (!finalBox.isEmpty() && Math.abs(finalBox.min.y) > 0.005) {
        sceneRoot.position.y -= finalBox.min.y;
        sceneRoot.updateMatrixWorld(true);
      }
      const finalSize = finalBox.getSize(new THREE.Vector3());
      group.userData.modelSize = finalSize;
      return finalSize;
    };

    const cached = getCachedGltfModel(effectiveModelUrl);
    if (cached) {
      const finalSize = scaleAndAutoRigGltfForStage(cached.scene);
      group.add(cached.scene);
      attachGltfAnimations(cached.scene, cached.animations);
      const baseRadius = Math.max(2.4, Math.max(finalSize.x, finalSize.z) * 0.55);
      group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
      const banner = createSpriteBanner(
        name || kind.toUpperCase() || '3D MODEL',
        subtitleBadge ||
          (group.userData.autoRigType === 'humanoid'
            ? 'RIGGED 3D CHARACTER'
            : group.userData.autoRigType === 'quadruped'
            ? 'RIGGED 3D CREATURE'
            : 'GLB 3D MODEL'),
        isGhostWireframe,
        showLabels,
        colorHex
      );
      banner.position.y = Math.max(1.8, finalSize.y + 0.25);
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
    loadGltfModel(effectiveModelUrl)
      .then((result) => {
        const pl = group.getObjectByName('__gltf_placeholder__');
        if (pl) {
          group.remove(pl);
          disposeObject3D(pl);
        }
        if (typeof group.userData.customColorHex === 'number') {
          applyObjectTargetColor(result.scene, group.userData.customColorHex);
        }
        const finalSize = scaleAndAutoRigGltfForStage(result.scene);
        if (group.userData.actorId) {
          result.scene.traverse((child) => {
            child.userData.actorId = group.userData.actorId;
          });
        }
        group.add(result.scene);
        group.updateMatrixWorld(true);
        attachGltfAnimations(result.scene, result.animations);

        // Update hit proxy cylinder to match the loaded GLB dimensions
        const hitProxy = group.getObjectByName('__actor_hit_proxy__') as THREE.Mesh | undefined;
        if (hitProxy) {
          const hitRadius = Math.max(0.55, Math.min(2.2, Math.max(finalSize.x, finalSize.z) * 0.42));
          const hitHeight = Math.max(1.5, finalSize.y);
          hitProxy.geometry.dispose();
          hitProxy.geometry = new THREE.CylinderGeometry(hitRadius, hitRadius, hitHeight, 12);
          hitProxy.position.y = hitHeight * 0.5;
        }

        // Dynamically adjust banner position to match real model height
        group.children.forEach((child) => {
          if (child instanceof THREE.Sprite) {
            child.position.y = Math.max(1.8, finalSize.y + 0.25);
          }
        });
        opts.onAsyncLoadComplete?.();
      })
      .catch((err) => {
        console.error(`Failed to load GLTF 3D model [${effectiveModelUrl}]:`, err);
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
    group.userData.modelSize = size;
    const baseRadius = Math.max(2.4, Math.max(size.x, size.z) * 0.55);
    group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
    const banner = createSpriteBanner(
      name || kind.toUpperCase() || '3D MODEL',
      subtitleBadge || 'LOADING 3D MODEL...',
      isGhostWireframe,
      showLabels,
      colorHex
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
    group.userData.modelSize = size;
    const baseRadius = Math.max(1.8, Math.max(size.x, size.z) * 0.55);

    group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
    const banner = createSpriteBanner(
      name || kind.toUpperCase() || 'CUTOUT',
      subtitleBadge || (kind.toLowerCase() === 'backdrop' ? 'BACKDROP PLATE' : '2D STANDEE'),
      isGhostWireframe,
      showLabels,
      colorHex
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
    group.userData.modelSize = size;
    const baseRadius = Math.max(1.8, Math.max(size.x, size.z) * 0.55);

    group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
    const banner = createSpriteBanner(
      name || kind.toUpperCase() || 'GREYBOX',
      subtitleBadge || 'GREYBOX PRIMITIVE',
      isGhostWireframe,
      showLabels,
      colorHex
    );
    banner.position.y = Math.max(1.5, size.y + 0.25);
    group.add(banner);

    return group;
  }

  // 4. Check if actor is a humanoid subject (character with Mixamo bone rig)
  if (isHumanoid) {
    const clayTint = colorHex || '#f2eee6';
    const fullCharacterPrompt = `${name || ''} ${tokenPrompt || ''}`.trim() || 'Character';
    const features = extractCharacterFeaturesFromModelOutput(
      partGraph || {},
      fullCharacterPrompt,
      partGraph?.palette
    );
    // Keep 3D stage humanoid mannequins clean and anatomical by default; only mount primitive costume attachments when explicitly requested via partGraph.dressRig
    const shouldDressCharacter = Boolean(partGraph?.dressRig && (conceptImageUrl || hasRequestedCharacterAccessories(features)));

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
          loadedRig.root.updateMatrixWorld(true);
          const loadedBox = new THREE.Box3().setFromObject(loadedRig.root);
          if (!loadedBox.isEmpty() && loadedBox.min.y < -0.002) {
            loadedRig.root.position.y -= loadedBox.min.y;
            loadedRig.root.updateMatrixWorld(true);
          }

          // Dynamically adjust banner position above loaded rig head
          group.children.forEach((child) => {
            if (child instanceof THREE.Sprite) {
              child.position.y = Math.max(5.3, (loadedRig.height || 5.06) + 0.35);
            }
          });
          opts.onAsyncLoadComplete?.();
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
    rig.root.updateMatrixWorld(true);

    const bbox = new THREE.Box3().setFromObject(rig.root);
    if (!bbox.isEmpty() && bbox.min.y < -0.002) {
      rig.root.position.y -= bbox.min.y;
      rig.root.updateMatrixWorld(true);
    }
    const size = bbox.getSize(new THREE.Vector3());
    group.userData.modelSize = size;
    const baseRadius = Math.max(2.4, Math.max(size.x, size.z) * 0.55);

    group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
    const banner = createSpriteBanner(
      name || kind.toUpperCase() || 'SUBJECT',
      subtitleBadge || (actorPosePreset ? actorPosePreset.toUpperCase() : 'HUMANOID'),
      isGhostWireframe,
      showLabels,
      colorHex
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

  // Normalize stage envelope so microscopic props (< 2.2u) and colossal towers (> 8.5u tall) are always camera-readable on stage
  procMesh.updateMatrixWorld(true);
  const initialBox = new THREE.Box3().setFromObject(procMesh);
  if (!initialBox.isEmpty()) {
    const rawSize = initialBox.getSize(new THREE.Vector3());
    const maxSpan = Math.max(rawSize.x, rawSize.y, rawSize.z);
    if (Number.isFinite(maxSpan) && maxSpan > 0.01) {
      let stageFitFactor = 1.0;
      if (maxSpan < 2.2) {
        stageFitFactor = 2.4 / maxSpan;
      } else if (rawSize.y > 8.5 || maxSpan > 10.5) {
        stageFitFactor = Math.min(8.5 / Math.max(0.1, rawSize.y), 10.5 / maxSpan);
      }
      if (Math.abs(stageFitFactor - 1.0) > 0.04) {
        procMesh.scale.multiplyScalar(stageFitFactor);
        procMesh.updateMatrixWorld(true);
      }
    }
  }

  // Snap procedural mesh base to floor (y = 0) so objects never float in mid-air or sink below floor
  const rawProcBox = new THREE.Box3().setFromObject(procMesh);
  if (!rawProcBox.isEmpty() && Number.isFinite(rawProcBox.min.y) && Math.abs(rawProcBox.min.y) > 0.005) {
    procMesh.position.y -= rawProcBox.min.y;
    procMesh.updateMatrixWorld(true);
  }
  group.add(procMesh);

  // Dynamic bounding geometry for ground ring and hovering HUD billboard banner
  const bbox = new THREE.Box3().setFromObject(procMesh);
  const size = bbox.getSize(new THREE.Vector3());
  group.userData.modelSize = size;
  group.userData.archetypeId = procMesh.userData.archetypeId;
  const baseRadius = Math.max(2.4, Math.max(size.x, size.z) * 0.55);

  group.add(createBaseRing(baseRadius, colorHex, isGhostWireframe, isSelected));
  const banner = createSpriteBanner(
    name || kind.toUpperCase() || 'SUBJECT',
    subtitleBadge || kind.toUpperCase() || 'SUBJECT',
    isGhostWireframe,
    showLabels,
    colorHex
  );
  banner.position.y = Math.max(1.8, size.y + 0.25);
  group.add(banner);

  if (procMesh.userData.update) {
    group.userData.update = procMesh.userData.update;
  }

  return group;
}

export const SUBJECT_MESH_SCHEMA_VERSION = 'v3-207-blueprints';
