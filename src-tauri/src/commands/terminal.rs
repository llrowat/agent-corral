use crate::terminal_launcher::TerminalLauncher;
use crate::AppState;
use uuid::Uuid;

#[tauri::command]
pub fn launch_session(
    state: tauri::State<AppState>,
    repo_path: String,
    command_name: String,
    command: String,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();

    let terminal_pref = state
        .preferences
        .lock()
        .map_err(|e| e.to_string())?
        .get_terminal_emulator();

    let pid = TerminalLauncher::launch(&repo_path, &command, terminal_pref.as_deref())
        .map_err(|e| e.to_string())?;

    // Record the session after successful launch
    state
        .session_manager
        .lock()
        .map_err(|e| e.to_string())?
        .create_session(&session_id, &repo_path, &command_name, &command, pid)
        .map_err(|e| e.to_string())?;

    Ok(session_id)
}
