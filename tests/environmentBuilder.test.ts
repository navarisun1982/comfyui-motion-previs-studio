// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  applyGroundSurface,
  buildPerimeterEnvironment,
  setLayerRecursively,
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
});
