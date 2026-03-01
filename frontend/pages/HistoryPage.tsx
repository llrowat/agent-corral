import { useEffect, useState, useCallback } from "react";
import type { Scope } from "@/types";
import type { ConfigSnapshotSummary } from "@/lib/tauri";
import * as api from "@/lib/tauri";
import { useToast } from "@/components/Toast";

interface Props {
  scope: Scope | null;
}

export function HistoryPage({ scope }: Props) {
  const toast = useToast();
  const [snapshots, setSnapshots] = useState<ConfigSnapshotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");

  const basePath =
    scope?.type === "global"
      ? scope.homePath
      : scope?.type === "project"
        ? scope.repo.path
        : null;

  const loadSnapshots = useCallback(async () => {
    if (!basePath) return;
    setLoading(true);
    try {
      const list = await api.listConfigSnapshots(basePath);
      setSnapshots(list);
    } catch {
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const handleCreate = async () => {
    if (!basePath || !label.trim()) return;
    try {
      await api.saveConfigSnapshot(basePath, label.trim());
      toast.success("Snapshot saved");
      setLabel("");
      setShowCreate(false);
      await loadSnapshots();
    } catch (e) {
      toast.error("Failed to save snapshot", String(e));
    }
  };

  const handleRestore = async (snapshotId: string) => {
    if (!basePath) return;
    try {
      await api.restoreConfigSnapshot(basePath, snapshotId);
      toast.success("Config restored from snapshot");
      await loadSnapshots();
    } catch (e) {
      toast.error("Failed to restore snapshot", String(e));
    }
  };

  const handleDelete = async (snapshotId: string) => {
    if (!basePath) return;
    try {
      await api.deleteConfigSnapshot(basePath, snapshotId);
      toast.info("Snapshot deleted");
      await loadSnapshots();
    } catch (e) {
      toast.error("Failed to delete snapshot", String(e));
    }
  };

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to manage config history.</p>
      </div>
    );
  }

  return (
    <div className="page history-page">
      <div className="page-header">
        <h2>Config History</h2>
        <div className="header-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreate(!showCreate)}
          >
            + Save Snapshot
          </button>
        </div>
      </div>

      <p className="page-description">
        Snapshots capture the current state of your settings.json.
        Restore any snapshot to revert config changes.
      </p>

      {showCreate && (
        <div className="history-create" style={{ marginBottom: 20 }}>
          <div className="form-group" style={{ maxWidth: 400 }}>
            <label>Snapshot Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="e.g. before refactoring hooks"
              autoFocus
            />
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCreate}
              disabled={!label.trim()}
            >
              Save
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading snapshots...</p>
      ) : snapshots.length === 0 ? (
        <div className="packs-empty">
          <h3>No Snapshots</h3>
          <p>Save a snapshot to capture the current state of your configuration.</p>
        </div>
      ) : (
        <div className="history-list">
          {snapshots.map((snap) => (
            <div key={snap.snapshotId} className="history-item">
              <div className="history-item-header">
                <h4>{snap.label}</h4>
                <span className="text-muted">
                  {formatTimestamp(snap.timestamp)}
                </span>
              </div>
              <div className="history-item-meta">
                {snap.hasSettings && (
                  <span className="tool-tag">settings.json</span>
                )}
              </div>
              <div className="history-item-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleRestore(snap.snapshotId)}
                >
                  Restore
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDelete(snap.snapshotId)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
