import { useEffect, useState, useCallback } from "react";
import type { Scope, RepoStatus, ClaudeDetection } from "@/types";
import * as api from "@/lib/tauri";
import { useSessions } from "@/hooks/useSessions";
import { ConfigSummary } from "@/components/ConfigSummary";
import { ScopeBanner } from "@/components/ScopeGuard";

interface Props {
  scope: Scope | null;
}

export function OverviewPage({ scope }: Props) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [detection, setDetection] = useState<ClaudeDetection | null>(null);
  const [worktreeEnabled, setWorktreeEnabled] = useState(false);
  const { sessions, launchSession, refresh } = useSessions();

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;
  const isGlobal = scope?.type === "global";
  const isGitRepo = status?.is_git_repo ?? false;

  const reloadDetection = useCallback(() => {
    if (!basePath) return;
    api.detectClaudeConfig(basePath).then(setDetection);
  }, [basePath]);

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
    reloadDetection();
  }, [basePath, isGlobal, reloadDetection]);

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

  const handleNewSession = async () => {
    if (!basePath || isGlobal) return;
    await launchSession(basePath, "Claude", "claude", worktreeEnabled);
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

      <ScopeBanner scope={scope} />

      {scope && <ConfigSummary scope={scope} key={basePath} />}

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
            <h3>New Session</h3>
          </div>
          <div className="new-session-bar">
            <button
              className="btn btn-primary"
              onClick={handleNewSession}
            >
              New Session
            </button>
            {isGitRepo && (
              <label className="worktree-checkbox-label">
                <input
                  type="checkbox"
                  checked={worktreeEnabled}
                  onChange={(e) => setWorktreeEnabled(e.target.checked)}
                />
                <span>Use worktree</span>
              </label>
            )}
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
