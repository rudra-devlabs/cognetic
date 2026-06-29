use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

// Global map to track running processes by their executionId
static RUNNING_PROCESSES: OnceLock<Arc<Mutex<HashMap<String, u32>>>> = OnceLock::new();

fn get_process_map() -> Arc<Mutex<HashMap<String, u32>>> {
    RUNNING_PROCESSES.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!(
        "Hello, {}! You've been greeted from the native Rust backend!",
        name
    )
}

#[tauri::command]
fn get_current_dir() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_content(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_content(path: &str, content: &str) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_directory(path: &str) -> Result<Vec<String>, String> {
    let mut entries = Vec::new();
    match std::fs::read_dir(path) {
        Ok(dir) => {
            for entry in dir {
                if let Ok(entry) = entry {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    let prefix = if is_dir { "[DIR]" } else { "[FILE]" };
                    entries.push(format!("{} {}", prefix, name));
                }
            }
            Ok(entries)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn resolve_and_validate_path(path: &str, base_paths: Vec<String>) -> Result<String, String> {
    use std::path::Path;
    use path_clean::clean;
    let target = Path::new(path);
    
    // If no base paths are provided, we allow anything (or we could deny, but let's assume JS checked if we should restrict)
    if base_paths.is_empty() {
        return Ok(target.to_string_lossy().into_owned());
    }

    let mut is_allowed = false;
    let mut resolved_path_str = String::new();

    for bp in base_paths {
        let base = Path::new(&bp);
        let canon_base = base.canonicalize().unwrap_or_else(|_| base.to_path_buf());
        
        let joined = if target.is_absolute() {
            target.to_path_buf()
        } else {
            base.join(target)
        };
        
        let cleaned = clean(joined);
        let base_str = canon_base.to_string_lossy().to_lowercase();
        let cleaned_str = cleaned.to_string_lossy().to_lowercase();
        
        if cleaned_str.starts_with(&base_str) {
            is_allowed = true;
            resolved_path_str = cleaned.to_string_lossy().into_owned();
            break;
        }
    }

    if is_allowed {
        Ok(resolved_path_str)
    } else {
        Err("Permission Denied: Path is outside the active project workspaces.".to_string())
    }
}

#[tauri::command]
fn delete_path(path: &str, recursive: bool) -> Result<(), String> {
    use std::path::Path;
    let p = Path::new(path);
    if !p.exists() {
        return Err("Path does not exist".to_string());
    }
    if p.is_dir() {
        if recursive {
            std::fs::remove_dir_all(p).map_err(|e| e.to_string())
        } else {
            std::fs::remove_dir(p).map_err(|e| e.to_string())
        }
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn rename_path(old_path: &str, new_path: &str) -> Result<(), String> {
    std::fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

fn format_size(bytes: u64) -> String {
    let kb = 1024_f64;
    let mb = kb * 1024_f64;
    let gb = mb * 1024_f64;
    let b = bytes as f64;
    if b >= gb {
        format!("{:.2} GB", b / gb)
    } else if b >= mb {
        format!("{:.2} MB", b / mb)
    } else if b >= kb {
        format!("{:.2} KB", b / kb)
    } else {
        format!("{} bytes", bytes)
    }
}

#[tauri::command]
fn get_path_stats(path: &str) -> Result<String, String> {
    use std::fs;
    use std::path::Path;
    use serde_json::json;

    let p = Path::new(path);
    if !p.exists() {
        return Ok(json!({ "exists": false, "path": path }).to_string());
    }

    let meta = match fs::symlink_metadata(p) {
        Ok(m) => m,
        Err(e) => return Err(e.to_string()),
    };

    let is_dir = meta.is_dir();
    let is_symlink = meta.file_type().is_symlink();
    let name = p.file_name().unwrap_or_default().to_string_lossy().into_owned();
    
    let format_time = |t: std::io::Result<std::time::SystemTime>| -> String {
        t.ok()
            .and_then(|sys_time| sys_time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|dur| {
                let secs = dur.as_secs();
                chrono::DateTime::<chrono::Utc>::from_timestamp(secs as i64, 0)
                    .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
                    .unwrap_or_else(|| "Unknown".to_string())
            })
            .unwrap_or_else(|| "Unknown".to_string())
    };

    let created_at = format_time(meta.created());
    let modified_at = format_time(meta.modified());
    let readonly = meta.permissions().readonly();
    
    #[cfg(windows)]
    let hidden = {
        use std::os::windows::fs::MetadataExt;
        (meta.file_attributes() & 2) != 0
    };
    #[cfg(not(windows))]
    let hidden = name.starts_with(".");

    if is_dir {
        let children = fs::read_dir(p).map(|d| d.count()).unwrap_or(0);
        Ok(json!({
            "exists": true,
            "path": path,
            "name": name,
            "type": "directory",
            "children": children,
            "created_at": created_at,
            "modified_at": modified_at,
            "readonly": readonly,
            "hidden": hidden,
            "symlink": is_symlink
        }).to_string())
    } else {
        let extension = p.extension().unwrap_or_default().to_string_lossy().into_owned();
        let ext_str = if extension.is_empty() { String::new() } else { format!(".{}", extension) };
        let formatted_size = format_size(meta.len());
        
        let mut encoding;
        let mut lines = 0;
        let mut tokens = 0;
        
        if meta.len() < 10 * 1024 * 1024 {
            match fs::read_to_string(p) {
                Ok(content) => {
                    encoding = "utf-8".to_string();
                    lines = content.lines().count();
                    tokens = content.len() / 4;
                },
                Err(_) => {
                    encoding = "binary".to_string();
                }
            }
        } else {
            encoding = "too_large_to_check".to_string();
        }

        Ok(json!({
            "exists": true,
            "path": path,
            "name": name,
            "type": "file",
            "size": formatted_size,
            "extension": ext_str,
            "encoding": encoding,
            "lines": lines,
            "estimated_tokens": tokens,
            "created_at": created_at,
            "modified_at": modified_at,
            "readonly": readonly,
            "hidden": hidden,
            "symlink": is_symlink
        }).to_string())
    }
}

#[tauri::command]
fn create_directory(path: &str) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn run_command(command: &str, args: Vec<String>, cwd: Option<String>, execution_id: Option<String>) -> Result<String, String> {
    let cmd_lower = command.to_lowercase();
    let blocked_commands = [
        "rm", "del", "rmdir", "rd", "format", "mkfs", "fdisk", "diskpart", 
        "dd", "shutdown", "reboot", "halt", "poweroff", "chmod", "chown",
        "attrib", "takeown", "icacls", "diskutil", "sudo", "su", "passwd"
    ];
    
    if blocked_commands.contains(&cmd_lower.as_str()) {
        return Err(format!("Command '{}' is blocked for security reasons.", command));
    }
    
    if cmd_lower == "cmd" || cmd_lower == "sh" || cmd_lower == "bash" || cmd_lower == "powershell" || cmd_lower == "pwsh" {
        for arg in &args {
            let arg_lower = arg.to_lowercase();
            for blocked in &blocked_commands {
                if arg_lower.contains(&format!("{} ", blocked)) || arg_lower.ends_with(blocked) {
                     return Err(format!("Harmful command '{}' detected in shell arguments.", blocked));
                }
            }
        }
    }

    use std::process::Command;
    use std::process::Stdio;
    
    let mut cmd = Command::new(command);
    cmd.args(args)
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());
    
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to spawn command: {}", e)),
    };
    
    let pid = child.id();
    
    if let Some(id) = &execution_id {
        if let Ok(mut guard) = get_process_map().lock() {
            guard.insert(id.clone(), pid);
        }
    }
    
    let output = match child.wait_with_output() {
        Ok(o) => o,
        Err(e) => {
            if let Some(id) = &execution_id {
                if let Ok(mut guard) = get_process_map().lock() {
                    guard.remove(id);
                }
            }
            return Err(format!("Failed to wait for command: {}", e));
        }
    };
    
    if let Some(id) = &execution_id {
        if let Ok(mut guard) = get_process_map().lock() {
            guard.remove(id);
        }
    }

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("Command failed with stderr: {}", stderr))
    }
}

#[tauri::command]
fn kill_command(execution_id: String) -> Result<String, String> {
    let pid = {
        if let Ok(mut guard) = get_process_map().lock() {
            guard.remove(&execution_id)
        } else {
            None
        }
    };
    
    if let Some(p) = pid {
        #[cfg(target_os = "windows")]
        {
            let status = std::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &p.to_string()])
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                Ok(format!("Successfully killed process tree {}", p))
            } else {
                Err(format!("Taskkill failed for process tree {}", p))
            }
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            let status = std::process::Command::new("kill")
                .args(["-9", &p.to_string()])
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                Ok(format!("Successfully killed process {}", p))
            } else {
                Err(format!("Kill failed for process {}", p))
            }
        }
    } else {
        Err(format!("No running process found for executionId: {}", execution_id))
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub text: String,
}

#[tauri::command]
async fn perform_http_request(
    url: String,
    method: String,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<String>,
) -> Result<HttpResponse, String> {
    let client = reqwest::Client::new();
    let method_str = method.to_uppercase();
    
    let mut req = match method_str.as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        _ => client.get(&url),
    };

    if let Some(h) = headers {
        for (k, v) in h {
            req = req.header(k, v);
        }
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    match req.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let text = res.text().await.map_err(|e| e.to_string())?;
            Ok(HttpResponse { status, text })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn fetch_url_raw(url: String, method: Option<String>, body: Option<String>) -> Result<String, String> {
    let client = reqwest::Client::new();
    let method_str = method.unwrap_or_else(|| "GET".to_string()).to_uppercase();
    
    let mut req = match method_str.as_str() {
        "POST" => client.post(&url),
        _ => client.get(&url),
    };

    if let Some(b) = body {
        if method_str == "POST" {
            req = req.body(b).header("Content-Type", "application/x-www-form-urlencoded");
        }
    }
    
    req = req.header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
    
    match req.send().await {
        Ok(res) => {
            if !res.status().is_success() {
                return Err(format!("Request failed with status: {}", res.status()));
            }
            res.text().await.map_err(|e| e.to_string())
        },
        Err(e) => Err(e.to_string())
    }
}

fn build_tree(dir: &std::path::Path, prefix: &str) -> String {
    let mut output = String::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut paths: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        paths.retain(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            !name.starts_with(".git") && name != "node_modules" && name != "target" && name != "dist" && name != "build" && name != ".next"
        });
        paths.sort_by(|a, b| {
            let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if a_is_dir && !b_is_dir {
                std::cmp::Ordering::Less
            } else if !a_is_dir && b_is_dir {
                std::cmp::Ordering::Greater
            } else {
                a.file_name().cmp(&b.file_name())
            }
        });

        let count = paths.len();
        for (i, entry) in paths.iter().enumerate() {
            let is_last = i == count - 1;
            let marker = if is_last { "└── " } else { "├── " };
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            
            if is_dir {
                output.push_str(&format!("{}{}{}\n", prefix, marker, name));
                let new_prefix = format!("{}{}", prefix, if is_last { "    " } else { "│   " });
                output.push_str(&build_tree(&entry.path(), &new_prefix));
            } else {
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                let size_str = format_size(size).replace(" ", "");
                output.push_str(&format!("{}{}{}[{}]\n", prefix, marker, name, size_str));
            }
        }
    }
    output
}

#[tauri::command]
fn get_tree(dirpath: &str) -> Result<String, String> {
    let path = std::path::Path::new(dirpath);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Directory does not exist: {}", dirpath));
    }
    
    let root_name = path.file_name().unwrap_or(path.as_os_str()).to_string_lossy();
    let mut tree = format!("{}\n", root_name);
    tree.push_str(&build_tree(path, ""));
    Ok(tree)
}

#[tauri::command]
fn glob_path(pattern: &str, dirpath: Option<&str>) -> Result<Vec<String>, String> {
    use std::path::Path;
    
    let mut full_pattern = pattern.to_string();
    if let Some(dir) = dirpath {
        let dir_path = Path::new(dir);
        if !dir_path.exists() {
            return Err(format!("Directory does not exist: {}", dir));
        }
        let joined = dir_path.join(pattern);
        full_pattern = joined.to_string_lossy().to_string();
    }
    
    // Normalize slashes for glob
    let full_pattern = full_pattern.replace("\\", "/");
    
    let mut results = Vec::new();
    match glob::glob(&full_pattern) {
        Ok(paths) => {
            for entry in paths {
                if let Ok(path) = entry {
                    results.push(path.to_string_lossy().to_string());
                }
            }
            Ok(results)
        }
        Err(e) => Err(format!("Invalid glob pattern: {}", e))
    }
}

#[tauri::command]
fn grep_search(dirpath: &str, pattern: &str, include: Option<&str>) -> Result<Vec<serde_json::Value>, String> {
    use std::fs::File;
    use std::io::{BufRead, BufReader};
    use walkdir::WalkDir;
    use regex::Regex;

    let re = Regex::new(pattern).map_err(|e| e.to_string())?;
    
    let include_glob = if let Some(inc) = include {
        if inc.trim().is_empty() {
            None
        } else {
            let pattern_str = if inc.starts_with("*.") {
                format!("**/{}", inc)
            } else {
                inc.to_string()
            };
            Some(glob::Pattern::new(&pattern_str).map_err(|e| e.to_string())?)
        }
    } else {
        None
    };

    let mut results = Vec::new();
    let mut match_count = 0;
    
    let dir_path = std::path::Path::new(dirpath);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("Invalid directory: {}", dirpath));
    }
    
    let walker = WalkDir::new(dirpath).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !name.starts_with(".git") && 
        name != "node_modules" && 
        name != "target" && 
        name != "dist" && 
        name != "build" &&
        name != ".next"
    });

    for entry in walker.filter_map(|e| e.ok()) {
        if match_count >= 100 {
            break;
        }
        
        if entry.file_type().is_file() {
            let path = entry.path();
            
            if let Some(ref gl) = include_glob {
                if !gl.matches_path(path) {
                    continue;
                }
            }

            if let Ok(meta) = std::fs::metadata(path) {
                if meta.len() > 10 * 1024 * 1024 { // skip >10MB
                    continue;
                }
            }
            
            if let Ok(file) = File::open(path) {
                let reader = BufReader::new(file);
                for (line_num, line) in reader.lines().enumerate() {
                    if let Ok(line_content) = line {
                        if re.is_match(&line_content) {
                            results.push(serde_json::json!({
                                "file": path.to_string_lossy().to_string(),
                                "line": line_num + 1,
                                "content": line_content.trim().to_string()
                            }));
                            match_count += 1;
                            if match_count >= 100 {
                                break;
                            }
                        }
                    } else {
                        break;
                    }
                }
            }
        }
    }
    
    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_current_dir,
            read_file_content,
            write_file_content,
            list_directory,
            resolve_and_validate_path,
            get_path_stats,
            delete_path,
            rename_path,
            create_directory,
            run_command,
            kill_command,
            fetch_url_raw,
            perform_http_request,
            glob_path,
            grep_search,
            get_tree
        ])
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
