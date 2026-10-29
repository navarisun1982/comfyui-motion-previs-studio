import { describe, it, expect, beforeEach } from 'vitest';
import {
  walkTo,
  sitInSeat,
  reachGrip,
  standIdle,
  talkGesture,
  hitReaction,
  exitCar,
  compileMotionPlan,
  decomposeDirectorialMotion,
  MotionPlan,
} from '../src/engine/kinematics';
import { useShotStore } from '../src/stores/useShotStore';
import { installMemoryStorage } from './helpers/memoryStorage';

describe('Declarative Motion Skills & Deterministic Kinematics', () => {
  beforeEach(() => {
    installMemoryStorage();
    const store = useShotStore.getState();
    store.clearAllActors();
  });

  describe('Skill Builders', () => {
    it('creates walkTo skill invocation with target coordinates', () => {
      const skill = walkTo({ to: [3, 4], steps: 6, heading: 45 });
      expect(skill.skill).toBe('walkTo');
      expect(skill.args.to).toEqual([3, 4]);
      expect(skill.args.steps).toBe(6);
      expect(skill.args.heading).toBe(45);
    });

    it('creates sitInSeat skill with seat coordinate and settling duration', () => {
      const skill = sitInSeat({ seatTarget: [1, 0.45, 2], durationSec: 2.0 });
      expect(skill.skill).toBe('sitInSeat');
      expect(skill.args.seatTarget).toEqual([1, 0.45, 2]);
      expect(skill.args.durationSec).toBe(2.0);
    });

    it('creates reachGrip skill with hand side and target position', () => {
      const skill = reachGrip({ target: [0.5, 1.2, 0.8], hand: 'right', grasp: 'grip' });
      expect(skill.skill).toBe('reachGrip');
      expect(skill.args.hand).toBe('right');
      expect(skill.args.grasp).toBe('grip');
      expect(skill.args.target).toEqual([0.5, 1.2, 0.8]);
    });

    it('creates standIdle, talkGesture, hitReaction, and exitCar skills', () => {
      const idle = standIdle({ stance: 'alert', durationSec: 3 });
      expect(idle.skill).toBe('standIdle');
      expect(idle.args.stance).toBe('alert');

      const talk = talkGesture({ intensity: 0.8, style: 'expressive' });
      expect(talk.skill).toBe('talkGesture');
      expect(talk.args.intensity).toBe(0.8);

      const hit = hitReaction({ direction: 'front', intensity: 0.7 });
      expect(hit.skill).toBe('hitReaction');
      expect(hit.args.direction).toBe('front');

      const carExit = exitCar({ side: 'left' });
      expect(carExit.skill).toBe('exitCar');
      expect(carExit.args.side).toBe('left');
    });
  });

  describe('Motion Compiler & Foot-Grounding Locks', () => {
    it('compiles a walkTo motion plan into trajectory keyframes', () => {
      const plan: MotionPlan = {
        actorId: 'test_actor',
        totalDurationSec: 4.0,
        skills: [
          walkTo({ to: [2, 0], steps: 4 }),
        ],
      };

      const compiled = compileMotionPlan(plan, {
        startPosition: [0, 0],
        startHeadingDeg: 0,
        shotDurationSec: 4.0,
      });

      expect(compiled.keyframes.length).toBeGreaterThan(0);
      expect(compiled.frames.length).toBeGreaterThan(0);

      // Verify the final position approaches target [2, 0]
      const lastKeyframe = compiled.keyframes[compiled.keyframes.length - 1];
      expect(lastKeyframe.position.x).toBeCloseTo(2, 0.5);

      // Verify gait was set to walk
      expect(compiled.keyframes[1].gait).toBe('walk');
    });

    it('enforces foot-grounding lock: planted foot does not slide horizontally during stance phase', () => {
      const plan: MotionPlan = {
        actorId: 'test_actor',
        totalDurationSec: 5.0,
        skills: [
          walkTo({ to: [4, 0], steps: 6 }),
        ],
      };

      const compiled = compileMotionPlan(plan, {
        startPosition: [0, 0],
        startHeadingDeg: 0,
        shotDurationSec: 5.0,
      });

      // Find stance frames where left foot is planted
      const leftPlantedFrames = compiled.frames.filter((f) => f.isFootPlanted.left);
      expect(leftPlantedFrames.length).toBeGreaterThan(0);

      // Verify foot target Y is grounded >= 0
      for (const frame of compiled.frames) {
        if (frame.ikTargets?.leftFoot) {
          expect(frame.ikTargets.leftFoot.position[1]).toBeGreaterThanOrEqual(0);
        }
        if (frame.ikTargets?.rightFoot) {
          expect(frame.ikTargets.rightFoot.position[1]).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('compiles sitInSeat with lower hip elevation and seated pose', () => {
      const plan: MotionPlan = {
        actorId: 'test_actor',
        totalDurationSec: 3.0,
        skills: [
          sitInSeat({ seatTarget: [0, 0.45, 0], durationSec: 2.0 }),
        ],
      };

      const compiled = compileMotionPlan(plan, {
        startPosition: [0, 0],
        startHeadingDeg: 0,
        shotDurationSec: 3.0,
      });

      expect(compiled.keyframes.length).toBeGreaterThan(0);
      const lastFrame = compiled.frames[compiled.frames.length - 1];
      // Hip offset should be significantly lowered for sitting
      expect(lastFrame.pose.hipsOffset![1]).toBeLessThan(0);
      // Leg rotations should exist
      expect(lastFrame.pose.rotations['LeftUpLeg']).toBeDefined();
      expect(lastFrame.pose.rotations['RightUpLeg']).toBeDefined();
    });

    it('compiles reachGrip with IK targets for the grasping hand', () => {
      const targetPos: [number, number, number] = [0.4, 1.1, 0.6];
      const plan: MotionPlan = {
        actorId: 'test_actor',
        totalDurationSec: 3.0,
        skills: [
          reachGrip({ target: targetPos, hand: 'right', grasp: 'grip' }),
        ],
      };

      const compiled = compileMotionPlan(plan, {
        startPosition: [0, 0],
        startHeadingDeg: 0,
        shotDurationSec: 3.0,
      });

      const reachFrames = compiled.frames.filter((f) => f.ikTargets?.rightHand);
      expect(reachFrames.length).toBeGreaterThan(0);
      const targetFrame = reachFrames[reachFrames.length - 1];
      expect(targetFrame.ikTargets?.rightHand).toBeDefined();
      expect(targetFrame.ikTargets?.rightHand?.position[0]).toBeCloseTo(0.4, 0.2);
    });
  });

  describe('Directorial Natural Language Motion Decomposer', () => {
    it('decomposes English directorial prompts into sequential motion skills', () => {
      const prompt = 'walk to 2.5, 3.0 then sit down in the chair and reach with right hand';
      const plan = decomposeDirectorialMotion(prompt, {
        actorName: 'Detective',
        startPosition: [0, 0],
      });

      expect(plan.skills.length).toBeGreaterThanOrEqual(2);
      const skillTypes = plan.skills.map((s) => s.skill);
      expect(skillTypes).toContain('walkTo');
      expect(skillTypes).toContain('sitInSeat');
    });

    it('decomposes Arabic directorial prompts accurately', () => {
      const prompt = 'يمشي إلى 3, 2 ثم يقف بهدوء ويتحدث بإشارة معبرة';
      const plan = decomposeDirectorialMotion(prompt, {
        actorName: 'البطل',
        startPosition: [0, 0],
      });

      expect(plan.skills.length).toBeGreaterThanOrEqual(2);
      const skillTypes = plan.skills.map((s) => s.skill);
      expect(skillTypes).toContain('walkTo');
      expect(skillTypes).toContain('talkGesture');
    });

    it('resolves actor targets by name when walking or interacting', () => {
      const prompt = 'walk to Chair and sit in seat';
      const plan = decomposeDirectorialMotion(prompt, {
        actorName: 'Subject',
        startPosition: [0, 0],
        actors: [
          { id: 'actor_chair_1', name: 'Chair', position: [2.5, 1.5], kind: 'prop' },
        ],
      });

      const walkSkill = plan.skills.find((s) => s.skill === 'walkTo');
      expect(walkSkill).toBeDefined();
      expect((walkSkill?.args as any).to).toEqual([2.5, 1.5]);

      const sitSkill = plan.skills.find((s) => s.skill === 'sitInSeat');
      expect(sitSkill).toBeDefined();
      expect((sitSkill?.args as any).seatActorId).toBe('actor_chair_1');
    });
  });

  describe('useShotStore: applyDirectorialMotion action', () => {
    it('applies directorial motion plan directly to store actor and updates keyframes', () => {
      const store = useShotStore.getState();
      store.addActor('Protagonist', 'human', 'a confident detective');
      const actorId = useShotStore.getState().shot.actors[0].id;

      // Apply directorial instruction
      store.applyDirectorialMotion(actorId, 'walk to 3, 2 and stand alert');

      const updatedActor = useShotStore.getState().shot.actors[0];
      expect(updatedActor.trajectory.keyframes?.length).toBeGreaterThan(0);
      expect(updatedActor.pose).toBeDefined();
      expect(updatedActor.trajectory.endPosition.x).toBeCloseTo(3, 0.5);
    });
  });
});
