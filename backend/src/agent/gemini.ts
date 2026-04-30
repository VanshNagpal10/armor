/**
 * Gemini API wrapper — handles interactions with Google's Gemini model.
 * Converts MCP tool schemas into Gemini function declarations and manages the
 * multi-turn conversation context.
 *
 * Uses the Gemini API key from Google AI Studio (https://aistudio.google.com/apikey).
 */

import { GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import type { McpToolInfo } from "../mcp/client.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Initialize the Gemini client using an AI Studio API key.
 */
let genAI: GoogleGenAI;

if (GEMINI_API_KEY) {
  genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  console.log("[gemini] Using AI Studio API key");
} else {
  console.error("WARNING: GEMINI_API_KEY is not set. The agent will not work.");
  console.error("Get a free API key from https://aistudio.google.com/apikey");
  genAI = new GoogleGenAI({ apiKey: "" });
}

const MODEL = "gemini-2.5-flash";

const SYSTEM_INSTRUCTION = `You are ArmorIQ, a helpful AI assistant with access to external tools via MCP (Model Context Protocol) servers. 

When a user asks you something that could benefit from using a tool, use the available tools. Always explain what you're doing and share the results clearly.

Important guidelines:
- Only call tools that are available in your tool list
- If a tool call fails or is blocked by policy, explain this to the user
- Be concise but thorough in your responses
- If you're unsure which tool to use, ask the user for clarification`;

/**
 * Fields that Gemini does NOT support in function declaration schemas.
 * These come from Zod / JSON Schema but must be stripped before sending.
 */
const UNSUPPORTED_FIELDS = new Set([
  "$schema",
  "additionalProperties",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "default",
  "uniqueItems",
  "multipleOf",
]);

/**
 * Recursively clean a schema object: strip unsupported fields and
 * uppercase type values for Gemini compatibility.
 */
function sanitizeSchema(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeSchema);
  if (typeof obj !== "object") return obj;

  const cleaned: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (UNSUPPORTED_FIELDS.has(key)) continue;

    if (key === "type" && typeof val === "string") {
      cleaned[key] = val.toUpperCase();
    } else {
      cleaned[key] = sanitizeSchema(val);
    }
  }
  return cleaned;
}

/**
 * Convert MCP tool schemas into Gemini FunctionDeclarations.
 */
export function mcpToolsToGeminiFunctions(
  tools: McpToolInfo[]
): FunctionDeclaration[] {
  return tools.map((tool) => {
    const schema = tool.inputSchema as any;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    if (schema?.properties) {
      for (const [key, val] of Object.entries(schema.properties as Record<string, any>)) {
        properties[key] = sanitizeSchema(val);
      }
    }

    if (schema?.required) {
      required.push(...schema.required);
    }

    return {
      name: tool.name,
      description: tool.description || `Tool: ${tool.name}`,
      parameters: {
        type: "OBJECT" as const,
        properties,
        required: required.length > 0 ? required : undefined,
      },
    } as FunctionDeclaration;
  });
}

export interface GeminiResponse {
  text?: string;
  functionCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  tokenCount?: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * Send a message to Gemini with tool definitions and conversation history.
 */
export async function chat(
  history: Content[],
  tools: McpToolInfo[]
): Promise<GeminiResponse> {
  const functionDeclarations = mcpToolsToGeminiFunctions(tools);

  const toolConfig =
    functionDeclarations.length > 0
      ? { tools: [{ functionDeclarations }] }
      : {};

  const MAX_RETRIES = 3;
  let lastError: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model: MODEL,
        contents: history,
        config: {
          ...toolConfig,
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });

      return parseGeminiResponse(response);
    } catch (err: any) {
      lastError = err;
      if (err.status === 429 && attempt < MAX_RETRIES) {
        const waitSec = Math.min(15 * Math.pow(2, attempt), 60);
        console.log(`[gemini] Rate limited. Retrying in ${waitSec}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

function parseGeminiResponse(response: any): GeminiResponse {
  // Extract function calls if any
  const functionCalls = response.candidates?.[0]?.content?.parts
    ?.filter((p: Part) => p.functionCall)
    .map((p: Part) => ({
      name: p.functionCall!.name!,
      args: (p.functionCall!.args as Record<string, unknown>) ?? {},
    }));

  // Extract text response
  const text = response.candidates?.[0]?.content?.parts
    ?.filter((p: Part) => p.text)
    .map((p: Part) => p.text)
    .join("");

  // Token counts
  const tokenCount = response.usageMetadata
    ? {
      input: response.usageMetadata.promptTokenCount ?? 0,
      output: response.usageMetadata.candidatesTokenCount ?? 0,
      total: response.usageMetadata.totalTokenCount ?? 0,
    }
    : undefined;

  return {
    text: text || undefined,
    functionCalls:
      functionCalls && functionCalls.length > 0 ? functionCalls : undefined,
    tokenCount,
  };
}