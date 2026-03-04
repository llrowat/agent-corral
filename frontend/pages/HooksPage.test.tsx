import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import { HooksPage } from "./HooksPage";
import { HOOK_EVENTS } from "@/types";
import type { Scope, HookEvent } from "@/types";

const mockReadHooks = vi.fn();
const mockWriteHooks = vi.fn();
const mockReorderHookGroups = vi.fn();
const mockToggleHookGroupEnabled = vi.fn();

vi.mock("@/lib/tauri", () => ({
  readHooks: (...args: unknown[]) => mockReadHooks(...args),
  writeHooks: (...args: unknown[]) => mockWriteHooks(...args),
  reorderHookGroups: (...args: unknown[]) => mockReorderHookGroups(...args),
  toggleHookGroupEnabled: (...args: unknown[]) => mockToggleHookGroupEnabled(...args),
}));

const GLOBAL_SCOPE: Scope = {
  type: "global",
  homePath: "/home/user",
};

describe("HooksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadHooks.mockResolvedValue([]);
  });

  it("HOOK_EVENTS has 17 entries", () => {
    expect(HOOK_EVENTS).toHaveLength(17);
  });

  it("HOOK_EVENTS contains all expected event types", () => {
    const expected = [
      "PreToolUse", "PostToolUse", "Notification", "Stop", "SubagentStop",
      "SessionStart", "UserPromptSubmit", "PermissionRequest", "PostToolUseFailure",
      "SubagentStart", "TeammateIdle", "TaskCompleted", "ConfigChange",
      "WorktreeCreate", "WorktreeRemove", "PreCompact", "SessionEnd",
    ];
    for (const evt of expected) {
      expect(HOOK_EVENTS).toContain(evt);
    }
  });

  it("renders event type dropdown with Agent option in editor", async () => {
    mockReadHooks.mockResolvedValue([]);
    renderWithProviders(<HooksPage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    // Click "+ New" to open editor
    const newBtn = screen.getByText("+ New");
    newBtn.click();

    await waitFor(() => {
      expect(screen.getByText("New Hook Event")).toBeInTheDocument();
    });

    // Check the type dropdown has Agent option
    const typeSelect = screen.getAllByRole("combobox")[1]; // second select (first is event type)
    const options = typeSelect.querySelectorAll("option");
    const optionValues = Array.from(options).map((o) => o.textContent);
    expect(optionValues).toContain("Agent");
    expect(optionValues).toContain("Command");
    expect(optionValues).toContain("Prompt");
  });

  it("shows timeout label as seconds in editor", async () => {
    mockReadHooks.mockResolvedValue([]);
    renderWithProviders(<HooksPage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    screen.getByText("+ New").click();

    await waitFor(() => {
      expect(screen.getByText("Timeout (seconds, optional)")).toBeInTheDocument();
    });
  });

  it("shows timeout in seconds in detail view", async () => {
    const hookWithTimeout: HookEvent = {
      event: "PreToolUse",
      groups: [{
        matcher: "Bash",
        hooks: [{
          hookType: "command",
          command: "echo test",
          prompt: null,
          timeout: 30,
          async: null,
          statusMessage: null,
          model: null,
        }],
      }],
    };
    mockReadHooks.mockResolvedValue([hookWithTimeout]);
    renderWithProviders(<HooksPage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeInTheDocument();
    });

    screen.getByText("PreToolUse").click();

    await waitFor(() => {
      expect(screen.getByText("30s")).toBeInTheDocument();
    });
  });

  it("shows async, statusMessage, model in detail view", async () => {
    const hookWithNewFields: HookEvent = {
      event: "Stop",
      groups: [{
        matcher: null,
        hooks: [{
          hookType: "command",
          command: "echo done",
          prompt: null,
          timeout: null,
          async: true,
          statusMessage: "Running post-stop hook...",
          model: null,
        }],
      }],
    };
    mockReadHooks.mockResolvedValue([hookWithNewFields]);
    renderWithProviders(<HooksPage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("Stop")).toBeInTheDocument();
    });

    screen.getByText("Stop").click();

    await waitFor(() => {
      expect(screen.getByText("Async")).toBeInTheDocument();
      expect(screen.getByText("Yes")).toBeInTheDocument();
      expect(screen.getByText("Status Message")).toBeInTheDocument();
      expect(screen.getByText("Running post-stop hook...")).toBeInTheDocument();
    });
  });

  it("shows model field in detail view for prompt handler", async () => {
    const hookWithModel: HookEvent = {
      event: "PreToolUse",
      groups: [{
        matcher: null,
        hooks: [{
          hookType: "prompt",
          command: null,
          prompt: "Check this",
          timeout: null,
          async: null,
          statusMessage: null,
          model: "claude-haiku-4-5-20251001",
        }],
      }],
    };
    mockReadHooks.mockResolvedValue([hookWithModel]);
    renderWithProviders(<HooksPage scope={GLOBAL_SCOPE} homePath="/home/user" />);

    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeInTheDocument();
    });

    screen.getByText("PreToolUse").click();

    await waitFor(() => {
      expect(screen.getByText("Model")).toBeInTheDocument();
      expect(screen.getByText("claude-haiku-4-5-20251001")).toBeInTheDocument();
    });
  });
});
