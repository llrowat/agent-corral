import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";
import { invoke } from "@tauri-apps/api/core";
import { AgentsPage } from "./AgentsPage";
import { SkillsPage } from "./SkillsPage";
import { HooksPage } from "./HooksPage";
import { McpPage } from "./McpPage";
import { MemoryPage } from "./MemoryPage";
import { ConfigPage } from "./ConfigPage";
import type { Scope } from "@/types";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;

const globalScope: Scope = {
  type: "global",
  homePath: "/home/user",
};

function setupEmptyMocks() {
  mockInvoke.mockImplementation(async () => []);
}

describe("Page descriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyMocks();
  });

  it("AgentsPage renders a description for new users", async () => {
    renderWithProviders(<AgentsPage scope={globalScope} homePath="/home/user" />);
    expect(
      screen.getByText(/custom personas for claude code/i)
    ).toBeInTheDocument();
  });

  it("SkillsPage renders a description for new users", async () => {
    renderWithProviders(<SkillsPage scope={globalScope} homePath="/home/user" />);
    expect(
      screen.getByText(/custom slash commands for claude code/i)
    ).toBeInTheDocument();
  });

  it("HooksPage renders a description for new users", async () => {
    renderWithProviders(<HooksPage scope={globalScope} homePath="/home/user" />);
    expect(
      screen.getByText(/shell commands that run automatically/i)
    ).toBeInTheDocument();
  });

  it("McpPage renders a description for new users", async () => {
    renderWithProviders(<McpPage scope={globalScope} homePath="/home/user" />);
    expect(
      screen.getByText(/external tool servers/i)
    ).toBeInTheDocument();
  });

  it("MemoryPage renders a description for new users", async () => {
    renderWithProviders(<MemoryPage scope={globalScope} homePath="/home/user" />);
    expect(
      screen.getByText(/persistent notes that claude code/i)
    ).toBeInTheDocument();
  });

  it("ConfigPage renders a description for new users", async () => {
    renderWithProviders(<ConfigPage scope={globalScope} />);
    expect(
      screen.getByText(/project and global settings/i)
    ).toBeInTheDocument();
  });

  it("descriptions have the page-description class", async () => {
    const { container } = renderWithProviders(
      <AgentsPage scope={globalScope} homePath="/home/user" />
    );
    const desc = container.querySelector(".page-description");
    expect(desc).toBeInTheDocument();
    expect(desc?.tagName).toBe("P");
  });
});
