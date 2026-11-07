// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  applyGroundSurface,
  buildPerimeterEnvironment,
  setLayerRecursively,
  shouldHideStageBackdropInPrevis,
  inferSemanticEnvironmentBiome,
} from '../src/engine/staging/environmentBuilder';
import { createBrickCanvasTexture, createWoodParquetCanvasTexture } from '../src/engine/staging/stageTextures';
import { EnvironmentSpec } from '../src/types/shotspec';


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
});
