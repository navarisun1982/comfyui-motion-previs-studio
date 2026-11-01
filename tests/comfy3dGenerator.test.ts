import { describe, it, expect } from 'vitest';
import {
  buildComfy3DWorkflow,
  buildComfyTextTo3DWorkflow,
  format3DStudioTextPrompt,
  extractGlbOutputFromHistory,
  extractPreviewImageFromHistory,
} from '../src/services/comfy3dGenerator';
import { BUNDLED_WORKFLOWS_CATALOG } from '../src/services/bundledWorkflowsCatalog';
import { useAssetLibraryStore } from '../src/stores/useAssetLibraryStore';
import { storeModelBuffer, toPersistentModelUri } from '../src/services/modelStorage';

describe('comfy3dGenerator', () => {
  it('builds optimized Pixal3D + Fast Vertex-Color workflow from #aa77013b template', () => {
    const { api, outputNodeIds } = buildComfy3DWorkflow('hero_concept.png', {
      actorName: 'Elven Archer',
      engineMode: 'pixal3d',
      qualityMode: 'fast_vertex',
      removeBackground: true,
      textureResolution: 2048,
      seed: 12345,
    });

    expect(outputNodeIds).toEqual(['322']);
    expect(api['122'].inputs.image).toBe('hero_concept.png');
    expect(api['3'].inputs.seed).toBe(12345);
    // Pixal3D model (319) is wired directly; TRELLIS.2 model (40) is pruned to save VRAM
    expect(api['319']).toBeDefined();
    expect(api['40']).toBeUndefined();
    // BiRefNet background removal is active
    expect(api['192']).toBeDefined();
    expect(api['193']).toBeDefined();
    // Fast Vertex-Color mode wires Save3DAdvanced (322) to MeshToFile3D (282) and prunes UV/PBR bake
    expect(api['322'].inputs.model_3d).toEqual(['282', 0]);
    expect(api['196']).toBeUndefined();
    expect(api['147']).toBeUndefined();
    expect(api['285']).toBeUndefined();
  });

  it('builds TRELLIS.2 + Full PBR workflow and skips BiRefNet when removeBackground is false', () => {
    const { api } = buildComfy3DWorkflow('transparent_char.png', {
      actorName: 'Cyber Scout',
      engineMode: 'trellis2',
      qualityMode: 'full_pbr',
      removeBackground: false,
      textureResolution: 4096,
      seed: 777,
    });

    expect(api['122'].inputs.image).toBe('transparent_char.png');
    // TRELLIS.2 model (40) is wired; Pixal3D (319) and MoGe (55, 56) are pruned
    expect(api['40']).toBeDefined();
    expect(api['299']).toBeDefined();
    expect(api['319']).toBeUndefined();
    expect(api['55']).toBeUndefined();
    expect(api['56']).toBeUndefined();
    // BiRefNet nodes are pruned and LoadImage mask is wired directly
    expect(api['192']).toBeUndefined();
    expect(api['303'].inputs.mask).toEqual(['122', 1]);
    // Full PBR nodes are preserved
    expect(api['288'].inputs.value).toBe(4096);
    expect(api['196']).toBeDefined();
    expect(api['147']).toBeDefined();
    expect(api['322'].inputs.model_3d).toEqual(['285', 0]);
  });

  it('supports custom local 3D workflows (e.g. ComfyUI-3D-Pack StableFast3D)', () => {
    const sf3dMockWorkflow = JSON.stringify({
      '1': {
        class_type: 'LoadImage',
        inputs: { image: 'old.png', upload: 'image' },
      },
      '36': {
        class_type: '[Comfy3D] Load SF3D Model',
        inputs: { model_name: 'model.safetensors' },
      },
      '37': {
        class_type: '[Comfy3D] StableFast3D',
        inputs: {
          sf3d_model: ['36', 0],
          reference_image: ['1', 0],
          reference_mask: ['1', 1],
          texture_resolution: 1024,
          remesh_option: 'None',
        },
      },
      '39': {
        class_type: '[Comfy3D] Save 3D Mesh',
        inputs: {
          mesh: ['37', 0],
          save_path: 'SF3D_Test\\mesh.glb',
        },
      },
    });

    const { api, outputNodeIds } = buildComfy3DWorkflow('uploaded_char.png', {
      actorName: 'Knight',
      engineMode: 'pixal3d',
      qualityMode: 'fast_vertex',
      removeBackground: true,
      textureResolution: 2048,
      seed: 99,
      customWorkflowJson: sf3dMockWorkflow,
    });

    expect(api['1'].inputs.image).toBe('uploaded_char.png');
    expect(api['37'].inputs.texture_resolution).toBe(2048);
    expect(outputNodeIds).toContain('39');
    expect(String(api['39'].inputs.save_path)).toContain('.glb');
  });

  it('extracts .glb output info from ComfyUI Save3DAdvanced history output', () => {
    const mockHistory = {
      outputs: {
        '322': {
          '3d': [
            {
              filename: 'Character3D_00001.glb',
              subfolder: '3d',
              type: 'output',
            },
          ],
        },
      },
    };

    const res = extractGlbOutputFromHistory(mockHistory, ['322']);
    expect(res).toEqual({
      filename: 'Character3D_00001.glb',
      subfolder: '3d',
      type: 'output',
    });
  });

  it('auto-saves generated 3D .GLB characters to the 3D Asset Library and updates in-place without duplicates', async () => {
    const dummyBuf = new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer;
    const stored = await storeModelBuffer('model-test-hero-1', dummyBuf, 'Hero');
    expect(toPersistentModelUri(stored.blobUrl)).toBe('model://model-test-hero-1');

    const saved1 = useAssetLibraryStore.getState().saveGeneratedGlbToLibrary({
      modelId: 'model-test-hero-1',
      blobUrl: stored.blobUrl,
      name: 'Cyber Samurai',
      actorCategory: 'human',
      sizeBytes: 4_200_000,
      conceptImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
      rigType: 'humanoid',
      showBones: true,
      engineUsed: 'pixal3d',
    });

    expect(saved1.category).toBe('character');
    expect(saved1.kind).toBe('human');
    expect(saved1.name).toBe('Cyber Samurai');
    expect(saved1.modelId).toBe('model-test-hero-1');

    // Updating the same modelId in-place should not create a duplicate library item
    const countBefore = useAssetLibraryStore
      .getState()
      .customAssets.filter((a) => a.modelId === 'model-test-hero-1').length;
    expect(countBefore).toBe(1);

    const saved2 = useAssetLibraryStore.getState().saveGeneratedGlbToLibrary({
      modelId: 'model-test-hero-1',
      blobUrl: stored.blobUrl,
      name: 'Renamed Samurai',
      actorCategory: 'human',
      rigType: 'humanoid',
      showBones: false,
    });
    expect(saved2.name).toBe('Renamed Samurai');

    const countAfter = useAssetLibraryStore
      .getState()
      .customAssets.filter((a) => a.modelId === 'model-test-hero-1').length;
    expect(countAfter).toBe(1);
  });

  it('builds Text-to-3D workflow (#e7a9555b) with Z-Image Turbo + Pixal3D/TRELLIS.2 and studio isolation prompt', () => {
    const formatted = format3DStudioTextPrompt('a weathered medieval treasure chest');
    expect(formatted).toContain('A single full object: a weathered medieval treasure chest');
    expect(formatted).toContain('isolated on a clean neutral studio background');

    const { api, outputNodeIds } = buildComfyTextTo3DWorkflow({
      generationMode: 'text-to-3d',
      textPrompt: 'a weathered medieval treasure chest',
      actorName: 'Treasure Chest',
      engineMode: 'pixal3d',
      qualityMode: 'fast_vertex',
      removeBackground: true,
      textureResolution: 2048,
      seed: 54321,
    });

    expect(outputNodeIds).toEqual(['322']);
    // Stage 1: Z-Image Turbo nodes (324-333) are present and wired
    expect(api['324']).toBeDefined();
    expect(api['325']).toBeDefined();
    expect(api['326']).toBeDefined();
    expect(api['327'].inputs.text).toContain('a weathered medieval treasure chest');
    expect(api['331'].inputs.seed).toBe(54321);
    expect(api['332']).toBeDefined();
    expect(api['333']).toBeDefined();
    // Stage 2: BiRefNet & Pixal3D are wired directly from VAEDecode (332)
    expect(api['192'].inputs.image).toEqual(['332', 0]);
    expect(api['319']).toBeDefined();
    expect(api['40']).toBeUndefined();
    expect(api['322'].inputs.model_3d).toEqual(['282', 0]);
  });

  it('extracts generated 2D concept preview image from Node 333 in #e7a9555b history', () => {
    const mockHistory = {
      outputs: {
        '333': {
          images: [
            {
              filename: 'ComfyUI_temp_zimage_00001_.png',
              subfolder: '',
              type: 'temp',
            },
          ],
        },
      },
    };
    const preview = extractPreviewImageFromHistory(mockHistory, ['333', '302']);
    expect(preview).toEqual({
      filename: 'ComfyUI_temp_zimage_00001_.png',
      subfolder: '',
      type: 'temp',
    });
  });

  it('bundles all 5 official ComfyUI workflows (Image-to-3D, Text-to-3D, MiniMax H3, LTX-2.5) for user download', () => {
    expect(BUNDLED_WORKFLOWS_CATALOG.length).toBe(5);
    const ids = BUNDLED_WORKFLOWS_CATALOG.map((w) => w.id);
    expect(ids).toContain('comfy-image-to-3d-glb');
    expect(ids).toContain('comfy-text-to-3d-glb');
    expect(ids).toContain('minimax-h3-ref2va');
    expect(ids).toContain('h3-stubelius-ultimate');
    expect(ids).toContain('ltx25-stubelius-vfx');

    for (const wf of BUNDLED_WORKFLOWS_CATALOG) {
      expect(wf.apiPayload).toBeDefined();
      expect(Object.keys(wf.apiPayload).length).toBeGreaterThan(5);
    }
  });
});


