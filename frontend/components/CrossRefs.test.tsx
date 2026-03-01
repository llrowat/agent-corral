import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CrossRefs } from "./CrossRefs";
import type { Agent, MemoryStore } from "@/types";

const mockAgent: Agent = {
  agentId: "reviewer",
  name: "Code Reviewer",
  description: "Reviews code",
  systemPrompt: "You review code.",
  tools: ["Read", "Grep"],
  modelOverride: null,
  memory: "default",
};

const mockAgentNoTools: Agent = {
  agentId: "empty",
  name: "Empty Agent",
  description: "",
  systemPrompt: "No tools.",
  tools: [],
  modelOverride: null,
  memory: null,
};

const mockMemoryStore: MemoryStore = {
  storeId: "default",
  name: "default",
  path: "/test",
  entryCount: 3,
};

const orphanedMemory: MemoryStore = {
  storeId: "unused",
  name: "unused",
  path: "/test2",
  entryCount: 0,
};

describe("CrossRefs", () => {
  it("returns null when no entities", () => {
    const { container } = render(
      <CrossRefs
        agents={[]}
        hooks={[]}
        skills={[]}
        mcpServers={[]}
        memoryStores={[]}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows agent-memory references when toggled open", () => {
    render(
      <CrossRefs
        agents={[mockAgent]}
        hooks={[]}
        skills={[]}
        mcpServers={[]}
        memoryStores={[mockMemoryStore]}
      />
    );
    // Find and click the toggle
    const toggle = screen.getByText("Cross-References");
    fireEvent.click(toggle);
    // Agent appears in both memory and tools sections
    expect(screen.getAllByText("Code Reviewer").length).toBeGreaterThanOrEqual(1);
    // The memory store ID is shown
    expect(screen.getByText("default")).toBeInTheDocument();
  });

  it("detects orphaned memory stores", () => {
    render(
      <CrossRefs
        agents={[mockAgent]}
        hooks={[]}
        skills={[]}
        mcpServers={[]}
        memoryStores={[mockMemoryStore, orphanedMemory]}
      />
    );
    const toggle = screen.getByText("Cross-References");
    fireEvent.click(toggle);
    expect(screen.getByText(/unused.*not bound/i)).toBeInTheDocument();
  });

  it("detects agents with no tools configured", () => {
    render(
      <CrossRefs
        agents={[mockAgentNoTools]}
        hooks={[]}
        skills={[]}
        mcpServers={[]}
        memoryStores={[]}
      />
    );
    const toggle = screen.getByText("Cross-References");
    fireEvent.click(toggle);
    expect(screen.getByText(/Empty Agent.*no tools/i)).toBeInTheDocument();
  });
});
