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

// -- Session Manager --

export interface SessionEnvelope {
  sessionId: string;
  repoPath: string;
  commandName: string;
  command: string;
  startedAt: string;
  pid: number | null;
  worktreePath: string | null;
  worktreeBranch: string | null;
  worktreeBaseBranch: string | null;
  processAlive: boolean;
}

export interface WorktreeStatus {
  branch: string;
  baseBranch: string | null;
  worktreePath: string;
  hasUncommittedChanges: boolean;
  commitCount: number;
  latestCommitSummary: string | null;
}

/** Activity state for a running session, inferred from CPU usage between polls. */
export type SessionActivity = "active" | "idle" | "exited";

/** Map of session ID to activity state, returned by poll_session_states. */
export type SessionActivityMap = Record<string, SessionActivity>;

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
  systemPrompt: string;
  tools: string[];
  modelOverride: string | null;
  memoryBinding: string | null;
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
  templateCount: number;
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
  templates: CommandTemplate[];
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
  templatesToAdd: string[];
  templatesToUpdate: string[];
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

// -- Command Templates --

export interface CommandTemplate {
  templateId: string;
  name: string;
  description: string;
  requires: string[];
  command: string;
  cwd: string | null;
  useWorktree: boolean;
}

// -- Scope --

export type Scope =
  | { type: "global"; homePath: string }
  | { type: "project"; repo: Repo };

// -- Navigation --

export type PageId =
  | "overview"
  | "agents"
  | "config"
  | "memory"
  | "sessions"
  | "hooks"
  | "skills"
  | "mcp"
  | "plugins";
