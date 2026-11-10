import * as THREE from 'three';
import {
  EnvironmentDetailLevel,
  EnvironmentSpec,
  VegetationSpecies,
} from '../../types/environment';
import {
  evaluateTerrainNormalAndSlope,
  ResolvedTerrainConfig,
} from './terrainGenerator';

export interface ExclusionTrajectoryActor {
  name?: string;
  token?: string;
  kind?: string;
  trajectory?: {
    startPosition?: { x: number; y: number; z?: number };
    endPosition?: { x: number; y: number; z?: number };
    keyframes?: Array<{ position: { x: number; y: number; z?: number } }>;
  };
}

export interface ExclusionCameraSpec {
  startPosition?: { x: number; y: number; z?: number };
  endPosition?: { x: number; y: number; z?: number };
  targetLookAt?: { x: number; y: number; z?: number };
}

export interface VegetationBuildContext {
  env?: EnvironmentSpec;
  terrainConfig: ResolvedTerrainConfig;
  sceneDescription?: string;
  actors?: ExclusionTrajectoryActor[];
  camera?: ExclusionCameraSpec;
}

export interface ResolvedVegetationConfig {
  species: Exclude<VegetationSpecies, 'auto'>;
  density: number;
  exclusionSightline: boolean;
  windStrength: number;
  seed: number;
  detailLevel: EnvironmentDetailLevel;
  clutterEnabled: boolean;
  clutterDensity: number;
  grassRing: boolean;
}

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shortest distance from 2D point (px, pz) to line segment (ax, az) -> (bx, bz),
 * plus normalized projection parameter tProj in [0, 1].
 */
export function distanceToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { dist: number; tProj: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) {
    return { dist: Math.hypot(px - ax, pz - az), tProj: 0 };
  }
  const tProj = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const projX = ax + tProj * dx;
  const projZ = az + tProj * dz;
  return { dist: Math.hypot(px - projX, pz - projZ), tProj };
}

/**
 * Resolves the effective plain-data vegetation and clutter settings.
 */
export function resolveEffectiveVegetationConfig(
  ctx: VegetationBuildContext
): ResolvedVegetationConfig {
  const { env, terrainConfig, sceneDescription } = ctx;
  const rawSpecies = env?.vegetation?.species ?? 'auto';
  const density = Math.max(0, Math.min(2.5, env?.vegetation?.density ?? 1.0));
  const exclusionSightline = env?.vegetation?.exclusionSightline !== false;
  const windStrength = Math.max(0, Math.min(2, env?.vegetation?.windStrength ?? 0.45));
  const seed = Math.round(env?.vegetation?.seed ?? terrainConfig.seed ?? 67);
  const detailLevel: EnvironmentDetailLevel = env?.detailLevel === 'hd' ? 'hd' : 'simple';
  const clutterEnabled = env?.clutter?.enabled !== false;
  const clutterDensity = Math.max(0, Math.min(2.5, env?.clutter?.density ?? 1.0));
  const grassRing = Boolean(env?.clutter?.grassRing || (detailLevel === 'hd' && terrainConfig.groundSurface === 'grass-terrain'));

  if (rawSpecies !== 'auto') {
    return {
      species: rawSpecies,
      density,
      exclusionSightline,
      windStrength,
      seed,
      detailLevel,
      clutterEnabled,
      clutterDensity,
      grassRing,
    };
  }

  const combinedText = `${sceneDescription || ''} ${env?.promptDescription || ''} ${env?.name || ''}`.toLowerCase();
  const cat = terrainConfig.biomeCategory;

  let species: Exclude<VegetationSpecies, 'auto'> = 'none';
  if (cat.includes('nature') || cat.includes('forest')) {
    if (/\b(palm|tropical|oasis|island|coconut|نخيل|واحة|استوائي)\b/i.test(combinedText)) {
      species = 'palm';
    } else if (/\b(birch|aspen|autumn|بتولا|خريف)\b/i.test(combinedText)) {
      species = 'birch';
    } else if (/\b(oak|maple|broadleaf|deciduous|park|orchard|بلوط|حديقة)\b/i.test(combinedText)) {
      species = 'broadleaf';
    } else if (/\b(mixed|jungle|rainforest|أدغال)\b/i.test(combinedText)) {
      species = 'mixed';
    } else {
      species = 'conifer';
    }
  } else if (cat.includes('coastal') || cat.includes('beach')) {
    species = /\b(palm|tropical|oasis|island|نخيل|جزيرة)\b/i.test(combinedText) ? 'palm' : 'bush';
  } else if (cat.includes('desert')) {
    species = /\b(oasis|palm|واحة|نخيل)\b/i.test(combinedText) ? 'palm' : 'bush';
  }

  return {
    species,
    density,
    exclusionSightline,
    windStrength,
    seed,
    detailLevel,
    clutterEnabled,
    clutterDensity,
    grassRing,
  };
}

/**
 * Triple Smart Exclusion Zone (Q3):
 * Prevents procedural trees from spawning inside:
 * 1. Central Acting Clearing (r < clearingRadius)
 * 2. Active Actor / Vehicle Movement Trajectory Corridors (5.5m buffer)
 * 3. Camera-to-Subject Sightline Frustum Cone so a tree never blocks an actor's face in the lens!
 */
export function isPointExcludedFromScattering(
  x: number,
  z: number,
  ctx: VegetationBuildContext,
  vegConfig: ResolvedVegetationConfig,
  isTree: boolean = true
): boolean {
  const r = Math.hypot(x, z);
  const clearR = ctx.terrainConfig.clearingRadius;

  // 1. Central acting clearing exclusion
  const minRadius = isTree ? clearR : Math.max(11, clearR - 4);
  if (r < minRadius) return true;

  // In coastal-beach biome, ocean water starts at z < -16m
  if (ctx.terrainConfig.biomeCategory.includes('coastal') && z < -15.5) {
    return true;
  }

  // 2. Actor & vehicle movement trajectory corridor exclusion
  const actors = ctx.actors || [];
  const actorCorridorRadius = isTree ? 5.8 : 3.4;
  for (const act of actors) {
    const start = act.trajectory?.startPosition;
    const end = act.trajectory?.endPosition;
    if (!start) continue;
    const waypoints: Array<{ x: number; z: number }> = [
      { x: start.x - 50, z: start.y - 50 },
    ];
    for (const kf of act.trajectory?.keyframes || []) {
      waypoints.push({ x: kf.position.x - 50, z: kf.position.y - 50 });
    }
    if (end) {
      waypoints.push({ x: end.x - 50, z: end.y - 50 });
    }
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (Math.hypot(x - wp.x, z - wp.z) < actorCorridorRadius) return true;
      if (i + 1 < waypoints.length) {
        const nextWp = waypoints[i + 1];
        const { dist } = distanceToSegment2D(x, z, wp.x, wp.z, nextWp.x, nextWp.z);
        if (dist < actorCorridorRadius) return true;
      }
    }
  }

  // 3. Camera-to-Subject Sightline Frustum Cone Exclusion (for trees/tall vegetation)
  if (isTree && vegConfig.exclusionSightline) {
    const camStart = ctx.camera?.startPosition ?? { x: 50, y: 80 };
    const camEnd = ctx.camera?.endPosition ?? camStart;
    const lookTarget = ctx.camera?.targetLookAt ?? { x: 50, y: 50 };

    const camPositions = [
      { x: camStart.x - 50, z: camStart.y - 50 },
      { x: camEnd.x - 50, z: camEnd.y - 50 },
    ];
    const targets = [{ x: lookTarget.x - 50, z: lookTarget.y - 50 }];
    for (const act of actors.slice(0, 3)) {
      if (act.trajectory?.startPosition) {
        targets.push({
          x: act.trajectory.startPosition.x - 50,
          z: act.trajectory.startPosition.y - 50,
        });
      }
    }

    for (const cp of camPositions) {
      for (const tgt of targets) {
        // Extend ray slightly behind target so backdrop behind actor's head also stays clean in close-ups
        const dirX = tgt.x - cp.x;
        const dirZ = tgt.z - cp.z;
        const rayLen = Math.hypot(dirX, dirZ);
        if (rayLen < 0.5) continue;
        const extX = tgt.x + (dirX / rayLen) * 8.0;
        const extZ = tgt.z + (dirZ / rayLen) * 8.0;
        const { dist, tProj } = distanceToSegment2D(x, z, cp.x, cp.z, extX, extZ);
        const coneHalfWidth = 6.2 + tProj * 4.5;
        if (dist < coneHalfWidth) return true;
      }
    }
  }

  return false;
}

/**
 * Appends a single procedural tree's trunk and foliage instance matrices into per-species buckets
 * and builds batched InstancedMesh objects for 60 FPS Previs performance.
 */
export function buildProceduralVegetationAndClutter(
  envGroup: THREE.Group,
  ctx: VegetationBuildContext
): void {
  const vegConfig = resolveEffectiveVegetationConfig(ctx);
  const { terrainConfig } = ctx;
  const rand = seededRandom(vegConfig.seed);

  const isHD = vegConfig.detailLevel === 'hd';

  // 1. Procedural Vegetation (Trees & Shrubs)
  if (vegConfig.species !== 'none' && vegConfig.density > 0.01) {
    const baseTreeCount =
      vegConfig.species === 'bush'
        ? isHD
          ? 42
          : 16
        : isHD
        ? 64
        : 26;
    const targetCount = Math.max(4, Math.round(baseTreeCount * vegConfig.density));

    const trunkMatrices: THREE.Matrix4[] = [];
    const trunkColors: THREE.Color[] = [];
    const canopyMatrices: THREE.Matrix4[] = [];
    const canopyColors: THREE.Color[] = [];

    const speciesList: Array<Exclude<VegetationSpecies, 'auto' | 'none' | 'mixed'>> = [
      'conifer',
      'broadleaf',
      'birch',
      'bush',
    ];

    // Always include curated midground parallax positions first (filtered by sightline exclusion!)
    const candidatePoints: Array<{ x: number; z: number; scale: number }> = [
      { x: -24, z: -28, scale: 0.95 },
      { x: 25, z: -26, scale: 1.05 },
      { x: -34, z: -14, scale: 0.88 },
      { x: 35, z: -12, scale: 0.92 },
      { x: -28, z: 16, scale: 0.86 },
      { x: 29, z: 18, scale: 0.95 },
      { x: -22, z: 32, scale: 0.9 },
      { x: 24, z: 30, scale: 1.0 },
    ];

    for (let i = 0; i < targetCount * 3; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = terrainConfig.clearingRadius + 3 + rand() * (56 - terrainConfig.clearingRadius);
      candidatePoints.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        scale: 0.78 + rand() * 0.48,
      });
    }

    const placedPositions: Array<{ x: number; z: number }> = [];
    const dummy = new THREE.Object3D();

    for (const pt of candidatePoints) {
      if (placedPositions.length >= targetCount) break;
      if (Math.abs(pt.x) > 56 || Math.abs(pt.z) > 56) continue;

      if (isPointExcludedFromScattering(pt.x, pt.z, ctx, vegConfig, true)) {
        continue;
      }

      // Minimum spacing between trees
      const minSpacing = vegConfig.species === 'bush' ? 3.2 : isHD ? 4.2 : 5.5;
      if (placedPositions.some((p) => Math.hypot(p.x - pt.x, p.z - pt.z) < minSpacing)) {
        continue;
      }

      const { height: groundY, slopeDeg } = evaluateTerrainNormalAndSlope(pt.x, pt.z, terrainConfig);
      if (slopeDeg > 36) continue; // Slope limit: trees don't grow on vertical cliffs

      placedPositions.push({ x: pt.x, z: pt.z });

      const activeSp =
        vegConfig.species === 'mixed'
          ? speciesList[placedPositions.length % speciesList.length]
          : vegConfig.species;
      const s = pt.scale;
      const yaw = rand() * Math.PI * 2;

      if (activeSp === 'bush') {
        // Low scrub / coastal or desert bush (2 clustered foliage spheres)
        const bushColor =
          terrainConfig.biomeCategory.includes('desert')
            ? new THREE.Color(0x5c6b38).offsetHSL(0, 0, (rand() - 0.5) * 0.08)
            : new THREE.Color(0x234d20).offsetHSL(0, 0, (rand() - 0.5) * 0.08);
        for (let c = 0; c < 2; c++) {
          dummy.position.set(
            pt.x + (c - 0.5) * 0.8 * s,
            groundY + 0.9 * s,
            pt.z + (rand() - 0.5) * 0.6 * s
          );
          dummy.rotation.set(0, yaw + c, 0);
          dummy.scale.set(1.8 * s, 1.25 * s, 1.8 * s);
          dummy.updateMatrix();
          canopyMatrices.push(dummy.matrix.clone());
          canopyColors.push(bushColor);
        }
        continue;
      }

      // Trunk placement
      const trunkHeight = activeSp === 'palm' ? 11.5 * s : activeSp === 'birch' ? 12.5 * s : 13.5 * s;
      const trunkWidth = activeSp === 'birch' ? 0.42 * s : activeSp === 'palm' ? 0.52 * s : 0.78 * s;
      const leanX = activeSp === 'palm' ? (rand() - 0.5) * 0.16 : (rand() - 0.5) * 0.04;
      const leanZ = activeSp === 'palm' ? (rand() - 0.5) * 0.16 : (rand() - 0.5) * 0.04;

      dummy.position.set(pt.x, groundY + trunkHeight * 0.48, pt.z);
      dummy.rotation.set(leanX, yaw, leanZ);
      dummy.scale.set(trunkWidth, trunkHeight, trunkWidth);
      dummy.updateMatrix();
      trunkMatrices.push(dummy.matrix.clone());

      const trunkCol =
        activeSp === 'birch'
          ? new THREE.Color(0xd6d3d1)
          : activeSp === 'palm'
          ? new THREE.Color(0x6b4c35)
          : new THREE.Color(0x3b2314);
      trunkColors.push(trunkCol);

      // Canopy tiers by species
      if (activeSp === 'conifer') {
        const baseFolCol = new THREE.Color(0x133818).offsetHSL(0, 0, (rand() - 0.5) * 0.06);
        for (let tier = 0; tier < 3; tier++) {
          const tierRadius = (4.3 - tier * 0.95) * s;
          const tierHeight = 6.6 * s;
          dummy.position.set(pt.x, groundY + (11.2 + tier * 4.2) * s, pt.z);
          dummy.rotation.set(0, yaw + tier * 0.5, 0);
          dummy.scale.set(tierRadius, tierHeight, tierRadius);
          dummy.updateMatrix();
          canopyMatrices.push(dummy.matrix.clone());
          canopyColors.push(baseFolCol.clone().offsetHSL(0, 0, tier * 0.02));
        }
      } else if (activeSp === 'palm') {
        const frondCol = new THREE.Color(0x2d6a2e).offsetHSL(0, 0, (rand() - 0.5) * 0.06);
        const topX = pt.x + Math.sin(leanZ) * (-trunkHeight * 0.45);
        const topZ = pt.z + Math.sin(leanX) * (trunkHeight * 0.45);
        const topY = groundY + trunkHeight * 0.94;
        for (let f = 0; f < 5; f++) {
          const fAngle = yaw + (f / 5) * Math.PI * 2;
          dummy.position.set(
            topX + Math.cos(fAngle) * 2.2 * s,
            topY - 0.3 * s,
            topZ + Math.sin(fAngle) * 2.2 * s
          );
          dummy.rotation.set(0.45, -fAngle, 0.35);
          dummy.scale.set(2.8 * s, 0.55 * s, 1.15 * s);
          dummy.updateMatrix();
          canopyMatrices.push(dummy.matrix.clone());
          canopyColors.push(frondCol);
        }
      } else {
        // Broadleaf / Birch rounded multi-crown clusters
        const crownCol =
          activeSp === 'birch'
            ? new THREE.Color(0x65a30d).offsetHSL((rand() - 0.5) * 0.05, 0, (rand() - 0.5) * 0.07)
            : new THREE.Color(0x1e4d22).offsetHSL(0, 0, (rand() - 0.5) * 0.06);
        const puffs = [
          { ox: 0, oy: 12.8, oz: 0, rx: 4.2, ry: 4.8, rz: 4.2 },
          { ox: -1.8, oy: 11.2, oz: 1.2, rx: 3.1, ry: 3.4, rz: 3.1 },
          { ox: 1.9, oy: 11.5, oz: -1.1, rx: 3.2, ry: 3.5, rz: 3.2 },
        ];
        for (const pf of puffs) {
          dummy.position.set(pt.x + pf.ox * s, groundY + pf.oy * s, pt.z + pf.oz * s);
          dummy.rotation.set(0, yaw, 0);
          dummy.scale.set(pf.rx * s, pf.ry * s, pf.rz * s);
          dummy.updateMatrix();
          canopyMatrices.push(dummy.matrix.clone());
          canopyColors.push(crownCol);
        }
      }
    }

    if (trunkMatrices.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.36, 0.62, 1.0, isHD ? 10 : 7);
      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.02,
      });
      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, trunkMatrices.length);
      trunkInst.castShadow = true;
      trunkInst.receiveShadow = true;
      trunkInst.name = '__procedural_tree_trunks__';
      for (let i = 0; i < trunkMatrices.length; i++) {
        trunkInst.setMatrixAt(i, trunkMatrices[i]);
        trunkInst.setColorAt(i, trunkColors[i]);
      }
      trunkInst.instanceMatrix.needsUpdate = true;
      if (trunkInst.instanceColor) trunkInst.instanceColor.needsUpdate = true;
      envGroup.add(trunkInst);
    }

    if (canopyMatrices.length > 0) {
      const isConeCanopy = vegConfig.species === 'conifer';
      const canopyGeo = isConeCanopy
        ? new THREE.ConeGeometry(1.0, 1.0, isHD ? 10 : 7)
        : new THREE.DodecahedronGeometry(1.0, isHD ? 1 : 0);
      const canopyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0.02,
      });
      const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, canopyMatrices.length);
      canopyInst.castShadow = true;
      canopyInst.receiveShadow = true;
      canopyInst.name = '__procedural_tree_canopies__';
      canopyInst.userData.baseMatrices = canopyMatrices.map((m) => m.clone());
      canopyInst.userData.windStrength = vegConfig.windStrength;
      for (let i = 0; i < canopyMatrices.length; i++) {
        canopyInst.setMatrixAt(i, canopyMatrices[i]);
        canopyInst.setColorAt(i, canopyColors[i]);
      }
      canopyInst.instanceMatrix.needsUpdate = true;
      if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
      envGroup.add(canopyInst);
    }
  }

  // 2. Ground Clutter (Beveled Rocks, Mossy Boulders, Pebbles) — Simple (14) vs HD (78)
  const isOutdoorBiome =
    terrainConfig.profile !== 'flat' ||
    terrainConfig.biomeCategory.includes('nature') ||
    terrainConfig.biomeCategory.includes('desert') ||
    terrainConfig.biomeCategory.includes('coastal') ||
    Boolean(ctx.env?.clutter?.enabled);

  if (vegConfig.clutterEnabled && isOutdoorBiome && vegConfig.clutterDensity > 0.05) {
    const baseRockCount = isHD ? 78 : 14;
    const rockCount = Math.max(4, Math.round(baseRockCount * vegConfig.clutterDensity));
    const rockGeo = new THREE.DodecahedronGeometry(1.0, isHD ? 1 : 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.06,
    });

    const rockMatrices: THREE.Matrix4[] = [];
    const rockColors: THREE.Color[] = [];
    const dummy = new THREE.Object3D();

    const baseRockPalette =
      terrainConfig.profile === 'sand-dunes' || terrainConfig.biomeCategory.includes('desert')
        ? new THREE.Color(0x855834)
        : terrainConfig.profile === 'coastal-slope'
        ? new THREE.Color(0x64748b)
        : new THREE.Color(0x57534e);

    for (let i = 0; i < rockCount * 2; i++) {
      if (rockMatrices.length >= rockCount) break;
      const angle = rand() * Math.PI * 2;
      const minR = Math.max(12, terrainConfig.clearingRadius - 2);
      const dist = minR + rand() * (54 - minR);
      const rx = Math.cos(angle) * dist;
      const rz = Math.sin(angle) * dist;

      if (isPointExcludedFromScattering(rx, rz, ctx, vegConfig, false)) continue;

      const { height: gy } = evaluateTerrainNormalAndSlope(rx, rz, terrainConfig);
      const sx = (0.45 + rand() * 1.45) * (isHD ? 0.9 : 1.1);
      const sy = sx * (0.42 + rand() * 0.38);
      const sz = sx * (0.75 + rand() * 0.5);

      dummy.position.set(rx, gy + sy * 0.35, rz);
      dummy.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI * 2, (rand() - 0.5) * 0.4);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      rockMatrices.push(dummy.matrix.clone());

      const rCol = baseRockPalette.clone().offsetHSL(0, (rand() - 0.5) * 0.05, (rand() - 0.5) * 0.12);
      rockColors.push(rCol);
    }

    if (rockMatrices.length > 0) {
      const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockMatrices.length);
      rockInst.castShadow = true;
      rockInst.receiveShadow = true;
      rockInst.name = '__procedural_ground_clutter__';
      for (let i = 0; i < rockMatrices.length; i++) {
        rockInst.setMatrixAt(i, rockMatrices[i]);
        rockInst.setColorAt(i, rockColors[i]);
      }
      rockInst.instanceMatrix.needsUpdate = true;
      if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
      envGroup.add(rockInst);
    }
  }

  // 3. Optional Foreground Grass Ring (enabled in HD mode or when grassRing toggle is checked)
  if (vegConfig.grassRing && isOutdoorBiome) {
    const tuftCount = isHD ? 220 : 90;
    const bladeGeo = new THREE.ConeGeometry(0.18, 0.85, 4);
    bladeGeo.translate(0, 0.42, 0);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.02,
    });
    const grassInst = new THREE.InstancedMesh(bladeGeo, bladeMat, tuftCount);
    grassInst.name = '__procedural_grass_ring__';
    const dummy = new THREE.Object3D();
    const baseGrassCol = new THREE.Color(0x2f5e27);

    let placed = 0;
    for (let i = 0; i < tuftCount * 2 && placed < tuftCount; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.max(9, terrainConfig.clearingRadius - 5) + rand() * 18;
      const gx = Math.cos(angle) * dist;
      const gz = Math.sin(angle) * dist;
      const { height: gy, slopeDeg } = evaluateTerrainNormalAndSlope(gx, gz, terrainConfig);
      if (slopeDeg > 32) continue;

      const s = 0.65 + rand() * 0.75;
      dummy.position.set(gx, gy, gz);
      dummy.rotation.set((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      grassInst.setMatrixAt(placed, dummy.matrix);
      grassInst.setColorAt(
        placed,
        baseGrassCol.clone().offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.1)
      );
      placed++;
    }
    grassInst.count = placed;
    grassInst.instanceMatrix.needsUpdate = true;
    if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
    envGroup.add(grassInst);
  }
}

/**
 * Deterministic wind sway for procedural tree canopies (pure function of shot time `t`
 * so offline 4-Pass Previs export is 100% frame-reproducible).
 */
export function updateVegetationWind(envGroup: THREE.Group, timeSec: number): void {
  const canopyInst = envGroup.getObjectByName('__procedural_tree_canopies__') as
    | THREE.InstancedMesh
    | undefined;
  if (!canopyInst) return;

  const baseMatrices = canopyInst.userData.baseMatrices as THREE.Matrix4[] | undefined;
  const windStrength = Number(canopyInst.userData.windStrength ?? 0.45);
  if (!baseMatrices || baseMatrices.length === 0 || windStrength <= 0.01) return;

  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const swayEuler = new THREE.Euler();
  const swayQuat = new THREE.Quaternion();
  const mat = new THREE.Matrix4();

  for (let i = 0; i < baseMatrices.length; i++) {
    baseMatrices[i].decompose(pos, quat, scale);
    const phase = pos.x * 0.17 + pos.z * 0.13 + i * 0.31;
    const swayX = Math.sin(timeSec * 1.85 + phase) * 0.035 * windStrength;
    const swayZ = Math.cos(timeSec * 1.45 + phase * 1.3) * 0.028 * windStrength;
    swayEuler.set(swayX, 0, swayZ);
    swayQuat.setFromEuler(swayEuler);
    quat.multiply(swayQuat);
    mat.compose(pos, quat, scale);
    canopyInst.setMatrixAt(i, mat);
  }
  canopyInst.instanceMatrix.needsUpdate = true;
}

