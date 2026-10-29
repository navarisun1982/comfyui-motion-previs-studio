/**
 * Procedural surface detail textures for tactile materials.
 * Generates seamless 256x256 RGBA tiles using pure deterministic integer hashes.
 *
 * Channels:
 * - R: albedo detail / contrast (128 is neutral)
 * - G: height relief (0..255 spans bump depth)
 * - B: roughness variation (128 is neutral)
 * - A: secondary mask (e.g. mortar in brick, crevices)
 */

export const PATTERN_SIZE = 256;

function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const wrap = (i: number, n: number) => ((i % n) + n) % n;
const smooth = (t: number) => t * t * (3 - 2 * t);
const step = (a: number, b: number, x: number) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));

/** Value noise on a px by py lattice over the tile, seamless at its edges. */
function noise(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px, y = v * py, ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const x0 = wrap(ix, px), x1 = wrap(ix + 1, px), y0 = wrap(iy, py), y1 = wrap(iy + 1, py);
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(u: number, v: number, px: number, py: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * noise(u, v, px << o, py << o, seed + o);
    total += amp;
    amp /= 2;
  }
  return sum / total;
}

function cells(u: number, v: number, n: number, seed: number) {
  const x = u * n, y = v * n, ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = ix + dx, cy = iy + dy, wx = wrap(cx, n), wy = wrap(cy, n);
      const d = Math.hypot(cx + hash(wx, wy, seed) - x, cy + hash(wx, wy, seed + 1) - y) / n;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash(wx, wy, seed + 2);
      } else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, id };
}

export type PatternName = 'clay' | 'wood' | 'straw' | 'stone' | 'brick' | 'concrete' | 'brushed' | 'stipple' | 'weave' | 'paper' | 'leaves';

/** Pattern evaluators returning [albedo, height, roughness, mask] in 0..1 range */
const PATTERNS: Record<PatternName, (u: number, v: number) => [number, number, number, number]> = {
  clay(u, v) {
    const grit = noise(u, v, 128, 128, 10);
    const finger = fbm(u, v, 8, 8, 4, 11);
    const swirl = Math.sin(u * 20 + fbm(u, v, 4, 4, 2, 12) * 4) * 0.1;
    return [
      0.5 + 0.15 * grit + swirl,
      0.5 + 0.3 * grit + 0.2 * finger + swirl,
      0.5 + 0.2 * grit,
      0,
    ];
  },
  wood(u, v) {
    const late = (0.5 + 0.5 * Math.sin(2 * Math.PI * (u * 10 + fbm(u, v, 2, 1, 3, 11) * 2.2))) ** 6;
    const fibre = noise(u, v, 128, 4, 12), fleck = fbm(u, v, 16, 2, 2, 13);
    return [0.5 - 0.45 * late + 0.25 * fibre + 0.2 * fleck, 0.6 * fibre - 0.5 * late, 0.5 + 0.4 * late - 0.2 * fibre, 0];
  },
  straw(u, v) {
    const strand = 0.6 * noise(u, v, 192, 3, 21) + 0.4 * noise(u, v, 96, 2, 22);
    const course = v * 4 + 0.12 * noise(u, v, 48, 1, 23), cv = course - Math.floor(course);
    const shade = step(0.55, 1, cv);
    return [0.5 * strand - 0.45 * shade + 0.1 * fbm(u, v, 6, 2, 2, 24), 0.7 * (1 - cv) + 0.3 * strand, 0.5 + 0.2 * shade, 0];
  },
  stone(u, v) {
    const lump = fbm(u, v, 4, 4, 5, 31), cell = cells(u, v, 5, 32), grain = noise(u, v, 128, 128, 33);
    const edge = cell.f2 - cell.f1, crack = 1 - step(0, 0.012, edge);
    return [0.35 * lump + 0.25 * cell.id + 0.12 * grain - 0.35 * crack, 0.5 * lump + 0.35 * step(0, 0.08, edge) + 0.1 * grain, 0.25 * lump + 0.15 * crack, 0];
  },
  brick(u, v) {
    const row = Math.floor(v * 6), cv = v * 6 - row;
    const across = u * 2 + (row % 2 ? 0.5 : 0), col = Math.floor(across), cu = across - col;
    const gap = Math.min(Math.min(cu, 1 - cu) / 2, Math.min(cv, 1 - cv) / 6), joint = 0.01;
    const grit = noise(u, v, 96, 96, 42), mortar = 1 - step(joint * 0.6, joint, gap);
    return [0.35 * hash(wrap(col, 2), row, 41) + 0.15 * grit + 0.15 * fbm(u, v, 8, 8, 3, 43), 0.85 * step(joint * 0.6, joint * 2.2, gap) + 0.15 * grit, 0.1 * grit + 0.15 * mortar, mortar];
  },
  concrete(u, v) {
    const mottle = fbm(u, v, 3, 3, 5, 51), grit = noise(u, v, 160, 160, 52), pit = step(0.86, 0.95, noise(u, v, 48, 48, 53));
    return [0.3 * mottle + 0.1 * grit - 0.25 * pit, 0.4 * mottle + 0.25 * grit - 0.6 * pit, 0.2 * mottle, 0];
  },
  brushed(u, v) {
    const brush = 0.6 * noise(u, v, 3, 220, 61) + 0.4 * noise(u, v, 2, 110, 62), smudge = fbm(u, v, 3, 3, 4, 63);
    return [0.15 * brush + 0.1 * smudge, brush, 0.35 * brush + 0.4 * smudge, 0];
  },
  stipple(u, v) {
    const fine = noise(u, v, 128, 128, 71), wear = fbm(u, v, 6, 6, 3, 72);
    return [0.2 * wear + 0.1 * fine, fine, 0.3 * wear, 0];
  },
  weave(u, v) {
    const x = u * 32, y = v * 32, i = Math.floor(x), j = Math.floor(y);
    const across = Math.sin(Math.PI * (x - i)), along = Math.sin(Math.PI * (y - j)), warp = (i + j) % 2 === 0;
    const height = warp ? across * (0.75 + 0.25 * along) : along * (0.75 + 0.25 * across);
    return [0.3 * height + 0.2 * (warp ? hash(i, 0, 81) : hash(0, j, 82)) + 0.1 * noise(u, v, 256, 256, 83), height, -0.2 * height, 0];
  },
  paper(u, v) {
    const pulp = fbm(u, v, 8, 8, 4, 91), fibre = noise(u, v, 64, 8, 92) * noise(u, v, 8, 64, 93);
    return [0.12 * pulp + 0.1 * fibre, pulp + 0.5 * fibre, 0.1 * pulp, 0];
  },
  leaves(u, v) {
    const big = cells(u, v, 6, 101), small = cells(u, v, 9, 104);
    const domeBig = Math.max(0, 1 - big.f1 * 6 * 1.6), domeSmall = 0.9 * Math.max(0, 1 - small.f1 * 9 * 1.6);
    const top = domeBig >= domeSmall ? big : small, dome = Math.max(domeBig, domeSmall), gap = 1 - step(0, 0.15, dome);
    return [0.45 * top.id + 0.2 * dome - 0.5 * gap + 0.05 * noise(u, v, 64, 64, 107), dome, 0.3 * top.id + 0.3 * gap, 0];
  },
};

/** Generates a Uint8Array of size 256 * 256 * 4 representing the seamless RGBA tile. */
export function patternPixels(name: string): Uint8Array {
  const evaluate = PATTERNS[name as PatternName] ?? PATTERNS.clay;
  const pixels = new Uint8Array(PATTERN_SIZE * PATTERN_SIZE * 4);
  let rSum = 0, bSum = 0;
  const total = PATTERN_SIZE * PATTERN_SIZE;

  // First pass: generate values
  let idx = 0;
  for (let y = 0; y < PATTERN_SIZE; y += 1) {
    const v = y / PATTERN_SIZE;
    for (let x = 0; x < PATTERN_SIZE; x += 1) {
      const u = x / PATTERN_SIZE;
      const [r, g, b, a] = evaluate(u, v);
      pixels[idx] = Math.round(Math.min(1, Math.max(0, r)) * 255);
      pixels[idx + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
      pixels[idx + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
      pixels[idx + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
      rSum += pixels[idx];
      bSum += pixels[idx + 2];
      idx += 4;
    }
  }

  // Second pass: re-center R and B on 128 so authored colors and roughness aren't shifted
  const rOffset = 128 - Math.round(rSum / total);
  const bOffset = 128 - Math.round(bSum / total);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.min(255, Math.max(0, pixels[i] + rOffset));
    pixels[i + 2] = Math.min(255, Math.max(0, pixels[i + 2] + bOffset));
  }

  return pixels;
}
