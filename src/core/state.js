import { invoke } from '@tauri-apps/api/core';

class StateManager {
    constructor() {
        this.listeners = [];
        this.STORAGE_KEY = 'cognetic_state'; // kept for one-time migration only
        this._saveTimer = null;              // debounce handle
        
        // Ephemeral generation state (never persisted)
        this.isGenerating = false;
        this.cancelController = null;
        
        // Default state
        this.state = {
            activeModel: 'OpenAI Compatible',
            intentAnalyzerModel: 'OpenAI Compatible',
            searchSummarizationModel: 'OpenAI Compatible',
            providers: {},
            integrations: {
                webSearch: { 
                    activeProvider: 'jina', 
                    apiKeys: { jina: '', brave: '', tavily: '', bing: '', serp: '' } 
                },
                webFetch: { 
                    activeProvider: 'jina', 
                    apiKeys: { jina: '' } 
                }
            },
            webAgents: {},
            runs: [],
            chats: [],         // Global chats
            projects: [],      // Projects with nested chats
            activeProjectId: null,
            activeChatId: null,
            agentSettings: {
                maxIterations: 25
            }
        };
        
        // Synchronous fast-path: load from localStorage so the UI has data
        // immediately on first render, before the async Tauri file load completes.
        this._loadFromLocalStorageFallback();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Startup / Async Init
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Must be awaited in main.js before the first router.navigate() call.
     * Loads state from the native filesystem (no size limit) and merges it.
     * On first ever launch, migrates any data in localStorage into the file.
     */
    async init() {
        try {
            const raw = await invoke('load_app_state');
            const parsed = JSON.parse(raw);

            if (parsed && Object.keys(parsed).length > 0) {
                // Native file data takes priority over the localStorage fallback
                this.state = { ...this.state, ...parsed };
                this._migrate(this.state);
            } else {
                // No native file yet — migrate any existing localStorage data
                const lsRaw = localStorage.getItem(this.STORAGE_KEY);
                if (lsRaw) {
                    try {
                        const lsParsed = JSON.parse(lsRaw);
                        this.state = { ...this.state, ...lsParsed };
                        this._migrate(this.state);
                        // Immediately persist the migrated data to the native file
                        await this._persistToFile();
                        // Clear localStorage to avoid stale data confusion
                        localStorage.removeItem(this.STORAGE_KEY);
                        console.info('[StateManager] Migrated data from localStorage → native file.');
                    } catch (e) {
                        console.error('[StateManager] localStorage migration parse error:', e);
                    }
                }
            }
        } catch (e) {
            console.warn('[StateManager] Could not load from native file (running in browser?). Using localStorage fallback.', e);
        }
        this.notify();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    /** Synchronous fallback used only in the constructor before async init runs. */
    _loadFromLocalStorageFallback() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.state = { ...this.state, ...parsed };
                this._migrate(this.state);
            }
        } catch (e) {
            console.error('[StateManager] Failed to read localStorage fallback:', e);
        }
    }

    /**
     * In-place data-model migrations (runs after any load/merge).
     * Handles: global messages->chats, proj.path->proj.paths, proj.messages->proj.chats.
     */
    _migrate(state) {
        // Migrate global messages -> chats
        if (state.messages && state.messages.length > 0) {
            if (!state.chats) state.chats = [];
            if (state.chats.length === 0) {
                state.chats.push({
                    id: 'chat_' + Date.now(),
                    title: 'Untitled Conversation',
                    messages: state.messages,
                    updatedAt: Date.now()
                });
            }
            delete state.messages;
        }
        if (!Array.isArray(state.chats)) state.chats = [];

        // Migrate & normalise projects
        if (!Array.isArray(state.projects)) state.projects = [];
        state.projects = state.projects.map(proj => {
            // proj.path (single) -> proj.paths (array)
            if (proj.path && !proj.paths) {
                proj.paths = [proj.path];
                delete proj.path;
            }
            if (!Array.isArray(proj.chats)) proj.chats = [];
            // proj.messages (old) -> proj.chats
            if (proj.messages && proj.messages.length > 0) {
                if (proj.chats.length === 0) {
                    proj.chats.push({
                        id: 'chat_' + Date.now() + Math.floor(Math.random() * 1000),
                        title: 'Untitled Conversation',
                        messages: proj.messages,
                        updatedAt: Date.now()
                    });
                }
                delete proj.messages;
            }
            return proj;
        });
        
        // Ensure agent settings and image compression defaults exist
        if (!state.agentSettings) state.agentSettings = {};
        if (!state.agentSettings.imageCompression) {
            state.agentSettings.imageCompression = {
                smallThreshold: 500,
                midCap: 499,
                largeThreshold: 1000,
                maxCap: 650
            };
        }
    }

    /** Write state to the native filesystem via the Rust backend. */
    async _persistToFile() {
        const stateToSave = JSON.parse(JSON.stringify(this.state));

        // Strip incognito chats before persisting
        if (stateToSave.chats) {
            stateToSave.chats = stateToSave.chats.filter(c => !c.incognito);
        }
        if (stateToSave.projects) {
            stateToSave.projects.forEach(p => {
                if (p.chats) p.chats = p.chats.filter(c => !c.incognito);
            });
        }

        try {
            await invoke('save_app_state', { data: JSON.stringify(stateToSave) });
        } catch (e) {
            // Surface the error visibly so it isn't silently lost
            console.error('[StateManager] Failed to persist state to native file:', e);
            // Try localStorage as an emergency fallback (may fail if full)
            try { localStorage.setItem(this.STORAGE_KEY + '_backup', JSON.stringify(stateToSave)); } catch (_) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    startGeneration() {
        this.isGenerating = true;
        this.loopCount = 0;
        this.cancelController = new AbortController();
        this.notify();
    }
    
    cancelGeneration() {
        if (this.cancelController) {
            this.cancelController.abort();
            this.cancelController = null;
        }
        this.isGenerating = false;
        this.notify();
    }
    
    finishGeneration() {
        this.isGenerating = false;
        this.cancelController = null;
        this.notify();
    }
    
    getCancelSignal() {
        return this.cancelController ? this.cancelController.signal : null;
    }
    
    addMessage(role, content, images = [], stats = null, opts = {}) {
        let targetChat = null;
        
        if (this.state.activeProjectId) {
            const proj = this.state.projects.find(p => p.id === this.state.activeProjectId);
            if (proj) {
                targetChat = proj.chats?.find(c => c.id === this.state.activeChatId);
                if (!targetChat && proj.chats?.length > 0) targetChat = proj.chats[0];
                
                if (!targetChat) {
                    targetChat = { id: 'chat_' + Date.now(), title: 'Untitled Conversation', messages: [], system_prompt_ctx_payload: '', updatedAt: Date.now() };
                    proj.chats.push(targetChat);
                    this.state.activeChatId = targetChat.id;
                }
            }
        } else {
            targetChat = this.state.chats?.find(c => c.id === this.state.activeChatId);
            if (!targetChat && this.state.chats?.length > 0) targetChat = this.state.chats[0];
            
            if (!targetChat) {
                if (!this.state.chats) this.state.chats = [];
                targetChat = { id: 'chat_' + Date.now(), title: 'Untitled Conversation', messages: [], system_prompt_ctx_payload: '', updatedAt: Date.now() };
                this.state.chats.push(targetChat);
                this.state.activeChatId = targetChat.id;
            }
        }
        
        if (targetChat) {
            if (!targetChat.messages) targetChat.messages = [];
            
            const msgObj = { role, content, ...opts };
            if (images && images.length > 0) {
                msgObj.images = images;
            }
            if (stats) {
                msgObj.stats = stats;
            }
            targetChat.messages.push(msgObj);
            targetChat.updatedAt = Date.now();
        }
        
        this.saveState();
        this.notify();
    }
    
    clearMessages() {
        if (this.state.activeProjectId) {
            const proj = this.state.projects.find(p => p.id === this.state.activeProjectId);
            if (proj) {
                const targetChat = proj.chats?.find(c => c.id === this.state.activeChatId);
                if (targetChat) {
                    targetChat.messages = [];
                    targetChat.system_prompt_ctx_payload = '';
                }
            }
        } else {
            const targetChat = this.state.chats?.find(c => c.id === this.state.activeChatId);
            if (targetChat) {
                targetChat.messages = [];
                targetChat.system_prompt_ctx_payload = '';
            }
        }
        this.saveState();
        this.notify();
    }

    truncateMessages(index) {
        let targetChat = null;
        if (this.state.activeProjectId) {
            const proj = this.state.projects.find(p => p.id === this.state.activeProjectId);
            if (proj) {
                targetChat = proj.chats?.find(c => c.id === this.state.activeChatId);
                if (!targetChat && proj.chats?.length > 0) targetChat = proj.chats[0];
            }
        } else {
            targetChat = this.state.chats?.find(c => c.id === this.state.activeChatId);
            if (!targetChat && this.state.chats?.length > 0) targetChat = this.state.chats[0];
        }
        
        if (targetChat && targetChat.messages) {
            targetChat.messages = targetChat.messages.slice(0, index);
            targetChat.updatedAt = Date.now();
            this.saveState();
            this.notify();
        }
    }

    getActiveMessages() {
        let targetChat = null;
        if (this.state.activeProjectId) {
            const proj = this.state.projects.find(p => p.id === this.state.activeProjectId);
            if (proj) {
                targetChat = proj.chats?.find(c => c.id === this.state.activeChatId) || (proj.chats?.[0]);
            }
        } else {
            targetChat = this.state.chats?.find(c => c.id === this.state.activeChatId) || (this.state.chats?.[0]);
        }
        
        if (!targetChat || !targetChat.messages) return [];
        return targetChat.messages;
    }

    getSystemPromptCtxPayload() {
        let targetChat = null;
        if (this.state.activeProjectId) {
            const proj = this.state.projects.find(p => p.id === this.state.activeProjectId);
            if (proj) {
                targetChat = proj.chats?.find(c => c.id === this.state.activeChatId) || (proj.chats?.[0]);
            }
        } else {
            targetChat = this.state.chats?.find(c => c.id === this.state.activeChatId) || (this.state.chats?.[0]);
        }
        return targetChat ? (targetChat.system_prompt_ctx_payload || '') : '';
    }

    compactMessages(summaryText) {
        let targetChat = null;
        if (this.state.activeProjectId) {
            const proj = this.state.projects.find(p => p.id === this.state.activeProjectId);
            if (proj) {
                targetChat = proj.chats?.find(c => c.id === this.state.activeChatId) || (proj.chats?.[0]);
            }
        } else {
            targetChat = this.state.chats?.find(c => c.id === this.state.activeChatId) || (this.state.chats?.[0]);
        }
        
        if (!targetChat || !targetChat.messages) return;
        
        // Mark all currently uncompacted messages as compacted
        targetChat.messages.forEach(m => {
            if (!m.compacted) m.compacted = true;
        });
        
        // Append the summary to the payload
        targetChat.system_prompt_ctx_payload = targetChat.system_prompt_ctx_payload || '';
        if (targetChat.system_prompt_ctx_payload.length > 0) {
            targetChat.system_prompt_ctx_payload += '\n\n';
        }
        targetChat.system_prompt_ctx_payload += summaryText;
        
        targetChat.updatedAt = Date.now();
        this.saveState();
        this.notify();
    }

    /**
     * Debounced save — fires 300ms after the last call to avoid hammering disk
     * on rapid sequential updates (e.g. streaming tokens in the future).
     */
    saveState() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this._persistToFile();
            this._saveTimer = null;
        }, 300);
    }

    getState() {
        return this.state;
    }

    updateState(updates) {
        this.state = { ...this.state, ...updates };
        this.saveState();
        this.notify();
    }

    updateProviderConfig(providerName, config) {
        this.state.providers[providerName] = {
            ...(this.state.providers[providerName] || {}),
            ...config
        };
        this.saveState();
        this.notify();
    }
    
    getProviderConfig(providerName) {
        return this.state.providers[providerName] || { apiKey: '', apiHost: '', modelType: '' };
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }
}

export const stateManager = new StateManager();
window.stateManager = stateManager; // Global access for debugging
