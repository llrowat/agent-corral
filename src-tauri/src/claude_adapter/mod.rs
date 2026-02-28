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
    "Task",
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

    /// Write an agent to .claude/agents/<agent_id>.md + metadata sidecar
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

        // Write metadata sidecar JSON (tools, model override, memory binding)
        let meta_path = agents_dir.join(format!("{}.meta.json", agent.agent_id));
        let meta = serde_json::json!({
            "tools": agent.tools,
            "modelOverride": agent.model_override,
            "memoryBinding": agent.memory_binding,
        });
        let meta_json = serde_json::to_string_pretty(&meta)?;
        atomic_write(&meta_path, &meta_json)?;

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
        repo_path: &str,
    ) -> Result<Agent, ClaudeAdapterError> {
        let contents = fs::read_to_string(path)?;

        // Extract name from first markdown heading
        let name = contents
            .lines()
            .find(|l| l.starts_with("# "))
            .map(|l| l[2..].trim().to_string())
            .unwrap_or_else(|| agent_id.to_string());

        // Everything after the heading is the system prompt
        let system_prompt = contents
            .lines()
            .skip_while(|l| !l.starts_with("# "))
            .skip(1)
            .collect::<Vec<&str>>()
            .join("\n")
            .trim()
            .to_string();

        // Read metadata sidecar if it exists
        let meta_path = Path::new(repo_path)
            .join(".claude/agents")
            .join(format!("{}.meta.json", agent_id));

        let (tools, model_override, memory_binding) = if meta_path.exists() {
            let meta_str = fs::read_to_string(&meta_path)?;
            let meta: serde_json::Value = serde_json::from_str(&meta_str)?;

            let tools = meta
                .get("tools")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            let model_override = meta
                .get("modelOverride")
                .and_then(|v| v.as_str())
                .map(String::from);

            let memory_binding = meta
                .get("memoryBinding")
                .and_then(|v| v.as_str())
                .map(String::from);

            (tools, model_override, memory_binding)
        } else {
            (vec![], None, None)
        };

        Ok(Agent {
            agent_id: agent_id.to_string(),
            name,
            system_prompt,
            tools,
            model_override,
            memory_binding,
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
