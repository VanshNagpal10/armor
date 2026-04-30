/**
 * Logs Routes — /api/logs/*
 * View conversation logs, messages, and pending approvals.
 */

import { Router, type Request, type Response } from "express";
import db from "../db/database.js";

export function createLogsRoutes(): Router {
  const router = Router();

  /** GET /api/logs/conversations — List all conversations */
  router.get("/conversations", (_req: Request, res: Response) => {
    try {
      const conversations = db
        .prepare(
          `SELECT c.*,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
            (SELECT COALESCE(SUM(m.token_count), 0) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'assistant') as total_tokens
           FROM conversations c
           ORDER BY c.updated_at DESC`
        )
        .all();

      res.json({ conversations });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/logs/conversations/:id — Get a conversation's messages */
  router.get("/conversations/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const conversation = db
        .prepare(`SELECT * FROM conversations WHERE id = ?`)
        .get(id);

      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      const messages = db
        .prepare(
          `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
        )
        .all(id);

      res.json({ conversation, messages });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** DELETE /api/logs/conversations/:id — Delete a conversation */
  router.delete("/conversations/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      db.prepare(`DELETE FROM messages WHERE conversation_id = ?`).run(id);
      db.prepare(`DELETE FROM pending_approvals WHERE conversation_id = ?`).run(id);
      const result = db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);

      if (result.changes === 0) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/logs/approvals — List all pending approvals */
  router.get("/approvals", (_req: Request, res: Response) => {
    try {
      const approvals = db
        .prepare(
          `SELECT pa.*, c.title as conversation_title
           FROM pending_approvals pa
           JOIN conversations c ON c.id = pa.conversation_id
           ORDER BY pa.created_at DESC`
        )
        .all();

      res.json({ approvals });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
