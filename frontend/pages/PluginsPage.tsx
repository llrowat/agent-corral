import { useEffect, useState, useCallback } from "react";
import type {
  Scope,
  PluginSummary,
  PluginImportPreview,
  PluginSyncStatus,
  Agent,
  Skill,
  PluginUpdateCheck,
} from "@/types";
import * as api from "@/lib/tauri";
import { usePluginSync } from "@/hooks/usePluginSync";

interface Props {
  scope?: Scope | null;
}

type View = "list" | "export" | "import-preview" | "git-install";

export function PluginsPage({ scope }: Props) {
  const repo = scope?.type === "project" ? scope.repo : null;
  const {
    syncStatuses,
    updatesAvailable: syncUpdatesAvailable,
    syncPlugin,
    autoSyncAll,
    setPinned,
    setAutoSync,
    unlinkImport,
  } = usePluginSync(repo?.path ?? null);
  const [syncingPlugin, setSyncingPlugin] = useState<string | null>(null);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<"my" | "library" | "git">("my");
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");

  // Export wizard state
  const [exportName, setExportName] = useState("");
  const [exportDesc, setExportDesc] = useState("");
  const [exportAuthor, setExportAuthor] = useState("");
  const [exportVersion, setExportVersion] = useState("1.0.0");
  const [exportIncludeConfig, setExportIncludeConfig] = useState(true);
  const [exportIncludeHooks, setExportIncludeHooks] = useState(true);
  const [exportIncludeMcp, setExportIncludeMcp] = useState(true);
  const [exportAgents, setExportAgents] = useState<Agent[]>([]);
  const [exportSelectedAgentIds, setExportSelectedAgentIds] = useState<string[]>([]);
  const [exportSkills, setExportSkills] = useState<Skill[]>([]);
  const [exportSelectedSkillIds, setExportSelectedSkillIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Import wizard state
  const [importPluginDir, setImportPluginDir] = useState("");
  const [importPreview, setImportPreview] = useState<PluginImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  // Git install state
  const [gitUrl, setGitUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("");
  const [installing, setInstalling] = useState(false);

  // Update state
  const [updates, setUpdates] = useState<PluginUpdateCheck[]>([]);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatingPlugin, setUpdatingPlugin] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listPlugins();
      setPlugins(result);
    } catch {
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const myPlugins = plugins.filter((p) => p.source === "local");
  const libraryPlugins = plugins.filter(
    (p) => p.source === "library" || p.source === "git"
  );
  const gitPlugins = plugins.filter((p) => p.source === "git");
  const displayedPlugins =
    activeTab === "my"
      ? myPlugins
      : activeTab === "git"
        ? gitPlugins
        : libraryPlugins;

  const startExport = async () => {
    if (!repo) {
      alert("Select a repository first");
      return;
    }
    try {
      const [agents, skills] = await Promise.all([
        api.readAgents(repo.path),
        api.readSkills(repo.path),
      ]);
      setExportAgents(agents);
      setExportSelectedAgentIds(agents.map((a) => a.agentId));
      setExportSkills(skills);
      setExportSelectedSkillIds(skills.map((s) => s.skillId));
      setExportName("");
      setExportDesc("");
      setExportAuthor("");
      setExportVersion("1.0.0");
      setExportIncludeConfig(true);
      setExportIncludeHooks(true);
      setExportIncludeMcp(true);
      setView("export");
    } catch (e) {
      alert(`Failed to load repo data: ${e}`);
    }
  };

  const handleExport = async () => {
    if (!repo || !exportName.trim()) return;
    setExporting(true);
    try {
      const path = await api.exportPlugin(
        repo.path,
        exportName.trim(),
        exportDesc.trim(),
        exportAuthor.trim() || null,
        exportVersion.trim() || null,
        exportIncludeConfig,
        exportSelectedAgentIds,
        exportSelectedSkillIds,
        exportIncludeHooks,
        exportIncludeMcp,
      );
      alert(`Plugin exported to: ${path}`);
      setView("list");
      await loadPlugins();
    } catch (e) {
      alert(`Export failed: ${e}`);
    } finally {
      setExporting(false);
    }
  };

  const handleGitInstall = async () => {
    if (!gitUrl.trim()) return;
    setInstalling(true);
    try {
      const installed = await api.installPluginFromGit(
        gitUrl.trim(),
        gitBranch.trim() || undefined
      );
      alert(
        `Installed ${installed.length} plugin(s): ${installed.map((p) => p.name).join(", ")}`
      );
      setView("list");
      setGitUrl("");
      setGitBranch("");
      setActiveTab("git");
      await loadPlugins();
    } catch (e) {
      alert(`Install failed: ${e}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const result = await api.checkPluginUpdates();
      setUpdates(result);
      const available = result.filter((u) => u.updateAvailable);
      if (available.length === 0) {
        alert("All plugins are up to date.");
      } else {
        alert(`${available.length} update(s) available.`);
      }
    } catch (e) {
      alert(`Failed to check updates: ${e}`);
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleUpdatePlugin = async (plugin: PluginSummary) => {
    setUpdatingPlugin(plugin.dirPath);
    try {
      const updated = await api.updatePlugin(plugin.dirPath);
      alert(`Updated "${updated.name}" to v${updated.version}`);
      setUpdates((prev) =>
        prev.filter((u) => u.dirPath !== plugin.dirPath)
      );
      await loadPlugins();
    } catch (e) {
      alert(`Update failed: ${e}`);
    } finally {
      setUpdatingPlugin(null);
    }
  };

  const handleSyncPlugin = async (status: PluginSyncStatus) => {
    setSyncingPlugin(status.pluginName);
    try {
      await syncPlugin(status.pluginName);
      alert(`Synced "${status.pluginName}" to latest.`);
    } catch (e) {
      alert(`Sync failed: ${e}`);
    } finally {
      setSyncingPlugin(null);
    }
  };

  const handleAutoSyncAll = async () => {
    setAutoSyncing(true);
    try {
      const synced = await autoSyncAll();
      if (synced.length === 0) {
        alert("Everything is up to date.");
      } else {
        alert(`Auto-synced ${synced.length} plugin(s): ${synced.join(", ")}`);
      }
    } catch (e) {
      alert(`Auto-sync failed: ${e}`);
    } finally {
      setAutoSyncing(false);
    }
  };

  const startImport = async (plugin: PluginSummary) => {
    if (!repo) {
      alert("Select a repository to import into");
      return;
    }
    try {
      const preview = await api.previewPluginImport(plugin.dirPath, repo.path);
      setImportPluginDir(plugin.dirPath);
      setImportPreview(preview);
      setView("import-preview");
    } catch (e) {
      alert(`Failed to preview import: ${e}`);
    }
  };

  const handleImport = async (mode: "addOnly" | "overwrite") => {
    if (!repo || !importPluginDir) return;
    setImporting(true);
    try {
      await api.importPlugin(importPluginDir, repo.path, mode);
      alert("Plugin imported successfully!");
      setView("list");
    } catch (e) {
      alert(`Import failed: ${e}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDeletePlugin = async (plugin: PluginSummary) => {
    if (!confirm(`Delete plugin "${plugin.name}"?`)) return;
    try {
      await api.deletePlugin(plugin.dirPath);
      await loadPlugins();
    } catch (e) {
      alert(`Failed to delete plugin: ${e}`);
    }
  };

  const toggleExportAgent = (id: string) => {
    setExportSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleExportSkill = (id: string) => {
    setExportSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };


  const getUpdateForPlugin = (
    plugin: PluginSummary
  ): PluginUpdateCheck | undefined => {
    return updates.find(
      (u) => u.dirPath === plugin.dirPath && u.updateAvailable
    );
  };

  // Git install view
  if (view === "git-install") {
    return (
      <div className="page plugins-page">
        <div className="page-header">
          <h2>Install from Git</h2>
          <button className="btn" onClick={() => setView("list")}>
            Back
          </button>
        </div>

        <div className="export-form">
          <div className="form-group">
            <label>Repository URL</label>
            <input
              type="text"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder="https://github.com/user/plugin-repo.git"
            />
            <p className="text-muted" style={{ marginTop: 4 }}>
              Supports HTTPS and SSH URLs. Private repos work if your git
              credentials are configured.
            </p>
          </div>
          <div className="form-group">
            <label>Branch or Tag (optional)</label>
            <input
              type="text"
              value={gitBranch}
              onChange={(e) => setGitBranch(e.target.value)}
              placeholder="main (defaults to repo default branch)"
            />
          </div>

          <div className="git-install-info">
            <h4>How it works</h4>
            <ul>
              <li>
                The repo is cloned and scanned for{" "}
                <code>.claude-plugin/plugin.json</code> directories
              </li>
              <li>Found plugins are installed to your library</li>
              <li>
                Git source is tracked so you can check for updates later
              </li>
            </ul>
          </div>

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleGitInstall}
              disabled={installing || !gitUrl.trim()}
            >
              {installing ? "Cloning & Installing..." : "Install"}
            </button>
            <button className="btn" onClick={() => setView("list")}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Export wizard view
  if (view === "export") {
    return (
      <div className="page plugins-page">
        <div className="page-header">
          <h2>Export Plugin</h2>
          <button className="btn" onClick={() => setView("list")}>
            Back
          </button>
        </div>

        <div className="export-form">
          <div className="form-group">
            <label>Plugin Name</label>
            <input
              type="text"
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              placeholder="My Company Plugin"
            />
          </div>
          <div className="form-group">
            <label>Version</label>
            <input
              type="text"
              value={exportVersion}
              onChange={(e) => setExportVersion(e.target.value)}
              placeholder="1.0.0"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              rows={3}
              value={exportDesc}
              onChange={(e) => setExportDesc(e.target.value)}
              placeholder="Standard agent and skill configuration for the team..."
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
              <input
                type="checkbox"
                checked={exportIncludeHooks}
                onChange={(e) => setExportIncludeHooks(e.target.checked)}
              />{" "}
              Include hooks
            </label>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={exportIncludeMcp}
                onChange={(e) => setExportIncludeMcp(e.target.checked)}
              />{" "}
              Include MCP servers
            </label>
          </div>

          <div className="form-group">
            <label>
              Agents ({exportSelectedAgentIds.length}/{exportAgents.length})
            </label>
            <div className="export-agents-list">
              {exportAgents.map((agent) => (
                <label key={agent.agentId} className="tool-checkbox">
                  <input
                    type="checkbox"
                    checked={exportSelectedAgentIds.includes(agent.agentId)}
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

          <div className="form-group">
            <label>
              Skills ({exportSelectedSkillIds.length}/{exportSkills.length})
            </label>
            <div className="export-agents-list">
              {exportSkills.map((skill) => (
                <label key={skill.skillId} className="tool-checkbox">
                  <input
                    type="checkbox"
                    checked={exportSelectedSkillIds.includes(skill.skillId)}
                    onChange={() => toggleExportSkill(skill.skillId)}
                  />
                  <span>
                    {skill.name}{" "}
                    <span className="text-muted">({skill.skillId})</span>
                  </span>
                </label>
              ))}
              {exportSkills.length === 0 && (
                <p className="text-muted">No skills in this repository.</p>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exporting || !exportName.trim()}
            >
              {exporting ? "Exporting..." : "Export Plugin"}
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
    const hasConflicts =
      importPreview.agentsToUpdate.length > 0 ||
      importPreview.skillsToUpdate.length > 0 ||
      importPreview.mcpToUpdate.length > 0;

    return (
      <div className="page plugins-page">
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
                    <code>{id}</code> <span className="badge-update">exists</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {importPreview.skillsToAdd.length > 0 && (
            <div className="preview-section">
              <h3>Skills to Add ({importPreview.skillsToAdd.length})</h3>
              <ul>
                {importPreview.skillsToAdd.map((id) => (
                  <li key={id}>
                    <code>{id}</code> <span className="badge-new">new</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {importPreview.skillsToUpdate.length > 0 && (
            <div className="preview-section">
              <h3>Skills to Update ({importPreview.skillsToUpdate.length})</h3>
              <ul>
                {importPreview.skillsToUpdate.map((id) => (
                  <li key={id}>
                    <code>{id}</code> <span className="badge-update">exists</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {importPreview.hooksToAdd.length > 0 && (
            <div className="preview-section">
              <h3>Hooks ({importPreview.hooksToAdd.length})</h3>
              <ul>
                {importPreview.hooksToAdd.map((evt) => (
                  <li key={evt}>
                    <code>{evt}</code> <span className="badge-new">add/replace</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {importPreview.mcpToAdd.length > 0 && (
            <div className="preview-section">
              <h3>MCP Servers to Add ({importPreview.mcpToAdd.length})</h3>
              <ul>
                {importPreview.mcpToAdd.map((id) => (
                  <li key={id}>
                    <code>{id}</code> <span className="badge-new">new</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {importPreview.mcpToUpdate.length > 0 && (
            <div className="preview-section">
              <h3>MCP Servers to Update ({importPreview.mcpToUpdate.length})</h3>
              <ul>
                {importPreview.mcpToUpdate.map((id) => (
                  <li key={id}>
                    <code>{id}</code> <span className="badge-update">exists</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {importPreview.configChanges && (
            <div className="preview-section">
              <h3>Config Changes</h3>
              <p>This plugin includes config defaults that will be applied.</p>
            </div>
          )}

          <div className="form-actions" style={{ marginTop: "24px" }}>
            {hasConflicts ? (
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
    <div className="page plugins-page">
      <div className="page-header">
        <h2>Plugins</h2>
        <div className="header-actions">
          <div className="tab-bar">
            <button
              className={`btn btn-sm ${activeTab === "my" ? "active" : ""}`}
              onClick={() => setActiveTab("my")}
            >
              My Plugins ({myPlugins.length})
            </button>
            <button
              className={`btn btn-sm ${activeTab === "library" ? "active" : ""}`}
              onClick={() => setActiveTab("library")}
            >
              Library ({libraryPlugins.length})
            </button>
            <button
              className={`btn btn-sm ${activeTab === "git" ? "active" : ""}`}
              onClick={() => setActiveTab("git")}
            >
              Git ({gitPlugins.length})
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={startExport}>
            Export Plugin
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setView("git-install")}
          >
            Install from Git
          </button>
          {gitPlugins.length > 0 && (
            <button
              className="btn btn-sm"
              onClick={handleCheckUpdates}
              disabled={checkingUpdates}
            >
              {checkingUpdates ? "Checking..." : "Check Updates"}
            </button>
          )}
        </div>
      </div>

      {/* Sync status banner for imported plugins */}
      {repo && syncStatuses.length > 0 && (
        <div className="sync-status-banner">
          <div className="sync-banner-header">
            <strong>
              Imported Plugins ({syncStatuses.length})
              {syncUpdatesAvailable > 0 && (
                <span className="badge-update" style={{ marginLeft: 8 }}>
                  {syncUpdatesAvailable} update(s)
                </span>
              )}
            </strong>
            {syncUpdatesAvailable > 0 && (
              <button
                className="btn btn-sm btn-primary"
                onClick={handleAutoSyncAll}
                disabled={autoSyncing}
              >
                {autoSyncing ? "Syncing..." : "Sync All"}
              </button>
            )}
          </div>
          <div className="sync-status-list">
            {syncStatuses.map((status) => (
              <div
                key={status.pluginName}
                className={`sync-status-item ${status.updateAvailable ? "sync-has-update" : ""}`}
              >
                <div className="sync-status-info">
                  <span className="sync-plugin-name">{status.pluginName}</span>
                  {status.importedCommit && (
                    <span
                      className="pack-git-commit"
                      title={status.importedCommit}
                    >
                      imported: {status.importedCommit.slice(0, 7)}
                    </span>
                  )}
                  {status.libraryCommit &&
                    status.importedCommit !== status.libraryCommit && (
                      <span
                        className="pack-git-commit"
                        title={status.libraryCommit}
                      >
                        latest: {status.libraryCommit.slice(0, 7)}
                      </span>
                    )}
                  {status.pinned && (
                    <span className="badge-pinned">pinned</span>
                  )}
                  {!status.pluginExists && (
                    <span className="badge-missing">plugin removed</span>
                  )}
                </div>
                <div className="sync-status-actions">
                  <select
                    className="sync-policy-select"
                    value={
                      status.pinned
                        ? "pinned"
                        : status.autoSync
                          ? "auto"
                          : "manual"
                    }
                    onChange={async (e) => {
                      const val = e.target.value;
                      if (val === "pinned") {
                        await setPinned(status.pluginName, true);
                      } else {
                        await setPinned(status.pluginName, false);
                        await setAutoSync(
                          status.pluginName,
                          val === "auto"
                        );
                      }
                    }}
                  >
                    <option value="auto">Auto-sync</option>
                    <option value="manual">Manual</option>
                    <option value="pinned">Pinned</option>
                  </select>
                  {status.updateAvailable &&
                    !status.pinned &&
                    status.pluginExists && (
                      <button
                        className="btn btn-sm btn-update"
                        onClick={() => handleSyncPlugin(status)}
                        disabled={syncingPlugin === status.pluginName}
                      >
                        {syncingPlugin === status.pluginName
                          ? "Syncing..."
                          : "Sync"}
                      </button>
                    )}
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      if (
                        confirm(
                          `Unlink "${status.pluginName}"? This stops tracking sync for this import.`
                        )
                      ) {
                        unlinkImport(status.pluginName);
                      }
                    }}
                    title="Stop tracking this import"
                  >
                    Unlink
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading plugins...</p>
      ) : displayedPlugins.length === 0 ? (
        <div className="packs-empty">
          <h3>
            {activeTab === "my"
              ? "No Plugins Yet"
              : activeTab === "git"
                ? "No Git Plugins"
                : "Library Empty"}
          </h3>
          <p>
            {activeTab === "my"
              ? "Create a plugin by exporting agents, skills, hooks, and MCP servers from a repository."
              : activeTab === "git"
                ? "Install plugins from a git repository containing .claude-plugin directories."
                : "Install plugins from git or export from a repository to see them here."}
          </p>
          {activeTab === "my" && (
            <button className="btn btn-primary" onClick={startExport}>
              Export Plugin
            </button>
          )}
          {activeTab === "git" && (
            <button
              className="btn btn-primary"
              onClick={() => setView("git-install")}
            >
              Install from Git
            </button>
          )}
        </div>
      ) : (
        <div className="packs-grid">
          {displayedPlugins.map((plugin) => {
            const update = getUpdateForPlugin(plugin);
            return (
              <div
                key={plugin.pluginId}
                className={`pack-card ${update ? "pack-card-update" : ""}`}
              >
                <div className="pack-card-header">
                  <h3>{plugin.name}</h3>
                  <div className="pack-version-row">
                    <span className="pack-version">v{plugin.version}</span>
                    {plugin.source === "git" && (
                      <span className="pack-source-badge">git</span>
                    )}
                  </div>
                </div>
                <p className="pack-description">{plugin.description}</p>
                <div className="pack-meta">
                  {plugin.author && (
                    <span className="pack-author">by {plugin.author}</span>
                  )}
                  <span>{plugin.agentCount} agents</span>
                  {plugin.skillCount > 0 && (
                    <span>{plugin.skillCount} skills</span>
                  )}
                  {plugin.hookCount > 0 && (
                    <span>{plugin.hookCount} hooks</span>
                  )}
                  {plugin.mcpCount > 0 && (
                    <span>{plugin.mcpCount} MCP</span>
                  )}
                  {plugin.hasConfig && <span>+ config</span>}
                </div>
                {plugin.gitSource && (
                  <div className="pack-git-info">
                    <span
                      className="pack-git-url"
                      title={plugin.gitSource.repoUrl}
                    >
                      {shortenGitUrl(plugin.gitSource.repoUrl)}
                    </span>
                    {plugin.gitSource.branch && (
                      <span className="pack-git-branch">
                        {plugin.gitSource.branch}
                      </span>
                    )}
                    <span
                      className="pack-git-commit"
                      title={plugin.gitSource.installedCommit}
                    >
                      {plugin.gitSource.installedCommit.slice(0, 7)}
                    </span>
                  </div>
                )}
                {update && (
                  <div className="pack-update-banner">
                    Update available ({update.latestCommit.slice(0, 7)})
                  </div>
                )}
                <div className="pack-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => startImport(plugin)}
                  >
                    Import
                  </button>
                  {update && (
                    <button
                      className="btn btn-sm btn-update"
                      onClick={() => handleUpdatePlugin(plugin)}
                      disabled={updatingPlugin === plugin.dirPath}
                    >
                      {updatingPlugin === plugin.dirPath
                        ? "Updating..."
                        : "Update"}
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDeletePlugin(plugin)}
                  >
                    {plugin.source === "git" ? "Uninstall" : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function shortenGitUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^git@[^:]+:/, "")
    .replace(/\.git$/, "")
    .replace(/^github\.com\//, "")
    .replace(/^gitlab\.com\//, "");
}
