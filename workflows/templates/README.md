# Bundled ComfyUI Workflows Pack (3D `.GLB` Generation & Video Rendering)

All official **ComfyUI** workflows used by **ComfyUI Motion Previs Studio** are bundled in this directory in both:
1. **Full ComfyUI UI Format (`*.json`)** — Drag and drop directly onto your ComfyUI browser window (`http://127.0.0.1:8188`) to inspect, customize, or install missing nodes via ComfyUI Manager.
2. **ComfyUI API Execution Format (`*.api.json`)** — Executed directly by the app over REST/WebSocket when generating 3D `.GLB` assets or rendering final shots.

You can also download any or all of these workflows directly from inside the app by clicking **`📥 Workflows Pack`** in the **ComfyUI 3D Studio** header or the **Render, Prompt & Export Studio** header.

---

## 🧊 1. 3D `.GLB` Generation Workflows

| Workflow ID | UI Workflow File (Drag & Drop into ComfyUI) | API Graph File | Description & Pipeline |
| :--- | :--- | :--- | :--- |
| **`#aa77013b-18f1-4679-9678-6d455d3536c5`** | [`ComfyUI_Image_to_3D_GLB_Workflow.json`](ComfyUI_Image_to_3D_GLB_Workflow.json) | [`comfy_image_to_3d_glb.api.json`](comfy_image_to_3d_glb.api.json) | **Image-to-3D `.GLB` Reconstruction**: Removes background with **BiRefNet**, estimates camera FoV & depth with **MoGe v1**, and reconstructs textured 3D `.GLB` geometry using **Pixal3D INT8** or **TRELLIS.2 INT8** (`Fast Vertex-Color` or `Full PBR UV-Baked`). |
| **`#e7a9555b-5121-42bd-8bc4-a36e6eb34fc7`** | [`ComfyUI_Text_to_3D_GLB_Workflow.json`](ComfyUI_Text_to_3D_GLB_Workflow.json) | [`comfy_text_to_3d_glb.api.json`](comfy_text_to_3d_glb.api.json) | **Text-to-3D `.GLB` Studio Generator**: Synthesizes an isolated 3/4 studio concept image from your text prompt using **Z-Image Turbo FP8 + Qwen-3-4B + Flux VAE + AuraFlow (8 steps)** (`Node 324–333`), then feeds it into **BiRefNet → MoGe → Pixal3D / TRELLIS.2** (`Node 192–322`) to output a rigged 3D `.GLB` mesh. |

---

## 🎬 2. Video Rendering Workflows (MiniMax H3 & LTX-2.5)

| Template ID | UI Workflow File (Drag & Drop into ComfyUI) | API Graph File | Binding File | Description & Pipeline |
| :--- | :--- | :--- | :--- | :--- |
| **`minimax_h3_ref2va`** | [`MiniMax_H3_Ref2VA_ComfyUI_Workflow.json`](MiniMax_H3_Ref2VA_ComfyUI_Workflow.json) | [`minimax_h3_ref2va.api.json`](minimax_h3_ref2va.api.json) | [`minimax_h3_ref2va.binding.json`](minimax_h3_ref2va.binding.json) | **MiniMax H3 Multi-Subject Ref2VA**: Binds 4 reference images (`<picture 1>`–`<picture 4>`) and the 24fps 3D RGB Previs video (`<Video 1>`) with SolAttn, 8-Step Turbo LoRA, and 60fps RIFE interpolation + audio. |
| **`h3_stubelius`** | [`Stubelius_Ultimate_H3.json`](Stubelius_Ultimate_H3.json) | [`h3_stubelius.api.json`](h3_stubelius.api.json) | [`h3_stubelius.binding.json`](h3_stubelius.binding.json) | **MiniMax H3 Stubelius Ultimate Director**: Full Stubelius H3 graph for Text-to-Video, Image-to-Video, and Reference-guided shot generation. |
| **`ltx25_stubelius`** | — | [`ltx25_stubelius.api.json`](ltx25_stubelius.api.json) | [`ltx25_stubelius.binding.json`](ltx25_stubelius.binding.json) | **LTX-2.5 22B Distilled INT8 VFX**: Local open-weights LTX-2.5 DiT workflow for camera and motion-controlled VFX video generation. |
