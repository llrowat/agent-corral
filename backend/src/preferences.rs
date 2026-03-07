use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPreferences {
    /// How often to auto-check git plugins for updates (in minutes). 0 = disabled.
    /// Default is 30 minutes.
    #[serde(default = "default_sync_interval")]
    pub plugin_sync_interval_minutes: u32,
    /// Custom directory for exported config bundles. None = default app data dir.
    #[serde(default)]
    pub export_dir: Option<String>,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            plugin_sync_interval_minutes: 30,
            export_dir: None,
        }
    }
}

fn default_sync_interval() -> u32 {
    30
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

    pub fn get_plugin_sync_interval(&self) -> u32 {
        self.load().plugin_sync_interval_minutes
    }

    pub fn set_plugin_sync_interval(&self, minutes: u32) -> Result<(), String> {
        let mut prefs = self.load();
        prefs.plugin_sync_interval_minutes = minutes;
        self.save(&prefs)
    }

    pub fn get_export_dir(&self) -> Option<String> {
        self.load().export_dir
    }

    pub fn set_export_dir(&self, dir: Option<String>) -> Result<(), String> {
        let mut prefs = self.load();
        prefs.export_dir = dir;
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
        assert_eq!(prefs.plugin_sync_interval_minutes, 30);
        assert_eq!(prefs.export_dir, None);
    }

    #[test]
    fn save_and_load_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = PreferencesManager::new(tmp.path());

        let prefs = AppPreferences {
            plugin_sync_interval_minutes: 60,
            export_dir: Some("/custom/path".to_string()),
        };
        mgr.save(&prefs).unwrap();

        let loaded = mgr.load();
        assert_eq!(loaded.plugin_sync_interval_minutes, 60);
        assert_eq!(loaded.export_dir, Some("/custom/path".to_string()));
    }

    #[test]
    fn load_handles_corrupt_json() {
        let tmp = tempfile::tempdir().unwrap();
        let prefs_path = tmp.path().join("preferences.json");
        fs::write(&prefs_path, "not valid json!!!").unwrap();

        let mgr = PreferencesManager::new(tmp.path());
        let prefs = mgr.load();
        // Should return defaults, not panic
        assert_eq!(prefs.plugin_sync_interval_minutes, 30);
    }

    #[test]
    fn save_uses_atomic_write() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = PreferencesManager::new(tmp.path());

        let prefs = AppPreferences {
            plugin_sync_interval_minutes: 15,
            export_dir: None,
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
        assert_eq!(prefs.plugin_sync_interval_minutes, 30);
        assert_eq!(prefs.export_dir, None);
    }

    #[test]
    fn app_preferences_serialization() {
        let prefs = AppPreferences {
            plugin_sync_interval_minutes: 45,
            export_dir: Some("/tmp/exports".to_string()),
        };
        let json = serde_json::to_string(&prefs).unwrap();
        let deserialized: AppPreferences = serde_json::from_str(&json).unwrap();
        assert_eq!(
            deserialized.plugin_sync_interval_minutes,
            prefs.plugin_sync_interval_minutes
        );
        assert_eq!(deserialized.export_dir, prefs.export_dir);
    }

    #[test]
    fn default_sync_interval_is_30() {
        let prefs = AppPreferences::default();
        assert_eq!(prefs.plugin_sync_interval_minutes, 30);
    }

    #[test]
    fn set_and_get_export_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = PreferencesManager::new(tmp.path());

        assert_eq!(mgr.get_export_dir(), None);

        mgr.set_export_dir(Some("/custom/exports".to_string())).unwrap();
        assert_eq!(mgr.get_export_dir(), Some("/custom/exports".to_string()));

        mgr.set_export_dir(None).unwrap();
        assert_eq!(mgr.get_export_dir(), None);
    }

    #[test]
    fn set_and_get_plugin_sync_interval() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = PreferencesManager::new(tmp.path());

        mgr.set_plugin_sync_interval(60).unwrap();
        assert_eq!(mgr.get_plugin_sync_interval(), 60);

        mgr.set_plugin_sync_interval(0).unwrap();
        assert_eq!(mgr.get_plugin_sync_interval(), 0);
    }

    #[test]
    fn sync_interval_survives_save_load() {
        let tmp = tempfile::tempdir().unwrap();
        let mgr = PreferencesManager::new(tmp.path());

        mgr.set_plugin_sync_interval(15).unwrap();

        // Reload from disk
        let loaded = mgr.load();
        assert_eq!(loaded.plugin_sync_interval_minutes, 15);
    }

    #[test]
    fn old_prefs_without_sync_interval_default_to_30() {
        let tmp = tempfile::tempdir().unwrap();
        let prefs_path = tmp.path().join("preferences.json");
        // Write JSON without the sync interval field
        fs::write(&prefs_path, r#"{}"#).unwrap();

        let mgr = PreferencesManager::new(tmp.path());
        let loaded = mgr.load();
        assert_eq!(loaded.plugin_sync_interval_minutes, 30);
    }
}
