async callGoogleAI(baseUrl, apiKey, modelId, messages, systemPrompt, abortSignal, providerName) {
        let endpoint = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const apiPath = providerName && PROVIDERS_CONFIG[providerName] ? (PROVIDERS_CONFIG[providerName].apiPath || '') : '';
        if (apiPath && !endpoint.endsWith(apiPath)) {
            endpoint += apiPath;
        }
        
        // Google uses a totally different URL format: /v1beta/models/<model>:generateContent?key=<key>
        if (endpoint.endsWith('/v1beta')) {
             endpoint += `/models/${modelId}:generateContent?key=${apiKey}`;
        } else {
             // If they don't have v1beta in the path, add it
             endpoint += `/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
        }
        
        // Map standard roles to Google roles
        const formattedMessages = messages.filter(m => m.role !== 'system').map(m => {
            const role = m.role === 'assistant' ? 'model' : m.role;
            const parts = [];
            if (m.content) {
                parts.push({ text: m.content });
            }
            if (m.images && m.images.length > 0) {
                m.images.forEach(imgUrl => {
                    const match = imgUrl.match(/^data:(image\/[a-zA-Z]*);base64,(.*)$/);
                    if (match) {
                        parts.push({
                            inlineData: {
                                mimeType: match[1],
                                data: match[2]
                            }
                        });
                    }
                });
            }
            return {
                role: role,
                parts: parts
            };
        });
        
        const headers = {
            'Content-Type': 'application/json'
        };
        
        const defaultTools = [
            { name: "search_web", description: "Search the web", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
            { name: "fetch_url", description: "Fetch a URL", parameters: { type: "OBJECT", properties: { url: { type: "STRING" }, search_intent: { type: "STRING" } }, required: ["url", "search_intent"] } },
            { name: "next_search_batch", description: "Fetch next batch", parameters: { type: "OBJECT", properties: { url: { type: "STRING" } }, required: ["url"] } },
            { name: "read_file", description: "Read a file", parameters: { type: "OBJECT", properties: { filepath: { type: "STRING" } }, required: ["filepath"] } },
            { name: "write_file", description: "Write a file", parameters: { type: "OBJECT", properties: { filepath: { type: "STRING" }, content: { type: "STRING" } }, required: ["filepath", "content"] } },
            { name: "run_command", description: "Run a command", parameters: { type: "OBJECT", properties: { command: { type: "STRING" }, args: { type: "STRING" }, cwd: { type: "STRING" } }, required: ["command"] } }
        ];

        const body = JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: formattedMessages,
            tools: [{ functionDeclarations: defaultTools }]
        });
        
        const startTime = Date.now();
        const fetchOptions = {
            url: endpoint,
            method: 'POST',
            headers,
            body
        };

        let response;
        try {
            response = await invoke('perform_http_request', fetchOptions);
        } catch (e) {
            throw new Error(`Network/CORS Error: ${e.message || e}`);
        }
        
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Google AI Error (${response.status}): ${response.text}`);
        }
        
        const data = JSON.parse(response.text);
        const endTime = Date.now();
        const timeMs = endTime - startTime;
        
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            let text = '';
            const parts = data.candidates[0].content.parts || [];
            for (const part of parts) {
                if (part.text) {
                    text += part.text;
                } else if (part.functionCall) {
                    const name = part.functionCall.name;
                    const args = part.functionCall.args || {};
                    text += `\n<tool name="${name}">\n`;
                    for (const [k, v] of Object.entries(args)) {
                        text += `${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}\n`;
                    }
                    text += `</tool>\n`;
                }
            }
            let inputTokens = 0;
            let outputTokens = 0;
            if (data.usageMetadata) {
                inputTokens = data.usageMetadata.promptTokenCount || 0;
                outputTokens = data.usageMetadata.candidatesTokenCount || 0;
            }
            const tps = outputTokens > 0 && timeMs > 0 ? (outputTokens / (timeMs / 1000)).toFixed(1) : 0;
            return { text, stats: { inputTokens, outputTokens, timeMs, tps } };
        } else {
            throw new Error("Invalid response format from Google AI Studio API");
        }
    }

    async callOpenAIStream(baseUrl, apiKey, modelId, messages, systemPrompt, abortSignal, providerName, onChunk) {
        let endpoint = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const hasVersionPath = /\/v\d+([a-zA-Z0-9.-]*)$/.test(endpoint) || endpoint.endsWith('/chat/completions');
        const apiPath = providerName && PROVIDERS_CONFIG[providerName] ? (PROVIDERS_CONFIG[providerName].apiPath || '') : '';
        if (apiPath && !endpoint.endsWith(apiPath) && !hasVersionPath) {
            endpoint += apiPath;
        }
        if (!endpoint.endsWith('/chat/completions')) {
            endpoint += '/chat/completions';
        }

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const finalMessages = [{ role: 'system', content: systemPrompt }, ...messages.map(m => {
            if (m.images && m.images.length > 0) {
                const contentParts = [];
                if (m.content) contentParts.push({ type: 'text', text: m.content });
                m.images.forEach(imgUrl => {
                    contentParts.push({ type: 'image_url', image_url: { url: imgUrl } });
                });
                const { images, stats, ...rest } = m;
                return { ...rest, content: contentParts };
            }
            const { images, stats, ...rest } = m;
            return rest;
        })];

        const defaultTools = [
            { type: "function", function: { name: "search_web", description: "Search the web", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
            { type: "function", function: { name: "fetch_url", description: "Fetch a URL", parameters: { type: "object", properties: { url: { type: "string" }, search_intent: { type: "string" } }, required: ["url", "search_intent"] } } },
            { type: "function", function: { name: "next_search_batch", description: "Fetch next batch", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
            { type: "function", function: { name: "read_file", description: "Read a file", parameters: { type: "object", properties: { filepath: { type: "string" } }, required: ["filepath"] } } },
            { type: "function", function: { name: "write_file", description: "Write a file", parameters: { type: "object", properties: { filepath: { type: "string" }, content: { type: "string" } }, required: ["filepath", "content"] } } },
            { type: "function", function: { name: "run_command", description: "Run a command", parameters: { type: "object", properties: { command: { type: "string" }, args: { type: "string" }, cwd: { type: "string" } }, required: ["command"] } } }
        ];

        const body = JSON.stringify({
            model: modelId,
            messages: finalMessages,
            stream: true,
            tools: defaultTools
        });

        const startTime = Date.now();
        let text = '';
        const toolCalls = {};
        let usage = null;

        const emit = () => onChunk(text);

        await this._streamHttpRequest({
            url: endpoint,
            method: 'POST',
            headers,
            body,
            abortSignal,
            onLine: (line) => {
                if (!line.startsWith('data: ')) return;
                const data = line.slice(6).trim();
                if (data === '[DONE]') return;
                try {
                    const json = JSON.parse(data);
                    const delta = json.choices?.[0]?.delta;
                    if (delta?.content) {
                        text += delta.content;
                        emit();
                    }
                    if (delta?.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            const idx = tc.index ?? 0;
                            if (!toolCalls[idx]) {
                                toolCalls[idx] = { name: '', args: '' };
                            }
                            if (tc.function?.name) {
                                toolCalls[idx].name += tc.function.name;
                            }
                            if (tc.function?.arguments) {
                                toolCalls[idx].args += tc.function.arguments;
                            }
                        }
                    }
                    if (json.usage) usage = json.usage;
                } catch (_) { /* ignore partial JSON */ }
            }
        });

        const parsedTools = Object.values(toolCalls).map(tc => {
            let args = {};
            try { args = JSON.parse(tc.args || '{}'); } catch (_) {}
            const name = (tc.name || '').split('.').pop();
            return { name, args };
        }).filter(tc => tc.name);

        if (parsedTools.length > 0) {
            text += toolCallsToXml(parsedTools);
        }

        const endTime = Date.now();
        const timeMs = endTime - startTime;
        const inputTokens = usage?.prompt_tokens || 0;
        const outputTokens = usage?.completion_tokens || 0;
        const tps = outputTokens > 0 && timeMs > 0 ? (outputTokens / (timeMs / 1000)).toFixed(1) : 0;
        return { text, stats: { inputTokens, outputTokens, timeMs, tps } };
    }

    async callAnthropicStream(baseUrl, apiKey, modelId, messages, systemPrompt, abortSignal, providerName, onChunk) {
        let endpoint = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const apiPath = providerName && PROVIDERS_CONFIG[providerName] ? (PROVIDERS_CONFIG[providerName].apiPath || '') : '';
        if (apiPath && !endpoint.endsWith(apiPath)) {
            endpoint += apiPath;
        }
        if (!endpoint.endsWith('/messages')) {
            endpoint += '/messages';
        }

        const formattedMessages = messages.filter(m => m.role !== 'system').map(m => {
            if (m.images && m.images.length > 0) {
                const contentParts = [];
                m.images.forEach(imgUrl => {
                    const match = imgUrl.match(/^data:(image\/[a-zA-Z]*);base64,(.*)$/);
                    if (match) {
                        contentParts.push({
                            type: "image",
                            source: { type: "base64", media_type: match[1], data: match[2] }
                        });
                    }
                });
                if (m.content) contentParts.push({ type: 'text', text: m.content });
                const { images, stats, ...rest } = m;
                return { ...rest, content: contentParts.length > 0 ? contentParts : m.content };
            }
            const { images, stats, ...rest } = m;
            return rest;
        });

        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        };

        const defaultTools = [
            { name: "search_web", description: "Search the web", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
            { name: "fetch_url", description: "Fetch a URL", input_schema: { type: "object", properties: { url: { type: "string" }, search_intent: { type: "string" } }, required: ["url", "search_intent"] } },
            { name: "next_search_batch", description: "Fetch next batch", input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
            { name: "read_file", description: "Read a file", input_schema: { type: "object", properties: { filepath: { type: "string" } }, required: ["filepath"] } },
            { name: "write_file", description: "Write a file", input_schema: { type: "object", properties: { filepath: { type: "string" }, content: { type: "string" } }, required: ["filepath", "content"] } },
            { name: "run_command", description: "Run a command", input_schema: { type: "object", properties: { command: { type: "string" }, args: { type: "string" }, cwd: { type: "string" } }, required: ["command"] } }
        ];

        const body = JSON.stringify({
            model: modelId,
            max_tokens: 4096,
            system: systemPrompt,
            messages: formattedMessages,
            tools: defaultTools,
            stream: true
        });

        const startTime = Date.now();
        let text = '';
        const toolUses = {};
        let currentToolId = null;
        let usage = null;

        const emit = () => onChunk(text);

        await this._streamHttpRequest({
            url: endpoint,
            method: 'POST',
            headers,
            body,
            abortSignal,
            onLine: (line) => {
                if (!line.startsWith('data: ')) return;
                const data = line.slice(6).trim();
                if (!data || data === '[DONE]') return;
                try {
                    const json = JSON.parse(data);
                    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                        text += json.delta.text || '';
                        emit();
                    } else if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
                        currentToolId = json.content_block.id;
                        toolUses[currentToolId] = { name: json.content_block.name, args: '' };
                    } else if (json.type === 'content_block_delta' && json.delta?.type === 'input_json_delta') {
                        if (currentToolId && toolUses[currentToolId]) {
                            toolUses[currentToolId].args += json.delta.partial_json || '';
                        }
                    } else if (json.type === 'message_delta' && json.usage) {
                        usage = { ...usage, ...json.usage };
                    } else if (json.type === 'message_start' && json.message?.usage) {
                        usage = { ...usage, ...json.message.usage };
                    }
                } catch (_) { /* ignore partial JSON */ }
            }
        });

        const parsedTools = Object.values(toolUses).map(tc => {
            let args = {};
            try { args = JSON.parse(tc.args || '{}'); } catch (_) {}
            return { name: tc.name, args };
        }).filter(tc => tc.name);

        if (parsedTools.length > 0) {
            text += toolCallsToXml(parsedTools);
        }

        const endTime = Date.now();
        const timeMs = endTime - startTime;
        const inputTokens = usage?.input_tokens || 0;
        const outputTokens = usage?.output_tokens || 0;
        const tps = outputTokens > 0 && timeMs > 0 ? (outputTokens / (timeMs / 1000)).toFixed(1) : 0;
        return { text, stats: { inputTokens, outputTokens, timeMs, tps } };
    }

    async callGoogleAIStream(baseUrl, apiKey, modelId, messages, systemPrompt, abortSignal, providerName, onChunk) {
        let endpoint = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const apiPath = providerName && PROVIDERS_CONFIG[providerName] ? (PROVIDERS_CONFIG[providerName].apiPath || '') : '';
        if (apiPath && !endpoint.endsWith(apiPath)) {
            endpoint += apiPath;
        }

        if (endpoint.endsWith('/v1beta')) {
            endpoint += `/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;
        } else {
            endpoint += `/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;
        }

        const formattedMessages = messages.filter(m => m.role !== 'system').map(m => {
            const role = m.role === 'assistant' ? 'model' : m.role;
            const parts = [];
            if (m.content) parts.push({ text: m.content });
            if (m.images && m.images.length > 0) {
                m.images.forEach(imgUrl => {
                    const match = imgUrl.match(/^data:(image\/[a-zA-Z]*);base64,(.*)$/);
                    if (match) {
                        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
                    }
                });
            }
            return { role, parts };
        });

        const headers = { 'Content-Type': 'application/json' };

        const defaultTools = [
            { name: "search_web", description: "Search the web", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
            { name: "fetch_url", description: "Fetch a URL", parameters: { type: "OBJECT", properties: { url: { type: "STRING" }, search_intent: { type: "STRING" } }, required: ["url", "search_intent"] } },
            { name: "next_search_batch", description: "Fetch next batch", parameters: { type: "OBJECT", properties: { url: { type: "STRING" } }, required: ["url"] } },
            { name: "read_file", description: "Read a file", parameters: { type: "OBJECT", properties: { filepath: { type: "STRING" } }, required: ["filepath"] } },
            { name: "write_file", description: "Write a file", parameters: { type: "OBJECT", properties: { filepath: { type: "STRING" }, content: { type: "STRING" } }, required: ["filepath", "content"] } },
            { name: "run_command", description: "Run a command", parameters: { type: "OBJECT", properties: { command: { type: "STRING" }, args: { type: "STRING" }, cwd: { type: "STRING" } }, required: ["command"] } }
        ];

        const body = JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: formattedMessages,
            tools: [{ functionDeclarations: defaultTools }]
        });

        const startTime = Date.now();
        let text = '';
        const functionCalls = {};
        let usage = null;

        const emit = () => onChunk(text);

        await this._streamHttpRequest({
            url: endpoint,
            method: 'POST',
            headers,
            body,
            abortSignal,
            onLine: (line) => {
                if (!line.startsWith('data: ')) return;
                const data = line.slice(6).trim();
                if (!data || data === '[DONE]') return;
                try {
                    const json = JSON.parse(data);
                    const parts = json.candidates?.[0]?.content?.parts || [];
                    for (const part of parts) {
                        if (part.text) {
                            text += part.text;
                            emit();
                        } else if (part.functionCall) {
                            const name = part.functionCall.name;
                            if (!functionCalls[name]) {
                                functionCalls[name] = part.functionCall.args || {};
                            }
                        }
                    }
                    if (json.usageMetadata) usage = json.usageMetadata;
                } catch (_) { /* ignore partial JSON */ }
            }
        });

        const parsedTools = Object.entries(functionCalls).map(([name, args]) => ({ name, args }));
        if (parsedTools.length > 0) {
            text += toolCallsToXml(parsedTools);
        }

        const endTime = Date.now();
        const timeMs = endTime - startTime;
        const inputTokens = usage?.promptTokenCount || 0;
        const outputTokens = usage?.candidatesTokenCount || 0;
        const tps = outputTokens > 0 && timeMs > 0 ? (outputTokens / (timeMs / 1000)).toFixed(1) : 0;
        return { text, stats: { inputTokens, outputTokens, timeMs, tps } };
    }
}

export const llmService = new LLMService();
