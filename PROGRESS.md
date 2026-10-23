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



