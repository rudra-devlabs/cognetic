// indexer.rs — Local Vector Database & Code Graph (Phase 2)
//
// Scans the active project directory, uses tree-sitter to extract the
// import/export dependency graph, chunks source files, generates local
// offline embeddings via fastembed (all-MiniLM-L6-v2), and stores both
// the vectors and the graph edges in a SQLite DB at {project}/.cognetic/index.db.
//
// All heavy work runs off the main Tauri thread (tokio::spawn + spawn_blocking).

use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

// ── Globals ───────────────────────────────────────────────────────────────────

static INDEXING_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static EMBEDDER: OnceLock<Mutex<Option<fastembed::TextEmbedding>>> = OnceLock::new();

const INDEXABLE_EXTENSIONS: [&str; 34] = ["js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rs", "go", "java", "c", "cpp", "h", "hpp", "cs", "php", "rb", "swift", "kt", "html", "css", "scss", "json", "md", "yaml", "yml", "sh", "bash", "sql", "xml", "toml", "ini", "bat", "ps1"];
const CHUNK_LINES: usize = 50;
const MAX_FILE_SIZE: u64 = 512 * 1024; // skip files > 512KB
const EXCLUDED_DIRS: [&str; 8] = [
    "node_modules", ".git", "dist", "build", "target", ".next", ".cognetic", ".vscode",
];

// ── Path helpers ──────────────────────────────────────────────────────────────

/// Normalize a path for stable storage/lookups: absolute-ish, forward slashes.
fn normalize_path(p: &Path) -> String {
    let cleaned = path_clean::clean(p);
    let s = cleaned.to_string_lossy().replace('\\', "/");
    // Strip Windows UNC prefix if present
    s.strip_prefix("//?/").unwrap_or(&s).to_string()
}

fn db_path(project_path: &str) -> Result<PathBuf, String> {
    let dir = Path::new(project_path).join(".cognetic");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create .cognetic dir: {}", e))?;
    Ok(dir.join("index.db"))
}

fn open_db(project_path: &str) -> Result<Connection, String> {
    let conn = Connection::open(db_path(project_path)?).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS files (
             path   TEXT PRIMARY KEY COLLATE NOCASE,
             mtime  INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS chunks (
             id         INTEGER PRIMARY KEY AUTOINCREMENT,
             file_path  TEXT NOT NULL COLLATE NOCASE,
             start_line INTEGER NOT NULL,
             end_line   INTEGER NOT NULL,
             content    TEXT NOT NULL,
             embedding  BLOB
         );
         CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
         CREATE TABLE IF NOT EXISTS edges (
             source TEXT NOT NULL COLLATE NOCASE,
             target TEXT NOT NULL COLLATE NOCASE,
             UNIQUE(source, target)
         );
         CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

// ── Embeddings ────────────────────────────────────────────────────────────────

fn get_embedder(cache_dir: &Path) -> Result<&'static Mutex<Option<fastembed::TextEmbedding>>, String> {
    let cell = EMBEDDER.get_or_init(|| Mutex::new(None));
    {
        let mut guard = cell.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            let opts = fastembed::InitOptions::new(fastembed::EmbeddingModel::AllMiniLML6V2)
                .with_cache_dir(cache_dir.to_path_buf())
                .with_show_download_progress(false);
            match fastembed::TextEmbedding::try_new(opts) {
                Ok(model) => *guard = Some(model),
                Err(e) => return Err(format!("Failed to initialize embedding model: {}", e)),
            }
        }
    }
    Ok(cell)
}

fn embed_texts(cache_dir: &Path, texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
    let cell = get_embedder(cache_dir)?;
    let mut guard = cell.lock().map_err(|e| e.to_string())?;
    let model = guard.as_mut().ok_or("Embedding model unavailable")?;
    model.embed(texts, None).map_err(|e| e.to_string())
}

fn vec_to_blob(v: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 4);
    for f in v {
        out.extend_from_slice(&f.to_le_bytes());
    }
    out
}

fn blob_to_vec(b: &[u8]) -> Vec<f32> {
    b.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let (mut dot, mut na, mut nb) = (0.0f32, 0.0f32, 0.0f32);
    for i in 0..a.len() {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    dot / (na.sqrt() * nb.sqrt())
}

// ── Tree-sitter import/export extraction ─────────────────────────────────────

fn language_for(ext: &str) -> tree_sitter::Language {
    match ext {
        "ts" => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
        "tsx" => tree_sitter_typescript::LANGUAGE_TSX.into(),
        _ => tree_sitter_javascript::LANGUAGE.into(),
    }
}

fn trim_specifier(raw: &str) -> String {
    let s = raw.trim_matches(|c| c == '"' || c == '\'' || c == '`');
    // Strip Vite suffixes: ?raw, ?worker, ?url ...
    s.split('?').next().unwrap_or(s).to_string()
}

fn collect_import_specifiers(node: tree_sitter::Node, src: &[u8], out: &mut Vec<String>) {
    match node.kind() {
        // import x from '...' | export { x } from '...'
        "import_statement" | "export_statement" => {
            if let Some(source_node) = node.child_by_field_name("source") {
                if let Ok(text) = source_node.utf8_text(src) {
                    out.push(trim_specifier(text));
                }
            }
        }
        // require('...') | import('...')
        "call_expression" => {
            if let Some(f) = node.child_by_field_name("function") {
                let ftext = f.utf8_text(src).unwrap_or("");
                if ftext == "require" || f.kind() == "import" {
                    if let Some(args) = node.child_by_field_name("arguments") {
                        let mut c = args.walk();
                        for arg in args.children(&mut c) {
                            if arg.kind() == "string" {
                                if let Ok(t) = arg.utf8_text(src) {
                                    out.push(trim_specifier(t));
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
        _ => {}
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_import_specifiers(child, src, out);
    }
}

/// Resolve a relative import specifier against the importing file's directory.
/// Returns the normalized path of an existing file, or None.
fn resolve_specifier(from_file: &Path, spec: &str) -> Option<String> {
    if !spec.starts_with("./") && !spec.starts_with("../") {
        return None; // bare module (npm package) — not part of the project graph
    }
    let base = from_file.parent()?;
    let joined = path_clean::clean(base.join(spec));

    // 1) Exact match
    if joined.is_file() {
        return Some(normalize_path(&joined));
    }
    // 2) Try appending known extensions
    for ext in INDEXABLE_EXTENSIONS {
        let candidate = PathBuf::from(format!("{}.{}", joined.to_string_lossy(), ext));
        if candidate.is_file() {
            return Some(normalize_path(&candidate));
        }
    }
    // 3) Directory index files
    if joined.is_dir() {
        for ext in INDEXABLE_EXTENSIONS {
            let candidate = joined.join(format!("index.{}", ext));
            if candidate.is_file() {
                return Some(normalize_path(&candidate));
            }
        }
    }
    None
}

// ── Core indexing (blocking; must be called via spawn_blocking) ──────────────

fn run_index_blocking(project_path: &str, cache_dir: &Path) -> Result<String, String> {
    let mut conn = open_db(project_path)?;
    let root = Path::new(project_path);
    if !root.is_dir() {
        return Err(format!("Project path is not a directory: {}", project_path));
    }

    // Collect indexable files on disk
    let mut disk_files: Vec<PathBuf> = Vec::new();
    let walker = walkdir::WalkDir::new(root).into_iter().filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !EXCLUDED_DIRS.contains(&name.as_ref()) && !name.starts_with(".git")
    });
    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !INDEXABLE_EXTENSIONS.contains(&ext) {
            continue;
        }
        if entry.metadata().map(|m| m.len() > MAX_FILE_SIZE).unwrap_or(true) {
            continue;
        }
        disk_files.push(path.to_path_buf());
    }

    // Remove DB rows for files that no longer exist
    let disk_set: std::collections::HashSet<String> =
        disk_files.iter().map(|p| normalize_path(p).to_lowercase()).collect();
        
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare("SELECT path FROM files").map_err(|e| e.to_string())?;
        let known: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        for old in known {
            if !disk_set.contains(&old.to_lowercase()) {
                let _ = tx.execute("DELETE FROM files  WHERE path = ?1", [&old]);
                let _ = tx.execute("DELETE FROM chunks WHERE file_path = ?1", [&old]);
                let _ = tx.execute("DELETE FROM edges  WHERE source = ?1", [&old]);
            }
        }
    }

    let embedder_ok = get_embedder(cache_dir).is_ok();
    let mut indexed = 0usize;
    let mut skipped = 0usize;

    let mut all_chunks_meta: Vec<(String, usize, usize, String)> = Vec::new();
    let mut files_to_update: Vec<(String, i64)> = Vec::new();

    for file in &disk_files {
        let norm = normalize_path(file);
        let mtime = std::fs::metadata(file)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let stored_mtime: Option<i64> = tx
            .query_row("SELECT mtime FROM files WHERE path = ?1", [&norm], |row| row.get(0))
            .ok();
        if stored_mtime == Some(mtime) {
            skipped += 1;
            continue;
        }

        let source = match std::fs::read_to_string(file) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let ext = file.extension().and_then(|e| e.to_str()).unwrap_or("js");
        let mut specifiers: Vec<String> = Vec::new();
        let mut parser = tree_sitter::Parser::new();
        if parser.set_language(&language_for(ext)).is_ok() {
            if let Some(tree) = parser.parse(&source, None) {
                collect_import_specifiers(tree.root_node(), source.as_bytes(), &mut specifiers);
            }
        }

        tx.execute("DELETE FROM edges WHERE source = ?1", [&norm]).map_err(|e| e.to_string())?;
        for spec in &specifiers {
            if let Some(target) = resolve_specifier(file, spec) {
                let _ = tx.execute("INSERT OR IGNORE INTO edges (source, target) VALUES (?1, ?2)", [&norm, &target]);
            }
        }

        tx.execute("DELETE FROM chunks WHERE file_path = ?1", [&norm]).map_err(|e| e.to_string())?;

        let lines: Vec<&str> = source.lines().collect();
        let mut i = 0;
        while i < lines.len() {
            let end = (i + CHUNK_LINES).min(lines.len());
            let text = lines[i..end].join("\n");
            if !text.trim().is_empty() {
                let rel = norm.strip_prefix(&normalize_path(root)).unwrap_or(&norm).trim_start_matches('/').to_string();
                all_chunks_meta.push((norm.clone(), i + 1, end, format!("// File: {}\n{}", rel, text)));
            }
            i = end;
        }

        files_to_update.push((norm, mtime));
        indexed += 1;
    }

    let mut all_embeddings: Vec<Option<Vec<f32>>> = Vec::new();
    if embedder_ok && !all_chunks_meta.is_empty() {
        let chunk_texts: Vec<String> = all_chunks_meta.iter().map(|c| c.3.clone()).collect();
        for batch in chunk_texts.chunks(500) {
            match embed_texts(cache_dir, batch.to_vec()) {
                Ok(vecs) => all_embeddings.extend(vecs.into_iter().map(Some)),
                Err(_) => all_embeddings.extend(vec![None; batch.len()]),
            }
        }
    } else {
        all_embeddings.resize(all_chunks_meta.len(), None);
    }

    for ((file_path, start, end, text), emb) in all_chunks_meta.into_iter().zip(all_embeddings.iter()) {
        let blob: Option<Vec<u8>> = emb.as_ref().map(|v| vec_to_blob(v));
        tx.execute(
            "INSERT INTO chunks (file_path, start_line, end_line, content, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![file_path, start as i64, end as i64, text, blob],
        )
        .map_err(|e| e.to_string())?;
    }

    for (file_path, mtime) in files_to_update {
        tx.execute(
            "INSERT INTO files (path, mtime) VALUES (?1, ?2) ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime",
            rusqlite::params![file_path, mtime],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!(
        "Indexing complete: {} files (re)indexed, {} unchanged, embeddings {}.",
        indexed,
        skipped,
        if embedder_ok { "enabled" } else { "unavailable (graph-only mode)" }
    ))
}

fn embed_cache_dir(app: &tauri::AppHandle) -> PathBuf {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|d| d.join("fastembed_cache"))
        .unwrap_or_else(|_| std::env::temp_dir().join("cognetic_fastembed_cache"))
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Fire-and-forget background indexing of a project directory.
#[tauri::command]
pub async fn start_indexing(app: tauri::AppHandle, project_path: String) -> Result<String, String> {
    if INDEXING_IN_PROGRESS.swap(true, Ordering::SeqCst) {
        return Ok("Indexing already in progress.".to_string());
    }
    let cache_dir = embed_cache_dir(&app);

    // Runs on the tokio runtime; heavy work delegated to a blocking thread so
    // the main Tauri thread is never blocked.
    tokio::spawn(async move {
        let path_clone = project_path.clone();
        let result = tokio::task::spawn_blocking(move || run_index_blocking(&path_clone, &cache_dir)).await;
        INDEXING_IN_PROGRESS.store(false, Ordering::SeqCst);
        let payload = match result {
            Ok(Ok(msg)) => serde_json::json!({ "project": project_path, "ok": true, "message": msg }),
            Ok(Err(e)) => serde_json::json!({ "project": project_path, "ok": false, "message": e }),
            Err(e) => serde_json::json!({ "project": project_path, "ok": false, "message": e.to_string() }),
        };
        let _ = app.emit("indexing-done", payload);
    });

    Ok("Indexing started in background.".to_string())
}

#[derive(serde::Serialize)]
pub struct SemanticHit {
    pub file_path: String,
    pub start_line: i64,
    pub end_line: i64,
    pub score: f32,
    pub content: String,
}

/// Vectorize `query` and cosine-similarity search the local chunk index.
/// Ensures the index is up to date first (incremental, cheap when unchanged).
#[tauri::command]
pub async fn search_semantic(
    app: tauri::AppHandle,
    project_path: String,
    query: String,
    top_k: Option<usize>,
) -> Result<Vec<SemanticHit>, String> {
    let cache_dir = embed_cache_dir(&app);
    let k = top_k.unwrap_or(8).clamp(1, 25);

    tokio::task::spawn_blocking(move || {
        // Keep the index fresh unless a background pass is already running
        if !INDEXING_IN_PROGRESS.swap(true, Ordering::SeqCst) {
            let r = run_index_blocking(&project_path, &cache_dir);
            INDEXING_IN_PROGRESS.store(false, Ordering::SeqCst);
            r?;
        }

        let query_emb = embed_texts(&cache_dir, vec![query])?
            .into_iter()
            .next()
            .ok_or("Failed to embed query")?;

        let conn = open_db(&project_path)?;
        let mut stmt = conn
            .prepare("SELECT file_path, start_line, end_line, content, embedding FROM chunks WHERE embedding IS NOT NULL")
            .map_err(|e| e.to_string())?;

        let mut hits: Vec<SemanticHit> = stmt
            .query_map([], |row| {
                let blob: Vec<u8> = row.get(4)?;
                Ok(SemanticHit {
                    file_path: row.get(0)?,
                    start_line: row.get(1)?,
                    end_line: row.get(2)?,
                    content: row.get(3)?,
                    score: cosine_similarity(&query_emb, &blob_to_vec(&blob)),
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        if hits.is_empty() {
            return Err("Semantic index is empty. The project may still be indexing, or the embedding model is unavailable.".to_string());
        }

        hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        hits.truncate(k);
        // Trim chunk content for LLM consumption
        for h in &mut hits {
            if h.content.len() > 1500 {
                h.content.truncate(1500);
                h.content.push_str("\n...[truncated]");
            }
        }
        Ok(hits)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
pub struct ImpactRadius {
    pub file: String,
    pub imported_by: Vec<String>,          // depth 1: files that import the target
    pub imports: Vec<String>,              // depth 1: files the target imports
    pub imported_by_transitive: Vec<String>, // depth 2
    pub imports_transitive: Vec<String>,     // depth 2
}

fn query_edges(conn: &Connection, sql: &str, param: &str) -> Vec<String> {
    conn.prepare(sql)
        .ok()
        .map(|mut stmt| {
            stmt.query_map([param], |row| row.get::<_, String>(0))
                .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
                .unwrap_or_default()
        })
        .unwrap_or_default()
}

/// Recursive dependency lookup (depth 2): who imports this file, and what does it import.
#[tauri::command]
pub async fn get_impact_radius(project_path: String, filepath: String) -> Result<ImpactRadius, String> {
    tokio::task::spawn_blocking(move || {
        let conn = open_db(&project_path)?;
        let norm = normalize_path(Path::new(&filepath));

        let imported_by = query_edges(&conn, "SELECT DISTINCT source FROM edges WHERE target = ?1", &norm);
        let imports = query_edges(&conn, "SELECT DISTINCT target FROM edges WHERE source = ?1", &norm);

        let mut imported_by_transitive: Vec<String> = Vec::new();
        for f in &imported_by {
            for g in query_edges(&conn, "SELECT DISTINCT source FROM edges WHERE target = ?1", f) {
                if g != norm && !imported_by.contains(&g) && !imported_by_transitive.contains(&g) {
                    imported_by_transitive.push(g);
                }
            }
        }
        let mut imports_transitive: Vec<String> = Vec::new();
        for f in &imports {
            for g in query_edges(&conn, "SELECT DISTINCT target FROM edges WHERE source = ?1", f) {
                if g != norm && !imports.contains(&g) && !imports_transitive.contains(&g) {
                    imports_transitive.push(g);
                }
            }
        }

        Ok(ImpactRadius {
            file: norm,
            imported_by,
            imports,
            imported_by_transitive,
            imports_transitive,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
