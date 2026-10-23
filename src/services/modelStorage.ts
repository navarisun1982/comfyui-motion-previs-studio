/**
 * Model Storage & Retrieval Service
 * High-performance, quota-free storage for imported 3D models (.glb / .gltf).
 *
 * Architecture:
 * 1. Fast in-memory ArrayBuffer cache (instant synchronous retrieval during render loops).
 * 2. Active Blob URL lifecycle management (bypasses URL length limits and fetch issues).
 * 3. IndexedDB persistence (stores 100MB+ 3D models across browser sessions without localStorage quota errors).
 * 4. Graceful in-memory fallback for test runners / headless environments lacking IndexedDB.
 */

const DB_NAME = 'comfy_director_3d_models_v1';
const STORE_NAME = 'models';
const DB_VERSION = 1;

// In-memory caches for zero-latency access
const bufferMemoryCache = new Map<string, ArrayBuffer>();
const blobUrlMemoryCache = new Map<string, string>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getIndexedDB(): IDBFactory | null {
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB;
  }
  return null;
}

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  const idb = getIndexedDB();
  if (!idb) {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    try {
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => {
        console.warn('IndexedDB open error in modelStorage, falling back to memory:', e);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB unavailable:', err);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Decodes a Base64 string directly into an ArrayBuffer without using fetch() or btoa limits.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Strip data: URI header if present
  const commaIdx = base64.indexOf(',');
  const cleanBase64 = commaIdx >= 0 ? base64.slice(commaIdx + 1) : base64;

  if (typeof atob === 'function') {
    const binary = atob(cleanBase64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Node.js fallback
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(cleanBase64, 'base64');
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; ++i) {
      view[i] = buf[i];
    }
    return ab;
  }

  throw new Error('No base64 decoder available in current environment.');
}

export interface StoredModelRecord {
  id: string;
  name: string;
  buffer: ArrayBuffer;
  mimeType: string;
  sizeBytes: number;
  updatedAt: number;
}

/**
 * Stores a model ArrayBuffer into memory and persistent IndexedDB.
 */
export async function storeModelBuffer(
  id: string,
  buffer: ArrayBuffer,
  name: string = 'Untitled Model',
  mimeType: string = 'model/gltf-binary'
): Promise<{ blobUrl: string; modelId: string }> {
  // 1. In-memory cache
  bufferMemoryCache.set(id, buffer);

  // 2. Blob URL
  let blobUrl = '';
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
    try {
      const blob = new Blob([buffer], { type: mimeType });
      blobUrl = URL.createObjectURL(blob);
      blobUrlMemoryCache.set(id, blobUrl);
      blobUrlMemoryCache.set(blobUrl, blobUrl);
      bufferMemoryCache.set(blobUrl, buffer);
    } catch (e) {
      console.warn('Failed to create blob URL for model:', e);
    }
  }

  // 3. Persistent IndexedDB
  const db = await openDB();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record: StoredModelRecord = {
          id,
          name,
          buffer,
          mimeType,
          sizeBytes: buffer.byteLength,
          updatedAt: Date.now(),
        };
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Failed to write model to IndexedDB:', err);
    }
  }

  return { blobUrl: blobUrl || `model://${id}`, modelId: id };
}

/**
 * Retrieves a model's ArrayBuffer by ID, model:// URI, blob URL, or data URI.
 */
export async function getModelBuffer(idOrUrl: string): Promise<ArrayBuffer | null> {
  if (!idOrUrl) return null;

  // 1. Direct memory hit
  const memHit = bufferMemoryCache.get(idOrUrl);
  if (memHit) return memHit;

  // Extract ID if formatted as model://id
  const id = idOrUrl.startsWith('model://') ? idOrUrl.replace('model://', '') : idOrUrl;

  const idHit = bufferMemoryCache.get(id);
  if (idHit) return idHit;

  // 2. Data URI decoding
  if (idOrUrl.startsWith('data:')) {
    try {
      const buffer = base64ToArrayBuffer(idOrUrl);
      bufferMemoryCache.set(idOrUrl, buffer);
      return buffer;
    } catch (e) {
      console.warn('Failed to decode data URI into ArrayBuffer:', e);
      return null;
    }
  }

  // 3. IndexedDB lookup
  const db = await openDB();
  if (db) {
    try {
      const record = await new Promise<StoredModelRecord | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      if (record && record.buffer) {
        bufferMemoryCache.set(id, record.buffer);
        bufferMemoryCache.set(idOrUrl, record.buffer);
        return record.buffer;
      }
    } catch (e) {
      console.warn('IndexedDB lookup error:', e);
    }
  }

  // 4. Blob or HTTP URL fetch
  if (idOrUrl.startsWith('blob:') || idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://')) {
    try {
      const resp = await fetch(idOrUrl);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        bufferMemoryCache.set(idOrUrl, buf);
        return buf;
      }
    } catch (e) {
      console.warn(`Failed to fetch model from ${idOrUrl}:`, e);
    }
  }

  return null;
}

/**
 * Returns a working URL (Blob URL or HTTP URL) for the given model.
 */
export async function getModelBlobUrl(idOrUrl: string): Promise<string> {
  if (!idOrUrl) return '';

  // Direct blob or HTTP URL
  if (idOrUrl.startsWith('blob:') || idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://')) {
    return idOrUrl;
  }

  const id = idOrUrl.startsWith('model://') ? idOrUrl.replace('model://', '') : idOrUrl;

  const cachedUrl = blobUrlMemoryCache.get(id);
  if (cachedUrl) return cachedUrl;

  const buffer = await getModelBuffer(idOrUrl);
  if (buffer && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    blobUrlMemoryCache.set(id, url);
    blobUrlMemoryCache.set(url, url);
    bufferMemoryCache.set(url, buffer);
    return url;
  }

  return `model://${id}`;
}

/**
 * Registers an uploaded File object into the storage pipeline.
 */
export async function registerModelFile(file: File): Promise<{
  modelId: string;
  blobUrl: string;
  buffer: ArrayBuffer;
  sizeMB: string;
  name: string;
}> {
  const fileBytes = file.size;
  const sizeMB = (fileBytes / (1024 * 1024)).toFixed(1);
  const cleanName = file.name.replace(/\.(glb|gltf)$/i, '');
  const modelId = `model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let buffer: ArrayBuffer;
  if (typeof file.arrayBuffer === 'function') {
    buffer = await file.arrayBuffer();
  } else if (typeof FileReader !== 'undefined') {
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  } else {
    buffer = new ArrayBuffer(0);
  }
  const mimeType = file.name.endsWith('.gltf') ? 'model/gltf+json' : 'model/gltf-binary';

  const { blobUrl } = await storeModelBuffer(modelId, buffer, cleanName, mimeType);

  return {
    modelId,
    blobUrl,
    buffer,
    sizeMB,
    name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
  };
}

/**
 * Clears in-memory caches (for testing).
 */
export function clearModelMemoryCache(): void {
  bufferMemoryCache.clear();
  blobUrlMemoryCache.clear();
}
