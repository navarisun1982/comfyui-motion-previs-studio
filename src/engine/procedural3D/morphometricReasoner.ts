import * as THREE from 'three';
import { ProceduralPalette } from './craftForms';
import { ProceduralKitResult, createQuadrupedCreature } from './proceduralKits';
import { bevelledBox, part, materialFor } from './kitCore';

/**
 * 3Dviz Pro Max First-Principles Universal Morphometric Reasoner.
 * Replaces arbitrary primitive cylinder/cone fallbacks with physically grounded,
 * multi-part procedural synthesis following references/object-reasoning.md and object-craft.md.
 *
 * Resolves novel, uncataloged, or complex nouns by reasoning through the Three Scales of Craft:
 * 1. Silhouette & Aspect Ratio (Proportions, bounding envelope, posture)
 * 2. Functional Construction (Chamfered solids, recessed insets, articulated mechanics, fasteners)
 * 3. Surface & Light Response (Cached PBR optical materials, roughness, metalness, transmission)
 */

export function synthesizeMorphometricObject(
  query: string,
  palette: ProceduralPalette
): ProceduralKitResult {
  const g = new THREE.Group();
  const q = query.toLowerCase();

  // 1. Universal Creature Adaptation (Bovine, Equine, Caprine, Canine, Feline, Pachyderm, etc.)
  if (
    /\b(creature|beast|monster|animal|quadruped|cow|cattle|bull|ox|bovine|calf|heifer|buffalo|holstein|dog|hound|wolf|cat|feline|lion|tiger|panther|bear|horse|donkey|sheep|goat|pig|camel|deer|stag|elephant|rhino|hippo|حيوان|وحش|كائن|بقرة|بقر|ثور|عجل|جاموس|كلب|ذئب|اسد|نمر|دب|حصان|خروف|ماعز|جمل|فيل)\b/i.test(
      q
    )
  ) {
    return createQuadrupedCreature(palette, query);
  }
  if (q.includes('centrifuge') || q.includes('rotor') || q.includes('gyro')) {
    return buildCentrifugeAssembly(palette);
  }
  if (q.includes('hovercraft') || q.includes('hover')) {
    return buildHovercraftAssembly(palette);
  }
  if (q.includes('anvil') || q.includes('forge')) {
    return buildAnvilAssembly(palette);
  }
  if (q.includes('satellite') || q.includes('space station') || q.includes('probe')) {
    return buildSatelliteAssembly(palette);
  }
  if (q.includes('battery') || q.includes('quantum') || q.includes('reactor') || q.includes('core')) {
    return buildQuantumCoreAssembly(palette);
  }

  // 2. Physical Morphometric Feature Classification
  const isTall = /\b(tower|pole|staff|spear|column|antenna|monolith|pillar|tall|rod|spire|obelisk|mast|totem|chimney)\b/i.test(q);
  const isRound = /\b(ball|sphere|globe|orb|wheel|disc|coin|ring|donut|round|circle|gyro|rotor)\b/i.test(q);
  const isWide = /\b(bench|couch|platform|table|bridge|wall|desk|wide|flat|slab|shelf|altar|stage|counter|chassis)\b/i.test(q);
  const isMechanical = /\b(engine|motor|generator|pump|gear|press|valve|turbine|flywheel|boiler|furnace|compressor|machine|apparatus)\b/i.test(q);
  const isHighTech = /\b(sensor|laser|scanner|device|gadget|terminal|console|spectrometer|accelerator|pod|capsule|module|data)\b/i.test(q);
  const isCrystalline = /\b(crystal|gem|diamond|prism|glass|ice|magic|hologram|ruby|emerald|mineral|ore)\b/i.test(q);
  const isWood = /\b(wood|timber|rustic|wooden|ancient|antique|plank|log|timberwork)\b/i.test(q);

  // Material Resolution
  const primaryMat = isCrystalline
    ? palette.glass
    : isWood
    ? palette.wood
    : isMechanical || isHighTech
    ? (palette.primary || palette.iron)
    : (palette.primary || palette.stone);

  const trimMat = isMechanical || isHighTech ? (palette.gold || palette.iron) : palette.iron;
  const accentGlow = palette.glowCyan || palette.glowOrange;

  // Contact envelope without fake stone pedestal
  const baseRadius = isRound ? 0.8 : isWide ? 1.3 : 0.7;
  const baseDepth = isWide ? 0.85 : 0.7;

  // B. Core Body Geometry
  if (isTall) {
    // Segmented Telescoping Riser Column with Collar Rings
    const riserGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.34, 20);
    g.add(part(riserGeo, primaryMat, [0, 1.33, 0]));

    // Collar trim rings
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 12, 24), trimMat);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.set(0, 0.9, 0);
    g.add(ring1);

    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 24), trimMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.set(0, 1.75, 0);
    g.add(ring2);

    // Finial cap
    g.add(
      part(new THREE.SphereGeometry(0.24, 20, 16), isCrystalline ? accentGlow : trimMat, [0, 2.65, 0])
    );

    // Bracing diagonal trusses
    for (const side of [-1, 1]) {
      const truss = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 12), trimMat);
      truss.position.set(side * 0.32, 0.53, 0);
      truss.rotation.z = side * 0.42;
      g.add(truss);
    }
  } else if (isRound) {
    // Multi-axis Orbital Gimbal Ring Cage & Central Core
    const cage1 = new THREE.Mesh(new THREE.TorusGeometry(baseRadius * 0.95, 0.03, 12, 28), trimMat);
    cage1.rotation.x = Math.PI / 2;
    cage1.position.set(0, 1.15, 0);
    g.add(cage1);

    const cage2 = new THREE.Mesh(new THREE.TorusGeometry(baseRadius * 0.95, 0.03, 12, 28), trimMat);
    cage2.rotation.y = Math.PI / 2;
    cage2.position.set(0, 1.15, 0);
    g.add(cage2);

    g.add(part(new THREE.SphereGeometry(baseRadius * 0.72, 24, 18), primaryMat, [0, 1.15, 0]));

    const equator = new THREE.Mesh(new THREE.TorusGeometry(baseRadius * 0.78, 0.025, 12, 24), accentGlow);
    equator.rotation.x = Math.PI / 2;
    equator.position.set(0, 1.15, 0);
    g.add(equator);
  } else if (isWide) {
    // Heavy Structural Crossbeams & Dual-Tier Surface Slabs
    g.add(
      part(
        bevelledBox({ width: baseRadius * 1.9, height: 0.7, depth: baseDepth * 1.8, bevel: 0.05 }),
        primaryMat,
        [0, 0.65, 0]
      )
    );
    g.add(
      part(
        bevelledBox({ width: baseRadius * 1.7, height: 0.1, depth: baseDepth * 1.6, bevel: 0.02 }),
        trimMat,
        [0, 1.05, 0]
      )
    );
    for (const sx of [-baseRadius * 0.92, baseRadius * 0.92]) {
      g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 12), trimMat, [sx, 0.625, -baseDepth * 0.88]));
      g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 12), trimMat, [sx, 0.625, baseDepth * 0.88]));
    }
  } else if (isMechanical) {
    // Industrial Machine Block with Flywheel, Hydraulic Actuators & Dial Gauge
    g.add(part(bevelledBox({ width: 1.1, height: 0.9, depth: 0.9, bevel: 0.04 }), primaryMat, [0, 0.75, 0]));

    // Machined Flywheel Disc
    const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 24), trimMat);
    flywheel.rotation.z = Math.PI / 2;
    flywheel.position.set(0.58, 0.75, 0);
    g.add(flywheel);

    // Hydraulic Actuator Rods
    for (const side of [-1, 1]) {
      g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 12), palette.iron, [side * 0.45, 1.45, -0.3]));
    }

    // Pressure Dial Gauge
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), trimMat);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 1.05, 0.48);
    g.add(dial);
    g.add(part(new THREE.CircleGeometry(0.1, 16), palette.cream, [0, 1.05, 0.51]));
  } else if (isHighTech) {
    // High-Tech Instrument Console Deck with Viewport Lens & Glowing Busbars
    g.add(part(bevelledBox({ width: 1.15, height: 0.85, depth: 0.9, bevel: 0.04 }), primaryMat, [0, 0.7, 0]));

    // Slanted Front Console Deck
    const consoleDeck = part(
      bevelledBox({ width: 0.95, height: 0.4, depth: 0.35, bevel: 0.02 }),
      trimMat,
      [0, 0.9, 0.35]
    );
    consoleDeck.rotation.x = -0.35;
    g.add(consoleDeck);

    // Optical Viewport Lens
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 20), trimMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.85, 0.48);
    g.add(lens);
    g.add(part(new THREE.CircleGeometry(0.16, 20), palette.glass || accentGlow, [0, 0.85, 0.52]));

    // Antenna Emitter
    g.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 12), trimMat, [0, 1.45, 0]));
    g.add(part(new THREE.SphereGeometry(0.08, 14, 12), accentGlow, [0, 1.8, 0]));
  } else {
    // Universal Articulated Chamfered Housing with Dual Stanchions & Aperture Port
    g.add(
      part(
        bevelledBox({ width: 1.0, height: 1.1, depth: 0.85, bevel: 0.04 }),
        primaryMat,
        [0, 0.75, 0]
      )
    );

    // Chamfered top cap
    g.add(
      part(
        bevelledBox({ width: 0.9, height: 0.15, depth: 0.75, bevel: 0.02 }),
        trimMat,
        [0, 1.35, 0]
      )
    );

    // Accent equator ring
    const midRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 12, 24), accentGlow);
    midRing.rotation.x = Math.PI / 2;
    midRing.position.set(0, 0.75, 0);
    g.add(midRing);

    // Dual vertical stanchion rails
    for (const side of [-1, 1]) {
      g.add(
        part(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 12), trimMat, [side * 0.54, 0.75, 0])
      );
    }

    // Optical aperture viewport
    g.add(
      part(new THREE.SphereGeometry(0.16, 16, 12), palette.glass || accentGlow, [0, 0.85, 0.45])
    );
  }

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      g.position.y = 0.012 * Math.sin(time * 2.0);
    },
  };
}

/**
 * Centrifuge / High-Speed Rotor Assembly
 */
export function buildCentrifugeAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steelMat = palette.iron || materialFor('#334155', { roughness: 0.35, metalness: 0.85 });
  const trimMat = palette.gold || materialFor('#e2e8f0', { roughness: 0.2, metalness: 0.9 });
  const accentGlow = palette.glowCyan || palette.glowOrange;

  // Base Pedestal
  g.add(part(bevelledBox({ width: 1.2, height: 0.2, depth: 1.2, bevel: 0.03 }), palette.stone, [0, 0.1, 0]));
  // Cylindrical Chamber
  g.add(part(new THREE.CylinderGeometry(0.55, 0.58, 0.8, 24), steelMat, [0, 0.6, 0]));
  // Top Collar Flange
  g.add(part(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 24), trimMat, [0, 1.04, 0]));

  // Rotor Hub & Rotor Arms
  const rotor = new THREE.Group();
  rotor.position.set(0, 0.8, 0);
  rotor.add(part(new THREE.CylinderGeometry(0.18, 0.18, 0.15, 20), trimMat, [0, 0, 0]));

  // 4 Balanced Sample Buckets
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const bucket = new THREE.Group();
    bucket.position.set(Math.cos(angle) * 0.38, 0, Math.sin(angle) * 0.38);
    bucket.add(part(new THREE.CylinderGeometry(0.06, 0.04, 0.22, 14), accentGlow, [0, -0.05, 0]));
    rotor.add(bucket);
  }
  g.add(rotor);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      rotor.rotation.y += dt * 8.0; // High speed rotor spin
    },
  };
}

/**
 * Industrial Blacksmith Anvil Assembly
 */
function buildAnvilAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const ironMat = palette.iron || materialFor('#1e293b', { roughness: 0.5, metalness: 0.75 });
  const woodBaseMat = palette.wood || materialFor('#451a03', { roughness: 0.8, metalness: 0.0 });
  const polishedFaceMat = materialFor('#cbd5e1', { roughness: 0.15, metalness: 0.95 });

  // Heavy Oak Tree-Stump Pedestal
  g.add(part(new THREE.CylinderGeometry(0.55, 0.62, 0.65, 18), woodBaseMat, [0, 0.325, 0]));
  // Forged Anvil Base Footing
  g.add(part(bevelledBox({ width: 0.85, height: 0.15, depth: 0.55, bevel: 0.03 }), ironMat, [0, 0.725, 0]));
  // Narrow Waist
  g.add(part(bevelledBox({ width: 0.45, height: 0.28, depth: 0.35, bevel: 0.03 }), ironMat, [0, 0.94, 0]));
  // Main Body Block
  g.add(part(bevelledBox({ width: 0.95, height: 0.3, depth: 0.42, bevel: 0.02 }), ironMat, [0, 1.23, 0]));
  // Polished Working Face
  g.add(part(bevelledBox({ width: 0.85, height: 0.03, depth: 0.38, bevel: 0.005 }), polishedFaceMat, [0, 1.395, 0]));
  // Conical Round Horn
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 16), ironMat);
  horn.rotation.z = Math.PI / 2;
  horn.position.set(0.68, 1.25, 0);
  g.add(horn);

  return { group: g };
}

/**
 * Aerospace Hovercraft Assembly
 */
function buildHovercraftAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const skirtMat = materialFor('#18181b', { roughness: 0.9, metalness: 0.05 }); // Rubber skirt
  const hullMat = palette.primary || materialFor('#0284c7', { roughness: 0.35, metalness: 0.7 });
  const ductMat = palette.iron || materialFor('#475569', { roughness: 0.4, metalness: 0.85 });
  const glowMat = palette.glowCyan;

  // Inflatable Rubber Skirt Perimeter
  g.add(part(bevelledBox({ width: 1.6, height: 0.35, depth: 2.2, bevel: 0.1 }), skirtMat, [0, 0.2, 0]));
  // Lightweight Fiber Deck Hull
  g.add(part(bevelledBox({ width: 1.4, height: 0.3, depth: 1.9, bevel: 0.04 }), hullMat, [0, 0.5, 0]));
  // Cockpit Windshield Canopy
  const canopy = part(bevelledBox({ width: 0.8, height: 0.4, depth: 0.65, bevel: 0.03 }), palette.glass, [0, 0.8, 0.4]);
  canopy.rotation.x = -0.2;
  g.add(canopy);

  // Twin Propulsion Thrust Ducts (Rear)
  for (const side of [-0.42, 0.42]) {
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 20), ductMat);
    duct.rotation.x = Math.PI / 2;
    duct.position.set(side, 0.85, -0.85);
    g.add(duct);

    // Blue thrust plume inside duct
    const thruster = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.35, 14), glowMat);
    thruster.rotation.x = -Math.PI / 2;
    thruster.position.set(side, 0.85, -1.05);
    g.add(thruster);
  }

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Gentle air-cushion hover heave & pitch
      g.position.y = 0.025 * Math.sin(time * 3.5);
      g.rotation.z = 0.015 * Math.sin(time * 2.2);
    },
  };
}

/**
 * Orbital Satellite Assembly with Solar Arrays
 */
export function buildSatelliteAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const goldFoilMat = palette.gold || materialFor('#f59e0b', { roughness: 0.2, metalness: 0.95 });
  const solarPanelMat = materialFor('#1e1b4b', { roughness: 0.15, metalness: 0.9 });
  const frameMat = palette.iron || materialFor('#94a3b8', { roughness: 0.3, metalness: 0.8 });
  const dishMat = materialFor('#f8fafc', { roughness: 0.4, metalness: 0.1 });

  // Central Octagonal Equipment Bus
  g.add(part(bevelledBox({ width: 0.8, height: 0.9, depth: 0.8, bevel: 0.04 }), goldFoilMat, [0, 1.1, 0]));

  // High-Gain Parabolic Dish Antenna (Top)
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), dishMat);
  dish.rotation.x = -0.4;
  dish.position.set(0, 1.8, 0);
  g.add(dish);

  // Deployable Solar Array Wings (Port & Starboard)
  for (const side of [-1, 1]) {
    // Array support boom
    g.add(part(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), frameMat, [side * 0.6, 1.1, 0], [0, 0, Math.PI / 2]));
    // 3 Linked Solar Panels
    for (let p = 0; p < 3; p++) {
      const px = side * (0.95 + p * 0.48);
      g.add(part(bevelledBox({ width: 0.45, height: 0.85, depth: 0.02, bevel: 0.005 }), solarPanelMat, [px, 1.1, 0]));
      g.add(part(bevelledBox({ width: 0.46, height: 0.86, depth: 0.025, bevel: 0.005 }), frameMat, [px, 1.1, 0]));
    }
  }

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Gentle orbital roll
      g.rotation.y += dt * 0.2;
    },
  };
}

/**
 * Quantum Core / Plasma Reactor Battery Assembly
 */
export function buildQuantumCoreAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const chassisMat = palette.iron || materialFor('#0f172a', { roughness: 0.4, metalness: 0.85 });
  const copperCoilMat = palette.gold || materialFor('#b45309', { roughness: 0.25, metalness: 0.9 });
  const plasmaMat = palette.glowCyan;
  const glassMat = palette.glass;

  // Base Housing
  g.add(part(bevelledBox({ width: 1.1, height: 0.25, depth: 1.1, bevel: 0.03 }), chassisMat, [0, 0.125, 0]));
  // Top Cap Housing
  g.add(part(bevelledBox({ width: 1.1, height: 0.25, depth: 1.1, bevel: 0.03 }), chassisMat, [0, 1.875, 0]));

  // 4 Corner Structural Uprights
  for (const x of [-0.45, 0.45]) {
    for (const z of [-0.45, 0.45]) {
      g.add(part(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 12), chassisMat, [x, 1.0, z]));
    }
  }

  // Cylindrical Magnetic Containment Coil Rings
  for (const y of [0.55, 1.0, 1.45]) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 12, 24), copperCoilMat);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(0, y, 0);
    g.add(coil);
  }

  // Glass Containment Vessel
  g.add(part(new THREE.CylinderGeometry(0.36, 0.36, 1.45, 24), glassMat, [0, 1.0, 0]));

  // Glowing Plasma Core
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), plasmaMat);
  core.position.set(0, 1.0, 0);
  g.add(core);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Pulsing plasma core breathing
      const scale = 1.0 + 0.15 * Math.sin(time * 5.0);
      core.scale.set(scale, scale, scale);
    },
  };
}
