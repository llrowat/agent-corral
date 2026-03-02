import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import * as api from "./tauri";

// Cast the mocked invoke
const mockInvoke = vi.mocked(invoke);

describe("Tauri API bindings", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  // -- Repo commands --

  describe("addRepo", () => {
    it("calls invoke with correct command and args", async () => {
      const mockRepo = { repo_id: "abc", name: "test", path: "/tmp", pinned: false, last_opened_at: null };
      mockInvoke.mockResolvedValue(mockRepo);

      const result = await api.addRepo("/tmp");
      expect(mockInvoke).toHaveBeenCalledWith("add_repo", { path: "/tmp" });
      expect(result).toEqual(mockRepo);
    });
  });

  describe("removeRepo", () => {
    it("calls invoke with correct command", async () => {
      mockInvoke.mockResolvedValue(undefined);
      await api.removeRepo("abc");
      expect(mockInvoke).toHaveBeenCalledWith("remove_repo", { repoId: "abc" });
    });
  });

  describe("listRepos", () => {
    it("calls invoke with correct command", async () => {
      mockInvoke.mockResolvedValue([]);
      const result = await api.listRepos();
      expect(mockInvoke).toHaveBeenCalledWith("list_repos");
      expect(result).toEqual([]);
    });
  });

  describe("getRepoStatus", () => {
    it("calls invoke with path argument", async () => {
      const mockStatus = { exists: true, is_git_repo: true, has_claude_config: false, has_claude_md: false, has_agents: false };
      mockInvoke.mockResolvedValue(mockStatus);

      const result = await api.getRepoStatus("/tmp/repo");
      expect(mockInvoke).toHaveBeenCalledWith("get_repo_status", { path: "/tmp/repo" });
      expect(result.exists).toBe(true);
    });
  });

  // -- Claude adapter commands --

  describe("detectClaudeConfig", () => {
    it("calls invoke with repo path", async () => {
      const mockDetection = {
        hasSettingsJson: true, hasClaudeMd: true, hasAgentsDir: false,
        hasMemoryDir: false, hasSkillsDir: false, hasMcpJson: false,
        hookCount: 0, configPath: null,
      };
      mockInvoke.mockResolvedValue(mockDetection);

      const result = await api.detectClaudeConfig("/tmp/repo");
      expect(mockInvoke).toHaveBeenCalledWith("detect_claude_config", { repoPath: "/tmp/repo" });
      expect(result.hasSettingsJson).toBe(true);
    });
  });

  describe("readAgents", () => {
    it("calls invoke with repo path", async () => {
      mockInvoke.mockResolvedValue([]);
      await api.readAgents("/tmp/repo");
      expect(mockInvoke).toHaveBeenCalledWith("read_agents", { repoPath: "/tmp/repo" });
    });
  });

  describe("writeAgent", () => {
    it("calls invoke with repo path and agent", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const agent = {
        agentId: "test", name: "Test", description: "A test agent", systemPrompt: "Hello",
        tools: [], modelOverride: null, memory: null,
      };
      await api.writeAgent("/tmp/repo", agent);
      expect(mockInvoke).toHaveBeenCalledWith("write_agent", { repoPath: "/tmp/repo", agent });
    });
  });

  describe("deleteAgent", () => {
    it("calls invoke with repo path and agent id", async () => {
      mockInvoke.mockResolvedValue(undefined);
      await api.deleteAgent("/tmp/repo", "test-agent");
      expect(mockInvoke).toHaveBeenCalledWith("delete_agent", { repoPath: "/tmp/repo", agentId: "test-agent" });
    });
  });

  // -- Memory commands --

  describe("readMemoryStores", () => {
    it("calls invoke correctly", async () => {
      mockInvoke.mockResolvedValue([]);
      await api.readMemoryStores("/tmp/repo");
      expect(mockInvoke).toHaveBeenCalledWith("read_memory_stores", { repoPath: "/tmp/repo" });
    });
  });

  describe("createMemoryStore", () => {
    it("calls invoke with repo path and store name", async () => {
      mockInvoke.mockResolvedValue({ storeId: "notes", name: "notes", path: "/tmp/notes.md", entryCount: 0 });
      await api.createMemoryStore("/tmp/repo", "notes");
      expect(mockInvoke).toHaveBeenCalledWith("create_memory_store", { repoPath: "/tmp/repo", storeName: "notes" });
    });
  });

  describe("writeMemoryEntry", () => {
    it("calls invoke with store path and entry", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const entry = { key: "1", content: "test" };
      await api.writeMemoryEntry("/tmp/store.md", entry);
      expect(mockInvoke).toHaveBeenCalledWith("write_memory_entry", { storePath: "/tmp/store.md", entry });
    });
  });

  describe("updateMemoryEntry", () => {
    it("calls invoke with correct args", async () => {
      mockInvoke.mockResolvedValue(undefined);
      await api.updateMemoryEntry("/tmp/store.md", 0, "updated");
      expect(mockInvoke).toHaveBeenCalledWith("update_memory_entry", {
        storePath: "/tmp/store.md", entryIndex: 0, newContent: "updated",
      });
    });
  });

  describe("deleteMemoryEntry", () => {
    it("calls invoke with store path and index", async () => {
      mockInvoke.mockResolvedValue(undefined);
      await api.deleteMemoryEntry("/tmp/store.md", 1);
      expect(mockInvoke).toHaveBeenCalledWith("delete_memory_entry", { storePath: "/tmp/store.md", entryIndex: 1 });
    });
  });

  // -- Hooks commands --

  describe("readHooks", () => {
    it("calls invoke correctly", async () => {
      mockInvoke.mockResolvedValue([]);
      await api.readHooks("/tmp/repo");
      expect(mockInvoke).toHaveBeenCalledWith("read_hooks", { repoPath: "/tmp/repo" });
    });
  });

  describe("writeHooks", () => {
    it("calls invoke with hooks array", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const hooks = [{ event: "Stop", groups: [] }];
      await api.writeHooks("/tmp/repo", hooks);
      expect(mockInvoke).toHaveBeenCalledWith("write_hooks", { repoPath: "/tmp/repo", hooks });
    });
  });

  // -- Skills commands --

  describe("readSkills", () => {
    it("calls invoke correctly", async () => {
      mockInvoke.mockResolvedValue([]);
      await api.readSkills("/tmp/repo");
      expect(mockInvoke).toHaveBeenCalledWith("read_skills", { repoPath: "/tmp/repo" });
    });
  });

  // -- MCP commands --

  describe("readMcpServers", () => {
    it("defaults isGlobal to false", async () => {
      mockInvoke.mockResolvedValue([]);
      await api.readMcpServers("/tmp/repo");
      expect(mockInvoke).toHaveBeenCalledWith("read_mcp_servers", { repoPath: "/tmp/repo", isGlobal: false });
    });

    it("passes isGlobal when specified", async () => {
      mockInvoke.mockResolvedValue([]);
      await api.readMcpServers("/home/user", true);
      expect(mockInvoke).toHaveBeenCalledWith("read_mcp_servers", { repoPath: "/home/user", isGlobal: true });
    });
  });

  // -- Error handling --

  describe("error propagation", () => {
    it("propagates invoke errors", async () => {
      mockInvoke.mockRejectedValue("Repo not found");
      await expect(api.listRepos()).rejects.toBe("Repo not found");
    });
  });
});
