use crate::pack_manager::{ImportMode, ImportPreview, PackContents, PackSummary};
use crate::AppState;

#[tauri::command]
pub fn list_packs(state: tauri::State<AppState>) -> Result<Vec<PackSummary>, String> {
    state
        .pack_manager
        .lock()
        .map_err(|e| e.to_string())?
        .list_packs()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_pack(
    state: tauri::State<AppState>,
    repo_path: String,
    name: String,
    description: String,
    author: Option<String>,
    include_config: bool,
    agent_ids: Vec<String>,
) -> Result<String, String> {
    state
        .pack_manager
        .lock()
        .map_err(|e| e.to_string())?
        .export_pack(
            &repo_path,
            &name,
            &description,
            author.as_deref(),
            include_config,
            &agent_ids,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn preview_import(
    state: tauri::State<AppState>,
    pack_path: String,
    repo_path: String,
) -> Result<ImportPreview, String> {
    state
        .pack_manager
        .lock()
        .map_err(|e| e.to_string())?
        .preview_import(&pack_path, &repo_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_pack(
    state: tauri::State<AppState>,
    pack_path: String,
    repo_path: String,
    mode: ImportMode,
) -> Result<(), String> {
    state
        .pack_manager
        .lock()
        .map_err(|e| e.to_string())?
        .import_pack(&pack_path, &repo_path, mode)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_pack(state: tauri::State<AppState>, pack_path: String) -> Result<(), String> {
    state
        .pack_manager
        .lock()
        .map_err(|e| e.to_string())?
        .delete_pack(&pack_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_pack(state: tauri::State<AppState>, pack_path: String) -> Result<PackContents, String> {
    state
        .pack_manager
        .lock()
        .map_err(|e| e.to_string())?
        .read_pack(&pack_path)
        .map_err(|e| e.to_string())
}
