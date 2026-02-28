use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppPreferences {
    /// Which terminal emulator to use. None means auto-detect.
    pub terminal_emulator: Option<String>,
}

pub struct PreferencesManager {
    path: PathBuf,
}

impl PreferencesManager {
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            path: app_data_dir.join("preferences.json"),
        }
    }

    pub fn load(&self) -> AppPreferences {
        match fs::read_to_string(&self.path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
            Err(_) => AppPreferences::default(),
        }
    }

    pub fn save(&self, prefs: &AppPreferences) -> Result<(), String> {
        let json = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
        let tmp_path = self.path.with_extension("json.tmp");
        fs::write(&tmp_path, &json).map_err(|e| e.to_string())?;
        fs::rename(&tmp_path, &self.path).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_terminal_emulator(&self) -> Option<String> {
        self.load().terminal_emulator
    }

    pub fn set_terminal_emulator(&self, terminal: Option<String>) -> Result<(), String> {
        let mut prefs = self.load();
        prefs.terminal_emulator = terminal;
        self.save(&prefs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_returns_defaults_when_no_file() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = PreferencesManager::new(tmp.path());
        let prefs = mgr.load();
        assert!(prefs.terminal_emulator.is_none());
    }

    #[test]
    fn save_and_load_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = PreferencesManager::new(tmp.path());

        let prefs = AppPreferences {
            terminal_emulator: Some("alacritty".to_string()),
        };
        mgr.save(&prefs).unwrap();

        let loaded = mgr.load();
        assert_eq!(loaded.terminal_emulator, Some("alacritty".to_string()));
    }

    #[test]
    fn set_terminal_emulator() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = PreferencesManager::new(tmp.path());

        mgr.set_terminal_emulator(Some("kitty".to_string())).unwrap();
        assert_eq!(mgr.get_terminal_emulator(), Some("kitty".to_string()));

        mgr.set_terminal_emulator(None).unwrap();
        assert_eq!(mgr.get_terminal_emulator(), None);
    }

    #[test]
    fn load_handles_corrupt_json() {
        let tmp = tempfile::tempdir().unwrap();
        let prefs_path = tmp.path().join("preferences.json");
        fs::write(&prefs_path, "not valid json!!!").unwrap();

        let mgr = PreferencesManager::new(tmp.path());
        let prefs = mgr.load();
        // Should return defaults, not panic
        assert!(prefs.terminal_emulator.is_none());
    }

    #[test]
    fn save_uses_atomic_write() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = PreferencesManager::new(tmp.path());

        let prefs = AppPreferences {
            terminal_emulator: Some("wezterm".to_string()),
        };
        mgr.save(&prefs).unwrap();

        // Verify the tmp file was cleaned up (atomic rename)
        let tmp_path = tmp.path().join("preferences.json.tmp");
        assert!(!tmp_path.exists());

        // Verify the actual file exists
        let prefs_path = tmp.path().join("preferences.json");
        assert!(prefs_path.exists());
    }

    #[test]
    fn app_preferences_default() {
        let prefs = AppPreferences::default();
        assert!(prefs.terminal_emulator.is_none());
    }

    #[test]
    fn app_preferences_serialization() {
        let prefs = AppPreferences {
            terminal_emulator: Some("gnome-terminal".to_string()),
        };
        let json = serde_json::to_string(&prefs).unwrap();
        let deserialized: AppPreferences = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.terminal_emulator, prefs.terminal_emulator);
    }
}
