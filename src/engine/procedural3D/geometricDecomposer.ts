/**
 * Universal Geometric Decomposition & Procedural Shape Synthesis Engine.
 * Implements the 3Dviz Pro Max object reasoning specification:
 * Analyzes ANY object (mic, cup, burger, laptop, guitar, or arbitrary concept)
 * into its physical components, structural hierarchy, PBR materials, and behaviors.
 */

import * as THREE from 'three';
import {
  ProceduralPalette,
  addBox,
  addEll,
  addRod,
  addCurve,
  addRing,
  addPart,
  createMaterial,
} from './craftForms';
import { ProceduralKitResult } from './proceduralKits';
import { synthesizeMorphometricObject } from './morphometricReasoner';

// =========================================================================
// 1. ACOUSTIC / AUDIO: Studio Condenser Microphone Assembly
// =========================================================================
export function createMicrophoneAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const chromeMat = createMaterial('#e2e8f0', 0.15, 0.95);
  const darkMetal = palette.iron || createMaterial('#1e293b', 0.45, 0.85);
  const meshGrilleMat = createMaterial('#94a3b8', 0.35, 0.85);

  // A. Weighted Cast Iron Circular Table Stand Base
  addPart(g, new THREE.CylinderGeometry(0.55, 0.6, 0.1, 24), darkMetal, [0, 0.05, 0]);
  addRing(g, chromeMat, [0, 0.1, 0], 0.52, 0.015).rotation.x = Math.PI / 2;

  // B. Telescoping Vertical Chrome Extension Riser Rod
  addRod(g, chromeMat, [0, 0.1, 0], [0, 0.95, 0], 0.035);

  // Height Adjustment Clutch Ring / Knob
  addPart(g, new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12), darkMetal, [0, 0.65, 0]);

  // C. Shock Mount Suspension Bracket (Gimbal Outer & Inner Rings)
  const mountGroup = new THREE.Group();
  mountGroup.position.set(0, 1.15, 0);

  // Outer Shock Mount Ring
  const outerRing = addRing(mountGroup, darkMetal, [0, 0, 0], 0.32, 0.02);
  outerRing.rotation.x = Math.PI / 2;

  // Inner Microphone Cradle Ring
  const innerRing = addRing(mountGroup, darkMetal, [0, 0, 0], 0.2, 0.018);
  innerRing.rotation.x = Math.PI / 2;

  // Elastic Suspension Spider Bands
  for (let a = 0; a < 4; a++) {
    const angle = (a * Math.PI) / 2;
    const xOuter = Math.cos(angle) * 0.3;
    const zOuter = Math.sin(angle) * 0.3;
    const xInner = Math.cos(angle + Math.PI / 4) * 0.18;
    const zInner = Math.sin(angle + Math.PI / 4) * 0.18;
    addRod(mountGroup, palette.gold || chromeMat, [xOuter, 0, zOuter], [xInner, 0, zInner], 0.008);
  }

  // D. Microphone Capsule Body
  const micBody = new THREE.Group();
  micBody.position.set(0, 0.05, 0);

  // Lower Solid Housing Cylinder
  addPart(micBody, new THREE.CylinderGeometry(0.12, 0.12, 0.38, 18), darkMetal, [0, -0.05, 0]);

  // XLR Connector Base Collar
  addPart(micBody, new THREE.CylinderGeometry(0.08, 0.08, 0.1, 14), chromeMat, [0, -0.28, 0]);

  // Polar Pattern Switch / Brand Badge
  addBox(micBody, palette.gold, [0, -0.05, 0.125], [0.06, 0.08, 0.01], 0.005);

  // Upper Acoustic Wire Mesh Grille (Microphone Head Dome)
  const grilleCyl = addPart(micBody, new THREE.CylinderGeometry(0.12, 0.12, 0.28, 18), meshGrilleMat, [0, 0.26, 0]);
  const grilleDome = addPart(micBody, new THREE.SphereGeometry(0.12, 18, 12), meshGrilleMat, [0, 0.4, 0]);
  grilleDome.scale.set(1, 0.8, 1);

  // Chrome Band Separator
  addRing(micBody, chromeMat, [0, 0.13, 0], 0.122, 0.01).rotation.x = Math.PI / 2;

  mountGroup.add(micBody);
  g.add(mountGroup);

  // E. Pop Filter Circular Ring on Gooseneck Arm
  addRing(g, darkMetal, [0, 1.45, 0.28], 0.22, 0.015);
  // Semi-transparent nylon mesh inside pop filter
  const nylonMat = new THREE.MeshBasicMaterial({ color: 0x111827, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  addPart(g, new THREE.CircleGeometry(0.2, 16), nylonMat, [0, 1.45, 0.28]);
  // Gooseneck articulated clamp rod
  const armPoints = [
    new THREE.Vector3(0, 0.85, 0.05),
    new THREE.Vector3(0.18, 1.1, 0.2),
    new THREE.Vector3(0.05, 1.35, 0.28),
  ];
  addCurve(g, darkMetal, armPoints, 0.012, 8);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Subtle audio studio warmth glow
      grilleCyl.position.y = 0.26 + Math.sin(time * 3) * 0.002;
    },
  };
}

// =========================================================================
// 2. VESSEL / CONTAINER: Hollow Cup / Mug with Liquid Cavity
// Grounded in 3Dviz Pro Max: knowledge.hollow-vessel-liquid-cavity
// =========================================================================
export function createHollowVesselAssembly(palette: ProceduralPalette, isCup = true): ProceduralKitResult {
  const g = new THREE.Group();

  const ceramicMat = palette.primary || palette.cream || createMaterial('#f8fafc', 0.25, 0.1);
  const liquidMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b1d0c, // Rich dark coffee / tea
    roughness: 0.1,
    metalness: 0.05,
    transmission: 0.85,
    transparent: true,
    opacity: 0.9,
  });

  const rOuterTop = 0.45;
  const rOuterBottom = 0.38;
  const wallThick = 0.045;
  const height = 0.95;

  // A. Outer Ceramic Vessel Body (Lathe / Cylinder)
  addPart(g, new THREE.CylinderGeometry(rOuterTop, rOuterBottom, height, 24), ceramicMat, [0, height / 2, 0]);

  // B. Base Foot Ring
  addRing(g, ceramicMat, [0, 0.02, 0], rOuterBottom * 0.85, 0.02).rotation.x = Math.PI / 2;

  // C. Interior Cavity (Open at the top, positive wall thickness)
  const rInnerTop = rOuterTop - wallThick;
  const rInnerBottom = rOuterBottom - wallThick;
  const cavityDepth = height - 0.08;
  // Inner cavity surface with reversed normals or interior cylinder
  const cavityMat = createMaterial('#f1f5f9', 0.25, 0.05);
  addPart(g, new THREE.CylinderGeometry(rInnerTop, rInnerBottom, cavityDepth, 24), cavityMat, [0, height / 2 + 0.04, 0]);

  // D. Bevelled Top Rim
  addRing(g, ceramicMat, [0, height, 0], (rOuterTop + rInnerTop) / 2, wallThick / 2).rotation.x = Math.PI / 2;

  // E. Curved Ergonomic Handle (CatmullRom Tube)
  if (isCup) {
    const handlePoints = [
      new THREE.Vector3(rOuterTop * 0.92, height * 0.82, 0),
      new THREE.Vector3(rOuterTop + 0.35, height * 0.72, 0),
      new THREE.Vector3(rOuterTop + 0.38, height * 0.35, 0),
      new THREE.Vector3(rOuterBottom * 0.95, height * 0.22, 0),
    ];
    addCurve(g, ceramicMat, handlePoints, 0.045, 16);
  }

  // F. Liquid Fill Domain (Liquid surface with meniscus at 70% fill)
  const liquidLevel = height * 0.72;
  const rLiquid = rInnerBottom + (rInnerTop - rInnerBottom) * 0.72;
  const liquidDisc = addPart(g, new THREE.CylinderGeometry(rLiquid * 0.98, rLiquid * 0.98, 0.02, 24), liquidMat, [0, liquidLevel, 0]);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Gentle surface shimmer on liquid
      liquidDisc.position.y = liquidLevel + Math.sin(time * 2.5) * 0.002;
    },
  };
}

// =========================================================================
// 3. LAYERED FOOD: Gourmet Burger Assembly
// =========================================================================
export function createLayeredFoodAssembly(_palette?: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const bunMat = createMaterial('#d97706', 0.55, 0.05); // Golden baked bread crust
  const bunBottomMat = createMaterial('#b45309', 0.65, 0.05);
  const pattyMat = createMaterial('#3f2314', 0.85, 0.05); // Charred grilled beef
  const cheeseMat = createMaterial('#fbbf24', 0.45, 0.1); // Melted cheddar
  const lettuceMat = createMaterial('#22c55e', 0.7, 0.0); // Crisp green
  const tomatoMat = createMaterial('#dc2626', 0.25, 0.2); // Glossy red tomato
  const sesameMat = createMaterial('#fef3c7', 0.3, 0.0); // White sesame seed

  const r = 0.75;

  // A. Bottom Bun
  const bottomBun = addPart(g, new THREE.CylinderGeometry(r, r * 0.9, 0.2, 24), bunBottomMat, [0, 0.1, 0]);
  bottomBun.scale.set(1, 1, 1);

  // B. Grilled Beef Patty
  addPart(g, new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.18, 20), pattyMat, [0, 0.29, 0]);

  // C. Melted Cheese Slice (Draped Square with corners sagging down)
  const cheeseMesh = addBox(g, cheeseMat, [0, 0.4, 0], [r * 1.8, 0.03, r * 1.8], 0.01);
  cheeseMesh.rotation.y = Math.PI / 4; // Rotated so 4 corners drape over edges

  // D. Wavy Crisp Lettuce Leaf Disk
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const lx = Math.cos(angle) * (r * 0.95);
    const lz = Math.sin(angle) * (r * 0.95);
    addEll(g, lettuceMat, [lx, 0.44, lz], [0.25, 0.04, 0.22]);
  }

  // E. Juicy Red Tomato Slices
  addPart(g, new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.08, 16), tomatoMat, [-0.25, 0.52, 0.1]);
  addPart(g, new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.08, 16), tomatoMat, [0.25, 0.52, -0.1]);

  // F. Plump Top Bun Dome
  const topBun = addPart(g, new THREE.SphereGeometry(r * 1.02, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), bunMat, [0, 0.56, 0]);
  topBun.scale.set(1, 0.55, 1);

  // G. Scattered White Sesame Seeds on Bun Dome
  for (let s = 0; s < 18; s++) {
    const sTheta = Math.random() * Math.PI * 2;
    const sPhi = 0.2 + Math.random() * 0.7; // Upper dome
    const sx = Math.sin(sPhi) * Math.cos(sTheta) * (r * 1.01);
    const sz = Math.sin(sPhi) * Math.sin(sTheta) * (r * 1.01);
    const sy = 0.56 + Math.cos(sPhi) * (r * 0.56);
    const seed = addEll(g, sesameMat, [sx, sy, sz], [0.03, 0.015, 0.02]);
    seed.rotation.set(Math.random(), Math.random(), Math.random());
  }

  return { group: g };
}

// =========================================================================
// 4. ELECTRONICS: Modern Clamshell Laptop Computer
// =========================================================================
export function createLaptopAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const chassisMat = createMaterial('#334155', 0.35, 0.85); // Space Grey Aluminum
  const screenGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.1,
    metalness: 0.2,
    transmission: 0.3,
  });
  const glowScreenMat = palette.glowCyan || createMaterial('#38bdf8', 0.2, 0.1);

  // A. Bottom Keyboard Chassis Slab
  addBox(g, chassisMat, [0, 0.03, 0], [1.4, 0.06, 0.95], 0.02);

  // Keyboard Recess & Keys
  addBox(g, createMaterial('#0f172a', 0.7, 0.2), [0, 0.065, -0.1], [1.2, 0.01, 0.55], 0.01);
  // Trackpad
  addBox(g, createMaterial('#475569', 0.4, 0.4), [0, 0.065, 0.28], [0.45, 0.01, 0.28], 0.005);

  // B. Cylindrical Hinge Barrel
  addPart(g, new THREE.CylinderGeometry(0.025, 0.025, 1.35, 12), chassisMat, [0, 0.06, -0.47]).rotation.z = Math.PI / 2;

  // C. Display Lid (Angled at 115° open)
  const lidGroup = new THREE.Group();
  lidGroup.position.set(0, 0.06, -0.47);
  lidGroup.rotation.x = -Math.PI / 3; // ~120 degrees open

  // Outer Aluminum Lid Shell
  addBox(lidGroup, chassisMat, [0, 0.48, 0], [1.4, 0.95, 0.04], 0.02);

  // Display Screen Glass & Bezel
  addBox(lidGroup, screenGlassMat, [0, 0.48, 0.022], [1.32, 0.88, 0.005], 0.01);
  // Illuminated Active Display Viewport
  addBox(lidGroup, glowScreenMat, [0, 0.48, 0.025], [1.24, 0.8, 0.002], 0.005);

  g.add(lidGroup);

  return { group: g };
}

// =========================================================================
// 5. MUSICAL INSTRUMENT: Acoustic Guitar
// =========================================================================
export function createGuitarAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const woodBodyMat = palette.wood || createMaterial('#78350f', 0.35, 0.1);
  const fretboardMat = palette.iron || createMaterial('#1c1917', 0.75, 0.1);
  const goldHardwareMat = palette.gold || createMaterial('#d97706', 0.2, 0.85);

  // Contoured Figure-8 Acoustic Body (Lower Bout + Upper Bout)
  addBox(g, woodBodyMat, [0, 0.6, 0], [1.1, 0.75, 0.22], 0.08); // Lower bout
  addBox(g, woodBodyMat, [0, 1.15, 0], [0.85, 0.65, 0.2], 0.06); // Upper bout

  // Soundhole Rosette & Cavity
  addRing(g, goldHardwareMat, [0, 0.95, 0.11], 0.18, 0.015);
  addPart(g, new THREE.CircleGeometry(0.16, 24), fretboardMat, [0, 0.95, 0.115]);

  // Wooden Bridge
  addBox(g, fretboardMat, [0, 0.45, 0.12], [0.45, 0.08, 0.03], 0.01);

  // Mahogany Neck
  addRod(g, woodBodyMat, [0, 1.45, 0.04], [0, 2.35, 0.04], 0.06);
  // Fretboard Surface
  addBox(g, fretboardMat, [0, 1.9, 0.09], [0.12, 0.95, 0.02], 0.005);

  // Peghead / Headstock
  addBox(g, woodBodyMat, [0, 2.55, 0.02], [0.18, 0.42, 0.04], 0.01);

  // 6 Tuning Machine Pegs
  for (let p = 0; p < 3; p++) {
    const yPos = 2.42 + p * 0.12;
    addRod(g, goldHardwareMat, [-0.12, yPos, 0.02], [-0.18, yPos, 0.02], 0.015);
    addRod(g, goldHardwareMat, [0.12, yPos, 0.02], [0.18, yPos, 0.02], 0.015);
  }

  return { group: g };
}

// =========================================================================
// 6. OPTICS: Cinema Camera Body & Lens Assembly
// =========================================================================
export function createCameraAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const bodyMat = palette.iron || createMaterial('#18181b', 0.6, 0.4);
  const lensBarrelMat = createMaterial('#09090b', 0.25, 0.8);
  const lensGlassMat = palette.glass;
  const goldRingMat = palette.gold;

  // Magnesium Alloy Camera Body
  addBox(g, bodyMat, [0, 0.65, 0], [0.95, 0.75, 1.1], 0.06);

  // Textured Leatherette Hand Grip
  addBox(g, createMaterial('#09090b', 0.9, 0.0), [0.5, 0.62, 0.2], [0.22, 0.68, 0.45], 0.04);

  // Tiered Cine Lens Barrel
  addPart(g, new THREE.CylinderGeometry(0.32, 0.35, 0.45, 24), lensBarrelMat, [0, 0.65, 0.75]).rotation.x = Math.PI / 2;
  addRing(g, goldRingMat, [0, 0.65, 0.75], 0.33, 0.015); // Focus ring
  addPart(g, new THREE.CylinderGeometry(0.38, 0.38, 0.25, 24), lensBarrelMat, [0, 0.65, 1.05]).rotation.x = Math.PI / 2;

  // Front Curved Glass Element
  const frontGlass = addPart(g, new THREE.SphereGeometry(0.36, 24, 12, 0, Math.PI * 2, 0, Math.PI / 4), lensGlassMat, [0, 0.65, 1.15]);
  frontGlass.rotation.x = Math.PI / 2;

  // Top Director Handle & Hotshoe
  addRod(g, bodyMat, [0, 1.06, -0.3], [0, 1.06, 0.3], 0.045);
  addRod(g, bodyMat, [0, 1.02, -0.3], [0, 1.06, -0.3], 0.03);
  addRod(g, bodyMat, [0, 1.02, 0.3], [0, 1.06, 0.3], 0.03);

  // Folded Side Monitor Display
  addBox(g, palette.glowCyan || bodyMat, [-0.52, 0.65, -0.1], [0.04, 0.48, 0.65], 0.01);

  return { group: g };
}

// =========================================================================
// 7. LIGHTING / INTERIOR: Table Lamp
// =========================================================================
export function createTableLampAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const brassMat = palette.gold || createMaterial('#d97706', 0.25, 0.85);
  const shadeMat = palette.cream || createMaterial('#fef3c7', 0.4, 0.1);
  const bulbGlow = palette.glowOrange || palette.glowCyan;

  // Heavy Weighted Brass Pedestal Base
  addPart(g, new THREE.CylinderGeometry(0.42, 0.48, 0.08, 24), brassMat, [0, 0.04, 0]);

  // Slender Vertical Brass Stem
  addRod(g, brassMat, [0, 0.08, 0], [0, 1.35, 0], 0.035);

  // Tapered Translucent Fabric Lampshade
  addPart(g, new THREE.CylinderGeometry(0.35, 0.65, 0.65, 24, 1, true), shadeMat, [0, 1.55, 0]);

  // Glowing Warm Interior Lightbulb
  const bulb = addPart(g, new THREE.SphereGeometry(0.14, 16, 12), bulbGlow, [0, 1.5, 0]);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Gentle warm incandescent pulse
      bulb.scale.setScalar(1 + 0.04 * Math.sin(time * 3));
    },
  };
}

// =========================================================================
// 8. AVIATION / AEROSPACE: Streamlined Aircraft Assembly
// =========================================================================
export function createAircraftAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const fuselageMat = palette.primary || createMaterial('#f1f5f9', 0.25, 0.35);
  const wingMat = palette.primary || createMaterial('#e2e8f0', 0.3, 0.3);
  const engineMat = palette.iron || createMaterial('#1e293b', 0.4, 0.85);
  const trimMat = palette.gold || createMaterial('#0284c7', 0.2, 0.6);
  const canopyGlass = palette.glass || createMaterial('#0284c7', 0.1, 0.9);
  const exhaustGlow = palette.glowOrange || palette.glowCyan;

  // A. Aerodynamic Fuselage
  addPart(g, new THREE.CylinderGeometry(0.35, 0.42, 2.6, 20), fuselageMat, [0, 0.9, 0], [Math.PI / 2, 0, 0]);
  addPart(g, new THREE.ConeGeometry(0.35, 0.85, 20), trimMat, [0, 0.9, 1.72], [-Math.PI / 2, 0, 0]);
  addPart(g, new THREE.CylinderGeometry(0.1, 0.35, 0.8, 16), fuselageMat, [0, 0.9, -1.7], [Math.PI / 2, 0, 0]);

  // B. Cockpit Canopy Dome
  addEll(g, canopyGlass, [0, 1.18, 0.65], [0.26, 0.22, 0.65]);

  // C. Main Swept Wings with Winglets
  addBox(g, wingMat, [-1.55, 0.85, -0.1], [2.1, 0.05, 0.7], 0.015);
  addBox(g, wingMat, [1.55, 0.85, -0.1], [2.1, 0.05, 0.7], 0.015);
  addBox(g, trimMat, [-2.6, 1.02, -0.1], [0.04, 0.35, 0.4], 0.01);
  addBox(g, trimMat, [2.6, 1.02, -0.1], [0.04, 0.35, 0.4], 0.01);

  // D. Underwing Jet Engines
  addPart(g, new THREE.CylinderGeometry(0.18, 0.2, 0.75, 16), engineMat, [-0.95, 0.62, 0.1], [Math.PI / 2, 0, 0]);
  addRing(g, exhaustGlow, [-0.95, 0.62, -0.3], 0.14, 0.02);
  addPart(g, new THREE.CylinderGeometry(0.18, 0.2, 0.75, 16), engineMat, [0.95, 0.62, 0.1], [Math.PI / 2, 0, 0]);
  addRing(g, exhaustGlow, [0.95, 0.62, -0.3], 0.14, 0.02);

  // E. Empennage (Vertical Tailfin & Horizontal Elevators)
  addBox(g, wingMat, [0, 1.5, -1.75], [0.06, 0.9, 0.65], 0.02);
  addBox(g, wingMat, [0, 1.0, -1.9], [1.4, 0.04, 0.45], 0.01);

  // F. Landing Gear Stance
  addRod(g, engineMat, [0, 0.9, 1.1], [0, 0.2, 1.1], 0.025);
  addRing(g, engineMat, [0, 0.2, 1.1], 0.16, 0.04);
  for (const sx of [-0.7, 0.7]) {
    addRod(g, engineMat, [sx, 0.8, -0.2], [sx, 0.2, -0.2], 0.025);
    addRing(g, engineMat, [sx, 0.2, -0.2], 0.18, 0.04);
  }

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      g.position.y = 0.02 * Math.sin(time * 2.5);
    },
  };
}

// =========================================================================
// 9. GROUND VEHICLE: Articulated Motorcycle / Motorbike Assembly
// =========================================================================
export function createMotorcycleAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const tireMat = palette.iron || createMaterial('#18181b', 0.85, 0.1);
  const rimMat = palette.gold || createMaterial('#cbd5e1', 0.2, 0.9);
  const chassisMat = palette.primary || createMaterial('#dc2626', 0.35, 0.7);
  const engineMat = createMaterial('#475569', 0.4, 0.85);
  const leatherMat = createMaterial('#1c1917', 0.7, 0.1);
  const headlightMat = palette.glowOrange || palette.glowCyan;

  // Front & Rear Wheels
  const fWheel = addRing(g, tireMat, [0, 0.45, 1.2], 0.44, 0.08);
  fWheel.rotation.y = Math.PI / 2;
  addPart(g, new THREE.CylinderGeometry(0.36, 0.36, 0.05, 20), rimMat, [0, 0.45, 1.2], [0, 0, Math.PI / 2]);

  const rWheel = addRing(g, tireMat, [0, 0.45, -1.1], 0.44, 0.09);
  rWheel.rotation.y = Math.PI / 2;
  addPart(g, new THREE.CylinderGeometry(0.36, 0.36, 0.06, 20), rimMat, [0, 0.45, -1.1], [0, 0, Math.PI / 2]);

  // Tubular Steel Frame Rails
  addRod(g, engineMat, [0, 0.45, -1.1], [0, 0.45, 0.2], 0.03);
  addRod(g, engineMat, [0, 0.45, 0.2], [0, 1.15, 0.85], 0.035);
  addRod(g, engineMat, [0, 0.45, -1.1], [0, 0.65, -0.3], 0.03);

  // Engine Block & Exhaust
  addBox(g, engineMat, [0, 0.6, 0.05], [0.42, 0.5, 0.55], 0.03);
  addCurve(
    g,
    rimMat,
    [new THREE.Vector3(0.22, 0.5, 0.2), new THREE.Vector3(0.24, 0.35, -0.3), new THREE.Vector3(0.24, 0.45, -1.1)],
    0.035,
    12
  );

  // Fuel Tank & Leather Saddle
  addEll(g, chassisMat, [0, 1.08, 0.45], [0.3, 0.25, 0.5]);
  addBox(g, leatherMat, [0, 0.95, -0.3], [0.32, 0.12, 0.55], 0.03);

  // Front Suspension Forks & Handlebars
  for (const side of [-0.14, 0.14]) {
    addRod(g, rimMat, [side, 0.45, 1.2], [side, 1.15, 0.85], 0.025);
  }
  addRod(g, rimMat, [-0.42, 1.22, 0.8], [0.42, 1.22, 0.8], 0.022);
  addPart(g, new THREE.CylinderGeometry(0.12, 0.1, 0.14, 16), rimMat, [0, 1.12, 1.02], [Math.PI / 2, 0, 0]);
  addPart(g, new THREE.CircleGeometry(0.11, 16), headlightMat, [0, 1.12, 1.1]);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Gentle motorcycle idle vibration
      g.position.y = 0.005 * Math.sin(time * 24);
    },
  };
}

// =========================================================================
// 10. MUSICAL: Grand Piano & Keybed Assembly
// =========================================================================
export function createPianoKeyboardAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const woodMat = palette.primary || palette.wood || createMaterial('#0f172a', 0.2, 0.1);
  const whiteKeyMat = palette.cream || createMaterial('#f8fafc', 0.2, 0.0);
  const blackKeyMat = palette.iron || createMaterial('#020617', 0.5, 0.1);
  const goldMat = palette.gold || createMaterial('#d97706', 0.2, 0.85);
  const feltMat = createMaterial('#b91c1c', 0.85, 0.0);

  // A. Main Piano Cabinet Body & Lid
  addBox(g, woodMat, [0, 1.05, -0.15], [1.8, 0.65, 1.2], 0.03);
  addBox(g, woodMat, [0, 1.45, -0.2], [1.78, 0.04, 1.15], 0.01);

  // B. Keybed Shelf
  addBox(g, woodMat, [0, 0.82, 0.48], [1.72, 0.1, 0.45], 0.02);
  addBox(g, feltMat, [0, 0.88, 0.32], [1.6, 0.02, 0.04], 0.005);

  // C. White Keys & Realistic Black Keys Pattern
  addBox(g, whiteKeyMat, [0, 0.88, 0.52], [1.6, 0.04, 0.32], 0.005);
  const blackKeyPattern = [true, true, false, true, true, true, false];
  for (let k = 0; k < 18; k++) {
    if (blackKeyPattern[k % blackKeyPattern.length]) {
      const kx = -0.72 + k * 0.082;
      addBox(g, blackKeyMat, [kx, 0.92, 0.45], [0.042, 0.045, 0.2], 0.005);
    }
  }

  // D. Music Rest & Sheet
  addBox(g, woodMat, [0, 1.35, 0.25], [0.85, 0.32, 0.025], 0.005);
  addBox(g, createMaterial('#fef3c7', 0.6, 0.0), [0, 1.35, 0.27], [0.65, 0.26, 0.005], 0.002);

  // E. Elegant Turned Legs
  for (const x of [-0.75, 0.75]) {
    addPart(g, new THREE.CylinderGeometry(0.06, 0.04, 0.82, 14), woodMat, [x, 0.41, 0.55]);
    addPart(g, new THREE.SphereGeometry(0.04, 12, 12), goldMat, [x, 0.04, 0.55]);
  }
  addPart(g, new THREE.CylinderGeometry(0.06, 0.04, 0.82, 14), woodMat, [0, 0.41, -0.65]);
  addPart(g, new THREE.SphereGeometry(0.04, 12, 12), goldMat, [0, 0.04, -0.65]);

  // F. Pedal Lyre with 3 Brass Pedals
  addRod(g, woodMat, [-0.08, 0.78, 0], [-0.08, 0.15, 0], 0.025);
  addRod(g, woodMat, [0.08, 0.78, 0], [0.08, 0.15, 0], 0.025);
  for (let p = -1; p <= 1; p++) {
    addBox(g, goldMat, [p * 0.07, 0.12, 0.08], [0.035, 0.02, 0.14], 0.005);
  }

  return { group: g };
}

// =========================================================================
// 21. ACOUSTIC: Concert Woodwind Flute & Keypad Assembly
// Grounded in 3Dviz Pro Max object-archetype & object-craft principles.
// =========================================================================
export function createWoodwindFluteAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const silverBodyMat = createMaterial('#f1f5f9', 0.12, 0.95);
  const goldTrimMat = palette.gold || createMaterial('#fbbf24', 0.18, 0.92);
  const darkHoleMat = palette.iron || createMaterial('#090d16', 0.9, 0.05);

  // A. Main Cylindrical Flute Tube (Slender high-aspect-ratio cylinder, horizontal)
  addPart(
    g,
    new THREE.CylinderGeometry(0.038, 0.038, 1.9, 24),
    silverBodyMat,
    [0, 1.0, 0],
    [0, 0, Math.PI / 2]
  );

  // B. Headjoint (Left side: x = -0.95 to -0.45)
  // 1. Crown Plug at closed end
  addPart(g, new THREE.CylinderGeometry(0.042, 0.042, 0.05, 20), goldTrimMat, [-0.96, 1.0, 0], [0, 0, Math.PI / 2]);
  addPart(g, new THREE.SphereGeometry(0.038, 16, 12), goldTrimMat, [-0.985, 1.0, 0]);

  // 2. Headjoint connector ring
  addPart(g, new THREE.CylinderGeometry(0.041, 0.041, 0.03, 20), goldTrimMat, [-0.45, 1.0, 0], [0, 0, Math.PI / 2]);

  // 3. Embouchure Lip Plate (Raised curved solder plate on top of tube)
  addBox(g, silverBodyMat, [-0.72, 1.045, 0], [0.14, 0.015, 0.07], 0.005);
  // Dark Embouchure Blow Hole
  addPart(g, new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16), darkHoleMat, [-0.72, 1.045, 0]);

  // C. Longitudinal Key Axle Mechanism Rods
  addRod(g, silverBodyMat, [-0.4, 1.042, 0.032], [0.85, 1.042, 0.032], 0.007);
  addRod(g, silverBodyMat, [-0.35, 1.025, -0.035], [0.8, 1.025, -0.035], 0.006);

  // D. Tone Hole Key Cups & Mounting Posts (Body Joint: 12 key cups)
  const keyPositions = [
    -0.38, -0.28, -0.19, -0.10, -0.01, 0.08, 0.17, 0.26, 0.35, 0.44, 0.53, 0.62
  ];

  for (const kx of keyPositions) {
    addPart(
      g,
      new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16),
      goldTrimMat,
      [kx, 1.042, 0]
    );
    addRod(g, silverBodyMat, [kx, 1.042, 0], [kx, 1.042, 0.032], 0.004);
    addPart(
      g,
      new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8),
      silverBodyMat,
      [kx, 1.03, 0.032]
    );
  }

  // E. Footjoint Keys (Clustered keys at right end: x = 0.70, 0.78, 0.86)
  for (const fx of [0.70, 0.78, 0.86]) {
    addPart(
      g,
      new THREE.CylinderGeometry(0.024, 0.024, 0.012, 16),
      goldTrimMat,
      [fx, 1.042, 0]
    );
    addRod(g, silverBodyMat, [fx, 1.042, 0], [fx, 1.042, 0.032], 0.004);
  }

  // F. Footjoint End Ring & Open Bore Recess
  addPart(g, new THREE.CylinderGeometry(0.041, 0.041, 0.025, 20), goldTrimMat, [0.94, 1.0, 0], [0, 0, Math.PI / 2]);
  addPart(g, new THREE.CircleGeometry(0.034, 16), darkHoleMat, [0.952, 1.0, 0], [0, Math.PI / 2, 0]);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      g.position.y = 0.018 * Math.sin(time * 2.2);
      g.rotation.z = 0.08 + 0.015 * Math.sin(time * 1.5);
    },
  };
}

// =========================================================================
// 11. SCIENTIFIC: Laboratory Microscope Assembly
// =========================================================================
export function createMicroscopeAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const baseMat = palette.iron || createMaterial('#0f172a', 0.5, 0.6);
  const chromeMat = createMaterial('#e2e8f0', 0.15, 0.95);
  const brassMat = palette.gold || createMaterial('#d97706', 0.25, 0.85);
  const glassMat = palette.glass;

  // A. Horseshoe Cast-Iron Base
  addBox(g, baseMat, [0, 0.08, 0], [0.85, 0.16, 0.95], 0.04);

  // B. Curved Limb / Arm
  const armPoints = [
    new THREE.Vector3(0, 0.16, -0.28),
    new THREE.Vector3(0, 0.7, -0.38),
    new THREE.Vector3(0, 1.25, -0.2),
    new THREE.Vector3(0, 1.45, 0.05),
  ];
  addCurve(g, baseMat, armPoints, 0.07, 16);

  // C. Coaxial Focus Dials
  addPart(g, new THREE.CylinderGeometry(0.12, 0.12, 0.35, 20), brassMat, [0, 0.85, -0.32], [0, 0, Math.PI / 2]);
  addPart(g, new THREE.CylinderGeometry(0.07, 0.07, 0.42, 16), chromeMat, [0, 0.85, -0.32], [0, 0, Math.PI / 2]);

  // D. Stage Platform & Slide
  addBox(g, baseMat, [0, 0.72, 0.12], [0.72, 0.05, 0.72], 0.01);
  const stageRing = addRing(g, chromeMat, [0, 0.75, 0.12], 0.08, 0.01);
  stageRing.rotation.x = Math.PI / 2;
  addBox(g, glassMat, [0, 0.76, 0.12], [0.45, 0.008, 0.18], 0.002);

  // E. Revolving Objective Turret & Lenses
  addPart(g, new THREE.CylinderGeometry(0.16, 0.1, 0.08, 16), brassMat, [0, 1.15, 0.12]);
  addPart(g, new THREE.CylinderGeometry(0.04, 0.035, 0.16, 12), chromeMat, [-0.08, 1.05, 0.08]);
  addPart(g, new THREE.CylinderGeometry(0.04, 0.035, 0.22, 12), brassMat, [0.08, 1.01, 0.08]);
  addPart(g, new THREE.CylinderGeometry(0.04, 0.035, 0.28, 12), chromeMat, [0, 0.98, 0.18]);

  // F. Angled Viewing Tube & Binocular Eyepieces
  addRod(g, baseMat, [0, 1.35, 0.08], [0, 1.72, -0.15], 0.05);
  addRod(g, chromeMat, [-0.08, 1.72, -0.15], [-0.1, 1.95, -0.28], 0.03);
  addRod(g, chromeMat, [0.08, 1.72, -0.15], [0.1, 1.95, -0.28], 0.03);

  // G. Sub-stage Illuminator
  addPart(g, new THREE.CylinderGeometry(0.1, 0.12, 0.16, 16), baseMat, [0, 0.35, 0.12]);
  addPart(g, new THREE.CircleGeometry(0.08, 16), palette.glowCyan || glassMat, [0, 0.44, 0.12], [-Math.PI / 2, 0, 0]);

  return { group: g };
}

// =========================================================================
// 12. ASTRONOMY: Telescope & Equatorial Tripod Assembly
// =========================================================================
export function createTelescopeAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const barrelMat = palette.primary || createMaterial('#f8fafc', 0.3, 0.2);
  const goldMat = palette.gold || createMaterial('#d97706', 0.2, 0.85);
  const darkMat = palette.iron || createMaterial('#18181b', 0.5, 0.7);
  const glassMat = palette.glass;

  // A. Sturdy Tripod Legs & Accessory Spreader Tray
  addRod(g, darkMat, [0, 1.3, 0], [0, 0, 0.95], 0.035);
  addRod(g, darkMat, [0, 1.3, 0], [-0.82, 0, -0.48], 0.035);
  addRod(g, darkMat, [0, 1.3, 0], [0.82, 0, -0.48], 0.035);
  addPart(g, new THREE.CylinderGeometry(0.35, 0.35, 0.02, 3), darkMat, [0, 0.5, 0]);

  // B. Equatorial Mount & Counterweight
  addBox(g, darkMat, [0, 1.45, 0], [0.25, 0.25, 0.25], 0.02);
  addRod(g, goldMat, [0, 1.45, 0], [0.45, 1.15, -0.2], 0.02);
  addPart(g, new THREE.CylinderGeometry(0.12, 0.12, 0.14, 16), darkMat, [0.38, 1.2, -0.17]);

  // C. Angled Optical Tube Assembly (OTA)
  const tubeGroup = new THREE.Group();
  tubeGroup.position.set(0, 1.55, 0);
  tubeGroup.rotation.x = 0.35; // Pointing up at the stars

  addPart(tubeGroup, new THREE.CylinderGeometry(0.2, 0.2, 2.2, 24), barrelMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
  addRing(tubeGroup, goldMat, [0, 0, 1.1], 0.21, 0.02);
  addPart(tubeGroup, new THREE.CircleGeometry(0.19, 24), glassMat, [0, 0, 1.09]);

  // Finder Scope on Top
  addPart(tubeGroup, new THREE.CylinderGeometry(0.045, 0.045, 0.6, 14), darkMat, [0, 0.28, 0.2], [Math.PI / 2, 0, 0]);

  // Focuser & 90-degree Diagonal Eyepiece
  addPart(tubeGroup, new THREE.CylinderGeometry(0.07, 0.07, 0.35, 16), goldMat, [0, 0, -1.25], [Math.PI / 2, 0, 0]);
  addRod(tubeGroup, darkMat, [0, 0, -1.45], [0, 0.22, -1.45], 0.035);

  g.add(tubeGroup);

  return { group: g };
}

// =========================================================================
// 13. APPLIANCE: Monolithic Refrigerator / Enclosure Assembly
// =========================================================================
export function createApplianceCabinetAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const bodyMat = palette.primary || createMaterial('#cbd5e1', 0.35, 0.7);
  const trimMat = palette.iron || createMaterial('#334155', 0.5, 0.4);
  const chromeMat = createMaterial('#f1f5f9', 0.15, 0.95);
  const ledMat = palette.glowCyan;

  // Main Cabinet Chassis
  addBox(g, bodyMat, [0, 1.25, 0], [1.1, 2.3, 0.95], 0.04);

  // Upper & Lower Split Door Panels
  addBox(g, bodyMat, [0, 1.95, 0.49], [1.06, 0.8, 0.04], 0.015);
  addBox(g, bodyMat, [0, 0.92, 0.49], [1.06, 1.15, 0.04], 0.015);
  addBox(g, trimMat, [0, 1.52, 0.48], [1.08, 0.04, 0.02], 0.005);

  // Vertical Tubular Handles
  addRod(g, chromeMat, [0.44, 2.25, 0.54], [0.44, 1.65, 0.54], 0.022);
  addRod(g, chromeMat, [0.44, 1.45, 0.54], [0.44, 0.4, 0.54], 0.022);

  // Touch Screen Display
  addBox(g, trimMat, [0, 1.95, 0.515], [0.26, 0.12, 0.01], 0.005);
  addBox(g, ledMat, [0, 1.95, 0.522], [0.18, 0.04, 0.002], 0.002);

  // Bottom Ventilation Louvers & Feet
  addBox(g, trimMat, [0, 0.15, 0.46], [1.06, 0.22, 0.06], 0.01);
  for (let s = 0; s < 4; s++) {
    addBox(g, bodyMat, [0, 0.08 + s * 0.045, 0.495], [0.95, 0.015, 0.01], 0.002);
  }
  for (const x of [-0.45, 0.45]) {
    for (const z of [-0.38, 0.38]) {
      addPart(g, new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), trimMat, [x, 0.025, z]);
    }
  }

  return { group: g };
}

// =========================================================================
// 14. KINETIC: Oscillating Stand Fan Assembly
// =========================================================================
export function createOscillatingFanAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const bodyMat = palette.primary || createMaterial('#f1f5f9', 0.35, 0.1);
  const chromeMat = createMaterial('#e2e8f0', 0.15, 0.95);
  const bladeMat = palette.glowCyan || createMaterial('#38bdf8', 0.25, 0.1);
  const darkMat = palette.iron || createMaterial('#1e293b', 0.5, 0.5);

  // A. Circular Stepped Pedestal Base & Switches
  addPart(g, new THREE.CylinderGeometry(0.48, 0.52, 0.09, 24), bodyMat, [0, 0.045, 0]);
  for (let b = -1.5; b <= 1.5; b++) {
    addBox(g, chromeMat, [b * 0.08, 0.095, 0.25], [0.04, 0.02, 0.04], 0.005);
  }

  // B. Chrome Stand Rod
  addRod(g, chromeMat, [0, 0.09, 0], [0, 1.35, 0], 0.035);
  const collar = addRing(g, darkMat, [0, 0.85, 0], 0.045, 0.015);
  collar.rotation.x = Math.PI / 2;

  // C. Panning Fan Head
  const fanHead = new THREE.Group();
  fanHead.position.set(0, 1.45, 0);

  addPart(fanHead, new THREE.CylinderGeometry(0.16, 0.18, 0.42, 18), bodyMat, [0, 0, -0.1], [Math.PI / 2, 0, 0]);
  addPart(fanHead, new THREE.CylinderGeometry(0.025, 0.025, 0.08, 12), darkMat, [0, 0.2, -0.18]);

  // Wire Cage Rings & Spokes
  addRing(fanHead, chromeMat, [0, 0, 0.12], 0.52, 0.012);
  addRing(fanHead, chromeMat, [0, 0, 0.12], 0.32, 0.008);
  for (let s = 0; s < 8; s++) {
    const a = (s * Math.PI) / 4;
    addRod(fanHead, chromeMat, [0, 0, 0.12], [Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0.12], 0.005);
  }

  // D. Dynamic Impeller Rotor with 4 Blades
  const rotorGroup = new THREE.Group();
  rotorGroup.position.set(0, 0, 0.12);
  addPart(rotorGroup, new THREE.SphereGeometry(0.08, 16, 12), darkMat, [0, 0, 0]);

  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const bx = Math.cos(a) * 0.25;
    const by = Math.sin(a) * 0.25;
    const blade = addEll(rotorGroup, bladeMat, [bx, by, 0], [0.18, 0.08, 0.01]);
    blade.rotation.z = a + 0.3;
  }
  fanHead.add(rotorGroup);
  g.add(fanHead);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      rotorGroup.rotation.z += dt * 24; // Dynamic spinning fan blades
      fanHead.rotation.y = Math.sin(time * 1.8) * 0.48; // Dynamic oscillation
    },
  };
}

// =========================================================================
// 15. TIMEPIECE: Wall / Desk Clock Assembly
// =========================================================================
export function createTimepieceAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const bezelMat = palette.gold || createMaterial('#d97706', 0.2, 0.85);
  const caseMat = palette.wood || palette.iron || createMaterial('#1e293b', 0.4, 0.6);
  const dialMat = palette.cream || createMaterial('#f8fafc', 0.2, 0.0);
  const handsMat = palette.iron || createMaterial('#0f172a', 0.2, 0.1);
  const secondHandMat = createMaterial('#dc2626', 0.2, 0.1);
  const glassMat = palette.glass;

  // Casing & Heavy Bevel Ring
  addPart(g, new THREE.CylinderGeometry(0.72, 0.72, 0.14, 32), caseMat, [0, 1.15, -0.06], [Math.PI / 2, 0, 0]);
  addRing(g, bezelMat, [0, 1.15, 0.02], 0.72, 0.045);
  addPart(g, new THREE.CircleGeometry(0.68, 32), dialMat, [0, 1.15, 0.015]);

  // 12 Radial Hour Markers
  for (let h = 0; h < 12; h++) {
    const a = (h * Math.PI) / 6;
    const r = 0.56;
    const isQuarter = h % 3 === 0;
    const mark = addBox(
      g,
      handsMat,
      [Math.sin(a) * r, 1.15 + Math.cos(a) * r, 0.02],
      [isQuarter ? 0.04 : 0.02, isQuarter ? 0.1 : 0.06, 0.005],
      0.001
    );
    mark.rotation.z = -a;
  }

  // Central Pivot Post & Hands
  addPart(g, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), bezelMat, [0, 1.15, 0.03], [Math.PI / 2, 0, 0]);
  addBox(g, handsMat, [0.12, 1.25, 0.025], [0.035, 0.3, 0.005], 0.002);
  addBox(g, handsMat, [-0.18, 1.32, 0.028], [0.025, 0.46, 0.005], 0.002);

  // Rotating Second Hand
  const secGroup = new THREE.Group();
  secGroup.position.set(0, 1.15, 0.032);
  addBox(secGroup, secondHandMat, [0, 0.25, 0], [0.012, 0.54, 0.005], 0.001);
  g.add(secGroup);

  // Glass Lens
  addPart(g, new THREE.CircleGeometry(0.68, 32), glassMat, [0, 1.15, 0.04]);

  // Pedestal Stand
  addBox(g, bezelMat, [0, 0.06, 0], [0.85, 0.12, 0.45], 0.02);
  addRod(g, bezelMat, [0, 0.12, 0], [0, 0.45, 0], 0.05);

  return {
    group: g,
    update: (dt) => {
      secGroup.rotation.z -= dt * 1.5;
    },
  };
}

// =========================================================================
// 16. FURNITURE: Bedstead & Upholstered Mattress Assembly
// =========================================================================
export function createBedFurnitureAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const frameMat = palette.primary || palette.wood || createMaterial('#451a03', 0.4, 0.1);
  const mattressMat = palette.cream || createMaterial('#f8fafc', 0.6, 0.0);
  const pillowMat = createMaterial('#ffffff', 0.7, 0.0);
  const duvetMat = palette.primary || createMaterial('#0284c7', 0.5, 0.1);
  const postGold = palette.gold || createMaterial('#d97706', 0.25, 0.8);

  // Frame Base & 4 Turned Corner Posts
  addBox(g, frameMat, [0, 0.26, 0], [1.75, 0.22, 2.35], 0.03);
  for (const x of [-0.85, 0.85]) {
    for (const z of [-1.15, 1.15]) {
      addRod(g, frameMat, [x, 0, z], [x, 0.85, z], 0.045);
      addPart(g, new THREE.SphereGeometry(0.055, 12, 12), postGold, [x, 0.88, z]);
    }
  }

  // Headboard & Footboard
  addBox(g, frameMat, [0, 0.98, -1.14], [1.8, 1.2, 0.1], 0.04);
  addBox(g, duvetMat, [0, 1.02, -1.08], [1.58, 0.95, 0.04], 0.03);
  addBox(g, frameMat, [0, 0.48, 1.14], [1.8, 0.42, 0.08], 0.03);

  // Thick Mattress Slab
  addBox(g, mattressMat, [0, 0.48, 0.02], [1.62, 0.28, 2.15], 0.06);

  // Dual Pillows
  const pLeft = addBox(g, pillowMat, [-0.42, 0.7, -0.78], [0.6, 0.14, 0.4], 0.05);
  pLeft.rotation.x = -0.18;
  const pRight = addBox(g, pillowMat, [0.42, 0.7, -0.78], [0.6, 0.14, 0.4], 0.05);
  pRight.rotation.x = -0.18;

  // Layered Duvet / Comforter
  addBox(g, duvetMat, [0, 0.65, 0.25], [1.66, 0.12, 1.55], 0.04);
  addBox(g, mattressMat, [0, 0.66, -0.5], [1.66, 0.1, 0.2], 0.02);

  return { group: g };
}

// =========================================================================
// 17. PERCUSSION: Concert Snare Drum Assembly
// =========================================================================
export function createPercussionDrumAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const shellMat = palette.primary || palette.wood || createMaterial('#991b1b', 0.35, 0.1);
  const headMat = palette.cream || createMaterial('#f8fafc', 0.4, 0.0);
  const chromeMat = createMaterial('#e2e8f0', 0.15, 0.95);
  const lugMat = palette.gold || chromeMat;

  // Cylindrical Resonant Drum Shell
  addPart(g, new THREE.CylinderGeometry(0.68, 0.68, 0.78, 24), shellMat, [0, 0.68, 0]);

  // Drumheads
  addPart(g, new THREE.CircleGeometry(0.67, 24), headMat, [0, 1.075, 0], [-Math.PI / 2, 0, 0]);
  addPart(g, new THREE.CircleGeometry(0.67, 24), headMat, [0, 0.285, 0], [Math.PI / 2, 0, 0]);

  // Dual Chrome Counterhoops
  const topHoop = addRing(g, chromeMat, [0, 1.08, 0], 0.71, 0.025);
  topHoop.rotation.x = Math.PI / 2;
  const bottomHoop = addRing(g, chromeMat, [0, 0.28, 0], 0.71, 0.025);
  bottomHoop.rotation.x = Math.PI / 2;

  // 8 Chrome Tension Rods & Tuning Lugs
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x = Math.cos(a) * 0.71;
    const z = Math.sin(a) * 0.71;
    addRod(g, chromeMat, [x, 0.32, z], [x, 1.04, z], 0.012);
    addBox(g, lugMat, [x * 0.98, 0.68, z * 0.98], [0.045, 0.08, 0.045], 0.01);
  }

  // Tripod Basket Stand
  addRod(g, chromeMat, [0, 0.02, 0], [0, 0.26, 0], 0.035);
  for (let l = 0; l < 3; l++) {
    const a = (l * Math.PI * 2) / 3;
    addRod(g, chromeMat, [0, 0.26, 0], [Math.cos(a) * 0.65, 0, Math.sin(a) * 0.65], 0.025);
  }

  return { group: g };
}

// =========================================================================
// 18. DEFENSE: Medieval Knight Shield Assembly
// =========================================================================
export function createShieldDefenseAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const bodyMat = palette.primary || createMaterial('#1e3a8a', 0.4, 0.3);
  const steelMat = createMaterial('#94a3b8', 0.25, 0.85);
  const goldMat = palette.gold || createMaterial('#d97706', 0.2, 0.85);
  const leatherMat = createMaterial('#78350f', 0.8, 0.0);

  // Convex Heater Shield Plate & Tapered Base
  addBox(g, bodyMat, [0, 1.35, 0], [1.1, 0.9, 0.06], 0.03);
  const chevron = addBox(g, bodyMat, [0, 0.72, 0], [0.75, 0.75, 0.06], 0.03);
  chevron.rotation.z = Math.PI / 4;

  // Center Steel Boss Umbo & Cross Bracing
  addPart(g, new THREE.SphereGeometry(0.22, 18, 12), steelMat, [0, 1.25, 0.06]);
  addRing(g, goldMat, [0, 1.25, 0.07], 0.28, 0.018);
  addBox(g, steelMat, [0, 1.25, 0.04], [1.08, 0.06, 0.02], 0.005);
  addBox(g, steelMat, [0, 1.25, 0.04], [0.06, 1.2, 0.02], 0.005);

  // Rear Leather Forearm Straps
  for (const y of [1.4, 1.1]) {
    addCurve(
      g,
      leatherMat,
      [new THREE.Vector3(-0.25, y, -0.04), new THREE.Vector3(0, y, -0.14), new THREE.Vector3(0.25, y, -0.04)],
      0.025,
      8
    );
  }

  return { group: g };
}

// =========================================================================
// 19. ARCHITECTURE: Paneled Portal & Doorway Assembly
// =========================================================================
export function createDoorGateAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const frameMat = palette.primary || palette.wood || createMaterial('#3f2314', 0.45, 0.1);
  const stoneMat = palette.stone || createMaterial('#64748b', 0.8, 0.1);
  const brassMat = palette.gold || createMaterial('#d97706', 0.2, 0.85);
  const ironMat = palette.iron || createMaterial('#1c1917', 0.6, 0.8);

  // Outer Jamb Posts, Header & Threshold
  addBox(g, frameMat, [-0.72, 1.2, 0], [0.14, 2.4, 0.16], 0.01);
  addBox(g, frameMat, [0.72, 1.2, 0], [0.14, 2.4, 0.16], 0.01);
  addBox(g, frameMat, [0, 2.45, 0], [1.58, 0.16, 0.18], 0.02);
  addBox(g, stoneMat, [0, 0.04, 0], [1.54, 0.08, 0.22], 0.01);

  // Main Door Slab
  addBox(g, frameMat, [0, 1.2, 0], [1.28, 2.34, 0.07], 0.015);

  // 4 Recessed Beveled Field Panels
  addBox(g, frameMat, [-0.32, 1.75, 0.015], [0.46, 0.72, 0.05], 0.01);
  addBox(g, frameMat, [0.32, 1.75, 0.015], [0.46, 0.72, 0.05], 0.01);
  addBox(g, frameMat, [-0.32, 0.7, 0.015], [0.46, 0.78, 0.05], 0.01);
  addBox(g, frameMat, [0.32, 0.7, 0.015], [0.46, 0.78, 0.05], 0.01);

  // Brass Handle & Lever
  addBox(g, brassMat, [0.52, 1.1, 0.055], [0.06, 0.26, 0.01], 0.005);
  addRod(g, brassMat, [0.52, 1.15, 0.06], [0.42, 1.15, 0.06], 0.015);
  addRod(g, brassMat, [0.42, 1.15, 0.06], [0.32, 1.15, 0.06], 0.015);

  // Butt Hinges
  for (const hy of [2.0, 0.5]) {
    addBox(g, ironMat, [-0.64, hy, 0.04], [0.04, 0.16, 0.02], 0.005);
  }

  return { group: g };
}

// =========================================================================
// 20. AUDIO: Studio Monitor & Speaker Cabinet Assembly
// =========================================================================
export function createAudioSpeakerAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const cabinetMat = palette.primary || palette.wood || createMaterial('#18181b', 0.5, 0.1);
  const coneMat = createMaterial('#334155', 0.7, 0.1);
  const rubberMat = createMaterial('#09090b', 0.9, 0.0);
  const domeMat = palette.gold || createMaterial('#cbd5e1', 0.2, 0.9);
  const glowMat = palette.glowCyan;

  // Acoustic Cabinet Enclosure
  addBox(g, cabinetMat, [0, 0.9, 0], [0.95, 1.6, 0.85], 0.04);
  addBox(g, cabinetMat, [0, 0.9, 0.41], [0.88, 1.52, 0.04], 0.01);

  // Concave Woofer Cone with Rubber Surround
  addPart(g, new THREE.CylinderGeometry(0.3, 0.1, 0.08, 24), coneMat, [0, 0.65, 0.43], [Math.PI / 2, 0, 0]);
  addRing(g, rubberMat, [0, 0.65, 0.43], 0.3, 0.02);
  addPart(g, new THREE.SphereGeometry(0.08, 16, 12), domeMat, [0, 0.65, 0.44]);

  // High-Frequency Tweeter in Waveguide
  addPart(g, new THREE.SphereGeometry(0.09, 16, 12), domeMat, [0, 1.25, 0.43]);
  addRing(g, cabinetMat, [0, 1.25, 0.43], 0.14, 0.015);

  // Tuned Reflex Port & Controls
  addRing(g, cabinetMat, [0, 0.24, 0.43], 0.09, 0.015);
  addPart(g, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14), domeMat, [0.32, 1.55, 0.44], [Math.PI / 2, 0, 0]);
  addPart(g, new THREE.CircleGeometry(0.015, 12), glowMat, [-0.32, 1.55, 0.44]);

  return { group: g };
}

// =========================================================================
// 21. SCI-FI / MECH: Articulated Biped Robot / Automaton Assembly
// =========================================================================
export function createRobotMechaAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const armorMat = palette.primary || createMaterial('#334155', 0.4, 0.7);
  const frameMat = palette.iron || createMaterial('#0f172a', 0.5, 0.8);
  const jointMat = palette.gold || createMaterial('#e2e8f0', 0.2, 0.9);
  const glowMat = palette.glowCyan || palette.glowOrange;

  // Armored Torso Chassis & Glowing Core
  addBox(g, armorMat, [0, 1.6, 0], [1.1, 0.85, 0.7], 0.06);
  addRing(g, glowMat, [0, 1.65, 0.36], 0.15, 0.02);
  addBox(g, frameMat, [0, 1.05, 0], [0.75, 0.4, 0.55], 0.04);

  // Armored Head & Visor
  addBox(g, armorMat, [0, 2.25, 0], [0.55, 0.42, 0.5], 0.03);
  addBox(g, glowMat, [0, 2.28, 0.26], [0.42, 0.06, 0.02], 0.005);
  for (const s of [-0.28, 0.28]) {
    addRod(g, jointMat, [s, 2.45, 0], [s, 2.8, 0], 0.012);
  }

  // Articulated Arms
  for (const side of [-1, 1]) {
    addPart(g, new THREE.SphereGeometry(0.18, 14, 12), jointMat, [side * 0.72, 1.8, 0]);
    addBox(g, armorMat, [side * 0.78, 1.95, 0], [0.35, 0.2, 0.45], 0.03);
    addRod(g, frameMat, [side * 0.72, 1.8, 0], [side * 0.82, 1.25, 0], 0.045);
    addPart(g, new THREE.SphereGeometry(0.1, 12, 12), jointMat, [side * 0.82, 1.25, 0]);
    addRod(g, frameMat, [side * 0.82, 1.25, 0], [side * 0.82, 0.8, 0.15], 0.04);
    addBox(g, armorMat, [side * 0.82, 0.72, 0.2], [0.12, 0.18, 0.18], 0.02);
  }

  // Hydraulic Legs
  for (const side of [-1, 1]) {
    addPart(g, new THREE.SphereGeometry(0.14, 12, 12), jointMat, [side * 0.32, 0.95, 0]);
    addRod(g, frameMat, [side * 0.32, 0.95, 0], [side * 0.35, 0.52, 0], 0.05);
    addPart(g, new THREE.SphereGeometry(0.12, 12, 12), jointMat, [side * 0.35, 0.52, 0]);
    addRod(g, frameMat, [side * 0.35, 0.52, 0], [side * 0.35, 0.12, 0], 0.05);
    addBox(g, armorMat, [side * 0.35, 0.06, 0.08], [0.32, 0.12, 0.55], 0.02);
  }

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      g.position.y = 0.015 * Math.sin(time * 2.0);
    },
  };
}

// =========================================================================
// 22. UNIVERSAL COMPOSITIONAL SYNTHESIZER FOR ANY ARBITRARY OBJECT
// Decomposes ANY custom noun into proportional base, core body, articulated
// details, and tactile PBR surfaces grounded in physical engineering archetypes.
// Zero primitive triangles, zero naked boxes!
// =========================================================================
export function synthesizeArbitraryObject(
  objectQuery: string,
  palette: ProceduralPalette
): ProceduralKitResult {
  const q = objectQuery.toLowerCase();

  // 1. Physical Archetype Delegation
  if (/\b(cup|mug|glass|bottle|bowl|vase|flask|pot|pan|jug|pitcher|teapot|chalice|urn|vessel|drink|beverage|tea|coffee)\b/i.test(q)) {
    return createHollowVesselAssembly(palette, !q.includes('bowl'));
  }

  if (/\b(microphone|mic|recording|condenser)\b/i.test(q)) {
    return createMicrophoneAssembly(palette);
  }

  if (/\b(speaker|soundbar|subwoofer|loudspeaker|boombox|audio|acoustic)\b/i.test(q)) {
    return createAudioSpeakerAssembly(palette);
  }

  if (/\b(burger|sandwich|pizza|bread|patty|meal|food|dish|cake|pie|cookie|snack|meat|cheese|hamburger)\b/i.test(q)) {
    return createLayeredFoodAssembly(palette);
  }

  if (/\b(laptop|computer|notebook|macbook)\b/i.test(q)) {
    return createLaptopAssembly(palette);
  }

  if (/\b(piano|keyboard|grandpiano|pianoforte|organ|synthesizer|keybed)\b/i.test(q)) {
    return createPianoKeyboardAssembly(palette);
  }

  if (/\b(flute|recorder|piccolo|clarinet|oboe|woodwind|whistle|fife|panpipe|nay|mizmar)\b/i.test(q)) {
    return createWoodwindFluteAssembly(palette);
  }

  if (/\b(guitar|oud|violin|cello|strings|lute|sitar|banjo|mandolin)\b/i.test(q)) {
    return createGuitarAssembly(palette);
  }

  if (/\b(drum|drums|snare|timpani|conga|bongo|percussion|tambourine)\b/i.test(q)) {
    return createPercussionDrumAssembly(palette);
  }

  if (/\b(microscope|labscope)\b/i.test(q)) {
    return createMicroscopeAssembly(palette);
  }

  if (/\b(telescope|spyglass|monocular|stargazer)\b/i.test(q)) {
    return createTelescopeAssembly(palette);
  }

  if (/\b(camera|lens|cine|dolly|rig|optics|tripod|binoculars)\b/i.test(q)) {
    return createCameraAssembly(palette);
  }

  if (/\b(lamp|lantern|lampshade|light|torch|candle|chandelier|streetlamp|spotlight|bulb)\b/i.test(q)) {
    return createTableLampAssembly(palette);
  }

  if (/\b(fan|ventilator|blower|turbine|propeller)\b/i.test(q)) {
    return createOscillatingFanAssembly(palette);
  }

  if (/\b(clock|timepiece|wristwatch|watch|stopwatch|chronometer|sundial)\b/i.test(q)) {
    return createTimepieceAssembly(palette);
  }

  if (/\b(airplane|plane|aeroplane|jet|aircraft|biplane|glider|aviation)\b/i.test(q)) {
    return createAircraftAssembly(palette);
  }

  if (
    /\b(motorcycle|motocycle|motorbike|motobike|dirtbike|moped|scooter|bike|bicycle|vespa)\b/i.test(q) ||
    q.includes('moto')
  ) {
    return createMotorcycleAssembly(palette);
  }

  if (/\b(refrigerator|fridge|freezer|oven|stove|microwave|dishwasher|appliance|cabinet|safe)\b/i.test(q)) {
    return createApplianceCabinetAssembly(palette);
  }

  if (/\b(bed|mattress|bunkbed|cot|crib)\b/i.test(q)) {
    return createBedFurnitureAssembly(palette);
  }

  if (/\b(shield|buckler|aegis|pavis)\b/i.test(q)) {
    return createShieldDefenseAssembly(palette);
  }

  if (/\b(door|gate|portal|entrance|doorway|portcullis)\b/i.test(q)) {
    return createDoorGateAssembly(palette);
  }

  if (/\b(robot|mech|mecha|android|cyborg|automaton|golem)\b/i.test(q)) {
    return createRobotMechaAssembly(palette);
  }

  // 3Dviz Pro Max First-Principles Universal Morphometric Reasoner
  return synthesizeMorphometricObject(objectQuery, palette);
}
