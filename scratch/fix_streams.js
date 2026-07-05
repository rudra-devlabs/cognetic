const fs = require('fs');
let c = fs.readFileSync('src/core/llmService.js', 'utf-8');

// callOpenAIStream and callAnthropicStream parsedTools definition
c = c.replace(
    /const parsedTools = Object\.values\(tool(?:Calls|Uses)\)[\s\S]*?filter\(tc => tc\.name\);/g,
    "const parsedTools = Object.values(arguments[0] || toolCalls || toolUses).map(tc => { let args = {}; try { args = JSON.parse(tc.args || '{}'); } catch (_) {} return { id: tc.id || 'call_' + Math.random().toString(36).substring(2), type: 'function', function: { name: (tc.name || '').split('.').pop(), arguments: JSON.stringify(args) } }; }).filter(tc => tc.function.name);"
);

// We'll be more specific because `toolCalls` and `toolUses` vary.
let openAiStreamMatch = c.match(/const parsedTools = Object\.values\(toolCalls\)/);
let anthropicStreamMatch = c.match(/const parsedTools = Object\.values\(toolUses\)/);
