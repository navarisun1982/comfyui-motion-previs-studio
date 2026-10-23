import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  sanitizeSculptSpec,
  buildSculpt,
  registerSculptSpec,
  lookupSculptSpec,
  repairAttachments,
  applySculptPatch,
  partGraphToSculptSpec,
  geometryForPart,
  resetSculptRegistryForTests,
  STAGE_UNITS_PER_METER,
  type SculptPart,
} from '../src/engine/procedural3D/sculptSpec';
import { createProceduralActorMesh } from '../src/engine/procedural3D/proceduralMeshFactory';
import { installMemoryStorage } from './helpers/memoryStorage';

const countMeshes = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) n++;
  });
  return n;
};
const bounds = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
};

// Legacy v1 PartGraph vocabulary (box) on purpose: exercises the converter path.
const table = {
  name: 'Table',
  route: 'author',
  heightMeters: 0.75,
  materials: [{ id: 'oak', color: '#8b5a2b', roughness: 0.7, metalness: 0 }],
  parts: [
    { id: 'top', shape: 'box', size: [1.2, 0.05, 0.8], position: [0, 0.725, 0], rotation: [0, 0, 0], material: 'oak' },
    { id: 'leg_front', shape: 'cylinder', size: [0.05, 0.7, 0.05], position: [0.55, 0.35, 0.35], rotation: [0, 0, 0], material: 'oak', mirrorX: true },
    { id: 'leg_back', shape: 'cylinder', size: [0.05, 0.7, 0.05], position: [0.55, 0.35, -0.35], rotation: [0, 0, 0], material: 'oak', mirrorX: true },
  ],
};

const part = (p: Partial<SculptPart>): SculptPart =>
  sanitizeSculptSpec({ parts: [{ position: [0, 0, 0], rotation: [0, 0, 0], material: '', ...p }] }).parts[0];

describe('SculptSpec sanitisation', () => {
  it('clamps untrusted model output and drops junk', () => {
    const g = sanitizeSculptSpec({
      route: 'nonsense',
      heightMeters: 'tall',
      materials: [{ id: 'm', color: 'not-a-colour', roughness: 9, metalness: -1 }],
      parts: [
        { id: 'a', shape: 'hexagon', size: [NaN, 1e9, -3], position: [0, 0, 0], rotation: [0, 0, 0], material: 'm', parent: 'a' },
        { id: 'a', shape: 'blob', size: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0], material: 'm', parent: 'ghost', roundness: 7 },
      ],
    });
    expect(g.version).toBe(2);
    expect(g.route).toBe('author');
    expect(g.heightMeters).toBe(1);
    expect(g.materials[0].roughness).toBe(1);
    expect(g.materials[0].metalness).toBe(0);
    expect(g.parts[0].shape).toBe('blob');
    expect(g.parts[0].size.every((s) => s > 0 && s <= 60)).toBe(true);
    expect(g.parts[0].parent).toBeUndefined();
    expect(g.parts[1].id).not.toBe(g.parts[0].id);
    expect(g.parts[1].parent).toBeUndefined();
    expect(g.parts[1].roundness).toBe(1);
  });

  it('drops degenerate lathe profiles and extrude outlines', () => {
    expect(part({ shape: 'lathe', size: [1, 1, 1], profile: [[0.5, 0]] as any }).profile).toBeUndefined();
    expect(part({ shape: 'extrude', size: [1, 1, 1], outline: [[0, 0], [1, 1]] as any }).outline).toBeUndefined();
    const ok = part({ shape: 'extrude', size: [1, 1, 0.1], outline: [[-9, -0.5], [0.5, -0.5], [0, 0.5]] as any });
    expect(ok.outline?.[0][0]).toBe(-0.5);
  });

  it('keeps only known humanoid bones and infers rig', () => {
    const r = sanitizeSculptSpec({
      parts: [
        { id: 'head', shape: 'blob', size: [0.2, 0.25, 0.2], bone: 'Head' },
        { id: 'tail', shape: 'tube', size: [0.05, 0, 0], bone: 'Tail' },
      ],
    });
    expect(r.parts[0].bone).toBe('Head');
    expect(r.parts[1].bone).toBeUndefined();
    expect(r.rig).toBe('humanoid');
  });
});

describe('PartGraph v1 -> SculptSpec v2 migration', () => {
  it('maps box and ellipsoid to blob and leaves other shapes intact', () => {
    const r = partGraphToSculptSpec({
      version: 1,
      parts: [
        { id: 'b', shape: 'box' },
        { id: 'e', shape: 'ellipsoid' },
        { id: 'c', shape: 'capsule' },
      ],
    });
    expect(r.version).toBe(2);
    expect(r.parts.map((p: any) => [p.shape, p.roundness])).toEqual([
      ['blob', 0.24],
      ['blob', 1],
      ['capsule', undefined],
    ]);
  });

  it('migrates the legacy localStorage registry to the v2 key', () => {
    installMemoryStorage();
    localStorage.setItem('aids.partGraphs.v1', JSON.stringify({ 'old chair': { ...table, version: 1 } }));
    resetSculptRegistryForTests();
    const r = lookupSculptSpec('old chair');
    expect(r?.version).toBe(2);
    expect(r?.parts[0].shape).toBe('blob');
    expect(localStorage.getItem('aids.partGraphs.v1')).toBeNull();
    expect(JSON.parse(localStorage.getItem('aids.sculptSpecs.v2') || '{}')['old chair']).toBeDefined();
  });
});

describe('Sculpt shapes', () => {
  it('blob roundness spans box to ellipsoid within the same bounds', () => {
    const box = geometryForPart(part({ shape: 'blob', size: [2, 1, 1], roundness: 0 }));
    const ell = geometryForPart(part({ shape: 'blob', size: [2, 1, 1], roundness: 1 }));
    box.computeBoundingBox();
    ell.computeBoundingBox();
    expect(box.boundingBox!.max.x).toBeCloseTo(1, 3);
    expect(ell.boundingBox!.max.x).toBeCloseTo(1, 2);
    const maxNorm = (g: THREE.BufferGeometry) => {
      const pos = g.getAttribute('position');
      let m = 0;
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        m = Math.max(m, (v.x / 1) ** 2 + (v.y / 0.5) ** 2 + (v.z / 0.5) ** 2);
      }
      return m;
    };
    expect(maxNorm(ell)).toBeLessThan(1.02);
    expect(maxNorm(box)).toBeGreaterThan(2.5);
  });

  it('lathe revolves the profile to the requested size', () => {
    const g = geometryForPart(part({ shape: 'lathe', size: [0.4, 1, 0.4], profile: [[0, 0], [1, 0.1], [0.3, 0.6], [0.6, 1]] }));
    g.computeBoundingBox();
    const s = g.boundingBox!.getSize(new THREE.Vector3());
    expect(s.y).toBeCloseTo(1, 3);
    expect(s.x).toBeCloseTo(0.4, 2);
    expect(s.z).toBeCloseTo(0.4, 2);
  });

  it('extrude fills width, height and depth including the bevel', () => {
    const g = geometryForPart(
      part({ shape: 'extrude', size: [1, 0.6, 0.1], outline: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], bevel: 0.2 })
    );
    g.computeBoundingBox();
    const s = g.boundingBox!.getSize(new THREE.Vector3());
    expect(s.x).toBeCloseTo(1, 2);
    expect(s.y).toBeCloseTo(0.6, 2);
    expect(s.z).toBeCloseTo(0.1, 2);
  });
});

describe('Sculpt builder', () => {
  it('builds every described part, mirrors pairs and grounds at real-world scale', () => {
    const kit = buildSculpt(sanitizeSculptSpec(table));
    expect(countMeshes(kit.group)).toBe(5);
    const box = bounds(kit.group);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeCloseTo(0.75 * STAGE_UNITS_PER_METER, 2);
    expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(1e-3);
  });

  it('tags pivots with bones and swaps Left/Right on mirrored copies', () => {
    const kit = buildSculpt(
      sanitizeSculptSpec({
        heightMeters: 1.7,
        parts: [
          { id: 'torso', shape: 'blob', size: [0.4, 0.6, 0.25], position: [0, 1.2, 0], bone: 'Chest' },
          { id: 'arm', parent: 'torso', shape: 'capsule', size: [0.1, 0.5, 0.1], position: [0.28, 1.15, 0], mirrorX: true, bone: 'LeftArm' },
        ],
      })
    );
    expect(kit.group.getObjectByName('arm')!.userData.bone).toBe('LeftArm');
    expect(kit.group.getObjectByName('arm_mirror')!.userData.bone).toBe('RightArm');
    expect(kit.group.getObjectByName('torso')!.userData.bone).toBe('Chest');
  });

  it('animates parts that carry motion together with their children', () => {
    const kit = buildSculpt(
      sanitizeSculptSpec({
        name: 'Windmill',
        route: 'author',
        heightMeters: 6,
        materials: [{ id: 'w', color: '#ddd', roughness: 0.6, metalness: 0 }],
        parts: [
          { id: 'tower', shape: 'cylinder', size: [1, 5, 1], position: [0, 2.5, 0], rotation: [0, 0, 0], material: 'w' },
          { id: 'hub', shape: 'cylinder', size: [0.3, 0.3, 0.3], position: [0, 5, 0.6], rotation: [90, 0, 0], material: 'w', motion: { type: 'spin', axis: 'z', speed: 2, amplitude: 0 } },
          { id: 'blade', parent: 'hub', shape: 'blob', size: [0.2, 2, 0.05], position: [0, 6, 0.6], rotation: [0, 0, 0], material: 'w' },
        ],
      })
    );
    expect(kit.update).toBeDefined();
    const blade = kit.group.getObjectByName('blade')!;
    const before = new THREE.Vector3();
    blade.getWorldPosition(before);
    kit.update!(0.5);
    const after = new THREE.Vector3();
    blade.getWorldPosition(after);
    expect(after.distanceTo(before)).toBeGreaterThan(0.01);
  });

  it('reattaches a part that the model left floating', () => {
    const g = sanitizeSculptSpec({
      name: 'Lamp',
      route: 'author',
      heightMeters: 1,
      materials: [],
      parts: [
        { id: 'base', shape: 'cylinder', size: [0.3, 0.05, 0.3], position: [0, 0.025, 0], rotation: [0, 0, 0], material: '' },
        { id: 'stem', shape: 'cylinder', size: [0.03, 0.6, 0.03], position: [0, 0.35, 0], rotation: [0, 0, 0], material: '' },
        { id: 'shade', shape: 'cone', size: [0.4, 0.25, 0.4], position: [0, 1.2, 0], rotation: [0, 0, 0], material: '' },
      ],
    });
    const kit = buildSculpt(g);
    expect(repairAttachments(kit.group.children[0])).toBe(0);
    const stem = bounds(kit.group.getObjectByName('stem')!);
    const shade = bounds(kit.group.getObjectByName('shade')!);
    expect(shade.min.y).toBeLessThanOrEqual(stem.max.y + 1e-3);
  });

  it('routes animals to the canonical quadruped walker only when the reasoner chose it', () => {
    const kit = buildSculpt(
      sanitizeSculptSpec({
        name: 'Camel',
        route: 'quadruped-walker',
        heightMeters: 1.9,
        walker: { coat: '#c19a6b', morphology: { build: 'humped', neckLength: 1.8 } },
        materials: [],
        parts: [],
      })
    );
    expect(countMeshes(kit.group)).toBeGreaterThan(10);
    expect(bounds(kit.group).max.y).toBeCloseTo(1.9 * STAGE_UNITS_PER_METER, 1);
  });
});

describe('Revision patches', () => {
  it('applies set/add/remove and re-sanitises', () => {
    const base = sanitizeSculptSpec(table);
    const next = applySculptPatch(base, {
      set: [{ id: 'top', size: [2, 0.05, 0.8] }, { id: 'ghost', size: [9, 9, 9] }],
      add: [{ id: 'vase', shape: 'lathe', size: [0.1, 0.3, 0.1], position: [0, 0.9, 0], profile: [[0.3, 0], [1, 0.4], [0.4, 1]] }],
      remove: ['leg_back'],
      materials: [{ id: 'oak', color: '#000000' }],
    });
    expect(next.parts.find((p) => p.id === 'top')!.size[0]).toBe(2);
    expect(next.parts.find((p) => p.id === 'ghost')).toBeUndefined();
    expect(next.parts.find((p) => p.id === 'leg_back')).toBeUndefined();
    expect(next.parts.find((p) => p.id === 'vase')!.shape).toBe('lathe');
    expect(next.materials[0].color).toBe('#000000');
    expect(base.parts.find((p) => p.id === 'top')!.size[0]).toBe(1.2);
  });
});

describe('Stage factory uses reasoned sculpts', () => {
  beforeEach(() => {
    installMemoryStorage();
    resetSculptRegistryForTests();
  });

  it('renders the registered sculpt for a generated prompt instead of the catalog', () => {
    registerSculptSpec('my oak table', sanitizeSculptSpec(table));
    const mesh = createProceduralActorMesh({ category: 'prop', name: 'My oak table', tokenPrompt: 'my oak table' });
    expect(mesh.userData.reasonedGraph).toBe(true);
    expect(countMeshes(mesh)).toBe(5);
  });

  it('resolves curated Rustic Stone Fireplace with glowing embers and flame core', () => {
    const graphDirect = lookupSculptSpec('fireplace');
    expect(graphDirect).toBeDefined();
    expect(graphDirect?.name).toBe('Rustic Stone Fireplace');
    expect(graphDirect?.version).toBe(2);

    const graphPrompt = lookupSculptSpec('a rustic stone fireplace with glowing warm embers');
    expect(graphPrompt?.name).toBe('Rustic Stone Fireplace');

    const mesh = createProceduralActorMesh({
      category: 'prop',
      name: 'Rustic Stone Fireplace',
      tokenPrompt: 'a rustic stone fireplace with glowing warm embers and flickering flames',
    });
    expect(mesh.userData.reasonedGraph).toBe(true);
    expect(countMeshes(mesh)).toBeGreaterThanOrEqual(10);
    expect(typeof mesh.userData.update).toBe('function');
  });
});
