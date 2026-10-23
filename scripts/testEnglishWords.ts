import { createProceduralActorMesh } from '../src/engine/procedural3D/proceduralMeshFactory';

const allTestObjects = [
  'airplane',
  'piano',
  'microscope',
  'clock',
  'refrigerator',
  'motorcycle',
  'fan',
  'telescope',
  'bed',
  'shield',
  'drum',
  'door',
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
  'صخرة',
  'Character 1',
  'quantum core',
  'centrifuge'
];

let failed = 0;
for (const word of allTestObjects) {
  try {
    const mesh = createProceduralActorMesh({ category: 'human', name: word, tokenPrompt: word });
    if (!mesh || mesh.children.length === 0) {
      console.error(`FAILED to build mesh for: "${word}" (0 children)`);
      failed++;
    } else {
      console.log(`[PASS] "${word}" -> Mesh built with ${mesh.children.length} parts`);
    }
  } catch (err: any) {
    console.error(`ERROR building mesh for: "${word}":`, err.message);
    failed++;
  }
}

if (failed === 0) {
  console.log(`\nALL ${allTestObjects.length} OBJECTS SUCCESSFULLY GENERATED AS 3D PROCEDURAL ASSETS!`);
} else {
  console.error(`\n${failed} OBJECTS FAILED TO GENERATE!`);
  process.exit(1);
}
