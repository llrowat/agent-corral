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

                groups.push(HookGroup {
                    matcher,
                    hooks: handlers,
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

            servers.push(McpServer {
                server_id: server_id.clone(),
                server_type,
                command,
                args,
                url,
                env,
                headers,
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
        };
        let json = serde_json::to_value(&server).unwrap();
        assert!(json.get("serverId").is_some());
        // "type" field uses serde rename
        assert!(json.get("type").is_some());
    }
}
