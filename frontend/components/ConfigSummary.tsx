import { useEffect, useState } from "react";
import type { Scope, NormalizedConfig, Agent, HookEvent, Skill, McpServer } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope;
}

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

export function ConfigSummary({ scope }: Props) {
  const [config, setConfig] = useState<NormalizedConfig | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [hooks, setHooks] = useState<HookEvent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [expanded, setExpanded] = useState(false);

  const basePath =
    scope.type === "global" ? scope.homePath : scope.repo.path;
  const isGlobal = scope.type === "global";

  useEffect(() => {
    api.readClaudeConfig(basePath).then(setConfig).catch(() => setConfig(null));
    api.readAgents(basePath).then(setAgents).catch(() => setAgents([]));
    api.readHooks(basePath).then(setHooks).catch(() => setHooks([]));
    api.readSkills(basePath).then(setSkills).catch(() => setSkills([]));
    api
      .readMcpServers(basePath, isGlobal)
      .then(setMcpServers)
      .catch(() => setMcpServers([]));
  }, [basePath, isGlobal]);

  const modelLabel = config?.model
    ? MODEL_LABELS[config.model] ?? config.model
    : "Not set";

  const hookHandlerCount = hooks.reduce(
    (sum, h) => sum + h.groups.reduce((gs, g) => gs + g.hooks.length, 0),
    0
  );

  const isEmpty =
    agents.length === 0 &&
    hookHandlerCount === 0 &&
    skills.length === 0 &&
    mcpServers.length === 0 &&
    !config?.model;

  const parts: string[] = [];
  parts.push(`Model: ${modelLabel}`);
  if (agents.length > 0)
    parts.push(`${agents.length} agent${agents.length !== 1 ? "s" : ""}`);
  else
    parts.push("0 agents");
  if (hookHandlerCount > 0)
    parts.push(
      `${hookHandlerCount} hook${hookHandlerCount !== 1 ? "s" : ""}`
    );
  else
    parts.push("0 hooks");
  if (skills.length > 0)
    parts.push(`${skills.length} skill${skills.length !== 1 ? "s" : ""}`);
  if (mcpServers.length > 0)
    parts.push(
      `${mcpServers.length} MCP server${mcpServers.length !== 1 ? "s" : ""}`
    );
  if (config?.ignorePatterns && config.ignorePatterns.length > 0)
    parts.push(`${config.ignorePatterns.length} ignore patterns`);

  return (
    <section className={`config-summary ${isEmpty ? "config-summary-empty" : ""}`}>
      <div className="config-summary-bar">
        <span className="config-summary-text">{parts.join("  |  ")}</span>
        {!isEmpty && (
          <button
            className="btn btn-sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide details" : "View details"}
          </button>
        )}
      </div>
      {expanded && !isEmpty && (
        <div className="config-summary-details">
          {config?.model && (
            <div className="config-summary-section">
              <label>Model</label>
              <code>{config.model}</code>
            </div>
          )}
          {agents.length > 0 && (
            <div className="config-summary-section">
              <label>Agents</label>
              <div className="config-summary-tags">
                {agents.map((a) => (
                  <span key={a.agentId} className="tool-tag">
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {hooks.length > 0 && (
            <div className="config-summary-section">
              <label>Hooks</label>
              <div className="config-summary-tags">
                {hooks.map((h) => (
                  <span key={h.event} className="tool-tag">
                    {h.event} ({h.groups.reduce((s, g) => s + g.hooks.length, 0)})
                  </span>
                ))}
              </div>
            </div>
          )}
          {skills.length > 0 && (
            <div className="config-summary-section">
              <label>Skills</label>
              <div className="config-summary-tags">
                {skills.map((s) => (
                  <span key={s.skillId} className="tool-tag">
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mcpServers.length > 0 && (
            <div className="config-summary-section">
              <label>MCP Servers</label>
              <div className="config-summary-tags">
                {mcpServers.map((s) => (
                  <span key={s.serverId} className="tool-tag">
                    {s.serverId} ({s.serverType})
                  </span>
                ))}
              </div>
            </div>
          )}
          {config?.ignorePatterns && config.ignorePatterns.length > 0 && (
            <div className="config-summary-section">
              <label>Ignore Patterns</label>
              <div className="config-summary-tags">
                {config.ignorePatterns.map((p) => (
                  <code key={p} style={{ marginRight: 4 }}>
                    {p}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
