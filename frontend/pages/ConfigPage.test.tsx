import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import { ConfigPage } from "./ConfigPage";
import type { Scope, NormalizedConfig } from "@/types";

const mockReadClaudeConfig = vi.fn();
const mockWriteClaudeConfig = vi.fn();
const mockGetClaudeHome = vi.fn();

vi.mock("@/lib/tauri", () => ({
  readClaudeConfig: (...args: unknown[]) => mockReadClaudeConfig(...args),
  writeClaudeConfig: (...args: unknown[]) => mockWriteClaudeConfig(...args),
  getClaudeHome: (...args: unknown[]) => mockGetClaudeHome(...args),
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

const SAMPLE_CONFIG: NormalizedConfig = {
  model: "claude-sonnet-4-6",
  permissions: { allow: ["Bash(npm test)"], deny: ["Bash(rm -rf *)"] },
  ignorePatterns: ["node_modules", ".git", "dist"],
  raw: {
    model: "claude-sonnet-4-6",
    permissions: { allow: ["Bash(npm test)"], deny: ["Bash(rm -rf *)"] },
    ignorePatterns: ["node_modules", ".git", "dist"],
  },
};

const EMPTY_CONFIG: NormalizedConfig = {
  model: null,
  permissions: null,
  ignorePatterns: null,
  raw: {},
};

describe("ConfigPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClaudeHome.mockResolvedValue("/home/user");
    mockWriteClaudeConfig.mockResolvedValue(undefined);
  });

  it("shows empty state when no scope selected", () => {
    renderWithProviders(<ConfigPage scope={null} />);
    expect(screen.getByText("Select a scope to manage settings.")).toBeInTheDocument();
  });

  it("renders form fields directly without edit button", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument();
    });

    // Should NOT have an Edit button — fields are always editable
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("renders model dropdown with current value", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      const select = screen.getByDisplayValue("Claude Sonnet 4.6");
      expect(select).toBeInTheDocument();
      expect(select).not.toBeDisabled();
    });
  });

  it("renders ignore patterns as tags", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("node_modules")).toBeInTheDocument();
      expect(screen.getByText(".git")).toBeInTheDocument();
      expect(screen.getByText("dist")).toBeInTheDocument();
    });
  });

  it("renders permission allow/deny tools as tags", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      // Tags appear as .tag elements; hint <code> elements also contain tool names
      expect(screen.getByLabelText("Remove Bash(npm test)")).toBeInTheDocument();
      expect(screen.getByLabelText("Remove Bash(rm -rf *)")).toBeInTheDocument();
    });
  });

  it("shows save bar when model is changed", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument();
    });

    // No save bar initially
    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();

    // Change the model
    fireEvent.change(screen.getByDisplayValue("Claude Sonnet 4.6"), {
      target: { value: "claude-opus-4-6" },
    });

    expect(screen.getByTestId("save-bar")).toBeInTheDocument();
    expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
  });

  it("save bar disappears after discard", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("Claude Sonnet 4.6"), {
      target: { value: "claude-opus-4-6" },
    });

    expect(screen.getByTestId("save-bar")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Discard"));

    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument();
  });

  it("saves config when Save Changes is clicked", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue("Claude Sonnet 4.6"), {
      target: { value: "claude-opus-4-6" },
    });

    // After save, the backend is called and config is reloaded
    const updatedConfig = { ...SAMPLE_CONFIG, model: "claude-opus-4-6" };
    mockReadClaudeConfig.mockResolvedValue(updatedConfig);

    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(mockWriteClaudeConfig).toHaveBeenCalledWith(
        "/home/user",
        expect.objectContaining({ model: "claude-opus-4-6" })
      );
    });
  });

  it("can add and remove ignore pattern tags", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("node_modules")).toBeInTheDocument();
    });

    // Add a new pattern via the ignore patterns input
    const patternInput = screen.getByPlaceholderText("Add pattern...");
    fireEvent.change(patternInput, { target: { value: "coverage" } });
    fireEvent.keyDown(patternInput, { key: "Enter" });

    expect(screen.getByText("coverage")).toBeInTheDocument();

    // Remove a pattern
    fireEvent.click(screen.getByLabelText("Remove node_modules"));

    expect(screen.queryByText("node_modules")).not.toBeInTheDocument();
  });

  it("can add allowed tool via Enter key", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Settings Studio")).toBeInTheDocument();
    });

    const allowInput = screen.getByPlaceholderText("Add tool pattern...");
    fireEvent.change(allowInput, { target: { value: "MyTool" } });
    fireEvent.keyDown(allowInput, { key: "Enter" });

    expect(screen.getByText("MyTool")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove MyTool")).toBeInTheDocument();
  });

  it("toggles advanced JSON section", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Advanced (JSON)")).toBeInTheDocument();
    });

    // Advanced section should be collapsed initially
    expect(screen.queryByText(/Edit raw JSON/)).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText("Advanced (JSON)"));

    expect(screen.getByText(/Edit raw JSON/)).toBeInTheDocument();
  });

  it("shows JSON error for invalid advanced JSON", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Advanced (JSON)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Advanced (JSON)"));

    const jsonTextarea = document.querySelector(".advanced-json-editor") as HTMLTextAreaElement;
    expect(jsonTextarea).toBeTruthy();

    fireEvent.change(jsonTextarea, { target: { value: "{invalid" } });

    await waitFor(() => {
      const errorMsg = document.querySelector(".field-error-message");
      expect(errorMsg).toBeTruthy();
    });
  });

  it("renders empty form when no config file exists", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Not set (defaults to Opus)")).toBeInTheDocument();
    });

    // Should show the form directly without a "No config found" card
    expect(screen.queryByText("No config found")).not.toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
    expect(screen.getByText("File Patterns")).toBeInTheDocument();
  });

  it("shows source badges in project scope with global fallback", async () => {
    const globalCfg: NormalizedConfig = {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: ["node_modules"],
      raw: { model: "claude-sonnet-4-6", ignorePatterns: ["node_modules"] },
    };

    mockReadClaudeConfig.mockImplementation(async (path: string) => {
      if (path === "/projects/my-app") return EMPTY_CONFIG;
      if (path === "/home/user") return globalCfg;
      return EMPTY_CONFIG;
    });

    renderWithProviders(<ConfigPage scope={PROJECT_SCOPE} />);

    // Wait for global config to load (requires homePath to be set first)
    await waitFor(
      () => {
        const inherited = screen.queryAllByText(/Inherited from global/);
        expect(inherited.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  it("shows project override badge when project has its own value", async () => {
    const projectCfg: NormalizedConfig = {
      model: "claude-opus-4-6",
      permissions: null,
      ignorePatterns: null,
      raw: { model: "claude-opus-4-6" },
    };
    const globalCfg: NormalizedConfig = {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: null,
      raw: { model: "claude-sonnet-4-6" },
    };

    mockReadClaudeConfig.mockImplementation(async (path: string) => {
      if (path === "/projects/my-app") return projectCfg;
      if (path === "/home/user") return globalCfg;
      return EMPTY_CONFIG;
    });

    renderWithProviders(<ConfigPage scope={PROJECT_SCOPE} />);

    await waitFor(
      () => {
        expect(screen.getByText("Project override")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("shows global scope banner for global scope", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText(/Global Scope/)).toBeInTheDocument();
    });
  });

  it("does not show source badges in global scope", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Settings Studio")).toBeInTheDocument();
    });

    expect(screen.queryByText("Inherited from global")).not.toBeInTheDocument();
    expect(screen.queryByText("Project override")).not.toBeInTheDocument();
  });

  it("does not show save bar when config is unchanged", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();
  });

  it("disables Save button when JSON is invalid", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Advanced (JSON)")).toBeInTheDocument();
    });

    // Expand advanced and break the JSON
    fireEvent.click(screen.getByText("Advanced (JSON)"));
    const jsonTextarea = document.querySelector(".advanced-json-editor") as HTMLTextAreaElement;
    fireEvent.change(jsonTextarea, { target: { value: "{bad" } });

    await waitFor(() => {
      const saveBtn = screen.getByText("Save Changes");
      expect(saveBtn).toBeDisabled();
    });
  });

  it("prevents adding duplicate ignore patterns", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("node_modules")).toBeInTheDocument();
    });

    // Try to add a duplicate
    const input = screen.getByPlaceholderText("Add pattern...");
    fireEvent.change(input, { target: { value: "node_modules" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Should still have exactly one node_modules tag
    const tags = screen.getAllByText("node_modules");
    expect(tags.length).toBe(1);
  });

  it("shows global hint for model when project model is not set", async () => {
    const globalCfg: NormalizedConfig = {
      model: "claude-sonnet-4-6",
      permissions: null,
      ignorePatterns: null,
      raw: { model: "claude-sonnet-4-6" },
    };

    mockReadClaudeConfig.mockImplementation(async (path: string) => {
      if (path === "/projects/my-app") return EMPTY_CONFIG;
      if (path === "/home/user") return globalCfg;
      return EMPTY_CONFIG;
    });

    renderWithProviders(<ConfigPage scope={PROJECT_SCOPE} />);

    await waitFor(
      () => {
        expect(screen.getByText(/Using global setting/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  // -- Feature Toggles tests --

  it("renders feature toggle checkboxes", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Feature Toggles")).toBeInTheDocument();
    });

    expect(screen.getByText("Agent Teams (Experimental)")).toBeInTheDocument();
    expect(screen.getByText("Fast Mode")).toBeInTheDocument();
    expect(screen.getByText("Extended Thinking")).toBeInTheDocument();
    expect(screen.getByText("Auto-approve Project MCP Servers")).toBeInTheDocument();
    expect(screen.getByText("Respect .gitignore")).toBeInTheDocument();
    expect(screen.getByText("Disable All Hooks")).toBeInTheDocument();
    // New toggles
    expect(screen.getByText("Show Turn Duration")).toBeInTheDocument();
    expect(screen.getByText("Terminal Progress Bar")).toBeInTheDocument();
    expect(screen.getByText("Spinner Tips")).toBeInTheDocument();
    expect(screen.getByText("Reduced Motion")).toBeInTheDocument();
    expect(screen.getByText("Fast Mode Per-Session Opt-In")).toBeInTheDocument();
  });

  it("reads toggle values from raw config", async () => {
    const configWithToggles: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { fastMode: true, alwaysThinkingEnabled: true },
    };
    mockReadClaudeConfig.mockResolvedValue(configWithToggles);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Feature Toggles")).toBeInTheDocument();
    });

    // Fast Mode and Extended Thinking should be checked
    const checkboxes = screen.getAllByRole("checkbox");
    const fastModeCheckbox = checkboxes.find(
      (cb) => cb.closest("label")?.textContent?.includes("Fast Mode")
    ) as HTMLInputElement;
    const thinkingCheckbox = checkboxes.find(
      (cb) => cb.closest("label")?.textContent?.includes("Extended Thinking")
    ) as HTMLInputElement;

    expect(fastModeCheckbox.checked).toBe(true);
    expect(thinkingCheckbox.checked).toBe(true);
  });

  it("reads agent teams toggle from env section", async () => {
    const configWithTeams: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } },
    };
    mockReadClaudeConfig.mockResolvedValue(configWithTeams);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Feature Toggles")).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole("checkbox");
    const teamsCheckbox = checkboxes.find(
      (cb) =>
        cb.closest("label")?.textContent?.includes("Agent Teams")
    ) as HTMLInputElement;

    expect(teamsCheckbox.checked).toBe(true);
  });

  it("shows save bar when a toggle is changed", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Feature Toggles")).toBeInTheDocument();
    });

    // No save bar initially
    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();

    // Toggle Fast Mode on
    const checkboxes = screen.getAllByRole("checkbox");
    const fastModeCheckbox = checkboxes.find(
      (cb) => cb.closest("label")?.textContent?.includes("Fast Mode")
    ) as HTMLInputElement;
    fireEvent.click(fastModeCheckbox);

    expect(screen.getByTestId("save-bar")).toBeInTheDocument();
  });

  it("saves toggle values in raw config", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Feature Toggles")).toBeInTheDocument();
    });

    // Toggle Fast Mode on
    const checkboxes = screen.getAllByRole("checkbox");
    const fastModeCheckbox = checkboxes.find(
      (cb) => cb.closest("label")?.textContent?.includes("Fast Mode")
    ) as HTMLInputElement;
    fireEvent.click(fastModeCheckbox);

    // After save, the backend is called and config is reloaded
    const updatedConfig: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { fastMode: true },
    };
    mockReadClaudeConfig.mockResolvedValue(updatedConfig);

    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(mockWriteClaudeConfig).toHaveBeenCalledWith(
        "/home/user",
        expect.objectContaining({
          raw: expect.objectContaining({ fastMode: true }),
        })
      );
    });
  });

  it("saves agent teams toggle to env section in raw", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Feature Toggles")).toBeInTheDocument();
    });

    // Toggle Agent Teams on
    const checkboxes = screen.getAllByRole("checkbox");
    const teamsCheckbox = checkboxes.find(
      (cb) =>
        cb.closest("label")?.textContent?.includes("Agent Teams")
    ) as HTMLInputElement;
    fireEvent.click(teamsCheckbox);

    const updatedConfig: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } },
    };
    mockReadClaudeConfig.mockResolvedValue(updatedConfig);

    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(mockWriteClaudeConfig).toHaveBeenCalledWith(
        "/home/user",
        expect.objectContaining({
          raw: expect.objectContaining({
            env: expect.objectContaining({
              CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
            }),
          }),
        })
      );
    });
  });

  it("model dropdown shows default Opus hint", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("Not set (defaults to Opus)")
      ).toBeInTheDocument();
    });
  });

  // -- New settings sections tests --

  it("renders the Language field in General section", async () => {
    const configWithLang: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { language: "japanese" },
    };
    mockReadClaudeConfig.mockResolvedValue(configWithLang);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("japanese")).toBeInTheDocument();
    });
  });

  it("renders the Output Style field", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { outputStyle: "Concise" },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Concise")).toBeInTheDocument();
    });
  });

  it("renders Available Models as tags", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { availableModels: ["sonnet", "haiku"] },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("sonnet")).toBeInTheDocument();
      expect(screen.getByText("haiku")).toBeInTheDocument();
    });
  });

  it("renders the Attribution section", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Attribution")).toBeInTheDocument();
      expect(screen.getByText("Commit Attribution")).toBeInTheDocument();
      expect(screen.getByText("PR Attribution")).toBeInTheDocument();
    });
  });

  it("populates attribution fields from config", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { attribution: { commit: "Co-Authored-By: AI", pr: "Generated by AI" } },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Co-Authored-By: AI")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Generated by AI")).toBeInTheDocument();
    });
  });

  it("renders the MCP Server Approval section", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("MCP Server Approval")).toBeInTheDocument();
      expect(screen.getByText("Enabled MCP Servers")).toBeInTheDocument();
      expect(screen.getByText("Disabled MCP Servers")).toBeInTheDocument();
    });
  });

  it("renders enabled/disabled MCP servers from config", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: {
        enabledMcpjsonServers: ["memory", "github"],
        disabledMcpjsonServers: ["filesystem"],
      },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("memory")).toBeInTheDocument();
      expect(screen.getByText("github")).toBeInTheDocument();
      expect(screen.getByText("filesystem")).toBeInTheDocument();
    });
  });

  it("renders the Environment Variables section", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Environment Variables")).toBeInTheDocument();
      expect(screen.getByText("No environment variables set")).toBeInTheDocument();
    });
  });

  it("populates env vars from config (excluding managed toggle keys)", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: {
        env: {
          FOO: "bar",
          MY_TOKEN: "secret123",
          CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1", // managed, should be excluded
        },
      },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("FOO")).toBeInTheDocument();
      expect(screen.getByText("bar")).toBeInTheDocument();
      expect(screen.getByText("MY_TOKEN")).toBeInTheDocument();
    });

    // The managed key should not appear in the env var editor
    expect(screen.queryByText("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS")).not.toBeInTheDocument();
  });

  it("renders the Session & Updates section", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Session & Updates")).toBeInTheDocument();
    });
  });

  it("populates cleanupPeriodDays from config", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { cleanupPeriodDays: 15 },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("15")).toBeInTheDocument();
    });
  });

  it("renders the Custom Scripts section", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Custom Scripts")).toBeInTheDocument();
      expect(screen.getByText("API Key Helper")).toBeInTheDocument();
      expect(screen.getByText("OTEL Headers Helper")).toBeInTheDocument();
      expect(screen.getByText("AWS Auth Refresh")).toBeInTheDocument();
      expect(screen.getByText("AWS Credential Export")).toBeInTheDocument();
    });
  });

  it("populates custom script fields from config", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: {
        apiKeyHelper: "/bin/gen_key.sh",
        awsAuthRefresh: "aws sso login",
      },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("/bin/gen_key.sh")).toBeInTheDocument();
      expect(screen.getByDisplayValue("aws sso login")).toBeInTheDocument();
    });
  });

  it("renders the Hook Controls section", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Hook Controls")).toBeInTheDocument();
      expect(screen.getByText("Allowed HTTP Hook URLs")).toBeInTheDocument();
      expect(screen.getByText("HTTP Hook Allowed Env Vars")).toBeInTheDocument();
    });
  });

  it("renders hook control tags from config", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: {
        allowedHttpHookUrls: ["https://hooks.example.com/*"],
        httpHookAllowedEnvVars: ["MY_TOKEN"],
      },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("https://hooks.example.com/*")).toBeInTheDocument();
      expect(screen.getByText("MY_TOKEN")).toBeInTheDocument();
    });
  });

  it("renders Permission Default Mode dropdown", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: { defaultMode: "acceptEdits", allow: [], deny: [] },
      ignorePatterns: null,
      raw: { permissions: { defaultMode: "acceptEdits", allow: [], deny: [] } },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Default Permission Mode")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Accept Edits")).toBeInTheDocument();
    });
  });

  it("renders Ask Tools tag input", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: { allow: [], deny: [], ask: ["Bash(git push *)"] },
      ignorePatterns: null,
      raw: { permissions: { allow: [], deny: [], ask: ["Bash(git push *)"] } },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Ask Tools")).toBeInTheDocument();
      expect(screen.getByText("Bash(git push *)")).toBeInTheDocument();
    });
  });

  it("renders Additional Directories tag input", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: { allow: [], deny: [], additionalDirectories: ["../docs/"] },
      ignorePatterns: null,
      raw: { permissions: { allow: [], deny: [], additionalDirectories: ["../docs/"] } },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Additional Directories")).toBeInTheDocument();
      expect(screen.getByText("../docs/")).toBeInTheDocument();
    });
  });

  it("renders Teammate Mode dropdown", async () => {
    const config: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { teammateMode: "tmux" },
    };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("tmux")).toBeInTheDocument();
    });
  });

  it("shows save bar when language is changed", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Settings Studio")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();

    const langInput = screen.getByPlaceholderText("Not set (defaults to English)");
    fireEvent.change(langInput, { target: { value: "spanish" } });

    expect(screen.getByTestId("save-bar")).toBeInTheDocument();
  });

  it("saves attribution values to raw config", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(screen.getByText("Attribution")).toBeInTheDocument();
    });

    const commitTextarea = screen.getByPlaceholderText(/Co-Authored-By/);
    fireEvent.change(commitTextarea, { target: { value: "Co-Authored-By: AI" } });

    const updatedConfig: NormalizedConfig = {
      model: null,
      permissions: null,
      ignorePatterns: null,
      raw: { attribution: { commit: "Co-Authored-By: AI" } },
    };
    mockReadClaudeConfig.mockResolvedValue(updatedConfig);

    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(mockWriteClaudeConfig).toHaveBeenCalledWith(
        "/home/user",
        expect.objectContaining({
          raw: expect.objectContaining({
            attribution: expect.objectContaining({ commit: "Co-Authored-By: AI" }),
          }),
        })
      );
    });
  });
});
