"use client";

import { useState, useRef, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Message {
  id: string;
  role: string;
  content: string;
  tool_name?: string;
  tool_args?: string;
  tool_result?: string;
  server_name?: string;
  policy_action?: string;
  token_count?: number;
}

interface PendingApproval {
  id: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  serverName: string;
  ruleId: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: userMsg }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "error", content: data.error }]);
        return;
      }
      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, ...data.messages]);
      setTotalTokens(data.totalTokens || 0);
      if (data.pendingApproval) setPendingApproval(data.pendingApproval);
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "error", content: `Network error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approved: boolean) => {
    if (!pendingApproval) return;
    setLoading(true);
    setPendingApproval(null);
    try {
      const res = await fetch(`${API}/api/agent/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: pendingApproval.id, approved }),
      });
      const data = await res.json();
      if (data.messages) setMessages((prev) => [...prev, ...data.messages]);
      setTotalTokens((prev) => prev + (data.totalTokens || 0));
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "error", content: `Approval error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const newChat = () => {
    setMessages([]);
    setConversationId(null);
    setPendingApproval(null);
    setTotalTokens(0);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-secondary)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
      >
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>Agent Chat</h2>
          <p className="text-xs" style={{ color: "var(--text-light)" }}>
            {conversationId ? `${conversationId.slice(0, 8)}...` : "New conversation"}
            {totalTokens > 0 && ` · ${totalTokens} tokens`}
          </p>
        </div>
        <button
          onClick={newChat}
          className="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--text-medium)" }}
        >
          + New Chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-5 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: "var(--text-dark)" }}>
                Armor<span style={{ color: "var(--primary)" }}>IQ</span> Agent
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--text-light)" }}>
                Send a message to start. The agent has access to MCP tools.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {pendingApproval && (
          <div
            className="p-4 rounded-lg border"
            style={{ background: "rgba(200, 138, 46, 0.06)", borderColor: "var(--warning)" }}
          >
            <p className="text-sm font-bold mb-2" style={{ color: "var(--warning)" }}>
              Approval Required
            </p>
            <p className="text-xs mb-1" style={{ color: "var(--text-light)" }}>
              Tool: <span className="font-mono" style={{ color: "var(--text-dark)" }}>{pendingApproval.toolName}</span>
              {" · "}
              Server: <span className="font-mono" style={{ color: "var(--text-dark)" }}>{pendingApproval.serverName}</span>
            </p>
            <pre
              className="text-xs p-2 rounded mt-2 mb-3 overflow-auto"
              style={{ background: "var(--bg-secondary)", color: "var(--text-medium)" }}
            >
              {JSON.stringify(pendingApproval.toolArgs, null, 2)}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={() => handleApproval(true)}
                className="px-4 py-1.5 text-xs font-medium rounded-md text-white"
                style={{ background: "var(--success)" }}
              >
                Approve
              </button>
              <button
                onClick={() => handleApproval(false)}
                className="px-4 py-1.5 text-xs font-medium rounded-md text-white"
                style={{ background: "var(--danger)" }}
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--primary)", animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--primary)", animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--primary)", animationDelay: "300ms" }} />
            </div>
            <span className="text-xs" style={{ color: "var(--text-light)" }}>Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-md border text-sm outline-none transition-colors"
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-dark)" }}
            id="chat-input"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 rounded-md text-sm font-medium text-white transition-opacity disabled:opacity-40"
            style={{ background: "var(--primary)" }}
            id="send-button"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const { role, content, tool_name, tool_args, server_name, policy_action } = message;

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] px-4 py-2.5 rounded-xl rounded-br-sm text-sm text-white" style={{ background: "var(--primary)" }}>
          {content}
        </div>
      </div>
    );
  }

  if (role === "assistant") {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[80%] px-4 py-2.5 rounded-xl rounded-bl-sm text-sm whitespace-pre-wrap"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-dark)" }}
        >
          {content}
        </div>
      </div>
    );
  }

  if (role === "tool_call") {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[80%] px-3 py-2 rounded-md text-xs font-mono"
          style={{ background: "rgba(224, 123, 76, 0.06)", border: "1px solid rgba(224, 123, 76, 0.2)" }}
        >
          <span className="font-medium" style={{ color: "var(--primary)" }}>call</span>{" "}
          <span className="font-bold" style={{ color: "var(--text-dark)" }}>{tool_name}</span>
          {server_name && <span style={{ color: "var(--text-light)" }}> on {server_name}</span>}
          {tool_args && (
            <pre className="mt-1 text-xs overflow-auto" style={{ color: "var(--text-light)" }}>
              {(() => { try { return JSON.stringify(JSON.parse(tool_args), null, 2); } catch { return tool_args; } })()}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (role === "tool_result") {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[80%] px-3 py-2 rounded-md text-xs font-mono"
          style={{ background: "rgba(58, 158, 92, 0.06)", border: "1px solid rgba(58, 158, 92, 0.2)" }}
        >
          <span className="font-medium" style={{ color: "var(--success)" }}>result</span>{" "}
          <span className="font-bold" style={{ color: "var(--text-dark)" }}>{tool_name}</span>
          <pre className="mt-1 text-xs overflow-auto max-h-48" style={{ color: "var(--text-medium)" }}>
            {content.length > 500 ? content.slice(0, 500) + "..." : content}
          </pre>
        </div>
      </div>
    );
  }

  if (role === "tool_error") {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[80%] px-3 py-2 rounded-md text-xs font-mono"
          style={{ background: "rgba(217, 68, 68, 0.06)", border: "1px solid rgba(217, 68, 68, 0.2)" }}
        >
          <span className="font-medium" style={{ color: "var(--danger)" }}>error</span>{" "}
          <span style={{ color: "var(--text-medium)" }}>{content}</span>
        </div>
      </div>
    );
  }

  if (role === "policy_block" || role === "pending_approval") {
    const isBlock = policy_action === "block" || policy_action === "input_validation_failed";
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[80%] px-3 py-2 rounded-md text-xs font-mono"
          style={{
            background: isBlock ? "rgba(217, 68, 68, 0.06)" : "rgba(200, 138, 46, 0.06)",
            border: `1px solid ${isBlock ? "rgba(217, 68, 68, 0.2)" : "rgba(200, 138, 46, 0.2)"}`,
          }}
        >
          <span className="font-medium" style={{ color: isBlock ? "var(--danger)" : "var(--warning)" }}>
            {isBlock ? "blocked" : "awaiting approval"}
          </span>{" "}
          <span style={{ color: "var(--text-medium)" }}>{content}</span>
        </div>
      </div>
    );
  }

  if (role === "error") {
    return (
      <div className="flex justify-center">
        <div className="px-4 py-2 rounded-md text-xs" style={{ background: "rgba(217, 68, 68, 0.06)", color: "var(--danger)" }}>
          {content}
        </div>
      </div>
    );
  }

  return null;
}
