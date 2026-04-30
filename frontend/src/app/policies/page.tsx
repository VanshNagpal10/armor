"use client";

import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface PolicyRule {
  id: string;
  name: string;
  type: "block" | "require_approval" | "input_validation";
  tool_name: string | null;
  server_name: string | null;
  condition: any;
  enabled: boolean;
  created_at: string;
}

interface ToolInfo {
  name: string;
  description?: string;
  serverName: string;
}

export default function PoliciesPage() {
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"block" | "require_approval" | "input_validation">("block");
  const [formToolName, setFormToolName] = useState("");
  const [formServerName, setFormServerName] = useState("");
  const [formField, setFormField] = useState("");
  const [formOperator, setFormOperator] = useState("must_start_with");
  const [formValue, setFormValue] = useState("");

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/policy/rules`);
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) { console.error("Failed to fetch rules:", err); }
  }, []);

  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/mcp/tools`);
      const data = await res.json();
      setTools(data.tools || []);
    } catch (err) { console.error("Failed to fetch tools:", err); }
  }, []);

  useEffect(() => {
    Promise.all([fetchRules(), fetchTools()]).then(() => setLoading(false));
  }, [fetchRules, fetchTools]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`ws://localhost:4000/ws`);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "policy_update") fetchRules();
      };
    } catch { /* ignore */ }
    return () => ws?.close();
  }, [fetchRules]);

  const createRule = async () => {
    let condition: any;
    if (formType === "block") condition = { type: "block" };
    else if (formType === "require_approval") condition = { type: "require_approval" };
    else condition = { type: "input_validation", validations: [{ field: formField, operator: formOperator, value: formValue }] };

    await fetch(`${API}/api/policy/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName, type: formType, tool_name: formToolName || null, server_name: formServerName || null, condition, enabled: true }),
    });
    setShowForm(false);
    resetForm();
    fetchRules();
  };

  const toggleRule = async (rule: PolicyRule) => {
    await fetch(`${API}/api/policy/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    fetchRules();
  };

  const deleteRule = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    await fetch(`${API}/api/policy/rules/${id}`, { method: "DELETE" });
    fetchRules();
  };

  const resetForm = () => {
    setFormName(""); setFormType("block"); setFormToolName(""); setFormServerName(""); setFormField(""); setFormOperator("must_start_with"); setFormValue("");
  };

  const typeBadge: Record<string, { bg: string; color: string; label: string }> = {
    block: { bg: "rgba(217, 68, 68, 0.08)", color: "var(--danger)", label: "Block" },
    require_approval: { bg: "rgba(200, 138, 46, 0.08)", color: "var(--warning)", label: "Approval" },
    input_validation: { bg: "rgba(74, 127, 199, 0.08)", color: "var(--info)", label: "Validation" },
  };

  if (loading) return <div className="flex items-center justify-center h-full"><p style={{ color: "var(--text-light)" }}>Loading...</p></div>;

  const inputStyle = { background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-dark)" };

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-secondary)" }}>
      <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>Guardrail Policies</h2>
          <p className="text-xs" style={{ color: "var(--text-light)" }}>
            {rules.length} rule{rules.length !== 1 ? "s" : ""} · Changes take effect immediately
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 text-xs font-medium rounded-md text-white" style={{ background: "var(--primary)" }} id="add-rule-button">
          + Add Rule
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-3">
        {showForm && (
          <div className="p-5 rounded-lg border space-y-4" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>New Rule</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-light)" }}>Name</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Block delete_note" className="w-full px-3 py-2 rounded-md border text-sm outline-none" style={inputStyle} id="rule-name-input" />
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-light)" }}>Type</label>
                <select value={formType} onChange={(e) => setFormType(e.target.value as any)} className="w-full px-3 py-2 rounded-md border text-sm outline-none" style={inputStyle} id="rule-type-select">
                  <option value="block">Block Tool</option>
                  <option value="require_approval">Require Approval</option>
                  <option value="input_validation">Input Validation</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-light)" }}>Tool</label>
                <select value={formToolName} onChange={(e) => setFormToolName(e.target.value)} className="w-full px-3 py-2 rounded-md border text-sm outline-none" style={inputStyle} id="rule-tool-select">
                  <option value="">Any tool</option>
                  <option value="*">All tools (*)</option>
                  {tools.map((t) => <option key={`${t.serverName}/${t.name}`} value={t.name}>{t.name} ({t.serverName})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-light)" }}>Server</label>
                <input value={formServerName} onChange={(e) => setFormServerName(e.target.value)} placeholder="Leave blank for all" className="w-full px-3 py-2 rounded-md border text-sm outline-none" style={inputStyle} id="rule-server-input" />
              </div>
            </div>
            {formType === "input_validation" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-light)" }}>Field</label>
                  <input value={formField} onChange={(e) => setFormField(e.target.value)} placeholder="e.g. path" className="w-full px-3 py-2 rounded-md border text-sm outline-none" style={inputStyle} id="rule-field-input" />
                </div>
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-light)" }}>Operator</label>
                  <select value={formOperator} onChange={(e) => setFormOperator(e.target.value)} className="w-full px-3 py-2 rounded-md border text-sm outline-none" style={inputStyle} id="rule-operator-select">
                    <option value="must_start_with">Must start with</option>
                    <option value="must_contain">Must contain</option>
                    <option value="must_not_contain">Must not contain</option>
                    <option value="must_match_regex">Must match regex</option>
                    <option value="max_length">Max length</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-light)" }}>Value</label>
                  <input value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder="e.g. /sandbox/" className="w-full px-3 py-2 rounded-md border text-sm outline-none" style={inputStyle} id="rule-value-input" />
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={createRule} disabled={!formName.trim()} className="px-4 py-2 text-xs font-medium rounded-md text-white disabled:opacity-40" style={{ background: "var(--primary)" }} id="create-rule-button">Create Rule</button>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 text-xs font-medium rounded-md border" style={{ borderColor: "var(--border)", color: "var(--text-medium)" }}>Cancel</button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center" style={{ color: "var(--text-light)" }}>
              <p className="text-sm">No guardrail rules configured</p>
              <p className="text-xs mt-1">Click &quot;Add Rule&quot; to create your first policy</p>
            </div>
          </div>
        ) : (
          rules.map((rule) => {
            const tb = typeBadge[rule.type];
            return (
              <div key={rule.id} className="p-4 rounded-lg border flex items-start justify-between gap-4" style={{ background: "var(--bg)", borderColor: "var(--border)", opacity: rule.enabled ? 1 : 0.5 }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: tb.bg, color: tb.color }}>{tb.label}</span>
                    <h3 className="text-sm font-bold truncate" style={{ color: "var(--text-dark)" }}>{rule.name}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-light)" }}>
                    {rule.tool_name && <span>Tool: <span className="font-mono" style={{ color: "var(--text-dark)" }}>{rule.tool_name}</span></span>}
                    {rule.server_name && <span>Server: <span className="font-mono" style={{ color: "var(--text-dark)" }}>{rule.server_name}</span></span>}
                    {rule.type === "input_validation" && rule.condition?.validations?.[0] && (
                      <span>{rule.condition.validations[0].field} {rule.condition.validations[0].operator.replace(/_/g, " ")} &quot;{rule.condition.validations[0].value}&quot;</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleRule(rule)} className="px-3 py-1 text-xs rounded-md border" style={{ borderColor: "var(--border)", color: rule.enabled ? "var(--success)" : "var(--text-light)" }}>
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button onClick={() => deleteRule(rule.id)} className="px-3 py-1 text-xs rounded-md border" style={{ borderColor: "var(--border)", color: "var(--danger)" }}>Delete</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
