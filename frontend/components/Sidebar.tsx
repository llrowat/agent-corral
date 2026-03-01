import { NavLink } from "react-router-dom";
import type { Scope } from "@/types";

interface NavItem {
  path: string;
  label: string;
  icon: string;
  projectOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Project",
    items: [
      { path: "/overview", label: "Overview", icon: "grid" },
      { path: "/sessions", label: "Sessions", icon: "terminal" },
    ],
  },
  {
    label: "Claude Code",
    items: [
      { path: "/config", label: "Config", icon: "settings" },
      { path: "/agents", label: "Agents", icon: "bot" },
      { path: "/hooks", label: "Hooks", icon: "hook" },
      { path: "/memory", label: "Memory", icon: "database" },
      { path: "/skills", label: "Skills", icon: "skill" },
      { path: "/mcp", label: "MCP Servers", icon: "mcp" },
    ],
  },
  {
    label: "App",
    items: [
      { path: "/plugins", label: "Plugins", icon: "package" },
      { path: "/settings", label: "Settings", icon: "wrench" },
    ],
  },
];

interface SidebarProps {
  scope: Scope | null;
}

export function Sidebar({ scope }: SidebarProps) {
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
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
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
    terminal: "\u25B6",
    package: "\u25A3",
    template: "\u25B8",
    wrench: "\u2692",
  };
  return icons[name] ?? "\u25CF";
}
