use crate::session_manager::SessionEnvelope;
use crate::terminal_launcher::TerminalLauncher;
use crate::AppState;
use std::process::Command;
use uuid::Uuid;

/// Write a prompt string to a temp file under the repo's .claude/ directory.
/// Returns the absolute path to the temp file so it can be piped to `claude -p`.
#[tauri::command]
pub fn write_temp_prompt(repo_path: String, content: String) -> Result<String, String> {
    let dir = std::path::Path::new(&repo_path).join(".claude");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(".ai-prompt.tmp");
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn launch_session(
    state: tauri::State<AppState>,
    repo_path: String,
    command_name: String,
    command: String,
    use_worktree: Option<bool>,
    base_branch: Option<String>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();

    let terminal_pref = state
        .preferences
        .lock()
        .map_err(|e| e.to_string())?
        .get_terminal_emulator();

    // If worktree is requested, create one and use it as the working directory
    let (effective_path, wt_path, wt_branch, resolved_base) = if use_worktree.unwrap_or(false) {
        let mgr = state.session_manager.lock().map_err(|e| e.to_string())?;
        let resolved = mgr.resolve_base_branch(&repo_path, base_branch.as_deref());
        let (worktree_path, branch) = mgr
            .create_worktree(&session_id, &repo_path, base_branch.as_deref())
            .map_err(|e| e.to_string())?;
        let effective = worktree_path.clone();
        (effective, Some(worktree_path), Some(branch), resolved)
    } else {
        (repo_path.clone(), None, None, None)
    };

    let pid = TerminalLauncher::launch(&effective_path, &command, terminal_pref.as_deref())
        .map_err(|e| {
            // If terminal launch fails and we created a worktree, clean it up
            if let Some(ref wt) = wt_path {
                if let Ok(mgr) = state.session_manager.lock() {
                    mgr.remove_worktree(&repo_path, wt, wt_branch.as_deref());
                }
            }
            e.to_string()
        })?;

    // Record the session after successful launch
    state
        .session_manager
        .lock()
        .map_err(|e| e.to_string())?
        .create_session(
            &session_id,
            &repo_path,
            &command_name,
            &command,
            pid,
            wt_path.as_deref(),
            wt_branch.as_deref(),
            resolved_base.as_deref(),
        )
        .map_err(|e| e.to_string())?;

    Ok(session_id)
}

/// Resume a dead worktree session by launching a new terminal in the existing
/// worktree directory. Updates the session's PID and marks it alive again.
#[tauri::command]
pub fn resume_session(
    state: tauri::State<AppState>,
    session_id: String,
    command: String,
) -> Result<(), String> {
    let terminal_pref = state
        .preferences
        .lock()
        .map_err(|e| e.to_string())?
        .get_terminal_emulator();

    let mut mgr = state.session_manager.lock().map_err(|e| e.to_string())?;
    let sessions = mgr.list_sessions().map_err(|e| e.to_string())?;

    let session = sessions
        .into_iter()
        .find(|s| s.session_id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let launch_dir = session
        .worktree_path
        .as_deref()
        .unwrap_or(&session.repo_path);

    let pid = TerminalLauncher::launch(launch_dir, &command, terminal_pref.as_deref())
        .map_err(|e| e.to_string())?;

    let updated = SessionEnvelope {
        pid: Some(pid),
        process_alive: true,
        command: command,
        ..session
    };
    mgr.update_session_pub(&updated).map_err(|e| e.to_string())?;

    Ok(())
}

/// Open the session's working directory in the system file manager.
#[tauri::command]
pub fn open_session_folder(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<(), String> {
    let mgr = state.session_manager.lock().map_err(|e| e.to_string())?;
    let sessions = mgr.list_sessions().map_err(|e| e.to_string())?;

    let session = sessions
        .iter()
        .find(|s| s.session_id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let dir = session
        .worktree_path
        .as_deref()
        .unwrap_or(&session.repo_path);

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}
