import { useEffect, useState, useCallback, useMemo } from "react";
import type { Scope, NormalizedConfig } from "@/types";
import * as api from "@/lib/tauri";
import { ScopeBanner } from "@/components/ScopeGuard";
import { DocsLink } from "@/components/DocsLink";
import { useToast } from "@/components/Toast";
import { Section } from "@/components/Section";
import { TagInput } from "@/components/TagInput";
import { KeyValueEditor } from "@/components/KeyValueEditor";

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

const FORCE_LOGIN_OPTIONS = [
  { value: "", label: "Not set" },
  { value: "claudeai", label: "Claude.ai" },
  { value: "console", label: "Console (API)" },
];

const SPINNER_VERBS_MODE_OPTIONS = [
  { value: "append", label: "Append to defaults" },
  { value: "replace", label: "Replace defaults" },
];

// -- Feature Toggles --

interface FeatureToggleDef {
  key: string;
  label: string;
  description: string;
  settingsPath: string;
  defaultValue?: boolean;
}

const FEATURE_TOGGLES: FeatureToggleDef[] = [
  { key: "enableTeams", label: "Agent Teams (Experimental)", description: "Enable multi-agent team coordination.", settingsPath: "env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" },
  { key: "fastMode", label: "Fast Mode", description: "2.5x faster Opus output at higher per-token cost.", settingsPath: "fastMode" },
  { key: "alwaysThinkingEnabled", label: "Extended Thinking", description: "Enable extended thinking by default for all sessions.", settingsPath: "alwaysThinkingEnabled" },
  { key: "enableAllProjectMcpServers", label: "Auto-approve Project MCP Servers", description: "Automatically approve all MCP servers defined in the project.", settingsPath: "enableAllProjectMcpServers" },
  { key: "respectGitignore", label: "Respect .gitignore", description: "Exclude .gitignore patterns from @ file picker suggestions.", settingsPath: "respectGitignore", defaultValue: true },
  { key: "disableAllHooks", label: "Disable All Hooks", description: "Disable all hooks and statusLine execution globally.", settingsPath: "disableAllHooks" },
  { key: "showTurnDuration", label: "Show Turn Duration", description: "Display how long each turn takes in messages.", settingsPath: "showTurnDuration" },
  { key: "terminalProgressBarEnabled", label: "Terminal Progress Bar", description: "Show a progress bar in the terminal during operations.", settingsPath: "terminalProgressBarEnabled", defaultValue: true },
  { key: "spinnerTipsEnabled", label: "Spinner Tips", description: "Show tips in the spinner while Claude is working.", settingsPath: "spinnerTipsEnabled", defaultValue: true },
  { key: "prefersReducedMotion", label: "Reduced Motion", description: "Reduce UI animations for accessibility.", settingsPath: "prefersReducedMotion" },
  { key: "fastModePerSessionOptIn", label: "Fast Mode Per-Session Opt-In", description: "Require fast mode to be opted into each session.", settingsPath: "fastModePerSessionOptIn" },
];

// -- Toggle Helpers --

function readToggle(raw: Record<string, unknown>, path: string): boolean | null {
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

function writeToggle(raw: Record<string, unknown>, path: string, value: boolean | null) {
  if (path.startsWith("env.")) {
    const envKey = path.slice(4);
    if (value === null || value === false) {
      if (raw.env && typeof raw.env === "object") {
        const env = { ...(raw.env as Record<string, unknown>) };
        delete env[envKey];
        if (Object.keys(env).length === 0) delete raw.env;
        else raw.env = env;
      }
    } else {
      const env = (raw.env && typeof raw.env === "object" ? { ...(raw.env as Record<string, unknown>) } : {}) as Record<string, unknown>;
      env[envKey] = "1";
      raw.env = env;
    }
    return;
  }
  if (value === null || value === false) delete raw[path];
  else raw[path] = true;
}

// -- Data Helpers --

interface ParsedPermissions {
  allow: string[];
  deny: string[];
  ask: string[];
  defaultMode: string;
  additionalDirectories: string[];
  disableBypassPermissionsMode: string;
}

function parsePermissions(permissions: unknown): ParsedPermissions {
  if (!permissions || typeof permissions !== "object")
    return { allow: [], deny: [], ask: [], defaultMode: "", additionalDirectories: [], disableBypassPermissionsMode: "" };
  const p = permissions as Record<string, unknown>;
  return {
    allow: Array.isArray(p.allow) ? p.allow.filter((s): s is string => typeof s === "string") : [],
    deny: Array.isArray(p.deny) ? p.deny.filter((s): s is string => typeof s === "string") : [],
    ask: Array.isArray(p.ask) ? p.ask.filter((s): s is string => typeof s === "string") : [],
    defaultMode: typeof p.defaultMode === "string" ? p.defaultMode : "",
    additionalDirectories: Array.isArray(p.additionalDirectories) ? p.additionalDirectories.filter((s): s is string => typeof s === "string") : [],
    disableBypassPermissionsMode: typeof p.disableBypassPermissionsMode === "string" ? p.disableBypassPermissionsMode : "",
  };
}

function buildPermissions(p: ParsedPermissions): Record<string, unknown> | null {
  if (p.allow.length === 0 && p.deny.length === 0 && p.ask.length === 0 && !p.defaultMode && p.additionalDirectories.length === 0 && !p.disableBypassPermissionsMode) return null;
  const result: Record<string, unknown> = {};
  if (p.allow.length > 0) result.allow = p.allow;
  if (p.deny.length > 0) result.deny = p.deny;
  if (p.ask.length > 0) result.ask = p.ask;
  if (p.defaultMode) result.defaultMode = p.defaultMode;
  if (p.additionalDirectories.length > 0) result.additionalDirectories = p.additionalDirectories;
  if (p.disableBypassPermissionsMode) result.disableBypassPermissionsMode = p.disableBypassPermissionsMode;
  return result;
}

function readString(raw: Record<string, unknown>, key: string): string {
  const val = raw[key]; return typeof val === "string" ? val : "";
}
function readNumber(raw: Record<string, unknown>, key: string): number | null {
  const val = raw[key]; return typeof val === "number" ? val : null;
}
function readStringArray(raw: Record<string, unknown>, key: string): string[] {
  const val = raw[key]; return Array.isArray(val) ? val.filter((s): s is string => typeof s === "string") : [];
}
function readAttribution(raw: Record<string, unknown>): { commit: string; pr: string } {
  const attr = raw.attribution;
  if (!attr || typeof attr !== "object") return { commit: "", pr: "" };
  const a = attr as Record<string, unknown>;
  return { commit: typeof a.commit === "string" ? a.commit : "", pr: typeof a.pr === "string" ? a.pr : "" };
}

interface StatusLineState { command: string }
function readStatusLine(raw: Record<string, unknown>): StatusLineState {
  const sl = raw.statusLine;
  if (!sl || typeof sl !== "object") return { command: "" };
  return { command: typeof (sl as Record<string, unknown>).command === "string" ? (sl as Record<string, unknown>).command as string : "" };
}

interface FileSuggestionState { command: string }
function readFileSuggestion(raw: Record<string, unknown>): FileSuggestionState {
  const fs = raw.fileSuggestion;
  if (!fs || typeof fs !== "object") return { command: "" };
  return { command: typeof (fs as Record<string, unknown>).command === "string" ? (fs as Record<string, unknown>).command as string : "" };
}

interface SpinnerVerbsState { mode: string; verbs: string[] }
function readSpinnerVerbs(raw: Record<string, unknown>): SpinnerVerbsState {
  const sv = raw.spinnerVerbs;
  if (!sv || typeof sv !== "object") return { mode: "append", verbs: [] };
  const s = sv as Record<string, unknown>;
  return { mode: typeof s.mode === "string" ? s.mode : "append", verbs: Array.isArray(s.verbs) ? s.verbs.filter((v): v is string => typeof v === "string") : [] };
}

interface SpinnerTipsState { excludeDefault: boolean; tips: string[] }
function readSpinnerTips(raw: Record<string, unknown>): SpinnerTipsState {
  const st = raw.spinnerTipsOverride;
  if (!st || typeof st !== "object") return { excludeDefault: false, tips: [] };
  const s = st as Record<string, unknown>;
  return { excludeDefault: !!s.excludeDefault, tips: Array.isArray(s.tips) ? s.tips.filter((t): t is string => typeof t === "string") : [] };
}

interface SandboxState {
  enabled: boolean | null; autoAllow: boolean | null; excludedCommands: string[];
  allowUnsandboxed: boolean | null; enableWeakerNested: boolean | null;
  fsAllowWrite: string[]; fsDenyWrite: string[]; fsDenyRead: string[];
  netAllowUnixSockets: string[]; netAllowAllUnixSockets: boolean | null;
  netAllowLocalBinding: boolean | null; netAllowedDomains: string[];
}
function readSandbox(raw: Record<string, unknown>): SandboxState {
  const empty: SandboxState = { enabled: null, autoAllow: null, excludedCommands: [], allowUnsandboxed: null, enableWeakerNested: null, fsAllowWrite: [], fsDenyWrite: [], fsDenyRead: [], netAllowUnixSockets: [], netAllowAllUnixSockets: null, netAllowLocalBinding: null, netAllowedDomains: [] };
  const sb = raw.sandbox;
  if (!sb || typeof sb !== "object") return empty;
  const s = sb as Record<string, unknown>;
  const fs = (s.filesystem && typeof s.filesystem === "object" ? s.filesystem : {}) as Record<string, unknown>;
  const net = (s.network && typeof s.network === "object" ? s.network : {}) as Record<string, unknown>;
  return {
    enabled: "enabled" in s ? !!s.enabled : null,
    autoAllow: "autoAllowBashIfSandboxed" in s ? !!s.autoAllowBashIfSandboxed : null,
    excludedCommands: readStringArray(s, "excludedCommands"),
    allowUnsandboxed: "allowUnsandboxedCommands" in s ? !!s.allowUnsandboxedCommands : null,
    enableWeakerNested: "enableWeakerNestedSandbox" in s ? !!s.enableWeakerNestedSandbox : null,
    fsAllowWrite: readStringArray(fs, "allowWrite"), fsDenyWrite: readStringArray(fs, "denyWrite"), fsDenyRead: readStringArray(fs, "denyRead"),
    netAllowUnixSockets: readStringArray(net, "allowUnixSockets"),
    netAllowAllUnixSockets: "allowAllUnixSockets" in net ? !!net.allowAllUnixSockets : null,
    netAllowLocalBinding: "allowLocalBinding" in net ? !!net.allowLocalBinding : null,
    netAllowedDomains: readStringArray(net, "allowedDomains"),
  };
}
function buildSandbox(s: SandboxState): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  if (s.enabled !== null) result.enabled = s.enabled;
  if (s.autoAllow !== null) result.autoAllowBashIfSandboxed = s.autoAllow;
  if (s.excludedCommands.length > 0) result.excludedCommands = s.excludedCommands;
  if (s.allowUnsandboxed !== null) result.allowUnsandboxedCommands = s.allowUnsandboxed;
  if (s.enableWeakerNested !== null) result.enableWeakerNestedSandbox = s.enableWeakerNested;
  const fs: Record<string, unknown> = {};
  if (s.fsAllowWrite.length > 0) fs.allowWrite = s.fsAllowWrite;
  if (s.fsDenyWrite.length > 0) fs.denyWrite = s.fsDenyWrite;
  if (s.fsDenyRead.length > 0) fs.denyRead = s.fsDenyRead;
  if (Object.keys(fs).length > 0) result.filesystem = fs;
  const net: Record<string, unknown> = {};
  if (s.netAllowUnixSockets.length > 0) net.allowUnixSockets = s.netAllowUnixSockets;
  if (s.netAllowAllUnixSockets !== null) net.allowAllUnixSockets = s.netAllowAllUnixSockets;
  if (s.netAllowLocalBinding !== null) net.allowLocalBinding = s.netAllowLocalBinding;
  if (s.netAllowedDomains.length > 0) net.allowedDomains = s.netAllowedDomains;
  if (Object.keys(net).length > 0) result.network = net;
  return Object.keys(result).length === 0 ? null : result;
}

function readEnvVars(raw: Record<string, unknown>, managedKeys: Set<string>): Record<string, string> {
  const env = raw.env;
  if (!env || typeof env !== "object") return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
    if (!managedKeys.has(k)) result[k] = String(v);
  }
  return result;
}

const MANAGED_ENV_KEYS = new Set(
  FEATURE_TOGGLES.filter((t) => t.settingsPath.startsWith("env.")).map((t) => t.settingsPath.slice(4))
);

const MANAGED_RAW_KEYS = new Set([
  "model", "permissions", "ignorePatterns",
  ...FEATURE_TOGGLES.filter((t) => !t.settingsPath.startsWith("env.")).map((t) => t.settingsPath),
  "language", "outputStyle", "availableModels",
  "attribution", "enabledMcpjsonServers", "disabledMcpjsonServers",
  "cleanupPeriodDays", "autoUpdatesChannel", "plansDirectory", "teammateMode",
  "apiKeyHelper", "otelHeadersHelper", "awsAuthRefresh", "awsCredentialExport",
  "allowedHttpHookUrls", "httpHookAllowedEnvVars",
  "statusLine", "fileSuggestion", "spinnerVerbs", "spinnerTipsOverride",
  "sandbox", "forceLoginMethod", "forceLoginOrgUUID", "companyAnnouncements",
  "env",
]);

function getExtraRawFields(raw: Record<string, unknown>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!MANAGED_RAW_KEYS.has(key)) extra[key] = value;
  }
  return extra;
}

function modelLabel(modelId: string | null): string | null {
  if (!modelId) return null;
  return MODEL_OPTIONS.find((o) => o.value === modelId)?.label ?? modelId;
}

// -- Search-matching metadata for each section --
// Maps section titles to keywords that help the filter match fields inside them.

const SECTION_KEYWORDS: Record<string, string[]> = {
  "General": ["model", "language", "output style", "available models"],
  "Feature Toggles": FEATURE_TOGGLES.map((t) => t.label.toLowerCase()),
  "Permissions": ["allow", "deny", "ask", "default mode", "bypass", "additional directories", "tools"],
  "File Patterns": ["ignore", "gitignore", "patterns"],
  "UI Customization": ["status line", "statusline", "file suggestion", "autocomplete", "spinner", "verbs", "tips"],
  "Attribution": ["commit", "pull request", "pr", "co-authored"],
  "MCP Server Approval": ["mcp", "enabled", "disabled", "server"],
  "Environment Variables": ["env", "environment", "variable"],
  "Session & Login": ["cleanup", "auto-update", "plans", "teammate", "login", "org", "announcements", "enterprise"],
  "Scripts & Hooks": ["api key", "otel", "aws", "credential", "http hook", "url", "script"],
  "Sandbox": ["sandbox", "filesystem", "network", "domain", "unix socket", "write", "read"],
  "Advanced (JSON)": ["json", "raw", "advanced"],
};

// -- Sub-components --

function SourceBadge({ source, globalHint }: { source: "global" | "project" | "default"; globalHint?: string | null }) {
  if (source === "global") {
    return (
      <span className="source-badge source-inherited">
        Inherited from global
        {globalHint && <span className="source-value" title={globalHint}> ({globalHint})</span>}
      </span>
    );
  }
  if (source === "project") return <span className="source-badge source-override">Project override</span>;
  return null;
}

function SandboxToggle({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-label">
      <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// -- Main Component --

export function ConfigPage({ scope }: Props) {
  const toast = useToast();
  const [savedConfig, setSavedConfig] = useState<NormalizedConfig>(EMPTY_CONFIG);
  const [globalConfig, setGlobalConfig] = useState<NormalizedConfig>(EMPTY_CONFIG);

  // Form state
  const [model, setModel] = useState("");
  const [ignorePatterns, setIgnorePatterns] = useState<string[]>([]);
  const [perms, setPerms] = useState<ParsedPermissions>({ allow: [], deny: [], ask: [], defaultMode: "", additionalDirectories: [], disableBypassPermissionsMode: "" });
  const [toggles, setToggles] = useState<Record<string, boolean | null>>({});
  const [advancedJson, setAdvancedJson] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);
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
  const [statusLine, setStatusLine] = useState<StatusLineState>({ command: "" });
  const [fileSuggestion, setFileSuggestion] = useState<FileSuggestionState>({ command: "" });
  const [spinnerVerbs, setSpinnerVerbs] = useState<SpinnerVerbsState>({ mode: "append", verbs: [] });
  const [spinnerTips, setSpinnerTips] = useState<SpinnerTipsState>({ excludeDefault: false, tips: [] });
  const [sandbox, setSandbox] = useState<SandboxState>(readSandbox({}));
  const [forceLoginMethod, setForceLoginMethod] = useState("");
  const [forceLoginOrgUUID, setForceLoginOrgUUID] = useState("");
  const [companyAnnouncements, setCompanyAnnouncements] = useState<string[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [homePath, setHomePath] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  const isProject = scope?.type === "project";
  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;

  useEffect(() => { api.getClaudeHome().then(setHomePath).catch(() => {}); }, []);

  const populateForm = useCallback((config: NormalizedConfig) => {
    setModel(config.model ?? "");
    setIgnorePatterns(config.ignorePatterns ?? []);
    setPerms(parsePermissions(config.permissions));
    const raw = (config.raw ?? {}) as Record<string, unknown>;
    const toggleState: Record<string, boolean | null> = {};
    for (const toggle of FEATURE_TOGGLES) toggleState[toggle.key] = readToggle(raw, toggle.settingsPath);
    setToggles(toggleState);
    setLanguage(readString(raw, "language"));
    setOutputStyle(readString(raw, "outputStyle"));
    setAvailableModels(readStringArray(raw, "availableModels"));
    const attr = readAttribution(raw);
    setAttrCommit(attr.commit); setAttrPr(attr.pr);
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
    setStatusLine(readStatusLine(raw));
    setFileSuggestion(readFileSuggestion(raw));
    setSpinnerVerbs(readSpinnerVerbs(raw));
    setSpinnerTips(readSpinnerTips(raw));
    setSandbox(readSandbox(raw));
    setForceLoginMethod(readString(raw, "forceLoginMethod"));
    setForceLoginOrgUUID(readString(raw, "forceLoginOrgUUID"));
    setCompanyAnnouncements(readStringArray(raw, "companyAnnouncements"));
    const extra = getExtraRawFields(raw);
    setAdvancedJson(Object.keys(extra).length > 0 ? JSON.stringify(extra, null, 2) : "{}");
    setJsonError(null);
  }, []);

  useEffect(() => {
    if (!basePath) return;
    let cancelled = false;
    (async () => {
      try {
        const config = await api.readClaudeConfig(basePath);
        if (cancelled) return;
        setSavedConfig(config); populateForm(config);
      } catch {
        if (cancelled) return;
        setSavedConfig(EMPTY_CONFIG); populateForm(EMPTY_CONFIG);
      }
      if (isProject && homePath && homePath !== basePath) {
        try { const gc = await api.readClaudeConfig(homePath); if (!cancelled) setGlobalConfig(gc); }
        catch { if (!cancelled) setGlobalConfig(EMPTY_CONFIG); }
      }
    })();
    return () => { cancelled = true; };
  }, [basePath, isProject, homePath, populateForm]);

  // -- Build raw --

  function buildRaw(): Record<string, unknown> {
    let rawObj: Record<string, unknown> = {};
    try { rawObj = JSON.parse(advancedJson); } catch { /* keep empty */ }
    for (const toggle of FEATURE_TOGGLES) writeToggle(rawObj, toggle.settingsPath, toggles[toggle.key] ?? null);
    if (language) rawObj.language = language;
    if (outputStyle) rawObj.outputStyle = outputStyle;
    if (availableModels.length > 0) rawObj.availableModels = availableModels;
    if (attrCommit || attrPr) {
      const attr: Record<string, string> = {};
      if (attrCommit) attr.commit = attrCommit;
      if (attrPr) attr.pr = attrPr;
      rawObj.attribution = attr;
    }
    if (enabledMcpServers.length > 0) rawObj.enabledMcpjsonServers = enabledMcpServers;
    if (disabledMcpServers.length > 0) rawObj.disabledMcpjsonServers = disabledMcpServers;
    if (Object.keys(envVars).length > 0) {
      const existingEnv = rawObj.env && typeof rawObj.env === "object" ? (rawObj.env as Record<string, unknown>) : {};
      rawObj.env = { ...existingEnv, ...envVars };
    }
    if (cleanupPeriodDays !== "") { const num = Number(cleanupPeriodDays); if (!isNaN(num)) rawObj.cleanupPeriodDays = num; }
    if (autoUpdatesChannel) rawObj.autoUpdatesChannel = autoUpdatesChannel;
    if (plansDirectory) rawObj.plansDirectory = plansDirectory;
    if (teammateMode) rawObj.teammateMode = teammateMode;
    if (apiKeyHelper) rawObj.apiKeyHelper = apiKeyHelper;
    if (otelHeadersHelper) rawObj.otelHeadersHelper = otelHeadersHelper;
    if (awsAuthRefresh) rawObj.awsAuthRefresh = awsAuthRefresh;
    if (awsCredentialExport) rawObj.awsCredentialExport = awsCredentialExport;
    if (allowedHttpHookUrls.length > 0) rawObj.allowedHttpHookUrls = allowedHttpHookUrls;
    if (httpHookAllowedEnvVars.length > 0) rawObj.httpHookAllowedEnvVars = httpHookAllowedEnvVars;
    if (statusLine.command) rawObj.statusLine = { type: "command", command: statusLine.command };
    if (fileSuggestion.command) rawObj.fileSuggestion = { type: "command", command: fileSuggestion.command };
    if (spinnerVerbs.verbs.length > 0) rawObj.spinnerVerbs = { mode: spinnerVerbs.mode, verbs: spinnerVerbs.verbs };
    if (spinnerTips.tips.length > 0) rawObj.spinnerTipsOverride = { excludeDefault: spinnerTips.excludeDefault, tips: spinnerTips.tips };
    const sandboxObj = buildSandbox(sandbox);
    if (sandboxObj) rawObj.sandbox = sandboxObj;
    if (forceLoginMethod) rawObj.forceLoginMethod = forceLoginMethod;
    if (forceLoginOrgUUID) rawObj.forceLoginOrgUUID = forceLoginOrgUUID;
    if (companyAnnouncements.length > 0) rawObj.companyAnnouncements = companyAnnouncements;
    return rawObj;
  }

  // -- Dirty checking --

  const isDirty = (() => {
    if ((model || null) !== (savedConfig.model ?? null)) return true;
    if (JSON.stringify(ignorePatterns.length > 0 ? ignorePatterns : null) !== JSON.stringify(savedConfig.ignorePatterns ?? null)) return true;
    if (JSON.stringify(perms) !== JSON.stringify(parsePermissions(savedConfig.permissions))) return true;
    const savedRaw = (savedConfig.raw ?? {}) as Record<string, unknown>;
    for (const toggle of FEATURE_TOGGLES) { if (toggles[toggle.key] !== readToggle(savedRaw, toggle.settingsPath)) return true; }
    if (language !== readString(savedRaw, "language")) return true;
    if (outputStyle !== readString(savedRaw, "outputStyle")) return true;
    if (JSON.stringify(availableModels) !== JSON.stringify(readStringArray(savedRaw, "availableModels"))) return true;
    const savedAttr = readAttribution(savedRaw);
    if (attrCommit !== savedAttr.commit || attrPr !== savedAttr.pr) return true;
    if (JSON.stringify(enabledMcpServers) !== JSON.stringify(readStringArray(savedRaw, "enabledMcpjsonServers"))) return true;
    if (JSON.stringify(disabledMcpServers) !== JSON.stringify(readStringArray(savedRaw, "disabledMcpjsonServers"))) return true;
    if (JSON.stringify(envVars) !== JSON.stringify(readEnvVars(savedRaw, MANAGED_ENV_KEYS))) return true;
    const savedCleanup = readNumber(savedRaw, "cleanupPeriodDays");
    if (cleanupPeriodDays !== (savedCleanup !== null ? String(savedCleanup) : "")) return true;
    if (autoUpdatesChannel !== readString(savedRaw, "autoUpdatesChannel")) return true;
    if (plansDirectory !== readString(savedRaw, "plansDirectory")) return true;
    if (teammateMode !== readString(savedRaw, "teammateMode")) return true;
    if (apiKeyHelper !== readString(savedRaw, "apiKeyHelper")) return true;
    if (otelHeadersHelper !== readString(savedRaw, "otelHeadersHelper")) return true;
    if (awsAuthRefresh !== readString(savedRaw, "awsAuthRefresh")) return true;
    if (awsCredentialExport !== readString(savedRaw, "awsCredentialExport")) return true;
    if (JSON.stringify(allowedHttpHookUrls) !== JSON.stringify(readStringArray(savedRaw, "allowedHttpHookUrls"))) return true;
    if (JSON.stringify(httpHookAllowedEnvVars) !== JSON.stringify(readStringArray(savedRaw, "httpHookAllowedEnvVars"))) return true;
    if (JSON.stringify(statusLine) !== JSON.stringify(readStatusLine(savedRaw))) return true;
    if (JSON.stringify(fileSuggestion) !== JSON.stringify(readFileSuggestion(savedRaw))) return true;
    if (JSON.stringify(spinnerVerbs) !== JSON.stringify(readSpinnerVerbs(savedRaw))) return true;
    if (JSON.stringify(spinnerTips) !== JSON.stringify(readSpinnerTips(savedRaw))) return true;
    if (JSON.stringify(sandbox) !== JSON.stringify(readSandbox(savedRaw))) return true;
    if (forceLoginMethod !== readString(savedRaw, "forceLoginMethod")) return true;
    if (forceLoginOrgUUID !== readString(savedRaw, "forceLoginOrgUUID")) return true;
    if (JSON.stringify(companyAnnouncements) !== JSON.stringify(readStringArray(savedRaw, "companyAnnouncements"))) return true;
    try { if (JSON.stringify(JSON.parse(advancedJson)) !== JSON.stringify(getExtraRawFields(savedRaw))) return true; } catch { return true; }
    return false;
  })();

  // -- Save / Discard --

  const handleSave = async () => {
    if (!basePath) return;
    setSaving(true);
    try {
      const config: NormalizedConfig = {
        model: model || null,
        permissions: buildPermissions(perms),
        ignorePatterns: ignorePatterns.length > 0 ? ignorePatterns : null,
        raw: buildRaw(),
      };
      await api.writeClaudeConfig(basePath, config);
      const reloaded = await api.readClaudeConfig(basePath);
      setSavedConfig(reloaded); populateForm(reloaded);
    } catch (e) {
      toast.error("Failed to save config", String(e));
    } finally { setSaving(false); }
  };

  const handleDiscard = () => { populateForm(savedConfig); };

  // -- Search filter --

  const filterLower = searchFilter.toLowerCase().trim();

  const sectionMatch = useMemo(() => {
    if (!filterLower) return null; // null = no filter active
    const matches: Record<string, boolean> = {};
    for (const [title, keywords] of Object.entries(SECTION_KEYWORDS)) {
      matches[title] = title.toLowerCase().includes(filterLower) || keywords.some((kw) => kw.includes(filterLower));
    }
    return matches;
  }, [filterLower]);

  function sectionVisible(title: string): boolean {
    return sectionMatch === null || sectionMatch[title] === true;
  }

  function sectionForceOpen(title: string): boolean | undefined {
    return sectionMatch !== null && sectionMatch[title] ? true : undefined;
  }

  // -- Section "has values" indicators --

  const sectionValues = useMemo(() => {
    const raw = (savedConfig.raw ?? {}) as Record<string, unknown>;
    const hasGeneral = !!(savedConfig.model || readString(raw, "language") || readString(raw, "outputStyle") || readStringArray(raw, "availableModels").length > 0);
    const hasToggles = FEATURE_TOGGLES.some((t) => readToggle(raw, t.settingsPath) !== null);
    const pp = parsePermissions(savedConfig.permissions);
    const hasPerms = !!(pp.allow.length || pp.deny.length || pp.ask.length || pp.defaultMode || pp.additionalDirectories.length || pp.disableBypassPermissionsMode);
    const hasFilePatterns = !!(savedConfig.ignorePatterns && savedConfig.ignorePatterns.length > 0);
    const sl = readStatusLine(raw); const fs = readFileSuggestion(raw); const sv = readSpinnerVerbs(raw); const st = readSpinnerTips(raw);
    const hasUi = !!(sl.command || fs.command || sv.verbs.length > 0 || st.tips.length > 0);
    const attr = readAttribution(raw);
    const hasAttr = !!(attr.commit || attr.pr);
    const hasMcp = !!(readStringArray(raw, "enabledMcpjsonServers").length > 0 || readStringArray(raw, "disabledMcpjsonServers").length > 0);
    const hasEnv = Object.keys(readEnvVars(raw, MANAGED_ENV_KEYS)).length > 0;
    const hasSession = !!(readNumber(raw, "cleanupPeriodDays") !== null || readString(raw, "autoUpdatesChannel") || readString(raw, "plansDirectory") || readString(raw, "teammateMode") || readString(raw, "forceLoginMethod") || readString(raw, "forceLoginOrgUUID") || readStringArray(raw, "companyAnnouncements").length > 0);
    const hasScripts = !!(readString(raw, "apiKeyHelper") || readString(raw, "otelHeadersHelper") || readString(raw, "awsAuthRefresh") || readString(raw, "awsCredentialExport") || readStringArray(raw, "allowedHttpHookUrls").length > 0 || readStringArray(raw, "httpHookAllowedEnvVars").length > 0);
    const hasSandbox = buildSandbox(readSandbox(raw)) !== null;
    const hasAdvanced = Object.keys(getExtraRawFields(raw)).length > 0;
    return {
      "General": hasGeneral, "Feature Toggles": hasToggles, "Permissions": hasPerms,
      "File Patterns": hasFilePatterns, "UI Customization": hasUi, "Attribution": hasAttr,
      "MCP Server Approval": hasMcp, "Environment Variables": hasEnv, "Session & Login": hasSession,
      "Scripts & Hooks": hasScripts, "Sandbox": hasSandbox, "Advanced (JSON)": hasAdvanced,
    };
  }, [savedConfig]);

  // -- Hierarchy helpers --

  const globalPerms = parsePermissions(globalConfig.permissions);

  function fieldSource(fieldName: "model" | "ignorePatterns" | "permissions"): "global" | "project" | "default" {
    if (!isProject) return "default";
    const sv = savedConfig[fieldName];
    if (sv != null && (Array.isArray(sv) ? sv.length > 0 : true)) return "project";
    const gv = globalConfig[fieldName];
    if (gv != null && (Array.isArray(gv) ? gv.length > 0 : true)) return "global";
    return "default";
  }

  function globalHint(fieldName: "model" | "ignorePatterns" | "permissions"): string | null {
    if (fieldName === "model") return modelLabel(globalConfig.model);
    if (fieldName === "ignorePatterns") return globalConfig.ignorePatterns?.join(", ") ?? null;
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
    return <div className="page page-empty"><p>Select a scope to manage settings.</p></div>;
  }

  return (
    <div className="page config-page">
      {scope && <ScopeBanner scope={scope} />}
      <div className="page-header">
        <h2>Settings <DocsLink page="settings" /></h2>
      </div>
      <p className="page-description">
        Project and global settings for Claude Code, including the default
        model, permission rules, and file ignore patterns.
      </p>

      {/* Search filter */}
      <div className="settings-search">
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter settings..."
          className="settings-search-input"
          aria-label="Filter settings"
        />
        {searchFilter && (
          <button className="settings-search-clear" onClick={() => setSearchFilter("")} aria-label="Clear filter">&times;</button>
        )}
      </div>

      {/* ── General ── */}
      <Section title="General" defaultOpen hidden={!sectionVisible("General")} forceOpen={sectionForceOpen("General")} hasValues={sectionValues["General"]}>
        <div className="config-field">
          <div className="config-field-header">
            <label>Default Model</label>
            {isProject && fieldSource("model") !== "default" && <SourceBadge source={fieldSource("model")} globalHint={globalHint("model")} />}
          </div>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODEL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          {isProject && !model && globalConfig.model && <p className="config-field-hint">Using global setting: {modelLabel(globalConfig.model)}</p>}
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Language</label>
          <p className="config-field-hint">Language for Claude&apos;s responses (e.g. &quot;japanese&quot;, &quot;spanish&quot;).</p>
          <input type="text" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Not set (defaults to English)" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Output Style</label>
          <p className="config-field-hint">Style hint for Claude&apos;s responses (e.g. &quot;Explanatory&quot;, &quot;Concise&quot;).</p>
          <input type="text" value={outputStyle} onChange={(e) => setOutputStyle(e.target.value)} placeholder="Not set" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Available Models</label>
          <p className="config-field-hint">Restrict which models are available for selection.</p>
          <TagInput tags={availableModels} onAdd={(v) => setAvailableModels([...availableModels, v])} onRemove={(t) => setAvailableModels(availableModels.filter((x) => x !== t))} placeholder="Add model name..." emptyLabel="All models available" />
        </div>
      </Section>

      {/* ── Feature Toggles ── */}
      <Section title="Feature Toggles" defaultOpen hidden={!sectionVisible("Feature Toggles")} forceOpen={sectionForceOpen("Feature Toggles")} hasValues={sectionValues["Feature Toggles"]}>
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
                <input type="checkbox" checked={inheritedFromGlobal ? !!globalVal : isOn}
                  onChange={(e) => setToggles((prev) => ({ ...prev, [toggle.key]: e.target.checked }))}
                  className={inheritedFromGlobal ? "inherited-toggle" : ""} />
                <span>{toggle.label}</span>
                {inheritedFromGlobal && <span className="source-badge source-inherited">Inherited from global ({globalVal ? "on" : "off"})</span>}
                {toggle.defaultValue !== undefined && !isExplicit && !inheritedFromGlobal && <span className="toggle-default">(default: {toggle.defaultValue ? "on" : "off"})</span>}
              </label>
              <p className="config-field-hint">{toggle.description}</p>
            </div>
          );
        })}
      </Section>

      {/* ── Permissions ── */}
      <Section title="Permissions" hint={isProject && (globalPerms.allow.length > 0 || globalPerms.deny.length > 0) ? "Arrays merge across scopes" : undefined} hidden={!sectionVisible("Permissions")} forceOpen={sectionForceOpen("Permissions")} hasValues={sectionValues["Permissions"]}>
        <div className="config-field">
          <label>Default Permission Mode</label>
          <p className="config-field-hint">Default permission mode when Claude Code starts.</p>
          <select value={perms.defaultMode} onChange={(e) => setPerms({ ...perms, defaultMode: e.target.value })}>
            {PERMISSION_MODE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Disable Bypass Permissions Mode</label>
          <p className="config-field-hint">Set to &quot;disable&quot; to prevent users from using bypass permissions mode.</p>
          <input type="text" value={perms.disableBypassPermissionsMode} onChange={(e) => setPerms({ ...perms, disableBypassPermissionsMode: e.target.value })} placeholder="Not set" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Allowed Tools</label>
          <p className="config-field-hint">Tool patterns Claude can use without asking, e.g. <code>Bash(npm test:*)</code></p>
          {isProject && globalPerms.allow.length > 0 && (
            <div className="inherited-tags"><span className="inherited-tags-label">From global (merged):</span>
              <div className="tag-list">{globalPerms.allow.map((tag) => <span key={tag} className="tag tag-inherited">{tag}</span>)}</div>
            </div>
          )}
          <TagInput tags={perms.allow} onAdd={(v) => setPerms({ ...perms, allow: [...perms.allow, v] })} onRemove={(t) => setPerms({ ...perms, allow: perms.allow.filter((x) => x !== t) })} placeholder="Add tool pattern..." />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Ask Tools</label>
          <p className="config-field-hint">Tool patterns that require confirmation before use.</p>
          <TagInput tags={perms.ask} onAdd={(v) => setPerms({ ...perms, ask: [...perms.ask, v] })} onRemove={(t) => setPerms({ ...perms, ask: perms.ask.filter((x) => x !== t) })} placeholder="Add ask pattern..." />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Denied Tools</label>
          <p className="config-field-hint">Tool patterns Claude should never use.</p>
          <TagInput tags={perms.deny} onAdd={(v) => setPerms({ ...perms, deny: [...perms.deny, v] })} onRemove={(t) => setPerms({ ...perms, deny: perms.deny.filter((x) => x !== t) })} placeholder="Add denied pattern..." />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Additional Directories</label>
          <p className="config-field-hint">Extra directories Claude can access beyond the project root.</p>
          <TagInput tags={perms.additionalDirectories} onAdd={(v) => setPerms({ ...perms, additionalDirectories: [...perms.additionalDirectories, v] })} onRemove={(t) => setPerms({ ...perms, additionalDirectories: perms.additionalDirectories.filter((x) => x !== t) })} placeholder="Add directory path..." />
        </div>
      </Section>

      {/* ── File Patterns ── */}
      <Section title="File Patterns" hint={isProject && globalConfig.ignorePatterns && globalConfig.ignorePatterns.length > 0 ? "Arrays merge across scopes" : undefined} hidden={!sectionVisible("File Patterns")} forceOpen={sectionForceOpen("File Patterns")} hasValues={sectionValues["File Patterns"]}>
        <div className="config-field">
          <label>Ignore Patterns</label>
          <p className="config-field-hint">Files and directories Claude should ignore during operations.</p>
          <TagInput tags={ignorePatterns} onAdd={(v) => setIgnorePatterns([...ignorePatterns, v])} onRemove={(t) => setIgnorePatterns(ignorePatterns.filter((x) => x !== t))} placeholder="Add pattern..." />
        </div>
      </Section>

      {/* ── UI Customization (merged: Status Line + File Suggestion + Spinner) ── */}
      <Section title="UI Customization" hidden={!sectionVisible("UI Customization")} forceOpen={sectionForceOpen("UI Customization")} hasValues={sectionValues["UI Customization"]}>
        <div className="config-field">
          <label>Status Line Command</label>
          <p className="config-field-hint">Path to a script that generates your terminal status line. Receives session data as JSON on stdin.</p>
          <input type="text" value={statusLine.command} onChange={(e) => setStatusLine({ command: e.target.value })} placeholder="~/.claude/statusline.sh" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>File Suggestion Command</label>
          <p className="config-field-hint">Path to a script that provides custom file autocomplete suggestions for the @ picker.</p>
          <input type="text" value={fileSuggestion.command} onChange={(e) => setFileSuggestion({ command: e.target.value })} placeholder="~/.claude/file-suggestion.sh" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Custom Spinner Verbs</label>
          <p className="config-field-hint">Customize the action verbs shown in the spinner while Claude is working.</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <label style={{ fontSize: 13 }}>Mode:</label>
            <select value={spinnerVerbs.mode} onChange={(e) => setSpinnerVerbs({ ...spinnerVerbs, mode: e.target.value })} style={{ maxWidth: 200 }}>
              {SPINNER_VERBS_MODE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <TagInput tags={spinnerVerbs.verbs} onAdd={(v) => setSpinnerVerbs({ ...spinnerVerbs, verbs: [...spinnerVerbs.verbs, v] })} onRemove={(t) => setSpinnerVerbs({ ...spinnerVerbs, verbs: spinnerVerbs.verbs.filter((x) => x !== t) })} placeholder="Add verb (e.g. Pondering)..." emptyLabel="Using default verbs" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Custom Spinner Tips</label>
          <p className="config-field-hint">Override or extend the tips shown in the spinner.</p>
          <label className="toggle-label" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={spinnerTips.excludeDefault} onChange={(e) => setSpinnerTips({ ...spinnerTips, excludeDefault: e.target.checked })} />
            <span>Exclude default tips (show only custom tips)</span>
          </label>
          <TagInput tags={spinnerTips.tips} onAdd={(v) => setSpinnerTips({ ...spinnerTips, tips: [...spinnerTips.tips, v] })} onRemove={(t) => setSpinnerTips({ ...spinnerTips, tips: spinnerTips.tips.filter((x) => x !== t) })} placeholder="Add tip text..." emptyLabel="Using default tips" />
        </div>
      </Section>

      {/* ── Attribution ── */}
      <Section title="Attribution" hidden={!sectionVisible("Attribution")} forceOpen={sectionForceOpen("Attribution")} hasValues={sectionValues["Attribution"]}>
        <div className="config-field">
          <label>Commit Attribution</label>
          <p className="config-field-hint">Text appended to git commits made by Claude (e.g. Co-Authored-By header).</p>
          <textarea rows={3} value={attrCommit} onChange={(e) => setAttrCommit(e.target.value)} placeholder="e.g. Generated with AI&#10;&#10;Co-Authored-By: AI <ai@example.com>" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>PR Attribution</label>
          <p className="config-field-hint">Text appended to pull requests created by Claude. Set to empty string to hide.</p>
          <textarea rows={2} value={attrPr} onChange={(e) => setAttrPr(e.target.value)} placeholder="Not set (uses default)" />
        </div>
      </Section>

      {/* ── MCP Server Approval ── */}
      <Section title="MCP Server Approval" hidden={!sectionVisible("MCP Server Approval")} forceOpen={sectionForceOpen("MCP Server Approval")} hasValues={sectionValues["MCP Server Approval"]}>
        <div className="config-field">
          <label>Enabled MCP Servers</label>
          <p className="config-field-hint">Specific MCP servers to automatically approve by name.</p>
          <TagInput tags={enabledMcpServers} onAdd={(v) => setEnabledMcpServers([...enabledMcpServers, v])} onRemove={(t) => setEnabledMcpServers(enabledMcpServers.filter((x) => x !== t))} placeholder="Add server name..." emptyLabel="No servers explicitly enabled" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Disabled MCP Servers</label>
          <p className="config-field-hint">Specific MCP servers to automatically reject by name.</p>
          <TagInput tags={disabledMcpServers} onAdd={(v) => setDisabledMcpServers([...disabledMcpServers, v])} onRemove={(t) => setDisabledMcpServers(disabledMcpServers.filter((x) => x !== t))} placeholder="Add server name..." emptyLabel="No servers explicitly disabled" />
        </div>
      </Section>

      {/* ── Environment Variables ── */}
      <Section title="Environment Variables" hidden={!sectionVisible("Environment Variables")} forceOpen={sectionForceOpen("Environment Variables")} hasValues={sectionValues["Environment Variables"]}>
        <div className="config-field">
          <p className="config-field-hint">Environment variables set for Claude Code sessions.</p>
          <KeyValueEditor entries={envVars} onUpdate={setEnvVars} keyPlaceholder="VARIABLE_NAME" valuePlaceholder="value" emptyLabel="No environment variables set" />
        </div>
      </Section>

      {/* ── Session & Login (merged: Session & Updates + Login & Enterprise) ── */}
      <Section title="Session &amp; Login" hidden={!sectionVisible("Session & Login")} forceOpen={sectionForceOpen("Session & Login")} hasValues={sectionValues["Session & Login"]}>
        <div className="config-field">
          <label>Cleanup Period (days)</label>
          <p className="config-field-hint">Days before inactive sessions are deleted. Default is 30, set to 0 to disable.</p>
          <input type="number" min={0} value={cleanupPeriodDays} onChange={(e) => setCleanupPeriodDays(e.target.value)} placeholder="30" style={{ maxWidth: 200 }} />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Auto-Updates Channel</label>
          <p className="config-field-hint">Release channel for automatic updates.</p>
          <select value={autoUpdatesChannel} onChange={(e) => setAutoUpdatesChannel(e.target.value)}>
            {AUTO_UPDATE_CHANNEL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Plans Directory</label>
          <p className="config-field-hint">Directory where plan files are stored.</p>
          <input type="text" value={plansDirectory} onChange={(e) => setPlansDirectory(e.target.value)} placeholder="Not set (uses default)" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Teammate Mode</label>
          <p className="config-field-hint">How agent teams are displayed: auto, in-process, or tmux.</p>
          <select value={teammateMode} onChange={(e) => setTeammateMode(e.target.value)}>
            {TEAMMATE_MODE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Force Login Method</label>
          <p className="config-field-hint">Restrict login to a specific method.</p>
          <select value={forceLoginMethod} onChange={(e) => setForceLoginMethod(e.target.value)}>
            {FORCE_LOGIN_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Force Login Org UUID</label>
          <p className="config-field-hint">Auto-select this organization UUID on login.</p>
          <input type="text" value={forceLoginOrgUUID} onChange={(e) => setForceLoginOrgUUID(e.target.value)} placeholder="Not set" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Company Announcements</label>
          <p className="config-field-hint">Messages displayed to users at startup.</p>
          <TagInput tags={companyAnnouncements} onAdd={(v) => setCompanyAnnouncements([...companyAnnouncements, v])} onRemove={(t) => setCompanyAnnouncements(companyAnnouncements.filter((x) => x !== t))} placeholder="Add announcement..." emptyLabel="No announcements" />
        </div>
      </Section>

      {/* ── Scripts & Hooks (merged: Custom Scripts + Hook Controls) ── */}
      <Section title="Scripts &amp; Hooks" hidden={!sectionVisible("Scripts & Hooks")} forceOpen={sectionForceOpen("Scripts & Hooks")} hasValues={sectionValues["Scripts & Hooks"]}>
        <div className="config-field">
          <label>API Key Helper</label>
          <p className="config-field-hint">Script to generate authentication values dynamically.</p>
          <input type="text" value={apiKeyHelper} onChange={(e) => setApiKeyHelper(e.target.value)} placeholder="/path/to/generate_api_key.sh" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>OTEL Headers Helper</label>
          <p className="config-field-hint">Script to generate OpenTelemetry headers.</p>
          <input type="text" value={otelHeadersHelper} onChange={(e) => setOtelHeadersHelper(e.target.value)} placeholder="/path/to/generate_otel_headers.sh" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>AWS Auth Refresh</label>
          <p className="config-field-hint">Script to refresh AWS credentials.</p>
          <input type="text" value={awsAuthRefresh} onChange={(e) => setAwsAuthRefresh(e.target.value)} placeholder="aws sso login --profile myprofile" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>AWS Credential Export</label>
          <p className="config-field-hint">Script that outputs AWS credentials JSON for Bedrock access.</p>
          <input type="text" value={awsCredentialExport} onChange={(e) => setAwsCredentialExport(e.target.value)} placeholder="/path/to/generate_aws_grant.sh" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Allowed HTTP Hook URLs</label>
          <p className="config-field-hint">URL patterns allowed for HTTP hooks.</p>
          <TagInput tags={allowedHttpHookUrls} onAdd={(v) => setAllowedHttpHookUrls([...allowedHttpHookUrls, v])} onRemove={(t) => setAllowedHttpHookUrls(allowedHttpHookUrls.filter((x) => x !== t))} placeholder="Add URL pattern..." emptyLabel="No HTTP hook URLs allowed" />
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>HTTP Hook Allowed Env Vars</label>
          <p className="config-field-hint">Environment variable names that HTTP hooks can access.</p>
          <TagInput tags={httpHookAllowedEnvVars} onAdd={(v) => setHttpHookAllowedEnvVars([...httpHookAllowedEnvVars, v])} onRemove={(t) => setHttpHookAllowedEnvVars(httpHookAllowedEnvVars.filter((x) => x !== t))} placeholder="Add env var name..." emptyLabel="No env vars exposed to HTTP hooks" />
        </div>
      </Section>

      {/* ── Sandbox ── */}
      <Section title="Sandbox" hidden={!sectionVisible("Sandbox")} forceOpen={sectionForceOpen("Sandbox")} hasValues={sectionValues["Sandbox"]}>
        <p className="config-field-hint" style={{ marginBottom: 12 }}>
          Advanced sandboxing configuration. Isolates bash commands using OS-level primitives (Seatbelt on macOS, bubblewrap on Linux).
        </p>
        <div className="config-field">
          <SandboxToggle label="Enable Sandbox" value={sandbox.enabled} onChange={(v) => setSandbox({ ...sandbox, enabled: v })} />
          <p className="config-field-hint">Restrict bash commands to sandboxed filesystem and network access.</p>
        </div>
        <div className="config-field" style={{ marginTop: 12 }}>
          <SandboxToggle label="Auto-allow Bash if Sandboxed" value={sandbox.autoAllow} onChange={(v) => setSandbox({ ...sandbox, autoAllow: v })} />
          <p className="config-field-hint">Auto-approve sandboxed commands that stay within boundaries (default: on).</p>
        </div>
        <div className="config-field" style={{ marginTop: 12 }}>
          <SandboxToggle label="Allow Unsandboxed Commands" value={sandbox.allowUnsandboxed} onChange={(v) => setSandbox({ ...sandbox, allowUnsandboxed: v })} />
          <p className="config-field-hint">Allow the dangerouslyDisableSandbox escape hatch (default: on).</p>
        </div>
        <div className="config-field" style={{ marginTop: 12 }}>
          <SandboxToggle label="Enable Weaker Nested Sandbox" value={sandbox.enableWeakerNested} onChange={(v) => setSandbox({ ...sandbox, enableWeakerNested: v })} />
          <p className="config-field-hint">Use a weaker sandbox for Docker environments (reduces security).</p>
        </div>
        <div className="config-field" style={{ marginTop: 16 }}>
          <label>Excluded Commands</label>
          <p className="config-field-hint">Commands that run outside the sandbox.</p>
          <TagInput tags={sandbox.excludedCommands} onAdd={(v) => setSandbox({ ...sandbox, excludedCommands: [...sandbox.excludedCommands, v] })} onRemove={(t) => setSandbox({ ...sandbox, excludedCommands: sandbox.excludedCommands.filter((x) => x !== t) })} placeholder="Add command..." />
        </div>
        <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: 14, color: "var(--text-secondary)" }}>Filesystem</h4>
        <div className="config-field">
          <label>Allow Write</label>
          <p className="config-field-hint">Paths where sandboxed commands can write. Prefix: // (root), ~/ (home), / (settings dir).</p>
          <TagInput tags={sandbox.fsAllowWrite} onAdd={(v) => setSandbox({ ...sandbox, fsAllowWrite: [...sandbox.fsAllowWrite, v] })} onRemove={(t) => setSandbox({ ...sandbox, fsAllowWrite: sandbox.fsAllowWrite.filter((x) => x !== t) })} placeholder="Add path..." />
        </div>
        <div className="config-field" style={{ marginTop: 12 }}>
          <label>Deny Write</label>
          <TagInput tags={sandbox.fsDenyWrite} onAdd={(v) => setSandbox({ ...sandbox, fsDenyWrite: [...sandbox.fsDenyWrite, v] })} onRemove={(t) => setSandbox({ ...sandbox, fsDenyWrite: sandbox.fsDenyWrite.filter((x) => x !== t) })} placeholder="Add path..." />
        </div>
        <div className="config-field" style={{ marginTop: 12 }}>
          <label>Deny Read</label>
          <TagInput tags={sandbox.fsDenyRead} onAdd={(v) => setSandbox({ ...sandbox, fsDenyRead: [...sandbox.fsDenyRead, v] })} onRemove={(t) => setSandbox({ ...sandbox, fsDenyRead: sandbox.fsDenyRead.filter((x) => x !== t) })} placeholder="Add path..." />
        </div>
        <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: 14, color: "var(--text-secondary)" }}>Network</h4>
        <div className="config-field">
          <label>Allowed Domains</label>
          <p className="config-field-hint">Domains allowed for outbound traffic (supports wildcards like *.example.com).</p>
          <TagInput tags={sandbox.netAllowedDomains} onAdd={(v) => setSandbox({ ...sandbox, netAllowedDomains: [...sandbox.netAllowedDomains, v] })} onRemove={(t) => setSandbox({ ...sandbox, netAllowedDomains: sandbox.netAllowedDomains.filter((x) => x !== t) })} placeholder="Add domain..." />
        </div>
        <div className="config-field" style={{ marginTop: 12 }}>
          <SandboxToggle label="Allow All Unix Sockets" value={sandbox.netAllowAllUnixSockets} onChange={(v) => setSandbox({ ...sandbox, netAllowAllUnixSockets: v })} />
        </div>
        <div className="config-field" style={{ marginTop: 8 }}>
          <SandboxToggle label="Allow Local Port Binding (macOS only)" value={sandbox.netAllowLocalBinding} onChange={(v) => setSandbox({ ...sandbox, netAllowLocalBinding: v })} />
        </div>
        <div className="config-field" style={{ marginTop: 12 }}>
          <label>Allow Unix Sockets</label>
          <p className="config-field-hint">Specific Unix socket paths accessible in sandbox.</p>
          <TagInput tags={sandbox.netAllowUnixSockets} onAdd={(v) => setSandbox({ ...sandbox, netAllowUnixSockets: [...sandbox.netAllowUnixSockets, v] })} onRemove={(t) => setSandbox({ ...sandbox, netAllowUnixSockets: sandbox.netAllowUnixSockets.filter((x) => x !== t) })} placeholder="Add socket path..." />
        </div>
      </Section>

      {/* ── Advanced (JSON) ── */}
      <Section title="Advanced (JSON)" hint="Custom fields not managed by the form above" hidden={!sectionVisible("Advanced (JSON)")} forceOpen={sectionForceOpen("Advanced (JSON)")} hasValues={sectionValues["Advanced (JSON)"]}>
        <p className="config-field-hint" style={{ marginBottom: 8 }}>
          Edit raw JSON for additional settings not covered above. Form fields take precedence over matching keys here.
        </p>
        <textarea className={`advanced-json-editor ${jsonError ? "input-error" : ""}`} rows={8} value={advancedJson}
          onChange={(e) => { setAdvancedJson(e.target.value); try { JSON.parse(e.target.value); setJsonError(null); } catch (err) { setJsonError(String(err)); } }} />
        {jsonError && <div className="field-error"><span className="field-error-message">{jsonError}</span></div>}
      </Section>

      {/* No results */}
      {sectionMatch && !Object.values(sectionMatch).some(Boolean) && (
        <div className="settings-no-results">
          No settings match &quot;{searchFilter}&quot;
        </div>
      )}

      {/* ── Save bar ── */}
      {isDirty && (
        <div className="config-save-bar" data-testid="save-bar">
          <span>You have unsaved changes</span>
          <div className="config-save-actions">
            <button className="btn" onClick={handleDiscard}>Discard</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !!jsonError}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
