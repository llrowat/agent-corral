import { useState, useEffect } from "react";
import { getPreferences, setPluginSyncInterval, setExportDir, getPlatform } from "@/lib/tauri";

export function SettingsPage() {
  const [syncInterval, setSyncInterval] = useState<number>(30);
  const [exportDirValue, setExportDirValue] = useState<string>("");
  const [platform, setPlatform] = useState<string>("linux");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPlatform()
      .then((p) => setPlatform(p))
      .catch(() => {});
    getPreferences()
      .then((prefs) => {
        setSyncInterval(prefs.plugin_sync_interval_minutes);
        setExportDirValue(prefs.export_dir ?? "");
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await setPluginSyncInterval(syncInterval);
      await setExportDir(exportDirValue.trim() || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save preference:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h2>Preferences</h2>
      <p className="text-muted" style={{ marginBottom: 24 }}>
        App-wide preferences for AgentCorral.
      </p>

      <div className="settings-section">
        <h3>Export Directory</h3>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          Directory where exported config bundles are saved. Leave empty to use the default app data directory.
        </p>
        <div className="form-group" style={{ maxWidth: 500 }}>
          <label htmlFor="export-dir">Export path</label>
          <input
            id="export-dir"
            type="text"
            value={exportDirValue}
            onChange={(e) => setExportDirValue(e.target.value)}
            placeholder="Default (app data directory)"
          />
        </div>
      </div>

      <div className="settings-section" style={{ marginTop: 24 }}>
        <h3>Bundle Sync</h3>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          How often to auto-check git-sourced config bundles for updates.
        </p>
        <div className="form-group" style={{ maxWidth: 400 }}>
          <label htmlFor="sync-interval">Check interval (minutes)</label>
          <input
            id="sync-interval"
            type="number"
            min={0}
            value={syncInterval}
            onChange={(e) => setSyncInterval(Number(e.target.value))}
          />
          <span className="text-muted" style={{ fontSize: 12 }}>
            Set to 0 to disable automatic checking.
          </span>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: 24 }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && <span className="settings-saved">Saved</span>}
      </div>

      <div className="settings-section" style={{ marginTop: 24 }}>
        <h3>Platform</h3>
        <p className="text-muted">
          Detected platform: <code>{platform}</code>
        </p>
      </div>
    </div>
  );
}
