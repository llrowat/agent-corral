use crate::preferences::AppPreferences;
use crate::AppState;

#[tauri::command]
pub fn get_preferences(state: tauri::State<AppState>) -> Result<AppPreferences, String> {
    let prefs_manager = state.preferences.lock().map_err(|e| e.to_string())?;
    Ok(prefs_manager.load())
}

#[tauri::command]
pub fn get_platform() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else {
        "linux".to_string()
    }
}
