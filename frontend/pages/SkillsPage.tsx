import { useEffect, useState, useCallback } from "react";
import type { Scope, Skill } from "@/types";
import * as api from "@/lib/tauri";
import { CreateWithAiModal } from "@/components/CreateWithAiModal";
import { PresetPicker } from "@/components/PresetPicker";
import { SKILL_PRESETS, type SkillPreset } from "@/lib/presets";
import { ScopeBanner } from "@/components/ScopeGuard";
import {
  validateSkillId,
  validateRequired,
  FieldError,
  type ValidationError,
} from "@/components/InlineValidation";
import { DocsLink } from "@/components/DocsLink";

interface Props {
  scope: Scope | null;
  homePath: string | null;
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

export function SkillsPage({ scope, homePath }: Props) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [globalSkills, setGlobalSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [selectedIsGlobal, setSelectedIsGlobal] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [errors, setErrors] = useState<Record<string, ValidationError | null>>({});

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;
  const isProjectScope = scope?.type === "project";

  const loadSkills = useCallback(async () => {
    if (!basePath) return;
    try {
      const result = await api.readSkills(basePath);
      setSkills(result);
    } catch {
      setSkills([]);
    }
  }, [basePath]);

  const loadGlobalSkills = useCallback(async () => {
    if (!isProjectScope || !homePath) {
      setGlobalSkills([]);
      return;
    }
    try {
      const result = await api.readSkills(homePath);
      setGlobalSkills(result);
    } catch {
      setGlobalSkills([]);
    }
  }, [isProjectScope, homePath]);

  useEffect(() => {
    setSelected(null);
    setSelectedIsGlobal(false);
    setEditing(null);
    loadSkills();
    loadGlobalSkills();
  }, [loadSkills, loadGlobalSkills, basePath]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to manage skills.</p>
      </div>
    );
  }

  const isNewSkill =
    editing !== null && !skills.some((s) => s.skillId === editing.skillId);

  const handleSelectPreset = (preset: SkillPreset) => {
    setEditing({ ...preset.skill });
    setSelected(null);
    setErrors({});
  };

  const handleSave = async () => {
    if (!editing || !basePath) return;

    const newErrors: Record<string, ValidationError | null> = {};
    newErrors.skillId = validateSkillId(editing.skillId);
    newErrors.name = validateRequired("name", editing.name, "Skill name");
    setErrors(newErrors);
    if (Object.values(newErrors).some((e) => e !== null)) return;

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
      {scope && <ScopeBanner scope={scope} />}
      <div className="split-layout">
        <div className="panel-left">
          <div className="panel-header">
            <h3>Skills <DocsLink page="skills" /></h3>
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
                  setEditing(newSkill());
                  setSelected(null);
                  setErrors({});
                }}
              >
                + New
              </button>
            </div>
          </div>
          <ul className="agent-list">
            {skills.map((skill) => (
              <li
                key={skill.skillId}
                className={`agent-list-item ${
                  currentSkill?.skillId === skill.skillId && !selectedIsGlobal ? "active" : ""
                }`}
              >
                <button
                  className="agent-select"
                  onClick={() => {
                    setSelected(skill);
                    setSelectedIsGlobal(false);
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
            {skills.length === 0 && !isProjectScope && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No skills defined
              </li>
            )}
            {isProjectScope && skills.length === 0 && globalSkills.length === 0 && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No skills defined
              </li>
            )}
          </ul>
          {isProjectScope && globalSkills.length > 0 && (
            <>
              <div className="global-section-header">
                <span className="global-section-label">Global</span>
              </div>
              <ul className="agent-list">
                {globalSkills.map((skill) => (
                  <li
                    key={`global-${skill.skillId}`}
                    className={`agent-list-item global-item ${
                      currentSkill?.skillId === skill.skillId && selectedIsGlobal ? "active" : ""
                    }`}
                  >
                    <button
                      className="agent-select"
                      onClick={() => {
                        setSelected(skill);
                        setSelectedIsGlobal(true);
                        setEditing(null);
                      }}
                    >
                      <span className="agent-name">
                        {skill.name}
                        <span className="badge-global">global</span>
                        {skill.userInvocable && (
                          <span className="badge-new" style={{ marginLeft: 6 }}>
                            invocable
                          </span>
                        )}
                      </span>
                      <span className="agent-id">{skill.skillId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
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
                  onChange={(e) => {
                    setEditing({ ...editing, skillId: e.target.value });
                    setErrors({ ...errors, skillId: null });
                  }}
                  placeholder="my-skill"
                  disabled={!isNewSkill}
                  className={errors.skillId ? "input-error" : ""}
                />
                <FieldError
                  error={errors.skillId ?? null}
                  onAutoFix={(val) => {
                    setEditing({ ...editing, skillId: val });
                    setErrors({ ...errors, skillId: null });
                  }}
                />
              </div>

              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => {
                    setEditing({ ...editing, name: e.target.value });
                    setErrors({ ...errors, name: null });
                  }}
                  placeholder="My Skill"
                  className={errors.name ? "input-error" : ""}
                />
                <FieldError error={errors.name ?? null} />
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
                {selectedIsGlobal && <span className="badge-global" style={{ marginLeft: 8 }}>global</span>}
                {selected!.userInvocable && (
                  <span className="badge-new" style={{ marginLeft: 8 }}>
                    invocable
                  </span>
                )}
              </h3>
              {selectedIsGlobal && (
                <p className="global-readonly-hint">
                  This skill is defined in the global scope. Switch to Global Settings to edit it.
                </p>
              )}
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
          entityType="skill"
          repoPath={basePath}
          onClose={() => setShowAiModal(false)}
          onCreated={() => loadSkills()}
        />
      )}
      {showPresets && (
        <PresetPicker
          title="Skill Templates"
          presets={SKILL_PRESETS}
          onSelect={handleSelectPreset}
          onClose={() => setShowPresets(false)}
        />
      )}
    </div>
  );
}
