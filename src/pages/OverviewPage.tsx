import { useEffect, useState } from "react";
import type { Scope, RepoStatus, ClaudeDetection, CommandTemplate } from "@/types";
import * as api from "@/lib/tauri";
import { useSessions } from "@/hooks/useSessions";

interface Props {
  scope: Scope | null;
}

export function OverviewPage({ scope }: Props) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [detection, setDetection] = useState<ClaudeDetection | null>(null);
  const [templates, setTemplates] = useState<CommandTemplate[]>([]);
  const [worktreeEnabled, setWorktreeEnabled] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const { sessions, launchSession, refresh } = useSessions();

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;
  const isGlobal = scope?.type === "global";
  const isGitRepo = status?.is_git_repo ?? false;

  useEffect(() => {
    if (!basePath) {
      setStatus(null);
      setDetection(null);
      return;
    }
    if (!isGlobal) {
      api.getRepoStatus(basePath).then(setStatus);
    } else {
      setStatus(null);
    }
    api.detectClaudeConfig(basePath).then(setDetection);
  }, [basePath, isGlobal]);

  useEffect(() => {
    if (!isGlobal) {
      api.listTemplates().then(setTemplates).catch(() => {});
    } else {
      setTemplates([]);
    }
  }, [isGlobal]);

  // Load branches when worktree is enabled
  useEffect(() => {
    if (worktreeEnabled && basePath && isGitRepo) {
      api.listBranches(basePath).then((branchList) => {
        setBranches(branchList);
        // Detect current branch (first one that doesn't start with worktree/)
        const main = branchList.find((b) => !b.startsWith("worktree/"));
        if (main) setCurrentBranch(main);
      }).catch(() => setBranches([]));
    }
  }, [worktreeEnabled, basePath, isGitRepo]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <h2>Welcome to AgentCorral</h2>
        <p>Select Global Settings or a repository to get started.</p>
      </div>
    );
  }

  const heading = isGlobal ? "Global Settings" : scope.repo.name;
  const pathDisplay = basePath;

  const recentSessions = isGlobal
    ? []
    : sessions
        .filter((s) => s.repoPath === basePath)
        .slice(0, 5);

  const handleRunTemplate = async (template: CommandTemplate) => {
    if (!basePath || isGlobal) return;
    let cmd = template.command;
    cmd = cmd.replace("{{repoPath}}", basePath);
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
    const useWt = worktreeEnabled || template.useWorktree;
    await launchSession(
      basePath,
      template.name,
      cmd,
      useWt,
      useWt && selectedBranch ? selectedBranch : null
    );
  };

  const handleDeleteSession = async (sessionId: string, hasWorktree: boolean) => {
    if (hasWorktree) {
      if (!confirm("This session has a worktree. Deleting will remove the worktree and its branch. Continue?")) {
        return;
      }
    }
    await api.deleteSession(sessionId);
    await refresh();
  };

  return (
    <div className="page overview-page">
      <h2>{heading}</h2>
      <p className="repo-path-display">{pathDisplay}</p>

      <section className="overview-section">
        <h3>{isGlobal ? "Global Detection" : "Repo Status"}</h3>
        <div className="status-grid">
          {!isGlobal && (
            <>
              <StatusBadge label="Directory exists" ok={status?.exists} />
              <StatusBadge label="Git repo" ok={status?.is_git_repo} />
            </>
          )}
          <StatusBadge label="Claude config" ok={detection?.hasSettingsJson} />
          {!isGlobal && <StatusBadge label="CLAUDE.md" ok={detection?.hasClaudeMd} />}
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

      {!isGlobal && (
        <section className="overview-section">
          <div className="section-header-row">
            <h3>Command Templates</h3>
            {isGitRepo && (
              <div className="worktree-toggle">
                <label className="worktree-checkbox-label">
                  <input
                    type="checkbox"
                    checked={worktreeEnabled}
                    onChange={(e) => setWorktreeEnabled(e.target.checked)}
                  />
                  <span>Use worktree</span>
                </label>
                {worktreeEnabled && branches.length > 0 && (
                  <select
                    className="worktree-branch-select"
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  >
                    <option value="">
                      Current HEAD{currentBranch ? ` (${currentBranch})` : ""}
                    </option>
                    {branches.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
          <div className="templates-grid">
            {templates.map((t) => (
              <button
                key={t.templateId}
                className={`template-card${
                  (worktreeEnabled || t.useWorktree) ? " template-card-worktree" : ""
                }`}
                onClick={() => handleRunTemplate(t)}
              >
                <span className="template-name">
                  {t.name}
                  {t.useWorktree && (
                    <span className="worktree-badge">worktree</span>
                  )}
                </span>
                <span className="template-desc">{t.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!isGlobal && (
        <section className="overview-section">
          <h3>Recent Sessions</h3>
          {recentSessions.length === 0 ? (
            <p className="text-muted">No sessions yet for this repo.</p>
          ) : (
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Command</th>
                  <th>Launched</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((s) => (
                  <tr
                    key={s.sessionId}
                    className="session-row-clickable"
                    onClick={() => {
                      if (s.pid && s.processAlive) api.focusSession(s.pid);
                    }}
                  >
                    <td>
                      {s.commandName}
                      {s.worktreeBranch && (
                        <span className="worktree-badge">{s.worktreeBranch}</span>
                      )}
                      {!s.processAlive && (
                        <span className="session-dead-badge">exited</span>
                      )}
                    </td>
                    <td><code>{s.command}</code></td>
                    <td>{new Date(s.startedAt).toLocaleString()}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(s.sessionId, !!s.worktreePath);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
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
