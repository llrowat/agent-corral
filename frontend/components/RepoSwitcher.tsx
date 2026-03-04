import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Repo } from "@/types";

interface RepoSwitcherProps {
  repos: Repo[];
  selected: Repo | null;
  onSelect: (repo: Repo | null) => void;
  onAdd: (path: string) => Promise<Repo>;
  onRemove: (repoId: string) => Promise<void>;
}

export function RepoSwitcher({
  repos,
  selected,
  onSelect,
  onAdd,
  onRemove,
}: RepoSwitcherProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [addPath, setAddPath] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = async () => {
    if (!addPath.trim()) return;
    try {
      const repo = await onAdd(addPath.trim());
      onSelect(repo);
      setAddPath("");
      setShowAddForm(false);
    } catch (e) {
      alert(`Failed to add repo: ${e}`);
    }
  };

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Repository Directory",
      });
      if (selected && typeof selected === "string") {
        setAddPath(selected);
        // Auto-add the selected directory
        try {
          const repo = await onAdd(selected);
          onSelect(repo);
          setAddPath("");
          setShowAddForm(false);
        } catch (e) {
          // Set the path so user can see it, but don't close the form
          alert(`Failed to add repo: ${e}`);
        }
      }
    } catch (e) {
      console.error("File picker error:", e);
    }
  };

  return (
    <div className="repo-switcher">
      <button
        className="repo-switcher-toggle"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        {selected ? selected.name : "Select Repository"}
        <span className="caret">{showDropdown ? "\u25B2" : "\u25BC"}</span>
      </button>

      {showDropdown && (
        <div className="repo-dropdown">
          {repos.map((repo) => (
            <div
              key={repo.repo_id}
              className={`repo-item ${
                selected?.repo_id === repo.repo_id ? "selected" : ""
              }`}
            >
              <button
                className="repo-item-select"
                onClick={() => {
                  onSelect(repo);
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
                    await onRemove(repo.repo_id);
                    if (selected?.repo_id === repo.repo_id) {
                      onSelect(null);
                    }
                  }
                }}
                title="Remove repo"
              >
                x
              </button>
            </div>
          ))}

          {repos.length === 0 && (
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
                <button onClick={handleBrowse} title="Browse for directory">Browse</button>
                <button onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            ) : (
              <div className="repo-add-buttons">
                <button
                  className="repo-add-button"
                  onClick={() => setShowAddForm(true)}
                >
                  + Add Repository
                </button>
                <button
                  className="repo-add-button"
                  onClick={handleBrowse}
                  title="Browse for repository directory"
                >
                  Browse...
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
