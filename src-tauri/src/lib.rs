mod hotkey_manager;
mod ipc;
mod observer;
mod os_tools;
mod tts;
mod tray_manager;
mod window_manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            window_manager::show_overlay,
            window_manager::hide_overlay,
            observer::active_window,
            os_tools::open_app,
            os_tools::open_path,
            os_tools::open_in_app,
            os_tools::list_dir,
            os_tools::fetch_url,
            os_tools::web_headlines,
            tts::piper_speak,
            tts::piper_available,
        ])
        .setup(|app| {
            tray_manager::create(app.handle())?;
            hotkey_manager::register(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running piku");
}
