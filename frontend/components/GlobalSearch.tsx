import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Scope, Agent, HookEvent, Skill, McpServer, MemoryStore } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  scope: Scope | null;
}

interface SearchResult {
  type: "agent" | "hook" | "skill" | "mcp" | "memory" | "config" | "claudemd";
  label: string;
  description: string;
  path: string;
}

export function GlobalSearch({ scope }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allItems, setAllItems] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const basePath =
    scope?.type === "global"
      ? scope.homePath
      : scope?.type === "project"
        ? scope.repo.path
        : null;
  const isGlobal = scope?.type === "global";

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

  // Load all searchable items when scope changes
  const loadItems = useCallback(async () => {
    if (!basePath) {
      setAllItems([]);
      return;
    }

    const items: SearchResult[] = [];

    // Static navigation items
    items.push(
      { type: "config", label: "Config Studio", description: "Model, permissions, ignore patterns", path: "/config" },
      { type: "claudemd", label: "CLAUDE.md", description: "Project instructions", path: "/claude-md" },
    );

    try {
      const [agents, hooks, skills, mcpServers, memoryStores] = await Promise.all([
        api.readAgents(basePath).catch(() => [] as Agent[]),
        api.readHooks(basePath).catch(() => [] as HookEvent[]),
        api.readSkills(basePath).catch(() => [] as Skill[]),
        api.readMcpServers(basePath, isGlobal).catch(() => [] as McpServer[]),
        api.readMemoryStores(basePath).catch(() => [] as MemoryStore[]),
      ]);

      for (const agent of agents) {
        items.push({
          type: "agent",
          label: agent.name,
          description: `Agent: ${agent.agentId} — ${agent.description}`,
          path: "/agents",
        });
      }

      for (const hook of hooks) {
        const handlerCount = hook.groups.reduce((s, g) => s + g.hooks.length, 0);
        items.push({
          type: "hook",
          label: hook.event,
          description: `Hook: ${handlerCount} handler(s)`,
          path: "/hooks",
        });
      }

      for (const skill of skills) {
        items.push({
          type: "skill",
          label: skill.name,
          description: `Skill: ${skill.skillId}${skill.userInvocable ? " (invocable)" : ""}`,
          path: "/skills",
        });
      }

      for (const server of mcpServers) {
        items.push({
          type: "mcp",
          label: server.serverId,
          description: `MCP: ${server.serverType}${server.command ? ` — ${server.command}` : ""}`,
          path: "/mcp",
        });
      }

      for (const store of memoryStores) {
        items.push({
          type: "memory",
          label: store.name,
          description: `Memory: ${store.entryCount} entries`,
          path: "/memory",
        });
      }
    } catch {
      // Ignore load errors
    }

    setAllItems(items);
  }, [basePath, isGlobal]);

  useEffect(() => {
    if (open) loadItems();
  }, [open, loadItems]);

  // Filter results
  useEffect(() => {
    if (!query.trim()) {
      setResults(allItems.slice(0, 20));
    } else {
      const q = query.toLowerCase();
      const filtered = allItems.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      );
      setResults(filtered.slice(0, 20));
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
            placeholder="Search agents, skills, hooks, MCP servers..."
          />
          <kbd className="search-kbd">ESC</kbd>
        </div>
        <div className="search-results">
          {results.length === 0 ? (
            <div className="search-empty">
              {query ? "No results found" : "Start typing to search..."}
            </div>
          ) : (
            results.map((result, i) => (
              <button
                key={`${result.type}-${result.label}-${i}`}
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
