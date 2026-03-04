import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar scope={null} />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  it("renders all Claude Code nav items", () => {
    renderSidebar();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Hooks")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("MCP Servers")).toBeInTheDocument();
  });

  it("orders Claude Code items with CLAUDE.md first and MCP last", () => {
    const { container } = renderSidebar();
    const labelSpans = container.querySelectorAll(".sidebar-label");
    const labels = Array.from(labelSpans).map((el) => el.textContent);
    const claudeCodeItems = ["CLAUDE.md", "Settings", "Agents", "Hooks", "Memory", "Skills", "MCP Servers"];
    const claudeCodeLabels = labels.filter((l) => claudeCodeItems.includes(l ?? ""));
    expect(claudeCodeLabels[0]).toBe("CLAUDE.md");
    expect(claudeCodeLabels[claudeCodeLabels.length - 1]).toBe("MCP Servers");
  });

  it("places Agents before Hooks in sidebar", () => {
    const { container } = renderSidebar();
    const labelSpans = container.querySelectorAll(".sidebar-label");
    const labels = Array.from(labelSpans).map((el) => el.textContent);
    const agentsIdx = labels.indexOf("Agents");
    const hooksIdx = labels.indexOf("Hooks");
    expect(agentsIdx).toBeGreaterThan(-1);
    expect(hooksIdx).toBeGreaterThan(-1);
    expect(agentsIdx).toBeLessThan(hooksIdx);
  });

  it("renders the disclaimer", () => {
    renderSidebar();
    expect(screen.getByText(/not affiliated with.*anthropic/i)).toBeInTheDocument();
  });

  it("renders Preferences in the App section", () => {
    renderSidebar();
    expect(screen.getByText("Preferences")).toBeInTheDocument();
  });
});
