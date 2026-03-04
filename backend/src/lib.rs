mod claude_adapter;
#[cfg(feature = "tauri-app")]
mod commands;
mod pack_manager;
mod plugin_manager;
mod preferences;
mod repo_registry;

#[cfg(feature = "tauri-app")]
use pack_manager::PackManager;
#[cfg(feature = "tauri-app")]
use plugin_manager::PluginManager;
#[cfg(feature = "tauri-app")]
use preferences::PreferencesManager;
#[cfg(feature = "tauri-app")]
use repo_registry::RepoRegistry;
#[cfg(feature = "tauri-app")]
use std::sync::Mutex;

#[cfg(feature = "tauri-app")]
pub struct AppState {
    pub repo_registry: Mutex<RepoRegistry>,
    pub pack_manager: Mutex<PackManager>,
    pub plugin_manager: Mutex<PluginManager>,
    pub preferences: Mutex<PreferencesManager>,
}

#[cfg(feature = "tauri-app")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("AgentCorral");

    std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
    std::fs::create_dir_all(app_data_dir.join("packs")).expect("Failed to create packs dir");
    std::fs::create_dir_all(app_data_dir.join("packs/library"))
        .expect("Failed to create library dir");
    std::fs::create_dir_all(app_data_dir.join("plugins")).expect("Failed to create plugins dir");
    std::fs::create_dir_all(app_data_dir.join("plugins/library"))
        .expect("Failed to create plugins library dir");

    let db_path = app_data_dir.join("repos.db");
    let packs_dir = app_data_dir.join("packs");
    let packs_library_dir = app_data_dir.join("packs/library");
    let plugins_dir = app_data_dir.join("plugins");
    let plugins_library_dir = app_data_dir.join("plugins/library");

    let repo_registry = RepoRegistry::new(&db_path).expect("Failed to initialize repo registry");
    let pack_manager = PackManager::new(packs_dir, packs_library_dir);
    let plugin_manager = PluginManager::new(plugins_dir, plugins_library_dir);
    let preferences_manager = PreferencesManager::new(&app_data_dir);

    let state = AppState {
        repo_registry: Mutex::new(repo_registry),
        pack_manager: Mutex::new(pack_manager),
        plugin_manager: Mutex::new(plugin_manager),
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
            commands::claude::get_known_tools_with_mcp,
            commands::claude::prepare_ai_command,
            commands::claude::launch_terminal,
            commands::claude::is_process_alive,
            commands::claude::read_claude_md,
            commands::claude::list_claude_md_files,
            commands::claude::list_markdown_references,
            commands::claude::save_config_snapshot,
            commands::claude::list_config_snapshots,
            commands::claude::restore_config_snapshot,
            commands::claude::delete_config_snapshot,
            commands::claude::export_config_bundle,
            commands::claude::import_config_bundle,
            commands::claude::scan_project_config,
            // Enable/disable toggle commands
            commands::claude::toggle_agent_enabled,
            commands::claude::toggle_skill_enabled,
            commands::claude::list_disabled_agents,
            commands::claude::list_disabled_skills,
            commands::claude::lint_config,
            // Preferences commands
            commands::preferences::get_preferences,
            commands::preferences::get_platform,
            // Hooks commands
            commands::hooks::read_hooks,
            commands::hooks::write_hooks,
            commands::hooks::reorder_hook_groups,
            commands::hooks::toggle_hook_group_enabled,
            // Skills commands
            commands::skills::read_skills,
            commands::skills::write_skill,
            commands::skills::delete_skill,
            // MCP commands
            commands::mcp::read_mcp_servers,
            commands::mcp::write_mcp_server,
            commands::mcp::delete_mcp_server,
            commands::mcp::check_mcp_health,
            commands::mcp::toggle_mcp_server_enabled,
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
            // Plugin sync commands
            commands::plugin::get_import_sync_status,
            commands::plugin::sync_imported_plugin,
            commands::plugin::auto_sync_repo,
            commands::plugin::set_import_pinned,
            commands::plugin::set_import_auto_sync,
            commands::plugin::remove_import_record,
            commands::plugin::auto_update_library,
            commands::plugin::read_import_registry,
            commands::plugin::set_plugin_sync_interval,
            commands::plugin::get_plugin_sync_interval,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
