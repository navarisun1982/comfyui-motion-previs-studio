# ComfyUI Open Source Higgsfield Competition — Official Requirements & Compliance Matrix

**Competition Website**: [https://comfy.org/open-source-higgsfield](https://comfy.org/open-source-higgsfield)  
**Submission Form**: [https://form.typeform.com/to/V1dSQrkS](https://form.typeform.com/to/V1dSQrkS)  
**Verified On**: October 17, 2026  
**Status**: Verified Live from `comfy.org/open-source-higgsfield.md`

---

## 1. Timeline & Deadlines

| Milestone | Date / Time | Status |
|:---|:---|:---|
| **Registration Opens** | October 15, 2026 | Active |
| **Build Period** | October 15 – October 30, 2026 | In Progress |
| **Submission Deadline** | **October 30, 2026 at 9:00 AM Pacific Time (PT)** | Hard Cutoff |
| **In-Person Build Nights** | SF: Oct 28, 2026 (Frontier Tower) / LA: Oct 29, 2026 | Optional |
| **Winners Announced** | November 6, 2026 (Featured on comfy.org/hub) | Target |

---

## 2. Prize Categories & Strategic Targeting

| Category | Award | Eligibility Criteria | AI Director Studio Alignment |
|:---|:---|:---|:---|
| **Best Overall** | **$10,000 Cash** | Best overall build. Every entry is automatically considered. | **Primary Target**: Real end-to-end directorial studio with deterministic previs and diffing. |
| **Most Innovative** | **NVIDIA GeForce RTX 5090** | App that's never been done; novel custom node packs or uses of ComfyUI. Demo video must explain why submission is innovative. | **Primary Target**: "Direct the Shot, Not the Prompt" paradigm, 2D Stage Previs + ShotSpec + capability-aware compiler + Director Diff. |
| **Open Weights Only** | **NVIDIA GeForce RTX 5090** | No partner nodes or closed-source APIs, open-weights models only. | **Targeted Workflow Mode**: Native LTX-2.5 (22B distilled INT8) open weights pipeline running locally on RTX 3090. |
| **Most Viral** | **NVIDIA GeForce RTX 5090** | Delightful to use and made to be shared. | Secondary: Intuitive UI, instant visual feedback, shareable shot presets. |
| **VFX Workflow Built with LTX** | **$2,000 Cash (OSS Bonus)** | LTX must be the core video model in the workflow to qualify. | **Targeted Bonus**: Full LTX-2.5 video model integration with camera & cinematic directing parameters. |
| **Built with FLUX** | $1,000 / $500 / $250 API credits | FLUX 3 must be core model. | Future adapter. |
| **Built with MiniMax H3** | $1,000 API credits | MiniMax H3 must be core model. | Secondary adapter (installed locally on host). |

> [!IMPORTANT]
> **Category Double-Eligibility**: Each entry is eligible for **both a main category and a model-provider bonus category** (e.g. Best Overall / Most Innovative + LTX VFX Bonus).

---

## 3. Mandatory Submission Deliverables

- [ ] **Working Creative Application**: A real, usable interface (not a mockup or prompt generator) that controls ComfyUI video generation with demonstrable outputs.
- [ ] **Comfy Developer Platform / API Usage**: Uses Comfy API, Comfy Router, and/or Comfy SDK to trigger executions, upload inputs, and retrieve outputs.
- [ ] **Public GitHub Repository**:
  - Open-source permissive license (MIT / Apache 2.0).
  - Clean, documented application source code.
  - Exported ComfyUI workflow JSON files (API format & UI format).
  - Reproducible, step-by-step local installation and run instructions.
- [ ] **Demonstration Video**: Maximum 2 minutes (<= 120 seconds).
  - Must show the application in action.
  - Must explain how it was built and why it is innovative ("Direct the shot, not the prompt").
- [ ] **Public Social Media Post**: Public post (X/Twitter, LinkedIn, YouTube) linking to the demo video with `#OpenSourceHiggsfield`.
- [ ] **Legal & Ethical Standards**:
  - Strictly SFW (Safe For Work).
  - Free from unauthorized third-party IP and protected likenesses.
  - One submission per person.
- [ ] **Optional / Recommended**: Publicly accessible demo or web deployment (with local fallback).

---

## 4. Requirement Verification Matrix

| Requirement ID | Description | Acceptance Criteria | Compliance Status |
|:---|:---|:---|:---|
| `REQ-01` | Working UI Interface | User can adjust camera angle, movement, focal length, actor position, action timing. | `IN_PROGRESS` (Phase 1/2) |
| `REQ-02` | Reference Image Input | User can upload/drag reference image; uploaded to ComfyUI `/upload/image`. | `PLANNED` (Phase 3) |
| `REQ-03` | Deterministic Previs | 2D stage with camera frustum, actor token, trajectories; 0 AI credits needed. | `PLANNED` (Phase 2) |
| `REQ-04` | Structured ShotSpec | Strict JSON schema (Zod validated) separating direction intent from engine specifics. | `PLANNED` (Phase 1) |
| `REQ-05` | Model Capability Adapter | Classifies controls as: Native, Approximated (via prompt syntax), Unsupported. | `PLANNED` (Phase 2) |
| `REQ-06` | Real ComfyUI Execution | Submits prompt to ComfyUI `/prompt`, tracks via WebSocket, retrieves MP4 from `/view`. | `PLANNED` (Phase 3) |
| `REQ-07` | Director Diff | Compare two shot revisions side-by-side: parameters, compiled prompt, video output. | `PLANNED` (Phase 4) |
| `REQ-08` | Open Weights / LTX Compliance | Qualified workflow runs on local open-weight LTX-2.5 model with no closed APIs. | `PLANNED` (Phase 3/5) |
| `REQ-09` | Error Resilience & Recovery | Clear error states for offline ComfyUI, missing models, VRAM issues, or bad inputs. | `PLANNED` (Phase 3) |
| `REQ-10` | 2-Minute Demo Video | Script, storyboard, and screen recordings showing end-to-end user journey. | `PLANNED` (Phase 5) |
