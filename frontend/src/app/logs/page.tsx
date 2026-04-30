"use client";

import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Conversation { id: string; title: string; created_at: string; updated_at: string; message_count: number; total_tokens: number; }
interface Message { id: string; role: string; content: string; tool_name?: string; tool_args?: string; server_name?: string; policy_action?: string; created_at: string; }

export default function LogsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    const res = await fetch(`${API}/api/logs/conversations`);
    const data = await res.json();
    setConversations(data.conversations || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const selectConv = async (id: string) => {
    setSelected(id);
    const res = await fetch(`${API}/api/logs/conversations/${id}`);
    const data = await res.json();
    setMessages(data.messages || []);
  };

  const deleteConv = async (id: string) => {
    if (!confirm("Delete conversation?")) return;
    await fetch(`${API}/api/logs/conversations/${id}`, { method: "DELETE" });
    if (selected === id) { setSelected(null); setMessages([]); }
    fetchConversations();
  };

  const roleLabel: Record<string, { label: string; color: string }> = {
    user: { label: "USER", color: "var(--primary)" },
    assistant: { label: "ASSISTANT", color: "var(--success)" },
    tool_call: { label: "TOOL CALL", color: "var(--info)" },
    tool_result: { label: "RESULT", color: "var(--success)" },
    tool_error: { label: "ERROR", color: "var(--danger)" },
    policy_block: { label: "BLOCKED", color: "var(--danger)" },
    pending_approval: { label: "PENDING", color: "var(--warning)" },
  };

  if (loading) return <div className="flex items-center justify-center h-full"><p style={{ color: "var(--text-light)" }}>Loading...</p></div>;

  return (
    <div className="h-full flex" style={{ background: "var(--bg-secondary)" }}>
      {/* Conversation list */}
      <div className="w-72 flex-shrink-0 border-r flex flex-col" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>Conversation Logs</h2>
          <p className="text-xs" style={{ color: "var(--text-light)" }}>{conversations.length} conversations</p>
        </div>
        <div className="flex-1 overflow-auto">
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => selectConv(c.id)}
              className="w-full text-left px-5 py-3 border-b transition-colors"
              style={{ borderColor: "var(--border-light)", background: selected === c.id ? "var(--bg-hover)" : "transparent" }}
            >
              <p className="text-sm font-medium truncate" style={{ color: "var(--text-dark)" }}>{c.title}</p>
              <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: "var(--text-light)" }}>
                <span>{c.message_count} msgs</span>
                <span>·</span>
                <span>{c.total_tokens} tokens</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs" style={{ color: "var(--text-light)" }}>{new Date(c.updated_at).toLocaleDateString()}</p>
                <button onClick={e => { e.stopPropagation(); deleteConv(c.id); }} className="text-xs font-medium" style={{ color: "var(--danger)" }}>Delete</button>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Messages detail */}
      <div className="flex-1 overflow-auto p-5">
        {!selected ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: "var(--text-light)" }}>Select a conversation to view its log</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {messages.map(msg => {
              const rl = roleLabel[msg.role] || { label: msg.role.toUpperCase(), color: "var(--text-light)" };
              return (
                <div key={msg.id} className="flex gap-3 px-4 py-3 rounded-lg text-sm" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold font-mono" style={{ color: rl.color }}>{rl.label}</span>
                      {msg.tool_name && <span className="text-xs font-mono" style={{ color: "var(--text-medium)" }}>{msg.tool_name}</span>}
                      {msg.server_name && <span className="text-xs" style={{ color: "var(--text-light)" }}>on {msg.server_name}</span>}
                      {msg.policy_action && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "rgba(217, 68, 68, 0.08)", color: "var(--danger)" }}>{msg.policy_action}</span>
                      )}
                      <span className="text-xs ml-auto" style={{ color: "var(--text-light)" }}>{new Date(msg.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs whitespace-pre-wrap break-words" style={{ color: "var(--text-medium)" }}>
                      {msg.content.length > 500 ? msg.content.slice(0, 500) + "..." : msg.content}
                    </p>
                    {msg.tool_args && (
                      <pre className="text-xs mt-1 overflow-auto max-h-24 font-mono" style={{ color: "var(--text-light)" }}>
                        {(() => { try { return JSON.stringify(JSON.parse(msg.tool_args), null, 2); } catch { return msg.tool_args; } })()}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
