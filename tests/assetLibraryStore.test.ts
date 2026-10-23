import { describe, it, expect, vi } from 'vitest';

const reasonObjectMock = vi.hoisted(() => vi.fn());
vi.mock('../src/services/objectReasoner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/objectReasoner')>();
  return { ...actual, reasonObject: reasonObjectMock };
});

import { useAssetLibraryStore, CURATED_3D_ASSETS } from '../src/stores/useAssetLibraryStore';
import { ObjectReasonerError } from '../src/services/objectReasoner';
import { sanitizePartGraph, lookupPartGraph } from '../src/engine/procedural3D/partGraph';

describe('3D Asset Library Store', () => {
  it('loads curated catalog with over 200 assets across major film domains', () => {
    expect(CURATED_3D_ASSETS.length).toBeGreaterThanOrEqual(200);
    const categories = new Set(CURATED_3D_ASSETS.map((a) => a.category));
    expect(categories.has('architecture')).toBe(true);
    expect(categories.has('vehicle')).toBe(true);
    expect(categories.has('character')).toBe(true);
    expect(categories.has('creature')).toBe(true);
    expect(categories.has('furniture')).toBe(true);
    expect(categories.has('props')).toBe(true);
    expect(categories.has('weapons')).toBe(true);
    expect(categories.has('scifi')).toBe(true);
    expect(categories.has('nature')).toBe(true);
  });

  it('manages modal open/close states', () => {
    const store = useAssetLibraryStore.getState();
    expect(store.isOpen).toBe(false);

    store.openLibrary('vehicle');
    expect(useAssetLibraryStore.getState().isOpen).toBe(true);
    expect(useAssetLibraryStore.getState().selectedCategory).toBe('vehicle');

    store.closeLibrary();
    expect(useAssetLibraryStore.getState().isOpen).toBe(false);
  });

  it('allows adding and removing custom 3D assets', () => {
    const store = useAssetLibraryStore.getState();
    const initialCount = store.customAssets.length;

    const testAsset = {
      id: `test-custom-${Date.now()}`,
      name: 'Test Sci-Fi Core',
      nameAr: 'نواة اختبار تجريبية',
      category: 'scifi' as const,
      kind: 'prop',
      icon: '⚛️',
      tokenPrompt: 'a glowing test core',
      source: 'ai-generated' as const,
      isCustom: true,
    };

    store.addCustomAsset(testAsset);
    expect(useAssetLibraryStore.getState().customAssets.length).toBe(initialCount + 1);

    store.removeCustomAsset(testAsset.id);
    expect(useAssetLibraryStore.getState().customAssets.length).toBe(initialCount);
  });

  it('builds whatever the object reasoner describes and follows its routing decision', async () => {
    const store = useAssetLibraryStore.getState();
    reasonObjectMock.mockResolvedValueOnce(
      sanitizePartGraph({
        name: 'Camel',
        route: 'quadruped-walker',
        heightMeters: 1.9,
        identity: 'One-humped dromedary',
        walker: { coat: '#c19a6b', belly: '#d9bf94', morphology: { build: 'humped', neckLength: 1.8 } },
        materials: [],
        parts: [],
        source: { model: 'test-model', generatedAt: 'now', ms: 1000 },
      })
    );
    const camel = await store.generateAssetWithAi('جمل في الصحراء', 'props');
    expect(camel.category).toBe('creature');
    expect(camel.kind).toBe('creature');
    expect(camel.description).toContain('test-model');
    expect(camel.description).toContain('quadruped-walker');
    expect(lookupPartGraph('جمل في الصحراء')?.route).toBe('quadruped-walker');

    reasonObjectMock.mockResolvedValueOnce(
      sanitizePartGraph({
        name: 'Espresso machine',
        route: 'author',
        heightMeters: 0.4,
        materials: [{ id: 'steel', color: '#c0c4c8', roughness: 0.3, metalness: 0.9 }],
        parts: [
          { id: 'body', shape: 'box', size: [0.3, 0.35, 0.35], position: [0, 0.2, 0], rotation: [0, 0, 0], material: 'steel' },
          { id: 'tray', shape: 'box', size: [0.3, 0.02, 0.2], position: [0, 0.01, 0.2], rotation: [0, 0, 0], material: 'steel' },
          { id: 'group_head', shape: 'cylinder', size: [0.08, 0.05, 0.08], position: [0, 0.2, 0.2], rotation: [0, 0, 0], material: 'steel' },
        ],
      })
    );
    const espresso = await store.generateAssetWithAi('espresso machine', 'props');
    expect(espresso.category).toBe('props');
    expect(espresso.kind).toBe('prop');
    expect(espresso.description).toContain('3 authored parts');
  });

  it('surfaces reasoner failures instead of fabricating an asset', async () => {
    const store = useAssetLibraryStore.getState();
    const before = useAssetLibraryStore.getState().customAssets.length;
    reasonObjectMock.mockRejectedValueOnce(new ObjectReasonerError('Cannot reach Ollama at http://127.0.0.1:11434.', 'offline'));
    await expect(store.generateAssetWithAi('rocking chair', 'furniture')).rejects.toThrow('Cannot reach Ollama');
    const state = useAssetLibraryStore.getState();
    expect(state.customAssets.length).toBe(before);
    expect(state.generationError).toContain('Cannot reach Ollama');
    expect(state.isGenerating).toBe(false);
  });
});
