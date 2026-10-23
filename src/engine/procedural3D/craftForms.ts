import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const TAU = Math.PI * 2;

export interface ProceduralPalette {
  wood: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  cream: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  glowCyan: THREE.MeshBasicMaterial;
  glowOrange: THREE.MeshBasicMaterial;
  primary?: THREE.Material;
  trim?: THREE.Material;
}

/**
 * Creates an in-memory procedural canvas texture with subtle micro-grain for PBR bump maps.
 * Zero external asset downloads needed; executes in <2ms.
 */
export function createProceduralGrainTexture(kind: 'wood' | 'stone' | 'metal' | 'fabric' = 'wood'): THREE.CanvasTexture {
  const size = 256;
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))) {
    const dummyCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : ({} as HTMLCanvasElement);
    return new THREE.CanvasTexture(dummyCanvas);
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }

  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 0, size, size);

  const strokes = kind === 'wood' ? 450 : kind === 'stone' ? 350 : 250;
  for (let i = 0; i < strokes; i++) {
    const val = 100 + ((i * 47) % 75);
    ctx.strokeStyle = `rgb(${val},${val},${val})`;
    ctx.lineWidth = kind === 'wood' ? 0.6 : 1.2;
    ctx.beginPath();
    const a = (i * 73) % size;
    const b = (i * 131) % size;
    ctx.moveTo(a, b);
    if (kind === 'wood') {
      ctx.lineTo(a + 2, b + 32);
    } else {
      ctx.lineTo(a + (i % 5) - 2, b + (i % 5) - 2);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

// Cached textures
let cachedWoodBump: THREE.CanvasTexture | null = null;
let cachedStoneBump: THREE.CanvasTexture | null = null;

export function getWoodBumpTexture(): THREE.CanvasTexture {
  if (!cachedWoodBump) cachedWoodBump = createProceduralGrainTexture('wood');
  return cachedWoodBump;
}

export function getStoneBumpTexture(): THREE.CanvasTexture {
  if (!cachedStoneBump) cachedStoneBump = createProceduralGrainTexture('stone');
  return cachedStoneBump;
}

/**
 * Standard PBR material helper
 */
export function createMaterial(
  color: string | number,
  roughness = 0.55,
  metalness = 0,
  flatShading = false
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: typeof color === 'string' ? color : color,
    roughness,
    metalness,
    flatShading,
  });
}

/**
 * Curated PBR material palette for cinematic models
 */
export function createStandardPalette(accentColor?: number): ProceduralPalette {
  const wood = createMaterial('#69432d', 0.76, 0.05);
  wood.bumpMap = getWoodBumpTexture();
  wood.bumpScale = 0.02;

  const stone = createMaterial('#87958c', 0.85, 0.02);
  stone.bumpMap = getStoneBumpTexture();
  stone.bumpScale = 0.015;

  const cream = createMaterial('#dbc9a8', 0.78, 0.0);
  const roof = createMaterial('#345b60', 0.49, 0.28);
  const gold = createMaterial('#bb9256', 0.32, 0.75);
  const iron = createMaterial('#263439', 0.4, 0.8);
  const leaf = createMaterial('#4d7c4d', 0.82, 0.0);

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x679599,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    clearcoat: 0.8,
  });

  const glowCyan = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const glowOrange = new THREE.MeshBasicMaterial({ color: 0xf97316 });

  return {
    wood,
    stone,
    cream,
    roof,
    gold,
    iron,
    leaf,
    glass,
    glowCyan,
    glowOrange,
    primary: accentColor ? createMaterial(accentColor, 0.45, 0.2) : undefined,
  };
}

/**
 * Adds an object to parent with proper shadows and transform
 */
export function addPart(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  position: [number, number, number] = [0, 0, 0],
  scale?: [number, number, number],
  castShadow = true,
  receiveShadow = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);
  return mesh;
}

/**
 * Chamfered/Bevelled Box with RoundedBoxGeometry
 */
export function addBox(
  parent: THREE.Object3D,
  material: THREE.Material | THREE.Material[],
  position: [number, number, number],
  dimensions: [number, number, number],
  bevelRadius = 0.04,
  castShadow = true
): THREE.Mesh {
  const [w, h, d] = dimensions;
  const maxBevel = Math.min(w, h, d) * 0.2;
  const radius = Math.max(0.005, Math.min(bevelRadius, maxBevel));
  const geometry = new RoundedBoxGeometry(w, h, d, 2, radius);
  return addPart(parent, geometry, material, position, undefined, castShadow);
}

/**
 * Bevelled Box using 2D extruded shape with real geometric chamfers
 */
export function bevelledBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevel = 0.03,
  segments = 1
): THREE.BufferGeometry {
  const b = Math.max(0.001, Math.min(bevel, width / 2.05, height / 2.05, depth / 2.05));
  const w = width / 2 - b;
  const h = height / 2 - b;
  const shape = new THREE.Shape();
  shape.moveTo(-w, -h);
  shape.lineTo(w, -h);
  shape.lineTo(w, h);
  shape.lineTo(-w, h);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: 0,
    bevelSegments: segments,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -(depth / 2 - b));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Ellipsoid (Scaled sphere for organic muscles, heads, boulders, fruit)
 */
export function addEll(
  parent: THREE.Object3D,
  material: THREE.Material | THREE.Material[],
  position: [number, number, number],
  scale: [number, number, number],
  castShadow = true
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, 16, 12);
  return addPart(parent, geometry, material, position, scale, castShadow);
}

/**
 * Oriented Rod/Cylinder between Point A and Point B
 * Automatically computes midpoint, direction, and quaternion rotation.
 */
export function addRod(
  parent: THREE.Object3D,
  material: THREE.Material | THREE.Material[],
  pointA: [number, number, number],
  pointB: [number, number, number],
  radius = 0.025,
  radiusBottom = radius,
  castShadow = true
): THREE.Mesh {
  const av = new THREE.Vector3(...pointA);
  const bv = new THREE.Vector3(...pointB);
  const dir = bv.clone().sub(av);
  const length = dir.length();
  const mid = av.clone().add(bv).multiplyScalar(0.5);

  const geometry = new THREE.CylinderGeometry(radius, radiusBottom, Math.max(0.001, length), 12);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(mid);
  if (length > 0.0001) {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Spline Curve Tube along 3D waypoints (using CatmullRomCurve3)
 */
export function addCurve(
  parent: THREE.Object3D,
  material: THREE.Material | THREE.Material[],
  points: ([number, number, number] | THREE.Vector3)[],
  radius = 0.025,
  tubularSegments = 32,
  radialSegments = 8,
  castShadow = true
): THREE.Mesh {
  const vPoints = points.map((p) => (p instanceof THREE.Vector3 ? p : new THREE.Vector3(...p)));
  const curvePath = new THREE.CatmullRomCurve3(vPoints);
  const geometry = new THREE.TubeGeometry(curvePath, tubularSegments, radius, radialSegments, false);
  return addPart(parent, geometry, material, [0, 0, 0], undefined, castShadow);
}

/**
 * Torus Ring
 */
export function addRing(
  parent: THREE.Object3D,
  material: THREE.Material | THREE.Material[],
  position: [number, number, number],
  radius: number,
  tubeRadius = 0.02,
  castShadow = true
): THREE.Mesh {
  const geometry = new THREE.TorusGeometry(radius, tubeRadius, 8, 48);
  return addPart(parent, geometry, material, position, undefined, castShadow);
}

/**
 * Tapered cambered aerodynamic vane or organic feather
 */
export function addFeatherVane(
  parent: THREE.Object3D,
  material: THREE.Material | THREE.Material[],
  position: [number, number, number],
  length: number,
  width: number,
  angleZ = 0
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.rotation.z = angleZ;
  parent.add(group);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 12;

  for (let back = 0; back < 2; back++) {
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const w = width * Math.sin(Math.PI * t) ** 0.65;
      for (const side of [-1, 0, 1]) {
        uvs.push((side + 1) / 2, t);
        positions.push(
          side * w * (side < 0 ? 0.8 : 1),
          -length * t,
          0.02 * Math.sin(Math.PI * t) + (side === 0 ? 0.008 : 0) - back * 0.008
        );
      }
    }
  }

  const stride = (segments + 1) * 3;
  for (let back = 0; back < 2; back++) {
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < 2; j++) {
        const a = back * stride + i * 3 + j;
        const b = a + 1;
        const c = a + 3;
        const d = a + 4;
        indices.push(...(back ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  addPart(group, geometry, material);
  return group;
}
