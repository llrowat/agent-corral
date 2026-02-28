use crate::command_templates::CommandTemplate;
use crate::AppState;
use std::collections::HashMap;

#[tauri::command]
pub fn list_templates(state: tauri::State<AppState>) -> Result<Vec<CommandTemplate>, String> {
    state
        .template_engine
        .lock()
        .map_err(|e| e.to_string())?
        .list_templates()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_template(
    state: tauri::State<AppState>,
    template: CommandTemplate,
) -> Result<(), String> {
    state
        .template_engine
        .lock()
        .map_err(|e| e.to_string())?
        .save_template(&template)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_template(state: tauri::State<AppState>, template_id: String) -> Result<(), String> {
    state
        .template_engine
        .lock()
        .map_err(|e| e.to_string())?
        .delete_template(&template_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn render_template(
    template: CommandTemplate,
    vars: HashMap<String, String>,
) -> Result<String, String> {
    crate::command_templates::TemplateEngine::render(&template, &vars).map_err(|e| e.to_string())
}
