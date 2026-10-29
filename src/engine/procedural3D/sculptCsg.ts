/**
 * Sculpt CSG: Booleans for sculpt recipes.
 * A cutter part declared with `op: "subtract" | "intersect"` cuts its parent part's geometry
 * using three-bvh-csg.
 */
import * as THREE from 'three';
import { Brush, Evaluator, HalfEdgeMap, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { MeshBVH } from 'three-mesh-bvh';

export type SculptOp = 'subtract' | 'intersect';

const OPERATIONS: Record<SculptOp, number> = {
  subtract: SUBTRACTION,
  intersect: INTERSECTION,
};

const CARRIED = ['position', 'normal', 'uv', 'color'];

/**
 * Custom Brush that sets targetLeafSize: 3 and builds half-edges synchronously.
 */
class SculptBrush extends Brush {
  override prepareGeometry() {
    const { geometry } = this;
    (geometry as any).boundsTree = new MeshBVH(geometry as any, { targetLeafSize: 3, indirect: true } as any);
    (geometry as any).halfEdges = new HalfEdgeMap();
    (geometry as any).halfEdges.updateFrom(geometry);
    (geometry as any).groupIndices = new Uint16Array(
      ((geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3) | 0
    );
  }
}

function lendColours(geometry: THREE.BufferGeometry, cutter: THREE.BufferGeometry) {
  const colour = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!colour || cutter.hasAttribute('color')) return;
  const { count, itemSize } = colour;
  const mean = Array.from({ length: itemSize }, (_, k) => {
    let sum = 0;
    for (let i = 0; i < count; i += 1) sum += colour.getComponent(i, k);
    return sum / count;
  });
  const lent = new THREE.BufferAttribute(
    new (colour.array.constructor as any)(cutter.getAttribute('position').count * itemSize),
    itemSize,
    colour.normalized
  );
  for (let i = 0; i < lent.count; i += 1) {
    for (let k = 0; k < itemSize; k += 1) lent.setComponent(i, k, mean[k]);
  }
  cutter.setAttribute('color', lent);
}

function evaluate(
  geometry: THREE.BufferGeometry,
  cutter: THREE.BufferGeometry,
  operation: number
): THREE.BufferGeometry {
  lendColours(geometry, cutter);
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  (evaluator as any).useCDTClipping = true;
  evaluator.attributes = CARRIED.filter(
    (name) =>
      geometry.hasAttribute(name) &&
      geometry.getAttribute(name).itemSize === cutter.getAttribute(name)?.itemSize
  );

  const a = new SculptBrush(geometry);
  const b = new SculptBrush(cutter);

  try {
    a.updateMatrixWorld();
    b.updateMatrixWorld();
    const result = evaluator.evaluate(a, b, operation).geometry;
    const pos = result.getAttribute('position');
    const points = pos ? Array.from(pos.array) : [];
    const reason =
      result.drawRange.count < 3
        ? 'it leaves nothing'
        : points.every(Number.isFinite)
        ? null
        : 'it yields non-finite points';
    if (reason) {
      result.dispose();
      throw new Error(reason);
    }
    if (!result.hasAttribute('normal')) result.computeVertexNormals();
    return result;
  } finally {
    a.disposeCacheData();
    b.disposeCacheData();
  }
}

export interface CutterTarget {
  id: string;
  parent?: string;
  op?: SculptOp;
  matrix: THREE.Matrix4;
}

/**
 * `geometry` (built for `part`, in its own frame) cut by every cutter whose parent is `part`.
 */
export function cutSculptGeometry(
  geometry: THREE.BufferGeometry,
  part: CutterTarget,
  cutters: CutterTarget[],
  buildCutterGeom: (c: CutterTarget) => THREE.BufferGeometry
): THREE.BufferGeometry {
  let cut = geometry;
  let parentInverse: THREE.Matrix4 | null = null;

  for (const cutter of cutters) {
    if (!cutter.op || cutter.parent !== part.id) continue;
    parentInverse ??= part.matrix.clone().invert();
    const toolMatrix = cutter.matrix.clone().premultiply(parentInverse);
    const tool = buildCutterGeom(cutter).applyMatrix4(toolMatrix);

    try {
      const next = evaluate(cut, tool, OPERATIONS[cutter.op]);
      cut.dispose();
      cut = next;
    } catch (error: any) {
      console.warn(
        `sculpt: skipped ${cutter.op} "${cutter.id}" on "${part.id}" (${error?.message}); part drawn without cut`
      );
    } finally {
      tool.dispose();
    }
  }

  return cut;
}
