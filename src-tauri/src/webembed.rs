use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl};

// In-frame embedding (Tauri multi-webview, `unstable`). The workspace "chart paper" can show several
// real web apps at once (WhatsApp, LinkedIn, …), each as a draggable/resizable panel. Each panel is
// a child webview mounted in the main "overlay" window, identified by `label` (e.g. "wa", "li"), and
// repositioned to follow its DOM frame. Desktop Safari UA so embedded Google/site logins aren't blocked.

const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";
const MAIN: &str = "overlay";

// Track which embed webviews we've created so we can navigate vs. create.
static LIVE: Mutex<Option<HashMap<String, bool>>> = Mutex::new(None);

fn mark(label: &str) {
    let mut g = LIVE.lock().unwrap();
    g.get_or_insert_with(HashMap::new).insert(label.to_string(), true);
}
fn known(label: &str) -> bool {
    LIVE.lock().unwrap().as_ref().map(|m| m.contains_key(label)).unwrap_or(false)
}

#[tauri::command]
pub fn embed_panel(app: tauri::AppHandle, label: String, url: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    let parsed: tauri::Url = url.parse().map_err(|_| format!("invalid url: {url}"))?;
    let id = format!("embed-{label}");

    if let Some(wv) = app.get_webview(&id) {
        wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(w.max(1.0), h.max(1.0))).map_err(|e| e.to_string())?;
        let _ = wv.show();
        return Ok(());
    }
    let window = app.get_window(MAIN).ok_or_else(|| "main window not found".to_string())?;
    window
        .add_child(
            tauri::webview::WebviewBuilder::new(&id, WebviewUrl::External(parsed)).user_agent(UA),
            LogicalPosition::new(x, y),
            LogicalSize::new(w.max(1.0), h.max(1.0)),
        )
        .map_err(|e| e.to_string())?;
    mark(&id);
    Ok(())
}

#[tauri::command]
pub fn reposition_embed(app: tauri::AppHandle, label: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&format!("embed-{label}")) {
        wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(w.max(1.0), h.max(1.0))).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// Park a panel off-screen (reliable hide). Used while dragging and when leaving the workspace.
#[tauri::command]
pub fn hide_embed(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&format!("embed-{label}")) {
        let _ = wv.hide();
        let _ = wv.set_position(LogicalPosition::new(-10000.0, -10000.0));
    }
    Ok(())
}

// Hide every embed we've created (when navigating away from the workspace).
#[tauri::command]
pub fn hide_all_embeds(app: tauri::AppHandle) -> Result<(), String> {
    let labels: Vec<String> = LIVE.lock().unwrap().as_ref().map(|m| m.keys().cloned().collect()).unwrap_or_default();
    for id in labels {
        if let Some(wv) = app.get_webview(&id) {
            let _ = wv.hide();
            let _ = wv.set_position(LogicalPosition::new(-10000.0, -10000.0));
        }
    }
    let _ = known; // keep helper referenced
    Ok(())
}
