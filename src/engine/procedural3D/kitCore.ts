import * as THREE from 'three';

/**
 * 3Dviz Pro Max kit-core engine.
 * Unified building blocks: PBR material cache, seeded mulberry32 RNG,
 * geometric chamfered bevels, inset panels, pierced walls, and socket/collider descriptors.
 * Grounded in templates/kits/kit-core.js from the official 3dviz-pro-max specification.
 */

const materials = new Map<string, THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>();

export interface MaterialOptions {
  roughness?: number;
  metalness?: number;
  emissive?: THREE.ColorRepresentation | null;
  emissiveIntensity?: number;
  map?: THREE.Texture | null;
  flatShading?: boolean;
  transmission?: number;
  clearcoat?: number;
  opacity?: number;
  transparent?: boolean;
}

/**
 * Cached MeshStandardMaterial / MeshPhysicalMaterial.
 * Ensures GPU efficiency and palette harmony without redundant shader programs.
 */
export function materialFor(
  color: THREE.ColorRepresentation,
  options: MaterialOptions = {}
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  const {
    roughness = 0.65,
    metalness = 0.0,
    emissive = null,
    emissiveIntensity = 0.0,
    map = null,
    flatShading = false,
    transmission = 0.0,
    clearcoat = 0.0,
    opacity = 1.0,
    transparent = false,
  } = options;

  if (map) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      map,
      flatShading,
      transparent,
      opacity,
    });
  }

  const hexColor = new THREE.Color(color).getHexString();
  const key = `${hexColor}_r${roughness}_m${metalness}_e${emissive ? '1' : '0'}_ei${emissiveIntensity}_t${transmission}_c${clearcoat}_o${opacity}`;

  if (!materials.has(key)) {
    if (transmission > 0) {
      materials.set(
        key,
        new THREE.MeshPhysicalMaterial({
          color,
          roughness,
          metalness,
          transmission,
          clearcoat,
          transparent: true,
          opacity,
          flatShading,
        })
      );
    } else {
      const opts: THREE.MeshStandardMaterialParameters = {
        color,
        roughness,
        metalness,
        flatShading,
        transparent,
        opacity,
      };
      if (emissive) {
        opts.emissive = emissive;
        opts.emissiveIntensity = emissiveIntensity;
      }
      materials.set(key, new THREE.MeshStandardMaterial(opts));
    }
  }

  return materials.get(key)!;
}

/**
 * Deterministic mulberry32 pseudorandom stream.
 * Guarantees identical procedural generation across runs with the same seed.
 */
export function seeded(seed: number): () => number {
  let state = (seed | 0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BevelledBoxOptions {
  width: number;
  height: number;
  depth: number;
  bevel?: number;
  segments?: number;
}

/**
 * Box with a genuine geometric chamfer: bevel is real 3D geometry, not a fake normal map.
 * Extruded along +Z and re-centred on the origin so it drops into meshes without rotation.
 */
export function bevelledBox({
  width,
  height,
  depth,
  bevel = 0.03,
  segments = 1,
}: BevelledBoxOptions): THREE.BufferGeometry {
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
    depth: Math.max(0.001, depth - 2 * b),
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
 * Single articulated mesh part, positioned and shadowed according to 3Dviz Pro Max standards.
 */
export function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0]
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Lighten a hex color toward white without leaving the string-keyed material cache.
 */
export function lighten(color: THREE.ColorRepresentation, amount: number): string {
  const mixed = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), Math.min(1, amount));
  return `#${mixed.getHexString()}`;
}

/**
 * Darken a hex color toward black; used for shadow arrises and recessed sills.
 */
export function darken(color: THREE.ColorRepresentation, amount: number): string {
  const mixed = new THREE.Color(color).lerp(new THREE.Color('#000000'), Math.min(1, amount));
  return `#${mixed.getHexString()}`;
}

export interface InsetPanelOptions {
  width: number;
  height: number;
  depth?: number;
  frame?: number;
  frameMaterial?: THREE.Material;
  panelMaterial?: THREE.Material;
  bevel?: number;
}

/**
 * Recessed opening: outer structural frame + inset panel, conveying true wall depth.
 */
export function insetPanel({
  width,
  height,
  depth = 0.12,
  frame = 0.06,
  frameMaterial,
  panelMaterial,
  bevel = 0.015,
}: InsetPanelOptions): THREE.Group {
  const group = new THREE.Group();
  const wood = frameMaterial ?? materialFor('#6f5138', { roughness: 0.72 });
  const pane = panelMaterial ?? materialFor('#2b2f33', { roughness: 0.25, metalness: 0.05 });

  group.add(
    part(
      bevelledBox({ width: width - frame, height: height - frame, depth: 0.03, bevel }),
      pane,
      [0, 0, -depth]
    )
  );

  const bars: [number, number, number, number][] = [
    [width, frame, 0, (height - frame) / 2],
    [width, frame, 0, -(height - frame) / 2],
    [frame, height - 2 * frame, (width - frame) / 2, 0],
    [frame, height - 2 * frame, -(width - frame) / 2, 0],
  ];

  for (const [w, h, x, y] of bars) {
    group.add(
      part(
        bevelledBox({ width: w, height: h, depth: frame, bevel }),
        wood,
        [x, y, -depth + frame / 2 + 0.02]
      )
    );
  }

  return group;
}

export interface WallHole {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WallWithOpeningsOptions {
  width: number;
  height: number;
  depth: number;
  openings?: WallHole[];
  material: THREE.Material;
  bevel?: number;
}

/**
 * Wall pierced by real holes: piers between openings plus sill and header blocks.
 */
export function wallWithOpenings({
  width,
  height,
  depth,
  openings = [],
  material,
  bevel = 0.03,
}: WallWithOpeningsOptions): THREE.Group {
  const group = new THREE.Group();
  const sorted = [...openings].sort((a, b) => a.x - b.x);

  const solid = (w: number, h: number, x: number, y: number) => {
    if (w <= 0.001 || h <= 0.001) return;
    group.add(part(bevelledBox({ width: w, height: h, depth, bevel }), material, [x, y, 0]));
  };

  let cursor = -width / 2;
  for (const hole of sorted) {
    const left = hole.x - hole.width / 2;
    const right = hole.x + hole.width / 2;
    const bottom = hole.y - hole.height / 2;
    const top = hole.y + hole.height / 2;

    solid(left - cursor, height, (cursor + left) / 2, height / 2);
    solid(hole.width, bottom, hole.x, bottom / 2);
    solid(hole.width, height - top, hole.x, (height + top) / 2);
    cursor = right;
  }
  solid(width / 2 - cursor, height, (cursor + width / 2) / 2, height / 2);
  return group;
}

export interface SocketDescriptor {
  name: string;
  position_m: [number, number, number];
  normal: [number, number, number];
}

export function socket(
  name: string,
  position_m: [number, number, number],
  normal: [number, number, number] = [0, 1, 0]
): SocketDescriptor {
  return { name, position_m: [...position_m], normal: [...normal] };
}

export interface ColliderDescriptor {
  name: string;
  centre_m: [number, number, number];
  size_m: [number, number, number];
}

export function collider(
  name: string,
  centre_m: [number, number, number],
  size_m: [number, number, number]
): ColliderDescriptor {
  return { name, centre_m: [...centre_m], size_m: [...size_m] };
}

/**
 * Two-bone analytic IK in the sagittal plane, for a leg or an arm.
 * dz/dy are offset of goal from joint root; bend +1 folds joint backwards (foreleg elbow), -1 forwards (knee).
 * Returns [root, joint] rotations about X in radians.
 * Grounded in 3Dviz Pro Max kit-walk.js.
 */
export function twoBoneIk(
  dz: number,
  dy: number,
  upper: number,
  lower: number,
  bend: number
): [number, number] {
  const reach = Math.min(Math.hypot(dz, dy), upper + lower - 0.004);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  const a = Math.acos(clamp((reach * reach + upper * upper - lower * lower) / (2 * reach * upper)));
  const b = Math.acos(clamp((upper * upper + lower * lower - reach * reach) / (2 * upper * lower)));
  return [Math.atan2(-dz, -dy) + bend * a, -bend * (Math.PI - b)];
}

/**
 * Foot offset [z, lift] from neutral stand point at cycle (whole numbers are strides).
 * Stance runs straight back over span metres, matching body travel so planted foot holds world position.
 * Swing arcs forward over a half sine of height lift.
 * Grounded in 3Dviz Pro Max kit-walk.js.
 */
export function footCycle(
  cycle: number,
  span: number,
  duty = 0.6,
  lift = 0.13
): [number, number] {
  const u = cycle - Math.floor(cycle);
  if (u < duty) return [span * (0.5 - u / duty), 0];
  const t = (u - duty) / (1 - duty);
  return [span * (t - 0.5), lift * Math.sin(Math.PI * t)];
}

export interface RouteStepState {
  time: number;
  speed: number;
  moving: boolean;
  route: [number, number][] | null;
  waypoint: number;
  heading: number;
  position: [number, number, number];
  distance: number;
  phase: number;
  loop?: boolean;
}

export interface RouteStepOptions {
  yawRateRad?: number;
  strideM?: number;
  arrival?: number;
  speed?: number | null;
}

/**
 * One walker step along state.route: turn clamped to yawRateRad, forward travel,
 * and phase advanced by distance / strideM - never by wall clock, preventing skating.
 * Grounded in 3Dviz Pro Max kit-walk.js.
 */
export function routeStep(
  state: RouteStepState,
  dt: number,
  options: RouteStepOptions = {}
): boolean {
  const { yawRateRad = 1.8, strideM = 1, arrival = 0.12, speed = null } = options;
  if (!(dt > 0)) return false;
  state.time += dt;
  if (speed !== null && speed !== undefined) state.speed = speed;
  let travel = state.moving ? state.speed * dt : 0;
  const route = state.route;
  if (route && route.length > 1) {
    const [tx, tz] = route[Math.min(state.waypoint, route.length - 1)];
    const wanted = Math.atan2(tx - state.position[0], tz - state.position[2]);
    const error = Math.atan2(Math.sin(wanted - state.heading), Math.cos(wanted - state.heading));
    const limit = yawRateRad * dt;
    state.heading += Math.max(-limit, Math.min(limit, error));
    if (
      Math.hypot(tx - state.position[0], tz - state.position[2]) < Math.max(arrival, travel * 1.5) &&
      ++state.waypoint >= route.length
    ) {
      if (state.loop) state.waypoint = 0;
      else {
        state.waypoint = route.length - 1;
        state.moving = false;
        travel = 0;
      }
    }
  }
  state.position[0] += Math.sin(state.heading) * travel;
  state.position[2] += Math.cos(state.heading) * travel;
  state.distance += travel;
  state.phase += travel / Math.max(strideM, 1e-6);
  return true;
}

