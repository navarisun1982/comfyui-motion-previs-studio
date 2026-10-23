import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  sanitizePartGraph,
  buildPartGraph,
  registerPartGraph,
  lookupPartGraph,
  repairAttachments,
  STAGE_UNITS_PER_METER,
} from '../src/engine/procedural3D/partGraph';
import { createProceduralActorMesh } from '../src/engine/procedural3D/proceduralMeshFactory';

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

describe('Part graph sanitisation', () => {
  it('clamps untrusted model output and drops junk', () => {
    const g = sanitizePartGraph({
      route: 'nonsense',
      heightMeters: 'tall',
      materials: [{ id: 'm', color: 'not-a-colour', roughness: 9, metalness: -1 }],
      parts: [
        { id: 'a', shape: 'hexagon', size: [NaN, 1e9, -3], position: [0, 0, 0], rotation: [0, 0, 0], material: 'm', parent: 'a' },
        { id: 'a', shape: 'box', size: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0], material: 'm', parent: 'ghost' },
      ],
    });
    expect(g.route).toBe('author');
    expect(g.heightMeters).toBe(1);
    expect(g.materials[0].roughness).toBe(1);
    expect(g.materials[0].metalness).toBe(0);
    expect(g.parts[0].shape).toBe('box');
    expect(g.parts[0].size.every((s) => s > 0 && s <= 60)).toBe(true);
    expect(g.parts[0].parent).toBeUndefined();
    expect(g.parts[1].id).not.toBe(g.parts[0].id);
    expect(g.parts[1].parent).toBeUndefined();
  });
});

describe('Part graph builder', () => {
  it('builds every described part, mirrors pairs and grounds at real-world scale', () => {
    const kit = buildPartGraph(sanitizePartGraph(table));
    expect(countMeshes(kit.group)).toBe(5); // top + 2 legs x mirror
    const box = bounds(kit.group);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeCloseTo(0.75 * STAGE_UNITS_PER_METER, 2);
    expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(1e-3);
  });

  it('animates parts that carry motion together with their children', () => {
    const kit = buildPartGraph(
      sanitizePartGraph({
        name: 'Windmill',
        route: 'author',
        heightMeters: 6,
        materials: [{ id: 'w', color: '#ddd', roughness: 0.6, metalness: 0 }],
        parts: [
          { id: 'tower', shape: 'cylinder', size: [1, 5, 1], position: [0, 2.5, 0], rotation: [0, 0, 0], material: 'w' },
          { id: 'hub', shape: 'cylinder', size: [0.3, 0.3, 0.3], position: [0, 5, 0.6], rotation: [90, 0, 0], material: 'w', motion: { type: 'spin', axis: 'z', speed: 2, amplitude: 0 } },
          { id: 'blade', parent: 'hub', shape: 'box', size: [0.2, 2, 0.05], position: [0, 6, 0.6], rotation: [0, 0, 0], material: 'w' },
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
    const g = sanitizePartGraph({
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
    const kit = buildPartGraph(g);
    // After repair, nothing is left floating.
    expect(repairAttachments(kit.group.children[0])).toBe(0);
    const stem = bounds(kit.group.getObjectByName('stem')!);
    const shade = bounds(kit.group.getObjectByName('shade')!);
    expect(shade.min.y).toBeLessThanOrEqual(stem.max.y + 1e-3);
  });

  it('routes animals to the canonical quadruped walker only when the reasoner chose it', () => {
    const kit = buildPartGraph(
      sanitizePartGraph({
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

describe('Stage factory uses reasoned graphs', () => {
  it('renders the registered part graph for a generated prompt instead of the catalog', () => {
    registerPartGraph('my oak table', sanitizePartGraph(table));
    const mesh = createProceduralActorMesh({ category: 'prop', name: 'My oak table', tokenPrompt: 'my oak table' });
    expect(mesh.userData.reasonedGraph).toBe(true);
    expect(countMeshes(mesh)).toBe(5);
  });

  it('resolves curated Rustic Stone Fireplace with glowing embers and flame core', () => {
    const graphDirect = lookupPartGraph('fireplace');
    expect(graphDirect).toBeDefined();
    expect(graphDirect?.name).toBe('Rustic Stone Fireplace');

    const graphPrompt = lookupPartGraph('a rustic stone fireplace with glowing warm embers');
    expect(graphPrompt).toBeDefined();
    expect(graphPrompt?.name).toBe('Rustic Stone Fireplace');

    // Builds the full multi-part assembly (pillars, lintel, grate, charred logs, embers, flame)
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
