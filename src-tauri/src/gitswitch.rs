use std::process::Command;

// Git identity switcher — one-click toggle between personal and work global git config.
// Identities are hardcoded (owner's two git personas):
//   personal → jaskiring / personal@example.com
//   work     → work-user / work@example.com

const PERSONAL_NAME:  &str = "jaskiring";
const PERSONAL_EMAIL: &str = "personal@example.com";
const WORK_NAME:      &str = "work-user";
const WORK_EMAIL:     &str = "work@example.com";

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
    let (name, email) = match which.as_str() {
        "personal" => (PERSONAL_NAME, PERSONAL_EMAIL),
        "work"     => (WORK_NAME, WORK_EMAIL),
        other      => return Err(format!("unknown identity \"{other}\" — use \"personal\" or \"work\"")),
    };
    git_config_set("user.name", name)?;
    git_config_set("user.email", email)?;
    Ok((name.to_string(), email.to_string()))
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
