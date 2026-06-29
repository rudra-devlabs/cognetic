import './global.css';
import { router } from './core/router.js';
import { renderToolbar } from './components/toolbar/Toolbar.js';
import { renderHome } from './views/home/Home.js';
import { renderAgents } from './views/agents/Agents.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Render Toolbar
    const toolbarContainer = document.getElementById('toolbar-container');
    if(toolbarContainer) {
        renderToolbar(toolbarContainer);
    }
    
    // 2. Setup Router
    router.addRoute('home', renderHome);
    router.addRoute('agents', renderAgents);
    
    // 3. Start app on Home
    router.navigate('home');
});
