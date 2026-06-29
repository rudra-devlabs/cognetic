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
