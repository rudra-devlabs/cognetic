const fs = require('fs');

let text = fs.readFileSync('src/core/llmService.js', 'utf-8');

// The ultimate tool list (OpenAI format)
const OPENAI_TOOLS_STRING = `[
    { type: "function", function: { name: "search_web", description: "Search the web", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
    { type: "function", function: { name: "fetch_url", description: "Fetch a URL", parameters: { type: "object", properties: { url: { type: "string" }, search_intent: { type: "string" } }, required: ["url", "search_intent"] } } },
    { type: "function", function: { name: "next_search_batch", description: "Fetch next batch", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
    { type: "function", function: { name: "read_file", description: "Read full file content", parameters: { type: "object", properties: { filepath: { type: "string" } }, required: ["filepath"] } } },
    { type: "function", function: { name: "readlines", description: "Read a line range", parameters: { type: "object", properties: { filepath: { type: "string" }, startline: { type: "number" }, endline: { type: "number" } }, required: ["filepath", "startline", "endline"] } } },
    { type: "function", function: { name: "write_file", description: "Overwrite a file entirely", parameters: { type: "object", properties: { filepath: { type: "string" }, content: { type: "string" } }, required: ["filepath", "content"] } } },
    { type: "function", function: { name: "writelines", description: "Replace a line range", parameters: { type: "object", properties: { filepath: { type: "string" }, startline: { type: "number" }, endline: { type: "number" }, content: { type: "string" } }, required: ["filepath", "startline", "endline", "content"] } } },
    { type: "function", function: { name: "edit_file", description: "Replace a chunk of code in a file. IMPORTANT: If the code to be changed is greater than 5 lines, provide ONLY the first 2 lines and the last 2 lines of the target chunk separated by a single line with '...' in target_text.", parameters: { type: "object", properties: { filepath: { type: "string" }, target_text: { type: "string" }, content: { type: "string" } }, required: ["filepath", "target_text", "content"] } } },
    { type: "function", function: { name: "path_stats", description: "Check existence, size, type, line metadata", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
    { type: "function", function: { name: "list_files", description: "List files in a directory", parameters: { type: "object", properties: { dirpath: { type: "string" } }, required: ["dirpath"] } } },
    { type: "function", function: { name: "search_files", description: "Search files for a keyword (grep)", parameters: { type: "object", properties: { dirpath: { type: "string" }, query: { type: "string" } }, required: ["dirpath", "query"] } } },
    { type: "function", function: { name: "run_command", description: "Run a shell command", parameters: { type: "object", properties: { command: { type: "string" }, args: { type: "string" }, cwd: { type: "string" } }, required: ["command"] } } },
    { type: "function", function: { name: "semantic_search", description: "Perform a vector-similarity search across the codebase to find relevant code chunks.", parameters: { type: "object", properties: { project_path: { type: "string", description: "Absolute path of the active project." }, query: { type: "string", description: "The natural language query or code concept." }, top_k: { type: "number", description: "Optional number of results to return (default 8)." } }, required: ["project_path", "query"] } } }
]`;

// Anthropic format
const ANTHROPIC_TOOLS_STRING = OPENAI_TOOLS_STRING
    .replace(/\{ type: "function", function: /g, '')
    .replace(/ \} \}/g, ' }')
    .replace(/parameters:/g, 'input_schema:');

// Google format
const GOOGLE_TOOLS_STRING = OPENAI_TOOLS_STRING
    .replace(/\{ type: "function", function: /g, '')
    .replace(/ \} \}/g, ' }')
    .replace(/"object"/g, '"OBJECT"')
    .replace(/"string"/g, '"STRING"')
    .replace(/"number"/g, '"NUMBER"');

// We will inject these as constants at the top of the file
const injections = `
const OPENAI_TOOLS = ${OPENAI_TOOLS_STRING};
const ANTHROPIC_TOOLS = ${ANTHROPIC_TOOLS_STRING};
const GOOGLE_TOOLS = ${GOOGLE_TOOLS_STRING};
`;

// Replace the original OPENAI_TOOLS definition
text = text.replace(/export const OPENAI_TOOLS = \[\s*\{[\s\S]*?\];/m, 'export ' + injections.trim());

// Now, replace the hardcoded arrays inside the methods
text = text.replace(/const defaultTools = \[\s*\{[\s\S]*?\];/g, (match, offset) => {
    // If it's near callAnthropicStream, use ANTHROPIC_TOOLS
    if (text.substring(Math.max(0, offset - 200), offset).includes('callAnthropic')) return 'const defaultTools = ANTHROPIC_TOOLS;';
    if (text.substring(Math.max(0, offset - 200), offset).includes('callGoogle')) return 'const defaultTools = GOOGLE_TOOLS;';
    return 'const defaultTools = OPENAI_TOOLS;';
});

// Also replace the cases where defaultTools = OPENAI_TOOLS was already there, but we might need ANTHROPIC_TOOLS
text = text.replace(/const defaultTools = OPENAI_TOOLS;/g, (match, offset) => {
    if (text.substring(Math.max(0, offset - 200), offset).includes('callAnthropic')) return 'const defaultTools = ANTHROPIC_TOOLS;';
    if (text.substring(Math.max(0, offset - 200), offset).includes('callGoogle')) return 'const defaultTools = GOOGLE_TOOLS;';
    return match;
});

fs.writeFileSync('src/core/llmService.js', text, 'utf-8');
console.log('Fixed all schemas!');
