use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NativeDirEntry {
    pub name: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PathExistsResult {
    pub exists: bool,
    pub is_dir: bool,
}

#[tauri::command]
async fn pick_project_directory(default_path: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::AsyncFileDialog::new().set_title("选择表盘项目目录");
    if let Some(ref path) = default_path {
        dialog = dialog.set_directory(path);
    }
    let folder = dialog.pick_folder().await;
    Ok(folder.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
fn native_fs_read_dir(path: String) -> Result<Vec<NativeDirEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("'{}' 不是目录或不存在", path));
    }
    let read = fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let is_file = metadata.as_ref().map(|m| m.is_file()).unwrap_or(false);
        let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_ms = metadata
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        entries.push(NativeDirEntry {
            name,
            is_dir,
            is_file,
            size,
            modified_ms,
        });
    }
    Ok(entries)
}

#[tauri::command]
fn native_fs_read_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("读取文件失败 '{}': {}", path, e))
}

#[tauri::command]
fn native_fs_write_file(path: String, content: Vec<u8>) -> Result<(), String> {
    let file_path = Path::new(&path);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 '{}': {}", parent.display(), e))?;
    }
    fs::write(file_path, content).map_err(|e| format!("写入文件失败 '{}': {}", path, e))
}

#[tauri::command]
fn native_fs_create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("创建目录失败 '{}': {}", path, e))
}

#[tauri::command]
fn native_fs_remove_entry(path: String, recursive: bool) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(());
    }
    if p.is_dir() {
        if recursive {
            fs::remove_dir_all(p).map_err(|e| e.to_string())
        } else {
            fs::remove_dir(p).map_err(|e| e.to_string())
        }
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn native_fs_rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    let src = Path::new(&old_path);
    let dst = Path::new(&new_path);
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(src, dst).map_err(|e| e.to_string())
}

#[tauri::command]
fn native_fs_check_exists(path: String) -> Result<PathExistsResult, String> {
    let p = Path::new(&path);
    Ok(PathExistsResult {
        exists: p.exists(),
        is_dir: p.is_dir(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_project_directory,
            native_fs_read_dir,
            native_fs_read_file,
            native_fs_write_file,
            native_fs_create_dir,
            native_fs_remove_entry,
            native_fs_rename_entry,
            native_fs_check_exists,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
