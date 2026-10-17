# Environment Audit & Setup Validation Report

**Audit Date**: October 17, 2026  
**Host Operating System**: Windows 11 Pro 64-bit  
**Inspection Shell**: PowerShell / Command Prompt (`cmd /c`)

---

## 1. Hardware & GPU Environment

- **GPU**: NVIDIA GeForce RTX 3090 (Device index: `0`)
- **Total Dedicated VRAM**: 24,576 MiB (24 GB)
- **Free VRAM (during idle/loaded server)**: ~17.2 GB available
- **NVIDIA Driver**: 610.88 (WDDM Driver-Model)
- **CUDA UMD Version**: 13.3
- **PyTorch Version**: 2.10.0+cu130 (inside active conda environment)
- **RAM Total**: 137,350,705,152 bytes (~128 GB DDR4/DDR5)
- **RAM Free**: ~25 GB free

> [!NOTE]
> The machine has top-tier hardware: 24GB RTX 3090 and 128GB system RAM, more than adequate for local video diffusion models like LTX-2.5, Wan 2.1, and MiniMax H3.

---

## 2. Active ComfyUI Installation Audit

- **Active Process PID**: 53052
- **Executable**: `D:\conda_envs\comfyui\python.exe` (Python 3.12.9 64-bit)
- **Working Directory**: `D:\ComfyUI`
- **Command Line**: `python main.py --use-sage-attention --disable-xformers --reserve-vram 3`
- **ComfyUI Core Version**: 0.41.0
- **ComfyUI Frontend Package**: 1.55.17
- **API Status**: HTTP REST & WebSocket actively listening on `http://127.0.0.1:8188` (Verified with `/system_stats`, `/embeddings`, `/object_info`)
- **Deployment Mode**: Local Git repository (`deploy_environment: "local-git"`)

---

## 3. Installed Video Models & Compatibility Check

| Category | Model Name / Safetensor | Disk Location | Compatibility & Status |
|:---|:---|:---|:---|
| **UNET / Video Diffusion** | `LTX2.5\ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` | `D:\ComfyUI\models\unet` | **Active / Verified**. Ideal for Open Weights & LTX VFX bonus category. |
| **UNET / Video Diffusion** | `Minimax h3\minimax_h3_fl2va_pruned_int8_convrot.safetensors` | `D:\ComfyUI\models\unet` | Active / Verified. For MiniMax H3 adapter. |
| **UNET / Video Diffusion** | `Minimax h3\minimax_h3_ref2va_pruned_int8_convrot.safetensors` | `D:\ComfyUI\models\unet` | Active / Verified. Reference-to-Video. |
| **UNET / Video Diffusion** | `Wan21-14B-SCAIL-preview_fp8_e4m3fn_scaled_KJ.safetensors` | `D:\ComfyUI\models\unet` | Active / Verified. |
| **CLIP / Text Encoders** | `LTX2.5\gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors` | `D:\ComfyUI\models\clip` | Active / Verified for LTX-2.5 conditioning. |
| **CLIP / Text Encoders** | `Minimax h3\qwen3vl_32b_minimax_h3_int8_convrot.safetensors` | `D:\ComfyUI\models\clip` | Active / Verified for MiniMax H3. |
| **VAE** | `LTX-VAE.ckpt` & `LTX2.5\ltx-2.5-video-vae-bf16.safetensors` | `D:\ComfyUI\models\vae` | Active / Verified. |
| **VAE** | `minimax\MiniMax-H3-X2-Detail-v1.safetensors` | `D:\ComfyUI\models\vae` | Active / Verified. |
| **Motion LoRAs / IC-LoRA** | `LTX2.5\ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors`, etc. | `D:\ComfyUI\models\loras` | Available for spatial and camera control guidance. |

---

## 4. Custom Nodes Audit

Key relevant custom nodes already present in `D:\ComfyUI\custom_nodes`:
1. `ComfyUI-LTXVideo`: Core LTX conditioning, dynamic conditioning, samplers.
2. `Stubelius-Ultimate-LTX2.5`: Includes `LTXDirector`, `LTXDirectorGuide`, keyframer, chunk sequencer.
3. `ComfyUI-MiniMaxH3-Director`: Director nodes for MiniMax H3.
4. `ComfyUI-VideoHelperSuite` (`VHS`): Video combine, video load, preview.
5. `ComfyUI-KJNodes`: Color grading, latent utilities, VAE loaders.
6. `rgthree-comfy`: Power loaders and context managers.
7. `ComfyUI-Crystools`: Resource monitor and memory management.

---

## 5. Developer Runtime Tooling

- **Node.js**: `v26.5.1` (System PATH)
- **npm**: `12.0.2` (System PATH)
- **Git**: `2.56.0.windows.2` (System PATH)
- **Python**: `3.12.9` (`D:\conda_envs\comfyui\python.exe`)

---

## 6. Model Recommendation & Strategy

Based on the audit:
1. **Primary Recommended Target**: **LTX-2.5 (22B Distilled INT8)**
   - **Why**: Fully installed on the machine, executes in 24GB VRAM with INT8 transformer + Gemma 12B CLIP, qualifies for **Open Weights Only ($5090 RTX)**, **LTX VFX Bonus ($2,000 cash)**, **Most Innovative (RTX 5090)**, and **Best Overall ($10,000)**.
2. **Secondary Supported Model**: **MiniMax H3**
   - **Why**: Also installed locally; provides flexibility and qualifies for the MiniMax partner bonus.
3. **Development Mock Engine**:
   - **Why**: Enables instantaneous frontend development, automated Vitest unit testing, and Playwright UI tests without incurring 30-90 second generation latency or GPU VRAM contention during iteration.
