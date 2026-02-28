use crate::session_manager::WorktreeStatus;
use crate::AppState;
use std::process::Command;

/// Get the status of a session's worktree.
#[tauri::command]
pub fn get_worktree_status(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<WorktreeStatus, String> {
    let mgr = state.session_manager.lock().map_err(|e| e.to_string())?;
    let sessions = mgr.list_sessions().map_err(|e| e.to_string())?;

    let session = sessions
        .iter()
        .find(|s| s.session_id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let wt_path = session
        .worktree_path
        .as_ref()
        .ok_or("Session does not have a worktree")?;
    let branch = session
        .worktree_branch
        .as_ref()
        .ok_or("Session does not have a worktree branch")?;

    mgr.get_worktree_status(&session.repo_path, wt_path, branch)
        .map_err(|e| e.to_string())
}

/// Get a diff summary of changes in a worktree session compared to its base.
#[tauri::command]
pub fn get_worktree_diff(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<String, String> {
    let mgr = state.session_manager.lock().map_err(|e| e.to_string())?;
    let sessions = mgr.list_sessions().map_err(|e| e.to_string())?;

    let session = sessions
        .iter()
        .find(|s| s.session_id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let wt_path = session
        .worktree_path
        .as_ref()
        .ok_or("Session does not have a worktree")?;

    // Show diff of uncommitted changes + committed changes on the branch
    let output = Command::new("git")
        .args(["diff", "--stat", "HEAD"])
        .current_dir(wt_path)
        .output()
        .map_err(|e| format!("git diff failed: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// List all git branches in a repo for use as base branch selection.
#[tauri::command]
pub fn list_branches(repo_path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .args(["branch", "--format=%(refname:short)"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("git branch failed: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git branch failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let branches: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(branches)
}

/// Merge a worktree branch back into a target branch.
#[tauri::command]
pub fn merge_worktree_branch(
    state: tauri::State<AppState>,
    session_id: String,
    target_branch: String,
) -> Result<String, String> {
    let mgr = state.session_manager.lock().map_err(|e| e.to_string())?;
    let sessions = mgr.list_sessions().map_err(|e| e.to_string())?;

    let session = sessions
        .iter()
        .find(|s| s.session_id == session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let branch = session
        .worktree_branch
        .as_ref()
        .ok_or("Session does not have a worktree branch")?;

    // Perform the merge in the main repo (not the worktree)
    // First, checkout the target branch
    let checkout = Command::new("git")
        .args(["checkout", &target_branch])
        .current_dir(&session.repo_path)
        .output()
        .map_err(|e| format!("git checkout failed: {}", e))?;

    if !checkout.status.success() {
        return Err(format!(
            "Failed to checkout {}: {}",
            target_branch,
            String::from_utf8_lossy(&checkout.stderr)
        ));
    }

    // Merge the worktree branch
    let merge = Command::new("git")
        .args(["merge", branch, "--no-ff", "-m", &format!("Merge {} into {}", branch, target_branch)])
        .current_dir(&session.repo_path)
        .output()
        .map_err(|e| format!("git merge failed: {}", e))?;

    if !merge.status.success() {
        // Abort the merge if it failed
        let _ = Command::new("git")
            .args(["merge", "--abort"])
            .current_dir(&session.repo_path)
            .output();
        return Err(format!(
            "Merge failed (auto-aborted): {}",
            String::from_utf8_lossy(&merge.stderr)
        ));
    }

    Ok(format!(
        "Successfully merged {} into {}",
        branch, target_branch
    ))
}

/// Prune orphaned worktrees that no longer have active sessions.
#[tauri::command]
pub fn prune_worktrees(state: tauri::State<AppState>) -> Result<(), String> {
    state
        .session_manager
        .lock()
        .map_err(|e| e.to_string())?
        .prune_orphaned_worktrees()
        .map_err(|e| e.to_string())
}
