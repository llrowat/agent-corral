use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ClaudeAdapterError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("YAML error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("Claude config not found at: {0}")]
    ConfigNotFound(String),
    #[error("Agent not found: {0}")]
    AgentNotFound(String),
    #[error("Memory store not found: {0}")]
    MemoryStoreNotFound(String),
    #[error("Memory entry not found: index {0}")]
    MemoryEntryNotFound(usize),
    #[error("Skill not found: {0}")]
    SkillNotFound(String),
    #[error("MCP server not found: {0}")]
    McpServerNotFound(String),
}

// -- Normalized internal types --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDetection {
    pub has_settings_json: bool,
    pub has_claude_md: bool,
    pub has_agents_dir: bool,
    pub has_memory_dir: bool,
    pub has_skills_dir: bool,
    pub has_mcp_json: bool,
    pub hook_count: usize,
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
    pub description: String,
    pub system_prompt: String,
    pub tools: Vec<String>,
    pub model_override: Option<String>,
    pub memory: Option<String>,
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

// -- Hook types --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookHandler {
    #[serde(rename = "type")]
    pub hook_type: String,
    pub command: Option<String>,
    pub prompt: Option<String>,
    pub timeout: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookGroup {
    pub matcher: Option<String>,
    pub hooks: Vec<HookHandler>,
    #[serde(rename = "_disabled", skip_serializing_if = "Option::is_none")]
    pub disabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookEvent {
    pub event: String,
    pub groups: Vec<HookGroup>,
}

// -- Skill types --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub skill_id: String,
    pub name: String,
    pub description: Option<String>,
    pub user_invocable: Option<bool>,
    pub allowed_tools: Vec<String>,
    pub model: Option<String>,
    pub disable_model_invocation: Option<bool>,
    pub context: Option<String>,
    pub agent: Option<String>,
    pub argument_hint: Option<String>,
    pub content: String,
}

// -- MCP types --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub server_id: String,
    #[serde(rename = "type")]
    pub server_type: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub env: Option<serde_json::Value>,
    pub headers: Option<serde_json::Value>,
    #[serde(rename = "_disabled", skip_serializing_if = "Option::is_none")]
    pub disabled: Option<bool>,
}

/// Known Claude Code tools for the tools selector
pub const KNOWN_TOOLS: &[&str] = &[
    "Read",
    "Write",
    "Edit",
    "Bash",
    "Glob",
    "Grep",
    "WebFetch",
    "WebSearch",
    "TodoWrite",
    "NotebookEdit",
    "Agent",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSnapshot {
    pub snapshot_id: String,
    pub label: String,
    pub timestamp: String,
    pub settings_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSnapshotSummary {
    pub snapshot_id: String,
    pub label: String,
    pub timestamp: String,
    pub has_settings: bool,
}

// -- Config Bundle types (backup/restore) --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigBundle {
    pub version: String,
    pub created_at: String,
    pub scope: String,
    pub agents: Vec<serde_json::Value>,
    pub skills: Vec<serde_json::Value>,
    pub hooks: Vec<serde_json::Value>,
    pub mcp_servers: serde_json::Value,
    pub settings: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBundleResult {
    pub agents_imported: usize,
    pub skills_imported: usize,
    pub hooks_imported: usize,
    pub mcp_servers_imported: usize,
    pub settings_imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScanResult {
    pub has_claude_md: bool,
    pub claude_md_count: usize,
    pub agent_count: usize,
    pub skill_count: usize,
    pub hook_count: usize,
    pub mcp_server_count: usize,
    pub has_settings: bool,
    pub has_memory: bool,
    pub memory_store_count: usize,
}

// -- Config Lint types --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintIssue {
    pub severity: String,   // "error", "warning", "info"
    pub category: String,   // "config", "agent", "hook", "skill", "mcp", "claudemd", "hierarchy"
    pub rule: String,       // machine-readable rule ID
    pub message: String,
    pub fix: Option<String>,
    pub entity_id: Option<String>,  // which agent/skill/server/etc is affected
    pub scope: Option<String>,      // "global", "project", or null
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintResult {
    pub issues: Vec<LintIssue>,
    pub score: u32,            // 0-100 health score
    pub error_count: u32,
    pub warning_count: u32,
    pub info_count: u32,
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
        let skills_dir = claude_dir.join("skills");
        let mcp_json = base.join(".mcp.json");
        let claude_json = base.join(".claude.json");

        // Count hooks from settings.json
        let hook_count = if settings_json.exists() {
            fs::read_to_string(&settings_json)
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| v.get("hooks").cloned())
                .and_then(|h| h.as_object().map(|obj| obj.len()))
                .unwrap_or(0)
        } else {
            0
        };

        ClaudeDetection {
            has_settings_json: settings_json.exists(),
            has_claude_md: claude_md.exists(),
            has_agents_dir: agents_dir.exists(),
            has_memory_dir: memory_dir.exists(),
            has_skills_dir: skills_dir.exists(),
            has_mcp_json: mcp_json.exists() || claude_json.exists(),
            hook_count,
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
                let agent_id = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let agent = Self::parse_agent_file(&path, &agent_id, repo_path)?;
                agents.push(agent);
            }
        }

        agents.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(agents)
    }

    /// Write an agent to .claude/agents/<agent_id>.md with YAML frontmatter
    pub fn write_agent(repo_path: &str, agent: &Agent) -> Result<(), ClaudeAdapterError> {
        let agents_dir = Path::new(repo_path).join(".claude/agents");
        fs::create_dir_all(&agents_dir)?;
        let agent_path = agents_dir.join(format!("{}.md", agent.agent_id));

        // Build YAML frontmatter
        let mut frontmatter = serde_json::Map::new();
        frontmatter.insert(
            "name".to_string(),
            serde_json::Value::String(agent.name.clone()),
        );
        frontmatter.insert(
            "description".to_string(),
            serde_json::Value::String(agent.description.clone()),
        );
        if !agent.tools.is_empty() {
            frontmatter.insert(
                "tools".to_string(),
                serde_json::Value::String(agent.tools.join(", ")),
            );
        }
        if let Some(ref model) = agent.model_override {
            frontmatter.insert(
                "model".to_string(),
                serde_json::Value::String(model.clone()),
            );
        }
        if let Some(ref memory) = agent.memory {
            frontmatter.insert(
                "memory".to_string(),
                serde_json::Value::String(memory.clone()),
            );
        }

        let yaml_val = serde_json::Value::Object(frontmatter);
        let yaml_str = serde_yaml::to_string(&yaml_val)?;

        let mut content = String::new();
        content.push_str("---\n");
        content.push_str(&yaml_str);
        content.push_str("---\n\n");
        content.push_str(&agent.system_prompt);
        if !agent.system_prompt.ends_with('\n') {
            content.push('\n');
        }

        atomic_write(&agent_path, &content)?;

        // Clean up stale .meta.json sidecar if it exists (backwards compat)
        let meta_path = agents_dir.join(format!("{}.meta.json", agent.agent_id));
        if meta_path.exists() {
            let _ = fs::remove_file(&meta_path);
        }

        Ok(())
    }

    /// Delete an agent file and its metadata
    pub fn delete_agent(repo_path: &str, agent_id: &str) -> Result<(), ClaudeAdapterError> {
        let agents_dir = Path::new(repo_path).join(".claude/agents");
        let agent_path = agents_dir.join(format!("{}.md", agent_id));
        if !agent_path.exists() {
            return Err(ClaudeAdapterError::AgentNotFound(agent_id.to_string()));
        }
        fs::remove_file(&agent_path)?;

        // Also remove metadata sidecar if it exists
        let meta_path = agents_dir.join(format!("{}.meta.json", agent_id));
        if meta_path.exists() {
            fs::remove_file(&meta_path)?;
        }

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

    /// Create a new memory store
    pub fn create_memory_store(
        repo_path: &str,
        store_name: &str,
    ) -> Result<MemoryStore, ClaudeAdapterError> {
        let memory_dir = Path::new(repo_path).join(".claude/memory");
        fs::create_dir_all(&memory_dir)?;
        let store_path = memory_dir.join(format!("{}.md", store_name));

        atomic_write(&store_path, "")?;

        Ok(MemoryStore {
            store_id: store_name.to_string(),
            name: store_name.to_string(),
            path: store_path.to_string_lossy().to_string(),
            entry_count: 0,
        })
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
        Ok(Self::parse_entries(&contents))
    }

    /// Write a memory entry to a store (append)
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

    /// Update a memory entry by its index (0-based)
    pub fn update_memory_entry(
        store_path: &str,
        entry_index: usize,
        new_content: &str,
    ) -> Result<(), ClaudeAdapterError> {
        let path = Path::new(store_path);
        if !path.exists() {
            return Err(ClaudeAdapterError::MemoryStoreNotFound(
                store_path.to_string(),
            ));
        }

        let contents = fs::read_to_string(path)?;
        let mut entries = Self::parse_entries(&contents);

        if entry_index >= entries.len() {
            return Err(ClaudeAdapterError::MemoryEntryNotFound(entry_index));
        }

        entries[entry_index].content = new_content.to_string();
        let rebuilt = Self::rebuild_entries(&entries);
        atomic_write(path, &rebuilt)?;
        Ok(())
    }

    /// Delete a memory entry by its index (0-based)
    pub fn delete_memory_entry(
        store_path: &str,
        entry_index: usize,
    ) -> Result<(), ClaudeAdapterError> {
        let path = Path::new(store_path);
        if !path.exists() {
            return Err(ClaudeAdapterError::MemoryStoreNotFound(
                store_path.to_string(),
            ));
        }

        let contents = fs::read_to_string(path)?;
        let mut entries = Self::parse_entries(&contents);

        if entry_index >= entries.len() {
            return Err(ClaudeAdapterError::MemoryEntryNotFound(entry_index));
        }

        entries.remove(entry_index);
        let rebuilt = Self::rebuild_entries(&entries);
        atomic_write(path, &rebuilt)?;
        Ok(())
    }

    /// Delete a memory store file
    pub fn delete_memory_store(store_path: &str) -> Result<(), ClaudeAdapterError> {
        let path = Path::new(store_path);
        if !path.exists() {
            return Err(ClaudeAdapterError::MemoryStoreNotFound(
                store_path.to_string(),
            ));
        }
        fs::remove_file(path)?;
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

    /// Return list of known tool names
    pub fn known_tools() -> Vec<String> {
        KNOWN_TOOLS.iter().map(|s| s.to_string()).collect()
    }

    // -- Hooks --

    /// Read hooks from .claude/settings.json
    pub fn read_hooks(repo_path: &str) -> Result<Vec<HookEvent>, ClaudeAdapterError> {
        let settings_path = Path::new(repo_path).join(".claude/settings.json");
        if !settings_path.exists() {
            return Ok(vec![]);
        }

        let contents = fs::read_to_string(&settings_path)?;
        let raw: serde_json::Value = serde_json::from_str(&contents)?;

        let hooks_val = match raw.get("hooks") {
            Some(v) => v,
            None => return Ok(vec![]),
        };

        let hooks_obj = match hooks_val.as_object() {
            Some(obj) => obj,
            None => return Ok(vec![]),
        };

        let mut events = Vec::new();
        for (event_name, groups_val) in hooks_obj {
            let groups_arr = match groups_val.as_array() {
                Some(arr) => arr,
                None => continue,
            };

            let mut groups = Vec::new();
            for group_val in groups_arr {
                let matcher = group_val
                    .get("matcher")
                    .and_then(|v| v.as_str())
                    .map(String::from);

                let hooks_arr = group_val
                    .get("hooks")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();

                let mut handlers = Vec::new();
                for hook_val in &hooks_arr {
                    let hook_type = hook_val
                        .get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("command")
                        .to_string();
                    let command = hook_val
                        .get("command")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    let prompt = hook_val
                        .get("prompt")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    let timeout = hook_val.get("timeout").and_then(|v| v.as_u64());

                    handlers.push(HookHandler {
                        hook_type,
                        command,
                        prompt,
                        timeout,
                    });
                }

                let disabled = group_val
                    .get("_disabled")
                    .and_then(|v| v.as_bool());

                groups.push(HookGroup {
                    matcher,
                    hooks: handlers,
                    disabled,
                });
            }

            events.push(HookEvent {
                event: event_name.clone(),
                groups,
            });
        }

        Ok(events)
    }

    /// Write hooks to .claude/settings.json (replaces hooks key, preserves other settings)
    pub fn write_hooks(
        repo_path: &str,
        hooks: &[HookEvent],
    ) -> Result<(), ClaudeAdapterError> {
        let claude_dir = Path::new(repo_path).join(".claude");
        fs::create_dir_all(&claude_dir)?;
        let settings_path = claude_dir.join("settings.json");

        let mut raw: serde_json::Value = if settings_path.exists() {
            let contents = fs::read_to_string(&settings_path)?;
            serde_json::from_str(&contents)?
        } else {
            serde_json::json!({})
        };

        if hooks.is_empty() {
            if let Some(obj) = raw.as_object_mut() {
                obj.remove("hooks");
            }
        } else {
            let mut hooks_obj = serde_json::Map::new();
            for event in hooks {
                let mut groups_arr = Vec::new();
                for group in &event.groups {
                    let mut group_obj = serde_json::Map::new();
                    if let Some(ref matcher) = group.matcher {
                        group_obj.insert(
                            "matcher".to_string(),
                            serde_json::Value::String(matcher.clone()),
                        );
                    }

                    let hooks_arr: Vec<serde_json::Value> = group
                        .hooks
                        .iter()
                        .map(|h| {
                            let mut obj = serde_json::Map::new();
                            obj.insert(
                                "type".to_string(),
                                serde_json::Value::String(h.hook_type.clone()),
                            );
                            if let Some(ref cmd) = h.command {
                                obj.insert(
                                    "command".to_string(),
                                    serde_json::Value::String(cmd.clone()),
                                );
                            }
                            if let Some(ref prompt) = h.prompt {
                                obj.insert(
                                    "prompt".to_string(),
                                    serde_json::Value::String(prompt.clone()),
                                );
                            }
                            if let Some(timeout) = h.timeout {
                                obj.insert(
                                    "timeout".to_string(),
                                    serde_json::Value::Number(timeout.into()),
                                );
                            }
                            serde_json::Value::Object(obj)
                        })
                        .collect();

                    group_obj.insert(
                        "hooks".to_string(),
                        serde_json::Value::Array(hooks_arr),
                    );
                    if let Some(true) = group.disabled {
                        group_obj.insert(
                            "_disabled".to_string(),
                            serde_json::Value::Bool(true),
                        );
                    }
                    groups_arr.push(serde_json::Value::Object(group_obj));
                }
                hooks_obj.insert(event.event.clone(), serde_json::Value::Array(groups_arr));
            }
            raw["hooks"] = serde_json::Value::Object(hooks_obj);
        }

        let json = serde_json::to_string_pretty(&raw)?;
        atomic_write(&settings_path, &json)?;
        Ok(())
    }

    // -- Skills --

    /// Read all skills from .claude/skills/
    pub fn read_skills(repo_path: &str) -> Result<Vec<Skill>, ClaudeAdapterError> {
        let skills_dir = Path::new(repo_path).join(".claude/skills");
        if !skills_dir.exists() {
            return Ok(vec![]);
        }

        let mut skills = Vec::new();
        for entry in fs::read_dir(&skills_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let skill_md = path.join("SKILL.md");
                if skill_md.exists() {
                    let skill_id = path
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    match Self::parse_skill_file(&skill_md, &skill_id) {
                        Ok(skill) => skills.push(skill),
                        Err(e) => {
                            eprintln!("Warning: failed to parse skill {}: {}", skill_id, e);
                        }
                    }
                }
            }
        }

        skills.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(skills)
    }

    /// Write a skill to .claude/skills/<skill_id>/SKILL.md
    pub fn write_skill(repo_path: &str, skill: &Skill) -> Result<(), ClaudeAdapterError> {
        let skill_dir = Path::new(repo_path)
            .join(".claude/skills")
            .join(&skill.skill_id);
        fs::create_dir_all(&skill_dir)?;
        let skill_path = skill_dir.join("SKILL.md");

        // Build frontmatter
        let mut frontmatter = serde_json::Map::new();
        frontmatter.insert(
            "name".to_string(),
            serde_json::Value::String(skill.name.clone()),
        );
        if let Some(ref desc) = skill.description {
            frontmatter.insert(
                "description".to_string(),
                serde_json::Value::String(desc.clone()),
            );
        }
        if let Some(invocable) = skill.user_invocable {
            frontmatter.insert(
                "user_invocable".to_string(),
                serde_json::Value::Bool(invocable),
            );
        }
        if !skill.allowed_tools.is_empty() {
            frontmatter.insert(
                "allowed_tools".to_string(),
                serde_json::Value::Array(
                    skill
                        .allowed_tools
                        .iter()
                        .map(|t| serde_json::Value::String(t.clone()))
                        .collect(),
                ),
            );
        }
        if let Some(ref model) = skill.model {
            frontmatter.insert(
                "model".to_string(),
                serde_json::Value::String(model.clone()),
            );
        }
        if let Some(disable) = skill.disable_model_invocation {
            frontmatter.insert(
                "disable_model_invocation".to_string(),
                serde_json::Value::Bool(disable),
            );
        }
        if let Some(ref context) = skill.context {
            frontmatter.insert(
                "context".to_string(),
                serde_json::Value::String(context.clone()),
            );
        }
        if let Some(ref agent) = skill.agent {
            frontmatter.insert(
                "agent".to_string(),
                serde_json::Value::String(agent.clone()),
            );
        }
        if let Some(ref hint) = skill.argument_hint {
            frontmatter.insert(
                "argument_hint".to_string(),
                serde_json::Value::String(hint.clone()),
            );
        }

        let yaml_val = serde_json::Value::Object(frontmatter);
        let yaml_str = serde_yaml::to_string(&yaml_val)?;

        let mut content = String::new();
        content.push_str("---\n");
        content.push_str(&yaml_str);
        content.push_str("---\n\n");
        content.push_str(&skill.content);
        if !skill.content.ends_with('\n') {
            content.push('\n');
        }

        atomic_write(&skill_path, &content)?;
        Ok(())
    }

    /// Delete a skill directory
    pub fn delete_skill(repo_path: &str, skill_id: &str) -> Result<(), ClaudeAdapterError> {
        let skill_dir = Path::new(repo_path)
            .join(".claude/skills")
            .join(skill_id);
        if !skill_dir.exists() {
            return Err(ClaudeAdapterError::SkillNotFound(skill_id.to_string()));
        }
        fs::remove_dir_all(&skill_dir)?;
        Ok(())
    }

    // -- MCP --

    /// Read MCP servers from .mcp.json (project) or .claude.json (global)
    pub fn read_mcp_servers(repo_path: &str, is_global: bool) -> Result<Vec<McpServer>, ClaudeAdapterError> {
        let mcp_path = if is_global {
            Path::new(repo_path).join(".claude.json")
        } else {
            Path::new(repo_path).join(".mcp.json")
        };
        if !mcp_path.exists() {
            return Ok(vec![]);
        }

        let contents = fs::read_to_string(&mcp_path)?;
        let raw: serde_json::Value = serde_json::from_str(&contents)?;

        let servers_obj = match raw.get("mcpServers").and_then(|v| v.as_object()) {
            Some(obj) => obj,
            None => return Ok(vec![]),
        };

        let mut servers = Vec::new();
        for (server_id, server_val) in servers_obj {
            let server_type = server_val
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("stdio")
                .to_string();
            let command = server_val
                .get("command")
                .and_then(|v| v.as_str())
                .map(String::from);
            let args = server_val.get("args").and_then(|v| {
                v.as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
            });
            let url = server_val
                .get("url")
                .and_then(|v| v.as_str())
                .map(String::from);
            let env = server_val.get("env").cloned();
            let headers = server_val.get("headers").cloned();

            let disabled = server_val
                .get("_disabled")
                .and_then(|v| v.as_bool());

            servers.push(McpServer {
                server_id: server_id.clone(),
                server_type,
                command,
                args,
                url,
                env,
                headers,
                disabled,
            });
        }

        servers.sort_by(|a, b| a.server_id.cmp(&b.server_id));
        Ok(servers)
    }

    /// Write (upsert) an MCP server to .mcp.json (project) or .claude.json (global)
    pub fn write_mcp_server(
        repo_path: &str,
        server: &McpServer,
        is_global: bool,
    ) -> Result<(), ClaudeAdapterError> {
        let mcp_path = if is_global {
            Path::new(repo_path).join(".claude.json")
        } else {
            Path::new(repo_path).join(".mcp.json")
        };

        let mut raw: serde_json::Value = if mcp_path.exists() {
            let contents = fs::read_to_string(&mcp_path)?;
            serde_json::from_str(&contents)?
        } else {
            serde_json::json!({ "mcpServers": {} })
        };

        if raw.get("mcpServers").is_none() {
            raw["mcpServers"] = serde_json::json!({});
        }

        let mut server_obj = serde_json::Map::new();
        server_obj.insert(
            "type".to_string(),
            serde_json::Value::String(server.server_type.clone()),
        );
        if let Some(ref cmd) = server.command {
            server_obj.insert(
                "command".to_string(),
                serde_json::Value::String(cmd.clone()),
            );
        }
        if let Some(ref args) = server.args {
            server_obj.insert(
                "args".to_string(),
                serde_json::Value::Array(
                    args.iter()
                        .map(|a| serde_json::Value::String(a.clone()))
                        .collect(),
                ),
            );
        }
        if let Some(ref url) = server.url {
            server_obj.insert(
                "url".to_string(),
                serde_json::Value::String(url.clone()),
            );
        }
        if let Some(ref env) = server.env {
            server_obj.insert("env".to_string(), env.clone());
        }
        if let Some(ref headers) = server.headers {
            server_obj.insert("headers".to_string(), headers.clone());
        }

        raw["mcpServers"][&server.server_id] = serde_json::Value::Object(server_obj);

        let json = serde_json::to_string_pretty(&raw)?;
        atomic_write(&mcp_path, &json)?;
        Ok(())
    }

    /// Delete an MCP server from .mcp.json (project) or .claude.json (global)
    pub fn delete_mcp_server(
        repo_path: &str,
        server_id: &str,
        is_global: bool,
    ) -> Result<(), ClaudeAdapterError> {
        let mcp_path = if is_global {
            Path::new(repo_path).join(".claude.json")
        } else {
            Path::new(repo_path).join(".mcp.json")
        };
        if !mcp_path.exists() {
            return Err(ClaudeAdapterError::McpServerNotFound(
                server_id.to_string(),
            ));
        }

        let contents = fs::read_to_string(&mcp_path)?;
        let mut raw: serde_json::Value = serde_json::from_str(&contents)?;

        match raw.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
            Some(obj) => {
                if obj.remove(server_id).is_none() {
                    return Err(ClaudeAdapterError::McpServerNotFound(
                        server_id.to_string(),
                    ));
                }
            }
            None => {
                return Err(ClaudeAdapterError::McpServerNotFound(
                    server_id.to_string(),
                ));
            }
        }

        let json = serde_json::to_string_pretty(&raw)?;
        atomic_write(&mcp_path, &json)?;
        Ok(())
    }

    // -- Config Bundle (backup/restore) --

    /// Export all configuration as a JSON bundle
    pub fn export_config_bundle(
        base_path: &str,
        is_global: bool,
    ) -> Result<Vec<u8>, ClaudeAdapterError> {
        let agents = Self::read_agents(base_path).unwrap_or_default();
        let agents_json: Vec<serde_json::Value> = agents
            .iter()
            .map(|a| serde_json::to_value(a).unwrap_or_default())
            .collect();

        let skills = Self::read_skills(base_path).unwrap_or_default();
        let skills_json: Vec<serde_json::Value> = skills
            .iter()
            .map(|s| serde_json::to_value(s).unwrap_or_default())
            .collect();

        let hooks = Self::read_hooks(base_path).unwrap_or_default();
        let hooks_json: Vec<serde_json::Value> = hooks
            .iter()
            .map(|h| serde_json::to_value(h).unwrap_or_default())
            .collect();

        let mcp_servers = Self::read_mcp_servers(base_path, is_global).unwrap_or_default();
        let mcp_map: serde_json::Map<String, serde_json::Value> = mcp_servers
            .iter()
            .map(|s| {
                (
                    s.server_id.clone(),
                    serde_json::to_value(s).unwrap_or_default(),
                )
            })
            .collect();

        let settings = Self::read_config(base_path)
            .map(|c| c.raw)
            .unwrap_or_else(|_| serde_json::json!({}));

        let bundle = ConfigBundle {
            version: "1.0".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            scope: if is_global {
                "global".to_string()
            } else {
                "project".to_string()
            },
            agents: agents_json,
            skills: skills_json,
            hooks: hooks_json,
            mcp_servers: serde_json::Value::Object(mcp_map),
            settings,
        };

        let bytes = serde_json::to_vec_pretty(&bundle)?;
        Ok(bytes)
    }

    /// Import configuration from a JSON bundle
    pub fn import_config_bundle(
        base_path: &str,
        is_global: bool,
        bundle_bytes: &[u8],
        mode: &str,
    ) -> Result<ImportBundleResult, ClaudeAdapterError> {
        let bundle: ConfigBundle = serde_json::from_slice(bundle_bytes)?;
        let overwrite = mode == "overwrite";

        let mut result = ImportBundleResult {
            agents_imported: 0,
            skills_imported: 0,
            hooks_imported: 0,
            mcp_servers_imported: 0,
            settings_imported: false,
        };

        // Import agents
        let existing_agents = Self::read_agents(base_path).unwrap_or_default();
        let existing_agent_ids: std::collections::HashSet<String> =
            existing_agents.iter().map(|a| a.agent_id.clone()).collect();

        for agent_val in &bundle.agents {
            if let Ok(agent) = serde_json::from_value::<Agent>(agent_val.clone()) {
                if overwrite || !existing_agent_ids.contains(&agent.agent_id) {
                    Self::write_agent(base_path, &agent)?;
                    result.agents_imported += 1;
                }
            }
        }

        // Import skills
        let existing_skills = Self::read_skills(base_path).unwrap_or_default();
        let existing_skill_ids: std::collections::HashSet<String> =
            existing_skills.iter().map(|s| s.skill_id.clone()).collect();

        for skill_val in &bundle.skills {
            if let Ok(skill) = serde_json::from_value::<Skill>(skill_val.clone()) {
                if overwrite || !existing_skill_ids.contains(&skill.skill_id) {
                    Self::write_skill(base_path, &skill)?;
                    result.skills_imported += 1;
                }
            }
        }

        // Import hooks
        if !bundle.hooks.is_empty() {
            let mut new_hooks: Vec<HookEvent> = Vec::new();
            for hook_val in &bundle.hooks {
                if let Ok(hook) = serde_json::from_value::<HookEvent>(hook_val.clone()) {
                    new_hooks.push(hook);
                }
            }

            if overwrite {
                Self::write_hooks(base_path, &new_hooks)?;
                result.hooks_imported = new_hooks.len();
            } else {
                let existing_hooks = Self::read_hooks(base_path).unwrap_or_default();
                let existing_events: std::collections::HashSet<String> =
                    existing_hooks.iter().map(|h| h.event.clone()).collect();

                let mut merged = existing_hooks;
                for hook in &new_hooks {
                    if !existing_events.contains(&hook.event) {
                        merged.push(hook.clone());
                        result.hooks_imported += 1;
                    }
                }
                Self::write_hooks(base_path, &merged)?;
            }
        }

        // Import MCP servers
        if let Some(servers_obj) = bundle.mcp_servers.as_object() {
            let existing_servers = Self::read_mcp_servers(base_path, is_global).unwrap_or_default();
            let existing_server_ids: std::collections::HashSet<String> =
                existing_servers.iter().map(|s| s.server_id.clone()).collect();

            for (_id, server_val) in servers_obj {
                if let Ok(server) = serde_json::from_value::<McpServer>(server_val.clone()) {
                    if overwrite || !existing_server_ids.contains(&server.server_id) {
                        Self::write_mcp_server(base_path, &server, is_global)?;
                        result.mcp_servers_imported += 1;
                    }
                }
            }
        }

        // Import settings
        if bundle.settings != serde_json::json!({}) {
            if overwrite {
                let settings_path = Path::new(base_path).join(".claude/settings.json");
                let claude_dir = Path::new(base_path).join(".claude");
                fs::create_dir_all(&claude_dir)?;
                // Preserve hooks from existing settings when overwriting
                let existing_raw: serde_json::Value = if settings_path.exists() {
                    let contents = fs::read_to_string(&settings_path)?;
                    serde_json::from_str(&contents)?
                } else {
                    serde_json::json!({})
                };
                let mut new_settings = bundle.settings.clone();
                // Merge: don't overwrite hooks via settings import (hooks are handled separately)
                if let Some(existing_hooks) = existing_raw.get("hooks") {
                    new_settings["hooks"] = existing_hooks.clone();
                }
                let json = serde_json::to_string_pretty(&new_settings)?;
                atomic_write(&settings_path, &json)?;
                result.settings_imported = true;
            } else {
                // In merge mode, only import settings if no settings exist
                let settings_path = Path::new(base_path).join(".claude/settings.json");
                if !settings_path.exists() {
                    let claude_dir = Path::new(base_path).join(".claude");
                    fs::create_dir_all(&claude_dir)?;
                    let json = serde_json::to_string_pretty(&bundle.settings)?;
                    atomic_write(&settings_path, &json)?;
                    result.settings_imported = true;
                }
            }
        }

        Ok(result)
    }

    // -- Enable/Disable --

    /// Disable an agent by renaming its .md file to .md.disabled
    pub fn disable_agent(base_path: &str, agent_id: &str) -> Result<(), ClaudeAdapterError> {
        let agents_dir = Path::new(base_path).join(".claude/agents");
        let md_path = agents_dir.join(format!("{}.md", agent_id));
        if !md_path.exists() {
            return Err(ClaudeAdapterError::AgentNotFound(agent_id.to_string()));
        }
        let disabled_path = agents_dir.join(format!("{}.md.disabled", agent_id));
        fs::rename(&md_path, &disabled_path)?;

        // Also rename meta sidecar if it exists
        let meta_path = agents_dir.join(format!("{}.meta.json", agent_id));
        if meta_path.exists() {
            let meta_disabled = agents_dir.join(format!("{}.meta.json.disabled", agent_id));
            fs::rename(&meta_path, &meta_disabled)?;
        }
        Ok(())
    }

    /// Enable a previously disabled agent by renaming .md.disabled back to .md
    pub fn enable_agent(base_path: &str, agent_id: &str) -> Result<(), ClaudeAdapterError> {
        let agents_dir = Path::new(base_path).join(".claude/agents");
        let disabled_path = agents_dir.join(format!("{}.md.disabled", agent_id));
        if !disabled_path.exists() {
            return Err(ClaudeAdapterError::AgentNotFound(agent_id.to_string()));
        }
        let md_path = agents_dir.join(format!("{}.md", agent_id));
        fs::rename(&disabled_path, &md_path)?;

        // Also rename meta sidecar back if it exists
        let meta_disabled = agents_dir.join(format!("{}.meta.json.disabled", agent_id));
        if meta_disabled.exists() {
            let meta_path = agents_dir.join(format!("{}.meta.json", agent_id));
            fs::rename(&meta_disabled, &meta_path)?;
        }
        Ok(())
    }

    /// Check if an agent is disabled
    pub fn is_agent_disabled(base_path: &str, agent_id: &str) -> bool {
        let agents_dir = Path::new(base_path).join(".claude/agents");
        agents_dir
            .join(format!("{}.md.disabled", agent_id))
            .exists()
    }

    /// List agent IDs that are currently disabled
    pub fn list_disabled_agents(base_path: &str) -> Result<Vec<String>, ClaudeAdapterError> {
        let agents_dir = Path::new(base_path).join(".claude/agents");
        if !agents_dir.exists() {
            return Ok(vec![]);
        }

        let mut disabled = Vec::new();
        for entry in fs::read_dir(&agents_dir)? {
            let entry = entry?;
            let path = entry.path();
            let file_name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            if file_name.ends_with(".md.disabled") {
                let agent_id = file_name.trim_end_matches(".md.disabled").to_string();
                if !agent_id.is_empty() {
                    disabled.push(agent_id);
                }
            }
        }
        disabled.sort();
        Ok(disabled)
    }

    /// Disable a hook group by adding a "_disabled": true field in settings.json
    pub fn disable_hook(
        base_path: &str,
        event: &str,
        group_index: usize,
    ) -> Result<(), ClaudeAdapterError> {
        let settings_path = Path::new(base_path).join(".claude/settings.json");
        if !settings_path.exists() {
            return Err(ClaudeAdapterError::ConfigNotFound(
                settings_path.to_string_lossy().to_string(),
            ));
        }

        let contents = fs::read_to_string(&settings_path)?;
        let mut raw: serde_json::Value = serde_json::from_str(&contents)?;

        let group = raw
            .get_mut("hooks")
            .and_then(|h| h.get_mut(event))
            .and_then(|arr| arr.get_mut(group_index))
            .ok_or_else(|| {
                ClaudeAdapterError::ConfigNotFound(format!(
                    "Hook group {}[{}] not found",
                    event, group_index
                ))
            })?;

        if let Some(obj) = group.as_object_mut() {
            obj.insert("_disabled".to_string(), serde_json::Value::Bool(true));
        }

        let json = serde_json::to_string_pretty(&raw)?;
        atomic_write(&settings_path, &json)?;
        Ok(())
    }

    /// Enable a hook group by removing the "_disabled" field from settings.json
    pub fn enable_hook(
        base_path: &str,
        event: &str,
        group_index: usize,
    ) -> Result<(), ClaudeAdapterError> {
        let settings_path = Path::new(base_path).join(".claude/settings.json");
        if !settings_path.exists() {
            return Err(ClaudeAdapterError::ConfigNotFound(
                settings_path.to_string_lossy().to_string(),
            ));
        }

        let contents = fs::read_to_string(&settings_path)?;
        let mut raw: serde_json::Value = serde_json::from_str(&contents)?;

        let group = raw
            .get_mut("hooks")
            .and_then(|h| h.get_mut(event))
            .and_then(|arr| arr.get_mut(group_index))
            .ok_or_else(|| {
                ClaudeAdapterError::ConfigNotFound(format!(
                    "Hook group {}[{}] not found",
                    event, group_index
                ))
            })?;

        if let Some(obj) = group.as_object_mut() {
            obj.remove("_disabled");
        }

        let json = serde_json::to_string_pretty(&raw)?;
        atomic_write(&settings_path, &json)?;
        Ok(())
    }

    /// Disable a skill by renaming SKILL.md to SKILL.md.disabled
    pub fn disable_skill(base_path: &str, skill_id: &str) -> Result<(), ClaudeAdapterError> {
        let skill_dir = Path::new(base_path).join(".claude/skills").join(skill_id);
        let skill_md = skill_dir.join("SKILL.md");
        if !skill_md.exists() {
            return Err(ClaudeAdapterError::SkillNotFound(skill_id.to_string()));
        }
        let disabled_path = skill_dir.join("SKILL.md.disabled");
        fs::rename(&skill_md, &disabled_path)?;
        Ok(())
    }

    /// Enable a previously disabled skill by renaming SKILL.md.disabled back to SKILL.md
    pub fn enable_skill(base_path: &str, skill_id: &str) -> Result<(), ClaudeAdapterError> {
        let skill_dir = Path::new(base_path).join(".claude/skills").join(skill_id);
        let disabled_path = skill_dir.join("SKILL.md.disabled");
        if !disabled_path.exists() {
            return Err(ClaudeAdapterError::SkillNotFound(skill_id.to_string()));
        }
        let skill_md = skill_dir.join("SKILL.md");
        fs::rename(&disabled_path, &skill_md)?;
        Ok(())
    }

    /// List skill IDs that are currently disabled
    pub fn list_disabled_skills(base_path: &str) -> Result<Vec<String>, ClaudeAdapterError> {
        let skills_dir = Path::new(base_path).join(".claude/skills");
        if !skills_dir.exists() {
            return Ok(vec![]);
        }

        let mut disabled = Vec::new();
        for entry in fs::read_dir(&skills_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let disabled_md = path.join("SKILL.md.disabled");
                if disabled_md.exists() {
                    if let Some(skill_id) =
                        path.file_name().map(|s| s.to_string_lossy().to_string())
                    {
                        disabled.push(skill_id);
                    }
                }
            }
        }
        disabled.sort();
        Ok(disabled)
    }

    /// Disable an MCP server by adding a "_disabled": true field in the MCP JSON
    pub fn disable_mcp_server(
        base_path: &str,
        server_id: &str,
        is_global: bool,
    ) -> Result<(), ClaudeAdapterError> {
        let mcp_path = if is_global {
            Path::new(base_path).join(".claude.json")
        } else {
            Path::new(base_path).join(".mcp.json")
        };
        if !mcp_path.exists() {
            return Err(ClaudeAdapterError::McpServerNotFound(server_id.to_string()));
        }

        let contents = fs::read_to_string(&mcp_path)?;
        let mut raw: serde_json::Value = serde_json::from_str(&contents)?;

        let server = raw
            .get_mut("mcpServers")
            .and_then(|s| s.get_mut(server_id))
            .ok_or_else(|| ClaudeAdapterError::McpServerNotFound(server_id.to_string()))?;

        if let Some(obj) = server.as_object_mut() {
            obj.insert("_disabled".to_string(), serde_json::Value::Bool(true));
        }

        let json = serde_json::to_string_pretty(&raw)?;
        atomic_write(&mcp_path, &json)?;
        Ok(())
    }

    /// Enable an MCP server by removing the "_disabled" field from the MCP JSON
    pub fn enable_mcp_server(
        base_path: &str,
        server_id: &str,
        is_global: bool,
    ) -> Result<(), ClaudeAdapterError> {
        let mcp_path = if is_global {
            Path::new(base_path).join(".claude.json")
        } else {
            Path::new(base_path).join(".mcp.json")
        };
        if !mcp_path.exists() {
            return Err(ClaudeAdapterError::McpServerNotFound(server_id.to_string()));
        }

        let contents = fs::read_to_string(&mcp_path)?;
        let mut raw: serde_json::Value = serde_json::from_str(&contents)?;

        let server = raw
            .get_mut("mcpServers")
            .and_then(|s| s.get_mut(server_id))
            .ok_or_else(|| ClaudeAdapterError::McpServerNotFound(server_id.to_string()))?;

        if let Some(obj) = server.as_object_mut() {
            obj.remove("_disabled");
        }

        let json = serde_json::to_string_pretty(&raw)?;
        atomic_write(&mcp_path, &json)?;
        Ok(())
    }

    // -- Private helpers --

    fn parse_agent_file(
        path: &Path,
        agent_id: &str,
        _repo_path: &str,
    ) -> Result<Agent, ClaudeAdapterError> {
        let contents = fs::read_to_string(path)?;

        // Parse YAML frontmatter (between --- delimiters) — same pattern as parse_skill_file
        let (frontmatter, body) = if contents.starts_with("---") {
            let after_first = &contents[3..];
            if let Some(end_idx) = after_first.find("\n---") {
                let yaml_str = &after_first[..end_idx];
                let body_start = end_idx + 4; // skip \n---
                let body = after_first[body_start..].trim_start_matches('\n').to_string();
                let fm: serde_json::Value = serde_yaml::from_str(yaml_str)?;
                (fm, body)
            } else {
                (serde_json::json!({}), contents)
            }
        } else {
            (serde_json::json!({}), contents)
        };

        let name = frontmatter
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(agent_id)
            .to_string();

        let description = frontmatter
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Tools: comma-separated string → Vec
        let tools = frontmatter
            .get("tools")
            .and_then(|v| v.as_str())
            .map(|s| {
                s.split(',')
                    .map(|t| t.trim().to_string())
                    .filter(|t| !t.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        let model_override = frontmatter
            .get("model")
            .and_then(|v| v.as_str())
            .map(String::from);

        let memory = frontmatter
            .get("memory")
            .and_then(|v| v.as_str())
            .map(String::from);

        Ok(Agent {
            agent_id: agent_id.to_string(),
            name,
            description,
            system_prompt: body,
            tools,
            model_override,
            memory,
        })
    }

    fn parse_entries(contents: &str) -> Vec<MemoryEntry> {
        let mut entries = Vec::new();
        let mut current_content = String::new();
        let mut idx = 0;

        for line in contents.lines() {
            if line.starts_with("- ") || line.starts_with("* ") {
                if idx > 0 {
                    entries.push(MemoryEntry {
                        key: format!("entry_{}", idx),
                        content: current_content.trim().to_string(),
                    });
                }
                idx += 1;
                current_content = line[2..].to_string();
            } else if idx > 0 {
                current_content.push('\n');
                current_content.push_str(line);
            }
        }

        if idx > 0 {
            entries.push(MemoryEntry {
                key: format!("entry_{}", idx),
                content: current_content.trim().to_string(),
            });
        }

        entries
    }

    fn rebuild_entries(entries: &[MemoryEntry]) -> String {
        let mut output = String::new();
        for entry in entries {
            output.push_str(&format!("- {}\n", entry.content));
        }
        output
    }

    fn parse_skill_file(path: &Path, skill_id: &str) -> Result<Skill, ClaudeAdapterError> {
        let contents = fs::read_to_string(path)?;

        // Parse YAML frontmatter (between --- delimiters)
        let (frontmatter, body) = if contents.starts_with("---") {
            let after_first = &contents[3..];
            if let Some(end_idx) = after_first.find("\n---") {
                let yaml_str = &after_first[..end_idx];
                let body_start = end_idx + 4; // skip \n---
                let body = after_first[body_start..].trim_start_matches('\n').to_string();
                let fm: serde_json::Value = serde_yaml::from_str(yaml_str)?;
                (fm, body)
            } else {
                (serde_json::json!({}), contents)
            }
        } else {
            (serde_json::json!({}), contents)
        };

        let name = frontmatter
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(skill_id)
            .to_string();

        let description = frontmatter
            .get("description")
            .and_then(|v| v.as_str())
            .map(String::from);

        let user_invocable = frontmatter
            .get("user_invocable")
            .and_then(|v| v.as_bool());

        let allowed_tools = frontmatter
            .get("allowed_tools")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let model = frontmatter
            .get("model")
            .and_then(|v| v.as_str())
            .map(String::from);

        let disable_model_invocation = frontmatter
            .get("disable_model_invocation")
            .and_then(|v| v.as_bool());

        let context = frontmatter
            .get("context")
            .and_then(|v| v.as_str())
            .map(String::from);

        let agent = frontmatter
            .get("agent")
            .and_then(|v| v.as_str())
            .map(String::from);

        let argument_hint = frontmatter
            .get("argument_hint")
            .and_then(|v| v.as_str())
            .map(String::from);

        Ok(Skill {
            skill_id: skill_id.to_string(),
            name,
            description,
            user_invocable,
            allowed_tools,
            model,
            disable_model_invocation,
            context,
            agent,
            argument_hint,
            content: body,
        })
    }

    /// Read CLAUDE.md content from a repo (or global home). Returns empty string if not found.
    pub fn read_claude_md(repo_path: &str) -> Result<String, ClaudeAdapterError> {
        let md_path = Path::new(repo_path).join("CLAUDE.md");
        if !md_path.exists() {
            return Ok(String::new());
        }
        Ok(fs::read_to_string(&md_path)?)
    }

    /// List nested CLAUDE.md files in subdirectories (not the root one)
    pub fn list_claude_md_files(repo_path: &str) -> Result<Vec<String>, ClaudeAdapterError> {
        let base = Path::new(repo_path);
        let mut files = Vec::new();
        // Check common subdirectory patterns
        if let Ok(entries) = fs::read_dir(base) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let nested_md = path.join("CLAUDE.md");
                    if nested_md.exists() {
                        if let Some(relative) = nested_md.strip_prefix(base).ok() {
                            files.push(relative.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
        files.sort();
        Ok(files)
    }

    /// Save a snapshot of the current config state with a label
    pub fn save_config_snapshot(repo_path: &str, label: &str) -> Result<ConfigSnapshot, ClaudeAdapterError> {
        let claude_dir = Path::new(repo_path).join(".claude");
        let history_dir = claude_dir.join("history");
        fs::create_dir_all(&history_dir)?;

        let timestamp = chrono::Utc::now().to_rfc3339();
        let snapshot_id = format!("{}_{}", chrono::Utc::now().format("%Y%m%d_%H%M%S"), label.replace(' ', "_"));

        // Capture current state (settings.json only — CLAUDE.md is version-controlled)
        let settings_path = claude_dir.join("settings.json");
        let settings_content = if settings_path.exists() {
            Some(fs::read_to_string(&settings_path)?)
        } else {
            None
        };

        let snapshot = ConfigSnapshot {
            snapshot_id: snapshot_id.clone(),
            label: label.to_string(),
            timestamp: timestamp.clone(),
            settings_json: settings_content,
        };

        let snapshot_path = history_dir.join(format!("{}.json", snapshot_id));
        let json = serde_json::to_string_pretty(&snapshot)?;
        atomic_write(&snapshot_path, &json)?;
        Ok(snapshot)
    }

    /// List all config snapshots, newest first
    pub fn list_config_snapshots(repo_path: &str) -> Result<Vec<ConfigSnapshotSummary>, ClaudeAdapterError> {
        let history_dir = Path::new(repo_path).join(".claude/history");
        if !history_dir.exists() {
            return Ok(vec![]);
        }

        let mut summaries = Vec::new();
        for entry in fs::read_dir(&history_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(contents) = fs::read_to_string(&path) {
                    if let Ok(snapshot) = serde_json::from_str::<ConfigSnapshot>(&contents) {
                        summaries.push(ConfigSnapshotSummary {
                            snapshot_id: snapshot.snapshot_id,
                            label: snapshot.label,
                            timestamp: snapshot.timestamp,
                            has_settings: snapshot.settings_json.is_some(),
                        });
                    }
                }
            }
        }
        summaries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(summaries)
    }

    /// Restore a config snapshot
    pub fn restore_config_snapshot(repo_path: &str, snapshot_id: &str) -> Result<(), ClaudeAdapterError> {
        let history_dir = Path::new(repo_path).join(".claude/history");
        let snapshot_path = history_dir.join(format!("{}.json", snapshot_id));

        if !snapshot_path.exists() {
            return Err(ClaudeAdapterError::ConfigNotFound(snapshot_id.to_string()));
        }

        let contents = fs::read_to_string(&snapshot_path)?;
        let snapshot: ConfigSnapshot = serde_json::from_str(&contents)?;

        if let Some(ref settings) = snapshot.settings_json {
            let claude_dir = Path::new(repo_path).join(".claude");
            fs::create_dir_all(&claude_dir)?;
            atomic_write(&claude_dir.join("settings.json"), settings)?;
        }

        Ok(())
    }

    /// Delete a config snapshot
    pub fn delete_config_snapshot(repo_path: &str, snapshot_id: &str) -> Result<(), ClaudeAdapterError> {
        let history_dir = Path::new(repo_path).join(".claude/history");
        let snapshot_path = history_dir.join(format!("{}.json", snapshot_id));
        if snapshot_path.exists() {
            fs::remove_file(&snapshot_path)?;
        }
        Ok(())
    }

    /// Scan a project directory for Claude Code configuration and return a summary
    pub fn scan_project_config(project_path: &Path) -> Result<ProjectScanResult, ClaudeAdapterError> {
        let claude_dir = project_path.join(".claude");

        // Check CLAUDE.md at root and inside .claude/
        let root_claude_md = project_path.join("CLAUDE.md");
        let inner_claude_md = claude_dir.join("CLAUDE.md");
        let has_claude_md = root_claude_md.exists() || inner_claude_md.exists();

        // Count all CLAUDE.md files: root, .claude/, and nested subdirectories
        let mut claude_md_count: usize = 0;
        if root_claude_md.exists() {
            claude_md_count += 1;
        }
        if inner_claude_md.exists() {
            claude_md_count += 1;
        }
        // Check one level of subdirectories for nested CLAUDE.md
        if let Ok(entries) = fs::read_dir(project_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() && path.file_name().map_or(false, |n| n != ".claude") {
                    if path.join("CLAUDE.md").exists() {
                        claude_md_count += 1;
                    }
                }
            }
        }

        // Count agents (.md files in .claude/agents/)
        let agents_dir = claude_dir.join("agents");
        let agent_count = if agents_dir.exists() {
            fs::read_dir(&agents_dir)
                .map(|entries| {
                    entries
                        .flatten()
                        .filter(|e| {
                            e.path().extension().map_or(false, |ext| ext == "md")
                        })
                        .count()
                })
                .unwrap_or(0)
        } else {
            0
        };

        // Count skills (subdirectories in .claude/skills/ that contain SKILL.md)
        let skills_dir = claude_dir.join("skills");
        let skill_count = if skills_dir.exists() {
            fs::read_dir(&skills_dir)
                .map(|entries| {
                    entries
                        .flatten()
                        .filter(|e| {
                            e.path().is_dir() && e.path().join("SKILL.md").exists()
                        })
                        .count()
                })
                .unwrap_or(0)
        } else {
            0
        };

        // Count hooks from settings.json
        let settings_path = claude_dir.join("settings.json");
        let has_settings = settings_path.exists();
        let hook_count = if has_settings {
            fs::read_to_string(&settings_path)
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| v.get("hooks").cloned())
                .and_then(|h| {
                    h.as_object().map(|obj| {
                        obj.values()
                            .filter_map(|v| v.as_array())
                            .flat_map(|arr| arr.iter())
                            .filter_map(|group| {
                                group
                                    .get("hooks")
                                    .and_then(|h| h.as_array())
                                    .map(|hooks| hooks.len())
                            })
                            .sum()
                    })
                })
                .unwrap_or(0)
        } else {
            0
        };

        // Count MCP servers from .mcp.json
        let mcp_path = project_path.join(".mcp.json");
        let mcp_server_count = if mcp_path.exists() {
            fs::read_to_string(&mcp_path)
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| v.get("mcpServers").and_then(|m| m.as_object()).map(|obj| obj.len()))
                .unwrap_or(0)
        } else {
            0
        };

        // Check memory stores
        let memory_dir = claude_dir.join("memory");
        let has_memory = memory_dir.exists();
        let memory_store_count = if has_memory {
            fs::read_dir(&memory_dir)
                .map(|entries| {
                    entries
                        .flatten()
                        .filter(|e| {
                            e.path().is_file()
                                && e.path().extension().map_or(false, |ext| ext == "md")
                        })
                        .count()
                })
                .unwrap_or(0)
        } else {
            0
        };

        Ok(ProjectScanResult {
            has_claude_md,
            claude_md_count,
            agent_count,
            skill_count,
            hook_count,
            mcp_server_count,
            has_settings,
            has_memory,
            memory_store_count,
        })
    }

    /// Reorder hook groups within a specific event type.
    /// `new_order` is an array of original indices specifying the desired order.
    pub fn reorder_hook_groups(
        base_path: &Path,
        event: &str,
        new_order: &[usize],
    ) -> Result<(), ClaudeAdapterError> {
        let settings_path = base_path.join(".claude/settings.json");
        if !settings_path.exists() {
            return Err(ClaudeAdapterError::ConfigNotFound(
                settings_path.display().to_string(),
            ));
        }

        let contents = fs::read_to_string(&settings_path)?;
        let mut raw: serde_json::Value = serde_json::from_str(&contents)?;

        let groups_arr = raw
            .get_mut("hooks")
            .and_then(|h| h.get_mut(event))
            .and_then(|v| v.as_array_mut())
            .ok_or_else(|| ClaudeAdapterError::ConfigNotFound(format!("hook event '{}'", event)))?;

        let len = groups_arr.len();
        if new_order.len() != len {
            return Err(ClaudeAdapterError::ConfigNotFound(format!(
                "new_order length {} does not match groups length {}",
                new_order.len(),
                len
            )));
        }

        // Validate that new_order is a valid permutation
        let mut seen = vec![false; len];
        for &idx in new_order {
            if idx >= len {
                return Err(ClaudeAdapterError::ConfigNotFound(format!(
                    "index {} out of bounds for {} groups",
                    idx, len
                )));
            }
            if seen[idx] {
                return Err(ClaudeAdapterError::ConfigNotFound(format!(
                    "duplicate index {} in new_order",
                    idx
                )));
            }
            seen[idx] = true;
        }

        let original: Vec<serde_json::Value> = groups_arr.drain(..).collect();
        for &idx in new_order {
            groups_arr.push(original[idx].clone());
        }

        let json = serde_json::to_string_pretty(&raw)?;
        atomic_write(&settings_path, &json)?;
        Ok(())
    }

    /// Comprehensive config linter. Reads both project and global scopes,
    /// detects conflicts, validates references, and flags common issues.
    pub fn lint_config(
        project_path: &str,
        global_path: Option<&str>,
    ) -> LintResult {
        let mut issues = Vec::new();

        // Load project-scope data
        let project_config = Self::read_config(project_path).ok();
        let project_agents = Self::read_agents(project_path).unwrap_or_default();
        let project_hooks = Self::read_hooks(project_path).unwrap_or_default();
        let project_skills = Self::read_skills(project_path).unwrap_or_default();
        let project_mcp = Self::read_mcp_servers(project_path, false).unwrap_or_default();
        let project_memory = Self::read_memory_stores(project_path).unwrap_or_default();
        let project_detection = Self::detect(project_path);

        // Load global-scope data (if available)
        let global_config = global_path.and_then(|gp| Self::read_config(gp).ok());
        let global_agents = global_path
            .map(|gp| Self::read_agents(gp).unwrap_or_default())
            .unwrap_or_default();
        let global_hooks = global_path
            .map(|gp| Self::read_hooks(gp).unwrap_or_default())
            .unwrap_or_default();
        let global_skills = global_path
            .map(|gp| Self::read_skills(gp).unwrap_or_default())
            .unwrap_or_default();
        let global_mcp = global_path
            .map(|gp| Self::read_mcp_servers(gp, true).unwrap_or_default())
            .unwrap_or_default();
        let global_detection = global_path.map(|gp| Self::detect(gp));

        // =======================================================
        // RULE: missing-claude-md
        // =======================================================
        if !project_detection.has_claude_md {
            issues.push(LintIssue {
                severity: "warning".into(),
                category: "claudemd".into(),
                rule: "missing-claude-md".into(),
                message: "No CLAUDE.md found in project root".into(),
                fix: Some("Create a CLAUDE.md file to give Claude project-specific instructions".into()),
                entity_id: None,
                scope: Some("project".into()),
            });
        }

        // =======================================================
        // RULE: no-model-configured
        // =======================================================
        let has_any_model = project_config
            .as_ref()
            .and_then(|c| c.model.as_ref())
            .is_some()
            || global_config
                .as_ref()
                .and_then(|c| c.model.as_ref())
                .is_some();
        if !has_any_model {
            issues.push(LintIssue {
                severity: "info".into(),
                category: "config".into(),
                rule: "no-model-configured".into(),
                message: "No default model configured at any scope".into(),
                fix: Some("Set a model in settings to avoid relying on the default".into()),
                entity_id: None,
                scope: None,
            });
        }

        // =======================================================
        // RULE: no-ignore-patterns
        // =======================================================
        let has_any_ignore = project_config
            .as_ref()
            .and_then(|c| c.ignore_patterns.as_ref())
            .map_or(false, |p| !p.is_empty())
            || global_config
                .as_ref()
                .and_then(|c| c.ignore_patterns.as_ref())
                .map_or(false, |p| !p.is_empty());
        if !has_any_ignore {
            issues.push(LintIssue {
                severity: "warning".into(),
                category: "config".into(),
                rule: "no-ignore-patterns".into(),
                message: "No ignore patterns configured".into(),
                fix: Some("Add ignore patterns (node_modules, dist, .env) to keep Claude focused on source code".into()),
                entity_id: None,
                scope: None,
            });
        }

        // =======================================================
        // RULE: agent-empty-description / agent-short-prompt
        // =======================================================
        for agent in &project_agents {
            Self::lint_agent(&mut issues, agent, "project");
        }
        for agent in &global_agents {
            Self::lint_agent(&mut issues, agent, "global");
        }

        // =======================================================
        // RULE: hook-no-timeout
        // =======================================================
        for event in &project_hooks {
            Self::lint_hook_event(&mut issues, event, "project");
        }
        for event in &global_hooks {
            Self::lint_hook_event(&mut issues, event, "global");
        }

        // =======================================================
        // RULE: mcp-placeholder-env / mcp-stdio-no-command / mcp-http-no-url
        // =======================================================
        for server in &project_mcp {
            Self::lint_mcp_server(&mut issues, server, "project");
        }
        for server in &global_mcp {
            Self::lint_mcp_server(&mut issues, server, "global");
        }

        // =======================================================
        // RULE: skill-empty-content / skill-dangling-agent
        // =======================================================
        let all_agent_ids: std::collections::HashSet<&str> = project_agents
            .iter()
            .chain(global_agents.iter())
            .map(|a| a.agent_id.as_str())
            .collect();

        for skill in &project_skills {
            Self::lint_skill(&mut issues, skill, &all_agent_ids, "project");
        }
        for skill in &global_skills {
            Self::lint_skill(&mut issues, skill, &all_agent_ids, "global");
        }

        // =======================================================
        // RULE: agent-dangling-memory
        // =======================================================
        let all_memory_ids: std::collections::HashSet<&str> = project_memory
            .iter()
            .map(|m| m.store_id.as_str())
            .collect();

        for agent in &project_agents {
            if let Some(ref mem_id) = agent.memory {
                if !all_memory_ids.contains(mem_id.as_str()) {
                    issues.push(LintIssue {
                        severity: "error".into(),
                        category: "agent".into(),
                        rule: "agent-dangling-memory".into(),
                        message: format!(
                            "Agent \"{}\" references memory store \"{}\" which does not exist",
                            agent.name, mem_id
                        ),
                        fix: Some(format!("Create memory store \"{}\" or remove the binding", mem_id)),
                        entity_id: Some(agent.agent_id.clone()),
                        scope: Some("project".into()),
                    });
                }
            }
        }

        // =======================================================
        // HIERARCHY LINT RULES (cross-scope conflicts)
        // =======================================================
        if global_path.is_some() {
            // RULE: hierarchy-agent-shadow
            for p_agent in &project_agents {
                if global_agents.iter().any(|g| g.agent_id == p_agent.agent_id) {
                    issues.push(LintIssue {
                        severity: "info".into(),
                        category: "hierarchy".into(),
                        rule: "hierarchy-agent-shadow".into(),
                        message: format!(
                            "Project agent \"{}\" shadows a global agent with the same ID",
                            p_agent.agent_id
                        ),
                        fix: Some("This is intentional if you want project-specific behavior; rename if unintended".into()),
                        entity_id: Some(p_agent.agent_id.clone()),
                        scope: Some("project".into()),
                    });
                }
            }

            // RULE: hierarchy-skill-shadow
            for p_skill in &project_skills {
                if global_skills
                    .iter()
                    .any(|g| g.skill_id == p_skill.skill_id)
                {
                    issues.push(LintIssue {
                        severity: "info".into(),
                        category: "hierarchy".into(),
                        rule: "hierarchy-skill-shadow".into(),
                        message: format!(
                            "Project skill \"{}\" shadows a global skill with the same ID",
                            p_skill.skill_id
                        ),
                        fix: Some("This is intentional if you want project-specific behavior; rename if unintended".into()),
                        entity_id: Some(p_skill.skill_id.clone()),
                        scope: Some("project".into()),
                    });
                }
            }

            // RULE: hierarchy-mcp-shadow
            for p_mcp in &project_mcp {
                if global_mcp
                    .iter()
                    .any(|g| g.server_id == p_mcp.server_id)
                {
                    issues.push(LintIssue {
                        severity: "warning".into(),
                        category: "hierarchy".into(),
                        rule: "hierarchy-mcp-shadow".into(),
                        message: format!(
                            "Project MCP server \"{}\" shadows a global server with the same ID",
                            p_mcp.server_id
                        ),
                        fix: Some("Project MCP overrides the global one. Rename the project server if you want both active".into()),
                        entity_id: Some(p_mcp.server_id.clone()),
                        scope: Some("project".into()),
                    });
                }
            }

            // RULE: hierarchy-model-conflict
            let p_model = project_config.as_ref().and_then(|c| c.model.as_ref());
            let g_model = global_config.as_ref().and_then(|c| c.model.as_ref());
            if let (Some(pm), Some(gm)) = (p_model, g_model) {
                if pm != gm {
                    issues.push(LintIssue {
                        severity: "info".into(),
                        category: "hierarchy".into(),
                        rule: "hierarchy-model-conflict".into(),
                        message: format!(
                            "Project model \"{}\" differs from global model \"{}\"",
                            pm, gm
                        ),
                        fix: Some("Project model overrides the global one — this is expected if intentional".into()),
                        entity_id: None,
                        scope: Some("project".into()),
                    });
                }
            }

            // RULE: hierarchy-hook-duplicate-event
            for p_event in &project_hooks {
                if global_hooks.iter().any(|g| g.event == p_event.event) {
                    issues.push(LintIssue {
                        severity: "info".into(),
                        category: "hierarchy".into(),
                        rule: "hierarchy-hook-duplicate-event".into(),
                        message: format!(
                            "Both global and project define hooks for event \"{}\" — both will run",
                            p_event.event
                        ),
                        fix: Some("Hooks from both scopes execute. Ensure they don't conflict or duplicate work".into()),
                        entity_id: None,
                        scope: Some("project".into()),
                    });
                }
            }

            // RULE: hierarchy-claudemd-conflict
            let global_has_md = global_detection
                .as_ref()
                .map_or(false, |d| d.has_claude_md);
            if project_detection.has_claude_md && global_has_md {
                // Check for contradictory instructions
                let p_md = Self::read_claude_md(project_path).unwrap_or_default();
                let g_md = global_path
                    .and_then(|gp| Self::read_claude_md(gp).ok())
                    .unwrap_or_default();

                if !p_md.is_empty() && !g_md.is_empty() {
                    // Check for obvious contradictions:
                    // e.g., project says "always X" and global says "never X"
                    let p_lower = p_md.to_lowercase();
                    let g_lower = g_md.to_lowercase();

                    let contradictions = [
                        ("always use typescript", "never use typescript"),
                        ("always use javascript", "never use javascript"),
                        ("use tabs", "use spaces"),
                        ("use spaces", "use tabs"),
                        ("never use semicolons", "always use semicolons"),
                        ("always use semicolons", "never use semicolons"),
                    ];

                    for (pattern_a, pattern_b) in &contradictions {
                        if (p_lower.contains(pattern_a) && g_lower.contains(pattern_b))
                            || (p_lower.contains(pattern_b) && g_lower.contains(pattern_a))
                        {
                            issues.push(LintIssue {
                                severity: "error".into(),
                                category: "hierarchy".into(),
                                rule: "hierarchy-claudemd-conflict".into(),
                                message: format!(
                                    "Contradictory instructions detected between project and global CLAUDE.md: \"{}\" vs \"{}\"",
                                    pattern_a, pattern_b
                                ),
                                fix: Some("Align instructions — project CLAUDE.md takes precedence but contradictions cause confusion".into()),
                                entity_id: None,
                                scope: Some("project".into()),
                            });
                        }
                    }

                    // Always note the overlap exists even without detected contradictions
                    issues.push(LintIssue {
                        severity: "info".into(),
                        category: "hierarchy".into(),
                        rule: "hierarchy-claudemd-overlap".into(),
                        message: "Both global and project have CLAUDE.md files — both will be read by Claude".into(),
                        fix: Some("Project instructions take precedence. Ensure they complement rather than contradict global ones".into()),
                        entity_id: None,
                        scope: Some("project".into()),
                    });
                }
            }

            // RULE: hierarchy-permission-conflict
            let p_perms = project_config.as_ref().and_then(|c| c.permissions.as_ref());
            let g_perms = global_config.as_ref().and_then(|c| c.permissions.as_ref());
            if let (Some(pp), Some(gp)) = (p_perms, g_perms) {
                // Check if project allows a tool that global denies
                let p_allow: Vec<&str> = pp
                    .get("allow")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
                    .unwrap_or_default();
                let g_deny: Vec<&str> = gp
                    .get("deny")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
                    .unwrap_or_default();

                for tool in &p_allow {
                    if g_deny.contains(tool) {
                        issues.push(LintIssue {
                            severity: "error".into(),
                            category: "hierarchy".into(),
                            rule: "hierarchy-permission-conflict".into(),
                            message: format!(
                                "Project allows tool \"{}\" but global config denies it",
                                tool
                            ),
                            fix: Some("Global deny takes precedence — remove from project allow list or update global config".into()),
                            entity_id: None,
                            scope: Some("project".into()),
                        });
                    }
                }
            }
        }

        // =======================================================
        // RULE: settings-unknown-keys
        // =======================================================
        if let Some(ref config) = project_config {
            Self::lint_settings_keys(&mut issues, &config.raw, "project");
        }
        if let Some(ref config) = global_config {
            Self::lint_settings_keys(&mut issues, &config.raw, "global");
        }

        // Compute score
        let error_count = issues.iter().filter(|i| i.severity == "error").count() as u32;
        let warning_count = issues.iter().filter(|i| i.severity == "warning").count() as u32;
        let info_count = issues.iter().filter(|i| i.severity == "info").count() as u32;

        let score = 100u32
            .saturating_sub(error_count * 20)
            .saturating_sub(warning_count * 10)
            .saturating_sub(info_count * 3);

        LintResult {
            issues,
            score,
            error_count,
            warning_count,
            info_count,
        }
    }

    // -- Lint helper methods --

    fn lint_agent(issues: &mut Vec<LintIssue>, agent: &Agent, scope: &str) {
        if agent.description.trim().len() < 5 {
            issues.push(LintIssue {
                severity: "info".into(),
                category: "agent".into(),
                rule: "agent-empty-description".into(),
                message: format!("Agent \"{}\" has no meaningful description", agent.name),
                fix: Some("Add a description to help Claude understand when to use this agent".into()),
                entity_id: Some(agent.agent_id.clone()),
                scope: Some(scope.into()),
            });
        }
        if agent.system_prompt.trim().len() < 20 {
            issues.push(LintIssue {
                severity: "warning".into(),
                category: "agent".into(),
                rule: "agent-short-prompt".into(),
                message: format!("Agent \"{}\" has a very short system prompt", agent.name),
                fix: Some("A more detailed system prompt will produce better results".into()),
                entity_id: Some(agent.agent_id.clone()),
                scope: Some(scope.into()),
            });
        }
        if agent.tools.is_empty() {
            issues.push(LintIssue {
                severity: "info".into(),
                category: "agent".into(),
                rule: "agent-no-tools".into(),
                message: format!("Agent \"{}\" has no tools configured", agent.name),
                fix: Some("Agents without tools can only chat — add tools if file access or commands are needed".into()),
                entity_id: Some(agent.agent_id.clone()),
                scope: Some(scope.into()),
            });
        }
        // Check for unknown tools
        for tool in &agent.tools {
            if !KNOWN_TOOLS.contains(&tool.as_str()) {
                issues.push(LintIssue {
                    severity: "warning".into(),
                    category: "agent".into(),
                    rule: "agent-unknown-tool".into(),
                    message: format!(
                        "Agent \"{}\" references unknown tool \"{}\"",
                        agent.name, tool
                    ),
                    fix: Some(format!(
                        "Valid tools: {}. Remove or correct this tool name",
                        KNOWN_TOOLS.join(", ")
                    )),
                    entity_id: Some(agent.agent_id.clone()),
                    scope: Some(scope.into()),
                });
            }
        }
    }

    fn lint_hook_event(issues: &mut Vec<LintIssue>, event: &HookEvent, scope: &str) {
        let valid_events = ["PreToolUse", "PostToolUse", "Notification", "Stop", "SubagentStop"];
        if !valid_events.contains(&event.event.as_str()) {
            issues.push(LintIssue {
                severity: "error".into(),
                category: "hook".into(),
                rule: "hook-unknown-event".into(),
                message: format!("Unknown hook event type \"{}\"", event.event),
                fix: Some(format!("Valid events: {}", valid_events.join(", "))),
                entity_id: None,
                scope: Some(scope.into()),
            });
        }

        for (gi, group) in event.groups.iter().enumerate() {
            // Validate matcher regex
            if let Some(ref matcher) = group.matcher {
                if regex::Regex::new(matcher).is_err() {
                    issues.push(LintIssue {
                        severity: "error".into(),
                        category: "hook".into(),
                        rule: "hook-invalid-matcher".into(),
                        message: format!(
                            "Hook \"{}\" group {} has invalid matcher regex: \"{}\"",
                            event.event, gi, matcher
                        ),
                        fix: Some("Fix the regex pattern or remove the matcher".into()),
                        entity_id: None,
                        scope: Some(scope.into()),
                    });
                }
            }

            for handler in &group.hooks {
                if handler.hook_type == "command" {
                    if handler.timeout.is_none() {
                        issues.push(LintIssue {
                            severity: "info".into(),
                            category: "hook".into(),
                            rule: "hook-no-timeout".into(),
                            message: format!(
                                "Hook \"{}\" command handler has no timeout",
                                event.event
                            ),
                            fix: Some("Set a timeout to prevent hanging commands from blocking Claude".into()),
                            entity_id: None,
                            scope: Some(scope.into()),
                        });
                    }
                    if handler.command.as_ref().map_or(true, |c| c.trim().is_empty()) {
                        issues.push(LintIssue {
                            severity: "error".into(),
                            category: "hook".into(),
                            rule: "hook-empty-command".into(),
                            message: format!(
                                "Hook \"{}\" has a command handler with no command",
                                event.event
                            ),
                            fix: Some("Provide a shell command for the handler".into()),
                            entity_id: None,
                            scope: Some(scope.into()),
                        });
                    }
                }
            }
        }
    }

    fn lint_mcp_server(issues: &mut Vec<LintIssue>, server: &McpServer, scope: &str) {
        // stdio servers need a command
        if server.server_type == "stdio" {
            if server.command.as_ref().map_or(true, |c| c.trim().is_empty()) {
                issues.push(LintIssue {
                    severity: "error".into(),
                    category: "mcp".into(),
                    rule: "mcp-stdio-no-command".into(),
                    message: format!("MCP server \"{}\" (stdio) has no command", server.server_id),
                    fix: Some("Provide the command to start the MCP server".into()),
                    entity_id: Some(server.server_id.clone()),
                    scope: Some(scope.into()),
                });
            }
        }

        // http/sse servers need a URL
        if server.server_type == "http" || server.server_type == "sse" {
            if server.url.as_ref().map_or(true, |u| u.trim().is_empty()) {
                issues.push(LintIssue {
                    severity: "error".into(),
                    category: "mcp".into(),
                    rule: "mcp-http-no-url".into(),
                    message: format!(
                        "MCP server \"{}\" ({}) has no URL",
                        server.server_id, server.server_type
                    ),
                    fix: Some("Provide the URL for the MCP server endpoint".into()),
                    entity_id: Some(server.server_id.clone()),
                    scope: Some(scope.into()),
                });
            }
        }

        // Check for placeholder env values
        if let Some(ref env) = server.env {
            if let Some(obj) = env.as_object() {
                for (key, value) in obj {
                    if let Some(val_str) = value.as_str() {
                        if val_str.contains("<your-")
                            || val_str.contains("YOUR_")
                            || val_str.is_empty()
                        {
                            issues.push(LintIssue {
                                severity: "error".into(),
                                category: "mcp".into(),
                                rule: "mcp-placeholder-env".into(),
                                message: format!(
                                    "MCP \"{}\" has placeholder env var: {}",
                                    server.server_id, key
                                ),
                                fix: Some(format!(
                                    "Replace the placeholder value for {} with your actual credential",
                                    key
                                )),
                                entity_id: Some(server.server_id.clone()),
                                scope: Some(scope.into()),
                            });
                        }
                    }
                }
            }
        }
    }

    fn lint_skill(
        issues: &mut Vec<LintIssue>,
        skill: &Skill,
        all_agent_ids: &std::collections::HashSet<&str>,
        scope: &str,
    ) {
        if skill.content.trim().len() < 10 {
            issues.push(LintIssue {
                severity: "warning".into(),
                category: "skill".into(),
                rule: "skill-empty-content".into(),
                message: format!("Skill \"{}\" has very little content", skill.name),
                fix: Some("Add detailed instructions for better skill behavior".into()),
                entity_id: Some(skill.skill_id.clone()),
                scope: Some(scope.into()),
            });
        }

        if let Some(ref agent_id) = skill.agent {
            if !all_agent_ids.contains(agent_id.as_str()) {
                issues.push(LintIssue {
                    severity: "error".into(),
                    category: "skill".into(),
                    rule: "skill-dangling-agent".into(),
                    message: format!(
                        "Skill \"{}\" references agent \"{}\" which does not exist",
                        skill.name, agent_id
                    ),
                    fix: Some(format!(
                        "Create agent \"{}\" or remove the agent binding from this skill",
                        agent_id
                    )),
                    entity_id: Some(skill.skill_id.clone()),
                    scope: Some(scope.into()),
                });
            }
        }
    }

    fn lint_settings_keys(issues: &mut Vec<LintIssue>, raw: &serde_json::Value, scope: &str) {
        let known_keys = [
            "model",
            "permissions",
            "ignorePatterns",
            "hooks",
            "allowedTools",
            "deniedTools",
            "contextServers",
            "trustTools",
            "systemPrompt",
            "customApiKeyResponses",
            "env",
            "mcpServers",
        ];

        if let Some(obj) = raw.as_object() {
            for key in obj.keys() {
                if !known_keys.contains(&key.as_str()) {
                    issues.push(LintIssue {
                        severity: "warning".into(),
                        category: "config".into(),
                        rule: "settings-unknown-key".into(),
                        message: format!("Unknown key \"{}\" in settings.json", key),
                        fix: Some("This key may be ignored by Claude Code. Check the official schema for valid keys".into()),
                        entity_id: None,
                        scope: Some(scope.into()),
                    });
                }
            }
        }
    }
}

/// Atomic file write: write to temp file, then rename
pub fn atomic_write(path: &Path, contents: &str) -> Result<(), std::io::Error> {
    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, contents)?;
    fs::rename(&temp_path, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- atomic_write tests --

    #[test]
    fn atomic_write_creates_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.txt");
        atomic_write(&file_path, "hello").unwrap();
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "hello");
    }

    #[test]
    fn atomic_write_cleans_up_tmp() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.txt");
        atomic_write(&file_path, "hello").unwrap();
        let tmp_path = tmp.path().join("test.tmp");
        assert!(!tmp_path.exists());
    }

    #[test]
    fn atomic_write_overwrites_existing() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.txt");
        atomic_write(&file_path, "first").unwrap();
        atomic_write(&file_path, "second").unwrap();
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "second");
    }

    // -- detect tests --

    #[test]
    fn detect_empty_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let detection = ClaudeRepoAdapter::detect(tmp.path().to_str().unwrap());
        assert!(!detection.has_settings_json);
        assert!(!detection.has_claude_md);
        assert!(!detection.has_agents_dir);
        assert!(!detection.has_memory_dir);
        assert!(!detection.has_skills_dir);
        assert!(!detection.has_mcp_json);
        assert_eq!(detection.hook_count, 0);
        assert!(detection.config_path.is_none());
    }

    #[test]
    fn detect_full_claude_setup() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();

        fs::create_dir_all(base.join(".claude/agents")).unwrap();
        fs::create_dir_all(base.join(".claude/memory")).unwrap();
        fs::create_dir_all(base.join(".claude/skills")).unwrap();
        fs::write(base.join("CLAUDE.md"), "# Test").unwrap();
        fs::write(base.join(".mcp.json"), "{}").unwrap();
        fs::write(
            base.join(".claude/settings.json"),
            r#"{"hooks": {"PreToolUse": [], "PostToolUse": []}}"#,
        )
        .unwrap();

        let detection = ClaudeRepoAdapter::detect(base.to_str().unwrap());
        assert!(detection.has_settings_json);
        assert!(detection.has_claude_md);
        assert!(detection.has_agents_dir);
        assert!(detection.has_memory_dir);
        assert!(detection.has_skills_dir);
        assert!(detection.has_mcp_json);
        assert_eq!(detection.hook_count, 2);
        assert!(detection.config_path.is_some());
    }

    #[test]
    fn detect_claude_json_counts_as_mcp() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join(".claude.json"), "{}").unwrap();

        let detection = ClaudeRepoAdapter::detect(tmp.path().to_str().unwrap());
        assert!(detection.has_mcp_json);
    }

    // -- read_config / write_config tests --

    #[test]
    fn read_config_returns_empty_when_no_file() {
        let tmp = tempfile::tempdir().unwrap();
        let config = ClaudeRepoAdapter::read_config(tmp.path().to_str().unwrap()).unwrap();
        assert!(config.model.is_none());
        assert!(config.permissions.is_none());
        assert!(config.ignore_patterns.is_none());
    }

    #[test]
    fn write_and_read_config_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let config = NormalizedConfig {
            model: Some("claude-sonnet-4-20250514".to_string()),
            permissions: Some(serde_json::json!({"allow": ["Read", "Write"]})),
            ignore_patterns: Some(vec!["node_modules".to_string(), ".git".to_string()]),
            raw: serde_json::json!({}),
        };

        ClaudeRepoAdapter::write_config(path, &config).unwrap();
        let loaded = ClaudeRepoAdapter::read_config(path).unwrap();

        assert_eq!(loaded.model, Some("claude-sonnet-4-20250514".to_string()));
        assert!(loaded.permissions.is_some());
        assert_eq!(
            loaded.ignore_patterns,
            Some(vec!["node_modules".to_string(), ".git".to_string()])
        );
    }

    #[test]
    fn write_config_creates_claude_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let config = NormalizedConfig {
            model: None,
            permissions: None,
            ignore_patterns: None,
            raw: serde_json::json!({"custom": "value"}),
        };

        ClaudeRepoAdapter::write_config(tmp.path().to_str().unwrap(), &config).unwrap();
        assert!(tmp.path().join(".claude/settings.json").exists());
    }

    // -- agent CRUD tests --

    #[test]
    fn read_agents_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let agents = ClaudeRepoAdapter::read_agents(tmp.path().to_str().unwrap()).unwrap();
        assert!(agents.is_empty());
    }

    #[test]
    fn write_and_read_agent() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let agent = Agent {
            agent_id: "test-agent".to_string(),
            name: "Test Agent".to_string(),
            description: "A test agent for unit tests".to_string(),
            system_prompt: "You are a test agent.".to_string(),
            tools: vec!["Read".to_string(), "Write".to_string()],
            model_override: Some("sonnet".to_string()),
            memory: Some("user".to_string()),
        };

        ClaudeRepoAdapter::write_agent(path, &agent).unwrap();
        let agents = ClaudeRepoAdapter::read_agents(path).unwrap();

        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].agent_id, "test-agent");
        assert_eq!(agents[0].name, "Test Agent");
        assert_eq!(agents[0].description, "A test agent for unit tests");
        assert_eq!(agents[0].system_prompt, "You are a test agent.\n");
        assert_eq!(agents[0].tools, vec!["Read", "Write"]);
        assert_eq!(agents[0].model_override, Some("sonnet".to_string()));
        assert_eq!(agents[0].memory, Some("user".to_string()));
    }

    #[test]
    fn delete_agent() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let agent = Agent {
            agent_id: "doomed".to_string(),
            name: "Doomed Agent".to_string(),
            description: "Will be deleted".to_string(),
            system_prompt: "Gone soon.".to_string(),
            tools: vec![],
            model_override: None,
            memory: None,
        };

        ClaudeRepoAdapter::write_agent(path, &agent).unwrap();
        ClaudeRepoAdapter::delete_agent(path, "doomed").unwrap();
        let agents = ClaudeRepoAdapter::read_agents(path).unwrap();
        assert!(agents.is_empty());
    }

    #[test]
    fn delete_nonexistent_agent_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let result = ClaudeRepoAdapter::delete_agent(tmp.path().to_str().unwrap(), "nope");
        assert!(result.is_err());
    }

    #[test]
    fn write_agent_uses_yaml_frontmatter() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let agent = Agent {
            agent_id: "my-agent".to_string(),
            name: "My Agent".to_string(),
            description: "A helpful agent".to_string(),
            system_prompt: "Hello".to_string(),
            tools: vec!["Bash".to_string()],
            model_override: None,
            memory: None,
        };

        ClaudeRepoAdapter::write_agent(path, &agent).unwrap();

        assert!(tmp.path().join(".claude/agents/my-agent.md").exists());
        // No sidecar file should be created
        assert!(!tmp.path().join(".claude/agents/my-agent.meta.json").exists());

        // Verify YAML frontmatter content
        let content = fs::read_to_string(tmp.path().join(".claude/agents/my-agent.md")).unwrap();
        assert!(content.starts_with("---\n"));
        assert!(content.contains("name: My Agent"));
        assert!(content.contains("description: A helpful agent"));
        assert!(content.contains("tools: Bash"));
    }

    // -- memory entry parsing tests --

    #[test]
    fn parse_entries_empty() {
        let entries = ClaudeRepoAdapter::parse_entries("");
        assert!(entries.is_empty());
    }

    #[test]
    fn parse_entries_single() {
        let entries = ClaudeRepoAdapter::parse_entries("- Hello world");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "Hello world");
    }

    #[test]
    fn parse_entries_multiple() {
        let entries = ClaudeRepoAdapter::parse_entries("- First\n- Second\n- Third");
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].content, "First");
        assert_eq!(entries[1].content, "Second");
        assert_eq!(entries[2].content, "Third");
    }

    #[test]
    fn parse_entries_asterisk_bullets() {
        let entries = ClaudeRepoAdapter::parse_entries("* Item one\n* Item two");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].content, "Item one");
    }

    #[test]
    fn parse_entries_multiline() {
        let entries = ClaudeRepoAdapter::parse_entries("- Line one\n  continued\n- Line two");
        assert_eq!(entries.len(), 2);
        assert!(entries[0].content.contains("continued"));
    }

    #[test]
    fn rebuild_entries_roundtrip() {
        let entries = vec![
            MemoryEntry { key: "1".to_string(), content: "First".to_string() },
            MemoryEntry { key: "2".to_string(), content: "Second".to_string() },
        ];
        let rebuilt = ClaudeRepoAdapter::rebuild_entries(&entries);
        assert_eq!(rebuilt, "- First\n- Second\n");
    }

    // -- memory store CRUD tests --

    #[test]
    fn create_and_read_memory_store() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let store = ClaudeRepoAdapter::create_memory_store(path, "test-store").unwrap();
        assert_eq!(store.name, "test-store");
        assert_eq!(store.entry_count, 0);

        let stores = ClaudeRepoAdapter::read_memory_stores(path).unwrap();
        assert_eq!(stores.len(), 1);
    }

    #[test]
    fn write_and_read_memory_entries() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let store = ClaudeRepoAdapter::create_memory_store(path, "notes").unwrap();

        let entry = MemoryEntry {
            key: "entry_1".to_string(),
            content: "Remember this".to_string(),
        };
        ClaudeRepoAdapter::write_memory_entry(&store.path, &entry).unwrap();

        let entries = ClaudeRepoAdapter::read_memory_entries(&store.path).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "Remember this");
    }

    #[test]
    fn update_memory_entry() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let store = ClaudeRepoAdapter::create_memory_store(path, "notes").unwrap();
        ClaudeRepoAdapter::write_memory_entry(
            &store.path,
            &MemoryEntry { key: "1".to_string(), content: "Original".to_string() },
        ).unwrap();

        ClaudeRepoAdapter::update_memory_entry(&store.path, 0, "Updated").unwrap();

        let entries = ClaudeRepoAdapter::read_memory_entries(&store.path).unwrap();
        assert_eq!(entries[0].content, "Updated");
    }

    #[test]
    fn update_memory_entry_out_of_bounds() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let store = ClaudeRepoAdapter::create_memory_store(path, "notes").unwrap();
        let result = ClaudeRepoAdapter::update_memory_entry(&store.path, 99, "nope");
        assert!(result.is_err());
    }

    #[test]
    fn delete_memory_entry() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let store = ClaudeRepoAdapter::create_memory_store(path, "notes").unwrap();
        ClaudeRepoAdapter::write_memory_entry(
            &store.path,
            &MemoryEntry { key: "1".to_string(), content: "Keep".to_string() },
        ).unwrap();
        ClaudeRepoAdapter::write_memory_entry(
            &store.path,
            &MemoryEntry { key: "2".to_string(), content: "Delete me".to_string() },
        ).unwrap();

        ClaudeRepoAdapter::delete_memory_entry(&store.path, 1).unwrap();

        let entries = ClaudeRepoAdapter::read_memory_entries(&store.path).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].content, "Keep");
    }

    #[test]
    fn reset_memory_clears_store() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let store = ClaudeRepoAdapter::create_memory_store(path, "notes").unwrap();
        ClaudeRepoAdapter::write_memory_entry(
            &store.path,
            &MemoryEntry { key: "1".to_string(), content: "data".to_string() },
        ).unwrap();

        ClaudeRepoAdapter::reset_memory(&store.path).unwrap();

        let entries = ClaudeRepoAdapter::read_memory_entries(&store.path).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn delete_memory_store() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let store = ClaudeRepoAdapter::create_memory_store(path, "temp").unwrap();
        ClaudeRepoAdapter::delete_memory_store(&store.path).unwrap();

        let stores = ClaudeRepoAdapter::read_memory_stores(path).unwrap();
        assert!(stores.is_empty());
    }

    // -- hooks tests --

    #[test]
    fn read_hooks_no_file() {
        let tmp = tempfile::tempdir().unwrap();
        let hooks = ClaudeRepoAdapter::read_hooks(tmp.path().to_str().unwrap()).unwrap();
        assert!(hooks.is_empty());
    }

    #[test]
    fn write_and_read_hooks() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let hooks = vec![HookEvent {
            event: "PreToolUse".to_string(),
            groups: vec![HookGroup {
                matcher: Some("Bash".to_string()),
                hooks: vec![HookHandler {
                    hook_type: "command".to_string(),
                    command: Some("echo 'pre-hook'".to_string()),
                    prompt: None,
                    timeout: Some(5000),
                }],
                disabled: None,
            }],
        }];

        ClaudeRepoAdapter::write_hooks(path, &hooks).unwrap();
        let loaded = ClaudeRepoAdapter::read_hooks(path).unwrap();

        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].event, "PreToolUse");
        assert_eq!(loaded[0].groups.len(), 1);
        assert_eq!(loaded[0].groups[0].matcher, Some("Bash".to_string()));
        assert_eq!(loaded[0].groups[0].hooks[0].command, Some("echo 'pre-hook'".to_string()));
        assert_eq!(loaded[0].groups[0].hooks[0].timeout, Some(5000));
    }

    #[test]
    fn write_empty_hooks_removes_key() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        // Write hooks first
        let hooks = vec![HookEvent {
            event: "Stop".to_string(),
            groups: vec![],
        }];
        ClaudeRepoAdapter::write_hooks(path, &hooks).unwrap();

        // Then clear them
        ClaudeRepoAdapter::write_hooks(path, &[]).unwrap();

        let loaded = ClaudeRepoAdapter::read_hooks(path).unwrap();
        assert!(loaded.is_empty());
    }

    #[test]
    fn write_hooks_preserves_other_settings() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        fs::create_dir_all(base.join(".claude")).unwrap();
        fs::write(
            base.join(".claude/settings.json"),
            r#"{"model": "claude-sonnet-4-20250514", "customKey": true}"#,
        ).unwrap();

        let hooks = vec![HookEvent {
            event: "Stop".to_string(),
            groups: vec![],
        }];
        ClaudeRepoAdapter::write_hooks(base.to_str().unwrap(), &hooks).unwrap();

        // Verify model is preserved
        let contents = fs::read_to_string(base.join(".claude/settings.json")).unwrap();
        let raw: serde_json::Value = serde_json::from_str(&contents).unwrap();
        assert_eq!(raw["model"], "claude-sonnet-4-20250514");
        assert_eq!(raw["customKey"], true);
    }

    // -- reorder_hook_groups tests --

    #[test]
    fn reorder_hook_groups_reverses_two_groups() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        fs::create_dir_all(base.join(".claude")).unwrap();
        fs::write(
            base.join(".claude/settings.json"),
            r#"{
                "hooks": {
                    "PreToolUse": [
                        { "matcher": "Bash", "hooks": [{ "type": "command", "command": "echo first" }] },
                        { "matcher": "Write", "hooks": [{ "type": "command", "command": "echo second" }] }
                    ]
                }
            }"#,
        ).unwrap();

        ClaudeRepoAdapter::reorder_hook_groups(base, "PreToolUse", &[1, 0]).unwrap();

        let hooks = ClaudeRepoAdapter::read_hooks(base.to_str().unwrap()).unwrap();
        let event = hooks.iter().find(|h| h.event == "PreToolUse").unwrap();
        assert_eq!(event.groups.len(), 2);
        assert_eq!(event.groups[0].matcher, Some("Write".to_string()));
        assert_eq!(event.groups[1].matcher, Some("Bash".to_string()));
    }

    #[test]
    fn reorder_hook_groups_preserves_other_settings() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        fs::create_dir_all(base.join(".claude")).unwrap();
        fs::write(
            base.join(".claude/settings.json"),
            r#"{
                "model": "claude-sonnet-4-20250514",
                "hooks": {
                    "PreToolUse": [
                        { "matcher": "A", "hooks": [] },
                        { "matcher": "B", "hooks": [] }
                    ]
                }
            }"#,
        ).unwrap();

        ClaudeRepoAdapter::reorder_hook_groups(base, "PreToolUse", &[1, 0]).unwrap();

        let contents = fs::read_to_string(base.join(".claude/settings.json")).unwrap();
        let raw: serde_json::Value = serde_json::from_str(&contents).unwrap();
        assert_eq!(raw["model"], "claude-sonnet-4-20250514");
    }

    #[test]
    fn reorder_hook_groups_invalid_length_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        fs::create_dir_all(base.join(".claude")).unwrap();
        fs::write(
            base.join(".claude/settings.json"),
            r#"{"hooks": {"PreToolUse": [{"matcher": "A", "hooks": []}, {"matcher": "B", "hooks": []}]}}"#,
        ).unwrap();

        let result = ClaudeRepoAdapter::reorder_hook_groups(base, "PreToolUse", &[0]);
        assert!(result.is_err());
    }

    #[test]
    fn reorder_hook_groups_duplicate_index_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        fs::create_dir_all(base.join(".claude")).unwrap();
        fs::write(
            base.join(".claude/settings.json"),
            r#"{"hooks": {"PreToolUse": [{"matcher": "A", "hooks": []}, {"matcher": "B", "hooks": []}]}}"#,
        ).unwrap();

        let result = ClaudeRepoAdapter::reorder_hook_groups(base, "PreToolUse", &[0, 0]);
        assert!(result.is_err());
    }

    #[test]
    fn reorder_hook_groups_out_of_bounds_index_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        fs::create_dir_all(base.join(".claude")).unwrap();
        fs::write(
            base.join(".claude/settings.json"),
            r#"{"hooks": {"PreToolUse": [{"matcher": "A", "hooks": []}]}}"#,
        ).unwrap();

        let result = ClaudeRepoAdapter::reorder_hook_groups(base, "PreToolUse", &[5]);
        assert!(result.is_err());
    }

    #[test]
    fn reorder_hook_groups_nonexistent_event_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        fs::create_dir_all(base.join(".claude")).unwrap();
        fs::write(
            base.join(".claude/settings.json"),
            r#"{"hooks": {"PreToolUse": [{"matcher": "A", "hooks": []}]}}"#,
        ).unwrap();

        let result = ClaudeRepoAdapter::reorder_hook_groups(base, "NonExistent", &[0]);
        assert!(result.is_err());
    }

    #[test]
    fn reorder_hook_groups_no_settings_file_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let result = ClaudeRepoAdapter::reorder_hook_groups(tmp.path(), "PreToolUse", &[0]);
        assert!(result.is_err());
    }

    #[test]
    fn reorder_hook_groups_identity_is_noop() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();
        fs::create_dir_all(base.join(".claude")).unwrap();
        fs::write(
            base.join(".claude/settings.json"),
            r#"{"hooks": {"PreToolUse": [{"matcher": "A", "hooks": []}, {"matcher": "B", "hooks": []}, {"matcher": "C", "hooks": []}]}}"#,
        ).unwrap();

        ClaudeRepoAdapter::reorder_hook_groups(base, "PreToolUse", &[0, 1, 2]).unwrap();

        let hooks = ClaudeRepoAdapter::read_hooks(base.to_str().unwrap()).unwrap();
        let event = hooks.iter().find(|h| h.event == "PreToolUse").unwrap();
        assert_eq!(event.groups[0].matcher, Some("A".to_string()));
        assert_eq!(event.groups[1].matcher, Some("B".to_string()));
        assert_eq!(event.groups[2].matcher, Some("C".to_string()));
    }

    // -- skills tests --

    #[test]
    fn read_skills_no_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let skills = ClaudeRepoAdapter::read_skills(tmp.path().to_str().unwrap()).unwrap();
        assert!(skills.is_empty());
    }

    #[test]
    fn write_and_read_skill() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let skill = Skill {
            skill_id: "my-skill".to_string(),
            name: "My Skill".to_string(),
            description: Some("A test skill".to_string()),
            user_invocable: Some(true),
            allowed_tools: vec!["Read".to_string(), "Bash".to_string()],
            model: Some("claude-sonnet-4-20250514".to_string()),
            disable_model_invocation: None,
            context: None,
            agent: None,
            argument_hint: Some("file path".to_string()),
            content: "Do the thing.\n".to_string(),
        };

        ClaudeRepoAdapter::write_skill(path, &skill).unwrap();
        let skills = ClaudeRepoAdapter::read_skills(path).unwrap();

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].skill_id, "my-skill");
        assert_eq!(skills[0].name, "My Skill");
        assert_eq!(skills[0].description, Some("A test skill".to_string()));
        assert_eq!(skills[0].user_invocable, Some(true));
        assert_eq!(skills[0].allowed_tools, vec!["Read", "Bash"]);
        assert!(skills[0].content.contains("Do the thing."));
    }

    #[test]
    fn delete_skill() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let skill = Skill {
            skill_id: "deleteme".to_string(),
            name: "Delete Me".to_string(),
            description: None,
            user_invocable: None,
            allowed_tools: vec![],
            model: None,
            disable_model_invocation: None,
            context: None,
            agent: None,
            argument_hint: None,
            content: "temp".to_string(),
        };

        ClaudeRepoAdapter::write_skill(path, &skill).unwrap();
        ClaudeRepoAdapter::delete_skill(path, "deleteme").unwrap();
        let skills = ClaudeRepoAdapter::read_skills(path).unwrap();
        assert!(skills.is_empty());
    }

    #[test]
    fn delete_nonexistent_skill_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let result = ClaudeRepoAdapter::delete_skill(tmp.path().to_str().unwrap(), "nope");
        assert!(result.is_err());
    }

    // -- MCP server tests --

    #[test]
    fn read_mcp_servers_no_file() {
        let tmp = tempfile::tempdir().unwrap();
        let servers = ClaudeRepoAdapter::read_mcp_servers(tmp.path().to_str().unwrap(), false).unwrap();
        assert!(servers.is_empty());
    }

    #[test]
    fn write_and_read_mcp_server_project() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let server = McpServer {
            server_id: "my-server".to_string(),
            server_type: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: Some(vec!["-y".to_string(), "@my/server".to_string()]),
            url: None,
            env: Some(serde_json::json!({"API_KEY": "test"})),
            headers: None,
            disabled: None,
        };

        ClaudeRepoAdapter::write_mcp_server(path, &server, false).unwrap();
        let servers = ClaudeRepoAdapter::read_mcp_servers(path, false).unwrap();

        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].server_id, "my-server");
        assert_eq!(servers[0].server_type, "stdio");
        assert_eq!(servers[0].command, Some("npx".to_string()));
        assert_eq!(servers[0].args, Some(vec!["-y".to_string(), "@my/server".to_string()]));
    }

    #[test]
    fn write_mcp_server_global_uses_claude_json() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let server = McpServer {
            server_id: "global-srv".to_string(),
            server_type: "sse".to_string(),
            command: None,
            args: None,
            url: Some("https://example.com/mcp".to_string()),
            env: None,
            headers: None,
            disabled: None,
        };

        ClaudeRepoAdapter::write_mcp_server(path, &server, true).unwrap();
        assert!(tmp.path().join(".claude.json").exists());
        assert!(!tmp.path().join(".mcp.json").exists());
    }

    #[test]
    fn delete_mcp_server() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let server = McpServer {
            server_id: "srv".to_string(),
            server_type: "stdio".to_string(),
            command: Some("cmd".to_string()),
            args: None,
            url: None,
            env: None,
            headers: None,
            disabled: None,
        };

        ClaudeRepoAdapter::write_mcp_server(path, &server, false).unwrap();
        ClaudeRepoAdapter::delete_mcp_server(path, "srv", false).unwrap();

        let servers = ClaudeRepoAdapter::read_mcp_servers(path, false).unwrap();
        assert!(servers.is_empty());
    }

    #[test]
    fn delete_nonexistent_mcp_server_fails() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join(".mcp.json"), r#"{"mcpServers": {}}"#).unwrap();

        let result = ClaudeRepoAdapter::delete_mcp_server(tmp.path().to_str().unwrap(), "nope", false);
        assert!(result.is_err());
    }

    // -- known_tools tests --

    #[test]
    fn known_tools_contains_expected() {
        let tools = ClaudeRepoAdapter::known_tools();
        assert!(tools.contains(&"Read".to_string()));
        assert!(tools.contains(&"Write".to_string()));
        assert!(tools.contains(&"Bash".to_string()));
        assert!(tools.contains(&"Edit".to_string()));
        assert!(!tools.is_empty());
    }

    // -- serialization tests --

    #[test]
    fn claude_detection_serializes_camel_case() {
        let detection = ClaudeDetection {
            has_settings_json: true,
            has_claude_md: false,
            has_agents_dir: true,
            has_memory_dir: false,
            has_skills_dir: false,
            has_mcp_json: true,
            hook_count: 3,
            config_path: Some("/path".to_string()),
        };
        let json = serde_json::to_value(&detection).unwrap();
        assert!(json.get("hasSettingsJson").is_some());
        assert!(json.get("hookCount").is_some());
        assert!(json.get("has_settings_json").is_none());
    }

    #[test]
    fn agent_serializes_camel_case() {
        let agent = Agent {
            agent_id: "test".to_string(),
            name: "Test".to_string(),
            description: "A test".to_string(),
            system_prompt: "Hello".to_string(),
            tools: vec![],
            model_override: None,
            memory: None,
        };
        let json = serde_json::to_value(&agent).unwrap();
        assert!(json.get("agentId").is_some());
        assert!(json.get("systemPrompt").is_some());
        assert!(json.get("modelOverride").is_some());
        assert!(json.get("description").is_some());
        assert!(json.get("memory").is_some());
    }

    #[test]
    fn mcp_server_serializes_correctly() {
        let server = McpServer {
            server_id: "test".to_string(),
            server_type: "stdio".to_string(),
            command: Some("cmd".to_string()),
            args: None,
            url: None,
            env: None,
            headers: None,
            disabled: None,
        };
        let json = serde_json::to_value(&server).unwrap();
        assert!(json.get("serverId").is_some());
        // "type" field uses serde rename
        assert!(json.get("type").is_some());
    }

    // -- CLAUDE.md tests --

    #[test]
    fn read_claude_md_returns_empty_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        let result = ClaudeRepoAdapter::read_claude_md(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(result, "");
    }

    #[test]
    fn read_claude_md_reads_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        let content = "# Project Instructions\n\nAlways write tests.";
        std::fs::write(dir.path().join("CLAUDE.md"), content).unwrap();
        let result = ClaudeRepoAdapter::read_claude_md(path).unwrap();
        assert_eq!(result, content);
    }

    #[test]
    fn list_claude_md_files_finds_nested() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("frontend");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(sub.join("CLAUDE.md"), "# Frontend").unwrap();
        let files = ClaudeRepoAdapter::list_claude_md_files(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(files, vec!["frontend/CLAUDE.md"]);
    }

    // -- config snapshot tests --

    #[test]
    fn save_and_list_config_snapshots() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        // Create some config first
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(claude_dir.join("settings.json"), r#"{"model":"claude-sonnet-4-6"}"#).unwrap();

        let snapshot = ClaudeRepoAdapter::save_config_snapshot(path, "test snapshot").unwrap();
        assert!(!snapshot.snapshot_id.is_empty());
        assert_eq!(snapshot.label, "test snapshot");
        assert!(snapshot.settings_json.is_some());

        let list = ClaudeRepoAdapter::list_config_snapshots(path).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].label, "test snapshot");
        assert!(list[0].has_settings);
    }

    #[test]
    fn restore_config_snapshot_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(claude_dir.join("settings.json"), r#"{"model":"claude-sonnet-4-6"}"#).unwrap();

        let snapshot = ClaudeRepoAdapter::save_config_snapshot(path, "before change").unwrap();
        // Change config
        std::fs::write(claude_dir.join("settings.json"), r#"{"model":"claude-opus-4-6"}"#).unwrap();
        // Restore
        ClaudeRepoAdapter::restore_config_snapshot(path, &snapshot.snapshot_id).unwrap();
        let restored = std::fs::read_to_string(claude_dir.join("settings.json")).unwrap();
        assert!(restored.contains("claude-sonnet-4-6"));
    }

    #[test]
    fn list_snapshots_empty_when_no_history() {
        let dir = tempfile::tempdir().unwrap();
        let list = ClaudeRepoAdapter::list_config_snapshots(dir.path().to_str().unwrap()).unwrap();
        assert!(list.is_empty());
    }

    // -- enable/disable agent tests --

    #[test]
    fn disable_and_enable_agent_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let agent = Agent {
            agent_id: "toggle-me".to_string(),
            name: "Toggle Agent".to_string(),
            description: "Can be toggled".to_string(),
            system_prompt: "Hello".to_string(),
            tools: vec![],
            model_override: None,
            memory: None,
        };

        ClaudeRepoAdapter::write_agent(path, &agent).unwrap();
        assert!(!ClaudeRepoAdapter::is_agent_disabled(path, "toggle-me"));

        // Disable
        ClaudeRepoAdapter::disable_agent(path, "toggle-me").unwrap();
        assert!(ClaudeRepoAdapter::is_agent_disabled(path, "toggle-me"));

        // Agent should not appear in read_agents
        let agents = ClaudeRepoAdapter::read_agents(path).unwrap();
        assert!(agents.is_empty());

        // Should appear in list_disabled_agents
        let disabled = ClaudeRepoAdapter::list_disabled_agents(path).unwrap();
        assert_eq!(disabled, vec!["toggle-me"]);

        // Enable
        ClaudeRepoAdapter::enable_agent(path, "toggle-me").unwrap();
        assert!(!ClaudeRepoAdapter::is_agent_disabled(path, "toggle-me"));

        // Agent should appear again
        let agents = ClaudeRepoAdapter::read_agents(path).unwrap();
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].agent_id, "toggle-me");
    }

    #[test]
    fn disable_nonexistent_agent_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let result = ClaudeRepoAdapter::disable_agent(tmp.path().to_str().unwrap(), "nope");
        assert!(result.is_err());
    }

    #[test]
    fn enable_non_disabled_agent_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let result = ClaudeRepoAdapter::enable_agent(tmp.path().to_str().unwrap(), "nope");
        assert!(result.is_err());
    }

    #[test]
    fn list_disabled_agents_empty_when_no_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let disabled = ClaudeRepoAdapter::list_disabled_agents(tmp.path().to_str().unwrap()).unwrap();
        assert!(disabled.is_empty());
    }

    // -- enable/disable skill tests --

    #[test]
    fn disable_and_enable_skill_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let skill = Skill {
            skill_id: "toggle-skill".to_string(),
            name: "Toggle Skill".to_string(),
            description: None,
            user_invocable: Some(true),
            allowed_tools: vec![],
            model: None,
            disable_model_invocation: None,
            context: None,
            agent: None,
            argument_hint: None,
            content: "Do something".to_string(),
        };

        ClaudeRepoAdapter::write_skill(path, &skill).unwrap();

        // Disable
        ClaudeRepoAdapter::disable_skill(path, "toggle-skill").unwrap();

        // Should not appear in read_skills
        let skills = ClaudeRepoAdapter::read_skills(path).unwrap();
        assert!(skills.is_empty());

        // Should appear in list_disabled_skills
        let disabled = ClaudeRepoAdapter::list_disabled_skills(path).unwrap();
        assert_eq!(disabled, vec!["toggle-skill"]);

        // Enable
        ClaudeRepoAdapter::enable_skill(path, "toggle-skill").unwrap();

        let skills = ClaudeRepoAdapter::read_skills(path).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].skill_id, "toggle-skill");

        let disabled = ClaudeRepoAdapter::list_disabled_skills(path).unwrap();
        assert!(disabled.is_empty());
    }

    #[test]
    fn disable_nonexistent_skill_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let result = ClaudeRepoAdapter::disable_skill(tmp.path().to_str().unwrap(), "nope");
        assert!(result.is_err());
    }

    #[test]
    fn enable_non_disabled_skill_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let result = ClaudeRepoAdapter::enable_skill(tmp.path().to_str().unwrap(), "nope");
        assert!(result.is_err());
    }

    // -- enable/disable hook tests --

    #[test]
    fn disable_and_enable_hook_group() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let hooks = vec![HookEvent {
            event: "PreToolUse".to_string(),
            groups: vec![HookGroup {
                matcher: Some("Bash".to_string()),
                hooks: vec![HookHandler {
                    hook_type: "command".to_string(),
                    command: Some("echo hi".to_string()),
                    prompt: None,
                    timeout: None,
                }],
                disabled: None,
            }],
        }];

        ClaudeRepoAdapter::write_hooks(path, &hooks).unwrap();

        // Disable group 0
        ClaudeRepoAdapter::disable_hook(path, "PreToolUse", 0).unwrap();

        // Verify the _disabled field is set
        let settings_path = tmp.path().join(".claude/settings.json");
        let contents = fs::read_to_string(&settings_path).unwrap();
        let raw: serde_json::Value = serde_json::from_str(&contents).unwrap();
        assert_eq!(raw["hooks"]["PreToolUse"][0]["_disabled"], true);

        // Enable group 0
        ClaudeRepoAdapter::enable_hook(path, "PreToolUse", 0).unwrap();

        // Verify the _disabled field is removed
        let contents = fs::read_to_string(&settings_path).unwrap();
        let raw: serde_json::Value = serde_json::from_str(&contents).unwrap();
        assert!(raw["hooks"]["PreToolUse"][0].get("_disabled").is_none());
    }

    #[test]
    fn disable_hook_invalid_index_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let hooks = vec![HookEvent {
            event: "Stop".to_string(),
            groups: vec![],
        }];
        ClaudeRepoAdapter::write_hooks(path, &hooks).unwrap();

        let result = ClaudeRepoAdapter::disable_hook(path, "Stop", 99);
        assert!(result.is_err());
    }

    // -- enable/disable MCP server tests --

    #[test]
    fn disable_and_enable_mcp_server_project() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let server = McpServer {
            server_id: "test-srv".to_string(),
            server_type: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: None,
            url: None,
            env: None,
            headers: None,
            disabled: None,
        };

        ClaudeRepoAdapter::write_mcp_server(path, &server, false).unwrap();

        // Disable
        ClaudeRepoAdapter::disable_mcp_server(path, "test-srv", false).unwrap();

        // Verify the _disabled field is set
        let mcp_path = tmp.path().join(".mcp.json");
        let contents = fs::read_to_string(&mcp_path).unwrap();
        let raw: serde_json::Value = serde_json::from_str(&contents).unwrap();
        assert_eq!(raw["mcpServers"]["test-srv"]["_disabled"], true);

        // Enable
        ClaudeRepoAdapter::enable_mcp_server(path, "test-srv", false).unwrap();

        let contents = fs::read_to_string(&mcp_path).unwrap();
        let raw: serde_json::Value = serde_json::from_str(&contents).unwrap();
        assert!(raw["mcpServers"]["test-srv"].get("_disabled").is_none());
        // Original fields preserved
        assert_eq!(raw["mcpServers"]["test-srv"]["command"], "npx");
    }

    #[test]
    fn disable_mcp_server_nonexistent_fails() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(
            tmp.path().join(".mcp.json"),
            r#"{"mcpServers": {}}"#,
        )
        .unwrap();

        let result =
            ClaudeRepoAdapter::disable_mcp_server(tmp.path().to_str().unwrap(), "nope", false);
        assert!(result.is_err());
    }

    #[test]
    fn disable_mcp_server_global_uses_claude_json() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_str().unwrap();

        let server = McpServer {
            server_id: "global-srv".to_string(),
            server_type: "sse".to_string(),
            command: None,
            args: None,
            url: Some("https://example.com".to_string()),
            env: None,
            headers: None,
            disabled: None,
        };

        ClaudeRepoAdapter::write_mcp_server(path, &server, true).unwrap();
        ClaudeRepoAdapter::disable_mcp_server(path, "global-srv", true).unwrap();

        let contents = fs::read_to_string(tmp.path().join(".claude.json")).unwrap();
        let raw: serde_json::Value = serde_json::from_str(&contents).unwrap();
        assert_eq!(raw["mcpServers"]["global-srv"]["_disabled"], true);
    }

    // -- scan_project_config tests --

    #[test]
    fn scan_project_config_empty_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let result = ClaudeRepoAdapter::scan_project_config(tmp.path()).unwrap();
        assert!(!result.has_claude_md);
        assert_eq!(result.claude_md_count, 0);
        assert_eq!(result.agent_count, 0);
        assert_eq!(result.skill_count, 0);
        assert_eq!(result.hook_count, 0);
        assert_eq!(result.mcp_server_count, 0);
        assert!(!result.has_settings);
        assert!(!result.has_memory);
        assert_eq!(result.memory_store_count, 0);
    }

    #[test]
    fn scan_project_config_detects_root_claude_md() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("CLAUDE.md"), "# Instructions").unwrap();
        let result = ClaudeRepoAdapter::scan_project_config(tmp.path()).unwrap();
        assert!(result.has_claude_md);
        assert_eq!(result.claude_md_count, 1);
    }

    #[test]
    fn scan_project_config_detects_inner_claude_md() {
        let tmp = tempfile::tempdir().unwrap();
        let claude_dir = tmp.path().join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        fs::write(claude_dir.join("CLAUDE.md"), "# Inner instructions").unwrap();
        let result = ClaudeRepoAdapter::scan_project_config(tmp.path()).unwrap();
        assert!(result.has_claude_md);
        assert_eq!(result.claude_md_count, 1);
    }

    #[test]
    fn scan_project_config_counts_nested_claude_md() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("CLAUDE.md"), "# Root").unwrap();
        let fe_dir = tmp.path().join("frontend");
        fs::create_dir_all(&fe_dir).unwrap();
        fs::write(fe_dir.join("CLAUDE.md"), "# Frontend").unwrap();
        let be_dir = tmp.path().join("be");
        fs::create_dir_all(&be_dir).unwrap();
        fs::write(be_dir.join("CLAUDE.md"), "# Backend").unwrap();
        let result = ClaudeRepoAdapter::scan_project_config(tmp.path()).unwrap();
        assert!(result.has_claude_md);
        assert_eq!(result.claude_md_count, 3);
    }

    #[test]
    fn scan_project_config_counts_agents() {
        let tmp = tempfile::tempdir().unwrap();
        let agents_dir = tmp.path().join(".claude/agents");
        fs::create_dir_all(&agents_dir).unwrap();
        fs::write(agents_dir.join("reviewer.md"), "---\nname: Reviewer\n---\nReview code.").unwrap();
        fs::write(agents_dir.join("writer.md"), "---\nname: Writer\n---\nWrite code.").unwrap();
        // Non-.md files should not be counted
        fs::write(agents_dir.join("notes.txt"), "not an agent").unwrap();
        let result = ClaudeRepoAdapter::scan_project_config(tmp.path()).unwrap();
        assert_eq!(result.agent_count, 2);
    }

    #[test]
    fn scan_project_config_counts_skills() {
        let tmp = tempfile::tempdir().unwrap();
        let skills_dir = tmp.path().join(".claude/skills");
        let skill1 = skills_dir.join("lint");
        let skill2 = skills_dir.join("test-skill");
        let empty_dir = skills_dir.join("empty");
        fs::create_dir_all(&skill1).unwrap();
        fs::create_dir_all(&skill2).unwrap();
        fs::create_dir_all(&empty_dir).unwrap();
        fs::write(skill1.join("SKILL.md"), "---\nname: Lint\n---\nRun linter.").unwrap();
        fs::write(skill2.join("SKILL.md"), "---\nname: Test\n---\nRun tests.").unwrap();
        // empty_dir has no SKILL.md, should not be counted
        let result = ClaudeRepoAdapter::scan_project_config(tmp.path()).unwrap();
        assert_eq!(result.skill_count, 2);
    }

    #[test]
    fn scan_project_config_counts_hooks() {
        let tmp = tempfile::tempdir().unwrap();
        let claude_dir = tmp.path().join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        let settings = serde_json::json!({
            "hooks": {
                "PreToolUse": [
                    {
                        "matcher": "Bash",
                        "hooks": [
                            {"type": "command", "command": "echo pre"},
                            {"type": "command", "command": "echo pre2"}
                        ]
                    }
                ],
                "PostToolUse": [
                    {
                        "hooks": [
                            {"type": "command", "command": "echo post"}
                        ]
                    }
                ]
            }
        });
        fs::write(claude_dir.join("settings.json"), serde_json::to_string(&settings).unwrap()).unwrap();
        let result = ClaudeRepoAdapter::scan_project_config(tmp.path()).unwrap();
        assert_eq!(result.hook_count, 3);
        assert!(result.has_settings);
    }

    #[test]
    fn scan_project_config_counts_mcp_servers() {
        let tmp = tempfile::tempdir().unwrap();
        let mcp = serde_json::json!({
            "mcpServers": {
                "filesystem": {"type": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem"]},
                "github": {"type": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"]}
            }
        });
        fs::write(tmp.path().join(".mcp.json"), serde_json::to_string(&mcp).unwrap()).unwrap();
        let result = ClaudeRepoAdapter::scan_project_config(tmp.path()).unwrap();
        assert_eq!(result.mcp_server_count, 2);
    }

    #[test]
    fn scan_project_config_counts_memory_stores() {
        let tmp = tempfile::tempdir().unwrap();
        let memory_dir = tmp.path().join(".claude/memory");
        fs::create_dir_all(&memory_dir).unwrap();
        fs::write(memory_dir.join("user-preferences.md"), "- Prefers dark mode\n- Uses vim").unwrap();
        fs::write(memory_dir.join("project-notes.md"), "- Uses React").unwrap();
        // Non-.md files should not be counted
        fs::write(memory_dir.join("scratch.txt"), "not a store").unwrap();
        let result = ClaudeRepoAdapter::scan_project_config(tmp.path()).unwrap();
        assert!(result.has_memory);
        assert_eq!(result.memory_store_count, 2);
    }

    #[test]
    fn scan_project_config_full_project() {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path();

        // Set up a fully configured project
        fs::write(base.join("CLAUDE.md"), "# Project").unwrap();
        let claude_dir = base.join(".claude");
        fs::create_dir_all(claude_dir.join("agents")).unwrap();
        fs::create_dir_all(claude_dir.join("skills/deploy")).unwrap();
        fs::create_dir_all(claude_dir.join("memory")).unwrap();
        fs::write(claude_dir.join("agents/helper.md"), "---\nname: Helper\n---\nHelp.").unwrap();
        fs::write(claude_dir.join("skills/deploy/SKILL.md"), "---\nname: Deploy\n---\nDeploy.").unwrap();
        fs::write(claude_dir.join("memory/notes.md"), "- Note 1").unwrap();
        let settings = serde_json::json!({
            "model": "claude-sonnet-4-6",
            "hooks": {
                "PreToolUse": [{"hooks": [{"type": "command", "command": "echo hi"}]}]
            }
        });
        fs::write(claude_dir.join("settings.json"), serde_json::to_string(&settings).unwrap()).unwrap();
        let mcp = serde_json::json!({"mcpServers": {"fs": {"type": "stdio", "command": "npx"}}});
        fs::write(base.join(".mcp.json"), serde_json::to_string(&mcp).unwrap()).unwrap();

        let result = ClaudeRepoAdapter::scan_project_config(base).unwrap();
        assert!(result.has_claude_md);
        assert_eq!(result.claude_md_count, 1);
        assert_eq!(result.agent_count, 1);
        assert_eq!(result.skill_count, 1);
        assert_eq!(result.hook_count, 1);
        assert_eq!(result.mcp_server_count, 1);
        assert!(result.has_settings);
        assert!(result.has_memory);
        assert_eq!(result.memory_store_count, 1);
    }

    #[test]
    fn scan_project_config_serializes_camel_case() {
        let result = ProjectScanResult {
            has_claude_md: true,
            claude_md_count: 2,
            agent_count: 3,
            skill_count: 1,
            hook_count: 4,
            mcp_server_count: 2,
            has_settings: true,
            has_memory: true,
            memory_store_count: 1,
        };
        let json = serde_json::to_value(&result).unwrap();
        assert!(json.get("hasClaudeMd").is_some());
        assert!(json.get("claudeMdCount").is_some());
        assert!(json.get("agentCount").is_some());
        assert!(json.get("skillCount").is_some());
        assert!(json.get("hookCount").is_some());
        assert!(json.get("mcpServerCount").is_some());
        assert!(json.get("hasSettings").is_some());
        assert!(json.get("hasMemory").is_some());
        assert!(json.get("memoryStoreCount").is_some());
        // Verify no snake_case keys
        assert!(json.get("has_claude_md").is_none());
    }

    // -- config bundle (backup/restore) tests --

    #[test]
    fn export_config_bundle_empty_repo() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        let bytes = ClaudeRepoAdapter::export_config_bundle(path, false).unwrap();
        let bundle: ConfigBundle = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(bundle.version, "1.0");
        assert_eq!(bundle.scope, "project");
        assert!(bundle.agents.is_empty());
        assert!(bundle.skills.is_empty());
        assert!(bundle.hooks.is_empty());
        assert_eq!(bundle.mcp_servers, serde_json::json!({}));
        assert_eq!(bundle.settings, serde_json::json!({}));
    }

    #[test]
    fn export_config_bundle_with_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let agent = Agent {
            agent_id: "reviewer".to_string(),
            name: "Code Reviewer".to_string(),
            description: "Reviews code".to_string(),
            system_prompt: "Review this code.".to_string(),
            tools: vec!["Read".to_string()],
            model_override: None,
            memory: None,
        };
        ClaudeRepoAdapter::write_agent(path, &agent).unwrap();

        let skill = Skill {
            skill_id: "test-skill".to_string(),
            name: "Test Skill".to_string(),
            description: Some("A test skill".to_string()),
            user_invocable: Some(true),
            allowed_tools: vec!["Bash".to_string()],
            model: None,
            disable_model_invocation: None,
            context: None,
            agent: None,
            argument_hint: None,
            content: "Do the thing.".to_string(),
        };
        ClaudeRepoAdapter::write_skill(path, &skill).unwrap();

        let config = NormalizedConfig {
            model: Some("claude-sonnet-4-6".to_string()),
            permissions: None,
            ignore_patterns: None,
            raw: serde_json::json!({"model": "claude-sonnet-4-6"}),
        };
        ClaudeRepoAdapter::write_config(path, &config).unwrap();

        let bytes = ClaudeRepoAdapter::export_config_bundle(path, false).unwrap();
        let bundle: ConfigBundle = serde_json::from_slice(&bytes).unwrap();

        assert_eq!(bundle.agents.len(), 1);
        assert_eq!(bundle.skills.len(), 1);
        assert_eq!(bundle.settings["model"], "claude-sonnet-4-6");
    }

    #[test]
    fn export_config_bundle_global_scope() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        let bytes = ClaudeRepoAdapter::export_config_bundle(path, true).unwrap();
        let bundle: ConfigBundle = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(bundle.scope, "global");
    }

    #[test]
    fn import_config_bundle_merge_mode_skips_existing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let existing_agent = Agent {
            agent_id: "reviewer".to_string(),
            name: "Existing Reviewer".to_string(),
            description: "Original".to_string(),
            system_prompt: "Original prompt.".to_string(),
            tools: vec![],
            model_override: None,
            memory: None,
        };
        ClaudeRepoAdapter::write_agent(path, &existing_agent).unwrap();

        let bundle = ConfigBundle {
            version: "1.0".to_string(),
            created_at: "2026-03-01T00:00:00Z".to_string(),
            scope: "project".to_string(),
            agents: vec![
                serde_json::to_value(&Agent {
                    agent_id: "reviewer".to_string(),
                    name: "New Reviewer".to_string(),
                    description: "Should be skipped".to_string(),
                    system_prompt: "New prompt.".to_string(),
                    tools: vec![],
                    model_override: None,
                    memory: None,
                })
                .unwrap(),
                serde_json::to_value(&Agent {
                    agent_id: "writer".to_string(),
                    name: "Writer".to_string(),
                    description: "New agent".to_string(),
                    system_prompt: "Write stuff.".to_string(),
                    tools: vec![],
                    model_override: None,
                    memory: None,
                })
                .unwrap(),
            ],
            skills: vec![],
            hooks: vec![],
            mcp_servers: serde_json::json!({}),
            settings: serde_json::json!({}),
        };

        let bundle_bytes = serde_json::to_vec(&bundle).unwrap();
        let result =
            ClaudeRepoAdapter::import_config_bundle(path, false, &bundle_bytes, "merge").unwrap();

        assert_eq!(result.agents_imported, 1);
        let agents = ClaudeRepoAdapter::read_agents(path).unwrap();
        assert_eq!(agents.len(), 2);

        let reviewer = agents.iter().find(|a| a.agent_id == "reviewer").unwrap();
        assert_eq!(reviewer.name, "Existing Reviewer");
    }

    #[test]
    fn import_config_bundle_overwrite_mode_replaces_existing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let existing_agent = Agent {
            agent_id: "reviewer".to_string(),
            name: "Old Reviewer".to_string(),
            description: "Old".to_string(),
            system_prompt: "Old prompt.".to_string(),
            tools: vec![],
            model_override: None,
            memory: None,
        };
        ClaudeRepoAdapter::write_agent(path, &existing_agent).unwrap();

        let bundle = ConfigBundle {
            version: "1.0".to_string(),
            created_at: "2026-03-01T00:00:00Z".to_string(),
            scope: "project".to_string(),
            agents: vec![serde_json::to_value(&Agent {
                agent_id: "reviewer".to_string(),
                name: "New Reviewer".to_string(),
                description: "Replaced".to_string(),
                system_prompt: "New prompt.".to_string(),
                tools: vec![],
                model_override: None,
                memory: None,
            })
            .unwrap()],
            skills: vec![],
            hooks: vec![],
            mcp_servers: serde_json::json!({}),
            settings: serde_json::json!({}),
        };

        let bundle_bytes = serde_json::to_vec(&bundle).unwrap();
        let result = ClaudeRepoAdapter::import_config_bundle(
            path,
            false,
            &bundle_bytes,
            "overwrite",
        )
        .unwrap();

        assert_eq!(result.agents_imported, 1);
        let agents = ClaudeRepoAdapter::read_agents(path).unwrap();
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].name, "New Reviewer");
    }

    #[test]
    fn export_import_roundtrip() {
        let src = tempfile::tempdir().unwrap();
        let src_path = src.path().to_str().unwrap();

        let agent = Agent {
            agent_id: "helper".to_string(),
            name: "Helper".to_string(),
            description: "Helps".to_string(),
            system_prompt: "Help me.".to_string(),
            tools: vec!["Read".to_string()],
            model_override: None,
            memory: None,
        };
        ClaudeRepoAdapter::write_agent(src_path, &agent).unwrap();

        let config = NormalizedConfig {
            model: Some("claude-sonnet-4-6".to_string()),
            permissions: None,
            ignore_patterns: None,
            raw: serde_json::json!({"model": "claude-sonnet-4-6"}),
        };
        ClaudeRepoAdapter::write_config(src_path, &config).unwrap();

        let exported = ClaudeRepoAdapter::export_config_bundle(src_path, false).unwrap();

        let dst = tempfile::tempdir().unwrap();
        let dst_path = dst.path().to_str().unwrap();

        let result =
            ClaudeRepoAdapter::import_config_bundle(dst_path, false, &exported, "merge").unwrap();
        assert_eq!(result.agents_imported, 1);
        assert!(result.settings_imported);

        let agents = ClaudeRepoAdapter::read_agents(dst_path).unwrap();
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].agent_id, "helper");

        let cfg = ClaudeRepoAdapter::read_config(dst_path).unwrap();
        assert_eq!(cfg.model, Some("claude-sonnet-4-6".to_string()));
    }

    #[test]
    fn import_config_bundle_with_hooks_and_mcp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let bundle = ConfigBundle {
            version: "1.0".to_string(),
            created_at: "2026-03-01T00:00:00Z".to_string(),
            scope: "project".to_string(),
            agents: vec![],
            skills: vec![],
            hooks: vec![serde_json::to_value(&HookEvent {
                event: "PreToolUse".to_string(),
                groups: vec![HookGroup {
                    matcher: Some("Bash".to_string()),
                    hooks: vec![HookHandler {
                        hook_type: "command".to_string(),
                        command: Some("echo hook".to_string()),
                        prompt: None,
                        timeout: None,
                    }],
                    disabled: None,
                }],
            })
            .unwrap()],
            mcp_servers: serde_json::json!({
                "my-mcp": {
                    "serverId": "my-mcp",
                    "type": "stdio",
                    "command": "npx",
                    "args": ["-y", "@test/server"]
                }
            }),
            settings: serde_json::json!({}),
        };

        let bundle_bytes = serde_json::to_vec(&bundle).unwrap();
        let result =
            ClaudeRepoAdapter::import_config_bundle(path, false, &bundle_bytes, "merge").unwrap();

        assert_eq!(result.hooks_imported, 1);
        assert_eq!(result.mcp_servers_imported, 1);

        let hooks = ClaudeRepoAdapter::read_hooks(path).unwrap();
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].event, "PreToolUse");

        let servers = ClaudeRepoAdapter::read_mcp_servers(path, false).unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].server_id, "my-mcp");
    }

    // -- lint_config tests --

    #[test]
    fn lint_empty_project_reports_missing_claudemd_and_no_model() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result.issues.iter().any(|i| i.rule == "missing-claude-md"));
        assert!(result.issues.iter().any(|i| i.rule == "no-model-configured"));
        assert!(result.issues.iter().any(|i| i.rule == "no-ignore-patterns"));
    }

    #[test]
    fn lint_perfect_project_scores_high() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        // Create CLAUDE.md
        std::fs::write(dir.path().join("CLAUDE.md"), "# Project\n\nBe helpful.").unwrap();

        // Create settings with model and ignore patterns
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(
            claude_dir.join("settings.json"),
            r#"{"model":"claude-sonnet-4-6","ignorePatterns":["node_modules","dist"]}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        // No errors expected
        assert_eq!(result.error_count, 0);
        assert!(result.score >= 80);
    }

    #[test]
    fn lint_agent_short_prompt_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        // Create a minimal agent with short prompt
        let agents_dir = dir.path().join(".claude/agents");
        std::fs::create_dir_all(&agents_dir).unwrap();
        std::fs::write(
            agents_dir.join("bad-agent.md"),
            "---\nname: Bad Agent\ndescription: x\n---\nShort.",
        )
        .unwrap();
        // Create CLAUDE.md to avoid that warning cluttering
        std::fs::write(dir.path().join("CLAUDE.md"), "# Test").unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result.issues.iter().any(|i| i.rule == "agent-short-prompt"));
        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "agent-empty-description"));
    }

    #[test]
    fn lint_agent_unknown_tool_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let agents_dir = dir.path().join(".claude/agents");
        std::fs::create_dir_all(&agents_dir).unwrap();
        std::fs::write(
            agents_dir.join("tool-agent.md"),
            "---\nname: Tool Agent\ndescription: An agent with tools\ntools: Read, FakeTool, Bash\n---\nThis agent does things with tools and more description here.",
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        let unknown_tool_issues: Vec<_> = result
            .issues
            .iter()
            .filter(|i| i.rule == "agent-unknown-tool")
            .collect();
        assert_eq!(unknown_tool_issues.len(), 1);
        assert!(unknown_tool_issues[0].message.contains("FakeTool"));
    }

    #[test]
    fn lint_mcp_placeholder_env_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        std::fs::write(
            dir.path().join(".mcp.json"),
            r#"{"mcpServers":{"test-server":{"type":"stdio","command":"npx","env":{"API_KEY":"<your-key-here>"}}}}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "mcp-placeholder-env"));
    }

    #[test]
    fn lint_mcp_stdio_no_command_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        std::fs::write(
            dir.path().join(".mcp.json"),
            r#"{"mcpServers":{"broken":{"type":"stdio"}}}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "mcp-stdio-no-command"));
    }

    #[test]
    fn lint_hierarchy_agent_shadow_detected() {
        let project_dir = tempfile::tempdir().unwrap();
        let global_dir = tempfile::tempdir().unwrap();
        let pp = project_dir.path().to_str().unwrap();
        let gp = global_dir.path().to_str().unwrap();

        // Create the same agent ID in both scopes
        let p_agents = project_dir.path().join(".claude/agents");
        let g_agents = global_dir.path().join(".claude/agents");
        std::fs::create_dir_all(&p_agents).unwrap();
        std::fs::create_dir_all(&g_agents).unwrap();

        let agent_content = "---\nname: Reviewer\ndescription: Reviews code for quality\n---\nYou are a code reviewer. Review all code for best practices and potential issues.";
        std::fs::write(p_agents.join("reviewer.md"), agent_content).unwrap();
        std::fs::write(g_agents.join("reviewer.md"), agent_content).unwrap();

        let result = ClaudeRepoAdapter::lint_config(pp, Some(gp));

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "hierarchy-agent-shadow"));
    }

    #[test]
    fn lint_hierarchy_mcp_shadow_detected() {
        let project_dir = tempfile::tempdir().unwrap();
        let global_dir = tempfile::tempdir().unwrap();
        let pp = project_dir.path().to_str().unwrap();
        let gp = global_dir.path().to_str().unwrap();

        std::fs::write(
            project_dir.path().join(".mcp.json"),
            r#"{"mcpServers":{"shared-server":{"type":"stdio","command":"npx","args":["project-server"]}}}"#,
        )
        .unwrap();
        std::fs::write(
            global_dir.path().join(".claude.json"),
            r#"{"mcpServers":{"shared-server":{"type":"stdio","command":"npx","args":["global-server"]}}}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(pp, Some(gp));

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "hierarchy-mcp-shadow"));
    }

    #[test]
    fn lint_hierarchy_model_conflict_detected() {
        let project_dir = tempfile::tempdir().unwrap();
        let global_dir = tempfile::tempdir().unwrap();
        let pp = project_dir.path().to_str().unwrap();
        let gp = global_dir.path().to_str().unwrap();

        let p_claude = project_dir.path().join(".claude");
        let g_claude = global_dir.path().join(".claude");
        std::fs::create_dir_all(&p_claude).unwrap();
        std::fs::create_dir_all(&g_claude).unwrap();

        std::fs::write(
            p_claude.join("settings.json"),
            r#"{"model":"claude-opus-4-6"}"#,
        )
        .unwrap();
        std::fs::write(
            g_claude.join("settings.json"),
            r#"{"model":"claude-sonnet-4-6"}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(pp, Some(gp));

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "hierarchy-model-conflict"));
    }

    #[test]
    fn lint_hierarchy_claudemd_overlap_detected() {
        let project_dir = tempfile::tempdir().unwrap();
        let global_dir = tempfile::tempdir().unwrap();
        let pp = project_dir.path().to_str().unwrap();
        let gp = global_dir.path().to_str().unwrap();

        std::fs::write(
            project_dir.path().join("CLAUDE.md"),
            "# Project\nAlways use tabs for indentation.",
        )
        .unwrap();
        std::fs::write(
            global_dir.path().join("CLAUDE.md"),
            "# Global\nUse spaces for indentation.",
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(pp, Some(gp));

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "hierarchy-claudemd-overlap"));
    }

    #[test]
    fn lint_hierarchy_claudemd_contradiction_detected() {
        let project_dir = tempfile::tempdir().unwrap();
        let global_dir = tempfile::tempdir().unwrap();
        let pp = project_dir.path().to_str().unwrap();
        let gp = global_dir.path().to_str().unwrap();

        std::fs::write(
            project_dir.path().join("CLAUDE.md"),
            "# Project\nAlways use tabs for indentation.",
        )
        .unwrap();
        std::fs::write(
            global_dir.path().join("CLAUDE.md"),
            "# Global\nAlways use spaces for indentation.",
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(pp, Some(gp));

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "hierarchy-claudemd-conflict"));
    }

    #[test]
    fn lint_hierarchy_permission_conflict_detected() {
        let project_dir = tempfile::tempdir().unwrap();
        let global_dir = tempfile::tempdir().unwrap();
        let pp = project_dir.path().to_str().unwrap();
        let gp = global_dir.path().to_str().unwrap();

        let p_claude = project_dir.path().join(".claude");
        let g_claude = global_dir.path().join(".claude");
        std::fs::create_dir_all(&p_claude).unwrap();
        std::fs::create_dir_all(&g_claude).unwrap();

        std::fs::write(
            p_claude.join("settings.json"),
            r#"{"permissions":{"allow":["Bash"]}}"#,
        )
        .unwrap();
        std::fs::write(
            g_claude.join("settings.json"),
            r#"{"permissions":{"deny":["Bash"]}}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(pp, Some(gp));

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "hierarchy-permission-conflict"));
    }

    #[test]
    fn lint_settings_unknown_key_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(
            claude_dir.join("settings.json"),
            r#"{"model":"claude-sonnet-4-6","bogusKey":"value"}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "settings-unknown-key"
                && i.message.contains("bogusKey")));
    }

    #[test]
    fn lint_hook_no_timeout_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(
            claude_dir.join("settings.json"),
            r#"{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"echo hi"}]}]}}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result.issues.iter().any(|i| i.rule == "hook-no-timeout"));
    }

    #[test]
    fn lint_hook_empty_command_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(
            claude_dir.join("settings.json"),
            r#"{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":""}]}]}}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result.issues.iter().any(|i| i.rule == "hook-empty-command"));
    }

    #[test]
    fn lint_hook_invalid_matcher_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();
        std::fs::write(
            claude_dir.join("settings.json"),
            r#"{"hooks":{"PreToolUse":[{"matcher":"[invalid","hooks":[{"type":"command","command":"echo","timeout":5000}]}]}}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "hook-invalid-matcher"));
    }

    #[test]
    fn lint_skill_dangling_agent_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let skills_dir = dir.path().join(".claude/skills/my-skill");
        std::fs::create_dir_all(&skills_dir).unwrap();
        std::fs::write(
            skills_dir.join("SKILL.md"),
            "---\nname: My Skill\ndescription: Test\nagent: nonexistent-agent\n---\nThis skill does something with detailed instructions here.",
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "skill-dangling-agent"));
    }

    #[test]
    fn lint_agent_dangling_memory_flagged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        let agents_dir = dir.path().join(".claude/agents");
        std::fs::create_dir_all(&agents_dir).unwrap();

        // Create agent with .meta.json that has memory binding
        std::fs::write(
            agents_dir.join("mem-agent.md"),
            "---\nname: Mem Agent\ndescription: Uses memory for context\nmemory: nonexistent-store\n---\nYou are an agent that uses memory stores for persistent context across sessions.",
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "agent-dangling-memory"));
    }

    #[test]
    fn lint_score_decreases_with_issues() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();

        // Lots of issues: no CLAUDE.md, no model, no ignore, MCP placeholder
        std::fs::write(
            dir.path().join(".mcp.json"),
            r#"{"mcpServers":{"broken":{"type":"stdio","env":{"KEY":"<your-key>"}}}}"#,
        )
        .unwrap();

        let result = ClaudeRepoAdapter::lint_config(path, None);

        assert!(result.score < 80);
        assert!(result.error_count > 0);
    }

    #[test]
    fn lint_hierarchy_hook_duplicate_event_detected() {
        let project_dir = tempfile::tempdir().unwrap();
        let global_dir = tempfile::tempdir().unwrap();
        let pp = project_dir.path().to_str().unwrap();
        let gp = global_dir.path().to_str().unwrap();

        let p_claude = project_dir.path().join(".claude");
        let g_claude = global_dir.path().join(".claude");
        std::fs::create_dir_all(&p_claude).unwrap();
        std::fs::create_dir_all(&g_claude).unwrap();

        let hook_json = r#"{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"echo test","timeout":5000}]}]}}"#;
        std::fs::write(p_claude.join("settings.json"), hook_json).unwrap();
        std::fs::write(g_claude.join("settings.json"), hook_json).unwrap();

        let result = ClaudeRepoAdapter::lint_config(pp, Some(gp));

        assert!(result
            .issues
            .iter()
            .any(|i| i.rule == "hierarchy-hook-duplicate-event"));
    }
}
