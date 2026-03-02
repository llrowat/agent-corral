import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemaForm } from "./SchemaForm";
import type { JSONSchema } from "@/lib/schemas/types";

const SIMPLE_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      title: "Name",
      description: "The agent name",
      "x-field": { placeholder: "My Agent" },
    },
    description: {
      type: "string",
      title: "Description",
      "x-field": { widget: "textarea", rows: 3, placeholder: "Describe..." },
    },
    active: {
      type: "boolean",
      title: "Active",
      "x-field": { widget: "checkbox", label: "Is this agent active?" },
    },
    model: {
      type: ["string", "null"],
      title: "Model",
      "x-field": {
        widget: "select",
        nullable: true,
        options: [
          { value: "", label: "Default" },
          { value: "opus", label: "Opus" },
          { value: "sonnet", label: "Sonnet" },
        ],
      },
    },
  },
  required: ["name"],
};

const TOOLS_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    tools: {
      type: "array",
      title: "Allowed Tools",
      items: { type: "string" },
      "x-field": { widget: "tool-checkboxes" },
    },
  },
};

const KV_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    env: {
      type: ["object", "null"],
      title: "Environment Variables",
      additionalProperties: { type: "string" },
      "x-field": {
        widget: "key-value-pairs",
        keyPlaceholder: "KEY",
        valuePlaceholder: "value",
        nullable: true,
      },
    },
  },
};

const CONDITIONAL_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    serverType: {
      type: "string",
      title: "Type",
      enum: ["stdio", "http"],
      "x-field": {
        widget: "select",
        options: [
          { value: "stdio", label: "stdio" },
          { value: "http", label: "http" },
        ],
      },
    },
    command: {
      type: ["string", "null"],
      title: "Command",
      "x-field": {
        placeholder: "npx ...",
        nullable: true,
        showWhen: { field: "serverType", value: "stdio" },
      },
    },
    url: {
      type: ["string", "null"],
      title: "URL",
      "x-field": {
        placeholder: "http://...",
        nullable: true,
        showWhen: { field: "serverType", values: ["http"] },
      },
    },
  },
};

describe("SchemaForm", () => {
  it("renders text input for string fields", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={SIMPLE_SCHEMA}
        values={{ name: "Test Agent", description: "", active: false, model: null }}
        onChange={onChange}
      />
    );

    expect(screen.getByTestId("schema-form")).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText("My Agent");
    expect(nameInput).toBeInTheDocument();
    expect((nameInput as HTMLInputElement).value).toBe("Test Agent");
  });

  it("renders textarea for textarea widget", () => {
    render(
      <SchemaForm
        schema={SIMPLE_SCHEMA}
        values={{ name: "", description: "Hello", active: false, model: null }}
        onChange={vi.fn()}
      />
    );

    const textarea = screen.getByPlaceholderText("Describe...");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect((textarea as HTMLTextAreaElement).value).toBe("Hello");
  });

  it("renders checkbox for boolean fields", () => {
    render(
      <SchemaForm
        schema={SIMPLE_SCHEMA}
        values={{ name: "", description: "", active: true, model: null }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("Is this agent active?")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
  });

  it("renders select for select widget", () => {
    render(
      <SchemaForm
        schema={SIMPLE_SCHEMA}
        values={{ name: "", description: "", active: false, model: "opus" }}
        onChange={vi.fn()}
      />
    );

    const select = screen.getByDisplayValue("Opus");
    expect(select).toBeInTheDocument();
    expect(select.tagName).toBe("SELECT");
  });

  it("calls onChange when text input changes", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={SIMPLE_SCHEMA}
        values={{ name: "Old", description: "", active: false, model: null }}
        onChange={onChange}
      />
    );

    const nameInput = screen.getByPlaceholderText("My Agent");
    fireEvent.change(nameInput, { target: { value: "New Name" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Name" })
    );
  });

  it("calls onChange with null for nullable empty select", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={SIMPLE_SCHEMA}
        values={{ name: "", description: "", active: false, model: "opus" }}
        onChange={onChange}
      />
    );

    const select = screen.getByDisplayValue("Opus");
    fireEvent.change(select, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ model: null })
    );
  });

  it("renders tool checkboxes with knownTools", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={TOOLS_SCHEMA}
        values={{ tools: ["Read"] }}
        onChange={onChange}
        knownTools={["Read", "Write", "Bash"]}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);

    // Read should be checked
    expect(checkboxes[0]).toBeChecked();
    // Write should not be checked
    expect(checkboxes[1]).not.toBeChecked();

    // Toggle Write on
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ tools: ["Read", "Write"] })
    );
  });

  it("renders key-value pair editor", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={KV_SCHEMA}
        values={{ env: { API_KEY: "secret" } }}
        onChange={onChange}
      />
    );

    expect(screen.getByDisplayValue("API_KEY")).toBeInTheDocument();
    expect(screen.getByDisplayValue("secret")).toBeInTheDocument();
    expect(screen.getByText("+ Add")).toBeInTheDocument();
  });

  it("handles conditional visibility with showWhen", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SchemaForm
        schema={CONDITIONAL_SCHEMA}
        values={{ serverType: "stdio", command: "npx foo", url: null }}
        onChange={onChange}
      />
    );

    // Command should be visible for stdio
    expect(screen.getByPlaceholderText("npx ...")).toBeInTheDocument();
    // URL should be hidden for stdio
    expect(screen.queryByPlaceholderText("http://...")).not.toBeInTheDocument();

    // Switch to http
    rerender(
      <SchemaForm
        schema={CONDITIONAL_SCHEMA}
        values={{ serverType: "http", command: null, url: "http://local" }}
        onChange={onChange}
      />
    );

    // URL should now be visible
    expect(screen.getByPlaceholderText("http://...")).toBeInTheDocument();
    // Command should be hidden
    expect(screen.queryByPlaceholderText("npx ...")).not.toBeInTheDocument();
  });

  it("disables fields with disableOnEdit when isEdit is true", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        id: {
          type: "string",
          title: "ID",
          "x-field": { placeholder: "my-id", disableOnEdit: true },
        },
      },
    };

    render(
      <SchemaForm
        schema={schema}
        values={{ id: "test-id" }}
        onChange={vi.fn()}
        isEdit={true}
      />
    );

    const input = screen.getByPlaceholderText("my-id");
    expect(input).toBeDisabled();
  });

  it("does not disable fields when isEdit is false", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        id: {
          type: "string",
          title: "ID",
          "x-field": { placeholder: "my-id", disableOnEdit: true },
        },
      },
    };

    render(
      <SchemaForm
        schema={schema}
        values={{ id: "" }}
        onChange={vi.fn()}
        isEdit={false}
      />
    );

    const input = screen.getByPlaceholderText("my-id");
    expect(input).not.toBeDisabled();
  });

  it("renders only specified fields when fields prop is given", () => {
    render(
      <SchemaForm
        schema={SIMPLE_SCHEMA}
        values={{ name: "Agent", description: "Desc", active: false, model: null }}
        onChange={vi.fn()}
        fields={["name"]}
      />
    );

    expect(screen.getByPlaceholderText("My Agent")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Describe...")).not.toBeInTheDocument();
    expect(screen.queryByText("Is this agent active?")).not.toBeInTheDocument();
  });

  it("renders nothing when schema has no properties", () => {
    const { container } = render(
      <SchemaForm
        schema={{ type: "object" }}
        values={{}}
        onChange={vi.fn()}
      />
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders number input for integer type", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        timeout: {
          type: "integer",
          title: "Timeout",
          "x-field": { placeholder: "30" },
        },
      },
    };

    const onChange = vi.fn();
    render(
      <SchemaForm
        schema={schema}
        values={{ timeout: 60 }}
        onChange={onChange}
      />
    );

    const input = screen.getByPlaceholderText("30");
    expect(input).toHaveAttribute("type", "number");
    expect((input as HTMLInputElement).value).toBe("60");

    fireEvent.change(input, { target: { value: "90" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 90 })
    );
  });

  it("renders description as hint text", () => {
    render(
      <SchemaForm
        schema={SIMPLE_SCHEMA}
        values={{ name: "", description: "", active: false, model: null }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText("The agent name")).toBeInTheDocument();
  });
});
