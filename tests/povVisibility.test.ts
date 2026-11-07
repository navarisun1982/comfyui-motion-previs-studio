import { describe, it, expect } from 'vitest';
import { createDefaultShotSpec, ShotSpec } from '../src/types/shotspec';
import { analyzeShotPovVisibility } from '../src/engine/povVisibilityEngine';
import {
  compileLtxPrompt,
  compileMiniMaxPrompt,
  compileSeedancePrompt,
} from '../src/engine/promptCompiler';

describe('Camera-POV Frustum Visibility & Official Model Prompting (povVisibilityEngine)', () => {
  it('includes only the 1 character inside the camera POV and excludes 2 off-screen characters across LTX-2.5, MiniMax H3, and Seedance 2.0', () => {
    const base = createDefaultShotSpec();
    const shot: ShotSpec = {
      ...base,
      durationSeconds: 5.0,
      camera: {
        ...base.camera,
        lens: { ...base.camera.lens, focalLength: '50mm' },
        shotType: 'medium',
        angle: 'eye-level',
        movement: {
          ...base.camera.movement,
          type: 'static',
          startPosition: { x: 50, y: 75, z: 5 },
          endPosition: { x: 50, y: 75, z: 5 },
          targetLookAt: { x: 50, y: 40, z: 50 },
        },
      },
      actors: [
        {
          id: 'actor-in-pov',
          name: 'Detective Vance',
          kind: 'human',
          color: '#EF4444',
          token: 'a trenchcoat detective with a silver badge',
          actionDescription: 'scans the rain-slicked alley',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 50, y: 42 },
            endPosition: { x: 50, y: 42 },
          },
        },
        {
          id: 'actor-behind-cam-left',
          name: 'Offscreen Sniper',
          kind: 'human',
          color: '#06B6D4',
          token: 'a rooftops marksman in camo cloak',
          actionDescription: 'crouches behind the camera rig',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 10, y: 95 },
            endPosition: { x: 10, y: 95 },
          },
        },
        {
          id: 'actor-far-right-outside',
          name: 'Offscreen Bystander',
          kind: 'human',
          color: '#F59E0B',
          token: 'a street vendor with a neon umbrella',
          actionDescription: 'waits far outside the lens field of view',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 98, y: 88 },
            endPosition: { x: 98, y: 88 },
          },
        },
      ],
    };

    const pov = analyzeShotPovVisibility(shot);
    expect(pov.visibleActors.map((a) => a.name)).toEqual(['Detective Vance']);
    expect(pov.offScreenActors.map((a) => a.name)).toEqual([
      'Offscreen Sniper',
      'Offscreen Bystander',
    ]);
    expect(pov.isPureEnvironmentalShot).toBe(false);

    // 1. LTX-2.5 continuous narrative
    const ltx = compileLtxPrompt(shot);
    expect(ltx.positivePrompt).toContain('Detective Vance');
    expect(ltx.positivePrompt).toContain('a trenchcoat detective with a silver badge');
    expect(ltx.positivePrompt).not.toContain('Offscreen Sniper');
    expect(ltx.positivePrompt).not.toContain('marksman');
    expect(ltx.positivePrompt).not.toContain('Offscreen Bystander');
    expect(ltx.positivePrompt).not.toContain('street vendor');

    // 2. MiniMax H3 6-section Ref2VA schema
    const minimax = compileMiniMaxPrompt(shot);
    expect(minimax.positivePrompt).toContain('<Subject 1> is Detective Vance (from <Picture 1>)');
    expect(minimax.positivePrompt).toContain('<Subject 1> (present throughout): attribute_transfer');
    expect(minimax.positivePrompt).not.toContain('<Subject 2>');
    expect(minimax.positivePrompt).not.toContain('<Subject 3>');
    expect(minimax.positivePrompt).not.toContain('Offscreen Sniper');
    expect(minimax.positivePrompt).not.toContain('Offscreen Bystander');
    expect(minimax.positivePrompt).toContain('<Subject 4> is the [Scene Environment] (from <Picture 4>)');
    expect(minimax.positivePrompt).toContain('<Video 1> (entire temporal structure): fully_preserved');

    // 3. Seedance 2.0 6-axis motion matrix
    const seedance = compileSeedancePrompt(shot);
    expect(seedance.positivePrompt).toContain('Detective Vance');
    expect(seedance.positivePrompt).not.toContain('Offscreen Sniper');
    expect(seedance.positivePrompt).not.toContain('Offscreen Bystander');
  });

  it('computes true camera-relative screen-left vs screen-right when the camera orbits 180 degrees', () => {
    const base = createDefaultShotSpec();
    const actorAtX44 = {
      id: 'hero-x44',
      name: 'Agent K',
      kind: 'human' as const,
      token: 'an operative in a dark coat',
      actionDescription: 'stands alert',
      trajectory: {
        startTimeSeconds: 0,
        startPosition: { x: 44, y: 40 },
        endPosition: { x: 44, y: 40 },
      },
    };

    // Camera South (y=70) looking North (y=40): x=44 (-6 in Three.js X) is on screen-left
    const shotSouth: ShotSpec = {
      ...base,
      camera: {
        ...base.camera,
        lens: { ...base.camera.lens, focalLength: '50mm' },
        movement: {
          ...base.camera.movement,
          type: 'static',
          startPosition: { x: 50, y: 70, z: 5 },
          endPosition: { x: 50, y: 70, z: 5 },
          targetLookAt: { x: 50, y: 40, z: 50 },
        },
      },
      actors: [actorAtX44],
    };

    // Camera North (y=10) looking South (y=40): x=44 (-6 in Three.js X) is now on screen-right!
    const shotNorth: ShotSpec = {
      ...base,
      camera: {
        ...base.camera,
        lens: { ...base.camera.lens, focalLength: '50mm' },
        movement: {
          ...base.camera.movement,
          type: 'static',
          startPosition: { x: 50, y: 10, z: 5 },
          endPosition: { x: 50, y: 10, z: 5 },
          targetLookAt: { x: 50, y: 40, z: 50 },
        },
      },
      actors: [actorAtX44],
    };

    const povSouth = analyzeShotPovVisibility(shotSouth);
    const povNorth = analyzeShotPovVisibility(shotNorth);

    expect(povSouth.byActorId['hero-x44'].primaryHorizontalZone).toBe('screen-left');
    expect(povNorth.byActorId['hero-x44'].primaryHorizontalZone).toBe('screen-right');
  });

  it('detects mid-shot frame entry when the camera pans right to reveal a second character', () => {
    const base = createDefaultShotSpec();
    const shot: ShotSpec = {
      ...base,
      durationSeconds: 6.0,
      camera: {
        ...base.camera,
        lens: { ...base.camera.lens, focalLength: '85mm' },
        shotType: 'medium',
        angle: 'eye-level',
        movement: {
          ...base.camera.movement,
          type: 'pan-right',
          startPosition: { x: 50, y: 70, z: 5 },
          endPosition: { x: 50, y: 70, z: 5 },
          targetLookAt: { x: 50, y: 40, z: 50 },
        },
      },
      actors: [
        {
          id: 'left-lead',
          name: 'Lead Operative',
          kind: 'human',
          token: 'a tactical operative',
          actionDescription: 'watches the corridor',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 44, y: 40 },
            endPosition: { x: 44, y: 40 },
          },
        },
        {
          id: 'right-reveal',
          name: 'Revealed Ally',
          kind: 'human',
          token: 'an intelligence courier',
          actionDescription: 'waits at the eastern pillar',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 63, y: 40 },
            endPosition: { x: 63, y: 40 },
          },
        },
      ],
    };

    const pov = analyzeShotPovVisibility(shot);
    expect(pov.byActorId['left-lead'].visibleInBeats.open).toBe(true);
    expect(pov.byActorId['right-reveal'].visibleInBeats.open).toBe(false);
    expect(pov.byActorId['right-reveal'].everVisible).toBe(true);

    const minimax = compileMiniMaxPrompt(shot);
    expect(minimax.positivePrompt).toContain('Revealed Ally');
    expect(minimax.positivePrompt).toContain('enters the camera frame');
  });

  it('detects upper-body visibility in a tight 135mm close-up even when feet are below the frustum', () => {
    const base = createDefaultShotSpec();
    const shot: ShotSpec = {
      ...base,
      camera: {
        ...base.camera,
        lens: { ...base.camera.lens, focalLength: '135mm' },
        shotType: 'close-up',
        angle: 'eye-level',
        movement: {
          ...base.camera.movement,
          type: 'static',
          startPosition: { x: 50, y: 52, z: 9 },
          endPosition: { x: 50, y: 52, z: 9 },
          targetLookAt: { x: 50, y: 40, z: 50 },
        },
      },
      actors: [
        {
          id: 'closeup-hero',
          name: 'Portrait Subject',
          kind: 'human',
          token: 'a weathered captain',
          actionDescription: 'stares intensely into the lens',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 50, y: 40 },
            endPosition: { x: 50, y: 40 },
          },
        },
      ],
    };

    const pov = analyzeShotPovVisibility(shot);
    expect(pov.byActorId['closeup-hero'].everVisible).toBe(true);
    expect(pov.byActorId['closeup-hero'].beats.open.coverage).not.toBe('full-body');
  });

  it('falls back to a pure environmental shot when all stage actors are behind the camera', () => {
    const base = createDefaultShotSpec();
    const shot: ShotSpec = {
      ...base,
      camera: {
        ...base.camera,
        lens: { ...base.camera.lens, focalLength: '35mm' },
        movement: {
          ...base.camera.movement,
          type: 'static',
          startPosition: { x: 50, y: 60, z: 5 },
          endPosition: { x: 50, y: 60, z: 5 },
          targetLookAt: { x: 50, y: 20, z: 50 },
        },
      },
      actors: [
        {
          id: 'behind-1',
          name: 'Hidden Actor One',
          kind: 'human',
          token: 'a hidden guard',
          actionDescription: 'stands behind the camera',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 50, y: 90 },
            endPosition: { x: 50, y: 90 },
          },
        },
      ],
    };

    const pov = analyzeShotPovVisibility(shot);
    expect(pov.isPureEnvironmentalShot).toBe(true);
    expect(pov.visibleActors).toHaveLength(0);

    const ltx = compileLtxPrompt(shot);
    expect(ltx.positivePrompt).not.toContain('Hidden Actor One');
    expect(ltx.positivePrompt).toContain(
      'Scene environment fills the camera frame with continuous natural atmospheric motion'
    );
  });

  it('applies Universal Semantic Entity Instantiation (fully_preserved + weak_reference <Video 1>, never texture-wrapping) across all entity types (human, tree/prop, vehicle, environment)', () => {
    const base = createDefaultShotSpec();
    const shot: ShotSpec = {
      ...base,
      camera: {
        ...base.camera,
        lens: { ...base.camera.lens, focalLength: '35mm' },
        movement: {
          ...base.camera.movement,
          type: 'dolly-in',
          startPosition: { x: 50, y: 75, z: 5 },
          endPosition: { x: 50, y: 60, z: 5 },
          targetLookAt: { x: 50, y: 40, z: 50 },
        },
      },
      actors: [
        {
          id: 'entity-tree',
          name: 'Ancient Blossom Tree',
          kind: 'prop',
          color: '#06B6D4',
          scale: 1.8,
          token: 'a gnarled cherry blossom tree with wind-swept pink petals',
          actionDescription: 'branches sway gently in the breeze',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 42, y: 40 },
            endPosition: { x: 42, y: 40 },
          },
        },
        {
          id: 'entity-human',
          name: 'Wanderer',
          kind: 'human',
          color: '#EF4444',
          scale: 1.0,
          token: 'a traveler in a weathered linen cloak',
          actionDescription: 'walks past the tree',
          trajectory: {
            startTimeSeconds: 0,
            startPosition: { x: 55, y: 42 },
            endPosition: { x: 50, y: 38 },
          },
        },
      ],
    };

    const minimax = compileMiniMaxPrompt(shot);
    // Official ComfyUI Rotating Hive Chamber schema:
    // Subjects 1..3 use attribute_transfer (transferring finished appearance from <Picture N> onto animated <Video 1> trajectory),
    // Environment (<Subject 4>) uses fully_preserved, and <Video 1> (entire temporal structure) uses fully_preserved.
    expect(minimax.positivePrompt).toContain('<Subject 1> is Ancient Blossom Tree (from <Picture 1>)');
    expect(minimax.positivePrompt).toContain('<Subject 1> (present throughout): attribute_transfer');
    expect(minimax.positivePrompt).toContain('<Subject 2> is Wanderer (from <Picture 2>)');
    expect(minimax.positivePrompt).toContain('<Subject 2> (present throughout): attribute_transfer');
    expect(minimax.positivePrompt).toContain('<Subject 4> (present throughout): fully_preserved');
    expect(minimax.positivePrompt).toContain(
      '<Video 1> (entire temporal structure): fully_preserved - preserve its complete animation, timing, camera transform, camera angle, framing, subject screen placement, scale proportions, altitude changes, orientation transitions, shot duration, and frame progression without alteration.'
    );
    expect(minimax.positivePrompt).toContain('<Video 1> takes absolute priority');
    expect(minimax.positivePrompt).not.toContain('#10B981');
    expect(minimax.positivePrompt).not.toContain('#EF4444');

    const ltx = compileLtxPrompt(shot);
    expect(ltx.positivePrompt).toContain('living real-world environment and entities');
    expect(ltx.positivePrompt).toContain('without any synthetic 3D previz geometry');

    const seedance = compileSeedancePrompt(shot);
    expect(seedance.positivePrompt).toContain('[Previs-to-Reality Spatial Instantiation]');
  });
});
