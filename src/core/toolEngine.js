import { invoke } from '@tauri-apps/api/core';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { SYSTEM_PROMPT } from '../config/systemPrompt.js';
import { stateManager } from './state.js';
import { llmService } from './llmService.js';
import { changeTracker } from './changeTracker.js';

// Legacy XML parsers removed for native JSON tool calling migration
export function parseToolCall(text) { return null; }
export function parseAllToolCalls(text) { return []; }

// In-memory cache for batched fetch_url results
// Key: URL, Value: { content: string, offset: number, totalBatches: number }
const BATCH_SIZE = 4000; // ~1000 tokens (4 chars/token estimate)
const MAX_CACHE_ENTRIES = 20; // LRU-lite: oldest entry is evicted when limit is exceeded
const fetchCache = new Map();

/** Insert into fetchCache with LRU-lite eviction. */
function cacheSet(url, value) {
    if (fetchCache.size >= MAX_CACHE_ENTRIES) {
        // Map preserves insertion order; delete the first (oldest) entry
        const oldestKey = fetchCache.keys().next().value;
        fetchCache.delete(oldestKey);
    }
    fetchCache.set(url, value);
}

function getSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    const len1 = s1.length;
    const len2 = s2.length;
    if (len1 === 0 || len2 === 0) return 0.0;
    
    let prev = new Array(len2 + 1);
    let curr = new Array(len2 + 1);
    for (let j = 0; j <= len2; j++) prev[j] = j;
    
    for (let i = 1; i <= len1; i++) {
        curr[0] = i;
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        let temp = prev; prev = curr; curr = temp;
    }
    return 1 - (prev[len2] / Math.max(len1, len2));
}

function findFuzzyChunk(lines, targetLines, startIdx = 0) {
    const targetStr = targetLines.join('\n');
    const targetLen = targetLines.length;
    
    for (let i = startIdx; i <= lines.length - targetLen; i++) {
        let exact = true;
        for (let j = 0; j < targetLen; j++) {
            if (lines[i+j] !== targetLines[j]) {
                exact = false; break;
            }
        }
        if (exact) return { similarity: 1, start: i, end: i + targetLen - 1 };
    }
    
    let bestMatch = { similarity: 0, start: -1, end: -1 };
    for (let i = startIdx; i <= lines.length - targetLen; i++) {
        for (let windowSize = Math.max(1, targetLen - 1); windowSize <= Math.min(lines.length - i, targetLen + 1); windowSize++) {
            const windowStr = lines.slice(i, i + windowSize).join('\n');
            const sim = getSimilarity(windowStr, targetStr);
            if (sim > bestMatch.similarity) bestMatch = { similarity: sim, start: i, end: i + windowSize - 1 };
        }
    }
    return bestMatch;
}

export async function executeTool(toolCall, basePaths = [], abortSignal = null, cancelController = null) {
    const rawResult = await _executeToolInternal(toolCall, basePaths, abortSignal, cancelController);
    if (typeof rawResult === 'string' && rawResult.length > 12000) {
        return rawResult.substring(0, 12000) + "\n\n[Result truncated because it exceeds 12,000 characters. Please use tools more specifically (like readlines with a line range) to avoid filling the context window.]";
    }
    return rawResult;
}

async function _executeToolInternal(toolCall, basePaths = [], abortSignal = null, cancelController = null) {
    const name = toolCall.function ? toolCall.function.name : toolCall.name;
    let params = {};
    try {
        if (toolCall.function && toolCall.function.arguments) {
            params = JSON.parse(toolCall.function.arguments);
        } else if (toolCall.params) {
            params = toolCall.params;
        }
    } catch(e) {
        throw new Error(`Failed to parse arguments for tool ${name}: ${e.message}`);
    }
    
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
                return await invoke('get_path_stats', { basePaths, path: await validatePath(params.path) });
                
            case 'read_file':
                return await invoke('read_file_content', { basePaths, path: await validatePath(params.filepath) });
                
            case 'write_file': {
                const wfPath = await validatePath(params.filepath);
                let wfBefore = "";
                try { wfBefore = await invoke('read_file_content', { basePaths, path: wfPath }); } catch(e) {}
                await invoke('write_file_content', { basePaths, path: wfPath, content: params.content });
                changeTracker.record(wfPath, wfBefore, params.content);
                return `Successfully wrote to ${params.filepath}`;
            }
                
            case 'list_files':
                const entries = await invoke('list_directory', { basePaths, path: await validatePath(params.dirpath) });
                return entries.join('\n');
                
            case 'search_files': {
                try {
                    const matches = await invoke('grep_search', { 
                        basePaths, 
                        dirpath: params.dirpath, 
                        pattern: params.query, 
                        include: null 
                    });
                    if (!matches || matches.length === 0) return "No matches found.";
                    return matches.map(m => `[${m.file}:${m.line}] ${m.content.trim()}`).join('\n');
                } catch (err) {
                    return `Error searching files: ${err.message || err}`;
                }
            }
                
            case 'readlines':
                const linesContent = await invoke('read_file_content', { basePaths, path: await validatePath(params.filepath) });
                const allLines = linesContent.split(/\r?\n/);
                const start = parseInt(params.startline) || 1;
                const end = parseInt(params.endline) || allLines.length;
                return allLines.slice(start - 1, end).join('\n');
                
            case 'writelines': {
                const targetPath = await validatePath(params.filepath);
                const fileContent = await invoke('read_file_content', { basePaths, path: targetPath });
                const lines = fileContent.split(/\r?\n/);
                const s = parseInt(params.startline) || 1;
                const e = parseInt(params.endline) || s;
                
                // Replace the slice
                lines.splice(s - 1, e - s + 1, params.content);
                const afterWlContent = lines.join('\n');
                await invoke('write_file_content', { basePaths, path: targetPath, content: afterWlContent });
                changeTracker.record(targetPath, fileContent, afterWlContent);
                return `Successfully replaced lines ${s} to ${e} in ${params.filepath}`;
            }
                
            case 'edit_file': {
                const editTargetPath = await validatePath(params.filepath);
                const editFileContent = await invoke('read_file_content', { basePaths, path: editTargetPath });
                let newContent = editFileContent;
                
                const newText = params.content !== undefined ? params.content : '';

                if (params.target_text !== undefined) {
                    const lines = editFileContent.split(/\r?\n/);
                    const targetParts = params.target_text.split(/\r?\n\.\.\.\r?\n/);
                    
                    if (targetParts.length >= 2) {
                        const topLines = targetParts[0].split(/\r?\n/);
                        const bottomLines = targetParts[targetParts.length - 1].split(/\r?\n/);
                        
                        const topMatch = findFuzzyChunk(lines, topLines, 0);
                        if (topMatch.similarity < 0.95) throw new Error(`Could not find a 95% match for the top anchor (found ${Math.round(topMatch.similarity * 100)}%).`);
                        
                        const bottomMatch = findFuzzyChunk(lines, bottomLines, topMatch.end + 1);
                        if (bottomMatch.similarity < 0.95) throw new Error(`Could not find a 95% match for the bottom anchor (found ${Math.round(bottomMatch.similarity * 100)}%).`);
                        
                        lines.splice(topMatch.start, bottomMatch.end - topMatch.start + 1, newText);
                        newContent = lines.join('\n');
                    } else {
                        const targetLines = params.target_text.split(/\r?\n/);
                        const match = findFuzzyChunk(lines, targetLines, 0);
                        if (match.similarity < 0.95) throw new Error(`Could not find a 95% match for the target text (found ${Math.round(match.similarity * 100)}%).`);
                        
                        lines.splice(match.start, match.end - match.start + 1, newText);
                        newContent = lines.join('\n');
                    }
                } else {
                    throw new Error("Must provide target_text for edit_file.");
                }

                await invoke('write_file_content', { basePaths, path: editTargetPath, content: newContent });
                changeTracker.record(editTargetPath, editFileContent, newContent);
                const allChanges = changeTracker.getChanges();
                const lastChange = allChanges[allChanges.length - 1];
                return { 
                    text: `Successfully edited ${params.filepath}`, 
                    patch: lastChange ? lastChange.patch : '', 
                    additions: lastChange ? lastChange.additions : 0, 
                    deletions: lastChange ? lastChange.deletions : 0 
                };
            }
                
            case 'glob':
                const globPattern = params.pattern || '*';
                const baseDir = params.dirpath ? await validatePath(params.dirpath) : null;
                const matches = await invoke('glob_path', { basePaths, pattern: globPattern, dirpath: baseDir });
                return matches.length > 0 ? matches.join('\n') : "No matches found.";
                
            case 'grep':
                const grepTarget = await validatePath(params.dirpath);
                const grepMatches = await invoke('grep_search', { basePaths, 
                    dirpath: grepTarget, 
                    pattern: params.pattern,
                    include: params.include 
                });
                if (grepMatches.length === 0) return "No matches found.";
                return grepMatches.map(m => `${m.file}:${m.line} => ${m.content}`).join('\n');
                
            case 'tree':
                const treeTarget = await validatePath(params.dirpath);
                return await invoke('get_tree', { basePaths, dirpath: treeTarget });
                
            case 'delete_path':
                await invoke('delete_path', { basePaths, 
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
                    if (typeof e === 'object' && e !== null) {
                        throw new Error(e.message || JSON.stringify(e));
                    }
                    throw new Error(e);
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
                    cacheSet(params.url, { content: markdown, offset: 1, totalBatches });
                    
                    const firstBatch = markdown.slice(0, BATCH_SIZE);
                    let out = totalBatches > 1
                        ? `[Batch 1 of ${totalBatches}] If the information you need is not here, call next_search_batch(url=${params.url}) for more.\n\n${firstBatch}`
                        : firstBatch;
                    
                    const searchIntent = params.search_intent;
                    const sumModel = stateManager.getState().searchSummarizationModel;
                    
                    console.log(`[fetch_url] Summarizer Check - searchIntent: "${searchIntent}", sumModel: "${sumModel}"`);
                    
                    if (searchIntent && sumModel) {
                        const sysPrompt = `You are an intelligent web search summarizer. The main AI model is trying to extract specific information from a web page.
Your goal is to read the provided web page content and produce a concise 1-2 paragraph summary with keypoints that directly answers what the main model is looking for.
If the provided content does not contain the information requested, but there are more batches available, you can fetch the next chunk of the page by calling the next_search_batch tool.
If you find the answer, DO NOT call the tool. Just output the summary. If the content says [End of content] and you haven't found the answer, just state that the information was not found.`;
                        
                        let sumMessages = [{
                            role: 'user', 
                            content: `Search Intent (What the main model wants to find): "${searchIntent}"\n\nWeb Content Batch for URL (${params.url}):\n${out}`
                        }];
                        
                        let currentResponse = await llmService.summarizeWebSearch(sumMessages, sysPrompt, sumModel, abortSignal);
                        
                        let maxLoops = 15;
                        while (currentResponse && currentResponse.tool_calls && currentResponse.tool_calls.some(tc => tc.function.name === 'next_search_batch') && maxLoops > 0) {
                            maxLoops--;
                            
                            // Feed the model's tool call back into history
                            const tc = currentResponse.tool_calls.find(t => t.function.name === 'next_search_batch');
                            sumMessages.push({ role: 'assistant', content: currentResponse.text || '', tool_calls: [tc] });
                            
                            const cached = fetchCache.get(params.url);
                            let nextOut = "";
                            if (!cached || cached.offset >= cached.totalBatches) {
                                nextOut = "[End of content] No more batches available.";
                            } else {
                                const start = cached.offset * BATCH_SIZE;
                                const end = start + BATCH_SIZE;
                                const batch = cached.content.slice(start, end);
                                cached.offset += 1;
                                cacheSet(params.url, cached);
                                
                                nextOut = cached.offset >= cached.totalBatches
                                    ? `[Batch ${cached.offset} of ${cached.totalBatches} — LAST BATCH]\n\n${batch}`
                                    : `[Batch ${cached.offset} of ${cached.totalBatches}] If the information you need is not here, call next_search_batch(url=${params.url}) for more.\n\n${batch}`;
                            }
                            
                            // Feed the tool result into history
                            sumMessages.push({ role: 'tool', tool_call_id: tc.id, name: 'next_search_batch', content: nextOut });
                            currentResponse = await llmService.summarizeWebSearch(sumMessages, sysPrompt, sumModel, abortSignal);
                        }
                        
                        const finalSummaryText = currentResponse ? currentResponse.text : null;
                        if (finalSummaryText) {
                            out = `[Summarized Web Content]\n${finalSummaryText}`;
                            console.log(`[fetch_url] Generated Summary:\n`, finalSummaryText);
                        } else {
                            console.warn(`[fetch_url] Summarizer returned null or failed.`);
                        }
                    } else {
                        console.log(`[fetch_url] Skipping summarization (searchIntent: ${!!searchIntent}, sumModel: ${!!sumModel})`);
                    }
                    
                    console.log(`[fetch_url] Returned to model:\n`, out.slice(0, 200) + '...');
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
                    cacheSet(url, { content, offset: newOffset, totalBatches });
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
        return `Error executing ${name}: ${error.message || error}`;
    }
}
