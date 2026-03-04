import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import { SkillsPage } from "./SkillsPage";
import type { Scope, Skill } from "@/types";

const mockReadSkills = vi.fn();
const mockWriteSkill = vi.fn();
const mockDeleteSkill = vi.fn();
const mockListDisabledSkills = vi.fn();
const mockToggleSkillEnabled = vi.fn();

vi.mock("@/lib/tauri", () => ({
  readSkills: (...args: unknown[]) => mockReadSkills(...args),
  writeSkill: (...args: unknown[]) => mockWriteSkill(...args),
  deleteSkill: (...args: unknown[]) => mockDeleteSkill(...args),
  listDisabledSkills: (...args: unknown[]) => mockListDisabledSkills(...args),
  toggleSkillEnabled: (...args: unknown[]) => mockToggleSkillEnabled(...args),
}));

vi.mock("@/hooks/useSchema", () => ({
  useSchema: () => ({ schema: null, loading: false, error: null }),
}));

const GLOBAL_SCOPE: Scope = {
  type: "global",
  homePath: "/home/user",
};

const SKILL_WITH_NEW_FIELDS: Skill = {
  skillId: "test-skill",
  name: "Test Skill",
  description: "A test skill",
  userInvocable: true,
  allowedTools: ["Read"],
  model: "claude-sonnet-4-6",
  disableModelInvocation: true,
  context: "Extra context for this skill",
  agent: "code-reviewer",
  argumentHint: "<file>",
  content: "Do something useful.",
};

describe("SkillsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSkills.mockResolvedValue([]);
    mockListDisabledSkills.mockResolvedValue([]);
  });

  it("shows detail view with disableModelInvocation field", async () => {
    mockReadSkills.mockResolvedValue([SKILL_WITH_NEW_FIELDS]);
    renderWithProviders(<SkillsPage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("Test Skill")).toBeInTheDocument();
    });

    // Click on the skill to see detail view
    screen.getByText("Test Skill").click();

    await waitFor(() => {
      expect(screen.getByText("Model Invocation")).toBeInTheDocument();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });
  });

  it("shows detail view with context field", async () => {
    mockReadSkills.mockResolvedValue([SKILL_WITH_NEW_FIELDS]);
    renderWithProviders(<SkillsPage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("Test Skill")).toBeInTheDocument();
    });

    screen.getByText("Test Skill").click();

    await waitFor(() => {
      expect(screen.getByText("Context")).toBeInTheDocument();
      expect(screen.getByText("Extra context for this skill")).toBeInTheDocument();
    });
  });

  it("shows detail view with agent field", async () => {
    mockReadSkills.mockResolvedValue([SKILL_WITH_NEW_FIELDS]);
    renderWithProviders(<SkillsPage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("Test Skill")).toBeInTheDocument();
    });

    screen.getByText("Test Skill").click();

    await waitFor(() => {
      expect(screen.getByText("Agent")).toBeInTheDocument();
      expect(screen.getByText("code-reviewer")).toBeInTheDocument();
    });
  });

  it("hides new fields when they are null", async () => {
    const minimalSkill: Skill = {
      skillId: "minimal",
      name: "Minimal Skill",
      description: null,
      userInvocable: false,
      allowedTools: [],
      model: null,
      disableModelInvocation: null,
      context: null,
      agent: null,
      argumentHint: null,
      content: "Just content.",
    };
    mockReadSkills.mockResolvedValue([minimalSkill]);
    renderWithProviders(<SkillsPage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("Minimal Skill")).toBeInTheDocument();
    });

    screen.getByText("Minimal Skill").click();

    await waitFor(() => {
      expect(screen.getByText("Content")).toBeInTheDocument();
    });

    expect(screen.queryByText("Model Invocation")).not.toBeInTheDocument();
    expect(screen.queryByText("Context")).not.toBeInTheDocument();
    // "Agent" label should not appear (but be careful — the "Agent" text might appear in other contexts)
    const agentLabels = screen.queryAllByText("Agent");
    expect(agentLabels.length).toBe(0);
  });
});
