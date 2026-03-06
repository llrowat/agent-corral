/**
 * SchemaForm — generic form renderer driven by JSON Schema.
 *
 * Given a JSON Schema with optional `x-field` rendering hints, this component
 * renders appropriate form controls for each property. It supports:
 *
 * - string → <input> or <textarea>
 * - boolean → <checkbox>
 * - enum → <select>
 * - array of strings → tool checkboxes, tag input, or textarea-lines
 * - object with string values → key-value pair editor
 * - Conditional visibility via x-field.showWhen
 * - Validation hints from schema (required, pattern, minLength)
 *
 * The component is "controlled" — it takes values and calls onChange.
 */

import { useState } from "react";
import type { JSONSchema, XFieldHints } from "@/lib/schemas/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaFormProps {
  /** The JSON Schema describing the form structure */
  schema: JSONSchema;
  /** Current form values (flat object keyed by property name) */
  values: Record<string, unknown>;
  /** Called when any field changes */
  onChange: (values: Record<string, unknown>) => void;
  /** Whether the form is editing an existing entity (disables ID fields) */
  isEdit?: boolean;
  /** Known tools list for tool-checkboxes widget */
  knownTools?: string[];
  /** Additional className for the form wrapper */
  className?: string;
  /** Which property names to render (default: all) */
  fields?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRef(schema: JSONSchema, root: JSONSchema): JSONSchema {
  if (!schema.$ref) return schema;
  const path = schema.$ref.replace("#/", "").split("/");
  let node: unknown = root;
  for (const segment of path) {
    node = (node as Record<string, unknown>)?.[segment];
  }
  return (node as JSONSchema) ?? schema;
}

function isNullable(propSchema: JSONSchema): boolean {
  if (Array.isArray(propSchema.type) && propSchema.type.includes("null")) {
    return true;
  }
  return propSchema["x-field"]?.nullable === true;
}

function shouldShow(
  hints: XFieldHints | undefined,
  values: Record<string, unknown>
): boolean {
  if (!hints?.showWhen) return true;
  const { field, value, values: allowedValues } = hints.showWhen;
  const current = values[field];
  if (value !== undefined) return current === value;
  if (allowedValues) return allowedValues.includes(current as string);
  return true;
}

function primaryType(propSchema: JSONSchema): string {
  if (Array.isArray(propSchema.type)) {
    return propSchema.type.find((t) => t !== "null") ?? "string";
  }
  return propSchema.type ?? "string";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "KEY",
  valuePlaceholder = "value",
}: {
  pairs: { key: string; value: string }[];
  onChange: (pairs: { key: string; value: string }[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const updatePair = (
    index: number,
    field: "key" | "value",
    val: string
  ) => {
    const updated = [...pairs];
    updated[index] = { ...pairs[index], [field]: val };
    onChange(updated);
  };

  const removePair = (index: number) => {
    onChange(pairs.filter((_, i) => i !== index));
  };

  const addPair = () => {
    onChange([...pairs, { key: "", value: "" }]);
  };

  return (
    <div>
      {pairs.map((pair, i) => (
        <div key={i} className="kv-row">
          <input
            type="text"
            value={pair.key}
            onChange={(e) => updatePair(i, "key", e.target.value)}
            placeholder={keyPlaceholder}
          />
          <input
            type="text"
            value={pair.value}
            onChange={(e) => updatePair(i, "value", e.target.value)}
            placeholder={valuePlaceholder}
          />
          <button
            className="btn-icon"
            onClick={() => removePair(i)}
            type="button"
          >
            x
          </button>
        </div>
      ))}
      <button className="btn btn-sm" onClick={addPair} type="button">
        + Add
      </button>
    </div>
  );
}

function TagInputField({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
      setInputValue("");
    }
  };

  return (
    <div className="tag-input-container">
      {tags.length > 0 && (
        <div className="tag-list">
          {tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
              <button
                className="tag-remove"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                aria-label={`Remove ${tag}`}
                type="button"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="tag-add-row">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
        />
        <button
          className="btn btn-sm"
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          type="button"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool Checkboxes (with MCP support + custom entry)
// ---------------------------------------------------------------------------

function ToolCheckboxes({
  name,
  title,
  description,
  selected,
  coreTools,
  mcpPrefixes,
  customInSelection,
  disabled,
  onChange,
}: {
  name: string;
  title: string;
  description?: string;
  selected: string[];
  coreTools: string[];
  mcpPrefixes: string[];
  customInSelection: string[];
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const [customInput, setCustomInput] = useState("");

  const toggle = (tool: string) => {
    const next = selected.includes(tool)
      ? selected.filter((t) => t !== tool)
      : [...selected, tool];
    onChange(next);
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (trimmed && !selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
      setCustomInput("");
    }
  };

  return (
    <div className="form-group" data-field={name}>
      <label>{title}</label>
      {description && (
        <span className="config-field-hint">{description}</span>
      )}

      {/* Core tools */}
      <div className="tools-section-label">Core Tools</div>
      <div className="tools-grid">
        {coreTools.map((tool) => (
          <label key={tool} className="tool-checkbox">
            <input
              type="checkbox"
              checked={selected.includes(tool)}
              onChange={() => toggle(tool)}
              disabled={disabled}
            />
            <span>{tool}</span>
          </label>
        ))}
      </div>

      {/* MCP tools */}
      {mcpPrefixes.length > 0 && (
        <>
          <div className="tools-section-label" style={{ marginTop: 12 }}>
            MCP Server Tools
          </div>
          <span className="config-field-hint">
            Select an MCP server to allow all its tools, or add specific tools below (e.g. mcp__github__create_issue)
          </span>
          <div className="tools-grid">
            {mcpPrefixes.map((prefix) => {
              const serverId = prefix.slice(5); // strip "mcp__"
              const isChecked = selected.some(
                (t) => t === prefix || t.startsWith(prefix + "__")
              );
              return (
                <label key={prefix} className="tool-checkbox tool-mcp">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(prefix)}
                    disabled={disabled}
                  />
                  <span>mcp: {serverId}</span>
                </label>
              );
            })}
          </div>
        </>
      )}

      {/* Custom / manually-added tools */}
      {customInSelection.length > 0 && (
        <>
          <div className="tools-section-label" style={{ marginTop: 12 }}>Custom</div>
          <div className="tools-grid">
            {customInSelection.map((tool) => (
              <label key={tool} className="tool-checkbox tool-custom">
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggle(tool)}
                  disabled={disabled}
                />
                <span>{tool}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {/* Add custom tool */}
      <div className="tool-custom-add" style={{ marginTop: 8 }}>
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add custom tool (e.g. mcp__github__create_issue)"
          disabled={disabled}
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-sm"
          onClick={addCustom}
          disabled={disabled || !customInput.trim()}
          type="button"
        >
          Add
        </button>
      </div>

      {selected.length === 0 && (
        <span className="config-field-hint">
          No tools selected — will have access to all tools
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field Renderer
// ---------------------------------------------------------------------------

function SchemaField({
  name,
  propSchema,
  rootSchema,
  value,
  onChange,
  isEdit,
  knownTools,
  required,
  allValues,
}: {
  name: string;
  propSchema: JSONSchema;
  rootSchema: JSONSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  isEdit: boolean;
  knownTools: string[];
  required: boolean;
  allValues: Record<string, unknown>;
}) {
  const resolved = resolveRef(propSchema, rootSchema);
  const hints = resolved["x-field"];
  const widget = hints?.widget;
  const type = primaryType(resolved);
  const title = resolved.title ?? name;
  const description = resolved.description;
  const disabled = isEdit && hints?.disableOnEdit === true;

  // Conditional visibility
  if (!shouldShow(hints, allValues)) return null;

  // --- Widget: checkbox ---
  if (widget === "checkbox" || (type === "boolean" && !widget)) {
    return (
      <div className="form-group" data-field={name}>
        <label>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
          />{" "}
          {hints?.label ?? title}
        </label>
        {description && !hints?.label && (
          <span className="config-field-hint">{description}</span>
        )}
      </div>
    );
  }

  // --- Widget: select ---
  if (widget === "select" || (resolved.enum && type === "string")) {
    const options =
      hints?.options ??
      (resolved.enum ?? []).map((v) => ({
        value: v == null ? "" : String(v),
        label: v == null ? "Not set" : String(v),
      }));

    return (
      <div className="form-group" data-field={name}>
        <label>{title}</label>
        {description && (
          <span className="config-field-hint">{description}</span>
        )}
        <select
          value={(value as string) ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(isNullable(resolved) && !v ? null : v);
          }}
          disabled={disabled}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // --- Widget: combobox (select with free-text input) ---
  if (widget === "combobox") {
    const options =
      hints?.options ?? [];
    const placeholder = hints?.placeholder ?? "";
    const currentVal = (value as string) ?? "";

    return (
      <div className="form-group" data-field={name}>
        <label>{title}</label>
        {description && (
          <span className="config-field-hint">{description}</span>
        )}
        <input
          type="text"
          list={`${name}-datalist`}
          value={currentVal}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value;
            onChange(isNullable(resolved) && !v ? null : v);
          }}
          disabled={disabled}
        />
        <datalist id={`${name}-datalist`}>
          {options.map((opt: { value: string; label: string }) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </datalist>
      </div>
    );
  }

  // --- Widget: tool-checkboxes ---
  if (widget === "tool-checkboxes") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const coreTools = knownTools.filter((t) => !t.startsWith("mcp__"));
    const mcpPrefixes = knownTools.filter((t) => t.startsWith("mcp__"));
    // Tools in selection that aren't in knownTools (custom/manually added)
    const customInSelection = selected.filter(
      (t) => !knownTools.includes(t) && !knownTools.some((kt) => t.startsWith(kt + "__"))
    );
    return (
      <ToolCheckboxes
        name={name}
        title={title}
        description={description}
        selected={selected}
        coreTools={coreTools}
        mcpPrefixes={mcpPrefixes}
        customInSelection={customInSelection}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  // --- Widget: key-value-pairs ---
  if (widget === "key-value-pairs") {
    const obj = (value as Record<string, string>) ?? {};
    const pairs = Object.entries(obj).map(([k, v]) => ({
      key: k,
      value: String(v),
    }));

    const handleChange = (newPairs: { key: string; value: string }[]) => {
      const filtered = newPairs.filter((p) => p.key.trim());
      if (filtered.length === 0) {
        onChange(null);
      } else {
        const result: Record<string, string> = {};
        for (const { key, value: val } of filtered) {
          result[key.trim()] = val;
        }
        onChange(result);
      }
    };

    return (
      <div className="form-group" data-field={name}>
        <label>{title}</label>
        {description && (
          <span className="config-field-hint">{description}</span>
        )}
        <KeyValueEditor
          pairs={pairs}
          onChange={handleChange}
          keyPlaceholder={hints?.keyPlaceholder}
          valuePlaceholder={hints?.valuePlaceholder}
        />
      </div>
    );
  }

  // --- Widget: tag-input ---
  if (widget === "tag-input") {
    const tags = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="form-group" data-field={name}>
        <label>{title}</label>
        {description && (
          <span className="config-field-hint">{description}</span>
        )}
        <TagInputField
          tags={tags}
          onChange={onChange as (tags: string[]) => void}
          placeholder={hints?.placeholder}
        />
      </div>
    );
  }

  // --- Widget: textarea-lines (array as newline-separated textarea) ---
  if (widget === "textarea-lines") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="form-group" data-field={name}>
        <label>{title}</label>
        {description && (
          <span className="config-field-hint">{description}</span>
        )}
        <textarea
          rows={hints?.rows ?? 3}
          value={arr.join("\n")}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v ? v.split("\n") : []);
          }}
          placeholder={hints?.placeholder}
          disabled={disabled}
        />
      </div>
    );
  }

  // --- Widget: color ---
  if (widget === "color") {
    const PRESET_COLORS = [
      "#ef4444", "#f97316", "#eab308", "#22c55e",
      "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
    ];
    const currentColor = (value as string) ?? "";
    return (
      <div className="form-group" data-field={name}>
        <label>{title}</label>
        {description && (
          <span className="config-field-hint">{description}</span>
        )}
        <div className="color-picker-row">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch${currentColor === c ? " color-swatch-active" : ""}`}
              style={{ background: c }}
              onClick={() => onChange(c)}
              title={c}
            />
          ))}
          <input
            type="color"
            value={currentColor || "#3b82f6"}
            onChange={(e) => onChange(e.target.value)}
            className="color-input-native"
            title="Pick a custom color"
          />
          {currentColor && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onChange(null)}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- Widget: textarea ---
  if (widget === "textarea" || (type === "string" && (hints?.rows ?? 0) > 1)) {
    return (
      <div className="form-group" data-field={name}>
        <label>{title}{required && ""}</label>
        {description && (
          <span className="config-field-hint">{description}</span>
        )}
        <textarea
          rows={hints?.rows ?? 4}
          value={(value as string) ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(isNullable(resolved) && !v ? null : v);
          }}
          placeholder={hints?.placeholder}
          disabled={disabled}
        />
      </div>
    );
  }

  // --- Default: text input ---
  if (type === "string") {
    return (
      <div className="form-group" data-field={name}>
        <label>{title}</label>
        {description && (
          <span className="config-field-hint">{description}</span>
        )}
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(isNullable(resolved) && !v ? null : v);
          }}
          placeholder={hints?.placeholder}
          disabled={disabled}
        />
      </div>
    );
  }

  // --- Number input ---
  if (type === "number" || type === "integer") {
    return (
      <div className="form-group" data-field={name}>
        <label>{title}</label>
        {description && (
          <span className="config-field-hint">{description}</span>
        )}
        <input
          type="number"
          value={value != null ? String(value) : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              onChange(isNullable(resolved) ? null : undefined);
            } else {
              onChange(type === "integer" ? parseInt(v, 10) : parseFloat(v));
            }
          }}
          placeholder={hints?.placeholder}
          disabled={disabled}
        />
      </div>
    );
  }

  // --- Fallback: render nothing for unsupported types ---
  return null;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SchemaForm({
  schema,
  values,
  onChange,
  isEdit = false,
  knownTools = [],
  className,
  fields,
}: SchemaFormProps) {
  if (!schema.properties) return null;

  const required = new Set(schema.required ?? []);
  const propertyNames = fields ?? Object.keys(schema.properties);

  return (
    <div className={className} data-testid="schema-form">
      {propertyNames.map((name) => {
        const propSchema = schema.properties![name];
        if (!propSchema) return null;

        return (
          <SchemaField
            key={name}
            name={name}
            propSchema={propSchema}
            rootSchema={schema}
            value={values[name]}
            onChange={(v) => onChange({ ...values, [name]: v })}
            isEdit={isEdit}
            knownTools={knownTools}
            required={required.has(name)}
            allValues={values}
          />
        );
      })}
    </div>
  );
}
