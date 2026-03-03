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

const PERMISSION_MODE_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "acceptEdits", label: "Accept Edits" },
  { value: "reviewEdits", label: "Review Edits" },
  { value: "bypassPermissions", label: "Bypass Permissions" },
];

const AUTO_UPDATE_CHANNEL_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "stable", label: "Stable" },
  { value: "latest", label: "Latest" },
];

const TEAMMATE_MODE_OPTIONS = [
  { value: "", label: "Not set (auto)" },
  { value: "auto", label: "Auto" },
  { value: "in-process", label: "In-Process" },
  { value: "tmux", label: "tmux" },
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
  {
    key: "showTurnDuration",
    label: "Show Turn Duration",
    description: "Display how long each turn takes in messages.",
    settingsPath: "showTurnDuration",
  },
  {
    key: "terminalProgressBarEnabled",
    label: "Terminal Progress Bar",
    description: "Show a progress bar in the terminal during operations.",
    settingsPath: "terminalProgressBarEnabled",
    defaultValue: true,
  },
  {
    key: "spinnerTipsEnabled",
    label: "Spinner Tips",
    description: "Show tips in the spinner while Claude is working.",
    settingsPath: "spinnerTipsEnabled",
    defaultValue: true,
  },
  {
    key: "prefersReducedMotion",
    label: "Reduced Motion",
    description: "Reduce UI animations for accessibility.",
    settingsPath: "prefersReducedMotion",
  },
  {
    key: "fastModePerSessionOptIn",
    label: "Fast Mode Per-Session Opt-In",
    description: "Require fast mode to be opted into each session instead of persisting.",
    settingsPath: "fastModePerSessionOptIn",
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
  ask: string[];
  defaultMode: string;
  additionalDirectories: string[];
}

function parsePermissions(permissions: unknown): ParsedPermissions {
  if (!permissions || typeof permissions !== "object")
    return { allow: [], deny: [], ask: [], defaultMode: "", additionalDirectories: [] };
  const p = permissions as Record<string, unknown>;
  return {
    allow: Array.isArray(p.allow)
      ? p.allow.filter((s): s is string => typeof s === "string")
      : [],
    deny: Array.isArray(p.deny)
      ? p.deny.filter((s): s is string => typeof s === "string")
      : [],
    ask: Array.isArray(p.ask)
      ? p.ask.filter((s): s is string => typeof s === "string")
      : [],
    defaultMode: typeof p.defaultMode === "string" ? p.defaultMode : "",
    additionalDirectories: Array.isArray(p.additionalDirectories)
      ? p.additionalDirectories.filter((s): s is string => typeof s === "string")
      : [],
  };
}

function buildPermissions(
  allow: string[],
  deny: string[],
  ask: string[],
  defaultMode: string,
  additionalDirectories: string[]
): Record<string, unknown> | null {
  if (
    allow.length === 0 &&
    deny.length === 0 &&
    ask.length === 0 &&
    !defaultMode &&
    additionalDirectories.length === 0
  )
    return null;
  const result: Record<string, unknown> = {};
  if (allow.length > 0) result.allow = allow;
  if (deny.length > 0) result.deny = deny;
  if (ask.length > 0) result.ask = ask;
  if (defaultMode) result.defaultMode = defaultMode;
  if (additionalDirectories.length > 0)
    result.additionalDirectories = additionalDirectories;
  return result;
}

/** Read a string value from raw settings. */
function readString(raw: Record<string, unknown>, key: string): string {
  const val = raw[key];
  return typeof val === "string" ? val : "";
}

/** Read a number value from raw settings. */
function readNumber(raw: Record<string, unknown>, key: string): number | null {
  const val = raw[key];
  return typeof val === "number" ? val : null;
}

/** Read a string array from raw settings. */
function readStringArray(raw: Record<string, unknown>, key: string): string[] {
  const val = raw[key];
  return Array.isArray(val)
    ? val.filter((s): s is string => typeof s === "string")
    : [];
}

/** Read nested attribution values. */
function readAttribution(raw: Record<string, unknown>): {
  commit: string;
  pr: string;
} {
  const attr = raw.attribution;
  if (!attr || typeof attr !== "object")
    return { commit: "", pr: "" };
  const a = attr as Record<string, unknown>;
  return {
    commit: typeof a.commit === "string" ? a.commit : "",
    pr: typeof a.pr === "string" ? a.pr : "",
  };
}

/** Read env key-value pairs (excluding managed toggle env vars). */
function readEnvVars(
  raw: Record<string, unknown>,
  managedKeys: Set<string>
): Record<string, string> {
  const env = raw.env;
  if (!env || typeof env !== "object") return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
    if (!managedKeys.has(k)) {
      result[k] = String(v);
    }
  }
  return result;
}

/** Keys managed by the form — excluded from the advanced JSON editor. */
const MANAGED_RAW_KEYS = new Set([
  "model",
  "permissions",
  "ignorePatterns",
  // Feature toggles (non-env)
  ...FEATURE_TOGGLES.filter((t) => !t.settingsPath.startsWith("env.")).map(
    (t) => t.settingsPath
  ),
  // General
  "language",
  "outputStyle",
  "availableModels",
  // Attribution
  "attribution",
  // MCP approval
  "enabledMcpjsonServers",
  "disabledMcpjsonServers",
  // Session & Updates
  "cleanupPeriodDays",
  "autoUpdatesChannel",
  "plansDirectory",
  "teammateMode",
  // Custom Scripts
  "apiKeyHelper",
  "otelHeadersHelper",
  "awsAuthRefresh",
  "awsCredentialExport",
  // Hook controls
  "allowedHttpHookUrls",
  "httpHookAllowedEnvVars",
  // env is partially managed
  "env",
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

function KeyValueEditor({
  entries,
  onUpdate,
  keyPlaceholder,
  valuePlaceholder,
}: {
  entries: Record<string, string>;
  onUpdate: (entries: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleAdd = () => {
    const k = newKey.trim();
    const v = newValue.trim();
    if (k) {
      onUpdate({ ...entries, [k]: v });
      setNewKey("");
      setNewValue("");
    }
  };

  const handleRemove = (key: string) => {
    const updated = { ...entries };
    delete updated[key];
    onUpdate(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const entryList = Object.entries(entries);

  return (
    <div className="kv-editor">
      {entryList.length > 0 ? (
        <div className="kv-list">
          {entryList.map(([k, v]) => (
            <div key={k} className="kv-entry">
              <code className="kv-key">{k}</code>
              <span className="kv-sep">=</span>
              <code className="kv-value">{v}</code>
              <button
                className="tag-remove"
                onClick={() => handleRemove(k)}
                aria-label={`Remove ${k}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      ) : (
        <span className="tag-empty">No environment variables set</span>
      )}
      <div className="kv-add-row">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={keyPlaceholder ?? "KEY"}
          className="kv-add-key"
        />
        <span className="kv-sep">=</span>
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={valuePlaceholder ?? "value"}
          className="kv-add-value"
        />
        <button
          className="btn btn-sm"
          onClick={handleAdd}
          disabled={!newKey.trim()}
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
  const [askTools, setAskTools] = useState<string[]>([]);
  const [permDefaultMode, setPermDefaultMode] = useState("");
  const [additionalDirs, setAdditionalDirs] = useState<string[]>([]);
  const [toggles, setToggles] = useState<Record<string, boolean | null>>({});
  const [advancedJson, setAdvancedJson] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // New settings state
  const [language, setLanguage] = useState("");
  const [outputStyle, setOutputStyle] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [attrCommit, setAttrCommit] = useState("");
  const [attrPr, setAttrPr] = useState("");
  const [enabledMcpServers, setEnabledMcpServers] = useState<string[]>([]);
  const [disabledMcpServers, setDisabledMcpServers] = useState<string[]>([]);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [cleanupPeriodDays, setCleanupPeriodDays] = useState<string>("");
  const [autoUpdatesChannel, setAutoUpdatesChannel] = useState("");
  const [plansDirectory, setPlansDirectory] = useState("");
  const [teammateMode, setTeammateMode] = useState("");
  const [apiKeyHelper, setApiKeyHelper] = useState("");
  const [otelHeadersHelper, setOtelHeadersHelper] = useState("");
  const [awsAuthRefresh, setAwsAuthRefresh] = useState("");
  const [awsCredentialExport, setAwsCredentialExport] = useState("");
  const [allowedHttpHookUrls, setAllowedHttpHookUrls] = useState<string[]>([]);
  const [httpHookAllowedEnvVars, setHttpHookAllowedEnvVars] = useState<string[]>([]);

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
    setAskTools(perms.ask);
    setPermDefaultMode(perms.defaultMode);
    setAdditionalDirs(perms.additionalDirectories);
    // Read toggle values from raw
    const raw = (config.raw ?? {}) as Record<string, unknown>;
    const toggleState: Record<string, boolean | null> = {};
    for (const toggle of FEATURE_TOGGLES) {
      toggleState[toggle.key] = readToggle(raw, toggle.settingsPath);
    }
    setToggles(toggleState);

    // New settings
    setLanguage(readString(raw, "language"));
    setOutputStyle(readString(raw, "outputStyle"));
    setAvailableModels(readStringArray(raw, "availableModels"));
    const attr = readAttribution(raw);
    setAttrCommit(attr.commit);
    setAttrPr(attr.pr);
    setEnabledMcpServers(readStringArray(raw, "enabledMcpjsonServers"));
    setDisabledMcpServers(readStringArray(raw, "disabledMcpjsonServers"));
    setEnvVars(readEnvVars(raw, MANAGED_ENV_KEYS));
    const cleanup = readNumber(raw, "cleanupPeriodDays");
    setCleanupPeriodDays(cleanup !== null ? String(cleanup) : "");
    setAutoUpdatesChannel(readString(raw, "autoUpdatesChannel"));
    setPlansDirectory(readString(raw, "plansDirectory"));
    setTeammateMode(readString(raw, "teammateMode"));
    setApiKeyHelper(readString(raw, "apiKeyHelper"));
    setOtelHeadersHelper(readString(raw, "otelHeadersHelper"));
    setAwsAuthRefresh(readString(raw, "awsAuthRefresh"));
    setAwsCredentialExport(readString(raw, "awsCredentialExport"));
    setAllowedHttpHookUrls(readStringArray(raw, "allowedHttpHookUrls"));
    setHttpHookAllowedEnvVars(readStringArray(raw, "httpHookAllowedEnvVars"));

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

  // -- Build raw for save/dirty --

  function buildRaw(): Record<string, unknown> {
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

    // General
    if (language) rawObj.language = language;
    if (outputStyle) rawObj.outputStyle = outputStyle;
    if (availableModels.length > 0) rawObj.availableModels = availableModels;

    // Attribution
    if (attrCommit || attrPr) {
      const attr: Record<string, string> = {};
      if (attrCommit) attr.commit = attrCommit;
      if (attrPr) attr.pr = attrPr;
      rawObj.attribution = attr;
    }

    // MCP approval
    if (enabledMcpServers.length > 0) rawObj.enabledMcpjsonServers = enabledMcpServers;
    if (disabledMcpServers.length > 0) rawObj.disabledMcpjsonServers = disabledMcpServers;

    // Environment variables (merge with managed env keys)
    if (Object.keys(envVars).length > 0) {
      const existingEnv =
        rawObj.env && typeof rawObj.env === "object"
          ? (rawObj.env as Record<string, unknown>)
          : {};
      rawObj.env = { ...existingEnv, ...envVars };
    }

    // Session & Updates
    if (cleanupPeriodDays !== "") {
      const num = Number(cleanupPeriodDays);
      if (!isNaN(num)) rawObj.cleanupPeriodDays = num;
    }
    if (autoUpdatesChannel) rawObj.autoUpdatesChannel = autoUpdatesChannel;
    if (plansDirectory) rawObj.plansDirectory = plansDirectory;
    if (teammateMode) rawObj.teammateMode = teammateMode;

    // Custom Scripts
    if (apiKeyHelper) rawObj.apiKeyHelper = apiKeyHelper;
    if (otelHeadersHelper) rawObj.otelHeadersHelper = otelHeadersHelper;
    if (awsAuthRefresh) rawObj.awsAuthRefresh = awsAuthRefresh;
    if (awsCredentialExport) rawObj.awsCredentialExport = awsCredentialExport;

    // Hook controls
    if (allowedHttpHookUrls.length > 0) rawObj.allowedHttpHookUrls = allowedHttpHookUrls;
    if (httpHookAllowedEnvVars.length > 0) rawObj.httpHookAllowedEnvVars = httpHookAllowedEnvVars;

    return rawObj;
  }

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

    // Permissions (expanded)
    const currentPerms = parsePermissions(
      buildPermissions(allowedTools, deniedTools, askTools, permDefaultMode, additionalDirs)
    );
    const savedPerms = parsePermissions(savedConfig.permissions);
    if (JSON.stringify(currentPerms) !== JSON.stringify(savedPerms)) return true;

    // Feature toggles
    const savedRaw = (savedConfig.raw ?? {}) as Record<string, unknown>;
    for (const toggle of FEATURE_TOGGLES) {
      const savedVal = readToggle(savedRaw, toggle.settingsPath);
      if (toggles[toggle.key] !== savedVal) return true;
    }

    // New general settings
    if (language !== readString(savedRaw, "language")) return true;
    if (outputStyle !== readString(savedRaw, "outputStyle")) return true;
    if (JSON.stringify(availableModels) !== JSON.stringify(readStringArray(savedRaw, "availableModels"))) return true;

    // Attribution
    const savedAttr = readAttribution(savedRaw);
    if (attrCommit !== savedAttr.commit) return true;
    if (attrPr !== savedAttr.pr) return true;

    // MCP approval
    if (JSON.stringify(enabledMcpServers) !== JSON.stringify(readStringArray(savedRaw, "enabledMcpjsonServers"))) return true;
    if (JSON.stringify(disabledMcpServers) !== JSON.stringify(readStringArray(savedRaw, "disabledMcpjsonServers"))) return true;

    // Env vars
    if (JSON.stringify(envVars) !== JSON.stringify(readEnvVars(savedRaw, MANAGED_ENV_KEYS))) return true;

    // Session & Updates
    const savedCleanup = readNumber(savedRaw, "cleanupPeriodDays");
    if (cleanupPeriodDays !== (savedCleanup !== null ? String(savedCleanup) : "")) return true;
    if (autoUpdatesChannel !== readString(savedRaw, "autoUpdatesChannel")) return true;
    if (plansDirectory !== readString(savedRaw, "plansDirectory")) return true;
    if (teammateMode !== readString(savedRaw, "teammateMode")) return true;

    // Custom Scripts
    if (apiKeyHelper !== readString(savedRaw, "apiKeyHelper")) return true;
    if (otelHeadersHelper !== readString(savedRaw, "otelHeadersHelper")) return true;
    if (awsAuthRefresh !== readString(savedRaw, "awsAuthRefresh")) return true;
    if (awsCredentialExport !== readString(savedRaw, "awsCredentialExport")) return true;

    // Hook controls
    if (JSON.stringify(allowedHttpHookUrls) !== JSON.stringify(readStringArray(savedRaw, "allowedHttpHookUrls"))) return true;
    if (JSON.stringify(httpHookAllowedEnvVars) !== JSON.stringify(readStringArray(savedRaw, "httpHookAllowedEnvVars"))) return true;

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
      const rawObj = buildRaw();

      const config: NormalizedConfig = {
        model: model || null,
        permissions: buildPermissions(allowedTools, deniedTools, askTools, permDefaultMode, additionalDirs),
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
        <p>Select a scope to manage settings.</p>
      </div>
    );
  }

  return (
    <div className="page config-page">
      {scope && <ScopeBanner scope={scope} />}
      <div className="page-header">
        <h2>
          Settings Studio <DocsLink page="settings" />
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

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>Language</label>
            <p className="config-field-hint">
              Language for Claude&apos;s responses (e.g. &quot;japanese&quot;, &quot;spanish&quot;, &quot;french&quot;).
            </p>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="Not set (defaults to English)"
            />
          </div>

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>Output Style</label>
            <p className="config-field-hint">
              Style hint for Claude&apos;s responses (e.g. &quot;Explanatory&quot;, &quot;Concise&quot;).
            </p>
            <input
              type="text"
              value={outputStyle}
              onChange={(e) => setOutputStyle(e.target.value)}
              placeholder="Not set"
            />
          </div>

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>Available Models</label>
            <p className="config-field-hint">
              Restrict which models are available for selection (e.g. &quot;sonnet&quot;, &quot;haiku&quot;).
            </p>
            <TagInput
              tags={availableModels}
              onAdd={(v) => setAvailableModels([...availableModels, v])}
              onRemove={(t) =>
                setAvailableModels(availableModels.filter((x) => x !== t))
              }
              placeholder="Add model name..."
              emptyLabel="All models available"
            />
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
              <label>Default Permission Mode</label>
            </div>
            <p className="config-field-hint">
              Default permission mode when Claude Code starts.
            </p>
            <select
              value={permDefaultMode}
              onChange={(e) => setPermDefaultMode(e.target.value)}
            >
              {PERMISSION_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="config-field" style={{ marginTop: 16 }}>
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
            <label>Ask Tools</label>
            <p className="config-field-hint">
              Tool patterns that require confirmation before use, e.g.{" "}
              <code>Bash(git push *)</code>
            </p>
            {isProject && globalPerms.ask.length > 0 && (
              <div className="inherited-tags">
                <span className="inherited-tags-label">From global (merged):</span>
                <div className="tag-list">
                  {globalPerms.ask.map((tag) => (
                    <span key={tag} className="tag tag-inherited">{tag}</span>
                  ))}
                </div>
              </div>
            )}
            <TagInput
              tags={askTools}
              onAdd={(v) => setAskTools([...askTools, v])}
              onRemove={(t) =>
                setAskTools(askTools.filter((x) => x !== t))
              }
              placeholder="Add ask pattern..."
              emptyLabel="No ask-confirmation patterns"
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

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>Additional Directories</label>
            <p className="config-field-hint">
              Extra directories Claude can access beyond the project root.
            </p>
            <TagInput
              tags={additionalDirs}
              onAdd={(v) => setAdditionalDirs([...additionalDirs, v])}
              onRemove={(t) =>
                setAdditionalDirs(additionalDirs.filter((x) => x !== t))
              }
              placeholder="Add directory path..."
              emptyLabel="No additional directories"
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

      {/* ── Attribution ── */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Attribution</h3>
        </div>
        <div className="config-section-body">
          <div className="config-field">
            <label>Commit Attribution</label>
            <p className="config-field-hint">
              Text appended to git commits made by Claude (e.g. Co-Authored-By header). Leave empty for default.
            </p>
            <textarea
              rows={3}
              value={attrCommit}
              onChange={(e) => setAttrCommit(e.target.value)}
              placeholder="e.g. Generated with AI&#10;&#10;Co-Authored-By: AI <ai@example.com>"
            />
          </div>
          <div className="config-field" style={{ marginTop: 16 }}>
            <label>PR Attribution</label>
            <p className="config-field-hint">
              Text appended to pull requests created by Claude. Set to empty string to hide.
            </p>
            <textarea
              rows={2}
              value={attrPr}
              onChange={(e) => setAttrPr(e.target.value)}
              placeholder="Not set (uses default)"
            />
          </div>
        </div>
      </div>

      {/* ── MCP Server Approval ── */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>MCP Server Approval</h3>
        </div>
        <div className="config-section-body">
          <div className="config-field">
            <label>Enabled MCP Servers</label>
            <p className="config-field-hint">
              Specific MCP servers to automatically approve by name.
            </p>
            <TagInput
              tags={enabledMcpServers}
              onAdd={(v) => setEnabledMcpServers([...enabledMcpServers, v])}
              onRemove={(t) =>
                setEnabledMcpServers(enabledMcpServers.filter((x) => x !== t))
              }
              placeholder="Add server name..."
              emptyLabel="No servers explicitly enabled"
            />
          </div>
          <div className="config-field" style={{ marginTop: 16 }}>
            <label>Disabled MCP Servers</label>
            <p className="config-field-hint">
              Specific MCP servers to automatically reject by name.
            </p>
            <TagInput
              tags={disabledMcpServers}
              onAdd={(v) => setDisabledMcpServers([...disabledMcpServers, v])}
              onRemove={(t) =>
                setDisabledMcpServers(disabledMcpServers.filter((x) => x !== t))
              }
              placeholder="Add server name..."
              emptyLabel="No servers explicitly disabled"
            />
          </div>
        </div>
      </div>

      {/* ── Environment Variables ── */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Environment Variables</h3>
        </div>
        <div className="config-section-body">
          <div className="config-field">
            <p className="config-field-hint">
              Environment variables set for Claude Code sessions.
            </p>
            <KeyValueEditor
              entries={envVars}
              onUpdate={setEnvVars}
              keyPlaceholder="VARIABLE_NAME"
              valuePlaceholder="value"
            />
          </div>
        </div>
      </div>

      {/* ── Session & Updates ── */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Session &amp; Updates</h3>
        </div>
        <div className="config-section-body">
          <div className="config-field">
            <label>Cleanup Period (days)</label>
            <p className="config-field-hint">
              Days before inactive sessions are deleted. Default is 30, set to 0 to disable.
            </p>
            <input
              type="number"
              min={0}
              value={cleanupPeriodDays}
              onChange={(e) => setCleanupPeriodDays(e.target.value)}
              placeholder="30"
              style={{ maxWidth: 200 }}
            />
          </div>

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>Auto-Updates Channel</label>
            <p className="config-field-hint">
              Release channel for automatic updates.
            </p>
            <select
              value={autoUpdatesChannel}
              onChange={(e) => setAutoUpdatesChannel(e.target.value)}
            >
              {AUTO_UPDATE_CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>Plans Directory</label>
            <p className="config-field-hint">
              Directory where plan files are stored (e.g. &quot;./plans&quot; or &quot;~/.claude/plans&quot;).
            </p>
            <input
              type="text"
              value={plansDirectory}
              onChange={(e) => setPlansDirectory(e.target.value)}
              placeholder="Not set (uses default)"
            />
          </div>

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>Teammate Mode</label>
            <p className="config-field-hint">
              How agent teams are displayed: auto, in-process, or tmux.
            </p>
            <select
              value={teammateMode}
              onChange={(e) => setTeammateMode(e.target.value)}
            >
              {TEAMMATE_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Custom Scripts ── */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Custom Scripts</h3>
        </div>
        <div className="config-section-body">
          <div className="config-field">
            <label>API Key Helper</label>
            <p className="config-field-hint">
              Script to generate authentication values dynamically.
            </p>
            <input
              type="text"
              value={apiKeyHelper}
              onChange={(e) => setApiKeyHelper(e.target.value)}
              placeholder="/path/to/generate_api_key.sh"
            />
          </div>

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>OTEL Headers Helper</label>
            <p className="config-field-hint">
              Script to generate OpenTelemetry headers.
            </p>
            <input
              type="text"
              value={otelHeadersHelper}
              onChange={(e) => setOtelHeadersHelper(e.target.value)}
              placeholder="/path/to/generate_otel_headers.sh"
            />
          </div>

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>AWS Auth Refresh</label>
            <p className="config-field-hint">
              Script to refresh AWS credentials (e.g. &quot;aws sso login --profile myprofile&quot;).
            </p>
            <input
              type="text"
              value={awsAuthRefresh}
              onChange={(e) => setAwsAuthRefresh(e.target.value)}
              placeholder="aws sso login --profile myprofile"
            />
          </div>

          <div className="config-field" style={{ marginTop: 16 }}>
            <label>AWS Credential Export</label>
            <p className="config-field-hint">
              Script that outputs AWS credentials JSON for Bedrock access.
            </p>
            <input
              type="text"
              value={awsCredentialExport}
              onChange={(e) => setAwsCredentialExport(e.target.value)}
              placeholder="/path/to/generate_aws_grant.sh"
            />
          </div>
        </div>
      </div>

      {/* ── Hook Controls ── */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Hook Controls</h3>
        </div>
        <div className="config-section-body">
          <div className="config-field">
            <label>Allowed HTTP Hook URLs</label>
            <p className="config-field-hint">
              URL patterns allowed for HTTP hooks (e.g. &quot;https://hooks.example.com/*&quot;).
            </p>
            <TagInput
              tags={allowedHttpHookUrls}
              onAdd={(v) => setAllowedHttpHookUrls([...allowedHttpHookUrls, v])}
              onRemove={(t) =>
                setAllowedHttpHookUrls(allowedHttpHookUrls.filter((x) => x !== t))
              }
              placeholder="Add URL pattern..."
              emptyLabel="No HTTP hook URLs allowed"
            />
          </div>
          <div className="config-field" style={{ marginTop: 16 }}>
            <label>HTTP Hook Allowed Env Vars</label>
            <p className="config-field-hint">
              Environment variable names that HTTP hooks can access.
            </p>
            <TagInput
              tags={httpHookAllowedEnvVars}
              onAdd={(v) => setHttpHookAllowedEnvVars([...httpHookAllowedEnvVars, v])}
              onRemove={(t) =>
                setHttpHookAllowedEnvVars(httpHookAllowedEnvVars.filter((x) => x !== t))
              }
              placeholder="Add env var name..."
              emptyLabel="No env vars exposed to HTTP hooks"
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
              Edit raw JSON for additional settings (e.g. sandbox, statusLine). Form
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
