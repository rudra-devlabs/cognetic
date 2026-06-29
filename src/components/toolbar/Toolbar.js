import toolbarHtml from './Toolbar.html?raw';
import './Toolbar.css';

export function renderToolbar(container) {
    container.innerHTML = toolbarHtml;
    
    // Toggle sidebar logic
    const toggleBtn = container.querySelector('#sidebar-toggle-btn');
    if(toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
            
            // Update icon
            if(isCollapsed) {
                toggleBtn.innerHTML = '<i data-lucide="chevron-right" class="icon-svg sm"></i>';
            } else {
                toggleBtn.innerHTML = '<i data-lucide="chevron-left" class="icon-svg sm"></i>';
            }
            
            // Re-render lucide icon
            if(window.lucide) {
                window.lucide.createIcons({
                    root: toggleBtn
                });
            }
        });
    }

    // Settings button logic
    const settingsBtn = container.querySelector('#toolbar-settings-btn');
    if(settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if(window.router) {
                window.router.navigate('agents');
            }
        });
    }
}
