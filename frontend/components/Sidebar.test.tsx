import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import type { ProjectScanResult } from "@/lib/tauri";

const mockCounts: ProjectScanResult = {
  hasClaudeMd: true,
  claudeMdCount: 2,
  agentCount: 5,
  skillCount: 3,
  hookCount: 7,
  mcpServerCount: 2,
  hasSettings: true,
  settingsKeyCount: 4,
  hasMemory: true,
  memoryStoreCount: 1,
};

describe("Sidebar", () => {
  it("shows Export/Import instead of Plugins", () => {
    render(
      <MemoryRouter>
        <Sidebar scope={null} />
      </MemoryRouter>
    );

    expect(screen.getByText("Export/Import")).toBeInTheDocument();
    expect(screen.queryByText("Plugins")).not.toBeInTheDocument();
  });

  it("renders all navigation items", () => {
    render(
      <MemoryRouter>
        <Sidebar scope={null} />
      </MemoryRouter>
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Hooks")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("MCP Servers")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Export/Import")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Preferences")).toBeInTheDocument();
  });

  it("displays counts when provided", () => {
    render(
      <MemoryRouter>
        <Sidebar scope={null} counts={mockCounts} />
      </MemoryRouter>
    );

    // Check that count badges are rendered
    const countElements = document.querySelectorAll(".sidebar-count");
    expect(countElements.length).toBe(7); // CLAUDE.md, Settings, Agents, Hooks, Memory, Skills, MCP

    // Verify specific counts by checking badge text content
    const countValues = Array.from(countElements).map((el) => el.textContent);
    expect(countValues).toContain("5"); // agents
    expect(countValues).toContain("3"); // skills
    expect(countValues).toContain("7"); // hooks
    expect(countValues).toContain("2"); // CLAUDE.md and MCP both = 2
    expect(countValues).toContain("4"); // settings
    expect(countValues).toContain("1"); // memory
  });

  it("does not display counts when zero", () => {
    const zeroCounts: ProjectScanResult = {
      hasClaudeMd: false,
      claudeMdCount: 0,
      agentCount: 0,
      skillCount: 0,
      hookCount: 0,
      mcpServerCount: 0,
      hasSettings: false,
      settingsKeyCount: 0,
      hasMemory: false,
      memoryStoreCount: 0,
    };

    render(
      <MemoryRouter>
        <Sidebar scope={null} counts={zeroCounts} />
      </MemoryRouter>
    );

    // No sidebar-count elements should be rendered
    expect(document.querySelectorAll(".sidebar-count").length).toBe(0);
  });

  it("does not display counts when counts is null", () => {
    render(
      <MemoryRouter>
        <Sidebar scope={null} counts={null} />
      </MemoryRouter>
    );

    expect(document.querySelectorAll(".sidebar-count").length).toBe(0);
  });
});
