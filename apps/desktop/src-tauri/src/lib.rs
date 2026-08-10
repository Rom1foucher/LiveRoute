use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
};
use tauri::Manager;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureWindow {
    key: String,
    title: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    minimized: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureFrame {
    window: CaptureWindow,
    data_url: String,
    image_width: u32,
    image_height: u32,
    captured_at: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DecisionLogStatus {
    path: String,
    storage: String,
    exists: bool,
    size_bytes: u64,
}

fn prepare_log_file(path: PathBuf) -> Result<PathBuf, String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Le dossier du journal est invalide.".to_string())?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    Ok(path)
}

fn portable_decision_log_file() -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let directory = executable
        .parent()
        .ok_or_else(|| "Le dossier de l’exécutable est introuvable.".to_string())?
        .join("logs");
    prepare_log_file(directory.join("decision.ndjson"))
}

fn app_decision_log_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    prepare_log_file(directory.join("decision.ndjson"))
}

fn decision_log_file(app: &tauri::AppHandle) -> Result<(PathBuf, &'static str), String> {
    match portable_decision_log_file() {
        Ok(path) => Ok((path, "portable")),
        Err(portable_error) => app_decision_log_file(app)
            .map(|path| (path, "app-log"))
            .map_err(|fallback_error| {
                format!(
                    "Journal inaccessible près de l’exécutable ({portable_error}) et dans AppData ({fallback_error})."
                )
            }),
    }
}

fn decision_log_status_for(path: &PathBuf, storage: &str) -> Result<DecisionLogStatus, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    Ok(DecisionLogStatus {
        path: path.to_string_lossy().to_string(),
        storage: storage.to_string(),
        exists: path.exists(),
        size_bytes: metadata.len(),
    })
}

fn rotated_log_file(path: &PathBuf) -> PathBuf {
    path.with_file_name("decision.previous.ndjson")
}

#[tauri::command]
fn initialize_decision_log(app: tauri::AppHandle) -> Result<DecisionLogStatus, String> {
    let (path, storage) = decision_log_file(&app)?;
    decision_log_status_for(&path, storage)
}

#[tauri::command]
fn append_decision_log(
    app: tauri::AppHandle,
    line: String,
) -> Result<DecisionLogStatus, String> {
    let (path, storage) = decision_log_file(&app)?;
    if let Ok(metadata) = fs::metadata(&path) {
        if metadata.len() > 8 * 1024 * 1024 {
            let rotated = rotated_log_file(&path);
            let _ = fs::remove_file(&rotated);
            fs::rename(&path, &rotated).map_err(|error| error.to_string())?;
        }
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{}", line).map_err(|error| error.to_string())?;
    file.flush().map_err(|error| error.to_string())?;
    decision_log_status_for(&path, storage)
}

#[tauri::command]
fn decision_log_status(app: tauri::AppHandle) -> Result<DecisionLogStatus, String> {
    initialize_decision_log(app)
}

#[tauri::command]
fn read_decision_log(app: tauri::AppHandle) -> Result<String, String> {
    let (path, _) = decision_log_file(&app)?;
    let rotated = rotated_log_file(&path);
    let mut content = String::new();
    if rotated.exists() {
        content.push_str(
            &fs::read_to_string(&rotated).map_err(|error| error.to_string())?,
        );
    }
    if path.exists() {
        content.push_str(
            &fs::read_to_string(&path).map_err(|error| error.to_string())?,
        );
    }
    Ok(content)
}

#[tauri::command]
fn clear_decision_log(app: tauri::AppHandle) -> Result<DecisionLogStatus, String> {
    let (path, storage) = decision_log_file(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    let rotated = rotated_log_file(&path);
    if rotated.exists() {
        fs::remove_file(rotated).map_err(|error| error.to_string())?;
    }
    prepare_log_file(path.clone())?;
    decision_log_status_for(&path, storage)
}

#[tauri::command]
fn open_decision_log_folder(app: tauri::AppHandle) -> Result<(), String> {
    let (path, _) = decision_log_file(&app)?;
    let directory = path
        .parent()
        .ok_or_else(|| "Le dossier du journal est invalide.".to_string())?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(directory)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(directory)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(directory)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("Ouverture du dossier non supportée sur cette plateforme.".to_string())
}

#[cfg(target_os = "windows")]
mod capture {
    use std::{
        io::Cursor,
        time::{SystemTime, UNIX_EPOCH},
    };

    use base64::{engine::general_purpose::STANDARD, Engine};
    use image::{DynamicImage, ImageFormat};
    use xcap::Window;

    use super::{CaptureFrame, CaptureWindow};

    fn describe(window: &Window) -> Result<CaptureWindow, String> {
        let title = window.title().map_err(|error| error.to_string())?;
        let width = window.width().map_err(|error| error.to_string())?;
        let height = window.height().map_err(|error| error.to_string())?;
        Ok(CaptureWindow {
            /*
             * Umamusume has a unique window title. Keeping the key title-based
             * also survives moving the client between monitors. If another app
             * has the same title, the first visible match is intentionally used.
             */
            key: title.clone(),
            title,
            x: window.x().map_err(|error| error.to_string())?,
            y: window.y().map_err(|error| error.to_string())?,
            width,
            height,
            minimized: window
                .is_minimized()
                .map_err(|error| error.to_string())?,
        })
    }

    pub fn list() -> Result<Vec<CaptureWindow>, String> {
        let mut result = Window::all()
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter_map(|window| describe(&window).ok())
            .filter(|window| {
                !window.title.trim().is_empty()
                    && window.width > 0
                    && window.height > 0
            })
            .collect::<Vec<_>>();
        result.sort_by(|left, right| {
            left.title
                .to_lowercase()
                .cmp(&right.title.to_lowercase())
        });
        Ok(result)
    }

    pub fn frame(key: String) -> Result<CaptureFrame, String> {
        let windows = Window::all().map_err(|error| error.to_string())?;
        let window = windows
            .into_iter()
            .find(|window| {
                window
                    .title()
                    .map(|title| title == key)
                    .unwrap_or(false)
            })
            .ok_or_else(|| {
                "La fenêtre sélectionnée n’existe plus. Actualise la liste."
                    .to_string()
            })?;
        let description = describe(&window)?;
        if description.minimized {
            return Err(
                "La fenêtre Umamusume est minimisée et ne peut pas être capturée."
                    .to_string(),
            );
        }

        let image = window.capture_image().map_err(|error| {
            format!(
                "Capture refusée par Windows ou le client graphique : {error}"
            )
        })?;
        let image_width = image.width();
        let image_height = image.height();
        let mut output = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(image)
            .write_to(&mut output, ImageFormat::Png)
            .map_err(|error| error.to_string())?;
        let encoded = STANDARD.encode(output.into_inner());
        let captured_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis() as u64;
        Ok(CaptureFrame {
            window: description,
            data_url: format!("data:image/png;base64,{encoded}"),
            image_width,
            image_height,
            captured_at,
        })
    }
}

#[tauri::command]
async fn list_capture_windows() -> Result<Vec<CaptureWindow>, String> {
    #[cfg(target_os = "windows")]
    {
        return tauri::async_runtime::spawn_blocking(capture::list)
            .await
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("La capture de fenêtre Live OCR est disponible sous Windows."
            .to_string())
    }
}

#[tauri::command]
async fn capture_window(key: String) -> Result<CaptureFrame, String> {
    #[cfg(target_os = "windows")]
    {
        return tauri::async_runtime::spawn_blocking(move || {
            capture::frame(key)
        })
        .await
        .map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = key;
        Err("La capture de fenêtre Live OCR est disponible sous Windows."
            .to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_capture_windows,
            capture_window,
            initialize_decision_log,
            append_decision_log,
            decision_log_status,
            read_decision_log,
            clear_decision_log,
            open_decision_log_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Live Route OCR");
}
