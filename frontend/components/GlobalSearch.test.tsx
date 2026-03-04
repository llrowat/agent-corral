import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import { MemoryRouter } from "react-router-dom";
import { GlobalSearch } from "./GlobalSearch";
import type { Scope } from "@/types";

const mockReadAgents = vi.fn();
const mockReadHooks = vi.fn();
const mockReadSkills = vi.fn();
const mockReadMcpServers = vi.fn();
const mockReadMemoryStores = vi.fn();
const mockListPlugins = vi.fn();
const mockListConfigSnapshots = vi.fn();

vi.mock("@/lib/tauri", () => ({
  readAgents: (...args: unknown[]) => mockReadAgents(...args),
  readHooks: (...args: unknown[]) => mockReadHooks(...args),
  readSkills: (...args: unknown[]) => mockReadSkills(...args),
  readMcpServers: (...args: unknown[]) => mockReadMcpServers(...args),
  readMemoryStores: (...args: unknown[]) => mockReadMemoryStores(...args),
  listPlugins: (...args: unknown[]) => mockListPlugins(...args),
  listConfigSnapshots: (...args: unknown[]) => mockListConfigSnapshots(...args),
}));

const HOME_PATH = "/home/user";

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
  homePath: HOME_PATH,
};

function renderSearch(scope: Scope | null = PROJECT_SCOPE, homePath: string | null = HOME_PATH) {
  return renderWithProviders(
    <MemoryRouter>
      <GlobalSearch scope={scope} homePath={homePath} />
    </MemoryRouter>
  );
}

function openSearch() {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
}

/** Helper: mock returns data on first call (project scope), empty on second (global scope) */
function mockForProjectScope(mockFn: ReturnType<typeof vi.fn>, data: unknown[]) {
  mockFn.mockResolvedValueOnce(data).mockResolvedValueOnce([]);
}

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadAgents.mockResolvedValue([]);
    mockReadHooks.mockResolvedValue([]);
    mockReadSkills.mockResolvedValue([]);
    mockReadMcpServers.mockResolvedValue([]);
    mockReadMemoryStores.mockResolvedValue([]);
    mockListPlugins.mockResolvedValue([]);
    mockListConfigSnapshots.mockResolvedValue([]);
  });

  it("opens with Ctrl+K and shows search input", async () => {
    renderSearch();
    openSearch();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search agents/)).toBeInTheDocument();
    });
  });

  it("shows static navigation items for all pages", async () => {
    renderSearch();
    openSearch();
    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
      expect(screen.getByText("Plugins")).toBeInTheDocument();
      expect(screen.getByText("History")).toBeInTheDocument();
      expect(screen.getByText("Preferences")).toBeInTheDocument();
    });
  });

  it("includes agents in search results", async () => {
    mockForProjectScope(mockReadAgents, [
      { agentId: "reviewer", name: "Code Reviewer", description: "Reviews code", systemPrompt: "", tools: [], modelOverride: null, memory: null },
    ]);

    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("Code Reviewer")).toBeInTheDocument();
      expect(screen.getByText("Agent: reviewer — Reviews code")).toBeInTheDocument();
    });
  });

  it("includes skills in search results", async () => {
    mockForProjectScope(mockReadSkills, [
      { skillId: "commit", name: "Commit Helper", content: "", allowedTools: [], userInvocable: true },
    ]);

    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("Commit Helper")).toBeInTheDocument();
      expect(screen.getByText("Skill: commit (invocable)")).toBeInTheDocument();
    });
  });

  it("includes memory stores in search results", async () => {
    mockForProjectScope(mockReadMemoryStores, [
      { storeId: "default", name: "default", path: "/test", entryCount: 5 },
    ]);

    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("Memory: 5 entries")).toBeInTheDocument();
    });
  });

  it("includes hooks in search results", async () => {
    mockForProjectScope(mockReadHooks, [
      { event: "PreToolUse", groups: [{ matcher: null, hooks: [{ hookType: "command", command: "echo" }] }] },
    ]);

    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeInTheDocument();
      expect(screen.getByText("Hook: 1 handler(s)")).toBeInTheDocument();
    });
  });

  it("includes MCP servers in search results", async () => {
    mockForProjectScope(mockReadMcpServers, [
      { serverId: "filesystem", serverType: "stdio", command: "npx @modelcontextprotocol/server-filesystem" },
    ]);

    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("filesystem")).toBeInTheDocument();
    });
  });

  it("includes plugins in search results", async () => {
    mockListPlugins.mockResolvedValue([
      {
        pluginId: "my-plugin",
        name: "My Plugin",
        description: "A test plugin",
        version: "1.0.0",
        author: null,
        agentCount: 1,
        skillCount: 0,
        hookCount: 0,
        mcpCount: 0,
        hasConfig: false,
        dirPath: "/plugins/my-plugin",
        source: "local",
        gitSource: null,
      },
    ]);

    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("My Plugin")).toBeInTheDocument();
      expect(screen.getByText("Plugin: A test plugin")).toBeInTheDocument();
    });
  });

  it("includes history snapshots in search results", async () => {
    mockForProjectScope(mockListConfigSnapshots, [
      {
        snapshotId: "snap-1",
        label: "Before refactor",
        timestamp: "2026-03-01T12:00:00Z",
        hasSettings: true,
      },
    ]);

    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("Before refactor")).toBeInTheDocument();
      expect(screen.getByText("Snapshot: 2026-03-01T12:00:00Z")).toBeInTheDocument();
    });
  });

  it("searches across both project and global scopes", async () => {
    mockReadAgents
      .mockResolvedValueOnce([
        { agentId: "local-agent", name: "Local Agent", description: "Project agent", systemPrompt: "", tools: [], modelOverride: null, memory: null },
      ])
      .mockResolvedValueOnce([
        { agentId: "global-agent", name: "Global Agent", description: "Global agent", systemPrompt: "", tools: [], modelOverride: null, memory: null },
      ]);

    renderSearch(PROJECT_SCOPE, HOME_PATH);
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("Local Agent")).toBeInTheDocument();
      expect(screen.getByText("Global Agent")).toBeInTheDocument();
    });

    expect(mockReadAgents).toHaveBeenCalledWith("/projects/my-app");
    expect(mockReadAgents).toHaveBeenCalledWith(HOME_PATH);
  });

  it("shows scope labels on results", async () => {
    mockReadAgents
      .mockResolvedValueOnce([
        { agentId: "local-agent", name: "Local Agent", description: "Project agent", systemPrompt: "", tools: [], modelOverride: null, memory: null },
      ])
      .mockResolvedValueOnce([
        { agentId: "global-agent", name: "Global Agent", description: "Global agent", systemPrompt: "", tools: [], modelOverride: null, memory: null },
      ]);

    renderSearch(PROJECT_SCOPE, HOME_PATH);
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("Local Agent")).toBeInTheDocument();
      expect(screen.getByText("Global Agent")).toBeInTheDocument();
      expect(screen.getByText("project")).toBeInTheDocument();
      expect(screen.getByText("global")).toBeInTheDocument();
    });
  });

  it("loads only global scope when global scope is selected", async () => {
    mockReadAgents.mockResolvedValue([
      { agentId: "g-agent", name: "G Agent", description: "", systemPrompt: "", tools: [], modelOverride: null, memory: null },
    ]);

    renderSearch(GLOBAL_SCOPE, HOME_PATH);
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("G Agent")).toBeInTheDocument();
    });

    // Should only call with global path (no project path)
    expect(mockReadAgents).toHaveBeenCalledTimes(1);
    expect(mockReadAgents).toHaveBeenCalledWith(HOME_PATH);
  });

  it("loads global scope when no scope selected but homePath available", async () => {
    mockReadAgents.mockResolvedValue([
      { agentId: "g-agent", name: "G Agent", description: "", systemPrompt: "", tools: [], modelOverride: null, memory: null },
    ]);

    renderSearch(null, HOME_PATH);
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("G Agent")).toBeInTheDocument();
    });

    expect(mockReadAgents).toHaveBeenCalledWith(HOME_PATH);
  });

  it("filters results by query across all entity types", async () => {
    mockForProjectScope(mockReadAgents, [
      { agentId: "reviewer", name: "Code Reviewer", description: "Reviews code", systemPrompt: "", tools: [], modelOverride: null, memory: null },
    ]);
    mockListPlugins.mockResolvedValue([
      {
        pluginId: "review-pack",
        name: "Review Pack",
        description: "Review tools",
        version: "1.0.0",
        author: null,
        agentCount: 0,
        skillCount: 0,
        hookCount: 0,
        mcpCount: 0,
        hasConfig: false,
        dirPath: "/plugins/review-pack",
        source: "local",
        gitSource: null,
      },
    ]);

    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("Code Reviewer")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Search agents/);
    fireEvent.change(input, { target: { value: "review" } });

    await waitFor(() => {
      expect(screen.getByText("Code Reviewer")).toBeInTheDocument();
      expect(screen.getByText("Review Pack")).toBeInTheDocument();
      expect(screen.queryByText("Overview")).not.toBeInTheDocument();
      expect(screen.queryByText("Preferences")).not.toBeInTheDocument();
    });
  });

  it("still shows other entity types when one API call fails", async () => {
    mockReadAgents.mockRejectedValue(new Error("Backend error"));
    mockForProjectScope(mockReadSkills, [
      { skillId: "commit", name: "Commit Helper", content: "", allowedTools: [], userInvocable: false },
    ]);

    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("Commit Helper")).toBeInTheDocument();
    });
  });

  it("does not render when closed", () => {
    renderSearch();
    expect(screen.queryByPlaceholderText(/Search agents/)).not.toBeInTheDocument();
  });

  it("closes on Escape key", async () => {
    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search agents/)).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Search agents/)).not.toBeInTheDocument();
    });
  });

  it("shows no items when no scope and no homePath", async () => {
    renderSearch(null, null);
    openSearch();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search agents/)).toBeInTheDocument();
      expect(screen.getByText("No items found")).toBeInTheDocument();
    });

    expect(mockReadAgents).not.toHaveBeenCalled();
  });

  it("shows loading state while items are being fetched", async () => {
    let resolveAgents: (v: unknown[]) => void;
    mockReadAgents.mockReturnValue(new Promise((r) => { resolveAgents = r; }));

    renderSearch();
    openSearch();

    await waitFor(() => {
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    resolveAgents!([]);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });
});
