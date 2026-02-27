import { useState } from "react";

export function PacksPage() {
  const [activeTab, setActiveTab] = useState<"my" | "library">("my");

  return (
    <div className="page packs-page">
      <div className="page-header">
        <h2>Packs</h2>
        <div className="tab-bar">
          <button
            className={`btn btn-sm ${activeTab === "my" ? "active" : ""}`}
            onClick={() => setActiveTab("my")}
          >
            My Packs
          </button>
          <button
            className={`btn btn-sm ${activeTab === "library" ? "active" : ""}`}
            onClick={() => setActiveTab("library")}
          >
            Library
          </button>
        </div>
      </div>

      {activeTab === "my" ? (
        <div className="packs-section">
          <div className="packs-empty">
            <h3>No Packs Yet</h3>
            <p>
              Create a pack by exporting agents and config from a repository.
              Packs can be shared with your team to standardize Claude Code
              workflows.
            </p>
            <button className="btn btn-primary" disabled>
              Export Pack (Coming in Phase 4)
            </button>
          </div>
        </div>
      ) : (
        <div className="packs-section">
          <div className="packs-empty">
            <h3>Pack Library</h3>
            <p>
              Add a company library folder to automatically discover shared
              packs. Library packs can be imported into any repository.
            </p>
            <button className="btn" disabled>
              Add Library Folder (Coming in Phase 4)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
