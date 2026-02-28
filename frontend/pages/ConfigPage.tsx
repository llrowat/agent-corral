import { useEffect, useState, useCallback } from "react";
import type { Scope, NormalizedConfig } from "@/types";
import * as api from "@/lib/tauri";
import { ScopeBanner } from "@/components/ScopeGuard";
import { DocsLink } from "@/components/DocsLink";

interface Props {
  scope: Scope | null;
}

const DEFAULT_CONFIG: NormalizedConfig = {
  model: "claude-sonnet-4-6",
  permissions: null,
  ignorePatterns: ["node_modules", ".git", "dist", ".env"],
  raw: {},
};

export function ConfigPage({ scope }: Props) {
  const [config, setConfig] = useState<NormalizedConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NormalizedConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;

  const loadConfig = useCallback(async () => {
    if (!basePath) return;
    try {
      const result = await api.readClaudeConfig(basePath);
      setConfig(result);
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  }, [basePath]);

  useEffect(() => {
    setEditing(false);
    setDraft(null);
    loadConfig();
  }, [loadConfig]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to manage config.</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!draft || !basePath) return;
    setSaving(true);
    try {
      await api.writeClaudeConfig(basePath, draft);
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

  const handleInitWithDefaults = async () => {
    if (!basePath) return;
    setSaving(true);
    try {
      await api.writeClaudeConfig(basePath, DEFAULT_CONFIG);
      await loadConfig();
    } catch (e) {
      console.error("Failed to initialize config:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page config-page">
      {scope && <ScopeBanner scope={scope} />}
      <div className="page-header">
        <h2>Config Studio <DocsLink page="config" /></h2>
        {!editing && config && (
          <button className="btn" onClick={startEditing}>
            Edit
          </button>
        )}
      </div>
      <p className="page-description">Project and global settings for Claude Code, including the default model, permission mode, and file ignore patterns.</p>

      {!displayConfig ? (
        <div className="config-init-card">
          <h3>No config found</h3>
          <p className="text-muted" style={{ marginBottom: 16 }}>
            Create a <code>settings.json</code> with sensible defaults to get
            started quickly.
          </p>
          <div className="config-init-defaults">
            <div className="config-init-preview">
              <div><strong>Model:</strong> Claude Sonnet 4.6</div>
              <div><strong>Ignore:</strong> node_modules, .git, dist, .env</div>
            </div>
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleInitWithDefaults}
              disabled={saving}
            >
              {saving ? "Creating..." : "Initialize with Defaults"}
            </button>
            <button className="btn" onClick={startEditing}>
              Customize First
            </button>
          </div>
        </div>
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
