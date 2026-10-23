# PROGRESS — ComfyUI Motion Previs Studio

Chronological log of remediation stages. Pre-remediation log: [docs/archive/PROGRESS_pre_remediation.md](docs/archive/PROGRESS_pre_remediation.md).

## 2026-10-23 — S0 Foundation (`stage/00-foundation`)

**Goal:** a clean, honest base before touching the generation pipeline.

### Measurements

| Metric | Before | After |
|---|---|---|
| Test wall time (`npm run test`) | ~57 s | ~8 s |
| Cumulative Vitest environment setup | ~942 s | ~5.5 s |
| Tracked files removed | — | 693 (≈ −91k lines) |

The speed-up comes from defaulting Vitest to the `node` environment; only tests that need the DOM opt in with `// @vitest-environment jsdom`.

### Removed fakes (would have misled users or judges)

- `public/mock_preview.mp4` — an ffmpeg test-pattern clip shown as `Cinematic_Action_Plate_1080p.mp4`.
- Runtime-fetched sample plates (mislabelled third-party ad videos).
- `drawProceduralCinematicFrame` — a hand-drawn fake noir scene that CV passes ran on when no plate was loaded.
- Colour-LUT tool (only tinted the fake canvas) and seeded fake timeline markers.
- 3 hand-written `workflows/*.json` graphs that could never run (wrong loaders, video into `LoadImage`, invalid conditioning inputs).
- `mock_` label branch in the execution panel.

### Bugs fixed

- **Clear Plate revoked the store's previs blob URL**, breaking "Use Rendered 3D Previs" afterwards (`VFXVideoDeck`).
- Old plate blob URLs leaked on replace; file input not reset (re-picking the same file did nothing).
- CV passes ran against the fake scene whenever the plate was paused/not ready.
- Auto camera solve never ran on the first upload and the plate loaded twice.
- Snapshot captured a fake canvas instead of the real viewport (video frame / image / 3D viewfinder).
- Launchers could start a stale `dist/` after a failed build.
- Broken `scripts/generate_workflows.ts` (bad import paths) — scripts are now type-checked in `npm run build`.

### Renamed

Product is now **ComfyUI Motion Previs Studio** across UI, `index.html`, `package.json`, Electron window, launchers, logs and exported metadata. Electron `userData` is pinned to the old folder so existing local data is not orphaned.

### Docs

README, AGENTS, new living ARCHITECTURE, DECISIONS (ADR-005…009), RISK_REGISTER, and `workflows/templates/README.md` (template + binding contract). Old docs moved to `docs/archive/`.

### Not done in S0 (by design)

See the deferred table in [TASKS.md](TASKS.md).

## 2026-10-23 — S1 Truthful Pipeline (`stage/01-truthful-pipeline`)

**Goal:** Replace broken hand-crafted graphs with a truthful, template-driven generation pipeline based on real ComfyUI API-format workflows and validated binding schemas.

### Accomplishments

1. **Pipeline Core (`src/pipeline/`):**
   - Pure functional binding (`templateBinder.ts`) with frame snapping (`8n+1` for LTX) and quality profile handling.
   - Strict Zod validation and fingerprint verification (`templateVerifier.ts`) preventing injection into altered or disconnected nodes.
   - Versioned patcher registry (`timelinePatchers.ts`) for deterministic timeline injection (`ltx.firstFrameSegment@1`, `h3.firstFrameCharacter@1`).
   - Deterministic SHA-256 and JSON stable hashing (`hash.ts`).
   - In-memory registry (`templateRegistry.ts`) and automatic Vite-based template discovery (`templateLoader.ts`).
   - Scoped prompt override store with staleness detection (`promptOverride.ts`).
   - Offline Package Mode exporter (`packageExporter.ts`) generating standalone API workflows and manifests.
   - Provenance tracking with `ShotRevisionV2` capturing exact workflow, seed, and template hashes (`revisionTypes.ts`, `useHistoryStore.ts`).

2. **Client & Execution Orchestration:**
   - ComfyClient upgraded to v2 (`comfyClient.ts`): multiplexed WebSocket listeners filtered by `prompt_id`, content-addressed uploads (`uploadContentAddressed`), targeted output extraction by output node ID, and job cancellation via `/interrupt`.
   - Singleton `JobRunner` (`jobRunner.ts`): orchestrates preflight, asset upload, binding, prompt submission, progress tracking, and single-revision persistence.
   - Dead code removal: deleted `src/services/directorExecutor.ts`.
   - Adapters updated: marked `buildWorkflow` deprecated and honest capability tiers documented.

3. **UI Polish & Controls (`ComfyExecutionPanel.tsx`):**
   - Connected to `defaultJobRunner.run()`.
   - Read-only target engine badge with open weights status and "Change Engine" navigation link.
   - Quality Profile selector (`Draft` vs `Final`).
   - Cancel generation button wired to active job handle.
   - "Export Generation Package (Offline Mode)" button for offline or remote execution.
   - Backward-compatible revision diff inspection in `DirectorDiffInspector.tsx`.

4. **Template Ingestion (`workflows/templates/`):**
   - Ingested authentic, executable API templates:
     - `ltx25_stubelius.api.json` + `ltx25_stubelius.binding.json`: Distilled 22B INT8 LTX 2.5 workflow extracted directly from live execution, fingerprinted with nodes 3, 4, 5, 6, 7, 8, 14, 15, and 8n+1 frame rule.
     - `h3_stubelius.api.json` + `h3_stubelius.binding.json`: MiniMax H3 Hybrid workflow fingerprinted with nodes 1, 2, 3, 4, 11, 12, 17, and PrimitiveStringMultiline prompt override wiring.
   - Both templates discovered, validated against live ComfyUI schemas, and registered automatically on app startup.

5. **Verification:**
   - Test suite: 21 test files, 128 tests passing in 4.4s (`npm run test`).
   - TypeScript & build: 0 errors across main project and scripts (`npm run build`).
   - In-browser UI: verified and screenshotted at `http://127.0.0.1:5173` with templates confirmed registered in debugger console.

## 2026-10-23 — S2 Desktop Hardening & Hygiene (`stage/02-desktop-hygiene`)

**Goal:** Eliminate dangling blob URL leaks, unify safe storage access across browser/Node 22 environments, self-host all fonts offline with strict CSP, and harden Electron window lifecycle and CORS scoping.

### Accomplishments

1. **Blob URL Lifecycle & Leak Prevention:**
   - Isolated root cause of dead preview plates across document reloads (`blob:` URLs generated by `URL.createObjectURL(file)`).
   - Created `sanitizeShotForStorage` in `src/services/storage.ts` to automatically strip ephemeral runtime `blob:` URLs before serialization while preserving all underlying asset metadata (`fileName`, `subfolder`, `durationSeconds`, `analysis`, `referenceMode`, etc.).
   - Integrated into `useShotStore` multi-shot caching.

2. **Universal Storage Architecture (`src/services/storage.ts`):**
   - Safe storage primitives (`getRawStorage`, `isLocalStorageAvailable`, `safeGetItem`, `safeSetItem`, `safeGetString`, `safeSetString`, `safeRemoveItem`).
   - Eliminated Node.js 22 experimental accessor warnings (`ExperimentalWarning: localStorage is not available because --localstorage-file was not provided`) by inspecting descriptors before evaluating `localStorage`.
   - Refactored all direct `localStorage` access across 8 codebase modules (`useShotStore`, `useHistoryStore`, `useComfyStore`, `useAssetLibraryStore`, `promptOverride`, `partGraph`, `objectReasoner`, `ShotBible`).

3. **Offline Font Self-Hosting & Strict CSP:**
   - Downloaded and bundled WOFF2 font files locally in `public/fonts/` for Inter (400, 500, 600, 700), Outfit (500, 600, 700), and JetBrains Mono (400, 500).
   - Created `src/fonts.css` with local `@font-face` definitions and imported into `src/index.css`.
   - Removed external Google Fonts CDN links from `index.html`.
   - Enforced strict Content Security Policy (CSP) meta tag in `index.html` allowing only `self`, local fonts/styles, blob/data URIs, and local ComfyUI on `http://127.0.0.1:8188` / `http://localhost:8188`.

4. **Electron Desktop Hardening (`electron/main.cjs`):**
   - Tightened CORS header injection: restricted from global `*` to strictly ComfyUI endpoints (`http://127.0.0.1:8188/*`, `http://localhost:8188/*`).
   - Implemented window state persistence (`window-state.json` in `userData` directory), saving `{ x, y, width, height, isMaximized }` with debounced file writes and display topology validation to prevent off-screen launches.

5. **Verification & Tests:**
   - Unit tests: created `tests/storage.test.ts` (10 tests) covering sanitization, storage fallbacks, and store integration.
   - Vitest suite: 22 test files, 138/138 tests passing in 4.5s with zero warnings or errors.
   - TypeScript & production build: 0 errors (`npm run build` in 9.6s).
   - In-browser verification: zero CSP violations in console, offline fonts rendered, 3D Virtual Soundstage active.

## 2026-10-23 — S3 Editing Safety & Undo/Redo Engine (`stage/03-editing-safety`)

**Goal:** Establish safe directorial editing with per-shot undo/redo, continuous drag gesture collapsing, shortcut guards, a first-run welcome tour, and truthful computed project metrics.

### Accomplishments

1. **Per-Shot Undo / Redo Engine (`src/stores/useShotStore.ts`):**
   - Implemented per-shot history stacks (`historyByShot: Record<string, { past: ShotSpec[]; future: ShotSpec[] }>`) capped at `MAX_HISTORY_STEPS = 50`.
   - Structural sharing: only modified properties change; switching shots maintains isolated past/future stacks without cross-talk.
   - Branch invalidation: making a new edit after undo cleanly purges the redo future stack.
   - Integrated with `loadShot`, `switchShot`, and `resetToDefault`.

2. **"One Gesture = One Undo Step" Collapsing (`src/components/StagePrevis3D.tsx`):**
   - Wired `beginGesture()` on pointer down when clicking an actor or camera in the 3D Soundstage.
   - Continuous pointer movements update live 3D coordinates without creating dozens of intermediate undo snapshots.
   - Calling `endGesture()` on pointer release collapses the entire interaction into a single undo step.
   - Added gesture tracking to Lateral, Depth, and Elevation HUD range sliders.

3. **Global Shortcuts & Input Safety (`src/App.tsx`):**
   - Added global `Ctrl+Z` (undo) and `Ctrl+Shift+Z` / `Ctrl+Y` (redo).
   - Implemented `isEditingText` guard (`activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || activeEl?.isContentEditable`) preventing global shortcuts from intercepting text editing.
   - Fixed the backtick / tilde handler which previously hijacked user input when typing in description or prompt fields.
   - Added studio header Undo and Redo icon buttons (`Undo2`, `Redo2`) with dynamic disabled states and tooltips.

4. **First-Run Welcome / Getting Started Modal (`src/components/WelcomeModal.tsx`):**
   - High-aesthetic glassmorphism modal introducing the 3 core studio workflows (3D Previs Soundstage, VFX Plate Solver, ComfyUI Diffusion Engine) and directorial safety shortcuts.
   - Persistent dismissal using safe storage (`STORAGE_KEYS.WELCOME_DISMISSED`).
   - "Help" button added to the studio top navigation bar to re-trigger the guide at any time.

5. **Truthful Computed Project Info (`src/components/ShotBible.tsx`):**
   - Replaced hardcoded fake statistics (`01:34:12`, `1920 × 1080`, `24 fps`, `Oct 18, 2026`) with truthful computed metrics.
   - Reactive duration calculated from all shots across all scenes (`scenes.reduce(...)`).
   - Aspect-ratio derived resolution (`1920 × 1080` for 16:9, `1920 × 804` for 2.39:1, `1080 × 1920` for 9:16, `1440 × 1080` for 4:3, `1080 × 1080` for 1:1).
   - Real scene count, shot count, frame rate, active shot duration/lens, and reactive workflow status badge.

6. **Verification & Tests:**
   - Unit tests: `tests/editingSafety.test.ts` (9 tests) verifying undo/redo, gesture collapsing, shot isolation, redo invalidation, stack limits, storage persistence, and computed metrics.
   - Vitest suite: 23 test files, 147/147 tests passing in 4.5s.
   - TypeScript & production build: 0 errors across main project and scripts (`npm run build` in 9.5s).
   - In-browser UI verification: verified Welcome Modal dismissal, header buttons, live focal length undo/redo flow, help modal re-opening, and Project Info reactive stats.

## 2026-10-23 — S4 Geometric Conditioning ("Direct the Shot, Not the Prompt") (`stage/04-geometric-conditioning`)

**Goal:** Replace legacy in-app `MediaRecorder` previs capture with a deterministic offline multi-pass renderer (8n+1 snapped, RGB + inverted depth) and connect geometric camera conditioning to the ComfyUI generation pipeline via IC-LoRA.

### Accomplishments

1. **Deterministic Offline Previs Renderer (`src/engine/offlinePrevisRenderer.ts`):**
   - Fixed-timestep animation stepping: eliminates real-time `setTimeout` pacing jitter and guarantees identical frame counts across machines.
   - LTX $8n+1$ frame rule snapping: ensures the rendered sequence conforms directly to DiT compression requirements (e.g. 5s @ 24fps -> 121 frames).
   - Dual-pass rendering:
     - Viewfinder RGB pass capturing camera motion, focal length, and 3D actor staging.
     - Depth pass using `THREE.MeshDepthMaterial` with inversion (`invertDepthCanvas`), outputting near=white and far=dark matching ControlNet and IC-LoRA conventions.
   - Muxing via `mp4-muxer` + WebCodecs `VideoEncoder` (Main Profile Level 4.2 H.264) with resilient fallback for headless environments, producing genuine `.mp4` video files.
   - Replaced buggy `handleRenderInAppPrevis` in `src/components/StagePrevis3D.tsx`, fixing stale closures (`currentTime`, `showGrid`) and misnamed `.webm` downloads.

2. **Pipeline Schema & Binding Integration:**
   - Extended `GenerationMode` to include `'control'` across `src/pipeline/templateTypes.ts`.
   - Added `'controlVideo'`, `'icLora'`, and `'icLoraStrength'` to canonical `BINDABLE_FIELDS`.
   - Added `ltx.geometricControl@1` timeline patcher in `src/pipeline/timelinePatchers.ts`, injecting `reference_mode: 'VIDEO'`, `retakeVideo`, and disabling prompt relay.
   - Updated `ltx.firstFrameSegment@1` to also support `mode === 'control'`.
   - Enhanced `src/pipeline/templateBinder.ts` to map and validate `controlVideoFile`, `icLora`, and `icLoraStrength`.
   - Updated `workflows/templates/ltx25_stubelius.binding.json` to register `"control"` mode and map node 5 inputs (`ic_lora`, `ic_lora_strength`).

3. **Execution & Packaging Orchestration:**
   - Upgraded `JobRunner.run()` in `src/pipeline/jobRunner.ts` to accept `controlVideoBlob`, perform content-addressed uploads (`uploadContentAddressed`), and pass resolved filenames to template bindings.
   - Upgraded `buildPackageManifest` and `exportOfflinePackageForShot` in `src/pipeline/packageExporter.ts` to record `controlVideo` uploads in manifest manifests.

4. **ComfyUI Execution Panel UI Overhaul (`src/components/ComfyExecutionPanel.tsx`):**
   - Implemented a 3-tab Mode Selector: `T2V` (Text to Video), `I2V` (Image Start), and `Control` (3D Previs LoRA).
   - Context-aware Geometric Conditioning HUD:
     - Live 3D Previs status badge ("3D PLATE READY" vs "RENDER REQUIRED").
     - Conditioning strength range slider (`0.00x` - `2.00x`, default `1.00x`).
     - IC-LoRA model weights input field (`ltx-video-camera-lora.safetensors`).
   - Unified generation trigger providing friendly validation if previs rendering is needed.

5. **Verification & Tests:**
   - Unit tests:
     - `tests/geometricConditioning.test.ts` (9 tests) verifying 8n+1 calculations, timeline patchers, binding validation, and package manifest uploads.
     - `tests/offlinePrevisRenderer.test.ts` (4 tests) verifying depth map inversion, fallback MP4 muxing, and deterministic step rendering.
   - Full test suite: 25 test files, 160/160 tests passing in 4.6s (`npm run test`).
   - TypeScript & production build: 0 errors across main project, scripts, and tests (`npm run build` in 12.6s).
   - Browser verification: verified mode switching, IC-LoRA HUD controls, and offline package exporter.


## 2026-10-23 — S5 Performance (60 FPS Previs & Bundle Splitting) (`stage/05-performance`)

**Goal:** Eliminate hot-path storage serialization during continuous 60 FPS 3D and slider interactions, halve active WebGL contexts by eliminating invisible viewport renderers, split vendor and component bundles into clean lazy chunks, and optimize Zustand store subscriptions.

### Accomplishments

1. **Bundle Splitting & Code Chunking (`vite.config.ts`):**
   - Configured Rollup `manualChunks` to split heavy vendor modules into standalone chunks:
     - `vendor-three`: 688 kB
     - `vendor-react`: 224 kB
     - `vendor-icons`: 38 kB
     - `vendor-muxer`: 31 kB
   - Extracted lightweight `DebuggerTogglePill` component (`src/components/DebuggerTogglePill.tsx`) to allow full `InAppDebugger` dynamic chunking without circular static imports.
   - Slashed main application bundle from **1,760 kB down to 606 kB** (**65% reduction**), easily exceeding the competition requirement of keeping the main chunk well under 1.67 MB.

2. **On-Demand Dynamic Loading (`src/App.tsx`):**
   - Converted secondary and modal components to `React.lazy` with `Suspense` fallbacks:
     - `ComfyExecutionPanel` (31.85 kB)
     - `ShotBible` (31.63 kB)
     - `ComfyConnectionModal` (22.71 kB)
     - `AssetLibraryModal` (22.06 kB)
     - `VFXVideoDeck` (21.00 kB)
     - `CinematicPresetsModal` (10.59 kB)
     - `comfyClient` (9.73 kB)
     - `InAppDebugger` (9.12 kB)
     - `DirectorDiffInspector` (8.66 kB)
     - `WelcomeModal` (7.45 kB)

3. **Hot-Path Debounced Persistence (`src/stores/useShotStore.ts`):**
   - Eliminated synchronous JSON serialization and `localStorage` I/O during 60 FPS continuous pointer moves and slider scrubbing.
   - When gesturing (`isGestureActive === true`), storage writes are automatically debounced off the hot path using a trailing timer.
   - Immediate synchronous flushes occur upon `endGesture()`, `switchShot()`, `loadShot()`, `resetToDefault()`, and `window.beforeunload`.
   - Exposed `flushShotsPersistence()` for manual flush synchronization.

4. **WebGL Dual-Viewport Context Halving (`src/components/StagePrevis3D.tsx`):**
   - Eliminated redundant WebGL renderer instantiation: previously both the Stage Orbit renderer and Viewfinder renderer were created unconditionally in each instance, resulting in 4 active contexts across `MotionPrevisStage`.
   - Lazily instantiates only the requested active viewport (`stageRenderer` for `'stage' | 'split'`, `vfRenderer` for `'viewfinder' | 'split'`), cutting active contexts in the studio from **4 down to 2**.
   - Guarded continuous render loop in `animate()` to only render active visible viewports.
   - Hardened cleanup: calls `forceContextLoss()`, `controls.dispose()`, and cleans up all DOM child nodes on unmount.

5. **Zustand Fine-Grained & `useShallow` Selector Optimization:**
   - Optimized store subscriptions in `App.tsx`, `AssetLibraryModal.tsx`, `DirectorDiffInspector.tsx`, and `CinematicPresetsModal.tsx` using `useShallow` and targeted selectors, preventing full-tree re-renders on actor or playhead updates.

6. **Verification & Tests:**
   - Unit tests: `tests/performance.test.ts` (3 tests) verifying hot-path write elimination, gesture release flush, immediate flush triggers, and manual flush API.
   - Vitest suite: 26 test files, 163/163 tests passing in 4.5s (`npm run test`).
   - Production build: `npm run build` succeeds with zero errors and zero warnings across main code, scripts, and tests.
   - In-browser UI verification: tested 3D Soundstage direct manipulation, fluid floor dragging, lazy chunk loading on navigation, shot switching, and modal interactions.
