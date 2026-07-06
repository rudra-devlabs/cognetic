const fs = require('fs');
let code = fs.readFileSync('src-tauri/src/indexer.rs', 'utf8');

code = code.replace(
    `fn run_index_blocking(project_path: &str, cache_dir: &Path) -> Result<String, String> {\r\n    let conn = open_db(project_path)?;`,
    `fn run_index_blocking(project_path: &str, cache_dir: &Path) -> Result<String, String> {\r\n    let mut conn = open_db(project_path)?;`
);

code = code.replace(
    `fn run_index_blocking(project_path: &str, cache_dir: &Path) -> Result<String, String> {\n    let conn = open_db(project_path)?;`,
    `fn run_index_blocking(project_path: &str, cache_dir: &Path) -> Result<String, String> {\n    let mut conn = open_db(project_path)?;`
);

const startStr = `    // Remove DB rows for files that no longer exist`;
const endStr = `}\n\nfn embed_cache_dir`;
const endStrWin = `}\r\n\r\nfn embed_cache_dir`;

let startIdx = code.indexOf(startStr);
let endIdx = code.indexOf(endStr);
if (endIdx === -1) endIdx = code.indexOf(endStrWin);

if (startIdx === -1 || endIdx === -1) {
    console.error('Could not find boundaries!', {startIdx, endIdx});
    process.exit(1);
}

const newInner = `    // Remove DB rows for files that no longer exist
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
            let text = lines[i..end].join("\\n");
            if !text.trim().is_empty() {
                let rel = norm.strip_prefix(&normalize_path(root)).unwrap_or(&norm).trim_start_matches('/').to_string();
                all_chunks_meta.push((norm.clone(), i + 1, end, format!("// File: {}\\n{}", rel, text)));
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
            rusqlite::params![file_path, *start as i64, *end as i64, text, blob],
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
`;

code = code.substring(0, startIdx) + newInner + code.substring(endIdx);
fs.writeFileSync('src-tauri/src/indexer.rs', code);
console.log('indexer.rs successfully rewritten.');
