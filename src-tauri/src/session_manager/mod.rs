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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Running,
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEnvelope {
    pub session_id: String,
    pub repo_path: String,
    pub command_name: String,
    pub command: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub status: SessionStatus,
    pub exit_code: Option<i32>,
    pub log_path: String,
}

pub struct SessionManager {
    sessions_dir: PathBuf,
}

impl SessionManager {
    pub fn new(sessions_dir: PathBuf) -> Result<Self, SessionError> {
        fs::create_dir_all(&sessions_dir)?;
        Ok(Self { sessions_dir })
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

        // Sort by started_at descending
        sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        Ok(sessions)
    }

    pub fn get_session(&self, session_id: &str) -> Result<SessionEnvelope, SessionError> {
        let path = self.sessions_dir.join(format!("{}.json", session_id));
        if !path.exists() {
            return Err(SessionError::NotFound(session_id.to_string()));
        }
        let contents = fs::read_to_string(&path)?;
        let session: SessionEnvelope = serde_json::from_str(&contents)?;
        Ok(session)
    }

    pub fn read_session_log(
        &self,
        session_id: &str,
        tail_lines: Option<usize>,
    ) -> Result<String, SessionError> {
        let log_path = self.sessions_dir.join(format!("{}.log", session_id));
        if !log_path.exists() {
            return Err(SessionError::NotFound(session_id.to_string()));
        }

        let contents = fs::read_to_string(&log_path)?;

        if let Some(n) = tail_lines {
            let lines: Vec<&str> = contents.lines().collect();
            let start = if lines.len() > n { lines.len() - n } else { 0 };
            Ok(lines[start..].join("\n"))
        } else {
            Ok(contents)
        }
    }

    pub fn sessions_dir(&self) -> &Path {
        &self.sessions_dir
    }
}
