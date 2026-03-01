import { useState, useMemo } from "react";
import type { Agent, HookEvent, Skill, McpServer, MemoryStore } from "@/types";

interface Props {
  agents: Agent[];
  hooks: HookEvent[];
  skills: Skill[];
  mcpServers: McpServer[];
  memoryStores: MemoryStore[];
}

interface AgentMemoryRef {
  agentId: string;
  agentName: string;
  memoryStoreId: string;
  exists: boolean;
}

interface AgentToolRef {
  agentId: string;
  agentName: string;
  tools: string[];
}

interface HookCoverageItem {
  event: string;
  groupCount: number;
  matchers: (string | null)[];
  handlerCount: number;
}

interface SkillAgentRef {
  skillId: string;
  skillName: string;
  agentId: string;
  exists: boolean;
}

interface OrphanedEntities {
  unlinkedMemoryStores: MemoryStore[];
  emptySkills: Skill[];
  agentsWithNoTools: Agent[];
}

function analyzeRefs(props: Props) {
  const { agents, hooks, skills, memoryStores } = props;

  const memoryStoreIds = new Set(memoryStores.map((m) => m.storeId));
  const agentIds = new Set(agents.map((a) => a.agentId));

  // Agent -> Memory refs
  const agentMemoryRefs: AgentMemoryRef[] = agents
    .filter((a) => a.memory)
    .map((a) => ({
      agentId: a.agentId,
      agentName: a.name,
      memoryStoreId: a.memory!,
      exists: memoryStoreIds.has(a.memory!),
    }));

  // Agent -> Tools refs
  const agentToolRefs: AgentToolRef[] = agents
    .filter((a) => a.tools.length > 0)
    .map((a) => ({
      agentId: a.agentId,
      agentName: a.name,
      tools: a.tools,
    }));

  // Hook coverage
  const hookCoverage: HookCoverageItem[] = hooks.map((h) => ({
    event: h.event,
    groupCount: h.groups.length,
    matchers: h.groups.map((g) => g.matcher ?? null),
    handlerCount: h.groups.reduce((sum, g) => sum + g.hooks.length, 0),
  }));

  // Skill -> Agent refs
  const skillAgentRefs: SkillAgentRef[] = skills
    .filter((s) => s.agent)
    .map((s) => ({
      skillId: s.skillId,
      skillName: s.name,
      agentId: s.agent!,
      exists: agentIds.has(s.agent!),
    }));

  // Orphaned entities
  const boundMemoryIds = new Set(
    agents.filter((a) => a.memory).map((a) => a.memory!)
  );
  const orphaned: OrphanedEntities = {
    unlinkedMemoryStores: memoryStores.filter(
      (m) => !boundMemoryIds.has(m.storeId)
    ),
    emptySkills: skills.filter((s) => !s.content || s.content.trim() === ""),
    agentsWithNoTools: agents.filter((a) => a.tools.length === 0),
  };

  return { agentMemoryRefs, agentToolRefs, hookCoverage, skillAgentRefs, orphaned };
}

export function CrossRefs(props: Props) {
  const [expanded, setExpanded] = useState(false);

  const { agentMemoryRefs, agentToolRefs, hookCoverage, skillAgentRefs, orphaned } =
    useMemo(() => analyzeRefs(props), [props]);

  const hasAnyContent =
    agentMemoryRefs.length > 0 ||
    agentToolRefs.length > 0 ||
    hookCoverage.length > 0 ||
    skillAgentRefs.length > 0 ||
    orphaned.unlinkedMemoryStores.length > 0 ||
    orphaned.emptySkills.length > 0 ||
    orphaned.agentsWithNoTools.length > 0;

  if (!hasAnyContent) {
    return null;
  }

  const warningCount =
    agentMemoryRefs.filter((r) => !r.exists).length +
    skillAgentRefs.filter((r) => !r.exists).length;

  const orphanCount =
    orphaned.unlinkedMemoryStores.length +
    orphaned.emptySkills.length +
    orphaned.agentsWithNoTools.length;

  return (
    <div className="cross-refs">
      <button
        className="cross-refs-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`toggle-arrow ${expanded ? "open" : ""}`}>&#9654;</span>
        Cross-References
        {warningCount > 0 && (
          <span className="cross-ref-warning">
            {warningCount} warning{warningCount !== 1 ? "s" : ""}
          </span>
        )}
        {orphanCount > 0 && (
          <span className="cross-ref-orphan">
            {orphanCount} orphan{orphanCount !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          {/* Agent -> Memory section */}
          {agentMemoryRefs.length > 0 && (
            <div className="cross-refs-section">
              <h4>Agent &rarr; Memory</h4>
              {agentMemoryRefs.map((ref) => (
                <div className="cross-ref-item" key={`${ref.agentId}-${ref.memoryStoreId}`}>
                  <span>{ref.agentName}</span>
                  <span className="cross-ref-arrow">&rarr;</span>
                  <span>{ref.memoryStoreId}</span>
                  {!ref.exists && (
                    <span className="cross-ref-warning" title="Memory store not found">
                      (dangling reference)
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Agent -> Tools section */}
          {agentToolRefs.length > 0 && (
            <div className="cross-refs-section">
              <h4>Agent &rarr; Tools</h4>
              {agentToolRefs.map((ref) => (
                <div className="cross-ref-item" key={ref.agentId}>
                  <span>{ref.agentName}</span>
                  <span className="cross-ref-arrow">&rarr;</span>
                  <span>{ref.tools.join(", ")}</span>
                </div>
              ))}
            </div>
          )}

          {/* Hook Coverage section */}
          {hookCoverage.length > 0 && (
            <div className="cross-refs-section">
              <h4>Hook Coverage</h4>
              {hookCoverage.map((item) => (
                <div className="cross-ref-item" key={item.event}>
                  <span>{item.event}</span>
                  <span className="cross-ref-arrow">:</span>
                  <span>
                    {item.handlerCount} handler{item.handlerCount !== 1 ? "s" : ""}
                    {item.matchers.some((m) => m !== null) && (
                      <> (matchers: {item.matchers.filter((m) => m !== null).join(", ")})</>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Skill -> Agent section */}
          {skillAgentRefs.length > 0 && (
            <div className="cross-refs-section">
              <h4>Skill &rarr; Agent</h4>
              {skillAgentRefs.map((ref) => (
                <div className="cross-ref-item" key={`${ref.skillId}-${ref.agentId}`}>
                  <span>{ref.skillName}</span>
                  <span className="cross-ref-arrow">&rarr;</span>
                  <span>{ref.agentId}</span>
                  {!ref.exists && (
                    <span className="cross-ref-warning" title="Agent not found">
                      (nonexistent agent)
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Orphaned Entities section */}
          {orphanCount > 0 && (
            <div className="cross-refs-section">
              <h4>Orphaned Entities</h4>
              {orphaned.unlinkedMemoryStores.map((m) => (
                <div className="cross-ref-item" key={`orphan-mem-${m.storeId}`}>
                  <span className="cross-ref-orphan">
                    Memory store "{m.name}" is not bound to any agent
                  </span>
                </div>
              ))}
              {orphaned.emptySkills.map((s) => (
                <div className="cross-ref-item" key={`orphan-skill-${s.skillId}`}>
                  <span className="cross-ref-orphan">
                    Skill "{s.name}" has empty content
                  </span>
                </div>
              ))}
              {orphaned.agentsWithNoTools.map((a) => (
                <div className="cross-ref-item" key={`orphan-agent-${a.agentId}`}>
                  <span className="cross-ref-orphan">
                    Agent "{a.name}" has no tools configured
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
