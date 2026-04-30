import "dotenv/config";

/**
 * ARMOR Backend — Entry Point
 *
 * Express server that hosts the AI agent, policy engine, MCP manager,
 * and WebSocket for real-time updates.
 */

import express from "express";
import cors from "cors";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

// Import modules
import db from "./db/database.js";
import { PolicyEngine } from "./policy/engine.js";
import { McpManager } from "./mcp/manager.js";
import { Agent } from "./agent/agent.js";
import { setupWebSocket } from "./websocket.js";
import { createAgentRoutes } from "./routes/agent.js";
import { createPolicyRoutes } from "./routes/policy.js";
import { createMcpRoutes } from "./routes/mcp.js";
import { createLogsRoutes } from "./routes/logs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "4000", 10);

async function main() {
  console.log("ArmorIQ — Guarded AI Agent with MCP Support");
  console.log("=".repeat(50));

  // ---- Initialize core modules ----
  const policyEngine = new PolicyEngine();
  console.log(`[policy] Engine loaded (${policyEngine.getRules().length} active rules)`);

  const mcpManager = new McpManager();
  await mcpManager.initialize();
  console.log(
    `[mcp] Manager initialized (${mcpManager.getConnectedServers().length} servers, ${mcpManager.getAllTools().length} tools)`
  );

  const agent = new Agent(policyEngine, mcpManager);
  console.log("[agent] Ready");

  // ---- Express app ----
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "10mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      servers: mcpManager.getConnectedServers(),
      tools: mcpManager.getAllTools().length,
      rules: policyEngine.getRules().length,
    });
  });

  // ---- HTTP server + WebSocket ----
  const server = createServer(app);
  const broadcast = setupWebSocket(server);

  // ---- Mount routes ----
  app.use("/api/agent", createAgentRoutes(agent));
  app.use("/api/policy", createPolicyRoutes(policyEngine, broadcast));
  app.use("/api/mcp", createMcpRoutes(mcpManager));
  app.use("/api/logs", createLogsRoutes());

  // ---- Start ----
  server.listen(PORT, () => {
    console.log(`\n[server] ArmorIQ backend listening on http://localhost:${PORT}`);
    console.log(`   WebSocket available at ws://localhost:${PORT}/ws`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[server] Shutting down...");
    await mcpManager.disconnectAll();
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
