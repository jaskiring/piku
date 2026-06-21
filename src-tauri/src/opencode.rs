use std::process::{Command, Stdio};
use std::path::PathBuf;

// Piku's "deep-thinking" brain runs on opencode's free capable models (e.g. deepseek-v4-flash-free)
// through a headless `opencode serve` HTTP API. This module just launches that server, in a
// dedicated Piku workspace, on a Piku-private port — the TS OpencodeProvider talks to it over HTTP.
// Auth/providers are opencode's own concern (the Zen free models need no key). Idempotent in
// practice: the frontend only calls this when the port isn't already reachable.

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

// Prefer the standard installer location (~/.opencode/bin/opencode); fall back to PATH.
fn opencode_bin() -> PathBuf {
    if let Some(p) = home().map(|h| h.join(".opencode/bin/opencode")) {
        if p.exists() {
            return p;
        }
    }
    PathBuf::from("opencode")
}

#[tauri::command]
pub fn start_opencode_server(port: u16) -> Result<String, String> {
    let bin = opencode_bin();
    // A stable workspace dir so opencode has a consistent cwd (and a home for an AGENTS.md later).
    let ws = home().map(|h| h.join(".piku-brain")).ok_or("no HOME dir")?;
    std::fs::create_dir_all(&ws).map_err(|e| e.to_string())?;

    Command::new(&bin)
        .args([
            "serve",
            "--port", &port.to_string(),
            "--hostname", "127.0.0.1",
        ])
        .current_dir(&ws)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to launch opencode at {}: {}", bin.display(), e))?;

    Ok(format!("opencode serve starting on 127.0.0.1:{port}"))
}
