use crate::command_templates::CommandTemplate;
use crate::plugin_manager::{
    ImportMode, PluginContents, PluginImportPreview, PluginSummary, PluginUpdateCheck,
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
    template_ids: Vec<String>,
) -> Result<String, String> {
    // Gather selected templates from the template engine
    let all_templates = state
        .template_engine
        .lock()
        .map_err(|e| e.to_string())?
        .list_templates()
        .map_err(|e| e.to_string())?;
    let selected_templates: Vec<CommandTemplate> = if template_ids.is_empty() {
        vec![]
    } else {
        all_templates
            .into_iter()
            .filter(|t| template_ids.contains(&t.template_id))
            .collect()
    };

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
            &selected_templates,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_plugin_import(
    state: tauri::State<AppState>,
    plugin_dir: String,
    repo_path: String,
) -> Result<PluginImportPreview, String> {
    let existing_template_ids: Vec<String> = state
        .template_engine
        .lock()
        .map_err(|e| e.to_string())?
        .list_templates()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|t| t.template_id.clone())
        .collect();

    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .preview_import(&plugin_dir, &repo_path, &existing_template_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_plugin(
    state: tauri::State<AppState>,
    plugin_dir: String,
    repo_path: String,
    mode: ImportMode,
) -> Result<(), String> {
    let template_engine = state.template_engine.lock().map_err(|e| e.to_string())?;
    state
        .plugin_manager
        .lock()
        .map_err(|e| e.to_string())?
        .import_plugin(&plugin_dir, &repo_path, mode, &template_engine)
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
