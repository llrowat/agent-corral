use crate::session_manager::{focus_window_by_pid, SessionActivity, SessionEnvelope};
use crate::AppState;
use std::collections::HashMap;

#[tauri::command]
pub fn list_sessions(state: tauri::State<AppState>) -> Result<Vec<SessionEnvelope>, String> {
    let mgr = state.session_manager.lock().map_err(|e| e.to_string())?;
    // Auto-remove sessions whose terminal has been closed
    let _ = mgr.cleanup_dead_sessions();
    mgr.list_sessions().map_err(|e| e.to_string())
}

/// Poll activity state for all sessions. Returns a map of session_id to
/// activity state ("active", "idle", or "exited"). Uses CPU time sampling
/// to detect whether running processes are actively working or waiting.
#[tauri::command]
pub fn poll_session_states(
    state: tauri::State<AppState>,
) -> Result<HashMap<String, SessionActivity>, String> {
    let mut mgr = state.session_manager.lock().map_err(|e| e.to_string())?;
    let _ = mgr.cleanup_dead_sessions();
    let sessions = mgr.list_sessions().map_err(|e| e.to_string())?;
    Ok(mgr.poll_session_activities(&sessions))
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
