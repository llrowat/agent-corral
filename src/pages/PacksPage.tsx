import { useEffect, useState, useCallback } from "react";
import type { Repo, PackSummary, ImportPreview, Agent } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  repo?: Repo | null;
}

type View = "list" | "export" | "import-preview";

export function PacksPage({ repo }: Props) {
  const [activeTab, setActiveTab] = useState<"my" | "library">("my");
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");

  // Export wizard state
  const [exportName, setExportName] = useState("");
  const [exportDesc, setExportDesc] = useState("");
  const [exportAuthor, setExportAuthor] = useState("");
  const [exportIncludeConfig, setExportIncludeConfig] = useState(true);
  const [exportAgents, setExportAgents] = useState<Agent[]>([]);
  const [exportSelectedIds, setExportSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Import wizard state
  const [importPackPath, setImportPackPath] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  const loadPacks = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listPacks();
      setPacks(result);
    } catch {
      setPacks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  const myPacks = packs.filter((p) => p.source === "local");
  const libraryPacks = packs.filter((p) => p.source === "library");
  const displayedPacks = activeTab === "my" ? myPacks : libraryPacks;

  const startExport = async () => {
    if (!repo) {
      alert("Select a repository first");
      return;
    }
    try {
      const agents = await api.readAgents(repo.path);
      setExportAgents(agents);
      setExportSelectedIds(agents.map((a) => a.agentId));
      setExportName("");
      setExportDesc("");
      setExportAuthor("");
      setExportIncludeConfig(true);
      setView("export");
    } catch (e) {
      alert(`Failed to read agents: ${e}`);
    }
  };

  const handleExport = async () => {
    if (!repo || !exportName.trim()) return;
    setExporting(true);
    try {
      const path = await api.exportPack(
        repo.path,
        exportName.trim(),
        exportDesc.trim(),
        exportAuthor.trim() || null,
        exportIncludeConfig,
        exportSelectedIds
      );
      alert(`Pack exported to: ${path}`);
      setView("list");
      await loadPacks();
    } catch (e) {
      alert(`Export failed: ${e}`);
    } finally {
      setExporting(false);
    }
  };

  const startImport = async (pack: PackSummary) => {
    if (!repo) {
      alert("Select a repository to import into");
      return;
    }
    try {
      const preview = await api.previewImport(pack.filePath, repo.path);
      setImportPackPath(pack.filePath);
      setImportPreview(preview);
      setView("import-preview");
    } catch (e) {
      alert(`Failed to preview import: ${e}`);
    }
  };

  const handleImport = async (mode: "addOnly" | "overwrite") => {
    if (!repo || !importPackPath) return;
    setImporting(true);
    try {
      await api.importPack(importPackPath, repo.path, mode);
      alert("Pack imported successfully!");
      setView("list");
    } catch (e) {
      alert(`Import failed: ${e}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDeletePack = async (pack: PackSummary) => {
    if (!confirm(`Delete pack "${pack.name}"?`)) return;
    try {
      await api.deletePack(pack.filePath);
      await loadPacks();
    } catch (e) {
      alert(`Failed to delete pack: ${e}`);
    }
  };

  const toggleExportAgent = (id: string) => {
    setExportSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Export wizard view
  if (view === "export") {
    return (
      <div className="page packs-page">
        <div className="page-header">
          <h2>Export Pack</h2>
          <button className="btn" onClick={() => setView("list")}>
            Back
          </button>
        </div>

        <div className="export-form">
          <div className="form-group">
            <label>Pack Name</label>
            <input
              type="text"
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              placeholder="My Company Pack"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              rows={3}
              value={exportDesc}
              onChange={(e) => setExportDesc(e.target.value)}
              placeholder="Standard agent configuration for the team..."
            />
          </div>
          <div className="form-group">
            <label>Author (optional)</label>
            <input
              type="text"
              value={exportAuthor}
              onChange={(e) => setExportAuthor(e.target.value)}
              placeholder="Your Name"
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={exportIncludeConfig}
                onChange={(e) => setExportIncludeConfig(e.target.checked)}
              />{" "}
              Include config defaults
            </label>
          </div>

          <div className="form-group">
            <label>
              Agents to include ({exportSelectedIds.length}/{exportAgents.length})
            </label>
            <div className="export-agents-list">
              {exportAgents.map((agent) => (
                <label key={agent.agentId} className="tool-checkbox">
                  <input
                    type="checkbox"
                    checked={exportSelectedIds.includes(agent.agentId)}
                    onChange={() => toggleExportAgent(agent.agentId)}
                  />
                  <span>
                    {agent.name}{" "}
                    <span className="text-muted">({agent.agentId})</span>
                  </span>
                </label>
              ))}
              {exportAgents.length === 0 && (
                <p className="text-muted">No agents in this repository.</p>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exporting || !exportName.trim()}
            >
              {exporting ? "Exporting..." : "Export Pack"}
            </button>
            <button className="btn" onClick={() => setView("list")}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Import preview view
  if (view === "import-preview" && importPreview) {
    return (
      <div className="page packs-page">
        <div className="page-header">
          <h2>Import Preview</h2>
          <button className="btn" onClick={() => setView("list")}>
            Back
          </button>
        </div>

        <div className="import-preview">
          {importPreview.agentsToAdd.length > 0 && (
            <div className="preview-section">
              <h3>Agents to Add ({importPreview.agentsToAdd.length})</h3>
              <ul>
                {importPreview.agentsToAdd.map((id) => (
                  <li key={id}>
                    <code>{id}</code> <span className="badge-new">new</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importPreview.agentsToUpdate.length > 0 && (
            <div className="preview-section">
              <h3>Agents to Update ({importPreview.agentsToUpdate.length})</h3>
              <ul>
                {importPreview.agentsToUpdate.map((id) => (
                  <li key={id}>
                    <code>{id}</code>{" "}
                    <span className="badge-update">exists</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importPreview.configChanges && (
            <div className="preview-section">
              <h3>Config Changes</h3>
              <p>This pack includes config defaults that will be applied.</p>
            </div>
          )}

          {importPreview.agentsToAdd.length === 0 &&
            importPreview.agentsToUpdate.length === 0 &&
            !importPreview.configChanges && (
              <p className="text-muted">
                Nothing to import - all agents already exist.
              </p>
            )}

          <div className="form-actions" style={{ marginTop: "24px" }}>
            {importPreview.agentsToUpdate.length > 0 ? (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => handleImport("addOnly")}
                  disabled={importing}
                >
                  {importing ? "Importing..." : "Add New Only"}
                </button>
                <button
                  className="btn"
                  onClick={() => handleImport("overwrite")}
                  disabled={importing}
                >
                  Overwrite All
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => handleImport("addOnly")}
                disabled={importing}
              >
                {importing ? "Importing..." : "Import"}
              </button>
            )}
            <button className="btn" onClick={() => setView("list")}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main list view
  return (
    <div className="page packs-page">
      <div className="page-header">
        <h2>Packs</h2>
        <div className="header-actions">
          <div className="tab-bar">
            <button
              className={`btn btn-sm ${activeTab === "my" ? "active" : ""}`}
              onClick={() => setActiveTab("my")}
            >
              My Packs ({myPacks.length})
            </button>
            <button
              className={`btn btn-sm ${activeTab === "library" ? "active" : ""}`}
              onClick={() => setActiveTab("library")}
            >
              Library ({libraryPacks.length})
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={startExport}>
            Export Pack
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Loading packs...</p>
      ) : displayedPacks.length === 0 ? (
        <div className="packs-empty">
          <h3>{activeTab === "my" ? "No Packs Yet" : "Library Empty"}</h3>
          <p>
            {activeTab === "my"
              ? "Create a pack by exporting agents and config from a repository. Packs can be shared with your team."
              : "Add .agentpack files to your library folder to see them here."}
          </p>
          {activeTab === "my" && (
            <button className="btn btn-primary" onClick={startExport}>
              Export Pack
            </button>
          )}
        </div>
      ) : (
        <div className="packs-grid">
          {displayedPacks.map((pack) => (
            <div key={pack.packId} className="pack-card">
              <div className="pack-card-header">
                <h3>{pack.name}</h3>
                <span className="pack-version">v{pack.version}</span>
              </div>
              <p className="pack-description">{pack.description}</p>
              <div className="pack-meta">
                {pack.author && (
                  <span className="pack-author">by {pack.author}</span>
                )}
                <span>{pack.agentCount} agents</span>
                {pack.hasConfig && <span>+ config</span>}
              </div>
              <div className="pack-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => startImport(pack)}
                >
                  Import
                </button>
                {pack.source === "local" && (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDeletePack(pack)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
