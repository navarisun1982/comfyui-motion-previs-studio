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

### 2. 3D Character Control Panel (2026 Inspector Architecture)
![3D Character Control Panel](docs/screenshots/02-character-control-panel.png)
- **Ready-Made Motion Studio**: One-click procedural biomechanical animations across **Move / Jump** (`Walk Forward`, `Run / Sprint`, `Jump / Leap`, `Sneak / Stealth`, `Back Up / Retreat`), **Fight / Action** (`Sword Slash`, `Dodge / Roll`, `Martial Combo`, `Aim & Fire`), and **Act / Emote** (`Wave / Greet`, `Heroic Taunt`, `Look Around`, `Victory Cheer`, `Talk / Dialogue`).
- **Auto / Move / Spot Execution Modes & Action Cycles (`1x`–`5x`)**: Automatically calculate floor travel paths or lock actions in-place, define exact **Action Cycles (`1x`–`5x`)** across the shot duration so gestures play naturally without robotic looping, and dial in **Facing Direction (`Body Yaw`)** (`Face Cam`, `3/4 Left`, `Profile`, `OTS Back`).
- **Natural-Language Acting Director**: Type stage directions (e.g., `"walks slowly from 30 to 48 then waves"`) to synthesize multi-cue keyframe trajectories and skeletal poses using local or cloud reasoning models.
- **Appearance, Procedural 3D & Vision-to-3D Rigging**:
  - Edit 3D look by text prompt, generate 3D props from reference images using **Vision models**, or attach custom `.GLB` 3D assets.
  - Interactive **FK/IK Bone Manipulation** right in the 3D viewport (`Pose Bones` mode) + **Socket to Character Bone** (attach props like swords, lanterns, or relics directly to `Right Hand`, `Left Hand`, `Head`, or `Spine`).

### 3. Camera & Lens Optics Deck — Close-Ups, OTS & Dynamic Trajectories
![Camera & Lens Optics Deck](docs/screenshots/03-camera-optics-deck.png)
- **True Cinema Lenses**: `14mm` Ultra-Wide through `85mm` Portrait and `135mm` Telephoto Close-Up with adaptive eye-level target framing (`Close-Up`, `Extreme Close-Up`, `Medium Close-Up`, `Medium`, `Wide`).
- **Dynamic Camera Trajectories**: `Static`, `Dolly In`, `Pull Back`, `Track Left/Right`, `Orbit 360`, `Crane Up`, `Pedestal Down`, `Handheld`, and `Whip Pan` with customizable start/end path coordinates and easing curves.

### 4. 3D Set & Environment Builder + Multi-Light Studio Rig
![Set & Lighting Studio](docs/screenshots/04-environment-and-lighting.png)
- **Procedural 3D Environments**: Instant architectural soundstages (`Cyberpunk Alleyway`, `Ancient Temple Ruins`, `Warm Candlelit Rooftop Terrace`, `Sci-Fi Corridor`, `Film Studio Cyc Wall`) with grounded hero props, atmospheric fog, and custom prompt-driven 3D object sculpting.
- **Three-Point + Practical Studio Lighting**: Interactive 3D light gizmos (`Key`, `Fill`, `Rim`, `Practical`) with real-time intensity, color temperature, cone angle, and shadow control.

### 5. Previs Render & Multi-Pass Export Deck
![Previs Render & Export Deck](docs/screenshots/05-previs-export-deck.png)
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
