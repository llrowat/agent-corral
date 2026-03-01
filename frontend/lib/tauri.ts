import { invoke } from "@tauri-apps/api/core";
import type {
  Repo,
  RepoStatus,
  SessionEnvelope,
  SessionActivityMap,
  WorktreeStatus,
  ClaudeDetection,
  NormalizedConfig,
  Agent,
  MemoryStore,
  MemoryEntry,
  HookEvent,
  Skill,
  McpServer,
  PackSummary,
  PackContents,
  ImportPreview,
  ImportMode,
  PackUpdateCheck,
  PluginSummary,
  PluginContents,
  PluginImportPreview,
  PluginUpdateCheck,
  PluginSyncStatus,
  PluginImportRegistry,
} from "@/types";

// -- Repo commands --

export async function addRepo(path: string): Promise<Repo> {
  return invoke("add_repo", { path });
}

export async function removeRepo(repoId: string): Promise<void> {
  return invoke("remove_repo", { repoId });
}

export async function listRepos(): Promise<Repo[]> {
  return invoke("list_repos");
}

export async function getRepoStatus(path: string): Promise<RepoStatus> {
  return invoke("get_repo_status", { path });
}

// -- Session commands --

export async function listSessions(): Promise<SessionEnvelope[]> {
  return invoke("list_sessions");
}

export async function deleteSession(sessionId: string): Promise<void> {
  return invoke("delete_session", { sessionId });
}

export async function focusSession(pid: number): Promise<void> {
  return invoke("focus_session", { pid });
}

export async function pollSessionStates(): Promise<SessionActivityMap> {
  return invoke("poll_session_states");
}

// -- Claude home --

export async function getClaudeHome(): Promise<string> {
  return invoke("get_claude_home");
}

// -- Claude adapter commands --

export async function detectClaudeConfig(
  repoPath: string
): Promise<ClaudeDetection> {
  return invoke("detect_claude_config", { repoPath });
}

export async function readClaudeConfig(
  repoPath: string
): Promise<NormalizedConfig> {
  return invoke("read_claude_config", { repoPath });
}

export async function writeClaudeConfig(
  repoPath: string,
  config: NormalizedConfig
): Promise<void> {
  return invoke("write_claude_config", { repoPath, config });
}

export async function readAgents(repoPath: string): Promise<Agent[]> {
  return invoke("read_agents", { repoPath });
}

export async function writeAgent(
  repoPath: string,
  agent: Agent
): Promise<void> {
  return invoke("write_agent", { repoPath, agent });
}

export async function deleteAgent(
  repoPath: string,
  agentId: string
): Promise<void> {
  return invoke("delete_agent", { repoPath, agentId });
}

export async function readMemoryStores(
  repoPath: string
): Promise<MemoryStore[]> {
  return invoke("read_memory_stores", { repoPath });
}

export async function createMemoryStore(
  repoPath: string,
  storeName: string
): Promise<MemoryStore> {
  return invoke("create_memory_store", { repoPath, storeName });
}

export async function readMemoryEntries(
  storePath: string
): Promise<MemoryEntry[]> {
  return invoke("read_memory_entries", { storePath });
}

export async function writeMemoryEntry(
  storePath: string,
  entry: MemoryEntry
): Promise<void> {
  return invoke("write_memory_entry", { storePath, entry });
}

export async function updateMemoryEntry(
  storePath: string,
  entryIndex: number,
  newContent: string
): Promise<void> {
  return invoke("update_memory_entry", { storePath, entryIndex, newContent });
}

export async function deleteMemoryEntry(
  storePath: string,
  entryIndex: number
): Promise<void> {
  return invoke("delete_memory_entry", { storePath, entryIndex });
}

export async function deleteMemoryStore(storePath: string): Promise<void> {
  return invoke("delete_memory_store", { storePath });
}

export async function resetMemory(storePath: string): Promise<void> {
  return invoke("reset_memory", { storePath });
}

export async function getKnownTools(): Promise<string[]> {
  return invoke("get_known_tools");
}

// -- Hooks commands --

export async function readHooks(repoPath: string): Promise<HookEvent[]> {
  return invoke("read_hooks", { repoPath });
}

export async function writeHooks(
  repoPath: string,
  hooks: HookEvent[]
): Promise<void> {
  return invoke("write_hooks", { repoPath, hooks });
}

// -- Skills commands --

export async function readSkills(repoPath: string): Promise<Skill[]> {
  return invoke("read_skills", { repoPath });
}

export async function writeSkill(
  repoPath: string,
  skill: Skill
): Promise<void> {
  return invoke("write_skill", { repoPath, skill });
}

export async function deleteSkill(
  repoPath: string,
  skillId: string
): Promise<void> {
  return invoke("delete_skill", { repoPath, skillId });
}

// -- MCP commands --

export async function readMcpServers(
  repoPath: string,
  isGlobal: boolean = false
): Promise<McpServer[]> {
  return invoke("read_mcp_servers", { repoPath, isGlobal });
}

export async function writeMcpServer(
  repoPath: string,
  server: McpServer,
  isGlobal: boolean = false
): Promise<void> {
  return invoke("write_mcp_server", { repoPath, server, isGlobal });
}

export async function deleteMcpServer(
  repoPath: string,
  serverId: string,
  isGlobal: boolean = false
): Promise<void> {
  return invoke("delete_mcp_server", { repoPath, serverId, isGlobal });
}

// -- Preferences commands --

export interface AppPreferences {
  terminal_emulator: string | null;
}

export async function getPreferences(): Promise<AppPreferences> {
  return invoke("get_preferences");
}

export async function setTerminalPreference(
  terminal: string | null
): Promise<void> {
  return invoke("set_terminal_preference", { terminal });
}

export async function getPlatform(): Promise<string> {
  return invoke("get_platform");
}

// -- Terminal commands --

export async function prepareAiCommand(
  repoPath: string,
  prompt: string
): Promise<string> {
  return invoke("prepare_ai_command", { repoPath, prompt });
}

export async function launchSession(
  repoPath: string,
  commandName: string,
  command: string,
  useWorktree?: boolean,
  baseBranch?: string | null
): Promise<string> {
  return invoke("launch_session", {
    repoPath,
    commandName,
    command,
    useWorktree: useWorktree || false,
    baseBranch: baseBranch || null,
  });
}

export async function resumeSession(
  sessionId: string,
  command: string
): Promise<void> {
  return invoke("resume_session", { sessionId, command });
}

export async function openSessionFolder(sessionId: string): Promise<void> {
  return invoke("open_session_folder", { sessionId });
}

// -- Worktree commands --

export async function getWorktreeStatus(
  sessionId: string
): Promise<WorktreeStatus> {
  return invoke("get_worktree_status", { sessionId });
}

export async function getWorktreeDiff(sessionId: string): Promise<string> {
  return invoke("get_worktree_diff", { sessionId });
}

export async function listBranches(repoPath: string): Promise<string[]> {
  return invoke("list_branches", { repoPath });
}

export async function mergeWorktreeBranch(
  sessionId: string,
  targetBranch: string
): Promise<string> {
  return invoke("merge_worktree_branch", { sessionId, targetBranch });
}

export async function pruneWorktrees(): Promise<void> {
  return invoke("prune_worktrees");
}

// -- Pack commands --

export async function listPacks(): Promise<PackSummary[]> {
  return invoke("list_packs");
}

export async function exportPack(
  repoPath: string,
  name: string,
  description: string,
  author: string | null,
  includeConfig: boolean,
  agentIds: string[],
  version?: string
): Promise<string> {
  return invoke("export_pack", {
    repoPath,
    name,
    description,
    author,
    includeConfig,
    agentIds,
    version: version || null,
  });
}

export async function previewImport(
  packPath: string,
  repoPath: string
): Promise<ImportPreview> {
  return invoke("preview_import", { packPath, repoPath });
}

export async function importPack(
  packPath: string,
  repoPath: string,
  mode: ImportMode
): Promise<void> {
  return invoke("import_pack", { packPath, repoPath, mode });
}

export async function deletePack(packPath: string): Promise<void> {
  return invoke("delete_pack", { packPath });
}

export async function readPack(packPath: string): Promise<PackContents> {
  return invoke("read_pack", { packPath });
}

export async function installPackFromGit(
  repoUrl: string,
  branch?: string
): Promise<PackSummary[]> {
  return invoke("install_pack_from_git", {
    repoUrl,
    branch: branch || null,
  });
}

export async function checkPackUpdates(): Promise<PackUpdateCheck[]> {
  return invoke("check_pack_updates");
}

export async function updatePack(packPath: string): Promise<PackSummary> {
  return invoke("update_pack", { packPath });
}

// -- Plugin commands --

export async function listPlugins(): Promise<PluginSummary[]> {
  return invoke("list_plugins");
}

export async function exportPlugin(
  repoPath: string,
  name: string,
  description: string,
  author: string | null,
  version: string | null,
  includeConfig: boolean,
  agentIds: string[],
  skillIds: string[],
  includeHooks: boolean,
  includeMcp: boolean,
  isGlobal: boolean = false,
): Promise<string> {
  return invoke("export_plugin", {
    repoPath,
    name,
    description,
    author,
    version,
    includeConfig,
    agentIds,
    skillIds,
    includeHooks,
    includeMcp,
    isGlobal,
  });
}

export async function previewPluginImport(
  pluginDir: string,
  repoPath: string
): Promise<PluginImportPreview> {
  return invoke("preview_plugin_import", { pluginDir, repoPath });
}

export async function importPlugin(
  pluginDir: string,
  repoPath: string,
  mode: ImportMode
): Promise<void> {
  return invoke("import_plugin", { pluginDir, repoPath, mode });
}

export async function deletePlugin(pluginDir: string): Promise<void> {
  return invoke("delete_plugin", { pluginDir });
}

export async function readPlugin(
  pluginDir: string
): Promise<PluginContents> {
  return invoke("read_plugin", { pluginDir });
}

export async function installPluginFromGit(
  repoUrl: string,
  branch?: string
): Promise<PluginSummary[]> {
  return invoke("install_plugin_from_git", {
    repoUrl,
    branch: branch || null,
  });
}

export async function checkPluginUpdates(): Promise<PluginUpdateCheck[]> {
  return invoke("check_plugin_updates");
}

export async function updatePlugin(
  pluginDir: string
): Promise<PluginSummary> {
  return invoke("update_plugin", { pluginDir });
}

export async function migrateAgentpack(
  agentpackPath: string
): Promise<string> {
  return invoke("migrate_agentpack", { agentpackPath });
}

// -- Plugin sync commands --

export async function getImportSyncStatus(
  repoPath: string
): Promise<PluginSyncStatus[]> {
  return invoke("get_import_sync_status", { repoPath });
}

export async function syncImportedPlugin(
  repoPath: string,
  pluginName: string
): Promise<PluginSyncStatus> {
  return invoke("sync_imported_plugin", { repoPath, pluginName });
}

export async function autoSyncRepo(
  repoPath: string
): Promise<string[]> {
  return invoke("auto_sync_repo", { repoPath });
}

export async function setImportPinned(
  repoPath: string,
  pluginName: string,
  pinned: boolean
): Promise<void> {
  return invoke("set_import_pinned", { repoPath, pluginName, pinned });
}

export async function setImportAutoSync(
  repoPath: string,
  pluginName: string,
  autoSync: boolean
): Promise<void> {
  return invoke("set_import_auto_sync", { repoPath, pluginName, autoSync });
}

export async function removeImportRecord(
  repoPath: string,
  pluginName: string
): Promise<void> {
  return invoke("remove_import_record", { repoPath, pluginName });
}

export async function autoUpdateLibrary(): Promise<string[]> {
  return invoke("auto_update_library");
}

export async function readImportRegistry(
  repoPath: string
): Promise<PluginImportRegistry> {
  return invoke("read_import_registry", { repoPath });
}

export async function setPluginSyncInterval(
  minutes: number
): Promise<void> {
  return invoke("set_plugin_sync_interval", { minutes });
}

export async function getPluginSyncInterval(): Promise<number> {
  return invoke("get_plugin_sync_interval");
}

