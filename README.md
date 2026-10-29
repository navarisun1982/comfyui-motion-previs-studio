# ComfyUI Motion Previs Studio — Cinematic Command Center 2026

> **"Direct the Shot, Not the Prompt."**  
> Built as a replacement for **Higgsfield 3D-Jutsu** — an open-source, local-first 3D camera, character, and lighting previsualization studio for AI video workflows.  
> Includes built-in interactive demo scenes for learning and instant experimentation.

**ComfyUI Motion Previs Studio** is a real-time **3D Motion Previsualization & Camera Blocking Studio** designed for filmmakers, VFX supervisors, and AI video directors. Instead of guessing text prompts for camera movement, character blocking, and lens framing, you direct actors, cameras, sets, and lights inside an interactive 3D soundstage — and export deterministic **24fps MP4 previs**, **OpenPose skeletal passes**, **Depth maps**, **4×4 camera matrices**, and **ComfyUI workflow bundles** for **LTX-2.5 (22B Distilled INT8)**, **MiniMax H3**, **Seedance**, and **any video model that accepts video reference**.

- 🧠 **Local Reasoning & Vision Models + Cloud AI**: Work **100% locally** with **Ollama** / **LM Studio** reasoning & vision models (e.g., `Qwen2.5-VL`, `LLaVA`, `Llama-3.2-Vision`, `DeepSeek-R1`, `Qwen-2.5-Coder`) — or connect **Google Gemini** and **OpenAI** directly from the in-app Settings panel for AI 3D sculpting, image-to-3D vision analysis, natural-language character acting, and directorial prompt polishing.

---

## 🎬 Live Studio Demo Video

[![ComfyUI Motion Previs Studio — Full Demo Video](docs/demo/Comfy-AI-Director-Preview.gif)](https://github.com/navarisun1982/comfyui-motion-previs-studio/raw/master/docs/demo/Comfy-AI-Director-Demo.mp4)

> ▶️ **[Click here or click the preview above to watch / download the full 1080p HD Demo Video (`Comfy-AI-Director-Demo.mp4`)](https://github.com/navarisun1982/comfyui-motion-previs-studio/raw/master/docs/demo/Comfy-AI-Director-Demo.mp4)** *(also available inside the repo at [`docs/demo/Comfy-AI-Director-Demo.mp4`](docs/demo/Comfy-AI-Director-Demo.mp4))*.

---

## 📸 Visual Feature Tour & Screenshots

### 1. Full Studio Workspace — Dual 3D Viewports & 24fps Timeline
![Full Studio Workspace](docs/screenshots/01-studio-workspace.png)
- **Left Sidebar (`Shot Bible`)**: Multi-scene, multi-shot storyboard manager with instant scene switching, shot duplication, continuity propagation, and built-in demo scenes for learning.
- **Center Dual-Viewport Stage (`3D Soundstage` + `Camera Viewfinder`)**:
  - **Left Viewport (`3D Soundstage`)**: Free-orbit director's perspective showing the 3D set, volumetric lighting cones, camera frustum rig, motion paths, and actor transform gizmos.
  - **Right Viewport (`Camera Viewfinder`)**: Live through-the-lens render locked to your chosen aspect ratio (`16:9`, `2.39:1`, `9:16`, `1:1`), focal length (`14mm`–`135mm`), and depth-of-field aperture (`f/1.4`–`f/22`).
- **Bottom Transport & Keyframe Scrubber**: Frame-accurate `24fps` timeline with camera and subject keyframe diamonds, playback loop controls, and timecode readout.

### 2. 3D Character Control Panel & Biomechanical Human Gait Engine
![3D Character Control Panel](docs/screenshots/02-character-control-panel.png)
- **Biomechanical Human Locomotion (`gaitEngine.ts`)**: Anatomically grounded walking and running with asymmetric stance/swing timing (`60/40` walk, `38/62` run), **heel-strike → flat-foot → toe-off** ankle roll (`createFootRollController`), natural bent-elbow arm swing (`24°–38°` walk, `~90°` athletic pump in run), contrapposto pelvic sway/roll, `Spine`+`Chest` counter-torsion, `solveLookAt` horizon head stabilization, and smooth acceleration/deceleration stride envelopes.
- **Ready-Made Motion Studio**: One-click procedural biomechanical animations across **Move / Jump** (`Walk Forward`, `Run / Sprint`, `Jump / Leap`, `Sneak / Stealth`, `Back Up / Retreat`), **Fight / Action** (`Sword Slash`, `Dodge / Roll`, `Martial Combo`, `Aim & Fire`), and **Act / Emote** (`Wave / Greet`, `Heroic Taunt`, `Look Around`, `Victory Cheer`, `Talk / Dialogue`).
- **Auto / Move / Spot Execution Modes & Action Cycles (`1x`–`5x`)**: Automatically calculate floor travel paths or lock actions in-place, define exact **Action Cycles (`1x`–`5x`)** across the shot duration so gestures play naturally without robotic looping, and dial in **Facing Direction (`Body Yaw`)** (`Face Cam`, `3/4 Left`, `Profile`, `OTS Back`).
- **Natural-Language Acting Director**: Type stage directions (e.g., `"walks slowly from 30 to 48 then waves"`) to synthesize multi-cue keyframe trajectories and skeletal poses using local or cloud reasoning models.
- **ComfyUI Reference Image Sync (`<picture 1>`–`<picture 3>`) & Vision-to-3D Rigging**:
  - Upload a **ComfyUI Reference Image** directly on any character, vehicle, or prop in Directing Mode (with instant thumbnail preview and automatic upload to `D:\ComfyUI\input\`) — automatically synced to the Render & Export Studio with zero re-uploading.
  - Edit 3D look by text prompt, generate 3D props from reference images using **Vision models**, or attach custom `.GLB` 3D assets.
  - Interactive **FK/IK Bone Manipulation** right in the 3D viewport (`Pose Bones` mode) + **Socket to Character Bone** (attach props like swords, lanterns, or relics directly to `Right Hand`, `Left Hand`, `Head`, or `Spine`).

### 3. Camera & Lens Optics Deck — Close-Ups, OTS & Dynamic Trajectories
![Camera & Lens Optics Deck](docs/screenshots/03-camera-optics-deck.png)
- **True Cinema Lenses**: `14mm` Ultra-Wide through `85mm` Portrait and `135mm` Telephoto Close-Up with adaptive eye-level target framing (`Close-Up`, `Extreme Close-Up`, `Medium Close-Up`, `Medium`, `Wide`).
- **Dynamic Camera Trajectories**: `Static`, `Dolly In`, `Pull Back`, `Track Left/Right`, `Orbit 360`, `Crane Up`, `Pedestal Down`, `Handheld`, and `Whip Pan` with customizable start/end path coordinates and easing curves.

### 4. 3D Set & Environment Builder + Multi-Light Studio Rig
![Set & Lighting Studio](docs/screenshots/04-environment-and-lighting.png)
- **Procedural 3D Environments**: Instant architectural soundstages (`Cyberpunk Alleyway`, `Ancient Temple Ruins`, `Warm Candlelit Rooftop Terrace`, `Sci-Fi Corridor`, `Film Studio Cyc Wall`) with grounded hero props, atmospheric fog, custom prompt-driven 3D object sculpting, and **Set / Background Reference Image (`<picture 4>`)** upload for ComfyUI video generation.
- **Three-Point + Practical Studio Lighting**: Interactive 3D light gizmos (`Key`, `Fill`, `Rim`, `Practical`) with real-time intensity, color temperature, cone angle, and shadow control.

### 5. Previs Render, Live ComfyUI MiniMax H3 Bridge & Side-by-Side Sync Deck
![Previs Render & Export Deck](docs/screenshots/05-previs-export-deck.png)
- **⚡ Live ComfyUI MiniMax H3 Bridge (`minimax_h3_ref2va`)**:
  - **One-Click `Render in ComfyUI (MiniMax H3)`**: Automatically renders your 24fps 3D RGB Previs MP4, uploads it to ComfyUI Node `638` (`<Video 1>`), binds up to 4 object/character/set Reference Images (`<picture 1>`–`<picture 4>`, Nodes `137`/`139`/`144`/`151`), injects the spatially locked Ref2VA prompt (Node `646`) and seed (Node `142`), and streams live node-by-node progress via WebSocket + HTTP `/history` fallback.
  - **Zero-CORS Local Proxy (`127.0.0.1:51731` / `/api/comfy`)**: Built-in loopback proxy in both Electron and Vite dev server guarantees rock-solid connectivity to `http://127.0.0.1:8188` without browser CORS blocks, with live GPU/VRAM badge in **Settings (`⚙ Settings`)** and the top header bar.
  - **In-App `Final Render` & `Side-by-Side Sync` Player**: Stream, scrub, and compare your 3D Previs MP4 alongside the final ComfyUI MiniMax H3 MP4+Audio render right inside the studio, with 1-click MP4 download and exact disk location readout (`D:\ComfyUI\output\...`).
- **Offline Hardware-Accelerated 24fps Renderer**: Exports frame-accurate `.mp4` (via `mp4-muxer`) for **Composite Previs**, **Clean Beauty**, **OpenPose 18-Joint Skeletons**, **Normalized Depth Maps**, and **Subject Alpha Masks**.
- **Deterministic ComfyUI & Video Reference Bundles**: Exports `.zip` or JSON bundles containing your rendered control passes, `4×4` camera extrinsic matrices, compiled engine prompts, and verified ComfyUI API graphs for **LTX-2.5**, **MiniMax H3**, **Seedance**, and **any video model that accepts video reference**.

---

## 🛠️ Installation & Setup Guide

### Prerequisites
- **OS**: Windows 10 / 11, macOS, or Linux
- **Node.js**: `v20.x` or `v22.x` LTS (includes `npm`)
- **Git**: For cloning and version control
- *(Optional)* **ComfyUI** running locally at `http://127.0.0.1:8188` for live video generation (the 3D Previs Studio and MP4/ControlNet Pass Exporters run 100% locally in WebGL without requiring ComfyUI to be online).

### 1. Clone the Repository
```bash
git clone https://github.com/navarisun1982/comfyui-motion-previs-studio.git
cd comfyui-motion-previs-studio
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run in Development Mode (Browser)
```bash
npm run dev
```
Open **`http://localhost:5173`** in Chrome or Edge.

### 4. Run as a Native Desktop App (Electron)
```bash
npm run desktop
```
Or if you already ran `npm run build`:
```bash
npm run start:desktop
```

### 5. Configure AI Reasoning & Vision Models (Local Ollama, Google Gemini, OpenAI)
Click the **Settings (`⚙ Settings • Ollama / Gemini / OpenAI`)** button in the top-right header bar to switch between local and cloud AI providers at any time:

| Provider Mode | Supported Models | Capabilities Unlocked |
| :--- | :--- | :--- |
| **Local Reasoning & Vision (`Ollama` / Local Endpoint)** | `qwen2.5-vl`, `llava`, `llama3.2-vision`, `deepseek-r1`, `qwen2.5`, `llama3.3` (`http://localhost:11434`) | **100% local & private** text-to-3D procedural sculpting, **Vision image-to-3D** reference parsing, natural-language character choreography, set synthesis, and prompt polishing. |
| **Google Gemini** | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash` | High-speed multimodal vision-to-3D object decomposition, complex spatial stage blocking, and engine-specific prompt directing. |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `o3-mini` | Multimodal vision reference analysis, structured 3D part-graph reasoning, and cinematic prompt compilation. |

- All motion presets, Action Cycles (`1x`–`5x`), 3D character rigging, camera optics, lighting, and offline MP4/OpenPose/Depth rendering also work **out of the box with zero API keys required**.

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

## 🗺️ Upcoming Features & Roadmap

1. **✅ [Shipped] Direct ComfyUI Live API Bridge & In-App Video Rendering (`minimax_h3_ref2va`)**
   - One-click **Render in ComfyUI (MiniMax H3)** directly from within the studio with zero-CORS local proxy (`127.0.0.1:51731` / `/api/comfy`).
   - Automatic upload of rendered **RGB Previs MP4 (`<Video 1>`)** and **4 Object/Set Reference Images (`<picture 1>`–`<picture 4>`)** to a running ComfyUI server (`HTTP REST` + `WebSocket` live progress + `/history` fallback).
   - **In-App Final Result Player & Side-by-Side Sync View**: Stream and play the final AI-generated MP4+Audio video right inside the studio viewport, synchronized frame-for-frame beside your 3D Previs stage.
2. **☁️ Cloud Video API Direct Integration (Runway, Kling, Wan, MiniMax Hailuo, Luma, Fal.ai / Replicate)**
   - Send exported 3D Previs plates and compiled director prompts directly to cloud video APIs (for users without a high-VRAM local GPU) and receive the generated video back inside the Shot Bible.
3. **🎞️ Multi-Shot Timeline NLE & Sequence Assembly (Animatic-to-Final Editor)**
   - Stitch multiple shots from the **Shot Bible** into a continuous sequence timeline with cut points, transitions, dialogue/SFX audio tracks, and one-click full-scene export (Previs Animatic vs. Final AI Render).
4. **🕺 Video-to-3D Motion Capture (Extract Pose from Reference Video)**
   - Upload any real-world phone video or film clip to extract 3D skeletal motion (via local pose estimation) and apply it directly onto your 3D characters in the soundstage.
5. **🗣️ Lip-Sync, Facial Expressions & Audio-Driven Acting**
   - Attach dialogue audio clips to characters to drive automatic jaw/lip-sync visemes, eye-gaze targets, and emotional facial blendshapes during Close-Up and OTS dialogue shots.
6. **✅ [Shipped] Two-Way Reference Character/Object/Set Image Sync (`<picture 1>`–`<picture 4>`) & LoRA / IP-Adapter Expansion**
   - Link each 3D character, vehicle, prop, and set in Directing Mode to a reference image (`conceptImageUrl` / `conceptImageName`) with live thumbnails and automatic ComfyUI upload; next phase expands to multi-LoRA weight & IP-Adapter face ID presets.
7. **📦 Custom `.FBX` / `.GLTF` Animation Library & Mixamo Drag-and-Drop**
   - Import custom `.FBX` / `.GLB` skeletal animations and retarget them onto any character in the studio alongside the built-in biomechanical gait engine and Action Cycles.

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
│   │   ├── ShotBible.tsx             # Multi-scene storyboard manager with built-in learning demo
│   │   ├── StagePrevis3D.tsx         # Dual-viewport Three.js soundstage & camera viewfinder
│   │   ├── PrevisParametersDeck.tsx  # Right-hand inspector (Actors, Camera, Set, Lights, Render)
│   │   ├── CharacterControlCard.tsx  # Modular 3D Character Control Panel
│   │   └── PrevisExportDeck.tsx      # 24fps MP4 & ControlNet pass renderer
│   ├── engine/
│   │   ├── kinematics/       # Biomechanical gait engine, ready-made motions, 2-bone IK, OpenPose
│   │   ├── procedural3D/     # CSG & declarative 3D sculpt compiler
│   │   ├── staging/          # 3D environment builder & subject mesh factory
│   │   └── offlinePrevisRenderer.ts  # Deterministic multi-pass MP4 muxer pipeline
│   ├── stores/               # Zustand stores (useShotStore, useHistoryStore, useAssetLibraryStore)
│   └── types/                # Canonical Zod-validated ShotSpec schemas
└── workflows/
    └── templates/            # Verified ComfyUI API workflow templates & bindings
```

---

## 📄 License

Released as Open Source.
