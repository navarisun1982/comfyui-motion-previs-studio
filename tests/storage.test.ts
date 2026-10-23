import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizeShotForStorage,
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  safeGetString,
  safeSetString,
  STORAGE_KEYS,
  isLocalStorageAvailable,
} from '../src/services/storage';
import { createDefaultShotSpec, ShotSpec } from '../src/types/shotspec';
import { useShotStore } from '../src/stores/useShotStore';
import { installMemoryStorage } from './helpers/memoryStorage';

describe('Storage Service & Blob URL Sanitization (S2 Desktop Hygiene)', () => {
  beforeEach(() => {
    installMemoryStorage();
    useShotStore.getState().resetToDefault();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('sanitizeShotForStorage', () => {
    it('returns the same shot object reference if no blob URLs are present', () => {
      const shot = createDefaultShotSpec({ id: 'shot-no-blobs' });
      const sanitized = sanitizeShotForStorage(shot);
      expect(sanitized).toBe(shot);
    });

    it('strips blob: URL from vfxReference while preserving fileName and other settings', () => {
      const shot = createDefaultShotSpec({ id: 'shot-vfx-blob' });
      shot.vfxReference = {
        videoUrl: 'blob:http://localhost:5173/60e0a5c1-3d75-45c1-8409-b4ba62b9a7be',
        fileName: 'car_chase_plate.mp4',
        referenceMode: 'actor-motion',
        depthGuidanceWeight: 0.85,
        edgeFidelity: 0.6,
        motionRetention: 0.7,
        trimStartSeconds: 0,
        trimEndSeconds: 4,
        enabled: true,
      };

      const sanitized = sanitizeShotForStorage(shot);
      expect(sanitized).not.toBe(shot);
      expect(sanitized.vfxReference).toBeDefined();
      expect(sanitized.vfxReference?.videoUrl).toBeUndefined();
      expect(sanitized.vfxReference?.fileName).toBe('car_chase_plate.mp4');
      expect(sanitized.vfxReference?.depthGuidanceWeight).toBe(0.85);
      expect(sanitized.vfxReference?.enabled).toBe(true);
    });

    it('clears blob: URL from referenceImage while preserving filename and subfolder', () => {
      const shot = createDefaultShotSpec({ id: 'shot-img-blob' });
      shot.referenceImage = {
        previewUrl: 'blob:http://localhost:5173/bf0138ae-24ef-4b47-b353-838bf2f7ebce',
        filename: 'mood_board_cyberpunk.png',
        subfolder: 'previs_refs',
      };

      const sanitized = sanitizeShotForStorage(shot);
      expect(sanitized.referenceImage?.previewUrl).toBe('');
      expect(sanitized.referenceImage?.filename).toBe('mood_board_cyberpunk.png');
      expect(sanitized.referenceImage?.subfolder).toBe('previs_refs');
    });

    it('does NOT strip non-blob URLs (e.g. data: or http:)', () => {
      const shot = createDefaultShotSpec({ id: 'shot-data-url' });
      shot.referenceImage = {
        previewUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        filename: 'embedded.png',
      };

      const sanitized = sanitizeShotForStorage(shot);
      expect(sanitized.referenceImage?.previewUrl).toContain('data:image/png');
    });
  });

  describe('safe storage primitives', () => {
    it('detects storage availability correctly', () => {
      expect(isLocalStorageAvailable()).toBe(true);
    });

    it('stores and retrieves JSON objects safely', () => {
      const payload = { id: 'test-1', values: [1, 2, 3], nested: { ok: true } };
      const saved = safeSetItem('test_key', payload);
      expect(saved).toBe(true);

      const retrieved = safeGetItem('test_key', null);
      expect(retrieved).toEqual(payload);
    });

    it('falls back safely when reading missing or invalid JSON', () => {
      expect(safeGetItem('non_existent_key', { fallback: true })).toEqual({ fallback: true });

      // Corrupt data in storage
      globalThis.localStorage.setItem('corrupt_json', '{not-valid-json');
      expect(safeGetItem('corrupt_json', 'default_val')).toBe('default_val');
    });

    it('stores and retrieves raw strings without json parsing errors', () => {
      safeSetString('raw_str_key', 'http://127.0.0.1:8188');
      expect(safeGetString('raw_str_key', 'fallback')).toBe('http://127.0.0.1:8188');
      expect(safeGetString('missing_str_key', 'fallback')).toBe('fallback');
    });

    it('removes keys safely', () => {
      safeSetString('to_delete', 'value');
      expect(safeGetString('to_delete')).toBe('value');
      safeRemoveItem('to_delete');
      expect(safeGetString('to_delete', '')).toBe('');
    });
  });

  describe('Integration with useShotStore', () => {
    it('persists shots without dead blob URLs into cache', () => {
      // Update shot with a blob plate
      useShotStore.getState().updateVfxReference({
        videoUrl: 'blob:http://localhost:5173/abc-123-uuid',
        fileName: 'explosion_plate.mov',
      });

      // Active state in memory has the blob URL so UI can play it right now
      expect(useShotStore.getState().shot.vfxReference?.videoUrl).toBe('blob:http://localhost:5173/abc-123-uuid');
      expect(useShotStore.getState().shot.vfxReference?.fileName).toBe('explosion_plate.mov');

      // But persisted cache in storage must be sanitized
      const cached = safeGetItem<Record<string, ShotSpec>>(STORAGE_KEYS.SHOTS_CACHE, {});
      const cachedShot = cached[useShotStore.getState().shot.id];
      expect(cachedShot).toBeDefined();
      expect(cachedShot.vfxReference?.fileName).toBe('explosion_plate.mov');
      expect(cachedShot.vfxReference?.videoUrl).toBeUndefined();
    });
  });
});
