import { useEffect, useState, useCallback } from "react";
import type { Scope, McpServer } from "@/types";
import * as api from "@/lib/tauri";
import { CreateWithAiModal } from "@/components/CreateWithAiModal";
import { PresetPicker } from "@/components/PresetPicker";
import { MCP_PRESETS, type McpPreset } from "@/lib/presets";
import { ScopeBanner, McpFileIndicator } from "@/components/ScopeGuard";
import { DocsLink } from "@/components/DocsLink";
import {
  validateServerId,
  FieldError,
  type ValidationError,
} from "@/components/InlineValidation";

interface Props {
  scope: Scope | null;
  homePath: string | null;
}

function newServer(): McpServer {
  return {
    serverId: "",
    serverType: "stdio",
    command: "",
    args: [],
    url: null,
    env: null,
    headers: null,
  };
}

type View = "list" | "edit";

export function McpPage({ scope, homePath }: Props) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [globalServers, setGlobalServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [serverIdError, setServerIdError] = useState<ValidationError | null>(
    null
  );

  // Env/headers editor state
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>(
    []
  );
  const [headerPairs, setHeaderPairs] = useState<
    { key: string; value: string }[]
  >([]);

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;
  const isGlobal = scope?.type === "global";
  const isProjectScope = scope?.type === "project";

  const loadServers = useCallback(async () => {
    if (!basePath) return;
    try {
      setLoading(true);
      const result = await api.readMcpServers(basePath, isGlobal);
      setServers(result);
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [basePath, isGlobal]);

  const loadGlobalServers = useCallback(async () => {
    if (!isProjectScope || !homePath) {
      setGlobalServers([]);
      return;
    }
    try {
      const result = await api.readMcpServers(homePath, true);
      setGlobalServers(result);
    } catch {
      setGlobalServers([]);
    }
  }, [isProjectScope, homePath]);

  useEffect(() => {
    setView("list");
    setEditing(null);
    loadServers();
    loadGlobalServers();
  }, [loadServers, loadGlobalServers, basePath]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to manage MCP servers.</p>
      </div>
    );
  }

  const startEdit = (server: McpServer) => {
    setEditing({ ...server });
    setIsNew(false);
    setEnvPairs(objToPairs(server.env));
    setHeaderPairs(objToPairs(server.headers));
    setServerIdError(null);
    setView("edit");
  };

  const startNew = () => {
    const s = newServer();
    setEditing(s);
    setIsNew(true);
    setEnvPairs([]);
    setHeaderPairs([]);
    setServerIdError(null);
    setView("edit");
  };

  const handleSelectPreset = (preset: McpPreset) => {
    setEditing({ ...preset.server });
    setIsNew(true);
    setEnvPairs(objToPairs(preset.server.env));
    setHeaderPairs(objToPairs(preset.server.headers));
    setServerIdError(null);
    setView("edit");
  };

  const handleSave = async () => {
    if (!editing || !basePath) return;
    const err = validateServerId(editing.serverId);
    setServerIdError(err);
    if (err) return;

    setSaving(true);
    try {
      const server: McpServer = {
        ...editing,
        env: pairsToObj(envPairs),
        headers: pairsToObj(headerPairs),
      };
      await api.writeMcpServer(basePath, server, isGlobal);
      await loadServers();
      setView("list");
      setEditing(null);
    } catch (e) {
      console.error(`Failed to save server: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (serverId: string) => {
    if (!basePath) return;
    if (!confirm(`Delete MCP server "${serverId}"?`)) return;
    try {
      await api.deleteMcpServer(basePath, serverId, isGlobal);
      await loadServers();
    } catch (e) {
      console.error(`Failed to delete server: ${e}`);
    }
  };

  if (view === "edit" && editing) {
    return (
      <div className="page mcp-page">
        {scope && <ScopeBanner scope={scope} />}
        <div className="page-header">
          <h2>{isNew ? "Add MCP Server" : `Edit: ${editing.serverId}`}</h2>
          <div className="header-actions">
            <McpFileIndicator scope={scope} />
            <button className="btn" onClick={() => setView("list")}>
              Back
            </button>
          </div>
        </div>

        <div className="export-form">
          <div className="form-group">
            <label>Server ID</label>
            <input
              type="text"
              value={editing.serverId}
              onChange={(e) => {
                setEditing({ ...editing, serverId: e.target.value });
                setServerIdError(null);
              }}
              placeholder="my-server"
              disabled={!isNew}
              className={serverIdError ? "input-error" : ""}
            />
            <FieldError
              error={serverIdError}
              onAutoFix={(val) => {
                setEditing({ ...editing, serverId: val });
                setServerIdError(null);
              }}
            />
          </div>

          <div className="form-group">
            <label>Type</label>
            <select
              value={editing.serverType}
              onChange={(e) =>
                setEditing({ ...editing, serverType: e.target.value })
              }
            >
              <option value="stdio">stdio</option>
              <option value="http">http</option>
              <option value="sse">sse</option>
            </select>
          </div>

          {editing.serverType === "stdio" && (
            <>
              <div className="form-group">
                <label>Command</label>
                <input
                  type="text"
                  value={editing.command ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      command: e.target.value || null,
                    })
                  }
                  placeholder="npx -y @modelcontextprotocol/server-name"
                />
              </div>

              <div className="form-group">
                <label>Arguments (one per line)</label>
                <textarea
                  rows={3}
                  value={(editing.args ?? []).join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      args: e.target.value
                        ? e.target.value.split("\n")
                        : [],
                    })
                  }
                  placeholder="arg1&#10;arg2"
                />
              </div>
            </>
          )}

          {(editing.serverType === "http" ||
            editing.serverType === "sse") && (
            <div className="form-group">
              <label>URL</label>
              <input
                type="text"
                value={editing.url ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    url: e.target.value || null,
                  })
                }
                placeholder="http://localhost:3000/mcp"
              />
            </div>
          )}

          <div className="form-group">
            <label>Environment Variables</label>
            {envPairs.map((pair, i) => (
              <div key={i} className="kv-row">
                <input
                  type="text"
                  value={pair.key}
                  onChange={(e) => {
                    const updated = [...envPairs];
                    updated[i] = { ...pair, key: e.target.value };
                    setEnvPairs(updated);
                  }}
                  placeholder="KEY"
                />
                <input
                  type="text"
                  value={pair.value}
                  onChange={(e) => {
                    const updated = [...envPairs];
                    updated[i] = { ...pair, value: e.target.value };
                    setEnvPairs(updated);
                  }}
                  placeholder="value"
                />
                <button
                  className="btn-icon"
                  onClick={() =>
                    setEnvPairs(envPairs.filter((_, j) => j !== i))
                  }
                >
                  x
                </button>
              </div>
            ))}
            <button
              className="btn btn-sm"
              onClick={() =>
                setEnvPairs([...envPairs, { key: "", value: "" }])
              }
            >
              + Add Variable
            </button>
          </div>

          {(editing.serverType === "http" ||
            editing.serverType === "sse") && (
            <div className="form-group">
              <label>Headers</label>
              {headerPairs.map((pair, i) => (
                <div key={i} className="kv-row">
                  <input
                    type="text"
                    value={pair.key}
                    onChange={(e) => {
                      const updated = [...headerPairs];
                      updated[i] = { ...pair, key: e.target.value };
                      setHeaderPairs(updated);
                    }}
                    placeholder="Header-Name"
                  />
                  <input
                    type="text"
                    value={pair.value}
                    onChange={(e) => {
                      const updated = [...headerPairs];
                      updated[i] = { ...pair, value: e.target.value };
                      setHeaderPairs(updated);
                    }}
                    placeholder="value"
                  />
                  <button
                    className="btn-icon"
                    onClick={() =>
                      setHeaderPairs(headerPairs.filter((_, j) => j !== i))
                    }
                  >
                    x
                  </button>
                </div>
              ))}
              <button
                className="btn btn-sm"
                onClick={() =>
                  setHeaderPairs([
                    ...headerPairs,
                    { key: "", value: "" },
                  ])
                }
              >
                + Add Header
              </button>
            </div>
          )}

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Server"}
            </button>
            <button className="btn" onClick={() => setView("list")}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="page mcp-page">
      {scope && <ScopeBanner scope={scope} />}
      <div className="page-header">
        <h2>
          MCP Servers{" "}
          <McpFileIndicator scope={scope} />
          <DocsLink page="mcp" />
        </h2>
        <div className="header-actions">
          <button
            className="btn btn-sm"
            onClick={() => setShowPresets(true)}
          >
            From Template
          </button>
          {basePath && (
            <button
              className="btn btn-sm"
              onClick={() => setShowAiModal(true)}
            >
              AI Create
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={startNew}>
            + Add Server
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Loading servers...</p>
      ) : servers.length === 0 && globalServers.length === 0 ? (
        <div className="packs-empty">
          <h3>No MCP Servers</h3>
          <p>
            Configure MCP (Model Context Protocol) servers that Claude Code can
            use for additional tool integrations.
          </p>
          <div className="form-actions" style={{ justifyContent: "center" }}>
            <button
              className="btn btn-primary"
              onClick={() => setShowPresets(true)}
            >
              Pick a Template
            </button>
            <button className="btn" onClick={startNew}>
              Create from Scratch
            </button>
          </div>
        </div>
      ) : (
        <>
          {servers.length > 0 && (
            <div className="packs-grid">
              {servers.map((server) => (
                <div key={server.serverId} className="pack-card">
                  <div className="pack-card-header">
                    <h3>{server.serverId}</h3>
                    <span className="pack-source-badge">{server.serverType}</span>
                  </div>
                  {server.serverType === "stdio" && server.command && (
                    <div className="pack-meta">
                      <code>{server.command}</code>
                    </div>
                  )}
                  {(server.serverType === "http" ||
                    server.serverType === "sse") &&
                    server.url && (
                      <div className="pack-meta">
                        <code>{server.url}</code>
                      </div>
                    )}
                  {server.args && server.args.length > 0 && (
                    <div className="pack-meta">
                      <span>
                        {server.args.length} arg(s)
                      </span>
                    </div>
                  )}
                  {server.env && Object.keys(server.env).length > 0 && (
                    <div className="pack-meta">
                      <span>
                        {Object.keys(server.env).length} env var(s)
                      </span>
                    </div>
                  )}
                  <div className="pack-actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => startEdit(server)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(server.serverId)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {servers.length === 0 && isProjectScope && (
            <p className="text-muted" style={{ marginTop: 16 }}>No project-level MCP servers configured.</p>
          )}
          {isProjectScope && globalServers.length > 0 && (
            <>
              <div className="global-section-header" style={{ marginTop: 24 }}>
                <span className="global-section-label">Global MCP Servers</span>
                <span className="global-section-hint">Switch to Global Settings to edit</span>
              </div>
              <div className="packs-grid">
                {globalServers.map((server) => (
                  <div key={`global-${server.serverId}`} className="pack-card global-card">
                    <div className="pack-card-header">
                      <h3>
                        {server.serverId}
                        <span className="badge-global" style={{ marginLeft: 8 }}>global</span>
                      </h3>
                      <span className="pack-source-badge">{server.serverType}</span>
                    </div>
                    {server.serverType === "stdio" && server.command && (
                      <div className="pack-meta">
                        <code>{server.command}</code>
                      </div>
                    )}
                    {(server.serverType === "http" ||
                      server.serverType === "sse") &&
                      server.url && (
                        <div className="pack-meta">
                          <code>{server.url}</code>
                        </div>
                      )}
                    {server.args && server.args.length > 0 && (
                      <div className="pack-meta">
                        <span>
                          {server.args.length} arg(s)
                        </span>
                      </div>
                    )}
                    {server.env && Object.keys(server.env).length > 0 && (
                      <div className="pack-meta">
                        <span>
                          {Object.keys(server.env).length} env var(s)
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {showAiModal && basePath && (
        <CreateWithAiModal
          entityType="mcp"
          repoPath={basePath}
          onClose={() => setShowAiModal(false)}
          onCreated={() => loadServers()}
        />
      )}
      {showPresets && (
        <PresetPicker
          title="MCP Server Templates"
          presets={MCP_PRESETS}
          onSelect={handleSelectPreset}
          onClose={() => setShowPresets(false)}
        />
      )}
    </div>
  );
}

function objToPairs(
  obj: Record<string, string> | null | undefined
): { key: string; value: string }[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value: String(value),
  }));
}

function pairsToObj(
  pairs: { key: string; value: string }[]
): Record<string, string> | null {
  const filtered = pairs.filter((p) => p.key.trim());
  if (filtered.length === 0) return null;
  const obj: Record<string, string> = {};
  for (const { key, value } of filtered) {
    obj[key.trim()] = value;
  }
  return obj;
}
