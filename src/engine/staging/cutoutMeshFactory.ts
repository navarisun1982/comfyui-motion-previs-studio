import * as THREE from 'three';

export const CUTOUT_KINDS = ['cutout', 'standee', 'backdrop', 'billboard'] as const;
export type CutoutKind = typeof CUTOUT_KINDS[number];

export const CUTOUT_DEFAULT_HEIGHT = 1.8; // Standard 1.8m tall standee for character previs
export const BACKDROP_DEFAULT_HEIGHT = 5.0; // 5.0m tall backdrop card for environment background
export const CUTOUT_CARD_THICKNESS = 0.02; // 2cm card thickness

export function isCutoutKind(kind?: string): boolean {
  if (!kind) return false;
  const k = kind.toLowerCase().trim();
  return CUTOUT_KINDS.includes(k as CutoutKind);
}

export interface CutoutMeshOptions {
  imageUrl?: string;
  name?: string;
  kind?: string;
  height?: number;
  aspect?: number;
  colorHex?: number;
  isSelected?: boolean;
  isGhostWireframe?: boolean;
  showPedestal?: boolean;
}

// In-memory texture cache to prevent duplicate decodes of the same image
const textureCache = new Map<string, THREE.Texture>();

function createFallbackTexture(name: string, isSelected: boolean): THREE.Texture {
  if (typeof document === 'undefined') {
    return new THREE.Texture();
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = isSelected ? '#1e293b' : '#0f172a';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = isSelected ? '#f59e0b' : '#38bdf8';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 248, 248);

    ctx.fillStyle = isSelected ? '#f59e0b' : '#94a3b8';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STANDEE', 128, 100);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(name.slice(0, 16) || 'CUTOUT', 128, 140);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates an authentic 2D Cutout / Standee / Backdrop card for Previs Studio.
 * - Sits exactly grounded at y = 0.
 * - Width is derived from height * aspect ratio.
 * - Double-sided with alpha-testing, casting and receiving shadows.
 */
export function createCutoutMesh(options: CutoutMeshOptions): THREE.Group {
  const {
    imageUrl,
    name = 'Standee',
    kind = 'cutout',
    height: customHeight,
    aspect: customAspect,
    colorHex = 0xffffff,
    isSelected = false,
    showPedestal = true,
  } = options;

  const isBackdrop = kind.toLowerCase().trim() === 'backdrop';
  const height = customHeight ?? (isBackdrop ? BACKDROP_DEFAULT_HEIGHT : CUTOUT_DEFAULT_HEIGHT);
  let aspect = customAspect ?? (isBackdrop ? 16 / 9 : 0.65); // Default portrait for standees, widescreen for backdrop

  const group = new THREE.Group();
  group.name = `cutout_${name}`;

  // Card geometry: width derived from height * aspect
  const width = height * aspect;
  const planeGeo = new THREE.PlaneGeometry(width, height);

  // Material
  let texture: THREE.Texture | null = null;
  if (imageUrl) {
    if (textureCache.has(imageUrl)) {
      texture = textureCache.get(imageUrl)!;
    } else {
      try {
        const loader = new THREE.TextureLoader();
        texture = loader.load(
          imageUrl,
          (loadedTex) => {
            // If image loaded and aspect wasn't hardcoded, adjust width dynamically
            if (loadedTex.image && loadedTex.image.width && loadedTex.image.height) {
              const realAspect = loadedTex.image.width / loadedTex.image.height;
              if (Math.abs(realAspect - aspect) > 0.05) {
                cardMesh.geometry.dispose();
                cardMesh.geometry = new THREE.PlaneGeometry(height * realAspect, height);
              }
            }
          },
          undefined,
          (err) => {
            console.warn(`[CutoutMeshFactory] Failed to load texture [${imageUrl}]:`, err);
          }
        );
        textureCache.set(imageUrl, texture);
      } catch (err) {
        console.warn(`[CutoutMeshFactory] TextureLoader error:`, err);
      }
    }
  }

  if (!texture) {
    texture = createFallbackTexture(name, isSelected);
  }

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    color: isSelected ? 0xfff0c2 : colorHex,
    side: THREE.DoubleSide,
    alphaTest: 0.15,
    transparent: true,
    roughness: 0.88,
    metalness: 0.02,
  });

  const cardMesh = new THREE.Mesh(planeGeo, mat);
  cardMesh.position.set(0, height * 0.5, 0);
  cardMesh.castShadow = true;
  cardMesh.receiveShadow = true;
  cardMesh.name = 'standee_card';
  group.add(cardMesh);

  // Standee base bracket / pedestal (for character standees)
  if (showPedestal && !isBackdrop) {
    const standWidth = Math.min(width * 0.7, 0.6);
    const standDepth = 0.25;
    const standHeight = 0.03;
    const standGeo = new THREE.BoxGeometry(standWidth, standHeight, standDepth);
    const standMat = new THREE.MeshStandardMaterial({
      color: isSelected ? 0xf59e0b : 0x222630,
      roughness: 0.75,
      metalness: 0.1,
    });
    const standMesh = new THREE.Mesh(standGeo, standMat);
    standMesh.position.set(0, standHeight * 0.5, 0);
    standMesh.receiveShadow = true;
    standMesh.castShadow = true;
    standMesh.name = 'standee_pedestal';
    group.add(standMesh);
  }

  // Store metadata
  group.userData = {
    isCutout: true,
    height,
    width,
    aspect,
    imageUrl,
  };

  return group;
}
