import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { ScopeSwitcher } from "./components/ScopeSwitcher";
import { GlobalSearch } from "./components/GlobalSearch";
import { ThemeToggle } from "./components/ThemeToggle";
import { OverviewPage } from "./pages/OverviewPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ConfigPage } from "./pages/ConfigPage";
import { MemoryPage } from "./pages/MemoryPage";
import { HooksPage } from "./pages/HooksPage";
import { SkillsPage } from "./pages/SkillsPage";
import { McpPage } from "./pages/McpPage";
import { PacksPage } from "./pages/PacksPage";
import { PluginsPage } from "./pages/PluginsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ClaudeMdPage } from "./pages/ClaudeMdPage";
import { HistoryPage } from "./pages/HistoryPage";
import { useRepos } from "./hooks/useRepos";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { getClaudeHome } from "./lib/tauri";
import type { Scope } from "./types";
import appIcon from "./assets/agent_corral_icon.png";

function App() {
  const { repos, addRepo, removeRepo } = useRepos();
  useKeyboardShortcuts();
  const [scope, setScope] = useState<Scope | null>(null);
  const [homePath, setHomePath] = useState<string | null>(null);

  useEffect(() => {
    getClaudeHome().then(setHomePath).catch(() => {});
  }, []);

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-brand">
          <img src={appIcon} alt="" className="app-icon" />
          <h1>AgentCorral</h1>
          <span className="app-subtitle">Claude Code Configuration Management Studio</span>
        </div>
        <div className="app-header-actions">
          <ThemeToggle />
          <ScopeSwitcher
            repos={repos}
            scope={scope}
            onScopeChange={setScope}
            homePath={homePath}
            onAddRepo={addRepo}
            onRemoveRepo={removeRepo}
          />
        </div>
      </header>
      <div className="app-body">
        <Sidebar scope={scope} />
        <main className="app-main">
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/overview" replace />}
            />
            <Route
              path="/overview"
              element={<OverviewPage scope={scope} homePath={homePath} />}
            />
            <Route
              path="/claude-md"
              element={<ClaudeMdPage scope={scope} homePath={homePath} />}
            />
            <Route
              path="/agents"
              element={<AgentsPage scope={scope} homePath={homePath} />}
            />
            <Route
              path="/hooks"
              element={<HooksPage scope={scope} homePath={homePath} />}
            />
            <Route
              path="/skills"
              element={<SkillsPage scope={scope} homePath={homePath} />}
            />
            <Route
              path="/mcp"
              element={<McpPage scope={scope} homePath={homePath} />}
            />
            <Route
              path="/config"
              element={<ConfigPage scope={scope} />}
            />
            <Route
              path="/memory"
              element={<MemoryPage scope={scope} homePath={homePath} />}
            />
            <Route
              path="/history"
              element={<HistoryPage scope={scope} />}
            />
            <Route path="/packs" element={<PacksPage scope={scope} />} />
            <Route path="/plugins" element={<PluginsPage scope={scope} />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
      <GlobalSearch scope={scope} />
    </div>
  );
}

export default App;
