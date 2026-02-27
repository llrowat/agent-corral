import { invoke } from "@tauri-apps/api/core";
import type {
  Repo,
  RepoStatus,
  SessionEnvelope,
  ClaudeDetection,
  NormalizedConfig,
  Agent,
  MemoryStore,
  MemoryEntry,
  PackSummary,
  PackContents,
  ImportPreview,
  ImportMode,
  CommandTemplate,
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

export async function getSession(
  sessionId: string
): Promise<SessionEnvelope> {
  return invoke("get_session", { sessionId });
}

export async function readSessionLog(
  sessionId: string,
  tailLines?: number
): Promise<string> {
  return invoke("read_session_log", { sessionId, tailLines });
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

export async function resetMemory(storePath: string): Promise<void> {
  return invoke("reset_memory", { storePath });
}

export async function getKnownTools(): Promise<string[]> {
  return invoke("get_known_tools");
}

// -- Terminal commands --

export async function launchSession(
  repoPath: string,
  commandName: string,
  command: string
): Promise<string> {
  return invoke("launch_session", { repoPath, commandName, command });
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
  agentIds: string[]
): Promise<string> {
  return invoke("export_pack", {
    repoPath,
    name,
    description,
    author,
    includeConfig,
    agentIds,
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

// -- Template commands --

export async function listTemplates(): Promise<CommandTemplate[]> {
  return invoke("list_templates");
}

export async function saveTemplate(
  template: CommandTemplate
): Promise<void> {
  return invoke("save_template", { template });
}

export async function deleteTemplate(templateId: string): Promise<void> {
  return invoke("delete_template", { templateId });
}

export async function renderTemplate(
  template: CommandTemplate,
  vars: Record<string, string>
): Promise<string> {
  return invoke("render_template", { template, vars });
}
