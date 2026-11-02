<p align="center">
  <img src="docs/screenshots/github-banner.png" alt="ComfyUI Motion Previs Studio — Previsualize 3D Scenes for AI Filmmaking" width="100%" />
</p>

# ComfyUI Motion Previs Studio — Cinematic Command Center 2026

> **"Direct the Shot, Not the Prompt."**  
> Built as a replacement for **Higgsfield 3D-Jutsu** — an open-source, local-first 3D camera, character, and lighting previsualization studio for AI video workflows.  
> Includes built-in interactive demo scenes, **ComfyUI 3D `.GLB` Generation (Image-to-3D & Text-to-3D)**, **Automatic Bone Rigging**, and **5 Bundled Ready-Made ComfyUI Workflows**.

**ComfyUI Motion Previs Studio** is a real-time **3D Motion Previsualization & Camera Blocking Studio** designed for filmmakers, VFX supervisors, and AI video directors. Instead of guessing text prompts for camera movement, character blocking, and lens framing, you generate or import rigged 3D `.GLB` characters and objects via **ComfyUI**, direct actors, cameras, sets, and lights inside an interactive 3D soundstage — and export deterministic **24fps MP4 previs**, **OpenPose skeletal passes**, **Depth maps**, **4×4 camera matrices**, and **ComfyUI workflow bundles** for **LTX-2.5 (22B Distilled INT8)**, **MiniMax H3**, **Seedance**, and **any video model that accepts video reference**.

- 🧊 **Real 3D `.GLB` Generation Powered by ComfyUI (Image-to-3D & Text-to-3D)**: Generate authentic textured 3D `.GLB` characters, creatures, and props directly on your local ComfyUI server (`http://127.0.0.1:8188`) using **Pixal3D INT8**, **TRELLIS.2 INT8**, **BiRefNet**, **MoGe FoV Depth**, and **Z-Image Turbo (Qwen-3-4B + Flux VAE)** — with automatic bone rigging, persistent IndexedDB & disk library storage (`D:\ComfyUI\output\3d\`), and `<picture 1>` reference sync.
- 🎥 **Camera-POV Frustum Visibility Engine (`povVisibilityEngine.ts`)**: Prompts automatically describe **only** the characters, props, and objects that actually appear inside the active 3D Camera Viewfinder (`[0, Duration]`), including exact entry/exit timestamps (`enters frame at 1.2s`, `exits frame at 2.8s`) while completely excluding off-camera stage elements.
- 🧬 **Universal Previs-to-Reality Entity Instantiation**: Treats `<Video 1>` strictly as a 3D spatial and camera-path blueprint (`weak_reference`) while instantiating every visible character, prop, natural element, and environment from `<picture 1>`–`<picture 4>` as a living, three-dimensional real-world entity (`fully_preserved`) with organic secondary motion rather than texture-wrapped 3D proxy geometry.
- 🧠 **Local & Cloud AI Directing Assistants**: Connect local **Ollama** / **LM Studio** models or **Google Gemini** / **OpenAI** from the in-app Settings panel for natural-language character choreography, camera blocking, and official model-specific prompt compilation (**LTX-2.5**, **MiniMax H3 Ref2VA**, **Seedance 2.0**).

---

## 🎬 Live Studio Demo Video

[![ComfyUI Motion Previs Studio — Full Demo Video](docs/demo/Comfy-AI-Director-Preview.gif)](https://github.com/navarisun1982/comfyui-motion-previs-studio/raw/master/docs/demo/Comfy-AI-Director-Demo.mp4)

> ▶️ **[Click here or click the preview above to watch / download the full 1080p HD Demo Video (`Comfy-AI-Director-Demo.mp4`)](https://github.com/navarisun1982/comfyui-motion-previs-studio/raw/master/docs/demo/Comfy-AI-Director-Demo.mp4)** *(also available inside the repo at [`docs/demo/Comfy-AI-Director-Demo.mp4`](docs/demo/Comfy-AI-Director-Demo.mp4))*.

---

## 🧊 ComfyUI 3D `.GLB` Studio (Image-to-3D & Text-to-3D) + Auto-Rigging

Open **3D Asset Library → ✨ Concept-to-3D Studio** (or **✍️ Text-to-3D (.GLB)**) to launch the **ComfyUI 3D Character & Object Studio (`.GLB`)**:

### 1. Mutually Exclusive 3D Creation Modes
- **🖼️ Image-to-3D Mode (Workflow `#aa77013b-18f1-4679-9678-6d455d3536c5`)**:
  - Upload any PNG, JPG, or WebP concept image (no text prompt needed).
  - **BiRefNet** automatically removes the background, **MoGe** estimates camera FoV & depth, and **Pixal3D INT8** or **TRELLIS.2 INT8** reconstructs a textured 3D `.GLB` mesh (`Fast Vertex-Color` or `Full PBR UV-Baked` at `1024px`–`4096px`).
  - Your uploaded image is automatically linked as the character's `<picture 1>` reference image for MiniMax H3 video rendering.
- **✍️ Text-to-3D Mode (Workflow `#e7a9555b-5121-42bd-8bc4-a36e6eb34fc7`)**:
  - Enter a text description of any 3D object, character, or creature (no image upload needed).
  - **Stage 1 (2D Studio Concept Synthesis)**: **Z-Image Turbo FP8** + **Qwen-3-4B (`lumina2`)** + **Flux VAE** + **AuraFlow (8 steps)** synthesizes an isolated three-quarter studio concept image (`Node 333`).
  - **Stage 2 (3D `.GLB` Reconstruction)**: Feeds the generated image directly into **BiRefNet → MoGe → Pixal3D / TRELLIS.2** (`Node 322`) to produce a rigged 3D `.GLB` model and saves the generated 2D concept image as its library thumbnail and `<picture 1>` reference.
- **Live Stage & Step Progress Announcer**: Real-time WebSocket & `/history` step tracking (`step / maxSteps`, active ComfyUI node stage banner, and elapsed timer) from start to finish.
- **Persistent 3D Asset Library & Auto-Discovery**:
  - Every generated `.GLB` is automatically saved into **3D Asset Library → ⭐ My Uploads & AI** (persisted in IndexedDB `modelStorage` + disk) and automatically imports any `.GLB` files found in `D:\ComfyUI\output\3d\`.
  - **Locked Mesh Integrity**: Once a 3D `.GLB` object is created, its mesh and creation inputs are locked so it never accidentally resets or mutates — while remaining fully positionable, scalable, rotatable, and animatable on the 3D stage.

### 2. 🦴 Automatic Bone Rigging (`autoRigEngine.ts`) & Silhouette Joint Tuner
Every generated or uploaded `.GLB` mesh is automatically analyzed and rigged in real time:
- **4 Intelligent Rig Archetypes**:
  - `🧍 Humanoid (19-Bone)`: Full biped skeleton (`Hips`, `Spine`, `Chest`, `Neck`, `Head`, `Left/Right Shoulder`, `Arm`, `ForeArm`, `Hand`, `UpLeg`, `Leg`, `Foot`, `ToeBase`) with automatic **A-Pose / T-Pose** silhouette landmark detection (`analyzeHumanoidSilhouette`).
  - `🐾 Quadruped (4-Leg Animal)`: Multi-bone spine, neck, head, tail, and 4 articulated leg chains (`FrontLeft`, `FrontRight`, `BackLeft`, `BackRight`) for animals and creatures.
  - `🐍 Flex Spine`: Multi-segment flexible spine rig for snakes, worms, tentacles, and elongated props.
  - `📦 Rigid Prop`: Grounded pivot rig for vehicles, weapons, furniture, and architectural objects.
- **Interactive Joint Landmark Fine-Tuner (`🎯 Adjust Joint Landmarks`)**: Symmetrical L/R sliders for `Shoulder Height`, `Shoulder Width`, `Wrist Span X/Y`, `Hips / Groin Y`, and `Leg Stance X` with live `🦴 Bones ON/OFF` X-ray overlay and 1-click motion testing (`Bind Pose`, `Idle`, `Walk / Trot`, `Run / Gallop`, `Wave / Stalk`, `Fight / Pounce`).
- **60 FPS SkinnedMesh Performance**: Single-pass auto-rigging with pre-allocated bone world-position buffers and zero per-frame bounding-box thrashing.

---

## 📥 Bundled Ready-Made ComfyUI Workflows Pack (Download & Use in Your Own ComfyUI)

All **5 official ComfyUI workflows** powering this studio are bundled directly inside the app and repository under [`workflows/templates/`](workflows/templates/). Click the **`📥 Workflows Pack`** button inside either the **ComfyUI 3D Studio** header or the **Render, Prompt & Export Studio** header to download any workflow (both drag-and-drop **ComfyUI UI `.json`** and **API `.api.json`**) or **Download All Workflows** in one click:

| # | Workflow Name | Hash / ID | ComfyUI UI Workflow (Drag & Drop) | API Execution Graph | Models Used |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **🖼️ Image-to-3D `.GLB` Reconstruction** | `#aa77013b-18f1-4679-9678-6d455d3536c5` | [`ComfyUI_Image_to_3D_GLB_Workflow.json`](workflows/templates/ComfyUI_Image_to_3D_GLB_Workflow.json) | [`comfy_image_to_3d_glb.api.json`](workflows/templates/comfy_image_to_3d_glb.api.json) | Pixal3D INT8, TRELLIS.2 INT8, BiRefNet, MoGe v1, DINOv3 |
| **2** | **✍️ Text-to-3D `.GLB` Studio Generator** | `#e7a9555b-5121-42bd-8bc4-a36e6eb34fc7` | [`ComfyUI_Text_to_3D_GLB_Workflow.json`](workflows/templates/ComfyUI_Text_to_3D_GLB_Workflow.json) | [`comfy_text_to_3d_glb.api.json`](workflows/templates/comfy_text_to_3d_glb.api.json) | Z-Image Turbo FP8, Qwen-3-4B, Flux VAE, BiRefNet, Pixal3D / TRELLIS.2 |
| **3** | **🎬 MiniMax H3 Multi-Subject Ref2VA** | `MiniMax-H3-Ref2VA` | [`MiniMax_H3_Ref2VA_ComfyUI_Workflow.json`](workflows/templates/MiniMax_H3_Ref2VA_ComfyUI_Workflow.json) | [`minimax_h3_ref2va.api.json`](workflows/templates/minimax_h3_ref2va.api.json) | MiniMax H3 Ref2VA INT8, SolAttn, 8-Step Turbo LoRA, RIFE 60fps |
| **4** | **🎥 MiniMax H3 Stubelius Ultimate Director** | `Stubelius-Ultimate-H3` | [`Stubelius_Ultimate_H3.json`](workflows/templates/Stubelius_Ultimate_H3.json) | [`h3_stubelius.api.json`](workflows/templates/h3_stubelius.api.json) | MiniMax H3 Ref2VA & FL2VA, Qwen3-VL 32B, Video + Audio VAE |
| **5** | **⚡ LTX-2.5 22B Distilled INT8 VFX** | `LTX-2.5-22B-INT8` | — | [`ltx25_stubelius.api.json`](workflows/templates/ltx25_stubelius.api.json) | LTX-2.5 22B Distilled INT8, T5-XXL FP8 |

---

## 📸 Visual Feature Tour & Screenshots

### 1. Full Studio Workspace — Dual 3D Viewports & 24fps Timeline
![Full Studio Workspace](docs/screenshots/01-studio-workspace.png)
- **Left Sidebar (`Shot Bible`)**: Multi-scene, multi-shot storyboard manager with instant scene switching, shot duplication, continuity propagation, and built-in demo scenes for learning.
- **Center Dual-Viewport Stage (`3D Soundstage` + `Camera Viewfinder`)**:
  - **Left Viewport (`3D Soundstage`)**: Free-orbit director's perspective showing the 3D set, volumetric lighting cones, compact camera frustum rig, motion paths, and actor transform gizmos.
  - **Right Viewport (`Camera Viewfinder`)**: Live through-the-lens render locked to your chosen aspect ratio (`16:9`, `2.39:1`, `9:16`, `1:1`), focal length (`14mm`–`135mm`), and depth-of-field aperture (`f/1.4`–`f/22`).
- **Bottom Transport & Keyframe Scrubber**: Frame-accurate `24fps` timeline with camera and subject keyframe diamonds, playback loop controls, and timecode readout.

### 2. 3D Character Control Panel & Biomechanical Human Gait Engine
![3D Character Control Panel](docs/screenshots/02-character-control-panel.png)
- **Biomechanical Human Locomotion (`gaitEngine.ts`)**: Anatomically grounded walking and running with asymmetric stance/swing timing (`60/40` walk, `38/62` run), **heel-strike → flat-foot → toe-off** ankle roll (`createFootRollController`), natural bent-elbow arm swing (`24°–38°` walk, `~90°` athletic pump in run), contrapposto pelvic sway/roll, `Spine`+`Chest` counter-torsion, `solveLookAt` horizon head stabilization, and smooth acceleration/deceleration stride envelopes.
- **Ready-Made Motion Studio**: One-click procedural biomechanical animations across **Move / Jump** (`Walk Forward`, `Run / Sprint`, `Jump / Leap`, `Sneak / Stealth`, `Back Up / Retreat`), **Fight / Action** (`Sword Slash`, `Dodge / Roll`, `Martial Combo`, `Aim & Fire`), and **Act / Emote** (`Wave / Greet`, `Heroic Taunt`, `Look Around`, `Victory Cheer`, `Talk / Dialogue`).
- **Auto / Move / Spot Execution Modes & Action Cycles (`1x`–`5x`)**: Automatically calculate floor travel paths or lock actions in-place, define exact **Action Cycles (`1x`–`5x`)** across the shot duration so gestures play naturally without robotic looping, and dial in **Facing Direction (`Body Yaw`)** (`Face Cam`, `3/4 Left`, `Profile`, `OTS Back`).
- **Natural-Language Acting Director**: Type stage directions (e.g., `"walks slowly from 30 to 48 then waves"`) to synthesize multi-cue keyframe trajectories and skeletal poses.
- **ComfyUI Reference Image Sync (`<picture 1>`–`<picture 3>`) & `.GLB` Rigging**:
  - Upload a **ComfyUI Reference Image** directly on any character, vehicle, or prop in Directing Mode (or auto-populate it from ComfyUI 3D `.GLB` generation) — automatically synced to the Render & Export Studio with zero re-uploading.
  - Interactive **FK/IK Bone Manipulation** right in the 3D viewport (`Pose Bones` mode) + **Socket to Character Bone** (attach props like swords, lanterns, or relics directly to `Right Hand`, `Left Hand`, `Head`, or `Spine`).

### 3. Camera & Lens Optics Deck — Close-Ups, OTS & Dynamic Trajectories
![Camera & Lens Optics Deck](docs/screenshots/03-camera-optics-deck.png)
- **True Cinema Lenses & Sensor Profiles**: `14mm` Ultra-Wide through `85mm` Portrait and `135mm` Telephoto Close-Up with adaptive eye-level target framing (`Close-Up`, `Extreme Close-Up`, `Medium Close-Up`, `Medium`, `Wide`), camera roll/Dutch tilt (`-45°` to `+45°`), and path smoothing.
- **Dynamic Camera Trajectories**: `Static`, `Dolly In`, `Pull Back`, `Track Left/Right`, `Orbit 360`, `Crane Up`, `Pedestal Down`, `Handheld`, and `Whip Pan` with customizable start/end path coordinates and easing curves.

### 4. 3D Set & Environment Builder + Multi-Light Studio Rig
![Set & Lighting Studio](docs/screenshots/04-environment-and-lighting.png)
- **Procedural 3D Environments**: Instant architectural soundstages (`Cyberpunk Alleyway`, `Ancient Temple Ruins`, `Warm Candlelit Rooftop Terrace`, `Sci-Fi Corridor`, `Film Studio Cyc Wall`) with grounded hero props, atmospheric fog, and **Set / Background Reference Image (`<picture 4>`)** upload for ComfyUI video generation.
- **Three-Point + Practical Studio Lighting**: Interactive 3D light gizmos (`Key`, `Fill`, `Rim`, `Practical`) with real-time intensity, color temperature, cone angle, and shadow control.

### 5. Previs Render & Multi-Pass Export Deck
![Previs Render & Export Deck](docs/screenshots/05-previs-export-deck.png)
- **Offline Hardware-Accelerated 24fps Renderer**: Exports frame-accurate `.mp4` (via `mp4-muxer`) for **Composite Previs**, **Clean Beauty**, **OpenPose 18-Joint Skeletons**, **Normalized Depth Maps**, and **Subject Alpha Masks**.
- **Deterministic ComfyUI & Video Reference Bundles**: Exports `.zip` or JSON bundles containing your rendered control passes, `4×4` camera extrinsic matrices, compiled engine prompts, and verified ComfyUI API graphs for **LTX-2.5**, **MiniMax H3**, **Seedance**, and **any video model that accepts video reference**.

### 6. ⚡ Direct ComfyUI Live API Bridge, Camera-POV Prompt Engine & In-App Video Rendering
- **One-Click `Render in ComfyUI` (`MiniMax H3 Ref2VA` & `LTX-2.5 22B`)**: Directly executes **MiniMax H3 Ref2VA (`SolAttn` + `8-Step Turbo LoRA @ 0.7`)** or **LTX-2.5 22B Distilled INT8** on your local ComfyUI server (`http://127.0.0.1:8188`) without manually exporting or importing files.
- **Automatic Previs MP4 + 4 Reference Image Binding**:
  - Renders and uploads your 24fps 3D RGB Previs MP4 directly into **Node `638` (`<Video 1>`)** (or LTX-2.5 **Node `285`**) as the camera & spatial blocking blueprint.
  - Synchronizes up to **4 Object, Character & Set Reference Images (`<picture 1>`–`<picture 4>`, Nodes `137` / `139` / `144` / `151`)** uploaded in Directing Mode, generated in ComfyUI 3D Studio, or selected in Render Mode — and automatically binds the primary reference image into **LTX-2.5 Node `269`** as well.
- **Camera-POV Frustum Filtering & Official Model-Specific Prompt Architecture**:
  - **Viewport-Accurate Frustum Culling (`povVisibilityEngine.ts`)**: Evaluates the exact 3D `PerspectiveCamera` frustum (`fov`, aspect ratio, camera roll, and bounding spheres) across 25 timeline samples so compiled prompts only include subjects actually visible in the Camera Viewfinder (`VISIBLE_THROUGHOUT`, `ENTERS_FRAME`, `EXITS_FRAME`, `PASSES_THROUGH`), omitting off-screen stage objects.
  - **Previs-to-Reality Semantic Instantiation**: Explicitly instructs video models to use `<Video 1>` solely for 3D camera trajectory, perspective, and spatial placement (`weak_reference`), while instantiating `<picture 1>`–`<picture 4>` as authentic, living real-world entities (`fully_preserved`) with natural secondary motion instead of painting or texture-wrapping simplified 3D proxy meshes.
  - **Model-Tailored Prompt Syntax**: Compiles dedicated prompt structures tailored to official documentation for **MiniMax H3 Ref2VA** (`subject_definitions` + `retention_analysis` + `[Shot 1]` temporal beats), **LTX-2.5** (single flowing present-tense cinematic paragraph for `T5-XXL`), and **Seedance 2.0** (`@Video1` + `@Image1`–`@Image4` multimodal tags).
- **In-App `Final Render` & `Side-by-Side Sync` Player**:
  - Streams live node-by-node execution progress over WebSocket (with automatic HTTP `/history` fallback) and loads the finished **60fps MP4+Audio (`Node 145`)** directly inside the studio viewport.
  - Compare your **3D Previs MP4** side-by-side in frame-accurate sync with the **Final ComfyUI Render**, download the final `.mp4` in one click, or inspect the exact disk path (`D:\ComfyUI\output\...`).
- **Zero-CORS Local Proxy & Live GPU Status**: Built-in loopback proxy (`127.0.0.1:51731` in Electron + `/api/comfy` in Vite) and live ComfyUI connection card in **`⚙ Settings`** + top navbar `● Comfy` status indicator showing your active GPU and VRAM.

---

## 🛠️ Installation & Setup Guide

### Prerequisites
- **OS**: Windows 10 / 11, macOS, or Linux
- **Node.js**: `v20.x` or `v22.x` LTS (includes `npm`)
- **Git**: For cloning and version control
- *(Optional)* **ComfyUI** running locally at `http://127.0.0.1:8188` for live 3D `.GLB` generation (`#aa77013b` & `#e7a9555b`) and live video generation (the 3D Previs Studio and MP4/ControlNet Pass Exporters run 100% locally in WebGL without requiring ComfyUI to be online).

### 1. Clone the Repository
```bash
git clone https://github.com/navarisun1982/comfyui-motion-previs-studio.git
cd comfyui-motion-previs-studio
```

### 2. ⚡ One-Click Launch on Windows (`start_studio.bat` / `run.bat`)
On Windows, you do not even need to open a terminal — simply **double-click [`start_studio.bat`](start_studio.bat)** (for Browser Mode) or **[`run.bat`](run.bat)** (for Native Electron Desktop Window):
- **Auto-Installs Dependencies**: Automatically runs `npm install` on first launch if `node_modules` is not yet installed.
- **Branded Studio Logo Icon (`Assets/logo.ico`)**: Automatically applies our official 3D Node-Cube icon (`Assets/logo.ico`) to the launcher console window & taskbar, and creates a branded **`ComfyUI Motion Previs Studio`** shortcut carrying our logo on your **Windows Desktop** and inside the project folder (you can also run **[`create_desktop_shortcut.bat`](create_desktop_shortcut.bat)** at any time to recreate the branded shortcut).
- **Auto-Opens Studio**: Starts the local server and opens **`http://127.0.0.1:5173`** (or launches the native Electron Desktop app when using `run.bat` or `start_studio.bat --desktop`).

### 3. Manual CLI Setup (Windows / macOS / Linux)
```bash
# Install dependencies
npm install

# Run in Browser Mode (http://localhost:5173)
npm run dev

# Or run as a Native Desktop App (Electron)
npm run desktop
```
Or if you already ran `npm run build`:
```bash
npm run start:desktop
```

### 4. Configure AI Directing & Prompt Polish Providers (Local Ollama, Google Gemini, OpenAI)
Click the **Settings (`⚙ Settings`)** button in the top-right header bar to configure optional AI directing & prompt-polishing providers:

| Provider Mode | Supported Models | Capabilities Unlocked |
| :--- | :--- | :--- |
| **Local (`Ollama` / Local Endpoint)** | `deepseek-r1`, `qwen2.5`, `llama3.3` (`http://localhost:11434`) | **100% local & private** natural-language character choreography, stage blocking, and video prompt polishing. |
| **Google Gemini** | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash` | High-speed spatial stage blocking and engine-specific video prompt directing. |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `o3-mini` | Natural-language acting direction and cinematic prompt compilation. |

> **Note**: All **3D `.GLB` model generation (Image-to-3D & Text-to-3D)** is performed by your local **ComfyUI** server (`#aa77013b` & `#e7a9555b`). All motion presets, Action Cycles (`1x`–`5x`), automatic 3D `.GLB` bone rigging, camera optics, lighting, and offline MP4/OpenPose/Depth rendering work **out of the box with zero API keys required**.

### 5. Connect Local ComfyUI Server (3D `.GLB` Studio & Video Rendering)

1. Ensure ComfyUI is running at `http://127.0.0.1:8188` and verify the green **`● Comfy`** pill in the studio's top header bar.
2. Click **`📥 Workflows Pack`** in the **ComfyUI 3D Studio** or **Render, Prompt & Export Studio** to download all 5 ready-made ComfyUI workflows (`ComfyUI_Image_to_3D_GLB_Workflow.json`, `ComfyUI_Text_to_3D_GLB_Workflow.json`, `MiniMax_H3_Ref2VA_ComfyUI_Workflow.json`, `Stubelius_Ultimate_H3.json`, `ltx25_stubelius.api.json`) if you want to inspect or customize them in your ComfyUI browser tab.
3. For **MiniMax H3 Video Rendering**, download the official MiniMax H3 weights from **[🤗 Comfy-Org/MiniMax-H3 on Hugging Face](https://huggingface.co/Comfy-Org/MiniMax-H3)** into `ComfyUI/models/` (`diffusion_models`, `text_encoders`, `loras`, `vae`).

---

## 🧪 Verification, Type-Checking & Tests

Run the automated Vitest suite and production TypeScript + Vite build:

```bash
# Run unit & component tests
npm test

# Run full TypeScript check + production bundle build
npm run build
```

---

## 📂 Project Architecture

```text
├── docs/
│   ├── demo/                 # Full 1080p studio demo video & inline animated preview
│   ├── screenshots/          # Feature tour screenshots for GitHub README
│   └── ARCHITECTURE.md       # System architecture & data flow
├── public/
│   └── models/               # Rigged humanoid skeletal meshes (x-bot / y-bot)
├── src/
│   ├── adapters/             # Engine prompt & config adapters (LTX-2.5, MiniMax H3, Seedance)
│   ├── components/           # 2026 Cinematic Command Center UI
│   │   ├── AIGenerator3D.tsx         # ComfyUI Image-to-3D (#aa77013b) & Text-to-3D (#e7a9555b) .GLB Studio
│   │   ├── BundledWorkflowsModal.tsx # One-click downloader for all 5 bundled ComfyUI workflows
│   │   ├── AssetLibraryModal.tsx     # 200+ Curated 3D Assets + Custom ComfyUI .GLB Library
│   │   ├── ShotBible.tsx             # Multi-scene storyboard manager with built-in learning demo
│   │   ├── StagePrevis3D.tsx         # Dual-viewport Three.js soundstage & camera viewfinder
│   │   ├── PrevisParametersDeck.tsx  # Right-hand inspector (Actors, Camera, Set, Lights, Render)
│   │   ├── CharacterControlCard.tsx  # Modular 3D Character & Auto-Rig Control Panel
│   │   └── PrevisExportDeck.tsx      # 24fps MP4, ControlNet pass & ComfyUI video renderer
│   ├── engine/
│   │   ├── kinematics/       # Auto-rigging engine (humanoid/quadruped/spine/prop), gait engine, 2-bone IK
│   │   ├── staging/          # 3D environment builder & subject mesh factory
│   │   ├── povVisibilityEngine.ts    # 3D Camera-POV frustum visibility & entry/exit timestamp analyzer
│   │   ├── promptCompiler.ts         # Official model-specific compilers (LTX-2.5, MiniMax H3, Seedance 2.0)
│   │   └── offlinePrevisRenderer.ts  # Deterministic multi-pass MP4 muxer pipeline
│   ├── services/
│   │   ├── comfy3dGenerator.ts       # Live ComfyUI Image-to-3D & Text-to-3D .GLB pipeline
│   │   ├── bundledWorkflowsCatalog.ts# Catalog & downloader for all bundled ComfyUI workflows
│   │   └── modelStorage.ts           # Persistent IndexedDB & disk .GLB model storage
│   ├── stores/               # Zustand stores (useShotStore, useHistoryStore, useAssetLibraryStore)
│   └── types/                # Canonical Zod-validated ShotSpec schemas
└── workflows/
    └── templates/            # Bundled ComfyUI UI (.json) & API (.api.json) workflows (3D & Video)
```

---

## 📄 License

Released as Open Source.
