import { describe, it, expect } from 'vitest';
import {
  buildComfy3DWorkflow,
  extractGlbOutputFromHistory,
} from '../src/services/comfy3dGenerator';

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
});

