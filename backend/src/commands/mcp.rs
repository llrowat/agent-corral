use crate::claude_adapter::{ClaudeRepoAdapter, McpServer};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpHealthResult {
    pub server_id: String,
    pub status: String, // "healthy", "error", "unknown"
    pub message: String,
    pub checked_at: String,
}

#[tauri::command]
pub fn check_mcp_health(
    repo_path: String,
    server_id: String,
    is_global: bool,
) -> Result<McpHealthResult, String> {
    let servers = ClaudeRepoAdapter::read_mcp_servers(&repo_path, is_global)
        .map_err(|e| e.to_string())?;

    let server = servers
        .iter()
        .find(|s| s.server_id == server_id)
        .ok_or_else(|| format!("Server '{}' not found", server_id))?;

    let timestamp = chrono::Utc::now().to_rfc3339();

    if server.server_type == "stdio" {
        if let Some(ref command) = server.command {
            // Check if the command exists/is executable
            let which_result = std::process::Command::new("which")
                .arg(command)
                .output();

            match which_result {
                Ok(output) if output.status.success() => Ok(McpHealthResult {
                    server_id: server_id.clone(),
                    status: "healthy".to_string(),
                    message: format!("Command '{}' found and accessible", command),
                    checked_at: timestamp,
                }),
                _ => {
                    // On Windows or if which fails, try "where" on Windows or just report unknown
                    #[cfg(target_os = "windows")]
                    {
                        let where_result = std::process::Command::new("where")
                            .arg(command)
                            .output();
                        match where_result {
                            Ok(output) if output.status.success() => {
                                return Ok(McpHealthResult {
                                    server_id: server_id.clone(),
                                    status: "healthy".to_string(),
                                    message: format!(
                                        "Command '{}' found and accessible",
                                        command
                                    ),
                                    checked_at: timestamp,
                                });
                            }
                            _ => {}
                        }
                    }

                    // Check if it's an npx command (common for MCP servers)
                    if command == "npx"
                        || command == "node"
                        || command == "python"
                        || command == "python3"
                    {
                        Ok(McpHealthResult {
                            server_id: server_id.clone(),
                            status: "healthy".to_string(),
                            message: format!(
                                "Runtime '{}' assumed available (common runtime)",
                                command
                            ),
                            checked_at: timestamp,
                        })
                    } else {
                        Ok(McpHealthResult {
                            server_id: server_id.clone(),
                            status: "error".to_string(),
                            message: format!("Command '{}' not found in PATH", command),
                            checked_at: timestamp,
                        })
                    }
                }
            }
        } else {
            Ok(McpHealthResult {
                server_id,
                status: "error".to_string(),
                message: "stdio server has no command configured".to_string(),
                checked_at: timestamp,
            })
        }
    } else if server.server_type == "http" || server.server_type == "sse" {
        if let Some(ref url) = server.url {
            Ok(McpHealthResult {
                server_id,
                status: "unknown".to_string(),
                message: format!("URL endpoint configured: {}", url),
                checked_at: timestamp,
            })
        } else {
            Ok(McpHealthResult {
                server_id,
                status: "error".to_string(),
                message: format!("{} server has no URL configured", server.server_type),
                checked_at: timestamp,
            })
        }
    } else {
        Ok(McpHealthResult {
            server_id,
            status: "unknown".to_string(),
            message: format!("Unknown server type: {}", server.server_type),
            checked_at: timestamp,
        })
    }
}

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

#[tauri::command]
pub fn toggle_mcp_server_enabled(
    repo_path: String,
    server_id: String,
    is_global: bool,
    enabled: bool,
) -> Result<(), String> {
    if enabled {
        ClaudeRepoAdapter::enable_mcp_server(&repo_path, &server_id, is_global)
            .map_err(|e| e.to_string())
    } else {
        ClaudeRepoAdapter::disable_mcp_server(&repo_path, &server_id, is_global)
            .map_err(|e| e.to_string())
    }
}
