use crate::claude_adapter::{ClaudeRepoAdapter, Skill};

#[tauri::command]
pub fn read_skills(repo_path: String) -> Result<Vec<Skill>, String> {
    ClaudeRepoAdapter::read_skills(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_skill(repo_path: String, skill: Skill) -> Result<(), String> {
    ClaudeRepoAdapter::write_skill(&repo_path, &skill).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_skill(repo_path: String, skill_id: String) -> Result<(), String> {
    ClaudeRepoAdapter::delete_skill(&repo_path, &skill_id).map_err(|e| e.to_string())
}
