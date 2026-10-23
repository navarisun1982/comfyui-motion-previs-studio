# 🎬 ComfyUI Motion Previs Studio

> **"Direct the Shot, Not the Prompt."**
> 3D shot blocking and motion previs for **local, open-weights** ComfyUI video models.
> Built for the **ComfyUI Open Source Higgsfield Competition (October 2026)**.

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-0.186-black.svg)](https://threejs.org/)

---

## What it is

Most AI video tools make you describe a camera move in words and hope. This studio lets you **stage the shot in 3D first** (actors, objects, lens, camera path, timing) and then drive a local video model from that staging.

**Engines**

| Engine | Where it runs | Status |
|---|---|---|
| LTX-2.5 (22B distilled, INT8) | Local ComfyUI | Primary engine. Moving to user-tested workflow templates in S1. |
| MiniMax H3 (FL2VA / Ref2VA / T2V) | Local ComfyUI | Moving to user-tested workflow templates in S1. |
| Seedance | — (no local weights) | Prompt export only. |

---

## Current state (honest)

**Works today**
- **3D stage (Three.js)**: procedural actors and objects, drag-to-block, keyframed actor and camera trajectories, through-the-lens viewfinder with real focal lengths.
- **Camera deck**: lens, framing, angle, movement type and speed, with a spline camera path.
- **In-app previs render** of the viewfinder to a video file.
- **Video Plate mode**: upload a clip (or use your rendered previs), get a heuristic camera-move solve, and preview Sobel/luma-based CV passes.
- **Exporters**: Blender camera/staging scripts, camera matrices, and prompt bundles for other tools.
- **Director Diff**: revision history with parameter diffs.
- **Object reasoner**: optional LLM (Ollama, Gemini, or OpenAI-compatible) that turns a text description into a procedural 3D part graph.

**Known limitations (being fixed; see Roadmap)**
- ComfyUI generation is **experimental**. The current LTX graph is generated in code and has known defects. S1 replaces it with your exported, tested workflow templates plus validated bindings.
- Projects persist in browser/Electron `localStorage`. Uploaded plates don't survive a reload yet (S2 adds project folders).
- The "pose" pass previews are heuristic stick figures, not a pose model.
- No undo/redo yet (S3).

There is **no mock engine**. With ComfyUI offline you can still block shots, render previs, and export. Generation requires ComfyUI.

---

## Quick start

### Prerequisites
- **Node.js** v18+ (developed on v26).
- **ComfyUI** running at `http://127.0.0.1:8188` for generation (not needed for blocking, previs, or export).

### Desktop (Electron)
- Double-click **`Launch ComfyUI Motion Previs Studio.vbs`**. It rebuilds automatically when the source is newer than `dist/`, and shows the build log if the build fails.
- Or run **`run.bat`**, which builds and refuses to launch on build failure.

### Browser dev server
```bash
npm install
npm run dev          # http://127.0.0.1:5173  (or start_studio.bat)
```

### Tests and build
```bash
npm test             # Vitest (node environment by default)
npm run build        # tsc (app + scripts) + vite build
```

### In-app log console
Click the terminal icon in the top bar to see actions, ComfyUI traffic, WebSocket events, and the live ShotSpec.

---

## Roadmap (remediation stages)

| Stage | Scope |
|---|---|
| **S0** Foundation | Remove dead/fake code and assets, rename, fast tests, honest docs. |
| **S1** Truthful pipeline | Template registry + validated bindings, single job runner (cancel, no timeouts, no duplicate revisions), prompt override model, seed + exact workflow stored per revision, offline Package mode. |
| **S2** Desktop foundation | Preload IPC network broker, encrypted API keys, strict CSP, project folders with versioned schema + migrations. |
| **S3** Editing safety | Undo/redo, Welcome screen, real project info, readiness checklist. |
| **S4** Geometric conditioning | Deterministic offline render of layout + depth passes to MP4 for LTX IC-LoRA control. |
| **S5** Performance | Store selectors, persistence off the hot path, code-splitting, Three.js disposal. |
| **S6** UX overhaul | Right-panel inspector, single engine picker, type scale, 1280×720 layout. |
| **S7–S10** Features | Takes grid + queue, motion-fidelity scoring, natural language → ShotSpec, sequence/continuity + OTIO/EDL export. |

---

## Repository structure

```
├── docs/                    # Architecture, competition rules, ADRs, risk register
│   └── archive/             # Pre-remediation progress/task logs
├── electron/main.cjs        # Desktop shell
├── scripts/                 # check_comfy_capabilities.ts; dev/ = diagnostics
├── src/
│   ├── adapters/            # LTX-2.5, MiniMax H3, Seedance adapters
│   ├── components/          # Stage, camera deck, VFX deck, ComfyUI panel, diff
│   ├── engine/              # Previs math, prompt compiler, procedural 3D, exporters
│   ├── services/            # ComfyUI REST/WS client, LLM reasoner
│   ├── stores/              # Zustand stores
│   └── types/               # ShotSpec schema
├── tests/                   # Vitest suite
├── workflows/templates/     # User-supplied tested ComfyUI workflows (S1)
├── AGENTS.md                # Operating manual for AI agents
├── TASKS.md / PROGRESS.md   # Current stage plan and status
└── LICENSE                  # MIT
```

---

## License

[MIT](LICENSE). Free for personal, commercial, and research use.
