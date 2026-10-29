import * as THREE from 'three';

export const GREYBOX_KINDS = ['cube', 'box', 'sphere', 'capsule', 'cylinder', 'cone', 'plane'] as const;
export type GreyboxKind = typeof GREYBOX_KINDS[number];

export const DEFAULT_GREYBOX_COLOR = 0x808588; // Matte film greybox neutral

export function isGreyboxPrimitiveKind(kind?: string): boolean {
  if (!kind) return false;
  const k = kind.toLowerCase().trim();
  return GREYBOX_KINDS.includes(k as GreyboxKind);
}

export interface GreyboxOptions {
  colorHex?: number;
  width?: number;
  height?: number;
  depth?: number;
  isSelected?: boolean;
}

/**
 * Creates authentic 3D greybox primitives for set & scene blocking.
 * Crucial Previs Principle:
 * Every primitive's base is grounded exactly at y = 0 on the stage deck.
 * Height extends upward into positive Y, matching film previs standards.
 */
export function createGreyboxPrimitiveMesh(
  kind: string,
  options: GreyboxOptions = {}
): THREE.Mesh {
  const k = kind.toLowerCase().trim();
  const color = options.isSelected
    ? 0xf59e0b
    : (options.colorHex ?? DEFAULT_GREYBOX_COLOR);

  const w = options.width ?? 1.0;
  const h = options.height ?? (k === 'plane' ? 0.01 : k === 'capsule' ? 1.4 : 1.0);
  const d = options.depth ?? (k === 'plane' ? 2.0 : 1.0);

  let geometry: THREE.BufferGeometry;
  let posY = h / 2;
  let rotX = 0;

  switch (k) {
    case 'sphere': {
      const radius = w * 0.5;
      geometry = new THREE.SphereGeometry(radius, 28, 18);
      posY = radius;
      break;
    }
    case 'capsule': {
      const radius = w * 0.35;
      const cylinderHeight = Math.max(0.2, h - 2 * radius);
      geometry = new THREE.CapsuleGeometry(radius, cylinderHeight, 6, 18);
      posY = (cylinderHeight + 2 * radius) * 0.5;
      break;
    }
    case 'cylinder': {
      const radius = w * 0.5;
      geometry = new THREE.CylinderGeometry(radius, radius, h, 26);
      posY = h * 0.5;
      break;
    }
    case 'cone': {
      const radius = w * 0.5;
      geometry = new THREE.ConeGeometry(radius, h, 26);
      posY = h * 0.5;
      break;
    }
    case 'plane': {
      geometry = new THREE.PlaneGeometry(w * 2.0, d);
      rotX = -Math.PI / 2;
      posY = 0.005; // Slightly above ground floor to prevent Z-fighting
      break;
    }
    case 'cube':
    case 'box':
    default: {
      geometry = new THREE.BoxGeometry(w, h, d);
      posY = h * 0.5;
      break;
    }
  }

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.08,
    side: k === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, posY, 0);
  if (rotX !== 0) {
    mesh.rotation.x = rotX;
  }

  mesh.castShadow = k !== 'plane';
  mesh.receiveShadow = true;
  mesh.name = `greybox_${k}`;

  return mesh;
}
