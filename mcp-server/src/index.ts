/**
 * Custom MCP Server — Notes Manager
 *
 * Exposes 5 tools for managing notes via the MCP protocol:
 *   1. create_note   — Create a new note
 *   2. get_note      — Retrieve a note by ID
 *   3. list_notes    — List all notes (with optional search)
 *   4. update_note   — Update a note's title or content
 *   5. delete_note   — Delete a note by ID
 *
 * Uses better-sqlite3 for storage and stdio transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.NOTES_DB_PATH
  ? path.resolve(process.env.NOTES_DB_PATH)
  : path.resolve(__dirname, "..", "notes.db");

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL DEFAULT '',
    tags       TEXT    NOT NULL DEFAULT '[]',
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "notes-manager",
  version: "1.0.0",
});

// ---- Tool 1: create_note --------------------------------------------------

server.tool(
  "create_note",
  "Create a new note with a title, content, and optional tags",
  {
    title: z.string().min(1).describe("Title of the note"),
    content: z.string().describe("Body / content of the note"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional list of tags for categorization"),
  },
  async ({ title, content, tags }) => {
    try {
      const stmt = db.prepare(
        `INSERT INTO notes (title, content, tags) VALUES (?, ?, ?)`
      );
      const result = stmt.run(title, content, JSON.stringify(tags ?? []));
      const note = db
        .prepare(`SELECT * FROM notes WHERE id = ?`)
        .get(result.lastInsertRowid);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(note, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text" as const, text: `Error creating note: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ---- Tool 2: get_note -----------------------------------------------------

server.tool(
  "get_note",
  "Retrieve a single note by its ID",
  {
    id: z.number().int().positive().describe("The ID of the note to retrieve"),
  },
  async ({ id }) => {
    try {
      const note = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;

      if (!note) {
        return {
          content: [
            { type: "text" as const, text: `Note with ID ${id} not found` },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { ...note, tags: JSON.parse(note.tags as string) },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text" as const, text: `Error retrieving note: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ---- Tool 3: list_notes ---------------------------------------------------

server.tool(
  "list_notes",
  "List all notes. Optionally filter by a search query (matches title or content) or by tag.",
  {
    search: z
      .string()
      .optional()
      .describe("Optional search string to filter notes by title or content"),
    tag: z.string().optional().describe("Optional tag to filter notes by"),
  },
  async ({ search, tag }) => {
    try {
      let query = `SELECT * FROM notes`;
      const params: string[] = [];

      if (search) {
        query += ` WHERE (title LIKE ? OR content LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
      }

      if (tag) {
        query += search ? ` AND` : ` WHERE`;
        query += ` tags LIKE ?`;
        params.push(`%"${tag}"%`);
      }

      query += ` ORDER BY updated_at DESC`;

      const notes = db.prepare(query).all(...params) as Record<
        string,
        unknown
      >[];
      const parsed = notes.map((n) => ({
        ...n,
        tags: JSON.parse(n.tags as string),
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: parsed.length, notes: parsed },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text" as const, text: `Error listing notes: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ---- Tool 4: update_note --------------------------------------------------

server.tool(
  "update_note",
  "Update an existing note's title, content, or tags",
  {
    id: z.number().int().positive().describe("The ID of the note to update"),
    title: z.string().optional().describe("New title (leave blank to keep current)"),
    content: z
      .string()
      .optional()
      .describe("New content (leave blank to keep current)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("New tags (leave blank to keep current)"),
  },
  async ({ id, title, content, tags }) => {
    try {
      const existing = db
        .prepare(`SELECT * FROM notes WHERE id = ?`)
        .get(id) as Record<string, unknown> | undefined;

      if (!existing) {
        return {
          content: [
            { type: "text" as const, text: `Note with ID ${id} not found` },
          ],
          isError: true,
        };
      }

      const newTitle = title ?? (existing.title as string);
      const newContent = content ?? (existing.content as string);
      const newTags =
        tags !== undefined ? JSON.stringify(tags) : (existing.tags as string);

      db.prepare(
        `UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(newTitle, newContent, newTags, id);

      const updated = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as Record<string, unknown>;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { ...updated, tags: JSON.parse(updated.tags as string) },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text" as const, text: `Error updating note: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ---- Tool 5: delete_note --------------------------------------------------

server.tool(
  "delete_note",
  "Delete a note by its ID",
  {
    id: z.number().int().positive().describe("The ID of the note to delete"),
  },
  async ({ id }) => {
    try {
      const existing = db
        .prepare(`SELECT * FROM notes WHERE id = ?`)
        .get(id) as Record<string, unknown> | undefined;

      if (!existing) {
        return {
          content: [
            { type: "text" as const, text: `Note with ID ${id} not found` },
          ],
          isError: true,
        };
      }

      db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);

      return {
        content: [
          {
            type: "text" as const,
            text: `Note with ID ${id} ("${existing.title}") deleted successfully`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text" as const, text: `Error deleting note: ${error.message}` },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[notes-manager] MCP server started on stdio");
}

main().catch((err) => {
  console.error("[notes-manager] Fatal error:", err);
  process.exit(1);
});
