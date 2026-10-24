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

export const OPENPOSE_LIMBS: OpenPoseLimbDef[] = [
  // Head & Spine
  { from: 'Nose', to: 'Neck', color: 'rgb(0, 0, 255)' },
  { from: 'Neck', to: 'Chest', color: 'rgb(85, 0, 255)' },
  { from: 'Chest', to: 'Hips', color: 'rgb(170, 0, 255)' },

  // Right Arm
  { from: 'Chest', to: 'RightShoulder', color: 'rgb(255, 0, 0)' },
  { from: 'RightShoulder', to: 'RightArm', color: 'rgb(255, 85, 0)' },
  { from: 'RightArm', to: 'RightHand', color: 'rgb(255, 170, 0)' },

  // Left Arm
  { from: 'Chest', to: 'LeftShoulder', color: 'rgb(0, 255, 0)' },
  { from: 'LeftShoulder', to: 'LeftArm', color: 'rgb(0, 255, 85)' },
  { from: 'LeftArm', to: 'LeftHand', color: 'rgb(0, 255, 170)' },

  // Right Leg
  { from: 'Hips', to: 'RightUpLeg', color: 'rgb(255, 255, 0)' },
  { from: 'RightUpLeg', to: 'RightLeg', color: 'rgb(170, 255, 0)' },
  { from: 'RightLeg', to: 'RightFoot', color: 'rgb(85, 255, 0)' },

  // Left Leg
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

  // Derive "Nose" from Head position offset forward
  const headBone = rig.bones.get('Head');
  if (headBone) {
    const headPos = new THREE.Vector3();
    headBone.getWorldPosition(headPos);
    const headRot = new THREE.Quaternion();
    headBone.getWorldQuaternion(headRot);

    // Forward face offset
    const forwardOffset = new THREE.Vector3(0, 0.04 * rig.height, 0.08 * rig.height).applyQuaternion(headRot);
    const noseWorldPos = headPos.clone().add(forwardOffset);
    const noseScreen = projectPoint(noseWorldPos);
    result.set('Nose', {
      name: 'Nose',
      x: noseScreen.x,
      y: noseScreen.y,
      visible: noseScreen.visible,
    });
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

    // 3. Draw joint dots
    for (const kp of keypoints.values()) {
      if (kp.visible) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, jointRadius, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
}
