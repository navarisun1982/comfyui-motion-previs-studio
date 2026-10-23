# ComfyUI Motion Previs Studio — Risk Register & Mitigation Strategy

**Last Updated**: October 23, 2026  
**Status**: Active Governance Document

---

## 1. Technical & Environment Risks

| Risk ID | Description | Severity | Probability | Impact | Mitigation Strategy |
|:---|:---|:---|:---|:---|:---|
| `RISK-01` | **VRAM Exceedance during video diffusion** (e.g., LTX-2.5 22B) | High | Medium | GPU Out-Of-Memory error during sampling | ComfyUI already has `--reserve-vram 3` and SageAttention enabled. The LTX-2.5 INT8 transformer checkpoint is specifically tuned for 24GB GPUs. Restrict default resolution to 768x432 / 848x480 for fast iterative generation and provide explicit memory warnings. |
| `RISK-02` | **ComfyUI Server Disconnection or Port Conflict** | Medium | Low | UI cannot submit prompts or poll progress | Ping check with a clear "ComfyUI not running at <url>" state and Retry; auto-reconnect WebSocket; offline **Package mode** exports the bound workflow + passes + manifest (S1). No mock fallback. |
| `RISK-03` | **Custom Node Schema Mismatch** | Medium | Low | ComfyUI refuses prompt JSON if node signature changes | Workflows come from user-exported, tested templates; bindings record `class_type` + input names and are verified before every queue; mismatch is a hard, readable error (S1). |
| `RISK-04` | **Long Generation Latency in Dev/Testing** | Medium | High | Slow test cycles and blocked CI | Unit tests target pure functions (compiler, bindings, previs math) in the fast `node` Vitest environment (~8 s suite); generation is verified live, separately, and marked "verify live" until done. |
| `RISK-05` | **Hallucinated Camera Movement in Video Models** | Medium | Medium | Generated video doesn't match director's exact vector | Use capability-aware adapter to clearly communicate to user which controls are strictly enforced vs. prompt-guided. No fake claims of millimeter-precision tracking. |
| `RISK-06` | **Competition Deadline (Oct 30, 9am PT)** | High | Medium | Incomplete submission or missed requirements | Strict MVP boundaries: Focus on single-shot directing, rock-solid ComfyUI execution, deterministic previs, and Director Diff. Avoid scope creep. |

---

## 2. Contingency Plans

1. **If ComfyUI crashes during high-res render**: The UI catches the error via WebSocket `execution_error` or HTTP timeout and presents actionable advice (e.g., "Reduce duration from 5s to 3s or lower resolution to 768x432").
2. **If user runs on machine without GPU**: Full blocking, previs, timeline planning, prompt compilation, and workflow/package export still work; generation clearly states it needs a running ComfyUI.
3. **If WebSocket disconnects mid-generation**: Reconnection loop reconnects and queries `/history/{prompt_id}` to retrieve completed outputs without re-submitting.
