import { useState } from "react";
import type { Repo, Scope } from "@/types";

interface ScopeSwitcherProps {
  repos: Repo[];
  scope: Scope | null;
  onScopeChange: (scope: Scope | null) => void;
  homePath: string | null;
  onAddRepo: (path: string) => Promise<Repo>;
  onRemoveRepo: (repoId: string) => Promise<void>;
}

export function ScopeSwitcher({
  repos,
  scope,
  onScopeChange,
  homePath,
  onAddRepo,
  onRemoveRepo,
}: ScopeSwitcherProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [addPath, setAddPath] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = async () => {
    if (!addPath.trim()) return;
    try {
      const repo = await onAddRepo(addPath.trim());
      onScopeChange({ type: "project", repo });
      setAddPath("");
      setShowAddForm(false);
    } catch (e) {
      alert(`Failed to add repo: ${e}`);
    }
  };

  const label = scope
    ? scope.type === "global"
      ? "Global Settings"
      : scope.repo.name
    : "Select Scope";

  const isGlobalSelected = scope?.type === "global";

  return (
    <div className="repo-switcher">
      <button
        className="repo-switcher-toggle"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        {scope?.type === "global" && <span className="scope-icon">{"\u25C6"} </span>}
        {label}
        <span className="caret">{showDropdown ? "\u25B2" : "\u25BC"}</span>
      </button>

      {showDropdown && (
        <div className="repo-dropdown">
          {homePath && (
            <div
              className={`repo-item ${isGlobalSelected ? "selected" : ""}`}
            >
              <button
                className="repo-item-select"
                onClick={() => {
                  onScopeChange({ type: "global", homePath });
                  setShowDropdown(false);
                }}
              >
                <span className="repo-name">{"\u25C6"} Global Settings</span>
                <span className="repo-path">{homePath}</span>
              </button>
            </div>
          )}

          {homePath && repos.length > 0 && (
            <div className="repo-dropdown-divider" />
          )}

          {repos.map((repo) => (
            <div
              key={repo.repo_id}
              className={`repo-item ${
                scope?.type === "project" && scope.repo.repo_id === repo.repo_id
                  ? "selected"
                  : ""
              }`}
            >
              <button
                className="repo-item-select"
                onClick={() => {
                  onScopeChange({ type: "project", repo });
                  setShowDropdown(false);
                }}
              >
                <span className="repo-name">{repo.name}</span>
                <span className="repo-path">{repo.path}</span>
              </button>
              <button
                className="repo-item-remove"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm(`Remove ${repo.name}?`)) {
                    await onRemoveRepo(repo.repo_id);
                    if (
                      scope?.type === "project" &&
                      scope.repo.repo_id === repo.repo_id
                    ) {
                      onScopeChange(null);
                    }
                  }
                }}
                title="Remove repo"
              >
                x
              </button>
            </div>
          ))}

          {repos.length === 0 && !homePath && (
            <div className="repo-empty">No repos added yet</div>
          )}

          <div className="repo-add-section">
            {showAddForm ? (
              <div className="repo-add-form">
                <input
                  type="text"
                  placeholder="/path/to/repo"
                  value={addPath}
                  onChange={(e) => setAddPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  autoFocus
                />
                <button onClick={handleAdd}>Add</button>
                <button onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            ) : (
              <button
                className="repo-add-button"
                onClick={() => setShowAddForm(true)}
              >
                + Add Repository
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
