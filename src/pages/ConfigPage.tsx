import { useEffect, useState, useCallback } from "react";
import type { Repo, NormalizedConfig } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  repo: Repo | null;
}

export function ConfigPage({ repo }: Props) {
  const [config, setConfig] = useState<NormalizedConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NormalizedConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!repo) return;
    try {
      const result = await api.readClaudeConfig(repo.path);
      setConfig(result);
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  }, [repo]);

  useEffect(() => {
    setEditing(false);
    setDraft(null);
    loadConfig();
  }, [loadConfig]);

  if (!repo) {
    return (
      <div className="page page-empty">
        <p>Select a repository to manage config.</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!draft || !repo) return;
    setSaving(true);
    try {
      await api.writeClaudeConfig(repo.path, draft);
      await loadConfig();
      setEditing(false);
      setDraft(null);
    } catch (e) {
      alert(`Failed to save config: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => {
    setDraft(config ? { ...config } : { model: null, permissions: null, ignorePatterns: null, raw: {} });
    setEditing(true);
  };

  const displayConfig = editing ? draft : config;

  return (
    <div className="page config-page">
      <div className="page-header">
        <h2>Config Studio</h2>
        {!editing && (
          <button className="btn" onClick={startEditing}>
            Edit
          </button>
        )}
      </div>

      {!displayConfig ? (
        <p className="text-muted">Loading config...</p>
      ) : (
        <div className="config-form">
          <div className="form-group">
            <label>Default Model</label>
            <select
              value={displayConfig.model ?? ""}
              disabled={!editing}
              onChange={(e) =>
                setDraft(
                  draft
                    ? { ...draft, model: e.target.value || null }
                    : null
                )
              }
            >
              <option value="">Not set</option>
              <option value="claude-opus-4-6">Claude Opus 4.6</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
            </select>
            <span className="field-tag shareable">shareable</span>
          </div>

          <div className="form-group">
            <label>Ignore Patterns</label>
            <textarea
              rows={4}
              disabled={!editing}
              value={displayConfig.ignorePatterns?.join("\n") ?? ""}
              onChange={(e) =>
                setDraft(
                  draft
                    ? {
                        ...draft,
                        ignorePatterns: e.target.value
                          ? e.target.value.split("\n")
                          : null,
                      }
                    : null
                )
              }
              placeholder="node_modules&#10;.git&#10;dist"
            />
            <span className="field-tag shareable">shareable</span>
          </div>

          <div className="form-group">
            <label>Raw Config (JSON)</label>
            <pre className="raw-config">
              {JSON.stringify(displayConfig.raw, null, 2)}
            </pre>
          </div>

          {editing && (
            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Apply Config"}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setEditing(false);
                  setDraft(null);
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
