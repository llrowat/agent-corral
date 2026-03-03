import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocsLink } from "./DocsLink";

describe("DocsLink", () => {
  it("renders a link with text 'Docs'", () => {
    render(<DocsLink page="agents" />);
    const link = screen.getByText("Docs");
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
  });

  it("links to the correct docs URL for agents", () => {
    render(<DocsLink page="agents" />);
    const link = screen.getByText("Docs") as HTMLAnchorElement;
    expect(link.href).toBe(
      "https://docs.anthropic.com/en/docs/claude-code/sub-agents"
    );
  });

  it("links to the correct docs URL for hooks", () => {
    render(<DocsLink page="hooks" />);
    const link = screen.getByText("Docs") as HTMLAnchorElement;
    expect(link.href).toBe(
      "https://docs.anthropic.com/en/docs/claude-code/hooks"
    );
  });

  it("links to the correct docs URL for mcp", () => {
    render(<DocsLink page="mcp" />);
    const link = screen.getByText("Docs") as HTMLAnchorElement;
    expect(link.href).toBe(
      "https://docs.anthropic.com/en/docs/claude-code/mcp"
    );
  });

  it("links to the correct docs URL for settings", () => {
    render(<DocsLink page="settings" />);
    const link = screen.getByText("Docs") as HTMLAnchorElement;
    expect(link.href).toBe(
      "https://docs.anthropic.com/en/docs/claude-code/settings"
    );
  });

  it("links to the correct docs URL for memory", () => {
    render(<DocsLink page="memory" />);
    const link = screen.getByText("Docs") as HTMLAnchorElement;
    expect(link.href).toBe(
      "https://docs.anthropic.com/en/docs/claude-code/memory"
    );
  });

  it("links to the correct docs URL for skills", () => {
    render(<DocsLink page="skills" />);
    const link = screen.getByText("Docs") as HTMLAnchorElement;
    expect(link.href).toBe(
      "https://docs.anthropic.com/en/docs/claude-code/slash-commands"
    );
  });

  it("opens in a new tab", () => {
    render(<DocsLink page="agents" />);
    const link = screen.getByText("Docs") as HTMLAnchorElement;
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
  });

  it("has the docs-link class", () => {
    render(<DocsLink page="agents" />);
    const link = screen.getByText("Docs");
    expect(link.className).toBe("docs-link");
  });
});
