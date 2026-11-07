import * as THREE from 'three';
import {
  TAU,
  ProceduralPalette,
  addBox,
  addEll,
  addRod,
  addRing,
  addPart,
  createMaterial,
} from '../craftForms';
import {
  createQuadrupedWalker,
  extractQuadrupedMorphology,
  type ProceduralKitResult,
} from '../proceduralKits';

// ============================================================================
// CREATURES
// ============================================================================

// 1. creat-eagle: Soaring Golden Eagle (Avian Raptor with Spread Wings & Talons)
export function createGoldenEagle(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const plumageDark = createMaterial('#451a03', 0.72, 0.05);
  const plumageGold = createMaterial('#a16207', 0.65, 0.08);
  const beakMat = createMaterial('#facc15', 0.35, 0.2);

  // Rocky perch base
  addPart(g, new THREE.DodecahedronGeometry(0.32, 1), palette.stone, [0, 0.16, 0], [1.2, 0.6, 1.1]);
  // Yellow talons gripping rock
  for (const sx of [-0.11, 0.11]) {
    addRod(g, beakMat, [sx, 0.3, 0], [sx, 0.56, 0.04], 0.025);
    for (const a of [-0.25, 0, 0.25]) {
      addRod(g, beakMat, [sx, 0.3, 0.02], [sx + a * 0.14, 0.26, 0.12], 0.012);
    }
  }
  // Aerodynamic avian torso & golden nape/head + hooked raptor beak
  const torso = addEll(g, plumageDark, [0, 0.78, 0.04], [0.22, 0.28, 0.34]);
  torso.rotation.x = 0.45;
  addEll(g, plumageGold, [0, 1.06, 0.22], [0.15, 0.16, 0.18]);
  const beak = addPart(g, new THREE.ConeGeometry(0.055, 0.18, 8), beakMat, [0, 1.04, 0.42]);
  beak.rotation.x = Math.PI * 0.58;
  // Spread majestic two-tier feathered wings
  const leftWing = new THREE.Group();
  leftWing.position.set(-0.18, 0.88, 0.05);
  g.add(leftWing);
  const rightWing = new THREE.Group();
  rightWing.position.set(0.18, 0.88, 0.05);
  g.add(rightWing);
  for (const [wg, dir] of [
    [leftWing, -1],
    [rightWing, 1],
  ] as [THREE.Group, number][]) {
    addEll(wg, plumageDark, [dir * 0.42, 0.14, -0.04], [0.46, 0.06, 0.22]);
    addEll(wg, plumageGold, [dir * 0.38, 0.15, 0.06], [0.42, 0.05, 0.12]);
    for (let f = 0; f < 6; f++) {
      const feather = addEll(
        wg,
        plumageDark,
        [dir * (0.52 + f * 0.11), 0.16 + f * 0.02, -0.08 - f * 0.02],
        [0.22, 0.018, 0.055]
      );
      feather.rotation.y = dir * (0.12 + f * 0.06);
    }
  }
  // Fanned tail feathers
  for (let t = -2; t <= 2; t++) {
    const tf = addEll(g, plumageDark, [t * 0.06, 0.54, -0.34], [0.05, 0.018, 0.24]);
    tf.rotation.y = t * 0.15;
    tf.rotation.x = -0.3;
  }
  return { group: g };
}

// 2. creat-phoenix: Immortal Fire Phoenix (Flaming Mythic Bird with Plumed Crest & Tail)
export function createFirePhoenix(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const crimsonMat = createMaterial('#dc2626', 0.35, 0.2);
  const goldFlame = createMaterial('#facc15', 0.25, 0.4);

  // Rising flame vortex pedestal
  addPart(g, new THREE.ConeGeometry(0.28, 0.65, 10), palette.glowOrange, [0, 0.32, 0]);
  // Graceful arched avian body & crowned head with 3 crest plumes
  addEll(g, crimsonMat, [0, 0.96, 0.06], [0.2, 0.28, 0.32]);
  addEll(g, goldFlame, [0, 1.32, 0.2], [0.14, 0.15, 0.16]);
  const beak = addPart(g, new THREE.ConeGeometry(0.045, 0.16, 8), goldFlame, [0, 1.32, 0.38]);
  beak.rotation.x = Math.PI * 0.52;
  for (const a of [-0.25, 0, 0.25]) {
    addRod(g, palette.glowOrange, [a * 0.08, 1.42, 0.16], [a * 0.22, 1.72, -0.05], 0.018);
  }
  // Swept-upward flaming wings (3 layered feather tiers: crimson, orange, gold)
  for (const dir of [-1, 1]) {
    const wg = new THREE.Group();
    wg.position.set(dir * 0.16, 1.05, 0.05);
    wg.rotation.z = -dir * 0.38;
    g.add(wg);
    addEll(wg, crimsonMat, [dir * 0.46, 0.12, 0], [0.52, 0.055, 0.24]);
    addEll(wg, palette.glowOrange, [dir * 0.56, 0.08, -0.1], [0.56, 0.04, 0.18]);
    for (let f = 0; f < 5; f++) {
      addEll(wg, goldFlame, [dir * (0.45 + f * 0.14), 0.04, -0.22 - f * 0.03], [0.22, 0.02, 0.06]);
    }
  }
  // 5 Long streaming ribbon tail feathers
  for (let t = -2; t <= 2; t++) {
    addRod(g, t % 2 === 0 ? goldFlame : crimsonMat, [t * 0.05, 0.78, -0.2], [t * 0.18, 0.28, -0.95], 0.024);
  }
  return { group: g };
}

// 3. creat-kraken: Abyssal Sea Kraken (Bulbous Mantle + 8 Curling Tentacles)
export function createAbyssalKraken(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const krakenSkin = createMaterial('#7f1d1d', 0.48, 0.1);
  const suckerMat = createMaterial('#fca5a5', 0.6, 0.05);

  // Bulbous cephalopod mantle head with lateral fins & glowing yellow eyes
  const mantle = addEll(g, krakenSkin, [0, 1.25, -0.12], [0.46, 0.68, 0.48]);
  mantle.rotation.x = -0.28;
  addEll(g, krakenSkin, [-0.42, 1.58, -0.22], [0.22, 0.18, 0.06]);
  addEll(g, krakenSkin, [0.42, 1.58, -0.22], [0.22, 0.18, 0.06]);
  addEll(g, palette.glowOrange, [-0.28, 0.86, 0.24], [0.09, 0.09, 0.06]);
  addEll(g, palette.glowOrange, [0.28, 0.86, 0.24], [0.09, 0.09, 0.06]);
  // 8 Radially curling multi-segment tentacles with suction cups
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const midR = 0.62;
    const tipR = 1.08;
    const tipY = i % 2 === 0 ? 0.58 : 0.18;
    addRod(g, krakenSkin, [ca * 0.26, 0.62, sa * 0.26], [ca * midR, 0.24, sa * midR], 0.095);
    addRod(g, krakenSkin, [ca * midR, 0.24, sa * midR], [ca * tipR, tipY, sa * tipR], 0.055);
    addEll(g, suckerMat, [ca * ((midR + tipR) * 0.5), (0.24 + tipY) * 0.5 + 0.04, sa * ((midR + tipR) * 0.5)], [0.04, 0.03, 0.04]);
  }
  return { group: g };
}

// 4. creat-minotaur: Horned Minotaur Labyrinth Guardian (Bipedal Bull Warrior with Greataxe)
export function createHornedMinotaur(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const furMat = createMaterial('#451a03', 0.78, 0.05);
  const hornMat = createMaterial('#fef3c7', 0.4, 0.1);
  const hoofMat = createMaterial('#18181b', 0.5, 0.2);

  // Digitigrade legs + cloven hooves + leather loincloth belt
  for (const sx of [-0.22, 0.22]) {
    addBox(g, hoofMat, [sx, 0.08, 0.04], [0.16, 0.16, 0.22], 0.02);
    addRod(g, furMat, [sx, 0.16, 0.02], [sx, 0.56, -0.06], 0.095);
    addRod(g, furMat, [sx, 0.56, -0.06], [sx, 0.98, 0.02], 0.125);
  }
  addBox(g, palette.wood, [0, 0.98, 0], [0.58, 0.18, 0.38], 0.03);
  // Broad muscular chest & hunched shoulders + bovine head & snout
  addEll(g, furMat, [0, 1.38, 0.04], [0.38, 0.36, 0.28]);
  addEll(g, furMat, [0, 1.72, 0.18], [0.22, 0.22, 0.28]);
  addBox(g, furMat, [0, 1.66, 0.36], [0.24, 0.18, 0.24], 0.04);
  // Golden nose ring + sweeping curved bull horns
  const noseRing = addRing(g, palette.gold, [0, 1.56, 0.49], 0.065, 0.015);
  noseRing.rotation.y = 0;
  for (const sx of [-1, 1]) {
    addRod(g, hornMat, [sx * 0.18, 1.82, 0.14], [sx * 0.44, 1.96, 0.24], 0.048);
    addRod(g, hornMat, [sx * 0.44, 1.96, 0.24], [sx * 0.48, 2.16, 0.38], 0.028);
  }
  // Muscular arms + double-bitted labyrinth greataxe in right hand
  for (const sx of [-0.46, 0.46]) {
    addRod(g, furMat, [sx, 1.52, 0.04], [sx * 1.08, 1.02, 0.18], 0.105);
  }
  addRod(g, palette.wood, [-0.52, 0.35, 0.22], [-0.52, 1.85, 0.22], 0.03);
  addBox(g, palette.iron, [-0.52, 1.65, 0.22], [0.04, 0.34, 0.56], 0.01);
  return { group: g };
}

// 5. creat-gargoyle: Winged Gothic Stone Gargoyle on Plinth
export function createStoneGargoyle(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Carved gothic stone pedestal plinth
  addBox(g, palette.stone, [0, 0.28, 0], [0.88, 0.56, 0.88], 0.03);
  addBox(g, palette.cream, [0, 0.6, 0], [0.96, 0.1, 0.96], 0.02);
  // Crouching stone torso, hunched shoulders, horned head & fangs
  addEll(g, palette.stone, [0, 0.98, -0.04], [0.26, 0.32, 0.24]);
  addEll(g, palette.stone, [0, 1.28, 0.14], [0.18, 0.18, 0.22]);
  for (const sx of [-1, 1]) {
    addRod(g, palette.stone, [sx * 0.12, 1.38, 0.1], [sx * 0.24, 1.62, -0.08], 0.03);
    // Crouching legs & arms gripping plinth edge
    addRod(g, palette.stone, [sx * 0.24, 0.65, 0.26], [sx * 0.26, 1.08, 0.08], 0.065);
    addRod(g, palette.stone, [sx * 0.16, 0.65, 0.34], [sx * 0.2, 1.15, 0.18], 0.055);
    // Spread bat-like stone wings
    const wing = addBox(g, palette.stone, [sx * 0.54, 1.28, -0.16], [0.68, 0.58, 0.04], 0.01);
    wing.rotation.y = -sx * 0.35;
    wing.rotation.z = sx * 0.28;
  }
  return { group: g };
}

// 6. creat-mummy: Ancient Bandaged Pharaonic Mummy
export function createAncientMummy(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const linenMat = createMaterial('#d6c7a9', 0.88, 0.02);
  const darkWrap = createMaterial('#a8997c', 0.9, 0.02);

  // Wrapped legs, torso, outstretched zombie-walk arms & head
  for (const sx of [-0.14, 0.14]) {
    addRod(g, linenMat, [sx, 0, 0], [sx, 0.88, 0], 0.085);
    addRod(g, linenMat, [sx * 1.9, 1.38, 0], [sx * 1.8, 1.32, 0.56], 0.068);
    // Dangling loose linen bandage strips
    addBox(g, darkWrap, [sx * 1.8, 1.16, 0.36], [0.03, 0.28, 0.05], 0.005);
  }
  addEll(g, linenMat, [0, 1.18, 0], [0.22, 0.36, 0.16]);
  addEll(g, linenMat, [0, 1.66, 0.02], [0.14, 0.17, 0.15]);
  // Horizontal bandage wrap rings + golden pharaonic collar & glowing eyes
  for (let y = 0.25; y <= 1.45; y += 0.16) {
    addRing(g, darkWrap, [0, y, 0], y < 0.88 ? 0.22 : 0.23, 0.018).rotation.x = Math.PI / 2;
  }
  addRing(g, palette.gold, [0, 1.48, 0.02], 0.22, 0.03).rotation.x = Math.PI / 2;
  addEll(g, palette.glowOrange, [-0.05, 1.68, 0.15], [0.025, 0.02, 0.02]);
  addEll(g, palette.glowOrange, [0.05, 1.68, 0.15], [0.025, 0.02, 0.02]);
  return { group: g };
}

// 7. creat-werewolf: Feral Bipedal Lycanthrope Werewolf
export function createFeralWerewolf(_palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const wolfFur = createMaterial('#334155', 0.82, 0.05);
  const chestFur = createMaterial('#64748b', 0.82, 0.05);

  // Digitigrade hind legs + clawed feet + bushy wolf tail
  for (const sx of [-0.2, 0.2]) {
    addBox(g, wolfFur, [sx, 0.06, 0.08], [0.14, 0.1, 0.24], 0.02);
    addRod(g, wolfFur, [sx, 0.08, 0.02], [sx, 0.48, -0.12], 0.075);
    addRod(g, wolfFur, [sx, 0.48, -0.12], [sx, 0.92, 0.04], 0.105);
  }
  addRod(g, wolfFur, [0, 0.88, -0.14], [0, 0.56, -0.58], 0.085);
  // Hunched broad chest, lupine head, long snout, pointed ears & clawed arms
  addEll(g, wolfFur, [0, 1.28, 0.06], [0.32, 0.36, 0.26]);
  addEll(g, chestFur, [0, 1.28, 0.2], [0.22, 0.28, 0.14]);
  addEll(g, wolfFur, [0, 1.64, 0.22], [0.18, 0.18, 0.22]);
  addBox(g, wolfFur, [0, 1.58, 0.42], [0.14, 0.12, 0.24], 0.03);
  for (const sx of [-1, 1]) {
    addPart(g, new THREE.ConeGeometry(0.055, 0.18, 6), wolfFur, [sx * 0.11, 1.84, 0.18]);
    addRod(g, wolfFur, [sx * 0.36, 1.44, 0.08], [sx * 0.44, 0.92, 0.28], 0.085);
  }
  return { group: g };
}

// 8. creat-alien-grey: Extraterrestrial Grey Alien with Bulbous Cranium & Obsidian Eyes
export function createGreyAlien(_palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const greySkin = createMaterial('#94a3b8', 0.48, 0.1);
  const eyeMat = createMaterial('#020617', 0.08, 0.3);

  // Slender legs, narrow ribcage torso, thin elongated arms
  for (const sx of [-0.11, 0.11]) {
    addRod(g, greySkin, [sx, 0, 0], [sx, 0.82, 0], 0.045);
    addRod(g, greySkin, [sx * 1.8, 1.28, 0], [sx * 2.1, 0.68, 0.08], 0.038);
  }
  addEll(g, greySkin, [0, 1.08, 0], [0.15, 0.28, 0.11]);
  addRod(g, greySkin, [0, 1.32, 0], [0, 1.48, 0], 0.042);
  // Iconic pear-shaped oversized cranium + large slanted black almond eyes
  addEll(g, greySkin, [0, 1.68, 0.02], [0.22, 0.26, 0.24]);
  addEll(g, greySkin, [0, 1.52, 0.06], [0.11, 0.12, 0.14]);
  for (const sx of [-1, 1]) {
    const eye = addEll(g, eyeMat, [sx * 0.095, 1.64, 0.21], [0.065, 0.042, 0.03]);
    eye.rotation.z = -sx * 0.35;
    eye.rotation.y = sx * 0.35;
  }
  return { group: g };
}

// 9. Distinct Quadruped Mammals (Lion with Mane, Sabertooth with Fangs, Grizzly Bear, Wolf, Cat, Dog)
export function createAfricanLion(palette: ProceduralPalette): ProceduralKitResult {
  const res = createQuadrupedWalker(extractQuadrupedMorphology('african lion feline', palette));
  // Add thick voluminous lion mane around neck/head
  const maneMat = createMaterial('#78350f', 0.85, 0.02);
  addEll(res.group, maneMat, [0, 0.92, 0.42], [0.34, 0.36, 0.28]);
  return res;
}

export function createGrizzlyBear(palette: ProceduralPalette): ProceduralKitResult {
  const res = createQuadrupedWalker(extractQuadrupedMorphology('heavy grizzly bear', palette));
  const furMat = createMaterial('#451a03', 0.85, 0.02);
  addEll(res.group, furMat, [0, 0.96, 0.14], [0.32, 0.28, 0.32]);
  return res;
}

export function createSabertoothTiger(palette: ProceduralPalette): ProceduralKitResult {
  const res = createQuadrupedWalker(extractQuadrupedMorphology('sabertooth tiger feline', palette));
  // Long curved ivory saber canines protruding from upper jaw
  const fangMat = createMaterial('#fef9c3', 0.3, 0.1);
  for (const sx of [-0.075, 0.075]) {
    const fang = addPart(res.group, new THREE.ConeGeometry(0.024, 0.24, 8), fangMat, [sx, 0.82, 0.78]);
    fang.rotation.x = Math.PI * 0.92;
  }
  return res;
}

export function createTimberWolf(palette: ProceduralPalette): ProceduralKitResult {
  return createQuadrupedWalker(extractQuadrupedMorphology('grey timber wolf', palette));
}

export function createDomesticCat(palette: ProceduralPalette): ProceduralKitResult {
  const res = createQuadrupedWalker(extractQuadrupedMorphology('slender domestic cat feline', palette));
  res.group.scale.setScalar(0.62);
  return res;
}

export function createHoundDog(palette: ProceduralPalette): ProceduralKitResult {
  const res = createQuadrupedWalker(extractQuadrupedMorphology('loyal hound dog canine', palette));
  res.group.scale.setScalar(0.78);
  return res;
}

// ============================================================================
// NATURE
// ============================================================================

// 10. nat-palm-tree: Tropical Curved Coconut Palm Tree
export function createPalmTree(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Segmented gently curving palm trunk
  let x = 0, z = 0;
  for (let i = 0; i < 9; i++) {
    const nx = Math.sin(i * 0.18) * 0.22;
    const nz = i * 0.04;
    addRod(g, palette.wood, [x, i * 0.34, z], [nx, (i + 1) * 0.34, nz], 0.14 - i * 0.008);
    x = nx;
    z = nz;
  }
  const topY = 9 * 0.34;
  // Coconut cluster + 8 arching green palm fronds
  for (let c = 0; c < 4; c++) {
    const ca = (c / 4) * TAU;
    addEll(g, thecoconutMat(palette), [x + Math.cos(ca) * 0.12, topY - 0.08, z + Math.sin(ca) * 0.12], [0.08, 0.09, 0.08]);
  }
  for (let f = 0; f < 8; f++) {
    const fa = (f / 8) * TAU;
    const fg = new THREE.Group();
    fg.position.set(x, topY, z);
    fg.rotation.y = fa;
    g.add(fg);
    const frond = addEll(fg, palette.leaf, [0.58, -0.06, 0], [0.62, 0.04, 0.18]);
    frond.rotation.z = -0.28;
  }
  return { group: g };
}
function thecoconutMat(p: ProceduralPalette) {
  return p.wood;
}

// 11. nat-campfire: Stone-Ringed Crackling Campfire with Logs & Flames
export function createCampfireRing(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Circle of 10 river stones
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    addPart(
      g,
      new THREE.DodecahedronGeometry(0.14, 0),
      palette.stone,
      [Math.cos(a) * 0.56, 0.09, Math.sin(a) * 0.56],
      [1.2, 0.7, 1.1]
    );
  }
  // 4 Crossed firewood logs + glowing ember bed + layered flame cones
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3;
    addRod(
      g,
      palette.wood,
      [Math.cos(a) * -0.38, 0.08, Math.sin(a) * -0.38],
      [Math.cos(a) * 0.38, 0.22, Math.sin(a) * 0.38],
      0.065
    );
  }
  addPart(g, new THREE.ConeGeometry(0.24, 0.58, 8), palette.glowOrange, [0, 0.34, 0]);
  addPart(g, new THREE.ConeGeometry(0.14, 0.42, 8), createMaterial('#fef08a', 0.2, 0), [0.06, 0.32, 0.05]);
  return { group: g };
}

// 12. nat-mountain-crag: Jagged Snow-Capped Alpine Mountain Crag
export function createMountainCrag(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const snowMat = createMaterial('#f8fafc', 0.5, 0.05);
  // Central peak + 2 flanking rocky ridges + white snow caps
  addPart(g, new THREE.ConeGeometry(1.25, 2.65, 6), palette.stone, [0, 1.325, 0]);
  addPart(g, new THREE.ConeGeometry(0.52, 1.05, 6), snowMat, [0, 2.16, 0]);
  addPart(g, new THREE.ConeGeometry(0.88, 1.75, 5), palette.stone, [-0.78, 0.875, 0.25]);
  addPart(g, new THREE.ConeGeometry(0.36, 0.68, 5), snowMat, [-0.78, 1.42, 0.25]);
  addPart(g, new THREE.ConeGeometry(0.76, 1.55, 5), palette.stone, [0.72, 0.775, -0.2]);
  return { group: g };
}

// 13. nat-flower-planter: Terracotta Planter Box with Colorful Flowers
export function createFlowerPlanter(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const terraMat = createMaterial('#c2410c', 0.72, 0.05);
  const soilMat = createMaterial('#292524', 0.92, 0);
  const flowerColors = ['#ec4899', '#facc15', '#a855f7', '#ef4444', '#38bdf8'];

  // Fluted rectangular terracotta planter + rim + soil bed
  addBox(g, terraMat, [0, 0.26, 0], [1.24, 0.52, 0.58], 0.03);
  addBox(g, terraMat, [0, 0.52, 0], [1.32, 0.08, 0.66], 0.02);
  addBox(g, soilMat, [0, 0.53, 0], [1.18, 0.04, 0.52], 0.01);
  // Lush green foliage & 5 blooming flowers
  for (let i = 0; i < 5; i++) {
    const x = -0.44 + i * 0.22;
    const z = (i % 2 === 0 ? 1 : -1) * 0.08;
    addEll(g, palette.leaf, [x, 0.62, z], [0.16, 0.12, 0.16]);
    addRod(g, palette.leaf, [x, 0.55, z], [x, 0.86, z], 0.018);
    addEll(g, createMaterial(flowerColors[i], 0.4, 0.05), [x, 0.9, z], [0.09, 0.07, 0.09]);
  }
  return { group: g };
}

// 14. nat-bonsai: Sculpted Bonsai Tree in Glazed Ceramic Tray
export function createBonsaiTree(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const potBlue = createMaterial('#1e3a8a', 0.25, 0.2);
  // Glazed ceramic tray pot + 4 corner feet + moss bed
  addBox(g, potBlue, [0, 0.14, 0], [0.86, 0.18, 0.62], 0.02);
  addEll(g, palette.leaf, [0, 0.23, 0], [0.38, 0.05, 0.26]);
  // Gnarled S-curved bonsai trunk & branches + 4 flat cloud foliage pads
  addRod(g, palette.wood, [-0.08, 0.22, 0], [-0.22, 0.56, 0.05], 0.075);
  addRod(g, palette.wood, [-0.22, 0.56, 0.05], [0.12, 0.88, -0.04], 0.055);
  addRod(g, palette.wood, [0.12, 0.88, -0.04], [-0.05, 1.18, 0], 0.038);
  const pads: [number, number, number, number][] = [
    [-0.32, 0.64, 0.08, 0.28],
    [0.26, 0.86, -0.06, 0.3],
    [-0.22, 1.02, -0.04, 0.24],
    [0, 1.24, 0, 0.32],
  ];
  for (const [px, py, pz, r] of pads) {
    addEll(g, palette.leaf, [px, py, pz], [r, 0.09, r * 0.85]);
  }
  return { group: g };
}

// 15. nat-sequoia: Colossal Giant Sequoia Redwood Trunk & Canopy
export function createGiantSequoia(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const redwoodBark = createMaterial('#7c2d12', 0.88, 0.02);
  // Flared buttressed redwood trunk + high tiered evergreen crown
  addPart(g, new THREE.CylinderGeometry(0.46, 0.78, 1.1, 14), redwoodBark, [0, 0.55, 0]);
  addPart(g, new THREE.CylinderGeometry(0.34, 0.46, 2.4, 14), redwoodBark, [0, 2.25, 0]);
  for (let t = 0; t < 4; t++) {
    addPart(g, new THREE.ConeGeometry(1.12 - t * 0.18, 0.95, 12), palette.leaf, [0, 2.45 + t * 0.52, 0]);
  }
  return { group: g };
}

// 16. nat-coral-reef: Vibrant Underwater Coral Reef Colony
export function createCoralReef(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const pinkCoral = createMaterial('#f43f5e', 0.55, 0.05);
  const brainCoral = createMaterial('#eab308', 0.65, 0.05);
  const purpleTube = createMaterial('#a855f7', 0.5, 0.05);

  // Reef rock base + grooved yellow brain coral dome + branching pink staghorn + purple tube sponges
  addPart(g, new THREE.DodecahedronGeometry(0.75, 1), palette.stone, [0, 0.24, 0], [1.3, 0.42, 1.1]);
  addPart(g, new THREE.SphereGeometry(0.32, 14, 12), brainCoral, [-0.36, 0.46, 0.18]);
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * TAU;
    addRod(g, pinkCoral, [0.22, 0.38, -0.1], [0.22 + Math.cos(a) * 0.36, 0.96, -0.1 + Math.sin(a) * 0.36], 0.045);
  }
  for (const [tx, tz, h] of [
    [-0.1, -0.35, 0.75],
    [0.05, -0.42, 0.92],
    [-0.22, -0.28, 0.62],
  ]) {
    addPart(g, new THREE.CylinderGeometry(0.065, 0.05, h, 10), purpleTube, [tx, 0.35 + h / 2, tz]);
  }
  return { group: g };
}

// 17. nat-geyser: Steaming Geothermal Geyser Vent & Erupting Plume
export function createThermalGeyser(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const sulfurMat = createMaterial('#ca8a04', 0.78, 0.05);
  // Mineral sinter cone + sulfur rim + turquoise pool + tall erupting water/steam column
  addPart(g, new THREE.CylinderGeometry(0.52, 1.15, 0.48, 16), palette.stone, [0, 0.24, 0]);
  addRing(g, sulfurMat, [0, 0.48, 0], 0.48, 0.08).rotation.x = Math.PI / 2;
  addPart(g, new THREE.CylinderGeometry(0.18, 0.34, 2.15, 12), palette.glowCyan, [0, 1.52, 0]);
  addEll(g, createMaterial('#f8fafc', 0.9, 0), [0, 2.55, 0], [0.46, 0.38, 0.46]);
  return { group: g };
}

// 18. nat-iceberg: Faceted Polar Glacial Iceberg
export function createPolarIceberg(_palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const iceWhite = createMaterial('#e0f2fe', 0.25, 0.1, true);
  const iceBlue = createMaterial('#38bdf8', 0.2, 0.15, true);
  // Twin jagged crystalline ice spires + tabular glacial shelf
  addPart(g, new THREE.ConeGeometry(0.95, 2.35, 6), iceWhite, [-0.22, 1.175, 0]);
  addPart(g, new THREE.ConeGeometry(0.72, 1.75, 5), iceBlue, [0.48, 0.875, 0.24]);
  addPart(g, new THREE.DodecahedronGeometry(0.68, 0), iceWhite, [0, 0.38, -0.28], [1.6, 0.55, 1.3]);
  return { group: g };
}

// 19. nat-bamboo-grove: Clustered Green Bamboo Culm Stalks & Foliage
export function createBambooGrove(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bambooGreen = createMaterial('#4d7c0f', 0.42, 0.08);
  const stalks: [number, number, number][] = [
    [0, 0, 2.6],
    [-0.24, 0.18, 2.35],
    [0.26, -0.14, 2.48],
    [-0.18, -0.26, 2.15],
    [0.22, 0.25, 2.25],
    [-0.42, -0.05, 1.95],
    [0.42, 0.08, 2.05],
  ];
  for (const [sx, sz, h] of stalks) {
    addPart(g, new THREE.CylinderGeometry(0.055, 0.065, h, 10), bambooGreen, [sx, h / 2, sz]);
    for (let y = 0.45; y < h; y += 0.45) {
      addRing(g, palette.cream, [sx, y, sz], 0.062, 0.012).rotation.x = Math.PI / 2;
    }
    addEll(g, palette.leaf, [sx * 1.35, h - 0.18, sz * 1.35], [0.28, 0.12, 0.22]);
  }
  return { group: g };
}

// 20. nat-venus-flytrap: Carnivorous Venus Flytrap with Toothed Jaw Traps
export function createVenusFlytrap(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const potMat = createMaterial('#b45309', 0.72, 0.05);
  const mouthRed = createMaterial('#dc2626', 0.45, 0.05);

  // Terracotta pot + 4 arching stems ending in hinged jaw traps with marginal teeth
  addPart(g, new THREE.CylinderGeometry(0.42, 0.32, 0.56, 16), potMat, [0, 0.28, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    const tx = Math.cos(a) * 0.48;
    const tz = Math.sin(a) * 0.48;
    const ty = 0.88 + (i % 2) * 0.22;
    addRod(g, palette.leaf, [0, 0.52, 0], [tx, ty, tz], 0.032);
    const trap = new THREE.Group();
    trap.position.set(tx, ty, tz);
    trap.rotation.y = -a;
    g.add(trap);
    addEll(trap, palette.leaf, [0, 0.06, 0], [0.18, 0.12, 0.09]);
    addEll(trap, mouthRed, [0.02, 0.06, 0], [0.15, 0.09, 0.07]);
  }
  return { group: g };
}

// 21. nat-meteorite: Scorched Impact Crater & Glowing Iron-Nickel Meteorite Core
export function createImpactMeteorite(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const meteorIron = createMaterial('#27272a', 0.55, 0.85, true);
  // Raised scorched crater rim ring + glowing magma ring + pitted meteorite boulder
  const rim = addRing(g, palette.stone, [0, 0.14, 0], 0.92, 0.22);
  rim.rotation.x = Math.PI / 2;
  addPart(g, new THREE.CylinderGeometry(0.75, 0.85, 0.08, 16), palette.glowOrange, [0, 0.06, 0]);
  addPart(g, new THREE.DodecahedronGeometry(0.52, 1), meteorIron, [0, 0.52, 0], [1.1, 0.95, 1.05]);
  addEll(g, palette.glowOrange, [0.12, 0.56, 0.36], [0.14, 0.08, 0.08]);
  return { group: g };
}

