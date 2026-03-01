/**
 * Schema registry — provides JSON Schemas for all Claude Code config entities.
 *
 * - settings.json: Fetched at runtime from SchemaStore (official Anthropic schema)
 * - agents, skills, MCP servers: Local schemas bundled with the app
 *
 * All schemas follow JSON Schema draft-07 with optional `x-field` extensions
 * that hint how the SchemaForm component should render each property.
 */

import agentSchema from "./agent.schema.json";
import skillSchema from "./skill.schema.json";
import mcpServerSchema from "./mcp-server.schema.json";

export type { JSONSchema } from "./types";

export { agentSchema, skillSchema, mcpServerSchema };

/** URL of the official Claude Code settings schema on SchemaStore */
export const SETTINGS_SCHEMA_URL =
  "https://json.schemastore.org/claude-code-settings.json";

/**
 * Fetch the official settings.json schema from SchemaStore with caching.
 * Falls back to the bundled snapshot if the fetch fails.
 */
let _settingsSchemaCache: Record<string, unknown> | null = null;

export async function fetchSettingsSchema(): Promise<Record<string, unknown>> {
  if (_settingsSchemaCache) return _settingsSchemaCache;

  try {
    const res = await fetch(SETTINGS_SCHEMA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const schema = await res.json();
    _settingsSchemaCache = schema;
    return schema;
  } catch {
    // Fall back to bundled snapshot
    const snapshot = await import("./claude-code-settings.schema.json");
    _settingsSchemaCache = snapshot.default ?? snapshot;
    return _settingsSchemaCache!;
  }
}

/** Clear the settings schema cache (useful for testing) */
export function clearSettingsSchemaCache(): void {
  _settingsSchemaCache = null;
}
