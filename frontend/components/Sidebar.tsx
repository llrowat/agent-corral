import { NavLink } from "react-router-dom";
import type { Scope } from "@/types";
import type { ProjectScanResult } from "@/lib/tauri";

interface NavItem {
  path: string;
  label: string;
  icon: string;
  projectOnly?: boolean;
  countKey?: keyof ProjectScanResult;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "",
    items: [
      { path: "/overview", label: "Overview", icon: "grid" },
    ],
  },
  {
    label: "Claude Code",
    items: [
      { path: "/claude-md", label: "CLAUDE.md", icon: "doc", countKey: "claudeMdCount" },
      { path: "/settings", label: "Settings", icon: "settings", countKey: "settingsKeyCount" },
      { path: "/agents", label: "Agents", icon: "bot", countKey: "agentCount" },
      { path: "/hooks", label: "Hooks", icon: "hook", countKey: "hookCount" },
      { path: "/memory", label: "Memory", icon: "database", countKey: "memoryStoreCount" },
      { path: "/skills", label: "Skills", icon: "skill", countKey: "skillCount" },
      { path: "/mcp", label: "MCP Servers", icon: "mcp", countKey: "mcpServerCount" },
      { path: "/personalize", label: "Personalize", icon: "sparkle" },
    ],
  },
  {
    label: "App",
    items: [
      { path: "/plugins", label: "Export/Import", icon: "package" },
      { path: "/history", label: "History", icon: "history" },
      { path: "/preferences", label: "Preferences", icon: "wrench" },
    ],
  },
];

interface SidebarProps {
  scope: Scope | null;
  counts?: ProjectScanResult | null;
}

export function Sidebar({ scope, counts }: SidebarProps) {
  const isGlobal = scope?.type === "global";

  return (
    <nav className="sidebar">
      {navGroups.map((group) => (
        <div key={group.label || "_top"} className="sidebar-group">
          {group.label && (
            <div className="sidebar-group-label">{group.label}</div>
          )}
          <ul>
            {group.items.map((item) => {
              const count = item.countKey && counts ? counts[item.countKey] : undefined;
              const countDisplay = typeof count === "number" && count > 0 ? count : null;

              if (item.projectOnly && isGlobal) {
                return (
                  <li key={item.path}>
                    <span className="sidebar-link disabled">
                      <span className="sidebar-icon">{getIcon(item.icon)}</span>
                      <span className="sidebar-label">{item.label}</span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `sidebar-link ${isActive ? "active" : ""}`
                    }
                  >
                    <span className="sidebar-icon">{getIcon(item.icon)}</span>
                    <span className="sidebar-label">{item.label}</span>
                    {countDisplay !== null && (
                      <span className="sidebar-count">{countDisplay}</span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <button
        className="sidebar-shortcuts-btn"
        onClick={() => window.dispatchEvent(new CustomEvent("open-shortcuts"))}
        title="Keyboard shortcuts (?)"
      >
        <kbd>?</kbd> Keyboard shortcuts
      </button>
      <div className="sidebar-disclaimer">
        Not affiliated with or endorsed by Anthropic.
      </div>
    </nav>
  );
}

function getIcon(name: string): string {
  const icons: Record<string, string> = {
    grid: "\u25A6",
    bot: "\u2699",
    hook: "\u21AA",
    skill: "\u2726",
    mcp: "\u2302",
    settings: "\u2638",
    database: "\u25C8",
package: "\u25A3",
    template: "\u25B8",
    wrench: "\u2692",
    doc: "\u2263",
    history: "\u29D6",
    sparkle: "\u2728",
  };
  return icons[name] ?? "\u25CF";
}
