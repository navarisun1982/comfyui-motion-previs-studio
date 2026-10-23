import * as THREE from 'three';
import { Actor, Point2D } from '../types/shotspec';
import { interpolateTrajectoryPosition } from './trajectoryMath';

export interface ProjectedKeypoint {
  x: number;
  y: number;
  visible: boolean;
  name: string;
}

export interface ActorPose2D {
  actorId: string;
  actorName: string;
  keypoints: ProjectedKeypoint[];
}

/**
 * Standard CMYK / OpenPose 18-limb color coding
 */
const OPENPOSE_LIMB_COLORS = [
  '#ff0000', '#ff5500', '#ffaa00', '#ffff00', '#aaff00', '#55ff00',
  '#00ff00', '#00ff55', '#00ffaa', '#00ffff', '#00aaff', '#0055ff',
  '#0000ff', '#aa00ff', '#ff00ff', '#ff00aa', '#ff0055', '#ff55aa',
];

/**
 * Renders a true linear WebGL depth pass from the active 3D camera.
 * Inverts grayscale so near geometry is white and background is dark (standard ControlNet depth format).
 */
export function renderDepthPass(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  width: number = 768,
  height: number = 432
): HTMLCanvasElement {
  const depthCanvas = document.createElement('canvas');
  depthCanvas.width = width;
  depthCanvas.height = height;
  const ctx = depthCanvas.getContext('2d');
  if (!ctx) return depthCanvas;

  // Create or swap with depth override material
  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.BasicDepthPacking,
  });

  const prevOverride = scene.overrideMaterial;
  const prevBackground = scene.background;

  scene.overrideMaterial = depthMaterial;
  scene.background = new THREE.Color(0x000000);

  // Render to depth canvas
  renderer.setSize(width, height, false);
  renderer.render(scene, camera);

  // Copy WebGL canvas buffer
  ctx.drawImage(renderer.domElement, 0, 0, width, height);

  // Post-process invert so near is white (ControlNet depth format)
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const val = 255 - data[i]; // Invert
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // Restore scene materials
  scene.overrideMaterial = prevOverride;
  scene.background = prevBackground;

  return depthCanvas;
}

/**
 * Projects 3D actor positions & articulated joint skeletons into 2D camera viewport coordinates.
 */
export function projectActorJointsTo2D(
  actor: Actor,
  camera: THREE.Camera,
  currentTime: number,
  duration: number,
  viewWidth: number,
  viewHeight: number
): ActorPose2D {
  const pos: Point2D = interpolateTrajectoryPosition(actor.trajectory, currentTime, duration);
  // Convert 0..100 stage coordinates to Three.js world space
  const stageX = (pos.x - 50) * 1.0;
  const stageZ = (pos.y - 50) * 1.0;
  const scale = actor.scale ?? 1.0;

  // Define 3D joint offsets relative to actor root position
  const joints3D: Record<string, THREE.Vector3> = {
    nose: new THREE.Vector3(stageX, 1.7 * scale, stageZ + 0.1),
    neck: new THREE.Vector3(stageX, 1.45 * scale, stageZ),
    rShoulder: new THREE.Vector3(stageX - 0.28 * scale, 1.4 * scale, stageZ),
    rElbow: new THREE.Vector3(stageX - 0.35 * scale, 1.05 * scale, stageZ),
    rWrist: new THREE.Vector3(stageX - 0.32 * scale, 0.75 * scale, stageZ + 0.1),
    lShoulder: new THREE.Vector3(stageX + 0.28 * scale, 1.4 * scale, stageZ),
    lElbow: new THREE.Vector3(stageX + 0.35 * scale, 1.05 * scale, stageZ),
    lWrist: new THREE.Vector3(stageX + 0.32 * scale, 0.75 * scale, stageZ + 0.1),
    pelvis: new THREE.Vector3(stageX, 0.9 * scale, stageZ),
    rHip: new THREE.Vector3(stageX - 0.18 * scale, 0.85 * scale, stageZ),
    rKnee: new THREE.Vector3(stageX - 0.18 * scale, 0.45 * scale, stageZ),
    rAnkle: new THREE.Vector3(stageX - 0.18 * scale, 0.05 * scale, stageZ),
    lHip: new THREE.Vector3(stageX + 0.18 * scale, 0.85 * scale, stageZ),
    lKnee: new THREE.Vector3(stageX + 0.18 * scale, 0.45 * scale, stageZ),
    lAnkle: new THREE.Vector3(stageX + 0.18 * scale, 0.05 * scale, stageZ),
    rEye: new THREE.Vector3(stageX - 0.06 * scale, 1.75 * scale, stageZ + 0.12),
    lEye: new THREE.Vector3(stageX + 0.06 * scale, 1.75 * scale, stageZ + 0.12),
    rEar: new THREE.Vector3(stageX - 0.12 * scale, 1.72 * scale, stageZ),
    lEar: new THREE.Vector3(stageX + 0.12 * scale, 1.72 * scale, stageZ),
  };

  const keypoints: ProjectedKeypoint[] = [];
  const tempVec = new THREE.Vector3();

  for (const [name, v3] of Object.entries(joints3D)) {
    tempVec.copy(v3);
    tempVec.project(camera);

    // In front of camera check (z between -1 and 1 in NDC)
    const visible = tempVec.z >= -1 && tempVec.z <= 1;
    const x = ((tempVec.x + 1) / 2) * viewWidth;
    const y = ((-tempVec.y + 1) / 2) * viewHeight;

    keypoints.push({
      name,
      x: Math.round(x),
      y: Math.round(y),
      visible,
    });
  }

  return {
    actorId: actor.id,
    actorName: actor.name,
    keypoints,
  };
}

/**
 * Renders an official 18-joint OpenPose color skeleton pass on a pure black background.
 */
export function renderOpenPosePass(
  actors: Actor[],
  camera: THREE.Camera,
  currentTime: number,
  duration: number,
  width: number = 768,
  height: number = 432
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Limb connections: pairs of joint names
  const limbs: [string, string][] = [
    ['neck', 'nose'],
    ['neck', 'rShoulder'],
    ['rShoulder', 'rElbow'],
    ['rElbow', 'rWrist'],
    ['neck', 'lShoulder'],
    ['lShoulder', 'lElbow'],
    ['lElbow', 'lWrist'],
    ['neck', 'pelvis'],
    ['pelvis', 'rHip'],
    ['rHip', 'rKnee'],
    ['rKnee', 'rAnkle'],
    ['pelvis', 'lHip'],
    ['lHip', 'lKnee'],
    ['lKnee', 'lAnkle'],
    ['nose', 'rEye'],
    ['rEye', 'rEar'],
    ['nose', 'lEye'],
    ['lEye', 'lEar'],
  ];

  actors.forEach((actor) => {
    if (actor.kind !== 'human' && actor.kind !== undefined) return;
    const pose = projectActorJointsTo2D(actor, camera, currentTime, duration, width, height);
    const kpMap = new Map<string, ProjectedKeypoint>();
    pose.keypoints.forEach((kp) => kpMap.set(kp.name, kp));

    // Draw limbs
    ctx.lineWidth = Math.max(2, Math.round(height * 0.008));
    ctx.lineCap = 'round';

    limbs.forEach(([jA, jB], limbIdx) => {
      const pA = kpMap.get(jA);
      const pB = kpMap.get(jB);
      if (pA && pB && pA.visible && pB.visible) {
        ctx.strokeStyle = OPENPOSE_LIMB_COLORS[limbIdx % OPENPOSE_LIMB_COLORS.length];
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }
    });

    // Draw joint dots
    pose.keypoints.forEach((kp) => {
      if (kp.visible) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, Math.max(2, Math.round(height * 0.006)), 0, Math.PI * 2);
        ctx.fill();
      }
    });
  });

  return canvas;
}
