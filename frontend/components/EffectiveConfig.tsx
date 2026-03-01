import { useEffect, useState, useCallback } from "react";
import type {
  Scope,
  NormalizedConfig,
  Agent,
  HookEvent,
  Skill,
  McpServer,
  MemoryStore,
} from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope | null;
  homePath: string | null;
}

interface EffectiveState {
  config: NormalizedConfig | null;
  globalConfig: NormalizedConfig | null;
  agents: Agent[];
  globalAgents: Agent[];
  hooks: HookEvent[];
  globalHooks: HookEvent[];
  skills: Skill[];
  globalSkills: Skill[];
  mcpServers: McpServer[];
  globalMcpServers: McpServer[];
  memoryStores: MemoryStore[];
  globalMemoryStores: MemoryStore[];
}

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

export function EffectiveConfig({ scope, homePath }: Props) {
  const [state, setState] = useState<EffectiveState | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const basePath =
    scope?.type === "global"
      ? scope.homePath
      : scope?.type === "project"
        ? scope.repo.path
        : null;
  const isProject = scope?.type === "project";
  const isGlobal = scope?.type === "global";

  const loadAll = useCallback(async () => {
    if (!basePath) return;
    setLoading(true);
    try {
      const [config, agents, hooks, skills, mcpServers, memoryStores] =
        await Promise.all([
          api.readClaudeConfig(basePath).catch(() => null),
          api.readAgents(basePath).catch(() => []),
          api.readHooks(basePath).catch(() => []),
          api.readSkills(basePath).catch(() => []),
          api.readMcpServers(basePath, isGlobal).catch(() => []),
          api.readMemoryStores(basePath).catch(() => []),
        ]);

      let globalConfig: NormalizedConfig | null = null;
      let globalAgents: Agent[] = [];
      let globalHooks: HookEvent[] = [];
      let globalSkills: Skill[] = [];
      let globalMcpServers: McpServer[] = [];
      let globalMemoryStores: MemoryStore[] = [];

      if (isProject && homePath) {
        [
          globalConfig,
          globalAgents,
          globalHooks,
          globalSkills,
          globalMcpServers,
          globalMemoryStores,
        ] = await Promise.all([
          api.readClaudeConfig(homePath).catch(() => null),
          api.readAgents(homePath).catch(() => []),
          api.readHooks(homePath).catch(() => []),
          api.readSkills(homePath).catch(() => []),
          api.readMcpServers(homePath, true).catch(() => []),
          api.readMemoryStores(homePath).catch(() => []),
        ]);
      }

      setState({
        config,
        globalConfig,
        agents,
        globalAgents,
        hooks,
        globalHooks,
        skills,
        globalSkills,
        mcpServers,
        globalMcpServers,
        memoryStores,
        globalMemoryStores,
      });
    } finally {
      setLoading(false);
    }
  }, [basePath, isProject, isGlobal, homePath]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!scope || loading || !state) {
    return null;
  }

  // Compute effective values
  const effectiveModel =
    state.config?.model || state.globalConfig?.model || null;
  const modelSource = state.config?.model
    ? "project"
    : state.globalConfig?.model
      ? "global"
      : "default";

  const effectivePermissions =
    state.config?.permissions || state.globalConfig?.permissions || null;
  const permSource = state.config?.permissions
    ? "project"
    : state.globalConfig?.permissions
      ? "global"
      : "default";

  const effectiveIgnore =
    state.config?.ignorePatterns ||
    state.globalConfig?.ignorePatterns ||
    null;
  const ignoreSource = state.config?.ignorePatterns
    ? "project"
    : state.globalConfig?.ignorePatterns
      ? "global"
      : "default";

  // Merge agents (project overrides global by ID)
  const projectAgentIds = new Set(state.agents.map((a) => a.agentId));
  const mergedAgents = [
    ...state.agents.map((a) => ({ ...a, source: "project" as const })),
    ...state.globalAgents
      .filter((a) => !projectAgentIds.has(a.agentId))
      .map((a) => ({ ...a, source: "global" as const })),
  ];

  // Merge skills
  const projectSkillIds = new Set(state.skills.map((s) => s.skillId));
  const mergedSkills = [
    ...state.skills.map((s) => ({ ...s, source: "project" as const })),
    ...state.globalSkills
      .filter((s) => !projectSkillIds.has(s.skillId))
      .map((s) => ({ ...s, source: "global" as const })),
  ];

  // Hooks: both global and project run (no override)
  const allHooks = [
    ...state.hooks.map((h) => ({ ...h, source: "project" as const })),
    ...state.globalHooks.map((h) => ({ ...h, source: "global" as const })),
  ];

  // MCP: merge by server ID
  const projectServerIds = new Set(state.mcpServers.map((s) => s.serverId));
  const mergedMcp = [
    ...state.mcpServers.map((s) => ({ ...s, source: "project" as const })),
    ...state.globalMcpServers
      .filter((s) => !projectServerIds.has(s.serverId))
      .map((s) => ({ ...s, source: "global" as const })),
  ];

  return (
    <div className="effective-config">
      <button
        className="effective-config-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`toggle-arrow ${expanded ? "open" : ""}`}>
          &#9654;
        </span>
        <h3>Effective Configuration</h3>
        <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
          {isProject
            ? "Merged view: global + project"
            : "Global settings (applies to all projects)"}
        </span>
      </button>

      {expanded && (
        <div className="effective-config-body">
          {/* Model */}
          <div className="effective-row">
            <span className="effective-label">Model</span>
            <span className="effective-value">
              {effectiveModel
                ? MODEL_LABELS[effectiveModel] || effectiveModel
                : "Default (Sonnet)"}
            </span>
            {isProject && modelSource !== "default" && (
              <SourceBadge source={modelSource} />
            )}
          </div>

          {/* Permissions */}
          <div className="effective-row">
            <span className="effective-label">Permissions</span>
            <span className="effective-value">
              {effectivePermissions
                ? JSON.stringify(effectivePermissions)
                    .replace(/[{}"]/g, "")
                    .slice(0, 80)
                : "Default"}
            </span>
            {isProject && permSource !== "default" && (
              <SourceBadge source={permSource} />
            )}
          </div>

          {/* Ignore patterns */}
          <div className="effective-row">
            <span className="effective-label">Ignore Patterns</span>
            <span className="effective-value">
              {effectiveIgnore
                ? effectiveIgnore.join(", ")
                : "None"}
            </span>
            {isProject && ignoreSource !== "default" && (
              <SourceBadge source={ignoreSource} />
            )}
          </div>

          {/* Agents */}
          <div className="effective-row">
            <span className="effective-label">
              Agents ({mergedAgents.length})
            </span>
            <span className="effective-value">
              {mergedAgents.length === 0
                ? "None"
                : mergedAgents
                    .map(
                      (a) =>
                        `${a.name}${isProject ? ` [${a.source}]` : ""}`
                    )
                    .join(", ")}
            </span>
          </div>

          {/* Skills */}
          <div className="effective-row">
            <span className="effective-label">
              Skills ({mergedSkills.length})
            </span>
            <span className="effective-value">
              {mergedSkills.length === 0
                ? "None"
                : mergedSkills
                    .map(
                      (s) =>
                        `${s.name}${isProject ? ` [${s.source}]` : ""}`
                    )
                    .join(", ")}
            </span>
          </div>

          {/* Hooks */}
          <div className="effective-row">
            <span className="effective-label">
              Hooks ({allHooks.length} events)
            </span>
            <span className="effective-value">
              {allHooks.length === 0
                ? "None"
                : allHooks
                    .map(
                      (h) =>
                        `${h.event}${isProject ? ` [${h.source}]` : ""}`
                    )
                    .join(", ")}
            </span>
          </div>

          {/* MCP Servers */}
          <div className="effective-row">
            <span className="effective-label">
              MCP Servers ({mergedMcp.length})
            </span>
            <span className="effective-value">
              {mergedMcp.length === 0
                ? "None"
                : mergedMcp
                    .map(
                      (s) =>
                        `${s.serverId}${isProject ? ` [${s.source}]` : ""}`
                    )
                    .join(", ")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className={`source-badge ${source === "global" ? "source-inherited" : "source-override"}`}
    >
      {source === "global" ? "from global" : "project override"}
    </span>
  );
}
