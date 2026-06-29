import { invoke } from '@tauri-apps/api/core';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { stateManager } from './state.js';

function parseSingleToolBlock(toolName, paramsText) {
    const params = {};
    const lines = paramsText.split('\n');
    let currentKey = null;
    for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx !== -1 && eqIdx < 30) {
            const key = line.substring(0, eqIdx).trim();
            let value = line.substring(eqIdx + 1).trim();
            value = value.replace(/^["']|["']$/g, '');
            params[key] = value;
            currentKey = key;
        } else if (currentKey) {
            params[currentKey] += '\n' + line;
        }
    }
    return { name: toolName, params };
}

// Returns the first tool call found (backwards-compat)
export function parseToolCall(text) {
    const regex = /<tool\s+name=["']?([^"'>]+)["']?>([\s\S]*?)<\/tool>/i;
    const match = text.match(regex);
    if (!match) return null;
    return parseSingleToolBlock(match[1].trim(), match[2].trim());
}

// Returns ALL tool calls found in the text (for parallel execution)
export function parseAllToolCalls(text) {
    const regex = /<tool\s+name=["']?([^"'>]+)["']?>([\s\S]*?)<\/tool>/gi;
    const results = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        results.push(parseSingleToolBlock(match[1].trim(), match[2].trim()));
    }
    return results;
}

// In-memory cache for batched fetch_url results
// Key: URL, Value: { content: string, offset: number, totalBatches: number }
const BATCH_SIZE = 4000; // ~1000 tokens (4 chars/token estimate)
const fetchCache = new Map();

export async function executeTool(toolCall, basePaths = [], abortSignal = null) {
    const { name, params } = toolCall;
    
    const validatePath = async (p) => {
        if (!basePaths || basePaths.length === 0) return p;
        try {
            return await invoke('resolve_and_validate_path', { path: p, basePaths });
        } catch (e) {
            throw new Error(e);
        }
    };

    try {
        switch (name) {
            case 'get_current_dir':
                return (basePaths && basePaths.length > 0) ? basePaths[0] : await invoke('get_current_dir');
                
            case 'date':
                const now = new Date();
                const day = now.toLocaleDateString(undefined, { weekday: 'long' });
                const date = now.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
                const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return `Current Date: ${date}\nDay: ${day}\nTime: ${time}`;
                
            case 'path_stats':
                return await invoke('get_path_stats', { path: await validatePath(params.path) });
                
            case 'read_file':
                return await invoke('read_file_content', { path: await validatePath(params.filepath) });
                
            case 'write_file':
                await invoke('write_file_content', { path: await validatePath(params.filepath), content: params.content });
                return `Successfully wrote to ${params.filepath}`;
                
            case 'list_files':
                const entries = await invoke('list_directory', { path: await validatePath(params.dirpath) });
                return entries.join('\n');
                
            case 'search_files':
                const searchEntries = await invoke('list_directory', { path: await validatePath(params.dirpath) });
                const results = [];
                for (const entryStr of searchEntries) {
                    if (entryStr.startsWith('[FILE] ')) {
                        const fileName = entryStr.substring(7);
                        try {
                            const content = await invoke('read_file_content', { path: await validatePath(`${params.dirpath}/${fileName}`) });
                            if (content.includes(params.query)) {
                                results.push(`Found in ${fileName}`);
                            }
                        } catch(err) { /* ignore read errors */ }
                    }
                }
                return results.length > 0 ? results.join('\n') : "No matches found.";
                
            case 'readlines':
                const linesContent = await invoke('read_file_content', { path: await validatePath(params.filepath) });
                const allLines = linesContent.split('\n');
                const start = parseInt(params.startline) || 1;
                const end = parseInt(params.endline) || allLines.length;
                return allLines.slice(start - 1, end).join('\n');
                
            case 'writelines':
                const targetPath = await validatePath(params.filepath);
                const fileContent = await invoke('read_file_content', { path: targetPath });
                const lines = fileContent.split('\n');
                const s = parseInt(params.startline) || 1;
                const e = parseInt(params.endline) || s;
                
                // Replace the slice
                lines.splice(s - 1, e - s + 1, params.content);
                await invoke('write_file_content', { path: targetPath, content: lines.join('\n') });
                return `Successfully replaced lines ${s} to ${e} in ${params.filepath}`;
                
            case 'edit_file': {
                const editTargetPath = await validatePath(params.filepath);
                const editFileContent = await invoke('read_file_content', { path: editTargetPath });
                let newContent = editFileContent;
                
                const newText = params.content !== undefined ? params.content : '';

                if (params.target_text !== undefined) {
                    if (!editFileContent.includes(params.target_text)) {
                        throw new Error(`Target text not found in file.`);
                    }
                    newContent = editFileContent.replace(params.target_text, newText);
                } else if (params.startline !== undefined) {
                    const editLines = editFileContent.split('\n');
                    const editS = parseInt(params.startline) || 1;
                    const editE = parseInt(params.endline) || editS;
                    if (editS < 1 || editS > editLines.length || editE < editS || editE > editLines.length) {
                        throw new Error(`Invalid line range: ${editS}-${editE} (file has ${editLines.length} lines)`);
                    }
                    editLines.splice(editS - 1, editE - editS + 1, newText);
                    newContent = editLines.join('\n');
                } else {
                    throw new Error("Must provide either target_text or startline/endline for edit_file.");
                }

                await invoke('write_file_content', { path: editTargetPath, content: newContent });
                return `Successfully edited ${params.filepath}`;
            }
                
            case 'glob':
                const globPattern = params.pattern || '*';
                const baseDir = params.dirpath ? await validatePath(params.dirpath) : null;
                const matches = await invoke('glob_path', { pattern: globPattern, dirpath: baseDir });
                return matches.length > 0 ? matches.join('\n') : "No matches found.";
                
            case 'grep':
                const grepTarget = await validatePath(params.dirpath);
                const grepMatches = await invoke('grep_search', { 
                    dirpath: grepTarget, 
                    pattern: params.pattern,
                    include: params.include 
                });
                if (grepMatches.length === 0) return "No matches found.";
                return grepMatches.map(m => `${m.file}:${m.line} => ${m.content}`).join('\n');
                
            case 'tree':
                const treeTarget = await validatePath(params.dirpath);
                return await invoke('get_tree', { dirpath: treeTarget });
                
            case 'delete_path':
                await invoke('delete_path', { 
                    path: await validatePath(params.path), 
                    recursive: params.recursive === 'true' 
                });
                return `Successfully deleted ${params.path}`;
                
            case 'rename_path':
                await invoke('rename_path', { 
                    oldPath: await validatePath(params.old_path), 
                    newPath: await validatePath(params.new_path) 
                });
                return `Successfully renamed to ${params.new_path}`;
                
            case 'create_directory':
                await invoke('create_directory', { 
                    path: await validatePath(params.path) 
                });
                return `Successfully created directory ${params.path}`;
                
            case 'run_command':
                const argsStr = params.args || '';
                const args = argsStr.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map(str => str.replace(/^["']|["']$/g, '')) || [];
                const cwd = params.cwd ? await validatePath(params.cwd) : null;
                const executionId = Math.random().toString(36).substring(2, 15);
                
                let abortListener = null;
                if (abortSignal) {
                    abortListener = () => {
                        invoke('kill_command', { executionId }).catch(console.error);
                    };
                    abortSignal.addEventListener('abort', abortListener);
                }
                
                try {
                    const output = await invoke('run_command', { 
                        command: params.command, 
                        args: args, 
                        cwd: cwd,
                        executionId: executionId
                    });
                    if (abortSignal && abortListener) {
                        abortSignal.removeEventListener('abort', abortListener);
                    }
                    return output;
                } catch (e) {
                    if (abortSignal && abortListener) {
                        abortSignal.removeEventListener('abort', abortListener);
                    }
                    throw e;
                }
                
            case 'search_web':
                try {
                    const integrations = stateManager.getState().integrations || {};
                    const webSearchConfig = integrations.webSearch || { activeProvider: 'duckduckgo', apiKeys: {} };
                    const provider = webSearchConfig.activeProvider || 'duckduckgo';
                    const keys = webSearchConfig.apiKeys || {};
                    
                    let out = "No results found.";

                    if (provider === 'tavily') {
                        if (!keys.tavily) return "Tavily API key is not configured.";
                        const res = await invoke('perform_http_request', {
                            url: 'https://api.tavily.com/search',
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ api_key: keys.tavily, query: params.query, search_depth: 'basic' })
                        });
                        const data = JSON.parse(res.text);
                        if (data.results && data.results.length > 0) {
                            out = data.results.map(r => `### [${r.title}](${r.url})\n${r.content}`).join('\n\n');
                        }
                    } else if (provider === 'jina') {
                        if (!keys.jina) return "Jina Search API key is not configured.";
                        const res = await invoke('perform_http_request', {
                            url: `https://s.jina.ai/${encodeURIComponent(params.query)}`,
                            method: 'GET',
                            headers: { 
                                'Authorization': `Bearer ${keys.jina}`,
                                'Accept': 'application/json'
                            },
                            body: null
                        });
                        const data = JSON.parse(res.text);
                        if (data.data && data.data.length > 0) {
                            out = data.data.map(r => `### [${r.title}](${r.url})\n${r.description || r.content || ''}`).join('\n\n');
                        }
                    } else if (provider === 'brave') {
                        if (!keys.brave) return "Brave Search API key is not configured.";
                        const res = await invoke('perform_http_request', {
                            url: `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(params.query)}`,
                            method: 'GET',
                            headers: { 'Accept': 'application/json', 'X-Subscription-Token': keys.brave },
                            body: null
                        });
                        const data = JSON.parse(res.text);
                        if (data.web && data.web.results) {
                            out = data.web.results.map(r => `### [${r.title}](${r.url})\n${r.description}`).join('\n\n');
                        }
                    } else if (provider === 'bing') {
                        if (!keys.bing) return "Bing Search API key is not configured.";
                        const res = await invoke('perform_http_request', {
                            url: `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(params.query)}`,
                            method: 'GET',
                            headers: { 'Ocp-Apim-Subscription-Key': keys.bing },
                            body: null
                        });
                        const data = JSON.parse(res.text);
                        if (data.webPages && data.webPages.value) {
                            out = data.webPages.value.map(r => `### [${r.title}](${r.url})\n${r.snippet}`).join('\n\n');
                        }
                    } else if (provider === 'serp') {
                        if (!keys.serp) return "SerpAPI key is not configured.";
                        const res = await invoke('perform_http_request', {
                            url: `https://serpapi.com/search.json?q=${encodeURIComponent(params.query)}&api_key=${keys.serp}`,
                            method: 'GET',
                            headers: null,
                            body: null
                        });
                        const data = JSON.parse(res.text);
                        if (data.organic_results) {
                            out = data.organic_results.slice(0, 10).map(r => `### [${r.title}](${r.link})\n${r.snippet}`).join('\n\n');
                        }
                    } else {
                        // Fallback DuckDuckGo scraping
                        const html = await invoke('fetch_url_raw', { url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query)}`, method: "GET", body: null });
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, 'text/html');
                        const results = [];
                        const rows = doc.querySelectorAll('.web-result');
                        for (let i = 0; i < rows.length; i++) {
                            const titleEl = rows[i].querySelector('.result__title a');
                            if (titleEl) {
                                const title = titleEl.textContent.trim();
                                const rawUrl = titleEl.getAttribute('href');
                                let url = rawUrl;
                                if (rawUrl.includes('uddg=')) {
                                    const urlObj = new URL(rawUrl, 'https://duckduckgo.com');
                                    url = urlObj.searchParams.get('uddg') || rawUrl;
                                }
                                let snippet = '';
                                const snippetEl = rows[i].querySelector('.result__snippet');
                                if (snippetEl) {
                                    snippet = snippetEl.textContent.trim();
                                }
                                results.push(`### [${title}](${url})\n${snippet}`);
                            }
                        }
                        if (results.length > 0) {
                            out = results.slice(0, 10).join('\n\n');
                        } else {
                            out = "No results found. The search engine might be blocking the request.";
                        }
                    }

                    console.log(`[search_web] Returned to model:\n`, out.slice(0, 200) + '...');
                    return out;
                } catch (e) {
                    const out = `Failed to search web: ${e.message}`;
                    console.error(`[search_web] Returned to model:\n`, out);
                    return out;
                }
                
            case 'fetch_url':
                try {
                    const integrations = stateManager.getState().integrations || {};
                    const wfConfig = integrations.webFetch || { apiKeys: {} };
                    const jinaKey = wfConfig.apiKeys.jina || '';
                    
                    const jinaUrl = `https://r.jina.ai/${params.url}`;
                    let markdown;
                    
                    if (jinaKey) {
                        const res = await invoke('perform_http_request', {
                            url: jinaUrl,
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${jinaKey}` },
                            body: null
                        });
                        markdown = res.text;
                    } else {
                        markdown = await invoke('fetch_url_raw', { url: jinaUrl, method: "GET", body: null });
                    }
                    
                    if (!markdown || markdown.trim() === '') {
                        const out = "Failed to extract content from this page.";
                        console.log(`[fetch_url] Returned to model:\n`, out);
                        return out;
                    }
                    
                    // Store in cache and return only the first batch
                    const totalBatches = Math.ceil(markdown.length / BATCH_SIZE);
                    fetchCache.set(params.url, { content: markdown, offset: 1, totalBatches });
                    
                    const firstBatch = markdown.slice(0, BATCH_SIZE);
                    const out = totalBatches > 1
                        ? `[Batch 1 of ${totalBatches}] If the information you need is not here, call next_search_batch(url=${params.url}) for more.\n\n${firstBatch}`
                        : firstBatch;
                    
                    console.log(`[fetch_url] Batch 1/${totalBatches} returned to model:\n`, out.slice(0, 100) + '...');
                    return out;
                } catch (e) {
                    const out = `Failed to fetch URL: ${e.message}`;
                    console.error(`[fetch_url] Returned to model:\n`, out);
                    return out;
                }

            case 'next_search_batch':
                try {
                    const url = params.url;
                    const cached = fetchCache.get(url);
                    if (!cached) {
                        return `No cached content found for ${url}. Please call fetch_url first.`;
                    }
                    const { content, offset, totalBatches } = cached;
                    if (offset >= totalBatches) {
                        fetchCache.delete(url);
                        return `[End of content] All ${totalBatches} batches have been read for ${url}. No more content available.`;
                    }
                    const start = offset * BATCH_SIZE;
                    const end = start + BATCH_SIZE;
                    const batch = content.slice(start, end);
                    const newOffset = offset + 1;
                    fetchCache.set(url, { content, offset: newOffset, totalBatches });
                    const out = newOffset >= totalBatches
                        ? `[Batch ${newOffset} of ${totalBatches} — LAST BATCH]\n\n${batch}`
                        : `[Batch ${newOffset} of ${totalBatches}] If the information you need is not here, call next_search_batch(url=${url}) for more.\n\n${batch}`;
                    console.log(`[next_search_batch] Batch ${newOffset}/${totalBatches} returned to model:\n`, out);
                    return out;
                } catch (e) {
                    return `Failed to get next batch: ${e.message}`;
                }
                
            default:
                throw new Error(`Tool ${name} is not recognized.`);
        }
    } catch (error) {
        return `Error executing ${name}: ${error.message}`;
    }
}
