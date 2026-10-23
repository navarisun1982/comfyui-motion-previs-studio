import {
  ApiWorkflow,
  BINDABLE_FIELDS,
  BindingSchema,
  FieldTarget,
  TemplateBinding,
  isLink,
  targetsOf,
} from './templateTypes';
import { getPatcher } from './timelinePatchers';

export interface VerificationResult {
  ok: boolean;
  errors: string[];
}

const REQUIRED_FIELDS = ['prompt', 'seed', 'durationSeconds'] as const;

/**
 * Parse a raw binding file. Zod errors are flattened into readable lines.
 */
export function parseBinding(raw: unknown, sourceName: string): { binding?: TemplateBinding; errors: string[] } {
  const res = BindingSchema.safeParse(raw);
  if (res.success) return { binding: res.data, errors: [] };
  return {
    errors: res.error.issues.map((i) => `${sourceName}: ${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

/**
 * Verify a binding against its API-format template. Every check is strict:
 * a mismatch means the template was re-exported or edited and the binding is
 * no longer trustworthy, so we refuse rather than inject into the wrong place.
 */
export function verifyBinding(api: ApiWorkflow, binding: TemplateBinding): VerificationResult {
  const errors: string[] = [];
  const t = binding.templateId;
  const nodeLabel = (id: string) => {
    const title = api[id]?._meta?.title;
    return title ? `node ${id} ("${title}")` : `node ${id}`;
  };

  // 1. Fingerprint: node ids + class types.
  for (const [id, expected] of Object.entries(binding.nodes)) {
    const node = api[id];
    if (!node) {
      errors.push(`Template ${t} changed: ${nodeLabel(id)} no longer exists (expected ${expected}).`);
    } else if (node.class_type !== expected) {
      errors.push(`Template ${t} changed: ${nodeLabel(id)} is now ${node.class_type}, expected ${expected}.`);
    }
  }

  const checkTarget = (where: string, target: { node: string; input: string; allowAbsent?: boolean }) => {
    if (!(target.node in binding.nodes)) {
      errors.push(`${t}: ${where} targets node ${target.node}, which is not listed in "nodes" (every bound node must be fingerprinted).`);
      return;
    }
    const node = api[target.node];
    if (!node) return; // already reported by the fingerprint check
    const present = Object.prototype.hasOwnProperty.call(node.inputs, target.input);
    if (!present && !target.allowAbsent) {
      errors.push(`Template ${t} changed: ${nodeLabel(target.node)} has no input "${target.input}" (${where}).`);
      return;
    }
    if (present && isLink(node.inputs[target.input])) {
      const [src] = node.inputs[target.input] as [string, number];
      errors.push(
        `${t}: ${where} targets ${nodeLabel(target.node)}.${target.input}, which is wired to node ${src}. Bind the source node instead.`,
      );
    }
  };

  // 2. Required fields.
  for (const f of REQUIRED_FIELDS) {
    if (!binding.fields[f]) errors.push(`${t}: required field "${f}" is not bound.`);
  }
  if (binding.modes.includes('i2v') && !binding.fields.timeline) {
    errors.push(`${t}: declares mode "i2v" but binds no "timeline" field to carry the first frame.`);
  }

  // 3. Field targets.
  for (const field of BINDABLE_FIELDS) {
    for (const target of targetsOf(binding.fields[field])) {
      checkTarget(`field "${field}"`, target);
      if (target.patch) verifyPatchTarget(api, binding, field, target, errors);
    }
  }

  // 4. Profile overrides.
  for (const profile of ['draft', 'final'] as const) {
    for (const o of binding.profiles[profile]) checkTarget(`profile "${profile}"`, o);
  }

  // 5. Output node.
  if (!(binding.output.node in binding.nodes)) {
    errors.push(`${t}: output node ${binding.output.node} is not listed in "nodes".`);
  }

  return { ok: errors.length === 0, errors };
}

function verifyPatchTarget(
  api: ApiWorkflow,
  binding: TemplateBinding,
  field: string,
  target: FieldTarget,
  errors: string[],
): void {
  const t = binding.templateId;
  const patcher = getPatcher(target.patch!);
  if (!patcher) {
    errors.push(`${t}: field "${field}" uses unknown patcher "${target.patch}".`);
    return;
  }
  const raw = api[target.node]?.inputs[target.input];
  if (raw === undefined) return; // reported elsewhere
  if (typeof raw !== 'string') {
    errors.push(`${t}: field "${field}" patches node ${target.node}.${target.input}, which is not a JSON string.`);
    return;
  }
  let parsed: unknown;
  try {
    parsed = raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    errors.push(`${t}: node ${target.node}.${target.input} is not valid JSON (${(e as Error).message}).`);
    return;
  }
  for (const err of patcher.validate(parsed)) {
    errors.push(`${t}: ${patcher.id} cannot patch node ${target.node}.${target.input}: ${err}`);
  }
}
