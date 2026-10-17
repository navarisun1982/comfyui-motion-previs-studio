# AI Director Studio — Task Breakdown & Work Breakdown Structure (WBS)

---

## Phase 0: Audit & Technical Validation `[DONE]`
- [x] Inspect local GPU, CUDA, RAM, and hardware capabilities ([docs/SETUP_REPORT.md](file:///e:/work/Comfy%20AI%20Director/docs/SETUP_REPORT.md)).
- [x] Inspect running ComfyUI process (PID 53052, port 8188) and environment (`D:\ComfyUI`).
- [x] Inspect available video models (LTX-2.5, MiniMax H3, Wan 2.1) and custom nodes.
- [x] Fetch and verify official competition rules ([docs/COMPETITION_REQUIREMENTS.md](file:///e:/work/Comfy%20AI%20Director/docs/COMPETITION_REQUIREMENTS.md)).
- [x] Produce architecture and design specification ([docs/ARCHITECTURE.md](file:///e:/work/Comfy%20AI%20Director/docs/ARCHITECTURE.md)).
- [x] Formulate risk register & mitigation plan ([docs/RISK_REGISTER.md](file:///e:/work/Comfy%20AI%20Director/docs/RISK_REGISTER.md)).
- [x] Document key architectural decisions ([docs/DECISIONS.md](file:///e:/work/Comfy%20AI%20Director/docs/DECISIONS.md)).
- [x] Establish project brief, persistent memory, and tracking ([PROJECT_BRIEF.md](file:///e:/work/Comfy%20AI%20Director/PROJECT_BRIEF.md), [TASKS.md](file:///e:/work/Comfy%20AI%20Director/TASKS.md), [PROGRESS.md](file:///e:/work/Comfy%20AI%20Director/PROGRESS.md), [AGENTS.md](file:///e:/work/Comfy%20AI%20Director/AGENTS.md)).

---

## Phase 1: Application Foundation & Scaffolding `[DONE]`
- [x] Scaffold Vite + React 19 + TypeScript + Tailwind CSS application in project root.
- [x] Configure Tailwind CSS with cinematic dark theme and deep glassmorphic design tokens.
- [x] Implement canonical `ShotSpec` schema with Zod validation ([src/types/shotspec.ts](file:///e:/work/Comfy%20AI%20Director/src/types/shotspec.ts)).
- [x] Implement Zustand stores:
  - `useShotStore` (active shot, parameters, validation).
  - `useHistoryStore` (revisions, diff tracking, rollback).
  - `useComfyStore` (connection status, active jobs, outputs).
- [x] Build Mock Model Adapter for deterministic development & instant test previews ([src/adapters/mockAdapter.ts](file:///e:/work/Comfy%20AI%20Director/src/adapters/mockAdapter.ts)).
- [x] Setup Vitest testing framework and write unit tests for schema validation and mock adapter.
- [x] Verify `npm run test` (11/11 passing) and `npm run build` (0 errors).

---

## Phase 2: Director Engine Core & Cinematic Previs `[DONE]`
- [x] Implement Camera Control Deck ([src/components/CameraDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/CameraDeck.tsx)):
  - Focal length selection (18mm, 24mm, 35mm, 50mm, 85mm, 135mm).
  - Shot size & angle (wide, medium, close-up, Dutch angle, bird's eye).
  - Movement type & direction (dolly, truck, pedestal, pan, tilt, orbit, zoom, whip-pan).
  - Pacing & easing.
- [x] Implement Actor Blocking & Trajectory ([src/components/ActorBlocking.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ActorBlocking.tsx)):
  - Actor token name, prompt descriptor.
  - Start & end coordinates on film stage.
  - Action start time and duration.
- [x] Build 2D Cinematic Stage Previsualizer (SVG) ([src/components/StagePrevis.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis.tsx)):
  - Top-down film stage with grid and stage dimensions.
  - Camera frustum with FOV cone matching selected focal length.
  - Dynamic trajectory vectors (camera & actors).
  - Real-time animated playback simulation (Play/Pause/Scrub).
- [x] Implement Capability-Aware Prompt Compiler ([src/engine/promptCompiler.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/promptCompiler.ts)):
  - Structural prompt assembly: Subject + Action + Camera Movement + Lens/Framing + Lighting + Style.
  - Negative prompt generation.
  - Capability badges (Native, Approximated, Unsupported).

---

## Phase 3: Real ComfyUI Integration & LTX-2.5 Video Pipeline `[DONE]`
- [x] Build ComfyUI API Client ([src/services/comfyClient.ts](file:///e:/work/Comfy%20AI%20Director/src/services/comfyClient.ts)):
  - REST client: `/system_stats`, `/upload/image`, `/prompt`, `/history`, `/view`.
  - WebSocket client: `/ws?clientId=...` with auto-reconnection and event dispatching.
- [x] Implement Reference Image Upload & Management:
  - Drag-and-drop reference image input.
  - Upload to ComfyUI `/upload/image`.
- [x] Build LTX-2.5 Model Adapter ([src/adapters/ltxAdapter.ts](file:///e:/work/Comfy%20AI%20Director/src/adapters/ltxAdapter.ts)):
  - Injects `ShotSpec` camera motion, lens conditioning, duration, seed into workflow prompt graph.
  - Configures LTX-2.5 distilled INT8 model, Gemma CLIP, and VAE.
- [x] Job Execution, Progress Tracking & Error Handling ([src/components/ComfyExecutionPanel.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ComfyExecutionPanel.tsx)):
  - Step-by-step progress bar (sampling percentage, current node).
  - Error capture with user-friendly recovery advice (OOM, missing files).
- [x] Output Retrieval & Video Player:
  - Fetch generated MP4 from ComfyUI `/view`.
  - Rich video playback with loop and download.

---

## Phase 4: Director Diff Engine `[DONE]`
- [x] Automatic shot versioning upon modification or generation.
- [x] Side-by-side Revision Comparison UI ([src/components/DirectorDiffInspector.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/DirectorDiffInspector.tsx)):
  - Visual parameter diff (camera angle, actor paths, duration).
  - Textual diff of compiled prompts.
  - Dual synchronized video playback comparing generated outputs.
- [x] One-click revision restoration ("Restore Revision to Studio").
- [x] Project Export (JSON ShotSpec bundle + ComfyUI workflow JSON).

---

## Phase 5: Quality Assurance & Competition Submission Readiness `[DONE]`
- [x] Automated tests with Vitest (11 passing tests across all components).
- [x] Production bundle build (`dist/index.html` + `dist/assets/*` generated with 0 errors).
- [x] Export ready-to-run ComfyUI workflow files in `workflows/`:
  - `ltx_2.5_director_text_to_video.json`
  - `ltx_2.5_director_image_to_video.json`
  - `mock_director_test_workflow.json`
- [x] Comprehensive README.md with architecture overview, screenshots guide, setup instructions, and 2-minute demo video storyboard.
- [x] Open Source License ([LICENSE](file:///e:/work/Comfy%20AI%20Director/LICENSE) - MIT).

---

## Phase 6: Native Desktop Application & In-App Directorial Debugger `[DONE]`
- [x] Scaffold Electron desktop runtime (`electron/main.cjs`, `v44.8.0`):
  - 1480x940 native dark-framed application window.
  - Hardware-accelerated WebGL/Canvas rendering.
  - Auto-fallback from Vite dev port 5173 to local `dist/index.html`.
  - Built-in F12 / Ctrl+Shift+I shortcut for Chromium DevTools if needed.
- [x] Silent Windows Launchers (No lingering CMD windows):
  - [Launch AI Director Studio.vbs](file:///e:/work/Comfy%20AI%20Director/Launch%20AI%20Director%20Studio.vbs): Double-click to launch natively with 0 console windows.
  - [run.bat](file:///e:/work/Comfy%20AI%20Director/run.bat): Launches detached Electron GUI process and terminates command prompt cleanly.
  - [package.json](file:///e:/work/Comfy%20AI%20Director/package.json): Added `"main": "electron/main.cjs"` and `"desktop"` build-and-run script.
- [x] Comprehensive In-App Debugger & Action Telemetry ([src/components/InAppDebugger.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/InAppDebugger.tsx), [src/stores/useLogStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useLogStore.ts)):
  - Real-time logging of all user directorial actions (camera lens, movement, angle, framing, character blocking, lighting, prompt edits, revisions).
  - ComfyUI REST & WebSocket traffic monitoring (progress percentage, executing node, prompt queuing, system stats).
  - Live `ShotSpec` state inspector tree.
  - Category and level filters, instant search, JSON payload inspector, and clipboard copy.
  - Header toggle pill and `~` / backtick keyboard shortcut.
- [x] Standalone Relative Path Resolution:
  - Configured `base: './'` in [vite.config.ts](file:///e:/work/Comfy%20AI%20Director/vite.config.ts) so production builds load directly from disk via file protocol.
  - Dynamic URL switching in [src/services/comfyClient.ts](file:///e:/work/Comfy%20AI%20Director/src/services/comfyClient.ts) supporting direct ComfyUI API calls in desktop mode.
- [x] Full Verification:
  - All 11 unit tests pass (`npm test`).
  - Production build compiles with 0 errors in 5.6s (`npm run build`).
