"use client";

import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface McpServer { id: string; name: string; type: string; command?: string; args?: string[]; connected: boolean; }
interface ToolInfo { name: string; description?: string; serverName: string; }

export default function ServersPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");

  const fetchData = useCallback(async () => {
    const [sRes, tRes] = await Promise.all([fetch(`${API}/api/mcp/servers`), fetch(`${API}/api/mcp/tools`)]);
    const sData = await sRes.json();
    const tData = await tRes.json();
    setServers(sData.servers || []);
    setTools(tData.tools || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addServer = async () => {
    const args = formArgs.split("\n").map(a => a.trim()).filter(Boolean);
    await fetch(`${API}/api/mcp/servers`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName, type: "stdio", command: formCommand, args }),
    });
    setShowForm(false); setFormName(""); setFormCommand(""); setFormArgs("");
    fetchData();
  };

  const removeServer = async (id: string) => {
    if (!confirm("Remove this server?")) return;
    await fetch(`${API}/api/mcp/servers/${id}`, { method: "DELETE" });
    fetchData();
  };

  if (loading) return <div className="flex items-center justify-center h-full"><p style={{ color: "var(--text-light)" }}>Loading...</p></div>;

  const grouped: Record<string, ToolInfo[]> = {};
  tools.forEach(t => { if (!grouped[t.serverName]) grouped[t.serverName] = []; grouped[t.serverName].push(t); });

  const inputStyle = { background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-dark)" };

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-secondary)" }}>
      <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>MCP Servers</h2>
          <p className="text-xs" style={{ color: "var(--text-light)" }}>{servers.length} servers · {tools.length} tools discovered</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 text-xs font-medium rounded-md text-white" style={{ background: "var(--primary)" }}>+ Add Server</button>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-4">
        {showForm && (
          <div className="p-5 rounded-lg border space-y-3" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>Add MCP Server</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-light)" }}>Name</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. notes-manager" className="w-full px-3 py-2 rounded-md border text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-light)" }}>Command</label>
                <input value={formCommand} onChange={e => setFormCommand(e.target.value)} placeholder="e.g. npx or node" className="w-full px-3 py-2 rounded-md border text-sm outline-none" style={inputStyle} />
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-light)" }}>Arguments (one per line)</label>
              <textarea value={formArgs} onChange={e => setFormArgs(e.target.value)} placeholder={"e.g.\ntsx\n./mcp-server/src/index.ts"} rows={3} className="w-full px-3 py-2 rounded-md border text-sm outline-none font-mono" style={inputStyle} />
            </div>
            <div className="flex gap-2">
              <button onClick={addServer} disabled={!formName || !formCommand} className="px-4 py-2 text-xs font-medium rounded-md text-white disabled:opacity-40" style={{ background: "var(--primary)" }}>Add Server</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-medium rounded-md border" style={{ borderColor: "var(--border)", color: "var(--text-medium)" }}>Cancel</button>
            </div>
          </div>
        )}

        {servers.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center" style={{ color: "var(--text-light)" }}>
              <p className="text-sm">No MCP servers configured</p>
              <p className="text-xs mt-1">Add a server to discover its tools</p>
            </div>
          </div>
        ) : (
          servers.map(s => (
            <div key={s.id} className="p-4 rounded-lg border" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full`} style={{ background: s.connected ? "var(--success)" : "var(--danger)" }} />
                  <h3 className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>{s.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-secondary)", color: "var(--text-light)" }}>{s.type}</span>
                </div>
                <button onClick={() => removeServer(s.id)} className="px-3 py-1 text-xs rounded-md border" style={{ borderColor: "var(--border)", color: "var(--danger)" }}>Remove</button>
              </div>
              <p className="text-xs font-mono mb-3" style={{ color: "var(--text-light)" }}>{s.command} {s.args?.join(" ")}</p>
              {grouped[s.name]?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--text-light)" }}>Tools ({grouped[s.name].length}):</p>
                  {grouped[s.name].map(t => (
                    <div key={t.name} className="flex gap-2 px-3 py-1.5 rounded text-xs" style={{ background: "var(--bg-secondary)" }}>
                      <span className="font-mono" style={{ color: "var(--primary)" }}>fn</span>
                      <div>
                        <span className="font-mono font-bold" style={{ color: "var(--text-dark)" }}>{t.name}</span>
                        {t.description && <p style={{ color: "var(--text-light)" }}>{t.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
