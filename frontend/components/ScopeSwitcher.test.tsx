import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScopeSwitcher } from "./ScopeSwitcher";
import type { Repo, Scope } from "@/types";

const mockRepos: Repo[] = [
  { repo_id: "1", name: "project-a", path: "/home/user/project-a", pinned: false, last_opened_at: "2026-01-01" },
  { repo_id: "2", name: "project-b", path: "/home/user/project-b", pinned: true, last_opened_at: "2026-01-02" },
];

describe("ScopeSwitcher", () => {
  const defaultProps = {
    repos: mockRepos,
    scope: null as Scope | null,
    onScopeChange: vi.fn(),
    homePath: "/home/user",
    onAddRepo: vi.fn(),
    onRemoveRepo: vi.fn(),
  };

  it("renders with 'Select Scope' when no scope is set", () => {
    render(<ScopeSwitcher {...defaultProps} />);
    expect(screen.getByText(/Select Scope/)).toBeInTheDocument();
  });

  it("renders with global label when global scope is set", () => {
    const props = {
      ...defaultProps,
      scope: { type: "global" as const, homePath: "/home/user" },
    };
    render(<ScopeSwitcher {...props} />);
    expect(screen.getByText(/Global Settings/)).toBeInTheDocument();
  });

  it("renders with repo name when project scope is set", () => {
    const props = {
      ...defaultProps,
      scope: { type: "project" as const, repo: mockRepos[0] },
    };
    render(<ScopeSwitcher {...props} />);
    expect(screen.getByText("project-a")).toBeInTheDocument();
  });

  it("shows dropdown on toggle click", async () => {
    render(<ScopeSwitcher {...defaultProps} />);

    const toggle = screen.getByText(/Select Scope/);
    await userEvent.click(toggle);

    // Should show repos in the dropdown
    expect(screen.getByText("project-a")).toBeInTheDocument();
    expect(screen.getByText("project-b")).toBeInTheDocument();
  });

  it("shows global settings option in dropdown when homePath is set", async () => {
    render(<ScopeSwitcher {...defaultProps} />);

    const toggle = screen.getByText(/Select Scope/);
    await userEvent.click(toggle);

    // The dropdown should contain a global settings option
    const globalButtons = screen.getAllByText(/Global Settings/);
    expect(globalButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onScopeChange when selecting a repo", async () => {
    const onScopeChange = vi.fn();
    const props = { ...defaultProps, onScopeChange };

    render(<ScopeSwitcher {...props} />);

    const toggle = screen.getByText(/Select Scope/);
    await userEvent.click(toggle);

    // Click the first repo's select button
    const repoButton = screen.getByText("project-a");
    await userEvent.click(repoButton);

    expect(onScopeChange).toHaveBeenCalledWith({
      type: "project",
      repo: mockRepos[0],
    });
  });

  it("calls onScopeChange with global scope", async () => {
    const onScopeChange = vi.fn();
    const props = { ...defaultProps, onScopeChange };

    render(<ScopeSwitcher {...props} />);

    const toggle = screen.getByText(/Select Scope/);
    await userEvent.click(toggle);

    // Click the Global Settings button
    const globalButtons = screen.getAllByText(/Global Settings/);
    // Click the one inside the dropdown (the select button, not the toggle)
    await userEvent.click(globalButtons[globalButtons.length - 1]);

    expect(onScopeChange).toHaveBeenCalledWith({
      type: "global",
      homePath: "/home/user",
    });
  });

  it("shows 'Add Repository' button in dropdown", async () => {
    render(<ScopeSwitcher {...defaultProps} />);

    const toggle = screen.getByText(/Select Scope/);
    await userEvent.click(toggle);

    expect(screen.getByText("+ Add Repository")).toBeInTheDocument();
  });

  it("shows add form when clicking add button", async () => {
    render(<ScopeSwitcher {...defaultProps} />);

    const toggle = screen.getByText(/Select Scope/);
    await userEvent.click(toggle);

    const addButton = screen.getByText("+ Add Repository");
    await userEvent.click(addButton);

    expect(screen.getByPlaceholderText("/path/to/repo")).toBeInTheDocument();
  });

  it("shows empty state when no repos and no homePath", async () => {
    const props = {
      ...defaultProps,
      repos: [],
      homePath: null,
    };
    render(<ScopeSwitcher {...props} />);

    const toggle = screen.getByText(/Select Scope/);
    await userEvent.click(toggle);

    expect(screen.getByText("No repos added yet")).toBeInTheDocument();
  });

  it("shows remove button for each repo", async () => {
    render(<ScopeSwitcher {...defaultProps} />);

    const toggle = screen.getByText(/Select Scope/);
    await userEvent.click(toggle);

    const removeButtons = screen.getAllByTitle("Remove repo");
    expect(removeButtons).toHaveLength(2);
  });

  it("shows repo paths in dropdown", async () => {
    render(<ScopeSwitcher {...defaultProps} />);

    const toggle = screen.getByText(/Select Scope/);
    await userEvent.click(toggle);

    expect(screen.getByText("/home/user/project-a")).toBeInTheDocument();
    expect(screen.getByText("/home/user/project-b")).toBeInTheDocument();
  });
});
