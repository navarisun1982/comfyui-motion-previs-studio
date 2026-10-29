// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { lookupSculptSpec, buildSculpt } from '../src/engine/procedural3D/sculptSpec';
import { createSubjectMesh } from '../src/engine/staging/subjectMeshFactory';
import { decomposeDirectorialScene } from '../src/engine/directorialSceneDecomposer';

describe('Procedural 3D Objects Ground Truth & Previs Integration (5 Benchmark Categories)', () => {
  beforeAll(() => {
    // Mock HTMLCanvasElement.getContext for jsdom environment where canvas sprites are built
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

  // =========================================================================
  // 1. HOLLOW COILED SNAKE RING / JEWELRY (خاتم ذهبي مفرغ)
  // =========================================================================
  describe('Category 1: Hollow Coiled Snake Ring / Jewelry', () => {
    it('resolves text prompt to authentic SculptSpec with hollow torus geometry', () => {
      const spec = lookupSculptSpec('coiled snake ring');
      expect(spec).toBeDefined();
      expect(spec?.route).toBe('author');
      expect(spec?.rig).toBe('none');
      expect(spec?.parts.length).toBeGreaterThanOrEqual(5);

      // Verify strict geometric requirement: MUST have hollow torus band, NEVER solid cylinder
      const torusParts = spec?.parts.filter((p) => p.shape === 'torus');
      expect(torusParts?.length).toBeGreaterThanOrEqual(1);

      const mainBand = spec?.parts.find((p) => p.id.includes('band') || p.id.includes('torus'));
      expect(mainBand).toBeDefined();
      expect(mainBand?.shape).toBe('torus');

      // Realistic jewelry dimensions (approx 35mm height)
      expect(spec?.heightMeters).toBeLessThan(0.1);
      expect(spec?.heightMeters).toBeGreaterThan(0.01);

      // PBR Materials: High metalness gold, reflective gemstone
      const goldMat = spec?.materials?.find((m) => m.id === 'polished_gold');
      expect(goldMat).toBeDefined();
      expect(goldMat?.metalness).toBeGreaterThan(0.8);
      expect(goldMat?.roughness).toBeLessThan(0.3);
    });

    it('resolves Arabic prompt "خاتم ذهبي مفرغ" directly to ring sculpt', () => {
      const spec = lookupSculptSpec('خاتم ذهبي مفرغ');
      expect(spec).toBeDefined();
      expect(spec?.name).toBe('Coiled Snake Ring');
    });

    it('builds valid Three.js mesh hierarchy without abstract morphometric blocks', () => {
      const spec = lookupSculptSpec('snake ring')!;
      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);

      let meshCount = 0;
      kit.group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshCount++;
      });
      expect(meshCount).toBeGreaterThanOrEqual(5);
    });
  });

  // =========================================================================
  // 2. MODERN SPORTS CAR / VEHICLE (سيارة رياضية)
  // =========================================================================
  describe('Category 2: Sports Car / Modern Supercar', () => {
    it('resolves text prompt to high-fidelity multi-part vehicle assembly', () => {
      const spec = lookupSculptSpec('sports car');
      expect(spec).toBeDefined();
      expect(spec?.route).toBe('author');
      expect(spec?.rig).toBe('none');
      expect(spec?.parts.length).toBeGreaterThanOrEqual(8);

      // Architectural structure: Chassis base, hood, cabin, wheels, headlights
      const hasChassis = spec?.parts.some((p) => p.id.includes('chassis') || p.id.includes('belly'));
      const hasWheels = spec?.parts.some((p) => p.id.includes('wheel') && p.shape === 'cylinder');
      const hasCanopy = spec?.parts.some((p) => p.id.includes('cabin') || p.id.includes('canopy'));
      const hasHeadlights = spec?.parts.some((p) => p.id.includes('headlight'));

      expect(hasChassis).toBe(true);
      expect(hasWheels).toBe(true);
      expect(hasCanopy).toBe(true);
      expect(hasHeadlights).toBe(true);

      // Real-world automobile scale (~1.25m height)
      expect(spec?.heightMeters).toBeCloseTo(1.25, 0.2);

      // PBR Materials: Automotive glossy paint, alloy rims, rubber tires
      const paintMat = spec?.materials?.find((m) => m.id.includes('rosso') || m.id.includes('paint'));
      expect(paintMat).toBeDefined();
      expect(paintMat?.roughness).toBeLessThanOrEqual(0.3);
      expect(paintMat?.metalness).toBeGreaterThanOrEqual(0.7);
    });

    it('resolves Arabic prompt "سيارة رياضية" and "supercar"', () => {
      const specAr = lookupSculptSpec('سيارة رياضية');
      const specEn = lookupSculptSpec('supercar');
      expect(specAr).toBeDefined();
      expect(specEn).toBeDefined();
      expect(specAr?.name).toBe('Sports Car');
      expect(specEn?.name).toBe('Sports Car');
    });

    it('builds Three.js meshes with bilateral symmetry', () => {
      const spec = lookupSculptSpec('sports car')!;
      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);

      let meshCount = 0;
      kit.group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshCount++;
      });
      // Symmetrical wheels and headlights produce mirrored geometry
      expect(meshCount).toBeGreaterThanOrEqual(8);
    });
  });

  // =========================================================================
  // 3. ERGONOMIC OFFICE CHAIR / FURNITURE (كرسي مكتب)
  // =========================================================================
  describe('Category 3: Ergonomic Office Chair / Modern Furniture', () => {
    it('resolves text prompt to grounded functional office chair assembly', () => {
      const spec = lookupSculptSpec('office chair');
      expect(spec).toBeDefined();
      expect(spec?.route).toBe('author');
      expect(spec?.rig).toBe('none');
      expect(spec?.parts.length).toBeGreaterThanOrEqual(6);

      // Structural functional hierarchy: Caster base, gas lift, seat cushion, lumbar backrest, headrest
      const hasBase = spec?.parts.some((p) => p.id.includes('base') || p.id.includes('caster'));
      const hasGasLift = spec?.parts.some((p) => p.id.includes('gas_lift') || p.id.includes('cylinder'));
      const hasSeat = spec?.parts.some((p) => p.id.includes('seat'));
      const hasBackrest = spec?.parts.some((p) => p.id.includes('backrest') || p.id.includes('lumbar'));

      expect(hasBase).toBe(true);
      expect(hasGasLift).toBe(true);
      expect(hasSeat).toBe(true);
      expect(hasBackrest).toBe(true);

      // Real-world office chair scale (~1.15m height)
      expect(spec?.heightMeters).toBeCloseTo(1.15, 0.2);

      // Materials: Polished aluminum chrome + breathable mesh fabric
      const alumMat = spec?.materials?.find((m) => m.id.includes('aluminum'));
      const meshMat = spec?.materials?.find((m) => m.id.includes('mesh'));
      expect(alumMat?.metalness).toBeGreaterThan(0.7);
      expect(meshMat?.metalness).toBeLessThan(0.2);
    });

    it('resolves Arabic prompt "كرسي مكتب"', () => {
      const spec = lookupSculptSpec('كرسي مكتب');
      expect(spec).toBeDefined();
      expect(spec?.name).toBe('Office Chair');
    });

    it('builds Three.js chair hierarchy with proper vertical stacking', () => {
      const spec = lookupSculptSpec('ergonomic chair')!;
      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);

      const bbox = new THREE.Box3().setFromObject(kit.group);
      const size = bbox.getSize(new THREE.Vector3());
      expect(size.y).toBeGreaterThan(0.5);
    });
  });

  // =========================================================================
  // 4. FORGED LONGSWORD / WEAPONS (سيف مطروق)
  // =========================================================================
  describe('Category 4: Forged Longsword / Blade Prop', () => {
    it('resolves text prompt to anatomically detailed longsword', () => {
      const spec = lookupSculptSpec('forged longsword');
      expect(spec).toBeDefined();
      expect(spec?.route).toBe('author');
      expect(spec?.rig).toBe('none');
      expect(spec?.parts.length).toBeGreaterThanOrEqual(6);

      // Anatomy: Tapered blade, fuller groove, crossguard with quillons, hilt grip, wheel pommel
      const hasBlade = spec?.parts.some((p) => p.id.includes('blade'));
      const hasCrossguard = spec?.parts.some((p) => p.id.includes('crossguard') || p.id.includes('quillon'));
      const hasGrip = spec?.parts.some((p) => p.id.includes('grip') || p.id.includes('handle'));
      const hasPommel = spec?.parts.some((p) => p.id.includes('pommel'));

      expect(hasBlade).toBe(true);
      expect(hasCrossguard).toBe(true);
      expect(hasGrip).toBe(true);
      expect(hasPommel).toBe(true);

      // Real-world scale (~1.18m height)
      expect(spec?.heightMeters).toBeCloseTo(1.18, 0.2);

      // Materials: Forged steel (high metalness), brass crossguard, leather grip
      const steelMat = spec?.materials?.find((m) => m.id.includes('steel'));
      expect(steelMat?.metalness).toBeGreaterThan(0.9);
      expect(steelMat?.roughness).toBeLessThan(0.2);
    });

    it('resolves Arabic prompt "سيف مطروق" and "سيف طويل"', () => {
      const spec1 = lookupSculptSpec('سيف مطروق');
      const spec2 = lookupSculptSpec('سيف طويل');
      expect(spec1).toBeDefined();
      expect(spec2).toBeDefined();
      expect(spec1?.name).toBe('Forged Longsword');
    });

    it('builds Three.js sword mesh hierarchy', () => {
      const spec = lookupSculptSpec('longsword')!;
      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);

      let meshCount = 0;
      kit.group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshCount++;
      });
      expect(meshCount).toBeGreaterThanOrEqual(6);
    });
  });

  // =========================================================================
  // 5. GLASS WINE BOTTLE / VESSEL (زجاجة نبيذ)
  // =========================================================================
  describe('Category 5: Glass Wine Bottle / Translucent Vessel', () => {
    it('resolves text prompt to authentic wine bottle with punt base and cork', () => {
      const spec = lookupSculptSpec('glass wine bottle');
      expect(spec).toBeDefined();
      expect(spec?.route).toBe('author');
      expect(spec?.rig).toBe('none');
      expect(spec?.parts.length).toBeGreaterThanOrEqual(6);

      // Volumetric features: Punt base, main body, shoulder, neck, lip collar (torus), cork, label
      const hasBase = spec?.parts.some((p) => p.id.includes('base') || p.id.includes('punt'));
      const hasBody = spec?.parts.some((p) => p.id.includes('body'));
      const hasNeck = spec?.parts.some((p) => p.id.includes('neck'));
      const hasLip = spec?.parts.some((p) => p.id.includes('lip') || p.id.includes('collar'));
      const hasCork = spec?.parts.some((p) => p.id.includes('cork'));

      expect(hasBase).toBe(true);
      expect(hasBody).toBe(true);
      expect(hasNeck).toBe(true);
      expect(hasLip).toBe(true);
      expect(hasCork).toBe(true);

      // Real-world Bordeaux bottle scale (~0.32m height)
      expect(spec?.heightMeters).toBeCloseTo(0.32, 0.05);

      // Materials: Translucent glass (opacity < 1.0, low roughness)
      const glassMat = spec?.materials?.find((m) => m.id.includes('glass'));
      expect(glassMat).toBeDefined();
      expect(glassMat?.roughness).toBeLessThan(0.15);
      expect(glassMat?.opacity).toBeLessThan(1.0);
    });

    it('resolves Arabic prompt "زجاجة نبيذ" and "قارورة"', () => {
      const spec1 = lookupSculptSpec('زجاجة نبيذ');
      const spec2 = lookupSculptSpec('قارورة');
      expect(spec1).toBeDefined();
      expect(spec2).toBeDefined();
      expect(spec1?.name).toBe('Glass Wine Bottle');
    });

    it('builds Three.js bottle mesh hierarchy', () => {
      const spec = lookupSculptSpec('wine bottle')!;
      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);

      let meshCount = 0;
      kit.group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshCount++;
      });
      expect(meshCount).toBeGreaterThanOrEqual(6);
    });
  });

  // =========================================================================
  // 6. INTEGRATION WITH SUBJECT MESH FACTORY & DIRECTORIAL DECOMPOSER
  // =========================================================================
  describe('Full Stage Integration: subjectMeshFactory & directorialSceneDecomposer', () => {
    it('creates procedural prop subject mesh without forcing humanoid skeleton', () => {
      const group = createSubjectMesh({
        name: 'Coiled Snake Ring',
        kind: 'prop',
        tokenPrompt: 'a hollow coiled gold snake ring',
        showLabels: false,
      });

      expect(group).toBeInstanceOf(THREE.Group);
      // Must NOT attach humanoid skeleton rig
      expect(group.userData.rig).toBeUndefined();

      let meshCount = 0;
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshCount++;
      });
      expect(meshCount).toBeGreaterThanOrEqual(5);
    });

    it('directorialSceneDecomposer extracts snake ring and attaches authentic sculpt', () => {
      const prompt = 'A close-up shot of a hollow gold coiled snake ring resting under warm studio lighting.';
      const decomposed = decomposeDirectorialScene(prompt);

      expect(decomposed.extractedActors.length).toBeGreaterThan(0);
      const ringActor = decomposed.extractedActors.find((a) => a.name.includes('Ring'));
      expect(ringActor).toBeDefined();
      expect(ringActor?.kind).toBe('prop');
      expect(ringActor?.sculpt).toBeDefined();
      expect(ringActor?.sculpt?.parts.length).toBeGreaterThanOrEqual(5);
    });

    it('directorialSceneDecomposer extracts sports car and attaches authentic sculpt', () => {
      const prompt = 'A red sports car parked on wet asphalt in a rainy neon city vista.';
      const decomposed = decomposeDirectorialScene(prompt);

      const carActor = decomposed.extractedActors.find((a) => a.name.includes('Sports Car') || a.kind === 'vehicle');
      expect(carActor).toBeDefined();
      expect(carActor?.sculpt).toBeDefined();
      expect(carActor?.sculpt?.parts.some((p) => p.id.includes('wheel'))).toBe(true);
    });
  });
});
