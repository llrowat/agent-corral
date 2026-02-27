mod commands;
mod claude_adapter;
mod repo_registry;
mod session_manager;
mod terminal_launcher;

use repo_registry::RepoRegistry;
use session_manager::SessionManager;
use std::sync::Mutex;

pub struct AppState {
    pub repo_registry: Mutex<RepoRegistry>,
    pub session_manager: Mutex<SessionManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("AgentCorral");

    std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
    std::fs::create_dir_all(app_data_dir.join("sessions")).expect("Failed to create sessions dir");
    std::fs::create_dir_all(app_data_dir.join("packs/library")).expect("Failed to create packs dir");
    std::fs::create_dir_all(app_data_dir.join("packs/cache")).expect("Failed to create packs cache dir");

    let db_path = app_data_dir.join("repos.db");
    let sessions_dir = app_data_dir.join("sessions");

    let repo_registry = RepoRegistry::new(&db_path).expect("Failed to initialize repo registry");
    let session_manager =
        SessionManager::new(sessions_dir).expect("Failed to initialize session manager");

    let state = AppState {
        repo_registry: Mutex::new(repo_registry),
        session_manager: Mutex::new(session_manager),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::repo::add_repo,
            commands::repo::remove_repo,
            commands::repo::list_repos,
            commands::repo::get_repo_status,
            commands::session::list_sessions,
            commands::session::get_session,
            commands::session::read_session_log,
            commands::claude::detect_claude_config,
            commands::claude::read_claude_config,
            commands::claude::write_claude_config,
            commands::claude::read_agents,
            commands::claude::write_agent,
            commands::claude::delete_agent,
            commands::claude::read_memory_stores,
            commands::claude::read_memory_entries,
            commands::claude::write_memory_entry,
            commands::claude::reset_memory,
            commands::terminal::launch_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
