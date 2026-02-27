import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { RepoSwitcher } from "./components/RepoSwitcher";
import { OverviewPage } from "./pages/OverviewPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ConfigPage } from "./pages/ConfigPage";
import { MemoryPage } from "./pages/MemoryPage";
import { SessionsPage } from "./pages/SessionsPage";
import { PacksPage } from "./pages/PacksPage";
import { useRepos } from "./hooks/useRepos";
import type { Repo } from "./types";

function App() {
  const { repos, addRepo, removeRepo } = useRepos();
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-brand">
          <h1>AgentCorral</h1>
          <span className="app-subtitle">Claude Code Command Center</span>
        </div>
        <RepoSwitcher
          repos={repos}
          selected={selectedRepo}
          onSelect={setSelectedRepo}
          onAdd={addRepo}
          onRemove={removeRepo}
        />
      </header>
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/overview" replace />}
            />
            <Route
              path="/overview"
              element={<OverviewPage repo={selectedRepo} />}
            />
            <Route
              path="/agents"
              element={<AgentsPage repo={selectedRepo} />}
            />
            <Route
              path="/config"
              element={<ConfigPage repo={selectedRepo} />}
            />
            <Route
              path="/memory"
              element={<MemoryPage repo={selectedRepo} />}
            />
            <Route
              path="/sessions"
              element={<SessionsPage repo={selectedRepo} />}
            />
            <Route path="/packs" element={<PacksPage repo={selectedRepo} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
