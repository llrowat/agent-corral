import { useState, useEffect } from "react";
import { getPreferences, setTerminalPreference, getPlatform } from "@/lib/tauri";

const TERMINAL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  windows: [
    { value: "windows-terminal", label: "Windows Terminal" },
    { value: "cmd", label: "Command Prompt (cmd)" },
    { value: "powershell", label: "PowerShell" },
    { value: "git-bash", label: "Git Bash" },
  ],
  macos: [
    { value: "terminal", label: "Terminal.app" },
    { value: "iterm", label: "iTerm2" },
  ],
  linux: [
    { value: "gnome-terminal", label: "GNOME Terminal" },
    { value: "konsole", label: "Konsole" },
    { value: "xterm", label: "XTerm" },
    { value: "alacritty", label: "Alacritty" },
    { value: "kitty", label: "Kitty" },
  ],
};

function detectPlatformKey(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}

export function SettingsPage() {
  const [terminal, setTerminal] = useState<string>("");
  const [platform, setPlatform] = useState<string>(detectPlatformKey);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPlatform()
      .then((p) => setPlatform(p))
      .catch(() => {});
    getPreferences()
      .then((prefs) => setTerminal(prefs.terminal_emulator ?? ""))
      .catch(() => {});
  }, []);

  const options = TERMINAL_OPTIONS[platform] ?? TERMINAL_OPTIONS.linux;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await setTerminalPreference(terminal === "" ? null : terminal);
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
      <h2>Settings</h2>
      <p className="text-muted" style={{ marginBottom: 24 }}>
        App-wide preferences for AgentCorral.
      </p>

      <div className="settings-section">
        <h3>Terminal Emulator</h3>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          Choose which terminal to open when launching sessions.
        </p>
        <div className="form-group" style={{ maxWidth: 400 }}>
          <label htmlFor="terminal-select">Terminal</label>
          <select
            id="terminal-select"
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
          >
            <option value="">Auto-detect (default)</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="settings-saved">Saved</span>}
        </div>
      </div>
    </div>
  );
}
