import { resolveObjectArchetype } from '../../src/engine/procedural3D/archetypeResolver';

const wordsToTest = [
  'car',
  'table',
  'chair',
  'tree',
  'couch',
  'sofa',
  'sword',
  'gun',
  'cart',
  'fence',
  'clothesline',
  'signboard',
  'reeds',
  'rock',
  'boulder',
  'guildhall',
  'hall',
  'watermill',
  'tower',
  'cottage',
  'bridge',
  'well',
  'barrel',
  'crate',
  'lantern',
  'horse',
  'cat',
  'dog',
  'lion',
  'tv',
  'television',
  'monitor',
  'screen',
  'bottle',
  'cup',
  'mug',
  'سيارة',
  'ترابيزة',
  'كرسي',
  'شجرة',
  'سيف',
  'بندقية',
  'حصان',
  'عربة',
  'سور',
  'صخرة'
];

console.log('--- TESTING WITH CATEGORY = human (as happens in the UI by default) ---');
for (const word of wordsToTest) {
  const res = resolveObjectArchetype(word, 'human');
  console.log(`[category: human] "${word}" -> Archetype: ${res.matchedArchetype?.id || 'FALLBACK_MORPHOMETRIC'} (Confidence: ${res.confidence.toFixed(2)})`);
}

console.log('\n--- TESTING DEFAULT CHARACTERS & MORPHOMETRIC FALLBACK ---');
console.log('Character 1:', resolveObjectArchetype('Character 1', 'human').matchedArchetype?.id);
console.log('Lead Actor:', resolveObjectArchetype('Lead Actor', 'human').matchedArchetype?.id);
console.log('Empty query:', resolveObjectArchetype('', 'human').matchedArchetype?.id);
console.log('Quantum core (novel noun):', resolveObjectArchetype('quantum core', 'human').matchedArchetype?.id || 'FALLBACK_MORPHOMETRIC');
console.log('Centrifuge (novel noun):', resolveObjectArchetype('centrifuge', 'human').matchedArchetype?.id || 'FALLBACK_MORPHOMETRIC');

