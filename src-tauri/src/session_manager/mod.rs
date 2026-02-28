use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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

/// Activity state for a running session, inferred from CPU usage between polls.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SessionActivity {
    /// Process is actively consuming CPU (doing work).
    Active,
    /// Process is alive but not consuming CPU (likely waiting for user input).
    Idle,
    /// Process has exited.
    Exited,
}

pub struct SessionManager {
    sessions_dir: PathBuf,
    worktrees_dir: PathBuf,
    /// Tracks cumulative CPU time (in ms) per session from the previous poll,
    /// used to determine if a process is actively working or idle.
    cpu_times: HashMap<String, u64>,
}

impl SessionManager {
    pub fn new(sessions_dir: PathBuf, worktrees_dir: PathBuf) -> Result<Self, SessionError> {
        fs::create_dir_all(&sessions_dir)?;
        fs::create_dir_all(&worktrees_dir)?;
        Ok(Self {
            sessions_dir,
            worktrees_dir,
            cpu_times: HashMap::new(),
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

    /// Update an existing session envelope on disk (public accessor).
    pub fn update_session_pub(&mut self, envelope: &SessionEnvelope) -> Result<(), SessionError> {
        self.update_session(envelope)
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

    /// Poll activity state for all sessions. Compares current CPU time to
    /// the previously recorded value to determine if a process is actively
    /// working or idle (waiting for input).
    pub fn poll_session_activities(
        &mut self,
        sessions: &[SessionEnvelope],
    ) -> HashMap<String, SessionActivity> {
        let mut result = HashMap::new();
        let mut new_cpu_times = HashMap::new();

        for session in sessions {
            if !session.process_alive {
                result.insert(session.session_id.clone(), SessionActivity::Exited);
                continue;
            }

            let pid = match session.pid {
                Some(pid) => pid,
                None => {
                    result.insert(session.session_id.clone(), SessionActivity::Exited);
                    continue;
                }
            };

            match get_process_cpu_time(pid) {
                Some(current_cpu) => {
                    let activity = if let Some(&prev_cpu) = self.cpu_times.get(&session.session_id) {
                        if current_cpu > prev_cpu {
                            SessionActivity::Active
                        } else {
                            SessionActivity::Idle
                        }
                    } else {
                        // First poll — assume active if there's any CPU time
                        if current_cpu > 0 {
                            SessionActivity::Active
                        } else {
                            SessionActivity::Idle
                        }
                    };
                    new_cpu_times.insert(session.session_id.clone(), current_cpu);
                    result.insert(session.session_id.clone(), activity);
                }
                None => {
                    // Can't read CPU time — process may have exited
                    result.insert(session.session_id.clone(), SessionActivity::Exited);
                }
            }
        }

        self.cpu_times = new_cpu_times;
        result
    }

    pub fn sessions_dir(&self) -> &Path {
        &self.sessions_dir
    }
}

/// Get cumulative CPU time in milliseconds for a process. Returns None if the
/// process doesn't exist or the information can't be read.
fn get_process_cpu_time(pid: u32) -> Option<u64> {
    #[cfg(target_os = "linux")]
    {
        // Read /proc/{pid}/stat — fields 14 (utime) and 15 (stime) are
        // cumulative CPU ticks in user and kernel mode respectively.
        let stat_path = format!("/proc/{}/stat", pid);
        let contents = fs::read_to_string(&stat_path).ok()?;
        // The comm field (field 2) may contain spaces/parens, so find the
        // closing paren and parse from there.
        let after_comm = contents.rfind(')')? + 2;
        let fields: Vec<&str> = contents[after_comm..].split_whitespace().collect();
        // After the closing paren and the state char, fields are 0-indexed:
        // index 11 = utime (field 14), index 12 = stime (field 15)
        if fields.len() < 13 {
            return None;
        }
        let utime: u64 = fields[11].parse().ok()?;
        let stime: u64 = fields[12].parse().ok()?;
        // Convert from clock ticks to ms (assuming 100 Hz = 10ms per tick)
        Some((utime + stime) * 10)
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("ps")
            .args(["-o", "cputime=", "-p", &pid.to_string()])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        // Format is HH:MM:SS or M:SS
        let time_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        parse_cputime_to_ms(&time_str)
    }

    #[cfg(target_os = "windows")]
    {
        extern "system" {
            fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
            fn CloseHandle(handle: isize) -> i32;
            fn GetProcessTimes(
                handle: isize,
                creation: *mut u64,
                exit: *mut u64,
                kernel: *mut u64,
                user: *mut u64,
            ) -> i32;
        }
        const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle == 0 {
                return None;
            }
            let mut creation: u64 = 0;
            let mut exit: u64 = 0;
            let mut kernel: u64 = 0;
            let mut user: u64 = 0;
            let ok = GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user);
            CloseHandle(handle);
            if ok == 0 {
                return None;
            }
            // kernel and user are in 100-nanosecond intervals, convert to ms
            Some((kernel + user) / 10_000)
        }
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = pid;
        None
    }
}

/// Parse a cputime string like "0:02.34" or "1:23:45" into milliseconds.
#[cfg(target_os = "macos")]
fn parse_cputime_to_ms(s: &str) -> Option<u64> {
    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        2 => {
            let mins: u64 = parts[0].parse().ok()?;
            let secs: f64 = parts[1].parse().ok()?;
            Some(mins * 60_000 + (secs * 1000.0) as u64)
        }
        3 => {
            let hours: u64 = parts[0].parse().ok()?;
            let mins: u64 = parts[1].parse().ok()?;
            let secs: f64 = parts[2].parse().ok()?;
            Some(hours * 3_600_000 + mins * 60_000 + (secs * 1000.0) as u64)
        }
        _ => None,
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn make_manager() -> SessionManager {
        let tmp = tempdir().unwrap();
        let sessions_dir = tmp.path().join("sessions");
        let worktrees_dir = tmp.path().join("worktrees");
        // Keep the tempdir alive by leaking it (tests are short-lived)
        let tmp = Box::leak(Box::new(tmp));
        let _ = tmp;
        SessionManager::new(sessions_dir, worktrees_dir).unwrap()
    }

    fn make_envelope(id: &str, repo: &str, alive: bool, pid: Option<u32>) -> SessionEnvelope {
        SessionEnvelope {
            session_id: id.to_string(),
            repo_path: repo.to_string(),
            command_name: "test".to_string(),
            command: "echo hello".to_string(),
            started_at: "2026-01-01T00:00:00Z".to_string(),
            pid,
            worktree_path: None,
            worktree_branch: None,
            worktree_base_branch: None,
            process_alive: alive,
        }
    }

    #[test]
    fn poll_activities_exited_sessions_marked_exited() {
        let mut mgr = make_manager();
        let sessions = vec![
            make_envelope("s1", "/repo1", false, Some(99999)),
            make_envelope("s2", "/repo2", false, None),
        ];

        let activities = mgr.poll_session_activities(&sessions);

        assert_eq!(activities.get("s1"), Some(&SessionActivity::Exited));
        assert_eq!(activities.get("s2"), Some(&SessionActivity::Exited));
    }

    #[test]
    fn poll_activities_no_pid_marked_exited() {
        let mut mgr = make_manager();
        let sessions = vec![make_envelope("s1", "/repo1", true, None)];

        let activities = mgr.poll_session_activities(&sessions);
        assert_eq!(activities.get("s1"), Some(&SessionActivity::Exited));
    }

    #[test]
    fn poll_activities_nonexistent_pid_marked_exited() {
        let mut mgr = make_manager();
        // Use a very high PID that almost certainly doesn't exist
        let sessions = vec![make_envelope("s1", "/repo1", true, Some(4_000_000))];

        let activities = mgr.poll_session_activities(&sessions);
        assert_eq!(activities.get("s1"), Some(&SessionActivity::Exited));
    }

    #[test]
    fn poll_activities_cpu_times_cleaned_on_poll() {
        let mut mgr = make_manager();
        // Pre-populate cpu_times with a stale entry
        mgr.cpu_times.insert("old-session".to_string(), 100);

        let sessions = vec![make_envelope("s1", "/repo1", false, None)];
        mgr.poll_session_activities(&sessions);

        // Old entry should be cleared since it's not in the sessions list
        assert!(!mgr.cpu_times.contains_key("old-session"));
    }

    #[test]
    fn create_and_list_sessions() {
        let mgr = make_manager();
        mgr.create_session("s1", "/repo1", "test", "echo", 123, None, None, None)
            .unwrap();
        mgr.create_session("s2", "/repo2", "test2", "ls", 456, None, None, None)
            .unwrap();

        let sessions = mgr.list_sessions().unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn delete_session_removes_file() {
        let mgr = make_manager();
        mgr.create_session("s1", "/repo1", "test", "echo", 123, None, None, None)
            .unwrap();

        mgr.delete_session("s1").unwrap();
        let sessions = mgr.list_sessions().unwrap();
        assert_eq!(sessions.len(), 0);
    }

    #[test]
    fn delete_nonexistent_session_fails() {
        let mgr = make_manager();
        let result = mgr.delete_session("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn session_activity_serializes_to_camel_case() {
        let json = serde_json::to_string(&SessionActivity::Active).unwrap();
        assert_eq!(json, "\"active\"");
        let json = serde_json::to_string(&SessionActivity::Idle).unwrap();
        assert_eq!(json, "\"idle\"");
        let json = serde_json::to_string(&SessionActivity::Exited).unwrap();
        assert_eq!(json, "\"exited\"");
    }
}
