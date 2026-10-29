import * as THREE from 'three';

/**
 * Procedural PBR Brick Coursing Texture
 * Renders warm running-bond terracotta lodge brickwork with deep mortar and surface relief
 */
export function createBrickCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#261b14';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 16;
    const cols = 8;
    const brickH = 512 / rows;
    const brickW = 512 / cols;
    const mortar = 3;
    const brickColors = ['#6e3422', '#5c281a', '#793b26', '#4b2014', '#632d1e', '#522417'];

    for (let r = 0; r < rows; r++) {
      const isOffset = r % 2 === 1;
      const startX = isOffset ? -brickW / 2 : 0;
      for (let c = -1; c <= cols + 1; c++) {
        const x = startX + c * brickW;
        const y = r * brickH;
        const colorIdx = (r * 11 + c * 17) % brickColors.length;
        ctx.fillStyle = brickColors[Math.abs(colorIdx)];
        ctx.fillRect(x + mortar, y + mortar, brickW - mortar * 2, brickH - mortar * 2);

        // Highlight upper edge for 3D bevel relief
        ctx.fillStyle = 'rgba(255, 180, 140, 0.12)';
        ctx.fillRect(x + mortar + 1, y + mortar + 1, brickW - mortar * 2 - 2, 2);
        // Shadow lower edge
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fillRect(x + mortar + 1, y + brickH - mortar - 2, brickW - mortar * 2 - 2, 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 4);
  return tex;
}

/**
 * Procedural Polished Hardwood Parquet Texture
 * Renders rich dark walnut / oak floorboards with specular luster
 */
export function createWoodParquetCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#2b1407';
    ctx.fillRect(0, 0, 512, 512);

    const planks = 16;
    const plankH = 512 / planks;
    const woodTones = ['#452414', '#381c0e', '#4c2916', '#2f1509', '#412211', '#4e2c18'];

    for (let p = 0; p < planks; p++) {
      const y = p * plankH;
      ctx.fillStyle = woodTones[p % woodTones.length];
      ctx.fillRect(0, y + 1, 512, plankH - 2);

      // Wood grain lines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, y + plankH - 1, 512, 1);
      ctx.fillStyle = 'rgba(255, 190, 130, 0.09)';
      ctx.fillRect(0, y + 2, 512, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}
