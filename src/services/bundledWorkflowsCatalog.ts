import comfyImageTo3dUiJson from '../../workflows/templates/ComfyUI_Image_to_3D_GLB_Workflow.json';
import comfyImageTo3dApiJson from '../../workflows/templates/comfy_image_to_3d_glb.api.json';
import comfyTextTo3dUiJson from '../../workflows/templates/ComfyUI_Text_to_3D_GLB_Workflow.json';
import comfyTextTo3dApiJson from '../../workflows/templates/comfy_text_to_3d_glb.api.json';
import minimaxH3Ref2vaUiJson from '../../workflows/templates/MiniMax_H3_Ref2VA_ComfyUI_Workflow.json';
import minimaxH3Ref2vaApiJson from '../../workflows/templates/minimax_h3_ref2va.api.json';
import stubeliusH3UiJson from '../../workflows/templates/Stubelius_Ultimate_H3.json';
import stubeliusH3ApiJson from '../../workflows/templates/h3_stubelius.api.json';
import ltx25StubeliusApiJson from '../../workflows/templates/ltx25_stubelius.api.json';

export interface BundledWorkflowEntry {
  id: string;
  workflowHash: string;
  title: string;
  category: '3d-generation' | 'video-render';
  badge: string;
  description: string;
  modelsUsed: string[];
  uiFilename?: string;
  uiPayload?: Record<string, any>;
  apiFilename: string;
  apiPayload: Record<string, any>;
}

export const BUNDLED_WORKFLOWS_CATALOG: BundledWorkflowEntry[] = [
  {
    id: 'comfy-image-to-3d-glb',
    workflowHash: '#aa77013b-18f1-4679-9678-6d455d3536c5',
    title: 'Image-to-3D .GLB Reconstruction (Pixal3D + TRELLIS.2)',
    category: '3d-generation',
    badge: '🖼️ Image-to-3D (.GLB)',
    description:
      'Turns any character or object reference image into a clean textured 3D .GLB mesh. Automatically removes backgrounds with BiRefNet, estimates camera FoV depth with MoGe, and reconstructs geometry & PBR/Vertex-Color textures.',
    modelsUsed: [
      'Pixal3D INT8 / TRELLIS.2 INT8',
      'BiRefNet General Cutout',
      'MoGe v1 FoV Depth',
      'DINOv3 ViT-L16',
    ],
    uiFilename: 'ComfyUI_Image_to_3D_GLB_Workflow.json',
    uiPayload: comfyImageTo3dUiJson as Record<string, any>,
    apiFilename: 'comfy_image_to_3d_glb.api.json',
    apiPayload: comfyImageTo3dApiJson as Record<string, any>,
  },
  {
    id: 'comfy-text-to-3d-glb',
    workflowHash: '#e7a9555b-5121-42bd-8bc4-a36e6eb34fc7',
    title: 'Text-to-3D .GLB Studio Generator (Z-Image Turbo + Pixal3D / TRELLIS.2)',
    category: '3d-generation',
    badge: '✍️ Text-to-3D (.GLB)',
    description:
      'Generates an isolated 3/4 studio concept image directly from your text prompt using Z-Image Turbo (8-step AuraFlow + Qwen-3-4B + Flux VAE), removes the background with BiRefNet, and reconstructs a rigged 3D .GLB model.',
    modelsUsed: [
      'Z-Image Turbo FP8 + Qwen-3-4B + Flux VAE',
      'Pixal3D INT8 / TRELLIS.2 INT8',
      'BiRefNet General Cutout',
      'MoGe v1 FoV Depth',
    ],
    uiFilename: 'ComfyUI_Text_to_3D_GLB_Workflow.json',
    uiPayload: comfyTextTo3dUiJson as Record<string, any>,
    apiFilename: 'comfy_text_to_3d_glb.api.json',
    apiPayload: comfyTextTo3dApiJson as Record<string, any>,
  },
  {
    id: 'minimax-h3-ref2va',
    workflowHash: 'MiniMax-H3-Ref2VA',
    title: 'MiniMax H3 Multi-Subject Reference-to-Video + Audio (Ref2VA)',
    category: 'video-render',
    badge: '🎬 MiniMax H3 Ref2VA',
    description:
      'Production multi-subject Reference-to-Video + Audio workflow combining 4 character/environment reference images (<picture 1>–<picture 4>) and the 3D RGB Previs control video (<Video 1>) with SolAttn & 8-Step Turbo LoRA + 60fps RIFE.',
    modelsUsed: [
      'MiniMax H3 Ref2VA + SolAttn',
      '8-Step Turbo LoRA',
      'RIFE 60fps Frame Interpolation',
    ],
    uiFilename: 'MiniMax_H3_Ref2VA_ComfyUI_Workflow.json',
    uiPayload: minimaxH3Ref2vaUiJson as Record<string, any>,
    apiFilename: 'minimax_h3_ref2va.api.json',
    apiPayload: minimaxH3Ref2vaApiJson as Record<string, any>,
  },
  {
    id: 'h3-stubelius-ultimate',
    workflowHash: 'Stubelius-Ultimate-H3',
    title: 'MiniMax H3 Stubelius Ultimate Director Workflow',
    category: 'video-render',
    badge: '🎥 H3 Stubelius Ultimate',
    description:
      'Full Stubelius Ultimate H3 ComfyUI graph supporting Text-to-Video, Image-to-Video, and Reference-guided cinematic shot generation.',
    modelsUsed: ['MiniMax H3', 'WanVideo / Stubelius Pipeline'],
    uiFilename: 'Stubelius_Ultimate_H3.json',
    uiPayload: stubeliusH3UiJson as Record<string, any>,
    apiFilename: 'h3_stubelius.api.json',
    apiPayload: stubeliusH3ApiJson as Record<string, any>,
  },
  {
    id: 'ltx25-stubelius-vfx',
    workflowHash: 'LTX-2.5-22B-INT8',
    title: 'LTX-2.5 22B Distilled INT8 VFX Workflow',
    category: 'video-render',
    badge: '⚡ LTX-2.5 22B VFX',
    description:
      'Local open-weights LTX-2.5 (22B Distilled INT8) ComfyUI API workflow for high-speed DiT camera and motion-controlled VFX video generation.',
    modelsUsed: ['LTX-2.5 22B Distilled INT8', 'T5-XXL FP8 Text Encoder'],
    apiFilename: 'ltx25_stubelius.api.json',
    apiPayload: ltx25StubeliusApiJson as Record<string, any>,
  },
];

function triggerJsonDownload(payload: Record<string, any>, filename: string): void {
  if (typeof document === 'undefined') return;
  const jsonText = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Downloads a single bundled ComfyUI workflow in either full drag-and-drop ComfyUI UI format
 * (`ui`) or API execution format (`api`).
 */
export function downloadBundledWorkflow(
  entry: BundledWorkflowEntry,
  format: 'ui' | 'api' = 'ui'
): void {
  if (format === 'ui' && entry.uiPayload && entry.uiFilename) {
    triggerJsonDownload(entry.uiPayload, entry.uiFilename);
    return;
  }
  triggerJsonDownload(entry.apiPayload, entry.apiFilename);
}

/**
 * Downloads a single combined JSON bundle containing all ComfyUI workflows (3D + Video)
 * used in ComfyUI Motion Previs Studio, plus individual files if requested.
 */
export function downloadAllBundledWorkflowsPack(): void {
  const bundle = {
    packName: 'ComfyUI Motion Previs Studio — Complete Workflows Pack (3D & Video)',
    exportedAt: new Date().toISOString(),
    instructions:
      'Each entry below includes the full ComfyUI UI workflow (drag-and-drop into ComfyUI browser window) and the API prompt graph used by the app.',
    workflows: BUNDLED_WORKFLOWS_CATALOG.map((item) => ({
      id: item.id,
      workflowHash: item.workflowHash,
      title: item.title,
      category: item.category,
      modelsUsed: item.modelsUsed,
      uiFilename: item.uiFilename ?? null,
      apiFilename: item.apiFilename,
      comfyUiWorkflow: item.uiPayload ?? null,
      comfyApiWorkflow: item.apiPayload,
    })),
  };
  triggerJsonDownload(bundle, 'ComfyUI_Motion_Previs_Studio_All_Workflows_Pack.json');
}

