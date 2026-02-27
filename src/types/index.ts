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

export type SessionStatus = "running" | "success" | "failed";

export interface SessionEnvelope {
  sessionId: string;
  repoPath: string;
  commandName: string;
  command: string;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  exitCode: number | null;
  logPath: string;
}

// -- Claude Adapter --

export interface ClaudeDetection {
  hasSettingsJson: boolean;
  hasClaudeMd: boolean;
  hasAgentsDir: boolean;
  hasMemoryDir: boolean;
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

// -- Pack Manager --

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
  source: "local" | "library";
}

export type ImportMode = "addOnly" | "overwrite";

export interface ImportPreview {
  agentsToAdd: string[];
  agentsToUpdate: string[];
  configChanges: boolean;
}

// -- Command Templates --

export interface CommandTemplate {
  templateId: string;
  name: string;
  description: string;
  requires: string[];
  command: string;
  cwd: string | null;
}

// -- Navigation --

export type PageId =
  | "overview"
  | "agents"
  | "config"
  | "memory"
  | "sessions"
  | "packs";
