use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum RepoRegistryError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Repo not found: {0}")]
    NotFound(String),
    #[error("Repo already exists at path: {0}")]
    AlreadyExists(String),
    #[error("Invalid path: {0}")]
    InvalidPath(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repo {
    pub repo_id: String,
    pub name: String,
    pub path: String,
    pub pinned: bool,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoStatus {
    pub exists: bool,
    pub is_git_repo: bool,
    pub has_claude_config: bool,
    pub has_claude_md: bool,
    pub has_agents: bool,
}

pub struct RepoRegistry {
    conn: Connection,
}

impl RepoRegistry {
    pub fn new(db_path: &Path) -> Result<Self, RepoRegistryError> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS repos (
                repo_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT UNIQUE NOT NULL,
                pinned BOOLEAN NOT NULL DEFAULT 0,
                last_opened_at TEXT
            );",
        )?;
        Ok(Self { conn })
    }

    pub fn add_repo(&self, path: &str) -> Result<Repo, RepoRegistryError> {
        let canonical = PathBuf::from(path);
        let path_str = canonical.to_string_lossy().to_string();

        if !canonical.exists() {
            return Err(RepoRegistryError::InvalidPath(path_str));
        }

        // Check for duplicates
        let existing: Option<String> = self
            .conn
            .query_row(
                "SELECT repo_id FROM repos WHERE path = ?1",
                params![path_str],
                |row| row.get(0),
            )
            .ok();

        if existing.is_some() {
            return Err(RepoRegistryError::AlreadyExists(path_str));
        }

        let repo_id = uuid::Uuid::new_v4().to_string();
        let name = canonical
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let now = Utc::now().to_rfc3339();

        self.conn.execute(
            "INSERT INTO repos (repo_id, name, path, pinned, last_opened_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![repo_id, name, path_str, false, now],
        )?;

        Ok(Repo {
            repo_id,
            name,
            path: path_str,
            pinned: false,
            last_opened_at: Some(now),
        })
    }

    pub fn remove_repo(&self, repo_id: &str) -> Result<(), RepoRegistryError> {
        let rows = self
            .conn
            .execute("DELETE FROM repos WHERE repo_id = ?1", params![repo_id])?;
        if rows == 0 {
            return Err(RepoRegistryError::NotFound(repo_id.to_string()));
        }
        Ok(())
    }

    pub fn list_repos(&self) -> Result<Vec<Repo>, RepoRegistryError> {
        let mut stmt = self.conn.prepare(
            "SELECT repo_id, name, path, pinned, last_opened_at FROM repos ORDER BY pinned DESC, last_opened_at DESC",
        )?;

        let repos = stmt
            .query_map([], |row| {
                Ok(Repo {
                    repo_id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    pinned: row.get(3)?,
                    last_opened_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(repos)
    }

    pub fn get_repo_status(path: &str) -> RepoStatus {
        let repo_path = Path::new(path);
        RepoStatus {
            exists: repo_path.exists(),
            is_git_repo: repo_path.join(".git").exists(),
            has_claude_config: repo_path.join(".claude").exists()
                || repo_path.join(".claude.json").exists(),
            has_claude_md: repo_path.join("CLAUDE.md").exists(),
            has_agents: repo_path.join(".claude/agents").exists(),
        }
    }

    pub fn update_last_opened(&self, repo_id: &str) -> Result<(), RepoRegistryError> {
        let now: DateTime<Utc> = Utc::now();
        let rows = self.conn.execute(
            "UPDATE repos SET last_opened_at = ?1 WHERE repo_id = ?2",
            params![now.to_rfc3339(), repo_id],
        )?;
        if rows == 0 {
            return Err(RepoRegistryError::NotFound(repo_id.to_string()));
        }
        Ok(())
    }

    pub fn toggle_pin(&self, repo_id: &str) -> Result<(), RepoRegistryError> {
        let rows = self.conn.execute(
            "UPDATE repos SET pinned = NOT pinned WHERE repo_id = ?1",
            params![repo_id],
        )?;
        if rows == 0 {
            return Err(RepoRegistryError::NotFound(repo_id.to_string()));
        }
        Ok(())
    }
}
