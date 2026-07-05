import channelsHtml from './Channels.html?raw';
import './Channels.css';

export function renderChannels(container) {
    container.innerHTML = channelsHtml;

    // Back button
    const backBtn = container.querySelector('#channels-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => window.router.navigate('home'));

    // Home button
    const homeBtn = container.querySelector('#channels-home-btn');
    if (homeBtn) homeBtn.addEventListener('click', () => window.router.navigate('home'));

    // Nav tab routing to other views
    const navMap = {
        'nav-channels-webagents-tab': 'webagents',
        'nav-channels-integrations-tab': 'integrations',
        'nav-channels-agents-tab': 'agents',
        'nav-channels-connectors-tab': 'connectors',
        'nav-channels-browser-tab': 'browser',
        'nav-channels-settings-tab': 'settings',
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
    const chTabs = container.querySelectorAll('.ch-tab');
    const chPanels = container.querySelectorAll('.ch-panel');

    chTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            chTabs.forEach(t => t.classList.remove('active'));
            chPanels.forEach(p => p.classList.remove('active-panel'));
            tab.classList.add('active');
            const panel = container.querySelector(`#ch-${tab.dataset.tab}`);
            if (panel) panel.classList.add('active-panel');
            if (window.lucide) window.lucide.createIcons({ root: panel });
        });
    });

    // Toggle switches
    container.querySelectorAll('.toggle-switch').forEach(toggle => {
        toggle.addEventListener('click', () => toggle.classList.toggle('active'));
    });

    // Toggle password visibility
    container.querySelectorAll('.toggle-visibility').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.closest('.modern-input-wrapper')?.querySelector('input');
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.innerHTML = isPassword
                ? '<i data-lucide="eye-off" class="icon-svg sm"></i>'
                : '<i data-lucide="eye" class="icon-svg sm"></i>';
            if (window.lucide) window.lucide.createIcons({ root: btn });
        });
    });

    // Custom dropdowns
    const initCustomDropdown = (dropdownEl) => {
        if (!dropdownEl) return;
        const selected = dropdownEl.querySelector('.dropdown-selected');
        const optionsContainer = dropdownEl.querySelector('.dropdown-options');
        const textSpan = dropdownEl.querySelector('.selected-text');

        if (!selected || !optionsContainer || !textSpan) return;

        const closeDropdown = () => {
            dropdownEl.classList.remove('open');
            selected.setAttribute('aria-expanded', 'false');
        };

        const openDropdown = () => {
            container.querySelectorAll('.custom-dropdown.open').forEach(el => {
                if (el !== dropdownEl) {
                    const trigger = el.querySelector('.dropdown-selected');
                    el.classList.remove('open');
                    if (trigger) trigger.setAttribute('aria-expanded', 'false');
                }
            });
            dropdownEl.classList.add('open');
            selected.setAttribute('aria-expanded', 'true');
        };

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdownEl.classList.contains('open')) {
                closeDropdown();
            } else {
                openDropdown();
            }
        });

        selected.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (dropdownEl.classList.contains('open')) {
                    closeDropdown();
                } else {
                    openDropdown();
                }
            }
            if (e.key === 'Escape') {
                closeDropdown();
            }
        });

        optionsContainer.addEventListener('click', (e) => {
            const opt = e.target.closest('.dropdown-option');
            if (!opt) return;

            const val = opt.getAttribute('data-value') || '';
            textSpan.textContent = opt.textContent || '';
            dropdownEl.setAttribute('data-value', val);
            optionsContainer.querySelectorAll('.dropdown-option').forEach(o => {
                const isSelected = o === opt;
                o.classList.toggle('selected', isSelected);
                o.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
            closeDropdown();
        });
    };

    container.querySelectorAll('.custom-dropdown').forEach(initCustomDropdown);

    container.addEventListener('click', (e) => {
        container.querySelectorAll('.custom-dropdown.open').forEach(dropdownEl => {
            if (!dropdownEl.contains(e.target)) {
                dropdownEl.classList.remove('open');
                dropdownEl.querySelector('.dropdown-selected')?.setAttribute('aria-expanded', 'false');
            }
        });
    });

    // Copy webhook URL
    const copyBtn = container.querySelector('#copy-webhook-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const urlText = container.querySelector('#webhook-url-text');
            if (urlText) {
                navigator.clipboard.writeText(urlText.textContent).then(() => {
                    copyBtn.innerHTML = '<i data-lucide="check" class="icon-svg sm"></i> Copied!';
                    if (window.lucide) window.lucide.createIcons({ root: copyBtn });
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i data-lucide="copy" class="icon-svg sm"></i> Copy';
                        if (window.lucide) window.lucide.createIcons({ root: copyBtn });
                    }, 2000);
                });
            }
        });
    }

    // Test connection buttons — show a toast-style notification
    container.querySelectorAll('.btn-test').forEach(btn => {
        btn.addEventListener('click', () => {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader" class="icon-svg sm spin"></i> Testing...';
            if (window.lucide) window.lucide.createIcons({ root: btn });
            setTimeout(() => {
                btn.innerHTML = '<i data-lucide="check-circle-2" class="icon-svg sm"></i> Connected!';
                btn.style.color = '#4ade80';
                btn.style.borderColor = 'rgba(74, 222, 128, 0.4)';
                if (window.lucide) window.lucide.createIcons({ root: btn });
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.style.color = '';
                    btn.style.borderColor = '';
                    if (window.lucide) window.lucide.createIcons({ root: btn });
                }, 2500);
            }, 1500);
        });
    });

    // Init Lucide icons
    if (window.lucide) window.lucide.createIcons({ root: container.querySelector('.view-channels') });
}
