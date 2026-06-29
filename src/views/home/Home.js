import homeHtml from './Home.html?raw';
import './Home.css';
import { stateManager } from '../../core/state.js';
import PROVIDERS_CONFIG from '../agents/providers.json';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { llmService } from '../../core/llmService.js';
import { parseToolCall, parseAllToolCalls, executeTool } from '../../core/toolEngine.js';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

const typewriterTexts = [
  "Build with Cognetic",
  "Think.Build.Repeat",
  "Build beyond the limits",
  "Get.Set.Build"
];

const formatErrorAsCard = (errorMsg, context = "Error") => {
    let cleanMsg = errorMsg;
    let details = '';
    let isRateLimit = false;
    let statusCode = null;
    let errType = null;

    const statusMatch = errorMsg.match(/(?:API Error\s*\()?(\d{3})\)?/);
    if (statusMatch) statusCode = parseInt(statusMatch[1], 10);

    try {
        const jsonMatch = errorMsg.match(/\{.*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.message) cleanMsg = parsed.message;
            if (parsed.type) errType = parsed.type;
            if (parsed.code && !errType) errType = parsed.code;
            if (parsed.type === 'rate_limited' || errorMsg.includes('429')) isRateLimit = true;
            details = JSON.stringify(parsed, null, 2).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        } else if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
            isRateLimit = true;
        }
    } catch(e) {}

    if (!statusCode && errType) {
        if (['invalid_request_error', 'invalid_json', 'validation_error', 'invalid_messages', 'invalid_parameter', 'context_length_exceeded', 'unsupported_version'].includes(errType)) statusCode = 400;
        else if (['authentication_error', 'invalid_api_key', 'missing_api_key', 'expired_api_key'].includes(errType)) statusCode = 401;
        else if (['permission_denied', 'insufficient_permissions', 'model_access_denied', 'organization_not_allowed'].includes(errType)) statusCode = 403;
        else if (['not_found', 'endpoint_not_found', 'model_not_found'].includes(errType)) statusCode = 404;
        else if (['request_timeout', 'timeout'].includes(errType)) statusCode = 408;
        else if (['conflict', 'request_conflict', 'concurrent_modification'].includes(errType)) statusCode = 409;
        else if (['payload_too_large', 'request_too_large'].includes(errType)) statusCode = 413;
        else if (['unsupported_media_type'].includes(errType)) statusCode = 415;
        else if (['unprocessable_entity'].includes(errType)) statusCode = 422;
        else if (['rate_limited', 'insufficient_quota', 'quota_exceeded', 'too_many_requests', 'concurrency_limit_exceeded'].includes(errType)) statusCode = 429;
        else if (['internal_server_error', 'server_error', 'internal_error'].includes(errType)) statusCode = 500;
        else if (['bad_gateway'].includes(errType)) statusCode = 502;
        else if (['service_unavailable', 'overloaded', 'engine_overloaded'].includes(errType)) statusCode = 503;
        else if (['gateway_timeout', 'upstream_timeout'].includes(errType)) statusCode = 504;
    }
    if (isRateLimit) statusCode = 429;

    let icon = 'alert-triangle';
    let title = context;
    let typeClass = '';

    switch (statusCode) {
        case 400: title = 'Bad Request'; icon = 'alert-circle'; typeClass = ' err-bad-request'; break;
        case 401: title = 'Unauthorized'; icon = 'key'; typeClass = ' err-unauthorized'; break;
        case 403: title = 'Forbidden'; icon = 'shield-alert'; typeClass = ' err-forbidden'; break;
        case 404: title = 'Not Found'; icon = 'search-x'; typeClass = ' err-not-found'; break;
        case 408: title = 'Request Timeout'; icon = 'timer'; typeClass = ' err-timeout'; break;
        case 409: title = 'Conflict'; icon = 'git-merge'; typeClass = ' err-conflict'; break;
        case 413: title = 'Payload Too Large'; icon = 'hard-drive'; typeClass = ' err-too-large'; break;
        case 415: title = 'Unsupported Media Type'; icon = 'file-question'; typeClass = ' err-unsupported'; break;
        case 422: title = 'Unprocessable Entity'; icon = 'file-x'; typeClass = ' err-unprocessable'; break;
        case 429: title = 'Rate Limit Exceeded'; icon = 'clock'; typeClass = ' err-rate-limit'; break;
        case 500: title = 'Internal Server Error'; icon = 'server-crash'; typeClass = ' err-server'; break;
        case 502: title = 'Bad Gateway'; icon = 'network'; typeClass = ' err-server'; break;
        case 503: title = 'Service Unavailable'; icon = 'power-off'; typeClass = ' err-server'; break;
        case 504: title = 'Gateway Timeout'; icon = 'timer-off'; typeClass = ' err-timeout'; break;
    }
    
    const isRetryable = [408, 429, 500, 502, 503, 504].includes(statusCode);

    return `<div class="modern-error-card${typeClass}">
        <div class="modern-error-header">
            <i data-lucide="${icon}" class="icon-svg"></i>
            <span>${title}</span>
        </div>
        <div class="modern-error-body">
            <div>${cleanMsg}</div>
            ${details ? `<details class="modern-error-details">
                <summary>View technical details</summary>
                <pre>${details}</pre>
            </details>` : ''}
            ${isRetryable ? `<div class="error-retry-wrapper"><div class="error-retry-btn" role="button" tabindex="0"><i data-lucide="refresh-cw" class="icon-svg sm"></i> Retry Request</div></div>` : ''}
        </div>
    </div>`;
};

// Global incognito state (in-memory only, never persisted)
let isIncognitoMode = false;
// Stores one ephemeral incognito chat per context key (projectId or '__global__')
const incognitoChatStore = new Map();

// Handle external links via Tauri shell plugin
document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && a.target === '_blank' && a.href) {
        e.preventDefault();
        shellOpen(a.href).catch(err => console.error("Failed to open link:", err));
    }
});

function getConfiguredModels() {
    const configuredProviders = stateManager.getState().providers || {};
    let models = [];
    
    for (const [providerName, config] of Object.entries(configuredProviders)) {
        const isLocal = ['Ollama', 'LM Studio'].includes(providerName);
        const hasKey = config.apiKey && config.apiKey.trim() !== '';
        
        if (hasKey || isLocal) {
            if (providerName === 'OpenAI Compatible') {
                if (config.customModels && config.customModels.length > 0) {
                    config.customModels.forEach(cm => {
                        models.push({ provider: providerName, id: cm.id, name: cm.name || cm.id });
                    });
                }
            } else {
                const pConfig = PROVIDERS_CONFIG[providerName] || {};
                const stdModels = pConfig.models || [];
                stdModels.forEach(m => {
                    models.push({ provider: providerName, id: m, name: m });
                });
            }
        }
    }
    
    return models;
}

function createDropdownHTML() {
    const models = getConfiguredModels();
    let html = `<div class="model-dropdown-menu" id="model-dropdown-menu">`;
    
    if (models.length === 0) {
        html += `
            <div class="model-item no-models" style="justify-content: center; color: var(--text-muted); cursor: default; padding: 12px;">
                No models configured
            </div>
            <div class="model-item go-settings" style="justify-content: center; color: var(--accent-primary); border-top: 1px solid var(--border-color); border-radius: 0 0 var(--radius-lg) var(--radius-lg);">
                <i data-lucide="settings" class="icon-svg sm"></i> Configure Models
            </div>
        `;
    } else {
        // Group by provider
        const grouped = {};
        models.forEach(m => {
            if (!grouped[m.provider]) grouped[m.provider] = [];
            grouped[m.provider].push(m);
        });
        
        for (const [provider, provModels] of Object.entries(grouped)) {
            const providerConfig = PROVIDERS_CONFIG[provider] || {};
            const iconHtml = providerConfig.icon ? `<img src="${providerConfig.icon}" class="company-icon" />` : `<i data-lucide="cpu" class="icon-svg sm"></i>`;
            
            html += `
            <div class="model-item provider-item" data-provider-group="${provider}">
                <div style="display: flex; align-items: center; gap: 8px; font-weight: 400;">
                    ${iconHtml}
                    <span>${provider}</span>
                </div>
                <i data-lucide="chevron-right" class="icon-svg sm"></i>
                
                <div class="model-submenu" data-provider-menu="${provider}">
                    <div class="model-search-container">
                        <input type="text" class="model-search-input" placeholder="Search ${provider} models..." />
                    </div>
                    <div class="model-list-scrollable">
            `;
            provModels.forEach(m => {
                html += `<div class="model-item selectable-model-item" data-provider="${m.provider}" data-model="${m.id}" data-name="${m.name}">${m.name}</div>`;
            });
            html += `
                    </div>
                </div>
            </div>`;
        }
    }
    
    html += `</div>`;
    return html;
}

function createModalHTML() {
    return `
        <div class="api-key-modal-overlay" id="api-key-modal" style="display: none;">
            <div class="api-key-modal">
                <h2>API Key Required</h2>
                <p>You haven't linked an API key for <span id="missing-provider-name" style="font-weight: 600;"></span> yet. Please add one in Settings to use this model.</p>
                <div class="modal-actions">
                    <button class="modal-btn cancel" id="close-modal-btn">Cancel</button>
                    <button class="modal-btn primary" id="go-settings-btn">Go to Settings</button>
                </div>
            </div>
        </div>
    `;
}

import { injectFileChangeBar } from './injectFileChangeBar.js';
// DEMO USAGE: This would be called after every model-driven file change:
// injectFileChangeBar({filesChanged:2, additions:57, deletions:8, files:[{name:'Home.html',path:'/c/Users/rudra/OneDrive/Desktop/agent-framework/src/views/home'},{name:'Home.js',path:'/c/Users/rudra/OneDrive/Desktop/agent-framework/src/views/home'}]});

export function renderHome(container) {
    container.innerHTML = homeHtml;
    
    // Initialize typewriter animation
    const typewriterElement = container.querySelector('#typewriter');
    if (typewriterElement) {
        initTypewriter(typewriterElement);
    }
    
    // Inject Modal into body
    let modalEl = document.getElementById('api-key-modal');
    if (!modalEl) {
        document.body.insertAdjacentHTML('beforeend', createModalHTML());
        modalEl = document.getElementById('api-key-modal');
        
        document.getElementById('close-modal-btn').addEventListener('click', () => {
            modalEl.style.display = 'none';
        });
        
        document.getElementById('go-settings-btn').addEventListener('click', () => {
            modalEl.style.display = 'none';
            // Route to agents where API keys are configured
            window.router.navigate('agents');
        });
    }
    
    const wrapper = container.querySelector('#model-dropdown-wrapper');
    const modelBtn = container.querySelector('#home-model-btn');
    const modelText = container.querySelector('#active-model-text');
    
    if (wrapper && modelBtn) {
        // Inject dropdown
        wrapper.insertAdjacentHTML('beforeend', createDropdownHTML());
        const dropdown = wrapper.querySelector('#model-dropdown-menu');
        
        // Re-init lucide icons for injected HTML
        if(window.lucide) window.lucide.createIcons({ root: wrapper });
        
        // Toggle dropdown on button click
        modelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
        
        // Handle model selection & Search
        const searchInputs = dropdown.querySelectorAll('.model-search-input');
        searchInputs.forEach(input => {
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('keyup', (e) => {
                const term = e.target.value.toLowerCase();
                const menu = e.target.closest('.model-submenu');
                const listItems = menu.querySelectorAll('.selectable-model-item');
                listItems.forEach(item => {
                    const name = item.getAttribute('data-name').toLowerCase();
                    if (name.includes(term)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        });
        
        const providerItems = dropdown.querySelectorAll('.provider-item');
        providerItems.forEach(pItem => {
            // Click to toggle mobile/desktop if hover isn't working
            pItem.addEventListener('click', (e) => {
                // Ignore clicks that land on the submenu itself
                if (e.target.closest('.model-submenu')) return;
                
                e.stopPropagation();
                
                // Toggle active state for this provider
                const wasActive = pItem.classList.contains('active');
                providerItems.forEach(i => i.classList.remove('active')); // close others
                if (!wasActive) pItem.classList.add('active');
            });
        });

        const modelItems = dropdown.querySelectorAll('.model-item');
        modelItems.forEach(item => {
            item.addEventListener('click', (e) => {
                if (item.classList.contains('provider-item') && !e.target.closest('.model-submenu')) {
                    return; // Handled above
                }
                
                e.stopPropagation();
                
                if (item.classList.contains('no-models')) return;
                if (item.classList.contains('go-settings')) {
                    window.router.navigate('agents');
                    return;
                }
                if (!item.classList.contains('selectable-model-item')) return;
                
                const provider = item.getAttribute('data-provider');
                const modelId = item.getAttribute('data-model');
                const modelName = item.getAttribute('data-name');
                
                stateManager.updateState({ activeModel: modelName });
                dropdown.classList.remove('show');
                providerItems.forEach(i => i.classList.remove('active'));
            });
        });
        
        // Sync button text with active model from state
        const syncModelText = (state) => {
            const currentModels = getConfiguredModels();
            let valid = currentModels.find(m => m.name === state.activeModel);
            
            if (!valid && currentModels.length > 0) {
                // Invalid or deleted, default to first available
                stateManager.updateState({ activeModel: currentModels[0].name });
                return; // state update will trigger this again
            }
            
            if (modelText) {
                if (valid) {
                    modelText.textContent = state.activeModel;
                } else {
                    modelText.textContent = 'Configure Models';
                }
            }
        };
        
        // Initial sync
        syncModelText(stateManager.getState());
        
        // Subscribe to future state changes
        const unsubscribe = stateManager.subscribe(syncModelText);
    }

    // Agent Dropdown Logic
    const agentWrapper = container.querySelector('#agent-dropdown-wrapper');
    const agentBtn = container.querySelector('#home-agent-btn');
    const agentDropdown = container.querySelector('#agent-dropdown-menu');
    
    if (agentWrapper && agentBtn && agentDropdown) {
        agentBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            agentDropdown.classList.toggle('show');
        });
        
        document.addEventListener('click', (e) => {
            if (!agentWrapper.contains(e.target)) {
                agentDropdown.classList.remove('show');
            }
        });
        
        const agentItems = agentDropdown.querySelectorAll('.agent-item');
        agentItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                // Remove active from all
                agentItems.forEach(i => i.classList.remove('active'));
                // Add active to clicked
                item.classList.add('active');
                
                const agentType = item.getAttribute('data-agent');
                const robotIconWrapper = container.querySelector('.robot-icon');
                const heroTitle = container.querySelector('.hero-title');
                
                // Change the icon in the button
                if (agentType === 'Agent Swarm') {
                    agentBtn.innerHTML = `<i data-lucide="users" class="icon-svg sm"></i> <span id="active-agent-text">${agentType}</span> <i data-lucide="chevron-down" class="icon-svg sm"></i>`;
                    
                    // Change hero title and robot icon for Agent Swarm
                    if (heroTitle) heroTitle.textContent = 'Cowork with Agent Swarm';
                    if (robotIconWrapper) {
                        robotIconWrapper.innerHTML = `
                            <i data-lucide="bot" class="icon-svg"></i>
                            <i data-lucide="bot" class="icon-svg"></i>
                            <i data-lucide="bot" class="icon-svg"></i>
                        `;
                    }
                } else {
                    agentBtn.innerHTML = `<i data-lucide="user" class="icon-svg sm"></i> <span id="active-agent-text">${agentType}</span> <i data-lucide="chevron-down" class="icon-svg sm"></i>`;
                    
                    // Change back to Solo Agent
                    if (heroTitle) heroTitle.textContent = 'Cowork with Single Agent';
                    if (robotIconWrapper) {
                        robotIconWrapper.innerHTML = `<i data-lucide="bot" class="icon-svg"></i>`;
                    }
                }
                if (window.lucide) window.lucide.createIcons({ root: agentBtn });
                if (window.lucide && robotIconWrapper) window.lucide.createIcons({ root: robotIconWrapper });
                
                agentDropdown.classList.remove('show');
            });
        });
    }

    // Chat Interaction Logic
    const promptBox = container.querySelector('#promptBox');
    const sendBtn = container.querySelector('#send-prompt-btn');
    const heroContainer = container.querySelector('#hero-container');
    const chatContainer = container.querySelector('#chat-container');
    const chatHeader = container.querySelector('#chat-header');
    const newChatBtn = container.querySelector('#new-chat-btn');
    const recentRuns = container.querySelector('#recent-runs');
    
    // Projects Logic
    const projectsList = container.querySelector('#projects-list');
    const projectListItems = container.querySelector('#project-list-items');
    const promptProjectName = container.querySelector('#prompt-project-name');
    const projectDropdownBtn = container.querySelector('#project-dropdown-btn');
    const projectDropdownMenu = container.querySelector('#project-dropdown-menu');
    const newProjectDropdownBtn = container.querySelector('#new-project-dropdown-btn');
    
    // Toggle dropdown
    if (projectDropdownBtn && projectDropdownMenu) {
        projectDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            projectDropdownMenu.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!projectDropdownMenu.contains(e.target) && !projectDropdownBtn.contains(e.target)) {
                projectDropdownMenu.classList.remove('show');
            }
        });
    }

    // --- Rename Modal Setup ---
    const renameModal = container.querySelector('#rename-chat-modal');
    const renameInput = container.querySelector('#rename-chat-input');
    const confirmRenameBtn = container.querySelector('#confirm-rename-btn');
    const cancelRenameBtn = container.querySelector('#cancel-rename-btn');
    const closeRenameModal = container.querySelector('#close-rename-modal');

    let _renameCallback = null;

    const openRenameModal = (currentTitle, onConfirm) => {
        if (!renameModal || !renameInput) return;
        renameInput.value = currentTitle || '';
        _renameCallback = onConfirm;
        renameModal.style.display = 'flex';
        setTimeout(() => renameInput.focus(), 50);
        if (window.lucide) window.lucide.createIcons({ root: renameModal });
    };

    const closeRename = () => {
        if (renameModal) renameModal.style.display = 'none';
        _renameCallback = null;
    };

    confirmRenameBtn?.addEventListener('click', () => {
        const val = renameInput?.value.trim();
        if (val && _renameCallback) _renameCallback(val);
        closeRename();
    });
    cancelRenameBtn?.addEventListener('click', closeRename);
    closeRenameModal?.addEventListener('click', closeRename);
    renameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmRenameBtn?.click();
        if (e.key === 'Escape') closeRename();
    });
    // --- End Rename Modal Setup ---

    const renderProjects = () => {
        const state = stateManager.getState();
        const activeProject = state.activeProjectId 
            ? state.projects.find(p => p.id === state.activeProjectId)
            : null;
            
        const projectName = activeProject ? activeProject.name : "No Project";
        if (promptProjectName) promptProjectName.textContent = projectName;
        
        const timeAgo = (timestamp) => {
            if (!timestamp) return '';
            const seconds = Math.floor((Date.now() - timestamp) / 1000);
            if (seconds < 60) return 'now';
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours}h`;
            const days = Math.floor(hours / 24);
            return `${days}d`;
        };

        const renderDropdown = (listEl) => {
            if (!listEl) return;
            listEl.innerHTML = '';
            
            const noProjEl = document.createElement('div');
            noProjEl.className = `sidebar-item ${!activeProject ? 'active' : ''}`;
            noProjEl.style.display = 'flex';
            noProjEl.style.alignItems = 'center';
            noProjEl.style.gap = '8px';
            noProjEl.style.cursor = 'pointer';
            noProjEl.style.padding = '8px 12px';
            noProjEl.innerHTML = `<i data-lucide="folder-minus" class="icon-svg"></i> <span>No Project</span>`;
            noProjEl.addEventListener('click', () => {
                if (isIncognitoMode) {
                    const contextKey = '__global__';
                    const incognitoChat = { id: 'chat_incognito_' + Date.now(), title: 'Incognito Chat', messages: [], updatedAt: Date.now(), incognito: true };
                    incognitoChatStore.set(contextKey, incognitoChat);
                    const state = stateManager.getState();
                    const newChats = [incognitoChat, ...(state.chats || []).filter(c => !c.incognito)];
                    stateManager.updateState({ activeProjectId: null, chats: newChats, activeChatId: incognitoChat.id });
                } else {
                    stateManager.updateState({ activeProjectId: null, activeChatId: null });
                }
                if (projectDropdownMenu) projectDropdownMenu.classList.remove('show');
            });
            listEl.appendChild(noProjEl);
            
            state.projects.forEach(proj => {
                const isActive = proj.id === state.activeProjectId;
                const el = document.createElement('div');
                el.className = `sidebar-item ${isActive ? 'active' : ''}`;
                el.style.display = 'flex';
                el.style.justifyContent = 'space-between';
                el.style.alignItems = 'center';
                el.style.cursor = 'pointer';
                el.style.padding = '8px 12px';
                el.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i data-lucide="folder" class="icon-svg"></i> 
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${proj.name}</span>
                    </div>
                    ${isActive ? '<i data-lucide="check" class="icon-svg sm icon-success"></i>' : ''}
                `;
                el.addEventListener('click', () => {
                    if (isIncognitoMode) {
                        const contextKey = proj.id;
                        const incognitoChat = { id: 'chat_incognito_' + Date.now(), title: 'Incognito Chat', messages: [], updatedAt: Date.now(), incognito: true };
                        incognitoChatStore.set(contextKey, incognitoChat);
                        const currState = stateManager.getState();
                        const pIdx = currState.projects.findIndex(p => p.id === proj.id);
                        if (pIdx > -1) {
                            const newProjects = [...currState.projects];
                            newProjects[pIdx] = { ...newProjects[pIdx], chats: [incognitoChat, ...(newProjects[pIdx].chats || []).filter(c => !c.incognito)] };
                            stateManager.updateState({ projects: newProjects, activeProjectId: proj.id, activeChatId: incognitoChat.id });
                        }
                    } else {
                        stateManager.updateState({ activeProjectId: proj.id, activeChatId: proj.chats?.[0]?.id || null });
                    }
                    if (projectDropdownMenu) projectDropdownMenu.classList.remove('show');
                });
                listEl.appendChild(el);
            });
            if (window.lucide) window.lucide.createIcons({ root: listEl });
        };
        
        const renderSidebarProjects = () => {
            if (!projectsList) return;
            projectsList.innerHTML = '';
            
            if (!state.projects || state.projects.length === 0) {
                projectsList.innerHTML = `
                    <div style="padding: 20px 24px; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; gap: 12px; align-items: center;">
                        <span style="font-size: var(--font-size-md);">No projects yet!</span>
                        <button class="create-first-proj-btn" style="background: transparent; color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 6px 12px; font-size: var(--font-size-sm); cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.2s;">
                            <i data-lucide="plus" class="icon-svg sm"></i> Create project
                        </button>
                    </div>
                `;
                projectsList.querySelector('.create-first-proj-btn')?.addEventListener('click', () => {
                    openProjectModal(null);
                });
                if (window.lucide) window.lucide.createIcons({ root: projectsList });
                return;
            }
            
            state.projects.forEach(proj => {
                const groupEl = document.createElement('div');
                groupEl.className = 'project-group';
                
                const headerEl = document.createElement('div');
                headerEl.className = 'project-header';
                headerEl.innerHTML = `
                    <div class="project-header-left">
                        <i data-lucide="folder" class="icon-svg sm"></i>
                        <span>${proj.name}</span>
                    </div>
                    <div class="project-header-actions">
                        <button class="icon-btn delete-proj-btn delete-btn" title="Delete Project"><i data-lucide="trash-2" class="icon-svg sm"></i></button>
                        <button class="icon-btn proj-settings-btn" title="Settings"><i data-lucide="settings" class="icon-svg sm"></i></button>
                        <button class="icon-btn new-chat-in-proj-btn" title="New Chat"><i data-lucide="plus" class="icon-svg sm"></i></button>
                    </div>
                `;
                
                headerEl.querySelector('.delete-proj-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const deleteModal = document.getElementById('delete-confirm-modal');
                    const deleteMsg = document.getElementById('delete-confirm-message');
                    const confirmBtn = document.getElementById('confirm-delete-btn');
                    const cancelBtn = document.getElementById('cancel-delete-btn');
                    
                    if (deleteModal && deleteMsg && confirmBtn && cancelBtn) {
                        deleteMsg.textContent = `Are you sure you want to delete project "${proj.name}"?`;
                        deleteModal.style.display = 'flex';
                        
                        const cleanup = () => {
                            deleteModal.style.display = 'none';
                            confirmBtn.onclick = null;
                            cancelBtn.onclick = null;
                        };
                        
                        cancelBtn.onclick = cleanup;
                        confirmBtn.onclick = () => {
                            const currState = stateManager.getState();
                            const newProjects = currState.projects.filter(p => p.id !== proj.id);
                            let update = { projects: newProjects };
                            if (currState.activeProjectId === proj.id) {
                                update.activeProjectId = null;
                                update.activeChatId = null;
                            }
                            stateManager.updateState(update);
                            cleanup();
                        };
                    }
                });
                
                headerEl.querySelector('.proj-settings-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openProjectModal(proj.id);
                });
                
                headerEl.querySelector('.new-chat-in-proj-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const newChat = {
                        id: 'chat_' + Date.now(),
                        title: 'Untitled Conversation',
                        messages: [],
                        updatedAt: Date.now()
                    };
                    const currState = stateManager.getState();
                    const pIdx = currState.projects.findIndex(p => p.id === proj.id);
                    if (pIdx > -1) {
                        const newProjects = [...currState.projects];
                        const existingChats = newProjects[pIdx].chats || [];
                        const filteredChats = existingChats.filter(c => c.messages && c.messages.length > 0);
                        newProjects[pIdx] = {
                            ...newProjects[pIdx],
                            chats: [newChat, ...filteredChats]
                        };
                        stateManager.updateState({ projects: newProjects, activeProjectId: proj.id, activeChatId: newChat.id });
                    }
                });
                
                headerEl.addEventListener('click', () => {
                    if (isIncognitoMode) {
                        const contextKey = proj.id;
                        const incognitoChat = { id: 'chat_incognito_' + Date.now(), title: 'Incognito Chat', messages: [], updatedAt: Date.now(), incognito: true };
                        incognitoChatStore.set(contextKey, incognitoChat);
                        const currState = stateManager.getState();
                        const pIdx = currState.projects.findIndex(p => p.id === proj.id);
                        if (pIdx > -1) {
                            const newProjects = [...currState.projects];
                            newProjects[pIdx] = { ...newProjects[pIdx], chats: [incognitoChat, ...(newProjects[pIdx].chats || []).filter(c => !c.incognito)] };
                            stateManager.updateState({ projects: newProjects, activeProjectId: proj.id, activeChatId: incognitoChat.id });
                        }
                    } else {
                        stateManager.updateState({ activeProjectId: proj.id, activeChatId: proj.chats?.[0]?.id || null });
                    }
                });
                
                const chatsEl = document.createElement('div');
                chatsEl.className = 'chat-list';
                
                const visibleChats = (proj.chats || []).filter(c => c.messages && c.messages.length > 0 && !c.incognito);
                if (visibleChats.length === 0) {
                    chatsEl.innerHTML = '<div class="empty-chats">No conversations yet</div>';
                } else {
                    visibleChats.forEach(chat => {
                        const chatEl = document.createElement('div');
                        const isChatActive = (state.activeProjectId === proj.id) && (state.activeChatId === chat.id);
                        chatEl.className = `chat-item ${isChatActive ? 'active' : ''}`;
                        chatEl.innerHTML = `
                        <div class="chat-title">${chat.title || 'Untitled Conversation'}</div>
                        <div class="chat-actions">
                            <div class="chat-timestamp">${timeAgo(chat.updatedAt)}</div>
                            <div class="chat-hover-actions">
                                <button class="icon-btn rename-chat-btn" title="Rename Chat" style="padding: 2px;"><i data-lucide="edit-2" class="icon-svg sm"></i></button>
                                <button class="icon-btn delete-btn delete-chat-btn" title="Delete Chat" style="padding: 2px;"><i data-lucide="trash-2" class="icon-svg sm"></i></button>
                            </div>
                        </div>
                    `;
                    chatEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        stateManager.updateState({ activeProjectId: proj.id, activeChatId: chat.id });
                    });
                    chatEl.querySelector('.rename-chat-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openRenameModal(chat.title || 'Untitled Conversation', (newName) => {
                            const currState = stateManager.getState();
                            const pIdx = currState.projects.findIndex(p => p.id === proj.id);
                            if (pIdx > -1) {
                                const newProjects = [...currState.projects];
                                const cIdx = newProjects[pIdx].chats.findIndex(c => c.id === chat.id);
                                if (cIdx > -1) {
                                    newProjects[pIdx].chats[cIdx] = { ...newProjects[pIdx].chats[cIdx], title: newName };
                                    stateManager.updateState({ projects: newProjects });
                                }
                            }
                        });
                    });
                    chatEl.querySelector('.delete-chat-btn')?.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const deleteModal = document.getElementById('delete-confirm-modal');
                            const deleteMsg = document.getElementById('delete-confirm-message');
                            const confirmBtn = document.getElementById('confirm-delete-btn');
                            const cancelBtn = document.getElementById('cancel-delete-btn');
                            
                            if (deleteModal && deleteMsg && confirmBtn && cancelBtn) {
                                deleteMsg.textContent = 'Are you sure you want to delete this chat?';
                                deleteModal.style.display = 'flex';
                                
                                const cleanup = () => {
                                    deleteModal.style.display = 'none';
                                    confirmBtn.onclick = null;
                                    cancelBtn.onclick = null;
                                };
                                
                                cancelBtn.onclick = cleanup;
                                confirmBtn.onclick = () => {
                                    const currState = stateManager.getState();
                                    const pIdx = currState.projects.findIndex(p => p.id === proj.id);
                                    if (pIdx > -1) {
                                        const newProjects = [...currState.projects];
                                        newProjects[pIdx] = { ...newProjects[pIdx], chats: newProjects[pIdx].chats.filter(c => c.id !== chat.id) };
                                        let update = { projects: newProjects };
                                        if (currState.activeProjectId === proj.id && currState.activeChatId === chat.id) {
                                            update.activeChatId = newProjects[pIdx].chats[0]?.id || null;
                                        }
                                        stateManager.updateState(update);
                                    }
                                    cleanup();
                                };
                            }
                        });
                        chatsEl.appendChild(chatEl);
                    });
                }
                
                groupEl.appendChild(headerEl);
                groupEl.appendChild(chatsEl);
                projectsList.appendChild(groupEl);
            });
            
            if (window.lucide) window.lucide.createIcons({ root: projectsList });
        };
        
        const renderGlobalChats = () => {
            const globalList = container.querySelector('#global-chats-list');
            if (!globalList) return;
            globalList.innerHTML = '';
            
            const chatsEl = document.createElement('div');
            chatsEl.className = 'chat-list';
            chatsEl.style.paddingLeft = '0'; // No indent for global chats
            
            const visibleChats = (state.chats || []).filter(c => c.messages && c.messages.length > 0 && !c.incognito);
            if (visibleChats.length === 0) {
                chatsEl.innerHTML = '<div class="empty-chats">No conversations yet</div>';
            } else {
                visibleChats.forEach(chat => {
                    const chatEl = document.createElement('div');
                    const isChatActive = (!state.activeProjectId) && (state.activeChatId === chat.id);
                    chatEl.className = `chat-item ${isChatActive ? 'active' : ''}`;
                    chatEl.innerHTML = `
                        <div class="chat-title">${chat.title || 'Untitled Conversation'}</div>
                        <div class="chat-actions">
                            <div class="chat-timestamp">${timeAgo(chat.updatedAt)}</div>
                            <div class="chat-hover-actions">
                                <button class="icon-btn rename-chat-btn" title="Rename Chat" style="padding: 2px;"><i data-lucide="edit-2" class="icon-svg sm"></i></button>
                                <button class="icon-btn delete-btn delete-chat-btn" title="Delete Chat" style="padding: 2px;"><i data-lucide="trash-2" class="icon-svg sm"></i></button>
                            </div>
                        </div>
                    `;
                    chatEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        stateManager.updateState({ activeProjectId: null, activeChatId: chat.id });
                    });
                    chatEl.querySelector('.rename-chat-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openRenameModal(chat.title || 'Untitled Conversation', (newName) => {
                            const currState = stateManager.getState();
                            const newChats = [...(currState.chats || [])];
                            const cIdx = newChats.findIndex(c => c.id === chat.id);
                            if (cIdx > -1) {
                                newChats[cIdx] = { ...newChats[cIdx], title: newName };
                                stateManager.updateState({ chats: newChats });
                            }
                        });
                    });
                    chatEl.querySelector('.delete-chat-btn')?.addEventListener('click', (e) => {
                        e.stopPropagation();
                        
                        const deleteModal = document.getElementById('delete-confirm-modal');
                        const deleteMsg = document.getElementById('delete-confirm-message');
                        const confirmBtn = document.getElementById('confirm-delete-btn');
                        const cancelBtn = document.getElementById('cancel-delete-btn');
                        
                        if (deleteModal && deleteMsg && confirmBtn && cancelBtn) {
                            deleteMsg.textContent = 'Are you sure you want to delete this chat?';
                            deleteModal.style.display = 'flex';
                            
                            const cleanup = () => {
                                deleteModal.style.display = 'none';
                                confirmBtn.onclick = null;
                                cancelBtn.onclick = null;
                            };
                            
                            cancelBtn.onclick = cleanup;
                            confirmBtn.onclick = () => {
                                const currState = stateManager.getState();
                                const newChats = (currState.chats || []).filter(c => c.id !== chat.id);
                                let update = { chats: newChats };
                                if (!currState.activeProjectId && currState.activeChatId === chat.id) {
                                    update.activeChatId = newChats[0]?.id || null;
                                }
                                stateManager.updateState(update);
                                cleanup();
                            };
                        }
                    });
                    chatsEl.appendChild(chatEl);
                });
            }
            globalList.appendChild(chatsEl);
            if (window.lucide) window.lucide.createIcons({ root: globalList });
        };

        renderDropdown(projectListItems);
        renderSidebarProjects();
        renderGlobalChats();
    };

    // Modal Logic
    const projectModal = container.querySelector('#project-modal');
    const projectModalTitle = container.querySelector('#project-modal-title');
    const projectNameInput = container.querySelector('#project-name-input');
    
    let editingProjectId = null;
    let pendingProjectName = "";
    let pendingProjectFolders = [];
    
    const openProjectModal = (projectId = null) => {
        if (projectDropdownMenu) projectDropdownMenu.classList.remove('show');
        editingProjectId = projectId;
        
        if (projectId) {
            const state = stateManager.getState();
            const proj = state.projects.find(p => p.id === projectId);
            if (proj) {
                projectModalTitle.textContent = "Edit Project";
                pendingProjectName = proj.name;
                pendingProjectFolders = [...(proj.paths || [])];
                projectNameInput.value = proj.name;
            }
        } else {
            projectModalTitle.textContent = "Create Project";
            pendingProjectName = "";
            pendingProjectFolders = [];
            projectNameInput.value = "";
        }
        
        const errorEl = container.querySelector('#project-name-error');
        if (errorEl) errorEl.style.display = 'none';
        
        const saveBtn = container.querySelector('#save-project-btn');
        if (saveBtn) saveBtn.textContent = projectId ? 'Save' : 'Create';
        
        renderSelectedFolders();
        projectModal.style.display = 'flex';
    };
    
    const renderSelectedFolders = () => {
        const list = container.querySelector('#selected-folders-list');
        list.innerHTML = '';
        pendingProjectFolders.forEach((folder, idx) => {
            const el = document.createElement('div');
            el.className = 'selected-folder-item';
            el.innerHTML = `
                <span>${folder}</span>
                <button class="remove-folder-btn"><i data-lucide="x" class="icon-svg sm"></i></button>
            `;
            el.querySelector('.remove-folder-btn').addEventListener('click', () => {
                pendingProjectFolders.splice(idx, 1);
                renderSelectedFolders();
            });
            list.appendChild(el);
        });
        if (window.lucide) window.lucide.createIcons({ root: list });
    };

    container.querySelector('#close-project-modal')?.addEventListener('click', () => { projectModal.style.display = 'none'; });
    
    // Add Project trigger
    if (newProjectDropdownBtn) newProjectDropdownBtn.addEventListener('click', () => openProjectModal(null));
    
    // Typewriter animation
function initTypewriter(element) {
    let currentTextIndex = 0;
    let currentCharIndex = 0;
    let isDeleting = false;
    const typingSpeed = 100;
    const deletingSpeed = 50;
    const pauseDuration = 2000;

    function type() {
        const currentText = typewriterTexts[currentTextIndex];
        
        if (isDeleting) {
            element.textContent = currentText.substring(0, currentCharIndex - 1);
            currentCharIndex--;
        } else {
            element.textContent = currentText.substring(0, currentCharIndex + 1);
            currentCharIndex++;
        }
        
        if (!isDeleting && currentCharIndex === currentText.length) {
            setTimeout(() => isDeleting = true, pauseDuration);
        } else if (isDeleting && currentCharIndex === 0) {
            isDeleting = false;
            currentTextIndex = (currentTextIndex + 1) % typewriterTexts.length;
        }
        
        const speed = isDeleting ? deletingSpeed : typingSpeed;
        setTimeout(type, speed);
    }
    
    type();
}

// The old sidebar button can do it too
    const addProjectBtn = container.querySelector('#add-project-btn');
    if (addProjectBtn) addProjectBtn.addEventListener('click', () => openProjectModal(null));
    
    container.querySelector('#add-folder-block-btn')?.addEventListener('click', async () => {
        try {
            const selectedPathNative = await open({ directory: true, multiple: false });
            if (selectedPathNative) {
                const pathStr = Array.isArray(selectedPathNative) ? selectedPathNative[0] : selectedPathNative;
                if (!pendingProjectFolders.includes(pathStr)) {
                    pendingProjectFolders.push(pathStr);
                    renderSelectedFolders();
                }
            }
        } catch (err) { console.error(err); }
    });
    
    container.querySelector('#save-project-btn')?.addEventListener('click', () => {
        const nameInput = projectNameInput.value.trim();
        if (nameInput && pendingProjectFolders.length > 0) {
            const state = stateManager.getState();
            let newProjects = [...state.projects];
            
            if (editingProjectId) {
                const pIdx = newProjects.findIndex(p => p.id === editingProjectId);
                if (pIdx > -1) {
                    newProjects[pIdx] = {
                        ...newProjects[pIdx],
                        name: nameInput,
                        paths: pendingProjectFolders
                    };
                }
                stateManager.updateState({ projects: newProjects });
            } else {
                const newChat = {
                    id: 'chat_' + Date.now(),
                    title: 'Untitled Conversation',
                    messages: [],
                    updatedAt: Date.now()
                };
                const newProject = {
                    id: 'proj_' + Date.now(),
                    name: nameInput,
                    paths: pendingProjectFolders,
                    chats: [newChat]
                };
                newProjects.push(newProject);
                stateManager.updateState({ 
                    projects: newProjects,
                    activeProjectId: newProject.id,
                    activeChatId: newChat.id
                });
            }
            projectModal.style.display = 'none';
        } else if (!nameInput) {
            const errorEl = container.querySelector('#project-name-error');
            if (errorEl) {
                errorEl.textContent = 'Please enter a project name.';
                errorEl.style.display = 'block';
            }
        } else if (pendingProjectFolders.length === 0) {
            const errorEl = container.querySelector('#project-name-error');
            if (errorEl) {
                errorEl.textContent = 'Please add at least one folder.';
                errorEl.style.display = 'block';
            }
        }
    });
    container.querySelector('#incognito-chat-btn')?.addEventListener('click', () => {
        isIncognitoMode = !isIncognitoMode;
        
        if (isIncognitoMode) {
            // Entering incognito – create a fresh ephemeral chat for the current context
            const state = stateManager.getState();
            const contextKey = state.activeProjectId || '__global__';
            const incognitoChat = {
                id: 'chat_incognito_' + Date.now(),
                title: 'Incognito Chat',
                messages: [],
                updatedAt: Date.now(),
                incognito: true
            };
            incognitoChatStore.set(contextKey, incognitoChat);
            
            if (state.activeProjectId) {
                const pIdx = state.projects.findIndex(p => p.id === state.activeProjectId);
                if (pIdx > -1) {
                    const newProjects = [...state.projects];
                    newProjects[pIdx] = { ...newProjects[pIdx], chats: [incognitoChat, ...(newProjects[pIdx].chats || []).filter(c => !c.incognito)] };
                    stateManager.updateState({ projects: newProjects, activeChatId: incognitoChat.id });
                }
            } else {
                const newChats = [incognitoChat, ...(state.chats || []).filter(c => !c.incognito)];
                stateManager.updateState({ chats: newChats, activeChatId: incognitoChat.id });
            }
        } else {
            // Exiting incognito – clear all ephemeral chats and switch to a normal chat
            incognitoChatStore.clear();
            const state = stateManager.getState();
            
            if (state.activeProjectId) {
                const pIdx = state.projects.findIndex(p => p.id === state.activeProjectId);
                if (pIdx > -1) {
                    const newProjects = [...state.projects];
                    const cleanChats = (newProjects[pIdx].chats || []).filter(c => !c.incognito);
                    newProjects[pIdx] = { ...newProjects[pIdx], chats: cleanChats };
                    stateManager.updateState({ projects: newProjects, activeChatId: cleanChats[0]?.id || null });
                }
            } else {
                const cleanChats = (state.chats || []).filter(c => !c.incognito);
                stateManager.updateState({ chats: cleanChats, activeChatId: cleanChats[0]?.id || null });
            }
        }
    });

    container.querySelector('#add-global-chat-btn')?.addEventListener('click', () => {
        const state = stateManager.getState();
        const filteredChats = (state.chats || []).filter(c => c.messages && c.messages.length > 0);
        const newChat = {
            id: 'chat_' + Date.now(),
            title: 'Untitled Conversation',
            messages: [],
            updatedAt: Date.now()
        };
        const newChats = [newChat, ...filteredChats];
        stateManager.updateState({ 
            chats: newChats,
            activeProjectId: null,
            activeChatId: newChat.id 
        });
    });

    container.querySelector('#new-chat-sidebar-btn')?.addEventListener('click', () => {
        const state = stateManager.getState();
        const filteredChats = (state.chats || []).filter(c => c.messages && c.messages.length > 0);
        const newChat = {
            id: 'chat_' + Date.now(),
            title: 'Untitled Conversation',
            messages: [],
            updatedAt: Date.now()
        };
        const newChats = [newChat, ...filteredChats];
        stateManager.updateState({ 
            chats: newChats,
            activeProjectId: null,
            activeChatId: newChat.id 
        });
    });

    const renderChatHistory = () => {
        const state = stateManager.getState();
        const activeChatId = state.activeChatId;
        const activeChat = activeChatId 
            ? (state.activeProjectId 
                ? state.projects.find(p => p.id === state.activeProjectId)?.chats?.find(c => c.id === activeChatId)
                : state.chats.find(c => c.id === activeChatId))
            : null;
            
        // Show/hide chat header
        if (chatHeader) {
            chatHeader.style.display = activeChatId ? 'flex' : 'none';
        }
        
        // Update robot icon
        const robotIconWrapper = container.querySelector('.robot-icon');
        if (robotIconWrapper) {
            const activeAgent = document.getElementById('active-agent-text')?.textContent;
            let defaultContent = `<i data-lucide="zap" class="icon-svg"></i>`;
            if (activeAgent === 'Agent Swarm') {
                defaultContent = `
                    <i data-lucide="bot" class="icon-svg"></i>
                    <i data-lucide="bot" class="icon-svg"></i>
                    <i data-lucide="bot" class="icon-svg"></i>
                `;
            }
            
            const currentAgentHash = activeAgent === 'Agent Swarm' ? 'swarm' : 'default';
            const existingDefault = robotIconWrapper.querySelector('.icon-default-wrapper');
            if (!existingDefault || robotIconWrapper.dataset.agentHash !== currentAgentHash) {
                robotIconWrapper.innerHTML = `
                    <div class="icon-default-wrapper" style="display: flex; gap: 8px; transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);">
                        ${defaultContent}
                    </div>
                    <div class="icon-incognito-wrapper" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18a2 2 0 0 0-4 0"/><path d="m19 11-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11"/><path d="M2 11h20"/><circle cx="17" cy="18" r="3"/><circle cx="7" cy="18" r="3"/></svg>
                    </div>
                `;
                robotIconWrapper.dataset.agentHash = currentAgentHash;
                if (window.lucide) window.lucide.createIcons({ root: robotIconWrapper });
            }
            
            if (isIncognitoMode) {
                robotIconWrapper.classList.add('is-incognito');
            } else {
                robotIconWrapper.classList.remove('is-incognito');
            }
        }
        
        const incognitoBtn = container.querySelector('#incognito-chat-btn');
        if (incognitoBtn) {
            incognitoBtn.classList.toggle('active', isIncognitoMode);
        }
        

        const messages = stateManager.getActiveMessages();
        const centerCanvas = container.querySelector('#center-canvas');
        
        if (messages.length === 0) {
            centerCanvas?.classList.add('empty-state');
        } else {
            centerCanvas?.classList.remove('empty-state');
        }
        
        if (chatContainer) {
            chatContainer.innerHTML = '';
            
            if (messages.length > 0) {
                messages.forEach((msg, i) => {
                    const row = document.createElement('div');
                    row.className = `message-row ${msg.role === 'user' ? 'user' : 'assistant'}`;
                    
                    const bubble = document.createElement('div');
                    bubble.className = 'message-bubble';
                    
                    if (msg.role === 'assistant') {
                        // Check if it's a tool execution
                        if (msg.content.includes('<tool name=')) {
                             row.classList.add('tool-call-row');
                             const toolCalls = parseAllToolCalls(msg.content);
                             
                             const baseName = (path) => path ? path.split(/[\/\\]/).pop() : '';
                             const getHost = (url) => { try { return new URL(url).hostname; } catch(e) { return 'URL'; } };
                             
                             const getLabels = (tc, resultText) => {
                                 const p = tc.params || {};
                                 switch(tc.name) {
                                     case 'read_file': return [`Reading ${baseName(p.filepath) || 'file'}...`, `Read ${baseName(p.filepath) || 'file'}`];
                                     case 'write_file': return [`Writing ${baseName(p.filepath) || 'file'}...`, `Wrote ${baseName(p.filepath) || 'file'}`];
                                     case 'list_files': return [`Listing ${baseName(p.dirpath) || 'directory'}...`, `Listed ${baseName(p.dirpath) || 'directory'}`];
                                     case 'glob': 
                                         if (resultText !== undefined) {
                                             const count = (!resultText || resultText.includes('No matches found')) ? 0 : resultText.split('\n').filter(l => l.trim()).length;
                                             return [`Glob searching for "${p.pattern || ''}"...`, `Glob matched ${count} files using "${p.pattern || ''}"`];
                                         }
                                         return [`Glob searching for "${p.pattern || ''}"...`, `Glob searched for "${p.pattern || ''}"`];
                                     case 'grep':
                                         if (resultText !== undefined) {
                                             const count = (!resultText || resultText.includes('No matches found')) ? 0 : resultText.split('\n').filter(l => l.trim()).length;
                                             return [`Grep searching for "${p.pattern || ''}"...`, `Grep found ${count} matches for "${p.pattern || ''}"`];
                                         }
                                         return [`Grep searching for "${p.pattern || ''}"...`, `Grep searched for "${p.pattern || ''}"`];
                                     case 'tree': return [`Generating tree for ${baseName(p.dirpath) || 'directory'}...`, `Generated tree for ${baseName(p.dirpath) || 'directory'}`];
                                     case 'search_files': return [`Searching for "${p.query || ''}"...`, `Searched for "${p.query || ''}"`];
                                     case 'get_current_dir': return [`Getting current path...`, `Got current path`];
                                     case 'date': return [`Getting current date and time...`, `Got current date and time`];
                                     case 'path_stats': return [`Getting stats for ${baseName(p.path) || 'path'}...`, `Got stats for ${baseName(p.path) || 'path'}`];
                                     case 'readlines': return [`Reading lines from ${baseName(p.filepath) || 'file'}...`, `Read lines from ${baseName(p.filepath) || 'file'}`];
                                     case 'writelines': return [`Writing lines to ${baseName(p.filepath) || 'file'}...`, `Wrote lines to ${baseName(p.filepath) || 'file'}`];
                                     case 'run_command': return [`Running ${p.command || 'command'}...`, `Ran ${p.command || 'command'}`];
                                     case 'delete_path': return [`Deleting ${baseName(p.path) || 'path'}...`, `Deleted ${baseName(p.path) || 'path'}`];
                                     case 'rename_path': return [`Renaming ${baseName(p.old_path) || 'path'}...`, `Renamed ${baseName(p.old_path) || 'path'}`];
                                     case 'create_directory': return [`Creating ${baseName(p.path) || 'directory'}...`, `Created ${baseName(p.path) || 'directory'}`];
                                     case 'search_web': return [`Searching web for "${p.query || ''}"...`, `Searched web for "${p.query || ''}"`];
                                     case 'fetch_url': return [`Fetching ${getHost(p.url)}...`, `Fetched ${getHost(p.url)}`];
                                     case 'next_search_batch': return [`Reading next batch from ${getHost(p.url)}...`, `Read next batch from ${getHost(p.url)}`];
                                     default: return [`Executing ${tc.name}...`, `Executed ${tc.name}`];
                                 }
                             };
                             
                             let isCompleted = false;
                             if (i + 1 < messages.length) {
                                 const nextMsg = messages[i + 1];
                                 if (nextMsg.role === 'tool_result' || (nextMsg.role === 'user' && nextMsg.content.includes('<tool_result'))) {
                                     isCompleted = true;
                                 }
                             }

                             const items = (toolCalls.length > 0 ? toolCalls : [null]).map((tc, tcIdx) => {
                                 let toolResultText = undefined;
                                 if (isCompleted && tc && messages[i + 1]) {
                                     const nextMsg = messages[i + 1];
                                     const allResults = [];
                                     const rx = /<tool_result[^>]*>([\s\S]*?)<\/tool_result>/g;
                                     let match;
                                     while ((match = rx.exec(nextMsg.content)) !== null) {
                                         allResults.push(match[1].trim());
                                     }
                                     if (allResults.length > tcIdx) {
                                         toolResultText = allResults[tcIdx];
                                     }
                                 }
                                 const [runLbl, doneLbl] = tc ? getLabels(tc, toolResultText) : ['Executing tool...', 'Executed tool'];
                                 
                                 if (tc && tc.name === 'search_web' && isCompleted && toolResultText) {
                                     const searchResults = [];
                                     const rxSearch = /### \[(.+?)\]\((.+?)\)/g;
                                     let m;
                                     while ((m = rxSearch.exec(toolResultText)) !== null) {
                                         searchResults.push({ title: m[1], url: m[2] });
                                     }
                                     if (searchResults.length > 0) {
                                         let query = tc.params?.query || '';
                                         
                                         if (!msg._searchTime) msg._searchTime = {};
                                         if (!msg._searchTime[tcIdx]) {
                                             msg._searchTime[tcIdx] = Date.now();
                                         }
                                         const elapsed = Date.now() - msg._searchTime[tcIdx];
                                         const isCurrentlyOpen = (elapsed > 50 && elapsed < 1500);
                                         
                                         if (elapsed < 50) {
                                             setTimeout(() => {
                                                 const el = document.querySelector(`.search-web-container[data-msg-id="${msg.id}"][data-tc-idx="${tcIdx}"]`);
                                                 if (el) el.classList.add('open');
                                             }, 50);
                                             setTimeout(() => {
                                                 const el = document.querySelector(`.search-web-container[data-msg-id="${msg.id}"][data-tc-idx="${tcIdx}"]`);
                                                 if (el) el.classList.remove('open');
                                             }, 1500);
                                         } else if (elapsed < 1500) {
                                             setTimeout(() => {
                                                 const el = document.querySelector(`.search-web-container[data-msg-id="${msg.id}"][data-tc-idx="${tcIdx}"]`);
                                                 if (el) el.classList.remove('open');
                                             }, 1500 - elapsed);
                                         }
                                         
                                         const listItemsHtml = searchResults.map(res => {
                                             let domain = '';
                                             try { domain = new URL(res.url).hostname.replace('www.', ''); } catch (e) {}
                                             const favIconSrc = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                                             return `
                                             <a href="${res.url}" target="_blank" class="search-result-item" style="display:flex;align-items:center;padding:8px 12px;text-decoration:none;border-radius:6px;transition:background 0.2s;color:inherit;gap:12px;">
                                                 <img src="${favIconSrc}" style="width:16px;height:16px;border-radius:4px;flex-shrink:0;" onerror="this.style.display='none'" />
                                                 <span style="flex-grow:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary);font-size:13px;">${res.title.replace(/</g,'&lt;')}</span>
                                                 <span style="flex-shrink:0;display:flex;align-items:center;gap:4px;color:var(--text-secondary);font-size:12px;">
                                                     ${domain}
                                                 </span>
                                             </a>
                                             `;
                                         }).join('');
                                         
                                         return `
                                         <div class="search-web-container ${isCurrentlyOpen ? 'open' : ''}" data-msg-id="${msg.id}" data-tc-idx="${tcIdx}" style="margin: 8px 0;">
                                             <div class="search-web-summary" onclick="this.parentElement.classList.toggle('open')" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;color:var(--text-secondary);font-size:13px;padding:4px 0;user-select:none;">
                                                 <div style="display:flex;align-items:center;gap:8px;flex-grow:1;">
                                                     <i data-lucide="globe" class="icon-svg sm"></i>
                                                     <span>Results for "${query.replace(/</g,'&lt;')}"</span>
                                                 </div>
                                                 <div style="display:flex;align-items:center;gap:8px;">
                                                     <span style="font-size:12px;">${searchResults.length} results</span>
                                                     <i data-lucide="chevron-right" class="icon-svg sm search-dropdown-chevron" style="transition: transform 0.3s ease;"></i>
                                                 </div>
                                             </div>
                                             <div class="search-web-content">
                                                 <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:var(--radius-md);max-height:220px;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:2px;" class="custom-scrollbar">
                                                     ${listItemsHtml}
                                                 </div>
                                             </div>
                                         </div>
                                         `;
                                     }
                                 }
                                 
                                 if (isCompleted) {
                                     return `<div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary);">
                                         <i data-lucide="check-circle-2" class="icon-svg sm" style="color:#22c55e;"></i>
                                         <span>${doneLbl}</span>
                                     </div>`;
                                 } else {
                                     return `<div style="display:flex;align-items:center;gap:8px;color:var(--accent-primary);">
                                         <i data-lucide="cog" class="icon-svg sm spin-anim"></i>
                                         <span>${runLbl}</span>
                                     </div>`;
                                 }
                             });
                            
                            let stripped = msg.content.replace(/<tool\s+name=["']?([^"'>]+)["']?>([\s\S]*?)<\/tool>/gi, '').trim();
                            let textHtml = '';
                            if (stripped) {
                                textHtml = `<div style="margin-bottom: 12px; color: var(--text-primary); font-size: var(--font-size-base); line-height: 1.6;">${DOMPurify.sanitize(marked.parse(stripped))}</div>`;
                            }
                            
                            bubble.innerHTML = `${textHtml}<div style="display:flex;flex-direction:column;gap:6px;">${items.join('')}</div>`;
                        } else {
                             // Handle text content
                             const html = msg.content ? marked.parse(msg.content) : '';
                             
                             let imagesHtml = '';
                             if (msg.images && msg.images.length > 0) {
                                 imagesHtml = '<div class="chat-message-images">';
                                 msg.images.forEach(img => {
                                     imagesHtml += `<img src="${img}" class="chat-message-image" onclick="document.getElementById('lightbox-img').src='${img}'; document.getElementById('lightbox-modal').style.display='flex';" />`;
                                 });
                                 imagesHtml += '</div>';
                             }
                             
                             let fileChangesHtml = '';
                             let filesChanged = msg.filesChanged;
                             
                             // Demo logic: infer file changes if the previous message was a tool execution
                             if (!filesChanged && i > 0) {
                                 let prevToolCallMsg = null;
                                 for (let j = i - 1; j >= 0; j--) {
                                     const m = messages[j];
                                     if (m.role === 'user' && !m.content.includes('<tool_result')) {
                                         break; // Hit a real user prompt, stop looking backwards
                                     }
                                     if (m.role === 'assistant' && m.content.includes('<tool name=')) {
                                         prevToolCallMsg = m;
                                         break;
                                     }
                                 }

                                 if (prevToolCallMsg) {
                                     const tcs = parseAllToolCalls(prevToolCallMsg.content);
                                     const fileTcs = tcs.filter(tc => ['write_file', 'writelines', 'delete_path', 'rename_path'].includes(tc.name));
                                     if (fileTcs.length > 0) {
                                         filesChanged = fileTcs.map(tc => {
                                             const p = tc.params || {};
                                             const filePath = p.filepath || p.path || p.old_path || 'unknown';
                                             
                                             let additions = 0;
                                             let deletions = 0;
                                             
                                             if (tc.name.includes('write')) {
                                                 let contentStr = '';
                                                 if (p.content !== undefined) contentStr = String(p.content);
                                                 else if (p.CodeContent !== undefined) contentStr = String(p.CodeContent);
                                                 
                                                 additions = contentStr === '' ? 0 : contentStr.split(/\r?\n|\\n/).length;
                                                 
                                                 if (tc.name === 'writelines' || (p.startline && p.endline)) {
                                                     const s = parseInt(p.startline);
                                                     const e = parseInt(p.endline);
                                                     if (!isNaN(s) && !isNaN(e)) deletions = e - s + 1;
                                                     else deletions = 1;
                                                 } else {
                                                     // if additions is 0, it means it cleared the file, we could show an arbitrary deletion amount 
                                                     // but since we don't know the prior length, 0 additions is the main signal.
                                                     deletions = contentStr === '' ? 'All' : 0; 
                                                 }
                                             } else if (tc.name.includes('replace') || tc.name.includes('edit')) {
                                                 let contentStr = '';
                                                 if (p.content !== undefined) contentStr = String(p.content);
                                                 else if (p.ReplacementContent !== undefined) contentStr = String(p.ReplacementContent);
                                                 
                                                 additions = contentStr === '' ? 0 : contentStr.split(/\r?\n|\\n/).length;
                                                 
                                                 if (p.startline && p.endline) {
                                                     const s = parseInt(p.startline);
                                                     const e = parseInt(p.endline);
                                                     if (!isNaN(s) && !isNaN(e)) deletions = e - s + 1;
                                                     else deletions = 1;
                                                 } else if (p.target_text) {
                                                     deletions = String(p.target_text).split(/\r?\n|\\n/).length;
                                                 } else {
                                                     deletions = additions; // Fallback
                                                 }
                                             } else if (tc.name.includes('delete')) {
                                                 additions = 0;
                                                 deletions = 'All';
                                             }
                                             
                                             return {
                                                 name: filePath.split(/[\/\\]/).pop(),
                                                 path: filePath,
                                                 additions: additions,
                                                 deletions: deletions
                                             };
                                         });
                                     }
                                 }
                             }

                             if (filesChanged && filesChanged.length > 0) {
                                 const additions = filesChanged.reduce((acc, f) => acc + (typeof f.additions === 'number' ? f.additions : 0), 0);
                                 const hasAll = filesChanged.some(f => f.deletions === 'All');
                                 const sumDel = filesChanged.reduce((acc, f) => acc + (typeof f.deletions === 'number' ? f.deletions : 0), 0);
                                 const deletions = hasAll ? 'All' : sumDel;
                                 
                                 const itemsHtml = filesChanged.map(f => {
                                     let iconHtml = '';
                                     if (f.name.endsWith('.html')) {
                                         iconHtml = `<i data-lucide="code" class="icon-svg sm text-orange"></i>`;
                                     } else if (f.name.endsWith('.js')) {
                                         iconHtml = `<span class="text-yellow font-bold" style="font-size: 11px;">JS</span>`;
                                     } else {
                                         iconHtml = `<i data-lucide="file" class="icon-svg sm"></i>`;
                                     }
                                     return `<div class="file-change-item">
                                         <div class="file-change-info">
                                             ${iconHtml}
                                             <span class="file-name">${f.name}</span>
                                             <span class="file-path" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;">${f.path}</span>
                                         </div>
                                         <div class="file-change-stats">
                                             ${f.additions > 0 ? `<span class="text-success">+${f.additions}</span>` : ''}
                                             ${f.deletions > 0 || f.deletions === 'All' ? `<span class="text-error">-${f.deletions}</span>` : ''}
                                         </div>
                                     </div>`;
                                 }).join('');
                                 
                                 fileChangesHtml = `
                                 <div class="file-changes-container">
                                     <div class="file-changes-header" onclick="this.parentElement.classList.toggle('expanded')">
                                         <div class="file-changes-summary">
                                             ${filesChanged.length} files changed <span class="text-success">+${additions}</span> <span class="text-error">-${deletions}</span> <i data-lucide="chevron-right" class="icon-svg sm transition-transform"></i>
                                         </div>
                                         <button class="review-btn" onclick="event.stopPropagation()">
                                             <i data-lucide="file-plus" class="icon-svg sm"></i> Review
                                         </button>
                                     </div>
                                     <div class="file-changes-list">
                                         <div class="file-changes-list-inner">
                                             ${itemsHtml}
                                         </div>
                                     </div>
                                 </div>
                                 `;
                             }
                             
                             bubble.innerHTML = imagesHtml + DOMPurify.sanitize(html);
                             let processedContent = msg.content || '';
                             processedContent = processedContent.replace(/<tree_tool_call\s+dir=["']([^"']+)["']\s*\/?>/g, (match, dirpath) => {
                                 return `<div class="tree-dynamic-placeholder" data-dir="${dirpath.replace(/"/g, '&quot;')}"><div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary);"><i data-lucide="cog" class="icon-svg sm spin-anim"></i><span>Loading tree...</span></div></div>`;
                             });
                             
                             bubble.innerHTML = imagesHtml + DOMPurify.sanitize(marked.parse(processedContent), { ALLOW_DATA_ATTR: true });
                             if (fileChangesHtml) {
                                 row.dataset.fileChangesHtml = fileChangesHtml;
                             }
                        }
                    } else if (msg.role === 'tool_result' || (msg.role === 'user' && msg.content.includes('<tool_result'))) {
                        // Hide raw tool results from the chat UI so it doesn't clutter
                        row.style.display = 'none';
                    } else if (msg.role === 'intent') {
                        row.className = 'message-row assistant analyzer-row';
                        const elapsed = msg.stats ? msg.stats.elapsed : '0.00';
                        let formattedResult = '';
                        try {
                            const intentResult = JSON.parse(msg.content);
                            formattedResult = Object.entries(intentResult).map(([k, v]) => `<div style="display:flex; justify-content:space-between; gap:12px;"><span style="color:var(--text-muted);">${k}:</span> <span style="color:var(--text-primary);font-family:monospace;">${v}</span></div>`).join('');
                        } catch(e) {}
                        
                        row.innerHTML = `
                        <div class="message-bubble intent-chip-wrapper" style="position: relative; font-size: 13px; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid var(--border-color); padding: 6px 12px; cursor: pointer; user-select: none;">
                            <i data-lucide="check-circle-2" class="icon-svg sm" style="color: var(--success-color);"></i> Analyzed request in ${elapsed}s
                            <i data-lucide="chevron-right" class="icon-svg sm" style="margin-left: 4px; transition: transform 0.2s;"></i>
                            <div class="intent-popup" style="display: none; position: absolute; top: 100%; left: 0; margin-top: 8px; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; z-index: 100; min-width: 240px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); flex-direction: column; gap: 6px; text-align: left;">
                                ${formattedResult}
                            </div>
                        </div>`;
                        
                        setTimeout(() => {
                            const wrapper = row.querySelector('.intent-chip-wrapper');
                            const popup = row.querySelector('.intent-popup');
                            const chevron = row.querySelector('[data-lucide="chevron-right"]');
                            if (wrapper && popup && chevron) {
                                const toggleShow = (force) => {
                                    const isShowing = force !== undefined ? force : popup.style.display === 'flex';
                                    popup.style.display = isShowing ? 'flex' : 'none';
                                    chevron.style.transform = isShowing ? 'rotate(90deg)' : 'rotate(0deg)';
                                };
                                wrapper.addEventListener('mouseenter', () => toggleShow(true));
                                wrapper.addEventListener('mouseleave', () => toggleShow(false));
                                wrapper.addEventListener('click', () => toggleShow(popup.style.display !== 'flex'));
                            }
                        }, 0);
                        
                        chatContainer.appendChild(row);
                        return; // Prevent normal bubble append
                    } else {
                        let imagesHtml = '';
                        if (msg.images && msg.images.length > 0) {
                            imagesHtml = '<div class="chat-message-images">';
                            msg.images.forEach(img => {
                                imagesHtml += `<img src="${img}" class="chat-message-image" onclick="document.getElementById('lightbox-img').src='${img}'; document.getElementById('lightbox-modal').style.display='flex';" />`;
                            });
                            imagesHtml += '</div>';
                        }
                        const textHtml = msg.content ? msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
                        bubble.innerHTML = imagesHtml + textHtml;
                    }
                    
                    row.appendChild(bubble);
                    
                    if (row.dataset.fileChangesHtml) {
                        const fcWrapper = document.createElement('div');
                        fcWrapper.className = 'file-changes-wrapper';
                        fcWrapper.innerHTML = row.dataset.fileChangesHtml;
                        row.appendChild(fcWrapper);
                    }
                    
                    if (!row.classList.contains('tool-call-row') || msg.role === 'user') {
                        const footerContainer = document.createElement('div');
                        footerContainer.className = 'msg-footer-wrapper';
                        footerContainer.style.cssText = "display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 4px;";
                        
                        const statsDiv = document.createElement('div');
                        statsDiv.className = 'msg-stats-footer';
                        statsDiv.style.cssText = "font-size: 11px; color: var(--text-secondary); opacity: 0.7; font-family: 'Consolas', monospace; letter-spacing: 0.2px;";
                        
                        if (msg.stats) {
                            const timeDisplay = msg.stats.timeMs > 1000 ? (msg.stats.timeMs/1000).toFixed(1) + 's' : msg.stats.timeMs + 'ms';
                            statsDiv.innerHTML = `↑ ${msg.stats.inputTokens} sent &middot; ↓ ${msg.stats.outputTokens} received &middot; ${timeDisplay} total &middot; ${msg.stats.tps} t/s`;
                        }
                        footerContainer.appendChild(statsDiv);
                        
                        const actionBtns = document.createElement('div');
                        actionBtns.className = 'msg-actions';
                        actionBtns.style.marginTop = '0';
                        let actionsHtml = '';
                        if (msg.role === 'user') {
                            actionsHtml += `<button class="msg-action-btn edit-msg-btn" data-index="${i}" title="Edit"><i data-lucide="edit-2" class="icon-svg sm"></i></button>`;
                        }
                        actionsHtml += `<button class="msg-action-btn copy-msg-btn" data-index="${i}" title="Copy"><i data-lucide="copy" class="icon-svg sm"></i></button>`;
                        actionBtns.innerHTML = actionsHtml;
                        
                        actionBtns.querySelectorAll('.copy-msg-btn').forEach(btn => {
                            btn.addEventListener('click', async () => {
                                try {
                                    await navigator.clipboard.writeText(msg.content);
                                    btn.innerHTML = '<i data-lucide="check" class="icon-svg sm" style="color: #22c55e;"></i>';
                                    if (window.lucide) window.lucide.createIcons({ root: btn });
                                    setTimeout(() => {
                                        btn.innerHTML = '<i data-lucide="copy" class="icon-svg sm"></i>';
                                        if (window.lucide) window.lucide.createIcons({ root: btn });
                                    }, 2000);
                                } catch(err) {
                                    console.error('Copy failed', err);
                                }
                            });
                        });

                        actionBtns.querySelectorAll('.edit-msg-btn').forEach(btn => {
                            btn.addEventListener('click', () => {
                                const promptBox = document.getElementById('promptBox');
                                if (!promptBox) return;
                                promptBox.value = msg.content;
                                promptBox.style.height = 'auto';
                                promptBox.style.height = (promptBox.scrollHeight) + 'px';
                                promptBox.focus();
                                stateManager.truncateMessages(i);
                                renderChatHistory();
                            });
                        });
                        
                        row.querySelectorAll('.error-retry-btn').forEach(btn => {
                            btn.addEventListener('click', () => {
                                row.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                                row.style.opacity = '0';
                                row.style.transform = 'translateY(-10px)';
                                row.style.maxHeight = row.scrollHeight + 'px';
                                void row.offsetWidth;
                                row.style.maxHeight = '0px';
                                row.style.margin = '0';
                                row.style.padding = '0';
                                row.style.overflow = 'hidden';

                                setTimeout(() => {
                                    stateManager.truncateMessages(i);
                                    if (window._resumeGeneration) window._resumeGeneration();
                                }, 400);
                            });
                        });
                        
                        footerContainer.appendChild(actionBtns);
                        row.appendChild(footerContainer);
                    }
                    
                    chatContainer.appendChild(row);
                });
                
                // Scroll to bottom
                chatContainer.scrollTop = chatContainer.scrollHeight;
                
                // Process dynamic tree placeholders
                const treePlaceholders = chatContainer.querySelectorAll('.tree-dynamic-placeholder:not(.loaded)');
                treePlaceholders.forEach(async (el) => {
                    el.classList.add('loaded');
                    const dirpath = el.dataset.dir;
                    try {
                        const treeText = await invoke('get_tree', { dirpath });
                        el.innerHTML = `<div class="tree-result-container" style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; margin-top: 8px; overflow-x: auto; font-family: 'Consolas', monospace; font-size: 13px; color: var(--text-primary); white-space: pre;">${treeText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
                    } catch (e) {
                        el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:var(--error-color);padding:12px;background:var(--bg-secondary);border:1px solid var(--error-color);border-radius:var(--radius-md);"><i data-lucide="alert-circle" class="icon-svg" style="color:var(--error-color);"></i><span>It looks like the path does not exist</span></div>`;
                        if (window.lucide) window.lucide.createIcons({ root: el });
                    }
                });
            }
        }
        
        if (window.lucide) window.lucide.createIcons({ root: chatContainer });
        if (window.lucide && chatHeader) window.lucide.createIcons({ root: chatHeader });
    };


    // Image Attachments Logic
    let pendingImages = [];
    const attachBtn = container.querySelector('#attach-image-btn');
    const imageInput = container.querySelector('#image-upload-input');
    const attachmentsContainer = container.querySelector('#prompt-attachments');
    const lightboxModal = document.getElementById('lightbox-modal');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCloseBtn = document.getElementById('lightbox-close-btn');

    if (lightboxCloseBtn) {
        lightboxCloseBtn.addEventListener('click', () => {
            lightboxModal.style.display = 'none';
        });
    }

    const renderAttachments = () => {
        if (!attachmentsContainer) return;
        attachmentsContainer.innerHTML = '';
        pendingImages.forEach((dataUrl, idx) => {
            const item = document.createElement('div');
            item.className = 'attachment-item';
            
            const img = document.createElement('img');
            img.src = dataUrl;
            img.addEventListener('click', () => {
                lightboxImg.src = dataUrl;
                lightboxModal.style.display = 'flex';
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'attachment-remove-btn';
            removeBtn.innerHTML = '<i data-lucide="x"></i>';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                pendingImages.splice(idx, 1);
                renderAttachments();
            });

            item.appendChild(img);
            item.appendChild(removeBtn);
            attachmentsContainer.appendChild(item);
        });
        if (window.lucide) window.lucide.createIcons({ root: attachmentsContainer });
    };

    if (attachBtn && imageInput) {
        attachBtn.addEventListener('click', () => {
            imageInput.click();
        });

        imageInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        pendingImages.push(event.target.result);
                        renderAttachments();
                    };
                    reader.readAsDataURL(file);
                }
            });
            imageInput.value = ''; // Reset input
        });
    }

    const processAIResponse = async (responseObj) => {
        if (!stateManager.isGenerating) return;
        
        const text = responseObj.text;
        const stats = responseObj.stats;
        const toolCalls = parseAllToolCalls(text);
        
        if (toolCalls.length > 0) {
            if (chatContainer) {
                const loaders = chatContainer.querySelectorAll('.loading-row');
                loaders.forEach(l => l.remove());
            }
            
            stateManager.addMessage('assistant', text, [], stats);
            
            const state = stateManager.getState();
            const activeProject = state.activeProjectId 
                ? state.projects.find(p => p.id === state.activeProjectId)
                : null;
            const basePath = activeProject ? activeProject.path : null;
            
            if (!stateManager.isGenerating) return;
            
            const results = await Promise.all(
                toolCalls.map(tc => executeTool(tc, basePath, stateManager.getCancelSignal(), stateManager.cancelController))
            );
            
            if (!stateManager.isGenerating) {
                stateManager.addMessage('assistant', '<div class="terminated-line"><span>terminated</span></div>');
                return;
            }
            
            let combinedResult = '';
            toolCalls.forEach((tc, i) => {
                console.log(`Tool Result for ${tc.name}:`, results[i]);
                combinedResult += `<tool_result name="${tc.name}">\n${results[i]}\n</tool_result>\n`;
            });
            
            stateManager.addMessage('user', combinedResult.trim());
            
            if (!stateManager.isGenerating) return;
            
            await window._resumeGeneration();
        } else {
            if (chatContainer) {
                const loaders = chatContainer.querySelectorAll('.loading-row');
                loaders.forEach(l => l.remove());
            }
            stateManager.addMessage('assistant', text, [], stats);
            stateManager.finishGeneration();
        }
    };

    window._resumeGeneration = async () => {
        if (!stateManager.isGenerating) stateManager.startGeneration();

        if (chatContainer) {
            const row = document.createElement('div');
            row.className = 'message-row assistant loading-row';
            row.innerHTML = `<div class="message-bubble"><div class="loading-dots"><span></span><span></span><span></span></div></div>`;
            chatContainer.appendChild(row);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        try {
            const messages = stateManager.getActiveMessages();
            const response = await llmService.sendMessage(messages, stateManager.getState(), stateManager.getCancelSignal());
            await processAIResponse(response);
        } catch (error) {
            if (error.name === 'AbortError') {
                stateManager.addMessage('assistant', '<div class="terminated-line"><span>terminated</span></div>');
            } else {
                console.error("Failed to send prompt:", error);
                if (chatContainer) {
                    const loaders = chatContainer.querySelectorAll('.loading-row');
                    loaders.forEach(l => l.remove());
                }
                stateManager.addMessage('assistant', formatErrorAsCard(error.message, "API Error"));
            }
            stateManager.finishGeneration();
        }
    };

    const submitPrompt = async () => {
        if (!promptBox) return;
        const text = promptBox.value.trim();
        if (!text && pendingImages.length === 0) return;
        
        const state = stateManager.getState();
        let targetChat = null;
        if (state.activeProjectId) {
            const proj = state.projects.find(p => p.id === state.activeProjectId);
            targetChat = proj?.chats?.find(c => c.id === state.activeChatId);
        } else {
            targetChat = state.chats?.find(c => c.id === state.activeChatId);
        }
        
        if (targetChat && (!targetChat.messages || targetChat.messages.length === 0)) {
            targetChat.title = text.length > 30 ? text.substring(0, 30) + '...' : text || 'Image Conversation';
            stateManager.saveState();
        }

        promptBox.value = '';
        promptBox.style.height = '60px'; 
        
        const currentImages = [...pendingImages];
        pendingImages = [];
        renderAttachments();
        
        stateManager.addMessage('user', text, currentImages);

        try {
            stateManager.startGeneration();
            const state = stateManager.getState();
            if (state.intentAnalyzerModel) {
                console.log(`Analyzing intent for: "${text}" using model: ${state.intentAnalyzerModel}`);
                let analyzerRow = null;
                if (chatContainer) {
                    analyzerRow = document.createElement('div');
                    analyzerRow.className = 'message-row assistant analyzer-row';
                    analyzerRow.innerHTML = `
                    <div class="message-bubble intent-chip-wrapper" style="font-size: 13px; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid var(--border-color); padding: 6px 12px; cursor: default;">
                        <i data-lucide="loader-2" class="icon-svg sm spin-anim" style="color: var(--accent-primary);"></i> Analyzing intent...
                    </div>`;
                    chatContainer.appendChild(analyzerRow);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                    if (window.lucide) window.lucide.createIcons({ root: analyzerRow });
                }
                const startTime = Date.now();
                
                let intentResult = null;
                try {
                    intentResult = await llmService.analyzeIntent(text, state.intentAnalyzerModel, stateManager.getCancelSignal());
                } catch (err) {
                    if (err.name !== 'AbortError') console.error(err);
                }
                
                if (analyzerRow) {
                    analyzerRow.remove();
                }
                if (!stateManager.isGenerating) {
                    stateManager.addMessage('assistant', '<div class="terminated-line"><span>terminated</span></div>');
                    return;
                }
                
                if (intentResult) {
                    console.log("Intent Analysis Result:", intentResult);
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                    stateManager.addMessage('intent', JSON.stringify(intentResult), [], { elapsed });
                }
            }
            
            if (!stateManager.isGenerating) return;
            
            await window._resumeGeneration();
            
        } catch (error) {
            console.error("Failed in intent analysis:", error);
            stateManager.finishGeneration();
        }
    };
    if (promptBox && sendBtn) {
        promptBox.addEventListener('input', () => {
            promptBox.style.height = '60px';
            promptBox.style.height = Math.min(promptBox.scrollHeight, 200) + 'px';
        });

        promptBox.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitPrompt();
            }
        });

        promptBox.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            pendingImages.push(event.target.result);
                            renderAttachments();
                        };
                        reader.readAsDataURL(file);
                    }
                }
            }
        });

        const promptBoxContainer = container.querySelector('#prompt-box');
        if (promptBoxContainer) {
            // Prevent default browser drop behavior
            window.addEventListener('dragover', (e) => e.preventDefault());
            window.addEventListener('drop', (e) => e.preventDefault());

            promptBoxContainer.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                promptBoxContainer.classList.add('drag-over');
            });
            promptBoxContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                promptBoxContainer.classList.add('drag-over');
            });
            promptBoxContainer.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!promptBoxContainer.contains(e.relatedTarget)) {
                    promptBoxContainer.classList.remove('drag-over');
                }
            });
            promptBoxContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                promptBoxContainer.classList.remove('drag-over');
                
                const files = Array.from(e.dataTransfer.files);
                files.forEach(file => {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            pendingImages.push(event.target.result);
                            renderAttachments();
                        };
                        reader.readAsDataURL(file);
                    }
                });
            });
        }

        sendBtn.addEventListener('click', (e) => {
            if (stateManager.isGenerating) {
                e.preventDefault();
                stateManager.cancelGeneration();
            } else {
                submitPrompt();
            }
        });
    }
    
    const renderRecentConvos = () => {
        const list = container.querySelector('#recent-convos-list');
        if (!list) return;
        
        const state = stateManager.getState();
        let allChats = [];
        if (state.projects) {
            state.projects.forEach(p => {
                if (p.chats) {
                    const valid = p.chats.filter(c => c.messages && c.messages.length > 0);
                    allChats = allChats.concat(valid.map(c => ({...c, projectId: p.id})));
                }
            });
        }
        if (state.chats) {
            const valid = state.chats.filter(c => c.messages && c.messages.length > 0);
            allChats = allChats.concat(valid.map(c => ({...c, projectId: null})));
        }
        
        // Sort by updatedAt descending and take top 5
        allChats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const topChats = allChats.slice(0, 5);
        
        list.innerHTML = '';
        if (topChats.length === 0) {
            list.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 12px 16px;">No recent conversations</div>';
            return;
        }
        
        topChats.forEach(chat => {
            const item = document.createElement('div');
            item.className = 'run-item';
            item.style.cursor = 'pointer';
            item.innerHTML = `<i data-lucide="message-square" class="icon-svg sm" style="color: var(--text-secondary);"></i> <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 8px;">${chat.title || 'Untitled Conversation'}</span>`;
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                stateManager.updateState({ activeProjectId: chat.projectId, activeChatId: chat.id });
            });
            list.appendChild(item);
        });
        
        if (window.lucide) window.lucide.createIcons({ root: list });
    };

    // Subscribe to messages changes to re-render chat
    const unsubscribeChat = stateManager.subscribe((state) => {
        renderChatHistory();
        renderProjects();
        renderRecentConvos();
        
        // sync button state
        const sendBtn = document.getElementById('send-prompt-btn');
        if (sendBtn) {
            if (stateManager.isGenerating) {
                sendBtn.innerHTML = '<i data-lucide="square" class="icon-svg sm" style="color:var(--error-color);"></i>';
                sendBtn.classList.add('is-generating');
            } else {
                sendBtn.innerHTML = '<i data-lucide="arrow-right" class="icon-svg sm"></i>';
                sendBtn.classList.remove('is-generating');
            }
            if (window.lucide) window.lucide.createIcons({ root: sendBtn });
        }
        
        // keep model dropdown synced if changed externally
        if (state.activeModel) {
            const modelTextEl = document.getElementById('active-model-text');
            if (modelTextEl) {
                modelTextEl.textContent = state.activeModel;
            }
        }
    });

    // Sidebar Resizer Logic
    const initResizer = () => {
        const resizer = container.querySelector('#sidebar-resizer');
        if (!resizer) return;
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            const currentWidth = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
            startWidth = parseInt(currentWidth, 10) || 240;
            resizer.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const diff = e.clientX - startX;
            let newWidth = startWidth + diff;
            if (newWidth < 180) newWidth = 180; 
            if (newWidth > 600) newWidth = 600;
            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        });

        window.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizer.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    };
    initResizer();

    // Initial render
    renderChatHistory();
    renderProjects();
    renderRecentConvos();


}

