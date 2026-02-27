use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ClaudeAdapterError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Claude config not found at: {0}")]
    ConfigNotFound(String),
    #[error("Agent not found: {0}")]
    AgentNotFound(String),
    #[error("Memory store not found: {0}")]
    MemoryStoreNotFound(String),
}

// -- Normalized internal types --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDetection {
    pub has_settings_json: bool,
    pub has_claude_md: bool,
    pub has_agents_dir: bool,
    pub has_memory_dir: bool,
    pub config_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedConfig {
    pub model: Option<String>,
    pub permissions: Option<serde_json::Value>,
    pub ignore_patterns: Option<Vec<String>>,
    pub raw: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub agent_id: String,
    pub name: String,
    pub system_prompt: String,
    pub tools: Vec<String>,
    pub model_override: Option<String>,
    pub memory_binding: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStore {
    pub store_id: String,
    pub name: String,
    pub path: String,
    pub entry_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEntry {
    pub key: String,
    pub content: String,
}

pub struct ClaudeRepoAdapter;

impl ClaudeRepoAdapter {
    /// Detect Claude Code configuration presence in a repo
    pub fn detect(repo_path: &str) -> ClaudeDetection {
        let base = Path::new(repo_path);
        let claude_dir = base.join(".claude");
        let settings_json = claude_dir.join("settings.json");
        let claude_md = base.join("CLAUDE.md");
        let agents_dir = claude_dir.join("agents");
        let memory_dir = claude_dir.join("memory");

        ClaudeDetection {
            has_settings_json: settings_json.exists(),
            has_claude_md: claude_md.exists(),
            has_agents_dir: agents_dir.exists(),
            has_memory_dir: memory_dir.exists(),
            config_path: if settings_json.exists() {
                Some(settings_json.to_string_lossy().to_string())
            } else {
                None
            },
        }
    }

    /// Read and normalize Claude settings.json
    pub fn read_config(repo_path: &str) -> Result<NormalizedConfig, ClaudeAdapterError> {
        let settings_path = Path::new(repo_path).join(".claude/settings.json");
        if !settings_path.exists() {
            // Return empty config if no settings file
            return Ok(NormalizedConfig {
                model: None,
                permissions: None,
                ignore_patterns: None,
                raw: serde_json::json!({}),
            });
        }

        let contents = fs::read_to_string(&settings_path)?;
        let raw: serde_json::Value = serde_json::from_str(&contents)?;

        Ok(NormalizedConfig {
            model: raw.get("model").and_then(|v| v.as_str()).map(String::from),
            permissions: raw.get("permissions").cloned(),
            ignore_patterns: raw.get("ignorePatterns").and_then(|v| {
                v.as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
            }),
            raw: raw.clone(),
        })
    }

    /// Write normalized config back to Claude settings.json
    pub fn write_config(
        repo_path: &str,
        config: &NormalizedConfig,
    ) -> Result<(), ClaudeAdapterError> {
        let claude_dir = Path::new(repo_path).join(".claude");
        fs::create_dir_all(&claude_dir)?;
        let settings_path = claude_dir.join("settings.json");

        let mut output = config.raw.clone();
        if let Some(ref model) = config.model {
            output["model"] = serde_json::json!(model);
        }
        if let Some(ref permissions) = config.permissions {
            output["permissions"] = permissions.clone();
        }
        if let Some(ref patterns) = config.ignore_patterns {
            output["ignorePatterns"] = serde_json::json!(patterns);
        }

        let json = serde_json::to_string_pretty(&output)?;
        atomic_write(&settings_path, &json)?;
        Ok(())
    }

    /// Read all agents from .claude/agents/
    pub fn read_agents(repo_path: &str) -> Result<Vec<Agent>, ClaudeAdapterError> {
        let agents_dir = Path::new(repo_path).join(".claude/agents");
        if !agents_dir.exists() {
            return Ok(vec![]);
        }

        let mut agents = Vec::new();
        for entry in fs::read_dir(&agents_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
                let agent = Self::parse_agent_file(&path)?;
                agents.push(agent);
            }
        }

        agents.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(agents)
    }

    /// Write an agent to .claude/agents/<agent_id>.md
    pub fn write_agent(repo_path: &str, agent: &Agent) -> Result<(), ClaudeAdapterError> {
        let agents_dir = Path::new(repo_path).join(".claude/agents");
        fs::create_dir_all(&agents_dir)?;
        let agent_path = agents_dir.join(format!("{}.md", agent.agent_id));

        // Build agent markdown file
        let mut content = String::new();
        content.push_str(&format!("# {}\n\n", agent.name));
        content.push_str(&agent.system_prompt);
        content.push('\n');

        atomic_write(&agent_path, &content)?;
        Ok(())
    }

    /// Delete an agent file
    pub fn delete_agent(repo_path: &str, agent_id: &str) -> Result<(), ClaudeAdapterError> {
        let agent_path = Path::new(repo_path).join(format!(".claude/agents/{}.md", agent_id));
        if !agent_path.exists() {
            return Err(ClaudeAdapterError::AgentNotFound(agent_id.to_string()));
        }
        fs::remove_file(&agent_path)?;
        Ok(())
    }

    /// Read memory stores from .claude/memory/
    pub fn read_memory_stores(repo_path: &str) -> Result<Vec<MemoryStore>, ClaudeAdapterError> {
        let memory_dir = Path::new(repo_path).join(".claude/memory");
        if !memory_dir.exists() {
            return Ok(vec![]);
        }

        let mut stores = Vec::new();
        for entry in fs::read_dir(&memory_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
                let store_id = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let contents = fs::read_to_string(&path)?;
                let entry_count = contents
                    .lines()
                    .filter(|l| l.starts_with("- ") || l.starts_with("* "))
                    .count();

                stores.push(MemoryStore {
                    store_id: store_id.clone(),
                    name: store_id,
                    path: path.to_string_lossy().to_string(),
                    entry_count,
                });
            }
        }

        Ok(stores)
    }

    /// Read entries from a memory store file
    pub fn read_memory_entries(store_path: &str) -> Result<Vec<MemoryEntry>, ClaudeAdapterError> {
        let path = Path::new(store_path);
        if !path.exists() {
            return Err(ClaudeAdapterError::MemoryStoreNotFound(
                store_path.to_string(),
            ));
        }

        let contents = fs::read_to_string(path)?;
        let mut entries = Vec::new();
        let mut current_key = String::new();
        let mut current_content = String::new();
        let mut idx = 0;

        for line in contents.lines() {
            if line.starts_with("- ") || line.starts_with("* ") {
                if !current_key.is_empty() {
                    entries.push(MemoryEntry {
                        key: current_key.clone(),
                        content: current_content.trim().to_string(),
                    });
                }
                idx += 1;
                current_key = format!("entry_{}", idx);
                current_content = line[2..].to_string();
            } else if !current_key.is_empty() {
                current_content.push('\n');
                current_content.push_str(line);
            }
        }

        if !current_key.is_empty() {
            entries.push(MemoryEntry {
                key: current_key,
                content: current_content.trim().to_string(),
            });
        }

        Ok(entries)
    }

    /// Write a memory entry to a store
    pub fn write_memory_entry(
        store_path: &str,
        entry: &MemoryEntry,
    ) -> Result<(), ClaudeAdapterError> {
        let path = Path::new(store_path);
        let parent = path.parent().ok_or_else(|| {
            ClaudeAdapterError::MemoryStoreNotFound(store_path.to_string())
        })?;
        fs::create_dir_all(parent)?;

        let mut contents = if path.exists() {
            fs::read_to_string(path)?
        } else {
            String::new()
        };

        if !contents.is_empty() && !contents.ends_with('\n') {
            contents.push('\n');
        }
        contents.push_str(&format!("- {}\n", entry.content));

        atomic_write(path, &contents)?;
        Ok(())
    }

    /// Reset (clear) a memory store
    pub fn reset_memory(store_path: &str) -> Result<(), ClaudeAdapterError> {
        let path = Path::new(store_path);
        if !path.exists() {
            return Err(ClaudeAdapterError::MemoryStoreNotFound(
                store_path.to_string(),
            ));
        }
        atomic_write(path, "")?;
        Ok(())
    }

    // -- Private helpers --

    fn parse_agent_file(path: &Path) -> Result<Agent, ClaudeAdapterError> {
        let contents = fs::read_to_string(path)?;
        let agent_id = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        // Extract name from first markdown heading
        let name = contents
            .lines()
            .find(|l| l.starts_with("# "))
            .map(|l| l[2..].trim().to_string())
            .unwrap_or_else(|| agent_id.clone());

        // Everything after the heading is the system prompt
        let system_prompt = contents
            .lines()
            .skip_while(|l| !l.starts_with("# "))
            .skip(1) // skip the heading line
            .collect::<Vec<&str>>()
            .join("\n")
            .trim()
            .to_string();

        Ok(Agent {
            agent_id,
            name,
            system_prompt,
            tools: vec![],
            model_override: None,
            memory_binding: None,
        })
    }
}

/// Atomic file write: write to temp file, then rename
fn atomic_write(path: &Path, contents: &str) -> Result<(), std::io::Error> {
    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, contents)?;
    fs::rename(&temp_path, path)?;
    Ok(())
}
