// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  isGreyboxPrimitiveKind,
  createGreyboxPrimitiveMesh,
  GREYBOX_KINDS,
} from '../src/engine/staging/greyboxPrimitives';
import {
  isCutoutKind,
  createCutoutMesh,
  CUTOUT_DEFAULT_HEIGHT,
  BACKDROP_DEFAULT_HEIGHT,
} from '../src/engine/staging/cutoutMeshFactory';
import { createSubjectMesh } from '../src/engine/staging/subjectMeshFactory';

describe('Previs Staging: Greybox Primitives & Cutouts', () => {
  beforeAll(() => {
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
        strokeRect: () => {},
        rect: () => {},
        roundRect: () => {},
      })) as any;
    }
  });

  describe('Greybox Primitives', () => {
    it('accurately identifies greybox primitive kinds', () => {
      expect(isGreyboxPrimitiveKind('cube')).toBe(true);
      expect(isGreyboxPrimitiveKind('box')).toBe(true);
      expect(isGreyboxPrimitiveKind('sphere')).toBe(true);
      expect(isGreyboxPrimitiveKind('cylinder')).toBe(true);
      expect(isGreyboxPrimitiveKind('capsule')).toBe(true);
      expect(isGreyboxPrimitiveKind('cone')).toBe(true);
      expect(isGreyboxPrimitiveKind('plane')).toBe(true);

      expect(isGreyboxPrimitiveKind('human')).toBe(false);
      expect(isGreyboxPrimitiveKind('car')).toBe(false);
      expect(isGreyboxPrimitiveKind('prop')).toBe(false);
    });

    it('creates grounded cube mesh with bottom at y = 0', () => {
      const mesh = createGreyboxPrimitiveMesh('cube', { width: 2, height: 3, depth: 4 });
      expect(mesh).toBeInstanceOf(THREE.Mesh);
      expect(mesh.position.y).toBe(1.5); // Center at h/2 = 1.5, bottom at 0
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    });

    it('creates all registered greybox kinds without throwing', () => {
      for (const kind of GREYBOX_KINDS) {
        const mesh = createGreyboxPrimitiveMesh(kind, { colorHex: 0x555555 });
        expect(mesh).toBeInstanceOf(THREE.Mesh);
        expect(mesh.position.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Cutouts & Standees', () => {
    it('accurately identifies cutout kinds', () => {
      expect(isCutoutKind('cutout')).toBe(true);
      expect(isCutoutKind('standee')).toBe(true);
      expect(isCutoutKind('backdrop')).toBe(true);
      expect(isCutoutKind('billboard')).toBe(true);

      expect(isCutoutKind('human')).toBe(false);
      expect(isCutoutKind('cube')).toBe(false);
    });

    it('creates standee card with default 1.8m height and pedestal', () => {
      const group = createCutoutMesh({
        name: 'Guard Standee',
        kind: 'standee',
        aspect: 0.6,
      });

      expect(group).toBeInstanceOf(THREE.Group);
      expect(group.userData.isCutout).toBe(true);
      expect(group.userData.height).toBe(CUTOUT_DEFAULT_HEIGHT);
      expect(group.userData.width).toBeCloseTo(1.8 * 0.6, 2);

      // Card mesh check
      const card = group.getObjectByName('standee_card') as THREE.Mesh;
      expect(card).toBeDefined();
      expect(card.position.y).toBe(CUTOUT_DEFAULT_HEIGHT * 0.5);

      // Standee pedestal check
      const pedestal = group.getObjectByName('standee_pedestal');
      expect(pedestal).toBeDefined();
    });

    it('creates backdrop plate with 5m height and no pedestal', () => {
      const group = createCutoutMesh({
        name: 'City Skyline',
        kind: 'backdrop',
        aspect: 16 / 9,
      });

      expect(group.userData.height).toBe(BACKDROP_DEFAULT_HEIGHT);
      const pedestal = group.getObjectByName('standee_pedestal');
      expect(pedestal).toBeUndefined(); // Backdrops don't have pedestals
    });
  });

  describe('SubjectMeshFactory Staging Integration', () => {
    it('generates a clean Cutout Standee when kind is cutout', () => {
      const group = createSubjectMesh({
        name: 'Rebel Soldier Standee',
        kind: 'cutout',
        colorHex: 0xffffff,
      });

      expect(group).toBeInstanceOf(THREE.Group);
      expect(group.userData.subjectKind).toBe('cutout');

      let hasCard = false;
      group.traverse((child) => {
        if (child.name === 'standee_card') hasCard = true;
      });
      expect(hasCard).toBe(true);
    });

    it('generates an authentic Greybox Primitive when kind is cylinder', () => {
      const group = createSubjectMesh({
        name: 'Pillar Column',
        kind: 'cylinder',
        colorHex: 0x999999,
      });

      expect(group).toBeInstanceOf(THREE.Group);
      expect(group.userData.subjectKind).toBe('cylinder');

      let hasCylinder = false;
      group.traverse((child) => {
        if (child.name === 'greybox_cylinder') hasCylinder = true;
      });
      expect(hasCylinder).toBe(true);
    });
  });
});
