import { useEffect, useState, useCallback } from "react";
import type { Repo, MemoryStore, MemoryEntry } from "@/types";
import * as api from "@/lib/tauri";

interface Props {
  repo: Repo | null;
}

export function MemoryPage({ repo }: Props) {
  const [stores, setStores] = useState<MemoryStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<MemoryStore | null>(null);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [newEntry, setNewEntry] = useState("");

  const loadStores = useCallback(async () => {
    if (!repo) return;
    try {
      const result = await api.readMemoryStores(repo.path);
      setStores(result);
    } catch {
      setStores([]);
    }
  }, [repo]);

  useEffect(() => {
    setSelectedStore(null);
    setEntries([]);
    loadStores();
  }, [loadStores]);

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

  if (!repo) {
    return (
      <div className="page page-empty">
        <p>Select a repository to manage memory.</p>
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

  const handleReset = async () => {
    if (!selectedStore) return;
    if (
      !confirm(
        `Reset "${selectedStore.name}"? This will delete all ${selectedStore.entryCount} entries.`
      )
    )
      return;
    try {
      await api.resetMemory(selectedStore.path);
      await loadEntries(selectedStore);
      await loadStores();
    } catch (e) {
      alert(`Failed to reset memory: ${e}`);
    }
  };

  return (
    <div className="page memory-page">
      <h2>Memory Studio</h2>
      <div className="split-layout">
        <div className="panel-left">
          <div className="panel-header">
            <h3>Stores</h3>
          </div>
          <ul className="store-list">
            {stores.map((store) => (
              <li
                key={store.storeId}
                className={`store-item ${
                  selectedStore?.storeId === store.storeId ? "active" : ""
                }`}
              >
                <button onClick={() => setSelectedStore(store)}>
                  <span className="store-name">{store.name}</span>
                  <span className="store-count">
                    {store.entryCount} entries
                  </span>
                </button>
              </li>
            ))}
            {stores.length === 0 && (
              <li className="text-muted" style={{ padding: "12px" }}>
                No memory stores found
              </li>
            )}
          </ul>
        </div>

        <div className="panel-right">
          {!selectedStore ? (
            <div className="panel-empty">
              <p>Select a memory store to view entries.</p>
            </div>
          ) : (
            <div className="memory-detail">
              <div className="panel-header">
                <h3>{selectedStore.name}</h3>
                <button className="btn btn-danger" onClick={handleReset}>
                  Reset Store
                </button>
              </div>

              <div className="memory-entries">
                {entries.map((entry) => (
                  <div key={entry.key} className="memory-entry">
                    <span className="entry-key">{entry.key}</span>
                    <p className="entry-content">{entry.content}</p>
                  </div>
                ))}
                {entries.length === 0 && (
                  <p className="text-muted">No entries in this store.</p>
                )}
              </div>

              <div className="memory-add-entry">
                <textarea
                  rows={3}
                  value={newEntry}
                  onChange={(e) => setNewEntry(e.target.value)}
                  placeholder="Add a new memory entry..."
                />
                <button className="btn btn-primary" onClick={handleAddEntry}>
                  Add Entry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
