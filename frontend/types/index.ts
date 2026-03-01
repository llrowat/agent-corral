// -- Repo Registry --

export interface Repo {
  repo_id: string;
  name: string;
  path: string;
  pinned: boolean;
  last_opened_at: string | null;
}

export interface RepoStatus {
  exists: boolean;
  is_git_repo: boolean;
  has_claude_config: boolean;
  has_claude_md: boolean;
  has_agents: boolean;
}

// -- Claude Adapter --

export interface ClaudeDetection {
  hasSettingsJson: boolean;
  hasClaudeMd: boolean;
  hasAgentsDir: boolean;
  hasMemoryDir: boolean;
  hasSkillsDir: boolean;
  hasMcpJson: boolean;
  hookCount: number;
  configPath: string | null;
}

export interface NormalizedConfig {
  model: string | null;
  permissions: unknown;
  ignorePatterns: string[] | null;
  raw: Record<string, unknown>;
}

export interface Agent {
  agentId: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  modelOverride: string | null;
  memory: string | null;
}

export interface MemoryStore {
  storeId: string;
  name: string;
  path: string;
  entryCount: number;
}

export interface MemoryEntry {
  key: string;
  content: string;
}

// -- Hooks --

export interface HookHandler {
  hookType: string;
  command?: string | null;
  prompt?: string | null;
  timeout?: number | null;
}

export interface HookGroup {
  matcher?: string | null;
  hooks: HookHandler[];
  _disabled?: boolean | null;
}

export interface HookEvent {
  event: string;
  groups: HookGroup[];
}

export const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SubagentStop",
] as const;

// -- Skills --

export interface Skill {
  skillId: string;
  name: string;
  description?: string | null;
  userInvocable?: boolean | null;
  allowedTools: string[];
  model?: string | null;
  disableModelInvocation?: boolean | null;
  context?: string | null;
  agent?: string | null;
  argumentHint?: string | null;
  content: string;
}

// -- MCP Servers --

export interface McpServer {
  serverId: string;
  serverType: string;
  command?: string | null;
  args?: string[] | null;
  url?: string | null;
  env?: Record<string, string> | null;
  headers?: Record<string, string> | null;
  _disabled?: boolean | null;
}

// -- Pack Manager (legacy) --

export interface PackManifest {
  packId: string;
  name: string;
  version: string;
  description: string;
  author: string | null;
  createdAt: string;
  agentCount: number;
  hasConfig: boolean;
}

export interface PackContents {
  manifest: PackManifest;
  agents: Agent[];
  config: NormalizedConfig | null;
}

export interface PackSummary {
  packId: string;
  name: string;
  version: string;
  description: string;
  author: string | null;
  agentCount: number;
  hasConfig: boolean;
  filePath: string;
  source: "local" | "library" | "git";
  gitSource: GitSource | null;
}

export interface GitSource {
  repoUrl: string;
  branch: string | null;
  installedCommit: string;
  installedAt: string;
}

export interface PackUpdateCheck {
  packId: string;
  name: string;
  currentVersion: string;
  latestVersion: string | null;
  installedCommit: string;
  latestCommit: string;
  updateAvailable: boolean;
  filePath: string;
}

export type ImportMode = "addOnly" | "overwrite";

export interface ImportPreview {
  agentsToAdd: string[];
  agentsToUpdate: string[];
  configChanges: boolean;
}

// -- Plugin Manager --

export interface PluginManifest {
  name: string;
  description: string;
  version: string;
  author: string | null;
}

export interface PluginSummary {
  pluginId: string;
  name: string;
  version: string;
  description: string;
  author: string | null;
  agentCount: number;
  skillCount: number;
  hookCount: number;
  mcpCount: number;
  hasConfig: boolean;
  dirPath: string;
  source: "local" | "library" | "git";
  gitSource: GitSource | null;
}

export interface PluginContents {
  manifest: PluginManifest;
  agents: Agent[];
  skills: Skill[];
  hooks: HookEvent[];
  mcpServers: McpServer[];
  config: NormalizedConfig | null;
}

export interface PluginImportPreview {
  agentsToAdd: string[];
  agentsToUpdate: string[];
  skillsToAdd: string[];
  skillsToUpdate: string[];
  hooksToAdd: string[];
  mcpToAdd: string[];
  mcpToUpdate: string[];
  configChanges: boolean;
}

export interface PluginUpdateCheck {
  pluginId: string;
  name: string;
  currentVersion: string;
  latestVersion: string | null;
  installedCommit: string;
  latestCommit: string;
  updateAvailable: boolean;
  dirPath: string;
}

// -- Plugin Import Sync --

export interface PluginImportRecord {
  pluginName: string;
  pluginDir: string;
  gitSource: GitSource | null;
  importedCommit: string | null;
  importedAt: string;
  importMode: ImportMode;
  pinned: boolean;
  autoSync: boolean;
}

export interface PluginImportRegistry {
  imports: PluginImportRecord[];
}

export interface PluginSyncStatus {
  pluginName: string;
  pluginDir: string;
  pluginExists: boolean;
  importedCommit: string | null;
  libraryCommit: string | null;
  updateAvailable: boolean;
  autoSync: boolean;
  pinned: boolean;
}

// -- Config Lint --

export interface LintIssue {
  severity: "error" | "warning" | "info";
  category: string;
  rule: string;
  message: string;
  fix?: string | null;
  entityId?: string | null;
  scope?: string | null;
}

export interface LintResult {
  issues: LintIssue[];
  score: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

// -- Scope --

export type Scope =
  | { type: "global"; homePath: string }
  | { type: "project"; repo: Repo };

// -- Navigation --

export type PageId =
  | "overview"
  | "claude-md"
  | "agents"
  | "config"
  | "memory"
  | "hooks"
  | "skills"
  | "mcp"
  | "plugins"
  | "history";
