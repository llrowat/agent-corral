import { useEffect, useState, useCallback } from "react";
import type { Scope, MemoryStore, MemoryEntry } from "@/types";
import * as api from "@/lib/tauri";
import { DocsLink } from "@/components/DocsLink";

interface Props {
  scope: Scope | null;
  homePath: string | null;
}

export function MemoryPage({ scope, homePath }: Props) {
  const [stores, setStores] = useState<MemoryStore[]>([]);
  const [globalStores, setGlobalStores] = useState<MemoryStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<MemoryStore | null>(null);
  const [selectedIsGlobal, setSelectedIsGlobal] = useState(false);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [newEntry, setNewEntry] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");

  const basePath = scope?.type === "global" ? scope.homePath : scope?.type === "project" ? scope.repo.path : null;
  const isProjectScope = scope?.type === "project";

  const loadStores = useCallback(async () => {
    if (!basePath) return;
    try {
      const result = await api.readMemoryStores(basePath);
      setStores(result);
    } catch {
      setStores([]);
    }
  }, [basePath]);

  const loadGlobalStores = useCallback(async () => {
    if (!isProjectScope || !homePath) {
      setGlobalStores([]);
      return;
    }
    try {
      const result = await api.readMemoryStores(homePath);
      setGlobalStores(result);
    } catch {
      setGlobalStores([]);
    }
  }, [isProjectScope, homePath]);

  useEffect(() => {
    setSelectedStore(null);
    setSelectedIsGlobal(false);
    setEntries([]);
    setEditingIndex(null);
    loadStores();
    loadGlobalStores();
  }, [loadStores, loadGlobalStores]);

  const loadEntries = useCallback(async (store: MemoryStore) => {
    try {
      const result = await api.readMemoryEntries(store.path);
      setEntries(result);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    if (selectedStore) {
      loadEntries(selectedStore);
    }
  }, [selectedStore, loadEntries]);

  if (!scope) {
    return (
      <div className="page page-empty">
        <p>Select a scope to manage memory.</p>
      </div>
    );
  }

  const handleAddEntry = async () => {
    if (!selectedStore || !newEntry.trim()) return;
    try {
      await api.writeMemoryEntry(selectedStore.path, {
        key: `entry_${Date.now()}`,
        content: newEntry.trim(),
      });
      setNewEntry("");
      await loadEntries(selectedStore);
      await loadStores();
    } catch (e) {
      alert(`Failed to add entry: ${e}`);
    }
  };

  const handleUpdateEntry = async (index: number) => {
    if (!selectedStore || !editContent.trim()) return;
    try {
      await api.updateMemoryEntry(selectedStore.path, index, editContent.trim());
      setEditingIndex(null);
      setEditContent("");
      await loadEntries(selectedStore);
      await loadStores();
    } catch (e) {
      alert(`Failed to update entry: ${e}`);
    }
  };

  const handleDeleteEntry = async (index: number) => {
    if (!selectedStore) return;
    try {
      await api.deleteMemoryEntry(selectedStore.path, index);
      await loadEntries(selectedStore);
      await loadStores();
    } catch (e) {
      alert(`Failed to delete entry: ${e}`);
    }
  };

  const handleReset = async () => {
    if (!selectedStore) return;
    try {
      await api.resetMemory(selectedStore.path);
      await loadEntries(selectedStore);
      await loadStores();
    } catch (e) {
      alert(`Failed to reset memory: ${e}`);
    }
  };

  const handleDeleteStore = async () => {
    if (!selectedStore) return;
    try {
      await api.deleteMemoryStore(selectedStore.path);
      setSelectedStore(null);
      setEntries([]);
      await loadStores();
    } catch (e) {
      alert(`Failed to delete store: ${e}`);
    }
  };

  const handleCreateStore = async () => {
    if (!basePath || !newStoreName.trim()) return;
    if (!/^[a-z0-9-]+$/.test(newStoreName.trim())) {
      alert("Store name must be a lowercase slug (letters, numbers, hyphens)");
      return;
    }
    try {
      const store = await api.createMemoryStore(basePath, newStoreName.trim());
      setNewStoreName("");
      setShowCreateStore(false);
      await loadStores();
      setSelectedStore(store);
    } catch (e) {
      alert(`Failed to create store: ${e}`);
    }
  };

  return (
    <div className="page memory-page">
      <h2>Memory Studio <DocsLink page="memory" /></h2>
      <p className="page-description">Persistent notes that Claude Code can read and write across sessions. Organize entries into named stores to capture project conventions, learned preferences, or any context you want Claude to remember.</p>
      <div className="split-layout">
        <div className="panel-left">
          <div className="panel-header">
            <h3>Stores</h3>
            <button
              className="btn btn-sm"
              onClick={() => setShowCreateStore(!showCreateStore)}
            >
              + New
            </button>
          </div>
          {showCreateStore && (
            <div className="store-create-form">
              <input
                type="text"
                placeholder="store-name"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateStore()}
                autoFocus
              />
              <div className="store-create-actions">
                <button className="btn btn-sm btn-primary" onClick={handleCreateStore}>
                  Create
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setShowCreateStore(false);
                    setNewStoreName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <ul className="store-list">
            {stores.map((store) => (
              <li
                key={store.storeId}
                className={`store-item ${
                  selectedStore?.storeId === store.storeId && !selectedIsGlobal ? "active" : ""
                }`}
              >
                <button onClick={() => { setSelectedStore(store); setSelectedIsGlobal(false); setEditingIndex(null); }}>
                  <span className="store-name">{store.name}</span>
                  <span className="store-count">
                    {store.entryCount} entries
                  </span>
                </button>
              </li>
            ))}
            {stores.length === 0 && !isProjectScope && (
              <li className="list-empty">
                No memory stores found
              </li>
            )}
            {isProjectScope && stores.length === 0 && globalStores.length === 0 && (
              <li className="list-empty">
                No memory stores found
              </li>
            )}
          </ul>
          {isProjectScope && globalStores.length > 0 && (
            <>
              <div className="global-section-header">
                <span className="global-section-label">Global</span>
              </div>
              <ul className="store-list">
                {globalStores.map((store) => (
                  <li
                    key={`global-${store.storeId}`}
                    className={`store-item global-item ${
                      selectedStore?.storeId === store.storeId && selectedIsGlobal ? "active" : ""
                    }`}
                  >
                    <button onClick={() => { setSelectedStore(store); setSelectedIsGlobal(true); setEditingIndex(null); }}>
                      <span className="store-name">
                        {store.name}
                        <span className="badge-global">global</span>
                      </span>
                      <span className="store-count">
                        {store.entryCount} entries
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="panel-right">
          {!selectedStore ? (
            <div className="panel-empty">
              <p>Select a memory store to view entries.</p>
            </div>
          ) : (
            <div className="memory-detail">
              <div className="panel-header">
                <h3>
                  {selectedStore.name}
                  {selectedIsGlobal && <span className="badge-global">global</span>}
                </h3>
                {!selectedIsGlobal && (
                  <div className="header-actions">
                    <button className="btn btn-sm" onClick={handleReset}>
                      Reset
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={handleDeleteStore}>
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {selectedIsGlobal && (
                <p className="global-readonly-hint">
                  This memory store is defined in the global scope. Switch to Global Settings to edit it.
                </p>
              )}

              <div className="memory-entries">
                {entries.map((entry, index) => (
                  <div key={entry.key} className="memory-entry">
                    <div className="entry-header">
                      <span className="entry-key">#{index + 1}</span>
                      {!selectedIsGlobal && (
                        <div className="entry-actions">
                          {editingIndex !== index && (
                            <>
                              <button
                                className="btn-icon"
                                onClick={() => {
                                  setEditingIndex(index);
                                  setEditContent(entry.content);
                                }}
                                title="Edit"
                              >
                                E
                              </button>
                              <button
                                className="btn-icon"
                                onClick={() => handleDeleteEntry(index)}
                                title="Delete"
                              >
                                x
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {editingIndex === index && !selectedIsGlobal ? (
                      <div className="entry-edit">
                        <textarea
                          rows={3}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          autoFocus
                        />
                        <div className="entry-edit-actions">
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleUpdateEntry(index)}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => {
                              setEditingIndex(null);
                              setEditContent("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="entry-content">{entry.content}</p>
                    )}
                  </div>
                ))}
                {entries.length === 0 && (
                  <p className="text-muted">No entries in this store.</p>
                )}
              </div>

              {!selectedIsGlobal && (
                <div className="memory-add-entry">
                  <textarea
                    rows={3}
                    value={newEntry}
                    onChange={(e) => setNewEntry(e.target.value)}
                    placeholder="Add a new memory entry..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        handleAddEntry();
                      }
                    }}
                  />
                  <button className="btn btn-primary" onClick={handleAddEntry}>
                    Add Entry
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
