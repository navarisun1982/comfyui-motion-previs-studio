# ComfyUI Motion Previs Studio — Operational Instructions & Persistent Agent Memory

This document is the **operational manual** for any AI agent session working on the **ComfyUI Motion Previs Studio** repository (folder name `Comfy AI Director` is historical).

---

## 1. Core Mission & Competition Context
- **Project**: ComfyUI Motion Previs Studio ("Direct the Shot, Not the Prompt").
- **Competition**: ComfyUI Open Source Higgsfield Competition (Deadline: Oct 30, 2026, 9:00 AM PT).
- **Target Prizes**: Best Overall ($10k), Most Innovative (RTX 5090), Open Weights Only (RTX 5090), VFX Workflow Built with LTX ($2,000 cash).
- **Engines**: LTX-2.5 (22B Distilled INT8) and MiniMax H3, both local open weights, on an NVIDIA RTX 3090 (24GB VRAM) via ComfyUI at `http://127.0.0.1:8188`. Seedance is **prompt-export only** (no local weights).

---

## 2. Environment Invariants & Hard Rules
1. **OS**: Windows 11.
2. **Shell Execution**: **ALWAYS** use `cmd /c` for all terminal commands (e.g. `cmd /c "npm test"`). This ensures processes exit cleanly with proper EOF.
3. **PowerShell Quoting**: If passing commands with `&&` or quotes, always wrap the inner string in double quotes: `cmd /c "command1 && command2"`. For anything with nested quotes or paths containing spaces, write a small `.ps1` script and run it with `powershell -NoProfile -ExecutionPolicy Bypass -File`.
4. **Environment Protection**:
   - **NEVER** modify, upgrade, or uninstall packages in `D:\conda_envs\comfyui` or `D:\ComfyUI`.
   - **NEVER** overwrite or delete existing models in `D:\ComfyUI\models`.
   - **NEVER** start, kill, or restart the ComfyUI server. The user runs it; ask when a live check is needed.
5. **No Fake Success**: There is **no mock engine**. Never simulate, fabricate, or mislabel outputs (videos, CV passes, analysis results, project info). If something cannot run (e.g. ComfyUI offline), say so plainly and offer a real alternative (e.g. export package).
6. **Dependencies**: The only approved new runtime dependency is `mp4-muxer` (S4). Anything else needs explicit user approval.
7. **Documentation Maintenance**: After each stage, update [TASKS.md](file:///e:/work/Comfy%20AI%20Director/TASKS.md) and [PROGRESS.md](file:///e:/work/Comfy%20AI%20Director/PROGRESS.md). Historical logs live in `docs/archive/`.
8. **Arabic Typography & RTL Flow**: Always present Arabic responses and directorial feedback with RTL (Right-to-Left) alignment in mind, wrapping pure Arabic blocks in `<div dir="rtl">` where beneficial to prevent bidirectional punctuation and code block distortion.
9. **No Unapproved Removal of Existing Functions or UI Controls (MANDATORY)**: **NEVER** remove, hide, or omit any existing function, feature, or UI control without explicit user permission or asking the user directly beforehand that a proposed action will result in removing or hiding things.

---

## 3. Git Workflow
- Trunk is **`master`**.
- One branch per stage: `stage/NN-name` (e.g. `stage/01-truthful-pipeline`). Small, focused commits.
- A stage is merged into `master` **only after the user approves** the stage walkthrough.
- Do not renormalize line endings (CRLF/LF warnings are expected; a renormalize would create a repo-wide diff).

---

## 4. Directory Layout
- `docs/`: Architecture, competition requirements, ADRs, risk register. `docs/archive/` holds pre-remediation logs.
- `src/`:
  - `components/`: UI (Motion Previs Stage, 3D Stage, Camera Deck, VFX deck, ComfyUI panel, Diff Inspector).
  - `types/`: Canonical `ShotSpec` schemas.
  - `engine/`: Previs math, prompt compiler, procedural 3D, VFX analysis, exporters.
  - `adapters/`: Engine adapters (`ltxAdapter.ts`, `minimaxAdapter.ts`, `seedanceAdapter.ts`).
  - `services/`: ComfyUI REST/WebSocket client, LLM reasoner clients.
  - `stores/`: Zustand stores (`useShotStore`, `useHistoryStore`, `useComfyStore`, `useLogStore`, `useAssetLibraryStore`).
- `workflows/templates/`: **User-supplied, tested** ComfyUI workflows (see §5).
- `scripts/`: `check_comfy_capabilities.ts`; `scripts/dev/` holds ad-hoc diagnostics. All scripts are type-checked by `npm run build` (`tsconfig.scripts.json`).
- `tests/`: Vitest suite. Default environment is `node`; files needing a DOM opt in with `// @vitest-environment jsdom`. Use `tests/helpers/memoryStorage.ts` (`installMemoryStorage()`) instead of assigning `globalThis.localStorage`.

---

## 5. Workflow Templates Contract (S1+)
- Each engine mode is driven by a ComfyUI **API-format** workflow exported by the user: `workflows/templates/<id>.api.json`.
- Next to it, a binding file `workflows/templates/<id>.binding.json` maps ShotSpec fields to `{ nodeId, inputName }` and also records the node's `class_type`.
- At bind time, every binding is verified against the template (node exists, `class_type` matches, input exists). On any mismatch, **refuse with a clear error**. Never guess.
- Workflow graphs are **never hand-generated in code**.

---

## 6. Testing & Verification Checklist
Before declaring any stage complete:
1. `cmd /c "npm run test"` must pass.
2. `cmd /c "npm run build"` must pass with zero TypeScript or bundle errors (includes the scripts type-check).
3. Verify actual UI interactions in the browser; verify ComfyUI integration live (ask the user to start ComfyUI). Mark anything not verified live as **"verify live"**.
