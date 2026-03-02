import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSchema } from "./useSchema";
import { clearSettingsSchemaCache } from "@/lib/schemas";

describe("useSchema", () => {
  beforeEach(() => {
    clearSettingsSchemaCache();
    vi.restoreAllMocks();
  });

  it("returns agent schema synchronously", () => {
    const { result } = renderHook(() => useSchema("agent"));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.schema).not.toBeNull();
    expect(result.current.schema?.properties).toHaveProperty("agentId");
    expect(result.current.schema?.properties).toHaveProperty("name");
    expect(result.current.schema?.properties).toHaveProperty("systemPrompt");
    expect(result.current.schema?.properties).toHaveProperty("tools");
    expect(result.current.schema?.properties).toHaveProperty("modelOverride");
    expect(result.current.schema?.properties).toHaveProperty("memory");
  });

  it("returns skill schema synchronously", () => {
    const { result } = renderHook(() => useSchema("skill"));

    expect(result.current.loading).toBe(false);
    expect(result.current.schema).not.toBeNull();
    expect(result.current.schema?.properties).toHaveProperty("skillId");
    expect(result.current.schema?.properties).toHaveProperty("name");
    expect(result.current.schema?.properties).toHaveProperty("allowedTools");
    expect(result.current.schema?.properties).toHaveProperty("content");
    expect(result.current.schema?.properties).toHaveProperty("userInvocable");
  });

  it("returns mcp-server schema synchronously", () => {
    const { result } = renderHook(() => useSchema("mcp-server"));

    expect(result.current.loading).toBe(false);
    expect(result.current.schema).not.toBeNull();
    expect(result.current.schema?.properties).toHaveProperty("serverId");
    expect(result.current.schema?.properties).toHaveProperty("serverType");
    expect(result.current.schema?.properties).toHaveProperty("command");
    expect(result.current.schema?.properties).toHaveProperty("url");
    expect(result.current.schema?.properties).toHaveProperty("env");
    expect(result.current.schema?.properties).toHaveProperty("headers");
  });

  it("fetches settings schema asynchronously and falls back to bundled snapshot", async () => {
    // Mock fetch to fail so it falls back to bundled snapshot
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useSchema("settings"));

    // Initially loading
    expect(result.current.loading).toBe(true);

    // Wait for fallback to bundled schema
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.schema).not.toBeNull();
    // The bundled settings schema should have the permissions property
    expect(result.current.schema?.properties).toHaveProperty("permissions");
  });

  it("agent schema has correct x-field hints", () => {
    const { result } = renderHook(() => useSchema("agent"));
    const schema = result.current.schema!;

    // Check x-field hints on agentId
    const agentIdField = schema.properties!.agentId;
    expect(agentIdField["x-field"]).toBeDefined();
    expect(agentIdField["x-field"]!.disableOnEdit).toBe(true);
    expect(agentIdField["x-field"]!.placeholder).toBe("my-agent");

    // Check tools has tool-checkboxes widget
    const toolsField = schema.properties!.tools;
    expect(toolsField["x-field"]!.widget).toBe("tool-checkboxes");

    // Check modelOverride has select widget
    const modelField = schema.properties!.modelOverride;
    expect(modelField["x-field"]!.widget).toBe("select");
    expect(modelField["x-field"]!.options).toHaveLength(4);
  });

  it("mcp-server schema has showWhen conditions", () => {
    const { result } = renderHook(() => useSchema("mcp-server"));
    const schema = result.current.schema!;

    // Command should show when serverType is stdio
    const commandField = schema.properties!.command;
    expect(commandField["x-field"]!.showWhen).toEqual({
      field: "serverType",
      value: "stdio",
    });

    // URL should show when serverType is http or sse
    const urlField = schema.properties!.url;
    expect(urlField["x-field"]!.showWhen).toEqual({
      field: "serverType",
      values: ["http", "sse"],
    });

    // Headers should show when serverType is http or sse
    const headersField = schema.properties!.headers;
    expect(headersField["x-field"]!.showWhen).toEqual({
      field: "serverType",
      values: ["http", "sse"],
    });
  });

  it("schema has correct required fields", () => {
    const { result: agentResult } = renderHook(() => useSchema("agent"));
    expect(agentResult.current.schema!.required).toEqual([
      "agentId",
      "name",
      "description",
      "systemPrompt",
    ]);

    const { result: skillResult } = renderHook(() => useSchema("skill"));
    expect(skillResult.current.schema!.required).toEqual(["skillId", "name"]);

    const { result: mcpResult } = renderHook(() => useSchema("mcp-server"));
    expect(mcpResult.current.schema!.required).toEqual([
      "serverId",
      "serverType",
    ]);
  });
});
