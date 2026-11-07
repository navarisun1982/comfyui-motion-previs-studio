import * as THREE from 'three';
import { EnvironmentSpec } from '../../types/shotspec';
import { createBrickCanvasTexture, createWoodParquetCanvasTexture } from './stageTextures';
import { lookupCuratedPartGraph, buildPartGraph } from '../procedural3D/partGraph';

/**
 * Recursively sets the Three.js render layer on an Object3D hierarchy
 */
export function setLayerRecursively(obj: THREE.Object3D, layer: number): void {
  obj.layers.set(layer);
  obj.children.forEach((child) => setLayerRecursively(child, layer));
}

/**
 * Configures the stage ground floor material based on environment surface type
 */
export function applyGroundSurface(floorMesh: THREE.Mesh, surface: string = 'studio-floor'): void {
  const floorMat = floorMesh.material as THREE.MeshStandardMaterial;
  if (!floorMat) return;

  switch (surface) {
    case 'asphalt-wet':
      floorMat.color.set(0x283142);
      floorMat.map = null;
      floorMat.roughness = 0.18;
      floorMat.metalness = 0.45;
      break;
    case 'concrete-floor':
      floorMat.color.set(0x3a4354);
      floorMat.map = null;
      floorMat.roughness = 0.88;
      floorMat.metalness = 0.12;
      break;
    case 'stone-cobblestone':
      floorMat.color.set(0x4a433b);
      floorMat.map = null;
      floorMat.roughness = 0.82;
      floorMat.metalness = 0.08;
      break;
    case 'sand-dunes':
      floorMat.color.set(0xbfa06a);
      floorMat.map = null;
      floorMat.roughness = 0.96;
      floorMat.metalness = 0.02;
      break;
    case 'grass-terrain':
      floorMat.color.set(0x2d4a29);
      floorMat.map = null;
      floorMat.roughness = 0.92;
      floorMat.metalness = 0.04;
      break;
    case 'metal-grate':
      floorMat.color.set(0x313f54);
      floorMat.map = null;
      floorMat.roughness = 0.32;
      floorMat.metalness = 0.85;
      break;
    case 'wood-parquet':
      floorMat.color.set(0x3e2114);
      floorMat.map = createWoodParquetCanvasTexture();
      floorMat.roughness = 0.22;
      floorMat.metalness = 0.18;
      break;
    case 'studio-floor':
    default:
      floorMat.color.set(0x22293a);
      floorMat.map = null;
      floorMat.roughness = 0.85;
      floorMat.metalness = 0.15;
      break;
  }
  floorMat.needsUpdate = true;
}

export interface EnvironmentBuildOptions {
  sceneDescription?: string;
  actors?: Array<{
    name: string;
    token?: string;
    kind?: string;
    trajectory?: {
      startPosition?: { x: number; y: number; z?: number };
      endPosition?: { x: number; y: number; z?: number };
    };
  }>;
}

export interface SemanticEnvironmentBiome {
  category: string;
  groundSurface: string;
  skyColor: string;
  fogColor: string;
}

/**
 * Infers the optimal 3D Previs biome, ground surface, and atmospheric horizon colors
 * from the shot's EnvironmentSpec, scene description, and active actors so that
 * outdoor/forest/desert/urban scenes automatically get matching 3D parallax geometry
 * instead of grey studio walls.
 */
export function inferSemanticEnvironmentBiome(
  env?: EnvironmentSpec,
  options: EnvironmentBuildOptions = {}
): SemanticEnvironmentBiome {
  const rawCat = (env?.category || 'interior-studio').toLowerCase();
  const rawGround = env?.groundSurface || 'studio-floor';
  const rawSky = env?.skyColor || '#08090c';
  const rawFog = env?.fogColor || '#08090c';
  const isDefaultGround = rawGround === 'studio-floor';
  const isDefaultSky = /^#0[789]0[89ab][01][0-9a-f]$/i.test(rawSky.trim());

  const isDefaultStudioCategory = rawCat === 'interior-studio' || rawCat === 'studio';

  if (!isDefaultStudioCategory) {
    if (rawCat.includes('nature') || rawCat.includes('forest')) {
      return {
        category: 'nature',
        groundSurface: isDefaultGround ? 'grass-terrain' : rawGround,
        skyColor: isDefaultSky ? '#132433' : rawSky,
        fogColor: isDefaultSky ? '#162822' : rawFog,
      };
    }
    if (rawCat.includes('desert') || rawCat.includes('wasteland')) {
      return {
        category: 'desert',
        groundSurface: isDefaultGround ? 'sand-dunes' : rawGround,
        skyColor: isDefaultSky ? '#2b1f14' : rawSky,
        fogColor: isDefaultSky ? '#3a2818' : rawFog,
      };
    }
    if (rawCat.includes('urban')) {
      return {
        category: 'urban',
        groundSurface: isDefaultGround ? 'asphalt-wet' : rawGround,
        skyColor: isDefaultSky ? '#0c1322' : rawSky,
        fogColor: isDefaultSky ? '#0f172a' : rawFog,
      };
    }
    if (rawCat.includes('historical') || rawCat.includes('castle')) {
      return {
        category: 'historical',
        groundSurface: isDefaultGround ? 'stone-cobblestone' : rawGround,
        skyColor: isDefaultSky ? '#18161b' : rawSky,
        fogColor: isDefaultSky ? '#1c1917' : rawFog,
      };
    }
    if (rawCat.includes('scifi')) {
      return {
        category: 'scifi',
        groundSurface: isDefaultGround ? 'metal-grate' : rawGround,
        skyColor: isDefaultSky ? '#070b14' : rawSky,
        fogColor: isDefaultSky ? '#090d16' : rawFog,
      };
    }
    return {
      category: rawCat,
      groundSurface: rawGround,
      skyColor: rawSky,
      fogColor: rawFog,
    };
  }

  const combinedText = `${options.sceneDescription || ''} ${env?.promptDescription || ''} ${env?.name || ''} ${env?.conceptImageName || ''}`.toLowerCase();
  const isDefaultSoundstageDesc =
    combinedText.includes('soundstage studio') ||
    combinedText.includes('cyclorama floor') ||
    combinedText.includes('moody atmospheric interior with subtle dust motes');
  const searchText = isDefaultSoundstageDesc
    ? `${options.sceneDescription || ''} ${env?.name || ''} ${env?.conceptImageName || ''}`.toLowerCase()
    : combinedText;

  if (
    /\b(forest|woods|woodland|jungle|trees|canopy|pine|redwood|meadow|valley|mountain|mountains|cliff|peak|river|lake|waterfall|nature|grass|park|island|savanna|غابة|أشجار|شجر|جبل|جبال|وادي|نهر|بحيرة|طبيعة|حديقة)\b/i.test(
      searchText
    )
  ) {
    return {
      category: 'nature',
      groundSurface: isDefaultGround ? 'grass-terrain' : rawGround,
      skyColor: isDefaultSky ? '#132433' : rawSky,
      fogColor: isDefaultSky ? '#162822' : rawFog,
    };
  }

  if (
    /\b(desert|dunes|canyon|wasteland|sahara|mesa|oasis|arid|sand|صحراء|كثبان|رمال)\b/i.test(
      searchText
    )
  ) {
    return {
      category: 'desert',
      groundSurface: isDefaultGround ? 'sand-dunes' : rawGround,
      skyColor: isDefaultSky ? '#2b1f14' : rawSky,
      fogColor: isDefaultSky ? '#3a2818' : rawFog,
    };
  }

  if (
    /\b(urban|city|cityscape|street|downtown|cyberpunk|highway|road|alley|rooftop|skyscraper|neon|traffic|bridge|مدينة|شارع|طريق|كوبري)\b/i.test(
      searchText
    )
  ) {
    return {
      category: 'urban',
      groundSurface: isDefaultGround ? 'asphalt-wet' : rawGround,
      skyColor: isDefaultSky ? '#0c1322' : rawSky,
      fogColor: isDefaultSky ? '#0f172a' : rawFog,
    };
  }

  if (
    /\b(castle|medieval|temple|ruins|fortress|courtyard|palace|cathedral|ancient|قلعة|معبد|حصن|قصر)\b/i.test(
      searchText
    )
  ) {
    return {
      category: 'historical',
      groundSurface: isDefaultGround ? 'stone-cobblestone' : rawGround,
      skyColor: isDefaultSky ? '#18161b' : rawSky,
      fogColor: isDefaultSky ? '#1c1917' : rawFog,
    };
  }

  if (
    /\b(scifi|sci-fi|spaceship|starship|orbital|space|galaxy|nebula|station|hangar|bunker|laboratory|cyber|فضاء|مركبة|محطة|مختبر)\b/i.test(
      searchText
    )
  ) {
    return {
      category: 'scifi',
      groundSurface: isDefaultGround ? 'metal-grate' : rawGround,
      skyColor: isDefaultSky ? '#070b14' : rawSky,
      fogColor: isDefaultSky ? '#090d16' : rawFog,
    };
  }

  if (
    /\b(room|cabin|hearth|fireplace|study|library|salon|apartment|bedroom|kitchen|office|parlor|mansion|hallway|corridor|غرفة|مكتب|منزل|مدفأة|صالة|غرفه)\b/i.test(
      searchText
    )
  ) {
    return {
      category: 'interior-room',
      groundSurface: isDefaultGround ? 'wood-parquet' : rawGround,
      skyColor: rawSky,
      fogColor: rawFog,
    };
  }

  const hasAerialOrFlyingActor = (options.actors || []).some((a) => {
    const actorSig = `${a.name || ''} ${a.token || ''} ${a.kind || ''}`.toLowerCase();
    const isFlyingType =
      a.kind === 'aircraft' ||
      a.kind === 'spaceship' ||
      /\b(helicopter|chopper|airplane|plane|jet|fighter|drone|quadcopter|spaceship|starship|saucer|ufo|eagle|hawk|falcon|dragon|pegasus|parachute|rocket|missile)\b/i.test(
        actorSig
      );
    const startZ = a.trajectory?.startPosition?.z ?? 0;
    const endZ = a.trajectory?.endPosition?.z ?? 0;
    return isFlyingType || startZ >= 5 || endZ >= 5;
  });

  if (hasAerialOrFlyingActor) {
    return {
      category: 'nature',
      groundSurface: isDefaultGround ? 'grass-terrain' : rawGround,
      skyColor: isDefaultSky ? '#132433' : rawSky,
      fogColor: isDefaultSky ? '#162822' : rawFog,
    };
  }

  return {
    category: 'soundstage-studio',
    groundSurface: rawGround,
    skyColor: rawSky,
    fogColor: rawFog,
  };
}

export interface PrevisStageBackdropDecision {
  mode: 'auto' | 'hide-stage' | 'show-stage';
  hide: boolean;
  reason: string;
}

/**
 * Determines whether the 3D environment and ground plane are visible in `<Video 1>` Previs renders.
 * In 'auto' mode, the 3D biome and ground parallax stay VISIBLE (`hide: false`) so video diffusion
 * engines (MiniMax H3 & LTX-2.5) receive continuous 3D optical flow parallax and horizon perspective
 * for accurate camera motion tracking. Users can manually select 'hide-stage' (Clean BG) if desired.
 */
export function shouldHideStageBackdropInPrevis(shot: {
  environment?: EnvironmentSpec;
  sceneDescription?: string;
  actors?: Array<{
    name: string;
    token?: string;
    kind?: string;
    trajectory?: {
      startPosition?: { x: number; y: number; z?: number };
      endPosition?: { x: number; y: number; z?: number };
    };
  }>;
}): PrevisStageBackdropDecision {
  const env = shot.environment;
  const explicitMode =
    env?.previsStageMode ?? (env?.visibleInPrevis === false ? 'hide-stage' : 'auto');

  if (explicitMode === 'hide-stage') {
    return {
      mode: 'hide-stage',
      hide: true,
      reason: 'Manual: Clean BG',
    };
  }

  if (explicitMode === 'show-stage') {
    return {
      mode: 'show-stage',
      hide: false,
      reason: 'Manual: 3D Stage Visible',
    };
  }

  return {
    mode: 'auto',
    hide: false,
    reason: 'Auto: 3D Biome & Parallax',
  };
}

/**
 * Builds the perimeter environmental architecture (Urban, Sci-Fi, Historical Castle, Nature Forest, Desert, Interior Cabin/Hearth, or Soundstage Studio)
 */
export function buildPerimeterEnvironment(
  envGroup: THREE.Group,
  env?: EnvironmentSpec,
  options: EnvironmentBuildOptions = {}
): void {
  envGroup.clear();
  const inferred = inferSemanticEnvironmentBiome(env, options);
  const rawCat = inferred.category.toLowerCase();

  if (rawCat.includes('urban')) {
    // Urban Cityscape: Distant Skyline Silhouettes, Illuminated Signs & Streetlamps
    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.75,
      metalness: 0.35,
    });
    const neonMats = [
      new THREE.MeshBasicMaterial({ color: 0x06b6d4 }), // Cyan
      new THREE.MeshBasicMaterial({ color: 0xec4899 }), // Magenta
      new THREE.MeshBasicMaterial({ color: 0xf59e0b }), // Amber
    ];

    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const dist = 54 + (i % 3) * 7;
      const w = 9 + (i % 4) * 3;
      const h = 28 + (i % 5) * 10;
      const d = 9 + (i % 3) * 2;

      const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bldgMat);
      bldg.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
      bldg.lookAt(0, h / 2, 0);
      envGroup.add(bldg);

      // Rooftop neon crown
      const neonMat = neonMats[i % neonMats.length];
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.6, 0.6), neonMat);
      strip.position.set(Math.cos(angle) * dist, h - 0.3, Math.sin(angle) * dist);
      strip.lookAt(0, h, 0);
      envGroup.add(strip);
    }

    // Perimeter Streetlights (4 points around stage corners)
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
    [
      { x: -45, z: -45 },
      { x: 45, z: -45 },
      { x: -45, z: 45 },
      { x: 45, z: 45 },
    ].forEach((pt) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 14, 8), poleMat);
      pole.position.set(pt.x, 7, pt.z);
      envGroup.add(pole);

      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 12), lampGlowMat);
      bulb.position.set(pt.x, 14, pt.z);
      envGroup.add(bulb);
    });
  } else if (rawCat.includes('scifi')) {
    // Sci-Fi Orbital Station Bay: Massive Torus Bulkheads & Glowing Plasma Conduits
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x243046,
      metalness: 0.85,
      roughness: 0.25,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const warningMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    for (let i = 0; i < 7; i++) {
      const z = -48 + i * 16;
      const ringGeo = new THREE.TorusGeometry(34, 1.4, 8, 28, Math.PI);
      const ring = new THREE.Mesh(ringGeo, frameMat);
      ring.position.set(0, 0, z);
      ring.rotation.z = Math.PI;
      envGroup.add(ring);

      const glowRing = new THREE.Mesh(new THREE.TorusGeometry(33.5, 0.25, 8, 28, Math.PI), glowMat);
      glowRing.position.set(0, 0, z);
      glowRing.rotation.z = Math.PI;
      envGroup.add(glowRing);
    }

    // 4 Heavy Vertical Support Gantries with Hazard Markings
    [-48, 48].forEach((x) => {
      [-35, 0, 35].forEach((z) => {
        const col = new THREE.Mesh(new THREE.BoxGeometry(3, 26, 3), frameMat);
        col.position.set(x, 13, z);
        envGroup.add(col);

        const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.8, 3.1), warningMat);
        stripe.position.set(x, 2, z);
        envGroup.add(stripe);
      });
    });
  } else if (rawCat.includes('historical') || rawCat.includes('castle')) {
    // Medieval Castle Courtyard: Towering Stone Walls, Watchtower Bastions & Torches
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x44403c,
      roughness: 0.95,
      metalness: 0.05,
    });
    const torchMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const x = Math.cos(angle) * 52;
      const z = Math.sin(angle) * 52;

      // Crenelated Bastion Tower
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 22, 12), stoneMat);
      tower.position.set(x, 11, z);
      envGroup.add(tower);

      // Tower Parapet Top
      const top = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.2, 2.5, 12), stoneMat);
      top.position.set(x, 22.5, z);
      envGroup.add(top);

      // Torch Fire Sconce
      const torch = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), torchMat);
      torch.position.set(x * 0.92, 12, z * 0.92);
      envGroup.add(torch);

      // Curtain Wall Spanning Between Bastions
      const nextAngle = ((i + 1) / 10) * Math.PI * 2;
      const midX = (Math.cos(angle) + Math.cos(nextAngle)) * 0.5 * 52;
      const midZ = (Math.sin(angle) + Math.sin(nextAngle)) * 0.5 * 52;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 2.2), stoneMat);
      wall.position.set(midX, 7, midZ);
      wall.lookAt(0, 7, 0);
      envGroup.add(wall);
    }
  } else if (rawCat.includes('nature') || rawCat.includes('forest')) {
    // Redwood Forest Clearing: Rolling Terrain Mounds & Towering Conifer Trees
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x152414,
      roughness: 0.96,
      metalness: 0.0,
    });
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x2e1a0f,
      roughness: 0.9,
    });
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0x0f2c12,
      roughness: 0.85,
    });

    // Mounds
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const dist = 50 + (i % 3) * 6;
      const rad = 14 + (i % 3) * 5;
      const mound = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hillMat);
      mound.position.set(Math.cos(angle) * dist, -2, Math.sin(angle) * dist);
      mound.scale.set(1.6, 0.45, 1.6);
      envGroup.add(mound);
    }

    // Redwood / Pine Trees (Outer Horizon Ring)
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const dist = 46 + (i % 4) * 6;
      const tx = Math.cos(angle) * dist;
      const tz = Math.sin(angle) * dist;

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, 16, 8), trunkMat);
      trunk.position.set(tx, 8, tz);
      envGroup.add(trunk);

      for (let j = 0; j < 3; j++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(5 - j * 1.1, 8, 8), foliageMat);
        cone.position.set(tx, 14 + j * 5, tz);
        envGroup.add(cone);
      }
    }

    // Midground Parallax Trees & Forest Boulders (multi-depth z layers around clear central flight/action corridor)
    const midTreeCoords: Array<{ x: number; z: number; scale: number }> = [
      { x: -24, z: -28, scale: 0.95 },
      { x: 25, z: -26, scale: 1.05 },
      { x: -34, z: -14, scale: 0.85 },
      { x: 35, z: -12, scale: 0.9 },
      { x: -16, z: -36, scale: 1.1 },
      { x: 18, z: -35, scale: 1.0 },
      { x: -28, z: 16, scale: 0.85 },
      { x: 29, z: 18, scale: 0.95 },
      { x: -20, z: 32, scale: 0.9 },
      { x: 22, z: 30, scale: 1.0 },
    ];
    midTreeCoords.forEach((pt) => {
      const s = pt.scale;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * s, 0.95 * s, 13 * s, 8), trunkMat);
      trunk.position.set(pt.x, 6.5 * s, pt.z);
      envGroup.add(trunk);
      for (let j = 0; j < 3; j++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((4.2 - j * 0.9) * s, 6.8 * s, 8), foliageMat);
        cone.position.set(pt.x, (11.5 + j * 4.2) * s, pt.z);
        envGroup.add(cone);
      }
    });
  } else if (rawCat.includes('desert') || rawCat.includes('wasteland')) {
    // Sahara Desert: Undulating Sand Dunes & Weathered Rock Mesas
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xb58e52,
      roughness: 0.97,
      metalness: 0.02,
    });
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x7c4f2b,
      roughness: 0.92,
      metalness: 0.05,
    });

    // Rolling Sand Dunes
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = 48 + (i % 3) * 8;
      const dune = new THREE.Mesh(new THREE.SphereGeometry(18, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), sandMat);
      dune.position.set(Math.cos(angle) * dist, -4, Math.sin(angle) * dist);
      dune.scale.set(2.2, 0.35, 1.4);
      dune.rotation.y = angle;
      envGroup.add(dune);
    }

    // Distant Weathered Mesa Rock Monoliths
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.3;
      const mesa = new THREE.Mesh(new THREE.CylinderGeometry(8, 12, 28, 7), rockMat);
      mesa.position.set(Math.cos(angle) * 62, 12, Math.sin(angle) * 62);
      envGroup.add(mesa);
    }
  } else if (
    rawCat.includes('room') ||
    rawCat.includes('penthouse') ||
    rawCat.includes('interior') ||
    rawCat.includes('hearth') ||
    rawCat.includes('cabin')
  ) {
    // Interior Chamber / Hearthside Salon / Study: Textured Walls, Timber Beams & Distant Window
    const descLower = ((options.sceneDescription || '') + ' ' + (env?.promptDescription || '')).toLowerCase();
    const isBrick = /brick|terracotta|masonry\s*wall|طوب|قرميد/i.test(descLower) || descLower.includes('fireplace') || rawCat.includes('hearth');
    const isWoodPanel = (/wood\s*panel|timber\s*wall|study|library|chalet|cabin|خشب/i.test(descLower) || rawCat.includes('cabin')) && !isBrick;

    const wallTex = isBrick ? createBrickCanvasTexture() : isWoodPanel ? createWoodParquetCanvasTexture() : null;
    const wallMat = new THREE.MeshStandardMaterial({
      color: isBrick ? 0x9a4a32 : isWoodPanel ? 0x3d271d : 0x141822, // Rich terracotta brick vs warm dark walnut vs sleek charcoal
      map: wallTex,
      roughness: isBrick ? 0.78 : isWoodPanel ? 0.45 : 0.85,
      metalness: isBrick ? 0.04 : isWoodPanel ? 0.12 : 0.1,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: isBrick || isWoodPanel ? 0x271911 : 0x090c12, // Dark timber wood frame vs black steel
      roughness: 0.6,
      metalness: 0.3,
    });

    // Back Wall with Genuine Window Opening so deep blue twilight sky is visible!
    const backWallLeft = new THREE.Mesh(new THREE.BoxGeometry(39, 24, 1), wallMat);
    backWallLeft.position.set(-30.5, 12, -49);
    envGroup.add(backWallLeft);

    const backWallRight = new THREE.Mesh(new THREE.BoxGeometry(39, 24, 1), wallMat);
    backWallRight.position.set(30.5, 12, -49);
    envGroup.add(backWallRight);

    const backWallSill = new THREE.Mesh(new THREE.BoxGeometry(22, 4, 1), wallMat);
    backWallSill.position.set(0, 2, -49);
    envGroup.add(backWallSill);

    const backWallHeader = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 1), wallMat);
    backWallHeader.position.set(0, 21, -49);
    envGroup.add(backWallHeader);

    // Window Frame (allowing twilight sky / distant landscape to show through)
    const windowOuter = new THREE.Mesh(new THREE.BoxGeometry(22, 14, 1.4), frameMat);
    windowOuter.position.set(0, 11, -48.6);
    envGroup.add(windowOuter);

    // Window cross mullions
    const horizMullion = new THREE.Mesh(new THREE.BoxGeometry(21.6, 0.4, 1.6), frameMat);
    horizMullion.position.set(0, 11, -48.5);
    envGroup.add(horizMullion);

    const vertMullion1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 13.6, 1.6), frameMat);
    vertMullion1.position.set(-5.5, 11, -48.5);
    envGroup.add(vertMullion1);

    const vertMullion2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 13.6, 1.6), frameMat);
    vertMullion2.position.set(5.5, 11, -48.5);
    envGroup.add(vertMullion2);

    // Side Walls
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 24, 100), wallMat);
    leftWall.position.set(-49, 12, 0);
    envGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 24, 100), wallMat);
    rightWall.position.set(49, 12, 0);
    envGroup.add(rightWall);

    // Ceiling timber beams
    for (let z = -40; z <= 40; z += 16) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(98, 1.0, 1.0), frameMat);
      beam.position.set(0, 23.5, z);
      envGroup.add(beam);
    }

    // Architectural Built-in Stone Fireplace on stage if no fireplace actor is placed
    const actors = options.actors || [];
    const hasFireplaceActor = actors.some((a) =>
      /fireplace|hearth/i.test(`${a.name} ${a.token || ''} ${a.kind || ''}`)
    );
    if ((isBrick || rawCat.includes('hearth')) && !hasFireplaceActor) {
      const fpGraph = lookupCuratedPartGraph('rustic stone fireplace');
      if (fpGraph) {
        const fpKit = buildPartGraph(fpGraph);
        fpKit.group.position.set(0, 0, -22);
        fpKit.group.scale.set(1.5, 1.5, 1.5);
        if (fpKit.update) {
          fpKit.group.userData.update = fpKit.update;
        }
        envGroup.add(fpKit.group);
      }
    }
  } else {
    // Default: Soundstage Studio — Real Physical Stage with Acoustic Perimeter Walls & Overhead Lighting Box Truss
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1c2434,
      roughness: 0.88,
      metalness: 0.15,
    });
    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      metalness: 0.8,
      roughness: 0.3,
    });
    const onAirGlowMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    // Studio Acoustic Walls (U-shape around back and sides, single-sided inward-facing so camera orbiting outside sees straight into the set)
    wallMat.side = THREE.FrontSide;
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(104, 28), wallMat);
    backWall.position.set(0, 14, -50.8);
    envGroup.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(104, 28), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-50.8, 14, 0);
    envGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(104, 28), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(50.8, 14, 0);
    envGroup.add(rightWall);

    // Overhead Four-Sided Box Truss Lighting Rig (suspended at y=28)
    const trussY = 27;
    const trussBeams = [
      { geo: new THREE.BoxGeometry(80, 0.8, 0.8), pos: [0, trussY, -35] },
      { geo: new THREE.BoxGeometry(80, 0.8, 0.8), pos: [0, trussY, 35] },
      { geo: new THREE.BoxGeometry(0.8, 0.8, 70), pos: [-40, trussY, 0] },
      { geo: new THREE.BoxGeometry(0.8, 0.8, 70), pos: [40, trussY, 0] },
    ];
    trussBeams.forEach((tb) => {
      const beam = new THREE.Mesh(tb.geo, trussMat);
      beam.position.set(tb.pos[0] as number, tb.pos[1] as number, tb.pos[2] as number);
      envGroup.add(beam);
    });

    // Soundstage Stage Door & Illuminated "ON AIR" Sign
    const door = new THREE.Mesh(new THREE.BoxGeometry(8, 14, 0.5), trussMat);
    door.position.set(0, 7, -50.6);
    envGroup.add(door);

    const onAirSign = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 0.4), onAirGlowMat);
    onAirSign.position.set(0, 15.2, -50.4);
    envGroup.add(onAirSign);
  }

  // Ensure all environment objects are on Layer 0 (World objects - visible in Viewfinder)
  setLayerRecursively(envGroup, 0);
}
