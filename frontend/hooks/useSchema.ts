import { useEffect, useState } from "react";
import type { JSONSchema } from "@/lib/schemas/types";
import {
  agentSchema,
  skillSchema,
  mcpServerSchema,
  fetchSettingsSchema,
} from "@/lib/schemas";

export type SchemaId = "agent" | "skill" | "mcp-server" | "settings";

/** Synchronous schemas (bundled with the app) */
const LOCAL_SCHEMAS: Record<string, JSONSchema> = {
  agent: agentSchema as unknown as JSONSchema,
  skill: skillSchema as unknown as JSONSchema,
  "mcp-server": mcpServerSchema as unknown as JSONSchema,
};

export interface UseSchemaResult {
  schema: JSONSchema | null;
  loading: boolean;
  error: string | null;
}

/**
 * React hook that provides a JSON Schema for a given entity type.
 *
 * Local schemas (agent, skill, mcp-server) are returned synchronously.
 * The settings schema is fetched from SchemaStore on first use and cached.
 */
export function useSchema(schemaId: SchemaId): UseSchemaResult {
  const [schema, setSchema] = useState<JSONSchema | null>(
    LOCAL_SCHEMAS[schemaId] ?? null
  );
  const [loading, setLoading] = useState(schemaId === "settings");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (schemaId !== "settings") {
      setSchema(LOCAL_SCHEMAS[schemaId] ?? null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSettingsSchema()
      .then((s) => {
        if (!cancelled) {
          setSchema(s as unknown as JSONSchema);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [schemaId]);

  return { schema, loading, error };
}
