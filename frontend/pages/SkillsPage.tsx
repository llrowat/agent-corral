import { useEffect, useState, useCallback } from "react";
import type { Scope, Skill } from "@/types";
import * as api from "@/lib/tauri";
import { useToast } from "@/components/Toast";
import { PresetPicker } from "@/components/PresetPicker";
import { CreateWithAiModal } from "@/components/CreateWithAiModal";
import { SKILL_PRESETS, type SkillPreset } from "@/lib/presets";
import { ScopeBanner } from "@/components/ScopeGuard";
import {
  validateSkillId,
  validateRequired,
  FieldError,
  type ValidationError,
} from "@/components/InlineValidation";
import { DocsLink } from "@/components/DocsLink";
import { SchemaForm } from "@/components/SchemaForm";
import { useSchema } from "@/hooks/useSchema";

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

const SKILL_FIELDS = [
  "skillId", "name", "description", "userInvocable",
  "allowedTools", "model", "disableModelInvocation", "context", "agent", "argumentHint", "content",
];

export function SkillsPage({ scope, homePath }: Props) {
  const toast = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [globalSkills, setGlobalSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [selectedIsGlobal, setSelectedIsGlobal] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [disabledSkills, setDisabledSkills] = useState<string[]>([]);
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
    try {
      const disabled = await api.listDisabledSkills(basePath);
      setDisabledSkills(disabled);
    } catch {
      setDisabledSkills([]);
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
      window.dispatchEvent(new Event("sidebar-refresh"));
      setSelected(editing);
      setEditing(null);
    } catch (e) {
      toast.error("Failed to save skill", String(e));
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
      window.dispatchEvent(new Event("sidebar-refresh"));
      if (selected?.skillId === skillId) setSelected(null);
      if (editing?.skillId === skillId) setEditing(null);
    } catch (e) {
      toast.error("Failed to delete skill", String(e));
    }
  };

  const handleToggleEnabled = async (skillId: string, currentlyDisabled: boolean) => {
    if (!basePath) return;
    try {
      await api.toggleSkillEnabled(basePath, skillId, currentlyDisabled);
      await loadSkills();
    } catch (e) {
      toast.error("Failed to toggle skill", String(e));
    }
  };

  const { schema: skillSchema } = useSchema("skill");

  const currentSkill = editing ?? selected;

  return (
    <div className="page skills-page">
      {scope && <ScopeBanner scope={scope} />}
      <p className="page-description">Custom slash commands for Claude Code. Each skill defines a prompt template with optional tool restrictions — mark a skill as user-invocable and it becomes a <code>/command</code> you can run from the Claude Code CLI.</p>
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
                      <span className="badge-new">
                        invocable
                      </span>
                    )}
                  </span>
                  <span className="agent-id">{skill.skillId}</span>
                </button>
                <button
                  className="btn-icon toggle-btn toggle-enabled"
                  onClick={() => handleToggleEnabled(skill.skillId, false)}
                  title="Disable skill"
                >
                  on
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
            {disabledSkills.map((skillId) => (
              <li
                key={`disabled-${skillId}`}
                className="agent-list-item entity-disabled"
              >
                <span className="agent-select">
                  <span className="agent-name">{skillId}</span>
                  <span className="agent-id">{skillId} (disabled)</span>
                </span>
                <button
                  className="btn-icon toggle-btn toggle-disabled"
                  onClick={() => handleToggleEnabled(skillId, true)}
                  title="Enable skill"
                >
                  off
                </button>
              </li>
            ))}
            {skills.length === 0 && disabledSkills.length === 0 && !isProjectScope && (
              <li className="list-empty">
                No skills defined
              </li>
            )}
            {isProjectScope && skills.length === 0 && disabledSkills.length === 0 && globalSkills.length === 0 && (
              <li className="list-empty">
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
                          <span className="badge-new">
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
              {skillSchema ? (
                <SchemaForm
                  schema={skillSchema}
                  values={editing as unknown as Record<string, unknown>}
                  onChange={(vals) => {
                    setEditing(vals as unknown as Skill);
                    setErrors({});
                  }}
                  isEdit={!isNewSkill}
                  knownTools={KNOWN_TOOLS}
                  fields={SKILL_FIELDS}
                />
              ) : (
                <p className="text-muted">Loading schema...</p>
              )}
              {errors.skillId && (
                <FieldError
                  error={errors.skillId}
                  onAutoFix={(val) => {
                    setEditing({ ...editing, skillId: val });
                    setErrors({ ...errors, skillId: null });
                  }}
                />
              )}
              {errors.name && <FieldError error={errors.name} />}

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
                {selectedIsGlobal && <span className="badge-global">global</span>}
                {selected!.userInvocable && (
                  <span className="badge-new">
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
              {selected!.disableModelInvocation && (
                <div className="detail-field">
                  <label>Model Invocation</label>
                  <span>Disabled</span>
                </div>
              )}
              {selected!.context && (
                <div className="detail-field">
                  <label>Context</label>
                  <pre className="prompt-preview">{selected!.context}</pre>
                </div>
              )}
              {selected!.agent && (
                <div className="detail-field">
                  <label>Agent</label>
                  <code>{selected!.agent}</code>
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
      {showPresets && (
        <PresetPicker
          title="Skill Templates"
          presets={SKILL_PRESETS}
          onSelect={handleSelectPreset}
          onClose={() => setShowPresets(false)}
        />
      )}
      {showAiModal && basePath && (
        <CreateWithAiModal
          entityType="skill"
          repoPath={basePath}
          onClose={() => setShowAiModal(false)}
          onCreated={() => loadSkills()}
        />
      )}
    </div>
  );
}
