use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

// Open (or focus) a dedicated window pointed at an external web app — used for services with no
// usable API (WhatsApp Web, LinkedIn). The webview persists cookies/storage in the app's data dir,
// so the user scans the WhatsApp QR / logs in once and stays signed in across opens.
#[tauri::command]
pub fn open_web_window(
    app: tauri::AppHandle,
    label: String,
    url: String,
    title: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }
    let parsed: tauri::Url = url.parse().map_err(|_| format!("invalid url: {url}"))?;
    // Present as desktop Safari so Google/LinkedIn treat it like a real browser — Google blocks
    // OAuth ("Sign in with Google") from embedded webviews with a webview-ish user agent.
    const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(&title)
        .inner_size(width.unwrap_or(1040.0), height.unwrap_or(780.0))
        .user_agent(UA)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}
