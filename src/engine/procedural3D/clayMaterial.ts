/**
 * Tactile Clay Material System
 *
 * Implements triplanar procedural surface mapping with:
 * - Mikkelsen's surface gradient bump with unnormalized screen derivatives (dFdx/dFdy)
 * - Procedural tactile clay fingerprints, stippling, and fine micro-relief
 * - Roughness modulation from procedural noise
 * - Preset looks: clay, wood, straw, stone, brick, concrete, metal, glass, ceramic, fabric
 * - Linear per-vertex gradient color blending
 */
import * as THREE from 'three';
import { PATTERN_SIZE, patternPixels, PatternName } from './materialTextures';

export interface MaterialLookPreset {
  roughness: number;
  metalness?: number;
  color?: string;
  pattern?: PatternName;
  tile?: number;
  grain?: 'up' | 'long' | 'hang';
  contrast?: number;
  bump?: number;
  roughVar?: number;
  mask?: string;
  physical?: {
    transmission?: number;
    ior?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    sheen?: number;
    sheenRoughness?: number;
  };
}

export const MATERIAL_LOOKS: Record<string, MaterialLookPreset> = {
  clay: {
    roughness: 0.82,
    pattern: 'clay',
    tile: 0.25,
    contrast: 0.12,
    bump: 0.0018,
    roughVar: 0.08,
  },
  wood: {
    roughness: 0.68,
    color: '#9a6b3f',
    pattern: 'wood',
    tile: 0.5,
    grain: 'long',
    contrast: 0.32,
    bump: 0.0015,
    roughVar: 0.1,
  },
  straw: {
    roughness: 0.88,
    color: '#c8a85c',
    pattern: 'straw',
    tile: 0.6,
    grain: 'hang',
    contrast: 0.5,
    bump: 0.02,
    roughVar: 0.08,
  },
  stone: {
    roughness: 0.9,
    color: '#8d8a83',
    pattern: 'stone',
    tile: 1,
    contrast: 0.32,
    bump: 0.008,
    roughVar: 0.1,
  },
  brick: {
    roughness: 0.88,
    color: '#a5503a',
    pattern: 'brick',
    tile: 0.5,
    grain: 'hang',
    contrast: 0.22,
    bump: 0.008,
    roughVar: 0.08,
    mask: '#b9b3a8',
  },
  concrete: {
    roughness: 0.92,
    color: '#a7a49d',
    pattern: 'concrete',
    tile: 1.2,
    contrast: 0.2,
    bump: 0.0015,
    roughVar: 0.08,
  },
  metal: {
    roughness: 0.32,
    metalness: 0.95,
    color: '#c9ccd1',
    pattern: 'brushed',
    tile: 0.4,
    contrast: 0.06,
    bump: 0.0001,
    roughVar: 0.12,
  },
  glass: {
    roughness: 0.04,
    color: '#f2f7f7',
    physical: { transmission: 0.95, ior: 1.5 },
  },
  ceramic: {
    roughness: 0.35,
    color: '#efece4',
    physical: { clearcoat: 1, clearcoatRoughness: 0.06 },
  },
  fabric: {
    roughness: 0.95,
    pattern: 'weave',
    tile: 0.12,
    contrast: 0.22,
    bump: 0.0008,
    roughVar: 0.05,
    physical: { sheen: 1, sheenRoughness: 0.6 },
  },
  paper: {
    roughness: 0.88,
    color: '#ebe6da',
    pattern: 'paper',
    tile: 0.25,
    contrast: 0.08,
    bump: 0.0002,
  },
  foliage: {
    roughness: 0.62,
    color: '#4f7d34',
    pattern: 'leaves',
    tile: 0.6,
    contrast: 0.45,
    bump: 0.015,
    roughVar: 0.15,
    physical: { sheen: 0.8, sheenRoughness: 0.45 },
  },
  rubber: {
    roughness: 0.92,
    color: '#2d2d2f',
    pattern: 'stipple',
    tile: 0.15,
    contrast: 0.08,
    bump: 0.0003,
    roughVar: 0.06,
  },
  plastic: {
    roughness: 0.3,
    metalness: 0.05,
    color: '#3b82f6',
  },
};

const VERTEX_HEAD = `
uniform vec3 lookExtent;
uniform float lookTile;
uniform float lookGrain;
varying vec3 vLookPos;
varying vec3 vLookNormal;
`;

const VERTEX_BODY = `
mat3 lookFrame = mat3( modelMatrix );
#ifdef USE_INSTANCING
  lookFrame = lookFrame * mat3( instanceMatrix );
#endif
vec3 lookSize = max( vec3( length( lookFrame[ 0 ] ), length( lookFrame[ 1 ] ), length( lookFrame[ 2 ] ) ), vec3( 1e-6 ) );
vec3 lookExt = lookExtent * lookSize;
vec3 lookUp = vec3( lookFrame[ 0 ].y, lookFrame[ 1 ].y, lookFrame[ 2 ].y ) / lookSize;
int lookAxis = 1;
if ( lookGrain > 1.5 ) {
  vec3 score = abs( lookUp );
  float thin = min( lookExt.x, min( lookExt.y, lookExt.z ) );
  float mid = lookExt.x + lookExt.y + lookExt.z - thin - max( lookExt.x, max( lookExt.y, lookExt.z ) );
  if ( thin < 0.35 * mid ) score -= 2.0 * vec3( equal( lookExt, vec3( thin ) ) );
  lookAxis = score.x >= score.y && score.x >= score.z ? 0 : ( score.y >= score.z ? 1 : 2 );
} else if ( lookGrain > 0.5 ) {
  lookAxis = lookExt.x >= lookExt.y && lookExt.x >= lookExt.z ? 0 : ( lookExt.y >= lookExt.z ? 1 : 2 );
}
vec3 lookP = transformed * lookSize / max(lookTile, 0.01);
vec3 lookN = objectNormal / lookSize;
if ( lookAxis == 0 ) { lookP = lookP.yxz; lookN = lookN.yxz; }
else if ( lookAxis == 2 ) { lookP = lookP.xzy; lookN = lookN.xzy; }
if ( lookGrain > 1.5 && lookUp[ lookAxis ] < 0.0 ) { lookP.y = - lookP.y; lookN.y = - lookN.y; }
vLookPos = lookP;
vLookNormal = lookN;
`;

const FRAGMENT_HEAD = `
uniform sampler2D lookMap;
uniform vec4 lookAmount;
uniform vec3 lookMask;
varying vec3 vLookPos;
varying vec3 vLookNormal;
vec4 lookTriplanar( vec3 q, vec3 w ) {
  return texture2D( lookMap, q.zy ) * w.x + texture2D( lookMap, q.xz ) * w.y + texture2D( lookMap, q.xy ) * w.z;
}
vec3 lookPerturb( vec3 pos, vec3 n, vec2 dH, float face ) {
  vec3 sx = dFdx( pos ), sy = dFdy( pos );
  vec3 r1 = cross( sy, n ), r2 = cross( n, sx );
  float det = dot( sx, r1 ) * face;
  if ( abs( det ) < 1e-14 ) return n;
  return normalize( abs( det ) * n - sign( det ) * ( dH.x * r1 + dH.y * r2 ) );
}
`;

const FRAGMENT_COLOR = `
vec3 lookW = pow( abs( normalize( vLookNormal ) ), vec3( 4.0 ) );
lookW /= max(lookW.x + lookW.y + lookW.z, 1e-6);
vec4 lookTex = lookTriplanar( vLookPos, lookW );
vec2 lookDH = lookAmount.y * ( vec2( lookTriplanar( vLookPos + dFdx( vLookPos ), lookW ).g, lookTriplanar( vLookPos + dFdy( vLookPos ), lookW ).g ) - lookTex.g );
diffuseColor.rgb *= max( 0.0, 1.0 + ( lookTex.r - 0.5 ) * 2.0 * lookAmount.x );
diffuseColor.rgb = mix( diffuseColor.rgb, lookMask, lookTex.a * lookAmount.w );
`;

const FRAGMENT_ROUGHNESS = `
roughnessFactor = clamp( roughnessFactor + ( lookTex.b - 0.5 ) * 2.0 * lookAmount.z, 0.03, 1.0 );
`;

const FRAGMENT_NORMAL = `
normal = lookPerturb( - vViewPosition, normal, lookDH, faceDirection );
`;

const after = (marker: string, code: string) => (source: string) => source.replace(marker, `${marker}\n${code}`);
const patchVertex = [after('#include <common>', VERTEX_HEAD), after('#include <begin_vertex>', VERTEX_BODY)];
const patchFragment = [
  after('#include <common>', FRAGMENT_HEAD),
  after('#include <color_fragment>', FRAGMENT_COLOR),
  after('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS),
  after('#include <normal_fragment_maps>', FRAGMENT_NORMAL),
];

const GRAIN: Record<string, number> = { up: 0, long: 1, hang: 2 };
const patternTextures = new Map<string, THREE.DataTexture>();

function getPatternTexture(pattern: PatternName): THREE.DataTexture {
  let texture = patternTextures.get(pattern);
  if (!texture) {
    texture = new THREE.DataTexture(patternPixels(pattern), PATTERN_SIZE, PATTERN_SIZE);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    patternTextures.set(pattern, texture);
  }
  return texture;
}

function addTriplanarPattern(
  material: THREE.Material,
  preset: MaterialLookPreset,
  size: [number, number, number]
) {
  const uniforms = {
    lookMap: { value: null as THREE.Texture | null },
    lookTile: { value: preset.tile ?? 0.3 },
    lookExtent: { value: new THREE.Vector3(...size) },
    lookGrain: { value: GRAIN[preset.grain ?? 'up'] ?? 0 },
    lookAmount: {
      value: new THREE.Vector4(
        preset.contrast ?? 0,
        preset.bump ?? 0,
        preset.roughVar ?? 0,
        preset.mask ? 0.9 : 0
      ),
    },
    lookMask: { value: new THREE.Color(preset.mask ?? '#000000') },
  };

  material.onBeforeCompile = (shader) => {
    if (preset.pattern) {
      uniforms.lookMap.value = getPatternTexture(preset.pattern);
    }
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = patchVertex.reduce((src, patch) => patch(src), shader.vertexShader);
    shader.fragmentShader = patchFragment.reduce((src, patch) => patch(src), shader.fragmentShader);
  };
  (material as any).customProgramCacheKey = () => `sculpt-material-${preset.pattern ?? 'none'}`;
}

export interface LookOptions {
  material?: string;
  color?: string;
  roughness?: number;
  metalness?: number;
  size?: [number, number, number];
}

export function resolveMaterialPreset(id?: string): string {
  if (!id) return 'clay';
  const clean = id.toLowerCase().trim();
  if (MATERIAL_LOOKS[clean]) return clean;
  if (/stone|granite|rock|slate|marble|hearth|flint/i.test(clean)) return 'stone';
  if (/wood|timber|oak|pine|plank|cedar|bamboo/i.test(clean)) return 'wood';
  if (/straw|thatch|hay/i.test(clean)) return 'straw';
  if (/brick|terracotta|tile|chimney/i.test(clean)) return 'brick';
  if (/concrete|cement|pavement/i.test(clean)) return 'concrete';
  if (/metal|iron|steel|gold|brass|copper|bronze|alloy|chrome|titanium|aluminum|silver|quillon|blade|pommel/i.test(clean)) return 'metal';
  if (/glass|crystal|lens|window|translucent|potion|beacon/i.test(clean)) return 'glass';
  if (/ceramic|porcelain|pottery|clay_pot/i.test(clean)) return 'ceramic';
  if (/fabric|cloth|linen|canvas|leather|silk|rope|wool|tunic|strap/i.test(clean)) return 'fabric';
  if (/paper|parchment|scroll|label/i.test(clean)) return 'paper';
  if (/foliage|leaf|leaves|vine|plant|grass|shrub|tree/i.test(clean)) return 'foliage';
  if (/rubber|tire|tread/i.test(clean)) return 'rubber';
  if (/plastic|nylon|resin|polymer/i.test(clean)) return 'plastic';
  return 'clay';
}

/**
 * Creates an authentic procedural tactile material with triplanar bump and PBR shading.
 */
export function createTactileClayMaterial(opts: LookOptions): THREE.Material {
  const presetKey = resolveMaterialPreset(opts.material);
  const preset = MATERIAL_LOOKS[presetKey] ?? MATERIAL_LOOKS.clay;
  const size: [number, number, number] = opts.size ?? [1, 1, 1];
  const color = new THREE.Color(opts.color ?? preset.color ?? '#e2ded5');
  const roughness = opts.roughness !== undefined ? opts.roughness : preset.roughness;
  const metalness = opts.metalness !== undefined ? opts.metalness : (preset.metalness ?? 0);

  const baseParams = {
    color,
    roughness,
    metalness,
  };

  let mat: THREE.Material;
  if (preset.physical) {
    mat = new THREE.MeshPhysicalMaterial({
      ...baseParams,
      ...preset.physical,
    });
  } else {
    mat = new THREE.MeshStandardMaterial(baseParams);
  }

  if (preset.pattern) {
    addTriplanarPattern(mat, preset, size);
  }

  return mat;
}


export interface PartGradient {
  color: string;
  axis: 'x' | 'y' | 'z';
  from: number;
  to: number;
}

/**
 * Applies per-vertex linear color gradient across the part.
 */
export function applyPartGradient(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  baseColorHex: string,
  gradient: PartGradient,
  partSize: [number, number, number]
) {
  const base = new THREE.Color(baseColorHex);
  const end = new THREE.Color(gradient.color);
  const axisIdx = gradient.axis === 'x' ? 0 : gradient.axis === 'y' ? 1 : 2;
  const axisSize = partSize[axisIdx] || 1;

  const pos = geometry.getAttribute('position');
  if (!pos) return;
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const val = axisIdx === 0 ? pos.getX(i) : axisIdx === 1 ? pos.getY(i) : pos.getZ(i);
    const along = THREE.MathUtils.clamp(val / axisSize + 0.5, 0, 1);
    const t = gradient.to === gradient.from
      ? (along >= gradient.to ? 1 : 0)
      : THREE.MathUtils.clamp((along - gradient.from) / (gradient.to - gradient.from), 0, 1);

    c.copy(base).lerp(end, t);
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  (material as any).vertexColors = true;
  if ((material as any).color) (material as any).color.set(0xffffff);
  material.needsUpdate = true;
}
