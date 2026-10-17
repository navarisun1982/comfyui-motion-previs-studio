# AI Director Studio — Risk Register & Mitigation Strategy

**Last Updated**: October 17, 2026  
**Status**: Active Governance Document

---

## 1. Technical & Environment Risks

| Risk ID | Description | Severity | Probability | Impact | Mitigation Strategy |
|:---|:---|:---|:---|:---|:---|
| `RISK-01` | **VRAM Exceedance during video diffusion** (e.g., LTX-2.5 22B) | High | Medium | GPU Out-Of-Memory error during sampling | ComfyUI already has `--reserve-vram 3` and SageAttention enabled. The LTX-2.5 INT8 transformer checkpoint is specifically tuned for 24GB GPUs. Restrict default resolution to 768x432 / 848x480 for fast iterative generation and provide explicit memory warnings. |
| `RISK-02` | **ComfyUI Server Disconnection or Port Conflict** | Medium | Low | UI cannot submit prompts or poll progress | Robust ping check on startup with fallback to local mock adapter; auto-reconnect WebSocket; port configuration setting in UI. |
| `RISK-03` | **Custom Node Schema Mismatch** | Medium | Low | ComfyUI refuses prompt JSON if node signature changes | Standardized workflow builder using tested node types (`LTXDirector`, `LTXVConditioning`, `SaveVideo`, `SamplerCustomAdvanced`). Fallback to canonical core nodes. |
| `RISK-04` | **Long Generation Latency in Dev/Testing** | Medium | High | Slow test cycles and blocked CI | Build a comprehensive `MockModelAdapter` with deterministic instant preview outputs for fast unit and UI tests. Never block testing on 60-second video renders. |
| `RISK-05` | **Hallucinated Camera Movement in Video Models** | Medium | Medium | Generated video doesn't match director's exact vector | Use capability-aware adapter to clearly communicate to user which controls are strictly enforced vs. prompt-guided. No fake claims of millimeter-precision tracking. |
| `RISK-06` | **Competition Deadline (Oct 30, 9am PT)** | High | Medium | Incomplete submission or missed requirements | Strict MVP boundaries: Focus on single-shot directing, rock-solid ComfyUI execution, deterministic previs, and Director Diff. Avoid scope creep. |

---

## 2. Contingency Plans

1. **If ComfyUI crashes during high-res render**: The UI catches the error via WebSocket `execution_error` or HTTP timeout and presents actionable advice (e.g., "Reduce duration from 5s to 3s or lower resolution to 768x432").
2. **If user runs on machine without GPU**: Application auto-detects system state; allows full directorial workflow creation, previs, timeline planning, prompt compilation, and workflow export with Mock Engine.
3. **If WebSocket disconnects mid-generation**: Reconnection loop reconnects and queries `/history/{prompt_id}` to retrieve completed outputs without re-submitting.
