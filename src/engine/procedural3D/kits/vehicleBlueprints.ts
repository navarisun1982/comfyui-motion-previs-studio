import * as THREE from 'three';
import {
  ProceduralPalette,
  addBox,
  addEll,
  addRod,
  addRing,
  addPart,
  createMaterial,
} from '../craftForms';
import type { ProceduralKitResult } from '../proceduralKits';

function addWheel(
  parent: THREE.Object3D,
  tireMat: THREE.Material,
  rimMat: THREE.Material,
  pos: [number, number, number],
  radius = 0.24,
  width = 0.14
): THREE.Group {
  const wg = new THREE.Group();
  wg.position.set(...pos);
  parent.add(wg);
  const tire = addPart(wg, new THREE.CylinderGeometry(radius, radius, width, 18), tireMat, [0, 0, 0]);
  tire.rotation.z = Math.PI / 2;
  const rim = addPart(wg, new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.015, 14), rimMat, [0, 0, 0]);
  rim.rotation.z = Math.PI / 2;
  return wg;
}

// 1. veh-cargo-truck: Heavy Articulated Semi Cargo Truck
export function createCargoTruck(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const tireMat = createMaterial('#111827', 0.85, 0.05);
  const chromeMat = createMaterial('#e2e8f0', 0.2, 0.9);
  const cabMat = createMaterial('#dc2626', 0.35, 0.45);
  const trailerMat = createMaterial('#f1f5f9', 0.5, 0.25);

  // Chassis frame rails
  addBox(g, palette.iron, [0, 0.3, 0], [0.76, 0.14, 2.75], 0.02);
  // Tractor Cab + Hood + Grille + Windshield + Twin Exhaust Stacks
  addBox(g, cabMat, [0, 0.82, 0.78], [0.96, 0.88, 0.68], 0.04);
  addBox(g, cabMat, [0, 0.62, 1.28], [0.88, 0.5, 0.52], 0.04);
  addBox(g, chromeMat, [0, 0.6, 1.55], [0.64, 0.42, 0.04], 0.01);
  addBox(g, palette.glass, [0, 0.96, 1.13], [0.84, 0.34, 0.04], 0.01);
  addEll(g, palette.glowOrange, [-0.34, 0.52, 1.55], [0.07, 0.06, 0.03]);
  addEll(g, palette.glowOrange, [0.34, 0.52, 1.55], [0.07, 0.06, 0.03]);
  for (const sx of [-0.5, 0.5]) {
    addRod(g, chromeMat, [sx, 0.45, 0.48], [sx, 1.48, 0.48], 0.032);
  }
  // Box Cargo Trailer
  addBox(g, trailerMat, [0, 1.02, -0.58], [1.06, 1.28, 1.88], 0.03);
  // 6 Heavy Truck Wheels
  for (const z of [1.22, 0.28, -0.95, -1.28]) {
    for (const sx of [-0.48, 0.48]) {
      addWheel(g, tireMat, chromeMat, [sx, 0.26, z], 0.26, 0.16);
    }
  }
  return { group: g };
}

// 2. veh-scooter: Retro Step-Through Vespa Motor Scooter
export function createMotorScooter(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bodyMat = createMaterial('#14b8a6', 0.25, 0.35);
  const tireMat = createMaterial('#111827', 0.85, 0.05);
  const chromeMat = createMaterial('#e2e8f0', 0.2, 0.9);
  const seatMat = createMaterial('#451a03', 0.65, 0.05);

  // Front & rear scooter wheels
  addWheel(g, tireMat, chromeMat, [0, 0.22, 0.58], 0.22, 0.11);
  addWheel(g, tireMat, chromeMat, [0, 0.22, -0.52], 0.22, 0.12);
  // Step-through floorboard + curved front legshield apron + front fender
  addBox(g, bodyMat, [0, 0.24, 0.02], [0.36, 0.07, 0.72], 0.02);
  const shield = addBox(g, bodyMat, [0, 0.62, 0.42], [0.44, 0.74, 0.08], 0.03);
  shield.rotation.x = -0.22;
  addEll(g, bodyMat, [0, 0.34, 0.58], [0.14, 0.14, 0.24]);
  // Bulbous rear engine cowls & leather saddle seat
  addEll(g, bodyMat, [0, 0.46, -0.46], [0.24, 0.22, 0.36]);
  addBox(g, seatMat, [0, 0.68, -0.36], [0.28, 0.12, 0.48], 0.04);
  // Handlebars, round chrome headlight & mirrors
  addRod(g, bodyMat, [0, 0.34, 0.38], [0, 1.02, 0.28], 0.045);
  addRod(g, chromeMat, [-0.32, 1.02, 0.28], [0.32, 1.02, 0.28], 0.024);
  addEll(g, palette.glowOrange, [0, 1.03, 0.34], [0.08, 0.08, 0.05]);
  return { group: g };
}

// 3. veh-locomotive / veh-steam-train: Vintage Iron Steam Train Locomotive
export function createSteamLocomotive(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const boilerMat = createMaterial('#18181b', 0.38, 0.82);
  const redWheelMat = createMaterial('#dc2626', 0.45, 0.5);
  const brassMat = palette.gold;

  // Heavy steel undercarriage bed
  addBox(g, palette.iron, [0, 0.32, 0], [0.88, 0.16, 2.75], 0.02);
  // Cylindrical horizontal steam boiler + brass bands
  const boiler = addPart(g, new THREE.CylinderGeometry(0.42, 0.42, 1.75, 20), boilerMat, [0, 0.82, 0.35]);
  boiler.rotation.x = Math.PI / 2;
  for (const z of [-0.2, 0.35, 0.9]) {
    const band = addRing(g, brassMat, [0, 0.82, z], 0.43, 0.015);
    band.rotation.y = 0;
  }
  // Flared smokestack chimney, steam dome & headlamp
  addPart(g, new THREE.CylinderGeometry(0.16, 0.11, 0.52, 14), boilerMat, [0, 1.42, 0.95]);
  addPart(g, new THREE.SphereGeometry(0.18, 12, 10), brassMat, [0, 1.26, 0.32]);
  addEll(g, palette.glowOrange, [0, 0.92, 1.26], [0.11, 0.11, 0.06]);
  // Engineer cab at rear
  addBox(g, boilerMat, [0, 1.02, -0.88], [0.96, 1.24, 0.78], 0.02);
  addBox(g, redWheelMat, [0, 1.66, -0.88], [1.04, 0.08, 0.88], 0.02);
  addBox(g, palette.glass, [-0.49, 1.18, -0.88], [0.04, 0.36, 0.42], 0.005);
  addBox(g, palette.glass, [0.49, 1.18, -0.88], [0.04, 0.36, 0.42], 0.005);
  // Wedge cowcatcher pilot at front
  const cow = addPart(g, new THREE.ConeGeometry(0.48, 0.45, 4), redWheelMat, [0, 0.24, 1.48]);
  cow.rotation.x = Math.PI / 2;
  cow.rotation.z = Math.PI / 4;
  // 6 Large Red Driving Wheels + Side Connecting Rods
  for (const sx of [-0.48, 0.48]) {
    for (const z of [-0.75, -0.05, 0.65]) {
      addWheel(g, boilerMat, redWheelMat, [sx, 0.32, z], 0.32, 0.09);
    }
    addRod(g, brassMat, [sx * 1.12, 0.32, -0.75], [sx * 1.12, 0.32, 0.65], 0.025);
  }
  return { group: g };
}

// 4. veh-tractor: Agricultural Farm Tractor with Oversized Rear Tires
export function createFarmTractor(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const greenBody = createMaterial('#15803d', 0.4, 0.3);
  const yellowRim = createMaterial('#eab308', 0.4, 0.3);
  const tireMat = createMaterial('#111827', 0.88, 0.05);

  // Engine hood & grille + tall vertical exhaust pipe
  addBox(g, greenBody, [0, 0.74, 0.42], [0.58, 0.56, 0.98], 0.04);
  addRod(g, palette.iron, [0.22, 0.95, 0.62], [0.22, 1.62, 0.62], 0.032);
  // Glass operator cab & green roof canopy
  addBox(g, palette.glass, [0, 1.18, -0.38], [0.78, 0.76, 0.74], 0.02);
  addBox(g, greenBody, [0, 1.58, -0.38], [0.86, 0.09, 0.82], 0.02);
  // Rear fenders
  for (const sx of [-0.48, 0.48]) {
    addBox(g, greenBody, [sx, 0.88, -0.42], [0.26, 0.08, 0.72], 0.02);
  }
  // Massive rear tractor tires + smaller front steering tires
  for (const sx of [-0.52, 0.52]) {
    addWheel(g, tireMat, yellowRim, [sx, 0.46, -0.42], 0.46, 0.26);
  }
  for (const sx of [-0.38, 0.38]) {
    addWheel(g, tireMat, yellowRim, [sx, 0.26, 0.68], 0.26, 0.14);
  }
  return { group: g };
}

// 5. veh-police-car: Law Enforcement Interceptor Police Cruiser
export function createPoliceCar(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const blackMat = createMaterial('#0f172a', 0.28, 0.5);
  const whiteMat = createMaterial('#f8fafc', 0.28, 0.4);
  const tireMat = createMaterial('#111827', 0.85, 0.05);
  const redSiren = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const blueSiren = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });

  // Black lower chassis + white doors + cabin greenhouse
  addBox(g, blackMat, [0, 0.38, 0], [0.96, 0.36, 2.24], 0.05);
  addBox(g, whiteMat, [0, 0.4, 0], [0.98, 0.32, 0.96], 0.03);
  addBox(g, whiteMat, [0, 0.72, -0.08], [0.82, 0.36, 1.08], 0.05);
  addBox(g, palette.glass, [0, 0.72, -0.08], [0.84, 0.28, 0.98], 0.02);
  // Roof Red/Blue Lightbar + Front Push-Bar Bullbar + Headlights
  addBox(g, redSiren, [-0.18, 0.94, -0.05], [0.3, 0.07, 0.14], 0.01);
  addBox(g, blueSiren, [0.18, 0.94, -0.05], [0.3, 0.07, 0.14], 0.01);
  addBox(g, palette.iron, [-0.22, 0.38, 1.16], [0.05, 0.34, 0.08], 0.01);
  addBox(g, palette.iron, [0.22, 0.38, 1.16], [0.05, 0.34, 0.08], 0.01);
  addBox(g, palette.iron, [0, 0.42, 1.18], [0.52, 0.06, 0.06], 0.01);
  addEll(g, palette.glowCyan, [-0.34, 0.42, 1.12], [0.09, 0.05, 0.03]);
  addEll(g, palette.glowCyan, [0.34, 0.42, 1.12], [0.09, 0.05, 0.03]);
  for (const z of [-0.68, 0.68]) {
    for (const sx of [-0.48, 0.48]) {
      addWheel(g, tireMat, palette.iron, [sx, 0.24, z], 0.24, 0.14);
    }
  }
  return { group: g };
}

// 6. veh-tank-apc: 8x8 Armored Personnel Carrier (APC) with Autocannon Turret
export function createArmoredAPC(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const armorMat = createMaterial('#3f4d3b', 0.68, 0.35);
  const tireMat = createMaterial('#111827', 0.88, 0.05);

  // Sloped faceted armored hull
  addBox(g, armorMat, [0, 0.62, 0], [1.22, 0.56, 2.48], 0.04);
  const glacis = addBox(g, armorMat, [0, 0.62, 1.22], [1.18, 0.42, 0.46], 0.03);
  glacis.rotation.x = 0.45;
  // Rotating unmanned autocannon turret + long barrel
  const turret = new THREE.Group();
  turret.position.set(0, 1.04, 0.12);
  g.add(turret);
  addPart(turret, new THREE.CylinderGeometry(0.36, 0.44, 0.32, 8), armorMat, [0, 0, 0]);
  addRod(turret, palette.iron, [0, 0.04, 0.25], [0, 0.04, 1.28], 0.042);
  // 8 Heavy Run-Flat Combat Wheels (4 per side)
  for (const z of [-0.88, -0.3, 0.3, 0.88]) {
    for (const sx of [-0.62, 0.62]) {
      addWheel(g, tireMat, armorMat, [sx, 0.28, z], 0.28, 0.18);
    }
  }
  return { group: g };
}

// 7. veh-speedboat: Sleek Offshore Luxury Power Speedboat
export function createSpeedboat(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const hullWhite = createMaterial('#f8fafc', 0.2, 0.2);
  const stripeRed = createMaterial('#dc2626', 0.3, 0.3);

  // Deep-V hull + pointed bow cone + teak cockpit deck
  addBox(g, hullWhite, [0, 0.32, -0.25], [1.02, 0.42, 1.65], 0.06);
  const bow = addPart(g, new THREE.ConeGeometry(0.52, 1.15, 4), hullWhite, [0, 0.36, 1.12]);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.z = Math.PI / 4;
  addBox(g, stripeRed, [0, 0.42, 0.05], [1.05, 0.09, 2.1], 0.02);
  addBox(g, palette.wood, [0, 0.54, -0.35], [0.86, 0.04, 1.25], 0.01);
  // Swept-back wrap-around tinted windshield & twin bucket seats
  const glass = addBox(g, palette.glass, [0, 0.68, 0.28], [0.88, 0.26, 0.42], 0.02);
  glass.rotation.x = -0.45;
  addBox(g, palette.cream, [-0.24, 0.64, -0.15], [0.26, 0.28, 0.26], 0.03);
  addBox(g, palette.cream, [0.24, 0.64, -0.15], [0.26, 0.28, 0.26], 0.03);
  // Twin outboard motors at stern
  addBox(g, palette.iron, [-0.24, 0.36, -1.16], [0.18, 0.44, 0.24], 0.02);
  addBox(g, palette.iron, [0.24, 0.36, -1.16], [0.18, 0.44, 0.24], 0.02);
  return { group: g };
}

// 8. veh-delivery-van: Commercial Box Step-Van Delivery Truck
export function createDeliveryVan(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const vanMat = createMaterial('#f8fafc', 0.35, 0.2);
  const stripeMat = createMaterial('#2563eb', 0.4, 0.2);
  const tireMat = createMaterial('#111827', 0.85, 0.05);

  // Tall boxy walk-in cargo body + sloped nose hood
  addBox(g, vanMat, [0, 0.82, -0.12], [1.02, 1.16, 2.08], 0.04);
  addBox(g, vanMat, [0, 0.54, 1.06], [0.98, 0.56, 0.42], 0.04);
  addBox(g, stripeMat, [0, 0.68, -0.12], [1.04, 0.16, 2.1], 0.01);
  addBox(g, palette.glass, [0, 1.02, 0.93], [0.88, 0.38, 0.05], 0.01);
  addBox(g, palette.iron, [0, 0.42, 1.28], [0.68, 0.28, 0.04], 0.01);
  for (const z of [-0.68, 0.78]) {
    for (const sx of [-0.48, 0.48]) {
      addWheel(g, tireMat, palette.iron, [sx, 0.24, z], 0.24, 0.14);
    }
  }
  return { group: g };
}

// 9. veh-dune-buggy: Tubular Roll-Cage Off-Road Desert Dune Buggy
export function createDuneBuggy(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const cageMat = createMaterial('#f97316', 0.35, 0.5);
  const tireMat = createMaterial('#111827', 0.88, 0.05);

  // Low floor pan + rear exposed engine block
  addBox(g, palette.iron, [0, 0.32, 0], [0.78, 0.12, 1.65], 0.02);
  addBox(g, palette.iron, [0, 0.52, -0.68], [0.54, 0.34, 0.44], 0.02);
  // Open tubular roll cage bars + roof lightbar + whip antenna
  for (const sx of [-0.36, 0.36]) {
    addRod(g, cageMat, [sx, 0.38, 0.65], [sx, 0.96, 0.18], 0.028);
    addRod(g, cageMat, [sx, 0.96, 0.18], [sx, 0.96, -0.45], 0.028);
    addRod(g, cageMat, [sx, 0.96, -0.45], [sx, 0.45, -0.82], 0.028);
  }
  addRod(g, cageMat, [-0.36, 0.96, 0.18], [0.36, 0.96, 0.18], 0.028);
  addRod(g, cageMat, [-0.36, 0.96, -0.45], [0.36, 0.96, -0.45], 0.028);
  addBox(g, palette.glowCyan, [0, 1.02, 0.18], [0.52, 0.06, 0.06], 0.01);
  // Knobby off-road tires (wider in rear)
  for (const sx of [-0.52, 0.52]) {
    addWheel(g, tireMat, cageMat, [sx, 0.26, 0.68], 0.26, 0.16);
    addWheel(g, tireMat, cageMat, [sx * 1.08, 0.32, -0.64], 0.32, 0.22);
  }
  return { group: g };
}

// 10. veh-submarine / veh-deep-sub: Deep-Sea Research Submersible with Acrylic Dome & Manipulator Arm
export function createResearchSubmarine(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const subYellow = createMaterial('#facc15', 0.32, 0.35);

  // Twin lower ballast pontoons/skids
  for (const sx of [-0.46, 0.46]) {
    const skid = addPart(g, new THREE.CylinderGeometry(0.11, 0.11, 1.75, 12), palette.iron, [sx, 0.14, 0]);
    skid.rotation.x = Math.PI / 2;
  }
  // Yellow pressure hull + front transparent hemisphere viewport dome
  const hull = addPart(g, new THREE.CylinderGeometry(0.46, 0.38, 1.45, 18), subYellow, [0, 0.68, -0.1]);
  hull.rotation.x = Math.PI / 2;
  addPart(g, new THREE.SphereGeometry(0.45, 18, 14), palette.glass, [0, 0.68, 0.62]);
  // Top conning tower hatch + ducted stern thruster + front articulated grabber claw
  addPart(g, new THREE.CylinderGeometry(0.22, 0.25, 0.36, 14), subYellow, [0, 1.22, -0.05]);
  const shroud = addRing(g, palette.iron, [0, 0.68, -0.92], 0.28, 0.045);
  shroud.rotation.y = 0;
  addRod(g, palette.iron, [0.28, 0.45, 0.55], [0.38, 0.36, 1.15], 0.028);
  addRod(g, palette.gold, [0.38, 0.36, 1.15], [0.26, 0.32, 1.34], 0.022);
  return { group: g };
}

// 11. veh-hovercraft: Amphibious Cushion Hovercraft with Twin Rear Ducted Fans
export function createHovercraft(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const skirtMat = createMaterial('#111827', 0.85, 0.05);
  const deckMat = createMaterial('#f97316', 0.35, 0.3);

  // Inflated black rubber perimeter air-cushion skirt
  addBox(g, skirtMat, [0, 0.18, 0], [1.38, 0.34, 2.28], 0.16);
  // Deck & streamlined forward pilot cabin
  addBox(g, deckMat, [0, 0.42, 0], [1.22, 0.18, 2.08], 0.04);
  addBox(g, deckMat, [0, 0.68, 0.28], [0.84, 0.38, 0.96], 0.05);
  addBox(g, palette.glass, [0, 0.72, 0.77], [0.76, 0.26, 0.06], 0.01);
  // Twin rear circular ducted propulsion fan shrouds + vertical rudders
  for (const sx of [-0.36, 0.36]) {
    const shroud = addRing(g, deckMat, [sx, 0.86, -0.78], 0.32, 0.055);
    shroud.rotation.y = 0;
    addEll(g, palette.iron, [sx, 0.86, -0.78], [0.08, 0.08, 0.14]);
    addBox(g, deckMat, [sx, 0.86, -0.86], [0.03, 0.56, 0.18], 0.005);
  }
  return { group: g };
}

// 12. veh-forklift: Industrial Warehouse Counterweight Forklift
export function createForklift(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const yellowMat = createMaterial('#eab308', 0.38, 0.3);
  const tireMat = createMaterial('#111827', 0.88, 0.05);

  // Compact counterweight body + overhead safety cage
  addBox(g, yellowMat, [0, 0.44, -0.22], [0.84, 0.54, 1.18], 0.05);
  for (const sx of [-0.36, 0.36]) {
    for (const sz of [-0.66, 0.22]) {
      addRod(g, palette.iron, [sx, 0.7, sz], [sx, 1.48, sz], 0.025);
    }
  }
  addBox(g, palette.iron, [0, 1.48, -0.22], [0.78, 0.05, 0.94], 0.01);
  // Vertical twin hydraulic mast rails + L-shaped steel forks
  for (const sx of [-0.22, 0.22]) {
    addBox(g, palette.iron, [sx, 0.96, 0.44], [0.07, 1.72, 0.08], 0.01);
    addBox(g, palette.iron, [sx, 0.32, 0.52], [0.09, 0.42, 0.04], 0.005);
    addBox(g, palette.iron, [sx, 0.12, 0.92], [0.09, 0.035, 0.82], 0.005);
  }
  for (const sx of [-0.42, 0.42]) {
    addWheel(g, tireMat, yellowMat, [sx, 0.22, 0.18], 0.22, 0.14);
    addWheel(g, tireMat, yellowMat, [sx, 0.18, -0.62], 0.18, 0.12);
  }
  return { group: g };
}

// 13. veh-bulldozer: Heavy Tracked Earthmover Crawler Bulldozer
export function createBulldozer(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const dozerYellow = createMaterial('#f59e0b', 0.45, 0.35);
  const trackMat = createMaterial('#1f2937', 0.85, 0.2);

  // Twin continuous caterpillar track pods
  for (const sx of [-0.62, 0.62]) {
    addBox(g, trackMat, [sx, 0.28, -0.08], [0.34, 0.52, 1.72], 0.18);
  }
  // Engine block + elevated ROPS operator cab + exhaust stack
  addBox(g, dozerYellow, [0, 0.68, 0.18], [0.86, 0.58, 1.05], 0.03);
  addBox(g, dozerYellow, [0, 1.12, -0.46], [0.84, 0.78, 0.74], 0.03);
  addBox(g, palette.glass, [0, 1.16, -0.46], [0.86, 0.52, 0.66], 0.01);
  addRod(g, palette.iron, [0.28, 0.95, 0.42], [0.28, 1.56, 0.42], 0.038);
  // Massive curved front steel dozer blade + hydraulic push arms
  for (const sx of [-0.48, 0.48]) {
    addBox(g, dozerYellow, [sx, 0.34, 0.68], [0.1, 0.14, 0.95], 0.01);
  }
  addBox(g, palette.iron, [0, 0.46, 1.18], [1.68, 0.78, 0.16], 0.03);
  return { group: g };
}

// 14. veh-bicycle: Lightweight Diamond-Frame Road Racing Bicycle
export function createRoadBicycle(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const frameMat = createMaterial('#dc2626', 0.25, 0.6);
  const tireMat = createMaterial('#111827', 0.85, 0.05);

  // Front & rear thin spoked wheels (torus tires along Z plane)
  for (const z of [-0.58, 0.58]) {
    const wheel = addPart(g, new THREE.TorusGeometry(0.34, 0.032, 10, 28), tireMat, [0, 0.36, z]);
    wheel.rotation.y = Math.PI / 2;
    const hub = addPart(g, new THREE.CylinderGeometry(0.04, 0.04, 0.08, 10), palette.iron, [0, 0.36, z]);
    hub.rotation.z = Math.PI / 2;
  }
  // Classic tubular diamond frame + fork + saddle + drop handlebars
  addRod(g, frameMat, [0, 0.36, -0.58], [0, 0.36, -0.05], 0.018);
  addRod(g, frameMat, [0, 0.36, -0.58], [0, 0.82, -0.18], 0.018);
  addRod(g, frameMat, [0, 0.36, -0.05], [0, 0.92, -0.22], 0.022);
  addRod(g, frameMat, [0, 0.82, -0.18], [0, 0.84, 0.38], 0.022);
  addRod(g, frameMat, [0, 0.36, -0.05], [0, 0.84, 0.38], 0.024);
  addRod(g, frameMat, [0, 0.36, 0.58], [0, 0.96, 0.34], 0.022);
  addBox(g, tireMat, [0, 0.95, -0.24], [0.12, 0.05, 0.26], 0.02);
  addRod(g, palette.iron, [-0.24, 0.96, 0.38], [0.24, 0.96, 0.38], 0.018);
  return { group: g };
}

// 15. veh-space-rover: 6-Wheeled Planetary Exploration Space Rover
export function createSpaceRover(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const foilMat = palette.gold;
  const solarMat = createMaterial('#1e3a8a', 0.2, 0.6);
  const wheelMat = createMaterial('#334155', 0.6, 0.7);

  // Gold thermal-blanket chassis box + flat blue solar array wings
  addBox(g, foilMat, [0, 0.56, 0], [0.84, 0.38, 1.24], 0.02);
  addBox(g, solarMat, [0, 0.78, -0.08], [1.68, 0.035, 1.12], 0.005);
  // Tall pan-tilt mast with twin stereo optical cameras + high-gain dish
  addRod(g, palette.iron, [0.18, 0.78, 0.46], [0.18, 1.48, 0.46], 0.032);
  addBox(g, palette.cream, [0.18, 1.52, 0.48], [0.34, 0.16, 0.18], 0.02);
  addEll(g, palette.glowCyan, [0.1, 1.52, 0.58], [0.04, 0.04, 0.02]);
  addEll(g, palette.glowCyan, [0.26, 1.52, 0.58], [0.04, 0.04, 0.02]);
  // 6 Cleated Rocker-Bogie Titanium Wheels (3 per side)
  for (const z of [-0.62, 0, 0.62]) {
    for (const sx of [-0.58, 0.58]) {
      addWheel(g, wheelMat, foilMat, [sx, 0.24, z], 0.24, 0.16);
      addRod(g, palette.iron, [sx * 0.7, 0.52, z * 0.6], [sx, 0.24, z], 0.022);
    }
  }
  return { group: g };
}

// 16. veh-monorail: Futuristic Streamlined Elevated Monorail Train Car
export function createMonorailCar(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bodyWhite = createMaterial('#f8fafc', 0.2, 0.3);
  const cyanStripe = createMaterial('#0ea5e9', 0.3, 0.4);

  // Elevated concrete guideway beam & support pillar
  addBox(g, palette.stone, [0, 0.22, 0], [0.38, 0.44, 0.38], 0.02);
  addBox(g, palette.stone, [0, 0.52, 0], [0.46, 0.24, 2.95], 0.02);
  // Straddling streamlined train fuselage + aerodynamic nose cone + panoramic windows
  addBox(g, bodyWhite, [0, 0.96, -0.15], [0.96, 0.78, 2.25], 0.12);
  addBox(g, cyanStripe, [0, 0.78, -0.1], [0.98, 0.1, 2.35], 0.02);
  addEll(g, bodyWhite, [0, 0.92, 1.05], [0.48, 0.38, 0.58]);
  addBox(g, palette.glass, [0, 1.04, -0.1], [0.99, 0.28, 1.95], 0.02);
  return { group: g };
}

// 17. veh-ambulance: Emergency Paramedic Box Ambulance with Siren Lightbars
export function createAmbulance(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const whiteMat = createMaterial('#f8fafc', 0.28, 0.2);
  const redCrossMat = createMaterial('#dc2626', 0.35, 0.2);
  const tireMat = createMaterial('#111827', 0.85, 0.05);

  // Forward cab + taller rear paramedic patient module
  addBox(g, whiteMat, [0, 0.62, 0.86], [0.96, 0.72, 0.78], 0.04);
  addBox(g, palette.glass, [0, 0.76, 1.26], [0.84, 0.32, 0.04], 0.01);
  addBox(g, whiteMat, [0, 0.88, -0.34], [1.12, 1.18, 1.68], 0.03);
  addBox(g, redCrossMat, [0, 0.68, -0.34], [1.14, 0.18, 1.7], 0.01);
  // Red Cross emblem on both sides + emergency lightbars on roof
  for (const sx of [-0.57, 0.57]) {
    addBox(g, redCrossMat, [sx, 1.05, -0.34], [0.03, 0.36, 0.12], 0.005);
    addBox(g, redCrossMat, [sx, 1.05, -0.34], [0.03, 0.12, 0.36], 0.005);
  }
  addBox(g, redCrossMat, [0, 1.51, 0.42], [0.76, 0.08, 0.14], 0.01);
  for (const z of [-0.78, 0.86]) {
    for (const sx of [-0.5, 0.5]) {
      addWheel(g, tireMat, palette.iron, [sx, 0.25, z], 0.25, 0.15);
    }
  }
  return { group: g };
}

// 18. veh-fire-engine: Red Aerial Ladder Fire Engine Truck
export function createFireEngine(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const fireRed = createMaterial('#dc2626', 0.28, 0.35);
  const chromeMat = createMaterial('#e2e8f0', 0.2, 0.9);
  const tireMat = createMaterial('#111827', 0.85, 0.05);

  // Crew cab + equipment pump body with chrome roll-up shutters
  addBox(g, fireRed, [0, 0.74, 0.92], [1.02, 0.92, 0.84], 0.04);
  addBox(g, palette.glass, [0, 0.88, 1.35], [0.9, 0.36, 0.04], 0.01);
  addBox(g, fireRed, [0, 0.68, -0.38], [1.02, 0.82, 1.78], 0.03);
  addBox(g, chromeMat, [0, 0.68, -0.38], [1.04, 0.48, 1.24], 0.01);
  // Roof turntable + extendable aluminum aerial ladder angled upward
  addPart(g, new THREE.CylinderGeometry(0.34, 0.38, 0.14, 16), chromeMat, [0, 1.16, -0.78]);
  const ladder = new THREE.Group();
  ladder.position.set(0, 1.24, -0.78);
  ladder.rotation.x = 0.26;
  g.add(ladder);
  for (const sx of [-0.18, 0.18]) {
    addBox(ladder, chromeMat, [sx, 0, 0.95], [0.05, 0.1, 2.35], 0.005);
  }
  for (let r = -0.1; r <= 2.0; r += 0.24) {
    addRod(ladder, chromeMat, [-0.18, 0, r], [0.18, 0, r], 0.015);
  }
  for (const z of [-0.88, -0.32, 0.92]) {
    for (const sx of [-0.5, 0.5]) {
      addWheel(g, tireMat, chromeMat, [sx, 0.26, z], 0.26, 0.16);
    }
  }
  return { group: g };
}

// 19. veh-garbage-truck: Municipal Sanitation Rear-Loader Compactor Truck
export function createGarbageTruck(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const cabWhite = createMaterial('#f8fafc', 0.35, 0.2);
  const hopperGreen = createMaterial('#15803d', 0.45, 0.25);
  const tireMat = createMaterial('#111827', 0.85, 0.05);

  // Forward cab-over-engine + ribbed green rear compactor body + angled tailgate hopper
  addBox(g, cabWhite, [0, 0.74, 0.96], [0.98, 0.92, 0.68], 0.04);
  addBox(g, palette.glass, [0, 0.88, 1.31], [0.86, 0.36, 0.04], 0.01);
  addBox(g, hopperGreen, [0, 0.88, -0.24], [1.06, 1.12, 1.65], 0.05);
  for (const z of [-0.8, -0.4, 0, 0.4]) {
    addBox(g, hopperGreen, [0, 0.88, z], [1.1, 1.16, 0.06], 0.01);
  }
  const tailgate = addBox(g, hopperGreen, [0, 0.82, -1.16], [1.02, 0.98, 0.38], 0.04);
  tailgate.rotation.x = -0.22;
  for (const z of [-0.78, -0.26, 0.96]) {
    for (const sx of [-0.5, 0.5]) {
      addWheel(g, tireMat, palette.iron, [sx, 0.26, z], 0.26, 0.16);
    }
  }
  return { group: g };
}

// 20. veh-blimp: Dirigible Airship Blimp with Passenger Gondola & Tail Fins
export function createAirshipBlimp(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const envelopeMat = createMaterial('#e2e8f0', 0.45, 0.2);
  const finRed = createMaterial('#dc2626', 0.4, 0.2);

  // Cigar-shaped helium envelope + blue accent stripe
  addEll(g, envelopeMat, [0, 1.55, 0], [0.76, 0.72, 1.85]);
  addEll(g, palette.glowCyan, [0, 1.55, 0], [0.77, 0.12, 1.78]);
  // Underslung passenger gondola cabin with panoramic windows
  addBox(g, palette.iron, [0, 0.74, 0.15], [0.38, 0.32, 0.84], 0.05);
  addBox(g, palette.glass, [0, 0.76, 0.22], [0.4, 0.16, 0.68], 0.01);
  // 4 Cruciform tail stabilizer fins at stern
  addBox(g, finRed, [0, 1.55, -1.48], [0.05, 1.18, 0.52], 0.01);
  addBox(g, finRed, [0, 1.55, -1.48], [1.18, 0.05, 0.52], 0.01);
  return { group: g };
}

// 21. veh-tuk-tuk: Three-Wheeled Motorized Auto-Rickshaw Tuk-Tuk
export function createTukTuk(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bodyGreen = createMaterial('#16a34a', 0.35, 0.25);
  const canopyYellow = createMaterial('#facc15', 0.45, 0.1);
  const tireMat = createMaterial('#111827', 0.85, 0.05);

  // Single front steering wheel + 2 rear passenger wheels
  addWheel(g, tireMat, palette.iron, [0, 0.2, 0.68], 0.2, 0.11);
  addWheel(g, tireMat, palette.iron, [-0.44, 0.2, -0.52], 0.2, 0.12);
  addWheel(g, tireMat, palette.iron, [0.44, 0.2, -0.52], 0.2, 0.12);
  // Front fairing + windshield + open-sided passenger tub + yellow canvas canopy roof
  addBox(g, bodyGreen, [0, 0.54, 0.52], [0.64, 0.56, 0.32], 0.04);
  addBox(g, palette.glass, [0, 0.98, 0.48], [0.68, 0.38, 0.04], 0.01);
  addBox(g, bodyGreen, [0, 0.38, -0.22], [0.88, 0.36, 1.18], 0.03);
  addBox(g, canopyYellow, [0, 1.24, -0.06], [0.92, 0.1, 1.36], 0.03);
  for (const sx of [-0.41, 0.41]) {
    addRod(g, palette.iron, [sx, 0.54, -0.68], [sx, 1.22, -0.68], 0.02);
  }
  addEll(g, palette.glowOrange, [0, 0.56, 0.69], [0.09, 0.09, 0.04]);
  return { group: g };
}

