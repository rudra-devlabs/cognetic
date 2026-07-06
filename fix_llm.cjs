const fs = require('fs');

let text = fs.readFileSync('src/core/llmService.js', 'utf-8');

// 1. Remove toolCallsToXml append logic
text = text.replace(/if\s*\(parsedTools\.length\s*>\s*0\)\s*\{\s*text\s*\+=\s*toolCallsToXml\(parsedTools\);\s*\}/g, '');

// 2. Fix parsedTools format and return object in callOpenAIStream
text = text.replace(
    /const parsedTools = Object\.values\(toolCalls\)\.map\(tc => \{\s*let args = \{\};\s*try \{ args = JSON\.parse\(tc\.args \|\| '\{\}'\); \} catch \(_\) \{\}\s*const name = \(tc\.name \|\| ''\)\.split\('\.'\)\.pop\(\);\s*return \{ name, args \};\s*\}\)\.filter\(tc => tc\.name\);/,
    `const parsedTools = Object.values(toolCalls).map(tc => {
            let args = {};
            try { args = JSON.parse(tc.args || '{}'); } catch (_) {}
            const name = (tc.name || '').split('.').pop();
            return { id: tc.id || 'call_' + Math.random().toString(36).substring(2), type: 'function', function: { name, arguments: JSON.stringify(args) } };
        }).filter(tc => tc.function.name);`
);
// Fix return in callOpenAIStream
text = text.replace(
    /return \{ text, stats: \{ inputTokens, outputTokens, timeMs, tps \} \};/g,
    `return { text, tool_calls: parsedTools, stats: { inputTokens, outputTokens, timeMs, tps } };`
);

// 3. Fix parsedTools format in callAnthropicStream
text = text.replace(
    /const parsedTools = Object\.values\(toolUses\)\.map\(tc => \{\s*let args = \{\};\s*try \{ args = JSON\.parse\(tc\.args \|\| '\{\}'\); \} catch \(_\) \{\}\s*return \{ name: tc\.name, args \};\s*\}\)\.filter\(tc => tc\.name\);/,
    `const parsedTools = Object.values(toolUses).map(tc => {
            let args = {};
            try { args = JSON.parse(tc.args || '{}'); } catch (_) {}
            return { id: 'call_' + Math.random().toString(36).substring(2), type: 'function', function: { name: tc.name, arguments: JSON.stringify(args) } };
        }).filter(tc => tc.function.name);`
);

// 4. Fix parsedTools format in callGoogleAIStream
text = text.replace(
    /const parsedTools = Object\.entries\(functionCalls\)\.map\(\(\[name, args\]\) => \(\{ name, args \}\)\);/,
    `const parsedTools = Object.entries(functionCalls).map(([name, args]) => ({ id: 'call_' + Math.random().toString(36).substring(2), type: 'function', function: { name, arguments: JSON.stringify(args || {}) } }));`
);

// We must also check the NON-streaming methods (callOpenAI, callAnthropic, callGoogleAI)
// In callOpenAI (around line 594-618)
text = text.replace(
    /if \(data\.choices\[0\]\.message\.tool_calls(?:.|\n)*?text \+= `<\/tool>\\n`;\s*\}\s*\}\s*\}/,
    `let parsedTools = [];
            if (data.choices[0].message.tool_calls && data.choices[0].message.tool_calls.length > 0) {
                parsedTools = data.choices[0].message.tool_calls.map(t => {
                    const name = (t.function.name || '').split('.').pop();
                    return { id: t.id || 'call_' + Math.random().toString(36).substring(2), type: 'function', function: { name, arguments: t.function.arguments || '{}' } };
                });
            }`
);

// Fix callAnthropic
text = text.replace(
    /if \(content\.type === 'tool_use'\)(?:.|\n)*?text \+= `<\/tool>\\n`;\s*\}/,
    `if (content.type === 'tool_use') {
                    parsedTools.push({
                        id: content.id || 'call_' + Math.random().toString(36).substring(2),
                        type: 'function',
                        function: { name: content.name, arguments: JSON.stringify(content.input || {}) }
                    });
                }`
);

// Fix callGoogleAI
text = text.replace(
    /if \(part\.functionCall\)(?:.|\n)*?text \+= `<\/tool>\\n`;\s*\}/,
    `if (part.functionCall) {
                    parsedTools.push({
                        id: 'call_' + Math.random().toString(36).substring(2),
                        type: 'function',
                        function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args || {}) }
                    });
                }`
);

fs.writeFileSync('src/core/llmService.js', text, 'utf-8');
console.log('Fixed llmService.js tool bindings completely!');
