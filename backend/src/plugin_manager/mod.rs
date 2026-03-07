use crate::claude_adapter::{
    atomic_write, Agent, ClaudeRepoAdapter, HookEvent, McpServer, NormalizedConfig, Skill,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PluginError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Plugin not found: {0}")]
    NotFound(String),
    #[error("Invalid plugin: {0}")]
    Invalid(String),
    #[error("Git error: {0}")]
    Git(String),
    #[error("Claude adapter error: {0}")]
    Adapter(String),
}

// -- Plugin types --

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSummary {
    pub plugin_id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: Option<String>,
    pub agent_count: usize,
    pub skill_count: usize,
    pub hook_count: usize,
    pub mcp_count: usize,
    pub has_config: bool,
    pub dir_path: String,
    pub source: PluginSource,
    pub git_source: Option<GitSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PluginSource {
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
pub struct PluginUpdateCheck {
    pub plugin_id: String,
    pub name: String,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub installed_commit: String,
    pub latest_commit: String,
    pub update_available: bool,
    pub dir_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportMode {
    AddOnly,
    Overwrite,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginContents {
    pub manifest: PluginManifest,
    pub agents: Vec<Agent>,
    pub skills: Vec<Skill>,
    pub hooks: Vec<HookEvent>,
    pub mcp_servers: Vec<McpServer>,
    pub config: Option<NormalizedConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginImportPreview {
    pub agents_to_add: Vec<String>,
    pub agents_to_update: Vec<String>,
    pub skills_to_add: Vec<String>,
    pub skills_to_update: Vec<String>,
    pub hooks_to_add: Vec<String>,
    pub mcp_to_add: Vec<String>,
    pub mcp_to_update: Vec<String>,
    pub config_changes: bool,
}

// -- Import sync types --

/// Tracks a single plugin import into a repo for sync purposes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginImportRecord {
    /// Plugin name at time of import
    pub plugin_name: String,
    /// Library directory path the plugin was imported from
    pub plugin_dir: String,
    /// Git source at time of import (None if local plugin)
    pub git_source: Option<GitSource>,
    /// Commit hash of the library plugin at time of import
    pub imported_commit: Option<String>,
    /// When the import happened
    pub imported_at: String,
    /// Import mode used
    pub import_mode: ImportMode,
    /// If true, this import is pinned and won't auto-sync
    pub pinned: bool,
    /// If true, auto-sync is enabled (update repo automatically when plugin updates)
    pub auto_sync: bool,
}

/// Stored in {repo}/.claude/plugin-imports.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginImportRegistry {
    pub imports: Vec<PluginImportRecord>,
}

/// Status of a single plugin import's sync state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSyncStatus {
    pub plugin_name: String,
    pub plugin_dir: String,
    /// Whether the library plugin still exists
    pub plugin_exists: bool,
    /// Commit that was imported into this repo
    pub imported_commit: Option<String>,
    /// Current commit in the library
    pub library_commit: Option<String>,
    /// Whether an update is available (library has newer commit)
    pub update_available: bool,
    /// Whether auto-sync is enabled for this import
    pub auto_sync: bool,
    /// Whether this import is pinned (skip sync)
    pub pinned: bool,
}

pub struct PluginManager {
    plugins_dir: PathBuf,
    library_dir: PathBuf,
}

impl PluginManager {
    pub fn new(plugins_dir: PathBuf, library_dir: PathBuf) -> Self {
        Self {
            plugins_dir,
            library_dir,
        }
    }

    /// Export a plugin from a repo (or global settings) into a plugin directory.
    /// If `export_dir_override` is provided, the plugin is exported there instead of the default plugins dir.
    pub fn export_plugin(
        &self,
        repo_path: &str,
        name: &str,
        description: &str,
        author: Option<&str>,
        version: Option<&str>,
        include_config: bool,
        agent_ids: &[String],
        skill_ids: &[String],
        include_hooks: bool,
        include_mcp: bool,
        is_global: bool,
        export_dir_override: Option<&str>,
    ) -> Result<String, PluginError> {
        let dir_name = name.to_lowercase().replace(' ', "-");
        let base = match export_dir_override {
            Some(d) => {
                let p = PathBuf::from(d);
                fs::create_dir_all(&p)?;
                p
            }
            None => self.plugins_dir.clone(),
        };
        let plugin_dir = base.join(&dir_name);

        // Create plugin directory structure
        let claude_plugin_dir = plugin_dir.join(".claude-plugin");
        fs::create_dir_all(&claude_plugin_dir)?;

        // Write plugin.json manifest
        let manifest = PluginManifest {
            name: name.to_string(),
            description: description.to_string(),
            version: version.unwrap_or("1.0.0").to_string(),
            author: author.map(String::from),
        };
        let manifest_json = serde_json::to_string_pretty(&manifest)?;
        atomic_write(&claude_plugin_dir.join("plugin.json"), &manifest_json)?;

        // Export agents
        let all_agents = ClaudeRepoAdapter::read_agents(repo_path)
            .map_err(|e| PluginError::Adapter(e.to_string()))?;
        let selected_agents: Vec<Agent> = if agent_ids.is_empty() {
            all_agents
        } else {
            all_agents
                .into_iter()
                .filter(|a| agent_ids.contains(&a.agent_id))
                .collect()
        };

        if !selected_agents.is_empty() {
            let agents_dir = plugin_dir.join("agents");
            fs::create_dir_all(&agents_dir)?;
            for agent in &selected_agents {
                // Write agent with YAML frontmatter (same format as ClaudeRepoAdapter::write_agent)
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
                let yaml_str = serde_yaml::to_string(&yaml_val)
                    .map_err(|e| PluginError::Adapter(e.to_string()))?;

                let mut content = String::new();
                content.push_str("---\n");
                content.push_str(&yaml_str);
                content.push_str("---\n\n");
                content.push_str(&agent.system_prompt);
                if !agent.system_prompt.ends_with('\n') {
                    content.push('\n');
                }

                atomic_write(&agents_dir.join(format!("{}.md", agent.agent_id)), &content)?;
            }
        }

        // Export skills
        let all_skills = ClaudeRepoAdapter::read_skills(repo_path)
            .map_err(|e| PluginError::Adapter(e.to_string()))?;
        let selected_skills: Vec<Skill> = if skill_ids.is_empty() {
            all_skills
        } else {
            all_skills
                .into_iter()
                .filter(|s| skill_ids.contains(&s.skill_id))
                .collect()
        };

        if !selected_skills.is_empty() {
            let skills_dir = plugin_dir.join("skills");
            fs::create_dir_all(&skills_dir)?;
            for skill in &selected_skills {
                let skill_subdir = skills_dir.join(&skill.skill_id);
                fs::create_dir_all(&skill_subdir)?;
                // Re-use adapter's write logic by writing directly
                ClaudeRepoAdapter::write_skill(&plugin_dir.to_string_lossy(), skill)
                    .map_err(|e| PluginError::Adapter(e.to_string()))?;
                // Move from .claude/skills to skills/
                let src = plugin_dir.join(".claude/skills").join(&skill.skill_id);
                let dst = skills_dir.join(&skill.skill_id);
                if src.exists() && src != dst {
                    if dst.exists() {
                        fs::remove_dir_all(&dst)?;
                    }
                    fs::rename(&src, &dst)?;
                }
            }
            // Clean up .claude/skills if empty
            let claude_skills = plugin_dir.join(".claude/skills");
            if claude_skills.exists() {
                let _ = fs::remove_dir_all(&claude_skills);
            }
            let claude_dir = plugin_dir.join(".claude");
            if claude_dir.exists() && fs::read_dir(&claude_dir)?.next().is_none() {
                let _ = fs::remove_dir(&claude_dir);
            }
        }

        // Export hooks
        if include_hooks {
            let hooks = ClaudeRepoAdapter::read_hooks(repo_path)
                .map_err(|e| PluginError::Adapter(e.to_string()))?;
            if !hooks.is_empty() {
                let hooks_dir = plugin_dir.join("hooks");
                fs::create_dir_all(&hooks_dir)?;
                let hooks_json =
                    serde_json::to_string_pretty(&serde_json::json!({ "hooks": hooks }))?;
                atomic_write(&hooks_dir.join("hooks.json"), &hooks_json)?;
            }
        }

        // Export MCP
        if include_mcp {
            let mcp_servers = ClaudeRepoAdapter::read_mcp_servers(repo_path, is_global)
                .map_err(|e| PluginError::Adapter(e.to_string()))?;
            if !mcp_servers.is_empty() {
                let mut servers_obj = serde_json::Map::new();
                for server in &mcp_servers {
                    let mut obj = serde_json::Map::new();
                    obj.insert(
                        "type".to_string(),
                        serde_json::Value::String(server.server_type.clone()),
                    );
                    if let Some(ref cmd) = server.command {
                        obj.insert(
                            "command".to_string(),
                            serde_json::Value::String(cmd.clone()),
                        );
                    }
                    if let Some(ref args) = server.args {
                        obj.insert(
                            "args".to_string(),
                            serde_json::Value::Array(
                                args.iter()
                                    .map(|a| serde_json::Value::String(a.clone()))
                                    .collect(),
                            ),
                        );
                    }
                    if let Some(ref url) = server.url {
                        obj.insert("url".to_string(), serde_json::Value::String(url.clone()));
                    }
                    if let Some(ref env) = server.env {
                        obj.insert("env".to_string(), env.clone());
                    }
                    if let Some(ref headers) = server.headers {
                        obj.insert("headers".to_string(), headers.clone());
                    }
                    servers_obj.insert(server.server_id.clone(), serde_json::Value::Object(obj));
                }
                let mcp_json = serde_json::to_string_pretty(
                    &serde_json::json!({ "mcpServers": servers_obj }),
                )?;
                atomic_write(&plugin_dir.join(".mcp.json"), &mcp_json)?;
            }
        }

        // Export config
        if include_config {
            let config = ClaudeRepoAdapter::read_config(repo_path)
                .map_err(|e| PluginError::Adapter(e.to_string()))?;
            let config_json = serde_json::to_string_pretty(&config.raw)?;
            atomic_write(&plugin_dir.join("settings.json"), &config_json)?;
        }

        Ok(plugin_dir.to_string_lossy().to_string())
    }

    /// Read a plugin's full contents from its directory
    pub fn read_plugin(&self, plugin_dir: &str) -> Result<PluginContents, PluginError> {
        let dir = Path::new(plugin_dir);
        let manifest = self.read_manifest(dir)?;

        // Read agents from agents/ subdirectory
        let agents_dir = dir.join("agents");
        let agents = if agents_dir.exists() {
            self.read_plugin_agents(&agents_dir)?
        } else {
            vec![]
        };

        // Read skills from skills/ subdirectory
        let skills_dir = dir.join("skills");
        let skills = if skills_dir.exists() {
            self.read_plugin_skills(&skills_dir)?
        } else {
            vec![]
        };

        // Read hooks from hooks/hooks.json
        let hooks_file = dir.join("hooks/hooks.json");
        let hooks = if hooks_file.exists() {
            let contents = fs::read_to_string(&hooks_file)?;
            let val: serde_json::Value = serde_json::from_str(&contents)?;
            if let Some(hooks_val) = val.get("hooks") {
                serde_json::from_value(hooks_val.clone()).unwrap_or_default()
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        // Read MCP from .mcp.json
        let mcp_file = dir.join(".mcp.json");
        let mcp_servers = if mcp_file.exists() {
            let contents = fs::read_to_string(&mcp_file)?;
            let val: serde_json::Value = serde_json::from_str(&contents)?;
            if let Some(servers) = val.get("mcpServers").and_then(|v| v.as_object()) {
                servers
                    .iter()
                    .map(|(id, sv)| McpServer {
                        server_id: id.clone(),
                        server_type: sv
                            .get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("stdio")
                            .to_string(),
                        command: sv.get("command").and_then(|v| v.as_str()).map(String::from),
                        args: sv.get("args").and_then(|v| {
                            v.as_array().map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_str().map(String::from))
                                    .collect()
                            })
                        }),
                        url: sv.get("url").and_then(|v| v.as_str()).map(String::from),
                        env: sv.get("env").cloned(),
                        headers: sv.get("headers").cloned(),
                        disabled: sv.get("_disabled").and_then(|v| v.as_bool()),
                    })
                    .collect()
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        // Read config from settings.json
        let settings_file = dir.join("settings.json");
        let config = if settings_file.exists() {
            let contents = fs::read_to_string(&settings_file)?;
            let raw: serde_json::Value = serde_json::from_str(&contents)?;
            Some(NormalizedConfig {
                model: raw.get("model").and_then(|v| v.as_str()).map(String::from),
                permissions: raw.get("permissions").cloned(),
                ignore_patterns: raw.get("ignorePatterns").and_then(|v| {
                    v.as_array().map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                }),
                raw,
            })
        } else {
            None
        };

        Ok(PluginContents {
            manifest,
            agents,
            skills,
            hooks,
            mcp_servers,
            config,
        })
    }

    /// Preview what importing a plugin would do
    pub fn preview_import(
        &self,
        plugin_dir: &str,
        repo_path: &str,
        is_global: bool,
    ) -> Result<PluginImportPreview, PluginError> {
        let contents = self.read_plugin(plugin_dir)?;

        let existing_agents = ClaudeRepoAdapter::read_agents(repo_path)
            .map_err(|e| PluginError::Adapter(e.to_string()))?;
        let existing_agent_ids: Vec<String> =
            existing_agents.iter().map(|a| a.agent_id.clone()).collect();

        let existing_skills = ClaudeRepoAdapter::read_skills(repo_path)
            .map_err(|e| PluginError::Adapter(e.to_string()))?;
        let existing_skill_ids: Vec<String> =
            existing_skills.iter().map(|s| s.skill_id.clone()).collect();

        let existing_mcp = ClaudeRepoAdapter::read_mcp_servers(repo_path, is_global)
            .map_err(|e| PluginError::Adapter(e.to_string()))?;
        let existing_mcp_ids: Vec<String> =
            existing_mcp.iter().map(|m| m.server_id.clone()).collect();

        let mut agents_to_add = Vec::new();
        let mut agents_to_update = Vec::new();
        for agent in &contents.agents {
            if existing_agent_ids.contains(&agent.agent_id) {
                agents_to_update.push(agent.agent_id.clone());
            } else {
                agents_to_add.push(agent.agent_id.clone());
            }
        }

        let mut skills_to_add = Vec::new();
        let mut skills_to_update = Vec::new();
        for skill in &contents.skills {
            if existing_skill_ids.contains(&skill.skill_id) {
                skills_to_update.push(skill.skill_id.clone());
            } else {
                skills_to_add.push(skill.skill_id.clone());
            }
        }

        let hooks_to_add: Vec<String> = contents.hooks.iter().map(|h| h.event.clone()).collect();

        let mut mcp_to_add = Vec::new();
        let mut mcp_to_update = Vec::new();
        for server in &contents.mcp_servers {
            if existing_mcp_ids.contains(&server.server_id) {
                mcp_to_update.push(server.server_id.clone());
            } else {
                mcp_to_add.push(server.server_id.clone());
            }
        }

        Ok(PluginImportPreview {
            agents_to_add,
            agents_to_update,
            skills_to_add,
            skills_to_update,
            hooks_to_add,
            mcp_to_add,
            mcp_to_update,
            config_changes: contents.config.is_some(),
        })
    }

    /// Import a plugin into a repo or global scope
    pub fn import_plugin(
        &self,
        plugin_dir: &str,
        repo_path: &str,
        mode: ImportMode,
        is_global: bool,
    ) -> Result<(), PluginError> {
        let contents = self.read_plugin(plugin_dir)?;

        let existing_agents = ClaudeRepoAdapter::read_agents(repo_path)
            .map_err(|e| PluginError::Adapter(e.to_string()))?;
        let existing_agent_ids: Vec<String> =
            existing_agents.iter().map(|a| a.agent_id.clone()).collect();

        let existing_skills = ClaudeRepoAdapter::read_skills(repo_path)
            .map_err(|e| PluginError::Adapter(e.to_string()))?;
        let existing_skill_ids: Vec<String> =
            existing_skills.iter().map(|s| s.skill_id.clone()).collect();

        // Import agents
        for agent in &contents.agents {
            let exists = existing_agent_ids.contains(&agent.agent_id);
            match mode {
                ImportMode::AddOnly => {
                    if !exists {
                        ClaudeRepoAdapter::write_agent(repo_path, agent)
                            .map_err(|e| PluginError::Adapter(e.to_string()))?;
                    }
                }
                ImportMode::Overwrite => {
                    ClaudeRepoAdapter::write_agent(repo_path, agent)
                        .map_err(|e| PluginError::Adapter(e.to_string()))?;
                }
            }
        }

        // Import skills
        for skill in &contents.skills {
            let exists = existing_skill_ids.contains(&skill.skill_id);
            match mode {
                ImportMode::AddOnly => {
                    if !exists {
                        ClaudeRepoAdapter::write_skill(repo_path, skill)
                            .map_err(|e| PluginError::Adapter(e.to_string()))?;
                    }
                }
                ImportMode::Overwrite => {
                    ClaudeRepoAdapter::write_skill(repo_path, skill)
                        .map_err(|e| PluginError::Adapter(e.to_string()))?;
                }
            }
        }

        // Import hooks (merge with existing)
        if !contents.hooks.is_empty() {
            let mut existing_hooks = ClaudeRepoAdapter::read_hooks(repo_path)
                .map_err(|e| PluginError::Adapter(e.to_string()))?;
            for hook in &contents.hooks {
                // Replace event if it already exists, otherwise add
                existing_hooks.retain(|h| h.event != hook.event);
                existing_hooks.push(hook.clone());
            }
            ClaudeRepoAdapter::write_hooks(repo_path, &existing_hooks)
                .map_err(|e| PluginError::Adapter(e.to_string()))?;
        }

        // Import MCP servers
        for server in &contents.mcp_servers {
            ClaudeRepoAdapter::write_mcp_server(repo_path, server, is_global)
                .map_err(|e| PluginError::Adapter(e.to_string()))?;
        }

        // Import config
        if let Some(ref config) = contents.config {
            ClaudeRepoAdapter::write_config(repo_path, config)
                .map_err(|e| PluginError::Adapter(e.to_string()))?;
        }

        // Record import lineage for sync tracking
        self.record_import(repo_path, plugin_dir, &mode)?;

        Ok(())
    }

    /// List all plugins
    pub fn list_plugins(&self) -> Result<Vec<PluginSummary>, PluginError> {
        let mut plugins = Vec::new();

        // Scan local plugins directory
        plugins.extend(self.scan_plugin_directory(&self.plugins_dir, PluginSource::Local)?);

        // Scan library directory
        if self.library_dir.exists() {
            plugins.extend(self.scan_plugin_directory(&self.library_dir, PluginSource::Library)?);
        }

        Ok(plugins)
    }

    /// Delete a plugin directory
    pub fn delete_plugin(&self, plugin_dir: &str) -> Result<(), PluginError> {
        let dir = Path::new(plugin_dir);
        if !dir.exists() {
            return Err(PluginError::NotFound(plugin_dir.to_string()));
        }
        fs::remove_dir_all(dir)?;
        Ok(())
    }

    /// Install plugin(s) from a git repository
    pub fn install_from_git(
        &self,
        repo_url: &str,
        branch: Option<&str>,
    ) -> Result<Vec<PluginSummary>, PluginError> {
        let temp_dir = self.plugins_dir.join(".git-tmp");
        if temp_dir.exists() {
            fs::remove_dir_all(&temp_dir)?;
        }

        let mut cmd = Command::new("git");
        cmd.arg("clone").arg("--depth").arg("1");
        if let Some(b) = branch {
            cmd.arg("--branch").arg(b);
        }
        cmd.arg(repo_url).arg(&temp_dir);

        let output = cmd
            .output()
            .map_err(|e| PluginError::Git(format!("Failed to run git: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(PluginError::Git(format!("git clone failed: {}", stderr)));
        }

        let commit_output = Command::new("git")
            .arg("-C")
            .arg(&temp_dir)
            .arg("rev-parse")
            .arg("HEAD")
            .output()
            .map_err(|e| PluginError::Git(format!("Failed to get commit hash: {}", e)))?;

        let commit_hash = String::from_utf8_lossy(&commit_output.stdout)
            .trim()
            .to_string();

        // Scan for .claude-plugin/plugin.json directories
        let mut installed = Vec::new();
        self.find_and_install_plugins(
            &temp_dir,
            repo_url,
            branch,
            &commit_hash,
            &mut installed,
            0,
        )?;

        // Also check if the root itself is a plugin
        let root_manifest = temp_dir.join(".claude-plugin/plugin.json");
        if root_manifest.exists() {
            match self.install_plugin_dir(&temp_dir, repo_url, branch, &commit_hash) {
                Ok(summary) => installed.push(summary),
                Err(e) => {
                    eprintln!("Warning: failed to install root plugin: {}", e);
                }
            }
        }

        let _ = fs::remove_dir_all(&temp_dir);

        if installed.is_empty() {
            return Err(PluginError::Invalid(
                "No plugins found in the repository (no .claude-plugin/plugin.json found)"
                    .to_string(),
            ));
        }

        Ok(installed)
    }

    /// Check all git-sourced plugins for updates
    pub fn check_updates(&self) -> Result<Vec<PluginUpdateCheck>, PluginError> {
        let plugins = self.list_plugins()?;
        let mut updates = Vec::new();

        for plugin in plugins {
            if let Some(ref git_source) = plugin.git_source {
                match self.check_single_update(&plugin, git_source) {
                    Ok(check) => updates.push(check),
                    Err(e) => {
                        eprintln!(
                            "Warning: failed to check updates for {}: {}",
                            plugin.name, e
                        );
                    }
                }
            }
        }

        Ok(updates)
    }

    /// Update a git-sourced plugin
    pub fn update_plugin(&self, plugin_dir: &str) -> Result<PluginSummary, PluginError> {
        let dir = Path::new(plugin_dir);
        let source_path = dir.join(".claude-plugin/source.json");

        if !source_path.exists() {
            return Err(PluginError::Invalid(
                "Plugin has no git source metadata".to_string(),
            ));
        }

        let source_json = fs::read_to_string(&source_path)?;
        let git_source: GitSource = serde_json::from_str(&source_json)?;

        let temp_dir = self.plugins_dir.join(".git-update-tmp");
        if temp_dir.exists() {
            fs::remove_dir_all(&temp_dir)?;
        }

        let mut cmd = Command::new("git");
        cmd.arg("clone").arg("--depth").arg("1");
        if let Some(ref b) = git_source.branch {
            cmd.arg("--branch").arg(b);
        }
        cmd.arg(&git_source.repo_url).arg(&temp_dir);

        let output = cmd
            .output()
            .map_err(|e| PluginError::Git(format!("Failed to run git: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(PluginError::Git(format!("git clone failed: {}", stderr)));
        }

        let commit_output = Command::new("git")
            .arg("-C")
            .arg(&temp_dir)
            .arg("rev-parse")
            .arg("HEAD")
            .output()
            .map_err(|e| PluginError::Git(format!("Failed to get commit hash: {}", e)))?;

        let new_commit = String::from_utf8_lossy(&commit_output.stdout)
            .trim()
            .to_string();

        // Find the plugin in the cloned repo by matching the name
        let existing_manifest = self.read_manifest(dir)?;
        let mut found_dir: Option<PathBuf> = None;

        // Check root
        let root_manifest_path = temp_dir.join(".claude-plugin/plugin.json");
        if root_manifest_path.exists() {
            if let Ok(m) = self.read_manifest(&temp_dir) {
                if m.name == existing_manifest.name {
                    found_dir = Some(temp_dir.clone());
                }
            }
        }

        // Check subdirectories
        if found_dir.is_none() {
            self.find_plugin_by_name(&temp_dir, &existing_manifest.name, &mut found_dir, 0)?;
        }

        let source_plugin_dir = found_dir.ok_or_else(|| {
            let _ = fs::remove_dir_all(&temp_dir);
            PluginError::NotFound(format!(
                "Plugin '{}' no longer exists in the repository",
                existing_manifest.name
            ))
        })?;

        // Replace the contents of the installed plugin dir
        // Remove existing contents except .claude-plugin/source.json
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if name == ".claude-plugin" {
                // Only remove plugin.json, keep source.json
                let pj = path.join("plugin.json");
                if pj.exists() {
                    fs::remove_file(pj)?;
                }
            } else {
                if path.is_dir() {
                    fs::remove_dir_all(&path)?;
                } else {
                    fs::remove_file(&path)?;
                }
            }
        }

        // Copy new contents
        self.copy_dir_contents(&source_plugin_dir, dir)?;

        // Update source.json
        let new_source = GitSource {
            repo_url: git_source.repo_url.clone(),
            branch: git_source.branch.clone(),
            installed_commit: new_commit,
            installed_at: chrono::Utc::now().to_rfc3339(),
        };
        let source_json = serde_json::to_string_pretty(&new_source)?;
        atomic_write(&source_path, &source_json)?;

        let _ = fs::remove_dir_all(&temp_dir);

        // Return updated summary
        self.read_plugin_summary(dir, PluginSource::Git)
    }

    /// Migrate a legacy .agentpack file to plugin directory format
    pub fn migrate_agentpack(&self, agentpack_path: &str) -> Result<String, PluginError> {
        let path = Path::new(agentpack_path);
        if !path.exists() {
            return Err(PluginError::NotFound(agentpack_path.to_string()));
        }

        let json = fs::read_to_string(path)?;
        let raw: serde_json::Value = serde_json::from_str(&json)?;

        let manifest = raw
            .get("manifest")
            .ok_or_else(|| PluginError::Invalid("Missing manifest in agentpack".to_string()))?;

        let name = manifest
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("migrated-plugin");
        let description = manifest
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let version = manifest
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("1.0.0");
        let author = manifest.get("author").and_then(|v| v.as_str());

        let dir_name = name.to_lowercase().replace(' ', "-");
        let plugin_dir = self.plugins_dir.join(&dir_name);
        let claude_plugin_dir = plugin_dir.join(".claude-plugin");
        fs::create_dir_all(&claude_plugin_dir)?;

        // Write plugin.json
        let plugin_manifest = PluginManifest {
            name: name.to_string(),
            description: description.to_string(),
            version: version.to_string(),
            author: author.map(String::from),
        };
        let manifest_json = serde_json::to_string_pretty(&plugin_manifest)?;
        atomic_write(&claude_plugin_dir.join("plugin.json"), &manifest_json)?;

        // Migrate agents
        if let Some(agents) = raw.get("agents").and_then(|v| v.as_array()) {
            if !agents.is_empty() {
                let agents_dir = plugin_dir.join("agents");
                fs::create_dir_all(&agents_dir)?;
                for agent_val in agents {
                    if let Ok(agent) = serde_json::from_value::<Agent>(agent_val.clone()) {
                        // Write agent with YAML frontmatter
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
                        let yaml_str = serde_yaml::to_string(&yaml_val)
                            .map_err(|e| PluginError::Adapter(e.to_string()))?;

                        let mut content = String::new();
                        content.push_str("---\n");
                        content.push_str(&yaml_str);
                        content.push_str("---\n\n");
                        content.push_str(&agent.system_prompt);
                        if !agent.system_prompt.ends_with('\n') {
                            content.push('\n');
                        }

                        atomic_write(&agents_dir.join(format!("{}.md", agent.agent_id)), &content)?;
                    }
                }
            }
        }

        // Migrate config
        if let Some(config) = raw.get("config") {
            if !config.is_null() {
                if let Some(raw_config) = config.get("raw") {
                    let config_json = serde_json::to_string_pretty(raw_config)?;
                    atomic_write(&plugin_dir.join("settings.json"), &config_json)?;
                }
            }
        }

        // Migrate git source if there's a sidecar
        let source_path = path.with_extension("source.json");
        if source_path.exists() {
            let source_json = fs::read_to_string(&source_path)?;
            atomic_write(&claude_plugin_dir.join("source.json"), &source_json)?;
        }

        Ok(plugin_dir.to_string_lossy().to_string())
    }

    // -- Import sync --

    /// Read the import registry for a repo (from {repo}/.claude/plugin-imports.json)
    pub fn read_import_registry(&self, repo_path: &str) -> Result<PluginImportRegistry, PluginError> {
        let path = Path::new(repo_path).join(".claude/plugin-imports.json");
        if !path.exists() {
            return Ok(PluginImportRegistry::default());
        }
        let json = fs::read_to_string(&path)?;
        let registry: PluginImportRegistry = serde_json::from_str(&json)?;
        Ok(registry)
    }

    /// Write the import registry for a repo
    fn write_import_registry(
        &self,
        repo_path: &str,
        registry: &PluginImportRegistry,
    ) -> Result<(), PluginError> {
        let claude_dir = Path::new(repo_path).join(".claude");
        fs::create_dir_all(&claude_dir)?;
        let json = serde_json::to_string_pretty(registry)?;
        atomic_write(&claude_dir.join("plugin-imports.json"), &json)?;
        Ok(())
    }

    /// Record an import in the repo's import registry.
    /// Called internally by import_plugin.
    fn record_import(
        &self,
        repo_path: &str,
        plugin_dir: &str,
        mode: &ImportMode,
    ) -> Result<(), PluginError> {
        let dir = Path::new(plugin_dir);
        let manifest = self.read_manifest(dir)?;

        // Read git source if available
        let source_path = dir.join(".claude-plugin/source.json");
        let git_source = if source_path.exists() {
            let source_json = fs::read_to_string(&source_path)?;
            serde_json::from_str::<GitSource>(&source_json).ok()
        } else {
            None
        };

        let imported_commit = git_source.as_ref().map(|gs| gs.installed_commit.clone());

        let mut registry = self.read_import_registry(repo_path)?;

        // Update existing record or add new one
        if let Some(existing) = registry
            .imports
            .iter_mut()
            .find(|r| r.plugin_name == manifest.name)
        {
            existing.plugin_dir = plugin_dir.to_string();
            existing.git_source = git_source;
            existing.imported_commit = imported_commit;
            existing.imported_at = chrono::Utc::now().to_rfc3339();
            existing.import_mode = mode.clone();
            // Preserve pinned and auto_sync settings from previous import
        } else {
            registry.imports.push(PluginImportRecord {
                plugin_name: manifest.name,
                plugin_dir: plugin_dir.to_string(),
                git_source,
                imported_commit,
                imported_at: chrono::Utc::now().to_rfc3339(),
                import_mode: mode.clone(),
                pinned: false,
                auto_sync: true, // Default to auto-sync enabled
            });
        }

        self.write_import_registry(repo_path, &registry)?;
        Ok(())
    }

    /// Get sync status for all plugin imports in a repo
    pub fn get_import_sync_status(
        &self,
        repo_path: &str,
    ) -> Result<Vec<PluginSyncStatus>, PluginError> {
        let registry = self.read_import_registry(repo_path)?;
        let mut statuses = Vec::new();

        for record in &registry.imports {
            let plugin_dir = Path::new(&record.plugin_dir);
            let plugin_exists = plugin_dir.exists();

            let library_commit = if plugin_exists {
                let source_path = plugin_dir.join(".claude-plugin/source.json");
                if source_path.exists() {
                    fs::read_to_string(&source_path)
                        .ok()
                        .and_then(|json| serde_json::from_str::<GitSource>(&json).ok())
                        .map(|gs| gs.installed_commit)
                } else {
                    None
                }
            } else {
                None
            };

            let update_available = match (&record.imported_commit, &library_commit) {
                (Some(imported), Some(library)) => imported != library,
                _ => false,
            };

            statuses.push(PluginSyncStatus {
                plugin_name: record.plugin_name.clone(),
                plugin_dir: record.plugin_dir.clone(),
                plugin_exists,
                imported_commit: record.imported_commit.clone(),
                library_commit,
                update_available,
                auto_sync: record.auto_sync,
                pinned: record.pinned,
            });
        }

        Ok(statuses)
    }

    /// Sync a single imported plugin: re-import it from the library using Overwrite mode.
    /// Returns the updated sync status.
    pub fn sync_imported_plugin(
        &self,
        repo_path: &str,
        plugin_name: &str,
    ) -> Result<PluginSyncStatus, PluginError> {
        let registry = self.read_import_registry(repo_path)?;
        let record = registry
            .imports
            .iter()
            .find(|r| r.plugin_name == plugin_name)
            .ok_or_else(|| {
                PluginError::NotFound(format!("No import record for plugin '{}'", plugin_name))
            })?;

        if record.pinned {
            return Err(PluginError::Invalid(format!(
                "Plugin '{}' is pinned and cannot be synced",
                plugin_name
            )));
        }

        let plugin_dir = record.plugin_dir.clone();

        if !Path::new(&plugin_dir).exists() {
            return Err(PluginError::NotFound(format!(
                "Library plugin directory no longer exists: {}",
                plugin_dir
            )));
        }

        // Re-import with Overwrite mode (sync is always project scope)
        self.import_plugin(&plugin_dir, repo_path, ImportMode::Overwrite, false)?;

        // Return fresh sync status for this plugin
        let statuses = self.get_import_sync_status(repo_path)?;
        statuses
            .into_iter()
            .find(|s| s.plugin_name == plugin_name)
            .ok_or_else(|| {
                PluginError::NotFound(format!(
                    "Sync status not found after sync for '{}'",
                    plugin_name
                ))
            })
    }

    /// Run auto-sync for all imported plugins in a repo that have auto_sync enabled.
    /// Returns list of plugin names that were synced.
    pub fn auto_sync_repo(
        &self,
        repo_path: &str,
    ) -> Result<Vec<String>, PluginError> {
        let statuses = self.get_import_sync_status(repo_path)?;
        let mut synced = Vec::new();

        for status in &statuses {
            if status.auto_sync && !status.pinned && status.update_available && status.plugin_exists
            {
                match self.sync_imported_plugin(repo_path, &status.plugin_name) {
                    Ok(_) => synced.push(status.plugin_name.clone()),
                    Err(e) => {
                        eprintln!(
                            "Warning: auto-sync failed for '{}': {}",
                            status.plugin_name, e
                        );
                    }
                }
            }
        }

        Ok(synced)
    }

    /// Set the pinned flag for an imported plugin
    pub fn set_import_pinned(
        &self,
        repo_path: &str,
        plugin_name: &str,
        pinned: bool,
    ) -> Result<(), PluginError> {
        let mut registry = self.read_import_registry(repo_path)?;
        let record = registry
            .imports
            .iter_mut()
            .find(|r| r.plugin_name == plugin_name)
            .ok_or_else(|| {
                PluginError::NotFound(format!("No import record for plugin '{}'", plugin_name))
            })?;
        record.pinned = pinned;
        self.write_import_registry(repo_path, &registry)?;
        Ok(())
    }

    /// Set the auto_sync flag for an imported plugin
    pub fn set_import_auto_sync(
        &self,
        repo_path: &str,
        plugin_name: &str,
        auto_sync: bool,
    ) -> Result<(), PluginError> {
        let mut registry = self.read_import_registry(repo_path)?;
        let record = registry
            .imports
            .iter_mut()
            .find(|r| r.plugin_name == plugin_name)
            .ok_or_else(|| {
                PluginError::NotFound(format!("No import record for plugin '{}'", plugin_name))
            })?;
        record.auto_sync = auto_sync;
        self.write_import_registry(repo_path, &registry)?;
        Ok(())
    }

    /// Remove an import record (e.g., if user wants to unlink)
    pub fn remove_import_record(
        &self,
        repo_path: &str,
        plugin_name: &str,
    ) -> Result<(), PluginError> {
        let mut registry = self.read_import_registry(repo_path)?;
        let before = registry.imports.len();
        registry.imports.retain(|r| r.plugin_name != plugin_name);
        if registry.imports.len() == before {
            return Err(PluginError::NotFound(format!(
                "No import record for plugin '{}'",
                plugin_name
            )));
        }
        self.write_import_registry(repo_path, &registry)?;
        Ok(())
    }

    /// Check for updates on all git-sourced plugins and auto-update the library copies.
    /// Returns the list of plugins that were updated in the library.
    pub fn auto_update_library(&self) -> Result<Vec<String>, PluginError> {
        let updates = self.check_updates()?;
        let mut updated = Vec::new();

        for check in &updates {
            if check.update_available {
                match self.update_plugin(&check.dir_path) {
                    Ok(summary) => updated.push(summary.name),
                    Err(e) => {
                        eprintln!(
                            "Warning: auto-update failed for '{}': {}",
                            check.name, e
                        );
                    }
                }
            }
        }

        Ok(updated)
    }

    pub fn plugins_dir(&self) -> &Path {
        &self.plugins_dir
    }

    pub fn library_dir(&self) -> &Path {
        &self.library_dir
    }

    /// Read agents from all plugin source directories associated with a repo's imports.
    /// Returns agents marked with source and read_only flags.
    pub fn read_plugin_source_agents(&self, repo_path: &str) -> Result<Vec<Agent>, PluginError> {
        let registry = self.read_import_registry(repo_path)?;
        let mut all_agents = Vec::new();

        for record in &registry.imports {
            let plugin_dir = Path::new(&record.plugin_dir);
            if !plugin_dir.exists() {
                continue;
            }
            let agents_dir = plugin_dir.join("agents");
            if agents_dir.exists() {
                if let Ok(mut agents) = self.read_plugin_agents(&agents_dir) {
                    let source_label = format!("plugin:{}", record.plugin_name);
                    for agent in &mut agents {
                        agent.source = Some(source_label.clone());
                        agent.read_only = Some(true);
                    }
                    all_agents.extend(agents);
                }
            }
        }

        all_agents.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(all_agents)
    }

    /// Read skills from all plugin source directories associated with a repo's imports.
    /// Returns skills marked with source and read_only flags.
    pub fn read_plugin_source_skills(&self, repo_path: &str) -> Result<Vec<Skill>, PluginError> {
        let registry = self.read_import_registry(repo_path)?;
        let mut all_skills = Vec::new();

        for record in &registry.imports {
            let plugin_dir = Path::new(&record.plugin_dir);
            if !plugin_dir.exists() {
                continue;
            }
            let skills_dir = plugin_dir.join("skills");
            if skills_dir.exists() {
                if let Ok(mut skills) = self.read_plugin_skills(&skills_dir) {
                    let source_label = format!("plugin:{}", record.plugin_name);
                    for skill in &mut skills {
                        skill.source = Some(source_label.clone());
                        skill.read_only = Some(true);
                    }
                    all_skills.extend(skills);
                }
            }
        }

        all_skills.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(all_skills)
    }

    // -- Private helpers --

    fn read_manifest(&self, plugin_dir: &Path) -> Result<PluginManifest, PluginError> {
        let manifest_path = plugin_dir.join(".claude-plugin/plugin.json");
        if !manifest_path.exists() {
            return Err(PluginError::NotFound(format!(
                "No plugin.json in {}",
                plugin_dir.display()
            )));
        }
        let json = fs::read_to_string(&manifest_path)?;
        let manifest: PluginManifest = serde_json::from_str(&json)?;
        Ok(manifest)
    }

    fn read_plugin_agents(&self, agents_dir: &Path) -> Result<Vec<Agent>, PluginError> {
        let mut agents = Vec::new();
        for entry in fs::read_dir(agents_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "md") {
                let agent_id = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let contents = fs::read_to_string(&path)?;

                // Parse YAML frontmatter (between --- delimiters)
                let (frontmatter, body) = if contents.starts_with("---") {
                    let after_first = &contents[3..];
                    if let Some(end_idx) = after_first.find("\n---") {
                        let yaml_str = &after_first[..end_idx];
                        let body_start = end_idx + 4;
                        let body = after_first[body_start..].trim_start_matches('\n').to_string();
                        let fm: serde_json::Value = serde_yaml::from_str(yaml_str)
                            .map_err(|e| PluginError::Adapter(e.to_string()))?;
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
                    .unwrap_or(&agent_id)
                    .to_string();

                let description = frontmatter
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

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

                let color = frontmatter
                    .get("color")
                    .and_then(|v| v.as_str())
                    .map(String::from);

                agents.push(Agent {
                    agent_id,
                    name,
                    description,
                    system_prompt: body,
                    tools,
                    model_override,
                    memory,
                    color,
                    source: None,
                    read_only: None,
                });
            }
        }
        agents.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(agents)
    }

    fn read_plugin_skills(&self, skills_dir: &Path) -> Result<Vec<Skill>, PluginError> {
        let mut skills = Vec::new();
        for entry in fs::read_dir(skills_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let skill_md = path.join("SKILL.md");
                if skill_md.exists() {
                    let skill_id = path
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    // Read the skill using a temporary adapter path
                    let contents = fs::read_to_string(&skill_md)?;
                    let skill = parse_skill_contents(&contents, &skill_id);
                    skills.push(skill);
                }
            }
        }
        skills.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(skills)
    }

    fn scan_plugin_directory(
        &self,
        dir: &Path,
        default_source: PluginSource,
    ) -> Result<Vec<PluginSummary>, PluginError> {
        let mut plugins = Vec::new();
        if !dir.exists() {
            return Ok(plugins);
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let manifest_path = path.join(".claude-plugin/plugin.json");
                if manifest_path.exists() {
                    match self.read_plugin_summary(&path, default_source.clone()) {
                        Ok(summary) => plugins.push(summary),
                        Err(_) => continue,
                    }
                }
            }
        }

        Ok(plugins)
    }

    fn read_plugin_summary(
        &self,
        dir: &Path,
        default_source: PluginSource,
    ) -> Result<PluginSummary, PluginError> {
        let manifest = self.read_manifest(dir)?;

        let plugin_id = dir
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| manifest.name.to_lowercase().replace(' ', "-"));

        // Count components
        let agents_dir = dir.join("agents");
        let agent_count = if agents_dir.exists() {
            fs::read_dir(&agents_dir)?
                .filter(|e| {
                    e.as_ref()
                        .map(|e| e.path().extension().map_or(false, |ext| ext == "md"))
                        .unwrap_or(false)
                })
                .count()
        } else {
            0
        };

        let skills_dir = dir.join("skills");
        let skill_count = if skills_dir.exists() {
            fs::read_dir(&skills_dir)?
                .filter(|e| e.as_ref().map(|e| e.path().is_dir()).unwrap_or(false))
                .count()
        } else {
            0
        };

        let hooks_file = dir.join("hooks/hooks.json");
        let hook_count = if hooks_file.exists() {
            fs::read_to_string(&hooks_file)
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| v.get("hooks").and_then(|h| h.as_array()).map(|a| a.len()))
                .unwrap_or(0)
        } else {
            0
        };

        let mcp_file = dir.join(".mcp.json");
        let mcp_count = if mcp_file.exists() {
            fs::read_to_string(&mcp_file)
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| {
                    v.get("mcpServers")
                        .and_then(|m| m.as_object())
                        .map(|o| o.len())
                })
                .unwrap_or(0)
        } else {
            0
        };

        let has_config = dir.join("settings.json").exists();

        // Check for git source
        let source_path = dir.join(".claude-plugin/source.json");
        let (source, git_source) = if source_path.exists() {
            let source_json = fs::read_to_string(&source_path)?;
            match serde_json::from_str::<GitSource>(&source_json) {
                Ok(gs) => (PluginSource::Git, Some(gs)),
                Err(_) => (default_source, None),
            }
        } else {
            (default_source, None)
        };

        Ok(PluginSummary {
            plugin_id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            agent_count,
            skill_count,
            hook_count,
            mcp_count,
            has_config,
            dir_path: dir.to_string_lossy().to_string(),
            source,
            git_source,
        })
    }

    fn check_single_update(
        &self,
        plugin: &PluginSummary,
        git_source: &GitSource,
    ) -> Result<PluginUpdateCheck, PluginError> {
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
            .map_err(|e| PluginError::Git(format!("Failed to run git ls-remote: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(PluginError::Git(format!(
                "git ls-remote failed: {}",
                stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let latest_commit = stdout.split_whitespace().next().unwrap_or("").to_string();

        if latest_commit.is_empty() {
            return Err(PluginError::Git(
                "Could not determine remote commit".to_string(),
            ));
        }

        let update_available = latest_commit != git_source.installed_commit;

        Ok(PluginUpdateCheck {
            plugin_id: plugin.plugin_id.clone(),
            name: plugin.name.clone(),
            current_version: plugin.version.clone(),
            latest_version: None,
            installed_commit: git_source.installed_commit.clone(),
            latest_commit,
            update_available,
            dir_path: plugin.dir_path.clone(),
        })
    }

    fn install_plugin_dir(
        &self,
        source_dir: &Path,
        repo_url: &str,
        branch: Option<&str>,
        commit_hash: &str,
    ) -> Result<PluginSummary, PluginError> {
        let manifest = self.read_manifest(source_dir)?;
        let dir_name = manifest.name.to_lowercase().replace(' ', "-");
        let dest_dir = self.library_dir.join(&dir_name);

        if dest_dir.exists() {
            fs::remove_dir_all(&dest_dir)?;
        }
        self.copy_dir_contents(source_dir, &dest_dir)?;

        // Remove .git directory if it was copied
        let git_dir = dest_dir.join(".git");
        if git_dir.exists() {
            let _ = fs::remove_dir_all(&git_dir);
        }

        // Write git source metadata
        let git_source = GitSource {
            repo_url: repo_url.to_string(),
            branch: branch.map(String::from),
            installed_commit: commit_hash.to_string(),
            installed_at: chrono::Utc::now().to_rfc3339(),
        };
        let claude_plugin_dir = dest_dir.join(".claude-plugin");
        fs::create_dir_all(&claude_plugin_dir)?;
        let source_json = serde_json::to_string_pretty(&git_source)?;
        atomic_write(&claude_plugin_dir.join("source.json"), &source_json)?;

        self.read_plugin_summary(&dest_dir, PluginSource::Git)
    }

    fn find_and_install_plugins(
        &self,
        dir: &Path,
        repo_url: &str,
        branch: Option<&str>,
        commit_hash: &str,
        installed: &mut Vec<PluginSummary>,
        depth: usize,
    ) -> Result<(), PluginError> {
        if depth > 2 {
            return Ok(());
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir()
                && path
                    .file_name()
                    .map_or(true, |n| !n.to_string_lossy().starts_with('.'))
            {
                let manifest_path = path.join(".claude-plugin/plugin.json");
                if manifest_path.exists() {
                    match self.install_plugin_dir(&path, repo_url, branch, commit_hash) {
                        Ok(summary) => installed.push(summary),
                        Err(e) => {
                            eprintln!(
                                "Warning: failed to install plugin from {}: {}",
                                path.display(),
                                e
                            );
                        }
                    }
                } else {
                    self.find_and_install_plugins(
                        &path,
                        repo_url,
                        branch,
                        commit_hash,
                        installed,
                        depth + 1,
                    )?;
                }
            }
        }

        Ok(())
    }

    fn find_plugin_by_name(
        &self,
        dir: &Path,
        name: &str,
        result: &mut Option<PathBuf>,
        depth: usize,
    ) -> Result<(), PluginError> {
        if result.is_some() || depth > 2 {
            return Ok(());
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir()
                && path
                    .file_name()
                    .map_or(true, |n| !n.to_string_lossy().starts_with('.'))
            {
                let manifest_path = path.join(".claude-plugin/plugin.json");
                if manifest_path.exists() {
                    if let Ok(m) = self.read_manifest(&path) {
                        if m.name == name {
                            *result = Some(path);
                            return Ok(());
                        }
                    }
                }
                self.find_plugin_by_name(&path, name, result, depth + 1)?;
            }
        }

        Ok(())
    }

    fn copy_dir_contents(&self, src: &Path, dst: &Path) -> Result<(), PluginError> {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let src_path = entry.path();
            let file_name = src_path
                .file_name()
                .ok_or_else(|| PluginError::Invalid("Invalid path".to_string()))?;

            // Skip .git directory
            if file_name == ".git" {
                continue;
            }

            let dst_path = dst.join(file_name);
            if src_path.is_dir() {
                self.copy_dir_contents(&src_path, &dst_path)?;
            } else {
                let contents = fs::read_to_string(&src_path)?;
                atomic_write(&dst_path, &contents)?;
            }
        }
        Ok(())
    }
}

/// Parse skill contents from a SKILL.md file (standalone, no adapter needed)
fn parse_skill_contents(contents: &str, skill_id: &str) -> Skill {
    let (frontmatter, body) = if contents.starts_with("---") {
        let after_first = &contents[3..];
        if let Some(end_idx) = after_first.find("\n---") {
            let yaml_str = &after_first[..end_idx];
            let body_start = end_idx + 4;
            let body = after_first[body_start..]
                .trim_start_matches('\n')
                .to_string();
            match serde_yaml::from_str::<serde_json::Value>(yaml_str) {
                Ok(fm) => (fm, body),
                Err(_) => (serde_json::json!({}), contents.to_string()),
            }
        } else {
            (serde_json::json!({}), contents.to_string())
        }
    } else {
        (serde_json::json!({}), contents.to_string())
    };

    Skill {
        skill_id: skill_id.to_string(),
        name: frontmatter
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(skill_id)
            .to_string(),
        description: frontmatter
            .get("description")
            .and_then(|v| v.as_str())
            .map(String::from),
        user_invocable: frontmatter.get("user_invocable").and_then(|v| v.as_bool()),
        allowed_tools: frontmatter
            .get("allowed_tools")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        model: frontmatter
            .get("model")
            .and_then(|v| v.as_str())
            .map(String::from),
        disable_model_invocation: frontmatter
            .get("disable_model_invocation")
            .and_then(|v| v.as_bool()),
        context: frontmatter
            .get("context")
            .and_then(|v| v.as_str())
            .map(String::from),
        agent: frontmatter
            .get("agent")
            .and_then(|v| v.as_str())
            .map(String::from),
        argument_hint: frontmatter
            .get("argument_hint")
            .and_then(|v| v.as_str())
            .map(String::from),
        content: body,
        source: None,
        read_only: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_manager() -> (tempfile::TempDir, PluginManager) {
        let tmp = tempfile::tempdir().unwrap();
        let plugins_dir = tmp.path().join("plugins");
        let library_dir = tmp.path().join("library");
        fs::create_dir_all(&plugins_dir).unwrap();
        fs::create_dir_all(&library_dir).unwrap();
        (tmp, PluginManager::new(plugins_dir, library_dir))
    }

    fn create_test_plugin(dir: &Path, name: &str) {
        let claude_dir = dir.join(".claude-plugin");
        fs::create_dir_all(&claude_dir).unwrap();
        let manifest = PluginManifest {
            name: name.to_string(),
            description: "Test plugin".to_string(),
            version: "1.0.0".to_string(),
            author: None,
        };
        let json = serde_json::to_string_pretty(&manifest).unwrap();
        atomic_write(&claude_dir.join("plugin.json"), &json).unwrap();
    }

    fn create_test_plugin_with_git(dir: &Path, name: &str, commit: &str) {
        create_test_plugin(dir, name);
        let gs = GitSource {
            repo_url: "https://github.com/test/repo.git".to_string(),
            branch: Some("main".to_string()),
            installed_commit: commit.to_string(),
            installed_at: chrono::Utc::now().to_rfc3339(),
        };
        let json = serde_json::to_string_pretty(&gs).unwrap();
        atomic_write(&dir.join(".claude-plugin/source.json"), &json).unwrap();
    }

    fn create_test_repo(tmp: &Path) -> PathBuf {
        let repo = tmp.join("test-repo");
        fs::create_dir_all(repo.join(".claude")).unwrap();
        repo
    }

    #[test]
    fn read_import_registry_returns_empty_when_no_file() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let registry = mgr.read_import_registry(&repo.to_string_lossy()).unwrap();
        assert!(registry.imports.is_empty());
    }

    #[test]
    fn record_import_creates_registry_file() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("test-plugin");
        create_test_plugin(&plugin_dir, "test-plugin");

        mgr.record_import(
            &repo.to_string_lossy(),
            &plugin_dir.to_string_lossy(),
            &ImportMode::Overwrite,
        )
        .unwrap();

        let registry_path = repo.join(".claude/plugin-imports.json");
        assert!(registry_path.exists());

        let registry = mgr
            .read_import_registry(&repo.to_string_lossy())
            .unwrap();
        assert_eq!(registry.imports.len(), 1);
        assert_eq!(registry.imports[0].plugin_name, "test-plugin");
        assert!(registry.imports[0].auto_sync);
        assert!(!registry.imports[0].pinned);
    }

    #[test]
    fn record_import_with_git_source_tracks_commit() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("git-plugin");
        create_test_plugin_with_git(&plugin_dir, "git-plugin", "abc1234");

        mgr.record_import(
            &repo.to_string_lossy(),
            &plugin_dir.to_string_lossy(),
            &ImportMode::Overwrite,
        )
        .unwrap();

        let registry = mgr
            .read_import_registry(&repo.to_string_lossy())
            .unwrap();
        assert_eq!(registry.imports[0].imported_commit.as_deref(), Some("abc1234"));
        assert!(registry.imports[0].git_source.is_some());
    }

    #[test]
    fn record_import_replaces_existing_for_same_plugin() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("my-plugin");
        create_test_plugin(&plugin_dir, "my-plugin");

        // First import
        mgr.record_import(
            &repo.to_string_lossy(),
            &plugin_dir.to_string_lossy(),
            &ImportMode::AddOnly,
        )
        .unwrap();

        // Second import (should update, not duplicate)
        mgr.record_import(
            &repo.to_string_lossy(),
            &plugin_dir.to_string_lossy(),
            &ImportMode::Overwrite,
        )
        .unwrap();

        let registry = mgr
            .read_import_registry(&repo.to_string_lossy())
            .unwrap();
        assert_eq!(registry.imports.len(), 1);
    }

    #[test]
    fn record_import_preserves_pinned_on_reimport() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("pinned-plugin");
        create_test_plugin(&plugin_dir, "pinned-plugin");
        let repo_path = repo.to_string_lossy().to_string();

        // Import and pin
        mgr.record_import(&repo_path, &plugin_dir.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();
        mgr.set_import_pinned(&repo_path, "pinned-plugin", true)
            .unwrap();

        // Re-import
        mgr.record_import(&repo_path, &plugin_dir.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();

        let registry = mgr.read_import_registry(&repo_path).unwrap();
        assert!(registry.imports[0].pinned);
    }

    #[test]
    fn get_import_sync_status_empty_repo() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let statuses = mgr
            .get_import_sync_status(&repo.to_string_lossy())
            .unwrap();
        assert!(statuses.is_empty());
    }

    #[test]
    fn get_import_sync_status_detects_update() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("sync-test");
        create_test_plugin_with_git(&plugin_dir, "sync-test", "commit_v1");
        let repo_path = repo.to_string_lossy().to_string();

        // Record import at commit_v1
        mgr.record_import(&repo_path, &plugin_dir.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();

        // Simulate library plugin being updated to commit_v2
        let gs = GitSource {
            repo_url: "https://github.com/test/repo.git".to_string(),
            branch: Some("main".to_string()),
            installed_commit: "commit_v2".to_string(),
            installed_at: chrono::Utc::now().to_rfc3339(),
        };
        let gs_json = serde_json::to_string_pretty(&gs).unwrap();
        atomic_write(&plugin_dir.join(".claude-plugin/source.json"), &gs_json).unwrap();

        let statuses = mgr.get_import_sync_status(&repo_path).unwrap();
        assert_eq!(statuses.len(), 1);
        assert!(statuses[0].update_available);
        assert_eq!(statuses[0].imported_commit.as_deref(), Some("commit_v1"));
        assert_eq!(statuses[0].library_commit.as_deref(), Some("commit_v2"));
    }

    #[test]
    fn get_import_sync_status_no_update_when_same_commit() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("same-commit");
        create_test_plugin_with_git(&plugin_dir, "same-commit", "abc123");
        let repo_path = repo.to_string_lossy().to_string();

        mgr.record_import(&repo_path, &plugin_dir.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();

        let statuses = mgr.get_import_sync_status(&repo_path).unwrap();
        assert_eq!(statuses.len(), 1);
        assert!(!statuses[0].update_available);
    }

    #[test]
    fn get_import_sync_status_handles_deleted_plugin() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("will-delete");
        create_test_plugin(&plugin_dir, "will-delete");
        let repo_path = repo.to_string_lossy().to_string();

        mgr.record_import(&repo_path, &plugin_dir.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();

        // Delete the plugin
        fs::remove_dir_all(&plugin_dir).unwrap();

        let statuses = mgr.get_import_sync_status(&repo_path).unwrap();
        assert_eq!(statuses.len(), 1);
        assert!(!statuses[0].plugin_exists);
        assert!(!statuses[0].update_available);
    }

    #[test]
    fn set_import_pinned_works() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("pin-test");
        create_test_plugin(&plugin_dir, "pin-test");
        let repo_path = repo.to_string_lossy().to_string();

        mgr.record_import(&repo_path, &plugin_dir.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();

        mgr.set_import_pinned(&repo_path, "pin-test", true).unwrap();

        let registry = mgr.read_import_registry(&repo_path).unwrap();
        assert!(registry.imports[0].pinned);

        mgr.set_import_pinned(&repo_path, "pin-test", false).unwrap();

        let registry = mgr.read_import_registry(&repo_path).unwrap();
        assert!(!registry.imports[0].pinned);
    }

    #[test]
    fn set_import_pinned_fails_for_unknown_plugin() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let result = mgr.set_import_pinned(&repo.to_string_lossy(), "nonexistent", true);
        assert!(result.is_err());
    }

    #[test]
    fn set_import_auto_sync_works() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("autosync-test");
        create_test_plugin(&plugin_dir, "autosync-test");
        let repo_path = repo.to_string_lossy().to_string();

        mgr.record_import(&repo_path, &plugin_dir.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();

        // Default is auto_sync=true
        let registry = mgr.read_import_registry(&repo_path).unwrap();
        assert!(registry.imports[0].auto_sync);

        // Disable
        mgr.set_import_auto_sync(&repo_path, "autosync-test", false).unwrap();
        let registry = mgr.read_import_registry(&repo_path).unwrap();
        assert!(!registry.imports[0].auto_sync);
    }

    #[test]
    fn remove_import_record_works() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("remove-test");
        create_test_plugin(&plugin_dir, "remove-test");
        let repo_path = repo.to_string_lossy().to_string();

        mgr.record_import(&repo_path, &plugin_dir.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();

        mgr.remove_import_record(&repo_path, "remove-test").unwrap();

        let registry = mgr.read_import_registry(&repo_path).unwrap();
        assert!(registry.imports.is_empty());
    }

    #[test]
    fn remove_import_record_fails_for_unknown_plugin() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let result = mgr.remove_import_record(&repo.to_string_lossy(), "nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn import_registry_handles_corrupt_json() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let registry_path = repo.join(".claude/plugin-imports.json");
        fs::write(&registry_path, "not valid json!!!").unwrap();

        let result = mgr.read_import_registry(&repo.to_string_lossy());
        // Should return an error, not panic
        assert!(result.is_err());
    }

    #[test]
    fn multiple_plugins_tracked_independently() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let repo_path = repo.to_string_lossy().to_string();

        let plugin1 = mgr.library_dir().join("plugin-a");
        create_test_plugin_with_git(&plugin1, "plugin-a", "aaa111");

        let plugin2 = mgr.library_dir().join("plugin-b");
        create_test_plugin_with_git(&plugin2, "plugin-b", "bbb222");

        mgr.record_import(&repo_path, &plugin1.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();
        mgr.record_import(&repo_path, &plugin2.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();

        let registry = mgr.read_import_registry(&repo_path).unwrap();
        assert_eq!(registry.imports.len(), 2);

        // Pin only plugin-a
        mgr.set_import_pinned(&repo_path, "plugin-a", true).unwrap();

        let registry = mgr.read_import_registry(&repo_path).unwrap();
        let a = registry.imports.iter().find(|r| r.plugin_name == "plugin-a").unwrap();
        let b = registry.imports.iter().find(|r| r.plugin_name == "plugin-b").unwrap();
        assert!(a.pinned);
        assert!(!b.pinned);
    }

    #[test]
    fn export_plugin_from_project_scope() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let repo_path = repo.to_string_lossy().to_string();

        // Create an agent in the repo
        let agents_dir = repo.join(".claude/agents");
        fs::create_dir_all(&agents_dir).unwrap();
        let agent_content = "---\nname: Test Agent\ndescription: A test\n---\n\nYou are a test agent.\n";
        fs::write(agents_dir.join("test-agent.md"), agent_content).unwrap();

        // Create a project-level MCP file
        let mcp_json = r#"{"mcpServers":{"my-server":{"type":"stdio","command":"node","args":["server.js"]}}}"#;
        fs::write(repo.join(".mcp.json"), mcp_json).unwrap();

        let result = mgr.export_plugin(
            &repo_path,
            "Project Export",
            "Exported from project",
            None,
            None,
            false,
            &[],
            &[],
            false,
            true,
            false,
            None,
        );
        assert!(result.is_ok());
        let plugin_dir = PathBuf::from(result.unwrap());
        assert!(plugin_dir.join(".claude-plugin/plugin.json").exists());
        assert!(plugin_dir.join("agents/test-agent.md").exists());
        assert!(plugin_dir.join(".mcp.json").exists());
    }

    #[test]
    fn export_plugin_from_global_scope_reads_global_mcp() {
        let (tmp, mgr) = make_test_manager();
        // Use a "home" directory as the global scope path
        let home = tmp.path().join("home");
        fs::create_dir_all(home.join(".claude/agents")).unwrap();
        let home_path = home.to_string_lossy().to_string();

        // Create a global agent
        let agent_content = "---\nname: Global Agent\ndescription: Global\n---\n\nGlobal prompt.\n";
        fs::write(home.join(".claude/agents/global-agent.md"), agent_content).unwrap();

        // Create global MCP file (.claude.json instead of .mcp.json)
        let mcp_json = r#"{"mcpServers":{"global-server":{"type":"stdio","command":"npx","args":["server"]}}}"#;
        fs::write(home.join(".claude.json"), mcp_json).unwrap();

        let result = mgr.export_plugin(
            &home_path,
            "Global Export",
            "Exported from global",
            Some("Author"),
            Some("2.0.0"),
            false,
            &[],
            &[],
            false,
            true,
            true, // is_global = true
            None,
        );
        assert!(result.is_ok());
        let plugin_dir = PathBuf::from(result.unwrap());
        assert!(plugin_dir.join(".claude-plugin/plugin.json").exists());
        assert!(plugin_dir.join("agents/global-agent.md").exists());
        // MCP should be exported from .claude.json (global)
        assert!(plugin_dir.join(".mcp.json").exists());

        // Verify the MCP content includes the global server
        let exported_mcp: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(plugin_dir.join(".mcp.json")).unwrap())
                .unwrap();
        assert!(exported_mcp["mcpServers"]["global-server"].is_object());
    }

    #[test]
    fn export_plugin_uses_custom_export_dir() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let repo_path = repo.to_string_lossy().to_string();

        let agents_dir = repo.join(".claude/agents");
        fs::create_dir_all(&agents_dir).unwrap();
        let agent_content =
            "---\nname: Test Agent\ndescription: A test\n---\n\nYou are a test agent.\n";
        fs::write(agents_dir.join("test-agent.md"), agent_content).unwrap();

        let custom_dir = tmp.path().join("custom-exports");
        let result = mgr.export_plugin(
            &repo_path,
            "Custom Dir Export",
            "Exported to custom dir",
            None,
            None,
            false,
            &[],
            &[],
            false,
            false,
            false,
            Some(&custom_dir.to_string_lossy()),
        );
        assert!(result.is_ok());
        let plugin_dir = PathBuf::from(result.unwrap());
        // Should be inside the custom directory, not the default plugins dir
        assert!(plugin_dir.starts_with(&custom_dir));
        assert!(plugin_dir.join(".claude-plugin/plugin.json").exists());
        assert!(plugin_dir.join("agents/test-agent.md").exists());
    }

    #[test]
    fn sync_status_respects_pinned_flag() {
        let (tmp, mgr) = make_test_manager();
        let repo = create_test_repo(tmp.path());
        let plugin_dir = mgr.library_dir().join("pinned-sync");
        create_test_plugin_with_git(&plugin_dir, "pinned-sync", "v1");
        let repo_path = repo.to_string_lossy().to_string();

        mgr.record_import(&repo_path, &plugin_dir.to_string_lossy(), &ImportMode::Overwrite)
            .unwrap();
        mgr.set_import_pinned(&repo_path, "pinned-sync", true).unwrap();

        // Simulate update
        let gs = GitSource {
            repo_url: "https://github.com/test/repo.git".to_string(),
            branch: Some("main".to_string()),
            installed_commit: "v2".to_string(),
            installed_at: chrono::Utc::now().to_rfc3339(),
        };
        atomic_write(
            &plugin_dir.join(".claude-plugin/source.json"),
            &serde_json::to_string_pretty(&gs).unwrap(),
        )
        .unwrap();

        let statuses = mgr.get_import_sync_status(&repo_path).unwrap();
        assert_eq!(statuses.len(), 1);
        // Update is technically available but plugin is pinned
        assert!(statuses[0].update_available);
        assert!(statuses[0].pinned);
    }

    #[test]
    fn read_plugin_source_agents_returns_read_only() {
        let plugins_dir = tempfile::tempdir().unwrap();
        let library_dir = tempfile::tempdir().unwrap();
        let mgr = PluginManager::new(
            plugins_dir.path().to_path_buf(),
            library_dir.path().to_path_buf(),
        );

        // Create a plugin directory with agents
        let plugin_dir = plugins_dir.path().join("my-plugin");
        fs::create_dir_all(plugin_dir.join(".claude-plugin")).unwrap();
        atomic_write(
            &plugin_dir.join(".claude-plugin/plugin.json"),
            &serde_json::to_string_pretty(&PluginManifest {
                name: "My Plugin".to_string(),
                description: "Test plugin".to_string(),
                version: "1.0.0".to_string(),
                author: None,
            })
            .unwrap(),
        )
        .unwrap();

        let agents_dir = plugin_dir.join("agents");
        fs::create_dir_all(&agents_dir).unwrap();
        fs::write(
            agents_dir.join("test-agent.md"),
            "---\nname: Test Agent\ndescription: From plugin\n---\nYou are a test.",
        )
        .unwrap();

        // Create repo with import registry pointing to the plugin
        let repo = tempfile::tempdir().unwrap();
        let repo_path = repo.path().to_str().unwrap();
        let claude_dir = repo.path().join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();

        let registry = PluginImportRegistry {
            imports: vec![PluginImportRecord {
                plugin_name: "My Plugin".to_string(),
                plugin_dir: plugin_dir.to_string_lossy().to_string(),
                git_source: None,
                imported_commit: None,
                imported_at: "2026-03-01T00:00:00Z".to_string(),
                import_mode: ImportMode::AddOnly,
                pinned: false,
                auto_sync: false,
            }],
        };
        atomic_write(
            &claude_dir.join("plugin-imports.json"),
            &serde_json::to_string_pretty(&registry).unwrap(),
        )
        .unwrap();

        let agents = mgr.read_plugin_source_agents(repo_path).unwrap();
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].agent_id, "test-agent");
        assert_eq!(agents[0].name, "Test Agent");
        assert_eq!(agents[0].source, Some("plugin:My Plugin".to_string()));
        assert_eq!(agents[0].read_only, Some(true));
    }

    #[test]
    fn read_plugin_source_skills_returns_read_only() {
        let plugins_dir = tempfile::tempdir().unwrap();
        let library_dir = tempfile::tempdir().unwrap();
        let mgr = PluginManager::new(
            plugins_dir.path().to_path_buf(),
            library_dir.path().to_path_buf(),
        );

        // Create a plugin directory with skills
        let plugin_dir = plugins_dir.path().join("my-plugin");
        fs::create_dir_all(plugin_dir.join(".claude-plugin")).unwrap();
        atomic_write(
            &plugin_dir.join(".claude-plugin/plugin.json"),
            &serde_json::to_string_pretty(&PluginManifest {
                name: "My Plugin".to_string(),
                description: "Test plugin".to_string(),
                version: "1.0.0".to_string(),
                author: None,
            })
            .unwrap(),
        )
        .unwrap();

        let skill_dir = plugin_dir.join("skills/lint");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: Lint\ndescription: Run linting\n---\nLint the code.",
        )
        .unwrap();

        // Create repo with import registry
        let repo = tempfile::tempdir().unwrap();
        let repo_path = repo.path().to_str().unwrap();
        let claude_dir = repo.path().join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();

        let registry = PluginImportRegistry {
            imports: vec![PluginImportRecord {
                plugin_name: "My Plugin".to_string(),
                plugin_dir: plugin_dir.to_string_lossy().to_string(),
                git_source: None,
                imported_commit: None,
                imported_at: "2026-03-01T00:00:00Z".to_string(),
                import_mode: ImportMode::AddOnly,
                pinned: false,
                auto_sync: false,
            }],
        };
        atomic_write(
            &claude_dir.join("plugin-imports.json"),
            &serde_json::to_string_pretty(&registry).unwrap(),
        )
        .unwrap();

        let skills = mgr.read_plugin_source_skills(repo_path).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].skill_id, "lint");
        assert_eq!(skills[0].name, "Lint");
        assert_eq!(skills[0].source, Some("plugin:My Plugin".to_string()));
        assert_eq!(skills[0].read_only, Some(true));
    }

    #[test]
    fn read_plugin_source_agents_empty_when_no_imports() {
        let plugins_dir = tempfile::tempdir().unwrap();
        let library_dir = tempfile::tempdir().unwrap();
        let mgr = PluginManager::new(
            plugins_dir.path().to_path_buf(),
            library_dir.path().to_path_buf(),
        );

        let repo = tempfile::tempdir().unwrap();
        let agents = mgr.read_plugin_source_agents(repo.path().to_str().unwrap()).unwrap();
        assert!(agents.is_empty());
    }

    #[test]
    fn read_plugin_source_agents_skips_deleted_plugin() {
        let plugins_dir = tempfile::tempdir().unwrap();
        let library_dir = tempfile::tempdir().unwrap();
        let mgr = PluginManager::new(
            plugins_dir.path().to_path_buf(),
            library_dir.path().to_path_buf(),
        );

        // Create repo with import registry pointing to a non-existent plugin
        let repo = tempfile::tempdir().unwrap();
        let repo_path = repo.path().to_str().unwrap();
        let claude_dir = repo.path().join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();

        let registry = PluginImportRegistry {
            imports: vec![PluginImportRecord {
                plugin_name: "Gone Plugin".to_string(),
                plugin_dir: "/nonexistent/path/to/plugin".to_string(),
                git_source: None,
                imported_commit: None,
                imported_at: "2026-03-01T00:00:00Z".to_string(),
                import_mode: ImportMode::AddOnly,
                pinned: false,
                auto_sync: false,
            }],
        };
        atomic_write(
            &claude_dir.join("plugin-imports.json"),
            &serde_json::to_string_pretty(&registry).unwrap(),
        )
        .unwrap();

        let agents = mgr.read_plugin_source_agents(repo_path).unwrap();
        assert!(agents.is_empty(), "Should gracefully skip deleted plugin directories");
    }
}
