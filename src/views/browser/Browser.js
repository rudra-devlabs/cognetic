import browserHtml from './Browser.html?raw';
import './Browser.css';

export function renderBrowser(container) {
    container.innerHTML = browserHtml;

    // Navigation
    const backBtn = container.querySelector('#browser-back-btn');
    const homeBtn = container.querySelector('#browser-home-btn');
    if (backBtn) backBtn.addEventListener('click', () => window.router.navigate('home'));
    if (homeBtn) homeBtn.addEventListener('click', () => window.router.navigate('home'));

    const navMap = {
        'nav-br-integrations-tab': 'integrations',
        'nav-br-agents-tab': 'agents',
        'nav-br-channels-tab': 'channels',
        'nav-br-connectors-tab': 'connectors',
        'nav-br-settings-tab': 'settings',
    };
    Object.entries(navMap).forEach(([id, route]) => {
        const btn = container.querySelector(`#${id}`);
        if (btn) btn.addEventListener('click', () => {
            if (route === 'integrations') {
                window.cogneticOpenIntegrations = true;
                window.router.navigate('agents');
            } else {
                window.router.navigate(route);
            }
        });
    });

    // Sidebar tab switching
    const brTabs = container.querySelectorAll('.br-tab');
    const brPanels = container.querySelectorAll('.br-panel');
    brTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            brTabs.forEach(t => t.classList.remove('active'));
            brPanels.forEach(p => p.classList.remove('active-panel'));
            tab.classList.add('active');
            const panel = container.querySelector(`#br-${tab.dataset.tab}`);
            if (panel) {
                panel.classList.add('active-panel');
                if (window.lucide) window.lucide.createIcons({ root: panel });
            }
        });
    });

    // Toggle switches
    container.querySelectorAll('.toggle-switch').forEach(toggle => {
        toggle.addEventListener('click', () => toggle.classList.toggle('active'));
    });

    // Engine selector updates pill label
    const engineSelect = container.querySelector('#browser-engine');
    const engineLabel = container.querySelector('#browser-engine-label');
    if (engineSelect && engineLabel) {
        engineSelect.addEventListener('change', () => {
            const opts = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' };
            engineLabel.textContent = opts[engineSelect.value] || engineSelect.value;
        });
    }

    // Test launch button
    const testBtn = container.querySelector('#browser-test-btn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            const orig = testBtn.innerHTML;
            testBtn.innerHTML = '<i data-lucide="loader" class="icon-svg sm spin"></i> Launching...';
            if (window.lucide) window.lucide.createIcons({ root: testBtn });
            setTimeout(() => {
                testBtn.innerHTML = '<i data-lucide="check-circle-2" class="icon-svg sm"></i> Success!';
                testBtn.style.color = '#4ade80';
                testBtn.style.borderColor = 'rgba(74, 222, 128, 0.4)';
                if (window.lucide) window.lucide.createIcons({ root: testBtn });
                setTimeout(() => {
                    testBtn.innerHTML = orig;
                    testBtn.style.color = '';
                    testBtn.style.borderColor = '';
                    if (window.lucide) window.lucide.createIcons({ root: testBtn });
                }, 2500);
            }, 1800);
        });
    }

    // New session button
    const newSessBtn = container.querySelector('.new-session-btn');
    if (newSessBtn) {
        newSessBtn.addEventListener('click', () => {
            const name = prompt('Session name:', 'New Session');
            if (!name) return;
            const list = container.querySelector('.sessions-list');
            const card = document.createElement('div');
            card.className = 'session-card';
            card.innerHTML = `
                <div class="session-icon"><i data-lucide="globe" class="icon-svg"></i></div>
                <div class="session-info">
                    <div class="session-name">${name}</div>
                    <div class="session-meta">Just created · 0 cookies</div>
                </div>
                <div class="session-status idle">Idle</div>
                <div class="session-actions">
                    <button class="icon-action-btn" title="Resume"><i data-lucide="play" class="icon-svg sm"></i></button>
                    <button class="icon-action-btn" title="Delete"><i data-lucide="trash-2" class="icon-svg sm"></i></button>
                </div>
            `;
            list.insertBefore(card, newSessBtn);
            if (window.lucide) window.lucide.createIcons({ root: card });
        });
    }

    if (window.lucide) window.lucide.createIcons({ root: container.querySelector('.view-browser') });
}
