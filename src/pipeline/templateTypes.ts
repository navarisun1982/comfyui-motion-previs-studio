import { z } from 'zod';

/**
 * ComfyUI API-format workflow ("Export (API)"): node id -> { class_type, inputs }.
 * An input value is either a literal or a link `[sourceNodeId, outputIndex]`.
 */
export interface ApiNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}
export type ApiWorkflow = Record<string, ApiNode>;

export type EngineId = 'ltx-2.5' | 'minimax-h3';
export type GenerationMode = 't2v' | 'i2v';
export type QualityProfile = 'draft' | 'final';

/** Semantic fields a binding may map onto template inputs. */
export const BINDABLE_FIELDS = [
  'prompt',
  'negative',
  'seed',
  'seedCount',
  'winner',
  'durationSeconds',
  'frameRate',
  'aspectRatio',
  'width',
  'height',
  'timeline',
  'filenamePrefix',
] as const;
export type BindableField = (typeof BINDABLE_FIELDS)[number];

const NodeIdSchema = z.string().regex(/^[0-9]+(:[0-9]+)*$/, 'node ids are numeric strings (subgraph ids use "a:b")');

export const FieldTargetSchema = z
  .object({
    node: NodeIdSchema,
    input: z.string().min(1),
    /** Optional, unconnected inputs are omitted from API exports; allow setting them. */
    allowAbsent: z.boolean().optional(),
    /** Always write this constant, ignoring the runtime value. */
    fixed: z.unknown().optional(),
    /** Map a runtime value (stringified) onto a template literal, e.g. '16:9' -> '16:9 (Widescreen)'. */
    map: z.record(z.unknown()).optional(),
    /** Timeline patcher id (`name@version`) applied to a JSON-string input. */
    patch: z.string().regex(/^[a-z0-9]+\.[A-Za-z0-9]+@[0-9]+$/).optional(),
  })
  .strict()
  .refine((t) => [t.fixed !== undefined, t.map !== undefined, t.patch !== undefined].filter(Boolean).length <= 1, {
    message: 'a target may use at most one of fixed / map / patch',
  });
export type FieldTarget = z.infer<typeof FieldTargetSchema>;

const FieldSpecSchema = z.union([FieldTargetSchema, z.array(FieldTargetSchema).min(1)]);

export const ProfileOverrideSchema = z
  .object({ node: NodeIdSchema, input: z.string().min(1), value: z.unknown() })
  .strict();

export const BindingSchema = z
  .object({
    schema: z.literal(1),
    templateId: z.string().regex(/^[a-z0-9_]+$/),
    engine: z.enum(['ltx-2.5', 'minimax-h3']),
    label: z.string().min(1),
    api: z.string().regex(/\.api\.json$/),
    modes: z.array(z.enum(['t2v', 'i2v'])).min(1),
    /** Fingerprint: every node the binding relies on, with its expected class_type. */
    nodes: z.record(NodeIdSchema, z.string().min(1)),
    fields: z.record(z.enum(BINDABLE_FIELDS), FieldSpecSchema),
    profiles: z.object({
      draft: z.array(ProfileOverrideSchema),
      final: z.array(ProfileOverrideSchema),
    }),
    output: z.object({ node: NodeIdSchema }).strict(),
    /** Frame-count constraint of the engine, e.g. LTX needs 8n+1 pixel frames. */
    frameRule: z.enum(['8n+1', 'any']).default('any'),
    notes: z.array(z.string()).optional(),
  })
  .strict();
export type TemplateBinding = z.infer<typeof BindingSchema>;

export function targetsOf(spec: FieldTarget | FieldTarget[] | undefined): FieldTarget[] {
  if (!spec) return [];
  return Array.isArray(spec) ? spec : [spec];
}

export function isLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number';
}
