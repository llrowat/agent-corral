mod claude_adapter;
mod command_templates;
mod commands;
mod pack_manager;
mod plugin_manager;
mod preferences;
mod repo_registry;
mod session_manager;
mod terminal_launcher;

use command_templates::TemplateEngine;
use pack_manager::PackManager;
use plugin_manager::PluginManager;
use preferences::PreferencesManager;
use repo_registry::RepoRegistry;
use session_manager::SessionManager;
use std::sync::Mutex;

pub struct AppState {
    pub repo_registry: Mutex<RepoRegistry>,
    pub session_manager: Mutex<SessionManager>,
    pub pack_manager: Mutex<PackManager>,
    pub plugin_manager: Mutex<PluginManager>,
    pub template_engine: Mutex<TemplateEngine>,
    pub preferences: Mutex<PreferencesManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("AgentCorral");

    std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
    std::fs::create_dir_all(app_data_dir.join("sessions"))
        .expect("Failed to create sessions dir");
    std::fs::create_dir_all(app_data_dir.join("worktrees"))
        .expect("Failed to create worktrees dir");
    std::fs::create_dir_all(app_data_dir.join("packs")).expect("Failed to create packs dir");
    std::fs::create_dir_all(app_data_dir.join("packs/library"))
        .expect("Failed to create library dir");
    std::fs::create_dir_all(app_data_dir.join("plugins")).expect("Failed to create plugins dir");
    std::fs::create_dir_all(app_data_dir.join("plugins/library"))
        .expect("Failed to create plugins library dir");

    let db_path = app_data_dir.join("repos.db");
    let sessions_dir = app_data_dir.join("sessions");
    let worktrees_dir = app_data_dir.join("worktrees");
    let packs_dir = app_data_dir.join("packs");
    let packs_library_dir = app_data_dir.join("packs/library");
    let plugins_dir = app_data_dir.join("plugins");
    let plugins_library_dir = app_data_dir.join("plugins/library");

    let repo_registry = RepoRegistry::new(&db_path).expect("Failed to initialize repo registry");
    let session_manager = SessionManager::new(sessions_dir, worktrees_dir)
        .expect("Failed to initialize session manager");
    let pack_manager = PackManager::new(packs_dir, packs_library_dir);
    let plugin_manager = PluginManager::new(plugins_dir, plugins_library_dir);
    let template_engine = TemplateEngine::new(&app_data_dir);
    let preferences_manager = PreferencesManager::new(&app_data_dir);

    let state = AppState {
        repo_registry: Mutex::new(repo_registry),
        session_manager: Mutex::new(session_manager),
        pack_manager: Mutex::new(pack_manager),
        plugin_manager: Mutex::new(plugin_manager),
        template_engine: Mutex::new(template_engine),
        preferences: Mutex::new(preferences_manager),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            // Repo commands
            commands::repo::add_repo,
            commands::repo::remove_repo,
            commands::repo::list_repos,
            commands::repo::get_repo_status,
            // Session commands
            commands::session::list_sessions,
            commands::session::poll_session_states,
            commands::session::delete_session,
            commands::session::focus_session,
            // Claude adapter commands
            commands::claude::get_claude_home,
            commands::claude::detect_claude_config,
            commands::claude::read_claude_config,
            commands::claude::write_claude_config,
            commands::claude::read_agents,
            commands::claude::write_agent,
            commands::claude::delete_agent,
            commands::claude::read_memory_stores,
            commands::claude::create_memory_store,
            commands::claude::read_memory_entries,
            commands::claude::write_memory_entry,
            commands::claude::update_memory_entry,
            commands::claude::delete_memory_entry,
            commands::claude::delete_memory_store,
            commands::claude::reset_memory,
            commands::claude::get_known_tools,
            // Terminal commands
            commands::terminal::launch_session,
            commands::terminal::resume_session,
            commands::terminal::open_session_folder,
            // Preferences commands
            commands::preferences::get_preferences,
            commands::preferences::set_terminal_preference,
            commands::preferences::get_platform,
            // Hooks commands
            commands::hooks::read_hooks,
            commands::hooks::write_hooks,
            // Skills commands
            commands::skills::read_skills,
            commands::skills::write_skill,
            commands::skills::delete_skill,
            // MCP commands
            commands::mcp::read_mcp_servers,
            commands::mcp::write_mcp_server,
            commands::mcp::delete_mcp_server,
            // Pack commands (legacy, kept for migration)
            commands::pack::list_packs,
            commands::pack::export_pack,
            commands::pack::preview_import,
            commands::pack::import_pack,
            commands::pack::delete_pack,
            commands::pack::read_pack,
            commands::pack::install_pack_from_git,
            commands::pack::check_pack_updates,
            commands::pack::update_pack,
            // Plugin commands
            commands::plugin::list_plugins,
            commands::plugin::export_plugin,
            commands::plugin::preview_plugin_import,
            commands::plugin::import_plugin,
            commands::plugin::delete_plugin,
            commands::plugin::read_plugin,
            commands::plugin::install_plugin_from_git,
            commands::plugin::check_plugin_updates,
            commands::plugin::update_plugin,
            commands::plugin::migrate_agentpack,
            // Template commands
            commands::template::list_templates,
            commands::template::save_template,
            commands::template::delete_template,
            commands::template::render_template,
            // Worktree commands
            commands::worktree::get_worktree_status,
            commands::worktree::get_worktree_diff,
            commands::worktree::list_branches,
            commands::worktree::merge_worktree_branch,
            commands::worktree::prune_worktrees,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
