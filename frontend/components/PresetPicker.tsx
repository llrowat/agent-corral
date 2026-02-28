interface PresetItem {
  id: string;
  label: string;
  description: string;
}

interface Props<T extends PresetItem> {
  title: string;
  presets: T[];
  onSelect: (preset: T) => void;
  onClose: () => void;
}

export function PresetPicker<T extends PresetItem>({
  title,
  presets,
  onSelect,
  onClose,
}: Props<T>) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          Pick a preset to start with. You can customize it after.
        </p>
        <div className="preset-list">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className="preset-item"
              onClick={() => {
                onSelect(preset);
                onClose();
              }}
            >
              <span className="preset-item-label">{preset.label}</span>
              <span className="preset-item-desc">{preset.description}</span>
            </button>
          ))}
        </div>
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
