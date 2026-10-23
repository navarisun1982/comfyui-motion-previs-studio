import { resolveObjectArchetype } from '../../src/engine/procedural3D/archetypeResolver';

const p1 = resolveObjectArchetype(
  'Cybernetic Beast a quadrupedal robotic military attack hound with hydraulic legs and sensor head',
  'creature'
);
console.log('Cyber Beast with prompt:', p1.matchedArchetype?.name, 'score:', p1.confidence);
console.log('Trace:', JSON.stringify(p1.reasoningTrace.step05Routing));

const p2 = resolveObjectArchetype(
  'Shadow Ninja Assassin an agile shinobi ninja clad in matte-black tactical gi with face wrap poised in crouching stance',
  'character'
);
console.log('Ninja with prompt:', p2.matchedArchetype?.name, 'score:', p2.confidence);
console.log('Trace:', JSON.stringify(p2.reasoningTrace.step05Routing));

const p3 = resolveObjectArchetype(
  'Lead Subject',
  'human'
);
console.log('Lead Subject:', p3.matchedArchetype?.name, 'score:', p3.confidence);
