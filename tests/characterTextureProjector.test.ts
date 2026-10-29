import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  createRiggedCostumeAccessories,
  dressAndTextureHumanoidRig,
} from '../src/engine/kinematics/characterTextureProjector';
import { loadMannequinModel, preloadMannequinModel } from '../src/engine/kinematics/mannequinLoader';
import {
  createDefaultCharacterFeatures,
  extractCharacterFeaturesFromModelOutput,
  hasRequestedCharacterAccessories,
} from '../src/engine/procedural3D/characterClayCompiler';

describe('CharacterTextureProjector & Rigged Costume Dresser', () => {
  beforeAll(async () => {
    await preloadMannequinModel('/models/y-bot-tpose.fbx');
  });

  it('creates full set of 3D costume and equipment accessories grouped by bone', () => {
    const features = createDefaultCharacterFeatures({
      name: 'Elven Scout Archer',
      gender: 'female',
      costume: {
        hasHood: true,
        hasCowl: true,
        hasBelt: true,
        hasBracers: true,
        lowerGarment: 'skirt',
        hasAntlersOrPins: true,
      },
      equipment: {
        hasBow: true,
        hasQuiver: true,
      },
    });

    const attachments = createRiggedCostumeAccessories(features, 1.0);

    expect(attachments.has('Head')).toBe(true);
    expect(attachments.has('Chest')).toBe(true);
    expect(attachments.has('Hips')).toBe(true);
    expect(attachments.has('LeftHand')).toBe(true);
    expect(attachments.has('LeftForeArm')).toBe(true);

    const headMeshes = attachments.get('Head')!;
    expect(headMeshes.some((m) => m.name === 'Costume_Hood')).toBe(true);
    expect(headMeshes.some((m) => m.name === 'Costume_Hair_Crown')).toBe(true);
    expect(headMeshes.some((m) => m.name === 'Costume_Circlet')).toBe(true);
    expect(headMeshes.some((m) => m.name === 'Costume_Face_Nose')).toBe(true);

    const chestMeshes = attachments.get('Chest')!;
    expect(chestMeshes.some((m) => m.name === 'Equipment_Quiver')).toBe(true);
    expect(chestMeshes.some((m) => m.name === 'Costume_NeckScarf')).toBe(true);

    const handMeshes = attachments.get('LeftHand')!;
    expect(handMeshes.some((m) => m.name === 'Equipment_RecurveBow')).toBe(true);

    expect(attachments.has('LeftLeg')).toBe(true);
    expect(attachments.has('RightLeg')).toBe(true);
  });

  it('mounts costume, hair, and equipment onto the skinned humanoid rig bones with clean PBR materials', async () => {
    const rig = await loadMannequinModel({ height: 5.06 });
    const features = createDefaultCharacterFeatures({
      name: 'Elven Scout Archer',
      costume: { hasHood: true, hasBelt: true },
      equipment: { hasBow: true, hasQuiver: true },
    });

    dressAndTextureHumanoidRig(rig, features);

    const headBone = rig.bones.get('Head')!;
    expect(headBone.children.length).toBeGreaterThan(0);
    expect(headBone.children.some((c) => c.name === 'Costume_Hair_Crown')).toBe(true);
    expect(headBone.children.some((c) => c.name === 'Costume_Face_Nose')).toBe(true);

    const chestBone = rig.bones.get('Chest')!;
    expect(chestBone.children.some((c) => c.name === 'Equipment_Quiver')).toBe(true);
    expect(chestBone.children.some((c) => c.name === 'Costume_NeckScarf')).toBe(true);

    const handBone = rig.bones.get('LeftHand')!;
    expect(handBone.children.some((c) => c.name === 'Equipment_RecurveBow')).toBe(true);

    // Verify skinned mesh has clean PBR material without photographic map decal
    let bodyMeshFound = false;
    rig.root.traverse((c) => {
      if ((c as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = c as THREE.SkinnedMesh;
        if (!/_Joints$/i.test(sm.name)) {
          bodyMeshFound = true;
          const mat = sm.material as THREE.MeshStandardMaterial;
          expect(mat.map).toBeNull();
          expect(mat.roughness).toBe(0.64);
        }
      }
    });
    expect(bodyMeshFound).toBe(true);

    // Verify bone rotation moves attached equipment
    rig.root.updateMatrixWorld(true);
    const bow = handBone.children.find((c) => c.name === 'Equipment_RecurveBow')!;
    const initialPos = new THREE.Vector3();
    bow.getWorldPosition(initialPos);

    handBone.rotation.x += 0.5;
    rig.root.updateMatrixWorld(true);
    const rotatedPos = new THREE.Vector3();
    bow.getWorldPosition(rotatedPos);

    expect(rotatedPos.distanceTo(initialPos)).toBeGreaterThan(0.001);
  });

  it('generates fully dressed and textured character rig from concept image data', async () => {
    const rig = await loadMannequinModel({ height: 5.06 });
    const features = createDefaultCharacterFeatures({ name: 'Archer Scout' });
    dressAndTextureHumanoidRig(rig, features);

    expect(rig.root.userData.characterFeatures).toBeDefined();
    expect(rig.root.name).toBe('ProceduralMannequinRoot');
  });

  it('selectively dresses humanoid rig with a 3D hat when prompt says wearing a hat without replacing the FBX body', async () => {
    const rig = await loadMannequinModel({ height: 5.06 });
    const features = extractCharacterFeaturesFromModelOutput({}, 'Character 1 (Stage Left) wearing a hat');

    expect(features.costume.selectiveMode).toBe(true);
    expect(features.costume.hasHat).toBe(true);
    expect(features.equipment.hasBow).toBe(false);
    expect(hasRequestedCharacterAccessories(features)).toBe(true);

    dressAndTextureHumanoidRig(rig, features);
    rig.root.updateMatrixWorld(true);

    const headBone = rig.bones.get('Head')!;
    const hat = headBone.children.find((c) => c.name === 'Costume_Hat');
    expect(hat).toBeDefined();

    // Verify hat world bounding box is properly scaled on the 5.06-unit FBX head (width > 0.8 stage units, top > 4.7)
    const hatBox = new THREE.Box3().setFromObject(hat!);
    const hatSize = hatBox.getSize(new THREE.Vector3());
    expect(hatSize.x).toBeGreaterThan(0.8);
    expect(hatBox.max.y).toBeGreaterThan(4.7);
  });
});
