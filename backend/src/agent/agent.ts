/**
 * Agent Core — the main tool-use loop.
 *
 * Flow:
 *  1. User sends message
 *  2. Agent sends message + tool definitions to Gemini
 *  3. If Gemini returns function calls:
 *     a. Policy engine evaluates each call
 *     b. If allowed → execute via MCP → feed result back to Gemini
 *     c. If blocked → feed block message back to Gemini
 *     d. If require_approval → pause and wait for human approval
 *  4. Repeat until Gemini returns a text response
 */

import { v4 as uuid } from "uuid";
import type { Content } from "@google/genai";
import { chat } from "./gemini.js";
import { PolicyEngine } from "../policy/engine.js";
import { McpManager } from "../mcp/manager.js";
import db from "../db/database.js";
import type { PolicyVerdict } from "../policy/types.js";

const MAX_TOOL_LOOPS = 10; // Safety limit to prevent infinite loops

export interface AgentMessage {
  id: string;
  role: string;
  content: string;
  tool_name?: string;
  tool_args?: string;
  tool_result?: string;
  server_name?: string;
  policy_action?: string;
  policy_rule_id?: string;
  token_count?: number;
}

export interface AgentResponse {
  conversationId: string;
  messages: AgentMessage[];
  pendingApproval?: {
    id: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    serverName: string;
    ruleId: string;
  };
  totalTokens: number;
}

export class Agent {
  constructor(
    private policyEngine: PolicyEngine,
    private mcpManager: McpManager
  ) {}

  /**
   * Process a user message and run the tool-use loop.
   */
  async processMessage(
    conversationId: string | null,
    userMessage: string
  ): Promise<AgentResponse> {
    // Create or fetch conversation
    if (!conversationId) {
      conversationId = uuid();
      db.prepare(
        `INSERT INTO conversations (id, title) VALUES (?, ?)`
      ).run(conversationId, userMessage.slice(0, 100));
    }

    const messages: AgentMessage[] = [];
    let totalTokens = 0;

    // Save user message
    const userMsgId = uuid();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)`
    ).run(userMsgId, conversationId, userMessage);
    messages.push({ id: userMsgId, role: "user", content: userMessage });

    // Build conversation history from DB
    const history = this.buildHistory(conversationId);

    // Get all available tools
    const tools = this.mcpManager.getAllTools();

    // Tool-use loop
    let loopCount = 0;
    let currentHistory = [...history];

    while (loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      // Call Gemini
      const response = await chat(currentHistory, tools);

      if (response.tokenCount) {
        totalTokens += response.tokenCount.total;
      }

      // If no function calls, we have a final text response
      if (!response.functionCalls || response.functionCalls.length === 0) {
        const text = response.text || "I don't have a response for that.";
        const assistantMsgId = uuid();

        db.prepare(
          `INSERT INTO messages (id, conversation_id, role, content, token_count) VALUES (?, ?, 'assistant', ?, ?)`
        ).run(assistantMsgId, conversationId, text, totalTokens);

        // Update conversation title and timestamp
        db.prepare(
          `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`
        ).run(conversationId);

        messages.push({
          id: assistantMsgId,
          role: "assistant",
          content: text,
          token_count: totalTokens,
        });

        return { conversationId, messages, totalTokens };
      }

      // Process each function call
      for (const fc of response.functionCalls) {
        // Find which server owns this tool
        let serverName = "unknown";
        const allTools = this.mcpManager.getAllTools();
        const toolInfo = allTools.find((t) => t.name === fc.name);
        if (toolInfo) {
          serverName = toolInfo.serverName;
        }

        // --- Policy check ---
        const verdict: PolicyVerdict = this.policyEngine.evaluate(
          fc.name,
          fc.args,
          serverName
        );

        if (verdict.action === "block") {
          // Tool blocked — record and feed back to LLM
          const blockMsgId = uuid();
          db.prepare(
            `INSERT INTO messages (id, conversation_id, role, content, tool_name, tool_args, server_name, policy_action, policy_rule_id)
             VALUES (?, ?, 'policy_block', ?, ?, ?, ?, 'block', ?)`
          ).run(
            blockMsgId,
            conversationId,
            verdict.message || "Blocked",
            fc.name,
            JSON.stringify(fc.args),
            serverName,
            verdict.rule?.id || null
          );

          messages.push({
            id: blockMsgId,
            role: "policy_block",
            content: verdict.message || "Blocked",
            tool_name: fc.name,
            tool_args: JSON.stringify(fc.args),
            server_name: serverName,
            policy_action: "block",
            policy_rule_id: verdict.rule?.id,
          });

          // Feed block result back to Gemini
          currentHistory.push({
            role: "model",
            parts: [{ functionCall: { name: fc.name, args: fc.args } }],
          });
          currentHistory.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: fc.name,
                  response: {
                    error: `POLICY BLOCKED: ${verdict.message}. Do NOT try to call this tool again. Inform the user that this tool is blocked by policy.`,
                  },
                },
              },
            ],
          });
          continue;
        }

        if (verdict.action === "input_validation_failed") {
          const validMsgId = uuid();
          db.prepare(
            `INSERT INTO messages (id, conversation_id, role, content, tool_name, tool_args, server_name, policy_action, policy_rule_id)
             VALUES (?, ?, 'policy_block', ?, ?, ?, ?, 'input_validation_failed', ?)`
          ).run(
            validMsgId,
            conversationId,
            verdict.message || "Validation failed",
            fc.name,
            JSON.stringify(fc.args),
            serverName,
            verdict.rule?.id || null
          );

          messages.push({
            id: validMsgId,
            role: "policy_block",
            content: verdict.message || "Validation failed",
            tool_name: fc.name,
            tool_args: JSON.stringify(fc.args),
            server_name: serverName,
            policy_action: "input_validation_failed",
            policy_rule_id: verdict.rule?.id,
          });

          currentHistory.push({
            role: "model",
            parts: [{ functionCall: { name: fc.name, args: fc.args } }],
          });
          currentHistory.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: fc.name,
                  response: {
                    error: `INPUT VALIDATION FAILED: ${verdict.message}. Inform the user about the validation failure.`,
                  },
                },
              },
            ],
          });
          continue;
        }

        if (verdict.action === "require_approval") {
          // Create a pending approval
          const approvalId = uuid();
          const approvalMsgId = uuid();

          db.prepare(
            `INSERT INTO messages (id, conversation_id, role, content, tool_name, tool_args, server_name, policy_action, policy_rule_id)
             VALUES (?, ?, 'pending_approval', ?, ?, ?, ?, 'require_approval', ?)`
          ).run(
            approvalMsgId,
            conversationId,
            verdict.message || "Approval required",
            fc.name,
            JSON.stringify(fc.args),
            serverName,
            verdict.rule?.id || null
          );

          db.prepare(
            `INSERT INTO pending_approvals (id, conversation_id, message_id, tool_name, tool_args, server_name, rule_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            approvalId,
            conversationId,
            approvalMsgId,
            fc.name,
            JSON.stringify(fc.args),
            serverName,
            verdict.rule?.id || ""
          );

          messages.push({
            id: approvalMsgId,
            role: "pending_approval",
            content: verdict.message || "Approval required",
            tool_name: fc.name,
            tool_args: JSON.stringify(fc.args),
            server_name: serverName,
            policy_action: "require_approval",
            policy_rule_id: verdict.rule?.id,
          });

          return {
            conversationId,
            messages,
            pendingApproval: {
              id: approvalId,
              toolName: fc.name,
              toolArgs: fc.args,
              serverName,
              ruleId: verdict.rule?.id || "",
            },
            totalTokens,
          };
        }

        // --- Tool call allowed — execute via MCP ---
        try {
          const toolCallMsgId = uuid();
          db.prepare(
            `INSERT INTO messages (id, conversation_id, role, content, tool_name, tool_args, server_name, policy_action)
             VALUES (?, ?, 'tool_call', '', ?, ?, ?, 'allow')`
          ).run(
            toolCallMsgId,
            conversationId,
            fc.name,
            JSON.stringify(fc.args),
            serverName
          );

          messages.push({
            id: toolCallMsgId,
            role: "tool_call",
            content: "",
            tool_name: fc.name,
            tool_args: JSON.stringify(fc.args),
            server_name: serverName,
            policy_action: "allow",
          });

          const result = await this.mcpManager.callTool(fc.name, fc.args);

          const resultText =
            result.content
              ?.map((c) => c.text ?? "")
              .join("\n")
              .trim() || "No output";

          const resultMsgId = uuid();
          db.prepare(
            `INSERT INTO messages (id, conversation_id, role, content, tool_name, tool_result, server_name)
             VALUES (?, ?, 'tool_result', ?, ?, ?, ?)`
          ).run(
            resultMsgId,
            conversationId,
            resultText,
            fc.name,
            resultText,
            serverName
          );

          messages.push({
            id: resultMsgId,
            role: "tool_result",
            content: resultText,
            tool_name: fc.name,
            tool_result: resultText,
            server_name: serverName,
          });

          // Feed result back to Gemini
          currentHistory.push({
            role: "model",
            parts: [{ functionCall: { name: fc.name, args: fc.args } }],
          });
          currentHistory.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: fc.name,
                  response: { result: resultText },
                },
              },
            ],
          });
        } catch (error: any) {
          const errText = `Error executing tool "${fc.name}": ${error.message}`;
          const errMsgId = uuid();

          db.prepare(
            `INSERT INTO messages (id, conversation_id, role, content, tool_name, tool_result, server_name)
             VALUES (?, ?, 'tool_error', ?, ?, ?, ?)`
          ).run(errMsgId, conversationId, errText, fc.name, errText, serverName);

          messages.push({
            id: errMsgId,
            role: "tool_error",
            content: errText,
            tool_name: fc.name,
            tool_result: errText,
            server_name: serverName,
          });

          currentHistory.push({
            role: "model",
            parts: [{ functionCall: { name: fc.name, args: fc.args } }],
          });
          currentHistory.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: fc.name,
                  response: { error: errText },
                },
              },
            ],
          });
        }
      }
    }

    // If we hit the loop limit, return what we have
    const limitMsgId = uuid();
    const limitMsg =
      "I've reached the maximum number of tool calls for this turn. Here's what I've done so far.";

    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, token_count) VALUES (?, ?, 'assistant', ?, ?)`
    ).run(limitMsgId, conversationId, limitMsg, totalTokens);

    messages.push({
      id: limitMsgId,
      role: "assistant",
      content: limitMsg,
      token_count: totalTokens,
    });

    return { conversationId, messages, totalTokens };
  }

  /**
   * Resume a conversation after a pending approval is resolved.
   */
  async resolveApproval(
    approvalId: string,
    approved: boolean
  ): Promise<AgentResponse> {
    const approval = db
      .prepare(`SELECT * FROM pending_approvals WHERE id = ?`)
      .get(approvalId) as any;

    if (!approval) {
      throw new Error(`Approval "${approvalId}" not found`);
    }

    if (approval.status !== "pending") {
      throw new Error(`Approval "${approvalId}" already ${approval.status}`);
    }

    // Update approval status
    db.prepare(
      `UPDATE pending_approvals SET status = ?, resolved_at = datetime('now') WHERE id = ?`
    ).run(approved ? "approved" : "rejected", approvalId);

    if (!approved) {
      // Rejected — continue conversation with rejection message
      return this.processMessage(
        approval.conversation_id,
        `[SYSTEM] The human admin rejected the tool call to "${approval.tool_name}" with args ${approval.tool_args}. Please inform the user.`
      );
    }

    // Approved — execute the tool and continue
    const messages: AgentMessage[] = [];
    let totalTokens = 0;

    try {
      const args = JSON.parse(approval.tool_args);
      const result = await this.mcpManager.callTool(approval.tool_name, args);

      const resultText =
        result.content
          ?.map((c) => c.text ?? "")
          .join("\n")
          .trim() || "No output";

      const resultMsgId = uuid();
      db.prepare(
        `INSERT INTO messages (id, conversation_id, role, content, tool_name, tool_result, server_name)
         VALUES (?, ?, 'tool_result', ?, ?, ?, ?)`
      ).run(
        resultMsgId,
        approval.conversation_id,
        resultText,
        approval.tool_name,
        resultText,
        approval.server_name
      );

      messages.push({
        id: resultMsgId,
        role: "tool_result",
        content: resultText,
        tool_name: approval.tool_name,
        tool_result: resultText,
        server_name: approval.server_name,
      });

      // Now let the LLM continue with this result
      const history = this.buildHistory(approval.conversation_id);
      const tools = this.mcpManager.getAllTools();
      const response = await chat(history, tools);

      if (response.tokenCount) {
        totalTokens += response.tokenCount.total;
      }

      const text = response.text || "Tool executed successfully.";
      const assistantMsgId = uuid();

      db.prepare(
        `INSERT INTO messages (id, conversation_id, role, content, token_count) VALUES (?, ?, 'assistant', ?, ?)`
      ).run(assistantMsgId, approval.conversation_id, text, totalTokens);

      messages.push({
        id: assistantMsgId,
        role: "assistant",
        content: text,
        token_count: totalTokens,
      });
    } catch (error: any) {
      const errMsgId = uuid();
      const errMsg = `Error executing approved tool: ${error.message}`;

      db.prepare(
        `INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'tool_error', ?)`
      ).run(errMsgId, approval.conversation_id, errMsg);

      messages.push({
        id: errMsgId,
        role: "tool_error",
        content: errMsg,
      });
    }

    return {
      conversationId: approval.conversation_id,
      messages,
      totalTokens,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a Gemini-compatible conversation history from the database.
   */
  private buildHistory(conversationId: string): Content[] {
    const rows = db
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
      )
      .all(conversationId) as any[];

    const history: Content[] = [];

    for (const row of rows) {
      switch (row.role) {
        case "user":
          history.push({
            role: "user",
            parts: [{ text: row.content }],
          });
          break;

        case "assistant":
          history.push({
            role: "model",
            parts: [{ text: row.content }],
          });
          break;

        case "tool_call":
          history.push({
            role: "model",
            parts: [
              {
                functionCall: {
                  name: row.tool_name,
                  args: JSON.parse(row.tool_args || "{}"),
                },
              },
            ],
          });
          break;

        case "tool_result":
          history.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: row.tool_name,
                  response: { result: row.tool_result || row.content },
                },
              },
            ],
          });
          break;

        case "tool_error":
          history.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: row.tool_name,
                  response: { error: row.content },
                },
              },
            ],
          });
          break;

        case "policy_block":
          // Feed as a function response with error
          if (row.tool_name) {
            history.push({
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: row.tool_name,
                    args: JSON.parse(row.tool_args || "{}"),
                  },
                },
              ],
            });
            history.push({
              role: "user",
              parts: [
                {
                  functionResponse: {
                    name: row.tool_name,
                    response: { error: `POLICY BLOCKED: ${row.content}` },
                  },
                },
              ],
            });
          }
          break;
      }
    }

    return history;
  }
}
