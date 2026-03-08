import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/test-utils";
import { PersonalizePage } from "./PersonalizePage";
import type { Scope, HistoryAnalysis } from "@/types";

const mockAnalyzeConversationHistory = vi.fn();
const mockApplyPersonalizedAgent = vi.fn();
const mockApplyPersonalizedSkill = vi.fn();

vi.mock("@/lib/tauri", () => ({
  analyzeConversationHistory: (...args: unknown[]) => mockAnalyzeConversationHistory(...args),
  applyPersonalizedAgent: (...args: unknown[]) => mockApplyPersonalizedAgent(...args),
  applyPersonalizedSkill: (...args: unknown[]) => mockApplyPersonalizedSkill(...args),
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

const MOCK_ANALYSIS: HistoryAnalysis = {
  conversationCount: 5,
  messageCount: 42,
  toolUsage: [
    { tool: "Read", count: 100 },
    { tool: "Edit", count: 50 },
    { tool: "Bash", count: 30 },
  ],
  topicCategories: [
    { category: "Bug Fixing", count: 10, keywords: ["fix", "bug"] },
    { category: "Testing", count: 5, keywords: ["test"] },
  ],
  suggestedAgents: [
    {
      agentId: "personalized-debugger",
      name: "Personalized Debugger",
      description: "A debugger tailored to your frequent bug-fixing patterns",
      systemPrompt: "You are a debugging specialist.",
      tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
      modelOverride: null,
      memory: null,
      color: null,
      source: "personalized",
    },
  ],
  suggestedSkills: [
    {
      skillId: "fix-and-test",
      name: "Fix and Test",
      description: "Fix the issue and generate a test to prevent regression",
      userInvocable: true,
      allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
      content: "Fix the described issue and write a test.",
      source: "personalized",
    },
  ],
  promptPatterns: [
    {
      pattern: "Fix and Test",
      description: "Frequently fixes bugs and asks for tests to verify",
      frequency: 8,
    },
  ],
};

describe("PersonalizePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows message when no scope selected", () => {
    renderWithProviders(<PersonalizePage scope={null} />);
    expect(screen.getByText(/Select a scope/i)).toBeInTheDocument();
  });

  it("shows intro card with analyze button when no analysis yet", () => {
    renderWithProviders(<PersonalizePage scope={GLOBAL_SCOPE} homePath="/home/user" />);
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByText("Analyze My History")).toBeInTheDocument();
  });

  it("calls analyzeConversationHistory on button click", async () => {
    mockAnalyzeConversationHistory.mockResolvedValue(MOCK_ANALYSIS);
    renderWithProviders(<PersonalizePage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await userEvent.click(screen.getByText("Analyze My History"));

    expect(mockAnalyzeConversationHistory).toHaveBeenCalledOnce();
  });

  it("shows analysis results after successful analysis", async () => {
    mockAnalyzeConversationHistory.mockResolvedValue(MOCK_ANALYSIS);
    renderWithProviders(<PersonalizePage scope={PROJECT_SCOPE} homePath="/home/user" />);

    await userEvent.click(screen.getByText("Analyze My History"));

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument(); // conversation count
      expect(screen.getByText("42")).toBeInTheDocument(); // message count
    });

    expect(screen.getByText("Bug Fixing")).toBeInTheDocument();
    expect(screen.getByText("Personalized Debugger")).toBeInTheDocument();
    // "Fix and Test" appears in both patterns and skills sections
    expect(screen.getAllByText("Fix and Test").length).toBeGreaterThanOrEqual(1);
  });

  it("shows tool usage chart", async () => {
    mockAnalyzeConversationHistory.mockResolvedValue(MOCK_ANALYSIS);
    renderWithProviders(<PersonalizePage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await userEvent.click(screen.getByText("Analyze My History"));

    await waitFor(() => {
      expect(screen.getByText("Tool Usage")).toBeInTheDocument();
      // "Read" appears in chart and tool chips; just check the chart section exists
      expect(screen.getAllByText("Read").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("100")).toBeInTheDocument();
    });
  });

  it("shows error message when analysis fails", async () => {
    mockAnalyzeConversationHistory.mockRejectedValue(
      new Error("No conversation history found")
    );
    renderWithProviders(<PersonalizePage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await userEvent.click(screen.getByText("Analyze My History"));

    await waitFor(() => {
      expect(screen.getByText("No conversation history found")).toBeInTheDocument();
    });
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("applies agent when apply button clicked", async () => {
    mockAnalyzeConversationHistory.mockResolvedValue(MOCK_ANALYSIS);
    mockApplyPersonalizedAgent.mockResolvedValue(undefined);
    renderWithProviders(<PersonalizePage scope={PROJECT_SCOPE} homePath="/home/user" />);

    await userEvent.click(screen.getByText("Analyze My History"));

    await waitFor(() => {
      expect(screen.getByText("Personalized Debugger")).toBeInTheDocument();
    });

    // Click the individual "Apply" button for the agent
    const applyButtons = screen.getAllByText("Apply");
    await userEvent.click(applyButtons[0]);

    await waitFor(() => {
      expect(mockApplyPersonalizedAgent).toHaveBeenCalledWith(
        "/home/user/my-project",
        expect.objectContaining({
          agentId: "personalized-debugger",
          source: null,
          readOnly: null,
        })
      );
    });
  });

  it("shows applied badge after applying", async () => {
    mockAnalyzeConversationHistory.mockResolvedValue(MOCK_ANALYSIS);
    mockApplyPersonalizedAgent.mockResolvedValue(undefined);
    renderWithProviders(<PersonalizePage scope={PROJECT_SCOPE} homePath="/home/user" />);

    await userEvent.click(screen.getByText("Analyze My History"));

    await waitFor(() => {
      expect(screen.getByText("Personalized Debugger")).toBeInTheDocument();
    });

    const applyButtons = screen.getAllByText("Apply");
    await userEvent.click(applyButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Applied")).toBeInTheDocument();
    });
  });

  it("applies selected agents and skills when Apply Selected clicked", async () => {
    mockAnalyzeConversationHistory.mockResolvedValue(MOCK_ANALYSIS);
    mockApplyPersonalizedAgent.mockResolvedValue(undefined);
    mockApplyPersonalizedSkill.mockResolvedValue(undefined);
    renderWithProviders(<PersonalizePage scope={PROJECT_SCOPE} homePath="/home/user" />);

    await userEvent.click(screen.getByText("Analyze My History"));

    await waitFor(() => {
      expect(screen.getByText("Personalized Debugger")).toBeInTheDocument();
    });

    // Both should be pre-selected, click "Apply Selected (2)"
    const applySelectedBtn = screen.getByRole("button", { name: /Apply Selected/ });
    await userEvent.click(applySelectedBtn);

    await waitFor(() => {
      expect(mockApplyPersonalizedAgent).toHaveBeenCalled();
      expect(mockApplyPersonalizedSkill).toHaveBeenCalled();
    });
  });

  it("shows prompt patterns section", async () => {
    mockAnalyzeConversationHistory.mockResolvedValue(MOCK_ANALYSIS);
    renderWithProviders(<PersonalizePage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await userEvent.click(screen.getByText("Analyze My History"));

    await waitFor(() => {
      expect(screen.getByText("Workflow Patterns")).toBeInTheDocument();
      expect(screen.getByText("8x")).toBeInTheDocument();
    });
  });
});
