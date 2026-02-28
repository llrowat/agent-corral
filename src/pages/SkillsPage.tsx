import { useEffect, useState, useCallback } from "react";
import type { Scope, Skill } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope | null;
}

function newSkill(): Skill {
  return {
    skillId: "",
    name: "",
    description: null,
    userInvocable: true,
    allowedTools: [],
    model: null,
    disableModelInvocation: null,
    context: null,
    agent: null,
    argumentHint: null,
    content: "",
  };
}

const KNOWN_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "NotebookEdit",
  "Task",
];

export function SkillsPage({ scope }: Props) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [saving, setSaving] = useState(false);

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;

  const loadSkills = useCallback(async () => {
    if (!basePath) return;
    try {
      const result = await api.readSkills(basePath);
      setSkills(result);
    } catch {
      setSkills([]);
    }
  }, [basePath]);

  useEffect(() => {
    setSelected(null);
    setEditing(null);
    loadSkills();
  }, [loadSkills, basePath]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to manage skills.</p>
      </div>
    );
  }

  const isNewSkill =
    editing !== null && !skills.some((s) => s.skillId === editing.skillId);

  const handleSave = async () => {
    if (!editing || !basePath) return;
    if (!editing.skillId.trim()) {
      alert("Skill ID is required");
      return;
    }
    if (!editing.name.trim()) {
      alert("Skill name is required");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(editing.skillId)) {
      alert("Skill ID must be a lowercase slug (letters, numbers, hyphens)");
      return;
    }

    setSaving(true);
    try {
      await api.writeSkill(basePath, editing);
      await loadSkills();
      setSelected(editing);
      setEditing(null);
    } catch (e) {
      alert(`Failed to save skill: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skillId: string) => {
    if (!basePath) return;
    if (!confirm(`Delete skill "${skillId}"?`)) return;
    try {
      await api.deleteSkill(basePath, skillId);
      await loadSkills();
      if (selected?.skillId === skillId) setSelected(null);
      if (editing?.skillId === skillId) setEditing(null);
    } catch (e) {
      alert(`Failed to delete skill: ${e}`);
    }
  };

  const toggleTool = (tool: string) => {
    if (!editing) return;
    const allowedTools = editing.allowedTools.includes(tool)
      ? editing.allowedTools.filter((t) => t !== tool)
      : [...editing.allowedTools, tool];
    setEditing({ ...editing, allowedTools });
  };

  const currentSkill = editing ?? selected;

  return (
    <div className="page skills-page">
      <div className="split-layout">
        <div className="panel-left">
          <div className="panel-header">
            <h3>Skills</h3>
            <button
              className="btn btn-sm"
              onClick={() => {
                setEditing(newSkill());
                setSelected(null);
              }}
            >
              + New
            </button>
          </div>
          <ul className="agent-list">
            {skills.map((skill) => (
              <li
                key={skill.skillId}
                className={`agent-list-item ${
                  currentSkill?.skillId === skill.skillId ? "active" : ""
                }`}
              >
                <button
                  className="agent-select"
                  onClick={() => {
                    setSelected(skill);
                    setEditing(null);
                  }}
                >
                  <span className="agent-name">
                    {skill.name}
                    {skill.userInvocable && (
                      <span className="badge-new" style={{ marginLeft: 6 }}>
                        invocable
                      </span>
                    )}
                  </span>
                  <span className="agent-id">{skill.skillId}</span>
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleDelete(skill.skillId)}
                  title="Delete"
                >
                  x
                </button>
              </li>
            ))}
            {skills.length === 0 && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No skills defined
              </li>
            )}
          </ul>
        </div>

        <div className="panel-right">
          {!currentSkill ? (
            <div className="panel-empty">
              <p>Select a skill or create a new one.</p>
            </div>
          ) : editing ? (
            <div className="agent-editor">
              <h3>{isNewSkill ? "New Skill" : `Edit: ${editing.name}`}</h3>

              <div className="form-group">
                <label>Skill ID (slug)</label>
                <input
                  type="text"
                  value={editing.skillId}
                  onChange={(e) =>
                    setEditing({ ...editing, skillId: e.target.value })
                  }
                  placeholder="my-skill"
                  disabled={!isNewSkill}
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
                  placeholder="My Skill"
                />
              </div>

              <div className="form-group">
                <label>Description (optional)</label>
                <input
                  type="text"
                  value={editing.description ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      description: e.target.value || null,
                    })
                  }
                  placeholder="What this skill does..."
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={editing.userInvocable ?? false}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        userInvocable: e.target.checked,
                      })
                    }
                  />{" "}
                  User invocable (can be called with /skill-id)
                </label>
              </div>

              <div className="form-group">
                <label>Allowed Tools</label>
                <div className="tools-grid">
                  {KNOWN_TOOLS.map((tool) => (
                    <label key={tool} className="tool-checkbox">
                      <input
                        type="checkbox"
                        checked={editing.allowedTools.includes(tool)}
                        onChange={() => toggleTool(tool)}
                      />
                      <span>{tool}</span>
                    </label>
                  ))}
                </div>
                {editing.allowedTools.length === 0 && (
                  <span className="text-muted" style={{ fontSize: "12px" }}>
                    No tools selected (skill will have access to all tools)
                  </span>
                )}
              </div>

              <div className="form-group">
                <label>Model Override (optional)</label>
                <select
                  value={editing.model ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      model: e.target.value || null,
                    })
                  }
                >
                  <option value="">Default</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                  <option value="claude-haiku-4-5-20251001">
                    Claude Haiku 4.5
                  </option>
                </select>
              </div>

              <div className="form-group">
                <label>Argument Hint (optional)</label>
                <input
                  type="text"
                  value={editing.argumentHint ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      argumentHint: e.target.value || null,
                    })
                  }
                  placeholder="e.g. <file-path>"
                />
              </div>

              <div className="form-group">
                <label>Content (markdown)</label>
                <textarea
                  rows={16}
                  value={editing.content}
                  onChange={(e) =>
                    setEditing({ ...editing, content: e.target.value })
                  }
                  placeholder="Skill instructions and prompt template..."
                />
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Skill"}
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
                {selected!.userInvocable && (
                  <span className="badge-new" style={{ marginLeft: 8 }}>
                    invocable
                  </span>
                )}
              </h3>
              <div className="detail-field">
                <label>ID</label>
                <code>{selected!.skillId}</code>
              </div>
              {selected!.description && (
                <div className="detail-field">
                  <label>Description</label>
                  <p>{selected!.description}</p>
                </div>
              )}
              {selected!.allowedTools.length > 0 && (
                <div className="detail-field">
                  <label>Tools</label>
                  <div className="tool-tags">
                    {selected!.allowedTools.map((t) => (
                      <span key={t} className="tool-tag">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selected!.model && (
                <div className="detail-field">
                  <label>Model Override</label>
                  <code>{selected!.model}</code>
                </div>
              )}
              {selected!.argumentHint && (
                <div className="detail-field">
                  <label>Argument Hint</label>
                  <code>{selected!.argumentHint}</code>
                </div>
              )}
              <div className="detail-field">
                <label>Content</label>
                <pre className="prompt-preview">{selected!.content}</pre>
              </div>
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
