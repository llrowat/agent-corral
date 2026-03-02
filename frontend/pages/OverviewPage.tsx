import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Scope, RepoStatus, ClaudeDetection, Agent, HookEvent, Skill, McpServer, MemoryStore, NormalizedConfig } from "@/types";
import * as api from "@/lib/tauri";
import { ScopeBanner } from "@/components/ScopeGuard";
import { EffectiveConfig } from "@/components/EffectiveConfig";
import { ConfigLinter } from "@/components/ConfigLinter";
import { CrossRefs } from "@/components/CrossRefs";
import { ImportWizard } from "@/components/ImportWizard";
import { useToast } from "@/components/Toast";

interface Props {
  scope: Scope | null;
  homePath?: string | null;
}

interface ConfigCounts {
  agents: number;
  hooks: number;
  skills: number;
  mcpServers: number;
  memoryStores: number;
  hasConfig: boolean;
  model: string | null;
}

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

type BackupModalMode = "export" | "import" | null;

export function OverviewPage({ scope, homePath }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [detection, setDetection] = useState<ClaudeDetection | null>(null);
  const [counts, setCounts] = useState<ConfigCounts | null>(null);
  const [backupModal, setBackupModal] = useState<BackupModalMode>(null);
  const [exportJson, setExportJson] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importing, setImporting] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [entityData, setEntityData] = useState<{
    agents: Agent[];
    hooks: HookEvent[];
    skills: Skill[];
    mcpServers: McpServer[];
    memoryStores: MemoryStore[];
  } | null>(null);

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;
  const isGlobal = scope?.type === "global";

  const reloadData = useCallback(() => {
    if (!basePath) return;
    api.detectClaudeConfig(basePath).then(setDetection);

    // Load counts for all config areas
    Promise.all([
      api.readAgents(basePath).catch(() => [] as Agent[]),
      api.readHooks(basePath).catch(() => [] as HookEvent[]),
      api.readSkills(basePath).catch(() => [] as Skill[]),
      api.readMcpServers(basePath, isGlobal).catch(() => [] as McpServer[]),
      api.readMemoryStores(basePath).catch(() => [] as MemoryStore[]),
      api.readClaudeConfig(basePath).catch(() => null as NormalizedConfig | null),
    ]).then(([agents, hooks, skills, mcpServers, memoryStores, config]) => {
      const hookHandlerCount = hooks.reduce(
        (sum, h) => sum + h.groups.reduce((gs, g) => gs + g.hooks.length, 0),
        0
      );
      setCounts({
        agents: agents.length,
        hooks: hookHandlerCount,
        skills: skills.length,
        mcpServers: mcpServers.length,
        memoryStores: memoryStores.length,
        hasConfig: !!(config?.model || config?.permissions || (config?.ignorePatterns && config.ignorePatterns.length > 0)),
        model: config?.model ?? null,
      });
      setEntityData({ agents, hooks, skills, mcpServers, memoryStores });
    });
  }, [basePath, isGlobal]);

  const handleExport = useCallback(async () => {
    if (!basePath) return;
    try {
      const json = await api.exportConfigBundle(basePath, isGlobal);
      setExportJson(json);
      setBackupModal("export");
    } catch (err) {
      toast.error("Export failed", String(err));
    }
  }, [basePath, isGlobal, toast]);

  const handleImport = useCallback(
    async (mode: "merge" | "overwrite") => {
      if (!basePath || !importJson.trim()) return;
      setImporting(true);
      try {
        const result = await api.importConfigBundle(basePath, isGlobal, importJson, mode);
        const parts: string[] = [];
        if (result.agentsImported > 0) parts.push(`${result.agentsImported} agent(s)`);
        if (result.skillsImported > 0) parts.push(`${result.skillsImported} skill(s)`);
        if (result.hooksImported > 0) parts.push(`${result.hooksImported} hook event(s)`);
        if (result.mcpServersImported > 0) parts.push(`${result.mcpServersImported} MCP server(s)`);
        if (result.settingsImported) parts.push("settings");

        const summary = parts.length > 0 ? `Imported: ${parts.join(", ")}` : "Nothing new to import";
        toast.success("Import complete", summary);
        setBackupModal(null);
        setImportJson("");
        reloadData();
      } catch (err) {
        toast.error("Import failed", String(err));
      } finally {
        setImporting(false);
      }
    },
    [basePath, isGlobal, importJson, toast, reloadData]
  );

  const handleCopyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [exportJson, toast]);

  useEffect(() => {
    if (!basePath) {
      setStatus(null);
      setDetection(null);
      setCounts(null);
      setEntityData(null);
      return;
    }
    if (!isGlobal) {
      api.getRepoStatus(basePath).then(setStatus);
    } else {
      setStatus(null);
    }
    reloadData();
  }, [basePath, isGlobal, reloadData]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <h2>Howdy, partner.</h2>
        <p>Welcome to AgentCorral — your Claude Code configuration management studio.</p>
        <p>Select Global Settings or a repository to get started.</p>
      </div>
    );
  }

  const heading = isGlobal ? "Global Settings" : scope.repo.name;
  const pathDisplay = basePath;

  const configCards = [
    {
      key: "config",
      label: "Config",
      icon: "\u2638",
      path: "/config",
      count: counts?.hasConfig ? 1 : 0,
      countLabel: counts?.hasConfig
        ? `Model: ${counts.model ? (MODEL_LABELS[counts.model] ?? counts.model) : "default"}`
        : null,
      emptyLabel: "No config set",
      emptyHint: "Set default model, permissions, and file patterns",
      detected: detection?.hasSettingsJson,
    },
    {
      key: "agents",
      label: "Agents",
      icon: "\u2699",
      path: "/agents",
      count: counts?.agents ?? 0,
      countLabel: null,
      emptyLabel: "No agents configured",
      emptyHint: "Create custom personas with their own prompts and tools",
      detected: detection?.hasAgentsDir,
    },
    {
      key: "hooks",
      label: "Hooks",
      icon: "\u21AA",
      path: "/hooks",
      count: counts?.hooks ?? 0,
      countLabel: null,
      emptyLabel: "No hooks configured",
      emptyHint: "Run shell commands automatically on Claude Code events",
      detected: detection?.hookCount !== undefined && detection.hookCount > 0,
    },
    {
      key: "skills",
      label: "Skills",
      icon: "\u2726",
      path: "/skills",
      count: counts?.skills ?? 0,
      countLabel: null,
      emptyLabel: "No skills configured",
      emptyHint: "Define custom slash commands with prompt templates",
      detected: detection?.hasSkillsDir,
    },
    {
      key: "mcp",
      label: "MCP Servers",
      icon: "\u2302",
      path: "/mcp",
      count: counts?.mcpServers ?? 0,
      countLabel: null,
      emptyLabel: "No MCP servers configured",
      emptyHint: "Connect Claude to external tools via Model Context Protocol",
      detected: detection?.hasMcpJson,
    },
    {
      key: "memory",
      label: "Memory",
      icon: "\u25C8",
      path: "/memory",
      count: counts?.memoryStores ?? 0,
      countLabel: null,
      emptyLabel: "No memory stores",
      emptyHint: "Persistent notes Claude reads and writes across sessions",
      detected: detection?.hasMemoryDir,
    },
  ];

  const totalConfigured = configCards.filter((c) => c.count > 0).length;
  const totalCards = configCards.length;

  return (
    <div className="page overview-page">
      <h2>{heading}</h2>
      <p className="repo-path-display">{pathDisplay}</p>

      <ScopeBanner scope={scope} />

      {/* Repo status (project scope only) */}
      {!isGlobal && status && (
        <div className="overview-repo-status">
          <StatusIndicator label="Directory exists" ok={status.exists} />
          <StatusIndicator label="Git repo" ok={status.is_git_repo} />
          {detection && <StatusIndicator label="CLAUDE.md" ok={detection.hasClaudeMd} />}
        </div>
      )}

      {/* Progress bar */}
      <div className="overview-progress">
        <div className="overview-progress-header">
          <span className="overview-progress-label">
            Configuration: {totalConfigured} of {totalCards} areas set up
          </span>
          {totalConfigured === totalCards && (
            <span className="overview-progress-complete">All configured</span>
          )}
        </div>
        <div className="overview-progress-bar">
          <div
            className="overview-progress-fill"
            style={{ width: `${(totalConfigured / totalCards) * 100}%` }}
          />
        </div>
      </div>

      {/* Backup & Restore */}
      <div className="backup-restore-actions">
        <button className="btn btn-sm" onClick={handleExport}>
          Export Config
        </button>
        <button className="btn btn-sm" onClick={() => { setImportJson(""); setBackupModal("import"); }}>
          Import Config
        </button>
        <button className="btn btn-sm" onClick={() => setShowImportWizard(true)}>
          Import Project
        </button>
      </div>

      {/* Backup/Restore modal */}
      {backupModal && (
        <div className="backup-modal-overlay" onClick={() => setBackupModal(null)}>
          <div className="backup-modal" onClick={(e) => e.stopPropagation()}>
            <div className="backup-modal-header">
              <h3>{backupModal === "export" ? "Export Configuration" : "Import Configuration"}</h3>
              <button className="btn btn-sm" onClick={() => setBackupModal(null)} aria-label="Close">
                &times;
              </button>
            </div>
            {backupModal === "export" ? (
              <div className="backup-modal-body">
                <p>Copy this JSON bundle to back up your configuration.</p>
                <textarea
                  readOnly
                  value={exportJson}
                  data-testid="export-textarea"
                />
                <div className="backup-modal-actions">
                  <button className="btn btn-sm btn-primary" onClick={handleCopyToClipboard}>
                    Copy to Clipboard
                  </button>
                </div>
              </div>
            ) : (
              <div className="backup-modal-body">
                <p>Paste a config bundle JSON below, then choose how to import.</p>
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder="Paste config bundle JSON here..."
                  data-testid="import-textarea"
                />
                <div className="backup-modal-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleImport("merge")}
                    disabled={importing || !importJson.trim()}
                  >
                    {importing ? "Importing..." : "Merge"}
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleImport("overwrite")}
                    disabled={importing || !importJson.trim()}
                  >
                    {importing ? "Importing..." : "Overwrite"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Config linter */}
      <ConfigLinter scope={scope} homePath={homePath} />

      {/* Effective merged config view */}
      <EffectiveConfig scope={scope} homePath={homePath ?? null} />

      {/* Config cards grid */}
      <div className="overview-cards-grid">
        {configCards.map((card) => {
          const isEmpty = card.count === 0;
          return (
            <div
              key={card.key}
              className={`overview-card ${isEmpty ? "overview-card-empty" : "overview-card-active"}`}
            >
              <div className="overview-card-header">
                <span className="overview-card-icon">{card.icon}</span>
                <span className="overview-card-label">{card.label}</span>
                {!isEmpty && (
                  <span className="overview-card-count">
                    {card.countLabel ?? `${card.count} ${card.count === 1 ? "item" : "items"}`}
                  </span>
                )}
              </div>
              {isEmpty ? (
                <div className="overview-card-body">
                  <p className="overview-card-empty-label">{card.emptyLabel}</p>
                  <p className="overview-card-hint">{card.emptyHint}</p>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => navigate(card.path)}
                  >
                    Set up now
                  </button>
                </div>
              ) : (
                <div className="overview-card-body">
                  <button
                    className="btn btn-sm"
                    onClick={() => navigate(card.path)}
                  >
                    Manage
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cross-references visualization */}
      {entityData && totalConfigured > 0 && (
        <CrossRefs
          agents={entityData.agents}
          hooks={entityData.hooks}
          skills={entityData.skills}
          mcpServers={entityData.mcpServers}
          memoryStores={entityData.memoryStores}
        />
      )}

      {/* Import from existing project wizard */}
      {showImportWizard && (
        <ImportWizard
          onClose={() => setShowImportWizard(false)}
          onImported={reloadData}
        />
      )}
    </div>
  );
}

function StatusIndicator({ label, ok }: { label: string; ok: boolean | undefined }) {
  return (
    <span className={`overview-status-indicator ${ok ? "ok" : "missing"}`}>
      <span className="overview-status-dot">{ok ? "\u2713" : "\u2717"}</span>
      {label}
    </span>
  );
}
