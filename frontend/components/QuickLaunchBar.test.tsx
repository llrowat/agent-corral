import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuickLaunchBar } from "./QuickLaunchBar";
import type { Repo, Agent, CommandTemplate } from "@/types";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

const mockRepos: Repo[] = [
  {
    repo_id: "r1",
    name: "api-service",
    path: "/home/user/api-service",
    pinned: false,
    last_opened_at: null,
  },
  {
    repo_id: "r2",
    name: "web-frontend",
    path: "/home/user/web-frontend",
    pinned: false,
    last_opened_at: null,
  },
];

const mockAgents: Agent[] = [
  {
    agentId: "reviewer",
    name: "Code Reviewer",
    description: "Reviews code",
    systemPrompt: "You review code",
    tools: [],
    modelOverride: null,
    memory: null,
  },
  {
    agentId: "writer",
    name: "Test Writer",
    description: "Writes tests",
    systemPrompt: "You write tests",
    tools: [],
    modelOverride: null,
    memory: null,
  },
];

const mockTemplates: CommandTemplate[] = [
  {
    templateId: "run-claude",
    name: "Run Claude",
    description: "Start Claude",
    requires: ["repo"],
    command: "claude",
    cwd: "{{repoPath}}",
    useWorktree: false,
  },
  {
    templateId: "run-chat",
    name: "Run Chat",
    description: "Start Claude in chat mode",
    requires: ["repo"],
    command: "claude --chat",
    cwd: "{{repoPath}}",
    useWorktree: false,
  },
  {
    templateId: "run-agent",
    name: "Run Agent",
    description: "Run with an agent",
    requires: ["repo", "agent"],
    command: "claude --agent {{agentId}}",
    cwd: "{{repoPath}}",
    useWorktree: false,
  },
  {
    templateId: "run-prompt",
    name: "Run Prompt",
    description: "Run with a prompt",
    requires: ["repo", "prompt"],
    command: "claude -p {{prompt}}",
    cwd: "{{repoPath}}",
    useWorktree: false,
  },
  {
    templateId: "custom-review",
    name: "My Custom Review",
    description: "Custom review template",
    requires: ["repo"],
    command: "claude -p review all code",
    cwd: "{{repoPath}}",
    useWorktree: true,
  },
];

function setupMocks(
  agents: Agent[] = mockAgents,
  templates: CommandTemplate[] = mockTemplates
) {
  mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    switch (cmd) {
      case "read_agents":
        return agents;
      case "list_templates":
        return templates;
      case "render_template": {
        const a = args as { template: CommandTemplate; vars: Record<string, string> };
        let rendered = a.template.command;
        for (const [k, v] of Object.entries(a.vars)) {
          rendered = rendered.replace(`{{${k}}}`, v);
        }
        return rendered;
      }
      case "launch_session":
        return "session-123";
      default:
        return null;
    }
  });
}

describe("QuickLaunchBar", () => {
  const onLaunch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onLaunch.mockClear();
  });

  it("renders launch buttons", async () => {
    setupMocks();
    render(
      <QuickLaunchBar
        repoPath="/home/user/api-service"
        repos={mockRepos}
        onLaunch={onLaunch}
      />
    );

    expect(await screen.findByText("Run Claude")).toBeInTheDocument();
    expect(screen.getByText("Run Chat")).toBeInTheDocument();
    expect(screen.getByText(/Run Agent/)).toBeInTheDocument();
    expect(screen.getByText("Run with Prompt...")).toBeInTheDocument();
    expect(screen.getByText("Manage Launchers")).toBeInTheDocument();
  });

  it("launches claude session when clicking Run Claude", async () => {
    setupMocks();
    render(
      <QuickLaunchBar
        repoPath="/home/user/api-service"
        repos={mockRepos}
        onLaunch={onLaunch}
      />
    );

    await screen.findByText("Run Claude");
    fireEvent.click(screen.getByText("Run Claude"));

    await waitFor(() => {
      expect(onLaunch).toHaveBeenCalledWith(
        "/home/user/api-service",
        "Run Claude",
        "claude",
        false
      );
    });
  });

  it("shows agent dropdown with agents from the repo", async () => {
    setupMocks();
    render(
      <QuickLaunchBar
        repoPath="/home/user/api-service"
        repos={mockRepos}
        onLaunch={onLaunch}
      />
    );

    await screen.findByText("Run Claude");

    // Click the agent dropdown button
    fireEvent.click(screen.getByText(/Run Agent/));

    // Should show agent names
    expect(await screen.findByText("Code Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Test Writer")).toBeInTheDocument();
  });

  it("launches agent session when selecting from dropdown", async () => {
    setupMocks();
    render(
      <QuickLaunchBar
        repoPath="/home/user/api-service"
        repos={mockRepos}
        onLaunch={onLaunch}
      />
    );

    await screen.findByText("Run Claude");
    fireEvent.click(screen.getByText(/Run Agent/));
    await screen.findByText("Code Reviewer");
    fireEvent.click(screen.getByText("Code Reviewer"));

    await waitFor(() => {
      expect(onLaunch).toHaveBeenCalledWith(
        "/home/user/api-service",
        "Run Agent",
        "claude --agent reviewer",
        false
      );
    });
  });

  it("shows prompt input when clicking Run with Prompt", async () => {
    setupMocks();
    render(
      <QuickLaunchBar
        repoPath="/home/user/api-service"
        repos={mockRepos}
        onLaunch={onLaunch}
      />
    );

    await screen.findByText("Run Claude");
    fireEvent.click(screen.getByText("Run with Prompt..."));

    expect(
      screen.getByPlaceholderText("Enter prompt and press Enter...")
    ).toBeInTheDocument();
  });

  it("launches prompt session on Enter", async () => {
    setupMocks();
    render(
      <QuickLaunchBar
        repoPath="/home/user/api-service"
        repos={mockRepos}
        onLaunch={onLaunch}
      />
    );

    await screen.findByText("Run Claude");
    fireEvent.click(screen.getByText("Run with Prompt..."));

    const input = screen.getByPlaceholderText(
      "Enter prompt and press Enter..."
    );
    fireEvent.change(input, { target: { value: "fix the tests" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onLaunch).toHaveBeenCalledWith(
        "/home/user/api-service",
        "Run Prompt",
        "claude -p fix the tests",
        false
      );
    });
  });

  it("shows custom templates in dropdown", async () => {
    setupMocks();
    render(
      <QuickLaunchBar
        repoPath="/home/user/api-service"
        repos={mockRepos}
        onLaunch={onLaunch}
      />
    );

    await screen.findByText("Run Claude");
    fireEvent.click(screen.getByText(/Custom/));

    expect(await screen.findByText("My Custom Review")).toBeInTheDocument();
  });

  it("shows repo picker when no repoPath and action triggered", async () => {
    setupMocks([], mockTemplates);
    render(
      <QuickLaunchBar
        repoPath={null}
        repos={mockRepos}
        onLaunch={onLaunch}
      />
    );

    await screen.findByText("Run Claude");
    fireEvent.click(screen.getByText("Run Claude"));

    // Should show repo picker
    expect(await screen.findByText("Select project:")).toBeInTheDocument();
  });

  it("has worktree toggle defaulting to unchecked", async () => {
    setupMocks();
    render(
      <QuickLaunchBar
        repoPath="/home/user/api-service"
        repos={mockRepos}
        onLaunch={onLaunch}
      />
    );

    await screen.findByText("Run Claude");
    const toggle = screen.getByLabelText("Worktree");
    expect(toggle).not.toBeChecked();
  });

  it("shows no agents message when repo has none", async () => {
    setupMocks([]);
    render(
      <QuickLaunchBar
        repoPath="/home/user/api-service"
        repos={mockRepos}
        onLaunch={onLaunch}
      />
    );

    await screen.findByText("Run Claude");
    fireEvent.click(screen.getByText(/Run Agent/));

    expect(
      await screen.findByText("No agents found in this repo")
    ).toBeInTheDocument();
  });
});
