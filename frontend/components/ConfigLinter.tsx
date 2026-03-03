import { useEffect, useState, useCallback, useMemo } from "react";
import type { Scope, LintResult, LintIssue } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope | null;
  homePath?: string | null;
}

type FilterSeverity = "all" | "error" | "warning" | "info";
type GroupBy = "category" | "severity" | "scope";

const SEVERITY_ICON: Record<string, string> = {
  error: "\u2717",
  warning: "\u26A0",
  info: "\u2139",
};

const CATEGORY_LABELS: Record<string, string> = {
  config: "Settings",
  agent: "Agents",
  hook: "Hooks",
  skill: "Skills",
  mcp: "MCP Servers",
  claudemd: "CLAUDE.md",
  hierarchy: "Hierarchy",
};

export function ConfigLinter({ scope, homePath }: Props) {
  const [result, setResult] = useState<LintResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("category");

  const basePath =
    scope?.type === "global"
      ? scope.homePath
      : scope?.type === "project"
        ? scope.repo.path
        : null;
  const isGlobal = scope?.type === "global";

  const runLint = useCallback(async () => {
    if (!basePath) return;
    setLoading(true);
    try {
      const globalPath = isGlobal ? null : homePath ?? null;
      const lintResult = await api.lintConfig(basePath, globalPath);
      setResult(lintResult);
    } catch {
      // Ignore lint errors — show empty state
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [basePath, isGlobal, homePath]);

  useEffect(() => {
    runLint();
  }, [runLint]);

  const filteredIssues = useMemo(() => {
    if (!result) return [];
    if (filterSeverity === "all") return result.issues;
    return result.issues.filter((i) => i.severity === filterSeverity);
  }, [result, filterSeverity]);

  const groupedIssues = useMemo(() => {
    const groups: Record<string, LintIssue[]> = {};
    for (const issue of filteredIssues) {
      let key: string;
      if (groupBy === "category") {
        key = issue.category;
      } else if (groupBy === "severity") {
        key = issue.severity;
      } else {
        key = issue.scope ?? "unscoped";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(issue);
    }
    return groups;
  }, [filteredIssues, groupBy]);

  const groupLabel = useCallback(
    (key: string) => {
      if (groupBy === "category") return CATEGORY_LABELS[key] || key;
      if (groupBy === "severity") {
        if (key === "error") return "Errors";
        if (key === "warning") return "Warnings";
        return "Suggestions";
      }
      if (key === "global") return "Global Scope";
      if (key === "project") return "Project Scope";
      return "General";
    },
    [groupBy]
  );

  if (!scope || loading) return null;

  const score = result?.score ?? 100;
  const errorCount = result?.errorCount ?? 0;
  const warningCount = result?.warningCount ?? 0;
  const infoCount = result?.infoCount ?? 0;
  const totalIssues = errorCount + warningCount + infoCount;

  const scoreColor =
    score >= 80
      ? "var(--success)"
      : score >= 50
        ? "var(--warning)"
        : "var(--danger)";

  return (
    <div className="config-linter" data-testid="config-linter">
      <button
        className="config-linter-toggle"
        onClick={() => setExpanded(!expanded)}
        data-testid="linter-toggle"
      >
        <span className={`toggle-arrow ${expanded ? "open" : ""}`}>
          &#9654;
        </span>
        <h3>Config Linter</h3>
        <span className="linter-score" style={{ color: scoreColor }}>
          {score}/100
        </span>
        {totalIssues > 0 && (
          <span className="linter-counts">
            {errorCount > 0 && (
              <span className="linter-count-error" data-testid="error-count">
                {errorCount} error{errorCount !== 1 ? "s" : ""}
              </span>
            )}
            {warningCount > 0 && (
              <span className="linter-count-warning" data-testid="warning-count">
                {warningCount} warning{warningCount !== 1 ? "s" : ""}
              </span>
            )}
            {infoCount > 0 && (
              <span className="linter-count-info" data-testid="info-count">
                {infoCount} suggestion{infoCount !== 1 ? "s" : ""}
              </span>
            )}
          </span>
        )}
        {totalIssues === 0 && (
          <span style={{ color: "var(--success)", marginLeft: 8 }}>
            All good!
          </span>
        )}
      </button>

      {expanded && (
        <div className="linter-body" data-testid="linter-body">
          {/* Toolbar */}
          {totalIssues > 0 && (
            <div className="linter-toolbar">
              <div className="linter-filters">
                <span className="linter-filter-label">Show:</span>
                {(["all", "error", "warning", "info"] as const).map((sev) => (
                  <button
                    key={sev}
                    className={`linter-filter-btn ${filterSeverity === sev ? "active" : ""}`}
                    onClick={() => setFilterSeverity(sev)}
                    data-testid={`filter-${sev}`}
                  >
                    {sev === "all" ? "All" : sev === "info" ? "Info" : sev.charAt(0).toUpperCase() + sev.slice(1)}
                    {sev !== "all" && (
                      <span className="linter-filter-count">
                        {sev === "error" ? errorCount : sev === "warning" ? warningCount : infoCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="linter-group-by">
                <span className="linter-filter-label">Group:</span>
                {(["category", "severity", "scope"] as const).map((g) => (
                  <button
                    key={g}
                    className={`linter-filter-btn ${groupBy === g ? "active" : ""}`}
                    onClick={() => setGroupBy(g)}
                    data-testid={`group-${g}`}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-sm"
                onClick={runLint}
                disabled={loading}
                data-testid="rerun-lint"
              >
                Re-run
              </button>
            </div>
          )}

          {/* Issue groups */}
          {filteredIssues.length === 0 && totalIssues > 0 && (
            <p className="linter-empty">No issues match the current filter.</p>
          )}

          {Object.entries(groupedIssues).map(([groupKey, groupIssues]) => (
            <div key={groupKey} className="linter-group" data-testid={`group-${groupKey}`}>
              <h4 className="linter-group-heading">
                {groupLabel(groupKey)}
                <span className="linter-group-count">({groupIssues.length})</span>
              </h4>
              {groupIssues.map((issue, i) => (
                <div
                  key={`${issue.rule}-${issue.entityId ?? ""}-${i}`}
                  className={`linter-issue linter-issue-${issue.severity}`}
                  data-testid={`issue-${issue.rule}`}
                >
                  <span className="linter-issue-icon">
                    {SEVERITY_ICON[issue.severity] || "\u2139"}
                  </span>
                  <div className="linter-issue-body">
                    <div className="linter-issue-header">
                      <span className="linter-issue-rule">{issue.rule}</span>
                      {issue.scope && (
                        <span className={`linter-issue-scope linter-scope-${issue.scope}`}>
                          {issue.scope}
                        </span>
                      )}
                    </div>
                    <span className="linter-issue-message">{issue.message}</span>
                    {issue.fix && (
                      <span className="linter-issue-fix">{issue.fix}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {totalIssues === 0 && (
            <p className="linter-all-good">
              No issues found. Your configuration looks great!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
