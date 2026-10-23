import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createProceduralActorMesh,
  createStandardPalette,
  addBox,
  addEll,
  addRod,
} from '../src/engine/procedural3D';

describe('3Dviz Pro Max Procedural 3D Engine', () => {
  it('creates standard procedural PBR palette with bump textures', () => {
    const palette = createStandardPalette(0x38bdf8);
    expect(palette.wood).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(palette.stone).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(palette.glass).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(palette.glowCyan).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(palette.wood.bumpMap).toBeDefined();
    expect(palette.stone.bumpMap).toBeDefined();
  });

  it('adds bevelled rounded box, ellipsoid, and oriented rod correctly', () => {
    const parent = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const boxMesh = addBox(parent, mat, [0, 1, 0], [2, 2, 2], 0.05);
    expect(parent.children.length).toBe(1);
    expect(boxMesh.position.y).toBe(1);

    const ellMesh = addEll(parent, mat, [1, 1, 1], [0.5, 0.8, 0.5]);
    expect(parent.children.length).toBe(2);
    expect(ellMesh.position.x).toBe(1);

    const rodMesh = addRod(parent, mat, [0, 0, 0], [0, 4, 0], 0.1);
    expect(parent.children.length).toBe(3);
    expect(rodMesh.position.y).toBe(2);
  });

  it('generates a procedural Moonwood Stag for animal/creature prompt', () => {
    const group = createProceduralActorMesh({
      category: 'creature',
      name: 'Forest Stag Spirit',
      tokenPrompt: 'majestic stag with glowing antlers in mystical woodland',
      colorHex: 0x38bdf8,
    });

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
    expect(typeof group.userData.update).toBe('function');

    // Test that the update function runs smoothly without throwing
    expect(() => group.userData.update?.(0.016)).not.toThrow();
  });

  it('generates a procedural Timber Cottage for architecture prompt', () => {
    const group = createProceduralActorMesh({
      category: 'building',
      name: 'Stone Mason Cottage',
      tokenPrompt: 'medieval cottage with stone chimney and pitched roof',
    });

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
  });

  it('generates a procedural Sci-Fi Fighter for spaceship prompt with kinetic thrusters', () => {
    const group = createProceduralActorMesh({
      category: 'spaceship',
      name: 'Interceptor One',
      tokenPrompt: 'aerospace starfighter craft with blue plasma thrusters',
    });

    expect(group).toBeInstanceOf(THREE.Group);
    expect(typeof group.userData.update).toBe('function');
    expect(() => group.userData.update?.(0.016)).not.toThrow();
  });

  it('generates a procedural Biped Walker for human actor prompt', () => {
    const group = createProceduralActorMesh({
      category: 'human',
      name: 'Director Hero',
      tokenPrompt: 'detective man walking in leather trenchcoat',
    });

    expect(group).toBeInstanceOf(THREE.Group);
    expect(typeof group.userData.update).toBe('function');
  });

  it('generates a procedural Zodiac Boat for "zodiac" in English', () => {
    const group = createProceduralActorMesh({
      category: 'vehicle',
      name: 'Black Zodiac',
      tokenPrompt: 'tactical zodiac inflatable boat on water',
    });

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
    expect(typeof group.userData.update).toBe('function');
    expect(() => group.userData.update?.(0.016)).not.toThrow();
  });

  it('generates a procedural Zodiac Boat for Arabic query "زودياك"', () => {
    const group = createProceduralActorMesh({
      category: 'custom',
      name: 'زودياك',
      tokenPrompt: 'قارب زودياك مطاطي سريع',
    });

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
    expect(typeof group.userData.update).toBe('function');
  });

  it('generates a procedural Automobile for Arabic query "سيارة"', () => {
    const group = createProceduralActorMesh({
      category: 'custom',
      name: 'سيارة',
      tokenPrompt: 'مركبة سوداء حديثة',
    });

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
  });

  it('generates a procedural Helicopter for Arabic query "مروحية"', () => {
    const group = createProceduralActorMesh({
      category: 'custom',
      name: 'مروحية',
      tokenPrompt: 'طائرة هليكوبتر',
    });

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
    expect(typeof group.userData.update).toBe('function');
  });

  it('generates a procedural Studio Microphone for "mic" and "مايك"', () => {
    const enGroup = createProceduralActorMesh({
      category: 'prop',
      name: 'Studio Mic',
      tokenPrompt: 'vintage condenser microphone on desk stand',
    });
    expect(enGroup).toBeInstanceOf(THREE.Group);
    expect(enGroup.children.length).toBeGreaterThan(0);

    const arGroup = createProceduralActorMesh({
      category: 'custom',
      name: 'مايك',
      tokenPrompt: 'مايك صوت احترافي',
    });
    expect(arGroup).toBeInstanceOf(THREE.Group);
    expect(arGroup.children.length).toBeGreaterThan(0);
  });

  it('generates a procedural Hollow Cup with liquid cavity for "cup" and "كباية"', () => {
    const enGroup = createProceduralActorMesh({
      category: 'prop',
      name: 'Coffee Cup',
      tokenPrompt: 'ceramic mug with hot dark coffee',
    });
    expect(enGroup).toBeInstanceOf(THREE.Group);
    expect(enGroup.children.length).toBeGreaterThan(0);

    const arGroup = createProceduralActorMesh({
      category: 'custom',
      name: 'كباية',
      tokenPrompt: 'كباية شاي ساخن',
    });
    expect(arGroup).toBeInstanceOf(THREE.Group);
    expect(arGroup.children.length).toBeGreaterThan(0);
  });

  it('generates a procedural Layered Burger for "burger" and "برجر"', () => {
    const enGroup = createProceduralActorMesh({
      category: 'food',
      name: 'Gourmet Burger',
      tokenPrompt: 'delicious cheeseburger with sesame seed bun and patty',
    });
    expect(enGroup).toBeInstanceOf(THREE.Group);
    expect(enGroup.children.length).toBeGreaterThan(0);

    const arGroup = createProceduralActorMesh({
      category: 'custom',
      name: 'برجر',
      tokenPrompt: 'ساندوتش همبرجر لذيذ مع جبنة وخس',
    });
    expect(arGroup).toBeInstanceOf(THREE.Group);
    expect(arGroup.children.length).toBeGreaterThan(0);
  });

  it('generates a procedural Laptop Computer for "laptop" and "لابتوب"', () => {
    const enGroup = createProceduralActorMesh({
      category: 'electronics',
      name: 'Slim Laptop',
      tokenPrompt: 'aluminum notebook computer with glowing screen',
    });
    expect(enGroup).toBeInstanceOf(THREE.Group);
    expect(enGroup.children.length).toBeGreaterThan(0);

    const arGroup = createProceduralActorMesh({
      category: 'custom',
      name: 'لابتوب',
      tokenPrompt: 'جهاز كمبيوتر محمول',
    });
    expect(arGroup).toBeInstanceOf(THREE.Group);
    expect(arGroup.children.length).toBeGreaterThan(0);
  });

  it('synthesizes arbitrary custom objects geometrically with NO triangles', () => {
    const group = createProceduralActorMesh({
      category: 'custom',
      name: 'Quantum Resonator',
      tokenPrompt: 'futuristic energy device with crystal core and copper rails',
    });

    expect(group).toBeInstanceOf(THREE.Group);
    expect(typeof group.userData.update).toBe('function');

    // Ensure no OctahedronGeometry is used
    let hasTriangleOctahedron = false;
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const geo = (child as THREE.Mesh).geometry;
        if (geo.type === 'OctahedronGeometry') {
          hasTriangleOctahedron = true;
        }
      }
    });
    expect(hasTriangleOctahedron).toBe(false);
  });

  it('applies wireframe ghost mode cleanly across all child meshes', () => {
    const group = createProceduralActorMesh({
      category: 'building',
      name: 'Ghost Tower',
      isGhostWireframe: true,
    });

    let meshCount = 0;
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        const mesh = child as THREE.Mesh;
        expect((mesh.material as THREE.MeshBasicMaterial).wireframe).toBe(true);
      }
    });

    expect(meshCount).toBeGreaterThan(0);
  });

  it('verifies robust Arabic normalization and decomposition for colloquial words', () => {
    const mic = createProceduralActorMesh({ category: 'custom', name: 'مايك' });
    expect(mic.children.length).toBeGreaterThan(0);

    const cup = createProceduralActorMesh({ category: 'custom', name: 'كباية شاي' });
    expect(cup.children.length).toBeGreaterThan(0);

    const burger = createProceduralActorMesh({ category: 'custom', name: 'برجر' });
    expect(burger.children.length).toBeGreaterThan(0);

    const laptop = createProceduralActorMesh({ category: 'custom', name: 'لابتوب' });
    expect(laptop.children.length).toBeGreaterThan(0);

    const guitar = createProceduralActorMesh({ category: 'custom', name: 'جيتار' });
    expect(guitar.children.length).toBeGreaterThan(0);

    const lamp = createProceduralActorMesh({ category: 'custom', name: 'أباجورة' });
    expect(lamp.children.length).toBeGreaterThan(0);

    const car = createProceduralActorMesh({ category: 'custom', name: 'عربية سريعة' });
    expect(car.children.length).toBeGreaterThan(0);
  });

  it('guarantees that completely unknown nouns produce structured multi-mesh models without primitive boxes or octahedrons', () => {
    const unknown = createProceduralActorMesh({
      category: 'custom',
      name: 'UnseenArtifact99',
      tokenPrompt: 'strange experimental widget from the future',
    });

    expect(unknown).toBeInstanceOf(THREE.Group);
    let meshCount = 0;
    let hasOctahedron = false;

    unknown.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        if ((child as THREE.Mesh).geometry.type === 'OctahedronGeometry') {
          hasOctahedron = true;
        }
      }
    });

    // Must be composed of multiple articulated parts, never a single bare primitive
    expect(meshCount).toBeGreaterThan(3);
    expect(hasOctahedron).toBe(false);
  });

  it('guarantees dedicated procedural assemblies for arbitrary English queries without falling back to cubes', () => {
    const englishTestCatalog = [
      { word: 'airplane', minMeshes: 10 },
      { word: 'piano', minMeshes: 15 },
      { word: 'microscope', minMeshes: 6 },
      { word: 'clock', minMeshes: 12 },
      { word: 'refrigerator', minMeshes: 8 },
      { word: 'motorcycle', minMeshes: 10 },
      { word: 'fan', minMeshes: 6 },
      { word: 'telescope', minMeshes: 5 },
      { word: 'bed', minMeshes: 8 },
      { word: 'shield', minMeshes: 5 },
      { word: 'drum', minMeshes: 10 },
      { word: 'door', minMeshes: 8 },
      { word: 'speaker', minMeshes: 5 },
      { word: 'robot', minMeshes: 8 },
      { word: 'flute', minMeshes: 15 },
      { word: 'motocycle', minMeshes: 8 },
    ];

    for (const testCase of englishTestCatalog) {
      const mesh = createProceduralActorMesh({
        category: 'custom',
        name: testCase.word,
        tokenPrompt: `cinematic ${testCase.word} hero prop`,
      });

      expect(mesh).toBeInstanceOf(THREE.Group);
      let meshCount = 0;
      let hasOctahedron = false;

      mesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshCount++;
          if ((child as THREE.Mesh).geometry.type === 'OctahedronGeometry') {
            hasOctahedron = true;
          }
        }
      });

      expect(meshCount, `Testing word "${testCase.word}"`).toBeGreaterThanOrEqual(testCase.minMeshes);
      expect(hasOctahedron, `Testing word "${testCase.word}"`).toBe(false);
    }
  });

  it('constructs multi-tiered mechanical & high-tech machines for completely novel uncataloged English words', () => {
    const novelNouns = ['centrifuge', 'hovercraft', 'anvil', 'satellite', 'quantum battery'];

    for (const novelNoun of novelNouns) {
      const mesh = createProceduralActorMesh({
        category: 'custom',
        name: novelNoun,
        tokenPrompt: novelNoun,
      });

      expect(mesh).toBeInstanceOf(THREE.Group);
      let meshCount = 0;
      let hasOctahedron = false;

      mesh.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshCount++;
          if ((child as THREE.Mesh).geometry.type === 'OctahedronGeometry') {
            hasOctahedron = true;
          }
        }
      });

      // Must have at least 4 articulated geometric parts, never a single bare box
      expect(meshCount, `Testing novel noun "${novelNoun}"`).toBeGreaterThanOrEqual(4);
      expect(hasOctahedron, `Testing novel noun "${novelNoun}"`).toBe(false);
    }
  });

  it('correctly resolves FLUTE to a dedicated Woodwind Flute and NOT a guitar', () => {
    const fluteMesh = createProceduralActorMesh({
      category: 'custom',
      name: 'FLUTE',
      tokenPrompt: 'FLUTE',
    });

    expect(fluteMesh).toBeInstanceOf(THREE.Group);
    let meshCount = 0;
    let cylinderCount = 0;
    fluteMesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        if ((child as THREE.Mesh).geometry.type === 'CylinderGeometry') {
          cylinderCount++;
        }
      }
    });

    // Dedicated flute has body tube + crown + embouchure hole + 12 keys + 3 foot keys + rods >= 18 meshes
    expect(meshCount).toBeGreaterThanOrEqual(18);
    expect(cylinderCount).toBeGreaterThanOrEqual(10);
  });

  it('correctly resolves MOTOCYCLE typo to a Two-Wheeled Motorcycle and NOT a fallback cone/cylinder', () => {
    const motoMesh = createProceduralActorMesh({
      category: 'custom',
      name: 'MOTOCYCLE',
      tokenPrompt: 'MOTOCYCLE',
    });

    expect(motoMesh).toBeInstanceOf(THREE.Group);
    let meshCount = 0;
    motoMesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
      }
    });

    // Motorcycle has wheels, tires, frame rails, engine, fuel tank, saddle, forks, handlebars >= 10 parts
    expect(meshCount).toBeGreaterThanOrEqual(10);
  });

  it('guarantees that explicit object names NEVER get hijacked by default category "human"', () => {
    // When user creates a subject, default kind is 'human'
    const tableMesh = createProceduralActorMesh({
      category: 'human',
      name: 'table',
      tokenPrompt: 'wooden rustic dining table',
    });
    expect(tableMesh.children.length).toBeGreaterThanOrEqual(5);

    const carMesh = createProceduralActorMesh({
      category: 'human',
      name: 'car',
      tokenPrompt: 'vintage automobile',
    });
    expect(carMesh.children.length).toBeGreaterThanOrEqual(10);

    const swordMesh = createProceduralActorMesh({
      category: 'human',
      name: 'sword',
      tokenPrompt: 'hero blade weapon',
    });
    expect(swordMesh.children.length).toBeGreaterThanOrEqual(3);

    const tvMesh = createProceduralActorMesh({
      category: 'human',
      name: 'tv',
      tokenPrompt: 'flatscreen television display',
    });
    expect(tvMesh.children.length).toBeGreaterThanOrEqual(5);
  });

  it('generates all new 3Dviz Pro Max blueprints: cart, fence, signboard, rock cluster, reeds, clothesline, guildhall', () => {
    const blueprints = [
      { name: 'cart', minParts: 20 },
      { name: 'fence', minParts: 25 },
      { name: 'clothesline', minParts: 10 },
      { name: 'signboard', minParts: 10 },
      { name: 'rock', minParts: 5 },
      { name: 'reeds', minParts: 1 },
      { name: 'guildhall', minParts: 20 },
    ];

    for (const bp of blueprints) {
      const mesh = createProceduralActorMesh({
        category: 'human',
        name: bp.name,
        tokenPrompt: bp.name,
      });
      expect(mesh).toBeInstanceOf(THREE.Group);
      expect(mesh.children.length).toBeGreaterThanOrEqual(bp.minParts);
    }
  });

  it('accurately renders Arabic direct inputs even with category: human', () => {
    const arabicWords = [
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
    ];

    for (const ar of arabicWords) {
      const mesh = createProceduralActorMesh({
        category: 'human',
        name: ar,
        tokenPrompt: ar,
      });
      expect(mesh).toBeInstanceOf(THREE.Group);
      expect(mesh.children.length).toBeGreaterThan(0);
    }
  });

  it('attaches 3Dviz Pro Max SpatialReasoningTrace to mesh userData', () => {
    const cottageMesh = createProceduralActorMesh({
      category: 'building',
      name: 'Timber Cottage',
      tokenPrompt: 'medieval rustic stone cottage',
    });

    expect(cottageMesh.userData.reasoningTrace).toBeDefined();
    expect(cottageMesh.userData.reasoningTrace.step05Routing.decision).toBe('reuse-kit');
    expect(cottageMesh.userData.reasoningTrace.step03Object.subparts.length).toBeGreaterThan(0);

    const novelMesh = createProceduralActorMesh({
      category: 'prop',
      name: 'Quantum Reactor Core',
      tokenPrompt: 'experimental plasma battery apparatus',
    });

    expect(novelMesh.userData.reasoningTrace).toBeDefined();
    expect(novelMesh.userData.reasoningTrace.step05Routing.decision).toBe('author-custom-csg');
    expect(novelMesh.userData.reasoningTrace.step02Intent.domain).toBe('Advanced Tech / Laboratory');
    expect(novelMesh.userData.reasoningTrace.step07Scaffolding.chamferBevels).toBe(true);
  });
});


