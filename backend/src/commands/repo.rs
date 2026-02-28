use crate::repo_registry::{Repo, RepoStatus, RepoRegistry};
use crate::AppState;

#[tauri::command]
pub fn add_repo(state: tauri::State<AppState>, path: String) -> Result<Repo, String> {
    state
        .repo_registry
        .lock()
        .map_err(|e| e.to_string())?
        .add_repo(&path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_repo(state: tauri::State<AppState>, repo_id: String) -> Result<(), String> {
    state
        .repo_registry
        .lock()
        .map_err(|e| e.to_string())?
        .remove_repo(&repo_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_repos(state: tauri::State<AppState>) -> Result<Vec<Repo>, String> {
    state
        .repo_registry
        .lock()
        .map_err(|e| e.to_string())?
        .list_repos()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_repo_status(path: String) -> RepoStatus {
    RepoRegistry::get_repo_status(&path)
}
