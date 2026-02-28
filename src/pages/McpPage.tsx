import { useEffect, useState, useCallback } from "react";
import type { Repo, McpServer } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  repo: Repo | null;
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

export function McpPage({ repo }: Props) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Env/headers editor state
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>(
    []
  );
  const [headerPairs, setHeaderPairs] = useState<
    { key: string; value: string }[]
  >([]);

  const loadServers = useCallback(async () => {
    if (!repo) return;
    try {
      setLoading(true);
      const result = await api.readMcpServers(repo.path);
      setServers(result);
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    setView("list");
    setEditing(null);
    loadServers();
  }, [loadServers, repo]);

  if (!repo) {
    return (
      <div className="page page-empty">
        <p>Select a repository to manage MCP servers.</p>
      </div>
    );
  }

  const startEdit = (server: McpServer) => {
    setEditing({ ...server });
    setIsNew(false);
    setEnvPairs(objToPairs(server.env));
    setHeaderPairs(objToPairs(server.headers));
    setView("edit");
  };

  const startNew = () => {
    const s = newServer();
    setEditing(s);
    setIsNew(true);
    setEnvPairs([]);
    setHeaderPairs([]);
    setView("edit");
  };

  const handleSave = async () => {
    if (!editing || !repo) return;
    if (!editing.serverId.trim()) {
      alert("Server ID is required");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(editing.serverId)) {
      alert(
        "Server ID must only contain letters, numbers, hyphens, and underscores"
      );
      return;
    }

    setSaving(true);
    try {
      const server: McpServer = {
        ...editing,
        env: pairsToObj(envPairs),
        headers: pairsToObj(headerPairs),
      };
      await api.writeMcpServer(repo.path, server);
      await loadServers();
      setView("list");
      setEditing(null);
    } catch (e) {
      alert(`Failed to save server: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (serverId: string) => {
    if (!repo) return;
    if (!confirm(`Delete MCP server "${serverId}"?`)) return;
    try {
      await api.deleteMcpServer(repo.path, serverId);
      await loadServers();
    } catch (e) {
      alert(`Failed to delete server: ${e}`);
    }
  };

  if (view === "edit" && editing) {
    return (
      <div className="page mcp-page">
        <div className="page-header">
          <h2>{isNew ? "Add MCP Server" : `Edit: ${editing.serverId}`}</h2>
          <button className="btn" onClick={() => setView("list")}>
            Back
          </button>
        </div>

        <div className="export-form">
          <div className="form-group">
            <label>Server ID</label>
            <input
              type="text"
              value={editing.serverId}
              onChange={(e) =>
                setEditing({ ...editing, serverId: e.target.value })
              }
              placeholder="my-server"
              disabled={!isNew}
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
      <div className="page-header">
        <h2>MCP Servers</h2>
        <button className="btn btn-primary btn-sm" onClick={startNew}>
          + Add Server
        </button>
      </div>

      {loading ? (
        <p className="text-muted">Loading servers...</p>
      ) : servers.length === 0 ? (
        <div className="packs-empty">
          <h3>No MCP Servers</h3>
          <p>
            Configure MCP (Model Context Protocol) servers that Claude Code can
            use for additional tool integrations.
          </p>
          <button className="btn btn-primary" onClick={startNew}>
            Add Server
          </button>
        </div>
      ) : (
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
