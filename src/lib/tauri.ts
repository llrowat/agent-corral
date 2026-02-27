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

export async function getSession(sessionId: string): Promise<SessionEnvelope> {
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

export async function resetMemory(storePath: string): Promise<void> {
  return invoke("reset_memory", { storePath });
}

// -- Terminal commands --

export async function launchSession(
  repoPath: string,
  commandName: string,
  command: string
): Promise<string> {
  return invoke("launch_session", { repoPath, commandName, command });
}
