import { Actor, Point2D, TrajectoryKeyframe } from '../../types/shotspec';
import { isGroundVehicleActor } from '../kinematics/vehicleDriveKinematics';
import {
  evaluateTerrainNormalAndSlope,
  ResolvedTerrainConfig,
} from './terrainGenerator';

export interface NavmeshObstacle {
  id: string;
  name: string;
  x: number; // stage meters (-50..+50)
  z: number; // stage meters (-50..+50)
  radius: number; // stage meters
}

export interface NavmeshPathOptions {
  obstacles?: NavmeshObstacle[];
  terrainConfig?: ResolvedTerrainConfig;
  clearanceRadius?: number;
  maxSlopeDeg?: number;
}

export interface NavmeshPathResult {
  pointsMeters: Array<{ x: number; z: number }>;
  keyframes: TrajectoryKeyframe[];
  bypassedObstacles: string[];
  pathLengthMeters: number;
}

const GRID_MIN = -48;
const GRID_MAX = 48;
const CELL_SIZE = 1.5;
const GRID_DIM = Math.round((GRID_MAX - GRID_MIN) / CELL_SIZE); // 64x64

function worldToCell(x: number, z: number): { cx: number; cz: number } {
  const cx = Math.max(0, Math.min(GRID_DIM - 1, Math.floor((x - GRID_MIN) / CELL_SIZE)));
  const cz = Math.max(0, Math.min(GRID_DIM - 1, Math.floor((z - GRID_MIN) / CELL_SIZE)));
  return { cx, cz };
}

function cellToWorld(cx: number, cz: number): { x: number; z: number } {
  return {
    x: GRID_MIN + (cx + 0.5) * CELL_SIZE,
    z: GRID_MIN + (cz + 0.5) * CELL_SIZE,
  };
}

/**
 * Extracts physical stage obstacles (props, buildings, trees, furniture, other stationary actors)
 * relative to the moving subject.
 */
export function extractStageObstaclesForActor(
  subjectActor: Actor,
  allActors: Actor[]
): NavmeshObstacle[] {
  const obstacles: NavmeshObstacle[] = [];
  for (const other of allActors) {
    if (other.id === subjectActor.id) continue;
    if (other.socketToBone?.targetActorId) continue;

    // Ignore airborne objects
    const startZ = other.trajectory?.startPosition?.z ?? 0;
    if (startZ > 4) continue;

    const ox = (other.trajectory.startPosition.x - 50) * 1.0;
    const oz = (other.trajectory.startPosition.y - 50) * 1.0;
    const scale = other.scale ?? 1.0;
    const sig = `${other.kind || ''} ${other.name || ''} ${other.token || ''}`.toLowerCase();

    let baseRadius = 1.35;
    if (/\b(building|house|cabin|castle|tower|wall|bunker|arch|temple|fireplace|hearth)\b/i.test(sig)) {
      baseRadius = 3.6;
    } else if (/\b(car|vehicle|truck|van|suv|bus|tank|spaceship)\b/i.test(sig)) {
      baseRadius = 2.8;
    } else if (/\b(table|sofa|couch|bed|desk|tree|boulder|rock|fountain|statue)\b/i.test(sig)) {
      baseRadius = 2.0;
    }

    obstacles.push({
      id: other.id,
      name: other.name || other.id,
      x: ox,
      z: oz,
      radius: baseRadius * Math.max(0.7, Math.min(2.0, scale)),
    });
  }
  return obstacles;
}

/**
 * Computes 8-connected A* + Line-of-Sight String-Pulling path in stage meters (-48..+48),
 * avoiding both physical stage props/actors and steep terrain cliffs (> maxSlopeDeg).
 */
export function findNavmeshPathMeters(
  startMeters: { x: number; z: number },
  goalMeters: { x: number; z: number },
  options: NavmeshPathOptions = {}
): { points: Array<{ x: number; z: number }>; bypassedObstacles: string[] } {
  const obstacles = options.obstacles || [];
  const clearance = options.clearanceRadius ?? 1.65;
  const maxSlopeDeg = options.maxSlopeDeg ?? 30;
  const terrainConfig = options.terrainConfig;

  const totalDist = Math.hypot(goalMeters.x - startMeters.x, goalMeters.z - startMeters.z);
  if (totalDist < 0.8) {
    return { points: [startMeters, goalMeters], bypassedObstacles: [] };
  }

  // Build blocked & traversal cost grid (64x64 = 4096 cells, < 0.5ms)
  const blocked = new Uint8Array(GRID_DIM * GRID_DIM);
  const penalty = new Float32Array(GRID_DIM * GRID_DIM);

  const startCell = worldToCell(startMeters.x, startMeters.z);
  const goalCell = worldToCell(goalMeters.x, goalMeters.z);

  for (let cz = 0; cz < GRID_DIM; cz++) {
    for (let cx = 0; cx < GRID_DIM; cx++) {
      const idx = cz * GRID_DIM + cx;
      const { x, z } = cellToWorld(cx, cz);

      // Keep start & goal cells unblocked so actor can always leave start and reach goal
      if (
        (Math.abs(cx - startCell.cx) <= 1 && Math.abs(cz - startCell.cz) <= 1) ||
        (Math.abs(cx - goalCell.cx) <= 1 && Math.abs(cz - goalCell.cz) <= 1)
      ) {
        continue;
      }

      // Check terrain slope limit
      if (terrainConfig && terrainConfig.profile !== 'flat' && terrainConfig.heightScale > 0.001) {
        const { slopeDeg, height } = evaluateTerrainNormalAndSlope(x, z, terrainConfig);
        if (slopeDeg > maxSlopeDeg) {
          blocked[idx] = 1;
          continue;
        }
        // Slight cost preference for flatter ground
        penalty[idx] += slopeDeg * 0.08 + height * 0.12;
      }

      // Check obstacle clearance
      for (const obs of obstacles) {
        const d = Math.hypot(x - obs.x, z - obs.z);
        const hardR = obs.radius + clearance;
        const softR = hardR + 2.4;
        if (d < hardR) {
          blocked[idx] = 1;
          break;
        } else if (d < softR) {
          const u = 1 - (d - hardR) / (softR - hardR);
          penalty[idx] += u * u * 4.5;
        }
      }
    }
  }

  // Helper: Line-of-sight check between two world points
  const hasLineOfSight = (ax: number, az: number, bx: number, bz: number): boolean => {
    const dist = Math.hypot(bx - ax, bz - az);
    const samples = Math.max(2, Math.ceil(dist / (CELL_SIZE * 0.45)));
    for (let i = 1; i < samples; i++) {
      const u = i / samples;
      const px = ax + (bx - ax) * u;
      const pz = az + (bz - az) * u;
      const { cx, cz } = worldToCell(px, pz);
      const idx = cz * GRID_DIM + cx;
      if (blocked[idx] === 1 || penalty[idx] > 2.2) return false;
    }
    return true;
  };

  // Detect which obstacles actually intersect the direct straight line
  const bypassedObstacles: string[] = [];
  for (const obs of obstacles) {
    const dx = goalMeters.x - startMeters.x;
    const dz = goalMeters.z - startMeters.z;
    const lenSq = dx * dx + dz * dz;
    const tProj = lenSq > 1e-5 ? Math.max(0, Math.min(1, ((obs.x - startMeters.x) * dx + (obs.z - startMeters.z) * dz) / lenSq)) : 0;
    const nearX = startMeters.x + tProj * dx;
    const nearZ = startMeters.z + tProj * dz;
    if (Math.hypot(obs.x - nearX, obs.z - nearZ) < obs.radius + clearance + 0.6) {
      bypassedObstacles.push(obs.name);
    }
  }

  // Fast path: if direct line of sight is completely clear, return [start, goal]
  if (bypassedObstacles.length === 0 && hasLineOfSight(startMeters.x, startMeters.z, goalMeters.x, goalMeters.z)) {
    return { points: [startMeters, goalMeters], bypassedObstacles: [] };
  }

  // Run 8-connected A* search
  const totalCells = GRID_DIM * GRID_DIM;
  const gScore = new Float32Array(totalCells).fill(Infinity);
  const fScore = new Float32Array(totalCells).fill(Infinity);
  const cameFrom = new Int32Array(totalCells).fill(-1);
  const closed = new Uint8Array(totalCells);

  const startIdx = startCell.cz * GRID_DIM + startCell.cx;
  const goalIdx = goalCell.cz * GRID_DIM + goalCell.cx;

  const heuristic = (cx: number, cz: number): number => {
    const dx = Math.abs(cx - goalCell.cx);
    const dz = Math.abs(cz - goalCell.cz);
    return CELL_SIZE * (Math.max(dx, dz) + 0.41421356 * Math.min(dx, dz));
  };

  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(startCell.cx, startCell.cz);
  const openList: number[] = [startIdx];

  const dirs = [
    { dx: 1, dz: 0, cost: CELL_SIZE },
    { dx: -1, dz: 0, cost: CELL_SIZE },
    { dx: 0, dz: 1, cost: CELL_SIZE },
    { dx: 0, dz: -1, cost: CELL_SIZE },
    { dx: 1, dz: 1, cost: CELL_SIZE * Math.SQRT2 },
    { dx: -1, dz: 1, cost: CELL_SIZE * Math.SQRT2 },
    { dx: 1, dz: -1, cost: CELL_SIZE * Math.SQRT2 },
    { dx: -1, dz: -1, cost: CELL_SIZE * Math.SQRT2 },
  ];

  let found = false;
  while (openList.length > 0) {
    // Pop node with lowest fScore
    let bestPos = 0;
    let bestIdx = openList[0];
    let bestF = fScore[bestIdx];
    for (let i = 1; i < openList.length; i++) {
      const cand = openList[i];
      if (fScore[cand] < bestF) {
        bestF = fScore[cand];
        bestIdx = cand;
        bestPos = i;
      }
    }
    openList.splice(bestPos, 1);

    if (bestIdx === goalIdx) {
      found = true;
      break;
    }
    if (closed[bestIdx]) continue;
    closed[bestIdx] = 1;

    const cx = bestIdx % GRID_DIM;
    const cz = Math.floor(bestIdx / GRID_DIM);

    for (const d of dirs) {
      const nx = cx + d.dx;
      const nz = cz + d.dz;
      if (nx < 0 || nx >= GRID_DIM || nz < 0 || nz >= GRID_DIM) continue;
      const nIdx = nz * GRID_DIM + nx;
      if (closed[nIdx] || blocked[nIdx]) continue;

      // Prevent diagonal corner-cutting across blocked cells
      if (d.dx !== 0 && d.dz !== 0) {
        if (blocked[cz * GRID_DIM + nx] || blocked[nz * GRID_DIM + cx]) continue;
      }

      const tentativeG = gScore[bestIdx] + d.cost + penalty[nIdx];
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = bestIdx;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + heuristic(nx, nz);
        if (!openList.includes(nIdx)) {
          openList.push(nIdx);
        }
      }
    }
  }

  if (!found) {
    return { points: [startMeters, goalMeters], bypassedObstacles };
  }

  // Reconstruct raw grid path
  const rawCells: Array<{ x: number; z: number }> = [];
  let cur = goalIdx;
  while (cur !== -1) {
    const cx = cur % GRID_DIM;
    const cz = Math.floor(cur / GRID_DIM);
    rawCells.push(cellToWorld(cx, cz));
    if (cur === startIdx) break;
    cur = cameFrom[cur];
  }
  rawCells.reverse();
  rawCells[0] = { ...startMeters };
  rawCells[rawCells.length - 1] = { ...goalMeters };

  // Line-of-Sight String-Pulling to collapse grid stair-stepping into minimal smooth vertices
  const pulled: Array<{ x: number; z: number }> = [rawCells[0]];
  let anchor = 0;
  while (anchor < rawCells.length - 1) {
    let furthest = anchor + 1;
    for (let probe = rawCells.length - 1; probe > anchor + 1; probe--) {
      if (hasLineOfSight(rawCells[anchor].x, rawCells[anchor].z, rawCells[probe].x, rawCells[probe].z)) {
        furthest = probe;
        break;
      }
    }
    pulled.push(rawCells[furthest]);
    anchor = furthest;
  }

  // Apply 1 pass of Chaikin corner smoothing on interior waypoints so turns are curved
  if (pulled.length >= 3) {
    const smoothed: Array<{ x: number; z: number }> = [pulled[0]];
    for (let i = 1; i < pulled.length - 1; i++) {
      const prev = pulled[i - 1];
      const curr = pulled[i];
      const next = pulled[i + 1];
      smoothed.push({
        x: curr.x * 0.75 + prev.x * 0.25,
        z: curr.z * 0.75 + prev.z * 0.25,
      });
      smoothed.push({
        x: curr.x * 0.75 + next.x * 0.25,
        z: curr.z * 0.75 + next.z * 0.25,
      });
    }
    smoothed.push(pulled[pulled.length - 1]);
    return { points: smoothed, bypassedObstacles };
  }

  return { points: pulled, bypassedObstacles };
}

/**
 * Computes a complete obstacle-avoiding `TrajectoryKeyframe[]` sequence for a moving actor or vehicle
 * using the 67.js-inspired Navmesh A* + String-Pulling solver.
 */
export function computeSmartNavmeshTrajectory(
  actor: Actor,
  allActors: Actor[],
  durationSeconds: number,
  terrainConfig?: ResolvedTerrainConfig
): NavmeshPathResult {
  const safeDur = Math.max(0.5, durationSeconds || 4.0);
  const startMeters = {
    x: (actor.trajectory.startPosition.x - 50) * 1.0,
    z: (actor.trajectory.startPosition.y - 50) * 1.0,
  };
  const goalMeters = {
    x: (actor.trajectory.endPosition.x - 50) * 1.0,
    z: (actor.trajectory.endPosition.y - 50) * 1.0,
  };

  const isVehicle = isGroundVehicleActor(actor);
  const obstacles = extractStageObstaclesForActor(actor, allActors);

  const { points, bypassedObstacles } = findNavmeshPathMeters(startMeters, goalMeters, {
    obstacles,
    terrainConfig,
    clearanceRadius: isVehicle ? 2.6 : 1.55,
    maxSlopeDeg: isVehicle ? 25 : 32,
  });

  // Compute cumulative arc length to assign proportional timestamps to each waypoint
  const cumDist: number[] = [0];
  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    totalLen += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    cumDist.push(totalLen);
  }

  const keyframes: TrajectoryKeyframe[] = [];
  if (points.length > 2 && totalLen > 0.5) {
    for (let i = 1; i < points.length - 1; i++) {
      const ratio = cumDist[i] / totalLen;
      const t = Number((ratio * safeDur).toFixed(2));
      const stageX = Number(Math.max(2, Math.min(98, points[i].x + 50)).toFixed(2));
      const stageY = Number(Math.max(2, Math.min(98, points[i].z + 50)).toFixed(2));
      const stageZ = actor.trajectory.startPosition.z ?? 0;
      const position: Point2D = { x: stageX, y: stageY, z: stageZ };
      keyframes.push({
        id: `kf_nav_${i}_${Math.round(t * 100)}`,
        time: t,
        position,
      });
    }
  }

  return {
    pointsMeters: points,
    keyframes,
    bypassedObstacles,
    pathLengthMeters: Number(totalLen.toFixed(2)),
  };
}

