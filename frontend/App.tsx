import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { ScopeSwitcher } from "./components/ScopeSwitcher";
import { GlobalSearch } from "./components/GlobalSearch";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
import appIconSvg from "./assets/agent_corral_icon.svg";

function App() {
  const { repos, addRepo, removeRepo } = useRepos();
  useKeyboardShortcuts();
  const [scope, setScope] = useState<Scope | null>(null);
  const [homePath, setHomePath] = useState<string | null>(null);

  useEffect(() => {
    getClaudeHome().then(setHomePath).catch(() => {});
  }, []);

  // Key pages on scope identity so they fully remount on scope change,
  // preventing stale async state from causing blank renders.
  const scopeKey = scope?.type === "global"
    ? `global:${scope.homePath}`
    : scope?.type === "project"
      ? `project:${scope.repo.repo_id}`
      : "none";

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-brand">
          <div
            className="app-icon"
            role="img"
            aria-label="AgentCorral"
            style={{ maskImage: `url(${appIconSvg})`, WebkitMaskImage: `url(${appIconSvg})` }}
          />
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
          <ErrorBoundary key={scopeKey}>
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/overview" replace />}
            />
            <Route
              path="/overview"
              element={<OverviewPage key={scopeKey} scope={scope} homePath={homePath} />}
            />
            <Route
              path="/claude-md"
              element={<ClaudeMdPage key={scopeKey} scope={scope} homePath={homePath} />}
            />
            <Route
              path="/agents"
              element={<AgentsPage key={scopeKey} scope={scope} homePath={homePath} />}
            />
            <Route
              path="/hooks"
              element={<HooksPage key={scopeKey} scope={scope} homePath={homePath} />}
            />
            <Route
              path="/skills"
              element={<SkillsPage key={scopeKey} scope={scope} homePath={homePath} />}
            />
            <Route
              path="/mcp"
              element={<McpPage key={scopeKey} scope={scope} homePath={homePath} />}
            />
            <Route
              path="/config"
              element={<ConfigPage key={scopeKey} scope={scope} />}
            />
            <Route
              path="/memory"
              element={<MemoryPage key={scopeKey} scope={scope} homePath={homePath} />}
            />
            <Route
              path="/history"
              element={<HistoryPage key={scopeKey} scope={scope} />}
            />
            <Route path="/packs" element={<PacksPage key={scopeKey} scope={scope} />} />
            <Route path="/plugins" element={<PluginsPage key={scopeKey} scope={scope} />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          </ErrorBoundary>
        </main>
      </div>
      <GlobalSearch scope={scope} homePath={homePath} />
      <KeyboardShortcuts />
    </div>
  );
}

export default App;
