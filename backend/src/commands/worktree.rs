use crate::session_manager::{self, WorktreeStatus};
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

    mgr.get_worktree_status(
        &session.repo_path,
        wt_path,
        branch,
        session.worktree_base_branch.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// Get a diff summary of changes in a worktree session compared to its base.
/// Shows both committed branch delta AND uncommitted working changes.
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

    let mut result = String::new();

    // Show committed changes on the branch (vs base)
    if let Some(ref base) = session.worktree_base_branch {
        if let Some(ref branch) = session.worktree_branch {
            let branch_diff = Command::new("git")
                .args(["diff", "--stat", &format!("{}...{}", base, branch)])
                .current_dir(wt_path)
                .output();
            if let Ok(output) = branch_diff {
                let diff_text = String::from_utf8_lossy(&output.stdout).to_string();
                if !diff_text.trim().is_empty() {
                    result.push_str("Committed changes (vs ");
                    result.push_str(base);
                    result.push_str("):\n");
                    result.push_str(&diff_text);
                }
            }
        }
    }

    // Show uncommitted working tree changes
    let working_diff = Command::new("git")
        .args(["diff", "--stat"])
        .current_dir(wt_path)
        .output()
        .map_err(|e| format!("git diff failed: {}", e))?;

    let staged_diff = Command::new("git")
        .args(["diff", "--staged", "--stat"])
        .current_dir(wt_path)
        .output()
        .map_err(|e| format!("git diff --staged failed: {}", e))?;

    let working_text = String::from_utf8_lossy(&working_diff.stdout).to_string();
    let staged_text = String::from_utf8_lossy(&staged_diff.stdout).to_string();

    if !staged_text.trim().is_empty() {
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str("Staged changes:\n");
        result.push_str(&staged_text);
    }

    if !working_text.trim().is_empty() {
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str("Unstaged changes:\n");
        result.push_str(&working_text);
    }

    Ok(result)
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
///
/// Refuses to merge if the worktree has uncommitted changes (they would be
/// silently left behind) or if the main repo working tree is dirty.
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

    // Check that the worktree has no uncommitted changes — those would be
    // left behind and silently lost after the merge.
    if let Some(ref wt_path) = session.worktree_path {
        if session_manager::has_uncommitted_changes(wt_path)? {
            return Err(
                "The worktree has uncommitted changes. Please commit them before merging."
                    .to_string(),
            );
        }
    }

    // Check that the main repo working tree is clean before checking out
    let status_check = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&session.repo_path)
        .output()
        .map_err(|e| format!("git status failed: {}", e))?;

    if !status_check.stdout.is_empty() {
        return Err(
            "The main repository has uncommitted changes. Please commit or stash them before merging."
                .to_string(),
        );
    }

    // Checkout the target branch
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
        .args([
            "merge",
            branch,
            "--no-ff",
            "-m",
            &format!("Merge {} into {}", branch, target_branch),
        ])
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
            "Merge failed (auto-aborted). You can resolve conflicts manually by running:\n  cd {}\n  git checkout {}\n  git merge {}",
            session.repo_path, target_branch, branch
        ));
    }

    Ok(format!(
        "Successfully merged {} into {}",
        branch, target_branch
    ))
}

/// Commit all changes in a worktree session (stage everything, then commit).
#[tauri::command]
pub fn commit_worktree_changes(
    state: tauri::State<AppState>,
    session_id: String,
    message: String,
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

    session_manager::git_commit_all(wt_path, &message)
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
