use crate::session_manager::SessionEnvelope;
use crate::AppState;

#[tauri::command]
pub fn list_sessions(state: tauri::State<AppState>) -> Result<Vec<SessionEnvelope>, String> {
    state
        .session_manager
        .lock()
        .map_err(|e| e.to_string())?
        .list_sessions()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_session(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<SessionEnvelope, String> {
    state
        .session_manager
        .lock()
        .map_err(|e| e.to_string())?
        .get_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_session_log(
    state: tauri::State<AppState>,
    session_id: String,
    tail_lines: Option<usize>,
) -> Result<String, String> {
    state
        .session_manager
        .lock()
        .map_err(|e| e.to_string())?
        .read_session_log(&session_id, tail_lines)
        .map_err(|e| e.to_string())
}
