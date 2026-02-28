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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_registry() -> (tempfile::TempDir, RepoRegistry) {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("test.db");
        let registry = RepoRegistry::new(&db_path).unwrap();
        (tmp, registry)
    }

    #[test]
    fn new_creates_database() {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("test.db");
        let _registry = RepoRegistry::new(&db_path).unwrap();
        assert!(db_path.exists());
    }

    #[test]
    fn add_and_list_repo() {
        let (tmp, registry) = make_registry();
        // Create a directory to add as a repo
        let repo_dir = tmp.path().join("my-repo");
        std::fs::create_dir(&repo_dir).unwrap();

        let repo = registry.add_repo(repo_dir.to_str().unwrap()).unwrap();
        assert_eq!(repo.name, "my-repo");
        assert!(!repo.pinned);

        let repos = registry.list_repos().unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].name, "my-repo");
    }

    #[test]
    fn add_duplicate_repo_fails() {
        let (tmp, registry) = make_registry();
        let repo_dir = tmp.path().join("my-repo");
        std::fs::create_dir(&repo_dir).unwrap();

        registry.add_repo(repo_dir.to_str().unwrap()).unwrap();
        let result = registry.add_repo(repo_dir.to_str().unwrap());
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), RepoRegistryError::AlreadyExists(_)));
    }

    #[test]
    fn add_nonexistent_path_fails() {
        let (tmp, registry) = make_registry();
        let bad_path = tmp.path().join("nonexistent");

        let result = registry.add_repo(bad_path.to_str().unwrap());
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), RepoRegistryError::InvalidPath(_)));
    }

    #[test]
    fn remove_repo() {
        let (tmp, registry) = make_registry();
        let repo_dir = tmp.path().join("my-repo");
        std::fs::create_dir(&repo_dir).unwrap();

        let repo = registry.add_repo(repo_dir.to_str().unwrap()).unwrap();
        registry.remove_repo(&repo.repo_id).unwrap();

        let repos = registry.list_repos().unwrap();
        assert_eq!(repos.len(), 0);
    }

    #[test]
    fn remove_nonexistent_repo_fails() {
        let (_tmp, registry) = make_registry();
        let result = registry.remove_repo("fake-id");
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), RepoRegistryError::NotFound(_)));
    }

    #[test]
    fn toggle_pin() {
        let (tmp, registry) = make_registry();
        let repo_dir = tmp.path().join("my-repo");
        std::fs::create_dir(&repo_dir).unwrap();

        let repo = registry.add_repo(repo_dir.to_str().unwrap()).unwrap();
        assert!(!repo.pinned);

        registry.toggle_pin(&repo.repo_id).unwrap();
        let repos = registry.list_repos().unwrap();
        assert!(repos[0].pinned);

        registry.toggle_pin(&repo.repo_id).unwrap();
        let repos = registry.list_repos().unwrap();
        assert!(!repos[0].pinned);
    }

    #[test]
    fn toggle_pin_nonexistent_fails() {
        let (_tmp, registry) = make_registry();
        let result = registry.toggle_pin("fake-id");
        assert!(result.is_err());
    }

    #[test]
    fn update_last_opened() {
        let (tmp, registry) = make_registry();
        let repo_dir = tmp.path().join("my-repo");
        std::fs::create_dir(&repo_dir).unwrap();

        let repo = registry.add_repo(repo_dir.to_str().unwrap()).unwrap();
        let original_time = repo.last_opened_at.clone();

        // Small delay to ensure different timestamp
        std::thread::sleep(std::time::Duration::from_millis(10));
        registry.update_last_opened(&repo.repo_id).unwrap();

        let repos = registry.list_repos().unwrap();
        assert_ne!(repos[0].last_opened_at, original_time);
    }

    #[test]
    fn update_last_opened_nonexistent_fails() {
        let (_tmp, registry) = make_registry();
        let result = registry.update_last_opened("fake-id");
        assert!(result.is_err());
    }

    #[test]
    fn list_repos_ordered_by_pinned_then_recent() {
        let (tmp, registry) = make_registry();

        let repo_a_dir = tmp.path().join("aaa");
        let repo_b_dir = tmp.path().join("bbb");
        std::fs::create_dir(&repo_a_dir).unwrap();
        std::fs::create_dir(&repo_b_dir).unwrap();

        let repo_a = registry.add_repo(repo_a_dir.to_str().unwrap()).unwrap();
        let _repo_b = registry.add_repo(repo_b_dir.to_str().unwrap()).unwrap();

        // Pin repo_a - it should appear first
        registry.toggle_pin(&repo_a.repo_id).unwrap();

        let repos = registry.list_repos().unwrap();
        assert_eq!(repos[0].name, "aaa");
        assert!(repos[0].pinned);
    }

    #[test]
    fn get_repo_status_nonexistent_path() {
        let status = RepoRegistry::get_repo_status("/tmp/definitely-does-not-exist-xyz");
        assert!(!status.exists);
        assert!(!status.is_git_repo);
        assert!(!status.has_claude_config);
        assert!(!status.has_claude_md);
        assert!(!status.has_agents);
    }

    #[test]
    fn get_repo_status_with_claude_config() {
        let tmp = tempfile::tempdir().unwrap();
        let repo_dir = tmp.path().join("repo");
        std::fs::create_dir(&repo_dir).unwrap();
        std::fs::create_dir(repo_dir.join(".git")).unwrap();
        std::fs::create_dir_all(repo_dir.join(".claude/agents")).unwrap();
        std::fs::write(repo_dir.join("CLAUDE.md"), "# Test").unwrap();

        let status = RepoRegistry::get_repo_status(repo_dir.to_str().unwrap());
        assert!(status.exists);
        assert!(status.is_git_repo);
        assert!(status.has_claude_config);
        assert!(status.has_claude_md);
        assert!(status.has_agents);
    }
}
