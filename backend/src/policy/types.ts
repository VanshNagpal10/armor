/**
 * Policy Types — Zod schemas and TypeScript types for the policy engine.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Rule condition schemas
// ---------------------------------------------------------------------------

/** Condition for input_validation rules */
export const InputValidationConditionSchema = z.object({
  /** The argument field to validate */
  field: z.string(),
  /** Validation operator */
  operator: z.enum([
    "must_contain",
    "must_not_contain",
    "must_start_with",
    "must_match_regex",
    "max_length",
  ]),
  /** The value to compare against */
  value: z.string(),
});

/** Union condition — different rule types carry different payloads */
export const RuleConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("block") }),
  z.object({ type: z.literal("require_approval") }),
  z.object({
    type: z.literal("input_validation"),
    validations: z.array(InputValidationConditionSchema),
  }),
]);

// ---------------------------------------------------------------------------
// Rule CRUD schemas
// ---------------------------------------------------------------------------

export const CreateRuleSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["block", "require_approval", "input_validation"]),
  tool_name: z.string().optional().nullable(),
  server_name: z.string().optional().nullable(),
  condition: RuleConditionSchema,
  enabled: z.boolean().default(true),
});

export const UpdateRuleSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["block", "require_approval", "input_validation"]).optional(),
  tool_name: z.string().optional().nullable(),
  server_name: z.string().optional().nullable(),
  condition: RuleConditionSchema.optional(),
  enabled: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------

export type InputValidationCondition = z.infer<
  typeof InputValidationConditionSchema
>;
export type RuleCondition = z.infer<typeof RuleConditionSchema>;
export type CreateRuleInput = z.infer<typeof CreateRuleSchema>;
export type UpdateRuleInput = z.infer<typeof UpdateRuleSchema>;

export interface PolicyRule {
  id: string;
  name: string;
  type: "block" | "require_approval" | "input_validation";
  tool_name: string | null;
  server_name: string | null;
  condition: RuleCondition;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** The verdict returned by the policy engine for a single tool call */
export interface PolicyVerdict {
  allowed: boolean;
  action: "allow" | "block" | "require_approval" | "input_validation_failed";
  rule?: PolicyRule;
  message?: string;
}
