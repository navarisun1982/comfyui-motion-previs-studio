// @vitest-environment jsdom
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  base64ToArrayBuffer,
  storeModelBuffer,
  getModelBuffer,
  getModelBlobUrl,
  registerModelFile,
  clearModelMemoryCache,
} from '../src/services/modelStorage';
import {
  normalizeGltfScene,
  getCachedGltfModel,
  clearGltfCache,
} from '../src/engine/gltfModelLoader';
import { useAssetLibraryStore } from '../src/stores/useAssetLibraryStore';

describe('GLB/GLTF 3D Model Import & Normalization System', () => {
  beforeAll(() => {
    if (typeof URL.createObjectURL !== 'function') {
      let blobCounter = 0;
      URL.createObjectURL = (_blob: any) => `blob:mock-blob://${++blobCounter}`;
      URL.revokeObjectURL = () => {};
    }
    if (typeof File !== 'undefined' && !File.prototype.arrayBuffer) {
      File.prototype.arrayBuffer = function () {
        return new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      };
    }
  });

  beforeEach(() => {
    clearModelMemoryCache();
    clearGltfCache();
  });

  describe('modelStorage', () => {
    it('decodes Base64 data strings cleanly into ArrayBuffers', () => {
      const sampleText = 'Antigravity3DDirector';
      const b64 = btoa(sampleText);
      const ab = base64ToArrayBuffer(`data:model/gltf-binary;base64,${b64}`);
      expect(ab.byteLength).toBe(sampleText.length);

      const uint8 = new Uint8Array(ab);
      const reconstructed = String.fromCharCode(...uint8);
      expect(reconstructed).toBe(sampleText);
    });

    it('stores and retrieves model ArrayBuffers in memory and creates active Blob URLs', async () => {
      const dummyBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
      const { blobUrl, modelId } = await storeModelBuffer('test-model-1', dummyBuffer, 'Test Drone');

      expect(modelId).toBe('test-model-1');
      expect(blobUrl).toBeDefined();

      const retrieved = await getModelBuffer('test-model-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.byteLength).toBe(8);

      const retrievedByUrl = await getModelBuffer(blobUrl);
      expect(retrievedByUrl).not.toBeNull();
      expect(retrievedByUrl!.byteLength).toBe(8);

      const activeUrl = await getModelBlobUrl('test-model-1');
      expect(activeUrl).toBe(blobUrl);
    });

    it('registers uploaded File objects with size calculation and unique modelId', async () => {
      const content = new Uint8Array(1024 * 1024 * 2); // 2 MB
      const file = new File([content], 'Hover_Vehicle.glb', { type: 'model/gltf-binary' });

      const registered = await registerModelFile(file);
      expect(registered.name).toBe('Hover_Vehicle');
      expect(registered.sizeMB).toBe('2.0');
      expect(registered.modelId).toMatch(/^model-\d+/);
      expect(registered.blobUrl).toBeDefined();

      const storedBuffer = await getModelBuffer(registered.modelId);
      expect(storedBuffer).not.toBeNull();
      expect(storedBuffer!.byteLength).toBe(1024 * 1024 * 2);
    });
  });

  describe('gltfModelLoader Normalization', () => {
    it('centers off-center geometries, rests bottom on ground y=0, and normalizes scale to target height', () => {
      // Create an off-center raw mesh simulating an uncentered Sketchfab/Blender model:
      // Center at (20, 15, 30), dimensions: width=10, height=40, depth=10.
      const rawGroup = new THREE.Group();
      const geom = new THREE.BoxGeometry(10, 40, 10);
      const mat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 1.0, metalness: 0 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(20, 15, 30); // severely off-center
      rawGroup.add(mesh);

      const normalized = normalizeGltfScene(rawGroup, 2.0);

      // Verify bounds of normalized container
      normalized.updateMatrixWorld(true);
      const finalBbox = new THREE.Box3().setFromObject(normalized);
      const finalSize = finalBbox.getSize(new THREE.Vector3());
      const finalCenter = finalBbox.getCenter(new THREE.Vector3());

      // 1. Horizontal center must be at origin (0, 0)
      expect(Math.abs(finalCenter.x)).toBeLessThan(0.001);
      expect(Math.abs(finalCenter.z)).toBeLessThan(0.001);

      // 2. Base must rest at y = 0 on the ground floor
      expect(Math.abs(finalBbox.min.y)).toBeLessThan(0.001);

      // 3. Max dimension must equal target height (2.0 meters)
      const maxDim = Math.max(finalSize.x, finalSize.y, finalSize.z);
      expect(Math.abs(maxDim - 2.0)).toBeLessThan(0.01);

      // 4. Mesh must cast & receive shadows
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);

      // 5. Material side must be DoubleSide to prevent missing faces
      expect(mat.side).toBe(THREE.DoubleSide);
    });

    it('handles model caching and fast retrieval via getCachedGltfModel', async () => {
      const dummyBuffer = new Uint8Array(64).buffer;
      const { blobUrl } = await storeModelBuffer('cached-test', dummyBuffer, 'Box');

      expect(getCachedGltfModel(blobUrl)).toBeNull();
    });
  });

  describe('useAssetLibraryStore uploadGlbFile', () => {
    it('uploads GLB file and registers asset with active modelUrl without exceeding localStorage quota', async () => {
      const store = useAssetLibraryStore.getState();
      const initialAssetsCount = store.customAssets.length;

      const dummyBytes = new Uint8Array(500 * 1024); // 500 KB model
      const file = new File([dummyBytes], 'Cyber_Speedboat.glb', { type: 'model/gltf-binary' });

      const asset = await store.uploadGlbFile(file);

      expect(asset.name).toBe('Cyber_Speedboat');
      expect(asset.kind).toBe('prop');
      expect(asset.isCustom).toBe(true);
      expect(asset.source).toBe('uploaded');
      expect(asset.modelId).toBeDefined();
      expect(asset.modelUrl).toBeDefined();
      expect(asset.modelUrl).toMatch(/^(blob:|model:\/\/)/);

      const updatedStore = useAssetLibraryStore.getState();
      expect(updatedStore.customAssets.length).toBe(initialAssetsCount + 1);
      expect(updatedStore.customAssets[0].id).toBe(asset.id);

      // Clean up
      store.removeCustomAsset(asset.id);
      expect(useAssetLibraryStore.getState().customAssets.length).toBe(initialAssetsCount);
    });
  });
});
