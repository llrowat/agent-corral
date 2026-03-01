import { useState, useCallback, useMemo } from "react";
import type {
  Repo,
  Scope,
  SessionEnvelope,
  SessionActivity,
  WorktreeStatus,
} from "@/types";
import { useSessions } from "@/hooks/useSessions";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope | null;
  repos: Repo[];
}

/** Extract a short repo name from a full path (last path segment). */
function repoNameFromPath(path: string): string {
  const segments = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

/** Human-readable label for an activity state. */
function activityLabel(activity: SessionActivity | undefined): string {
  switch (activity) {
    case "active":
      return "working";
    case "idle":
      return "waiting";
    case "exited":
      return "exited";
    default:
      return "unknown";
  }
}

/** CSS class for an activity badge. */
function activityBadgeClass(activity: SessionActivity | undefined): string {
  switch (activity) {
    case "active":
      return "activity-badge activity-active";
    case "idle":
      return "activity-badge activity-idle";
    case "exited":
      return "activity-badge activity-exited";
    default:
      return "activity-badge activity-exited";
  }
}

/** Group sessions by repo path, preserving sort order within each group. */
function groupByRepo(
  sessions: SessionEnvelope[]
): { repoPath: string; repoName: string; sessions: SessionEnvelope[] }[] {
  const map = new Map<
    string,
    { repoPath: string; repoName: string; sessions: SessionEnvelope[] }
  >();

  for (const s of sessions) {
    let group = map.get(s.repoPath);
    if (!group) {
      group = {
        repoPath: s.repoPath,
        repoName: repoNameFromPath(s.repoPath),
        sessions: [],
      };
      map.set(s.repoPath, group);
    }
    group.sessions.push(s);
  }

  // Sort groups: repos with running sessions first, then alphabetically
  return Array.from(map.values()).sort((a, b) => {
    const aHasAlive = a.sessions.some((s) => s.processAlive);
    const bHasAlive = b.sessions.some((s) => s.processAlive);
    if (aHasAlive !== bHasAlive) return aHasAlive ? -1 : 1;
    return a.repoName.localeCompare(b.repoName);
  });
}

export function SessionsPage({ scope, repos }: Props) {
  const { sessions, activities, diffStats, loading, launchSession, refresh } =
    useSessions();
  const [selectedSession, setSelectedSession] =
    useState<SessionEnvelope | null>(null);
  const [worktreeStatus, setWorktreeStatus] =
    useState<WorktreeStatus | null>(null);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [worktreeDiff, setWorktreeDiff] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [branches, setBranches] = useState<string[]>([]);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "idle" | "exited"
  >("all");
  const [useWorktree, setUseWorktree] = useState(false);

  const loadWorktreeInfo = useCallback(
    async (session: SessionEnvelope) => {
      if (!session.worktreePath) {
        setWorktreeStatus(null);
        setWorktreeError(null);
        setWorktreeDiff(null);
        setBranches([]);
        return;
      }
      try {
        const [status, diff, branchList] = await Promise.all([
          api.getWorktreeStatus(session.sessionId),
          api.getWorktreeDiff(session.sessionId),
          api.listBranches(session.repoPath),
        ]);
        setWorktreeStatus(status);
        setWorktreeError(null);
        setWorktreeDiff(diff);
        setBranches(branchList.filter((b) => b !== session.worktreeBranch));
        if (status.baseBranch) {
          setMergeTarget(status.baseBranch);
        }
      } catch (e) {
        setWorktreeStatus(null);
        setWorktreeError(String(e));
        setWorktreeDiff(null);
      }
    },
    []
  );

  const handleSelectSession = useCallback(
    (session: SessionEnvelope) => {
      setSelectedSession(session);
      setMergeResult(null);
      setMergeTarget("");
      loadWorktreeInfo(session);
    },
    [loadWorktreeInfo]
  );

  const handleRerun = useCallback(
    async (session: SessionEnvelope) => {
      await launchSession(
        session.repoPath,
        session.commandName,
        session.command,
        !!session.worktreePath,
        session.worktreeBaseBranch
      );
    },
    [launchSession]
  );

  const handleResume = useCallback(
    async (session: SessionEnvelope) => {
      try {
        await api.resumeSession(session.sessionId, session.command);
        await refresh();
      } catch (e) {
        alert(`Failed to resume session: ${e}`);
      }
    },
    [refresh]
  );

  const handleOpenFolder = useCallback(
    async (session: SessionEnvelope) => {
      try {
        await api.openSessionFolder(session.sessionId);
      } catch (e) {
        alert(`Failed to open folder: ${e}`);
      }
    },
    []
  );

  const handleDelete = useCallback(
    async (session: SessionEnvelope) => {
      if (session.worktreePath) {
        const hasWork = worktreeStatus
          ? worktreeStatus.hasUncommittedChanges ||
            worktreeStatus.commitCount > 0
          : false;
        const msg = hasWork
          ? "This session has a worktree with unmerged work. Deleting will remove the worktree and discard all changes. Continue?"
          : "This will remove the session's worktree and delete the branch. Continue?";
        if (!confirm(msg)) return;
      }
      try {
        await api.deleteSession(session.sessionId);
        if (selectedSession?.sessionId === session.sessionId) {
          setSelectedSession(null);
          setWorktreeStatus(null);
          setWorktreeError(null);
          setWorktreeDiff(null);
        }
        await refresh();
      } catch (e) {
        alert(`Failed to delete session: ${e}`);
      }
    },
    [worktreeStatus, selectedSession, refresh]
  );

  const handleFocus = useCallback(
    (session: SessionEnvelope) => {
      if (session.pid && session.processAlive) {
        api.focusSession(session.pid);
      }
      handleSelectSession(session);
    },
    [handleSelectSession]
  );

  const handleMerge = useCallback(async () => {
    if (!selectedSession || !mergeTarget) return;
    try {
      const result = await api.mergeWorktreeBranch(
        selectedSession.sessionId,
        mergeTarget
      );
      setMergeResult(result);
      loadWorktreeInfo(selectedSession);
    } catch (e) {
      setMergeResult(`Error: ${e}`);
    }
  }, [selectedSession, mergeTarget, loadWorktreeInfo]);

  const toggleRepoCollapsed = useCallback((repoPath: string) => {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoPath)) {
        next.delete(repoPath);
      } else {
        next.add(repoPath);
      }
      return next;
    });
  }, []);

  // Determine if we're in single-repo mode (project scope) or multi-repo mode
  const repoPath = scope?.type === "project" ? scope.repo.path : null;
  const isMultiRepo = !repoPath;

  // Filter sessions by repo scope
  const scopedSessions = useMemo(() => {
    let filtered = sessions;
    if (repoPath) {
      filtered = filtered.filter((s) => s.repoPath === repoPath);
    }
    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((s) => {
        const activity = activities[s.sessionId];
        if (statusFilter === "active") return activity === "active";
        if (statusFilter === "idle") return activity === "idle";
        if (statusFilter === "exited")
          return activity === "exited" || !s.processAlive;
        return true;
      });
    }
    return filtered;
  }, [sessions, repoPath, statusFilter, activities]);

  // Group by repo for multi-repo view
  const repoGroups = useMemo(
    () => groupByRepo(scopedSessions),
    [scopedSessions]
  );

  // Counts for filter pills
  const counts = useMemo(() => {
    const base = repoPath
      ? sessions.filter((s) => s.repoPath === repoPath)
      : sessions;
    let active = 0;
    let idle = 0;
    let exited = 0;
    for (const s of base) {
      const a = activities[s.sessionId];
      if (a === "active") active++;
      else if (a === "idle") idle++;
      else exited++;
    }
    return { all: base.length, active, idle, exited };
  }, [sessions, repoPath, activities]);

  const handleNewSession = async () => {
    const target = repoPath || (repos.length > 0 ? repos[0].path : null);
    if (!target) return;
    await launchSession(target, "Claude", "claude", useWorktree);
  };

  // Render a single session list item
  const renderSessionItem = (session: SessionEnvelope) => {
    const activity = activities[session.sessionId];
    const stats = diffStats[session.sessionId];
    return (
      <div
        key={session.sessionId}
        className={`session-item ${
          selectedSession?.sessionId === session.sessionId ? "active" : ""
        }${!session.processAlive ? " session-item-dead" : ""}`}
        onClick={() => handleSelectSession(session)}
      >
        <div className="session-item-header">
          <span className="session-name">{session.commandName}</span>
          <span className="session-badges">
            {session.worktreeBranch && (
              <span className="worktree-badge">{session.worktreeBranch}</span>
            )}
            {stats && (stats.insertions > 0 || stats.deletions > 0) && (
              <span className="diff-stats">
                <span className="diff-plus">+{stats.insertions}</span>
                <span className="diff-minus">-{stats.deletions}</span>
              </span>
            )}
            <span className={activityBadgeClass(activity)}>
              {activityLabel(activity)}
            </span>
          </span>
        </div>
        <div className="session-item-meta">
          <span>{new Date(session.startedAt).toLocaleString()}</span>
          <span className="text-muted">{session.command}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="page sessions-page">
      <div className="page-header">
        <h2>Sessions</h2>
        <div className="session-filters">
          <button
            className={`btn btn-sm ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            All ({counts.all})
          </button>
          <button
            className={`btn btn-sm ${statusFilter === "active" ? "active" : ""}`}
            onClick={() => setStatusFilter("active")}
          >
            Working ({counts.active})
          </button>
          <button
            className={`btn btn-sm ${statusFilter === "idle" ? "active" : ""}`}
            onClick={() => setStatusFilter("idle")}
          >
            Waiting ({counts.idle})
          </button>
          <button
            className={`btn btn-sm ${statusFilter === "exited" ? "active" : ""}`}
            onClick={() => setStatusFilter("exited")}
          >
            Exited ({counts.exited})
          </button>
        </div>
      </div>

      <div className="new-session-bar">
        <button
          className="btn btn-primary"
          onClick={handleNewSession}
          disabled={!repoPath && repos.length === 0}
        >
          New Session
        </button>
        <label className="worktree-checkbox-label">
          <input
            type="checkbox"
            checked={useWorktree}
            onChange={(e) => setUseWorktree(e.target.checked)}
          />
          <span>Use worktree</span>
        </label>
      </div>

      {loading && sessions.length === 0 && (
        <p className="text-muted">Loading sessions...</p>
      )}

      <div className="split-layout">
        <div className="panel-left">
          <div className="sessions-list">
            {isMultiRepo
              ? repoGroups.map((group) => {
                  const isCollapsed = collapsedRepos.has(group.repoPath);
                  const aliveCount = group.sessions.filter(
                    (s) => s.processAlive
                  ).length;
                  return (
                    <div key={group.repoPath} className="repo-group">
                      <button
                        className="repo-group-header"
                        onClick={() => toggleRepoCollapsed(group.repoPath)}
                      >
                        <span className="repo-group-caret">
                          {isCollapsed ? "\u25B6" : "\u25BC"}
                        </span>
                        <span className="repo-group-name">
                          {group.repoName}
                        </span>
                        <span className="repo-group-counts">
                          {aliveCount > 0 && (
                            <span className="repo-group-alive-count">
                              {aliveCount} running
                            </span>
                          )}
                          <span className="repo-group-total-count">
                            {group.sessions.length}
                          </span>
                        </span>
                      </button>
                      {!isCollapsed &&
                        group.sessions.map((s) => renderSessionItem(s))}
                    </div>
                  );
                })
              : scopedSessions.map((s) => renderSessionItem(s))}
            {scopedSessions.length === 0 && (
              <div className="text-muted" style={{ padding: "16px" }}>
                {statusFilter !== "all"
                  ? `No ${statusFilter} sessions.`
                  : repoPath
                    ? "No sessions for this repo. Click \"New Session\" to start one."
                    : "No sessions yet. Click \"New Session\" to get started."}
              </div>
            )}
          </div>
        </div>

        <div className="panel-right">
          {!selectedSession ? (
            <div className="panel-empty">
              <p>Select a session to view details.</p>
            </div>
          ) : (
            <div className="session-detail">
              <h3>
                {selectedSession.commandName}
                <span
                  className={activityBadgeClass(
                    activities[selectedSession.sessionId]
                  )}
                  style={{ marginLeft: "8px" }}
                >
                  {activityLabel(activities[selectedSession.sessionId])}
                </span>
              </h3>
              <div className="detail-grid">
                <div className="detail-field">
                  <label>Command</label>
                  <code>{selectedSession.command}</code>
                </div>
                <div className="detail-field">
                  <label>Repo</label>
                  <code>{selectedSession.repoPath}</code>
                </div>
                <div className="detail-field">
                  <label>Launched</label>
                  <span>
                    {new Date(selectedSession.startedAt).toLocaleString()}
                  </span>
                </div>
                {selectedSession.worktreePath && (
                  <div className="detail-field">
                    <label>Worktree</label>
                    <code>{selectedSession.worktreePath}</code>
                  </div>
                )}
                {selectedSession.worktreeBaseBranch && (
                  <div className="detail-field">
                    <label>Base branch</label>
                    <code>{selectedSession.worktreeBaseBranch}</code>
                  </div>
                )}
              </div>

              <div className="session-actions">
                {selectedSession.processAlive && (
                  <button
                    className="btn"
                    onClick={() => handleFocus(selectedSession)}
                  >
                    Focus Terminal
                  </button>
                )}
                {selectedSession.worktreePath ? (
                  <>
                    {!selectedSession.processAlive && (
                      <button
                        className="btn"
                        onClick={() => handleResume(selectedSession)}
                      >
                        Resume
                      </button>
                    )}
                    <button
                      className="btn"
                      onClick={() => handleOpenFolder(selectedSession)}
                    >
                      Open Folder
                    </button>
                  </>
                ) : (
                  <button
                    className="btn"
                    onClick={() => handleRerun(selectedSession)}
                  >
                    Re-run
                  </button>
                )}
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(selectedSession)}
                >
                  Delete
                </button>
              </div>

              {selectedSession.worktreePath && worktreeStatus && (
                <div className="worktree-section">
                  <h4>Worktree Status</h4>
                  <div className="worktree-status-grid">
                    <div className="worktree-status-item">
                      <label>Branch</label>
                      <span className="worktree-branch-name">
                        {worktreeStatus.branch}
                      </span>
                    </div>
                    {worktreeStatus.baseBranch && (
                      <div className="worktree-status-item">
                        <label>Base</label>
                        <span>{worktreeStatus.baseBranch}</span>
                      </div>
                    )}
                    <div className="worktree-status-item">
                      <label>Commits</label>
                      <span>{worktreeStatus.commitCount} ahead</span>
                    </div>
                    {(worktreeStatus.insertions > 0 || worktreeStatus.deletions > 0) && (
                      <div className="worktree-status-item">
                        <label>Lines changed</label>
                        <span className="diff-stats">
                          <span className="diff-plus">+{worktreeStatus.insertions}</span>
                          <span className="diff-minus">-{worktreeStatus.deletions}</span>
                        </span>
                      </div>
                    )}
                    <div className="worktree-status-item">
                      <label>Working tree</label>
                      <span
                        className={
                          worktreeStatus.hasUncommittedChanges
                            ? "worktree-dirty"
                            : "worktree-clean"
                        }
                      >
                        {worktreeStatus.hasUncommittedChanges
                          ? "Has uncommitted changes"
                          : "Clean"}
                      </span>
                    </div>
                    {worktreeStatus.latestCommitSummary && (
                      <div className="worktree-status-item worktree-status-wide">
                        <label>Latest commit</label>
                        <span>{worktreeStatus.latestCommitSummary}</span>
                      </div>
                    )}
                  </div>

                  {worktreeDiff && worktreeDiff.trim() && (
                    <div className="worktree-diff">
                      <h4>Changes</h4>
                      <pre className="log-output">{worktreeDiff}</pre>
                    </div>
                  )}

                  <div className="worktree-merge">
                    <h4>Merge Branch</h4>
                    <div className="worktree-merge-controls">
                      <span className="text-muted">Merge into:</span>
                      <select
                        value={mergeTarget}
                        onChange={(e) => setMergeTarget(e.target.value)}
                      >
                        <option value="">Select target branch...</option>
                        {branches.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!mergeTarget}
                        onClick={handleMerge}
                      >
                        Merge
                      </button>
                    </div>
                    {mergeResult && (
                      <div
                        className={`worktree-merge-result ${
                          mergeResult.startsWith("Error")
                            ? "worktree-merge-error"
                            : "worktree-merge-success"
                        }`}
                      >
                        {mergeResult}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: "12px" }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => loadWorktreeInfo(selectedSession)}
                    >
                      Refresh Status
                    </button>
                  </div>
                </div>
              )}

              {selectedSession.worktreePath &&
                !worktreeStatus &&
                worktreeError && (
                  <div className="worktree-section">
                    <h4>Worktree Status</h4>
                    <div className="worktree-merge-result worktree-merge-error">
                      Worktree unavailable: {worktreeError}
                    </div>
                    <p
                      className="text-muted"
                      style={{ marginTop: "8px", fontSize: "12px" }}
                    >
                      The worktree directory may have been removed. The branch (
                      {selectedSession.worktreeBranch}) may still exist in the
                      repo.
                    </p>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
