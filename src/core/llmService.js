import { invoke } from '@tauri-apps/api/core';
import { stateManager } from './state.js';
import PROVIDERS_CONFIG from '../views/agents/providers.json';
import { SYSTEM_PROMPT } from '../config/systemPrompt.js';

class LLMService {
    
    /**
     * Sends a message to the currently active model.
     * @param {Array} messages - Array of message objects {role: 'user'|'assistant', content: '...'}
     * @returns {Promise<string>} - The response text
     */
    async sendMessage(messages, globalState = null, abortSignal = null) {
        const state = globalState || stateManager.getState();
        const activeModelName = state.activeModel;
        
        if (!activeModelName) {
            throw new Error("No active model selected. Please configure a model in Settings.");
        }

        // Find which provider this model belongs to
        let providerName = null;
        let pConfig = null;
        let modelId = activeModelName; // default
        
        const configuredProviders = state.providers || {};
        
        // Match the activeModelName to a configured provider
        for (const [pName, cConfig] of Object.entries(configuredProviders)) {
            if (pName === 'OpenAI Compatible') {
                const customModels = cConfig.customModels || [];
                const matchedCustom = customModels.find(cm => cm.name === activeModelName || cm.id === activeModelName);
                if (matchedCustom) {
                    providerName = pName;
                    pConfig = cConfig;
                    modelId = matchedCustom.id;
                    break;
                }
            } else {
                const staticConfig = PROVIDERS_CONFIG[pName];
                if (staticConfig && staticConfig.models && staticConfig.models.includes(activeModelName)) {
                    providerName = pName;
                    pConfig = cConfig;
                    modelId = activeModelName;
                    break;
                }
            }
        }
        
        if (!providerName) {
            throw new Error(`Could not find provider configuration for model: ${activeModelName}`);
        }
        
        const staticProviderDetails = PROVIDERS_CONFIG[providerName] || {};
        const baseUrl = pConfig.apiHost || staticProviderDetails.baseUrl;
        const apiKey = pConfig.apiKey || "";
        
        const activeProject = state.activeProjectId 
            ? state.projects.find(p => p.id === state.activeProjectId)
            : null;
        const basePaths = activeProject ? (activeProject.paths || []) : [];
        const osInfo = navigator.userAgent.includes('Windows') ? 'Windows' : (navigator.userAgent.includes('Mac') ? 'macOS' : 'Linux');
        let contextualPrompt = basePaths.length > 0
            ? `${SYSTEM_PROMPT}\n\nIMPORTANT: You are currently working in a project with restricted access to the following folders:\n${basePaths.map(p => `- ${p}`).join('\n')}\nYou must ONLY access files within these directories. Do NOT attempt to read or write files outside these directories.`
            : `${SYSTEM_PROMPT}\n\nIMPORTANT: You are acting as a general assistant with full system access. Be extremely careful when using filesystem tools.`;
        
        contextualPrompt += `\n\nSYSTEM INFO: You are currently running on a ${osInfo} machine. Use the appropriate shell commands (e.g. powershell/cmd for Windows, bash/sh for macOS/Linux) when using the run_command tool.`;

        const filteredMessages = messages.filter(m => m.role !== 'intent').map(m => {
            const cleanMsg = { ...m };
            Object.keys(cleanMsg).forEach(key => {
                if (key.startsWith('_')) {
                    delete cleanMsg[key];
                }
            });
            return cleanMsg;
        });

        if (providerName === 'Anthropic') {
            return this.callAnthropic(baseUrl, apiKey, modelId, filteredMessages, contextualPrompt, abortSignal, providerName);
        } else if (providerName === 'Google AI Studio') {
            return this.callGoogleAI(baseUrl, apiKey, modelId, filteredMessages, contextualPrompt, abortSignal, providerName);
        } else {
            return this.callOpenAI(baseUrl, apiKey, modelId, filteredMessages, contextualPrompt, abortSignal, providerName);
        }
    }

    async analyzeIntent(userTask, modelName, abortSignal = null) {
        if (!modelName) {
            console.warn("Intent Analyzer Model not configured.");
            return null;
        }

        const prompt = `You are an intent classifier for an AI orchestrator. Do NOT solve the task.

User Task: "${userTask}"

Return EXACTLY 6 lines. No extra text. No punctuation variations. No merging lines.

Format:
intent: chat|action
needs_project_context: true|false
needs_image_analysis: true|false
needs_tools: true|false
complexity_score: 0.0 - 1.0
confidence: 0.0 - 1.0

Rules:
Output must be line-by-line exactly as shown
Boolean values must be lowercase true/false only
complexity_score and confidence must be rounded to 2 decimal places
Do not explain anything
Do not add extra fields
Do not merge lines under any circumstance

Guidance:
needs_project_context = true only if files/repo/codebase are required
needs_image_analysis = true only if visual understanding is required
needs_tools = true only if external execution (web search, terminal, filesystem, APIs, fetching URLs) is required. Answering questions about real-world facts, current events, or looking things up online REQUIRES tools.`;

        try {
            const state = stateManager.getState();
            let providerName = null;
            let pConfig = null;
            let modelId = modelName;
            
            const configuredProviders = state.providers || {};
            for (const [pName, cConfig] of Object.entries(configuredProviders)) {
                if (pName === 'OpenAI Compatible') {
                    const customModels = cConfig.customModels || [];
                    const matchedCustom = customModels.find(cm => cm.name === modelName || cm.id === modelName);
                    if (matchedCustom) {
                        providerName = pName;
                        pConfig = cConfig;
                        modelId = matchedCustom.id;
                        break;
                    }
                } else {
                    const staticConfig = PROVIDERS_CONFIG[pName];
                    if (staticConfig && staticConfig.models.includes(modelName)) {
                        providerName = pName;
                        pConfig = cConfig;
                        modelId = modelName;
                        break;
                    }
                }
            }
            
            if (!providerName) {
                console.warn(`Could not find provider configuration for intent analyzer model: ${modelName}`);
                return null;
            }

            const staticProviderDetails = PROVIDERS_CONFIG[providerName] || {};
            const baseUrl = pConfig.apiHost || staticProviderDetails.baseUrl;
            const apiKey = pConfig.apiKey;
            
            let result;
            const messages = [{ role: 'user', content: prompt }];
            
            if (providerName === 'Anthropic') {
                result = await this.callAnthropic(baseUrl, apiKey, modelId, messages, "", null, providerName);
            } else if (providerName === 'Google AI Studio') {
                result = await this.callGoogleAI(baseUrl, apiKey, modelId, messages, "", null, providerName);
            } else {
                result = await this.callOpenAI(baseUrl, apiKey, modelId, messages, "", null, providerName);
            }
            
            const resultText = (result.text || '').toLowerCase();
            const extract = (regex, defaultVal) => {
                const match = resultText.match(regex);
                return match ? match[1].trim() : defaultVal;
            };
            const extractBool = (regex) => extract(regex, 'false') === 'true';
            
            return {
                intent: extract(/intent:\s*(chat|action)/, 'chat'),
                needs_project_context: extractBool(/needs_project_context:\s*(true|false)/),
                needs_image_analysis: extractBool(/needs_image_analysis:\s*(true|false)/),
                needs_tools: extractBool(/needs_tools:\s*(true|false)/),
                complexity_score: parseFloat(extract(/complexity_score:\s*([0-9.]+)/, '0.5')),
                confidence: parseFloat(extract(/confidence:\s*([0-9.]+)/, '0.5'))
            };
        } catch (error) {
            console.error("Intent Analyzer failed:", error);
            return null;
        }
    }
    
    async callOpenAI(baseUrl, apiKey, modelId, messages, systemPrompt, abortSignal, providerName) {
        let endpoint = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const apiPath = providerName && PROVIDERS_CONFIG[providerName] ? (PROVIDERS_CONFIG[providerName].apiPath || '') : '';
        if (apiPath && !endpoint.endsWith(apiPath)) {
            endpoint += apiPath;
        }
        if (!endpoint.endsWith('/chat/completions')) {
            endpoint += '/chat/completions';
        }
        
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        // Inject System Prompt and format messages with images
        const finalMessages = [{ role: 'system', content: systemPrompt }, ...messages.map(m => {
            if (m.images && m.images.length > 0) {
                const contentParts = [];
                if (m.content) {
                    contentParts.push({ type: 'text', text: m.content });
                }
                m.images.forEach(imgUrl => {
                    contentParts.push({ type: 'image_url', image_url: { url: imgUrl } });
                });
                const { images, stats, ...rest } = m;
                return { ...rest, content: contentParts };
            }
            // Remove 'images' and 'stats' fields from regular messages to prevent API errors
            const { images, stats, ...rest } = m;
            return rest;
        })];
        
        const body = JSON.stringify({
            model: modelId,
            messages: finalMessages,
            stream: false
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
            throw new Error(`API Error (${response.status}): ${response.text}`);
        }
        
        const data = JSON.parse(response.text);
        const endTime = Date.now();
        const timeMs = endTime - startTime;
        
        if (data.choices && data.choices.length > 0) {
            const text = data.choices[0].message.content;
            let inputTokens = 0;
            let outputTokens = 0;
            if (data.usage) {
                inputTokens = data.usage.prompt_tokens || 0;
                outputTokens = data.usage.completion_tokens || 0;
            }
            const tps = outputTokens > 0 && timeMs > 0 ? (outputTokens / (timeMs / 1000)).toFixed(1) : 0;
            return { text, stats: { inputTokens, outputTokens, timeMs, tps } };
        } else {
            throw new Error("Invalid response format from OpenAI-compatible API");
        }
    }
    
    async callAnthropic(baseUrl, apiKey, modelId, messages, systemPrompt, abortSignal, providerName) {
        let endpoint = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const apiPath = providerName && PROVIDERS_CONFIG[providerName] ? (PROVIDERS_CONFIG[providerName].apiPath || '') : '';
        if (apiPath && !endpoint.endsWith(apiPath)) {
            endpoint += apiPath;
        }
        if (!endpoint.endsWith('/messages')) {
            endpoint += '/messages';
        }
        
        // Format messages: Anthropic supports system prompts separately, 
        // but for simple chat we just pass user/assistant roles.
        // Also Anthropic rejects consecutive same-role messages, but we assume standard ping-pong here.
        const formattedMessages = messages.filter(m => m.role !== 'system').map(m => {
            if (m.images && m.images.length > 0) {
                const contentParts = [];
                m.images.forEach(imgUrl => {
                    const match = imgUrl.match(/^data:(image\/[a-zA-Z]*);base64,(.*)$/);
                    if (match) {
                        contentParts.push({
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: match[1],
                                data: match[2]
                            }
                        });
                    }
                });
                if (m.content) {
                    contentParts.push({ type: 'text', text: m.content });
                }
                const { images, stats, ...rest } = m;
                return { ...rest, content: contentParts.length > 0 ? contentParts : m.content };
            }
            const { images, stats, ...rest } = m;
            return rest;
        });
        
        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        };
        
        const body = JSON.stringify({
            model: modelId,
            max_tokens: 4096,
            system: systemPrompt,
            messages: formattedMessages
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
            throw new Error(`Anthropic Error (${response.status}): ${response.text}`);
        }
        
        const data = JSON.parse(response.text);
        const endTime = Date.now();
        const timeMs = endTime - startTime;
        
        if (data.content && data.content.length > 0) {
            const text = data.content[0].text;
            let inputTokens = 0;
            let outputTokens = 0;
            if (data.usage) {
                inputTokens = data.usage.input_tokens || 0;
                outputTokens = data.usage.output_tokens || 0;
            }
            const tps = outputTokens > 0 && timeMs > 0 ? (outputTokens / (timeMs / 1000)).toFixed(1) : 0;
            return { text, stats: { inputTokens, outputTokens, timeMs, tps } };
        } else {
            throw new Error("Invalid response format from Anthropic API");
        }
    }
    
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
        
        const body = JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: formattedMessages
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
            const text = data.candidates[0].content.parts[0].text;
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
}

export const llmService = new LLMService();
