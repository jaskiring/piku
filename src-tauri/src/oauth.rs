use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command;
use std::time::Duration;

// Desktop OAuth helpers. All three commands are ASYNC and offload their blocking work via
// spawn_blocking — a plain #[tauri::command] runs on the main thread, so the blocking loopback
// accept (up to 5 min) or a curl call would freeze the whole UI (and stop other commands like
// open_path from running). Google's token endpoint + APIs send no CORS headers, so we proxy them
// through curl in Rust rather than a webview fetch().

/// Listen on 127.0.0.1:port for the OAuth redirect and return the `code` query param.
#[tauri::command]
pub async fn oauth_listen(port: u16, timeout_secs: u64) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || oauth_listen_blocking(port, timeout_secs))
        .await
        .map_err(|e| e.to_string())?
}

/// POST application/x-www-form-urlencoded (OAuth token exchange / refresh).
#[tauri::command]
pub async fn http_post_form(url: String, body: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || post_form_blocking(&url, &body))
        .await
        .map_err(|e| e.to_string())?
}

/// GET with an optional Authorization header (Google APIs, e.g. Gmail).
#[tauri::command]
pub async fn http_get(url: String, authorization: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || get_blocking(&url, authorization.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

// ── blocking implementations (run on the blocking thread pool) ──────────────────

fn oauth_listen_blocking(port: u16, timeout_secs: u64) -> Result<String, String> {
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| format!("bind {port}: {e}"))?;
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs.max(30));
    listener.set_nonblocking(true).ok();
    let (mut stream, _) = loop {
        match listener.accept() {
            Ok(pair) => break pair,
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if std::time::Instant::now() > deadline {
                    return Err("timed out waiting for the Google redirect".into());
                }
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(e.to_string()),
        }
    };
    stream.set_nonblocking(false).ok();
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok();

    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let req = String::from_utf8_lossy(&buf[..n]);

    let target = req.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("");
    let query = target.split('?').nth(1).unwrap_or("");
    let mut code: Option<String> = None;
    let mut err: Option<String> = None;
    for kv in query.split('&') {
        let mut it = kv.splitn(2, '=');
        match (it.next(), it.next()) {
            (Some("code"), Some(v)) => code = Some(percent_decode(v)),
            (Some("error"), Some(v)) => err = Some(percent_decode(v)),
            _ => {}
        }
    }

    let body = "<!doctype html><html><body style=\"margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#04060c;color:#7dd3fc;font-family:ui-monospace,monospace\"><div style=\"text-align:center\"><div style=\"font-size:13px;letter-spacing:3px;opacity:.6\">PIKU</div><h2 style=\"font-weight:500\">Connected.</h2><p style=\"color:#9fb\">You can close this tab.</p></div></body></html>";
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();

    if let Some(e) = err {
        return Err(format!("Google returned an error: {e}"));
    }
    code.filter(|c| !c.is_empty()).ok_or_else(|| "no auth code in the redirect".into())
}

fn post_form_blocking(url: &str, body: &str) -> Result<String, String> {
    let out = Command::new("curl")
        .arg("-sS").arg("--max-time").arg("25")
        .arg("-X").arg("POST")
        .arg("-H").arg("Content-Type: application/x-www-form-urlencoded")
        .arg("--data").arg(body)
        .arg(url)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("curl POST failed ({:?}): {}", out.status.code(), String::from_utf8_lossy(&out.stderr)));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn get_blocking(url: &str, authorization: Option<&str>) -> Result<String, String> {
    let mut cmd = Command::new("curl");
    cmd.arg("-sS").arg("--max-time").arg("25").arg(url);
    if let Some(auth) = authorization {
        if !auth.is_empty() {
            cmd.arg("-H").arg(format!("Authorization: {auth}"));
        }
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("curl GET failed ({:?}): {}", out.status.code(), String::from_utf8_lossy(&out.stderr)));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

// Minimal percent-decoder (auth codes can contain %2F etc.).
fn percent_decode(s: &str) -> String {
    let bytes = s.replace('+', " ");
    let bytes = bytes.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&String::from_utf8_lossy(&bytes[i + 1..i + 3]), 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
