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
| S5 Performance | `stage/05-performance` | ✅ merged to master (`9a602b5`) | Smooth 60 FPS drag; main chunk 606 kB (down from 1.76 MB); 2 WebGL contexts |
| S6 UX overhaul | `stage/06-ux-overhaul` | ✅ merged to master (`4094de4`, `eddcb9f`) | Clean at 1280×720 / 1440×900 / 1920×1080 / 2560×1440; responsive sidebars |
| S7 Takes + queue | `stage/07-takes-queue` | ✅ merged to master (`b3d3faf`) | Multi-seed take generator, queue runner, contact sheet, circling hero takes, and A/B comparison |
| S8 Motion fidelity | `stage/08-motion-fidelity` | ✅ merged to master (`f8e3781`) | Optical flow vector analyzer, directional & speed fidelity scoring, visual vector overlay HUD, A/B motion diffing |
| S9 Closed-loop steering | `stage/09-closed-loop-steering` | ✅ merged to master (`fc9865c`) | Optical-flow-driven compensatory patches, prompt auto-correction, IC-LoRA modulation, steering modal, lineage tracking |
| S10 Sequence / Assembly | `stage/10-sequence` | ✅ merged to master (`16d714f`) | Multi-shot timeline, sequential playback, continuity & 180° rule checking, OTIO/EDL/FCPXML NLE exporters |
| S11 Parametric 3D Sculpt Engine | `stage/11-parametric-sculpt-engine` | 🟢 Phase 1 verified | Parametric 3D primitives, reference silhouette matching, multimodal LLM/VLM reasoning, Concept-to-3D Studio |

## S11 checklist (Parametric 3D Sculpt Engine & Image-to-3D Proxy — Phase 1)

- [x] Parametric 3D sculpt schema (`src/engine/procedural3D/sculptSpec.ts`):
  - Parametric primitive types: `blob` (box $\leftrightarrow$ ellipsoid via `roundness`), `lathe` (revolved 2D profiles), `extrude` (polygon with bevel), `cylinder`, `cone`, `torus`, `tube`, `capsule`
  - Humanoid skeletal bone tags on `SculptPart` (`Head`, `Chest`, `Spine`, `Hips`, `LeftArm`, `RightArm`, `LeftForeArm`, `RightForeArm`, `LeftHand`, `RightHand`, `LeftUpLeg`, `RightUpLeg`, `LeftLeg`, `RightLeg`, `LeftFoot`, `RightFoot`) with symmetric Left $\leftrightarrow$ Right mirror swapping
  - Untrusted input sanitization (`sanitizeSculptSpec`), revision patch application (`applySculptPatch`), backward migration from legacy v1 (`partGraphToSculptSpec`), registry storage (`registerSculptSpec`, `lookupSculptSpec`, `removeSculptSpec`), and actor migration (`actorSculptSpec`, `migrateActorSculpt`, `migrateActorsInShot`)
- [x] Deterministic 2D silhouette extraction & measurement (`src/engine/procedural3D/silhouette.ts`):
  - Pure mask extraction (`extractMaskFromRgba`), image URL mask loading (`extractMaskFromImageUrl`), HUD mask visualizer (`generateMaskDataUrl`)
  - Geometric silhouette measurement (`measureSilhouette`): aspect ratio, center of mass, 10-band normalized width profile
  - Offscreen Three.js orthographic rendering (`renderSculptSilhouette`) with headless rasterizer fallback
  - Real 2D Intersection-over-Union calculation (`computeSilhouetteIoU`) with zero fabricated scores
- [x] Multimodal LLM/VLM vision reasoning (`src/services/objectReasoner.ts`):
  - Enhanced Ollama, OpenAI-compatible, and Gemini providers with multimodal vision payload support (`imageBase64`)
  - Zero VRAM clash invariant: sets `keep_alive: 0` on Ollama when vision inputs are present, immediately unloading vision weights from GPU to protect RTX 3090 24GB VRAM pool for ComfyUI LTX-2.5
  - Geometric silhouette measurement injection (`measureSilhouette` width profile and aspect ratio into reasoner prompt)
  - Iterative revision loop (`opts.reviseSpec` applying `applySculptPatch` to refine models against silhouette)
- [x] Concept-to-3D Studio UI (`src/components/AIGenerator3D.tsx`):
  - Reference Image upload dropzone with auto-silhouette preview and toggle
  - Prompt text box with quick directorial suggestion chips
  - Live Three.js interactive canvas preview (orbit rotation, zoom, wireframe/solid toggle)
  - Real calculated 2D silhouette match HUD badge (`🎯 XX% Silhouette Match`)
  - Refine & Revise controls + "Auto-Align Silhouette" button (runs optimization pass keeping best IoU)
  - "Add to Active Scene" and "Save to 3D Library" action buttons
- [x] Soundstage & Parameter Deck Integration:
  - `src/components/AssetLibraryModal.tsx`: Integrated `AIGenerator3D` under prominent `✨ Concept-to-3D Studio` header button
  - `src/components/PrevisParametersDeck.tsx`: Added `✨ AI 3D Generator...` button in quick suggestion chips row; updated actor card procedural mesh deck to dual buttons: `⚡ LLM Reason` (passing `conceptImageUrl` if present) and `✨ 3D Studio...` (pre-seeding `AIGenerator3D` with actor token and reference image)
  - `src/components/StagePrevis3D.tsx`: Updated to check `actor.sculpt || actor.partGraph`, rebuilding the 3D figure on stage immediately when `sculpt` is assigned
  - `src/stores/useShotStore.ts` & `src/stores/useAssetLibraryStore.ts`: `addActor` supports `sculpt` in options; `useAssetLibraryStore` uses `SculptSpec`
- [x] Unit test suites (`tests/sculptSpec.test.ts`, `tests/silhouette.test.ts`, `tests/objectReasonerProviders.test.ts`):
  - 34 tests covering parametric shapes, humanoid bone tagging, silhouette mask extraction, IoU calculation, Ollama keep_alive VRAM safety, and multimodal payloads
- [x] Full Verification:
  - 32 test files, 229/229 tests passing (`npm run test`)
  - Production build: `npm run build` completed with zero TypeScript errors and bundle generated cleanly
  - In-browser UI verified via subagent


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

- [x] Owner approval → merge `stage/03-editing-safety` to `master` (`65978dd`)

## S4 checklist (Geometric Conditioning & Deterministic In-App Previs)

- [x] Deterministic offline previs video renderer (`src/engine/offlinePrevisRenderer.ts`) with fixed 24 FPS delta stepping, eliminating real-time `MediaRecorder` + `setTimeout` dropped frames
- [x] Offscreen WebGL canvas rendering without UI overlays (axes, markers, debug labels cleanly isolated)
- [x] High-performance WebCodecs / MP4 muxer pipeline (`mp4-muxer`) outputting authentic ISO BMFF `.mp4` video files with WebM canvas fallback
- [x] Depth conditioning pass generator (`src/engine/previsPassGenerator.ts`) with linear metric depth inversion
- [x] LTX-2.5 geometric conditioning adapter & timeline patcher with 8n+1 frame rule compliance
- [x] Previs parameter controls & HUD in `src/components/ComfyExecutionPanel.tsx` (mode selector, IC-LoRA strength, camera model weights)
- [x] Previs download & plate injection actions in `src/components/MotionPrevisStage.tsx`
- [x] Unit test suites (`tests/geometricConditioning.test.ts`, `tests/offlinePrevisRenderer.test.ts`)
- [x] Owner approval → merge `stage/04-geometric-conditioning` to `master` (`cb27783`)

## S5 checklist (Performance & Memory Optimization)

- [x] Rollup `manualChunks` bundle splitting in `vite.config.ts` (`vendor-three`, `vendor-react`, `vendor-icons`, `vendor-muxer`)
- [x] Reduced main bundle from 1,760 kB down to 606 kB (65% reduction)
- [x] Lazy loading with `Suspense` for secondary dialogs and panels in `src/App.tsx`
- [x] Halved active WebGL contexts from 4 down to 2 in `src/components/StagePrevis3D.tsx` by instantiating only active visible viewports
- [x] Hot-path debounced storage persistence in `src/stores/useShotStore.ts` during 60 FPS interactions
- [x] Zustand selector fine-tuning with `useShallow` preventing wasteful re-renders
- [x] Performance test suite (`tests/performance.test.ts`) with 163/163 passing tests
- [x] Owner approval → merge `stage/05-performance` to `master` (`9a602b5`)

## S6 checklist (UX Overhaul & Multi-Resolution Clean Layout)

- [x] Relax Electron window bounds in `electron/main.cjs` (`minWidth: 1024`, `minHeight: 680`) for clean rendering on 1280×720 and 1024-wide displays without OS clipping
- [x] Responsive collapsible sidebars (`isLeftSidebarOpen`, `isRightSidebarOpen`) with smooth 200ms transitions and header toggle buttons (`Bible`, `Deck`) in `src/App.tsx`
- [x] Dynamic active scene binding in Studio Header (`Scene 01 - Arrival / Shot 01A Tracking In`) updating truthfully on scene/shot selection
- [x] Fully functional timeline trim range handles in `src/components/MotionPrevisStage.tsx` constraining playback ticker `loop()` between `inTime` and `outTime`
- [x] Working volume and mute controls in `src/components/MotionPrevisStage.tsx`: video element volume/muted synchronization with toggleable `Volume2` / `VolumeX` button
- [x] Replaced remote Unsplash filmstrip URL with 100% offline procedural dark cinema filmstrip with sprocket perforations and frame numbers
- [x] Eliminated all native blocking `alert()` calls across `VFXVideoDeck.tsx`, `ShotBible.tsx`, and `ComfyExecutionPanel.tsx`, replacing them with `logger.warn`/`logger.error` and styled in-app dismissible banners
- [x] Full test pass (26 test files, 163/163 tests green) and production build pass (0 errors, 0 warnings)
- [x] Multi-resolution browser verification via subagent across 1280×720, 1440×900, and 1920×1080
- [x] Owner approval → merge `stage/06-ux-overhaul` to `master` (`4094de4`, `eddcb9f`)

## S7 checklist (Takes Grid & Generation Queue)

- [x] Multi-seed take generator (`src/pipeline/generationQueue.ts`): batch count selector (1, 3, 5 takes) with sequential (`+1`) and random seed strategies
- [x] State-machine generation queue processor: manages `queued`, `running`, `completed`, `failed`, `cancelled` states, auto-advances sequentially through jobs, and supports per-item cancellation and clearing the queue
- [x] Reactive Zustand queue store (`src/stores/useQueueStore.ts`) synchronizing queue state with UI components
- [x] Takes Contact Sheet / Grid (`src/components/TakesGrid.tsx`): visual card grid for all takes of the active shot with filter to view all shots, thumbnail video previews, and seed/engine/mode/profile badges
- [x] Circling hero takes: `isCircled` toggle (⭐) and 0–5 star ratings persisted safely in `useHistoryStore.ts`
- [x] Direct active plate assignment: `setTakeAsActivePlate` in `src/stores/useShotStore.ts` injecting selected take video into the 3D Soundstage and Video Deck
- [x] Synchronized A/B player comparison modal (`src/components/TakeComparisonModal.tsx`):
  - Side-by-side dual viewport view
  - Split wipe comparison slider with interactive draggable divider handle
  - Master synchronized transport controls: simultaneous play/pause, synchronized timeline scrubber, speed presets (`0.25x`, `0.5x`, `1.0x`), Spacebar shortcut, and loop toggle
  - Staging & camera parameter deviation traceability table
  - Direct "Circle Take" and "Set as Active Plate" actions for both Take A and Take B
- [x] Unit test suite (`tests/takesAndQueue.test.ts`): 10 tests covering batch enqueueing, seed strategies, cancellation, queue clearing, retries, take numbering, circling, rating, plate assignment, and parameter diffing
- [x] In-browser UI verification via subagent with screenshots (`takes_contact_sheet_1792784795432.png`)

## S8 checklist (Motion Fidelity Scoring & Optical Flow Analysis)

- [x] Grounded optical flow motion vector analyzer (`src/engine/motionFidelityAnalyzer.ts`):
  - Block-matching optical flow with contrast/variance gating and textureless patch handling
  - Radial divergence calculation for forward/backward dolly moves (`dolly-in` expansion vs `dolly-out` contraction)
  - Directional alignment scoring comparing achieved pixel flow against 3D camera trajectory (accounting for camera move to background flow inversion)
  - Speed & magnitude fidelity scoring against camera speed profiles (`slow-cinematic`, `moderate`, `rapid-dynamic`) with static movement penalties
  - Stability scoring measuring directional and velocity variance across sampled frames
  - 0–100% weighted composite fidelity score and classification (`excellent`, `good`, `fair`, `drift`)
  - Directorial guidance engine generating concrete prompt adjustments and IC-LoRA conditioning recommendations
- [x] Visual vector field HUD & overlay (`src/components/MotionFidelityOverlay.tsx`):
  - SVG optical flow motion arrow overlay displaying direction and magnitude per grid point
  - "Directed vs. Achieved" trajectory radar bar (`DIRECTED: DOLLY-IN` → `ACHIEVED: DOLLY-IN`)
  - Color-coded score badge with classification and vector toggle button
  - Expandable directorial details popover with metric breakdown and targeted advice
- [x] Takes Grid integration (`src/components/TakesGrid.tsx`):
  - Real-time client-side video frame sampling via offscreen Canvas 2D
  - Per-take "Score Motion Fidelity" / status badge with live progress reporting (`Scoring (XX%)...`)
  - Vector overlay embedded over take video previews
- [x] A/B comparison modal integration (`src/components/TakeComparisonModal.tsx`):
  - Side-by-side vector overlay rendering with master `Vectors: ON/OFF` toggle in header
  - Motion Fidelity Comparison block in parameter diff drawer comparing overall score, detected movement, directional match, and speed match
- [x] Unit test suite (`tests/motionFidelity.test.ts`): 13 tests covering expected vector mapping, speed scaling, motion classification, block matching, scoring, drift detection, static shot penalties, and store persistence
- [x] Full validation: 28 test files, 186/186 tests passing in 4.8s; production build green with 0 errors in 10.2s; in-browser UI verified via subagent
- [x] Owner approval → merge `stage/08-motion-fidelity` to `master` (`f8e3781`)

## S9 checklist (Closed-Loop Directorial Auto-Steering & Prompt Auto-Correction)

- [x] Closed-Loop Directorial Steering Engine (`src/engine/directorialSteeringEngine.ts`):
  - Inferred root-cause diagnosis from optical flow classification and vector divergence (`drift`, `static_drift`, `velocity_mismatch`, `subtle_drift`)
  - Compensatory positive prompt verb reinforcements with cinematic action clauses and weighted emphasis (e.g. `(deliberate camera pan-left, steady pan-left tracking shot:1.35)`)
  - Counter-steering negative prompt anti-motion token suppression (e.g. suppressing opposite drift vectors like `camera pan right` or static frames)
  - Geometric IC-LoRA conditioning modulation (+0.20–0.25x boost to lock background geometry to 3D previs)
  - Deterministic RNG seed offsetting to escape drift attractor basins
  - Pure helper functions `applySteeringPatchToShot` and `calculateFidelityImprovement`
- [x] Directorial Closed-Loop Auto-Steering Modal (`src/components/DirectorialSteeringModal.tsx`):
  - Diagnostic context card displaying source take fidelity score, root cause analysis, and applied directives list
  - Visual side-by-side diff comparing original vs steered positive and negative prompts
  - IC-LoRA conditioning modulation and target RNG seed indicators
  - Dual action buttons: "Apply to Active Shot" and "Apply & Queue Steered Re-Take"
- [x] Queue & Lineage Integration:
  - Extended `ShotRevisionV2` (`src/pipeline/revisionTypes.ts`) with `steeredFromTakeId` and `steeringPatch`
  - Integrated `defaultGenerationQueue` (`src/pipeline/generationQueue.ts`) to forward steering provenance into created take revisions
  - Added "STEERED (+XX%)" lineage badges on take cards in Takes Grid (`src/components/TakesGrid.tsx`)
  - Interactive "Auto-Steer" button directly on take cards and optical flow overlay popover (`src/components/MotionFidelityOverlay.tsx`)
  - Closed-loop steering comparison banner in A/B comparison modal (`src/components/TakeComparisonModal.tsx`)
- [x] Unit test suite (`tests/directorialSteering.test.ts`):
  - 8 comprehensive tests covering directional drift counter-steering, static camera locking, dolly push-in radial reinforcement, velocity amplification, seed offsetting, ShotSpec application, fidelity delta calculation, and queue lineage persistence
- [x] Full validation:
  - 29 test files, 194/194 tests passing in 4.89s (`npm run test`)
  - Production build: `npm run build` completed with zero TypeScript errors and bundle created cleanly
  - In-browser UI verified via subagent with recording `stage9_steering_verify_1792787404162.webp`
- [x] Owner approval → merge `stage/09-closed-loop-steering` to `master` (`fc9865c`)

## S10 checklist (Multi-Shot Timeline & Sequence Assembly)

- [x] Canonical Sequence Models & SMPTE Math:
  - Defined `CinematicSequence`, `SequenceShotItem`, `SequenceTransition`, and `SequenceContinuityReport` (`src/types/sequenceTypes.ts`)
  - SMPTE Non-Drop Frame timecode conversion (`HH:MM:SS:FF`), fractional second parsing, and timeline range mapping (`src/engine/timecodeMath.ts`)
- [x] Automated Cinematic Continuity & Pacing Engine (`src/engine/sequenceContinuityEngine.ts`):
  - 180-degree rule axis violation detection between adjacent shots
  - Discontinuous jump cut detection (identical focal length, shot size, and camera angle)
  - Kinetic motion clash analysis (opposing pan/tilt/dolly velocity whiplash)
  - Lighting palette & mood discrepancy detection
  - Aspect ratio mismatch detection
  - Pacing cadence & duration analysis (monotonous pacing, flash cuts < 1s, dragging takes > 10s)
  - Composite continuity score (0–100%) and directorial ratings (`exemplary`, `sound`, `needs_coverage`, `disjointed`)
- [x] Professional NLE Timeline Exporters (`src/engine/sequenceExporters.ts`):
  - OpenTimelineIO (`.otio`) Schema 1.0 JSON export with full clip tracks, rational time ranges, media targets, and directorial metadata
  - CMX 3600 EDL (`.edl`) SMPTE non-drop frame edit decision list with clip names and hero take notes
  - Apple Final Cut Pro 7 / DaVinci Resolve XML (`.xml`) timeline export
- [x] Sequence State Management (`src/stores/useSequenceStore.ts`):
  - Multi-shot timeline state, timecode scrubbing, sequential playback, shot reordering, clip trimming, hero take bindings, and safe local persistence
- [x] Interactive UI Components:
  - Sequence Assembly workspace mode in top navigation bar (`src/App.tsx`)
  - Master sequence playback viewport with HUD (timecode, slate, camera move, hero take) and sequential player transport (`src/components/SequenceTimelineDeck.tsx`)
  - NLE multi-track timeline deck with zoomable time ruler, playhead marker, shot blocks, reorder buttons, hero take picker, and cut transition pills (`src/components/SequenceTimelineDeck.tsx`)
  - Directorial Continuity & Pacing Report Modal (`src/components/SequenceContinuityModal.tsx`)
  - Professional NLE Timeline Export Modal (`src/components/SequenceExportModal.tsx`)
  - Shot Bible integration: added one-click "Assemble Scene in Sequence Timeline" button to scene headers (`src/components/ShotBible.tsx`)
- [x] Unit Test Suite (`tests/sequenceAssembly.test.ts`):
  - 15 comprehensive tests covering SMPTE conversions, duration summing, time range lookup, 180-degree axis break detection, jump cut detection, kinetic motion clashes, exemplary sequence scoring, OTIO JSON validity, CMX 3600 EDL syntax, FCP XML formatting, shot reordering, hero take assignment, and clip trimming
- [x] Full Verification:
  - 30 test files, 209/209 tests passing in 5.00s (`npm run test`)
  - Production build: `npm run build` succeeded with 0 errors in 10.36s (SequenceTimelineDeck chunk emitted at 34.14 kB)
  - Browser verification verified via subagent with recording `stage10_sequence_assembly_1792788543682.webp`
- [x] Owner approval → merge `stage/10-sequence` to `master` (`16d714f`)

## Deferred findings (tracked for later stages)

| Finding | Stage | Status |
|---|---|---|
| VFX "pose" passes are template stick figures on brightness blobs; 4 made-up actors when nothing detected → replace with ComfyUI DWPose / DepthAnythingV2 | S1 / S4 | Done (S4) |
| In-app previs render: real-time MediaRecorder + `setTimeout` pacing, stale closures (`currentTime`, `showGrid`), `.mp4` name on WebM output | S4 | Done (S4) |
| `src/services/directorExecutor.ts` is dead code | S1 | Done (S1) |
| `vfxReference.videoUrl` blob URLs persisted, dead after reload | S2 | Done (S2) |
| Inconsistent `typeof window` guards (cast pool gated, shot cache not) | S2 | Done (S2) |
| localStorage origin split between `file://` and dev server in Electron | S2 | Done (S2) |
| Google Fonts from CDN (blocks strict CSP) → self-host | S2 | Done (S2) |
| Electron global `Access-Control-Allow-Origin: *` injection; auto-load of `localhost:5173` | S2 | Done (S2) |
| 4 WebGL contexts (2 renderers × 2 `StagePrevis3D` instances) | S5 | Done (S5) |
| Trim range / volume controls may be no-ops; hardcoded "SCENE 01"; `minWidth` 1100; backtick handler eats input typing; `alert()` in VFXVideoDeck | S6 | Done (S6) |
| Importing GLB/GLTF models produces generic box or distorted shape ("weird shape") | Fix | Done (`fix/glb-gltf-import-rendering`) |
| Remove Arabic words from interface elements | Fix | Done (`fix/remove-arabic-interface-text`) |
| Compact 3D object nametag labels & toolbar visibility toggle | Polish | Done (`fix/compact-object-labels`) |

## GLB/GLTF 3D Model Import & Rendering Checklist

- [x] IndexedDB + Memory Storage Service (`src/services/modelStorage.ts`):
  - In-memory `ArrayBuffer` & active Blob URL cache for zero-latency loading
  - IndexedDB storage (`comfy_director_3d_models_v1`) to evade browser `localStorage` 5MB quota errors
  - Resilient `base64ToArrayBuffer` and `registerModelFile` utilities
- [x] Universal In-Memory GLTF/GLB Loader & Normalization (`src/engine/gltfModelLoader.ts`):
  - In-memory `ArrayBuffer` parsing using `GLTFLoader.parse` (bypasses browser `fetch()` errors on `data:model/gltf-binary` URIs and 2MB Chromium limits)
  - True bounding box normalization (`normalizeGltfScene`): scales first, centers horizontal $(x, z)$ at $(0, 0)$, grounds base at $y=0$, enables shadows and `THREE.DoubleSide`
  - Skeleton-safe cloning via `three/examples/jsm/utils/SkeletonUtils.js`
- [x] Asset Library Store Integration (`src/stores/useAssetLibraryStore.ts`):
  - Updated `uploadGlbFile` to register models through `registerModelFile`
  - Sanitized `persistCustomAssets` to store compact `model://${modelId}` references without `QuotaExceededError`
- [x] Viewport & 3D Stage Direct Rendering (`src/components/StagePrevis3D.tsx`):
  - Replaces `__gltf_placeholder__` geometry with normalized 3D mesh cleanly upon load
  - Drag-and-drop viewport upload zone with glowing visual feedback
  - Direct "Import 3D Model" button in soundstage toolbar
- [x] Parameter Decks & Actor Staging Controls (`src/components/PrevisParametersDeck.tsx`, `src/components/ActorBlocking.tsx`):
  - Added dedicated "3D Model File (.GLB / .GLTF)" card to Staging Deck
  - Added direct 3D model attachment trigger on Actor Blocking cards
- [x] Deterministic Offline Previs Renderer Preloading (`src/engine/offlinePrevisRenderer.ts`):
  - Added `modelUrls` to `PrevisRenderOptions` and preloads GLTF models before frame capture loop
- [x] Comprehensive Unit Test Suite (`tests/gltfImport.test.ts`):
  - 6 unit tests covering Base64 decoding, memory buffer storage, file registration, normalization geometry math, and asset store integration
- [x] Full Verification:
  - 31 test files, 215/215 tests passing (`npm run test`)
  - Production build: `npm run build` completed with zero TypeScript errors and bundle generated cleanly
  - In-browser UI verified via subagent with recording `verify_gltf_import_1792789985216.webp`

