use crate::claude_adapter::{ClaudeRepoAdapter, HookEvent};

#[tauri::command]
pub fn read_hooks(repo_path: String) -> Result<Vec<HookEvent>, String> {
    ClaudeRepoAdapter::read_hooks(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_hooks(repo_path: String, hooks: Vec<HookEvent>) -> Result<(), String> {
    ClaudeRepoAdapter::write_hooks(&repo_path, &hooks).map_err(|e| e.to_string())
}
