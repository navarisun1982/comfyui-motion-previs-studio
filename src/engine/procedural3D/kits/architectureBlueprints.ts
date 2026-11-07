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
import type { ProceduralKitResult } from '../proceduralKits';

// 1. arch-windmill: Windmill Millhouse (octagonal tower + domed cap + 4 lattice sails)
export function createWindmillMillhouse(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Stone base & octagonal timber-brick tower
  addPart(g, new THREE.CylinderGeometry(0.95, 1.1, 0.45, 8), palette.stone, [0, 0.225, 0]);
  addPart(g, new THREE.CylinderGeometry(0.68, 0.92, 1.95, 8), palette.cream, [0, 1.42, 0]);
  // Wooden gallery balcony ring
  addPart(g, new THREE.CylinderGeometry(0.98, 0.98, 0.06, 8), palette.wood, [0, 0.95, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    addRod(g, palette.wood, [Math.cos(a) * 0.92, 0.95, Math.sin(a) * 0.92], [Math.cos(a) * 0.92, 1.18, Math.sin(a) * 0.92], 0.02);
  }
  // Domed wooden cap
  addPart(g, new THREE.SphereGeometry(0.72, 12, 10, 0, TAU, 0, Math.PI * 0.55), palette.roof, [0, 2.38, 0]);
  // Door & windows
  addBox(g, palette.wood, [0, 0.35, 0.98], [0.36, 0.62, 0.08], 0.01);
  addBox(g, palette.glass, [0, 1.55, 0.78], [0.26, 0.34, 0.06], 0.01);
  // Rotor hub & 4 lattice sails
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.48, 0.78);
  g.add(rotor);
  addRod(rotor, palette.iron, [0, 0, -0.25], [0, 0, 0.18], 0.08);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI) / 2 + 0.35;
    rotor.add(arm);
    addRod(arm, palette.wood, [0, 0, 0.08], [0, 1.45, 0.08], 0.032);
    // Lattice sail cloth & crossbars
    addBox(arm, palette.cream, [0.14, 0.85, 0.09], [0.24, 1.1, 0.018], 0.004);
    for (let r = 0; r < 5; r++) {
      addBox(arm, palette.wood, [0.13, 0.38 + r * 0.23, 0.1], [0.28, 0.02, 0.025], 0.003);
    }
  }
  return {
    group: g,
    update(dt: number) {
      rotor.rotation.z -= dt * 0.85;
    },
  };
}

// 2. arch-skyscraper: Modern Skyscraper Tower (tiered glass curtain-wall high-rise + spire)
export function createSkyscraperTower(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steelMat = createMaterial('#475569', 0.3, 0.85);
  // Podium base
  addBox(g, palette.stone, [0, 0.22, 0], [1.65, 0.44, 1.65], 0.02);
  // Tier 1 glass tower
  addBox(g, palette.glass, [0, 1.45, 0], [1.28, 2.1, 1.28], 0.02);
  // Tier 2 setback glass tower
  addBox(g, palette.glass, [0, 2.95, 0], [0.96, 1.2, 0.96], 0.02);
  // Tier 3 crown
  addBox(g, palette.glass, [0, 3.82, 0], [0.66, 0.62, 0.66], 0.02);
  // Structural mullions & floor plates
  for (let y = 0.5; y <= 3.4; y += 0.32) {
    const w = y < 2.45 ? 1.31 : 0.99;
    addBox(g, steelMat, [0, y, 0], [w, 0.035, w], 0.005);
  }
  for (const s of [-0.63, -0.21, 0.21, 0.63]) {
    addBox(g, steelMat, [s, 1.45, 0.64], [0.035, 2.1, 0.035], 0.005);
    addBox(g, steelMat, [s, 1.45, -0.64], [0.035, 2.1, 0.035], 0.005);
  }
  // Communications spire & aviation beacon
  addRod(g, steelMat, [0, 4.1, 0], [0, 4.95, 0], 0.028);
  addEll(g, palette.glowOrange, [0, 4.98, 0], [0.06, 0.06, 0.06]);
  return { group: g };
}

// 3. arch-temple-portico: Classical Temple Portico (stepped stylobate + 6 fluted columns + triangular pediment)
export function createTemplePortico(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // 3-step stylobate base
  addBox(g, palette.stone, [0, 0.08, 0], [2.5, 0.16, 1.9], 0.02);
  addBox(g, palette.cream, [0, 0.22, 0], [2.34, 0.14, 1.74], 0.02);
  addBox(g, palette.cream, [0, 0.34, 0], [2.18, 0.12, 1.58], 0.02);
  // Inner sanctuary cella wall
  addBox(g, palette.stone, [0, 1.15, -0.22], [1.45, 1.5, 0.85], 0.02);
  addBox(g, palette.gold, [0, 0.95, 0.22], [0.46, 1.05, 0.05], 0.01);
  // 6 Front Doric columns + 4 rear columns
  for (let i = 0; i < 6; i++) {
    const x = -0.92 + i * 0.368;
    for (const z of [0.62, -0.62]) {
      addPart(g, new THREE.CylinderGeometry(0.085, 0.105, 1.42, 12), palette.cream, [x, 1.11, z]);
      addBox(g, palette.stone, [x, 0.43, z], [0.24, 0.07, 0.24], 0.01);
      addBox(g, palette.stone, [x, 1.84, z], [0.25, 0.08, 0.25], 0.01);
    }
  }
  // Entablature architrave & frieze
  addBox(g, palette.cream, [0, 1.98, 0], [2.22, 0.22, 1.62], 0.02);
  // Triangular pediment roof
  const shape = new THREE.Shape();
  shape.moveTo(-1.18, 0);
  shape.lineTo(1.18, 0);
  shape.lineTo(0, 0.56);
  shape.closePath();
  const pedGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.68, bevelEnabled: false });
  addPart(g, pedGeo, palette.stone, [0, 2.09, -0.84]);
  addEll(g, palette.gold, [0, 2.7, 0.82], [0.09, 0.12, 0.06]);
  return { group: g };
}

// 4. arch-military-bunker / arch-bunker: Reinforced Concrete Pillbox Bunker
export function createMilitaryBunker(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const concreteMat = createMaterial('#64748b', 0.88, 0.05);
  const darkSlitMat = createMaterial('#0f172a', 0.9, 0.1);
  // Octagonal sloped concrete pillbox body
  addPart(g, new THREE.CylinderGeometry(1.15, 1.42, 1.05, 8), concreteMat, [0, 0.525, 0]);
  // Heavy blast roof cap
  addPart(g, new THREE.CylinderGeometry(1.28, 1.22, 0.24, 8), palette.stone, [0, 1.14, 0]);
  // Recessed firing embrasure slit
  addBox(g, darkSlitMat, [0, 0.68, 1.18], [0.95, 0.18, 0.16], 0.01);
  addBox(g, concreteMat, [0, 0.84, 1.24], [1.12, 0.12, 0.22], 0.02);
  // Twin gun barrels protruding from slit
  addRod(g, palette.iron, [-0.18, 0.68, 1.1], [-0.18, 0.68, 1.62], 0.035);
  addRod(g, palette.iron, [0.18, 0.68, 1.1], [0.18, 0.68, 1.62], 0.035);
  // Sandbag barricade wall in front
  const bagMat = createMaterial('#a18868', 0.9, 0.0);
  for (let row = 0; row < 2; row++) {
    for (let i = -2; i <= 2; i++) {
      addEll(g, bagMat, [i * 0.34, 0.11 + row * 0.14, 1.48], [0.18, 0.08, 0.11]);
    }
  }
  // Roof periscope & antenna
  addRod(g, palette.iron, [0.35, 1.24, -0.2], [0.35, 1.95, -0.2], 0.02);
  addPart(g, new THREE.CylinderGeometry(0.22, 0.25, 0.18, 12), palette.iron, [-0.32, 1.32, 0.1]);
  return { group: g };
}

// 5. arch-pagoda: East Asian 5-Tier Curved-Eave Pagoda
export function createAsianPagoda(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const crimsonMat = createMaterial('#991b1b', 0.55, 0.1);
  // Stone terrace base + steps
  addBox(g, palette.stone, [0, 0.16, 0], [1.95, 0.32, 1.95], 0.02);
  addBox(g, palette.stone, [0, 0.1, 1.1], [0.55, 0.2, 0.35], 0.01);
  // 5 tiers of timber walls + flared pagoda roofs
  let y = 0.32;
  for (let t = 0; t < 5; t++) {
    const scale = 1 - t * 0.135;
    const w = 1.28 * scale;
    const h = 0.42 * scale;
    addBox(g, crimsonMat, [0, y + h / 2, 0], [w, h, w], 0.015);
    // Flared four-sided pagoda roof with upturned eaves
    const roofCone = addPart(
      g,
      new THREE.ConeGeometry(w * 1.08, 0.26 * scale, 4),
      palette.roof,
      [0, y + h + 0.11 * scale, 0]
    );
    roofCone.rotation.y = Math.PI / 4;
    // Gold corner wind-bells
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addEll(g, palette.gold, [sx * w * 0.72, y + h - 0.02, sz * w * 0.72], [0.03, 0.05, 0.03]);
      }
    }
    y += h + 0.2 * scale;
  }
  // Golden Sorin spire finial with rings
  addRod(g, palette.gold, [0, y, 0], [0, y + 0.68, 0], 0.028);
  for (let r = 0; r < 5; r++) {
    const ring = addRing(g, palette.gold, [0, y + 0.14 + r * 0.09, 0], 0.09 - r * 0.01, 0.012);
    ring.rotation.x = Math.PI / 2;
  }
  return { group: g };
}

// 6. arch-lighthouse: Coastal Striped Lighthouse with Fresnel Lantern Room
export function createCoastalLighthouse(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const redBand = createMaterial('#dc2626', 0.5, 0.1);
  const whiteBand = createMaterial('#f8fafc', 0.5, 0.05);
  // Rocky coastal base & octagonal foundation
  addPart(g, new THREE.DodecahedronGeometry(1.05, 1), palette.stone, [0, 0.18, 0], [1.2, 0.38, 1.2]);
  addPart(g, new THREE.CylinderGeometry(0.68, 0.78, 0.45, 12), palette.stone, [0, 0.52, 0]);
  // Alternating red and white conical bands
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const rBot = 0.65 - i * 0.055;
    const rTop = 0.65 - (i + 1) * 0.055;
    const mat = i % 2 === 0 ? whiteBand : redBand;
    addPart(g, new THREE.CylinderGeometry(rTop, rBot, 0.46, 16), mat, [0, 0.97 + i * 0.46, 0]);
  }
  // Observation gallery deck & railing
  addPart(g, new THREE.CylinderGeometry(0.54, 0.44, 0.1, 16), palette.iron, [0, 3.08, 0]);
  const rail = addRing(g, palette.iron, [0, 3.22, 0], 0.51, 0.018);
  rail.rotation.x = Math.PI / 2;
  // Glass lantern room & glowing Fresnel beacon
  addPart(g, new THREE.CylinderGeometry(0.36, 0.36, 0.44, 12), palette.glass, [0, 3.35, 0]);
  addEll(g, palette.glowOrange, [0, 3.35, 0], [0.22, 0.22, 0.22]);
  // Red cupola dome & lightning rod
  addPart(g, new THREE.SphereGeometry(0.38, 14, 10, 0, TAU, 0, Math.PI * 0.55), redBand, [0, 3.55, 0]);
  addRod(g, palette.gold, [0, 3.9, 0], [0, 4.25, 0], 0.018);
  return { group: g };
}

// 7. arch-courtyard-fountain: Tiered Stone Courtyard Water Fountain
export function createCourtyardFountain(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const waterMat = createMaterial('#0ea5e9', 0.15, 0.1);
  // Octagonal outer pool curb & water surface
  addPart(g, new THREE.CylinderGeometry(1.35, 1.42, 0.36, 8), palette.stone, [0, 0.18, 0]);
  addPart(g, new THREE.CylinderGeometry(1.18, 1.18, 0.28, 8), waterMat, [0, 0.2, 0]);
  // Central carved pedestal + 3 decreasing bowls
  addPart(g, new THREE.CylinderGeometry(0.24, 0.34, 1.65, 12), palette.cream, [0, 0.85, 0]);
  const tiers = [
    { y: 0.78, r: 0.78 },
    { y: 1.28, r: 0.52 },
    { y: 1.68, r: 0.28 },
  ];
  for (const t of tiers) {
    addPart(g, new THREE.CylinderGeometry(t.r, t.r * 0.45, 0.18, 16), palette.cream, [0, t.y, 0]);
    addPart(g, new THREE.CylinderGeometry(t.r * 0.88, t.r * 0.88, 0.04, 16), waterMat, [0, t.y + 0.08, 0]);
  }
  // Top water plume finial
  addEll(g, palette.glowCyan, [0, 1.92, 0], [0.14, 0.26, 0.14]);
  return { group: g };
}

// 8. arch-triumphal-arch: Monumental Classical Triumphal Arch
export function createTriumphalArch(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Twin massive stone piers
  for (const sx of [-0.78, 0.78]) {
    addBox(g, palette.stone, [sx, 0.12, 0], [0.86, 0.24, 1.12], 0.02);
    addBox(g, palette.cream, [sx, 1.15, 0], [0.76, 1.85, 0.96], 0.02);
    // Decorative engaged columns
    for (const cx of [-0.26, 0.26]) {
      addPart(g, new THREE.CylinderGeometry(0.065, 0.075, 1.72, 10), palette.stone, [sx + cx, 1.12, 0.5]);
      addPart(g, new THREE.CylinderGeometry(0.065, 0.075, 1.72, 10), palette.stone, [sx + cx, 1.12, -0.5]);
    }
  }
  // Central semicircular vault arch ring
  const archRing = addPart(
    g,
    new THREE.TorusGeometry(0.46, 0.16, 10, 20, Math.PI),
    palette.stone,
    [0, 1.45, 0],
    [1, 1, 2.8]
  );
  archRing.rotation.z = 0;
  // Upper attic entablature & crowning cornice
  addBox(g, palette.cream, [0, 2.38, 0], [2.42, 0.62, 1.06], 0.02);
  addBox(g, palette.stone, [0, 2.74, 0], [2.56, 0.14, 1.18], 0.02);
  // Golden frieze plaque & chariot crest
  addBox(g, palette.gold, [0, 2.38, 0.54], [1.35, 0.26, 0.04], 0.01);
  addEll(g, palette.gold, [0, 2.96, 0], [0.35, 0.22, 0.22]);
  return { group: g };
}

// 9. arch-granary-barn: Red Timber Gambrel-Roof Granary Barn & Silo
export function createGranaryBarn(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const barnRed = createMaterial('#991b1b', 0.72, 0.05);
  const whiteTrim = createMaterial('#f8fafc', 0.65, 0.02);
  // Stone foundation + red barn body
  addBox(g, palette.stone, [0, 0.1, 0], [2.1, 0.2, 2.3], 0.02);
  addBox(g, barnRed, [0, 0.9, 0], [1.96, 1.45, 2.15], 0.02);
  // Gambrel roof (lower steep slope + upper shallow slope)
  for (const s of [-1, 1]) {
    const lowSlope = addBox(g, palette.roof, [s * 0.78, 1.88, 0], [0.76, 0.08, 2.28], 0.015);
    lowSlope.rotation.z = -s * 0.92;
    const highSlope = addBox(g, palette.roof, [s * 0.32, 2.26, 0], [0.72, 0.08, 2.28], 0.015);
    highSlope.rotation.z = -s * 0.38;
  }
  addBox(g, barnRed, [0, 1.92, 0], [1.18, 0.62, 2.12], 0.02);
  // Double barn doors with white X-braces + hayloft window
  addBox(g, whiteTrim, [0, 0.62, 1.09], [0.88, 0.96, 0.04], 0.01);
  addBox(g, barnRed, [-0.21, 0.62, 1.11], [0.38, 0.88, 0.03], 0.005);
  addBox(g, barnRed, [0.21, 0.62, 1.11], [0.38, 0.88, 0.03], 0.005);
  addBox(g, whiteTrim, [0, 1.88, 1.09], [0.44, 0.48, 0.05], 0.01);
  // Adjacent cylindrical grain silo with dome
  addPart(g, new THREE.CylinderGeometry(0.42, 0.42, 2.35, 16), palette.stone, [1.38, 1.18, -0.35]);
  addPart(g, new THREE.SphereGeometry(0.43, 14, 10, 0, TAU, 0, Math.PI * 0.5), palette.iron, [1.38, 2.35, -0.35]);
  return { group: g };
}

// 10. arch-viaduct: Double-Tiered Roman Stone Aqueduct Viaduct
export function createStoneViaduct(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // 4 tall stone piers supporting lower and upper arches
  const xs = [-1.35, -0.45, 0.45, 1.35];
  for (const x of xs) {
    addBox(g, palette.stone, [x, 0.85, 0], [0.34, 1.7, 0.68], 0.02);
    addBox(g, palette.cream, [x, 2.15, 0], [0.26, 0.85, 0.56], 0.015);
  }
  // 3 Lower arches
  for (const ax of [-0.9, 0, 0.9]) {
    addPart(g, new THREE.TorusGeometry(0.32, 0.1, 8, 16, Math.PI), palette.stone, [ax, 1.28, 0], [1, 1, 3.2]);
  }
  // Middle deck roadway
  addBox(g, palette.cream, [0, 1.72, 0], [3.1, 0.16, 0.74], 0.02);
  // 6 Upper arcade arches
  for (let i = 0; i < 6; i++) {
    const ux = -1.25 + i * 0.5;
    addBox(g, palette.stone, [ux - 0.25, 2.15, 0], [0.12, 0.72, 0.52], 0.01);
    addPart(g, new THREE.TorusGeometry(0.19, 0.065, 8, 12, Math.PI), palette.cream, [ux, 2.28, 0], [1, 1, 3.5]);
  }
  // Top aqueduct water channel
  addBox(g, palette.stone, [0, 2.62, 0], [3.15, 0.22, 0.66], 0.02);
  return { group: g };
}

// 11. arch-factory-chimney: Industrial Brick Smokestack & Boiler House
export function createFactoryChimney(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const brickMat = createMaterial('#9a3412', 0.82, 0.05);
  // Boiler house base
  addBox(g, brickMat, [-0.45, 0.52, 0], [1.25, 1.04, 1.15], 0.02);
  addBox(g, palette.roof, [-0.45, 1.1, 0], [1.35, 0.14, 1.25], 0.02);
  // Tall tapered cylindrical brick smokestack
  addBox(g, palette.stone, [0.42, 0.35, 0], [0.86, 0.7, 0.86], 0.02);
  addPart(g, new THREE.CylinderGeometry(0.24, 0.38, 3.4, 16), brickMat, [0.42, 2.35, 0]);
  // Iron reinforcement bands & flared crown rim
  for (const y of [1.2, 2.0, 2.8, 3.6, 3.98]) {
    const r = 0.37 - ((y - 0.7) / 3.4) * 0.13;
    const band = addRing(g, palette.iron, [0.42, y, 0], r + 0.015, 0.02);
    band.rotation.x = Math.PI / 2;
  }
  addPart(g, new THREE.CylinderGeometry(0.31, 0.25, 0.18, 16), palette.iron, [0.42, 4.08, 0]);
  return { group: g };
}

// 12. arch-bastion-tower: Star-Fort Angular Bastion Tower with Cannon Ports
export function createBastionTower(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Sloped pentagonal/hexagonal stone bastion base
  addPart(g, new THREE.CylinderGeometry(1.18, 1.48, 1.45, 6), palette.stone, [0, 0.725, 0]);
  // Crenellated parapet wall & merlons
  addPart(g, new THREE.CylinderGeometry(1.26, 1.2, 0.34, 6), palette.cream, [0, 1.58, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const m = addBox(g, palette.stone, [Math.cos(a) * 1.05, 1.88, Math.sin(a) * 1.05], [0.48, 0.28, 0.24], 0.02);
    m.rotation.y = -a + Math.PI / 2;
    // Protruding iron cannon barrel
    if (i < 3) {
      addRod(
        g,
        palette.iron,
        [Math.cos(a) * 0.85, 1.62, Math.sin(a) * 0.85],
        [Math.cos(a) * 1.42, 1.66, Math.sin(a) * 1.42],
        0.055
      );
    }
  }
  // Corner sentry Bartizan watch turret
  addPart(g, new THREE.CylinderGeometry(0.28, 0.12, 0.65, 8), palette.stone, [0, 1.85, 1.18]);
  addPart(g, new THREE.ConeGeometry(0.32, 0.42, 8), palette.roof, [0, 2.38, 1.18]);
  return { group: g };
}

// 13. arch-palisade-wall: Sharpened Timber Log Palisade Wall & Catwalk
export function createPalisadeWall(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Row of 15 vertical sharpened timber logs
  for (let i = -7; i <= 7; i++) {
    const x = i * 0.19;
    const h = 1.68 + ((Math.abs(i * 7) % 3) * 0.08);
    addPart(g, new THREE.CylinderGeometry(0.095, 0.105, h, 8), palette.wood, [x, h / 2, 0]);
    addPart(g, new THREE.ConeGeometry(0.098, 0.28, 8), palette.cream, [x, h + 0.14, 0]);
  }
  // Horizontal binding beams & rear defender catwalk + ladder
  addBox(g, palette.wood, [0, 0.55, -0.12], [2.85, 0.1, 0.1], 0.01);
  addBox(g, palette.wood, [0, 1.25, -0.12], [2.85, 0.1, 0.1], 0.01);
  addBox(g, palette.wood, [0, 1.05, -0.42], [2.75, 0.08, 0.58], 0.01);
  for (const lx of [-1.1, 0, 1.1]) {
    addRod(g, palette.wood, [lx, 0, -0.65], [lx, 1.05, -0.65], 0.045);
  }
  return { group: g };
}

// 14. arch-clock-tower: Civic 4-Dial Clock Tower with Belfry Spire
export function createCivicClockTower(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Plinth & tall brick/stone shaft
  addBox(g, palette.stone, [0, 0.25, 0], [1.18, 0.5, 1.18], 0.02);
  addBox(g, palette.cream, [0, 1.55, 0], [0.92, 2.1, 0.92], 0.02);
  // Clock housing cube + 4 illuminated clock faces with hands
  addBox(g, palette.stone, [0, 2.95, 0], [1.06, 0.82, 1.06], 0.02);
  const dirs: [number, number, number, number][] = [
    [0, 0.54, 0, 0],
    [0, -0.54, 0, Math.PI],
    [0.54, 0, 1, Math.PI / 2],
    [-0.54, 0, 1, -Math.PI / 2],
  ];
  for (const [dx, dz, , ry] of dirs) {
    const dial = new THREE.Group();
    dial.position.set(dx, 2.95, dz);
    dial.rotation.y = ry;
    g.add(dial);
    const ring = addRing(dial, palette.gold, [0, 0, 0], 0.28, 0.028);
    ring.rotation.y = 0;
    const face = addPart(dial, new THREE.CylinderGeometry(0.26, 0.26, 0.02, 20), palette.cream, [0, 0, 0]);
    face.rotation.x = Math.PI / 2;
    addBox(dial, palette.iron, [0, 0.08, 0.02], [0.025, 0.16, 0.02], 0.002);
    addBox(dial, palette.iron, [0.06, 0, 0.02], [0.12, 0.022, 0.02], 0.002);
  }
  // Steep pyramidal belfry roof + weathervane
  const spire = addPart(g, new THREE.ConeGeometry(0.78, 1.25, 4), palette.roof, [0, 3.98, 0]);
  spire.rotation.y = Math.PI / 4;
  addRod(g, palette.gold, [0, 4.58, 0], [0, 4.95, 0], 0.018);
  return { group: g };
}

// 15. arch-tent-canopy: Royal Medieval Pavilion Tent Canopy
export function createRoyalPavilionTent(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const royalBlue = createMaterial('#1d4ed8', 0.75, 0.05);
  // Circular draped fabric walls
  addPart(g, new THREE.CylinderGeometry(1.18, 1.25, 1.25, 12), palette.cream, [0, 0.625, 0]);
  // Scalloped gold valance trim around eaves
  const valance = addRing(g, palette.gold, [0, 1.25, 0], 1.2, 0.055);
  valance.rotation.x = Math.PI / 2;
  // Conical striped pavilion roof + center pole + waving pennant
  addPart(g, new THREE.ConeGeometry(1.28, 0.95, 12), royalBlue, [0, 1.72, 0]);
  addRod(g, palette.wood, [0, 0, 0], [0, 2.55, 0], 0.045);
  addBox(g, palette.gold, [0.22, 2.45, 0], [0.42, 0.16, 0.02], 0.005);
  // Open front entrance flaps
  addBox(g, palette.iron, [0, 0.55, 1.21], [0.52, 1.05, 0.05], 0.01);
  return { group: g };
}

// 16. arch-rustic-fireplace / furn-fireplace: Stone Hearth Fireplace with Glowing Logs
export function createStoneFireplace(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const sootMat = createMaterial('#0f172a', 0.95, 0.05);
  // Hearth slab & twin stone jambs
  addBox(g, palette.stone, [0, 0.08, 0.1], [1.85, 0.16, 1.05], 0.02);
  addBox(g, palette.stone, [-0.62, 0.72, 0], [0.46, 1.15, 0.78], 0.02);
  addBox(g, palette.stone, [0.62, 0.72, 0], [0.46, 1.15, 0.78], 0.02);
  addBox(g, sootMat, [0, 0.65, -0.14], [0.84, 1.0, 0.48], 0.01);
  // Heavy timber mantel shelf + upper chimney breast
  addBox(g, palette.wood, [0, 1.34, 0.08], [1.92, 0.16, 0.92], 0.02);
  addBox(g, palette.stone, [0, 2.15, -0.05], [1.28, 1.48, 0.68], 0.02);
  // Burning logs & glowing orange flames in firebox
  addRod(g, palette.wood, [-0.24, 0.22, 0.05], [0.24, 0.26, 0.12], 0.055);
  addRod(g, palette.wood, [-0.2, 0.26, 0.15], [0.22, 0.22, -0.02], 0.055);
  addEll(g, palette.glowOrange, [0, 0.42, 0.06], [0.22, 0.28, 0.14]);
  return { group: g };
}

// 17. arch-desert-mosque: Domed Desert Mosque with Tall Minaret & Crescent Finials
export function createDesertMosque(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Main prayer hall with arched entrance iwan
  addBox(g, palette.cream, [-0.25, 0.68, 0], [1.85, 1.36, 1.75], 0.02);
  addBox(g, palette.stone, [-0.25, 0.78, 0.9], [0.76, 1.42, 0.18], 0.02);
  addBox(g, palette.roof, [-0.25, 0.56, 0.95], [0.46, 0.95, 0.12], 0.01);
  // Grand central golden/turquoise dome + drum
  addPart(g, new THREE.CylinderGeometry(0.68, 0.72, 0.28, 16), palette.stone, [-0.25, 1.48, 0]);
  addPart(g, new THREE.SphereGeometry(0.68, 18, 14, 0, TAU, 0, Math.PI * 0.58), palette.gold, [-0.25, 1.62, 0]);
  addRod(g, palette.gold, [-0.25, 2.28, 0], [-0.25, 2.58, 0], 0.02);
  const crescent1 = addPart(g, new THREE.TorusGeometry(0.09, 0.02, 8, 16, Math.PI * 1.4), palette.gold, [-0.25, 2.66, 0]);
  crescent1.rotation.z = Math.PI * 0.3;
  // Tall slender minaret tower with balcony & dome
  addPart(g, new THREE.CylinderGeometry(0.2, 0.26, 2.65, 12), palette.cream, [1.05, 1.325, 0.65]);
  addPart(g, new THREE.CylinderGeometry(0.32, 0.24, 0.12, 12), palette.stone, [1.05, 2.25, 0.65]);
  addPart(g, new THREE.SphereGeometry(0.2, 12, 10, 0, TAU, 0, Math.PI * 0.6), palette.gold, [1.05, 2.65, 0.65]);
  return { group: g };
}

// 18. arch-gothic-cathedral: Twin-Spire Gothic Cathedral with Rose Window & Buttresses
export function createGothicCathedral(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Nave body & pitched roof
  addBox(g, palette.stone, [0, 0.95, -0.25], [1.55, 1.9, 2.25], 0.02);
  const roof = addPart(g, new THREE.ConeGeometry(1.12, 0.95, 4), palette.roof, [0, 2.35, -0.25], [1, 1, 1.95]);
  roof.rotation.y = Math.PI / 4;
  // Twin west facade towers + tall pointed spires
  for (const sx of [-0.62, 0.62]) {
    addBox(g, palette.cream, [sx, 1.45, 0.78], [0.58, 2.9, 0.58], 0.02);
    const spire = addPart(g, new THREE.ConeGeometry(0.42, 1.45, 4), palette.roof, [sx, 3.6, 0.78]);
    spire.rotation.y = Math.PI / 4;
  }
  // Central Rose Window + Triple Gothic Portals
  const rose = addRing(g, palette.gold, [0, 1.52, 0.92], 0.28, 0.035);
  rose.rotation.y = 0;
  const roseGlass = addPart(g, new THREE.CylinderGeometry(0.26, 0.26, 0.04, 16), palette.glass, [0, 1.52, 0.91]);
  roseGlass.rotation.x = Math.PI / 2;
  for (const px of [-0.58, 0, 0.58]) {
    addBox(g, palette.wood, [px, 0.42, 1.06], [0.28, 0.76, 0.08], 0.01);
  }
  return { group: g };
}

// 19. arch-saloon: Frontier Wild West Timber Saloon with False Front & Batwing Doors
export function createWesternSaloon(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Raised wooden boardwalk porch
  addBox(g, palette.wood, [0, 0.08, 0.25], [2.15, 0.16, 2.15], 0.02);
  // Main timber building + taller stepped false-front facade
  addBox(g, palette.cream, [0, 1.05, -0.1], [1.95, 1.78, 1.45], 0.02);
  addBox(g, palette.wood, [0, 1.38, 0.64], [2.02, 2.42, 0.12], 0.02);
  addBox(g, palette.gold, [0, 2.15, 0.72], [1.45, 0.36, 0.05], 0.01);
  // Covered porch canopy & 4 support posts
  addBox(g, palette.roof, [0, 1.18, 0.98], [2.08, 0.08, 0.68], 0.01);
  for (const x of [-0.92, -0.32, 0.32, 0.92]) {
    addRod(g, palette.wood, [x, 0.16, 1.24], [x, 1.18, 1.24], 0.035);
  }
  // Iconic swinging batwing saloon doors
  addBox(g, palette.wood, [-0.16, 0.58, 0.66], [0.26, 0.52, 0.04], 0.008);
  addBox(g, palette.wood, [0.16, 0.58, 0.66], [0.26, 0.52, 0.04], 0.008);
  return { group: g };
}

// 20. arch-wind-turbine: Modern 3-Blade Wind Turbine Generator
export function createWindTurbine(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const whiteMat = createMaterial('#f8fafc', 0.35, 0.15);
  // Concrete pad & tall sleek tapered tubular tower
  addPart(g, new THREE.CylinderGeometry(0.55, 0.65, 0.22, 16), palette.stone, [0, 0.11, 0]);
  addPart(g, new THREE.CylinderGeometry(0.11, 0.24, 3.65, 16), whiteMat, [0, 1.98, 0]);
  // Streamlined nacelle housing on top
  addBox(g, whiteMat, [0, 3.85, -0.08], [0.34, 0.32, 0.78], 0.06);
  // Nose cone spinner & 3 aerodynamic blades
  const rotor = new THREE.Group();
  rotor.position.set(0, 3.85, 0.35);
  g.add(rotor);
  const nose = addPart(rotor, new THREE.ConeGeometry(0.15, 0.32, 14), whiteMat, [0, 0, 0.12]);
  nose.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Group();
    blade.rotation.z = (i * TAU) / 3;
    rotor.add(blade);
    addEll(blade, whiteMat, [0, 0.82, 0], [0.075, 0.82, 0.022]);
  }
  return {
    group: g,
    update(dt: number) {
      rotor.rotation.z -= dt * 1.4;
    },
  };
}

// 21. arch-geodesic-dome: Faceted Geodesic Biosphere Conservatory Dome
export function createGeodesicDome(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Circular concrete ring wall
  addPart(g, new THREE.CylinderGeometry(1.48, 1.54, 0.28, 24), palette.stone, [0, 0.14, 0]);
  // Faceted glass geodesic hemisphere + wireframe strut cage
  const glassDome = new THREE.IcosahedronGeometry(1.42, 2);
  addPart(g, glassDome, palette.glass, [0, 0.22, 0], [1, 0.85, 1]);
  const wireMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.8, wireframe: true });
  addPart(g, new THREE.IcosahedronGeometry(1.435, 2), wireMat, [0, 0.22, 0], [1, 0.85, 1]);
  // Airlock entrance tunnel + interior lush foliage
  addBox(g, palette.iron, [0, 0.42, 1.42], [0.58, 0.68, 0.48], 0.02);
  addEll(g, palette.leaf, [0, 0.55, 0], [0.75, 0.48, 0.75]);
  return { group: g };
}

// 22. arch-gas-station: Retro Roadside Service Gas Station with Canopy & Fuel Pumps
export function createRetroGasStation(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const redTrim = createMaterial('#dc2626', 0.4, 0.2);
  // Concrete forecourt pad + attendant kiosk building
  addBox(g, palette.stone, [0, 0.06, 0], [2.6, 0.12, 2.1], 0.02);
  addBox(g, palette.cream, [0, 0.68, -0.52], [1.85, 1.12, 0.82], 0.02);
  addBox(g, palette.glass, [0, 0.68, -0.1], [1.35, 0.68, 0.04], 0.005);
  // Overhanging flat canopy with neon red fascia + twin support columns
  addBox(g, palette.cream, [0, 1.52, 0.22], [2.45, 0.18, 1.45], 0.02);
  addBox(g, redTrim, [0, 1.52, 0.95], [2.48, 0.2, 0.04], 0.01);
  for (const x of [-0.82, 0.82]) {
    addRod(g, palette.iron, [x, 0.12, 0.55], [x, 1.45, 0.55], 0.055);
    // Retro fuel pump with glowing globe sign on top
    addBox(g, redTrim, [x * 0.5, 0.42, 0.55], [0.24, 0.58, 0.18], 0.02);
    addEll(g, palette.glowOrange, [x * 0.5, 0.8, 0.55], [0.09, 0.09, 0.09]);
  }
  return { group: g };
}

// 23. arch-water-tower: Stilted Timber Barrel Rooftop/Railroad Water Tower
export function createWaterTower(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // 4 inclined timber trestle legs with cross-bracing
  const legCoords: [number, number][] = [
    [-0.55, -0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [0.55, 0.55],
  ];
  for (const [lx, lz] of legCoords) {
    addRod(g, palette.wood, [lx * 1.25, 0, lz * 1.25], [lx * 0.78, 1.85, lz * 0.78], 0.055);
  }
  addBox(g, palette.wood, [0, 0.95, 0], [1.12, 0.07, 1.12], 0.01);
  addPart(g, new THREE.CylinderGeometry(0.86, 0.86, 0.1, 16), palette.wood, [0, 1.88, 0]);
  // Cylindrical wooden stave tank with iron hoops + conical roof & spout
  addPart(g, new THREE.CylinderGeometry(0.74, 0.76, 1.25, 16), palette.wood, [0, 2.52, 0]);
  for (const y of [2.05, 2.45, 2.85]) {
    const hoop = addRing(g, palette.iron, [0, y, 0], 0.76, 0.018);
    hoop.rotation.x = Math.PI / 2;
  }
  addPart(g, new THREE.ConeGeometry(0.84, 0.52, 16), palette.roof, [0, 3.38, 0]);
  addRod(g, palette.iron, [0, 1.85, 0], [0, 0, 0], 0.065);
  return { group: g };
}

