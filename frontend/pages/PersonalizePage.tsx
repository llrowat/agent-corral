import { useState, useCallback } from "react";
import type { Scope, HistoryAnalysis, Agent, Skill } from "@/types";
import * as api from "@/lib/tauri";
import { useToast } from "@/components/Toast";

interface Props {
  scope: Scope | null;
  homePath?: string | null;
}

export function PersonalizePage({ scope, homePath }: Props) {
  const toast = useToast();
  const [analysis, setAnalysis] = useState<HistoryAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedAgents, setAppliedAgents] = useState<Set<string>>(new Set());
  const [appliedSkills, setAppliedSkills] = useState<Set<string>>(new Set());
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());

  const basePath =
    scope?.type === "global"
      ? scope.homePath
      : scope?.type === "project"
        ? scope.repo.path
        : null;

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.analyzeConversationHistory();
      setAnalysis(result);
      // Pre-select all suggested agents and skills
      setSelectedAgents(new Set(result.suggestedAgents.map((a) => a.agentId)));
      setSelectedSkills(new Set(result.suggestedSkills.map((s) => s.skillId)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleApplyAgent = useCallback(
    async (agent: Agent) => {
      if (!basePath) return;
      try {
        // Strip the "personalized" source marker so it saves as a local agent
        const localAgent = { ...agent, source: null, readOnly: null };
        await api.applyPersonalizedAgent(basePath, localAgent);
        setAppliedAgents((prev) => new Set([...prev, agent.agentId]));
        toast.success(`Agent "${agent.name}" applied`);
        window.dispatchEvent(new CustomEvent("sidebar-refresh"));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to apply agent: ${msg}`);
      }
    },
    [basePath, toast]
  );

  const handleApplySkill = useCallback(
    async (skill: Skill) => {
      if (!basePath) return;
      try {
        const localSkill = { ...skill, source: null, readOnly: null };
        await api.applyPersonalizedSkill(basePath, localSkill);
        setAppliedSkills((prev) => new Set([...prev, skill.skillId]));
        toast.success(`Skill "${skill.name}" applied`);
        window.dispatchEvent(new CustomEvent("sidebar-refresh"));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to apply skill: ${msg}`);
      }
    },
    [basePath, toast]
  );

  const handleApplySelected = useCallback(async () => {
    if (!basePath || !analysis) return;
    let applied = 0;
    for (const agent of analysis.suggestedAgents) {
      if (selectedAgents.has(agent.agentId) && !appliedAgents.has(agent.agentId)) {
        try {
          const localAgent = { ...agent, source: null, readOnly: null };
          await api.applyPersonalizedAgent(basePath, localAgent);
          setAppliedAgents((prev) => new Set([...prev, agent.agentId]));
          applied++;
        } catch { /* skip failures */ }
      }
    }
    for (const skill of analysis.suggestedSkills) {
      if (selectedSkills.has(skill.skillId) && !appliedSkills.has(skill.skillId)) {
        try {
          const localSkill = { ...skill, source: null, readOnly: null };
          await api.applyPersonalizedSkill(basePath, localSkill);
          setAppliedSkills((prev) => new Set([...prev, skill.skillId]));
          applied++;
        } catch { /* skip failures */ }
      }
    }
    if (applied > 0) {
      toast.success(`Applied ${applied} personalized config(s)`);
      window.dispatchEvent(new CustomEvent("sidebar-refresh"));
    }
  }, [basePath, analysis, selectedAgents, selectedSkills, appliedAgents, appliedSkills, toast]);

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!scope) {
    return (
      <div className="page personalize-page">
        <div className="page-header">
          <h2>Personalize from History</h2>
        </div>
        <p className="page-description">Select a scope to get started.</p>
      </div>
    );
  }

  const selectedCount =
    (analysis
      ? analysis.suggestedAgents.filter(
          (a) => selectedAgents.has(a.agentId) && !appliedAgents.has(a.agentId)
        ).length
      : 0) +
    (analysis
      ? analysis.suggestedSkills.filter(
          (s) => selectedSkills.has(s.skillId) && !appliedSkills.has(s.skillId)
        ).length
      : 0);

  return (
    <div className="page personalize-page">
      <div className="page-header">
        <h2>Personalize from History</h2>
        <p className="page-description">
          Analyze your Claude Code conversation history to generate customized
          agents and skills tailored to your workflow.
        </p>
      </div>

      {!analysis && !loading && (
        <div className="personalize-intro">
          <div className="personalize-intro-card">
            <h3>How it works</h3>
            <ol>
              <li>
                Scans your Claude Code conversation history at{" "}
                <code>~/.claude/projects/</code>
              </li>
              <li>
                Analyzes your prompts to identify common tasks, tools, and
                patterns
              </li>
              <li>
                Generates personalized agents and skills based on your actual
                usage
              </li>
              <li>
                You choose which suggestions to apply to your current{" "}
                {scope.type === "global" ? "global" : "project"} scope
              </li>
            </ol>
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={loading}
            >
              Analyze My History
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="personalize-loading">
          <div className="spinner" />
          <p>Analyzing your conversation history...</p>
        </div>
      )}

      {error && (
        <div className="personalize-error">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={handleAnalyze}>
            Retry
          </button>
        </div>
      )}

      {analysis && !loading && (
        <div className="personalize-results">
          {/* Stats summary */}
          <div className="personalize-stats">
            <div className="stat-card">
              <span className="stat-value">{analysis.conversationCount}</span>
              <span className="stat-label">Projects</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{analysis.messageCount}</span>
              <span className="stat-label">Messages Analyzed</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {analysis.topicCategories.length}
              </span>
              <span className="stat-label">Topic Categories</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {analysis.promptPatterns.length}
              </span>
              <span className="stat-label">Patterns Found</span>
            </div>
          </div>

          {/* Tool usage chart */}
          {analysis.toolUsage.length > 0 && (
            <section className="personalize-section">
              <h3>Tool Usage</h3>
              <div className="tool-usage-chart">
                {analysis.toolUsage.slice(0, 10).map((entry) => {
                  const maxCount = analysis.toolUsage[0]?.count || 1;
                  const pct = Math.round((entry.count / maxCount) * 100);
                  return (
                    <div key={entry.tool} className="tool-bar-row">
                      <span className="tool-bar-label">{entry.tool}</span>
                      <div className="tool-bar-track">
                        <div
                          className="tool-bar-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="tool-bar-count">{entry.count}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Topic categories */}
          {analysis.topicCategories.length > 0 && (
            <section className="personalize-section">
              <h3>Topic Categories</h3>
              <div className="category-tags">
                {analysis.topicCategories.map((cat) => (
                  <span key={cat.category} className="category-tag">
                    {cat.category}{" "}
                    <span className="category-count">({cat.count})</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Prompt patterns */}
          {analysis.promptPatterns.length > 0 && (
            <section className="personalize-section">
              <h3>Workflow Patterns</h3>
              <div className="pattern-list">
                {analysis.promptPatterns.map((p) => (
                  <div key={p.pattern} className="pattern-card">
                    <strong>{p.pattern}</strong>
                    <span className="pattern-freq">
                      {p.frequency}x
                    </span>
                    <p>{p.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Suggested Agents */}
          {analysis.suggestedAgents.length > 0 && (
            <section className="personalize-section">
              <h3>Suggested Agents</h3>
              <p className="section-hint">
                Select the agents you want to install, then click "Apply
                Selected" below.
              </p>
              <div className="suggestion-list">
                {analysis.suggestedAgents.map((agent) => {
                  const isApplied = appliedAgents.has(agent.agentId);
                  const isSelected = selectedAgents.has(agent.agentId);
                  return (
                    <div
                      key={agent.agentId}
                      className={`suggestion-card ${isApplied ? "applied" : ""} ${isSelected && !isApplied ? "selected" : ""}`}
                    >
                      <div className="suggestion-header">
                        {!isApplied && (
                          <label className="suggestion-check">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleAgent(agent.agentId)}
                            />
                          </label>
                        )}
                        <div className="suggestion-info">
                          <strong>{agent.name}</strong>
                          <span className="suggestion-id">{agent.agentId}</span>
                        </div>
                        <div className="suggestion-actions">
                          {isApplied ? (
                            <span className="badge badge-success">Applied</span>
                          ) : (
                            <button
                              className="btn btn-small btn-secondary"
                              onClick={() => handleApplyAgent(agent)}
                              disabled={!basePath}
                              title="Apply just this agent"
                            >
                              Apply
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="suggestion-desc">{agent.description}</p>
                      <div className="suggestion-tools">
                        {agent.tools.map((t) => (
                          <span key={t} className="tool-chip">
                            {t}
                          </span>
                        ))}
                      </div>
                      <details className="suggestion-prompt-details">
                        <summary>System prompt</summary>
                        <pre className="suggestion-prompt">
                          {agent.systemPrompt}
                        </pre>
                      </details>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Suggested Skills */}
          {analysis.suggestedSkills.length > 0 && (
            <section className="personalize-section">
              <h3>Suggested Skills</h3>
              <p className="section-hint">
                Select the skills you want to install, then click "Apply
                Selected" below.
              </p>
              <div className="suggestion-list">
                {analysis.suggestedSkills.map((skill) => {
                  const isApplied = appliedSkills.has(skill.skillId);
                  const isSelected = selectedSkills.has(skill.skillId);
                  return (
                    <div
                      key={skill.skillId}
                      className={`suggestion-card ${isApplied ? "applied" : ""} ${isSelected && !isApplied ? "selected" : ""}`}
                    >
                      <div className="suggestion-header">
                        {!isApplied && (
                          <label className="suggestion-check">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSkill(skill.skillId)}
                            />
                          </label>
                        )}
                        <div className="suggestion-info">
                          <strong>{skill.name}</strong>
                          <span className="suggestion-id">{skill.skillId}</span>
                          {skill.userInvocable && (
                            <span className="badge badge-info">
                              /{skill.skillId}
                            </span>
                          )}
                        </div>
                        <div className="suggestion-actions">
                          {isApplied ? (
                            <span className="badge badge-success">Applied</span>
                          ) : (
                            <button
                              className="btn btn-small btn-secondary"
                              onClick={() => handleApplySkill(skill)}
                              disabled={!basePath}
                              title="Apply just this skill"
                            >
                              Apply
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="suggestion-desc">
                        {skill.description ?? ""}
                      </p>
                      <div className="suggestion-tools">
                        {skill.allowedTools.map((t) => (
                          <span key={t} className="tool-chip">
                            {t}
                          </span>
                        ))}
                      </div>
                      <details className="suggestion-prompt-details">
                        <summary>Skill content</summary>
                        <pre className="suggestion-prompt">{skill.content}</pre>
                      </details>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Apply all / Re-analyze buttons */}
          <div className="personalize-actions">
            {selectedCount > 0 && (
              <button
                className="btn btn-primary"
                onClick={handleApplySelected}
                disabled={!basePath}
              >
                Apply Selected ({selectedCount})
              </button>
            )}
            <button className="btn btn-secondary" onClick={handleAnalyze}>
              Re-analyze
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
