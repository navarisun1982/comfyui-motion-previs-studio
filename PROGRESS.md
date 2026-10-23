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
