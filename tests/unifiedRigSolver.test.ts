import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  HumanoidRig,
  createHumanoidSkeleton,
} from '../src/engine/kinematics/skeletonHierarchy';
import {
  loadFbxTemplate,
  instantiateMannequinRig,
  resolveMannequinUrlForIdentity,
  DEFAULT_MANNEQUIN_URL,
  FEMALE_MANNEQUIN_URL,
} from '../src/engine/kinematics/mannequinLoader';
import {
  evaluateMixamoClipOnRig,
} from '../src/engine/kinematics/mixamoClipLibrary';
import {
  evaluateUnifiedHumanoidFrame,
  verifyMixamoAnatomicalInvariants,
  convertSmpl24JointsToMixamoPose,
} from '../src/engine/kinematics/unifiedRigSolver';
import {
  extractMocapFromVideoElementOrFrames,
  NlfSmpl3dFrameDetection,
} from '../src/engine/kinematics/videoToMocapExtractor';
import { Actor } from '../src/types/shotspec';

async function loadRealMixamoYBotRig(): Promise<HumanoidRig> {
  const tpl = await loadFbxTemplate('/models/y-bot-tpose.fbx');
  return instantiateMannequinRig(tpl, { height: 5.06 });
}

describe('Step 1: Unified Mixamo-SMPL Humanoid Rig Solver (`unifiedRigSolver.ts`)', () => {
  it('loads the real Mixamo y-bot-tpose.fbx and keeps feet strictly below hips across Mocap, Clips, Gait, and Legacy Quaternions', async () => {
    const rig = await loadRealMixamoYBotRig();
    expect(rig.bones.size).toBeGreaterThanOrEqual(15);

    // 1. Test Mocap Pose Track (`anatomicalIk`) — must be exclusive (`mocap-pose-track`) and never overwritten by gait
    const mocapActor: Actor = {
      id: 'actor-mocap',
      name: 'Woman',
      kind: 'human',
      rigType: 'humanoid',
      token: 'woman walking on beach',
      actionDescription: 'walking forward',
      gait: 'walk', // Even if gait is 'walk', mocap track must take priority and never conflict!
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 47, y: 42, z: 0 },
        endPosition: { x: 47, y: 58, z: 0 },
        keyframes: [
          {
            id: 'kf-0',
            time: 0,
            position: { x: 47, y: 42, z: 0 },
            pose: {
              rotations: {},
              anatomicalIk: {
                leftAnkle: [0.09, 0.0, 0.14],
                rightAnkle: [-0.09, 0.04, -0.12],
                leftKneePole: [0.09, 0.28, 0.35],
                rightKneePole: [-0.09, 0.28, 0.35],
                leftFootPitch: 0,
                rightFootPitch: 0,
                leftHand: [0.16, 0.52, -0.08],
                rightHand: [-0.16, 0.52, 0.1],
                leftElbowPole: [0.28, 0.58, -0.32],
                rightElbowPole: [-0.28, 0.58, -0.32],
              },
            },
          },
          {
            id: 'kf-1',
            time: 2.0,
            position: { x: 47, y: 58, z: 0 },
            pose: {
              rotations: {},
              anatomicalIk: {
                leftAnkle: [0.09, 0.04, -0.12],
                rightAnkle: [-0.09, 0.0, 0.14],
                leftKneePole: [0.09, 0.28, 0.35],
                rightKneePole: [-0.09, 0.28, 0.35],
                leftFootPitch: 0,
                rightFootPitch: 0,
                leftHand: [0.16, 0.52, 0.1],
                rightHand: [-0.16, 0.52, -0.08],
                leftElbowPole: [0.28, 0.58, -0.32],
                rightElbowPole: [-0.28, 0.58, -0.32],
              },
            },
          },
        ],
      },
    };

    const diagMocap = evaluateUnifiedHumanoidFrame({
      rig,
      actor: mocapActor,
      timeSeconds: 0.5,
      shotDurationSeconds: 2.0,
    });
    expect(diagMocap.sourceUsed).toBe('mocap-pose-track');
    expect(diagMocap.leftFootLocalY).toBeLessThan(diagMocap.hipsLocalY);
    expect(diagMocap.rightFootLocalY).toBeLessThan(diagMocap.hipsLocalY);
    expect(diagMocap.leftFootLocalX).toBeGreaterThan(diagMocap.rightFootLocalX);

    // 2. Test Corrupted Legacy localStorage Quaternions (Identity quaternions on LeftUpLeg/RightUpLeg that previously flipped Mixamo legs 180 deg into the sky!)
    const corruptedLegacyActor: Actor = {
      id: 'actor-corrupted',
      name: 'Corrupted Legacy Actor',
      kind: 'human',
      rigType: 'humanoid',
      token: 'person',
      actionDescription: 'standing',
      gait: 'none',
      pose: {
        rotations: {
          Hips: [0, 0, 0, 1],
          LeftUpLeg: [0, 0, 0, 1], // On Mixamo Y-Bot, raw [0,0,0,1] without restRotations flips the leg 180 deg straight up!
          RightUpLeg: [0, 0, 0, 1],
          LeftLeg: [0, 0, 0, 1],
          RightLeg: [0, 0, 0, 1],
          LeftFoot: [0.1, 0, 0, 0.995],
          RightFoot: [0.1, 0, 0, 0.995],
        },
      },
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 50, y: 50, z: 0 },
        endPosition: { x: 50, y: 50, z: 0 },
      },
    };

    const diagCorrupted = evaluateUnifiedHumanoidFrame({
      rig,
      actor: corruptedLegacyActor,
      timeSeconds: 0.0,
      shotDurationSeconds: 4.0,
    });
    expect(diagCorrupted.leftFootLocalY).toBeLessThan(diagCorrupted.hipsLocalY);
    expect(diagCorrupted.rightFootLocalY).toBeLessThan(diagCorrupted.hipsLocalY);

    // 3. Test Ready-Made Motion Clip (`human-walk-forward`)
    const clipActor: Actor = {
      id: 'actor-clip',
      name: 'Clip Walker',
      kind: 'human',
      rigType: 'humanoid',
      token: 'walker',
      actionDescription: 'walking',
      motionClip: 'human-walk-forward',
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 50, y: 40, z: 0 },
        endPosition: { x: 50, y: 60, z: 0 },
      },
    };
    const diagClip = evaluateUnifiedHumanoidFrame({
      rig,
      actor: clipActor,
      timeSeconds: 0.75,
      shotDurationSeconds: 4.0,
    });
    expect(diagClip.sourceUsed).toBe('motion-clip');
    expect(diagClip.leftFootLocalY).toBeLessThan(diagClip.hipsLocalY);
    expect(diagClip.rightFootLocalY).toBeLessThan(diagClip.hipsLocalY);
  });

  it('converts 24-joint 3D SMPL coordinates (`convertSmpl24JointsToMixamoPose`) into valid Mixamo poses with +X Left and -X Right', async () => {
    const rig = await loadRealMixamoYBotRig();

    // Build a realistic 24-joint SMPL 3D frame in metric camera space (+X image-right, +Y image-down, +Z depth)
    const smpl24: number[][] = Array.from({ length: 24 }, () => [0, 0, 3.0]);
    smpl24[0] = [0.0, 0.0, 3.0]; // Pelvis
    smpl24[1] = [-0.1, 0.05, 3.0]; // L_Hip (subject's left is negative X in front-facing camera image)
    smpl24[2] = [0.1, 0.05, 3.0]; // R_Hip
    smpl24[4] = [-0.1, 0.45, 2.9]; // L_Knee
    smpl24[5] = [0.1, 0.45, 3.05]; // R_Knee
    smpl24[7] = [-0.1, 0.85, 2.85]; // L_Ankle (stepping forward)
    smpl24[8] = [0.1, 0.88, 3.12]; // R_Ankle (planted back)
    smpl24[12] = [0.0, -0.45, 3.0]; // Neck
    smpl24[15] = [0.0, -0.65, 3.0]; // Head
    smpl24[16] = [-0.18, -0.4, 3.0]; // L_Shoulder
    smpl24[17] = [0.18, -0.4, 3.0]; // R_Shoulder
    smpl24[18] = [-0.22, -0.15, 3.05]; // L_Elbow
    smpl24[19] = [0.22, -0.15, 2.95]; // R_Elbow
    smpl24[20] = [-0.2, 0.1, 2.9]; // L_Wrist
    smpl24[21] = [0.2, 0.1, 3.08]; // R_Wrist

    const converted = convertSmpl24JointsToMixamoPose(smpl24, 0.88, true);
    expect(converted.pose.anatomicalIk).toBeDefined();
    expect(converted.pose.anatomicalIk!.leftAnkle[0]).toBeGreaterThan(0.05);
    expect(converted.pose.anatomicalIk!.rightAnkle[0]).toBeLessThan(-0.05);

    const smplActor: Actor = {
      id: 'smpl-actor',
      name: 'SMPL Actor',
      kind: 'human',
      rigType: 'humanoid',
      token: 'actor',
      actionDescription: 'walking',
      gait: 'none',
      pose: converted.pose,
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 50, y: 50, z: 0 },
        endPosition: { x: 50, y: 50, z: 0 },
      },
    };

    const diag = evaluateUnifiedHumanoidFrame({
      rig,
      actor: smplActor,
      timeSeconds: 0,
      shotDurationSeconds: 2.0,
    });
    expect(diag.sourceUsed).toBe('mocap-pose-track');
    expect(diag.wasInversionHealed).toBe(false);
    expect(diag.leftFootLocalY).toBeLessThan(diag.hipsLocalY);
    expect(diag.rightFootLocalY).toBeLessThan(diag.hipsLocalY);
    expect(diag.leftFootLocalX).toBeGreaterThan(diag.rightFootLocalX);
    const inv = verifyMixamoAnatomicalInvariants(rig);
    expect(inv.isValid).toBe(true);
  });

  it('Step 3: builds multi-person side-by-side Mixamo tracks from NLF-Large 24-joint 3D SMPL detections (`nlfSmpl3dDetections`)', async () => {
    const rig = await loadRealMixamoYBotRig();

    const makePersonSmpl24 = (pelvisX: number, pelvisZ: number, phase: number): number[][] => {
      const s = Math.sin(phase) * 0.14;
      const arr: number[][] = Array.from({ length: 24 }, () => [pelvisX, 0, pelvisZ]);
      arr[0] = [pelvisX, 0.0, pelvisZ];
      arr[1] = [pelvisX - 0.1, 0.05, pelvisZ];
      arr[2] = [pelvisX + 0.1, 0.05, pelvisZ];
      arr[4] = [pelvisX - 0.1, 0.45, pelvisZ - s * 0.5];
      arr[5] = [pelvisX + 0.1, 0.45, pelvisZ + s * 0.5];
      arr[7] = [pelvisX - 0.1, 0.86 - Math.max(0, s) * 0.12, pelvisZ - s];
      arr[8] = [pelvisX + 0.1, 0.86 - Math.max(0, -s) * 0.12, pelvisZ + s];
      arr[12] = [pelvisX, -0.45, pelvisZ];
      arr[15] = [pelvisX, -0.66, pelvisZ];
      arr[16] = [pelvisX - 0.18, -0.4, pelvisZ];
      arr[17] = [pelvisX + 0.18, -0.4, pelvisZ];
      arr[18] = [pelvisX - 0.22, -0.15, pelvisZ + s * 0.3];
      arr[19] = [pelvisX + 0.22, -0.15, pelvisZ - s * 0.3];
      arr[20] = [pelvisX - 0.2, 0.1, pelvisZ + s * 0.6];
      arr[21] = [pelvisX + 0.2, 0.1, pelvisZ - s * 0.6];
      return arr;
    };

    const nlfFrames: NlfSmpl3dFrameDetection[] = [0, 1, 2, 3].map((idx) => ({
      frameIndex: idx,
      timeSec: idx * 0.5,
      persons: [
        {
          confidence: 0.94,
          bboxNorm: [0.35, 0.32, 0.08, 0.28],
          centerXNorm: 0.39,
          centerYNorm: 0.46,
          pelvis3d: [-0.8, 0.0, 15.0 - idx * 0.4],
          joints3dSmpl24: makePersonSmpl24(-0.8, 15.0 - idx * 0.4, idx * 1.1),
        },
        {
          confidence: 0.92,
          bboxNorm: [0.48, 0.32, 0.08, 0.28],
          centerXNorm: 0.52,
          centerYNorm: 0.46,
          pelvis3d: [0.8, 0.0, 15.0 - idx * 0.4],
          joints3dSmpl24: makePersonSmpl24(0.8, 15.0 - idx * 0.4, idx * 1.1 + Math.PI),
        },
      ],
    }));

    const res = extractMocapFromVideoElementOrFrames([], {
      fileName: 'beach_couple_walk.mp4',
      motionHintPrompt: 'a man and a woman walking side by side on a coastal beach',
      nlfSmpl3dDetections: nlfFrames,
    });

    expect(res.detectedPersonCount).toBe(2);
    expect(res.actorTracks).toHaveLength(2);
    // Both actors must be side-by-side near the center of the camera frustum (~47 and ~53)
    const distBetweenActors = Math.abs(
      res.actorTracks[0].startPosition.x - res.actorTracks[1].startPosition.x
    );
    expect(distBetweenActors).toBeGreaterThanOrEqual(4);
    expect(distBetweenActors).toBeLessThanOrEqual(10);

    // Camera must look at the midpoint between the two actors
    expect(res.cameraMotion.targetLookAt.x).toBeGreaterThanOrEqual(42);
    expect(res.cameraMotion.targetLookAt.x).toBeLessThanOrEqual(58);

    // Every frame of both actors must satisfy Mixamo anatomical invariants on y-bot-tpose.fbx
    for (const track of res.actorTracks) {
      const actor: Actor = {
        id: track.trackId,
        name: track.actorName,
        kind: 'human',
        rigType: 'humanoid',
        token: track.appearanceToken,
        actionDescription: track.actionSummary,
        gait: 'none',
        pose: track.poseKeyframes[0].pose,
        trajectory: {
          startTimeSeconds: 0,
          startPosition: track.startPosition,
          endPosition: track.endPosition,
          keyframes: track.trajectoryKeyframes,
        },
      };
      const diag = evaluateUnifiedHumanoidFrame({
        rig,
        actor,
        timeSeconds: 0.75,
        shotDurationSeconds: res.durationSeconds,
      });
      expect(diag.sourceUsed).toBe('mocap-pose-track');
      expect(diag.wasInversionHealed).toBe(false);
      expect(diag.leftFootLocalY).toBeLessThan(diag.hipsLocalY);
      expect(diag.rightFootLocalY).toBeLessThan(diag.hipsLocalY);
      expect(diag.leftFootLocalX).toBeGreaterThan(diag.rightFootLocalX);
    }
  });

  it('Step 5: loads both Male (y-bot-tpose.fbx) and Female (x-bot-tpose.fbx) Mixamo mannequins and evaluates 52-bone Mixamo Studio Motion Capture clips (walk, run, idle, agree, headShake)', async () => {
    expect(resolveMannequinUrlForIdentity('Man walking')).toBe(DEFAULT_MANNEQUIN_URL);
    expect(resolveMannequinUrlForIdentity('Woman walking on beach')).toBe(FEMALE_MANNEQUIN_URL);
    expect(resolveMannequinUrlForIdentity('امرأة تمشي')).toBe(FEMALE_MANNEQUIN_URL);

    const maleTpl = await loadFbxTemplate(DEFAULT_MANNEQUIN_URL);
    const femaleTpl = await loadFbxTemplate(FEMALE_MANNEQUIN_URL);
    expect(maleTpl).not.toBe(femaleTpl);

    const maleRig = instantiateMannequinRig(maleTpl, { height: 5.06 });
    const femaleRig = instantiateMannequinRig(femaleTpl, { height: 5.06 });

    expect(maleRig.mixamoBones?.size).toBeGreaterThanOrEqual(52);
    expect(femaleRig.mixamoBones?.size).toBeGreaterThanOrEqual(52);
    expect(maleRig.mixamoBones?.has('Spine2')).toBe(true);
    expect(maleRig.mixamoBones?.has('LeftToeBase')).toBe(true);
    expect(maleRig.mixamoBones?.has('LeftHandIndex1')).toBe(true);

    for (const rig of [maleRig, femaleRig]) {
      for (const clipName of [
        'walk',
        'run',
        'idle',
        'agree',
        'headShake',
        'sad_pose',
        'samba_dance',
        'dialogue_gesture',
        'action_look_around',
      ] as const) {
        for (const t of [0.0, 0.25, 0.5, 0.75]) {
          const res = evaluateMixamoClipOnRig(rig, clipName, t);
          expect(res.applied).toBe(true);
          const inv = verifyMixamoAnatomicalInvariants(rig);
          expect(inv.isValid).toBe(true);
          expect(inv.leftFootLocalY).toBeLessThan(inv.hipsLocalY);
          expect(inv.rightFootLocalY).toBeLessThan(inv.hipsLocalY);
        }
      }
    }

    // Also verify ready-made Mixamo clips through evaluateUnifiedHumanoidFrame
    for (const clipId of [
      'human-samba-dance',
      'human-dialogue-gesture',
      'human-action-patrol',
      'human-nod-agree',
      'human-head-shake-no',
      'human-sad-dejected',
    ] as const) {
      const diag = evaluateUnifiedHumanoidFrame({
        rig: maleRig,
        actor: {
          id: `actor-${clipId}`,
          name: 'Dancer',
          kind: 'human',
          rigType: 'humanoid',
          token: 'performer',
          actionDescription: clipId,
          motionClip: clipId,
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 50, y: 50, z: 0 },
            endPosition: { x: 50, y: 50, z: 0 },
          },
        },
        timeSeconds: 1.2,
        shotDurationSeconds: 4.5,
      });
      expect(diag.sourceUsed).toBe('motion-clip');
      expect(diag.wasInversionHealed).toBe(false);
      expect(diag.leftFootLocalY).toBeLessThan(diag.hipsLocalY);
      expect(diag.rightFootLocalY).toBeLessThan(diag.hipsLocalY);
    }
  });

  it('Step 6: retargets 24-joint SMPL Axis-Angle rotvecs (`poseRotvecsSmpl24`) onto 22 Mixamo bones via Bind-Pose Conjugate Retargeting with true facing yaw and zero stationary slide', async () => {
    const rig = await loadRealMixamoYBotRig();

    // Build realistic SMPL-24 joints + 24-joint Axis-Angle rotvecs (person turned ~45 deg, dancing in place)
    const makeFrame = (frameIdx: number): NlfSmpl3dFrameDetection => {
      const joints: number[][] = Array.from({ length: 24 }, () => [0, 0, 2.5]);
      joints[0] = [0.0, 0.0, 2.5];
      joints[1] = [0.1, 0.05, 2.5]; // L_Hip (+X in SMPL camera frame)
      joints[2] = [-0.1, 0.05, 2.5]; // R_Hip (-X in SMPL camera frame)
      joints[4] = [0.1, 0.45, 2.45];
      joints[5] = [-0.1, 0.45, 2.52];
      joints[7] = [0.1, 0.88, 2.48];
      joints[8] = [-0.1, 0.88, 2.52];
      joints[12] = [0.0, -0.45, 2.5];
      joints[15] = [0.0, -0.65, 2.5];
      joints[16] = [0.18, -0.4, 2.5];
      joints[17] = [-0.18, -0.4, 2.5];
      joints[18] = [0.22, -0.15, 2.45];
      joints[19] = [-0.22, -0.15, 2.45];
      // Left wrist crosses chest midline (pt[0] < pelvis[0], so charLocal X < 0)
      joints[20] = [-0.08, -0.25, 2.35];
      joints[21] = [0.08, -0.25, 2.35];

      const rotvecs: number[][] = Array.from({ length: 24 }, () => [0, 0, 0]);
      // Joint 0 (global_orient): upright in OpenCV camera space [pi*cos(yaw/2), roll, pi*sin(yaw/2)]
      rotvecs[0] = [3.1, -0.04, -0.45 - frameIdx * 0.08];
      rotvecs[1] = [-0.25, 0.04, -0.02]; // L_Hip flexion
      rotvecs[2] = [0.12, -0.03, 0.02]; // R_Hip extension
      rotvecs[3] = [0.08, 0.05, 0.0]; // Spine
      rotvecs[4] = [0.35, 0.0, 0.0]; // L_Knee flexion
      rotvecs[5] = [0.1, 0.0, 0.0]; // R_Knee flexion
      rotvecs[6] = [0.05, 0.06, 0.0]; // Spine1
      rotvecs[9] = [0.04, 0.05, 0.0]; // Spine2
      rotvecs[16] = [0.15, 0.25, -0.55]; // L_Shoulder lowered & angled forward
      rotvecs[17] = [0.15, -0.25, 0.55]; // R_Shoulder lowered & angled forward
      rotvecs[18] = [0.0, -0.65, 0.0]; // L_Elbow bent
      rotvecs[19] = [0.0, 0.65, 0.0]; // R_Elbow bent

      return {
        frameIndex: frameIdx,
        timeSec: frameIdx * 0.25,
        persons: [
          {
            confidence: 0.97,
            bboxNorm: [0.38, 0.2, 0.24, 0.65],
            centerXNorm: 0.5,
            centerYNorm: 0.52,
            pelvis3d: [0.0, 0.0, 2.5],
            joints3dSmpl24: joints,
            poseRotvecsSmpl24: rotvecs,
            trans3d: [0.0, 0.0, 2.5], // Stationary in depth (dzMeters = 0)
            shapeBetas: [0.1, -0.2, 0.05, 0, 0, 0, 0, 0, 0, 0],
          },
        ],
      };
    };

    const nlfFrames = [0, 1, 2, 3].map(makeFrame);
    const res = extractMocapFromVideoElementOrFrames([], {
      fileName: 'stationary_dance_turn.mp4',
      nlfSmpl3dDetections: nlfFrames,
    });

    // 1. Telemetry badge must report 'nlf-smpl24-rotvec'
    expect(res.extractionEngine).toBe('nlf-smpl24-rotvec');

    // 2. Stationary person (dzMeters = 0) must stay in place on stage (zero forced forward slide!)
    const track = res.actorTracks[0];
    expect(Math.abs(track.endPosition.y - track.startPosition.y)).toBeLessThan(0.5);

    // 3. Crossed hands must NOT be artificially clamped to >= 0.11
    const firstPose = track.poseKeyframes[0].pose!;
    expect(firstPose.anatomicalIk!.leftHand[0]).toBeLessThan(0);

    // 4. All 22 Mixamo bones must be populated in charSpaceRotations
    expect(firstPose.charSpaceRotations).toBeDefined();
    expect(Object.keys(firstPose.charSpaceRotations!).length).toBe(22);
    expect(firstPose.charSpaceRotations!.Spine2).toBeDefined();
    expect(firstPose.charSpaceRotations!.LeftForeArm).toBeDefined();
    expect(firstPose.charSpaceRotations!.LeftToeBase).toBeDefined();

    // 5. True facing yaw must be extracted onto trajectoryKeyframes[i].rotation.y
    expect(track.trajectoryKeyframes[0].rotation).toBeDefined();
    expect(Math.abs(track.trajectoryKeyframes[0].rotation!.y)).toBeGreaterThan(5);

    // 6. Applying onto real Mixamo Y-Bot must keep feet below hips and preserve anatomical invariants
    const diag = evaluateUnifiedHumanoidFrame({
      rig,
      actor: {
        id: 'smpl-rotvec-actor',
        name: 'Dancer',
        kind: 'human',
        rigType: 'humanoid',
        token: 'dancer',
        actionDescription: 'dancing',
        gait: 'none',
        pose: firstPose,
        trajectory: {
          startTimeSeconds: 0,
          startPosition: track.startPosition,
          endPosition: track.endPosition,
          keyframes: track.trajectoryKeyframes,
        },
      },
      timeSeconds: 0.35,
      shotDurationSeconds: res.durationSeconds,
    });
    expect(diag.sourceUsed).toBe('mocap-pose-track');
    expect(diag.wasInversionHealed).toBe(false);
    expect(diag.leftFootLocalY).toBeLessThan(diag.hipsLocalY);
    expect(diag.rightFootLocalY).toBeLessThan(diag.hipsLocalY);
  });

  it('Step 7: removes high-angle camera pitch tilt from Hips, disambiguates monocular bilateral-squat spikes into anti-phase walking strides, and advances stage trajectory during backward-tracking camera walks', async () => {
    const rig = await loadRealMixamoYBotRig();

    // Simulate a 6-frame walking sequence filmed from a +35 deg high-angle tracking camera (dzMeters = 0)
    // where frame 2 has a monocular bilateral-squat depth ambiguity spike (both hips -0.95, both knees +1.45)
    const nlfFrames: NlfSmpl3dFrameDetection[] = [0, 1, 2, 3, 4, 5].map((frameIdx) => {
      const phase = frameIdx * (Math.PI / 2);
      const strideSign = Math.sin(phase); // alternates +1, 0, -1
      const joints: number[][] = Array.from({ length: 24 }, () => [0, 0, 4.3]);
      joints[0] = [0.0, 0.25, 4.3];
      joints[1] = [0.1, 0.3, 4.3];
      joints[2] = [-0.1, 0.3, 4.3];
      joints[4] = [0.1, 0.52, 4.25];
      joints[5] = [-0.1, 0.52, 4.32];
      // Ankles alternate vertical position in image (+Y down): front ankle has larger Y
      const ankleSep = frameIdx === 2 ? 0.065 : strideSign * 0.07;
      joints[7] = [0.1, 0.72 + ankleSep, 4.25 - ankleSep * 1.5];
      joints[8] = [-0.1, 0.72 - ankleSep, 4.25 + ankleSep * 1.5];
      joints[12] = [0.0, -0.25, 4.3];
      joints[15] = [0.0, -0.45, 4.3];
      joints[16] = [0.18, -0.2, 4.3];
      joints[17] = [-0.18, -0.2, 4.3];
      joints[18] = [0.22, 0.05, 4.28];
      joints[19] = [-0.22, 0.05, 4.28];
      joints[20] = [0.22, 0.28, 4.25];
      joints[21] = [-0.22, 0.28, 4.25];

      const rotvecs: number[][] = Array.from({ length: 24 }, () => [0, 0, 0]);
      // Root in OpenCV camera space tilted by +35 deg high-angle camera (pi - 0.61 rad around X)
      rotvecs[0] = [2.53, 0.0, 0.0];
      if (frameIdx === 2) {
        // Monocular bilateral-squat depth ambiguity spike on passing frame
        rotvecs[1] = [-0.98, 0, 0];
        rotvecs[2] = [-0.95, 0, 0];
        rotvecs[3] = [0.62, 0, 0];
        rotvecs[4] = [1.48, 0, 0];
        rotvecs[5] = [1.42, 0, 0];
      } else {
        rotvecs[1] = [-0.45 * strideSign, 0, 0];
        rotvecs[2] = [0.45 * strideSign, 0, 0];
        rotvecs[3] = [0.22, 0, 0];
        rotvecs[4] = [strideSign < 0 ? 0.65 : 0.15, 0, 0];
        rotvecs[5] = [strideSign > 0 ? 0.65 : 0.15, 0, 0];
      }
      rotvecs[13] = [0.02, -0.02, -0.34]; // L_Collar
      rotvecs[14] = [-0.02, 0.02, 0.3]; // R_Collar
      rotvecs[16] = [0.15, -0.2 * strideSign, -0.82]; // L_Arm
      rotvecs[17] = [0.15, 0.2 * strideSign, 0.82]; // R_Arm
      rotvecs[18] = [0.25, -0.45, 0];
      rotvecs[19] = [0.25, 0.45, 0];

      return {
        frameIndex: frameIdx,
        timeSec: frameIdx * 0.2,
        persons: [
          {
            confidence: 0.94,
            bboxNorm: [0.42, 0.22, 0.16, 0.65],
            centerXNorm: 0.5,
            centerYNorm: 0.54,
            pelvis3d: [0.0, 0.25, 4.3],
            joints3dSmpl24: joints,
            poseRotvecsSmpl24: rotvecs,
            trans3d: [0.0, 0.25, 4.3], // Tracking camera keeps Z distance constant at 4.3m
            shapeBetas: [0.1, 0.0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
        ],
      };
    });

    const res = extractMocapFromVideoElementOrFrames([], {
      fileName: 'tunnel_tracking_walk.mp4',
      nlfSmpl3dDetections: nlfFrames,
    });

    const track = res.actorTracks[0];
    // 1. Backward-tracking camera walk (dzMeters = 0 but active foot strides) must advance forward on stage!
    expect(track.endPosition.y).toBeGreaterThan(track.startPosition.y + 2.5);

    // 2. Evaluate frame 2 (the healed bilateral-squat frame) on the real Mixamo Y-Bot rig
    const diagF2 = evaluateUnifiedHumanoidFrame({
      rig,
      actor: {
        id: 'tunnel-walker',
        name: 'Walker',
        kind: 'human',
        rigType: 'humanoid',
        token: 'walker',
        actionDescription: 'walking',
        gait: 'none',
        pose: track.poseKeyframes[2].pose,
        trajectory: {
          startTimeSeconds: 0,
          startPosition: track.startPosition,
          endPosition: track.endPosition,
          keyframes: track.trajectoryKeyframes,
        },
      },
      timeSeconds: 0.4,
      shotDurationSeconds: res.durationSeconds,
    });
    expect(diagF2.sourceUsed).toBe('mocap-pose-track');
    expect(diagF2.wasInversionHealed).toBe(false);
    // Character must stand tall and upright (hips well above feet, and disambiguated hips are in anti-phase!)
    const f2Pose = track.poseKeyframes[2].pose!;
    const qLeftThigh = new THREE.Quaternion(...(f2Pose.charSpaceRotations!.LeftUpLeg));
    const qRightThigh = new THREE.Quaternion(...(f2Pose.charSpaceRotations!.RightUpLeg));
    const eLeft = new THREE.Euler().setFromQuaternion(qLeftThigh, 'XYZ');
    const eRight = new THREE.Euler().setFromQuaternion(qRightThigh, 'XYZ');
    // Instead of both thighs flexed < -0.70 rad (bilateral squat), they are disambiguated into anti-phase stride!
    expect(Math.abs(eLeft.x - eRight.x)).toBeGreaterThan(0.25);
    expect(diagF2.hipsLocalY - Math.min(diagF2.leftFootLocalY, diagF2.rightFootLocalY)).toBeGreaterThan(0.7);
  });

  it('Step 9: keeps stance feet grounded on the floor and arms hanging naturally at sides under tilted crane camera & spine damping', async () => {
    const rig = await loadRealMixamoYBotRig();

    // Simulate a high-angle crane camera frame where ankle Y (-0.20m) is far above global stanceFloorAnkleY (+1.15m)
    // and where raw SMPL L_Shoulder/R_Shoulder rotvecs contain -0.54 rad camera-tilt compensation
    const joints: number[][] = Array.from({ length: 24 }, () => [0, -0.5, 4.9]);
    joints[0] = [0.16, -0.5, 4.9]; // Pelvis
    joints[1] = [0.22, -0.45, 4.98]; // L_Hip
    joints[2] = [0.1, -0.45, 4.82]; // R_Hip
    joints[4] = [0.22, -0.11, 4.95]; // L_Knee
    joints[5] = [0.1, -0.1, 4.85]; // R_Knee
    joints[7] = [0.22, 0.24, 4.95]; // L_Ankle
    joints[8] = [0.1, 0.25, 4.85]; // R_Ankle
    joints[12] = [0.16, -0.95, 4.9]; // Neck
    joints[15] = [0.16, -1.15, 4.9]; // Head
    joints[16] = [0.22, -0.9, 5.02]; // L_Shoulder
    joints[17] = [0.1, -0.9, 4.78]; // R_Shoulder
    joints[18] = [0.24, -0.65, 5.03]; // L_Elbow (hanging straight down along torso)
    joints[19] = [0.08, -0.65, 4.77]; // R_Elbow (hanging straight down along torso)
    joints[20] = [0.25, -0.42, 4.98]; // L_Wrist (hanging down below pelvis)
    joints[21] = [0.07, -0.42, 4.82]; // R_Wrist (hanging down below pelvis)

    const rotvecs: number[][] = Array.from({ length: 24 }, () => [0, 0, 0]);
    rotvecs[0] = [2.56, -1.13, 2.27]; // Tilted crane camera + ~70 deg yaw
    rotvecs[3] = [0.28, 0, 0];
    rotvecs[6] = [0.18, 0, 0];
    rotvecs[13] = [0.07, -0.2, -0.34];
    rotvecs[14] = [0.07, 0.2, 0.34];
    rotvecs[16] = [0.0, -0.54, -0.51]; // Uncompensated SMPL local shoulder rotvec
    rotvecs[17] = [0.0, 0.54, 0.51];
    rotvecs[18] = [0.31, -0.45, 0.0];
    rotvecs[19] = [0.31, 0.45, 0.0];

    const solved = convertSmpl24JointsToMixamoPose(joints, 1.15, true, rotvecs, [0.16, -0.5, 4.9]);
    // Per-frame stance foot lift must keep the lower ankle at 0 so the character never floats into mid-air
    expect(
      Math.min(solved.pose.anatomicalIk!.leftAnkle[1], solved.pose.anatomicalIk!.rightAnkle[1])
    ).toBe(0);

    const diag = evaluateUnifiedHumanoidFrame({
      rig,
      actor: {
        id: 'crane-walker',
        name: 'Crane Walker',
        kind: 'human',
        rigType: 'humanoid',
        token: 'walker',
        actionDescription: 'walking',
        gait: 'none',
        pose: solved.pose,
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: 50, y: 50, z: 0 },
          endPosition: { x: 50, y: 50, z: 0 },
        },
      },
      timeSeconds: 0,
      shotDurationSeconds: 2.0,
    });

    expect(diag.wasInversionHealed).toBe(false);
    // Hips must sit near Mixamo rest height (~97..103 cm -> ~0.53..0.58 normalized), never floating at ~145 cm!
    const hipsBone = rig.bones.get('Hips')!;
    const lFootBone = rig.bones.get('LeftFoot')!;
    const rFootBone = rig.bones.get('RightFoot')!;
    const lHandBone = rig.bones.get('LeftHand')!;
    const rHandBone = rig.bones.get('RightHand')!;
    const getLocalPos = (b: THREE.Object3D) => {
      const w = new THREE.Vector3();
      b.getWorldPosition(w);
      return rig.root.worldToLocal(w);
    };
    const pHips = getLocalPos(hipsBone);
    const pLFoot = getLocalPos(lFootBone);
    const pRFoot = getLocalPos(rFootBone);
    const pLHand = getLocalPos(lHandBone);
    const pRHand = getLocalPos(rHandBone);

    expect(Math.min(pLFoot.y, pRFoot.y)).toBeLessThan(14.0);
    expect(pHips.y).toBeLessThan(106.0);
    // Hands must hang naturally below HipsY (~85..98 cm) and close to the sides, not sticking out in front or flaring >35cm
    expect(pLHand.y).toBeLessThan(pHips.y);
    expect(pRHand.y).toBeLessThan(pHips.y);
    expect(Math.abs(pLHand.x)).toBeLessThan(33.0);
    expect(Math.abs(pRHand.x)).toBeLessThan(33.0);
  });

  it('Step 10: solves 3D metric camera lens (customFocalLengthMm, high-angle pitch, metric proximity) and populates all 19 HUMANOID_BONES with un-clamped raised-arm flexion', async () => {
    const rig = await loadRealMixamoYBotRig();

    // Simulate a high-angle rooftop sequence (~22 deg downward camera pitch, Z_cam walking from 4.0m to 2.9m)
    // with raised bent elbows (wrists above the pelvis in chest-level boxing/gesturing stance)
    const alphaRad = (22 * Math.PI) / 180;
    const makeHighAnglePerson = (zPelvis: number): number[][] => {
      const sinA = Math.sin(alphaRad);
      const cosA = Math.cos(alphaRad);
      // Floor point at depth zPelvis: yFloor = (zRef - zPelvis) * tan(alpha) + 0.75
      const yPelvis = (3.5 - zPelvis) * Math.tan(alphaRad);
      const j: number[][] = Array.from({ length: 24 }, () => [0, yPelvis, zPelvis]);
      j[0] = [0.0, yPelvis, zPelvis]; // Pelvis
      j[1] = [-0.1, yPelvis + 0.05 * cosA, zPelvis + 0.05 * sinA];
      j[2] = [0.1, yPelvis + 0.05 * cosA, zPelvis + 0.05 * sinA];
      j[4] = [-0.1, yPelvis + 0.44 * cosA, zPelvis + 0.44 * sinA - 0.12]; // L_Knee stepping forward
      j[5] = [0.1, yPelvis + 0.44 * cosA, zPelvis + 0.44 * sinA + 0.1];
      j[7] = [-0.1, yPelvis + 0.84 * cosA, zPelvis + 0.84 * sinA - 0.18]; // L_Ankle
      j[8] = [0.1, yPelvis + 0.84 * cosA, zPelvis + 0.84 * sinA + 0.14]; // R_Ankle
      j[12] = [0.0, yPelvis - 0.44 * cosA, zPelvis - 0.44 * sinA]; // Neck (closer to high-angle camera!)
      j[15] = [0.0, yPelvis - 0.64 * cosA, zPelvis - 0.64 * sinA]; // Head (closer to high-angle camera!)
      j[16] = [-0.18, yPelvis - 0.40 * cosA, zPelvis - 0.40 * sinA]; // L_Shoulder
      j[17] = [0.18, yPelvis - 0.40 * cosA, zPelvis - 0.40 * sinA]; // R_Shoulder
      j[18] = [-0.24, yPelvis - 0.18 * cosA, zPelvis - 0.25 * sinA]; // L_Elbow
      j[19] = [0.24, yPelvis - 0.18 * cosA, zPelvis - 0.25 * sinA]; // R_Elbow
      // Wrists raised up near chest level (well above pelvis!)
      j[20] = [-0.15, yPelvis - 0.34 * cosA, zPelvis - 0.48 * sinA - 0.22]; // L_Wrist raised forward
      j[21] = [0.15, yPelvis - 0.34 * cosA, zPelvis - 0.48 * sinA - 0.22]; // R_Wrist raised forward
      return j;
    };

    const depths = [4.0, 3.6, 3.2, 2.9];
    const nlfFrames: NlfSmpl3dFrameDetection[] = depths.map((z, idx) => ({
      frameIndex: idx,
      timeSec: idx * 0.5,
      persons: [
        {
          confidence: 0.95,
          // For 50mm lens at z ~ 3.4m, bboxH = (50 * 1.72 * cos(22)) / (24 * z)
          bboxNorm: [0.38, 0.18, 0.24, Number(((50 * 1.72 * Math.cos(alphaRad)) / (24 * z)).toFixed(3))],
          centerXNorm: 0.5,
          centerYNorm: 0.52,
          pelvis3d: [0, (3.5 - z) * Math.tan(alphaRad), z],
          trans3d: [0, (3.5 - z) * Math.tan(alphaRad), z],
          joints3dSmpl24: makeHighAnglePerson(z),
        },
      ],
    }));

    const res = extractMocapFromVideoElementOrFrames([], {
      fileName: 'rooftop_walk_clip.mp4',
      motionHintPrompt: '',
      nlfSmpl3dDetections: nlfFrames,
    });

    // 1. Verify Phase A: 3D Metric Camera Lens, High-Angle Pitch & Proximity
    expect(res.cameraMotion.angle).toBe('high-angle');
    expect(res.cameraMotion.pitchOffsetDeg).toBeGreaterThanOrEqual(14);
    expect(res.cameraMotion.customFocalLengthMm).toBeGreaterThanOrEqual(42);
    expect(res.cameraMotion.customFocalLengthMm).toBeLessThanOrEqual(58);
    expect(res.cameraMotion.focalLength).toBe('50mm');
    expect(res.cameraMotion.subjectDistanceMeters).toBeCloseTo(3.43, 1);

    // Camera Y distance to subject startPosition must reflect true ~3.4m metric proximity (7..14 Stage units), NOT hardcoded 26..32
    const actorStartY = res.actorTracks[0].startPosition.y;
    const camStartY = res.cameraMotion.startPosition.y;
    expect(camStartY - actorStartY).toBeGreaterThanOrEqual(6);
    expect(camStartY - actorStartY).toBeLessThanOrEqual(15);

    // 2. Verify Phase B: All 19 HUMANOID_BONES are populated in poseKeyframes[0].bones
    const firstKfBones = res.actorTracks[0].poseKeyframes[0].bones;
    expect(Object.keys(firstKfBones).length).toBeGreaterThanOrEqual(19);
    expect(firstKfBones.Hips).toBeDefined();
    expect(firstKfBones.Chest).toBeDefined();
    expect(firstKfBones.Head).toBeDefined();
    expect(firstKfBones.LeftForeArm).toBeDefined();
    expect(firstKfBones.RightForeArm).toBeDefined();

    // 3. Verify raised wrists above pelvis allow full elbow flexion (hands raised above HipsY)
    const diag = evaluateUnifiedHumanoidFrame({
      rig,
      actor: {
        id: 'raised-arms-actor',
        name: 'Raised Arms Actor',
        kind: 'human',
        rigType: 'humanoid',
        token: 'actor',
        actionDescription: 'boxing guard walk',
        gait: 'none',
        pose: res.actorTracks[0].poseKeyframes[0].pose,
        trajectory: {
          startTimeSeconds: 0,
          startPosition: { x: 50, y: 50, z: 0 },
          endPosition: { x: 50, y: 50, z: 0 },
        },
      },
      timeSeconds: 0,
      shotDurationSeconds: 2.0,
    });
    expect(diag.wasInversionHealed).toBe(false);
    const hipsBone = rig.bones.get('Hips')!;
    const lHandBone = rig.bones.get('LeftHand')!;
    const rHandBone = rig.bones.get('RightHand')!;
    const getLocalY = (b: THREE.Object3D) => {
      const w = new THREE.Vector3();
      b.getWorldPosition(w);
      return rig.root.worldToLocal(w).y;
    };
    // Because wrists in the 3D input are raised near chest level, hands must be ABOVE HipsY!
    expect(getLocalY(lHandBone)).toBeGreaterThan(getLocalY(hipsBone) + 5.0);
    expect(getLocalY(rHandBone)).toBeGreaterThan(getLocalY(hipsBone) + 5.0);
  });

  it('Step 11: enforces the strict 30-second maximum video duration rule and extracts dense 24-FPS frame-by-frame sequences with Savitzky-Golay smoothing', () => {
    // 1. Videos exceeding 30 seconds must be strictly rejected
    expect(() =>
      extractMocapFromVideoElementOrFrames([], {
        fileName: 'too_long_35s.mp4',
        targetDurationSeconds: 35,
      })
    ).toThrow(/exceeds the 30-second maximum limit/i);

    // 2. Dense 24-FPS NLF sequence (120 frames over 5.0 seconds) produces all 120 frame-by-frame keyframes
    const fps = 24;
    const durationSec = 5.0;
    const totalFrames = Math.round(durationSec * fps); // 120 frames
    const denseNlfFrames: NlfSmpl3dFrameDetection[] = Array.from({ length: totalFrames }, (_, idx) => {
      const tSec = Number(((idx / (totalFrames - 1)) * durationSec).toFixed(3));
      const phase = (idx / fps) * Math.PI * 2;
      const jitter = idx % 2 === 0 ? 0.015 : -0.015; // high-frequency jitter to test Savitzky-Golay filter
      const z = 4.0 - (idx / totalFrames) * 1.5;
      const arr: number[][] = Array.from({ length: 24 }, () => [0, 0, z]);
      arr[0] = [0.0, 0.0, z];
      arr[1] = [-0.1, 0.05, z];
      arr[2] = [0.1, 0.05, z];
      arr[4] = [-0.1, 0.45, z - Math.sin(phase) * 0.1];
      arr[5] = [0.1, 0.45, z + Math.sin(phase) * 0.1];
      arr[7] = [-0.1, 0.86, z - Math.sin(phase) * 0.18];
      arr[8] = [0.1, 0.86, z + Math.sin(phase) * 0.18];
      arr[12] = [0.0, -0.45, z];
      arr[15] = [0.0, -0.66, z];
      arr[16] = [-0.18, -0.4, z];
      arr[17] = [0.18, -0.4, z];
      arr[18] = [-0.24, -0.15 + jitter, z + Math.sin(phase) * 0.08];
      arr[19] = [0.24, -0.15 - jitter, z - Math.sin(phase) * 0.08];
      arr[20] = [-0.26, 0.08 + jitter * 1.5, z + Math.sin(phase) * 0.14];
      arr[21] = [0.26, 0.08 - jitter * 1.5, z - Math.sin(phase) * 0.14];
      return {
        frameIndex: idx,
        timeSec: tSec,
        persons: [
          {
            confidence: 0.94,
            bboxNorm: [0.4, 0.2, 0.2, 0.55],
            centerXNorm: 0.5,
            centerYNorm: 0.48,
            pelvis3d: [0, 0, z],
            trans3d: [0, 0, z],
            joints3dSmpl24: arr,
          },
        ],
      };
    });

    const denseRes = extractMocapFromVideoElementOrFrames([], {
      fileName: 'dense_24fps_5s_clip.mp4',
      smoothingStrength: 0.85,
      nlfSmpl3dDetections: denseNlfFrames,
    });

    expect(denseRes.durationSeconds).toBeCloseTo(5.0, 1);
    expect(denseRes.frameSamplesAnalyzed).toBe(120);
    expect(denseRes.actorTracks[0].poseKeyframes.length).toBe(120);
    expect(denseRes.actorTracks[0].trajectoryKeyframes.length).toBe(120);
    // Camera keyframes also scale with video duration (clamp(5 * 4, 8, 60) = 20)
    expect(denseRes.cameraMotion.keyframes.length).toBe(20);
  });

  it('Step 12: handles cropped-leg / waist-up videos (visibleBodyRatio < 0.65) without squashing unseen legs into the 2D frame or pulling the 3D camera back to full-body', () => {
    const croppedFrames: NlfSmpl3dFrameDetection[] = [0, 1, 2, 3, 4, 5].map((idx) => {
      const z = 2.1;
      const arr: number[][] = Array.from({ length: 24 }, () => [0, 0, z]);
      arr[0] = [0.0, 0.25, z]; // Pelvis near bottom of visible frame
      arr[1] = [-0.1, 0.3, z];
      arr[2] = [0.1, 0.3, z];
      // Simulate NLF tucking unseen knees/ankles when cropped at waist
      arr[4] = [-0.1, 0.42, z + 0.35];
      arr[5] = [0.1, 0.42, z + 0.35];
      arr[7] = [-0.1, 0.48, z + 0.55];
      arr[8] = [0.1, 0.48, z + 0.55];
      arr[12] = [0.0, -0.22, z];
      arr[15] = [0.0, -0.44, z];
      arr[16] = [-0.18, -0.18, z];
      arr[17] = [0.18, -0.18, z];
      arr[18] = [-0.24, 0.04, z - 0.05];
      arr[19] = [0.24, 0.04, z - 0.05];
      arr[20] = [-0.22, 0.16, z - 0.12];
      arr[21] = [0.22, 0.16, z - 0.12];
      return {
        frameIndex: idx,
        timeSec: idx * 0.2,
        persons: [
          {
            confidence: 0.93,
            bboxNorm: [0.32, 0.12, 0.36, 0.87], // Touches bottom of frame (0.12 + 0.87 = 0.99)
            unclampedBboxNorm: [0.32, 0.12, 0.36, 1.62],
            visibleBodyRatio: 0.54, // Only top 54% (head to waist) is visible in frame
            centerXNorm: 0.5,
            centerYNorm: 0.55,
            pelvis3d: [0.0, 0.25, z],
            trans3d: [0.0, 0.25, z],
            joints3dSmpl24: arr,
          },
        ],
      };
    });

    const croppedRes = extractMocapFromVideoElementOrFrames([], {
      fileName: 'waist_up_dialogue.mp4',
      nlfSmpl3dDetections: croppedFrames,
    });

    const lm0 = croppedRes.actorTracks[0].frameLandmarks![0];
    // Unseen ankles must project BELOW the visible frame (y > 1.0) and never show false FootMR contact inside the frame
    expect(lm0.joints.leftAnkle.y).toBeGreaterThan(1.0);
    expect(lm0.joints.rightAnkle.y).toBeGreaterThan(1.0);
    expect(lm0.leftFootContact).toBe(false);
    expect(lm0.rightFootContact).toBe(false);

    // 3D Camera must frame close (medium / medium-close-up) so the bottom of the 3D frustum cuts off the legs just like the video
    expect(['medium', 'medium-close-up', 'close-up']).toContain(croppedRes.cameraMotion.shotType);
    const camDistStageY =
      croppedRes.cameraMotion.startPosition.y - croppedRes.cameraMotion.targetLookAt.y;
    expect(camDistStageY).toBeLessThan(6.0);
  });

  it('Step 13: isolates NLF 3D camera from ocean-wave optical flow, dynamically pushes in from knee-crop to chest-crop, maintains continuous co-walking velocity when legs leave the frame, and preserves side-by-side couple proximity', () => {
    // Simulate a 12-frame beach couple walk (like 7893170-hd_1920_1080_30fps.mp4):
    // - Frames 0..5: couple visible down to knees/calves (visibleBodyRatio = 0.78, crownY = 0.14)
    // - Frames 6..11: camera pushes in to chest/shoulders MCU (visibleBodyRatio = 0.46, crownY = 0.04)
    // - Backward-tracking camera keeps pelvis Z around ~3.75m (with slight monocular Z noise on Person 2)
    const nlfBeachFrames: NlfSmpl3dFrameDetection[] = Array.from({ length: 12 }, (_, idx) => {
      const tSec = idx * 1.0;
      const isSecondHalf = idx >= 6;
      const visRatio = isSecondHalf ? 0.46 : 0.78;
      const crownY = isSecondHalf ? 0.04 : 0.14;
      const visBboxH = 1.0 - crownY;
      const unclampedH = Number((visBboxH / visRatio).toFixed(3));
      const phase = idx * (Math.PI / 2);
      const stride = Math.sin(phase) * 0.08;

      const makeBeachPerson = (px: number, pz: number, phaseSign: number) => {
        const s = stride * phaseSign;
        const arr: number[][] = Array.from({ length: 24 }, () => [px, 0, pz]);
        arr[0] = [px, 0.0, pz];
        arr[1] = [px - 0.1, 0.05, pz];
        arr[2] = [px + 0.1, 0.05, pz];
        arr[4] = [px - 0.1, 0.44, pz - s];
        arr[5] = [px + 0.1, 0.44, pz + s];
        arr[7] = [px - 0.1, 0.84 + s, pz - s * 1.5];
        arr[8] = [px + 0.1, 0.84 - s, pz + s * 1.5];
        arr[12] = [px, -0.44, pz];
        arr[15] = [px, -0.64, pz];
        arr[16] = [px - 0.18, -0.4, pz];
        arr[17] = [px + 0.18, -0.4, pz];
        arr[18] = [px - 0.22, -0.15, pz];
        arr[19] = [px + 0.22, -0.15, pz];
        arr[20] = [px - 0.22, 0.08, pz - 0.05];
        arr[21] = [px + 0.22, 0.08, pz - 0.05];

        const rv: number[][] = Array.from({ length: 24 }, () => [0, 0, 0]);
        rv[0] = [Math.PI, 0, 0];
        rv[1] = [-0.32 * Math.sin(phase) * phaseSign, 0.12, 0];
        rv[2] = [0.32 * Math.sin(phase) * phaseSign, -0.12, 0];
        rv[3] = [0.05, 0, idx % 2 === 0 ? 0.08 : -0.08]; // loose-shirt roll noise
        rv[4] = [0.25, 0, 0];
        rv[5] = [0.25, 0, 0];

        return {
          confidence: 0.95,
          bboxNorm: [px < 0 ? 0.32 : 0.52, crownY, 0.18, visBboxH] as [number, number, number, number],
          unclampedBboxNorm: [px < 0 ? 0.32 : 0.52, crownY, 0.18, unclampedH] as [
            number,
            number,
            number,
            number,
          ],
          visibleBodyRatio: visRatio,
          centerXNorm: px < 0 ? 0.41 : 0.61,
          centerYNorm: 0.52,
          pelvis3d: [px, 0.0, pz] as [number, number, number],
          trans3d: [px, 0.0, pz] as [number, number, number],
          joints3dSmpl24: arr,
          poseRotvecsSmpl24: rv,
        };
      };

      return {
        frameIndex: idx,
        timeSec: tSec,
        persons: [
          makeBeachPerson(-0.34, 3.74, 1),
          makeBeachPerson(0.36, 3.78 + (idx % 2) * 0.08, -1),
        ],
      };
    });

    const beachRes = extractMocapFromVideoElementOrFrames([], {
      fileName: '7893170-hd_1920_1080_30fps.mp4',
      nlfSmpl3dDetections: nlfBeachFrames,
    });

    expect(beachRes.actorTracks.length).toBe(2);
    const [man, woman] = beachRes.actorTracks;

    // 1. Point 4: True metric proximity (~0.70m apart -> ~2.7..3.2 Stage units) & synchronized Y progression
    const startGapX = Math.abs(woman.startPosition.x - man.startPosition.x);
    expect(startGapX).toBeGreaterThanOrEqual(2.4);
    expect(startGapX).toBeLessThanOrEqual(3.8);
    expect(Math.abs(woman.endPosition.y - man.endPosition.y)).toBeLessThanOrEqual(0.5);

    // 2. Point 3: Continuous forward walking velocity even in the second half (frames 6..11) when legs leave the frame!
    const midY = man.trajectoryKeyframes[5].position.y;
    const endY = man.trajectoryKeyframes[11].position.y;
    expect(midY).toBeGreaterThan(man.startPosition.y + 0.8);
    expect(endY).toBeGreaterThan(midY + 0.8);

    // 3. Point 2: Camera dynamically pushes in closer to the couple from start (knee-crop) to end (chest-crop)
    const camKfs = beachRes.cameraMotion.keyframes;
    const firstCamDistY = camKfs[0].position.y - camKfs[0].lookAt!.y;
    const lastCamDistY = camKfs[camKfs.length - 1].position.y - camKfs[camKfs.length - 1].lookAt!.y;
    expect(lastCamDistY).toBeLessThan(firstCamDistY);
  });

  it('Step 14: extracts distinct SMPL 3D body proportions (height, shoulder/hip ratios, bulkFactor, 6890v mesh flag) and applies anisotropic 3D body shape to Stage actors', async () => {
    const makeSmplPerson = (
      px: number,
      pz: number,
      shoulderHalfM: number,
      hipHalfM: number,
      torsoScale: number,
      legScale: number,
      betas: number[]
    ) => {
      const arr = Array.from({ length: 24 }, () => [px, 0, pz]);
      arr[0] = [px, 0.0, pz]; // Pelvis
      arr[1] = [px + hipHalfM, 0.06, pz]; // L_Hip
      arr[2] = [px - hipHalfM, 0.06, pz]; // R_Hip
      arr[3] = [px, -0.11 * torsoScale, pz]; // Spine1
      arr[4] = [px + hipHalfM, 0.44 * legScale, pz]; // L_Knee
      arr[5] = [px - hipHalfM, 0.44 * legScale, pz]; // R_Knee
      arr[6] = [px, -0.23 * torsoScale, pz]; // Spine2
      arr[7] = [px + hipHalfM, 0.85 * legScale, pz]; // L_Ankle
      arr[8] = [px - hipHalfM, 0.85 * legScale, pz]; // R_Ankle
      arr[9] = [px, -0.35 * torsoScale, pz]; // Spine3
      arr[10] = [px + hipHalfM, 0.88 * legScale, pz - 0.1]; // L_Foot
      arr[11] = [px - hipHalfM, 0.88 * legScale, pz - 0.1]; // R_Foot
      arr[12] = [px, -0.455 * torsoScale, pz]; // Neck
      arr[13] = [px + shoulderHalfM * 0.45, -0.41 * torsoScale, pz]; // L_Collar
      arr[14] = [px - shoulderHalfM * 0.45, -0.41 * torsoScale, pz]; // R_Collar
      arr[15] = [px, -0.65 * torsoScale, pz]; // Head
      arr[16] = [px + shoulderHalfM, -0.41 * torsoScale, pz]; // L_Shoulder
      arr[17] = [px - shoulderHalfM, -0.41 * torsoScale, pz]; // R_Shoulder
      arr[18] = [px + shoulderHalfM + 0.05, -0.15 * torsoScale, pz]; // L_Elbow
      arr[19] = [px - shoulderHalfM - 0.05, -0.15 * torsoScale, pz]; // R_Elbow
      arr[20] = [px + shoulderHalfM + 0.07, 0.08 * torsoScale, pz]; // L_Wrist
      arr[21] = [px - shoulderHalfM - 0.07, 0.08 * torsoScale, pz]; // R_Wrist
      return {
        confidence: 0.97,
        bboxNorm: [px < 0 ? 0.3 : 0.55, 0.18, 0.2, 0.68] as [number, number, number, number],
        centerXNorm: px < 0 ? 0.4 : 0.65,
        centerYNorm: 0.52,
        pelvis3d: [px, 0.0, pz] as [number, number, number],
        trans3d: [px, 0.0, pz] as [number, number, number],
        joints3dSmpl24: arr,
        shapeBetas: betas,
      };
    };

    const frames = [0, 1, 2, 3].map((idx) => ({
      frameIndex: idx,
      timeSec: idx * 0.2,
      persons: [
        // Person 1: Tall, broad-shouldered, stockier build
        makeSmplPerson(-0.4, 3.2, 0.215, 0.095, 1.08, 1.06, [-0.8, -1.2, 0.9, 0, 0, 0, 0, 0, 0, 0]),
        // Person 2: Shorter, narrower shoulders, slimmer build
        makeSmplPerson(0.4, 3.2, 0.155, 0.092, 0.92, 0.91, [0.9, 1.1, -0.5, 0, 0, 0, 0, 0, 0, 0]),
      ],
    }));

    const resOn = extractMocapFromVideoElementOrFrames([], {
      fileName: 'couple_shapes.mp4',
      nlfSmpl3dDetections: frames,
      extractBodyProportions: true,
    });
    expect(resOn.actorTracks.length).toBe(2);
    const [p1, p2] = resOn.actorTracks;

    expect(p1.bodyProportions.hasSkinnedMesh).toBe(true);
    expect(p1.bodyProportions.vertexCount).toBe(6890);
    expect(p1.bodyProportions.heightMeters).toBeGreaterThan(p2.bodyProportions.heightMeters + 0.1);
    expect(p1.bodyProportions.shoulderWidthRatio).toBeGreaterThan(1.05);
    expect(p2.bodyProportions.shoulderWidthRatio).toBeLessThan(0.96);
    expect(p1.bodyProportions.bulkFactor).toBeGreaterThan(p2.bodyProportions.bulkFactor + 0.1);

    // When extractBodyProportions is false, defaults to neutral 1.0 ratios
    const resOff = extractMocapFromVideoElementOrFrames([], {
      fileName: 'couple_shapes.mp4',
      nlfSmpl3dDetections: frames,
      extractBodyProportions: false,
    });
    expect(resOff.actorTracks[0].bodyProportions.shoulderWidthRatio).toBe(1.0);
    expect(resOff.actorTracks[0].bodyProportions.bulkFactor).toBe(1.0);

    // Verify 3D Stage anisotropic mesh & skeletal proportion application
    const { applyActorScaleAndBodyProportions } = await import('../src/components/StagePrevis3D');
    const rig = createHumanoidSkeleton(5.06);
    const stageGroup = new THREE.Group();
    stageGroup.userData.rig = rig;
    const ring = new THREE.Group();
    ring.name = '__base_ring_group__';
    stageGroup.add(ring);

    const baseShoulderX = rig.restPositions.get('LeftShoulder')!.x;
    applyActorScaleAndBodyProportions(stageGroup, {
      id: 'actor-test',
      name: 'Tall Broad Subject',
      kind: 'human',
      token: 'tall broad subject',
      actionDescription: 'walks',
      scale: 1.08,
      bodyProportions: p1.bodyProportions,
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } },
    });

    expect(stageGroup.scale.x).toBeGreaterThan(stageGroup.scale.y);
    expect(rig.restPositions.get('LeftShoulder')!.x).not.toBeCloseTo(baseShoulderX, 4);
    expect(rig.bones.get('Head')!.scale.x).toBeLessThan(1.0);
  });

  it('Step 15: instantiates true 6,890-vertex SMPL SkinnedMesh rig with exact beta blendshapes and keeps Mixamo Y-Bot unstretched', async () => {
    const {
      loadSmplMannequinModel,
      updateSmplRigShapeByProportions,
    } = await import('../src/engine/kinematics/smplMannequinLoader');
    const { applyActorScaleAndBodyProportions } = await import('../src/components/StagePrevis3D');

    // 1. Instantiate true 6,890-vertex SMPL rig
    const smplRig = await loadSmplMannequinModel({
      shapeBetas: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(smplRig.isSmplRig).toBe(true);
    expect(smplRig.isMannequinRig).toBe(true);
    expect(smplRig.skeleton.bones).toHaveLength(24);
    expect(smplRig.bones.size).toBe(19);

    const skinnedMesh = smplRig.root.userData.smplSkinnedMesh as THREE.SkinnedMesh;
    expect(skinnedMesh).toBeDefined();
    expect(skinnedMesh.isSkinnedMesh).toBe(true);
    const posAttr = skinnedMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(posAttr.count).toBe(6890);
    expect(skinnedMesh.geometry.index?.count).toBe(13776 * 3);

    // Measure waist/chest depth at neutral beta = 0 vs stocky beta_1 = -2.2
    const measureWaistDepth = (attr: THREE.BufferAttribute): number => {
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < attr.count; i++) {
        const y = attr.getY(i);
        // Waist band around 55%-65% of 5.06u height
        if (y >= 2.75 && y <= 3.35 && Math.abs(attr.getX(i)) < 0.8) {
          const z = attr.getZ(i);
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
      }
      return maxZ - minZ;
    };

    const neutralWaistDepth = measureWaistDepth(posAttr);
    updateSmplRigShapeByProportions(smplRig, {
      heightMeters: 1.82,
      shoulderWidthRatio: 1.15,
      hipWidthRatio: 1.08,
      torsoLengthRatio: 1.04,
      legLengthRatio: 1.02,
      armLengthRatio: 1.02,
      bulkFactor: 1.24,
      hasSkinnedMesh: true,
      humanoidMeshMode: 'smpl',
      shapeBetas: [-0.8, -2.2, 0.5, 0, 0, 0, 0, 0, 0, 0],
    });
    const stockyWaistDepth = measureWaistDepth(posAttr);
    expect(stockyWaistDepth).toBeGreaterThan(neutralWaistDepth * 1.06);

    // Verify SMPL rig works with unified humanoid mocap pose solver and maintains uniform parent scale
    const smplGroup = new THREE.Group();
    smplGroup.userData.rig = smplRig;
    smplGroup.add(smplRig.root);
    applyActorScaleAndBodyProportions(smplGroup, {
      id: 'smpl-actor',
      name: 'SMPL Actor',
      kind: 'human',
      token: 'person',
      actionDescription: 'walks',
      scale: 1.0,
      bodyProportions: {
        heightMeters: 1.82,
        shoulderWidthRatio: 1.15,
        hipWidthRatio: 1.08,
        torsoLengthRatio: 1.04,
        legLengthRatio: 1.02,
        armLengthRatio: 1.02,
        bulkFactor: 1.24,
        hasSkinnedMesh: true,
        humanoidMeshMode: 'smpl',
        shapeBetas: [-0.8, -2.2, 0.5, 0, 0, 0, 0, 0, 0, 0],
      },
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } },
    });
    expect(smplGroup.scale.x).toBeCloseTo(smplGroup.scale.y, 4);
    expect(smplGroup.scale.z).toBeCloseTo(smplGroup.scale.y, 4);

    const inv = verifyMixamoAnatomicalInvariants(smplRig);
    expect(inv.isValid).toBe(true);

    // 2. Verify Mixamo Y-Bot stays 100% unstretched (uniform scale, zero vertex warping)
    const ybotRig = await loadRealMixamoYBotRig();
    const ybotGroup = new THREE.Group();
    ybotGroup.userData.rig = ybotRig;
    ybotGroup.add(ybotRig.root);
    applyActorScaleAndBodyProportions(ybotGroup, {
      id: 'ybot-actor',
      name: 'YBot Actor',
      kind: 'human',
      token: 'person',
      actionDescription: 'walks',
      scale: 1.0,
      bodyProportions: {
        heightMeters: 1.85,
        shoulderWidthRatio: 1.25,
        hipWidthRatio: 1.18,
        torsoLengthRatio: 1.05,
        legLengthRatio: 1.02,
        armLengthRatio: 1.02,
        bulkFactor: 1.32,
        hasSkinnedMesh: true,
        humanoidMeshMode: 'ybot',
      },
      trajectory: { startTimeSeconds: 0, startPosition: { x: 50, y: 50 }, endPosition: { x: 50, y: 50 } },
    });
    expect(ybotGroup.scale.x).toBeCloseTo(ybotGroup.scale.y, 4);
    expect(ybotGroup.scale.z).toBeCloseTo(ybotGroup.scale.y, 4);
  });

  it('Step 16: regularizes SMPL studio-mannequin groin/abdomen contour and preserves interactive FK/IK pose edits on dense Mocap tracks without T-pose flash or snap-back', async () => {
    const {
      loadSmplCanonicalTemplate,
      loadSmplMannequinModel,
    } = await import('../src/engine/kinematics/smplMannequinLoader');
    const { exportBonePose, applyBonePose } = await import('../src/engine/kinematics/posePresets');
    const { applyBoneRotationDelta } = await import('../src/engine/kinematics/boneTransformGizmo');
    const {
      recordTrajectoryPoseAtTime,
      interpolateActorPoseAtTime,
    } = await import('../src/engine/trajectoryMath');

    // 1. Verify SMPL studio-mannequin contour has smooth monotonic anterior taper (no overhanging belly or groin pouch bulge)
    const tpl = await loadSmplCanonicalTemplate();
    const maxFrontZInBand = (yCenter: number): number => {
      let maxZ = -Infinity;
      for (let i = 0; i < tpl.numVertices; i++) {
        const x = tpl.v_template[i * 3];
        const y = tpl.v_template[i * 3 + 1];
        const z = tpl.v_template[i * 3 + 2];
        if (Math.abs(x) < 0.04 && Math.abs(y - yCenter) < 0.012 && z > 0) {
          if (z > maxZ) maxZ = z;
        }
      }
      return maxZ;
    };

    const bellyZ = maxFrontZInBand(-0.14);
    const waistZ = maxFrontZInBand(-0.26);
    const groinZ = maxFrontZInBand(-0.35);
    expect(bellyZ).toBeLessThan(0.16); // Tamed from raw CAESAR 0.1932m pot-belly
    expect(groinZ).toBeLessThan(waistZ); // Groin tapers inward below pelvic brim instead of bulging out

    // 2. Verify interactive pose editing on a dense 24fps Mocap track (charSpaceRotations round-trip + delta propagation)
    const smplRig = await loadSmplMannequinModel();
    const baseMocapPose = {
      rotations: {
        LeftArm: [0, 0, -0.3827, 0.9239] as [number, number, number, number],
      },
      charSpaceRotations: {
        LeftArm: [0, 0, -0.3827, 0.9239] as [number, number, number, number],
        RightArm: [0, 0, 0.3827, 0.9239] as [number, number, number, number],
        LeftUpLeg: [-0.2588, 0, 0, 0.9659] as [number, number, number, number],
        RightUpLeg: [0.1736, 0, 0, 0.9848] as [number, number, number, number],
      },
    };

    const denseTrajectory = {
      startTimeSeconds: 0,
      startPosition: { x: 50, y: 50, z: 0 },
      endPosition: { x: 50, y: 60, z: 0 },
      keyframes: Array.from({ length: 10 }, (_, idx) => ({
        id: `kf_${idx}`,
        time: Number((idx * 0.07).toFixed(2)),
        position: { x: 50, y: 50 + idx, z: 0 },
        pose: JSON.parse(JSON.stringify(baseMocapPose)),
      })),
    };

    // Apply mocap pose at t = 0.21s, rotate LeftArm forward by +45 deg, and export pose
    applyBonePose(smplRig, baseMocapPose);
    applyBoneRotationDelta(smplRig, 'LeftArm', 'x', Math.PI / 4);
    const expectedLeftArmQuat = smplRig.bones.get('LeftArm')!.quaternion.clone();

    const exportedPose = exportBonePose(smplRig);
    expect(exportedPose.charSpaceRotations).toBeDefined();
    expect(exportedPose.charSpaceRotations!.LeftArm).toBeDefined();

    // Record at t = 0.21s (index 3) in a dense 0.07s track
    const updatedTraj = recordTrajectoryPoseAtTime(
      denseTrajectory,
      0.21,
      1.0,
      exportedPose,
      undefined,
      'none',
      { basePose: baseMocapPose, propagateMode: 'whole-track' }
    );

    // Must NOT duplicate timestamp 0.21s by shifting kf_0 (0.00s) onto 0.21s
    expect(updatedTraj.keyframes![0].time).toBeCloseTo(0.0, 3);
    expect(updatedTraj.keyframes![3].time).toBeCloseTo(0.21, 3);

    // Evaluating at t = 0.21s AND at subsequent frame t = 0.28s must preserve the edited LeftArm rotation (no T-pose flash or snap-back!)
    for (const evalT of [0.21, 0.245, 0.28]) {
      const interp = interpolateActorPoseAtTime(updatedTraj, updatedTraj.keyframes![0].pose, evalT, 1.0);
      expect(interp.pose?.charSpaceRotations?.LeftArm).toBeDefined();
      applyBonePose(smplRig, interp.pose!);
      const posedQuat = smplRig.bones.get('LeftArm')!.quaternion;
      expect(posedQuat.angleTo(expectedLeftArmQuat)).toBeLessThan(0.02);
    }
  });
});
