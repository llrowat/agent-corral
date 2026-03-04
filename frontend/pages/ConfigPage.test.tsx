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
  repo: { repo_id: "1", name: "my-app", path: "/projects/my-app", pinned: false, last_opened_at: null },
};

const GLOBAL_SCOPE: Scope = { type: "global", homePath: "/home/user" };

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
  model: null, permissions: null, ignorePatterns: null, raw: {},
};

/** Open a collapsible section by clicking its title */
function openSection(title: string) {
  const btn = screen.getByText(title).closest("button");
  if (btn) fireEvent.click(btn);
}

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
    await waitFor(() => { expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument(); });
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

  it("renders ignore patterns as tags after expanding File Patterns", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    openSection("File Patterns");
    expect(screen.getByText("node_modules")).toBeInTheDocument();
    expect(screen.getByText(".git")).toBeInTheDocument();
    expect(screen.getByText("dist")).toBeInTheDocument();
  });

  it("renders permission allow/deny tools as tags after expanding Permissions", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    openSection("Permissions");
    expect(screen.getByLabelText("Remove Bash(npm test)")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove Bash(rm -rf *)")).toBeInTheDocument();
  });

  it("shows save bar when model is changed", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument(); });
    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Claude Sonnet 4.6"), { target: { value: "claude-opus-4-6" } });
    expect(screen.getByTestId("save-bar")).toBeInTheDocument();
    expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
  });

  it("save bar disappears after discard", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument(); });
    fireEvent.change(screen.getByDisplayValue("Claude Sonnet 4.6"), { target: { value: "claude-opus-4-6" } });
    expect(screen.getByTestId("save-bar")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Discard"));
    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument();
  });

  it("saves config when Save Changes is clicked", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument(); });
    fireEvent.change(screen.getByDisplayValue("Claude Sonnet 4.6"), { target: { value: "claude-opus-4-6" } });
    const updatedConfig = { ...SAMPLE_CONFIG, model: "claude-opus-4-6" };
    mockReadClaudeConfig.mockResolvedValue(updatedConfig);
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(mockWriteClaudeConfig).toHaveBeenCalledWith("/home/user", expect.objectContaining({ model: "claude-opus-4-6" }));
    });
  });

  it("can add and remove ignore pattern tags", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    openSection("File Patterns");
    expect(screen.getByText("node_modules")).toBeInTheDocument();
    const patternInput = screen.getByPlaceholderText("Add pattern...");
    fireEvent.change(patternInput, { target: { value: "coverage" } });
    fireEvent.keyDown(patternInput, { key: "Enter" });
    expect(screen.getByText("coverage")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Remove node_modules"));
    expect(screen.queryByText("node_modules")).not.toBeInTheDocument();
  });

  it("can add allowed tool via Enter key", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    openSection("Permissions");
    const allowInput = screen.getByPlaceholderText("Add tool pattern...");
    fireEvent.change(allowInput, { target: { value: "MyTool" } });
    fireEvent.keyDown(allowInput, { key: "Enter" });
    expect(screen.getByText("MyTool")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove MyTool")).toBeInTheDocument();
  });

  it("toggles advanced JSON section", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Advanced (JSON)")).toBeInTheDocument(); });
    expect(screen.queryByText(/Edit raw JSON/)).not.toBeInTheDocument();
    openSection("Advanced (JSON)");
    expect(screen.getByText(/Edit raw JSON/)).toBeInTheDocument();
  });

  it("shows JSON error for invalid advanced JSON", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Advanced (JSON)")).toBeInTheDocument(); });
    openSection("Advanced (JSON)");
    const jsonTextarea = document.querySelector(".advanced-json-editor") as HTMLTextAreaElement;
    expect(jsonTextarea).toBeTruthy();
    fireEvent.change(jsonTextarea, { target: { value: "{invalid" } });
    await waitFor(() => { expect(document.querySelector(".field-error-message")).toBeTruthy(); });
  });

  it("renders empty form when no config file exists", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByDisplayValue("Not set (defaults to Opus)")).toBeInTheDocument(); });
    expect(screen.queryByText("No config found")).not.toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
    expect(screen.getByText("File Patterns")).toBeInTheDocument();
  });

  it("shows source badges in project scope with global fallback", async () => {
    const globalCfg: NormalizedConfig = {
      model: "claude-sonnet-4-6", permissions: null, ignorePatterns: ["node_modules"],
      raw: { model: "claude-sonnet-4-6", ignorePatterns: ["node_modules"] },
    };
    mockReadClaudeConfig.mockImplementation(async (path: string) => {
      if (path === "/projects/my-app") return EMPTY_CONFIG;
      if (path === "/home/user") return globalCfg;
      return EMPTY_CONFIG;
    });
    renderWithProviders(<ConfigPage scope={PROJECT_SCOPE} />);
    await waitFor(() => {
      const inherited = screen.queryAllByText(/Inherited from global/);
      expect(inherited.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it("shows project override badge when project has its own value", async () => {
    const projectCfg: NormalizedConfig = { model: "claude-opus-4-6", permissions: null, ignorePatterns: null, raw: { model: "claude-opus-4-6" } };
    const globalCfg: NormalizedConfig = { model: "claude-sonnet-4-6", permissions: null, ignorePatterns: null, raw: { model: "claude-sonnet-4-6" } };
    mockReadClaudeConfig.mockImplementation(async (path: string) => {
      if (path === "/projects/my-app") return projectCfg;
      if (path === "/home/user") return globalCfg;
      return EMPTY_CONFIG;
    });
    renderWithProviders(<ConfigPage scope={PROJECT_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Project override")).toBeInTheDocument(); }, { timeout: 3000 });
  });

  it("shows global scope banner for global scope", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText(/Global Scope/)).toBeInTheDocument(); });
  });

  it("does not show source badges in global scope", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    expect(screen.queryByText("Inherited from global")).not.toBeInTheDocument();
    expect(screen.queryByText("Project override")).not.toBeInTheDocument();
  });

  it("does not show save bar when config is unchanged", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByDisplayValue("Claude Sonnet 4.6")).toBeInTheDocument(); });
    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();
  });

  it("disables Save button when JSON is invalid", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Advanced (JSON)")).toBeInTheDocument(); });
    openSection("Advanced (JSON)");
    const jsonTextarea = document.querySelector(".advanced-json-editor") as HTMLTextAreaElement;
    fireEvent.change(jsonTextarea, { target: { value: "{bad" } });
    await waitFor(() => { expect(screen.getByText("Save Changes")).toBeDisabled(); });
  });

  it("prevents adding duplicate ignore patterns", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    openSection("File Patterns");
    const input = screen.getByPlaceholderText("Add pattern...");
    fireEvent.change(input, { target: { value: "node_modules" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const tags = screen.getAllByText("node_modules");
    expect(tags.length).toBe(1);
  });

  it("shows global hint for model when project model is not set", async () => {
    const globalCfg: NormalizedConfig = { model: "claude-sonnet-4-6", permissions: null, ignorePatterns: null, raw: { model: "claude-sonnet-4-6" } };
    mockReadClaudeConfig.mockImplementation(async (path: string) => {
      if (path === "/projects/my-app") return EMPTY_CONFIG;
      if (path === "/home/user") return globalCfg;
      return EMPTY_CONFIG;
    });
    renderWithProviders(<ConfigPage scope={PROJECT_SCOPE} />);
    await waitFor(() => { expect(screen.getByText(/Using global setting/)).toBeInTheDocument(); }, { timeout: 3000 });
  });

  // -- Feature Toggles --

  it("renders feature toggle checkboxes", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Feature Toggles")).toBeInTheDocument(); });
    expect(screen.getByText("Agent Teams (Experimental)")).toBeInTheDocument();
    expect(screen.getByText("Fast Mode")).toBeInTheDocument();
    expect(screen.getByText("Extended Thinking")).toBeInTheDocument();
    expect(screen.getByText("Auto-approve Project MCP Servers")).toBeInTheDocument();
    expect(screen.getByText("Respect .gitignore")).toBeInTheDocument();
    expect(screen.getByText("Disable All Hooks")).toBeInTheDocument();
    expect(screen.getByText("Show Turn Duration")).toBeInTheDocument();
    expect(screen.getByText("Terminal Progress Bar")).toBeInTheDocument();
    expect(screen.getByText("Spinner Tips")).toBeInTheDocument();
    expect(screen.getByText("Reduced Motion")).toBeInTheDocument();
    expect(screen.getByText("Fast Mode Per-Session Opt-In")).toBeInTheDocument();
  });

  it("reads toggle values from raw config", async () => {
    const configWithToggles: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { fastMode: true, alwaysThinkingEnabled: true } };
    mockReadClaudeConfig.mockResolvedValue(configWithToggles);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Feature Toggles")).toBeInTheDocument(); });
    const checkboxes = screen.getAllByRole("checkbox");
    const fastModeCheckbox = checkboxes.find((cb) => cb.closest("label")?.textContent?.includes("Fast Mode")) as HTMLInputElement;
    const thinkingCheckbox = checkboxes.find((cb) => cb.closest("label")?.textContent?.includes("Extended Thinking")) as HTMLInputElement;
    expect(fastModeCheckbox.checked).toBe(true);
    expect(thinkingCheckbox.checked).toBe(true);
  });

  it("reads agent teams toggle from env section", async () => {
    const configWithTeams: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } } };
    mockReadClaudeConfig.mockResolvedValue(configWithTeams);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Feature Toggles")).toBeInTheDocument(); });
    const checkboxes = screen.getAllByRole("checkbox");
    const teamsCheckbox = checkboxes.find((cb) => cb.closest("label")?.textContent?.includes("Agent Teams")) as HTMLInputElement;
    expect(teamsCheckbox.checked).toBe(true);
  });

  it("shows save bar when a toggle is changed", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Feature Toggles")).toBeInTheDocument(); });
    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    const fastModeCheckbox = checkboxes.find((cb) => cb.closest("label")?.textContent?.includes("Fast Mode")) as HTMLInputElement;
    fireEvent.click(fastModeCheckbox);
    expect(screen.getByTestId("save-bar")).toBeInTheDocument();
  });

  it("saves toggle values in raw config", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Feature Toggles")).toBeInTheDocument(); });
    const checkboxes = screen.getAllByRole("checkbox");
    const fastModeCheckbox = checkboxes.find((cb) => cb.closest("label")?.textContent?.includes("Fast Mode")) as HTMLInputElement;
    fireEvent.click(fastModeCheckbox);
    const updatedConfig: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { fastMode: true } };
    mockReadClaudeConfig.mockResolvedValue(updatedConfig);
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(mockWriteClaudeConfig).toHaveBeenCalledWith("/home/user", expect.objectContaining({ raw: expect.objectContaining({ fastMode: true }) }));
    });
  });

  it("saves agent teams toggle to env section in raw", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Feature Toggles")).toBeInTheDocument(); });
    const checkboxes = screen.getAllByRole("checkbox");
    const teamsCheckbox = checkboxes.find((cb) => cb.closest("label")?.textContent?.includes("Agent Teams")) as HTMLInputElement;
    fireEvent.click(teamsCheckbox);
    const updatedConfig: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } } };
    mockReadClaudeConfig.mockResolvedValue(updatedConfig);
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(mockWriteClaudeConfig).toHaveBeenCalledWith("/home/user",
        expect.objectContaining({ raw: expect.objectContaining({ env: expect.objectContaining({ CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" }) }) }));
    });
  });

  it("model dropdown shows default Opus hint", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByDisplayValue("Not set (defaults to Opus)")).toBeInTheDocument(); });
  });

  // -- Collapsible sections --

  it("renders all section headers even when collapsed", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    // All section titles should always be visible as toggle buttons
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Feature Toggles")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
    expect(screen.getByText("File Patterns")).toBeInTheDocument();
    expect(screen.getByText("UI Customization")).toBeInTheDocument();
    expect(screen.getByText("Attribution")).toBeInTheDocument();
    expect(screen.getByText("MCP Server Approval")).toBeInTheDocument();
    expect(screen.getByText("Environment Variables")).toBeInTheDocument();
    expect(screen.getByText("Session & Login")).toBeInTheDocument();
    expect(screen.getByText("Scripts & Credentials")).toBeInTheDocument();
    expect(screen.getByText("Sandbox")).toBeInTheDocument();
    expect(screen.getByText("Advanced (JSON)")).toBeInTheDocument();
  });

  it("General and Feature Toggles are open by default", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    // General is open — model dropdown should be visible
    expect(screen.getByDisplayValue("Not set (defaults to Opus)")).toBeInTheDocument();
    // Feature Toggles is open — toggles visible
    expect(screen.getByText("Fast Mode")).toBeInTheDocument();
  });

  it("collapsed sections expand on click", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    // Sandbox is collapsed
    expect(screen.queryByText("Enable Sandbox")).not.toBeInTheDocument();
    openSection("Sandbox");
    expect(screen.getByText("Enable Sandbox")).toBeInTheDocument();
  });

  // -- New settings tests --

  it("renders the Language field in General section", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { language: "japanese" } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByDisplayValue("japanese")).toBeInTheDocument(); });
  });

  it("renders the Output Style field", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { outputStyle: "Concise" } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByDisplayValue("Concise")).toBeInTheDocument(); });
  });

  it("renders Available Models as tags", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { availableModels: ["sonnet", "haiku"] } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("sonnet")).toBeInTheDocument(); expect(screen.getByText("haiku")).toBeInTheDocument(); });
  });

  it("renders Attribution section after expanding", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Attribution")).toBeInTheDocument(); });
    openSection("Attribution");
    expect(screen.getByText("Commit Attribution")).toBeInTheDocument();
    expect(screen.getByText("PR Attribution")).toBeInTheDocument();
  });

  it("populates attribution fields from config", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { attribution: { commit: "Co-Authored-By: AI", pr: "Generated by AI" } } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Attribution")).toBeInTheDocument(); });
    openSection("Attribution");
    expect(screen.getByDisplayValue("Co-Authored-By: AI")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Generated by AI")).toBeInTheDocument();
  });

  it("renders MCP Server Approval section after expanding", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("MCP Server Approval")).toBeInTheDocument(); });
    openSection("MCP Server Approval");
    expect(screen.getByText("Enabled MCP Servers")).toBeInTheDocument();
    expect(screen.getByText("Disabled MCP Servers")).toBeInTheDocument();
  });

  it("renders enabled/disabled MCP servers from config", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { enabledMcpjsonServers: ["memory", "github"], disabledMcpjsonServers: ["filesystem"] } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("MCP Server Approval")).toBeInTheDocument(); });
    openSection("MCP Server Approval");
    expect(screen.getByText("memory")).toBeInTheDocument();
    expect(screen.getByText("github")).toBeInTheDocument();
    expect(screen.getByText("filesystem")).toBeInTheDocument();
  });

  it("renders Environment Variables section after expanding", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Environment Variables")).toBeInTheDocument(); });
    openSection("Environment Variables");
    expect(screen.getByText("No environment variables set")).toBeInTheDocument();
  });

  it("populates env vars from config (excluding managed toggle keys)", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { env: { FOO: "bar", MY_TOKEN: "secret123", CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" } } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Environment Variables")).toBeInTheDocument(); });
    openSection("Environment Variables");
    expect(screen.getByText("FOO")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
    expect(screen.getByText("MY_TOKEN")).toBeInTheDocument();
  });

  it("renders Session & Login section after expanding", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Session & Login")).toBeInTheDocument(); });
  });

  it("populates cleanupPeriodDays from config", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { cleanupPeriodDays: 15 } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Session & Login")).toBeInTheDocument(); });
    openSection("Session & Login");
    expect(screen.getByDisplayValue("15")).toBeInTheDocument();
  });

  it("renders Scripts & Credentials section after expanding", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Scripts & Credentials")).toBeInTheDocument(); });
    openSection("Scripts & Credentials");
    expect(screen.getByText("API Key Helper")).toBeInTheDocument();
    expect(screen.getByText("OTEL Headers Helper")).toBeInTheDocument();
    expect(screen.getByText("AWS Auth Refresh")).toBeInTheDocument();
    expect(screen.getByText("AWS Credential Export")).toBeInTheDocument();
  });

  it("populates custom script fields from config", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { apiKeyHelper: "/bin/gen_key.sh", awsAuthRefresh: "aws sso login" } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Scripts & Credentials")).toBeInTheDocument(); });
    openSection("Scripts & Credentials");
    expect(screen.getByDisplayValue("/bin/gen_key.sh")).toBeInTheDocument();
    expect(screen.getByDisplayValue("aws sso login")).toBeInTheDocument();
  });

  it("does not render HTTP hook fields in Scripts & Credentials (moved to Hooks page)", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: {} };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Scripts & Credentials")).toBeInTheDocument(); });
    openSection("Scripts & Credentials");
    expect(screen.queryByText("Allowed HTTP Hook URLs")).not.toBeInTheDocument();
    expect(screen.queryByText("HTTP Hook Allowed Env Vars")).not.toBeInTheDocument();
  });

  it("renders Permission Default Mode dropdown", async () => {
    const config: NormalizedConfig = { model: null, permissions: { defaultMode: "acceptEdits", allow: [], deny: [] }, ignorePatterns: null, raw: { permissions: { defaultMode: "acceptEdits", allow: [], deny: [] } } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Permissions")).toBeInTheDocument(); });
    openSection("Permissions");
    expect(screen.getByText("Default Permission Mode")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Accept Edits")).toBeInTheDocument();
  });

  it("renders Ask Tools tag input", async () => {
    const config: NormalizedConfig = { model: null, permissions: { allow: [], deny: [], ask: ["Bash(git push *)"] }, ignorePatterns: null, raw: { permissions: { allow: [], deny: [], ask: ["Bash(git push *)"] } } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Permissions")).toBeInTheDocument(); });
    openSection("Permissions");
    expect(screen.getByText("Ask Tools")).toBeInTheDocument();
    expect(screen.getByText("Bash(git push *)")).toBeInTheDocument();
  });

  it("renders Additional Directories tag input", async () => {
    const config: NormalizedConfig = { model: null, permissions: { allow: [], deny: [], additionalDirectories: ["../docs/"] }, ignorePatterns: null, raw: { permissions: { allow: [], deny: [], additionalDirectories: ["../docs/"] } } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Permissions")).toBeInTheDocument(); });
    openSection("Permissions");
    expect(screen.getByText("Additional Directories")).toBeInTheDocument();
    expect(screen.getByText("../docs/")).toBeInTheDocument();
  });

  it("renders Teammate Mode dropdown", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { teammateMode: "tmux" } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Session & Login")).toBeInTheDocument(); });
    openSection("Session & Login");
    expect(screen.getByDisplayValue("tmux")).toBeInTheDocument();
  });

  it("shows save bar when language is changed", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();
    const langInput = screen.getByPlaceholderText("Not set (defaults to English)");
    fireEvent.change(langInput, { target: { value: "spanish" } });
    expect(screen.getByTestId("save-bar")).toBeInTheDocument();
  });

  it("saves attribution values to raw config", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Attribution")).toBeInTheDocument(); });
    openSection("Attribution");
    const commitTextarea = screen.getByPlaceholderText(/Co-Authored-By/);
    fireEvent.change(commitTextarea, { target: { value: "Co-Authored-By: AI" } });
    const updatedConfig: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { attribution: { commit: "Co-Authored-By: AI" } } };
    mockReadClaudeConfig.mockResolvedValue(updatedConfig);
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(mockWriteClaudeConfig).toHaveBeenCalledWith("/home/user",
        expect.objectContaining({ raw: expect.objectContaining({ attribution: expect.objectContaining({ commit: "Co-Authored-By: AI" }) }) }));
    });
  });

  // -- UI Customization (merged: Status Line + File Suggestion + Spinner) --

  it("renders Status Line command field in UI Customization", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { statusLine: { type: "command", command: "~/.claude/statusline.sh" } } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("UI Customization")).toBeInTheDocument(); });
    openSection("UI Customization");
    expect(screen.getByDisplayValue("~/.claude/statusline.sh")).toBeInTheDocument();
  });

  it("saves statusLine command to raw config", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("UI Customization")).toBeInTheDocument(); });
    openSection("UI Customization");
    const input = screen.getByPlaceholderText("~/.claude/statusline.sh");
    fireEvent.change(input, { target: { value: "/opt/statusline" } });
    const updatedConfig: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { statusLine: { type: "command", command: "/opt/statusline" } } };
    mockReadClaudeConfig.mockResolvedValue(updatedConfig);
    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => {
      expect(mockWriteClaudeConfig).toHaveBeenCalledWith("/home/user",
        expect.objectContaining({ raw: expect.objectContaining({ statusLine: { type: "command", command: "/opt/statusline" } }) }));
    });
  });

  it("renders File Suggestion command field in UI Customization", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { fileSuggestion: { type: "command", command: "~/.claude/file-suggestion.sh" } } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("UI Customization")).toBeInTheDocument(); });
    openSection("UI Customization");
    expect(screen.getByDisplayValue("~/.claude/file-suggestion.sh")).toBeInTheDocument();
  });

  it("renders spinner verbs and tips in UI Customization", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { spinnerVerbs: { mode: "append", verbs: ["Pondering", "Crafting"] }, spinnerTipsOverride: { excludeDefault: true, tips: ["Use X"] } } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("UI Customization")).toBeInTheDocument(); });
    openSection("UI Customization");
    expect(screen.getByText("Pondering")).toBeInTheDocument();
    expect(screen.getByText("Crafting")).toBeInTheDocument();
    expect(screen.getByText("Use X")).toBeInTheDocument();
  });

  // -- Sandbox --

  it("renders Sandbox section with toggle and path fields", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { sandbox: { enabled: true, filesystem: { allowWrite: ["/tmp"] }, network: { allowedDomains: ["*.example.com"] } } } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Sandbox")).toBeInTheDocument(); });
    openSection("Sandbox");
    // Enabled toggle should be checked
    const checkboxes = screen.getAllByRole("checkbox");
    const enabledCheckbox = checkboxes.find((cb) => cb.closest("label")?.textContent?.includes("Enable Sandbox")) as HTMLInputElement;
    expect(enabledCheckbox.checked).toBe(true);
    // Path tags
    expect(screen.getByText("/tmp")).toBeInTheDocument();
    expect(screen.getByText("*.example.com")).toBeInTheDocument();
  });

  // -- Login fields (inside Session & Login) --

  it("renders login fields in Session & Login section", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Session & Login")).toBeInTheDocument(); });
    openSection("Session & Login");
    expect(screen.getByText("Force Login Method")).toBeInTheDocument();
    expect(screen.getByText("Force Login Org UUID")).toBeInTheDocument();
    expect(screen.getByText("Company Announcements")).toBeInTheDocument();
  });

  it("populates login settings from config", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { forceLoginMethod: "claudeai", forceLoginOrgUUID: "org-123", companyAnnouncements: ["Welcome!"] } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Session & Login")).toBeInTheDocument(); });
    openSection("Session & Login");
    expect(screen.getByDisplayValue("Claude.ai")).toBeInTheDocument();
    expect(screen.getByDisplayValue("org-123")).toBeInTheDocument();
    expect(screen.getByText("Welcome!")).toBeInTheDocument();
  });

  // -- Search filter --

  it("renders the search filter input", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    expect(screen.getByPlaceholderText("Filter settings...")).toBeInTheDocument();
  });

  it("hides non-matching sections when filtering", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    const searchInput = screen.getByPlaceholderText("Filter settings...");
    fireEvent.change(searchInput, { target: { value: "sandbox" } });
    expect(screen.getByText("Sandbox")).toBeInTheDocument();
    expect(screen.queryByText("General")).not.toBeInTheDocument();
    expect(screen.queryByText("Attribution")).not.toBeInTheDocument();
  });

  it("shows no-results message when filter matches nothing", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    const searchInput = screen.getByPlaceholderText("Filter settings...");
    fireEvent.change(searchInput, { target: { value: "xyznonexistent" } });
    expect(screen.getByText(/No settings match/)).toBeInTheDocument();
  });

  it("clears filter when clear button is clicked", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    const searchInput = screen.getByPlaceholderText("Filter settings...");
    fireEvent.change(searchInput, { target: { value: "sandbox" } });
    expect(screen.queryByText("General")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Clear filter"));
    expect(screen.getByText("General")).toBeInTheDocument();
  });

  // -- Section has-values indicator --

  it("shows indicator dot on sections that have configured values", async () => {
    mockReadClaudeConfig.mockResolvedValue(SAMPLE_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    // SAMPLE_CONFIG has model, permissions, and ignorePatterns — those sections should have dots
    const generalSection = screen.getByText("General").closest("[data-section]")!;
    expect(generalSection.querySelector(".section-has-values")).toBeTruthy();
    const permsSection = screen.getByText("Permissions").closest("[data-section]")!;
    expect(permsSection.querySelector(".section-has-values")).toBeTruthy();
    const patternsSection = screen.getByText("File Patterns").closest("[data-section]")!;
    expect(patternsSection.querySelector(".section-has-values")).toBeTruthy();
  });

  it("does not show indicator dot on sections without configured values", async () => {
    mockReadClaudeConfig.mockResolvedValue(EMPTY_CONFIG);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    const generalSection = screen.getByText("General").closest("[data-section]")!;
    expect(generalSection.querySelector(".section-has-values")).toBeNull();
    const permsSection = screen.getByText("Permissions").closest("[data-section]")!;
    expect(permsSection.querySelector(".section-has-values")).toBeNull();
    const sandboxSection = screen.getByText("Sandbox").closest("[data-section]")!;
    expect(sandboxSection.querySelector(".section-has-values")).toBeNull();
  });

  it("shows indicator dot on sandbox section when sandbox is configured", async () => {
    const config: NormalizedConfig = { model: null, permissions: null, ignorePatterns: null, raw: { sandbox: { enabled: true } } };
    mockReadClaudeConfig.mockResolvedValue(config);
    renderWithProviders(<ConfigPage scope={GLOBAL_SCOPE} />);
    await waitFor(() => { expect(screen.getByText("Settings")).toBeInTheDocument(); });
    const sandboxSection = screen.getByText("Sandbox").closest("[data-section]")!;
    expect(sandboxSection.querySelector(".section-has-values")).toBeTruthy();
  });
});
