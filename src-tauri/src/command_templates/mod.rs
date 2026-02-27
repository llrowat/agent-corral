use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

use crate::claude_adapter::atomic_write;

#[derive(Error, Debug)]
pub enum TemplateError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Template not found: {0}")]
    NotFound(String),
    #[error("Missing variable: {0}")]
    MissingVariable(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandTemplate {
    pub template_id: String,
    pub name: String,
    pub description: String,
    pub requires: Vec<String>,
    pub command: String,
    pub cwd: Option<String>,
}

pub struct TemplateEngine {
    templates_path: PathBuf,
}

impl TemplateEngine {
    pub fn new(app_data_dir: &Path) -> Self {
        let templates_path = app_data_dir.join("templates.json");
        Self { templates_path }
    }

    /// Get the built-in default templates
    pub fn default_templates() -> Vec<CommandTemplate> {
        vec![
            CommandTemplate {
                template_id: "run-claude".to_string(),
                name: "Run Claude Code".to_string(),
                description: "Start an interactive Claude Code session".to_string(),
                requires: vec!["repo".to_string()],
                command: "claude".to_string(),
                cwd: Some("{{repoPath}}".to_string()),
            },
            CommandTemplate {
                template_id: "run-chat".to_string(),
                name: "Claude Chat".to_string(),
                description: "Start a Claude Code chat session".to_string(),
                requires: vec!["repo".to_string()],
                command: "claude --chat".to_string(),
                cwd: Some("{{repoPath}}".to_string()),
            },
            CommandTemplate {
                template_id: "run-agent".to_string(),
                name: "Run Agent".to_string(),
                description: "Run a specific agent in a repo".to_string(),
                requires: vec!["repo".to_string(), "agent".to_string()],
                command: "claude --agent {{agentId}}".to_string(),
                cwd: Some("{{repoPath}}".to_string()),
            },
            CommandTemplate {
                template_id: "run-prompt".to_string(),
                name: "Run with Prompt".to_string(),
                description: "Run Claude Code with a specific prompt".to_string(),
                requires: vec!["repo".to_string(), "prompt".to_string()],
                command: "claude -p {{prompt}}".to_string(),
                cwd: Some("{{repoPath}}".to_string()),
            },
            CommandTemplate {
                template_id: "run-review".to_string(),
                name: "Code Review".to_string(),
                description: "Run Claude Code to review recent changes".to_string(),
                requires: vec!["repo".to_string()],
                command: "claude -p 'Review the recent changes in this repository. Focus on code quality, potential bugs, and suggestions for improvement.'".to_string(),
                cwd: Some("{{repoPath}}".to_string()),
            },
        ]
    }

    /// List all templates (defaults + custom)
    pub fn list_templates(&self) -> Result<Vec<CommandTemplate>, TemplateError> {
        let mut templates = Self::default_templates();

        if self.templates_path.exists() {
            let json = fs::read_to_string(&self.templates_path)?;
            let custom: Vec<CommandTemplate> = serde_json::from_str(&json)?;
            templates.extend(custom);
        }

        Ok(templates)
    }

    /// Save a custom template
    pub fn save_template(&self, template: &CommandTemplate) -> Result<(), TemplateError> {
        let mut custom = self.load_custom_templates()?;

        // Update or add
        if let Some(existing) = custom.iter_mut().find(|t| t.template_id == template.template_id) {
            *existing = template.clone();
        } else {
            custom.push(template.clone());
        }

        let json = serde_json::to_string_pretty(&custom)?;
        atomic_write(&self.templates_path, &json)
            .map_err(TemplateError::Io)?;
        Ok(())
    }

    /// Delete a custom template (cannot delete defaults)
    pub fn delete_template(&self, template_id: &str) -> Result<(), TemplateError> {
        let defaults: Vec<String> = Self::default_templates()
            .iter()
            .map(|t| t.template_id.clone())
            .collect();

        if defaults.contains(&template_id.to_string()) {
            return Err(TemplateError::NotFound(
                "Cannot delete a built-in template".to_string(),
            ));
        }

        let mut custom = self.load_custom_templates()?;
        let before = custom.len();
        custom.retain(|t| t.template_id != template_id);

        if custom.len() == before {
            return Err(TemplateError::NotFound(template_id.to_string()));
        }

        let json = serde_json::to_string_pretty(&custom)?;
        atomic_write(&self.templates_path, &json)
            .map_err(TemplateError::Io)?;
        Ok(())
    }

    /// Render a template with the given variables
    pub fn render(
        template: &CommandTemplate,
        vars: &HashMap<String, String>,
    ) -> Result<String, TemplateError> {
        let mut result = template.command.clone();

        // Check required variables
        for req in &template.requires {
            let var_name = match req.as_str() {
                "repo" => "repoPath",
                "agent" => "agentId",
                "prompt" => "prompt",
                other => other,
            };
            if !vars.contains_key(var_name) {
                return Err(TemplateError::MissingVariable(req.clone()));
            }
        }

        // Substitute all {{var}} patterns
        for (key, value) in vars {
            let pattern = format!("{{{{{}}}}}", key);
            result = result.replace(&pattern, &shell_quote(value));
        }

        Ok(result)
    }

    fn load_custom_templates(&self) -> Result<Vec<CommandTemplate>, TemplateError> {
        if !self.templates_path.exists() {
            return Ok(vec![]);
        }
        let json = fs::read_to_string(&self.templates_path)?;
        let custom: Vec<CommandTemplate> = serde_json::from_str(&json)?;
        Ok(custom)
    }
}

fn shell_quote(s: &str) -> String {
    if s.contains(' ') || s.contains('"') || s.contains('\'') || s.contains('$') {
        format!("'{}'", s.replace('\'', "'\\''"))
    } else {
        s.to_string()
    }
}
