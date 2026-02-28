use crate::claude_adapter::{ClaudeRepoAdapter, McpServer};

#[tauri::command]
pub fn read_mcp_servers(repo_path: String) -> Result<Vec<McpServer>, String> {
    ClaudeRepoAdapter::read_mcp_servers(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_mcp_server(repo_path: String, server: McpServer) -> Result<(), String> {
    ClaudeRepoAdapter::write_mcp_server(&repo_path, &server).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_mcp_server(repo_path: String, server_id: String) -> Result<(), String> {
    ClaudeRepoAdapter::delete_mcp_server(&repo_path, &server_id).map_err(|e| e.to_string())
}
