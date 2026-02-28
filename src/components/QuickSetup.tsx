import { useState } from "react";
import type { ClaudeDetection, NormalizedConfig } from "@/types";
import * as api from "@/lib/tauri";
import { STARTER_TEMPLATES, type StarterTemplate } from "@/lib/presets";

interface Props {
  basePath: string;
  detection: ClaudeDetection;
  onApplied: () => void;
  onNavigate: (page: string) => void;
}

export function QuickSetup({
  basePath,
  detection,
  onApplied,
  onNavigate,
}: Props) {
  const [applying, setApplying] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);

  const needsSetup =
    !detection.hasSettingsJson &&
    !detection.hasAgentsDir &&
    !detection.hasSkillsDir &&
    !detection.hasMcpJson &&
    detection.hookCount === 0;

  const handleApplyTemplate = async (template: StarterTemplate) => {
    setApplying(true);
    try {
      await api.writeClaudeConfig(basePath, template.config);
      for (const agent of template.agents) {
        await api.writeAgent(basePath, agent);
      }
      if (template.hooks.length > 0) {
        await api.writeHooks(basePath, template.hooks);
      }
      setAppliedTemplate(template.id);
      onApplied();
    } catch (e) {
      console.error("Failed to apply template:", e);
    } finally {
      setApplying(false);
    }
  };

  const handleInitConfig = async () => {
    setApplying(true);
    try {
      const config: NormalizedConfig = {
        model: "claude-sonnet-4-6",
        permissions: null,
        ignorePatterns: ["node_modules", ".git", "dist", ".env"],
        raw: {},
      };
      await api.writeClaudeConfig(basePath, config);
      onApplied();
    } catch (e) {
      console.error("Failed to init config:", e);
    } finally {
      setApplying(false);
    }
  };

  if (appliedTemplate) {
    const t = STARTER_TEMPLATES.find((s) => s.id === appliedTemplate);
    return (
      <section className="quick-setup">
        <div className="quick-setup-success">
          <span className="quick-setup-check">&#10003;</span>
          <div>
            <strong>{t?.label ?? "Template"} applied</strong>
            <p className="text-muted">
              Config, agents, and hooks have been created. Explore the tabs to
              customize further.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (needsSetup) {
    return (
      <section className="quick-setup">
        <h3>Get Started</h3>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          This project has no Claude Code config yet. Pick a starter template to
          set everything up in one click, or configure each piece manually.
        </p>
        <div className="starter-templates-grid">
          {STARTER_TEMPLATES.map((template) => (
            <button
              key={template.id}
              className="starter-template-card"
              onClick={() => handleApplyTemplate(template)}
              disabled={applying}
            >
              <span className="starter-template-label">{template.label}</span>
              <span className="starter-template-desc">
                {template.description}
              </span>
            </button>
          ))}
        </div>
        <div className="quick-setup-divider">
          <span>or set up manually</span>
        </div>
        <div className="quick-setup-steps">
          <QuickSetupStep
            done={detection.hasSettingsJson}
            label="Initialize config"
            action={
              !detection.hasSettingsJson ? (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleInitConfig}
                  disabled={applying}
                >
                  Init with Defaults
                </button>
              ) : null
            }
          />
          <QuickSetupStep
            done={detection.hasAgentsDir}
            label="Create your first agent"
            action={
              !detection.hasAgentsDir ? (
                <button
                  className="btn btn-sm"
                  onClick={() => onNavigate("/agents")}
                >
                  Go to Agents
                </button>
              ) : null
            }
          />
          <QuickSetupStep
            done={detection.hookCount > 0}
            label="Add a hook"
            action={
              detection.hookCount === 0 ? (
                <button
                  className="btn btn-sm"
                  onClick={() => onNavigate("/hooks")}
                >
                  Go to Hooks
                </button>
              ) : null
            }
          />
          <QuickSetupStep
            done={detection.hasMcpJson}
            label="Set up an MCP server"
            action={
              !detection.hasMcpJson ? (
                <button
                  className="btn btn-sm"
                  onClick={() => onNavigate("/mcp")}
                >
                  Go to MCP
                </button>
              ) : null
            }
          />
        </div>
      </section>
    );
  }

  // Partial setup: show remaining steps
  const remaining: { done: boolean; label: string; page: string }[] = [
    { done: detection.hasSettingsJson, label: "Config", page: "/config" },
    { done: detection.hasAgentsDir, label: "Agents", page: "/agents" },
    { done: detection.hookCount > 0, label: "Hooks", page: "/hooks" },
    { done: detection.hasMcpJson, label: "MCP Servers", page: "/mcp" },
    { done: detection.hasSkillsDir, label: "Skills", page: "/skills" },
  ];

  const incomplete = remaining.filter((r) => !r.done);
  if (incomplete.length === 0) return null;

  return (
    <section className="quick-setup quick-setup-compact">
      <h3>Setup Progress</h3>
      <div className="quick-setup-progress-bar">
        <div
          className="quick-setup-progress-fill"
          style={{
            width: `${((remaining.length - incomplete.length) / remaining.length) * 100}%`,
          }}
        />
      </div>
      <p className="text-muted" style={{ marginBottom: 8 }}>
        {remaining.length - incomplete.length} of {remaining.length} configured
      </p>
      <div className="quick-setup-remaining">
        {incomplete.map((item) => (
          <button
            key={item.page}
            className="btn btn-sm"
            onClick={() => onNavigate(item.page)}
          >
            Set up {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function QuickSetupStep({
  done,
  label,
  action,
}: {
  done: boolean;
  label: string;
  action: React.ReactNode;
}) {
  return (
    <div className={`quick-setup-step ${done ? "done" : ""}`}>
      <span className="quick-setup-step-icon">
        {done ? "\u2713" : "\u25CB"}
      </span>
      <span className="quick-setup-step-label">{label}</span>
      {!done && action && (
        <span className="quick-setup-step-action">{action}</span>
      )}
    </div>
  );
}
