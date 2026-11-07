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

// ============================================================================
// WEAPONS
// ============================================================================

// 1. wpn-battleaxe: Double-Bitted Bearded Battleaxe
export function createBattleaxe(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steelMat = createMaterial('#e2e8f0', 0.22, 0.9);
  addRod(g, palette.wood, [0, 0.05, 0], [0, 1.45, 0], 0.032);
  addEll(g, palette.gold, [0, 0.06, 0], [0.05, 0.05, 0.05]);
  addPart(g, new THREE.ConeGeometry(0.038, 0.18, 10), steelMat, [0, 1.54, 0]);
  addBox(g, palette.gold, [0, 1.18, 0], [0.09, 0.18, 0.08], 0.01);
  // Twin curved crescent axe blades
  for (const sx of [-1, 1]) {
    addBox(g, steelMat, [sx * 0.22, 1.18, 0], [0.36, 0.44, 0.025], 0.008);
    const edge = addPart(g, new THREE.CylinderGeometry(0.26, 0.26, 0.022, 18, 1, false, 0, Math.PI), steelMat, [sx * 0.24, 1.18, 0]);
    edge.rotation.x = Math.PI / 2;
    edge.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
  }
  return { group: g };
}

// 2. wpn-hunting-bow: Recurve Hunting Bow with Nocked Arrow
export function createHuntingBow(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const stringMat = createMaterial('#e2e8f0', 0.4, 0.1);
  // Curved bow stave + taut string + horizontal nocked arrow with steel broadhead & fletching
  const arc = addPart(g, new THREE.TorusGeometry(0.68, 0.028, 10, 28, Math.PI * 0.88), palette.wood, [0, 0.78, 0]);
  arc.rotation.z = -Math.PI * 0.44;
  addRod(g, stringMat, [-0.12, 0.12, 0], [-0.12, 1.44, 0], 0.005);
  addRod(g, palette.wood, [-0.18, 0.78, 0], [0.78, 0.78, 0], 0.012);
  const tip = addPart(g, new THREE.ConeGeometry(0.032, 0.1, 8), palette.iron, [0.82, 0.78, 0]);
  tip.rotation.z = -Math.PI / 2;
  addBox(g, palette.cream, [-0.12, 0.78, 0], [0.12, 0.06, 0.015], 0.003);
  return { group: g };
}

// 3. wpn-katana / weap-katana: Japanese Samurai Katana Sword & Saya Scabbard on Stand
export function createKatanaSword(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bladeSteel = createMaterial('#f1f5f9', 0.15, 0.95);
  const lacquerBlack = createMaterial('#09090b', 0.2, 0.3);
  const hiltCrimson = createMaterial('#991b1b', 0.65, 0.05);

  // Wooden display stand (katana-kake)
  addBox(g, lacquerBlack, [0, 0.04, 0], [0.78, 0.08, 0.28], 0.01);
  for (const sx of [-0.26, 0.26]) {
    addBox(g, lacquerBlack, [sx, 0.32, 0], [0.06, 0.56, 0.08], 0.01);
  }
  // Upper rack: Unsheathed Katana (wrapped tsuka hilt, golden circular tsuba, gleaming blade)
  addRod(g, hiltCrimson, [-0.62, 0.52, 0.04], [-0.24, 0.54, 0.04], 0.024);
  const tsuba = addPart(g, new THREE.CylinderGeometry(0.065, 0.065, 0.015, 16), palette.gold, [-0.24, 0.54, 0.04]);
  tsuba.rotation.z = Math.PI / 2;
  addBox(g, bladeSteel, [0.28, 0.56, 0.04], [1.04, 0.038, 0.01], 0.003);
  // Lower rack: Black lacquered saya scabbard
  addRod(g, lacquerBlack, [-0.48, 0.28, 0.04], [0.58, 0.3, 0.04], 0.026);
  return { group: g };
}

// 4. wpn-crossbow / weap-crossbow: Heavy Tactical Crossbow with Prod Limbs & Scope
export function createHeavyCrossbow(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steelMat = createMaterial('#cbd5e1', 0.25, 0.88);
  // Wooden stock & flight rail + horizontal bow prod limbs + taut string + loaded bolt + scope + stirrup
  addBox(g, palette.wood, [0, 0.42, -0.12], [0.12, 0.16, 1.18], 0.02);
  addBox(g, palette.wood, [0, 0.26, -0.52], [0.11, 0.24, 0.34], 0.02);
  addBox(g, palette.iron, [0, 0.46, 0.38], [0.96, 0.045, 0.09], 0.01);
  addRod(g, steelMat, [-0.46, 0.46, 0.36], [0, 0.46, -0.18], 0.006);
  addRod(g, steelMat, [0.46, 0.46, 0.36], [0, 0.46, -0.18], 0.006);
  addRod(g, palette.wood, [0, 0.51, -0.15], [0, 0.51, 0.58], 0.014);
  const scope = addPart(g, new THREE.CylinderGeometry(0.032, 0.032, 0.32, 12), palette.iron, [0, 0.58, -0.12]);
  scope.rotation.x = Math.PI / 2;
  addRing(g, palette.iron, [0, 0.42, 0.56], 0.09, 0.015).rotation.x = Math.PI / 2;
  return { group: g };
}

// 5. wpn-halberd / weap-halberd: Medieval Infantry Polearm Halberd
export function createHalberdPolearm(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steelMat = createMaterial('#e2e8f0', 0.22, 0.9);
  addRod(g, palette.wood, [0, 0, 0], [0, 1.85, 0], 0.028);
  // Top armor-piercing spear spike + forward crescent axe blade + rear fluke hook
  addPart(g, new THREE.ConeGeometry(0.038, 0.42, 8), steelMat, [0, 2.06, 0]);
  addBox(g, steelMat, [0.18, 1.68, 0], [0.32, 0.38, 0.022], 0.006);
  const fluke = addPart(g, new THREE.ConeGeometry(0.04, 0.26, 8), steelMat, [-0.14, 1.68, 0]);
  fluke.rotation.z = Math.PI * 0.6;
  return { group: g };
}

// 6. wpn-warhammer: Heavy Flanged Knightly Warhammer
export function createWarhammer(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steelMat = createMaterial('#cbd5e1', 0.28, 0.88);
  addRod(g, palette.wood, [0, 0.04, 0], [0, 1.28, 0], 0.032);
  addEll(g, palette.gold, [0, 0.05, 0], [0.05, 0.05, 0.05]);
  // Heavy rectangular striking hammer block + rear curved armor-piercing spike + top spike
  addBox(g, steelMat, [0.14, 1.15, 0], [0.28, 0.16, 0.16], 0.02);
  const backSpike = addPart(g, new THREE.ConeGeometry(0.05, 0.28, 8), steelMat, [-0.16, 1.15, 0]);
  backSpike.rotation.z = Math.PI * 0.55;
  addPart(g, new THREE.ConeGeometry(0.035, 0.18, 8), steelMat, [0, 1.36, 0]);
  return { group: g };
}

// 7. wpn-revolver: Six-Shot Heavy Revolver Handgun
export function createRevolverPistol(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steelMat = createMaterial('#cbd5e1', 0.22, 0.9);
  // Angled walnut grip + frame + 6-chamber revolving cylinder + long ribbed barrel + sight
  const grip = addBox(g, palette.wood, [0, 0.28, -0.28], [0.09, 0.38, 0.16], 0.03);
  grip.rotation.x = -0.32;
  addBox(g, steelMat, [0, 0.52, -0.05], [0.1, 0.22, 0.38], 0.02);
  const cyl = addPart(g, new THREE.CylinderGeometry(0.095, 0.095, 0.22, 12), palette.iron, [0, 0.54, -0.04]);
  cyl.rotation.x = Math.PI / 2;
  const barrel = addPart(g, new THREE.CylinderGeometry(0.042, 0.042, 0.58, 14), steelMat, [0, 0.58, 0.36]);
  barrel.rotation.x = Math.PI / 2;
  addBox(g, steelMat, [0, 0.63, 0.36], [0.04, 0.04, 0.56], 0.005);
  return { group: g };
}

// 8. wpn-rifle / weap-sniper-rifle: Marksman Sniper Rifle with Scope & Bipod
export function createSniperRifle(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const gunMetal = createMaterial('#1e293b', 0.35, 0.82);
  // Buttstock, receiver, pistol grip, box magazine, long free-floating barrel, telescopic scope & bipod legs
  addBox(g, palette.wood, [0, 0.44, -0.58], [0.08, 0.18, 0.48], 0.02);
  addBox(g, gunMetal, [0, 0.48, -0.06], [0.09, 0.14, 0.62], 0.02);
  addBox(g, gunMetal, [0, 0.32, 0.02], [0.07, 0.22, 0.16], 0.01);
  const barrel = addPart(g, new THREE.CylinderGeometry(0.024, 0.028, 0.92, 12), gunMetal, [0, 0.5, 0.68]);
  barrel.rotation.x = Math.PI / 2;
  const scope = addPart(g, new THREE.CylinderGeometry(0.042, 0.036, 0.42, 14), gunMetal, [0, 0.62, -0.04]);
  scope.rotation.x = Math.PI / 2;
  addRod(g, gunMetal, [0, 0.46, 0.58], [-0.22, 0.04, 0.68], 0.016);
  addRod(g, gunMetal, [0, 0.46, 0.58], [0.22, 0.04, 0.68], 0.016);
  return { group: g };
}

// 9. wpn-plasma-blaster: Sci-Fi Energy Plasma Blaster Pistol
export function createPlasmaBlaster(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const hullMat = createMaterial('#334155', 0.3, 0.75);
  const grip = addBox(g, palette.iron, [0, 0.28, -0.22], [0.1, 0.36, 0.16], 0.03);
  grip.rotation.x = -0.28;
  addBox(g, hullMat, [0, 0.54, 0.08], [0.16, 0.24, 0.68], 0.03);
  // Glowing cyan plasma cooling coils along barrel
  for (const z of [-0.08, 0.06, 0.2, 0.34]) {
    addBox(g, palette.glowCyan, [0, 0.56, z], [0.18, 0.14, 0.05], 0.01);
  }
  addEll(g, palette.glowCyan, [0, 0.54, 0.44], [0.06, 0.06, 0.04]);
  return { group: g };
}

// 10. wpn-dagger: Ornate Double-Edged Assassin Stiletto Dagger
export function createStilettoDagger(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bladeMat = createMaterial('#f1f5f9', 0.15, 0.95);
  addEll(g, palette.gold, [0, 0.08, 0], [0.06, 0.06, 0.06]);
  addRod(g, palette.wood, [0, 0.12, 0], [0, 0.38, 0], 0.036);
  addBox(g, palette.gold, [0, 0.4, 0], [0.32, 0.045, 0.06], 0.01);
  const blade = addPart(g, new THREE.ConeGeometry(0.065, 0.68, 4), bladeMat, [0, 0.76, 0], [1, 1, 0.32]);
  blade.rotation.y = Math.PI / 4;
  return { group: g };
}

// 11. wpn-ballista: Heavy Timber Siege Ballista on Wheeled Mount
export function createSiegeBallista(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Wheeled timber base frame + inclined slider trough + twin torsion skeins + bow arms + iron siege bolt
  addBox(g, palette.wood, [0, 0.22, 0], [1.12, 0.14, 1.48], 0.02);
  for (const sx of [-0.58, 0.58]) {
    for (const sz of [-0.52, 0.52]) {
      addPart(g, new THREE.CylinderGeometry(0.22, 0.22, 0.1, 14), palette.wood, [sx, 0.22, sz]).rotation.z = Math.PI / 2;
    }
  }
  const trough = addBox(g, palette.wood, [0, 0.58, 0], [0.22, 0.16, 1.68], 0.02);
  trough.rotation.x = -0.18;
  for (const sx of [-0.28, 0.28]) {
    addPart(g, new THREE.CylinderGeometry(0.11, 0.11, 0.44, 12), palette.iron, [sx, 0.68, 0.48]);
    addRod(g, palette.wood, [sx, 0.68, 0.48], [sx * 3.1, 0.64, 0.08], 0.045);
  }
  addRod(g, palette.iron, [0, 0.68, -0.45], [0, 0.84, 0.92], 0.028);
  return { group: g };
}

// 12. wpn-morningstar: Spiked Iron Morningstar Flail
export function createMorningstarFlail(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Wooden handle + chain links + heavy iron sphere studded with 14 conical spikes
  addRod(g, palette.wood, [-0.18, 0.05, 0], [-0.18, 1.05, 0], 0.035);
  addRod(g, palette.iron, [-0.18, 1.05, 0], [0.18, 0.72, 0], 0.018);
  const ball = new THREE.Group();
  ball.position.set(0.18, 0.58, 0);
  g.add(ball);
  addEll(ball, palette.iron, [0, 0, 0], [0.18, 0.18, 0.18]);
  const dirs: [number, number, number][] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [0.7, 0.7, 0], [-0.7, 0.7, 0], [0.7, -0.7, 0], [-0.7, -0.7, 0],
  ];
  for (const [dx, dy, dz] of dirs) {
    addRod(ball, palette.iron, [dx * 0.14, dy * 0.14, dz * 0.14], [dx * 0.3, dy * 0.3, dz * 0.3], 0.022);
  }
  return { group: g };
}

// 13. wpn-scythe: Grim Reaper Curved Blade Scythe
export function createReaperScythe(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bladeMat = createMaterial('#e2e8f0', 0.2, 0.92);
  // Tall wooden snath pole + side grip handle + long sweeping curved reaper blade at top
  addRod(g, palette.wood, [-0.15, 0, 0], [0, 1.78, 0], 0.03);
  addRod(g, palette.wood, [-0.08, 0.95, 0], [0.14, 0.95, 0.12], 0.022);
  const blade = addPart(
    g,
    new THREE.TorusGeometry(0.56, 0.045, 8, 24, Math.PI * 0.68),
    bladeMat,
    [0.42, 1.48, 0],
    [1.15, 0.85, 0.28]
  );
  blade.rotation.z = Math.PI * 0.22;
  return { group: g };
}

// 14. weap-raygun: Retro-Futuristic Finned Atomic Raygun
export function createRetroRaygun(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const atomicRed = createMaterial('#dc2626', 0.25, 0.45);
  const grip = addBox(g, atomicRed, [0, 0.28, -0.18], [0.09, 0.36, 0.15], 0.03);
  grip.rotation.x = -0.3;
  // Tapered atomic fuselage + top dorsal fin + 3 concentric brass emitter rings + glowing tip
  const body = addPart(g, new THREE.CylinderGeometry(0.05, 0.14, 0.72, 16), atomicRed, [0, 0.54, 0.08]);
  body.rotation.x = Math.PI / 2;
  addBox(g, palette.gold, [0, 0.68, -0.05], [0.025, 0.16, 0.38], 0.01);
  for (const [z, r] of [
    [0.24, 0.12],
    [0.34, 0.095],
    [0.44, 0.07],
  ]) {
    addRing(g, palette.gold, [0, 0.54, z], r, 0.016).rotation.y = 0;
  }
  addEll(g, palette.glowCyan, [0, 0.54, 0.52], [0.055, 0.055, 0.055]);
  return { group: g };
}

// 15. weap-flamethrower: Twin-Tank Backpack & Igniter Wand Flamethrower
export function createFlamethrower(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const tankRed = createMaterial('#b91c1c', 0.35, 0.5);
  // Twin vertical pressurized fuel cylinders + spherical top caps + connecting hose + projector wand
  for (const sx of [-0.18, 0.18]) {
    addPart(g, new THREE.CylinderGeometry(0.14, 0.14, 0.78, 16), tankRed, [sx, 0.48, -0.15]);
    addPart(g, new THREE.SphereGeometry(0.14, 14, 10), tankRed, [sx, 0.87, -0.15]);
  }
  addBox(g, palette.iron, [0, 0.52, -0.15], [0.46, 0.12, 0.32], 0.02);
  addRod(g, palette.iron, [0.18, 0.25, -0.15], [0.22, 0.45, 0.18], 0.028);
  addRod(g, palette.iron, [0.22, 0.45, 0.18], [0.22, 0.56, 0.78], 0.036);
  addEll(g, palette.glowOrange, [0.22, 0.58, 0.84], [0.06, 0.08, 0.08]);
  return { group: g };
}

// 16. weap-shuriken: Four-Pointed Steel Ninja Throwing Star Shuriken
export function createShurikenStar(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steelMat = createMaterial('#e2e8f0', 0.18, 0.92);
  // Standing 4-pointed star with central brass ring
  const star = new THREE.Group();
  star.position.set(0, 0.58, 0);
  g.add(star);
  for (let i = 0; i < 4; i++) {
    const blade = addPart(star, new THREE.ConeGeometry(0.14, 0.52, 4), steelMat, [0, 0, 0], [1, 1, 0.22]);
    blade.rotation.z = (i * Math.PI) / 2;
    blade.translateY(0.22);
  }
  addRing(star, palette.gold, [0, 0, 0], 0.1, 0.025).rotation.y = 0;
  return { group: g };
}

// ============================================================================
// SCI-FI
// ============================================================================

// 17. scifi-centrifuge: Orbital Rotating Gravity Centrifuge Ring
export function createGravityCentrifuge(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const hullMat = createMaterial('#e2e8f0', 0.3, 0.65);
  // Central docking spine + rotating outer habitat ring + 4 radial spokes + habitat pods
  addPart(g, new THREE.CylinderGeometry(0.22, 0.26, 1.85, 16), palette.iron, [0, 0.925, 0]);
  const ringGroup = new THREE.Group();
  ringGroup.position.set(0, 1.05, 0);
  g.add(ringGroup);
  addRing(ringGroup, hullMat, [0, 0, 0], 1.12, 0.12).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    addRod(ringGroup, palette.iron, [0, 0, 0], [Math.cos(a) * 1.12, 0, Math.sin(a) * 1.12], 0.055);
    addBox(ringGroup, palette.glowCyan, [Math.cos(a) * 1.12, 0, Math.sin(a) * 1.12], [0.28, 0.24, 0.28], 0.02);
  }
  return {
    group: g,
    update(dt: number) {
      ringGroup.rotation.y += dt * 0.65;
    },
  };
}

// 18. scifi-satellite: Orbital Communications Satellite with Solar Wings & Dish
export function createOrbitalSatellite(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const solarMat = createMaterial('#1d4ed8', 0.2, 0.7);
  // Gold thermal-foil bus + forward parabolic dish + twin long solar panel wings
  addPart(g, new THREE.CylinderGeometry(0.32, 0.32, 0.86, 8), palette.gold, [0, 0.95, 0]);
  addBox(g, solarMat, [-1.15, 0.95, 0], [1.65, 0.48, 0.03], 0.005);
  addBox(g, solarMat, [1.15, 0.95, 0], [1.65, 0.48, 0.03], 0.005);
  addPart(g, new THREE.SphereGeometry(0.38, 16, 12, 0, TAU, 0, 0.7), palette.cream, [0, 1.52, 0]);
  addRod(g, palette.iron, [0, 1.38, 0], [0, 1.78, 0], 0.02);
  return { group: g };
}

// 19. scifi-cryo-pod: Vertical Cryo-Stasis Chamber Pod with Glowing Bio-Glass
export function createCryoStasisPod(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const hullMat = createMaterial('#475569', 0.32, 0.75);
  // Base pedestal + inclined stasis capsule + glowing cyan inner core + top cap + front monitor console
  addPart(g, new THREE.CylinderGeometry(0.56, 0.64, 0.24, 16), hullMat, [0, 0.12, 0]);
  const pod = new THREE.Group();
  pod.position.set(0, 1.08, -0.05);
  pod.rotation.x = -0.18;
  g.add(pod);
  addBox(pod, hullMat, [0, 0, -0.18], [0.68, 1.78, 0.22], 0.04);
  addPart(pod, new THREE.CylinderGeometry(0.32, 0.32, 1.56, 18), palette.glass, [0, 0, 0.06]);
  addPart(pod, new THREE.CylinderGeometry(0.22, 0.22, 1.38, 14), palette.glowCyan, [0, 0, 0.06]);
  addPart(pod, new THREE.SphereGeometry(0.35, 16, 12), hullMat, [0, 0.82, 0.02]);
  return { group: g };
}

// 20. scifi-holo-emitter: Circular Holographic Emitter Pedestal & Floating Globe
export function createHoloEmitter(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  addPart(g, new THREE.CylinderGeometry(0.52, 0.64, 0.36, 16), palette.iron, [0, 0.18, 0]);
  addPart(g, new THREE.CylinderGeometry(0.38, 0.38, 0.06, 16), palette.glowCyan, [0, 0.38, 0]);
  // Floating wireframe holo-sphere & concentric tilted rings
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
  addPart(g, new THREE.IcosahedronGeometry(0.38, 1), wireMat, [0, 1.08, 0]);
  const r1 = addRing(g, palette.glowCyan, [0, 1.08, 0], 0.52, 0.015);
  r1.rotation.x = 0.9;
  const r2 = addRing(g, palette.glowCyan, [0, 1.08, 0], 0.56, 0.012);
  r2.rotation.x = -0.7;
  return { group: g };
}

// 21. scifi-server-rack: Mainframe Blade Server Rack Cabinet with LEDs
export function createServerRack(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const rackMat = createMaterial('#0f172a', 0.35, 0.75);
  addBox(g, rackMat, [0, 1.05, 0], [0.82, 2.1, 0.88], 0.02);
  for (let i = 0; i < 10; i++) {
    const y = 0.22 + i * 0.18;
    addBox(g, palette.iron, [0, y, 0.43], [0.68, 0.13, 0.04], 0.005);
    addBox(g, i % 3 === 0 ? palette.glowOrange : palette.glowCyan, [-0.24, y, 0.46], [0.12, 0.025, 0.01], 0.002);
  }
  return { group: g };
}

// 22. scifi-teleport-pad: Circular Quantum Teleportation Pad & 3 Energy Pylons
export function createTeleportPad(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  addPart(g, new THREE.CylinderGeometry(1.18, 1.28, 0.18, 24), palette.iron, [0, 0.09, 0]);
  addRing(g, palette.glowCyan, [0, 0.19, 0], 0.86, 0.04).rotation.x = Math.PI / 2;
  addPart(g, new THREE.CylinderGeometry(0.54, 0.54, 0.04, 20), palette.glowCyan, [0, 0.19, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const px = Math.cos(a) * 1.08;
    const pz = Math.sin(a) * 1.08;
    addRod(g, palette.iron, [px, 0.18, pz], [px * 0.72, 1.85, pz * 0.72], 0.055);
    addEll(g, palette.glowCyan, [px * 0.72, 1.88, pz * 0.72], [0.09, 0.09, 0.09]);
  }
  return { group: g };
}

// 23. scifi-shield-gen / scifi-forcefield-emitter: Tri-Prong Forcefield Emitter Pylon
export function createShieldGenerator(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  addPart(g, new THREE.CylinderGeometry(0.68, 0.82, 0.32, 8), palette.iron, [0, 0.16, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    addRod(g, palette.iron, [Math.cos(a) * 0.48, 0.3, Math.sin(a) * 0.48], [Math.cos(a) * 0.24, 1.72, Math.sin(a) * 0.24], 0.065);
  }
  addEll(g, palette.glowCyan, [0, 1.56, 0], [0.24, 0.24, 0.24]);
  addPart(g, new THREE.SphereGeometry(0.88, 16, 12, 0, TAU, 0, Math.PI * 0.55), palette.glass, [0, 1.1, 0]);
  return { group: g };
}

// 24. scifi-robot-arm: 6-Axis Articulated Industrial Factory Robot Arm
export function createIndustrialRobotArm(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const armOrange = createMaterial('#f97316', 0.32, 0.55);
  // Heavy bolted floor base + rotary turret + lower boom + elbow joint + upper forearm + wrist gripper claw
  addPart(g, new THREE.CylinderGeometry(0.44, 0.52, 0.22, 16), palette.iron, [0, 0.11, 0]);
  addPart(g, new THREE.CylinderGeometry(0.32, 0.36, 0.34, 16), armOrange, [0, 0.38, 0]);
  addRod(g, armOrange, [0, 0.52, 0], [0, 1.38, -0.24], 0.11);
  addEll(g, palette.iron, [0, 1.38, -0.24], [0.15, 0.15, 0.15]);
  addRod(g, armOrange, [0, 1.38, -0.24], [0, 1.62, 0.56], 0.085);
  addBox(g, palette.iron, [-0.1, 1.56, 0.72], [0.035, 0.14, 0.22], 0.005);
  addBox(g, palette.iron, [0.1, 1.56, 0.72], [0.035, 0.14, 0.22], 0.005);
  return { group: g };
}

// 25. scifi-tokamak: Toroidal Magnetic-Confinement Tokamak Fusion Reactor
export function createTokamakReactor(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  addPart(g, new THREE.CylinderGeometry(1.18, 1.28, 0.24, 16), palette.iron, [0, 0.12, 0]);
  // Glowing horizontal plasma torus + 8 surrounding vertical D-shaped magnetic field coils
  addRing(g, palette.glowCyan, [0, 0.96, 0], 0.78, 0.18).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const coil = addPart(g, new THREE.TorusGeometry(0.42, 0.055, 10, 18), palette.iron, [Math.cos(a) * 0.78, 0.96, Math.sin(a) * 0.78]);
    coil.rotation.y = -a + Math.PI / 2;
  }
  return { group: g };
}

// 26. scifi-airlock-hatch: Heavy Octagonal Bulkhead Airlock Hatch Door
export function createAirlockHatch(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steelMat = createMaterial('#475569', 0.38, 0.78);
  // Heavy octagonal bulkhead frame + recessed blast doors + central locking handwheel & glowing status light
  const frame = addPart(g, new THREE.CylinderGeometry(1.15, 1.15, 0.36, 8), palette.iron, [0, 1.15, 0]);
  frame.rotation.x = Math.PI / 2;
  const door = addPart(g, new THREE.CylinderGeometry(0.88, 0.88, 0.22, 8), steelMat, [0, 1.15, 0]);
  door.rotation.x = Math.PI / 2;
  addRing(g, palette.gold, [0, 1.15, 0.16], 0.26, 0.035).rotation.y = 0;
  addBox(g, palette.glowOrange, [0, 2.12, 0.19], [0.36, 0.09, 0.04], 0.01);
  return { group: g };
}

// 27. scifi-vending: Cyberpunk Neon Automated Drink Vending Machine
export function createCyberpunkVending(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const neonPink = new THREE.MeshBasicMaterial({ color: 0xec4899 });
  addBox(g, palette.iron, [0, 1.02, 0], [0.96, 2.04, 0.74], 0.03);
  addBox(g, palette.glass, [-0.08, 1.24, 0.36], [0.62, 1.12, 0.04], 0.01);
  addBox(g, neonPink, [0, 1.92, 0.38], [0.84, 0.14, 0.03], 0.01);
  addBox(g, palette.glowCyan, [0.34, 1.18, 0.38], [0.12, 0.36, 0.02], 0.005);
  addBox(g, palette.stone, [0, 0.36, 0.36], [0.68, 0.24, 0.06], 0.01);
  return { group: g };
}

// 28. scifi-turret: Automated Twin-Barrel Point-Defense Plasma Turret
export function createAutomatedTurret(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const armorMat = createMaterial('#334155', 0.35, 0.75);
  // 3 Splayed armored tripod legs + rotating gun pod + twin plasma barrels + optical sensor eye
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    addRod(g, palette.iron, [0, 0.62, 0], [Math.cos(a) * 0.68, 0.04, Math.sin(a) * 0.68], 0.065);
  }
  addBox(g, armorMat, [0, 0.88, 0], [0.58, 0.44, 0.68], 0.04);
  for (const sx of [-0.18, 0.18]) {
    addRod(g, palette.iron, [sx, 0.88, 0.3], [sx, 0.88, 1.08], 0.045);
    addEll(g, palette.glowCyan, [sx, 0.88, 1.1], [0.05, 0.05, 0.03]);
  }
  addEll(g, palette.glowOrange, [0, 1.14, 0.28], [0.09, 0.09, 0.09]);
  return { group: g };
}

// 29. scifi-drone-dock: Hexagonal Autonomous Drone Landing & Charging Dock
export function createDroneDock(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Hexagonal landing pad base with glowing H-helipad ring & parked quadcopter drone
  addPart(g, new THREE.CylinderGeometry(1.08, 1.22, 0.22, 6), palette.iron, [0, 0.11, 0]);
  addRing(g, palette.glowCyan, [0, 0.23, 0], 0.72, 0.03).rotation.x = Math.PI / 2;
  // Parked quadcopter drone hovering slightly above pad
  addEll(g, palette.cream, [0, 0.46, 0], [0.22, 0.1, 0.28]);
  for (const sx of [-0.34, 0.34]) {
    for (const sz of [-0.34, 0.34]) {
      addRod(g, palette.iron, [0, 0.46, 0], [sx, 0.48, sz], 0.02);
      addRing(g, palette.glowCyan, [sx, 0.5, sz], 0.14, 0.015).rotation.x = Math.PI / 2;
    }
  }
  return { group: g };
}

// 30. scifi-prosthetic-arm: Bionic Cybernetic Prosthetic Arm on Diagnostic Stand
export function createProstheticArm(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const chromeMat = createMaterial('#e2e8f0', 0.18, 0.92);
  addPart(g, new THREE.CylinderGeometry(0.36, 0.42, 0.14, 16), palette.iron, [0, 0.07, 0]);
  addRod(g, chromeMat, [0, 0.14, 0], [0, 0.78, 0], 0.085);
  addEll(g, palette.glowCyan, [0, 0.78, 0], [0.1, 0.1, 0.1]);
  addRod(g, chromeMat, [0, 0.78, 0], [0, 1.32, 0.08], 0.072);
  addBox(g, chromeMat, [0, 1.42, 0.09], [0.16, 0.18, 0.06], 0.02);
  for (let f = -2; f <= 1; f++) {
    addRod(g, chromeMat, [f * 0.038, 1.5, 0.09], [f * 0.042, 1.68, 0.11], 0.014);
  }
  addRod(g, chromeMat, [0.09, 1.42, 0.09], [0.18, 1.54, 0.12], 0.016);
  return { group: g };
}

// 31. scifi-hyperspace-gate: Colossal Orbital Hyperspace Jump Gate Ring
export function createHyperspaceGate(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const gateY = 1.25;
  addRing(g, palette.iron, [0, gateY, 0], 1.12, 0.14).rotation.y = 0;
  const vortex = addPart(g, new THREE.CylinderGeometry(0.98, 0.98, 0.03, 24), palette.glowCyan, [0, gateY, 0]);
  vortex.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    addBox(g, palette.gold, [Math.cos(a) * 1.14, gateY + Math.sin(a) * 1.14, 0], [0.22, 0.22, 0.36], 0.02);
  }
  return { group: g };
}

// 32. scifi-antigravity-sled: Hovering Repulsorlift Anti-Gravity Cargo Sled
export function createAntigravitySled(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Hovering flatbed deck + 4 glowing cyan underside repulsor discs + cargo crates + rear operator bar
  addBox(g, palette.iron, [0, 0.34, 0], [1.06, 0.12, 1.88], 0.03);
  for (const sx of [-0.38, 0.38]) {
    for (const sz of [-0.68, 0.68]) {
      addPart(g, new THREE.CylinderGeometry(0.18, 0.22, 0.06, 16), palette.glowCyan, [sx, 0.25, sz]);
    }
  }
  addBox(g, palette.gold, [0, 0.62, 0.18], [0.76, 0.46, 0.84], 0.03);
  addRod(g, palette.iron, [-0.42, 0.4, -0.86], [-0.42, 1.08, -0.86], 0.028);
  addRod(g, palette.iron, [0.42, 0.4, -0.86], [0.42, 1.08, -0.86], 0.028);
  addRod(g, palette.iron, [-0.42, 1.08, -0.86], [0.42, 1.08, -0.86], 0.028);
  return { group: g };
}

// 33. scifi-quantum-computer: Cryogenic Dilution-Refrigerator Quantum Computer Chandelier
export function createQuantumComputer(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Overhead frame + 5 descending golden circular dilution cooling stages + coaxial wiring rods + QPU core
  addPart(g, new THREE.CylinderGeometry(0.68, 0.72, 0.14, 20), palette.iron, [0, 1.95, 0]);
  const stages = [
    { y: 1.65, r: 0.56 },
    { y: 1.32, r: 0.46 },
    { y: 0.98, r: 0.36 },
    { y: 0.66, r: 0.26 },
  ];
  for (const s of stages) {
    addPart(g, new THREE.CylinderGeometry(s.r, s.r, 0.045, 24), palette.gold, [0, s.y, 0]);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    addRod(g, palette.gold, [Math.cos(a) * 0.22, 0.66, Math.sin(a) * 0.22], [Math.cos(a) * 0.48, 1.92, Math.sin(a) * 0.48], 0.014);
  }
  addPart(g, new THREE.CylinderGeometry(0.11, 0.09, 0.34, 16), palette.glowCyan, [0, 0.42, 0]);
  return { group: g };
}

// 34. scifi-terraforming-spire: Monolithic Atmospheric Processor Terraforming Spire
export function createTerraformingSpire(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const hullMat = createMaterial('#334155', 0.4, 0.7);
  // 4-buttressed industrial base + tall tapered processor tower + glowing ion sky-beam emitter
  addPart(g, new THREE.CylinderGeometry(0.42, 0.92, 1.15, 6), hullMat, [0, 0.575, 0]);
  addPart(g, new THREE.CylinderGeometry(0.22, 0.42, 2.25, 6), hullMat, [0, 2.25, 0]);
  for (let i = 0; i < 3; i++) {
    addRing(g, palette.glowCyan, [0, 1.45 + i * 0.65, 0], 0.42 - i * 0.06, 0.03).rotation.x = Math.PI / 2;
  }
  addPart(g, new THREE.CylinderGeometry(0.12, 0.18, 0.65, 12), palette.glowCyan, [0, 3.65, 0]);
  return { group: g };
}

// 35. scifi-holo-table: Hexagonal Tactical Command Holo-Table
export function createHoloTable(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  addPart(g, new THREE.CylinderGeometry(0.48, 0.68, 0.76, 6), palette.iron, [0, 0.38, 0]);
  addPart(g, new THREE.CylinderGeometry(1.12, 0.96, 0.14, 6), palette.iron, [0, 0.82, 0]);
  addPart(g, new THREE.CylinderGeometry(0.88, 0.88, 0.03, 6), palette.glowCyan, [0, 0.9, 0]);
  // Projected 3D holographic wireframe terrain peak & orbital ring above table
  const holoMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
  addPart(g, new THREE.ConeGeometry(0.46, 0.54, 6), holoMat, [0, 1.18, 0]);
  return { group: g };
}

// 36. scifi-warp-nacelle: Streamlined Starship Warp Field Nacelle Pod
export function createWarpNacelle(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const hullMat = createMaterial('#cbd5e1', 0.28, 0.78);
  const bussardRed = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  // Angled support pylon + elongated cylindrical nacelle body + glowing red Bussard collector dome + blue warp grilles
  addBox(g, hullMat, [0, 0.34, -0.15], [0.16, 0.68, 0.56], 0.02);
  const pod = addPart(g, new THREE.CylinderGeometry(0.28, 0.24, 2.35, 18), hullMat, [0, 0.78, 0]);
  pod.rotation.x = Math.PI / 2;
  addPart(g, new THREE.SphereGeometry(0.28, 16, 12), bussardRed, [0, 0.78, 1.18]);
  addBox(g, palette.glowCyan, [0, 0.78, -0.08], [0.58, 0.14, 1.65], 0.02);
  return { group: g };
}

// 37. scifi-matter-synthesizer: Molecular Food & Matter Replicator Unit
export function createMatterSynthesizer(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const hullMat = createMaterial('#475569', 0.32, 0.75);
  // Sleek replicator kiosk cabinet + illuminated synthesis bay alcove + materialized glowing chalice
  addBox(g, hullMat, [0, 0.78, 0], [0.92, 1.56, 0.68], 0.04);
  addBox(g, palette.iron, [0, 0.92, 0.12], [0.64, 0.58, 0.46], 0.02);
  addPart(g, new THREE.CylinderGeometry(0.22, 0.22, 0.03, 18), palette.glowCyan, [0, 0.66, 0.16]);
  addPart(g, new THREE.CylinderGeometry(0.1, 0.06, 0.26, 14), palette.glowCyan, [0, 0.8, 0.16]);
  return { group: g };
}

