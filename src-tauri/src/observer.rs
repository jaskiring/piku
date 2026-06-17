use std::process::Command;

/// Active-app observer (Sprint 3 — the observation loop's first sense).
/// Returns the frontmost application's name + (best-effort) front-window title as
/// "app||title". On macOS this uses System Events, so the FIRST call triggers an
/// Automation permission prompt — that consent is the point (K4: no observation without opt-in).
/// Returns an empty string (not an error) when nothing can be read, so the observer degrades quietly.
#[tauri::command]
pub fn active_window() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"
            set appName to ""
            set winTitle to ""
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
                set appName to name of frontApp
                try
                    set winTitle to name of front window of frontApp
                end try
            end tell
            return appName & "||" & winTitle
        "#;
        let out = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            // Permission denied / no front app — quiet empty result, not a hard error.
            return Ok(String::new());
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Windows/Linux active-window readers are a follow-up.
        Ok(String::new())
    }
}
