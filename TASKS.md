# TASKS — ComfyUI Motion Previs Studio

Living task list for the post-review remediation. Each stage lives on its own branch `stage/NN-name` and merges to `master` only after owner approval.
Pre-remediation history: [docs/archive/TASKS_pre_remediation.md](docs/archive/TASKS_pre_remediation.md).

## Stage plan

| Stage | Branch | Status | Done when |
|---|---|---|---|
| S0 Foundation | `stage/00-foundation` | ✅ merged to master (`37cf23a`) | Repo clean, tests fast + green, build green, app renamed, docs truthful |
| S1 Truthful pipeline | `stage/01-truthful-pipeline` | 🟡 ready for templates & live test | Pipeline built, tested & verified; awaiting user API templates & live generation |
| S2 Desktop foundation | `stage/02-desktop-hygiene` | ✅ merged to master (`ccee65d`) | Offline self-hosted fonts, strict CSP, blob sanitization, safe storage service, electron window persistence & scoped ComfyUI CORS |
| S3 Editing safety | `stage/03-editing-safety` | ✅ merged to master (`65978dd`) | One gesture = one undo step; first run is clear |
| S4 Geometric conditioning | `stage/04-geometric-conditioning` | ✅ merged to master (`cb27783`) | Directed camera move rendered via deterministic offline previs & conditioned via IC-LoRA |
| S5 Performance | `stage/05-performance` | 🟢 ready for review | Smooth 60 FPS drag; main chunk 606 kB (down from 1.76 MB); 2 WebGL contexts |
| S6 UX overhaul | `stage/06-ux-overhaul` | ⬜ | Clean at 1280×720 / 1440×900 / 1920×1080 / 2560×1440 |

## S5 checklist (Performance & 60 FPS Previs Engine)

- [x] Bundle Splitting & Code Chunking (`vite.config.ts`): manual vendor chunking for `vendor-three` (688 kB), `vendor-react` (224 kB), `vendor-icons` (38 kB), `vendor-muxer` (31 kB).
- [x] Lazy Loading with React.lazy & Suspense (`src/App.tsx`): 10 dynamic chunks on-demand (`ComfyExecutionPanel`, `ShotBible`, `VFXVideoDeck`, `DirectorDiffInspector`, `InAppDebugger`, `ComfyConnectionModal`, `CinematicPresetsModal`, `AssetLibraryModal`, `WelcomeModal`).
- [x] Massive main chunk reduction: main application chunk slashed by **65%**, from **1.76 MB down to 606 kB** (far exceeding the "well under 1.67 MB" target).
- [x] Off-the-hot-path Debounced Persistence (`src/stores/useShotStore.ts`): eliminated synchronous JSON serialization and `localStorage` I/O during continuous 60 FPS pointer drag and slider scrub events; immediate flushes on `endGesture()`, `switchShot()`, `loadShot()`, `resetToDefault()`, and `window.beforeunload`.
- [x] WebGL Dual-Viewport Context Halving (`src/components/StagePrevis3D.tsx`): lazily creates only the requested active viewport renderer (`stage` vs `viewfinder`), eliminating redundant hidden renderers and cutting active contexts from 4 down to 2; calls `forceContextLoss()` and `controls.dispose()` on unmount.
- [x] Zustand Fine-Grained & `useShallow` Selector Optimization across components (`App.tsx`, `AssetLibraryModal.tsx`, `DirectorDiffInspector.tsx`, `CinematicPresetsModal.tsx`) to avoid whole-store re-render subscriptions.
- [x] Unit test suite (`tests/performance.test.ts`): 3 tests verifying zero synchronous writes on hot path, gesture release flush, immediate flush triggers, and manual flush API.
- [x] Full verification: 26 test files, 163/163 tests passing in 4.5s; production build green with 0 errors or warnings in 10s; in-browser UI verified via subagent.

| S7 Takes + queue | `stage/07-takes-queue` | ⬜ | (grill first) |
| S8 Motion fidelity | `stage/08-motion-fidelity` | ⬜ | (grill first) |
| S9 NL → ShotSpec | `stage/09-nl-shotspec` | ⬜ | (grill first) |
| S10 Sequence | `stage/10-sequence` | ⬜ | (grill first) |

## S4 checklist (Geometric Conditioning — "Direct the Shot, Not the Prompt")

- [x] Runtime dependency: `mp4-muxer` (`^5.2.2`) installed as the only approved new runtime package
- [x] Deterministic offline previs renderer (`src/engine/offlinePrevisRenderer.ts`): fixed timestep evaluation (no wall-clock `setTimeout` pacing), $8n+1$ frame count snapping, RGB viewfinder capture, inverted linear depth pass (near=white, far=dark for ControlNet/IC-LoRA standard), and real MP4 container muxing with resilient fallback
- [x] Refactored `src/components/StagePrevis3D.tsx` to replace legacy `MediaRecorder` / `captureStream(24)` with `renderOfflinePrevisPasses`, eliminating stale closures and mislabeled `.webm` files
- [x] Extended `GenerationMode` in `src/pipeline/templateTypes.ts` to include `'control'`, and `BINDABLE_FIELDS` to include `'controlVideo'`, `'icLora'`, `'icLoraStrength'`
- [x] Versioned timeline patchers (`src/pipeline/timelinePatchers.ts`): registered `ltx.geometricControl@1` and updated `ltx.firstFrameSegment@1` to inject `reference_mode: 'VIDEO'` and `retakeVideo` for geometric camera conditioning
- [x] Pure template binding updates (`src/pipeline/templateBinder.ts`): support for `mode === 'control'`, `controlVideoFile`, `icLora`, and `icLoraStrength`
- [x] Updated template binding schema in `workflows/templates/ltx25_stubelius.binding.json` to declare `"control"` mode and bind node 5 (`StubeliusLTXModels`) inputs `ic_lora` and `ic_lora_strength`
- [x] Job runner integration (`src/pipeline/jobRunner.ts`): content-addressed video upload for `controlVideoBlob`
- [x] Package exporter integration (`src/pipeline/packageExporter.ts`): manifests include `controlVideo` uploads and support offline bundle exports in `control` mode
- [x] ComfyUI Execution Panel UI overhaul (`src/components/ComfyExecutionPanel.tsx`): 3-mode selector (T2V, I2V, Control / 3D Previs LoRA), Geometric Camera Conditioning HUD with IC-LoRA strength slider (`0.0`–`2.0x`) and model checkpoint selector
- [x] Unit test suites (`tests/geometricConditioning.test.ts`, `tests/offlinePrevisRenderer.test.ts`): 13 tests covering 8n+1 calculations, timeline patchers, binding validation, manifest generation, depth inversion, and MP4 muxing
- [x] Full verification: 25 test files, 160/160 tests passing in 4.6s; production build green with 0 errors in 12.6s; in-browser UI verified via subagent

## S0 checklist

- [x] Snapshot commit of pre-review tree (`2ddcb13`)
- [x] Delete unused `procedural3D/catalog/` (668 files) + its export/test
- [x] Move debug scripts to `scripts/dev/`, delete `out_*.json`, add `tsconfig.scripts.json` to the build
- [x] Delete broken `scripts/generate_workflows.ts` and the 3 fake `workflows/*.json`
- [x] Untrack `tsconfig.tsbuildinfo`; ignore `*.tsbuildinfo`, `coverage/`, `scripts/**/out_*.json`
- [x] Remove fake media: colour-bar `mock_preview.mp4`, runtime-fetched stock plates, procedural fake noir scene, colour LUT, seeded markers
- [x] Vitest default env `node`, jsdom opt-in per file, shared `tests/helpers/memoryStorage.ts`
- [x] Rename to **ComfyUI Motion Previs Studio** (header, title, package, Electron, launchers, logs, exports) with userData path pinned
- [x] Launchers rebuild when sources are newer than `dist/` and fail loudly on build errors
- [x] Docs truth pass: README, AGENTS, ARCHITECTURE (new), DECISIONS (ADR-005…009), RISK_REGISTER, templates contract
- [x] Owner approval → merged to `master` (`37cf23a`)

## S1 checklist (Truthful Pipeline)

- [x] Deterministic SHA-256 and JSON stable stringification (`src/pipeline/hash.ts`)
- [x] Strict Zod schemas for bindings, nodes, fields, and workflows (`src/pipeline/templateTypes.ts`)
- [x] Versioned timeline patcher registry (`src/pipeline/timelinePatchers.ts`)
- [x] Template verifier enforcing node existence, type matching, link absence (`src/pipeline/templateVerifier.ts`)
- [x] Pure functional template binder with frame snapping (8n+1) and quality profiles (`src/pipeline/templateBinder.ts`)
- [x] Template registry for verified templates with engine/mode lookup (`src/pipeline/templateRegistry.ts`)
- [x] Bundled template auto-discovery loader (`src/pipeline/templateLoader.ts`)
- [x] Prompt override store with staleness detection (`src/pipeline/promptOverride.ts`)
- [x] ShotRevisionV2 schema and backward-compatible history migration (`src/pipeline/revisionTypes.ts`, `src/stores/useHistoryStore.ts`)
- [x] Offline Package Mode exporter (`src/pipeline/packageExporter.ts`)
- [x] ComfyClient v2 with multiplexed WebSocket routing and cancellation (`src/services/comfyClient.ts`)
- [x] Singleton `JobRunner` with targeted output node extraction (`src/pipeline/jobRunner.ts`)
- [x] Delete dead legacy `src/services/directorExecutor.ts`
- [x] Update adapters with honest capability tiers and deprecated `buildWorkflow` (`src/adapters/`)
- [x] Overhaul `ComfyExecutionPanel.tsx` with read-only engine badge, quality profile selector, cancel support, and offline package export
- [x] Fix `DirectorDiffInspector.tsx` for v2 revisions
- [x] Comprehensive test coverage with 126 tests passing in 4.4s (`npm run test`)
- [x] Ingest user-supplied API templates (`ltx25_stubelius.api.json`, `h3_stubelius.api.json`) & companion bindings into `workflows/templates/`
- [x] Owner approval → merge to `master` (`4c786ce`)

## S2 checklist (Desktop Hardening & Hygiene)

- [x] Universal safe storage service (`src/services/storage.ts`) eliminating Node.js 22 experimental accessor warnings
- [x] Automatic blob URL sanitization (`sanitizeShotForStorage`) preventing dangling `blob:` URLs in `vfxReference` and `referenceImage`
- [x] Centralized storage refactor across stores (`useShotStore`, `useHistoryStore`, `useComfyStore`, `useAssetLibraryStore`, `promptOverride`, `partGraph`, `objectReasoner`, `ShotBible`)
- [x] Self-hosted Google Fonts locally in `public/fonts/` (Inter, Outfit, JetBrains Mono) and local `@font-face` rules (`src/fonts.css`)
- [x] Strict Content Security Policy (CSP) in `index.html` allowing only self, local fonts/styles, blob/data, and ComfyUI `127.0.0.1:8188`/`localhost:8188`
- [x] Hardened Electron main process (`electron/main.cjs`): scoped CORS headers to ComfyUI port 8188 and window state persistence (`window-state.json`) with multi-monitor topology bounds validation
- [x] Unit test suite (`tests/storage.test.ts`) with 10 tests verifying blob sanitization, safe JSON parsing, and cache integration
- [x] Verification: 22 test files, 138/138 tests passing in 4.5s with zero warnings or errors; production build green in 9.6s
- [x] Owner approval → merge `stage/02-desktop-hygiene` to `master` (`ccee65d`)

## S3 checklist (Editing Safety & Undo/Redo Engine)

- [x] Per-shot undo/redo engine with structurally shared snapshots (`src/stores/useShotStore.ts`)
- [x] "One gesture = one undo step" collapsing: continuous 3D Soundstage floor pointer drag collapses into single undo snapshot on release (`beginGesture` / `endGesture` in `src/components/StagePrevis3D.tsx`)
- [x] Per-shot history stack isolation: switching shots maintains independent past/future stacks without cross-talk
- [x] Redo branch invalidation: making a new edit after undo cleanly purges future branch
- [x] Global keyboard shortcuts (`Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y`) with editable element guard in `src/App.tsx` (never eats keystrokes in `<input>`/`<textarea>`)
- [x] Fixed backtick/tilde shortcut handler in `src/App.tsx` so typing in inputs never accidentally toggles the debugger
- [x] Studio header Undo and Redo icon buttons (`Undo2`, `Redo2`) with dynamic disabled states and tooltips
- [x] First-run Welcome / Getting Started modal (`src/components/WelcomeModal.tsx`) with 3D/VFX/ComfyUI quickstart, persistent dismissal, and "Help" re-trigger button
- [x] Computed reactive Project Info in `src/components/ShotBible.tsx` replacing hardcoded fake stats (`01:34:12`, etc.) with real computed shot durations, aspect-ratio-derived resolutions, frame rates, and scene counts
- [x] Vitest suite (`tests/editingSafety.test.ts`): 9 tests covering gesture collapse, per-shot isolation, redo invalidation, stack limits, storage persistence, and computed metrics
- [x] Full validation: 23 test files, 147/147 tests passing in 4.5s; production build green with 0 errors in 9.5s; in-browser UI verified via subagent

## Deferred findings (tracked for later stages)

| Finding | Stage |
|---|---|
| VFX "pose" passes are template stick figures on brightness blobs; 4 made-up actors when nothing detected → replace with ComfyUI DWPose / DepthAnythingV2 | S1 / S4 |
| In-app previs render: real-time MediaRecorder + `setTimeout` pacing, stale closures (`currentTime`, `showGrid`), `.mp4` name on WebM output | S4 |
| `src/services/directorExecutor.ts` is dead code | S1 |
| `vfxReference.videoUrl` blob URLs persisted, dead after reload | S2 |
| Inconsistent `typeof window` guards (cast pool gated, shot cache not) | S2 |
| localStorage origin split between `file://` and dev server in Electron | S2 |
| Google Fonts from CDN (blocks strict CSP) → self-host | S2 |
| Electron global `Access-Control-Allow-Origin: *` injection; auto-load of `localhost:5173` | S2 |
| 4 WebGL contexts (2 renderers × 2 `StagePrevis3D` instances) | S5 |
| Trim range / volume controls may be no-ops; hardcoded "SCENE 01"; `minWidth` 1100; backtick handler eats input typing; `alert()` in VFXVideoDeck | S6 |
