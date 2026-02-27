use crate::claude_adapter::{atomic_write, Agent, ClaudeRepoAdapter, NormalizedConfig};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
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
    #[error("Zip error: {0}")]
    Zip(String),
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PackSource {
    Local,
    Library,
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
            version: "1.0.0".to_string(),
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

    /// List all packs (local + library)
    pub fn list_packs(&self) -> Result<Vec<PackSummary>, PackError> {
        let mut packs = Vec::new();

        // Scan local packs directory
        packs.extend(self.scan_directory(&self.packs_dir, PackSource::Local)?);

        // Scan library directory
        if self.library_dir.exists() {
            packs.extend(self.scan_directory(&self.library_dir, PackSource::Library)?);
        }

        Ok(packs)
    }

    /// Delete a local pack
    pub fn delete_pack(&self, pack_path: &str) -> Result<(), PackError> {
        let path = Path::new(pack_path);
        if !path.exists() {
            return Err(PackError::NotFound(pack_path.to_string()));
        }
        fs::remove_file(path)?;
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

    fn scan_directory(
        &self,
        dir: &Path,
        source: PackSource,
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
                match self.read_pack_summary(&path, source.clone()) {
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
        source: PackSource,
    ) -> Result<PackSummary, PackError> {
        let json = fs::read_to_string(path)?;
        let contents: PackContents = serde_json::from_str(&json)?;
        let m = contents.manifest;

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
        })
    }
}
