/**
 * ControlNet OpenPose Previs Frame Renderer
 * 
 * Projects 3D HumanoidRig skeleton joints through the active 3D camera
 * to render standard 18-keypoint color-coded OpenPose skeleton passes.
 * 
 * Standard ControlNet OpenPose Color Specification:
 * - Solid black background (#000000)
 * - Color-coded anatomical limb vectors matching OpenPose / ControlNet expectations
 * - Circular anti-aliased joint markers
 */

import * as THREE from 'three';
import { HumanoidRig } from './skeletonHierarchy';

export interface OpenPoseKeypoint {
  name: string;
  x: number; // Pixels
  y: number; // Pixels
  visible: boolean;
}

export interface OpenPoseLimbDef {
  from: string;
  to: string;
  color: string;
}

export const OPENPOSE_KEYPOINT_COLORS: Record<string, string> = {
  Nose: 'rgb(255, 0, 0)',
  Neck: 'rgb(255, 85, 0)',
  RightShoulder: 'rgb(255, 128, 0)',
  RightArm: 'rgb(255, 170, 0)',
  RightForeArm: 'rgb(255, 255, 0)',
  RightHand: 'rgb(170, 255, 0)',
  LeftShoulder: 'rgb(85, 255, 0)',
  LeftArm: 'rgb(0, 255, 0)',
  LeftForeArm: 'rgb(0, 255, 170)',
  LeftHand: 'rgb(0, 255, 255)',
  RightUpLeg: 'rgb(0, 170, 255)',
  RightLeg: 'rgb(0, 85, 255)',
  RightFoot: 'rgb(0, 0, 255)',
  LeftUpLeg: 'rgb(85, 0, 255)',
  LeftLeg: 'rgb(170, 0, 255)',
  LeftFoot: 'rgb(255, 0, 255)',
  RightEye: 'rgb(255, 0, 170)',
  LeftEye: 'rgb(170, 0, 255)',
  RightEar: 'rgb(255, 0, 85)',
  LeftEar: 'rgb(255, 85, 0)',
  Chest: 'rgb(85, 0, 255)',
  Hips: 'rgb(170, 0, 255)',
  Spine: 'rgb(128, 0, 255)',
  Head: 'rgb(255, 0, 0)',
};

export const OPENPOSE_LIMBS: OpenPoseLimbDef[] = [
  // Face & Head
  { from: 'Nose', to: 'Neck', color: 'rgb(0, 0, 255)' },
  { from: 'Nose', to: 'RightEye', color: 'rgb(255, 0, 255)' },
  { from: 'RightEye', to: 'RightEar', color: 'rgb(255, 0, 170)' },
  { from: 'Nose', to: 'LeftEye', color: 'rgb(170, 0, 255)' },
  { from: 'LeftEye', to: 'LeftEar', color: 'rgb(255, 0, 85)' },

  // Spine & Torso
  { from: 'Neck', to: 'Chest', color: 'rgb(85, 0, 255)' },
  { from: 'Chest', to: 'Hips', color: 'rgb(170, 0, 255)' },

  // Right Arm (Collarbone -> UpperArm -> Elbow/ForeArm -> Hand)
  { from: 'Neck', to: 'RightShoulder', color: 'rgb(255, 0, 0)' },
  { from: 'RightShoulder', to: 'RightArm', color: 'rgb(255, 85, 0)' },
  { from: 'RightArm', to: 'RightForeArm', color: 'rgb(255, 170, 0)' },
  { from: 'RightForeArm', to: 'RightHand', color: 'rgb(255, 255, 0)' },

  // Left Arm (Collarbone -> UpperArm -> Elbow/ForeArm -> Hand)
  { from: 'Neck', to: 'LeftShoulder', color: 'rgb(0, 255, 0)' },
  { from: 'LeftShoulder', to: 'LeftArm', color: 'rgb(0, 255, 85)' },
  { from: 'LeftArm', to: 'LeftForeArm', color: 'rgb(0, 255, 170)' },
  { from: 'LeftForeArm', to: 'LeftHand', color: 'rgb(0, 255, 255)' },

  // Right Leg (Hips -> UpperLeg -> Knee/Leg -> Ankle/Foot)
  { from: 'Hips', to: 'RightUpLeg', color: 'rgb(255, 255, 0)' },
  { from: 'RightUpLeg', to: 'RightLeg', color: 'rgb(170, 255, 0)' },
  { from: 'RightLeg', to: 'RightFoot', color: 'rgb(85, 255, 0)' },

  // Left Leg (Hips -> UpperLeg -> Knee/Leg -> Ankle/Foot)
  { from: 'Hips', to: 'LeftUpLeg', color: 'rgb(0, 255, 255)' },
  { from: 'LeftUpLeg', to: 'LeftLeg', color: 'rgb(0, 170, 255)' },
  { from: 'LeftLeg', to: 'LeftFoot', color: 'rgb(0, 85, 255)' },
];

/**
 * Extracts 2D projected OpenPose keypoints from a HumanoidRig.
 */
export function extractOpenPoseKeypoints(
  rig: HumanoidRig,
  camera: THREE.Camera,
  width: number,
  height: number
): Map<string, OpenPoseKeypoint> {
  const result = new Map<string, OpenPoseKeypoint>();

  // Ensure rig world matrices are up-to-date
  rig.root.updateMatrixWorld(true);

  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(camDir);

  const projectPoint = (worldPos: THREE.Vector3): { x: number; y: number; visible: boolean } => {
    // Check if behind camera
    const toPoint = worldPos.clone().sub(camPos);
    if (toPoint.dot(camDir) <= 0.05) {
      return { x: 0, y: 0, visible: false };
    }

    const projected = worldPos.clone().project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const visible = projected.z >= -1 && projected.z <= 1;

    return { x, y, visible };
  };

  // Map rig bones
  for (const [boneName, bone] of rig.bones) {
    const worldPos = new THREE.Vector3();
    bone.getWorldPosition(worldPos);
    const screen = projectPoint(worldPos);
    result.set(boneName, {
      name: boneName,
      x: screen.x,
      y: screen.y,
      visible: screen.visible,
    });
  }

  // Derive facial keypoints (Nose, RightEye, LeftEye, RightEar, LeftEar) from Head bone
  const headBone = rig.bones.get('Head');
  if (headBone) {
    const headPos = new THREE.Vector3();
    headBone.getWorldPosition(headPos);
    const headRot = new THREE.Quaternion();
    headBone.getWorldQuaternion(headRot);
    const h = rig.height || 5.06;

    const noseOffset = new THREE.Vector3(0, 0.04 * h, 0.09 * h).applyQuaternion(headRot);
    const rEyeOffset = new THREE.Vector3(-0.03 * h, 0.06 * h, 0.075 * h).applyQuaternion(headRot);
    const lEyeOffset = new THREE.Vector3(0.03 * h, 0.06 * h, 0.075 * h).applyQuaternion(headRot);
    const rEarOffset = new THREE.Vector3(-0.07 * h, 0.045 * h, -0.01 * h).applyQuaternion(headRot);
    const lEarOffset = new THREE.Vector3(0.07 * h, 0.045 * h, -0.01 * h).applyQuaternion(headRot);

    const facePoints: Array<{ name: string; pos: THREE.Vector3 }> = [
      { name: 'Nose', pos: headPos.clone().add(noseOffset) },
      { name: 'RightEye', pos: headPos.clone().add(rEyeOffset) },
      { name: 'LeftEye', pos: headPos.clone().add(lEyeOffset) },
      { name: 'RightEar', pos: headPos.clone().add(rEarOffset) },
      { name: 'LeftEar', pos: headPos.clone().add(lEarOffset) },
    ];

    for (const fp of facePoints) {
      const screen = projectPoint(fp.pos);
      result.set(fp.name, {
        name: fp.name,
        x: screen.x,
        y: screen.y,
        visible: screen.visible,
      });
    }
  }

  return result;
}

/**
 * Renders an OpenPose skeleton pass onto a target 2D canvas.
 */
export function renderOpenPoseCanvas(
  rigs: HumanoidRig[],
  camera: THREE.Camera,
  targetCanvas: HTMLCanvasElement,
  width: number,
  height: number
): void {
  targetCanvas.width = width;
  targetCanvas.height = height;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  // 1. Pure black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const lineWidth = Math.max(3, Math.round(height / 180));
  const jointRadius = Math.max(2.5, Math.round(lineWidth * 0.8));

  for (const rig of rigs) {
    const keypoints = extractOpenPoseKeypoints(rig, camera, width, height);

    // 2. Draw limbs
    for (const limb of OPENPOSE_LIMBS) {
      const p1 = keypoints.get(limb.from);
      const p2 = keypoints.get(limb.to);

      if (p1 && p2 && p1.visible && p2.visible) {
        ctx.strokeStyle = limb.color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // 3. Draw color-coded joint dots matching ControlNet OpenPose specification
    for (const kp of keypoints.values()) {
      if (kp.visible) {
        const dotColor = OPENPOSE_KEYPOINT_COLORS[kp.name] || 'rgb(255, 255, 255)';
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, jointRadius, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
}
