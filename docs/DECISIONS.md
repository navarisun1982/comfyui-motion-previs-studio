# Architectural Decision Records (ADRs) — ComfyUI Motion Previs Studio

> Superseded records are kept for history. Read the newest ADRs (bottom) first.

---

## ADR-001: Primary Model Selection — LTX-2.5 Open Weights & VFX Pipeline
- **Date**: 2026-10-17
- **Status**: Accepted — *Mock Dev Adapter part superseded by ADR-006*
- **Context**: The competition offers prizes for **Best Overall ($10,000)**, **Most Innovative (RTX 5090)**, **Open Weights Only (RTX 5090)**, and an **OSS Ecosystem Bonus for VFX Workflow Built with LTX ($2,000 cash)**. The local machine possesses an RTX 3090 (24GB) and already has `LTX2.5\ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` and Gemma 12B CLIP installed.
- **Decision**: Select **LTX-2.5 (22B Distilled INT8)** as the primary flagship model for the application, while structuring the backend with a pluggable `ModelAdapter` interface that also supports MiniMax H3 and a Mock Dev Adapter.
- **Consequences**:
  - Maximize prize eligibility across four distinct categories.
  - Comply 100% with the Open Weights Only restriction.
  - Zero cloud API costs incurred during local development.

---

## ADR-002: Frontend Framework & Previs Rendering Engine
- **Date**: 2026-10-17
- **Status**: Superseded by ADR-005 (SVG stage replaced by Three.js 3D stage)
- **Context**: The application requires high-performance interactive 2D stage previsualization, instant reactivity, low bundle footprint, and stable Windows execution.
- **Decision**: Use **Vite + React 19 + TypeScript + Tailwind CSS + Lucide Icons + Zustand + Zod**, utilizing native SVG for the interactive 2D cinematic previsualization stage.
- **Consequences**:
  - Sub-second hot-module reload during development.
  - SVG provides mathematically exact vector coordinates, scalable zoom/pan, and crystal-clear frustum projection without heavy WebGL/Three.js dependencies.
  - Clean client state isolation with Zustand and runtime schema validation with Zod.

---

## ADR-003: ComfyUI Communication — Direct Client Bridge with Dev Proxy
- **Date**: 2026-10-17
- **Status**: Accepted — *to be amended in S2 (Electron main-process network broker)*
- **Context**: ComfyUI runs locally on port 8188. Standard web browsers encounter CORS restrictions when calling `localhost:8188` directly from a separate dev port (e.g. `localhost:5173`), unless CORS headers or a proxy is used.
- **Decision**: Configure Vite's built-in development proxy (`/api/comfy` and `/ws`) to seamlessly forward requests to `http://127.0.0.1:8188`, while supporting direct connection mode for production or electron builds.
- **Consequences**:
  - No extra Python/Node proxy server microservice needed.
  - Direct, reliable WebSocket event streaming for real-time progress and node execution tracking.
  - Protects the user environment from extra daemons.

---

## ADR-004: Canonical `ShotSpec` Data Model & Director Diff
- **Date**: 2026-10-17
- **Status**: Accepted
- **Context**: Directing decisions must be preserved independently of model generation outcomes. Directors need to track revisions, compare camera/actor tweaks, and see exact compiled prompt diffs.
- **Decision**: Implement a strictly typed, immutable `ShotSpec` schema validated by Zod, accompanied by an in-memory & LocalStorage revision history store that powers **Director Diff**.
- **Consequences**:
  - Complete decoupling between user intent (film language) and model prompt engineering.
  - Effortless side-by-side comparison of shot variations.
- **Reality check (2026-10-23)**: Zod validation is not consistently enforced on all write paths yet; S2 introduces a versioned, Zod-validated project schema with migrations.

---

## ADR-005: 3D Stage on Three.js
- **Date**: 2026-10-23 (records a change made during development)
- **Status**: Accepted
- **Context**: Blocking real camera moves (height, tilt, parallax, focal length) needs true 3D; a top-down SVG stage could not express them.
- **Decision**: The stage and viewfinder are rendered with Three.js; actors/objects are procedural meshes.
- **Consequences**: Heavier bundle and GPU use (addressed in S5: code-splitting, disposal audit); enables deterministic offline rendering of layout/depth passes (S4).

---

## ADR-006: No Mock Engine; Honesty Policy
- **Date**: 2026-10-23
- **Status**: Accepted
- **Decision**: Remove the mock engine and all fabricated outputs (demo plates, procedural fake scenes, placeholder analysis). With ComfyUI offline the app offers blocking, previs, and export; generation states clearly that ComfyUI is required.
- **Consequences**: Tests use real pure functions and in-memory storage stubs, not fake engines. UI copy must never imply a capability that isn't running.

---

## ADR-007: Engines Driven by User-Tested Workflow Templates
- **Date**: 2026-10-23
- **Status**: Accepted (implemented in S1)
- **Context**: Hand-generated workflow graphs in code drifted from real node signatures (wrong loaders, wrong input types, bad sampler settings).
- **Decision**: Each engine mode uses an API-format workflow exported by the user from a working ComfyUI graph (`workflows/templates/<id>.api.json`) plus a binding file mapping studio fields to `{ nodeId, inputName, classType }`. Bindings are verified before every queue; mismatches are hard errors.
- **Consequences**: Generation correctness is anchored to graphs proven in ComfyUI; template updates are cheap and safe.

---

## ADR-008: Seedance Is Prompt-Export Only
- **Date**: 2026-10-23
- **Status**: Accepted
- **Decision**: Seedance has no local weights, so the studio only compiles and exports prompts for it. No ComfyUI graph is generated or queued.

---

## ADR-009: Stage-Gated Remediation Workflow
- **Date**: 2026-10-23
- **Status**: Accepted
- **Decision**: Work proceeds in stages S0–S10, each on its own `stage/NN-name` branch, merged to `master` only after user approval of a walkthrough. Only `mp4-muxer` is pre-approved as a new dependency.
