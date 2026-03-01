use crate::claude_adapter::{
    Agent, ClaudeDetection, ClaudeRepoAdapter, ConfigSnapshot, ConfigSnapshotSummary,
    ImportBundleResult, MemoryEntry, MemoryStore, NormalizedConfig, ProjectScanResult,
};

#[tauri::command]
pub fn get_claude_home() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

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
pub fn delete_memory_store(store_path: String) -> Result<(), String> {
    ClaudeRepoAdapter::delete_memory_store(&store_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reset_memory(store_path: String) -> Result<(), String> {
    ClaudeRepoAdapter::reset_memory(&store_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_known_tools() -> Vec<String> {
    ClaudeRepoAdapter::known_tools()
}

/// Write a prompt to a temp file and a wrapper script that launches Claude Code.
/// Returns the shell command to execute (the wrapper script path).
#[tauri::command]
pub fn prepare_ai_command(repo_path: String, prompt: String) -> Result<String, String> {
    let dir = std::path::Path::new(&repo_path).join(".claude");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let prompt_path = dir.join(".ai-prompt.tmp");
    std::fs::write(&prompt_path, &prompt).map_err(|e| e.to_string())?;

    if cfg!(target_os = "windows") {
        let script_path = dir.join(".ai-create.cmd");
        let script = "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command \
\"$p = [IO.File]::ReadAllText('%~dp0.ai-prompt.tmp'); & claude $p\"\r\n";
        std::fs::write(&script_path, script).map_err(|e| e.to_string())?;
        Ok(script_path.to_string_lossy().to_string())
    } else {
        let script_path = dir.join(".ai-create.sh");
        let script = "#!/bin/sh\nSCRIPT_DIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\nexec claude \"$(cat \"$SCRIPT_DIR/.ai-prompt.tmp\")\"\n";
        std::fs::write(&script_path, script).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = std::fs::Permissions::from_mode(0o755);
            std::fs::set_permissions(&script_path, perms).map_err(|e| e.to_string())?;
        }
        Ok(script_path.to_string_lossy().to_string())
    }
}

/// Launch a command in a new terminal window and return its PID.
/// This is a lightweight launcher with no session tracking.
#[tauri::command]
pub fn launch_terminal(repo_path: String, command: String) -> Result<u32, String> {
    use std::process::Command;

    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "tell application \"Terminal\"\n    activate\n    do script \"cd '{}' && {}\"\nend tell",
            repo_path.replace('\'', "'\\''"),
            command.replace('"', "\\\"")
        );
        let child = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn()
            .map_err(|e| format!("Failed to launch terminal: {}", e))?;
        return Ok(child.id());
    }

    #[cfg(target_os = "linux")]
    {
        let keep_open = format!("cd '{}' && {}; exec bash", repo_path.replace('\'', "'\\''"), command);
        // Try common terminals in order
        let terminals: Vec<(&str, Vec<&str>)> = vec![
            ("gnome-terminal", vec!["--", "bash", "-c", &keep_open]),
            ("konsole", vec!["-e", "bash", "-c", &keep_open]),
            ("xterm", vec!["-e", "bash", "-c", &keep_open]),
        ];

        for (term, args) in &terminals {
            if let Ok(child) = Command::new(term).args(args).spawn() {
                return Ok(child.id());
            }
        }

        // Fallback: run in background bash
        let child = Command::new("bash")
            .arg("-c")
            .arg(&keep_open)
            .spawn()
            .map_err(|e| format!("No terminal emulator found: {}", e))?;
        return Ok(child.id());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;

        let child = Command::new("cmd")
            .args(["/k", &command])
            .current_dir(&repo_path)
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map_err(|e| format!("Failed to launch terminal: {}", e))?;
        return Ok(child.id());
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform".to_string())
}

#[tauri::command]
pub fn read_claude_md(repo_path: String) -> Result<String, String> {
    ClaudeRepoAdapter::read_claude_md(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_claude_md_files(repo_path: String) -> Result<Vec<String>, String> {
    ClaudeRepoAdapter::list_claude_md_files(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_config_snapshot(repo_path: String, label: String) -> Result<ConfigSnapshot, String> {
    ClaudeRepoAdapter::save_config_snapshot(&repo_path, &label).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_config_snapshots(repo_path: String) -> Result<Vec<ConfigSnapshotSummary>, String> {
    ClaudeRepoAdapter::list_config_snapshots(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_config_snapshot(repo_path: String, snapshot_id: String) -> Result<(), String> {
    ClaudeRepoAdapter::restore_config_snapshot(&repo_path, &snapshot_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_config_snapshot(repo_path: String, snapshot_id: String) -> Result<(), String> {
    ClaudeRepoAdapter::delete_config_snapshot(&repo_path, &snapshot_id).map_err(|e| e.to_string())
}

/// Check if a process is still alive by PID.
#[tauri::command]
pub fn is_process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // kill(pid, 0) returns 0 if process exists, -1 if not
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }

    #[cfg(windows)]
    {
        use std::ptr;
        unsafe {
            let handle = winapi::um::processthreadsapi::OpenProcess(
                winapi::um::winnt::PROCESS_QUERY_LIMITED_INFORMATION,
                0,
                pid,
            );
            if handle.is_null() {
                return false;
            }
            let mut exit_code: u32 = 0;
            let result = winapi::um::processthreadsapi::GetExitCodeProcess(handle, &mut exit_code);
            winapi::um::handleapi::CloseHandle(handle);
            result != 0 && exit_code == 259 // STILL_ACTIVE
        }
    }

    #[cfg(not(any(unix, windows)))]
    false
}

#[tauri::command]
pub fn export_config_bundle(repo_path: String, is_global: bool) -> Result<String, String> {
    let bytes =
        ClaudeRepoAdapter::export_config_bundle(&repo_path, is_global).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_config_bundle(
    repo_path: String,
    is_global: bool,
    bundle_json: String,
    mode: String,
) -> Result<ImportBundleResult, String> {
    ClaudeRepoAdapter::import_config_bundle(&repo_path, is_global, bundle_json.as_bytes(), &mode)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_project_config(project_path: String) -> Result<ProjectScanResult, String> {
    ClaudeRepoAdapter::scan_project_config(std::path::Path::new(&project_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_agent_enabled(
    repo_path: String,
    agent_id: String,
    enabled: bool,
) -> Result<(), String> {
    if enabled {
        ClaudeRepoAdapter::enable_agent(&repo_path, &agent_id).map_err(|e| e.to_string())
    } else {
        ClaudeRepoAdapter::disable_agent(&repo_path, &agent_id).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn toggle_skill_enabled(
    repo_path: String,
    skill_id: String,
    enabled: bool,
) -> Result<(), String> {
    if enabled {
        ClaudeRepoAdapter::enable_skill(&repo_path, &skill_id).map_err(|e| e.to_string())
    } else {
        ClaudeRepoAdapter::disable_skill(&repo_path, &skill_id).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn list_disabled_agents(repo_path: String) -> Result<Vec<String>, String> {
    ClaudeRepoAdapter::list_disabled_agents(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_disabled_skills(repo_path: String) -> Result<Vec<String>, String> {
    ClaudeRepoAdapter::list_disabled_skills(&repo_path).map_err(|e| e.to_string())
}
