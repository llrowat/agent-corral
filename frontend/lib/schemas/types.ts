/**
 * Minimal JSON Schema type definitions for the subset of draft-07
 * features used by SchemaForm. Not a complete JSON Schema type.
 */

/** Custom field rendering hints (our extension, prefixed with x-) */
export interface XFieldHints {
  /** Widget type override */
  widget?:
    | "textarea"
    | "select"
    | "checkbox"
    | "combobox"
    | "tool-checkboxes"
    | "key-value-pairs"
    | "textarea-lines"
    | "tag-input"
    | "color";
  /** Placeholder text */
  placeholder?: string;
  /** Textarea rows */
  rows?: number;
  /** Select options (used when widget=select or enum is present) */
  options?: { value: string; label: string }[];
  /** Checkbox inline label */
  label?: string;
  /** Disable when editing an existing item (e.g. ID fields) */
  disableOnEdit?: boolean;
  /** Treat empty string as null */
  nullable?: boolean;
  /** Key/value pair placeholders */
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  /** Conditional visibility */
  showWhen?: {
    field: string;
    value?: string;
    values?: string[];
  };
}

export interface JSONSchema {
  $schema?: string;
  $id?: string;
  $defs?: Record<string, JSONSchema>;
  $ref?: string;
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: (string | number | boolean | null)[];
  const?: unknown;
  default?: unknown;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  format?: string;
  examples?: unknown[];
  uniqueItems?: boolean;
  additionalProperties?: boolean | JSONSchema;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  /** Our custom rendering hints */
  "x-field"?: XFieldHints;
  /** Allow additional properties for unknown keys */
  [key: string]: unknown;
}
