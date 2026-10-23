# TASKS — ComfyUI Motion Previs Studio

Living task list for the post-review remediation. Each stage lives on its own branch `stage/NN-name` and merges to `master` only after owner approval.
Pre-remediation history: [docs/archive/TASKS_pre_remediation.md](docs/archive/TASKS_pre_remediation.md).

## Stage plan

| Stage | Branch | Status | Done when |
|---|---|---|---|
| S0 Foundation | `stage/00-foundation` | ✅ merged to master (`37cf23a`) | Repo clean, tests fast + green, build green, app renamed, docs truthful |
| S1 Truthful pipeline | `stage/01-truthful-pipeline` | 🟡 ready for templates & live test | Pipeline built, tested & verified; awaiting user API templates & live generation |
| S2 Desktop foundation | `stage/02-desktop-foundation` | ⬜ | Electron + browser work with no CORS hacks; keys never in localStorage; reload loses nothing |
| S3 Editing safety | `stage/03-editing-safety` | ⬜ | One gesture = one undo step; first run is clear |
| S4 Geometric conditioning | `stage/04-geometric-conditioning` | ⬜ | Directed dolly-in reproduced through IC-LoRA control template on the 3090 |
| S5 Performance | `stage/05-performance` | ⬜ | Smooth drag; main chunk well under 1.67 MB |
| S6 UX overhaul | `stage/06-ux-overhaul` | ⬜ | Clean at 1280×720 / 1440×900 / 1920×1080 / 2560×1440 |
| S7 Takes + queue | `stage/07-takes-queue` | ⬜ | (grill first) |
| S8 Motion fidelity | `stage/08-motion-fidelity` | ⬜ | (grill first) |
| S9 NL → ShotSpec | `stage/09-nl-shotspec` | ⬜ | (grill first) |
| S10 Sequence | `stage/10-sequence` | ⬜ | (grill first) |

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
