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
