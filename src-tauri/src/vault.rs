use std::fs;
use std::path::PathBuf;

// Obsidian-readable runtime vault under ~/Documents/Piku-Vault/ with projects/, brainstorms/ and
// executes/. Each entry folder is a persistent "brain" — its GDD (gdd.md), knowledge graph
// (graph.json) and accumulated sessions (sessions.md) — that Piku writes on each turn and reads back
// as context, so nothing is lost across prompts. Plain files so Obsidian opens the vault directly.

fn vault_base() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "no HOME env".to_string())?;
    Ok(PathBuf::from(home).join("Documents").join("Piku-Vault"))
}

fn valid_category(c: &str) -> bool {
    matches!(c, "projects" | "brainstorms" | "executes")
}

/// Create the vault base + the three category folders if missing; return the base path.
#[tauri::command]
pub fn vault_ensure() -> Result<String, String> {
    let base = vault_base()?;
    for c in ["projects", "brainstorms", "executes"] {
        fs::create_dir_all(base.join(c)).map_err(|e| e.to_string())?;
    }
    Ok(base.to_string_lossy().to_string())
}

/// Write `content` to ~/Documents/Piku-Vault/<category>/<slug>/<filename> (dirs created as needed).
#[tauri::command]
pub fn vault_write(category: String, slug: String, filename: String, content: String) -> Result<(), String> {
    if !valid_category(&category) {
        return Err(format!("invalid category: {category}"));
    }
    let dir = vault_base()?.join(&category).join(&slug);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(&filename), content).map_err(|e| e.to_string())
}

/// Read ~/Documents/Piku-Vault/<category>/<slug>/<filename>; Err if missing.
#[tauri::command]
pub fn vault_read(category: String, slug: String, filename: String) -> Result<String, String> {
    if !valid_category(&category) {
        return Err(format!("invalid category: {category}"));
    }
    let path = vault_base()?.join(&category).join(&slug).join(&filename);
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// List the entry-slug folder names under a category (sorted; empty if none).
#[tauri::command]
pub fn vault_list(category: String) -> Result<Vec<String>, String> {
    if !valid_category(&category) {
        return Err(format!("invalid category: {category}"));
    }
    let dir = vault_base()?.join(&category);
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.flatten() {
            if e.path().is_dir() {
                if let Some(n) = e.file_name().to_str() {
                    out.push(n.to_string());
                }
            }
        }
    }
    out.sort();
    Ok(out)
}
