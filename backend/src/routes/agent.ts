/**
 * Agent Routes — /api/agent/*
 * Handles chat messages, conversation listing, and approval resolution.
 */

import { Router, type Request, type Response } from "express";
import type { Agent } from "../agent/agent.js";

export function createAgentRoutes(agent: Agent): Router {
  const router = Router();

  /** POST /api/agent/chat — Send a message to the agent */
  router.post("/chat", async (req: Request, res: Response) => {
    try {
      const { conversationId, message } = req.body;

      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "message is required" });
        return;
      }

      const result = await agent.processMessage(
        conversationId || null,
        message
      );
      res.json(result);
    } catch (error: any) {
      console.error("[agent/chat] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /** POST /api/agent/approve — Resolve a pending approval */
  router.post("/approve", async (req: Request, res: Response) => {
    try {
      const { approvalId, approved } = req.body;

      if (!approvalId) {
        res.status(400).json({ error: "approvalId is required" });
        return;
      }

      const result = await agent.resolveApproval(
        approvalId,
        Boolean(approved)
      );
      res.json(result);
    } catch (error: any) {
      console.error("[agent/approve] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
