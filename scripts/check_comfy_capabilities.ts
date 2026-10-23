async function checkComfy() {
  try {
    const res = await fetch('http://127.0.0.1:8188/object_info');
    const data = await res.json();
    const keys = Object.keys(data);
    console.log('Total ComfyUI nodes installed:', keys.length);
    console.log('LTX nodes:', keys.filter(k => /ltx/i.test(k)));
    console.log('3D / Mesh nodes:', keys.filter(k => /3d|mesh|tripo|shap|trellis/i.test(k)));
    console.log('Depth nodes:', keys.filter(k => /depth/i.test(k)));
    console.log('Video / VHS nodes:', keys.filter(k => /vhs|video/i.test(k)).slice(0, 15));
  } catch (err: any) {
    console.error('Failed to query ComfyUI:', err.message);
  }
}
checkComfy();
