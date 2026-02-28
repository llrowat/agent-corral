import { useEffect, useState, useCallback } from "react";
import type { Scope, Agent, MemoryStore } from "@/types";
import * as api from "@/lib/tauri";
import { CreateWithAiModal } from "@/components/CreateWithAiModal";

interface Props {
  scope: Scope | null;
  homePath: string | null;
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

export function AgentsPage({ scope, homePath }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [globalAgents, setGlobalAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [selectedIsGlobal, setSelectedIsGlobal] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  const [knownTools, setKnownTools] = useState<string[]>([]);
  const [memoryStores, setMemoryStores] = useState<MemoryStore[]>([]);
  const [showAiModal, setShowAiModal] = useState(false);

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;
  const isProjectScope = scope?.type === "project";

  const loadAgents = useCallback(async () => {
    if (!basePath) return;
    const result = await api.readAgents(basePath);
    setAgents(result);
  }, [basePath]);

  const loadGlobalAgents = useCallback(async () => {
    if (!isProjectScope || !homePath) {
      setGlobalAgents([]);
      return;
    }
    try {
      const result = await api.readAgents(homePath);
      setGlobalAgents(result);
    } catch {
      setGlobalAgents([]);
    }
  }, [isProjectScope, homePath]);

  useEffect(() => {
    setSelected(null);
    setSelectedIsGlobal(false);
    setEditing(null);
    loadAgents();
    loadGlobalAgents();
    api.getKnownTools().then(setKnownTools);
    if (basePath) {
      api.readMemoryStores(basePath).then(setMemoryStores).catch(() => setMemoryStores([]));
    }
  }, [loadAgents, loadGlobalAgents, basePath]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to manage agents.</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!editing || !basePath) return;

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
      await api.writeAgent(basePath, editing);
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
    if (!basePath) return;
    if (!confirm(`Delete agent "${agentId}"?`)) return;
    try {
      await api.deleteAgent(basePath, agentId);
      await loadAgents();
      if (selected?.agentId === agentId) setSelected(null);
      if (editing?.agentId === agentId) setEditing(null);
    } catch (e) {
      alert(`Failed to delete agent: ${e}`);
    }
  };

  const toggleTool = (tool: string) => {
    if (!editing) return;
    const tools = editing.tools.includes(tool)
      ? editing.tools.filter((t) => t !== tool)
      : [...editing.tools, tool];
    setEditing({ ...editing, tools });
  };

  const currentAgent = editing ?? selected;
  const isNewAgent = editing !== null && !agents.some((a) => a.agentId === editing.agentId);

  return (
    <div className="page agents-page">
      <div className="split-layout">
        <div className="panel-left">
          <div className="panel-header">
            <h3>Agents</h3>
            <div className="header-actions">
              {basePath && (
                <button
                  className="btn btn-sm"
                  onClick={() => setShowAiModal(true)}
                >
                  AI Create
                </button>
              )}
              <button
                className="btn btn-sm"
                onClick={() => {
                  setEditing(newAgent());
                  setSelected(null);
                }}
              >
                + New
              </button>
            </div>
          </div>
          <ul className="agent-list">
            {agents.map((agent) => (
              <li
                key={agent.agentId}
                className={`agent-list-item ${
                  currentAgent?.agentId === agent.agentId && !selectedIsGlobal ? "active" : ""
                }`}
              >
                <button
                  className="agent-select"
                  onClick={() => {
                    setSelected(agent);
                    setSelectedIsGlobal(false);
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
            {agents.length === 0 && !isProjectScope && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No agents defined
              </li>
            )}
            {isProjectScope && agents.length === 0 && globalAgents.length === 0 && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No agents defined
              </li>
            )}
          </ul>
          {isProjectScope && globalAgents.length > 0 && (
            <>
              <div className="global-section-header">
                <span className="global-section-label">Global</span>
              </div>
              <ul className="agent-list">
                {globalAgents.map((agent) => (
                  <li
                    key={`global-${agent.agentId}`}
                    className={`agent-list-item global-item ${
                      currentAgent?.agentId === agent.agentId && selectedIsGlobal ? "active" : ""
                    }`}
                  >
                    <button
                      className="agent-select"
                      onClick={() => {
                        setSelected(agent);
                        setSelectedIsGlobal(true);
                        setEditing(null);
                      }}
                    >
                      <span className="agent-name">
                        {agent.name}
                        <span className="badge-global">global</span>
                      </span>
                      <span className="agent-id">{agent.agentId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="panel-right">
          {!currentAgent ? (
            <div className="panel-empty">
              <p>Select an agent or create a new one.</p>
            </div>
          ) : editing ? (
            <div className="agent-editor">
              <h3>{isNewAgent ? "New Agent" : `Edit: ${editing.name}`}</h3>
              <div className="form-group">
                <label>Agent ID (slug)</label>
                <input
                  type="text"
                  value={editing.agentId}
                  onChange={(e) =>
                    setEditing({ ...editing, agentId: e.target.value })
                  }
                  placeholder="my-agent"
                  disabled={!isNewAgent}
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
                <label>Allowed Tools</label>
                <div className="tools-grid">
                  {knownTools.map((tool) => (
                    <label key={tool} className="tool-checkbox">
                      <input
                        type="checkbox"
                        checked={editing.tools.includes(tool)}
                        onChange={() => toggleTool(tool)}
                      />
                      <span>{tool}</span>
                    </label>
                  ))}
                </div>
                {editing.tools.length === 0 && (
                  <span className="text-muted" style={{ fontSize: "12px" }}>
                    No tools selected (agent will have access to all tools)
                  </span>
                )}
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

              <div className="form-group">
                <label>Memory Binding (optional)</label>
                <select
                  value={editing.memoryBinding ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      memoryBinding: e.target.value || null,
                    })
                  }
                >
                  <option value="">None</option>
                  {memoryStores.map((store) => (
                    <option key={store.storeId} value={store.storeId}>
                      {store.name} ({store.entryCount} entries)
                    </option>
                  ))}
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
                <button className="btn" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="agent-detail">
              <h3>
                {selected!.name}
                {selectedIsGlobal && <span className="badge-global" style={{ marginLeft: 8 }}>global</span>}
              </h3>
              {selectedIsGlobal && (
                <p className="global-readonly-hint">
                  This agent is defined in the global scope. Switch to Global Settings to edit it.
                </p>
              )}
              <div className="detail-field">
                <label>ID</label>
                <code>{selected!.agentId}</code>
              </div>
              <div className="detail-field">
                <label>System Prompt</label>
                <pre className="prompt-preview">{selected!.systemPrompt}</pre>
              </div>
              {selected!.tools.length > 0 && (
                <div className="detail-field">
                  <label>Tools</label>
                  <div className="tool-tags">
                    {selected!.tools.map((t) => (
                      <span key={t} className="tool-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selected!.modelOverride && (
                <div className="detail-field">
                  <label>Model Override</label>
                  <code>{selected!.modelOverride}</code>
                </div>
              )}
              {selected!.memoryBinding && (
                <div className="detail-field">
                  <label>Memory Binding</label>
                  <code>{selected!.memoryBinding}</code>
                </div>
              )}
              {!selectedIsGlobal && (
                <div className="form-actions">
                  <button
                    className="btn"
                    onClick={() => setEditing({ ...selected! })}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showAiModal && basePath && (
        <CreateWithAiModal
          entityType="agent"
          repoPath={basePath}
          onClose={() => setShowAiModal(false)}
          onCreated={() => loadAgents()}
        />
      )}
    </div>
  );
}
