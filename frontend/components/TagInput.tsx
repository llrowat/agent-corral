import { useState } from "react";

interface TagInputProps {
  tags: string[];
  onAdd: (value: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
  emptyLabel?: string;
}

export function TagInput({ tags, onAdd, onRemove, placeholder, emptyLabel }: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed);
      setInputValue("");
    }
  };

  return (
    <div className="tag-input-container">
      {tags.length > 0 ? (
        <div className="tag-list">
          {tags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
              <button
                className="tag-remove"
                onClick={() => onRemove(tag)}
                aria-label={`Remove ${tag}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      ) : (
        emptyLabel && <span className="tag-empty">{emptyLabel}</span>
      )}
      <div className="tag-add-row">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
        />
        <button className="btn btn-sm" onClick={handleAdd} disabled={!inputValue.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}
