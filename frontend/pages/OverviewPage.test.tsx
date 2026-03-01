import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import { MemoryRouter } from "react-router-dom";
import { OverviewPage } from "./OverviewPage";
import type { Scope } from "@/types";

const mockDetectClaudeConfig = vi.fn();
const mockGetRepoStatus = vi.fn();
const mockReadAgents = vi.fn();
const mockReadHooks = vi.fn();
const mockReadSkills = vi.fn();
const mockReadMcpServers = vi.fn();
const mockReadMemoryStores = vi.fn();
const mockReadClaudeConfig = vi.fn();
const mockExportConfigBundle = vi.fn();
const mockImportConfigBundle = vi.fn();

vi.mock("@/lib/tauri", () => ({
  detectClaudeConfig: (...args: unknown[]) => mockDetectClaudeConfig(...args),
  getRepoStatus: (...args: unknown[]) => mockGetRepoStatus(...args),
  readAgents: (...args: unknown[]) => mockReadAgents(...args),
  readHooks: (...args: unknown[]) => mockReadHooks(...args),
  readSkills: (...args: unknown[]) => mockReadSkills(...args),
  readMcpServers: (...args: unknown[]) => mockReadMcpServers(...args),
  readMemoryStores: (...args: unknown[]) => mockReadMemoryStores(...args),
  readClaudeConfig: (...args: unknown[]) => mockReadClaudeConfig(...args),
  exportConfigBundle: (...args: unknown[]) => mockExportConfigBundle(...args),
  importConfigBundle: (...args: unknown[]) => mockImportConfigBundle(...args),
}));

const PROJECT_SCOPE: Scope = {
  type: "project",
  repo: {
    repo_id: "1",
    name: "my-app",
    path: "/projects/my-app",
    pinned: false,
    last_opened_at: null,
  },
};

const GLOBAL_SCOPE: Scope = {
  type: "global",
  homePath: "/home/user",
};

function renderWithRouter(scope: Scope | null) {
  return renderWithProviders(
    <MemoryRouter>
      <OverviewPage scope={scope} />
    </MemoryRouter>
  );
}

describe("OverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectClaudeConfig.mockResolvedValue({
      hasSettingsJson: false,
      hasClaudeMd: false,
      hasAgentsDir: false,
      hasMemoryDir: false,
      hasSkillsDir: false,
      hasMcpJson: false,
      hookCount: 0,
      configPath: null,
    });
    mockGetRepoStatus.mockResolvedValue({
      exists: true,
      is_git_repo: true,
      has_claude_config: false,
      has_claude_md: false,
      has_agents: false,
    });
    mockReadAgents.mockResolvedValue([]);
    mockReadHooks.mockResolvedValue([]);
    mockReadSkills.mockResolvedValue([]);
    mockReadMcpServers.mockResolvedValue([]);
    mockReadMemoryStores.mockResolvedValue([]);
    mockReadClaudeConfig.mockResolvedValue({
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: {},
    });
  });

  it("shows welcome message when no scope selected", () => {
    renderWithRouter(null);
    expect(screen.getByText("Howdy, partner.")).toBeInTheDocument();
    expect(screen.getByText(/Welcome to AgentCorral/)).toBeInTheDocument();
  });

  it("shows project name for project scope", async () => {
    renderWithRouter(PROJECT_SCOPE);
    expect(screen.getByText("my-app")).toBeInTheDocument();
    expect(screen.getByText("/projects/my-app")).toBeInTheDocument();
  });

  it("shows Global Settings heading for global scope", async () => {
    renderWithRouter(GLOBAL_SCOPE);
    expect(screen.getByText("Global Settings")).toBeInTheDocument();
  });

  it("shows config cards with empty state CTAs when nothing configured", async () => {
    renderWithRouter(PROJECT_SCOPE);

    await waitFor(() => {
      expect(screen.getByText("No agents configured")).toBeInTheDocument();
      expect(screen.getByText("No hooks configured")).toBeInTheDocument();
      expect(screen.getByText("No skills configured")).toBeInTheDocument();
      expect(screen.getByText("No MCP servers configured")).toBeInTheDocument();
      expect(screen.getByText("No memory stores")).toBeInTheDocument();
      expect(screen.getByText("No config set")).toBeInTheDocument();
    });

    // Each empty card should have a "Set up now" button
    const setupButtons = screen.getAllByText("Set up now");
    expect(setupButtons.length).toBe(6);
  });

  it("shows progress bar indicating 0 of 6 configured", async () => {
    renderWithRouter(PROJECT_SCOPE);

    await waitFor(() => {
      expect(screen.getByText("Configuration: 0 of 6 areas set up")).toBeInTheDocument();
    });
  });

  it("shows counts when config areas have items", async () => {
    mockReadAgents.mockResolvedValue([
      { agentId: "reviewer", name: "Code Reviewer", description: "", systemPrompt: "", tools: [], modelOverride: null, memory: null },
      { agentId: "writer", name: "Writer", description: "", systemPrompt: "", tools: [], modelOverride: null, memory: null },
    ]);
    mockReadHooks.mockResolvedValue([
      { event: "PreToolUse", groups: [{ matcher: null, hooks: [{ hookType: "command", command: "echo" }] }] },
    ]);
    mockReadSkills.mockResolvedValue([
      { skillId: "commit", name: "Commit", content: "", allowedTools: [] },
    ]);
    mockReadMcpServers.mockResolvedValue([
      { serverId: "fs", serverType: "stdio", command: "npx" },
    ]);
    mockReadMemoryStores.mockResolvedValue([
      { storeId: "default", name: "default", path: "/test", entryCount: 3 },
    ]);
    mockReadClaudeConfig.mockResolvedValue({
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: null,
      raw: { model: "claude-sonnet-4-6" },
    });

    renderWithRouter(GLOBAL_SCOPE);

    await waitFor(() => {
      expect(screen.getByText("2 items")).toBeInTheDocument(); // agents
      expect(screen.getByText("Model: Sonnet 4.6")).toBeInTheDocument(); // config model in overview card
    });

    // Multiple cards show "1 item", verify they exist
    const singleItemBadges = screen.getAllByText("1 item");
    expect(singleItemBadges.length).toBe(4); // hooks, skills, mcp, memory

    // Should show "Manage" buttons instead of "Set up now"
    const manageButtons = screen.getAllByText("Manage");
    expect(manageButtons.length).toBe(6);
  });

  it("shows progress when some areas are configured", async () => {
    mockReadAgents.mockResolvedValue([
      { agentId: "a", name: "Agent", description: "", systemPrompt: "", tools: [], modelOverride: null, memory: null },
    ]);
    mockReadClaudeConfig.mockResolvedValue({
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: null,
      raw: { model: "claude-sonnet-4-6" },
    });

    renderWithRouter(GLOBAL_SCOPE);

    await waitFor(() => {
      expect(screen.getByText("Configuration: 2 of 6 areas set up")).toBeInTheDocument();
    });
  });

  it("shows all configured message when all areas have items", async () => {
    mockReadAgents.mockResolvedValue([
      { agentId: "a", name: "Agent", description: "", systemPrompt: "", tools: [], modelOverride: null, memory: null },
    ]);
    mockReadHooks.mockResolvedValue([
      { event: "PreToolUse", groups: [{ matcher: null, hooks: [{ hookType: "command", command: "echo" }] }] },
    ]);
    mockReadSkills.mockResolvedValue([
      { skillId: "s", name: "Skill", content: "", allowedTools: [] },
    ]);
    mockReadMcpServers.mockResolvedValue([
      { serverId: "fs", serverType: "stdio", command: "npx" },
    ]);
    mockReadMemoryStores.mockResolvedValue([
      { storeId: "default", name: "default", path: "/test", entryCount: 1 },
    ]);
    mockReadClaudeConfig.mockResolvedValue({
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: null,
      raw: { model: "claude-sonnet-4-6" },
    });

    renderWithRouter(GLOBAL_SCOPE);

    await waitFor(() => {
      expect(screen.getByText("All configured")).toBeInTheDocument();
      expect(screen.getByText("Configuration: 6 of 6 areas set up")).toBeInTheDocument();
    });
  });

  it("shows repo status indicators for project scope", async () => {
    renderWithRouter(PROJECT_SCOPE);

    await waitFor(() => {
      expect(screen.getByText("Directory exists")).toBeInTheDocument();
      expect(screen.getByText("Git repo")).toBeInTheDocument();
    });
  });

  it("does not show repo status indicators for global scope", async () => {
    renderWithRouter(GLOBAL_SCOPE);

    await waitFor(() => {
      expect(screen.queryByText("Directory exists")).not.toBeInTheDocument();
      expect(screen.queryByText("Git repo")).not.toBeInTheDocument();
    });
  });

  it("renders hint text for each unconfigured area", async () => {
    renderWithRouter(PROJECT_SCOPE);

    await waitFor(() => {
      expect(screen.getByText("Create custom personas with their own prompts and tools")).toBeInTheDocument();
      expect(screen.getByText("Run shell commands automatically on Claude Code events")).toBeInTheDocument();
      expect(screen.getByText("Define custom slash commands with prompt templates")).toBeInTheDocument();
      expect(screen.getByText("Connect Claude to external tools via Model Context Protocol")).toBeInTheDocument();
      expect(screen.getByText("Persistent notes Claude reads and writes across sessions")).toBeInTheDocument();
      expect(screen.getByText("Set default model, permissions, and file patterns")).toBeInTheDocument();
    });
  });

  // -- Backup & Restore tests --

  it("shows Export Config and Import Config buttons", async () => {
    renderWithRouter(PROJECT_SCOPE);

    expect(screen.getByText("Export Config")).toBeInTheDocument();
    expect(screen.getByText("Import Config")).toBeInTheDocument();
  });

  it("opens export modal with JSON when Export Config is clicked", async () => {
    const bundleJson = JSON.stringify({ version: "1.0", agents: [], skills: [] });
    mockExportConfigBundle.mockResolvedValue(bundleJson);

    renderWithRouter(PROJECT_SCOPE);

    fireEvent.click(screen.getByText("Export Config"));

    await waitFor(() => {
      expect(screen.getByText("Export Configuration")).toBeInTheDocument();
      expect(screen.getByTestId("export-textarea")).toHaveValue(bundleJson);
      expect(screen.getByText("Copy to Clipboard")).toBeInTheDocument();
    });

    expect(mockExportConfigBundle).toHaveBeenCalledWith("/projects/my-app", false);
  });

  it("opens import modal when Import Config is clicked", async () => {
    renderWithRouter(PROJECT_SCOPE);

    fireEvent.click(screen.getByText("Import Config"));

    await waitFor(() => {
      expect(screen.getByText("Import Configuration")).toBeInTheDocument();
      expect(screen.getByTestId("import-textarea")).toBeInTheDocument();
      expect(screen.getByText("Merge")).toBeInTheDocument();
      expect(screen.getByText("Overwrite")).toBeInTheDocument();
    });
  });

  it("disables import buttons when textarea is empty", async () => {
    renderWithRouter(PROJECT_SCOPE);

    fireEvent.click(screen.getByText("Import Config"));

    await waitFor(() => {
      expect(screen.getByText("Merge")).toBeDisabled();
      expect(screen.getByText("Overwrite")).toBeDisabled();
    });
  });

  it("calls importConfigBundle with merge mode when Merge is clicked", async () => {
    mockImportConfigBundle.mockResolvedValue({
      agentsImported: 2,
      skillsImported: 1,
      hooksImported: 0,
      mcpServersImported: 0,
      settingsImported: false,
    });

    renderWithRouter(PROJECT_SCOPE);

    fireEvent.click(screen.getByText("Import Config"));

    await waitFor(() => {
      expect(screen.getByTestId("import-textarea")).toBeInTheDocument();
    });

    const textarea = screen.getByTestId("import-textarea");
    fireEvent.change(textarea, { target: { value: '{"version":"1.0"}' } });

    fireEvent.click(screen.getByText("Merge"));

    await waitFor(() => {
      expect(mockImportConfigBundle).toHaveBeenCalledWith(
        "/projects/my-app",
        false,
        '{"version":"1.0"}',
        "merge"
      );
    });
  });

  it("calls importConfigBundle with overwrite mode when Overwrite is clicked", async () => {
    mockImportConfigBundle.mockResolvedValue({
      agentsImported: 0,
      skillsImported: 0,
      hooksImported: 0,
      mcpServersImported: 0,
      settingsImported: true,
    });

    renderWithRouter(PROJECT_SCOPE);

    fireEvent.click(screen.getByText("Import Config"));

    await waitFor(() => {
      expect(screen.getByTestId("import-textarea")).toBeInTheDocument();
    });

    const textarea = screen.getByTestId("import-textarea");
    fireEvent.change(textarea, { target: { value: '{"version":"1.0"}' } });

    fireEvent.click(screen.getByText("Overwrite"));

    await waitFor(() => {
      expect(mockImportConfigBundle).toHaveBeenCalledWith(
        "/projects/my-app",
        false,
        '{"version":"1.0"}',
        "overwrite"
      );
    });
  });

  it("uses isGlobal=true for global scope export", async () => {
    mockExportConfigBundle.mockResolvedValue("{}");

    renderWithRouter(GLOBAL_SCOPE);

    fireEvent.click(screen.getByText("Export Config"));

    await waitFor(() => {
      expect(mockExportConfigBundle).toHaveBeenCalledWith("/home/user", true);
    });
  });
});
