# 🎬 AI Director Studio

> **"Direct the Shot, Not the Prompt."**  
> An open-source, visual cinematic directing application for ComfyUI.  
> Built for the **ComfyUI Open Source Higgsfield Competition (October 2026)**.

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev/)
[![ComfyUI API](https://img.shields.io/badge/ComfyUI-API%20%2F%20WebSocket-yellow.svg)](https://comfy.org)
[![Tested on RTX 3090](https://img.shields.io/badge/GPU-RTX%203090%20(24GB)-green.svg)](https://nvidia.com)

---

## 🏆 Competition Target Awards

AI Director Studio is engineered specifically for the [ComfyUI Open Source Higgsfield Competition](https://comfy.org/open-source-higgsfield):

- **Best Overall ($10,000)**: Real end-to-end directorial studio converting visual cinematic physics into reproducible video generations.
- **Most Innovative (NVIDIA GeForce RTX 5090)**: The novel "Direct the Shot, Not the Prompt" paradigm — interactive 2D SVG film stage previsualization, canonical Zod `ShotSpec`, model-aware capability translation, and the **Director Diff** revision engine.
- **Open Weights Only (NVIDIA GeForce RTX 5090)**: Zero proprietary nodes or closed APIs. Runs on 100% open-weights local models (**LTX-2.5 22B Distilled INT8** + Gemma 12B CLIP).
- **VFX Workflow Built with LTX ($2,000 Cash Bonus)**: Uses LTX-2.5 as the flagship core video diffusion model with camera trajectory conditioning and latent guidance.

---

## 🌟 The Core Innovation

Most AI video interfaces force filmmakers to be "prompt gamblers," blindly hoping that strings like *"cinematic camera move, 8k"* result in the desired camera path.

**AI Director Studio transforms AI video generation into a true directorial workflow:**

1. **Optical Camera Physics Deck**: Select real focal lengths (`18mm`, `24mm`, `35mm`, `50mm`, `85mm`, `135mm`), shot framing (`EWS`, `WS`, `MS`, `CU`, `ECU`), camera angles (`eye-level`, `low-angle`, `dutch-angle`, `overhead`), and precise trajectory movements (`dolly-in`, `truck-left`, `pedestal-up`, `orbit-cw`, `zoom`, `whip-pan`).
2. **Deterministic 2D Stage Previs (Zero GPU Credits)**: A top-down interactive SVG film stage. Real-time projected camera FOV cone based on optical focal length, draggable start/end camera gizmos, actor tokens, trajectory vectors, and live 24fps animated scrubbing — before spending a single GPU second.
3. **Actor Blocking & Trajectory**: Position and direct actors on stage with dedicated visual tokens and action start timers.
4. **Model-Aware Direction Engine**: Distinguishes which directorial inputs are supported **Natively** by the target model, which are **Approximated** through structured prompt tokens, and which are **Unsupported**.
5. **Real ComfyUI Execution**: Connects via HTTP REST and WebSockets directly to local ComfyUI (`http://127.0.0.1:8188`). Real-time step progress, sampling percentage, node execution monitoring, and automated output video retrieval.
6. **Director Diff Inspector**: Side-by-side shot revision comparison. Compare parameter changes, textual prompt differences, and synchronize dual video outputs to evaluate motion fidelity across iterations with one-click restore.

---

## 📐 System Architecture

```
User Directorial Input (Camera Deck, 2D Stage, Actor Blocking)
                       │
                       ▼
            Canonical ShotSpec (Zod Schema)
                       │
                       ▼
      Model Capability Adapter (LTX-2.5 / Mock)
      ├── Validates physical constraints
      ├── Compiles structured prompt bundle
      └── Generates executable ComfyUI Workflow JSON
                       │
                       ▼
      ComfyClient Bridge (REST + WebSocket)
      ├── Uploads reference start-frames (/upload/image)
      ├── Queues execution graph (/prompt)
      └── Streams live progress & node events (/ws)
                       │
                       ▼
          Local ComfyUI Backend (:8188)
          └── NVIDIA RTX 3090 (24GB VRAM)
                       │
                       ▼
       Video Output Retrieval & Director Diff
       ├── Instant playback with frame scrubbing
       └── Side-by-side parameter & output comparison
```

---

## 🚀 Quick Start (Desktop Application & Web)

### Prerequisites
- **Node.js**: v18+ (tested on v26.5)
- **npm**: v9+ (tested on v12.0)
- **Local ComfyUI**: Running on `http://127.0.0.1:8188` (optional; studio includes built-in Mock Directing Engine for instant offline preview and testing).

### 1. One-Click Native Desktop Launch (Recommended)
Double-click **`Launch AI Director Studio.vbs`** (or **`run.bat`**) in the project root:
- Opens immediately as a **standalone desktop application** window (Electron).
- **Zero lingering command prompt (CMD) windows**.
- Direct local ComfyUI API & WebSocket connectivity with hardware acceleration.

### 2. Built-In In-App Debugger & Action Inspector
No need to look at terminal logs or external consoles:
- Press the **`~` (tilde / backtick)** key or click the **terminal pill icon** in the top navigation bar.
- **Live Action Stream**: Inspect every camera adjustment, actor blocking move, prompt change, and revision creation.
- **ComfyUI Traffic Monitor**: Track WebSocket packet streams, active execution node, and sampling percentage.
- **ShotSpec State Tree**: Real-time inspection of the complete active directorial state with formatted JSON viewer.
- **Diagnostics**: Filter by Category (`Action`, `API`, `WS`, `Workflow`, `System`), filter by severity, and one-click copy to clipboard.

### 3. Manual Desktop or Dev Server Launch
```bash
# Launch native desktop application
npm run desktop

# Or launch Vite browser dev server
npm run dev
```

### 4. Run Automated Tests
```bash
npm test
```
All unit tests for the `ShotSpec` schema, `Director Diff`, `LTXVideoAdapter`, and `MockModelAdapter` execute via Vitest.

### 5. Build Production Bundle
```bash
npm run build
```

---

## 🎞️ Directorial Walkthrough

1. **Configure Camera**: Pick your lens (e.g. `35mm Classic Cinema`), camera angle (`Low Angle`), and trajectory movement (`Dolly Push-In` at `Slow Cinematic` speed).
2. **Inspect Previs**: Watch the interactive 2D film stage. Scrub the timeline or press **Play** to visualize the camera frustum closing in on your subject.
3. **Block Your Actors**: Add subjects, position them on the stage grid, and set their action start times.
4. **Select Reference Frame (Optional)**: Drop an image into the upload box to direct an Image-to-Video generation starting from that exact frame.
5. **Direct Shot**: Click **DIRECT SHOT (EXECUTE WORKFLOW)**. Watch real-time node execution progress streaming directly from ComfyUI.
6. **Compare Revisions (Director Diff)**: Tweak your focal length to `85mm` or change the movement to a `Truck Left`. Switch to the **Director Diff** tab to inspect what parameters changed and compare the generated videos side-by-side.

---

## 📁 Repository Structure

```
├── docs/
│   ├── ARCHITECTURE.md            # System design & mathematical specifications
│   ├── COMPETITION_REQUIREMENTS.md# Rules, deadlines, and prize matrix
│   ├── SETUP_REPORT.md            # Hardware & local ComfyUI audit report
│   ├── DECISIONS.md               # Architectural Decision Records (ADRs)
│   └── RISK_REGISTER.md           # Technical risk mitigation matrix
├── src/
│   ├── adapters/                  # Model capability adapters (LTX-2.5, Mock)
│   ├── components/                # UI components (Stage Previs, Camera Deck, Diff)
│   ├── engine/                    # Prompt compiler & geometry math
│   ├── services/                  # ComfyUI HTTP REST & WebSocket client
│   ├── stores/                    # Zustand state (ShotSpec, History, Comfy)
│   ├── types/                     # Canonical ShotSpec Zod schemas
│   └── App.tsx                    # Main studio workspace
├── tests/                         # Vitest unit test suite
├── workflows/                     # Exported ComfyUI workflow JSON files
├── AGENTS.md                      # Persistent operational manual for AI agents
├── TASKS.md                       # Granular Work Breakdown Structure (WBS)
├── PROGRESS.md                    # Milestone progress log
└── LICENSE                        # MIT Open Source License
```

---

## 📹 Demo Video Script & Storyboard (2 Minutes)

| Timecode | Visual / Action | Voiceover / Narration |
|:---|:---|:---|
| **0:00 - 0:20** | Split screen: Traditional chaotic prompt box vs. clean, cinematic **AI Director Studio** interface. | *"Today's AI video generation is prompt gambling. You type 'cinematic camera move' and pray. AI Director Studio changes that: Direct the shot, not the prompt."* |
| **0:20 - 0:50** | User interacts with **Camera Deck** (`35mm`, `Low Angle`, `Dolly-In`). Moves camera on **2D Stage Previs**. Presses Play: camera frustum moves smoothly toward the subject token. | *"Here on our interactive 2D stage, you control real camera physics. The FOV cone calculates optically from your 35mm lens. You scrub the timeline in real-time with zero GPU credits."* |
| **0:50 - 1:20** | User clicks **DIRECT SHOT**. Live progress bar streams from ComfyUI running locally on an RTX 3090. Generated video plays in studio. | *"With one click, our capability-aware engine compiles the ShotSpec into a pure open-weights LTX-2.5 workflow on ComfyUI, generating the shot with the exact camera push you directed."* |
| **1:20 - 1:50** | User switches lens to `85mm`, runs revision 2, and opens **Director Diff**. Both videos play side-by-side with parameter diff table. | *"Directors iterate. With Director Diff, every shot is versioned. Compare revisions side-by-side, inspect parameter changes, and restore any previous slate with a click."* |
| **1:50 - 2:00** | Final slate showing open-source GitHub repo, ComfyUI integration, and `#OpenSourceHiggsfield`. | *"AI Director Studio: Open source, open weights, built on the Comfy Developer Platform. Experience true cinematic direction."* |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free for personal, commercial, and research use.
