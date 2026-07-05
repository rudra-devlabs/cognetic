const fs = require('fs');
let content = fs.readFileSync('src/core/llmService.js', 'utf-8');

// 1. Fix callOpenAIStream
content = content.replace(
    /const parsedTools = Object\.values\(toolCalls\)\.map\(tc => \{[\s\S]*?\}\)\.filter\(tc => tc\.name\);\s*if \(parsedTools\.length > 0\) \{\s*text \+= toolCallsToXml\(parsedTools\);\s*\}/,
    `const parsedTools = Object.values(toolCalls).map(tc => {
            let args = {};
            try { args = JSON.parse(tc.args || '{}'); } catch (_) {}
            const name = (tc.name || '').split('.').pop();
            return { id: tc.id || 'call_' + Math.random().toString(36).substring(2), type: 'function', function: { name, arguments: JSON.stringify(args) } };
        }).filter(tc => tc.function.name);`
);
content = content.replace(
    /return \{ text, stats: \{ inputTokens, outputTokens, timeMs, tps \} \};/g,
    "return { text, tool_calls: parsedTools, stats: { inputTokens, outputTokens, timeMs, tps } };"
);

// 2. Fix callAnthropicStream
content = content.replace(
    /const parsedTools = Object\.values\(toolUses\)\.map\(tc => \{[\s\S]*?\}\)\.filter\(tc => tc\.name\);\s*if \(parsedTools\.length > 0\) \{\s*text \+= toolCallsToXml\(parsedTools\);\s*\}/,
    `const parsedTools = Object.entries(toolUses).map(([id, tc]) => {
            let args = {};
            try { args = JSON.parse(tc.args || '{}'); } catch (_) {}
            return { id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(args) } };
        }).filter(tc => tc.function.name);`
);

// 3. Fix callGoogleAI
content = content.replace(
    /const defaultTools = \[\s*\{ name: "search_web"[\s\S]*?\];/,
    "const defaultTools = OPENAI_TOOLS;"
);
content = content.replace(
    /tools: \[\{ functionDeclarations: defaultTools \}\]/,
    "tools: defaultTools"
);
// For callGoogleAI parsing (non-stream)
content = content.replace(
    /if \(part\.text\) \{\s*text \+= part\.text;\s*\} else if \(part\.functionCall\) \{[\s\S]*?\}\s*\}/,
    `if (part.text) {
                    text += part.text;
                } else if (part.functionCall) {
                    if (!parsedTools) parsedTools = [];
                    parsedTools.push({ id: 'call_' + Math.random().toString(36).substring(2), type: 'function', function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args || {}) } });
                }`
);
content = content.replace(
    /let text = '';\s*const parts = data\.candidates\[0\]\.content\.parts \|\| \[\];/,
    "let text = ''; let parsedTools = []; const parts = data.candidates[0].content.parts || [];"
);
content = content.replace(
    /return \{ text, stats: \{ inputTokens, outputTokens, timeMs, tps \} \};/g,
    "return { text, tool_calls: parsedTools, stats: { inputTokens, outputTokens, timeMs, tps } };"
);

// 4. Fix callGoogleAIStream
content = content.replace(
    /const defaultTools = \[\s*\{ name: "search_web"[\s\S]*?\];/,
    "const defaultTools = OPENAI_TOOLS;"
);
content = content.replace(
    /tools: \[\{ functionDeclarations: defaultTools \}\]/,
    "tools: defaultTools"
);
// For callGoogleAIStream parsing
content = content.replace(
    /if \(part\.text\) \{\s*text \+= part\.text;\s*emit\(\);\s*\} else if \(part\.functionCall\) \{[\s\S]*?\}\s*\}/,
    `if (part.text) {
                            text += part.text;
                            emit();
                        } else if (part.functionCall) {
                            const name = part.functionCall.name;
                            if (!functionCalls[name]) {
                                functionCalls[name] = part.functionCall.args || {};
                            }
                        }`
);
content = content.replace(
    /const parsedTools = Object\.entries\(functionCalls\)\.map\(\(\[name, args\]\) => \(\{ name, args \}\)\);\s*if \(parsedTools\.length > 0\) \{\s*text \+= toolCallsToXml\(parsedTools\);\s*\}/,
    `const parsedTools = Object.entries(functionCalls).map(([name, args]) => ({ id: 'call_' + Math.random().toString(36).substring(2), type: 'function', function: { name, arguments: JSON.stringify(args || {}) } }));`
);

fs.writeFileSync('src/core/llmService.js', content);
