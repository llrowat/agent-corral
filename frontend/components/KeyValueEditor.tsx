import { useState } from "react";

interface KeyValueEditorProps {
  entries: Record<string, string>;
  onUpdate: (entries: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  emptyLabel?: string;
}

export function KeyValueEditor({
  entries,
  onUpdate,
  keyPlaceholder = "KEY",
  valuePlaceholder = "value",
  emptyLabel = "No entries",
}: KeyValueEditorProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleAdd = () => {
    const k = newKey.trim();
    if (k) {
      onUpdate({ ...entries, [k]: newValue.trim() });
      setNewKey("");
      setNewValue("");
    }
  };

  const handleRemove = (key: string) => {
    const updated = { ...entries };
    delete updated[key];
    onUpdate(updated);
  };

  const entryList = Object.entries(entries);

  return (
    <div className="kv-editor">
      {entryList.length > 0 ? (
        <div className="kv-list">
          {entryList.map(([k, v]) => (
            <div key={k} className="kv-entry">
              <code className="kv-key">{k}</code>
              <span className="kv-sep">=</span>
              <code className="kv-value">{v}</code>
              <button
                className="tag-remove"
                onClick={() => handleRemove(k)}
                aria-label={`Remove ${k}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      ) : (
        <span className="tag-empty">{emptyLabel}</span>
      )}
      <div className="kv-add-row">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={keyPlaceholder}
          className="kv-add-key"
        />
        <span className="kv-sep">=</span>
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={valuePlaceholder}
          className="kv-add-value"
        />
        <button className="btn btn-sm" onClick={handleAdd} disabled={!newKey.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}
