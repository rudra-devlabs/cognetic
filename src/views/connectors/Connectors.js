import connectorsHtml from './Connectors.html?raw';
import './Connectors.css';

export function renderConnectors(container) {
    container.innerHTML = connectorsHtml;

    // ── Top-nav navigation ────────────────────────────────────────────────
    const backBtn = container.querySelector('#connectors-back-btn');
    const homeBtn = container.querySelector('#connectors-home-btn');
    if (backBtn) backBtn.addEventListener('click', () => window.router.navigate('home'));
    if (homeBtn) homeBtn.addEventListener('click', () => window.router.navigate('home'));

    const navMap = {
        'nav-conn-webagents-tab': 'webagents',
        'nav-conn-integrations-tab': 'integrations',
        'nav-conn-agents-tab':   'agents',
        'nav-conn-channels-tab': 'channels',
        'nav-conn-browser-tab':  'browser',
        'nav-conn-settings-tab': 'settings',
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

    // ── Sidebar tab switching ─────────────────────────────────────────────
    const cnTabs   = container.querySelectorAll('.cn-tab');
    const cnPanels = container.querySelectorAll('.cn-panel');

    cnTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            cnTabs.forEach(t => t.classList.remove('active'));
            cnPanels.forEach(p => p.classList.remove('active-panel'));
            tab.classList.add('active');
            const panel = container.querySelector(`#cn-${tab.dataset.tab}`);
            if (panel) {
                panel.classList.add('active-panel');
                if (window.lucide) window.lucide.createIcons({ root: panel });
            }
        });
    });

    // ── Chip groups (db type, vector provider, mq type) ──────────────────
    container.querySelectorAll('.cn-chip-row').forEach(group => {
        group.querySelectorAll('.cn-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                group.querySelectorAll('.cn-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
            });
        });
    });

    // ── Toggle switches ───────────────────────────────────────────────────
    container.querySelectorAll('.toggle-switch').forEach(toggle => {
        toggle.addEventListener('click', () => toggle.classList.toggle('active'));
    });

    // ── Password visibility toggles ───────────────────────────────────────
    container.querySelectorAll('.toggle-visibility').forEach(btn => {
        btn.addEventListener('click', () => {
            // Find the nearest input inside the same .cn-input-row
            const row   = btn.closest('.cn-input-row');
            const input = row ? row.querySelector('input') : null;
            if (!input) return;

            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.innerHTML = isPassword
                ? '<i data-lucide="eye-off" class="icon-svg sm"></i>'
                : '<i data-lucide="eye" class="icon-svg sm"></i>';
            if (window.lucide) window.lucide.createIcons({ root: btn });
        });
    });

    // ── Test-connection buttons ───────────────────────────────────────────
    container.querySelectorAll('.cn-btn-test').forEach(btn => {
        btn.addEventListener('click', () => {
            const orig = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader" class="icon-svg sm spin"></i> Testing…';
            btn.disabled = true;
            if (window.lucide) window.lucide.createIcons({ root: btn });

            setTimeout(() => {
                btn.innerHTML = '<i data-lucide="check-circle-2" class="icon-svg sm"></i> Connected!';
                btn.style.color        = '#4ade80';
                btn.style.borderColor  = 'rgba(74,222,128,0.4)';
                btn.style.background   = 'rgba(74,222,128,0.08)';
                btn.disabled = false;
                if (window.lucide) window.lucide.createIcons({ root: btn });

                setTimeout(() => {
                    btn.innerHTML = orig;
                    btn.style.color       = '';
                    btn.style.borderColor = '';
                    btn.style.background  = '';
                    if (window.lucide) window.lucide.createIcons({ root: btn });
                }, 2500);
            }, 1500);
        });
    });

    // ── Initial Lucide icon render ────────────────────────────────────────
    const root = container.querySelector('.view-connectors');
    if (window.lucide && root) window.lucide.createIcons({ root });
}
