import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  isHumanoidPrompt,
  synthesizeRecipeFromImage,
  buildBagOfChipsRecipe,
  buildBottleRecipe,
  buildBoxPropRecipe,
} from '../src/engine/procedural3D/imageToRecipe';
import { buildSculpt } from '../src/engine/procedural3D/sculptSpec';
import { SilhouetteMetrics, ExtractedPalette } from '../src/engine/procedural3D/silhouette';

describe('imageToRecipe - Truthful Procedural 3D Generation from Images', () => {
  describe('isHumanoidPrompt discrimination', () => {
    it('strictly identifies props and everyday objects as non-humanoid', () => {
      const propPrompts = [
        'bag of chips',
        'packet of chips',
        'bag of potato chips',
        'crisps bag',
        'can of soda',
        'bottle of water',
        'coffee mug',
        'wooden crate',
        'vintage television',
        'flying drone',
        'leather shoe',
        'medieval sword',
        'sports car',
      ];

      for (const prompt of propPrompts) {
        expect(isHumanoidPrompt(prompt), `Expected "${prompt}" to NOT be humanoid`).toBe(false);
      }
    });

    it('correctly identifies human and character prompts as humanoid', () => {
      const humanoidPrompts = [
        'elven scout archer',
        'armored knight warrior',
        'cyberpunk female assassin',
        'ancient wizard with robe',
        'man running through the rain',
        'woman sitting on a bench',
        'soldier in military uniform',
      ];

      for (const prompt of humanoidPrompts) {
        expect(isHumanoidPrompt(prompt), `Expected "${prompt}" to BE humanoid`).toBe(true);
      }
    });
  });

  describe('buildBagOfChipsRecipe', () => {
    const mockMetrics: SilhouetteMetrics = {
      aspectRatio: 0.72,
      bounds: { minX: 10, minY: 10, maxX: 100, maxY: 135 },
      centerOfMass: [55, 72],
      widthProfile: [0.6, 0.7, 0.8, 0.85, 0.84, 0.82, 0.8, 0.78, 0.72, 0.65],
      promptDescription: 'Aspect ratio 0.72:1',
    };

    const mockPalette: ExtractedPalette = {
      primaryColor: '#e11d48', // Red bag
      secondaryColor: '#facc15', // Yellow branding
      accentColor: '#1e293b',
      dominantColors: ['#e11d48', '#facc15', '#f8fafc'],
    };

    it('generates an authentic snack bag 3D recipe with no character anatomy', () => {
      const spec = buildBagOfChipsRecipe({
        name: 'Classic Potato Chips',
        metrics: mockMetrics,
        palette: mockPalette,
      });

      expect(spec.version).toBe(2);
      expect(spec.rig).toBe('none');
      expect(spec.route).toBe('author');
      expect(spec.heightMeters).toBeCloseTo(0.28);

      // Verify essential bag components exist
      const partIds = spec.parts.map((p) => p.id);
      expect(partIds).toContain('pouch_body');
      expect(partIds).toContain('crimp_top');
      expect(partIds).toContain('crimp_bottom');
      expect(partIds).toContain('front_label_emblem');
      expect(partIds).toContain('flavor_chip_accent');

      // Verify pouch geometry parameters
      const pouch = spec.parts.find((p) => p.id === 'pouch_body');
      expect(pouch?.shape).toBe('blob');
      expect(pouch?.roundness).toBe(0.65);
      expect(pouch?.color).toBe('#e11d48');

      // Verify crimp seals are textured boxes with silver/accent coloring
      const crimpTop = spec.parts.find((p) => p.id === 'crimp_top');
      expect(crimpTop?.shape).toBe('box');
    });

    it('constructs real Three.js meshes cleanly using buildSculpt', () => {
      const spec = buildBagOfChipsRecipe({
        name: 'Spicy Barbecue Chips',
        metrics: mockMetrics,
        palette: mockPalette,
      });

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);

      let meshCount = 0;
      kit.group.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) meshCount++;
      });

      expect(meshCount).toBeGreaterThanOrEqual(5);
    });
  });

  describe('buildBottleRecipe and buildBoxPropRecipe', () => {
    const mockPalette: ExtractedPalette = {
      primaryColor: '#059669',
      secondaryColor: '#f59e0b',
      accentColor: '#ffffff',
      dominantColors: ['#059669', '#f59e0b'],
    };

    it('builds a cylindrical bottle with neck and cap', () => {
      const spec = buildBottleRecipe({
        name: 'Soda Bottle',
        palette: mockPalette,
      });

      expect(spec.rig).toBe('none');
      const partIds = spec.parts.map((p) => p.id);
      expect(partIds).toContain('bottle_base');
      expect(partIds).toContain('bottle_neck');
      expect(partIds).toContain('bottle_cap');

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });

    it('builds a box prop with beveled edges and details', () => {
      const spec = buildBoxPropRecipe({
        name: 'Wooden Crate',
        palette: mockPalette,
      });

      expect(spec.rig).toBe('none');
      const partIds = spec.parts.map((p) => p.id);
      expect(partIds).toContain('main_chassis');
      expect(partIds).toContain('front_face');

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });
  });

  describe('synthesizeRecipeFromImage routing', () => {
    it('routes bag of chips prompts directly to buildBagOfChipsRecipe', () => {
      const spec = synthesizeRecipeFromImage({
        name: 'Chips',
        prompt: 'bag of chips on table',
      });

      expect(spec.rig).toBe('none');
      expect(spec.parts.some((p) => p.id === 'pouch_body')).toBe(true);
    });

    it('routes packet of chips prompts directly to buildBagOfChipsRecipe', () => {
      const spec = synthesizeRecipeFromImage({
        name: 'Snack',
        prompt: 'a packet of chips',
      });

      expect(spec.rig).toBe('none');
      expect(spec.parts.some((p) => p.id === 'pouch_body')).toBe(true);
    });

    it('uses universal silhouette slicing for unclassified props', () => {
      const spec = synthesizeRecipeFromImage({
        name: 'Mystery Sculpture',
        prompt: 'abstract decorative sculpture',
        metrics: {
          aspectRatio: 0.6,
          bounds: { minX: 10, minY: 10, maxX: 80, maxY: 120 },
          centerOfMass: [45, 65],
          widthProfile: [0.3, 0.4, 0.6, 0.7, 0.8, 0.75, 0.7, 0.6, 0.5, 0.4],
          promptDescription: 'Aspect ratio 0.6:1',
        },
      });

      expect(spec.rig).toBe('none');
      expect(spec.parts.length).toBeGreaterThanOrEqual(8);

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });

    it('synthesizes authentic coffee pouch recipe for coffee keywords and Arabic prompts', () => {
      const arabicSpec = synthesizeRecipeFromImage({
        name: 'مزاج',
        prompt: 'كيس قهوة حبوب بن محمصة',
        palette: {
          primaryColor: '#24150e', // Dark espresso
          secondaryColor: '#4a2c1b', // Roast brown
          accentColor: '#c69a38', // Gold text
          dominantColors: ['#24150e', '#4a2c1b', '#c69a38'],
        },
      });

      expect(arabicSpec.rig).toBe('none');
      const partIds = arabicSpec.parts.map((p) => p.id);
      expect(partIds).toContain('pouch_body');
      expect(partIds).toContain('crimp_seal_top');
      expect(partIds).toContain('degassing_valve');
      expect(partIds).toContain('front_brand_label');
      expect(partIds).toContain('bottom_gusset');

      // Verify authentic sampled palette application
      const body = arabicSpec.parts.find((p) => p.id === 'pouch_body');
      expect(body?.color).toBe('#24150e');
      const label = arabicSpec.parts.find((p) => p.id === 'front_brand_label');
      expect(label?.color).toBe('#c69a38');

      // Verify successful Three.js geometry construction
      const kit = buildSculpt(arabicSpec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });

    it('auto-detects stand-up pouch purely from vertical silhouette metrics without any prompt', () => {
      const pouchFromImage = synthesizeRecipeFromImage({
        name: '',
        prompt: '',
        metrics: {
          aspectRatio: 1.7, // Vertical product
          bounds: { minX: 20, minY: 10, maxX: 120, maxY: 180 },
          centerOfMass: [70, 95],
          // Sealed top crimp is narrower (0.72) than puffed body (1.0)
          widthProfile: [0.85, 0.92, 0.98, 1.0, 0.98, 0.95, 0.9, 0.82, 0.78, 0.72],
          promptDescription: 'Aspect ratio 1.7:1',
        },
      });

      expect(pouchFromImage.rig).toBe('none');
      const partIds = pouchFromImage.parts.map((p) => p.id);
      expect(partIds).toContain('pouch_body');
      expect(partIds).toContain('crimp_seal_top');
    });

    it('auto-recognizes recessed cavity container topology from shallow silhouette metrics (aspect ratio 0.59:1) without prompt', () => {
      const containerFromImage = synthesizeRecipeFromImage({
        name: '',
        prompt: '',
        metrics: {
          aspectRatio: 0.59, // Shallow wide object (like baking pan/tray in reference image)
          bounds: { minX: 10, minY: 10, maxX: 180, maxY: 110 },
          centerOfMass: [95, 60],
          widthProfile: [0.95, 0.98, 1.0, 1.0, 1.0, 0.98, 0.95, 0.92, 0.88, 0.85],
          promptDescription: 'Aspect ratio 0.59:1',
        },
        palette: {
          primaryColor: '#9ca3af',
          secondaryColor: '#d1d5db',
          accentColor: '#374151',
          dominantColors: ['#9ca3af', '#d1d5db', '#4b5563'],
        },
      });

      expect(containerFromImage.rig).toBe('none');
      const partIds = containerFromImage.parts.map((p) => p.id);
      expect(partIds).toContain('container_base_bottom');
      expect(partIds).toContain('container_wall_front');
      expect(partIds).toContain('container_wall_back');
      expect(partIds).toContain('container_wall_side');
      expect(partIds).toContain('container_lip_front');
      expect(partIds).toContain('container_inner_cavity');

      // Verify authentic metallic PBR material
      const metalMat = containerFromImage.materials?.find((m) => m.id === 'mat_primary');
      expect(metalMat?.metalness).toBeGreaterThanOrEqual(0.8);
      expect(metalMat?.roughness).toBeLessThanOrEqual(0.35);

      // Verify successful Three.js hierarchy construction
      const kit = buildSculpt(containerFromImage);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });

    it('recognizes and constructs annular ring topology when central void is present', () => {
      const ringSpec = synthesizeRecipeFromImage({
        name: 'Circular Torus Band',
        prompt: 'hollow annular circular band with jewel',
      });

      expect(ringSpec.rig).toBe('none');
      const partIds = ringSpec.parts.map((p) => p.id);
      expect(partIds).toContain('annular_torus_band');
      const band = ringSpec.parts.find((p) => p.id === 'annular_torus_band');
      expect(band?.shape).toBe('torus');
    });

    it('recognizes and constructs rotational lathe topology for bottles and vases', () => {
      const vaseSpec = synthesizeRecipeFromImage({
        name: 'Vase',
        prompt: 'ceramic flower vase with slender neck',
      });

      expect(vaseSpec.rig).toBe('none');
      const partIds = vaseSpec.parts.map((p) => p.id);
      expect(partIds).toContain('lathe_base_foot');
      expect(partIds).toContain('lathe_main_body');
      expect(partIds).toContain('lathe_slender_neck');
      expect(partIds).toContain('lathe_aperture_rim');
    });
  });
});



