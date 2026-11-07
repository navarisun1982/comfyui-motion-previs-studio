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
// FURNITURE
// ============================================================================

// 1. furn-armchair: Plush Upholstered Club Armchair
export function createPlushArmchair(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const fabricMat = createMaterial('#7c2d12', 0.72, 0.05);
  for (const sx of [-0.36, 0.36]) {
    for (const sz of [-0.34, 0.34]) {
      addRod(g, palette.wood, [sx, 0, sz], [sx, 0.2, sz], 0.035);
    }
  }
  addBox(g, fabricMat, [0, 0.34, 0], [0.88, 0.28, 0.84], 0.06);
  addBox(g, fabricMat, [0, 0.76, -0.32], [0.84, 0.68, 0.22], 0.07);
  for (const sx of [-0.38, 0.38]) {
    addBox(g, fabricMat, [sx, 0.58, 0.02], [0.2, 0.34, 0.82], 0.07);
  }
  return { group: g };
}

// 2. furn-bookshelf: Tall 5-Tier Wooden Bookshelf Filled with Books
export function createLibraryBookshelf(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bookColors = ['#dc2626', '#1d4ed8', '#15803d', '#b45309', '#6d28d9'];
  // Side panels, back panel & 5 shelves
  addBox(g, palette.wood, [-0.58, 1.05, 0], [0.06, 2.1, 0.42], 0.01);
  addBox(g, palette.wood, [0.58, 1.05, 0], [0.06, 2.1, 0.42], 0.01);
  addBox(g, palette.wood, [0, 1.05, -0.19], [1.2, 2.1, 0.04], 0.01);
  for (let s = 0; s <= 5; s++) {
    const sy = 0.08 + s * 0.39;
    addBox(g, palette.wood, [0, sy, 0], [1.2, 0.045, 0.42], 0.01);
    if (s < 5) {
      for (let b = 0; b < 9; b++) {
        const bx = -0.46 + b * 0.11;
        const bh = 0.24 + ((b + s) % 3) * 0.035;
        addBox(g, createMaterial(bookColors[(b + s) % bookColors.length], 0.65, 0.05), [bx, sy + 0.02 + bh / 2, 0.02], [0.085, bh, 0.26], 0.005);
      }
    }
  }
  return { group: g };
}

// 3. furn-desk: Executive Twin-Pedestal Mahogany Office Desk
export function createExecutiveDesk(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Desktop slab + leather blotter + left & right drawer pedestals
  addBox(g, palette.wood, [0, 0.78, 0], [1.68, 0.08, 0.88], 0.02);
  addBox(g, palette.iron, [0, 0.825, 0.06], [0.68, 0.015, 0.46], 0.005);
  for (const sx of [-0.56, 0.56]) {
    addBox(g, palette.wood, [sx, 0.38, 0], [0.46, 0.74, 0.78], 0.02);
    for (const dy of [0.2, 0.42, 0.62]) {
      addBox(g, palette.gold, [sx, dy, 0.4], [0.14, 0.025, 0.02], 0.003);
    }
  }
  // Brass banker's desk lamp on corner
  addPart(g, new THREE.CylinderGeometry(0.08, 0.1, 0.04, 12), palette.gold, [-0.55, 0.84, -0.22]);
  addRod(g, palette.gold, [-0.55, 0.84, -0.22], [-0.55, 1.14, -0.16], 0.016);
  addBox(g, palette.leaf, [-0.55, 1.16, -0.14], [0.24, 0.09, 0.14], 0.02);
  return { group: g };
}

// 4. furn-throne: Ornate High-Back Royal Sovereign Throne
export function createRoyalThrone(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const velvetMat = createMaterial('#991b1b', 0.75, 0.05);
  // Stepped dais base + gilded frame + tall gothic backrest + velvet cushions
  addBox(g, palette.stone, [0, 0.08, 0], [1.18, 0.16, 1.08], 0.02);
  addBox(g, palette.gold, [0, 0.48, 0], [0.86, 0.32, 0.78], 0.03);
  addBox(g, velvetMat, [0, 0.62, 0.02], [0.76, 0.12, 0.72], 0.03);
  addBox(g, palette.gold, [0, 1.32, -0.34], [0.88, 1.56, 0.14], 0.03);
  addBox(g, velvetMat, [0, 1.28, -0.26], [0.7, 1.28, 0.06], 0.02);
  for (const sx of [-0.42, 0.42]) {
    addBox(g, palette.gold, [sx, 0.78, 0.04], [0.12, 0.28, 0.74], 0.02);
    addRod(g, palette.gold, [sx, 0.16, -0.34], [sx, 2.24, -0.34], 0.045);
    addEll(g, palette.gold, [sx, 2.28, -0.34], [0.07, 0.1, 0.07]);
  }
  return { group: g };
}

// 5. furn-wardrobe: Tall Double-Door Wooden Wardrobe Armoire
export function createWoodenWardrobe(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  addBox(g, palette.wood, [0, 1.05, 0], [1.18, 2.02, 0.64], 0.02);
  addBox(g, palette.wood, [0, 2.1, 0], [1.28, 0.12, 0.72], 0.02);
  // Twin recessed door panels & brass handles
  for (const sx of [-0.28, 0.28]) {
    addBox(g, palette.cream, [sx, 1.18, 0.33], [0.48, 1.42, 0.03], 0.01);
  }
  addEll(g, palette.gold, [-0.07, 1.15, 0.36], [0.025, 0.06, 0.025]);
  addEll(g, palette.gold, [0.07, 1.15, 0.36], [0.025, 0.06, 0.025]);
  // Lower drawer
  addBox(g, palette.wood, [0, 0.26, 0.33], [1.04, 0.28, 0.04], 0.01);
  return { group: g };
}

// 6. furn-coffee-table: Low Glass-Top & Walnut Coffee Table
export function createCoffeeTable(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Tempered glass tabletop + wooden frame + lower magazine shelf + 4 tapered legs
  addBox(g, palette.wood, [0, 0.46, 0], [1.34, 0.06, 0.74], 0.02);
  addBox(g, palette.glass, [0, 0.48, 0], [1.22, 0.04, 0.62], 0.01);
  addBox(g, palette.wood, [0, 0.18, 0], [1.12, 0.04, 0.54], 0.01);
  for (const sx of [-0.58, 0.58]) {
    for (const sz of [-0.3, 0.3]) {
      addRod(g, palette.wood, [sx, 0, sz], [sx, 0.46, sz], 0.032);
    }
  }
  return { group: g };
}

// 7. furn-mirror-stand: Full-Length Oval Cheval Standing Mirror
export function createStandingMirror(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Twin vertical side posts with splayed feet
  for (const sx of [-0.42, 0.42]) {
    addBox(g, palette.wood, [sx, 0.05, 0], [0.08, 0.08, 0.58], 0.02);
    addRod(g, palette.wood, [sx, 0.08, 0], [sx, 1.55, 0], 0.032);
  }
  addRod(g, palette.wood, [-0.42, 0.25, 0], [0.42, 0.25, 0], 0.025);
  // Oval wooden frame + highly reflective mirror glass
  const frame = addPart(g, new THREE.TorusGeometry(0.36, 0.045, 10, 28), palette.wood, [0, 1.15, 0], [0.95, 1.75, 0.6]);
  frame.rotation.x = -0.08;
  const mirror = addPart(g, new THREE.CylinderGeometry(0.34, 0.34, 0.02, 24), palette.glass, [0, 1.15, 0], [0.95, 1, 1.75]);
  mirror.rotation.x = Math.PI / 2 - 0.08;
  return { group: g };
}

// 8. furn-grandfather-clock: Tall Longcase Grandfather Clock with Pendulum & Brass Dial
export function createGrandfatherClock(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Base plinth
  addBox(g, palette.wood, [0, 0.28, 0], [0.58, 0.56, 0.38], 0.02);
  // Central waist cabinet with glass door & swinging golden pendulum + weights
  addBox(g, palette.wood, [0, 1.05, -0.02], [0.44, 0.98, 0.3], 0.02);
  addBox(g, palette.glass, [0, 1.05, 0.14], [0.3, 0.82, 0.02], 0.005);
  addRod(g, palette.gold, [0, 1.42, 0.06], [0.05, 0.82, 0.06], 0.012);
  addEll(g, palette.gold, [0.05, 0.78, 0.06], [0.075, 0.075, 0.025]);
  // Upper clock hood + circular brass dial + hands + arched bonnet crown
  addBox(g, palette.wood, [0, 1.78, 0], [0.54, 0.52, 0.36], 0.02);
  addPart(g, new THREE.CylinderGeometry(0.2, 0.2, 0.36, 16), palette.wood, [0, 2.04, 0]).rotation.x = Math.PI / 2;
  const dial = addPart(g, new THREE.CylinderGeometry(0.18, 0.18, 0.02, 20), palette.cream, [0, 1.82, 0.19]);
  dial.rotation.x = Math.PI / 2;
  addRing(g, palette.gold, [0, 1.82, 0.19], 0.18, 0.02).rotation.y = 0;
  addBox(g, palette.iron, [0, 1.87, 0.21], [0.018, 0.11, 0.01], 0.002);
  addBox(g, palette.iron, [0.04, 1.82, 0.21], [0.08, 0.018, 0.01], 0.002);
  return { group: g };
}

// 9. furn-bar-stool: Chrome Pedestal Swivel Bar Stool
export function createBarStool(_palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const chromeMat = createMaterial('#e2e8f0', 0.18, 0.9);
  const redLeather = createMaterial('#b91c1c', 0.45, 0.1);

  // Round chrome base plate, central gas-lift column, circular footrest ring
  addPart(g, new THREE.CylinderGeometry(0.28, 0.3, 0.04, 20), chromeMat, [0, 0.02, 0]);
  addRod(g, chromeMat, [0, 0.04, 0], [0, 0.78, 0], 0.035);
  addRing(g, chromeMat, [0, 0.32, 0], 0.22, 0.016).rotation.x = Math.PI / 2;
  // Thick round cushioned seat + curved low backrest
  addPart(g, new THREE.CylinderGeometry(0.24, 0.24, 0.12, 20), redLeather, [0, 0.82, 0]);
  addBox(g, redLeather, [0, 1.02, -0.2], [0.38, 0.24, 0.07], 0.03);
  return { group: g };
}

// 10. furn-filing-cabinet: 4-Drawer Vertical Steel Office Filing Cabinet
export function createFilingCabinet(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const steelGrey = createMaterial('#64748b', 0.45, 0.6);
  addBox(g, steelGrey, [0, 0.76, 0], [0.54, 1.52, 0.68], 0.02);
  for (let i = 0; i < 4; i++) {
    const y = 0.24 + i * 0.35;
    addBox(g, palette.iron, [0, y, 0.35], [0.46, 0.3, 0.03], 0.01);
    addBox(g, palette.gold, [0, y + 0.06, 0.37], [0.12, 0.04, 0.015], 0.003);
    addBox(g, palette.cream, [0, y - 0.04, 0.37], [0.16, 0.025, 0.02], 0.003);
  }
  return { group: g };
}

// 11. furn-chandelier: Tiered Crystal & Brass Candelabra Chandelier
export function createCrystalChandelier(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Ceiling rose, suspension chain, central brass spindle & 2 concentric rings with 8 glowing candles
  addRod(g, palette.gold, [0, 0.85, 0], [0, 1.85, 0], 0.035);
  addRing(g, palette.gold, [0, 1.05, 0], 0.68, 0.028).rotation.x = Math.PI / 2;
  addRing(g, palette.gold, [0, 1.38, 0], 0.42, 0.024).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const cx = Math.cos(a) * 0.68;
    const cz = Math.sin(a) * 0.68;
    addRod(g, palette.cream, [cx, 1.05, cz], [cx, 1.24, cz], 0.022);
    addEll(g, palette.glowOrange, [cx, 1.28, cz], [0.03, 0.055, 0.03]);
    addEll(g, palette.glass, [cx * 0.85, 0.92, cz * 0.85], [0.035, 0.09, 0.035]);
  }
  return { group: g };
}

// 12. furn-bunk-bed: Double-Deck Timber Bunk Bed with Side Ladder
export function createBunkBed(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const blanketMat = createMaterial('#1d4ed8', 0.8, 0.02);
  // 4 tall corner posts
  for (const sx of [-0.52, 0.52]) {
    for (const sz of [-0.95, 0.95]) {
      addRod(g, palette.wood, [sx, 0, sz], [sx, 1.78, sz], 0.048);
    }
  }
  // Lower & upper bed frames, mattresses, blankets & pillows
  for (const y of [0.36, 1.26]) {
    addBox(g, palette.wood, [0, y, 0], [1.08, 0.1, 1.94], 0.02);
    addBox(g, palette.cream, [0, y + 0.1, 0], [0.98, 0.14, 1.82], 0.03);
    addBox(g, blanketMat, [0, y + 0.12, 0.25], [1.0, 0.15, 1.25], 0.03);
    addBox(g, palette.cream, [0, y + 0.2, -0.68], [0.58, 0.1, 0.32], 0.03);
  }
  // Upper safety guardrail & vertical access ladder on side
  addRod(g, palette.wood, [0.52, 1.56, -0.95], [0.52, 1.56, 0.45], 0.025);
  for (const lz of [0.52, 0.86]) {
    addRod(g, palette.wood, [0.56, 0.36, lz], [0.56, 1.56, lz], 0.025);
  }
  for (let r = 0.55; r <= 1.35; r += 0.26) {
    addRod(g, palette.wood, [0.56, r, 0.52], [0.56, r, 0.86], 0.02);
  }
  return { group: g };
}

// 13. furn-chaise-longue: Curved Velvet Fainting Couch Chaise Longue
export function createChaiseLongue(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const velvetMat = createMaterial('#6d28d9', 0.72, 0.05);
  // 4 gilded legs + long cushioned daybed + scrolled bolster headrest & half-backrest
  for (const sx of [-0.36, 0.36]) {
    for (const sz of [-0.78, 0.78]) {
      addRod(g, palette.gold, [sx, 0, sz], [sx, 0.22, sz], 0.032);
    }
  }
  addBox(g, velvetMat, [0, 0.34, 0], [0.82, 0.22, 1.76], 0.06);
  const head = addBox(g, velvetMat, [0, 0.64, -0.76], [0.82, 0.48, 0.26], 0.08);
  head.rotation.x = -0.35;
  addBox(g, velvetMat, [-0.36, 0.58, -0.22], [0.14, 0.34, 0.96], 0.06);
  return { group: g };
}

// 14. furn-poker-table: Octagonal Green-Felt Casino Poker Table
export function createPokerTable(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const feltGreen = createMaterial('#15803d', 0.85, 0.02);
  // Central wooden pedestal base + octagonal padded rail + green felt playing surface + brass cup holders
  addPart(g, new THREE.CylinderGeometry(0.45, 0.58, 0.1, 8), palette.wood, [0, 0.05, 0]);
  addPart(g, new THREE.CylinderGeometry(0.22, 0.26, 0.68, 8), palette.wood, [0, 0.42, 0]);
  addPart(g, new THREE.CylinderGeometry(0.98, 0.98, 0.1, 8), palette.iron, [0, 0.78, 0]);
  addPart(g, new THREE.CylinderGeometry(0.82, 0.82, 0.04, 8), feltGreen, [0, 0.82, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    addPart(g, new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12), palette.gold, [Math.cos(a) * 0.86, 0.84, Math.sin(a) * 0.86]);
  }
  return { group: g };
}

// 15. furn-art-easel: Wooden A-Frame Studio Artist Easel with Painted Canvas
export function createArtistEasel(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // 3 Tripod wooden legs + horizontal canvas tray shelf + framed canvas board
  addRod(g, palette.wood, [-0.42, 0, 0.18], [0, 1.82, -0.08], 0.028);
  addRod(g, palette.wood, [0.42, 0, 0.18], [0, 1.82, -0.08], 0.028);
  addRod(g, palette.wood, [0, 0, -0.58], [0, 1.82, -0.08], 0.028);
  addBox(g, palette.wood, [0, 0.78, 0.12], [0.88, 0.05, 0.12], 0.01);
  const canvas = addBox(g, palette.cream, [0, 1.18, 0.08], [0.82, 0.72, 0.04], 0.008);
  canvas.rotation.x = -0.14;
  return { group: g };
}

// 16. furn-workbench: Heavy Industrial Garage Workbench with Vise & Pegboard
export function createIndustrialWorkbench(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const viseBlue = createMaterial('#1d4ed8', 0.4, 0.6);
  // 4 heavy steel legs + lower shelf + thick butcher-block hardwood top + rear pegboard + bench vise
  for (const sx of [-0.76, 0.76]) {
    for (const sz of [-0.36, 0.36]) {
      addBox(g, palette.iron, [sx, 0.42, sz], [0.07, 0.84, 0.07], 0.01);
    }
  }
  addBox(g, palette.iron, [0, 0.22, 0], [1.56, 0.04, 0.74], 0.01);
  addBox(g, palette.wood, [0, 0.86, 0], [1.68, 0.08, 0.84], 0.02);
  addBox(g, palette.wood, [0, 1.38, -0.39], [1.64, 0.96, 0.04], 0.01);
  addBox(g, viseBlue, [-0.58, 0.96, 0.38], [0.22, 0.14, 0.26], 0.02);
  return { group: g };
}

// 17. furn-podium: Conference Speaker Podium Lectern with Microphones
export function createSpeakerPodium(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Stepped base + tapered wooden column + slanted reading desk + crest plaque + twin gooseneck mics
  addBox(g, palette.wood, [0, 0.06, 0], [0.68, 0.12, 0.58], 0.02);
  addBox(g, palette.wood, [0, 0.62, 0], [0.54, 1.02, 0.44], 0.02);
  const top = addBox(g, palette.wood, [0, 1.16, 0.02], [0.68, 0.08, 0.56], 0.02);
  top.rotation.x = 0.25;
  addPart(g, new THREE.CylinderGeometry(0.14, 0.14, 0.03, 16), palette.gold, [0, 0.86, 0.23]).rotation.x = Math.PI / 2;
  for (const sx of [-0.16, 0.16]) {
    addRod(g, palette.iron, [sx, 1.18, -0.12], [sx * 0.6, 1.38, 0.08], 0.01);
  }
  return { group: g };
}

// ============================================================================
// PROPS
// ============================================================================

// 18. prop-camera-dolly: Cinema Film Camera on Wheeled Track Dolly
export function createCameraDolly(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Dolly platform with 4 track wheels & push handle
  addBox(g, palette.iron, [0, 0.14, 0], [0.92, 0.08, 1.12], 0.02);
  for (const sx of [-0.42, 0.42]) {
    for (const sz of [-0.46, 0.46]) {
      addPart(g, new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), palette.iron, [sx, 0.1, sz]).rotation.z = Math.PI / 2;
    }
  }
  // Central hydraulic pedestal column + cinema camera body + dual top 35mm film magazines + matte box lens
  addPart(g, new THREE.CylinderGeometry(0.09, 0.12, 0.88, 14), palette.iron, [0, 0.62, 0.05]);
  addBox(g, palette.iron, [0, 1.16, 0.05], [0.26, 0.28, 0.44], 0.02);
  for (const z of [-0.08, 0.18]) {
    addPart(g, new THREE.CylinderGeometry(0.15, 0.15, 0.08, 18), palette.iron, [0, 1.42, z]).rotation.z = Math.PI / 2;
  }
  addBox(g, palette.iron, [0, 1.16, 0.36], [0.28, 0.22, 0.16], 0.01);
  return { group: g };
}

// 19. prop-chest / prop-treasure-chest: Domed Pirate Treasure Chest with Iron Bands & Gold Lock
export function createTreasureChest(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Rectangular wooden chest box + domed barrel lid + 3 iron strapping bands + gold lock plate
  addBox(g, palette.wood, [0, 0.26, 0], [0.96, 0.52, 0.62], 0.02);
  const lid = addPart(g, new THREE.CylinderGeometry(0.31, 0.31, 0.96, 16, 1, false, 0, Math.PI), palette.wood, [0, 0.52, 0]);
  lid.rotation.z = Math.PI / 2;
  for (const x of [-0.38, 0, 0.38]) {
    addBox(g, palette.iron, [x, 0.26, 0], [0.06, 0.54, 0.65], 0.01);
    const band = addPart(g, new THREE.CylinderGeometry(0.325, 0.325, 0.06, 16), palette.iron, [x, 0.52, 0]);
    band.rotation.z = Math.PI / 2;
  }
  addBox(g, palette.gold, [0, 0.48, 0.33], [0.16, 0.22, 0.04], 0.01);
  return { group: g };
}

// 20. prop-chalice: Ornate Jeweled Golden Royal Chalice Goblet
export function createGoldenChalice(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const rubyMat = createMaterial('#dc2626', 0.15, 0.2);
  // Flared circular base, knopped stem, deep hemispherical cup, and ruby cabochons
  addPart(g, new THREE.CylinderGeometry(0.12, 0.34, 0.14, 20), palette.gold, [0, 0.07, 0]);
  addPart(g, new THREE.CylinderGeometry(0.065, 0.065, 0.48, 16), palette.gold, [0, 0.38, 0]);
  addEll(g, palette.gold, [0, 0.38, 0], [0.13, 0.09, 0.13]);
  addPart(g, new THREE.CylinderGeometry(0.36, 0.14, 0.52, 20), palette.gold, [0, 0.86, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    addEll(g, rubyMat, [Math.cos(a) * 0.28, 0.88, Math.sin(a) * 0.28], [0.04, 0.05, 0.04]);
  }
  return { group: g };
}

// 21. prop-mug: Glazed Ceramic Coffee Mug with Handle
export function createCoffeeMug(_palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const mugMat = createMaterial('#f8fafc', 0.25, 0.05);
  const coffeeMat = createMaterial('#291509', 0.15, 0.05);
  addPart(g, new THREE.CylinderGeometry(0.34, 0.32, 0.78, 24), mugMat, [0, 0.39, 0]);
  addPart(g, new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), coffeeMat, [0, 0.74, 0]);
  const handle = addPart(g, new THREE.TorusGeometry(0.22, 0.048, 10, 20, Math.PI), mugMat, [0.33, 0.4, 0]);
  handle.rotation.z = -Math.PI / 2;
  return { group: g };
}

// 22. prop-pocket-watch: Vintage Gold Pocket Watch with Roman Dial & Chain
export function createPocketWatch(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Standing circular gold case + cream dial + black hands + top winding crown & bow ring
  const caseBody = addPart(g, new THREE.CylinderGeometry(0.46, 0.46, 0.14, 28), palette.gold, [0, 0.48, 0]);
  caseBody.rotation.x = Math.PI / 2;
  const dial = addPart(g, new THREE.CylinderGeometry(0.38, 0.38, 0.16, 24), palette.cream, [0, 0.48, 0]);
  dial.rotation.x = Math.PI / 2;
  addBox(g, palette.iron, [0, 0.58, 0.09], [0.025, 0.22, 0.02], 0.002);
  addBox(g, palette.iron, [0.08, 0.48, 0.09], [0.16, 0.025, 0.02], 0.002);
  addPart(g, new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), palette.gold, [0, 0.98, 0]);
  addRing(g, palette.gold, [0, 1.08, 0], 0.11, 0.02).rotation.y = 0;
  return { group: g };
}

// 23. prop-clapperboard / prop-clapboard: Cinema Director Slate Clapperboard
export function createClapperboard(_palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const slateMat = createMaterial('#0f172a', 0.65, 0.05);
  const whiteMat = createMaterial('#f8fafc', 0.5, 0.05);
  // Black acrylic slate board + white lines + hinged upper clapstick with diagonal stripes
  addBox(g, slateMat, [0, 0.44, 0], [1.08, 0.78, 0.05], 0.01);
  addBox(g, whiteMat, [0, 0.52, 0.03], [0.96, 0.02, 0.01], 0.002);
  addBox(g, whiteMat, [0, 0.32, 0.03], [0.96, 0.02, 0.01], 0.002);
  addBox(g, slateMat, [0, 0.86, 0], [1.08, 0.09, 0.055], 0.01);
  const stick = new THREE.Group();
  stick.position.set(-0.54, 0.91, 0);
  stick.rotation.z = 0.28;
  g.add(stick);
  addBox(stick, slateMat, [0.54, 0.045, 0], [1.08, 0.09, 0.055], 0.01);
  for (let s = 0; s < 5; s++) {
    addBox(stick, whiteMat, [0.15 + s * 0.2, 0.045, 0], [0.09, 0.092, 0.06], 0.005);
  }
  return { group: g };
}

// 24. prop-telephone: Classic Black Rotary Dial Desk Telephone
export function createRotaryTelephone(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const bakelite = createMaterial('#0f172a', 0.25, 0.15);
  // Sloped pyramidal base + circular white rotary dial + cradle prongs + handset barbell
  addBox(g, bakelite, [0, 0.18, 0], [0.76, 0.34, 0.68], 0.06);
  const dial = addPart(g, new THREE.CylinderGeometry(0.18, 0.18, 0.03, 20), palette.cream, [0, 0.32, 0.16]);
  dial.rotation.x = 0.65;
  addRod(g, palette.iron, [-0.16, 0.34, -0.08], [-0.16, 0.46, -0.08], 0.025);
  addRod(g, palette.iron, [0.16, 0.34, -0.08], [0.16, 0.46, -0.08], 0.025);
  addRod(g, bakelite, [-0.36, 0.48, -0.08], [0.36, 0.48, -0.08], 0.042);
  addEll(g, bakelite, [-0.36, 0.44, -0.08], [0.11, 0.09, 0.11]);
  addEll(g, bakelite, [0.36, 0.44, -0.08], [0.11, 0.09, 0.11]);
  return { group: g };
}

// 25. prop-compass: Brass Nautical Pocket Compass with Magnetic Needle
export function createNauticalCompass(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const redNeedle = createMaterial('#dc2626', 0.3, 0.3);
  // Flat cylindrical brass housing + cream compass rose face + red/iron magnetic needle + glass cover
  addPart(g, new THREE.CylinderGeometry(0.56, 0.58, 0.18, 28), palette.gold, [0, 0.09, 0]);
  addPart(g, new THREE.CylinderGeometry(0.48, 0.48, 0.03, 24), palette.cream, [0, 0.18, 0]);
  addBox(g, redNeedle, [0, 0.21, 0.18], [0.06, 0.02, 0.36], 0.005);
  addBox(g, palette.iron, [0, 0.21, -0.18], [0.06, 0.02, 0.36], 0.005);
  addRing(g, palette.gold, [0, 0.12, -0.66], 0.1, 0.022).rotation.x = Math.PI / 2;
  return { group: g };
}

// 26. prop-film-projector: Vintage Twin-Reel 35mm Cinema Film Projector
export function createFilmProjector(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Pedestal base + projector mechanism housing + lens barrel + upper & lower film reels
  addBox(g, palette.iron, [0, 0.08, 0], [0.58, 0.16, 0.68], 0.02);
  addBox(g, palette.iron, [0, 0.62, 0], [0.32, 0.56, 0.48], 0.03);
  const lens = addPart(g, new THREE.CylinderGeometry(0.08, 0.1, 0.34, 16), palette.gold, [0, 0.68, 0.36]);
  lens.rotation.x = Math.PI / 2;
  for (const [ry, rz] of [
    [1.16, -0.18],
    [1.04, 0.28],
  ]) {
    addRod(g, palette.iron, [0, 0.85, 0], [0, ry, rz], 0.025);
    const reel = addPart(g, new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20), palette.gold, [0, ry, rz]);
    reel.rotation.z = Math.PI / 2;
  }
  return { group: g };
}

// 27. prop-decanter: Cut-Crystal Carafe Decanter with Faceted Stopper
export function createCrystalDecanter(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const amberLiquid = createMaterial('#d97706', 0.15, 0.1);
  // Faceted crystal body + glowing amber whiskey/elixir core + slender neck + diamond stopper
  addPart(g, new THREE.CylinderGeometry(0.14, 0.38, 0.68, 8), palette.glass, [0, 0.34, 0]);
  addPart(g, new THREE.CylinderGeometry(0.2, 0.33, 0.42, 8), amberLiquid, [0, 0.24, 0]);
  addPart(g, new THREE.CylinderGeometry(0.11, 0.14, 0.28, 8), palette.glass, [0, 0.82, 0]);
  addPart(g, new THREE.OctahedronGeometry(0.14, 0), palette.glass, [0, 1.06, 0]);
  return { group: g };
}

// 28. prop-anvil: Forged Iron Blacksmith Anvil on Timber Block
export function createBlacksmithAnvil(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Heavy timber stump base + flared anvil foot + waist + flat top working face + conical horn
  addPart(g, new THREE.CylinderGeometry(0.42, 0.46, 0.56, 14), palette.wood, [0, 0.28, 0]);
  addBox(g, palette.iron, [0, 0.62, 0], [0.46, 0.12, 0.64], 0.02);
  addBox(g, palette.iron, [0, 0.78, 0], [0.28, 0.24, 0.44], 0.02);
  addBox(g, palette.iron, [0, 0.96, -0.06], [0.34, 0.16, 0.76], 0.02);
  const horn = addPart(g, new THREE.ConeGeometry(0.14, 0.46, 14), palette.iron, [0, 0.96, 0.52]);
  horn.rotation.x = Math.PI / 2;
  return { group: g };
}

// 29. prop-megaphone: Handheld Bullhorn Megaphone with Pistol Grip
export function createMegaphone(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const redTrim = createMaterial('#dc2626', 0.35, 0.2);
  // Flared acoustic cone + red front bumper ring + rear mouthpiece + ergonomic pistol grip
  const cone = addPart(g, new THREE.CylinderGeometry(0.38, 0.12, 0.88, 20), palette.cream, [0, 0.56, 0.06]);
  cone.rotation.x = Math.PI / 2;
  addRing(g, redTrim, [0, 0.56, 0.5], 0.38, 0.03).rotation.y = 0;
  addBox(g, redTrim, [0, 0.28, -0.18], [0.08, 0.34, 0.12], 0.02);
  return { group: g };
}

// 30. prop-gramophone: Vintage Turntable Phonograph with Flared Brass Horn
export function createGramophone(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const vinylMat = createMaterial('#09090b', 0.2, 0.3);
  // Carved wooden cabinet + black vinyl record platter + curved neck + flared brass morning-glory horn
  addBox(g, palette.wood, [0, 0.24, 0], [0.76, 0.44, 0.76], 0.03);
  addPart(g, new THREE.CylinderGeometry(0.3, 0.3, 0.03, 24), vinylMat, [0, 0.48, 0]);
  addRod(g, palette.gold, [0, 0.46, -0.32], [0, 0.92, -0.26], 0.035);
  const horn = addPart(g, new THREE.ConeGeometry(0.44, 0.78, 16, 1, true), palette.gold, [0, 1.06, 0.12]);
  horn.rotation.x = -Math.PI * 0.42;
  return { group: g };
}

// 31. prop-hourglass: Brass Three-Pillar Sand Timer Hourglass
export function createBrassHourglass(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  // Top & bottom circular brass plates + 3 vertical spindles + twin glass cones & golden sand
  addPart(g, new THREE.CylinderGeometry(0.42, 0.42, 0.07, 20), palette.gold, [0, 0.04, 0]);
  addPart(g, new THREE.CylinderGeometry(0.42, 0.42, 0.07, 20), palette.gold, [0, 1.16, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    addRod(g, palette.gold, [Math.cos(a) * 0.35, 0.06, Math.sin(a) * 0.35], [Math.cos(a) * 0.35, 1.14, Math.sin(a) * 0.35], 0.024);
  }
  const lowerBulb = addPart(g, new THREE.ConeGeometry(0.28, 0.52, 18), palette.glass, [0, 0.34, 0]);
  lowerBulb.rotation.z = 0;
  const upperBulb = addPart(g, new THREE.ConeGeometry(0.28, 0.52, 18), palette.glass, [0, 0.86, 0]);
  upperBulb.rotation.z = Math.PI;
  addPart(g, new THREE.ConeGeometry(0.22, 0.28, 16), palette.gold, [0, 0.22, 0]);
  return { group: g };
}

// 32. prop-traffic-light: Street Intersection 3-Aspect R/Y/G Traffic Signal
export function createTrafficLight(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const housingYellow = createMaterial('#eab308', 0.38, 0.3);
  const redLight = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const amberLight = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const greenLight = new THREE.MeshBasicMaterial({ color: 0x22c55e });

  // Base flange, steel pole, yellow signal housing box & Red/Yellow/Green lenses
  addPart(g, new THREE.CylinderGeometry(0.26, 0.32, 0.14, 14), palette.iron, [0, 0.07, 0]);
  addRod(g, palette.iron, [0, 0.1, 0], [0, 2.35, 0], 0.055);
  addBox(g, housingYellow, [0, 1.88, 0.14], [0.34, 0.86, 0.28], 0.03);
  addEll(g, redLight, [0, 2.14, 0.29], [0.09, 0.09, 0.03]);
  addEll(g, amberLight, [0, 1.88, 0.29], [0.09, 0.09, 0.03]);
  addEll(g, greenLight, [0, 1.62, 0.29], [0.09, 0.09, 0.03]);
  return { group: g };
}

// 33. prop-parking-meter: Roadside Cast-Iron Coin Parking Meter
export function createParkingMeter(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const redFlag = createMaterial('#dc2626', 0.35, 0.1);
  addPart(g, new THREE.CylinderGeometry(0.2, 0.24, 0.1, 14), palette.iron, [0, 0.05, 0]);
  addRod(g, palette.iron, [0, 0.08, 0], [0, 1.15, 0], 0.042);
  addBox(g, palette.iron, [0, 1.34, 0], [0.26, 0.38, 0.16], 0.03);
  addPart(g, new THREE.SphereGeometry(0.13, 14, 10), palette.glass, [0, 1.54, 0]);
  addBox(g, redFlag, [0, 1.54, 0], [0.16, 0.09, 0.02], 0.005);
  return { group: g };
}

// 34. prop-satellite-dish: Parabolic Rooftop Satellite Dish Antenna
export function createSatelliteDish(palette: ProceduralPalette): ProceduralKitResult {
  const g = new THREE.Group();
  const dishWhite = createMaterial('#f1f5f9', 0.35, 0.35);
  // Tripod base + elevation mount + parabolic dish bowl + tri-strut LNB feedhorn arm
  addPart(g, new THREE.CylinderGeometry(0.12, 0.38, 0.56, 12), palette.iron, [0, 0.28, 0]);
  const dishGroup = new THREE.Group();
  dishGroup.position.set(0, 0.78, 0);
  dishGroup.rotation.x = -0.52;
  g.add(dishGroup);
  addPart(dishGroup, new THREE.SphereGeometry(0.76, 20, 14, 0, TAU, 0, 0.72), dishWhite, [0, -0.52, 0]);
  addRod(dishGroup, palette.iron, [0, 0.18, 0], [0, 0.68, 0], 0.02);
  addEll(dishGroup, palette.gold, [0, 0.7, 0], [0.06, 0.08, 0.06]);
  return { group: g };
}

