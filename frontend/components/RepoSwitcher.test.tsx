import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";
import { RepoSwitcher } from "./RepoSwitcher";
import type { Repo } from "@/types";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const mockRepos: Repo[] = [
  { repo_id: "1", name: "my-repo", path: "/home/user/my-repo", pinned: false, last_opened: null },
];

describe("RepoSwitcher", () => {
  it("renders the selected repo name", () => {
    render(
      <RepoSwitcher
        repos={mockRepos}
        selected={mockRepos[0]}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByText("my-repo")).toBeInTheDocument();
  });

  it("shows Browse button when add form is visible", () => {
    render(
      <RepoSwitcher
        repos={[]}
        selected={null}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    // Open the dropdown
    fireEvent.click(screen.getByText("Select Repository"));
    // Show the add form
    fireEvent.click(screen.getByText("+ Add Repository"));

    expect(screen.getByText("Browse")).toBeInTheDocument();
  });

  it("shows Browse button in initial view", () => {
    render(
      <RepoSwitcher
        repos={[]}
        selected={null}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    // Open the dropdown
    fireEvent.click(screen.getByText("Select Repository"));

    expect(screen.getByText("Browse...")).toBeInTheDocument();
  });

  it("calls dialog open when Browse is clicked", async () => {
    const mockOpen = vi.mocked(open);
    mockOpen.mockResolvedValue(null);

    render(
      <RepoSwitcher
        repos={[]}
        selected={null}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Select Repository"));
    fireEvent.click(screen.getByText("Browse..."));

    expect(mockOpen).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "Select Repository Directory",
    });
  });
});
