import { describe, it, expect } from "vitest";
import type {
  Repo,
  RepoStatus,
  Agent,
  HookHandler,
  HookGroup,
  HookEvent,
  Skill,
  McpServer,
  Scope,
  PageId,
  PluginSummary,
} from "./index";
import { HOOK_EVENTS } from "./index";

describe("Type definitions", () => {
  describe("HOOK_EVENTS constant", () => {
    it("contains expected event names", () => {
      expect(HOOK_EVENTS).toContain("PreToolUse");
      expect(HOOK_EVENTS).toContain("PostToolUse");
      expect(HOOK_EVENTS).toContain("Notification");
      expect(HOOK_EVENTS).toContain("Stop");
      expect(HOOK_EVENTS).toContain("SubagentStop");
    });

    it("has correct length", () => {
      expect(HOOK_EVENTS).toHaveLength(5);
    });
  });

  describe("Repo type", () => {
    it("creates a valid repo object", () => {
      const repo: Repo = {
        repo_id: "abc-123",
        name: "test-repo",
        path: "/home/user/test-repo",
        pinned: false,
        last_opened_at: "2026-01-01T00:00:00Z",
      };
      expect(repo.repo_id).toBe("abc-123");
      expect(repo.pinned).toBe(false);
    });

    it("allows null last_opened_at", () => {
      const repo: Repo = {
        repo_id: "abc",
        name: "test",
        path: "/tmp",
        pinned: false,
        last_opened_at: null,
      };
      expect(repo.last_opened_at).toBeNull();
    });
  });

  describe("RepoStatus type", () => {
    it("creates a valid status", () => {
      const status: RepoStatus = {
        exists: true,
        is_git_repo: true,
        has_claude_config: true,
        has_claude_md: false,
        has_agents: false,
      };
      expect(status.exists).toBe(true);
      expect(status.has_claude_md).toBe(false);
    });
  });

  describe("Agent type", () => {
    it("creates an agent with all fields", () => {
      const agent: Agent = {
        agentId: "my-agent",
        name: "My Agent",
        description: "A helpful agent",
        systemPrompt: "You are helpful.",
        tools: ["Read", "Write", "Bash"],
        modelOverride: "sonnet",
        memory: "user",
      };
      expect(agent.tools).toHaveLength(3);
      expect(agent.tools).toContain("Bash");
      expect(agent.description).toBe("A helpful agent");
      expect(agent.memory).toBe("user");
    });
  });

  describe("HookEvent structure", () => {
    it("creates a nested hook event", () => {
      const handler: HookHandler = {
        hookType: "command",
        command: "echo test",
        prompt: null,
        timeout: 5000,
      };

      const group: HookGroup = {
        matcher: "Bash",
        hooks: [handler],
      };

      const event: HookEvent = {
        event: "PreToolUse",
        groups: [group],
      };

      expect(event.groups[0].hooks[0].command).toBe("echo test");
    });
  });

  describe("Skill type", () => {
    it("creates a skill with optional fields", () => {
      const skill: Skill = {
        skillId: "test-skill",
        name: "Test Skill",
        description: "A test",
        userInvocable: true,
        allowedTools: ["Read"],
        model: null,
        disableModelInvocation: null,
        context: null,
        agent: null,
        argumentHint: "file path",
        content: "Do something.",
      };
      expect(skill.userInvocable).toBe(true);
      expect(skill.allowedTools).toHaveLength(1);
    });
  });

  describe("McpServer type", () => {
    it("creates a stdio server", () => {
      const server: McpServer = {
        serverId: "my-server",
        serverType: "stdio",
        command: "npx",
        args: ["-y", "@my/server"],
        url: null,
        env: { API_KEY: "test" },
        headers: null,
      };
      expect(server.args).toHaveLength(2);
    });

    it("creates an SSE server", () => {
      const server: McpServer = {
        serverId: "sse-server",
        serverType: "sse",
        command: null,
        args: null,
        url: "https://example.com/mcp",
        env: null,
        headers: { Authorization: "Bearer token" },
      };
      expect(server.url).toBe("https://example.com/mcp");
    });
  });

  describe("Scope type", () => {
    it("creates a global scope", () => {
      const scope: Scope = { type: "global", homePath: "/home/user" };
      expect(scope.type).toBe("global");
    });

    it("creates a project scope", () => {
      const scope: Scope = {
        type: "project",
        repo: {
          repo_id: "abc",
          name: "test",
          path: "/tmp",
          pinned: false,
          last_opened_at: null,
        },
      };
      expect(scope.type).toBe("project");
    });
  });

  describe("PageId type", () => {
    it("accepts valid page ids", () => {
      const pages: PageId[] = [
        "overview",
        "agents",
        "config",
        "memory",
        "hooks",
        "skills",
        "mcp",
        "plugins",
      ];
      expect(pages).toHaveLength(8);
    });
  });

  describe("PluginSummary type", () => {
    it("creates a plugin summary", () => {
      const summary: PluginSummary = {
        pluginId: "p1",
        name: "Test Plugin",
        version: "1.0.0",
        description: "A test",
        author: "Test Author",
        agentCount: 2,
        skillCount: 1,
        hookCount: 0,
        mcpCount: 1,
        hasConfig: false,
        dirPath: "/path/to/plugin",
        source: "library",
        gitSource: null,
      };
      expect(summary.agentCount).toBe(2);
      expect(summary.source).toBe("library");
    });
  });
});
