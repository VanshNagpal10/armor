/**
 * MCP Client wrapper — manages a single connection to an MCP server.
 * Handles tool discovery, tool execution, and reconnection.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  type: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
}

export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: McpToolInfo[] = [];
  private connected = false;

  constructor(private config: McpServerConfig) {}

  /** Connect to the MCP server and discover tools. */
  async connect(): Promise<void> {
    if (this.connected) return;

    if (this.config.type === "stdio") {
      if (!this.config.command) {
        throw new Error(`MCP server "${this.config.name}": no command specified`);
      }

      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args ?? [],
      });

      this.client = new Client({
        name: "armor-agent",
        version: "1.0.0",
      });

      await this.client.connect(this.transport);
      this.connected = true;

      // Discover tools
      await this.discoverTools();

      console.log(
        `[mcp-client] Connected to "${this.config.name}" — ${this.tools.length} tools discovered`
      );
    } else {
      throw new Error(`SSE transport not yet implemented`);
    }
  }

  /** Re-discover tools from the connected server. */
  async discoverTools(): Promise<McpToolInfo[]> {
    if (!this.client || !this.connected) {
      throw new Error(`Not connected to "${this.config.name}"`);
    }

    const result = await this.client.listTools();
    this.tools = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
      serverName: this.config.name,
    }));

    return this.tools;
  }

  /** Execute a tool on this MCP server. */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }> {
    if (!this.client || !this.connected) {
      throw new Error(`Not connected to "${this.config.name}"`);
    }

    const result = await this.client.callTool({ name: toolName, arguments: args });
    return result as any;
  }

  /** Get the currently discovered tools. */
  getTools(): McpToolInfo[] {
    return this.tools;
  }

  /** Check if this client owns a given tool. */
  hasTool(toolName: string): boolean {
    return this.tools.some((t) => t.name === toolName);
  }

  /** Disconnect from the server. */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }
    this.client = null;
    this.transport = null;
    this.connected = false;
    this.tools = [];
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return this.config.name;
  }
}
