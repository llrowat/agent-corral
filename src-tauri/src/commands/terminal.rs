use crate::terminal_launcher::TerminalLauncher;
use crate::AppState;
use uuid::Uuid;

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
