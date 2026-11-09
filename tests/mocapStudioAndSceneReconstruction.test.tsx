// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { installMemoryStorage } from './helpers/memoryStorage';

installMemoryStorage();

import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import * as THREE from 'three';

afterEach(() => {
  cleanup();
});
import {
  resolveCanonicalHumanoidBone,
  extractMocapFromAnimationClips,
  extractMocapFromVideoElementOrFrames,
  applyBonePose,
  createHumanoidSkeleton,
  parseToyxyzRgbMocapJson,
  MP_POSE,
  MediaPipeFrameDetection,
  MediaPipeLandmark3D,
} from '../src/engine/kinematics';
import { createSyntheticVideoFramesFromHint } from '../src/engine/kinematics/videoToMocapExtractor';
import { reconstructSceneFromVideoFrame } from '../src/engine/staging/videoSceneReconstructor';
import { buildPerimeterEnvironment } from '../src/engine/staging/environmentBuilder';
import { CharacterControlCard } from '../src/components/CharacterControlCard';
import { useShotStore } from '../src/stores/useShotStore';
import { Actor } from '../src/types/shotspec';

describe('3D Mocap Studio, SMPL/Mixamo Bone Retargeter & Scene Reconstructor', () => {
  it('maps both Mixamo 19-bone and SMPL/GVHMR/ExMR (toyxyz_RGBMocap) 24-joint hierarchies to canonical HumanoidBones', () => {
    // Mixamo names
    expect(resolveCanonicalHumanoidBone('mixamorig:Hips')).toBe('Hips');
    expect(resolveCanonicalHumanoidBone('mixamorigRightForeArm')).toBe('RightForeArm');
    expect(resolveCanonicalHumanoidBone('Armature|mixamorig:LeftFoot.quaternion')).toBe('LeftFoot');

    // SMPL / GVHMR / ExMR / toyxyz_RGBMocap 24-joint names
    expect(resolveCanonicalHumanoidBone('Pelvis')).toBe('Hips');
    expect(resolveCanonicalHumanoidBone('m_avg_Pelvis')).toBe('Hips');
    expect(resolveCanonicalHumanoidBone('f_avg_Spine1')).toBe('Spine');
    expect(resolveCanonicalHumanoidBone('Spine2')).toBe('Chest');
    expect(resolveCanonicalHumanoidBone('Spine3')).toBe('Chest');
    expect(resolveCanonicalHumanoidBone('L_Collar')).toBe('LeftShoulder');
    expect(resolveCanonicalHumanoidBone('R_Collar')).toBe('RightShoulder');
    expect(resolveCanonicalHumanoidBone('L_Shoulder')).toBe('LeftArm');
    expect(resolveCanonicalHumanoidBone('R_Shoulder')).toBe('RightArm');
    expect(resolveCanonicalHumanoidBone('L_Elbow')).toBe('LeftForeArm');
    expect(resolveCanonicalHumanoidBone('R_Elbow')).toBe('RightForeArm');
    expect(resolveCanonicalHumanoidBone('L_Wrist')).toBe('LeftHand');
    expect(resolveCanonicalHumanoidBone('R_Wrist')).toBe('RightHand');
    expect(resolveCanonicalHumanoidBone('L_Hip')).toBe('LeftUpLeg');
    expect(resolveCanonicalHumanoidBone('R_Hip')).toBe('RightUpLeg');
    expect(resolveCanonicalHumanoidBone('L_Knee')).toBe('LeftLeg');
    expect(resolveCanonicalHumanoidBone('R_Knee')).toBe('RightLeg');
    expect(resolveCanonicalHumanoidBone('L_Ankle')).toBe('LeftFoot');
    expect(resolveCanonicalHumanoidBone('R_Ankle')).toBe('RightFoot');
    // SMPL toe joints (L_Foot / R_Foot) are rejected so they never overwrite L_Ankle / R_Ankle
    expect(resolveCanonicalHumanoidBone('L_Foot')).toBeNull();
    expect(resolveCanonicalHumanoidBone('R_Foot')).toBeNull();
  });

  it('extracts 19-bone poseKeyframes, trajectoryKeyframes, SMPL body proportions, and enforces Foot Contact Lock from AnimationClips', () => {
    const root = new THREE.Group();
    const pelvis = new THREE.Bone();
    pelvis.name = 'm_avg_Pelvis';
    pelvis.position.set(0, 0.95, 0);

    const spine = new THREE.Bone();
    spine.name = 'm_avg_Spine1';
    spine.position.set(0, 0.25, 0);
    pelvis.add(spine);

    const lShoulder = new THREE.Bone();
    lShoulder.name = 'm_avg_L_Shoulder';
    lShoulder.position.set(-0.22, 0.45, 0);
    spine.add(lShoulder);

    const rShoulder = new THREE.Bone();
    rShoulder.name = 'm_avg_R_Shoulder';
    rShoulder.position.set(0.22, 0.45, 0);
    spine.add(rShoulder);

    const lFoot = new THREE.Bone();
    lFoot.name = 'm_avg_L_Ankle';
    lFoot.position.set(-0.12, -0.95, 0);
    pelvis.add(lFoot);

    const rFoot = new THREE.Bone();
    rFoot.name = 'm_avg_R_Ankle';
    rFoot.position.set(0.12, -0.95, 0);
    pelvis.add(rFoot);

    root.add(pelvis);

    // Add a body mesh to test SkinnedMesh / vertex measurement
    const bodyGeo = new THREE.BoxGeometry(0.5, 1.78, 0.28);
    const bodyMesh = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial());
    bodyMesh.position.set(0, 0.89, 0);
    root.add(bodyMesh);

    // Build AnimationClip with root translation (including a negative Y dip to test foot contact clamping) and arm rotation
    const times = [0, 0.5, 1.0];
    const posValues = [
      0, 0.95, 0,
      0.8, 0.82, 0.4, // dips down by -0.13m, then moves forward/right
      1.6, 1.35, 0.8, // jumps upward
    ];
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, 0.2, 0));
    const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.1, 0));
    const quatValues = [
      q0.x, q0.y, q0.z, q0.w,
      q1.x, q1.y, q1.z, q1.w,
      q2.x, q2.y, q2.z, q2.w,
    ];

    const clip = new THREE.AnimationClip('GVHMR_Take', 1.0, [
      new THREE.VectorKeyframeTrack('m_avg_Pelvis.position', times, posValues),
      new THREE.QuaternionKeyframeTrack('m_avg_R_Shoulder.quaternion', times, quatValues),
    ]);

    const res = extractMocapFromAnimationClips(root, [clip], {
      startPosition: { x: 40, y: 50, z: 0 },
      sampleFps: 10,
      lockFootContacts: true,
      fileName: 'gvhmr_actor_walk.fbx',
    });

    expect(res.matchedBones).toContain('Hips');
    expect(res.matchedBones).toContain('RightArm');
    expect(res.poseKeyframes.length).toBeGreaterThanOrEqual(10);
    expect(res.trajectoryKeyframes.length).toBe(res.poseKeyframes.length);

    // Foot Contact Lock ensures no trajectory keyframe ever sinks below z = 0
    expect(res.trajectoryKeyframes.every((kf) => (kf.position.z ?? 0) >= 0)).toBe(true);
    // Horizontal travel moves from startPosition.x = 40
    expect(res.trajectoryKeyframes[res.trajectoryKeyframes.length - 1].position.x).not.toBe(40);
    // Body proportions measured from mesh & skeleton
    expect(res.bodyProportions.heightMeters).toBeGreaterThan(1.4);
    expect(res.bodyProportions.vertexCount).toBeGreaterThan(0);
  });

  it('extracts 3D human motion and body proportions from multi-frame RGB video samples', () => {
    const width = 32;
    const height = 32;
    const frames = [0, 0.25, 0.5, 0.75, 1.0].map((t, idx) => {
      const pixels = new Uint8ClampedArray(width * height * 4);
      // Dark indoor background
      for (let i = 0; i < width * height; i++) {
        pixels[i * 4 + 0] = 18;
        pixels[i * 4 + 1] = 22;
        pixels[i * 4 + 2] = 30;
        pixels[i * 4 + 3] = 255;
      }
      // Bright human silhouette moving from left (cx=8) to right (cx=24)
      const cx = 8 + idx * 4;
      for (let y = 6; y < 28; y++) {
        for (let x = cx - 3; x <= cx + 3; x++) {
          if (x >= 0 && x < width) {
            const p = (y * width + x) * 4;
            pixels[p + 0] = 230;
            pixels[p + 1] = 220;
            pixels[p + 2] = 210;
          }
        }
      }
      return { timeSec: t, width, height, pixels };
    });

    const videoMocap = extractMocapFromVideoElementOrFrames(frames, {
      fileName: 'corridor_sprint.mp4',
      startPosition: { x: 35, y: 50, z: 0 },
      targetDurationSeconds: 2.0,
      lockFootContacts: true,
    });

    expect(videoMocap.poseKeyframes.length).toBeGreaterThanOrEqual(5);
    expect(videoMocap.trajectoryKeyframes.length).toBe(videoMocap.poseKeyframes.length);
    expect(videoMocap.trajectoryKeyframes.every((kf) => (kf.position.z ?? 0) >= 0)).toBe(true);
    expect(videoMocap.bodyProportions.heightMeters).toBeGreaterThan(1.4);
  });

  it('reconstructs indoor/outdoor building environments and places non-colliding surrounding 3D objects from video frames', () => {
    const humanBounds = { minX: 38, maxX: 62, minY: 42, maxY: 58 };
    const scene = reconstructSceneFromVideoFrame({
      fileName: 'scifi_hangar_fight.mp4',
      sceneHintPrompt: 'fighter inside futuristic orbital starship hangar with pillars and crates',
      referenceFrameDataUrl: 'data:image/jpeg;base64,TEST_BUILDING_FRAME',
      humanTrajectoryBounds: humanBounds,
      maxSurroundingObjects: 3,
    });

    expect(scene.isIndoorBuilding).toBe(true);
    // Pure 3D geometry on stage — never pastes a 2D video frame screenshot onto the 3D stage
    expect(scene.environment.conceptImageUrl).toBeUndefined();
    expect(scene.environment.visibleInPrevis).toBe(true);
    expect(scene.surroundingActors.length).toBeGreaterThanOrEqual(2);

    // Verify zero collision between placed surrounding 3D objects and the human actor's trajectory corridor
    for (const obj of scene.surroundingActors) {
      const x = obj.trajectory.startPosition.x;
      const y = obj.trajectory.startPosition.y;
      const insideHumanCorridor =
        x > humanBounds.minX &&
        x < humanBounds.maxX &&
        y > humanBounds.minY &&
        y < humanBounds.maxY;
      expect(insideHumanCorridor).toBe(false);
    }
  });

  it('integrates end-to-end inside CharacterControlCard via the 3D Mocap / FBX Studio modal and applies motion + building props to the stage', async () => {
    const store = useShotStore.getState();
    store.resetToDefault();
    const leadActor: Actor = useShotStore.getState().shot.actors[0];
    const onUpdateActor = vi.fn((id, updates) => {
      useShotStore.getState().updateActor(id, updates);
    });

    const { getByTestId, getByText } = render(
      <CharacterControlCard
        actor={leadActor}
        allActors={useShotStore.getState().shot.actors}
        humanoidActors={[leadActor]}
        shotDurationSeconds={4}
        sceneDescription="Test stage"
        currentTime={0}
        isSelected={true}
        isCollapsed={false}
        isFineTuneOpen={false}
        isMotionSectionOpen={true}
        isTimingSectionOpen={true}
        motionWindow={{ start: 0, end: 4 }}
        activeHumanGroup="move"
        travelMode="auto"
        refiningActorId={null}
        generatingActingId={null}
        socketTargetActorId=""
        socketTargetBone="RightHand"
        onSelectActor={vi.fn()}
        onToggleCollapse={vi.fn()}
        onToggleFineTune={vi.fn()}
        onToggleMotionSection={vi.fn()}
        onToggleTimingSection={vi.fn()}
        onUpdateMotionWindow={vi.fn()}
        onUpdateHumanGroup={vi.fn()}
        onUpdateTravelMode={vi.fn()}
        onUpdateActor={onUpdateActor}
        onRemoveActor={vi.fn()}
        onAddToCastPool={vi.fn()}
        onUpdateActorPositionAtTime={vi.fn()}
        onApplyReadyMadeMotion={vi.fn()}
        onDirectCustomAction={vi.fn()}
        onRefineObjectByPrompt={vi.fn()}
        onAttachGlbFile={vi.fn()}
        onSocketActorToBone={vi.fn()}
        onUnsocketActor={vi.fn()}
        onChangeSocketTargetActor={vi.fn()}
        onChangeSocketTargetBone={vi.fn()}
      />
    );

    // 1. Click "3D Mocap / FBX" button in CharacterControlCard
    fireEvent.click(getByTestId('open-mocap-studio-btn'));
    expect(getByTestId('mocap-studio-modal')).toBeTruthy();
    expect(getByTestId('scope-motion-body-scene')).toBeTruthy();

    // 2. Verify that EVEN if the user uploads a video (.MP4) through the "Import Mocap" input (mocap-fbx-input),
    // the smart router accepts the video and extracts Motion + 3D Body + Surrounding Scene!
    const fbxOrVideoInput = getByTestId('mocap-fbx-input') as HTMLInputElement;
    const fakeVideoFile = new File(['fake-mp4-binary-payload'], 'penthouse_sword_duel.mp4', {
      type: 'video/mp4',
    });
    fireEvent.change(fbxOrVideoInput, { target: { files: [fakeVideoFile] } });

    // 3. Wait for extraction telemetry and surrounding 3D building objects preview to appear
    await waitFor(() => {
      expect(getByText(/Surrounding 3D .* to Place/i)).toBeTruthy();
    });

    // 4. Click "Apply to 3D Stage"
    const applyBtn = getByTestId('apply-mocap-to-stage-btn');
    fireEvent.click(applyBtn);

    // Verify actor motion, multi-person tracks (penthouse_sword_duel -> 2 people), camera motion, and surrounding 3D scene buildings were applied to the stage
    expect(onUpdateActor).toHaveBeenCalled();
    const updatedShot = useShotStore.getState().shot;
    expect(updatedShot.actors.some((a) => a.id.startsWith('mocap-surrounding-'))).toBe(true);
    expect(updatedShot.actors.some((a) => a.id === 'mocap-person-2')).toBe(true);
  });

  it('tracks multiple people (2..3 actors), solves camera motion, and builds procedural 3D buildings from generic video filenames', () => {
    const frames = createSyntheticVideoFramesFromHint(
      'two people fighting in urban street with camera dolly-in',
      3.0,
      8
    );
    const result = extractMocapFromVideoElementOrFrames(frames, {
      fileName: 'VID_20261108.mp4',
      motionHintPrompt: 'two people fighting in urban street with camera dolly-in',
      targetDurationSeconds: 3.0,
      lockFootContacts: true,
    });

    expect(result.detectedPersonCount).toBeGreaterThanOrEqual(2);
    expect(result.actorTracks.length).toBeGreaterThanOrEqual(2);
    expect(result.actorTracks[0].poseKeyframes.length).toBeGreaterThanOrEqual(8);
    expect(result.actorTracks[1].poseKeyframes.length).toBeGreaterThanOrEqual(8);
    expect(result.actorTracks[0].startPosition.x).not.toBe(result.actorTracks[1].startPosition.x);

    // Verify camera motion extraction
    expect(result.cameraMotion).toBeDefined();
    expect(result.cameraMotion.movementType).toBe('dolly-in');
    expect(result.cameraMotion.keyframes.length).toBeGreaterThanOrEqual(3);

    // Verify frame-driven building & architectural structure reconstruction with SculptSpec
    const scene = reconstructSceneFromVideoFrame({
      fileName: 'VID_20261108.mp4',
      framePixels: result.referenceFramePixels,
      humanTrajectoryBounds: { minX: 25, maxX: 75, minY: 40, maxY: 60 },
      maxSurroundingObjects: 3,
    });
    expect(scene.surroundingActors.length).toBe(3);
    for (const sur of scene.surroundingActors) {
      expect(sur.sculpt).toBeDefined();
      expect(sur.sculpt.parts.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('honors explicit people, roles, actions, and places typed in Arabic or English in the dedicated hint field even after uploading a generic video', async () => {
    const store = useShotStore.getState();
    store.resetToDefault();
    const leadActor: Actor = useShotStore.getState().shot.actors[0];
    const onUpdateActor = vi.fn((id, updates) => {
      useShotStore.getState().updateActor(id, updates);
    });

    const { getByTestId, getByText } = render(
      <CharacterControlCard
        actor={leadActor}
        allActors={useShotStore.getState().shot.actors}
        humanoidActors={[leadActor]}
        shotDurationSeconds={4}
        sceneDescription="Test stage"
        currentTime={0}
        isSelected={true}
        isCollapsed={false}
        isFineTuneOpen={false}
        isMotionSectionOpen={true}
        isTimingSectionOpen={true}
        motionWindow={{ start: 0, end: 4 }}
        activeHumanGroup="move"
        travelMode="auto"
        refiningActorId={null}
        generatingActingId={null}
        socketTargetActorId=""
        socketTargetBone="RightHand"
        onSelectActor={vi.fn()}
        onToggleCollapse={vi.fn()}
        onToggleFineTune={vi.fn()}
        onToggleMotionSection={vi.fn()}
        onToggleTimingSection={vi.fn()}
        onUpdateMotionWindow={vi.fn()}
        onUpdateHumanGroup={vi.fn()}
        onUpdateTravelMode={vi.fn()}
        onUpdateActor={onUpdateActor}
        onRemoveActor={vi.fn()}
        onAddToCastPool={vi.fn()}
        onUpdateActorPositionAtTime={vi.fn()}
        onApplyReadyMadeMotion={vi.fn()}
        onDirectCustomAction={vi.fn()}
        onRefineObjectByPrompt={vi.fn()}
        onAttachGlbFile={vi.fn()}
        onSocketActorToBone={vi.fn()}
        onUnsocketActor={vi.fn()}
        onChangeSocketTargetActor={vi.fn()}
        onChangeSocketTargetBone={vi.fn()}
      />
    );

    fireEvent.click(getByTestId('open-mocap-studio-btn'));

    // 1. Upload a completely generic filename (e.g. "clip_001.mp4") while the hint field is initially empty
    const videoInput = getByTestId('mocap-video-input') as HTMLInputElement;
    const genericVideo = new File(['fake-mp4'], 'clip_001.mp4', { type: 'video/mp4' });
    fireEvent.change(videoInput, { target: { files: [genericVideo] } });

    await waitFor(() => {
      expect(getByText(/People Tracked:/i)).toBeTruthy();
    });

    // 2. Now type an explicit Arabic or English description of people & place into the dedicated hint field:
    // "طبيب ومريض في مستشفى" (Doctor and Patient in a Hospital)
    const hintInput = getByTestId('mocap-hint-input') as HTMLInputElement;
    fireEvent.change(hintInput, {
      target: { value: 'طبيب ومريض في مستشفى مع كاميرا تقترب' },
    });

    const modalText = getByTestId('mocap-studio-modal').textContent || '';
    expect(modalText).toContain('Doctor');
    expect(modalText).toContain('Patient');
    expect(modalText).toMatch(/Hospital \/ Medical Facility Interior/i);

    // 3. Click "Apply to 3D Stage" and verify both actors (Doctor + Patient), camera dolly-in, and Hospital place are applied to the stage
    fireEvent.click(getByTestId('apply-mocap-to-stage-btn'));

    const updatedShot = useShotStore.getState().shot;
    expect(updatedShot.actors[0].name).toBe('Doctor');
    const secondPerson = updatedShot.actors.find((a) => a.id === 'mocap-person-2');
    expect(secondPerson).toBeDefined();
    expect(secondPerson?.name).toBe('Patient');
    expect(updatedShot.environment?.name).toMatch(/Hospital \/ Medical Facility Interior/i);
    expect(updatedShot.camera.movement.type).toBe('dolly-in');
  });

  it('strictly enforces 1:1 person count (Man & Woman = 2 people, never 4) and builds a true Coastal Beach environment ("شاطئ") instead of a forest', async () => {
    const store = useShotStore.getState();
    store.resetToDefault();
    // Simulate having an extra human actor already on stage before opening Mocap Studio
    store.addActor('Old Extra Actor', 'human');
    expect(useShotStore.getState().shot.actors.filter((a) => a.kind === 'human').length).toBe(2);

    const leadActor: Actor = useShotStore.getState().shot.actors[0];
    const onUpdateActor = vi.fn((id, updates) => {
      useShotStore.getState().updateActor(id, updates);
    });

    const { getByTestId } = render(
      <CharacterControlCard
        actor={leadActor}
        allActors={useShotStore.getState().shot.actors}
        humanoidActors={[leadActor]}
        shotDurationSeconds={4}
        sceneDescription="Beach test"
        currentTime={0}
        isSelected={true}
        isCollapsed={false}
        isFineTuneOpen={false}
        isMotionSectionOpen={true}
        isTimingSectionOpen={true}
        motionWindow={{ start: 0, end: 4 }}
        activeHumanGroup="move"
        travelMode="auto"
        refiningActorId={null}
        generatingActingId={null}
        socketTargetActorId=""
        socketTargetBone="RightHand"
        onSelectActor={vi.fn()}
        onToggleCollapse={vi.fn()}
        onToggleFineTune={vi.fn()}
        onToggleMotionSection={vi.fn()}
        onToggleTimingSection={vi.fn()}
        onUpdateMotionWindow={vi.fn()}
        onUpdateHumanGroup={vi.fn()}
        onUpdateTravelMode={vi.fn()}
        onUpdateActor={onUpdateActor}
        onRemoveActor={vi.fn()}
        onAddToCastPool={vi.fn()}
        onUpdateActorPositionAtTime={vi.fn()}
        onApplyReadyMadeMotion={vi.fn()}
        onDirectCustomAction={vi.fn()}
        onRefineObjectByPrompt={vi.fn()}
        onAttachGlbFile={vi.fn()}
        onSocketActorToBone={vi.fn()}
        onUnsocketActor={vi.fn()}
        onChangeSocketTargetActor={vi.fn()}
        onChangeSocketTargetBone={vi.fn()}
      />
    );

    fireEvent.click(getByTestId('open-mocap-studio-btn'));

    const hintInput = getByTestId('mocap-hint-input') as HTMLInputElement;
    fireEvent.change(hintInput, {
      target: { value: 'رجل وامرأة يمشيان على شاطئ البحر' },
    });

    const modalText = getByTestId('mocap-studio-modal').textContent || '';
    expect(modalText).toContain('Detected People in Video (2 People)');
    expect(modalText).toContain('Man');
    expect(modalText).toContain('Woman');
    expect(modalText).toContain('Coastal Sandy Beach & Ocean Shoreline');
    expect(getByTestId('mocap-skeleton-overlay-inspector')).toBeTruthy();

    fireEvent.click(getByTestId('apply-mocap-to-stage-btn'));

    const updatedShot = useShotStore.getState().shot;
    const humanActorsOnStage = updatedShot.actors.filter((a) => a.kind === 'human');
    // Strictly 2 human actors (Man & Woman), NOT 3 or 4!
    expect(humanActorsOnStage.length).toBe(2);
    expect(humanActorsOnStage.map((a) => a.name)).toEqual(['Man', 'Woman']);
    // Keyframes use pure extracted bone rotations (gait: 'none') without conflicting procedural walk loop
    expect(humanActorsOnStage[0].trajectory.keyframes?.[0]?.gait).toBe('none');
    // Environment is Coastal Sandy Beach, never Forest!
    expect(updatedShot.environment?.name).toBe('Coastal Sandy Beach & Ocean Shoreline');
    expect(updatedShot.environment?.groundSurface).toBe('sand-dunes');

    // 1. Verify Man and Woman walk SIDE-BY-SIDE (|man.x - woman.x| <= 8) and travel forward together
    const [manActor, womanActor] = humanActorsOnStage;
    const manStart = manActor.trajectory.startPosition;
    const womanStart = womanActor.trajectory.startPosition;
    const manEnd = manActor.trajectory.endPosition;
    const womanEnd = womanActor.trajectory.endPosition;
    expect(Math.abs(manStart.x - womanStart.x)).toBeGreaterThanOrEqual(4);
    expect(Math.abs(manStart.x - womanStart.x)).toBeLessThanOrEqual(8);
    expect(manEnd.y).toBeGreaterThan(manStart.y);
    expect(womanEnd.y).toBeGreaterThan(womanStart.y);
    expect(Math.abs(manEnd.x - womanEnd.x)).toBeLessThanOrEqual(8);

    // 2. Verify Camera frames BOTH subjects at their midpoint (x=50), tracks them, and clears single-actor lock
    expect(updatedShot.camera.trackTargetActorId).toBeUndefined();
    expect(updatedShot.camera.movement.type).toBe('steadicam-follow');
    expect(Math.abs((updatedShot.camera.movement.targetLookAt?.x ?? 50) - 50)).toBeLessThanOrEqual(3);
    expect(updatedShot.camera.movement.keyframes?.length).toBeGreaterThanOrEqual(8);

    // 3. Verify Mixamo Y-Bot bind-pose rig (with 180-deg UpLeg bind roll) NEVER flips legs/arms upside down
    const mixamoLikeRig = createHumanoidSkeleton(5.06);
    mixamoLikeRig.isMannequinRig = true;
    // Simulate Mixamo Y-Bot's 180-degree Z-roll bind rotation on LeftUpLeg & RightUpLeg
    const flipZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    const lUpLeg = mixamoLikeRig.bones.get('LeftUpLeg')!;
    const rUpLeg = mixamoLikeRig.bones.get('RightUpLeg')!;
    const lLeg = mixamoLikeRig.bones.get('LeftLeg')!;
    const rLeg = mixamoLikeRig.bones.get('RightLeg')!;
    const lFoot = mixamoLikeRig.bones.get('LeftFoot')!;
    const rFoot = mixamoLikeRig.bones.get('RightFoot')!;
    lUpLeg.quaternion.copy(flipZ);
    rUpLeg.quaternion.copy(flipZ);
    mixamoLikeRig.restRotations.set('LeftUpLeg', flipZ.clone());
    mixamoLikeRig.restRotations.set('RightUpLeg', flipZ.clone());
    // Counter-rotate child bones so world T-pose is upright
    lLeg.position.y = -lLeg.position.y;
    rLeg.position.y = -rLeg.position.y;
    lFoot.position.y = -lFoot.position.y;
    rFoot.position.y = -rFoot.position.y;
    mixamoLikeRig.restPositions.set('LeftLeg', lLeg.position.clone());
    mixamoLikeRig.restPositions.set('RightLeg', rLeg.position.clone());
    mixamoLikeRig.restPositions.set('LeftFoot', lFoot.position.clone());
    mixamoLikeRig.restPositions.set('RightFoot', rFoot.position.clone());
    mixamoLikeRig.root.updateMatrixWorld(true);

    const extractedPose = manActor.trajectory.keyframes?.[2]?.pose;
    expect(extractedPose).toBeDefined();
    expect(extractedPose?.anatomicalIk).toBeDefined();

    applyBonePose(mixamoLikeRig, extractedPose!);
    mixamoLikeRig.root.updateMatrixWorld(true);

    const hipWorld = new THREE.Vector3();
    const headWorld = new THREE.Vector3();
    const lFootWorld = new THREE.Vector3();
    const rFootWorld = new THREE.Vector3();
    mixamoLikeRig.bones.get('Hips')!.getWorldPosition(hipWorld);
    mixamoLikeRig.bones.get('Head')!.getWorldPosition(headWorld);
    lFoot.getWorldPosition(lFootWorld);
    rFoot.getWorldPosition(rFootWorld);

    // Feet must be BELOW hips, and head must be ABOVE hips (never upside-down in the air!)
    expect(lFootWorld.y).toBeLessThan(hipWorld.y);
    expect(rFootWorld.y).toBeLessThan(hipWorld.y);
    expect(headWorld.y).toBeGreaterThan(hipWorld.y);

    // 4. Verify Coastal Beach 3D Perimeter Environment has ZERO conifer pine tree cones
    const envGroup = new THREE.Group();
    buildPerimeterEnvironment(envGroup, updatedShot.environment, {
      sceneDescription: 'رجل وامرأة يمشيان على شاطئ البحر',
    });
    let coneMeshCount = 0;
    envGroup.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).geometry instanceof THREE.ConeGeometry) {
        coneMeshCount++;
      }
    });
    expect(coneMeshCount).toBe(0);
  });

  it('tracks multi-person 33-joint MediaPipe PoseLandmarker detections with OneEuroFilter, metric unprojection (flow_placement.py), pure landmark IK, and neutral stance fallback for occluded joints', () => {
    const makePose33 = (
      hipCenterX2D: number,
      hipCenterY2D: number,
      stepOffsetZ: number,
      legsVisible = true
    ): { lms: MediaPipeLandmark3D[]; worldLms: MediaPipeLandmark3D[] } => {
      const lms: MediaPipeLandmark3D[] = Array.from({ length: 33 }, () => ({
        x: hipCenterX2D,
        y: hipCenterY2D,
        z: 0,
        visibility: 0.92,
      }));
      const worldLms: MediaPipeLandmark3D[] = Array.from({ length: 33 }, () => ({
        x: 0,
        y: 0,
        z: 0,
        visibility: 0.92,
      }));

      // 2D image-space landmarks
      lms[MP_POSE.NOSE] = { x: hipCenterX2D, y: hipCenterY2D - 0.34, z: 0, visibility: 0.95 };
      lms[MP_POSE.LEFT_SHOULDER] = { x: hipCenterX2D - 0.06, y: hipCenterY2D - 0.24, z: 0, visibility: 0.95 };
      lms[MP_POSE.RIGHT_SHOULDER] = { x: hipCenterX2D + 0.06, y: hipCenterY2D - 0.24, z: 0, visibility: 0.95 };
      lms[MP_POSE.LEFT_ELBOW] = { x: hipCenterX2D - 0.08, y: hipCenterY2D - 0.1, z: 0, visibility: 0.9 };
      lms[MP_POSE.RIGHT_ELBOW] = { x: hipCenterX2D + 0.08, y: hipCenterY2D - 0.1, z: 0, visibility: 0.9 };
      lms[MP_POSE.LEFT_WRIST] = { x: hipCenterX2D - 0.09, y: hipCenterY2D + 0.02, z: -stepOffsetZ, visibility: 0.88 };
      lms[MP_POSE.RIGHT_WRIST] = { x: hipCenterX2D + 0.09, y: hipCenterY2D + 0.02, z: stepOffsetZ, visibility: 0.88 };
      lms[MP_POSE.LEFT_HIP] = { x: hipCenterX2D - 0.04, y: hipCenterY2D, z: 0, visibility: 0.95 };
      lms[MP_POSE.RIGHT_HIP] = { x: hipCenterX2D + 0.04, y: hipCenterY2D, z: 0, visibility: 0.95 };
      lms[MP_POSE.LEFT_KNEE] = {
        x: hipCenterX2D - 0.04,
        y: hipCenterY2D + 0.16,
        z: stepOffsetZ * 0.5,
        visibility: legsVisible ? 0.92 : 0.05,
      };
      lms[MP_POSE.RIGHT_KNEE] = {
        x: hipCenterX2D + 0.04,
        y: hipCenterY2D + 0.16,
        z: -stepOffsetZ * 0.5,
        visibility: legsVisible ? 0.92 : 0.05,
      };
      lms[MP_POSE.LEFT_ANKLE] = {
        x: hipCenterX2D - 0.04,
        y: hipCenterY2D + 0.32 - Math.max(0, stepOffsetZ) * 0.08,
        z: stepOffsetZ,
        visibility: legsVisible ? 0.92 : 0.05,
      };
      lms[MP_POSE.RIGHT_ANKLE] = {
        x: hipCenterX2D + 0.04,
        y: hipCenterY2D + 0.32 - Math.max(0, -stepOffsetZ) * 0.08,
        z: -stepOffsetZ,
        visibility: legsVisible ? 0.92 : 0.05,
      };

      // 3D metric worldLandmarks in MediaPipe convention (+Y is DOWN, origin at hip center)
      worldLms[MP_POSE.NOSE] = { x: 0, y: -0.64, z: -0.05, visibility: 0.95 };
      worldLms[MP_POSE.LEFT_EAR] = { x: -0.07, y: -0.64, z: 0, visibility: 0.92 };
      worldLms[MP_POSE.RIGHT_EAR] = { x: 0.07, y: -0.64, z: 0, visibility: 0.92 };
      worldLms[MP_POSE.LEFT_SHOULDER] = { x: -0.19, y: -0.45, z: 0, visibility: 0.95 };
      worldLms[MP_POSE.RIGHT_SHOULDER] = { x: 0.19, y: -0.45, z: 0, visibility: 0.95 };
      worldLms[MP_POSE.LEFT_ELBOW] = { x: -0.23, y: -0.2, z: stepOffsetZ * 0.4, visibility: 0.9 };
      worldLms[MP_POSE.RIGHT_ELBOW] = { x: 0.23, y: -0.2, z: -stepOffsetZ * 0.4, visibility: 0.9 };
      worldLms[MP_POSE.LEFT_WRIST] = { x: -0.24, y: 0.04, z: stepOffsetZ * 0.8, visibility: 0.88 };
      worldLms[MP_POSE.RIGHT_WRIST] = { x: 0.24, y: 0.04, z: -stepOffsetZ * 0.8, visibility: 0.88 };
      worldLms[MP_POSE.LEFT_HIP] = { x: -0.11, y: 0, z: 0, visibility: 0.95 };
      worldLms[MP_POSE.RIGHT_HIP] = { x: 0.11, y: 0, z: 0, visibility: 0.95 };
      worldLms[MP_POSE.LEFT_KNEE] = {
        x: -0.11,
        y: 0.42,
        z: -stepOffsetZ * 0.6,
        visibility: legsVisible ? 0.92 : 0.05,
      };
      worldLms[MP_POSE.RIGHT_KNEE] = {
        x: 0.11,
        y: 0.42,
        z: stepOffsetZ * 0.6,
        visibility: legsVisible ? 0.92 : 0.05,
      };
      worldLms[MP_POSE.LEFT_ANKLE] = {
        x: -0.11,
        y: 0.82 - Math.max(0, stepOffsetZ) * 0.2,
        z: -stepOffsetZ,
        visibility: legsVisible ? 0.92 : 0.05,
      };
      worldLms[MP_POSE.RIGHT_ANKLE] = {
        x: 0.11,
        y: 0.82 - Math.max(0, -stepOffsetZ) * 0.2,
        z: stepOffsetZ,
        visibility: legsVisible ? 0.92 : 0.05,
      };

      return { lms, worldLms };
    };

    const frames = createSyntheticVideoFramesFromHint('two people walking on beach', 2.0, 6);
    const mpDetections: MediaPipeFrameDetection[] = frames.map((f, idx) => {
      const step = (idx % 2 === 0 ? 1 : -1) * 0.22;
      // Person A on left (hipCenterX = 0.41) with visible legs, Person B on right (hipCenterX = 0.59) with occluded legs in last frame
      const pA = makePose33(0.41, 0.54, step, true);
      const pB = makePose33(0.59, 0.54, -step, idx < frames.length - 1);
      return {
        timeSec: f.timeSec,
        landmarks: [pA.lms, pB.lms],
        worldLandmarks: [pA.worldLms, pB.worldLms],
      };
    });

    const res = extractMocapFromVideoElementOrFrames(frames, {
      fileName: 'beach_walk.mp4',
      mediaPipeDetections: mpDetections,
      targetDurationSeconds: 2.0,
      lockFootContacts: true,
    });

    expect(res.detectedPersonCount).toBe(2);
    expect(res.actorTracks.length).toBe(2);

    const [trackA, trackB] = res.actorTracks;
    // Left-to-right identity preservation & metric side-by-side unprojection (`flow_placement.py`)
    expect(trackA.startPosition.x).toBeLessThan(trackB.startPosition.x);
    expect(Math.abs(trackA.startPosition.x - trackB.startPosition.x)).toBeGreaterThanOrEqual(2);
    expect(Math.abs(trackA.startPosition.x - trackB.startPosition.x)).toBeLessThanOrEqual(14);

    // Pure landmark-driven IK on Track A: left/right ankle Z alternates across frames from real `worldLandmarks`
    const kf0Ik = trackA.poseKeyframes[0].pose?.anatomicalIk;
    const kf1Ik = trackA.poseKeyframes[1].pose?.anatomicalIk;
    expect(kf0Ik).toBeDefined();
    expect(kf1Ik).toBeDefined();
    expect(kf0Ik!.leftAnkle[2]).not.toBe(kf1Ik!.leftAnkle[2]);

    // Neutral grounded stance fallback when legs are cropped out (`visibility < 0.25`) in last frame of Track B
    // Character Local +X is Character Left, -X is Character Right (never crossed!)
    const lastB = trackB.poseKeyframes[trackB.poseKeyframes.length - 1].pose?.anatomicalIk;
    expect(lastB?.leftAnkle[0]).toBeGreaterThan(0.05);
    expect(lastB?.rightAnkle[0]).toBeLessThan(-0.05);
    expect(lastB?.leftAnkle[1]).toBe(0);
    expect(lastB?.rightAnkle[1]).toBe(0);
    expect(lastB?.leftHand[0]).toBeGreaterThan(0.1);
    expect(lastB?.rightHand[0]).toBeLessThan(-0.1);
  });

  it('imports native toyxyz_RGBMocap JSON output (flow_world.json / SMPL 24-joint axis-angle + root translation) directly', () => {
    const fakeFlowWorldJson = JSON.stringify({
      fps: 24,
      people: [
        {
          id: 0,
          height_meters: 1.81,
          global_orient: [
            [0, 0, 0],
            [0.05, 0.12, 0],
            [0.08, 0.24, 0],
          ],
          body_pose: [
            new Array(63).fill(0),
            new Array(63).fill(0).map((_, idx) => (idx === 0 ? -0.35 : idx === 3 ? 0.35 : 0)),
            new Array(63).fill(0).map((_, idx) => (idx === 0 ? 0.35 : idx === 3 ? -0.35 : 0)),
          ],
          transl: [
            [0, 0, 0],
            [0.25, 0.01, 0.6],
            [0.5, 0.0, 1.2],
          ],
        },
      ],
    });

    const imported = parseToyxyzRgbMocapJson(fakeFlowWorldJson, 'flow_world.json', {
      startPosition: { x: 50, y: 45, z: 0 },
      lockFootContacts: true,
    });

    expect(imported.matchedBones.length).toBe(19);
    expect(imported.poseKeyframes.length).toBe(3);
    expect(imported.trajectoryKeyframes.length).toBe(3);
    expect(imported.bodyProportions.heightMeters).toBe(1.81);
    expect(imported.trajectoryKeyframes[2].position.x).toBeGreaterThan(50);
    expect(imported.trajectoryKeyframes[2].position.y).toBeGreaterThan(45);
    expect(imported.trajectoryKeyframes.every((k) => (k.position.z ?? 0) === 0)).toBe(true);
  });

  it('allows switching between Real SMPL Body (6,890v) and Mixamo Y-Bot (Unstretched) in MocapStudioModal', async () => {
    const store = useShotStore.getState();
    store.resetToDefault();
    const leadActor: Actor = useShotStore.getState().shot.actors[0];
    const onUpdateActor = vi.fn((id, updates) => {
      useShotStore.getState().updateActor(id, updates);
    });

    const { getByTestId, getByText } = render(
      <CharacterControlCard
        actor={leadActor}
        allActors={useShotStore.getState().shot.actors}
        humanoidActors={[leadActor]}
        shotDurationSeconds={4}
        sceneDescription="Test stage"
        currentTime={0}
        isSelected={true}
        isCollapsed={false}
        isFineTuneOpen={false}
        isMotionSectionOpen={true}
        isTimingSectionOpen={true}
        motionWindow={{ start: 0, end: 4 }}
        activeHumanGroup="move"
        travelMode="auto"
        refiningActorId={null}
        generatingActingId={null}
        socketTargetActorId=""
        socketTargetBone="RightHand"
        onSelectActor={vi.fn()}
        onToggleCollapse={vi.fn()}
        onToggleFineTune={vi.fn()}
        onToggleMotionSection={vi.fn()}
        onToggleTimingSection={vi.fn()}
        onUpdateMotionWindow={vi.fn()}
        onUpdateHumanGroup={vi.fn()}
        onUpdateTravelMode={vi.fn()}
        onUpdateActor={onUpdateActor}
        onRemoveActor={vi.fn()}
        onAddToCastPool={vi.fn()}
        onUpdateActorPositionAtTime={vi.fn()}
        onApplyReadyMadeMotion={vi.fn()}
        onDirectCustomAction={vi.fn()}
        onRefineObjectByPrompt={vi.fn()}
        onAttachGlbFile={vi.fn()}
        onSocketActorToBone={vi.fn()}
        onUnsocketActor={vi.fn()}
        onChangeSocketTargetActor={vi.fn()}
        onChangeSocketTargetBone={vi.fn()}
      />
    );

    fireEvent.click(getByTestId('open-mocap-studio-btn'));
    expect(getByTestId('mocap-mesh-mode-selector')).toBeTruthy();

    // Select Mixamo Y-Bot (Natural 1:1 unstretched)
    fireEvent.click(getByTestId('mocap-mesh-mode-ybot'));

    const fbxOrVideoInput = getByTestId('mocap-fbx-input') as HTMLInputElement;
    const fakeVideoFile = new File(['fake-mp4-binary-payload'], 'penthouse_sword_duel.mp4', {
      type: 'video/mp4',
    });
    fireEvent.change(fbxOrVideoInput, { target: { files: [fakeVideoFile] } });

    await waitFor(() => {
      expect(getByText(/Surrounding 3D .* to Place/i)).toBeTruthy();
    });

    fireEvent.click(getByTestId('apply-mocap-to-stage-btn'));

    const updatedActors = useShotStore.getState().shot.actors;
    const updatedLead = updatedActors.find((a) => a.id === leadActor.id);
    const updatedPerson2 = updatedActors.find((a) => a.id === 'mocap-person-2');
    expect(updatedLead?.bodyProportions?.humanoidMeshMode).toBe('ybot');
    expect(updatedPerson2?.bodyProportions?.humanoidMeshMode).toBe('ybot');
  });
});

