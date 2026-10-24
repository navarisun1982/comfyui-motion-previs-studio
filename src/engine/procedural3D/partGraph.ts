/**
 * Part Graph — the contract between the object reasoner (LLM) and the geometry builder.
 *
 * 3Dviz Pro Max step 2 ("reason about the important objects") is performed by a language model,
 * which emits this structured description of silhouette, proportions, parts, connections,
 * materials and behaviour. This module turns it into Three.js geometry deterministically.
 * No object names are matched here: whatever the reasoner describes is what gets built.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ProceduralKitResult, QuadrupedMorphology } from './proceduralKits';
import { createQuadrupedWalker, createBipedWalker } from './proceduralKits';
import { createStandardPalette } from './craftForms';
import { safeGetItem, safeSetItem } from '../../services/storage';
import { lookupSculptSpec, registerSculptSpec } from './sculptSpec';

export type Vec3 = [number, number, number];

export const PART_SHAPES = ['box', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'torus', 'tube'] as const;
export type PartShape = (typeof PART_SHAPES)[number];

export const MOTION_TYPES = ['none', 'spin', 'swing', 'bob'] as const;
export type MotionType = (typeof MOTION_TYPES)[number];

export const GRAPH_ROUTES = ['author', 'quadruped-walker', 'biped-walker'] as const;
export type GraphRoute = (typeof GRAPH_ROUTES)[number];

export interface PartGraphMaterial {
  id: string;
  color: string;
  roughness: number;
  metalness: number;
  emissive?: boolean;
  opacity?: number;
}

export interface PartGraphPart {
  id: string;
  parent?: string;
  shape: PartShape;
  /** box/ellipsoid/cylinder/cone/capsule: [width, height, depth]; torus: [outerDiameter, tubeDiameter, 0]; tube: [diameter, 0, 0] */
  size: Vec3;
  /** Object-space centre in metres (Y up, ground y=0, front +Z). For tube: ignored (points are object-space). */
  position: Vec3;
  /** Degrees, XYZ order. */
  rotation: Vec3;
  material: string;
  /** cylinder only: top diameter as a fraction of the bottom diameter (1 = straight). */
  taper?: number;
  /** tube only: object-space control points. */
  points?: Vec3[];
  /** Duplicate the part (and its children) mirrored across x = 0. */
  mirrorX?: boolean;
  motion?: { type: MotionType; axis: 'x' | 'y' | 'z'; speed: number; amplitude: number };
}

export interface WalkerSpec {
  coat?: string;
  belly?: string;
  hoof?: string;
  horn?: string;
  nose?: string;
  patches?: string | null;
  morphology?: QuadrupedMorphology;
  female?: boolean;
}

export interface PartGraph {
  version: 1;
  name: string;
  /** How the reasoner chose to construct the object (3Dviz routing: reuse/adapt a kit vs author). */
  route: GraphRoute;
  /** Real-world height of the finished object in metres. */
  heightMeters: number;
  /** Short reasoning notes from the model (silhouette / identity cues). */
  identity?: string;
  materials: PartGraphMaterial[];
  parts: PartGraphPart[];
  walker?: WalkerSpec;
  source?: { model: string; generatedAt: string; ms?: number };
}

// ---------------------------------------------------------------------------
// Sanitisation: the model output is untrusted. Clamp every number, drop junk.
// ---------------------------------------------------------------------------

const MAX_PARTS = 160;
const finite = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function vec(v: unknown, d: Vec3, lo = -100, hi = 100): Vec3 {
  const a = Array.isArray(v) ? v : [];
  return [clamp(finite(a[0], d[0]), lo, hi), clamp(finite(a[1], d[1]), lo, hi), clamp(finite(a[2], d[2]), lo, hi)];
}

function safeColor(c: unknown, fallback = '#9aa3ad'): string {
  if (typeof c !== 'string') return fallback;
  let s = c.trim().toLowerCase();
  if (/^[0-9a-f]{6}$/.test(s) || /^[0-9a-f]{3}$/.test(s)) s = `#${s}`;
  const valid =
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s) ||
    /^(rgb|hsl)a?\(/.test(s) ||
    Object.prototype.hasOwnProperty.call(THREE.Color.NAMES, s);
  if (!valid) return fallback;
  try {
    const col = new THREE.Color();
    col.setStyle(s, THREE.SRGBColorSpace);
    return `#${col.getHexString(THREE.SRGBColorSpace)}`;
  } catch {
    return fallback;
  }
}

export function sanitizePartGraph(raw: any, fallbackName = 'Object'): PartGraph {
  const route: GraphRoute = GRAPH_ROUTES.includes(raw?.route) ? raw.route : 'author';
  const materials: PartGraphMaterial[] = (Array.isArray(raw?.materials) ? raw.materials : [])
    .filter((m: any) => m && typeof m.id === 'string')
    .slice(0, 32)
    .map((m: any) => ({
      id: String(m.id),
      color: safeColor(m.color),
      roughness: clamp(finite(m.roughness, 0.6), 0, 1),
      metalness: clamp(finite(m.metalness, 0), 0, 1),
      emissive: !!m.emissive,
      opacity: m.opacity === undefined ? undefined : clamp(finite(m.opacity, 1), 0.05, 1),
    }));

  const ids = new Set<string>();
  const parts: PartGraphPart[] = [];
  for (const p of Array.isArray(raw?.parts) ? raw.parts : []) {
    if (!p || parts.length >= MAX_PARTS) continue;
    const shape: PartShape = PART_SHAPES.includes(p.shape) ? p.shape : 'box';
    let id = typeof p.id === 'string' && p.id ? p.id : `part${parts.length}`;
    while (ids.has(id)) id = `${id}_`;
    ids.add(id);
    const points =
      shape === 'tube' && Array.isArray(p.points)
        ? p.points.slice(0, 24).map((pt: unknown) => vec(pt, [0, 0, 0]))
        : undefined;
    const motionType: MotionType = MOTION_TYPES.includes(p?.motion?.type) ? p.motion.type : 'none';
    parts.push({
      id,
      parent: typeof p.parent === 'string' && p.parent ? p.parent : undefined,
      shape,
      size: vec(p.size, [0.2, 0.2, 0.2], 0, 60).map((s) => Math.max(s, 0.002)) as Vec3,
      position: vec(p.position, [0, 0, 0]),
      rotation: vec(p.rotation, [0, 0, 0], -720, 720),
      material: typeof p.material === 'string' ? p.material : '',
      taper: p.taper === undefined ? undefined : clamp(finite(p.taper, 1), 0, 4),
      points: points && points.length >= 2 ? points : undefined,
      mirrorX: !!p.mirrorX,
      motion:
        motionType === 'none'
          ? undefined
          : {
              type: motionType,
              axis: ['x', 'y', 'z'].includes(p.motion.axis) ? p.motion.axis : 'y',
              speed: clamp(finite(p.motion.speed, 1), -30, 30),
              amplitude: clamp(finite(p.motion.amplitude, 10), -180, 180),
            },
    });
  }
  // Parents must reference an existing part and must not create cycles.
  for (const p of parts) {
    if (!p.parent || !ids.has(p.parent) || p.parent === p.id) p.parent = undefined;
  }
  for (const p of parts) {
    const seen = new Set<string>([p.id]);
    let cur = p.parent;
    while (cur) {
      if (seen.has(cur)) {
        p.parent = undefined;
        break;
      }
      seen.add(cur);
      cur = parts.find((q) => q.id === cur)?.parent;
    }
  }

  const walkerRaw = raw?.walker;
  const walker: WalkerSpec | undefined = walkerRaw
    ? {
        coat: walkerRaw.coat ? safeColor(walkerRaw.coat) : undefined,
        belly: walkerRaw.belly ? safeColor(walkerRaw.belly) : undefined,
        hoof: walkerRaw.hoof ? safeColor(walkerRaw.hoof) : undefined,
        horn: walkerRaw.horn ? safeColor(walkerRaw.horn) : undefined,
        nose: walkerRaw.nose ? safeColor(walkerRaw.nose) : undefined,
        patches: walkerRaw.patches ? safeColor(walkerRaw.patches) : null,
        female: !!walkerRaw.female,
        morphology: walkerRaw.morphology && typeof walkerRaw.morphology === 'object' ? sanitizeMorphology(walkerRaw.morphology) : undefined,
      }
    : undefined;

  return {
    version: 1,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : fallbackName,
    route,
    heightMeters: clamp(finite(raw?.heightMeters, 1), 0.02, 200),
    identity: typeof raw?.identity === 'string' ? raw.identity.slice(0, 400) : undefined,
    materials,
    parts,
    walker,
    source: raw?.source,
  };
}

function sanitizeMorphology(m: any): QuadrupedMorphology {
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    allowed.includes(v as T) ? (v as T) : undefined;
  return {
    build: pick(m.build, ['stocky', 'slender', 'humped', 'standard'] as const),
    neckLength: m.neckLength === undefined ? undefined : clamp(finite(m.neckLength, 1), 0.4, 3),
    neckLean: m.neckLean === undefined ? undefined : clamp(finite(m.neckLean, 0.42), -0.6, 1.4),
    horns: pick(m.horns, ['none', 'curved', 'spikes', 'antlers'] as const),
    ears: pick(m.ears, ['drooping', 'erect', 'short', 'standard'] as const),
    tail: pick(m.tail, ['tassel', 'short', 'curled', 'standard'] as const),
    hasDewlap: m.hasDewlap === undefined ? undefined : !!m.hasDewlap,
    hasUdder: m.hasUdder === undefined ? undefined : !!m.hasUdder,
    hasMane: m.hasMane === undefined ? undefined : !!m.hasMane,
    snoutLength: m.snoutLength === undefined ? undefined : clamp(finite(m.snoutLength, 1), 0.4, 2.5),
    snoutWidth: m.snoutWidth === undefined ? undefined : clamp(finite(m.snoutWidth, 1), 0.4, 2.5),
  };
}

// ---------------------------------------------------------------------------
// Geometry construction
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

function geometryFor(part: PartGraphPart): THREE.BufferGeometry {
  const [w, h, d] = part.size;
  switch (part.shape) {
    case 'box': {
      const r = Math.min(w, h, d) * 0.12;
      const g = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
      g.scale(w, h, d);
      // RoundedBoxGeometry radius is relative to the unit box; keep thin parts crisp.
      if (r < 0.004) return new THREE.BoxGeometry(w, h, d);
      return g;
    }
    case 'ellipsoid': {
      const g = new THREE.SphereGeometry(0.5, 28, 18);
      g.scale(w, h, d);
      return g;
    }
    case 'cylinder': {
      const taper = part.taper ?? 1;
      const g = new THREE.CylinderGeometry(0.5 * taper, 0.5, 1, 28);
      g.scale(w, h, d);
      return g;
    }
    case 'cone': {
      const g = new THREE.ConeGeometry(0.5, 1, 28);
      g.scale(w, h, d);
      return g;
    }
    case 'capsule': {
      const radius = Math.max(Math.min(w, d) / 2, 0.002);
      const length = Math.max(h - radius * 2, 0.001);
      const g = new THREE.CapsuleGeometry(radius, length, 6, 16);
      // Allow elliptical cross-sections.
      const minWD = Math.max(Math.min(w, d), 0.004);
      g.scale(w / minWD, 1, d / minWD);
      return g;
    }
    case 'torus': {
      const tube = Math.max(h / 2, 0.002);
      const radius = Math.max(w / 2 - tube, tube * 0.5);
      return new THREE.TorusGeometry(radius, tube, 14, 40);
    }
    case 'tube': {
      const pts = (part.points ?? [[0, 0, 0], [0, 0.2, 0]]).map((p) => new THREE.Vector3(...p));
      const curve = new THREE.CatmullRomCurve3(pts);
      return new THREE.TubeGeometry(curve, Math.max(12, pts.length * 10), Math.max(w / 2, 0.002), 12, false);
    }
  }
}

function materialFor(m: PartGraphMaterial | undefined): THREE.Material {
  if (!m) return new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.6, metalness: 0.1 });
  const mat = new THREE.MeshStandardMaterial({
    color: m.color,
    roughness: m.roughness,
    metalness: m.metalness,
  });
  if (m.emissive) {
    mat.emissive = new THREE.Color(m.color);
    mat.emissiveIntensity = 2.5;
  }
  if (m.opacity !== undefined && m.opacity < 1) {
    mat.transparent = true;
    mat.opacity = m.opacity;
    mat.depthWrite = false;
  }
  return mat;
}

interface Animator {
  pivot: THREE.Object3D;
  motion: NonNullable<PartGraphPart['motion']>;
  base: THREE.Vector3;
  baseRot: THREE.Euler;
}

/** Author route: build every described part. Positions are object-space; parents only group motion. */
function buildAuthored(graph: PartGraph): { group: THREE.Group; animators: Animator[] } {
  const root = new THREE.Group();
  const materials = new Map<string, THREE.Material>();
  for (const m of graph.materials) materials.set(m.id, materialFor(m));
  const fallbackMat = materialFor(undefined);
  const children = new Map<string | undefined, PartGraphPart[]>();
  for (const p of graph.parts) {
    const list = children.get(p.parent) ?? [];
    list.push(p);
    children.set(p.parent, list);
  }
  const animators: Animator[] = [];

  const buildNode = (part: PartGraphPart, mirror: 1 | -1, container: THREE.Object3D, origin: THREE.Vector3) => {
    const world = new THREE.Vector3(part.position[0] * mirror, part.position[1], part.position[2]);
    // The pivot carries translation only; children are placed relative to it (object-space offsets).
    const pivot = new THREE.Group();
    pivot.name = mirror === 1 ? part.id : `${part.id}_mirror`;
    pivot.position.copy(world).sub(origin);
    container.add(pivot);

    const geom = geometryFor(
      part.shape === 'tube' && mirror === -1
        ? { ...part, points: part.points?.map((p) => [-p[0], p[1], p[2]] as Vec3) }
        : part
    );
    const mesh = new THREE.Mesh(geom, materials.get(part.material) ?? fallbackMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (part.shape === 'tube') {
      // Tube points are object-space: undo the pivot translation.
      mesh.position.copy(world).negate();
    } else {
      mesh.rotation.set(part.rotation[0] * DEG, part.rotation[1] * DEG * mirror, part.rotation[2] * DEG * mirror);
    }
    pivot.add(mesh);

    if (part.motion) {
      const motion = { ...part.motion };
      // Mirrored swings move symmetrically; mirrored spins counter-rotate like real paired rotors.
      if (mirror === -1 && motion.axis !== 'x') motion.amplitude = -motion.amplitude;
      animators.push({ pivot, motion, base: pivot.position.clone(), baseRot: pivot.rotation.clone() });
    }

    for (const child of children.get(part.id) ?? []) {
      const childMirrors = child.mirrorX && mirror === 1 && Math.abs(child.position[0]) > 0.01;
      buildNode(child, mirror, pivot, world);
      if (childMirrors) buildNode(child, -1, pivot, world);
    }
  };

  const zero = new THREE.Vector3();
  for (const part of children.get(undefined) ?? []) {
    buildNode(part, 1, root, zero);
    const centerX = part.shape === 'tube' ? (part.points?.[0]?.[0] ?? 0) : part.position[0];
    if (part.mirrorX && Math.abs(centerX) > 0.01) buildNode(part, -1, root, zero);
  }
  repairAttachments(root);
  return { group: root, animators };
}

/**
 * 3Dviz "every part touches what it attaches to": a part whose bounds overlap no other part is
 * translated along the shortest gap until it touches its nearest neighbour. Connected parts are
 * never moved, so a correct model is left exactly as reasoned.
 */
export function repairAttachments(root: THREE.Object3D, tolerance = 0.005): number {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  if (meshes.length < 2) return 0;
  const boxes = meshes.map((m) => new THREE.Box3().setFromObject(m));
  const touches = (a: THREE.Box3, b: THREE.Box3) => a.clone().expandByScalar(tolerance).intersectsBox(b);
  let moved = 0;

  for (let i = 0; i < meshes.length; i++) {
    const a = boxes[i];
    if (boxes.some((b, j) => j !== i && touches(a, b))) continue;
    // Nearest neighbour by box-to-box gap.
    let best = -1;
    let bestGap = Infinity;
    let delta = new THREE.Vector3();
    for (let j = 0; j < meshes.length; j++) {
      if (j === i) continue;
      const b = boxes[j];
      const d = new THREE.Vector3(
        a.max.x < b.min.x ? b.min.x - a.max.x : a.min.x > b.max.x ? b.max.x - a.min.x : 0,
        a.max.y < b.min.y ? b.min.y - a.max.y : a.min.y > b.max.y ? b.max.y - a.min.y : 0,
        a.max.z < b.min.z ? b.min.z - a.max.z : a.min.z > b.max.z ? b.max.z - a.min.z : 0
      );
      const gap = d.length();
      if (gap < bestGap) {
        bestGap = gap;
        best = j;
        delta = d;
      }
    }
    if (best < 0 || !Number.isFinite(bestGap)) continue;
    // Close the gap slightly past contact so the seam overlaps instead of kissing.
    const overlap = delta.clone().normalize().multiplyScalar(Math.min(0.01, bestGap * 0.1));
    const worldShift = delta.add(overlap);
    const pivot = meshes[i].parent ?? meshes[i];
    const parentInv = new THREE.Matrix4().copy((pivot.parent ?? root).matrixWorld).invert();
    const localShift = worldShift.clone().transformDirection(parentInv).multiplyScalar(worldShift.length());
    pivot.position.add(localShift);
    pivot.updateMatrixWorld(true);
    boxes[i] = new THREE.Box3().setFromObject(meshes[i]);
    moved++;
  }
  return moved;
}

/** Stage units per real-world metre: the stage's human actor (1.75 m) measures 5.06 units. */
export const STAGE_UNITS_PER_METER = 2.9;
const MIN_STAGE_HEIGHT = 0.45;
const MAX_STAGE_HEIGHT = 45;

/** Ground the object (min y = 0), centre it on x/z, and scale it to its real-world height. */
function normalizeToStage(inner: THREE.Object3D, heightMeters: number): THREE.Group {
  const outer = new THREE.Group();
  outer.add(inner);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  if (box.isEmpty()) return outer;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const target = clamp(heightMeters * STAGE_UNITS_PER_METER, MIN_STAGE_HEIGHT, MAX_STAGE_HEIGHT);
  const s = target / Math.max(size.y, 1e-3);
  inner.position.set(-center.x, -box.min.y, -center.z);
  outer.scale.setScalar(s);
  return outer;
}

/**
 * Build a Three.js object from a reasoned part graph.
 * Routes to the canonical 3Dviz walker kits only when the reasoner itself chose that route.
 */
export function buildPartGraph(graph: PartGraph): ProceduralKitResult {
  if (graph.route === 'quadruped-walker') {
    const w = graph.walker ?? {};
    const kit = createQuadrupedWalker({
      coat: w.coat,
      belly: w.belly,
      hoof: w.hoof,
      horn: w.horn,
      nose: w.nose,
      patches: w.patches ?? null,
      morphology: w.morphology,
    });
    const group = normalizeToStage(kit.group, graph.heightMeters);
    group.userData.partGraph = graph;
    return { ...kit, group };
  }
  if (graph.route === 'biped-walker') {
    const kit = createBipedWalker(createStandardPalette(), !!graph.walker?.female);
    const group = normalizeToStage(kit.group, graph.heightMeters);
    group.userData.partGraph = graph;
    return { ...kit, group };
  }

  const { group: inner, animators } = buildAuthored(graph);
  const group = normalizeToStage(inner, graph.heightMeters);
  group.userData.partGraph = graph;

  let t = 0;
  const update =
    animators.length === 0
      ? undefined
      : (dt: number) => {
          t += dt;
          for (const a of animators) {
            const { type, axis, speed, amplitude } = a.motion;
            if (type === 'spin') {
              a.pivot.rotation[axis] += speed * dt;
            } else if (type === 'swing') {
              a.pivot.rotation[axis] = a.baseRot[axis] + amplitude * DEG * Math.sin(t * speed);
            } else if (type === 'bob') {
              a.pivot.position[axis] = a.base[axis] + (amplitude / 100) * Math.sin(t * speed);
            }
          }
        };
  return { group, update };
}

import { CURATED_PART_GRAPHS } from './curatedPartGraphs';

// ---------------------------------------------------------------------------
// Registry: reasoned graphs are cached by prompt so the stage can rebuild them
// without calling the model again (persisted across sessions).
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'aids.partGraphs.v1';
const registry = new Map<string, PartGraph>();
let hydrated = false;

export const partGraphKey = (prompt: string) => prompt.trim().toLowerCase().replace(/\s+/g, ' ');

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const obj = safeGetItem<Record<string, PartGraph> | null>(STORAGE_KEY, null);
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) registry.set(k, sanitizePartGraph(v));
  } catch {
    /* corrupted cache is ignored */
  }
}

function persist() {
  try {
    safeSetItem(STORAGE_KEY, Object.fromEntries(registry));
  } catch {
    /* quota exceeded: keep in-memory copy */
  }
}

export function registerPartGraph(prompt: string, graph: PartGraph) {
  hydrate();
  registry.set(partGraphKey(prompt), graph);
  persist();
  try {
    registerSculptSpec(prompt, graph as any);
  } catch {
    /* ignore */
  }
}

export function lookupPartGraph(prompt?: string): PartGraph | undefined {
  if (!prompt || !prompt.trim()) return undefined;
  hydrate();
  const key = partGraphKey(prompt);
  return (
    registry.get(key) ||
    (lookupSculptSpec(prompt) as any) ||
    (lookupSculptSpec(key) as any) ||
    lookupCuratedPartGraph(key) ||
    lookupCuratedPartGraph(prompt)
  );
}

export function lookupCuratedPartGraph(idOrPrompt?: string): PartGraph | undefined {
  if (!idOrPrompt || !idOrPrompt.trim()) return undefined;
  const key = partGraphKey(idOrPrompt);
  const lower = idOrPrompt.toLowerCase();

  // Curated Rustic Stone Fireplace with multi-part masonry, grate, embers, and flame
  if (
    key === 'rustic stone fireplace' ||
    key === 'fireplace' ||
    key === 'stone fireplace' ||
    key === 'hearth' ||
    /\b(fireplace|hearth|fire\s*box|chimney\s*piece|mantelpiece)\b/i.test(lower)
  ) {
    return CURATED_PART_GRAPHS['rustic stone fireplace'];
  }

  return undefined;
}

export function removePartGraph(prompt: string) {
  hydrate();
  if (registry.delete(partGraphKey(prompt))) persist();
}

