use crate::claude_adapter::{atomic_write, Agent, ClaudeRepoAdapter, NormalizedConfig};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PackError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Pack not found: {0}")]
    NotFound(String),
    #[error("Invalid pack: {0}")]
    Invalid(String),
    #[error("Git error: {0}")]
    Git(String),
    #[error("Claude adapter error: {0}")]
    Adapter(String),
}

// -- Pack types --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackManifest {
    pub pack_id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: Option<String>,
    pub created_at: String,
    pub agent_count: usize,
    pub has_config: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackContents {
    pub manifest: PackManifest,
    pub agents: Vec<Agent>,
    pub config: Option<NormalizedConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackSummary {
    pub pack_id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: Option<String>,
    pub agent_count: usize,
    pub has_config: bool,
    pub file_path: String,
    pub source: PackSource,
    pub git_source: Option<GitSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PackSource {
    Local,
    Library,
    Git,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSource {
    pub repo_url: String,
    pub branch: Option<String>,
    pub installed_commit: String,
    pub installed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackUpdateCheck {
    pub pack_id: String,
    pub name: String,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub installed_commit: String,
    pub latest_commit: String,
    pub update_available: bool,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportMode {
    AddOnly,
    Overwrite,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub agents_to_add: Vec<String>,
    pub agents_to_update: Vec<String>,
    pub config_changes: bool,
}

pub struct PackManager {
    packs_dir: PathBuf,
    library_dir: PathBuf,
}

impl PackManager {
    pub fn new(packs_dir: PathBuf, library_dir: PathBuf) -> Self {
        Self {
            packs_dir,
            library_dir,
        }
    }

    /// Export agents and config from a repo into a .agentpack file (JSON-based)
    pub fn export_pack(
        &self,
        repo_path: &str,
        name: &str,
        description: &str,
        author: Option<&str>,
        include_config: bool,
        agent_ids: &[String],
        version: Option<&str>,
    ) -> Result<String, PackError> {
        let all_agents = ClaudeRepoAdapter::read_agents(repo_path)
            .map_err(|e| PackError::Adapter(e.to_string()))?;

        let selected_agents: Vec<Agent> = if agent_ids.is_empty() {
            all_agents
        } else {
            all_agents
                .into_iter()
                .filter(|a| agent_ids.contains(&a.agent_id))
                .collect()
        };

        let config = if include_config {
            Some(
                ClaudeRepoAdapter::read_config(repo_path)
                    .map_err(|e| PackError::Adapter(e.to_string()))?,
            )
        } else {
            None
        };

        let pack_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        let manifest = PackManifest {
            pack_id: pack_id.clone(),
            name: name.to_string(),
            version: version.unwrap_or("1.0.0").to_string(),
            description: description.to_string(),
            author: author.map(String::from),
            created_at: now,
            agent_count: selected_agents.len(),
            has_config: config.is_some(),
        };

        let contents = PackContents {
            manifest,
            agents: selected_agents,
            config,
        };

        let filename = format!(
            "{}.agentpack",
            name.to_lowercase().replace(' ', "-")
        );
        let output_path = self.packs_dir.join(&filename);
        let json = serde_json::to_string_pretty(&contents)?;
        atomic_write(&output_path, &json)?;

        Ok(output_path.to_string_lossy().to_string())
    }

    /// Install pack(s) from a git repository URL
    pub fn install_from_git(
        &self,
        repo_url: &str,
        branch: Option<&str>,
    ) -> Result<Vec<PackSummary>, PackError> {
        // Create a temp directory for cloning
        let temp_dir = self.packs_dir.join(".git-tmp");
        if temp_dir.exists() {
            fs::remove_dir_all(&temp_dir)?;
        }

        // Clone the repo
        let mut cmd = Command::new("git");
        cmd.arg("clone").arg("--depth").arg("1");
        if let Some(b) = branch {
            cmd.arg("--branch").arg(b);
        }
        cmd.arg(repo_url).arg(&temp_dir);

        let output = cmd.output().map_err(|e| {
            PackError::Git(format!("Failed to run git: {}", e))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(PackError::Git(format!("git clone failed: {}", stderr)));
        }

        // Get the commit hash
        let commit_output = Command::new("git")
            .arg("-C")
            .arg(&temp_dir)
            .arg("rev-parse")
            .arg("HEAD")
            .output()
            .map_err(|e| PackError::Git(format!("Failed to get commit hash: {}", e)))?;

        let commit_hash = String::from_utf8_lossy(&commit_output.stdout)
            .trim()
            .to_string();

        // Scan for .agentpack files in the cloned repo
        let mut installed = Vec::new();
        let entries = fs::read_dir(&temp_dir)?;

        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "agentpack") {
                match self.install_pack_file(&path, repo_url, branch, &commit_hash) {
                    Ok(summary) => installed.push(summary),
                    Err(e) => {
                        eprintln!("Warning: failed to install {}: {}", path.display(), e);
                    }
                }
            }
        }

        // Also check subdirectories one level deep
        for entry in fs::read_dir(&temp_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() && path.file_name().map_or(true, |n| !n.to_string_lossy().starts_with('.')) {
                if let Ok(sub_entries) = fs::read_dir(&path) {
                    for sub_entry in sub_entries {
                        if let Ok(sub_entry) = sub_entry {
                            let sub_path = sub_entry.path();
                            if sub_path.extension().map_or(false, |ext| ext == "agentpack") {
                                match self.install_pack_file(&sub_path, repo_url, branch, &commit_hash) {
                                    Ok(summary) => installed.push(summary),
                                    Err(e) => {
                                        eprintln!("Warning: failed to install {}: {}", sub_path.display(), e);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Clean up temp dir
        let _ = fs::remove_dir_all(&temp_dir);

        if installed.is_empty() {
            return Err(PackError::Invalid(
                "No .agentpack files found in the repository".to_string(),
            ));
        }

        Ok(installed)
    }

    /// Check all git-sourced packs for available updates
    pub fn check_updates(&self) -> Result<Vec<PackUpdateCheck>, PackError> {
        let packs = self.list_packs()?;
        let mut updates = Vec::new();

        for pack in packs {
            if let Some(ref git_source) = pack.git_source {
                match self.check_single_update(&pack, git_source) {
                    Ok(check) => updates.push(check),
                    Err(e) => {
                        eprintln!("Warning: failed to check updates for {}: {}", pack.name, e);
                    }
                }
            }
        }

        Ok(updates)
    }

    /// Update a single git-sourced pack to the latest version
    pub fn update_pack(&self, pack_path: &str) -> Result<PackSummary, PackError> {
        let path = Path::new(pack_path);
        let source_path = path.with_extension("source.json");

        if !source_path.exists() {
            return Err(PackError::Invalid(
                "Pack has no git source metadata - not a git-installed pack".to_string(),
            ));
        }

        let source_json = fs::read_to_string(&source_path)?;
        let git_source: GitSource = serde_json::from_str(&source_json)?;

        // Clone fresh
        let temp_dir = self.packs_dir.join(".git-update-tmp");
        if temp_dir.exists() {
            fs::remove_dir_all(&temp_dir)?;
        }

        let mut cmd = Command::new("git");
        cmd.arg("clone").arg("--depth").arg("1");
        if let Some(ref b) = git_source.branch {
            cmd.arg("--branch").arg(b);
        }
        cmd.arg(&git_source.repo_url).arg(&temp_dir);

        let output = cmd.output().map_err(|e| {
            PackError::Git(format!("Failed to run git: {}", e))
        })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(PackError::Git(format!("git clone failed: {}", stderr)));
        }

        // Get new commit hash
        let commit_output = Command::new("git")
            .arg("-C")
            .arg(&temp_dir)
            .arg("rev-parse")
            .arg("HEAD")
            .output()
            .map_err(|e| PackError::Git(format!("Failed to get commit hash: {}", e)))?;

        let new_commit = String::from_utf8_lossy(&commit_output.stdout)
            .trim()
            .to_string();

        // Find the matching .agentpack file in the cloned repo
        // We match by reading pack_id from the existing installed pack
        let existing_contents = self.read_pack(pack_path)?;
        let existing_pack_id = &existing_contents.manifest.pack_id;

        let mut found_path: Option<PathBuf> = None;
        self.find_pack_in_dir(&temp_dir, existing_pack_id, &mut found_path)?;

        let source_pack_path = found_path.ok_or_else(|| {
            let _ = fs::remove_dir_all(&temp_dir);
            PackError::NotFound(format!(
                "Pack '{}' no longer exists in the repository",
                existing_pack_id
            ))
        })?;

        // Read and validate the new pack
        let new_json = fs::read_to_string(&source_pack_path)?;
        let new_contents: PackContents = serde_json::from_str(&new_json)?;

        // Overwrite the installed pack file
        atomic_write(Path::new(pack_path), &new_json)?;

        // Update the source metadata
        let new_source = GitSource {
            repo_url: git_source.repo_url.clone(),
            branch: git_source.branch.clone(),
            installed_commit: new_commit,
            installed_at: chrono::Utc::now().to_rfc3339(),
        };
        let source_json = serde_json::to_string_pretty(&new_source)?;
        atomic_write(&source_path, &source_json)?;

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);

        let m = new_contents.manifest;
        Ok(PackSummary {
            pack_id: m.pack_id,
            name: m.name,
            version: m.version,
            description: m.description,
            author: m.author,
            agent_count: m.agent_count,
            has_config: m.has_config,
            file_path: pack_path.to_string(),
            source: PackSource::Git,
            git_source: Some(new_source),
        })
    }

    /// Preview what importing a pack would do to a repo
    pub fn preview_import(
        &self,
        pack_path: &str,
        repo_path: &str,
    ) -> Result<ImportPreview, PackError> {
        let contents = self.read_pack(pack_path)?;

        let existing_agents = ClaudeRepoAdapter::read_agents(repo_path)
            .map_err(|e| PackError::Adapter(e.to_string()))?;

        let existing_ids: Vec<String> = existing_agents.iter().map(|a| a.agent_id.clone()).collect();

        let mut agents_to_add = Vec::new();
        let mut agents_to_update = Vec::new();

        for agent in &contents.agents {
            if existing_ids.contains(&agent.agent_id) {
                agents_to_update.push(agent.agent_id.clone());
            } else {
                agents_to_add.push(agent.agent_id.clone());
            }
        }

        Ok(ImportPreview {
            agents_to_add,
            agents_to_update,
            config_changes: contents.config.is_some(),
        })
    }

    /// Import a pack into a repo
    pub fn import_pack(
        &self,
        pack_path: &str,
        repo_path: &str,
        mode: ImportMode,
    ) -> Result<(), PackError> {
        let contents = self.read_pack(pack_path)?;

        let existing_agents = ClaudeRepoAdapter::read_agents(repo_path)
            .map_err(|e| PackError::Adapter(e.to_string()))?;
        let existing_ids: Vec<String> = existing_agents.iter().map(|a| a.agent_id.clone()).collect();

        for agent in &contents.agents {
            let exists = existing_ids.contains(&agent.agent_id);
            match mode {
                ImportMode::AddOnly => {
                    if !exists {
                        ClaudeRepoAdapter::write_agent(repo_path, agent)
                            .map_err(|e| PackError::Adapter(e.to_string()))?;
                    }
                }
                ImportMode::Overwrite => {
                    ClaudeRepoAdapter::write_agent(repo_path, agent)
                        .map_err(|e| PackError::Adapter(e.to_string()))?;
                }
            }
        }

        if let Some(ref config) = contents.config {
            ClaudeRepoAdapter::write_config(repo_path, config)
                .map_err(|e| PackError::Adapter(e.to_string()))?;
        }

        Ok(())
    }

    /// List all packs (local + library + git-installed)
    pub fn list_packs(&self) -> Result<Vec<PackSummary>, PackError> {
        let mut packs = Vec::new();

        // Scan local packs directory (skip git temp dirs)
        packs.extend(self.scan_directory(&self.packs_dir, PackSource::Local)?);

        // Scan library directory
        if self.library_dir.exists() {
            packs.extend(self.scan_directory(&self.library_dir, PackSource::Library)?);
        }

        Ok(packs)
    }

    /// Delete a local pack (also removes source metadata if present)
    pub fn delete_pack(&self, pack_path: &str) -> Result<(), PackError> {
        let path = Path::new(pack_path);
        if !path.exists() {
            return Err(PackError::NotFound(pack_path.to_string()));
        }
        fs::remove_file(path)?;

        // Also remove source metadata sidecar if it exists
        let source_path = path.with_extension("source.json");
        if source_path.exists() {
            let _ = fs::remove_file(source_path);
        }

        Ok(())
    }

    /// Read a pack's full contents
    pub fn read_pack(&self, pack_path: &str) -> Result<PackContents, PackError> {
        let path = Path::new(pack_path);
        if !path.exists() {
            return Err(PackError::NotFound(pack_path.to_string()));
        }
        let json = fs::read_to_string(path)?;
        let contents: PackContents = serde_json::from_str(&json)?;
        Ok(contents)
    }

    /// Set or update the library directory path
    pub fn set_library_dir(&mut self, dir: PathBuf) {
        self.library_dir = dir;
    }

    pub fn packs_dir(&self) -> &Path {
        &self.packs_dir
    }

    pub fn library_dir(&self) -> &Path {
        &self.library_dir
    }

    // -- Private helpers --

    /// Install a single .agentpack file from a cloned repo into the library
    fn install_pack_file(
        &self,
        source_path: &Path,
        repo_url: &str,
        branch: Option<&str>,
        commit_hash: &str,
    ) -> Result<PackSummary, PackError> {
        let json = fs::read_to_string(source_path)?;
        let contents: PackContents = serde_json::from_str(&json)?;

        // Determine destination filename
        let filename = source_path
            .file_name()
            .ok_or_else(|| PackError::Invalid("Invalid pack filename".to_string()))?;
        let dest_path = self.library_dir.join(filename);

        // Write the pack file to library
        atomic_write(&dest_path, &json)?;

        // Write git source metadata sidecar
        let git_source = GitSource {
            repo_url: repo_url.to_string(),
            branch: branch.map(String::from),
            installed_commit: commit_hash.to_string(),
            installed_at: chrono::Utc::now().to_rfc3339(),
        };
        let source_meta_path = dest_path.with_extension("source.json");
        let source_json = serde_json::to_string_pretty(&git_source)?;
        atomic_write(&source_meta_path, &source_json)?;

        let m = contents.manifest;
        Ok(PackSummary {
            pack_id: m.pack_id,
            name: m.name,
            version: m.version,
            description: m.description,
            author: m.author,
            agent_count: m.agent_count,
            has_config: m.has_config,
            file_path: dest_path.to_string_lossy().to_string(),
            source: PackSource::Git,
            git_source: Some(git_source),
        })
    }

    /// Check a single git-sourced pack for updates using git ls-remote
    fn check_single_update(
        &self,
        pack: &PackSummary,
        git_source: &GitSource,
    ) -> Result<PackUpdateCheck, PackError> {
        let ref_name = git_source
            .branch
            .as_deref()
            .map(|b| format!("refs/heads/{}", b))
            .unwrap_or_else(|| "HEAD".to_string());

        let output = Command::new("git")
            .arg("ls-remote")
            .arg(&git_source.repo_url)
            .arg(&ref_name)
            .output()
            .map_err(|e| PackError::Git(format!("Failed to run git ls-remote: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(PackError::Git(format!("git ls-remote failed: {}", stderr)));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let latest_commit = stdout
            .split_whitespace()
            .next()
            .unwrap_or("")
            .to_string();

        if latest_commit.is_empty() {
            return Err(PackError::Git("Could not determine remote commit".to_string()));
        }

        let update_available = latest_commit != git_source.installed_commit;

        Ok(PackUpdateCheck {
            pack_id: pack.pack_id.clone(),
            name: pack.name.clone(),
            current_version: pack.version.clone(),
            latest_version: None, // Only known after actually fetching
            installed_commit: git_source.installed_commit.clone(),
            latest_commit,
            update_available,
            file_path: pack.file_path.clone(),
        })
    }

    /// Recursively search for a pack by ID in a directory (one level deep)
    fn find_pack_in_dir(
        &self,
        dir: &Path,
        pack_id: &str,
        result: &mut Option<PathBuf>,
    ) -> Result<(), PackError> {
        if result.is_some() {
            return Ok(());
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.extension().map_or(false, |ext| ext == "agentpack") {
                if let Ok(json) = fs::read_to_string(&path) {
                    if let Ok(contents) = serde_json::from_str::<PackContents>(&json) {
                        if contents.manifest.pack_id == pack_id {
                            *result = Some(path);
                            return Ok(());
                        }
                    }
                }
            }

            // Check one level of subdirectories
            if path.is_dir() && path.file_name().map_or(true, |n| !n.to_string_lossy().starts_with('.')) {
                self.find_pack_in_dir(&path, pack_id, result)?;
            }
        }

        Ok(())
    }

    fn scan_directory(
        &self,
        dir: &Path,
        default_source: PackSource,
    ) -> Result<Vec<PackSummary>, PackError> {
        let mut packs = Vec::new();

        if !dir.exists() {
            return Ok(packs);
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path
                .extension()
                .map_or(false, |ext| ext == "agentpack")
            {
                match self.read_pack_summary(&path, default_source.clone()) {
                    Ok(summary) => packs.push(summary),
                    Err(_) => continue,
                }
            }
        }

        Ok(packs)
    }

    fn read_pack_summary(
        &self,
        path: &Path,
        default_source: PackSource,
    ) -> Result<PackSummary, PackError> {
        let json = fs::read_to_string(path)?;
        let contents: PackContents = serde_json::from_str(&json)?;
        let m = contents.manifest;

        // Check for git source sidecar
        let source_path = path.with_extension("source.json");
        let (source, git_source) = if source_path.exists() {
            let source_json = fs::read_to_string(&source_path)?;
            match serde_json::from_str::<GitSource>(&source_json) {
                Ok(gs) => (PackSource::Git, Some(gs)),
                Err(_) => (default_source, None),
            }
        } else {
            (default_source, None)
        };

        Ok(PackSummary {
            pack_id: m.pack_id,
            name: m.name,
            version: m.version,
            description: m.description,
            author: m.author,
            agent_count: m.agent_count,
            has_config: m.has_config,
            file_path: path.to_string_lossy().to_string(),
            source,
            git_source,
        })
    }
}
