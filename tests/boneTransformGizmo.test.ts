import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createHumanoidSkeleton,
  JOINT_DISC_DEFINITIONS,
  createJointDiscMesh,
  createBoneTransformGizmo,
  setGizmoHoveredAxis,
  setJointDiscHovered,
  applyBoneRotationDelta,
  applyBoneTrackballDelta,
  applyBoneTranslationDelta,
  resetBoneToRest,
  exportBonePose,
  applyBonePose,
} from '../src/engine/kinematics';
import { HUMANOID_BONES } from '../src/engine/procedural3D/sculptSpec';

describe('Bone-Level FK Transform Gizmo & Joint Discs', () => {
  it('defines joint discs covering all 19 standard humanoid bones', () => {
    expect(JOINT_DISC_DEFINITIONS.length).toBe(19);

    const definedBones = new Set(JOINT_DISC_DEFINITIONS.map((d) => d.bone));
    for (const boneName of HUMANOID_BONES) {
      expect(definedBones.has(boneName)).toBe(true);
    }
  });

  it('creates clickable joint disc mesh with proper user data and meshes', () => {
    const disc = createJointDiscMesh('Chest', 'Chest', 0x06b6d4, 0.22, 'actor-1');
    expect(disc.name).toContain('Chest');
    expect(disc.userData.isJointDisc).toBe(true);
    expect(disc.userData.boneName).toBe('Chest');
    expect(disc.userData.actorId).toBe('actor-1');

    // Has fill mesh and ring rim
    expect(disc.children.length).toBeGreaterThanOrEqual(2);
    const fill = disc.children.find((c) => c instanceof THREE.Mesh);
    expect(fill).toBeDefined();
    expect(fill?.userData.isJointDisc).toBe(true);
  });

  it('creates 3D transform gizmo with X, Y, Z axes and center trackball', () => {
    const gizmo = createBoneTransformGizmo();
    expect(gizmo.name).toBe('BoneTransformGizmo');

    const xGroup = gizmo.getObjectByName('GizmoAxis_X');
    const yGroup = gizmo.getObjectByName('GizmoAxis_Y');
    const zGroup = gizmo.getObjectByName('GizmoAxis_Z');
    const centerGroup = gizmo.getObjectByName('GizmoAxis_Center');

    expect(xGroup).toBeDefined();
    expect(xGroup?.userData.axis).toBe('x');
    expect(xGroup?.userData.isGizmoHandle).toBe(true);

    expect(yGroup).toBeDefined();
    expect(yGroup?.userData.axis).toBe('y');

    expect(zGroup).toBeDefined();
    expect(zGroup?.userData.axis).toBe('z');

    expect(centerGroup).toBeDefined();
    expect(centerGroup?.userData.axis).toBe('center');
  });

  it('rotates a bone around world/parent axes accurately', () => {
    const rig = createHumanoidSkeleton(5.0);
    const head = rig.bones.get('Head')!;
    const initialQuat = head.quaternion.clone();

    // Rotate Head around X by 30 degrees (0.5236 rad)
    applyBoneRotationDelta(rig, 'Head', 'x', 0.5236);
    expect(head.quaternion.equals(initialQuat)).toBe(false);

    // Resetting bone restores initial quaternion
    resetBoneToRest(rig, 'Head');
    expect(head.quaternion.angleTo(initialQuat)).toBeLessThan(1e-4);
  });

  it('applies camera-relative trackball rotation to a bone', () => {
    const rig = createHumanoidSkeleton(5.0);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 5, 0);
    camera.updateMatrixWorld(true);

    const chest = rig.bones.get('Chest')!;
    const initialQuat = chest.quaternion.clone();

    applyBoneTrackballDelta(rig, 'Chest', camera, 15, 10, 0.01);
    expect(chest.quaternion.equals(initialQuat)).toBe(false);
  });

  it('translates Hips root and exports serialized pose cleanly', () => {
    const rig = createHumanoidSkeleton(5.0);
    const hips = rig.bones.get('Hips')!;
    const initY = hips.position.y;

    applyBoneTranslationDelta(rig, 'Hips', 'y', -0.5); // Crouch down
    expect(hips.position.y).toBeCloseTo(initY - 0.5, 4);

    const pose = exportBonePose(rig);
    expect(pose.hipsOffset).toBeDefined();
    expect(pose.hipsOffset![1]).toBeCloseTo(-0.5, 3);
  });

  it('preserves rotated bone quaternion when exporting and reapplying pose', () => {
    const rig1 = createHumanoidSkeleton(5.0);
    const rightArm = rig1.bones.get('RightArm')!;

    // Rotate arm outward and forward
    applyBoneRotationDelta(rig1, 'RightArm', 'y', 0.85);
    applyBoneRotationDelta(rig1, 'RightArm', 'z', -0.45);

    const savedPose = exportBonePose(rig1);
    expect(savedPose.rotations['RightArm']).toBeDefined();

    // Instantiate a second fresh rig and apply the saved pose
    const rig2 = createHumanoidSkeleton(5.0);
    applyBonePose(rig2, savedPose);

    const restoredArm = rig2.bones.get('RightArm')!;
    expect(restoredArm.quaternion.x).toBeCloseTo(rightArm.quaternion.x, 4);
    expect(restoredArm.quaternion.y).toBeCloseTo(rightArm.quaternion.y, 4);
    expect(restoredArm.quaternion.z).toBeCloseTo(rightArm.quaternion.z, 4);
    expect(restoredArm.quaternion.w).toBeCloseTo(rightArm.quaternion.w, 4);
  });
  it('includes generous invisible picking volumes for all gizmo handles', () => {
    const gizmo = createBoneTransformGizmo();
    const xGroup = gizmo.getObjectByName('GizmoAxis_X')!;
    const yGroup = gizmo.getObjectByName('GizmoAxis_Y')!;
    const zGroup = gizmo.getObjectByName('GizmoAxis_Z')!;
    const centerGroup = gizmo.getObjectByName('GizmoAxis_Center')!;

    // Find the invisible hit meshes
    const xHit = xGroup.children.find((c) => (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).colorWrite === false);
    const yHit = yGroup.children.find((c) => (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).colorWrite === false);
    const zHit = zGroup.children.find((c) => (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).colorWrite === false);
    const centerHit = centerGroup.children.find((c) => (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).colorWrite === false);

    expect(xHit).toBeDefined();
    expect(xHit?.userData.isGizmoHandle).toBe(true);
    expect(xHit?.userData.axis).toBe('x');

    expect(yHit).toBeDefined();
    expect(yHit?.userData.isGizmoHandle).toBe(true);
    expect(yHit?.userData.axis).toBe('y');

    expect(zHit).toBeDefined();
    expect(zHit?.userData.isGizmoHandle).toBe(true);
    expect(zHit?.userData.axis).toBe('z');

    expect(centerHit).toBeDefined();
    expect(centerHit?.userData.isGizmoHandle).toBe(true);
    expect(centerHit?.userData.axis).toBe('center');
  });

  it('toggles hover and active highlighting with emissive intensity boosts', () => {
    const gizmo = createBoneTransformGizmo();
    const xMat = gizmo.userData.materials.x as THREE.MeshStandardMaterial;
    const yMat = gizmo.userData.materials.y as THREE.MeshStandardMaterial;
    const xGroup = gizmo.userData.groups.x as THREE.Group;

    // Hover on X axis
    setGizmoHoveredAxis(gizmo, 'x', null);
    expect(xMat.emissiveIntensity).toBeGreaterThan(2.0);
    expect(xGroup.scale.x).toBeGreaterThan(1.1);
    // Inactive Y axis dims for contrast
    expect(yMat.emissiveIntensity).toBeLessThan(0.3);

    // Active drag on X axis
    setGizmoHoveredAxis(gizmo, 'x', 'x');
    expect(xMat.emissiveIntensity).toBeGreaterThanOrEqual(3.0);
    expect(xGroup.scale.x).toBeGreaterThan(1.2);

    // Reset to idle
    setGizmoHoveredAxis(gizmo, null, null);
    expect(xMat.emissiveIntensity).toBeCloseTo(0.55, 1);
    expect(xGroup.scale.x).toBe(1.0);
    expect(yMat.emissiveIntensity).toBeCloseTo(0.55, 1);
  });

  it('toggles hover highlight ring on joint discs', () => {
    const disc = createJointDiscMesh('LeftForeArm', 'Left Forearm', 0x3d8bff, 0.14, 'actor-1');
    const hoverRing = disc.getObjectByName('HoverHighlightRing');
    expect(hoverRing).toBeDefined();
    expect(hoverRing?.visible).toBe(false);

    setJointDiscHovered(disc, true);
    expect(hoverRing?.visible).toBe(true);

    setJointDiscHovered(disc, false);
    expect(hoverRing?.visible).toBe(false);
  });

  it('allows raycasting from camera directly onto Red X, Green Y, Blue Z arrow tips', () => {
    const gizmo = createBoneTransformGizmo();
    const stageCamera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000);
    stageCamera.position.set(22, 28, 42);
    stageCamera.lookAt(0, 6, 0);
    stageCamera.updateMatrixWorld(true);

    gizmo.position.set(0, 6, 0);
    const camDist = stageCamera.position.distanceTo(gizmo.position);
    const gizmoScale = THREE.MathUtils.clamp(camDist * 0.024, 0.40, 0.95);
    gizmo.scale.setScalar(gizmoScale);
    gizmo.updateMatrixWorld(true);

    ['x', 'y', 'z'].forEach((axis) => {
      const groupName = `GizmoAxis_${axis.toUpperCase()}`;
      const group = gizmo.getObjectByName(groupName)!;
      const cone = group.children.find((c) => (c as THREE.Mesh).geometry?.type === 'ConeGeometry')!;
      
      const worldPos = new THREE.Vector3();
      cone.getWorldPosition(worldPos);

      const ndc = worldPos.clone().project(stageCamera);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), stageCamera);

      const hits = raycaster.intersectObjects(gizmo.children, true);
      expect(hits.length).toBeGreaterThan(0);

      // Verify the closest hit belongs to the expected axis
      let hitAxis: string | undefined;
      let cur: THREE.Object3D | null = hits[0].object;
      while (cur) {
        if (cur.userData?.axis) {
          hitAxis = cur.userData.axis;
          break;
        }
        cur = cur.parent;
      }
      expect(hitAxis).toBe(axis);
    });
  });
});

