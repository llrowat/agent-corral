import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TemplateCrudModal } from "./TemplateCrudModal";
import type { CommandTemplate } from "@/types";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

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
    templateId: "custom-lint",
    name: "Custom Lint",
    description: "Run lint checks",
    requires: ["repo"],
    command: "claude -p lint",
    cwd: "{{repoPath}}",
    useWorktree: false,
  },
];

function setupMocks(templates: CommandTemplate[] = mockTemplates) {
  mockInvoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_templates":
        return templates;
      case "save_template":
        return null;
      case "delete_template":
        return null;
      default:
        return null;
    }
  });
}

describe("TemplateCrudModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onClose.mockClear();
  });

  it("renders modal with template list", async () => {
    setupMocks();
    render(<TemplateCrudModal onClose={onClose} />);

    expect(await screen.findByText("Manage Launchers")).toBeInTheDocument();
    expect(screen.getByText("Run Claude")).toBeInTheDocument();
    expect(screen.getByText("Custom Lint")).toBeInTheDocument();
  });

  it("shows built-in label on built-in templates", async () => {
    setupMocks();
    render(<TemplateCrudModal onClose={onClose} />);

    await screen.findByText("Run Claude");
    expect(screen.getByText("(built-in)")).toBeInTheDocument();
  });

  it("does not show delete button for built-in templates", async () => {
    setupMocks();
    render(<TemplateCrudModal onClose={onClose} />);

    await screen.findByText("Run Claude");

    // Click on Run Claude to select it
    fireEvent.click(screen.getByText("Run Claude"));

    // Should not show Delete button for built-in
    await waitFor(() => {
      expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    });
  });

  it("shows delete button for custom templates", async () => {
    setupMocks();
    render(<TemplateCrudModal onClose={onClose} />);

    await screen.findByText("Custom Lint");

    // Click on Custom Lint to select it
    fireEvent.click(screen.getByText("Custom Lint"));

    // Should show Delete button
    expect(await screen.findByText("Delete")).toBeInTheDocument();
  });

  it("shows new launcher form when clicking + New", async () => {
    setupMocks();
    render(<TemplateCrudModal onClose={onClose} />);

    await screen.findByText("Run Claude");
    fireEvent.click(screen.getByText("+ New"));

    expect(screen.getByText("New Launcher")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("My Custom Launcher")
    ).toBeInTheDocument();
  });

  it("calls onClose when Close button clicked", async () => {
    setupMocks();
    render(<TemplateCrudModal onClose={onClose} />);

    await screen.findByText("Manage Launchers");
    fireEvent.click(screen.getByText("Close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when overlay clicked", async () => {
    setupMocks();
    const { container } = render(<TemplateCrudModal onClose={onClose} />);

    await screen.findByText("Manage Launchers");
    const overlay = container.querySelector(".modal-overlay")!;
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows detail view when selecting a template", async () => {
    setupMocks();
    render(<TemplateCrudModal onClose={onClose} />);

    await screen.findByText("Custom Lint");
    fireEvent.click(screen.getByText("Custom Lint"));

    // Should show the detail view with the command
    expect(await screen.findByText("claude -p lint")).toBeInTheDocument();
  });
});
