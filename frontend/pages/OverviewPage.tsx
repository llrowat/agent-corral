import { useEffect, useState, useCallback } from "react";
import type { Scope, RepoStatus, ClaudeDetection } from "@/types";
import * as api from "@/lib/tauri";
import { ConfigSummary } from "@/components/ConfigSummary";
import { ScopeBanner } from "@/components/ScopeGuard";

interface Props {
  scope: Scope | null;
}

export function OverviewPage({ scope }: Props) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [detection, setDetection] = useState<ClaudeDetection | null>(null);

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;
  const isGlobal = scope?.type === "global";

  const reloadDetection = useCallback(() => {
    if (!basePath) return;
    api.detectClaudeConfig(basePath).then(setDetection);
  }, [basePath]);

  useEffect(() => {
    if (!basePath) {
      setStatus(null);
      setDetection(null);
      return;
    }
    if (!isGlobal) {
      api.getRepoStatus(basePath).then(setStatus);
    } else {
      setStatus(null);
    }
    reloadDetection();
  }, [basePath, isGlobal, reloadDetection]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <h2>Welcome to AgentCorral</h2>
        <p>Select Global Settings or a repository to get started.</p>
      </div>
    );
  }

  const heading = isGlobal ? "Global Settings" : scope.repo.name;
  const pathDisplay = basePath;

  return (
    <div className="page overview-page">
      <h2>{heading}</h2>
      <p className="repo-path-display">{pathDisplay}</p>

      <ScopeBanner scope={scope} />

      {scope && <ConfigSummary scope={scope} key={basePath} />}

      <section className="overview-section">
        <h3>{isGlobal ? "Global Detection" : "Repo Status"}</h3>
        <div className="status-grid">
          {!isGlobal && (
            <>
              <StatusBadge label="Directory exists" ok={status?.exists} />
              <StatusBadge label="Git repo" ok={status?.is_git_repo} />
            </>
          )}
          <StatusBadge label="Claude config" ok={detection?.hasSettingsJson} />
          {!isGlobal && <StatusBadge label="CLAUDE.md" ok={detection?.hasClaudeMd} />}
          <StatusBadge label="Agents" ok={detection?.hasAgentsDir} />
          <StatusBadge label="Skills" ok={detection?.hasSkillsDir} />
          <StatusBadge label="MCP Servers" ok={detection?.hasMcpJson} />
          <StatusBadge
            label={`Hooks${detection?.hookCount ? ` (${detection.hookCount})` : ""}`}
            ok={detection?.hookCount !== undefined && detection.hookCount > 0}
          />
          <StatusBadge label="Memory" ok={detection?.hasMemoryDir} />
        </div>
      </section>
    </div>
  );
}

function StatusBadge({
  label,
  ok,
}: {
  label: string;
  ok: boolean | undefined;
}) {
  return (
    <div className={`status-badge ${ok ? "ok" : "missing"}`}>
      <span className="status-dot">{ok ? "\u2713" : "\u2717"}</span>
      <span>{label}</span>
    </div>
  );
}
