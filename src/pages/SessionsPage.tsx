import { useState } from "react";
import type { Scope, SessionEnvelope } from "@/types";
import { useSessions } from "@/hooks/useSessions";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope | null;
}

export function SessionsPage({ scope }: Props) {
  const { sessions, loading, launchSession, refresh } = useSessions();
  const [selectedSession, setSelectedSession] = useState<SessionEnvelope | null>(null);

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

  const handleRerun = async (session: SessionEnvelope) => {
    await launchSession(session.repoPath, session.commandName, session.command);
  };

  const handleDelete = async (session: SessionEnvelope) => {
    try {
      await api.deleteSession(session.sessionId);
      if (selectedSession?.sessionId === session.sessionId) {
        setSelectedSession(null);
      }
      await refresh();
    } catch (e) {
      alert(`Failed to delete session: ${e}`);
    }
  };

  const handleFocus = (session: SessionEnvelope) => {
    if (session.pid) {
      api.focusSession(session.pid);
    }
    setSelectedSession(session);
  };

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
                }`}
                onClick={() => setSelectedSession(session)}
              >
                <div className="session-item-header">
                  <span className="session-name">{session.commandName}</span>
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
              <h3>{selectedSession.commandName}</h3>
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
              </div>

              <div className="session-actions">
                <button
                  className="btn"
                  onClick={() => handleFocus(selectedSession)}
                >
                  Focus Terminal
                </button>
                <button
                  className="btn"
                  onClick={() => handleRerun(selectedSession)}
                >
                  Re-run
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(selectedSession)}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
