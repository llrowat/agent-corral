use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SessionError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Session not found: {0}")]
    NotFound(String),
    #[error("Git worktree error: {0}")]
    Worktree(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEnvelope {
    pub session_id: String,
    pub repo_path: String,
    pub command_name: String,
    pub command: String,
    pub started_at: String,
    pub pid: Option<u32>,
    #[serde(default)]
    pub worktree_path: Option<String>,
    #[serde(default)]
    pub worktree_branch: Option<String>,
    #[serde(default)]
    pub worktree_base_branch: Option<String>,
    /// Whether the process has exited. Worktree sessions transition to
    /// `process_alive=false` instead of being deleted, so the user can
    /// review/merge the worktree before cleaning up.
    #[serde(default = "default_true")]
    pub process_alive: bool,
}

fn default_true() -> bool {
    true
}

/// Status information for a session's git worktree.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeStatus {
    pub branch: String,
    pub base_branch: Option<String>,
    pub worktree_path: String,
    pub has_uncommitted_changes: bool,
    pub commit_count: u32,
    pub latest_commit_summary: Option<String>,
}

pub struct SessionManager {
    sessions_dir: PathBuf,
    worktrees_dir: PathBuf,
}

impl SessionManager {
    pub fn new(sessions_dir: PathBuf, worktrees_dir: PathBuf) -> Result<Self, SessionError> {
        fs::create_dir_all(&sessions_dir)?;
        fs::create_dir_all(&worktrees_dir)?;
        Ok(Self {
            sessions_dir,
            worktrees_dir,
        })
    }

    /// Create a git worktree for a session. Returns (worktree_path, branch_name).
    pub fn create_worktree(
        &self,
        session_id: &str,
        repo_path: &str,
        base_branch: Option<&str>,
    ) -> Result<(String, String), SessionError> {
        let worktree_dir = self.worktrees_dir.join(session_id);
        let branch_name = format!("worktree/{}", &session_id[..8.min(session_id.len())]);

        // Determine the base point for the new branch
        let base = base_branch.unwrap_or("HEAD");

        let output = Command::new("git")
            .args([
                "worktree",
                "add",
                "-b",
                &branch_name,
                worktree_dir
                    .to_str()
                    .ok_or_else(|| SessionError::Worktree("Invalid worktree path".to_string()))?,
                base,
            ])
            .current_dir(repo_path)
            .output()
            .map_err(|e| SessionError::Worktree(format!("Failed to run git: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(SessionError::Worktree(format!(
                "git worktree add failed: {}",
                stderr.trim()
            )));
        }

        Ok((worktree_dir.to_string_lossy().to_string(), branch_name))
    }

    /// Resolve the actual branch name for the base. If the user passed a branch
    /// name, return it. Otherwise detect HEAD's branch at the time of creation.
    pub fn resolve_base_branch(&self, repo_path: &str, base_branch: Option<&str>) -> Option<String> {
        if let Some(b) = base_branch {
            return Some(b.to_string());
        }
        // Resolve HEAD to a branch name
        let output = Command::new("git")
            .args(["symbolic-ref", "--short", "HEAD"])
            .current_dir(repo_path)
            .output()
            .ok()?;
        if output.status.success() {
            let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !name.is_empty() {
                return Some(name);
            }
        }
        None
    }

    /// Remove a git worktree and its branch. Best-effort — does not fail if already removed.
    pub fn remove_worktree(&self, repo_path: &str, worktree_path: &str, branch: Option<&str>) {
        // First try to remove the worktree via git
        let _ = Command::new("git")
            .args(["worktree", "remove", "--force", worktree_path])
            .current_dir(repo_path)
            .output();

        // Clean up the directory if git didn't remove it
        let wt = Path::new(worktree_path);
        if wt.exists() {
            let _ = fs::remove_dir_all(wt);
        }

        // Prune stale worktree references
        let _ = Command::new("git")
            .args(["worktree", "prune"])
            .current_dir(repo_path)
            .output();

        // Delete the session branch if specified
        if let Some(branch_name) = branch {
            let _ = Command::new("git")
                .args(["branch", "-D", branch_name])
                .current_dir(repo_path)
                .output();
        }
    }

    /// Check if a worktree has any content worth preserving (uncommitted changes
    /// or commits ahead of the base branch).
    pub fn worktree_has_work(
        &self,
        repo_path: &str,
        worktree_path: &str,
        branch: &str,
        base_branch: Option<&str>,
    ) -> bool {
        let wt = Path::new(worktree_path);
        if !wt.exists() {
            return false;
        }

        // Check for uncommitted changes
        if let Ok(output) = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(worktree_path)
            .output()
        {
            if !output.stdout.is_empty() {
                return true;
            }
        }

        // Check for commits ahead of base
        let base = base_branch.unwrap_or("HEAD");
        if let Ok(output) = Command::new("git")
            .args(["rev-list", "--count", &format!("{}..{}", base, branch)])
            .current_dir(repo_path)
            .output()
        {
            if let Ok(count) = String::from_utf8_lossy(&output.stdout)
                .trim()
                .parse::<u32>()
            {
                if count > 0 {
                    return true;
                }
            }
        }

        false
    }

    /// Get status information for a worktree.
    pub fn get_worktree_status(
        &self,
        repo_path: &str,
        worktree_path: &str,
        branch: &str,
        base_branch: Option<&str>,
    ) -> Result<WorktreeStatus, SessionError> {
        let wt = Path::new(worktree_path);
        if !wt.exists() {
            return Err(SessionError::Worktree(
                "Worktree directory not found".to_string(),
            ));
        }

        // Check for uncommitted changes
        let status_output = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(worktree_path)
            .output()
            .map_err(|e| SessionError::Worktree(format!("git status failed: {}", e)))?;
        let has_uncommitted = !status_output.stdout.is_empty();

        // Use the stored base branch, or fall back to detection
        let resolved_base = base_branch
            .map(|s| s.to_string())
            .or_else(|| self.detect_default_branch(repo_path));

        // Count commits ahead of the base
        let commit_count = if let Some(ref base) = resolved_base {
            let count_output = Command::new("git")
                .args(["rev-list", "--count", &format!("{}..{}", base, branch)])
                .current_dir(repo_path)
                .output()
                .ok();
            count_output
                .and_then(|o| {
                    String::from_utf8_lossy(&o.stdout)
                        .trim()
                        .parse::<u32>()
                        .ok()
                })
                .unwrap_or(0)
        } else {
            0
        };

        // Get the latest commit summary
        let log_output = Command::new("git")
            .args(["log", "-1", "--format=%s", branch])
            .current_dir(repo_path)
            .output()
            .ok();
        let latest_commit_summary = log_output.and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        });

        Ok(WorktreeStatus {
            branch: branch.to_string(),
            base_branch: resolved_base,
            worktree_path: worktree_path.to_string(),
            has_uncommitted_changes: has_uncommitted,
            commit_count,
            latest_commit_summary,
        })
    }

    /// Detect the default branch (main/master/etc.) for a repo.
    fn detect_default_branch(&self, repo_path: &str) -> Option<String> {
        for candidate in &["main", "master", "develop", "dev"] {
            let exists = Command::new("git")
                .args(["rev-parse", "--verify", candidate])
                .current_dir(repo_path)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if exists {
                return Some(candidate.to_string());
            }
        }
        None
    }

    /// Prune orphaned worktrees that don't have corresponding session files.
    pub fn prune_orphaned_worktrees(&self) -> Result<(), SessionError> {
        if !self.worktrees_dir.exists() {
            return Ok(());
        }
        let sessions = self.list_sessions()?;
        let session_ids: Vec<&str> = sessions.iter().map(|s| s.session_id.as_str()).collect();

        for entry in fs::read_dir(&self.worktrees_dir)? {
            let entry = entry?;
            if entry.path().is_dir() {
                let dir_name = entry.file_name().to_string_lossy().to_string();
                if !session_ids.contains(&dir_name.as_str()) {
                    let _ = fs::remove_dir_all(entry.path());
                }
            }
        }
        Ok(())
    }

    pub fn create_session(
        &self,
        session_id: &str,
        repo_path: &str,
        command_name: &str,
        command: &str,
        pid: u32,
        worktree_path: Option<&str>,
        worktree_branch: Option<&str>,
        worktree_base_branch: Option<&str>,
    ) -> Result<SessionEnvelope, SessionError> {
        let envelope = SessionEnvelope {
            session_id: session_id.to_string(),
            repo_path: repo_path.to_string(),
            command_name: command_name.to_string(),
            command: command.to_string(),
            started_at: Utc::now().to_rfc3339(),
            pid: Some(pid),
            worktree_path: worktree_path.map(|s| s.to_string()),
            worktree_branch: worktree_branch.map(|s| s.to_string()),
            worktree_base_branch: worktree_base_branch.map(|s| s.to_string()),
            process_alive: true,
        };
        let path = self.sessions_dir.join(format!("{}.json", session_id));
        let json = serde_json::to_string_pretty(&envelope)?;
        let tmp = path.with_extension("tmp");
        fs::write(&tmp, &json)?;
        fs::rename(&tmp, &path)?;
        Ok(envelope)
    }

    /// Update an existing session envelope on disk (atomic write).
    fn update_session(&self, envelope: &SessionEnvelope) -> Result<(), SessionError> {
        let path = self
            .sessions_dir
            .join(format!("{}.json", envelope.session_id));
        let json = serde_json::to_string_pretty(envelope)?;
        let tmp = path.with_extension("tmp");
        fs::write(&tmp, &json)?;
        fs::rename(&tmp, &path)?;
        Ok(())
    }

    pub fn list_sessions(&self) -> Result<Vec<SessionEnvelope>, SessionError> {
        let mut sessions = Vec::new();

        for entry in fs::read_dir(&self.sessions_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                match fs::read_to_string(&path) {
                    Ok(contents) => {
                        if let Ok(session) = serde_json::from_str::<SessionEnvelope>(&contents) {
                            sessions.push(session);
                        }
                    }
                    Err(_) => continue,
                }
            }
        }

        sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        Ok(sessions)
    }

    pub fn delete_session(&self, session_id: &str) -> Result<(), SessionError> {
        let json_path = self.sessions_dir.join(format!("{}.json", session_id));
        if !json_path.exists() {
            return Err(SessionError::NotFound(session_id.to_string()));
        }

        // Try to kill the terminal process and clean up worktree
        if let Ok(contents) = fs::read_to_string(&json_path) {
            if let Ok(envelope) = serde_json::from_str::<SessionEnvelope>(&contents) {
                if let Some(pid) = envelope.pid {
                    if envelope.process_alive {
                        kill_process_tree(pid);
                    }
                }
                // Clean up the worktree if one was created
                if let Some(ref wt_path) = envelope.worktree_path {
                    self.remove_worktree(
                        &envelope.repo_path,
                        wt_path,
                        envelope.worktree_branch.as_deref(),
                    );
                }
            }
        }

        let _ = fs::remove_file(&json_path);
        Ok(())
    }

    /// Mark dead sessions. For sessions WITHOUT worktrees, delete them (original
    /// behavior). For sessions WITH worktrees, mark them as dead but keep them
    /// so the user can review/merge the worktree before cleanup.
    pub fn cleanup_dead_sessions(&self) -> Result<(), SessionError> {
        let sessions = self.list_sessions()?;
        for session in sessions {
            if !session.process_alive {
                continue; // already marked dead, skip
            }
            if let Some(pid) = session.pid {
                if !is_process_alive(pid) {
                    if session.worktree_path.is_some() {
                        // Mark dead but keep session + worktree for review
                        let mut updated = session.clone();
                        updated.process_alive = false;
                        let _ = self.update_session(&updated);
                    } else {
                        // No worktree — safe to remove immediately (original behavior)
                        let json_path = self
                            .sessions_dir
                            .join(format!("{}.json", session.session_id));
                        let _ = fs::remove_file(&json_path);
                    }
                }
            }
        }
        Ok(())
    }

    pub fn sessions_dir(&self) -> &Path {
        &self.sessions_dir
    }
}

/// Check if a process is still running.
fn is_process_alive(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        extern "system" {
            fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
            fn CloseHandle(handle: isize) -> i32;
            fn GetExitCodeProcess(handle: isize, exit_code: *mut u32) -> i32;
        }
        const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
        const STILL_ACTIVE: u32 = 259;
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle == 0 {
                return false;
            }
            let mut exit_code: u32 = 0;
            let ok = GetExitCodeProcess(handle, &mut exit_code);
            CloseHandle(handle);
            ok != 0 && exit_code == STILL_ACTIVE
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // kill -0 checks if process exists without sending a signal
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

/// Bring the terminal window for a given PID to the foreground. Best-effort.
pub fn focus_window_by_pid(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        type HWND = isize;
        type LPARAM = isize;

        extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> i32 {
            unsafe {
                let data = &mut *(lparam as *mut (u32, HWND));
                let mut window_pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, &mut window_pid);
                if window_pid == data.0 && IsWindowVisible(hwnd) != 0 {
                    data.1 = hwnd;
                    return 0; // stop
                }
                1 // continue
            }
        }

        extern "system" {
            fn EnumWindows(cb: extern "system" fn(HWND, LPARAM) -> i32, lp: LPARAM) -> i32;
            fn GetWindowThreadProcessId(hwnd: HWND, pid: *mut u32) -> u32;
            fn SetForegroundWindow(hwnd: HWND) -> i32;
            fn ShowWindow(hwnd: HWND, cmd: i32) -> i32;
            fn IsWindowVisible(hwnd: HWND) -> i32;
        }

        const SW_RESTORE: i32 = 9;

        let mut data: (u32, HWND) = (pid, 0);
        unsafe {
            EnumWindows(enum_callback, &mut data as *mut _ as LPARAM);
            if data.1 != 0 {
                ShowWindow(data.1, SW_RESTORE);
                SetForegroundWindow(data.1);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid; // no-op on other platforms for now
    }
}

/// Kill a process and its children. Best-effort — silently ignores errors
/// (e.g. process already exited).
fn kill_process_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        // taskkill /T kills the process tree, /F forces termination
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Send SIGTERM to the process group
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
}
