# AI Director Studio — Operational Instructions & Persistent Agent Memory

This document is the **operational manual** for any AI agent session working on the **AI Director Studio** repository.

---

## 1. Core Mission & Competition Context
- **Project**: AI Director Studio ("Direct the Shot, Not the Prompt").
- **Competition**: ComfyUI Open Source Higgsfield Competition (Deadline: Oct 30, 2026, 9:00 AM PT).
- **Target Prizes**: Best Overall ($10k), Most Innovative (RTX 5090), Open Weights Only (RTX 5090), VFX Workflow Built with LTX ($2,000 cash).
- **Primary Model**: LTX-2.5 (22B Distilled INT8) running locally on NVIDIA RTX 3090 (24GB VRAM) via ComfyUI on `http://127.0.0.1:8188`.

---

## 2. Environment Invariants & Hard Rules
1. **OS**: Windows 11.
2. **Shell Execution**: **ALWAYS** use `cmd /c` for all terminal commands (e.g. `cmd /c "npm test"`). This ensures processes exit cleanly with proper EOF.
3. **PowerShell Quoting**: If passing commands with `&&` or quotes, always wrap the inner string in double quotes: `cmd /c "command1 && command2"`.
4. **Environment Protection**:
   - **NEVER** modify, upgrade, or uninstall packages in `D:\conda_envs\comfyui` or `D:\ComfyUI`.
   - **NEVER** overwrite or delete existing models in `D:\ComfyUI\models`.
   - **NEVER** kill or restart the active ComfyUI server without explicit approval.
5. **No Fake Success**: Never simulate or fake video outputs in production modes. When using the Mock Engine in development/testing, clearly identify it as the Mock Engine.
6. **Documentation Maintenance**: After significant milestones, always update [TASKS.md](file:///e:/work/Comfy%20AI%20Director/TASKS.md) and [PROGRESS.md](file:///e:/work/Comfy%20AI%20Director/PROGRESS.md).

---

## 3. Directory Layout
- `docs/`: Technical specifications, requirements, architecture, ADRs, risk register.
- `src/`:
  - `components/`: UI components (Stage Previs, Camera Deck, Actor Blocking, Timeline, Diff Inspector).
  - `types/`: Canonical `ShotSpec` schemas and Zod validators.
  - `engine/`: Director Engine, Previs math, Prompt compiler.
  - `adapters/`: Model adapters (`ltxAdapter.ts`, `minimaxAdapter.ts`, `mockAdapter.ts`).
  - `services/`: ComfyUI REST & WebSocket communication clients.
  - `stores/`: Zustand state management (`useShotStore.ts`, `useHistoryStore.ts`, `useComfyStore.ts`).
- `workflows/`: Exported, tested ComfyUI workflow JSON files.

---

## 4. Testing & Verification Checklist
Before declaring any phase complete:
1. `cmd /c "npm run test"` must pass.
2. `cmd /c "npm run build"` must pass with zero TypeScript or bundle errors.
3. Verify actual UI interactions and ComfyUI integration behavior.
