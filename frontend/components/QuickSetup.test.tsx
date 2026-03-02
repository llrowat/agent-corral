import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuickSetup } from "./QuickSetup";
import type { ClaudeDetection } from "@/types";

// Mock the tauri API
vi.mock("@/lib/tauri", () => ({
  writeClaudeConfig: vi.fn().mockResolvedValue(undefined),
  writeAgent: vi.fn().mockResolvedValue(undefined),
  writeHooks: vi.fn().mockResolvedValue(undefined),
}));

const emptyDetection: ClaudeDetection = {
  hasSettingsJson: false,
  hasClaudeMd: false,
  hasAgentsDir: false,
  hasMemoryDir: false,
  hasSkillsDir: false,
  hasMcpJson: false,
  hookCount: 0,
  configPath: null,
};

const fullDetection: ClaudeDetection = {
  hasSettingsJson: true,
  hasClaudeMd: true,
  hasAgentsDir: true,
  hasMemoryDir: true,
  hasSkillsDir: true,
  hasMcpJson: true,
  hookCount: 3,
  configPath: "/test/.claude/settings.json",
};

const partialDetection: ClaudeDetection = {
  hasSettingsJson: true,
  hasClaudeMd: false,
  hasAgentsDir: true,
  hasMemoryDir: false,
  hasSkillsDir: false,
  hasMcpJson: false,
  hookCount: 0,
  configPath: "/test/.claude/settings.json",
};

describe("QuickSetup", () => {
  const defaultProps = {
    basePath: "/test/repo",
    onApplied: vi.fn(),
    onNavigate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders starter templates when nothing is configured", () => {
    render(
      <QuickSetup {...defaultProps} detection={emptyDetection} />
    );
    expect(screen.getByText("Get Started")).toBeInTheDocument();
    expect(
      screen.getByText("Web App (React / Node)")
    ).toBeInTheDocument();
    expect(screen.getByText("Minimal")).toBeInTheDocument();
  });

  it("renders manual setup steps for empty detection", () => {
    render(
      <QuickSetup {...defaultProps} detection={emptyDetection} />
    );
    expect(screen.getByText("Initialize config")).toBeInTheDocument();
    expect(screen.getByText("Create your first agent")).toBeInTheDocument();
    expect(screen.getByText("Add a hook")).toBeInTheDocument();
    expect(screen.getByText("Set up an MCP server")).toBeInTheDocument();
  });

  it("renders nothing when fully configured", () => {
    const { container } = render(
      <QuickSetup {...defaultProps} detection={fullDetection} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders progress view for partial configuration", () => {
    render(
      <QuickSetup {...defaultProps} detection={partialDetection} />
    );
    expect(screen.getByText("Setup Progress")).toBeInTheDocument();
    expect(screen.getByText(/of 5 configured/)).toBeInTheDocument();
  });

  it("shows remaining items in partial config view", () => {
    render(
      <QuickSetup {...defaultProps} detection={partialDetection} />
    );
    expect(screen.getByText("Set up Hooks")).toBeInTheDocument();
    expect(screen.getByText("Set up MCP Servers")).toBeInTheDocument();
    expect(screen.getByText("Set up Skills")).toBeInTheDocument();
  });

  it("calls onNavigate when a manual step button is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <QuickSetup
        {...defaultProps}
        detection={emptyDetection}
        onNavigate={onNavigate}
      />
    );
    fireEvent.click(screen.getByText("Go to Agents"));
    expect(onNavigate).toHaveBeenCalledWith("/agents");
  });

  it("calls onApplied after applying a starter template", async () => {
    const onApplied = vi.fn();
    render(
      <QuickSetup
        {...defaultProps}
        detection={emptyDetection}
        onApplied={onApplied}
      />
    );
    fireEvent.click(screen.getByText("Minimal"));
    await waitFor(() => {
      expect(onApplied).toHaveBeenCalled();
    });
  });

  it("shows success state after applying template", async () => {
    render(
      <QuickSetup {...defaultProps} detection={emptyDetection} />
    );
    fireEvent.click(screen.getByText("Minimal"));
    await waitFor(() => {
      expect(screen.getByText(/Minimal applied/)).toBeInTheDocument();
    });
  });

  it("calls onApplied when Init with Defaults is clicked", async () => {
    const onApplied = vi.fn();
    render(
      <QuickSetup
        {...defaultProps}
        detection={emptyDetection}
        onApplied={onApplied}
      />
    );
    fireEvent.click(screen.getByText("Init with Defaults"));
    await waitFor(() => {
      expect(onApplied).toHaveBeenCalled();
    });
  });
});
