import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Scope, Agent, HookEvent, Skill, McpServer, MemoryStore, PluginSummary } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope | null;
  homePath: string | null;
}

interface SearchResult {
  type: "agent" | "hook" | "skill" | "mcp" | "memory" | "config" | "claudemd" | "plugin" | "history" | "overview" | "settings";
  label: string;
  description: string;
  path: string;
  scope?: "project" | "global";
}

/** Load entities from a single base path and tag them with scope */
async function loadScopeItems(
  basePath: string,
  isGlobal: boolean,
  scopeLabel: "project" | "global",
): Promise<SearchResult[]> {
  const items: SearchResult[] = [];

  const [agents, hooks, skills, mcpServers, memoryStores, snapshots] = await Promise.all([
    api.readAgents(basePath).catch(() => [] as Agent[]),
    api.readHooks(basePath).catch(() => [] as HookEvent[]),
    api.readSkills(basePath).catch(() => [] as Skill[]),
    api.readMcpServers(basePath, isGlobal).catch(() => [] as McpServer[]),
    api.readMemoryStores(basePath).catch(() => [] as MemoryStore[]),
    api.listConfigSnapshots(basePath).catch(() => [] as api.ConfigSnapshotSummary[]),
  ]);

  for (const agent of agents) {
    items.push({
      type: "agent",
      label: agent.name,
      description: `Agent: ${agent.agentId} — ${agent.description}`,
      path: "/agents",
      scope: scopeLabel,
    });
  }

  for (const hook of hooks) {
    const handlerCount = (hook.groups || []).reduce((s: number, g: { hooks: unknown[] }) => s + g.hooks.length, 0);
    items.push({
      type: "hook",
      label: hook.event,
      description: `Hook: ${handlerCount} handler(s)`,
      path: "/hooks",
      scope: scopeLabel,
    });
  }

  for (const skill of skills) {
    items.push({
      type: "skill",
      label: skill.name,
      description: `Skill: ${skill.skillId}${skill.userInvocable ? " (invocable)" : ""}`,
      path: "/skills",
      scope: scopeLabel,
    });
  }

  for (const server of mcpServers) {
    items.push({
      type: "mcp",
      label: server.serverId,
      description: `MCP: ${server.serverType}${server.command ? ` — ${server.command}` : ""}`,
      path: "/mcp",
      scope: scopeLabel,
    });
  }

  for (const store of memoryStores) {
    items.push({
      type: "memory",
      label: store.name,
      description: `Memory: ${store.entryCount} entries`,
      path: "/memory",
      scope: scopeLabel,
    });
  }

  for (const snapshot of snapshots) {
    items.push({
      type: "history",
      label: snapshot.label,
      description: `Snapshot: ${snapshot.timestamp}`,
      path: "/history",
      scope: scopeLabel,
    });
  }

  return items;
}

export function GlobalSearch({ scope, homePath }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allItems, setAllItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const projectPath = scope?.type === "project" ? scope.repo.path : null;
  const globalPath = scope?.type === "global" ? scope.homePath : homePath;

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Load all searchable items from both scopes when modal opens
  useEffect(() => {
    if (!open) return;

    // Need at least one path to search
    if (!projectPath && !globalPath) {
      setAllItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const staticItems: SearchResult[] = [
      { type: "overview", label: "Overview", description: "Dashboard with configuration summary", path: "/overview" },
      { type: "config", label: "Settings Studio", description: "Model, permissions, ignore patterns", path: "/config" },
      { type: "claudemd", label: "CLAUDE.md", description: "Project instructions", path: "/claude-md" },
      { type: "plugin", label: "Plugins", description: "Plugin management and import", path: "/plugins" },
      { type: "history", label: "History", description: "Configuration snapshots and history", path: "/history" },
      { type: "settings", label: "Settings", description: "App preferences", path: "/settings" },
    ];

    const loadAll = async () => {
      const items: SearchResult[] = [...staticItems];

      // Load from both scopes in parallel
      const scopeLoads: Promise<SearchResult[]>[] = [];

      if (projectPath) {
        scopeLoads.push(loadScopeItems(projectPath, false, "project"));
      }
      if (globalPath) {
        scopeLoads.push(loadScopeItems(globalPath, true, "global"));
      }

      // Plugins are scope-independent
      const pluginsPromise = api.listPlugins().catch(() => [] as PluginSummary[]);

      const [scopeResults, plugins] = await Promise.all([
        Promise.all(scopeLoads),
        pluginsPromise,
      ]);

      for (const scopeItems of scopeResults) {
        items.push(...scopeItems);
      }

      for (const plugin of plugins) {
        items.push({
          type: "plugin",
          label: plugin.name,
          description: `Plugin: ${plugin.description || plugin.pluginId}`,
          path: "/plugins",
        });
      }

      if (!cancelled) {
        setAllItems(items);
        setLoading(false);
      }
    };

    loadAll();
    return () => { cancelled = true; };
  }, [open, projectPath, globalPath]);

  // Filter results
  useEffect(() => {
    if (!query.trim()) {
      setResults(allItems);
    } else {
      const q = query.toLowerCase();
      const filtered = allItems.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      );
      setResults(filtered);
    }
    setSelectedIndex(0);
  }, [query, allItems]);

  const handleSelect = (result: SearchResult) => {
    navigate(result.path);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  const ICONS: Record<string, string> = {
    agent: "\u2699",
    hook: "\u21AA",
    skill: "\u2726",
    mcp: "\u2302",
    memory: "\u25C8",
    config: "\u2638",
    claudemd: "\u2263",
    plugin: "\u25A3",
    history: "\u29D6",
    overview: "\u25A6",
    settings: "\u2692",
  };

  if (!open) return null;

  return (
    <div className="search-overlay" onClick={() => setOpen(false)}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <span className="search-icon">/</span>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search agents, skills, hooks, MCP, plugins..."
          />
          <kbd className="search-kbd">ESC</kbd>
        </div>
        <div className="search-results">
          {loading ? (
            <div className="search-empty">Loading...</div>
          ) : results.length === 0 ? (
            <div className="search-empty">
              {query ? "No results found" : "No items found"}
            </div>
          ) : (
            results.map((result, i) => (
              <button
                key={`${result.type}-${result.label}-${result.scope || ""}-${i}`}
                className={`search-result ${i === selectedIndex ? "search-result-active" : ""}`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="search-result-icon">
                  {ICONS[result.type] || "?"}
                </span>
                <div className="search-result-text">
                  <span className="search-result-label">{result.label}</span>
                  <span className="search-result-desc">{result.description}</span>
                </div>
                {result.scope && (
                  <span className="search-result-scope">{result.scope}</span>
                )}
                <span className="search-result-type">{result.type}</span>
              </button>
            ))
          )}
        </div>
        <div className="search-footer">
          <span>
            <kbd>&uarr;</kbd> <kbd>&darr;</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> select
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
