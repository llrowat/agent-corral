import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import { ClaudeMdPage } from "./ClaudeMdPage";
import type { Scope } from "@/types";

const mockReadClaudeMd = vi.fn();
const mockListClaudeMdFiles = vi.fn();
const mockListMarkdownReferences = vi.fn();

vi.mock("@/lib/tauri", () => ({
  readClaudeMd: (...args: unknown[]) => mockReadClaudeMd(...args),
  listClaudeMdFiles: (...args: unknown[]) => mockListClaudeMdFiles(...args),
  listMarkdownReferences: (...args: unknown[]) =>
    mockListMarkdownReferences(...args),
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

describe("ClaudeMdPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadClaudeMd.mockResolvedValue("");
    mockListClaudeMdFiles.mockResolvedValue([]);
    mockListMarkdownReferences.mockResolvedValue([]);
  });

  it("renders empty state when no CLAUDE.md exists", async () => {
    renderWithProviders(
      <ClaudeMdPage scope={PROJECT_SCOPE} homePath="/home/user" />
    );

    await waitFor(() => {
      expect(screen.getByText("No CLAUDE.md Found")).toBeInTheDocument();
    });
  });

  it("renders markdown preview when CLAUDE.md exists", async () => {
    mockReadClaudeMd.mockResolvedValue("# My Project\n\nInstructions here.");

    renderWithProviders(
      <ClaudeMdPage scope={PROJECT_SCOPE} homePath="/home/user" />
    );

    await waitFor(() => {
      expect(screen.getByText("My Project")).toBeInTheDocument();
    });
  });

  it("displays referenced markdown files section", async () => {
    mockReadClaudeMd.mockResolvedValue("# Project\n@agents.md\n");
    mockListMarkdownReferences.mockResolvedValue([
      {
        reference: "@agents.md",
        filePath: "agents.md",
        exists: true,
        content: "# Agents\nAgent config",
      },
    ]);

    renderWithProviders(
      <ClaudeMdPage scope={PROJECT_SCOPE} homePath="/home/user" />
    );

    await waitFor(() => {
      expect(screen.getByText("Referenced Files")).toBeInTheDocument();
      // The reference appears in a <code> element in the references section
      const codeEl = screen.getByRole("list", { hidden: false })
        .querySelector("code");
      expect(codeEl).toHaveTextContent("@agents.md");
      expect(screen.getByText("found")).toBeInTheDocument();
    });
  });

  it("shows missing badge for broken references", async () => {
    mockReadClaudeMd.mockResolvedValue("# Project\n@nonexistent.md\n");
    mockListMarkdownReferences.mockResolvedValue([
      {
        reference: "@nonexistent.md",
        filePath: "nonexistent.md",
        exists: false,
        content: null,
      },
    ]);

    renderWithProviders(
      <ClaudeMdPage scope={PROJECT_SCOPE} homePath="/home/user" />
    );

    await waitFor(() => {
      expect(screen.getByText("missing")).toBeInTheDocument();
    });
  });

  it("expands reference content on click", async () => {
    mockReadClaudeMd.mockResolvedValue("# Project\n@agents.md\n");
    mockListMarkdownReferences.mockResolvedValue([
      {
        reference: "@agents.md",
        filePath: "agents.md",
        exists: true,
        content: "# Agent Instructions",
      },
    ]);

    renderWithProviders(
      <ClaudeMdPage scope={PROJECT_SCOPE} homePath="/home/user" />
    );

    await waitFor(() => {
      expect(screen.getByText("Referenced Files")).toBeInTheDocument();
    });

    // Content should not be visible yet
    expect(screen.queryByText("Agent Instructions")).not.toBeInTheDocument();

    // Click the code element containing the reference
    const codeEl = screen.getByRole("list").querySelector("code")!;
    fireEvent.click(codeEl);

    await waitFor(() => {
      expect(screen.getByText("Agent Instructions")).toBeInTheDocument();
    });
  });

  it("shows no scope message when scope is null", () => {
    renderWithProviders(
      <ClaudeMdPage scope={null} homePath="/home/user" />
    );

    expect(
      screen.getByText("Select a scope to view CLAUDE.md.")
    ).toBeInTheDocument();
  });
});
