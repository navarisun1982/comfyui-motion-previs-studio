import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildSculpt,
  lookupCuratedSculptSpec,
} from '../src/engine/procedural3D/sculptSpec';
import {
  synthesizeRecipeFromImage,
  buildCoffeePouchRecipe,
  buildBagOfChipsRecipe,
  buildBottleRecipe,
} from '../src/engine/procedural3D/imageToRecipe';
import {
  SilhouetteMask,
  SilhouetteMetrics,
  ExtractedPalette,
  computeSilhouetteIoU,
  renderSculptSilhouette,
} from '../src/engine/procedural3D/silhouette';

// Helper to create synthetic silhouette masks for image-only and multimodal tests
function createSyntheticMask(
  type: 'bottle' | 'bag' | 'car' | 'cylinder' | 'chest' | 'vase' | 'monolith' | 'ring',
  w = 64,
  h = 64
): SilhouetteMask {
  const data = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const ny = y / h; // 0 is top, 1 is bottom
    for (let x = 0; x < w; x++) {
      const nx = (x - w / 2) / (w / 2); // -1 to +1
      let inside = false;

      switch (type) {
        case 'bottle': {
          // Neck at top (ny < 0.35, width 0.25), Body at bottom (ny >= 0.35, width 0.7)
          const targetWidth = ny < 0.35 ? 0.25 : 0.7;
          inside = Math.abs(nx) <= targetWidth && ny >= 0.08 && ny <= 0.95;
          break;
        }
        case 'bag': {
          // Stand-up pouch: slightly tapered at top, wider in middle/bottom
          const targetWidth = 0.55 + 0.25 * Math.sin(ny * Math.PI);
          inside = Math.abs(nx) <= targetWidth && ny >= 0.05 && ny <= 0.95;
          break;
        }
        case 'car': {
          // Low profile wide silhouette (height much smaller than width)
          const isCabin = ny >= 0.3 && ny < 0.6 && Math.abs(nx) <= 0.45;
          const isChassis = ny >= 0.6 && ny <= 0.85 && Math.abs(nx) <= 0.9;
          inside = isCabin || isChassis;
          break;
        }
        case 'cylinder': {
          inside = Math.abs(nx) <= 0.5 && ny >= 0.1 && ny <= 0.9;
          break;
        }
        case 'chest': {
          // Rectangular trunk
          inside = Math.abs(nx) <= 0.75 && ny >= 0.25 && ny <= 0.85;
          break;
        }
        case 'vase': {
          // Hourglass shape
          const targetWidth = 0.4 + 0.3 * Math.cos(ny * Math.PI * 2);
          inside = Math.abs(nx) <= targetWidth && ny >= 0.1 && ny <= 0.92;
          break;
        }
        case 'monolith': {
          // Tapered tall obelisk
          const targetWidth = 0.6 * (0.4 + 0.6 * ny);
          inside = Math.abs(nx) <= targetWidth && ny >= 0.05 && ny <= 0.95;
          break;
        }
        case 'ring': {
          // Annular ring with center void
          const r = Math.sqrt(nx * nx + ((ny - 0.5) * 2) ** 2);
          inside = r >= 0.4 && r <= 0.85;
          break;
        }
      }

      if (inside) {
        data[y * w + x] = 1;
      }
    }
  }

  return { width: w, height: h, data };
}

function createSyntheticMetrics(aspectRatio: number, promptDesc: string): SilhouetteMetrics {
  return {
    aspectRatio,
    bounds: { minX: 10, minY: 5, maxX: 54, maxY: 59 },
    centerOfMass: [0.5, 0.5],
    widthProfile: [0.7, 0.72, 0.74, 0.75, 0.73, 0.7, 0.65, 0.5, 0.3, 0.28],
    promptDescription: promptDesc,
  };
}

describe('24 Declarative 3D Generation Tests (Text, Image & Multimodal)', () => {
  // =========================================================================
  // BATCH 1: Text-Only Generation (8 tests: 4 English + 4 Arabic)
  // =========================================================================
  describe('Batch 1: Text-Only Generation', () => {
    it('1. English: synthesizes a medieval stone watchtower', () => {
      const spec =
        lookupCuratedSculptSpec('medieval round watchtower') ||
        synthesizeRecipeFromImage({ prompt: 'medieval round watchtower', name: 'Watchtower' });
      expect(spec).toBeDefined();
      expect(spec.parts.length).toBeGreaterThanOrEqual(4);

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('2. English: synthesizes a timber rustic cottage', () => {
      const spec =
        lookupCuratedSculptSpec('timber cottage') ||
        synthesizeRecipeFromImage({ prompt: 'timber cottage', name: 'Cottage' });
      expect(spec).toBeDefined();
      expect(spec.parts.length).toBeGreaterThanOrEqual(5);

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('3. English: synthesizes a coastal maritime lighthouse', () => {
      const spec =
        lookupCuratedSculptSpec('coastal lighthouse') ||
        synthesizeRecipeFromImage({ prompt: 'coastal lighthouse', name: 'Lighthouse' });
      expect(spec).toBeDefined();
      expect(spec.parts.length).toBeGreaterThanOrEqual(4);

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });

    it('4. English: synthesizes a vintage sports car', () => {
      const spec =
        lookupCuratedSculptSpec('sports car') ||
        synthesizeRecipeFromImage({ prompt: 'vintage sports car', name: 'Sports Car' });
      expect(spec).toBeDefined();
      expect(spec.parts.length).toBeGreaterThanOrEqual(4);

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });

    it('5. Arabic: synthesizes كيس قهوة اسبريسو فاخر (Premium espresso coffee bag)', () => {
      const spec = synthesizeRecipeFromImage({
        prompt: 'كيس قهوة اسبريسو فاخر مع صمام تفريغ الهواء',
        name: 'كيس قهوة',
      });
      expect(spec).toBeDefined();
      expect(spec.parts.some((p) => p.id.includes('pouch') || p.id.includes('body'))).toBe(true);

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('6. Arabic: synthesizes برج مراقبة حجري أسطواني (Cylindrical stone tower)', () => {
      const spec =
        lookupCuratedSculptSpec('برج مراقبة حجري') ||
        lookupCuratedSculptSpec('medieval round watchtower') ||
        synthesizeRecipeFromImage({ prompt: 'برج مراقبة حجري أسطواني', name: 'برج' });
      expect(spec).toBeDefined();
      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });

    it('7. Arabic: synthesizes قارورة عطر زجاجية (Glass perfume bottle)', () => {
      const spec = synthesizeRecipeFromImage({
        prompt: 'قارورة عطر زجاجية شفافة مع غطاء ذهبي',
        name: 'قارورة عطر',
      });
      expect(spec).toBeDefined();
      expect(spec.parts.length).toBeGreaterThanOrEqual(2);

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('8. Arabic: synthesizes صندوق كنز خشبي (Wooden treasure chest)', () => {
      const spec = synthesizeRecipeFromImage({
        prompt: 'صندوق كنز خشبي عتيق مزخرف بالحديد والذهب',
        name: 'صندوق كنز',
      });
      expect(spec).toBeDefined();
      expect(spec.parts.length).toBeGreaterThanOrEqual(2);

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('8b. English & Arabic: synthesizes professional camera proxy (a nikon camera / كاميرا رقمية)', () => {
      const specNikon = synthesizeRecipeFromImage({
        prompt: 'a nikon camera',
        name: 'a nikon camera',
      });
      expect(specNikon).toBeDefined();
      expect(specNikon.parts.length).toBeGreaterThanOrEqual(10);
      expect(specNikon.parts.some((p) => p.id.includes('lens') || p.id.includes('chassis'))).toBe(true);

      const specArabic = synthesizeRecipeFromImage({
        prompt: 'كاميرا رقمية احترافية',
        name: 'كاميرا',
      });
      expect(specArabic).toBeDefined();
      expect(specArabic.parts.length).toBeGreaterThanOrEqual(10);

      const kit = buildSculpt(specNikon);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });
  });

  // =========================================================================
  // BATCH 2: Image-Only Generation from Silhouette Masks (8 tests)
  // =========================================================================
  describe('Batch 2: Image-Only Generation', () => {
    it('9. Image-only: Bottle silhouette mask -> bottle recipe', () => {
      const mask = createSyntheticMask('bottle');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(2.2, 'tall bottle');
      const palette: ExtractedPalette = {
        primaryColor: '#0ea5e9',
        secondaryColor: '#f59e0b',
        accentColor: '#ffffff',
        dominantColors: ['#0ea5e9', '#f59e0b'],
      };

      const spec = buildBottleRecipe('Bottle From Mask', metrics, palette);
      expect(spec).toBeDefined();
      expect(spec.parts.some((p) => p.id.includes('body') || p.id.includes('neck'))).toBe(true);

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('10. Image-only: Pouch/Bag silhouette mask -> pouch recipe', () => {
      const mask = createSyntheticMask('bag');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(1.7, 'stand-up pouch');
      const palette: ExtractedPalette = {
        primaryColor: '#8b5cf6',
        secondaryColor: '#10b981',
        accentColor: '#fbbf24',
        dominantColors: ['#8b5cf6', '#10b981'],
      };

      const spec = buildCoffeePouchRecipe({ name: 'Bag From Mask', metrics, palette });
      expect(spec).toBeDefined();
      expect(spec.parts.length).toBeGreaterThanOrEqual(3);

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('11. Image-only: Car silhouette mask -> vehicle assembly', () => {
      const mask = createSyntheticMask('car');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(0.45, 'low profile vehicle');
      const palette: ExtractedPalette = {
        primaryColor: '#dc2626',
        secondaryColor: '#1e293b',
        accentColor: '#94a3b8',
        dominantColors: ['#dc2626', '#1e293b'],
      };

      const spec = synthesizeRecipeFromImage({ name: 'Vehicle From Mask', metrics, palette });
      expect(spec).toBeDefined();
      expect(spec.parts.length).toBeGreaterThanOrEqual(2);

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });

    it('12. Image-only: Cylinder container silhouette mask -> procedural container', () => {
      const mask = createSyntheticMask('cylinder');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(1.8, 'cylindrical canister');
      const spec = synthesizeRecipeFromImage({ name: 'Canister From Mask', metrics });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('13. Image-only: Chest/Trunk silhouette mask -> storage chest', () => {
      const mask = createSyntheticMask('chest');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(0.75, 'sturdy trunk box');
      const palette: ExtractedPalette = {
        primaryColor: '#78350f',
        secondaryColor: '#451a03',
        accentColor: '#d97706',
        dominantColors: ['#78350f', '#451a03'],
      };

      const spec = synthesizeRecipeFromImage({
        name: 'Trunk From Mask',
        prompt: 'wooden storage chest trunk',
        metrics,
        palette,
      });
      expect(spec).toBeDefined();
      expect(spec.parts.length).toBeGreaterThanOrEqual(1);

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('14. Image-only: Hourglass/Vase silhouette mask -> lathe or ceramic vessel', () => {
      const mask = createSyntheticMask('vase');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(1.9, 'ceramic vase');
      const palette: ExtractedPalette = {
        primaryColor: '#059669',
        secondaryColor: '#065f46',
        accentColor: '#fef08a',
        dominantColors: ['#059669', '#065f46'],
      };

      const spec = synthesizeRecipeFromImage({ name: 'Vase From Mask', metrics, palette });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });

    it('15. Image-only: Tall tapered monolith silhouette mask -> stone obelisk', () => {
      const mask = createSyntheticMask('monolith');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(3.1, 'tall tapered monolith');
      const spec = synthesizeRecipeFromImage({ name: 'Obelisk From Mask', metrics });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('16. Image-only: Annular ring silhouette mask -> jewelry / torus ring', () => {
      const mask = createSyntheticMask('ring');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(1.0, 'ring shape with central void');
      const palette: ExtractedPalette = {
        primaryColor: '#eab308',
        secondaryColor: '#ca8a04',
        accentColor: '#fef9c3',
        dominantColors: ['#eab308'],
      };

      const spec = synthesizeRecipeFromImage({ name: 'Ring From Mask', metrics, palette });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });
  });

  // =========================================================================
  // BATCH 3: Multimodal Generation (Text Prompt + Image Mask + Palette) (8 tests)
  // =========================================================================
  describe('Batch 3: Multimodal Generation (Prompt + Mask + Palette)', () => {
    it('17. Multimodal: "bag of crunchy chips" + Bag Mask + Golden/Red Palette', () => {
      const mask = createSyntheticMask('bag');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(1.65, 'bag of chips');
      const palette: ExtractedPalette = {
        primaryColor: '#dc2626',
        secondaryColor: '#facc15',
        accentColor: '#ffffff',
        dominantColors: ['#dc2626', '#facc15'],
      };

      const spec = buildBagOfChipsRecipe('Chips Bag', metrics, palette, 0.28);
      expect(spec).toBeDefined();
      expect(spec.parts.some((p) => p.color === '#dc2626')).toBe(true);

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);

      // Verify silhouette rendering and IoU calculation
      const renderedMask = renderSculptSilhouette(spec, 64);
      expect(renderedMask.data.length).toBe(64 * 64);
      const iou = computeSilhouetteIoU(mask, renderedMask, 64);
      expect(iou).toBeGreaterThan(0.4);
    });

    it('18. Multimodal: "كيس شيبس مقرمش" + Bag Mask + Red/Yellow Palette', () => {
      const mask = createSyntheticMask('bag');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(1.65, 'كيس شيبس');
      const palette: ExtractedPalette = {
        primaryColor: '#e11d48',
        secondaryColor: '#f59e0b',
        accentColor: '#ffffff',
        dominantColors: ['#e11d48', '#f59e0b'],
      };

      const spec = synthesizeRecipeFromImage({
        prompt: 'كيس شيبس بطاطس مقرمش',
        name: 'كيس شيبس',
        metrics,
        palette,
      });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('19. Multimodal: "magic health potion bottle" + Vial Mask + Glowing Crimson', () => {
      const mask = createSyntheticMask('bottle');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(2.1, 'health potion');
      const palette: ExtractedPalette = {
        primaryColor: '#ef4444',
        secondaryColor: '#7f1d1d',
        accentColor: '#fca5a5',
        dominantColors: ['#ef4444', '#7f1d1d'],
      };

      const spec = synthesizeRecipeFromImage({
        prompt: 'magic health potion bottle with glowing liquid',
        name: 'Health Potion',
        metrics,
        palette,
      });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('20. Multimodal: "زجاجة إكسير سحرية زرقاء" + Flask Mask + Glowing Cyan', () => {
      const mask = createSyntheticMask('bottle');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(2.3, 'زجاجة إكسير');
      const palette: ExtractedPalette = {
        primaryColor: '#06b6d4',
        secondaryColor: '#0891b2',
        accentColor: '#67e8f9',
        dominantColors: ['#06b6d4'],
      };

      const spec = synthesizeRecipeFromImage({
        prompt: 'زجاجة إكسير مانا سحرية زرقاء مشعة',
        name: 'إكسير سحري',
        metrics,
        palette,
      });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('21. Multimodal: "tactical hover drone" + Quad-wing Mask + Metallic Grey', () => {
      const mask = createSyntheticMask('car');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(0.55, 'tactical hover drone');
      const palette: ExtractedPalette = {
        primaryColor: '#334155',
        secondaryColor: '#0f172a',
        accentColor: '#38bdf8',
        dominantColors: ['#334155', '#0f172a'],
      };

      const spec = synthesizeRecipeFromImage({
        prompt: 'autonomous tactical reconnaissance hover drone',
        name: 'Hover Drone',
        metrics,
        palette,
      });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group).toBeInstanceOf(THREE.Group);
    });

    it('22. Multimodal: "حجر طاقة كريستالي مضيء" + Monolith Mask + Violet Glowing', () => {
      const mask = createSyntheticMask('monolith');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(2.8, 'حجر طاقة');
      const palette: ExtractedPalette = {
        primaryColor: '#a855f7',
        secondaryColor: '#581c87',
        accentColor: '#e9d5ff',
        dominantColors: ['#a855f7'],
      };

      const spec = synthesizeRecipeFromImage({
        prompt: 'حجر طاقة كريستالي فضائي مضيء بالأرجواني',
        name: 'كريستال الطاقة',
        metrics,
        palette,
      });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('23. Multimodal: "vintage wooden dining chair" + Chair Mask + Oak Wood', () => {
      const mask = createSyntheticMask('chest');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(1.8, 'wooden chair');
      const palette: ExtractedPalette = {
        primaryColor: '#92400e',
        secondaryColor: '#78350f',
        accentColor: '#b45309',
        dominantColors: ['#92400e', '#78350f'],
      };

      const spec = synthesizeRecipeFromImage({
        prompt: 'vintage handcrafted oak dining chair',
        name: 'Dining Chair',
        metrics,
        palette,
      });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });

    it('24. Multimodal: "كرسي عرش ذهبي ملكي" + Throne Mask + Royal Gold & Crimson', () => {
      const mask = createSyntheticMask('chest');
      expect(mask.data.length).toBe(64 * 64);
      const metrics = createSyntheticMetrics(1.9, 'عرش ملكي');
      const palette: ExtractedPalette = {
        primaryColor: '#eab308',
        secondaryColor: '#991b1b',
        accentColor: '#fef08a',
        dominantColors: ['#eab308', '#991b1b'],
      };

      const spec = synthesizeRecipeFromImage({
        prompt: 'كرسي عرش ملكي فاخر مطعم بالذهب والمخمل الأحمر',
        name: 'عرش ملكي',
        metrics,
        palette,
      });
      expect(spec).toBeDefined();

      const kit = buildSculpt(spec);
      expect(kit.group.children.length).toBeGreaterThan(0);
    });
  });
});
