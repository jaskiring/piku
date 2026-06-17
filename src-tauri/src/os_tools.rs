use std::path::PathBuf;
use std::process::Command;

// Agent OS-control tools (ported in spirit from Mark-XL). v1 is the SAFE set: open apps, open
// files/URLs/folders, and list directories confined to the user's home. Destructive ops
// (delete, arbitrary shell/code execution) are intentionally NOT here — they belong behind the
// approval surface (P6: every irreversible action confirmed). macOS-first; other OSes are follow-ups.

fn home() -> Result<PathBuf, String> {
    let h = std::env::var("HOME").map_err(|_| "no HOME".to_string())?;
    PathBuf::from(h).canonicalize().map_err(|e| e.to_string())
}

/// Open (or focus) an application by name — macOS `open -a <name>`.
/// Resolves friendly names ("Chrome" → "Google Chrome") via an alias map, then a fuzzy scan of
/// installed apps, so the small model's loose names still work.
#[tauri::command]
pub fn open_app(name: String) -> Result<String, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("no app name given".into());
    }
    #[cfg(target_os = "macos")]
    {
        // 1) try the alias-resolved name, 2) fall back to a fuzzy match against installed apps.
        let resolved = resolve_alias(&name);
        if try_open_app(&resolved) {
            return Ok(format!("Opened {resolved}."));
        }
        if let Some(found) = find_installed_app(&name) {
            if try_open_app(&found) {
                return Ok(format!("Opened {found}."));
            }
        }
        Err(format!("Couldn't find an app named \"{name}\" on this Mac."))
    }
    #[cfg(not(target_os = "macos"))]
    { Err("open_app is macOS-only for now".into()) }
}

/// Open a URL / file / folder in a SPECIFIC app — e.g. a Google search in Chrome.
/// macOS `open -a <app> <target>`. Resolves the app name like open_app.
#[tauri::command]
pub fn open_in_app(app: String, target: String) -> Result<String, String> {
    let app = app.trim().to_string();
    let target = target.trim().to_string();
    if app.is_empty() || target.is_empty() {
        return Err("need both an app and a target".into());
    }
    #[cfg(target_os = "macos")]
    {
        let resolved = resolve_alias(&app);
        if try_open_in(&resolved, &target) {
            return Ok(format!("Opened {target} in {resolved}."));
        }
        if let Some(found) = find_installed_app(&app) {
            if try_open_in(&found, &target) {
                return Ok(format!("Opened {target} in {found}."));
            }
        }
        Err(format!("Couldn't open {target} in \"{app}\"."))
    }
    #[cfg(not(target_os = "macos"))]
    { Err("open_in_app is macOS-only for now".into()) }
}

#[cfg(target_os = "macos")]
fn try_open_in(app: &str, target: &str) -> bool {
    Command::new("open").arg("-a").arg(app).arg(target).status().map(|s| s.success()).unwrap_or(false)
}

/// Fetch a URL via curl and return readable text (HTML tags stripped, capped). Powers web-read
/// so Piku can actually summarise search results / a page — network egress, used only on request.
#[tauri::command]
pub fn fetch_url(url: String) -> Result<String, String> {
    let url = url.trim().to_string();
    if !url.starts_with("http") {
        return Err("invalid url".into());
    }
    let out = Command::new("curl")
        .arg("-sL")
        .arg("--max-time").arg("15")
        .arg("-A").arg("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Piku/0.1")
        .arg(&url)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("fetch failed (curl {:?})", out.status.code()));
    }
    let html = String::from_utf8_lossy(&out.stdout);
    let text: String = strip_html(&html).chars().take(6000).collect();
    Ok(text)
}

/// Fetch clean current headlines for a query via Google News RSS (titles only — no page junk).
#[tauri::command]
pub fn web_headlines(query: String) -> Result<Vec<String>, String> {
    let q = query.trim();
    if q.is_empty() { return Err("empty query".into()); }
    let enc = q.split_whitespace().collect::<Vec<_>>().join("+");
    let url = format!("https://news.google.com/rss/search?q={enc}&hl=en-US&gl=US&ceid=US:en");
    let out = Command::new("curl")
        .arg("-sL").arg("--max-time").arg("15")
        .arg("-A").arg("Mozilla/5.0 (Macintosh) Piku/0.1")
        .arg(&url)
        .output().map_err(|e| e.to_string())?;
    if !out.status.success() { return Err("news fetch failed".into()); }
    let xml = String::from_utf8_lossy(&out.stdout);

    let mut titles: Vec<String> = Vec::new();
    let mut rest: &str = xml.as_ref();
    while let Some(s) = rest.find("<title>") {
        let after = &rest[s + 7..];
        match after.find("</title>") {
            Some(e) => {
                let raw = after[..e].trim().trim_start_matches("<![CDATA[").trim_end_matches("]]>").trim();
                let decoded = raw
                    .replace("&amp;", "&").replace("&#39;", "'").replace("&apos;", "'")
                    .replace("&quot;", "\"").replace("&lt;", "<").replace("&gt;", ">");
                titles.push(decoded);
                rest = &after[e + 8..];
            }
            None => break,
        }
    }
    // first <title> is the feed name ("…- Google News"); keep real article titles only.
    let cleaned: Vec<String> = titles.into_iter()
        .filter(|t| !t.trim().is_empty() && t != "Google News" && !t.ends_with("- Google News"))
        .take(10)
        .collect();
    if cleaned.is_empty() { return Err("no headlines found".into()); }
    Ok(cleaned)
}

/// Crude HTML → text: drop tags, collapse whitespace. Good enough for the model to read results.
fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 2);
    let mut depth: i32 = 0;
    for c in html.chars() {
        if c == '<' {
            depth += 1;
        } else if c == '>' {
            if depth > 0 { depth -= 1; }
            out.push(' ');
        } else if depth == 0 {
            out.push(c);
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(target_os = "macos")]
fn try_open_app(name: &str) -> bool {
    Command::new("open").arg("-a").arg(name).status().map(|s| s.success()).unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn resolve_alias(name: &str) -> String {
    match name.trim().to_lowercase().as_str() {
        "chrome" | "google chrome"            => "Google Chrome",
        "code" | "vscode" | "vs code"         => "Visual Studio Code",
        "whatsapp" | "whats app"              => "WhatsApp",
        "vlc"                                 => "VLC",
        "calc" | "calculator"                 => "Calculator",
        "settings" | "system settings"        => "System Settings",
        "music" | "apple music"               => "Music",
        "browser"                             => "Safari",
        _ => return name.trim().to_string(),
    }.to_string()
}

/// Case-insensitive substring match against .app bundles in the standard locations.
#[cfg(target_os = "macos")]
fn find_installed_app(query: &str) -> Option<String> {
    let q = query.trim().to_lowercase();
    if q.is_empty() { return None; }
    let dirs = ["/Applications", "/System/Applications", "/Applications/Utilities"];
    for dir in dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for e in entries.flatten() {
                let fname = e.file_name().to_string_lossy().to_string();
                if let Some(stem) = fname.strip_suffix(".app") {
                    if stem.to_lowercase().contains(&q) {
                        return Some(stem.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Open a file, folder, or URL with the system default — macOS `open <target>`.
#[tauri::command]
pub fn open_path(target: String) -> Result<String, String> {
    let target = target.trim().to_string();
    if target.is_empty() {
        return Err("no target given".into());
    }
    #[cfg(target_os = "macos")]
    {
        let ok = Command::new("open").arg(&target).status().map_err(|e| e.to_string())?;
        if ok.success() { Ok(format!("Opened {target}.")) } else { Err(format!("Could not open {target}.")) }
    }
    #[cfg(not(target_os = "macos"))]
    { Err("open_path is macOS-only for now".into()) }
}

/// List directory entries (names only), confined to the user's home directory.
/// Rejects any path that resolves outside home — no traversal (safety envelope from Mark-XL).
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<String>, String> {
    let home = home()?;
    let target = if path.trim().is_empty() {
        home.clone()
    } else {
        let p = PathBuf::from(path.trim());
        if p.is_absolute() { p } else { home.join(p) }
    };
    let canon = target.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(&home) {
        return Err("refused: that path is outside your home directory".into());
    }
    let mut out: Vec<String> = Vec::new();
    for entry in std::fs::read_dir(&canon).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue; // skip hidden/system entries
        }
        let suffix = if entry.path().is_dir() { "/" } else { "" };
        out.push(format!("{name}{suffix}"));
        if out.len() >= 100 {
            break;
        }
    }
    out.sort();
    Ok(out)
}
