import builtin3dTemplateRaw from '../../workflows/templates/comfy_image_to_3d_glb.api.json';
import { ApiNode, ApiWorkflow } from '../pipeline/templateTypes';
import { convertUiWorkflowToApi } from '../pipeline/customWorkflowResolver';
import { defaultComfyClient } from './comfyClient';
import { registerModelFile } from './modelStorage';
import { loadGltfModel } from '../engine/gltfModelLoader';
import * as THREE from 'three';

export type Comfy3DEngineMode = 'pixal3d' | 'trellis2';
export type Comfy3DQualityMode = 'fast_vertex' | 'full_pbr';

export interface Comfy3DGenerationOptions {
  imageDataUrl: string;
  actorName?: string;
  engineMode: Comfy3DEngineMode;
  qualityMode: Comfy3DQualityMode;
  removeBackground: boolean;
  textureResolution: 1024 | 2048 | 4096;
  seed: number;
  customWorkflowJson?: string;
  onProgress?: (
    stageText: string,
    detail?: {
      nodeId?: string;
      nodeTitle?: string;
      step?: number;
      maxSteps?: number;
    }
  ) => void;
}

export interface Comfy3DGenerationResult {
  blobUrl: string;
  glbFile: File;
  filename: string;
  diskPath?: string;
  vertexCount: number;
  triangleCount: number;
  sizeBytes: number;
  engineUsed: Comfy3DEngineMode | 'custom';
  qualityUsed: Comfy3DQualityMode;
  bboxSize: { x: number; y: number; z: number };
}

const NODE_STAGE_LABELS: Record<string, string> = {
  '122': 'Loading reference image into ComfyUI...',
  '193': 'Loading BiRefNet background removal model...',
  '192': 'Removing background (BiRefNet AI)...',
  '312': 'Cropping & centering subject to foreground mask...',
  '55': 'Loading MoGe 3D geometry model...',
  '56': 'Estimating 3D camera FoV & depth geometry (MoGe)...',
  '15': 'Loading DINOv3 CLIP Vision encoder...',
  '298': 'Encoding Pixal3D image & camera conditioning...',
  '299': 'Encoding TRELLIS.2 3D conditioning...',
  '319': 'Loading Pixal3D INT8 diffusion model...',
  '40': 'Loading TRELLIS.2 INT8 diffusion model...',
  '3': 'Sampling 3D Sparse Voxel Structure (Stage 1/3)...',
  '119': 'Decoding 3D Sparse Voxel Structure...',
  '91': 'Preparing 3D Shape Stage conditioning...',
  '18': 'Sampling 3D High-Res Shape Latents (Stage 2/3)...',
  '94': 'Upsampling 3D Shape to 1536 resolution...',
  '23': 'Refining 3D Shape Latents...',
  '92': 'Decoding 3D Mesh Geometry from Shape VAE...',
  '98': 'Preparing 3D Texture Stage...',
  '12': 'Sampling 3D Voxel Texture Colors (Stage 3/3)...',
  '93': 'Decoding 3D Voxel Texture Colors...',
  '241': 'Remeshing 3D surface (Narrow-Band Dual Contouring)...',
  '186': 'Decimating mesh topology...',
  '238': 'Computing smooth vertex normals...',
  '252': 'Painting 3D mesh with voxel colors...',
  '196': 'Unwrapping 3D mesh UV atlas...',
  '147': 'Baking Base Color, Metallic & Roughness maps...',
  '224': 'Baking Tangent-Space Normal Map from high-poly mesh...',
  '233': 'Baking Ambient Occlusion map...',
  '210': 'Applying PBR textures to 3D mesh...',
  '260': 'Finalizing smooth mesh normals...',
  '282': 'Serializing Fast Vertex-Color .GLB file...',
  '285': 'Serializing Full PBR Textured .GLB file...',
  '322': 'Saving final .GLB 3D model to ComfyUI output...',
};

/**
 * Convert a base64 Data URL or HTTP URL into a Blob for uploading to ComfyUI `/upload/image`.
 */
export async function imageUrlToBlob(imageUrl: string): Promise<Blob> {
  if (imageUrl.startsWith('data:')) {
    const commaIdx = imageUrl.indexOf(',');
    const header = imageUrl.slice(0, commaIdx);
    const base64 = imageUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to read reference image (${res.status}).`);
  }
  return await res.blob();
}

/**
 * Build and optimize the ComfyUI API workflow for Image-to-3D `.GLB` generation.
 * Supports both the built-in `#aa77013b-18f1-4679-9678-6d455d3536c5` (Pixal3D / TRELLIS.2)
 * workflow and any custom local 3D workflow JSON (such as `ComfyUI-3D-Pack` StableFast3D).
 */
export function buildComfy3DWorkflow(
  uploadedImageFilename: string,
  options: Omit<Comfy3DGenerationOptions, 'imageDataUrl' | 'onProgress'>
): { api: ApiWorkflow; outputNodeIds: string[] } {
  const safeSeed = Math.max(1, Math.floor(Number(options.seed) || 42));
  const cleanPrefix = (options.actorName || 'Character3D')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'Character3D';

  // 1. Custom Local 3D Workflow JSON (e.g., ComfyUI-3D-Pack StableFast3D or custom user workflow)
  if (options.customWorkflowJson && options.customWorkflowJson.trim()) {
    const parsed = JSON.parse(options.customWorkflowJson);
    const api: ApiWorkflow = Array.isArray(parsed?.nodes)
      ? convertUiWorkflowToApi(parsed)
      : (parsed as ApiWorkflow);
    const clone: ApiWorkflow = JSON.parse(JSON.stringify(api));
    const outputNodeIds: string[] = [];

    for (const [nodeId, node] of Object.entries(clone)) {
      const ct = node.class_type;
      if (ct === 'LoadImage' && 'image' in node.inputs) {
        node.inputs.image = uploadedImageFilename;
      }
      if (
        (ct === 'KSampler' || ct === 'RandomNoise' || ct === 'easy seed') &&
        ('seed' in node.inputs || 'noise_seed' in node.inputs)
      ) {
        if (typeof node.inputs.seed === 'number') node.inputs.seed = safeSeed;
        if (typeof node.inputs.noise_seed === 'number') node.inputs.noise_seed = safeSeed;
      }
      if (ct === '[Comfy3D] StableFast3D' && 'texture_resolution' in node.inputs) {
        node.inputs.texture_resolution = options.textureResolution;
      }
      if (
        ct === 'Save3DAdvanced' ||
        ct === 'SaveGLB' ||
        ct === '[Comfy3D] Save 3D Mesh' ||
        ct === 'Preview3DAdvanced'
      ) {
        outputNodeIds.push(nodeId);
        if ('filename_prefix' in node.inputs) {
          node.inputs.filename_prefix = `3d/${cleanPrefix}`;
        }
        if ('save_path' in node.inputs) {
          node.inputs.save_path = `3d/${cleanPrefix}_${Date.now()}.glb`;
        }
      }
    }

    return { api: clone, outputNodeIds };
  }

  // 2. Built-in ComfyUI Core 3D Workflow (#aa77013b-18f1-4679-9678-6d455d3536c5: Pixal3D / TRELLIS.2)
  const api: ApiWorkflow = JSON.parse(JSON.stringify(builtin3dTemplateRaw));

  // Set uploaded image on Node 122 (LoadImage)
  if (api['122']) {
    api['122'].inputs.image = uploadedImageFilename;
  }

  // Set seeds on KSampler nodes (3, 12, 18, 23)
  for (const samplerId of ['3', '12', '18', '23']) {
    if (api[samplerId] && typeof api[samplerId].inputs.seed === 'number') {
      api[samplerId].inputs.seed = safeSeed;
    }
  }

  // Set texture resolution on Node 288
  if (api['288']) {
    api['288'].inputs.value = options.textureResolution;
  }

  // Set filename_prefix on Save3DAdvanced (Node 322)
  if (api['322']) {
    api['322'].inputs.filename_prefix = `3d/${cleanPrefix}`;
  }

  // Configure Background Removal (BiRefNet) vs Direct Image Alpha Mask
  if (options.removeBackground) {
    if (api['248']) {
      api['248'].inputs.switch = true;
    }
  } else {
    // Wire LoadImage mask ["122", 1] directly into MaskPreview ["303"] and prune BiRefNet nodes
    if (api['303']) {
      api['303'].inputs.mask = ['122', 1];
    }
    delete api['192'];
    delete api['193'];
    delete api['248'];
  }

  // Configure 3D Engine Branch (Pixal3D vs. TRELLIS.2) and prune the inactive 5GB model branch
  // so ComfyUI only loads the selected diffusion model into VRAM!
  if (options.engineMode === 'trellis2') {
    if (api['316']) api['316'].inputs.value = true;
    // Wire Trellis2Conditioning (299) and Trellis2 UNETLoader (40) directly
    if (api['3']) {
      api['3'].inputs.positive = ['299', 0];
      api['3'].inputs.negative = ['299', 1];
    }
    if (api['91']) {
      api['91'].inputs.positive = ['299', 0];
      api['91'].inputs.negative = ['299', 1];
    }
    if (api['199']) api['199'].inputs.model = ['40', 0];
    if (api['279']) api['279'].inputs.model = ['40', 0];
    if (api['12']) api['12'].inputs.model = ['40', 0];

    // Prune unused Pixal3D + MoGe nodes so VRAM isn't wasted
    for (const unusedId of ['319', '298', '242', '56', '55', '314', '315', '316', '318']) {
      delete api[unusedId];
    }
  } else {
    // Pixal3D mode
    if (api['316']) api['316'].inputs.value = false;
    if (api['3']) {
      api['3'].inputs.positive = ['298', 0];
      api['3'].inputs.negative = ['298', 1];
    }
    if (api['91']) {
      api['91'].inputs.positive = ['298', 0];
      api['91'].inputs.negative = ['298', 1];
    }
    if (api['199']) api['199'].inputs.model = ['319', 0];
    if (api['279']) api['279'].inputs.model = ['319', 0];
    if (api['12']) api['12'].inputs.model = ['319', 0];

    // Prune unused Trellis2 UNETLoader (40) and Trellis2Conditioning (299)
    for (const unusedId of ['40', '299', '314', '315', '316', '318']) {
      delete api[unusedId];
    }
  }

  // Always remove extra UI-only Preview3DAdvanced nodes (246, 323) so ComfyUI only writes the final GLB once
  delete api['246'];
  delete api['247'];
  delete api['323'];

  // Configure Quality Mode: Fast Vertex-Color GLB vs. Full PBR Texture-Baked GLB
  if (options.qualityMode === 'fast_vertex') {
    // Connect Save3DAdvanced (322) directly to Node 282 (MeshToFile3D from PaintMesh 252)
    if (api['322']) {
      api['322'].inputs.model_3d = ['282', 0];
    }
    // Prune slow UV unwrap & PBR texture baking nodes
    for (const bakeNodeId of [
      '196',
      '147',
      '164',
      '207',
      '208',
      '210',
      '224',
      '226',
      '233',
      '235',
      '260',
      '261',
      '262',
      '285',
      '288',
    ]) {
      delete api[bakeNodeId];
    }
  } else {
    // Full PBR mode: Save3DAdvanced (322) uses Node 285 (PBR textured mesh)
    delete api['282'];
    delete api['252'];
  }

  return {
    api,
    outputNodeIds: ['322'],
  };
}

/**
 * Extract the generated `.glb` file metadata from a ComfyUI `/history` entry.
 */
export function extractGlbOutputFromHistory(
  historyEntry: Record<string, any>,
  preferredNodeIds: string[] = ['322']
): { filename: string; subfolder: string; type: 'output' | 'temp'; rawPath?: string } | null {
  const outputs = historyEntry?.outputs;
  if (!outputs || typeof outputs !== 'object') return null;

  const candidateNodeIds = [
    ...preferredNodeIds,
    ...Object.keys(outputs).filter((id) => !preferredNodeIds.includes(id)),
  ];

  for (const nodeId of candidateNodeIds) {
    const out = outputs[nodeId];
    if (!out || typeof out !== 'object') continue;

    // ComfyUI Save3DAdvanced / SaveGLB stores saved models under `out['3d']` or `out.result` or `out.model_3d`
    for (const key of ['3d', 'model_3d', 'gltf', 'mesh', 'meshes', 'result', 'files']) {
      const arr = out[key];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item && typeof item === 'object' && typeof item.filename === 'string') {
            if (item.filename.toLowerCase().endsWith('.glb') || item.filename.toLowerCase().endsWith('.gltf')) {
              return {
                filename: item.filename,
                subfolder: item.subfolder || '',
                type: item.type === 'temp' ? 'temp' : 'output',
              };
            }
          } else if (typeof item === 'string' && item.toLowerCase().endsWith('.glb')) {
            return {
              filename: item.split(/[\\/]/).pop() || 'model.glb',
              subfolder: '',
              type: 'output',
              rawPath: item,
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Execute the full Image-to-3D `.GLB` workflow in ComfyUI and register the resulting `.GLB` model
 * in the Studio's Three.js GLTF cache.
 */
export async function generate3DGlbInComfy(
  options: Comfy3DGenerationOptions
): Promise<Comfy3DGenerationResult> {
  const startedAtMs = Date.now();
  options.onProgress?.('Uploading reference image to ComfyUI...');

  // 1. Convert reference image to Blob & upload to ComfyUI /upload/image
  const imageBlob = await imageUrlToBlob(options.imageDataUrl);
  const uploadName = `ref3d_${Date.now()}.png`;
  const uploaded = await defaultComfyClient.uploadImage(imageBlob, uploadName);

  // 2. Build the API workflow
  options.onProgress?.(
    `Preparing ${
      options.customWorkflowJson
        ? 'Custom 3D'
        : options.engineMode === 'trellis2'
        ? 'TRELLIS.2'
        : 'Pixal3D'
    } (${options.qualityMode === 'fast_vertex' ? 'Fast Vertex-Color' : 'Full PBR'}) workflow...`
  );
  const { api, outputNodeIds } = buildComfy3DWorkflow(uploaded.name, options);

  // 3. Queue prompt & watch execution
  const { promptId } = await defaultComfyClient.submitPrompt(api as any);
  options.onProgress?.('Queued in ComfyUI — starting 3D reconstruction...');

  // Track progress via WebSocket + periodic /history fallback poll
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let currentExecutingNodeId: string | undefined;

    const unregister = defaultComfyClient.registerJobListener({
      promptId,
      onExecuting: (nodeId) => {
        if (settled || !nodeId) return;
        currentExecutingNodeId = nodeId;
        const nodeObj: ApiNode | undefined = api[nodeId];
        const friendly =
          NODE_STAGE_LABELS[nodeId] ||
          (nodeObj?._meta?.title
            ? `Running ${nodeObj._meta.title} (#${nodeId})...`
            : `Running node #${nodeId} (${nodeObj?.class_type || '3D'})...`);
        options.onProgress?.(friendly, {
          nodeId,
          nodeTitle: nodeObj?._meta?.title || nodeObj?.class_type,
        });
      },
      onProgress: (nodeId, value, max) => {
        if (settled) return;
        const activeId = nodeId || currentExecutingNodeId;
        const nodeObj: ApiNode | undefined = activeId ? api[activeId] : undefined;
        const baseLabel =
          (activeId && NODE_STAGE_LABELS[activeId]) ||
          nodeObj?._meta?.title ||
          'Sampling 3D latents';
        options.onProgress?.(`${baseLabel} (${value}/${max})`, {
          nodeId: activeId,
          nodeTitle: nodeObj?._meta?.title,
          step: value,
          maxSteps: max,
        });
      },
      onSuccess: () => {
        if (!settled) {
          settled = true;
          window.clearInterval(pollInterval);
          unregister();
          resolve();
        }
      },
      onError: (errMsg) => {
        if (!settled) {
          settled = true;
          window.clearInterval(pollInterval);
          unregister();
          reject(new Error(errMsg));
        }
      },
      onInterrupted: () => {
        if (!settled) {
          settled = true;
          window.clearInterval(pollInterval);
          unregister();
          reject(new Error('ComfyUI 3D workflow was interrupted.'));
        }
      },
    });

    const pollInterval = window.setInterval(async () => {
      if (settled) return;
      try {
        const h = (await defaultComfyClient.getPromptHistory(promptId)) as Record<string, any> | null;
        if (h && h.status?.completed) {
          settled = true;
          window.clearInterval(pollInterval);
          unregister();
          resolve();
        } else if (h && h.status?.status_str === 'error') {
          settled = true;
          window.clearInterval(pollInterval);
          unregister();
          reject(new Error('ComfyUI 3D workflow reported an execution error.'));
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2500);
  });

  // 4. Retrieve the generated .GLB file from ComfyUI
  options.onProgress?.('Fetching generated .GLB 3D mesh from ComfyUI...');
  const historyEntry = (await defaultComfyClient.getPromptHistory(promptId)) as Record<
    string,
    any
  > | null;
  const extracted = historyEntry ? extractGlbOutputFromHistory(historyEntry, outputNodeIds) : null;

  let glbBuffer: ArrayBuffer | null = null;
  let glbFilename = extracted?.filename || `${options.actorName || 'character'}_${Date.now()}.glb`;
  let diskPath: string | undefined = extracted?.rawPath;

  if (extracted && !extracted.rawPath) {
    try {
      const viewUrl = defaultComfyClient.getViewUrl(
        extracted.filename,
        extracted.subfolder,
        extracted.type
      );
      const res = await fetch(viewUrl);
      if (res.ok) {
        glbBuffer = await res.arrayBuffer();
        diskPath = `D:\\ComfyUI\\${extracted.type}\\${
          extracted.subfolder ? `${extracted.subfolder}\\` : ''
        }${extracted.filename}`;
      }
    } catch {
      // fallback to local output scan below
    }
  }

  if (!glbBuffer) {
    const fallbackUrl = `/api/comfy-glb-output?sinceMs=${startedAtMs}${
      extracted?.rawPath ? `&path=${encodeURIComponent(extracted.rawPath)}` : ''
    }`;
    const res = await fetch(fallbackUrl);
    if (!res.ok) {
      throw new Error(
        `ComfyUI finished the 3D workflow, but the generated .GLB file could not be fetched (HTTP ${res.status}).`
      );
    }
    const headerPath = res.headers.get('X-Comfy-Glb-Path');
    if (headerPath) {
      diskPath = decodeURIComponent(headerPath);
      glbFilename = diskPath.split(/[\\/]/).pop() || glbFilename;
    }
    glbBuffer = await res.arrayBuffer();
  }

  // 5. Register the .GLB in Three.js GLTF cache and inspect geometry stats
  options.onProgress?.('Loading .GLB mesh into 3D Studio viewport...');
  const glbFile = new File([glbBuffer], glbFilename, { type: 'model/gltf-binary' });
  const registered = await registerModelFile(glbFile);
  const loaded = await loadGltfModel(registered.blobUrl);

  let vertexCount = 0;
  let triangleCount = 0;
  if (loaded?.scene) {
    loaded.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const geom = (obj as THREE.Mesh).geometry;
        if (geom) {
          const posAttr = geom.getAttribute('position');
          if (posAttr) vertexCount += posAttr.count;
          if (geom.index) {
            triangleCount += Math.floor(geom.index.count / 3);
          } else if (posAttr) {
            triangleCount += Math.floor(posAttr.count / 3);
          }
        }
      }
    });
  }

  return {
    blobUrl: registered.blobUrl,
    glbFile,
    filename: glbFilename,
    diskPath,
    vertexCount,
    triangleCount,
    sizeBytes: glbBuffer.byteLength,
    engineUsed: options.customWorkflowJson ? 'custom' : options.engineMode,
    qualityUsed: options.qualityMode,
    bboxSize: loaded?.size
      ? { x: loaded.size.x, y: loaded.size.y, z: loaded.size.z }
      : { x: 1, y: 1.8, z: 1 },
  };
}
