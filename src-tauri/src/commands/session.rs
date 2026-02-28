use crate::session_manager::{focus_window_by_pid, SessionEnvelope};
use crate::AppState;

#[tauri::command]
pub fn list_sessions(state: tauri::State<AppState>) -> Result<Vec<SessionEnvelope>, String> {
    let mgr = state.session_manager.lock().map_err(|e| e.to_string())?;
    // Auto-remove sessions whose terminal has been closed
    let _ = mgr.cleanup_dead_sessions();
    mgr.list_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_session(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<(), String> {
    state
        .session_manager
        .lock()
        .map_err(|e| e.to_string())?
        .delete_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn focus_session(pid: u32) {
    focus_window_by_pid(pid);
}
