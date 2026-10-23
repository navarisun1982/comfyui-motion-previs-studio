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

---

## Phase 7 / Tier 1: ComfyUI Connection Manager, MiniMax Adapter & Directing Presets `[DONE]`
- [x] ComfyUI Connection Manager & Settings Modal ([src/components/ComfyConnectionModal.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ComfyConnectionModal.tsx)):
  - Dedicated **Settings (`Settings` ⚙️)** button in top navigation bar and interactive Comfy status pill.
  - Configurable server endpoint with localStorage persistence.
  - Real-time latency ping diagnostic (`/system_stats`).
  - Connected hardware diagnostics: GPU model, VRAM budget, system RAM, OS.
  - Video model discovery: checks for LTX-2.5, MiniMax H3, Wan 2.1, and custom director nodes.
  - Direct engine mode switch: Real ComfyUI Server vs. Offline Mock Directing Engine.
- [x] MiniMax (Hailuo) Model Capability Adapter ([src/adapters/minimaxAdapter.ts](file:///e:/work/Comfy%20AI%20Director/src/adapters/minimaxAdapter.ts)):
  - Full prompt compilation with character motion physics, facial nuances, and optical depth.
  - ComfyUI workflow graph generator with `MiniMaxModelLoader`, `MiniMaxVideoSampler`, and reference image input.
  - Registered in adapter index and verified with unit tests in [tests/minimaxAdapter.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/minimaxAdapter.test.ts).
- [x] Cinematic Mood & Intent Presets ("Direct by Feeling") ([src/components/CinematicPresetsModal.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/CinematicPresetsModal.tsx)):
  - 8 curated Hollywood styles (Fincher Noir, Spielberg Wonder, Hitchcock Tension, Villeneuve Sci-Fi, Wong Kar-Wai Romance, Kubrick Symmetry, Tarantino Punch, Action Trucking).
  - One-click application of lens, angle, trajectory movement, speed, lighting, and aspect ratio.
  - Educational explanation on why each visual style works emotionally.
- [x] Filmmaker Educational Tooltips:
  - Lens optical impact notes (18mm to 135mm) in [src/components/CameraDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/CameraDeck.tsx).
  - Dynamic camera angle psychology callout in [src/components/CameraDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/CameraDeck.tsx).
- [x] Verification:
  - 15/15 unit tests pass (`npm test`).
  - Production bundle compiles with 0 errors (`npm run build`).

---

## Phase 8 / Tier 2: Three.js 3D Virtual Soundstage Previs `[DONE]`
- [x] Live Electron Auto-Refresh & Dev Reload:
  - Added debounced file watcher on `dist/` in [electron/main.cjs](file:///e:/work/Comfy%20AI%20Director/electron/main.cjs) so running builds immediately refreshes the active desktop application.
  - Added native `F5` and `Ctrl+R` force-refresh keyboard shortcuts.
- [x] Three.js Core Setup & Installation:
  - Installed `three` (v0.182.0) and `@types/three`.
  - Configured WebGL hardware-accelerated dual renderers and OrbitControls.
- [x] Immersive 3D Virtual Soundstage ([src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx)):
  - **Orbiting Soundstage Viewport**:
    - Dark reflective floor with gold coordinate grid and stage boundary border.
    - 3D physical camera body gizmo with optical lens barrel and dynamic forward-projecting FOV frustum wireframe.
    - Real-time frustum cone geometry recalculation matching selected focal length (18mm wide-angle 100° to 135mm telephoto 18°).
    - 3D stylized wooden mannequin meshes for actors with 3D glowing base rings and floating name badges.
    - Cyan 3D trajectory vector line showing exact camera flight path.
    - 3D lighting rig representation (key light position, color, and intensity matching selected cinematic style).
    - Camera angle quick-presets: Isometric, Top-Down, Ground Eye.
    - Floor grid toggle.
  - **Director's Viewfinder (Through-The-Lens)**:
    - Renders directly from the perspective and focal length FOV of the moving camera.
    - Aspect ratio framing mask matching shot configuration (16:9, 9:16, 2.39:1 anamorphic, 4:3, 1:1).
    - Rule-of-Thirds 3x3 compositional grid overlay toggle.
    - Optical center crosshair.
  - **24fps Cinema Transport Bar**:
    - Real-time 24fps playback loop with play/pause, restart, and frame counter (`FRAME X (24 FPS)`).
    - Interactive scrub slider with smooth trajectory and actor path interpolation.
  - **Director Viewport Layout Modes**:
    - `[Split Director View]`: 58% Soundstage orbit + 42% Through-the-lens viewfinder.
    - `[3D Soundstage]`: Fullscreen orbit stage.
    - `[Director Viewfinder]`: Fullscreen through-the-lens camera lens view.
- [x] Stage Previs Mode Integration ([src/App.tsx](file:///e:/work/Comfy%20AI%20Director/src/App.tsx)):
  - Top stage mode switcher: `[3D Virtual Stage]` (default) vs. `[2D Blueprint]`.
  - Full bidirectional sync with `useShotStore` (changing lenses, angles, actors, or lighting in the left panel instantly updates the 3D scene and viewfinder).
- [x] Verification:
  - 15/15 unit tests pass (`npm test`).
  - Production build compiles with 0 errors (`npm run build`) and auto-refreshes the desktop app.

---

## Phase 9 / Tier 3: VFX Video-to-Video & Directorial Depth Pipeline `[DONE]`
- [x] Canonical Schema & State Update ([src/types/shotspec.ts](file:///e:/work/Comfy%20AI%20Director/src/types/shotspec.ts), [src/stores/useShotStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useShotStore.ts)):
  - Added `VfxReferenceSchema` and `VfxReferenceMode` ('actor-motion', 'camera-only', 'full-scene', 'object-motion').
  - Added directorial parameters: `depthGuidanceWeight` (0..1), `edgeFidelity` (0..1), `motionRetention` (0.1..0.95), and trim timestamps.
  - Added `updateVfxReference` store action with action telemetry logging.
- [x] Optical Flow & Depth Analysis Engine ([src/engine/vfxAnalyzer.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/vfxAnalyzer.ts)):
  - Pure client-side background optical flow camera motion solver: analyzes frame displacements across time while masking out the center subject area.
  - Automatic classification into camera movement types (`dolly-in`, `dolly-out`, `truck-left`, `truck-right`, `pedestal-up`, `pedestal-down`, `handheld-subtle`) and speed pacing.
  - Automatic 3D Soundstage sync: one-click solves camera trajectory directly onto our Three.js stage!
  - Real-time client-side Depth Map and Canny/Sobel Edge contour proxy generation for immediate visual preview.
- [x] VFX Video Ingestion Deck Component ([src/components/VFXVideoDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/VFXVideoDeck.tsx)):
  - Drag-and-drop video plate uploader (MP4, MOV, WebM).
  - 4 Filmmaker Reference Modes with clear intent badges.
  - Multi-tab preview deck: Source Plate, Depth Map, Canny Edges, and Solved Camera Readout.
  - Fine-grained sliders for Depth Guidance Weight, Edge Fidelity, and Motion Retention.
- [x] Dual-Model Video-to-Video Adapters:
  - **LTX-2.5 Video-to-Video Adapter** ([src/adapters/ltxAdapter.ts](file:///e:/work/Comfy%20AI%20Director/src/adapters/ltxAdapter.ts)): Compiles depth conditioning, reference plate injection, dynamic KSampler denoise matching motion retention, and structural prompt modifiers.
  - **MiniMax H3 Video-to-Video Adapter** ([src/adapters/minimaxAdapter.ts](file:///e:/work/Comfy%20AI%20Director/src/adapters/minimaxAdapter.ts)): Compiles choreography reference directives, facial nuance guidance, and dynamic motion bucket scaling (80..220).
  - Ready-to-run ComfyUI workflow JSON export: [workflows/ltx_2.5_vfx_depth_videotovideo.json](file:///e:/work/Comfy%20AI%20Director/workflows/ltx_2.5_vfx_depth_videotovideo.json).
- [x] UI Workspace Integration ([src/App.tsx](file:///e:/work/Comfy%20AI%20Director/src/App.tsx), [src/components/ComfyExecutionPanel.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ComfyExecutionPanel.tsx)):
  - New **VFX Plate** tab in the directing sidebar with live pulsing activity indicator.
  - Dynamic execution button: changes to `DIRECT VFX SHOT (VIDEO-TO-VIDEO)` when reference plate is active.
- [x] Verification:
  - 19/19 unit tests pass across 6 test suites ([tests/vfxPipeline.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/vfxPipeline.test.ts)).
  - Production bundle compiles with 0 errors (`npm run build`).
  - Electron desktop app auto-refreshed live.
- [x] Responsive Layout & Three.js Canvas Sizing Fix:
  - Clamped left directing sidebar to fixed `340px` with `min-w-[340px] max-w-[340px] overflow-hidden` (replacing invalid `w-84`).
  - Added `min-w-0 min-h-0` to `<main>`, viewport containers, and sub-mode cards to eliminate flexbox sizing locks.
  - Positioned Three.js `<canvas>` elements as `absolute inset-0 w-full h-full` and invoked `renderer.setSize(w, h, false)` without hardcoded inline px styles.
  - Added bidirectional `ResizeObserver` on viewport mounts ensuring fluid expand/shrink window resizing and keeping the right execution & results panel pinned and visible at all resolutions.
- [x] Multi-Subject Character Extraction & 3D Stage Visual Transforms:
  - Implemented multi-subject character detection in [src/engine/vfxAnalyzer.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/vfxAnalyzer.ts): extracts foreground motion & edge energy profiles across vertical bins to detect 1, 2, or 3 distinct characters and their stage trajectories.
  - Integrated automatic character sync and manual 1/2/3 character switcher in [src/components/VFXVideoDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/VFXVideoDeck.tsx) directly driving 3D actor mannequins on stage.
  - Re-engineered patch-based optical flow matching across video margins with radial divergence tracking for true dolly-in/out and camera truck/pedestal classification.
  - Added dynamic 3D visual transformations across all 4 Filmmaker Reference Modes:
    - `Actor Performance`: Highlights actors with green glowing choreography rings, stage trajectory arrows, and Viewfinder actor targeting brackets.
    - `Camera Only`: Renders actor mannequins as holographic ghost wireframes (`REPLACED SUBJECT`) while isolating and amplifying the golden camera flight vector.
    - `Full Scene VFX`: Displays volumetric depth grid and dynamic atmospheric key lighting.
    - `Object Motion`: Displays vehicle/object tracking wireframe target.
- [x] Automated Multi-Character Tracking & Video Pass Exporter Suite:
  - **Zero Manual Choice Constraint**: Completely removed artificial preset buttons (1/2/3 characters, martial arts, dialogue, dance, chase, manual camera trajectory buttons) to let the reference video serve as the sole ground truth.
  - **Dynamic Multi-Person Tracking Engine** ([src/engine/vfxAnalyzer.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/vfxAnalyzer.ts)): Automatically detects and tracks $N$ characters (1, 2, 3, 4, 5+) across the video timeline, calculating their true spatial start and end coordinates on the 3D stage.
  - **Production Video Pass Exporters**: Built `renderPassVideo` and `downloadBlob` enabling filmmakers to export **Depth Video (.webm / .mp4)** and **Canny Edge Video (.webm / .mp4)** with real-time rendering progress.
  - **Camera Motion & Tracking Data Exporter**: Built `exportTrackingData` to output `camera_motion_and_tracking.json` compatible with external pipelines (Blender, ComfyUI, etc.).
  - **4-Way Quad Synchronized Studio View**: Added a 2x2 multi-panel layout in [src/components/VFXVideoDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/VFXVideoDeck.tsx) displaying Source Plate, Depth Map, Canny Edges, and Solved 3D Vectors simultaneously.
  - **Build & Verification**: 19/19 unit tests passing (`npm test`), 0 build errors (`npm run build`).

---

## Phase 8: Motion Previs Studio Unified Directorial Layout & Procedural 3D Primitive Shapes `[DONE]`
- [x] **Procedural 3D Primitive Shapes Engine** ([src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx)):
  - Extended canonical schema with `SubjectKindSchema = z.enum(['human', 'car', 'table', 'tree', 'chair', 'prop']).default('human')`.
  - Implemented `createSubjectMesh` generating full procedural 3D geometries on the Three.js stage:
    - **`car`**: Aerodynamic chassis box `(6.5, 1.8, 13)`, offset cabin cockpit `(5.2, 1.8, 6.8)`, 4 cylinder wheels rotated 90° with rubber tires, front emissive headlights (cyan/white), rear emissive taillights (red), base ring `(r=7.5)`, and floating name sprite banner.
    - **`table`**: Tabletop box `(9.0, 0.6, 5.5)` at $y=4.2$, 4 cylinder legs, base ring, and name banner.
    - **`tree`**: Brown trunk cylinder `(0.8, 1.1, 5.0)`, 3 stacked conical foliage crowns in forest/emerald green, base ring, and banner.
    - **`chair`**: Seat box `(3.2, 0.4, 3.2)` at $y=2.8$, backrest box, 4 legs, base ring, and banner.
    - **`prop`**: Heavy industrial cargo crate `(4.5, 4.5, 4.5)` with beveled edge wireframes, base ring, and banner.
    - **`human`**: Stylized director's mannequin with torso cylinder, sphere head, shoulder bar, base glowing ring, and banner.
  - Added quick 3D prop/actor picker in [src/components/ActorBlocking.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ActorBlocking.tsx).
- [x] **Motion Previs Studio 4-Step Pipeline Header** ([src/App.tsx](file:///e:/work/Comfy%20AI%20Director/src/App.tsx)):
  - Top navigation bar matching reference design: window control dots (red, yellow, green), title badge, and 4-step breadcrumbs:
    - `[1] Shot`
    - `[2] Analyze`
    - `[3] Plan`
    - `[4] Export`
  - Integrated header actions: Classic Directing Deck toggle, Director Diff Inspector, Directing Presets modal, Compiled Prompt modal, in-app debugger, and ComfyUI status pill.
- [x] **Shot Bible & Project Info Sidebar** ([src/components/ShotBible.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ShotBible.tsx)):
  - Scenes accordion hierarchy (`Scene 01 - Arrival`, `Scene 02 - Chase`, `Scene 03 - Hideout`, `Scene 04 - Reveal`).
  - Shot cards with frame thumbnails, duration, focal length, camera movement, and active selection state.
  - Search input for instant shot filtering.
  - Collapsible Project Info card (Project name, Resolution 1920x1080, Frame Rate 24fps, Duration, Date).
  - Status indicator: `🟢 Analysis Complete` `Ready to export`.
- [x] **Motion Previs Stage Viewport & Filmstrip Timeline** ([src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx)):
  - **Upper Dual Viewport**: Side-by-side `Reference` video plate on left + `Camera Path` 3D soundstage on right.
  - **Lower Multi-Pass Strip**: 5 synchronized production passes: `Pose (Actor)`, `Depth`, `Edges`, `Masks`, `Pose (All)` with real-time canvas renderers in [src/engine/vfxAnalyzer.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/vfxAnalyzer.ts).
  - **Transport & Scrubbing Bar**: First frame, back 1s, play/pause, forward 1s, last frame, 24fps badge, snapshot camera, audio volume slider.
  - **Cinema Filmstrip Timeline**: 24fps time ruler, frame thumbnail strip, interactive selected clip box with blue border and trim handles (`Shot 01A 24s`), audio waveform preview, and tool buttons (`Trim`, `Move`, `Markers`, `Filters`).
- [x] **Previs Parameters Deck** ([src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx)):
  - **Camera Move**: Mode buttons (`Camera only`, `With Subject`, `Full Scene`), Smoothing slider (0..100%), Focal Length dropdown (18mm, 24mm, 28mm, 35mm, 50mm, 85mm, 135mm), Stabilization dropdown (`Low`, `Medium`, `High`).
  - **Subject Motion**: Mode buttons (`Actor motion`, `Object motion`, `Off`), Tracking Confidence (`High ✓`), Foot Lock toggle, Motion Smoothing slider, Ground Constraint toggle, `+ Add Subject/Prop` selector.
  - **Control Layers**: Checkbox toggles for Depth, Masks, Pose, Optical Flow, Edges.
  - **Quality Score**: Circular SVG gauge (92) with breakdown (Tracking, Stability, Completeness, Overall).
  - **Prompt Pack**: Directorial spatial compilation & inspection modal.
  - **Export Presets**: Seedance, ComfyUI (selected), Blender, Runway, Kling.
  - **Action Buttons**: `Export Production Pack` and `Direct Shot with ComfyUI (LTX-2.5)`.
- [x] **Test & Verification**:
  - `cmd /c "npm test"`: 19/19 tests passing across 6 test suites.
  - `cmd /c "npm run build"`: 0 TypeScript or bundle errors in 10.12s.

---

## Phase 9: Full Real-Time Interactivity, Staging Physics & Desktop Launcher `[DONE]`
- [x] **Interactive 3D Spatial Staging**:
  - Added live coordinate sliders (Stage X, Depth Z) for all placed 3D primitive shapes (`car`, `table`, `tree`, `chair`, `prop`, `human`) in both [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx) and [src/components/ActorBlocking.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ActorBlocking.tsx).
  - Dragging any slider instantly translates the procedural 3D model across the Three.js virtual soundstage in real time.
  - Added quick staging presets: `Center`, `Stage Left`, `Stage Right`, `Deep Background`.
- [x] **Camera 3D Trajectory Controller**:
  - Added live Start (X, Z) and End (X, Z) coordinate sliders to the Previs Parameters Deck.
  - Interactive camera archetype selector (`dolly-in`, `dolly-out`, `tracking-shot`, `pan-left`, `pan-right`, `tilt-up`, `tilt-down`, `crane-shot`, `orbit-clockwise`, `whip-pan`, `static`).
  - Frustum wireframe and dashed trajectory spline recalculate and animate live in 3D.
- [x] **Active 24fps Continuous Cinematic Canvas Engine**:
  - Fixed canvas rendering pipeline in [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx) by linking `onscreenCanvasRef` into the 24fps animation loop.
  - Animated procedural plate renders live rain, moving figure, reflections, and streetlight bokeh every frame.
  - Synchronized `<video>` element with transport controls (`play()`, `pause()`, seek, and Spacebar keyboard shortcut).
- [x] **Interactive Cinema Timeline & Production Tools**:
  - **Keyframe Markers**: Clickable cue markers rendered as diamond badges on the timeline; clicking jumps the playhead to that cue.
  - **Cinematic Color Grade LUTs**: 5 real-time canvas filters (`Rec.709 Standard`, `Teal & Orange`, `Film Noir 1940s`, `Cyberpunk Neon`, `Bleach Bypass`).
  - **Move & Speed**: Playback speed selector (`0.5x`, `1.0x`, `1.5x`, `2.0x`) and timecode nudge buttons (`-1.0s`, `-0.1s`, `+0.1s`, `+1.0s`).
  - **Trim Handles**: Interactive left/right clip trim handles with real-time in/out point duration recalculation.
- [x] **Automated Desktop Launcher (`run.bat`)**:
  - Updated [run.bat](file:///e:/work/Comfy%20AI%20Director/run.bat) to always compile a fresh production bundle before launching Electron, ensuring users never see stale caches or uncompiled skeletons.
- [x] **Build & Test Verification**:
  - `cmd /c "npm test"`: 19/19 tests passing.
  - `cmd /c "npm run build"`: 0 TypeScript or bundle errors.

---

## Phase 10: Dual Directorial Workflows & Unified Parameters Inspector `[DONE]`
- [x] **Remove Header Switch & Unify Layout**:
  - Eliminated the jarring `Classic Deck / Shot Bible` header switcher in [src/App.tsx](file:///e:/work/Comfy%20AI%20Director/src/App.tsx).
  - Permanently pinned the **Shot Bible** on the left as the dedicated scene tree & project manager.
  - Centralized all directing controls (Camera, Staging, Atmosphere, VFX) into the right inspector ([src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx)) using 4 organized tabs: `Camera`, `Staging (${shot.actors.length})`, `Atmosphere`, `VFX & Export`.
- [x] **Two Choices for Every Shot (`ShotCreationMode`)**:
  - Added `creationMode: 'construct-3d' | 'video-plate'` to canonical `ShotSpec` schema in [src/types/shotspec.ts](file:///e:/work/Comfy%20AI%20Director/src/types/shotspec.ts).
  - Added `setCreationMode` in [src/stores/useShotStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useShotStore.ts).
  - Implemented 2-card **New Shot Creation Modal** in [src/components/ShotBible.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ShotBible.tsx):
    - **Choice A: 🎬 Construct from Scratch (3D Previs)**: Start on virtual soundstage; place actors, trees, vehicles, and props.
    - **Choice B: 📹 Video Plate Solve (VFX Motion Transfer)**: Import video plate; solve camera tracking and extract 5 CV passes.
  - Rendered `[3D PREVIS]` and `[VIDEO PLATE]` mode badges on all shot cards.
- [x] **On-Stage 1-Click 3D Asset Shelf**:
  - Added direct 1-click shelf on the 3D Soundstage viewport in [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx):
    `[+👤 Person]`, `[+🌲 Tree]`, `[+🚗 Car]`, `[+🪑 Table]`, `[+💺 Chair]`, `[+📦 Prop]`.
  - Added workflow mode switcher pill in stage header (`[🎬 3D Previs]` / `[📹 Video Plate]`).
  - Viewports dynamically adapt:
    - In `construct-3d` mode: Left viewport renders Through-the-Lens Viewfinder (POV) with lens focal length overlay; right viewport renders 3D Orbit Soundstage with Asset Shelf; lower section displays the Staged Objects Placement bar.
    - In `video-plate` mode: Left viewport renders Reference Video Plate; right viewport renders Solved 3D Camera; lower section displays the 5-pass live CV strip (`Pose Actor`, `Depth`, `Edges`, `Masks`, `Pose All`).
- [x] **Verification**:
  - `cmd /c "npm test"`: 19/19 tests passing across all 6 test suites.
  - `cmd /c "npm run build"`: 0 errors in 7.38s.

---

## Phase 11: 3D Viewport Sizing Fix & Full Directorial Scene System `[DONE]`
- [x] **Fix 3D Soundstage & Viewfinder Height & Visibility**:
  - Solved container height collapse (`flex-1` evaluated to 0 height inside unconstrained grid/block parent containers) in both [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx) and [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx).
  - Ensured root and child containers have `h-full w-full min-h-0 min-w-0 flex flex-col`.
  - Upgraded Three.js lighting rig with `HemisphereLight(0xffffff, 0x334155, 1.4)`, `AmbientLight(0xffffff, 0.95)`, and camera fill light (`0.75`).
  - Added `keyLight.target` explicitly to scene graph pointing at stage center (`0, 5, 0`).
  - Set immediate position and orientation for all newly spawned actor meshes in Effect 6, preventing initial render delay.
  - Added parent element client dimension fallbacks and dual `setTimeout(updateSizes)` calls in `StagePrevis3D.tsx`.
- [x] **Interactive Soundstage Placement Deck**:
  - Upgraded bottom bar in [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx) to interactive control deck.
  - Placed model pills feature active selection styling, quick coordinate displays, 1-click positioning presets (`L [30]`, `C [50]`, `R [70]`), and instant deletion (`[✕]`).
  - Clicking any pill selects the object (`selectedActorId`) and automatically switches the Right Inspector to the `Staging` tab.
  - Added quick 1-click model shelf (`+👤`, `+🚗`, `+🌲`, `+🪑`, `+💺`, `+📦`) directly in bottom deck.
- [x] **Real Directorial Sequences for All Scenes in Shot Bible**:
  - Wired full directorial setups in [src/components/ShotBible.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ShotBible.tsx):
    - **Scene 01 (Arrival)**: 5 shots (`01A`–`01E`), detective noir, urban trees, cargo crates, informant encounter.
    - **Scene 02 (Chase)**: 2 shots (`02A`, `02B`), high-speed 2-car pursuit (`Hero Interceptor` & `Fleeing Sedan`), road obstacles, golden-hour lighting.
    - **Scene 03 (Hideout)**: 2 shots (`03A`, `03B`), safehouse war room with table, armchair, munitions crate, syndicate boss, interrogation confrontation.
    - **Scene 04 (Reveal)**: 2 shots (`04A`, `04B`), towering evergreen trees, cloaked wanderer, expedition 4x4, vertigo zoom, foggy moonlight.
  - Added `+ Add New Scene` button to Shot Bible for dynamic scene generation.
- [x] **Verification**:
  - `cmd /c "npm test"`: 19/19 tests passing.
  - `cmd /c "npm run build"`: 0 errors in 7.96s.

---

## Phase 12: Timeline Waypoint Keyframing & 2D Floor Plan / Comfy-Canvas Dual Previs `[DONE]`
- [x] **Multi-Waypoint Trajectory Engine**:
  - Defined `TrajectoryKeyframeSchema` and `CameraKeyframeSchema` in [src/types/shotspec.ts](file:///e:/work/Comfy%20AI%20Director/src/types/shotspec.ts).
  - Implemented `interpolateTrajectoryPosition` and `interpolateCameraPosition` in [src/engine/trajectoryMath.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/trajectoryMath.ts).
  - Implemented `recordTrajectoryPositionAtTime` with timeline-aware resolution (start, keyframe insertion, keyframe update, end).
- [x] **Timeline Keyframe Interaction & Synchronization**:
  - Timeline track renders interactive keyframe markers (`◆`) for all actors and camera.
  - Clicking any keyframe diamond jumps directly to that timestamp.
  - Transport bar `+ Cue` button drops a keyframe at the current scrubbed playhead.
  - Moving objects in 3D Soundstage or 2D Stage updates/saves the keyframe at that exact point in time.
  - Playback respects all keyframes seamlessly via piecewise linear interpolation.
- [x] **Dual Soundstage View (3D ↔ 2D Floor Plan)**:
  - Header toggle in [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx) between 3D Soundstage and 2D Floor Plan.
  - Transport bar `🎨 Canvas 2D` button launches ComfyUI's native in-app editor session.
- [x] **Verification**:
  - `cmd /c "npm test"`: 27/27 tests passing across 7 test suites.
  - `cmd /c "npm run build"`: 0 errors in 8.08s.

---

## Phase 13: In-App Director 2D Canvas & Inpaint Masking Studio Fix `[DONE]`
- [x] **Canvas 2D Blank Window Bug Resolution**:
  - Diagnosed root cause: `window.open` targeted `/comfy_canvas/sessions/{sessionId}` (a raw JSON REST endpoint returning `{ ok: true, ... }`), spawning an uncontrolled, blank white Electron child window.
  - Hardened Electron security in [electron/main.cjs](file:///e:/work/Comfy%20AI%20Director/electron/main.cjs) via `setWindowOpenHandler` routing external URLs to `shell.openExternal`.
- [x] **Built-in Director 2D Canvas & Inpaint Studio**:
  - Engineered [src/components/DirectorCanvasModal.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/DirectorCanvasModal.tsx) with a dark studio aesthetic.
  - **Live Playhead Ingestion**: Automatically grabs the exact 3D soundstage or video frame from [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx) at the current playhead time.
  - **Director Creative Suite**: Freehand paint brush (custom size, opacity, color palette), Inpaint Mask matte brush (Ruby overlay and high-contrast B&W modes), Eraser, Director Motion Vectors (arrows with automatic head calculation), Actor/Prop Bounding Boxes, and Callout Notes.
  - **Layer Controls**: Independent visibility and opacity controls for Previs Plate, Director Paint, Inpaint Mask, and Notes.
  - **Undo / Redo**: Multi-step history stack with Ctrl+Z / Ctrl+Y.
  - **Directorial Pipeline Sync**: "Apply to Shot Reference" saves the composite frame to the shot store; "Sync Comfy Session" posts image, mask, and metadata directly to `/comfy_canvas/sessions/{sessionId}` with offline localStorage fallback.
  - **Dual Export**: One-click download for marked-up Plate PNG and binary black & white Inpaint Mask PNG.
- [x] **Verification**:
  - `cmd /c "npm test"`: 27/27 tests passing across 7 test suites.
  - `cmd /c "npm run build"`: 0 errors, successful production bundle.

---

## Phase 14: Canvas 2D Shot Attachment & Cinematic Custom 3D Previs Assets `[DONE]`
- [x] **Canvas 2D Plate Reflection in Main Viewport**:
  - Connected `shot.referenceImage` directly to the main stage in [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx) and [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx).
  - In [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx):
    - Added persistent top header badge: `🎨 Canvas Plate Attached [Edit | Clear]`.
    - Rendered the Canvas 2D plate directly in the Left Viewport when reference image is active, with instant "Edit in Canvas 2D" and "Clear" actions.
    - Updated transport bar `Canvas 2D` button with active emerald indicator dot when a canvas plate is applied.
  - In [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx):
    - Added support for `shot.referenceImage.previewUrl` in the Through-the-Lens Viewfinder.
    - Added plate controls: `3D Only`, `Ghost Overlay` (with opacity slider), and `Canvas 2D` full plate view.
- [x] **Cinematic 3D Starship / Spaceship Procedural Mesh**:
  - Resolved regex gap in `detectSemanticCategory` to match `space ship`, `spaceship`, `starship`, `spacecraft`, `mothership`, `cruiser`, `fighter`, and fallback prompt tokens.
  - Implemented multi-part sci-fi starship 3D mesh in `createSubjectMesh`:
    - Hover altitude (`y = 5.0`) with ground hover ring.
    - Gunmetal fuselage body and angled forward prow nose cone.
    - Elevated command bridge / cockpit canopy with glowing cyan glass (`0x00f0ff` emissive).
    - Swept stealth wings with wingtip stabilizer fins.
    - Glowing cyan warp drive energy nacelles along the hull flanks.
    - Twin heavy ion thruster nozzles with glowing cyan plasma plumes (`0x38bdf8`).
- [x] **Prompt-Driven Concept Previs Generator & 3D Billboard Plates**:
  - Added `conceptImageUrl: z.string().optional()` to `ActorSchema` in [src/types/shotspec.ts](file:///e:/work/Comfy%20AI%20Director/src/types/shotspec.ts).
  - Built [src/engine/conceptPrevisGenerator.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/conceptPrevisGenerator.ts): procedural generator rendering cinematic director concept art plates matching prompts (starships, mechs, mountain peaks, cars, characters with crosshairs and HUD markers).
  - Added "✨ Generate Previs Concept Plate" button on actor cards in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx) with thumbnail preview, re-generate, and clear actions.
  - Integrated 3D billboard concept plate above objects in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx), displaying the concept plate floating in 3D space above the geometric proxy.
  - Added `🚀 Spaceship` 1-click button to 3D shelf in [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx) and suggestion chips in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx).
## Phase 15: Object Image Attachments, Direct 2D-to-3D Canvas Sync, & Universal 3D Representation `[DONE]`
- [x] **Zero ComfyUI Image-Gen Overhead (Exclusive Video Specialization)**:
  - Honored user directive to strictly preserve ComfyUI for video generation without wasting GPU time on image generation.
  - Added direct image/photo attachment upload for every actor/object from local PC files via HTML5 `FileReader.readAsDataURL` in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx).
  - Provided 3 instant visual reference creation paths for every actor: `📁 Upload Photo`, `✏ Draw in 2D`, and `✨ AI Plate`.
- [x] **Direct 2D-to-3D Canvas Synchronization**:
  - Globalized Canvas 2D modal state (`isCanvas2DOpen`, `setIsCanvas2DOpen`) in [src/stores/useShotStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useShotStore.ts).
  - Enhanced [src/components/DirectorCanvasModal.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/DirectorCanvasModal.tsx) with a target destination selector:
    - **Apply to 3D Object**: Mounts the drawing directly onto the 3D billboard plate above the target actor/object in the virtual soundstage.
    - **Apply to Shot Reference Plate**: Saves drawing as the master shot reference conditioning plate.
  - Added 3D Soundstage Rear Cyclorama Projection Screen (`stageBackdropMeshRef`) in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx) ($64 \times 36$ units at $z = -48$, $y = 18$) mapping `shot.referenceImage.previewUrl` directly into the 3D studio environment.
  - Automated Viewfinder Ghost Overlay: automatically switches `viewfinderOverlayMode` to `'overlay'` (opacity $\ge 0.75$) when a 2D canvas drawing or reference image is added.
- [x] **Universal 3D Procedural Mesh & Concept Plate Representation**:
  - Eliminated arbitrary alien cylinders and torus shapes.
  - Added semantic categorization and 3D procedural meshes for:
    - **Food / Macaroni** (`food`): White porcelain plate, golden macaroni pasta mound, curved noodle florets, green parsley garnish, and stainless cutlery.
    - **Gaming Consoles** (`console`): PlayStation 5 form factor with aerodynamic white wing plates, dark inner core, signature blue LED accent strip, and circular stand.
    - **Beverages** (`drink`): Ceramic mug with handle and liquid plane.
    - **Weapons** (`weapon`): Steel blade with gold crossguard and grip.
    - **Custom Props** (`custom`): Sleek modern museum/studio display plinth with glowing accent rim and showcase box.
  - Updated [src/engine/conceptPrevisGenerator.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/conceptPrevisGenerator.ts) with custom 2D illustration branches for culinary dishes (macaroni plate), next-gen consoles (PS5 packshot with cyan glow), drinks, weapons, and clean studio pedestals for custom objects (restricting detective trenchcoat/fedora to human characters).
- [x] **Verification**:
  - `cmd /c "npm test"`: 27/27 tests passing across 7 test suites.
  - `cmd /c "npm run build"`: 0 errors in 8.70s, clean production bundle.

---

## Phase 16: Unrestricted Object Deletion & 3D Life-Size Standee Figurine Representation `[DONE]`
- [x] **Unrestricted Deletion for Any Object / Actor**:
  - Eliminated the `shot.actors.length > 1` restriction in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx) and [src/components/ActorBlocking.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ActorBlocking.tsx), allowing the user to delete any object on stage (including the first or only object).
  - Added "Clear All" action button to stage object list when objects exist, and implemented an empty stage fallback card with a quick "+ Place Character" button.
  - Added `clearAllActors()` to [src/stores/useShotStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useShotStore.ts), and fixed `removeActor` to automatically deselect or reset `selectedActorId`.
  - Added global `Delete` and `Backspace` keyboard listeners in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx) and [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx) so pressing the Delete key immediately deletes the selected object.
- [x] **3D Life-Size Standee Figurine for Uploaded Photos (Woman / Characters / Props)**:
  - Completely replaced the floating horizontal 16:9 TV box in the sky and the generic proxy mannequin.
  - When an image is uploaded (e.g. photo of a woman):
    - Placed directly on the stage floor at $y = 0$ as a **3D Life-Size Standee Figurine** (13.5 units tall for characters, matching human camera eye-level).
    - **Automated Smart Background Alpha Keying**: built `loadStandeeTexture` in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx) which samples image corners and keys out solid white or dark studio backdrops with feathered edges so the woman/character stands as a clean transparent silhouette cutout!
    - Accurate aspect ratio scaling: derives exact width from image dimensions ($W = H \times \text{aspect}$).
    - Physical 3D thickness with metallic/gold beveled rim core and double-sided textured planes.
    - Ground circular studio plinth, cast shadows onto the stage floor, and base tracking ring with floating name banner.
- [x] **Sculpted Female Procedural 3D Mannequin**:
  - Added female anatomical detection (`isFemale`) in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx) for prompts containing woman, girl, actress, female, etc.
  - Generates a sculpted female mannequin with tapered waist, curved hips, slender shoulders, and stylized hair bun silhouette when no photo is attached.
- [x] **Verification**:
  - `cmd /c "npm test"`: 27/27 tests passing across 7 test suites.
  - `cmd /c "npm run build"`: 0 errors in 8.15s, production bundle verified.

---

## Phase 17: Camera-Object Look-At Decoupling & Clean Stage Floor `[DONE]`
- [x] **Camera Look-At Decoupling from Object Movements**:
  - Eliminated automatic actor-centroid tracking loop in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx).
  - Ensured camera orientation is derived strictly from its designated `targetLookAt` property and movement offsets, so moving/dragging an actor or object never swivels or shifts camera framing.
- [x] **Stage Floor Cleanup ("Rounds on the Ground")**:
  - Removed circular cylinder plinth pedestal from 3D standee figurines so objects stand cleanly directly on the floor at $y = 0$.
  - Streamlined `createBaseRing`: when unselected, the floor has zero rings or discs; when selected, a single thin modern selection outline ring appears without concentric rings, discs, or beacon walls.
- [x] **Verification**:
  - `cmd /c "npm test"`: 27/27 tests passing across 7 test suites.
  - `cmd /c "npm run build"`: 0 errors in 8.23s, production bundle verified.

---

## Phase 18: Video Render Execution, VHS Integration & Reliable MP4 Download `[DONE]`
- [x] **Local Native Video for Mock Engine Runs**:
  - Generated a real, playable, local 1280x720 24fps MP4 video in `public/mock_preview.mp4` (copied into `dist/mock_preview.mp4`).
  - Replaced the external Google Cloud Storage URL (`ForBiggerBlazes.mp4`) that returned HTTP 403 Forbidden with `/mock_preview.mp4`.
- [x] **ComfyUI VHS_VideoCombine Pipeline Upgrade**:
  - Replaced `SaveVideo` in [src/adapters/ltxAdapter.ts](file:///e:/work/Comfy%20AI%20Director/src/adapters/ltxAdapter.ts) and [workflows/ltx_2.5_director_text_to_video.json](file:///e:/work/Comfy%20AI%20Director/workflows/ltx_2.5_director_text_to_video.json) with `VHS_VideoCombine` (Video Helper Suite), which accepts decoded latent image tensors and outputs H.264 MP4.
- [x] **Universal ComfyUI Video Output Extractor**:
  - Built `extractVideoOutput` in [src/services/comfyClient.ts](file:///e:/work/Comfy%20AI%20Director/src/services/comfyClient.ts) and integrated it into both [src/services/directorExecutor.ts](file:///e:/work/Comfy%20AI%20Director/src/services/directorExecutor.ts) and [src/components/ComfyExecutionPanel.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ComfyExecutionPanel.tsx) to capture `output.gifs` (from VHS), `output.videos`, and `output.video`.
- [x] **Direct Blob File Downloader**:
  - Upgraded the "Download MP4" button to directly fetch the binary blob and save the file to the user's local disk with error fallback.
- [x] **Verification**:
  - `cmd /c "npm test"`: 27/27 tests passing across 7 test suites.
  - `cmd /c "npm run build"`: 0 errors, production build verified.

---

## Phase 19: In-App 3D Previs Video Rendering & Two-Stage Pipeline `[DONE]`
- [x] **Client-Side WebGL 3D Previs Video Capture**:
  - Built `handleRenderInAppPrevis` in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx) utilizing `vfRendererRef.current.domElement.captureStream(24)` and `MediaRecorder` to render and record the 3D viewfinder camera motion, focal length optics, and actor trajectories into a local 24 FPS video file.
  - Enabled `preserveDrawingBuffer: true` on the Three.js WebGL renderer for flicker-free frame capture.
  - Extracted reusable `syncPositions(t)` math in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx) for deterministic frame-by-frame animatic rendering.
- [x] **Global Previs Video State & Coordination**:
  - Added `previsVideoUrl`, `previsVideoBlob`, `isRenderingPrevis`, `previsProgress`, and `renderPrevisVideo()` to [src/stores/useShotStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useShotStore.ts).
  - Automatically arms the shot's `vfxReference` plate with the newly rendered in-app 3D Previs video.
- [x] **Transport Bar & Previs Stage Actions**:
  - Added "Render 3D Previs" button and "Download Previs MP4" button to both the 3D stage toolbar in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx) and the cinema transport bar in [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx).
- [x] **Two-Stage Workflow Separation in ComfyExecutionPanel**:
  - Redesigned [src/components/ComfyExecutionPanel.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ComfyExecutionPanel.tsx) into two explicit stages:
    - **Stage 1 (In-App 3D Previs)**: Local client-side 3D animatic rendering, in-app video playback, and direct local MP4 download (zero ComfyUI or GPU diffusion dependency).
    - **Stage 2 (ComfyUI AI Diffusion)**: Sends the in-app rendered 3D Previs video plate to ComfyUI (uploaded to input via `/upload/image`) as motion & depth conditioning for LTX-2.5 photorealistic video generation.
- [x] **Verification**:
  - `cmd /c "npm test"`: 27/27 tests passing across 7 test suites.
  - `cmd /c "npm run build"`: 0 errors in 13.9s, production build verified.

---

## Phase 20: 3D Object Resizing, Proportional Scale & Real Object System `[DONE]`
- [x] **Canonical Schema Update for Object Scale**:
  - Added `scale: z.number().min(0.05).max(30).default(1.0).optional()` and `modelUrl?: string` to `ActorSchema` in [src/types/shotspec.ts](file:///e:/work/Comfy%20AI%20Director/src/types/shotspec.ts).
- [x] **Realistic Baseline Proportions in 3D Stage**:
  - Rescaled `building` procedural geometry from 10 units up to 34 units tall (towering 3.5× over human mannequins) with 3-story window matrices.
  - Rescaled `car` procedural geometry to 20 units length × 8.5 units width × 6.8 units height for true real-world vehicle proportions relative to a 10-unit human mannequin.
- [x] **Dynamic Scale & Expanded Semantic Dictionary**:
  - Applied `mesh.scale.set(actorScale, actorScale, actorScale)` to all procedural 3D meshes and billboard standees during creation and continuous `syncPositions(t)` playback.
  - Expanded `detectSemanticCategory` regex dictionary to recognize dozens of additional vehicle models (sedan, SUV, pickup, limo, ambulance), architectural structures (skyscraper, castle, palace, warehouse, factory, tower), sci-fi vessels, weapons, and characters.
- [x] **User-Facing Object Scale Controls in PrevisParametersDeck**:
  - Integrated `Maximize2` 3D Object Scale slider (`0.10×` to `6.00×`, step `0.05`) with 5 one-click preset buttons (`0.25× Tiny`, `0.5× Half`, `1.0× Normal`, `2.0× Double`, `4.0× Huge`) inside [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx).
- [x] **Verification**:
  - `cmd /c "npm test"`: 27/27 tests passing across 7 test suites.
  - `cmd /c "npm run build"`: 0 errors in 18.28s, production build verified.

---

## Phase 21: Complete 4-Step Directorial Pipeline Synchronization `[DONE]`
- [x] **Resolved Unconnected Breadcrumb Modes**:
  - Identified and fixed the root cause of why `[1] Shot`, `[2] Analyze`, and `[3] Plan` were previously presenting identical views.
  - Initialized application default to Step 1 (`'shot'`).
- [x] **Step 1: Shot (Camera & Optics)**:
  - Center View: Dual Viewport (3D Stage + POV Camera Viewfinder).
  - Right Deck: Automatically switches to **Camera Optics** tab (`activeDeckTab: 'camera'`), giving instant access to focal lengths (18mm-135mm), aspect ratio, framing, and camera movement trajectory coordinates.
- [x] **Step 2: Analyze (VFX Video-to-Video & Computer Vision Suite)**:
  - Center View: Mounts the comprehensive **VFX Multi-Pass Computer Vision Deck** ([src/components/VFXVideoDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/VFXVideoDeck.tsx)) with Quad-split view (`Source Plate`, `Depth`, `Canny Edges`, `Camera Tracking Solve`, `Actor Choreography`).
  - Added 1-click **Load Demo Film Plate** (`/mock_preview.mp4`) and **Analyze Rendered 3D Previs Video** directly into the deck.
  - Right Deck: Automatically switches to **VFX & Tracking** tab (`activeDeckTab: 'vfx'`).
- [x] **Step 3: Plan (Staging, Actors & Atmosphere)**:
  - Center View: 3D Soundstage highlighting subject blocking, prop placement, vehicles, and buildings.
  - Right Deck: Automatically switches to **Staging & Atmosphere** tab (`activeDeckTab: 'staging'`), displaying 3D object scaling, placement presets, lighting styles (Noir, Cyberpunk, Golden Hour), and narrative atmosphere prompt editor.
- [x] **Step 4: Export (Previs Render & ComfyUI Diffusion)**:
  - Right Deck: Swaps to [src/components/ComfyExecutionPanel.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ComfyExecutionPanel.tsx) with Stage 1 (In-App 3D Previs MP4 rendering) + Stage 2 (ComfyUI AI Diffusion) + Directorial Capability Mapping.
- [x] **Verification**:
  - `cmd /c "npm test"`: 27/27 tests passing in 3.53s.
  - `cmd /c "npm run build"`: 0 errors in 9.28s, production build verified.

---

## Phase 22: Video Pass Export Timing, Depth Fidelity & Canny Edge Accuracy `[DONE]`
- [x] **Diagnosis of User Export File (`7893170-hd_1920_1080_30fps_depth_pass.webm`)**:
  - Found duration stretched to 42.16s (instead of the original 11.9s) due to wall-clock frame-by-frame seek latency during `MediaRecorder` capture.
  - Found depth pass was blending raw video luminance (`+ lum * 0.3`), superimposing the couple and sand textures as a ghost over a vertical gradient.
  - Found Canny edge pass was a raw unthresholded single-channel difference with noise grain.
- [x] **Real-Time 1.0x Synchronized Pass Rendering**:
  - Re-engineered `renderPassVideo` in [src/engine/vfxAnalyzer.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/vfxAnalyzer.ts) to drive real-time playback (`tempVideo.play()`) and stream capture via `requestAnimationFrame`.
  - Exported pass video duration now matches the original video duration exactly with 100% 1:1 speed parity.
  - Optimized capture buffer dimensions (`maxDim: 960`) to maintain a guaranteed 30 FPS throughput without CPU frame drops.
- [x] **High-Fidelity Depth Map Algorithm**:
  - Completely eliminated the `lum * 0.3` video bleed in `generateDepthProxyCanvas`.
  - Implemented true environmental perspective ground-plane falloff and contrast-based foreground subject segmentation.
- [x] **True Luminance Sobel/Canny Edge Algorithm**:
  - Upgraded `generateEdgeProxyCanvas` with full 3x3 directional Sobel convolution matrices ($G_x, G_y$), Euclidean gradient magnitude, and dual-thresholding hysteresis for crisp white contours on pure black backgrounds.
- [x] **ComfyUI Neural Models Audit**:
  - Confirmed local installation of `DepthAnything_V2` (ViT-Large 1.34GB fp32), `CannyEdgePreprocessor`, and `ControlNetPreprocessor` on local RTX 3090.
- [x] **Verification**:
  - `cmd /c "npm test"`: 27/27 tests passing in 20.91s.
  - `cmd /c "npm run build"`: 0 errors in 13.49s, production build verified.

---

## Phase 23: Viewfinder Upright Camera Stabilization & 3D Object Scaling Overhaul `[DONE]`
- [x] **Diagnosis & Resolution of Camera Inversion (Upside-Down Viewfinder)**:
  - Discovered root cause: In Three.js, `camera.lookAt(target)` computes Euler angles with `XYZ` order. For horizontal camera azimuth angles pointing along negative X (or panning between 225° and 315°), `Euler.z` contains an essential coordinate offset to preserve an upright world up vector (`UP.y > 0`).
  - Previously, `vfCameraRef.current.rotation.z = 0` was forcibly executed every frame, destroying this Euler offset and inverting the camera's up vector to `UP.y = -1.00`, turning trees and mannequins upside down.
  - Eliminated forced `rotation.z = 0`. Implemented camera-local Dutch angle rotation (`camera.rotateZ(-15°)`) with safe world-up vector enforcement (`safeUp = (0, 1, 0)`) and overhead singularity guards.
  - Validated 360° pan across all quadrants: camera orientation remains 100% upright with zero pitch/roll flipping.
- [x] **Direct On-Stage 3D Object Scaling HUD**:
  - Embedded an interactive 3D Object Scale slider (`0.10×` to `6.00×`) and 5 one-click presets (`0.25× Tiny`, `0.5× Half`, `1.0× Norm`, `2.0× Dbl`, `4.0× Huge`) directly inside the on-stage floating HUD in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx) on actor/object click.
  - Optimized mesh lifecycle in `useEffect #6` to perform zero-latency in-place `mesh.scale.set()` updates instead of tearing down and recreating entire Three.js subtrees on every slider tick.
- [x] **Synchronized Staging Deck & Prompt Compiler**:
  - Added `data-actor-card` auto-scrolling to [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx) so selected actor cards are smoothly scrolled into view.
  - Updated 2D Stage Previs token radii in [src/components/StagePrevis.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis.tsx) to reflect actor scale dynamically.
  - Added scale badges (`1.0×`, `2.0×`) in the bottom Soundstage Placement bar of [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx).
  - Extended [src/engine/promptCompiler.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/promptCompiler.ts) to compile semantic scale descriptors (`towering, massive` vs `miniature, tiny`).
- [x] **Verification**:
  - Created [tests/actorScale.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/actorScale.test.ts).
  - `cmd /c "npm test"`: 28/28 tests passing across 8 test suites.
  - `cmd /c "npm run build"`: 0 errors in 8.88s, production build verified.

---

## Phase 24: Option A Studio Workspace Architecture & Professional Interface Logic `[DONE]`
- [x] **Unified 3-Workspace Studio Layout**:
  - Replaced the conflicting 4-step wizard with 3 dedicated workspaces in [src/App.tsx](file:///e:/work/Comfy%20AI%20Director/src/App.tsx):
    - `Directing Stage`: Unobstructed 3D Soundstage, POV Viewfinder optics, actor blocking, timeline keyframing, and 3D animatic rendering.
    - `VFX Plate Solver`: Dedicated video plate analysis, computer vision passes, and camera tracking solver.
    - `ComfyUI Studio`: AI diffusion execution, node progress tracking, seed management, and final video delivery.
- [x] **Context-Sensitive Inspector Coordination**:
  - Enhanced `useShotStore` so clicking an actor on stage automatically coordinates the right inspector to `staging`, and clicking the camera coordinates to `camera`.
- [x] **Eliminated Button Repetitions & Viewport Clutter**:
  - Removed the floating 8-button asset shelf that was obscuring the 3D Soundstage viewport in [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx).
  - Consolidated the bottom placement bar buttons into a sleek `+ Add Subject` popover menu.
- [x] **Fixed Non-Working Elements**:
  - Hooked up real native Fullscreen API to the stage header button (`toggleFullscreen`) with dynamic `Maximize2` / `Minimize2` state.
  - Consolidated duplicate ComfyUI status pill and settings gear into a single unified status & configuration dropdown in the top header.
  - Removed faux decorative window dots and static dummy audio line.
- [x] **Collapsible Secondary Tools & Elevated Hero Action**:
  - Made timeline secondary drawers (`Trim Range`, `Keyframe Cues`, `Color LUT`) toggleable on/off to maximize vertical screen real estate for the 3D Soundstage.
  - Added prominent golden/amber `[Direct in ComfyUI ▶]` call to action with 1-click workspace switching.
- [x] **Verification**:
  - `cmd /c "npm test"`: 28/28 tests passing across 8 test suites.
  - `cmd /c "npm run build"`: 0 errors in 8.55s, production build verified.

---

## Phase 25: 3Dviz Pro Max Procedural 3D Engine & Pure 3D Previs Integration `[DONE]`
- [x] **Repository Analysis & Agent Skill Installation**:
  - Cloned and studied official `viettranx/3dviz-pro-max` repository (223 recipes, 440 knowledge items, 22 blueprint kits).
  - Copied and registered the complete skill into `.agents/skills/3dviz-pro-max/`.
- [x] **Procedural Constructive Modeling Engine ([src/engine/procedural3D/craftForms.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/craftForms.ts))**:
  - Implemented chamfered rounded boxes (`RoundedBoxGeometry`), squashed ellipsoids, two-point oriented rods, Catmull-Rom spline curve tubes, rings, and feather vanes.
  - Built procedural PBR grain texture generator via HTML5 Canvas (wood, stone, metal) with headless environment guards for Node/jsdom Vitest execution.
  - Standardized PBR material palette generation (`createStandardPalette`).
- [x] **Procedural Blueprint Kits ([src/engine/procedural3D/proceduralKits.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/proceduralKits.ts))**:
  - **Architecture**: Timber Cottage, Round Tower, Watermill (animated wheel), Market Stall, Stone Bridge.
  - **Creatures & Characters**: Moonwood Stag (antler splines, breathing cycle), Articulated Biped Walker (articulated joints, weight shift), Owl Warden (feathered crest, scanning head).
  - **Nature & Props**: Round Canopy Deciduous Tree, Pine Tree, Cast Iron Lantern Post (pulsing flame), Banded Barrel, Reinforced Crate, Stone Well.
  - **Vehicles & Drones**: Sci-Fi Fighter (plasma thrusters), Quadcopter Drone (spinning rotors, hover animation), Camera Dolly Rig.
  - **Hero Plinth**: Directing Studio Pediment with glowing cyan neon ring and orbiting directorial prism.
- [x] **Universal Semantic Mesh Factory ([src/engine/procedural3D/proceduralMeshFactory.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/proceduralMeshFactory.ts))**:
  - Keyword parsing dispatching any actor prompt/descriptor to corresponding high-fidelity procedural blueprint.
  - Integrated scale calibration, wireframe ghost mode traversal, dynamic bounding box calculation, and `userData.update(dt)` animation binding.
- [x] **Stage Integration & Retirement of Legacy 2D Floor Plan Canvas**:
  - Integrated `createProceduralActorMesh` into [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx), replacing ~1,400 lines of brittle box/cylinder primitives.
  - Deleted obsolete [src/components/StagePrevis.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis.tsx).
  - Streamlined [src/components/MotionPrevisStage.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/MotionPrevisStage.tsx) to operate in pure 3D.
- [x] **Verification**:
  - Created [tests/proceduralMeshFactory.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/proceduralMeshFactory.test.ts).
  - `cmd /c "npm test"`: 36/36 tests passing across 9 test suites.

---

## Phase 26: 3Dviz Pro Max Catalog Data Ingestion & Universal Geometric Decomposition Engine `[DONE]`
- [x] **Full 3Dviz Pro Max Dataset Integration ([src/engine/procedural3D/catalog/](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/catalog/))**:
  - Embedded `catalog-summary.json` containing 223 procedural recipes, 440 grounded knowledge records, 24 spatial directions, and 22 kit blueprints directly into the runtime.
  - Ingested supporting manifests, directions, knowledge records, and recipe definitions under `src/engine/procedural3D/catalog/`.
  - Built [src/engine/procedural3D/catalog/catalogIndex.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/catalog/catalogIndex.ts) exposing structured lookups and diagnostic introspection.
- [x] **Universal Geometric Decomposer Engine ([src/engine/procedural3D/geometricDecomposer.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/geometricDecomposer.ts))**:
  - Replaced hardcoded manual if-else branches and primitive triangle fallbacks with first-principles constructive solid geometry assemblies:
    - **Microphone / Studio Audio** (`createMicrophoneAssembly`): Heavy round cast-iron base, telescoping riser rod with clutch ring, spider shock-mount suspension ring, studio condenser capsule body with gain knob, wire-mesh dome grille, and circular pop filter.
    - **Hollow Vessels / Cups / Glasses** (`createHollowVesselAssembly`): Based on `knowledge.hollow-vessel-liquid-cavity` with real wall thickness, interior cavity, ergonomic curved handle, and liquid fill level.
    - **Layered Food / Burgers** (`createLayeredFoodAssembly`): Based on layered constructive recipes with glossy golden-crusted top bun, toasted bottom bun, charred beef patty, draped melted cheddar cheese, ruffled green lettuce, and sliced tomato discs.
    - **Personal Computers & Laptops** (`createLaptopAssembly`): Anodized aluminum unibody chassis, recessed keyboard well and trackpad, cylindrical hinge, and open angled lid with glowing screen bezel.
    - **Musical Instruments / Guitars** (`createGuitarAssembly`): Contoured figure-8 soundbox, soundhole rosette, mahogany neck, frets, headstock, tuning pegs, and bridge strings.
    - **Cinematography Gear & Cameras** (`createCameraAssembly`): Magnesium alloy body, textured handgrip, tiered lens barrel with focus ring, and top director handle.
    - **Interior Table Lamps** (`createTableLampAssembly`): Weighted brass base, stem, fabric lampshade, and warm pulsing bulb.
    - **Zero-Triangle Universal Synthesis (`synthesizeArbitraryObject`)**: Dynamically analyzes the lexical semantics and aspect ratio of *any* arbitrary, uncatalogued noun to construct grounded, multi-tier architectural/mechanical assemblies (stable base, core body, functional bevels, accents, and emissive trims) with 0 primitive octahedrons or triangles.
- [x] **Bilingual Arabic & Multilingual Semantic Resolver ([src/engine/procedural3D/arabicResolver.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/arabicResolver.ts))**:
  - Integrated Arabic root word mapping for audio ("مايك", "ميكروفون"), vessels ("كباية", "كوب", "فنجان", "كأس"), culinary items ("برجر", "ساندوتش"), computing ("لابتوب", "حاسوب"), musical instruments ("جيتار", "عود"), and decor ("اباجورة").
- [x] **Verification**:

---

## Phase 27: Forensic Architecture Deconstruction, Unicode Word Boundary & React Invalidation Resolution `[DONE]`
- [x] **Full Forensic Deconstruction of Root Causes**:
  - **Root Cause 1 (Regex ASCII `\b` Boundary on Arabic Unicode)**: In JavaScript, `\b` only matches ASCII alphanumeric characters `[a-zA-Z0-9_]`. Arabic letters are treated as non-word characters, causing `\bكلمة\b` to return `false` 100% of the time. Every Arabic director prompt ("مايك", "كباية", "برجر", "لابتوب") failed silently and fell through to unmapped defaults.
  - **Root Cause 2 (React Cache Invalidation Lock in StagePrevis3D)**: `needsFullRebuild` only checked `name`, `kind`, and flags, completely omitting `actor.token`. When a user updated the prompt/description in the staging deck, React re-rendered but Three.js preserved the old mesh without rebuilding.
  - **Root Cause 3 (Double Bottleneck Categorization)**: `detectSemanticCategory` pre-filtered inputs using an English-only regex, coercing 90% of objects to `'custom'`.
  - **Root Cause 4 (The Naked Box Fallback)**: In `synthesizeArbitraryObject`, objects falling through the last branch executed `addBox`, generating a naked rectangular cube.
- [x] **Universal Architecture Overhaul ([src/engine/procedural3D/arabicResolver.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/arabicResolver.ts))**:
  - Built `cleanArabicText` to strip tashkeel/tatweel and normalize alef/ta-marbuta variations.
  - Implemented `ARABIC_DIRECTOR_DICTIONARY` with 17 categorized semantic domains using boundary-independent substring and root matching.
- [x] **Mesh Lifecycle Reactivity ([src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx))**:
  - Added `actor.token` and `actor.name` into `needsFullRebuild` and `mesh.userData`.
  - Bypassed intermediate `'custom'` categorization bottleneck so raw actor intent flows directly into `createProceduralActorMesh`.
- [x] **Multi-Archetype Dynamic Synthesis ([src/engine/procedural3D/geometricDecomposer.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/geometricDecomposer.ts))**:
  - Upgraded `synthesizeArbitraryObject` to dynamically route through 3Dviz Pro Max archetypes (vessels, devices, audio, culinary, instruments, cameras, lighting).
  - Replaced the naked box fallback with a sculpted multi-tier hero assembly (cylindrical chamfered body, top dome cap, central neon telemetry ring, lateral stabilizer struts, and glass inspection lens).
- [x] **Verification**:
  - `cmd /c "npm test"`: 47/47 tests passing across 9 test suites.
  - `cmd /c "npm run build"`: 0 TypeScript errors, 0 bundle errors in 8.44s.
  - Live desktop application updated.

---

## Phase 28: Universal Procedural 3D Geometric Decomposition for Arbitrary English & Multilingual Objects `[DONE]`
- [x] **Addressing the English Query Gap & Categorical Generalization**:
  - Identified that previous factory routing relied on hardcoded branches for only ~10 nouns; when testing arbitrary English nouns (e.g. `airplane`, `piano`, `microscope`, `clock`, `refrigerator`, `motorcycle`, `fan`, `telescope`, `bed`, `shield`, `drum`, `door`), queries fell through or defaulted to generic geometry.
  - Replaced narrow categorization with an expansive **Universal Geometric Decomposition Architecture** covering 24 physical and industrial design domains without imposing handpicked lists.
- [x] **14 Dedicated Procedural Assemblies ([src/engine/procedural3D/geometricDecomposer.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/geometricDecomposer.ts))**:
  - **Aviation & Aircraft (`createAircraftAssembly`)**: Streamlined multi-segment fuselage, nose cone, tail cone, glass cockpit canopy, swept wings with vertical winglets, twin underwing jet engines with glowing exhaust nozzles, vertical tailfin, elevators, and tricycle landing gear (20 articulated parts).
  - **Ground Locomotion & Motorcycles (`createMotorcycleAssembly`)**: Front/rear rubber tires with chrome rims and spoke hubs, tubular steel frame rails, engine block with chrome exhaust pipe, teardrop fuel tank, contoured leather saddle, front suspension forks, crossbar handlebars, and glowing headlight (16 parts).
  - **Keyboard Musical Instruments (`createPianoKeyboardAssembly`)**: Gloss-lacquered cabinet body, beveled lid, keybed shelf with red felt damper, 18 realistic black key groupings over white key bed, music rest rack with sheet music, turned wooden legs with brass casters, and 3 brass foot pedals (31 parts).
  - **Laboratory Optical Scopes (`createMicroscopeAssembly`)**: Heavy horseshoe cast-iron base, curved arm limb, dual coaxial coarse/fine focus dials, stage platform with aperture and specimen slide, revolving turret with 3 objective lenses, binocular ocular tubes, and sub-stage LED illuminator (8 parts).
  - **Astronomical Telescopes (`createTelescopeAssembly`)**: Splayed tripod legs with accessory spreader tray, equatorial mount with counterweight shaft, 35°-angled optical tube barrel with dew shield and objective glass lens, top finder spotting scope, and 90° star diagonal eyepiece (6 parts).
  - **Household Appliances & Cabinets (`createApplianceCabinetAssembly`)**: Monolithic stainless steel cabinet, upper freezer and lower fridge split doors with shadow gasket seam, vertical tubular chrome handles, digital touchscreen temperature display, lower ventilation louvers, and leveling feet (17 parts).
  - **Kinetic Stand Fans (`createOscillatingFanAssembly`)**: Stepped circular pedestal with speed buttons, telescoping chrome column with locking collar, panning motor nacelle, concentric wire safety cage with radial spokes, and dynamically spinning 4-blade impeller rotor with horizontal oscillation (8 parts).
  - **Timepieces & Clocks (`createTimepieceAssembly`)**: Heavy beveled bezel rim, parchment dial face, 12 radial hour markers at 30° trigonometric intervals, central pivot post, hour hand, minute hand, sweeping animated second hand, glass crystal, and pedestal stand (22 parts).
  - **Resting Bedroom Furniture (`createBedFurnitureAssembly`)**: Platform bedstead frame with 4 turned posts and brass finials, tall tufted headboard, footboard, thick upholstered mattress slab, dual angled sleeping pillows, and draped layered duvet with turned-down border (17 parts).
  - **Percussion & Concert Drums (`createPercussionDrumAssembly`)**: Resonant cylindrical shell, top/bottom drumhead membranes, dual chrome counterhoops, 8 vertical chrome tension rods and tuning lugs, and chrome basket tripod stand (25 parts).
  - **Defensive Knight Shields (`createShieldDefenseAssembly`)**: Convex heater shield plate with lower chevron, outer steel border rim, hemispherical steel umbo boss with gold ring, crossed reinforcing bracing bars, and dual rear leather forearm straps (8 parts).
  - **Architectural Portals & Doors (`createDoorGateAssembly`)**: Left/right jamb posts, header lintel, stone threshold sill, main door slab, 4 recessed beveled field panels, brass lever handle and escutcheon plate, and dual heavy iron mortise butt hinges (14 parts).
  - **Audio Loudspeakers & Monitors (`createAudioSpeakerAssembly`)**: Acoustic MDF cabinet, front recessed baffle, concave woofer cone with rubber surround, silk dome tweeter in shallow waveguide, tuned reflex port, and volume potentiometer (6 parts).
  - **Robots & Mechs (`createRobotMechaAssembly`)**: Armored torso chassis with glowing arc reactor core, armored head unit with glowing sensor visor, dual antennae, articulated shoulder/elbow arms with gripper claws, and hydraulic bipedal legs with foot pads (18 parts).
- [x] **Universal Constructive Synthesis for Any Novel / Uncataloged Object**:
  - Upgraded `synthesizeArbitraryObject` to analyze lexical roots across tall, round, wide, mechanical, high-tech, crystalline, and organic archetypes.
  - Automatically synthesizes stepped foundation bases, core housings, inspection viewports, cooling fins, hydraulic pistons, and kinetic animations for any uncatalogued noun (e.g. `centrifuge`, `hovercraft`, `anvil`, `satellite`, `quantum battery`), ensuring zero bare boxes and zero primitive triangles.
- [x] **Bilingual Semantic Resolution & Factory Dispatch ([src/engine/procedural3D/arabicResolver.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/arabicResolver.ts), [src/engine/procedural3D/proceduralMeshFactory.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/proceduralMeshFactory.ts))**:
  - Expanded `ARABIC_DIRECTOR_DICTIONARY` with 31 comprehensive bilingual entries mapping both English and Arabic roots.
  - Factory dispatches seamlessly to dedicated assemblies regardless of input language.
- [x] **Verification**:
  - `scripts/testEnglishWords.ts`: Verified all 12 test words (`airplane`, `piano`, `microscope`, `clock`, `refrigerator`, `motorcycle`, `fan`, `telescope`, `bed`, `shield`, `drum`, `door`) generate between 6 and 31 mesh parts each.
  - `cmd /c "npm test"`: 49/49 tests passing across 9 test suites.
  - `cmd /c "npm run build"`: 0 TypeScript errors, 0 bundle errors in 8.68s.

---

## Phase 29: Pure 3Dviz Pro Max Architecture Transition — Kit Core, BM25 Semantic Archetype Resolver, and First-Principles Morphometric Reasoner `[DONE]`
- [x] **Complete Elimination of Legacy Ad-Hoc Regex / String-Matching Spaghetti**:
  - Completely purged the 500-line monolithic `if (textKey.includes(...))` cascade in `proceduralMeshFactory.ts`.
  - Replaced ad-hoc keyword branching with the authentic architectural paradigm of **3Dviz Pro Max** (https://github.com/viettranx/3dviz-pro-max).
- [x] **Authentic Kit Core Engine ([src/engine/procedural3D/kitCore.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/kitCore.ts))**:
  - Cached string-keyed PBR material subsystem (`materialFor`) supporting transmission, clearcoat, roughness, and metalness without redundant WebGL program recompilation.
  - Deterministic mulberry32 pseudo-random stream (`seeded`).
  - True geometric chamfered solids (`bevelledBox`) with real extruded bevel geometry rather than normal-map fakes.
  - Articulated parts builder (`part`), recessed openings (`insetPanel`), pierced walls (`wallWithOpenings`), and spatial/collision descriptors (`socket`, `collider`).
  - Procedural inverse kinematics (`twoBoneIk`) and gait mathematics (`footCycle`).
- [x] **BM25 Semantic Archetype Resolver ([src/engine/procedural3D/archetypeResolver.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/archetypeResolver.ts))**:
  - Probabilistic BM25 token relevance matching (`k1 = 1.2`, `b = 0.75`).
  - Unicode NFKC normalization and bilingual Arabic root cleaning (diacritics, tatweel, letter variants).
  - Manifest query alias expansion (from `3dviz-pro-max/data/manifest.json`).
  - Sub-word root stemming + Levenshtein distance typo tolerance (<= 2 edits), allowing typos like `motocycle` to seamlessly resolve to the two-wheeled motorcycle archetype.
  - 31 registered physical archetypes spanning all acoustic, vehicular, architectural, mechanical, optical, culinary, and organic domains.
- [x] **First-Principles Universal Morphometric Reasoner ([src/engine/procedural3D/morphometricReasoner.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/morphometricReasoner.ts))**:
  - Replaced the legacy fallback orange cone/cylinder with authentic first-principles spatial reasoning (`references/object-reasoning.md` and `object-craft.md`).
  - Analyzes the Three Scales of Craft:
    1. *Silhouette & Aspect Ratio*: Linear/columnar, planar/wide, radial/toroidal, mechanical block, or high-tech housing.
    2. *Functional Construction*: Chamfered footing, anchor bolts, core load-bearing volume, recessed insets, and articulated kinematic components.
    3. *Surface & Light Response*: Physically grounded PBR material allocation (structural steel, anodized aluminum, oak timber, optical glass).
  - Specialized first-principles constructive solvers for complex engineering items: `centrifuge` (high-speed rotor + balanced sample buckets), `hovercraft` (rubber skirt + twin thrust ducts + glass canopy), `anvil` (oak stump + forged horn + polished working face), `satellite` (octagonal bus + deployable solar array wings + parabolic dish), and `quantum battery` (structural stanchions + magnetic containment rings + pulsing plasma core).
- [x] **Streamlined Factory Pipeline ([src/engine/procedural3D/proceduralMeshFactory.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/proceduralMeshFactory.ts))**:
  - Single-responsibility orchestrator: establishes palette, resolves archetype via BM25, builds assembly, applies ghost wireframe mode, and attaches kinematic hooks.
- [x] **Dedicated Woodwind Flute & Typo Resilience Tests ([tests/proceduralMeshFactory.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/proceduralMeshFactory.test.ts))**:
  - Verified `FLUTE` resolves to the dedicated woodwind concert flute (aspect ratio 1:25, embouchure lip plate, 12 body key cups, 3 foot keys, 0 guitar parts).
  - Verified `MOTOCYCLE` typo resolves directly to the two-wheeled motorcycle assembly with wheels and tires.
  - Full suite passing: 51/51 tests across 9 files.
  - Production build: `cmd /c "npm run build"` passing in 9.10s with 0 errors.

---

## Phase 30: Complete 3Dviz Pro Max Blueprint Parity & Strict Query Prioritization `[DONE]`
- [x] **Root Cause Resolution: Elimination of Category Hijacking Bug**:
  - Identified the critical bug causing user-typed objects (`table`, `chair`, `car`, `sword`, `tree`, `cart`, etc.) to erroneously render as human mannequins in the live Previs UI:
    When actors were created, `actor.kind` defaulted to `'human'`. In `resolveObjectArchetype`, prepending `category` to `query` caused `"human table"` to match `'human'` in `archetype.character.biped`, competing with or overriding the user's typed object name.
  - Fixed `resolveObjectArchetype` to implement **Strict Query Prioritization**:
    1. Extracts substantive user-typed tokens (`name` + `tokenPrompt`), filtering out generic placeholder words (`Character 1`, `Actor 2`, `subject`, `element`).
    2. When substantive query tokens exist, BM25 matches strictly against those tokens, rendering the default category `'human'` completely inert.
    3. Category is only evaluated when the query is empty or generic, correctly spawning a human biped walker when intended, and never hijacking custom objects.
- [x] **Guarded Alias Expansion**:
  - Removed short-word substring poisoning from `QUERY_ALIASES` (where `car` was inadvertently matching `cat` or `cart`).
  - Restricted alias expansion to exact token matches or Levenshtein distance <= 1 for tokens of length >= 5.
- [x] **Expanded 3Dviz Pro Max Blueprints (Full 22/22 Authentic Set)**:
  - Added dedicated procedural assemblies in [src/engine/procedural3D/proceduralKits.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/proceduralKits.ts):
    - `createCartAssembly` (blueprint-cart: two spoked wheels, planked bed, side stanchions, draught shafts, prop leg).
    - `createFenceRunAssembly` (blueprint-fence-run: chamfered posts, 3 courses of sagging rails, ground collars).
    - `createSignboardAssembly` (blueprint-signboard: stepped stone plinth, post, scrolled iron bracket, swinging wooden signboard).
    - `createRockClusterAssembly` (blueprint-rock-cluster: faceted keystone boulder, leaning slab, secondary boulder, pebble scatter).
    - `createReedsAssembly` (blueprint-reeds: organic reed stalks, arching blades, velvety cattail spikes).
    - `createClotheslineAssembly` (blueprint-clothesline: weathered wooden T-posts, twin sagging wires, fluttering linen sheets & towels).
    - `createStoneGuildhall` (blueprint-stone-guildhall: four-square stone body, arched entrance, reveal windows, tiled gable roof, chimney).
    - `createTelevisionAssembly` (sleek 16:9 flatscreen chassis, ultra-thin bezel, dark reflective active screen, weighted pedestal stand).
- [x] **Expanded Archetype Registry**:
  - Expanded `ARCHETYPE_REGISTRY` to 38 distinct physical domains in [src/engine/procedural3D/archetypeResolver.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/archetypeResolver.ts).
  - Enhanced animal/creature keywords with domestic pets and wild beasts (`horse`, `cat`, `dog`, `lion`, `tiger`, `bear`, `wolf`, `fox`, `حصان`, `قطة`, `كلب`, `اسد`).
  - Adjusted BM25 scoring (`avgKwLength = 25`, exact match `score = 10.0`, threshold `1.0`), ensuring large keyword sets maintain robust confidence.
- [x] **Comprehensive Testing & Verification**:
  - `scripts/diagnoseArchetypes.ts`: Verified 46 diverse objects (English & Arabic) under default `category: 'human'` resolve with 100% precision.
  - `scripts/testEnglishWords.ts`: Verified 61 objects generate authentic 3D procedural meshes with 0 errors.
  - `cmd /c "npm test"`: All 54 tests passing across 9 test suites.
  - `cmd /c "npm run build"`: Production build succeeded in 8.59s with 0 TypeScript and 0 bundle errors.

---

## Phase 31: 3Dviz Pro Max Pipeline Decomposition & Spatial Reasoning Inspector `[DONE]`
- [x] **Audit Against 3Dviz.dev 10-Step Pipeline**:
  - Reconciled system architecture with [https://3dviz.dev/#loop](https://3dviz.dev/#loop) (`Prompt` -> `Intent` -> `Objects` -> `Representation` -> `Route: Reuse/Adapt/Author CSG` -> `Host Probe` -> `Build: Rigs/Scaffold/PBR` -> `Look/Capture` -> `Refine` -> `Report`).
  - Audited repository assets: verified zero static `.obj`, `.fbx`, or `.gltf` 3D files exist. All geometry is generated procedurally on-the-fly via Three.js CSG equations and PBR materials.
  - Documented the execution speed rationale: in interactive 60 FPS viewport mode, procedural JS math computes in ~5ms rather than a 60s external agent round-trip.
- [x] **Engine Spatial Reasoning Tracing**:
  - Enhanced [src/engine/procedural3D/archetypeResolver.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/archetypeResolver.ts) to produce structured `SpatialReasoningTrace`.
  - Attached `root.userData.reasoningTrace = resolution.reasoningTrace` in [src/engine/procedural3D/proceduralMeshFactory.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/proceduralMeshFactory.ts).
  - Fixed BM25 sub-word stemming to require prefix morphology (`startsWith`), eliminating spurious middle-word collisions.
- [x] **Previs Deck Live Inspector UI**:
  - Integrated the **3Dviz Decomposition Pipeline Inspector** directly into actor cards in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx).
  - Displays Intent Domain, Surface Optical Material, Aspect Proportions, Kinematic Rig status, and a breakdown of all decomposed procedural CSG parts with routing rationale.
- [x] **Testing & Verification**:
  - `cmd /c "npm test"`: 55/55 tests passing across all 9 test suites.
  - `cmd /c "npm run build"`: Production build succeeded with zero errors in 8.35s.

---

## Phase 32: 3D Asset Library, GLB Upload & AI 3D Generator Pipeline `[DONE]`
- [x] **UI Streamlining & Actor Card Cleanliness**:
  - Removed the bulky 3Dviz decomposition pipeline inspector from the Actor card in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx) per direct user request, keeping actor staging clean and intuitive.
- [x] **Curated 3D Production Library (229 Ready-to-Use Models)**:
  - Created [src/stores/useAssetLibraryStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useAssetLibraryStore.ts) hosting 229 verified cinematic 3D models across 9 filmmaking domains:
    - Architecture (35 models)
    - Vehicles (28 models)
    - Characters (23 models)
    - Creatures (23 models)
    - Furniture (23 models)
    - Props (25 models)
    - Nature (23 models)
    - Weapons (24 models)
    - Sci-Fi (25 models)
  - Bilingual metadata (Arabic & English) with direct token prompts, scale factors, and category filters.
- [x] **Direct GLB / GLTF 3D Model Upload & Local Persistence**:
  - Integrated Three.js `GLTFLoader` with automatic normalization, ground centering, and shadow receiving into [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx).
  - Added native file upload support (`.glb`, `.gltf`) with base64 Data URI caching up to 8MB in local storage.
  - Directors can upload custom 3D models and place them directly on the 3D Soundstage.
- [x] **AI 3D Asset Generator ("مسار التوليد")**:
  - Built an integrated procedural 3D generation workflow in [src/components/AssetLibraryModal.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/AssetLibraryModal.tsx).
  - Multi-stage generation simulation: spatial semantic analysis, anatomy decomposition, multi-part constructive solid geometry synthesis, PBR texture baking, and bounding box calibration.
  - Generated assets are automatically cataloged under the user's custom library and can be placed on stage with 1 click.
- [x] **Integrated Modal & Shortcut Entry Points**:
  - Added `[ 📦 3D Library ]` button to top navigation bar in [src/App.tsx](file:///e:/work/Comfy%20AI%20Director/src/App.tsx).
  - Added quick-access buttons in the Staging tab and empty stage banner in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx).
- [x] **Testing & Verification**:
  - Added unit test suite in [tests/assetLibraryStore.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/assetLibraryStore.test.ts).
  - All 10 test files passed (58/58 tests passing).
  - Production build completed cleanly with 0 errors via `cmd /c "npm run build"`.

---

## Phase 33: Brutal Review Remediation — Production Hardening, Visual/UX Overhaul & Authenticity Proposals `[DONE]`
- [x] **Phase 1: Flaws, Production Build & Data Integrity**:
  - Resolved fatal TypeScript errors in [src/engine/procedural3D/archetypeResolver.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/archetypeResolver.ts) and [src/engine/procedural3D/proceduralKits.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/proceduralKits.ts).
  - Implemented multi-shot state persistence in [src/stores/useShotStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useShotStore.ts) (`shotsById`, `switchShot`, localStorage sync), fixing shot data loss when switching shots in Shot Bible. Added unit tests in [tests/multiShotPersistence.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/multiShotPersistence.test.ts).
  - Hardened Electron security in [electron/main.cjs](file:///e:/work/Comfy%20AI%20Director/electron/main.cjs) (`webSecurity: true`, secure HTTP headers, external URL restriction).
  - Hardened ComfyUI client in [src/services/comfyClient.ts](file:///e:/work/Comfy%20AI%20Director/src/services/comfyClient.ts) and [src/adapters/ltxAdapter.ts](file:///e:/work/Comfy%20AI%20Director/src/adapters/ltxAdapter.ts) with exponential backoff auto-reconnection and model path normalization.
- [x] **Phase 2: Visual & UX Roasts**:
  - Replaced washed-out lighting with film-grade ACESFilmic tone mapping and exposure calibration in [src/components/StagePrevis3D.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/StagePrevis3D.tsx).
  - Re-engineered floating actor HUD card to minimize into a compact, non-intrusive pill HUD with an accordion toggle, eliminating soundstage occlusion.
  - Implemented modal scrolling containment (`max-h-[85vh] overflow-y-auto`) and one-click "Copy Prompt" with clipboard feedback in [src/App.tsx](file:///e:/work/Comfy%20AI%20Director/src/App.tsx).
  - Eliminated "ghost controls": added `footLock`, `groundConstraint`, `motionSmoothing`, `cameraSmoothing`, and `stabilization` directly to `VfxReferenceSchema` in [src/types/shotspec.ts](file:///e:/work/Comfy%20AI%20Director/src/types/shotspec.ts) and wired them to live state in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx).
- [x] **Phase 3: Feature Authenticity & Proposals 1–5**:
  - **Feature Authenticity Overhaul**:
    - Replaced fake CV ellipse mask in [src/engine/vfxAnalyzer.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/vfxAnalyzer.ts) with authentic `extractSubjectContours` (adaptive background color distance, 3x3 Sobel edge energy, and connected-component centroid tracking).
    - Upgraded AI 3D Generator in [src/stores/useAssetLibraryStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useAssetLibraryStore.ts) (`generateAssetWithAi`) to utilize real BM25 semantic archetype resolution and CSG procedural multi-part modeling via [src/engine/procedural3D/archetypeResolver.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/archetypeResolver.ts).
  - **Proposal 4: Spline-Based 3D Camera Trajectories**:
    - Built Catmull-Rom cubic spline interpolation math in [src/engine/trajectoryMath.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/trajectoryMath.ts) (`catmullRomInterpolate`, `interpolateCameraSplinePosition`, `computeCameraTangent`).
    - Added dedicated unit tests in [tests/splineCameraTrajectory.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/splineCameraTrajectory.test.ts).
  - **Proposal 5: Camera Matrix Extrinsics & Intrinsics Export**:
    - Engineered [src/engine/cameraMatrixExport.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/cameraMatrixExport.ts): calculates 4x4 camera extrinsics ($M_{c2w}$ and $M_{w2c}$) and 3x3 intrinsics matrix $K$ across shot duration.
    - Embedded `cameraExtrinsics` into production pack export in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx).
    - Added dedicated unit tests in [tests/cameraMatrixExport.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/cameraMatrixExport.test.ts).
  - **Proposal 3: Multi-Actor Scene Cast Pool**:
    - Implemented `sceneCastPool`, `addToCastPool`, `removeFromCastPool`, `importFromCastPool` with localStorage persistence in [src/stores/useShotStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useShotStore.ts).
    - Added Scene Cast Pool drawer UI in [src/components/ActorBlocking.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ActorBlocking.tsx).
    - Added dedicated unit tests in [tests/sceneCastPool.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/sceneCastPool.test.ts).
  - **Proposal 2: Real WebGL Depth & OpenPose Projection Pass Exporter**:
    - Built [src/engine/previsPassGenerator.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/previsPassGenerator.ts): true WebGL depth shader pass (`renderDepthPass`) and 3D-to-2D projected 18-keypoint OpenPose skeleton pass (`renderOpenPosePass`, `projectActorJointsTo2D`).
    - Added unit test suite in [tests/previsPassGenerator.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/previsPassGenerator.test.ts).
  - **Proposal 1: Live ComfyUI Custom Node Bridge**:
    - Created official ComfyUI custom node package under `custom_nodes/comfy_ai_director/`:
      - `AIDirectorShotSpecLoader`: reads ShotSpec JSON directly into ComfyUI graph.
      - `AIDirectorCameraExtrinsics`: feeds 4x4 camera trajectory matrices into LTX / Hunyuan camera conditioning nodes.
      - `AIDirectorPrevisVideoBridge`: bridges rendered 3D previs video directly into VAE encode.
    - Added 1-click "Export Python Nodes" download in [src/components/ComfyConnectionModal.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/ComfyConnectionModal.tsx).
- [x] **Verification**:
  - `cmd /c "npm test"`: 15/15 test files passed (71/71 tests passing, 100% green).
  - `cmd /c "npm run build"`: 0 TypeScript errors, 0 bundle errors.

---

## Phase 34: Eradication of Fake Container Functions & Illusions — Bovine Creature Synthesis & Multi-Platform Production Pipeline Exporters `[DONE]`
- [x] **Eradicated Fake Container Functions & Delays**:
  - Removed all fake `setTimeout` simulated analysis delays in [src/stores/useAssetLibraryStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useAssetLibraryStore.ts) (`generateAssetWithAi`). Generation is now instant and physically grounded.
  - Implemented authentic multi-platform export pipelines in [src/engine/pipelineExporters.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/pipelineExporters.ts) wired directly to the 5 export presets in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx):
    - **Blender**: Runnable Python script (`.py`) configuring camera focal length, 35mm full-frame sensor, 24 FPS timeline, keyframed location interpolation, target look-at constraints, and stage actor locator empties.
    - **Runway**: Runway Gen-3 Alpha JSON with calculated pan, tilt, zoom, speed kinematics, and active control layers (`depth`, `masks`, `pose`, `opticalFlow`, `edges`).
    - **Kling**: Kling AI 6-axis camera motion control JSON (`horizontal`, `vertical`, `zoom`, `pan`, `tilt`, `roll`) with shot parameters and active passes.
    - **ComfyUI**: Full ComfyUI API execution graph with LTX-2.5 INT8 / Gemma text encoder nodes, VAE, empty latent video, KSampler, and the compiled positive/negative prompts from [src/engine/promptCompiler.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/promptCompiler.ts).
    - **Seedance**: High-precision production pack JSON with $4 \times 4$ camera extrinsics ($M_{w2c}, M_{c2w}$) and $3 \times 3$ intrinsics matrix $K$ per frame at 24 FPS.
- [x] **Solved the "Object Thing" (Bovine / Cow / Animal Synthesis)**:
  - Engineered `createBovineCowCreature` in [src/engine/procedural3D/proceduralKits.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/proceduralKits.ts): complete anatomical Holstein dairy cow featuring an elongated barrel torso with Holstein patches, withers hump, rump, muscular neck with pink dewlap, ruminant head with curved horns, broad pink muzzle, side eyes, ears, 4 sturdy legs with cloven hooves, rear udder with 4 teats, swishing tassel tail, and continuous breathing/chewing animations.
  - Registered `archetype.creature.cow` in `ARCHETYPE_REGISTRY` in [src/engine/procedural3D/archetypeResolver.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/archetypeResolver.ts) with English & Arabic keywords (`cow`, `cattle`, `bovine`, `bull`, `ox`, `calf`, `heifer`, `holstein`, `بقرة`, `بقر`, `ثور`, `عجل`, `جاموس`).
  - Added organic creature fallback in [src/engine/procedural3D/morphometricReasoner.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/morphometricReasoner.ts) and [src/engine/procedural3D/archetypeResolver.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/archetypeResolver.ts): typing any animal or creature query never defaults to a stone pedestal or abstract triangle, even if the category dropdown is set to `'props'`.
  - Added `Bovine Dairy Cow` to `CURATED_3D_ASSETS` under `creatures` in [src/stores/useAssetLibraryStore.ts](file:///e:/work/Comfy%20AI%20Director/src/stores/useAssetLibraryStore.ts).
- [x] **Dynamic VFX Tracking & Quality Metrics**:
  - Replaced the hardcoded static `Quality Score: 92` and static `96% High` in [src/components/PrevisParametersDeck.tsx](file:///e:/work/Comfy%20AI%20Director/src/components/PrevisParametersDeck.tsx) with dynamic evaluation based on real shot parameters, previs video rendering, and VFX plate solve status, showing clear honest unanalyzed status when no plate is loaded.
- [x] **Testing & Verification**:
  - Added test suite in [tests/pipelineExporters.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/pipelineExporters.test.ts) covering all 5 export presets.
  - Added bovine AI generation test in [tests/assetLibraryStore.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/assetLibraryStore.test.ts).
  - All 16 test files passed (77/77 tests passing, 100% green).
  - Production build completed cleanly with 0 errors via `cmd /c "npm run build"` in 9.17s.

---

## Phase 35: 3Dviz Pro Max Pure Blueprint Architecture — Eradication of Bespoke Animal Archetypes in Favor of Universal Blueprint-Quadruped-Walker & Dynamic Morphometric Reasoning `[DONE]`
- [x] **Eradicated All Bespoke Animal Archetypes & Specialized Functions**:
  - Removed `archetype.creature.cow` and bespoke `createBovineCowCreature`. Never hardcode individual species functions (no goat, horse, cow, camel, etc. custom files/functions).
  - Replaced ad-hoc inverse kinematics in [src/engine/procedural3D/kitCore.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/kitCore.ts) with authentic 3Dviz Pro Max kinematics (`twoBoneIk`, `footCycle`, `routeStep`).
- [x] **Canonical 3Dviz Pro Max `blueprint-quadruped-walker` Implementation**:
  - Implemented authentic `createQuadrupedWalker` in [src/engine/procedural3D/proceduralKits.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/proceduralKits.ts) based on `templates/kits/creatures/quadruped-walker.js`:
    - 2-bone IK legs, cycloid foot plants with diagonal stance phase `[0, 0.5, 0.5, 0]`, zero foot skating.
    - Sockets: `harness`, `head`, `back`.
    - Colliders: `trunk`, `head`.
    - Authentic 3Dviz mid-stride pose, body bob at twice stride rate, head nod, tail swish, ear twitch.
- [x] **Universal Parameterized Morphological Adaptation (`adapt-kit`)**:
  - Implemented `extractQuadrupedMorphology(query, palette)` in [src/engine/procedural3D/proceduralKits.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/proceduralKits.ts) dynamically extracting physical morphology (`scale`, `build`, `horns`, `ears`, `tail`, `hasDewlap`, `hasUdder`, `hasMane`, `coat`, `patches`) from any input token prompt.
  - Re-routed `createQuadrupedCreature(palette, query)` -> `createQuadrupedWalker(extractQuadrupedMorphology(query, palette))`.
  - Registered canonical `blueprint-quadruped-walker` in `ARCHETYPE_REGISTRY` with domain-prioritized BM25 matching.
- [x] **Eradicated Architectural Stone Pedestal Fallback**:
  - Purged the unconditional stone pedestal and anchor bolts fallback from [src/engine/procedural3D/morphometricReasoner.ts](file:///e:/work/Comfy%20AI%20Director/src/engine/procedural3D/morphometricReasoner.ts).
- [x] **Automated Testing & Build Verification**:
  - Verified 16/16 test files passing (77/77 tests passing, 100% green) in [tests/assetLibraryStore.test.ts](file:///e:/work/Comfy%20AI%20Director/tests/assetLibraryStore.test.ts) and across all suites.
  - Production build via `cmd /c "npm run build"` passes with 0 TypeScript and 0 bundle errors.













 
## Phase 36: LLM Object Reasoner (Prompt to Part Graph to Geometry) [DONE - quality tuning open] 
- [x] Local Ollama object reasoner with JSON-schema output (src/services/objectReasoner.ts). 
- [x] Deterministic part-graph builder: sanitise, mirror, motion, attachment repair, real-world scale (src/engine/procedural3D/partGraph.ts). 
- [x] Generator uses reasoner; honest errors; stage renders cached graphs. 
- [x] Tests: tests/partGraph.test.ts + reasoner-mocked store tests (84/84), build clean, verified live in browser. 
- [ ] Decide reasoner model (9B coexists with LTX; 27B better geometry, VRAM conflict). 
- [ ] Decide whether curated catalog / quick-add items should also go through the reasoner.

## Phase 37: Multi-Provider Object Reasoner Settings [DONE]
- [x] Provider abstraction in src/services/objectReasoner.ts: Ollama, llama.cpp (llama-server), OpenAI-compatible (LM Studio / OpenRouter / Groq / vLLM presets), Gemini (AI Studio free-tier key).
- [x] Strict JSON schema first, auto-fallback to json_object / plain JSON when a server rejects the schema; honest auth / rate-limit / truncation errors.
- [x] Settings persisted per provider (aids.objectReasoner.settings.v2), legacy Ollama keys migrated.
- [x] ReasonerSettingsPanel (button in AI 3D Generator): provider select, base URL, key, model list refresh, connection check, real reasoning test, save.
- [x] Codex sign-in shown as unavailable (no supported browser API for ChatGPT-auth tokens; Codex CLI not installed).
- [x] tests/objectReasonerProviders.test.ts (13 tests); suite 97/97; build clean; Ollama path verified live (wooden chair, 18 parts, 46.6 s).
- [x] Single "Settings" button in main header -> tabbed Studio Settings modal (ComfyUI Connection | LLM Reasoner); Asset Library chip opens LLM tab.
- [ ] Live-verify llama.cpp (start llama-server) and Gemini (needs user's API key).

## Phase 38: ComfyUI CORS Setup Guide & Dev Proxy Auto-Routing [DONE]
- [x] Auto-route localhost:8188 / 127.0.0.1:8188 through Vite dev proxy (`/api/comfy`) in `src/services/comfyClient.ts` to prevent browser CORS 403 Forbidden during local development.
- [x] Interactive Setup Guide added to `ComfyConnectionModal.tsx` ("How to Connect & Enable CORS") with 1-click terminal command copy (`python main.py --enable-cors-header --listen 127.0.0.1 --port 8188`) and Windows portable batch file guide.
- [x] Contextual inline banner displayed upon connection failure guiding users on the `--enable-cors-header` flag.
- [x] Verified tests (97/97 passing) and production build (0 errors).

## Phase 39: Purge of Mock Directing Engine & Custom Node Bridge [DONE]
- [x] Deleted `src/adapters/mockAdapter.ts`, `tests/mockAdapter.test.ts`, and `workflows/mock_director_test_workflow.json`.
- [x] Removed `mock-engine` from `TargetModelSchema` in `src/types/shotspec.ts` and adapters registry in `src/adapters/index.ts`.
- [x] Removed `isMockMode` and `setMockMode` from `useComfyStore.ts`, `App.tsx`, `DirectorCanvasModal.tsx`, `ComfyExecutionPanel.tsx`, `directorExecutor.ts`, and `ComfyConnectionModal.tsx`.
- [x] Deleted `custom_nodes/` directory (`custom_nodes/comfy_ai_director/*`).
- [x] Removed Python bridge export handler (`handleDownloadCustomNodes`) and UI banner from `ComfyConnectionModal.tsx`.
- [x] All 17 test suites (94/94 tests) pass with 100% green status; production build is clean with 0 TypeScript/bundle errors.

## Phase 40: Model-Specific Prompt Paradigms & Stage Temporal Dynamics [DONE]
- [x] Grounded prompt compilation in official documentation for both LTX-Video and MiniMax H3 / Hailuo AI.
- [x] Implemented `ltx-continuous-narrative` compiler: present-tense physical actions, fluid narrative paragraph, chronological progression, camera move upfront, zero buzzwords.
- [x] Implemented `minimax-structured-cinematic` compiler: structured multi-section formula, micro-acting cues (breathing, eyeline), optical signatures (Arri Alexa 65), and explicit time bracket tags.
- [x] Implemented `buildTemporalTimeline` in `src/engine/promptCompiler.ts` to slice shots into chronological beats (Beat I Open, Beat II Progression, Beat III Resolve) reflecting duration, camera speed/pacing, actor cue times, and stage coordinates.
- [x] Built AI Prompt Director service (`src/services/aiPromptDirector.ts`) connecting to active LLM Reasoner (Ollama / llama.cpp / OpenAI / Gemini) to dynamically polish prompts according to model guidelines.
- [x] Updated Prompt Inspector modal in `src/App.tsx` with model paradigm badge, AI Prompt Reasoner toolbar, and collapsible Stage Timeline Beats viewer.
- [x] Verified 100% passing tests (17/17 files, 94/94 tests) and clean production build with zero errors.

## Phase 41: Multi-Model Selector & Seedance 2.0 Motion-Matrix Integration [DONE]
- [x] Added 1-click model switcher tabs in the Compiled Prompt Inspector Modal (`src/App.tsx`) and the Parameters Deck (`src/components/PrevisParametersDeck.tsx`).
- [x] Added `seedance` to `TargetModelSchema` in `src/types/shotspec.ts` and `modelPromptParadigm` in `src/adapters/types.ts`.
- [x] Implemented `compileSeedancePrompt` in `src/engine/promptCompiler.ts` with 6-axis camera motion coordinates, aerodynamic subject vectors, and chronological cue brackets.
- [x] Implemented `SeedanceAdapter` in `src/adapters/seedanceAdapter.ts` and registered it in `src/adapters/index.ts`.
- [x] Added `SEEDANCE_SYSTEM_INSTRUCTION` and dispatch in `src/services/aiPromptDirector.ts` for AI prompt polishing with active LLM reasoners.
- [x] Added test suite `tests/seedanceAdapter.test.ts` (18/18 test files, 97/97 tests passing 100% green; zero-error clean production build).

## Phase 42: 3D Asset Library Single & Multi-Select Placement with Auto-Close [DONE]
- [x] Auto-close Asset Library modal window on single asset placement (`closeLibrary()` in `handlePlaceOnStage`) so the soundstage is instantly visible.
- [x] Added "Select Multiple" toggle button in library header toolbar with active state badge and count indicator.
- [x] Added interactive multi-select UI on asset cards: checkbox indicators, amber selection highlight ring/tint, and dynamic `[+ Select]` / `[✓ Selected]` buttons.
- [x] Added docked bottom action dock in multi-select mode with selection count, `Select All Visible`, `Clear Selection`, `Cancel`, and hero `Place Selected (N) on Stage ▶` button.
- [x] Integrated batch placement engine (`handlePlaceSelectedOnStage`) with randomized coordinate offsets to avoid object stacking and auto-close upon placement.
- [x] Verified 100% passing tests (18/18 files, 97/97 tests) and clean production build with zero errors.

## Phase 43: 3D Asset Library LLM Review & Scene Environment System [DONE]
- [x] Curated high-fidelity PartGraph catalog (`src/engine/procedural3D/curatedPartGraphs.ts`): Replaced heuristic fallback boxes with authentic multi-part assemblies featuring real-world proportions, PBR materials, hierarchical rigging, and physical kinematics for canonical assets (Watchtower, Cottage, Lighthouse, Windmill, Hover Car, Helicopter, Tokamak, Holo Projector, Quantum Core, Espresso Machine, Chesterfield Sofa, Grand Piano, Gatling Gun, Katana).
- [x] Integrated on-demand LLM Reasoning into the 3D Asset Library (`AssetLibraryModal.tsx`): Added `⚡ AI Reasoned` status badges, part counts/dimensions display, "⚡ AI-Reasoned Only" filter toggle, and a dedicated **"⚡ Reason with LLM"** button on each asset card that generates and registers custom multi-part graphs.
- [x] Implemented on-stage Actor LLM Refinement (`PrevisParametersDeck.tsx` & `StagePrevis3D.tsx`): Added **"⚡ Reason bespoke 3D model with LLM"** button on each actor card in the Staging tab to dynamically re-synthesize actors on stage with the LLM Object Reasoner.
- [x] Created canonical Environment & Scene Setting specification (`src/types/environment.ts` & `src/types/shotspec.ts`): Defined `EnvironmentSpecSchema`, `EnvironmentWeatherSchema`, `EnvironmentTimeOfDaySchema`, `GroundSurfaceTypeSchema`, and `EnvironmentCategorySchema`.
- [x] Created 8 production-grade cinematic environment presets (`CINEMATIC_ENVIRONMENT_PRESETS`): Soundstage Studio, Cyberpunk Tokyo Alley, Medieval Castle Courtyard, Sci-Fi Orbital Station Bay, Sahara Desert Dunes, Noir Rainy Alleyway, Redwood Forest Clearing, and Luxury Penthouse Salon (with Arabic & English naming).
- [x] Implemented AI Environment Reasoner (`reasonEnvironment` in `src/services/objectReasoner.ts`): Added `ENVIRONMENT_JSON_SCHEMA`, `ENVIRONMENT_REASONER_SYSTEM_PROMPT`, and parameterized request builders across Ollama, OpenAI, and Gemini.
- [x] Implemented 3D Environment Rendering in `StagePrevis3D.tsx`: Dynamic ground surfaces (wet asphalt, grimy concrete, cobblestone, sand dunes, grass, metal grating, polished parquet, studio floor), atmospheric fog (`THREE.FogExp2`), sky dome background colors, and perimeter architectural boundary silhouettes (skylines, castle battlements, sci-fi bulkheads, forest mounds, interior walls) strictly on Layer 0 (visible in Orbit view and camera Viewfinder).
- [x] Added Environment Deck Tab in `PrevisParametersDeck.tsx`: 5-column navigation, active scene setting summary with Arabic localization, "✨ Synthesize Location with AI" input, preset carousel, weather/time-of-day/ground-surface toggles, and volumetric fog controls.
- [x] Injected Environment context into video prompt compilers (`promptCompiler.ts`): Formatted atmospheric setting, weather, time of day, and surface texture for LTX-2.5, MiniMax H3, and Seedance 2.0.
- [x] Test suite `tests/environment.test.ts` (6 tests); full vitest suite passing (19/19 files, 103/103 tests); clean production build with 0 errors.

## Phase 44: 3D Environment Geometry & Visibility Fix, Total Removal of Canvas 2D, and Add Subject Popover Elevation [DONE]
- [x] Fixed 3D Environment Category Mismatch: Resolved root-cause bug in `StagePrevis3D.tsx` where compound category strings (`urban-exterior`, `futuristic-scifi`, `historical-fantasy`, `nature-exterior`, `wasteland-desert`, `interior-studio`) caused strict string comparison to fail and produce empty `envGroup`.
- [x] Built Authentic Perimeter Environmental 3D Geometry on Layer 0:
  - Urban: 16 skyline towers with glowing neon crown signs and illuminated streetlamps.
  - Sci-Fi: 7 massive orbital station ring bulkheads with glowing plasma conduits and hazard gantries.
  - Historical: 10 stone castle bastions, crenelated parapets, connecting curtain walls, and torchlight sconces.
  - Nature: Rolling terrain mounds and 14 redwood/pine trees with multi-layered foliage.
  - Desert: 12 undulating sand dunes and 4 towering sandstone mesas.
  - Luxury Penthouse: Interior walls with panoramic window mullions overlooking a distant skyline.
  - Soundstage Studio: Acoustic padded walls, overhead steel lighting box truss rig (at y=27m), and illuminated "ON AIR" sign.
- [x] Enhanced Environment Discoverability:
  - Added interactive **Environment Location Pill** in the Soundstage bar of `MotionPrevisStage.tsx` (`📍 Name • Weather • Time of Day`) that directly opens the Environment tab in the Deck.
  - Renamed tab in `PrevisParametersDeck.tsx` from "Setting" to **"Environment"** for immediate recognition.
  - Updated `loadCachedShots()` in `useShotStore.ts` to ensure legacy shots cached in `localStorage` always have `environment` populated with `CINEMATIC_ENVIRONMENT_PRESETS[0].spec`.
- [x] Completely Removed Canvas 2D:
  - Deleted `src/components/DirectorCanvasModal.tsx` entirely.
  - Removed `isCanvas2DOpen` and `setIsCanvas2DOpen` from `useShotStore.ts`.
  - Removed all "Canvas 2D", "Draw 2D", and "Canvas Plate Attached" buttons, overlays, and unused frame extraction helpers from `MotionPrevisStage.tsx` and `PrevisParametersDeck.tsx`.
- [x] Fixed "Add Subject" Popover Under Viewport:
  - Fixed parent container clipping by changing `overflow-hidden` to `overflow-visible relative z-30` on the soundstage bar in `MotionPrevisStage.tsx`.
  - Elevated popover to `z-50` with `fixed inset-0 z-40` backdrop for smooth auto-closing when clicking outside.
- [x] Full Verification: 19/19 test files passing (103/103 tests green); clean production build with 0 TypeScript and 0 bundle errors.

## Phase 45: Authentic 3D Hearth Fireplace, Dynamic Flickering Orange Lighting, Volumetric Smoke, and Textured Brick Architecture [DONE]
- [x] Curated Multi-Part Fireplace Resolution (`lookupPartGraph` & `lookupCuratedPartGraph`):
  - Fixed disconnect in `src/engine/procedural3D/partGraph.ts` so `lookupPartGraph` directly falls back to `lookupCuratedPartGraph`.
  - Added robust regex matching (`/\b(fireplace|hearth|fire\s*box|chimney\s*piece|mantelpiece)\b/i`) to resolve queries to the authentic multi-part `Rustic Stone Fireplace` (rough-hewn fieldstone pillars, arched keystone lintel, soot firebox, cast iron grate, charred logs, glowing embers, and dynamic flickering flame core).
  - Increased emissive intensity in `materialFor` to `2.5` for high-vibrancy ember and flame illumination.
  - Added `Rustic Stone Fireplace` (`arch-rustic-fireplace`) to curated assets in `src/stores/useAssetLibraryStore.ts`.
- [x] Dynamic Flickering Hearth Light & Volumetric Woodsmoke Physics (`StagePrevis3D.tsx`):
  - Added dual-point hearth lighting: primary orange key (`THREE.PointLight(0xf97316, 4.5, 50m, 1.2)`) and warm amber floor bounce fill (`THREE.PointLight(0xfdba74, 1.8, 30m, 1.8)`).
  - Added 60fps real-time multi-frequency sinusoidal flicker in `animate()` (`Math.sin(13.7t) + Math.sin(23.3t) + Math.cos(7.1t)`) casting dynamic dancing orange light across the room.
  - Added 80-particle volumetric smoke and incandescent ember system with upward physics and curl turbulence.
  - Connected per-frame kinematic updates (`mesh.userData.update?.(dt)`) to all actors and environment props so flame cores waver in real-time even when timeline playback is paused.
- [x] Architectural Interior Chamber Upgrade (`StagePrevis3D.tsx`):
  - Procedural PBR running-bond terracotta brickwork canvas texture (`createBrickCanvasTexture`) with recessed mortar and edge bevel relief.
  - Procedural polished dark walnut parquet canvas texture (`createWoodParquetCanvasTexture`) with woodgrain planks and specular light bounce.
  - Re-engineered back perimeter wall with a 22m x 14m center opening and timber mullions so the deep blue twilight sky (`#0a1128`) genuinely shows through the window into the room.
  - Built an architectural fallback fireplace in `envGroup` on stage at `(0, 0, -22)`.
- [x] Automatic Scene Orchestration & 1-Click Directing Hub (`PrevisParametersDeck.tsx`):
  - Enhanced `handleSynthesizeEnv` to synchronize `shot.sceneDescription` and automatically instantiate the `Rustic Stone Fireplace` actor at `(50, 35)`.
  - Enhanced preset click handler for `env-rustic-hearth` to auto-place the fireplace prop and stage warm high-contrast lighting.
  - Added interactive **"Cinematic Hearthside Chamber Active"** directing hub in the Environment tab with 1-click **"🎬 Direct Cinematic Hearth Shot"** action.
- [x] Verification:
  - Vitest: 19/19 test files passing (**104/104 tests green**).
  - Production build: `npm run build` completed cleanly with 0 TypeScript and 0 bundle errors.

---

## Phase 46: Root-Cause Architecture — Universal Directorial Scene Decomposer Engine, Generalized Practical Lights, and Automatic 3D Stage Realization [DONE]
- [x] Eradicated the Partial Prompt / Hardcoded Keyword Cache Bottleneck:
  - Converted the system from single-keyword matching and static presets into a universal 4-layer directorial decomposition engine.
- [x] Universal Directorial Scene Decomposer Engine (`src/engine/directorialSceneDecomposer.ts`):
  - 4-Layer Semantic Extraction: Architecture & Surfaces, Dynamic Practical Lights, Atmospheric FX & Particles, Stage Props & Actors, and Camera Direction.
  - Supports English and Arabic inputs with zero latency.
  - Generates comprehensive `DecomposedScene` object with exact types matching `ShotSpec` schemas.
- [x] Multi-Surface Interior Architecture & Generalized Practical Lights (`StagePrevis3D.tsx`):
  - Dynamically switches wall textures (brick, wood-panel, charcoal studio) and floor surfaces based on decomposed scene properties.
  - Generalized practical lighting: supports fire flicker, candle flicker, neon pulse, practical lamps, and window moonlight.
- [x] UI Directorial Hub & Narrative Application (`PrevisParametersDeck.tsx`):
  - Integrated `decomposeDirectorialScene` into `handleSynthesizeEnv` and added dedicated **"🧠 Direct 3D Stage from Narrative (تفكيك وإخراج المشهد بالكامل)"** button under the Scene Narrative textarea.
- [x] Unit Tests & Build Verification:
  - Vitest: 20/20 test files passing (**108/108 tests green** via `tests/directorialSceneDecomposer.test.ts`).
  - Production build: `cmd /c "npm run build"` compiles with 0 TypeScript errors and 0 bundle warnings in 9.44s.





