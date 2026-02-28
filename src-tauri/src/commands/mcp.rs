use crate::claude_adapter::{ClaudeRepoAdapter, McpServer};

#[tauri::command]
pub fn read_mcp_servers(repo_path: String, is_global: bool) -> Result<Vec<McpServer>, String> {
    ClaudeRepoAdapter::read_mcp_servers(&repo_path, is_global).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_mcp_server(repo_path: String, server: McpServer, is_global: bool) -> Result<(), String> {
    ClaudeRepoAdapter::write_mcp_server(&repo_path, &server, is_global).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_mcp_server(repo_path: String, server_id: String, is_global: bool) -> Result<(), String> {
    ClaudeRepoAdapter::delete_mcp_server(&repo_path, &server_id, is_global).map_err(|e| e.to_string())
}
