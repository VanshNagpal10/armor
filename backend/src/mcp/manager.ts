/**
 * MCP Manager — manages connections to multiple MCP servers.
 * Handles adding/removing servers, aggregating tools across servers,
 * and routing tool calls to the correct server.
 */

import db from "../db/database.js";
import { McpClient, type McpServerConfig, type McpToolInfo } from "./client.js";

export class McpManager {
  private clients: Map<string, McpClient> = new Map();

  /** Initialize: load server configs from DB and connect. */
  async initialize(): Promise<void> {
    const rows = db
      .prepare(`SELECT * FROM mcp_servers WHERE enabled = 1`)
      .all() as any[];

    for (const row of rows) {
      const config: McpServerConfig = {
        id: row.id,
        name: row.name,
        type: row.type,
        command: row.command,
        args: JSON.parse(row.args),
        url: row.url,
        enabled: Boolean(row.enabled),
      };

      try {
        await this.addServer(config);
      } catch (err: any) {
        console.error(
          `[mcp-manager] Failed to connect to "${config.name}":`,
          err.message
        );
      }
    }
  }

  /** Add and connect to an MCP server. */
  async addServer(config: McpServerConfig): Promise<McpToolInfo[]> {
    // Disconnect existing client with same name if any
    if (this.clients.has(config.name)) {
      await this.removeServer(config.name);
    }

    const client = new McpClient(config);
    await client.connect();
    this.clients.set(config.name, client);
    return client.getTools();
  }

  /** Disconnect and remove an MCP server. */
  async removeServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }
  }

  /** Get all discovered tools across all connected servers. */
  getAllTools(): McpToolInfo[] {
    const tools: McpToolInfo[] = [];
    for (const client of this.clients.values()) {
      tools.push(...client.getTools());
    }
    return tools;
  }

  /** Re-discover tools from all connected servers. */
  async refreshAllTools(): Promise<McpToolInfo[]> {
    const tools: McpToolInfo[] = [];
    for (const client of this.clients.values()) {
      if (client.isConnected()) {
        const discovered = await client.discoverTools();
        tools.push(...discovered);
      }
    }
    return tools;
  }

  /** Find which server owns a given tool and call it. */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{
    serverName: string;
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }> {
    for (const client of this.clients.values()) {
      if (client.hasTool(toolName)) {
        const result = await client.callTool(toolName, args);
        return {
          serverName: client.getName(),
          ...result,
        };
      }
    }

    throw new Error(
      `Tool "${toolName}" not found on any connected MCP server`
    );
  }

  /** Get list of connected server names. */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /** Disconnect all servers. */
  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }
}
