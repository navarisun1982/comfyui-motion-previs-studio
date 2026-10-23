# Workflow templates

Drop **tested** ComfyUI workflows here, exported in **API format** (ComfyUI → *Workflow → Export (API)*).

| Template id | File | Engine / mode |
|---|---|---|
| `ltx25-t2v` | `ltx25-t2v.api.json` | LTX-2.5 text-to-video |
| `ltx25-i2v` | `ltx25-i2v.api.json` | LTX-2.5 image-to-video |
| `ltx25-control` | `ltx25-control.api.json` | LTX-2.5 layout + depth control (IC-LoRA) |
| `h3-fl2va` | `h3-fl2va.api.json` | MiniMax H3 first/last-frame to video |
| `h3-ref2va` | `h3-ref2va.api.json` | MiniMax H3 reference to video |
| `h3-t2v` | `h3-t2v.api.json` | MiniMax H3 text-to-video |

For each template, a sibling `<id>.binding.json` (authored in S1) maps studio fields such as prompt, negative prompt, seed, frames, resolution, and input media to exact `{ nodeId, inputName, classType }` targets.

**Rules**
- Templates are used **as exported**. The studio only writes the bound inputs.
- Every binding is verified before queueing: the node exists, `class_type` matches, and the input exists. Any mismatch is a hard, readable error, never a silent guess.
- If you re-export a template after editing it in ComfyUI, the bindings are re-verified automatically. If node ids changed, the studio will tell you which binding broke.
