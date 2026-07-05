import { invoke } from '@tauri-apps/api/core';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import agentsHtml from './Agents.html?raw';
import './Agents.css';
import './pages.css';
import { stateManager } from '../../core/state.js';
import PROVIDERS_CONFIG from './providers.json';

export function renderAgents(container) {
    container.innerHTML = agentsHtml;
    
    // Bind routing
    const backBtn = container.querySelector('#agents-back-btn');
    const rightHomeBtn = container.querySelector('#nav-right-home-btn');
    
    const goHome = () => window.router.navigate('home');
    if (backBtn) backBtn.addEventListener('click', goHome);
    if (rightHomeBtn) rightHomeBtn.addEventListener('click', goHome);

    const navIntegrationsTab = container.querySelector('#nav-integrations-tab');
    const navAgentsTab = container.querySelector('#nav-agents-tab');
    const agentsView = container.querySelector('#agents-view');
    const integrationsView = container.querySelector('#integrations-view');

    const switchMainView = (viewName) => {
        navIntegrationsTab.classList.toggle('active', viewName === 'integrations');
        navAgentsTab.classList.toggle('active', viewName === 'agents');
        integrationsView.style.display = viewName === 'integrations' ? 'flex' : 'none';
        agentsView.style.display = viewName === 'agents' ? 'flex' : 'none';
        if (viewName === 'integrations' && window.lucide) {
            window.lucide.createIcons({ root: integrationsView });
        }
    };
    if (navIntegrationsTab) navIntegrationsTab.addEventListener('click', () => switchMainView('integrations'));
    if (navAgentsTab) navAgentsTab.addEventListener('click', () => switchMainView('agents'));

    // Honor cross-view request to open the Integrations panel
    if (window.cogneticOpenIntegrations) {
        switchMainView('integrations');
        window.cogneticOpenIntegrations = false;
    }


    // --- Route to new views from top nav ---
    const agNavMap = {
        'nav-agents-channels-tab': 'channels',
        'nav-agents-connectors-tab': 'connectors',
        'nav-agents-browser-tab': 'browser',
        'nav-agents-settings-tab': 'settings',
    };
    Object.entries(agNavMap).forEach(([id, route]) => {
        const btn = container.querySelector(`#${id}`);
        if (btn) btn.addEventListener('click', () => window.router.navigate(route));
    });

    // --- Sub-tab routing ---
    const agentsSubTabs = container.querySelectorAll('#agents-view .sub-tab');
    const agentsTabContents = container.querySelectorAll('#agents-view .tab-content');

    const switchAgentsTab = (tabName) => {
        agentsSubTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        agentsTabContents.forEach(tc => {
            const isActive = tc.id === `tab-${tabName}`;
            tc.classList.toggle('active-tab', isActive);
        });
    };

    agentsSubTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const name = tab.dataset.tab;
            switchAgentsTab(name);
            if (name === 'skills') renderSkillsPage(container);
            if (name === 'subagents') renderSubAgentsPage(container);
            if (name === 'memory') renderMemoryPage(container);
            if (name === 'config') setupConfigPage(container);
        });
    });

    // --- Integrations sub-tab routing ---
    const intSubTabs = container.querySelectorAll('#integrations-view .integration-tab');
    const intTabContents = container.querySelectorAll('#integrations-view .integration-content');

    const switchIntTab = (tabName) => {
        intSubTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        intTabContents.forEach(tc => {
            const isActive = tc.id === `tab-${tabName}`;
            tc.classList.toggle('active-tab', isActive);
        });
    };

    intSubTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchIntTab(tab.dataset.tab);
        });
    });


    // Form elements
    const providerNameEl = container.querySelector('#provider-name');
    const providerDescEl = container.querySelector('#provider-description');
    const providerLogoWrapper = container.querySelector('#provider-logo-wrapper');
    const breadcrumbProvider = container.querySelector('#breadcrumb-provider');
    const statusIndicator = container.querySelector('#config-status-indicator');
    const apiKeyInput = container.querySelector('#apiKey');
    const apiHostInput = container.querySelector('#apiHost');
    const modelsContainer = container.querySelector('#models-container');
    const providerCountEl = container.querySelector('#provider-count');

    // Dynamically render sidebar list
    const modelsListEl = container.querySelector('#sidebar-models-list');
    if (modelsListEl) {
        let listHtml = '';
        const providers = Object.entries(PROVIDERS_CONFIG);
        if (providerCountEl) providerCountEl.textContent = providers.length;
        
        for (const [providerName, pConfig] of providers) {
            const listIconHtml = pConfig.icon ? `<img src="${pConfig.icon}" class="company-icon" alt="${providerName}" />` : '';
            listHtml += `<button class="model-item ${providerName === 'OpenAI Compatible' ? 'active' : ''}">${listIconHtml} <span>${providerName}</span></button>`;
        }
        modelsListEl.innerHTML = listHtml;
    }
    const btnSave = container.querySelector('#save-config-btn');
    const btnReset = container.querySelector('#reset-config-btn');

    const updateStatusBadge = (config) => {
        if (!statusIndicator) return;

        const statusText = statusIndicator.querySelector('.status-text');
        
        // Find if this is a CDP bridge
        const modelName = document.querySelector('.provider-header .title')?.textContent.trim();
        const pConfig = modelName ? PROVIDERS_CONFIG[modelName] : {};

        if ((config && config.apiKey && config.apiKey.trim() !== '') || pConfig?.isCdpBridge) {
            statusIndicator.classList.add('configured');
            if (statusText) statusText.textContent = 'Configured';
        } else {
            statusIndicator.classList.remove('configured');
            if (statusText) statusText.textContent = 'Not Configured';
        }
    };



    const loadProviderToForm = (activeItem) => {
        const modelName = activeItem.querySelector('span')?.textContent.trim() || activeItem.textContent.trim();
        
        const pConfig = PROVIDERS_CONFIG[modelName] || {};
        const iconHtml = pConfig.icon ? `<img src="${pConfig.icon}" class="provider-logo" alt="${modelName}" />` : '';

        // Update provider name and description
        if (providerNameEl) providerNameEl.textContent = modelName;
        if (providerDescEl) providerDescEl.textContent = pConfig.description || `Connect to ${modelName} API.`;
        if (breadcrumbProvider) breadcrumbProvider.textContent = modelName;
        
        // Update provider logo
        if (providerLogoWrapper && pConfig.icon) {
            providerLogoWrapper.innerHTML = iconHtml;
        }

        // Update documentation link
        const docsLink = container.querySelector('#provider-docs-link');
        if (docsLink) {
            if (modelName === 'Ollama' || modelName === 'LM Studio' || !pConfig.link) {
                docsLink.style.display = 'none';
            } else {
                docsLink.style.display = 'flex';
                docsLink.href = pConfig.link || '#';
                
                // Remove any existing event listeners
                const newDocsLink = docsLink.cloneNode(true);
                docsLink.parentNode.replaceChild(newDocsLink, docsLink);
                
                // Add click handler to open in external browser
                newDocsLink.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const url = pConfig.link || '#';
                    if (url !== '#') {
                        shellOpen(url).catch(err => console.error('Failed to open link:', err));
                    }
                });
            }
        }
        
        const config = stateManager.getProviderConfig(modelName);
        if (apiKeyInput) apiKeyInput.value = config.apiKey || '';
        
        const authSection = container.querySelector('#auth-section');
        const connSection = container.querySelector('#connection-section');
        if (pConfig.isCdpBridge) {
            if (authSection) authSection.style.display = 'none';
            if (connSection) connSection.style.display = 'none';
        } else {
            if (authSection) authSection.style.display = 'block';
            if (connSection) connSection.style.display = 'block';
        }

        if (apiHostInput) {
            apiHostInput.value = config.apiHost || pConfig.baseUrl || '';
            apiHostInput.readOnly = (modelName !== 'OpenAI Compatible');
            
            // Hide override button for OpenAI compatible since it's already editable
            const overrideBtn = container.querySelector('#override-host-btn');
            if (overrideBtn) {
                overrideBtn.style.display = (modelName === 'OpenAI Compatible') ? 'none' : 'flex';
            }
        }
        
        if (modelsContainer) {
            modelsContainer.innerHTML = '';
            
            if (modelName === 'OpenAI Compatible') {
                const customModels = config.customModels || [];
                
                const renderCustomModels = () => {
                    modelsContainer.innerHTML = '';
                    
                    const badgesWrapper = document.createElement('div');
                    badgesWrapper.className = 'badges-wrapper';
                    if (customModels.length > 0) badgesWrapper.style.marginBottom = '12px';
                    
                    customModels.forEach((cm, idx) => {
                        const badge = document.createElement('div');
                        badge.className = 'model-badge';
                        badge.innerHTML = `
                            <span>${cm.name ? cm.name + ' (' + cm.id + ')' : cm.id}</span>
                            <button class="remove-model-btn" data-idx="${idx}"><i data-lucide="x" class="icon-svg sm"></i></button>
                        `;
                        badgesWrapper.appendChild(badge);
                    });
                    modelsContainer.appendChild(badgesWrapper);
                    
                    const addRow = document.createElement('div');
                    addRow.className = 'add-model-row';
                    addRow.innerHTML = `
                        <div class="field-input-wrapper">
                            <input type="text" class="field-input" id="customModelId" placeholder="Model ID (e.g. gpt-4)" />
                        </div>
                        <div class="field-input-wrapper">
                            <input type="text" class="field-input" id="customModelName" placeholder="Name (Optional)" />
                        </div>
                        <button class="add-model-btn" id="addCustomModelBtn">Add</button>
                    `;
                    modelsContainer.appendChild(addRow);
                    
                    const removeBtns = modelsContainer.querySelectorAll('.remove-model-btn');
                    removeBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const i = e.currentTarget.getAttribute('data-idx');
                            customModels.splice(i, 1);
                            stateManager.updateProviderConfig(modelName, { ...stateManager.getProviderConfig(modelName), customModels });
                            renderCustomModels();
                            if (window.lucide) window.lucide.createIcons({ root: modelsContainer });
                        });
                    });
                    
                    const addBtn = modelsContainer.querySelector('#addCustomModelBtn');
                    if (addBtn) {
                        addBtn.addEventListener('click', () => {
                            const idInput = modelsContainer.querySelector('#customModelId');
                            const nameInput = modelsContainer.querySelector('#customModelName');
                            if (idInput && idInput.value.trim()) {
                                customModels.push({ id: idInput.value.trim(), name: nameInput.value.trim() });
                                stateManager.updateProviderConfig(modelName, { ...stateManager.getProviderConfig(modelName), customModels });
                                renderCustomModels();
                                if (window.lucide) window.lucide.createIcons({ root: modelsContainer });
                            }
                        });
                    }
                };
                renderCustomModels();
                
            } else {
                const badgesWrapper = document.createElement('div');
                badgesWrapper.className = 'badges-wrapper';
                
                const models = pConfig.models || ['Default Base Model'];
                models.forEach(modelId => {
                    const badge = document.createElement('div');
                    badge.className = 'model-badge';
                    badge.innerHTML = `<i data-lucide="cpu" class="icon-svg sm"></i> <span>${modelId}</span>`;
                    badgesWrapper.appendChild(badge);
                });
                
                modelsContainer.appendChild(badgesWrapper);
                if (window.lucide) window.lucide.createIcons({ root: modelsContainer });
            }

        }

        // Update models count badge
        const modelsCountBadge = container.querySelector('#models-count-badge');
        if (modelsCountBadge) {
            const models = pConfig.models || (modelName === 'OpenAI Compatible' ? config.customModels : []);
            modelsCountBadge.textContent = `${models.length} model${models.length !== 1 ? 's' : ''}`;
        }

        updateStatusBadge(config);
    };

    // Model selection logic
    const modelItems = container.querySelectorAll('.model-item');
    modelItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Remove active class from all
            modelItems.forEach(mi => mi.classList.remove('active'));
            // Add to clicked
            const target = e.currentTarget;
            target.classList.add('active');

            loadProviderToForm(target);
        });
    });

    // Provider search functionality
    const searchInput = container.querySelector('#provider-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            modelItems.forEach(item => {
                const name = item.querySelector('span')?.textContent.toLowerCase() || item.textContent.toLowerCase();
                item.style.display = name.includes(query) ? 'flex' : 'none';
            });
        });
    }

    // Override Button Logic
    const overrideBtn = container.querySelector('#override-host-btn');
    if (overrideBtn && apiHostInput) {
        overrideBtn.addEventListener('click', () => {
            apiHostInput.readOnly = false;
            apiHostInput.focus();
        });
    }

    // Toggle Visibility Button Logic
    const toggleVisBtn = container.querySelector('#toggle-visibility-btn');
    if (toggleVisBtn && apiKeyInput) {
        toggleVisBtn.addEventListener('click', () => {
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                toggleVisBtn.innerHTML = '<i data-lucide="eye-off" class="icon-svg"></i>';
            } else {
                apiKeyInput.type = 'password';
                toggleVisBtn.innerHTML = '<i data-lucide="eye" class="icon-svg"></i>';
            }
            if (window.lucide) window.lucide.createIcons({ root: toggleVisBtn });
        });
    }

    // API Validation Logic
    async function validateAPIKey(modelName, key, host) {
        if (!key) return { isValid: false, message: 'API key cannot be empty' };
        try {
            let base = host.replace(/\/$/, '');
            let apiPath = PROVIDERS_CONFIG[modelName] ? (PROVIDERS_CONFIG[modelName].apiPath || '') : '';
            if (apiPath && !base.endsWith(apiPath)) {
                base += apiPath;
            }

            let endpoint = base + '/chat/completions';
            let headers = {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            };
            let dummyModel = (PROVIDERS_CONFIG[modelName] && PROVIDERS_CONFIG[modelName].models && PROVIDERS_CONFIG[modelName].models.length > 0) ? PROVIDERS_CONFIG[modelName].models[0] : 'gpt-3.5-turbo';
            let body = JSON.stringify({ model: dummyModel, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 });
            
            if (modelName === 'Anthropic') {
                endpoint = base + '/messages';
                headers = {
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                };
            } else if (modelName === 'DeepSeek (CDP)') {
                // If they don't have v1beta in the path, add it
                if (!base.endsWith('/v1beta')) {
                    endpoint = base + `/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
                } else {
                    endpoint = base + `/models/gemini-1.5-flash:generateContent?key=${key}`;
                }
                headers = { 'Content-Type': 'application/json' };
                body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });
            }
            
            const response = await invoke('perform_http_request', {
                url: endpoint,
                method: 'POST',
                headers: headers,
                body: body
            });
            
            if (response.status < 200 || response.status >= 300) {
                // If auth fails, we usually get 401 or 403
                if (response.status === 401 || response.status === 403) {
                    let errorDetails = '';
                    try {
                        const json = JSON.parse(response.text);
                        errorDetails = JSON.stringify(json, null, 2);
                    } catch(e) {}
                    return { isValid: false, status: response.status, message: 'Unauthorized / Forbidden', details: errorDetails || response.text };
                }
                // If it's 404 (Model Not Found), 400 (Bad Request), etc, it means the API Key was accepted, but the dummy model failed!
                return { isValid: true };
            }
            return { isValid: true };
        } catch (e) {
            console.warn('API Validation fetch failed (likely CORS or Network), treating as invalid:', e);
            return { isValid: false, status: 0, message: 'Network or CORS Error', details: e.toString() }; 
        }
    }

    // Save button
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const activeItem = container.querySelector('.model-item.active');
            if (activeItem) {
                const modelName = activeItem.textContent.trim();
                const existingConfig = stateManager.getProviderConfig(modelName);
                
                const config = {
                    apiKey: apiKeyInput.value,
                    apiHost: apiHostInput.value,
                    customModels: existingConfig.customModels || []
                };
                
                // Remove existing error card if any
                const existingError = btnSave.closest('.config-content').querySelector('.api-error-card');
                if (existingError) existingError.remove();

                // Show loading state
                const originalHtml = btnSave.innerHTML;
                btnSave.innerHTML = '<style>@keyframes spin { 100% { transform: rotate(360deg); } }</style><i data-lucide="loader" class="icon-svg sm" style="animation: spin 1s linear infinite;"></i> Validating...';
                btnSave.disabled = true;
                if (window.lucide) window.lucide.createIcons({ root: btnSave });
                
                let validationResult = { isValid: true };
                if (config.apiKey) {
                    validationResult = await validateAPIKey(modelName, config.apiKey, config.apiHost);
                }
                
                btnSave.disabled = false;
                
                if (validationResult.isValid) {
                    stateManager.updateProviderConfig(modelName, config);
                    updateStatusBadge(config);
                    
                    btnSave.innerHTML = '<i data-lucide="check-check" class="icon-svg sm"></i> Saved!';
                    if (window.lucide) window.lucide.createIcons({ root: btnSave });
                    
                    setTimeout(() => { 
                        btnSave.innerHTML = originalHtml; 
                        if (window.lucide) window.lucide.createIcons({ root: btnSave });
                    }, 1500);
                } else {
                    btnSave.innerHTML = '<i data-lucide="alert-triangle" class="icon-svg sm"></i> Invalid API Key';
                    if (window.lucide) window.lucide.createIcons({ root: btnSave });
                    
                    updateStatusBadge({}); // Revert to Not Configured
                    
                    // Show error card
                    let typeClass = ' err-unauthorized';
                    if (validationResult.status === 0) typeClass = ' err-timeout';
                    
                    const errorCard = document.createElement('div');
                    errorCard.className = `modern-error-card api-error-card ${typeClass}`;
                    errorCard.style.marginTop = '16px';
                    errorCard.style.width = '100%';
                    errorCard.innerHTML = `<div class="modern-error-header"><i data-lucide="shield-alert" class="icon-svg"></i><span>Validation Failed</span></div><div class="modern-error-body"><div style="font-weight: 500;">${validationResult.message}</div>${validationResult.details ? `<details class="modern-error-details" style="margin-top: 12px;"><summary>View technical details</summary><pre>${validationResult.details}</pre></details>` : ''}<div style="margin-top: 16px;"><button id="force-save-btn" class="btn-secondary" style="background: rgba(255,255,255,0.06); padding: 6px 14px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: inherit; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 500;"><i data-lucide="check-circle" class="icon-svg sm"></i> Force Save Anyway</button></div></div>`;
                    
                    btnSave.closest('.config-content').appendChild(errorCard);
                    if (window.lucide) window.lucide.createIcons({ root: errorCard });

                    const forceSaveBtn = errorCard.querySelector('#force-save-btn');
                    if (forceSaveBtn) {
                        forceSaveBtn.addEventListener('click', () => {
                            stateManager.updateProviderConfig(modelName, config);
                            updateStatusBadge(config);
                            forceSaveBtn.innerHTML = '<i data-lucide="check" class="icon-svg sm"></i> Saved!';
                            if (window.lucide) window.lucide.createIcons({ root: forceSaveBtn });
                            setTimeout(() => { errorCard.remove(); }, 1000);
                        });
                    }
                    
                    setTimeout(() => { 
                        btnSave.innerHTML = originalHtml; 
                        if (window.lucide) window.lucide.createIcons({ root: btnSave });
                    }, 2000);
                }
            }
        });
    }

    // Reset button
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            const activeItem = container.querySelector('.model-item.active');
            if (activeItem) {
                const modelName = activeItem.textContent.trim();
                apiKeyInput.value = '';
                if (apiHostInput) apiHostInput.value = PROVIDERS_CONFIG[modelName]?.baseUrl || '';
                stateManager.updateProviderConfig(modelName, { apiKey: '', apiHost: apiHostInput ? apiHostInput.value : '', customModels: [] });
                
                // Reload UI
                loadProviderToForm(activeItem);
                updateStatusBadge({});
            }
        });
    }

    // Initialize form with currently active model
    const initialActive = container.querySelector('.model-item.active');
    if (initialActive) {
        loadProviderToForm(initialActive);
    }

    // --- Custom Dropdown Logic ---
    const initCustomDropdown = (dropdownEl) => {
        if (!dropdownEl) return;
        const selected = dropdownEl.querySelector('.dropdown-selected');
        const optionsContainer = dropdownEl.querySelector('.dropdown-options');
        const textSpan = selected.querySelector('.selected-text');

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            container.querySelectorAll('.custom-dropdown.open').forEach(el => {
                if (el !== dropdownEl) el.classList.remove('open');
            });
            dropdownEl.classList.toggle('open');
        });

        optionsContainer.addEventListener('click', (e) => {
            const opt = e.target.closest('.dropdown-option');
            if (opt) {
                const val = opt.getAttribute('data-value');
                const text = opt.textContent;
                dropdownEl.setAttribute('data-value', val);
                textSpan.textContent = text;
                
                // Update selected class
                optionsContainer.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                
                dropdownEl.classList.remove('open');
            }
        });

        // Click outside closes
        document.addEventListener('click', (e) => {
            if (!dropdownEl.contains(e.target)) {
                dropdownEl.classList.remove('open');
            }
        });
    };

    const setDropdownValue = (dropdownEl, val) => {
        if (!dropdownEl) return;
        const opt = dropdownEl.querySelector(`.dropdown-option[data-value="${val}"]`);
        if (opt) {
            dropdownEl.setAttribute('data-value', val);
            dropdownEl.querySelector('.selected-text').textContent = opt.textContent;
            dropdownEl.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        }
    };

    const ddWs = container.querySelector('#dropdown-websearch');
    const ddWf = container.querySelector('#dropdown-webfetch');
    initCustomDropdown(ddWs);
    initCustomDropdown(ddWf);

    // --- Integrations Setup ---
    const loadIntegrationsState = () => {
        const state = stateManager.getState();
        const integrations = state.integrations || {
            webSearch: { activeProvider: 'tavily', apiKeys: {} },
            webFetch: { activeProvider: 'jina', apiKeys: {} }
        };
        
        // Web Search
        if (ddWs) setDropdownValue(ddWs, integrations.webSearch.activeProvider || 'tavily');
        
        const wsKeys = ['tavily', 'jina', 'brave', 'bing', 'serp'];
        wsKeys.forEach(k => {
            const input = container.querySelector(`#apiKey-${k}`);
            if (input) input.value = integrations.webSearch.apiKeys[k] || '';
        });

        // Web Fetch
        if (ddWf) setDropdownValue(ddWf, integrations.webFetch.activeProvider || 'jina');
        
        const wfKey = container.querySelector('#apiKey-fetch-jina');
        if (wfKey) wfKey.value = integrations.webFetch.apiKeys['jina'] || '';
    };

    const saveIntegrationsState = () => {
        const state = stateManager.getState();
        const integrations = state.integrations || { webSearch: {apiKeys:{}}, webFetch: {apiKeys:{}} };
        
        // Web Search
        if (ddWs) integrations.webSearch.activeProvider = ddWs.getAttribute('data-value');
        
        const wsKeys = ['tavily', 'jina', 'brave', 'bing', 'serp'];
        wsKeys.forEach(k => {
            const input = container.querySelector(`#apiKey-${k}`);
            if (input) integrations.webSearch.apiKeys[k] = input.value.trim();
        });

        // Web Fetch
        if (ddWf) integrations.webFetch.activeProvider = ddWf.getAttribute('data-value');
        
        const wfKey = container.querySelector('#apiKey-fetch-jina');
        if (wfKey) integrations.webFetch.apiKeys['jina'] = wfKey.value.trim();

        stateManager.updateState({ integrations });
    };

    loadIntegrationsState();
    
    const saveWsBtn = container.querySelector('#save-integrations-websearch-btn');
    if (saveWsBtn) {
        saveWsBtn.addEventListener('click', () => {
            saveIntegrationsState();
            const originalHtml = saveWsBtn.innerHTML;
            saveWsBtn.innerHTML = '<i data-lucide="check-check" class="icon-svg sm"></i> Saved!';
            if (window.lucide) window.lucide.createIcons({ root: saveWsBtn });
            setTimeout(() => {
                saveWsBtn.innerHTML = originalHtml;
                if (window.lucide) window.lucide.createIcons({ root: saveWsBtn });
            }, 1500);
        });
    }

    const saveWfBtn = container.querySelector('#save-integrations-webfetch-btn');
    if (saveWfBtn) {
        saveWfBtn.addEventListener('click', () => {
            saveIntegrationsState();
            const originalHtml = saveWfBtn.innerHTML;
            saveWfBtn.innerHTML = '<i data-lucide="check-check" class="icon-svg sm"></i> Saved!';
            if (window.lucide) window.lucide.createIcons({ root: saveWfBtn });
            setTimeout(() => {
                saveWfBtn.innerHTML = originalHtml;
                if (window.lucide) window.lucide.createIcons({ root: saveWfBtn });
            }, 1500);
        });
    }

    // --- Integrations visibility toggles ---
    const integrationsViewEl = container.querySelector('#integrations-view');
    if (integrationsViewEl) {
        integrationsViewEl.querySelectorAll('.toggle-visibility').forEach(btn => {
            btn.addEventListener('click', () => {
                const wrapper = btn.closest('.modern-input-wrapper');
                const input = wrapper ? wrapper.querySelector('input') : null;
                if (!input) return;
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                btn.innerHTML = isPassword
                    ? '<i data-lucide="eye-off" class="icon-svg sm"></i>'
                    : '<i data-lucide="eye" class="icon-svg sm"></i>';
                if (window.lucide) window.lucide.createIcons({ root: btn });
            });
        });
    }
}

// ── Skills Page ──────────────────────────────────────────────────────────────
function renderSkillsPage(container) {
    const el = container.querySelector('#tab-skills');
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = '1';

    const skills = [
        { name: 'Web Search', icon: 'globe', desc: 'Search the internet in real-time for up-to-date information.', active: true, category: 'Built-in' },
        { name: 'Code Execution', icon: 'terminal', desc: 'Write and run code in a sandboxed environment.', active: true, category: 'Built-in' },
        { name: 'File System', icon: 'folder-open', desc: 'Read, write and manage files on disk.', active: true, category: 'Built-in' },
        { name: 'Image Generation', icon: 'image', desc: 'Generate images from text prompts using AI models.', active: false, category: 'Built-in' },
        { name: 'Calculator', icon: 'calculator', desc: 'Evaluate complex mathematical expressions precisely.', active: true, category: 'Built-in' },
        { name: 'Slack', icon: 'message-square', desc: 'Send messages, read channels and manage Slack workspaces.', active: false, category: 'Integrations' },
        { name: 'GitHub', icon: 'git-branch', desc: 'Read repos, create PRs, manage issues and review code.', active: false, category: 'Integrations' },
        { name: 'Google Calendar', icon: 'calendar', desc: 'Create, update and query events on your calendar.', active: false, category: 'Integrations' },
    ];

    const grouped = skills.reduce((acc, s) => { (acc[s.category] = acc[s.category] || []).push(s); return acc; }, {});

    el.innerHTML = `
        <div class="page-panel">
            <div class="page-panel-header">
                <div>
                    <h2 class="page-title">Skills</h2>
                    <p class="page-subtitle">Enable or disable capabilities your agents can use during conversations.</p>
                </div>
                <button class="btn-primary" id="add-skill-btn">
                    <i data-lucide="plus" class="icon-svg sm"></i> Add Custom Skill
                </button>
            </div>

            <div class="skills-search-bar">
                <i data-lucide="search" class="icon-svg sm search-icon-inner"></i>
                <input type="text" placeholder="Search skills..." id="skills-search-input" class="skills-search-input" />
            </div>

            ${Object.entries(grouped).map(([cat, items]) => `
                <div class="skill-group">
                    <div class="skill-group-label">${cat}</div>
                    <div class="skill-cards-grid">
                        ${items.map(s => `
                            <div class="skill-card ${s.active ? 'skill-active' : ''}">
                                <div class="skill-card-top">
                                    <div class="skill-icon-wrap">
                                        <i data-lucide="${s.icon}" class="icon-svg"></i>
                                    </div>
                                    <label class="toggle-pill">
                                        <input type="checkbox" ${s.active ? 'checked' : ''} />
                                        <span class="pill-track"></span>
                                    </label>
                                </div>
                                <div class="skill-name">${s.name}</div>
                                <div class="skill-desc">${s.desc}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    if (window.lucide) window.lucide.createIcons({ root: el });

    // Live search filter
    el.querySelector('#skills-search-input')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        el.querySelectorAll('.skill-card').forEach(card => {
            const match = card.querySelector('.skill-name')?.textContent.toLowerCase().includes(q)
                       || card.querySelector('.skill-desc')?.textContent.toLowerCase().includes(q);
            card.style.display = match ? '' : 'none';
        });
    });
}

// ── Sub Agents Page ──────────────────────────────────────────────────────────
function renderSubAgentsPage(container) {
    const el = container.querySelector('#tab-subagents');
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = '1';

    const agents = [
        { name: 'Researcher', role: 'Web Research', avatar: 'search', desc: 'Specializes in gathering and synthesizing information from the web.', model: 'GPT-4o', status: 'idle' },
        { name: 'Coder', role: 'Engineering', avatar: 'code-2', desc: 'Writes, reviews and debugs code across multiple languages.', model: 'Claude 3.5', status: 'active' },
        { name: 'Analyst', role: 'Data Analysis', avatar: 'bar-chart-2', desc: 'Processes datasets and produces structured analytical reports.', model: 'Gemini Pro', status: 'idle' },
        { name: 'Writer', role: 'Content Creation', avatar: 'pen-tool', desc: 'Drafts high-quality long-form content, summaries, and emails.', model: 'GPT-4o', status: 'idle' },
    ];

    el.innerHTML = `
        <div class="page-panel">
            <div class="page-panel-header">
                <div>
                    <h2 class="page-title">Sub Agents</h2>
                    <p class="page-subtitle">Configure specialist agents that can be called upon inside your workflows.</p>
                </div>
                <button class="btn-primary" id="create-agent-btn">
                    <i data-lucide="plus" class="icon-svg sm"></i> Create Agent
                </button>
            </div>

            <!-- Intent Analyzer Config -->
            <div style="margin-bottom: 24px; padding: 16px; background: var(--bg-hover); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <h3 style="margin-top: 0; font-size: var(--font-size-lg); color: var(--text-primary); margin-bottom: 8px;">Intent Analyzer Model</h3>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: 16px;">Select the fast 3-4b model to classify user requests before processing.</p>
                
                <div class="model-dropdown-wrapper" id="intent-model-dropdown-wrapper" style="position: relative;">
                    <button class="model-select-btn" id="intent-model-btn" style="background: var(--bg-panel); border: 1px solid var(--border-color); color: var(--text-primary); padding: 8px 12px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: 8px; cursor: pointer;">
                        <i data-lucide="zap" class="icon-svg sm"></i> 
                        <span id="active-intent-model-text">${stateManager.getState().intentAnalyzerModel || 'OpenAI Compatible'}</span> 
                        <i data-lucide="chevron-down" class="icon-svg sm"></i>
                    </button>
                </div>
            </div>

            <!-- Search Summarization Config -->
            <div style="margin-bottom: 24px; padding: 16px; background: var(--bg-hover); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <h3 style="margin-top: 0; font-size: var(--font-size-lg); color: var(--text-primary); margin-bottom: 8px;">Search Summarization Model</h3>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: 16px;">Select a model to summarize large web search results, saving tokens and improving focus.</p>
                
                <div class="model-dropdown-wrapper" id="search-model-dropdown-wrapper" style="position: relative;">
                    <button class="model-select-btn" id="search-model-btn" style="background: var(--bg-panel); border: 1px solid var(--border-color); color: var(--text-primary); padding: 8px 12px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: 8px; cursor: pointer;">
                        <i data-lucide="file-text" class="icon-svg sm"></i> 
                        <span id="active-search-model-text">${stateManager.getState().searchSummarizationModel || 'OpenAI Compatible'}</span> 
                        <i data-lucide="chevron-down" class="icon-svg sm"></i>
                    </button>
                </div>
            </div>

            <div class="agent-cards-grid">
                ${agents.map(a => `
                    <div class="agent-card">
                        <div class="agent-card-header">
                            <div class="agent-avatar">
                                <i data-lucide="${a.avatar}" class="icon-svg"></i>
                            </div>
                            <div class="agent-meta">
                                <div class="agent-name">${a.name}</div>
                                <div class="agent-role">${a.role}</div>
                            </div>
                            <div class="agent-status-dot ${a.status === 'active' ? 'dot-active' : 'dot-idle'}" title="${a.status}"></div>
                        </div>
                        <p class="agent-card-desc">${a.desc}</p>
                        <div class="agent-card-footer">
                            <div class="agent-model-badge">
                                <i data-lucide="sparkles" class="icon-svg sm"></i>
                                ${a.model}
                            </div>
                            <div class="agent-card-actions">
                                <button class="icon-btn" title="Configure"><i data-lucide="settings-2" class="icon-svg sm"></i></button>
                                <button class="icon-btn delete-btn" title="Delete"><i data-lucide="trash-2" class="icon-svg sm"></i></button>
                            </div>
                        </div>
                    </div>
                `).join('')}

                <div class="agent-card agent-card-new" id="add-agent-card">
                    <i data-lucide="plus-circle" class="icon-svg lg" style="color: var(--text-muted);"></i>
                    <span style="color: var(--text-muted); font-size: 13px; margin-top: 8px;">Add New Agent</span>
                </div>
            </div>

            <div class="swarm-banner">
                <div class="swarm-banner-left">
                    <i data-lucide="zap" class="icon-svg" style="color: #f59e0b;"></i>
                    <div>
                        <div class="swarm-title">Agent Swarm Mode</div>
                        <div class="swarm-desc">Route tasks intelligently across all active agents simultaneously.</div>
                    </div>
                </div>
                <label class="toggle-pill">
                    <input type="checkbox" checked />
                    <span class="pill-track"></span>
                </label>
            </div>
        </div>
    `;

    // Intent Analyzer Dropdown Logic
    const intentBtn = el.querySelector('#intent-model-btn');
    const intentWrapper = el.querySelector('#intent-model-dropdown-wrapper');
    const intentText = el.querySelector('#active-intent-model-text');

    if (intentBtn && intentWrapper) {
        // Build dropdown HTML
        const configuredProviders = stateManager.getState().providers || {};
        let models = [];
        for (const [providerName, config] of Object.entries(configuredProviders)) {
            const isLocal = ['Ollama', 'LM Studio'].includes(providerName);
            const isCdp = PROVIDERS_CONFIG[providerName]?.isCdpBridge;
            const hasKey = config.apiKey && config.apiKey.trim() !== '';
            if (hasKey || isLocal || isCdp) {
                if (providerName === 'OpenAI Compatible') {
                    if (config.customModels && config.customModels.length > 0) {
                        config.customModels.forEach(cm => models.push({ provider: providerName, id: cm.id, name: cm.name || cm.id }));
                    }
                } else {
                    const stdModels = (PROVIDERS_CONFIG[providerName] || {}).models || [];
                    stdModels.forEach(m => models.push({ provider: providerName, id: m, name: m }));
                }
            }
        }

        let dropdownHtml = `<div class="model-dropdown-menu" id="intent-model-dropdown-menu" style="top: 100%; left: 0; min-width: 240px; margin-top: 8px;">`;
        if (models.length === 0) {
            dropdownHtml += `<div class="model-item no-models" style="justify-content: center; color: var(--text-muted); cursor: default; padding: 12px;">No models configured</div>`;
        } else {
            const grouped = {};
            models.forEach(m => {
                if (!grouped[m.provider]) grouped[m.provider] = [];
                grouped[m.provider].push(m);
            });
            for (const [provider, provModels] of Object.entries(grouped)) {
                const providerConfig = PROVIDERS_CONFIG[provider] || {};
                const iconHtml = providerConfig.icon ? `<img src="${providerConfig.icon}" class="company-icon" />` : `<i data-lucide="cpu" class="icon-svg sm"></i>`;
                dropdownHtml += `
                <div class="model-item provider-item" data-provider-group="${provider}">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 400;">
                        ${iconHtml}
                        <span>${provider}</span>
                    </div>
                    <i data-lucide="chevron-right" class="icon-svg sm"></i>
                    <div class="model-submenu" data-provider-menu="${provider}">
                        <div class="model-search-container"><input type="text" class="model-search-input" placeholder="Search ${provider} models..." /></div>
                        <div class="model-list-scrollable">
                `;
                provModels.forEach(m => {
                    dropdownHtml += `<div class="model-item selectable-model-item" data-provider="${m.provider}" data-model="${m.id}" data-name="${m.name}">${m.name}</div>`;
                });
                dropdownHtml += `</div></div></div>`;
            }
        }
        dropdownHtml += `</div>`;
        intentWrapper.insertAdjacentHTML('beforeend', dropdownHtml);
        const dropdown = intentWrapper.querySelector('#intent-model-dropdown-menu');

        intentBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!intentWrapper.contains(e.target)) {
                dropdown.classList.remove('show');
                dropdown.querySelectorAll('.provider-item').forEach(i => i.classList.remove('active'));
                dropdown.querySelectorAll('.model-submenu.show').forEach(sm => sm.classList.remove('show'));
            }
        });

        dropdown.querySelectorAll('.selectable-model-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                const modelName = item.getAttribute('data-name');
                if (modelName) {
                    stateManager.updateState({ intentAnalyzerModel: modelName });
                    intentText.textContent = modelName;
                }
                dropdown.classList.remove('show');
                
                // Hide submenus
                dropdown.querySelectorAll('.model-submenu.show').forEach(sm => sm.classList.remove('show'));
                dropdown.querySelectorAll('.provider-item').forEach(i => i.classList.remove('active'));
            });
        });

        dropdown.querySelectorAll('.provider-item').forEach(pItem => {
            pItem.addEventListener('click', (e) => {
                // Prevent closing the dropdown if they just clicked the provider to open it on mobile/touch
                if (e.target.closest('.model-submenu')) return;
                const wasActive = pItem.classList.contains('active');
                dropdown.querySelectorAll('.provider-item').forEach(i => i.classList.remove('active'));
                if (!wasActive) pItem.classList.add('active');
            });
            
            pItem.addEventListener('mouseenter', () => {
                dropdown.querySelectorAll('.model-submenu.show').forEach(sm => sm.classList.remove('show'));
                const submenu = pItem.querySelector('.model-submenu');
                if (submenu) submenu.classList.add('show');
            });
            pItem.addEventListener('mouseleave', (e) => {
                const submenu = pItem.querySelector('.model-submenu');
                if (submenu && !submenu.contains(e.relatedTarget)) {
                    submenu.classList.remove('show');
                }
            });
        });
        
        dropdown.querySelectorAll('.model-search-input').forEach(input => {
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('keyup', (e) => {
                const term = e.target.value.toLowerCase();
                const listItems = e.target.closest('.model-submenu').querySelectorAll('.selectable-model-item');
                listItems.forEach(item => {
                    item.style.display = item.getAttribute('data-name').toLowerCase().includes(term) ? 'flex' : 'none';
                });
            });
        });
    }

    // Search Summarization Dropdown Logic
    const searchBtn = el.querySelector('#search-model-btn');
    const searchWrapper = el.querySelector('#search-model-dropdown-wrapper');
    const searchText = el.querySelector('#active-search-model-text');

    if (searchBtn && searchWrapper) {
        // Build dropdown HTML
        const configuredProviders = stateManager.getState().providers || {};
        let models = [];
        for (const [providerName, config] of Object.entries(configuredProviders)) {
            const isLocal = ['Ollama', 'LM Studio'].includes(providerName);
            const isCdp = PROVIDERS_CONFIG[providerName]?.isCdpBridge;
            const hasKey = config.apiKey && config.apiKey.trim() !== '';
            if (hasKey || isLocal || isCdp) {
                if (providerName === 'OpenAI Compatible') {
                    if (config.customModels && config.customModels.length > 0) {
                        config.customModels.forEach(cm => models.push({ provider: providerName, id: cm.id, name: cm.name || cm.id }));
                    }
                } else {
                    const stdModels = (PROVIDERS_CONFIG[providerName] || {}).models || [];
                    stdModels.forEach(m => models.push({ provider: providerName, id: m, name: m }));
                }
            }
        }

        let dropdownHtml = `<div class="model-dropdown-menu" id="search-model-dropdown-menu" style="top: 100%; left: 0; min-width: 240px; margin-top: 8px;">`;
        if (models.length === 0) {
            dropdownHtml += `<div class="model-item no-models" style="justify-content: center; color: var(--text-muted); cursor: default; padding: 12px;">No models configured</div>`;
        } else {
            const grouped = {};
            models.forEach(m => {
                if (!grouped[m.provider]) grouped[m.provider] = [];
                grouped[m.provider].push(m);
            });
            for (const [provider, provModels] of Object.entries(grouped)) {
                const providerConfig = PROVIDERS_CONFIG[provider] || {};
                const iconHtml = providerConfig.icon ? `<img src="${providerConfig.icon}" class="company-icon" />` : `<i data-lucide="cpu" class="icon-svg sm"></i>`;
                dropdownHtml += `
                <div class="model-item provider-item" data-provider-group="${provider}">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 400;">
                        ${iconHtml}
                        <span>${provider}</span>
                    </div>
                    <i data-lucide="chevron-right" class="icon-svg sm"></i>
                    <div class="model-submenu" data-provider-menu="${provider}">
                        <div class="model-search-container"><input type="text" class="model-search-input" placeholder="Search ${provider} models..." /></div>
                        <div class="model-list-scrollable">
                `;
                provModels.forEach(m => {
                    dropdownHtml += `<div class="model-item selectable-model-item" data-provider="${m.provider}" data-model="${m.id}" data-name="${m.name}">${m.name}</div>`;
                });
                dropdownHtml += `</div></div></div>`;
            }
        }
        dropdownHtml += `</div>`;
        searchWrapper.insertAdjacentHTML('beforeend', dropdownHtml);
        const dropdown = searchWrapper.querySelector('#search-model-dropdown-menu');

        searchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!searchWrapper.contains(e.target)) {
                dropdown.classList.remove('show');
                dropdown.querySelectorAll('.provider-item').forEach(i => i.classList.remove('active'));
                dropdown.querySelectorAll('.model-submenu.show').forEach(sm => sm.classList.remove('show'));
            }
        });

        dropdown.querySelectorAll('.selectable-model-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                const modelName = item.getAttribute('data-name');
                if (modelName) {
                    stateManager.updateState({ searchSummarizationModel: modelName });
                    searchText.textContent = modelName;
                }
                dropdown.classList.remove('show');
                dropdown.querySelectorAll('.model-submenu.show').forEach(sm => sm.classList.remove('show'));
                dropdown.querySelectorAll('.provider-item').forEach(i => i.classList.remove('active'));
            });
        });

        dropdown.querySelectorAll('.provider-item').forEach(pItem => {
            pItem.addEventListener('click', (e) => {
                if (e.target.closest('.model-submenu')) return;
                const wasActive = pItem.classList.contains('active');
                dropdown.querySelectorAll('.provider-item').forEach(i => i.classList.remove('active'));
                if (!wasActive) pItem.classList.add('active');
            });
            pItem.addEventListener('mouseenter', () => {
                dropdown.querySelectorAll('.model-submenu.show').forEach(sm => sm.classList.remove('show'));
                const submenu = pItem.querySelector('.model-submenu');
                if (submenu) submenu.classList.add('show');
            });
            pItem.addEventListener('mouseleave', (e) => {
                const submenu = pItem.querySelector('.model-submenu');
                if (submenu && !submenu.contains(e.relatedTarget)) {
                    submenu.classList.remove('show');
                }
            });
        });
        
        dropdown.querySelectorAll('.model-search-input').forEach(input => {
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('keyup', (e) => {
                const term = e.target.value.toLowerCase();
                const listItems = e.target.closest('.model-submenu').querySelectorAll('.selectable-model-item');
                listItems.forEach(item => {
                    item.style.display = item.getAttribute('data-name').toLowerCase().includes(term) ? 'flex' : 'none';
                });
            });
        });
    }

    if (window.lucide) window.lucide.createIcons({ root: el });
}

// ── Memory Page ───────────────────────────────────────────────────────────────
function renderMemoryPage(container) {
    const el = container.querySelector('#tab-memory');
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = '1';

    const memories = [
        { id: 1, text: 'Prefers concise, bullet-pointed responses over long paragraphs.', ts: '2 hours ago', source: 'Auto' },
        { id: 2, text: 'Working on a Tauri-based AI agent framework with a Vite frontend.', ts: '1 day ago', source: 'Auto' },
        { id: 3, text: 'Dislikes boilerplate — always wants minimal, clean code.', ts: '3 days ago', source: 'Manual' },
        { id: 4, text: 'Timezone: IST (UTC+5:30)', ts: '5 days ago', source: 'Auto' },
        { id: 5, text: 'Prefers dark mode in all UI suggestions.', ts: '1 week ago', source: 'Manual' },
    ];

    el.innerHTML = `
        <div class="page-panel">
            <div class="page-panel-header">
                <div>
                    <h2 class="page-title">Memory</h2>
                    <p class="page-subtitle">Facts and preferences Cognetic has learned about you across conversations.</p>
                </div>
                <div style="display:flex; gap:10px; align-items:center;">
                    <button class="btn-secondary" id="clear-memory-btn">
                        <i data-lucide="trash-2" class="icon-svg sm"></i> Clear All
                    </button>
                    <button class="btn-primary" id="add-memory-btn">
                        <i data-lucide="plus" class="icon-svg sm"></i> Add Memory
                    </button>
                </div>
            </div>

            <div class="memory-stats-row">
                <div class="memory-stat-card">
                    <div class="memory-stat-value">${memories.length}</div>
                    <div class="memory-stat-label">Total Memories</div>
                </div>
                <div class="memory-stat-card">
                    <div class="memory-stat-value">${memories.filter(m => m.source === 'Auto').length}</div>
                    <div class="memory-stat-label">Auto-captured</div>
                </div>
                <div class="memory-stat-card">
                    <div class="memory-stat-value">${memories.filter(m => m.source === 'Manual').length}</div>
                    <div class="memory-stat-label">Manual</div>
                </div>
                <div class="memory-stat-card">
                    <label class="toggle-pill" style="margin:0;">
                        <input type="checkbox" checked />
                        <span class="pill-track"></span>
                    </label>
                    <div class="memory-stat-label" style="margin-top:6px;">Auto-Learn</div>
                </div>
            </div>

            <div class="memory-list" id="memory-list">
                ${memories.map(m => `
                    <div class="memory-item" data-id="${m.id}">
                        <div class="memory-item-left">
                            <div class="memory-source-badge ${m.source === 'Auto' ? 'badge-auto' : 'badge-manual'}">${m.source}</div>
                            <p class="memory-text">${m.text}</p>
                        </div>
                        <div class="memory-item-right">
                            <span class="memory-ts">${m.ts}</span>
                            <div class="memory-actions">
                                <button class="icon-btn edit-memory-btn" title="Edit"><i data-lucide="edit-2" class="icon-svg sm"></i></button>
                                <button class="icon-btn delete-btn delete-memory-btn" title="Delete"><i data-lucide="trash-2" class="icon-svg sm"></i></button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="memory-add-panel" id="memory-add-panel" style="display:none;">
                <textarea class="memory-textarea" placeholder="Type a new memory or fact about yourself..." id="new-memory-input" rows="3"></textarea>
                <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
                    <button class="btn-secondary" id="cancel-memory-btn">Cancel</button>
                    <button class="btn-primary" id="save-memory-btn"><i data-lucide="check" class="icon-svg sm"></i> Save</button>
                </div>
            </div>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons({ root: el });

    // Add memory toggle
    el.querySelector('#add-memory-btn')?.addEventListener('click', () => {
        el.querySelector('#memory-add-panel').style.display = 'block';
        el.querySelector('#new-memory-input')?.focus();
    });
    el.querySelector('#cancel-memory-btn')?.addEventListener('click', () => {
        el.querySelector('#memory-add-panel').style.display = 'none';
    });
    el.querySelector('#save-memory-btn')?.addEventListener('click', () => {
        const val = el.querySelector('#new-memory-input')?.value.trim();
        if (!val) return;
        const list = el.querySelector('#memory-list');
        const item = document.createElement('div');
        item.className = 'memory-item';
        item.innerHTML = `
            <div class="memory-item-left">
                <div class="memory-source-badge badge-manual">Manual</div>
                <p class="memory-text">${val}</p>
            </div>
            <div class="memory-item-right">
                <span class="memory-ts">just now</span>
                <div class="memory-actions">
                    <button class="icon-btn delete-btn delete-memory-btn" title="Delete"><i data-lucide="trash-2" class="icon-svg sm"></i></button>
                </div>
            </div>
        `;
        list.prepend(item);
        if (window.lucide) window.lucide.createIcons({ root: item });
        el.querySelector('#memory-add-panel').style.display = 'none';
        el.querySelector('#new-memory-input').value = '';
    });

    // Delete
    el.querySelector('#memory-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-memory-btn');
        if (btn) btn.closest('.memory-item')?.remove();
    });
}


function setupConfigPage(container) {
    const iterInput = container.querySelector('#config-max-iterations');
    if (!iterInput) return;
    
    // Load initial
    const state = stateManager.getState();
    if (state.agentSettings && state.agentSettings.maxIterations) {
        iterInput.value = state.agentSettings.maxIterations;
    }
    
    // Save on change
    iterInput.addEventListener('change', () => {
        let val = parseInt(iterInput.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 100) val = 100;
        iterInput.value = val;
        
        stateManager.state.agentSettings = stateManager.state.agentSettings || {};
        stateManager.state.agentSettings.maxIterations = val;
        stateManager.saveState();
    });

    // Image Compression Settings
    const imgSmallInput = container.querySelector('#config-img-small-threshold');
    const imgMidInput = container.querySelector('#config-img-mid-cap');
    const imgLargeInput = container.querySelector('#config-img-large-threshold');
    const imgMaxInput = container.querySelector('#config-img-max-cap');

    if (imgSmallInput && imgMidInput && imgLargeInput && imgMaxInput) {
        if (state.agentSettings && state.agentSettings.imageCompression) {
            const comp = state.agentSettings.imageCompression;
            imgSmallInput.value = comp.smallThreshold || 500;
            imgMidInput.value = comp.midCap || 499;
            imgLargeInput.value = comp.largeThreshold || 1000;
            imgMaxInput.value = comp.maxCap || 650;
        }

        const updateImageCompression = () => {
            stateManager.state.agentSettings = stateManager.state.agentSettings || {};
            stateManager.state.agentSettings.imageCompression = {
                smallThreshold: parseInt(imgSmallInput.value, 10) || 500,
                midCap: parseInt(imgMidInput.value, 10) || 499,
                largeThreshold: parseInt(imgLargeInput.value, 10) || 1000,
                maxCap: parseInt(imgMaxInput.value, 10) || 650
            };
            stateManager.saveState();
        };

        imgSmallInput.addEventListener('change', updateImageCompression);
        imgMidInput.addEventListener('change', updateImageCompression);
        imgLargeInput.addEventListener('change', updateImageCompression);
        imgMaxInput.addEventListener('change', updateImageCompression);
    }
}
