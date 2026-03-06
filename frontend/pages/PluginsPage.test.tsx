import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import { PluginsPage } from "./PluginsPage";
import type { Scope, Agent, Skill } from "@/types";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

const globalScope: Scope = {
  type: "global",
  homePath: "/home/user",
};

const projectScope: Scope = {
  type: "project",
  repo: {
    repo_id: "r1",
    name: "my-repo",
    path: "/home/user/my-repo",
    pinned: false,
    last_opened_at: null,
  },
};

const mockAgents: Agent[] = [
  {
    agentId: "code-reviewer",
    name: "Code Reviewer",
    description: "Reviews code",
    systemPrompt: "You review code.",
    tools: [],
    modelOverride: null,
    memory: null,
    color: null,
  },
];

const mockSkills: Skill[] = [
  {
    skillId: "lint-fix",
    name: "Lint Fix",
    description: "Fixes lint errors",
    content: "Fix lint errors in the codebase.",
    allowedTools: [],
  },
];

function setupMocks() {
  mockInvoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_plugins":
        return [];
      case "read_agents":
        return mockAgents;
      case "read_skills":
        return mockSkills;
      case "export_plugin":
        return "/tmp/plugins/test-plugin";
      case "get_import_sync_status":
        return [];
      case "get_plugin_sync_interval":
        return 30;
      default:
        return null;
    }
  });
}

describe("PluginsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("renders export button", async () => {
    renderWithProviders(<PluginsPage scope={projectScope} />);
    expect(screen.getByText("Export")).toBeInTheDocument();
  });

  it("allows export from global scope", async () => {
    renderWithProviders(<PluginsPage scope={globalScope} />);

    // Click the Export button
    fireEvent.click(screen.getByText("Export"));

    // Should load agents and skills using global basePath
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("read_agents", {
        repoPath: "/home/user",
      });
      expect(mockInvoke).toHaveBeenCalledWith("read_skills", {
        repoPath: "/home/user",
      });
    });

    // Should show the export form with loaded agents
    await waitFor(() => {
      expect(screen.getByText("Code Reviewer")).toBeInTheDocument();
    });
  });

  it("allows export from project scope", async () => {
    renderWithProviders(<PluginsPage scope={projectScope} />);

    fireEvent.click(screen.getByText("Export"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("read_agents", {
        repoPath: "/home/user/my-repo",
      });
      expect(mockInvoke).toHaveBeenCalledWith("read_skills", {
        repoPath: "/home/user/my-repo",
      });
    });
  });

  it("passes isGlobal=true when exporting from global scope", async () => {
    renderWithProviders(<PluginsPage scope={globalScope} />);

    // Open export wizard
    fireEvent.click(screen.getByText("Export"));

    await waitFor(() => {
      expect(screen.getByText("Bundle Name")).toBeInTheDocument();
    });

    // Fill in the required name field
    const nameInput = screen.getByPlaceholderText("My Config Bundle");
    fireEvent.change(nameInput, { target: { value: "Global Plugin" } });

    // Click the export button in the form
    const exportBtn = screen.getAllByText("Export").find(
      (el) => el.tagName === "BUTTON" && el.closest(".form-actions")
    );
    fireEvent.click(exportBtn!);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "export_plugin",
        expect.objectContaining({
          repoPath: "/home/user",
          name: "Global Plugin",
          isGlobal: true,
        })
      );
    });
  });

  it("passes isGlobal=false when exporting from project scope", async () => {
    renderWithProviders(<PluginsPage scope={projectScope} />);

    fireEvent.click(screen.getByText("Export"));

    await waitFor(() => {
      expect(screen.getByText("Bundle Name")).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText("My Config Bundle");
    fireEvent.change(nameInput, { target: { value: "Project Plugin" } });

    const exportBtn = screen.getAllByText("Export").find(
      (el) => el.tagName === "BUTTON" && el.closest(".form-actions")
    );
    fireEvent.click(exportBtn!);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "export_plugin",
        expect.objectContaining({
          repoPath: "/home/user/my-repo",
          name: "Project Plugin",
          isGlobal: false,
        })
      );
    });
  });

  it("shows global-specific empty text for agents when in global scope", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_plugins":
          return [];
        case "read_agents":
          return [];
        case "read_skills":
          return [];
        case "get_import_sync_status":
          return [];
        case "get_plugin_sync_interval":
          return 30;
        default:
          return null;
      }
    });

    renderWithProviders(<PluginsPage scope={globalScope} />);
    fireEvent.click(screen.getByText("Export"));

    await waitFor(() => {
      expect(screen.getByText("No global agents.")).toBeInTheDocument();
      expect(screen.getByText("No global skills.")).toBeInTheDocument();
    });
  });
});
