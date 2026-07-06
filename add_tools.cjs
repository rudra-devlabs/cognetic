const fs = require('fs');

let text = fs.readFileSync('src/core/llmService.js', 'utf-8');

// 1. OpenAI format
text = text.replace(
    /\{ type: "function", function: \{ name: "read_file", [^\}]+\} \} \},/g,
    `$&
            { type: "function", function: { name: "readlines", description: "Read specific lines from a file", parameters: { type: "object", properties: { filepath: { type: "string" }, startline: { type: "string" }, endline: { type: "string" } }, required: ["filepath", "startline", "endline"] } } },
            { type: "function", function: { name: "writelines", description: "Replace specific lines in a file", parameters: { type: "object", properties: { filepath: { type: "string" }, startline: { type: "string" }, endline: { type: "string" }, content: { type: "string" } }, required: ["filepath", "startline", "endline", "content"] } } },`
);

// 2. Anthropic format
text = text.replace(
    /\{ name: "read_file", description: "Read a file", input_schema: [^\}]+\} \},/g,
    `$&
            { name: "readlines", description: "Read specific lines from a file", input_schema: { type: "object", properties: { filepath: { type: "string" }, startline: { type: "string" }, endline: { type: "string" } }, required: ["filepath", "startline", "endline"] } },
            { name: "writelines", description: "Replace specific lines in a file", input_schema: { type: "object", properties: { filepath: { type: "string" }, startline: { type: "string" }, endline: { type: "string" }, content: { type: "string" } }, required: ["filepath", "startline", "endline", "content"] } },`
);

// 3. Google AI format
text = text.replace(
    /\{ name: "read_file", description: "Read a file", parameters: [^\}]+\} \},/g,
    `$&
            { name: "readlines", description: "Read specific lines from a file", parameters: { type: "OBJECT", properties: { filepath: { type: "STRING" }, startline: { type: "STRING" }, endline: { type: "STRING" } }, required: ["filepath", "startline", "endline"] } },
            { name: "writelines", description: "Replace specific lines in a file", parameters: { type: "OBJECT", properties: { filepath: { type: "STRING" }, startline: { type: "STRING" }, endline: { type: "STRING" }, content: { type: "STRING" } }, required: ["filepath", "startline", "endline", "content"] } },`
);

fs.writeFileSync('src/core/llmService.js', text, 'utf-8');
console.log('Successfully injected readlines and writelines schemas into all 6 tool arrays!');
