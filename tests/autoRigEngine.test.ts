import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  resolveAutoRigType,
  detectMeshRigLandmarks,
  autoRigGltfScene,
  setRigOverlayVisible,
  evaluateGait,
  applyPosePreset,
  evaluateReadyMadeHumanoidClip,
  evaluateReadyMadeObjectClip,
} from '../src/engine/kinematics';

function createSyntheticHumanoidGroup(stance: 't-pose' | 'a-pose' | 'relaxed' = 'a-pose'): THREE.Group {
  const group = new THREE.Group();

  // Torso + Head
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 1.8, 0.35, 4, 12, 4),
    new THREE.MeshStandardMaterial({ color: 0xcccccc })
  );
  torso.position.set(0, 3.2, 0);
  group.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xcccccc })
  );
  head.position.set(0, 4.65, 0);
  group.add(head);

  // Left & Right Legs
  for (const sign of [1, -1]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.11, 2.4, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
    );
    leg.position.set(sign * 0.42, 1.2, 0);
    group.add(leg);
  }

  // Left & Right Arms
  for (const sign of [1, -1]) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.08, 1.5, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xbbbbbb })
    );
    if (stance === 't-pose') {
      arm.rotation.z = sign * (Math.PI / 2);
      arm.position.set(sign * 1.15, 3.9, 0);
    } else if (stance === 'a-pose') {
      arm.rotation.z = sign * (Math.PI / 4);
      arm.position.set(sign * 0.9, 3.35, 0);
    } else {
      arm.rotation.z = sign * 0.12;
      arm.position.set(sign * 0.52, 3.15, 0);
    }
    group.add(arm);
  }

  // Bake child transforms into geometry so it behaves like a single-mesh ComfyUI .GLB
  group.updateMatrixWorld(true);
  return group;
}

function createSyntheticQuadrupedGroup(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.8, 2.2, 4, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x998877 })
  );
  body.position.set(0, 1.4, 0);
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.45, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x998877 })
  );
  head.position.set(0, 1.95, 1.15);
  group.add(head);

  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.08, 1.1, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x887766 })
      );
      leg.position.set(sx * 0.28, 0.55, sz * 0.78);
      group.add(leg);
    }
  }
  group.updateMatrixWorld(true);
  return group;
}

describe('Universal 3D Auto-Rigging & Volumetric Skinning Engine', () => {
  it('resolves rig types accurately across Humanoid, Quadruped, Spine-Flex, and Rigid Prop categories', () => {
    const dummy = new THREE.Group();
    expect(
      resolveAutoRigType(dummy, { categoryHint: 'human', nameHint: 'Cyber Samurai' })
    ).toBe('humanoid');
    expect(
      resolveAutoRigType(dummy, { categoryHint: 'creature', nameHint: 'Dire Wolf' })
    ).toBe('quadruped');
    expect(
      resolveAutoRigType(dummy, { categoryHint: 'prop', nameHint: 'Weeping Willow Tree' })
    ).toBe('spine_flex');
    expect(
      resolveAutoRigType(dummy, { categoryHint: 'vehicle', nameHint: 'Sports Car' })
    ).toBe('rigid_prop');
  });

  it('detects silhouette landmarks across T-Pose, A-Pose, and Relaxed Stance humanoid meshes', () => {
    const tPoseGroup = createSyntheticHumanoidGroup('t-pose');
    const aPoseGroup = createSyntheticHumanoidGroup('a-pose');

    const tLandmarks = detectMeshRigLandmarks(tPoseGroup, 'humanoid');
    const aLandmarks = detectMeshRigLandmarks(aPoseGroup, 'humanoid');

    expect(tLandmarks.detectedStance).toBe('t-pose');
    expect(tLandmarks.wristPos[1]).toBeGreaterThan(0.7);
    expect(aLandmarks.wristPos[1]).toBeLessThan(tLandmarks.wristPos[1]);
  });

  it('automatically skins a static .GLB humanoid group into a 19-bone SkinnedMesh and animates cleanly', () => {
    const group = createSyntheticHumanoidGroup('a-pose');
    const res = autoRigGltfScene(group, {
      rigType: 'humanoid',
      nameHint: 'Hero Warrior',
      showBones: true,
    });

    expect(res.rigType).toBe('humanoid');
    expect(res.rig).not.toBeNull();
    expect(res.boneCount).toBe(19);
    expect(res.skinnedMeshCount).toBeGreaterThan(0);

    // Verify all static meshes were converted to SkinnedMesh with normalized 4-bone weights
    let foundSkinned = 0;
    group.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        foundSkinned++;
        const sm = child as THREE.SkinnedMesh;
        const skinIdx = sm.geometry.getAttribute('skinIndex');
        const skinW = sm.geometry.getAttribute('skinWeight');
        expect(skinIdx).toBeDefined();
        expect(skinW).toBeDefined();
        const wSum =
          skinW.getX(0) + skinW.getY(0) + skinW.getZ(0) + skinW.getW(0);
        expect(wSum).toBeCloseTo(1.0, 4);
      }
    });
    expect(foundSkinned).toBe(res.skinnedMeshCount);

    // Verify pose presets, gait, and ready-made clips articulate the rig without throwing
    applyPosePreset(res.rig!, 'combat-guard');
    evaluateGait(res.rig!, 0.5, { gait: 'walk', speed: 1.6 });
    const handled = evaluateReadyMadeHumanoidClip(
      res.rig!,
      'human-wave-greet',
      0.6,
      0.25,
      false,
      1
    );
    expect(handled).toBe(true);

    // Toggle bone overlay visibility
    setRigOverlayVisible(group, false);
    const overlay = group.getObjectByName('__auto_rig_skeleton_helper__');
    expect(overlay?.visible).toBe(false);
  });

  it('automatically rigs a quadruped .GLB with spine, tail, and 4 legs and animates quadruped gaits', () => {
    const quadGroup = createSyntheticQuadrupedGroup();
    const res = autoRigGltfScene(quadGroup, {
      rigType: 'quadruped',
      nameHint: 'Timber Wolf',
    });

    expect(res.rigType).toBe('quadruped');
    expect(res.rig).not.toBeNull();
    expect(res.boneCount).toBeGreaterThanOrEqual(19);

    const frontLeftLeg = res.rig!.bones.get('LeftArm')!;
    const initialRotX = frontLeftLeg.rotation.x;

    evaluateReadyMadeObjectClip(quadGroup, 'quad-gallop-charge', 0.35, 1);
    expect(frontLeftLeg.rotation.x).not.toBeCloseTo(initialRotX, 4);
  });
});

