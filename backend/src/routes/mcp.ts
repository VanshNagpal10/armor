/**
 * MCP Routes — /api/mcp/*
 * Manage MCP server connections and view discovered tools.
 */

import { Router, type Request, type Response } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/database.js";
import { McpManager } from "../mcp/manager.js";

export function createMcpRoutes(mcpManager: McpManager): Router {
  const router = Router();

  /** GET /api/mcp/servers — List all configured MCP servers */
  router.get("/servers", (_req: Request, res: Response) => {
    try {
      const rows = db
        .prepare(`SELECT * FROM mcp_servers ORDER BY created_at DESC`)
        .all() as any[];

      const servers = rows.map((r) => ({
        ...r,
        args: JSON.parse(r.args),
        enabled: Boolean(r.enabled),
        connected: mcpManager.getConnectedServers().includes(r.name),
      }));

      res.json({ servers });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** POST /api/mcp/servers — Add a new MCP server */
  router.post("/servers", async (req: Request, res: Response) => {
    try {
      const { name, type, command, args, url } = req.body;

      if (!name || !type) {
        res.status(400).json({ error: "name and type are required" });
        return;
      }

      const id = uuid();
      db.prepare(
        `INSERT INTO mcp_servers (id, name, type, command, args, url) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, name, type, command || null, JSON.stringify(args || []), url || null);

      // Try to connect
      try {
        const tools = await mcpManager.addServer({
          id,
          name,
          type,
          command,
          args: args || [],
          url,
          enabled: true,
        });

        res.status(201).json({
          id,
          name,
          type,
          command,
          args: args || [],
          url,
          enabled: true,
          connected: true,
          tools,
        });
      } catch (connErr: any) {
        res.status(201).json({
          id,
          name,
          type,
          command,
          args: args || [],
          url,
          enabled: true,
          connected: false,
          error: connErr.message,
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** DELETE /api/mcp/servers/:id — Remove an MCP server */
  router.delete("/servers/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const server = db
        .prepare(`SELECT * FROM mcp_servers WHERE id = ?`)
        .get(id) as any;

      if (!server) {
        res.status(404).json({ error: "Server not found" });
        return;
      }

      await mcpManager.removeServer(server.name);
      db.prepare(`DELETE FROM mcp_servers WHERE id = ?`).run(id);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** GET /api/mcp/tools — List all discovered tools across all servers */
  router.get("/tools", (_req: Request, res: Response) => {
    try {
      const tools = mcpManager.getAllTools();
      res.json({ tools });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /** POST /api/mcp/refresh — Re-discover tools from all servers */
  router.post("/refresh", async (_req: Request, res: Response) => {
    try {
      const tools = await mcpManager.refreshAllTools();
      res.json({ tools });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
