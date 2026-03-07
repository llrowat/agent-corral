use crate::claude_adapter::{Agent, Skill};
use crate::plugin_manager::{
    ImportMode, PluginContents, PluginImportPreview, PluginImportRegistry, PluginSummary,
    PluginSyncStatus, PluginUpdateCheck,
};
use crate::AppState;

#[tauri::command]
pub fn list_plugins(state: tauri::State<AppState>) -> Result<Vec<PluginSummary>, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .list_plugins()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_plugin(
    state: tauri::State<AppState>,
    repo_path: String,
    name: String,
    description: String,
    author: Option<String>,
    version: Option<String>,
    include_config: bool,
    agent_ids: Vec<String>,
    skill_ids: Vec<String>,
    include_hooks: bool,
    include_mcp: bool,
    is_global: bool,
) -> Result<String, String> {
    let export_dir = state
        .preferences
        .lock()
        .map_err(|e| e.to_string())?
        .get_export_dir();
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .export_plugin(
            &repo_path,
            &name,
            &description,
            author.as_deref(),
            version.as_deref(),
            include_config,
            &agent_ids,
            &skill_ids,
            include_hooks,
            include_mcp,
            is_global,
            export_dir.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_plugin_import(
    state: tauri::State<AppState>,
    plugin_dir: String,
    repo_path: String,
    is_global: bool,
) -> Result<PluginImportPreview, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .preview_import(&plugin_dir, &repo_path, is_global)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_plugin(
    state: tauri::State<AppState>,
    plugin_dir: String,
    repo_path: String,
    mode: ImportMode,
    is_global: bool,
) -> Result<(), String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .import_plugin(&plugin_dir, &repo_path, mode, is_global)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_plugin(state: tauri::State<AppState>, plugin_dir: String) -> Result<(), String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .delete_plugin(&plugin_dir)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_plugin(
    state: tauri::State<AppState>,
    plugin_dir: String,
) -> Result<PluginContents, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .read_plugin(&plugin_dir)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn install_plugin_from_git(
    state: tauri::State<AppState>,
    repo_url: String,
    branch: Option<String>,
) -> Result<Vec<PluginSummary>, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .install_from_git(&repo_url, branch.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_plugin_updates(
    state: tauri::State<AppState>,
) -> Result<Vec<PluginUpdateCheck>, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .check_updates()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_plugin(
    state: tauri::State<AppState>,
    plugin_dir: String,
) -> Result<PluginSummary, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .update_plugin(&plugin_dir)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn migrate_agentpack(
    state: tauri::State<AppState>,
    agentpack_path: String,
) -> Result<String, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .migrate_agentpack(&agentpack_path)
        .map_err(|e| e.to_string())
}

// -- Import sync commands --

#[tauri::command]
pub fn get_import_sync_status(
    state: tauri::State<AppState>,
    repo_path: String,
) -> Result<Vec<PluginSyncStatus>, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .get_import_sync_status(&repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sync_imported_plugin(
    state: tauri::State<AppState>,
    repo_path: String,
    plugin_name: String,
) -> Result<PluginSyncStatus, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .sync_imported_plugin(&repo_path, &plugin_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn auto_sync_repo(
    state: tauri::State<AppState>,
    repo_path: String,
) -> Result<Vec<String>, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .auto_sync_repo(&repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_import_pinned(
    state: tauri::State<AppState>,
    repo_path: String,
    plugin_name: String,
    pinned: bool,
) -> Result<(), String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .set_import_pinned(&repo_path, &plugin_name, pinned)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_import_auto_sync(
    state: tauri::State<AppState>,
    repo_path: String,
    plugin_name: String,
    auto_sync: bool,
) -> Result<(), String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .set_import_auto_sync(&repo_path, &plugin_name, auto_sync)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_import_record(
    state: tauri::State<AppState>,
    repo_path: String,
    plugin_name: String,
) -> Result<(), String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .remove_import_record(&repo_path, &plugin_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn auto_update_library(state: tauri::State<AppState>) -> Result<Vec<String>, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .auto_update_library()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_import_registry(
    state: tauri::State<AppState>,
    repo_path: String,
) -> Result<PluginImportRegistry, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .read_import_registry(&repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_plugin_source_agents(
    state: tauri::State<AppState>,
    repo_path: String,
) -> Result<Vec<Agent>, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .read_plugin_source_agents(&repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_plugin_source_skills(
    state: tauri::State<AppState>,
    repo_path: String,
) -> Result<Vec<Skill>, String> {
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .read_plugin_source_skills(&repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_plugin_sync_interval(
    state: tauri::State<AppState>,
    minutes: u32,
) -> Result<(), String> {
    state
        .preferences
        .lock()
        .map_err(|e| e.to_string())?
        .set_plugin_sync_interval(minutes)
}

#[tauri::command]
pub fn get_plugin_sync_interval(state: tauri::State<AppState>) -> Result<u32, String> {
    Ok(state
        .preferences
        .lock()
        .map_err(|e| e.to_string())?
        .get_plugin_sync_interval())
}

#[tauri::command]
pub fn get_export_dir(state: tauri::State<AppState>) -> Result<Option<String>, String> {
    Ok(state
        .preferences
        .lock()
        .map_err(|e| e.to_string())?
        .get_export_dir())
}

#[tauri::command]
pub fn set_export_dir(
    state: tauri::State<AppState>,
    dir: Option<String>,
) -> Result<(), String> {
    state
        .preferences
        .lock()
        .map_err(|e| e.to_string())?
        .set_export_dir(dir)
}
