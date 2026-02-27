use crate::claude_adapter::{
    Agent, ClaudeDetection, ClaudeRepoAdapter, MemoryEntry, MemoryStore, NormalizedConfig,
};

#[tauri::command]
pub fn detect_claude_config(repo_path: String) -> ClaudeDetection {
    ClaudeRepoAdapter::detect(&repo_path)
}

#[tauri::command]
pub fn read_claude_config(repo_path: String) -> Result<NormalizedConfig, String> {
    ClaudeRepoAdapter::read_config(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_claude_config(repo_path: String, config: NormalizedConfig) -> Result<(), String> {
    ClaudeRepoAdapter::write_config(&repo_path, &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_agents(repo_path: String) -> Result<Vec<Agent>, String> {
    ClaudeRepoAdapter::read_agents(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_agent(repo_path: String, agent: Agent) -> Result<(), String> {
    ClaudeRepoAdapter::write_agent(&repo_path, &agent).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_agent(repo_path: String, agent_id: String) -> Result<(), String> {
    ClaudeRepoAdapter::delete_agent(&repo_path, &agent_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_memory_stores(repo_path: String) -> Result<Vec<MemoryStore>, String> {
    ClaudeRepoAdapter::read_memory_stores(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_memory_store(repo_path: String, store_name: String) -> Result<MemoryStore, String> {
    ClaudeRepoAdapter::create_memory_store(&repo_path, &store_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_memory_entries(store_path: String) -> Result<Vec<MemoryEntry>, String> {
    ClaudeRepoAdapter::read_memory_entries(&store_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_memory_entry(store_path: String, entry: MemoryEntry) -> Result<(), String> {
    ClaudeRepoAdapter::write_memory_entry(&store_path, &entry).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_memory_entry(
    store_path: String,
    entry_index: usize,
    new_content: String,
) -> Result<(), String> {
    ClaudeRepoAdapter::update_memory_entry(&store_path, entry_index, &new_content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_memory_entry(store_path: String, entry_index: usize) -> Result<(), String> {
    ClaudeRepoAdapter::delete_memory_entry(&store_path, entry_index).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reset_memory(store_path: String) -> Result<(), String> {
    ClaudeRepoAdapter::reset_memory(&store_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_known_tools() -> Vec<String> {
    ClaudeRepoAdapter::known_tools()
}
