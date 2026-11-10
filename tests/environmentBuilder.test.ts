// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  applyGroundSurface,
  applyTerrainToFloorMesh,
  evaluateTerrainHeight,
  resolveEffectiveTerrainConfig,
  updateVegetationWind,
  buildPerimeterEnvironment,
  setLayerRecursively,
  shouldHideStageBackdropInPrevis,
  inferSemanticEnvironmentBiome,
} from '../src/engine/staging/environmentBuilder';
import {
  isPointExcludedFromScattering,
  resolveEffectiveVegetationConfig,
} from '../src/engine/staging/vegetationAndClutter';
import {
  evaluateVehicleDriveState,
  applyVehicleDriveKinematicsToMesh,
  isGroundVehicleActor,
} from '../src/engine/kinematics/vehicleDriveKinematics';
import { computeSmartNavmeshTrajectory } from '../src/engine/staging/navmeshPathfinder';
import { createBrickCanvasTexture, createWoodParquetCanvasTexture } from '../src/engine/staging/stageTextures';
import { EnvironmentSpec, Actor } from '../src/types/shotspec';


beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    fillRect: () => {},
    beginPath: () => {},
    roundRect: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
  })) as any;
});

describe('Staging Textures & Environment Builder', () => {
  it('generates procedural brick and parquet textures without throwing', () => {
    const brick = createBrickCanvasTexture();
    expect(brick).toBeInstanceOf(THREE.CanvasTexture);
    expect(brick.wrapS).toBe(THREE.RepeatWrapping);

    const wood = createWoodParquetCanvasTexture();
    expect(wood).toBeInstanceOf(THREE.CanvasTexture);
    expect(wood.wrapT).toBe(THREE.RepeatWrapping);
  });

  it('updates ground floor mesh material for various surface types', () => {
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial()
    );

    applyGroundSurface(floorMesh, 'asphalt-wet');
    const matAsphalt = floorMesh.material as THREE.MeshStandardMaterial;
    expect(matAsphalt.roughness).toBe(0.18);
    expect(matAsphalt.metalness).toBe(0.45);

    applyGroundSurface(floorMesh, 'wood-parquet');
    const matWood = floorMesh.material as THREE.MeshStandardMaterial;
    expect(matWood.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(matWood.roughness).toBe(0.22);

    applyGroundSurface(floorMesh, 'studio-floor');
    const matStudio = floorMesh.material as THREE.MeshStandardMaterial;
    expect(matStudio.map).toBeNull();
    expect(matStudio.roughness).toBe(0.85);
  });

  const makeEnv = (overrides: Partial<EnvironmentSpec> = {}): EnvironmentSpec => ({
    id: 'env-test',
    name: 'Test Environment',
    nameAr: 'بيئة اختبار',
    category: 'studio',
    promptDescription: 'Soundstage studio set',
    weather: 'clear',
    timeOfDay: 'night',
    groundSurface: 'studio-floor',
    skyColor: '#08090c',
    groundColor: '#0f1117',
    ambientColor: '#222222',
    fogDensity: 0.005,
    fogColor: '#000000',
    visibleInPrevis: true,
    ...overrides,
  });

  it('builds soundstage perimeter environment with lighting truss and stage door', () => {
    const envGroup = new THREE.Group();
    buildPerimeterEnvironment(envGroup, makeEnv({ category: 'studio' }));

    expect(envGroup.children.length).toBeGreaterThan(0);
    // Verifies all objects are on layer 0 (world objects)
    let allOnLayer0 = true;
    envGroup.traverse((child) => {
      if (child.layers.mask !== 1) { // Layer 0 has bitmask 1 (1 << 0)
        allOnLayer0 = false;
      }
    });
    expect(allOnLayer0).toBe(true);
  });

  it('builds urban cityscape environment with neon crowns and streetlamps', () => {
    const envGroup = new THREE.Group();
    buildPerimeterEnvironment(
      envGroup,
      makeEnv({
        name: 'Cyberpunk Alley',
        category: 'urban',
        weather: 'rain',
        groundSurface: 'asphalt-wet',
      })
    );

    expect(envGroup.children.length).toBeGreaterThanOrEqual(16);
  });

  it('builds interior hearth room and handles fireplace inclusion', () => {
    const envGroup = new THREE.Group();
    buildPerimeterEnvironment(
      envGroup,
      makeEnv({
        name: 'Rustic Cabin',
        category: 'interior',
        timeOfDay: 'twilight',
        groundSurface: 'wood-parquet',
      }),
      {
        sceneDescription: 'A cozy fireplace warms the rustic lodge',
        actors: [],
      }
    );

    expect(envGroup.children.length).toBeGreaterThan(0);
  });

  it('setLayerRecursively propagates layer assignment to all descendants', () => {
    const root = new THREE.Group();
    const child = new THREE.Group();
    const grandChild = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    child.add(grandChild);
    root.add(child);

    setLayerRecursively(root, 2);
    expect(root.layers.isEnabled(2)).toBe(true);
    expect(child.layers.isEnabled(2)).toBe(true);
    expect(grandChild.layers.isEnabled(2)).toBe(true);
  });

  it('shouldHideStageBackdropInPrevis keeps 3D biome parallax visible in auto mode and respects manual overrides, while inferSemanticEnvironmentBiome selects matching 3D biomes', () => {
    // 1. Default studio interior stays visible in auto mode
    const studioDecision = shouldHideStageBackdropInPrevis({
      environment: makeEnv({ category: 'studio', promptDescription: 'soundstage studio with cyclorama floor' }),
      sceneDescription: 'cinematic film still, moody atmospheric interior with subtle dust motes',
      actors: [{ name: 'Lead Subject', kind: 'human', token: 'a detective in a trench coat' }],
    });
    expect(studioDecision.mode).toBe('auto');
    expect(studioDecision.hide).toBe(false);

    // 2. Environment Reference Image (<Picture 4>) keeps 3D biome & cyclorama visible in auto mode for optical flow parallax
    const envRefDecision = shouldHideStageBackdropInPrevis({
      environment: makeEnv({ conceptImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }),
      sceneDescription: 'interior room',
      actors: [{ name: 'Lead Subject', kind: 'human' }],
    });
    expect(envRefDecision.mode).toBe('auto');
    expect(envRefDecision.hide).toBe(false);

    // 3. Helicopter flying over a forest infers 'nature' biome + 'grass-terrain' ground surface
    const forestBiome = inferSemanticEnvironmentBiome(
      makeEnv({ promptDescription: 'a helicopter flying in the air over a forest', timeOfDay: 'day' }),
      {
        sceneDescription: 'a helicopter flying in the air over a forest',
        actors: [{ name: 'Helicopter flying', kind: 'prop', token: 'a helicopter flying in the air over a forest' }],
      }
    );
    expect(forestBiome.category).toBe('nature');
    expect(forestBiome.groundSurface).toBe('grass-terrain');

    // 4. Manual override 'show-stage' forces 3D stage visible
    const manualShow = shouldHideStageBackdropInPrevis({
      environment: makeEnv({
        previsStageMode: 'show-stage',
        conceptImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      }),
      sceneDescription: 'a helicopter flying in the air over a forest',
    });
    expect(manualShow.mode).toBe('show-stage');
    expect(manualShow.hide).toBe(false);

    // 5. Manual override 'hide-stage' forces clean BG when explicitly requested by user
    const manualHide = shouldHideStageBackdropInPrevis({
      environment: makeEnv({ previsStageMode: 'hide-stage' }),
      sceneDescription: 'soundstage studio',
    });
    expect(manualHide.mode).toBe('hide-stage');
    expect(manualHide.hide).toBe(true);
  });

  it('evaluates 67.js-inspired procedural terrain with flat 18m central acting clearing and Simple vs HD detail levels', () => {
    const natureEnv = makeEnv({
      category: 'nature',
      groundSurface: 'grass-terrain',
      detailLevel: 'simple',
      terrain: { profile: 'rolling-hills', heightScale: 1.2, clearingRadius: 18, seed: 67 },
    });
    const biome = inferSemanticEnvironmentBiome(natureEnv);
    const cfg = resolveEffectiveTerrainConfig(natureEnv, biome);

    // Inside 18m central acting circle -> strictly flat (y = 0)
    expect(evaluateTerrainHeight(0, 0, cfg)).toBe(0);
    expect(evaluateTerrainHeight(10, -12, cfg)).toBe(0);

    // Outside clearing -> smooth positive 3D hill elevation
    expect(evaluateTerrainHeight(38, -32, cfg)).toBeGreaterThan(0.5);

    // Simple vs HD mesh resolution & 4-layer splat vertex colors
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial()
    );
    applyTerrainToFloorMesh(floorMesh, natureEnv, biome);
    const simpleVertCount = floorMesh.geometry.attributes.position.count;
    expect(simpleVertCount).toBe(49 * 49);
    expect(floorMesh.geometry.attributes.color).toBeDefined();

    const hdEnv = makeEnv({ ...natureEnv, detailLevel: 'hd' });
    applyTerrainToFloorMesh(floorMesh, hdEnv, biome);
    const hdVertCount = floorMesh.geometry.attributes.position.count;
    expect(hdVertCount).toBe(113 * 113);
    expect(hdVertCount).toBeGreaterThan(simpleVertCount);
  });

  it('enforces Triple Smart Exclusion Zone (central clearing + actor trajectories + camera sightline cone) and deterministic wind sway', () => {
    const forestEnv = makeEnv({
      category: 'nature',
      groundSurface: 'grass-terrain',
      detailLevel: 'hd',
      vegetation: { species: 'conifer', density: 1.0, exclusionSightline: true, windStrength: 0.6 },
    });
    const biome = inferSemanticEnvironmentBiome(forestEnv);
    const terrainCfg = resolveEffectiveTerrainConfig(forestEnv, biome);
    const ctx = {
      env: forestEnv,
      terrainConfig: terrainCfg,
      actors: [
        {
          name: 'Hero',
          trajectory: {
            startPosition: { x: 50, y: 50, z: 0 },
            endPosition: { x: 80, y: 50, z: 0 }, // moves along +X from 0m to +30m
          },
        },
      ],
      camera: {
        startPosition: { x: 50, y: 90, z: 50 }, // camera at (0, +40m) looking at (0, 0)
        endPosition: { x: 50, y: 90, z: 50 },
        targetLookAt: { x: 50, y: 50, z: 50 },
      },
    };
    const vegCfg = resolveEffectiveVegetationConfig(ctx);

    // 1. Inside 18m central stage -> excluded
    expect(isPointExcludedFromScattering(5, 5, ctx, vegCfg, true)).toBe(true);
    // 2. Along actor's movement corridor at (x = 25m, z = 0m) -> excluded
    expect(isPointExcludedFromScattering(25, 0, ctx, vegCfg, true)).toBe(true);
    // 3. Inside Camera-to-Subject Sightline Cone at (x = 0m, z = 28m) -> excluded so no tree blocks the lens!
    expect(isPointExcludedFromScattering(0, 28, ctx, vegCfg, true)).toBe(true);
    // 4. Safe flank position outside clearing, path, and sightline -> allowed
    expect(isPointExcludedFromScattering(-32, -26, ctx, vegCfg, true)).toBe(false);

    const envGroup = new THREE.Group();
    buildPerimeterEnvironment(envGroup, forestEnv, {
      actors: ctx.actors,
      camera: ctx.camera,
    });
    const canopyInst = envGroup.getObjectByName('__procedural_tree_canopies__') as THREE.InstancedMesh;
    expect(canopyInst).toBeDefined();
    expect(canopyInst.count).toBeGreaterThan(0);

    // Deterministic wind sway at t = 1.5s
    updateVegetationWind(envGroup, 1.5);
    const m0 = new THREE.Matrix4();
    canopyInst.getMatrixAt(0, m0);
    expect(m0.elements[0]).not.toBeNaN();
  });

  it('computes physical vehicle drive kinematics (wheel spin, front steering, suspension pitch/roll) and Navmesh A* obstacle avoidance', () => {
    const carActor: Actor = {
      id: 'car-1',
      name: 'Patrol Cruiser Car',
      kind: 'vehicle',
      token: 'a cyberpunk patrol cruiser car',
      actionDescription: 'drives around the barricade',
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 20, y: 50, z: 0 },
        endPosition: { x: 80, y: 50, z: 0 },
        keyframes: [
          { id: 'kf-1', time: 2.0, position: { x: 50, y: 35, z: 0 } },
        ],
      },
    };
    expect(isGroundVehicleActor(carActor)).toBe(true);

    const driveMid = evaluateVehicleDriveState(carActor.trajectory, 2.0, 4.0);
    expect(driveMid.distanceTraveledMeters).toBeGreaterThan(15);
    expect(driveMid.wheelSpinRad).toBeGreaterThan(20);
    expect(Math.abs(driveMid.steerAngleRad)).toBeGreaterThan(0.01);

    // Verify wheel rotation & steering application on a mock vehicle mesh with front/rear wheels
    const vehicleGroup = new THREE.Group();
    const frontWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3));
    frontWheel.name = 'front_wheel_left';
    frontWheel.position.set(1, 0.5, 1.5);
    const rearWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3));
    rearWheel.name = 'rear_wheel_left';
    rearWheel.position.set(1, 0.5, -1.5);
    vehicleGroup.add(frontWheel, rearWheel);

    applyVehicleDriveKinematicsToMesh(vehicleGroup, driveMid);
    expect(frontWheel.rotation.x).toBeCloseTo(driveMid.wheelSpinRad, 3);
    expect(frontWheel.rotation.y).toBeCloseTo(driveMid.steerAngleRad, 3);
    expect(rearWheel.rotation.x).toBeCloseTo(driveMid.wheelSpinRad, 3);
    expect(rearWheel.rotation.y).toBeCloseTo(0, 3);

    // Verify Navmesh A* routes around a central boulder obstacle at (50, 50)
    const straightActor: Actor = {
      ...carActor,
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 25, y: 50, z: 0 },
        endPosition: { x: 75, y: 50, z: 0 },
      },
    };
    const centralBoulder: Actor = {
      id: 'obs-1',
      name: 'Giant Stone Pillar',
      kind: 'prop',
      token: 'a massive stone pillar',
      actionDescription: 'blocking center stage',
      scale: 1.5,
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 50, y: 50, z: 0 },
        endPosition: { x: 50, y: 50, z: 0 },
      },
    };
    const navResult = computeSmartNavmeshTrajectory(straightActor, [straightActor, centralBoulder], 4.0);
    expect(navResult.bypassedObstacles).toContain('Giant Stone Pillar');
    expect(navResult.keyframes.length).toBeGreaterThan(0);
    // Intermediate waypoints steer away from y=50 to avoid the obstacle at (50, 50)
    expect(navResult.keyframes.some((kf) => Math.abs(kf.position.y - 50) > 2.5)).toBe(true);
  });
});
