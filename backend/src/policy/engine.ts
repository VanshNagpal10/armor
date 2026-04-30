/**
 * Policy Engine — self-contained module that evaluates tool calls against rules.
 *
 * This module is intentionally decoupled from the agent. It reads rules from
 * the database (or an in-memory cache refreshed via WebSocket signals) and
 * returns a PolicyVerdict for each tool call the agent wants to make.
 */

import db from "../db/database.js";
import type {
  PolicyRule,
  PolicyVerdict,
  InputValidationCondition,
} from "./types.js";

export class PolicyEngine {
  private rulesCache: PolicyRule[] = [];

  constructor() {
    this.refreshRules();
  }

  /** Reload rules from the database. Called on startup and after any rule change. */
  refreshRules(): void {
    const rows = db
      .prepare(`SELECT * FROM policy_rules WHERE enabled = 1 ORDER BY created_at ASC`)
      .all() as any[];

    this.rulesCache = rows.map((r) => ({
      ...r,
      enabled: Boolean(r.enabled),
      condition: JSON.parse(r.condition),
    }));
  }

  /** Return all cached (enabled) rules. */
  getRules(): PolicyRule[] {
    return this.rulesCache;
  }

  /**
   * Evaluate a proposed tool call against all enabled rules.
   *
   * @param toolName  The name of the tool the LLM wants to call
   * @param args      The arguments the LLM passed
   * @param serverName  The MCP server that owns this tool
   * @returns A PolicyVerdict indicating whether the call is allowed
   */
  evaluate(
    toolName: string,
    args: Record<string, unknown>,
    serverName: string
  ): PolicyVerdict {
    for (const rule of this.rulesCache) {
      // Check if the rule applies to this tool/server
      if (!this.ruleApplies(rule, toolName, serverName)) continue;

      switch (rule.type) {
        case "block":
          return {
            allowed: false,
            action: "block",
            rule,
            message: `Blocked by rule "${rule.name}": tool "${toolName}" is not permitted.`,
          };

        case "require_approval":
          return {
            allowed: false,
            action: "require_approval",
            rule,
            message: `Tool "${toolName}" requires human approval (rule: "${rule.name}").`,
          };

        case "input_validation": {
          const cond = rule.condition as {
            type: "input_validation";
            validations: InputValidationCondition[];
          };

          for (const v of cond.validations) {
            const fieldValue = String(args[v.field] ?? "");
            const valid = this.checkValidation(fieldValue, v);
            if (!valid) {
              return {
                allowed: false,
                action: "input_validation_failed",
                rule,
                message: `Input validation failed for field "${v.field}": ${v.operator} "${v.value}" (rule: "${rule.name}").`,
              };
            }
          }
          break; // Passed all validations for this rule — continue to next rule
        }
      }
    }

    return { allowed: true, action: "allow" };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private ruleApplies(
    rule: PolicyRule,
    toolName: string,
    serverName: string
  ): boolean {
    // A rule with no tool_name / server_name applies to everything
    const toolMatch = !rule.tool_name || rule.tool_name === toolName || rule.tool_name === "*";
    const serverMatch =
      !rule.server_name || rule.server_name === serverName || rule.server_name === "*";
    return toolMatch && serverMatch;
  }

  private checkValidation(
    value: string,
    validation: InputValidationCondition
  ): boolean {
    switch (validation.operator) {
      case "must_contain":
        return value.includes(validation.value);
      case "must_not_contain":
        return !value.includes(validation.value);
      case "must_start_with":
        return value.startsWith(validation.value);
      case "must_match_regex":
        try {
          return new RegExp(validation.value).test(value);
        } catch {
          return false;
        }
      case "max_length":
        return value.length <= parseInt(validation.value, 10);
      default:
        return true;
    }
  }
}
