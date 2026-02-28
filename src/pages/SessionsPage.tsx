import { useState, useCallback } from "react";
import type { Scope, SessionEnvelope, WorktreeStatus } from "@/types";
import { useSessions } from "@/hooks/useSessions";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope | null;
}

export function SessionsPage({ scope }: Props) {
  const { sessions, loading, launchSession, refresh } = useSessions();
  const [selectedSession, setSelectedSession] = useState<SessionEnvelope | null>(null);
  const [worktreeStatus, setWorktreeStatus] = useState<WorktreeStatus | null>(null);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [worktreeDiff, setWorktreeDiff] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [branches, setBranches] = useState<string[]>([]);
  const [mergeResult, setMergeResult] = useState<string | null>(null);

  const loadWorktreeInfo = useCallback(async (session: SessionEnvelope) => {
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
      // Auto-fill merge target from the stored base branch
      if (status.baseBranch) {
        setMergeTarget(status.baseBranch);
      }
    } catch (e) {
      setWorktreeStatus(null);
      setWorktreeError(String(e));
      setWorktreeDiff(null);
    }
  }, []);

  const handleSelectSession = useCallback((session: SessionEnvelope) => {
    setSelectedSession(session);
    setMergeResult(null);
    setMergeTarget(""); // Reset so the new session's base branch can auto-fill
    loadWorktreeInfo(session);
  }, [loadWorktreeInfo]);

  const handleRerun = useCallback(async (session: SessionEnvelope) => {
    await launchSession(
      session.repoPath,
      session.commandName,
      session.command,
      !!session.worktreePath,
      session.worktreeBaseBranch // Preserve the original base branch
    );
  }, [launchSession]);

  const handleResume = useCallback(async (session: SessionEnvelope) => {
    try {
      await api.resumeSession(session.sessionId, session.command);
      await refresh();
    } catch (e) {
      alert(`Failed to resume session: ${e}`);
    }
  }, [refresh]);

  const handleOpenFolder = useCallback(async (session: SessionEnvelope) => {
    try {
      await api.openSessionFolder(session.sessionId);
    } catch (e) {
      alert(`Failed to open folder: ${e}`);
    }
  }, []);

  const handleDelete = useCallback(async (session: SessionEnvelope) => {
    if (session.worktreePath) {
      const hasWork = worktreeStatus
        ? worktreeStatus.hasUncommittedChanges || worktreeStatus.commitCount > 0
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
  }, [worktreeStatus, selectedSession, refresh]);

  const handleFocus = useCallback((session: SessionEnvelope) => {
    if (session.pid && session.processAlive) {
      api.focusSession(session.pid);
    }
    handleSelectSession(session);
  }, [handleSelectSession]);

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

  if (scope?.type === "global") {
    return (
      <div className="page page-empty">
        <p>Sessions are project-specific. Switch to a project scope to manage sessions.</p>
      </div>
    );
  }

  const repoPath = scope?.type === "project" ? scope.repo.path : null;

  const filteredSessions = sessions.filter((s) => {
    if (repoPath && s.repoPath !== repoPath) return false;
    return true;
  });

  return (
    <div className="page sessions-page">
      <div className="page-header">
        <h2>Sessions</h2>
      </div>

      {loading && <p className="text-muted">Loading sessions...</p>}

      <div className="split-layout">
        <div className="panel-left">
          <div className="sessions-list">
            {filteredSessions.map((session) => (
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
                    {session.processAlive ? (
                      <span className="session-alive-badge">running</span>
                    ) : (
                      <span className="session-dead-badge">exited</span>
                    )}
                  </span>
                </div>
                <div className="session-item-meta">
                  <span>{new Date(session.startedAt).toLocaleString()}</span>
                  <span className="text-muted">{session.command}</span>
                </div>
              </div>
            ))}
            {filteredSessions.length === 0 && (
              <div className="text-muted" style={{ padding: "16px" }}>
                {repoPath
                  ? "No sessions for this repo."
                  : "No sessions yet. Launch a command to get started."}
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
                {!selectedSession.processAlive && (
                  <span className="session-dead-badge" style={{ marginLeft: "8px" }}>
                    Process exited
                  </span>
                )}
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
                  <span>{new Date(selectedSession.startedAt).toLocaleString()}</span>
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

              {selectedSession.worktreePath && !worktreeStatus && worktreeError && (
                <div className="worktree-section">
                  <h4>Worktree Status</h4>
                  <div className="worktree-merge-result worktree-merge-error">
                    Worktree unavailable: {worktreeError}
                  </div>
                  <p className="text-muted" style={{ marginTop: "8px", fontSize: "12px" }}>
                    The worktree directory may have been removed. The branch
                    ({selectedSession.worktreeBranch}) may still exist in the repo.
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
