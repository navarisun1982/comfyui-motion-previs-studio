import * as THREE from 'three';
import {
  TAU,
  ProceduralPalette,
  addBox,
  addEll,
  addRod,
  addCurve,
  addRing,
  addPart,
  createMaterial,
} from './craftForms';
import {
  bevelledBox,
  part,
  materialFor,
  seeded,
  socket,
  collider,
  twoBoneIk,
  footCycle,
  routeStep,
  RouteStepState,
} from './kitCore';

export interface ProceduralKitResult {
  group: THREE.Group;
  update?: (dt: number) => void;
  sockets?: any[];
  colliders?: any[];
  animate?: (dt: number, override?: number | null) => boolean;
  setRoute?: (points: [number, number][] | [number, number, number][], loop?: boolean) => any;
  state?: any;
}

// ==========================================
// 1. ARCHITECTURE: The Timber Cottage
// ==========================================
export function createTimberCottage(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const w = 1.9, d = 1.6, h = 1.5;

  // Stone Foundation
  addBox(g, palette.stone, [0, 0.08, 0], [w + 0.25, 0.16, d + 0.28], 0.03);

  // Plaster Wall Block
  addBox(g, palette.cream, [0, h / 2 + 0.12, 0], [w, h, d], 0.02);

  // Timber Frame Posts (Verticals & Beams)
  for (const side of [-1, 1]) {
    const face = (side * d) / 2;
    for (let i = 0; i < 5; i++) {
      const x = -w / 2 + (i * w) / 4;
      addBox(g, palette.wood, [x, h / 2 + 0.1, face], [0.085, h + 0.08, 0.09], 0.015);
      if (i < 4) {
        addRod(g, palette.wood, [x, 0.2, face + 0.04], [x + w / 4, h * 0.55, face + 0.04], 0.022);
      }
    }
    for (const y of [0.2, h * 0.57, h + 0.06]) {
      addBox(g, palette.wood, [0, y, face], [w + 0.09, 0.075, 0.09], 0.015);
    }
  }

  // Pitched Roof with Tiles
  const rise = 0.85;
  const slopeAngle = Math.atan2(rise, w / 2);
  const slopeLen = Math.hypot(w / 2, rise);

  for (const side of [-1, 1]) {
    const roofSlab = addBox(
      g,
      palette.roof,
      [(side * w) / 4, h + 0.12 + rise / 2, 0],
      [slopeLen + 0.14, 0.08, d + 0.25],
      0.02
    );
    roofSlab.rotation.z = -side * slopeAngle;

    // Overhanging eave beam
    addRod(
      g,
      palette.wood,
      [(side * w) / 2, h + 0.12, -d / 2 - 0.15],
      [(side * w) / 2, h + 0.12, d / 2 + 0.15],
      0.04
    );
  }

  // Ridge Pole
  addRod(g, palette.gold, [0, h + 0.12 + rise + 0.04, -d / 2 - 0.16], [0, h + 0.12 + rise + 0.04, d / 2 + 0.16], 0.035);

  // Gable Walls under Roof
  for (const z of [-d / 2, d / 2]) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
    addPart(g, gableGeo, palette.cream, [0, h + 0.12, z - 0.02]);
    addRod(g, palette.wood, [-w / 2, h + 0.12, z + 0.04], [0, h + 0.12 + rise, z + 0.04], 0.032);
    addRod(g, palette.wood, [w / 2, h + 0.12, z + 0.04], [0, h + 0.12 + rise, z + 0.04], 0.032);
  }

  // Masonry Chimney
  const cx = -w * 0.31;
  const cy = h + 0.78;
  addBox(g, palette.stone, [cx, cy, -d * 0.22], [0.31, 0.95, 0.32], 0.03);
  addBox(g, palette.cream, [cx, cy + 0.5, -d * 0.22], [0.38, 0.1, 0.38], 0.02);

  // Front Entrance Door & Steps
  const frontZ = d / 2 + 0.09;
  addBox(g, palette.stone, [0, 0.06, frontZ + 0.18], [0.8, 0.1, 0.32], 0.02);
  addBox(g, palette.wood, [0, 0.55, frontZ], [0.55, 1.05, 0.045], 0.015);
  addRing(g, palette.gold, [0.15, 0.52, frontZ + 0.04], 0.035, 0.008);

  // Glass Windows with frames
  for (const x of [-w * 0.3, w * 0.3]) {
    addBox(g, palette.wood, [x, h * 0.62, frontZ], [0.38, 0.52, 0.06], 0.015);
    addBox(g, palette.glass, [x, h * 0.62, frontZ + 0.02], [0.3, 0.44, 0.02], 0.005);
  }

  // Smoke particles or soft glow
  const smokePuff = addEll(g, createMaterial(0xf8fafc, 0.9, 0), [cx, cy + 0.65, -d * 0.22], [0.08, 0.08, 0.08]);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      smokePuff.scale.setScalar(0.08 + 0.015 * Math.sin(time * 3));
      smokePuff.position.y = cy + 0.65 + 0.04 * Math.sin(time * 2);
    },
  };
}

// ==========================================
// 2. ARCHITECTURE: The Round Tower
// ==========================================
export function createRoundTower(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  // Foundation Plinth
  addPart(g, new THREE.CylinderGeometry(0.75, 0.85, 0.16, 32), palette.stone, [0, 0.08, 0]);

  // Main Stone Shaft
  addPart(g, new THREE.CylinderGeometry(0.58, 0.65, 2.1, 32), palette.stone, [0, 1.15, 0]);

  // Staggered Stone Courses Rings
  for (const y of [0.2, 1.15, 2.1]) {
    const rim = addRing(g, palette.cream, [0, y, 0], y > 2.0 ? 0.62 : 0.66, 0.035);
    rim.rotation.x = Math.PI / 2;
  }

  // Heavy Wood Door
  addBox(g, palette.wood, [0, 0.55, 0.64], [0.45, 0.95, 0.06], 0.02);

  // Upper Timber Gallery & Balustrade
  addPart(g, new THREE.CylinderGeometry(0.78, 0.65, 0.12, 32), palette.wood, [0, 2.22, 0]);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    addRod(
      g,
      palette.gold,
      [0.74 * Math.sin(a), 2.22, 0.74 * Math.cos(a)],
      [0.74 * Math.sin(a), 2.48, 0.74 * Math.cos(a)],
      0.012
    );
  }
  const balustrade = addRing(g, palette.gold, [0, 2.48, 0], 0.74, 0.015);
  balustrade.rotation.x = Math.PI / 2;

  // Stepped Conical Copper Roof
  for (let row = 0; row < 8; row++) {
    const y = 2.38 + row * 0.09;
    const r = 0.74 * (1 - row / 9.5);
    addPart(g, new THREE.CylinderGeometry(r * 0.9, r, 0.11, 24), palette.roof, [0, y, 0]);
  }

  // Finial Needle & Golden Sphere
  addEll(g, palette.gold, [0, 3.16, 0], [0.06, 0.09, 0.06]);
  addRod(g, palette.gold, [0, 3.18, 0], [0, 3.48, 0], 0.012);

  return { group: g };
}

// ==========================================
// 3. ARCHITECTURE: The Watermill
// ==========================================
export function createWatermill(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const cottage = createTimberCottage(palette);
  g.add(cottage.group);

  // Rotating Water Wheel Assembly
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(1.15, 0.72, 0);
  wheelGroup.rotation.y = Math.PI / 2;
  g.add(wheelGroup);

  // Central Iron Axle & Brass Hub
  addRod(wheelGroup, palette.iron, [0, -0.28, 0], [0, 0.28, 0], 0.06);
  for (const side of [-1, 1]) {
    addPart(wheelGroup, new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), palette.gold, [0, side * 0.18, 0]);
    const rim = addRing(wheelGroup, palette.wood, [0, side * 0.15, 0], 0.62, 0.045);
    rim.rotation.x = Math.PI / 2;
  }

  // 12 Paddles and Spokes
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const x = 0.62 * Math.sin(a);
    const z = 0.62 * Math.cos(a);

    // Paddle Blade
    const paddle = addBox(wheelGroup, palette.wood, [x, 0, z], [0.22, 0.35, 0.04], 0.01);
    paddle.rotation.y = a;

    // Structural spoke
    addRod(wheelGroup, palette.wood, [0, 0, 0], [0.58 * Math.sin(a), 0, 0.58 * Math.cos(a)], 0.022);
  }

  let angle = 0;
  return {
    group: g,
    update: (dt) => {
      cottage.update?.(dt);
      angle += dt * 0.75;
      wheelGroup.rotation.y = Math.PI / 2 + angle;
    },
  };
}

// ==========================================
// 4. ARCHITECTURE: The Market Stall
// ==========================================
export function createMarketStall(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  // Main Counter / Table
  addBox(g, palette.wood, [0, 0.45, 0], [1.7, 0.7, 0.8], 0.02);
  addBox(g, palette.wood, [0, 0.84, 0.05], [1.9, 0.09, 1.0], 0.02);

  // 4 Upright Timber Posts
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.43, 0.43]) {
      addRod(g, palette.wood, [x, 0.03, z], [x, 1.75, z], 0.035);
    }
  }

  // Scalloped Striped Awning
  for (let i = 0; i < 12; i++) {
    const stripMat = i % 2 === 0 ? palette.cream : palette.roof;
    const shape = new THREE.Shape();
    shape.moveTo(-0.08, 0);
    shape.lineTo(0.08, 0);
    shape.lineTo(0.08, -1.1);
    shape.quadraticCurveTo(0, -1.2, -0.08, -1.1);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const stripMesh = addPart(g, geo, stripMat, [-0.91 + i * 0.166, 1.8, -0.6]);
    stripMesh.rotation.x = 0.07;
  }

  // Produce Crates and Fruit
  const fruitMatRed = createMaterial('#b91c1c', 0.5, 0);
  const fruitMatOrange = createMaterial('#ea580c', 0.5, 0);
  const fruitMatGreen = createMaterial('#15803d', 0.6, 0);
  const fruits = [fruitMatRed, fruitMatOrange, fruitMatGreen];

  for (let crate = 0; crate < 3; crate++) {
    const x = -0.58 + crate * 0.58;
    addBox(g, palette.wood, [x, 0.93, 0.03], [0.5, 0.035, 0.55], 0.01);
    for (let i = 0; i < 6; i++) {
      const p: [number, number, number] = [
        x - 0.14 + (i % 3) * 0.14,
        1.01,
        -0.12 + Math.floor(i / 3) * 0.18,
      ];
      addEll(g, fruits[crate], p, [0.065, 0.065, 0.065]);
    }
  }

  return { group: g };
}

// ==========================================
// 5. ARCHITECTURE: The Stone Bridge
// ==========================================
export function createStoneBridge(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const len = 3.6;
  const w = 1.4;

  // Deck Arch
  for (let i = 0; i < 18; i++) {
    const u = i / 17;
    const x = -len / 2 + u * len;
    const y = 0.2 + 0.35 * Math.sin(u * Math.PI);
    addBox(g, palette.stone, [x, y, 0], [len / 17 + 0.02, 0.18, w], 0.03);
  }

  // Side Balustrades & Piers
  for (const side of [-1, 1]) {
    const z = (side * w) / 2;
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      const x = -len / 2 + u * len;
      const y = 0.38 + 0.35 * Math.sin(u * Math.PI);
      addBox(g, palette.stone, [x, y, z], [0.18, 0.45, 0.16], 0.02);
    }
    // Handrail
    const points: [number, number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12;
      points.push([-len / 2 + u * len, 0.58 + 0.35 * Math.sin(u * Math.PI), z]);
    }
    addCurve(g, palette.stone, points, 0.045);
  }

  return { group: g };
}

// ==========================================
// 6. CREATURE: The Moonwood Stag (Organic Hero)
// ==========================================
export function createMoonStag(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const ivory = createMaterial('#dedec4', 0.65, 0.05);
  const mane = createMaterial('#64748b', 0.8, 0.0);
  const dark = createMaterial('#1e293b', 0.4, 0.2);
  const horn = createMaterial('#d97706', 0.45, 0.2);
  const eyeSpark = createMaterial('#38bdf8', 0.1, 0.8);

  // Torso
  const torso = addEll(g, ivory, [0, 0.95, 0], [0.32, 0.38, 0.65]);

  // Neck & Head
  const neck = new THREE.Group();
  neck.position.set(0, 1.1, 0.45);
  g.add(neck);
  addEll(neck, ivory, [0, 0.24, 0.02], [0.18, 0.38, 0.2]);

  const head = new THREE.Group();
  head.position.set(0, 0.52, 0.1);
  neck.add(head);
  addEll(head, ivory, [0, 0, 0.05], [0.18, 0.21, 0.28]);
  addEll(head, dark, [0, -0.05, 0.38], [0.09, 0.06, 0.07]); // Muzzle

  // Eyes
  for (const side of [-1, 1]) {
    addEll(head, dark, [side * 0.15, 0.04, 0.14], [0.03, 0.04, 0.035]);
    addEll(head, eyeSpark, [side * 0.16, 0.05, 0.16], [0.012, 0.015, 0.015]);

    // Ears
    const ear = addEll(head, ivory, [side * 0.24, 0.16, -0.05], [0.08, 0.21, 0.05]);
    ear.rotation.z = -side * 0.7;

    // Branching Antlers
    const spine: [number, number, number][] = [
      [side * 0.1, 0.16, -0.05],
      [side * 0.18, 0.42, -0.14],
      [side * 0.32, 0.65, -0.19],
      [side * 0.42, 0.85, -0.13],
      [side * 0.46, 0.98, -0.04],
    ];
    addCurve(head, horn, spine, 0.028);

    // Antler Tines
    for (const [a, b, c] of [
      [
        [0.18, 0.41, -0.13],
        [0.25, 0.58, 0.06],
        [0.32, 0.7, 0.08],
      ],
      [
        [0.32, 0.62, -0.18],
        [0.48, 0.69, -0.23],
        [0.62, 0.82, -0.17],
      ],
    ]) {
      addCurve(
        head,
        horn,
        [a, b, c].map((p) => [side * p[0], p[1], p[2]]),
        0.016
      );
    }
  }

  // 4 Articulated Legs
  for (const side of [-1, 1]) {
    for (const z of [-0.38, 0.36]) {
      const hip: [number, number, number] = [side * 0.2, 0.88, z];
      const knee: [number, number, number] = [side * 0.21, 0.45, z + (z < 0 ? 0.1 : -0.03)];
      const ankle: [number, number, number] = [side * 0.22, 0.12, z + (z < 0 ? -0.02 : 0.04)];
      addEll(g, ivory, hip, [0.1, 0.24, 0.14]);
      addRod(g, ivory, hip, knee, 0.06, 0.045);
      addRod(g, ivory, knee, ankle, 0.04, 0.03);
      addEll(g, dark, [ankle[0], 0.04, ankle[2] + 0.03], [0.035, 0.06, 0.07]); // Split Hoof
    }
  }

  // Ceremonial Brass Collar
  const collar = addRing(neck, palette.gold, [0, 0.16, 0.01], 0.18, 0.015);
  collar.rotation.x = Math.PI / 2;

  // Tail
  const tail = new THREE.Group();
  tail.position.set(0, 1.1, -0.5);
  g.add(tail);
  addCurve(
    tail,
    mane,
    [
      [0, 0, 0],
      [0, 0.05, -0.16],
      [0, -0.04, -0.28],
    ],
    0.06
  );

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Organic micro-breathing & alert gaze
      head.rotation.y = Math.sin(time * 0.6) * 0.12;
      neck.rotation.x = Math.sin(time * 0.85) * 0.03;
      torso.scale.y = 0.38 * (1 + 0.015 * Math.sin(time * 1.8));
      tail.rotation.y = Math.sin(time * 1.2) * 0.15;
    },
  };
}

// ==========================================
// 7. ACTOR: Biped Director Mannequin / Walker
// ==========================================
export function createBipedWalker(palette: ProceduralPalette, isFemale = false): ProceduralKitResult {
  const g = new THREE.Group();
  const cloth = createMaterial(isFemale ? '#0284c7' : '#334155', 0.75, 0.1);
  const trousers = createMaterial('#1e293b', 0.85, 0.05);
  const skin = createMaterial('#e2b189', 0.6, 0.0);
  const leather = createMaterial('#451a03', 0.5, 0.1);
  const hair = createMaterial(isFemale ? '#7c2d12' : '#18181b', 0.9, 0.05);
  const white = createMaterial('#ffffff', 0.8, 0.0);
  const dark = createMaterial('#0f172a', 0.8, 0.1);

  const hipsY = 0.95;
  const hips = new THREE.Group();
  hips.position.y = hipsY;
  g.add(hips);

  // Pelvis / Hips
  addBox(hips, trousers, [0, 0, 0], [0.34, 0.18, 0.22], 0.03);

  // Torso
  const torso = new THREE.Group();
  torso.position.y = 0.12;
  hips.add(torso);

  if (isFemale) {
    addPart(torso, new THREE.CylinderGeometry(0.14, 0.11, 0.38, 16), cloth, [0, 0.2, 0]);
  } else {
    addBox(torso, cloth, [0, 0.22, 0], [0.38, 0.44, 0.24], 0.04);
  }

  // Shirt Collar & Neckline Detail
  addBox(torso, white, [0, 0.4, 0.12], [0.12, 0.08, 0.04], 0.01);
  addBox(torso, isFemale ? palette.gold : dark, [0, 0.3, 0.125], [0.04, 0.18, 0.02], 0.005);

  // Belt
  addBox(torso, leather, [0, 0.01, 0], [0.36, 0.06, 0.24], 0.01);
  addBox(torso, palette.gold, [0, 0.01, 0.125], [0.07, 0.07, 0.02], 0.005);

  // Neck & Head
  const neck = new THREE.Group();
  neck.position.y = 0.46;
  torso.add(neck);
  addPart(neck, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12), skin, [0, 0.04, 0]);

  const head = new THREE.Group();
  head.position.y = 0.14;
  neck.add(head);
  addEll(head, skin, [0, 0.08, 0], [0.12, 0.14, 0.13]);
  addEll(head, skin, [0, 0.07, 0.13], [0.02, 0.03, 0.03]); // Nose

  // Eyes & Eyebrows
  for (const side of [-1, 1]) {
    addEll(head, white, [side * 0.05, 0.09, 0.12], [0.02, 0.015, 0.01]);
    addEll(head, dark, [side * 0.05, 0.09, 0.125], [0.01, 0.01, 0.008]);
    addBox(head, hair, [side * 0.05, 0.12, 0.12], [0.035, 0.008, 0.01], 0.002);
  }

  // Hair Style
  if (isFemale) {
    addEll(head, hair, [0, 0.15, -0.02], [0.135, 0.12, 0.14]);
    for (const side of [-1, 1]) {
      addEll(head, hair, [side * 0.1, 0.02, -0.02], [0.05, 0.14, 0.06]);
    }
  } else {
    addEll(head, hair, [0, 0.18, 0.01], [0.13, 0.08, 0.14]);
    addBox(head, hair, [0, 0.22, 0.04], [0.14, 0.04, 0.12], 0.01);
  }

  // Arms & Hands
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.position.set(0.24, 0.4, 0);
  rightArm.position.set(-0.24, 0.4, 0);
  torso.add(leftArm);
  torso.add(rightArm);

  addRod(leftArm, cloth, [0, 0, 0], [0, -0.28, 0], 0.05);
  addRod(leftArm, skin, [0, -0.28, 0], [0, -0.52, 0], 0.04);
  addEll(leftArm, skin, [0, -0.56, 0.01], [0.035, 0.05, 0.025]); // Left Hand

  addRod(rightArm, cloth, [0, 0, 0], [0, -0.28, 0], 0.05);
  addRod(rightArm, skin, [0, -0.28, 0], [0, -0.52, 0], 0.04);
  addEll(rightArm, skin, [0, -0.56, 0.01], [0.035, 0.05, 0.025]); // Right Hand

  // Legs & Shoes
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.position.set(0.12, 0, 0);
  rightLeg.position.set(-0.12, 0, 0);
  hips.add(leftLeg);
  hips.add(rightLeg);

  addRod(leftLeg, trousers, [0, 0, 0], [0, -0.46, 0], 0.065);
  addRod(leftLeg, trousers, [0, -0.46, 0], [0, -0.88, 0], 0.05);
  addBox(leftLeg, leather, [0, -0.92, 0.05], [0.12, 0.09, 0.26], 0.02);

  addRod(rightLeg, trousers, [0, 0, 0], [0, -0.46, 0], 0.065);
  addRod(rightLeg, trousers, [0, -0.46, 0], [0, -0.88, 0], 0.05);
  addBox(rightLeg, leather, [0, -0.92, 0.05], [0.12, 0.09, 0.26], 0.02);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Gentle cinematic idle weight shift
      hips.position.y = hipsY + 0.015 * Math.sin(time * 2);
      torso.rotation.y = 0.04 * Math.sin(time * 1.5);
      leftArm.rotation.x = 0.08 * Math.sin(time * 1.8);
      rightArm.rotation.x = -0.08 * Math.sin(time * 1.8);
    },
  };
}

// ==========================================
// 8. NATURE: Round Foliage Tree & Pine Tree
// ==========================================
export function createTreeRound(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  // Fluted Trunk
  addRod(g, palette.wood, [0, 0, 0], [0, 1.4, 0], 0.16, 0.22);
  addRod(g, palette.wood, [0, 1.4, 0], [0.3, 2.2, 0.2], 0.1, 0.15);
  addRod(g, palette.wood, [0, 1.4, 0], [-0.25, 2.1, -0.15], 0.09, 0.14);

  // Exposed Roots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.3;
    addCurve(
      g,
      palette.wood,
      [
        [0, 0.2, 0],
        [0.35 * Math.sin(a), 0.08, 0.35 * Math.cos(a)],
        [0.6 * Math.sin(a), 0.02, 0.6 * Math.cos(a)],
      ],
      0.06
    );
  }

  // Organic Canopy Clusters
  const leafClusters: [number, number, number, number][] = [
    [0, 2.7, 0, 0.95],
    [0.4, 2.4, 0.3, 0.75],
    [-0.35, 2.3, -0.25, 0.7],
    [0.15, 3.1, -0.15, 0.68],
  ];

  for (const [x, y, z, s] of leafClusters) {
    addEll(g, palette.leaf, [x, y, z], [s, s * 0.9, s]);
  }

  return { group: g };
}

export function createPineTree(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  // Straight Trunk
  addRod(g, palette.wood, [0, 0, 0], [0, 2.6, 0], 0.12, 0.18);

  // Conical Foliage Tiers
  const tiers = [
    { y: 1.1, r: 0.95, h: 0.9 },
    { y: 1.7, r: 0.78, h: 0.8 },
    { y: 2.2, r: 0.58, h: 0.75 },
    { y: 2.65, r: 0.38, h: 0.65 },
  ];

  for (const t of tiers) {
    addPart(g, new THREE.ConeGeometry(t.r, t.h, 16), palette.leaf, [0, t.y, 0]);
  }

  return { group: g };
}

// ==========================================
// 9. PROPS: Lantern Post, Barrel, Crate, Well
// ==========================================
export function createLanternPost(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  // Iron Post
  addPart(g, new THREE.CylinderGeometry(0.18, 0.24, 0.2, 16), palette.iron, [0, 0.1, 0]);
  addRod(g, palette.iron, [0, 0.2, 0], [0, 2.8, 0], 0.045, 0.065);

  // Curved Lantern Bracket
  addCurve(
    g,
    palette.iron,
    [
      [0, 2.4, 0],
      [0.35, 2.7, 0],
      [0.55, 2.65, 0],
    ],
    0.02
  );

  // Lantern Housing
  const lanternY = 2.45;
  const lanternX = 0.55;
  addRod(g, palette.gold, [lanternX, 2.65, 0], [lanternX, lanternY + 0.2, 0], 0.008);
  addPart(g, new THREE.ConeGeometry(0.18, 0.14, 6), palette.iron, [lanternX, lanternY + 0.2, 0]);

  // Warm Emissive Glass Lantern Core
  const glassMesh = addPart(g, new THREE.CylinderGeometry(0.12, 0.09, 0.24, 6), palette.glowOrange, [lanternX, lanternY, 0]);
  addPart(g, new THREE.CylinderGeometry(0.13, 0.11, 0.04, 6), palette.iron, [lanternX, lanternY - 0.13, 0]);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Gentle lantern flame flicker
      glassMesh.scale.setScalar(1 + 0.04 * Math.sin(time * 8) * Math.cos(time * 13));
    },
  };
}

export function createBarrel(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Bulging wood stave body
  addPart(g, new THREE.CylinderGeometry(0.36, 0.36, 0.95, 16), palette.wood, [0, 0.48, 0]);
  addEll(g, palette.wood, [0, 0.48, 0], [0.42, 0.45, 0.42]);

  // Iron Hoops
  for (const y of [0.12, 0.32, 0.64, 0.84]) {
    const hoop = addRing(g, palette.iron, [0, y, 0], y === 0.32 || y === 0.64 ? 0.41 : 0.37, 0.016);
    hoop.rotation.x = Math.PI / 2;
  }
  return { group: g };
}

export function createCrate(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  addBox(g, palette.wood, [0, 0.45, 0], [0.9, 0.9, 0.9], 0.03);
  // Diagonal cross bracing
  addBox(g, palette.iron, [0, 0.45, 0.46], [0.85, 0.06, 0.02], 0.005);
  addBox(g, palette.iron, [0, 0.45, -0.46], [0.85, 0.06, 0.02], 0.005);
  return { group: g };
}

export function createStoneWell(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  // Stone Cylinder Basin
  addPart(g, new THREE.CylinderGeometry(0.72, 0.76, 0.75, 24), palette.stone, [0, 0.38, 0]);

  // Interior Water Plane
  const waterMat = createMaterial('#0284c7', 0.2, 0.1);
  const water = addPart(g, new THREE.CircleGeometry(0.62, 24), waterMat, [0, 0.42, 0]);
  water.rotation.x = -Math.PI / 2;

  // Timber Canopy Posts & Roof
  for (const x of [-0.65, 0.65]) {
    addRod(g, palette.wood, [x, 0.3, 0], [x, 1.85, 0], 0.045);
  }
  addRod(g, palette.wood, [-0.65, 1.85, 0], [0.65, 1.85, 0], 0.05);

  // Crank & Winch Axle
  addRod(g, palette.wood, [-0.55, 1.4, 0], [0.55, 1.4, 0], 0.035);
  addPart(g, new THREE.CylinderGeometry(0.08, 0.08, 0.32, 16), palette.cream, [0, 1.4, 0]); // Coiled rope

  // Small Pitched Roof
  for (const side of [-1, 1]) {
    const roofPanel = addBox(g, palette.roof, [0, 1.98, side * 0.3], [1.5, 0.04, 0.7], 0.015);
    roofPanel.rotation.x = -side * 0.55;
  }

  return { group: g };
}

// ==========================================
// 10. VEHICLE: Sci-Fi Fighter & Drone
// ==========================================
export function createSciFiFighter(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const hullMat = palette.primary || createMaterial('#0f172a', 0.35, 0.6);
  const armorMat = createMaterial('#334155', 0.4, 0.5);

  // Fuselage (Streamlined elongated hull)
  const fuselage = addPart(g, new THREE.ConeGeometry(0.65, 4.2, 16), hullMat, [0, 0.6, 0.4]);
  fuselage.rotation.x = Math.PI / 2;

  // Cockpit Tinted Canopy
  addEll(g, palette.glowCyan, [0, 0.85, 0.2], [0.24, 0.2, 0.85]);

  // Delta Wings
  for (const side of [-1, 1]) {
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(side * 2.2, -1.2);
    wingShape.lineTo(side * 2.1, -1.9);
    wingShape.lineTo(0, -1.4);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 });
    wingGeo.rotateX(Math.PI / 2);
    addPart(g, wingGeo, armorMat, [side * 0.3, 0.58, 0.6]);

    // Wingtip Plasma Cannons
    addRod(g, palette.iron, [side * 2.1, 0.58, -0.6], [side * 2.1, 0.58, 0.4], 0.035);
  }

  // Twin Plasma Thrusters (with glowing blue exhaust)
  const thrusters: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    addPart(g, new THREE.CylinderGeometry(0.22, 0.25, 0.6, 16), palette.iron, [side * 0.45, 0.6, -1.3]);
    const plume = addPart(g, new THREE.ConeGeometry(0.18, 0.8, 16), palette.glowCyan, [side * 0.45, 0.6, -1.8]);
    plume.rotation.x = -Math.PI / 2;
    thrusters.push(plume);
  }

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Pulsing thruster trails
      for (const t of thrusters) {
        t.scale.z = 1 + 0.15 * Math.sin(time * 18);
      }
    },
  };
}

export function createSciFiDrone(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const hullMat = palette.primary || createMaterial('#0284c7', 0.4, 0.4);

  // Central Saucer Chassis
  addEll(g, hullMat, [0, 0.6, 0], [0.65, 0.22, 0.65]);
  addPart(g, new THREE.TorusGeometry(0.72, 0.04, 8, 32), palette.iron, [0, 0.6, 0]).rotation.x = Math.PI / 2;

  // Sensor Eye / Glowing Core
  addEll(g, palette.glowCyan, [0, 0.6, 0.52], [0.15, 0.12, 0.15]);

  // 4 Outrigger Thruster Pods
  const pods: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const px = 0.9 * Math.sin(a);
    const pz = 0.9 * Math.cos(a);

    addRod(g, palette.iron, [0, 0.6, 0], [px, 0.6, pz], 0.03);
    const podGroup = new THREE.Group();
    podGroup.position.set(px, 0.6, pz);
    g.add(podGroup);

    addPart(podGroup, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), palette.iron);
    const rotor = addBox(podGroup, palette.glowCyan, [0, 0.05, 0], [0.38, 0.015, 0.06], 0.005);
    podGroup.userData.rotor = rotor;
    pods.push(podGroup);
  }

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Hover bobbing
      g.position.y = 0.05 * Math.sin(time * 3);
      for (const p of pods) {
        if (p.userData.rotor) {
          p.userData.rotor.rotation.y += dt * 25;
        }
      }
    },
  };
}

// ==========================================
// 11. GEAR: Cinema Camera Dolly Rig
// ==========================================
export function createCameraRigDolly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const metalMat = createMaterial('#1e293b', 0.35, 0.7);

  // Ground Dolly Rails
  for (const z of [-0.4, 0.4]) {
    addRod(g, metalMat, [-1.8, 0.05, z], [1.8, 0.05, z], 0.035);
  }
  for (let i = -3; i <= 3; i++) {
    addBox(g, palette.wood, [i * 0.5, 0.03, 0], [0.1, 0.05, 1.1], 0.01);
  }

  // Dolly Cart Base & Wheels
  addBox(g, metalMat, [0, 0.16, 0], [0.95, 0.08, 0.7], 0.02);
  for (const x of [-0.35, 0.35]) {
    for (const z of [-0.4, 0.4]) {
      const wheel = addPart(g, new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), palette.iron, [x, 0.08, z]);
      wheel.rotation.x = Math.PI / 2;
    }
  }

  // Fluid Head Pedestal
  addPart(g, new THREE.CylinderGeometry(0.08, 0.1, 0.75, 16), metalMat, [0, 0.56, 0]);

  // Cinema Camera Body
  addBox(g, palette.iron, [0, 1.05, 0], [0.38, 0.28, 0.48], 0.02);

  // Cine Lens & Matte Box
  addPart(g, new THREE.CylinderGeometry(0.08, 0.08, 0.25, 16), palette.gold, [0, 1.05, 0.32]).rotation.x = Math.PI / 2;
  addBox(g, palette.iron, [0, 1.05, 0.5], [0.3, 0.24, 0.08], 0.01);

  // Monitor Display & Viewfinder
  addBox(g, palette.glowCyan, [0.22, 1.15, 0.05], [0.03, 0.16, 0.22], 0.005);

  return { group: g };
}

// ==========================================
// 12. CUSTOM HERO: Directing Studio Showcase Plinth
// ==========================================
export function createDirectingStudioPlinth(_name: string, palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  // Multi-tiered Bevelled Octagonal Pedestal
  addPart(g, new THREE.CylinderGeometry(1.2, 1.4, 0.25, 8), palette.stone, [0, 0.125, 0]);
  addPart(g, new THREE.CylinderGeometry(1.0, 1.15, 0.2, 8), palette.iron, [0, 0.32, 0]);

  // Glowing Neon Cyan Rim Ring
  const rim = addRing(g, palette.glowCyan, [0, 0.43, 0], 1.01, 0.02);
  rim.rotation.x = Math.PI / 2;

  // Director's Cylindrical Crystal Viewfinder Marker (No triangles)
  const markerGeo = new THREE.CylinderGeometry(0.45, 0.55, 0.75, 16);
  const markerMat = palette.primary || palette.glowCyan;
  const marker = addPart(g, markerGeo, markerMat, [0, 1.1, 0]);

  // Orbiting Orbital Rings
  const orbitRing = addRing(g, palette.gold, [0, 1.1, 0], 0.95, 0.015);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      marker.rotation.y = time * 0.8;
      marker.position.y = 1.1 + 0.05 * Math.sin(time * 2);
      orbitRing.rotation.z = time * 0.5;
      orbitRing.rotation.x = time * 0.3;
    },
  };
}

// ==========================================
// 13. MARINE: The Zodiac Rigid Inflatable Boat (RIB)
// ==========================================
export function createZodiacBoat(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();

  const tubeRadius = 0.22;
  const hullLength = 3.6;
  const hullWidth = 1.7;
  const halfW = hullWidth / 2 - tubeRadius;

  // Inflatable Rubber Material (Matte Charcoal with subtle sheen)
  const rubberMat = createMaterial('#1c2026', 0.88, 0.08);
  const deepHullMat = palette.iron || createMaterial('#18222d', 0.5, 0.3);
  const deckMat = createMaterial('#334155', 0.75, 0.15);
  const accentMat = palette.primary || palette.roof || createMaterial('#f97316', 0.5, 0.2);

  // A. Deep-V Fiberglass Hull Bottom
  const vHullGeo = new THREE.CylinderGeometry(0.05, halfW * 1.05, hullLength * 0.7, 4);
  const vHull = addPart(g, vHullGeo, deepHullMat, [0, -0.15, -0.1]);
  vHull.rotation.y = Math.PI / 4;
  vHull.rotation.x = Math.PI / 2;

  // B. Flat Deck Floor with non-slip texture
  addBox(g, deckMat, [0, 0.05, -0.1], [hullWidth - tubeRadius * 2.2, 0.12, hullLength * 0.75], 0.03);

  // C. Port & Starboard Straight Inflatable Tubes (Side Pontoons)
  const straightTubeLen = hullLength * 0.58;
  const tubeGeo = new THREE.CylinderGeometry(tubeRadius, tubeRadius, straightTubeLen, 16);

  for (const side of [-1, 1]) {
    const tubeMesh = addPart(g, tubeGeo, rubberMat, [side * halfW, tubeRadius, -0.35]);
    tubeMesh.rotation.x = Math.PI / 2;

    // Stern Conical End Caps (Zodiac signature cone tips at the rear)
    const coneCapGeo = new THREE.ConeGeometry(tubeRadius, 0.45, 16);
    const coneCap = addPart(g, coneCapGeo, rubberMat, [side * halfW, tubeRadius, -0.35 - straightTubeLen / 2 - 0.22]);
    coneCap.rotation.x = -Math.PI / 2;

    // Accent Stripes around the pontoon tubes
    for (const zOffset of [-0.9, -0.3, 0.3]) {
      const stripeRing = addRing(g, accentMat, [side * halfW, tubeRadius, zOffset], tubeRadius * 1.02, 0.025);
      stripeRing.rotation.y = Math.PI / 2;
    }

    // Safety Grab Lifeline along the top of each pontoon
    const ropePoints = [
      new THREE.Vector3(side * halfW, tubeRadius * 2.05, -1.3),
      new THREE.Vector3(side * (halfW + 0.05), tubeRadius * 2.05, -0.8),
      new THREE.Vector3(side * (halfW + 0.05), tubeRadius * 2.05, -0.3),
      new THREE.Vector3(side * (halfW + 0.05), tubeRadius * 2.05, 0.2),
      new THREE.Vector3(side * (halfW * 0.6), tubeRadius * 2.15, 0.9),
    ];
    addCurve(g, palette.gold || createMaterial('#d97706', 0.5, 0.2), ropePoints, 0.015, 8);
  }

  // D. Curved Bow Tube (U-Shape curving in and up at the front)
  const bowCurvePoints = [
    new THREE.Vector3(-halfW, tubeRadius, -0.35 + straightTubeLen / 2),
    new THREE.Vector3(-halfW * 0.9, tubeRadius * 1.15, 0.8),
    new THREE.Vector3(-halfW * 0.5, tubeRadius * 1.35, 1.25),
    new THREE.Vector3(0, tubeRadius * 1.45, 1.45),
    new THREE.Vector3(halfW * 0.5, tubeRadius * 1.35, 1.25),
    new THREE.Vector3(halfW * 0.9, tubeRadius * 1.15, 0.8),
    new THREE.Vector3(halfW, tubeRadius, -0.35 + straightTubeLen / 2),
  ];
  addCurve(g, rubberMat, bowCurvePoints, tubeRadius, 16);

  // Bow Towing Ring / Cleat
  addRing(g, palette.iron, [0, tubeRadius * 1.4, 1.55], 0.08, 0.015).rotation.x = Math.PI / 2;

  // E. Stern Transom Board
  addBox(g, palette.wood || palette.iron, [0, 0.28, -1.35], [hullWidth - tubeRadius * 2, 0.45, 0.08], 0.02);

  // F. Outboard Motor (Engine)
  const motorGroup = new THREE.Group();
  motorGroup.position.set(0, 0.35, -1.45);

  // Cowling (Top engine housing)
  addBox(motorGroup, palette.iron, [0, 0.35, -0.15], [0.32, 0.42, 0.48], 0.04);
  // Engine logo badge
  addBox(motorGroup, palette.glowCyan || accentMat, [0, 0.38, -0.39], [0.18, 0.06, 0.02], 0.01);

  // Midsection shaft & exhaust leg
  addBox(motorGroup, palette.iron, [0, -0.1, -0.12], [0.12, 0.55, 0.22], 0.02);

  // Lower unit torpedo bullet
  const bulletGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.38, 12);
  const bullet = addPart(motorGroup, bulletGeo, palette.iron, [0, -0.4, -0.12]);
  bullet.rotation.x = Math.PI / 2;

  // Skeg fin
  addBox(motorGroup, palette.iron, [0, -0.55, -0.15], [0.03, 0.18, 0.25], 0.01);

  // Propeller Blades (3-blade spinning prop)
  const propHub = new THREE.Group();
  propHub.position.set(0, -0.4, -0.32);
  for (let b = 0; b < 3; b++) {
    const blade = addBox(propHub, palette.gold || palette.iron, [0, 0.08, 0], [0.02, 0.16, 0.06], 0.005);
    blade.rotation.z = (b * Math.PI * 2) / 3;
    blade.rotation.y = 0.25;
  }
  motorGroup.add(propHub);
  g.add(motorGroup);

  // G. Center Steering Console
  const consoleGroup = new THREE.Group();
  consoleGroup.position.set(0, 0.1, 0.1);

  // Console housing body
  addBox(consoleGroup, palette.cream || deckMat, [0, 0.35, 0], [0.55, 0.65, 0.45], 0.03);

  // Console Dashboard top angle
  const dash = addBox(consoleGroup, palette.iron, [0, 0.7, 0], [0.52, 0.15, 0.35], 0.02);
  dash.rotation.x = -0.35;

  // Steering Wheel
  const wheelRim = addRing(consoleGroup, palette.iron, [0, 0.72, -0.05], 0.12, 0.02);
  wheelRim.rotation.x = 0.45;

  // Marine Acrylic Windshield
  const windShield = addBox(consoleGroup, palette.glass, [0, 0.92, 0.1], [0.52, 0.32, 0.03], 0.01);
  windShield.rotation.x = 0.15;

  // Stainless Steel Handrail Arch over Windshield
  const railPoints = [
    new THREE.Vector3(-0.28, 0.65, 0.08),
    new THREE.Vector3(-0.28, 1.12, 0.12),
    new THREE.Vector3(0, 1.15, 0.14),
    new THREE.Vector3(0.28, 1.12, 0.12),
    new THREE.Vector3(0.28, 0.65, 0.08),
  ];
  addCurve(consoleGroup, palette.gold || palette.iron, railPoints, 0.016, 8);

  // VHF Radio Antenna
  addRod(consoleGroup, palette.iron, [0.24, 0.8, 0], [0.28, 1.7, -0.1], 0.01);

  g.add(consoleGroup);

  // H. Dual Jockey / Bench Seating (behind console)
  const seatBench = addBox(g, palette.wood || deepHullMat, [0, 0.32, -0.55], [0.65, 0.35, 0.45], 0.03);
  addBox(seatBench, rubberMat, [0, 0.2, 0], [0.62, 0.08, 0.42], 0.02);

  // Bow Storage Box / Cushion
  addBox(g, deckMat, [0, 0.24, 0.85], [0.45, 0.25, 0.45], 0.03);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      g.position.y = Math.sin(time * 2.2) * 0.04;
      g.rotation.z = Math.sin(time * 1.6) * 0.025;
      g.rotation.x = Math.sin(time * 1.9 + 0.4) * 0.018;
      propHub.rotation.z += dt * 18;
    },
  };
}

// ==========================================
// 14. VEHICLE: The Cinema Automobile (Sedan/SUV)
// ==========================================
export function createAutomobile(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const carLength = 4.2;
  const carWidth = 1.9;

  const bodyMat = palette.primary || palette.roof || createMaterial('#1e293b', 0.35, 0.7);
  const darkGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x111827,
    roughness: 0.1,
    metalness: 0.6,
    transparent: true,
    opacity: 0.8,
  });
  const tireMat = createMaterial('#18181b', 0.9, 0.05);
  const rimMat = palette.gold || createMaterial('#cbd5e1', 0.2, 0.85);

  // Lower Chassis / Body
  addBox(g, bodyMat, [0, 0.48, 0], [carWidth, 0.52, carLength], 0.08);

  // Cabin / Greenhouse
  const cabinLen = carLength * 0.52;
  const cabinWidth = carWidth * 0.86;
  const cabinHeight = 0.58;
  addBox(g, darkGlassMat, [0, 0.48 + 0.26 + cabinHeight / 2, -0.15], [cabinWidth, cabinHeight, cabinLen], 0.06);

  // Roof panel
  addBox(g, bodyMat, [0, 0.48 + 0.26 + cabinHeight + 0.02, -0.15], [cabinWidth * 0.96, 0.06, cabinLen * 0.92], 0.03);

  // 4 Wheels with Rims & Tires
  const wheelRadius = 0.36;
  const wheelThick = 0.22;
  const wheelBaseZ = carLength * 0.32;
  const trackX = carWidth * 0.52;

  for (const side of [-1, 1]) {
    for (const z of [-wheelBaseZ, wheelBaseZ]) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(side * trackX, wheelRadius, z);

      // Tire
      const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThick, 18);
      const tire = addPart(wheelGroup, tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;

      // Rim
      const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.65, wheelRadius * 0.65, wheelThick + 0.02, 12);
      const rim = addPart(wheelGroup, rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;

      // Rim spokes
      for (let s = 0; s < 5; s++) {
        const spoke = addBox(wheelGroup, rimMat, [side * 0.02, 0, 0], [0.03, wheelRadius * 1.1, 0.04], 0.005);
        spoke.rotation.x = (s * Math.PI * 2) / 5;
      }

      g.add(wheelGroup);
    }
  }

  // Front Headlights
  for (const side of [-1, 1]) {
    addBox(g, palette.glowCyan || createMaterial('#ffffff', 0.1, 0.9), [side * 0.68, 0.55, carLength / 2 + 0.02], [0.32, 0.14, 0.04], 0.02);
    // Rear Taillights (Red)
    addBox(g, createMaterial('#dc2626', 0.2, 0.5), [side * 0.68, 0.58, -carLength / 2 - 0.02], [0.34, 0.14, 0.04], 0.02);
  }

  // Front Grille & Bumpers
  addBox(g, palette.iron, [0, 0.45, carLength / 2 + 0.03], [0.95, 0.2, 0.05], 0.02);
  addBox(g, palette.iron, [0, 0.32, carLength / 2 + 0.06], [carWidth * 0.98, 0.16, 0.12], 0.03);
  addBox(g, palette.iron, [0, 0.32, -carLength / 2 - 0.06], [carWidth * 0.98, 0.16, 0.12], 0.03);

  // Side Mirrors
  for (const side of [-1, 1]) {
    addBox(g, bodyMat, [side * (carWidth / 2 + 0.12), 0.85, 0.45], [0.18, 0.1, 0.12], 0.02);
  }

  return {
    group: g,
    update: () => {
      g.position.y = Math.sin(performance.now() * 0.02) * 0.003;
    },
  };
}

// ==========================================
// 15. AIRCRAFT: The Utility Helicopter
// ==========================================
export function createHelicopter(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bodyMat = palette.primary || palette.roof || createMaterial('#0284c7', 0.4, 0.5);
  const ironMat = palette.iron;
  const glassMat = palette.glass;

  // Fuselage Body
  addBox(g, bodyMat, [0, 1.1, 0], [1.4, 1.2, 2.4], 0.15);

  // Glass Cockpit Bubble (Front)
  addBox(g, glassMat, [0, 1.15, 0.95], [1.32, 0.95, 0.85], 0.1);

  // Tail Boom extending back
  addRod(g, bodyMat, [0, 1.25, -1.0], [0, 1.45, -3.4], 0.12);

  // Vertical Tail Fin
  addBox(g, bodyMat, [0, 1.85, -3.4], [0.06, 0.85, 0.45], 0.02);

  // Tail Rotor (Spinning)
  const tailRotorHub = new THREE.Group();
  tailRotorHub.position.set(0.08, 1.95, -3.45);
  addBox(tailRotorHub, ironMat, [0, 0, 0], [0.02, 0.75, 0.08], 0.01);
  g.add(tailRotorHub);

  // Landing Skids (Twin tubular skids)
  for (const side of [-1, 1]) {
    addRod(g, ironMat, [side * 0.75, 0.12, -1.2], [side * 0.75, 0.12, 1.2], 0.04);
    addRod(g, ironMat, [side * 0.75, 0.12, -0.4], [side * 0.55, 0.6, -0.4], 0.035);
    addRod(g, ironMat, [side * 0.75, 0.12, 0.4], [side * 0.55, 0.6, 0.4], 0.035);
  }

  // Main Rotor Mast
  addRod(g, ironMat, [0, 1.7, 0.1], [0, 2.1, 0.1], 0.06);

  // Main Rotor Hub & 4 Blades
  const mainRotorHub = new THREE.Group();
  mainRotorHub.position.set(0, 2.12, 0.1);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const blade = addBox(mainRotorHub, ironMat, [0, 0, 0], [0.12, 0.02, 3.2], 0.01);
    blade.rotation.y = angle;
  }
  g.add(mainRotorHub);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      mainRotorHub.rotation.y += dt * 25;
      tailRotorHub.rotation.x += dt * 35;
      g.position.y = 0.05 * Math.sin(time * 3);
      g.rotation.z = 0.015 * Math.sin(time * 2);
    },
  };
}

// ==========================================
// 16. 3DVIZ PRO MAX UNIVERSAL QUADRUPED WALKER
// Grounded in blueprint-quadruped-walker.json and templates/kits/creatures/quadruped-walker.js
// Universal procedural 4-legged animal with two-bone IK, cycloid foot plants, and morphological adaptation.
// ==========================================

export interface QuadrupedMorphology {
  build?: 'stocky' | 'slender' | 'humped' | 'standard';
  neckLength?: number;
  neckLean?: number;
  horns?: 'none' | 'curved' | 'spikes' | 'antlers';
  ears?: 'drooping' | 'erect' | 'short' | 'standard';
  tail?: 'tassel' | 'short' | 'curled' | 'standard';
  hasDewlap?: boolean;
  hasUdder?: boolean;
  hasMane?: boolean;
  snoutLength?: number;
  snoutWidth?: number;
}

export interface QuadrupedWalkerOptions {
  scale?: number;
  strideM?: number;
  strideHz?: number;
  speed?: number;
  seed?: number;
  coat?: string;
  belly?: string;
  hoof?: string;
  horn?: string;
  nose?: string;
  patches?: string | null;
  yawRateRad?: number;
  morphology?: QuadrupedMorphology;
  palette?: ProceduralPalette;
}

const QUAD_HIP_Y = 0.62;
const QUAD_THIGH = 0.34;
const QUAD_SHIN = 0.32;
const QUAD_HOOF_H = 0.08;
const QUAD_NECK_LEAN = 0.42;
const QUAD_EAR_PITCH = -0.15;
const QUAD_TAIL_LIFT = 0.8;
const QUAD_DUTY = 0.62;
const QUAD_LIFT = 0.1;
const QUAD_OFFSETS = [0, 0.5, 0.5, 0];
const QUAD_START_PHASE = 0.78;
const QUAD_LEGS = [
  [0.155, 0.34, 1],
  [-0.155, 0.34, 1],
  [0.15, -0.33, -1],
  [-0.15, -0.33, -1],
] as const;

const QUAD_PALETTE = {
  coat: '#b39a78',
  belly: '#ded0b6',
  hoof: '#332c26',
  horn: '#e2d3ae',
  nose: '#6b504a',
  eye: '#1d1916',
  spark: '#fff6e2',
};

function quadConeFrustum({
  top,
  bottom,
  length,
  radial = 8,
  flat = false,
}: {
  top: number;
  bottom: number;
  length: number;
  radial?: number;
  flat?: boolean;
}): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(top, bottom, length, radial, 1);
  if (flat) geometry.rotateX(Math.PI / 2);
  return geometry;
}

function getQuadMaterials(opts: QuadrupedWalkerOptions) {
  const m = (color: string, roughness: number, metalness = 0) =>
    materialFor(color, { roughness, metalness });
  const coatColor = opts.coat ?? QUAD_PALETTE.coat;
  const bellyColor = opts.belly ?? QUAD_PALETTE.belly;
  const hoofColor = opts.hoof ?? QUAD_PALETTE.hoof;
  const hornColor = opts.horn ?? QUAD_PALETTE.horn;
  const noseColor = opts.nose ?? QUAD_PALETTE.nose;
  const patchColor = opts.patches;
  return {
    hide: m(coatColor, 0.86),
    pale: m(bellyColor, 0.9),
    hoof: m(hoofColor, 0.42, 0.05),
    nose: m(noseColor, 0.34),
    horn: m(hornColor, 0.58),
    eye: m(QUAD_PALETTE.eye, 0.18, 0.1),
    spark: m(QUAD_PALETTE.spark, 0.25),
    patch: patchColor ? m(patchColor, 0.88, 0.05) : null,
  };
}

function buildQuadLeg(
  body: THREE.Group,
  index: number,
  random: () => number,
  skin: { hide: THREE.Material; hoof: THREE.Material },
  proportions: { widthScale: number; legLengthScale: number }
) {
  const [baseX, baseZ, bend] = QUAD_LEGS[index];
  const x = baseX * proportions.widthScale;
  const z = baseZ;
  const hipY = QUAD_HIP_Y * proportions.legLengthScale;
  const thigh = QUAD_THIGH * proportions.legLengthScale;
  const shin = QUAD_SHIN * proportions.legLengthScale;
  const hoofH = QUAD_HOOF_H * proportions.legLengthScale;

  const hip = new THREE.Group();
  const knee = new THREE.Group();
  const foot = new THREE.Group();

  hip.position.set(x, hipY, z);
  knee.position.y = -thigh;
  foot.position.y = -shin;
  foot.name = `hoof-${index}`;

  body.add(hip);
  hip.add(knee);
  knee.add(foot);

  hip.add(
    part(
      quadConeFrustum({
        top: 0.062 * proportions.widthScale,
        bottom: 0.048 * proportions.widthScale,
        length: thigh,
      }),
      skin.hide,
      [0, -thigh / 2, 0]
    )
  );
  knee.add(
    part(
      quadConeFrustum({
        top: 0.045 * proportions.widthScale,
        bottom: 0.031 * proportions.widthScale,
        length: shin,
      }),
      skin.hide,
      [0, -shin / 2, 0]
    )
  );
  knee.add(
    part(
      new THREE.SphereGeometry(0.038 * proportions.widthScale, 8, 6),
      skin.hide,
      [0, -shin + 0.02 * proportions.legLengthScale, 0]
    )
  );

  for (const side of [1, -1]) {
    foot.add(
      part(
        bevelledBox({
          width: 0.036 * proportions.widthScale,
          height: hoofH,
          depth: 0.1 * proportions.widthScale,
          bevel: 0.012,
        }),
        skin.hoof,
        [side * 0.021 * proportions.widthScale, -hoofH / 2, 0.012 + random() * 0.004]
      )
    );
  }

  return { hip, knee, foot, bend, hipY, thigh, shin, hoofH };
}

function buildQuadEar(
  head: THREE.Group,
  side: number,
  random: () => number,
  hide: THREE.Material,
  pale: THREE.Material,
  earStyle: 'drooping' | 'erect' | 'short' | 'standard' = 'standard'
) {
  const ear = new THREE.Group();
  if (earStyle === 'drooping') {
    ear.position.set(side * 0.1, 0.04, -0.04);
    ear.rotation.set(0.35, 0, side * -0.45 + (random() - 0.5) * 0.1);
    head.add(ear);
    const outer = quadConeFrustum({ top: 0.012, bottom: 0.055, length: 0.2, radial: 6 });
    outer.scale(1, 1, 0.35);
    ear.add(part(outer, hide, [0, -0.09, 0]));
    const inner = quadConeFrustum({ top: 0.008, bottom: 0.038, length: 0.15, radial: 6 });
    inner.scale(1, 1, 0.35);
    ear.add(part(inner, pale, [0, -0.07, 0.01]));
  } else if (earStyle === 'erect') {
    ear.position.set(side * 0.065, 0.12, -0.04);
    ear.rotation.set(0.2, 0, side * 0.28 + (random() - 0.5) * 0.08);
    head.add(ear);
    const outer = quadConeFrustum({ top: 0.008, bottom: 0.048, length: 0.16, radial: 6 });
    outer.scale(1, 1, 0.4);
    ear.add(part(outer, hide, [0, 0.08, 0]));
    const inner = quadConeFrustum({ top: 0.005, bottom: 0.032, length: 0.12, radial: 6 });
    inner.scale(1, 1, 0.4);
    ear.add(part(inner, pale, [0, 0.06, 0.01]));
  } else if (earStyle === 'short') {
    ear.position.set(side * 0.075, 0.08, -0.05);
    ear.rotation.set(QUAD_EAR_PITCH, 0, side * 0.8);
    head.add(ear);
    const outer = quadConeFrustum({ top: 0.01, bottom: 0.045, length: 0.08, radial: 6 });
    outer.scale(1, 1, 0.5);
    ear.add(part(outer, hide, [0, 0.04, 0]));
  } else {
    ear.position.set(side * 0.088, 0.055, -0.05);
    ear.rotation.set(QUAD_EAR_PITCH, 0, side * 1.15 + (random() - 0.5) * 0.12);
    head.add(ear);
    for (const [top, bottom, length, material, z] of [
      [0.014, 0.062, 0.15, hide, 0],
      [0.009, 0.04, 0.11, pale, 0.012],
    ] as const) {
      const shell = quadConeFrustum({ top, bottom, length, radial: 6 });
      shell.scale(1, 1, 0.45);
      ear.add(part(shell, material, [0, 0.058, z]));
    }
  }
  return ear;
}

function buildQuadHead(
  neck: THREE.Group,
  random: () => number,
  materials: {
    hide: THREE.Material;
    pale: THREE.Material;
    nose: THREE.Material;
    horn: THREE.Material;
    eye: THREE.Material;
    spark: THREE.Material;
    patch: THREE.Material | null;
  },
  morphology: QuadrupedMorphology = {},
  neckLengthScale = 1
) {
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.3 * neckLengthScale, 0.02);
  neck.add(head);

  const headWidth =
    morphology.build === 'stocky' ? 1.25 : morphology.build === 'slender' ? 0.88 : 1.0;
  const snoutLength = morphology.snoutLength ?? 1.0;
  const snoutWidth = (morphology.snoutWidth ?? 1.0) * headWidth;

  const skull = bevelledBox({
    width: 0.17 * headWidth,
    height: 0.18,
    depth: 0.21,
    bevel: 0.035,
  });
  head.add(part(skull, materials.hide, [0, 0.03, 0.02]));

  if (materials.patch) {
    head.add(
      part(
        bevelledBox({ width: 0.1 * headWidth, height: 0.11, depth: 0.03, bevel: 0.01 }),
        materials.patch,
        [0, 0.08, 0.11]
      )
    );
  }

  head.add(
    part(
      quadConeFrustum({
        top: 0.055 * snoutWidth,
        bottom: 0.075 * snoutWidth,
        length: 0.17 * snoutLength,
        radial: 9,
        flat: true,
      }),
      materials.pale,
      [0, -0.035, 0.19]
    )
  );

  head.add(
    part(
      new THREE.SphereGeometry(0.05 * snoutWidth, 9, 7),
      materials.nose,
      [0, -0.032, 0.19 + 0.08 * snoutLength]
    )
  );

  for (const side of [1, -1]) {
    for (const [r, w, h, material, at] of [
      [0.024, 9, 7, materials.eye, [0.072 * headWidth, 0.05, 0.104]],
      [0.007, 6, 5, materials.spark, [0.064 * headWidth, 0.064, 0.121]],
      [0.011, 6, 5, materials.nose, [0.022 * snoutWidth, -0.058, 0.22 + 0.08 * snoutLength]],
    ] as const) {
      head.add(part(new THREE.SphereGeometry(r, w, h), material, [side * at[0], at[1], at[2]]));
    }
  }

  const ears = [
    buildQuadEar(head, 1, random, materials.hide, materials.pale, morphology.ears),
    buildQuadEar(head, -1, random, materials.hide, materials.pale, morphology.ears),
  ];

  const hornStyle = morphology.horns ?? 'spikes';
  if (hornStyle === 'spikes') {
    for (const side of [1, -1]) {
      const spike = new THREE.Group();
      spike.position.set(side * 0.05 * headWidth, 0.115, -0.02);
      spike.rotation.set(-0.95, 0, side * 0.3);
      head.add(spike);
      spike.add(
        part(
          quadConeFrustum({ top: 0.008, bottom: 0.026, length: 0.14, radial: 6 }),
          materials.horn,
          [0, 0.07, 0]
        )
      );
      for (let ring = 0; ring < 3; ring++) {
        spike.add(
          part(
            new THREE.TorusGeometry(0.021 - ring * 0.004, 0.0038, 4, 8),
            materials.horn,
            [0, 0.024 + ring * 0.028, 0],
            [Math.PI / 2, 0, 0]
          )
        );
      }
    }
  } else if (hornStyle === 'curved') {
    for (const side of [1, -1]) {
      const hornGroup = new THREE.Group();
      hornGroup.position.set(side * 0.07 * headWidth, 0.12, 0.01);
      head.add(hornGroup);
      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.08, 0.07, 0.01),
        new THREE.Vector3(side * 0.12, 0.16, -0.03),
      ];
      addCurve(hornGroup, materials.horn, points, 0.024, 8);
    }
  } else if (hornStyle === 'antlers') {
    for (const side of [1, -1]) {
      const antler = new THREE.Group();
      antler.position.set(side * 0.06 * headWidth, 0.13, -0.02);
      head.add(antler);
      const mainBeam = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.08, 0.14, -0.04),
        new THREE.Vector3(side * 0.12, 0.28, -0.02),
      ];
      addCurve(antler, materials.horn, mainBeam, 0.018, 8);
      const browTine = [
        new THREE.Vector3(side * 0.05, 0.09, -0.02),
        new THREE.Vector3(side * 0.09, 0.16, 0.08),
      ];
      addCurve(antler, materials.horn, browTine, 0.012, 6);
    }
  }

  return { head, ears };
}

/**
 * 3Dviz Pro Max Canonical Quadruped Walker Factory.
 * Synthesizes ANY four-legged animal procedurally through authentic two-bone IK,
 * cycloid foot plants, and morphological adaptation without bespoke single-species hardcoding.
 */
export function createQuadrupedWalker(
  options: QuadrupedWalkerOptions = {}
): ProceduralKitResult {
  const {
    scale = 1,
    strideM = 0.62,
    strideHz = 1.1,
    speed = 0,
    seed = 1,
    yawRateRad = 1.8,
    morphology = {},
  } = options;

  const group = new THREE.Group();
  const rig = new THREE.Group();
  const body = new THREE.Group();

  rig.scale.setScalar(scale);
  group.add(rig);
  rig.add(body);

  const random = seeded(seed);
  const skin = getQuadMaterials(options);
  const { hide, pale, patch } = skin;

  const build = morphology.build ?? 'standard';
  const widthScale = build === 'stocky' ? 1.35 : build === 'slender' ? 0.8 : 1.0;
  const lengthScale = build === 'stocky' ? 1.15 : build === 'slender' ? 0.95 : 1.0;
  const legLengthScale = build === 'slender' ? 1.1 : build === 'stocky' ? 0.95 : 1.0;
  const neckLenScale = morphology.neckLength ?? 1.0;
  const neckLeanAngle = morphology.neckLean ?? QUAD_NECK_LEAN;

  // 1. Torso: Barrel body, shoulder sphere, rump sphere, pale belly
  body.add(
    part(
      quadConeFrustum({
        top: 0.2 * widthScale,
        bottom: 0.17 * widthScale,
        length: 0.78 * lengthScale,
        radial: 9,
        flat: true,
      }),
      hide,
      [0, QUAD_HIP_Y * legLengthScale + 0.06, 0.02]
    )
  );

  body.add(
    part(
      new THREE.SphereGeometry(0.215 * widthScale, 10, 8),
      hide,
      [0, QUAD_HIP_Y * legLengthScale + 0.05, 0.31 * lengthScale]
    )
  );

  body.add(
    part(
      new THREE.SphereGeometry(0.195 * widthScale, 10, 8),
      hide,
      [0, QUAD_HIP_Y * legLengthScale + 0.04, -0.3 * lengthScale]
    )
  );

  body.add(
    part(
      new THREE.SphereGeometry(0.17 * widthScale, 9, 7),
      pale,
      [0, QUAD_HIP_Y * legLengthScale - 0.07, 0.02]
    )
  );

  // Dorsal Hump (for camelids/bisons)
  if (build === 'humped') {
    body.add(
      part(
        new THREE.SphereGeometry(0.26 * widthScale, 10, 8),
        hide,
        [0, QUAD_HIP_Y * legLengthScale + 0.28, 0.06]
      )
    );
  }

  // Asymmetrical body patches (e.g. Holstein dairy cows, piebald markings)
  if (patch) {
    body.add(
      part(
        bevelledBox({ width: 0.12 * widthScale, height: 0.28, depth: 0.35, bevel: 0.02 }),
        patch,
        [0.18 * widthScale, QUAD_HIP_Y * legLengthScale + 0.08, 0.12]
      )
    );
    body.add(
      part(
        bevelledBox({ width: 0.12 * widthScale, height: 0.24, depth: 0.3, bevel: 0.02 }),
        patch,
        [-0.18 * widthScale, QUAD_HIP_Y * legLengthScale + 0.06, -0.15]
      )
    );
  }

  // Udder (for milking quadrupeds)
  if (morphology.hasUdder) {
    const udder = new THREE.Group();
    udder.position.set(0, QUAD_HIP_Y * legLengthScale - 0.16, -0.18 * lengthScale);
    udder.add(part(new THREE.SphereGeometry(0.14 * widthScale, 10, 8), pale, [0, 0, 0]));
    for (const tx of [-0.04, 0.04]) {
      for (const tz of [-0.04, 0.04]) {
        udder.add(
          part(new THREE.CylinderGeometry(0.012, 0.009, 0.04, 6), pale, [tx, -0.12, tz])
        );
      }
    }
    body.add(udder);
  }

  // 2. Neck & Throat Dewlap
  const neck = new THREE.Group();
  neck.position.set(0, QUAD_HIP_Y * legLengthScale + 0.16, 0.4 * lengthScale);
  neck.rotation.x = neckLeanAngle;
  body.add(neck);

  neck.add(
    part(
      quadConeFrustum({
        top: 0.085 * widthScale,
        bottom: 0.13 * widthScale,
        length: 0.34 * neckLenScale,
        radial: 9,
      }),
      hide,
      [0, 0.14 * neckLenScale, 0]
    )
  );

  if (morphology.hasDewlap) {
    neck.add(
      part(
        bevelledBox({ width: 0.04, height: 0.22 * neckLenScale, depth: 0.25, bevel: 0.02 }),
        pale,
        [0, 0.06, 0.08]
      )
    );
  }

  if (morphology.hasMane) {
    neck.add(
      part(
        bevelledBox({ width: 0.04, height: 0.32 * neckLenScale, depth: 0.12, bevel: 0.015 }),
        skin.hoof,
        [0, 0.16 * neckLenScale, -0.1]
      )
    );
  }

  // 3. Head, Muzzle, Ears, Horns
  const { head, ears } = buildQuadHead(neck, random, skin, morphology, neckLenScale);

  // 4. Tail
  const tail = new THREE.Group();
  tail.position.set(0, QUAD_HIP_Y * legLengthScale + 0.13, -0.44 * lengthScale);
  tail.rotation.x = QUAD_TAIL_LIFT;
  body.add(tail);

  const tailStyle = morphology.tail ?? 'standard';
  if (tailStyle === 'tassel') {
    tail.add(
      part(quadConeFrustum({ top: 0.014, bottom: 0.035, length: 0.45, radial: 6 }), hide, [0, 0.2, 0])
    );
    tail.add(
      part(new THREE.ConeGeometry(0.045, 0.18, 8), patch || skin.hoof, [0, 0.46, 0])
    );
  } else if (tailStyle === 'short') {
    tail.add(
      part(quadConeFrustum({ top: 0.018, bottom: 0.04, length: 0.14, radial: 6 }), hide, [0, 0.07, 0])
    );
    tail.add(part(new THREE.SphereGeometry(0.038, 8, 6), pale, [0, 0.15, 0]));
  } else if (tailStyle === 'curled') {
    const tailPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.14, -0.06),
      new THREE.Vector3(0, 0.22, 0.04),
    ];
    addCurve(tail, hide, tailPoints, 0.03, 6);
  } else {
    tail.add(
      part(quadConeFrustum({ top: 0.016, bottom: 0.038, length: 0.3, radial: 6 }), hide, [0, 0.14, 0])
    );
    tail.add(part(new THREE.SphereGeometry(0.036, 8, 6), pale, [0, 0.3, 0]));
  }

  // 5. 4 Articulated IK Legs
  const legs = QUAD_LEGS.map((_, index) =>
    buildQuadLeg(body, index, random, skin, { widthScale, legLengthScale })
  );

  const cruise = strideM * strideHz * scale;
  const state: RouteStepState = {
    phase: QUAD_START_PHASE,
    time: 0,
    position: [0, 0, 0],
    heading: 0,
    distance: 0,
    waypoint: 0,
    speed: speed > 0 ? speed : cruise,
    route: null,
    loop: false,
    moving: true,
  };

  function pose() {
    const bob = 0.022 * Math.cos(4 * Math.PI * state.phase);
    const drive = Math.min(1, state.speed / Math.max(cruise, 1e-6));
    const beat = 2 * Math.PI * state.phase;

    body.position.y = bob;

    legs.forEach((leg, index) => {
      const [dz, lift] = footCycle(
        state.phase + QUAD_OFFSETS[index],
        strideM * QUAD_DUTY,
        QUAD_DUTY,
        QUAD_LIFT
      );
      const [thighRot, kneeRot] = twoBoneIk(
        dz,
        leg.hoofH + lift - leg.hipY - bob,
        leg.thigh,
        leg.shin,
        leg.bend
      );
      leg.hip.rotation.x = thighRot;
      leg.knee.rotation.x = kneeRot;
      leg.foot.rotation.x = -(thighRot + kneeRot) + (lift / QUAD_LIFT) * 0.32;
    });

    neck.rotation.x = neckLeanAngle + Math.sin(beat) * 0.05 * drive;
    head.rotation.x = Math.sin(beat + 0.9) * 0.07 * drive;
    tail.rotation.y = Math.sin(beat * 0.5) * 0.28 * drive;
    tail.rotation.x = QUAD_TAIL_LIFT - Math.sin(2 * beat) * 0.06;
    ears.forEach((e, i) => {
      e.rotation.x = QUAD_EAR_PITCH + Math.sin(state.time * 1.7 + i) * 0.09;
    });

    group.position.set(...state.position);
    group.rotation.y = state.heading;
  }

  function setRoute(points: [number, number][] | [number, number, number][], loop = false) {
    const route: [number, number][] = (points ?? []).map((p) =>
      p.length > 2 ? [p[0], (p as [number, number, number])[2]] : [p[0], p[1]]
    );
    Object.assign(state, {
      route,
      loop,
      moving: route.length > 1,
      waypoint: Math.min(1, route.length - 1),
    });
    if (route.length) state.position = [route[0][0], 0, route[0][1]];
    if (route.length > 1) {
      state.heading = Math.atan2(route[1][0] - route[0][0], route[1][1] - route[0][1]);
    }
    pose();
    return state;
  }

  function animate(dt: number, override: number | null = null): boolean {
    if (
      !routeStep(state, dt, {
        yawRateRad,
        strideM: strideM * scale,
        arrival: 0.12 * scale,
        speed: override,
      })
    ) {
      state.time += dt;
      state.phase += (dt * strideHz * 0.35);
      pose();
      return true;
    }
    pose();
    return true;
  }

  rig.updateMatrixWorld(true);
  const at = (n: THREE.Object3D, x: number, y: number, z: number): [number, number, number] =>
    n
      .localToWorld(new THREE.Vector3(x, y, z))
      .toArray()
      .map((v) => Math.round(v * 1000) / 1000) as [number, number, number];

  const sockets = [
    socket('harness', at(body, 0, QUAD_HIP_Y * legLengthScale + 0.02, 0.44 * lengthScale), [0, 0, 1]),
    socket('head', at(head, 0, 0.15, 0.02), [0, 1, 0]),
    socket('back', at(body, 0, QUAD_HIP_Y * legLengthScale + 0.26, -0.06 * lengthScale), [0, 1, 0]),
  ];

  const box = (v: [number, number, number]): [number, number, number] =>
    v.map((value) => value * scale) as [number, number, number];

  const colliders = [
    collider('trunk', box([0, 0.68, 0]), box([0.44 * widthScale, 0.44, 0.92 * lengthScale])),
    collider('head', box([0, 1.0, 0.52]), box([0.24 * widthScale, 0.3, 0.34])),
  ];

  pose();

  return {
    group,
    sockets,
    colliders,
    animate,
    setRoute,
    state,
    update: (dt: number) => {
      animate(dt);
    },
  };
}

/**
 * Universal Morphological Feature Extractor.
 * Dynamically resolves ANY animal noun or prompt in English or Arabic into
 * physical proportions, gait, horns, ears, and coat parameters for createQuadrupedWalker.
 */
export function extractQuadrupedMorphology(
  query: string,
  palette?: ProceduralPalette
): QuadrupedWalkerOptions {
  const q = query.toLowerCase();

  // Bovine / Cattle / Cow
  if (
    /\b(cow|cattle|bull|ox|bovine|calf|heifer|holstein|buffalo|bison|beef|steer|dairy cow|بقرة|بقره|بقر|ثور|عجل|جاموس|جاموسة)\b/i.test(
      q
    )
  ) {
    const isBull = /\b(bull|ox|steer|ثور)\b/i.test(q);
    return {
      scale: 1.45,
      coat: '#f8fafc',
      patches: '#18181b',
      belly: '#ded0b6',
      nose: '#fbcfe8',
      horn: '#e2d3ae',
      hoof: '#27272a',
      strideM: 0.72,
      strideHz: 0.95,
      morphology: {
        build: 'stocky',
        neckLength: 1.05,
        neckLean: 0.36,
        horns: 'curved',
        ears: 'drooping',
        tail: 'tassel',
        hasDewlap: true,
        hasUdder: !isBull,
      },
    };
  }

  // Caprine / Ovine (Goat, Sheep, Ram)
  if (/\b(goat|sheep|ram|lamb|ewe|billy|ماعز|خروف|كبش|جدي|نعجة)\b/i.test(q)) {
    const isRam = /\b(ram|كبش)\b/i.test(q);
    return {
      scale: 0.92,
      coat: isRam ? '#543d2b' : '#b39a78',
      belly: '#ded0b6',
      nose: '#6b504a',
      horn: '#e2d3ae',
      hoof: '#332c26',
      strideM: 0.52,
      strideHz: 1.15,
      morphology: {
        build: 'standard',
        neckLength: 0.95,
        horns: isRam ? 'curved' : 'spikes',
        ears: 'standard',
        tail: 'short',
      },
    };
  }

  // Camelid (Camel, Dromedary)
  if (/\b(camel|dromedary|bactrian|جمل|ناقة|بعير|حوار)\b/i.test(q)) {
    return {
      scale: 1.65,
      coat: '#c29b68',
      belly: '#dfcaa4',
      nose: '#5c4331',
      hoof: '#382a1d',
      strideM: 0.85,
      strideHz: 0.85,
      morphology: {
        build: 'humped',
        neckLength: 1.5,
        neckLean: 0.54,
        horns: 'none',
        ears: 'short',
        tail: 'tassel',
      },
    };
  }

  // Equine (Horse, Stallion, Zebra, Donkey, Mule)
  if (/\b(horse|stallion|mare|colt|pony|donkey|mule|zebra|حصان|فرس|مهر|حمار)\b/i.test(q)) {
    const isZebra = /\b(zebra|حمار وحشي)\b/i.test(q);
    const isDonkey = /\b(donkey|mule|حمار)\b/i.test(q);
    return {
      scale: isDonkey ? 1.15 : 1.45,
      coat: isZebra ? '#ffffff' : isDonkey ? '#78716c' : '#5c3a21',
      patches: isZebra ? '#111111' : null,
      belly: isZebra ? '#ffffff' : '#452b18',
      nose: '#291d14',
      hoof: '#1c1917',
      strideM: 0.82,
      strideHz: 1.05,
      morphology: {
        build: 'standard',
        neckLength: 1.35,
        neckLean: 0.46,
        horns: 'none',
        ears: isDonkey ? 'drooping' : 'erect',
        tail: 'tassel',
        hasMane: true,
      },
    };
  }

  // Cervid (Deer, Stag, Elk)
  if (/\b(stag|deer|buck|elk|doe|fawn|moose|غزال|أيل|وعل)\b/i.test(q)) {
    return {
      scale: 1.2,
      coat: '#8b5a2b',
      belly: '#ded0b6',
      nose: '#3d2514',
      horn: '#d4c4a8',
      hoof: '#27221d',
      strideM: 0.75,
      strideHz: 1.15,
      morphology: {
        build: 'slender',
        neckLength: 1.25,
        neckLean: 0.38,
        horns: 'antlers',
        ears: 'erect',
        tail: 'short',
      },
    };
  }

  // Canine (Dog, Hound, Wolf, Fox)
  if (/\b(dog|hound|wolf|pup|puppy|husky|coyote|jackal|fox|كلب|ذئب|ثعلب)\b/i.test(q)) {
    return {
      scale: 0.78,
      coat: '#4b4845',
      belly: '#858079',
      nose: '#1a1918',
      hoof: '#2a2826',
      strideM: 0.48,
      strideHz: 1.3,
      morphology: {
        build: 'slender',
        neckLength: 0.82,
        neckLean: 0.34,
        horns: 'none',
        ears: 'erect',
        tail: 'standard',
      },
    };
  }

  // Feline (Cat, Lion, Tiger, Leopard, Panther)
  if (
    /\b(cat|kitten|lion|tiger|leopard|panther|cheetah|cougar|feline|قط|قطة|اسد|نمر|فهد)\b/i.test(
      q
    )
  ) {
    const isBig = /\b(lion|tiger|leopard|panther|cheetah|اسد|نمر|فهد)\b/i.test(q);
    const isTiger = /\b(tiger|نمر)\b/i.test(q);
    const isLion = /\b(lion|اسد)\b/i.test(q);
    return {
      scale: isBig ? 1.35 : 0.52,
      coat: isTiger ? '#c2621b' : isLion ? '#c9a063' : '#3f3f46',
      patches: isTiger ? '#18181b' : null,
      belly: '#e4d5b7',
      nose: '#7c4d36',
      hoof: '#27272a',
      strideM: isBig ? 0.78 : 0.35,
      strideHz: isBig ? 1.05 : 1.4,
      morphology: {
        build: 'slender',
        neckLength: 0.9,
        neckLean: 0.38,
        horns: 'none',
        ears: 'short',
        tail: isLion ? 'tassel' : 'standard',
        hasMane: isLion,
      },
    };
  }

  // Ursid (Bear)
  if (/\b(bear|grizzly|دب)\b/i.test(q)) {
    return {
      scale: 1.55,
      coat: '#382516',
      belly: '#281a0e',
      nose: '#18110b',
      hoof: '#1f1610',
      strideM: 0.7,
      strideHz: 0.9,
      morphology: {
        build: 'stocky',
        neckLength: 0.68,
        horns: 'none',
        ears: 'short',
        tail: 'short',
      },
    };
  }

  // Porcine (Pig, Boar)
  if (/\b(pig|piglet|boar|swine|warthog|خنزير)\b/i.test(q)) {
    const isBoar = /\b(boar|warthog)\b/i.test(q);
    return {
      scale: 0.88,
      coat: isBoar ? '#423326' : '#e8b4b8',
      belly: isBoar ? '#30251c' : '#f0c7ca',
      nose: '#f472b6',
      hoof: '#382b21',
      strideM: 0.45,
      strideHz: 1.25,
      morphology: {
        build: 'stocky',
        neckLength: 0.6,
        horns: isBoar ? 'spikes' : 'none',
        ears: 'drooping',
        tail: 'curled',
      },
    };
  }

  // Pachyderm (Elephant, Rhino, Hippo)
  if (
    /\b(elephant|rhino|rhinoceros|hippo|hippopotamus|mammoth|فيل|وحيد القرن|فرس النهر)\b/i.test(q)
  ) {
    const isRhino = /\b(rhino|rhinoceros|وحيد القرن)\b/i.test(q);
    const isElephant = /\b(elephant|mammoth|فيل)\b/i.test(q);
    return {
      scale: 2.1,
      coat: '#71717a',
      belly: '#52525b',
      nose: '#3f3f46',
      horn: isRhino ? '#d4d4d8' : undefined,
      hoof: '#27272a',
      strideM: 1.05,
      strideHz: 0.75,
      morphology: {
        build: 'stocky',
        neckLength: 0.65,
        horns: isRhino ? 'spikes' : 'none',
        ears: isElephant ? 'drooping' : 'short',
        tail: 'tassel',
      },
    };
  }

  // Generic / Arbitrary Quadruped Animal / Fantasy Creature
  const isLarge = /\b(giant|huge|colossal|massive|large|big|ضخم|عملاق|كبير)\b/i.test(q);
  const isSmall = /\b(small|tiny|mini|baby|little|صغير|ضئيل)\b/i.test(q);
  const hasHorns = /\b(horn|horned|antler|antlers|spiked|قرن|قرون)\b/i.test(q);
  const isSlender = /\b(slender|lean|swift|fast|agile|سريع|رشيق)\b/i.test(q);
  const isStocky = /\b(stocky|heavy|broad|muscular|عريض|ممتلئ)\b/i.test(q);

  let coatColor = '#b39a78';
  if (/\b(black|dark|اسود|داكن)\b/i.test(q)) coatColor = '#27272a';
  else if (/\b(white|snow|ابيض|ناصع)\b/i.test(q)) coatColor = '#f8fafc';
  else if (/\b(brown|chestnut|بني)\b/i.test(q)) coatColor = '#5c3a21';
  else if (/\b(golden|gold|ذهب|ذهبي)\b/i.test(q)) coatColor = '#d97706';
  else if (/\b(grey|gray|رمادي)\b/i.test(q)) coatColor = '#71717a';
  else if (palette?.primary) {
    try {
      coatColor = `#${(palette.primary as THREE.MeshStandardMaterial).color.getHexString()}`;
    } catch {
      // keep fallback
    }
  }

  return {
    scale: isLarge ? 1.8 : isSmall ? 0.55 : 1.0,
    coat: coatColor,
    belly: '#ded0b6',
    morphology: {
      build: isStocky ? 'stocky' : isSlender ? 'slender' : 'standard',
      horns: hasHorns ? 'spikes' : 'none',
      ears: 'standard',
      tail: 'standard',
    },
  };
}

/**
 * Universal Quadruped Creature Builder Adapter.
 * Replaces hardcoded single-species functions by routing directly into createQuadrupedWalker.
 */
export function createQuadrupedCreature(
  palette: ProceduralPalette,
  query?: string
): ProceduralKitResult {
  const options = extractQuadrupedMorphology(query || 'quadruped creature', palette);
  return createQuadrupedWalker(options);
}


// ==========================================
// 17. INTERIOR / FURNITURE: Universal Table, Chair & Sofa
// ==========================================
export function createUniversalFurniture(type: 'chair' | 'table' | 'sofa', palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const woodMat = palette.wood;
  const cushionMat = palette.primary || palette.roof || createMaterial('#334155', 0.8, 0.1);

  if (type === 'table') {
    // Tabletop
    addBox(g, woodMat, [0, 0.76, 0], [1.8, 0.08, 1.1], 0.02);
    // 4 Legs
    for (const sx of [-0.75, 0.75]) {
      for (const sz of [-0.42, 0.42]) {
        addRod(g, woodMat, [sx, 0.72, sz], [sx, 0, sz], 0.04);
      }
    }
  } else if (type === 'sofa') {
    // Sofa Base
    addBox(g, woodMat, [0, 0.2, 0], [2.2, 0.18, 0.95], 0.03);
    // Cushions
    addBox(g, cushionMat, [0, 0.42, 0.05], [2.05, 0.26, 0.82], 0.06);
    // Backrest
    addBox(g, cushionMat, [0, 0.78, -0.36], [2.05, 0.52, 0.25], 0.05);
    // Armrests
    for (const sx of [-1.02, 1.02]) {
      addBox(g, cushionMat, [sx, 0.55, 0], [0.22, 0.42, 0.92], 0.04);
    }
  } else {
    // Chair Seat
    addBox(g, woodMat, [0, 0.48, 0], [0.65, 0.06, 0.65], 0.02);
    addBox(g, cushionMat, [0, 0.52, 0], [0.58, 0.04, 0.58], 0.02);
    // Backrest
    addBox(g, woodMat, [0, 0.9, -0.28], [0.6, 0.75, 0.06], 0.02);
    // 4 Legs
    for (const sx of [-0.26, 0.26]) {
      for (const sz of [-0.26, 0.26]) {
        addRod(g, woodMat, [sx, 0.45, sz], [sx, 0, sz], 0.028);
      }
    }
  }

  return { group: g };
}

// ==========================================
// 18. ACTION: Hero Weapon / Gear Prop
// ==========================================
export function createHeroWeaponProp(kind: 'sword' | 'gun', palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const metalMat = palette.gold || createMaterial('#e2e8f0', 0.2, 0.9);
  const gripMat = palette.iron || createMaterial('#18181b', 0.8, 0.1);

  if (kind === 'sword') {
    // Stand
    addBox(g, palette.wood, [0, 0.08, 0], [0.8, 0.16, 0.4], 0.02);
    addRod(g, palette.iron, [-0.2, 0.16, 0], [-0.2, 0.45, 0], 0.02);
    addRod(g, palette.iron, [0.2, 0.16, 0], [0.2, 0.45, 0], 0.02);

    // Blade
    const swordGroup = new THREE.Group();
    swordGroup.position.set(0, 0.52, 0);
    swordGroup.rotation.z = Math.PI / 12;

    addBox(swordGroup, metalMat, [0, 0.6, 0], [0.08, 1.2, 0.02], 0.005);
    // Crossguard
    addBox(swordGroup, palette.gold, [0, 0, 0], [0.38, 0.06, 0.05], 0.01);
    // Hilt / Grip
    addRod(swordGroup, gripMat, [0, 0, 0], [0, -0.32, 0], 0.025);
    // Pommel
    addPart(swordGroup, new THREE.SphereGeometry(0.045, 12, 12), palette.gold, [0, -0.34, 0]);

    g.add(swordGroup);
  } else {
    // Tactical Rifle / Blaster on Display Rack
    addBox(g, palette.iron, [0, 0.08, 0], [0.8, 0.16, 0.4], 0.02);
    const gunGroup = new THREE.Group();
    gunGroup.position.set(0, 0.5, 0);

    // Receiver Body
    addBox(gunGroup, gripMat, [0, 0, 0], [0.1, 0.24, 0.75], 0.02);
    // Barrel
    addRod(gunGroup, metalMat, [0, 0.05, 0.35], [0, 0.05, 1.15], 0.025);
    // Stock
    addBox(gunGroup, gripMat, [0, -0.04, -0.55], [0.08, 0.22, 0.4], 0.02);
    // Optic Scope
    addRod(gunGroup, metalMat, [0, 0.18, -0.1], [0, 0.18, 0.25], 0.035);
    addPart(gunGroup, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), palette.glowCyan, [0, 0.18, 0.26]).rotation.x = Math.PI / 2;

    g.add(gunGroup);
  }

  return { group: g };
}

// ==========================================
// 20. 3DVIZ PRO MAX BLUEPRINTS: Farm Cart with Spoked Wheels
// ==========================================
export function createCartAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const wood = palette.wood;
  const iron = palette.iron;
  const plank = palette.cream || wood;

  // 1. Steel Axle
  addRod(g, iron, [-0.7, 0.45, 0], [0.7, 0.45, 0], 0.035);

  // 2. Dual Spoked Wooden Wheels with Iron Rim Tyres
  const wheels: THREE.Group[] = [];
  for (const sideX of [-0.68, 0.68]) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(sideX, 0.45, 0);

    // Iron tyre & wooden felloe
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.025, 8, 24), iron);
    tyre.rotation.y = Math.PI / 2;
    wheelGroup.add(tyre);

    const felloe = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 6, 20), wood);
    felloe.rotation.y = Math.PI / 2;
    wheelGroup.add(felloe);

    // Cylindrical Hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.16, 12), wood);
    hub.rotation.z = Math.PI / 2;
    wheelGroup.add(hub);

    // Hub Cap
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), iron);
    cap.position.x = sideX > 0 ? 0.09 : -0.09;
    wheelGroup.add(cap);

    // 8 Radial Spokes
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spoke = addBox(
        wheelGroup,
        wood,
        [0, Math.sin(angle) * 0.22, Math.cos(angle) * 0.22],
        [0.04, 0.38, 0.035],
        0.01
      );
      spoke.rotation.x = angle;
    }

    g.add(wheelGroup);
    wheels.push(wheelGroup);
  }

  // 3. Planked Bed (5 longitudinal planks)
  const bedWidth = 0.95;
  const bedLength = 1.6;
  const planksCount = 5;
  const pWidth = (bedWidth - 0.08) / planksCount;
  for (let i = 0; i < planksCount; i++) {
    const x = -bedWidth / 2 + 0.04 + pWidth / 2 + i * pWidth;
    addBox(g, plank, [x, 0.52, -0.05], [pWidth - 0.015, 0.035, bedLength], 0.008);
  }

  // Bed Cross-beams & Side Stanchions
  addBox(g, wood, [0, 0.48, -0.65], [bedWidth + 0.06, 0.06, 0.07], 0.01);
  addBox(g, wood, [0, 0.48, 0.0], [bedWidth + 0.06, 0.06, 0.07], 0.01);
  addBox(g, wood, [0, 0.48, 0.65], [bedWidth + 0.06, 0.06, 0.07], 0.01);

  // Side Rails & Vertical Stanchions
  for (const sx of [-bedWidth / 2, bedWidth / 2]) {
    addBox(g, wood, [sx, 0.72, -0.05], [0.05, 0.06, bedLength + 0.05], 0.01);
    for (let k = 0; k < 4; k++) {
      const z = -bedLength / 2 + (k * bedLength) / 3;
      addBox(g, wood, [sx, 0.62, z], [0.055, 0.24, 0.055], 0.01);
    }
  }

  // Tailboard
  addBox(g, wood, [0, 0.65, -bedLength / 2 - 0.02], [bedWidth, 0.2, 0.04], 0.01);

  // 4. Draught Shafts (extend forward for horse/draught hitching)
  addRod(g, wood, [-0.35, 0.49, 0.7], [-0.22, 0.46, 1.85], 0.04);
  addRod(g, wood, [0.35, 0.49, 0.7], [0.22, 0.46, 1.85], 0.04);
  addRod(g, wood, [-0.22, 0.46, 1.85], [0.22, 0.46, 1.85], 0.035);

  // Kickstand / Prop Leg (supporting cart on ground)
  addRod(g, wood, [0, 0.48, 1.1], [0, 0.03, 1.1], 0.03);

  let roll = 0;
  return {
    group: g,
    update: (dt) => {
      roll += dt * 1.5;
      for (const w of wheels) w.rotation.x = roll;
    },
  };
}

// ==========================================
// 21. 3DVIZ PRO MAX BLUEPRINTS: Paddock Fence Run
// ==========================================
export function createFenceRunAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const wood = palette.wood;
  const postLength = 4.2;
  const postCount = 4;
  const postH = 1.25;
  const postW = 0.12;

  // 1. Vertical Posts with Chamfered Caps
  for (let i = 0; i < postCount; i++) {
    const x = -postLength / 2 + (i * postLength) / (postCount - 1);
    // Main Post
    addBox(g, wood, [x, postH / 2, 0], [postW, postH, postW], 0.015);
    // Chamfered Cap
    const cap = addPart(g, new THREE.ConeGeometry(postW * 0.85, 0.1, 4), wood, [x, postH + 0.04, 0]);
    cap.rotation.y = Math.PI / 4;
    // Ground anchor collar
    addBox(g, palette.stone, [x, 0.05, 0], [postW + 0.08, 0.1, postW + 0.08], 0.015);
  }

  // 2. Three Courses of Sagging Horizontal Rails
  const railHeights = [0.36, 0.72, 1.06];
  const sagAmount = 0.045;
  for (let i = 0; i < postCount - 1; i++) {
    const x0 = -postLength / 2 + (i * postLength) / (postCount - 1);
    const x1 = -postLength / 2 + ((i + 1) * postLength) / (postCount - 1);
    const midX = (x0 + x1) / 2;
    const span = x1 - x0;

    for (const y of railHeights) {
      // Sagging rail chord
      addBox(g, palette.cream || wood, [midX, y - sagAmount, 0.04], [span + 0.04, 0.07, 0.045], 0.01);
      // Joint nail heads
      addPart(g, new THREE.SphereGeometry(0.015, 6, 4), palette.iron, [x0, y, 0.07]);
      addPart(g, new THREE.SphereGeometry(0.015, 6, 4), palette.iron, [x1, y, 0.07]);
    }
  }

  return { group: g };
}

// ==========================================
// 22. 3DVIZ PRO MAX BLUEPRINTS: Tavern Hanging Signboard
// ==========================================
export function createSignboardAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const wood = palette.wood;
  const iron = palette.iron;
  const stone = palette.stone;

  // 1. Stepped Stone Plinth Base
  addBox(g, stone, [0, 0.06, 0], [0.65, 0.12, 0.65], 0.02);
  addBox(g, stone, [0, 0.16, 0], [0.48, 0.12, 0.48], 0.02);

  // 2. Vertical Chamfered Timber Post
  const postH = 2.65;
  addBox(g, wood, [0, postH / 2 + 0.18, 0], [0.15, postH, 0.15], 0.018);
  addPart(g, new THREE.ConeGeometry(0.12, 0.15, 4), iron, [0, postH + 0.24, 0]).rotation.y = Math.PI / 4;

  // 3. Cantilevered Smithed Iron Bracket Arm
  const armY = postH - 0.15;
  const reach = 1.15;
  addBox(g, iron, [reach / 2, armY, 0], [reach + 0.1, 0.05, 0.04], 0.01);

  // Scrolled curved iron strut underneath
  for (let i = 0; i < 7; i++) {
    const angle = (i / 6) * (Math.PI / 2);
    const r = 0.38;
    const px = 0.05 + r * Math.sin(angle);
    const py = armY - 0.06 - r * (1 - Math.cos(angle));
    const segment = addBox(g, iron, [px, py, 0], [0.11, 0.026, 0.026], 0.006);
    segment.rotation.z = -angle;
  }

  // 4. Swinging Signboard Assembly (animated)
  const swingGroup = new THREE.Group();
  swingGroup.position.set(0.68, armY - 0.02, 0);

  // Hanging Iron Chains
  for (const sx of [-0.22, 0.22]) {
    addRod(swingGroup, iron, [sx, 0, 0], [sx, -0.25, 0], 0.015);
    addPart(swingGroup, new THREE.TorusGeometry(0.025, 0.008, 6, 12), iron, [sx, 0, 0]);
    addPart(swingGroup, new THREE.TorusGeometry(0.025, 0.008, 6, 12), iron, [sx, -0.25, 0]);
  }

  // Main Wooden Signboard Panel
  const boardMat = palette.roof || wood;
  addBox(swingGroup, boardMat, [0, -0.58, 0], [0.74, 0.52, 0.045], 0.012);
  // Raised Decorative Gold/Wood Border Frame
  addBox(swingGroup, palette.gold || wood, [0, -0.34, 0.01], [0.76, 0.04, 0.05], 0.008);
  addBox(swingGroup, palette.gold || wood, [0, -0.82, 0.01], [0.76, 0.04, 0.05], 0.008);
  addBox(swingGroup, palette.gold || wood, [-0.36, -0.58, 0.01], [0.04, 0.52, 0.05], 0.008);
  addBox(swingGroup, palette.gold || wood, [0.36, -0.58, 0.01], [0.04, 0.52, 0.05], 0.008);

  // Carved Emblem Center Boss
  addPart(swingGroup, new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), palette.gold, [0, -0.58, 0]).rotation.x =
    Math.PI / 2;

  g.add(swingGroup);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      swingGroup.rotation.z = Math.sin(time * 1.6) * 0.04;
    },
  };
}

// ==========================================
// 23. 3DVIZ PRO MAX BLUEPRINTS: Faceted Rock Cluster & Boulders
// ==========================================
export function createRockClusterAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const stone = palette.stone;
  const darkStone = palette.iron || stone;

  // 1. Major Faceted Keystone Boulder
  const mainBoulderGeo = new THREE.DodecahedronGeometry(0.85, 1);
  const mainBoulder = new THREE.Mesh(mainBoulderGeo, stone);
  mainBoulder.scale.set(1.4, 0.95, 1.15);
  mainBoulder.position.set(0, 0.55, 0);
  mainBoulder.rotation.set(0.3, 0.7, -0.2);
  g.add(mainBoulder);

  // 2. Leaning Slab Boulder
  const slabGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const slab = new THREE.Mesh(slabGeo, darkStone);
  slab.scale.set(1.1, 0.65, 0.85);
  slab.position.set(0.85, 0.42, -0.3);
  slab.rotation.set(-0.4, 1.2, 0.35);
  g.add(slab);

  // 3. Flanking Secondary Boulder
  const flankGeo = new THREE.DodecahedronGeometry(0.55, 0);
  const flank = new THREE.Mesh(flankGeo, stone);
  flank.scale.set(0.8, 0.7, 0.9);
  flank.position.set(-0.75, 0.32, 0.4);
  flank.rotation.set(0.6, -0.5, 0.4);
  g.add(flank);

  // 4. Periphery Pebble & Gravel Scatter
  const pebblePositions: [number, number, number, number][] = [
    [1.3, 0.12, 0.4, 0.22],
    [-1.1, 0.1, -0.5, 0.18],
    [0.2, 0.08, 1.1, 0.25],
    [-0.4, 0.09, -1.0, 0.2],
    [0.9, 0.08, 0.9, 0.16],
  ];
  for (const [px, py, pz, r] of pebblePositions) {
    const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
    pebble.position.set(px, py, pz);
    pebble.rotation.set(0.5, 0.3, 0.8);
    g.add(pebble);
  }

  return { group: g };
}

// ==========================================
// 24. 3DVIZ PRO MAX BLUEPRINTS: Marsh Reeds & Cattails
// ==========================================
export function createReedsAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const stalkMat = palette.leaf || createMaterial('#4d7c0f', 0.6, 0.1);
  const cattailMat = palette.wood || createMaterial('#451a03', 0.85, 0.05);

  const cluster = new THREE.Group();
  const stalkCount = 14;

  for (let i = 0; i < stalkCount; i++) {
    const angle = (i / stalkCount) * Math.PI * 2;
    const dist = 0.12 + Math.sqrt((i + 1) / stalkCount) * 0.35;
    const px = Math.cos(angle) * dist;
    const pz = Math.sin(angle) * dist;
    const height = 1.6 + (i % 5) * 0.18;

    const stalkGroup = new THREE.Group();
    stalkGroup.position.set(px, 0, pz);
    stalkGroup.rotation.y = angle;
    stalkGroup.rotation.x = 0.04 + (i % 3) * 0.02;

    // Slender tapering stalk
    const stalkGeo = new THREE.CylinderGeometry(0.012, 0.024, height, 8);
    const stalkMesh = new THREE.Mesh(stalkGeo, stalkMat);
    stalkMesh.position.y = height / 2;
    stalkGroup.add(stalkMesh);

    // Arching leaf blade
    const leafGeo = new THREE.CylinderGeometry(0.005, 0.02, height * 0.65, 5);
    const leafMesh = new THREE.Mesh(leafGeo, stalkMat);
    leafMesh.position.set(0.08, height * 0.35, 0);
    leafMesh.rotation.z = -0.28;
    stalkGroup.add(leafMesh);

    // Cattail cylindrical flower spike on alternating stalks
    if (i % 2 === 0) {
      const cattailGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.24, 10);
      const cattailMesh = new THREE.Mesh(cattailGeo, cattailMat);
      cattailMesh.position.y = height - 0.22;
      stalkGroup.add(cattailMesh);

      // Spike tip finial
      const tipGeo = new THREE.ConeGeometry(0.015, 0.14, 8);
      const tipMesh = new THREE.Mesh(tipGeo, stalkMat);
      tipMesh.position.y = height - 0.03;
      stalkGroup.add(tipMesh);
    }

    cluster.add(stalkGroup);
  }

  g.add(cluster);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      cluster.rotation.z = Math.sin(time * 2.2) * 0.035;
      cluster.rotation.x = Math.cos(time * 1.8) * 0.025;
    },
  };
}

// ==========================================
// 25. 3DVIZ PRO MAX BLUEPRINTS: Paddock Clothesline with Hanging Laundry
// ==========================================
export function createClotheslineAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const wood = palette.wood;
  const iron = palette.iron;
  const span = 4.4;
  const postH = 2.15;

  // 1. Two Weathered Wooden T-Posts
  for (const sx of [-span / 2, span / 2]) {
    // Vertical post
    addBox(g, wood, [sx, postH / 2, 0], [0.12, postH, 0.12], 0.015);
    // Ground anchor collar
    addBox(g, palette.stone, [sx, 0.08, 0], [0.28, 0.16, 0.28], 0.02);
    // Horizontal T-Crossarm
    addBox(g, wood, [sx, postH - 0.05, 0], [0.12, 0.1, 0.85], 0.015);
    // Diagonal support struts
    for (const sz of [-0.28, 0.28]) {
      addRod(g, wood, [sx, postH - 0.35, 0], [sx, postH - 0.05, sz], 0.025);
    }
  }

  // 2. Twin Clothesline Wires
  for (const sz of [-0.32, 0.32]) {
    addRod(g, iron, [-span / 2, postH - 0.05, sz], [span / 2, postH - 0.05, sz], 0.008);
  }

  // 3. Hanging Laundry Sheets & Towels
  // Sheet 1: White Linen
  const sheet1Group = new THREE.Group();
  sheet1Group.position.set(-0.9, postH - 0.07, -0.32);
  addBox(sheet1Group, palette.cream || wood, [0, -0.42, 0], [0.85, 0.82, 0.015], 0.005);
  addBox(sheet1Group, palette.gold || wood, [-0.35, 0.02, 0], [0.03, 0.07, 0.03], 0.004);
  addBox(sheet1Group, palette.gold || wood, [0.35, 0.02, 0], [0.03, 0.07, 0.03], 0.004);
  g.add(sheet1Group);

  // Sheet 2: Teal / Cyan Towel
  const sheet2Group = new THREE.Group();
  sheet2Group.position.set(0.6, postH - 0.07, 0.32);
  const towelMat = palette.glowCyan || palette.primary || palette.roof;
  addBox(sheet2Group, towelMat, [0, -0.35, 0], [0.65, 0.68, 0.015], 0.005);
  addBox(sheet2Group, palette.gold || wood, [-0.25, 0.02, 0], [0.03, 0.07, 0.03], 0.004);
  addBox(sheet2Group, palette.gold || wood, [0.25, 0.02, 0], [0.03, 0.07, 0.03], 0.004);
  g.add(sheet2Group);

  // Garment 3: Terracotta Shirt
  const sheet3Group = new THREE.Group();
  sheet3Group.position.set(0.1, postH - 0.07, -0.32);
  addBox(sheet3Group, palette.roof, [0, -0.28, 0], [0.45, 0.54, 0.015], 0.005);
  addBox(sheet3Group, palette.gold || wood, [0, 0.02, 0], [0.03, 0.07, 0.03], 0.004);
  g.add(sheet3Group);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      sheet1Group.rotation.x = Math.sin(time * 2.8) * 0.07;
      sheet2Group.rotation.x = Math.sin(time * 2.5 + 1.2) * 0.08;
      sheet3Group.rotation.x = Math.sin(time * 3.1 + 0.6) * 0.09;
    },
  };
}

// ==========================================
// 26. 3DVIZ PRO MAX BLUEPRINTS: Stone Guildhall / Great Hall
// ==========================================
export function createStoneGuildhall(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const stone = palette.stone;
  const wood = palette.wood;
  const roof = palette.roof;
  const w = 4.2,
    d = 3.2,
    h = 2.4;

  // 1. Massive Plinth Foundation
  addBox(g, stone, [0, 0.15, 0], [w + 0.4, 0.3, d + 0.4], 0.04);
  // String Course Band
  addBox(g, stone, [0, 1.6, 0], [w + 0.15, 0.12, d + 0.15], 0.02);

  // 2. Thick Masonry Wall Envelope
  addBox(g, stone, [0, h / 2 + 0.15, 0], [w, h, d], 0.03);

  // 3. Arched Entrance Door with Reveal & Timber Leaf
  addBox(g, wood, [0, 0.85, d / 2 + 0.03], [0.95, 1.4, 0.08], 0.02);
  addPart(g, new THREE.CylinderGeometry(0.475, 0.475, 0.08, 16), wood, [0, 1.55, d / 2 + 0.03]).rotation.z =
    Math.PI / 2;
  // Entrance stone steps
  addBox(g, stone, [0, 0.1, d / 2 + 0.28], [1.5, 0.2, 0.45], 0.02);

  // 4. Inset Reveal Windows with Leaded Glazing
  const winPositions: [number, number, number][] = [
    [-1.3, 1.1, d / 2 + 0.02],
    [1.3, 1.1, d / 2 + 0.02],
    [-1.3, 1.1, -d / 2 - 0.02],
    [1.3, 1.1, -d / 2 - 0.02],
  ];
  for (const [wx, wy, wz] of winPositions) {
    addBox(g, stone, [wx, wy, wz], [0.65, 0.9, 0.1], 0.02);
    addBox(g, palette.glowCyan || palette.glass, [wx, wy, wz], [0.48, 0.72, 0.03], 0.01);
    addBox(g, wood, [wx, wy, wz + 0.02], [0.04, 0.72, 0.04], 0.008);
    addBox(g, wood, [wx, wy, wz + 0.02], [0.48, 0.04, 0.04], 0.008);
  }

  // 5. Dual-Pitch Gable Roof with Overhanging Eaves
  const rise = 1.35;
  const slopeAngle = Math.atan2(rise, w / 2);
  const slopeLen = Math.hypot(w / 2, rise);

  for (const side of [-1, 1]) {
    const roofSlab = addBox(
      g,
      roof,
      [(side * w) / 4, h + 0.15 + rise / 2, 0],
      [slopeLen + 0.25, 0.12, d + 0.45],
      0.03
    );
    roofSlab.rotation.z = -side * slopeAngle;
  }

  // Ridge Cap
  addBox(g, roof, [0, h + 0.15 + rise + 0.06, 0], [0.35, 0.14, d + 0.5], 0.02);

  // 6. Stately Stone Chimney Stack
  addBox(g, stone, [1.4, h + rise * 0.6, 0.5], [0.65, 1.8, 0.65], 0.03);
  addBox(g, stone, [1.4, h + rise * 0.6 + 0.95, 0.5], [0.8, 0.14, 0.8], 0.02);

  return { group: g };
}

// ==========================================
// 27. PRODUCTION APPLIANCE: High-Definition Television / Monitor
// ==========================================
export function createTelevisionAssembly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bezelMat = palette.iron || createMaterial('#18181b', 0.4, 0.3);
  const standMat = palette.iron || createMaterial('#27272a', 0.35, 0.5);
  const screenMat = createMaterial('#090d16', 0.2, 0.1);
  screenMat.emissive = new THREE.Color(0x0ea5e9);
  screenMat.emissiveIntensity = 0.35;



  // 1. Sleek Weighted Desktop Pedestal Base Stand
  addBox(g, standMat, [0, 0.02, 0], [0.72, 0.04, 0.38], 0.015);
  // Swivel neck pillar riser
  addBox(g, standMat, [0, 0.22, -0.04], [0.12, 0.38, 0.08], 0.012);

  // 2. 16:9 Flatscreen Chassis Cabinet
  const tvW = 1.82;
  const tvH = 1.08;
  const tvD = 0.07;
  const tvCenterY = 0.85;

  // Rear housing electronics module
  addBox(g, bezelMat, [0, tvCenterY, -0.04], [tvW * 0.65, tvH * 0.7, 0.06], 0.02);

  // Outer Bezel Frame
  addBox(g, bezelMat, [0, tvCenterY, 0], [tvW, tvH, tvD], 0.015);

  // Glossy Active Glass Display Screen Panel
  addBox(g, screenMat, [0, tvCenterY, tvD / 2 + 0.005], [tvW - 0.05, tvH - 0.05, 0.01], 0.005);

  // Ambient Power / Signal Indicator LED (glowing cyan)
  addPart(g, new THREE.SphereGeometry(0.015, 8, 8), palette.glowCyan, [
    tvW / 2 - 0.08,
    tvCenterY - tvH / 2 + 0.04,
    tvD / 2 + 0.01,
  ]);

  return { group: g };
}

// ==========================================
// 28. CHARACTER: Shadow Ninja Shinobi Assassin
// ==========================================
export function createNinjaCharacter(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const blackCloth = createMaterial('#09090b', 0.85, 0.05);
  const darkGrey = createMaterial('#18181b', 0.8, 0.1);
  const redSash = createMaterial('#991b1b', 0.7, 0.1);
  const steel = palette.iron || createMaterial('#94a3b8', 0.35, 0.75);
  const eyeGlow = palette.glowCyan || createMaterial('#38bdf8', 0.2, 0.9);

  const hipsY = 0.92;
  const hips = new THREE.Group();
  hips.position.y = hipsY;
  g.add(hips);

  // Pelvis & Red Sash Belt
  addBox(hips, darkGrey, [0, 0, 0], [0.36, 0.18, 0.22], 0.03);
  addBox(hips, redSash, [0, 0.04, 0], [0.38, 0.08, 0.24], 0.015);
  // Hanging sash cloth tails
  const sashTail = addBox(hips, redSash, [0.12, -0.16, 0.12], [0.07, 0.32, 0.02], 0.005);
  sashTail.rotation.z = -0.15;
  // Shuriken Star buckle
  addPart(hips, new THREE.CylinderGeometry(0.03, 0.03, 0.015, 4), steel, [0, 0.04, 0.13]);

  // Torso with Crossed Wraps
  const torso = new THREE.Group();
  torso.position.y = 0.12;
  hips.add(torso);
  addBox(torso, blackCloth, [0, 0.22, 0], [0.4, 0.46, 0.25], 0.04);
  // Armored chest vest
  addBox(torso, darkGrey, [0, 0.24, 0.02], [0.36, 0.38, 0.24], 0.02);

  // Twin Crossed Back Katanas
  const swordRig = new THREE.Group();
  swordRig.position.set(0, 0.25, -0.15);
  torso.add(swordRig);

  // Katana 1 (Diagonally left-down to right-up)
  addRod(swordRig, blackCloth, [-0.18, -0.3, 0], [0.18, 0.45, 0], 0.022);
  addBox(swordRig, palette.gold, [0.12, 0.32, 0], [0.06, 0.015, 0.06], 0.005); // Tsuba guard
  addRod(swordRig, darkGrey, [0.12, 0.32, 0], [0.2, 0.52, 0], 0.018); // Wrapped Hilt

  // Katana 2 (Diagonally right-down to left-up)
  addRod(swordRig, blackCloth, [0.18, -0.3, 0.02], [-0.18, 0.45, 0.02], 0.022);
  addBox(swordRig, palette.gold, [-0.12, 0.32, 0.02], [0.06, 0.015, 0.06], 0.005);
  addRod(swordRig, darkGrey, [-0.12, 0.32, 0.02], [-0.2, 0.52, 0.02], 0.018);

  // Hooded Head with Face Mask
  const head = new THREE.Group();
  head.position.y = 0.58;
  torso.add(head);

  // Shinobi Cowl
  addEll(head, blackCloth, [0, 0.08, 0], [0.13, 0.15, 0.14]);
  // Face mask wrap (lower face)
  addBox(head, darkGrey, [0, 0.04, 0.09], [0.18, 0.11, 0.11], 0.02);
  // Forehead ninja metal plate
  addBox(head, steel, [0, 0.15, 0.125], [0.11, 0.04, 0.02], 0.005);

  // Piercing Glowing Eye Slit Visor
  const eyeSlit = addBox(head, eyeGlow, [0, 0.1, 0.126], [0.12, 0.022, 0.01], 0.003);

  // Flowing Headband Ribbon Tails (behind head)
  const ribbon = new THREE.Group();
  ribbon.position.set(0, 0.14, -0.14);
  head.add(ribbon);
  addBox(ribbon, redSash, [-0.03, -0.14, 0], [0.04, 0.28, 0.015], 0.005);
  addBox(ribbon, redSash, [0.03, -0.18, -0.01], [0.04, 0.34, 0.015], 0.005);

  // Arms with Forearm Bracers
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  leftArm.position.set(0.24, 0.42, 0);
  rightArm.position.set(-0.24, 0.42, 0);
  torso.add(leftArm);
  torso.add(rightArm);

  addRod(leftArm, blackCloth, [0, 0, 0], [0, -0.26, 0.04], 0.05);
  addRod(leftArm, darkGrey, [0, -0.26, 0.04], [0, -0.5, 0.08], 0.042); // Forearm guard
  addEll(leftArm, blackCloth, [0, -0.54, 0.09], [0.035, 0.05, 0.025]); // Glove

  addRod(rightArm, blackCloth, [0, 0, 0], [0, -0.26, 0.04], 0.05);
  addRod(rightArm, darkGrey, [0, -0.26, 0.04], [0, -0.5, 0.08], 0.042);
  addEll(rightArm, blackCloth, [0, -0.54, 0.09], [0.035, 0.05, 0.025]);

  // Legs with Shin Wraps & Split-Toe Tabi Boots
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.position.set(0.13, 0, 0);
  rightLeg.position.set(-0.13, 0, 0);
  hips.add(leftLeg);
  hips.add(rightLeg);

  addRod(leftLeg, blackCloth, [0, 0, 0], [0, -0.44, 0], 0.07);
  addRod(leftLeg, darkGrey, [0, -0.44, 0], [0, -0.84, 0], 0.052); // Leg wraps
  addBox(leftLeg, blackCloth, [0, -0.88, 0.06], [0.11, 0.08, 0.24], 0.02); // Tabi boot

  addRod(rightLeg, blackCloth, [0, 0, 0], [0, -0.44, 0], 0.07);
  addRod(rightLeg, darkGrey, [0, -0.44, 0], [0, -0.84, 0], 0.052);
  addBox(rightLeg, blackCloth, [0, -0.88, 0.06], [0.11, 0.08, 0.24], 0.02);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Stealth low-profile breathing & fluttering ribbon
      hips.position.y = hipsY + 0.012 * Math.sin(time * 2.2);
      torso.rotation.y = 0.03 * Math.sin(time * 1.6);
      ribbon.rotation.x = 0.08 * Math.sin(time * 3.5);
      ribbon.rotation.z = 0.06 * Math.cos(time * 2.8);
      eyeSlit.scale.x = 1 + 0.05 * Math.sin(time * 4);
    },
  };
}

// ==========================================
// 29. CREATURE: Cybernetic War Beast / Mech Hound
// ==========================================
export function createCyberBeastCreature(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const armorMat = createMaterial('#1e293b', 0.45, 0.65);
  const carbonMat = createMaterial('#0f172a', 0.6, 0.3);
  const chromeMat = createMaterial('#cbd5e1', 0.25, 0.9);
  const coreGlow = palette.glowCyan || createMaterial('#06b6d4', 0.2, 0.95);

  // Main Armored Chassis Hull
  addBox(g, armorMat, [0, 1.35, 0], [0.75, 0.75, 1.65], 0.12);

  // Segmented Spinal Ridge & Blue Energy Conduits
  for (let i = 0; i < 5; i++) {
    const z = -0.6 + i * 0.3;
    addBox(g, carbonMat, [0, 1.78, z], [0.24, 0.14, 0.18], 0.02);
    // Glowing conduit segment
    addPart(g, new THREE.BoxGeometry(0.08, 0.06, 0.22), coreGlow, [0, 1.84, z]);
  }

  // Side Exhaust / Heat Dissipation Vents
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      addBox(g, chromeMat, [side * 0.4, 1.35, -0.3 + i * 0.25], [0.06, 0.18, 0.12], 0.01);
    }
  }

  // Angular Robotic Skull Head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.85, 1.05);
  g.add(headGroup);

  // Cranium Box
  addBox(headGroup, armorMat, [0, 0.05, 0], [0.42, 0.38, 0.48], 0.06);
  // Tapered Muzzle / Jaw
  addBox(headGroup, carbonMat, [0, -0.06, 0.32], [0.28, 0.24, 0.38], 0.04);
  // Chrome Lower Jaw Teeth
  addBox(headGroup, chromeMat, [0, -0.16, 0.3], [0.22, 0.08, 0.32], 0.02);

  // Dual Optical Sensor Eye Visors (Glowing Cyan)
  addBox(headGroup, coreGlow, [0, 0.08, 0.26], [0.34, 0.06, 0.04], 0.01);

  // Dual Sensor Antenna Ears
  for (const side of [-1, 1]) {
    const ear = addBox(headGroup, carbonMat, [side * 0.18, 0.26, -0.08], [0.06, 0.26, 0.1], 0.02);
    ear.rotation.z = side * 0.3;
    ear.rotation.x = -0.2;
  }

  // 4 Articulated Hydraulic Legs
  const legX = 0.36;
  const legFrontZ = 0.58;
  const legRearZ = -0.62;
  const legCoords = [
    [-legX, legFrontZ],
    [legX, legFrontZ],
    [-legX, legRearZ],
    [legX, legRearZ],
  ];

  for (const [x, z] of legCoords) {
    // Shoulder / Hip Servo Gimbal Pod
    addEll(g, chromeMat, [x, 1.35, z], [0.14, 0.14, 0.14]);
    // Upper Armored Thigh Strut
    addBox(g, armorMat, [x, 0.95, z], [0.14, 0.55, 0.18], 0.03);
    // Hydraulic Chrome Piston Rod
    addRod(g, chromeMat, [x + (x > 0 ? -0.05 : 0.05), 1.1, z], [x, 0.5, z], 0.035);
    // Lower Shin Segment
    addBox(g, carbonMat, [x, 0.45, z + (z < 0 ? -0.08 : 0.06)], [0.11, 0.55, 0.14], 0.02);
    // Carbon Foot Pad with Ground Claws
    addBox(g, chromeMat, [x, 0.06, z + 0.06], [0.18, 0.1, 0.26], 0.02);
  }

  // Segmented Articulated Cyber Tail
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.45, -0.85);
  g.add(tailGroup);
  for (let i = 0; i < 4; i++) {
    const tz = -0.15 - i * 0.22;
    const ty = -i * 0.08;
    addBox(tailGroup, carbonMat, [0, ty, tz], [0.09 - i * 0.015, 0.09 - i * 0.015, 0.18], 0.015);
  }
  // Glowing sensor node at tail tip
  addPart(tailGroup, new THREE.SphereGeometry(0.04, 8, 8), coreGlow, [0, -0.32, -1.0]);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Alert scanning head and robotic idle motion
      headGroup.rotation.y = 0.08 * Math.sin(time * 1.5);
      headGroup.position.y = 1.85 + 0.02 * Math.sin(time * 2.5);
      tailGroup.rotation.y = 0.15 * Math.sin(time * 3.0);
      tailGroup.rotation.z = 0.06 * Math.cos(time * 2.0);
    },
  };
}

// ==========================================
// 30. CREATURE: Flying Scaled Wyvern Dragon
// ==========================================
export function createDragonCreature(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const scaleMat = createMaterial('#15803d', 0.65, 0.15); // Emerald scales
  const bellyMat = createMaterial('#ca8a04', 0.6, 0.1); // Golden belly plates
  const hornMat = createMaterial('#1e293b', 0.45, 0.2);
  const wingMat = createMaterial('#14532d', 0.85, 0.05); // Leathery wing membrane
  const eyeMat = palette.glowOrange || createMaterial('#f59e0b', 0.2, 0.9);

  // Scaled Muscular Body
  addBox(g, scaleMat, [0, 1.4, 0], [0.78, 0.82, 1.7], 0.15);
  // Underbelly armored ridges
  addBox(g, bellyMat, [0, 1.05, 0.05], [0.55, 0.22, 1.5], 0.08);

  // Arched Serpentine Neck
  const neckPoints = [
    new THREE.Vector3(0, 1.55, 0.75),
    new THREE.Vector3(0, 2.1, 1.15),
    new THREE.Vector3(0, 2.6, 1.45),
  ];
  addCurve(g, scaleMat, neckPoints, 0.22, 12);

  // Horned Dragon Skull Head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.7, 1.55);
  g.add(headGroup);

  // Snout & Brow
  addBox(headGroup, scaleMat, [0, 0, 0], [0.38, 0.36, 0.58], 0.07);
  addBox(headGroup, scaleMat, [0, -0.06, 0.36], [0.28, 0.22, 0.44], 0.05);

  // Glowing Reptilian Eyes
  for (const side of [-1, 1]) {
    addEll(headGroup, eyeMat, [side * 0.18, 0.08, 0.14], [0.03, 0.02, 0.04]);
    // Dual Curved Horns extending backward
    const hornPoints = [
      new THREE.Vector3(side * 0.16, 0.16, -0.05),
      new THREE.Vector3(side * 0.28, 0.42, -0.35),
      new THREE.Vector3(side * 0.35, 0.65, -0.65),
    ];
    addCurve(headGroup, hornMat, hornPoints, 0.05, 8);
  }

  // Dorsal Spines along back
  for (let i = 0; i < 6; i++) {
    const z = -0.7 + i * 0.26;
    const spine = addPart(g, new THREE.ConeGeometry(0.04, 0.22, 4), hornMat, [0, 1.9, z]);
    spine.rotation.x = -0.25;
  }

  // Dual Swept Dragon Wings
  const leftWing = new THREE.Group();
  const rightWing = new THREE.Group();
  leftWing.position.set(0.42, 1.7, 0.2);
  rightWing.position.set(-0.42, 1.7, 0.2);
  g.add(leftWing);
  g.add(rightWing);

  // Wing Spars & Leathery Sails
  for (const [wing, side] of [[leftWing, 1], [rightWing, -1]] as const) {
    // Main arm bone
    addRod(wing, hornMat, [0, 0, 0], [side * 1.4, 0.9, -0.2], 0.06);
    // Finger struts
    addRod(wing, hornMat, [side * 1.4, 0.9, -0.2], [side * 2.2, 0.4, -0.6], 0.035);
    addRod(wing, hornMat, [side * 1.4, 0.9, -0.2], [side * 2.0, -0.2, -0.2], 0.035);
    // Thin membranous wing sail panel
    const sail = addBox(wing, wingMat, [side * 1.2, 0.4, -0.3], [1.8, 0.9, 0.04], 0.02);
    sail.rotation.z = side * 0.25;
  }

  // 4 Talon Legs
  for (const side of [-1, 1]) {
    for (const z of [0.55, -0.65]) {
      addRod(g, scaleMat, [side * 0.34, 1.3, z], [side * 0.36, 0.65, z], 0.11);
      addRod(g, scaleMat, [side * 0.36, 0.65, z], [side * 0.38, 0.12, z], 0.08);
      // Three front sharp talons
      for (let t = -1; t <= 1; t++) {
        addRod(g, hornMat, [side * 0.38, 0.12, z], [side * 0.38 + t * 0.06, 0.02, z + 0.18], 0.025);
      }
    }
  }

  // Barbed Serpentine Tail
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.4, -0.9);
  g.add(tailGroup);
  const tailPoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.2, -0.8),
    new THREE.Vector3(0, -0.1, -1.6),
  ];
  addCurve(tailGroup, scaleMat, tailPoints, 0.12, 10);
  // Arrowhead spade blade at tip
  const blade = addPart(tailGroup, new THREE.ConeGeometry(0.18, 0.35, 4), hornMat, [0, -0.1, -1.8]);
  blade.rotation.x = -Math.PI / 2;

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Dramatic slow wing flap & breathing
      leftWing.rotation.z = Math.sin(time * 2.0) * 0.25;
      rightWing.rotation.z = -Math.sin(time * 2.0) * 0.25;
      headGroup.position.y = 2.7 + Math.sin(time * 2.0) * 0.04;
      tailGroup.rotation.y = Math.sin(time * 1.8) * 0.2;
    },
  };
}

// ==========================================
// 31. CHARACTER: Armored Medieval Knight Warrior
// ==========================================
export function createKnightWarrior(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steel = palette.iron || createMaterial('#94a3b8', 0.25, 0.85);
  const goldTrim = palette.gold || createMaterial('#d97706', 0.3, 0.8);
  const chainmail = createMaterial('#475569', 0.7, 0.3);
  const leather = createMaterial('#451a03', 0.6, 0.1);

  const hipsY = 0.95;
  const hips = new THREE.Group();
  hips.position.y = hipsY;
  g.add(hips);

  // Chainmail Fauld & Plated Tassets
  addBox(hips, chainmail, [0, -0.05, 0], [0.38, 0.24, 0.25], 0.02);
  for (const side of [-1, 1]) {
    addBox(hips, steel, [side * 0.12, -0.1, 0.11], [0.14, 0.22, 0.03], 0.01);
  }

  // Steel Cuirass Breastplate
  const torso = new THREE.Group();
  torso.position.y = 0.12;
  hips.add(torso);
  addBox(torso, steel, [0, 0.24, 0], [0.42, 0.46, 0.26], 0.05);
  // Heraldic Golden Chest Medallion Cross
  addBox(torso, goldTrim, [0, 0.28, 0.135], [0.08, 0.24, 0.01], 0.003);
  addBox(torso, goldTrim, [0, 0.32, 0.135], [0.22, 0.08, 0.01], 0.003);

  // Great Helm Helmet with Visor
  const head = new THREE.Group();
  head.position.y = 0.58;
  torso.add(head);
  addBox(head, steel, [0, 0.1, 0], [0.26, 0.32, 0.26], 0.04);
  // Golden Crown Band
  addBox(head, goldTrim, [0, 0.24, 0], [0.27, 0.05, 0.27], 0.01);
  // Visor Eye Slit
  addBox(head, chainmail, [0, 0.12, 0.132], [0.18, 0.025, 0.01], 0.002);

  // Left Arm with Heater Shield
  const leftArm = new THREE.Group();
  leftArm.position.set(0.28, 0.42, 0);
  torso.add(leftArm);
  // Pauldron
  addEll(leftArm, steel, [0, 0.02, 0], [0.08, 0.07, 0.08]);
  addRod(leftArm, steel, [0, 0, 0], [0.04, -0.28, 0.06], 0.05);

  // Heater Shield
  const shield = new THREE.Group();
  shield.position.set(0.12, -0.18, 0.16);
  shield.rotation.y = -0.3;
  leftArm.add(shield);
  addBox(shield, steel, [0, 0, 0], [0.38, 0.56, 0.03], 0.02);
  addBox(shield, goldTrim, [0, 0, 0.02], [0.06, 0.38, 0.01], 0.002);
  addBox(shield, goldTrim, [0, 0.06, 0.02], [0.26, 0.06, 0.01], 0.002);

  // Right Arm with Broadsword
  const rightArm = new THREE.Group();
  rightArm.position.set(-0.28, 0.42, 0);
  torso.add(rightArm);
  addEll(rightArm, steel, [0, 0.02, 0], [0.08, 0.07, 0.08]);
  addRod(rightArm, steel, [0, 0, 0], [-0.04, -0.28, 0.06], 0.05);

  // Knight Broadsword held point-down
  const sword = new THREE.Group();
  sword.position.set(-0.06, -0.38, 0.18);
  rightArm.add(sword);
  addBox(sword, goldTrim, [0, 0, 0], [0.18, 0.025, 0.03], 0.005); // Crossguard
  addRod(sword, leather, [0, 0.08, 0], [0, 0, 0], 0.018); // Hilt
  addPart(sword, new THREE.SphereGeometry(0.025, 8, 8), goldTrim, [0, 0.1, 0]); // Pommel
  addBox(sword, steel, [0, -0.4, 0], [0.05, 0.78, 0.01], 0.003); // Blade

  // Greaves & Sabatons
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.13, 0, 0);
    hips.add(leg);
    addRod(leg, steel, [0, 0, 0], [0, -0.45, 0], 0.07);
    addRod(leg, steel, [0, -0.45, 0], [0, -0.85, 0], 0.055);
    addBox(leg, steel, [0, -0.9, 0.05], [0.13, 0.09, 0.26], 0.02);
  }

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      hips.position.y = hipsY + 0.01 * Math.sin(time * 1.8);
      torso.rotation.y = 0.03 * Math.sin(time * 1.4);
    },
  };
}

// ==========================================
// 32. CHARACTER: Film Noir Detective in Trenchcoat
// ==========================================
export function createDetectiveCharacter(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const coatMat = createMaterial('#d4a373', 0.8, 0.05); // Tan trenchcoat
  const pantsMat = createMaterial('#334155', 0.85, 0.05);
  const skin = createMaterial('#e2b189', 0.6, 0.0);
  const tieMat = createMaterial('#b91c1c', 0.7, 0.1);
  const darkLeather = createMaterial('#1c1917', 0.45, 0.2);

  const hipsY = 0.95;
  const hips = new THREE.Group();
  hips.position.y = hipsY;
  g.add(hips);

  // Trenchcoat Flared Skirt (reaching past knees)
  addBox(hips, coatMat, [0, -0.32, 0], [0.44, 0.65, 0.3], 0.04);

  // Torso with Double-Breasted Buttons & Lapels
  const torso = new THREE.Group();
  torso.position.y = 0.12;
  hips.add(torso);
  addBox(torso, coatMat, [0, 0.24, 0], [0.42, 0.48, 0.26], 0.04);

  // Shirt Collar & Necktie
  addBox(torso, createMaterial('#f8fafc', 0.8, 0), [0, 0.42, 0.12], [0.12, 0.08, 0.04], 0.01);
  addBox(torso, tieMat, [0, 0.26, 0.13], [0.04, 0.24, 0.02], 0.005);
  // Waist Belt with Buckle
  addBox(torso, coatMat, [0, 0.02, 0], [0.44, 0.07, 0.28], 0.01);
  addBox(torso, palette.gold, [0, 0.02, 0.145], [0.08, 0.07, 0.02], 0.005);

  // Fedora Hat & Head
  const head = new THREE.Group();
  head.position.y = 0.58;
  torso.add(head);
  addEll(head, skin, [0, 0.08, 0], [0.12, 0.14, 0.13]);
  addEll(head, skin, [0, 0.07, 0.13], [0.02, 0.03, 0.03]); // Nose

  // Fedora Crown & Brim
  const fedora = new THREE.Group();
  fedora.position.set(0, 0.16, 0);
  fedora.rotation.x = -0.08; // Classic rakish tilt
  head.add(fedora);
  // Brim
  const brim = addPart(fedora, new THREE.CylinderGeometry(0.24, 0.26, 0.02, 24), coatMat, [0, 0, 0]);
  brim.scale.set(1.0, 1.0, 1.15);
  // Hatband
  addPart(fedora, new THREE.CylinderGeometry(0.14, 0.15, 0.04, 20), darkLeather, [0, 0.03, 0]);
  // Creased Crown
  addBox(fedora, coatMat, [0, 0.1, 0], [0.24, 0.14, 0.26], 0.03);

  // Arms with Trenchcoat Sleeves
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.26, 0.42, 0);
    torso.add(arm);
    addRod(arm, coatMat, [0, 0, 0], [0, -0.28, 0.04], 0.06);
    addRod(arm, coatMat, [0, -0.28, 0.04], [0, -0.52, 0.06], 0.05);
    addEll(arm, darkLeather, [0, -0.56, 0.06], [0.035, 0.05, 0.025]); // Leather glove
  }

  // Legs & Oxfords
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.12, 0, 0);
    hips.add(leg);
    addRod(leg, pantsMat, [0, 0, 0], [0, -0.46, 0], 0.065);
    addRod(leg, pantsMat, [0, -0.46, 0], [0, -0.88, 0], 0.05);
    addBox(leg, darkLeather, [0, -0.92, 0.05], [0.12, 0.09, 0.26], 0.02);
  }

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      hips.position.y = hipsY + 0.012 * Math.sin(time * 1.6);
      torso.rotation.y = 0.03 * Math.sin(time * 1.2);
    },
  };
}

// ==========================================
// 33. CHARACTER: Hospital Chief Surgeon / Doctor
// ==========================================
export function createDoctorSurgeon(_palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const scrubMat = createMaterial('#0284c7', 0.8, 0.05); // Hospital surgical blue
  const maskMat = createMaterial('#e0f2fe', 0.7, 0.0);
  const latexMat = createMaterial('#2dd4bf', 0.5, 0.2); // Teal surgical gloves
  const skin = createMaterial('#e2b189', 0.6, 0.0);
  const chromeMat = createMaterial('#cbd5e1', 0.25, 0.85);

  const hipsY = 0.95;
  const hips = new THREE.Group();
  hips.position.y = hipsY;
  g.add(hips);

  // Scrubs Trousers
  addBox(hips, scrubMat, [0, 0, 0], [0.34, 0.18, 0.22], 0.03);

  // V-Neck Scrub Top
  const torso = new THREE.Group();
  torso.position.y = 0.12;
  hips.add(torso);
  addBox(torso, scrubMat, [0, 0.22, 0], [0.38, 0.44, 0.24], 0.04);

  // Stethoscope Draped over Neck & Shoulders
  const stethGroup = new THREE.Group();
  stethGroup.position.set(0, 0.42, 0.08);
  torso.add(stethGroup);
  // Rubber tubing loop around neck
  for (const side of [-1, 1]) {
    addRod(stethGroup, createMaterial('#0f172a', 0.7, 0.1), [side * 0.12, 0.02, -0.06], [side * 0.06, -0.22, 0.05], 0.012);
  }
  // Chrome Chestpiece Diaphragm
  addPart(stethGroup, new THREE.CylinderGeometry(0.035, 0.035, 0.015, 16), chromeMat, [0.04, -0.25, 0.06]);

  // Head with Scrub Cap & Face Mask
  const head = new THREE.Group();
  head.position.y = 0.58;
  torso.add(head);

  // Scrub Cap
  addEll(head, scrubMat, [0, 0.14, -0.02], [0.14, 0.11, 0.15]);
  // Face
  addEll(head, skin, [0, 0.06, 0], [0.12, 0.13, 0.12]);
  // Pleated Paper Surgical Face Mask over nose & mouth
  addBox(head, maskMat, [0, 0.03, 0.1], [0.18, 0.1, 0.08], 0.02);
  // Focused Eyes above mask
  for (const side of [-1, 1]) {
    addEll(head, createMaterial('#0f172a', 0.8, 0.1), [side * 0.05, 0.09, 0.11], [0.015, 0.015, 0.01]);
  }

  // Arms with Sterile Gloves
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.24, 0.4, 0);
    torso.add(arm);
    addRod(arm, scrubMat, [0, 0, 0], [0, -0.24, 0], 0.05);
    addRod(arm, skin, [0, -0.24, 0], [0, -0.42, 0], 0.04);
    addRod(arm, latexMat, [0, -0.42, 0], [0, -0.54, 0], 0.042); // Glove cuff
    addEll(arm, latexMat, [0, -0.56, 0.01], [0.035, 0.05, 0.025]); // Hand
  }

  // Scrub Pants & Clogs
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.12, 0, 0);
    hips.add(leg);
    addRod(leg, scrubMat, [0, 0, 0], [0, -0.46, 0], 0.065);
    addRod(leg, scrubMat, [0, -0.46, 0], [0, -0.88, 0], 0.05);
    addBox(leg, createMaterial('#f8fafc', 0.8, 0.05), [0, -0.92, 0.05], [0.12, 0.09, 0.26], 0.02); // White clogs
  }

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      hips.position.y = hipsY + 0.012 * Math.sin(time * 1.8);
      torso.rotation.y = 0.03 * Math.sin(time * 1.4);
    },
  };
}

// ==========================================
// 34. VEHICLE: High-Performance Aerodynamic Sports Car
// ==========================================
export function createSportsCarVehicle(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const carPaint = palette.primary || createMaterial('#dc2626', 0.25, 0.85); // Vibrant Red Gloss
  const carbon = createMaterial('#0f172a', 0.5, 0.3);
  const glass = palette.glass || createMaterial('#030712', 0.1, 0.9);
  const chrome = createMaterial('#cbd5e1', 0.2, 0.9);
  const tireMat = createMaterial('#18181b', 0.85, 0.05);

  // 1. Low-Slung Wedge Chassis
  addBox(g, carPaint, [0, 0.45, 0], [1.9, 0.38, 4.4], 0.12);
  // Front Low Splitter
  addBox(g, carbon, [0, 0.22, 2.15], [1.8, 0.06, 0.4], 0.02);
  // Rear Aerodynamic Diffuser
  addBox(g, carbon, [0, 0.28, -2.15], [1.75, 0.15, 0.35], 0.02);

  // 2. Cockpit Canopy Greenhouse
  addBox(g, glass, [0, 0.92, -0.2], [1.45, 0.55, 2.1], 0.15);

  // 3. Rear Spoiler Wing on Dual Struts
  addBox(g, carbon, [0, 1.15, -2.0], [1.7, 0.04, 0.35], 0.01);
  for (const side of [-0.65, 0.65]) {
    addRod(g, carbon, [side, 0.65, -1.95], [side, 1.15, -1.95], 0.03);
  }

  // 4. Headlights & Taillights
  for (const side of [-0.65, 0.65]) {
    addBox(g, palette.glowCyan, [side, 0.55, 2.15], [0.28, 0.08, 0.08], 0.02); // Headlights
    addBox(g, createMaterial('#ef4444', 0.2, 0.9), [side, 0.58, -2.18], [0.35, 0.06, 0.04], 0.01); // Taillights
  }

  // 5. 4 Alloy Wheels with Rubber Tires
  const wheels: THREE.Group[] = [];
  const wheelX = 0.96;
  const wheelY = 0.38;
  const wheelZPositions = [1.35, -1.35];

  for (const z of wheelZPositions) {
    for (const side of [-1, 1]) {
      const wGroup = new THREE.Group();
      wGroup.position.set(side * wheelX, wheelY, z);
      g.add(wGroup);
      wheels.push(wGroup);

      // Tire (rotated cylinder)
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 24), tireMat);
      tire.rotation.z = Math.PI / 2;
      wGroup.add(tire);

      // Alloy Rim
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.29, 16), chrome);
      rim.rotation.z = Math.PI / 2;
      wGroup.add(rim);

      // Red Brake Caliper
      addBox(wGroup, createMaterial('#dc2626', 0.4, 0.5), [0, 0.12, 0], [0.08, 0.12, 0.14], 0.02);
    }
  }

  let roll = 0;
  return {
    group: g,
    update: (dt) => {
      roll += dt * 3.5;
      for (const w of wheels) w.rotation.x = roll;
    },
  };
}

// ==========================================
// 35. VEHICLE: Main Battle Tank with Continuous Tracks
// ==========================================
export function createTankArmoredVehicle(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const armorMat = createMaterial('#44533c', 0.75, 0.3); // Olive drab military green
  const steelMat = palette.iron || createMaterial('#27272a', 0.45, 0.6);
  const trackMat = createMaterial('#18181b', 0.85, 0.1);

  // 1. Armored Hull with Sloped Glacis Plate
  addBox(g, armorMat, [0, 0.85, 0], [2.4, 0.65, 4.6], 0.1);
  // Front sloped glacis
  const glacis = addBox(g, armorMat, [0, 0.82, 2.2], [2.2, 0.4, 0.7], 0.08);
  glacis.rotation.x = 0.45;

  // 2. Twin Continuous Caterpillar Track Assemblies
  for (const side of [-1, 1]) {
    const trackX = side * 1.25;
    // Track skirt / shroud
    addBox(g, armorMat, [trackX, 0.75, 0], [0.38, 0.45, 4.7], 0.05);
    // Track run loop
    addBox(g, trackMat, [trackX, 0.4, 0], [0.36, 0.65, 4.5], 0.12);

    // 5 Road Wheels per side
    for (let i = 0; i < 5; i++) {
      const wz = -1.8 + i * 0.9;
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.38, 18), steelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(trackX, 0.38, wz);
      g.add(wheel);
    }
  }

  // 3. Rotating 360 Turret with Commander Cupola
  const turretGroup = new THREE.Group();
  turretGroup.position.set(0, 1.35, -0.2);
  g.add(turretGroup);

  // Angled Turret Body
  addBox(turretGroup, armorMat, [0, 0.28, 0], [1.75, 0.55, 2.2], 0.12);
  // Commander Cupola
  addPart(turretGroup, new THREE.CylinderGeometry(0.32, 0.35, 0.18, 16), steelMat, [0.42, 0.62, -0.3]);

  // Long Heavy Tank Cannon Barrel with Muzzle Brake
  addRod(turretGroup, steelMat, [0, 0.28, 1.0], [0, 0.28, 4.4], 0.09);
  // Muzzle brake box at tip
  addBox(turretGroup, steelMat, [0, 0.28, 4.45], [0.24, 0.2, 0.3], 0.02);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      // Realistic tactical turret scanning sweep
      turretGroup.rotation.y = Math.sin(time * 0.4) * 0.35;
    },
  };
}

// ==========================================
// 36. VEHICLE: Deep-Sea Exploration Submarine
// ==========================================
export function createSubmarineVessel(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const hullMat = createMaterial('#0f172a', 0.45, 0.55); // Naval dark hull
  const orangeTrim = palette.glowOrange || createMaterial('#f97316', 0.4, 0.6);
  const glass = palette.glass || createMaterial('#38bdf8', 0.1, 0.95);
  const bronzeMat = createMaterial('#d97706', 0.35, 0.85);

  // 1. Hydrodynamic Cylindrical Hull Body
  const hullLength = 5.2;
  const hullRadius = 0.85;
  const hullCylinder = new THREE.Mesh(new THREE.CylinderGeometry(hullRadius, hullRadius, hullLength, 28), hullMat);
  hullCylinder.rotation.x = Math.PI / 2;
  hullCylinder.position.set(0, 1.2, 0);
  g.add(hullCylinder);

  // Hemispherical Bow Sonar Nose Dome
  addEll(g, orangeTrim, [0, 1.2, hullLength / 2], [hullRadius, hullRadius, 0.9]);
  // Glowing Observation Viewport
  addPart(g, new THREE.SphereGeometry(0.32, 16, 16), glass, [0, 1.2, hullLength / 2 + 0.65]);

  // 2. Sail / Conning Tower
  addBox(g, hullMat, [0, 2.3, 0.4], [0.38, 1.1, 1.4], 0.08);
  // Periscope & Snorkel Masts
  addRod(g, createMaterial('#94a3b8', 0.2, 0.8), [0, 2.85, 0.6], [0, 3.4, 0.6], 0.025);
  addRod(g, createMaterial('#94a3b8', 0.2, 0.8), [0, 2.85, 0.2], [0, 3.6, 0.2], 0.03);

  // Forward Diving Planes
  for (const side of [-1, 1]) {
    addBox(g, orangeTrim, [side * 0.85, 2.2, 0.4], [0.75, 0.06, 0.45], 0.02);
  }

  // 3. Aft Cruciform Rudder Fins & Bronze Propeller
  for (const side of [-1, 1]) {
    addBox(g, hullMat, [side * 0.95, 1.2, -hullLength / 2], [0.9, 0.06, 0.65], 0.02); // Horizontal
  }
  addBox(g, hullMat, [0, 1.2 + 0.95, -hullLength / 2], [0.06, 0.9, 0.65], 0.02); // Vertical Top
  addBox(g, hullMat, [0, 1.2 - 0.95, -hullLength / 2], [0.06, 0.9, 0.65], 0.02); // Vertical Bottom

  // 5-Blade Bronze Screw Propeller
  const propHub = new THREE.Group();
  propHub.position.set(0, 1.2, -hullLength / 2 - 0.35);
  for (let i = 0; i < 5; i++) {
    const angle = (i * TAU) / 5;
    const blade = addBox(propHub, bronzeMat, [0, 0, 0], [0.12, 0.55, 0.02], 0.01);
    blade.rotation.z = angle;
  }
  g.add(propHub);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      propHub.rotation.z += dt * 15;
      g.position.y = 0.08 * Math.sin(time * 1.5);
    },
  };
}

// ==========================================
// 37. ARCHITECTURE: Grand Medieval Fortress Castle Tower
// ==========================================
export function createCastleTowerArchitecture(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const stoneMat = palette.stone || createMaterial('#78716c', 0.85, 0.1);
  const slateMat = palette.roof || createMaterial('#1e293b', 0.75, 0.15);
  const woodMat = palette.wood || createMaterial('#543d2b', 0.8, 0.1);
  const flagMat = createMaterial('#dc2626', 0.8, 0.05); // Crimson pennant

  const towerH = 4.2;
  const towerR = 1.35;

  // 1. Stepped Battered Stone Foundation Base
  addPart(g, new THREE.CylinderGeometry(towerR + 0.35, towerR + 0.55, 0.45, 24), stoneMat, [0, 0.22, 0]);

  // 2. Main Cylindrical Masonry Tower Shaft
  addPart(g, new THREE.CylinderGeometry(towerR, towerR + 0.15, towerH, 24), stoneMat, [0, towerH / 2 + 0.45, 0]);

  // Recessed Arched Oak Door
  addBox(g, woodMat, [0, 0.9, towerR + 0.08], [0.85, 1.35, 0.14], 0.03);
  addBox(g, stoneMat, [0, 1.62, towerR + 0.06], [1.1, 0.22, 0.2], 0.03); // Keystone arch lintel

  // Slit Arrow Loops
  for (let lvl = 0; lvl < 3; lvl++) {
    const y = 1.8 + lvl * 0.9;
    for (let i = 0; i < 4; i++) {
      const angle = (i * TAU) / 4;
      const slit = addBox(g, createMaterial('#09090b', 0.9, 0), [0, 0, 0], [0.08, 0.38, 0.1], 0.01);
      slit.position.set(Math.sin(angle) * (towerR + 0.02), y, Math.cos(angle) * (towerR + 0.02));
      slit.rotation.y = angle;
    }
  }

  // 3. Overhanging Corbelled Machicolations & Battlements
  const battley = towerH + 0.55;
  addPart(g, new THREE.CylinderGeometry(towerR + 0.32, towerR, 0.35, 24), stoneMat, [0, battley, 0]);

  // Crenellated Merlons (8 defensive teeth)
  for (let i = 0; i < 8; i++) {
    const angle = (i * TAU) / 8;
    const merlon = addBox(g, stoneMat, [0, 0, 0], [0.45, 0.55, 0.22], 0.02);
    merlon.position.set(Math.sin(angle) * (towerR + 0.22), battley + 0.4, Math.cos(angle) * (towerR + 0.22));
    merlon.rotation.y = angle;
  }

  // 4. Conical Steep Slate Roof with Spire & Flying Pennant Flag
  const roofH = 1.8;
  addPart(g, new THREE.ConeGeometry(towerR + 0.15, roofH, 24), slateMat, [0, battley + roofH / 2 + 0.2, 0]);

  // Spire Mast & Flying Pennant Flag
  addRod(g, palette.iron, [0, battley + roofH + 0.1, 0], [0, battley + roofH + 1.1, 0], 0.035);
  // Triangular Flying Crimson Flag
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(0.65, -0.18);
  flagShape.lineTo(0, -0.36);
  flagShape.closePath();
  const flagGeo = new THREE.ExtrudeGeometry(flagShape, { depth: 0.015, bevelEnabled: false });
  const flagMesh = addPart(g, flagGeo, flagMat, [0.02, battley + roofH + 0.95, 0]);

  let time = 0;
  return {
    group: g,
    update: (dt) => {
      time += dt;
      flagMesh.rotation.y = Math.sin(time * 3.5) * 0.25;
    },
  };
}

