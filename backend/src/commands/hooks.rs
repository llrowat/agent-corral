use std::path::Path;

use crate::claude_adapter::{ClaudeRepoAdapter, HookEvent};

#[tauri::command]
pub fn read_hooks(repo_path: String) -> Result<Vec<HookEvent>, String> {
    ClaudeRepoAdapter::read_hooks(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_hooks(repo_path: String, hooks: Vec<HookEvent>) -> Result<(), String> {
    ClaudeRepoAdapter::write_hooks(&repo_path, &hooks).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_hook_groups(
    repo_path: String,
    event: String,
    new_order: Vec<usize>,
) -> Result<(), String> {
    ClaudeRepoAdapter::reorder_hook_groups(Path::new(&repo_path), &event, &new_order)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_hook_group_enabled(
    repo_path: String,
    event: String,
    group_index: usize,
    enabled: bool,
) -> Result<(), String> {
    if enabled {
        ClaudeRepoAdapter::enable_hook(&repo_path, &event, group_index)
            .map_err(|e| e.to_string())
    } else {
        ClaudeRepoAdapter::disable_hook(&repo_path, &event, group_index)
            .map_err(|e| e.to_string())
    }
}
