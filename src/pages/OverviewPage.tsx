import { useEffect, useState } from "react";
import type { Repo, RepoStatus, ClaudeDetection, CommandTemplate } from "@/types";
import * as api from "@/lib/tauri";
import { useSessions } from "@/hooks/useSessions";

interface Props {
  repo: Repo | null;
}

export function OverviewPage({ repo }: Props) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [detection, setDetection] = useState<ClaudeDetection | null>(null);
  const [templates, setTemplates] = useState<CommandTemplate[]>([]);
  const { sessions, launchSession } = useSessions();

  useEffect(() => {
    if (!repo) {
      setStatus(null);
      setDetection(null);
      return;
    }
    api.getRepoStatus(repo.path).then(setStatus);
    api.detectClaudeConfig(repo.path).then(setDetection);
  }, [repo]);

  useEffect(() => {
    api.listTemplates().then(setTemplates).catch(() => {});
  }, []);

  if (!repo) {
    return (
      <div className="page page-empty">
        <h2>Welcome to AgentCorral</h2>
        <p>Select a repository to get started, or add one using the repo switcher above.</p>
      </div>
    );
  }

  const recentSessions = sessions
    .filter((s) => s.repoPath === repo.path)
    .slice(0, 5);

  const handleRunTemplate = async (template: CommandTemplate) => {
    // Simple variable substitution for repo-only templates
    let cmd = template.command;
    cmd = cmd.replace("{{repoPath}}", repo.path);
    // For templates requiring agent, prompt user
    if (template.requires.includes("agent")) {
      const agentId = prompt("Enter agent ID:");
      if (!agentId) return;
      cmd = cmd.replace("{{agentId}}", agentId);
    }
    if (template.requires.includes("prompt")) {
      const promptText = prompt("Enter prompt:");
      if (!promptText) return;
      cmd = cmd.replace("{{prompt}}", promptText);
    }
    await launchSession(repo.path, template.name, cmd);
  };

  return (
    <div className="page overview-page">
      <h2>{repo.name}</h2>
      <p className="repo-path-display">{repo.path}</p>

      <section className="overview-section">
        <h3>Repo Status</h3>
        <div className="status-grid">
          <StatusBadge label="Directory exists" ok={status?.exists} />
          <StatusBadge label="Git repo" ok={status?.is_git_repo} />
          <StatusBadge label="Claude config" ok={detection?.hasSettingsJson} />
          <StatusBadge label="CLAUDE.md" ok={detection?.hasClaudeMd} />
          <StatusBadge label="Agents" ok={detection?.hasAgentsDir} />
          <StatusBadge label="Skills" ok={detection?.hasSkillsDir} />
          <StatusBadge label="MCP Servers" ok={detection?.hasMcpJson} />
          <StatusBadge
            label={`Hooks${detection?.hookCount ? ` (${detection.hookCount})` : ""}`}
            ok={detection?.hookCount !== undefined && detection.hookCount > 0}
          />
          <StatusBadge label="Memory" ok={detection?.hasMemoryDir} />
        </div>
      </section>

      <section className="overview-section">
        <h3>Command Templates</h3>
        <div className="templates-grid">
          {templates.map((t) => (
            <button
              key={t.templateId}
              className="template-card"
              onClick={() => handleRunTemplate(t)}
            >
              <span className="template-name">{t.name}</span>
              <span className="template-desc">{t.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="overview-section">
        <h3>Recent Sessions</h3>
        {recentSessions.length === 0 ? (
          <p className="text-muted">No sessions yet for this repo.</p>
        ) : (
          <table className="sessions-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {recentSessions.map((s) => (
                <tr key={s.sessionId}>
                  <td>{s.commandName}</td>
                  <td>
                    <span className={`status-pill status-${s.status}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>{new Date(s.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatusBadge({
  label,
  ok,
}: {
  label: string;
  ok: boolean | undefined;
}) {
  return (
    <div className={`status-badge ${ok ? "ok" : "missing"}`}>
      <span className="status-dot">{ok ? "\u2713" : "\u2717"}</span>
      <span>{label}</span>
    </div>
  );
}
