use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

// Local neural TTS via Piper (rhasspy), run through the arm64-native `piper-tts` Python package
// in ~/.piku/py (the prebuilt macOS binary ships without its dylibs, so it can't run). Synthesises
// the amy voice to a temp WAV and plays it with macOS `afplay`. Returns Err if not installed — the
// frontend then falls back to the macOS voice, so this is safe before setup.

fn home() -> Result<PathBuf, String> {
    std::env::var("HOME").map(PathBuf::from).map_err(|_| "no HOME".to_string())
}

fn python() -> PathBuf { home().map(|h| h.join(".piku/py/bin/python")).unwrap_or_default() }
fn model()  -> PathBuf { home().map(|h| h.join(".piku/voices/en_US-amy-medium.onnx")).unwrap_or_default() }

#[tauri::command]
pub fn piper_available() -> bool {
    python().exists() && model().exists()
}

#[tauri::command]
pub fn piper_speak(text: String) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() { return Ok(()); }

    let py = python();
    let m  = model();
    if !py.exists() || !m.exists() {
        return Err("piper-tts (python) or voice model not installed".into());
    }

    let wav = std::env::temp_dir().join("piku_tts.wav");

    // synthesize: text on stdin → WAV via piper-tts
    let mut child = Command::new(&py)
        .arg("-m").arg("piper")
        .arg("--model").arg(&m)
        .arg("--output_file").arg(&wav)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("piper spawn failed: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        // stdin drops here → EOF, piper finishes synthesising
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("piper synthesis failed".into());
    }

    // play it
    let played = Command::new("afplay").arg(&wav).status().map_err(|e| e.to_string())?;
    if !played.success() {
        return Err("audio playback failed".into());
    }
    Ok(())
}
