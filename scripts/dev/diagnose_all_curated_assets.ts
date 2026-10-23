import { CURATED_3D_ASSETS } from '../../src/stores/useAssetLibraryStore';
import { resolveObjectArchetype } from '../../src/engine/procedural3D/archetypeResolver';

let fallbackCount = 0;
let matchedCount = 0;
const fallbackList: string[] = [];
const speakerList: string[] = [];

for (const asset of CURATED_3D_ASSETS) {
  const res = resolveObjectArchetype(`${asset.name} ${asset.tokenPrompt}`, asset.category);
  if (!res.matchedArchetype) {
    fallbackCount++;
    fallbackList.push(`${asset.id} (${asset.name}) -> FALLBACK`);
  } else {
    matchedCount++;
    if (res.matchedArchetype.id === 'archetype.audio.speaker' && !asset.name.toLowerCase().includes('speaker') && !asset.name.toLowerCase().includes('audio')) {
      speakerList.push(`${asset.id} (${asset.name}) -> SPEAKER!`);
    }
  }
}

console.log(`Total: ${CURATED_3D_ASSETS.length}`);
console.log(`Matched: ${matchedCount}`);
console.log(`Fallback (Box with slit): ${fallbackCount}`);
console.log(`Wrong Speaker matches: ${speakerList.length}`);
if (speakerList.length > 0) {
  console.log('False Speakers:', speakerList);
}
console.log('Sample Fallbacks (first 15):', fallbackList.slice(0, 15));
