import { extractTokens, ARCHETYPE_REGISTRY, levenshteinDistance } from '../src/engine/procedural3D/archetypeResolver';

const text = 'Cybernetic Beast a quadrupedal robotic military attack hound with hydraulic legs and sensor head';
const cleanCategory = 'creature';

const rawQueryTokens = extractTokens(text);
const GENERIC_TOKENS = new Set([
  'actor', 'subject', 'character', 'prop', 'object', 'item',
  'element', 'new', 'unnamed', 'lead', 'hero', 'walker',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'detailed', 'distinct', 'custom', 'a', 'an', 'the',
  'ممثل', 'عنصر', 'شيء', 'شخصيه', 'جديد',
]);

const substantiveQueryTokens = rawQueryTokens.filter((t) => !GENERIC_TOKENS.has(t));
const activeTokens = substantiveQueryTokens.length > 0 ? substantiveQueryTokens : extractTokens(cleanCategory);

const QUERY_ALIASES: Record<string, string[]> = {
  motorcycle: ['motorbike', 'bike', 'scooter', 'دباب', 'موتوسيكل'],
  flute: ['woodwind', 'aerophone', 'instrument', 'ناي', 'مزمار'],
  camera: ['lens', 'rig', 'optics', 'dolly', 'cine', 'tripod'],
  airplane: ['plane', 'aircraft', 'jet', 'aviation'],
  automobile: ['car', 'sedan', 'vehicle', 'truck', 'suv'],
  computer: ['laptop', 'notebook', 'macbook'],
  sound: ['speaker', 'audio', 'acoustic', 'microphone'],
  television: ['tv', 'monitor', 'screen', 'display'],
  signboard: ['billboard', 'noticeboard', 'placard', 'لافتة', 'يافطة'],
  boulder: ['rock', 'stone', 'crag', 'cliff', 'صخرة', 'حجر'],
  reeds: ['reed', 'cattails', 'rushes', 'bamboo', 'قصب', 'بردي'],
  clothesline: ['laundry', 'washing', 'حبل غسيل', 'غسيل'],
  cart: ['wagon', 'handcart', 'wheelbarrow', 'chariot', 'عربة', 'كارو'],
  fence: ['railing', 'paling', 'palisade', 'barrier', 'سور', 'سياج'],
};

// FIXED: Exact match only for alias keys
const expandedTokens = new Set<string>(activeTokens);
for (const token of activeTokens) {
  if (QUERY_ALIASES[token]) {
    for (const exp of QUERY_ALIASES[token]) expandedTokens.add(exp);
  }
}

let bestArchetype: any = null;
let highestScore = 0;
const k1 = 1.2;
const b = 0.75;
const avgKwLength = 25;

for (const archetype of ARCHETYPE_REGISTRY) {
  let score = 0;
  const docLength = archetype.keywords.length;

  for (const token of expandedTokens) {
    for (const kw of archetype.keywords) {
      const cleanKw = extractTokens(kw)[0] || kw.toLowerCase();
      if (cleanKw === token) {
        score += 10.0;
      } else if (token.length >= 4 && cleanKw.length >= 4 && (cleanKw.startsWith(token) || token.startsWith(cleanKw))) {
        score += 5.0;
      }
    }
  }
  const normalizedScore = score / (1 + k1 * (1 - b + b * (docLength / avgKwLength)));
  if (normalizedScore > highestScore) {
    highestScore = normalizedScore;
    bestArchetype = archetype;
  }
}

console.log('Fixed Best Archetype for Cybernetic Beast:', bestArchetype?.name, 'score:', highestScore);
