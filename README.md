# ArmorIQ - Guarded AI Agent with MCP Support

A full-stack application featuring an AI agent with Model Context Protocol (MCP) support, a real-time policy engine for guardrails, and an admin dashboard.

## Architecture

```
Frontend (Next.js :3000)  ──REST + WS──►  Backend (Express :4000)
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                              Policy Engine  MCP Manager  Gemini API
                                              │
                                    ┌─────────┼─────────┐
                                    ▼                   ▼
                              Notes MCP Server    Context7 MCP Server
```

## 3 Components

### 1. Custom MCP Server (`mcp-server/`)
A Notes Manager exposing 5 tools: `create_note`, `get_note`, `list_notes`, `update_note`, `delete_note`

### 2. Express Backend (`backend/`)
- **Agent Core**: Gemini 2.0 Flash tool-use loop
- **Policy Engine**: Self-contained module evaluating rules (block, require_approval, input_validation)
- **MCP Manager**: Dynamic tool discovery across multiple MCP servers
- **WebSocket**: Real-time policy propagation

### 3. Next.js Frontend (`frontend/`)
- Chat interface with tool call visualization
- Policy dashboard with CRUD + real-time sync
- MCP server management
- Conversation logs with token usage

## Quick Start

### Prerequisites
- Node.js 18+
- A Gemini API key (free from https://aistudio.google.com/apikey)

### 1. Install Dependencies

```bash
# MCP Server
cd mcp-server && npm install

# Backend
cd ../backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env and add your GEMINI_API_KEY
```

### 3. Start Everything

```bash
# Terminal 1: Backend (starts agent + auto-connects MCP servers)
cd backend && GEMINI_API_KEY=your_key npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

### 4. Add MCP Servers via Dashboard
1. Open http://localhost:3000/servers
2. Add the custom Notes server:
   - Name: `notes-manager`
   - Command: `npx`
   - Args: `tsx` and `/path/to/armor/mcp-server/src/index.ts`
3. Add Context7 (remote):
   - Name: `context7`
   - Command: `npx`
   - Args: `-y` and `@upstash/context7-mcp`

Or via API:
```bash
# Add Notes MCP server
curl -X POST http://localhost:4000/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{"name":"notes-manager","type":"stdio","command":"npx","args":["tsx","'$(pwd)'/mcp-server/src/index.ts"]}'

# Add Context7 MCP server
curl -X POST http://localhost:4000/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{"name":"context7","type":"stdio","command":"npx","args":["-y","@upstash/context7-mcp"]}'
```

### 5. Create Policy Rules

```bash
# Block delete_note tool
curl -X POST http://localhost:4000/api/policy/rules \
  -H "Content-Type: application/json" \
  -d '{"name":"Block delete","type":"block","tool_name":"delete_note","condition":{"type":"block"}}'

# Require approval for update_note
curl -X POST http://localhost:4000/api/policy/rules \
  -H "Content-Type: application/json" \
  -d '{"name":"Approve updates","type":"require_approval","tool_name":"update_note","condition":{"type":"require_approval"}}'
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/agent/chat` | POST | Send message to agent |
| `/api/agent/approve` | POST | Resolve pending approval |
| `/api/policy/rules` | GET/POST | List/create rules |
| `/api/policy/rules/:id` | PATCH/DELETE | Update/delete rule |
| `/api/mcp/servers` | GET/POST | List/add MCP servers |
| `/api/mcp/servers/:id` | DELETE | Remove MCP server |
| `/api/mcp/tools` | GET | List all discovered tools |
| `/api/mcp/refresh` | POST | Re-discover tools |
| `/api/logs/conversations` | GET | List conversations |
| `/api/logs/conversations/:id` | GET/DELETE | Get/delete conversation |
| `/api/logs/approvals` | GET | List pending approvals |

## Edge Cases (Design Decisions)

1. **MCP server crash mid-tool-call**: The `McpClient.callTool()` wraps in try/catch. Errors are logged as `tool_error` messages and fed back to the LLM to inform the user. The client can be reconnected.

2. **Prompt injection bypass**: The policy engine runs *before* MCP execution — it's a hard gate, not an LLM-level check. The model cannot bypass it because policy evaluation happens in application code, not in the prompt.

3. **Conflicting rules**: Rules are evaluated in creation order (FIFO). The first matching rule wins. Block rules take precedence if encountered first.

4. **Approver offline**: Pending approvals are persisted in SQLite with `status='pending'`. The conversation is paused until resolved. The frontend shows all pending approvals in the logs page.

## Tech Stack
- **LLM**: Google Gemini 2.0 Flash (`@google/genai`)
- **MCP**: `@modelcontextprotocol/sdk` (stdio transport)
- **Backend**: Express 5, WebSocket (`ws`), SQLite (`better-sqlite3`)
- **Frontend**: Next.js 15, Tailwind CSS 4
- **Validation**: Zod
