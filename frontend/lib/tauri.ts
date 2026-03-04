import { invoke } from "@tauri-apps/api/core";
import type {
  Repo,
  RepoStatus,
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
  LintResult,
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

export async function getKnownToolsWithMcp(repoPath: string, isGlobal: boolean = false): Promise<string[]> {
  return invoke("get_known_tools_with_mcp", { repoPath, isGlobal });
}

export async function prepareAiCommand(
  repoPath: string,
  prompt: string
): Promise<string> {
  return invoke("prepare_ai_command", { repoPath, prompt });
}

export async function launchTerminal(
  repoPath: string,
  command: string
): Promise<number> {
  return invoke("launch_terminal", { repoPath, command });
}

export async function isProcessAlive(pid: number): Promise<boolean> {
  return invoke("is_process_alive", { pid });
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

export async function reorderHookGroups(
  repoPath: string,
  event: string,
  newOrder: number[]
): Promise<void> {
  return invoke("reorder_hook_groups", { repoPath, event, newOrder });
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
  plugin_sync_interval_minutes: number;
}

export async function getPreferences(): Promise<AppPreferences> {
  return invoke("get_preferences");
}

export async function getPlatform(): Promise<string> {
  return invoke("get_platform");
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

// -- CLAUDE.md commands --

export async function readClaudeMd(repoPath: string): Promise<string> {
  return invoke("read_claude_md", { repoPath });
}

export async function listClaudeMdFiles(
  repoPath: string
): Promise<string[]> {
  return invoke("list_claude_md_files", { repoPath });
}

// -- Config history commands --

export interface ConfigSnapshotSummary {
  snapshotId: string;
  label: string;
  timestamp: string;
  hasSettings: boolean;
}

export interface ConfigSnapshot {
  snapshotId: string;
  label: string;
  timestamp: string;
  settingsJson: string | null;
}

export async function saveConfigSnapshot(
  repoPath: string,
  label: string
): Promise<ConfigSnapshot> {
  return invoke("save_config_snapshot", { repoPath, label });
}

export async function listConfigSnapshots(
  repoPath: string
): Promise<ConfigSnapshotSummary[]> {
  return invoke("list_config_snapshots", { repoPath });
}

export async function restoreConfigSnapshot(
  repoPath: string,
  snapshotId: string
): Promise<void> {
  return invoke("restore_config_snapshot", { repoPath, snapshotId });
}

export async function deleteConfigSnapshot(
  repoPath: string,
  snapshotId: string
): Promise<void> {
  return invoke("delete_config_snapshot", { repoPath, snapshotId });
}

// -- MCP health check --

export async function checkMcpHealth(
  repoPath: string,
  serverId: string,
  isGlobal: boolean = false
): Promise<McpHealthResult> {
  return invoke("check_mcp_health", { repoPath, serverId, isGlobal });
}

export interface McpHealthResult {
  serverId: string;
  status: "healthy" | "error" | "unknown";
  message: string;
  checkedAt: string;
}

// -- Enable/Disable toggle commands --

export async function toggleAgentEnabled(
  repoPath: string,
  agentId: string,
  enabled: boolean
): Promise<void> {
  return invoke("toggle_agent_enabled", { repoPath, agentId, enabled });
}

export async function toggleSkillEnabled(
  repoPath: string,
  skillId: string,
  enabled: boolean
): Promise<void> {
  return invoke("toggle_skill_enabled", { repoPath, skillId, enabled });
}

export async function toggleHookGroupEnabled(
  repoPath: string,
  event: string,
  groupIndex: number,
  enabled: boolean
): Promise<void> {
  return invoke("toggle_hook_group_enabled", {
    repoPath,
    event,
    groupIndex,
    enabled,
  });
}

export async function toggleMcpServerEnabled(
  repoPath: string,
  serverId: string,
  isGlobal: boolean,
  enabled: boolean
): Promise<void> {
  return invoke("toggle_mcp_server_enabled", {
    repoPath,
    serverId,
    isGlobal,
    enabled,
  });
}

export async function listDisabledAgents(
  repoPath: string
): Promise<string[]> {
  return invoke("list_disabled_agents", { repoPath });
}

export async function listDisabledSkills(
  repoPath: string
): Promise<string[]> {
  return invoke("list_disabled_skills", { repoPath });
}

// -- Project scan commands --

export interface ProjectScanResult {
  hasClaudeMd: boolean;
  claudeMdCount: number;
  agentCount: number;
  skillCount: number;
  hookCount: number;
  mcpServerCount: number;
  hasSettings: boolean;
  hasMemory: boolean;
  memoryStoreCount: number;
}

export async function scanProjectConfig(
  projectPath: string
): Promise<ProjectScanResult> {
  return invoke("scan_project_config", { projectPath });
}

// -- Config lint commands --

export async function lintConfig(
  projectPath: string,
  globalPath?: string | null
): Promise<LintResult> {
  return invoke("lint_config", { projectPath, globalPath: globalPath ?? null });
}

// -- Config bundle (backup/restore) commands --

export interface ConfigBundle {
  version: string;
  created_at: string;
  scope: string;
  agents: unknown[];
  skills: unknown[];
  hooks: unknown[];
  mcp_servers: unknown;
  settings: unknown;
  claude_md: string | null;
}

export interface ImportBundleResult {
  agentsImported: number;
  skillsImported: number;
  hooksImported: number;
  mcpServersImported: number;
  settingsImported: boolean;
}

export async function exportConfigBundle(
  repoPath: string,
  isGlobal: boolean
): Promise<string> {
  return invoke("export_config_bundle", { repoPath, isGlobal });
}

export async function importConfigBundle(
  repoPath: string,
  isGlobal: boolean,
  bundleJson: string,
  mode: string
): Promise<ImportBundleResult> {
  return invoke("import_config_bundle", { repoPath, isGlobal, bundleJson, mode });
}
