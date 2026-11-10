import { describe, it, expect } from 'vitest';
import { createDefaultShotSpec } from '../src/types/shotspec';
import { analyzeShotPovVisibility } from '../src/engine/povVisibilityEngine';
import {
  compileLtxPrompt,
  compileMiniMaxPrompt,
  compileSeedancePrompt,
  formatCameraMovement,
  isCustomPromptCoherentWithShot,
} from '../src/engine/promptCompiler';
import { useShotStore } from '../src/stores/useShotStore';

describe('Universal 6-DoF Kinematic & Camera-Relative POV Prompt Engine', () => {
  it('suppresses preset camera movement name (e.g. dolly-in) when customTrajectory or camera keyframes are active', () => {
    const shot = createDefaultShotSpec({
      camera: {
        lens: { focalLength: '70mm', sensorSize: 'full-frame', aperture: 'f/2.8' },
        shotType: 'medium',
        angle: 'eye-level',
        movement: {
          type: 'dolly-in',
          speed: 'slow-cinematic',
          startPosition: { x: 50, y: 80, z: 20 },
          endPosition: { x: 80, y: 50, z: 20 },
          targetLookAt: { x: 50, y: 50 },
          customTrajectory: true,
          keyframes: [
            { id: 'kf-1', time: 0, position: { x: 50, y: 80, z: 20 } },
            { id: 'kf-2', time: 2, position: { x: 75, y: 70, z: 20 } },
            { id: 'kf-3', time: 4, position: { x: 80, y: 50, z: 20 } },
          ],
        },
      },
    });

    const pov = analyzeShotPovVisibility(shot);
    expect(pov.cameraKinematics.isCustomCameraTrajectory).toBe(true);

    const formattedMove = formatCameraMovement(shot.camera.movement.type, shot.camera.movement.speed, {
      customTrajectory: shot.camera.movement.customTrajectory,
      keyframes: shot.camera.movement.keyframes,
      cameraKinematics: pov.cameraKinematics,
    });

    expect(formattedMove.toLowerCase()).not.toContain('dolly-in');
    expect(formattedMove.toLowerCase()).toContain('orbital');

    const minimaxBundle = compileMiniMaxPrompt(shot);
    expect(minimaxBundle.positivePrompt.toLowerCase()).not.toContain('dolly-in');
  });

  it('detects grounded-to-airborne liftoff (Z altitude transition) and camera-relative orientation shifts for any object', () => {
    const shot = createDefaultShotSpec({
      durationSeconds: 4.0,
      camera: {
        lens: { focalLength: '70mm', sensorSize: 'full-frame', aperture: 'f/2.8' },
        shotType: 'medium',
        angle: 'eye-level',
        movement: {
          type: 'dolly-in',
          speed: 'slow-cinematic',
          // Camera starts in front (+Z = 80) and swings behind (-X/+Z to behind object's travel direction)
          startPosition: { x: 50, y: 80, z: 18 },
          endPosition: { x: 20, y: 50, z: 26 },
          targetLookAt: { x: 50, y: 50 },
          customTrajectory: true,
        },
      },
      actors: [
        {
          id: 'actor-veh',
          name: 'Aerial Vehicle',
          kind: 'vehicle',
          token: 'a sleek rotorcraft',
          actionDescription: 'takes off and accelerates forward',
          scale: 1.5,
          // Facing +X (yaw = 90 degrees -> pointing screen-right when viewed from y=80 looking at y=50)
          rotation: { x: 0, y: 90, z: 0 },
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 45, y: 50, z: 0 },
            endPosition: { x: 65, y: 50, z: 24 },
            keyframes: [
              { id: 'k0', time: 0, position: { x: 45, y: 50, z: 0 }, rotation: { x: 0, y: 90, z: 0 } },
              { id: 'k1', time: 1.2, position: { x: 50, y: 50, z: 14 }, rotation: { x: -12, y: 90, z: 0 } },
              { id: 'k2', time: 4.0, position: { x: 65, y: 50, z: 24 }, rotation: { x: -8, y: 90, z: 0 } },
            ],
          },
        },
      ],
    });

    const pov = analyzeShotPovVisibility(shot);
    const analysis = pov.byActorId['actor-veh'];
    expect(analysis).toBeDefined();
    expect(analysis.everVisible).toBe(true);
    expect(analysis.has3DDisplacement).toBe(true);

    // 1. Starts grounded on the surface and lifts off in opening beat
    expect(analysis.beats.open.startAltitudeMeters).toBeLessThanOrEqual(0.35);
    expect(analysis.beats.open.elevationPhrase).toContain('grounded on the surface');
    expect(analysis.beats.open.verticalMotionPhrase).toContain('lifts off from the ground');

    // 2. Telephoto 70mm lens + scale 1.5 should NOT misclassify as "distant background"
    expect(analysis.beats.open.depthZone).not.toBe('distant background');

    // 3. Orientation transitions from side profile (pointing screen-right) at open to rear view when camera moves to x=20 looking at x=65
    expect(analysis.beats.open.viewOrientationShort).toContain('right-facing side profile');
    expect(analysis.beats.close.viewOrientationShort).toContain('rear');

    // 4. Compiled prompts include grounded liftoff, orientation transition, and omit "dolly-in"
    const ltx = compileLtxPrompt(shot);
    expect(ltx.positivePrompt).toContain('grounded on the surface');
    expect(ltx.positivePrompt).toContain('lifts off from the ground');
    expect(ltx.positivePrompt).toContain('right-facing side profile');
    expect(ltx.positivePrompt).toContain('rear');
    expect(ltx.positivePrompt.toLowerCase()).not.toContain('dolly-in');

    const seedance = compileSeedancePrompt(shot);
    expect(seedance.positivePrompt).toContain('right-facing side profile');
  });

  it('retroactively detects manual camera trajectory when start/end deviate from preset even without customTrajectory flag or keyframes', () => {
    const shot = createDefaultShotSpec({
      durationSeconds: 5.0,
      camera: {
        lens: { focalLength: '50mm', sensorSize: 'full-frame', aperture: 'f/2.8' },
        shotType: 'medium',
        angle: 'eye-level',
        movement: {
          type: 'dolly-in',
          speed: 'slow-cinematic',
          // User dragged endPosition laterally & vertically in 3D space without setting customTrajectory
          startPosition: { x: 50, y: 85, z: 20 },
          endPosition: { x: 78, y: 55, z: 36 },
          targetLookAt: { x: 50, y: 50 },
        },
      },
    });

    const pov = analyzeShotPovVisibility(shot);
    expect(pov.cameraKinematics.isCustomCameraTrajectory).toBe(true);

    const minimax = compileMiniMaxPrompt(shot);
    expect(minimax.positivePrompt.toLowerCase()).not.toContain('dolly-in');
    expect(minimax.positivePrompt.toLowerCase()).not.toContain('smoothly decelerates');
  });

  it('aligns dynamic temporal beat boundaries to interior keyframes (e.g. 3.0s on a 5.0s shot) and describes true post-keyframe camera motion', () => {
    const shot = createDefaultShotSpec({
      durationSeconds: 5.0,
      camera: {
        lens: { focalLength: '50mm', sensorSize: 'full-frame', aperture: 'f/2.8' },
        shotType: 'medium',
        angle: 'eye-level',
        movement: {
          type: 'dolly-in',
          speed: 'moderate',
          startPosition: { x: 50, y: 82, z: 18 },
          endPosition: { x: 30, y: 40, z: 34 },
          targetLookAt: { x: 50, y: 50 },
          keyframes: [
            {
              id: 'cam-kf-3s',
              time: 3.0,
              position: { x: 68, y: 65, z: 22 },
              lookAt: { x: 52, y: 50, z: 15 },
            },
          ],
        },
      },
    });

    const pov = analyzeShotPovVisibility(shot);
    expect(pov.beatBreakpoints.t2).toBe(3.0);

    const minimax = compileMiniMaxPrompt(shot);
    expect(minimax.temporalBeats?.[2].timeRange).toBe('3.0s - 5.0s');
    expect(minimax.temporalBeats?.[2].cameraAction.toLowerCase()).not.toContain('smoothly decelerates');
    expect(minimax.positivePrompt).toContain('Completely supplants the entire 3D previz background, terrain, and stage geometry in <Video 1>');
    expect(minimax.positivePrompt).toContain('without any synthetic 3D previz geometry or keyframe rigidity');
  });

  it('purges all old preset leftovers (Agent Kael, plasma katana, Drone Crimson Searchlight) across all 3 video models even when actor-kael-lead ID is reused', () => {
    const shot = createDefaultShotSpec({
      sceneDescription:
        'Rain-drenched Neo-Tokyo rooftop helipad at night. Cyber-Ronin Agent Kael charges from stage left with a glowing cyan plasma katana slash while an autonomous Hunter-Killer Attack Drone swoops down.',
      environment: {
        id: 'env-coastal-beach',
        name: 'Coastal Sandy Beach & Ocean Shoreline',
        nameAr: 'شاطئ رملي ساحلي وموج البحر',
        category: 'coastal-beach',
        weather: 'clear',
        timeOfDay: 'day',
        groundSurface: 'sand-dunes',
        fogDensity: 0.01,
        fogColor: '#bae6fd',
        skyColor: '#38bdf8',
        groundColor: '#fde68a',
        ambientColor: '#fef3c7',
        promptDescription:
          'sunlit coastal sandy beach with gentle turquoise ocean surf, warm golden sand dunes, and bright coastal horizon',
        visibleInPrevis: true,
      },
      lighting: {
        style: 'neon-cyberpunk',
        direction: 'side-key',
        contrast: 'high-contrast',
        lights: [
          {
            id: 'lgt-01a-crimson',
            name: 'Drone Crimson Searchlight',
            position: { x: 74, y: 38, z: 68 },
            color: '#f43f5e',
            intensity: 3.8,
            enabled: true,
          },
          {
            id: 'lgt-01a-cyan',
            name: 'Cyan Rooftop Helipad Key',
            position: { x: 24, y: 62, z: 48 },
            color: '#06b6d4',
            intensity: 3.5,
            enabled: true,
          },
        ],
      },
      actors: [
        {
          // Deliberately reuse `actor-kael-lead` ID as Mocap Studio does when updating the lead slot
          id: 'actor-kael-lead',
          name: 'Man',
          kind: 'human',
          token: 'adult man in casual coastal jacket and trousers',
          actionDescription: 'walking forward naturally along the sandy beach shoreline',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 47, y: 45, z: 0 },
            endPosition: { x: 47, y: 58, z: 0 },
          },
        },
        {
          id: 'mocap-person-2',
          name: 'Woman',
          kind: 'human',
          token: 'young woman in summer beachwear',
          actionDescription: 'walking alongside the man on the beach',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 53, y: 45, z: 0 },
            endPosition: { x: 53, y: 58, z: 0 },
          },
        },
      ],
    });

    const ltx = compileLtxPrompt(shot);
    const minimax = compileMiniMaxPrompt(shot);
    const seedance = compileSeedancePrompt(shot);

    for (const bundle of [ltx, minimax, seedance]) {
      const p = bundle.positivePrompt.toLowerCase();
      expect(p).toContain('man');
      expect(p).toContain('woman');
      expect(p).toContain('coastal sandy beach');
      expect(p).not.toContain('agent kael');
      expect(p).not.toContain('cyber-ronin');
      expect(p).not.toContain('plasma katana');
      expect(p).not.toContain('neo-tokyo');
      expect(p).not.toContain('drone crimson searchlight');
      expect(p).not.toContain('cyan rooftop helipad key');
      expect(p).not.toContain('hunter-killer');
    }

    // Verify isCustomPromptCoherentWithShot rejects any stale prompt containing old preset leftovers
    expect(
      isCustomPromptCoherentWithShot(
        'Cinematic shot of Cyber-Ronin Agent Kael with a glowing cyan plasma katana under Drone Crimson Searchlight.',
        shot
      )
    ).toBe(false);
    expect(isCustomPromptCoherentWithShot(ltx.positivePrompt, shot)).toBe(true);
    expect(isCustomPromptCoherentWithShot(minimax.positivePrompt, shot)).toBe(true);
    expect(isCustomPromptCoherentWithShot(seedance.positivePrompt, shot)).toBe(true);

    // Verify useShotStore invalidates customPositivePrompts across all 3 engines whenever the 3D scene is mutated
    const store = useShotStore.getState();
    store.resetToDefault();
    store.setCustomPositivePrompt('ltx-2.5', 'Custom locked LTX prompt');
    store.setCustomPositivePrompt('minimax-h3', 'Custom locked MiniMax prompt');
    store.setCustomPositivePrompt('seedance', 'Custom locked Seedance prompt');
    expect(useShotStore.getState().shot.customPositivePrompts?.['ltx-2.5']).toBe('Custom locked LTX prompt');

    // Mutating actors or environment clears customPositivePrompts so all 3 engines recompile fresh scene-only prompts
    store.addActor('Beach Umbrella', 'prop');
    expect(useShotStore.getState().shot.customPositivePrompts).toEqual({});
  });
});

