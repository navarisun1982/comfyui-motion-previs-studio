/**
 * End-to-end probe of the object reasoner: prompt -> local LLM -> PartGraph -> Three.js geometry.
 * Usage: npx vite-node scripts/dev/probe_reasoner.ts "espresso machine" [model]
 */
import * as THREE from 'three';
import { reasonObject, setReasonerConfig } from '../../src/services/objectReasoner';
import { buildPartGraph } from '../../src/engine/procedural3D/partGraph';

const args = process.argv.slice(2);
const model = args.find((a) => a.startsWith('--model='))?.slice(8);
const prompt = args.filter((a) => !a.startsWith('--')).join(' ') || 'espresso machine';

(globalThis as any).localStorage ??= (() => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
})();
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const provider = flag('provider') as 'ollama' | 'llamacpp' | 'openai' | 'gemini' | undefined;
if (provider || model || flag('url') || flag('key')) {
  setReasonerConfig({ provider, model, url: flag('url'), apiKey: flag('key') ?? process.env.REASONER_API_KEY });
}

const graph = await reasonObject(prompt, { onStage: (s) => console.log('stage:', s) });
console.log(`\n"${prompt}" -> route=${graph.route} name="${graph.name}" height=${graph.heightMeters}m parts=${graph.parts.length} materials=${graph.materials.length} time=${graph.source?.ms}ms model=${graph.source?.model}`);
console.log('identity:', graph.identity);
if (graph.walker) console.log('walker:', JSON.stringify(graph.walker));
for (const p of graph.parts) {
  console.log(
    `  ${p.id.padEnd(24)} ${p.shape.padEnd(9)} size=${JSON.stringify(p.size)} pos=${JSON.stringify(p.position)} rot=${JSON.stringify(p.rotation)} mat=${p.material}${p.mirrorX ? ' [mirrorX]' : ''}${p.parent ? ' <- ' + p.parent : ''}${p.motion ? ' motion=' + p.motion.type : ''}`
  );
}

const kit = buildPartGraph(graph);
kit.group.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(kit.group);
let meshes = 0;
kit.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
console.log(`\nbuilt: meshes=${meshes} bbox min=${box.min.toArray().map((v) => v.toFixed(2))} max=${box.max.toArray().map((v) => v.toFixed(2))} animated=${!!kit.update}`);

const out = `scripts/dev/out_${prompt.replace(/[^\p{L}\p{N}]+/gu, '_')}.json`;
(await import('fs')).writeFileSync(out, JSON.stringify(graph, null, 2));
console.log('saved', out);
