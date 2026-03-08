use crate::claude_adapter::{Agent, Skill};
use crate::history_analyzer;

#[tauri::command]
pub fn analyze_conversation_history() -> Result<history_analyzer::HistoryAnalysis, String> {
    history_analyzer::analyze_history()
}

#[tauri::command]
pub fn apply_personalized_agent(repo_path: String, agent: Agent) -> Result<(), String> {
    crate::claude_adapter::ClaudeRepoAdapter::write_agent(&repo_path, &agent)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apply_personalized_skill(repo_path: String, skill: Skill) -> Result<(), String> {
    crate::claude_adapter::ClaudeRepoAdapter::write_skill(&repo_path, &skill)
        .map_err(|e| e.to_string())
}
