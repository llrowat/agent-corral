import { useEffect, useState, useCallback } from "react";
import type { Scope, Agent } from "@/types";
import * as api from "@/lib/tauri";
import { PresetPicker } from "@/components/PresetPicker";
import { AGENT_PRESETS, type AgentPreset } from "@/lib/presets";
import { ScopeBanner } from "@/components/ScopeGuard";
import {
  validateAgentId,
  validateRequired,
  FieldError,
  type ValidationError,
} from "@/components/InlineValidation";
import { DocsLink } from "@/components/DocsLink";
import { CreateWithAiModal } from "@/components/CreateWithAiModal";
import { SchemaForm } from "@/components/SchemaForm";
import { useToast } from "@/components/Toast";
import { useSchema } from "@/hooks/useSchema";

interface Props {
  scope: Scope | null;
  homePath: string | null;
}

function newAgent(): Agent {
  return {
    agentId: "",
    name: "",
    description: "",
    systemPrompt: "",
    tools: [],
    modelOverride: null,
    memory: null,
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
  const [showPresets, setShowPresets] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [disabledAgents, setDisabledAgents] = useState<string[]>([]);
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, ValidationError | null>>({});

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;
  const isProjectScope = scope?.type === "project";

  const loadAgents = useCallback(async () => {
    if (!basePath) return;
    const result = await api.readAgents(basePath);
    setAgents(result);
    try {
      const disabled = await api.listDisabledAgents(basePath);
      setDisabledAgents(disabled);
    } catch {
      setDisabledAgents([]);
    }
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
    if (basePath) {
      const isGlobal = scope?.type === "global";
      api.getKnownToolsWithMcp(basePath, isGlobal).then(setKnownTools);
    } else {
      api.getKnownTools().then(setKnownTools);
    }
  }, [loadAgents, loadGlobalAgents, basePath, scope?.type]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to manage agents.</p>
      </div>
    );
  }

  const handleSelectPreset = (preset: AgentPreset) => {
    setEditing({ ...preset.agent });
    setSelected(null);
    setErrors({});
  };

  const handleCopyToGlobal = async (agent: Agent) => {
    if (!homePath) return;
    try {
      await api.writeAgent(homePath, agent);
      await loadGlobalAgents();
    } catch (e) {
      console.error("Failed to copy agent to global:", e);
    }
  };

  const handleCopyToProject = async (agent: Agent) => {
    if (!basePath) return;
    try {
      await api.writeAgent(basePath, agent);
      await loadAgents();
    } catch (e) {
      console.error("Failed to copy agent to project:", e);
    }
  };

  const handleSave = async () => {
    if (!editing || !basePath) return;

    const newErrors: Record<string, ValidationError | null> = {};
    newErrors.agentId = validateAgentId(editing.agentId);
    newErrors.name = validateRequired("name", editing.name, "Agent name");
    newErrors.description = validateRequired("description", editing.description, "Description");
    newErrors.systemPrompt = validateRequired(
      "systemPrompt",
      editing.systemPrompt,
      "System prompt"
    );
    setErrors(newErrors);
    if (Object.values(newErrors).some((e) => e !== null)) return;

    setSaving(true);
    try {
      await api.writeAgent(basePath, editing);
      await loadAgents();
      window.dispatchEvent(new Event("sidebar-refresh"));
      setSelected(editing);
      setEditing(null);
    } catch (e) {
      toast.error("Failed to save agent", String(e));
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
      window.dispatchEvent(new Event("sidebar-refresh"));
      if (selected?.agentId === agentId) setSelected(null);
      if (editing?.agentId === agentId) setEditing(null);
    } catch (e) {
      toast.error("Failed to delete agent", String(e));
    }
  };

  const handleToggleEnabled = async (agentId: string, currentlyDisabled: boolean) => {
    if (!basePath) return;
    try {
      await api.toggleAgentEnabled(basePath, agentId, currentlyDisabled);
      await loadAgents();
    } catch (e) {
      toast.error("Failed to toggle agent", String(e));
    }
  };

  const { schema: agentSchema } = useSchema("agent");

  const currentAgent = editing ?? selected;
  const isNewAgent = editing !== null && !agents.some((a) => a.agentId === editing.agentId);

  return (
    <div className="page agents-page">
      {scope && <ScopeBanner scope={scope} />}
      <p className="page-description">Custom personas for Claude Code. Each agent has its own system prompt, tool permissions, and optional model override — use them to create specialized assistants for different tasks.</p>
      <div className="split-layout">
        <div className="panel-left">
          <div className="panel-header">
            <h3>Agents <DocsLink page="agents" /></h3>
            <div className="header-actions">
              <button
                className="btn btn-sm"
                onClick={() => setShowPresets(true)}
              >
                From Template
              </button>
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
                  setErrors({});
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
                  className="btn-icon toggle-btn toggle-enabled"
                  onClick={() => handleToggleEnabled(agent.agentId, false)}
                  title="Disable agent"
                >
                  on
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
            {disabledAgents.map((agentId) => (
              <li
                key={`disabled-${agentId}`}
                className="agent-list-item entity-disabled"
              >
                <span className="agent-select">
                  <span className="agent-name">{agentId}</span>
                  <span className="agent-id">{agentId} (disabled)</span>
                </span>
                <button
                  className="btn-icon toggle-btn toggle-disabled"
                  onClick={() => handleToggleEnabled(agentId, true)}
                  title="Enable agent"
                >
                  off
                </button>
              </li>
            ))}
            {agents.length === 0 && disabledAgents.length === 0 && !isProjectScope && (
              <li className="list-empty">
                No agents defined
              </li>
            )}
            {isProjectScope && agents.length === 0 && disabledAgents.length === 0 && globalAgents.length === 0 && (
              <li className="list-empty">
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
              {agentSchema ? (
                <SchemaForm
                  schema={agentSchema}
                  values={editing as unknown as Record<string, unknown>}
                  onChange={(vals) => {
                    setEditing(vals as unknown as Agent);
                    setErrors({});
                  }}
                  isEdit={!isNewAgent}
                  knownTools={knownTools}
                />
              ) : (
                <p className="text-muted">Loading schema...</p>
              )}
              {errors.agentId && (
                <FieldError
                  error={errors.agentId}
                  onAutoFix={(val) => {
                    setEditing({ ...editing, agentId: val });
                    setErrors({ ...errors, agentId: null });
                  }}
                />
              )}
              {errors.name && <FieldError error={errors.name} />}
              {errors.description && <FieldError error={errors.description} />}
              {errors.systemPrompt && <FieldError error={errors.systemPrompt} />}

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
                {selectedIsGlobal && <span className="badge-global">global</span>}
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
              {selected!.description && (
                <div className="detail-field">
                  <label>Description</label>
                  <p>{selected!.description}</p>
                </div>
              )}
              <div className="detail-field">
                <label>System Prompt</label>
                <pre className="prompt-preview">{selected!.systemPrompt}</pre>
              </div>
              <div className="detail-field">
                <label>Tools</label>
                {selected!.tools.length > 0 ? (
                  <div className="tool-tags">
                    {selected!.tools.map((t) => (
                      <span key={t} className="tool-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">All tools (unrestricted)</span>
                )}
              </div>
              {selected!.modelOverride && (
                <div className="detail-field">
                  <label>Model Override</label>
                  <code>{selected!.modelOverride}</code>
                </div>
              )}
              {selected!.memory && (
                <div className="detail-field">
                  <label>Memory Scope</label>
                  <code>{selected!.memory}</code>
                </div>
              )}
              {/* Quick launch CLI command */}
              <div className="agent-quick-launch">
                <label>CLI Command</label>
                <div className="quick-launch-row">
                  <code className="quick-launch-cmd">
                    claude --agent {selected!.agentId}
                  </code>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `claude --agent ${selected!.agentId}`
                      );
                    }}
                    title="Copy to clipboard"
                  >
                    Copy
                  </button>
                  {basePath && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={async () => {
                        try {
                          const cmd = `claude --agent ${selected!.agentId}`;
                          await api.launchTerminal(basePath, cmd);
                        } catch (e) {
                          console.error("Failed to launch:", e);
                        }
                      }}
                      title="Open Claude Code with this agent in a terminal"
                    >
                      Launch
                    </button>
                  )}
                </div>
              </div>

              <div className="form-actions">
                {!selectedIsGlobal && (
                  <button
                    className="btn"
                    onClick={() => {
                      setEditing({ ...selected! });
                      setErrors({});
                    }}
                  >
                    Edit
                  </button>
                )}
                {!selectedIsGlobal && isProjectScope && homePath && (
                  <button
                    className="btn btn-sm"
                    onClick={() => handleCopyToGlobal(selected!)}
                    title="Copy this agent to global scope"
                  >
                    Copy to Global
                  </button>
                )}
                {selectedIsGlobal && isProjectScope && basePath && (
                  <button
                    className="btn btn-sm"
                    onClick={() => handleCopyToProject(selected!)}
                    title="Copy this agent to project scope"
                  >
                    Copy to Project
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
{showPresets && (
        <PresetPicker
          title="Agent Templates"
          presets={AGENT_PRESETS}
          onSelect={handleSelectPreset}
          onClose={() => setShowPresets(false)}
        />
      )}
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
