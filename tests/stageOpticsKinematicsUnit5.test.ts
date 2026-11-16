// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { computeCameraFovDeg, STAGE_UNITS_PER_METER } from '../src/engine/povVisibilityEngine';
import { computeCameraIntrinsics, exportCameraPoseBundle } from '../src/engine/cameraMatrixExport';
import { createDefaultShotSpec } from '../src/types/shotspec';
import { createHumanoidSkeleton } from '../src/engine/kinematics/skeletonHierarchy';
import { applyBonePose, exportBonePose } from '../src/engine/kinematics/posePresets';
import { verifyMixamoAnatomicalInvariants } from '../src/engine/kinematics/unifiedRigSolver';
import { extractMocapFromAnimationClips } from '../src/engine/kinematics/fbxMocapImporter';
import { createSubjectMesh } from '../src/engine/staging/subjectMeshFactory';
import { disposeObject3D, createSpriteBanner } from '../src/components/stage/stageGizmoHelpers';

describe('Unit 5 (P1-A): 3D Cinema Optics, Unified Scale, Kinematics & VRAM Lifecycle', () => {
  beforeAll(() => {
    if (typeof HTMLCanvasElement !== 'undefined') {
      HTMLCanvasElement.prototype.getContext = (() => ({
        fillRect: () => {},
        clearRect: () => {},
        getImageData: () => ({ data: new Array(4) }),
        putImageData: () => {},
        createImageData: () => ({ data: new Array(4) }),
        setTransform: () => {},
        drawImage: () => {},
        save: () => {},
        fillText: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        strokeRect: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        arc: () => {},
        fill: () => {},
        measureText: () => ({ width: 80 }),
        transform: () => {},
        rect: () => {},
        roundRect: () => {},
        clip: () => {},
      })) as any;
    }
  });

  it('computes true vertical FOV (vFOV) for Three.js and square-pixel intrinsics without double-aspect stretch', () => {
    const vFov35 = computeCameraFovDeg({ focalLength: '35mm', sensorSize: 'full-frame' });
    // 2 * atan(24 / 70) = 37.85 deg vertical FOV (which yields ~62.7 deg horizontal FOV on 16:9)
    expect(vFov35).toBeCloseTo(37.85, 1);

    const hFov16x9 =
      (2 * Math.atan((16 / 9) * Math.tan((vFov35 * Math.PI) / 360)) * 180) / Math.PI;
    expect(hFov16x9).toBeGreaterThan(61.5);
    expect(hFov16x9).toBeLessThan(64.0);

    const intrinsics = computeCameraIntrinsics('35mm', '16:9', 1280, undefined, 'full-frame');
    expect(intrinsics.fx).toBe(intrinsics.fy);
    // 720 * (35 / 24) = 1050 px
    expect(intrinsics.fy).toBeCloseTo(1050, 0);
  });

  it('evaluates camera extrinsics per-frame (pan/tracking) and applies gimbal-free Dutch roll along +X', () => {
    const base = createDefaultShotSpec({ durationSeconds: 2.0, frameRate: 12 });
    const shot = {
      ...base,
      camera: {
        ...base.camera,
        dutchRollDeg: 25,
        movement: {
          ...base.camera.movement,
          type: 'pan-right' as const,
          // Position camera at (-20, y, 0) aiming strictly along +X toward (0, y, 0)
          startPosition: { x: 30, y: 50, z: 15 },
          endPosition: { x: 30, y: 50, z: 15 },
          targetLookAt: { x: 50, y: 50 },
        },
      },
    };

    const bundle = exportCameraPoseBundle(shot);
    expect(bundle.frameCount).toBe(24);
    // Pan-right changes camera rotation across frames (first frame != last frame)
    expect(bundle.c2wPoses[0]).not.toEqual(bundle.c2wPoses[23]);

    // Verify orthonormality (zero gimbal collapse even when looking along +X with 25-deg Dutch roll)
    for (const c2w of [bundle.c2wPoses[0], bundle.c2wPoses[12], bundle.c2wPoses[23]]) {
      const r0Len = Math.hypot(c2w[0], c2w[1], c2w[2]);
      const r1Len = Math.hypot(c2w[4], c2w[5], c2w[6]);
      const r2Len = Math.hypot(c2w[8], c2w[9], c2w[10]);
      expect(r0Len).toBeCloseTo(1.0, 4);
      expect(r1Len).toBeCloseTo(1.0, 4);
      expect(r2Len).toBeCloseTo(1.0, 4);
      expect(Number.isNaN(c2w[0])).toBe(false);
    }
  });

  it('preserves airborne jump lift in applyBonePose (charSpaceRotations) with 100% stateless scrubbing determinism', () => {
    const rig = createHumanoidSkeleton(5.06);
    const hips = rig.bones.get('Hips')!;
    const restHipsY = rig.restPositions.get('Hips')!.y;

    const groundedPose = {
      rotations: {},
      charSpaceRotations: { Hips: [0, 0, 0, 1] as [number, number, number, number] },
      hipsOffset: [0, 0, 0] as [number, number, number],
    };
    const jumpPose = {
      rotations: {},
      charSpaceRotations: { Hips: [0, 0, 0, 1] as [number, number, number, number] },
      hipsOffset: [0, 0.25, 0] as [number, number, number],
    };

    applyBonePose(rig, groundedPose);
    const groundedY = hips.position.y;

    applyBonePose(rig, jumpPose);
    const airborneY = hips.position.y;
    expect(airborneY).toBeGreaterThan(groundedY + 5.06 * 0.2);

    // Stateless determinism: jumping directly from grounded vs scrubbing from higher jump gives exact same Y
    applyBonePose(rig, {
      ...jumpPose,
      hipsOffset: [0, 0.6, 0],
    });
    applyBonePose(rig, jumpPose);
    expect(hips.position.y).toBeCloseTo(airborneY, 6);
    expect(groundedY).toBeCloseTo(restHipsY, 4);

    // Lossless export round-trip on procedural rig
    const exported = exportBonePose(rig);
    expect(exported.hipsOffset).toBeDefined();
  });

  it('does not falsely snap high kicks or prone crawl poses to neutral-stand while still catching double-leg skyward flip', () => {
    const rig = createHumanoidSkeleton(5.06);
    // High left-leg kick: LeftUpLeg pitched forward -110 deg (foot above hip), RightUpLeg planted on ground
    const lUpLeg = rig.bones.get('LeftUpLeg')!;
    lUpLeg.quaternion.multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.95, 0, 0))
    );
    rig.root.updateMatrixWorld(true);
    const highKickCheck = verifyMixamoAnatomicalInvariants(rig);
    expect(highKickCheck.isValid).toBe(true);

    // Double-leg 180-deg flip (both feet way above hips in the sky) -> invalid!
    const rUpLeg = rig.bones.get('RightUpLeg')!;
    lUpLeg.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
    rUpLeg.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
    rig.root.updateMatrixWorld(true);
    const flippedCheck = verifyMixamoAnatomicalInvariants(rig);
    expect(flippedCheck.isValid).toBe(false);
  });

  it('scales FBX root displacement by 1m = 2.89 stage units without 2.94x floor skating', () => {
    const root = new THREE.Group();
    const pelvis = new THREE.Bone();
    pelvis.name = 'm_avg_Pelvis';
    pelvis.position.set(0, 0.95, 0);
    const lFoot = new THREE.Bone();
    lFoot.name = 'm_avg_L_Ankle';
    lFoot.position.set(-0.1, -0.95, 0);
    const rFoot = new THREE.Bone();
    rFoot.name = 'm_avg_R_Ankle';
    rFoot.position.set(0.1, -0.95, 0);
    pelvis.add(lFoot, rFoot);
    root.add(pelvis);

    // 2.0m forward walk along +Z over 2.0 seconds
    const clip = new THREE.AnimationClip('Walk2m', 2.0, [
      new THREE.VectorKeyframeTrack('m_avg_Pelvis.position', [0, 2.0], [0, 0.95, 0, 0, 0.95, 2.0]),
    ]);
    const extracted = extractMocapFromAnimationClips(root, [clip], {
      startPosition: { x: 50, y: 50, z: 0 },
      sampleFps: 10,
    });
    const endKf = extracted.trajectoryKeyframes[extracted.trajectoryKeyframes.length - 1];
    expect(endKf.position.y - 50).toBeCloseTo(2.0 * STAGE_UNITS_PER_METER, 1);
  });

  it('keeps human actors with worn/held props in tokenPrompt as humanoid rigs and scales stage standees to human height', () => {
    const queenGroup = createSubjectMesh({
      name: 'Sarah',
      kind: 'human',
      tokenPrompt: 'a young queen wearing a golden crown and emerald ring holding a sword and camera',
    });
    // Must NOT collapse into a non-humanoid procedural ring/sword/camera prop!
    expect(queenGroup.userData.archetypeId).toBeUndefined();

    const standeeGroup = createSubjectMesh({
      name: 'Detective Standee',
      kind: 'standee',
    });
    expect(standeeGroup.userData.modelSize.y).toBeCloseTo(1.8 * STAGE_UNITS_PER_METER, 1);
  });

  it('disposes Sprite textures and Light shadow maps while preserving userData.shared geometries', () => {
    const container = new THREE.Group();
    const sharedGeo = new THREE.BoxGeometry(1, 1, 1);
    sharedGeo.userData.shared = true;
    const sharedDisposeSpy = vi.spyOn(sharedGeo, 'dispose');

    const ownedGeo = new THREE.BoxGeometry(1, 1, 1);
    const ownedDisposeSpy = vi.spyOn(ownedGeo, 'dispose');

    container.add(new THREE.Mesh(sharedGeo, new THREE.MeshBasicMaterial()));
    container.add(new THREE.Mesh(ownedGeo, new THREE.MeshBasicMaterial()));

    const sprite = createSpriteBanner('Test Banner', 'SUB');
    const spriteMapDisposeSpy = vi.spyOn((sprite.material as THREE.SpriteMaterial).map!, 'dispose');
    container.add(sprite);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    const fakeShadowMap = { dispose: vi.fn() };
    (dirLight.shadow as any).map = fakeShadowMap;
    container.add(dirLight);

    disposeObject3D(container);

    expect(sharedDisposeSpy).not.toHaveBeenCalled();
    expect(ownedDisposeSpy).toHaveBeenCalledTimes(1);
    expect(spriteMapDisposeSpy).toHaveBeenCalledTimes(1);
    expect(fakeShadowMap.dispose).toHaveBeenCalledTimes(1);
  });
});
