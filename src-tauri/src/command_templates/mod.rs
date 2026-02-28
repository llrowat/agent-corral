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
    #[serde(default)]
    pub use_worktree: bool,
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
                use_worktree: false,
            },
            CommandTemplate {
                template_id: "run-chat".to_string(),
                name: "Claude Chat".to_string(),
                description: "Start a Claude Code chat session".to_string(),
                requires: vec!["repo".to_string()],
                command: "claude --chat".to_string(),
                cwd: Some("{{repoPath}}".to_string()),
                use_worktree: false,
            },
            CommandTemplate {
                template_id: "run-agent".to_string(),
                name: "Run Agent".to_string(),
                description: "Run a specific agent in a repo".to_string(),
                requires: vec!["repo".to_string(), "agent".to_string()],
                command: "claude --agent {{agentId}}".to_string(),
                cwd: Some("{{repoPath}}".to_string()),
                use_worktree: false,
            },
            CommandTemplate {
                template_id: "run-prompt".to_string(),
                name: "Run with Prompt".to_string(),
                description: "Run Claude Code with a specific prompt".to_string(),
                requires: vec!["repo".to_string(), "prompt".to_string()],
                command: "claude -p {{prompt}}".to_string(),
                cwd: Some("{{repoPath}}".to_string()),
                use_worktree: false,
            },
            CommandTemplate {
                template_id: "run-review".to_string(),
                name: "Code Review".to_string(),
                description: "Run Claude Code to review recent changes".to_string(),
                requires: vec!["repo".to_string()],
                command: "claude -p 'Review the recent changes in this repository. Focus on code quality, potential bugs, and suggestions for improvement.'".to_string(),
                cwd: Some("{{repoPath}}".to_string()),
                use_worktree: false,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    // -- shell_quote tests --

    #[test]
    fn shell_quote_plain_string() {
        assert_eq!(shell_quote("hello"), "hello");
    }

    #[test]
    fn shell_quote_with_spaces() {
        assert_eq!(shell_quote("hello world"), "'hello world'");
    }

    #[test]
    fn shell_quote_with_single_quotes() {
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
    }

    #[test]
    fn shell_quote_with_dollar_sign() {
        assert_eq!(shell_quote("$HOME"), "'$HOME'");
    }

    #[test]
    fn shell_quote_with_double_quotes() {
        assert_eq!(shell_quote("say \"hi\""), "'say \"hi\"'");
    }

    #[test]
    fn shell_quote_empty_string() {
        assert_eq!(shell_quote(""), "");
    }

    // -- default templates tests --

    #[test]
    fn default_templates_returns_expected_count() {
        let templates = TemplateEngine::default_templates();
        assert_eq!(templates.len(), 5);
    }

    #[test]
    fn default_templates_have_unique_ids() {
        let templates = TemplateEngine::default_templates();
        let ids: Vec<&str> = templates.iter().map(|t| t.template_id.as_str()).collect();
        let mut unique_ids = ids.clone();
        unique_ids.sort();
        unique_ids.dedup();
        assert_eq!(ids.len(), unique_ids.len());
    }

    #[test]
    fn default_templates_all_require_repo() {
        let templates = TemplateEngine::default_templates();
        for t in &templates {
            assert!(
                t.requires.contains(&"repo".to_string()),
                "Template '{}' should require 'repo'",
                t.name
            );
        }
    }

    // -- render tests --

    #[test]
    fn render_simple_template() {
        let template = CommandTemplate {
            template_id: "test".to_string(),
            name: "Test".to_string(),
            description: "Test template".to_string(),
            requires: vec!["repo".to_string()],
            command: "claude --cwd {{repoPath}}".to_string(),
            cwd: None,
            use_worktree: false,
        };
        let mut vars = HashMap::new();
        vars.insert("repoPath".to_string(), "/home/user/project".to_string());

        let result = TemplateEngine::render(&template, &vars).unwrap();
        assert_eq!(result, "claude --cwd /home/user/project");
    }

    #[test]
    fn render_template_with_spaces_in_var() {
        let template = CommandTemplate {
            template_id: "test".to_string(),
            name: "Test".to_string(),
            description: "Test".to_string(),
            requires: vec!["repo".to_string()],
            command: "claude --cwd {{repoPath}}".to_string(),
            cwd: None,
            use_worktree: false,
        };
        let mut vars = HashMap::new();
        vars.insert("repoPath".to_string(), "/home/user/my project".to_string());

        let result = TemplateEngine::render(&template, &vars).unwrap();
        assert_eq!(result, "claude --cwd '/home/user/my project'");
    }

    #[test]
    fn render_template_missing_required_variable() {
        let template = CommandTemplate {
            template_id: "test".to_string(),
            name: "Test".to_string(),
            description: "Test".to_string(),
            requires: vec!["repo".to_string(), "agent".to_string()],
            command: "claude --agent {{agentId}}".to_string(),
            cwd: None,
            use_worktree: false,
        };
        let mut vars = HashMap::new();
        vars.insert("repoPath".to_string(), "/tmp".to_string());

        let result = TemplateEngine::render(&template, &vars);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), TemplateError::MissingVariable(_)));
    }

    #[test]
    fn render_template_multiple_vars() {
        let template = CommandTemplate {
            template_id: "test".to_string(),
            name: "Test".to_string(),
            description: "Test".to_string(),
            requires: vec!["repo".to_string(), "prompt".to_string()],
            command: "claude -p {{prompt}}".to_string(),
            cwd: Some("{{repoPath}}".to_string()),
            use_worktree: false,
        };
        let mut vars = HashMap::new();
        vars.insert("repoPath".to_string(), "/tmp/repo".to_string());
        vars.insert("prompt".to_string(), "fix bugs".to_string());

        let result = TemplateEngine::render(&template, &vars).unwrap();
        assert_eq!(result, "claude -p 'fix bugs'");
    }

    // -- TemplateEngine CRUD tests --

    #[test]
    fn list_templates_returns_defaults_when_no_custom() {
        let tmp = tempfile::tempdir().unwrap();
        let engine = TemplateEngine::new(tmp.path());
        let templates = engine.list_templates().unwrap();
        assert_eq!(templates.len(), 5);
    }

    #[test]
    fn save_and_list_custom_template() {
        let tmp = tempfile::tempdir().unwrap();
        let engine = TemplateEngine::new(tmp.path());

        let custom = CommandTemplate {
            template_id: "custom-1".to_string(),
            name: "Custom".to_string(),
            description: "A custom template".to_string(),
            requires: vec!["repo".to_string()],
            command: "echo hello".to_string(),
            cwd: None,
            use_worktree: false,
        };

        engine.save_template(&custom).unwrap();
        let templates = engine.list_templates().unwrap();
        assert_eq!(templates.len(), 6);
        assert!(templates.iter().any(|t| t.template_id == "custom-1"));
    }

    #[test]
    fn save_template_update_existing() {
        let tmp = tempfile::tempdir().unwrap();
        let engine = TemplateEngine::new(tmp.path());

        let custom = CommandTemplate {
            template_id: "custom-1".to_string(),
            name: "Custom".to_string(),
            description: "V1".to_string(),
            requires: vec![],
            command: "echo v1".to_string(),
            cwd: None,
            use_worktree: false,
        };
        engine.save_template(&custom).unwrap();

        let updated = CommandTemplate {
            template_id: "custom-1".to_string(),
            name: "Custom Updated".to_string(),
            description: "V2".to_string(),
            requires: vec![],
            command: "echo v2".to_string(),
            cwd: None,
            use_worktree: false,
        };
        engine.save_template(&updated).unwrap();

        let templates = engine.list_templates().unwrap();
        let custom_templates: Vec<_> = templates
            .iter()
            .filter(|t| t.template_id == "custom-1")
            .collect();
        assert_eq!(custom_templates.len(), 1);
        assert_eq!(custom_templates[0].name, "Custom Updated");
    }

    #[test]
    fn delete_custom_template() {
        let tmp = tempfile::tempdir().unwrap();
        let engine = TemplateEngine::new(tmp.path());

        let custom = CommandTemplate {
            template_id: "custom-1".to_string(),
            name: "Custom".to_string(),
            description: "Test".to_string(),
            requires: vec![],
            command: "echo".to_string(),
            cwd: None,
            use_worktree: false,
        };
        engine.save_template(&custom).unwrap();
        engine.delete_template("custom-1").unwrap();

        let templates = engine.list_templates().unwrap();
        assert_eq!(templates.len(), 5); // back to defaults only
    }

    #[test]
    fn delete_builtin_template_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let engine = TemplateEngine::new(tmp.path());

        let result = engine.delete_template("run-claude");
        assert!(result.is_err());
    }

    #[test]
    fn delete_nonexistent_template_fails() {
        let tmp = tempfile::tempdir().unwrap();
        let engine = TemplateEngine::new(tmp.path());

        let result = engine.delete_template("does-not-exist");
        assert!(result.is_err());
    }

    // -- CommandTemplate serialization --

    #[test]
    fn command_template_serializes_camel_case() {
        let t = CommandTemplate {
            template_id: "test".to_string(),
            name: "Test".to_string(),
            description: "Desc".to_string(),
            requires: vec![],
            command: "cmd".to_string(),
            cwd: None,
            use_worktree: true,
        };
        let json = serde_json::to_value(&t).unwrap();
        assert!(json.get("templateId").is_some());
        assert!(json.get("useWorktree").is_some());
        assert!(json.get("template_id").is_none());
    }
}
