/**
 * Database module — SQLite setup and migrations.
 * Stores policy rules, conversation logs, and MCP server configs.
 */

import Database, { type Database as DatabaseType } from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "..", "..", "armor.db");

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL for better concurrency
db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

db.exec(`
  -- Policy rules table
  CREATE TABLE IF NOT EXISTS policy_rules (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('block', 'require_approval', 'input_validation')),
    tool_name   TEXT,
    server_name TEXT,
    condition   TEXT NOT NULL DEFAULT '{}',
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- MCP server configurations
  CREATE TABLE IF NOT EXISTS mcp_servers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    type        TEXT NOT NULL CHECK (type IN ('stdio', 'sse')),
    command     TEXT,
    args        TEXT NOT NULL DEFAULT '[]',
    url         TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Conversations
  CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT 'New Conversation',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Conversation messages (user, assistant, tool_call, tool_result, policy_block)
  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    tool_name       TEXT,
    tool_args       TEXT,
    tool_result     TEXT,
    server_name     TEXT,
    policy_action   TEXT,
    policy_rule_id  TEXT,
    token_count     INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

  -- Pending approvals
  CREATE TABLE IF NOT EXISTS pending_approvals (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id      TEXT NOT NULL,
    tool_name       TEXT NOT NULL,
    tool_args       TEXT NOT NULL DEFAULT '{}',
    server_name     TEXT NOT NULL,
    rule_id         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at     TEXT
  );
`);

export default db;
