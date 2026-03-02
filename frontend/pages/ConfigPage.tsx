import { useEffect, useState, useCallback } from "react";
import type { Scope, NormalizedConfig } from "@/types";
import * as api from "@/lib/tauri";
import { ScopeBanner } from "@/components/ScopeGuard";
import { DocsLink } from "@/components/DocsLink";
import { useToast } from "@/components/Toast";

interface Props {
  scope: Scope | null;
}

const EMPTY_CONFIG: NormalizedConfig = {
  model: null,
  permissions: null,
  ignorePatterns: null,
  raw: {},
};

const MODEL_OPTIONS = [
  { value: "", label: "Not set (defaults to Opus)" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

// -- Feature Toggles --

interface FeatureToggleDef {
  key: string;
  label: string;
  description: string;
  /** JSON path within settings.json: top-level key or "env.VAR_NAME" for env vars */
  settingsPath: string;
  defaultValue?: boolean;
}

const FEATURE_TOGGLES: FeatureToggleDef[] = [
  {
    key: "enableTeams",
    label: "Agent Teams (Experimental)",
    description:
      "Enable multi-agent team coordination. Agents can delegate tasks to teammates.",
    settingsPath: "env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
  },
  {
    key: "fastMode",
    label: "Fast Mode",
    description:
      "2.5x faster Opus output at higher per-token cost. Requires extra usage enabled.",
    settingsPath: "fastMode",
  },
  {
    key: "alwaysThinkingEnabled",
    label: "Extended Thinking",
    description: "Enable extended thinking by default for all sessions.",
    settingsPath: "alwaysThinkingEnabled",
  },
  {
    key: "enableAllProjectMcpServers",
    label: "Auto-approve Project MCP Servers",
    description:
      "Automatically approve all MCP servers defined in the project.",
    settingsPath: "enableAllProjectMcpServers",
  },
  {
    key: "respectGitignore",
    label: "Respect .gitignore",
    description:
      "Exclude .gitignore patterns from @ file picker suggestions.",
    settingsPath: "respectGitignore",
    defaultValue: true,
  },
  {
    key: "disableAllHooks",
    label: "Disable All Hooks",
    description:
      "Disable all hooks and statusLine execution globally.",
    settingsPath: "disableAllHooks",
  },
];

/** Read a toggle value from the raw settings object. Supports "env.VAR" paths. */
function readToggle(
  raw: Record<string, unknown>,
  path: string
): boolean | null {
  if (path.startsWith("env.")) {
    const envKey = path.slice(4);
    const env = raw.env as Record<string, unknown> | undefined;
    if (!env || !(envKey in env)) return null;
    const val = env[envKey];
    return val === "1" || val === "true" || val === true;
  }
  if (!(path in raw)) return null;
  return !!raw[path];
}

/** Write a toggle value into a raw settings object (mutates). Supports "env.VAR" paths. */
function writeToggle(
  raw: Record<string, unknown>,
  path: string,
  value: boolean | null
) {
  if (path.startsWith("env.")) {
    const envKey = path.slice(4);
    if (value === null || value === false) {
      if (raw.env && typeof raw.env === "object") {
        const env = { ...(raw.env as Record<string, unknown>) };
        delete env[envKey];
        if (Object.keys(env).length === 0) {
          delete raw.env;
        } else {
          raw.env = env;
        }
      }
    } else {
      const env = (raw.env && typeof raw.env === "object"
        ? { ...(raw.env as Record<string, unknown>) }
        : {}) as Record<string, unknown>;
      env[envKey] = "1";
      raw.env = env;
    }
    return;
  }
  if (value === null || value === false) {
    delete raw[path];
  } else {
    raw[path] = true;
  }
}

// -- Helpers --

interface ParsedPermissions {
  allow: string[];
  deny: string[];
}

function parsePermissions(permissions: unknown): ParsedPermissions {
  if (!permissions || typeof permissions !== "object")
    return { allow: [], deny: [] };
  const p = permissions as Record<string, unknown>;
  return {
    allow: Array.isArray(p.allow)
      ? p.allow.filter((s): s is string => typeof s === "string")
      : [],
    deny: Array.isArray(p.deny)
      ? p.deny.filter((s): s is string => typeof s === "string")
      : [],
  };
}

function buildPermissions(
  allow: string[],
  deny: string[]
): Record<string, string[]> | null {
  if (allow.length === 0 && deny.length === 0) return null;
  const result: Record<string, string[]> = {};
  if (allow.length > 0) result.allow = allow;
  if (deny.length > 0) result.deny = deny;
  return result;
}

/** Keys managed by the form — excluded from the advanced JSON editor. */
const MANAGED_RAW_KEYS = new Set([
  "model",
  "permissions",
  "ignorePatterns",
  ...FEATURE_TOGGLES.filter((t) => !t.settingsPath.startsWith("env.")).map(
    (t) => t.settingsPath
  ),
]);

/** Env-var keys managed by toggles — excluded from the advanced JSON env section. */
const MANAGED_ENV_KEYS = new Set(
  FEATURE_TOGGLES.filter((t) => t.settingsPath.startsWith("env.")).map((t) =>
    t.settingsPath.slice(4)
  )
);

/** Get raw config fields that aren't managed by the form. */
function getExtraRawFields(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (MANAGED_RAW_KEYS.has(key)) continue;
    if (key === "env" && typeof value === "object" && value !== null) {
      // Strip managed env keys
      const envObj = value as Record<string, unknown>;
      const filteredEnv: Record<string, unknown> = {};
      for (const [ek, ev] of Object.entries(envObj)) {
        if (!MANAGED_ENV_KEYS.has(ek)) filteredEnv[ek] = ev;
      }
      if (Object.keys(filteredEnv).length > 0) extra.env = filteredEnv;
      continue;
    }
    extra[key] = value;
  }
  return extra;
}

function modelLabel(modelId: string | null): string | null {
  if (!modelId) return null;
  return MODEL_OPTIONS.find((o) => o.value === modelId)?.label ?? modelId;
}

// -- Sub-components --

function SourceBadge({
  source,
  globalHint,
}: {
  source: "global" | "project" | "default";
  globalHint?: string | null;
}) {
  if (source === "global") {
    return (
      <span className="source-badge source-inherited">
        Inherited from global
        {globalHint && (
          <span className="source-value" title={globalHint}>
            {" "}
            ({globalHint})
          </span>
        )}
      </span>
    );
  }
  if (source === "project") {
    return <span className="source-badge source-override">Project override</span>;
  }
  return null;
}

function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
  emptyLabel,
}: {
  tags: string[];
  onAdd: (value: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
  emptyLabel?: string;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="tag-input-container">
      {tags.length > 0 ? (
        <div className="tag-list">
          {tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
              <button
                className="tag-remove"
                onClick={() => onRemove(tag)}
                aria-label={`Remove ${tag}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      ) : (
        emptyLabel && <span className="tag-empty">{emptyLabel}</span>
      )}
      <div className="tag-add-row">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        <button
          className="btn btn-sm"
          onClick={handleAdd}
          disabled={!inputValue.trim()}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// -- Main Component --

export function ConfigPage({ scope }: Props) {
  const toast = useToast();
  // Saved state from file
  const [savedConfig, setSavedConfig] = useState<NormalizedConfig>(EMPTY_CONFIG);
  const [globalConfig, setGlobalConfig] = useState<NormalizedConfig>(EMPTY_CONFIG);

  // Form state — always editable, no edit-mode toggle
  const [model, setModel] = useState("");
  const [ignorePatterns, setIgnorePatterns] = useState<string[]>([]);
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [deniedTools, setDeniedTools] = useState<string[]>([]);
  const [toggles, setToggles] = useState<Record<string, boolean | null>>({});
  const [advancedJson, setAdvancedJson] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [homePath, setHomePath] = useState<string | null>(null);

  const isProject = scope?.type === "project";
  const basePath =
    scope?.type === "global"
      ? scope.homePath
      : scope?.type === "project"
        ? scope.repo.path
        : null;

  // Fetch home path once for global config lookups
  useEffect(() => {
    api.getClaudeHome().then(setHomePath).catch(() => {});
  }, []);

  // Populate form fields from a config
  const populateForm = useCallback((config: NormalizedConfig) => {
    setModel(config.model ?? "");
    setIgnorePatterns(config.ignorePatterns ?? []);
    const perms = parsePermissions(config.permissions);
    setAllowedTools(perms.allow);
    setDeniedTools(perms.deny);
    // Read toggle values from raw
    const raw = (config.raw ?? {}) as Record<string, unknown>;
    const toggleState: Record<string, boolean | null> = {};
    for (const toggle of FEATURE_TOGGLES) {
      toggleState[toggle.key] = readToggle(raw, toggle.settingsPath);
    }
    setToggles(toggleState);
    const extra = getExtraRawFields(raw);
    setAdvancedJson(
      Object.keys(extra).length > 0 ? JSON.stringify(extra, null, 2) : "{}"
    );
    setJsonError(null);
  }, []);

  // Load config(s) on scope change
  useEffect(() => {
    if (!basePath) return;

    let cancelled = false;

    (async () => {
      try {
        const config = await api.readClaudeConfig(basePath);
        if (cancelled) return;
        setSavedConfig(config);
        populateForm(config);
      } catch (e) {
        if (cancelled) return;
        console.error("Failed to load config:", e);
        setSavedConfig(EMPTY_CONFIG);
        populateForm(EMPTY_CONFIG);
      }

      // Load global config for hierarchy reference
      if (isProject && homePath && homePath !== basePath) {
        try {
          const gc = await api.readClaudeConfig(homePath);
          if (!cancelled) setGlobalConfig(gc);
        } catch {
          if (!cancelled) setGlobalConfig(EMPTY_CONFIG);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [basePath, isProject, homePath, populateForm]);

  // -- Dirty checking --

  const isDirty = (() => {
    // Model
    if ((model || null) !== (savedConfig.model ?? null)) return true;

    // Ignore patterns
    const currentPatterns = JSON.stringify(
      ignorePatterns.length > 0 ? ignorePatterns : null
    );
    const savedPatterns = JSON.stringify(savedConfig.ignorePatterns ?? null);
    if (currentPatterns !== savedPatterns) return true;

    // Permissions
    const currentPerms = parsePermissions(
      buildPermissions(allowedTools, deniedTools)
    );
    const savedPerms = parsePermissions(savedConfig.permissions);
    if (JSON.stringify(currentPerms) !== JSON.stringify(savedPerms)) return true;

    // Feature toggles
    const savedRaw = (savedConfig.raw ?? {}) as Record<string, unknown>;
    for (const toggle of FEATURE_TOGGLES) {
      const savedVal = readToggle(savedRaw, toggle.settingsPath);
      if (toggles[toggle.key] !== savedVal) return true;
    }

    // Advanced JSON (extra raw fields)
    const savedExtra = getExtraRawFields(
      (savedConfig.raw ?? {}) as Record<string, unknown>
    );
    try {
      const currentExtra = JSON.parse(advancedJson);
      if (JSON.stringify(currentExtra) !== JSON.stringify(savedExtra))
        return true;
    } catch {
      // If invalid JSON, consider dirty
      return true;
    }

    return false;
  })();

  // -- Save / Discard --

  const handleSave = async () => {
    if (!basePath) return;
    setSaving(true);
    try {
      let rawObj: Record<string, unknown> = {};
      try {
        rawObj = JSON.parse(advancedJson);
      } catch {
        /* keep empty */
      }

      // Merge feature toggle values into raw
      for (const toggle of FEATURE_TOGGLES) {
        writeToggle(rawObj, toggle.settingsPath, toggles[toggle.key] ?? null);
      }

      const config: NormalizedConfig = {
        model: model || null,
        permissions: buildPermissions(allowedTools, deniedTools),
        ignorePatterns: ignorePatterns.length > 0 ? ignorePatterns : null,
        raw: rawObj,
      };

      await api.writeClaudeConfig(basePath, config);
      // Reload to get the canonical saved state
      const reloaded = await api.readClaudeConfig(basePath);
      setSavedConfig(reloaded);
      populateForm(reloaded);
    } catch (e) {
      toast.error("Failed to save config", String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    populateForm(savedConfig);
  };

  // -- Hierarchy helpers --

  const globalPerms = parsePermissions(globalConfig.permissions);

  function fieldSource(
    fieldName: "model" | "ignorePatterns" | "permissions"
  ): "global" | "project" | "default" {
    if (!isProject) return "default"; // no badge needed in global scope
    const sv = savedConfig[fieldName];
    if (sv != null && (Array.isArray(sv) ? sv.length > 0 : true))
      return "project";
    const gv = globalConfig[fieldName];
    if (gv != null && (Array.isArray(gv) ? gv.length > 0 : true))
      return "global";
    return "default";
  }

  function globalHint(
    fieldName: "model" | "ignorePatterns" | "permissions"
  ): string | null {
    if (fieldName === "model") return modelLabel(globalConfig.model);
    if (fieldName === "ignorePatterns")
      return globalConfig.ignorePatterns?.join(", ") ?? null;
    if (fieldName === "permissions") {
      const p = parsePermissions(globalConfig.permissions);
      const parts: string[] = [];
      if (p.allow.length) parts.push(`allow ${p.allow.length}`);
      if (p.deny.length) parts.push(`deny ${p.deny.length}`);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    return null;
  }

  // -- Render --

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to manage config.</p>
      </div>
    );
  }

  return (
    <div className="page config-page">
      {scope && <ScopeBanner scope={scope} />}
      <div className="page-header">
        <h2>
          Config Studio <DocsLink page="config" />
        </h2>
      </div>
      <p className="page-description">
        Project and global settings for Claude Code, including the default
        model, permission rules, and file ignore patterns.
      </p>

      {/* ── General ── */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>General</h3>
        </div>
        <div className="config-section-body">
          <div className="config-field">
            <div className="config-field-header">
              <label>Default Model</label>
              {isProject && fieldSource("model") !== "default" && (
                <SourceBadge
                  source={fieldSource("model")}
                  globalHint={globalHint("model")}
                />
              )}
            </div>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {isProject &&
              !model &&
              globalConfig.model && (
                <p className="config-field-hint">
                  Using global setting: {modelLabel(globalConfig.model)}
                </p>
              )}
          </div>
        </div>
      </div>

      {/* ── Feature Toggles ── */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Feature Toggles</h3>
        </div>
        <div className="config-section-body">
          {FEATURE_TOGGLES.map((toggle) => {
            const current = toggles[toggle.key];
            const isOn = current === true;
            const isExplicit = current !== null;
            const globalRaw = (globalConfig.raw ?? {}) as Record<string, unknown>;
            const globalVal = readToggle(globalRaw, toggle.settingsPath);
            const inheritedFromGlobal = isProject && !isExplicit && globalVal !== null;
            return (
              <div key={toggle.key} className="config-field toggle-field">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={inheritedFromGlobal ? !!globalVal : isOn}
                    onChange={(e) =>
                      setToggles((prev) => ({
                        ...prev,
                        [toggle.key]: e.target.checked,
                      }))
                    }
                    className={inheritedFromGlobal ? "inherited-toggle" : ""}
                  />
                  <span>{toggle.label}</span>
                  {inheritedFromGlobal && (
                    <span className="source-badge source-inherited">
                      Inherited from global ({globalVal ? "on" : "off"})
                    </span>
                  )}
                  {toggle.defaultValue !== undefined && !isExplicit && !inheritedFromGlobal && (
                    <span className="toggle-default">
                      (default: {toggle.defaultValue ? "on" : "off"})
                    </span>
                  )}
                </label>
                <p className="config-field-hint">{toggle.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Permissions ── */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Permissions</h3>
          {isProject && (globalPerms.allow.length > 0 || globalPerms.deny.length > 0) && (
            <span className="config-section-hint">Arrays merge across scopes</span>
          )}
        </div>
        <div className="config-section-body">
          <div className="config-field">
            <div className="config-field-header">
              <label>Allowed Tools</label>
            </div>
            <p className="config-field-hint">
              Tool patterns Claude can use without asking, e.g.{" "}
              <code>Bash(npm test:*)</code>, <code>Read</code>,{" "}
              <code>Write</code>
            </p>
            {isProject && globalPerms.allow.length > 0 && (
              <div className="inherited-tags">
                <span className="inherited-tags-label">From global (merged):</span>
                <div className="tag-list">
                  {globalPerms.allow.map((tag) => (
                    <span key={tag} className="tag tag-inherited">{tag}</span>
                  ))}
                </div>
              </div>
            )}
            <TagInput
              tags={allowedTools}
              onAdd={(v) => setAllowedTools([...allowedTools, v])}
              onRemove={(t) =>
                setAllowedTools(allowedTools.filter((x) => x !== t))
              }
              placeholder="Add tool pattern..."
              emptyLabel="No project-level allowed tools"
            />
          </div>

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>Denied Tools</label>
            <p className="config-field-hint">
              Tool patterns Claude should never use, e.g.{" "}
              <code>Bash(rm -rf *)</code>
            </p>
            {isProject && globalPerms.deny.length > 0 && (
              <div className="inherited-tags">
                <span className="inherited-tags-label">From global (merged):</span>
                <div className="tag-list">
                  {globalPerms.deny.map((tag) => (
                    <span key={tag} className="tag tag-inherited">{tag}</span>
                  ))}
                </div>
              </div>
            )}
            <TagInput
              tags={deniedTools}
              onAdd={(v) => setDeniedTools([...deniedTools, v])}
              onRemove={(t) =>
                setDeniedTools(deniedTools.filter((x) => x !== t))
              }
              placeholder="Add denied pattern..."
              emptyLabel="No project-level denied tools"
            />
          </div>
        </div>
      </div>

      {/* ── File Patterns ── */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>File Patterns</h3>
          {isProject && globalConfig.ignorePatterns && globalConfig.ignorePatterns.length > 0 && (
            <span className="config-section-hint">Arrays merge across scopes</span>
          )}
        </div>
        <div className="config-section-body">
          <div className="config-field">
            <div className="config-field-header">
              <label>Ignore Patterns</label>
            </div>
            <p className="config-field-hint">
              Files and directories Claude should ignore during operations.
            </p>
            {isProject && globalConfig.ignorePatterns && globalConfig.ignorePatterns.length > 0 && (
              <div className="inherited-tags">
                <span className="inherited-tags-label">From global (merged):</span>
                <div className="tag-list">
                  {globalConfig.ignorePatterns.map((tag) => (
                    <span key={tag} className="tag tag-inherited">{tag}</span>
                  ))}
                </div>
              </div>
            )}
            <TagInput
              tags={ignorePatterns}
              onAdd={(v) => setIgnorePatterns([...ignorePatterns, v])}
              onRemove={(t) =>
                setIgnorePatterns(ignorePatterns.filter((x) => x !== t))
              }
              placeholder="Add pattern..."
              emptyLabel="No project-level ignore patterns"
            />
          </div>
        </div>
      </div>

      {/* ── Advanced (JSON) ── */}
      <div className="config-section">
        <button
          className="config-section-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
          type="button"
        >
          <span className={`toggle-arrow ${showAdvanced ? "open" : ""}`}>
            &#9654;
          </span>
          <h3>Advanced (JSON)</h3>
          <span className="config-field-hint" style={{ marginLeft: 8 }}>
            Custom fields not managed by the form above
          </span>
        </button>
        {showAdvanced && (
          <div className="config-section-body">
            <p className="config-field-hint" style={{ marginBottom: 8 }}>
              Edit raw JSON for additional settings (e.g. hooks, env). Form
              fields above take precedence over matching keys here.
            </p>
            <textarea
              className={`advanced-json-editor ${jsonError ? "input-error" : ""}`}
              rows={8}
              value={advancedJson}
              onChange={(e) => {
                setAdvancedJson(e.target.value);
                try {
                  JSON.parse(e.target.value);
                  setJsonError(null);
                } catch (err) {
                  setJsonError(String(err));
                }
              }}
            />
            {jsonError && (
              <div className="field-error">
                <span className="field-error-message">{jsonError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Save bar ── */}
      {isDirty && (
        <div className="config-save-bar" data-testid="save-bar">
          <span>You have unsaved changes</span>
          <div className="config-save-actions">
            <button className="btn" onClick={handleDiscard}>
              Discard
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !!jsonError}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
