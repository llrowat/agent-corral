import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfigSummary } from "./ConfigSummary";
import type { Scope } from "@/types";

const mockReadClaudeConfig = vi.fn();
const mockReadAgents = vi.fn();
const mockReadHooks = vi.fn();
const mockReadSkills = vi.fn();
const mockReadMcpServers = vi.fn();

vi.mock("@/lib/tauri", () => ({
  readClaudeConfig: (...args: unknown[]) => mockReadClaudeConfig(...args),
  readAgents: (...args: unknown[]) => mockReadAgents(...args),
  readHooks: (...args: unknown[]) => mockReadHooks(...args),
  readSkills: (...args: unknown[]) => mockReadSkills(...args),
  readMcpServers: (...args: unknown[]) => mockReadMcpServers(...args),
}));

describe("ConfigSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders summary bar with model and entity counts", async () => {
    mockReadClaudeConfig.mockResolvedValue({
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: ["node_modules"],
      raw: {},
    });
    mockReadAgents.mockResolvedValue([
      { agentId: "a", name: "Agent A", description: "Test agent", systemPrompt: "test", tools: [], modelOverride: null, memory: null, color: null },
    ]);
    mockReadHooks.mockResolvedValue([
      { event: "PreToolUse", groups: [{ matcher: null, hooks: [{ hookType: "command", command: "test" }] }] },
    ]);
    mockReadSkills.mockResolvedValue([]);
    mockReadMcpServers.mockResolvedValue([]);

    const scope: Scope = {
      type: "project",
      repo: { repo_id: "1", name: "test", path: "/test", pinned: false, last_opened_at: null },
    };
    render(<ConfigSummary scope={scope} />);

    await waitFor(() => {
      expect(screen.getByText(/Sonnet 4\.6/)).toBeInTheDocument();
      expect(screen.getByText(/1 agent/)).toBeInTheDocument();
      expect(screen.getByText(/1 hook/)).toBeInTheDocument();
    });
  });

  it("renders empty state with dashed border when no config is set", async () => {
    mockReadClaudeConfig.mockRejectedValue(new Error("not found"));
    mockReadAgents.mockResolvedValue([]);
    mockReadHooks.mockResolvedValue([]);
    mockReadSkills.mockResolvedValue([]);
    mockReadMcpServers.mockResolvedValue([]);

    const scope: Scope = {
      type: "project",
      repo: { repo_id: "1", name: "test", path: "/test", pinned: false, last_opened_at: null },
    };
    const { container } = render(<ConfigSummary scope={scope} />);

    await waitFor(() => {
      const summary = container.querySelector(".config-summary");
      expect(summary).toBeInTheDocument();
      expect(summary).toHaveClass("config-summary-empty");
    });
    // Should show zero counts but no "View details" button
    expect(screen.queryByText("View details")).not.toBeInTheDocument();
  });

  it("expands details when View details is clicked", async () => {
    mockReadClaudeConfig.mockResolvedValue({
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: ["node_modules", "dist"],
      raw: {},
    });
    mockReadAgents.mockResolvedValue([
      { agentId: "a", name: "Agent A", description: "Test agent", systemPrompt: "test", tools: [], modelOverride: null, memory: null, color: null },
    ]);
    mockReadHooks.mockResolvedValue([]);
    mockReadSkills.mockResolvedValue([]);
    mockReadMcpServers.mockResolvedValue([
      { serverId: "fs", serverType: "stdio", command: "npx" },
    ]);

    const scope: Scope = {
      type: "project",
      repo: { repo_id: "1", name: "test", path: "/test", pinned: false, last_opened_at: null },
    };
    render(<ConfigSummary scope={scope} />);

    await waitFor(() => {
      expect(screen.getByText("View details")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("View details"));

    expect(screen.getByText("Agent A")).toBeInTheDocument();
    expect(screen.getByText("fs (stdio)")).toBeInTheDocument();
    expect(screen.getByText("node_modules")).toBeInTheDocument();
    expect(screen.getByText("Hide details")).toBeInTheDocument();
  });

  it("uses global flag for MCP when scope is global", async () => {
    mockReadClaudeConfig.mockResolvedValue({
      model: "claude-opus-4-6",
      permissions: null,
      ignorePatterns: null,
      raw: {},
    });
    mockReadAgents.mockResolvedValue([]);
    mockReadHooks.mockResolvedValue([]);
    mockReadSkills.mockResolvedValue([]);
    mockReadMcpServers.mockResolvedValue([]);

    const scope: Scope = { type: "global", homePath: "/home/user" };
    render(<ConfigSummary scope={scope} />);

    await waitFor(() => {
      expect(mockReadMcpServers).toHaveBeenCalledWith("/home/user", true);
    });
  });
});
