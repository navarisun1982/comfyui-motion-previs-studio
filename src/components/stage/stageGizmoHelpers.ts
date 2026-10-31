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
