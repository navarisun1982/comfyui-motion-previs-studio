/**
 * Character Dresser & Rigged Costume Accessories
 *
 * Provides tactile studio PBR clay maquette materials and authentic 3D costume/hair/equipment
 * accessories parented to humanoid skeleton bones for natural organic deformation.
 */

import * as THREE from 'three';
import { HumanoidRig } from './skeletonHierarchy';
import { HumanoidBone } from '../procedural3D/sculptSpec';
import {
  CharacterVisualFeatures,
  createDefaultCharacterFeatures,
  extractCharacterFeaturesFromModelOutput,
} from '../procedural3D/characterClayCompiler';
import { extractMaskFromImageUrl } from '../procedural3D/silhouette';
import { loadMannequinModel } from './mannequinLoader';
import { createSuperellipsoidGeometry } from '../procedural3D/sculptSpec';
import { createTactileClayMaterial } from '../procedural3D/clayMaterial';


/**
 * Creates 3D costume layers, sculpted hair, facial definition, and equipment meshes
 * scaled to the humanoid rig, and groups them by their target skeleton attachment bone.
 * Gives full priority to the external 3D shape, hair volume, facial profile, and draped costume
 * silhouette rather than flat photo projection.
 */
export function createRiggedCostumeAccessories(
  features: CharacterVisualFeatures,
  rigScale = 1.0,
  isStandinHandAlongNegX = false
): Map<HumanoidBone, THREE.Object3D[]> {
  const attachments = new Map<HumanoidBone, THREE.Object3D[]>();
  const add = (bone: HumanoidBone, obj: THREE.Object3D) => {
    obj.userData.isCostumeAccessory = true;
    obj.userData.preserveAccessoryColor = true;
    obj.traverse((c) => {
      c.userData.isCostumeAccessory = true;
      c.userData.preserveAccessoryColor = true;
    });
    const list = attachments.get(bone) || [];
    list.push(obj);
    attachments.set(bone, list);
  };

  const pal = features.palette;
  const isSelective = Boolean(features.costume.selectiveMode);

  // 1. Head Attachments: Hats, Helmets, Crowns, Glasses, Sculpted Hair, Facial Definition, and Hood
  const hairColor = pal.hair || '#d4d4d8';
  const hairMat = createTactileClayMaterial({ color: hairColor, roughness: 0.65, material: 'fabric' });
  const skinMat = createTactileClayMaterial({ color: pal.skin || '#dfbeaa', roughness: 0.62 });

  // H1. Hat (Fedora / Cowboy / Cap / Top Hat / Beanie / Wizard / Toque / Hardhat / Captain / Scrubcap)
  if (features.costume.hasHat) {
    const hatGroup = new THREE.Group();
    hatGroup.name = 'Costume_Hat';
    const hatHex = features.costume.hatColor || '#27272a';
    const hatMat = createTactileClayMaterial({ color: hatHex, roughness: 0.72, material: 'fabric' });
    const bandMat = createTactileClayMaterial({ color: pal.metal || '#d97706', roughness: 0.45, metalness: 0.25 });
    const style = features.costume.hatStyle || 'fedora';

    if (style === 'wizard') {
      // Wide conical brim + tall pointed wizard cone
      const brimGeom = new THREE.CylinderGeometry(0.26 * rigScale, 0.28 * rigScale, 0.016 * rigScale, 28);
      const brim = new THREE.Mesh(brimGeom, hatMat);
      brim.castShadow = true;
      hatGroup.add(brim);

      const coneGeom = new THREE.ConeGeometry(0.135 * rigScale, 0.36 * rigScale, 24);
      const cone = new THREE.Mesh(coneGeom, hatMat);
      cone.position.y = 0.18 * rigScale;
      cone.rotation.z = -0.08;
      cone.castShadow = true;
      hatGroup.add(cone);

      const bandGeom = new THREE.CylinderGeometry(0.132 * rigScale, 0.136 * rigScale, 0.028 * rigScale, 24);
      const band = new THREE.Mesh(bandGeom, bandMat);
      band.position.y = 0.02 * rigScale;
      hatGroup.add(band);
    } else if (style === 'toque') {
      // Tall white pleated chef toque hat
      const bandGeom = new THREE.CylinderGeometry(0.125 * rigScale, 0.12 * rigScale, 0.07 * rigScale, 24);
      const band = new THREE.Mesh(bandGeom, hatMat);
      band.position.y = 0.035 * rigScale;
      hatGroup.add(band);

      const puffGeom = new THREE.CylinderGeometry(0.145 * rigScale, 0.125 * rigScale, 0.18 * rigScale, 20);
      const puff = new THREE.Mesh(puffGeom, hatMat);
      puff.position.y = 0.15 * rigScale;
      puff.castShadow = true;
      hatGroup.add(puff);

      const crownPuff = createSuperellipsoidGeometry([0.15 * rigScale, 0.06 * rigScale, 0.15 * rigScale], 0.45, 0);
      const top = new THREE.Mesh(crownPuff, hatMat);
      top.position.y = 0.24 * rigScale;
      hatGroup.add(top);
    } else if (style === 'hardhat') {
      // Miner hard hat with front glowing halogen headlamp
      const hardMat = new THREE.MeshStandardMaterial({ color: hatHex, roughness: 0.35, metalness: 0.15 });
      const domeGeom = new THREE.SphereGeometry(0.138 * rigScale, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
      const dome = new THREE.Mesh(domeGeom, hardMat);
      dome.castShadow = true;
      hatGroup.add(dome);

      const brimGeom = new THREE.CylinderGeometry(0.155 * rigScale, 0.165 * rigScale, 0.014 * rigScale, 24);
      const brim = new THREE.Mesh(brimGeom, hardMat);
      brim.position.set(0, 0.005 * rigScale, 0.015 * rigScale);
      hatGroup.add(brim);

      const lampHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028 * rigScale, 0.032 * rigScale, 0.04 * rigScale, 16),
        new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.7 })
      );
      lampHousing.rotation.x = Math.PI / 2;
      lampHousing.position.set(0, 0.065 * rigScale, 0.14 * rigScale);
      hatGroup.add(lampHousing);

      const lampLens = new THREE.Mesh(
        new THREE.SphereGeometry(0.024 * rigScale, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 0.85, roughness: 0.1 })
      );
      lampLens.position.set(0, 0.065 * rigScale, 0.16 * rigScale);
      hatGroup.add(lampLens);
    } else if (style === 'captain') {
      // Airline captain peaked visor cap with gold badge
      const crownGeom = new THREE.CylinderGeometry(0.145 * rigScale, 0.125 * rigScale, 0.075 * rigScale, 24);
      const crown = new THREE.Mesh(crownGeom, hatMat);
      crown.position.y = 0.045 * rigScale;
      hatGroup.add(crown);

      const visorGeom = new THREE.BoxGeometry(0.17 * rigScale, 0.014 * rigScale, 0.11 * rigScale);
      const visorMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.2, metalness: 0.5 });
      const visor = new THREE.Mesh(visorGeom, visorMat);
      visor.position.set(0, 0.01 * rigScale, 0.12 * rigScale);
      visor.rotation.x = 0.18;
      hatGroup.add(visor);

      const badge = new THREE.Mesh(new THREE.SphereGeometry(0.022 * rigScale, 10, 10), bandMat);
      badge.position.set(0, 0.05 * rigScale, 0.135 * rigScale);
      hatGroup.add(badge);
    } else if (style === 'scrubcap') {
      // Hospital surgical scrub cap
      const capGeom = new THREE.CylinderGeometry(0.132 * rigScale, 0.136 * rigScale, 0.095 * rigScale, 24);
      const cap = new THREE.Mesh(capGeom, hatMat);
      cap.position.y = 0.03 * rigScale;
      hatGroup.add(cap);
    } else if (style === 'cap') {
      const domeGeom = new THREE.SphereGeometry(0.125 * rigScale, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
      const dome = new THREE.Mesh(domeGeom, hatMat);
      dome.castShadow = true;
      hatGroup.add(dome);

      const visorGeom = new THREE.BoxGeometry(0.18 * rigScale, 0.015 * rigScale, 0.14 * rigScale);
      const visor = new THREE.Mesh(visorGeom, hatMat);
      visor.position.set(0, 0.01 * rigScale, 0.14 * rigScale);
      visor.rotation.x = 0.12;
      visor.castShadow = true;
      hatGroup.add(visor);
    } else if (style === 'tophat') {
      const brimGeom = new THREE.CylinderGeometry(0.19 * rigScale, 0.19 * rigScale, 0.018 * rigScale, 24);
      const brim = new THREE.Mesh(brimGeom, hatMat);
      brim.castShadow = true;
      hatGroup.add(brim);

      const crownGeom = new THREE.CylinderGeometry(0.125 * rigScale, 0.115 * rigScale, 0.22 * rigScale, 24);
      const crown = new THREE.Mesh(crownGeom, hatMat);
      crown.position.y = 0.11 * rigScale;
      crown.castShadow = true;
      hatGroup.add(crown);

      const bandGeom = new THREE.CylinderGeometry(0.118 * rigScale, 0.118 * rigScale, 0.03 * rigScale, 24);
      const band = new THREE.Mesh(bandGeom, bandMat);
      band.position.y = 0.025 * rigScale;
      hatGroup.add(band);
    } else if (style === 'beanie') {
      const beanieGeom = createSuperellipsoidGeometry([0.13 * rigScale, 0.14 * rigScale, 0.135 * rigScale], 0.35, -0.15);
      const beanie = new THREE.Mesh(beanieGeom, hatMat);
      beanie.position.y = 0.05 * rigScale;
      beanie.castShadow = true;
      hatGroup.add(beanie);
    } else {
      // Classic Fedora / Wide-Brim / Cowboy Hat
      const brimRadius = style === 'cowboy' ? 0.25 * rigScale : 0.21 * rigScale;
      const brimGeom = new THREE.CylinderGeometry(brimRadius, brimRadius * 1.03, 0.018 * rigScale, 28);
      const brim = new THREE.Mesh(brimGeom, hatMat);
      brim.castShadow = true;
      hatGroup.add(brim);

      const crownGeom = new THREE.CylinderGeometry(0.105 * rigScale, 0.125 * rigScale, 0.135 * rigScale, 24);
      const crown = new THREE.Mesh(crownGeom, hatMat);
      crown.position.y = 0.07 * rigScale;
      crown.castShadow = true;
      hatGroup.add(crown);

      const topDomeGeom = createSuperellipsoidGeometry([0.105 * rigScale, 0.03 * rigScale, 0.11 * rigScale], 0.3, 0);
      const topDome = new THREE.Mesh(topDomeGeom, hatMat);
      topDome.position.y = 0.135 * rigScale;
      hatGroup.add(topDome);

      const bandGeom = new THREE.CylinderGeometry(0.126 * rigScale, 0.127 * rigScale, 0.026 * rigScale, 24);
      const band = new THREE.Mesh(bandGeom, bandMat);
      band.position.y = 0.022 * rigScale;
      hatGroup.add(band);
    }

    hatGroup.position.set(0, 0.145 * rigScale, 0);
    add('Head', hatGroup);
  }

  // H2. Helmet (Knight / Astronaut / Kabuto / Ballistic / Default)
  if (features.costume.hasHelmet) {
    const helmGroup = new THREE.Group();
    helmGroup.name = 'Costume_Helmet';
    const helmStyle = features.costume.helmetStyle || 'default';
    const helmMat = createTactileClayMaterial({
      color: helmStyle === 'astronaut' ? '#f8fafc' : helmStyle === 'kabuto' ? '#18181b' : pal.metal || '#94a3b8',
      roughness: helmStyle === 'astronaut' ? 0.25 : 0.28,
      metalness: helmStyle === 'astronaut' ? 0.2 : 0.82,
    });

    if (helmStyle === 'astronaut') {
      // Full pressurized spherical EVA helmet with reflective gold visor
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.175 * rigScale, 24, 18), helmMat);
      shell.position.y = -0.02 * rigScale;
      helmGroup.add(shell);

      const goldVisorMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.12, metalness: 0.92 });
      const visor = new THREE.Mesh(
        new THREE.SphereGeometry(0.162 * rigScale, 20, 14, -Math.PI * 0.38, Math.PI * 0.76, Math.PI * 0.25, Math.PI * 0.45),
        goldVisorMat
      );
      visor.rotation.y = Math.PI * 0.5;
      visor.position.set(0, -0.02 * rigScale, 0.025 * rigScale);
      helmGroup.add(visor);
    } else if (helmStyle === 'kabuto') {
      // Feudal Samurai Kabuto with shikoro neck guard and golden crescent maedate crest
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.145 * rigScale, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
        helmMat
      );
      helmGroup.add(dome);

      const shikoro = new THREE.Mesh(
        new THREE.CylinderGeometry(0.145 * rigScale, 0.195 * rigScale, 0.11 * rigScale, 16, 1, true, Math.PI * 0.35, Math.PI * 1.3),
        createTactileClayMaterial({ color: pal.primaryClothing || '#7f1d1d', roughness: 0.4, metalness: 0.5 })
      );
      shikoro.material.side = THREE.DoubleSide;
      shikoro.position.y = -0.05 * rigScale;
      helmGroup.add(shikoro);

      // Golden crescent horns (Kuwagata / Maedate)
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.2, metalness: 0.9 });
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.022 * rigScale, 0.18 * rigScale, 8), goldMat);
        horn.position.set(side * 0.07 * rigScale, 0.11 * rigScale, 0.13 * rigScale);
        horn.rotation.z = -side * 0.45;
        horn.rotation.x = 0.2;
        helmGroup.add(horn);
      }
    } else if (helmStyle === 'knight') {
      // Enclosed Medieval Great Helm / Bascinet with narrow eye slit and brass cross
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.138 * rigScale, 0.145 * rigScale, 0.24 * rigScale, 20), helmMat);
      cyl.position.y = -0.03 * rigScale;
      helmGroup.add(cyl);

      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.138 * rigScale, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), helmMat);
      dome.position.y = 0.09 * rigScale;
      helmGroup.add(dome);

      const slitMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.16 * rigScale, 0.02 * rigScale, 0.04 * rigScale), slitMat);
      slit.position.set(0, 0.01 * rigScale, 0.125 * rigScale);
      helmGroup.add(slit);
    } else {
      const domeGeom = new THREE.SphereGeometry(0.14 * rigScale, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.68);
      const dome = new THREE.Mesh(domeGeom, helmMat);
      dome.castShadow = true;
      helmGroup.add(dome);

      const visorGeom = new THREE.CylinderGeometry(0.144 * rigScale, 0.144 * rigScale, 0.05 * rigScale, 16, 1, false, -Math.PI * 0.35, Math.PI * 0.7);
      const visorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.9 });
      const visor = new THREE.Mesh(visorGeom, visorMat);
      visor.position.y = -0.01 * rigScale;
      helmGroup.add(visor);
    }

    helmGroup.position.set(0, 0.11 * rigScale, 0);
    add('Head', helmGroup);
  }

  // H2b. Face Mask (Surgical Mask or Shinobi Ninja Face Wrap)
  if (features.costume.hasFaceMask) {
    const isSurgeonMask = features.archetype === 'surgeon';
    const maskMat = createTactileClayMaterial({
      color: isSurgeonMask ? '#e0f2fe' : pal.secondaryClothing || '#18181b',
      roughness: 0.75,
      material: 'fabric',
    });
    const maskGeom = createSuperellipsoidGeometry([0.115 * rigScale, 0.075 * rigScale, 0.095 * rigScale], 0.3, 0);
    const maskMesh = new THREE.Mesh(maskGeom, maskMat);
    maskMesh.name = 'Costume_FaceMask';
    maskMesh.position.set(0, 0.015 * rigScale, 0.085 * rigScale);
    add('Head', maskMesh);
  }

  // H3. Royal Crown
  if (features.costume.hasCrown) {
    const crownGroup = new THREE.Group();
    crownGroup.name = 'Costume_Crown';
    const goldMat = createTactileClayMaterial({ color: '#eab308', roughness: 0.25, metalness: 0.88 });
    const ringGeom = new THREE.CylinderGeometry(0.125 * rigScale, 0.118 * rigScale, 0.065 * rigScale, 16, 1, true);
    const ring = new THREE.Mesh(ringGeom, goldMat);
    ring.material.side = THREE.DoubleSide;
    crownGroup.add(ring);
    crownGroup.position.set(0, 0.16 * rigScale, 0);
    add('Head', crownGroup);
  }

  // H4. Glasses / Sunglasses
  if (features.costume.hasGlasses) {
    const glassesGroup = new THREE.Group();
    glassesGroup.name = 'Costume_Glasses';
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.25, metalness: 0.6 });
    const lensGeom = new THREE.CylinderGeometry(0.032 * rigScale, 0.032 * rigScale, 0.008 * rigScale, 16);
    lensGeom.rotateX(Math.PI / 2);

    const lensL = new THREE.Mesh(lensGeom, frameMat);
    lensL.position.set(0.042 * rigScale, 0, 0);
    glassesGroup.add(lensL);

    const lensR = new THREE.Mesh(lensGeom, frameMat);
    lensR.position.set(-0.042 * rigScale, 0, 0);
    glassesGroup.add(lensR);

    const bridgeGeom = new THREE.BoxGeometry(0.03 * rigScale, 0.007 * rigScale, 0.008 * rigScale);
    const bridge = new THREE.Mesh(bridgeGeom, frameMat);
    glassesGroup.add(bridge);

    glassesGroup.position.set(0, 0.075 * rigScale, 0.115 * rigScale);
    add('Head', glassesGroup);
  }

  if (Boolean(features.costume.hasHair)) {
    // A. Crown & Main Hair Volume
    const crownGeom = createSuperellipsoidGeometry([0.22 * rigScale, 0.22 * rigScale, 0.24 * rigScale], 0.25, -0.05);
    const crownMesh = new THREE.Mesh(crownGeom, hairMat);
    crownMesh.name = 'Costume_Hair_Crown';
    crownMesh.position.set(0, 0.06 * rigScale, -0.02 * rigScale);
    crownMesh.castShadow = true;
    add('Head', crownMesh);

    // B. Forehead Center Part & Bangs
    const bangGeomL = createSuperellipsoidGeometry([0.09 * rigScale, 0.07 * rigScale, 0.06 * rigScale], 0.2, 0.1);
    const bangMeshL = new THREE.Mesh(bangGeomL, hairMat);
    bangMeshL.name = 'Costume_Hair_BangL';
    bangMeshL.position.set(0.06 * rigScale, 0.10 * rigScale, 0.13 * rigScale);
    bangMeshL.rotation.set(0.2, 0.1, -0.2);
    bangMeshL.castShadow = true;
    add('Head', bangMeshL);

    const bangMeshR = new THREE.Mesh(bangGeomL, hairMat);
    bangMeshR.name = 'Costume_Hair_BangR';
    bangMeshR.position.set(-0.06 * rigScale, 0.10 * rigScale, 0.13 * rigScale);
    bangMeshR.rotation.set(0.2, -0.1, 0.2);
    bangMeshR.castShadow = true;
    add('Head', bangMeshR);

    // C. Long Side Braids / Strands cascading over the shoulders
    const strandGeom = new THREE.CylinderGeometry(0.025 * rigScale, 0.015 * rigScale, 0.42 * rigScale, 8);
    const strandMeshL = new THREE.Mesh(strandGeom, hairMat);
    strandMeshL.name = 'Costume_Hair_StrandL';
    strandMeshL.position.set(0.12 * rigScale, -0.06 * rigScale, 0.06 * rigScale);
    strandMeshL.rotation.set(0.15, 0, -0.15);
    strandMeshL.castShadow = true;
    add('Head', strandMeshL);

    const strandMeshR = new THREE.Mesh(strandGeom, hairMat);
    strandMeshR.name = 'Costume_Hair_StrandR';
    strandMeshR.position.set(-0.12 * rigScale, -0.06 * rigScale, 0.06 * rigScale);
    strandMeshR.rotation.set(0.15, 0, 0.15);
    strandMeshR.castShadow = true;
    add('Head', strandMeshR);

    // D. Rear Hair Bun / Ponytail
    const bunGeom = createSuperellipsoidGeometry([0.10 * rigScale, 0.18 * rigScale, 0.10 * rigScale], 0.25, -0.2);
    const bunMesh = new THREE.Mesh(bunGeom, hairMat);
    bunMesh.name = 'Costume_Hair_Bun';
    bunMesh.position.set(0, 0.03 * rigScale, -0.18 * rigScale);
    bunMesh.rotation.set(-0.35, 0, 0);
    bunMesh.castShadow = true;
    add('Head', bunMesh);
  }

  if (Boolean(features.costume.hasAntlersOrPins)) {
    // E. Circlet / Tiara Headband
    const circletGeom = new THREE.TorusGeometry(0.185 * rigScale, 0.016 * rigScale, 8, 24, Math.PI * 0.9);
    const circletMat = createTactileClayMaterial({ color: pal.metal || '#c5a059', roughness: 0.28, metalness: 0.85 });
    const circletMesh = new THREE.Mesh(circletGeom, circletMat);
    circletMesh.name = 'Costume_Circlet';
    circletMesh.position.set(0, 0.08 * rigScale, 0.02 * rigScale);
    circletMesh.rotation.set(1.35, 0, -Math.PI * 0.45);
    circletMesh.castShadow = true;

    const gemGeom = createSuperellipsoidGeometry([0.022 * rigScale, 0.032 * rigScale, 0.02 * rigScale], 0.15, 0);
    const gemMat = createTactileClayMaterial({ color: pal.weaponAccent || '#38bdf8', roughness: 0.2, metalness: 0.3 });
    const gemMesh = new THREE.Mesh(gemGeom, gemMat);
    gemMesh.position.set(0, 0.10 * rigScale, 0.19 * rigScale);
    circletMesh.add(gemMesh);
    add('Head', circletMesh);

    // F. Sculpted Facial Profile: Nose Bridge, Brow Arches, Almond Eyes, Elven Ears
    const noseGeom = createSuperellipsoidGeometry([0.022 * rigScale, 0.065 * rigScale, 0.045 * rigScale], 0.2, 0.3);
    const noseMesh = new THREE.Mesh(noseGeom, skinMat);
    noseMesh.name = 'Costume_Face_Nose';
    noseMesh.position.set(0, 0.03 * rigScale, 0.20 * rigScale);
    noseMesh.castShadow = true;
    add('Head', noseMesh);

    const browGeom = new THREE.CylinderGeometry(0.007 * rigScale, 0.005 * rigScale, 0.065 * rigScale, 6);
    const browMat = createTactileClayMaterial({ color: hairColor, roughness: 0.7 });
    const browL = new THREE.Mesh(browGeom, browMat);
    browL.name = 'Costume_Face_BrowL';
    browL.position.set(0.05 * rigScale, 0.085 * rigScale, 0.185 * rigScale);
    browL.rotation.set(0, 0, 1.35);
    add('Head', browL);

    const browR = new THREE.Mesh(browGeom, browMat);
    browR.name = 'Costume_Face_BrowR';
    browR.position.set(-0.05 * rigScale, 0.085 * rigScale, 0.185 * rigScale);
    browR.rotation.set(0, 0, -1.35);
    add('Head', browR);

    const eyeGeom = createSuperellipsoidGeometry([0.028 * rigScale, 0.015 * rigScale, 0.01 * rigScale], 0.15, 0);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
    eyeL.name = 'Costume_Face_EyeL';
    eyeL.position.set(0.055 * rigScale, 0.055 * rigScale, 0.185 * rigScale);
    add('Head', eyeL);

    const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
    eyeR.name = 'Costume_Face_EyeR';
    eyeR.position.set(-0.055 * rigScale, 0.055 * rigScale, 0.185 * rigScale);
    add('Head', eyeR);

    // Pointed Elven Ears
    const earGeom = createSuperellipsoidGeometry([0.02 * rigScale, 0.08 * rigScale, 0.05 * rigScale], 0.2, 0.6);
    const earL = new THREE.Mesh(earGeom, skinMat);
    earL.name = 'Costume_Face_EarL';
    earL.position.set(0.18 * rigScale, 0.06 * rigScale, -0.02 * rigScale);
    earL.rotation.set(0.3, 0.4, -0.7);
    earL.castShadow = true;
    add('Head', earL);

    const earR = new THREE.Mesh(earGeom, skinMat);
    earR.name = 'Costume_Face_EarR';
    earR.position.set(-0.18 * rigScale, 0.06 * rigScale, -0.02 * rigScale);
    earR.rotation.set(0.3, -0.4, 0.7);
    earR.castShadow = true;
    add('Head', earR);
  }

  // G. Optional Hood
  if (features.costume.hasHood) {
    const hoodGeom = createSuperellipsoidGeometry([0.27 * rigScale, 0.31 * rigScale, 0.29 * rigScale], 0.35, -0.2);
    const hoodMat = createTactileClayMaterial({ color: pal.primaryClothing, roughness: 0.82, material: 'fabric' });
    const hoodMesh = new THREE.Mesh(hoodGeom, hoodMat);
    hoodMesh.name = 'Costume_Hood';
    hoodMesh.position.set(0, 0.04 * rigScale, -0.04 * rigScale);
    hoodMesh.castShadow = true;
    add('Head', hoodMesh);
  }

  // 2. Chest Attachments: Draped Neck Scarf / Cowl, Leather Cuirass, Harness Strap, Back Quiver
  if (!isSelective || Boolean(features.costume.hasCowl)) {
    // A. Form-fitting Draped Neck Collar / Cowl (no circular torus ring)
    const scarfGeom = createSuperellipsoidGeometry([0.13 * rigScale, 0.045 * rigScale, 0.12 * rigScale], 0.35, 0);
    const scarfMat = createTactileClayMaterial({ color: pal.secondaryClothing || '#ded7cd', roughness: 0.85, material: 'fabric' });
    const scarfRing = new THREE.Mesh(scarfGeom, scarfMat);
    scarfRing.name = 'Costume_NeckScarf';
    scarfRing.position.set(0, 0.24 * rigScale, 0.01 * rigScale);
    scarfRing.castShadow = true;

    const bibGeom = createSuperellipsoidGeometry([0.16 * rigScale, 0.11 * rigScale, 0.08 * rigScale], 0.3, -0.2);
    const bibMesh = new THREE.Mesh(bibGeom, scarfMat);
    bibMesh.name = 'Costume_ScarfDrape';
    bibMesh.position.set(0, -0.04 * rigScale, 0.06 * rigScale);
    bibMesh.rotation.set(0.25, 0, 0);
    bibMesh.castShadow = true;
    scarfRing.add(bibMesh);
    add('Chest', scarfRing);
  }

  if (!isSelective || features.costume.hasCuirass) {
    // B. Form-fitting Chest Cuirass / Vest / Jacket
    const isPlateArmor = features.archetype === 'knight' || features.archetype === 'samurai';
    const cuirassGeom = createSuperellipsoidGeometry([0.34 * rigScale, 0.38 * rigScale, 0.24 * rigScale], 0.25, -0.15);
    const cuirassMat = createTactileClayMaterial({
      color: pal.primaryClothing || '#8c4a2b',
      roughness: isPlateArmor ? 0.32 : 0.62,
      metalness: isPlateArmor ? 0.78 : 0.08,
      material: isPlateArmor ? 'metal' : 'clay',
    });
    const cuirassMesh = new THREE.Mesh(cuirassGeom, cuirassMat);
    cuirassMesh.name = 'Costume_ChestCuirass';
    cuirassMesh.position.set(0, 0.02 * rigScale, 0);
    cuirassMesh.castShadow = true;
    add('Chest', cuirassMesh);
  }

  // B2. Tie / Lapels (Executive, Detective, Airline Pilot)
  if (features.costume.hasTie) {
    const tieGroup = new THREE.Group();
    tieGroup.name = 'Costume_Tie';
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.16 * rigScale, 0.06 * rigScale, 0.05 * rigScale), collarMat);
    collar.position.set(0, 0.21 * rigScale, 0.125 * rigScale);
    tieGroup.add(collar);

    const tieMat = createTactileClayMaterial({ color: '#b91c1c', roughness: 0.65, material: 'fabric' });
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.045 * rigScale, 0.24 * rigScale, 0.02 * rigScale), tieMat);
    tie.position.set(0, 0.07 * rigScale, 0.145 * rigScale);
    tieGroup.add(tie);
    add('Chest', tieGroup);
  }

  // B3. Work Apron (Blacksmith, Chef, Steampunk Inventor)
  if (features.costume.hasApron) {
    const isWhiteApron = features.archetype === 'chef';
    const apronMat = createTactileClayMaterial({
      color: isWhiteApron ? '#f1f5f9' : pal.leather || '#5c2d0c',
      roughness: 0.68,
      material: isWhiteApron ? 'fabric' : 'clay',
    });
    const bib = new THREE.Mesh(
      new THREE.BoxGeometry(0.28 * rigScale, 0.34 * rigScale, 0.04 * rigScale),
      apronMat
    );
    bib.name = 'Costume_ApronBib';
    bib.position.set(0, 0.01 * rigScale, 0.135 * rigScale);
    add('Chest', bib);

    const skirt = new THREE.Mesh(
      createSuperellipsoidGeometry([0.33 * rigScale, 0.38 * rigScale, 0.16 * rigScale], 0.2, -0.25),
      apronMat
    );
    skirt.name = 'Costume_ApronSkirt';
    skirt.position.set(0, -0.18 * rigScale, 0.08 * rigScale);
    add('Hips', skirt);
  }

  // B4. Shoulder Pauldrons (Knight, Samurai, Astronaut, Soldier)
  if (features.costume.hasPauldrons) {
    const pauldronMat = createTactileClayMaterial({
      color: pal.metal || pal.primaryClothing || '#94a3b8',
      roughness: 0.32,
      metalness: 0.75,
    });
    const pGeom = createSuperellipsoidGeometry([0.11 * rigScale, 0.09 * rigScale, 0.11 * rigScale], 0.3, 0);
    const pL = new THREE.Mesh(pGeom, pauldronMat);
    pL.name = 'Costume_PauldronL';
    pL.position.set(0, 0.04 * rigScale, 0);
    add('LeftArm', pL);

    const pR = new THREE.Mesh(pGeom, pauldronMat);
    pR.name = 'Costume_PauldronR';
    pR.position.set(0, 0.04 * rigScale, 0);
    add('RightArm', pR);
  }

  // B5. Doctor Stethoscope
  if (features.costume.hasStethoscope) {
    const stethGroup = new THREE.Group();
    stethGroup.name = 'Costume_Stethoscope';
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13 * rigScale, 0.012 * rigScale, 8, 20), tubeMat);
    ring.rotation.x = Math.PI * 0.35;
    ring.position.set(0, 0.18 * rigScale, 0.06 * rigScale);
    stethGroup.add(ring);

    const diaphragm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032 * rigScale, 0.032 * rigScale, 0.015 * rigScale, 16),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.85 })
    );
    diaphragm.rotation.x = Math.PI / 2;
    diaphragm.position.set(0.06 * rigScale, 0.05 * rigScale, 0.145 * rigScale);
    stethGroup.add(diaphragm);
    add('Chest', stethGroup);
  }

  // B6. Twin Crossed Back Katanas (Ninja)
  if (features.equipment.hasBackKatanas) {
    const backKatanas = new THREE.Group();
    backKatanas.name = 'Equipment_BackKatanas';
    const sheathMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.4, metalness: 0.3 });
    const tsubaMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.25, metalness: 0.85 });

    for (const dir of [-1, 1]) {
      const kGroup = new THREE.Group();
      kGroup.rotation.z = dir * 0.52;
      const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * rigScale, 0.014 * rigScale, 0.88 * rigScale, 10), sheathMat);
      kGroup.add(sheath);
      const tsuba = new THREE.Mesh(new THREE.BoxGeometry(0.065 * rigScale, 0.015 * rigScale, 0.065 * rigScale), tsubaMat);
      tsuba.position.y = 0.32 * rigScale;
      kGroup.add(tsuba);
      backKatanas.add(kGroup);
    }
    backKatanas.position.set(0, 0.06 * rigScale, -0.16 * rigScale);
    add('Chest', backKatanas);
  }

  if (features.costume.hasCape) {
    const capeGeom = createSuperellipsoidGeometry([0.36 * rigScale, 0.82 * rigScale, 0.06 * rigScale], 0.2, -0.35);
    const capeMat = createTactileClayMaterial({ color: pal.primaryClothing || '#7f1d1d', roughness: 0.82, material: 'fabric' });
    const capeMesh = new THREE.Mesh(capeGeom, capeMat);
    capeMesh.name = 'Costume_Cape';
    capeMesh.position.set(0, -0.18 * rigScale, -0.16 * rigScale);
    capeMesh.rotation.x = 0.12;
    capeMesh.castShadow = true;
    add('Chest', capeMesh);
  }

  if (features.costume.hasBackpack) {
    const packGeom = createSuperellipsoidGeometry([0.24 * rigScale, 0.34 * rigScale, 0.14 * rigScale], 0.25, 0);
    const packMat = createTactileClayMaterial({
      color: features.archetype === 'astronaut' ? '#f8fafc' : pal.leather || '#4a3321',
      roughness: 0.55,
      material: 'clay',
    });
    const packMesh = new THREE.Mesh(packGeom, packMat);
    packMesh.name = 'Costume_Backpack';
    packMesh.position.set(0, 0.04 * rigScale, -0.18 * rigScale);
    packMesh.castShadow = true;
    add('Chest', packMesh);
  }

  // C. Cross-chest Leather Harness Strap
  if (Boolean(features.costume.hasBelt) && (features.equipment.hasQuiver || features.archetype === 'archer' || features.archetype === 'scout')) {
    const strapGeom = createSuperellipsoidGeometry([0.36 * rigScale, 0.06 * rigScale, 0.26 * rigScale], 0.2, 0);
    const strapMat = createTactileClayMaterial({ color: pal.leather, roughness: 0.55, material: 'clay' });
    const strapMesh = new THREE.Mesh(strapGeom, strapMat);
    strapMesh.name = 'Costume_HarnessStrap';
    strapMesh.rotation.z = 0.42;
    strapMesh.castShadow = true;
    add('Chest', strapMesh);
  }

  // D. Back Quiver with Arrows
  if (Boolean(features.equipment.hasQuiver)) {
    const quiverGroup = new THREE.Group();
    quiverGroup.name = 'Equipment_Quiver';

    const quiverGeom = new THREE.CylinderGeometry(0.08 * rigScale, 0.06 * rigScale, 0.68 * rigScale, 12);
    const quiverMat = createTactileClayMaterial({ color: pal.leather, roughness: 0.58, material: 'clay' });
    const quiverBody = new THREE.Mesh(quiverGeom, quiverMat);
    quiverBody.castShadow = true;
    quiverGroup.add(quiverBody);

    const arrowGeom = new THREE.CylinderGeometry(0.008 * rigScale, 0.008 * rigScale, 0.85 * rigScale, 6);
    const arrowMat = createTactileClayMaterial({ color: pal.weaponWood || '#4a2810', roughness: 0.7, material: 'wood' });
    const arrowShaft = new THREE.Mesh(arrowGeom, arrowMat);
    arrowShaft.position.y = 0.12 * rigScale;
    quiverGroup.add(arrowShaft);

    const fletchGeom = createSuperellipsoidGeometry([0.08 * rigScale, 0.14 * rigScale, 0.08 * rigScale], 0.2, 0);
    const fletchMat = createTactileClayMaterial({ color: pal.weaponAccent || '#f3f4f6', roughness: 0.85 });
    const fletchMesh = new THREE.Mesh(fletchGeom, fletchMat);
    fletchMesh.position.y = 0.52 * rigScale;
    quiverGroup.add(fletchMesh);

    quiverGroup.position.set(-0.16 * rigScale, 0.08 * rigScale, -0.22 * rigScale);
    quiverGroup.rotation.set(0.3, 0, -0.45);
    add('Chest', quiverGroup);
  }

  // 3. Hips Attachments: Form-Fitting Waist Belt, Buckle, and Flared Tunic Skirt (no circular hula-hoop TorusGeometry!)
  if (isSelective ? Boolean(features.costume.hasBelt) : features.costume.hasBelt !== false) {
    const beltGeom = createSuperellipsoidGeometry([0.145 * rigScale, 0.032 * rigScale, 0.105 * rigScale], 0.35, 0);
    const beltMat = createTactileClayMaterial({ color: pal.leather, roughness: 0.55 });
    const beltMesh = new THREE.Mesh(beltGeom, beltMat);
    beltMesh.name = 'Costume_WaistBelt';
    beltMesh.castShadow = true;
    add('Hips', beltMesh);

    const buckleGeom = createSuperellipsoidGeometry([0.045 * rigScale, 0.038 * rigScale, 0.02 * rigScale], 0.15, 0);
    const buckleMat = createTactileClayMaterial({ color: pal.metal, roughness: 0.28, metalness: 0.85 });
    const buckleMesh = new THREE.Mesh(buckleGeom, buckleMat);
    buckleMesh.position.set(0, 0, 0.108 * rigScale);
    buckleMesh.name = 'Costume_BeltBuckle';
    buckleMesh.castShadow = true;
    add('Hips', buckleMesh);
  }

  const garment = features.costume.lowerGarment || (isSelective ? 'none' : 'skirt');
  if (garment === 'skirt' || garment === 'robe') {
    const isFullRobe = garment === 'robe';
    const skirtGeom = createSuperellipsoidGeometry(
      [
        (isFullRobe ? 0.22 : 0.20) * rigScale,
        (isFullRobe ? 0.52 : 0.32) * rigScale,
        (isFullRobe ? 0.18 : 0.16) * rigScale,
      ],
      0.25,
      -0.45
    );
    const skirtMat = createTactileClayMaterial({ color: pal.primaryClothing, roughness: 0.82, material: 'fabric' });
    const skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
    skirtMesh.name = 'Costume_TunicSkirt';
    skirtMesh.position.set(0, (isFullRobe ? -0.24 : -0.14) * rigScale, 0);
    skirtMesh.castShadow = true;
    add('Hips', skirtMesh);
  }

  // 4. Forearm Leather Bracers
  if (Boolean(features.costume.hasBracers)) {
    const bracerGeom = new THREE.CylinderGeometry(0.065 * rigScale, 0.055 * rigScale, 0.24 * rigScale, 12);
    const bracerMat = createTactileClayMaterial({ color: pal.leather, roughness: 0.55 });

    const bracerL = new THREE.Mesh(bracerGeom, bracerMat);
    bracerL.name = 'Costume_BracerL';
    bracerL.castShadow = true;
    add('LeftForeArm', bracerL);

    const bracerR = new THREE.Mesh(bracerGeom, bracerMat);
    bracerR.name = 'Costume_BracerR';
    bracerR.castShadow = true;
    add('RightForeArm', bracerR);
  }

  // 5. Handheld Equipment: Bow, Sword, Shield, Staff, Gun, Briefcase, Hammer
  if (Boolean(features.equipment.hasBow)) {
    const bowGroup = new THREE.Group();
    bowGroup.name = 'Equipment_RecurveBow';

    const bowGeom = new THREE.CylinderGeometry(0.025 * rigScale, 0.015 * rigScale, 1.25 * rigScale, 10);
    const bowMat = createTactileClayMaterial({ color: pal.weaponWood || '#4a2810', roughness: 0.68, material: 'wood' });
    const stave = new THREE.Mesh(bowGeom, bowMat);
    stave.castShadow = true;
    bowGroup.add(stave);

    const stringGeom = new THREE.CylinderGeometry(0.003 * rigScale, 0.003 * rigScale, 1.22 * rigScale, 6);
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xe5e7eb });
    const bowString = new THREE.Mesh(stringGeom, stringMat);
    bowString.position.z = -0.06 * rigScale;
    bowGroup.add(bowString);

    if (isStandinHandAlongNegX) {
      bowGroup.position.set(0.055 * rigScale, 0, 0);
      bowGroup.rotation.set(0.2, 0.1, 0);
    } else {
      bowGroup.position.set(0, 0.055 * rigScale, 0);
      bowGroup.rotation.set(Math.PI * 0.45, 0.1, 0);
    }
    add('LeftHand', bowGroup);
  }

  if (features.equipment.hasSword) {
    const swordGroup = new THREE.Group();
    swordGroup.name = 'Equipment_Sword';
    const isCyberOrSamurai =
      features.archetype === 'samurai' ||
      features.archetype === 'ninja' ||
      pal.weaponAccent === '#38bdf8' ||
      pal.weaponAccent === '#06b6d4';
    const handleMat = createTactileClayMaterial({
      color: isCyberOrSamurai ? '#0f172a' : pal.leather || '#4a3321',
      roughness: 0.55,
    });
    const guardMat = createTactileClayMaterial({
      color: pal.metal || '#eab308',
      roughness: 0.28,
      metalness: 0.88,
    });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: isCyberOrSamurai ? 0xe0f2fe : 0xe2e8f0,
      emissive: isCyberOrSamurai ? 0x06b6d4 : 0x38bdf8,
      emissiveIntensity: isCyberOrSamurai ? 0.65 : 0.15,
      roughness: 0.16,
      metalness: 0.92,
    });

    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018 * rigScale, 0.018 * rigScale, 0.22 * rigScale, 12),
      handleMat
    );
    swordGroup.add(hilt);

    const pommel = new THREE.Mesh(
      new THREE.SphereGeometry(0.024 * rigScale, 10, 10),
      guardMat
    );
    pommel.position.y = -0.11 * rigScale;
    swordGroup.add(pommel);

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 * rigScale, 0.028 * rigScale, 0.05 * rigScale),
      guardMat
    );
    guard.position.y = 0.11 * rigScale;
    swordGroup.add(guard);

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.048 * rigScale, 0.96 * rigScale, 0.014 * rigScale),
      bladeMat
    );
    blade.position.y = 0.59 * rigScale;
    blade.castShadow = true;
    swordGroup.add(blade);

    // Center the hilt directly inside the palm on the hand bone's longitudinal axis (zero lateral offset so it never floats outside the fist)
    if (isStandinHandAlongNegX) {
      swordGroup.position.set(-0.055 * rigScale, 0, 0);
      swordGroup.rotation.set(0.24, 0, 0.18);
    } else {
      swordGroup.position.set(0, 0.055 * rigScale, 0);
      swordGroup.rotation.set(Math.PI * 0.45, 0, 0);
    }
    add('RightHand', swordGroup);
  }

  if (features.equipment.hasShield) {
    const shieldGeom = createSuperellipsoidGeometry([0.28 * rigScale, 0.36 * rigScale, 0.04 * rigScale], 0.25, -0.2);
    const shieldMat = createTactileClayMaterial({ color: pal.metal || '#64748b', roughness: 0.35, metalness: 0.75 });
    const shieldMesh = new THREE.Mesh(shieldGeom, shieldMat);
    shieldMesh.name = 'Equipment_Shield';
    shieldMesh.position.set(0, 0, 0.09 * rigScale);
    shieldMesh.castShadow = true;
    add('LeftForeArm', shieldMesh);
  }

  if (features.equipment.hasStaff) {
    const staffGroup = new THREE.Group();
    staffGroup.name = 'Equipment_Staff';
    const shaftMat = createTactileClayMaterial({ color: pal.weaponWood || '#4a2810', roughness: 0.65, material: 'wood' });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * rigScale, 0.018 * rigScale, 1.65 * rigScale, 10), shaftMat);
    staffGroup.add(shaft);

    const orbMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.5, roughness: 0.15 });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.055 * rigScale, 16, 16), orbMat);
    orb.position.y = 0.86 * rigScale;
    staffGroup.add(orb);

    if (isStandinHandAlongNegX) {
      staffGroup.position.set(-0.055 * rigScale, 0, 0);
    } else {
      staffGroup.position.set(0, 0.055 * rigScale, 0);
      staffGroup.rotation.set(Math.PI * 0.45, 0, 0);
    }
    add('RightHand', staffGroup);
  }

  if (features.equipment.hasGun) {
    const gunGroup = new THREE.Group();
    gunGroup.name = 'Equipment_Gun';
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.85 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.75,
      roughness: 0.15,
      metalness: 0.9,
    });

    // Pistol grip centered at (0,0,0) in the palm
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.034 * rigScale, 0.14 * rigScale, 0.05 * rigScale),
      gunMat
    );
    grip.position.set(0, -0.03 * rigScale, 0);
    grip.rotation.x = -0.2;
    gunGroup.add(grip);

    // Tactical receiver & barrel extending forward along +Z
    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.046 * rigScale, 0.068 * rigScale, 0.34 * rigScale),
      gunMat
    );
    receiver.position.set(0, 0.055 * rigScale, 0.11 * rigScale);
    receiver.castShadow = true;
    gunGroup.add(receiver);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014 * rigScale, 0.014 * rigScale, 0.28 * rigScale, 10),
      gunMat
    );
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(0, 0.065 * rigScale, 0.34 * rigScale);
    barrel.castShadow = true;
    gunGroup.add(barrel);

    // Glowing plasma rail & muzzle tip along the barrel
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.052 * rigScale, 0.018 * rigScale, 0.26 * rigScale),
      accentMat
    );
    rail.position.set(0, 0.065 * rigScale, 0.16 * rigScale);
    gunGroup.add(rail);

    const scope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016 * rigScale, 0.016 * rigScale, 0.11 * rigScale, 10),
      accentMat
    );
    scope.rotation.x = Math.PI * 0.5;
    scope.position.set(0, 0.105 * rigScale, 0.09 * rigScale);
    gunGroup.add(scope);

    // Orient barrel (+Z) straight along the hand's forward aiming axis (-X on standin, +Y on Mixamo FBX)
    if (isStandinHandAlongNegX) {
      gunGroup.position.set(-0.055 * rigScale, 0, 0);
      gunGroup.rotation.set(0, Math.PI * 0.5, 0);
    } else {
      gunGroup.position.set(0, 0.055 * rigScale, 0);
      gunGroup.rotation.set(-Math.PI * 0.46, 0, 0);
    }
    add('RightHand', gunGroup);
  }

  if (features.equipment.hasBriefcase) {
    const caseGroup = new THREE.Group();
    caseGroup.name = 'Equipment_Briefcase';
    const caseMat = createTactileClayMaterial({ color: pal.leather || '#451a03', roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08 * rigScale, 0.28 * rigScale, 0.38 * rigScale), caseMat);
    body.position.y = -0.16 * rigScale;
    caseGroup.add(body);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045 * rigScale, 0.01 * rigScale, 8, 16, Math.PI), caseMat);
    handle.rotation.y = Math.PI / 2;
    handle.position.y = -0.02 * rigScale;
    caseGroup.add(handle);
    if (isStandinHandAlongNegX) {
      caseGroup.position.set(-0.055 * rigScale, 0, 0);
    } else {
      caseGroup.position.set(0, 0.055 * rigScale, 0);
    }
    add('RightHand', caseGroup);
  }

  if (features.equipment.hasHammer) {
    const hammerGroup = new THREE.Group();
    hammerGroup.name = 'Equipment_Hammer';
    const handleMat = createTactileClayMaterial({ color: pal.weaponWood || '#78350f', roughness: 0.65, material: 'wood' });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.35, metalness: 0.85 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * rigScale, 0.016 * rigScale, 0.42 * rigScale, 10), handleMat);
    shaft.position.y = 0.14 * rigScale;
    hammerGroup.add(shaft);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.07 * rigScale, 0.07 * rigScale, 0.18 * rigScale), headMat);
    head.position.y = 0.34 * rigScale;
    hammerGroup.add(head);
    if (isStandinHandAlongNegX) {
      hammerGroup.position.set(-0.055 * rigScale, 0, 0);
      hammerGroup.rotation.x = 0.24;
    } else {
      hammerGroup.position.set(0, 0.055 * rigScale, 0);
      hammerGroup.rotation.x = Math.PI * 0.45;
    }
    add('RightHand', hammerGroup);
  }

  // 6. Lower Legs: Form-fitting Leather Boots (no floating TorusGeometry cuff rings)
  if (!isSelective || features.costume.hasBoots) {
    const bootGeom = new THREE.CylinderGeometry(0.062 * rigScale, 0.052 * rigScale, 0.34 * rigScale, 12);
    const bootMat = createTactileClayMaterial({ color: pal.leather || '#3d2415', roughness: 0.58, material: 'clay' });

    const bootL = new THREE.Mesh(bootGeom, bootMat);
    bootL.name = 'Costume_BootL';
    bootL.position.set(0, 0.18 * rigScale, 0);
    bootL.castShadow = true;
    add('LeftLeg', bootL);

    const bootR = new THREE.Mesh(bootGeom, bootMat);
    bootR.name = 'Costume_BootR';
    bootR.position.set(0, 0.18 * rigScale, 0);
    bootR.castShadow = true;
    add('RightLeg', bootR);
  }

  return attachments;
}

/**
 * Fully dresses and textures a HumanoidRig:
 * 1. Applies clean, tactile studio maquette PBR materials to the skinned mesh body & joints
 *    using the sampled palette (skin tone, leather, under-suit) without flat 2D photo projection.
 * 2. Mounts all 3D costume accessories, sculpted hair, face profile, and equipment to the skeleton joints.
 */
export function dressAndTextureHumanoidRig(
  rig: HumanoidRig,
  features: CharacterVisualFeatures,
  _imageCanvasOrDataUrl?: HTMLCanvasElement | string
): void {
  // Remove any previously mounted costume accessories so re-dressing never duplicates meshes
  for (const bone of rig.bones.values()) {
    const toRemove = bone.children.filter((c) => c.userData?.isCostumeAccessory);
    for (const c of toRemove) {
      bone.remove(c);
    }
  }

  // 1. Style the skinned mesh body using clean tactile maquette PBR materials (preserve body material in selective accessory edits unless concept image provided)
  if (!features.costume.selectiveMode || Boolean(_imageCanvasOrDataUrl)) {
    const pal = features.palette;
    const skinColor = new THREE.Color(pal.skin || '#dfbeaa');
    const jointColor = new THREE.Color(pal.leather || pal.secondaryClothing || '#3d2b1f');

    rig.root.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = child as THREE.SkinnedMesh;
        const isJointShell = /_Joints$/i.test(sm.name);

        sm.material = new THREE.MeshStandardMaterial({
          color: isJointShell ? jointColor : skinColor,
          roughness: isJointShell ? 0.55 : 0.64,
          metalness: isJointShell ? 0.05 : 0.0,
          envMapIntensity: 0.35,
        });
        sm.castShadow = true;
        sm.receiveShadow = true;
      }
    });
  }

  // 2. Attach costume, sculpted hair, face definition, and equipment to skeleton bones
  // Account for Mixamo FBX root scaling (rig.root.scale.y ≈ 0.028 when raw height is 180.47cm) so 1.0 unit in dresser = 1 human meter in world space!
  const rootScale = rig.root.scale.y > 0.0001 ? rig.root.scale.y : 1.0;
  const rigScale = rootScale < 0.2 ? (rig.height / 1.75) / rootScale : rig.height / 1.75;
  const rightHandBone = rig.bones.get('RightHand');
  const isStandinHandAlongNegX = Boolean(
    rightHandBone && Math.abs(rightHandBone.position.x) > Math.abs(rightHandBone.position.y) * 1.5
  );
  const attachments = createRiggedCostumeAccessories(features, rigScale, isStandinHandAlongNegX);

  for (const [boneName, meshes] of attachments.entries()) {
    const bone = rig.bones.get(boneName);
    if (bone) {
      for (const m of meshes) {
        bone.add(m);
      }
    }
  }

  rig.root.userData.characterFeatures = features;
}

/**
 * End-to-end character generator from concept image:
 * Loads the skinned humanoid mannequin, extracts palette and visual features,
 * and dresses the rig with 3D gear, hair, face features, and costume layers.
 */
export async function createSkinnedCharacterFromConcept(
  imageUrl: string,
  prompt = 'Elven Scout Archer',
  options: { height?: number; rawModelOutput?: any } = {}
): Promise<HumanoidRig> {
  const targetHeight = options.height ?? 5.06;

  // 1. Load the skinned humanoid mannequin rig
  const rig = await loadMannequinModel({ height: targetHeight });

  // 2. Extract silhouette and color palette from the concept image
  let palette = createDefaultCharacterFeatures().palette;
  let canvasDataUrl = imageUrl;

  try {
    const analysis = await extractMaskFromImageUrl(imageUrl, 512);
    palette = { ...palette, ...analysis.palette } as typeof palette;
    canvasDataUrl = analysis.canvasDataUrl;
  } catch (err) {
    console.warn('[CharacterDresser] Could not extract palette from image canvas, using defaults:', err);
  }

  // 3. Extract semantic character features
  const features = extractCharacterFeaturesFromModelOutput(
    options.rawModelOutput || {},
    prompt,
    palette
  );

  // 4. Dress the humanoid rig with 3D sculpted hair, costume, and palette
  dressAndTextureHumanoidRig(rig, features, canvasDataUrl);

  return rig;
}
