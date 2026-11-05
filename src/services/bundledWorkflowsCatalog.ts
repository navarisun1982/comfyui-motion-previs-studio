import comfyImageTo3dUiJson from '../../workflows/templates/ComfyUI_Image_to_3D_GLB_Workflow.json';
import comfyImageTo3dApiJson from '../../workflows/templates/comfy_image_to_3d_glb.api.json';
import comfyTextTo3dUiJson from '../../workflows/templates/ComfyUI_Text_to_3D_GLB_Workflow.json';
import comfyTextTo3dApiJson from '../../workflows/templates/comfy_text_to_3d_glb.api.json';
import minimaxH3Ref2vaUiJson from '../../workflows/templates/MiniMax_H3_Ref2VA_ComfyUI_Workflow.json';
import minimaxH3Ref2vaApiJson from '../../workflows/templates/minimax_h3_ref2va.api.json';
import minimaxH3AdvancedUiJson from '../../workflows/templates/minimaxH3T2VI2VREF2VAdvanced_v20.json';
import minimaxH3SeedHunterUiJson from '../../workflows/templates/minimaxH3SEEDHUNTERLatent_v251.json';
import stubeliusH3UiJson from '../../workflows/templates/Stubelius_Ultimate_H3.json';
import stubeliusH3ApiJson from '../../workflows/templates/h3_stubelius.api.json';
import stubeliusLtxUiJson from '../../workflows/templates/Stubelius_Ultimate_LTX.json';
import ltx25StubeliusApiJson from '../../workflows/templates/ltx25_stubelius.api.json';
import ltx25DevDistOllamaUiJson from '../../workflows/templates/LTX_25_DevDist_I2V_T2V_Ollama_RTX_VSR.json';
import ltx25UnlimitedSingTalkUiJson from '../../workflows/templates/LTX_25_Unlimited_Video_Length_Sing_Talk.json';

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
  sourceUrl?: string;
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
    id: 'minimax_h3_t2v_i2v_ref2v_advanced',
    workflowHash: 'Civitai-2834514-v3233131',
    title: 'MiniMax H3 T2V / I2V / Ref2V Advanced Filmmaking Workflow (All Speedups & QoL)',
    category: 'video-render',
    badge: '🎬 MiniMax H3 Advanced v2.0',
    description:
      'Official Civitai #2834514 Advanced Filmmaking workflow supporting T2V, I2V, and Ref2V with Spectrum speedup, 4-to-8-step Turbo LoRA, and Reference Control Panel.',
    modelsUsed: [
      'MiniMax H3 FL2VA INT8 ConvRot',
      'Qwen3-VL-32B INT8 ConvRot',
      'Spectrum + Turbo LoRA',
    ],
    uiFilename: 'minimaxH3T2VI2VREF2VAdvanced_v20.json',
    uiPayload: minimaxH3AdvancedUiJson as Record<string, any>,
    apiFilename: 'minimax_h3_ref2va.api.json',
    apiPayload: minimaxH3Ref2vaApiJson as Record<string, any>,
    sourceUrl:
      'https://civitai.com/models/2834514/minimax-h3-t2v-i2v-ref2v-advanced-filmmaking-workflow-or-all-speedups-qol-features?modelVersionId=3233131',
  },
  {
    id: 'minimax_h3_seed_hunter',
    workflowHash: 'Civitai-2881362-v3383710',
    title: 'MiniMax H3 SEED HUNTER + Latent Upscaler & Seamless Video Continuation',
    category: 'video-render',
    badge: '🎯 MiniMax H3 Seed Hunter v2.51',
    description:
      'Official Civitai #2881362 Seed Hunter workflow with 3-Take Parallel Preview, 3D Latent Upscaler, Seamless Video Continuation, and H3 Prompt IDE.',
    modelsUsed: [
      'MiniMax H3 Singularity Ref2VA',
      '3D Latent Upscaler FP16',
      'DMAD 4-Step Full LoRA',
    ],
    uiFilename: 'minimaxH3SEEDHUNTERLatent_v251.json',
    uiPayload: minimaxH3SeedHunterUiJson as Record<string, any>,
    apiFilename: 'minimax_h3_ref2va.api.json',
    apiPayload: minimaxH3Ref2vaApiJson as Record<string, any>,
    sourceUrl:
      'https://civitai.com/models/2881362/minimax-h3-seed-hunter-latent-upscaler-seamless-video-continuation-speedups-ref-mods?modelVersionId=3383710',
  },
  {
    id: 'h3-stubelius-ultimate',
    workflowHash: 'Stubelius-Ultimate-H3',
    title: 'MiniMax H3 Stubelius Ultimate Director Workflow (GitHub Official)',
    category: 'video-render',
    badge: '🎥 H3 Stubelius Ultimate',
    description:
      'Full Stubelius Ultimate H3 ComfyUI graph supporting Text-to-Video, Image-to-Video, and Reference-guided cinematic shot generation.',
    modelsUsed: ['MiniMax H3', 'StubeliusH3Director Pipeline'],
    uiFilename: 'Stubelius_Ultimate_H3.json',
    uiPayload: stubeliusH3UiJson as Record<string, any>,
    apiFilename: 'h3_stubelius.api.json',
    apiPayload: stubeliusH3ApiJson as Record<string, any>,
    sourceUrl:
      'https://github.com/stuubszzz/Stubelius-Ultimate-H3/blob/main/example_workflows/Stubelius_Ultimate_H3.json',
  },
  {
    id: 'ltx25-stubelius-vfx',
    workflowHash: 'Stubelius-Ultimate-LTX',
    title: 'Stubelius Ultimate LTX 2.5 Director Workflow (GitHub Official)',
    category: 'video-render',
    badge: '⚡ Stubelius Ultimate LTX 2.5',
    description:
      'Official Stubelius Ultimate LTX-2.5 (22B Distilled INT8) ComfyUI workflow for multi-seed camera, reference, and motion-controlled VFX video generation.',
    modelsUsed: ['LTX-2.5 22B Distilled INT8', 'LTXDirectorCS25 + MSR Pass 2'],
    uiFilename: 'Stubelius_Ultimate_LTX.json',
    uiPayload: stubeliusLtxUiJson as Record<string, any>,
    apiFilename: 'ltx25_stubelius.api.json',
    apiPayload: ltx25StubeliusApiJson as Record<string, any>,
    sourceUrl:
      'https://github.com/stuubszzz/Stubelius-Ultimate-LTX2.5/blob/main/example_workflows/Stubelius_Ultimate_LTX.json',
  },
  {
    id: 'ltx25_devdist_ollama_vsr',
    workflowHash: 'Civitai-2318870-v3231942',
    title: 'LTX 2.5 Dev/Dist Image-to-Video & Text-to-Video with Ollama + RTX VSR',
    category: 'video-render',
    badge: '⚡ LTX 2.5 Ollama + RTX VSR',
    description:
      'Official Civitai #2318870 LTX-2.5 22B Distilled INT8 ConvRot two-stage Latent Upsampler workflow with optional Ollama prompt enhancer and NVIDIA RTX Video Super Resolution.',
    modelsUsed: [
      'LTX-2.5 22B Distilled INT8 ConvRot',
      'Gemma-4-12B INT8 ConvRot',
      'LTX-2.5 Spatial Upscaler x2 + RTX VSR',
    ],
    uiFilename: 'LTX_25_DevDist_I2V_T2V_Ollama_RTX_VSR.json',
    uiPayload: ltx25DevDistOllamaUiJson as Record<string, any>,
    apiFilename: 'ltx25_stubelius.api.json',
    apiPayload: ltx25StubeliusApiJson as Record<string, any>,
    sourceUrl:
      'https://civitai.com/models/2318870/ltx-25-devdist-image-to-video-and-text-to-video-with-ollamartx-vsr?modelVersionId=3231942',
  },
  {
    id: 'ltx25_unlimited_sing_talk',
    workflowHash: 'Civitai-2422765-v3368860',
    title: 'LTX 2.5 Unlimited Video Length — Sing or Talk + Alternating Shots',
    category: 'video-render',
    badge: '🎤 LTX 2.5 Unlimited Sing/Talk',
    description:
      'Official Civitai #2422765 LTX-2.5 unlimited-duration chunked audio/lip-sync & alternating multi-shot workflow with MelBandRoFormer vocal separation and cross-dissolve.',
    modelsUsed: [
      'LTX-2.5 Distilled GGUF / INT8',
      'Gemma-4-12B LTX-2.5',
      'MelBandRoFormer Lip-Sync',
    ],
    uiFilename: 'LTX_25_Unlimited_Video_Length_Sing_Talk.json',
    uiPayload: ltx25UnlimitedSingTalkUiJson as Record<string, any>,
    apiFilename: 'ltx25_stubelius.api.json',
    apiPayload: ltx25StubeliusApiJson as Record<string, any>,
    sourceUrl:
      'https://civitai.com/models/2422765/ltx-25-unlimited-video-length-sing-or-talk-alternating-shots?modelVersionId=3368860',
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
      sourceUrl: item.sourceUrl ?? null,
      uiFilename: item.uiFilename ?? null,
      apiFilename: item.apiFilename,
      comfyUiWorkflow: item.uiPayload ?? null,
      comfyApiWorkflow: item.apiPayload,
    })),
  };
  triggerJsonDownload(bundle, 'ComfyUI_Motion_Previs_Studio_All_Workflows_Pack.json');
}
