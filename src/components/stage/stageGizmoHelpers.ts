import * as THREE from 'three';
import { setLayerRecursively } from '../../engine/staging/environmentBuilder';

/**
 * Cleanly disposes of a Three.js Object3D hierarchy, its geometries and materials
 */
export function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => {
          Object.keys(m).forEach((prop) => {
            const val = (m as any)[prop];
            if (val && typeof val === 'object' && typeof val.dispose === 'function') {
              val.dispose();
            }
          });
          m.dispose();
        });
      } else if (mesh.material) {
        Object.keys(mesh.material).forEach((prop) => {
          const val = (mesh.material as any)[prop];
          if (val && typeof val === 'object' && typeof val.dispose === 'function') {
            val.dispose();
          }
        });
        mesh.material.dispose();
      }
    }
  });
}

/**
 * Creates a compact billboard sprite banner displaying the subject/actor name and badge
 */
export function createSpriteBanner(
  name: string,
  subtitleBadge?: string,
  isGhostWireframe: boolean = false,
  visible: boolean = true,
  colorHex?: number
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Sleek, compact pill container with clean border
    ctx.fillStyle = isGhostWireframe ? 'rgba(6, 182, 212, 0.3)' : 'rgba(9, 11, 17, 0.88)';
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(6, 6, 372, 84, 18);
    } else {
      ctx.rect(6, 6, 372, 84);
    }
    ctx.fill();
    ctx.lineWidth = 2.5;
    const hexColorStr =
      typeof colorHex === 'number' && !Number.isNaN(colorHex)
        ? `#${colorHex.toString(16).padStart(6, '0')}`
        : undefined;
    ctx.strokeStyle = isGhostWireframe ? '#06b6d4' : hexColorStr || 'rgba(245, 158, 11, 0.85)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const displayName = name.length > 18 ? name.slice(0, 16).toUpperCase() + '…' : name.toUpperCase();

    if (subtitleBadge) {
      // Main title (sleek, high readability)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(displayName, 192, 34);

      // Subtitle badge
      ctx.fillStyle = isGhostWireframe ? '#22d3ee' : hexColorStr || '#10b981';
      ctx.font = '600 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
      ctx.fillText(subtitleBadge.toUpperCase(), 192, 66);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(displayName, 192, 48);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(spriteMat);
  // Compact, proportional size: 1.4m wide x 0.35m tall
  sprite.scale.set(1.4, 0.35, 1);
  sprite.layers.set(1); // Editor Gizmo Layer (hidden in Viewfinder / Previs render)
  sprite.visible = visible;
  return sprite;
}

/**
 * Creates a ground selection ring on the floor beneath a selected actor
 */
export function createBaseRing(
  radius: number,
  colorHex: number,
  isGhostWireframe: boolean = false,
  isSelected: boolean = false,
  actorId?: string
): THREE.Group {
  const group = new THREE.Group();
  group.name = '__base_ring_group__';
  group.visible = Boolean(isSelected || isGhostWireframe);

  const ringColor = isGhostWireframe ? 0x06b6d4 : (colorHex || 0xf59e0b);
  const clampedRadius = Math.min(radius, 1.35);

  const ringThickness = 0.10;
  const ringGeo = new THREE.RingGeometry(Math.max(0.1, clampedRadius - ringThickness), clampedRadius, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: ringColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: isSelected ? 0.85 : 0.25,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.name = '__base_ring_mesh__';
  ringMesh.position.y = 0.04;
  ringMesh.layers.set(1); // Editor Gizmo Layer (hidden in Viewfinder / Previs render)
  // Decorative floor ring must NEVER intercept raycaster clicks around the character!
  ringMesh.raycast = () => {};
  ringMesh.userData = { isBaseRing: true, isHelper: true, actorId };
  group.userData = { isBaseRing: true, isHelper: true, actorId };
  group.add(ringMesh);

  return group;
}

/**
 * Creates a sleek 3D IK Handle Gizmo for posing humanoid limbs and head
 */
export function createIKHandleGizmo(
  handleType: 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'head',
  colorHex: number,
  actorId: string
): THREE.Group {
  const handleGroup = new THREE.Group();
  handleGroup.name = `IKHandle_${handleType}_${actorId}`;
  handleGroup.userData = { isIKHandle: true, handleType, actorId };

  // Compact sleek core sphere (radius ~0.14)
  const coreMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.2,
    metalness: 0.8,
    emissive: colorHex,
    emissiveIntensity: 0.6,
  });
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), coreMat);
  coreMesh.userData = { isIKHandle: true, handleType, actorId };
  handleGroup.add(coreMesh);

  // Subtle outer halo ring (radius ~0.18) for clear visual feedback without clutter
  const haloMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
  });
  const haloMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), haloMat);
  haloMesh.userData = { isIKHandle: true, handleType, actorId };
  handleGroup.add(haloMesh);

  setLayerRecursively(handleGroup, 1);
  return handleGroup;
}

/**
 * Builds a compact, detailed ARRI/RED-style 3D Cinema Camera Rig (~35% of the legacy box size)
 * with matte box, telephoto barrel, dual coaxial top magazines, side OLED monitor, and hit proxy.
 * Placed inside a child group ('CinemaRigModelGroup') at y = 1.5 so user gizmoScale (0.25x - 1.5x)
 * scales the physical rig cleanly around its optical center.
 */
export function buildCompactCinemaCameraRig(): THREE.Group {
  const rigModel = new THREE.Group();
  rigModel.name = 'CinemaRigModelGroup';
  rigModel.position.set(0, 1.5, 0);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0xd4af37,
    emissiveIntensity: 0.14,
    roughness: 0.32,
    metalness: 0.82,
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    emissive: 0xd4af37,
    emissiveIntensity: 0.25,
    roughness: 0.18,
    metalness: 0.9,
  });

  const darkCarbonMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
    metalness: 0.7,
  });

  // 1. Compact Cinema Body (~1.35 x 1.0 x 1.75 — ~35% of legacy 4x3x5 box)
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.0, 1.75), bodyMat);
  camBody.userData.isCamera = true;
  rigModel.add(camBody);

  const camEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.38, 1.03, 1.78)),
    new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9 })
  );
  camEdges.name = 'CameraRigEdges';
  camEdges.raycast = () => {};
  rigModel.add(camEdges);

  // 2. Dual Coaxial Top Magazines / Film Reels
  const reelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 20);
  reelGeo.rotateZ(Math.PI / 2);
  const frontReel = new THREE.Mesh(reelGeo, darkCarbonMat);
  frontReel.position.set(0, 0.66, 0.12);
  frontReel.userData.isCamera = true;
  rigModel.add(frontReel);

  const rearReel = new THREE.Mesh(reelGeo, darkCarbonMat);
  rearReel.position.set(0, 0.66, -0.48);
  rearReel.userData.isCamera = true;
  rigModel.add(rearReel);

  // 3. Top Carry Handle Bar
  const topHandle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.95), goldMat);
  topHandle.position.set(0, 0.86, -0.18);
  topHandle.userData.isCamera = true;
  rigModel.add(topHandle);

  // 4. Prime Lens Barrel (+Z forward)
  const lensMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.85, 20), goldMat);
  lensMesh.rotation.x = Math.PI / 2;
  lensMesh.position.set(0, 0, 1.22);
  lensMesh.userData.isCamera = true;
  rigModel.add(lensMesh);

  // 5. Cinema Matte Box Sunshade & Front Optical Glass Element
  const matteBox = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.80, 0.36), darkCarbonMat);
  matteBox.position.set(0, 0, 1.72);
  matteBox.userData.isCamera = true;
  rigModel.add(matteBox);

  const matteEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.14, 0.82, 0.38)),
    new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 })
  );
  matteEdges.position.set(0, 0, 1.72);
  matteEdges.name = 'CameraMatteEdges';
  matteEdges.raycast = () => {};
  rigModel.add(matteEdges);

  const glassMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.33, 20),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 })
  );
  glassMesh.position.set(0, 0, 1.91);
  glassMesh.raycast = () => {};
  rigModel.add(glassMesh);

  // 6. Operator Side OLED Viewfinder Monitor (-X side)
  const monitorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.40, 0.58), darkCarbonMat);
  monitorMesh.position.set(-0.82, 0.12, -0.10);
  monitorMesh.rotation.y = -0.25;
  monitorMesh.userData.isCamera = true;
  rigModel.add(monitorMesh);

  // 7. Invisible Grab Hit Proxy around the compact rig
  const camHitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 2.1, 3.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  camHitProxy.position.set(0, 0.1, 0.4);
  camHitProxy.name = '__camera_hit_proxy__';
  camHitProxy.userData = { isCamera: true };
  rigModel.add(camHitProxy);

  return rigModel;
}
