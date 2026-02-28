import { useEffect, useState, useCallback } from "react";
import type { CommandTemplate } from "@/types";
import * as api from "@/lib/tauri";

const BUILTIN_IDS = [
  "run-claude",
  "run-chat",
  "run-agent",
  "run-prompt",
  "run-review",
];

const REQUIRE_OPTIONS = ["repo", "agent", "prompt"] as const;

function emptyTemplate(): CommandTemplate {
  return {
    templateId: "",
    name: "",
    description: "",
    requires: ["repo"],
    command: "",
    cwd: "{{repoPath}}",
  };
}

function slugify(name: string): string {
  return (
    "custom-" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") +
    "-" +
    Date.now()
  );
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<CommandTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CommandTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const result = await api.listTemplates();
      setTemplates(result);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const isBuiltin = (id: string) => BUILTIN_IDS.includes(id);

  const selected = templates.find((t) => t.templateId === selectedId) ?? null;
  const current = editing ?? selected;

  const startNew = () => {
    setEditing(emptyTemplate());
    setSelectedId(null);
    setIsNew(true);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const toSave = { ...editing };
      if (isNew && !toSave.templateId) {
        toSave.templateId = slugify(toSave.name || "template");
      }
      await api.saveTemplate(toSave);
      await loadTemplates();
      setSelectedId(toSave.templateId);
      setEditing(null);
      setIsNew(false);
    } catch (e) {
      alert(`Failed to save template: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (isBuiltin(id)) return;
    if (!confirm(`Delete this template?`)) return;
    try {
      await api.deleteTemplate(id);
      await loadTemplates();
      if (selectedId === id) setSelectedId(null);
      if (editing?.templateId === id) setEditing(null);
    } catch (e) {
      alert(`Failed to delete template: ${e}`);
    }
  };

  const toggleRequire = (req: string) => {
    if (!editing) return;
    const has = editing.requires.includes(req);
    const requires = has
      ? editing.requires.filter((r) => r !== req)
      : [...editing.requires, req];
    setEditing({ ...editing, requires });
  };

  return (
    <div className="page hooks-page">
      <div className="split-layout">
        <div className="panel-left">
          <div className="panel-header">
            <h3>Templates</h3>
            <button className="btn btn-sm" onClick={startNew}>
              + New
            </button>
          </div>
          <ul className="agent-list">
            {templates.map((tpl) => (
              <li
                key={tpl.templateId}
                className={`agent-list-item ${
                  current?.templateId === tpl.templateId ? "active" : ""
                }`}
              >
                <button
                  className="agent-select"
                  onClick={() => {
                    setSelectedId(tpl.templateId);
                    setEditing(null);
                    setIsNew(false);
                  }}
                >
                  <span className="agent-name">
                    {tpl.name}
                    {isBuiltin(tpl.templateId) && (
                      <span className="text-muted"> (built-in)</span>
                    )}
                  </span>
                  <span className="agent-id">{tpl.description}</span>
                </button>
                {!isBuiltin(tpl.templateId) && (
                  <button
                    className="btn-icon"
                    onClick={() => handleDelete(tpl.templateId)}
                    title="Delete"
                  >
                    x
                  </button>
                )}
              </li>
            ))}
            {templates.length === 0 && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No templates found
              </li>
            )}
          </ul>
        </div>

        <div className="panel-right">
          {!current ? (
            <div className="panel-empty">
              <p>Select a template or create a new one.</p>
            </div>
          ) : editing ? (
            <div className="agent-editor">
              <h3>{isNew ? "New Template" : `Edit: ${editing.name}`}</h3>

              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="My Custom Template"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={editing.description}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                  placeholder="What this template does"
                />
              </div>

              <div className="form-group">
                <label>Command</label>
                <textarea
                  rows={3}
                  value={editing.command}
                  onChange={(e) =>
                    setEditing({ ...editing, command: e.target.value })
                  }
                  placeholder={'claude -p {{prompt}}'}
                />
                <span className="text-muted" style={{ fontSize: "12px" }}>
                  {"Use {{repoPath}}, {{agentId}}, {{prompt}} as variables"}
                </span>
              </div>

              <div className="form-group">
                <label>Working Directory (optional)</label>
                <input
                  type="text"
                  value={editing.cwd ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      cwd: e.target.value || null,
                    })
                  }
                  placeholder={"{{repoPath}}"}
                />
              </div>

              <div className="form-group">
                <label>Requires</label>
                <div style={{ display: "flex", gap: "12px" }}>
                  {REQUIRE_OPTIONS.map((req) => (
                    <label
                      key={req}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={editing.requires.includes(req)}
                        onChange={() => toggleRequire(req)}
                      />
                      {req}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving || !editing.name.trim() || !editing.command.trim()}
                >
                  {saving ? "Saving..." : "Save Template"}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setEditing(null);
                    setIsNew(false);
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
                <label>Description</label>
                <span>{selected!.description}</span>
              </div>

              <div className="detail-field">
                <label>Command</label>
                <pre className="prompt-preview">{selected!.command}</pre>
              </div>

              {selected!.cwd && (
                <div className="detail-field">
                  <label>Working Directory</label>
                  <code>{selected!.cwd}</code>
                </div>
              )}

              <div className="detail-field">
                <label>Requires</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {selected!.requires.length > 0 ? (
                    selected!.requires.map((r) => (
                      <span key={r} className="tool-tag">
                        {r}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </div>
              </div>

              {!isBuiltin(selected!.templateId) && (
                <div className="form-actions">
                  <button
                    className="btn"
                    onClick={() => setEditing({ ...selected! })}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(selected!.templateId)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
