import * as THREE from 'three';
import { createProceduralActorMesh } from '../../src/engine/procedural3D/proceduralMeshFactory';

for (const [category, name] of [['human', 'Lead Actor'], ['car', 'Car'], ['creature', 'horse']]) {
  const g = createProceduralActorMesh({ category, name, tokenPrompt: '' });
  g.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  console.log(`${name.padEnd(12)} stage size w=${s.x.toFixed(2)} h=${s.y.toFixed(2)} d=${s.z.toFixed(2)}`);
}
