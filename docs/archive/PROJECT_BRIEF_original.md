# AI Director Studio — Project Brief

> **"Direct the Shot, Not the Prompt"**  
> An open-source, visual cinematic directing application built for the ComfyUI Open Source Higgsfield Competition (October 2026).

---

## 1. Executive Summary

Existing generative video interfaces force creators to act as "prompt gamblers," blindly composing descriptive strings and hoping the model guesses the intended camera angle, actor movement, and pacing.

**AI Director Studio** transforms AI video generation into a **true directorial environment**:
- **Visual Cinematic Controls**: Real-world camera physics (focal length, sensor size, shot size, camera trajectory, dolly/truck/crane/pan/tilt/orbit, speed easing).
- **Actor Blocking & Trajectory**: Drag-and-drop actor positions, paths, and action start times.
- **Deterministic 2D Previsualization**: An interactive SVG film stage showing the camera frustum and actor trajectories in motion before spending any GPU cycles.
- **Structured ShotSpec**: Immutable, Zod-validated data model capturing pure directorial intent.
- **Model-Aware Direction Engine**: Intelligently compiles `ShotSpec` into model-specific workflows and prompts, clearly categorizing controls as **Native**, **Approximated**, or **Unsupported**.
- **Real ComfyUI Execution**: Submits real workflows to ComfyUI, monitors progress via WebSockets, and retrieves generated MP4 videos.
- **Director Diff**: Side-by-side comparison of shot revisions (parameters, prompt tokens, and generated video outputs).

---

## 2. Competition Targets

- **Deadline**: October 30, 2026 at 9:00 AM Pacific Time.
- **Award Targets**:
  1. **Best Overall** ($10,000)
  2. **Most Innovative** (NVIDIA RTX 5090)
  3. **Open Weights Only** (NVIDIA RTX 5090) — via native local LTX-2.5 INT8 distilled pipeline.
  4. **LTX VFX Bonus** ($2,000 cash) — LTX as core video model.

---

## 3. Technology Stack

- **Frontend Core**: React 19, TypeScript, Vite
- **Styling & Aesthetics**: Tailwind CSS, Lucide Icons, Glassmorphism, Cinematic Dark Theme
- **State & Schema**: Zustand, Zod
- **Previsualization**: Responsive Interactive SVG Vector Engine
- **Backend Bridge**: ComfyUI REST API & WebSocket Client (Port 8188)
- **Testing**: Vitest, React Testing Library, Playwright
- **Hardware Integration**: Local NVIDIA RTX 3090 (24GB VRAM), Python 3.12 (Conda)
