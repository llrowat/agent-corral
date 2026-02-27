import { useEffect, useState, useCallback } from "react";
import type { Repo, Agent } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  repo: Repo | null;
}

function newAgent(): Agent {
  return {
    agentId: "",
    name: "",
    systemPrompt: "",
    tools: [],
    modelOverride: null,
    memoryBinding: null,
  };
}

export function AgentsPage({ repo }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAgents = useCallback(async () => {
    if (!repo) return;
    const result = await api.readAgents(repo.path);
    setAgents(result);
  }, [repo]);

  useEffect(() => {
    setSelected(null);
    setEditing(null);
    loadAgents();
  }, [loadAgents]);

  if (!repo) {
    return (
      <div className="page page-empty">
        <p>Select a repository to manage agents.</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!editing || !repo) return;

    // Validation
    if (!editing.agentId.trim()) {
      alert("Agent ID is required");
      return;
    }
    if (!editing.name.trim()) {
      alert("Agent name is required");
      return;
    }
    if (!editing.systemPrompt.trim()) {
      alert("System prompt cannot be empty");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(editing.agentId)) {
      alert("Agent ID must be a lowercase slug (letters, numbers, hyphens)");
      return;
    }

    setSaving(true);
    try {
      await api.writeAgent(repo.path, editing);
      await loadAgents();
      setSelected(editing);
      setEditing(null);
    } catch (e) {
      alert(`Failed to save agent: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agentId: string) => {
    if (!repo) return;
    if (!confirm(`Delete agent "${agentId}"?`)) return;
    try {
      await api.deleteAgent(repo.path, agentId);
      await loadAgents();
      if (selected?.agentId === agentId) setSelected(null);
      if (editing?.agentId === agentId) setEditing(null);
    } catch (e) {
      alert(`Failed to delete agent: ${e}`);
    }
  };

  const currentAgent = editing ?? selected;

  return (
    <div className="page agents-page">
      <div className="split-layout">
        <div className="panel-left">
          <div className="panel-header">
            <h3>Agents</h3>
            <button
              className="btn btn-sm"
              onClick={() => {
                const agent = newAgent();
                setEditing(agent);
                setSelected(null);
              }}
            >
              + New
            </button>
          </div>
          <ul className="agent-list">
            {agents.map((agent) => (
              <li
                key={agent.agentId}
                className={`agent-list-item ${
                  currentAgent?.agentId === agent.agentId ? "active" : ""
                }`}
              >
                <button
                  className="agent-select"
                  onClick={() => {
                    setSelected(agent);
                    setEditing(null);
                  }}
                >
                  <span className="agent-name">{agent.name}</span>
                  <span className="agent-id">{agent.agentId}</span>
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleDelete(agent.agentId)}
                  title="Delete"
                >
                  x
                </button>
              </li>
            ))}
            {agents.length === 0 && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No agents defined
              </li>
            )}
          </ul>
        </div>

        <div className="panel-right">
          {!currentAgent ? (
            <div className="panel-empty">
              <p>Select an agent or create a new one.</p>
            </div>
          ) : editing ? (
            <div className="agent-editor">
              <h3>{editing.agentId ? `Edit: ${editing.name}` : "New Agent"}</h3>
              <div className="form-group">
                <label>Agent ID (slug)</label>
                <input
                  type="text"
                  value={editing.agentId}
                  onChange={(e) =>
                    setEditing({ ...editing, agentId: e.target.value })
                  }
                  placeholder="my-agent"
                  disabled={agents.some((a) => a.agentId === editing.agentId)}
                />
              </div>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="My Agent"
                />
              </div>
              <div className="form-group">
                <label>System Prompt</label>
                <textarea
                  rows={12}
                  value={editing.systemPrompt}
                  onChange={(e) =>
                    setEditing({ ...editing, systemPrompt: e.target.value })
                  }
                  placeholder="You are a helpful assistant that..."
                />
              </div>
              <div className="form-group">
                <label>Model Override (optional)</label>
                <select
                  value={editing.modelOverride ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      modelOverride: e.target.value || null,
                    })
                  }
                >
                  <option value="">Default</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                </select>
              </div>
              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Agent"}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setEditing(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="agent-detail">
              <h3>{selected!.name}</h3>
              <div className="detail-field">
                <label>ID</label>
                <code>{selected!.agentId}</code>
              </div>
              <div className="detail-field">
                <label>System Prompt</label>
                <pre className="prompt-preview">{selected!.systemPrompt}</pre>
              </div>
              {selected!.modelOverride && (
                <div className="detail-field">
                  <label>Model Override</label>
                  <code>{selected!.modelOverride}</code>
                </div>
              )}
              <div className="form-actions">
                <button
                  className="btn"
                  onClick={() => setEditing({ ...selected! })}
                >
                  Edit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
