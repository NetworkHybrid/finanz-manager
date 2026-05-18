use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

/// Liefert den Pfad zur JSON-Datendatei im App-Verzeichnis des Nutzers
/// und stellt sicher, dass der Ordner existiert.
fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("finanzdaten.json"))
}

/// Lädt alle gespeicherten Finanzdaten. Existiert noch keine Datei,
/// wird eine leere Struktur zurückgegeben.
#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<Value, String> {
    let path = data_file(&app)?;
    if !path.exists() {
        return Ok(json!({ "transactions": [], "subscriptions": [] }));
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(value)
}

/// Speichert die übergebenen Finanzdaten als formatiertes JSON.
#[tauri::command]
fn save_data(app: tauri::AppHandle, data: Value) -> Result<(), String> {
    let path = data_file(&app)?;
    let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Gibt den Speicherort der Datendatei zurück (für die Einstellungen-Ansicht).
#[tauri::command]
fn data_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(data_file(&app)?.to_string_lossy().to_string())
}

/// Gibt die aktuell installierte App-Version zurück.
#[tauri::command]
fn app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Hält ein gefundenes Update zwischen Prüfung und Installation vor.
#[derive(Default)]
struct PendingUpdate(Mutex<Option<tauri_plugin_updater::Update>>);

/// An das Frontend gemeldete Infos zu einem verfügbaren Update.
#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    current_version: String,
    notes: Option<String>,
}

/// Prüft beim konfigurierten Endpunkt, ob eine neuere Version vorliegt.
/// Gibt `None` zurück, wenn die App aktuell ist.
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => {
            let info = UpdateInfo {
                version: update.version.clone(),
                current_version: update.current_version.clone(),
                notes: update.body.clone(),
            };
            *app.state::<PendingUpdate>().0.lock().unwrap() = Some(update);
            Ok(Some(info))
        }
        None => Ok(None),
    }
}

/// Lädt das zuvor gefundene Update herunter, installiert es und
/// startet die App neu.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let update = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or("Kein Update vorgemerkt — bitte zuerst nach Updates suchen.")?;

    update
        .download_and_install(|_received, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    app.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PendingUpdate::default())
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            data_path,
            app_version,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Finanz-Manager-App");
}
