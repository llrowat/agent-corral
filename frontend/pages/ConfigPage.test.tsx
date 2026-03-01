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
    expect(screen.getByText("Select a scope to manage config.")).toBeInTheDocument();
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
      expect(screen.getByText("Config Studio")).toBeInTheDocument();
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
      expect(screen.getByDisplayValue("Not set")).toBeInTheDocument();
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
      expect(screen.getByText("Config Studio")).toBeInTheDocument();
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
});
