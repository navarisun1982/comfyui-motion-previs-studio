/**
 * Bone-Level Forward Kinematics (FK) Transform Gizmo & Clickable Joint Discs
 * 
 * Provides:
 * 1. Semi-transparent holographic clickable joint discs for all 19 standard humanoid bones
 * 2. 3D 3-axis transform gizmo (Red X, Green Y, Blue Z with stepped conical heads + Center Trackball Sphere)
 * 3. High-precision world/camera and local-space bone quaternion rotation
 * 4. Hips root translation delta and individual joint rest-pose reset
 */

import * as THREE from 'three';
import { HumanoidRig } from './skeletonHierarchy';
import { HumanoidBone } from '../procedural3D/sculptSpec';

export interface JointDiscDefinition {
  bone: HumanoidBone;
  label: string;
  color: number;
  radius: number;
  group: 'head' | 'torso' | 'arm' | 'leg';
}

/**
 * Anatomical joint placement and visual hierarchy for humanoid mannequin posing.
 * Grounded in the Anatomical Handle Palette:
 * - Pelvis (Hips): Amber (#ffb21e)
 * - Torso (Chest, Spine): Green (#2fd66b)
 * - Head / Neck: Purple (#a37bff)
 * - Left Arm: Sky Blue (#3d8bff)
 * - Left Leg: Cyan / Teal (#14c8e6)
 * - Right Arm: Coral Red (#ff4d6a)
 * - Right Leg: Vivid Magenta (#e44dff)
 */
export const JOINT_DISC_DEFINITIONS: JointDiscDefinition[] = [
  // Head & Neck
  { bone: 'Head', label: 'Head', color: 0xa37bff, radius: 0.18, group: 'head' },
  { bone: 'Neck', label: 'Neck', color: 0x2fd66b, radius: 0.14, group: 'head' },

  // Torso / Core
  { bone: 'Chest', label: 'Chest', color: 0x2fd66b, radius: 0.22, group: 'torso' },
  { bone: 'Spine', label: 'Spine / Abdomen', color: 0x2fd66b, radius: 0.19, group: 'torso' },
  { bone: 'Hips', label: 'Hips / Pelvis', color: 0xffb21e, radius: 0.22, group: 'torso' },

  // Left Arm (Cool palette: Sky Blue)
  { bone: 'LeftShoulder', label: 'Left Shoulder', color: 0x3d8bff, radius: 0.14, group: 'arm' },
  { bone: 'LeftArm', label: 'Left Upper Arm', color: 0x3d8bff, radius: 0.14, group: 'arm' },
  { bone: 'LeftForeArm', label: 'Left Forearm (Elbow)', color: 0x3d8bff, radius: 0.14, group: 'arm' },
  { bone: 'LeftHand', label: 'Left Hand (Wrist)', color: 0x3d8bff, radius: 0.13, group: 'arm' },

  // Right Arm (Warm palette: Coral Red)
  { bone: 'RightShoulder', label: 'Right Shoulder', color: 0xff4d6a, radius: 0.14, group: 'arm' },
  { bone: 'RightArm', label: 'Right Upper Arm', color: 0xff4d6a, radius: 0.14, group: 'arm' },
  { bone: 'RightForeArm', label: 'Right Forearm (Elbow)', color: 0xff4d6a, radius: 0.14, group: 'arm' },
  { bone: 'RightHand', label: 'Right Hand (Wrist)', color: 0xff4d6a, radius: 0.13, group: 'arm' },

  // Left Leg (Cool palette: Electric Teal / Cyan)
  { bone: 'LeftUpLeg', label: 'Left Thigh (Hip)', color: 0x14c8e6, radius: 0.17, group: 'leg' },
  { bone: 'LeftLeg', label: 'Left Shin (Knee)', color: 0x14c8e6, radius: 0.15, group: 'leg' },
  { bone: 'LeftFoot', label: 'Left Foot (Ankle)', color: 0x14c8e6, radius: 0.15, group: 'leg' },

  // Right Leg (Warm palette: Vivid Magenta)
  { bone: 'RightUpLeg', label: 'Right Thigh (Hip)', color: 0xe44dff, radius: 0.17, group: 'leg' },
  { bone: 'RightLeg', label: 'Right Shin (Knee)', color: 0xe44dff, radius: 0.15, group: 'leg' },
  { bone: 'RightFoot', label: 'Right Foot (Ankle)', color: 0xe44dff, radius: 0.15, group: 'leg' },
];

/**
 * Creates a floating translucent holographic joint disc & 3D sphere for picking bones in 3D.
 */
export function createJointDiscMesh(
  boneName: HumanoidBone,
  label: string,
  colorHex: number,
  radius: number,
  actorId: string
): THREE.Group {
  const group = new THREE.Group();
  group.name = `JointDisc_${boneName}_${actorId}`;
  group.userData = { isJointDisc: true, boneName, label, colorHex, actorId };

  // 0. Compact, non-overlapping pick volume sphere for effortless raycast grabbing in 3D
  const hitGeo = new THREE.SphereGeometry(Math.max(radius * 1.35, 0.28), 14, 10);
  const hitMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.name = 'JointHitVolume';
  hitMesh.renderOrder = 997;
  hitMesh.userData = { isJointDisc: true, boneName, label, colorHex, actorId };
  group.add(hitMesh);

  // 1. Inner soft 3D spherical core (visible from all camera angles inside the mesh)
  const sphereGeo = new THREE.SphereGeometry(radius * 0.55, 16, 12);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    toneMapped: false,
  });
  const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
  sphereMesh.renderOrder = 998;
  sphereMesh.userData = { isJointDisc: true, boneName, label, colorHex, actorId };
  group.add(sphereMesh);

  // 2. Camera-facing planar fill disc
  const fillMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthTest: false,
    toneMapped: false,
  });
  const fillMesh = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.75, 24), fillMat);
  fillMesh.renderOrder = 998;
  fillMesh.userData = { isJointDisc: true, boneName, label, colorHex, actorId };
  group.add(fillMesh);

  // 3. Outer glowing ring rim
  const ringMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthTest: false,
    toneMapped: false,
  });
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 32), ringMat);
  ringMesh.renderOrder = 999;
  ringMesh.userData = { isJointDisc: true, boneName, label, colorHex, actorId };
  group.add(ringMesh);

  // 4. Active highlight ring (shown when joint is currently selected)
  const activeRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8, // Cyan selection accent
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthTest: false,
    toneMapped: false,
  });
  const activeRingMesh = new THREE.Mesh(new THREE.RingGeometry(radius * 1.05, radius * 1.25, 32), activeRingMat);
  activeRingMesh.name = 'ActiveHighlightRing';
  activeRingMesh.renderOrder = 1000;
  activeRingMesh.visible = false;
  activeRingMesh.userData = { isJointDisc: true, boneName, label, colorHex, actorId };
  group.add(activeRingMesh);

  // 5. Hover highlight ring (shown when mouse hovers over this joint)
  const hoverRingMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthTest: false,
    toneMapped: false,
  });
  const hoverRingMesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.95, radius * 1.35, 32), hoverRingMat);
  hoverRingMesh.name = 'HoverHighlightRing';
  hoverRingMesh.renderOrder = 1001;
  hoverRingMesh.visible = false;
  hoverRingMesh.userData = { isJointDisc: true, boneName, label, colorHex, actorId };
  group.add(hoverRingMesh);

  return group;
}

/**
 * Builds the 3D 3-Axis Transform / Rotation Gizmo centered on an active bone.
 * Features:
 * - Red X Axis (#ff6b5e, Shaft + Conical Arrowhead + Wireframe Cuff)
 * - Green Y Axis (#7ee07a, Shaft + Conical Arrowhead + Wireframe Cuff)
 * - Blue Z Axis (#5c9dff, Shaft + Conical Arrowhead + Wireframe Cuff)
 * - Translucent Cyan Center Sphere with wireframe halo for free trackball rotation
 */
/**
 * Toggles hover state visual highlighting on a joint disc.
 */
export function setJointDiscHovered(discGroup: THREE.Object3D | null | undefined, isHovered: boolean): void {
  if (!discGroup) return;
  const hoverRing = discGroup.getObjectByName('HoverHighlightRing');
  if (hoverRing) {
    hoverRing.visible = isHovered;
  }
}

export type GizmoAxisType = 'x' | 'y' | 'z' | 'center';

export function createBoneTransformGizmo(): THREE.Group {
  const gizmo = new THREE.Group();
  gizmo.name = 'BoneTransformGizmo';

  // Sleek, compact dimensions (proportional to humanoid anatomy, never overlaps adjacent joints)
  const shaftRadius = 0.016;
  const shaftLength = 0.40;
  const coneRadius = 0.065;
  const coneHeight = 0.16;
  const collarRadius = 0.040;
  const collarHeight = 0.025;
  const hitRadius = 0.080;
  const hitLength = shaftLength + coneHeight;

  // 1. Red X Axis (#ff6b5e)
  const xGroup = new THREE.Group();
  xGroup.name = 'GizmoAxis_X';
  xGroup.userData = { isGizmoHandle: true, axis: 'x' };

  const xMat = new THREE.MeshStandardMaterial({
    color: 0xff6b5e,
    emissive: 0xff6b5e,
    emissiveIntensity: 0.5,
    roughness: 0.25,
    metalness: 0.6,
    depthTest: false,
    toneMapped: false,
  });

  const xShaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 12), xMat);
  xShaft.position.set(shaftLength / 2, 0, 0);
  xShaft.rotation.z = -Math.PI / 2;
  xShaft.renderOrder = 1001;
  xShaft.userData = { isGizmoHandle: true, axis: 'x' };
  xGroup.add(xShaft);

  const xCollar = new THREE.Mesh(new THREE.CylinderGeometry(collarRadius, collarRadius, collarHeight, 16), xMat);
  xCollar.position.set(shaftLength, 0, 0);
  xCollar.rotation.z = -Math.PI / 2;
  xCollar.renderOrder = 1002;
  xCollar.userData = { isGizmoHandle: true, axis: 'x' };
  xGroup.add(xCollar);

  const xCone = new THREE.Mesh(new THREE.ConeGeometry(coneRadius, coneHeight, 16), xMat);
  xCone.position.set(shaftLength + coneHeight / 2, 0, 0);
  xCone.rotation.z = -Math.PI / 2;
  xCone.renderOrder = 1003;
  xCone.userData = { isGizmoHandle: true, axis: 'x' };
  xGroup.add(xCone);

  // Wireframe cuff around X tip (purely visual, disable raycast so lines never hijack hits)
  const xWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.ConeGeometry(coneRadius * 1.35, coneHeight * 1.15, 8)),
    new THREE.LineBasicMaterial({ color: 0xff6b5e, transparent: true, opacity: 0.6, depthTest: false })
  );
  xWire.position.set(shaftLength + coneHeight / 2, 0, 0);
  xWire.rotation.z = -Math.PI / 2;
  xWire.renderOrder = 1004;
  xWire.raycast = () => {};
  xGroup.add(xWire);

  // Invisible generous hit cylinder for X axis
  const xHit = new THREE.Mesh(
    new THREE.CylinderGeometry(hitRadius, hitRadius, hitLength, 10),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthTest: false, depthWrite: false, transparent: true })
  );
  xHit.position.set(hitLength / 2, 0, 0);
  xHit.rotation.z = -Math.PI / 2;
  xHit.renderOrder = 996;
  xHit.userData = { isGizmoHandle: true, axis: 'x' };
  xGroup.add(xHit);

  gizmo.add(xGroup);

  // 2. Green Y Axis (#7ee07a)
  const yGroup = new THREE.Group();
  yGroup.name = 'GizmoAxis_Y';
  yGroup.userData = { isGizmoHandle: true, axis: 'y' };

  const yMat = new THREE.MeshStandardMaterial({
    color: 0x7ee07a,
    emissive: 0x7ee07a,
    emissiveIntensity: 0.5,
    roughness: 0.25,
    metalness: 0.6,
    depthTest: false,
    toneMapped: false,
  });

  const yShaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 12), yMat);
  yShaft.position.set(0, shaftLength / 2, 0);
  yShaft.renderOrder = 1001;
  yShaft.userData = { isGizmoHandle: true, axis: 'y' };
  yGroup.add(yShaft);

  const yCollar = new THREE.Mesh(new THREE.CylinderGeometry(collarRadius, collarRadius, collarHeight, 16), yMat);
  yCollar.position.set(0, shaftLength, 0);
  yCollar.renderOrder = 1002;
  yCollar.userData = { isGizmoHandle: true, axis: 'y' };
  yGroup.add(yCollar);

  const yCone = new THREE.Mesh(new THREE.ConeGeometry(coneRadius, coneHeight, 16), yMat);
  yCone.position.set(0, shaftLength + coneHeight / 2, 0);
  yCone.renderOrder = 1003;
  yCone.userData = { isGizmoHandle: true, axis: 'y' };
  yGroup.add(yCone);

  // Wireframe cuff around Y tip (purely visual, disable raycast so lines never hijack hits)
  const yWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.ConeGeometry(coneRadius * 1.35, coneHeight * 1.15, 8)),
    new THREE.LineBasicMaterial({ color: 0x7ee07a, transparent: true, opacity: 0.6, depthTest: false })
  );
  yWire.position.set(0, shaftLength + coneHeight / 2, 0);
  yWire.renderOrder = 1004;
  yWire.raycast = () => {};
  yGroup.add(yWire);

  // Invisible generous hit cylinder for Y axis
  const yHit = new THREE.Mesh(
    new THREE.CylinderGeometry(hitRadius, hitRadius, hitLength, 10),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthTest: false, depthWrite: false, transparent: true })
  );
  yHit.position.set(0, hitLength / 2, 0);
  yHit.renderOrder = 996;
  yHit.userData = { isGizmoHandle: true, axis: 'y' };
  yGroup.add(yHit);

  gizmo.add(yGroup);

  // 3. Blue Z Axis (#5c9dff)
  const zGroup = new THREE.Group();
  zGroup.name = 'GizmoAxis_Z';
  zGroup.userData = { isGizmoHandle: true, axis: 'z' };

  const zMat = new THREE.MeshStandardMaterial({
    color: 0x5c9dff,
    emissive: 0x5c9dff,
    emissiveIntensity: 0.5,
    roughness: 0.25,
    metalness: 0.6,
    depthTest: false,
    toneMapped: false,
  });

  const zShaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 12), zMat);
  zShaft.position.set(0, 0, shaftLength / 2);
  zShaft.rotation.x = Math.PI / 2;
  zShaft.renderOrder = 1001;
  zShaft.userData = { isGizmoHandle: true, axis: 'z' };
  zGroup.add(zShaft);

  const zCollar = new THREE.Mesh(new THREE.CylinderGeometry(collarRadius, collarRadius, collarHeight, 16), zMat);
  zCollar.position.set(0, 0, shaftLength);
  zCollar.rotation.x = Math.PI / 2;
  zCollar.renderOrder = 1002;
  zCollar.userData = { isGizmoHandle: true, axis: 'z' };
  zGroup.add(zCollar);

  const zCone = new THREE.Mesh(new THREE.ConeGeometry(coneRadius, coneHeight, 16), zMat);

  zCone.position.set(0, 0, shaftLength + coneHeight / 2);
  zCone.rotation.x = Math.PI / 2;
  zCone.renderOrder = 1003;
  zCone.userData = { isGizmoHandle: true, axis: 'z' };
  zGroup.add(zCone);

  // Wireframe cuff around Z tip (purely visual, disable raycast so lines never hijack hits)
  const zWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.ConeGeometry(coneRadius * 1.35, coneHeight * 1.15, 8)),
    new THREE.LineBasicMaterial({ color: 0x5c9dff, transparent: true, opacity: 0.6, depthTest: false })
  );
  zWire.position.set(0, 0, shaftLength + coneHeight / 2);
  zWire.rotation.x = Math.PI / 2;
  zWire.renderOrder = 1004;
  zWire.raycast = () => {};
  zGroup.add(zWire);

  // Invisible generous hit cylinder for Z axis
  const zHit = new THREE.Mesh(
    new THREE.CylinderGeometry(hitRadius, hitRadius, hitLength, 10),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthTest: false, depthWrite: false, transparent: true })
  );
  zHit.position.set(0, 0, hitLength / 2);
  zHit.rotation.x = Math.PI / 2;
  zHit.renderOrder = 996;
  zHit.userData = { isGizmoHandle: true, axis: 'z' };
  zGroup.add(zHit);

  gizmo.add(zGroup);

  // 4. Center Trackball Sphere (Cyan)
  const centerGroup = new THREE.Group();
  centerGroup.name = 'GizmoAxis_Center';
  centerGroup.userData = { isGizmoHandle: true, axis: 'center' };

  const centerMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.55,
    roughness: 0.2,
    metalness: 0.8,
    transparent: true,
    opacity: 0.8,
    depthTest: false,
  });
  const centerSphere = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 14), centerMat);
  centerSphere.renderOrder = 1004;
  centerSphere.userData = { isGizmoHandle: true, axis: 'center' };
  centerGroup.add(centerSphere);

  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
  });
  const haloMesh = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 8), haloMat);
  haloMesh.renderOrder = 1005;
  haloMesh.userData = { isGizmoHandle: true, axis: 'center' };
  haloMesh.raycast = () => {};
  centerGroup.add(haloMesh);

  // Compact hit sphere for Center Trackball (does not bleed into surrounding joints)
  const centerHit = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthTest: false, depthWrite: false, transparent: true })
  );
  centerHit.renderOrder = 996;
  centerHit.userData = { isGizmoHandle: true, axis: 'center' };
  centerGroup.add(centerHit);

  gizmo.add(centerGroup);

  // Store handles and materials for dynamic directional hover & active highlighting
  gizmo.userData = {
    materials: {
      x: xMat,
      y: yMat,
      z: zMat,
      center: centerMat,
      halo: haloMat,
    },
    groups: {
      x: xGroup,
      y: yGroup,
      z: zGroup,
      center: centerGroup,
    },
  };

  return gizmo;
}

/**
 * Rotates a bone around a world axis and converts the transform into bone parent space.
 */
/**
 * Sets dynamic hover and active dragging highlight states on the 3D bone transform gizmo.
 * When hovered, the targeted axis illuminates with high-intensity emissive glow and expands,
 * giving unmistakable visual feedback on which direction will move.
 */
export function setGizmoHoveredAxis(
  gizmo: THREE.Group | null | undefined,
  hoveredAxis: GizmoAxisType | null,
  activeAxis?: GizmoAxisType | null
): void {
  if (!gizmo || !gizmo.userData?.materials || !gizmo.userData?.groups) return;
  const { materials, groups } = gizmo.userData;

  const targetAxis = activeAxis || hoveredAxis;

  const baseConfig: Record<GizmoAxisType, { color: number; emissive: number }> = {
    x: { color: 0xff6b5e, emissive: 0xff6b5e },
    y: { color: 0x7ee07a, emissive: 0x7ee07a },
    z: { color: 0x5c9dff, emissive: 0x5c9dff },
    center: { color: 0x06b6d4, emissive: 0x06b6d4 },
  };

  const highlightConfig: Record<GizmoAxisType, { color: number; emissive: number; intensity: number }> = {
    x: { color: 0xff2200, emissive: 0xff4422, intensity: 2.5 },
    y: { color: 0x10b981, emissive: 0x34d399, intensity: 2.5 },
    z: { color: 0x0284c7, emissive: 0x38bdf8, intensity: 2.5 },
    center: { color: 0x0891b2, emissive: 0x22d3ee, intensity: 2.5 },
  };

  const activeConfig: Record<GizmoAxisType, { color: number; emissive: number; intensity: number }> = {
    x: { color: 0xffd700, emissive: 0xffea00, intensity: 3.2 },
    y: { color: 0xffd700, emissive: 0xffea00, intensity: 3.2 },
    z: { color: 0xffd700, emissive: 0xffea00, intensity: 3.2 },
    center: { color: 0xffd700, emissive: 0xffea00, intensity: 3.2 },
  };

  (['x', 'y', 'z', 'center'] as const).forEach((axis) => {
    const mat = materials[axis] as THREE.MeshStandardMaterial | undefined;
    const grp = groups[axis] as THREE.Group | undefined;
    if (!mat || !grp) return;

    if (activeAxis === axis) {
      // Actively being dragged: brilliant golden glow + scale up
      mat.color.setHex(activeConfig[axis].color);
      mat.emissive.setHex(activeConfig[axis].emissive);
      mat.emissiveIntensity = activeConfig[axis].intensity;
      mat.opacity = 1.0;
      grp.scale.set(1.22, 1.22, 1.22);
    } else if (hoveredAxis === axis) {
      // Hovered: high-contrast directional neon glow
      mat.color.setHex(highlightConfig[axis].color);
      mat.emissive.setHex(highlightConfig[axis].emissive);
      mat.emissiveIntensity = highlightConfig[axis].intensity;
      mat.opacity = 1.0;
      grp.scale.set(1.15, 1.15, 1.15);
    } else if (targetAxis) {
      // Other axes while one is hovered/active: dim slightly for maximum contrast
      mat.color.setHex(baseConfig[axis].color);
      mat.emissive.setHex(baseConfig[axis].emissive);
      mat.emissiveIntensity = 0.2;
      mat.opacity = 0.45;
      grp.scale.set(1.0, 1.0, 1.0);
    } else {
      // Normal idle appearance
      mat.color.setHex(baseConfig[axis].color);
      mat.emissive.setHex(baseConfig[axis].emissive);
      mat.emissiveIntensity = 0.55;
      mat.opacity = axis === 'center' ? 0.8 : 1.0;
      grp.scale.set(1.0, 1.0, 1.0);
    }
  });

  if (materials.halo) {
    if (activeAxis === 'center' || hoveredAxis === 'center') {
      materials.halo.color.setHex(0xffffff);
      materials.halo.opacity = 0.95;
    } else {
      materials.halo.color.setHex(0x38bdf8);
      materials.halo.opacity = 0.55;
    }
  }
}

export function applyBoneRotationDelta(
  rig: HumanoidRig,
  boneName: HumanoidBone,
  axis: 'x' | 'y' | 'z',
  angleRadians: number
): void {
  const bone = rig.bones.get(boneName);
  if (!bone) return;

  const worldAxis =
    axis === 'x'
      ? new THREE.Vector3(1, 0, 0)
      : axis === 'y'
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);

  const parent = bone.parent;
  const parentWorldQuat = new THREE.Quaternion();
  if (parent) {
    parent.updateMatrixWorld(true);
    parent.getWorldQuaternion(parentWorldQuat);
  }
  const invParent = parentWorldQuat.clone().invert();
  const localAxis = worldAxis.clone().applyQuaternion(invParent).normalize();
  const rotDelta = new THREE.Quaternion().setFromAxisAngle(localAxis, angleRadians);

  bone.quaternion.premultiply(rotDelta);
  rig.root.updateMatrixWorld(true);
}

/**
 * Applies a camera-relative spherical trackball rotation to a bone.
 */
export function applyBoneTrackballDelta(
  rig: HumanoidRig,
  boneName: HumanoidBone,
  camera: THREE.Camera,
  deltaScreenX: number,
  deltaScreenY: number,
  sensitivity = 0.008
): void {
  const bone = rig.bones.get(boneName);
  if (!bone) return;

  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  camera.matrixWorld.extractBasis(camRight, camUp, new THREE.Vector3());

  const worldAxis = new THREE.Vector3()
    .addScaledVector(camRight, deltaScreenY)
    .addScaledVector(camUp, deltaScreenX);

  const angle = worldAxis.length() * sensitivity;
  if (angle < 1e-4) return;
  worldAxis.normalize();

  const parent = bone.parent;
  const parentWorldQuat = new THREE.Quaternion();
  if (parent) {
    parent.updateMatrixWorld(true);
    parent.getWorldQuaternion(parentWorldQuat);
  }
  const invParent = parentWorldQuat.clone().invert();
  const localAxis = worldAxis.clone().applyQuaternion(invParent).normalize();
  const rotDelta = new THREE.Quaternion().setFromAxisAngle(localAxis, angle);

  bone.quaternion.premultiply(rotDelta);
  rig.root.updateMatrixWorld(true);
}

/**
 * Translates bone position (used for Hips/pelvis crouch/elevation/shift).
 */
export function applyBoneTranslationDelta(
  rig: HumanoidRig,
  boneName: HumanoidBone,
  axis: 'x' | 'y' | 'z',
  deltaUnits: number
): void {
  const bone = rig.bones.get(boneName);
  if (!bone) return;

  const invScale = 1.0 / (rig.root.scale.y || 1.0);
  const scaledDelta = deltaUnits * invScale;
  if (axis === 'x') bone.position.x += scaledDelta;
  else if (axis === 'y') bone.position.y += scaledDelta;
  else if (axis === 'z') bone.position.z += scaledDelta;

  rig.root.updateMatrixWorld(true);
}

/**
 * Resets a single joint back to its canonical rest rotation.
 */
export function resetBoneToRest(rig: HumanoidRig, boneName: HumanoidBone): void {
  const bone = rig.bones.get(boneName);
  if (!bone) return;

  const restQ = rig.restRotations.get(boneName);
  if (restQ) {
    bone.quaternion.copy(restQ);
  } else {
    bone.quaternion.identity();
  }

  if (boneName === 'Hips') {
    const restPos = rig.restPositions.get('Hips');
    if (restPos) {
      bone.position.copy(restPos);
    }
  }

  rig.root.updateMatrixWorld(true);
}
