import settingsHtml from './Settings.html?raw';
import './Settings.css';
import { stateManager } from '../../core/state.js';


function setupDropdown(container, id, onChange) {
    const dropdown = container.querySelector('#' + id);
    if (!dropdown) return;
    
    const selectedText = dropdown.querySelector('.selected-text');
    const trigger = dropdown.querySelector('.dropdown-selected');
    
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        container.querySelectorAll('.custom-dropdown.open').forEach(el => {
            if (el !== dropdown) el.classList.remove('open');
        });
        dropdown.classList.toggle('open');
    });

    dropdown.querySelectorAll('.dropdown-option').forEach(option => {
        option.addEventListener('click', () => {
            const val = option.dataset.value;
            dropdown.dataset.value = val;
            selectedText.textContent = option.textContent;
            dropdown.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            dropdown.classList.remove('open');
            if (onChange) onChange(val);
        });
    });
}

export function renderSettings(container) {
    container.innerHTML = settingsHtml;

    container.addEventListener('click', (e) => {
        container.querySelectorAll('.custom-dropdown.open').forEach(dropdownEl => {
            if (!dropdownEl.contains(e.target)) {
                dropdownEl.classList.remove('open');
            }
        });
    });


    // Navigation
    const backBtn = container.querySelector('#settings-back-btn');
    const homeBtn = container.querySelector('#settings-home-btn');
    if (backBtn) backBtn.addEventListener('click', () => window.router.navigate('home'));
    if (homeBtn) homeBtn.addEventListener('click', () => window.router.navigate('home'));

    const navMap = {
        'nav-st-webagents-tab': 'webagents',
        'nav-st-integrations-tab': 'integrations',
        'nav-st-agents-tab': 'agents',
        'nav-st-channels-tab': 'channels',
        'nav-st-connectors-tab': 'connectors',
        'nav-st-browser-tab': 'browser',
    };
    Object.entries(navMap).forEach(([id, route]) => {
        const btn = container.querySelector(`#${id}`);
        if (btn) btn.addEventListener('click', () => {
            if (route === 'integrations') {
                window.cogneticOpenIntegrations = true;
                window.router.navigate('agents');
            } else if (route === 'webagents') {
                window.cogneticOpenWebAgents = true;
                window.router.navigate('agents');
            } else {
                window.router.navigate(route);
            }
        });
    });

    // Sidebar tab switching
    const stTabs = container.querySelectorAll('.st-tab');
    const stPanels = container.querySelectorAll('.st-panel');
    stTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            stTabs.forEach(t => t.classList.remove('active'));
            stPanels.forEach(p => p.classList.remove('active-panel'));
            tab.classList.add('active');
            const panel = container.querySelector(`#st-${tab.dataset.tab}`);
            if (panel) {
                panel.classList.add('active-panel');
                if (window.lucide) window.lucide.createIcons({ root: panel });
            }
        });
    });

    

    // Theme picker
    const currentState = stateManager ? stateManager.getState() : {};
    const currentTheme = currentState.theme || 'dark';
    const currentAccent = currentState.accent || 'blue';

    container.querySelectorAll('.theme-option').forEach(option => {
        if (option.dataset.theme === currentTheme) {
            container.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
            option.classList.add('active');
        }
        option.addEventListener('click', () => {
            container.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
            option.classList.add('active');
            const newTheme = option.dataset.theme;
            document.body.setAttribute('data-theme', newTheme);
            if (stateManager) {
                stateManager.updateState({ theme: newTheme });
            }
        });
    });

    // Accent color picker
    container.querySelectorAll('.accent-swatch').forEach(swatch => {
        if (swatch.dataset.accent === currentAccent) {
            container.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
        }
        swatch.addEventListener('click', () => {
            container.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            const newAccent = swatch.dataset.accent;
            document.body.setAttribute('data-accent', newAccent);
            if (stateManager) {
                stateManager.updateState({ accent: newAccent });
            }
        });
    });

    // Typography
    setupDropdown(container, 'app-font', (val) => {
        document.body.setAttribute('data-font', val);
        if (stateManager) stateManager.updateState({ font: val });
    });

    setupDropdown(container, 'app-scale', (val) => {
        document.documentElement.style.fontSize = val === '100' ? '' : `${val}%`;
        if (stateManager) stateManager.updateState({ scale: val });
    });

    // Check for updates button
    const checkUpdatesBtn = container.querySelector('#check-updates-btn');
    if (checkUpdatesBtn) {
        checkUpdatesBtn.addEventListener('click', () => {
            const orig = checkUpdatesBtn.innerHTML;
            checkUpdatesBtn.innerHTML = '<i data-lucide="loader" class="icon-svg sm spin"></i> Checking...';
            if (window.lucide) window.lucide.createIcons({ root: checkUpdatesBtn });
            setTimeout(() => {
                checkUpdatesBtn.innerHTML = '<i data-lucide="check-circle-2" class="icon-svg sm"></i> Up to date!';
                if (window.lucide) window.lucide.createIcons({ root: checkUpdatesBtn });
                setTimeout(() => {
                    checkUpdatesBtn.innerHTML = orig;
                    if (window.lucide) window.lucide.createIcons({ root: checkUpdatesBtn });
                }, 2500);
            }, 1500);
        });
    }

    // Danger zone buttons
    const dangerBtns = container.querySelectorAll('.btn-danger, .btn-danger-outline');
    dangerBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.textContent.trim();
            if (confirm(`Are you sure you want to: ${action}? This cannot be undone.`)) {
                btn.innerHTML = '<i data-lucide="check" class="icon-svg sm"></i> Done!';
                if (window.lucide) window.lucide.createIcons({ root: btn });
                setTimeout(() => { btn.innerHTML = action; }, 2000);
            }
        });
    });

    // Save buttons feedback
    container.querySelectorAll('.btn-primary').forEach(btn => {
        if (btn.id === 'check-updates-btn') return;
        btn.addEventListener('click', () => {
            const orig = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="check" class="icon-svg sm"></i> Saved!';
            btn.style.background = '#4ade80';
            btn.style.borderColor = '#4ade80';
            btn.style.color = '#000';
            if (window.lucide) window.lucide.createIcons({ root: btn });
            setTimeout(() => {
                btn.innerHTML = orig;
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.style.color = '';
                if (window.lucide) window.lucide.createIcons({ root: btn });
            }, 2000);
        });
    });

    // ── Browser-CDP Bridge ──────────────────────────────────────────
    setupCdpBridge(container);

    if (window.lucide) window.lucide.createIcons({ root: container.querySelector('.view-settings') });
}

function setupCdpBridge(container) {
    const launchBtn = container.querySelector('#cdp-launch-btn');
    const newchatBtn = container.querySelector('#cdp-newchat-btn');
    const stopBtn = container.querySelector('#cdp-stop-btn');
    const statusPill = container.querySelector('#cdp-status-pill');
    const statusText = container.querySelector('#cdp-status-text');

    const setStatus = (state) => {
        if (!statusPill || !statusText) return;
        statusPill.classList.remove('connected', 'launching', 'disconnected');
        if (state === 'connected') {
            statusPill.classList.add('connected');
            statusText.textContent = 'Connected';
            if (launchBtn) launchBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            if (newchatBtn) newchatBtn.disabled = false;
        } else if (state === 'launching') {
            statusPill.classList.add('launching');
            statusText.textContent = 'Launching…';
            if (launchBtn) launchBtn.disabled = true;
        } else {
            statusPill.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
            if (launchBtn) launchBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
            if (newchatBtn) newchatBtn.disabled = true;
        }
    };

    setStatus('disconnected');

    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            try {
                setStatus('launching');
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('start_aistudio_bridge');
            } catch (err) {
                setStatus('disconnected');
                alert(`Failed to launch bridge: ${err.message || err}`);
            }
        });
    }

    if (newchatBtn) {
        newchatBtn.addEventListener('click', async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('new_aistudio_chat');
            } catch (err) {
                alert(`Failed to start new chat: ${err.message || err}`);
            }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('stop_bridge');
            } catch (err) {
                console.error('Stop bridge failed:', err);
            }
        });
    }

    // Listen to bridge lifecycle events
    import('@tauri-apps/api/event').then(({ listen }) => {
        listen('dbcp-ready', () => setStatus('connected'));
        listen('dbcp-stopped', () => setStatus('disconnected'));
        listen('dbcp-status', (e) => {
            const s = e.payload;
            if (s === 'connected') setStatus('connected');
            else if (s === 'launching') setStatus('launching');
            else setStatus('disconnected');
        });
    }).catch(err => console.error('Failed to register bridge event listeners:', err));
}
