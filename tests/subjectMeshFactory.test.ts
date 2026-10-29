// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createSubjectMesh, CreateSubjectMeshOptions } from '../src/engine/staging/subjectMeshFactory';

describe('Universal Subject Mesh Factory (subjectMeshFactory.ts)', () => {
  beforeAll(() => {
    // Mock HTMLCanvasElement.getContext for jsdom/node environment where canvas sprites are built
    if (typeof HTMLCanvasElement !== 'undefined') {
      HTMLCanvasElement.prototype.getContext = (() => ({
        fillRect: () => {},
        clearRect: () => {},
        getImageData: () => ({ data: new Array(4) }),
        putImageData: () => {},
        createImageData: () => ({ data: new Array(4) }),
        setTransform: () => {},
        drawImage: () => {},
        save: () => {},
        fillText: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        arc: () => {},
        fill: () => {},
        measureText: () => ({ width: 80 }),
        transform: () => {},
        rect: () => {},
        roundRect: () => {},
        clip: () => {},
      })) as any;
    }
  });

  it('creates subject mesh via positional parameters (backwards-compatible)', () => {
    const group = createSubjectMesh(
      'Hero Warrior',
      'human',
      0xd4af37,
      false,
      'Lead',
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      'idle',
      undefined,
      true
    );

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
    expect(group.userData.subjectName).toBe('Hero Warrior');
    expect(group.userData.subjectKind).toBe('human');
  });

  it('creates subject mesh via options object with defaults', () => {
    const opts: CreateSubjectMeshOptions = {
      name: 'Sci-Fi Hovercraft',
      kind: 'vehicle',
      colorHex: 0x00ffff,
      isSelected: false,
    };

    const group = createSubjectMesh(opts);

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.userData.subjectName).toBe('Sci-Fi Hovercraft');
    expect(group.userData.subjectKind).toBe('vehicle');
    expect(group.children.length).toBeGreaterThan(0);
  });

  it('generates primitive geometry for non-human shapes', () => {
    const cubeGroup = createSubjectMesh({
      name: 'Cargo Box',
      kind: 'cube',
      colorHex: 0x888888,
    });
    let hasCubeMesh = false;
    cubeGroup.traverse((c) => {
      if (c instanceof THREE.Mesh) hasCubeMesh = true;
    });
    expect(hasCubeMesh).toBe(true);

    const sphereGroup = createSubjectMesh({
      name: 'Energy Orb',
      kind: 'sphere',
      colorHex: 0xff00ff,
    });
    let hasSphereMesh = false;
    sphereGroup.traverse((c) => {
      if (c instanceof THREE.Mesh) hasSphereMesh = true;
    });
    expect(hasSphereMesh).toBe(true);

    const quadGroup = createSubjectMesh({
      name: 'Cyber Dog',
      kind: 'quadruped',
      colorHex: 0x33ff33,
    });
    expect(quadGroup.children.length).toBeGreaterThan(0);
  });

  it('applies ghost wireframe styling when isGhostWireframe is enabled', () => {
    const group = createSubjectMesh({
      name: 'Phantom Apparition',
      kind: 'cylinder',
      isGhostWireframe: true,
      colorHex: 0x00ffcc,
    });

    let foundWireframe = false;
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (mat.wireframe === true || mat.opacity < 0.6) {
          foundWireframe = true;
        }
      }
    });

    expect(foundWireframe).toBe(true);
  });

  it('respects showLabels toggle by setting banner visibility to false', () => {
    const groupWithoutLabels = createSubjectMesh({
      name: 'Stealth Scout',
      kind: 'human',
      showLabels: false,
    });

    let visibleSpriteCount = 0;
    groupWithoutLabels.traverse((obj) => {
      if (obj instanceof THREE.Sprite && obj.visible) {
        visibleSpriteCount++;
      }
    });

    expect(visibleSpriteCount).toBe(0);
  });
});
