import { useEffect, useState, useCallback } from "react";
import type { Scope, Agent, Skill, McpServer, HookEvent } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope | null;
}

interface HealthIssue {
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
  fix?: string;
}

export function ConfigHealth({ scope }: Props) {
  const [issues, setIssues] = useState<HealthIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const basePath =
    scope?.type === "global"
      ? scope.homePath
      : scope?.type === "project"
        ? scope.repo.path
        : null;
  const isGlobal = scope?.type === "global";

  const runCheck = useCallback(async () => {
    if (!basePath) return;
    setLoading(true);
    const found: HealthIssue[] = [];

    try {
      const [detection, agents, hooks, skills, mcpServers, config] = await Promise.all([
        api.detectClaudeConfig(basePath),
        api.readAgents(basePath).catch(() => [] as Agent[]),
        api.readHooks(basePath).catch(() => [] as HookEvent[]),
        api.readSkills(basePath).catch(() => [] as Skill[]),
        api.readMcpServers(basePath, isGlobal).catch(() => [] as McpServer[]),
        api.readClaudeConfig(basePath).catch(() => null),
      ]);

      // Missing CLAUDE.md
      if (!detection.hasClaudeMd) {
        found.push({
          severity: "warning",
          category: "CLAUDE.md",
          message: "No CLAUDE.md found",
          fix: "Create a CLAUDE.md file to give Claude project-specific instructions",
        });
      }

      // No model configured
      if (!config?.model) {
        found.push({
          severity: "info",
          category: "Config",
          message: "No default model configured",
          fix: "Set a model in Config Studio to avoid using the default",
        });
      }

      // No ignore patterns
      if (!config?.ignorePatterns || config.ignorePatterns.length === 0) {
        found.push({
          severity: "warning",
          category: "Config",
          message: "No ignore patterns configured",
          fix: "Add ignore patterns (node_modules, dist, .env) to keep Claude focused on source code",
        });
      }

      // Agents with empty descriptions
      for (const agent of agents) {
        if (!agent.description || agent.description.trim().length < 5) {
          found.push({
            severity: "info",
            category: "Agent",
            message: `Agent "${agent.name}" has no meaningful description`,
            fix: "Add a description to help Claude understand when to use this agent",
          });
        }
        if (!agent.systemPrompt || agent.systemPrompt.trim().length < 20) {
          found.push({
            severity: "warning",
            category: "Agent",
            message: `Agent "${agent.name}" has a very short system prompt`,
            fix: "A more detailed system prompt will produce better results",
          });
        }
      }

      // Hooks without timeouts
      for (const hookEvent of hooks) {
        for (const group of hookEvent.groups) {
          for (const handler of group.hooks) {
            if (handler.hookType === "command" && !handler.timeout) {
              found.push({
                severity: "info",
                category: "Hook",
                message: `Hook "${hookEvent.event}" command handler has no timeout`,
                fix: "Set a timeout to prevent hanging commands from blocking Claude",
              });
            }
          }
        }
      }

      // MCP servers with placeholder env vars
      for (const server of mcpServers) {
        if (server.env) {
          const envObj =
            typeof server.env === "object" ? server.env : {};
          for (const [key, value] of Object.entries(envObj as Record<string, string>)) {
            if (
              typeof value === "string" &&
              (value.includes("<your-") || value.includes("YOUR_") || value === "")
            ) {
              found.push({
                severity: "error",
                category: "MCP",
                message: `MCP "${server.serverId}" has placeholder env var: ${key}`,
                fix: `Replace the placeholder value for ${key} with your actual credential`,
              });
            }
          }
        }
      }

      // Skills with empty content
      for (const skill of skills) {
        if (!skill.content || skill.content.trim().length < 10) {
          found.push({
            severity: "warning",
            category: "Skill",
            message: `Skill "${skill.name}" has very little content`,
            fix: "Add detailed instructions for better skill behavior",
          });
        }
      }
    } catch {
      // Ignore errors during health check
    }

    setIssues(found);
    setLoading(false);
  }, [basePath, isGlobal]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  if (!scope || loading) return null;

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  const score = Math.max(
    0,
    100 - errorCount * 20 - warnCount * 10 - infoCount * 3
  );

  const scoreColor =
    score >= 80 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="config-health">
      <button
        className="config-health-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`toggle-arrow ${expanded ? "open" : ""}`}>
          &#9654;
        </span>
        <h3>Config Health</h3>
        <span className="health-score" style={{ color: scoreColor }}>
          {score}/100
        </span>
        {issues.length > 0 && (
          <span className="health-counts">
            {errorCount > 0 && (
              <span className="health-count-error">{errorCount} error{errorCount !== 1 ? "s" : ""}</span>
            )}
            {warnCount > 0 && (
              <span className="health-count-warning">{warnCount} warning{warnCount !== 1 ? "s" : ""}</span>
            )}
            {infoCount > 0 && (
              <span className="health-count-info">{infoCount} suggestion{infoCount !== 1 ? "s" : ""}</span>
            )}
          </span>
        )}
        {issues.length === 0 && (
          <span style={{ color: "var(--success)", marginLeft: 8 }}>All good!</span>
        )}
      </button>

      {expanded && issues.length > 0 && (
        <div className="health-issues">
          {issues.map((issue, i) => (
            <div key={i} className={`health-issue health-issue-${issue.severity}`}>
              <span className="health-issue-icon">
                {issue.severity === "error"
                  ? "\u2717"
                  : issue.severity === "warning"
                    ? "\u26A0"
                    : "\u2139"}
              </span>
              <div className="health-issue-body">
                <span className="health-issue-category">{issue.category}</span>
                <span className="health-issue-message">{issue.message}</span>
                {issue.fix && (
                  <span className="health-issue-fix">{issue.fix}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
