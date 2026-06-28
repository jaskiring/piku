use std::process::Command;

// Git identity switcher — one-click toggle between personal and work global git config.
// Identities are loaded at runtime from ~/.piku/identity.json (gitignored, machine-local).
// Falls back to neutral placeholders when the file is absent or unparseable.

fn load_identity() -> (String, String, String, String) {
    let path = dirs_or_home().join(".piku").join("identity.json");
    let fallback = (
        "personal-user".to_string(),
        "personal@example.com".to_string(),
        "work-user".to_string(),
        "work@example.com".to_string(),
    );
    let Ok(raw) = std::fs::read_to_string(&path) else { return fallback };
    let Ok(v)   = serde_json::from_str::<serde_json::Value>(&raw) else { return fallback };
    let str_field = |key: &str| -> String {
        v.get(key).and_then(|x| x.as_str()).unwrap_or("").to_string()
    };
    let pn = str_field("personalName");
    let pe = str_field("personalEmail");
    let wn = str_field("workName");
    let we = str_field("workEmail");
    if pn.is_empty() || pe.is_empty() || wn.is_empty() || we.is_empty() {
        return fallback;
    }
    (pn, pe, wn, we)
}

fn dirs_or_home() -> std::path::PathBuf {
    std::env::var("HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("/tmp"))
}

fn git_config_get(key: &str) -> String {
    Command::new("git")
        .args(["config", "--global", key])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

fn git_config_set(key: &str, value: &str) -> Result<(), String> {
    let status = Command::new("git")
        .args(["config", "--global", key, value])
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err(format!("git config returned {status}")) }
}

/// Return the current global git identity as (name, email).
/// Returns empty strings when not set — does not error on unset keys.
#[tauri::command]
pub fn git_identity_get() -> Result<(String, String), String> {
    Ok((git_config_get("user.name"), git_config_get("user.email")))
}

/// Set the global git identity. `which` must be "personal" or "work".
/// Returns the newly-applied (name, email).
#[tauri::command]
pub fn git_identity_set(which: String) -> Result<(String, String), String> {
    let (personal_name, personal_email, work_name, work_email) = load_identity();
    let (name, email) = match which.as_str() {
        "personal" => (personal_name, personal_email),
        "work"     => (work_name, work_email),
        other      => return Err(format!("unknown identity \"{other}\" — use \"personal\" or \"work\"")),
    };
    git_config_set("user.name", &name)?;
    git_config_set("user.email", &email)?;
    Ok((name, email))
}

/// Run `git push` in the given directory. Returns combined stdout+stderr.
/// Errors if the process cannot be spawned or exits non-zero.
#[tauri::command]
pub fn git_push_current(dir: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["-C", &dir, "push"])
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{stdout}{stderr}").trim().to_string();
    if output.status.success() {
        Ok(combined)
    } else {
        Err(combined)
    }
}
