import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import { ConfigLinter } from "./ConfigLinter";
import type { Scope, LintResult } from "@/types";

const mockLintConfig = vi.fn();

vi.mock("@/lib/tauri", () => ({
  lintConfig: (...args: unknown[]) => mockLintConfig(...args),
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

const CLEAN_RESULT: LintResult = {
  issues: [],
  score: 100,
  errorCount: 0,
  warningCount: 0,
  infoCount: 0,
};

const ISSUES_RESULT: LintResult = {
  issues: [
    {
      severity: "error",
      category: "mcp",
      rule: "mcp-placeholder-env",
      message: 'MCP "test" has placeholder env var: API_KEY',
      fix: "Replace the placeholder value",
      entityId: "test",
      scope: "project",
    },
    {
      severity: "warning",
      category: "agent",
      rule: "agent-short-prompt",
      message: 'Agent "Reviewer" has a very short system prompt',
      fix: "Add more detail",
      entityId: "reviewer",
      scope: "project",
    },
    {
      severity: "warning",
      category: "config",
      rule: "no-ignore-patterns",
      message: "No ignore patterns configured",
      fix: "Add ignore patterns",
      entityId: null,
      scope: null,
    },
    {
      severity: "info",
      category: "hierarchy",
      rule: "hierarchy-agent-shadow",
      message: 'Project agent "reviewer" shadows a global agent',
      fix: "Rename if unintended",
      entityId: "reviewer",
      scope: "project",
    },
    {
      severity: "info",
      category: "config",
      rule: "no-model-configured",
      message: "No default model configured",
      fix: "Set a model",
      entityId: null,
      scope: null,
    },
  ],
  score: 54,
  errorCount: 1,
  warningCount: 2,
  infoCount: 2,
};

describe("ConfigLinter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLintConfig.mockResolvedValue(CLEAN_RESULT);
  });

  it("renders nothing when no scope", () => {
    renderWithProviders(<ConfigLinter scope={null} />);
    expect(screen.queryByTestId("config-linter")).not.toBeInTheDocument();
  });

  it("shows score and all-good message when no issues", async () => {
    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("Config Linter")).toBeInTheDocument();
      expect(screen.getByText("100/100")).toBeInTheDocument();
      expect(screen.getByText("All good!")).toBeInTheDocument();
    });
  });

  it("calls lintConfig with project and global paths", async () => {
    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(mockLintConfig).toHaveBeenCalledWith("/projects/my-app", "/home/user");
    });
  });

  it("calls lintConfig with null global path for global scope", async () => {
    renderWithProviders(<ConfigLinter scope={GLOBAL_SCOPE} />);

    await waitFor(() => {
      expect(mockLintConfig).toHaveBeenCalledWith("/home/user", null);
    });
  });

  it("shows error, warning, and info counts", async () => {
    mockLintConfig.mockResolvedValue(ISSUES_RESULT);

    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("54/100")).toBeInTheDocument();
      expect(screen.getByTestId("error-count")).toHaveTextContent("1 error");
      expect(screen.getByTestId("warning-count")).toHaveTextContent("2 warnings");
      expect(screen.getByTestId("info-count")).toHaveTextContent("2 suggestions");
    });
  });

  it("expands to show issues when toggle is clicked", async () => {
    mockLintConfig.mockResolvedValue(ISSUES_RESULT);

    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("54/100")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("linter-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("linter-body")).toBeInTheDocument();
      expect(screen.getByTestId("issue-mcp-placeholder-env")).toBeInTheDocument();
      expect(screen.getByTestId("issue-agent-short-prompt")).toBeInTheDocument();
      expect(screen.getByTestId("issue-hierarchy-agent-shadow")).toBeInTheDocument();
    });
  });

  it("shows issue messages and fixes", async () => {
    mockLintConfig.mockResolvedValue(ISSUES_RESULT);

    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("54/100")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("linter-toggle"));

    await waitFor(() => {
      expect(screen.getByText('MCP "test" has placeholder env var: API_KEY')).toBeInTheDocument();
      expect(screen.getByText("Replace the placeholder value")).toBeInTheDocument();
    });
  });

  it("filters by severity when filter buttons are clicked", async () => {
    mockLintConfig.mockResolvedValue(ISSUES_RESULT);

    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("54/100")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("linter-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("linter-body")).toBeInTheDocument();
    });

    // Filter to errors only
    fireEvent.click(screen.getByTestId("filter-error"));

    expect(screen.getByTestId("issue-mcp-placeholder-env")).toBeInTheDocument();
    expect(screen.queryByTestId("issue-agent-short-prompt")).not.toBeInTheDocument();
    expect(screen.queryByTestId("issue-hierarchy-agent-shadow")).not.toBeInTheDocument();
  });

  it("groups by category by default", async () => {
    mockLintConfig.mockResolvedValue(ISSUES_RESULT);

    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("54/100")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("linter-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("group-mcp")).toBeInTheDocument();
      expect(screen.getByTestId("group-agent")).toBeInTheDocument();
      expect(screen.getByTestId("group-config")).toBeInTheDocument();
      expect(screen.getByTestId("group-hierarchy")).toBeInTheDocument();
    });
  });

  it("re-runs lint when Re-run button is clicked", async () => {
    mockLintConfig.mockResolvedValue(ISSUES_RESULT);

    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(mockLintConfig).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId("linter-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("rerun-lint")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("rerun-lint"));

    await waitFor(() => {
      expect(mockLintConfig).toHaveBeenCalledTimes(2);
    });
  });

  it("shows all-good message in expanded view when no issues", async () => {
    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("All good!")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("linter-toggle"));

    await waitFor(() => {
      expect(screen.getByText("No issues found. Your configuration looks great!")).toBeInTheDocument();
    });
  });

  it("shows rule ID badge on each issue", async () => {
    mockLintConfig.mockResolvedValue(ISSUES_RESULT);

    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("54/100")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("linter-toggle"));

    await waitFor(() => {
      expect(screen.getByText("mcp-placeholder-env")).toBeInTheDocument();
      expect(screen.getByText("agent-short-prompt")).toBeInTheDocument();
      expect(screen.getByText("hierarchy-agent-shadow")).toBeInTheDocument();
    });
  });

  it("shows scope badges on issues", async () => {
    mockLintConfig.mockResolvedValue(ISSUES_RESULT);

    renderWithProviders(<ConfigLinter scope={PROJECT_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("54/100")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("linter-toggle"));

    await waitFor(() => {
      // Issues with scope="project" should show a "project" badge
      const projectBadges = screen.getAllByText("project");
      expect(projectBadges.length).toBeGreaterThan(0);
    });
  });
});
