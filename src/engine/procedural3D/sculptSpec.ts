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
import type { ProceduralKitResult, QuadrupedMorphology } from './proceduralKits';
import { createQuadrupedWalker } from './proceduralKits';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../../services/storage';
import { CURATED_SCULPT_SPECS } from './curatedSculpts';
import { cutSculptGeometry, CutterTarget } from './sculptCsg';
import { createTactileClayMaterial, applyPartGradient, PartGradient } from './clayMaterial';
import { compileCharacterToClaySculpt, createDefaultCharacterFeatures } from './characterClayCompiler';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export const SCULPT_SHAPES = ['blob', 'box', 'capsule', 'cylinder', 'cone', 'torus', 'tube', 'lathe', 'extrude'] as const;
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
  /** CSG operation: "subtract" (carve out) or "intersect". Cutters cut parent geometry. */
  op?: 'subtract' | 'intersect';
  shape: SculptShape;
  /** Bounding size [width, height, depth] in object units. torus: [outerDiameter, tubeDiameter, 0]; tube: [diameter, 0, 0]. */
  size: Vec3;
  /** Object-space centre (Y up, ground y=0, front +Z). Ignored for tube (points are object-space). */
  position: Vec3;
  /** Degrees, XYZ order. */
  rotation: Vec3;
  material: string;
  /** Optional hex color directly on part */
  color?: string;
  /** blob only: 0 = sharp box, 1 = full ellipsoid. */
  roundness?: number;
  /** cylinder or blob taper. */
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
  /** Linear vertex color gradient */
  gradient?: PartGradient;
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
 * Converter for legacy v1 PartGraph and recipe envelopes.
 * Maps box -> box, ellipsoid -> blob (roundness 1), mirror -> mirrorX,
 * and extracts recipe envelopes ({ recipe: { parts: [...] } }).
 */
export function partGraphToSculptSpec(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  // Support recipe envelope format ({ recipe: { parts: [...] } })
  const source =
    raw.recipe && typeof raw.recipe === 'object' && Array.isArray(raw.recipe.parts)
      ? { ...raw.recipe, ...raw, parts: raw.recipe.parts }
      : raw;

  if (source.version === 2) return source;
  return {
    ...source,
    version: 2,
    ...(source.rig ? { rig: source.rig } : {}),
    parts: (Array.isArray(source.parts) ? source.parts : []).map((p: any) => {
      if (!p || typeof p !== 'object') return p;
      const res = { ...p };
      if (p.shape === 'box') {
        res.shape = 'blob';
        res.roundness = p.roundness !== undefined ? p.roundness : 0.24;
      } else if (p.shape === 'ellipsoid') {
        res.shape = 'blob';
        res.roundness = 1;
      }
      if (p.mirror && !p.mirrorX) {
        res.mirrorX = true;
      }
      return res;
    }),
  };
}

function sanitizePart(p: any, index: number): SculptPart | null {
  if (!p || typeof p !== 'object') return null;
  // Legacy shape names are accepted from any source (old storage, older prompts, model drift).
  if (p.shape === 'box') p = { roundness: p.roundness !== undefined ? p.roundness : 0.24, ...p, shape: 'blob' };
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

  // Support native color field: generate an explicit material identifier if omitted
  const color = typeof p.color === 'string' ? safeColor(p.color) : undefined;
  const material = typeof p.material === 'string' && p.material ? p.material : color ? `col_${color.replace(/[^a-zA-Z0-9]/g, '')}` : '';

  // Support CSG operation
  const op: 'subtract' | 'intersect' | undefined =
    p.op === 'subtract' || p.op === 'intersect' ? p.op : undefined;

  // Support linear gradient
  let gradient: PartGradient | undefined = undefined;
  if (p.gradient && typeof p.gradient === 'object') {
    const gCol = typeof p.gradient.color === 'string' ? safeColor(p.gradient.color) : undefined;
    const gAxis = ['x', 'y', 'z'].includes(p.gradient.axis) ? p.gradient.axis : 'y';
    if (gCol) {
      gradient = {
        color: gCol,
        axis: gAxis,
        from: clamp(finite(p.gradient.from, 0), -1, 1),
        to: clamp(finite(p.gradient.to, 1), -1, 1),
      };
    }
  }

  const partObj: SculptPart = {
    id,
    parent: typeof p.parent === 'string' && p.parent ? p.parent : undefined,
    op,
    gradient,
    shape,
    size: vec(p.size, [0.2, 0.2, 0.2], 0, 60).map((s) => Math.max(s, 0.002)) as Vec3,
    position: vec(p.position, [0, 0, 0]),
    rotation: vec(p.rotation, [0, 0, 0], -720, 720),
    material,
    color,
    roundness: shape === 'blob' ? clamp(finite(p.roundness, 0.3), 0, 1) : undefined,
    taper: p.taper === undefined ? undefined : clamp(finite(p.taper, 1), -1, 4),
    points: points && points.length >= 2 ? points : undefined,
    profile: profile.length >= 2 ? profile : undefined,
    outline: outline.length >= 3 ? outline : undefined,
    bevel: shape === 'extrude' && p.bevel !== undefined ? clamp(finite(p.bevel, 0.08), 0, 0.5) : undefined,
    mirrorX: !!p.mirrorX || !!p.mirror,
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
  return partObj;
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
      roughness: clamp(finite(m.roughness, 0.65), 0, 1),
      metalness: clamp(finite(m.metalness, 0.05), 0, 1),
      emissive: !!m.emissive,
      opacity: m.opacity === undefined ? undefined : clamp(finite(m.opacity, 1), 0.05, 1),
    }));

  // Auto-synthesise tactile clay materials from part colors if not explicitly defined
  const materialIds = new Set(materials.map((m) => m.id));
  const rawPartsList = Array.isArray(raw?.parts) ? raw.parts : [];
  for (const p of rawPartsList) {
    if (p && typeof p.color === 'string') {
      const col = safeColor(p.color);
      const matId = typeof p.material === 'string' && p.material ? p.material : `col_${col.replace(/[^a-zA-Z0-9]/g, '')}`;
      if (!materialIds.has(matId)) {
        materials.push({
          id: matId,
          color: col,
          roughness: 0.65,
          metalness: 0.05,
        });
        materialIds.add(matId);
      }
    }
  }

  const ids = new Set<string>();
  const parts: SculptPart[] = [];
  for (const p of rawPartsList) {
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

const BLOB_TAPER = 0.6;
const blobExponent = (roundness: number) => 16 - 14 * clamp(roundness, 0, 1);

function taperScale(taper: number, t: number, strength: number): number {
  if (taper > 0) return 1 - taper * strength * ((t + 1) / 2);
  if (taper < 0) return 1 + taper * strength * ((1 - t) / 2);
  return 1;
}

export function createSuperellipsoidGeometry(
  size: [number, number, number],
  roundness = 0.3,
  taper = 0
): THREE.BufferGeometry {
  const [w, h, d] = size;
  const [a, b, c] = [w / 2, h / 2, d / 2];
  const r = clamp(roundness, 0, 1);
  const p = blobExponent(r);
  const geometry = new THREE.SphereGeometry(1, 48, 36);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const s = Math.abs(v.x) ** p + Math.abs(v.y) ** p + Math.abs(v.z) ** p;
    v.multiplyScalar(s > 0 ? s ** (-1 / p) : 0);
    const k = taperScale(taper, v.y, BLOB_TAPER);
    position.setXYZ(i, v.x * a * k, v.y * b, v.z * c * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** blob: superellipsoid with continuous height tapering (|x/a|^p + |y/b|^p + |z/c|^p = 1) */
function blobGeometry(part: SculptPart): THREE.BufferGeometry {
  return createSuperellipsoidGeometry(part.size, part.roundness ?? 0.3, part.taper ?? 0);
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
      return blobGeometry(part);
    case 'box': {
      const bevel = (part.roundness ?? 0.06) * Math.min(w, h, d) * 0.5;
      if (bevel <= 0.0005) return new THREE.BoxGeometry(w, h, d);
      return new RoundedBoxGeometry(w, h, d, 4, bevel);
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

function materialFor(m: SculptMaterial | undefined, size?: Vec3): THREE.Material {
  if (!m) return createTactileClayMaterial({ color: '#9aa3ad', roughness: 0.82, metalness: 0.05, size });
  return createTactileClayMaterial({
    material: m.id,
    color: m.color,
    roughness: m.roughness,
    metalness: m.metalness,
    size,
  });
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

  // Group cutters by parent and non-cutters into scene graph children
  const cuttersByParent = new Map<string, SculptPart[]>();
  const children = new Map<string | undefined, SculptPart[]>();
  for (const p of spec.parts) {
    if (p.op) {
      if (p.parent) {
        const list = cuttersByParent.get(p.parent) ?? [];
        list.push(p);
        cuttersByParent.set(p.parent, list);
      }
      continue;
    }
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

    let geom = geometryForPart(source);

    // Apply CSG cutters if any cutter parts target this parent
    const myCutters = cuttersByParent.get(part.id);
    if (myCutters && myCutters.length > 0) {
      const parentEuler = new THREE.Euler(part.rotation[0] * DEG, part.rotation[1] * DEG * mirror, part.rotation[2] * DEG * mirror);
      const parentMatrix = new THREE.Matrix4().compose(
        world,
        new THREE.Quaternion().setFromEuler(parentEuler),
        new THREE.Vector3(1, 1, 1)
      );

      const cutterTargets: (CutterTarget & { sourcePart: SculptPart })[] = myCutters.map((c) => {
        const cWorld = new THREE.Vector3(c.position[0] * mirror, c.position[1], c.position[2]);
        const cEuler = new THREE.Euler(c.rotation[0] * DEG, c.rotation[1] * DEG * mirror, c.rotation[2] * DEG * mirror);
        const cMatrix = new THREE.Matrix4().compose(
          cWorld,
          new THREE.Quaternion().setFromEuler(cEuler),
          new THREE.Vector3(1, 1, 1)
        );
        return {
          id: c.id,
          parent: part.id,
          op: c.op,
          matrix: cMatrix,
          sourcePart: c,
        };
      });

      geom = cutSculptGeometry(
        geom,
        { id: part.id, matrix: parentMatrix },
        cutterTargets,
        (ct: any) => {
          let cSource: SculptPart = ct.sourcePart;
          if (mirror === -1) {
            if (cSource.shape === 'tube') cSource = { ...cSource, points: cSource.points?.map((pt) => [-pt[0], pt[1], pt[2]] as Vec3) };
            else if (cSource.shape === 'extrude') cSource = { ...cSource, outline: cSource.outline?.map(([x, y]) => [-x, y] as Vec2) };
          }
          return geometryForPart(cSource);
        }
      );
    }

    const partMat = materials.get(part.material) || createTactileClayMaterial({
      color: part.color,
      roughness: 0.82,
      metalness: 0.05,
      size: part.size,
    });

    if (part.gradient) {
      applyPartGradient(geom, partMat, part.color || '#ded8c8', part.gradient, part.size);
    }

    const mesh = new THREE.Mesh(geom, partMat);
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

  let boxes = meshes.map((m) => new THREE.Box3().setFromObject(m));
  const touches = (a: THREE.Box3, b: THREE.Box3) => a.clone().expandByScalar(tolerance).intersectsBox(b);

  // 1. Identify primary anchor mesh (largest bounding volume, e.g. main body/hull)
  let anchorIdx = 0;
  let maxVol = 0;
  for (let i = 0; i < boxes.length; i++) {
    const s = boxes[i].getSize(new THREE.Vector3());
    const vol = s.x * s.y * s.z;
    if (vol > maxVol) {
      maxVol = vol;
      anchorIdx = i;
    }
  }

  // 2. Identify the connected component reachable from the anchor
  const getConnected = (): Set<number> => {
    const connected = new Set<number>([anchorIdx]);
    let added = true;
    while (added) {
      added = false;
      for (let i = 0; i < meshes.length; i++) {
        if (connected.has(i)) continue;
        for (const c of connected) {
          if (touches(boxes[i], boxes[c])) {
            connected.add(i);
            added = true;
            break;
          }
        }
      }
    }
    return connected;
  };

  let connected = getConnected();
  let moved = 0;

  // 3. Iteratively snap disconnected floating islands to the connected assembly
  for (let pass = 0; pass < meshes.length; pass++) {
    if (connected.size === meshes.length) break;

    let bestDisconnected = -1;
    let bestGap = Infinity;
    let bestDelta = new THREE.Vector3();

    for (let i = 0; i < meshes.length; i++) {
      if (connected.has(i)) continue;
      const a = boxes[i];
      for (const c of connected) {
        const b = boxes[c];
        const d = new THREE.Vector3(
          a.max.x < b.min.x ? b.min.x - a.max.x : a.min.x > b.max.x ? b.max.x - a.min.x : 0,
          a.max.y < b.min.y ? b.min.y - a.max.y : a.min.y > b.max.y ? b.max.y - a.min.y : 0,
          a.max.z < b.min.z ? b.min.z - a.max.z : a.min.z > b.max.z ? b.max.z - a.min.z : 0
        );
        const gap = d.length();
        if (gap < bestGap) {
          bestGap = gap;
          bestDisconnected = i;
          bestDelta = d;
        }
      }
    }

    if (bestDisconnected < 0 || !Number.isFinite(bestGap)) break;

    const overlapDist = Math.max(0.002, Math.min(0.01, bestGap * 0.15));
    const overlap = bestDelta.clone().normalize().multiplyScalar(overlapDist);
    const worldShift = bestDelta.clone().add(overlap);

    const pivot = meshes[bestDisconnected].parent ?? meshes[bestDisconnected];
    const parent = pivot.parent ?? root;
    const parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    // Transform displacement vector cleanly from world space into parent local coordinates
    const localShift = worldShift.clone().applyMatrix4(parentInv).sub(new THREE.Vector3().applyMatrix4(parentInv));

    pivot.position.add(localShift);
    pivot.updateMatrixWorld(true);
    root.updateMatrixWorld(true);

    boxes = meshes.map((m) => new THREE.Box3().setFromObject(m));
    connected = getConnected();
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
  if (spec.route === 'biped-walker' && (!spec.parts || spec.parts.length === 0)) {
    const compiled = compileCharacterToClaySculpt(
      createDefaultCharacterFeatures({
        name: spec.name || 'Parametric Biped',
        gender: spec.walker?.female ? 'female' : 'male',
        heightMeters: spec.heightMeters,
      })
    );
    const { group: inner } = buildAuthored(compiled);
    const group = normalizeToStage(inner, spec.heightMeters);
    group.userData.sculptSpec = compiled;
    return { group, update: undefined };
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

function getCachedCurated(key: string): SculptSpec | undefined {
  const raw = CURATED_SCULPT_SPECS[key];
  if (!raw) return undefined;
  let cached = curatedCache.get(key);
  if (!cached) {
    cached = sanitizeSculptSpec(raw, key);
    curatedCache.set(key, cached);
  }
  return cached;
}

export function lookupCuratedSculptSpec(idOrPrompt?: string): SculptSpec | undefined {
  if (!idOrPrompt || !idOrPrompt.trim()) return undefined;
  const key = sculptKey(idOrPrompt);
  const lower = idOrPrompt.toLowerCase().trim();

  // 1. Direct match in CURATED_SCULPT_SPECS
  if (CURATED_SCULPT_SPECS[idOrPrompt]) return getCachedCurated(idOrPrompt);
  if (CURATED_SCULPT_SPECS[key]) return getCachedCurated(key);
  if (CURATED_SCULPT_SPECS[lower]) return getCachedCurated(lower);

  // 2. Specific curated model keywords (distinctive multi-word or special names)
  let matchedKey: string | undefined;

  if (/(fireplace|hearth|fire\s*box|chimney\s*piece|mantelpiece|مدفأة|موقد)/i.test(lower)) {
    matchedKey = 'rustic stone fireplace';
  } else if (/(tribal\s*archer|archer\s*female|tribal_archer_female)/i.test(lower)) {
    matchedKey = 'tribal archer female';
  } else if (/(nerd\s*turtle|nerdturtle)/i.test(lower)) {
    matchedKey = 'nerd turtle';
  } else if (/(snorlax|sleeping\s*monster)/i.test(lower)) {
    matchedKey = 'snorlax';
  } else if (/(yatai|yatai\s*stall|japanese\s*food\s*cart)/i.test(lower)) {
    matchedKey = 'yatai stall';
  } else if (/(treasure\s*chest|صندوق\s*كنز)/i.test(lower)) {
    matchedKey = 'treasure chest';
  } else if (/(perfume\s*bottle|قارورة\s*عطر)/i.test(lower)) {
    matchedKey = 'perfume bottle';
  } else if (/(espresso\s*bag|roasted\s*coffee\s*beans\s*pouch)/i.test(lower)) {
    matchedKey = 'espresso bag';
  } else if (/(ancient\s*stone\s*obelisk|monolith\s*pillar|مسلة\s*حجرية)/i.test(lower)) {
    matchedKey = 'ancient stone obelisk';
  } else if (/(tactical\s*hover\s*drone|military\s*recon\s*drone)/i.test(lower)) {
    matchedKey = 'tactical hover drone';
  } else if (/(knight\s*shield|crusader\s*shield|درع\s*فارس)/i.test(lower)) {
    matchedKey = 'knight shield';
  } else if (/(coiled\s*snake\s*ring|snake\s*ring|serpent\s*ring|خاتم\s*ذهبي\s*مفرغ|خاتم\s*أفعى|خاتم)/i.test(lower)) {
    matchedKey = 'coiled snake ring';
  } else if (/(sports\s*car|supercar|سيارة\s*رياضية)/i.test(lower)) {
    matchedKey = 'sports car';
  } else if (/(office\s*chair|كرسي\s*مكتب)/i.test(lower)) {
    matchedKey = 'office chair';
  } else if (/(forged\s*longsword|سيف\s*مطروق|سيف\s*طويل)/i.test(lower)) {
    matchedKey = 'forged longsword';
  } else if (/(glass\s*wine\s*bottle|wine\s*bottle|زجاجة\s*نبيذ|قارورة)/i.test(lower)) {
    matchedKey = 'glass wine bottle';
  } else if (/(cyberpunk\s*hover\s*car|flying\s*police\s*cruiser)/i.test(lower)) {
    matchedKey = 'cyberpunk hover car';
  } else if (/(attack\s*helicopter\s*gunship|military\s*chopper)/i.test(lower)) {
    matchedKey = 'attack helicopter gunship';
  } else if (/(steampunk\s*airship\s*zeppelin|flying\s*dirigible)/i.test(lower)) {
    matchedKey = 'steampunk airship zeppelin';
  } else if (/(camera|dslr|nikon|canon|sony\s*camera|digital\s*camera|vintage\s*camera|كاميرا|آلة\s*تصوير)/i.test(lower)) {
    matchedKey = 'professional dslr camera';
  }

  // 3. Fallback scan of all CURATED_SCULPT_SPECS keys (exact match against catalog key)
  if (!matchedKey) {
    for (const catalogKey of Object.keys(CURATED_SCULPT_SPECS)) {
      if (lower === catalogKey || key === catalogKey) {
        matchedKey = catalogKey;
        break;
      }
    }
  }

  if (matchedKey && CURATED_SCULPT_SPECS[matchedKey]) {
    return getCachedCurated(matchedKey);
  }
  return undefined;
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
