import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScopeBanner, McpFileIndicator } from "./ScopeGuard";
import type { Scope } from "@/types";

describe("ScopeBanner", () => {
  it("renders warning banner for global scope", () => {
    const scope: Scope = { type: "global", homePath: "/home/user" };
    render(<ScopeBanner scope={scope} />);
    expect(screen.getByText(/Global Scope/)).toBeInTheDocument();
    expect(
      screen.getByText(/Changes here affect all projects/)
    ).toBeInTheDocument();
  });

  it("renders nothing for project scope", () => {
    const scope: Scope = {
      type: "project",
      repo: {
        repo_id: "1",
        name: "test",
        path: "/test",
        pinned: false,
        last_opened_at: null,
      },
    };
    const { container } = render(<ScopeBanner scope={scope} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("McpFileIndicator", () => {
  it("shows ~/.claude.json for global scope", () => {
    const scope: Scope = { type: "global", homePath: "/home/user" };
    render(<McpFileIndicator scope={scope} />);
    expect(screen.getByText("~/.claude.json")).toBeInTheDocument();
  });

  it("shows .mcp.json for project scope", () => {
    const scope: Scope = {
      type: "project",
      repo: {
        repo_id: "1",
        name: "test",
        path: "/test",
        pinned: false,
        last_opened_at: null,
      },
    };
    render(<McpFileIndicator scope={scope} />);
    expect(screen.getByText(".mcp.json")).toBeInTheDocument();
  });
});
