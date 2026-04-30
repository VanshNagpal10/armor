/**
 * Policy Routes — /api/policy/*
 * CRUD for guardrail rules.
 */

import { Router, type Request, type Response } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/database.js";
import { PolicyEngine } from "../policy/engine.js";
import { CreateRuleSchema, UpdateRuleSchema } from "../policy/types.js";
import type { WebSocketBroadcast } from "../websocket.js";

export function createPolicyRoutes(
  policyEngine: PolicyEngine,
  broadcast: WebSocketBroadcast
): Router {
  const router = Router();

  /** GET /api/policy/rules — List all rules */
  router.get("/rules", (_req: Request, res: Response) => {
    try {
      const rows = db
        .prepare(`SELECT * FROM policy_rules ORDER BY created_at DESC`)
        .all() as any[];

      const rules = rows.map((r) => ({
        ...r,
        enabled: Boolean(r.enabled),
        condition: JSON.parse(r.condition),
      }));

      res.json({ rules });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** POST /api/policy/rules — Create a new rule */
  router.post("/rules", (req: Request, res: Response) => {
    try {
      const parsed = CreateRuleSchema.parse(req.body);
      const id = uuid();

      db.prepare(
        `INSERT INTO policy_rules (id, name, type, tool_name, server_name, condition, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        parsed.name,
        parsed.type,
        parsed.tool_name || null,
        parsed.server_name || null,
        JSON.stringify(parsed.condition),
        parsed.enabled ? 1 : 0
      );

      // Refresh the policy engine cache
      policyEngine.refreshRules();

      // Broadcast update to connected WebSocket clients
      broadcast("policy_update", { action: "created", ruleId: id });

      const rule = db.prepare(`SELECT * FROM policy_rules WHERE id = ?`).get(id) as any;
      res.status(201).json({
        ...rule,
        enabled: Boolean(rule.enabled),
        condition: JSON.parse(rule.condition),
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message });
    }
  });

  /** PATCH /api/policy/rules/:id — Update a rule */
  router.patch("/rules/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const existing = db
        .prepare(`SELECT * FROM policy_rules WHERE id = ?`)
        .get(id);

      if (!existing) {
        res.status(404).json({ error: "Rule not found" });
        return;
      }

      const parsed = UpdateRuleSchema.parse(req.body);
      const updates: string[] = [];
      const values: any[] = [];

      if (parsed.name !== undefined) {
        updates.push("name = ?");
        values.push(parsed.name);
      }
      if (parsed.type !== undefined) {
        updates.push("type = ?");
        values.push(parsed.type);
      }
      if (parsed.tool_name !== undefined) {
        updates.push("tool_name = ?");
        values.push(parsed.tool_name);
      }
      if (parsed.server_name !== undefined) {
        updates.push("server_name = ?");
        values.push(parsed.server_name);
      }
      if (parsed.condition !== undefined) {
        updates.push("condition = ?");
        values.push(JSON.stringify(parsed.condition));
      }
      if (parsed.enabled !== undefined) {
        updates.push("enabled = ?");
        values.push(parsed.enabled ? 1 : 0);
      }

      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        values.push(id);
        db.prepare(
          `UPDATE policy_rules SET ${updates.join(", ")} WHERE id = ?`
        ).run(...values);
      }

      policyEngine.refreshRules();
      broadcast("policy_update", { action: "updated", ruleId: id });

      const rule = db.prepare(`SELECT * FROM policy_rules WHERE id = ?`).get(id) as any;
      res.json({
        ...rule,
        enabled: Boolean(rule.enabled),
        condition: JSON.parse(rule.condition),
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: error.errors });
        return;
      }
      res.status(500).json({ error: error.message });
    }
  });

  /** DELETE /api/policy/rules/:id — Delete a rule */
  router.delete("/rules/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = db
        .prepare(`DELETE FROM policy_rules WHERE id = ?`)
        .run(id);

      if (result.changes === 0) {
        res.status(404).json({ error: "Rule not found" });
        return;
      }

      policyEngine.refreshRules();
      broadcast("policy_update", { action: "deleted", ruleId: id });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
