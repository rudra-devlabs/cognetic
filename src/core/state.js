class StateManager {
    constructor() {
        this.listeners = [];
        this.STORAGE_KEY = 'cognetic_state';
        
        // Ephemeral generation state
        this.isGenerating = false;
        this.cancelController = null;
        
        // Default state
        this.state = {
            activeModel: 'OpenAI Compatible',
            intentAnalyzerModel: 'OpenAI Compatible',
            providers: {},
            integrations: {
                webSearch: { 
                    activeProvider: 'tavily', 
                    apiKeys: { jina: '', brave: '', tavily: '', bing: '', serp: '' } 
                },
                webFetch: { 
                    activeProvider: 'jina', 
                    apiKeys: { jina: '' } 
                }
            },
            runs: [],
            chats: [],         // Global chats
            projects: [],      // Projects with nested chats
            activeProjectId: null,
            activeChatId: null
        };
        
        this.loadState();
    }
    
    startGeneration() {
        this.isGenerating = true;
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
    
    addMessage(role, content, images = [], stats = null) {
        let targetChat = null;
        
        if (this.state.activeProjectId) {
            const proj = this.state.projects.find(p => p.id === this.state.activeProjectId);
            if (proj) {
                targetChat = proj.chats?.find(c => c.id === this.state.activeChatId);
                if (!targetChat && proj.chats?.length > 0) targetChat = proj.chats[0];
                
                if (!targetChat) {
                    if (!proj.chats) proj.chats = [];
                    targetChat = { id: 'chat_' + Date.now(), title: 'Untitled Conversation', messages: [], updatedAt: Date.now() };
                    proj.chats.push(targetChat);
                    this.state.activeChatId = targetChat.id;
                }
            }
        } else {
            targetChat = this.state.chats?.find(c => c.id === this.state.activeChatId);
            if (!targetChat && this.state.chats?.length > 0) targetChat = this.state.chats[0];
            
            if (!targetChat) {
                if (!this.state.chats) this.state.chats = [];
                targetChat = { id: 'chat_' + Date.now(), title: 'Untitled Conversation', messages: [], updatedAt: Date.now() };
                this.state.chats.push(targetChat);
                this.state.activeChatId = targetChat.id;
            }
        }
        
        if (targetChat) {
            if (!targetChat.messages) targetChat.messages = [];
            
            const msgObj = { role, content };
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
                if (targetChat) targetChat.messages = [];
            }
        } else {
            const targetChat = this.state.chats?.find(c => c.id === this.state.activeChatId);
            if (targetChat) targetChat.messages = [];
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
        if (this.state.activeProjectId) {
            const proj = this.state.projects.find(p => p.id === this.state.activeProjectId);
            if (proj) {
                const targetChat = proj.chats?.find(c => c.id === this.state.activeChatId) || (proj.chats?.[0]);
                return targetChat ? (targetChat.messages || []) : [];
            }
            return [];
        }
        const targetChat = this.state.chats?.find(c => c.id === this.state.activeChatId) || (this.state.chats?.[0]);
        return targetChat ? (targetChat.messages || []) : [];
    }


    loadState() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.state = { ...this.state, ...parsed };
                
                // Migrate global messages -> chats
                if (this.state.messages && this.state.messages.length > 0) {
                    if (!this.state.chats) this.state.chats = [];
                    if (this.state.chats.length === 0) {
                        this.state.chats.push({
                            id: 'chat_' + Date.now(),
                            title: 'Untitled Conversation',
                            messages: this.state.messages,
                            updatedAt: Date.now()
                        });
                    }
                    delete this.state.messages;
                }
                if (!Array.isArray(this.state.chats)) this.state.chats = [];
                
                // Ensure projects is array and migrate old structure
                if (!Array.isArray(this.state.projects)) this.state.projects = [];
                this.state.projects = this.state.projects.map(proj => {
                    if (proj.path && !proj.paths) {
                        proj.paths = [proj.path];
                        delete proj.path;
                    }
                    if (!Array.isArray(proj.chats)) proj.chats = [];
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
            } catch (e) {
                console.error("Failed to parse local storage state", e);
            }
        }
    }

    saveState() {
        const stateToSave = JSON.parse(JSON.stringify(this.state));
        
        if (stateToSave.chats) {
            stateToSave.chats = stateToSave.chats.filter(c => !c.incognito);
        }
        
        if (stateToSave.projects) {
            stateToSave.projects.forEach(p => {
                if (p.chats) {
                    p.chats = p.chats.filter(c => !c.incognito);
                }
            });
        }
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stateToSave));
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
