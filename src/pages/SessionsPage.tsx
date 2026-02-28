import { useState } from "react";
import type { Scope, SessionEnvelope } from "@/types";
import { useSessions } from "@/hooks/useSessions";

interface Props {
  scope: Scope | null;
}

export function SessionsPage({ scope }: Props) {
  const { sessions, loading, getLog, launchSession } = useSessions();
  const [selectedSession, setSelectedSession] = useState<SessionEnvelope | null>(null);
  const [logContent, setLogContent] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "running" | "success" | "failed">("all");

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
    if (filter !== "all" && s.status !== filter) return false;
    return true;
  });

  const handleSelectSession = async (session: SessionEnvelope) => {
    setSelectedSession(session);
    try {
      const log = await getLog(session.sessionId, 200);
      setLogContent(log);
    } catch {
      setLogContent("(Failed to load log)");
    }
  };

  const handleRerun = async (session: SessionEnvelope) => {
    await launchSession(session.repoPath, session.commandName, session.command);
  };

  return (
    <div className="page sessions-page">
      <div className="page-header">
        <h2>Sessions</h2>
        <div className="session-filters">
          {(["all", "running", "success", "failed"] as const).map((f) => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
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
                }`}
                onClick={() => handleSelectSession(session)}
              >
                <div className="session-item-header">
                  <span className="session-name">{session.commandName}</span>
                  <span className={`status-pill status-${session.status}`}>
                    {session.status}
                  </span>
                </div>
                <div className="session-item-meta">
                  <span>{new Date(session.startedAt).toLocaleString()}</span>
                  {session.exitCode !== null && (
                    <span>exit: {session.exitCode}</span>
                  )}
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
              <h3>{selectedSession.commandName}</h3>
              <div className="detail-grid">
                <div className="detail-field">
                  <label>Session ID</label>
                  <code>{selectedSession.sessionId}</code>
                </div>
                <div className="detail-field">
                  <label>Command</label>
                  <code>{selectedSession.command}</code>
                </div>
                <div className="detail-field">
                  <label>Repo</label>
                  <code>{selectedSession.repoPath}</code>
                </div>
                <div className="detail-field">
                  <label>Status</label>
                  <span className={`status-pill status-${selectedSession.status}`}>
                    {selectedSession.status}
                  </span>
                </div>
                <div className="detail-field">
                  <label>Started</label>
                  <span>{new Date(selectedSession.startedAt).toLocaleString()}</span>
                </div>
                {selectedSession.endedAt && (
                  <div className="detail-field">
                    <label>Ended</label>
                    <span>
                      {new Date(selectedSession.endedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedSession.exitCode !== null && (
                  <div className="detail-field">
                    <label>Exit Code</label>
                    <code>{selectedSession.exitCode}</code>
                  </div>
                )}
              </div>

              <div className="session-actions">
                <button
                  className="btn"
                  onClick={() => handleRerun(selectedSession)}
                >
                  Re-run
                </button>
              </div>

              <div className="session-log">
                <h4>Output (last 200 lines)</h4>
                <pre className="log-output">{logContent || "(empty)"}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
