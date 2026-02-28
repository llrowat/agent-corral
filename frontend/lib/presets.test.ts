import { describe, it, expect } from "vitest";
import {
  AGENT_PRESETS,
  HOOK_PRESETS,
  SKILL_PRESETS,
  MCP_PRESETS,
  STARTER_TEMPLATES,
  toSlug,
  suggestSlugFix,
} from "./presets";

describe("toSlug", () => {
  it("converts uppercase to lowercase", () => {
    expect(toSlug("My Agent")).toBe("my-agent");
  });

  it("replaces spaces with hyphens", () => {
    expect(toSlug("code reviewer")).toBe("code-reviewer");
  });

  it("removes special characters", () => {
    expect(toSlug("my_agent!@#")).toBe("my-agent");
  });

  it("strips leading and trailing hyphens", () => {
    expect(toSlug("--test--")).toBe("test");
  });

  it("collapses multiple non-alphanumeric chars into single hyphen", () => {
    expect(toSlug("foo   bar___baz")).toBe("foo-bar-baz");
  });

  it("returns empty string for empty input", () => {
    expect(toSlug("")).toBe("");
  });

  it("handles already valid slugs", () => {
    expect(toSlug("already-valid")).toBe("already-valid");
  });
});

describe("suggestSlugFix", () => {
  it("returns a fix when input is not a valid slug", () => {
    expect(suggestSlugFix("My Agent")).toBe("my-agent");
  });

  it("returns null when input is already a valid slug", () => {
    expect(suggestSlugFix("my-agent")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(suggestSlugFix("")).toBeNull();
  });

  it("fixes underscores to hyphens", () => {
    expect(suggestSlugFix("my_agent")).toBe("my-agent");
  });
});

describe("AGENT_PRESETS", () => {
  it("has at least one preset", () => {
    expect(AGENT_PRESETS.length).toBeGreaterThan(0);
  });

  it("each preset has required fields", () => {
    for (const preset of AGENT_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.agent.agentId).toBeTruthy();
      expect(preset.agent.name).toBeTruthy();
      expect(preset.agent.systemPrompt).toBeTruthy();
    }
  });

  it("each preset agent ID is a valid slug", () => {
    for (const preset of AGENT_PRESETS) {
      expect(preset.agent.agentId).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("all preset IDs are unique", () => {
    const ids = AGENT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("HOOK_PRESETS", () => {
  it("has at least one preset", () => {
    expect(HOOK_PRESETS.length).toBeGreaterThan(0);
  });

  it("each preset has a valid event type", () => {
    const validEvents = [
      "PreToolUse",
      "PostToolUse",
      "Notification",
      "Stop",
      "SubagentStop",
    ];
    for (const preset of HOOK_PRESETS) {
      expect(validEvents).toContain(preset.hookEvent.event);
    }
  });

  it("each preset has at least one group with at least one handler", () => {
    for (const preset of HOOK_PRESETS) {
      expect(preset.hookEvent.groups.length).toBeGreaterThan(0);
      for (const group of preset.hookEvent.groups) {
        expect(group.hooks.length).toBeGreaterThan(0);
      }
    }
  });

  it("each handler has a valid type", () => {
    for (const preset of HOOK_PRESETS) {
      for (const group of preset.hookEvent.groups) {
        for (const hook of group.hooks) {
          expect(["command", "prompt"]).toContain(hook.hookType);
        }
      }
    }
  });
});

describe("SKILL_PRESETS", () => {
  it("has at least one preset", () => {
    expect(SKILL_PRESETS.length).toBeGreaterThan(0);
  });

  it("each preset skill ID is a valid slug", () => {
    for (const preset of SKILL_PRESETS) {
      expect(preset.skill.skillId).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("each preset has content", () => {
    for (const preset of SKILL_PRESETS) {
      expect(preset.skill.content.length).toBeGreaterThan(0);
    }
  });
});

describe("MCP_PRESETS", () => {
  it("has at least one preset", () => {
    expect(MCP_PRESETS.length).toBeGreaterThan(0);
  });

  it("each preset has a valid server type", () => {
    for (const preset of MCP_PRESETS) {
      expect(["stdio", "http", "sse"]).toContain(preset.server.serverType);
    }
  });

  it("stdio presets have a command", () => {
    for (const preset of MCP_PRESETS) {
      if (preset.server.serverType === "stdio") {
        expect(preset.server.command).toBeTruthy();
      }
    }
  });
});

describe("STARTER_TEMPLATES", () => {
  it("has at least one template", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("each template has a config with a model", () => {
    for (const template of STARTER_TEMPLATES) {
      expect(template.config.model).toBeTruthy();
    }
  });

  it("minimal template has no agents or hooks", () => {
    const minimal = STARTER_TEMPLATES.find((t) => t.id === "minimal");
    expect(minimal).toBeDefined();
    expect(minimal!.agents).toHaveLength(0);
    expect(minimal!.hooks).toHaveLength(0);
  });

  it("web-app template has agents and hooks", () => {
    const webApp = STARTER_TEMPLATES.find((t) => t.id === "web-app");
    expect(webApp).toBeDefined();
    expect(webApp!.agents.length).toBeGreaterThan(0);
    expect(webApp!.hooks.length).toBeGreaterThan(0);
  });

  it("all template IDs are unique", () => {
    const ids = STARTER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
