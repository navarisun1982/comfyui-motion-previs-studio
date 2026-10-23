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

4. **Verification:**
   - Test suite: 21 test files, 126 tests passing in 4.4s (`npm run test`).
   - TypeScript & build: 0 errors across main project and scripts (`npm run build`).
   - In-browser UI: verified and screenshotted at `http://127.0.0.1:5173`.

