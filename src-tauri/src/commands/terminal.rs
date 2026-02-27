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

    let sessions_dir = state
        .session_manager
        .lock()
        .map_err(|e| e.to_string())?
        .sessions_dir()
        .to_string_lossy()
        .to_string();

    // Determine bridge binary path (shipped alongside the app)
    let bridge_path = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Failed to get executable directory")?
        .join("agentcorral-bridge")
        .to_string_lossy()
        .to_string();

    TerminalLauncher::launch(
        &repo_path,
        &session_id,
        &command_name,
        &command,
        &sessions_dir,
        &bridge_path,
    )
    .map_err(|e| e.to_string())?;

    Ok(session_id)
}
