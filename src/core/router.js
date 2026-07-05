import { renderToolbar } from '../components/toolbar/Toolbar.js';

class Router {
    constructor(rootElement) {
        this.root = rootElement;
        this.routes = {};
        this.currentView = null;
    }

    addRoute(name, renderFunction) {
        this.routes[name] = renderFunction;
    }

    navigate(name) {
        if (!this.routes[name]) {
            console.error(`Route ${name} not found`);
            return;
        }

        // Manage toolbar: only show on home route, hide everywhere else
        const toolbarContainer = document.getElementById('toolbar-container');
        if (toolbarContainer) {
            if (name === 'home') {
                // Re-render toolbar if it was cleared
                if (!toolbarContainer.querySelector('#toolbar')) {
                    renderToolbar(toolbarContainer);
                }
            } else {
                toolbarContainer.innerHTML = '';
            }
        }

        // Clear current view
        this.root.innerHTML = '';
        
        // Render new view
        this.currentView = name;
        document.body.setAttribute('data-view', name);
        this.routes[name](this.root);
        
        // Re-initialize icons for the new DOM elements
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}

export const router = new Router(document.getElementById('app'));
window.router = router; // Expose globally for easy access in templates
