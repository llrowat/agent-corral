use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SessionError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Session not found: {0}")]
    NotFound(String),
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
}

pub struct SessionManager {
    sessions_dir: PathBuf,
}

impl SessionManager {
    pub fn new(sessions_dir: PathBuf) -> Result<Self, SessionError> {
        fs::create_dir_all(&sessions_dir)?;
        Ok(Self { sessions_dir })
    }

    pub fn create_session(
        &self,
        session_id: &str,
        repo_path: &str,
        command_name: &str,
        command: &str,
        pid: u32,
    ) -> Result<SessionEnvelope, SessionError> {
        let envelope = SessionEnvelope {
            session_id: session_id.to_string(),
            repo_path: repo_path.to_string(),
            command_name: command_name.to_string(),
            command: command.to_string(),
            started_at: Utc::now().to_rfc3339(),
            pid: Some(pid),
        };
        let path = self.sessions_dir.join(format!("{}.json", session_id));
        let json = serde_json::to_string_pretty(&envelope)?;
        let tmp = path.with_extension("tmp");
        fs::write(&tmp, &json)?;
        fs::rename(&tmp, &path)?;
        Ok(envelope)
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

        // Try to kill the terminal process if it's still running
        if let Ok(contents) = fs::read_to_string(&json_path) {
            if let Ok(envelope) = serde_json::from_str::<SessionEnvelope>(&contents) {
                if let Some(pid) = envelope.pid {
                    kill_process_tree(pid);
                }
            }
        }

        let _ = fs::remove_file(&json_path);
        Ok(())
    }

    /// Remove sessions whose process is no longer running.
    pub fn cleanup_dead_sessions(&self) -> Result<(), SessionError> {
        let sessions = self.list_sessions()?;
        for session in sessions {
            if let Some(pid) = session.pid {
                if !is_process_alive(pid) {
                    let json_path = self.sessions_dir.join(format!("{}.json", session.session_id));
                    let _ = fs::remove_file(&json_path);
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
