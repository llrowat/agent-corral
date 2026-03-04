import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemaForm } from "./SchemaForm";

const toolCheckboxSchema = {
  type: "object" as const,
  properties: {
    tools: {
      type: "array" as const,
      title: "Allowed Tools",
      description: "Tools this agent is allowed to use.",
      items: { type: "string" as const },
      uniqueItems: true,
      "x-field": { widget: "tool-checkboxes" as const },
    },
  },
};

describe("SchemaForm tool-checkboxes widget", () => {
  it("renders core tools as checkboxes", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={toolCheckboxSchema}
        values={{ tools: [] }}
        onChange={onChange}
        knownTools={["Read", "Write", "Bash"]}
      />
    );

    expect(screen.getByText("Core Tools")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Write")).toBeInTheDocument();
    expect(screen.getByText("Bash")).toBeInTheDocument();
  });

  it("renders MCP server tools in a separate section", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={toolCheckboxSchema}
        values={{ tools: [] }}
        onChange={onChange}
        knownTools={["Read", "Write", "mcp__github"]}
      />
    );

    expect(screen.getByText("Core Tools")).toBeInTheDocument();
    expect(screen.getByText("MCP Server Tools")).toBeInTheDocument();
    expect(screen.getByText("mcp: github")).toBeInTheDocument();
  });

  it("shows no MCP section when no MCP tools present", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={toolCheckboxSchema}
        values={{ tools: [] }}
        onChange={onChange}
        knownTools={["Read", "Write"]}
      />
    );

    expect(screen.getByText("Core Tools")).toBeInTheDocument();
    expect(screen.queryByText("MCP Server Tools")).not.toBeInTheDocument();
  });

  it("allows adding custom tool names", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={toolCheckboxSchema}
        values={{ tools: [] }}
        onChange={onChange}
        knownTools={["Read"]}
      />
    );

    const input = screen.getByPlaceholderText(/Add custom tool/);
    fireEvent.change(input, { target: { value: "mcp__github__create_issue" } });
    fireEvent.click(screen.getByText("Add"));

    expect(onChange).toHaveBeenCalledWith({
      tools: ["mcp__github__create_issue"],
    });
  });

  it("shows selected tools as checked", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={toolCheckboxSchema}
        values={{ tools: ["Read", "Bash"] }}
        onChange={onChange}
        knownTools={["Read", "Write", "Bash"]}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    const readCheckbox = checkboxes.find(
      (cb) => cb.closest("label")?.textContent?.includes("Read")
    ) as HTMLInputElement;
    const writeCheckbox = checkboxes.find(
      (cb) => cb.closest("label")?.textContent?.includes("Write")
    ) as HTMLInputElement;

    expect(readCheckbox.checked).toBe(true);
    expect(writeCheckbox.checked).toBe(false);
  });

  it("shows hint when no tools selected", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={toolCheckboxSchema}
        values={{ tools: [] }}
        onChange={onChange}
        knownTools={["Read"]}
      />
    );

    expect(
      screen.getByText("No tools selected \u2014 will have access to all tools")
    ).toBeInTheDocument();
  });
});
