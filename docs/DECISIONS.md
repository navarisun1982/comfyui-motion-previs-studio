# Architectural Decision Records (ADRs) — AI Director Studio

---

## ADR-001: Primary Model Selection — LTX-2.5 Open Weights & VFX Pipeline
- **Date**: 2026-10-17
- **Status**: Accepted
- **Context**: The competition offers prizes for **Best Overall ($10,000)**, **Most Innovative (RTX 5090)**, **Open Weights Only (RTX 5090)**, and an **OSS Ecosystem Bonus for VFX Workflow Built with LTX ($2,000 cash)**. The local machine possesses an RTX 3090 (24GB) and already has `LTX2.5\ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` and Gemma 12B CLIP installed.
- **Decision**: Select **LTX-2.5 (22B Distilled INT8)** as the primary flagship model for the application, while structuring the backend with a pluggable `ModelAdapter` interface that also supports MiniMax H3 and a Mock Dev Adapter.
- **Consequences**:
  - Maximize prize eligibility across four distinct categories.
  - Comply 100% with the Open Weights Only restriction.
  - Zero cloud API costs incurred during local development.

---

## ADR-002: Frontend Framework & Previs Rendering Engine
- **Date**: 2026-10-17
- **Status**: Accepted
- **Context**: The application requires high-performance interactive 2D stage previsualization, instant reactivity, low bundle footprint, and stable Windows execution.
- **Decision**: Use **Vite + React 19 + TypeScript + Tailwind CSS + Lucide Icons + Zustand + Zod**, utilizing native SVG for the interactive 2D cinematic previsualization stage.
- **Consequences**:
  - Sub-second hot-module reload during development.
  - SVG provides mathematically exact vector coordinates, scalable zoom/pan, and crystal-clear frustum projection without heavy WebGL/Three.js dependencies.
  - Clean client state isolation with Zustand and runtime schema validation with Zod.

---

## ADR-003: ComfyUI Communication — Direct Client Bridge with Dev Proxy
- **Date**: 2026-10-17
- **Status**: Accepted
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
