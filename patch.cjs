const fs = require('fs');

let text = fs.readFileSync('src/core/llmService.js', 'utf-8');

const openaiRunCmd = '{ type: "function", function: { name: "run_command", description: "Run a command", parameters: { type: "object", properties: { command: { type: "string" }, args: { type: "string" }, cwd: { type: "string" } }, required: ["command"] } } }';
const openaiSemSearch = ',\n            { type: "function", function: { name: "semantic_search", description: "Perform a vector-similarity search across the codebase to find relevant code chunks.", parameters: { type: "object", properties: { project_path: { type: "string", description: "Absolute path of the active project." }, query: { type: "string", description: "The natural language query or code concept." }, top_k: { type: "number", description: "Optional number of results to return (default 8)." } }, required: ["project_path", "query"] } } }';
text = text.replaceAll(openaiRunCmd, openaiRunCmd + openaiSemSearch);

const anthropicRunCmd = '{ name: "run_command", description: "Run a command", input_schema: { type: "object", properties: { command: { type: "string" }, args: { type: "string" }, cwd: { type: "string" } }, required: ["command"] } }';
const anthropicSemSearch = ',\n            { name: "semantic_search", description: "Perform a vector-similarity search across the codebase to find relevant code chunks.", input_schema: { type: "object", properties: { project_path: { type: "string", description: "Absolute path of the active project." }, query: { type: "string", description: "The natural language query or code concept." }, top_k: { type: "number", description: "Optional number of results to return (default 8)." } }, required: ["project_path", "query"] } }';
text = text.replaceAll(anthropicRunCmd, anthropicRunCmd + anthropicSemSearch);

const googleRunCmd = '{ name: "run_command", description: "Run a command", parameters: { type: "OBJECT", properties: { command: { type: "STRING" }, args: { type: "STRING" }, cwd: { type: "STRING" } }, required: ["command"] } }';
const googleSemSearch = ',\n            { name: "semantic_search", description: "Perform a vector-similarity search across the codebase to find relevant code chunks.", parameters: { type: "OBJECT", properties: { project_path: { type: "STRING", description: "Absolute path of the active project." }, query: { type: "STRING", description: "The natural language query or code concept." }, top_k: { type: "NUMBER", description: "Optional number of results to return (default 8)." } }, required: ["project_path", "query"] } }';
text = text.replaceAll(googleRunCmd, googleRunCmd + googleSemSearch);

fs.writeFileSync('src/core/llmService.js', text, 'utf-8');
console.log('Patched successfully!');
