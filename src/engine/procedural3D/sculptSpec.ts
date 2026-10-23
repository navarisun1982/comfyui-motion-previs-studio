/**
 * SculptSpec — the contract between the generative reasoner (text and/or image) and the
 * 3D procedural geometry builder in ComfyUI Motion Previs Studio.
 * Replaces the v1 PartGraph format (see partGraphToSculptSpec()).
 *
 * A SculptSpec is declarative data: a hierarchy of parametric geometric parts (blob, lathe, extrude, tube, ...)
 * built deterministically into Three.js geometry. Data, not code: the reasoner never emits executable code
 * and nothing here matches object names — whatever the spec describes is what gets built.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ProceduralKitResult, QuadrupedMorphology } from './proceduralKits';
import { createQuadrupedWalker, createBipedWalker } from './proceduralKits';
import { createStandardPalette } from './craftForms';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../../services/storage';
import { CURATED_SCULPT_SPECS } from './curatedSculpts';

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export const SCULPT_SHAPES = ['blob', 'capsule', 'cylinder', 'cone', 'torus', 'tube', 'lathe', 'extrude'] as const;
export type SculptShape = (typeof SCULPT_SHAPES)[number];

export const MOTION_TYPES = ['none', 'spin', 'swing', 'bob'] as const;
export type MotionType = (typeof MOTION_TYPES)[number];

export const SCULPT_ROUTES = ['author', 'quadruped-walker', 'biped-walker'] as const;
export type SculptRoute = (typeof SCULPT_ROUTES)[number];

export const RIG_TYPES = ['none', 'humanoid'] as const;
export type RigType = (typeof RIG_TYPES)[number];

/** Standard humanoid bone names (Phase 2 IK posing binds sculpt parts rigidly to these). */
export const HUMANOID_BONES = [
  'Hips', 'Spine', 'Chest', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot',
] as const;
export type HumanoidBone = (typeof HUMANOID_BONES)[number];

/** The bone a mirrored copy of a part follows (Left <-> Right). */
export function mirrorBone(bone: HumanoidBone): HumanoidBone {
  if (bone.startsWith('Left')) return bone.replace(/^Left/, 'Right') as HumanoidBone;
  if (bone.startsWith('Right')) return bone.replace(/^Right/, 'Left') as HumanoidBone;
  return bone;
}

export interface SculptMaterial {
  id: string;
  color: string;
  roughness: number;
  metalness: number;
  emissive?: boolean;
  opacity?: number;
}

export interface SculptMotion {
  type: Exclude<MotionType, 'none'>;
  axis: 'x' | 'y' | 'z';
  speed: number;
  amplitude: number;
}

export interface SculptPart {
  id: string;
  parent?: string;
  shape: SculptShape;
  /** Bounding size [width, height, depth] in object units. torus: [outerDiameter, tubeDiameter, 0]; tube: [diameter, 0, 0]. */
  size: Vec3;
  /** Object-space centre (Y up, ground y=0, front +Z). Ignored for tube (points are object-space). */
  position: Vec3;
  /** Degrees, XYZ order. */
  rotation: Vec3;
  material: string;
  /** blob only: 0 = sharp box, 1 = full ellipsoid. */
  roundness?: number;
  /** cylinder only: top diameter as a fraction of the bottom diameter. */
  taper?: number;
  /** tube only: object-space control points. */
  points?: Vec3[];
  /** lathe only: [radius, height] pairs, both 0..1 (radius 1 = half the width, height 0 = bottom). */
  profile?: Vec2[];
  /** extrude only: [x, y] polygon, both -0.5..0.5 of width/height; extruded along depth. */
  outline?: Vec2[];
  /** extrude only: bevel as a fraction (0..0.5) of the smallest dimension. */
  bevel?: number;
  /** Duplicate the part (and its children) mirrored across x = 0. */
  mirrorX?: boolean;
  motion?: SculptMotion;
  /** Humanoid bone this part rigidly follows (rig === 'humanoid'). Mirrored copies swap Left/Right. */
  bone?: HumanoidBone;
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

export interface SculptReference {
  /** Key of the downscaled reference image in IndexedDB (modelStorage). */
  imageId?: string;
  /** Silhouette overlap (intersection over union, 0..1) measured against the reference. */
  iou?: number;
  measuredAt?: string;
}

export interface SculptSpec {
  version: 2;
  name: string;
  route: SculptRoute;
  rig: RigType;
  /** Real-world height of the finished object in metres. */
  heightMeters: number;
  /** Short reasoning notes from the model (silhouette / identity cues). */
  identity?: string;
  materials: SculptMaterial[];
  parts: SculptPart[];
  walker?: WalkerSpec;
  reference?: SculptReference;
  source?: { model: string; generatedAt: string; ms?: number; input?: 'text' | 'image' | 'text+image' };
}

/** Revision patch returned by the reasoner for "make the hat wider" style edits. */
export interface SculptPatch {
  set?: Array<Partial<SculptPart> & { id: string }>;
  add?: Array<Partial<SculptPart>>;
  remove?: string[];
  materials?: Array<Partial<SculptMaterial> & { id: string }>;
  heightMeters?: number;
  name?: string;
}

// ---------------------------------------------------------------------------
// Sanitisation: model output and stored data are untrusted. Clamp every number, drop junk.
// ---------------------------------------------------------------------------

const MAX_PARTS = 160;
const finite = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function vec(v: unknown, d: Vec3, lo = -100, hi = 100): Vec3 {
  const a = Array.isArray(v) ? v : [];
  return [clamp(finite(a[0], d[0]), lo, hi), clamp(finite(a[1], d[1]), lo, hi), clamp(finite(a[2], d[2]), lo, hi)];
}

function vec2List(v: unknown, lo: number, hi: number, max: number): Vec2[] {
  if (!Array.isArray(v)) return [];
  const out: Vec2[] = [];
  for (const p of v.slice(0, max)) {
    if (!Array.isArray(p)) continue;
    const x = finite(p[0], NaN);
    const y = finite(p[1], NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push([clamp(x, lo, hi), clamp(y, lo, hi)]);
  }
  return out;
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

/**
 * One-way converter for the legacy v1 PartGraph shape vocabulary.
 * box -> blob (roundness 0.24, matching the old 0.12 rounded-box radius), ellipsoid -> blob (roundness 1).
 * Everything else (cylinder/cone/capsule/torus/tube, parenting, mirroring, motion, walker routes) maps 1:1.
 */
export function partGraphToSculptSpec(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.version === 2) return raw;
  return {
    ...raw,
    version: 2,
    ...(raw.rig ? { rig: raw.rig } : {}),
    parts: (Array.isArray(raw.parts) ? raw.parts : []).map((p: any) => {
      if (!p || typeof p !== 'object') return p;
      if (p.shape === 'box') return { ...p, shape: 'blob', roundness: 0.24 };
      if (p.shape === 'ellipsoid') return { ...p, shape: 'blob', roundness: 1 };
      return p;
    }),
  };
}

function sanitizePart(p: any, index: number): SculptPart | null {
  if (!p || typeof p !== 'object') return null;
  // Legacy shape names are accepted from any source (old storage, older prompts, model drift).
  if (p.shape === 'box') p = { roundness: 0.24, ...p, shape: 'blob' };
  else if (p.shape === 'ellipsoid') p = { roundness: 1, ...p, shape: 'blob' };
  else if (p.shape === 'sphere') p = { roundness: 1, ...p, shape: 'blob' };
  const shape: SculptShape = SCULPT_SHAPES.includes(p.shape) ? p.shape : 'blob';
  const id = typeof p.id === 'string' && p.id ? p.id.slice(0, 64) : `part${index}`;

  const points =
    shape === 'tube' && Array.isArray(p.points)
      ? p.points.slice(0, 24).map((pt: unknown) => vec(pt, [0, 0, 0]))
      : undefined;
  const profile = shape === 'lathe' ? vec2List(p.profile, 0, 1, 48) : [];
  const outline = shape === 'extrude' ? vec2List(p.outline, -0.5, 0.5, 64) : [];
  const motionType: MotionType = MOTION_TYPES.includes(p?.motion?.type) ? p.motion.type : 'none';
  const bone: HumanoidBone | undefined = HUMANOID_BONES.includes(p.bone) ? p.bone : undefined;

  return {
    id,
    parent: typeof p.parent === 'string' && p.parent ? p.parent : undefined,
    shape,
    size: vec(p.size, [0.2, 0.2, 0.2], 0, 60).map((s) => Math.max(s, 0.002)) as Vec3,
    position: vec(p.position, [0, 0, 0]),
    rotation: vec(p.rotation, [0, 0, 0], -720, 720),
    material: typeof p.material === 'string' ? p.material : '',
    roundness: shape === 'blob' ? clamp(finite(p.roundness, 0.3), 0, 1) : undefined,
    taper: p.taper === undefined ? undefined : clamp(finite(p.taper, 1), 0, 4),
    points: points && points.length >= 2 ? points : undefined,
    profile: profile.length >= 2 ? profile : undefined,
    outline: outline.length >= 3 ? outline : undefined,
    bevel: shape === 'extrude' && p.bevel !== undefined ? clamp(finite(p.bevel, 0.08), 0, 0.5) : undefined,
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
    bone,
  };
}

export function sanitizeSculptSpec(rawIn: any, fallbackName = 'Object'): SculptSpec {
  const raw = partGraphToSculptSpec(rawIn);
  const route: SculptRoute = SCULPT_ROUTES.includes(raw?.route) ? raw.route : 'author';
  const materials: SculptMaterial[] = (Array.isArray(raw?.materials) ? raw.materials : [])
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
  const parts: SculptPart[] = [];
  for (const p of Array.isArray(raw?.parts) ? raw.parts : []) {
    if (parts.length >= MAX_PARTS) break;
    const part = sanitizePart(p, parts.length);
    if (!part) continue;
    while (ids.has(part.id)) part.id = `${part.id}_`;
    ids.add(part.id);
    parts.push(part);
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
        morphology:
          walkerRaw.morphology && typeof walkerRaw.morphology === 'object'
            ? sanitizeMorphology(walkerRaw.morphology)
            : undefined,
      }
    : undefined;

  const ref = raw?.reference;
  const reference: SculptReference | undefined =
    ref && typeof ref === 'object'
      ? {
          imageId: typeof ref.imageId === 'string' ? ref.imageId : undefined,
          iou: ref.iou === undefined ? undefined : clamp(finite(ref.iou, 0), 0, 1),
          measuredAt: typeof ref.measuredAt === 'string' ? ref.measuredAt : undefined,
        }
      : undefined;

  const hasBones = parts.some((p) => p.bone);
  const rig: RigType = RIG_TYPES.includes(raw?.rig) ? raw.rig : hasBones ? 'humanoid' : 'none';

  return {
    version: 2,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : fallbackName,
    route,
    rig,
    heightMeters: clamp(finite(raw?.heightMeters, 1), 0.02, 200),
    identity: typeof raw?.identity === 'string' ? raw.identity.slice(0, 400) : undefined,
    materials,
    parts,
    walker,
    reference,
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

/** Apply a revision patch and re-sanitise. Unknown ids in set/remove are ignored. */
export function applySculptPatch(spec: SculptSpec, patchRaw: any): SculptSpec {
  const patch: SculptPatch = patchRaw && typeof patchRaw === 'object' ? patchRaw : {};
  const remove = new Set(Array.isArray(patch.remove) ? patch.remove.filter((s) => typeof s === 'string') : []);
  let parts: any[] = spec.parts.filter((p) => !remove.has(p.id)).map((p) => ({ ...p }));
  // Children of removed parts become roots instead of dangling.
  for (const p of parts) if (p.parent && remove.has(p.parent)) p.parent = undefined;
  for (const s of Array.isArray(patch.set) ? patch.set : []) {
    if (!s || typeof s.id !== 'string') continue;
    parts = parts.map((p) => (p.id === s.id ? { ...p, ...s } : p));
  }
  for (const a of Array.isArray(patch.add) ? patch.add : []) if (a && typeof a === 'object') parts.push(a);
  let materials: any[] = spec.materials.map((m) => ({ ...m }));
  for (const m of Array.isArray(patch.materials) ? patch.materials : []) {
    if (!m || typeof m.id !== 'string') continue;
    const i = materials.findIndex((x) => x.id === m.id);
    if (i >= 0) materials[i] = { ...materials[i], ...m };
    else materials = [...materials, m];
  }
  return sanitizeSculptSpec(
    {
      ...spec,
      name: typeof patch.name === 'string' ? patch.name : spec.name,
      heightMeters: patch.heightMeters ?? spec.heightMeters,
      materials,
      parts,
    },
    spec.name
  );
}

// ---------------------------------------------------------------------------
// Geometry construction
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

/** blob: a unit rounded box scaled to size. roundness 1 makes the corner radius 0.5 => an ellipsoid. */
function blobGeometry(w: number, h: number, d: number, roundness: number): THREE.BufferGeometry {
  const r = clamp(roundness, 0, 1) * 0.5;
  // Thin parts with a negligible absolute radius stay crisp boxes.
  if (r * Math.min(w, h, d) < 0.002) return new THREE.BoxGeometry(w, h, d);
  const segments = r > 0.35 ? 8 : r > 0.15 ? 5 : 3;
  const g = new RoundedBoxGeometry(1, 1, 1, segments, r);
  g.scale(w, h, d);
  return g;
}

function latheGeometry(part: SculptPart): THREE.BufferGeometry {
  const [w, h, d] = part.size;
  const profile = part.profile ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0) * 0.5, y - 0.5));
  const g = new THREE.LatheGeometry(pts, 32);
  g.scale(w, h, d);
  return g;
}

function extrudeGeometry(part: SculptPart): THREE.BufferGeometry {
  const [w, h, d] = part.size;
  const outline = part.outline ?? [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x * w, y * h)));
  const bevel = clamp((part.bevel ?? 0.08) * Math.min(w, h, d), 0, d * 0.45);
  const depth = Math.max(d - bevel * 2, 0.001);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0.0005,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
    curveSegments: 8,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function geometryForPart(part: SculptPart): THREE.BufferGeometry {
  const [w, h, d] = part.size;
  switch (part.shape) {
    case 'blob':
      return blobGeometry(w, h, d, part.roundness ?? 0.3);
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
    case 'lathe':
      return latheGeometry(part);
    case 'extrude':
      return extrudeGeometry(part);
  }
}

function materialFor(m: SculptMaterial | undefined): THREE.Material {
  if (!m) return new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.6, metalness: 0.1 });
  const mat = new THREE.MeshStandardMaterial({ color: m.color, roughness: m.roughness, metalness: m.metalness });
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
  motion: SculptMotion;
  base: THREE.Vector3;
  baseRot: THREE.Euler;
}

/** Author route: build every described part. Positions are object-space; parents group motion/bones. */
function buildAuthored(spec: SculptSpec): { group: THREE.Group; animators: Animator[] } {
  const root = new THREE.Group();
  const materials = new Map<string, THREE.Material>();
  for (const m of spec.materials) materials.set(m.id, materialFor(m));
  const fallbackMat = materialFor(undefined);
  const children = new Map<string | undefined, SculptPart[]>();
  for (const p of spec.parts) {
    const list = children.get(p.parent) ?? [];
    list.push(p);
    children.set(p.parent, list);
  }
  const animators: Animator[] = [];

  const buildNode = (part: SculptPart, mirror: 1 | -1, container: THREE.Object3D, origin: THREE.Vector3) => {
    const world = new THREE.Vector3(part.position[0] * mirror, part.position[1], part.position[2]);
    const pivot = new THREE.Group();
    pivot.name = mirror === 1 ? part.id : `${part.id}_mirror`;
    pivot.position.copy(world).sub(origin);
    if (part.bone) pivot.userData.bone = mirror === 1 ? part.bone : mirrorBone(part.bone);
    pivot.userData.sculptPartId = part.id;
    container.add(pivot);

    let source: SculptPart = part;
    if (mirror === -1) {
      if (part.shape === 'tube') source = { ...part, points: part.points?.map((p) => [-p[0], p[1], p[2]] as Vec3) };
      else if (part.shape === 'extrude') source = { ...part, outline: part.outline?.map(([x, y]) => [-x, y] as Vec2) };
    }
    const mesh = new THREE.Mesh(geometryForPart(source), materials.get(part.material) ?? fallbackMat);
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
 * "Every part touches what it attaches to": a part whose bounds overlap no other part is
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
 * Build a Three.js object from a sculpt specification.
 * Routes to the walker kits only when the reasoner itself chose that route.
 */
export function buildSculpt(spec: SculptSpec): ProceduralKitResult {
  if (spec.route === 'quadruped-walker') {
    const w = spec.walker ?? {};
    const kit = createQuadrupedWalker({
      coat: w.coat,
      belly: w.belly,
      hoof: w.hoof,
      horn: w.horn,
      nose: w.nose,
      patches: w.patches ?? null,
      morphology: w.morphology,
    });
    const group = normalizeToStage(kit.group, spec.heightMeters);
    group.userData.sculptSpec = spec;
    return { ...kit, group };
  }
  if (spec.route === 'biped-walker') {
    const kit = createBipedWalker(createStandardPalette(), !!spec.walker?.female);
    const group = normalizeToStage(kit.group, spec.heightMeters);
    group.userData.sculptSpec = spec;
    return { ...kit, group };
  }

  const { group: inner, animators } = buildAuthored(spec);
  const group = normalizeToStage(inner, spec.heightMeters);
  group.userData.sculptSpec = spec;

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

// ---------------------------------------------------------------------------
// Registry: reasoned sculpts are cached by prompt so the stage can rebuild them
// without calling the model again (persisted across sessions). v1 PartGraph data is migrated.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'aids.sculptSpecs.v2';
const LEGACY_STORAGE_KEY = 'aids.partGraphs.v1';
const registry = new Map<string, SculptSpec>();
let hydrated = false;

export const sculptKey = (prompt: string) => prompt.trim().toLowerCase().replace(/\s+/g, ' ');

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const legacy = safeGetItem<Record<string, unknown> | null>(LEGACY_STORAGE_KEY, null);
    if (legacy) for (const [k, v] of Object.entries(legacy)) registry.set(k, sanitizeSculptSpec(v));
    const obj = safeGetItem<Record<string, unknown> | null>(STORAGE_KEY, null);
    if (obj) for (const [k, v] of Object.entries(obj)) registry.set(k, sanitizeSculptSpec(v));
    if (legacy) {
      persist();
      safeRemoveItem(LEGACY_STORAGE_KEY);
    }
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

/** Test hook: forget the in-memory cache so the next lookup re-reads storage. */
export function resetSculptRegistryForTests() {
  registry.clear();
  hydrated = false;
}

export function registerSculptSpec(prompt: string, spec: SculptSpec) {
  hydrate();
  registry.set(sculptKey(prompt), spec);
  persist();
}

export function lookupSculptSpec(prompt?: string): SculptSpec | undefined {
  if (!prompt || !prompt.trim()) return undefined;
  hydrate();
  const key = sculptKey(prompt);
  return registry.get(key) || lookupCuratedSculptSpec(key) || lookupCuratedSculptSpec(prompt);
}

const curatedCache = new Map<string, SculptSpec>();

export function lookupCuratedSculptSpec(idOrPrompt?: string): SculptSpec | undefined {
  if (!idOrPrompt || !idOrPrompt.trim()) return undefined;
  const key = sculptKey(idOrPrompt);
  const lower = idOrPrompt.toLowerCase();
  let id: string | undefined;
  if (
    key === 'rustic stone fireplace' ||
    key === 'fireplace' ||
    key === 'stone fireplace' ||
    key === 'hearth' ||
    /\b(fireplace|hearth|fire\s*box|chimney\s*piece|mantelpiece)\b/i.test(lower)
  ) {
    id = 'rustic stone fireplace';
  }
  if (!id || !CURATED_SCULPT_SPECS[id]) return undefined;
  let r = curatedCache.get(id);
  if (!r) {
    r = sanitizeSculptSpec(CURATED_SCULPT_SPECS[id], id);
    curatedCache.set(id, r);
  }
  return r;
}

export function removeSculptSpec(prompt: string) {
  hydrate();
  if (registry.delete(sculptKey(prompt))) persist();
}

// ---------------------------------------------------------------------------
// Actor migration: shots saved before v2 carry `actor.partGraph` (v1) or `actor.sculpt`.
// Load paths call migrateActorSculpt(); readers use actorSculptSpec().
// ---------------------------------------------------------------------------

interface SculptCarrier {
  sculpt?: unknown;
  partGraph?: unknown;
}

const legacyActorCache = new WeakMap<object, SculptSpec>();

/** The actor's sculpt as sanitised v2 data (accepts legacy partGraph). Stable identity per source. */
export function actorSculptSpec(actor: SculptCarrier | undefined | null): SculptSpec | undefined {
  const raw = actor?.sculpt ?? actor?.partGraph;
  if (!raw || typeof raw !== 'object') return undefined;
  if ((raw as SculptSpec).version === 2) return raw as SculptSpec;
  let r = legacyActorCache.get(raw);
  if (!r) {
    r = sanitizeSculptSpec(raw);
    legacyActorCache.set(raw, r);
  }
  return r;
}

/** Returns a copy with legacy `partGraph` converted into `sculpt`. */
export function migrateActorSculpt<T extends SculptCarrier>(actor: T): T {
  if (!actor || actor.partGraph === undefined) return actor;
  const { partGraph, ...rest } = actor;
  const sculpt =
    rest.sculpt ??
    (partGraph && typeof partGraph === 'object'
      ? sanitizeSculptSpec(partGraph)
      : undefined);
  return { ...(rest as T), sculpt };
}

export function migrateActorsInShot<S extends { actors?: SculptCarrier[] }>(shot: S): S {
  if (
    !shot ||
    !Array.isArray(shot.actors) ||
    !shot.actors.some((a) => a && a.partGraph !== undefined)
  ) {
    return shot;
  }
  return { ...shot, actors: shot.actors.map(migrateActorSculpt) };
}
