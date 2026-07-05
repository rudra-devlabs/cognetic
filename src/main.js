import './global.css';
import { router } from './core/router.js';
import { stateManager } from './core/state.js';
import { renderToolbar } from './components/toolbar/Toolbar.js';
import { renderHome } from './views/home/Home.js';
import { renderAgents } from './views/agents/Agents.js';
import { renderChannels } from './views/channels/Channels.js';
import { renderConnectors } from './views/connectors/Connectors.js';
import { renderBrowser } from './views/browser/Browser.js';
import { renderSettings } from './views/settings/Settings.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load persisted state from the native filesystem before rendering any view.
    //    This replaces the old synchronous localStorage approach and has no size limit.
    await stateManager.init();
    
    // Apply initial theme, accent, font, and scale
    const state = stateManager.getState();
    const theme = state.theme || 'dark';
    const accent = state.accent || 'blue';
    const font = state.font || 'inter';
    const scale = state.scale || '100';
    
    document.body.setAttribute('data-theme', theme);
    document.body.setAttribute('data-accent', accent);
    document.body.setAttribute('data-font', font);
    if (scale !== '100') document.documentElement.style.fontSize = `${scale}%`;

    // 2. Render Toolbar
    const toolbarContainer = document.getElementById('toolbar-container');
    if(toolbarContainer) {
        renderToolbar(toolbarContainer);
    }
    
    // 3. Setup Router
    router.addRoute('home', renderHome);
    router.addRoute('agents', renderAgents);
    router.addRoute('channels', renderChannels);
    router.addRoute('connectors', renderConnectors);
    router.addRoute('browser', renderBrowser);
    router.addRoute('settings', renderSettings);
    
    // 4. Start app on Home
    router.navigate('home');
});
