import { NavLink } from "react-router-dom";

const navItems = [
  { path: "/overview", label: "Overview", icon: "grid" },
  { path: "/agents", label: "Agents", icon: "bot" },
  { path: "/config", label: "Config", icon: "settings" },
  { path: "/memory", label: "Memory", icon: "database" },
  { path: "/sessions", label: "Sessions", icon: "terminal" },
  { path: "/packs", label: "Packs", icon: "package" },
];

export function Sidebar() {
  return (
    <nav className="sidebar">
      <ul>
        {navItems.map((item) => (
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
        ))}
      </ul>
    </nav>
  );
}

function getIcon(name: string): string {
  const icons: Record<string, string> = {
    grid: "\u25A6",
    bot: "\u2699",
    settings: "\u2638",
    database: "\u25C8",
    terminal: "\u25B6",
    package: "\u25A3",
  };
  return icons[name] ?? "\u25CF";
}
