# PROGRESS — ComfyUI Motion Previs Studio

Chronological log of remediation stages. Pre-remediation log: [docs/archive/PROGRESS_pre_remediation.md](docs/archive/PROGRESS_pre_remediation.md).

## 2026-10-28 — S12 Phase 8: Full UI/UX Audit Remediation & Zero-Duplicate Studio Architecture

**Goal:** Modernize and reorganize the entire studio interface so every feature is discoverable, zero controls are duplicated across panels, and zero dead/disconnected UI elements remain.

### Key Deliverables & Achievements
1. **Unified 3D Viewport & Exposed Stage Toolbar (`StagePrevis3D.tsx`, `MotionPrevisStage.tsx`)**:
   - Replaced dual-mounted `StagePrevis3D` instances with a single unified `StagePrevis3D` instance supporting `Split`, `Viewfinder`, `3D Stage`, and instant CSS `Swap` (`flex-row-reverse`), cutting active WebGL scenes/renderers in half (from 4 canvases down to 2).
   - Surfaced the complete 3D Stage & Viewport Control Toolbar (`Split / Viewfinder / 3D Stage / Swap`, Aspect Ratio `16:9 / 2.39:1 / 9:16 / 1:1`, `Base Pos` vs `Keyframe @ Time`, `Center (F)`, `Aim Camera`, `Iso / Top / Eye`, `Grid`, `3x3`, `Labels`, `FK Gizmos / IK Targets`, `🏺 12fps Clay`, and `.GLB` import).
   - Replaced ~900 lines of overlapping floating canvas HUDs with a sleek Top-Left Contextual Bar on the 3D Soundstage (`FK / IK` switch, `Rot / Move`, `Ground Feet`, `+ Pose Cue`, and active Bone `-15°/+15°` X/Y/Z nudges + `Reset`).
   - Replaced duplicate Soundstage Placement bars and unwired Audio Volume/Mute sliders with a compact 1-line Stage Cast & Environment Strip and restored `Shot Duration (1s–10s)` in the Transport Bar.
2. **Reorganized Right Inspector Deck & Shot Bible (`PrevisParametersDeck.tsx`, `ShotBible.tsx`)**:
   - Added persistent top Shot Slate & Target Engine Header (editable Shot Name, Shot Duration `1s–10s` stepper, and Target Engine pills `LTX-2.5` / `MiniMax H3` / `Seedance 2.0`).
   - Upgraded Camera tab with FOV degrees (`100°` to `18°`), Optical Impact callouts, `extreme-wide` framing, Angle Psychology callouts, and all 17 categorized camera movements (`Rack Focus`, `Handheld Subtle`, `Whip Pan`, `Crash Zoom`, `FPV Dive`, `Orbit Counter-Clockwise`). Removed unwired local-state `Camera Smoothing` and `Stabilization` controls.
   - Upgraded Cast tab by consolidating 3 duplicate Add Object sections into 1 unified card, restoring the **Scene Cast Pool** (`sceneCastPool`), surfacing `🦶 Ground Feet`, `🎬 + Pose Cue`, `↺ Reset`, **AI Acting Beats**, and **Prop Bone Socketing**, and removing unwired local-state `Foot Lock`, `Ground Lock`, and `Motion Smoothing` checkboxes.
   - Restored **Editable Negative Prompt** (`setNegativePrompt`) in the Light/Script tab.
   - Added explicit **Rename (`✎`)** buttons and inline renaming to both **Scenes** and **Shots** in `ShotBible.tsx`.
3. **Unified Render, Prompt & Export Studio (`PrevisExportDeck.tsx`, `App.tsx`, `AssetLibraryModal.tsx`)**:
   - Merged the standalone `App.tsx` Prompt Inspector Modal into `PrevisExportDeck.tsx` (AI Prompt Reasoner, Stage Timeline & Choreography Beats `Beat I / II / III`, Editable Negative Prompt, 4×4 Camera Extrinsics `c2w / w2c` JSON export, and Full Production Pack download).
   - Clarified `AssetLibraryModal.tsx` header actions (`✨ Concept-to-3D Studio` vs `⚡ Quick Text-to-3D`).
4. **Verification**:
   - Vitest suite: 46/46 suites passed (373/373 tests).
   - Production build: `npm run build` passed with zero errors.

## 2026-10-27 — OpenAI Browser Sign-In & ChatGPT Integration

**Goal:** Enable direct OpenAI / ChatGPT browser sign-in for the LLM Reasoner (no manual developer API key required), matching CozyClay / Codex reference architecture.

### Key Deliverables & Achievements
1. **OAuth 2.0 PKCE Browser Sign-In Service**:
   - Implemented `src/server/openaiAuthService.cjs` with PKCE authorization flow using public client ID `app_EMoamEEZ73f0CkXaXp7hrann` and loopback redirect URI `http://localhost:1455/auth/callback`.
   - Seamless token exchange at `https://auth.openai.com/oauth/token` with automatic token refresh before expiration.
   - Synchronizes credentials locally with `C:\Users\gfara\.codex\auth.json` and `~/.config/cozyclay/codex-auth.json`.
2. **Vite Proxy & Chat Completions Gateway**:
   - Implemented `openaiAuthPlugin` in `src/server/openaiAuthPlugin.ts` mounted in `vite.config.ts`.
   - Endpoints: `GET /api/openai/auth/status`, `POST /api/openai/auth/login`, `POST /api/openai/auth/logout`, `POST /api/openai/chat/completions`.
   - Translates standard OpenAI completions format to ChatGPT Codex responses wire format with SSE stream buffering and zero dropped tokens.
3. **Reasoner Settings Panel UI (`src/components/ReasonerSettingsPanel.tsx`)**:
   - Replaced raw API key requirement with high-aesthetic OpenAI / ChatGPT account card.
   - Live status badge: "✓ Browser Signed In", user email, and plan badge (`Plus / Pro` / `PROLITE`).
   - One-click model selection for `GPT-5.6 Sol (Flagship Reasoning · Recommended)`, `GPT-6.1 Sol (Next-Gen Frontier)`, and `GPT-6 Luna (Fast Reasoning)`.
   - Collapsible advanced options for users wishing to connect custom endpoints (LM Studio, OpenRouter, Groq).
4. **Verification**:
   - Vitest suite: 46/46 suites passed (373/373 tests).
   - Production build: `npm run build` passed with zero errors.
   - Verified live in browser with screenshot confirmation.

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


## 2026-10-23 — S6 UX Overhaul (Multi-Resolution Clean Layout) (`stage/06-ux-overhaul`)

**Goal:** Clean multi-resolution layout across 1280×720, 1440×900, 1920×1080, and 2560×1440, collapsible sidebars with smooth width transitions, truthful dynamic active scene binding, fully operational timeline trim and volume/mute controls, 100% offline cinema filmstrip, and total elimination of native blocking `alert()` dialogs.

### Accomplishments

1. **Multi-Resolution Responsive Layout & Window Bounds (`electron/main.cjs`, `src/App.tsx`):**
   - Relaxed Electron minimum window dimensions from 1100×720 down to `minWidth: 1024`, `minHeight: 680`, preventing window clipping and scrollbar glitches on standard 1280×720 laptop screens.
   - Implemented responsive collapsible sidebars (`isLeftSidebarOpen`, `isRightSidebarOpen`) with smooth 200ms ease-in-out CSS transitions.
   - Added accessible sidebar toggle buttons in the Studio Header (`Bible` on the left, `Deck` on the right) allowing users to expand either or both sidebars or collapse them to grant maximum viewport space to the Directing Stage.

2. **Truthful Dynamic Scene Binding (`src/App.tsx`, `src/components/ShotBible.tsx`):**
   - Replaced the hardcoded `"SCENE 01"` text in the Studio Header with real, reactive scene binding (`activeSceneName`).
   - Enhanced `onSelectShot` in `ShotBible` to propagate the resolved parent scene name (`Scene 01 - Arrival`, `Scene 02 - Rooftop Encounter`, etc.) and shot title whenever a shot is selected or scenes are edited.

3. **Operational Timeline Trim & Volume Controls (`src/components/MotionPrevisStage.tsx`):**
   - Wired `trimStartPct` and `trimEndPct` into the playback ticker `loop()` via refs: playback now loops seamlessly between `(trimStartPct / 100) * duration` and `(trimEndPct / 100) * duration`.
   - Replaced hardcoded `muted` attribute on the `<video>` element with reactive synchronization (`muted={isMuted || volume === 0}`).
   - Added interactive audio mute toggle button flipping between `Volume2` and `VolumeX` icons, with auto-unmute and volume restoration when moving the volume slider.

4. **100% Offline Procedural Cinema Filmstrip (`src/components/MotionPrevisStage.tsx`):**
   - Eliminated remote Unsplash background URL (`https://images.unsplash.com/...`), which violated offline CSP requirements and caused broken image tiles in air-gapped environments.
   - Built an authentic procedural dark 35mm film cell strip with perforation sprocket holes and frame numbers (`01`, `02`, etc.) rendered purely in CSS and SVG.

5. **Complete Elimination of Native Blocking `alert()` Calls:**
   - Eliminated all 7 native blocking `window.alert()` calls across the repository:
     - `src/components/VFXVideoDeck.tsx` (2 alerts replaced with `logger.error` and styled in-app dismissible error banner).
     - `src/components/ShotBible.tsx` (2 alerts replaced with `logger.warn` and styled in-app dismissible notice banner).
     - `src/components/ComfyExecutionPanel.tsx` (3 alerts replaced with `logger.warn`/`logger.error` and styled in-panel dismissible alert banners).

6. **Verification & Tests:**
   - Full test suite: 26 test files, 163/163 tests passing in 4.78s (`npm run test`).
   - Production build: `npm run build` completed in 9.98s with 0 errors and 0 warnings.
   - In-browser UI verification: tested multi-resolution layouts (1280×720, 1440×900, 1920×1080), sidebar collapse/expand animations, dynamic scene updates in the header, timeline trimming/volume, and in-app banner dismissal.

## 2026-10-23 — S7 Takes Grid & Generation Queue (`stage/07-takes-queue`)

**Goal:** Provide professional directorial take management: multi-seed batch generation queue, takes contact sheet grid, hero take circling (⭐), direct shot plate assignment, and synchronized side-by-side A/B player comparison.

### Accomplishments

1. **Multi-Seed Take Generator & Generation Queue (`src/pipeline/generationQueue.ts`, `src/stores/useQueueStore.ts`):**
   - Implemented `GenerationQueueManager` with sequential (`+1`) and random seed strategies.
   - Batch queue controls: configurable take batching (1, 3, 5 takes).
   - Robust queue lifecycle state machine: tracks `queued`, `running`, `completed`, `failed`, `cancelled` statuses.
   - Auto-advancing execution loop: sequentially runs items through `defaultJobRunner.run()`, preserves full `shotSpec` context, updates real-time node progress, and automatically proceeds to next queued item.
   - Per-item cancellation and full queue clearing actions (`cancelItem`, `clearQueue`, `clearCompleted`).
   - Created reactive Zustand store `useQueueStore` for synchronized UI state.

2. **Takes Contact Sheet / Grid (`src/components/TakesGrid.tsx`):**
   - Embedded directly in `ComfyExecutionPanel.tsx` as Section 3.
   - Visual card grid displaying all generated takes for the active shot, with quick filter toggle to view all shots across the project.
   - Detailed metadata on every take: Take #, seed number, target engine badge, generation mode badge, quality profile badge, and timestamp.
   - Real-time active queue progress list with live node titles, progress bars, and cancel buttons.

3. **Circling Hero Takes & Take Ratings (`src/stores/useHistoryStore.ts`, `src/pipeline/revisionTypes.ts`):**
   - Extended `ShotRevisionV2` with `takeNumber`, `isCircled` (⭐ circled hero take), and `rating` (0–5).
   - Added `toggleCircledTake(id)`, `setTakeRating(id, rating)`, and `getTakesForShot(shotId)` with safe persistent storage serialization.

4. **Direct Active Plate Assignment (`src/stores/useShotStore.ts`):**
   - Created `setTakeAsActivePlate(videoUrl, fileName)` in `useShotStore`.
   - Allows the director to click "Set as Plate" on any generated take to immediately inject it as the active background plate in the 3D Soundstage, Timeline, and VFX Video Deck.

5. **Synchronized A/B Player Comparison Modal (`src/components/TakeComparisonModal.tsx`):**
   - Side-by-side dual viewport view and interactive split wipe comparison slider with draggable divider handle.
   - Master synchronized transport controls:
     - Simultaneous play/pause (with Spacebar keyboard shortcut).
     - Synchronized scrubbing slider updating both video viewports in real-time.
     - Playback speed presets: `1x`, `0.5x`, `0.25x` slow motion for forensic motion analysis.
     - Audio mute and loop toggles with millisecond timecode display.
   - Integrated parameter traceability table highlighting differences in seed, engine, mode, profile, and camera movement between Take A and Take B.
   - Instant "Circle Take" and "Set as Active Plate" actions directly from the comparison modal.

6. **Verification & Tests:**
   - Unit tests (`tests/takesAndQueue.test.ts`): 10 tests verifying batch enqueueing, seed strategies, cancellation, queue clearing, retries, take numbering, circling, rating, plate assignment, and parameter diffing.
   - Full test suite: 27 test files, 173/173 tests passing in 4.74s (`npm run test`).
   - Production build: `npm run build` completed in 10.51s with 0 errors and 0 warnings.
   - In-browser UI verification: verified ComfyUI Studio panel loading, multi-seed queue controls (1, 3, 5 takes), seed mode switching, and takes contact sheet.

## 2026-10-23 — S8 Motion Fidelity Scoring (`stage/08-motion-fidelity`)

**Goal:** Ground the core competition premise ("Direct the Shot, Not the Prompt") by comparing generated video optical flow vectors against the directed 3D camera trajectory, computing an authentic 0–100% Motion Fidelity Score, rendering a visual vector HUD, and offering actionable directorial feedback.

### Accomplishments

1. **Optical Flow Motion Vector Analyzer (`src/engine/motionFidelityAnalyzer.ts`):**
   - Implemented block-matching optical flow on grayscale frame buffers with contrast/variance gating to filter textureless patches.
   - Derived radial divergence formulas to measure forward/backward camera movement (`dolly-in` expansion vs `dolly-out` contraction).
   - Inverted camera-to-flow kinematics: properly accounts for background flow moving opposite to physical camera trajectory (e.g. `pan-left` $\implies$ $+dx$ background flow; `tilt-up` $\implies$ $+dy$ background flow).
   - Speed & magnitude scoring: checks pixel flow velocity against camera speed profiles (`slow-cinematic`, `moderate`, `rapid-dynamic`) and penalizes unintended camera motion on static shots.
   - Stability scoring: evaluates velocity variance across sampled frame intervals.
   - Generates composite weighted score (0–100%), classification (`excellent`, `good`, `fair`, `drift`), and concrete prompt/conditioning recommendations.

2. **Visual Motion Vector Field HUD & Overlay (`src/components/MotionFidelityOverlay.tsx`):**
   - High-contrast SVG vector field layer rendering directional motion arrows and anchor points over the video viewport.
   - Directed vs. Achieved trajectory compass bar (`DIRECTED: PAN-LEFT` → `ACHIEVED: PAN-LEFT`).
   - Interactive score badge with vector toggle button (`Vectors: ON/OFF`).
   - Click-to-expand Directorial Guidance popover breaking down Directional, Speed, and Stability metrics with tailored recommendations.

3. **Takes Grid & Multi-Seed Workflow Integration (`src/components/TakesGrid.tsx`):**
   - Offscreen Canvas 2D frame extraction directly from video elements at sampling intervals.
   - Added "Score Motion Fidelity" trigger button on take cards with live percentage indicator (`Scoring (XX%)...`).
   - Embedded interactive `MotionFidelityOverlay` on take video previews.
   - Persisted analysis state via `useHistoryStore` (`setTakeMotionFidelity`).

4. **A/B Comparison Modal Integration (`src/components/TakeComparisonModal.tsx`):**
   - Added vector overlay support on both Take A and Take B video viewports.
   - Added master `Vectors: ON/OFF` toggle button in comparison header.
   - Integrated Motion Fidelity Analysis Comparison section inside the Parameter Traceability drawer: side-by-side comparison of overall score, detected movement, directional match, and speed match.

5. **Verification & Tests:**
   - Unit tests (`tests/motionFidelity.test.ts`): 13 tests verifying expected vector mapping, speed scaling, motion classification, block matching on synthetic gratings, scoring, drift detection, static shot penalties, and store persistence.
   - Full test suite: 28 test files, 186/186 tests passing in 4.85s (`npm run test`).
   - Production build: `npm run build` completed in 10.23s with 0 errors and 0 warnings.
   - In-browser UI verification: verified via subagent with recording `motion_fidelity_demo`.

## 2026-10-23 — S9 Closed-Loop Directorial Auto-Steering (`stage/09-closed-loop-steering`)

**Goal:** Close the directorial control loop ("Direct the Shot, Not the Prompt") by transforming diagnostic optical flow vector scores from Stage 8 into concrete, compensatory steering patches: reinforcing positive camera verbs, suppressing counter-motion vectors in the negative prompt, modulating geometric IC-LoRA conditioning, perturbing the seed to escape attractor basins, and tracking closed-loop revision lineage.

### Accomplishments

1. **Closed-Loop Directorial Steering Engine (`src/engine/directorialSteeringEngine.ts`):**
   - Grounded root-cause inference: evaluates optical flow classifications (`drift`, `static_drift`, `velocity_mismatch`, `subtle_drift`) and vector divergence angles to isolate mechanical motion failure modes.
   - Dynamic prompt verb reinforcement: injects cinematic action clauses with weighted emphasis (e.g., `(deliberate camera pan-left, steady pan-left tracking shot:1.35)` or `(dolly-in push forward, dynamic forward tracking shot:1.35)`) directly into the positive prompt.
   - Counter-steering negative prompt suppression: appends explicit anti-motion tokens targeting the opposite drift vector (e.g., `camera pan right, static frame, unintended motion`) or enforcing absolute stillness (`camera pan, camera tilt, camera zoom, shaky cam`) for static shots.
   - Geometric IC-LoRA modulation: increases IC-LoRA conditioning strength (by `+0.20` to `+0.25x`, capped at `1.85x`) to lock background geometry to 3D previs passes when drift exceeds tolerance.
   - Attractor basin escape: deterministically computes an RNG seed offset (`+107`) to evade localized generative drift attractor basins.
   - Pure utility functions: `applySteeringPatchToShot` and `calculateFidelityImprovement` for deterministic delta analysis.

2. **Directorial Closed-Loop Auto-Steering Modal (`src/components/DirectorialSteeringModal.tsx`):**
   - High-aesthetic diagnostic modal with glassmorphic cards and motion drift badges.
   - Applied Directives list explaining each automated adjustment in directorial terminology.
   - Visual side-by-side prompt diff panels showing original prompt vs. steered positive prompt (with reinforced verbs) and steered negative prompt (with counter-motion suppressions).
   - Parameter change badges for IC-LoRA conditioning strength and target seed offset.
   - Dual execution paths: "Apply to Active Shot" (instant state update) and "Apply & Queue Steered Re-Take" (updates shot and enqueues single steered generation into queue).

3. **Queue & Lineage Tracking (`src/pipeline/generationQueue.ts`, `src/pipeline/revisionTypes.ts`, `src/components/TakesGrid.tsx`):**
   - Extended `ShotRevisionV2` to record `steeredFromTakeId` and `steeringPatch` metadata.
   - Generation queue preserves steering lineage and attaches provenance to completed take revisions.
   - Takes Grid displays `STEERED (+XX%)` lineage badge on takes derived from prior takes, with tooltip showing original take number and score delta.
   - Takes Grid take card actions include "Auto-Steer" button, triggering the steering modal.
   - Motion fidelity overlay popover provides direct "Auto-Steer" button when optical flow analysis detects drift or low fidelity.
   - A/B comparison modal displays a dedicated Closed-Loop Steering Lineage banner when comparing a source take against its steered descendant.

4. **Verification & Tests:**
   - Unit tests (`tests/directorialSteering.test.ts`): 8 tests verifying directional drift counter-steering, static camera locking, dolly push-in radial reinforcement, velocity amplification, seed offsetting, ShotSpec application, fidelity delta calculation, and queue lineage persistence.
   - Full test suite: 29 test files, 194/194 tests passing in 4.89s (`npm run test`).
   - Production build: `npm run build` completed in 10.41s with 0 errors and 0 warnings.
   - In-browser UI verification: verified via subagent with recording `stage9_steering_verify_1792787404162.webp`.

## 2026-10-23 — S10 Multi-Shot Timeline & Sequence Assembly (`stage/10-sequence`)

**Goal:** Transform the single-shot studio into a complete multi-shot directorial workstation by providing an NLE-style sequence timeline, synchronized sequential playback, automated cinematic continuity and pacing verification, and professional editorial interchange (OpenTimelineIO, CMX 3600 EDL, Final Cut Pro XML).

### Accomplishments

1. **Canonical Sequence Data Models & SMPTE Math (`src/types/sequenceTypes.ts`, `src/engine/timecodeMath.ts`):**
   - Built robust timecode engine with `secondsToTimecode`, `timecodeToSeconds`, `secondsToFrames`, and `framesToTimecode` conforming to 24 FPS SMPTE Non-Drop Frame standard.
   - Derived effective shot duration with non-destructive in/out trimming (`getEffectiveShotDuration`, `calculateShotTimeRanges`, `calculateSequenceDuration`).
   - Real-time time lookup (`findShotAtTime`) mapping global sequence playhead positions to local shot playback timestamps.

2. **Automated Cinematic Continuity & Pacing Verification Engine (`src/engine/sequenceContinuityEngine.ts`):**
   - Evaluates inter-shot cut transitions against classical cinematographic rules:
     - **180-Degree Rule / Screen Direction**: Detects axis flips where actors abruptly invert screen position across adjacent cuts without neutral coverage.
     - **30-Degree Rule / Jump Cut Detection**: Flags discontinuous cuts sharing identical focal lengths, shot framing, and camera angles without spatial repositioning.
     - **Kinetic Vector Clash**: Detects jarring motion whiplash (e.g., rapid `pan-left` cutting immediately into an opposing `pan-right`).
     - **Lighting & Atmosphere Consistency**: Detects extreme color palette or lighting style mismatches within the same scene.
     - **Pacing & Cadence Diagnostics**: Flags flash cuts (< 1.0s), dragging takes (> 10.0s), and monotonous duration rhythms.
   - Computes weighted composite score (0–100%) and directorial rating (`exemplary`, `sound`, `needs_coverage`, `disjointed`) with per-cut actionable guidance.

3. **Professional NLE Editorial Exporters (`src/engine/sequenceExporters.ts`):**
   - **OpenTimelineIO (`.otio`)**: Industry-standard Schema 1.0 JSON format for VFX pipelines and modern NLE conforming with rational time ranges and directorial metadata.
   - **CMX 3600 EDL (`.edl`)**: SMPTE non-drop frame edit decision list with clean clip naming, take notes, and camera motion tracking.
   - **Final Cut Pro XML (`.xml` / `.fcpxml`)**: Full Apple FCP 7 / DaVinci Resolve compliant XML timeline format.

4. **Multi-Shot Sequence Store & Interactive UI (`src/stores/useSequenceStore.ts`, `src/components/`):**
   - `useSequenceStore`: Centralized state management for sequence assembly, playhead scrubbing, sequential playback, shot reordering, hero take bindings, and safe local persistence.
   - Top-level `Sequence Assembly` workspace mode added to `src/App.tsx`.
   - `SequenceTimelineDeck.tsx`: Full viewport sequence playback with slate/timecode HUD, transport bar (Play, Pause, Loop, Jump, Speed toggle), zoomable time ruler, playhead marker, shot blocks with drag/move reordering, hero take selector, and transition pills (`CUT`, `DISSOLVE`, `FADE`).
   - `SequenceContinuityModal.tsx`: Visual diagnostic modal detailing overall continuity score, clean cuts breakdown, and cut-by-cut directorial recommendations.
   - `SequenceExportModal.tsx`: Multi-tab export modal with formatted code preview, clipboard copy, and direct `.otio` / `.edl` / `.xml` file downloads.
   - `ShotBible.tsx`: One-click "Assemble in Sequence Timeline" button directly on scene headers.

5. **Verification & Tests:**
   - Unit tests (`tests/sequenceAssembly.test.ts`): 15 tests verifying SMPTE conversions, duration summing, time range lookup, 180-degree axis break detection, jump cut detection, kinetic motion clashes, exemplary sequence scoring, OTIO JSON validity, CMX 3600 EDL syntax, FCP XML formatting, shot reordering, hero take assignment, and clip trimming.
   - Full test suite: 30 test files, 209/209 tests passing in 5.00s (`npm run test`).
   - Production build: `npm run build` completed in 10.36s with 0 errors and 0 warnings (SequenceTimelineDeck emitted at 34.14 kB).
   - In-browser UI verification: verified via subagent with recording `stage10_sequence_assembly_1792788543682.webp`.

## 2026-10-23 — GLB/GLTF 3D Model Import & Rendering Remediation (`fix/glb-gltf-import-rendering`)

**Goal:** Eliminate fallback placeholder boxes and geometry distortion when importing user `.glb` / `.gltf` 3D models into the soundstage and offline previs renderer.

### Root Causes Addressed

1. **Chromium Data URL Limits & Fetch Errors:** Previous implementation converted uploaded files into Base64 data URIs (`data:model/gltf-binary;base64,...`). Three.js `GLTFLoader.load()` delegates to `FileLoader` (using `fetch()`), which throws `net::ERR_INVALID_URL` for payloads > 2MB and fails on `model/gltf-binary` MIME types. On failure, the procedural bounding box was never replaced.
2. **Transform Composition Order & Off-Center Origins:** Matrix composition order in Three.js is $T \times R \times S$. Translating the raw model root before scaling meant models with remote origins (common in CAD/Sketchfab exports) shifted tens of meters away from origin, appearing as "weird shapes" or disappearing entirely.
3. **Storage Quota Exceptions:** Storing Base64 data strings in `localStorage` caused `DOMException: QuotaExceededError` on files > 3.5MB.
4. **Skinned Mesh Rigging Deformations:** Standard `Object3D.clone(true)` breaks skeletal hierarchies.

### Accomplishments

1. **Persistent Model Storage Engine (`src/services/modelStorage.ts`):**
   - High-performance IndexedDB database (`comfy_director_3d_models_v1`) stores binary `ArrayBuffer` data safely without local storage limits.
   - Zero-latency in-memory cache and active Blob URL lifecycle management (`URL.createObjectURL`).
   - Resilient Base64 decoder (`base64ToArrayBuffer`) and direct file registration (`registerModelFile`).

2. **Universal In-Memory GLTF Loader & Geometric Normalizer (`src/engine/gltfModelLoader.ts`):**
   - In-memory parsing via `GLTFLoader.parse(buffer, ...)` bypassing network stack and URL length limits.
   - Robust normalization (`normalizeGltfScene`): scales to target height first, computes scaled bounding box, centers $(x, z)$ exactly at $(0, 0)$, grounds base at $y=0$, enables shadow casting/receiving, and applies `THREE.DoubleSide` to all materials to prevent backface culling issues.
   - Rig-safe instancing using Three.js `SkeletonUtils.clone()`.

3. **Stage & Parameter UI Integrations (`src/components/`, `src/stores/useAssetLibraryStore.ts`):**
   - `StagePrevis3D.tsx`: Automatically resolves and replaces `__gltf_placeholder__` meshes with loaded models; added drag-and-drop file upload directly onto 3D viewport with glowing indicator; added "Import 3D Model" button to stage toolbar.
   - `PrevisParametersDeck.tsx` & `ActorBlocking.tsx`: Added dedicated "3D Model File (.GLB / .GLTF)" card to Staging Deck and direct file attachment trigger on Actor Blocking cards.
   - `useAssetLibraryStore.ts`: Sanitized persistence to store lightweight `model://${modelId}` pointers.
   - `offlinePrevisRenderer.ts`: Preloads all GLTF assets prior to deterministic frame rendering.

4. **Verification & Tests:**
   - Unit tests (`tests/gltfImport.test.ts`): 6 comprehensive tests verifying Base64 decoding, memory buffer storage, file registration, normalization geometry math, and asset store integration.
   - Full test suite: 31 test files, 215/215 tests passing in 5.11s (`npm run test`).
   - Production build: `npm run build` completed in 10.65s with 0 errors and 0 warnings.
   - In-browser UI verification: verified via subagent with recording `verify_gltf_import_1792789985216.webp`.

## 2026-10-24 — Removal of Arabic Words Across Interface (`fix/remove-arabic-interface-text`)

**Goal:** Eliminate all Arabic text strings, labels, subtitles, and placeholders from user-facing interface elements to ensure a clean, professional English interface.

### Accomplishments

1. **3D Asset Library Modal (`src/components/AssetLibraryModal.tsx`):**
   - Removed `labelAr` from category filter definitions.
   - Replaced Arabic modal subtitle with clean English description: *"Curated 3D Asset Catalog • Full support for GLB/GLTF imports & procedural generation"*.
   - Streamlined AI generation pipeline title to *"AI 3D Model Generation Pipeline"*.
   - Replaced mixed-language input placeholder with English: *"Describe any 3D asset (e.g. green billiard table with pool balls / Victorian grandfather clock)..."*.
   - Updated search input placeholder to English: *"Search 200+ assets (e.g. car, piano, tower, sword)..."*.
   - Removed Arabic `nameAr` subtitles and `dir="rtl"` styling from all 231 asset cards, cleanly displaying the asset's token prompt or archetype details instead.

2. **Previs Parameters Deck (`src/components/PrevisParametersDeck.tsx`):**
   - Removed Arabic subtitle `({shot.environment?.nameAr || 'بلاتوه استوديو تصوير'})` from the Active Scene Setting header in the Environment tab.
   - Removed Arabic `nameAr` label div from all 9 cinematic environment preset buttons.
   - Removed Arabic translation `(تفكيك وإخراج المشهد بالكامل)` from the "Direct 3D Stage from Narrative" action button.

3. **Motion Previs Stage (`src/components/MotionPrevisStage.tsx`):**
   - Removed Arabic keywords from the custom bottom object input placeholder, updating it to *"Custom: Zodiac, Sports Car, Drone, Crate..."*.

4. **Verification & Tests:**
   - Full test suite: 31 test files, 215/215 tests passing in 5.07s (`npm run test`).
   - Production build: `npm run build` completed in 10.43s with 0 errors and 0 warnings.
   - In-browser UI verification: Verified via subagent (recording `verify_no_arabic_1792790821778.webp`, screenshot `3d_asset_library_clean_1792790859491.png`) confirming zero Arabic characters on the soundstage, environment controls, or asset cards.

## 2026-10-24 — Compact 3D Object Nametag Labels & Visibility Toggle (`fix/compact-object-labels`)

**Goal:** Shrink the oversized 3D billboard labels on actors/props and provide an instant one-click toggle in the 3D Stage toolbar.

### Accomplishments

1. **Compact Sprite Banner Scale & Positioning (`src/components/StagePrevis3D.tsx`):**
   - Reduced sprite scale from `10.0 × 2.5` meters down to `1.4 × 0.35` meters (an 86% size reduction), keeping nametags sleek, readable, and proportional to human actors (~1.8m tall).
   - Repositioned the hovering Y-offset from `Math.max(4.5, size.y + 1.8)` down to `Math.max(1.8, size.y + 0.25)`, anchoring tags immediately above the subject rather than floating 4.5 meters in the sky.
   - Upgraded canvas rendering to high-DPI (384 × 96, 4:1) with a dark rounded pill container (`rgba(9, 11, 17, 0.88)`), amber border, and modern sans-serif typography.

2. **One-Click Toolbar Toggle (`src/components/StagePrevis3D.tsx`):**
   - Added `showLabels` state with dynamic Three.js scene sprite traversal.
   - Added a "Labels" button with `Tag` icon to the 3D Soundstage toolbar, allowing directors to toggle nametags on/off with a single click.


## 2026-10-24 — S11 Parametric 3D Sculpt Engine & Image-to-3D Proxy (`stage/11-parametric-sculpt-engine`)

**Goal:** Implement Phase 1 of the parametric 3D figure sculpting engine, reference image silhouette extraction, multimodal vision reasoning, and the interactive Concept-to-3D Studio.

### Accomplishments

1. **Parametric 3D Sculpt Representation (`src/engine/procedural3D/sculptSpec.ts`):**
   - Clean-room `SculptSpec` schema supporting 8 parametric shape types: `blob` (smooth blend between box and ellipsoid via `roundness`), `lathe` (revolved 2D profiles), `extrude` (polygon with bevel depth), `cylinder`, `cone`, `torus`, `tube`, and `capsule`.
   - Standard humanoid bone hierarchy tagging on `SculptPart` (`Head`, `Chest`, `Spine`, `Hips`, `LeftArm`, `RightArm`, `LeftForeArm`, `RightForeArm`, `LeftHand`, `RightHand`, `LeftUpLeg`, `RightUpLeg`, `LeftLeg`, `RightLeg`, `LeftFoot`, `RightFoot`) with mirror symmetry logic.
   - Backward-compatible migrators from legacy `PartGraph` (`partGraphToSculptSpec`, `actorSculptSpec`, `migrateActorSculpt`, `migrateActorsInShot`).
   - Untrusted schema validation and sanitization (`sanitizeSculptSpec`) ensuring robust execution against hallucinated LLM responses.

2. **Deterministic 2D Silhouette Extraction & Truthful IoU (`src/engine/procedural3D/silhouette.ts`):**
   - High-contrast pure mask extraction (`extractMaskFromRgba`, `extractMaskFromImageUrl`) with luminance thresholding and alpha protection.
   - Geometric silhouette measurement (`measureSilhouette`): aspect ratio, center of mass, and 10-band horizontal normalized width profile.
   - Offscreen Three.js orthographic rendering (`renderSculptSilhouette`) with pure geometric fallback for headless test environments.
   - Real calculated 2D Intersection-over-Union (IoU) metric (`computeSilhouetteIoU`) comparing 3D render masks directly to reference silhouettes with zero fabricated scores.

3. **Multimodal Vision Reasoning & VRAM Protection (`src/services/objectReasoner.ts`):**
   - Upgraded reasoner providers (Ollama `/api/chat`, OpenAI `/v1/chat/completions`, and Google Gemini `/models/gemini-*:generateContent`) with multimodal image payload support (`imageBase64`).
   - Zero VRAM clash invariant: sets `keep_alive: 0` on Ollama when vision inputs are processed, immediately releasing vision weights from GPU VRAM to ensure full 24GB availability for ComfyUI LTX-2.5 video generation.
   - Injected geometric silhouette metrics (width profiles and aspect ratios) directly into reasoner prompts.
   - Added iterative revision loop with differential patch application (`applySculptPatch`).

4. **Concept-to-3D Studio (`src/components/AIGenerator3D.tsx`):**
   - Dedicated studio component with reference image dropzone, auto-extracted silhouette preview, directorial prompt suggestions, and real-time interactive Three.js viewport (wireframe, solid, orbit controls).
   - Real-time calculated silhouette match HUD badge (`🎯 XX% Silhouette Match`).
   - Refinement controls and "Auto-Align Silhouette" optimization pass.
   - "Add to Active Scene" and "Save to 3D Library" integration.

5. **Stage & Parameter Deck Integration:**
   - `src/components/AssetLibraryModal.tsx`: Added `✨ Concept-to-3D Studio` header button.
   - `src/components/PrevisParametersDeck.tsx`: Added `✨ AI 3D Generator...` chip in Staging Deck and dual `⚡ LLM Reason` / `✨ 3D Studio...` triggers on actor cards.
   - `src/components/StagePrevis3D.tsx`: Automatically renders `actor.sculpt` with immediate visual updates.
   - `src/stores/useShotStore.ts` & `src/stores/useAssetLibraryStore.ts`: Updated actor schemas and asset store to register and persist `SculptSpec`.

6. **Verification & Tests:**
   - Unit test suites (`tests/sculptSpec.test.ts`, `tests/silhouette.test.ts`, `tests/objectReasonerProviders.test.ts`): 34 tests covering parametric geometry, bone tagging, silhouette analysis, and multimodal API payloads.
   - Full test suite: 32 test files, 229/229 tests passing in 5.31s (`npm run test`).
   - Production build: `npm run build` completed in 10.40s with zero errors and zero warnings.
   - In-browser UI verification: Verified via browser subagent.


## 2026-10-24 — S11 Phase 2: Humanoid Rigging, 2-Bone Analytic IK & Directorial Posing (`stage/11-parametric-sculpt-engine`)

**Goal:** Deliver browser-native character rigging, closed-form 2-bone analytic IK limb solving, floor grounding locks, and interactive soundstage posing handles.

### Accomplishments

1. **Humanoid Skeleton & Hierarchical Binding (`src/engine/kinematics/skeletonHierarchy.ts`):**
   - Standard 19-bone humanoid hierarchy compatible with standard game/Mixamo rigs (Hips, Spine, Chest, Neck, Head, Left/Right Shoulder, Arm, ForeArm, Hand, UpLeg, Leg, Foot).
   - Anatomically scaled bone offsets (`createHumanoidSkeleton`) based on actor height.
   - Rigid sculpt binding (`bindSculptToSkeleton`): reparents tagged sculpt parts (`part.bone`) into corresponding Three.js bones while preserving exact rest transforms in world space.
   - Stylized humanoid stand-in geometry (`createStylizedHumanoidStandin`): generates lightweight, visually distinct joint and limb geometry for actors without a custom sculpt.

2. **Closed-Form 2-Bone Analytic IK Solver (`src/engine/kinematics/twoBoneIKSolver.ts`):**
   - Pure geometric Law of Cosines solver executing in $<0.01\text{ ms}$ per limb on CPU (Zero VRAM impact, 0MB GPU memory overhead, leaving 100% of the 24GB VRAM pool free on the RTX 3090 for ComfyUI video diffusion).
   - Distance clamping with epsilon padding ($d_{\min} = |L_1 - L_2| + \epsilon$, $d_{\max} = L_1 + L_2 - \epsilon$) eliminating mathematical singularity when limbs are fully compressed or extended.
   - Pole vector bend-plane projection with continuity tracking across frames.
   - Cascadeur-style FK update: directly writes local joint quaternions into root and mid bones.
   - `solveLimbIK`: Solves `leftArm`, `rightArm`, `leftLeg`, and `rightLeg` with anatomical default bend poles.
   - `solveLookAt`: Natural gaze tracking distributing orientation between `Neck` (35%) and `Head` (65%).

3. **Floor Grounding & Contact Lock (`src/engine/kinematics/footGroundingLock.ts`):**
   - Ground contact detection and floor clamp ($Y = 0$) preventing foot sliding and interpenetration.
   - One-click `groundBothFeet` utility for natural grounded staging.

4. **Directorial Pose Presets & Lossless Serialization (`src/engine/kinematics/posePresets.ts`):**
   - Curated directorial poses: `neutral-stand`, `aim-pistol`, `crouch-cover`, `stride-mid`, `dialogue-gesturing`, `sitting-chair`, `t-pose`.
   - Lossless serialization: `exportBonePose` and `applyBonePose` mapping quaternions to/from `ActorPose` schema.

5. **Soundstage Interaction & Layer 1 Gizmo Isolation (`src/components/StagePrevis3D.tsx`, `ActorBlocking.tsx`, `PrevisParametersDeck.tsx`):**
   - Interactive IK handles for hands, feet, head, and hips placed on Three.js Layer 1 (Gizmo layer) — visible on soundstage for director interaction, automatically excluded from Viewfinder rendering and offline previs video passes.
   - Real-time limb solving during pointer drag on camera-facing planes with single-gesture undo tracking (`beginGesture` / `endGesture`).
   - Soundstage toolbar toggle button for `IK Posing` with `Activity` icon.
   - Floating glass Posing Deck overlay with pose preset chips, "Ground Feet", and "Reset Pose" actions.
   - Dedicated pose preset selectors on actor cards in `ActorBlocking.tsx` and `PrevisParametersDeck.tsx`.

6. **Verification & Tests:**
   - Unit test suites (`tests/kinematics.test.ts`): 18 tests covering skeleton construction, sculpt binding, stylized stand-in, 2-bone IK solver, distance clamping, lookAt, floor grounding, pose presets, and serialization.
   - Full test suite: 33 test files, 247/247 tests passing in 5.20s (`npm run test`).
   - Production build: `npm run build` completed in 13.30s with zero TypeScript errors and zero warnings.
   - In-browser UI verification: Verified pose presets and stage interactions via browser subagent.


## 2026-10-24 — S11 Phase 3: Procedural Locomotion & ControlNet OpenPose Previs Bridge (`stage/11-parametric-sculpt-engine`)

**Goal:** Deliver trajectory-synchronized procedural humanoid gaits, ControlNet OpenPose multi-pass video rendering in the offline renderer, and execution panel conditioning integration.

### Accomplishments

1. **Trajectory-Synchronized Procedural Locomotion (`src/engine/kinematics/gaitEngine.ts`):**
   - Pure mathematical locomotion cycle engine supporting `walk`, `run`, `sneak`, `idle`, `auto`, and `none`.
   - Speed-dependent automatic gait resolution (idle when stationary, walking when moving $<2.2\text{ m/s}$, running when moving $\ge 2.2\text{ m/s}$).
   - Alternating $180^\circ$ phase stance and swing mechanics with ground floor clamp ($Y=0$) during stance and smooth parabolic leg elevation during swing.
   - Natural pelvic vertical oscillation (double-frequency bob) and lateral weight-bearing sway.
   - Dynamic counter-arm swing and spinal counter-yaw twist maintaining momentum equilibrium.
   - Zero VRAM overhead: executes on CPU in $<0.02\text{ ms}$, preserving all 24GB VRAM on the RTX 3090.

2. **ControlNet OpenPose Previs Pass Renderer (`src/engine/kinematics/openPoseRenderer.ts`):**
   - Transforms 3D humanoid skeleton joint transforms through the 3D viewfinder camera into standard 18-keypoint 2D OpenPose coordinates.
   - Renders anti-aliased, color-coded anatomical limb segments and circular joint markers onto a solid black background matching ControlNet OpenPose standards.

3. **Multi-Pass Offline Previs Video Pipeline (`src/engine/offlinePrevisRenderer.ts`):**
   - Extended `renderOfflinePrevisPasses` with `renderPass: 'all'` and auto-discovery of staged humanoid rigs.
   - Muxes OpenPose video pass into standards-compliant MP4 container alongside RGB viewfinder and inverted Depth passes.

4. **Soundstage & Staging Deck UI Integration (`src/components/StagePrevis3D.tsx`, `ActorBlocking.tsx`, `PrevisParametersDeck.tsx`):**
   - Real-time gait animation active in soundstage playback (`isPlaying`) and during offline previs generation.
   - Soundstage toolbar displays "Download OpenPose" MP4 button whenever an OpenPose pass is rendered.
   - Gait selector button group in floating Posing Deck and actor HUD (`Auto`, `Walk`, `Run`, `Sneak`, `Idle`, `None`).
   - Gait selector dropdowns on actor cards in `ActorBlocking.tsx` and `PrevisParametersDeck.tsx`.

5. **ComfyUI Execution Panel ControlNet Integration (`src/components/ComfyExecutionPanel.tsx`):**
   - Ingests `previsOpenPoseUrl` / `previsOpenPoseBlob` alongside `previsVideoUrl`.
   - Conditioning Pass toggle allows directors to switch between `3D Viewfinder` (RGB/Depth) and `OpenPose Skeleton` video passes for ComfyUI geometric control conditioning.

6. **Verification & Tests:**
   - Unit test suites (`tests/kinematics.test.ts`): 24 tests covering skeletal hierarchy, 2-bone IK solver, floor grounding, pose presets, procedural locomotion gaits, and OpenPose keypoint projection.
   - Full test suite: 33 test files, 253/253 tests passing in 5.24s (`npm run test`).
   - Production build: `npm run build` completed in 10.50s with zero TypeScript errors and zero warnings.
   - In-browser UI verification: Verified gait selection and previs conditioning toggle in browser subagent.

## 2026-10-25 — S12 Standalone Previs Studio (Phase 1: ComfyUI Decoupling & Previs Export Deck)

**Goal:** Pivot from a dual ComfyUI orchestrator into a pure standalone Motion Previs Studio where the core deliverable is an MP4 reference video plate and model prompt bundles (LTX-2.5, MiniMax H3, Seedance 2.0).

1. **Previs Export Deck (`src/components/PrevisExportDeck.tsx`, `App.tsx`):**
   - Mode switcher now exposes `Motion Previs 3D`, `VFX Plate Solver`, `Previs Export Deck`, and `Sequence Assembly`.
   - Elevated in-engine WebGL reference video rendering (`offlinePrevisRenderer.ts` + `mp4-muxer` at 24fps) with real-time progress and direct MP4 download.
   - Engine-optimized prompt cards for LTX-2.5 (DiT narrative pacing), MiniMax H3 (micro-acting formula), and Seedance 2.0 (6-axis coordinate trajectory).
   - Camera keyframe transform matrices and optics parameters exported with 1-click JSON copy.

2. **Decoupled ComfyUI Live Server:**
   - Removed `ComfyUI Studio` tab and red `Comfy offline` status button from the studio header.
   - Replaced server ping modal with clean AI Reasoner settings (Ollama / LlamaCpp / OpenAI / Gemini).
   - Deleted legacy files `ComfyConnectionModal.tsx` and `ComfyExecutionPanel.tsx`.
   - Removed ComfyUI connection blocks from `TakesGrid.tsx`, `DirectorialSteeringModal.tsx`, `AssetLibraryModal.tsx`, and `InAppDebugger.tsx`.
   - Production bundle now contains zero `useComfyStore` references.

3. **Sculpted 3D Character Styling & Silhouette Refinement (`characterTextureProjector.ts`):**
   - Eliminated photographic 2D texture projection decals on the Mixamo humanoid skinned mesh.
   - Applied smooth studio PBR clay maquette materials with sampled character palette tones.
   - Added rich sculptural costume accessories parented to the humanoid skeleton: 3D hair (crown, bangs, bun, braids), circlet, facial features (nose, brow, eyes, ears), linen cowl/scarf, cuirass, quiver with fletched arrows, recurve bow, and cuffed boots.

4. **Verification & Tests:**
   - 37 test suites, 281/281 tests passing (`npm run test`).
   - Production build: `npm run build` completed with zero TypeScript errors.

## 2026-10-25 — S12 Standalone Previs Studio (Phase 2: Modular Decomposition)

**Goal:** Decompose massive monolithic code modules into specialized domain engines (Kinematics Dresser, Staging Textures, Environment Builder, Stage Gizmo Helpers) without breaking any existing features.

1. **Character Dresser Isolation (`src/engine/kinematics/characterDresser.ts`):**
   - Extracted 3D costume accessories (`createRiggedCostumeAccessories`), humanoid dressing (`dressAndTextureHumanoidRig`), and concept loading (`createSkinnedCharacterFromConcept`).
   - Cleanly re-exported from `src/engine/kinematics/characterTextureProjector.ts` and `src/engine/kinematics/index.ts` maintaining 100% backwards compatibility.

2. **Procedural Stage Textures (`src/engine/staging/stageTextures.ts`):**
   - Extracted procedural running-bond terracotta brick canvas texture generator (`createBrickCanvasTexture`).
   - Extracted procedural dark oak parquet wood canvas texture generator (`createWoodParquetCanvasTexture`).

3. **Perimeter Environment Builder Engine (`src/engine/staging/environmentBuilder.ts`):**
   - Extracted `applyGroundSurface` supporting 8 surface types (wet asphalt, concrete, cobblestone, dunes, grass, metal grate, wood parquet, studio floor).
   - Extracted `buildPerimeterEnvironment` supporting 7 environmental themes (Urban Cityscape, Sci-Fi Orbital Bay, Medieval Castle Courtyard, Redwood Forest Clearing, Sahara Desert, Interior Hearth/Chamber, Soundstage Studio).
   - Extracted `setLayerRecursively` helper for Three.js render layers.
   - Deconstructed ~450 lines of complex procedural geometry from `StagePrevis3D.tsx`.

4. **Stage Gizmo & Overlay Helpers (`src/components/stage/stageGizmoHelpers.ts`):**
   - Extracted `disposeObject3D`, `createSpriteBanner`, `createBaseRing`, and `createIKHandleGizmo`.

5. **Universal Subject Mesh Factory (`src/engine/staging/subjectMeshFactory.ts`):**
   - Extracted universal semantic procedural 3D subject/prop mesh factory supporting both positional parameter signatures and `CreateSubjectMeshOptions`.
   - Integrated GLB model caching, procedural primitives, and skinned humanoid rigs with organic deformation.
   - Decoupled 270 lines of subject mesh construction from `StagePrevis3D.tsx`.

6. **Viewfinder Overlays & Frustum HUD (`src/components/stage/StageViewfinderOverlays.tsx`):**
   - Extracted `updateFrustumGeometry` (3D camera frustum wireframe generation) and `<StageViewfinderOverlays />`.
   - Encapsulated active VFX reference badge watermarks, actor choreography bounding boxes, camera-only flight callouts, rule of thirds grid, and optical crosshairs.
   - Decomposed `StagePrevis3D.tsx` from 4,321 lines down to 3,338 lines (>980 lines decomposed) with zero feature loss and 100% preserved visual fidelity.

7. **Multi-Pass Previs Video & Batch Downloader (`PrevisExportDeck.tsx`, `useShotStore.ts`, `StagePrevis3D.tsx`):**
   - Added `previsDepthUrl` and `previsDepthBlob` state and `setPrevisDepth` action to `useShotStore`.
   - Added pass mode selector (`All Passes`, `RGB Only`, `OpenPose Only`, `Depth Only`) defaulting to `all`.
   - Built interactive multi-pass tab switcher: `🎥 RGB Plate`, `🦴 OpenPose`, `🌐 Depth` with live render indicators.
   - Added individual pass MP4 downloads and a 1-click "Download All Passes" batch downloader.

8. **Elimination of Third-Party Exporters (Pure Previs Studio Focus):**
   - Deleted `pipelineExporters.ts` and `tests/pipelineExporters.test.ts` (Blender .py, Runway JSON, Kling JSON, ComfyUI workflow JSON, Seedance pack JSON).
   - Removed `exportBlenderCameraScript` from `cameraMatrixExport.ts` and updated tests.
   - Replaced legacy "Target Pipeline" grid in `PrevisParametersDeck.tsx` with a clean "Previs Video & Export Deck" card.

9. **Legacy UI Label & Callback Cleanups:**
   - Removed outdated "DIFFUSE SHOT IN COMFYUI" reference from `TakesGrid.tsx` empty-state card.
   - Modernized callback props (`onOpenExportDeck`).

10. **Verification & Tests:**
## 2026-10-26 — Truthful Image-to-3D Object Recipe Engine & Complete Brand Neutralization

**Goal:** Ground the 3D generation pipeline strictly in the reference architecture (pure data recipes, beveled boxes, blobs, cylinders, lathes, extrudes with no forced humanoid rigs or complex image projections for props), resolve the bug where uploaded props (like a bag of chips) turned into human characters, and scrub all reference brand names across the repository.

### Accomplishments

1. **Declarative Image-to-Recipe Synthesis (`src/engine/procedural3D/imageToRecipe.ts`):**
   - Built a pure procedural recipe synthesizer translating 2D silhouette metrics and color swatches directly into `SculptSpec` recipes.
   - Built `isHumanoidPrompt`: strictly discriminates between character prompts and props/objects/food/vehicles.
   - Built `buildBagOfChipsRecipe`: models an authentic inflated snack pouch (`blob`, `roundness: 0.65`, `taper: 0.04`), top and bottom crimp seals (`box`), front flavor label, and accent chips with colors sampled from the image.
   - Built `buildBottleRecipe` & `buildBoxPropRecipe` with beveled corners and physical part details.
   - Built `buildUniversalSilhouetteSlicesRecipe`: stacks 8 smooth volumetric clay slices matching the 10-band silhouette width profile and dominant image colors for unclassified props.

2. **AIGenerator3D Truthful Object Pipeline (`src/components/AIGenerator3D.tsx`):**
   - Removed hardcoded humanoid fallback in image processing (`createSkinnedCharacterFromConcept` is no longer called for props/objects).
   - Instant turntable feedback: uploading an image immediately synthesizes a 3D clay object from its metrics and palette.
   - Set default `displayMode` to `'parametric'` for clean tactile PBR material inspection.
   - `handleAddToScene` assigns `kind = 'prop'` and passes `sculpt` to `StagePrevis3D` so the exact 3D model appears on stage.

3. **Complete Brand Neutralization:**
   - Scrubbed all reference brand names across types, comments, material cache keys, clone names, and log strings in `src/` and `tests/`.

4. **Verification & Tests:**
   - Added unit test suite `tests/imageToRecipe.test.ts` (9 tests passing).
   - All 41 test suites, 311/311 tests passing (`npm test`).
   - `npm run build` succeeds with zero TypeScript and bundle errors.

## 2026-10-26 — Multi-Cue Bone Posing, 12fps Stop-Motion & AI Directorial Beats

**Goal:** Transform static shot bone poses into rich, keyframed multi-cue character choreography with SLERP interpolation, authentic stop-motion (12fps on-twos), AI directorial natural language acting generation, and 3D prop bone socketing.

### Accomplishments

1. **Extended Canonical ShotSpec Data Model (`src/types/shotspec.ts`):**
   - Added `pose?: ActorPose`, `posePreset?: string`, `gait?: ActorGait`, `rotation?: Point3D`, and `cueLabel?: string` to `TrajectoryKeyframeSchema`.
   - Added `rotation?: Point3D` and `socketToBone?: ActorSocketSchema` to `ActorSchema`.
   - Added `claymationMode?: boolean` and `claymationFps?: number` to `ShotSpecSchema`.

2. **Kinematic Interpolation & Quaternion SLERP Math (`src/engine/trajectoryMath.ts`):**
   - Implemented `slerpActorPoses(poseA, poseB, t)` with exact Three.js quaternion spherical linear interpolation across all 19 humanoid bones + root linear offset.
   - Implemented `interpolateActorPoseAtTime(trajectory, basePose, time, duration, options?)` with `claymationFps` time quantization for stop-motion cadence.
   - Implemented `interpolateObjectRotationAtTime(trajectory, baseRotation, time, duration)` for 3D props and vehicles.
   - Implemented `recordTrajectoryPoseAtTime` for auto-keying and cue recording.

3. **Expanded Cinematic Pose Presets (`src/engine/kinematics/posePresets.ts`):**
   - Added `aim-bow`, `combat-ready`, `dramatic-lunge`, `hero-kneel`, and `defensive-block` to standard presets.

4. **AI Acting Director Service (`src/services/aiActingDirector.ts`):**
   - Implemented `decomposeActingPromptRules` for instant offline parsing of natural language acting prompts with explicit timestamps (`0s stand, 1.5s draw bow`) or relative clauses.
   - Implemented `generateActingCuesFromPrompt` querying local LLMs (Ollama / llama.cpp / OpenAI) or Gemini with automatic rule-based fallback.

5. **3D Stage Previs & Viewfinder Synchronization (`src/components/StagePrevis3D.tsx`):**
   - Two-pass `syncPositions(t)` evaluating multi-cue humanoid poses via SLERP and socketing props (e.g. bows, swords) to parent bones in world space.
   - Hybrid Auto-Keying: posing when parked near an existing keyframe updates it in-place; or click `◆ Record Pose Cue @ Xs` to record a new cue.
   - Stop-Motion toggle button: `🏺 Claymation (12fps)` in the toolbar.
   - Multi-Cue Timeline Keyframes strip in the Character Posing Deck HUD with instant jump-to-time and deletion chips.
   - Direct Acting Beats (AI) natural language input and generator.
   - Prop / Object Manipulation & Bone Socketing Deck for non-humanoid actors with 3D Pitch/Yaw/Roll nudges and Bone Socketing dropdowns.

6. **Unified Video & Prompt Sync (`src/engine/promptCompiler.ts`):**
   - Integrated timed actor cue labels and pose presets into LTX-2.5, MiniMax H3, and Seedance 2.0 prompts.
   - Added claymation aesthetic and on-twos cadence modifiers when `claymationMode` is enabled.
   - Integrated bone socketing metadata into actor directives.

7. **Verification & Tests:**
   - Added unit test suites `tests/actorPoseInterpolation.test.ts` (5 tests) and `tests/actingAndClaymation.test.ts` (6 tests).
   - All 40 test suites, 302/302 tests passing (`npm test`).
   - Production build: `npm run build` passed with zero TypeScript errors and clean Vite bundle.

## 2026-10-26 — Parameters Deck Drawer Toggle & 3D Library Centralization

**Goal:** Streamline the top header bar and sidebar UI by replacing the top `Parameters Deck >` button with an interactive chevron drawer tab on the sidebar boundary, and centralizing the 3D Asset Library in the Stage panel while eliminating visual clutter from the header, stage lists, and character cards.

### Accomplishments

1. **Collapsible Sidebar Drawer Toggle (`src/App.tsx`):**
   - Removed the `Parameters Deck >` button from the top navigation bar.
   - Added an interactive floating drawer toggle tab on the vertical boundary between the 3D viewport and the right sidebar (`aside`).
   - When the sidebar is open, the tab sits at `right-80` with a `ChevronRight` arrow (click to collapse).
   - When collapsed, the tab smoothly docks at `right-0` with a `ChevronLeft` arrow (click to expand).
2. **Centralized 3D Asset Library Hub (`src/components/PrevisParametersDeck.tsx`):**
   - Centralized the 3D Asset Library inside the Parameters Deck (Stage tab) as a prominent, unified launcher (`📦 3D Asset Library — 200+ Models • AI 3D`).
   - Removed the 3D Library button from the top header bar.
   - Removed the duplicate `📦 3D Library` button from the `Placed on Stage` header.
   - Removed the duplicate `✨ 3D Studio...` button and extra modals from character cards, keeping clean `⚡ LLM Reason 3D Mesh` and GLB upload controls.
3. **Verification:**
   - Full test suite: 40 test files, 302/302 tests passed (`npm test`).
   - Production build: zero TypeScript errors, Vite production bundle compiled in ~11.3s (`npm run build`).

## 2026-10-26 — Kinematics Motion Skills & Film Previs Staging (Greybox + Standees)

**Goal:** Ground the Previs Studio in authentic film previs methodology: deterministic humanoid kinematics (`motionSkills`, `motionCompiler`, `directorialMotionDecomposer`) with foot-grounding locks and natural language directing, plus authentic scene blocking through Greybox Primitives (`cube`, `sphere`, `cylinder`, `capsule`, `cone`, `plane`) and 2D Cutout Standees & Backdrops.

### Accomplishments

1. **Deterministic Kinematics Compiler (`src/engine/kinematics/motionSkills.ts`, `motionCompiler.ts`):**
   - Implemented strict TypeScript discriminated union across all 7 declarative motion skills: `walkTo`, `sitInSeat`, `reachGrip`, `standIdle`, `talkGesture`, `hitReaction`, `exitCar`.
   - Exported typed builder helpers (`walkTo()`, `sitInSeat()`, `reachGrip()`, etc.) with automatic ID assignment and duration defaults.
   - Built deterministic pre-calculated `skillPaths` map eliminating frame-tick boundary corruption and trajectory jumps.
   - Grounding & Anti-slide locks: alternating stance/swing foot locks ($Y \ge 0$) ensuring feet remain fixed during stance phases.
   - Canonical `STANDARD_ACTOR_POSES` (`standing_neutral`, `sitting`, `sitting_chair`, `talking_expressive`) mapping bone quaternions and hip offsets.

2. **Bilingual Directorial Motion Decomposer (`src/engine/kinematics/directorialMotionDecomposer.ts`):**
   - Natural language directing in English and Arabic (`و(يجلس|يمشي|يقف...)`) automatically decomposed into timed declarative motion skills.
   - Coordinate comma protection preventing multi-decimal numbers (`2.5, 3.0`) from premature clause splitting.
   - Scene entity resolution: resolves targets (chairs, tables, props) by name and position.
   - Integrated into `useShotStore.ts` via `applyDirectorialMotion(actorId, prompt)`.
   - Connected to `ActorBlocking.tsx` with interactive "⚡ Compile Motion" button above the prompt textarea.

3. **Greybox Primitives & 2D Standees Staging (`src/engine/staging/greyboxPrimitives.ts`, `cutoutMeshFactory.ts`, `subjectMeshFactory.ts`):**
   - Dedicated Greybox Primitive engine (`cube`, `box`, `sphere`, `capsule`, `cylinder`, `cone`, `plane`) with base grounded at $y = 0$, positive Y height, and PBR matte clay materials.
   - 2D Cutout Standees & Backdrops (`cutout`, `standee`, `backdrop`) as vertical cards with alpha testing (`alphaTest: 0.15`), derived width ($height \times aspect$), shadows, and pedestal floor brackets.
   - Integrated into `subjectMeshFactory.ts` with instant detection, bypassing false humanoid or prop fallback loops.
   - Staging toolbar and empty-stage quick-add buttons in `PrevisParametersDeck.tsx` and `MotionPrevisStage.tsx` (`+👤 Character`, `+🖼️ Standee`, `+⬛ Cube`, `+🏛️ Cylinder`, `+📐 Plane`).

4. **Verification & Testing:**
   - Added unit test suites `tests/motionSkills.test.ts` (12 tests) and `tests/previsPrimitivesAndCutouts.test.ts` (8 tests).
   - Entire Vitest test suite: **45 test files, 379/379 tests passing** (`npm test`).
   - Production build: `npm run build` compiled cleanly with zero TypeScript errors.

## 2026-10-26 — Independent Cue Keyframe Positioning & Timeline Animation

**Goal:** Resolve trajectory keyframing issue where moving an actor at distinct cues/keyframes (e.g. Cue 1 at $X=0$, Cue 2 at $X=50$, Cue 3 at $X=100$) was globally shifting all keyframes together or locking them to a single coordinate instead of producing smooth animated playback between cues.

### Accomplishments

1. **Store Playhead & Transport Sync (`src/stores/useShotStore.ts`, `MotionPrevisStage.tsx`):**
   - Added `currentTime` and `isPlaying` state with setters to `useShotStore`.
   - Wired `MotionPrevisStage`'s local playback loop and scrubber directly to the store so all decks and components are aware of the active playhead time.

2. **Isolated Keyframe Recording (`src/stores/useShotStore.ts`):**
   - Refactored `updateActorPositionAtTime` to execute `recordTrajectoryPositionAtTime` directly whenever modifying an object at $t > 0.15$s or keyframe mode.
   - Prevents base global displacement delta `dx` from shifting other cues on the timeline.

3. **Per-Cue Slider & Quick-Action Binding (`PrevisParametersDeck.tsx`, `ActorBlocking.tsx`):**
   - Sliders and quick-placement buttons (Center, Left, Right, Deep, Fore, Float) now evaluate the actor's position at the active playhead time using `interpolateTrajectoryPosition(actor.trajectory, currentTime, duration)`.
   - Fixed `ActorBlocking.tsx` which had previously hardcoded `time = 0` and mode `'base'`, ensuring user inputs accurately target the active cue/keyframe.
   - Added visual `KEYFRAME` cue indicators at $t > 0.15$s in both decks.

4. **Verification:**
   - All 45 Vitest test suites (379 tests) passing green.
   - Production build cleanly compiled with zero errors.
   - Verified live in browser subagent.

## 2026-10-27 — Restoration of Previs Export Deck & Complete Removal of Sequence Assembly

**Goal:** Fulfill user direction to revert and restore the **Previs Export Deck** while completely removing **Sequence Assembly** across the codebase.

### Accomplishments

1. **Previs Export Deck Fully Restored (`src/components/PrevisExportDeck.tsx`):**
   - Reconstructed and restored `PrevisExportDeck.tsx` with all target model adapters (LTX-2.5, MiniMax H3, Seedance), multi-pass video views (RGB Viewfinder, OpenPose Rig, Volumetric Depth), 720p/1080p resolution toggling, "Render Previs Video", and Directorial Camera Trajectory & Optics metadata card.
   - Restored `'export'` workspace mode and the "Previs Export Deck" header tab in `src/App.tsx`.
   - Restored direct "Open Previs Export Deck ▶" navigation button in the footer of `src/components/PrevisParametersDeck.tsx`.
   - Updated `src/components/WelcomeModal.tsx` workflow cards to showcase "1. 3D Directing Stage" and "2. Previs Export Deck".

2. **Complete Removal of Sequence Assembly:**
   - Deleted `src/components/SequenceTimelineDeck.tsx`, `src/components/SequenceContinuityModal.tsx`, `src/components/SequenceExportModal.tsx`.
   - Deleted `src/stores/useSequenceStore.ts`, `src/engine/timecodeMath.ts`, `src/engine/sequenceExporters.ts`, `src/engine/sequenceContinuityEngine.ts`, `src/types/sequenceTypes.ts`, and `tests/sequenceAssembly.test.ts`.
   - Removed all sequence assembly imports, workspace modes, and action buttons from `src/App.tsx` and `src/components/ShotBible.tsx`.

3. **Verification:**
   - Vitest suite: 46 test files (373 tests) passing 100% green.
   - Production build: `npm run build` compiles with zero errors (bundle output size: 945 kB).
   - In-browser verification: Verified navigation between Directing Stage and Previs Export Deck, prompt compilation, and pass controls.
