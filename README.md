# ComfyUI Motion Previs Studio — Cinematic Command Center 2026

> **"Direct the Shot, Not the Prompt."**  
> Built for the **ComfyUI Open Source Higgsfield Competition** (Best Overall · Most Innovative · Open Weights Only · VFX Workflow Built with LTX).

**ComfyUI Motion Previs Studio** is a real-time **3D Motion Previsualization & Camera Blocking Studio** designed for filmmakers, VFX supervisors, and AI video directors. Instead of guessing text prompts for camera movement, character blocking, and lens framing, you direct actors, cameras, sets, and lights inside an interactive 3D soundstage — and export deterministic **24fps MP4 previs**, **OpenPose skeletal passes**, **Depth maps**, **4×4 camera matrices**, and **ComfyUI workflow bundles** for **LTX-2.5 (22B Distilled INT8)** and **MiniMax H3**.

---

## 📸 Visual Feature Tour & Screenshots

> Place your captured screenshots in `docs/screenshots/` using the filenames below (or run the automated screenshot script in Step 3 below) so GitHub renders them automatically.

### 1. Full Studio Workspace — Dual 3D Viewports & 24fps Timeline
![Full Studio Workspace](docs/screenshots/01-studio-workspace.png)
- **Left Sidebar (`Shot Bible`)**: Multi-scene, multi-shot storyboard manager with instant scene switching, shot duplication, continuity propagation, and 3 built-in competition demo scenes (18 curated cinematic shots).
- **Center Dual-Viewport Stage (`3D Soundstage` + `Camera Viewfinder`)**:
  - **Left Viewport (`3D Soundstage`)**: Free-orbit director's perspective showing the 3D set, volumetric lighting cones, camera frustum rig, motion paths, and actor transform gizmos.
  - **Right Viewport (`Camera Viewfinder`)**: Live through-the-lens render locked to your chosen aspect ratio (`16:9`, `2.39:1`, `9:16`, `1:1`), focal length (`14mm`–`135mm`), and depth-of-field aperture (`f/1.4`–`f/22`).
- **Bottom Transport & Keyframe Scrubber**: Frame-accurate `24fps` timeline with camera and subject keyframe diamonds, playback loop controls, and timecode readout.

### 2. 3D Character Control Panel (2026 Inspector Architecture)
![3D Character Control Panel](docs/screenshots/02-character-control-panel.png)
- **Ready-Made Motion Studio**: One-click procedural biomechanical animations across **Move / Jump** (`Walk Forward`, `Run / Sprint`, `Jump / Leap`, `Sneak / Stealth`, `Back Up / Retreat`), **Fight / Action** (`Sword Slash`, `Dodge / Roll`, `Martial Combo`, `Aim & Fire`), and **Act / Emote** (`Wave / Greet`, `Heroic Taunt`, `Look Around`, `Victory Cheer`, `Talk / Dialogue`).
- **Auto / Move / Spot Execution Modes**: Automatically calculate floor travel paths or lock actions in-place with automatic character heading alignment and foot grounding.
- **Natural-Language Acting Director**: Type stage directions (e.g., `"walks slowly from 30 to 48 then waves"`) to synthesize multi-cue keyframe trajectories and skeletal poses.
- **Appearance, Procedural 3D & Rigging**:
  - Edit 3D look by text prompt or attach custom `.GLB` 3D assets.
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
- **Deterministic ComfyUI Workflow Bundles**: Exports `.zip` or JSON bundles containing your rendered control passes, `4×4` camera extrinsic matrices, compiled engine prompts, and verified ComfyUI API graphs for **LTX-2.5** and **MiniMax H3**.

---

## 🎬 Built-in Competition Demo Scenes (18 Shots)

Upon launch, the **Shot Bible** loads 3 complete director-grade scenes (6 shots each) showcasing the full spectrum of camera blocking and character animation:

1. **Scene 01 — Neon Protocol (Cyberpunk Action Thriller)**
   - Crane establishers, 35mm tracking runs, 85mm OTS dialogue standoffs, katana combat choreography, orbital breach shots, and 24mm crane pull-backs.
2. **Scene 02 — Chronos Relic (Temple Expedition Adventure)**
   - Torch-lit colonnade walk-ins, relic inspection close-ups, guardian awakening pedestals, 24mm dodge-and-sprint escapes, and heroic doorway silhouettes.
3. **Scene 03 — Golden Hour Romance (Intimate Rooftop Drama)**
   - **Shot 03A**: `50mm` Anamorphic Two-Shot Dolly In as Elena and Julian walk toward each other on a warm candlelit terrace.
   - **Shot 03B**: `85mm f/1.4` Over-the-Shoulder Close-Up on Elena (`close-up` eye-line framing with soft foreground bokeh).
   - **Shot 03C**: `85mm f/1.4` Reverse OTS Close-Up on Julian responding in intimate dialogue.
   - **Shot 03D**: `135mm f/1.4` Extreme Close-Up Profile Drift as they step inches apart.
   - **Shot 03E**: `85mm f/1.8` Candlelight Dialogue Medium Close-Up with a slow romantic orbit.
   - **Shot 03F**: `50mm f/1.8` Starlight Embrace & Slow Pull-Back into the golden-hour skyline.

---

## 🛠️ Installation & Setup Guide

### Prerequisites
- **OS**: Windows 10 / 11, macOS, or Linux
- **Node.js**: `v20.x` or `v22.x` LTS (includes `npm`)
- **Git**: For cloning and version control
- *(Optional)* **ComfyUI** running locally at `http://127.0.0.1:8188` for live LTX-2.5 / MiniMax H3 video generation (the 3D Previs Studio and MP4/ControlNet Pass Exporters run 100% locally in WebGL without requiring ComfyUI to be online).

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/comfyui-motion-previs-studio.git
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

### 5. Optional: Configure AI Reasoner & ComfyUI
- Click the **Settings / AI Reasoner** button in the top header bar (or create a `.env` file from `.env.example`) to configure an optional LLM provider (OpenAI, Gemini, Anthropic, or local Ollama/OpenAI-compatible endpoint) for natural-language 3D sculpting and scene decomposition.
- All motion presets, 3D character rigging, camera optics, lighting, and offline MP4/OpenPose/Depth rendering work **out of the box with zero API keys required**.

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
│   ├── screenshots/          # Feature tour screenshots for GitHub README
│   ├── ARCHITECTURE.md       # System architecture & data flow
│   └── COMPETITION_REQUIREMENTS.md
├── public/
│   └── models/               # Rigged humanoid skeletal meshes (x-bot / y-bot)
├── src/
│   ├── adapters/             # Engine prompt & config adapters (LTX-2.5, MiniMax H3, Seedance)
│   ├── components/           # 2026 Cinematic Command Center UI
│   │   ├── ShotBible.tsx             # Multi-scene / 18-shot storyboard manager
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

Released as Open Source for the **ComfyUI Open Source Higgsfield Competition**.
