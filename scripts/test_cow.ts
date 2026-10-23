import { resolveObjectArchetype } from '../src/engine/procedural3D/archetypeResolver';
import { createProceduralActorMesh } from '../src/engine/procedural3D/proceduralMeshFactory';

console.log('--- COW RESOLUTION ---');
const r1 = resolveObjectArchetype('cow', 'props');
console.log('resolveObjectArchetype("cow", "props"):', r1.matchedArchetype?.name, 'confidence:', r1.confidence, 'reasoning:', r1.reasoningTrace.step05Routing);

const r2 = resolveObjectArchetype('cow', 'creature');
console.log('resolveObjectArchetype("cow", "creature"):', r2.matchedArchetype?.name, 'confidence:', r2.confidence, 'reasoning:', r2.reasoningTrace.step05Routing);

const mesh = createProceduralActorMesh({ name: 'cow', tokenPrompt: 'cow', category: 'props' });
console.log('Created mesh children count:', mesh.children.length);
mesh.traverse((c: any) => {
  if (c.geometry) {
    console.log('Child:', c.name || 'unnamed', 'type:', c.geometry.type, 'params:', c.geometry.parameters);
  }
});
