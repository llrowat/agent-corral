import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/test-utils";
import { PersonalizePage } from "./PersonalizePage";
import type { Scope } from "@/types";

const mockGetHistorySummary = vi.fn();
const mockPrepareAiCommand = vi.fn();
const mockLaunchTerminal = vi.fn();
const mockIsProcessAlive = vi.fn();

vi.mock("@/lib/tauri", () => ({
  getHistorySummary: (...args: unknown[]) => mockGetHistorySummary(...args),
  prepareAiCommand: (...args: unknown[]) => mockPrepareAiCommand(...args),
  launchTerminal: (...args: unknown[]) => mockLaunchTerminal(...args),
  isProcessAlive: (...args: unknown[]) => mockIsProcessAlive(...args),
}));

const GLOBAL_SCOPE: Scope = {
  type: "global",
  homePath: "/home/user",
};

const PROJECT_SCOPE: Scope = {
  type: "project",
  repo: {
    repo_id: "r1",
    name: "my-project",
    path: "/home/user/my-project",
    pinned: false,
    last_opened_at: null,
  },
};

const MOCK_SUMMARY = `## Conversation History Summary

- Projects with conversations: 5
- Total conversation files: 12
- Total user messages: 42

### Tool Usage (by frequency)

- Read: 100 uses
- Edit: 50 uses
- Bash: 30 uses

### Sample User Prompts (representative selection)

- fix the bug in the login handler
- write a test for the user service
`;

describe("PersonalizePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows intro card even when no scope selected if homePath provided", () => {
    renderWithProviders(<PersonalizePage scope={null} homePath="/home/user" />);
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByText("Personalize with AI")).toBeInTheDocument();
  });

  it("shows intro card with personalize button", () => {
    renderWithProviders(<PersonalizePage scope={GLOBAL_SCOPE} homePath="/home/user" />);
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByText("Personalize with AI")).toBeInTheDocument();
  });

  it("gathers history and launches terminal on button click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetHistorySummary.mockResolvedValue(MOCK_SUMMARY);
    mockPrepareAiCommand.mockResolvedValue("/tmp/ai-create.sh");
    mockLaunchTerminal.mockResolvedValue(12345);
    mockIsProcessAlive.mockResolvedValue(true);

    renderWithProviders(<PersonalizePage scope={PROJECT_SCOPE} homePath="/home/user" />);

    await user.click(screen.getByText("Personalize with AI"));

    await waitFor(() => {
      expect(mockGetHistorySummary).toHaveBeenCalledOnce();
    });

    await waitFor(() => {
      expect(mockPrepareAiCommand).toHaveBeenCalledWith(
        "/home/user",
        expect.stringContaining("Analyze the following Claude Code conversation history")
      );
      expect(mockLaunchTerminal).toHaveBeenCalledWith(
        "/home/user",
        "/tmp/ai-create.sh"
      );
    });

    // Should show waiting state
    await waitFor(() => {
      expect(screen.getByText("Running")).toBeInTheDocument();
    });
  });

  it("shows done state when terminal process exits", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetHistorySummary.mockResolvedValue(MOCK_SUMMARY);
    mockPrepareAiCommand.mockResolvedValue("/tmp/ai-create.sh");
    mockLaunchTerminal.mockResolvedValue(12345);
    mockIsProcessAlive.mockResolvedValue(false);

    renderWithProviders(<PersonalizePage scope={PROJECT_SCOPE} homePath="/home/user" />);

    await user.click(screen.getByText("Personalize with AI"));

    // Wait for waiting state
    await waitFor(() => {
      expect(screen.getByText("Running")).toBeInTheDocument();
    });

    // Advance timer to trigger poll — process is already dead
    await vi.advanceTimersByTimeAsync(2500);

    await waitFor(() => {
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });
  });

  it("shows error when history gathering fails", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetHistorySummary.mockRejectedValue(
      new Error("No conversation history found")
    );

    renderWithProviders(<PersonalizePage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await user.click(screen.getByText("Personalize with AI"));

    await waitFor(() => {
      expect(screen.getByText("No conversation history found")).toBeInTheDocument();
    });
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("shows error when terminal launch fails", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetHistorySummary.mockResolvedValue(MOCK_SUMMARY);
    mockPrepareAiCommand.mockRejectedValue(new Error("Failed to create script"));

    renderWithProviders(<PersonalizePage scope={PROJECT_SCOPE} homePath="/home/user" />);

    await user.click(screen.getByText("Personalize with AI"));

    await waitFor(() => {
      expect(screen.getByText("Failed to create script")).toBeInTheDocument();
    });
  });

  it("allows running again after completion", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetHistorySummary.mockResolvedValue(MOCK_SUMMARY);
    mockPrepareAiCommand.mockResolvedValue("/tmp/ai-create.sh");
    mockLaunchTerminal.mockResolvedValue(12345);
    mockIsProcessAlive.mockResolvedValue(false);

    renderWithProviders(<PersonalizePage scope={PROJECT_SCOPE} homePath="/home/user" />);

    await user.click(screen.getByText("Personalize with AI"));

    // Process exits immediately
    vi.advanceTimersByTime(2500);

    await waitFor(() => {
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Run Again"));

    expect(screen.getByText("How it works")).toBeInTheDocument();
  });

  it("includes history summary in prompt sent to Claude Code", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockGetHistorySummary.mockResolvedValue(MOCK_SUMMARY);
    mockPrepareAiCommand.mockResolvedValue("/tmp/ai-create.sh");
    mockLaunchTerminal.mockResolvedValue(12345);
    mockIsProcessAlive.mockResolvedValue(true);

    renderWithProviders(<PersonalizePage scope={PROJECT_SCOPE} homePath="/home/user" />);

    await user.click(screen.getByText("Personalize with AI"));

    await waitFor(() => {
      const promptArg = mockPrepareAiCommand.mock.calls[0][1] as string;
      // Should include the history summary content
      expect(promptArg).toContain("Tool Usage (by frequency)");
      expect(promptArg).toContain("Sample User Prompts");
      // Should include agent creation instructions
      expect(promptArg).toContain(".claude/agents/");
      // Should include skill creation instructions
      expect(promptArg).toContain(".claude/skills/");
    });
  });
});
