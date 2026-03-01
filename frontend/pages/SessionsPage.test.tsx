import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionsPage } from "./SessionsPage";
import type { Repo, Scope, SessionEnvelope, SessionActivityMap, WorktreeStatus } from "@/types";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

const mockSessions: SessionEnvelope[] = [
  {
    sessionId: "s1",
    repoPath: "/home/user/api-service",
    commandName: "Claude Code",
    command: "claude",
    startedAt: "2026-02-28T10:00:00Z",
    pid: 1001,
    worktreePath: null,
    worktreeBranch: null,
    worktreeBaseBranch: null,
    processAlive: true,
  },
  {
    sessionId: "s2",
    repoPath: "/home/user/api-service",
    commandName: "Claude Fix",
    command: "claude -p fix bugs",
    startedAt: "2026-02-28T09:00:00Z",
    pid: 1002,
    worktreePath: null,
    worktreeBranch: null,
    worktreeBaseBranch: null,
    processAlive: false,
  },
  {
    sessionId: "s3",
    repoPath: "/home/user/web-frontend",
    commandName: "Claude Refactor",
    command: "claude -p refactor",
    startedAt: "2026-02-28T08:00:00Z",
    pid: 1003,
    worktreePath: "/tmp/worktree",
    worktreeBranch: "worktree/s3",
    worktreeBaseBranch: "main",
    processAlive: true,
  },
];

const mockActivities: SessionActivityMap = {
  s1: "active",
  s2: "exited",
  s3: "idle",
};

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

function setupMocks(
  sessions: SessionEnvelope[] = mockSessions,
  activities: SessionActivityMap = mockActivities
) {
  mockInvoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_sessions":
        return sessions;
      case "poll_session_states":
        return activities;
      default:
        return null;
    }
  });
}

describe("SessionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders sessions page with filter buttons", async () => {
    setupMocks();
    render(<SessionsPage scope={null} repos={mockRepos} />);

    // Filter buttons should be present
    expect(await screen.findByText(/All \(/)).toBeInTheDocument();
    expect(screen.getByText(/Working \(/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting \(/)).toBeInTheDocument();
    expect(screen.getByText(/Exited \(/)).toBeInTheDocument();
  });

  it("shows repo group headers in multi-repo mode (no scope)", async () => {
    setupMocks();
    render(<SessionsPage scope={null} repos={mockRepos} />);

    // Wait for sessions to load
    expect(await screen.findByText("api-service")).toBeInTheDocument();
    expect(screen.getByText("web-frontend")).toBeInTheDocument();
  });

  it("does not show repo group headers in project scope", async () => {
    setupMocks();
    const scope: Scope = {
      type: "project",
      repo: {
        repo_id: "r1",
        name: "api-service",
        path: "/home/user/api-service",
        pinned: false,
        last_opened_at: null,
      },
    };
    render(<SessionsPage scope={scope} repos={mockRepos} />);

    // Wait for sessions to load, should show session names
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    // Should NOT show repo group header buttons
    const groupHeaders = screen.queryAllByRole("button", {
      name: /api-service/,
    });
    // The repo-group-header buttons should not exist
    expect(
      groupHeaders.filter((el) => el.classList.contains("repo-group-header"))
    ).toHaveLength(0);
  });

  it("shows activity badges for sessions", async () => {
    setupMocks();
    render(<SessionsPage scope={null} repos={mockRepos} />);

    // Wait for data to load
    await screen.findByText("Claude Code");

    // Check for activity labels
    const workingBadges = screen.getAllByText("working");
    expect(workingBadges.length).toBeGreaterThanOrEqual(1);

    const waitingBadges = screen.getAllByText("waiting");
    expect(waitingBadges.length).toBeGreaterThanOrEqual(1);

    const exitedBadges = screen.getAllByText("exited");
    expect(exitedBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows correct filter counts", async () => {
    setupMocks();
    render(<SessionsPage scope={null} repos={mockRepos} />);

    expect(await screen.findByText("All (3)")).toBeInTheDocument();
    expect(screen.getByText("Working (1)")).toBeInTheDocument();
    expect(screen.getByText("Waiting (1)")).toBeInTheDocument();
    expect(screen.getByText("Exited (1)")).toBeInTheDocument();
  });

  it("filters sessions by status when clicking filter button", async () => {
    setupMocks();
    render(<SessionsPage scope={null} repos={mockRepos} />);

    await screen.findByText("Claude Code");

    // Click "Working" filter
    fireEvent.click(screen.getByText("Working (1)"));

    // Should still show the active session
    expect(screen.getByText("Claude Code")).toBeInTheDocument();

    // The exited session should be gone
    expect(screen.queryByText("Claude Fix")).not.toBeInTheDocument();
  });

  it("shows running count in repo group header", async () => {
    setupMocks();
    render(<SessionsPage scope={null} repos={mockRepos} />);

    // Both repos have 1 running session each
    const runningBadges = await screen.findAllByText("1 running");
    expect(runningBadges.length).toBe(2);
  });

  it("shows detail panel when selecting a session", async () => {
    setupMocks();
    render(<SessionsPage scope={null} repos={mockRepos} />);

    await screen.findByText("Claude Code");

    // Click on a session
    fireEvent.click(screen.getByText("Claude Code"));

    // Detail panel should show the command in code elements
    const codeElements = screen.getAllByText("claude");
    expect(codeElements.length).toBeGreaterThanOrEqual(1);
  });

  it("works with global scope (no longer blocked)", async () => {
    setupMocks();
    const scope: Scope = { type: "global", homePath: "/home/user" };
    render(<SessionsPage scope={scope} repos={mockRepos} />);

    // Should NOT show the old "project-specific" message
    expect(
      screen.queryByText(/Sessions are project-specific/)
    ).not.toBeInTheDocument();

    // Should show sessions grouped by repo
    expect(await screen.findByText("api-service")).toBeInTheDocument();
  });

  it("renders New Session button", async () => {
    setupMocks();
    render(<SessionsPage scope={null} repos={mockRepos} />);

    expect(await screen.findByText("New Session")).toBeInTheDocument();
  });

  it("renders worktree toggle", async () => {
    setupMocks();
    render(<SessionsPage scope={null} repos={mockRepos} />);

    expect(await screen.findByText("Use worktree")).toBeInTheDocument();
  });

  it("shows empty state when no sessions exist", async () => {
    setupMocks([], {});
    render(<SessionsPage scope={null} repos={mockRepos} />);

    expect(
      await screen.findByText('No sessions yet. Click "New Session" to get started.')
    ).toBeInTheDocument();
  });

  it("shows filtered empty state", async () => {
    setupMocks();
    render(<SessionsPage scope={null} repos={mockRepos} />);

    await screen.findByText("Claude Code");

    // Filter to "Working" then apply a repo-scope filter that matches no active sessions
    fireEvent.click(screen.getByText("Working (1)"));

    // There should be 1 working session, so not empty
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });

  describe("worktree commit UI", () => {
    const dirtyWorktreeStatus: WorktreeStatus = {
      branch: "worktree/s3",
      baseBranch: "main",
      worktreePath: "/tmp/worktree",
      hasUncommittedChanges: true,
      commitCount: 0,
      latestCommitSummary: null,
      insertions: 5,
      deletions: 2,
    };

    const cleanWorktreeStatus: WorktreeStatus = {
      branch: "worktree/s3",
      baseBranch: "main",
      worktreePath: "/tmp/worktree",
      hasUncommittedChanges: false,
      commitCount: 1,
      latestCommitSummary: "add feature",
      insertions: 5,
      deletions: 2,
    };

    function setupWorktreeMocks(worktreeStatus: WorktreeStatus) {
      mockInvoke.mockImplementation(async (cmd: string) => {
        switch (cmd) {
          case "list_sessions":
            return mockSessions;
          case "poll_session_states":
            return mockActivities;
          case "get_worktree_status":
            return worktreeStatus;
          case "get_worktree_diff":
            return "Unstaged changes:\n file.txt | 5 +++++\n";
          case "list_branches":
            return ["main", "develop"];
          case "commit_worktree_changes":
            return "1 file changed, 5 insertions(+)";
          default:
            return null;
        }
      });
    }

    it("shows commit section when worktree has uncommitted changes", async () => {
      setupWorktreeMocks(dirtyWorktreeStatus);
      render(<SessionsPage scope={null} repos={mockRepos} />);

      // Click on the worktree session (s3)
      const refactorSession = await screen.findByText("Claude Refactor");
      fireEvent.click(refactorSession);

      // Should show the Commit Changes heading
      expect(await screen.findByText("Commit Changes")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Commit message...")).toBeInTheDocument();
      expect(screen.getByText("Commit All")).toBeInTheDocument();
    });

    it("hides commit section when worktree is clean", async () => {
      setupWorktreeMocks(cleanWorktreeStatus);
      render(<SessionsPage scope={null} repos={mockRepos} />);

      // Click on the worktree session
      const refactorSession = await screen.findByText("Claude Refactor");
      fireEvent.click(refactorSession);

      // Wait for worktree status to load (Merge Branch appears for both clean/dirty)
      expect(await screen.findByText("Merge Branch")).toBeInTheDocument();

      // Commit section should NOT appear
      expect(screen.queryByText("Commit Changes")).not.toBeInTheDocument();
    });

    it("disables commit button when message is empty", async () => {
      setupWorktreeMocks(dirtyWorktreeStatus);
      render(<SessionsPage scope={null} repos={mockRepos} />);

      const refactorSession = await screen.findByText("Claude Refactor");
      fireEvent.click(refactorSession);

      const commitBtn = await screen.findByText("Commit All");
      expect(commitBtn).toBeDisabled();
    });

    it("enables commit button when message is entered", async () => {
      setupWorktreeMocks(dirtyWorktreeStatus);
      render(<SessionsPage scope={null} repos={mockRepos} />);

      const refactorSession = await screen.findByText("Claude Refactor");
      fireEvent.click(refactorSession);

      const input = await screen.findByPlaceholderText("Commit message...");
      fireEvent.change(input, { target: { value: "fix bug" } });

      const commitBtn = screen.getByText("Commit All");
      expect(commitBtn).not.toBeDisabled();
    });

    it("calls commit_worktree_changes on commit click", async () => {
      setupWorktreeMocks(dirtyWorktreeStatus);
      render(<SessionsPage scope={null} repos={mockRepos} />);

      const refactorSession = await screen.findByText("Claude Refactor");
      fireEvent.click(refactorSession);

      const input = await screen.findByPlaceholderText("Commit message...");
      fireEvent.change(input, { target: { value: "add feature" } });

      const commitBtn = screen.getByText("Commit All");
      fireEvent.click(commitBtn);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith("commit_worktree_changes", {
          sessionId: "s3",
          message: "add feature",
        });
      });
    });
  });
});
