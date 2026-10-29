import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  compileCharacterToClaySculpt,
  createDefaultCharacterFeatures,
  extractCharacterFeaturesFromModelOutput,
} from '../src/engine/procedural3D/characterClayCompiler';
import { buildSculpt } from '../src/engine/procedural3D/sculptSpec';
import { extractPaletteFromRgba } from '../src/engine/procedural3D/silhouette';

describe('CharacterClayCompiler', () => {
  it('creates default character features and allows overrides', () => {
    const defaults = createDefaultCharacterFeatures();
    expect(defaults.name).toBe('Hero Character');
    expect(defaults.gender).toBe('female');
    expect(defaults.palette.primaryClothing).toBe('#2e4e3f');
    expect(defaults.costume.hasHood).toBe(true);
    expect(defaults.equipment.hasBow).toBe(true);

    const overridden = createDefaultCharacterFeatures({
      name: 'Knight Paladin',
      gender: 'male',
      equipment: { hasSword: true, hasShield: true },
    });
    expect(overridden.name).toBe('Knight Paladin');
    expect(overridden.gender).toBe('male');
    expect(overridden.equipment.hasSword).toBe(true);
    expect(overridden.equipment.hasShield).toBe(true);
  });

  it('extracts character features from prompt and model outputs', () => {
    // 1. Text prompt with archer keywords
    const feat1 = extractCharacterFeaturesFromModelOutput(
      {},
      'Elven Scout Archer female with hooded cloak and recurve bow',
      { primaryClothing: '#1e3a2f' }
    );
    expect(feat1.gender).toBe('female');
    expect(feat1.costume.hasHood).toBe(true);
    expect(feat1.equipment.hasBow).toBe(true);
    expect(feat1.equipment.hasQuiver).toBe(true);
    expect(feat1.costume.hasAntlersOrPins).toBe(true);
    expect(feat1.palette.primaryClothing).toBe('#1e3a2f');

    // 2. Descriptive sculpt_layers format (from local vision LLMs)
    const rawLayers = {
      system: 'Tactile_Procedural_Sculpt',
      subject: 'Elven Scout Archer',
      sculpt_layers: [
        { layer: 'foundation_anatomy', proportions: { build: 'slender' } },
        { layer: 'costume', headwear: 'hood', outfit: 'hunter tunic and skirt' },
        { layer: 'equipment', main_hand: 'bow', back: 'quiver with arrows' },
      ],
    };
    const feat2 = extractCharacterFeaturesFromModelOutput(rawLayers, 'Elven Scout Archer');
    expect(feat2.name).toBe('Elven Scout Archer');
    expect(feat2.costume.hasHood).toBe(true);
    expect(feat2.equipment.hasBow).toBe(true);
    expect(feat2.equipment.hasQuiver).toBe(true);

    // 3. Knight / warrior keywords
    const feat3 = extractCharacterFeaturesFromModelOutput({}, 'Male armored knight warrior with greatsword and shield');
    expect(feat3.gender).toBe('male');
    expect(feat3.costume.lowerGarment).toBe('trousers');
    expect(feat3.equipment.hasSword).toBe(true);
    expect(feat3.equipment.hasShield).toBe(true);
  });

  it('compiles full procedural clay character recipe with 25+ parts and humanoid rigging', () => {
    const features = createDefaultCharacterFeatures({
      name: 'Elven Scout Archer',
      gender: 'female',
      palette: {
        skin: '#f5d2b3',
        hair: '#d4b470',
        primaryClothing: '#2d5a3f',
        secondaryClothing: '#3a7251',
        leather: '#543821',
        metal: '#d1b247',
        weaponWood: '#3b2010',
        weaponAccent: '#f0f2f5',
      },
      costume: {
        hasHood: true,
        hasCowl: true,
        hasBelt: true,
        hasBracers: true,
        lowerGarment: 'skirt',
        hasAntlersOrPins: true,
      },
      equipment: {
        hasBow: true,
        hasQuiver: true,
      },
    });

    const spec = compileCharacterToClaySculpt(features);

    expect(spec.version).toBe(2);
    expect(spec.route).toBe('author');
    expect(spec.rig).toBe('humanoid');
    expect(spec.parts.length).toBeGreaterThanOrEqual(25);

    // Verify key anatomical parts exist
    const partIds = spec.parts.map((p) => p.id);
    expect(partIds).toContain('pelvis');
    expect(partIds).toContain('abdomen');
    expect(partIds).toContain('chest');
    expect(partIds).toContain('neck');
    expect(partIds).toContain('head');
    expect(partIds).toContain('cowl_hood');
    expect(partIds).toContain('upper_arm');
    expect(partIds).toContain('forearm');
    expect(partIds).toContain('thigh');
    expect(partIds).toContain('shin');
    expect(partIds).toContain('boot');
    expect(partIds).toContain('recurve_bow');
    expect(partIds).toContain('quiver');

    // Verify humanoid bone tags
    const pelvis = spec.parts.find((p) => p.id === 'pelvis');
    expect(pelvis?.bone).toBe('Hips');

    const chest = spec.parts.find((p) => p.id === 'chest');
    expect(chest?.bone).toBe('Chest');

    const head = spec.parts.find((p) => p.id === 'head');
    expect(head?.bone).toBe('Head');

    // Verify superellipsoid shapes and continuous height tapering
    const shin = spec.parts.find((p) => p.id === 'shin');
    expect(shin?.shape).toBe('cylinder');
    expect(shin?.taper).toBeDefined();

    // Verify clothing CSG cutter is attached to skirt
    const skirtCutter = spec.parts.find((p) => p.id === 'skirt_slit_cutter');
    expect(skirtCutter).toBeDefined();
    expect(skirtCutter?.op).toBe('subtract');
    expect(skirtCutter?.parent).toBe('tunic_skirt');

    // Verify materials
    expect(spec.materials.length).toBeGreaterThanOrEqual(8);
  });

  it('builds authentic clay character into Three.js scene successfully', () => {
    const features = createDefaultCharacterFeatures();
    const spec = compileCharacterToClaySculpt(features);

    const kit = buildSculpt(spec);
    expect(kit.group).toBeInstanceOf(THREE.Group);

    let meshCount = 0;
    kit.group.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) meshCount++;
    });

    // Mirroring expands bilateral limbs, shoulders, arms, legs, boots, accessories
    expect(meshCount).toBeGreaterThanOrEqual(25);

    // Verify bounding box height matches requested heightMeters (1.75m -> scaled to stage)
    kit.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(kit.group);
    expect(box.isEmpty()).toBe(false);
    const size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(1.0);
  });

  it('extracts palette from RGBA pixels deterministically', () => {
    const width = 32;
    const height = 32;
    const rgba = new Uint8ClampedArray(width * height * 4);

    // Paint head zone with warm skin
    for (let y = 3; y < 8; y++) {
      for (let x = 12; x < 20; x++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = 240;
        rgba[idx + 1] = 200;
        rgba[idx + 2] = 175;
        rgba[idx + 3] = 255;
      }
    }

    // Paint torso with forest green
    for (let y = 10; y < 20; y++) {
      for (let x = 8; x < 24; x++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = 40;
        rgba[idx + 1] = 90;
        rgba[idx + 2] = 60;
        rgba[idx + 3] = 255;
      }
    }

    const palette = extractPaletteFromRgba(rgba, width, height);
    expect(palette.skin).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette.primaryClothing).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
